// ZONES 2 core (wave 6, module `zones` v2): pure rules, no DOM / game / three access (node-testable: tools/harness/zones2.test.mjs). Design: docs/wave6/zones2.md.
//   1. INTERIOR wings: partition of a facility layout into wings (multi-source BFS from the entrance + fire exits), a core spot per wing, trap placement + validation
//      (horror trap types on straight corridor runs, reusing horror_core's findRuns / reachableCells), a cell flow field for interior raiders.
//   2. OUTDOOR placement: validated wall / gate pieces on a snap grid + a validated spot search for the ring defences (replaces debugPlace-without-checks).
//   3. RAIDER pathing: a flow field whose goal is the zone core (siege_core FlowField), barricade / wall blockers with crossing costs (gates are cheap = a funnel).
//   4. ARCHIVE: compact records of generated-sector moons so owned zones keep paying after the sector rotates.
import { RNG, hashString } from '../core/rng.js';
import { FlowField, inBox, distToHull, DOOR, HULL } from './siege_core.js';
import { TRAPS, CELL, findRuns, reachableCells, straightAxis } from './horror_core.js';
import * as Z from './zones_core.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

// ================================================================================================ 1. interior wings
const SPECIAL = new Set(['entrance', 'vault', 'generator', 'core']);
/** wing names of zoneSpec (entrance, fire0, fire1) -> anchor cell in the layout (null = this layout has no such exit) */
export function wingAnchors(L) {
  const out = [{ wing: 'entrance', cx: L.entrance.room.cx, cz: L.entrance.room.cz }];
  (L.fireExits || []).slice(0, 2).forEach((f, i) => out.push({ wing: 'fire' + i, cx: f.cellX, cz: f.cellZ }));
  return out;
}
/** an edge the crew (and raiders) cannot walk through without a key: vaults, containment, arena doors, locked doors */
export function edgeBlocked(L, k) {
  const inf = L.edgeInfo.get(k);
  return !!inf && (inf.type === 'vault' || inf.type === 'contain' || !!inf.arena || (inf.type === 'door' && !!inf.locked));
}
const nbr = (L, i, d) => {
  const x = i % L.w, z = (i / L.w) | 0, nx = x + DX[d], nz = z + DZ[d];
  if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) return -1;
  const j = nz * L.w + nx;
  if (!L.cells[j] || !L.open.has(L.edgeKey(x, z, d)) || edgeBlocked(L, L.edgeKey(x, z, d))) return -1;
  return j;
};
const cellCenter = (L, i) => ({ x: L.ox + ((i % L.w) + 0.5) * CELL, z: L.oz + (((i / L.w) | 0) + 0.5) * CELL });
export const cellOfPos = (L, x, z) => {
  const cx = Math.floor((x - L.ox) / CELL), cz = Math.floor((z - L.oz) / CELL);
  return cx < 0 || cz < 0 || cx >= L.w || cz >= L.h ? -1 : cz * L.w + cx;
};

/**
 * Split the walkable part of a facility into wings. wingNames = the wing kinds of the zone spec in order (e.g. ['entrance', 'fire0', 'fire1']).
 * Every reachable cell goes to the nearest anchor by walking distance (ties: the earlier wing). Each wing gets a relay core in an ordinary room
 * 3-9 cells from its anchor. Returns { wings: [{ name, wi, anchor, core, cells, sealed }], cellWing, dist, reach }. `core` = null when the wing is too small.
 */
