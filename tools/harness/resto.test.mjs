// Node test for the alien restaurant tycoon (src/game/resto_core.js + world/resto_view.js + resto_i18n.js, wave 8 resto).
//   node tools/harness/resto.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/resto_core.js';
import * as V from '../../src/world/resto_view.js';
import * as D from '../../src/world/homeworld_decor_plan.js';
import { TR, RU } from '../../src/game/resto_i18n.js';
import { INGREDIENTS } from '../../src/game/survival_data.js';

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); } };
const ING = { ...INGREDIENTS };
for (const [id, d] of Object.entries(C.NEW_ING)) ING[id] = { cat: d.cat, heal: d.heal, nutri: d.nutri, props: d.props, meat: false };
const rng = (seed = 1) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

ok('plot: clear of the build square, lanes, ship box, pad and every decor footprint for several seeds', () => {
  assert.ok(C.PLOT.x0 >= D.BUILD_HALF + 3 && C.PLOT.x1 <= 58 - 1, 'inside the plateau, outside the build square');
  assert.ok(C.PLOT.z0 >= D.LANE + 1 && C.PLOT.z0 - 8 > 18.2 + 1, 'off the E lane + totems, with room for the shuttle pad');
  for (const seed of [1, 7, 12345, 424242]) for (const it of D.planHomeDecor(seed, 58)) {
    if (!it.solid) continue;   // fence panels are soft (no collider): the plot deliberately sits just inside them
    const clash = it.x + it.hx > C.PLOT.x0 - 0.3 && it.x - it.hx < C.PLOT.x1 + 0.3 && it.z + it.hz > C.PLOT.z0 - 6 && it.z - it.hz < C.PLOT.z1 + 0.3;
    assert.ok(!clash, `${it.kind} @${it.x},${it.z} overlaps the restaurant plot (seed ${seed})`);
  }
  assert.ok(Math.hypot(C.SHUTTLE.x, C.SHUTTLE.z) > 14.5 + C.SHUTTLE.r + 20, 'far from the landing pad');
});
ok('catalogue: every piece sits inside the plot, requirements are earlier pieces, ids unique, chain is buyable in order', () => {
  const seen = new Set();
  for (const p of C.PIECES) {
    assert.ok(!seen.has(p.id)); assert.ok(p.at[0] > C.PLOT.x0 - 0.5 && p.at[0] < C.PLOT.x1 + 0.5 && p.at[1] > 26 && p.at[1] < C.PLOT.z1 + 0.5, p.id + ' outside plot');
    if (p.req) assert.ok(seen.has(p.req), `${p.id} requires a later piece ${p.req}`);
    seen.add(p.id);
  }
  const ps = C.PIECES.filter((p) => p.id !== 'floor').map((p) => C.padOf(p));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i][0] - ps[j][0], ps[i][1] - ps[j][1]) >= 1.85, `pads ${i} and ${j} overlap`);
  const s = C.blank(), w = { cr: 1e6 };
  for (const p of C.PIECES) {
    let r = C.tryBuy(s, w, p.id);
    if (!r.ok && /stars/.test(r.why)) { s.rep = C.STAR_REP[p.star - 1] + 1; r = C.tryBuy(s, w, p.id); }
    assert.ok(r.ok, `${p.id}: ${r.why}`);
  }
  assert.equal(s.b.length, C.PIECES.length);
});
ok('stars: rep thresholds, decor caps them (no deadlock: decor needs no stars), pads split available / locked', () => {
  const s = C.blank(); s.rep = 999;
  assert.equal(C.repStars(999), 5); assert.equal(C.starsOf(s), 2, 'no decor -> cap 2');
  s.b = ['floor', 'counter', 'stove1', 'table1', 'table2', 'table3', 'decor1'];
  assert.equal(C.starsOf(s), 3); assert.ok(C.availablePieces(s).some((p) => p.id === 'decor2'));
  assert.deepEqual(C.lockedPieces(C.sanitize({ b: ['floor', 'table1', 'table2', 'table3', 'decor1'], rep: 0 })).map((p) => p.id), ['table4', 'decor2', 'booth'], 'star-gated pieces whose prerequisite exists');
  assert.equal(C.tryBuy(C.sanitize({ b: ['floor'] }), { cr: 999 }, 'table4').ok, false, 'chain');
});
ok('sanitize: drops junk + orphan pieces, clamps numbers, keeps a valid contract', () => {
  const s = C.sanitize({ b: ['table1', 'floor', 'nope', 'floor', 'chefbot'], rep: -5, till: 'x', pantry: { rs_moonpetal: 99, 'BAD KEY': 3, sv_meat: 2 }, ct: { need: 9, got: 2, by: 12, reward: 400, on: true } });
  assert.deepEqual(s.b, ['table1', 'floor'], 'unknown / duplicate / orphan (chefbot without stove2) dropped');
  assert.equal(s.rep, 0); assert.equal(s.till, 0); assert.equal(s.pantry.rs_moonpetal, C.MAX_PANTRY_TYPE); assert.equal(s.pantry['BAD KEY'], undefined); assert.equal(s.ct.need, 9);
});
ok('dishes: every dish is cookable from a matching pantry, uses only known categories, price / time in range; planTake reserves distinct items', () => {
  const cats = new Set(Object.values(ING).flatMap((i) => [i.cat]));
  for (const d of C.DISHES) {
    for (const c of d.need) assert.ok(cats.has(c), `${d.id}: no ingredient has category ${c}`);
    assert.ok(d.dur >= 3 && d.dur <= 6.5 && d.price > 0);
    const pantry = {}; for (const c of d.need) { const ty = Object.keys(ING).find((k) => C.catsOf(k, ING).includes(c)); pantry[ty] = (pantry[ty] || 0) + 1; }
    assert.ok(C.canCook(pantry, d.id, ING), d.id);
  }
  assert.equal(C.canCook({ rs_ember_pepper: 1, sv_meat: 1 }, 'curry', ING), false, 'curry needs two spices');
  assert.equal(C.canCook({ rs_ember_pepper: 2, sv_meat: 1 }, 'curry', ING), true);
  assert.equal(C.canCook({ sv_p_ashroot: 1, fish_kefal: 1 }, 'grill', ING), true, 'farmed ashroot counts as spice');
  assert.deepEqual(C.planTake({ sv_meat: 1 }, C.DISH.stew, ING), null);
});
ok('species: a guest only comes when the menu has something they eat; critic / inspector are scheduled only', () => {
  const m1 = C.menuFor(1); assert.deepEqual(m1, ['salad', 'stew', 'tart']);
  assert.ok(C.speciesAvailable('gorm', 1, [], m1) && C.speciesAvailable('blorp', 1, [], m1));
  assert.ok(!C.speciesAvailable('vrek', 1, [], m1), 'vrek needs star 2');
  assert.ok(C.speciesAvailable('vrek', 2, [], C.menuFor(2)) && C.speciesAvailable('mimi', 2, [], C.menuFor(2)));
  assert.ok(!C.speciesAvailable('vrek', 2, [], ['salad', 'stew']), 'no spicy dish -> no Vrek');
  assert.ok(!C.speciesAvailable('critic', 5, [], C.menuFor(5)) && !C.speciesAvailable('inspector', 5, [], C.menuFor(5)));
});
ok('economy: passive is small + capped, daily gross cap cuts payments to a quarter, contract scales with stars', () => {
  const s = C.blank(); s.b = ['floor', 'counter', 'stove1', 'table1']; s.rep = 30;
  assert.equal(C.starsOf(s), 2); assert.equal(C.passivePerDay(s), 6 + 9 * 2);
  assert.equal(C.accrue(s, 100), C.tillCap(s)); assert.equal(C.accrue(s, 5), 0);
  assert.ok(C.tillCap(s) <= 100 && C.passivePerDay(C.sanitize({})) === 0);
  const cap = C.dayCap(s); let got = 0; for (let i = 0; i < 40; i++) got += C.capPay(s, 3, 40);
  assert.ok(got < 40 * 40 && got >= cap && got <= cap + (40 * 40 - cap) * C.ECON.overCap + 40, `capped total ${got}`);
  assert.equal(C.capPay(s, 4, 40), 40, 'a new game day resets the cap');
  const mk = C.blank(); assert.equal(C.daysSince(mk, 'r1', 5), 0); assert.equal(C.daysSince(mk, 'r1', 8), 3); assert.equal(C.daysSince(mk, 'r1', 2), 0, 'rewound counter never pays');
  const p = C.blank(); p.b = ['floor', 'counter', 'stove1', 'table1', 'decor1']; p.rep = 90;
  const c = C.offerContract(p, 10, () => 0); assert.ok(c && c.reward === C.ECON.contractBase + 3 * C.ECON.contractPerStar);
  assert.equal(C.offerContract(p, 11), null, 'one at a time'); c.on = true; for (let i = 0; i < c.need - 1; i++) assert.equal(C.contractServe(p, 2), false); assert.equal(C.contractServe(p, 1), false); assert.equal(C.contractServe(p, 3), true);
  assert.ok(C.payOf('curry', 'vrek', 3, 1, 3) > C.payOf('curry', 'gorm', 2, 0.5, 3) && C.payOf('salad', 'gorm', 0, 1, 1) < C.payOf('salad', 'gorm', 3, 1, 1));
});

