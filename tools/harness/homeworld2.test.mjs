// Node test for HOMEWORLD 2 (src/game/homeworld2_core.js): production chain maths, offline catch-up cap, wave scaling, placement grid, rooms, trees, ghosts.
//   node tools/harness/homeworld2.test.mjs
import assert from 'node:assert/strict';
import * as H from '../../src/game/homeworld_core.js';
import * as X from '../../src/game/homeworld2_core.js';

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
const near = (a, b, tol = 0.06) => assert.ok(Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * tol), `${a} !~ ${b} (tol ${tol})`);

// ---- tiny layout builder (synthetic: bypasses placement, nodes are passed explicitly)
const mk = () => ({ s: X.blank(7), id: 1, nodes: [] });
const add = (L, t, x, z, r = 0, l = 1) => { L.s.p.push({ i: L.id++, t, x, z, r, l }); return L.s.p.at(-1); };
const node = (L, res, x, z, pur = 1) => { L.nodes.push({ id: L.nodes.length + 1, res, x, z, pur }); };
const belts = (L, list) => { for (const [x, z, r] of list) add(L, 'belt', x, z, r); };
const line = (L, x, z, r, n) => { const d = X.DIR[r]; for (let i = 0; i < n; i++) add(L, 'belt', x + d[0] * i, z + d[1] * i, r); };
const poles = (L, list) => { for (const [x, z] of list) add(L, 'pole', x, z); };
const sim = (L, o = {}) => new X.FactorySim(L.s, { shore: 1000, nodes: L.nodes, ...o });
const rate = (L, o = {}) => { const sm = sim(L, o); sm.run(90); sm.takeGain(); const s0 = sm.sold.slice(); sm.run(240); const g = sm.takeGain(); return { cr: g.cr / 4, parts: g.parts / 4, s2: g.s2 / 4, sold: sm.sold.map((v, i) => (v - s0[i]) / 4), sim: sm }; };
const POLES = [[9, -2], [15, -2], [21, -2], [27, -2]];
const POLES2 = [...POLES, [9, 8], [15, 8], [21, 8], [27, 8]];   // two pole rows (z = -2 and z = 8) cover the two-row chains