export function partitionWings(L, wingNames, seedKey = 'zn') {
  const reach = reachableCells(L);
  const N = L.w * L.h, cellWing = new Int8Array(N).fill(-1), dist = new Int16Array(N).fill(-1);
  const anchors = wingAnchors(L), wings = [], q = [];
  wingNames.forEach((name, wi) => {
    const a = anchors.find((x) => x.wing === name);
    const i = a ? L.idx(a.cx, a.cz) : -1;
    const ok = i >= 0 && L.cells[i] && reach[i] && cellWing[i] < 0;
    if (ok) { cellWing[i] = wi; dist[i] = 0; q.push(i); }
    wings.push({ name, wi, anchor: ok ? a : null, core: null, cells: 0 });
  });
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (let d = 0; d < 4; d++) {
      const j = nbr(L, i, d);
      if (j < 0 || cellWing[j] >= 0 || !reach[j]) continue;
      cellWing[j] = cellWing[i]; dist[j] = dist[i] + 1; q.push(j);
    }
  }
  for (let i = 0; i < N; i++) if (cellWing[i] >= 0) wings[cellWing[i]].cells++;
  const rng = new RNG(hashString(`${seedKey}:wings:${L.seed}`));
  const taken = [];
  const plainCell = (i, lobby = false) => { const r = L.roomOf && L.roomOf[i] >= 0 ? L.rooms[L.roomOf[i]] : null; return !r || !((SPECIAL.has(r.type) && !(lobby && r.type === 'entrance')) || r.treasure || r.arena || r.maze); };
  for (const w of wings) {
    if (!w.anchor || w.cells < 6) continue;
    const cand = [];
    for (const r of L.rooms || []) {
      if (!r || SPECIAL.has(r.type) || r.treasure || r.arena || r.maze) continue;
      const i = L.idx(r.cx, r.cz);
      if (i < 0 || !L.cells[i] || cellWing[i] !== w.wi || !reach[i]) continue;
      const d = dist[i], area = r.w * r.h;
      if (d < 3 || area < 2) continue;
      cand.push({ i, d, room: r.id, s: -Math.abs(d - 5.5) + Math.min(area, 12) * 0.15 + rng.float(0, 0.4) });
    }
    if (!cand.length) {   // no ordinary room: any hallway cell a few steps in
      for (let i = 0; i < N; i++) if (cellWing[i] === w.wi && reach[i] && plainCell(i) && dist[i] >= 3 && dist[i] <= 9) cand.push({ i, d: dist[i], room: L.roomOf ? L.roomOf[i] : -1, s: -Math.abs(dist[i] - 5) + rng.float(0, 0.4) });
    }
    if (!cand.length) for (let i = 0; i < N; i++) if (cellWing[i] === w.wi && reach[i] && plainCell(i) && dist[i] >= 2) cand.push({ i, d: dist[i], room: L.roomOf ? L.roomOf[i] : -1, s: -Math.abs(dist[i] - 3) + rng.float(0, 0.4) });
    if (!cand.length) for (let i = 0; i < N; i++) if (cellWing[i] === w.wi && reach[i] && plainCell(i, true) && dist[i] >= 2) cand.push({ i, d: dist[i], room: L.roomOf ? L.roomOf[i] : -1, s: -Math.abs(dist[i] - 3) + rng.float(0, 0.4) });   // last resort: the lobby itself
    cand.sort((a, b) => b.s - a.s || a.i - b.i);
    const pick = cand.find((c) => taken.every((t) => Math.abs((t % L.w) - (c.i % L.w)) + Math.abs(((t / L.w) | 0) - ((c.i / L.w) | 0)) >= 4)) || cand[0];
    if (!pick) continue;
    taken.push(pick.i);
    const c = cellCenter(L, pick.i);
    w.core = { wi: w.wi, cell: pick.i, cx: pick.i % L.w, cz: (pick.i / L.w) | 0, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, y: L.y, room: pick.room, d: pick.d };
  }
  return { wings, cellWing, dist, reach };
}
/** wing index the position stands in (-1 = none / not in the facility) */
export function wingAt(L, part, x, y, z) {
  if (!L || !part || Math.abs(y - L.y) > 6) return -1;
  const i = cellOfPos(L, x, z);
  return i < 0 ? -1 : part.cellWing[i];
}
/** BFS distance from the core over the wing's cells (walking distance in cells; -1 = not in the wing) */
export function coreDist(L, part, wi) {
  const w = part.wings[wi], N = L.w * L.h, fd = new Int16Array(N).fill(-1);
  if (!w?.core) return fd;
  const q = [w.core.cell]; fd[w.core.cell] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (let d = 0; d < 4; d++) { const j = nbr(L, i, d); if (j < 0 || fd[j] >= 0 || part.cellWing[j] !== wi) continue; fd[j] = fd[i] + 1; q.push(j); }
  }
  return fd;
}
/** shortest route from the wing anchor to the core (cell indices, anchor first) */
export function routeCells(L, part, wi) {
  const w = part.wings[wi];
  if (!w?.core || !w.anchor) return [];
  const out = [w.core.cell];
  let i = w.core.cell;
  for (let guard = 0; guard < 400 && part.dist[i] > 0; guard++) {
    let next = -1;
    for (let d = 0; d < 4 && next < 0; d++) { const j = nbr(L, i, d); if (j >= 0 && part.cellWing[j] === wi && part.dist[j] === part.dist[i] - 1) next = j; }
    if (next < 0) break;
    out.push(next); i = next;
  }
  return out.reverse();
}
/** one raider step on the interior flow: the centre of the neighbouring cell nearer to the core (null when already in the core cell) */
export function flowTarget(L, fd, x, z) {
  const i = cellOfPos(L, x, z);
  if (i < 0 || fd[i] <= 0) return null;
  let best = -1, bd = fd[i];
  for (let d = 0; d < 4; d++) { const j = nbr(L, i, d); if (j >= 0 && fd[j] >= 0 && fd[j] < bd) { bd = fd[j]; best = j; } }
  return best < 0 ? null : cellCenter(L, best);
}
/** where interior raiders come from: cells 7-16 steps from the core, spread deterministically (world x/z) */
export function wingSpawnPoints(L, part, wi, fd, n, rng) {
  const cells = [];
  for (let i = 0; i < fd.length; i++) if (fd[i] >= 7 && fd[i] <= 16 && part.cellWing[i] === wi) cells.push(i);
  if (!cells.length) for (let i = 0; i < fd.length; i++) if (fd[i] >= 4 && part.cellWing[i] === wi) cells.push(i);
  const out = [];
  for (let k = 0; k < n && cells.length; k++) { const i = cells[rng.int(0, cells.length - 1)], c = cellCenter(L, i); out.push({ x: c.x + rng.float(-0.8, 0.8), z: c.z + rng.float(-0.8, 0.8) }); }
  return out;
}

