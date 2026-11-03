// Malíkova hádanka o odznak AS Trenčín.
// POST /api/hra {action:'start', did}            -> {id, q} | {closed} | {used}
// POST /api/hra {action:'answer', id, a}         -> {win, code} | {win:false, right}
// POST /api/hra {action:'claim', code, ...údaje} -> {ok}
// Údaje sú v KV (väzba FORMS). Limit: MAX_WINS výhercov za deň, 1 pokus na zariadenie/IP za deň.
import { json, notify } from '../../lib/cf-util.js';

const MAX_WINS = 2;
const LIMIT_MS = 7000 + 2500; // 7 s na odpoveď + rezerva na pripojenie

// a: prijaté odpovede (bez diakritiky, malé písmená)
const RIDDLES = [
  // Ťažké otázky – všetky odpovede overené v štatistikách SZFB (szfb.sk, statistiky.szfb.sk).
  // Staré otázky (pravidlá IFF, MS, prvé kolá 2026/27) boli odstránené – už sa hrali.
  { q: 'Koľko gólov strelil Juraj Matejka v extralige mužov v sezóne 2021/22?', a: ['44'] },
  { q: 'Koľko kanadských bodov mal Juraj Matejka v extralige 2022/23?', a: ['52'] },
  { q: 'Koľko bodov nazbieral Juraj Matejka v základnej časti extraligy 2019/20?', a: ['48'] },
  { q: 'Koľko asistencií mal Juraj Matejka v základnej časti extraligy 2014/15?', a: ['38'] },
  { q: 'Za ktorý klub hral Juraj Matejka extraligu v sezóne 2013/14? Stačí mesto.', a: ['nova dubnica', 'dubnica', 'victory stars', 'novej dubnici', 'nova dubnica victory stars'] },
  { q: 'Na ktorom mieste skončili muži AS Trenčín v extralige 2019/20?', a: ['9', 'deviatom', 'devatom', '9 miesto', 'deviate'] },
  { q: 'Koľko bodov mal Samuel Dávidek v play-off 2. ligy Západ 2018/19?', a: ['29'] },
  { q: 'Koľko gólov dal Timotej Kollár na Majstrovstvách Slovenska dorastencov 2022/23?', a: ['13'] },
  { q: 'Koľko gólov strelil Marek Meliš na MSR starších žiakov 2022/23?', a: ['12'] },
  { q: 'Koľko gólov dal Michal Daranský na MSR starších žiakov 2023/24?', a: ['9', 'devat'] },
  { q: 'Koľko gólov strelil Šimon Hošták v Lige starších žiakov Západ 2023/24?', a: ['25'] },
  { q: 'Koľko bodov mal Erik Vojtek v kvalifikácii na MS 3v3 v sezóne 2025/26?', a: ['23'] },
  { q: 'Koľko gólov dal Patrik Zverbik v kvalifikácii na MS 3v3 v sezóne 2025/26?', a: ['12'] },
  { q: 'Koľko bodov mal Juraj Matejka v kvalifikácii na MS 3v3 v sezóne 2025/26?', a: ['16'] },
  { q: 'Koľko zákrokov urobil Adam Líška v extralige mužov 2025/26?', a: ['301'] },
  { q: 'Koľko gólov dostal Adam Líška v extralige mužov 2025/26?', a: ['131'] },
  { q: 'Koľko zákrokov mal Denis Šlosár v extralige juniorov 2023/24?', a: ['260'] },
  { q: 'Koľko zákrokov mal Tomáš Eštok v zápase v Žiline 9. 10. 2026?', a: ['33'] },
  { q: 'Koľko zákrokov mal Dominik Slušný pri výhre dorastencov 13:1 nad Dubnicou?', a: ['10', 'desat'] },
  { q: 'Koľko gólov dal Timotej Kollár na MS juniorov 2025?', a: ['3', 'tri'] },
  { q: 'Koľko kanadských bodov mal Matúš Malík na MS juniorov 2025?', a: ['4', 'styri'] },
  { q: 'Koľko bodov mal Peter Bednár na turnaji Polish Cup U19 2023?', a: ['4', 'styri'] },
  { q: 'Koľko gólov strelil Tomáš Huňa za Dubnicu na MSR starších žiakov 2022/23?', a: ['10', 'desat'] },
  { q: 'Koľko bodov mal Tomáš Kordoš na MSR dorastencov 2025/26?', a: ['6', 'sest'] },
  { q: 'Koľko gólov dal Lukáš Kráľ za AS Trenčín na Pohári SZFB 2021?', a: ['2', 'dva', 'dve'] },
  { q: 'Koľko gólov strelil Šimon Hošták na turnaji mládeže mladších žiakov 2021/22?', a: ['10', 'desat'] },
  // Ďalších 100 ťažkých otázok – vygenerované zo štatistík SZFB (profily hráčov 2020/21–2025/26, statistiky.szfb.sk 2014/15–2019/20)
  { q: "Koľko gólov strelil Matej Zverbík v Lige dorastencov Západ 2025/26?", a: ["11"] },
  { q: "Koľko kanadských bodov mal Adam Daniš v 2. lige mužov Západ 2025/26?", a: ["47"] },
  { q: "Koľko zápasov odohral Dominik Kútik v Lige starších žiakov Západ 2021/22?", a: ["12"] },
  { q: "Koľko gólov strelil Nicolas Pasqualon v Lige juniorov Stred 2023/24?", a: ["20"] },
  { q: "Koľko gólov strelil Matej Zverbík v Lige starších žiakov Západ 2021/22?", a: ["10", "desat"] },
  { q: "Koľko gólov strelil Timotej Kollár v extralige juniorov 2024/25?", a: ["25"] },
  { q: "Koľko gólov dostal brankár Marek Paulen v 1. lige mužov 2023/24?", a: ["110"] },
  { q: "Koľko gólov strelil Samuel Dávidek v extralige mužov 2017/18 (základná časť)?", a: ["8", "osem"] },
  { q: "Koľko asistencií mal Timotej Kollár v extralige mužov 2025/26?", a: ["8", "osem"] },
  { q: "Koľko zápasov odohral Marek Oriešek v extralige juniorov 2021/22?", a: ["12"] },
  { q: "Koľko gólov strelil Marco Olekšák v 1. lige mužov 2025/26?", a: ["6", "sest"] },
  { q: "Koľko zápasov odohral Milan Kováč v 2. lige mužov Západ 2024/25?", a: ["26"] },
  { q: "Koľko asistencií mal Patrik Zverbik v Lige dorastencov Západ 2020/21?", a: ["6", "sest"] },
  { q: "Koľko zápasov odohral Juraj Matejka v extralige mužov 2024/25?", a: ["25"] },
  { q: "Koľko kanadských bodov mal Tomáš Huňa v Lige dorastencov Západ 2023/24?", a: ["33"] },
  { q: "Koľko kanadských bodov mal Samuel Dávidek v 2. lige mužov Západ 2014/15 (základná časť)?", a: ["16"] },
  { q: "Koľko kanadských bodov mal Frederik Hrušovský v 2. lige mužov Západ 2017/18 (základná časť)?", a: ["22"] },
  { q: "Koľko asistencií mal Šimon Oravec v extralige mužov 2025/26?", a: ["6", "sest"] },
  { q: "Koľko kanadských bodov mal Peter Bednár v Lige dorastencov Západ 2017/18?", a: ["11"] },
  { q: "Koľko kanadských bodov mal Oliver Klčo v Lige starších žiakov Západ 2021/22?", a: ["17"] },
  { q: "Koľko gólov dostal brankár Marek Paulen v 1. lige mužov 2025/26?", a: ["125"] },
  { q: "Koľko asistencií mal Jerguš Surma v 1. lige dorastencov (divízia Západ) 2023/24?", a: ["6", "sest"] },
  { q: "Koľko gólov strelil Lukáš Kráľ v Lige juniorov Západ 2015/16?", a: ["11"] },
  { q: "Koľko gólov strelil Marek Meliš v 1. lige dorastencov (divízia Západ) 2022/23?", a: ["6", "sest"] },
  { q: "Koľko gólov strelil Marek Oriešek v extralige juniorov 2022/23?", a: ["33"] },
  { q: "Koľko gólov strelil Juraj Matejka v 2. lige mužov Západ 2018/19 (play-off)?", a: ["10", "desat"] },
  { q: "Koľko gólov strelil Filip Vrana v 2. lige mužov Západ 2024/25?", a: ["11"] },
  { q: "Koľko zápasov odohral Šimon Ondrášik v extralige juniorov 2025/26?", a: ["30"] },
  { q: "Koľko kanadských bodov mal Marco Olekšák v Lige starších žiakov Západ 2022/23?", a: ["46"] },
  { q: "Koľko kanadských bodov mal Tomáš Huňa v 1. lige mužov 2025/26?", a: ["19"] },
  { q: "Koľko kanadských bodov mal Lukáš Kráľ v 1. lige mužov 2025/26?", a: ["45"] },
  { q: "Koľko asistencií mal Adam Daniš v 2. lige mužov Západ 2018/19 (základná časť)?", a: ["10", "desat"] },
  { q: "Koľko asistencií mal Oliver Klčo v 1. lige dorastencov (divízia Západ) 2025/26?", a: ["9", "devat"] },
  { q: "Koľko zápasov odohral Milan Kováč v 2. lige mužov Západ 2025/26?", a: ["26"] },
  { q: "Koľko kanadských bodov mal Adam Vácval v 2. lige mužov Západ 2024/25?", a: ["13"] },
  { q: "Koľko gólov strelil Patrik Zverbik v extralige juniorov 2022/23?", a: ["9", "devat"] },
  { q: "Koľko gólov strelil Samuel Dávidek v extralige mužov 2023/24?", a: ["11"] },
  { q: "Koľko kanadských bodov mal Lukáš Kráľ v 1. lige mužov 2018/19 (play-off)?", a: ["10", "desat"] },
  { q: "Koľko gólov strelil Šimon Oravec v Lige dorastencov Západ 2021/22?", a: ["9", "devat"] },
  { q: "Koľko gólov strelil Gabriel Královič v Lige dorastencov Západ 2019/20?", a: ["15"] },
  { q: "Koľko zápasov odohral Martin Žilinský v 2. lige mužov Západ 2023/24?", a: ["23"] },
  { q: "Koľko kanadských bodov mal Michal Fusi v Lige dorastencov Západ 2023/24?", a: ["15"] },
  { q: "Koľko zápasov odohral Peter Bednár v extralige mužov 2021/22?", a: ["16"] },
  { q: "Koľko kanadských bodov mal Dominik Kútik v Lige dorastencov Západ 2022/23?", a: ["18"] },
  { q: "Koľko kanadských bodov mal Jonáš Bagín v Lige juniorov Západ 2021/22?", a: ["12"] },
  { q: "Koľko zápasov odohral Peter Oravec v 2. lige mužov Západ 2025/26?", a: ["17"] },
  { q: "Koľko zápasov odohral Gabriel Královič v extralige mužov 2021/22?", a: ["20"] },
  { q: "Koľko asistencií mal Jakub Michalec v extralige juniorov 2017/18 (základná časť)?", a: ["9", "devat"] },
  { q: "Koľko asistencií mal Michal Daranský v 1. lige dorastencov (divízia Západ) 2023/24?", a: ["10", "desat"] },
  { q: "Koľko asistencií mal Marek Oriešek v Lige starších žiakov Západ 2018/19?", a: ["19"] },
  { q: "Koľko zápasov odohral Adam Krecháč v extralige juniorov 2024/25?", a: ["26"] },
  { q: "Koľko asistencií mal Gabriel Královič v extralige juniorov 2021/22?", a: ["13"] },
  { q: "Koľko asistencií mal František Jaššo v extralige juniorov 2023/24?", a: ["10", "desat"] },
  { q: "Koľko asistencií mal Adam Vácval v Lige dorastencov Západ 2019/20?", a: ["7", "sedem"] },
  { q: "Koľko gólov strelil Daniel Kupka v 2. lige mužov Stred 2025/26?", a: ["6", "sest"] },
  { q: "Koľko asistencií mal Adam Krecháč v extralige juniorov 2022/23?", a: ["14"] },
  { q: "Koľko zápasov odohral Milan Stuhl v 2. lige mužov Západ 2022/23?", a: ["15"] },
  { q: "Koľko asistencií mal Adam Daniš v 2. lige mužov Západ 2023/24?", a: ["12"] },
  { q: "Koľko asistencií mal Jakub Michalec v Lige dorastencov Západ 2014/15?", a: ["8", "osem"] },
  { q: "Koľko kanadských bodov mal Miroslav Slávik v 2. lige mužov Západ 2025/26?", a: ["37"] },
  { q: "Koľko gólov strelil Timotej Kollár v Lige starších žiakov Západ 2019/20?", a: ["6", "sest"] },
  { q: "Koľko gólov strelil Ľubomír Drga v Lige juniorov Stred 2023/24?", a: ["6", "sest"] },
  { q: "Koľko asistencií mal Frederik Hrušovský v 2. lige mužov Západ 2018/19 (základná časť)?", a: ["6", "sest"] },
  { q: "Koľko gólov dostal brankár Marek Paulen v 1. lige mužov 2021/22?", a: ["68"] },
  { q: "Koľko asistencií mal Michal Daranský v extralige juniorov 2025/26?", a: ["7", "sedem"] },
  { q: "Koľko gólov strelil Peter Bednár v Lige starších žiakov Západ 2016/17?", a: ["6", "sest"] },
  { q: "Koľko zápasov odohral Jerguš Surma v extralige mužov 2025/26?", a: ["12"] },
  { q: "Koľko asistencií mal Jonáš Bagín v Lige dorastencov Západ 2023/24?", a: ["12"] },
  { q: "Koľko asistencií mal Jonáš Bagín v 1. lige dorastencov (divízia Západ) 2023/24?", a: ["10", "desat"] },
  { q: "Koľko asistencií mal Matúš Jurašek v extralige juniorov 2024/25?", a: ["8", "osem"] },
  { q: "Koľko kanadských bodov mal Marek Meliš v Lige dorastencov Západ 2022/23?", a: ["45"] },
  { q: "Koľko gólov strelil Oliver Klčo v Lige starších žiakov Západ 2023/24?", a: ["16"] },
  { q: "Koľko asistencií mal Filip Vrana v Lige dorastencov Západ 2022/23?", a: ["14"] },
  { q: "Koľko zápasov odohral Michal Daranský v Lige starších žiakov Západ 2023/24?", a: ["23"] },
  { q: "Koľko zápasov odohral Tomáš Huňa v Lige starších žiakov Západ 2022/23?", a: ["23"] },
  { q: "Koľko zápasov odohral Juraj Matejka v extralige mužov 2021/22?", a: ["25"] },
  { q: "Koľko gólov strelil Milan Kováč v 2. lige mužov Západ 2023/24?", a: ["17"] },
  { q: "Koľko gólov strelil Šimon Ondrášik v 2. lige mužov Západ 2024/25?", a: ["13"] },
  { q: "Koľko asistencií mal Marco Olekšák v Lige dorastencov Západ 2024/25?", a: ["17"] },
  { q: "Koľko asistencií mal Milan Stuhl v 2. lige mužov Západ 2019/20 (základná časť)?", a: ["6", "sest"] },
  { q: "Koľko gólov strelil Matúš Madaj v 2. lige mužov Západ 2015/16 (základná časť)?", a: ["12"] },
  { q: "Koľko kanadských bodov mal Matúš Madaj v 2. lige mužov Západ 2023/24?", a: ["30"] },
  { q: "Koľko asistencií mal Matúš Malík v extralige mužov 2024/25?", a: ["6", "sest"] },
  { q: "Koľko gólov dostal brankár Adam Líška v extralige juniorov 2023/24?", a: ["33"] },
  { q: "Koľko asistencií mal Nicolas Pasqualon v extralige juniorov 2024/25?", a: ["11"] },
  { q: "Koľko kanadských bodov mal Tobias Konček v 2. lige mužov Západ 2025/26?", a: ["21"] },
  { q: "Koľko kanadských bodov mal Šimon Ondrášik v Lige starších žiakov Západ 2021/22?", a: ["19"] },
  { q: "Koľko kanadských bodov mal Marek Meliš v 1. lige dorastencov (divízia Západ) 2024/25?", a: ["14"] },
  { q: "Koľko gólov strelil Nicolas Pasqualon v Lige dorastencov Západ 2023/24?", a: ["16"] },
  { q: "Koľko asistencií mal Tomáš Kordoš v extralige juniorov 2025/26?", a: ["6", "sest"] },
  { q: "Koľko asistencií mal Daniel Kupka v 2. lige mužov Stred 2023/24?", a: ["9", "devat"] },
  { q: "Koľko gólov strelil Šimon Hošták v extralige juniorov 2025/26?", a: ["7", "sedem"] },
  { q: "Koľko zápasov odohral Tomáš Kordoš v Lige dorastencov Západ 2025/26?", a: ["12"] },
  { q: "Koľko asistencií mal Adam Krecháč v Lige dorastencov Západ 2019/20?", a: ["8", "osem"] },
  { q: "Koľko gólov strelil Ľubomír Drga v extralige juniorov 2025/26?", a: ["7", "sedem"] },
  { q: "Koľko asistencií mal Erik Vojtek v Lige starších žiakov Západ 2018/19?", a: ["14"] },
  { q: "Koľko gólov strelil Ľubomír Drga v Lige juniorov Stred 2022/23?", a: ["6", "sest"] },
  { q: "Koľko kanadských bodov mal Lucas Maruškanič v 1. lige dorastencov (divízia Západ) 2023/24?", a: ["13"] },
  { q: "Koľko gólov strelil Martin Žilinský v extralige mužov 2014/15 (základná časť)?", a: ["21"] },
  { q: "Koľko kanadských bodov mal Mário Hanták v 1. lige mužov 2023/24?", a: ["19"] },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const today = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10); // približne SK čas
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join(''); }

