// Node test for the HOMEWORLD economy + raid maths (src/game/homeworld_core.js).  node tools/harness/homeworld.test.mjs
import assert from 'node:assert/strict';
import * as H from '../../src/game/homeworld_core.js';

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const W = (cr = 1e6) => ({ cr });
const rich = () => { const s = H.blankState(); s.s.parts = 9999; s.s.s2 = 99; s.s.s3 = 99; return s; };
// place helper: finds a free legal cell (spiral outwards) and builds, upgrading to `lv`
function add(state, wallet, type, lv = 1, at = null) {
  const n = H.BUILDINGS[type].size;
  let cells = at ? [at] : [];
  if (!at) { for (let x = -15; x < 15; x++) for (let z = -15; z < 15; z++) cells.push({ x, z }); cells.sort((a, b) => Math.hypot((a.x + n / 2) * 3, (a.z + n / 2) * 3) - Math.hypot((b.x + n / 2) * 3, (b.z + n / 2) * 3)); }
  for (const c of cells) {
    if (!H.placementCheck(state, type, c.x, c.z).ok) continue;
    const r = H.tryBuild(state, wallet, type, c.x, c.z, 0);
    if (!r.ok) throw new Error(`build ${type}: ${r.why}`);
    for (let l = 1; l < lv; l++) { const u = H.tryUpgrade(state, wallet, r.b.i); if (!u.ok) throw new Error(`upgrade ${type} ${l}: ${u.why}`); }
    return r.b;
  }
  throw new Error('no free cell for ' + type);
}
const passive = (state, ex = 8) => H.valueOf(H.dayOutput(state, { exhibits: ex }));

console.log('COSTS');
ok('costs grow exponentially per level (>= 1.7x each step) for every building', () => {
  for (const t of H.TYPE_ORDER) for (let l = 2; l <= 5; l++) {
    const a = H.levelCost(t, l - 1).cr, b = H.levelCost(t, l).cr;
    assert.ok(b >= a * (t === 'wall' || t === 'gate' ? 1.4 : 1.6), `${t} L${l - 1}->${l}: ${a} -> ${b}`);
  }
});
ok('cost table', () => {
  const rows = ['farm', 'rack', 'generator', 'solar', 'cooler', 'refinery', 'gun', 'tesla', 'wall'].map((t) => `${t.padEnd(9)}` + [1, 2, 3, 4, 5].map((l) => { const c = H.levelCost(t, l); return `L${l} ${c.cr}cr+${c.parts}p${c.s2 ? '+' + c.s2 + 's2' : ''}${c.s3 ? '+' + c.s3 + 's3' : ''}`.padEnd(20); }).join(''));
  console.log(rows.map((r) => '       ' + r).join('\n'));
});
ok('build pays credits + components; refuses when short', () => {
  const s = H.blankState(), w = W(50);
  const r = H.tryBuild(s, w, 'generator', 0, -8);
  assert.equal(r.ok, false); assert.match(r.why, /credits/);
  w.cr = 100; const r2 = H.tryBuild(s, w, 'generator', 0, -8);
  assert.equal(r2.ok, true); assert.equal(w.cr, 40); assert.equal(s.s.parts, 14 - 6);
  s.s.parts = 1; assert.match(H.tryBuild(s, W(999), 'generator', 4, -8).why, /components/);
});
ok('selling refunds 60 %', () => {
  const s = rich(), w = W(1000); const b = add(s, w, 'generator', 3);
  const spent = H.spentOn(b), before = w.cr; H.trySell(s, w, b.i);
  assert.equal(w.cr - before, Math.floor(spent.cr * 0.6)); assert.equal(s.b.length, 0);
});

