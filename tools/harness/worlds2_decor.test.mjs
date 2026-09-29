// worlds2 decor headless check:  node tools/harness/worlds2_decor.test.mjs
// Builds the Soviet district and the twin-sun outpost on a stub terrain (no DOM, no physics): counts boxes / merged meshes, checks that
// the layout is deterministic (same seed -> same boxes), that footprints do not overlap, and that stairs / loot spots are sane.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBiomeDecor } from '../../src/world/outdoor_biomes.js';
import '../../src/world/worlds2_biomes.js';
import { BIOMES, MOONS } from '../../src/game/moons.js';
import { buildBlock } from '../../src/world/worlds2_soviet.js';
import { FrameGeo, Solids } from '../../src/world/worlds2_solids.js';
import { RNG } from '../../src/core/rng.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };
const h = (x, z) => Math.sin(x * 0.02) * 2.2 + Math.cos(z * 0.017) * 1.6 + Math.sin((x + z) * 0.05) * 0.8;

function run(kind, seed, scale = 1) {
  const boxes = [], emitters = [], reserved = [], group = new THREE.Group();
  const terrain = { heightAt: h, scale, half: 160 * scale, playHalf: 130 * scale };
  const avoid = (x, z, m = 0) => Math.hypot(x, z) < 26 + m || reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + m);
  const moon = kind === 'soviet' ? MOONS.w2sov : MOONS.w2sun;
  const t0 = performance.now();
  const decor = buildBiomeDecor({ seed, moon, biome: BIOMES[kind], terrain, plan: {}, group, addBox: (...a) => { boxes.push(a); return {}; }, avoid, emitters, sc: scale, reserve: (x, z, radius) => reserved.push({ x, z, radius }) });
  const ms = performance.now() - t0;
  return { decor, boxes, emitters, reserved, group, ms };
}

for (const kind of ['soviet', 'twinsun']) {
  ok(`${kind}: builds`, () => {
    const r = run(kind, 12345);
    assert.ok(r.decor, 'decor built');
    assert.equal(r.decor.info.kind, kind);
    console.log(`   ${kind}: ${r.boxes.length} boxes, ${r.reserved.length} sites, ${r.emitters.length} emitters, ${r.group.children.length} top-level objects, ${r.decor.info.drawCalls} merged meshes, ${r.ms.toFixed(0)} ms`);
    assert.ok(r.boxes.length > 40, 'has colliders');
    assert.ok(r.decor.info.drawCalls >= 1 && r.decor.info.drawCalls <= 12, 'few merged draw calls');
    for (const b of r.boxes) for (const v of b.slice(0, 6)) assert.ok(Number.isFinite(v), 'finite box');
    r.decor.dispose();
  });
  ok(`${kind}: deterministic`, () => {
    const a = run(kind, 777), b = run(kind, 777), c = run(kind, 778);
    assert.equal(a.boxes.length, b.boxes.length);
    assert.deepEqual(a.boxes.slice(0, 60), b.boxes.slice(0, 60));
    assert.notDeepEqual(a.boxes.slice(0, 60), c.boxes.slice(0, 60));
    a.decor.dispose(); b.decor.dispose(); c.decor.dispose();
  });
  ok(`${kind}: sites keep apart`, () => {
    const r = run(kind, 4242, 1.2);
    for (let i = 0; i < r.reserved.length; i++) for (let j = i + 1; j < r.reserved.length; j++) {
      const a = r.reserved[i], b = r.reserved[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= Math.min(a.radius, b.radius) * 0.9, `sites ${i}/${j} overlap`);
    }
    r.decor.dispose();
  });
}

ok('soviet: blocks + loot', () => {
  let blocks = 0, loot = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const r = run('soviet', seed * 977);
    blocks += r.decor.info.blocks.length; loot += r.decor.info.loot.length;
    for (const l of r.decor.info.loot) assert.ok(Number.isFinite(l.x + l.y + l.z), 'loot coords');
    assert.ok(r.decor.info.billboards.length >= 1, 'billboards');
    r.decor.dispose();
  }
  console.log(`   avg blocks ${(blocks / 12).toFixed(1)}, loot spots ${(loot / 12).toFixed(1)}`);
  assert.ok(blocks / 12 >= 2, 'at least two enterable blocks on average');
});

ok('twinsun: cantina + crawler + camps', () => {
  let cant = 0, craw = 0, camps = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const r = run('twinsun', seed * 1301);
    const i = r.decor.info;
    if (i.cantina) { cant++; assert.ok(i.cantina.npcSpots.length >= 5); assert.equal(i.cantina.npcSpots[0].role, 'bartender'); }
    if (i.crawler) craw++;
    camps += i.camps.length;
    assert.ok(i.vaporators >= 3, 'vaporators');
    r.decor.dispose();
  }
  console.log(`   cantina ${cant}/12, crawler ${craw}/12, camps ${(camps / 12).toFixed(1)}/map`);
  assert.ok(cant >= 10 && craw >= 10);
});