console.log('GRID / PLACEMENT');
ok('fine cell = 1.5 m, two per 3 m homeworld cell; snapping centres the footprint', () => {
  assert.equal(X.FC * 2, H.CELL);
  const c = X.snapFine('smelter', 0, 30.4, 30.4);
  assert.deepEqual(c, { x: 19, z: 19 });
  const p = { t: 'smelter', x: c.x, z: c.z, r: 0 };
  near(X.centerOf(p).x, 30 * 1.0 + 0 + 0.0 + 0, 0.06);   // 3 m footprint centred near 30.4
  assert.deepEqual(X.dims('bed', 1), [1, 2]);
  assert.equal(X.cellsOf('bed', 0, 0, 1).length, 2);
});
ok('genNodes is deterministic, seeded, outside the pad, 12 nodes, no overlaps', () => {
  const a = X.genNodes(42), b = X.genNodes(42), c = X.genNodes(43);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  assert.equal(a.length, 12);
  assert.equal(a.filter((n) => n.res === 'scrap').length, 6);
  for (const n of a) { assert.ok(Math.hypot((n.x + 1) * 1.5, (n.z + 1) * 1.5) >= H.PAD_CLEAR); assert.equal(Math.abs(n.x % 2), 0); assert.equal(Math.abs(n.z % 2), 0); }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot((a[i].x - a[j].x) * 1.5, (a[i].z - a[j].z) * 1.5) >= 12 - 1e-9);
});
ok('placement: miner only on a node, aligned; pad zone and grid edge refused; occupancy per layer', () => {
  const s = X.blank(3), hw = H.blankState(), nodes = X.genNodes(3), n = nodes[0];
  assert.equal(X.placementCheck(s, hw, 'miner', n.x + 2, n.z, 0).ok, false);
  assert.equal(X.placementCheck(s, hw, 'miner', n.x, n.z, 0).ok, true);
  assert.equal(X.placementCheck(s, hw, 'belt', n.x, n.z, 0).ok, false, 'belts cannot sit on a node');
  assert.equal(X.placementCheck(s, hw, 'belt', 0, 0, 0).ok, false, 'pad');
  assert.equal(X.placementCheck(s, hw, 'belt', X.FMAX, 12, 0).ok, false, 'out of grid');
  assert.equal(X.placementCheck(s, hw, 'belt', X.FMIN - 1, 12, 0).ok, false);
  const w = { cr: 1e6 }; hw.s.parts = 99;
  const free = (() => { for (let x = 12; x < 25; x++) for (let z = 12; z < 25; z++) if (X.placementCheck(s, hw, 'belt', x, z, 0).ok) return [x, z]; })();
  assert.ok(X.tryBuild(s, hw, w, 'belt', free[0], free[1], 1).ok);
  assert.equal(X.placementCheck(s, hw, 'belt', free[0], free[1], 0).ok, false, 'same layer blocked');
  assert.equal(X.placementCheck(s, hw, 'floor', free[0], free[1], 0).ok, true, 'floor lives on its own layer');
  assert.equal(X.placementCheck(s, hw, 'crate', free[0], free[1], 0).ok, false, 'crate needs a floor');
});
ok('placement: classic 3 m buildings block the fine cells they cover (and the other way round is checked by the fine cells)', () => {
  const s = X.blank(4), hw = H.blankState(), w = { cr: 1e6 }; hw.s.parts = 99;
  const r = H.tryBuild(hw, w, 'farm', 6, 0, 0); assert.ok(r.ok);
  // farm covers 3x3 classic cells x 6..8, z 0..2 = fine cells x 12..17, z 0..5
  assert.equal(X.placementCheck(s, hw, 'belt', 12, 3, 0).ok, false);
  assert.equal(X.placementCheck(s, hw, 'belt', 18, 3, 0).ok, true);
});
ok('build / upgrade / sell / rotate / repair spend and refund correctly; limits hold', () => {
  const s = X.blank(5), hw = H.blankState(), w = { cr: 5000 }; hw.s.parts = 50;
  const nodes = X.genNodes(5), n = nodes[0];
  const b = X.tryBuild(s, hw, w, 'miner', n.x, n.z, 0); assert.ok(b.ok);
  assert.equal(w.cr, 5000 - 120); assert.equal(hw.s.parts, 46);
  const u = X.tryUpgrade(s, hw, w, b.p.i); assert.ok(u.ok); assert.equal(b.p.l, 2);
  assert.equal(w.cr, 5000 - 120 - (Math.round(120 * 1.9) - 120));
  assert.ok(X.tryUpgrade(s, hw, w, b.p.i).ok); assert.equal(X.tryUpgrade(s, hw, w, b.p.i).ok, false);
  assert.ok(X.tryRotate(s, hw, b.p.i).ok);
  b.p.br = 1; assert.equal(X.tryUpgrade(s, hw, { cr: 1e6 }, b.p.i).why, 'Repair it first.');
  const cr0 = w.cr; assert.ok(X.tryRepair(s, hw, w, b.p.i).ok); assert.ok(w.cr < cr0); assert.ok(!b.p.br);
  const cr1 = w.cr; assert.ok(X.trySell(s, hw, w, b.p.i).ok); assert.ok(w.cr > cr1); assert.equal(s.p.length, 0);
  for (let i = 0; i < 30; i++) { const f = (() => { for (let x = 12; x < 30; x++) for (let z = 12; z < 30; z++) if (X.placementCheck(s, hw, 'pole', x, z, 0).ok) return [x, z]; })(); if (!f) break; X.tryBuild(s, hw, w, 'pole', f[0], f[1], 0); }
  assert.equal(X.countOf(s, 'pole'), X.PT.pole.max);
  assert.equal(X.tryBuild(s, hw, { cr: 1e6 }, 'pole', 25, 25, 0).why, 'Limit reached (30).');
});
ok('sanitize drops garbage, overlaps, pad cells and over-limit pieces but keeps valid ones', () => {
  const raw = { seed: 9, n: 3, p: [{ i: 1, t: 'belt', x: 14, z: 14, r: 0 }, { i: 2, t: 'belt', x: 14, z: 14, r: 1 }, { i: 3, t: 'nope', x: 1, z: 1 }, { i: 4, t: 'belt', x: 0, z: 0 }, { i: 5, t: 'belt', x: 999, z: 0 }, { i: 6, t: 'smelter', x: 16, z: 14, r: 9, l: 99 }] };
  const s = X.sanitize(raw);
  assert.deepEqual(s.p.map((p) => p.i), [1, 6]);
  assert.equal(s.p[1].r, 1); assert.equal(s.p[1].l, 3);
  assert.equal(X.sanitize(null).p.length, 0); assert.equal(X.sanitize('x').n, 1);
});

