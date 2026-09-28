// Node test: the Backrooms sub-level plan keeps every layout walkable (no unreachable cells, no stuck pockets).
//   node tools/harness/br_levels_paths.mjs [seeds=100]
// For every seed x size (0.8 .. 2.6) it builds the 'backrooms' layout (facility.js generateLayout) and the level plan
// (backrooms_levels.js - the same pure function the theme's decorate() uses on every peer). Odd seeds force the
// rare levels (Level Fun, Level !, Manila Room) so their geometry rules get exercised every run.
// Then it rasterises the walkable floor at 10 cm: layout walls (0.3 m thick, doorway gaps from edgeInfo widths),
// the theme's pillars + wall stubs, the walled-up Manila Room arches and its narrow slot; grows every solid by the
// player radius and flood-fills from the entrance. Fails on: a floor cell with no reachable pixel, a walkable pocket
// the player could stand in but never walk out of (> 0.1 m2), a Manila seal that leaks, a plan that is not
// deterministic, or a plan invariant (run = straight corridor, fun = Level 0 room, obstacles only in fully open cells).
import { generateLayout } from '../../src/world/facility.js';
import { planBackroomsLevels, LEVELS, SLOT_W, STUB_LEN, STUB_T } from '../../src/world/interiors/backrooms_levels.js';
import { planDarkCorridors } from '../../src/world/setpieces.js';

const SEEDS = Number(process.argv[2] || 100);
const SIZES = [0.8, 1.2, 1.6, 2.0, 2.6];
const RES = 0.1, GROW = 3;                    // 10 cm pixels, solids grown by 0.3 m (square) ~ player radius 0.34
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const t0 = Date.now();
const fails = [];
const tally = { layouts: 0, fun: 0, run: 0, manila: 0, l1: 0, l2: 0, pillars: 0, stubs: 0, l2walls: 0, cells: 0, pocketsOther: 0 };

