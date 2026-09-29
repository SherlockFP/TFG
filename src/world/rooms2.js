// MAPS2 rooms (wave 2): extra room types injected into every interior theme.
//   STORY rooms      party / laststand / nursery / shrine / flooded   (environmental storytelling + one readable note)
//   CHALLENGE rooms  physics / gamble / arena / puzzle / treasure     (0-1 per facility, telegraphed by a sign)
//   LIMINAL rooms    triangle                                           (slanted wall, half of the room walled off)
// Everything is DETERMINISTIC (own RNG fork of the layout seed, planned AFTER the normal layout so an off-switch
// (globalThis.__kefalM2Off) reproduces the old facility exactly) and cheap: merged GeoBuilder geometry + props that
// merge with the facility statics. The retyped rooms keep their cells / doors, so the node path test stays green.
//   planMaps2(L)              pure: called at the end of generateLayout, sets L.m2 + retypes rooms
//   installRoomStyles2(THEMES) adds the 'm2_*' room styles to every theme table
//   buildRooms2(ctx)          geometry + props + spot lists (fac.m2) for the runtime module src/game/maps2.js
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { t } from '../core/i18n.js';
import { G } from '../physics/physics.js';
import { layoutKit, SPECIAL_ROOMS, WALL_ROT, INWARD, DX, DZ, navClear, surfacePlane } from './interiors/common.js';
import { SIZE2 } from '../models/props2.js';

const HP = Math.PI / 2;
export const M2_STORY = ['party', 'laststand', 'nursery', 'shrine', 'flooded'];
export const M2_CHALLENGE = ['physics', 'gamble', 'arena', 'puzzle', 'treasure'];
export const M2_LIMINAL = ['triangle'];
/** Challenge rooms are BUILT but their runtime (levers / waves / gambling, src/game/maps2.js) is not finished: off by default. */
export const M2_CHALLENGE_ON = false;
export const M2_IDS = [...M2_STORY, ...M2_CHALLENGE, ...M2_LIMINAL];
export const M2_TYPES = M2_IDS.map((i) => 'm2_' + i);
for (const ty of M2_TYPES) SPECIAL_ROOMS.add(ty);   // facsys / hazards / setpieces leave these rooms alone

const M2_STYLE = {
  m2_party: { floor: 'carpet_red', wall: 'wallpaper_yellow', ceil: 'ceiling_tiles', lamp: 'wall_lamp' },
  m2_laststand: { floor: 'concrete_stained', wall: 'concrete', ceil: 'metal_dark', lamp: 'fluorescent' },
  m2_nursery: { floor: 'tiles_mint', wall: 'wallpaper_yellow', ceil: 'ceiling_tiles', lamp: 'wall_lamp' },
  m2_shrine: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', lamp: null },
  m2_flooded: { floor: 'tiles_checker', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent' },
  m2_physics: { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp' },
  m2_gamble: { floor: 'carpet_red', wall: 'wallpaper_damask', ceil: 'wood_dark', lamp: 'wall_lamp' },
  m2_arena: { floor: 'concrete_dark', wall: 'metal_rust', ceil: 'metal_dark', lamp: 'ceiling_lamp' },
  m2_puzzle: { floor: 'tiles_white', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent' },
  m2_treasure: { floor: 'marble', wall: 'wallpaper_damask', ceil: 'wood_dark', lamp: 'wall_lamp' },
  m2_triangle: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'fluorescent' },
};
/** add the m2 room styles to every theme table ({ rooms: { type: style } }) - a light touch, existing types are untouched */
export function installRoomStyles2(THEMES) {
  for (const th of Object.values(THEMES)) {
    if (!th?.rooms) continue;
    for (const [ty, st] of Object.entries(M2_STYLE)) if (!th.rooms[ty]) th.rooms[ty] = { ...st, wall_: [], clutter: [], center: [], posters: 0 };
  }
}

// which vignettes suit which theme (weights)
const STORY_W = {
  factory: { party: 1, laststand: 3, nursery: 0.5, shrine: 1, flooded: 2 }, mansion: { party: 3, laststand: 1, nursery: 3, shrine: 0.5, flooded: 1 },
  mineshaft: { party: 1, laststand: 3, nursery: 1, shrine: 0.5, flooded: 2 }, office: { party: 3, laststand: 3, nursery: 0.5, shrine: 2, flooded: 1 },
  backrooms: { party: 3, laststand: 1, nursery: 2, shrine: 1, flooded: 1 }, serverfarm: { party: 1, laststand: 2, nursery: 0.3, shrine: 4, flooded: 1 },
  sewer: { party: 1, laststand: 2, nursery: 1, shrine: 1, flooded: 3 }, hospital: { party: 1, laststand: 2, nursery: 4, shrine: 1, flooded: 1 },
};

// ---------------------------------------------------------------------------------------------- planning (pure)
function decodeEdge(L, key) { const dir = key & 1, ci = key >> 1; return { x: ci % L.w, z: (ci / L.w) | 0, dir }; }

/** Non-bridge edges of the walkable graph (locked doors / vaults are walls): sealing ONE of them never disconnects anything. */
export function safeEdgeSet(L) {
  const W = L.w, H = L.h, N = W * H;
  const blocks = (inf) => !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked));
  const disc = new Int32Array(N).fill(-1), low = new Int32Array(N), it = new Uint8Array(N), parent = new Int32Array(N).fill(-1), pkey = new Int32Array(N).fill(-1);
  const bridges = new Set(), all = new Set(), stack = [];
  const start = L.idx(L.entrance.room.cx, L.entrance.room.cz);
  let timer = 0;
  disc[start] = low[start] = timer++;
  stack.push(start);
  while (stack.length) {
    const u = stack[stack.length - 1];
    if (it[u] < 4) {
      const d = it[u]++, x = u % W, z = (u / W) | 0, nx = x + DX[d], nz = z + DZ[d];
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const v = nz * W + nx, k = L.edgeKey(x, z, d);
      if (!L.cells[v] || !L.open.has(k) || blocks(L.edgeInfo.get(k))) continue;
      all.add(k);
      if (k === pkey[u]) continue;
      if (disc[v] < 0) { parent[v] = u; pkey[v] = k; disc[v] = low[v] = timer++; stack.push(v); } else if (disc[v] < low[u]) low[u] = disc[v];
    } else {
      stack.pop();
      const p = parent[u];
      if (p >= 0) { if (low[u] < low[p]) low[p] = low[u]; if (low[u] > disc[p]) bridges.add(pkey[u]); }
    }
  }
  const safe = new Set();
  for (const k of all) if (!bridges.has(k)) safe.add(k);
  return safe;
}