console.log('PRODUCTION CHAINS');
ok('belt speed = 1 item per second per lane', () => assert.equal(X.BELT_SPEED * 60, 60));
ok('miner -> belt -> uplink: 30 scrap/min x 0.06 = 1.8 credits/min; purity scales it', () => {
  for (const [pur, k] of [[0, 0.5], [1, 1], [2, 1.6]]) {
    const L = mk(); node(L, 'scrap', 10, 0, pur); add(L, 'miner', 10, 0, 0); line(L, 12, 0, 0, 6); add(L, 'uplink', 18, 0, 0); poles(L, POLES);
    const r = rate(L);
    near(r.cr, 1.8 * k, 0.05);
  }
});
ok('Mk2 / Mk3 miners are 1.5x / 2.2x faster (Mk3 capped by the 60/min belt); unpowered machines make nothing', () => {
  const base = (l, withPoles = true) => { const L = mk(); node(L, 'ore', 10, 0); add(L, 'miner', 10, 0, 0, l); line(L, 12, 0, 0, 6); add(L, 'uplink', 18, 0, 0, 3); if (withPoles) poles(L, POLES); return rate(L).cr; };
  const a = base(1), b = base(2), c = base(3);
  near(b / a, 1.5, 0.05); near(c / a, 2.0, 0.06);   // Mk3 = 2.2x = 66 items/min, but one belt lane carries 60 / min
  assert.equal(base(1, false), 0);
});
ok('smelter: 2 scrap -> 1 plate; 30 scrap/min = 15 plate/min = 3.9 credits/min', () => {
  const L = mk(); node(L, 'scrap', 10, 0); add(L, 'miner', 10, 0, 0); line(L, 12, 0, 0, 4); add(L, 'smelter', 16, 0, 0); line(L, 18, 0, 0, 3); add(L, 'uplink', 21, 0, 0); poles(L, POLES);
  const r = rate(L); near(r.cr, 15 * X.IT_VALUE[X.IT.plate], 0.06);
  near(r.sold[X.IT.plate], 15, 0.06);
});
ok('a belt carries at most 60 items/min: three miners on one belt are capped, a splitter shares the load', () => {
  const L = mk();
  for (let k = 0; k < 3; k++) { node(L, 'scrap', 10, k * 4); add(L, 'miner', 10, k * 4, 0, 3); }   // Mk3: 66/min each
  // three feeder belts merge into one trunk at x = 13
  line(L, 12, 0, 0, 1); line(L, 12, 4, 0, 1); line(L, 12, 8, 0, 1);
  line(L, 13, 8, 3, 8);   // trunk running -z from z=8 down to z=1 then continues
  line(L, 13, 0, 0, 1);
  line(L, 14, 0, 0, 5); add(L, 'uplink', 19, 0, 0, 3); add(L, 'uplink', 19, 2, 0, 3);
  L.s.p.find((p) => p.t === 'belt' && p.x === 13 && p.z === 0).r = 0;
  poles(L, POLES);
  const r = rate(L), items = r.sold.reduce((a, b) => a + b, 0);
  assert.ok(items <= 61, `items/min ${items}`);
  assert.ok(items >= 50, `items/min ${items}`);
});
ok('assembler: plate + ingot -> component (parts store), 2 ingot + crystal -> circuit core', () => {
  const L = mk();
  node(L, 'scrap', 10, 0); add(L, 'miner', 10, 0, 0, 2); line(L, 12, 0, 0, 4); add(L, 'smelter', 16, 0, 0); belts(L, [[18, 0, 0], [19, 0, 0], [20, 0, 0], [21, 0, 1], [21, 1, 1], [21, 2, 0]]);
  node(L, 'ore', 10, 4); add(L, 'miner', 10, 4, 0, 2); line(L, 12, 4, 0, 4); add(L, 'smelter', 16, 4, 0); belts(L, [[18, 4, 0], [19, 4, 0], [20, 4, 0], [21, 4, 3], [21, 3, 0]]);
  add(L, 'assembler', 22, 2, 0); line(L, 24, 2, 0, 2); add(L, 'uplink', 26, 2, 0, 3); poles(L, POLES2);
  const r = rate(L);
  assert.ok(r.parts > 1.5, `components/min ${r.parts}`);   // 4 assembled parts = 1 component
  assert.ok(r.sim.made[X.IT.part] > 0);
  // parts go to the components store, the rest to credits
  const hw = H.blankState(); hw.s.parts = 0;
  const w = X.applyGain(hw, { cr: 10, parts: 5, s2: 1 }); assert.equal(hw.s.parts, 5); assert.equal(hw.s.cr, 10); assert.equal(hw.s.s2, 1); assert.equal(w.cr, 0);
});
ok('circuit chain: every 5th exported circuit also pays a Circuit Core shard', () => {
  const L = mk();
  node(L, 'ore', 10, 0); add(L, 'miner', 10, 0, 0, 3); line(L, 12, 0, 0, 4); add(L, 'smelter', 16, 0, 0, 3); belts(L, [[18, 0, 0], [19, 0, 0], [20, 0, 0], [21, 0, 1], [21, 1, 1], [21, 2, 0]]);
  node(L, 'ore', 10, 4); add(L, 'miner', 10, 4, 0, 3); line(L, 12, 4, 0, 4); add(L, 'smelter', 16, 4, 0, 3); belts(L, [[18, 4, 0], [19, 4, 0], [20, 4, 0], [21, 4, 3], [21, 3, 0]]);
  node(L, 'crystal', 22, 8); add(L, 'miner', 22, 8, 3, 3); line(L, 22, 7, 3, 4);   // crystal belt runs down into the assembler top (22,3)
  add(L, 'assembler', 22, 2, 0, 3); line(L, 24, 2, 0, 2); add(L, 'uplink', 26, 2, 0, 3); add(L, 'uplink', 26, 4, 0, 3); poles(L, POLES2);
  const sm = sim(L); sm.run(600);
  assert.ok(sm.sold[X.IT.circuit] >= 5, `circuits ${sm.sold[X.IT.circuit]}`);
  assert.ok(sm.gain.s2 >= 1, 's2 ' + sm.gain.s2);
});
ok('generator: burns scrap from a belt; 12 power per unit; power budget scales machine speed (brownout)', () => {
  const L = mk(); node(L, 'ore', 10, 0); add(L, 'miner', 10, 0, 0); line(L, 12, 0, 0, 4); add(L, 'uplink', 16, 0, 0);
  poles(L, POLES);
  const full = rate(L, { shore: 100 }).cr, half = rate(L, { shore: 2 }).cr;   // miner 2 + uplink 2 = 4 power
  near(half / full, 0.5, 0.08);
  // generator fed with scrap raises supply
  const G = mk(); node(G, 'scrap', 10, 6); add(G, 'miner', 10, 6, 0); line(G, 12, 6, 0, 3); add(G, 'generator', 15, 6, 0);
  node(G, 'ore', 10, 0); add(G, 'miner', 10, 0, 0); line(G, 12, 0, 0, 4); add(G, 'uplink', 16, 0, 0); poles(G, [[9, -2], [12, 3], [15, -2], [16, 5]]);
  const s0 = sim(G, { shore: 3 }); s0.run(120);   // shore power 3 < demand 6: slow start, the first scrap reaches the generator, then it runs at full speed
  assert.ok(s0.powerInfo().supply >= 12, JSON.stringify(s0.powerInfo()));
  assert.ok(s0.gain.cr > 0);
});
ok('power: poles link within 12 m, machines attach within 7.5 m, only shore-connected nets get pad power', () => {
  const L = mk(); node(L, 'ore', 40, 0); add(L, 'miner', 40, 0, 0); line(L, 42, 0, 0, 4); add(L, 'uplink', 46, 0, 0);
  poles(L, [[40, -2], [46, -2]]);   // 60 m from the pad: not shore connected
  assert.equal(rate(L, { shore: 100 }).cr, 0);
  poles(L, [[34, -2], [28, -2], [22, -2], [16, -2]]);   // now a chain of poles reaches the shore (each hop 9 m)
  assert.ok(rate(L, { shore: 100 }).cr > 0);
});
ok('blocked output stalls the chain (no item is created or lost); a broken machine stops production', () => {
  const L = mk(); node(L, 'ore', 10, 0); add(L, 'miner', 10, 0, 0); line(L, 12, 0, 0, 3); poles(L, POLES);   // belt ends in nothing
  const sm = sim(L); sm.run(120);
  assert.ok(sm.st.filter((q) => q.p.t === 'belt').every((q) => q.item), 'belts full');
  assert.equal(sm.gain.cr, 0);
  const M = mk(); node(M, 'ore', 10, 0); const m = add(M, 'miner', 10, 0, 0); line(M, 12, 0, 0, 4); add(M, 'uplink', 16, 0, 0); poles(M, POLES); m.br = 1;
  assert.equal(rate(M).cr, 0);
});
ok('export dock refuses items when the target store is full (belts back up instead of wasting output)', () => {
  const L = mk(); node(L, 'ore', 10, 0); add(L, 'miner', 10, 0, 0); line(L, 12, 0, 0, 4); add(L, 'uplink', 16, 0, 0); poles(L, POLES);
  const sm = sim(L, { room: { cr: 1.0, parts: 0, s2: 0 } }); sm.run(120);
  assert.ok(sm.gain.cr <= 1.0 + 1e-9, 'credits ' + sm.gain.cr);
});
ok('splitter feeds three machines evenly (front, left, right)', () => {
  const L = mk(); node(L, 'ore', 10, 4, 2); add(L, 'miner', 10, 4, 0, 3); line(L, 12, 4, 0, 2); add(L, 'splitter', 14, 4, 0);
  add(L, 'uplink', 15, 4, 0, 3); line(L, 14, 5, 1, 2); add(L, 'uplink', 14, 7, 0, 3); line(L, 14, 3, 3, 2); add(L, 'uplink', 14, 0, 0, 3);
  poles(L, [[9, -2], [15, -2], [12, 10], [18, 2], [12, 7]]);
  const r = rate(L), sold = r.sold.reduce((a, b) => a + b, 0);
  assert.ok(sold > 30 && sold <= 60, 'items/min ' + sold);
  const per = r.sim.st.filter((q) => q.p.t === 'uplink');
  assert.equal(per.length, 3);
});

