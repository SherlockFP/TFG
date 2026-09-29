// [mapart] node test: seeded placement determinism, no overlap with the landing zone / entrance / fire exits / ponds / path, interaction rules,
// text tables (EN/TR/RU). Run: node tools/harness/mapart.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/mapart_core.js';
import { ADS, SIGNS, HOLO, JOURNALS, TEXT } from '../../src/game/mapart_text.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// a fake outdoor: rolling height, a winding path, the engine guard (landing zone + entrance + path) like terrain.js avoidBase
const mkWorld = (seed, sc = 1) => {
  const ang = (seed % 628) / 100;
  const entrance = { x: Math.cos(ang) * 88 * sc, z: Math.sin(ang) * 88 * sc };
  const fires = [{ x: Math.cos(ang + 1.1) * 70 * sc, z: Math.sin(ang + 1.1) * 70 * sc }];
  const ponds = [{ x: Math.cos(ang - 1.3) * 60 * sc, z: Math.sin(ang - 1.3) * 60 * sc, r: 8 }];
  const lakes = seed % 2 ? [{ x: Math.cos(ang + 2.5) * 80 * sc, z: Math.sin(ang + 2.5) * 80 * sc, r: 14 }] : [];
  const pathPts = Array.from({ length: 40 }, (_, i) => { const u = i / 39; return { x: entrance.x * u + Math.sin(u * 7) * 6, z: entrance.z * u + Math.cos(u * 5) * 6 }; });
  const heightAt = (x, z) => Math.sin(x * 0.05) * 2 + Math.cos(z * 0.04) * 2;
  const distToPath = (x, z) => Math.min(...pathPts.map((p) => Math.hypot(p.x - x, p.z - z)));
  const ok = (x, z, m = 0) => Math.hypot(x, z) < 26 + m || Math.hypot(x - entrance.x, z - entrance.z) < 20 + m || distToPath(x, z) < 5 + m;
  return { plan: { entrance, fires, ponds, lakes }, pathPts, heightAt, ok, distToPath, sc };
};
const plan = (seed, moonId = 'hamsi', decor = 'datascape', sc = 1) => {
  const w = mkWorld(seed, sc);
  return { w, specs: C.planMapArt({ seed, moonId, decor, biomeId: 'hills', sc, plan: w.plan, pathPts: w.pathPts, heightAt: w.heightAt, ok: w.ok }) };
};

// ---- determinism (every peer rebuilds the same layout) and seed sensitivity
eq(plan(1234).specs, plan(1234).specs, 'same seed -> same plan');
ok(JSON.stringify(plan(1234).specs) !== JSON.stringify(plan(1235).specs), 'different seeds differ');
ok(JSON.stringify(plan(1234, 'a').specs) !== JSON.stringify(plan(1234, 'b').specs), 'different moons differ');

// ---- guards over many seeds / scales / biome families
let total = 0; const kindsSeen = new Set(); const famSeen = new Set();
const decors = ['datascape', 'ice', 'ashfield', 'jungle', null, 'vybone', 'soviet', 'vyfung', 'lava'];
for (let s = 1; s <= 220; s++) {
  const sc = s % 5 === 0 ? 1.5 : 1;
  const decor = decors[s % decors.length];
  const { w, specs } = plan(s * 7919, 'moon' + (s % 7), decor, sc);
  total += specs.length;
  ok(specs.length >= 14, `enough content per map (${specs.length})`);
  const ids = specs.map((p) => p.id);
  eq(new Set(ids).size, ids.length, 'unique ids');
  for (const p of specs) {
    kindsSeen.add(p.kind);
    ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.yaw), 'finite');
    ok(Math.hypot(p.x, p.z) >= C.GUARD.landing + p.r - 1e-6, `${p.kind} clear of the landing zone`);
    ok(Math.hypot(p.x - w.plan.entrance.x, p.z - w.plan.entrance.z) >= C.GUARD.entrance + p.r - 1e-6, `${p.kind} clear of the entrance`);
    for (const f of w.plan.fires) ok(Math.hypot(p.x - f.x, p.z - f.z) >= C.GUARD.fire + p.r - 1e-6, `${p.kind} clear of fire exits`);
    for (const q of w.plan.ponds) ok(Math.hypot(p.x - q.x, p.z - q.z) >= q.r * 1.4 + p.r, `${p.kind} clear of ponds`);
    for (const l of w.plan.lakes) ok(Math.hypot(p.x - l.x, p.z - l.z) >= l.r + p.r, `${p.kind} clear of lakes`);
    ok(w.distToPath(p.x, p.z) >= 5 + p.r - 1e-6, `${p.kind} off the walking path`);
    ok(!w.ok(p.x, p.z, p.r), `${p.kind} passes the engine guard`);
    if (p.kind === 'landmark') famSeen.add(p.fam);
  }
  for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) {
    const a = specs[i], b = specs[j];
    ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r + C.GUARD.gap - 1e-6, `${a.id}/${b.id} do not overlap`);
  }
  eq(specs.filter((p) => p.kind === 'landmark').length, sc > 1.2 ? Math.min(2, specs.filter((p) => p.kind === 'landmark').length) : specs.filter((p) => p.kind === 'landmark').length, 'landmark count sane');
  ok(specs.filter((p) => p.kind === 'landmark').length >= 1, 'every map has its biome landmark');
  ok(specs.some((p) => p.kind === 'pylon') && specs.some((p) => p.kind === 'billboard') && specs.some((p) => p.kind === 'drone'), 'interactive bits exist');
}
for (const k of ['landmark', 'pylon', 'panel', 'drone', 'billboard', 'pod', 'rig', 'camp', 'sign']) ok(kindsSeen.has(k), 'kind appears: ' + k);
for (const f of C.FAMILIES) ok(famSeen.has(f), 'family appears: ' + f);
ok(total / 220 > 18 && total / 220 < 60, `content budget per map (${(total / 220).toFixed(1)})`);
// a map where everything is blocked yields nothing (homeworld-like), and never throws
eq(C.planMapArt({ seed: 1, moonId: 'x', decor: null, sc: 1, plan: {}, pathPts: [], heightAt: () => 0, ok: () => true }), [], 'blocked map -> empty');
// slopes / water rejected
eq(C.planMapArt({ seed: 1, moonId: 'x', decor: null, sc: 1, plan: {}, pathPts: [], heightAt: (x) => x * 3, ok: () => false }), [], 'steep terrain -> empty');
eq(C.planMapArt({ seed: 1, moonId: 'x', decor: null, sc: 1, plan: {}, pathPts: [], heightAt: () => -5, ok: () => false, floodY: 0 }), [], 'flooded -> empty');