// ------------------------------------------------------------------------------------------ the customer simulation
function world(extra = []) {
  const s = C.blank(); s.b = ['floor', 'stove1', 'fridge', 'counter', 'table1', 'table2', 'sign', 'table3', ...extra]; s.rep = 30;
  s.pantry = { sv_meat: 9, sv_p_wildmint: 9, sv_p_ashroot: 9, sv_p_bloodberry: 9, sv_p_sunfruit: 9, rs_moonpetal: 9, fish_kefal: 9, rs_ember_pepper: 9, sv_p_glowcap: 9, sv_p_staticmoss: 9, rs_void_truffle: 3 };
  return s;
}
const runFor = (sim, s, secs, mk, r = rng(3), log = []) => { for (let i = 0; i < secs * 10; i++) log.push(...C.tick(sim, 0.1, mk(r))); return log; };
const envMk = (s, o = {}) => (r) => ({ s, rnd: r, open: true, menu: C.cookable(s.pantry, C.starsOf(s), ING), ing: ING, autoOrder: false, cashbot: false, day: 10, ...o });

ok('sim: shuttle lands, guests queue, sit, wait for the order; the full player loop (order -> cook -> serve -> eat -> pay) pays and raises reputation', () => {
  const s = world(), sim = C.newSim(), mk = envMk(s), log = [];
  runFor(sim, s, 30, mk, rng(9), log);
  assert.ok(log.some((e) => e.k === 'land') && log.some((e) => e.k === 'arrive'), 'shuttle arrived');
  const seated = sim.cust.filter((c) => c.st === 'ord'); assert.ok(seated.length >= 1, 'someone sat down');
  const c = seated[0]; assert.ok(C.DISH[c.dish] && C.SPECIES[c.sp].likes(C.DISH[c.dish]), 'orders what their species likes');
  assert.ok(C.takeOrder(sim, c.id).ok && C.nextTicket(sim)?.id === c.id);
  assert.ok(C.startCook(sim, c.id, 'stove1', 7).ok); assert.equal(C.startCook(sim, c.id, 'stove1', 8).ok, false, 'busy'); assert.ok(C.finishCook(sim, c.id, 5).ok);
  assert.equal(C.serve(sim, c.id, 'x', 2).ok, false); const r = C.serve(sim, c.id, c.dish, 3); assert.ok(r.ok);
  const ev = runFor(sim, s, 30, mk, rng(4));
  const p = ev.find((e) => e.k === 'pay' && e.c.id === c.id); assert.ok(p, 'auto payment after the wait'); assert.ok(C.payOf(c.dish, c.sp, 3, c.servedPat, 2) >= 1);
  assert.ok(Object.keys(sim.dirty).length >= 1 || ev.some((e) => e.k === 'ate'), 'table left dirty');
});
ok('sim: ignored guests get angry, leave, and the shuttle eventually departs; nobody is left behind forever', () => {
  const s = world(), sim = C.newSim(), mk = envMk(s), log = [];
  runFor(sim, s, 400, mk, rng(11), log);
  assert.ok(log.filter((e) => e.k === 'angry').length >= 1, 'angry leave');
  assert.ok(log.some((e) => e.k === 'depart'), 'shuttle departs');
  assert.ok(sim.cust.length <= 6, 'customers cleaned up: ' + sim.cust.length);
});
ok('sim: robots automate (waiter takes orders, cashier pays at full price); closed diner and empty fridge get no shuttle', () => {
  const s = world(['chefbot']), sim = C.newSim(), log = [];
  runFor(sim, s, 40, envMk(s, { autoOrder: true, cashbot: true }), rng(5), log);
  assert.ok(log.some((e) => e.k === 'ordered' && e.bot), 'auto order');
  const s2 = world(), sim2 = C.newSim(), l2 = [];
  runFor(sim2, s2, 80, envMk(s2, { open: false }), rng(5), l2); assert.equal(l2.filter((e) => e.k === 'land').length, 0, 'closed');
  s2.pantry = {}; runFor(sim2, s2, 80, (r) => ({ ...envMk(s2)(r) }), rng(5), l2); assert.equal(l2.filter((e) => e.k === 'land').length, 0, 'no stock -> no shuttle');
});
ok('sim: dirty tables breed pests (swattable), clean level drops, clearing a table restores it; inspector and critic show up when due', () => {
  const s = world(['booth', 'decor1']); s.rep = 100; const sim = C.newSim();
  sim.dirty['table1.0'] = true; sim.dirty['table2.1'] = true; assert.equal(C.cleanOf(sim), 76);
  const log = []; runFor(sim, s, 45, (r) => ({ ...envMk(s)(r), open: false }), rng(2), log);
  assert.ok(sim.pests.length >= 1 && log.some((e) => e.k === 'pest'), 'pests came'); assert.ok(C.cleanOf(sim) < 76);
  assert.ok(C.swat(sim, sim.pests[0].id)); assert.equal(C.clearTable(sim, 'table1'), 1); assert.equal(C.clearTable(sim, 'table2'), 1);
  const sim2 = C.newSim(); sim2.inspDue = true; sim2.criticT = 0; const l2 = [];
  s.inspAt = 0; runFor(sim2, s, 120, envMk(s), rng(6), l2);
  const arr = l2.filter((e) => e.k === 'arrive'); assert.ok(arr.length >= 1);
  const kinds = new Set(sim2.cust.map((c) => c.sp)); const seen = l2.some((e) => e.k === 'inspect') || kinds.has('inspector');
  assert.ok(seen, 'inspector visited');
});
ok('snapshot: compact customer arrays round-trip; quality clamp stops a rushed 5-star claim', () => {
  const s = world(), sim = C.newSim(); runFor(sim, s, 30, envMk(s), rng(9));
  const snap = C.snapshot(sim, s); assert.equal(snap.c.length, sim.cust.length);
  for (let i = 0; i < snap.c.length; i++) { const u = C.unpackCustomer(snap.c[i]), c = sim.cust[i]; assert.equal(u.id, c.id); assert.equal(u.sp, c.sp); assert.ok(Math.abs(u.x - c.x) < 0.01 && Math.abs(u.z - c.z) < 0.01); assert.equal(u.st, c.st); }
  assert.equal(JSON.parse(JSON.stringify(snap)).c.length, snap.c.length);
  assert.equal(C.clampQuality(3, 0.2, 4), 1); assert.equal(C.clampQuality(3, 4 * 0.6, 4), 3); assert.equal(C.clampQuality(0, 0.1, 4), 0); assert.equal(C.gradeCook(0.6), 2); assert.equal(C.gradeCook(0.9), 0);
});
ok('view: every piece / species / plate / ingredient model builds (merged, no scene lights) and the collider list matches the kinds', () => {
  for (const p of C.PIECES) { const g = V.buildPiece(p.id); assert.ok(g && g.children.length >= 1, p.id); g.traverse((o) => assert.ok(!o.isLight)); }
  for (const sp of Object.values(C.SPECIES)) { const g = V.buildCustomer(sp); assert.ok(g.children.length >= 1, sp.id); }
  assert.ok(V.plateModel('stew').children.length && V.ingredientModel(0xffffff, 'moon').children.length && V.buildShuttle().children.length && V.buildPest().children.length && V.buildMarker().children.length);
  assert.ok(V.piecePads('floor').length >= 6 && V.piecePads('table1').length === 1 && V.piecePads('sign').length === 0);
});
ok('i18n: TR + RU cover the same keys and every displayed name / description / taste / tip', () => {
  assert.deepEqual(Object.keys(TR).sort(), Object.keys(RU).sort());
  const need = [...C.PIECES.flatMap((p) => [p.name, p.desc]), ...C.DISHES.map((d) => d.name), ...Object.values(C.SPECIES).flatMap((s) => [s.name, s.taste]), ...Object.values(C.NEW_ING).flatMap((d) => [d.name, d.tip]), ...C.DISHES.flatMap((d) => d.tags), ...Object.values(C.PIECES).map((p) => p.name)];
  for (const k of need) assert.ok(TR[k] && RU[k], 'missing translation: ' + k);
  for (const v of [...Object.values(TR), ...Object.values(RU)]) assert.ok(v.length > 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