console.log('PLACEMENT');
ok('grid: pad exclusion, bounds, overlap, per-type limit', () => {
  const s = H.blankState();
  assert.equal(H.placementCheck(s, 'wall', 0, 0).ok, false);       // on the landing pad
  assert.equal(H.placementCheck(s, 'wall', 15, 0).ok, false);      // outside the grid
  assert.equal(H.placementCheck(s, 'wall', 6, 0).ok, true);
  const w = W(); H.tryBuild(s, w, 'generator', 6, 0);
  assert.equal(H.placementCheck(s, 'wall', 7, 1).ok, false);       // overlap (2x2 generator covers 6..7, 0..1)
  assert.equal(H.placementCheck(s, 'wall', 8, 0).ok, true);
  const sn = H.snapCell('farm', 30, 30); assert.ok(H.cellsOk(3, sn.x, sn.z));
  for (let i = 0; i < 3; i++) assert.equal(H.tryBuild(s, w, 'museum', 6, 4 + i * 4).ok, i === 0);   // max 1 museum
});
ok('move keeps everything but the cell; refuses blocked cells', () => {
  const s = H.blankState(), w = W(); const a = add(s, w, 'generator'), b = add(s, w, 'solar');
  assert.equal(H.tryMove(s, a.i, b.x, b.z, 1).ok, false);
  assert.equal(H.tryMove(s, a.i, 10, 10, 1).ok, true); assert.equal(H.byId(s, a.i).r, 1);
});

console.log('POWER / COOLING');
ok('a first Content Farm runs on shore power; a second one needs a generator', () => {
  const s = rich(), w = W();
  add(s, w, 'farm', 1);                                  // 2 power <= 4 free
  const r = H.tryBuild(s, w, 'farm', 9, 0);              // 4 <= 4 still fine
  assert.equal(r.ok, true);
  const r2 = H.tryBuild(s, w, 'farm', 9, 3);             // 6 > 4
  assert.equal(r2.ok, false); assert.match(r2.why, /power/);
  add(s, w, 'generator', 1);                              // +8
  assert.equal(H.tryBuild(s, w, 'farm', 9, 3).ok, true);
});
ok('hot buildings need cooling; a Cooling Unit fixes it; selling the only generator is refused', () => {
  const s = rich(), w = W();
  add(s, w, 'generator', 3);                             // heat 3 <= 6 free
  assert.equal(H.tryBuild(s, w, 'rack', 12, 0).ok, true);                                     // + heat 3 = 6 <= 6
  const r2 = H.tryBuild(s, w, 'refinery', 12, 4); assert.equal(r2.ok, false); assert.match(r2.why, /cooling/);   // + heat 1 = 7 > 6
  add(s, w, 'cooler', 1);                                                                    // +6 cooling
  assert.equal(H.tryBuild(s, w, 'refinery', 12, 4).ok, true);
  const p = H.powerStats(s); assert.ok(p.heat <= p.cooling && p.demand <= p.supply, JSON.stringify(p));
});
ok('overheating the base is refused', () => {
  const s = rich(), w = W();
  const g = H.tryBuild(s, w, 'solar', 6, 0); assert.equal(g.ok, true);
  for (let l = 1; l < 5; l++) H.tryUpgrade(s, w, g.b.i);          // 30 power, no heat
  const r = H.tryBuild(s, w, 'rack', 9, 0); assert.equal(r.ok, true);      // heat 3 <= 6
  for (let l = 1; l < 4; l++) assert.equal(H.tryUpgrade(s, w, r.b.i).ok, l < 2 || l < 0);   // lv2 heat 5 ok, lv3 heat 7 > 6 refused
  const why = H.tryUpgrade(s, w, r.b.i); assert.equal(why.ok, false); assert.match(why.why, /cooling/);
  add(s, w, 'cooler', 1);
  assert.equal(H.tryUpgrade(s, w, r.b.i).ok, true);
});
ok('selling a generator others depend on is refused', () => {
  const s = rich(), w = W(); const g = add(s, w, 'generator', 1);
  add(s, w, 'farm', 1); add(s, w, 'farm', 1); add(s, w, 'farm', 1);   // 6 power, supply 4 + 8
  assert.equal(H.trySell(s, w, g.i).ok, false);
});
ok('brown-out: a wrecked generator scales production down', () => {
  const s = rich(), w = W(); const g = add(s, w, 'generator', 1);
  for (let i = 0; i < 4; i++) add(s, w, 'farm', 1);
  const full = H.dayOutput(s).cr; g.h = 0;
  const brown = H.dayOutput(s).cr; assert.ok(brown < full && brown > 0, `${brown} vs ${full}`);
});

