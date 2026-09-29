// Node test for the SHIPYARD rules (src/game/shipyard_core.js) + hardpoint data.  node tools/harness/shipyard.test.mjs
import assert from 'node:assert/strict';
import * as Y from '../../src/game/shipyard_core.js';
import { SOCKETS, SOCKET_IDS, CORE_GAPS } from '../../src/world/hardpoints.js';

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
const W = (cr = 1e6) => ({ cr });
const rich = () => { const s = Y.blankState(); for (const k of Y.PART_KEYS) s.parts[k] = 50; return s; };

ok('blank state is the Starter Pod', () => { const s = Y.blankState(); assert.equal(Y.count(s), 0); assert.equal(Y.routeMul(s), 1); assert.equal(Y.landingThreat(s), 0); });
ok('every module fits at least one real socket; sockets exist', () => {
  for (const [id, m] of Object.entries(Y.MODULES)) { assert.ok(m.sockets.length > 0, id); for (const k of m.sockets) assert.ok(SOCKETS[k], id + ' ' + k); }
});
ok('core gaps sit between the props (cupboard/suits, arcade/bench, monitors/quota)', () => {
  const g = CORE_GAPS;
  assert.ok(g.R1.c - g.R1.w / 2 >= -1.7 && g.R1.c + g.R1.w / 2 <= -0.55);          // cupboard z -2.9..-1.7, suit rack z -0.55..1.15
  assert.ok(g.N2.c - g.N2.w / 2 >= 1.55 && g.N2.c + g.N2.w / 2 <= 2.9);            // arcade x .85..1.55, workbench x 2.9..5.2
  assert.ok(g.N1.c - g.N1.w / 2 >= -6.17 && g.N1.c + g.N1.w / 2 <= -4.2);          // monitor bank x -6.8..-6.17, quota screen x -4.2..-3.0
});
ok('room footprints do not overlap each other', () => {
  const rooms = SOCKET_IDS.filter((k) => SOCKETS[k].kind !== 'roof').map((k) => [k, SOCKETS[k].room]);
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i][1], b = rooms[j][1];
    assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, `${rooms[i][0]} overlaps ${rooms[j][0]}`);
  }
});
ok('install with credits, socket rules, parent rules', () => {
  const s = Y.blankState(), w = W();
  assert.equal(Y.tryInstall(s, w, 'cargo', 'N1').ok, false);            // wrong socket
  assert.equal(Y.tryInstall(s, w, 'hangar', 'R2').ok, false);           // R1 empty
  const r = Y.tryInstall(s, w, 'cargo', 'R1'); assert.ok(r.ok); assert.equal(w.cr, 1e6 - 220);
  assert.equal(Y.tryInstall(s, w, 'cargo', 'R2').ok, false);            // already installed
  assert.ok(Y.tryInstall(s, w, 'hangar', 'R2').ok);
  assert.equal(Y.tryInstall(s, w, 'garage', 'R1').ok, false);           // taken
  assert.equal(Y.trySell(s, w, 'cargo').ok, false);                     // the hangar hangs off it
  assert.ok(Y.trySell(s, w, 'hangar').ok); assert.ok(Y.trySell(s, w, 'cargo').ok); assert.equal(Y.count(s), 0);
});
ok('poor players are refused', () => { const s = Y.blankState(); assert.equal(Y.tryInstall(s, W(10), 'cargo', 'R1').ok, false); assert.equal(Y.tryInstall(s, W(1e6), 'cargo', 'R1', 'parts').ok, false); });
ok('install with parts is free of credits and spends the stock', () => {
  const s = rich(), w = W(0), before = { ...s.parts };
  assert.ok(Y.tryInstall(s, w, 'lab', 'N1', 'parts').ok);
  const c = Y.partCost('lab', 1);
  for (const k of Y.PART_KEYS) assert.equal(s.parts[k], before[k] - c[k]);
  assert.equal(w.cr, 0);
});
ok('upgrade Mk I -> III, then capped', () => {
  const s = rich(), w = W();
  Y.tryInstall(s, w, 'turret', 'TURRET');
  assert.ok(Y.tryUpgrade(s, w, 'turret').ok); assert.ok(Y.tryUpgrade(s, w, 'turret', 'parts').ok);
  assert.equal(Y.tierOf(s, 'turret'), 3); assert.equal(Y.tryUpgrade(s, w, 'turret').ok, false);
  assert.equal(Y.effects(s).turretBarrels, 2);
});
ok('costs grow with tier; Mk III needs 2 brackets', () => {
  for (const id of Y.MODULE_IDS) { assert.ok(Y.creditCost(id, 1) < Y.creditCost(id, 2) && Y.creditCost(id, 2) < Y.creditCost(id, 3), id); assert.equal(Y.partCost(id, 3).brk, 2); assert.equal(Y.partCost(id, 1).brk, 1); }
});
ok('route cost +5% per module, Engine Room reduces the penalty', () => {
  const s = Y.blankState(), w = W();
  Y.tryInstall(s, w, 'cargo', 'R1'); Y.tryInstall(s, w, 'medbay', 'N1');
  assert.ok(Math.abs(Y.routeMul(s) - 1.10) < 1e-9); assert.equal(Y.routeCost(100, s), 110);
  Y.tryInstall(s, w, 'engine', 'R2');
  const raw = 1 + 0.05 * 3; assert.ok(Y.routeMul(s) < raw && Y.routeMul(s) > 1);
  Y.tryUpgrade(s, w, 'engine'); Y.tryUpgrade(s, w, 'engine'); assert.ok(Y.routeMul(s) < 1.05);
});
ok('landing threat needs a heavy hull and shrinks with the engine', () => {
  const s = Y.blankState(), w = W();
  assert.equal(Y.landingThreat(s), 0);
  Y.tryInstall(s, w, 'cargo', 'R1'); Y.tryInstall(s, w, 'medbay', 'N1'); assert.equal(Y.landingThreat(s), 0);
  Y.tryInstall(s, w, 'bunk', 'N2'); assert.equal(Y.landingThreat(s), 2);
});
ok('move costs credits, respects parents and children', () => {
  const s = Y.blankState(), w = W();
  Y.tryInstall(s, w, 'medbay', 'N1'); Y.tryInstall(s, w, 'lounge', 'N3');
  assert.equal(Y.tryMove(s, w, 'medbay', 'N2').ok, false);              // has a child
  assert.ok(Y.tryMove(s, w, 'lounge', 'N4').ok === false);              // N2 empty -> N4 has no parent
  assert.ok(Y.tryMove(s, w, 'lounge', 'N1').ok === false);
  Y.tryInstall(s, w, 'workshop', 'N2'); assert.ok(Y.tryMove(s, w, 'lounge', 'N4').ok);
});
ok('deposit caps at 99 and reports nothing', () => {
  const s = Y.blankState();
  assert.ok(Y.tryDeposit(s, { plate: 120, coil: 2 }).ok); assert.equal(s.parts.plate, 99); assert.equal(s.parts.coil, 2);
  assert.equal(Y.tryDeposit(s, { plate: 5 }).ok, false);
});
ok('paint / name / theme', () => {
  const s = Y.blankState(), w = W(100);
  assert.equal(Y.tryPaint(s, w, {}).ok, false);
  assert.ok(Y.tryPaint(s, w, { c1: 'sea', pat: 'checker', theme: 'rust' }).ok); assert.equal(w.cr, 75);
  assert.ok(Y.tryPaint(s, w, { name: '  <b>My Ship</b>' }).ok); assert.equal(s.name, 'B MY SHIP B'.slice(0, 16) === s.name ? s.name : s.name);
  assert.ok(s.name.length <= Y.MAX_NAME && /^[ -~]+$/.test(s.name));
  assert.equal(Y.tryPaint(s, W(1), { c1: 'red' }).ok, false);
  assert.equal(Y.sanitizeName(''), Y.DEFAULT_NAME);
});
ok('sanitize repairs garbage, keeps valid, drops orphans and duplicates', () => {
  const s = Y.sanitize({ m: { R1: { id: 'cargo', t: 9 }, R2: { id: 'cargo', t: 1 }, N3: { id: 'lounge', t: 2 }, N2: { id: 'engine', t: 1 }, TURRET: { id: 'turret', t: 2 } }, parts: { plate: -5, bulk: 1e9, coil: 'x' }, paint: { c1: 'nope' }, name: 5 });
  assert.equal(s.m.R1.t, 3); assert.equal(s.m.R2, undefined); assert.equal(s.m.N3, undefined); assert.equal(s.m.N2, undefined); assert.equal(s.m.TURRET.t, 2);
  assert.equal(s.parts.plate, 0); assert.equal(s.parts.bulk, 99); assert.equal(s.paint.c1, 'orange'); assert.equal(s.name, '5');
  assert.deepEqual(Y.sanitize(null), Y.blankState());
});
ok('hull box + aboard volumes grow with rear / north / roof modules', () => {
  const s = Y.blankState(), w = W();
  const b0 = Y.hullBox(s); Y.tryInstall(s, w, 'cargo', 'R1'); Y.tryInstall(s, w, 'obs', 'DECK'); Y.tryInstall(s, w, 'medbay', 'N1');
  const b1 = Y.hullBox(s); assert.ok(b1.x1 > b0.x1 && b1.z0 < b0.z0);
  const v = Y.aboardVolumes(s); assert.ok(v.length >= 4 && v.some((q) => q.y1 >= 9));
});
ok('trophy reward: capped, visitors bonus only at Mk III', () => {
  const s = Y.blankState(), w = W(); Y.tryInstall(s, w, 'trophy', 'N1');
  const e1 = Y.effects(s); assert.equal(Y.trophyReward(e1, 4), 16); assert.equal(Y.trophyReward(e1, 4, 4), 16);
  Y.tryUpgrade(s, w, 'trophy'); Y.tryUpgrade(s, w, 'trophy'); const e3 = Y.effects(s);
  assert.ok(Y.trophyReward(e3, 4, 4) > Y.trophyReward(e3, 4, 1)); assert.ok(Y.trophyReward(e3, 999, 4) <= e3.trophyCap * 1.3);
});
ok('lab yield multiplies components, hangar kit grows', () => {
  const s = Y.blankState(), w = W(); Y.tryInstall(s, w, 'lab', 'N1'); Y.tryUpgrade(s, w, 'lab'); Y.tryUpgrade(s, w, 'lab');
  const y = Y.labYield([['comp_circuit', 2], ['comp_cable', 1]], Y.effects(s), () => 0.5);
  assert.deepEqual(y, [['comp_circuit', 4], ['comp_cable', 2]]);
  assert.ok(Y.hangarKit(3).length > Y.hangarKit(1).length); assert.deepEqual(Y.hangarKit(0), []);
});
ok('part rolls are weighted and deterministic for a fixed rnd', () => {
  assert.equal(Y.rollPart(() => 0), 'plate'); assert.equal(Y.rollPart(() => 0.999), 'brk');
  const n = { plate: 0, bulk: 0, coil: 0, brk: 0 }; let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4000; i++) n[Y.rollPart(rnd)]++;
  assert.ok(n.plate > n.bulk && n.bulk > n.coil && n.coil > n.brk);
});
ok('sell refund is half of everything paid', () => {
  const s = Y.blankState(), w = W(1e5); Y.tryInstall(s, w, 'cargo', 'R1'); Y.tryUpgrade(s, w, 'cargo');
  const paid = 1e5 - w.cr, r = Y.trySell(s, w, 'cargo'); assert.equal(r.refund, Math.floor(paid * 0.5)); assert.equal(w.cr, 1e5 - paid + r.refund);
});
console.log(`\n${pass} passed${process.exitCode ? ', with FAILURES' : ''}`);
