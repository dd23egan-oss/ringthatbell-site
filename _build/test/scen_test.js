#!/usr/bin/env node
// Checks the playoff/bye/division scenario engine before the site is built.
//
//   node _build/test/scen_test.js [path/to/Index.html] [quick|full]
//
// The engine lives in the page source between "// <<SCEN-ENGINE" and "// SCEN-ENGINE>>". This script pulls
// that exact code out and tests it against leagueTruth() below: a separate, plain implementation of the league
// rules written from the rule text. For many complete finishes and many final points-for orders it checks
//   1. the engine's answer for every owner (always in / never in / in if these points comparisons hold),
//   2. the printed scenario lists: an owner gets there exactly when one of his lines applies,
//   3. the page's built-in audit: it accepts every good list and rejects lists that were tampered with.
// The build (make_static.py) runs this in quick mode and stops if anything fails.
const fs = require('fs'), path = require('path'), vm = require('vm');
const master = process.argv[2] && !/^(quick|full)$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'Index.master.html');
const mode = process.argv.includes('full') ? 'full' : 'quick';
const src = fs.readFileSync(master, 'utf8');
const a = src.indexOf('// <<SCEN-ENGINE'), b = src.indexOf('// SCEN-ENGINE>>');
if (a < 0 || b < 0) { console.error('scen_test: engine markers not found in ' + master); process.exit(1); }
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.X = { rtbScen: rtbScen, rtbScenList: rtbScenList, rtbScenAudit: rtbScenAudit, rtbScenCommon: rtbScenCommon, rtbScenLineHtml: rtbScenLineHtml };', ctx);
const { rtbScen, rtbScenList, rtbScenAudit, rtbScenCommon, rtbScenLineHtml } = ctx.X;
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'scen_fixture.json'), 'utf8'));

