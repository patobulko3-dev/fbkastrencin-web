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
for (const f of files) {
  const { data, body } = frontMatter(await readFile(p('content/clanky/' + f), 'utf8'));
  if (!data.title || data.draft === 'true') continue;
  const date = (data.date || f.slice(0, 10)).slice(0, 10);
  const slug = slugify(f.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')) || slugify(data.title);
  const hasBody = body.trim().length > 0;
  const url = hasBody ? `clanky/${slug}/` : (data.external_url || '#');
  news.push({ title: data.title, date, perex: data.perex || '', image: data.image || '', image_text: data.image_text || '', url, category: data.category || '' });
  if (!hasBody) continue;
  const html = marked.parse(body);
  const page = `<!doctype html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title)} | FBK AS Trenčín</title>
<meta name="description" content="${esc(data.perex || '')}">
<meta property="og:title" content="${esc(data.title)}"><meta property="og:description" content="${esc(data.perex || '')}">
${data.image ? `<meta property="og:image" content="https://www.fbkastrencin.sk/${esc(data.image.replace(/^\//, ''))}">` : ''}
<link rel="icon" type="image/png" href="../../img/l/astn.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Lato:wght@400;700;900&display=swap">
<style>
:root{--red:#c21f26;--red-deep:#8c0019;--ink:#1d1517;--muted:#6e6264;--bg:#f7f5f5;--line:#e6dfe0}
@media (prefers-color-scheme: dark){:root{--red:#e0383f;--ink:#f4eeef;--muted:#b0a3a5;--bg:#141012;--line:#352c2e}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 Lato,system-ui,sans-serif}
header{background:var(--red);color:#fff}header .w{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.w{max-width:780px;margin:0 auto;padding:0 16px}header a{color:#fff;text-decoration:none;font-weight:900}
.brand{display:flex;align-items:center;gap:10px;font-family:"Big Shoulders Display",Impact,sans-serif;font-size:1.4rem;text-transform:uppercase}
.brand img{width:40px}
.hero{width:100%;max-height:460px;object-fit:cover;display:block;border-radius:0 0 14px 14px}
time{display:block;margin-top:28px;font-size:.78rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--red)}
h1{font-family:"Big Shoulders Display",Impact,sans-serif;font-size:clamp(2rem,6vw,3.2rem);line-height:1;text-transform:uppercase;margin:8px 0 14px}
.perex{font-size:1.15rem;font-weight:700;color:var(--muted)}
article img{max-width:100%;height:auto;border-radius:10px}article a{color:var(--red)}
article blockquote{margin:20px 0;padding:6px 18px;border-left:4px solid var(--red);font-style:italic}
.yt{position:relative;padding-top:56.25%;margin:20px 0}.yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:10px}
footer{margin-top:50px;padding:30px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
</style></head><body>
<header><div class="w"><a class="brand" href="../../"><img src="../../img/l/astn-white.png" alt="">AS Trenčín</a><a href="../../#socialne">← Všetky novinky</a></div></header>
${data.image ? `<div class="w" style="padding:0"><img class="hero" src="../../${esc(data.image.replace(/^\//, ''))}" alt=""></div>` : ''}
<main class="w"><time>${fmtDate(date)}</time><h1>${esc(data.title)}</h1>${data.perex ? `<p class="perex">${esc(data.perex)}</p>` : ''}
${data.youtube ? `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${esc((data.youtube.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [, data.youtube])[1])}" allowfullscreen></iframe></div>` : ''}
<article>${html}</article>
<footer>FBK AS Trenčín · <a href="../../" style="color:inherit">fbkastrencin.sk</a></footer></main>
</body></html>`;
  await mkdir(new URL(`clanky/${slug}/`, DIST), { recursive: true });
  await writeFile(new URL(`clanky/${slug}/index.html`, DIST), page);
}
news.sort((a, b) => b.date.localeCompare(a.date));
await writeFile(new URL('data/news.json', DIST), JSON.stringify(news, null, 1));
await writeFile(p('data/news.json'), JSON.stringify(news, null, 1)); // pre lokálny náhľad
console.log(`Hotovo: ${news.length} článkov.`);