// ---- walkability of the stairwells: a 0.5 x 1.7 m body at every step / landing / doorway must not intersect any collider
ok('soviet: stairwells + doors are walkable (axis-aligned block, 60 seeds)', () => {
  const free = (boxes, x, feet, z, hw = 0.25, lo = 0.46, hi = 1.72) => {
    for (const [bx, by, bz, sx, sy, sz, rot] of boxes) {
      if (rot && typeof rot === 'object') continue;   // inclined stair ramp (world/stairs.js): oriented cuboid, walked in tools/harness/stairs.test.mjs
      if (Math.abs(x - bx) < sx / 2 + hw && Math.abs(z - bz) < sz / 2 + hw && feet + hi > by - sy / 2 && feet + lo < by + sy / 2) return false;
    }
    return true;
  };
  let steps = 0, doors = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const boxes = [];
    const gb = new FrameGeo(), B = { gb, addBox: (x, y, z, sx, sy, sz, rot) => boxes.push([x, y, z, sx, sy, sz, rot]), R: new RNG(seed), boxes: 0, emitters: [] };
    const S = new Solids(B), R = new RNG(seed * 31);
    const nSec = 2 + (seed % 2), nF = 3 + (seed % 2);
    const out = { loot: [], balconies: [], terrain: { heightAt: () => -0.5 } };
    buildBlock(S, { x: 0, z: 0, rot: 0, y0: 0, yLo: -0.5, nSec, nF }, R, out);
    const len = nSec * 11.6, x0 = -len / 2;
    for (let k = 0; k < nSec; k++) {
      const sx = x0 + 11.6 * (k + 0.5);
      for (let f = 0; f < nF; f++) {
        const lane = f % 2 === 0 ? -0.8 : 0.8, dir = f % 2 === 0 ? 1 : -1, base = 3 * f;
        for (let i = 0; i < 10; i++) {
          const z = dir > 0 ? -1.6 + 0.32 * (i + 0.5) : 1.6 - 0.32 * (i + 0.5);
          assert.ok(free(boxes, sx + lane, base + 0.3 * (i + 1), z), `seed ${seed} sec ${k} flight ${f} step ${i} blocked`); steps++;
        }
        const pz = (f + 1) % 2 === 1 ? 1 : -1;                        // pad at level f+1
        assert.ok(free(boxes, sx, 3 * (f + 1), pz * 3.2), `seed ${seed} sec ${k} pad ${f + 1} blocked`);
      }
      for (let lv = 0; lv < nF; lv++) {                                // doors from the pad into both flats
        const pz = lv % 2 === 1 ? 1 : -1;
        for (const side of [-1, 1]) { assert.ok(free(boxes, sx + side * 1.6, 3 * lv, pz * 2.9, 0.3, 0.1, 1.9), `seed ${seed} door lv ${lv} side ${side} blocked`); doors++; }
      }
      assert.ok(free(boxes, sx, 0, -4.65, 0.3, 0.1, 1.9), `seed ${seed} entrance blocked`);
    }
  }
  console.log(`   ${steps} stair steps + ${doors} doorways verified`);
});

ok('per-frame updaters run (snow / sand particles, billboards flicker, two suns, twin shadows, heat shimmer)', () => {
  for (const kind of ['soviet', 'twinsun']) {
    const r = run(kind, 31337);
    const game = { camera: { position: new THREE.Vector3(5, 2, 5) }, env: { sunDir: new THREE.Vector3(0.6, 0.7, 0.3).normalize(), night: 0.1, indoor: false, mode: 'moon', eclipse: false }, engine: { fx: { warp: 0 } }, player: { indoor: false } };
    for (let i = 0; i < 40; i++) { game.camera.position.x += 0.4; r.decor.update(0.05, game); }
    if (kind === 'twinsun') {
      const su = r.decor.info.suns; assert.ok(su.a.visible && su.b.visible, 'both suns in the sky'); assert.ok(su.a.position.distanceTo(su.b.position) > 20, 'suns apart');
      assert.ok(game.engine.fx.warp > 0.02 && game.engine.fx.warp < 0.09, 'shimmer ' + game.engine.fx.warp);
      game.env.indoor = true; for (let i = 0; i < 80; i++) r.decor.update(0.1, game); assert.ok(game.engine.fx.warp < 0.01, 'no shimmer indoors');
    }
    r.decor.dispose();
  }
});

console.log(`worlds2 decor: ${n} checks passed`);
