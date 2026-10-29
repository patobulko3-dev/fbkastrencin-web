// Malíkova hádanka o odznak AS Trenčín.
// POST /api/hra {action:'start', did}            -> {id, q} | {closed} | {used}
// POST /api/hra {action:'answer', id, a}         -> {win, code} | {win:false, right}
// POST /api/hra {action:'claim', code, ...údaje} -> {ok}
// Údaje sú v KV (väzba FORMS). Limit: MAX_WINS výhercov za deň, 1 pokus na zariadenie/IP za deň.
import { json } from '../../lib/cf-util.js';

const MAX_WINS = 2;
const LIMIT_MS = 10000 + 2500; // 10 s na odpoveď + rezerva na pripojenie

// a: prijaté odpovede (bez diakritiky, malé písmená)
const RIDDLES = [
  // florbal – pravidlá a svet
  { q: 'Koľko dierok má florbalová loptička?', a: ['26', 'dvadsatsest'] },
  { q: 'Aký priemer v milimetroch má florbalová loptička?', a: ['72'] },
  { q: 'Koľko gramov váži florbalová loptička?', a: ['23'] },
  { q: 'Aká široká je florbalová bránka v centimetroch?', a: ['160'] },
  { q: 'Aká vysoká je florbalová bránka v centimetroch?', a: ['115'] },
  { q: 'Koľko metrov meria veľké florbalové ihrisko na dĺžku?', a: ['40', 'styridsat'] },
  { q: 'Koľko minút čistého času trvá jedna tretina zápasu mužov?', a: ['20', 'dvadsat'] },
  { q: 'Koľko hráčov jedného tímu je naraz na ihrisku vrátane brankára?', a: ['6', 'sest'] },
  { q: 'Koľko minút trvá menší trest, teda bežné vylúčenie, vo florbale?', a: ['2', 'dve', 'dva'] },
  { q: 'Čo florbalový brankár na rozdiel od hokejového nemá?', a: ['hokejku', 'hokejka', 'florbalku', 'palicu', 'kij'] },
  { q: 'V ktorej krajine vznikol florbal?', a: ['svedsko', 'svedsku', 'sweden', 'svedska'] },
  { q: 'V ktorom meste sídli Medzinárodná florbalová federácia IFF?', a: ['helsinki', 'helsinky'] },
  { q: 'Aká je skratka Slovenského zväzu florbalu?', a: ['szfb'] },
  { q: 'Ktorá krajina vyhrala majstrovstvá sveta mužov 2024 v Malmö?', a: ['finsko', 'finland', 'fini', 'finsku'] },
  { q: 'V ktorom fínskom meste sa hrajú majstrovstvá sveta mužov 2026?', a: ['tampere'] },
  { q: 'Ako sa volá najvyššia česká florbalová liga mužov? Stačí meno sponzora.', a: ['livesport', 'livesport superliga', 'superliga'] },
  { q: 'Ktorý pražský klub je rekordným majstrom českej florbalovej superligy?', a: ['tatran', 'strešovice', 'stresovice', 'tatran stresovice'] },
  { q: 'V ktorej pražskej hale sa hrá superfinále českej florbalovej ligy?', a: ['o2', 'o2 arena', 'o2arena'] },
  // naše AS
  { q: 'Aké číslo má na drese Matúš Malík?', a: ['77'] },
  { q: 'Aké číslo nosí na drese Šimon Ondrášik?', a: ['25'] },
  { q: 'Kto je kapitánom mužov AS Trenčín? Stačí priezvisko.', a: ['davidek', 'samuel davidek', 'samo davidek'] },
  { q: 'Ako sa volá domáca hala AS Trenčín?', a: ['ostrov', 'arena ostrov', 'arena'] },
  { q: 'V ktorom fínskom meste študuje náš junior Timotej Bielik?', a: ['tampere'] },
  { q: 'Juniori AS vyhrali derby s 1. FBC 8:3. Koľko gólov v ňom dal Michal Fusi?', a: ['2', 'dva', 'dve'] },
  { q: 'Koľko gólov dal Samuel Dávidek za Muži B v zápase s Dubnicou, ktorý sme vyhrali 8:7?', a: ['3', 'tri', 'hetrik'] },
  { q: 'Koľko kanadských bodov mal Šimon Ondrášik po prvých siedmich kolách extraligy 2026/27?', a: ['10', 'desat'] },
  { q: 'Starší žiaci AS zdolali Púchov 9:8. Koľko gólov v tom zápase strelil Peřina?', a: ['2', 'dva', 'dve'] },
  { q: 'Muži AS otočili zápas so Sabinovom a vyhrali po predĺžení. Akým výsledkom?', a: ['6 5', '65', '6 5 pp'] },
  { q: 'Mladší žiaci AS mali po štyroch zápasoch skóre 28:10. Koľko z tých zápasov vyhrali?', a: ['4', 'styri', 'vsetky'] },
  // pár klasických hádaniek
  { q: 'Má dierky, no vodu neudrží a na ihrisku ju všetci naháňajú. Čo je to?', a: ['lopticka', 'lopticku', 'lopta', 'loptu', 'florbalova lopticka'] },
  { q: 'Čím viac z nej berieš, tým je väčšia. Čo je to?', a: ['jama', 'jamu', 'diera', 'dieru'] },
  { q: 'Má mestá bez domov, lesy bez stromov a rieky bez vody. Čo je to?', a: ['mapa', 'mapu'] },
  { q: 'Čím viac ich nechávaš za sebou, tým viac ich je. Čo je to?', a: ['kroky', 'stopy', 'krok', 'stopa'] },
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
    return json({ id, q: RIDDLES[r].q, ms: 10000 });
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
    return json({ ok: true });
  }
  return json({ error: 'action' }, 400);
}
export const onRequest = () => json({ error: 'method' }, 405);
