// node tools/harness/mining.test.mjs  (mining_core: gen determinism, greedy mesh, DDA, hardness, cave-in, caps)
import assert from 'node:assert/strict';
import * as C from '../../src/game/mining_core.js';
const ok = (n, f) => { f(); console.log('ok  ' + n); };
const terrain = { playHalf: 130, heightAt: (x, z) => 2 + Math.sin(x * 0.02) * 0.3 + Math.cos(z * 0.02) * 0.3 };
const plan = (seed) => C.planOutdoor({ seed, size: 1.3, tier: 2, terrain, avoid: (x, z, m) => Math.hypot(x, z) < 30 + m, sites: [{ x: 60, z: 20, radius: 10 }] });

ok('plan: deterministic, few volumes, off the ship', () => {
  const a = plan(1234), b = plan(1234);
  assert.deepEqual(a, b); assert.ok(a.length >= 2 && a.length <= 4, 'count ' + a.length);
  for (const s of a) assert.ok(Math.hypot(s.x + s.nx * 0.25, s.z + s.nz * 0.25) > 30);
  assert.notDeepEqual(plan(99), a);
});
ok('gen: deterministic; bedrock base; ore capped; value below the daily cap', () => {
  let maxVal = 0;
  for (let seed = 1; seed <= 12; seed++) for (const s of plan(seed)) {
    const v = C.genVolume(s), w = C.genVolume(s);
    assert.deepEqual(v.data, w.data);
    assert.ok(v.count(C.M.BEDROCK) > 0);
    let ores = 0; for (let m = C.M.COPPER; m <= C.M.CRYSTAL; m++) ores += v.count(m);
    assert.ok(ores >= 3 && ores <= 26, 'ores ' + ores);
    maxVal = Math.max(maxVal, C.planOreValue([v]));
  }
  assert.ok(maxVal < 400, 'one volume worth ' + maxVal);   // three volumes together are gated by MN.valueCap
});
ok('greedy mesh: culls interior, chunk borders do not duplicate', () => {
  const v = new C.Vol({ id: 0, kind: 'slab', x: 0, y: 0, z: 0, nx: 20, ny: 4, nz: 4 }); v.data.fill(C.M.STONE);
  let quads = 0, tris = 0;
  for (let k = 0; k < v.chunkCount(); k++) { const [cx, cy, cz] = v.chunkXyz(k); const m = C.meshChunk(v, cx, cy, cz); if (m.a) { tris += m.a.i.length / 3; quads += m.a.p.length / 12; } }
  // a 20x4x4 block is 6 faces; with random stone tints faces merge less, but never more than one quad per cell face and never interior faces
  assert.ok(quads <= 2 * (20 * 4 + 20 * 4 + 4 * 4) && quads >= 6, 'quads ' + quads);
  const v2 = new C.Vol({ id: 0, kind: 'slab', x: 0, y: 0, z: 0, nx: 3, ny: 3, nz: 3 }); v2.data[v2.idx(1, 1, 1)] = C.M.TORCH;
  const m = C.meshChunk(v2, 0, 0, 0); assert.equal(m.a, null); assert.equal(m.b.i.length / 3, 12);   // glowing cell -> unlit buffer, 6 quads
});
ok('dda raycast + edit + re-mesh', () => {
  const v = new C.Vol({ id: 0, kind: 'slab', x: 10, y: 0, z: 10, nx: 8, ny: 8, nz: 8 }); v.data.fill(C.M.STONE);
  const h = C.raycast(v, 5, 2, 12, 1, 0, 0, 20);
  assert.ok(h && h.x === 0 && h.n[0] === -1 && Math.abs(h.t - 5) < 1e-6, JSON.stringify(h));
  assert.equal(C.raycast(v, 5, 2, 12, -1, 0, 0, 20), null);
  const ch = v.apply([C.pack(h.i, C.DUG)]); assert.ok(ch.size >= 1); assert.equal(v.data[h.i], 0); assert.equal(v.dug[h.i], 1);
  assert.equal(C.raycast(v, 5, 2, 12, 1, 0, 0, 20).x, 1);
  v.data[v.idx(0, 0, 0)] = C.M.BEDROCK; v.apply([C.pack(v.idx(0, 0, 0), 0)]); assert.equal(v.data[0], C.M.BEDROCK);
});
ok('hardness / tools: hands slow, pick tiers scale, bedrock never breaks', () => {
  const pick = { id: 'tool_pickaxe', kind: 'weapon', dmg: 13 }, steel = { id: 'tool_pickaxe_steel', kind: 'weapon', dmg: 17 }, drill = { id: 'tool_drill', kind: 'weapon', dmg: 12 };
  assert.equal(C.toolKey(null), 'hand'); assert.equal(C.toolKey(pick), 'pick1'); assert.equal(C.toolKey(steel), 'pick2'); assert.equal(C.toolKey(drill), 'drill');
  assert.equal(C.toolKey({ id: 'bat', kind: 'weapon', dmg: 20 }), 'weapon');
  assert.equal(C.hitsToBreak(C.M.STONE, 13, 'pick1'), 2);
  assert.ok(C.hitsToBreak(C.M.STONE, 5, 'hand') >= 20);
  assert.ok(C.hitsToBreak(C.M.DEEP, 17, 'pick2') < C.hitsToBreak(C.M.DEEP, 13, 'pick1'));
  assert.equal(C.hitsToBreak(C.M.STONE, 12, 'drill'), 1);
  assert.equal(C.hitsToBreak(C.M.BEDROCK, 120, 'drill') > 1e6, true);
});
ok('cave-in: wide undermining warns, beams relieve, natural caves do not count', () => {
  const v = new C.Vol({ id: 0, kind: 'slab', x: 0, y: 0, z: 0, nx: 16, ny: 8, nz: 16 }); v.data.fill(C.M.STONE);
  const edits = [];
  for (let y = 1; y <= 4; y++) for (let z = 6; z <= 7; z++) for (let x = 2; x < 12; x++) edits.push(C.pack(v.idx(x, y, z), C.DUG));   // 2-wide, 4-tall tunnel
  v.apply(edits);
  assert.equal(C.isUnstable(v, 7, 2, 6), false);
  const wide = []; for (let y = 1; y <= 4; y++) for (let z = 8; z <= 9; z++) for (let x = 5; x <= 9; x++) wide.push(C.pack(v.idx(x, y, z), C.DUG));
  v.apply(wide);
  assert.equal(C.isUnstable(v, 7, 2, 7), true);
  v.apply([C.pack(v.idx(7, 1, 7), 0), C.pack(v.idx(7, 1, 5), C.M.BEAM), C.pack(v.idx(8, 1, 5), C.M.BEAM), C.pack(v.idx(9, 1, 5), C.M.BEAM)]);
  assert.equal(C.isUnstable(v, 7, 2, 7), false);
  const roof = C.collapseCells(v, 7, 2, 7); assert.ok(roof.length > 0 && roof.length <= 14 && roof.every((i) => v.data[i] && v.data[i] !== C.M.BEDROCK));
  const nat = new C.Vol({ id: 0, kind: 'slab', x: 0, y: 0, z: 0, nx: 16, ny: 8, nz: 16 }); nat.data.fill(C.M.STONE);
  for (let y = 1; y <= 4; y++) for (let z = 3; z <= 12; z++) for (let x = 3; x <= 12; x++) nat.data[nat.idx(x, y, z)] = 0;   // a natural cavern: not "dug"
  assert.equal(C.isUnstable(nat, 8, 2, 8), false);
});
ok('ore economy: daily value cap gates drops', () => {
  const st = { value: 0, items: 0 }; let n = 0;
  while (C.oreDropOk(st, C.M.QUARTZ) && n < 100) { st.value += C.MATS[C.M.QUARTZ].drop.val; st.items++; n++; }
  assert.ok(st.value <= C.MN.valueCap + 8 && n >= 8 && n < 20, `value ${st.value} n ${n}`);
  assert.equal(C.oreDropOk(st, C.M.BEAM), true); assert.equal(C.oreDropOk(st, C.M.STONE), false);
});
ok('indoor plan: room corner, away from doors, deterministic', () => {
  const L = { cell: 4, ox: -40, oz: -40, y: -300, entrance: { room: 0 }, rooms: [{ id: 0, x: 4, z: 4, w: 3, h: 3, type: 'entrance' }, { id: 1, x: 10, z: 3, w: 3, h: 2, type: 'ore_vein', height: 4 }, { id: 2, x: 2, z: 10, w: 1, h: 1, type: 'cavern' }] };
  const doors = [{ pos: { x: -40 + 10 * 4 - 0.5, z: -40 + 3 * 4 + 4 } }];
  const a = C.planIndoor({ seed: 7, layout: L, doors }), b = C.planIndoor({ seed: 7, layout: L, doors });
  assert.deepEqual(a, b); assert.ok(a.length >= 1 && a.every((s) => s.kind === 'slab' && s.y === -300));
  for (const s of a) { const v = C.genVolume(s); assert.ok(v.solidCount() > 0 && v.ny <= 6); }
});