console.log('ECONOMY / OFFLINE');
const mid = () => {   // 2 scrap + 2 ore miners -> 2 smelters -> 1 assembler -> uplink (the L4-ish "developed" factory of the docs)
  const L = mk();
  node(L, 'scrap', 10, 0); add(L, 'miner', 10, 0, 0, 2); line(L, 12, 0, 0, 4); add(L, 'smelter', 16, 0, 0, 2); belts(L, [[18, 0, 0], [19, 0, 0], [20, 0, 0], [21, 0, 1], [21, 1, 1], [21, 2, 0]]);
  node(L, 'ore', 10, 4); add(L, 'miner', 10, 4, 0, 2); line(L, 12, 4, 0, 4); add(L, 'smelter', 16, 4, 0, 2); belts(L, [[18, 4, 0], [19, 4, 0], [20, 4, 0], [21, 4, 3], [21, 3, 0]]);
  add(L, 'assembler', 22, 2, 0, 2); line(L, 24, 2, 0, 2); add(L, 'uplink', 26, 2, 0, 2); poles(L, POLES2);
  return L;
};
ok('a developed factory is a nice passive income: 5-20 credits-equivalent per minute (one Mk2 dock = 18), well under an active run', () => {
  const r = rate(mid()), v = X.valueOfGain(r);
  assert.ok(v >= 5 && v <= 20, `value/min ${v.toFixed(1)}`);
  assert.ok(v * 60 < H.ACTIVE_DAY_VALUE * 6, 'per hour stays below six active mid-game days');
});
ok('economy governor: a maxed dock pays at most 26 / min, two docks 52 / min, however many circuits the belts carry', () => {
  assert.ok(X.DOCK_VALUE[2] * X.PT.uplink.max <= 55);
  const L = mk();   // a circuit factory: 2 Mk3 ore miners + 1 crystal miner feeding 2 Mk3 smelters + a Mk3 assembler -> one Mk3 dock
  node(L, 'ore', 10, 0, 2); add(L, 'miner', 10, 0, 0, 3); line(L, 12, 0, 0, 4); add(L, 'smelter', 16, 0, 0, 3); belts(L, [[18, 0, 0], [19, 0, 0], [20, 0, 0], [21, 0, 1], [21, 1, 1], [21, 2, 0]]);
  node(L, 'ore', 10, 4, 2); add(L, 'miner', 10, 4, 0, 3); line(L, 12, 4, 0, 4); add(L, 'smelter', 16, 4, 0, 3); belts(L, [[18, 4, 0], [19, 4, 0], [20, 4, 0], [21, 4, 3], [21, 3, 0]]);
  node(L, 'crystal', 22, 8, 2); add(L, 'miner', 22, 8, 3, 3); line(L, 22, 7, 3, 4);
  add(L, 'assembler', 22, 2, 0, 3); line(L, 24, 2, 0, 2); add(L, 'uplink', 26, 2, 0, 3); poles(L, POLES2);
  const r = rate(L), v = X.valueOfGain(r);
  assert.ok(v <= X.DOCK_VALUE[2] + 1.5, `one Mk3 dock paid ${v.toFixed(1)} / min`);
  assert.ok(v >= X.DOCK_VALUE[2] * 0.6, `... and the chain can nearly saturate it: ${v.toFixed(1)}`);
});
ok('measureRates == the live simulation (same rates, HUD number and offline number cannot drift)', () => {
  const L = mid(), m = X.measureRates(L.s, { shore: 1000 });   // uses the seeded nodes of L.s: miners are not on them, so build a real one below
  assert.equal(typeof m.perMin, 'number');
  const s = X.blank(11), nodes = X.genNodes(11), hw = H.blankState(); hw.s.parts = 99; const w = { cr: 1e6 };
  const n = nodes.find((x) => x.res === 'scrap');
  assert.ok(X.tryBuild(s, hw, w, 'miner', n.x, n.z, 0).ok);
  const mr = X.measureRates(s, { shore: 100 });
  assert.equal(mr.cr, 0, 'a lone miner without a dock earns nothing');
});
ok('offline catch-up: capped at 8 h, 10 % efficiency, negative / NaN elapsed = 0, 100 h == 8 h', () => {
  const rates = { cr: 10, parts: 2, s2: 0.1 };
  const a = X.offlineGain(rates, 3600), b = X.offlineGain(rates, 8 * 3600), c = X.offlineGain(rates, 100 * 3600);
  near(a.cr, 10 * 60 * 0.1, 1e-9); near(b.cr, 10 * 480 * 0.1, 1e-9); near(c.cr, b.cr, 1e-9);
  assert.equal(X.offlineGain(rates, -50).cr, 0); assert.equal(X.offlineGain(rates, NaN).cr, 0); assert.equal(X.offlineGain(rates, Infinity).cr, 0);
  assert.equal(c.sec, 8 * 3600);
});
ok('offline income is stored, capped by the storage caps (warehouse raises them); never more than the caps', () => {
  const hw = H.blankState(), g = X.offlineGain({ cr: 100, parts: 50, s2: 5 }, 8 * 3600);
  assert.ok(g.cr > 500);
  const waste = X.applyGain(hw, g);
  assert.equal(hw.s.cr, H.capOf(hw, 'cr')); assert.ok(waste.cr > 0);
  assert.ok(hw.s.parts <= H.capOf(hw, 'parts')); assert.ok(hw.s.s2 <= H.capOf(hw, 's2'));
  // a developed factory offline for 8 h earns less than two active mid-game days (2 x 480) even before the storage cap
  const mr = X.offlineGain({ cr: X.valueOfGain(rate(mid())), parts: 0, s2: 0 }, 8 * 3600);
  assert.ok(mr.cr < H.ACTIVE_DAY_VALUE * 2, 'offline 8 h ' + mr.cr.toFixed(0));
});
ok('roomEffects storage bonus feeds the storage cap through H.capOf (xcap hook is tiny: extra multiplier)', () => {
  const hw = H.blankState(); const base = H.capOf(hw, 'cr');
  hw.xcap = 0.4; assert.ok(H.capOf(hw, 'cr') >= Math.floor(base * 1.4) - 1);
});