// ------------------------------------------------------------------------------------------------ interior traps (horror planner / validator, permanent variant)
/** `ctx`: { taken: [{cells}] zone traps already placed, horror: [{cells}] pay-to-arm traps of the horror plan, hazards: [{cx, cz}] built-in laser grids (world) } */
export function validateTrap(L, part, wi, pl, ctx = {}) {
  const T = pl && TRAPS[pl.type];
  if (!T) return { ok: false, why: 'unknown' };
  const w = part.wings[wi], cells = pl.cells || [];
  if (!w?.core) return { ok: false, why: 'nowing' };
  if (cells.length < T.minLen || cells.length > T.len + 1) return { ok: false, why: 'len' };
  const ax = pl.axis === 'x' ? [1, 0] : [0, 1];
  for (let k = 0; k < cells.length; k++) {
    const [x, z] = cells[k];
    if (k && (cells[k][0] - cells[k - 1][0] !== ax[0] || cells[k][1] - cells[k - 1][1] !== ax[1])) return { ok: false, why: 'shape' };
    if (x < 0 || z < 0 || x >= L.w || z >= L.h) return { ok: false, why: 'shape' };
    const i = L.idx(x, z);
    if (!L.cells[i]) return { ok: false, why: 'shape' };
    if (part.cellWing[i] !== wi) return { ok: false, why: 'wing' };
    if (!part.reach[i]) return { ok: false, why: 'reach' };
    if (straightAxis(L, x, z) !== pl.axis) return { ok: false, why: 'axis' };
    if (Math.abs(x - w.core.cx) + Math.abs(z - w.core.cz) < 2) return { ok: false, why: 'core' };
  }
  const mid = cells[Math.floor(cells.length / 2)];
  for (const o of ctx.taken || []) {
    if (!o?.cells) continue;
    const om = o.cells[Math.floor(o.cells.length / 2)];
    if (o.cells.some((c) => cells.some((d) => Math.abs(c[0] - d[0]) + Math.abs(c[1] - d[1]) < 2))) return { ok: false, why: 'overlap' };
    if (Math.abs(om[0] - mid[0]) + Math.abs(om[1] - mid[1]) < 3) return { ok: false, why: 'overlap' };
  }
  for (const o of ctx.horror || []) {
    if (!o?.cells) continue;
    if (o.cells.some((c) => cells.some((d) => c[0] === d[0] && c[1] === d[1])) || (o.panelCell && cells.some((d) => d[0] === o.panelCell[0] && d[1] === o.panelCell[1]))) return { ok: false, why: 'horror' };
    const om = o.cells[Math.floor(o.cells.length / 2)];
    if (Math.abs(om[0] - mid[0]) + Math.abs(om[1] - mid[1]) < 3) return { ok: false, why: 'horror' };
  }
  const wx = L.ox + (mid[0] + 0.5) * CELL, wz = L.oz + (mid[1] + 0.5) * CELL;
  for (const h of ctx.hazards || []) if (Math.hypot((h.cx ?? h.x) - wx, (h.cz ?? h.z) - wz) < 8) return { ok: false, why: 'hazard' };
  return { ok: true, why: '' };
}
/** all valid placements of a trap type in a wing (unordered) */
export function trapCandidates(L, part, wi, type, ctx = {}) {
  const T = TRAPS[type], out = [];
  if (!T) return out;
  for (const run of findRuns(L, part.reach)) {
    for (let len = T.len; len >= T.minLen; len--) {
      for (let s = 0; s + len <= run.cells.length; s++) {
        const pl = { type, axis: run.axis, cells: run.cells.slice(s, s + len), zoneLen: len };
        if (validateTrap(L, part, wi, pl, ctx).ok) out.push(pl);
      }
      if (out.length) break;
    }
  }
  return out;
}
/** how many far cells' raider walks (flowTarget descent) pass through each cell: the chokepoint map of a wing */
export function flowLoad(L, part, wi, fd) {
  const load = new Int16Array(fd.length);
  let n = 0;
  for (let i = 0; i < fd.length; i++) {
    if (part.cellWing[i] !== wi || fd[i] < 7) continue;
    n++;
    let c = i;
    for (let g = 0; g < 80 && fd[c] > 0; g++) {
      load[c]++;
      let best = -1, bd = fd[c];
      for (let d = 0; d < 4; d++) { const j = nbr(L, c, d); if (j >= 0 && fd[j] >= 0 && fd[j] < bd) { bd = fd[j]; best = j; } }
      if (best < 0) break;
      c = best;
    }
  }
  return { load, n };
}
/** the planner: one placement per wanted trap type, in order (null = no valid corridor left). Prefers corridor runs most raider walks pass through (chokepoints). */
export function planWingTraps(L, part, wi, types, ctx = {}) {
  const fd = coreDist(L, part, wi), { load, n } = flowLoad(L, part, wi, fd);
  const taken = (ctx.taken || []).slice(), out = [];
  for (const type of types) {
    const cands = trapCandidates(L, part, wi, type, { ...ctx, taken });
    let best = null, bs = -1e9;
    for (const pl of cands) {
      const mid = pl.cells[Math.floor(pl.cells.length / 2)], i = L.idx(mid[0], mid[1]), d = fd[i] < 0 ? 30 : fd[i];
      const share = n ? Math.max(...pl.cells.map(([x, z]) => load[L.idx(x, z)])) / n : 0;
      const s = share * 60 - Math.abs(d - 6) * 0.4 + ((mid[0] * 7 + mid[1] * 13) % 5) * 0.01;
      if (s > bs) { bs = s; best = { ...pl, share: Math.round(share * 100) / 100 }; }
    }
    if (best) { taken.push(best); out.push({ ...best, onRoute: best.share >= 0.25 }); } else out.push(null);
  }
  return out;
}
/** the layout-independent list of trap types a zone's stored defences stand for (stable order) */
export function trapWants(st) {
  const out = [];
  for (const id of Z.TRAP_DEF_IDS) for (let i = 0; i < ((st?.d || {})[id] | 0); i++) out.push(Z.DEFS[id].trap);
  return out;
}

