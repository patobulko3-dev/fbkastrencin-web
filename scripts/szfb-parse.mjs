// Parsovacie funkcie pre szfb.sk – fungujú s DOM (prehliadač) aj linkedom (Node).
export const DAYS = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
const T = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
const compIdFromImg = (td) => {
  const img = td && td.querySelector('img');
  const m = img && (img.getAttribute('src') || '').match(/Competitor\/(\d+)\//);
  return m ? +m[1] : null;
};
const teamName = (td) => {
  const img = td && td.querySelector('img');
  return img ? (img.getAttribute('alt') || '').trim() : T(td);
};

/** Program a výsledky súťaže: všetky zápasy */
export function parseResults(doc) {
  const out = [];
  doc.querySelectorAll('table.table-game-preview tr.fn-tap-row').forEach((tr) => {
    const tds = [...tr.children].filter((c) => c.tagName === 'TD');
    const homeTd = tr.querySelector('td.td-mobile-w-team:not(.team-away)');
    const awayTd = tr.querySelector('td.team-away');
    const scoreTd = tr.querySelector('td.td-mobile-w-score');
    const infoTd = tr.querySelector('td.match-hide-hover') || tds[tds.length - 1];
    if (!homeTd || !awayTd || !scoreTd) return;
    const res = [...scoreTd.querySelectorAll('.hidden-xs .matchresult')].map(T);
    const extra = T(scoreTd.querySelector('.hidden-xs [title]'));
    const link = scoreTd.querySelector('a') || tr.querySelector('a[href*="/match/"]');
    const href = link ? link.getAttribute('href') : '';
    const mid = (href.match(/match\/(\d+)/) || [])[1];
    const dateTxt = T(infoTd.querySelector('.match-date')) || T(infoTd);
    const dm = dateTxt.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const tm = (T(infoTd.querySelector('.hover-hide')) || T(infoTd)).match(/\b(\d{1,2}:\d{2})\b/);
    const venue = T(infoTd.querySelector('.td-box')).replace(/"[^"]*"/g, '').trim();
    const played = res.length === 2 && res[0] !== '' && /\d/.test(res[0]) && !/preview/.test(href);
    out.push({
      id: mid ? +mid : null,
      home: teamName(homeTd), homeId: compIdFromImg(homeTd),
      away: teamName(awayTd), awayId: compIdFromImg(awayTd),
      hs: played ? +res[0] : null, as: played ? +res[1] : null,
      ext: extra,
      date: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null,
      time: tm ? tm[1] : '',
      venue, played,
    });
  });
  return out;
}

/** Tabuľka: [{pos, team, id, z, score, pts}] (prvá tabuľka na stránke) */
export function parseStandings(doc) {
  const t = doc.querySelector('table.table-logos') || doc.querySelector('table');
  if (!t) return [];
  return [...t.querySelectorAll('tbody tr')].map((tr) => {
    const c = [...tr.children].map(T);
    return { pos: +c[0], team: c[1], id: compIdFromImg(tr), z: +c[2], score: c[c.length - 2], pts: +c[c.length - 1] };
  }).filter((r) => r.team);
}

/** Zostava zápasu: odkazy na hráčov tímu, ktorého názov obsahuje teamName */
export function parseLineup(doc, teamName) {
  const cols = [...doc.querySelectorAll('.col-md-6')].filter((c) => c.querySelector('a[href*="/player/"]'));
  const norm = (s) => s.toLowerCase();
  let col = cols.find((c) => norm(T(c.querySelector('h2,h3,h4,.headline'))).includes(norm(teamName)));
  if (!col) return [];
  return [...new Set([...col.querySelectorAll('a[href*="/player/"]')].map((a) => a.getAttribute('href').split('?')[0]))];
}

/** Profil hráča → formát [MENO, sezóna[], kariéra[], posledné zápasy[]] */
export function parsePlayer(doc) {
  const h = doc.querySelector('h2.tt-uppercase');
  const name = h ? h.childNodes[0].textContent.replace(/\s+/g, ' ').trim() : '';
  const pos = T(doc.querySelector('.playa-position'));
  const isG = /Brank/i.test(pos);
  const cnt = {};
  doc.querySelectorAll('.team-counters .counters').forEach((c) => { cnt[T(c.querySelector('h4'))] = T(c.querySelector('.counter')); });
  const season = isG
    ? [cnt['Zápasy'] || '0', cnt['Zápasy s nulou'] || '0', cnt['Gólov na zápas'] || '0,00', cnt['Úspešnosť'] || '0,00 %']
    : [cnt['Zápasy'] || '0', cnt['Góly'] || '0', cnt['Asistencie'] || '0', cnt['Body'] || '0', cnt['Trestné minúty'] || '0'];
  const tables = [...doc.querySelectorAll('table')];
  const rowsOf = (t) => (t ? [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map(T)) : []);
  const careerT = tables.find((t) => !/Súper/.test(T(t.querySelector('thead'))));
  const lastT = tables.find((t) => /Súper/.test(T(t.querySelector('thead'))));
  const career = rowsOf(careerT).map((r) => isG
    ? [r[0], r[1], r[2], r[3], r[4], ''].join('|')
    : [r[0], r[1], r[2], r[3], r[4], r[r.length - 1]].join('|'));
  const last = rowsOf(lastT).slice(0, 5).map((r) => {
    const dm = (r[1] || '').match(/(\d{2}\.\d{2})/);
    if (isG) {
      const pct = r.find((x) => /%/.test(x)) || '';
      return [r[0], dm ? dm[1] : r[1], r[2], pct];
    }
    return [r[0], dm ? dm[1] : r[1], r[2], `${r[3] || 0}+${r[4] || 0}`];
  });
  return { name, pos: isG ? 'B' : pos, row: [name, season, career, last] };
}