const sd = (a, b, p) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
function linkPoint(L, K, key) {
  const e = decodeEdge(L, key);
  return e.dir === 0 ? [K.wx(e.x + 1), K.wz(e.z) + L.cell / 2] : [K.wx(e.x) + L.cell / 2, K.wz(e.z + 1)];
}
/** a diagonal (corner to corner) that keeps every doorway of the room on one side, or null */
function triangleFor(L, K, r) {
  const rc = K.roomRect(r);
  const pts = r.linkKeys.map((k) => linkPoint(L, K, k));
  const diags = [[[rc.x0, rc.z0], [rc.x1, rc.z1]], [[rc.x1, rc.z0], [rc.x0, rc.z1]]];
  for (const [a, b] of diags) for (const side of [1, -1]) if (pts.every((p) => side * sd(a, b, p) > 1.7)) return { a, b, side };
  return null;
}

/** Retype a few rooms of a freshly generated layout. Sets L.m2 = { rooms, challenge, safe, seed } (or null). */
export function planMaps2(L) {
  L.m2 = null;
  if (globalThis.__kefalM2Off) return null;
  const rng = new RNG((L.seed ^ 0x3a92c1) >>> 0);
  const K = layoutKit(L);
  const safe = safeEdgeSet(L);
  const size = L.size || 1;
  // the boss lair (largest ordinary room) stays as it is
  let lair = null, bs = -1;
  for (const r of L.rooms) {
    if (r.type === 'entrance' || r.type === 'vault' || r.type === 'generator') continue;
    const sc = r.w * r.h * 1000 + Math.max(0, L.distOf[L.idx(r.cx, r.cz)] || 0);
    if (sc > bs) { bs = sc; lair = r; }
  }
  const ordinary = (r) => !SPECIAL_ROOMS.has(r.type) && !r.treasure && !r.arena && !r.maze;
  const facUsable = L.rooms.filter((r) => ordinary(r) && r.w * r.h >= 4).length;
  let budget = Math.min(5, Math.max(0, facUsable - 9));   // facsys needs >= 9 ordinary rooms for its panels / notes
  const pool = rng.shuffle(L.rooms.filter((r) => ordinary(r) && !r.hub && r.type !== 'nest' && r !== lair && r.w * r.h >= 4 && r.links >= 1));
  const take = (fit) => { const i = pool.findIndex(fit); return i < 0 ? null : pool.splice(i, 1)[0]; };
  const safeLinks = (r) => r.linkKeys.filter((k) => safe.has(k));
  const rooms = [];
  let challenge = null;
  const assign = (r, kind, id, extra) => {
    r.m2 = { kind, id, ...(extra || {}) };
    r.type = 'm2_' + id;
    if (kind === 'challenge') r.m2ch = true;
    rooms.push({ room: r.id, type: r.type, kind, id });
    budget--;
  };
  // 1) one challenge room (rare)
  const pCh = size < 0.8 ? 0.3 : size < 1.5 ? 0.45 : 0.6;
  if (M2_CHALLENGE_ON && budget > 0 && rng.chance(pCh)) {
    const fit = {
      physics: (r) => r.w * r.h >= 6 && Math.min(r.w, r.h) >= 2,
      gamble: (r) => r.w * r.h >= 4,
      arena: (r) => r.w * r.h >= 9 && Math.min(r.w, r.h) >= 2 && r.links <= 4,
      puzzle: (r) => Math.max(r.w, r.h) >= 3 && r.w * r.h >= 6,
      treasure: (r) => r.links >= 2 && safeLinks(r).length >= 1,
    };
    const order = rng.shuffle(M2_CHALLENGE.map((id) => ({ id })));
    for (const { id } of order) {
      const r = take(fit[id]);
      if (!r) continue;
      assign(r, 'challenge', id);
      challenge = { room: r.id, id, seq: [0, 1, 2, 3].map(() => rng.int(0, 3)) };
      if (id === 'treasure') challenge.seals = safeLinks(r);
      break;
    }
  }
  // 2) a liminal room (rare)
  if (budget > 0 && rng.chance(size >= 1.2 ? 0.5 : 0.35)) {
    let tri = null;
    const r = take((q) => q.w * q.h >= 8 && (tri = triangleFor(L, K, q)));
    if (r) assign(r, 'liminal', 'triangle', { tri });
  }
  // 3) story rooms
  const nStory = size < 1.2 ? 1 : size < 2 ? 2 : 3;
  const W = STORY_W[L.theme] || STORY_W.factory;
  const kinds = M2_STORY.map((id) => ({ id, w: W[id] ?? 1 }));
  for (let i = 0; i < nStory && budget > 0 && kinds.length; i++) {
    const pick = rng.weighted(kinds);
    kinds.splice(kinds.indexOf(pick), 1);
    const r = take((q) => q.w * q.h >= 4);
    if (r) assign(r, 'story', pick.id);
  }
  if (!rooms.length) return null;
  L.m2 = { rooms, challenge, safe, seed: L.seed };
  return L.m2;
}

