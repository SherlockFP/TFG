// STEALTH wave 4 - facility VARIETY (docs/wave4/stealth.md). Regular facilities (normal moons) get, seeded and solvable:
//   * extra MAZE rooms in six styles (world/maze_styles.js): twisty, braided, bramble, serpentine, spiral, ring
//   * LIMINAL rooms: yellow-wallpaper CUBICLE FARM (lim_office), empty POOL ROOM with pillars + a sheet of shallow water (lim_pool),
//     and the fluorescent HALL LOOP (lim_halls: a hallway that circles the room, identical alcoves hanging off it; finite, only feels endless)
//   * DEAD ENDS WITH REWARDS: every maze nook is a loot spot, the deepest ones get a guaranteed prize (spawned by game/stealth.js)
//   * ONE-WAY DROPS: a creaky hatch floor guards some nooks: cross it quietly (sneak) or fall through to a spot nearer the entrance
//   * LOCKED SHORTCUTS: a door between two far-apart corridors, locked on the near-entrance side, that opens from the other (deep) side
// Everything is DETERMINISTIC (own RNG fork of the layout seed) and NEVER touches connectivity rules: rooms are added before the corridors
// exist (so the repair pass connects them), the shortcut is an EXTRA edge between two already reachable cells, hatches only teleport
// to reachable cells. tools/harness/stealth_maze.test.mjs BFS-checks all of it over hundreds of seeds x themes x sizes.
// Off switches: opts.variety === false, globalThis.__kefalVarietyOff (reproduces the pre-wave-4 facility bit for bit).
//   varietyOn(theme, size, opts)        gate
//   planVarietyRooms(ctx)               HOOK A (inside generateLayout, before the random room fill): reserves maze / liminal rooms
//   planVarietyFeatures(ctx)            HOOK B (after the distance BFS): dead ends, hatches, shortcut edge
//   installVarietyStyles(THEMES)        room styles lim_office / lim_pool / lim_halls for every theme
//   buildVariety(ctx)                   geometry + props + spot lists (fac.variety), called from buildFacility (failure isolated)
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { layoutKit, navClear, surfacePlane, SPECIAL_ROOMS, WALL_ROT } from './interiors/common.js';
import { pickMazeStyle } from './mazegen.js';

export const LIM_TYPES = ['lim_office', 'lim_pool', 'lim_halls'];
for (const ty of LIM_TYPES) SPECIAL_ROOMS.add(ty);   // facsys / hazards / setpieces / maps2 leave these rooms alone (props are placed here)

const LIM_STYLE = {
  lim_office: { floor: 'carpet_office', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'fluorescent', wall_: [], clutter: [], center: [], posters: 0 },
  lim_pool: { floor: 'pool_tiles', wall: 'pool_tiles', ceil: 'pool_tiles', lamp: null, wall_: [], clutter: [], center: [], posters: 0 },
  lim_halls: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'fluorescent', wall_: [], clutter: [], center: [], posters: 0 },
};
export function installVarietyStyles(THEMES) {
  for (const th of Object.values(THEMES)) {
    if (!th?.rooms) continue;
    for (const [ty, st] of Object.entries(LIM_STYLE)) if (!th.rooms[ty]) th.rooms[ty] = { ...st };
  }
}

/** does this facility get the variety pass? (cycle cores / raids / keystones / deep servers already carry their own structure) */
export function varietyOn(theme, size, O) {
  if (globalThis.__kefalVarietyOff) return false;
  if (O && O.variety === false) return false;
  if (theme === 'backrooms') return false;                       // already one big liminal maze
  if (O && (O.labyrinth || O.arena || O.wings) && O.variety !== true) return false;
  return size >= 0.75;
}
export function varietyCounts(size) {
  return {
    mazes: size < 0.95 ? 0 : size < 1.4 ? 1 : 2,
    liminal: size < 0.75 ? 0 : size < 1.2 ? 1 : size < 1.8 ? 2 : 3,
  };
}