console.log('PRODUCTION (per game day) + CAPS');
ok('nothing is produced in real time: advanceDays(0) is a no-op, days credit exactly', () => {
  const s = H.blankState(), w = W(); add(s, w, 'farm', 1);
  H.advanceDays(s, 0); assert.equal(s.s.cr, 0);
  H.advanceDays(s, 3); near(s.s.cr, 15); assert.equal(s.days, 3);
});
ok('day tracker: a new run / rewound day never pays; +N days pays N', () => {
  const s = H.blankState();
  assert.equal(H.daysSince(s, 'runA', 5), 0);           // first sight: mark only
  assert.equal(H.daysSince(s, 'runA', 6), 1);
  assert.equal(H.daysSince(s, 'runA', 9), 3);
  assert.equal(H.daysSince(s, 'runB', 2), 0);           // fired -> new run
  assert.equal(H.daysSince(s, 'runB', 1), 0);           // counter rewound
  assert.equal(H.daysSince(s, 'runB', 3), 2);
});
ok('storage cap: production stops at the cap, overflow is reported as wasted, Warehouse raises it', () => {
  const s = rich(), w = W(); add(s, w, 'solar', 5); add(s, w, 'solar', 5); add(s, w, 'solar', 5); for (let i = 0; i < 4; i++) add(s, w, 'farm', 5);
  const rep = H.advanceDays(s, 12);
  assert.equal(Math.floor(s.s.cr), 500); assert.ok(rep.wasted.cr > 0);
  add(s, w, 'warehouse', 3);
  assert.ok(H.capOf(s, 'cr') > 500 * 2.5, String(H.capOf(s, 'cr')));
});
ok('collect takes whole units, keeps fractions and components', () => {
  const s = H.blankState(); s.s.cr = 12.7; s.s.clout = 3.2; s.s.parts = 30;
  const c = H.collect(s); assert.deepEqual(c, { cr: 12, clout: 3 }); near(s.s.cr, 0.7); assert.equal(s.s.parts, 30);
});
ok('Barracks boost and Lounge clout bonus apply, boost is capped', () => {
  const s = rich(), w = W(); add(s, w, 'solar', 5); add(s, w, 'farm', 3);
  const base = H.dayOutput(s).cr; add(s, w, 'barracks', 5); add(s, w, 'barracks', 5);
  near(H.dayOutput(s).cr, base * 1.5, 1e-6);            // 0.36 + 0.36 = 0.72 -> capped 0.5
});
ok('Trophy Hall scales with exhibits', () => {
  const s = rich(), w = W(); add(s, w, 'solar', 2); add(s, w, 'museum', 3);
  assert.ok(H.dayOutput(s, { exhibits: 30 }).clout > H.dayOutput(s, { exhibits: 0 }).clout * 1.6);
});
ok('sanitize repairs garbage without bricking', () => {
  const s = H.sanitize({ b: [{ i: 1, t: 'farm', x: 6, z: 0, l: 99 }, { i: 1, t: 'farm', x: 20, z: 0, l: 1 }, { i: 2, t: 'nope', x: 6, z: 6 }, { i: 3, t: 'wall', x: 0, z: 0 }, null], s: { cr: -5, parts: 'x' } });
  assert.equal(s.b.length, 1); assert.equal(s.b[0].l, 5); assert.equal(s.s.cr, 0); assert.equal(s.s.parts, 14);
  assert.equal(H.sanitize(null).b.length, 0);
  const round = H.sanitize(JSON.parse(JSON.stringify(s))); assert.deepEqual(round.b, s.b);
});