let seed = 20261127;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function mk(extra) {      // fixture standings plus hypothetical results [[week, winner, loser], ...]
  const wins = { ...FX.wins }, pf = { ...FX.pf }, h2h = {}; Object.keys(FX.h2h).forEach(k => h2h[k] = FX.h2h[k].slice());
  let played = 11;
  (extra || []).forEach(([wk, w, l]) => { played = Math.max(played, wk); wins[w]++; pf[w] += 100 + 60 * rnd(); pf[l] += 70 + 60 * rnd();
    (h2h[w + '|' + l] = h2h[w + '|' + l] || [0, 0])[0]++; (h2h[l + '|' + w] = h2h[l + '|' + w] || [0, 0])[1]++; });
  const rem = [];
  Object.keys(FX.sched).forEach(wk => { if (Number(wk) > played) FX.sched[wk].forEach(p => rem.push([p[0], p[1], Number(wk)])); });
  return { owners: FX.owners, div: FX.div, wins, pf, h2h, rem };
}
function leagueTruth(inp, mask, pf) {
  const { owners, div, rem } = inp, w = {}, h = {};
  owners.forEach(o => { w[o] = inp.wins[o]; });
  Object.keys(inp.h2h).forEach(k => { h[k] = inp.h2h[k][0]; });
  rem.forEach((g, i) => { const win = ((mask >> i) & 1) ? g[1] : g[0], lose = win === g[0] ? g[1] : g[0]; w[win]++; h[win + '|' + lose] = (h[win + '|' + lose] || 0) + 1; });
  function rank(teams) {        // record; two tied -> head-to-head then points; three or more tied -> points
    const vals = [...new Set(teams.map(t => w[t]))].sort((x, y) => y - x); let out = [];
    vals.forEach(v => { const tied = teams.filter(t => w[t] === v);
      if (tied.length >= 3) tied.sort((x, y) => pf[y] - pf[x]);
      else if (tied.length === 2) { const [x, y] = tied, xy = h[x + '|' + y] || 0, yx = h[y + '|' + x] || 0;
        if (xy !== yx) { if (yx > xy) tied.reverse(); } else if (pf[y] > pf[x]) tied.reverse(); }
      out = out.concat(tied); });
    return out;
  }
  const by = {}; owners.forEach(o => (by[div[o]] = by[div[o]] || []).push(o));
  const dr = {}; Object.keys(by).forEach(d => dr[d] = rank(by[d]));
  const auto = [dr.Premier[0], dr.Premier[1], dr.Second[0]];           // Premier top two + Second winner
  const q = auto.concat(rank(owners.filter(o => !auto.includes(o))).slice(0, 2));   // + two wildcards
  const bye2 = rank(q.filter(o => o !== dr.Premier[0]))[0];            // Premier winner + best of the other four
  return { po: new Set(q), bye: new Set([dr.Premier[0], bye2]), div: new Set(Object.keys(dr).map(d => dr[d][0])) };
}
function condHolds(c, pf, inp) {
  const P = (x, y) => pf[inp.owners[x]] > pf[inp.owners[y]];
  if (c.pairs) return c.pairs.every(p => P(p[0], p[1]));
  return c.th.S.filter(s => P(c.th.x, s)).length >= c.th.k;
}
function hits(E, ln, x, mask) {     // does this line's game-result part cover the finish? (points condition aside)
  if (ln.type === 'wins') return E.gained[x][mask] >= ln.k;
  if (((mask ^ ln.val) & ln.fixed) !== 0) return false;
  return !ln.alts || ln.alts.some(al => ((mask >> al[0]) & 1) === al[1]);
}
function check(label, inp, samples, pfPer, listKinds) {     // listKinds: which races also get their lists built and checked
  const t0 = Date.now(), E = rtbScen(inp), lists = {}, rem = inp.rem; let nLines = 0, bad = 0; const ex = [];
  listKinds = listKinds || E.kinds;
  const fail = msg => { bad++; if (ex.length < 5) ex.push(msg); };
  for (const k of listKinds) { lists[k] = {}; for (const o of inp.owners) { const L = rtbScenList(E, o, k, { maxLines: 100000 }); lists[k][o] = L; nLines += L.lines.length;
    if (!rtbScenAudit(E, o, k, L)) fail('built-in audit rejected a good list: ' + k + ' ' + o);
    { // results the page states once for the whole list ("needed in every scenario") really are part of every line
      const CM = rtbScenCommon(E, L, o), xo = inp.owners.indexOf(o);
      if (CM) { if (!CM.fixed) fail('empty shared part: ' + k + ' ' + o);
        L.lines.forEach(ln => { if (ln.type === 'cube') { if ((ln.fixed & CM.fixed) !== CM.fixed || ((ln.val ^ CM.val) & CM.fixed)) fail('shared part not in a line: ' + k + ' ' + o); }
          else if (ln.k !== E.R[xo]) fail('shared part with a partial win-total line: ' + k + ' ' + o); });
        if (E.total <= 4096) for (let q = 0; q < E.total; q++) if (((q ^ CM.val) & CM.fixed) && L.lines.some(ln => hits(E, ln, xo, q))) { fail('a line applies without the shared part: ' + k + ' ' + o); break; }
        L.lines.forEach(ln => { const h = rtbScenLineHtml(E, ln, o, v => v.toFixed(1), CM.fixed); if (!h || /Any combination/.test(h)) fail('line empty after the shared part: ' + k + ' ' + o); }); } }
    { // a "wins at least n" line must not sit next to a single simpler line about his own games that already says more
      const xo = inp.owners.indexOf(o); let own = 0; rem.forEach((g, i) => { if (g[0] === o || g[1] === o) own |= 1 << i; });
      const key = l => l.cond ? l.cond.key : '';
      L.lines.filter(l => l.type === 'wins').forEach(W => L.lines.forEach(C => {
        if (C === W || C.type !== 'cube' || key(C) !== key(W) || (C.fixed & ~own)) return;
        const Cown = C.alts ? { ...C, alts: C.alts.filter(al => own & (1 << al[0])) } : C;      // the part of it about his own games
        if (C.alts && !Cown.alts.length) return;
        let implied = true;
        for (let q = 0; q < E.total && implied; q++) if (hits(E, W, xo, q) && !hits(E, Cown, xo, q)) implied = false;
        if (implied) fail('redundant win-total line: ' + k + ' ' + o);
      })); }
    if (L.lines.length && E.total <= 4096) {
      // tamper 1: take away every line that covers one finish where he gets there -> the audit has to notice
      const x0 = inp.owners.indexOf(o), cl0 = E.cls[k][x0]; let m0 = -1;
      for (let q = 0; q < E.total && m0 < 0; q++) if (cl0[q] >= 1) m0 = q;
      if (m0 >= 0 && rtbScenAudit(E, o, k, { ...L, lines: L.lines.filter(l => !hits(E, l, x0, m0)) })) fail('built-in audit missed dropped lines: ' + k + ' ' + o);
      const cube = L.lines.find(l => l.type === 'cube' && l.fixed);
      if (cube) { const low = cube.fixed & -cube.fixed;
        if (rtbScenAudit(E, o, k, { ...L, lines: L.lines.map(l => l === cube ? { ...l, fixed: l.fixed & ~low, val: l.val & ~low } : l) })) fail('built-in audit missed a widened line: ' + k + ' ' + o); } } } }
  if (E.inexact) fail('engine flagged itself inexact');
  const all = samples >= E.total; let n = 0;
  for (let s = 0; s < (all ? E.total : samples); s++) {
    const mask = all ? s : Math.floor(rnd() * E.total);
    for (let r = 0; r < pfPer; r++) {
      const pf = {}; inp.owners.forEach(o => pf[o] = r === 0 ? inp.pf[o] : rnd());     // first pass: today's points order
      const T = leagueTruth(inp, mask, pf);
      for (const k of E.kinds) inp.owners.forEach((o, x) => {
        const truth = T[k].has(o), id = E.cls[k][x][mask]; n++;
        const pred = id < 2 ? id === 1 : E.classes[id].terms.some(t => t.pairs.every(p => pf[inp.owners[p[0]]] > pf[inp.owners[p[1]]]));
        if (pred !== truth) fail('engine: ' + k + ' ' + o + ' outcome ' + mask + ' truth ' + truth);
        if (!lists[k]) return;
        const match = lists[k][o].lines.some(ln => {
          if (ln.cond && !condHolds(ln.cond, pf, inp)) return false;
          if (ln.type === 'wins') return E.gained[x][mask] >= ln.k;
          if (((mask ^ ln.val) & ln.fixed) !== 0) return false;
          return !ln.alts || ln.alts.some(al => ((mask >> al[0]) & 1) === al[1]); });
        if (match !== truth) fail('list: ' + k + ' ' + o + ' outcome ' + mask + ' truth ' + truth + ' list ' + match);
      });
    }
  }
  console.log((bad ? 'FAIL ' : 'ok   ') + label + ': ' + inp.rem.length + ' games left, ' + nLines + ' lines, ' + n + ' checks, ' + (Date.now() - t0) + 'ms' + (bad ? ', ' + bad + ' failures' : ''));
  ex.forEach(e => console.log('     ' + e));
  return bad;
}
const pick = wk => FX.sched[wk].map(p => rnd() < .5 ? [Number(wk), p[1], p[0]] : [Number(wk), p[0], p[1]]);
let failures = 0;
const cfg = mode === 'full' ? { three: [12000, 4], two: [6, 6], one: [60, 40] } : { three: [3000, 3], two: [2, 3], one: [12, 12] };
// three weeks out the playoff and bye lists run to hundreds of lines each, so quick mode checks the engine's answers for
// all three races but only builds and audits the (short) division lists; full mode does everything
failures += check('3 weeks left', mk(), cfg.three[0], cfg.three[1], mode === 'full' ? null : ['div']);
for (let v = 0; v < cfg.two[0]; v++) failures += check('2 weeks left #' + (v + 1), mk(pick(12)), 1 << 30, cfg.two[1]);
for (let v = 0; v < cfg.one[0]; v++) failures += check('1 week left #' + (v + 1), mk(pick(12).concat(pick(13))), 1 << 30, cfg.one[1]);
console.log(failures ? 'scen_test: ' + failures + ' FAILURES' : 'scen_test: all checks passed (' + mode + ')');
process.exit(failures ? 1 : 0);
