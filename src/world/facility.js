// Procedural facility interior (Lethal-Company-like): grid rooms + corridors, doors, vaults,
// fire exits, props, lights, scrap spots, vents, hazards. Deterministic from seed.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { GeoBuilder, levelMaterial, mergeStaticMeshes, compactSubtree } from './geobuilder.js';
import { NavGrid } from './nav.js';
import { createAnyProp as createProp } from './propfactory.js';
import { applyExtThemeProps } from './extmodels.js';
import { G } from '../physics/physics.js';
import { MINESHAFT_THEME, MINESHAFT_ROOM_TYPES, mineshaftRoomHeight, decorateMineshaft } from './mineshaft.js';
import { buildSetPieces, planDarkCorridors } from './setpieces.js';
import { INTERIORS, INTERIOR_THEMES, INTERIOR_NAMES, getInterior, isInteriorTheme } from './interiors/index.js';
import { tintLampLights } from './interiors/common.js';
import { buildHazards } from './interiors/hazards.js';
import { buildFacilitySystems, planChestSpots } from './interiors/facsys.js';

// Interior theme registry (ids: factory, mansion, mineshaft, office, backrooms, serverfarm, sewer, hospital).
export { INTERIORS, INTERIOR_THEMES, INTERIOR_NAMES, getInterior, isInteriorTheme };

export const CELL = 4;
export const FACILITY_Y = -300;
const CORRIDOR_H = 3.3;

// ---------- layout (pure data) ----------
// Per-theme layout rules. Legacy themes keep their original numbers (factory / mansion / mineshaft);
// new themes come from src/world/interiors (office, backrooms, serverfarm, sewer, hospital).
const FACTORY_TYPES = [['storage', 5, true], ['office', 4], ['boiler', 2], ['server', 2], ['lockers', 2], ['bathroom', 2], ['breakroom', 2], ['lab', 2], ['security', 2], ['maintenance', 2], ['nest', 1]];
const MANSION_TYPES = [['hall', 4, true], ['library', 3], ['bedroom', 4], ['dining', 2, true], ['kitchen', 2], ['bathroom', 2], ['study', 3], ['gallery', 2, true], ['conservatory', 2], ['chapel', 1], ['nest', 1]];
function layoutRules(theme) {
  const def = getInterior(theme);
  const base = { plan: 'rooms', doorP: 0.45, blastP: 0.14, loops: 0.45, bigChance: 0.25, corridorH: CORRIDOR_H, hub: null, hubAlways: false, lockedP: 0.12, roomMul: 1, shape: null };
  if (theme === 'mansion') Object.assign(base, { doorP: 0.84, blastP: 0 });
  if (theme === 'mineshaft') Object.assign(base, { doorP: 0.22 });
  Object.assign(base, def.layout || {});
  base.types = theme === 'mansion' ? MANSION_TYPES : theme === 'mineshaft' ? MINESHAFT_ROOM_TYPES : def.roomTypes || FACTORY_TYPES;
  base.roomHeight = def.roomHeight || null;
  return base;
}

