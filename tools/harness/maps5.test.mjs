// maps5 node tests:  node tools/harness/maps5.test.mjs
// 1. planners: solvability over 200 seeds, determinism, structural invariants (stacks: spanning trees, transitions stay connected, movable walls)
// 2. decor: Estate 9 + Cold Storage build on a stub terrain; collider counts, determinism, merged mesh counts, finite numbers
// 3. collision proof: the real box colliders are rasterised and flood-filled with a 0.4 m body (hedge gates / centre, archive level 0 + level 1 route,
//    stacks in every phase), plus the stacks runtime state machine (goTo / warn / hold / colliders)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBiomeDecor } from '../../src/world/outdoor_biomes.js';
import '../../src/world/maps5_biomes.js';
import '../../src/world/worlds2_data.js';
import { BIOMES, MOONS } from '../../src/game/moons.js';
import {
  planHedge, planStacks, verifyStacks, planArchive, wallLattice, allEdges, stacksOpen, stacksPhaseAt, stacksDiff, gridFromFlags, bfs, HEDGE, STACKS, ARCHIVE,
} from '../../src/game/maps5_core.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };
const SEEDS = 200;

// ------------------------------------------------------------------------------------------------ 1. planners
ok(`hedge maze solvable + gates + chamber over ${SEEDS} seeds`, () => {
  let sumC = 0, sumX = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const p = planHedge(s * 7919);
    assert.ok(p.solvable, 'hedge ' + s);
    assert.ok(p.pathToCentre.length >= 8 && p.pathToExit.length >= 20, `hedge ${s} too short (${p.pathToCentre.length}/${p.pathToExit.length})`);
    assert.ok(p.pockets.length >= 3, 'pockets');
    assert.equal(p.entrance.cell, (p.rows - 1) * p.cols + p.entrance.x);
    assert.ok(p.exit.cell < p.cols, 'exit on the north row');
    sumC += p.pathToCentre.length; sumX += p.pathToExit.length;
  }
  console.log(`   avg path entrance->centre ${(sumC / SEEDS).toFixed(1)} cells, entrance->exit ${(sumX / SEEDS).toFixed(1)} cells`);
});
ok(`server stacks: every phase + every transition connected over ${SEEDS} seeds`, () => {
  let mov = 0, min = 1e9, max = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const p = planStacks(s * 104729);
    const v = verifyStacks(p);
    assert.ok(v.ok, `stacks ${s}: ${v.errors.join(', ')}`);
    // every tree is a spanning tree: exactly cells - 1 edges
    for (const t of p.trees) { let c = 0; for (const e of allEdges(p.cols, p.rows)) if (t[e]) c++; assert.equal(c, p.cols * p.rows - 1, 'spanning tree'); }
    for (const e of p.movable) assert.ok(!p.perm[e], 'movable edge is not permanent');
    assert.ok(p.movable.length >= 8 && p.movable.length <= 60, `movable count ${p.movable.length}`);
    // the entrance reaches the core and the exit in every phase
    for (let k = 0; k < p.seq.length; k++) { const d = bfs(gridFromFlags(p.cols, p.rows, stacksOpen(p, p.seq[k])), p.entrance.cell); assert.ok(d[p.core] > 0 && d[p.exit.cell] > 0); }
    mov += p.movable.length; min = Math.min(min, p.movable.length); max = Math.max(max, p.movable.length);
  }
  console.log(`   movable walls: avg ${(mov / SEEDS).toFixed(1)} (min ${min}, max ${max})`);
});
ok(`paper archive solvable (ladder -> island A -> bridge -> island B) over ${SEEDS} seeds`, () => {
  for (let s = 1; s <= SEEDS; s++) {
    const p = planArchive(s * 15485863);
    assert.ok(p.solvable, `archive ${s} toReward ${p.toReward} toExit ${p.toExit}`);
    assert.equal(p.bridges.length, 2);
    // island B is reachable ONLY over a bridge: without the bridge links no path from the ladder to the reward
    const g1 = { cols: p.cols, rows: p.rows, n: p.cols * p.rows, open: Uint8Array.from(p.g1.open) };
    for (const b of p.bridges) { const [a, m, c] = b.cells; g1.open[a] &= ~1; g1.open[m] &= ~4; g1.open[m] &= ~1; g1.open[c] &= ~4; }
    assert.equal(bfs(g1, p.ladder.cell)[p.reward], -1, 'reward needs a bridge');
    assert.equal(p.deck[p.ladder.cell], 1);
    assert.equal(p.islandOf[p.ladder.cell], 0);
    assert.equal(p.islandOf[p.reward], 1);
    // the ladder cell is a dead end on the deck (one opening) and the hole is opposite to it
    let deg = 0; for (let d = 0; d < 4; d++) if (p.g1.open[p.ladder.cell] & (1 << d)) deg++;
    assert.equal(deg, 1, 'ladder cell is a dead end');
    assert.equal(p.ladder.hole, (p.ladder.out + 2) % 4);
  }
});
ok('planners are deterministic (same seed -> same layout) and seed-sensitive', () => {
  const j = (p) => JSON.stringify(p, (k, v) => (v instanceof Uint8Array || v instanceof Int8Array || v instanceof Int32Array ? Array.from(v) : v instanceof Set ? [...v] : typeof v === 'function' ? undefined : v));
  for (const f of [planHedge, planStacks, planArchive]) {
    assert.equal(j(f(4242)), j(f(4242)), f.name + ' deterministic');
    assert.notEqual(j(f(4242)), j(f(4243)), f.name + ' seed-sensitive');
  }
});
ok('wall lattice: merged runs stay small (collider budget)', () => {
  const runsOf = (p, P, gates) => wallLattice(p.cols, p.rows, (a, b) => { const [i, j] = a < b ? [a, b] : [b, a]; return (p.g.open[i] & (1 << (j === i + 1 ? 0 : 1))) !== 0; }, gates, P).runs.length;
  let max = 0;
  for (let s = 1; s <= 60; s++) { const p = planHedge(s); max = Math.max(max, runsOf(p, HEDGE.pitch, [{ side: 'S', x: p.entrance.x }, { side: 'N', x: p.exit.x }])); }
  console.log(`   hedge wall runs (colliders) max over 60 seeds: ${max}`);
  assert.ok(max < 200, 'hedge runs');
  for (let s = 1; s <= 30; s++) {
    const p = planStacks(s), openAny = (a, b) => { const [i, j] = a < b ? [a, b] : [b, a]; const e = i * 2 + (j === i + 1 ? 0 : 1); return p.states.some((st) => st[e]); };
    assert.ok(wallLattice(p.cols, p.rows, openAny, [], STACKS.pitch).runs.length < 200, 'stacks runs');
  }
  void ARCHIVE;
});
ok('stacksDiff opens / closes exactly the movable edges that change', () => {
  const p = planStacks(99);
  for (let k = 0; k < p.seq.length; k++) {
    const a = p.seq[k], b = p.seq[(k + 1) % p.seq.length], d = stacksDiff(p, a, b);
    assert.ok(d.open.length + d.close.length > 0 && d.open.length + d.close.length <= 24, 'a step changes a modest number of walls');
    for (const e of d.open) { assert.ok(!stacksOpen(p, a)[e] && stacksOpen(p, b)[e]); }
    for (const e of d.close) { assert.ok(stacksOpen(p, a)[e] && !stacksOpen(p, b)[e]); }
  }
  assert.equal(stacksPhaseAt(p, 0), stacksPhaseAt(p, p.seq.length));
});

