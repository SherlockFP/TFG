// BACKROOMS sub-levels: a pure, deterministic plan of which part of a 'backrooms' facility layout is which
// "Level", plus the structural extras the theme adds on top of the layout (pillars, short wall stubs, the
// sealed Manila Room). No THREE / DOM: the same plan is built by the theme's decorate() on every peer, by the
// runtime module (src/game/brlevels.js) and by the Node layout test (tools/harness/br_levels_paths.mjs).
//
//   LEVELS                    [{ id, index, caption, tr }] - index 1..7 is what planBackroomsLevels stores per cell
//   LEVEL_BY_ID               { l0: LEVELS[0], ... }
//   ROOM_LEVEL                room type -> level id (everything else is Level 0)
//   planBackroomsLevels(L, { dark, force })  -> plan (memoised on the layout object as L.brPlan)
//     plan = { cellLevel: Uint8Array (0 = no floor), cellLight: Float32Array (0 = unlit .. 1),
//              fun: { room } | null, run: { cells: [i...], axis: 'x'|'z' } | null,
//              manila: { room, sealed: [edge], slot: edge, loot: {x, z} } | null,
//              pillars: [{ x, z, s }], stubs: [{ x, z, axis, len, t }], l2walls: [edge], counts }
//     edge = { x, z, d, key }  (room cell x, z; d 0 +x, 1 +z, 2 -x, 3 -z; key = L.edgeKey(x, z, d))
//     dark: Set of corridor cell indices without lamps (setpieces planDarkCorridors); force: { fun, run, manila }
//   levelIndexAt(L, plan, x, z) -> 0..7         levelIdAt(L, plan, x, z) -> 'l0' ... 'manila' | null
//   reachableCells(L, closedKeys?) -> Uint8Array (entrance flood fill over open layout edges)
import { RNG } from '../../core/rng.js';

export const LEVELS = [
  { id: 'l0', caption: 'LEVEL 0 - THE LOBBY', short: 'Level 0' },
  { id: 'l1', caption: 'LEVEL 1 - HABITABLE ZONE', short: 'Level 1' },
  { id: 'l2', caption: 'LEVEL 2 - PIPE DREAMS', short: 'Level 2' },
  { id: 'pool', caption: 'LEVEL 37 - THE POOLROOMS', short: 'Level 37' },
  { id: 'fun', caption: 'LEVEL FUN =)', short: 'Level Fun' },
  { id: 'run', caption: 'LEVEL ! - RUN FOR YOUR LIFE', short: 'Level !' },
  { id: 'manila', caption: 'THE MANILA ROOM', short: 'Manila Room' },
];
LEVELS.forEach((l, i) => { l.index = i + 1; });
export const LEVEL_BY_ID = Object.freeze(Object.fromEntries(LEVELS.map((l) => [l.id, l])));
export const LEVEL_IDS = ['', ...LEVELS.map((l) => l.id)];
export const ROOM_LEVEL = Object.freeze({ l1_hall: 'l1', l1_store: 'l1', l2_pipes: 'l2', l2_boiler: 'l2', poolrooms: 'pool' });

// Rarity (per facility). Level Fun and Level ! are "rare", the Manila Room "very rare".
export const CHANCE = { fun: 0.38, run: 0.34, manila: 0.14 };
// the Manila Room's only way in: a narrow slot in an otherwise sealed arch. The player capsule is 0.68 m wide;
// most creatures do not fit through, so it doubles as a secret safe room.
export const SLOT_W = 0.82;
export const SLOT_H = 2.0;
export const PILLAR = 0.7;
export const STUB_LEN = 2.0, STUB_T = 0.2;

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const L0_ROOMS = new Set(['yellow_room', 'office_void', 'dark_zone']);

/** Entrance flood fill over open layout edges (doors count as passable), minus `closed` edge keys. */
export function reachableCells(L, closed = null) {
  const W = L.w, H = L.h, seen = new Uint8Array(W * H);
  const ent = L.entrance.room, q = [L.idx(ent.cx, ent.cz)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (seen[j] || !L.cells[j]) continue;
      const k = L.edgeKey(x, z, d);
      if (!L.open.has(k) || (closed && closed.has(k))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}
const countOf = (a) => { let n = 0; for (let i = 0; i < a.length; i++) n += a[i]; return n; };

/** Straight corridor runs (narrow corridor cells, not the open zones) along x or z, length >= minLen. */
function corridorRuns(L, dark, minLen) {
  const W = L.w, H = L.h, out = [];
  const straight = (x, z, axis) => {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2 || L.zoneMask?.[i] || dark?.has(i) || (L.distOf[i] ?? -1) < 3) return false;
    const o = (d) => L.open.has(L.edgeKey(x, z, d));
    const busy = (d) => o(d) || L.edgeInfo.has(L.edgeKey(x, z, d));
    return axis === 'x' ? !busy(1) && !busy(3) : !busy(0) && !busy(2);
  };
  for (const axis of ['x', 'z']) {
    const n = axis === 'x' ? H : W, m = axis === 'x' ? W : H;
    for (let a = 0; a < n; a++) {
      let run = [];
      const flush = () => { if (run.length >= minLen) out.push({ axis, cells: run }); run = []; };
      for (let b = 0; b < m; b++) {
        const x = axis === 'x' ? b : a, z = axis === 'x' ? a : b;
        // consecutive cells must also be joined by an open edge
        if (straight(x, z, axis) && (!run.length || L.open.has(L.edgeKey(x, z, axis === 'x' ? 2 : 3)))) run.push(L.idx(x, z));
        else { flush(); if (straight(x, z, axis)) run.push(L.idx(x, z)); }
      }
      flush();
    }
  }
  return out;
}

/** Perimeter edges of a room that lead out of it (open layout edges). */
function roomOpenings(L, r) {
  const out = [];
  for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], nz = z + DZ[d];
    if (nx >= r.x && nx < r.x + r.w && nz >= r.z && nz < r.z + r.h) continue;
    const key = L.edgeKey(x, z, d);
    if (L.open.has(key)) out.push({ x, z, d, key, info: L.edgeInfo.get(key) || null, out: (nx >= 0 && nz >= 0 && nx < L.w && nz < L.h) ? L.idx(nx, nz) : -1 });
  }
  return out;
}