// ------------------------------------------------------------------------------------------------ HOOK A: rooms
/** ctx: { seed, theme, size, O, W, H, canPlace(x,z,w,h), addRoom(x,z,w,h,type), mazeRooms }. Returns the plan object or null. */
export function planVarietyRooms(ctx) {
  if (!varietyOn(ctx.theme, ctx.size, ctx.O)) return null;
  const rng = new RNG((ctx.seed ^ 0x57ea17) >>> 0);
  const { W, H, size } = ctx;
  const V = { rng, mazes: [], liminal: [], count: 0, deadEnds: [], hatches: [], shortcut: null };
  const cnt = varietyCounts(size);
  const place = (wMin, wMax, hMin, hMax, type) => {
    for (let a = 0; a < 140; a++) {
      const w = rng.int(wMin, wMax), h = rng.int(hMin, hMax);
      const x = rng.int(1, W - w - 1), z = rng.int(1, H - h - 7);
      if (ctx.canPlace(x, z, w, h)) return ctx.addRoom(x, z, w, h, type);
    }
    return null;
  };
  const big = size >= 1.4;
  // maze rooms: the style is picked from the room shape; the facility generator carves it after the corridors exist
  for (let i = 0; i < cnt.mazes; i++) {
    if (i > 0 && !rng.chance(0.7)) continue;
    const r = place(4, big ? 7 : 6, 3, big ? 6 : 5, 'big');
    if (!r) continue;
    r.maze = true; r.varMaze = true;
    r.mazeStyle = pickMazeStyle(rng, r.w, r.h, size);
    ctx.mazeRooms.push(r);
    V.mazes.push({ room: r.id, style: r.mazeStyle });
    V.count++;
  }
  // liminal rooms (each kind at most once per facility)
  const kinds = [['office', 3], ['pool', 2], ['halls', 3]];
  for (let i = 0; i < cnt.liminal && kinds.length; i++) {
    const k = rng.weighted(kinds.map(([id, w]) => ({ id, w })));
    kinds.splice(kinds.findIndex((q) => q[0] === k.id), 1);
    let r = null;
    if (k.id === 'office') r = place(5, 8, 4, 5, 'lim_office');
    else if (k.id === 'pool') r = place(4, 6, 4, 5, 'lim_pool');
    else { r = place(5, 7, 4, 6, 'lim_halls'); if (r) { r.maze = true; r.varMaze = true; r.mazeStyle = 'ring'; ctx.mazeRooms.push(r); } }
    if (!r) continue;
    r.lim = k.id;
    V.liminal.push({ room: r.id, kind: k.id });
    V.count++;
  }
  return V;
}

