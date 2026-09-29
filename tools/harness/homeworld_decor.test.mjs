// Node test for the homeworld "Off-Grid Claim" decor (src/world/homeworld_decor_plan.js + homeworld_decor.js, wave 6 home3): nothing solid overlaps the factory build grid,
// the pad, the ship box or the approach lanes; the builder (real three, no DOM) yields the same footprints + colliders; memorial names come from the case files.
//   node tools/harness/homeworld_decor.test.mjs
import assert from 'node:assert/strict';
import * as H from '../../src/game/homeworld_core.js';
import * as X from '../../src/game/homeworld2_core.js';
import * as D from '../../src/world/homeworld_decor_plan.js';
import { buildHomeDecor } from '../../src/world/homeworld_decor.js';

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
const HALF = 58;

ok('the build square used by the plan is the real one (3 m cells, fine grid 1.5 m)', () => {
  assert.equal(D.BUILD_HALF, H.GRID_MAX * H.CELL); assert.equal(-X.FMIN * X.FC, D.BUILD_HALF); assert.equal(X.FMAX * X.FC, D.BUILD_HALF);
});
for (const seed of [1, 7, 12345, 0xdeadbeef, 424242]) {
  const plan = D.planHomeDecor(seed, HALF);
  ok(`seed ${seed}: ${plan.length} footprints, none on a single build cell (coarse cell + fine cell + placementCheck)`, () => {
    assert.ok(plan.length > 40);
    const st = X.blank(seed);
    for (const it of plan) {
      assert.ok(!D.overlapsBuild(it), `${it.kind} @${it.x},${it.z} overlaps the build square`);
      const fx0 = Math.floor((it.x - it.hx) / X.FC), fx1 = Math.floor((it.x + it.hx) / X.FC), fz0 = Math.floor((it.z - it.hz) / X.FC), fz1 = Math.floor((it.z + it.hz) / X.FC);
      for (let x = fx0; x <= fx1; x++) for (let z = fz0; z <= fz1; z++) {
        const inGrid = x >= X.FMIN && z >= X.FMIN && x < X.FMAX && z < X.FMAX && Math.hypot((x + 0.5) * X.FC, (z + 0.5) * X.FC) >= H.PAD_CLEAR;
        assert.ok(!inGrid, `${it.kind} @${it.x},${it.z} covers buildable fine cell ${x},${z}`);
        assert.equal(X.placementCheck(st, null, 'belt', x, z, 0, { nodes: [] }).ok, false);
      }
      for (let x = Math.floor((it.x - it.hx) / H.CELL); x <= Math.floor((it.x + it.hx) / H.CELL); x++) for (let z = Math.floor((it.z - it.hz) / H.CELL); z <= Math.floor((it.z + it.hz) / H.CELL); z++) assert.ok(x < H.GRID_MIN || x >= H.GRID_MAX || z < H.GRID_MIN || z >= H.GRID_MAX, `${it.kind} covers coarse cell ${x},${z}`);
    }
  });
  ok(`seed ${seed}: solids keep off the pad disc, the ship box, the emblem and the four approach lanes; inside the walkable plateau`, () => {
    for (const it of plan) {
      assert.ok(!D.overlapsBox(it, D.SHIP_BOX), `${it.kind} on the ship`);
      assert.ok(Math.hypot(Math.max(0, Math.abs(it.x) - it.hx), Math.max(0, Math.abs(it.z) - it.hz)) > D.PAD_RADIUS + 1, `${it.kind} on the pad`);
      if (it.solid) assert.ok(!D.inLane(it), `${it.kind} @${it.x},${it.z} blocks an approach lane`);
      assert.ok(Math.abs(it.x) + it.hx < HALF - 0.5 && Math.abs(it.z) + it.hz < HALF - 0.5, `${it.kind} outside the plateau walls`);
    }
    assert.ok(!D.overlapsBox({ x: D.EMBLEM.x, z: D.EMBLEM.z, hx: D.EMBLEM.r, hz: D.EMBLEM.r }, D.SHIP_BOX));
    assert.ok(Math.hypot(D.EMBLEM.x, D.EMBLEM.z) + D.EMBLEM.r < D.PAD_RADIUS - 2);
  });
  ok(`seed ${seed}: deterministic + set pieces present`, () => {
    assert.deepEqual(D.planHomeDecor(seed, HALF), plan);
    for (const k of ['hut', 'mast', 'kitchen', 'memorial', 'totem', 'laundry', 'fence']) assert.ok(plan.some((p) => p.kind === k), k);
  });
}
ok('different seeds punch different holes in the fence', () => {
  const key = (s) => D.planHomeDecor(s, HALF).filter((p) => p.kind === 'fence').map((p) => p.x + ',' + p.z).join('|');
  assert.notEqual(key(1), key(2));
});

// ---- the builder itself (real three; no DOM -> textures are skipped, geometry + colliders still built)
const boxes = [], emit = [];
const env = (profile) => ({ HOME_Y: -1.25, LAYER: { ground: 0, pad: 0.06, ring: 0.12, lamp: 0.16, grid: 0.2, decal: 0.24 }, flatLayer: (m) => m, HALF, add: (x, y, z, hx, hy, hz) => { boxes.push({ x, y, z, hx, hy, hz }); return {}; }, lightPool: { add: (e) => emit.push(e), remove: (e) => emit.splice(emit.indexOf(e), 1) }, profile });
ok('buildHomeDecor: colliders stay off the grid / pad / ship / lanes, constant light count, update + dispose run', () => {
  const dead = { caseFiles: [{ day: 3, deaths: [{ name: 'Ada' }, { name: 'Bo' }] }, { day: 5, deaths: [{ name: 'Ada' }, { name: 'Cy' }] }] };
  const dec = buildHomeDecor(9, env(dead));
  assert.equal(dec.stats().dead, 3, 'unique dead crewmates from the case files');
  assert.ok(boxes.length >= 12, 'colliders: ' + boxes.length);
  for (const b of boxes) {
    const it = { x: b.x, z: b.z, hx: b.hx, hz: b.hz };
    assert.ok(!D.overlapsBuild(it), 'collider in the build square @' + b.x + ',' + b.z);
    assert.ok(!D.overlapsBox(it, D.SHIP_BOX)); assert.ok(!D.inLane(it), 'collider in a lane @' + b.x + ',' + b.z);
  }
  assert.ok(emit.length <= 1, 'one pooled emitter at most');
  let meshes = 0; dec.group.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; assert.ok(!o.isLight, 'no scene lights'); });
  assert.ok(meshes >= 12 && meshes <= 40, 'draw-call budget: ' + meshes);
  const game = { player: { pos: { x: 10, y: 0, z: 10 }, inShip: false }, remotes: new Map(), audio: { setAmbience() {} } };
  for (let i = 0; i < 120; i++) dec.update(1 / 30, game);
  dec.dispose(game); assert.equal(emit.length, 0, 'emitter removed');
});
ok('empty case files: builder still works (memorial says nobody yet)', () => { const dec = buildHomeDecor(3, env({})); assert.equal(dec.stats().dead, 0); dec.dispose(); });
console.log(`\n${pass} checks passed`);
