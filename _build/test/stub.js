// Deterministic fake league data in the getCoreData() shape, for offline UI tests.
const O = ['Brendan','Brian','Chris','Devin','Drew','Gray','John','Murph','Robbie','Ryan','Tom','Vik'];
const DIV = { Premier: ['Ryan','Brendan','Murph','Vik'], Second: ['Brian','Drew','Chris','Tom'], Third: ['Gray','John','Robbie','Devin'] };
const divOf = o => Object.keys(DIV).find(d => DIV[d].includes(o));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const GH = ['Year','SerialWeek','WeekLabel','Set','PlayoffGame','ConsolationGame','Owner','PointsFor','Opponent','PointsAgainst','Result'];
const SH = ['Year','Owner','Division','Seed','FinalRank','Wins','Losses','WinPct','PointsFor','PointsAgainst','PlayoffAppearance','LeagueChampion','RunnerUp','ThirdPlace','ScoringTitle','DivisionChampion','ConsolationChampion'];
const CH = ['Year','Champion','RunnerUp','ThirdPlace','ScoringTitle','RegularSeasonTopSeed','ConsolationChampion'];
const games = [], seasons = [], champs = [];
let sw = 0;
for (let y = 2024; y <= 2026; y++) {
  const st = {}; O.forEach(o => st[o] = { w: 0, l: 0, pf: 0, pa: 0 });
  const weeks = y === 2026 ? 9 : 14;
  for (let w = 1; w <= weeks; w++) {
    sw++;
    for (let i = 0; i < 6; i++) {
      const a = O[(i + w) % 12], b = O[(i + w + 6) % 12];
      const sa = Math.round((85 + rnd() * 75) * 100) / 100, sb = Math.round((85 + rnd() * 75) * 100) / 100;
      games.push([y, sw, 'Week ' + w, 'Regular Season', false, false, a, sa, b, sb, sa > sb ? 'W' : 'L']);
      games.push([y, sw, 'Week ' + w, 'Regular Season', false, false, b, sb, a, sa, sb > sa ? 'W' : 'L']);
      st[a].pf += sa; st[a].pa += sb; st[b].pf += sb; st[b].pa += sa;
      if (sa > sb) { st[a].w++; st[b].l++; } else { st[b].w++; st[a].l++; }
    }
  }
  const order = O.slice().sort((p, q) => st[q].w - st[p].w || st[q].pf - st[p].pf);
  order.forEach((o, i) => seasons.push([y, o, divOf(o), i < 6 ? i + 1 : '', i + 1, st[o].w, st[o].l,
    st[o].w / (st[o].w + st[o].l), Math.round(st[o].pf * 100) / 100, Math.round(st[o].pa * 100) / 100,
    i < 6, y < 2026 && i === 0, y < 2026 && i === 1, y < 2026 && i === 2, i === 3, false, false]));
  if (y < 2026) champs.push([y, order[0], order[1], order[2], order[3], order[0], order[11]]);
}
module.exports = {
  ownerNames: O,
  seasons: { headers: SH, rows: seasons },
  champions: { headers: CH, rows: champs },
  games: { headers: GH, rows: games }
};