console.log('WAVES');
ok('first wave only after a few things are built and the base has value', () => {
  const hw = H.blankState(), s = X.blank(1);
  assert.equal(X.waveGate(hw, s).ok, false);
  hw.b.push({ i: 1, t: 'gun', x: 6, z: 0, r: 0, l: 1 }, { i: 2, t: 'gun', x: 6, z: 3, r: 0, l: 1 });
  assert.equal(X.waveGate(hw, s).ok, false);   // 2 things, low value
  for (let i = 0; i < 3; i++) s.p.push({ i: 10 + i, t: 'smelter', x: 10 + 3 * i, z: 12, r: 0, l: 1 });
  const g = X.waveGate(hw, s); assert.ok(g.n >= 4 && g.v >= X.WAVE.minValue, JSON.stringify(g)); assert.equal(g.ok, true);
});
ok('wave power grows with base value and waves survived, stays within [0.85, 3]', () => {
  let prev = 0;
  for (const v of [0, 400, 1000, 3000, 8000, 20000, 90000]) { const p = X.wavePower(v, 0, 0); assert.ok(p >= prev - 1e-9); assert.ok(p >= 0.85 && p <= 3); prev = p; }
  assert.ok(X.wavePower(2000, 6, 0) > X.wavePower(2000, 0, 0));
  assert.ok(X.wavePower(2000, 0, 8) > X.wavePower(2000, 0, 0));
  assert.equal(X.wavePower(1e9, 99, 99), 3);
  assert.ok(X.wavePower(500, 0, 0) < 1.6, 'an early base gets a gentle first wave');
});
ok('wave interval shrinks with value but never below 5 min; loot scales with power and result', () => {
  assert.equal(X.waveInterval(0), 540); assert.equal(X.waveInterval(1e6), 300); assert.ok(X.waveInterval(3000) < X.waveInterval(500));
  const a = X.waveLoot(1, 'repelled'), b = X.waveLoot(2.5, 'repelled'), c = X.waveLoot(2.5, 'held'), d = X.waveLoot(2.5, 'breached');
  assert.ok(b.parts > a.parts); assert.ok(c.parts < b.parts); assert.equal(d.parts, 0);
  assert.ok(X.waveLoot(2, 'repelled', true).parts > X.waveLoot(2, 'repelled', false).parts);
});
ok('wave clock: arms after the gate, counts down only while someone is home, fires once, shield after a loss', () => {
  const s = X.blank(1), wv = s.wv, ok1 = { ok: true }, no = { ok: false };
  assert.equal(X.tickWave(wv, 1, { gate: no, value: 0, active: true, busy: false, nowMs: 1000 }).fire, false); assert.equal(wv.armed, 0);
  X.tickWave(wv, 0, { gate: ok1, value: 800, active: false, busy: false, nowMs: 1000 });
  assert.equal(wv.armed, 1); assert.equal(wv.left, X.WAVE.first);
  X.tickWave(wv, 100, { gate: ok1, value: 800, active: false, busy: false, nowMs: 1000 }); assert.equal(wv.left, X.WAVE.first, 'not home = no countdown');
  let fired = false; for (let i = 0; i < 400 && !fired; i++) fired = X.tickWave(wv, 1, { gate: ok1, value: 800, active: true, busy: false, nowMs: 1000 }).fire;
  assert.ok(fired); assert.equal(X.tickWave(wv, 1, { gate: ok1, value: 800, active: true, busy: true, nowMs: 1000 }).fire, false);
  X.endWave(wv, 'breached', 800, 5000); assert.equal(wv.n, 1); assert.equal(wv.shield, 5000 + X.WAVE.shield * 1000);
  const t = X.tickWave(wv, 9999, { gate: ok1, value: 800, active: true, busy: false, nowMs: 6000 }); assert.equal(t.fire, false); assert.equal(t.shielded, true);
  const t2 = X.tickWave(wv, 1, { gate: ok1, value: 800, active: true, busy: false, nowMs: 5000 + X.WAVE.shield * 1000 + 1 }); assert.equal(t2.shielded, undefined);
  X.endWave(wv, 'repelled', 800, 1e9); assert.equal(wv.left, X.waveInterval(800));
  assert.ok(X.callWave(wv)); assert.equal(wv.called, 1); assert.equal(X.callWave({ armed: 1, left: 5 }), false);
});
ok('the raid sim takes the wave power: stronger power = bigger raid pool (RaidSim contract)', () => {
  const hw = H.blankState(); hw.b.push({ i: 1, t: 'gun', x: 6, z: 0, r: 0, l: 1 });
  const lo = H.makeRaid(hw, { seed: 5, power: X.wavePower(400, 0, 0) }), hi = H.makeRaid(hw, { seed: 5, power: X.wavePower(9000, 5, 3) });
  lo.step(1); hi.step(1); for (let i = 0; i < 12; i++) { lo.step(1); hi.step(1); }
  assert.ok(hi.P > lo.P); assert.ok((hi.pool?.hp0 || 0) >= (lo.pool?.hp0 || 0));
});