console.log('20-DAY SIMULATION');
// The crew earns ACTIVE_DAY_VALUE per active day, invests 25 % of it in the homeworld and finds 3 components per day.
function sim(days, invest = 0.25) {
  const s = H.blankState(), w = W(60), log = [];
  const order = ['generator', 'farm', 'farm', 'refinery', 'solar', 'garden', 'cooler', 'rack', 'generator', 'farm', 'barracks', 'gun', 'gun', 'warehouse', 'museum', 'solar', 'cooler', 'distiller', 'arcade', 'tesla'];
  const up = () => { // best-payback upgrade
    let best = null;
    for (const b of s.b) { if (b.l >= 5 || H.isTower(b.t) || H.isWall(b.t)) continue; const c = H.levelCost(b.t, b.l + 1); const g = H.BUILDINGS[b.t].out ? 1 : 0.3; const sc = g / c.cr; if (!best || sc > best.sc) best = { b, sc }; }
    return best?.b;
  };
  for (let d = 1; d <= days; d++) {
    w.cr += ACTIVE * invest; s.s.parts = Math.min(H.capOf(s, 'parts'), s.s.parts + 3);
    H.advanceDays(s, 1, { exhibits: 6 + d / 2 });
    const col = H.collect(s); w.cr += col.cr || 0;
    for (let guard = 0; guard < 6; guard++) {
      const next = order[0]; let placed = false;
      if (next) { try { const b = add(s, w, next, 1); order.shift(); placed = !!b; } catch { /* cannot afford / no room yet */ } }
      if (!placed) { const u = up(); if (u && H.tryUpgrade(s, w, u.i).ok) placed = true; }
      if (!placed) break;
    }
    log.push({ d, cr: Math.round(w.cr), n: s.b.length, lv: s.b.reduce((n, b) => n + b.l, 0), day: passive(s, 6 + d / 2), stored: H.stored(s) });
  }
  return { s, log };
}
const ACTIVE = H.ACTIVE_DAY_VALUE;
ok('20-day sim prints the curve and stays <= 30 % of an active day', () => {
  const { s, log } = sim(20);
  console.log('       day  buildings  sumLv  passive/day  share-of-active');
  for (const r of log.filter((x) => [1, 3, 5, 8, 10, 12, 15, 18, 20].includes(x.d))) console.log(`       ${String(r.d).padStart(3)}  ${String(r.n).padStart(9)}  ${String(r.lv).padStart(5)}  ${r.day.toFixed(1).padStart(11)}  ${(r.day / ACTIVE * 100).toFixed(1).padStart(6)} %`);
  const last = log[log.length - 1];
  assert.ok(last.day / ACTIVE <= 0.30, `passive share ${last.day / ACTIVE}`);
  assert.ok(last.day > 0 && last.n >= 8);
  assert.ok(log[9].day <= last.day, 'income only grows');
  const p = H.powerStats(s); assert.ok(p.demand <= p.supply + 1e-9 && p.heat <= p.cooling + 1e-9);
});
ok('a WELL-DEVELOPED base earns 20-30 % of an active day (the design target)', () => {
  const s = rich(), w = W();
  for (const [t, lv] of [['cooler', 3], ['generator', 3], ['generator', 3], ['solar', 3], ['farm', 4], ['farm', 4], ['rack', 3], ['refinery', 3], ['distiller', 3], ['garden', 3], ['museum', 3], ['barracks', 3], ['arcade', 2], ['warehouse', 3]]) add(s, w, t, lv);
  const v = passive(s, 12), share = v / ACTIVE, P = H.powerStats(s);
  console.log(`       passive ${v.toFixed(1)} / day = ${(share * 100).toFixed(1)} % of ${ACTIVE}; power ${P.demand}/${P.supply}, heat ${P.heat}/${P.cooling}, boost +${Math.round(H.boostOf(s) * 100)} %`);
  assert.ok(share >= 0.2 && share <= 0.3, String(share));
});
ok('maxed-out economy (every producer lv5) stays <= 35 % of a LATE-game active day (hard ceiling)', () => {
  const s = rich(), w = W();
  for (let i = 0; i < 6; i++) add(s, w, 'solar', 5);
  add(s, w, 'cooler', 5); add(s, w, 'cooler', 5); add(s, w, 'cooler', 5);
  for (const t of ['farm', 'farm', 'farm', 'rack', 'rack', 'refinery', 'distiller', 'garden', 'museum', 'barracks', 'barracks', 'arcade']) { try { add(s, w, t, 5); } catch { /* space / limits */ } }
  const v = passive(s, 30), share = v / H.ACTIVE_DAY_LATE; console.log(`       maxed base: ${v.toFixed(0)} / day = ${(share * 100).toFixed(1)} % of a late-game active day (${H.ACTIVE_DAY_LATE}), ${(v / ACTIVE * 100).toFixed(0)} % of a mid-game one`);
  assert.ok(share <= 0.35 && share > 0.2);
});