// ================================================================================================ 2. outdoor placement
export const snapPiece = (core, wx, wz, r) => ({ gx: Math.round((wx - core.x) / Z.WALL.fc), gz: Math.round((wz - core.z) / Z.WALL.fc), r: r ? 1 : 0 });
/** oriented box of a wall / gate piece (siege_core inBox convention: yaw 0 = long side along x) */
export function pieceBox(core, p) {
  const [k, gx, gz, r] = p, W = Z.WALL;
  return { x: core.x + gx * W.fc, z: core.z + gz * W.fc, hx: W.len / 2, hz: W.thick / 2, yaw: r ? Math.PI / 2 : 0, kind: k, cost: W.flowCost[k] };
}
const aabb = (b, shrinkL, shrinkT) => { const r = b.yaw ? [b.hz - shrinkT, b.hx - shrinkL] : [b.hx - shrinkL, b.hz - shrinkT]; return [b.x - r[0], b.x + r[0], b.z - r[1], b.z + r[1]]; };
const overlap = (a, b) => a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];
/**
 * Validate one wall piece. ctx = { core, zoneR, ter: { heightAt, flood, blocked?, playHalf }, cores: [{x, z}], obstacles: [{x, z, r}] (rocks / trees),
 * circles: [{x, z, r}] (deployables), solid?: (x, y, z, hx, hy, hz) => bool (the physics world), existing: [[k, gx, gz, r], ...] (the zone's other pieces), cap }
 * Returns { ok, why, y } (y = the highest ground under the piece).
 */