export const MAX_FACILITY_SIZE = 2.6;
export function generateLayout(seed, theme = 'factory', size = 1) {
  if (!isInteriorTheme(theme)) theme = 'factory';
  size = Math.min(MAX_FACILITY_SIZE, Math.max(0.5, Number(size) || 1));
  const R = layoutRules(theme);
  const legacy = theme === 'factory' || theme === 'mansion' || theme === 'mineshaft';
  const rng = new RNG((seed ^ 0x51f0a3) >>> 0);
  const W = Math.round(24 + size * 14);
  const H = W;
  const cells = new Uint8Array(W * H);          // 0 empty, 1 room, 2 corridor
  const roomOf = new Int16Array(W * H).fill(-1);
  const heightOf = new Float32Array(W * H);
  const zoneMask = new Uint8Array(W * H);       // 'open' plan: cells of the big open areas
  const open = new Set();
  const edgeKey = (x, z, dir) => {
    if (dir === 2) { x -= 1; dir = 0; } else if (dir === 3) { z -= 1; dir = 1; }
    return ((z * W + x) << 1) | dir;
  };
  const idx = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const rooms = [];
  const nodes = [];                             // MST waypoints: rooms + open zones + wing spines

  const canPlace = (x, z, w, h) => {
    if (x < 1 || z < 1 || x + w > W - 1 || z + h > H - 1) return false;
    for (let zz = z - 1; zz <= z + h; zz++) for (let xx = x - 1; xx <= x + w; xx++) if (cells[idx(xx, zz)]) return false;
    return true;
  };
  const addRoom = (x, z, w, h, type) => {
    const id = rooms.length;
    const r = { id, x, z, w, h, type, cx: x + Math.floor(w / 2), cz: z + Math.floor(h / 2) };
    rooms.push(r);
    nodes.push({ cx: r.cx, cz: r.cz, room: r });
    for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) {
      cells[idx(xx, zz)] = 1; roomOf[idx(xx, zz)] = id;
      if (xx < x + w - 1) open.add(edgeKey(xx, zz, 0));
      if (zz < z + h - 1) open.add(edgeKey(xx, zz, 1));
    }
    return r;
  };
  const carve = (ax, az, bx, bz) => {
    let x = ax, z = az;
    const horizFirst = rng.chance(0.5);
    const stepTo = (nx, nz) => {
      const dir = nx > x ? 0 : nx < x ? 2 : nz > z ? 1 : 3;
      if (!cells[idx(nx, nz)]) cells[idx(nx, nz)] = 2;
      open.add(edgeKey(x, z, dir));
      x = nx; z = nz;
    };
    const goX = () => { while (x !== bx) stepTo(x + Math.sign(bx - x), z); };
    const goZ = () => { while (z !== bz) stepTo(x, z + Math.sign(bz - z)); };
    if (horizFirst) { goX(); goZ(); } else { goZ(); goX(); }
  };
  // straight corridor from (ax, az) to (bx, bz), x first (spines, stubs)
  const line = (ax, az, bx, bz) => {
    let x = ax, z = az;
    while (x !== bx || z !== bz) {
      const nx = x !== bx ? x + Math.sign(bx - x) : x, nz = x !== bx ? z : z + Math.sign(bz - z);
      const dir = nx > x ? 0 : nx < x ? 2 : nz > z ? 1 : 3;
      if (!cells[idx(nx, nz)]) cells[idx(nx, nz)] = 2;
      open.add(edgeKey(x, z, dir));
      x = nx; z = nz;
    }
  };

  // entrance room at the south edge
  const ent = addRoom(Math.floor(W / 2) - 1, H - 5, 3, 3, 'entrance');

  // landmark hub: a big, tall, readable room near the middle (always for themes that ask, else big maps)
  if (R.hub && (R.hubAlways || size >= 1.6)) {
    const { w, h } = R.hub;
    for (let a = 0; a < 60; a++) {
      const x = Math.round(W / 2 - w / 2 + rng.int(-Math.floor(W / 5), Math.floor(W / 5)));
      const z = Math.round(H * 0.42 - h / 2 + rng.int(-Math.floor(H / 6), Math.floor(H / 6)));
      if (canPlace(x, z, w, h)) { addRoom(x, z, w, h, R.hub.type).hub = true; break; }
    }
  }

  // wing plan (office, hospital): one or two long spine corridors first, rooms hang off them
  const spines = [];
  if (R.plan === 'wings') {
    const zc = Math.round(H * 0.4 + rng.int(-2, 2));
    const x0 = 2 + rng.int(0, 2), x1 = W - 3 - rng.int(0, 2);
    let ok = true;
    for (let x = x0; x <= x1; x++) if (cells[idx(x, zc)] === 1) { ok = false; break; }
    if (ok) { line(x0, zc, x1, zc); spines.push({ axis: 'x', c: zc, a: x0, b: x1 }); nodes.push({ cx: Math.round((x0 + x1) / 2), cz: zc }); }
    if (size >= 1.2) {
      for (let tries = 0; tries < 6; tries++) {
        const xc = Math.round(W * (rng.chance(0.5) ? 0.3 : 0.7) + rng.int(-2, 2));
        const z0 = 2 + rng.int(0, 2), z1 = H - 7;
        let clear = true;
        for (let z = z0; z <= z1; z++) if (cells[idx(xc, z)] === 1) { clear = false; break; }
        if (!clear) continue;
        line(xc, z0, xc, z1); spines.push({ axis: 'z', c: xc, a: z0, b: z1 }); nodes.push({ cx: xc, cz: Math.round((z0 + z1) / 2) });
        break;
      }
    }
  }

  const target = Math.round((9 + size * 9) * (R.roomMul || 1));
  for (let a = 0; a < 900 + size * 400 && rooms.length < target; a++) {
    const big = rng.chance(R.bigChance);
    let w, h;
    if (R.shape) [w, h] = R.shape(rng, big);
    else { w = big ? rng.int(4, 6) : rng.int(2, 4); h = big ? rng.int(3, 5) : rng.int(2, 4); }
    const x = rng.int(1, W - w - 1), z = rng.int(1, H - h - 6);
    if (canPlace(x, z, w, h)) addRoom(x, z, w, h, big ? 'big' : 'small');
  }

  // open plan (backrooms): overlapping open zones with every inner wall knocked out
  if (R.plan === 'open') {
    const nZones = Math.round(4 + size * 5);
    for (let a = 0, made = 0; a < 400 && made < nZones; a++) {
      const w = rng.int(4, 7 + Math.round(size * 2)), h = rng.int(4, 7 + Math.round(size));
      const x = rng.int(1, W - w - 1), z = rng.int(1, H - h - 6);
      let free = true;
      for (let zz = z - 1; zz <= z + h && free; zz++) for (let xx = x - 1; xx <= x + w; xx++) if (inb(xx, zz) && cells[idx(xx, zz)] === 1) { free = false; break; }
      if (!free) continue;
      for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) {
        const i = idx(xx, zz);
        if (!cells[i]) cells[i] = 2;
        zoneMask[i] = 1;
      }
      nodes.push({ cx: x + (w >> 1), cz: z + (h >> 1) });
      made++;
    }
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!zoneMask[idx(x, z)]) continue;
      if (x + 1 < W && zoneMask[idx(x + 1, z)]) open.add(edgeKey(x, z, 0));
      if (z + 1 < H && zoneMask[idx(x, z + 1)]) open.add(edgeKey(x, z, 1));
    }
  }

  if (R.plan === 'wings') {
    // comb: every room within reach of a spine gets a straight stub to it
    for (const r of rooms) {
      if (r.type === 'entrance') continue;
      let best = null;
      for (const sp of spines) {
        const along = sp.axis === 'x' ? r.cx : r.cz, across = sp.axis === 'x' ? r.cz : r.cx;
        if (along < sp.a || along > sp.b) continue;
        const d = Math.abs(across - sp.c);
        if (d <= 9 && (!best || d < best.d)) best = { sp, d };
      }
      if (!best) continue;
      if (best.sp.axis === 'x') line(r.cx, r.cz, r.cx, best.sp.c); else line(r.cx, r.cz, best.sp.c, r.cz);
    }
    // entrance straight up to the main spine
    if (spines.length && spines[0].axis === 'x') line(ent.cx, ent.cz, ent.cx, spines[0].c);
  }

  // MST (Prim) over the waypoints (not for wings: the comb + repair connect those) + extra loops
  const edges = [];
  if (R.plan !== 'wings') {
    const inTree = new Set([0]);
    while (inTree.size < nodes.length) {
      let best = null;
      for (const a of inTree) for (let b = 0; b < nodes.length; b++) {
        if (inTree.has(b)) continue;
        const d = Math.abs(nodes[a].cx - nodes[b].cx) + Math.abs(nodes[a].cz - nodes[b].cz);
        if (!best || d < best.d) best = { a, b, d };
      }
      inTree.add(best.b);
      edges.push([best.a, best.b]);
    }
  }
  // More loops make the facility read as a place rather than a single corridor puzzle.
  const extra = Math.round(nodes.length * R.loops);
  for (let i = 0; i < extra; i++) {
    const a = rng.int(0, nodes.length - 1), b = rng.int(0, nodes.length - 1);
    if (a === b) continue;
    if (Math.abs(nodes[a].cx - nodes[b].cx) + Math.abs(nodes[a].cz - nodes[b].cz) > W * 0.6) continue;
    edges.push([a, b]);
  }
  for (const [a, b] of edges) carve(nodes[a].cx, nodes[a].cz, nodes[b].cx, nodes[b].cz);

  // dead-end closets off corridors
  for (let i = 0; i < 6 + size * 4; i++) {
    const x = rng.int(2, W - 3), z = rng.int(2, H - 6);
    if (cells[idx(x, z)] !== 2) continue;
    const d = rng.int(0, 3);
    const dx = [1, 0, -1, 0][d], dz = [0, 1, 0, -1][d];
    let cx = x, cz = z, len = rng.int(2, 4), ok = true;
    const path = [];
    for (let k = 0; k < len; k++) {
      cx += dx; cz += dz;
      if (!inb(cx, cz) || cx < 1 || cz < 1 || cx > W - 2 || cz > H - 2 || cells[idx(cx, cz)]) { ok = false; break; }
      path.push([cx, cz]);
    }
    if (!ok || !path.length) continue;
    let px = x, pz = z;
    for (const [qx, qz] of path) {
      cells[idx(qx, qz)] = 2;
      const dir = qx > px ? 0 : qx < px ? 2 : qz > pz ? 1 : 3;
      open.add(edgeKey(px, pz, dir));
      px = qx; pz = qz;
    }
  }

  // reachability from the entrance over open edges
  const reachQ = new Int32Array(W * H);
  const reach = () => {
    const seen = new Uint8Array(W * H);
    let qh = 0, qt = 0;
    reachQ[qt++] = idx(ent.cx, ent.cz); seen[reachQ[0]] = 1;
    while (qh < qt) {
      const i = reachQ[qh++], x = i % W, z = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
        if (!inb(nx, nz)) continue;
        const j = idx(nx, nz);
        if (!cells[j] || seen[j] || !open.has(edgeKey(x, z, d))) continue;
        seen[j] = 1; reachQ[qt++] = j;
      }
    }
    return { seen, count: qt };
  };
  // repair: every island (spine end, zone, stray room) gets a corridor to the nearest reached cell
  for (let guard = 0; guard < 60; guard++) {
    const { seen } = reach();
    let lost = -1;
    for (let i = 0; i < W * H; i++) if (cells[i] && !seen[i]) { lost = i; break; }
    if (lost < 0) break;
    const lx = lost % W, lz = (lost / W) | 0;
    let best = null;
    for (let i = 0; i < W * H; i++) {
      if (!seen[i]) continue;
      const d = Math.abs((i % W) - lx) + Math.abs(((i / W) | 0) - lz);
      if (!best || d < best.d) best = { i, d };
    }
    if (!best) break;
    carve(lx, lz, best.i % W, (best.i / W) | 0);
  }

  // open plan: put wall runs back inside the open zones (liminal maze), never disconnecting anything
  if (R.plan === 'open') {
    let total = reach().count;
    let zoneCells = 0;
    for (let i = 0; i < W * H; i++) zoneCells += zoneMask[i];
    const tries = Math.round(zoneCells * 0.7);
    for (let t = 0; t < tries; t++) {
      const x = rng.int(1, W - 2), z = rng.int(1, H - 2);
      const dir = rng.int(0, 1), len = rng.int(1, 3);
      if (!zoneMask[idx(x, z)]) continue;
      const removed = [];
      for (let k = 0; k < len; k++) {
        // a straight wall: dir 0 (+x edges) stacked along z, dir 1 (+z edges) along x
        const ex = dir === 0 ? x : x + k, ez = dir === 0 ? z + k : z;
        const nx = ex + (dir === 0 ? 1 : 0), nz = ez + (dir === 1 ? 1 : 0);
        if (!inb(nx, nz) || !zoneMask[idx(ex, ez)] || !zoneMask[idx(nx, nz)]) break;
        const key = edgeKey(ex, ez, dir);
        if (!open.has(key)) break;
        open.delete(key); removed.push(key);
      }
      if (!removed.length) continue;
      const c = reach().count;
      if (c < total) for (const key of removed) open.add(key);
      else total = c;
    }
  }

  // BFS distance from entrance (cells)
  const distOf = new Int32Array(W * H).fill(-1);
  {
    let qh = 0, qt = 0;
    const q = reachQ;
    q[qt++] = idx(ent.cx, ent.cz); distOf[q[0]] = 0;
    while (qh < qt) {
      const i = q[qh++], x = i % W, z = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
        if (!inb(nx, nz) || !cells[idx(nx, nz)] || distOf[idx(nx, nz)] >= 0) continue;
        if (!open.has(edgeKey(x, z, d))) continue;
        distOf[idx(nx, nz)] = distOf[i] + 1;
        q[qt++] = idx(nx, nz);
      }
    }
  }

  // vault + generator attachments (2x2 rooms with single connection)
  const attach = (type, w, h) => {
    const cand = [];
    for (let z = 1; z < H - h - 1; z++) for (let x = 1; x < W - w - 1; x++) {
      let free = true;
      for (let zz = z; zz < z + h && free; zz++) for (let xx = x; xx < x + w; xx++) if (cells[idx(xx, zz)]) { free = false; break; }
      if (!free) continue;
      // find an adjacent floor cell (not entrance) on the perimeter
      const perim = [];
      for (let xx = x; xx < x + w; xx++) { perim.push([xx, z - 1, xx, z, 1]); perim.push([xx, z + h, xx, z + h - 1, 3]); }
      for (let zz = z; zz < z + h; zz++) { perim.push([x - 1, zz, x, zz, 0]); perim.push([x + w, zz, x + w - 1, zz, 2]); }
      for (const [ox, oz, ix, iz, dir] of perim) {
        if (!inb(ox, oz)) continue;
        const c = cells[idx(ox, oz)];
        if (!c) continue;
        { const ro = roomOf[idx(ox, oz)]; if (ro >= 0 && ['entrance', 'vault', 'generator', 'core'].includes(rooms[ro].type)) continue; }
        if (distOf[idx(ox, oz)] < 4) continue;
        cand.push({ x, z, ox, oz, ix, iz, dir, dist: distOf[idx(ox, oz)] });
      }
    }
    if (!cand.length) return null;
    cand.sort((a, b) => b.dist - a.dist);
    const c = cand[Math.floor(rng.next() * Math.min(cand.length, 12))];
    const r = addRoom(c.x, c.z, w, h, type);
    open.add(edgeKey(c.ox, c.oz, c.dir));
    r.door = { x: c.ox, z: c.oz, dir: c.dir };
    distOf[idx(c.ix, c.iz)] = c.dist + 1;
    for (let zz = c.z; zz < c.z + h; zz++) for (let xx = c.x; xx < c.x + w; xx++) if (distOf[idx(xx, zz)] < 0) distOf[idx(xx, zz)] = c.dist + 2;
    return r;
  };
  const vaultCount = size >= 2.2 ? 3 : size >= 1.3 ? 2 : 1;
  for (let i = 0; i < vaultCount; i++) attach('vault', 2, 2);
  const genRoom = attach('generator', 2, 2) || rng.pick(rooms.filter((r) => r.type === 'small'));
  if (genRoom && genRoom.type !== 'generator') genRoom.type = 'generator';
  // containment chamber (facility systems: the CORE sits here behind a powered containment door)
  const coreRoom = attach('core', 3, 3) || attach('core', 2, 2);

  // assign room types
  const types = R.types;
  for (const r of rooms) {
    if (r.type !== 'big' && r.type !== 'small') continue;
    const pool = types.filter((t) => (r.type === 'big') === !!t[2] || (!t[2] && r.w * r.h <= 9) || (t[2] && r.w * r.h >= 12));
    const pickFrom = pool.length ? pool : types;
    r.type = rng.weighted(pickFrom.map((t) => ({ t: t[0], w: t[1] }))).t;
  }
  // heights
  for (const r of rooms) {
    let h;
    if (legacy) {
      h = theme === 'mansion' ? 4.2 : 4.4;
      if (['storage', 'hall', 'boiler', 'gallery'].includes(r.type)) h = theme === 'mansion' ? 5.6 : rng.float(6.5, 8.5);
      if (theme === 'mineshaft') h = mineshaftRoomHeight(r.type, rng);
    } else h = R.roomHeight ? R.roomHeight(r.type, rng) : 4.4;
    if (r.type === 'vault' || r.type === 'generator') h = 4;
    if (r.type === 'core') h = 5.2;
    r.height = Math.round(h * 10) / 10;
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) heightOf[idx(xx, zz)] = r.height;
  }
  const corridorH = R.corridorH || CORRIDOR_H;
  for (let i = 0; i < W * H; i++) if (cells[i] === 2) heightOf[i] = corridorH;

  // ---- room links (open boundary edges) + sealed treasure rooms ----
  // A treasure room is a dead end (exactly one way in) deep in the facility; its only door is locked on purpose.
  // Keys spawn in reachable rooms (facility systems) and the lockpicker opens it too.
  for (const r of rooms) {
    r.linkKeys = [];
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) for (let d = 0; d < 4; d++) {
      const nx = xx + [1, 0, -1, 0][d], nz = zz + [0, 1, 0, -1][d];
      if (nx >= r.x && nx < r.x + r.w && nz >= r.z && nz < r.z + r.h) continue;
      const k = edgeKey(xx, zz, d);
      if (inb(nx, nz) && cells[idx(nx, nz)] && open.has(k)) r.linkKeys.push(k);
    }
    r.links = r.linkKeys.length;
  }
  const treasureEdges = new Set();
  {
    const cand = rooms.filter((r) => r.links === 1 && !r.hub && !['entrance', 'vault', 'generator', 'core'].includes(r.type) && r.w * r.h <= 16 && distOf[idx(r.cx, r.cz)] >= 5);
    rng.shuffle(cand);
    const nTreasure = size >= 1.6 ? 2 : 1;
    for (const r of cand.slice(0, nTreasure)) { r.treasure = true; treasureEdges.add(r.linkKeys[0]); }
  }

  // ---- edges: doors/arches ----
  const edgeInfo = new Map();
  const doors = [];
  let blastCount = 0;
  const codeFor = (n) => String.fromCharCode(65 + (n % 26)) + (1 + Math.floor(n / 26) + (n % 9));
  for (const key of open) {
    const dir = key & 1;
    const ci = key >> 1;
    const x = ci % W, z = Math.floor(ci / W);
    const nx = x + (dir === 0 ? 1 : 0), nz = z + (dir === 1 ? 1 : 0);
    if (!inb(nx, nz)) continue;
    const a = idx(x, z), b = idx(nx, nz);
    const ra = roomOf[a], rb = roomOf[b];
    if (ra === rb && ra >= 0) continue;           // inside same room
    if (cells[a] === 2 && cells[b] === 2) continue; // corridor-corridor
    const roomA = ra >= 0 ? rooms[ra] : null, roomB = rb >= 0 ? rooms[rb] : null;
    const special = [roomA, roomB].find((r) => r && (r.type === 'vault' || r.type === 'core'));
    let info;
    if (special?.type === 'core') {
      info = { type: 'contain', width: 3.0, doorH: Math.round(Math.min(3.1, Math.min(heightOf[a], heightOf[b]) - 0.15) * 100) / 100 };
    } else if (special) {
      info = { type: 'vault', width: 2.6, doorH: 2.8 };
    } else if (treasureEdges.has(key)) {
      info = { type: 'door', width: 1.35, doorH: 2.35, locked: true, treasure: true };
    } else {
      const roll = rng.next();
      if (roll < R.blastP && Math.min(heightOf[a], heightOf[b]) >= 3.3) info = { type: 'blast', width: 3.3, doorH: 3.2, code: codeFor(blastCount++) };
      else if (roll < R.doorP + R.blastP) info = { type: 'door', width: 1.35, doorH: 2.35, locked: rng.chance(R.lockedP) };
      else info = { type: 'arch', width: 2.6, doorH: Math.min(2.9, Math.min(heightOf[a], heightOf[b]) - 0.2) };
    }
    // door faces +x (dir 0) or +z (dir 1)
    const ex = dir === 0 ? (x + 1) : x + 0.5, ez = dir === 1 ? (z + 1) : z + 0.5;
    info.key = key; info.dir = dir; info.cx = ex; info.cz = ez; info.a = a; info.b = b;
    edgeInfo.set(key, info);
    if (info.type !== 'arch') doors.push(info);
  }
  // entrance door (south wall of entrance room, middle cell)
  const entKey = edgeKey(ent.cx, ent.z + ent.h - 1, 1);
  edgeInfo.set(entKey, { type: 'entrance', width: 3.3, doorH: 3.2, key: entKey, dir: 1, cx: ent.cx + 0.5, cz: ent.z + ent.h, a: idx(ent.cx, ent.z + ent.h - 1), b: -1 });

  // fire exits: far rooms, closed wall facing outward
  const fireExits = [];
  const farRooms = rooms.filter((r) => !['entrance', 'vault', 'generator', 'core'].includes(r.type) && !r.treasure)
    .map((r) => ({ r, d: distOf[idx(r.cx, r.cz)] })).sort((a, b) => b.d - a.d);
  const nFire = size >= 2 ? 3 : size >= 1.2 ? 2 : 1;
  const wallOut = (xx, zz) => {
    const out = [];
    for (let d = 0; d < 4; d++) {
      const nx2 = xx + [1, 0, -1, 0][d], nz2 = zz + [0, 1, 0, -1][d];
      if (inb(nx2, nz2) && cells[idx(nx2, nz2)]) continue;
      const k = edgeKey(xx, zz, d);
      if (edgeInfo.has(k)) continue;
      out.push({ x: xx, z: zz, d, k });
    }
    return out;
  };
  const addFireExit = (c, room) => {
    const ex = c.d === 0 ? c.x + 1 : c.d === 2 ? c.x : c.x + 0.5;
    const ez = c.d === 1 ? c.z + 1 : c.d === 3 ? c.z : c.z + 0.5;
    const info = { type: 'fireexit', width: 1.35, doorH: 2.35, key: c.k, dir: c.d & 1, cx: ex, cz: ez, a: idx(c.x, c.z), b: -1, inward: c.d };
    edgeInfo.set(c.k, info);
    fireExits.push({ room, cellX: c.x, cellZ: c.z, d: c.d, info });
  };
  for (const { r } of farRooms) {
    if (fireExits.length >= nFire) break;
    if (fireExits.some((f) => Math.abs(f.room.cx - r.cx) + Math.abs(f.room.cz - r.cz) < W / 3)) continue;
    // candidate wall edges of r whose neighbor is empty
    const cand = [];
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) cand.push(...wallOut(xx, zz));
    if (!cand.length) continue;
    addFireExit(rng.pick(cand), r);
  }
  // every facility has a second way in/out: when no far room had an outside wall, use the deepest corridor
  if (!fireExits.length) {
    const cc = [];
    for (let i = 0; i < W * H; i++) if (cells[i] === 2 && distOf[i] >= 3) cc.push(i);
    cc.sort((p, q) => distOf[q] - distOf[p] || p - q);
    for (const i of cc) {
      const w = wallOut(i % W, (i / W) | 0);
      if (!w.length) continue;
      addFireExit(w[0], { cx: i % W, cz: (i / W) | 0, corridor: true });
      break;
    }
  }

  // ---- the locked-door rule (owner bug: "a locked door on the only way, I get stuck") ----
  // With every locked door treated as a wall, every floor cell outside the intentionally sealed rooms (vaults, the
  // containment chamber, treasure rooms) must be reachable from the main entrance or a fire exit that has an outdoor
  // twin. Locked doors on the frontier of the reachable region are unlocked (lowest edge key first) until it holds.
  const outdoorFires = size >= 1.2 ? 2 : 1;   // terrain.js planMoon places this many outdoor fire exits
  const sealedRoomId = (ri) => ri >= 0 && (rooms[ri].type === 'vault' || rooms[ri].type === 'core' || !!rooms[ri].treasure);
  const blocks = (inf) => !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked));
  const sources = [idx(ent.cx, ent.cz), ...fireExits.slice(0, outdoorFires).map((f) => idx(f.cellX, f.cellZ))];
  const reachLocked = () => {
    const seen = new Uint8Array(W * H);
    let qh = 0, qt = 0;
    for (const s of sources) if (!seen[s]) { seen[s] = 1; reachQ[qt++] = s; }
    while (qh < qt) {
      const i = reachQ[qh++], x = i % W, z = (i / W) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
        if (!inb(nx, nz)) continue;
        const j = idx(nx, nz), k = edgeKey(x, z, d);
        if (!cells[j] || seen[j] || !open.has(k) || blocks(edgeInfo.get(k))) continue;
        seen[j] = 1; reachQ[qt++] = j;
      }
    }
    return seen;
  };
  let unlockedByRule = 0;
  for (let guard = 0; guard < 400; guard++) {
    const seen = reachLocked();
    let missing = false;
    for (let i = 0; i < W * H && !missing; i++) if (cells[i] && !seen[i] && !sealedRoomId(roomOf[i])) missing = true;
    if (!missing) break;
    let best = null;
    for (const inf of doors) {
      if (inf.type !== 'door' || !inf.locked || inf.treasure || seen[inf.a] === seen[inf.b]) continue;
      if (!best || inf.key < best.key) best = inf;
    }
    if (!best) break;
    best.locked = false; best.unlockedByRule = true; unlockedByRule++;
  }

  return {
    seed, theme, size, w: W, h: H, cell: CELL, cells, roomOf, heightOf, open, rooms, edgeInfo, doors, fireExits,
    entrance: { room: ent, key: entKey }, distOf, edgeKey, idx, corridorH, plan: R.plan, zoneMask, spines,
    ox: -W * CELL / 2, oz: -H * CELL / 2, y: FACILITY_Y,
    core: coreRoom || null, generator: genRoom || null, outdoorFires, entrySources: sources, unlockedByRule,
  };
}

