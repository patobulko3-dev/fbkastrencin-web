// Prehľad prijatých odkazov a prihlášok: /api/spravy?k=<ADMIN_KEY>
import { esc } from '../../lib/cf-util.js';

export async function onRequestGet({ request, env }) {
  const k = new URL(request.url).searchParams.get('k') || '';
  if (!env.ADMIN_KEY || k !== env.ADMIN_KEY) return new Response('Nesprávny kľúč.', { status: 403 });
  const items = [];
  let cursor;
  do {
    const r = await env.FORMS.list({ cursor });
    for (const key of r.keys) { const v = await env.FORMS.get(key.name); if (v) items.push(JSON.parse(v)); }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  const names = { 'odkaz-klubu': 'Odkaz klubu', nabor: 'Nábor' };
  const rows = items.map((x) => `<tr><td>${esc(new Date(x.at).toLocaleString('sk-SK', { timeZone: 'Europe/Bratislava' }))}</td><td><b>${esc(names[x.form] || x.form)}</b></td><td>${Object.entries(x.data).map(([a, b]) => `<div><small>${esc(a)}</small> ${esc(b)}</div>`).join('')}</td></tr>`).join('');
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Správy z webu</title>
<style>body{font:15px system-ui,sans-serif;margin:0;padding:20px;background:#f6f3f3;color:#1d1517}h1{margin:0 0 14px}table{border-collapse:collapse;width:100%;background:#fff}td{border-bottom:1px solid #e6dcdd;padding:10px;vertical-align:top}small{color:#c21f26;font-weight:700;text-transform:uppercase;font-size:.7rem}</style>
<h1>Správy z webu (${items.length})</h1><table>${rows || '<tr><td>Zatiaľ nič.</td></tr>'}</table>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
