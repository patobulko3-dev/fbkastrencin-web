// Počítadlo prečítaní článkov.
// GET  /api/views?slug=<slug>  → vráti počet
// POST /api/views?slug=<slug>  → pripočíta 1 a vráti nový počet
// Počty sa ukladajú v Netlify Blobs (úložisko "views"), nič netreba nastavovať.
import { getStore } from '@netlify/blobs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default async (req) => {
  const slug = (new URL(req.url).searchParams.get('slug') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 150);
  if (!slug) return json({ error: 'slug' }, 400);
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method' }, 405);

  const store = getStore('views');
  let views = parseInt((await store.get(slug)) || '0', 10) || 0;
  if (req.method === 'POST') {
    views += 1;
    await store.set(slug, String(views));
  }
  return json({ views });
};

export const config = { path: '/api/views' };
