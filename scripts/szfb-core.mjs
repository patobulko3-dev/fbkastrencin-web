// Jadro sťahovania – nezávislé od prostredia (Node aj prehliadač).
import { parseResults, parseStandings, parseLineup, parsePlayer, DAYS } from './szfb-parse.mjs';

export async function scrapeAll(cfg, get, old) {
  const venueName = (v) => (/M-?Šport|Ostrov/i.test(v) ? 'ARENA OSTROV' : v);
  const dmShort = (iso) => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };
  const dayOf = (iso) => DAYS[new Date(iso + 'T12:00:00Z').getUTCDay()];

  const out = { updated: new Date().toISOString(), season: cfg.season, cats: {}, players: {} };
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
              const code = (win ? 'V' : 'P') + (ot ? 'pp' : '');
              gf += my; ga += th; anyPlayed = true;
              c.played.push([dmShort(m.date), opp, `${m.hs}:${m.as}${m.ext ? ' ' + m.ext : ''}`, code, venueName(m.venue), home ? 1 : 0, m.date]);
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


  return { out, failures };
}