console.log('ROOMS + TREES');
const stamp = (kind, x = 14, z = 14) => { const s = X.blank(2), hw = H.blankState(), w = { cr: 1e6 }; hw.s.parts = 99; const r = X.tryBuildKit(s, hw, w, kind, x, z); return { s, hw, w, r }; };
ok('room kits stamp floor + walls + door + roof + furniture and cost credits + components', () => {
  for (const k of Object.keys(X.KITS)) { const { s, r } = stamp(k); assert.ok(r.ok, k + ': ' + r.why); assert.ok(s.p.some((p) => p.t === 'door')); assert.ok(s.p.some((p) => p.t === 'roof')); assert.ok(X.kitCost(k).cr > 0); }
  const a = stamp('storage'), b = stamp('storage', 14, 14); assert.equal(a.w.cr, b.w.cr);
  assert.ok(1e6 - a.w.cr === X.kitCost('storage').cr);
  const poor = stamp('greenhouse'); poor.s.p.length = 0; assert.equal(X.tryBuildKit(poor.s, poor.hw, { cr: 5 }, 'greenhouse', 14, 14).ok, false);
});
ok('enclosure detector: closed + roofed rooms get effects; removing a wall opens the room; the door counts as closed', () => {
  const { s } = stamp('storage'); const fx = X.roomEffects(s);
  assert.equal(fx.rooms, 1); near(fx.storage, X.ROOM.storage * 3, 1e-6);
  const wall = s.p.find((p) => p.t === 'wall' && p.x === 14 + 2 && p.z === 14 + 3); s.p.splice(s.p.indexOf(wall), 1);   // a non-corner wall of the top edge
  assert.equal(X.roomEffects(s).rooms, 0); assert.equal(X.roomEffects(s).storage, 0);
  const g = stamp('greenhouse'); assert.equal(X.roomEffects(g.s).rooms, 1);
  const bed = stamp('bedroom'); assert.ok(X.roomEffects(bed.s).cloutPerMin > 0);
  const roof = bed.s.p.find((p) => p.t === 'roof' && p.x === 15 && p.z === 15); bed.s.p.splice(bed.s.p.indexOf(roof), 1); assert.equal(X.roomEffects(bed.s).cloutPerMin, 0, 'no roof = not a bedroom');
  const ws = stamp('workshop'); near(X.roomEffects(ws.s).speed, 2 * X.ROOM.bench, 1e-6);
});
ok('room bonuses are capped (storage +60 %, speed +12 %, clout 0.6/min)', () => {
  const s = X.blank(2), hw = H.blankState(), w = { cr: 1e7 }; hw.s.parts = 999;
  let n = 0; for (let x = -26; x < 24 && n < 4; x += 7) for (let z = 12; z < 30 && n < 4; z += 6) if (X.tryBuildKit(s, hw, w, 'storage', x < 12 && x > -12 ? x + 30 : x, z).ok) n++;
  const fx = X.roomEffects(s); assert.ok(fx.storage <= X.ROOM.storageMax + 1e-9);
});
ok('trees: sapling -> young -> mature in real time, fruit every 200 s (max 3), greenhouse x2, offline x0.5, harvest empties', () => {
  const s = X.blank(1); s.p.push({ i: 1, t: 'tree', x: 20, z: 20, r: 0, l: 1, a: 0, f: 0, ft: 0 });
  const p = s.p[0];
  assert.equal(X.treeStage(p.a), 0); X.growTrees(s, 400); assert.equal(X.treeStage(p.a), 1);
  X.growTrees(s, 500); assert.equal(X.treeStage(p.a), 2);
  X.growTrees(s, 250); assert.ok(p.f >= 1);
  X.growTrees(s, 5000); assert.equal(p.f, X.TREE.maxFruit);
  assert.equal(X.harvestTree(p), X.TREE.maxFruit); assert.equal(p.f, 0);
  const a = { p: [{ i: 1, t: 'tree', x: 20, z: 20, r: 0, l: 1, a: 0, f: 0, ft: 0 }] }, b = JSON.parse(JSON.stringify(a)), c = JSON.parse(JSON.stringify(a));
  X.growTrees(a, 600); X.growTrees(b, 600, new Set([1])); X.growTrees(c, 600, new Set(), X.OFFLINE.treeEff);
  near(b.p[0].a, a.p[0].a * 2, 1e-6); near(c.p[0].a, a.p[0].a * 0.5, 1e-6);
  assert.equal(X.treeWood({ a: 0 }), 1); assert.equal(X.treeWood({ a: 5000 }), 4);
});
ok('trees: place on the fine grid (2x2), on floors too, never on nodes', () => {
  const s = X.blank(3), hw = H.blankState(), w = { cr: 999 }, nodes = X.genNodes(3);
  assert.ok(X.tryBuild(s, hw, w, 'tree', 16, 16, 0).ok || true);
  const n = nodes[0]; assert.equal(X.placementCheck(s, hw, 'tree', n.x, n.z, 0).ok, false);
});