// ------------------------------------------------------------------------------------------------ HOOK B: dead ends, hatches, shortcut
/** ctx: { V, W, H, cells, roomOf, rooms, open, edgeKey, idx, distOf, size } - mutates `open` (shortcut edge) and V. */
export function planVarietyFeatures(ctx) {
  const { V, W, H, cells, roomOf, rooms, open, edgeKey, idx, distOf, size } = ctx;
  if (!V) return;
  const rng = V.rng;
  const DXS = [1, 0, -1, 0], DZS = [0, 1, 0, -1];
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const roomAt = (i) => (roomOf[i] >= 0 ? rooms[roomOf[i]] : null);

  // dead ends of maze rooms (cells with exactly one open edge; the outside links count)
  const cand = [];
  for (const r of rooms) {
    if (!r.maze) continue;
    const list = [];
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
      let deg = 0;
      for (let d = 0; d < 4; d++) { const nx = x + DXS[d], nz = z + DZS[d]; if (inb(nx, nz) && cells[idx(nx, nz)] && open.has(edgeKey(x, z, d))) deg++; }
      const dist = distOf[idx(x, z)];
      if (deg === 1 && dist >= 3) list.push({ room: r.id, x, z, dist });
    }
    list.sort((a, b) => b.dist - a.dist || a.z - b.z || a.x - b.x);
    for (const e of list.slice(0, size >= 1.4 ? 3 : 2)) cand.push(e);
  }
  V.deadEnds = cand;

  // one-way drops: a hatch in some dead ends; it lands on a reachable, plain, nearer-the-entrance cell
  const maxHatch = size >= 1.3 ? 2 : 1;
  const usedRoom = new Set();
  for (const e of cand.slice().sort((a, b) => b.dist - a.dist)) {
    if (V.hatches.length >= maxHatch) break;
    if (usedRoom.has(e.room) || e.dist < 6 || !rng.chance(0.45)) continue;
    const dest = [];
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
      const i = idx(x, z);
      if (cells[i] !== 2 || distOf[i] < 3 || distOf[i] > e.dist - 3 || roomAt(i)) continue;   // corridor cells only: never a sealed / maze / liminal room
      if (Math.abs(x - e.x) + Math.abs(z - e.z) < 8) continue;
      dest.push({ x, z, dist: distOf[i] });
    }
    if (!dest.length) continue;
    const to = dest[rng.int(0, dest.length - 1)];
    usedRoom.add(e.room);
    V.hatches.push({ room: e.room, x: e.x, z: e.z, dist: e.dist, to: { x: to.x, z: to.z, dist: to.dist } });
  }

  // locked shortcut: an extra edge between two far-apart (by walking distance) cells that are adjacent through a wall
  let best = null;
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) for (let d = 0; d < 2; d++) {
    const nx = x + DXS[d], nz = z + DZS[d];
    if (!inb(nx, nz)) continue;
    const a = idx(x, z), b = idx(nx, nz);
    if (!cells[a] || !cells[b] || distOf[a] < 0 || distOf[b] < 0) continue;
    const key = edgeKey(x, z, d);
    if (open.has(key)) continue;
    const ra = roomAt(a), rb = roomAt(b);
    if (ra && rb && ra === rb) continue;
    if (!plainShortcut(ra) || !plainShortcut(rb)) continue;
    const diff = Math.abs(distOf[a] - distOf[b]);
    if (diff < 9) continue;
    const score = diff * 10 + Math.min(distOf[a], distOf[b]);
    if (!best || score > best.score || (score === best.score && key < best.key)) best = { key, a, b, x, z, d, score, diff };
  }
  if (best && (size >= 1 || rng.chance(0.5))) {
    open.add(best.key);
    const deepIsB = distOf[best.b] > distOf[best.a];
    V.shortcut = { key: best.key, a: best.a, b: best.b, latch: deepIsB ? 'b' : 'a', diff: best.diff };
  }
  function plainShortcut(r) { return !r || !(r.treasure || r.arena || ['entrance', 'vault', 'generator', 'core', 'arena'].includes(r.type)); }
}

/** door info for the shortcut edge (called by the door loop in generateLayout) */
export function shortcutInfo(V) {
  return { type: 'door', width: 1.35, doorH: 2.35, locked: true, shortcut: true, latch: V.shortcut.latch };
}

// ------------------------------------------------------------------------------------------------ build
const col3 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
function decodeEdge(L, key) { const dir = key & 1, ci = key >> 1; return { x: ci % L.w, z: (ci / L.w) | 0, dir }; }