// ---- family mapping
eq(C.familyOf('datascape'), 'monolith'); eq(C.familyOf('ice'), 'datafall'); eq(C.familyOf('lava'), 'crane'); eq(C.familyOf('jungle'), 'fungal');
eq(C.familyOf(undefined, 'hills'), 'dish'); eq(C.familyOf(undefined, 'desert'), 'crane'); eq(C.familyOf('unknown', 'nope'), 'dish');

// ---- interaction rules
{
  const specs = plan(4242).specs, st = C.newState(specs);
  const pyl = specs.filter((p) => p.kind === 'pylon').map((p) => p.id), dr = specs.filter((p) => p.kind === 'drone').map((p) => p.id), bb = specs.filter((p) => p.kind === 'billboard').map((p) => p.id);
  ok(pyl.length >= 2 && dr.length >= 3 && bb.length >= 3, 'targets exist');
  ok(!C.offActive(st, 100), 'starts on-stream');
  const a = C.sabotage(st, pyl[0], 100);
  ok(a.ok && a.sec === C.OFF_SEC && C.offActive(st, 100 + C.OFF_SEC - 0.1) && !C.offActive(st, 100 + C.OFF_SEC + 0.1), 'sabotage opens exactly a 60 s window');
  ok(!C.sabotage(st, pyl[0], 110).ok, 'a pylon can be cut once');
  const b = C.sabotage(st, pyl[1], 130);
  ok(b.ok && st.offUntil === 190, 'a second pylon extends the window from now');
  ok(Math.abs(C.offLeft(st, 150) - 40) < 1e-9, 'time left');
  ok(!C.sabotage(st, 'nope', 0).ok, 'unknown pylon');
  for (let i = 1; i < C.DRONE_HP; i++) { const r = C.hitDrone(st, dr[0]); ok(r.ok && !r.dead && r.hp === C.DRONE_HP - i, 'drone survives hit ' + i); }
  const kill = C.hitDrone(st, dr[0]);
  ok(kill.ok && kill.dead && kill.hp === 0, 'third hit knocks it down');
  ok(!C.hitDrone(st, dr[0]).ok, 'a dead drone cannot be hit again (loot drops once)');
  ok(C.hitBoard(st, bb[0]).ok && !C.hitBoard(st, bb[0]).ok, 'billboard silenced once');
  ok(!C.hitBoard(st, 'x').ok, 'unknown billboard');
  const l1 = C.droneLoot(4242, dr[0]), l2 = C.droneLoot(4242, dr[0]);
  ok(l1 === l2 && C.DRONE_LOOT.includes(l1), 'deterministic loot from the component list');
  // hit geometry
  ok(C.segNear([0, 0, 0], [10, 0, 0], [5, 1, 0], 1.4), 'shot passes a drone');
  ok(!C.segNear([0, 0, 0], [4, 0, 0], [5, 0, 0], 0.9), 'shot that ends short misses');
  ok(!C.segNear([0, 0, 0], [10, 0, 0], [5, 3, 0], 1.4), 'shot passing wide misses');
  ok(C.inReach([0, 0, 0], [3, 0, 0], C.REACH.use) && !C.inReach([0, 0, 0], [9, 0, 0], C.REACH.use) && !C.inReach(null, [0, 0, 0], 5), 'reach rule');
}

// ---- text: every string has EN + TR + RU
const has3 = (arr, m) => { ok(Array.isArray(arr) && arr.length === 3 && arr.every((s) => typeof s === 'string' && s.length > 0), m); };
for (const a of ADS) { has3(a.brand, 'ad brand'); has3(a.line, 'ad line'); ok(/^#[0-9a-f]{6}$/i.test(a.bg) && /^#[0-9a-f]{6}$/i.test(a.fg), 'ad colours'); }
for (const s of SIGNS) { has3(s.head, 'sign head'); has3(s.line, 'sign line'); }
for (const j of JOURNALS) has3(j, 'journal');
for (const [k, v] of Object.entries(TEXT)) has3(v, 'text ' + k);
ok(ADS.length === C.CELL.adCount && SIGNS.length === C.CELL.signCount && HOLO.length === C.CELL.holoCount, 'atlas cell counts match the art tables');
ok(C.CELL.pod + C.CELL.podCount <= 32, 'atlas cells fit 4x8');
console.log(`mapart.test OK (${n} checks)`);
