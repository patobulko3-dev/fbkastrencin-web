// Stiahne výsledky, program, tabuľky a štatistiky hráčov AS Trenčín zo szfb.sk
// a uloží ich do data/szfb.json. Spúšťa sa automaticky cez GitHub Actions.
import { readFile, writeFile } from 'node:fs/promises';
import { DOMParser } from 'linkedom';
import { scrapeAll } from './szfb-core.mjs';

const BASE = 'https://www.szfb.sk';
const cfg = JSON.parse(await readFile(new URL('../data/szfb-config.json', import.meta.url)));
const OUT = new URL('../data/szfb.json', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(BASE + path, { headers: { 'User-Agent': 'fbkastrencin.sk data bot (+https://www.fbkastrencin.sk)' } });
      if (!res.ok) throw new Error(res.status + ' ' + path);
      const html = await res.text();
      await sleep(400);
      return new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      if (i === 2) throw e;
      await sleep(2000);
    }
  }
}

const old = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null);
const { out, failures } = await scrapeAll(cfg, get, old);

if (failures === cfg.categories.length) { console.error('Nič sa nepodarilo stiahnuť – súbor nemením.'); process.exit(1); }
// Ak sa okrem času nič nezmenilo, súbor neprepisuj (nevznikne zbytočný commit).
const strip = (o) => JSON.stringify({ ...o, updated: null });
if (old && strip(old) === strip(out)) { console.log('Bez zmien.'); process.exit(0); }
await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('Uložené data/szfb.json');