export function validateWall(ctx, p, opts = {}) {
  const W = Z.WALL, core = ctx.core, ter = ctx.ter;
  if (!p || (p[0] !== 0 && p[0] !== 1) || !Number.isInteger(p[1]) || !Number.isInteger(p[2])) return { ok: false, why: 'Not a valid piece.' };
  const b = pieceBox(core, p), zr = ctx.zoneR ?? Z.ZN.zoneR;
  const dc = Math.hypot(b.x - core.x, b.z - core.z);
  if (dc < W.minCore) return { ok: false, why: 'Too close to the core.' };
  if (dc > zr - 1) return { ok: false, why: 'Outside the zone.' };
  for (const c of ctx.cores || []) if (Math.hypot(c.x - b.x, c.z - b.z) < W.coreClear + b.hx * 0.4 && !(c.x === core.x && c.z === core.z)) return { ok: false, why: 'Too close to another core.' };
  const lim = (ter?.playHalf ?? 130) - 4;
  const pts = [-1, -0.5, 0, 0.5, 1].map((t) => { const l = t * b.hx; return b.yaw ? { x: b.x, z: b.z + l } : { x: b.x + l, z: b.z }; });
  let lo = Infinity, hi = -Infinity;
  for (const q of pts) {
    if (Math.abs(q.x) > lim || Math.abs(q.z) > lim) return { ok: false, why: 'Outside the map.' };
    if (distToHull(q.x, q.z) < W.shipKeep) return { ok: false, why: 'Too close to the ship.' };
    if (Math.abs(q.x - DOOR.x) < 2.8 && q.z > HULL.z1 - 1 && q.z < 12) return { ok: false, why: 'Keep the ship door clear.' };
    if (!ter) continue;
    const h = ter.heightAt(q.x, q.z);
    if (ter.flood != null && h < ter.flood + 0.3) return { ok: false, why: 'Water: nothing stands here.' };
    if (ter.blocked?.(q.x, q.z, 0.8)) return { ok: false, why: 'Unsafe ground.' };
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  if (ter) {
    if (hi - lo > W.maxSlope) return { ok: false, why: 'Too steep or uneven.' };
    const off = 0.9, a = b.yaw ? [off, 0] : [0, off];
    if (Math.abs(ter.heightAt(b.x + a[0], b.z + a[1]) - ter.heightAt(b.x - a[0], b.z - a[1])) > 0.9) return { ok: false, why: 'Too steep or uneven.' };
  }
  for (const o of ctx.obstacles || []) if (inBox(o.x, o.z, b, o.r + 0.25)) return { ok: false, why: 'Blocked by a rock or tree.' };
  for (const o of ctx.circles || []) if (inBox(o.x, o.z, b, o.r + 0.2)) return { ok: false, why: 'Too close to another defence.' };
  for (const o of ctx.people || []) if (inBox(o.x, o.z, b, 1.0)) return { ok: false, why: 'Someone is in the way.' };
  const me = aabb(b, 0.2, 0.08);
  for (const q of ctx.existing || []) {
    if (opts.ignore && q[1] === opts.ignore[1] && q[2] === opts.ignore[2] && q[3] === opts.ignore[3]) continue;
    if (overlap(me, aabb(pieceBox(core, q), 0.2, 0.08))) return { ok: false, why: 'Already a piece here.' };
  }
  const y = ter ? hi : 0;
  if (ctx.solid) for (const q of pts.filter((_, i) => i % 2 === 0)) if (ctx.solid(q.x, y + 1.0, q.z, b.yaw ? 0.3 : 0.6, 0.6, b.yaw ? 0.6 : 0.3)) return { ok: false, why: 'Blocked by something.' };
  if (!opts.noCap && (ctx.existing || []).length >= (ctx.cap ?? 1e9)) return { ok: false, why: 'No free wall slots: upgrade the zone.' };
  return { ok: true, why: '', y };
}
/** the pieces of a stored list that still fit on this landing's terrain (in order; a piece is checked against the ones kept before it) */
export function fitWalls(ctx, list) {
  const kept = [], dropped = [];
  for (const p of list || []) {
    const v = validateWall({ ...ctx, existing: kept, cap: 1e9 }, p, { noCap: true });
    if (v.ok) kept.push(p); else dropped.push({ p, why: v.why });
  }
  return { kept, dropped };
}
/** line of n pieces perpendicular to the facing, centred where the player aims (2 grid units = one piece length apart) */
export function wallLine(core, wx, wz, yaw, n, gate = -1) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), r = Math.abs(fx) > Math.abs(fz) ? 1 : 0;   // facing mostly along x -> the wall runs along z
  const out = [];
  const base = snapPiece(core, wx, wz, r);
  for (let k = 0; k < n; k++) {
    const o = (k - (n - 1) / 2) * 2, gx = base.gx + (r ? 0 : Math.round(o)), gz = base.gz + (r ? Math.round(o) : 0);
    out.push([k === gate ? 1 : 0, gx, gz, r]);
  }
  return out;
}