function check(seed, size) {
  const force = seed % 2 ? { fun: true, run: true, manila: true } : null;
  const L = generateLayout(seed * 2654435761 >>> 0, 'backrooms', size);
  const dark = planDarkCorridors(L);
  const plan = planBackroomsLevels(L, { dark, force: force || undefined });
  const again = planBackroomsLevels({ ...L, brPlan: null }, { dark, force: force || {} });
  const sig = (p) => JSON.stringify([p.counts, p.fun?.room.id, p.run?.cells, p.manila?.room.id, p.manila?.slot, p.pillars.length, p.stubs.length]);
  if (sig(plan) !== sig(again)) fails.push({ seed, size, why: 'plan not deterministic' });
  tally.layouts++; tally.fun += !!plan.fun; tally.run += !!plan.run; tally.manila += !!plan.manila;
  tally.l1 += plan.counts.l1 > 0; tally.l2 += plan.counts.l2 > 0; tally.pillars += plan.pillars.length; tally.stubs += plan.stubs.length; tally.l2walls += plan.l2walls.length;
  const W = L.w, H = L.h, C = L.cell;
  // ---- invariants
  if (plan.run) {
    const xs = plan.run.cells.map((i) => i % W), zs = plan.run.cells.map((i) => Math.floor(i / W));
    const straight = plan.run.axis === 'x' ? new Set(zs).size === 1 : new Set(xs).size === 1;
    if (!straight || plan.run.cells.some((i) => L.cells[i] !== 2)) fails.push({ seed, size, why: 'Level ! is not a straight corridor' });
  }
  if (plan.fun && !['yellow_room', 'office_void', 'dark_zone'].includes(plan.fun.room.type)) fails.push({ seed, size, why: 'Level Fun on a ' + plan.fun.room.type });
  for (const o of [...plan.pillars, ...plan.stubs]) {
    const x = o.cell % W, z = Math.floor(o.cell / W);
    for (let d = 0; d < 4; d++) if (!L.open.has(L.edgeKey(x, z, d)) || L.edgeInfo.has(L.edgeKey(x, z, d))) fails.push({ seed, size, why: 'obstacle in a cell with a wall/doorway' });
  }
  // ---- raster
  const PW = Math.round((W * C) / RES), PH = Math.round((H * C) / RES);
  const solid = new Uint8Array(PW * PH).fill(1);
  const fill = (x0, z0, x1, z1, v) => {
    const a = Math.max(0, Math.floor((Math.min(x0, x1) - L.ox) / RES)), b = Math.min(PW - 1, Math.floor((Math.max(x0, x1) - L.ox) / RES - 1e-6));
    const c = Math.max(0, Math.floor((Math.min(z0, z1) - L.oz) / RES)), d = Math.min(PH - 1, Math.floor((Math.max(z0, z1) - L.oz) / RES - 1e-6));
    for (let pz = c; pz <= d; pz++) solid.fill(v, pz * PW + a, pz * PW + b + 1);
  };
  const wx = (x) => L.ox + x * C, wz = (z) => L.oz + z * C;
  for (let i = 0; i < W * H; i++) if (L.cells[i]) fill(wx(i % W), wz(Math.floor(i / W)), wx(i % W + 1), wz(Math.floor(i / W) + 1), 0);
  // wall segment on edge (x, z, d) between along-offsets s0..s1 (from the edge's low-coordinate end), 0.3 m thick
  const seg = (x, z, d, s0, s1, T = 0.15) => {
    if (d === 0 || d === 2) { const ex = wx(x + (d === 0 ? 1 : 0)); fill(ex - T, wz(z) + s0, ex + T, wz(z) + s1, 1); }
    else { const ez = wz(z + (d === 1 ? 1 : 0)); fill(wx(x) + s0, ez - T, wx(x) + s1, ez + T, 1); }
  };
  const sealed = new Set(plan.manila?.sealed.map((e) => e.key) || []);
  const slotKey = plan.manila?.slot.key;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!L.cells[L.idx(x, z)]) continue;
    for (let d = 0; d < 4; d++) {
      const key = L.edgeKey(x, z, d), info = L.edgeInfo.get(key), open = L.open.has(key);
      if (open && !info) continue;
      if (!info || info.type === 'entrance' || info.type === 'fireexit' || sealed.has(key)) { seg(x, z, d, 0, C); continue; }
      const w = key === slotKey ? SLOT_W : info.width;
      seg(x, z, d, 0, (C - w) / 2); seg(x, z, d, (C + w) / 2, C);
    }
  }
  for (const e of plan.l2walls) seg(e.x, e.z, e.d, 0, C);
  for (const p of plan.pillars) fill(p.x - p.s / 2, p.z - p.s / 2, p.x + p.s / 2, p.z + p.s / 2, 1);
  for (const s of plan.stubs) { const hx = (s.axis === 'x' ? STUB_LEN : STUB_T) / 2, hz = (s.axis === 'x' ? STUB_T : STUB_LEN) / 2; fill(s.x - hx, s.z - hz, s.x + hx, s.z + hz, 1); }
  // ---- grow solids (separable square max filter) -> blocked for the capsule centre
  const grow = () => {
    const tmp = new Uint8Array(PW * PH), block = new Uint8Array(PW * PH);
    for (let pz = 0; pz < PH; pz++) { let run = 0; const row = pz * PW; for (let px = 0; px < PW + GROW; px++) { if (px < PW && solid[row + px]) run = 2 * GROW + 1; if (run > 0) { const q = px - GROW; if (q >= 0 && q < PW) tmp[row + q] = 1; run--; } } }
    for (let px = 0; px < PW; px++) { let run = 0; for (let pz = 0; pz < PH + GROW; pz++) { if (pz < PH && tmp[pz * PW + px]) run = 2 * GROW + 1; if (run > 0) { const q = pz - GROW; if (q >= 0 && q < PH) block[q * PW + px] = 1; run--; } } }
    return block;
  };
  const block = grow();
  // ---- flood from the entrance room centre
  const flood = (blk) => {
    const seen = new Uint8Array(PW * PH), q = new Int32Array(PW * PH);
    const ent = L.entrance.room;
    const sx = Math.floor((wx(ent.x) + ent.w * C / 2 - L.ox) / RES), sz = Math.floor((wz(ent.z) + ent.h * C / 2 - L.oz) / RES);
    let h = 0, tl = 0;
    const s0 = sz * PW + sx;
    if (blk[s0]) return seen;
    seen[s0] = 1; q[tl++] = s0;
    while (h < tl) {
      const p = q[h++], px = p % PW, pz = (p / PW) | 0;
      if (px > 0 && !seen[p - 1] && !blk[p - 1]) { seen[p - 1] = 1; q[tl++] = p - 1; }
      if (px < PW - 1 && !seen[p + 1] && !blk[p + 1]) { seen[p + 1] = 1; q[tl++] = p + 1; }
      if (pz > 0 && !seen[p - PW] && !blk[p - PW]) { seen[p - PW] = 1; q[tl++] = p - PW; }
      if (pz < PH - 1 && !seen[p + PW] && !blk[p + PW]) { seen[p + PW] = 1; q[tl++] = p + PW; }
    }
    return seen;
  };
  const seen = flood(block);
  // every floor cell has reachable floor
  const cellsPer = 1 / RES * C;
  let unreached = 0;
  for (let i = 0; i < W * H; i++) {
    if (!L.cells[i]) continue;
    tally.cells++;
    const x0 = Math.round((i % W) * cellsPer), z0 = Math.round(Math.floor(i / W) * cellsPer);
    let ok = false;
    for (let pz = z0; pz < z0 + cellsPer && !ok; pz++) for (let px = x0; px < x0 + cellsPer; px++) if (seen[pz * PW + px]) { ok = true; break; }
    if (!ok) { unreached++; if (unreached <= 2) fails.push({ seed, size, why: `cell ${i % W},${Math.floor(i / W)} (${LEVELS[plan.cellLevel[i] - 1]?.id}, ${L.roomOf[i] >= 0 ? L.rooms[L.roomOf[i]].type : 'corridor'}) unreachable` }); }
  }
  // stuck pockets: standable pixels (not blocked) that the flood never reached
  let pocket = 0, mine = 0;
  const near = new Uint8Array(W * H);
  for (const o of [...plan.pillars, ...plan.stubs]) { const x = o.cell % W, z = Math.floor(o.cell / W); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < H) near[(z + dz) * W + x + dx] = 1; }
  for (const e of plan.l2walls) near[e.z * W + e.x] = 1;
  if (plan.manila) { const r = plan.manila.room; for (let z = r.z - 1; z <= r.z + r.h; z++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (x >= 0 && z >= 0 && x < W && z < H) near[z * W + x] = 1; }
  for (let p = 0; p < PW * PH; p++) {
    if (block[p] || seen[p]) continue;
    pocket++;
    const cx = Math.floor((p % PW) / cellsPer), cz = Math.floor(Math.floor(p / PW) / cellsPer);
    if (near[cz * W + cx]) mine++;
  }
  if (mine * RES * RES > 0.1) fails.push({ seed, size, why: `stuck pocket next to a pillar/stub/Manila seal: ${(mine * RES * RES).toFixed(2)} m2` });
  if (pocket - mine > 0) tally.pocketsOther++;
  // the Manila seal is complete: close the slot too and the room must become unreachable
  if (plan.manila) {
    const s = plan.manila.slot, r = plan.manila.room;
    seg(s.x, s.z, s.d, 0, C);
    const seen2 = flood(grow());
    const mid = Math.floor((wz(r.z) + r.h * C / 2 - L.oz) / RES) * PW + Math.floor((wx(r.x) + r.w * C / 2 - L.ox) / RES);
    let leak = false;
    for (let dz = -8; dz <= 8 && !leak; dz++) for (let dx = -8; dx <= 8; dx++) if (seen2[mid + dz * PW + dx]) { leak = true; break; }
    if (leak) fails.push({ seed, size, why: 'Manila Room reachable with its slot closed (seal leaks)' });
  }
}

for (let s = 1; s <= SEEDS; s++) for (const size of SIZES) {
  try { check(s, size); } catch (e) { fails.push({ seed: s, size, why: 'threw ' + (e.stack || e).toString().slice(0, 300) }); }
}
const ms = Date.now() - t0;
console.log(JSON.stringify({ seeds: SEEDS, sizes: SIZES, ...tally, fails: fails.length, firstFails: fails.slice(0, 12), ms }, null, 1));
process.exit(fails.length ? 1 : 0);
