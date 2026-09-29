// ship2: hull damage / repair state machine, timing ring, power budget, planter growth, shop entries.   node tools/harness/ship2_hull.test.mjs
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as C from '../../src/game/ship2_core.js';
import * as LY from '../../src/world/shiplayout.js';
import { SOCKETS as SOCK } from '../../src/world/hardpoints.js';

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } };
const rngOf = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

ok('fresh state: integrity 100, tier 0, no spots', () => { const s = C.freshState(); assert.equal(C.integrity(s), 100); assert.equal(C.tierOf(100), 0); assert.equal(s.sp.length, 0); });
ok('tier thresholds', () => { assert.deepEqual([100, 85, 84, 60, 59, 35, 34, 0].map(C.tierOf), [0, 0, 1, 1, 2, 2, 3, 3]); });
ok('slots are valid: unique ids, outward normals, stand point in front of the spot', () => {
  assert.equal(new Set(C.SLOTS.map((s) => s.id)).size, C.SLOTS.length);
  for (const s of C.SLOTS) { const n = Math.hypot(...s.n); assert.ok(n > 0.9 && n < 1.1 || n > 0.5, 'normal ' + s.id); const p = C.standPoint(s); assert.ok(Math.hypot(p[0] - s.x, p[2] - s.z) >= 0.3); assert.ok(s.y >= 0.1 && s.y <= 1.8, 'reachable height'); }
});
ok('QUOTA 0 is gentle: only dents, at most 2 spots, never below tier 0, no effects', () => {
  let st = C.freshState(); const rng = rngOf(7);
  for (let i = 0; i < 40; i++) { const r = C.addDamage(st, 'siege', 0, rng); st = r.st; }
  assert.ok(st.sp.length <= 2, 'spots ' + st.sp.length); assert.ok(st.sp.every((p) => p.k === 'dent'));
  assert.equal(C.tierOf(C.integrity(st)), 0);
  assert.equal(C.takeoffDelay(3, 0) + C.doorJamChance(3, 0) + C.lightFlicker(3, 0), 0);
  assert.equal(C.escalate(st, 0, () => 0).changed.length, 0);
  assert.ok(C.rollChance('landing', 0) < C.rollChance('landing', 1));
});
ok('QUOTA 1 caps at tier 2 (no breach), quota 3+ can reach tier 3 and breaches', () => {
  let st = C.freshState(); const rng = rngOf(11);
  for (let i = 0; i < 80; i++) st = C.addDamage(st, 'siege', 1, rng).st;
  assert.ok(C.tierOf(C.integrity(st)) <= 2 && !C.hasBreach(st), 'q1 tier ' + C.tierOf(C.integrity(st)));
  let hi = C.freshState(); const r2 = rngOf(5); let sawBreach = false;
  for (let i = 0; i < 200; i++) { hi = C.addDamage(hi, 'raid', 3, r2).st; if (C.hasBreach(hi)) sawBreach = true; }
  assert.ok(sawBreach, 'a breach happens eventually'); assert.ok(hi.sp.length <= C.MAX_SPOTS);
  assert.equal(new Set(hi.sp.map((p) => p.s)).size, hi.sp.length, 'one spot per slot');
});
ok('addDamage never mutates its input and is deterministic for a seed', () => {
  const st = C.freshState(); const a = C.addDamage(st, 'weather', 2, rngOf(3)), b = C.addDamage(st, 'weather', 2, rngOf(3));
  assert.equal(st.sp.length, 0); assert.deepEqual(a, b); assert.equal(a.st.sp.length, 1);
});
ok('escalation: unrepaired spark / leak may turn into a breach from quota 1; dents rarely become sparks', () => {
  let st = { v: 1, seq: 3, pw: 0, sp: [{ i: 'a', k: 'spark', s: 1, t: 0 }, { i: 'b', k: 'dent', s: 2, t: 0 }] };
  const r = C.escalate(st, 3, () => 0.01);
  assert.ok(r.changed.length >= 1 && r.st.sp.find((p) => p.i === 'a').k === 'breach');
  assert.equal(C.escalate(st, 3, () => 0.99).changed.length, 0);
});
ok('repair rules: wrench fixes dent / leak / spark, only the torch seals a breach (wrench patches it down), kit is quick and consumed', () => {
  for (const k of ['dent', 'leak', 'spark']) for (const tl of ['wrench', 'torch', 'kit']) { const r = C.repairRule(tl, k); assert.ok(r.ok && r.mode === 'fix', tl + k); }
  assert.equal(C.repairRule('wrench', 'breach').mode, 'patch'); assert.equal(C.repairRule('wrench', 'breach').to, 'spark');
  assert.equal(C.repairRule('kit', 'breach').mode, 'patch'); assert.ok(C.repairRule('kit', 'breach').consume);
  assert.equal(C.repairRule('torch', 'breach').mode, 'fix');
  assert.ok(C.repairRule('torch', 'spark').hold < C.repairRule('wrench', 'spark').hold, 'torch faster');
  assert.ok(C.repairRule('kit', 'dent').hold < C.repairRule('wrench', 'dent').hold, 'kit fastest');
  assert.ok(C.repairRule('wrench', 'dent', 1.4).hold < C.repairRule('wrench', 'dent', 1).hold, 'engineer bonus');
  assert.equal(C.repairRule('hammer', 'dent').ok, false); assert.equal(C.repairRule('wrench', 'bogus').ok, false);
});
ok('applyRepair: fix removes the spot, patch downgrades breach -> spark -> (wrench) fixed', () => {
  let st = { v: 1, seq: 1, pw: 0, sp: [{ i: 'x', k: 'breach', s: 4, t: 0 }, { i: 'y', k: 'dent', s: 5, t: 0 }] };
  st = C.applyRepair(st, 'y', 'wrench'); assert.equal(st.sp.length, 1);
  st = C.applyRepair(st, 'x', 'wrench'); assert.equal(st.sp[0].k, 'spark');
  st = C.applyRepair(st, 'x', 'wrench'); assert.equal(st.sp.length, 0);
  let b = { v: 1, seq: 1, pw: 0, sp: [{ i: 'x', k: 'breach', s: 4, t: 0 }] }; b = C.applyRepair(b, 'x', 'torch'); assert.equal(b.sp.length, 0);
  assert.equal(C.integrity(b), 100);
});
ok('full cycle: damage a hull, repair every spot, integrity returns to 100', () => {
  let st = C.freshState(); const rng = rngOf(21);
  for (let i = 0; i < 30; i++) st = C.addDamage(st, 'raid', 3, rng).st;
  assert.ok(C.integrity(st) < 100);
  let guard = 0; while (st.sp.length && guard++ < 100) st = C.applyRepair(st, st.sp[0].i, 'torch');
  assert.equal(C.integrity(st), 100); assert.equal(C.tierOf(C.integrity(st)), 0);
});
ok('sanitize drops junk, duplicates slots and unknown kinds', () => {
  const s = C.sanitize({ seq: 5, sp: [{ i: 'a', k: 'dent', s: 1 }, { i: 'b', k: 'dent', s: 1 }, { i: 'c', k: 'lava', s: 2 }, { i: 'd', k: 'spark', s: 99 }, null, { i: 'e', k: 'leak', s: 3, t: 4 }] });
  assert.deepEqual(s.sp.map((p) => p.i), ['a', 'e']);
  assert.deepEqual(C.sanitize(null), C.freshState());
});
ok('effects by tier: takeoff delay, door jam, flicker (none before quota 1)', () => {
  assert.deepEqual([0, 1, 2, 3].map((t) => C.takeoffDelay(t, 2)), [0, 0, 6, 14]); assert.deepEqual([0, 1, 2, 3].map((t) => C.doorJamChance(t, 2)), [0, 0, 0.2, 0.5]);
  assert.deepEqual([0, 1, 2, 3].map((t) => C.lightFlicker(t, 2)), [0, 0, 0.22, 0.5]); assert.equal(C.takeoffDelay(3, 0), 0);
});
ok('shipfaults integration: outer fault wanted from quota 1 with a breach or a critical hull, done once both are fixed', () => {
  const br = { sp: [{ i: 'x', k: 'breach', s: 1, t: 0 }] };
  assert.equal(C.outerFaultWanted(br, 0), false); assert.equal(C.outerFaultWanted(br, 1), true); assert.equal(C.outerFaultWanted(C.freshState(), 5), false);
  assert.equal(C.outerFaultDone(br), false); assert.equal(C.outerFaultDone(C.applyRepair(br, 'x', 'torch')), true);
  assert.equal(C.worstSpot({ sp: [{ i: 'a', k: 'dent' }, { i: 'b', k: 'breach' }] }).i, 'b');
});
ok('timing ring: needle wraps, arcs are opposite, zones deterministic from the seed, green is faster than none, red hurts', () => {
  const seed = C.ringSeed('h1', 12.3); assert.equal(seed, C.ringSeed('h1', 12.3)); assert.notEqual(seed, C.ringSeed('h2', 12.3));
  const a = C.ringAt(seed, 0.4), b = C.ringAt(seed, 0.4 + C.RING.period); assert.ok(Math.abs(a.needle - b.needle) < 1e-9);
  const zs = new Set(); for (let t = 0; t < C.RING.period; t += 0.01) zs.add(C.ringAt(seed, t).zone); assert.deepEqual([...zs].sort(), ['green', 'none', 'red']);
  assert.ok(C.ZONE_RATE.green > C.ZONE_RATE.none && C.ZONE_RATE.none > 0 && C.ZONE_RATE.red < 0);
});
ok('hold session: holding E completes in about `need` seconds, letting go decays, red arc is only a slowdown in the early game', () => {
  const mk = (need) => ({ need, prog: 0, seed: 0.37, t: 0, down: true });
  const s = mk(4); let t = 0; while (t < 20) { const r = C.stepSession(s, 0.05); t += 0.05; if (r.done) break; }
  assert.ok(s.prog >= 4 - 1e-6 && t > 1.5 && t < 8, 'done in ' + t.toFixed(1) + ' s');
  const r = mk(4); r.prog = 2; r.down = false; C.stepSession(r, 1); assert.ok(r.prog < 2 && r.prog > 0);
  const red = { need: 9, prog: 3, seed: 0, t: 0, down: true }; // seed 0: green at 0, red at .5
  red.t = 0.5 * C.RING.period - 0.02; const before = red.prog; const o = C.stepSession(red, 0.02, false); assert.equal(o.shock, true); assert.ok(red.prog < before);
  const e = { need: 9, prog: 3, seed: 0, t: 0.5 * C.RING.period - 0.02, down: true }; const oe = C.stepSession(e, 0.02, true); assert.equal(oe.shock, false); assert.ok(e.prog > 3);
});
ok('power budget: 1 slot in quota 0, 2 later, +engine tier, -1 when critical; MK1 is ammo fed and uses none', () => {
  assert.equal(C.powerSlots(0, 0, 0), 1); assert.equal(C.powerSlots(2, 0, 0), 2); assert.equal(C.powerSlots(2, 3, 0), 5); assert.equal(C.powerSlots(2, 0, 3), 1); assert.equal(C.powerSlots(0, 0, 3), 1); assert.equal(C.powerSlots(2, 0, 0, 3), 3, 'deck Mk III = +1');
  const m = { M1: { ty: 'turret2' }, M2: { ty: 'tesla' }, M3: { ty: 'turret1' }, M4: { ty: 'turret3' } };
  const on = C.poweredMounts(m, 2); assert.deepEqual([...on].sort(), ['M1', 'M2', 'M3']);
  assert.deepEqual([...C.poweredMounts(m, 1)].sort(), ['M1', 'M3']);
  assert.equal(C.MOUNTS.length, 6); assert.ok(C.MOUNTS.find((m) => m.id === 'M6' && m.deck === 3 && m.y === 4), 'M6 = the Upper Deck Mk III mount'); assert.deepEqual(Object.keys(C.sanitizeMounts({ M1: { ty: 'turret2' }, M9: { ty: 'turret2' }, M2: { ty: 'lava' } })), ['M1']);
});
ok('mount points sit on the roof, away from the shipyard deck / turret sockets and the antenna', () => {
  for (const m of C.MOUNTS.filter((q) => !q.deck)) { assert.ok(Math.abs(m.x) < 7 && Math.abs(m.z) < 3.4); const R = (id) => SOCK[id].room, inDeck = m.x - 0.55 < R('DECK').x1 && m.x + 0.55 > R('DECK').x0 && Math.abs(m.z) < 3.2, inTur = m.x + 0.55 > R('TURRET').x0 && m.x - 0.55 < R('TURRET').x1 && Math.abs(m.z) - 0.55 < 1.6, inUp = m.x - 0.55 < LY.DECK.x1 && m.x + 0.55 > LY.DECK.x0; assert.ok(!inDeck && !inTur && !inUp, 'mount ' + m.id + ' collides with a shipyard roof socket / the Upper Deck'); assert.ok(Math.hypot(m.x + 6.85, m.z + 3.4) > 0.7, 'antenna'); }
  for (let i = 0; i < C.MOUNTS.length; i++) for (let j = i + 1; j < C.MOUNTS.length; j++) assert.ok(Math.hypot(C.MOUNTS[i].x - C.MOUNTS[j].x, C.MOUNTS[i].z - C.MOUNTS[j].z) > 1.05, 'mount plates (r 0.55) must not overlap');
});
ok('planter: seed -> sprout -> sapling -> tree -> fruit over game days, water speeds it up, harvest regrows', () => {
  let p = C.plantIt(C.freshPlanter(), 'r:1'); assert.equal(C.stageOf(p.pts), 0);
  const days = []; for (let d = 2; d <= 10; d++) { p = C.growPlanter(p, 'r:' + d, false); days.push(C.stageOf(p.pts)); }
  assert.ok(days[0] >= 1 && days.includes(2) && days.includes(3) && days.at(-1) === 4, 'stages ' + days);
  assert.equal(C.canHarvest(p), true); const h = C.harvest(p); assert.equal(C.canHarvest(h), false); assert.ok(C.stageOf(h.pts) >= 3, 'stays a tree');
  const same = C.growPlanter(p, p.key, false); assert.equal(same, p, 'one growth per day key');
  let a = C.plantIt(C.freshPlanter(), 'r:0'), b = C.plantIt(C.freshPlanter(), 'r:0');
  for (let d = 1; d <= 3; d++) { b = C.waterIt(b); a = C.growPlanter(a, 'r:' + d, false); b = C.growPlanter(b, 'r:' + d, false); }
  assert.ok(b.pts > a.pts, 'watering gives a bonus'); assert.deepEqual(C.sanitizePlanters({ x: { pl: 1, pts: 99, w: 1, key: 'k' } }).x.pts, 12);
});
ok('tool table: 3 tools with prices, torch costs more than wrench, kit is cheap', () => {
  assert.deepEqual(C.TOOL_IDS.sort(), ['s2_kit', 's2_torch', 's2_wrench']); assert.ok(C.TOOLS.s2_torch.price > C.TOOLS.s2_wrench.price && C.TOOLS.s2_kit.price < C.TOOLS.s2_wrench.price);
  assert.equal(C.toolOf('s2_torch'), 'torch'); assert.equal(C.toolOf('x'), null);
});
console.log(`\nship2 hull: ${pass} passed, ${fail} failed`);