/** candidate positions of ring defence number k of a zone: the v1 spiral first, then wider / rotated retries (all inside the zone radius) */
export function ringSpots(core, key, k, outer, tries = 18) {
  const base = (hashString(key) % 628) / 100, a0 = base + k * 2.399, out = [];
  for (let t = 0; t < tries; t++) {
    const a = a0 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.62, rad = clamp((outer ? 9.5 + (k % 3) * 1.4 : 4.5 + (k % 3) * 1.3) + (t >> 1) * 0.7 * (t % 3 ? 1 : -1), 4, Z.ZN.zoneR - 3);
    out.push({ x: core.x + Math.cos(a) * rad, z: core.z + Math.sin(a) * rad, yaw: a + Math.PI });
  }
  return out;
}
/** can a ring defence of radius r stand at (x, z)? ctx as validateWall + walls: [pieceBox] + placed: [{x, z, r}] */
export function checkSpot(ctx, x, z, r = 0.6) {
  const ter = ctx.ter, lim = (ter?.playHalf ?? 130) - 4;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return { ok: false, why: 'Outside the map.' };
  if (distToHull(x, z) < 2.6) return { ok: false, why: 'Too close to the ship.' };
  if (Math.abs(x - DOOR.x) < 3 && z > HULL.z1 - 1 && z < 12) return { ok: false, why: 'Keep the ship door clear.' };
  if (Math.hypot(x - ctx.core.x, z - ctx.core.z) < 3.2) return { ok: false, why: 'Too close to the core.' };
  for (const c of ctx.cores || []) if ((c.x !== ctx.core.x || c.z !== ctx.core.z) && Math.hypot(c.x - x, c.z - z) < 4) return { ok: false, why: 'Too close to another core.' };
  let y = 0;
  if (ter) {
    const h = ter.heightAt(x, z); y = h;
    if (ter.flood != null && h < ter.flood + 0.35) return { ok: false, why: 'Water: nothing stands here.' };
    if (ter.blocked?.(x, z, 1)) return { ok: false, why: 'Unsafe ground.' };
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (Math.abs(ter.heightAt(x + dx, z + dz) - h) > 1.5) return { ok: false, why: 'Too steep or uneven.' };
  }
  for (const o of ctx.obstacles || []) if (Math.hypot(o.x - x, o.z - z) < o.r + r + 0.25) return { ok: false, why: 'Blocked by a rock or tree.' };
  for (const o of ctx.placed || []) if (Math.hypot(o.x - x, o.z - z) < o.r + r + 0.3) return { ok: false, why: 'Too close to another defence.' };
  for (const b of ctx.walls || []) if (inBox(x, z, b, r + 0.35)) return { ok: false, why: 'Blocked by a wall.' };
  if (ctx.solid && ctx.solid(x, y + 0.9, z, r + 0.2, 0.5, r + 0.2)) return { ok: false, why: 'Blocked by something.' };
  return { ok: true, why: '', y };
}
/** rocks / trees of an outdoor build (world.outdoor.harvest) as circles */
export function obstaclesOf(outdoor) {
  const out = [];
  const add = (list, base) => { for (const p of list || []) if (p && Number.isFinite(p.x)) out.push({ x: p.x, z: p.z, r: base * (p.scale || 1) }); };
  add(outdoor?.harvest?.trees, 0.55); add(outdoor?.harvest?.rocks, 1.0);
  return out;
}

