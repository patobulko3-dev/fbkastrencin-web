// Počítadlo prečítaní článkov (Cloudflare KV, väzba VIEWS).
// GET  /api/views?slug=<slug>  → počet;  POST → +1
import { json } from '../../lib/cf-util.js';
import seed from '../../data/views-seed.json';

export async function onRequest({ request, env }) {
  const slug = (new URL(request.url).searchParams.get('slug') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 150);
  if (!slug) return json({ error: 'slug' }, 400);
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.VIEWS) return json({ views: seed[slug] || 0 });
  const stored = await env.VIEWS.get(slug);
  let views = stored == null ? (seed[slug] || 0) : (parseInt(stored, 10) || 0);
  if (request.method === 'POST') { views += 1; await env.VIEWS.put(slug, String(views)); }
  return json({ views });
}