// ---------- themes ----------
export const THEMES = {
  factory: {
    corridor: { floor: 'concrete', wall: 'concrete_stained', ceil: 'ceiling_tiles', base: 'metal_dark' },
    rooms: {
      entrance: { floor: 'tiles_dirty', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['water_cooler', 'bench', 'vending_machine'], clutter: ['cardboard_boxes', 'wet_floor_sign', 'traffic_cone'] },
      storage: { floor: 'concrete_stained', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'ceiling_lamp', rows: 'shelf_metal', wall_: ['shelf_metal', 'crate_metal', 'pallet'], clutter: ['crate_wood', 'crate_metal', 'barrel', 'pallet', 'cardboard_boxes'] },
      office: { floor: 'tiles_dirty', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['desk'], wall_: ['filing_cabinet', 'water_cooler', 'filing_cabinet', 'bookcase'], clutter: ['office_chair', 'cardboard_boxes'] },
      boiler: { floor: 'metal_plate', wall: 'metal_rust', ceil: 'metal_dark', lamp: 'wall_lamp', center: ['boiler'], wall_: ['pipe_vertical', 'barrel_toxic', 'generator'], clutter: ['barrel', 'barrel_toxic', 'hanging_chains'], pipes: true },
      generator: { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', center: [], wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      server: { floor: 'metal_plate', wall: 'metal', ceil: 'ceiling_tiles', lamp: 'fluorescent', rows: 'server_rack_prop', wall_: ['server_rack_prop'], clutter: ['cardboard_boxes'] },
      lockers: { floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['bench'], wall_: ['locker', 'locker', 'locker'], clutter: ['mop_bucket'] },
      bathroom: { floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['toilet', 'sink', 'toilet'], clutter: ['mop_bucket', 'wet_floor_sign'] },
      breakroom: { floor: 'tiles_checker', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['table'], wall_: ['vending_machine', 'water_cooler', 'coffee_machine'], clutter: ['office_chair'] },
      lab: { floor: 'tiles_white', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['hospital_bed', 'table'], wall_: ['filing_cabinet', 'sink'], clutter: ['cardboard_boxes'] },
      security: { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', center: ['desk'], wall_: ['server_rack_prop', 'server_rack_prop', 'fuse_box'], clutter: ['office_chair', 'cardboard_boxes'], posters: 1 },
      maintenance: { floor: 'concrete_stained', wall: 'metal_rust', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: ['generator', 'pipe_vertical', 'fuse_box', 'shelf_metal'], clutter: ['barrel', 'crate_metal', 'hanging_chains'], pipes: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'concrete_dark', wall: 'concrete_stained', ceil: 'metal_dark', lamp: null, wall_: [], clutter: ['hanging_chains', 'cobweb', 'barrel'], webs: true },
    },
  },
  mansion: {
    corridor: { floor: 'wood_floor', wall: 'wallpaper_red', ceil: 'wood_dark', base: 'wood_dark', carpet: 'carpet_red' },
    rooms: {
      entrance: { floor: 'wood_floor', wall: 'wallpaper_damask', ceil: 'wood_dark', lamp: 'chandelier', wall_: ['grandfather_clock', 'armchair'], clutter: ['table'] },
      hall: { floor: 'wood_floor', wall: 'wallpaper_damask', ceil: 'wood_dark', lamp: 'chandelier', center: ['table'], wall_: ['bookcase', 'armchair', 'grandfather_clock', 'fireplace'], clutter: ['armchair'] },
      library: { floor: 'carpet_red', wall: 'wood_dark', ceil: 'wood_dark', lamp: 'chandelier', center: ['table'], wall_: ['bookcase', 'bookcase', 'bookcase'], clutter: ['armchair'] },
      bedroom: { floor: 'wood_floor', wall: 'wallpaper_green', ceil: 'wood_dark', lamp: 'wall_lamp', center: ['hospital_bed'], wall_: ['bookcase', 'armchair', 'filing_cabinet'], clutter: ['cardboard_boxes'] },
      dining: { floor: 'wood_floor', wall: 'wallpaper_red', ceil: 'wood_dark', lamp: 'chandelier', center: ['table', 'table'], wall_: ['bookcase', 'grandfather_clock', 'fireplace'], clutter: ['armchair'] },
      kitchen: { floor: 'tiles_checker', wall: 'tiles_white', ceil: 'wood_dark', lamp: 'wall_lamp', center: ['table'], wall_: ['sink', 'water_cooler', 'coffee_machine'], clutter: ['barrel', 'crate_wood'] },
      bathroom: { floor: 'tiles_white', wall: 'tiles_white', ceil: 'wood_dark', lamp: 'wall_lamp', wall_: ['toilet', 'sink'], clutter: ['mop_bucket'] },
      study: { floor: 'carpet_red', wall: 'wallpaper_green', ceil: 'wood_dark', lamp: 'wall_lamp', center: ['desk'], wall_: ['bookcase', 'filing_cabinet', 'armchair'], clutter: ['office_chair'] },
      gallery: { floor: 'wood_floor', wall: 'wallpaper_damask', ceil: 'wood_dark', lamp: 'chandelier', center: [], wall_: ['armchair', 'grandfather_clock'], clutter: [], posters: 6 },
      conservatory: { floor: 'wood_floor', wall: 'wallpaper_green', ceil: 'wood_dark', lamp: 'chandelier', center: ['table'], wall_: ['bookcase', 'grandfather_clock'], clutter: ['armchair', 'table'] },
      chapel: { floor: 'wood_floor', wall: 'wallpaper_damask', ceil: 'wood_dark', lamp: 'chandelier', center: ['table'], wall_: ['painting', 'bookcase', 'grandfather_clock'], clutter: ['armchair', 'table'], posters: 1 },
      generator: { floor: 'concrete', wall: 'concrete_dark', ceil: 'concrete_dark', lamp: 'wall_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'wood_dark', wall: 'wallpaper_red', ceil: 'wood_dark', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains'], webs: true },
    },
  },
};

THEMES.mineshaft = MINESHAFT_THEME;
// new interior themes (src/world/interiors): office, backrooms, serverfarm, sewer, hospital
for (const [id, def] of Object.entries(INTERIORS)) if (def.style && !THEMES[id]) THEMES[id] = def.style;
// Extra decoration from the downloaded PSX model packs (always listed, so every peer rolls the same
// random sequence; a missing model falls back to a crate).
const EXT_ADD = {
  factory: {
    entrance: { clutter: ['ext:psx_trash_bag'] },
    storage: { clutter: ['ext:psx_cardboard_box', 'ext:ind_box_wood', 'ext:ks_box', 'ext:kst_container', 'ext:psx_barrel'], wall_: ['ext:psx_shelf', 'ext:ind_metal_cabinet_2'] },
    office: { wall_: ['ext:ind_metal_cabinet_1'], clutter: ['ext:psx_trash_bag'] },
    boiler: { wall_: ['ext:psx_pump', 'ext:psx_transformer', 'ext:psx_pipes'] },
    generator: { wall_: ['ext:psx_transformer'] },
    server: { wall_: ['ext:kst_computer_system'] },
    breakroom: { wall_: ['ext:psx_fridge'], clutter: ['ext:psx_trash_bag'] },
    lab: { wall_: ['ext:ks_workbench'], center: ['ext:kcv_robot_arm_a'] },
    nest: { clutter: ['ext:psx_mattress', 'ext:psx_trash_bag', 'ext:kk_parts_pile_large'] },
  },
  mansion: {
    hall: { wall_: ['ext:psx_couch'] },
    bedroom: { center: ['ext:kst_bed_single'] },
    kitchen: { wall_: ['ext:psx_fridge'] },
    nest: { clutter: ['ext:psx_mattress', 'ext:psx_trash_bag'] },
  },
};
for (const [theme, rooms] of Object.entries(EXT_ADD)) {
  for (const [room, add] of Object.entries(rooms)) {
    const st = THEMES[theme].rooms[room];
    if (!st) continue;
    for (const [k, list] of Object.entries(add)) st[k] = [...(st[k] || []), ...list];
  }
}

// round-2 asset kit (tfg_* custom Blender props, Kenney furniture, PSX boxes) for every theme incl. the new interiors
applyExtThemeProps(THEMES);
// containment chamber (facility systems): bare, cold, lit by the core itself (interiors/facsys.js dresses it)
for (const th of Object.values(THEMES)) {
  if (!th?.rooms || th.rooms.core) continue;
  th.rooms.core = { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: null, wall_: [], clutter: [], posters: 0 };
}

// Measure prop footprint (cached per id+variant)
const sizeCache = new Map();
function propSize(id, obj) {
  if (sizeCache.has(id)) return sizeCache.get(id);
  const b = new THREE.Box3().setFromObject(obj);
  const s = new THREE.Vector3(); b.getSize(s);
  const r = { x: s.x, y: s.y, z: s.z, minZ: b.min.z, maxZ: b.max.z };
  sizeCache.set(id, r);
  return r;
}

// ---------- build (geometry, colliders, props, lights, nav) ----------
export function buildFacility(layout, { physics, lightPool }) {
  const L = layout;
  const rng = new RNG((L.seed ^ 0x77b1) >>> 0);
  const theme = THEMES[L.theme] || THEMES.factory;
  const def = getInterior(L.theme);
  const legacy = !def.style;                       // factory / mansion / mineshaft keep their original dressing
  const corridorH = L.corridorH || CORRIDOR_H;
  const C = L.cell, Y = L.y, W = L.w, H = L.h;
  const gb = new GeoBuilder();
  const group = new THREE.Group();
  group.name = 'facility';
  const colliders = [];
  const propsList = [];
  const emitters = [];
  const interactables = [];
  const landmarkSpots = [];
  const scrapSpots = [];
  const bigSpots = [];
  const ventSpots = [];
  const turretSpots = [];
  const mineSpots = [];
  const doorsOut = [];
  const decals = [];
  const wallSpots = [];
  const ceilingSpots = [];

  const wx = (x) => L.ox + x * C, wz = (z) => L.oz + z * C;
  const roomStyle = (i) => {
    const r = L.roomOf[i];
    if (r < 0) return theme.corridor;
    return theme.rooms[L.rooms[r].type] || theme.rooms.office || Object.values(theme.rooms)[0] || theme.corridor;
  };
  const addBox = (cx, cy, cz, sx, sy, sz, member = G.STATIC, data) => {
    const c = physics.addStaticBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, 0, member, data);
    colliders.push(c);
    return c;
  };

  // floor + ceiling per cell
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i]) continue;
    const st = roomStyle(i);
    const h = L.heightOf[i];
    const shade = 0.85 + ((x * 7 + z * 13) % 5) * 0.035;
    gb.hrect('f:' + st.floor, wx(x), wz(z), wx(x + 1), wz(z + 1), Y, true, 0.5, [shade, shade, shade]);
    gb.hrect('c:' + st.ceil, wx(x), wz(z), wx(x + 1), wz(z + 1), Y + h, false, 0.5);
    addBox(wx(x) + C / 2, Y + h + 0.25, wz(z) + C / 2, C, 0.5, C);
    if (L.cells[i] === 2 && theme.corridor.carpet) {
      gb.hrect('f:' + theme.corridor.carpet, wx(x) + 0.9, wz(z) + 0.9, wx(x + 1) - 0.9, wz(z + 1) - 0.9, Y + 0.01, true, 0.5);
    }
  }
  // one big floor slab
  addBox(0, Y - 0.5, 0, W * C + 8, 1, H * C + 8);

  // walls
  const wallSeg = (x, z, d, s0, s1, y0, y1, tex) => {
    const X0 = wx(x), X1 = wx(x + 1), Z0 = wz(z), Z1 = wz(z + 1);
    let a, b;
    if (d === 0) { a = [X1, Z0 + s0]; b = [X1, Z0 + s1]; }
    else if (d === 2) { a = [X0, Z1 - s0]; b = [X0, Z1 - s1]; }
    else if (d === 1) { a = [X1 - s0, Z1]; b = [X1 - s1, Z1]; }
    else { a = [X0 + s0, Z0]; b = [X0 + s1, Z0]; }
    gb.vrect('w:' + tex, a[0], a[1], b[0], b[1], Y + y0, Y + y1, 0.5, undefined, (d === 0 || d === 2 ? Z0 : X0) + s0);
  };
  const edgeCenter = (x, z, d) => {
    if (d === 0) return [wx(x + 1), wz(z) + C / 2];
    if (d === 2) return [wx(x), wz(z) + C / 2];
    if (d === 1) return [wx(x) + C / 2, wz(z + 1)];
    return [wx(x) + C / 2, wz(z)];
  };
  const doneEdges = new Set();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i]) continue;
    const st = roomStyle(i);
    const h = L.heightOf[i];
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      const inb = nx >= 0 && nz >= 0 && nx < W && nz < H;
      const ni = inb ? L.idx(nx, nz) : -1;
      const key = L.edgeKey(x, z, d);
      const isOpen = L.open.has(key);
      const info = L.edgeInfo.get(key);
      const nh = ni >= 0 && L.cells[ni] ? L.heightOf[ni] : 0;
      const [ecx, ecz] = edgeCenter(x, z, d);
      const alongX = d === 1 || d === 3;
      if (isOpen && !info) {
        // plain opening (same room / corridor-corridor): lintel if taller
        if (h > nh + 0.01) wallSeg(x, z, d, 0, C, nh, h, st.wall);
        if (!doneEdges.has(key) && Math.abs(h - nh) > 0.01) {
          doneEdges.add(key);
          const top = Math.max(h, nh), bot = Math.min(h, nh);
          addBox(ecx, Y + (top + bot) / 2, ecz, alongX ? C : 0.3, top - bot, alongX ? 0.3 : C);
        }
        continue;
      }
      if (info) {
        const w = info.width;
        const s0 = (C - w) / 2, s1 = (C + w) / 2;
        wallSeg(x, z, d, 0, s0, 0, h, st.wall);
        wallSeg(x, z, d, s1, C, 0, h, st.wall);
        if (h > info.doorH + 0.01) wallSeg(x, z, d, s0, s1, info.doorH, h, st.wall);
        if (!doneEdges.has(key)) {
          doneEdges.add(key);
          const hh = Math.max(h, nh);
          const segLen = s0;
          // side segments
          const off = C / 2 - segLen / 2;
          if (alongX) {
            addBox(ecx - off, Y + hh / 2, ecz, segLen, hh, 0.3);
            addBox(ecx + off, Y + hh / 2, ecz, segLen, hh, 0.3);
            if (hh > info.doorH + 0.01) addBox(ecx, Y + (hh + info.doorH) / 2, ecz, w, hh - info.doorH, 0.3);
          } else {
            addBox(ecx, Y + hh / 2, ecz - off, 0.3, hh, segLen);
            addBox(ecx, Y + hh / 2, ecz + off, 0.3, hh, segLen);
            if (hh > info.doorH + 0.01) addBox(ecx, Y + (hh + info.doorH) / 2, ecz, 0.3, hh - info.doorH, w);
          }
          if (info.type === 'entrance' || info.type === 'fireexit') {
            // solid behind the door
            if (alongX) addBox(ecx, Y + info.doorH / 2, ecz, w, info.doorH, 0.3); else addBox(ecx, Y + info.doorH / 2, ecz, 0.3, info.doorH, w);
          }
        }
        continue;
      }
      // closed wall
      wallSeg(x, z, d, 0, C, 0, h, st.wall);
      if (theme.corridor.base && L.cells[i] === 2) {
        // baseboard strip
        const X0 = wx(x), X1 = wx(x + 1), Z0 = wz(z), Z1 = wz(z + 1);
        const e = 0.02;
        if (d === 0) gb.vrect('w:' + theme.corridor.base, X1 - e, Z0, X1 - e, Z1, Y, Y + 0.25, 0.5);
        if (d === 2) gb.vrect('w:' + theme.corridor.base, X0 + e, Z1, X0 + e, Z0, Y, Y + 0.25, 0.5);
        if (d === 1) gb.vrect('w:' + theme.corridor.base, X1, Z1 - e, X0, Z1 - e, Y, Y + 0.25, 0.5);
        if (d === 3) gb.vrect('w:' + theme.corridor.base, X0, Z0 + e, X1, Z0 + e, Y, Y + 0.25, 0.5);
      }
      if (!doneEdges.has(key)) {
        doneEdges.add(key);
        const hh = Math.max(h, nh);
        addBox(ecx, Y + hh / 2, ecz, alongX ? C + 0.3 : 0.3, hh, alongX ? 0.3 : C + 0.3);
      }
    }
  }

  const levelMesh = gb.build((key) => {
    const tex = key.split(':')[1];
    return levelMaterial(tex, { vertexColors: key.startsWith('f:') });
  });
  group.add(levelMesh);

  // ---------- props ----------
  const nav = new NavGrid(L, 1);
  const placeProp = (id, x, y, z, rotY, opts = {}) => {
    let obj;
    try { obj = createProp(id, { seed: rng.int(0, 99999), variant: rng.int(0, 3), ...opts }); } catch (e) { console.warn('prop', id, e); return null; }
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    group.add(obj);
    obj.updateMatrixWorld(true);
    const cols = obj.userData.colliders || [];
    const q = Math.round(rotY / (Math.PI / 2)) & 3;
    // Loose decoration should never be able to catch the capsule. Large furniture/wall props
    // still collide, but boxes/chairs/bags placed as clutter are visual dressing only.
    if (opts.visualOnly) obj.userData.colliders = [];
    for (const c of opts.visualOnly ? [] : cols) {
      let [cx, cy, cz] = c.c; let [sx, sy, sz] = c.s;
      // rotate center by rotY (multiples of 90deg)
      for (let k = 0; k < q; k++) { const t = cx; cx = cz; cz = -t; const u = sx; sx = sz; sz = u; }
      const px = x + cx, py = y + cy, pz = z + cz;
      addBox(px, py, pz, sx, sy, sz, G.STATIC, { kind: 'prop', id });
      if (sy > 0.3 && py - sy / 2 < Y + 1.2 && py + sy / 2 > Y + 0.2) nav.blockBox(px - sx / 2, pz - sz / 2, px + sx / 2, pz + sz / 2, 0.15);
    }
    for (const l of obj.userData.lights || []) {
      const p = new THREE.Vector3(...l.p).applyMatrix4(obj.matrixWorld);
      emitters.push({ pos: p, color: l.color, intensity: l.intensity ?? 1, distance: l.distance ?? 9, group: 'facility' });
    }
    propsList.push(obj);
    return obj;
  };

  const measure = (id) => {
    if (sizeCache.has(id)) return sizeCache.get(id);
    try { return propSize(id, createProp(id, { seed: 1 })); } catch { return { x: 1, y: 1, z: 1, minZ: -0.5, maxZ: 0.5 }; }
  };

  // helper: is edge (x,z,d) a doorway or opening?
  const edgeBusy = (x, z, d) => {
    const k = L.edgeKey(x, z, d);
    return L.open.has(k) || L.edgeInfo.has(k);
  };
  const cellHasDoorway = (x, z) => {
    for (let d = 0; d < 4; d++) { const k = L.edgeKey(x, z, d); const inf = L.edgeInfo.get(k); if (inf) return true; }
    return false;
  };

  // rooms
  for (const r of L.rooms) {
    const st = theme.rooms[r.type] || theme.rooms.office;
    const x0 = wx(r.x), z0 = wz(r.z), x1 = wx(r.x + r.w), z1 = wz(r.z + r.h);
    const rcx = (x0 + x1) / 2, rcz = (z0 + z1) / 2;
    // Deep rooms get a readable landmark so navigation is not just an endless sequence of boxes.
    // Keep it visual-only: the gameplay collision belongs to the room itself, not the landmark.
    if (r.type !== 'entrance' && r.type !== 'core' && !r.hub && L.distOf[L.idx(r.cx, r.cz)] >= 5 && r.w * r.h >= 8 && rng.chance(0.38)) {
      const marks = def.landmarks || ['server_rack_prop', 'generator', 'shelf_metal'];
      const landmark = marks[rng.int(0, marks.length - 1)];
      const obj = placeProp(landmark, rcx, Y, rcz, rng.int(0, 3) * Math.PI / 2, { visualOnly: true });
      if (obj) landmarkSpots.push({ x: rcx, y: Y, z: rcz, room: r.id, dist: L.distOf[L.idx(r.cx, r.cz)], type: r.type });
    }
    // lamps grid
    if (st.lamp) {
      const nx = Math.max(1, Math.round(r.w / 2)), nz = Math.max(1, Math.round(r.h / 2));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const lx = x0 + (a + 0.5) * (x1 - x0) / nx, lz = z0 + (b + 0.5) * (z1 - z0) / nz;
        if (rng.chance(0.08)) continue; // broken
        if (st.lamp === 'wall_lamp') {
          // put on the nearest wall later; here just ceiling-less glow emitter
          emitters.push({ pos: new THREE.Vector3(lx, Y + r.height - 0.6, lz), color: legacy ? 0xffc98a : (st.lampColor ?? def.lampColor ?? 0xffc98a), intensity: 0.8, distance: 9, group: 'facility', flicker: rng.chance(0.25) ? 0.3 : 0 });
          continue;
        }
        const lampObj = placeProp(st.lamp, lx, Y + r.height, lz, 0);
        if (lampObj) {
          lampObj.position.y = Y + r.height - (lampObj.userData.hang ? 0 : measure(st.lamp).y);
          lampObj.updateMatrixWorld(true);
          // re-anchor emitted light to new position
          const last = emitters.length - (lampObj.userData.lights?.length || 0);
          (lampObj.userData.lights || []).forEach((l, k) => {
            const e = emitters[last + k];
            if (e) { e.pos.set(...l.p).applyMatrix4(lampObj.matrixWorld); e.flicker = rng.chance(0.18) ? rng.float(0.2, 0.6) : 0; }
          });
          if (!legacy) tintLampLights(emitters, lampObj, st.lampColor ?? def.lampColor, null);
        }
      }
    }
    // wall props
    const wallSlots = [];
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      for (let d = 0; d < 4; d++) {
        const nx = xx + [1, 0, -1, 0][d], nz = zz + [0, 1, 0, -1][d];
        const inside = nx >= r.x && nx < r.x + r.w && nz >= r.z && nz < r.z + r.h;
        if (inside) continue;
        if (edgeBusy(xx, zz, d)) continue;
        if (cellHasDoorway(xx, zz) && rng.chance(0.6)) continue;
        wallSlots.push({ x: xx, z: zz, d });
      }
    }
    rng.shuffle(wallSlots);
    const wallCount = Math.min(wallSlots.length, Math.round((r.w + r.h) * 0.9));
    let fuseDone = false;
    for (let k = 0; k < wallCount; k++) {
      const s = wallSlots[k];
      let id = st.wall_?.length ? rng.pick(st.wall_) : null;
      if (st.reactor && !fuseDone) { id = 'fuse_box'; fuseDone = true; }
      if (!id) continue;
      const sz = measure(id);
      const [ecx, ecz] = edgeCenter(s.x, s.z, s.d);
      // rotation so prop front (+Z) faces into the room
      const rot = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][s.d];
      const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][s.d];
      const depth = Math.max(0.2, sz.z);
      const off = depth / 2 + 0.06;
      const px = ecx + inward[0] * off, pz = ecz + inward[1] * off;
      const wallMounted = id === 'fuse_box' || id === 'pipe_vertical';
      const obj = placeProp(id, px, Y + (wallMounted && id === 'fuse_box' ? 1.1 : 0), pz, rot);
      if (obj && id === 'fuse_box') {
        interactables.push({ type: 'fuse', obj, pos: new THREE.Vector3(px, Y + 1.5, pz), id: 'fuse' + interactables.length });
      }
    }
    // free wall spots (used by the host for mimic doors etc.)
    if (!['entrance', 'vault', 'generator', 'core'].includes(r.type)) {
      for (let k = wallCount + 2; k < wallSlots.length && k < wallCount + 4; k++) {
        const s = wallSlots[k];
        const nx = s.x + [1, 0, -1, 0][s.d], nz = s.z + [0, 1, 0, -1][s.d];
        if (nx >= 0 && nz >= 0 && nx < W && nz < H && L.cells[L.idx(nx, nz)]) continue; // must back onto solid rock
        const [ecx, ecz] = edgeCenter(s.x, s.z, s.d);
        const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][s.d];
        wallSpots.push({ x: ecx + inward[0] * 0.08, y: Y, z: ecz + inward[1] * 0.08, rotY: [-Math.PI / 2, Math.PI, Math.PI / 2, 0][s.d], room: r.id, dist: L.distOf[L.idx(s.x, s.z)] });
      }
    }
    // extra fuse boxes in random rooms
    if (!st.reactor && !fuseDone && rng.chance(0.12) && wallSlots.length > wallCount) {
      const s = wallSlots[wallCount];
      const [ecx, ecz] = edgeCenter(s.x, s.z, s.d);
      const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][s.d];
      const rot = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][s.d];
      const obj = placeProp('fuse_box', ecx + inward[0] * 0.15, Y + 1.1, ecz + inward[1] * 0.15, rot);
      if (obj) interactables.push({ type: 'fuse', obj, pos: new THREE.Vector3(ecx + inward[0] * 0.3, Y + 1.5, ecz + inward[1] * 0.3), id: 'fuse' + interactables.length });
    }
    // center / rows
    if (st.rows && r.w >= 3 && r.h >= 3) {
      const horizontal = r.w >= r.h;
      const sz = measure(st.rows);
      const len = horizontal ? (x1 - x0) - 2 * (st.rowMargin ?? 2.5) : (z1 - z0) - 2 * (st.rowMargin ?? 2.5);
      const n = Math.max(1, Math.floor(len / Math.max(1, sz.x + (st.rowGap || 0))));
      const rowsN = Math.max(1, Math.floor(((horizontal ? (z1 - z0) : (x1 - x0)) - 4) / 3.2));
      r.rowLines = []; r.rowSlots = [];
      for (let ri = 0; ri < rowsN; ri++) {
        const t = (ri + 1) / (rowsN + 1);
        const rot = horizontal ? (ri % 2 ? 0 : Math.PI) : (ri % 2 ? Math.PI / 2 : -Math.PI / 2);
        const lx = x0 + t * (x1 - x0), lz = z0 + t * (z1 - z0);
        r.rowLines.push({
          alongX: horizontal, front: [Math.round(Math.sin(rot)), Math.round(Math.cos(rot))],
          x0: horizontal ? rcx - len / 2 : lx, z0: horizontal ? lz : rcz - len / 2, x1: horizontal ? rcx + len / 2 : lx, z1: horizontal ? lz : rcz + len / 2,
        });
        for (let k = 0; k < n; k++) {
          if (rng.chance(0.15)) continue;
          const u = -len / 2 + (k + 0.5) * (len / n);
          const px = horizontal ? rcx + u : lx;
          const pz = horizontal ? lz : rcz + u;
          if (placeProp(st.rows, px, Y, pz, rot)) r.rowSlots.push({ x: px, z: pz, rot, spacing: len / n });
        }
      }
    } else if (st.grid) {
      // regular grid of workstations (office cubicle farms) with walkable aisles between them
      const g = st.grid, step = g.step || 3.6, m = g.margin || 2.6;
      const ax = (x1 - x0) - 2 * m, az = (z1 - z0) - 2 * m;
      if (ax >= 0 && az >= 0) {
        const ngx = Math.floor(ax / step) + 1, ngz = Math.floor(az / step) + 1;
        const ox = x0 + m + (ax - (ngx - 1) * step) / 2, oz = z0 + m + (az - (ngz - 1) * step) / 2;
        for (let j = 0; j < ngz; j++) for (let i2 = 0; i2 < ngx; i2++) {
          if (rng.chance(g.skip || 0)) continue;
          placeProp(g.id, ox + i2 * step, Y, oz + j * step, j % 2 ? 0 : Math.PI);
        }
      }
    } else if (st.center?.length) {
      const n = st.center.length;
      const alongX = (x1 - x0) >= (z1 - z0);
      for (let ci = 0; ci < n; ci++) {
        const id = st.center[ci];
        const off = (ci - (n - 1) / 2) * 2.6;
        const px = rcx + (alongX ? off : 0) + rng.float(-0.5, 0.5), pz = rcz + (alongX ? 0 : off) + rng.float(-0.5, 0.5);
        placeProp(id, px, Y, pz, rng.int(0, 3) * Math.PI / 2);
        if (id === 'desk' || id === 'table') {
          const chair = st.clutter?.includes('office_chair') ? 'office_chair' : null;
          if (chair) placeProp(chair, px + rng.float(-0.4, 0.4), Y, pz + 1.1, Math.PI + rng.float(-0.5, 0.5));
        }
      }
    }
    // reactor pedestal spot
    if (st.reactor) {
      r.reactorSpot = new THREE.Vector3(rcx, Y + 0.05, rcz);
    }
    // clutter in corners
    if (st.clutter?.length) {
      const n = Math.round(r.w * r.h * 0.45);
      for (let k = 0; k < n; k++) {
        const id = rng.pick(st.clutter);
        if (id === 'cobweb' || id === 'hanging_chains') {
          const cx = rng.float(x0 + 0.5, x1 - 0.5), cz = rng.float(z0 + 0.5, z1 - 0.5);
          placeProp(id, cx, Y + r.height - (id === 'cobweb' ? 1.4 : 2.2), cz, rng.int(0, 3) * Math.PI / 2);
          continue;
        }
        const corner = rng.int(0, 3);
        const cx = corner & 1 ? x1 - rng.float(0.7, 1.6) : x0 + rng.float(0.7, 1.6);
        const cz = corner & 2 ? z1 - rng.float(0.7, 1.6) : z0 + rng.float(0.7, 1.6);
        const gx = Math.floor((cx - L.ox) / C), gz = Math.floor((cz - L.oz) / C);
        if (cellHasDoorway(gx, gz)) continue;
        placeProp(id, cx, Y, cz, rng.float(0, Math.PI * 2) * (id === 'office_chair' ? 1 : 0) + rng.int(0, 3) * Math.PI / 2, { visualOnly: true });
      }
    }
    // posters / decals
    const nPost = st.posters || (rng.chance(0.5) ? 1 : 0);
    for (let k = 0; k < nPost && wallSlots.length; k++) {
      const s = wallSlots[(wallCount + k) % wallSlots.length];
      decals.push({ s, tex: def.posters ? rng.pick(def.posters) : L.theme === 'mansion' ? rng.pick(['poster_missing', 'poster_fish', 'graffiti']) : rng.pick(['poster_work', 'poster_safety', 'poster_like', 'poster_fish', 'poster_missing', 'sign_danger', 'graffiti', 'blood_splat']), y: 1.6, size: 1.1 });
    }
    // scrap spots in room (none in the containment chamber: the CORE is its only prize)
    const spots = r.type === 'core' ? 0 : Math.max(2, Math.round(r.w * r.h * 0.9));
    for (let k = 0; k < spots; k++) {
      const px = rng.float(x0 + 0.8, x1 - 0.8), pz = rng.float(z0 + 0.8, z1 - 0.8);
      scrapSpots.push({ x: px, y: Y, z: pz, room: r.id, type: r.type, dist: L.distOf[L.idx(r.cx, r.cz)] || 0, sealed: r.type === 'vault' || !!r.treasure });
    }
    if (r.w * r.h >= 6 && !['vault', 'entrance', 'bathroom', 'core'].includes(r.type)) bigSpots.push({ x: rcx + rng.float(-1, 1), y: Y, z: rcz + rng.float(-1, 1), room: r.id, dist: L.distOf[L.idx(r.cx, r.cz)] || 0 });
    // vents
    if (r.type !== 'entrance' && r.type !== 'vault' && r.type !== 'core' && wallSlots.length > 2 && rng.chance(0.55)) {
      const s = wallSlots[wallSlots.length - 1];
      const [ecx, ecz] = edgeCenter(s.x, s.z, s.d);
      const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][s.d];
      const rot = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][s.d];
      const obj = placeProp('vent_cover', ecx + inward[0] * 0.06, Y + 0.3, ecz + inward[1] * 0.06, rot);
      ventSpots.push({ x: ecx + inward[0] * 1.2, y: Y, z: ecz + inward[1] * 1.2, room: r.id, obj });
    }
    if (st.webs) for (let k = 0; k < 3; k++) mineSpots.push({ web: true, x: rng.float(x0 + 1, x1 - 1), y: Y, z: rng.float(z0 + 1, z1 - 1) });
  }

  // corridor details: lamps, pipes, hazards
  const darkCells = planDarkCorridors(L);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2) continue;
    const cx = wx(x) + C / 2, cz = wz(z) + C / 2;
    const every = legacy ? 3 : (def.lamps?.every || 3);
    const lampHere = every === 1 || (every === 2 ? (x + z) % 2 === 0 : (x + z * 3) % 3 === 0);
    if (lampHere && !darkCells.has(i) && !rng.chance(0.12)) {
      if (L.theme === 'mineshaft') {
        // hanging cage lanterns on the timber frames come from decorateMineshaft()
      } else if (L.theme === 'mansion') {
        emitters.push({ pos: new THREE.Vector3(cx, Y + corridorH - 0.7, cz), color: 0xffb070, intensity: 0.7, distance: 8, group: 'facility', flicker: rng.chance(0.2) ? 0.4 : 0 });
      } else {
        const lampId = legacy ? (rng.chance(0.7) ? 'fluorescent' : 'ceiling_lamp') : (def.lamps?.corridor || 'fluorescent');
        // new themes align their panels with the corridor axis
        const lampRot = legacy ? (x % 2) * Math.PI / 2 : (L.open.has(L.edgeKey(x, z, 0)) || L.open.has(L.edgeKey(x, z, 2)) ? 0 : Math.PI / 2);
        const lamp = placeProp(lampId, cx, Y + corridorH, cz, lampRot);
        if (lamp) {
          const h = measure(lampId).y;
          lamp.position.y = Y + corridorH - (h || 0.2);
          lamp.updateMatrixWorld(true);
          const n = lamp.userData.lights?.length || 0;
          const flickP = legacy ? 0.2 : (def.lamps?.flicker ?? 0.2);
          for (let k = 0; k < n; k++) {
            const e = emitters[emitters.length - n + k];
            e.pos.set(...lamp.userData.lights[k].p).applyMatrix4(lamp.matrixWorld);
            e.flicker = rng.chance(flickP) ? rng.float(0.2, 0.7) : 0;
            if (!legacy && def.lamps?.color != null) e.color = def.lamps.color;
          }
        }
      }
    }
    if ((legacy ? L.theme !== 'mansion' && L.theme !== 'mineshaft' : !!def.corridorPipes) && rng.chance(0.1)) {
      // pipes along a closed wall
      for (let d = 0; d < 4; d++) {
        if (edgeBusy(x, z, d)) continue;
        const [ecx, ecz] = edgeCenter(x, z, d);
        const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][d];
        placeProp('pipe_bundle', ecx + inward[0] * 0.25, Y + 2.3, ecz + inward[1] * 0.25, [-Math.PI / 2, Math.PI, Math.PI / 2, 0][d]);
        break;
      }
    }
    if (rng.chance(legacy ? 0.07 : (def.corridorScrap ?? 0.07))) scrapSpots.push({ x: cx + rng.float(-1, 1), y: Y, z: cz + rng.float(-1, 1), room: -1, type: 'corridor', dist: L.distOf[i] });
    if (L.distOf[i] > 3 && rng.chance(0.12)) ceilingSpots.push({ x: cx + rng.float(-1, 1), y: Y + corridorH - 0.25, z: cz + rng.float(-1, 1) });
    if (L.distOf[i] > 5 && rng.chance(0.06)) mineSpots.push({ x: cx + rng.float(-0.8, 0.8), y: Y, z: cz + rng.float(-0.8, 0.8) });
    if (L.distOf[i] > 6 && rng.chance(0.035)) {
      // turret faces along the corridor axis
      const straightX = L.open.has(L.edgeKey(x, z, 0)) && L.open.has(L.edgeKey(x, z, 2));
      turretSpots.push({ x: cx, y: Y, z: cz, rotY: straightX ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI) });
    }
    if (rng.chance(0.04)) {
      // corridor vent
      for (let d = 0; d < 4; d++) {
        if (edgeBusy(x, z, d)) continue;
        const [ecx, ecz] = edgeCenter(x, z, d);
        const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][d];
        const obj = placeProp('vent_cover', ecx + inward[0] * 0.06, Y + 0.3, ecz + inward[1] * 0.06, [-Math.PI / 2, Math.PI, Math.PI / 2, 0][d]);
        ventSpots.push({ x: cx, y: Y, z: cz, room: -1, obj });
        break;
      }
    }
  }

  // decals (posters etc.) as small planes on walls
  for (const dcl of decals) {
    const { s } = dcl;
    const [ecx, ecz] = edgeCenter(s.x, s.z, s.d);
    const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][s.d];
    // alpha-tested cutout (not transparent): posters of one texture merge into a single draw call below
    const mat = levelMaterial(dcl.tex, { alphaTest: 0.4 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dcl.size, dcl.size * 1.3), mat);
    m.position.set(ecx + inward[0] * 0.03 + rng.float(-1, 1) * (s.d % 2 ? 1 : 0), Y + dcl.y, ecz + inward[1] * 0.03 + rng.float(-1, 1) * (s.d % 2 ? 0 : 1));
    m.rotation.y = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][s.d];
    group.add(m);
    if (!globalThis.__kefalLegacyMerge) propsList.push(m); // TEMP-BENCH
  }

  // ---------- doors ----------
  let doorId = 0;
  for (const info of L.edgeInfo.values()) {
    const x = info.cx, z = info.cz;
    const px = L.ox + x * C, pz = L.oz + z * C;
    const rotY = info.dir === 0 ? Math.PI / 2 : 0; // door plane faces +z (rot 0) or +x
    let propId = null;
    if (info.type === 'door') propId = L.theme === 'mansion' ? 'door_mansion' : (def.doorProp || 'door_single');
    else if (info.type === 'blast' || info.type === 'contain') propId = 'blast_door';
    else if (info.type === 'vault') propId = 'vault_door';
    else if (info.type === 'entrance') propId = L.theme === 'mansion' ? 'door_mansion' : 'blast_door';
    else if (info.type === 'fireexit') propId = 'door_single';
    if (!propId) continue;
    let obj = null;
    try { obj = createProp(propId, { seed: doorId }); } catch (e) { console.warn(e); }
    if (!obj) continue;
    obj.position.set(px, Y, pz);
    obj.rotation.y = rotY;
    if (info.type === 'fireexit' || info.type === 'entrance') {
      // face into the facility (wall side d -> inward-facing rotation)
      const wallSide = info.type === 'entrance' ? 1 : info.inward;
      obj.rotation.y = [-Math.PI / 2, Math.PI, Math.PI / 2, 0][wallSide] ?? 0;
    }
    group.add(obj);
    obj.updateMatrixWorld(true);
    if (!globalThis.__kefalLegacyMerge) { // TEMP-BENCH
      // perf: the frame merges with the static props, each animated anchor (hinge / leaves) is compacted
      const anchors = new Set(Object.values(obj.userData.anchors || {}).filter((a) => a?.isObject3D));
      for (const a of anchors) { a.userData.noMerge = true; compactSubtree(a, anchors); }
      propsList.push(obj);
    }
    const door = {
      id: 'd' + (doorId++), kind: info.type, info, obj, pos: new THREE.Vector3(px, Y, pz), rotY,
      open: false, locked: !!info.locked || info.type === 'vault', code: info.code || null, t: 0, collider: null,
      anchors: obj.userData.anchors || {},
      width: info.width, height: info.doorH,
    };
    if (info.type === 'contain') {
      // Containment door: behaves like a vault door for the host rules (no manual open/close, no key, creatures
      // ignore it, nav-blocked while shut) but the facility-systems module owns its animation and collider.
      // The collider is a plain static 'prop' box so the look-at ray never shows the vault/door prompts.
      door.kind = 'vault';
      door.contain = true;
      door.locked = true;
      const alongX = info.dir === 1;
      door.solidArgs = [px, Y + info.doorH / 2, pz, alongX ? info.width : 0.5, info.doorH, alongX ? 0.5 : info.width];
      door.solid = addBox(...door.solidArgs, G.STATIC, { kind: 'prop', id: 'contain_door' });
    }
    if (info.treasure) door.treasure = true;
    if (info.type === 'door' || info.type === 'blast' || info.type === 'vault') {
      const alongX = info.dir === 1;
      const thick = info.type === 'blast' ? 0.5 : 0.25;
      door.colArgs = [px, Y + info.doorH / 2, pz, alongX ? info.width : thick, info.doorH, alongX ? thick : info.width];
      door.collider = addBox(...door.colArgs, G.DOOR, { kind: 'door', door });
      if (info.type === 'blast' && door.code) {
        // secure doors start open; the ship terminal can close them
        door.open = true;
        door.t = 1;
        physics.removeCollider(door.collider);
        colliders.splice(colliders.indexOf(door.collider), 1);
        door.collider = null;
      }
    }
    if (info.type === 'vault') {
      const kp = new THREE.Vector3(px, Y + 1.4, pz);
      // keypad on the side of the vault door, facing the non-vault side
      const vaultCell = L.roomOf[info.a] >= 0 && L.rooms[L.roomOf[info.a]].type === 'vault' ? info.a : info.b;
      const outCell = vaultCell === info.a ? info.b : info.a;
      const ocx = L.ox + ((outCell % W) + 0.5) * C, ocz = L.oz + (Math.floor(outCell / W) + 0.5) * C;
      const dirx = Math.sign(ocx - px), dirz = Math.sign(ocz - pz);
      kp.x += dirx * 0.35 + (info.dir === 1 ? 1.7 : 0); kp.z += dirz * 0.35 + (info.dir === 0 ? 1.7 : 0);
      let keypad = null;
      try { keypad = createProp('keypad', {}); } catch { /* ignore */ }
      if (keypad) {
        keypad.position.set(kp.x, Y + 1.2, kp.z);
        keypad.rotation.y = Math.atan2(dirx, dirz);
        group.add(keypad);
      }
      door.keypadPos = kp;
      door.vaultCell = vaultCell;
    }
    if (info.type === 'entrance' || info.type === 'fireexit') {
      door.teleport = true;
      // the outdoor map has L.outdoorFires fire exits: a third indoor fire exit leads out through the first one
      // (before, it pointed at a missing outdoor exit and did nothing)
      door.exitIndex = info.type === 'entrance' ? 0 : 1 + (Math.max(0, L.fireExits.findIndex((f) => f.info === info)) % Math.max(1, L.outdoorFires || 1));
      // standing spot inside, in front of the door
      const wallSide = info.type === 'entrance' ? 1 : info.inward;
      const inward = [[-1, 0], [0, -1], [1, 0], [0, 1]][wallSide];
      door.spawn = new THREE.Vector3(px + inward[0] * 1.6, Y + 0.1, pz + inward[1] * 1.6);
      door.faceYaw = Math.atan2(-inward[0], -inward[1]);
      emitters.push({ pos: new THREE.Vector3(px + inward[0] * 0.6, Y + info.doorH + 0.35, pz + inward[1] * 0.6), color: info.type === 'entrance' ? 0x9fffb0 : 0xff5040, intensity: 0.5, distance: 6, group: 'exit' });
      // exit sign
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), levelMaterial('sign_exit', {}));
      sign.material = sign.material.clone(); sign.material.emissive = new THREE.Color(0x44ff66); sign.material.emissiveIntensity = 0.6;
      sign.position.set(px + inward[0] * 0.05, Y + info.doorH + 0.35, pz + inward[1] * 0.05);
      sign.rotation.y = Math.atan2(inward[0], inward[1]);
      group.add(sign);
    }
    doorsOut.push(door);
  }

  // vault loot spots & reactor spot
  const vaultSpots = [];
  for (const r of L.rooms) {
    if (r.type !== 'vault') continue;
    const x0 = wx(r.x), z0 = wz(r.z);
    for (let k = 0; k < 4; k++) vaultSpots.push({ x: x0 + 1.5 + (k % 2) * 5, y: Y, z: z0 + 1.5 + Math.floor(k / 2) * 5, room: r.id });
    emitters.push({ pos: new THREE.Vector3(x0 + C, Y + 3.2, z0 + C), color: 0xffd27a, intensity: 1.0, distance: 9, group: 'facility' });
  }
  const reactorRoom = L.rooms.find((r) => r.reactorSpot);

  // set pieces: catwalks, steam vents, flooded room, dark corridors, blood trails
  const setPieces = buildSetPieces({
    layout: L, group, physics, lightPool, rng: new RNG((L.seed ^ 0x5e7a1ece) >>> 0),
    addBox: (cx, cy, cz, sx, sy, sz) => addBox(cx, cy, cz, sx, sy, sz),
    placeProp: (id, x, y, z, rotY) => placeProp(id, x, y, z, rotY),
    nav, Y, CELL: C, levelMaterial, GeoBuilder, interior: def,
  });
  if (L.theme === 'mineshaft') {
    decorateMineshaft({
      layout: L, group, physics, lightPool, rng: new RNG((L.seed ^ 0x3171e5) >>> 0), addBox, placeProp, nav, Y, CELL: C, levelMaterial, GeoBuilder, emitters,
      darkCells: typeof planDarkCorridors === 'function' ? planDarkCorridors(L) : null,
    });
  }
  // theme decoration (src/world/interiors/*.js): pillars, water channels, cable trays, pools ...
  const themeCtx = {
    layout: L, group, lightPool, addBox, placeProp, nav, Y, CELL: C, levelMaterial, GeoBuilder, emitters,
    zones: setPieces.zones, scrapSpots, darkCells, setPieces,
  };
  if (typeof def.decorate === 'function') def.decorate({ ...themeCtx, rng: new RNG((L.seed ^ 0x7de1c0) >>> 0) });
  // gameplay set pieces shared by every theme: laser grids, breaker rooms, cave-ins, vent shortcuts, sludge
  const hazards = buildHazards({ ...themeCtx, rng: new RNG((L.seed ^ 0x4a2a7d) >>> 0), interior: def });
  setPieces.hazards = hazards;
  // facility systems (interiors/facsys.js): generator console, puzzle panels, notes, consoles, containment chamber,
  // emergency lighting. Own rng fork; the runtime (state machine, net, HUD) lives in src/game/facilitysys.js.
  let sys = null;
  try { sys = buildFacilitySystems({ ...themeCtx, rng: new RNG((L.seed ^ 0xfac5175) >>> 0), interior: def, doors: doorsOut, hazards, physics, lightPool, colliders }); } catch (e) { console.warn('facility systems', e); }
  setPieces.releaseNav();
  // lights
  for (const e of emitters) lightPool.add(e);
  // merge static props per chunk/material (doors are separate objects and stay animated)
  mergeStaticMeshes(propsList, group, globalThis.__kefalLegacyMerge ? 12 : globalThis.__kefalMergeChunk || 24, globalThis.__kefalMergeCoarse ?? 2.5);

  // filter scrap spots by nav
  const okSpot = (s) => nav.walkableAt(s.x, s.z);
  const scrap = scrapSpots.filter(okSpot);
  for (const s of setPieces.scrapSpots) scrap.push(s);
  const vents = ventSpots.filter((s) => nav.nearestWalkable(...nav.toGrid(s.x, s.z), 2));
  const mines = mineSpots.filter(okSpot);
  // door lookup by edge key (for nav blocking)
  const doorByKey = new Map(doorsOut.map((d) => [d.info.key, d]));
  for (const d of doorsOut) if (d.kind === 'vault' || (d.kind === 'door' && d.locked)) nav.blockedEdges.add(d.info.key);

  const mainDoor = doorsOut.find((d) => d.kind === 'entrance');
  const fireDoors = doorsOut.filter((d) => d.kind === 'fireexit');
  const chestSpots = planChestSpots(L, nav, vaultSpots);

  return {
    group, colliders, nav, layout: L, doors: doorsOut, doorByKey, emitters, interactables,
    scrapSpots: scrap, bigSpots: bigSpots.filter(okSpot), vaultSpots, ventSpots: vents, turretSpots, mineSpots: mines,
    wallSpots: wallSpots.filter((s) => nav.nearestWalkable(...nav.toGrid(s.x, s.z), 2)), ceilingSpots: ceilingSpots.filter(okSpot),
    reactorSpot: reactorRoom?.reactorSpot || null, mainDoor, fireDoors,
    setPieces, zones: setPieces.zones, landmarkSpots, hazards,
    sys, chestSpots,   // facility systems runtime data + chest spots (dead-end / treasure / vault rooms) for the world module
    interior: def.id, interiorName: def.name, atmosphere: def.atmosphere || null,
    dispose(physicsRef) {
      try { sys?.dispose(); } catch (e) { console.warn('facility systems dispose', e); }
      setPieces.dispose(physicsRef);
      for (const c of colliders) physicsRef.removeCollider(c);
      for (const e of emitters) lightPool.remove(e);
      group.traverse((o) => { if (o.geometry && o.parent && !o.geometry.userData?.shared) o.geometry.dispose(); });
      group.removeFromParent();
    },
    // which room/zone is a world position in
    cellAt(x, z) {
      const gx = Math.floor((x - L.ox) / C), gz = Math.floor((z - L.oz) / C);
      if (gx < 0 || gz < 0 || gx >= W || gz >= H) return -1;
      return L.idx(gx, gz);
    },
    contains(p) { return p.y < Y + 12 && p.y > Y - 5 && this.cellAt(p.x, p.z) >= 0 && L.cells[this.cellAt(p.x, p.z)] > 0; },
  };
}