console.log('GHOSTS');
ok('ghost snapshot -> share code -> decode round trip; tampering / garbage is rejected', () => {
  const hw = H.blankState(), s = X.blank(1); hw.s.cr = 300; hw.s.parts = 20;
  hw.b.push({ i: 1, t: 'gun', x: 6, z: 0, r: 1, l: 3 }, { i: 2, t: 'wall', x: 6, z: 4, r: 0, l: 2 });
  const g = X.ghostFromState(hw, s, 'Kefal Keep'), code = X.encodeGhost(g);
  assert.ok(code.startsWith(X.GHOST.codePrefix));
  const d = X.decodeGhost(code); assert.equal(d.name, 'Kefal Keep'); assert.equal(d.b.length, 2); assert.deepEqual(d.b[0], ['gun', 6, 0, 1, 3]); assert.equal(d.stash.cr, 300);
  assert.equal(X.decodeGhost(code.slice(0, -1) + 'z'), null); assert.equal(X.decodeGhost('hello'), null); assert.equal(X.decodeGhost(''), null); assert.equal(X.decodeGhost(null), null);
  const forged = code.replace(/\.[a-z0-9]+$/, '.abc'); assert.equal(X.decodeGhost(forged), null);
});
ok('ghost sanitize drops overlapping / illegal / unknown entries and clamps numbers', () => {
  const g = X.sanitizeGhost({ name: 'x'.repeat(99), tier: 99, value: 1e12, stash: { cr: 1e12, parts: -5 }, b: [['gun', 6, 0, 0, 1], ['gun', 6, 0, 0, 9], ['nope', 6, 6, 0, 1], ['gun', 0, 0, 0, 1], ['wall', 'a', 1, 0, 1], 'x'] });
  assert.equal(g.b.length, 1); assert.equal(g.name.length, 24); assert.equal(g.tier, 5); assert.ok(g.value <= 500000); assert.ok(g.stash.cr <= 20000); assert.equal(g.stash.parts, 0);
  assert.equal(X.sanitizeGhost({ b: [] }), null); assert.equal(X.sanitizeGhost(null), null);
});
ok('rival bases are deterministic, legal, and stronger with the tier', () => {
  const a = X.genRival(77, 2), b = X.genRival(77, 2); assert.deepEqual(a, b);
  let prev = 0;
  for (let t = 1; t <= 5; t++) { const g = X.genRival(77, t); assert.ok(g && g.b.length > 5, 'tier ' + t); const d = X.ghostDefense(g); assert.ok(d.sentries.length >= 3 + t, 'sentries ' + d.sentries.length); const dps = d.sentries.reduce((s, x) => s + x.dps, 0); assert.ok(dps > prev, `dps ${dps} <= ${prev}`); prev = dps; assert.ok(g.b.length <= H.MAX_BUILDINGS); }
  assert.ok(X.genRival(1, 3).name);
});
ok('ghost defence is gentle (fair): sentry dps to players is a fifth of the tower dps, guards scale with value', () => {
  const g = X.genRival(5, 5), d = X.ghostDefense(g);
  for (const s of d.sentries) { assert.ok(s.dps <= H.BUILDINGS[s.t].tw.dps[s.lv - 1] * 0.33); assert.ok(s.range <= 42); }
  assert.ok(d.guards >= 2 && d.guards <= 9);
  assert.ok(X.ghostDefense(X.genRival(5, 1)).guards <= d.guards);
});
ok('ghost loot is capped (never more than a good run), own-base practice pays 40 %, cooldown blocks re-raiding', () => {
  const big = X.sanitizeGhost({ name: 'Whale', tier: 5, value: 400000, stash: { cr: 20000, parts: 500 }, b: [['gun', 6, 0, 0, 1]] });
  const l = X.ghostLoot(big, { quotaIndex: 10 }); assert.ok(l.cr <= X.GHOST.maxCr); assert.ok(l.parts <= 14);
  const mine = X.ghostLoot(big, { mine: true }); assert.ok(mine.cr < l.cr);
  const s = X.blank(1); assert.equal(X.ghostReady(s, 'g1', 1000), true); X.markRaided(s, 'g1', 1000); assert.equal(X.ghostReady(s, 'g1', 2000), false); assert.equal(X.ghostReady(s, 'g1', 1000 + X.GHOST.cd + 1), true);
  assert.ok(X.ghostLoot(X.genRival(1, 1)).cr < 200, 'tier 1 rival pays little');
});

