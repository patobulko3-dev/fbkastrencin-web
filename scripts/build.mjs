// Zostaví web do priečinka dist/: skopíruje statické súbory,
// z článkov v content/clanky/*.md vyrobí data/news.json a stránky /clanky/<slug>/.
import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { marked } from 'marked';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('../dist/', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const item of ['index.html', 'img', 'data', 'admin', 'uploads', 'favicon.ico']) {
  await cp(p(item), new URL(item, DIST), { recursive: true }).catch(() => {});
}

function frontMatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
    else if (/^'.*'$/.test(v)) v = v.slice(1, -1).replace(/''/g, "'");
    data[mm[1]] = v;
  }
  return { data, body: m[2] };
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtDate = (d) => { const x = new Date(d); return `${x.getDate()}. ${x.getMonth() + 1}. ${x.getFullYear()}`; };

const files = (await readdir(p('content/clanky')).catch(() => [])).filter((f) => f.endsWith('.md'));
const news = [];
const arts = [];
for (const f of files) {
  const { data, body } = frontMatter(await readFile(p('content/clanky/' + f), 'utf8'));
  if (!data.title || data.draft === 'true') continue;
  const date = (data.date || f.slice(0, 10)).slice(0, 10);
  const slug = slugify(f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')) || slugify(data.title);
  const hasBody = body.trim().length > 0;
  const url = hasBody ? `clanky/${slug}/` : (data.external_url || '#');
  const image = (data.image || '').replace(/^\//, '');
  news.push({ title: data.title, date, perex: data.perex || '', image, image_text: data.image_text || '', url, category: data.category || '' });
  if (hasBody) arts.push({ data, body, date, slug, image });
}
news.sort((a, b) => b.date.localeCompare(a.date));

const CSS = `:root{--red:#c21f26;--red-deep:#8c0019;--ink:#1d1517;--muted:#6e6264;--bg:#f7f5f5;--surface:#fff;--line:#e6dfe0;--display:"Big Shoulders Display","Arial Narrow",Impact,sans-serif}
@media (prefers-color-scheme: dark){:root{--red:#e0383f;--ink:#f4eeef;--muted:#b0a3a5;--bg:#141012;--surface:#1e181a;--line:#352c2e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 Lato,system-ui,sans-serif}
a{color:var(--red)}
header{background:var(--red);color:#fff;position:sticky;top:0;z-index:5}header .w{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;max-width:1160px}
.w{max-width:760px;margin:0 auto;padding:0 16px}header a{color:#fff;text-decoration:none;font-family:var(--display);font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.brand{display:flex;align-items:center;gap:10px;font-size:1.5rem;font-weight:900}.brand img{width:38px}
.hero{position:relative;max-width:1000px;margin:24px auto 0;border-radius:14px;aspect-ratio:16/10;overflow:hidden;background:#1d1517}
.hero img{width:100%;height:100%;object-fit:cover;object-position:50% 25%;display:block}
time{display:block;margin-top:34px;font-size:.78rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--red)}
h1{font-family:var(--display);font-weight:900;font-size:clamp(2.2rem,6vw,3.6rem);line-height:.95;text-transform:uppercase;margin:10px 0 18px;text-wrap:balance}
.perex{font-size:1.18rem;font-weight:700;line-height:1.55;border-left:4px solid var(--red);padding-left:16px;margin:0 0 26px}
article p{margin:0 0 1.1em}article>p:first-child{font-size:1.18rem;font-weight:700;line-height:1.55;border-left:4px solid var(--red);padding-left:16px;margin-bottom:26px}article img{display:block;width:100%;height:auto;border-radius:12px;margin:28px 0}
article blockquote{margin:24px 0;padding:14px 20px;background:var(--surface);border-left:4px solid var(--red);border-radius:0 10px 10px 0;font-weight:700}
article blockquote p{margin:0}article strong{font-weight:900}
.more{margin-top:56px;padding-top:26px;border-top:1px solid var(--line)}
.more h2{font-family:var(--display);font-weight:900;text-transform:uppercase;font-size:1.8rem;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit}
.card .im{aspect-ratio:16/9;background:linear-gradient(135deg,var(--red-deep),#2a0c11)}.card .im img{width:100%;height:100%;object-fit:cover;object-position:50% 25%;display:block}
.card .bd{padding:12px 14px 16px}.card time{margin:0;font-size:.68rem}.card h3{margin:6px 0 0;font-size:1rem;line-height:1.3}
.card p{margin:6px 0 0;font-size:.9rem;color:var(--muted);line-height:1.45}
footer{margin-top:60px;padding:30px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
@media (max-width:1032px){.hero{margin:0;border-radius:0}}`;

const shell = (title, desc, ogImage, depth, inner) => `<!doctype html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | FBK AS Trenčín</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${ogImage ? `<meta property="og:image" content="https://www.fbkastrencin.sk/${esc(ogImage)}">` : ''}
<link rel="icon" type="image/png" href="${depth}img/l/astn.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Lato:wght@400;700;900&display=swap">
<style>${CSS}</style></head><body>
<header><div class="w"><a class="brand" href="${depth}"><img src="${depth}img/l/astn-white.png" alt="">AS Trenčín</a><a href="${depth}clanky/">Všetky články</a></div></header>
${inner}
</body></html>`;

const card = (n, depth) => `<a class="card" href="${depth}${n.url}"><div class="im">${n.image ? `<img src="${depth}${esc(n.image)}" alt="" loading="lazy">` : ''}</div><div class="bd"><time>${fmtDate(n.date)}</time><h3>${esc(n.title)}</h3></div></a>`;

for (const a of arts) {
  const { data, body, date, slug, image } = a;
  const html = marked.parse(body);
  const others = news.filter((n) => n.url !== `clanky/${slug}/` && n.url.startsWith('clanky/')).slice(0, 3);
  const inner = `${image ? `<div class="hero"><img src="../../${esc(image)}" alt=""></div>` : ''}
<main class="w"><time>${fmtDate(date)}</time><h1>${esc(data.title)}</h1>
<article>${html}</article>
${others.length ? `<section class="more"><h2>Ďalšie články</h2><div class="grid">${others.map((n) => card(n, '../../')).join('')}</div></section>` : ''}
<footer>FBK AS Trenčín · <a href="../../" style="color:inherit">fbkastrencin.sk</a></footer></main>`;
  await mkdir(new URL(`clanky/${slug}/`, DIST), { recursive: true });
  await writeFile(new URL(`clanky/${slug}/index.html`, DIST), shell(data.title, data.perex || '', image, '../../', inner));
}

// zoznam všetkých článkov
await mkdir(new URL('clanky/', DIST), { recursive: true });
await writeFile(new URL('clanky/index.html', DIST), shell('Články a novinky', 'Novinky z FBK AS Trenčín', '', '../',
  `<main class="w" style="max-width:1160px"><time>FBK AS Trenčín</time><h1>Články a novinky</h1><div class="grid">${news.map((n) => card(n, '../').replace('</h3>', `</h3><p>${esc(n.perex)}</p>`)).join('')}</div>
<footer>FBK AS Trenčín · <a href="../" style="color:inherit">fbkastrencin.sk</a></footer></main>`));

await writeFile(new URL('data/news.json', DIST), JSON.stringify(news, null, 1));
await writeFile(p('data/news.json'), JSON.stringify(news, null, 1)); // pre lokálny náhľad
console.log(`Hotovo: ${news.length} článkov.`);