export function planBackroomsLevels(L, opts = {}) {
  if (!L || L.theme !== 'backrooms') return null;
  if (L.brPlan && !opts.force) return L.brPlan;
  const W = L.w, H = L.h;
  const force = opts.force || globalThis.__brForce || {};   // debug / tests: { fun, run, manila } always on
  const dark = opts.dark || null;
  const base = new RNG(((L.seed ^ 0xb4c70e) >>> 0) || 1);
  const rFun = base.fork('fun'), rRun = base.fork('run'), rMan = base.fork('manila'), rDeco = base.fork('deco'), rLight = base.fork('light');
  const cellLevel = new Uint8Array(W * H);
  const LV = (id) => LEVEL_BY_ID[id].index;
  for (let i = 0; i < W * H; i++) {
    if (!L.cells[i]) continue;
    const r = L.roomOf[i];
    const type = r >= 0 ? L.rooms[r].type : null;
    cellLevel[i] = LV(ROOM_LEVEL[type] || 'l0');
  }
  const roomDist = (r) => L.distOf[L.idx(r.cx, r.cz)] ?? 0;
  const markRoom = (r, id) => { for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) cellLevel[L.idx(x, z)] = LV(id); };

  // ---- Level Fun =): one bigger yellow room, rare
  let fun = null;
  if (force.fun || rFun.chance(CHANCE.fun)) {
    let cand = L.rooms.filter((r) => r.type === 'yellow_room' && !r.hub && r.w * r.h >= 12 && roomDist(r) >= 4);
    if (!cand.length) cand = L.rooms.filter((r) => L0_ROOMS.has(r.type) && !r.hub && r.w * r.h >= 9 && roomDist(r) >= 3);
    if (cand.length) { fun = { room: rFun.pick(cand) }; markRoom(fun.room, 'fun'); }
  }

  // ---- Level !: the longest straight narrow corridor (>= 5 cells = 20 m), rare
  let run = null;
  if (force.run || rRun.chance(CHANCE.run)) {
    let runs = corridorRuns(L, dark, 5);
    if (!runs.length && force.run) runs = corridorRuns(L, dark, 3);
    if (runs.length) {
      runs.sort((a, b) => b.cells.length - a.cells.length);
      const top = runs.filter((q) => q.cells.length >= runs[0].cells.length - 1);
      const pick = rRun.pick(top);
      run = { axis: pick.axis, cells: pick.cells.slice(0, 9) };
      for (const i of run.cells) cellLevel[i] = LV('run');
    }
  }

  // ---- The Manila Room: a small Level 0 room far from the entrance, every opening sealed but one narrow slot
  let manila = null;
  if (force.manila || rMan.chance(CHANCE.manila)) {
    const baseSeen = reachableCells(L);
    const baseCount = countOf(baseSeen);
    const cand = rMan.shuffle(L.rooms.filter((r) => L0_ROOMS.has(r.type) && r !== fun?.room && !r.hub && r.w * r.h <= 12 && roomDist(r) >= 5));
    for (const r of cand) {
      const ops = roomOpenings(L, r);
      if (!ops.length || ops.some((e) => !e.info || e.info.type !== 'arch')) continue;
      if (ops.some((e) => e.out >= 0 && cellLevel[e.out] === LV('run'))) continue;
      // the slot prefers a narrow corridor outside (easy to walk past), then anything
      const order = ops.slice().sort((a, b) => (L.cells[b.out] === 2 && !L.zoneMask?.[b.out] ? 1 : 0) - (L.cells[a.out] === 2 && !L.zoneMask?.[a.out] ? 1 : 0));
      let done = null;
      for (const slot of order) {
        const sealed = ops.filter((e) => e !== slot);
        const closed = new Set(sealed.map((e) => e.key));
        if (countOf(reachableCells(L, closed)) === baseCount) { done = { slot, sealed }; break; }
      }
      if (!done) continue;
      const strip = (e) => ({ x: e.x, z: e.z, d: e.d, key: e.key });
      manila = { room: r, slot: strip(done.slot), sealed: done.sealed.map(strip), loot: { x: L.ox + (r.x + r.w / 2) * L.cell, z: L.oz + (r.z + r.h / 2) * L.cell } };
      markRoom(r, 'manila');
      break;
    }
  }

  // ---- Level 2: serpentine partitions turn every multi-cell pipe room into narrow maintenance tunnels. Partitions
  // sit on the room's internal cell edges, parallel to its long axis, each leaving one end open (alternating), so
  // every lane stays connected and every doorway reachable.
  const l2walls = [];
  for (const r of L.rooms) {
    if (r.type !== 'l2_pipes') continue;
    const alongX = r.w >= r.h, lanes = alongX ? r.h : r.w, len = alongX ? r.w : r.h;
    if (lanes < 2 || len < 2) continue;
    for (let k = 1; k < lanes; k++) {
      const gapAt = k % 2 ? len - 1 : 0;
      for (let a = 0; a < len; a++) {
        if (a === gapAt) continue;
        const x = alongX ? r.x + a : r.x + k - 1, z = alongX ? r.z + k - 1 : r.z + a, d = alongX ? 1 : 0;
        l2walls.push({ x, z, d, key: L.edgeKey(x, z, d), room: r.id });
      }
    }
  }

  // ---- structural extras inside the open zones: pillars and short free-standing wall stubs
  const pillars = [], stubs = [];
  const C = L.cell;
  const allOpen = (x, z) => { for (let d = 0; d < 4; d++) if (!L.open.has(L.edgeKey(x, z, d)) || L.edgeInfo.has(L.edgeKey(x, z, d))) return false; return true; };
  const used = new Uint8Array(W * H);
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = L.idx(x, z);
    if (!L.zoneMask?.[i] || cellLevel[i] !== LV('l0') || (L.distOf[i] ?? 0) < 3 || !allOpen(x, z)) continue;
    const cx = L.ox + (x + 0.5) * C, cz = L.oz + (z + 0.5) * C;
    const roll = rDeco.next();
    if (roll < 0.15) { pillars.push({ x: cx, z: cz, s: PILLAR, cell: i }); used[i] = 1; }
    else if (roll < 0.23 && (L.distOf[i] ?? 0) >= 4) {
      // never next to another stub/pillar cell: every stub keeps a full lane on both sides
      let near = false;
      for (let d = 0; d < 4; d++) if (used[L.idx(x + DX[d], z + DZ[d])]) near = true;
      if (near) continue;
      const axis = rDeco.chance(0.5) ? 'x' : 'z';
      const off = rDeco.float(-0.4, 0.4);
      stubs.push({ x: cx + (axis === 'z' ? off : 0), z: cz + (axis === 'x' ? off : 0), axis, len: STUB_LEN, t: STUB_T, cell: i });
      used[i] = 2;
    }
  }

  // ---- baked light per cell (0 dark .. 1 fully lit), used by the look (vertex bake) and the runtime
  const cellLight = new Float32Array(W * H);
  const deadCell = new Uint8Array(W * H);   // 1 = some troffers dead, 2 = flickering
  for (let i = 0; i < W * H; i++) {
    if (!L.cells[i]) continue;
    const r = L.roomOf[i], type = r >= 0 ? L.rooms[r].type : null;
    const lv = LEVEL_IDS[cellLevel[i]];
    let v = 0.92 + rLight.next() * 0.08;
    const roll = rLight.next();
    if (roll < 0.05) { deadCell[i] = 1; v *= 0.8; } else if (roll < 0.09) deadCell[i] = 2;
    if (type === 'dark_zone' || dark?.has(i)) v = 0;
    else if (type === 'nest') v = 0.2;
    else if (type === 'vault' || type === 'generator') v = 0.55;
    if (lv === 'run') v = 0.3;
    else if (lv === 'l1') v = 0.62;
    else if (lv === 'l2') v = 0.22;
    else if (lv === 'pool') v = 1;
    else if (lv === 'manila') v = 0.72;
    cellLight[i] = v;
  }

  const plan = {
    cellLevel, cellLight, deadCell, fun, run, manila, pillars, stubs, l2walls,
    counts: Object.fromEntries(LEVELS.map((l) => [l.id, countOf(cellLevel.map((c) => (c === l.index ? 1 : 0)))])),
  };
  L.brPlan = plan;
  return plan;
}

export function levelIndexAt(L, plan, x, z) {
  if (!L || !plan) return 0;
  const gx = Math.floor((x - L.ox) / L.cell), gz = Math.floor((z - L.oz) / L.cell);
  if (gx < 0 || gz < 0 || gx >= L.w || gz >= L.h) return 0;
  return plan.cellLevel[gz * L.w + gx] || 0;
}
export function levelIdAt(L, plan, x, z) { return LEVEL_IDS[levelIndexAt(L, plan, x, z)] || null; }