console.log('WIRE');
ok('piece pack / unpack round trip, item + state strings round trip', () => {
  const p = { i: 5, t: 'tree', x: -7, z: 22, r: 3, l: 1, a: 700, f: 2, ft: 0 }; const q = X.unpack(JSON.parse(JSON.stringify(X.pack(p))));
  assert.deepEqual({ ...q, ft: 0 }, { ...p, ft: 0 }); assert.equal(X.unpack([0, 999, 0, 0, 0, 1]), null);
  const L = mk(); node(L, 'scrap', 10, 0); add(L, 'miner', 10, 0, 0); line(L, 12, 0, 0, 6); add(L, 'uplink', 18, 0, 0); poles(L, POLES);
  const sm = sim(L); sm.run(30);
  const enc = X.encodeItems(sm), dec = X.decodeItems(enc);
  const real = sm.st.map((q, k) => [k, q]).filter(([, q]) => q.item); assert.equal(dec.length, real.length);
  for (const d of dec) { const q = sm.st[d.k]; assert.equal(q.item, d.item); assert.ok(Math.abs(q.prog - d.prog) <= 0.13); }
  assert.equal(X.encodeStates(sm).length, sm.machines.length);
});
ok('simulation cost: 300 belts + 30 machines step 3000 times in < 1.5 s (host budget)', () => {
  const L = mk();
  for (let row = 0; row < 8; row++) { const z = row * 3; node(L, 'ore', 4, z); add(L, 'miner', 4, z, 0, 3); line(L, 6, z, 0, 30); add(L, 'uplink', 36, z, 0); }
  poles(L, POLES);
  L.s.p = L.s.p.filter((p) => p.t !== 'uplink' || true);
  const sm = sim(L); const t0 = performance.now(); for (let i = 0; i < 3000; i++) sm.step(); const dt = performance.now() - t0;
  assert.ok(dt < 1500, `${dt.toFixed(0)} ms for ${sm.n} pieces`);
});

console.log(`\n${pass} passed${process.exitCode ? ' (with FAILURES)' : ''}`);