const code = () => 'AS-' + [...crypto.getRandomValues(new Uint8Array(4))].map((x) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');

export async function onRequestPost({ request, env }) {
  const KV = env.FORMS;
  if (!KV) return json({ error: 'storage' }, 500);
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: 'body' }, 400); }
  const d = today();
  const wins = parseInt((await KV.get('hra:wins:' + d)) || '0', 10) || 0;

  if (b.action === 'start') {
    if (wins >= MAX_WINS) return json({ closed: true });
    const ip = await sha((request.headers.get('cf-connecting-ip') || '') + d);
    const did = String(b.did || '').slice(0, 64);
    const tried = (await KV.get(`hra:try:${d}:ip:${ip}`)) || (did && (await KV.get(`hra:try:${d}:did:${did}`)));
    if (tried) return json({ used: true });
    await KV.put(`hra:try:${d}:ip:${ip}`, '1', { expirationTtl: 172800 });
    if (did) await KV.put(`hra:try:${d}:did:${did}`, '1', { expirationTtl: 172800 });
    const r = Math.floor(Math.random() * RIDDLES.length);
    const id = crypto.randomUUID();
    await KV.put('hra:g:' + id, JSON.stringify({ r, t0: Date.now() }), { expirationTtl: 300 });
    return json({ id, q: RIDDLES[r].q, ms: 7000 });
  }

  if (b.action === 'answer') {
    const g = JSON.parse((await KV.get('hra:g:' + String(b.id || ''))) || 'null');
    if (!g) return json({ win: false, late: true });
    await KV.delete('hra:g:' + b.id);
    const R = RIDDLES[g.r];
    const late = Date.now() - g.t0 > LIMIT_MS;
    const ans = norm(b.a);
    const ok = !late && ans && R.a.some((x) => { const n = norm(x); return ans === n || ans.split(' ').includes(n); });
    if (!ok) return json({ win: false, late });
    const w2 = parseInt((await KV.get('hra:wins:' + d)) || '0', 10) || 0;
    if (w2 >= MAX_WINS) return json({ win: false, closed: true });
    await KV.put('hra:wins:' + d, String(w2 + 1), { expirationTtl: 172800 });
    const c = code();
    await KV.put('hra:code:' + c, JSON.stringify({ d, q: R.q, a: b.a, at: new Date().toISOString() }), { expirationTtl: 60 * 86400 });
    const n1 = notify(env, '🏅 Niekto vyhral odznak! Kód ' + c, { kod: c, datum: d, hadanka: R.q, odpoved: String(b.a || ''), poznamka: 'Výherca ešte vypĺňa kontakt – príde ďalší e-mail.' });
    try { await n1; } catch (e) {}
    return json({ win: true, code: c });
  }

  if (b.action === 'claim') {
    const c = String(b.code || '').toUpperCase();
    const rec = JSON.parse((await KV.get('hra:code:' + c)) || 'null');
    if (!rec) return json({ error: 'code' }, 400);
    const data = { kod: c, meno: String(b.meno || '').slice(0, 120), kontakt: String(b.kontakt || '').slice(0, 160), poznamka: String(b.poznamka || '').slice(0, 500), hadanka: rec.q, odpoved: rec.a };
    if (!data.meno || !data.kontakt) return json({ error: 'fields' }, 400);
    rec.claim = data; await KV.put('hra:code:' + c, JSON.stringify(rec), { expirationTtl: 60 * 86400 });
    const at = new Date().toISOString();
    await KV.put(`odznak:${at}:${c}`, JSON.stringify({ form: 'odznak', at, data }));
    const res = await notify(env, '🏅 Výherca odznaku – ' + data.meno + ' (' + c + ')', data);
    await KV.put('hra:mail:' + c, res, { expirationTtl: 60 * 86400 });
    return json({ ok: true });
  }
  return json({ error: 'action' }, 400);
}
export const onRequest = () => json({ error: 'method' }, 405);