/** ctx (from buildFacility): { layout, group, addBox, placeProp, nav, Y, CELL, levelMaterial, GeoBuilder, emitters, scrapSpots, rng, theme } */
export function buildVariety(ctx) {
  const L = ctx.layout, V = L.variety;
  if (!V) return null;
  const K = layoutKit(L), Y = ctx.Y, C = L.cell, rng = ctx.rng;
  const gb = new ctx.GeoBuilder();
  const out = { rooms: [], hatches: [], rewards: [], shortcut: null, pools: [], mesh: null, disposers: [], plan: V };
  const em = (x, y, z, color, intensity, distance, flicker = 0) => { const e = { pos: new THREE.Vector3(x, y, z), color, intensity, distance, group: 'facility', flicker }; ctx.emitters.push(e); return e; };
  const box = (key, x, y, z, sx, sy, sz, hex, block = true) => {
    gb.box(key, x, y, z, sx, sy, sz, 0.5, col3(hex));
    if (block) { ctx.addBox(x, y, z, sx, sy, sz); ctx.nav.blockBox(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 0.1); }
  };
  const cellC = (x, z) => [K.wx(x) + C / 2, K.wz(z) + C / 2];
  const doorPts = (r) => r.linkKeys.map((k) => {
    const e = decodeEdge(L, k);
    return e.dir === 0 ? [K.wx(e.x + 1), K.wz(e.z) + C / 2] : [K.wx(e.x) + C / 2, K.wz(e.z + 1)];
  });

  // ---- liminal rooms
  for (const r of L.rooms) {
    if (!r.lim) continue;
    const rc = K.roomRect(r), doors = doorPts(r), h = r.height;
    const nearDoor = (x, z, gap) => doors.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < gap);
    out.rooms.push({ room: r.id, kind: r.lim });
    if (r.lim === 'office') {
      // cubicle farm: U-shaped chest-high partitions with a desk + chair, abandoned mid-shift
      const px = 4.0, pz = 4.6;
      const nx = Math.max(1, Math.floor((rc.x1 - rc.x0 - 3.4) / px) + 1), nz = Math.max(1, Math.floor((rc.z1 - rc.z0 - 3.0) / pz) + 1);
      const ox = rc.x0 + ((rc.x1 - rc.x0) - (nx - 1) * px) / 2, oz = rc.z0 + ((rc.z1 - rc.z0) - (nz - 1) * pz) / 2;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const cx = ox + i * px, cz = oz + j * pz;
        if (nearDoor(cx, cz, 3.0) || rng.chance(0.1)) continue;
        if (!navClear(ctx.nav, cx - 1.4, cz - 1.1, cx + 1.4, cz + 1.2, 0.05)) continue;
        const PT = 0xb7b195, PT2 = 0x9c9680;
        box('plain', cx, Y + 0.75, cz + 1.05, 2.7, 1.5, 0.09, PT);
        box('plain', cx - 1.3, Y + 0.75, cz + 0.05, 0.09, 1.5, 2.1, PT);
        box('plain', cx + 1.3, Y + 0.75, cz + 0.05, 0.09, 1.5, 2.1, PT);
        gb.box('plain', cx, Y + 1.52, cz + 1.05, 2.72, 0.05, 0.11, 0.5, col3(PT2));
        ctx.placeProp('desk', cx, Y, cz + 0.62, Math.PI, { visualOnly: false });
        if (rng.chance(0.75)) ctx.placeProp('office_chair', cx + rng.float(-0.3, 0.3), Y, cz - 0.15, rng.float(0, 6.28), { visualOnly: true });
        if (rng.chance(0.3)) ctx.scrapSpots.push({ x: cx + rng.float(-0.5, 0.5), y: Y, z: cz + rng.float(-0.2, 0.4), room: r.id, type: 'lim_office', dist: L.distOf[L.idx(r.cx, r.cz)] || 0 });
      }
    } else if (r.lim === 'pool') {
      // empty pool room: a sheet of ankle-deep water, tall pillars every two cells (great to hide behind), cold light
      const pool = { x0: rc.x0 + 0.3, z0: rc.z0 + 0.3, x1: rc.x1 - 0.3, z1: rc.z1 - 0.3 };
      const water = surfacePlane(ctx.group, ctx.levelMaterial, 'water', pool, Y + 0.13, { color: 0xa8e8ee, opacity: 0.5, uv: 0.22, emissive: 0x0a2a30 });
      out.disposers.push(() => { water.geometry.dispose(); water.removeFromParent(); });
      out.pools.push({ room: r.id, x0: rc.x0, z0: rc.z0, x1: rc.x1, z1: rc.z1 });
      for (let z = r.z; z < r.z + r.h; z += 2) for (let x = r.x; x < r.x + r.w; x += 2) {
        const [cx, cz] = cellC(x, z);
        if (nearDoor(cx, cz, 3.0) || cx > rc.x1 - 1.4 || cz > rc.z1 - 1.4) continue;
        box('tex:pool_tiles', cx, Y + h / 2, cz, 0.95, h, 0.95, 0xdfeaea);
      }
      const n = Math.max(2, Math.round(r.w * r.h / 6));
      for (let k = 0; k < n; k++) em(rc.x0 + (k + 0.5) * (rc.x1 - rc.x0) / n, Y + h - 0.5, (rc.z0 + rc.z1) / 2 + rng.float(-1.5, 1.5), 0x9fe8ff, 0.85, 11, k % 3 === 0 ? 0.2 : 0);
      for (let k = 0; k < 3; k++) ctx.scrapSpots.push({ x: rng.float(pool.x0 + 1, pool.x1 - 1), y: Y, z: rng.float(pool.z0 + 1, pool.z1 - 1), room: r.id, type: 'lim_pool', dist: L.distOf[L.idx(r.cx, r.cz)] || 0 });
    }
  }

  // ---- dead-end nooks: a crate in the corner + a loot spot; the prize itself is spawned by game/stealth.js (host)
  const hatchAt = new Map((V.hatches || []).map((h) => [h.x + ',' + h.z, h]));
  for (const e of V.deadEnds || []) {
    const [cx, cz] = cellC(e.x, e.z);
    const hatch = hatchAt.get(e.x + ',' + e.z);
    const dist = L.distOf[L.idx(e.x, e.z)] || e.dist;
    out.rewards.push({ x: cx, y: Y, z: cz, room: e.room, dist, hatch: !!hatch });
    ctx.scrapSpots.push({ x: cx + rng.float(-0.6, 0.6), y: Y, z: cz + rng.float(-0.6, 0.6), room: e.room, type: 'nook', dist, bonus: true });
    if (!hatch && rng.chance(0.6)) ctx.placeProp(rng.chance(0.5) ? 'cardboard_boxes' : 'crate_wood', cx + rng.pick([-1.2, 1.2]), Y, cz + rng.pick([-1.2, 1.2]), rng.float(0, 6.28), { visualOnly: true });
  }

  // ---- hatches (one-way drops): a striped, slightly darker floor plate in the middle of the nook
  for (const hz of V.hatches || []) {
    const [cx, cz] = cellC(hz.x, hz.z), [tx, tz] = cellC(hz.to.x, hz.to.z);
    const s = 1.7;
    gb.box('plain', cx, Y + 0.012, cz, s, 0.025, s, 0.5, col3(0x2c2a24));
    for (const [ox, oz, sx, sz] of [[0, -s / 2, s, 0.12], [0, s / 2, s, 0.12], [-s / 2, 0, 0.12, s], [s / 2, 0, 0.12, s]]) gb.box('plain', cx + ox, Y + 0.02, cz + oz, sx, 0.03, sz, 0.5, col3(0xd8b42a));
    gb.box('plain', cx, Y + 0.03, cz, s * 0.55, 0.012, s * 0.55, 0.5, col3(0x4a463c));
    out.hatches.push({ x: cx, y: Y, z: cz, r: s / 2 + 0.15, to: { x: tx, y: Y, z: tz }, room: hz.room, dist: hz.dist });
  }

  // ---- locked shortcut: the latch panel sits on the deep side of the door
  if (V.shortcut) {
    const inf = L.edgeInfo.get(V.shortcut.key);
    if (inf) {
      const e = decodeEdge(L, V.shortcut.key);
      const dz = e.dir === 0 ? [K.wx(e.x + 1), K.wz(e.z) + C / 2] : [K.wx(e.x) + C / 2, K.wz(e.z + 1)];
      // cell a is (x, z), cell b is one step towards +x / +z; the latch side gets the panel, 1.15 m beside the door
      const sideSign = V.shortcut.latch === 'b' ? 1 : -1;
      const px = dz[0] + (e.dir === 0 ? sideSign * 0.08 : 1.15), pz = dz[1] + (e.dir === 1 ? sideSign * 0.08 : 1.15);
      const panel = ctx.placeProp('keypad', px, Y + 1.25, pz, e.dir === 0 ? (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2) : (sideSign > 0 ? 0 : Math.PI), { visualOnly: true });
      out.shortcut = { key: V.shortcut.key, x: dz[0], z: dz[1], latch: V.shortcut.latch, dir: e.dir, panel: !!panel, latchPos: { x: px, y: Y + 1.4, z: pz } };
    }
  }

  const built = gb.build((key) => (key === 'plain' ? ctx.levelMaterial(null, { vertexColors: true }) : ctx.levelMaterial(key.slice(4), { vertexColors: true })));
  built.name = 'variety';
  ctx.group.add(built);
  out.mesh = built;
  out.dispose = () => { for (const f of out.disposers) { try { f(); } catch { /* ignore */ } } built.removeFromParent(); };
  return out;
}

export { WALL_ROT };