/** corridor edges (both cells corridors, not next to a room / door) that can be sealed without disconnecting anything */
export function corridorSealEdges(L) {
  const M = L.m2, safe = M?.safe || safeEdgeSet(L);
  const out = [];
  for (const k of safe) {
    const e = decodeEdge(L, k);
    const a = L.idx(e.x, e.z), b = e.dir === 0 ? L.idx(e.x + 1, e.z) : L.idx(e.x, e.z + 1);
    if (L.cells[a] !== 2 || L.cells[b] !== 2 || L.edgeInfo.has(k)) continue;
    if (L.distOf[a] < 3) continue;
    out.push(k);
  }
  return out.sort((p, q) => p - q);
}
/** sealable opening data (world coordinates) for an edge key */
export function sealInfo(L, K, key) {
  const e = decodeEdge(L, key), C = L.cell, inf = L.edgeInfo.get(key);
  const [x, z] = e.dir === 0 ? [K.wx(e.x + 1), K.wz(e.z) + C / 2] : [K.wx(e.x) + C / 2, K.wz(e.z + 1)];
  const a = L.idx(e.x, e.z), b = e.dir === 0 ? L.idx(e.x + 1, e.z) : L.idx(e.x, e.z + 1);
  const h = Math.min(L.heightOf[a] || 3.3, L.heightOf[b] || 3.3);
  return { key, x, z, dir: e.dir, w: inf ? inf.width : C, h: inf ? Math.min(inf.doorH, h) : h, y: L.y };
}

// ---------------------------------------------------------------------------------------------- building
function linkInfo(L, K, r, key) {
  const e = decodeEdge(L, key);
  const a = [e.x, e.z], b = [e.x + DX[e.dir], e.z + DZ[e.dir]];
  const aIn = L.roomOf[L.idx(a[0], a[1])] === r.id;
  const cell = aIn ? a : b, d = aIn ? e.dir : e.dir + 2;
  const [x, z] = K.edgeCenter(cell[0], cell[1], d);
  const inf = L.edgeInfo.get(key);
  return { key, cell, d, x, z, n: INWARD[d], w: inf?.width || L.cell, h: inf?.doorH || 3, type: inf?.type || 'arch' };
}