// ------------------------------------------------------------------------------------------------ 2. decor on a stub terrain
const hf = (x, z) => Math.sin(x * 0.02) * 1.6 + Math.cos(z * 0.017) * 1.2 + Math.sin((x + z) * 0.05) * 0.5;
function run(kind, seed, scale = 1.1) {
  const boxes = [], emitters = [], reserved = [], group = new THREE.Group();
  const terrain = { heightAt: hf, scale, half: 160 * scale, playHalf: 130 * scale, pathPts: [{ x: 0, z: 0 }, { x: 60, z: 20 }, { x: 90, z: 60 }, { x: 100, z: 100 }] };
  const avoid = (x, z, m = 0) => Math.hypot(x, z) < 26 + m || reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + m);
  const moon = kind === 'm5estate' ? MOONS.m5est : MOONS.m5cold;
  const t0 = performance.now();
  const decor = buildBiomeDecor({ seed, moon, biome: BIOMES[kind], terrain, plan: {}, group, addBox: (x, y, z, sx, sy, sz, rot) => { const c = { x, y, z, sx, sy, sz, rot: rot || 0, enabled: true, setEnabled(v) { c.enabled = v; } }; boxes.push(c); return c; }, avoid, emitters, sc: scale, reserve: (x, z, radius) => reserved.push({ x, z, radius }) });
  return { decor, boxes, emitters, reserved, group, ms: performance.now() - t0, terrain };
}
const triCount = (g) => { let t = 0; g.traverse((o) => { if (o.isMesh) t += o.isInstancedMesh ? (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * o.count : (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(t); };
const drawCalls = (g) => { let d = 0; g.traverse((o) => { if (o.isMesh) d++; }); return d; };

for (const kind of ['m5estate', 'm5cold']) {
  ok(`${kind}: builds (colliders / draw calls / triangles)`, () => {
    const r = run(kind, 12345);
    assert.ok(r.decor, 'decor built');
    const i = r.decor.info;
    assert.equal(i.kind, kind);
    for (const b of r.boxes) for (const v of [b.x, b.y, b.z, b.sx, b.sy, b.sz]) assert.ok(Number.isFinite(v), 'finite box');
    console.log(`   ${kind}: ${r.boxes.length} colliders, ${drawCalls(r.group)} meshes, ${triCount(r.group)} tris, ${r.emitters.length} emitters, ${r.ms.toFixed(0)} ms, loot ${i.loot.length}, prizes ${i.prizes.length}`);
    assert.ok(r.boxes.length > 60 && r.boxes.length < 900, 'collider budget');
    assert.ok(drawCalls(r.group) < 70, 'draw call budget');
    assert.ok(triCount(r.group) < 90000, 'triangle budget');
    assert.ok(i.prizes.length >= (kind === 'm5estate' ? 2 : 2), 'prizes');
    if (kind === 'm5estate') { assert.ok(i.hedge && i.archive, 'both labyrinths placed'); assert.ok(i.hedge.colliders < 260 && i.archive.colliders < 200, `hedge ${i.hedge.colliders} archive ${i.archive.colliders}`); }
    else { assert.ok(i.stacks && i.caves.length >= 1 && i.pods.length >= 8, 'stacks + caves + pods'); assert.equal(i.stacks.walls.length, i.stacks.plan.movable.length); }
    r.decor.dispose();
  });
  ok(`${kind}: deterministic`, () => {
    const a = run(kind, 777), b = run(kind, 777), c = run(kind, 778);
    assert.equal(a.boxes.length, b.boxes.length);
    const strip = (l) => l.slice(0, 120).map((q) => [q.x, q.y, q.z, q.sx, q.sy, q.sz, q.rot]);
    assert.deepEqual(strip(a.boxes), strip(b.boxes));
    assert.notDeepEqual(strip(a.boxes), strip(c.boxes));
    assert.equal(JSON.stringify(a.decor.info.loot), JSON.stringify(b.decor.info.loot));
    a.decor.dispose(); b.decor.dispose(); c.decor.dispose();
  });
  ok(`${kind}: builds on 25 seeds without throwing, sites stay apart`, () => {
    for (let s = 1; s <= 25; s++) {
      const r = run(kind, s * 6151, s % 2 ? 1.0 : 1.2);
      const i = r.decor.info;
      if (kind === 'm5estate') assert.ok(i.hedge && i.archive, `seed ${s}: sites`);
      else assert.ok(i.stacks, `seed ${s}: stacks`);
      for (let a = 0; a < r.reserved.length; a++) for (let b = a + 1; b < r.reserved.length; b++) { const p = r.reserved[a], q = r.reserved[b]; assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= Math.min(p.radius, q.radius) * 0.9, 'sites overlap'); }
      r.decor.dispose();
    }
  });
}

// ------------------------------------------------------------------------------------------------ 3. collision proof (rasterise + flood fill)
/** blocked-cell grid from box colliders (rotated rectangles, inflated by the body radius) that overlap the body slab [ground + 0.3, ground + 1.7] */
function raster(boxes, b, { cell = 0.25, radius = 0.4, ground = () => 0, slab = [0.3, 1.7], only = null, pass = null }) {
  const W = Math.ceil((b.x1 - b.x0) / cell), H = Math.ceil((b.z1 - b.z0) / cell), blocked = new Uint8Array(W * H);
  for (const q of boxes) {
    if (only && !only(q)) continue;
    if (pass && pass(q)) continue;
    if (q.enabled === false) continue;
    const g = ground(q.x, q.z), lo = q.y - q.sy / 2, hi = q.y + q.sy / 2;
    if (hi < g + slab[0] || lo > g + slab[1]) continue;
    const c = Math.cos(q.rot), s = Math.sin(q.rot), hx = q.sx / 2 + radius, hz = q.sz / 2 + radius, R = Math.hypot(hx, hz);
    const i0 = Math.max(0, Math.floor((q.x - R - b.x0) / cell)), i1 = Math.min(W - 1, Math.ceil((q.x + R - b.x0) / cell));
    const j0 = Math.max(0, Math.floor((q.z - R - b.z0) / cell)), j1 = Math.min(H - 1, Math.ceil((q.z + R - b.z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = b.x0 + (i + 0.5) * cell - q.x, pz = b.z0 + (j + 0.5) * cell - q.z;
      const lx = px * c - pz * s, lz = px * s + pz * c;   // world -> box-local (inverse of rot about y)
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) blocked[j * W + i] = 1;
    }
  }
  return { W, H, blocked, cell, b };
}
function flood(rg, from, floor = null) {
  const { W, H, blocked, cell, b } = rg, seen = new Uint8Array(W * H);
  const idx = ([x, z]) => Math.floor((z - b.z0) / cell) * W + Math.floor((x - b.x0) / cell);
  const start = idx(from), q = [start];
  if (blocked[start]) return { seen, idx, startBlocked: true };
  seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % W, z = (k / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const m = nz * W + nx;
      if (seen[m] || blocked[m]) continue;
      if (floor && !floor(b.x0 + (nx + 0.5) * cell, b.z0 + (nz + 0.5) * cell)) continue;
      seen[m] = 1; q.push(m);
    }
  }
  return { seen, idx, startBlocked: false };
}
const bounds = (cx, cz, r) => ({ x0: cx - r, x1: cx + r, z0: cz - r, z1: cz + r });
const pt = (o) => [o.x, o.z];
const towards = (o, from, d) => { const dx = from.x - o.x, dz = from.z - o.z, l = Math.hypot(dx, dz); return [o.x + (dx / l) * d, o.z + (dz / l) * d]; };
/** point dz metres from a gate along the maze's local +z axis (+ = outside the south gate / inside the north gate) */
const off = (g, f, dz) => [g.x + dz * Math.sin(f.rot), g.z + dz * Math.cos(f.rot)];

ok('hedge maze collision: entrance gate reaches the centre prize, the exit gate and every pocket (0.4 m body)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const r = run('m5estate', seed * 33331);
    const h = r.decor.info.hedge;
    assert.ok(h, 'hedge');
    const rg = raster(r.boxes, bounds(h.frame.x, h.frame.z, h.radius + 6), { cell: 0.2, ground: hf });
    // start 1.2 m outside the entrance gate
    const sgate = h.gates[0], cx = h.frame.x, cz = h.frame.z;
    const start = off(sgate, h.frame, 1.6);
    const fl = flood(rg, start);
    assert.ok(!fl.startBlocked, 'entrance is open');
    const at = (p) => fl.seen[fl.idx(Array.isArray(p) ? p : pt(p))];
    assert.ok(at(off(sgate, h.frame, -1.6)), 'inside the gate');
    assert.ok(at([h.prize.x, h.prize.z]) || at(towards({ x: h.prize.x, z: h.prize.z }, sgate, 1.3)), `seed ${seed}: prize reachable`);
    assert.ok(at(off(h.gates[1], h.frame, 1.6)), `seed ${seed}: exit reachable from inside`);
    for (const p of h.pockets) assert.ok(at(pt(p)), `seed ${seed}: pocket reachable`);
    r.decor.dispose();
  }
});
ok('paper archive collision: level 0 reaches exit + ladder foot; level 1 reaches the bridges and the reward from the ladder exit', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = run('m5estate', seed * 4441);
    const a = r.decor.info.archive;
    assert.ok(a, 'archive');
    const P = ARCHIVE.pitch, rad = Math.hypot(a.plan.cols, a.plan.rows) * P / 2 + 4, y0 = a.y0;
    const b = bounds(a.frame.x, a.frame.z, rad);
    // level 0: everything at floor level (stacks are 3.25 m tall shelves, the deck slab sits above the body)
    const rg0 = raster(r.boxes, b, { cell: 0.2, ground: () => y0, slab: [0.3, 1.7] });
    const g0 = a.gates;
    const cxz = { x: a.frame.x, z: a.frame.z };
    const fl0 = flood(rg0, off(g0[0], a.frame, 1.6));
    assert.ok(!fl0.startBlocked, 'entrance open');
    assert.ok(fl0.seen[fl0.idx(off(g0[1], a.frame, 1.6))], `seed ${seed}: exit door reachable on level 0`);
    const L = a.ladder;
    assert.ok(fl0.seen[fl0.idx([L.x, L.z])], `seed ${seed}: ladder foot reachable`);
    // level 1: floor = slabs whose top is at the deck height; blockers = boxes overlapping the deck body slab
    const floors = r.boxes.filter((q) => Math.abs(q.y + q.sy / 2 - a.deckTop) < 0.02 && q.sy < 0.5);
    const inFloor = (x, z) => floors.some((q) => { const c = Math.cos(q.rot), s = Math.sin(q.rot), px = x - q.x, pz = z - q.z; return Math.abs(px * c - pz * s) <= q.sx / 2 && Math.abs(px * s + pz * c) <= q.sz / 2; });
    const rg1 = raster(r.boxes, b, { cell: 0.2, radius: 0.35, ground: () => a.deckTop, slab: [0.1, 1.6], only: (q) => q.y + q.sy / 2 > a.deckTop + 0.1 });
    // ladder exit: 1.0 m from the hatch, away from the wall (on the deck floor)
    const exitPt = [L.x + L.face.x * 1.15, L.z + L.face.z * 1.15];
    assert.ok(inFloor(...exitPt), `seed ${seed}: floor at the ladder exit`);
    const fl1 = flood(rg1, exitPt, inFloor);
    assert.ok(!fl1.startBlocked, `seed ${seed}: ladder exit not blocked`);
    for (const br of a.plan.bridges) {
      const c = (i) => { const cc = { x: ((i % a.plan.cols) + 0.5) * P - (a.plan.cols * P) / 2, z: (((i / a.plan.cols) | 0) + 0.5) * P - (a.plan.rows * P) / 2 }; const cs = Math.cos(a.frame.rot), sn = Math.sin(a.frame.rot); return [a.frame.x + cc.x * cs + cc.z * sn, a.frame.z - cc.x * sn + cc.z * cs]; };
      assert.ok(fl1.seen[fl1.idx(c(br.cells[1]))], `seed ${seed}: bridge middle reachable on level 1`);
      assert.ok(fl1.seen[fl1.idx(c(br.cells[2]))], `seed ${seed}: island B reachable over the bridge`);
    }
    assert.ok([[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]].some(([dx, dz]) => fl1.seen[fl1.idx([a.prize.x + dx, a.prize.z + dz])]), `seed ${seed}: reward reachable`);
    r.decor.dispose();
  }
});
ok('server stacks collision: from the entrance to the core and the exit in EVERY phase (movable colliders switched per phase)', () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = run('m5cold', seed * 9973);
    const st = r.decor.info.stacks;
    assert.ok(st, 'stacks');
    const rad = Math.hypot(st.plan.cols, st.plan.rows) * st.P / 2 + 4;
    for (let k = 0; k < st.plan.seq.length; k++) {
      st.goTo(k, true);
      const rg = raster(r.boxes, bounds(st.frame.x, st.frame.z, rad), { cell: 0.2, ground: () => st.y0, radius: 0.38 });
      const cxz = { x: st.frame.x, z: st.frame.z };
      const fl = flood(rg, off(st.gates[0], st.frame, 1.5));
      assert.ok(!fl.startBlocked, 'entrance open');
      assert.ok(fl.seen[fl.idx(off(st.gates[1], st.frame, 1.5))], `seed ${seed} step ${k}: exit reachable`);
      assert.ok(fl.seen[fl.idx([st.core.x + 1.0, st.core.z])] || fl.seen[fl.idx([st.core.x - 1.0, st.core.z])] || fl.seen[fl.idx([st.core.x, st.core.z + 1.0])] || fl.seen[fl.idx([st.core.x, st.core.z - 1.0])], `seed ${seed} step ${k}: core reachable`);
    }
    r.decor.dispose();
  }
});
ok('stacks runtime: warn / goTo / hold / colliders', () => {
  const r = run('m5cold', 31337);
  const st = r.decor.info.stacks;
  st.goTo(0, true);
  const closedAt = (k) => st.targetsAt(k);
  // colliders reflect the phase
  st.walls.forEach((w, i) => assert.equal(w.col.enabled, closedAt(0)[i] === 1));
  // warn flags the walls that change, goTo animates them
  const changed = st.warn(1);
  assert.ok(changed.length >= 1 && changed.length <= 24);
  for (const i of changed) assert.equal(st.walls[i].warn, true);
  st.goTo(1, false);
  for (let t = 0; t < 400; t++) st.step(1 / 60, null);
  st.walls.forEach((w, i) => { assert.equal(w.ext, closedAt(1)[i]); assert.equal(w.col.enabled, closedAt(1)[i] === 1, 'collider follows the animation'); });
  // hold: a wall that wants to close on the local player waits half-raised and never enables its collider
  const w = st.walls.find((q, i) => closedAt(1)[i] === 0 && closedAt(2)[i] === 1) || st.walls.find((q, i) => closedAt(1)[i] === 0 && closedAt(0)[i] === 1);
  const k = closedAt(2)[w.i] === 1 ? 2 : 0;
  st.goTo(k, false);
  const [wx, wz] = (() => { const c = Math.cos(st.frame.rot), s = Math.sin(st.frame.rot); return [st.frame.x + w.lx * c + w.lz * s, st.frame.z - w.lx * s + w.lz * c]; })();
  const player = { pos: { x: wx, y: st.y0 + 0.9, z: wz } };
  for (let t = 0; t < 300; t++) st.step(1 / 60, player);
  assert.ok(w.hold && w.ext <= 0.5 + 1e-9 && !w.col.enabled, 'wall waits for the player');
  player.pos.x += 30;
  for (let t = 0; t < 300; t++) st.step(1 / 60, player);
  assert.ok(!w.hold && w.ext === 1 && w.col.enabled, 'wall closes once the player stepped away');
  // paint() must not throw and writes every instance; the instance of a fully raised wall sits exactly on its collider
  st.goTo(0, true);
  st.paint(1.2);
  { const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    st.walls.forEach((wl, i) => { if (wl.ext !== 1) return; st.meshes.walls.getMatrixAt(i, m); m.decompose(p, q, sc); assert.ok(Math.hypot(p.x - wl.col.x, p.z - wl.col.z) < 1e-3 && Math.abs(p.y - wl.col.y) < 1e-3, 'visual = collider'); assert.ok(Math.abs(sc.x - wl.col.sx) < 1e-3 && Math.abs(sc.z - wl.col.sz) < 1e-3 && Math.abs(sc.y - wl.col.sy) < 1e-3, 'same size'); }); }
  assert.equal(st.meshes.walls.count, Math.max(1, st.walls.length));
  r.decor.dispose();
});

