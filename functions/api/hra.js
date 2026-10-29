// Malíkova hádanka o odznak AS Trenčín.
// POST /api/hra {action:'start', did}            -> {id, q} | {closed} | {used}
// POST /api/hra {action:'answer', id, a}         -> {win, code} | {win:false, right}
// POST /api/hra {action:'claim', code, ...údaje} -> {ok}
// Údaje sú v KV (väzba FORMS). Limit: MAX_WINS výhercov za deň, 1 pokus na zariadenie/IP za deň.
import { json } from '../../lib/cf-util.js';

const MAX_WINS = 2;
const LIMIT_MS = 7000 + 2500; // 7 s na odpoveď + rezerva na pripojenie

// a: prijaté odpovede (bez diakritiky, malé písmená)
const RIDDLES = [
  { q: 'Čím viac z nej berieš, tým je väčšia. Čo je to?', a: ['jama', 'jamu', 'diera', 'dieru'] },
  { q: 'Má zuby, ale nikdy nehryzie. Čo je to?', a: ['hreben', 'hrebien', 'pila', 'pilu', 'zips'] },
  { q: 'Patrí tebe, no ostatní ho používajú oveľa viac než ty. Čo je to?', a: ['meno'] },
  { q: 'Má krk, ale nemá hlavu. Čo je to?', a: ['flasa', 'flasu', 'flaska', 'flasku'] },
  { q: 'Stačí ho vysloviť a už je preč. Čo je to?', a: ['ticho'] },
  { q: 'Má dierky, no vodu neudrží a na ihrisku ju všetci naháňajú. Čo je to?', a: ['lopticka', 'loptu', 'lopta', 'florbalka', 'florbalova lopticka', 'lopticku'] },
  { q: 'Čím je mokrejší, tým viac suší. Čo je to?', a: ['uterak'] },
  { q: 'Má mestá bez domov, lesy bez stromov a rieky bez vody. Čo je to?', a: ['mapa', 'mapu'] },
  { q: 'Môžeš ho chytiť, ale nikdy ho nehodíš. Čo je to?', a: ['nadcha', 'nadchu', 'prechladnutie', 'chripka', 'chripku', 'virus'] },
  { q: 'Má jedno oko, ale nevidí nič. Čo je to?', a: ['ihla', 'ihlu', 'ihlicka', 'hurikan', 'tornado'] },
  { q: 'Je ľahší ako pierko, no ani najsilnejší chlap ho neudrží dlhšie ako pár minút. Čo je to?', a: ['dych'] },
  { q: 'Čím viac jej je, tým menej vidíš. Čo je to?', a: ['tma', 'tmu', 'hmla', 'hmlu'] },
  { q: 'Ide hore aj dole, a pritom sa nepohne z miesta. Čo je to?', a: ['schody', 'schodisko', 'teplota', 'teplomer'] },
  { q: 'Keď ma potrebuješ, hodíš ma preč. Keď ma už netreba, vytiahneš ma späť. Čo som?', a: ['kotva', 'kotvu'] },
  { q: 'Čo má hlavu aj chvost, ale nemá telo?', a: ['minca', 'mincu', 'eurominca'] },
  { q: 'Beží, no nemá nohy. Má posteľ, no nikdy nespí. Čo je to?', a: ['rieka', 'rieku', 'potok', 'voda'] },
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
