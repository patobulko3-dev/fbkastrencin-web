# fbkastrencin.sk – web FBK AS Trenčín

Statický web hostovaný na **Netlify**, zdrojové súbory sú v tomto repozitári.

## Ako to funguje

| Čo | Kde | Kto mení |
|---|---|---|
| Výsledky, program, tabuľky, štatistiky hráčov | `data/szfb.json` | automaticky zo szfb.sk (GitHub Actions, každé 2 hodiny) |
| Články a novinky | `content/clanky/*.md` | admin na **www.fbkastrencin.sk/admin** |
| Banner, tréningy, tréneri, vedenie, partneri | `data/site.json` | admin → *Obsah stránky* |
| Súpisky (čísla, posty, fotky) | `data/rosters.json` | admin → *Súpisky* |
| Vzhľad stránky | `index.html` | programátor |

Každá zmena v repozitári spustí na Netlify nové zostavenie (`npm run build` → priečinok `dist/`) a o 1–2 minúty je na webe.

## Admin

1. Otvor **https://www.fbkastrencin.sk/admin**
2. Prihlás sa cez **GitHub** (účet musí mať prístup k tomuto repozitáru – pozvánka cez *Settings → Collaborators*).
3. Uprav obsah a klikni **Publish**.

## Nová sezóna

Na szfb.sk majú súťaže každú sezónu nové čísla. V súbore `data/szfb-config.json` treba prepísať čísla `comp` (súťaž) a `id` (tím):

- číslo súťaže je v adrese, napr. `szfb.sk/sk/stats/results/1241/...` → `1241`,
- číslo tímu je v rozbaľovacom zozname tímov na stránke výsledkov (`CompetitorID`).

## Ručné spustenie aktualizácie

GitHub → záložka **Actions** → *Aktualizácia dát zo szfb.sk* → **Run workflow**.

## Lokálne

```
npm install
npm run scrape   # stiahne dáta zo szfb.sk
npm run build    # zostaví web do dist/
```