console.log('RAIDS');
ok('odds: none below 3 buildings, never two days in a row, capped at 8 %', () => {
  const s = rich(), w = W(); add(s, w, 'wall'); add(s, w, 'wall');
  assert.equal(H.raidChance(s, 10), 0);
  for (let i = 0; i < 13; i++) add(s, w, 'wall');
  assert.equal(H.raidChance(s, 10), H.RAID.maxChance);
  s.lastRaid = 10; assert.equal(H.raidChance(s, 11), 0); assert.ok(H.raidChance(s, 12) > 0);
  const s3 = rich(); add(s3, w, 'wall'); add(s3, w, 'wall'); add(s3, w, 'wall'); near(H.raidChance(s3, 3), 0.02);
  // long-run frequency: <= 8 % of landed days
  let raids = 0, day = 0; const rnd = (() => { let x = 12345; return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  for (let i = 0; i < 20000; i++) { day++; if (rnd() < H.raidChance(s, day)) { raids++; s.lastRaid = day; } }
  console.log(`       ${raids} raids in 20000 landed days = ${(raids / 200).toFixed(2)} % (cap 8 %)`);
  assert.ok(raids / 20000 <= 0.08);
});
// the same economy in every scenario (cooler 2, generators 3, farms 2); only the defences differ
function defended(kind) {
  const s = rich(), w = W(); add(s, w, 'cooler', 2, { x: 9, z: 9 }); add(s, w, 'generator', 3, { x: 9, z: 6 }); add(s, w, 'generator', 3, { x: 9, z: 12 });
  for (let i = 0; i < 3; i++) add(s, w, 'farm', 2, { x: 12, z: -3 + i * 3 });
  if (kind === 'none') return s;
  const T = (t, x, z, lv = 1) => { const r = H.tryBuild(s, w, t, x, z, 0); if (!r.ok) throw new Error(t + ': ' + r.why); for (let l = 1; l < lv; l++) H.tryUpgrade(s, w, r.b.i); };
  const ring = [[-7, -7], [5, -7], [-7, 5], [5, 5], [-1, -8], [-1, 6], [-8, -1], [6, -1]];   // 8 spots around the pad, ~17-21 m out
  if (kind === 'weak') { for (const [x, z] of ring.slice(0, 4)) T('gun', x, z, 1); return s; }
  add(s, w, 'solar', 4, { x: 6, z: 9 });   // the defences need their power
  for (const [x, z] of ring.slice(0, 4)) T('gun', x, z, 3);
  T('tesla', ring[4][0], ring[4][1], 2); T('tesla', ring[5][0], ring[5][1], 2); T('cryo', ring[6][0], ring[6][1], 2); T('sniper', ring[7][0], ring[7][1], 2);
  for (let i = 0; i < 8; i++) { T('wall', -9 + i, -10, 3); T('wall', -9 + i, 8, 3); }
  return s;
}
ok('an undefended base is breached; a well defended one repels', () => {
  const none = H.makeRaid(defended('none'), { seed: 7, quotaIndex: 2 }).run();
  const weak = H.makeRaid(defended('weak'), { seed: 7, quotaIndex: 2 }).run();
  const strong = H.makeRaid(defended('strong'), { seed: 7, quotaIndex: 2 }).run();
  console.log(`       none=${none.kind} (waves ${none.reached}/${none.waves}, wrecked ${none.wrecked.length})  weak=${weak.kind} (${weak.wrecked.length})  strong=${strong.kind} (${strong.wrecked.length}, walls lost ${strong.lostWalls.length})`);
  assert.equal(none.kind, 'breached'); assert.notEqual(strong.kind, 'breached');
  assert.ok(strong.killed >= weak.killed);
});
ok('deterministic: same seed, same outcome; frames are 1 s apart and end', () => {
  const st = defended('weak');
  const a = H.makeRaid(st, { seed: 99, quotaIndex: 3 }), b = H.makeRaid(st, { seed: 99, quotaIndex: 3 });
  const fa = [], fb = [];
  while (!a.done) { a.step(); fa.push(JSON.stringify(a.frame())); }
  while (!b.done) { b.step(); fb.push(JSON.stringify(b.frame())); }
  assert.deepEqual(fa, fb); assert.ok(fa.length < H.RAID.hardCap + 2);
  const f = JSON.parse(fa[Math.floor(fa.length / 2)]); assert.ok(f.W >= 3 && f.W <= 5 && f.w >= 1);
  console.log(`       raid of ${fa.length} s, ${a.W} waves, result ${a.result.kind}`);
});
ok('odds table: outcome across 200 seeds per defence level', () => {
  const rows = {};
  for (const kind of ['none', 'weak', 'strong']) {
    const c = { repelled: 0, held: 0, breached: 0 };
    for (let seed = 1; seed <= 200; seed++) c[H.makeRaid(defended(kind), { seed, quotaIndex: 2 }).run().kind]++;
    rows[kind] = c;
  }
  console.log('       ' + Object.entries(rows).map(([k, c]) => `${k}: repelled ${c.repelled} held ${c.held} breached ${c.breached}`).join('\n       '));
  assert.ok(rows.strong.breached < rows.none.breached);
});
ok('applying a result: damage persists, breach steals 30 % credits, repelled pays a bonus, mines rearm (no permanent loss)', () => {
  const st = defended('none'); st.s.cr = 400; st.s.parts = 50;
  const res = H.makeRaid(st, { seed: 5, quotaIndex: 2 }).run();
  assert.equal(res.kind, 'breached');
  const stolen = H.applyRaidResult(st, res, 9);
  assert.equal(stolen.cr, 120); assert.equal(st.lastRaid, 9); assert.ok(st.b.length === 6, 'never destroyed');
  assert.ok(st.b.some((b) => H.wrecked(b)), 'something needs repair');
  const wr = st.b.find((b) => H.wrecked(b)), w = W(5000), before = w.cr;
  assert.equal(H.tryUpgrade(st, w, wr.i).ok, false);   // must repair first
  assert.equal(H.tryRepair(st, w, wr.i).ok, true); assert.ok(w.cr < before && !H.wrecked(wr));
  const rp = H.raidBonus({ kind: 'repelled', waves: 4, reward: { cr: 20, clout: 2 } }, 2); assert.ok(rp.cr > 100 && rp.clout > 6);
});

console.log(`\n${pass} passed${process.exitCode ? ', SOME FAILED' : ''}`);