// ================================================================================================ 3. raider pathing
/** flow field whose goal is the zone core (radius R). blockers: [{x, z, hx, hz, yaw, cost}] (deployables + walls). Reuses the siege FlowField (crossing costs, not walls). */
export function coreFlow(half, core, blockers, R = 3.4) {
  const f = new FlowField(half, 2);
  f.goal.fill(0);
  for (let i = 0; i < f.n * f.n; i++) {
    const c = f.center(i);
    if (!f.block[i] && Math.hypot(c.x - core.x, c.z - core.z) <= R) f.goal[i] = 1;
  }
  const all = blockers || [], gates = all.filter((b) => b.open);
  f.setBlockers(all);
  // a gate is an OPENING: the padding of the walls next to it must not close it on the coarse 2 m grid, so its cells cost only the gate's own (low) price
  for (const g of gates) for (let i = 0; i < f.n * f.n; i++) { const c = f.center(i); if (inBox(c.x, c.z, g, 1.0)) f.pen[i] = g.cost; }
  f.compute();
  return f;
}
/**
 * one raider step (mutates pos): unit direction dir, distance step, body radius. solid = boxes the raider cannot enter (barricades, wall pieces; gates are not solid).
 * Returns null when it moved, { blocked: box } when a box is in the way (the caller attacks it), { blocked: 'ship' } at the hull.
 */
