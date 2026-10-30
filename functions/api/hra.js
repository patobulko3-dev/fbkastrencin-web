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
  // pravidlá IFF (overené v Rules of the Game 2026)
  { q: 'Koľko milimetrov smie mať najviac zahnutie čepele florbalovej hokejky?', a: ['30'] },
  { q: 'Najviac koľko sekúnd smie mať brankár loptičku pod kontrolou?', a: ['3', 'tri'] },
  { q: 'Koľko minút trvá vo florbale väčší (osobný) trest za ťažký faul – dva tresty po sebe?', a: ['4', 'styri'] },
  { q: 'Akú najmenšiu dĺžku v metroch smie mať florbalové ihrisko podľa pravidiel IFF?', a: ['36'] },
  { q: 'Koľko metrov od kratšej strany ihriska je vyznačené brankovisko?', a: ['2 85', '285'] },
  { q: 'Koľko metrov je široké malé brankovisko?', a: ['2 5', '25', '2 50'] },
  { q: 'Koľko minút trvá predĺženie v zápase podľa pravidiel IFF?', a: ['10', 'desat'] },
  { q: 'Najmenej koľko hráčov tímu musí byť na ihrisku, aby zápas mohol pokračovať?', a: ['4', 'styria', 'styri'] },
  { q: 'Koľko sekúnd trvá oddychový čas vo florbale?', a: ['30', 'tridsat'] },
  { q: 'Aký priemer v milimetroch má florbalová loptička?', a: ['72'] },
  { q: 'Koľko gramov váži florbalová loptička?', a: ['23'] },
  { q: 'Koľko dierok má florbalová loptička?', a: ['26'] },
  // svet, Slovensko, Česko
  { q: 'V ktorom roku vznikla Medzinárodná florbalová federácia IFF?', a: ['1986'] },
  { q: 'V ktorom roku sa hrali prvé majstrovstvá sveta mužov vo florbale?', a: ['1996'] },
  { q: 'Ktorá krajina vyhrala majstrovstvá sveta mužov 2024 v Malmö?', a: ['finsko', 'finland', 'finsku'] },
  { q: 'V ktorom fínskom meste sa hrajú majstrovstvá sveta mužov 2026?', a: ['tampere'] },
  { q: 'Ktorý pražský klub je rekordným majstrom českej florbalovej superligy?', a: ['tatran', 'stresovice', 'tatran stresovice'] },
  { q: 'V ktorom roku získali českí florbalisti svoju prvú striebornú medailu na majstrovstvách sveta?', a: ['2004'] },
  // naše AS
  { q: 'Ktorý brankár AS mal po siedmich kolách extraligy najvyššiu úspešnosť zákrokov? Stačí priezvisko.', a: ['liska', 'adam liska'] },
  { q: 'Aké číslo nosí na drese brankár AS Adam Líška?', a: ['82'] },
  { q: 'Ktorý obranca je najlepším strelcom mužov AS v sezóne 2026/27? Stačí priezvisko.', a: ['daransky', 'michal daransky'] },
  { q: 'Koľko gólov dal Michal Daranský v prvých siedmich kolách extraligy 2026/27?', a: ['7', 'sedem'] },
  { q: 'Koľko trestných minút mal Matúš Malík po siedmich kolách extraligy 2026/27?', a: ['16', 'sestnast'] },
  { q: 'Ktorý ročník je kapitán mužov AS Samuel Dávidek?', a: ['1998', '98'] },
  { q: 'Akým výsledkom vyhrali muži AS v Detve na úvod sezóny 2026/27?', a: ['13 3', '133'] },
  { q: 'Koľko gólov strelil Šimon Ondrášik pri výhre 13:3 v Detve?', a: ['3', 'tri', 'hetrik'] },
  { q: 'Juniori AS vyhrali derby s 1. FBC 8:3. Fusi a Bielik dali po dva – kto ďalší skóroval? Stačí jedno priezvisko.', a: ['benovic', 'pasqualon', 'oleksak', 'minarik'] },
  { q: 'Juniori AS vyhrali derby s 1. FBC 8:3. Koľko gólov v ňom dal Michal Fusi?', a: ['2', 'dva', 'dve'] },
  { q: 'Starší žiaci AS zdolali Púchov 9:8. Koľko gólov v tom zápase strelil Peřina?', a: ['2', 'dva', 'dve'] },
  { q: 'Koľko gólov dal Samuel Dávidek za Muži B v zápase s Dubnicou, ktorý sme vyhrali 8:7?', a: ['3', 'tri', 'hetrik'] },
  { q: 'Koľko kanadských bodov mal Šimon Ondrášik po prvých siedmich kolách extraligy 2026/27?', a: ['10', 'desat'] },
  { q: 'Ako sa volá kondičný tréner AS Trenčín? Stačí priezvisko.', a: ['kravec', 'peter kravec'] },
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

  if (b.action === 'mailtest') { // overenie e-mailu + súhrn doterajších záznamov (max raz za 10 min)
    if (await KV.get('hra:mailtest2')) return json({ wait: true });
    await KV.put('hra:mailtest2', '1', { expirationTtl: 600 });
    const lines = {};
    for (const pre of ['hra:code:', 'odznak:', 'nabor:', 'odkaz-klubu:']) {
      const l = await KV.list({ prefix: pre });
      for (const k of l.keys) { const v = await KV.get(k.name); lines[k.name] = v ? v.slice(0, 600) : ''; }
    }
    const res = await notify(env, '✅ Upozornenia z webu fungujú – súhrn doterajších záznamov', Object.keys(lines).length ? lines : { sprava: 'Zatiaľ žiadne záznamy.' });
    return json({ res, n: Object.keys(lines).length });
  }
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