// ------------------------------------------------------------------------------------------------ 4. props + moons
ok('props: every m5 prop builds, merges by material, has colliders where expected', async () => {
  const { createProp5, PROP5_IDS, SIZE5 } = await import('../../src/models/maps5_props.js');
  for (const id of PROP5_IDS) {
    const o = createProp5(id, { seed: 3 });
    let tris = 0, meshes = 0, lights = 0;
    o.traverse((m) => { if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } if (m.isLight) lights++; });
    assert.ok(meshes >= 1 && meshes <= 9, `${id}: ${meshes} meshes`);
    assert.equal(lights, 0, id + ' adds no scene lights');
    assert.ok(tris < 1500, `${id}: ${tris} tris`);
    assert.ok(SIZE5[id], id + ' has a footprint');
    if (id !== 'archive_ladder') assert.ok(o.userData.colliders.length >= 1, id + ' collider');
  }
});
ok('moons: registered with sensible tiers, costs and tables', () => {
  for (const [id, tier, cost] of [['m5est', 2, 320], ['m5cold', 3, 640]]) {
    const m = MOONS[id];
    assert.ok(m, id);
    assert.equal(m.tier, tier); assert.equal(m.cost, cost);
    assert.ok(BIOMES[m.biome]?.decor, 'biome decor');
    assert.ok(m.scrapCount[0] < m.scrapCount[1] && m.scrapMul >= 1.3);
    assert.ok(m.creatures.turret <= 12 && m.power <= 8, 'balanced for its tier');
  }
  assert.ok(MOONS.m5est.cost > MOONS.w2sun.cost && MOONS.m5cold.cost > MOONS.w2sov.cost);
});

console.log(`\nmaps5 node tests: ${n} passed`);
