// Jadro sťahovania – nezávislé od prostredia (Node aj prehliadač).
import { parseResults, parseStandings, parseLineup, parsePlayer, parseMatch, parseGoalies, DAYS } from './szfb-parse.mjs';

export async function scrapeAll(cfg, get, old) {
  const venueName = (v) => (/M-?Šport|Ostrov/i.test(v) ? 'ARENA OSTROV' : v);
  const dmShort = (iso) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };
  const dayOf = (iso) => DAYS[new Date(iso + 'T12:00:00Z').getUTCDay()];

  const out = { updated: new Date().toISOString(), season: cfg.season, cats: {}, players: {}, matches: {} };
  const detailJobs = [];
  let failures = 0;

  for (const cat of cfg.categories) {
    try {
      const c = { id: cat.id, name: cat.name, photo: cat.photo, league: '', played: [], next: [], table: null, place: '–', score: '–', pts: 0, zones: !!cat.zones };
      const leagues = [];
      const placeParts = [];
      let gf = 0, ga = 0, anyPlayed = false;
      const rosterLinks = new Set();
      for (const comp of cat.comps) {
        const resDoc = await get(`/sk/stats/results/${comp.comp}/x`);
        const title = (resDoc.querySelector('title')?.textContent || '').split('|')[1]?.trim();
        if (title) leagues.push(title);
        const matches = parseResults(resDoc);
        const multi = comp.teams.length > 1 || cat.comps.length > 1;
        for (const team of comp.teams) {
          const mine = matches.filter((m) => m.homeId === team.id || m.awayId === team.id);
          for (const m of mine) {
            const home = m.homeId === team.id;
            let opp = home ? m.away : m.home;
            if (multi && team.label) opp = `${team.label} – ${opp}`;
            if (m.played) {
              const my = home ? m.hs : m.as, th = home ? m.as : m.hs;
              const win = my > th;
              const ot = /pp|sn|ss|n/i.test(m.ext);
              const code = cat.noEvents && !m.hs && !m.as ? 'O' : (win ? 'V' : my < th ? 'P' : 'R') + (ot ? 'pp' : '');
              gf += my; ga += th; anyPlayed = true;
              c.played.push([dmShort(m.date), opp, `${m.hs}:${m.as}${m.ext ? ' ' + m.ext : ''}`, code, venueName(m.venue), home ? 1 : 0, m.date, m.id ? `${comp.comp}/${m.id}` : '']);
              if (cat.roster && m.id) {
                const lu = await get(`/sk/stats/matches/${comp.comp}/x/match/${m.id}/lineup`);
                const myName = home ? m.home : m.away;
                parseLineup(lu, myName).forEach((h) => rosterLinks.add(h));
              }
            } else if (m.date) {
              c.next.push([dmShort(m.date), dayOf(m.date), m.time, opp, venueName(m.venue), home ? 1 : 0, m.date]);
            }
          }
        }
        if (!cat.noTable) {
          const st = parseStandings(await get(`/sk/stats/standings/${comp.comp}/x`));
          if (st.length) {
            const ids = comp.teams.map((t) => t.id);
            c.table = st.map((r) => [r.team, r.z, r.score, r.pts, ids.includes(r.id) ? 1 : 0]);
            for (const t of comp.teams) {
              const row = st.find((r) => r.id === t.id);
              if (row && row.z > 0) placeParts.push(`${row.pos}.`);
              if (row && comp.teams.length === 1) c.pts = row.pts;
            }
            if (comp.teams.length > 1) c.pts = st.filter((r) => ids.includes(r.id)).reduce((s, r) => s + r.pts, 0);
          }
        }
      }
      c.played.sort((a, b) => a[6].localeCompare(b[6]));
      c.next.sort((a, b) => (a[6] + a[2].padStart(5, '0')).localeCompare(b[6] + b[2].padStart(5, '0')));
      c.played = c.played.slice(-6);
      if (!cat.noEvents) c.played.forEach((p) => { if (p[7]) detailJobs.push([p[7], p[6]]); });
      c.next = c.next.slice(0, 4);
      c.league = [...new Set(leagues)].join(' · ');
      if (placeParts.length) c.place = placeParts.join(' / ');
      if (anyPlayed) c.score = `${gf}:${ga}`;
      out.cats[cat.id] = c;

      if (cat.roster) {
        const rows = [];
        for (const href of rosterLinks) {
          try { rows.push(parsePlayer(await get(href)).row); } catch (e) { console.warn('hráč', href, e.message); }
        }
        // brankári: sezónne čísla z oficiálnej tabuľky brankárov SZFB (profil hráča počíta aj zápasy na lavičke)
        try {
          const gk = {};
          for (const comp of cat.comps) for (const team of comp.teams) {
            const g = parseGoalies(await get(`/sk/stats/goalies/${comp.comp}/x?CompetitorID=${team.id}`));
            for (const [nm, v] of Object.entries(g)) {
              const a = gk[nm] || (gk[nm] = { gp: 0, w: 0, l: 0, sa: 0, ga: 0, sv: 0, min: 0, so: 0 });
              for (const k of Object.keys(a)) a[k] += v[k];
            }
          }
          if (!Object.keys(gk).length) throw new Error('súťaž nevedie štatistiky brankárov – ponechávam údaje z profilov');
          const fmt = (x, d) => x.toFixed(d).replace('.', ',');
          rows.forEach((r) => {
            if (!Array.isArray(r[1]) || r[1].length !== 4 || !/%/.test(r[1][3])) return; // len brankári
            const g = gk[r[0]];
            r[1] = g
              ? [String(g.gp), String(g.so), fmt(g.min ? (g.ga * 3600) / g.min : 0, 2), fmt(g.sa ? (g.sv * 100) / g.sa : 0, 2) + ' %', String(g.sa), String(g.ga), String(g.sv), `${Math.floor(g.min / 60)}:${String(g.min % 60).padStart(2, '0')}`, String(g.w), String(g.l)]
              : ['0', '0', '0,00', '0,00 %', '0', '0', '0', '0:00', '0', '0'];
          });
        } catch (e) { console.warn('brankári', cat.id, e.message); }
        out.players[cat.id] = rows;
      }
      console.log(`✓ ${cat.name}: ${c.played.length} výsledkov, ${c.next.length} zápasov v programe, hráči: ${out.players[cat.id]?.length ?? '-'}`);
    } catch (e) {
      failures++;
      console.error(`✗ ${cat.name}:`, e.message);
      if (old?.cats?.[cat.id]) out.cats[cat.id] = old.cats[cat.id];
      if (old?.players?.[cat.id]) out.players[cat.id] = old.players[cat.id];
    }
  }

  // detail zápasov (góly, asistencie, vylúčenia) – len pre posledné odohrané zápasy
  const DAY = 864e5;
  for (const [key, date] of detailJobs) {
    const prev = old?.matches?.[key];
    if (prev && prev.v === 2 && Date.now() - new Date(date + 'T12:00:00Z') > 5 * DAY) { out.matches[key] = prev; continue; }
    try {
      const [comp, id] = key.split('/');
      out.matches[key] = parseMatch(await get(`/sk/stats/matches/${comp}/x/match/${id}/Overview`));
    } catch (e) {
      console.warn('detail', key, e.message);
      if (prev) out.matches[key] = prev;
    }
  }
  console.log(`✓ detaily zápasov: ${Object.keys(out.matches).length}`);

  return { out, failures };
}