export function moveRaider(pos, dir, step, radius, solid) {
  const hit = (nx, nz) => {
    if (distToHull(nx, nz) < 0.9) return 'ship';
    for (const b of solid || []) if (inBox(nx, nz, b, radius) && !inBox(pos.x, pos.z, b, radius)) return b;
    return null;
  };
  const nx = pos.x + dir.x * step, nz = pos.z + dir.z * step, h = hit(nx, nz);
  if (!h) { pos.x = nx; pos.z = nz; return null; }
  // slide along a wall when a good part of the heading runs along it (walks round corners and into a gate opening); a head-on push stays blocked (= attack it)
  for (const [sx, sz] of Math.abs(dir.x) >= Math.abs(dir.z) ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]]) {
    const c = sx ? dir.x : dir.z;
    if (Math.abs(c) < 0.35 || (sx ? hit(pos.x + dir.x * step, pos.z) : hit(pos.x, pos.z + dir.z * step))) continue;
    if (sx) pos.x += dir.x * step; else pos.z += dir.z * step;
    return null;
  }
  return { blocked: h };
}
/** blockers of a zone's walls for the flow field (all) and the physical test (solid walls only); dead = Set of breached piece indices */
export function wallBlockers(core, pieces, dead = null) {
  const flow = [], solid = [];
  (pieces || []).forEach((p, i) => {
    if (dead?.has(i)) return;
    const b = pieceBox(core, p);
    const e = { ...b, id: 'w' + i, wall: i, type: p[0] ? 'gate' : 'wall', open: p[0] === 1, hp: Z.WALL.hp[p[0]] };
    flow.push(e); if (p[0] === 0) solid.push(e);
  });
  return { flow, solid };
}

// ================================================================================================ 4. archive (generated sectors rotate; owned zones must survive it)
export const ARCH_MAX = 24;
/** compact record of a moon: enough to rebuild its zone spec + income (zoneSpec reads id / size / mapScale / tier, income reads tier / biome) */
export function archiveRecord(moon, qi = 0) {
  return { n: String(moon.name || moon.id).slice(0, 40), t: moon.tier | 0 || 1, b: String(moon.biome || 'hills'), s: +(+moon.size || 1).toFixed(2), ms: +(+moon.mapScale || 1).toFixed(2), q: qi | 0 };
}
export function archiveMoon(zn, moon, qi = 0) {
  if (!zn || !moon?.id) return false;
  if (!zn.arch || typeof zn.arch !== 'object') zn.arch = {};
  const rec = archiveRecord(moon, qi), old = zn.arch[moon.id];
  if (old && JSON.stringify(old) === JSON.stringify({ ...rec, q: old.q })) return false;
  zn.arch[moon.id] = { ...rec, q: old ? old.q : rec.q };
  return true;
}
/** the moon-like object a record stands for (`arch` = away: cannot be landed on, still pays and can be attacked) */
export function archivedMoon(zn, id) {
  const a = zn?.arch?.[id];
  return a ? { id, name: a.n, tier: a.t, biome: a.b, size: a.s, mapScale: a.ms, arch: true, generated: true } : null;
}
/** drop records nobody owns any more, then the oldest beyond the cap */
export function pruneArchive(zn, max = ARCH_MAX) {
  if (!zn?.arch) return 0;
  let n = 0;
  for (const id of Object.keys(zn.arch)) if (!zn.m?.[id]) { delete zn.arch[id]; n++; }
  const ids = Object.keys(zn.arch);
  if (ids.length > max) for (const id of ids.sort((a, b) => zn.arch[a].q - zn.arch[b].q).slice(0, ids.length - max)) { delete zn.arch[id]; n++; }
  return n;
}