export function buildRooms2(ctx) {
  const L = ctx.layout, M = L.m2;
  if (!M) return null;
  const K = layoutKit(L), Y = ctx.Y, C = L.cell, rng = ctx.rng;
  const gb = new ctx.GeoBuilder();
  const out = { rooms: [], spots: [], seals: [], windows: null, switches: [], challenge: M.challenge, disposers: [], sealEdges: [] };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const em = (x, y, z, color, intensity, distance, flicker = 0) => { const e = { pos: V(x, y, z), color, intensity, distance, group: 'facility', flicker }; ctx.emitters.push(e); return e; };
  const col3 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const box = (key, x, y, z, sx, sy, sz, hex, block = true) => {
    gb.box(key, x, y, z, sx, sy, sz, 0.5, col3(hex));
    if (block) { ctx.addBox(x, y, z, sx, sy, sz); ctx.nav.blockBox(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 0.1); }
  };
  const flat = (key, x, z, sx, sz, y, hex) => gb.hrect(key, x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, y, true, 0.5, col3(hex));

  // per-room scene helper ---------------------------------------------------------------------------------
  function scene(r) {
    const rc = K.roomRect(r);
    const S = { r, rc, cx: (rc.x0 + rc.x1) / 2, cz: (rc.z0 + rc.z1) / 2, rw: rc.x1 - rc.x0, rd: rc.z1 - rc.z0, h: r.height };
    S.alongX = S.rw >= S.rd;
    S.doors = r.linkKeys.map((k) => linkInfo(L, K, r, k));
    S.walls = rng.shuffle(K.perimeter(r).filter((e) => !K.edgeBusy(e.x, e.z, e.d) && !K.cellHasDoorway(e.x, e.z)));
    S.clear = (x, z, hw, hd, gap = 1.9) => x - hw >= rc.x0 + 0.35 && x + hw <= rc.x1 - 0.35 && z - hd >= rc.z0 + 0.35 && z + hd <= rc.z1 - 0.35
      && navClear(ctx.nav, x - hw, z - hd, x + hw, z + hd, 0.12) && S.doors.every((d) => Math.hypot(d.x - x, d.z - z) > gap + Math.min(hw, hd) * 0.5);
    S.near = (tx, tz, hw, hd, gap) => {
      for (const rad of [0, 0.7, 1.4, 2.1, 2.8]) for (let a = 0; a < (rad ? 8 : 1); a++) {
        const x = tx + Math.cos(a * 0.785) * rad, z = tz + Math.sin(a * 0.785) * rad;
        if (S.clear(x, z, hw, hd, gap)) return [x, z];
      }
      return null;
    };
    S.put = (id, x, z, rot, opts, y = 0) => ctx.placeProp(id, x, Y + y, z, rot, opts || {});
    S.wall = (i, along = 0, o = 0.5) => {
      if (!S.walls.length) return null;
      const w = S.walls[i % S.walls.length], [px, pz] = K.wallPoint(w.x, w.z, w.d, along, o);
      return { x: px, z: pz, rot: WALL_ROT[w.d], d: w.d };
    };
    S.spot = (k, x, y, z, extra) => { const s = { k, room: r.id, x, y, z, ...(extra || {}) }; out.spots.push(s); return s; };
    S.sign = (lines, opt) => {
      const d = S.doors[0];
      if (!d) return;
      const [px, pz] = K.wallPoint(d.cell[0], d.cell[1], d.d, d.w / 2 + 0.95, 0.09);
      S.put('m2:sign', px, pz, WALL_ROT[d.d], { lines: lines.map(t), ...(opt || {}) }, 1.75);
    };
    S.note = (x, y, z, story) => S.spot('note', x, y, z, { story });
    out.rooms.push({ room: r.id, id: r.m2.id, kind: r.m2.kind, x0: rc.x0, z0: rc.z0, x1: rc.x1, z1: rc.z1, y: Y, h: r.height, cx: S.cx, cz: S.cz });
    return S;
  }
  const face = (fx, fz) => Math.atan2(fx, fz);
  /** local (lx, lz) of a prop placed at pos with yaw rot -> world [x, z] */
  const loc = (pos, rot, lx, lz) => [pos[0] + lx * Math.cos(rot) + lz * Math.sin(rot), pos[1] - lx * Math.sin(rot) + lz * Math.cos(rot)];

  // ------------------------------------------------------------------------------------ story rooms
  function party(S) {
    const rot = S.alongX ? 0 : HP;
    const tp = S.near(S.cx, S.cz, 1.3, 1.3, 1.6) || [S.cx, S.cz];
    S.put('m2:party_table', tp[0], tp[1], rot);
    const chairs = [];
    for (const u of [-0.6, 0.6]) for (const sgn of [-1, 1]) {
      const cx = tp[0] + (S.alongX ? u : sgn * 0.95), cz = tp[1] + (S.alongX ? sgn * 0.95 : u);
      const o = S.put('m2:chair', cx, cz, face(tp[0] - cx, tp[1] - cz));
      if (o) chairs.push([cx, cz]);
    }
    chairs.forEach(([x, z], i) => S.put('m2:balloons', x, z, 0, { h: 1.8 + (i % 2) * 0.4 }, 0.5));
    for (let i = 0; i < 2; i++) { const p = S.near(S.cx + rng.float(-3, 3), S.cz + rng.float(-3, 3), 0.4, 0.4); if (p) S.put('m2:balloons', p[0], p[1], 0, { h: 2.3 + rng.float(0, 0.5) }); }
    for (let i = 0; i < 3; i++) { const w = S.wall(i, rng.float(-1, 1), 0.6); if (w && S.clear(w.x, w.z, 0.3, 0.3, 1.6)) S.put('m2:gift', w.x, w.z, rng.float(0, 6)); }
    const b = S.wall(rng.int(0, 3), 0, 0.08);
    if (b) S.put('m2:banner', b.x, b.z, b.rot, { lines: [t('HAPPY'), t('BIRTHDAY')], w: 2.2 }, 2.05);
    for (let i = 0; i < 42; i++) flat('plain', tp[0] + rng.float(-2.4, 2.4), tp[1] + rng.float(-2.4, 2.4), 0.07, 0.07, Y + 0.013, [0xff4060, 0x40a0ff, 0xffd040, 0x50d070][i % 4]);
    S.put('m2:paper', tp[0] + 0.75, tp[1] + 0.32, 0.4, {}, 0.72);
    S.note(tp[0] + 0.75, Y + 0.9, tp[1] + 0.32, 'party');
    em(S.cx, Y + S.h - 0.5, S.cz, 0xffb070, 0.9, 11, 0.12);
  }
  function laststand(S) {
    const d = S.doors[0];
    let placed = false;
    if (d) for (const side of [1, -1]) {
      const tx = -d.n[1] * side, tz = d.n[0] * side;
      const x = d.x + d.n[0] * 2.4 + tx * 2.7, z = d.z + d.n[1] * 2.4 + tz * 2.7;
      const rot = Math.abs(d.n[0]) > 0.5 ? HP : 0;
      if (S.clear(x, z, 1.3, 0.6, 1.5)) { S.put('m2:barricade', x, z, rot); placed = true; break; }
    }
    void placed;
    for (let i = 0; i < 2; i++) { const p = S.near(S.cx + rng.float(-3, 3), S.cz + rng.float(-3, 3), 0.5, 1.0, 1.8); if (p) S.put('m2:bedroll', p[0], p[1], rng.float(0, 3)); }
    const w = S.wall(0, 0, 0.9);
    if (w) S.put('m2:tally', w.x, w.z, w.rot, { lines: [t('DAY 9'), '|||| |||| ||'] });
    const dw = S.wall(1, 0, 0.55);
    let noteAt = null;
    if (dw && S.clear(dw.x, dw.z, 0.9, 0.5, 1.6)) { S.put('desk', dw.x, dw.z, dw.rot); S.put('m2:paper', dw.x, dw.z, 0.2, {}, 0.78); noteAt = [dw.x, dw.z]; }
    if (!noteAt) { const p = S.near(S.cx, S.cz, 0.3, 0.3); if (p) { S.put('m2:paper', p[0], p[1], 0.2); noteAt = p; } }
    const rw = S.wall(2, 0, 0.5);
    if (rw && S.clear(rw.x, rw.z, 0.4, 0.4, 1.6)) S.put('m2:radio', rw.x, rw.z, rw.rot);
    const cb = S.wall(3, 0.5, 0.6);
    if (cb && S.clear(cb.x, cb.z, 0.5, 0.5, 1.6)) S.put('cardboard_boxes', cb.x, cb.z, cb.rot);
    for (let i = 0; i < 2; i++) flat('tex:blood_splat', S.cx + rng.float(-2.5, 2.5), S.cz + rng.float(-2.5, 2.5), 1.3, 1.3, Y + 0.015, 0xffffff);
    if (noteAt) S.note(noteAt[0], Y + 0.9, noteAt[1], 'laststand');
    em(S.cx, Y + S.h - 0.6, S.cz, 0xff4030, 0.35, 8, 0.4);
  }
  function nursery(S) {
    for (let i = 0; i < 2; i++) {
      const w = S.wall(i, i ? 1 : -1, 0.8);
      if (w && S.clear(w.x, w.z, 0.5, 0.75, 1.6)) S.put('m2:crib', w.x, w.z, w.rot);
    }
    const dw = S.wall(2, 0, 0.45);
    if (dw && S.clear(dw.x, dw.z, 0.55, 0.35, 1.6)) {
      S.put('m2:dresser', dw.x, dw.z, dw.rot);
      S.put('m2:music_box', dw.x, dw.z, dw.rot, {}, 0.85);
      S.spot('musicbox', dw.x, Y + 1.0, dw.z);
      const pp = loc([dw.x, dw.z], dw.rot, 0.3, 0);
      S.put('m2:paper', pp[0], pp[1], 0.7, {}, 0.86);
      S.note(dw.x, Y + 1.0, dw.z, 'nursery');
    }
    const rk = S.near(S.cx + rng.float(-2, 2), S.cz + rng.float(-2, 2), 0.5, 0.6, 1.8);
    if (rk) S.put('m2:rocker', rk[0], rk[1], rng.float(0, 6));
    for (let i = 0; i < 4; i++) S.put('m2:blocks', S.cx + rng.float(-3, 3), S.cz + rng.float(-3, 3), rng.float(0, 6));
    const b = S.wall(3, 0, 0.08);
    if (b) S.put('m2:banner', b.x, b.z, b.rot, { lines: ['B A B Y'], w: 1.6, hh: 0.45, bg: '#a8d8e8', fg: '#ff60a0', font: 26 }, 1.9);
    em(S.cx, Y + S.h - 0.5, S.cz, 0xffd0e8, 0.85, 10, 0);
  }
  function shrine(S) {
    const w = S.wall(0, 0, 1.0);
    const pos = w ? S.near(w.x, w.z, 1.0, 1.0, 2.0) : S.near(S.cx, S.cz, 1.0, 1.0);
    let noteAt = null;
    if (pos && w) {
      S.put('m2:stream_desk', pos[0], pos[1], w.rot);
      const pp = loc(pos, w.rot, 0.55, 0.25);
      S.put('m2:paper', pp[0], pp[1], 0.3, {}, 0.78);
      noteAt = pp;
      for (const s of [-1.5, 1.5]) { const cx = pos[0] + (w.d % 2 ? s : 0), cz = pos[1] + (w.d % 2 ? 0 : s); if (S.clear(cx, cz, 0.3, 0.3, 1.5)) S.put('m2:candles', cx, cz, 0); }
    }
    for (let i = 1; i < 4; i++) { const r2 = S.wall(i, rng.float(-0.8, 0.8), 0.45); if (r2 && S.clear(r2.x, r2.z, 0.5, 0.4, 1.6)) S.put('server_rack_prop', r2.x, r2.z, r2.rot); }
    const bn = S.wall(4, 0, 0.08);
    if (bn) S.put('m2:banner', bn.x, bn.z, bn.rot, { lines: [t('THANKS FOR'), t('10 YEARS')], w: 2.0, bg: '#301050', fg: '#ff60ff' }, 2.0);
    if (noteAt) S.note(noteAt[0], Y + 0.95, noteAt[1], 'shrine');
    em(S.cx, Y + 2.2, S.cz, 0x8060ff, 0.6, 9, 0.2);
  }
  function flooded(S) {
    const wy = Y + 0.3;
    const rc = S.rc, ins = 0.35;
    surfacePlane(ctx.group, ctx.levelMaterial, 'water', { x0: rc.x0 + ins, z0: rc.z0 + ins, x1: rc.x1 - ins, z1: rc.z1 - ins }, wy, { opacity: 0.72, color: 0x9fd8c8 });
    ctx.zones.push({ type: 'water', min: [rc.x0 + ins, rc.z0 + ins], max: [rc.x1 - ins, rc.z1 - ins], y: wy, room: S.r.id });
    for (let i = 0; i < 4; i++) S.put('m2:float_chair', S.cx + rng.float(-S.rw / 2 + 1, S.rw / 2 - 1), S.cz + rng.float(-S.rd / 2 + 1, S.rd / 2 - 1), 0, {}, 0.22);
    for (let i = 0; i < 3; i++) S.put('m2:debris', S.cx + rng.float(-S.rw / 2 + 1, S.rw / 2 - 1), S.cz + rng.float(-S.rd / 2 + 1, S.rd / 2 - 1), rng.float(0, 6), {}, 0.3);
    const tp = S.near(S.cx, S.cz, 1.0, 0.7, 1.8);
    let noteAt = null;
    if (tp) { S.put('table', tp[0], tp[1], S.alongX ? 0 : HP); S.put('m2:paper', tp[0], tp[1], 0.5, {}, 0.8); noteAt = tp; }
    const vw = S.wall(0, 0, 0.6);
    if (vw && S.clear(vw.x, vw.z, 0.55, 0.45, 1.6)) S.put('vending_machine', vw.x, vw.z, vw.rot);
    if (noteAt) S.note(noteAt[0], Y + 0.95, noteAt[1], 'flooded');
    em(S.cx, Y + S.h - 0.6, S.cz, 0x70e0b0, 0.6, 9, 0.15);
  }

  // ------------------------------------------------------------------------------------ challenge rooms
  const farthest = (S, from, hw, hd, minGap = 2.5) => {
    let best = null;
    for (let x = S.rc.x0 + 1.6; x <= S.rc.x1 - 1.6; x += 1) for (let z = S.rc.z0 + 1.6; z <= S.rc.z1 - 1.6; z += 1) {
      if (!S.clear(x, z, hw, hd, minGap)) continue;
      const d = Math.hypot(x - from[0], z - from[1]);
      if (!best || d > best.d) best = { x, z, d };
    }
    return best;
  };
  function physics(S) {
    const d0 = S.doors[0] || { x: S.cx, z: S.cz, n: [0, 1] };
    const plate = farthest(S, [d0.x, d0.z], 1.15, 1.15);
    const padP = S.near(d0.x + d0.n[0] * 4, d0.z + d0.n[1] * 4, 0.7, 0.7, 2.4);
    if (!plate || !padP) { out.rooms[out.rooms.length - 1].failed = true; return; }
    S.put('m2:plate', plate.x, plate.z, 0);
    for (const [ox, oz, sx, sz] of [[0, 0.65, 1.4, 0.08], [0, -0.65, 1.4, 0.08], [0.65, 0, 0.08, 1.4], [-0.65, 0, 0.08, 1.4]]) flat('plain', padP[0] + ox, padP[1] + oz, sx, sz, Y + 0.014, 0xffd030);
    S.spot('plate', plate.x, Y + 0.1, plate.z, { r: 1.05 });
    S.spot('pad', padP[0], Y + 0.3, padP[1]);
    S.sign(['PHYSICS TEST', 'WEIGHT > PLATE']);
    em(plate.x, Y + 2.5, plate.z, 0xff8060, 0.8, 9, 0);
    em(S.cx, Y + S.h - 0.5, S.cz, 0xffffff, 0.5, 12, 0.08);
  }
  function gamble(S) {
    const wi = S.wall(0, 0, 0.7);
    if (wi) for (const a of [-1.3, 0, 1.3]) { const [px, pz] = K.wallPoint(S.walls[0].x, S.walls[0].z, S.walls[0].d, a, 0.65); if (S.clear(px, pz, 0.5, 0.45, 1.8)) S.put('slot_machine', px, pz, wi.rot); }
    const lp = S.near(S.cx, S.cz, 0.6, 0.6, 2.0) || [S.cx, S.cz];
    const d0 = S.doors[0];
    S.put('m2:fate_lever', lp[0], lp[1], d0 ? face(d0.x - lp[0], d0.z - lp[1]) : 0);
    S.spot('lever', lp[0], Y + 1.3, lp[1], { arm: true });
    S.sign(['FATE ROULETTE', 'THE HOUSE WINS?'], { fg: '#ff80ff', bg: '#180418', border: '#ffd030' });
    em(lp[0], Y + 2.4, lp[1], 0xff60ff, 0.9, 10, 0.1);
    em(S.cx, Y + S.h - 0.6, S.cz, 0xffc040, 0.6, 11, 0.2);
  }
  function arena(S) {
    let cp = null;
    const d0 = S.doors[0];
    if (d0) { const [px, pz] = K.wallPoint(d0.cell[0], d0.cell[1], d0.d, d0.w / 2 + 1.9, 0.5); if (S.clear(px, pz, 0.7, 0.4, 1.4)) cp = { x: px, z: pz, rot: WALL_ROT[d0.d] }; }
    if (!cp) { const w = S.wall(0, 0, 0.5); if (w) cp = w; }
    if (cp) { S.put('m2:arena_console', cp.x, cp.z, cp.rot); S.spot('console', cp.x, Y + 1.1, cp.z); }
    const rad = Math.max(2, Math.min(S.rw, S.rd) / 2 - 1.7);
    let n = 0;
    for (let a = 0; a < 12 && n < 5; a++) {
      const x = S.cx + Math.cos(a * 0.5236 * 1.0 + 0.3) * rad * (a % 2 ? 1 : 0.7), z = S.cz + Math.sin(a * 0.5236 + 0.3) * rad * (a % 2 ? 1 : 0.7);
      if (S.clear(x, z, 0.6, 0.6, 2.2)) { S.spot('spawn', x, Y + 0.1, z); n++; }
    }
    S.spot('reward', S.cx, Y, S.cz);
    for (const [ox, oz, sx, sz] of [[0, 3, 6.4, 0.5], [0, -3, 6.4, 0.5], [3, 0, 0.5, 6.4], [-3, 0, 0.5, 6.4]]) if (Math.abs(ox) < S.rw / 2 - 0.5 && Math.abs(oz) < S.rd / 2 - 0.5) flat('tex:hazard_stripes', S.cx + ox, S.cz + oz, sx, sz, Y + 0.014, 0xffffff);
    for (const d of S.doors) S.spot('opening', d.x, Y, d.z, { key: d.key, dir: d.key & 1, w: d.w, hh: d.h, n: d.n });
    S.sign(['MODERATION ARENA', 'TWO WAVES. NO REFUNDS'], { fg: '#ff5040', border: '#ff2020' });
    em(S.cx, Y + S.h - 0.4, S.cz, 0xffffff, 0.9, 14, 0.05);
    em(S.rc.x0 + 1, Y + 2.6, S.rc.z0 + 1, 0xff5030, 0.6, 9, 0.1);
    em(S.rc.x1 - 1, Y + 2.6, S.rc.z1 - 1, 0xff5030, 0.6, 9, 0.1);
  }
  function puzzle(S) {
    const along = S.alongX;
    const pts = along ? [[S.rc.x0 + 1.4, S.cz], [S.rc.x1 - 1.4, S.cz]] : [[S.cx, S.rc.z0 + 1.4], [S.cx, S.rc.z1 - 1.4]];
    const lev = pts.map((p) => S.near(p[0], p[1], 0.5, 0.5, 1.9));
    const cp = S.wall(0, 0, 0.12);
    if (!lev[0] || !lev[1] || !cp) { out.rooms[out.rooms.length - 1].failed = true; return; }
    lev.forEach((p, i) => { S.put('m2:lever_pylon', p[0], p[1], face(S.cx - p[0], S.cz - p[1])); S.spot('lever', p[0], Y + 1.35, p[1], { i }); });
    S.put('m2:color_panel', cp.x, cp.z, cp.rot, {}, 0.9);
    const co = Math.cos(cp.rot), si = Math.sin(cp.rot);
    for (let i = 0; i < 4; i++) { const lx = -0.45 + i * 0.3; S.spot('btn', cp.x + lx * co + 0.09 * si, Y + 1.3, cp.z - lx * si + 0.09 * co, { i }); }
    S.spot('rp', cp.x + 0.09 * si, Y + 1.06, cp.z + 0.09 * co);
    S.spot('panel', cp.x, Y + 1.4, cp.z, { rot: cp.rot });
    S.spot('reward', S.cx, Y, S.cz);
    S.sign(['SYNC CHAMBER', 'TWO LEVERS. ONE SECOND.']);
    em(S.cx, Y + S.h - 0.5, S.cz, 0xd8e8ff, 0.7, 12, 0.05);
  }
  function treasure(S) {
    const cp = S.near(S.cx, S.cz, 0.6, 0.6, 2.0) || [S.cx, S.cz];
    S.put('m2:pedestal', cp[0], cp[1], 0);
    S.spot('chest', cp[0], Y + 0.6, cp[1], { tier: 'gold' });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = S.cx + sx * (S.rw / 2 - 1.0), z = S.cz + sz * (S.rd / 2 - 1.0); if (S.clear(x, z, 0.3, 0.3, 1.5)) S.put('m2:candles', x, z, 0, { color: 0xffc040 }); }
    for (let i = 0; i < 2; i++) { const p = S.near(S.cx + rng.float(-2, 2), S.cz + rng.float(-2, 2), 0.5, 0.5, 1.8); if (p) S.put('m2:bones', p[0], p[1], rng.float(0, 6)); }
    const seals = (M.challenge?.seals || []).map((k) => sealInfo(L, K, k));
    for (const s of seals) S.spot('seal', s.x, Y, s.z, s);
    S.sign(['TREASURE ROOM', 'TAKE ONE. LEAVE FAST.'], { fg: '#ffe070', border: '#ffc030' });
    em(cp[0], Y + 2.0, cp[1], 0xffc040, 1.0, 10, 0.1);
  }
  function triangle(S) {
    const tri = S.r.m2.tri;
    if (!tri) return;
    const { a, b, side } = tri;
    const st = ctx.theme?.rooms?.[S.r.type] || {};
    const h = S.r.height, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    gb.vrect('tex:' + (st.wall || 'concrete'), a[0], a[1], b[0], b[1], Y, Y + h, 0.5, undefined, 0);
    gb.vrect('tex:' + (st.wall || 'concrete'), b[0], b[1], a[0], a[1], Y, Y + h, 0.5, undefined, 0);
    if (ctx.physics) {
      const col = ctx.physics.addStaticBox((a[0] + b[0]) / 2, Y + h / 2, (a[1] + b[1]) / 2, len / 2, h / 2, 0.16, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), G.STATIC, { kind: 'prop', id: 'm2tri' });
      ctx.colliders.push(col);
    }
    // the other half of the room is walled off: no nav, no loot, no lights there
    const nav = ctx.nav, dead = (x, z) => side * sd(a, b, [x, z]) < 0.4;
    for (let gz = 0; gz < nav.h; gz++) for (let gx = 0; gx < nav.w; gx++) {
      const w = nav.toWorld(gx, gz);
      if (w.x > S.rc.x0 && w.x < S.rc.x1 && w.z > S.rc.z0 && w.z < S.rc.z1 && dead(w.x, w.z)) nav.walk[gz * nav.w + gx] = 0;
    }
    for (let i = ctx.scrapSpots.length - 1; i >= 0; i--) { const s = ctx.scrapSpots[i]; if (s.room === S.r.id && side * sd(a, b, [s.x, s.z]) < 1.0) ctx.scrapSpots.splice(i, 1); }
    for (let i = ctx.emitters.length - 1; i >= 0; i--) { const e = ctx.emitters[i]; if (e.pos.x > S.rc.x0 && e.pos.x < S.rc.x1 && e.pos.z > S.rc.z0 && e.pos.z < S.rc.z1 && e.pos.y > Y && e.pos.y < Y + h + 0.5 && side * sd(a, b, [e.pos.x, e.pos.z]) < 0) ctx.emitters.splice(i, 1); }
    const sgn = S.wall(0, 0, 0.09);
    if (sgn) S.put('m2:sign', sgn.x, sgn.z, sgn.rot, { lines: [t('ROOM 3.5'), t('DO NOT MEASURE')], w: 1.3 }, 1.9);
    const ch = S.near((S.cx + a[0] + b[0]) / 3 + 0, (S.cz + a[1] + b[1]) / 3, 0.4, 0.4, 1.6);
    void ch;
    S.spot('tri', S.cx, Y, S.cz, { a, b, side });
    em(S.cx, Y + h - 0.6, S.cz, 0xf0f0a0, 0.4, 8, 0.5);
  }

  const BUILD = { party, laststand, nursery, shrine, flooded, physics, gamble, arena, puzzle, treasure, triangle };
  for (const r of L.rooms) {
    if (!r.m2) continue;
    try {
      const S = scene(r);
      BUILD[r.m2.id]?.(S);
      if (r.m2ch) for (let i = ctx.scrapSpots.length - 1; i >= 0; i--) if (ctx.scrapSpots[i].room === r.id) ctx.scrapSpots.splice(i, 1);   // no free loot in front of the challenge
    } catch (e) { console.warn('m2 room', r.m2?.id, e); }
  }

  // ------------------------------------------------------------------------------------ interactable furniture
  const dressRooms = () => rng.shuffle(L.rooms.filter((r) => !r.m2 && !SPECIAL_ROOMS.has(r.type) && !r.treasure && !r.arena && !r.maze && r.type !== 'nest' && r.w * r.h >= 4));
  const sceneLite = (r) => { const rc = K.roomRect(r); return { r, rc, doors: r.linkKeys.map((k) => linkInfo(L, K, r, k)), walls: rng.shuffle(K.perimeter(r).filter((e) => !K.edgeBusy(e.x, e.z, e.d) && !K.cellHasDoorway(e.x, e.z))) }; };
  const fp = (id) => SIZE2[id.replace('m2:', '')] || [0.6, 0.6];
  function furnish(id, count, opts = {}) {
    let placed = 0;
    for (const r of dressRooms()) {
      if (placed >= count) break;
      const S = sceneLite(r);
      for (const w of S.walls.slice(0, 4)) {
        const [w0, d0] = fp(id);
        const [px, pz] = K.wallPoint(w.x, w.z, w.d, rng.float(-1.0, 1.0), d0 / 2 + 0.3);
        const hw = Math.max(w0, d0) / 2;
        if (px - hw < S.rc.x0 + 0.4 || px + hw > S.rc.x1 - 0.4 || pz - hw < S.rc.z0 + 0.4 || pz + hw > S.rc.z1 - 0.4) continue;
        if (!navClear(ctx.nav, px - hw, pz - hw, px + hw, pz + hw, 0.1) || S.doors.some((d) => Math.hypot(d.x - px, d.z - pz) < 1.9)) continue;
        if (ctx.placeProp(id, px, Y, pz, WALL_ROT[w.d], { ...opts })) { placed++; break; }
      }
    }
    return placed;
  }
  const sz = L.size || 1;
  furnish('m2:drawer_cab', 3 + Math.round(sz * 2), { color: 0x7a8088 });
  furnish('m2:pc', 1 + Math.round(sz * 1.5));
  furnish('m2:radio', 1 + (sz > 1.4 ? 1 : 0));
  furnish('m2:phone', 1 + Math.round(sz * 1.2));

  // light switches: one per ordinary room, beside its first doorway (toggles that room's emitters at runtime)
  for (const r of L.rooms) {
    if (SPECIAL_ROOMS.has(r.type) && !r.m2) continue;
    if (r.type === 'vault' || r.type === 'core' || r.type === 'nest' || !r.linkKeys.length) continue;
    const d = linkInfo(L, K, r, r.linkKeys[0]);
    const side = rng.chance(0.5) ? 1 : -1;
    const [px, pz] = K.wallPoint(d.cell[0], d.cell[1], d.d, side * (d.w / 2 + 0.4), 0.03);
    if (!ctx.placeProp('m2:switch', px, Y + 1.25, pz, WALL_ROT[d.d], {})) continue;
    out.switches.push({ room: r.id, x: px, y: Y + 1.4, z: pz });
  }

  // breakable windows ("windows" to the void) in a few ordinary rooms: ONE instanced transparent mesh
  const wins = [];
  for (const r of dressRooms().slice(0, 3 + Math.round(sz * 2))) {
    const S = sceneLite(r), w = S.walls[0];
    if (!w) continue;
    const [px, pz] = K.wallPoint(w.x, w.z, w.d, rng.float(-0.8, 0.8), 0.04);
    const rot = WALL_ROT[w.d], alongX = w.d % 2 === 1;   // d 1 / 3 walls run along X
    wins.push({ x: px, y: Y + 1.55, z: pz, rot, d: w.d, room: r.id });
    // backdrop + frame (merged): the void outside
    gb.box('glow', px - INWARD[w.d][0] * 0.012, Y + 1.55, pz - INWARD[w.d][1] * 0.012, alongX ? 1.5 : 0.02, 1.0, alongX ? 0.02 : 1.5, 0.5, col3(0x2a4a70));
    for (const [ox, oy, sx, sy] of [[0, 0.52, 1.6, 0.06], [0, -0.52, 1.6, 0.06], [-0.78, 0, 0.06, 1.1], [0.78, 0, 0.06, 1.1]]) {
      gb.box('plain', px + (alongX ? ox : 0), Y + 1.55 + oy, pz + (alongX ? 0 : ox), alongX ? sx : 0.05, sy, alongX ? 0.05 : sx, 0.5, col3(0x504840));
    }
  }
  if (wins.length) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fc8f0, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1.5, 1.0);
    const im = new THREE.InstancedMesh(geo, mat, wins.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    wins.forEach((w, i) => {
      q.setFromAxisAngle(up, w.rot);
      m4.compose(new THREE.Vector3(w.x + INWARD[w.d][0] * 0.02, w.y, w.z + INWARD[w.d][1] * 0.02), q, s1);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.userData.m2windows = true;
    ctx.group.add(im);
    out.windows = { mesh: im, list: wins };
    out.disposers.push(() => { mat.dispose(); geo.dispose(); im.removeFromParent(); });
  }

  // merged decoration geometry (confetti, decals, frames, glow panels): a handful of draw calls for the whole facility
  const built = gb.build((key) => {
    if (key === 'plain') return ctx.levelMaterial(null, { vertexColors: true });
    if (key === 'glow') return new THREE.MeshBasicMaterial({ vertexColors: true });
    return ctx.levelMaterial(key.slice(4), { vertexColors: true, alphaTest: 0.4 });
  });
  built.name = 'maps2';
  ctx.group.add(built);
  out.mesh = built;
  out.dispose = () => { for (const f of out.disposers) { try { f(); } catch { /* ignore */ } } built.removeFromParent(); };
  // corridor seal candidates for the runtime events (Collapse / Corridor Seal)
  out.sealEdges = corridorSealEdges(L).map((k) => sealInfo(L, K, k));
  return out;
}
