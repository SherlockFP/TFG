// BACKROOMS interior - "Level 0" and the sub-levels you can stumble into from it.
//
// Layout: plan 'open' (overlapping open zones whose inner walls are knocked out, random wall runs put back,
// everything stays connected). The mono-yellow maze is LEVEL 0; room types turn parts of it into other levels:
//   l1_hall / l1_store  LEVEL 1 - Habitable Zone   concrete warehouse, puddles, flickering hanging tubes
//   l2_pipes            LEVEL 2 - Pipe Dreams      cramped dark maintenance rooms, hot hissing pipes (steam jets)
//   poolrooms (hub)     LEVEL 37 - The Poolrooms   white tiled arcades over shallow bright water
// and the pure planner (./backrooms_levels.js) picks the rare ones on top of the layout (same on every peer):
//   LEVEL FUN =)        one yellow room full of balloons, confetti, streamers and "=)" graffiti
//   LEVEL !             the longest straight corridor, red emergency lights, sirens
//   THE MANILA ROOM     very rare: a small room sealed off except for one narrow slot, with a guaranteed prize
//
// decorate(ctx) dresses it all with merged geometry (few draw calls): a strict grid of bright troffer panels,
// chevron wallpaper / damp carpet / stained ceiling tiles (procedural, ./backrooms_tex.js), baseboards, outlets,
// vents, rare EXIT signs, water stains, pillars and short free-standing wall stubs. Flat "baked" light: the
// runtime module (src/game/brlevels.js) bakes per-vertex light into every static surface after the build.
import * as THREE from 'three';
import { layoutKit, navClear, INWARD } from './common.js';
import { planBackroomsLevels, LEVEL_BY_ID, SLOT_W, SLOT_H } from './backrooms_levels.js';
import { brMaterials, atlasUV } from './backrooms_tex.js';

const C_PANEL = 0xfff0c0;
const SEAL_OFF = 0.004;   // walled-up arches sit flush with the wall plane (the arch hole has no geometry of its own)
const L0 = { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained' };
const CONCRETE = { floor: 'concrete', wall: 'concrete_stained', ceil: 'concrete_dark' };

export const BACKROOMS = {
  id: 'backrooms',
  name: 'The Backrooms',
  blurb: 'You noclipped out of the internet. Mono-yellow, damp carpet, 600 million square miles.',
  style: {
    corridor: { ...L0, base: null },
    rooms: {
      entrance: { ...L0, lamp: null, wall_: ['water_cooler'], clutter: ['wet_floor_sign'], posters: 1 },
      yellow_room: { ...L0, lamp: null, wall_: [], clutter: [], posters: 0 },
      office_void: { ...L0, floor: 'carpet_office', lamp: null, center: ['desk'], wall_: ['filing_cabinet', 'water_cooler'], clutter: ['office_chair', 'cardboard_boxes'], posters: 1 },
      supply_room: { ...L0, floor: 'concrete_stained', lamp: null, rows: 'shelf_metal', wall_: ['shelf_metal', 'ext:psx_shelf'], clutter: ['cardboard_boxes', 'ext:psx_cardboard_box'] },
      dark_zone: { ...L0, lamp: null, wall_: [], clutter: ['office_chair'], posters: 0 },
      nest: { ...L0, lamp: null, wall_: [], clutter: ['cobweb', 'ext:psx_mattress'], webs: true },
      poolrooms: { floor: 'pool_tiles', wall: 'pool_tiles', ceil: 'pool_tiles', lamp: null, wall_: [], clutter: [], posters: 0 },
      l1_hall: { ...CONCRETE, lamp: 'fluorescent', lampColor: 0xe6eef4, rows: 'shelf_metal', rowMargin: 2.2, wall_: ['crate_metal', 'pallet', 'shelf_metal', 'ext:psx_shelf'], clutter: ['crate_wood', 'crate_metal', 'barrel', 'pallet', 'cardboard_boxes', 'ext:psx_cardboard_box'], posters: 0 },
      l1_store: { ...CONCRETE, lamp: 'fluorescent', lampColor: 0xe6eef4, wall_: ['crate_wood', 'barrel', 'shelf_metal'], clutter: ['crate_wood', 'cardboard_boxes', 'barrel', 'pallet'], posters: 0 },
      l2_pipes: { floor: 'metal_plate', wall: 'concrete', ceil: 'metal_dark', lamp: null, wall_: ['pipe_vertical', 'fuse_box', 'ext:psx_pipes'], clutter: ['barrel'], posters: 0 },
      generator: { ...L0, floor: 'concrete', lamp: null, wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
    },
  },
  roomTypes: [
    ['yellow_room', 5, true], ['l1_hall', 3, true], ['supply_room', 1, true],
    ['yellow_room', 4], ['office_void', 2], ['dark_zone', 1.6], ['l2_pipes', 2.4], ['l1_store', 1.4], ['nest', 0.8],
  ],
  roomHeight(type, rng) {
    if (type === 'poolrooms') return rng.float(5.4, 5.9);          // < 6 m: no catwalk ring over the pool
    if (type === 'vault' || type === 'generator') return 4;
    if (type === 'entrance') return 3.6;
    if (type === 'l1_hall') return rng.float(4.6, 5.4);
    if (type === 'l1_store') return rng.float(3.6, 4.0);
    if (type === 'l2_pipes') return rng.float(2.6, 2.8);
    return rng.float(2.85, 3.05);                                  // Level 0: low, oppressive ceilings
  },
  layout: { plan: 'open', doorP: 0.06, blastP: 0, loops: 0.2, bigChance: 0.22, corridorH: 2.9, hub: { type: 'poolrooms', w: 4, h: 4 }, hubAlways: true, roomMul: 0.6, lockedP: 0.1 },
  lamps: { corridor: 'ceiling_panel', every: 2, color: C_PANEL, flicker: 0.28 },   // placed by facility.js, replaced by the troffer grid below
  lampColor: C_PANEL,
  posters: ['sign_noclip', 'poster_missing', 'graffiti', 'poster_hang'],
  landmarks: ['wet_floor_sign', 'ext:tfg_stack_chair', 'cardboard_boxes'],
  doorProp: 'door_single',
  corridorScrap: 0.12,
  steamRooms: ['l2_pipes'],
  noFlood: ['poolrooms', 'l2_pipes'],
  footstep: { carpet_wet: 'mud', carpet_office: 'carpet', pool_tiles: 'tile', concrete: 'concrete', metal_plate: 'metal' },
  ambience: { base: 'ambience_facility', vol: 0.36, buzz: 'lights_buzz', buzzVol: 0.4, env: 'facility' },   // the hum dies with the power
  atmosphere: { fog: 0xb4a45e, density: 0.032 },   // Level 0: distance fades into a faint yellow haze, not black
  decorate,
};

// ------------------------------------------------------------------------------------------ geometry helpers
const WHITE = [1, 1, 1];
/** quad with an explicit wanted normal (winding fixed up), uvs for p0..p3 */
function quadN(gb, key, p0, p1, p2, p3, uvs, col, n) {
  // GeoBuilder takes the normal from (p1 - p0) x (p3 - p0): rotate a degenerate corner (pole / tip) away from p0
  let P = [p0, p1, p2, p3], U = uvs;
  const cr = (a, b, c) => new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a));
  for (let k = 0; k < 4 && cr(P[0], P[1], P[3]).lengthSq() < 1e-12; k++) { P = [P[1], P[2], P[3], P[0]]; U = [U[1], U[2], U[3], U[0]]; }
  const c = cr(P[0], P[1], P[3]);
  if (c.lengthSq() < 1e-12) return;
  if (c.x * n[0] + c.y * n[1] + c.z * n[2] >= 0) gb.quad(key, P[0], P[1], P[2], P[3], U, col);
  else gb.quad(key, P[0], P[3], P[2], P[1], [U[0], U[3], U[2], U[1]], col);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const regionUV = (name, flip = false) => { const [u0, v0, u1, v1] = atlasUV(name); return flip ? [[u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; };
const SUB_UV = (name, a, b) => { const [u0, v0, u1, v1] = atlasUV(name); const ua = u0 + (u1 - u0) * a, ub = u0 + (u1 - u0) * b; return [[ua, v0], [ub, v0], [ub, v1], [ua, v1]]; };

/** Frame of layout edge (x, z, d) seen from inside the cell: centre, inward normal n, right-hand tangent r. */
function edgeFrame(K, x, z, d) {
  const [ecx, ecz] = K.edgeCenter(x, z, d);
  const [nx, nz] = INWARD[d];
  return { ecx, ecz, nx, nz, rx: nz, rz: -nx };
}
/** vertical quad on an edge: along s0..s1 (m from the left end seen from inside), heights y0..y1 (absolute), `off` into the cell */
function edgeQuad(gb, key, K, f, s0, s1, y0, y1, off, uvs, col = WHITE) {
  const C = K.C;
  const ax = f.ecx + f.rx * (s0 - C / 2) + f.nx * off, az = f.ecz + f.rz * (s0 - C / 2) + f.nz * off;
  const bx = f.ecx + f.rx * (s1 - C / 2) + f.nx * off, bz = f.ecz + f.rz * (s1 - C / 2) + f.nz * off;
  quadN(gb, key, V(ax, y0, az), V(bx, y0, bz), V(bx, y1, bz), V(ax, y1, az), uvs, col, [f.nx, 0, f.nz]);
}
/** world-continuous uvs for an edge quad (same scale as facility walls: 0.5 per metre, v = absolute y) */
function edgeWorldUV(K, f, s0, s1, y0, y1) {
  const C = K.C;
  const u = (s) => ((f.ecx + f.rx * (s - C / 2)) * Math.abs(f.rx) + (f.ecz + f.rz * (s - C / 2)) * Math.abs(f.rz)) * 0.5;
  return [[u(s0), y0 * 0.5], [u(s1), y0 * 0.5], [u(s1), y1 * 0.5], [u(s0), y1 * 0.5]];
}
/** horizontal quad centred at (cx, cz): half sizes hx/hz, rotation rot (rad), facing up or down */
function flatQuad(gb, key, cx, cz, hx, hz, rot, y, up, uvs, col = WHITE) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (ox, oz) => V(cx + ox * c - oz * s, y, cz + ox * s + oz * c);
  if (up) quadN(gb, key, P(-hx, hz), P(hx, hz), P(hx, -hz), P(-hx, -hz), uvs, col, [0, 1, 0]);
  else quadN(gb, key, P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz), uvs, col, [0, -1, 0]);
}
/** box with per-face atlas uvs (white region) - small solid details */
function solidBox(gb, key, cx, cy, cz, sx, sy, sz, col, uvName = 'white') {
  const uv = regionUV(uvName);
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  quadN(gb, key, V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), uv, col, [0, 1, 0]);
  quadN(gb, key, V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), uv, col, [0, -1, 0]);
  quadN(gb, key, V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), uv, col, [0, 0, 1]);
  quadN(gb, key, V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), uv, col, [0, 0, -1]);
  quadN(gb, key, V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), uv, col, [1, 0, 0]);
  quadN(gb, key, V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), uv, col, [-1, 0, 0]);
}
/** low-poly cylinder (pipes) from a to b, radius r, `seg` sides; flat shaded, atlas white + vertex colour */
function pipe(gb, key, a, b, r, col, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const up = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize(), w = new THREE.Vector3().crossVectors(u, dir).normalize();
  const uv = regionUV('white');
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
    const o0 = u.clone().multiplyScalar(Math.cos(a0) * r).addScaledVector(w, Math.sin(a0) * r);
    const o1 = u.clone().multiplyScalar(Math.cos(a1) * r).addScaledVector(w, Math.sin(a1) * r);
    const n = u.clone().multiplyScalar(Math.cos(am)).addScaledVector(w, Math.sin(am));
    const shade = 0.78 + 0.22 * Math.max(0, n.y);
    quadN(gb, key, a.clone().add(o0), b.clone().add(o0), b.clone().add(o1), a.clone().add(o1), uv, [col[0] * shade, col[1] * shade, col[2] * shade], [n.x, n.y, n.z]);
  }
}
/** low-poly sphere (balloons) */
function ball(gb, key, cx, cy, cz, r, col, sy = 1.2) {
  const uv = regionUV('white'), LAT = 4, LON = 6;
  for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
    const t0 = (i / LAT) * Math.PI, t1 = ((i + 1) / LAT) * Math.PI, p0 = (j / LON) * Math.PI * 2, p1 = ((j + 1) / LON) * Math.PI * 2;
    const P = (t, p) => V(cx + Math.sin(t) * Math.cos(p) * r, cy + Math.cos(t) * r * sy, cz + Math.sin(t) * Math.sin(p) * r);
    const tm = (t0 + t1) / 2, pm = (p0 + p1) / 2;
    const n = [Math.sin(tm) * Math.cos(pm), Math.cos(tm), Math.sin(tm) * Math.sin(pm)];
    const sh = 0.72 + 0.28 * Math.max(0, n[1] * 0.6 + 0.5);
    quadN(gb, key, P(t0, p0), P(t0, p1), P(t1, p1), P(t1, p0), uv, [col[0] * sh, col[1] * sh, col[2] * sh], n);
  }
}
/** 4-sided pyramid (party hats) */
function cone(gb, key, cx, cy, cz, r, h, col) {
  const uv = regionUV('white');
  const tip = V(cx, cy + h, cz);
  const pts = [[r, 0], [0, r], [-r, 0], [0, -r]].map(([ox, oz]) => V(cx + ox, cy, cz + oz));
  for (let k = 0; k < 4; k++) {
    const a = pts[k], b = pts[(k + 1) % 4];
    const mid = V((a.x + b.x) / 2 - cx, 0.3, (a.z + b.z) / 2 - cz).normalize();
    quadN(gb, key, a, b, tip, tip.clone(), uv, k % 2 ? col : [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], [mid.x, mid.y, mid.z]);
  }
}

/** Append a GeoBuilder bucket to an existing merged level mesh (same attribute layout) - no extra draw call. */
function appendBucket(mesh, b) {
  if (!mesh || !b || !b.idx.length) return false;
  const g = mesh.geometry, n0 = g.attributes.position.count;
  const cat = (name, add, size) => {
    const old = g.attributes[name]?.array;
    if (!old) return null;
    const out = new Float32Array(old.length + add.length);
    out.set(old, 0); out.set(add, old.length);
    return new THREE.BufferAttribute(out, size);
  };
  const pos = cat('position', b.pos, 3), nrm = cat('normal', b.nrm, 3), uv = cat('uv', b.uv, 2), col = cat('color', b.col, 3);
  if (!pos || !nrm || !uv || !col || !g.index) return false;
  const oi = g.index.array, idx = new Uint32Array(oi.length + b.idx.length);
  idx.set(oi, 0);
  for (let k = 0; k < b.idx.length; k++) idx[oi.length + k] = b.idx[k] + n0;
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', pos); ng.setAttribute('normal', nrm); ng.setAttribute('uv', uv); ng.setAttribute('color', col);
  ng.setIndex(new THREE.BufferAttribute(idx, 1));
  ng.computeBoundingSphere(); ng.computeBoundingBox();
  g.dispose();
  mesh.geometry = ng;
  return true;
}

// ------------------------------------------------------------------------------------------ decorate
function decorate(ctx) {
  const L = ctx.layout, K = layoutKit(L), rng = ctx.rng, Y = ctx.Y, C = K.C;
  const plan = planBackroomsLevels(L, { dark: ctx.darkCells });
  const IDX = (id) => LEVEL_BY_ID[id].index;
  // the set pieces may have flooded the chosen Manila Room: then it stays a plain Level 0 room
  if (plan.manila && (ctx.zones || []).some((zn) => zn.type === 'water' && zn.room === plan.manila.room.id)) {
    const r = plan.manila.room;
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) plan.cellLevel[L.idx(x, z)] = IDX('l0');
    plan.manila = null;
  }
  const M = brMaterials();
  const gb = new ctx.GeoBuilder();          // keys: atlas | lit | flicker | beacon | water | puddle | wall | pool | manila | redcarpet
  const lvAt = (i) => plan.cellLevel[i];
  const typeAt = (i) => (L.roomOf[i] >= 0 ? L.rooms[L.roomOf[i]].type : null);
  const styleOf = (i) => (L.roomOf[i] >= 0 ? BACKROOMS.style.rooms[typeAt(i)] || BACKROOMS.style.corridor : BACKROOMS.style.corridor);
  const yellowWalls = (i) => styleOf(i).wall === 'wallpaper_yellow' && lvAt(i) !== IDX('manila');
  const yellowCeil = (i) => styleOf(i).ceil === 'ceiling_stained';

  // ---- 1) swap the facility's level materials for the procedural Level 0 look (same draw calls)
  const levelMeshes = new Map();
  ctx.group.traverse((o) => {
    const k = o.isMesh && o.userData?.levelKey;
    if (!k) return;
    if (!levelMeshes.has(k) || o.geometry.attributes.position.count > levelMeshes.get(k).geometry.attributes.position.count) levelMeshes.set(k, o);
    if (k === 'w:wallpaper_yellow' && M.wall.map) o.material = M.wall;
    else if (k === 'f:carpet_wet' && M.carpet.map) o.material = M.carpet;
    else if (k === 'c:ceiling_stained' && M.ceiling.map) o.material = M.ceiling;
  });

  // ---- 2) drop the facility's corridor ceiling panels (+ their lights): the troffer grid replaces them
  const drop = [], glbPillars = [];
  for (const o of ctx.group.children) {
    if (o.userData?.propId === 'ceiling_panel' || o.userData?.propId === 'bench') drop.push(o);
    else if (o.userData?.ext === 'tfg_backrooms_pillar') glbPillars.push(o);
  }
  for (const o of glbPillars) {   // the downloaded pillar has its own (older) wallpaper: swap it for ours, keep its collider
    o.traverse((m) => { if (m.isMesh) m.visible = false; });
    o.removeFromParent();
  }
  for (const o of drop) {
    const p = o.position;
    for (let k = ctx.emitters.length - 1; k >= 0; k--) {
      const e = ctx.emitters[k];
      if (Math.abs(e.pos.x - p.x) < 0.7 && Math.abs(e.pos.z - p.z) < 0.7 && Math.abs(e.pos.y - p.y) < 1.2) ctx.emitters.splice(k, 1);
    }
    o.traverse((m) => { if (m.isMesh) m.visible = false; });
    o.removeFromParent();
  }

  const emit = (x, y, z, color, intensity, distance, extra) => { const e = { pos: new THREE.Vector3(x, y, z), color, intensity, distance, group: 'facility', ...(extra || {}) }; ctx.emitters.push(e); return e; };
  const runSet = new Set(plan.run?.cells || []);
  const lens = regionUV('lens'), deadLens = regionUV('deadlens');
  const FRAME = [0.8, 0.78, 0.72];

  // ---- 3) the troffer grid: 4 panels per 4 m cell on a strict 2 m lattice (0.67 x 1.33 m, one ceiling tile wide)
  const troffer = (px, pz, top, state) => {
    flatQuad(gb, 'atlas', px, pz, 0.7, 0.37, Math.PI / 2, top - 0.004, false, regionUV('white'), FRAME);
    const key = state === 'lit' ? 'lit' : state === 'flicker' ? 'flicker' : 'atlas';
    flatQuad(gb, key, px, pz, 0.667, 0.333, Math.PI / 2, top - 0.014, false, state === 'dead' ? deadLens : lens);
  };
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i] || !yellowCeil(i)) continue;
    const lv = lvAt(i), top = Y + L.heightOf[i], x0 = K.wx(x), z0 = K.wz(z);
    const light = plan.cellLight[i];
    const dead = plan.deadCell[i];
    const pts = [[1, 1.333], [3, 1.333], [1, 3.333], [3, 3.333]];
    if (rng.chance(0.12)) {
      const s = rng.float(0.3, 0.55);
      flatQuad(gb, 'atlas', x0 + 2 + rng.float(-0.25, 0.25), z0 + rng.float(0.6, 3.4), s, s * rng.float(0.8, 1), rng.float(0, Math.PI), top - 0.006, false, regionUV('ring'));
    }
    pts.forEach(([ox, oz], k) => {
      let st = 'lit';
      if (light <= 0.25 || runSet.has(i)) st = 'dead';
      else if (dead === 1 && (k === 1 || (k === 2 && ((x + z) & 1)))) st = 'dead';
      else if (dead === 2 && k === ((x * 3 + z) & 3)) st = 'flicker';
      else if (lv === IDX('manila') && k !== 0) st = 'dead';
      troffer(x0 + ox, z0 + oz, top, st);
    });
    // sparse pooled lights (one per 2 x 2 cells) so players, items and creatures catch the light too
    if (light > 0.5 && !runSet.has(i) && lv !== IDX('manila')) {
      const color = lv === IDX('fun') ? 0xffc8d8 : C_PANEL;
      if ((x % 2 === 0 && z % 2 === 0) || dead === 2) emit(x0 + 1, top - 0.3, z0 + 1.333, color, dead === 2 ? 0.55 : 0.42, 9, { flicker: dead === 2 ? 0.55 : 0 });
    }
  }

  // ---- 4) walls: baseboards, outlets, vents, EXIT signs, water streaks (Level 0 styled cells only)
  const BASE_H = 0.11;
  const baseboard = (f, s0, s1) => {
    if (s1 - s0 < 0.05) return;
    edgeQuad(gb, 'atlas', K, f, s0, s1, Y, Y + BASE_H, 0.018, SUB_UV('baseboard', 0, Math.min(1, (s1 - s0) / 4)));
    // top lip
    const ax = f.ecx + f.rx * (s0 - C / 2), az = f.ecz + f.rz * (s0 - C / 2), bx = f.ecx + f.rx * (s1 - C / 2), bz = f.ecz + f.rz * (s1 - C / 2);
    quadN(gb, 'atlas', V(ax, Y + BASE_H, az), V(bx, Y + BASE_H, bz), V(bx + f.nx * 0.018, Y + BASE_H, bz + f.nz * 0.018), V(ax + f.nx * 0.018, Y + BASE_H, az + f.nz * 0.018), regionUV('baseboard'), [1.05, 1.05, 1.05], [0, 1, 0]);
  };
  const wallDecal = (f, along, y, w, h, name, off = 0.012, col = WHITE, flip = false) => edgeQuad(gb, 'atlas', K, f, along - w / 2, along + w / 2, y, y + h, off, regionUV(name, flip), col);
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i] || !yellowWalls(i)) continue;
    const h = L.heightOf[i], lv = lvAt(i);
    for (let d = 0; d < 4; d++) {
      const key = L.edgeKey(x, z, d), info = L.edgeInfo.get(key), open = L.open.has(key);
      if (open && !info) continue;
      const f = edgeFrame(K, x, z, d);
      if (info) {
        const s0 = (C - info.width) / 2, s1 = (C + info.width) / 2;
        baseboard(f, 0, s0); baseboard(f, s1, C);
        continue;
      }
      baseboard(f, 0, C);
      if (lv === IDX('run')) continue;   // Level ! dresses its own walls
      const roll = rng.next();
      if (roll < 0.07) wallDecal(f, rng.float(0.5, C - 0.5), Y + 0.3, 0.085, 0.13, 'outlet');
      else if (roll < 0.1) wallDecal(f, rng.float(0.7, C - 0.7), Y + h - 0.42, 0.5, 0.25, 'vent');
      else if (roll < 0.112 && lv === IDX('l0')) {
        const a = rng.float(1, C - 1), y = Y + Math.min(h - 0.3, 2.55);
        wallDecal(f, a, y - 0.03, 0.5, 0.22, 'dark', 0.01);
        edgeQuad(gb, 'lit', K, f, a - 0.22, a + 0.22, y, y + 0.16, 0.022, regionUV('exit'));
      }
      if (rng.chance(0.11)) {
        const w = rng.float(0.45, 1.1), len = rng.float(0.8, Math.min(2.1, h - 0.4));
        const a = rng.float(0.6, C - 0.6);
        wallDecal(f, a, Y + h - len - 0.01, w, len, 'streak', 0.008, [0.95, 0.9, 0.8]);
      }
    }
  }

  // ---- 5) damp stains on the carpet
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i] || styleOf(i).floor !== 'carpet_wet' || lvAt(i) === IDX('manila') || !rng.chance(0.16)) continue;
    const s = rng.float(0.5, 1.1);
    flatQuad(gb, 'atlas', K.wx(x) + rng.float(0.9, C - 0.9), K.wz(z) + rng.float(0.9, C - 0.9), s, s * rng.float(0.6, 1), rng.float(0, Math.PI), Y + 0.008, true, regionUV('blob'), [0.95, 0.95, 0.95]);
  }

  // ---- 6) pillars and short free-standing wall stubs (wallpapered, baseboards, colliders, nav)
  const wallBox = (cx, cz, sx, sz, h, key = 'wall', collide = true) => {
    const y0 = Y, y1 = Y + h;
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const face = (a, b, n, len, off) => quadN(gb, key, V(a[0], y0, a[1]), V(b[0], y0, b[1]), V(b[0], y1, b[1]), V(a[0], y1, a[1]), [[off * 0.5, y0 * 0.5], [(off + len) * 0.5, y0 * 0.5], [(off + len) * 0.5, y1 * 0.5], [off * 0.5, y1 * 0.5]], WHITE, n);
    face([x0, z1], [x1, z1], [0, 0, 1], sx, cx); face([x1, z0], [x0, z0], [0, 0, -1], sx, cx);
    face([x1, z1], [x1, z0], [1, 0, 0], sz, cz); face([x0, z0], [x0, z1], [-1, 0, 0], sz, cz);
    // baseboards around it
    const bb = regionUV('baseboard'), e = 0.018, bh = BASE_H;
    const bface = (a, b, n) => quadN(gb, 'atlas', V(a[0], y0, a[1]), V(b[0], y0, b[1]), V(b[0], y0 + bh, b[1]), V(a[0], y0 + bh, a[1]), bb, WHITE, n);
    bface([x0 - e, z1 + e], [x1 + e, z1 + e], [0, 0, 1]); bface([x1 + e, z0 - e], [x0 - e, z0 - e], [0, 0, -1]);
    bface([x1 + e, z1 + e], [x1 + e, z0 - e], [1, 0, 0]); bface([x0 - e, z0 - e], [x0 - e, z1 + e], [-1, 0, 0]);
    if (!collide) return;
    ctx.addBox(cx, Y + h / 2, cz, sx, h, sz);
    ctx.nav.blockBox(x0, z0, x1, z1, 0.15);
  };
  for (const o of glbPillars) {
    const i = ctx.layout.idx(Math.floor((o.position.x - L.ox) / C), Math.floor((o.position.z - L.oz) / C));
    wallBox(o.position.x, o.position.z, 0.6, 0.6, L.heightOf[i] || 3, lvAt(i) === IDX('manila') ? 'manila' : 'wall', false);
  }
  for (const p of plan.pillars) {
    const h = L.heightOf[p.cell] || 3;
    if (!navClear(ctx.nav, p.x - p.s / 2, p.z - p.s / 2, p.x + p.s / 2, p.z + p.s / 2)) continue;
    wallBox(p.x, p.z, p.s, p.s, h);
  }
  for (const s of plan.stubs) {
    const h = L.heightOf[s.cell] || 3;
    const sx = s.axis === 'x' ? s.len : s.t, sz = s.axis === 'x' ? s.t : s.len;
    if (!navClear(ctx.nav, s.x - sx / 2, s.z - sz / 2, s.x + sx / 2, s.z + sz / 2)) continue;
    wallBox(s.x, s.z, sx, sz, h);
    if (rng.chance(0.25)) {   // a lone outlet on the stub
      const n = s.axis === 'x' ? [0, 1] : [1, 0];
      const f = { ecx: s.x + n[0] * (s.axis === 'x' ? 0 : s.t / 2), ecz: s.z + n[1] * (s.axis === 'x' ? s.t / 2 : 0), nx: n[0], nz: n[1], rx: n[1], rz: -n[0] };
      edgeQuad(gb, 'atlas', K, f, C / 2 - 0.04, C / 2 + 0.045, Y + 0.3, Y + 0.43, 0.012, regionUV('outlet'));
    }
  }
  // a few lonely objects in the open zones (visual only): wet floor signs, stacking chairs facing walls, boxes
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.zoneMask?.[i] || lvAt(i) !== IDX('l0') || L.distOf[i] < 4 || !rng.chance(0.035)) continue;
    const id = rng.pick(['wet_floor_sign', 'ext:tfg_stack_chair', 'ext:tfg_stack_chair', 'cardboard_boxes']);
    const px = K.wx(x) + rng.float(1, C - 1), pz = K.wz(z) + rng.float(1, C - 1);
    if (navClear(ctx.nav, px - 0.3, pz - 0.3, px + 0.3, pz + 0.3)) ctx.placeProp(id, px, Y, pz, rng.float(0, Math.PI * 2), { visualOnly: true });
  }

  // ---- 7) sub-levels
  for (const r of L.rooms) {
    if (r.type === 'poolrooms') decoratePool(ctx, K, gb, r, emit, levelMeshes);
    else if (r.type === 'l1_hall' || r.type === 'l1_store') decorateL1(ctx, K, gb, r);
    else if (r.type === 'l2_pipes') decorateL2(ctx, K, gb, r, emit);
  }
  if (plan.l2walls.length) decorateL2Walls(ctx, K, gb, plan);
  if (plan.fun) decorateFun(ctx, K, gb, plan.fun.room);
  if (plan.run) decorateRun(ctx, K, gb, plan.run, emit);
  if (plan.manila) decorateManila(ctx, K, gb, plan.manila, emit, glbPillars.map((o) => [o.position.x, o.position.z]));

  // ---- 8) build: wallpaper / pool-tile extras go into the facility's own merged meshes, the rest is 3-6 meshes
  const wallMesh = levelMeshes.get('w:wallpaper_yellow');
  if (appendBucket(wallMesh, gb.buckets.get('wall'))) gb.buckets.delete('wall');
  const poolMesh = levelMeshes.get('w:pool_tiles');
  if (appendBucket(poolMesh, gb.buckets.get('pool'))) gb.buckets.delete('pool');
  if (appendBucket(levelMeshes.get('w:concrete'), gb.buckets.get('l2wall'))) gb.buckets.delete('l2wall');
  const matFor = (key) => {
    if (key === 'wall') return M.wall.map ? M.wall : ctx.levelMaterial('wallpaper_yellow', {});
    if (key === 'pool') return ctx.levelMaterial('pool_tiles', {});
    if (key === 'l2wall') return ctx.levelMaterial('concrete', {});
    if (M[key]) return M[key];
    return ctx.levelMaterial('wallpaper_yellow', {});
  };
  const built = gb.build(matFor);
  built.name = 'backrooms_levels';
  built.children.forEach((m) => {
    m.userData.brKey = m.userData.levelKey;
    delete m.userData.levelKey;
    if (m.userData.brKey === 'water' || m.userData.brKey === 'puddle') m.renderOrder = 2;
  });
  if (built.children.length) ctx.group.add(built);
  plan.built = { group: built, runCenter: plan.run ? cellCenter(L, K, plan.run.cells[Math.floor(plan.run.cells.length / 2)], Y) : null };
}
const cellCenter = (L, K, i, Y) => new THREE.Vector3(K.wx(i % L.w) + K.C / 2, Y + 1.4, K.wz(Math.floor(i / L.w)) + K.C / 2);

// ------------------------------------------------------------------------------------------ Level 37 - Poolrooms
function decoratePool(ctx, K, gb, r, emit) {
  const L = ctx.layout, Y = ctx.Y, rng = ctx.rng, C = K.C;
  const rc = K.roomRect(r), h = r.height;
  // shallow warm water over almost the whole floor (a 1 m tiled walkway along the walls)
  const pool = { x0: rc.x0 + 1.0, z0: rc.z0 + 1.0, x1: rc.x1 - 1.0, z1: rc.z1 - 1.0 };
  const wy = Y + 0.3;
  gb.hrect('water', pool.x0, pool.z0, pool.x1, pool.z1, wy, true, 0.25, WHITE);
  for (const [a, b, c2, d] of [[pool.x0, pool.z0, pool.x1, pool.z0 + 0.14], [pool.x0, pool.z1 - 0.14, pool.x1, pool.z1], [pool.x0, pool.z0, pool.x0 + 0.14, pool.z1], [pool.x1 - 0.14, pool.z0, pool.x1, pool.z1]]) {
    gb.box('pool', (a + c2) / 2, Y + 0.06, (b + d) / 2, c2 - a, 0.12, d - b, 0.5);
  }
  ctx.zones.push({ type: 'water', min: [pool.x0, pool.z0], max: [pool.x1, pool.z1], y: wy, room: r.id });
  // colonnades with round arches: rows along the longer axis, spans of ~4 m, arcade walls up to the ceiling
  const alongX = (rc.x1 - rc.x0) >= (rc.z1 - rc.z0);
  const len = alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0, wid = alongX ? rc.z1 - rc.z0 : rc.x1 - rc.x0;
  const nSpan = Math.max(2, Math.round(len / 4)), span = len / nSpan, P = 0.7, T = 0.45;
  const R = (span - P) / 2, spring = h - 0.35 - R;
  const rows = wid >= 12 ? [wid / 3, (wid * 2) / 3] : [wid / 2];
  const toW = (a, b) => (alongX ? [rc.x0 + a, rc.z0 + b] : [rc.x0 + b, rc.z0 + a]);
  for (const row of rows) {
    const ok = [];
    for (let k = 1; k < nSpan; k++) {
      const [px, pz] = toW(k * span, row);
      const free = navClear(ctx.nav, px - P / 2, pz - P / 2, px + P / 2, pz + P / 2, 0.1);
      ok[k] = free;
      if (!free) continue;
      gb.box('pool', px, Y + h / 2, pz, P, h, P, 0.5);
      ctx.addBox(px, Y + h / 2, pz, P, h, P);
      ctx.nav.blockBox(px - P / 2, pz - P / 2, px + P / 2, pz + P / 2, 0.15);
    }
    // arches between neighbouring pillars (and half-spans from the end walls)
    for (let k = 0; k < nSpan; k++) {
      if ((k > 0 && !ok[k]) || (k < nSpan - 1 && !ok[k + 1])) continue;
      const a0 = k * span + (k > 0 ? P / 2 : 0), a1 = (k + 1) * span - (k < nSpan - 1 ? P / 2 : 0);
      const mid = (a0 + a1) / 2, rad = (a1 - a0) / 2;
      const SEG = 8;
      for (let s = 0; s < SEG; s++) {
        const t0 = Math.PI - (s / SEG) * Math.PI, t1 = Math.PI - ((s + 1) / SEG) * Math.PI;
        const pA = [mid + Math.cos(t0) * rad, spring + Math.sin(t0) * rad], pB = [mid + Math.cos(t1) * rad, spring + Math.sin(t1) * rad];
        for (const side of [-1, 1]) {
          const w0 = toW(pA[0], row + side * T / 2), w1 = toW(pB[0], row + side * T / 2);
          const n = alongX ? [0, 0, side] : [side, 0, 0];
          const uv = [[pA[0] * 0.5, (Y + pA[1]) * 0.5], [pB[0] * 0.5, (Y + pB[1]) * 0.5], [pB[0] * 0.5, (Y + h) * 0.5], [pA[0] * 0.5, (Y + h) * 0.5]];
          quadN(gb, 'pool', V(w0[0], Y + pA[1], w0[1]), V(w1[0], Y + pB[1], w1[1]), V(w1[0], Y + h, w1[1]), V(w0[0], Y + h, w0[1]), uv, WHITE, n);
        }
        // intrados (the curved underside)
        const i0 = toW(pA[0], row - T / 2), i1 = toW(pB[0], row - T / 2), i2 = toW(pB[0], row + T / 2), i3 = toW(pA[0], row + T / 2);
        const tm = (t0 + t1) / 2, nIn = [-Math.cos(tm), -Math.sin(tm)];
        const nn = alongX ? [nIn[0], nIn[1], 0] : [0, nIn[1], nIn[0]];
        quadN(gb, 'pool', V(i0[0], Y + pA[1], i0[1]), V(i1[0], Y + pB[1], i1[1]), V(i2[0], Y + pB[1], i2[1]), V(i3[0], Y + pA[1], i3[1]), [[0, 0], [0.5, 0], [0.5, 0.25], [0, 0.25]], WHITE, nn);
      }
    }
  }
  // bright cold troffers in the tiled ceiling + pooled lights
  const lens = regionUV('lens');
  for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
    const x0 = K.wx(x), z0 = K.wz(z);
    for (const [ox, oz] of [[1, 1.333], [3, 1.333], [1, 3.333], [3, 3.333]]) {
      const across = alongX ? z0 + oz - rc.z0 : x0 + ox - rc.x0, half = alongX ? 0.72 : 0.4;
      if (rows.some((row) => Math.abs(across - row) < half + T / 2)) continue;   // an arcade wall runs through here
      flatQuad(gb, 'atlas', x0 + ox, z0 + oz, 0.7, 0.37, Math.PI / 2, Y + h - 0.004, false, regionUV('white'), [0.9, 0.92, 0.94]);
      flatQuad(gb, 'lit', x0 + ox, z0 + oz, 0.667, 0.333, Math.PI / 2, Y + h - 0.014, false, lens, [0.86, 0.96, 1.0]);
    }
    if (((x - r.x) % 2 === 0) && ((z - r.z) % 2 === 0)) emit(x0 + C / 2, Y + h - 0.6, z0 + C / 2, 0xe8fcff, 0.8, 13);
  }
  // loot at the bottom of the pool (wade for it)
  for (let k = 0; k < 3; k++) ctx.scrapSpots.push({ x: rng.float(pool.x0 + 0.8, pool.x1 - 0.8), y: Y, z: rng.float(pool.z0 + 0.8, pool.z1 - 0.8), room: r.id, type: 'poolrooms', dist: K.roomDist(r) });
  void L;
}

// ------------------------------------------------------------------------------------------ Level 1 - Habitable Zone
function decorateL1(ctx, K, gb, r) {
  const Y = ctx.Y, rng = ctx.rng, C = K.C, L = ctx.layout;
  const rc = K.roomRect(r);
  // puddles under the leaking ceiling (cutout blobs, translucent, never a gameplay zone)
  const n = Math.max(2, Math.round(r.w * r.h * 0.35));
  for (let k = 0; k < n; k++) {
    const s = rng.float(0.6, 1.5);
    flatQuad(gb, 'puddle', rng.float(rc.x0 + 1, rc.x1 - 1), rng.float(rc.z0 + 1, rc.z1 - 1), s, s * rng.float(0.5, 0.9), rng.float(0, Math.PI), Y + 0.012, true, regionUV('blob'));
  }
  // stencilled sector markings + hazard stripes on the lower walls
  for (const e of K.perimeter(r)) {
    const key = L.edgeKey(e.x, e.z, e.d);
    if (L.open.has(key) || L.edgeInfo.has(key)) continue;
    const f = edgeFrame(K, e.x, e.z, e.d);
    if (rng.chance(0.18)) edgeQuad(gb, 'atlas', K, f, C / 2 - 0.9, C / 2 + 0.9, Y + 1.6, Y + 2.05, 0.012, regionUV('stencil'), [0.9, 0.9, 0.9]);
    if (rng.chance(0.3)) edgeQuad(gb, 'atlas', K, f, 0.2, C - 0.2, Y + 0.02, Y + 0.2, 0.012, regionUV('hazard'));
  }
}

// ------------------------------------------------------------------------------------------ Level 2 - Pipe Dreams
const RUST = [0.46, 0.3, 0.2], STEEL = [0.34, 0.35, 0.37], COPPER = [0.62, 0.36, 0.2], VALVE = [0.7, 0.12, 0.08];
function decorateL2(ctx, K, gb, r, emit) {
  const Y = ctx.Y, rng = ctx.rng, C = K.C, L = ctx.layout, h = r.height;
  // pipe runs along every closed wall at three heights
  for (const e of K.perimeter(r)) {
    const key = L.edgeKey(e.x, e.z, e.d);
    if (L.open.has(key) || L.edgeInfo.has(key)) continue;
    const f = edgeFrame(K, e.x, e.z, e.d);
    const at = (s, y, off) => V(f.ecx + f.rx * (s - C / 2) + f.nx * off, y, f.ecz + f.rz * (s - C / 2) + f.nz * off);
    pipe(gb, 'atlas', at(0, Y + h - 0.28, 0.16), at(C, Y + h - 0.28, 0.16), 0.1, RUST);
    pipe(gb, 'atlas', at(0, Y + h - 0.55, 0.12), at(C, Y + h - 0.55, 0.12), 0.06, COPPER);
    pipe(gb, 'atlas', at(0, Y + 0.32, 0.18), at(C, Y + 0.32, 0.18), 0.13, STEEL);
    if (rng.chance(0.45)) {   // valve wheel + pressure gauge on the low pipe
      const s = rng.float(0.8, C - 0.8), c = at(s, Y + 0.32, 0.33);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI;
        const dx = Math.cos(a) * 0.16, dy = Math.sin(a) * 0.16;
        pipe(gb, 'atlas', V(c.x - dx * f.rx, c.y - dy, c.z - dx * f.rz), V(c.x + dx * f.rx, c.y + dy, c.z + dx * f.rz), 0.018, VALVE, 4);
      }
      edgeQuad(gb, 'atlas', K, f, s + 0.35, s + 0.55, Y + 0.95, Y + 1.15, 0.03, regionUV('gauge'));
      pipe(gb, 'atlas', at(s + 0.45, Y + 0.45, 0.03), at(s + 0.45, Y + 0.95, 0.03), 0.02, STEEL, 4);
    }
  }
  // ceiling runs across the room + vertical drops in the corners
  const rc = K.roomRect(r);
  const alongX = (rc.x1 - rc.x0) >= (rc.z1 - rc.z0);
  for (const t of [0.35, 0.62]) {
    const a = alongX ? V(rc.x0, Y + h - 0.16, rc.z0 + (rc.z1 - rc.z0) * t) : V(rc.x0 + (rc.x1 - rc.x0) * t, Y + h - 0.16, rc.z0);
    const b = alongX ? V(rc.x1, Y + h - 0.16, rc.z0 + (rc.z1 - rc.z0) * t) : V(rc.x0 + (rc.x1 - rc.x0) * t, Y + h - 0.16, rc.z1);
    pipe(gb, 'atlas', a, b, t < 0.5 ? 0.12 : 0.08, t < 0.5 ? RUST : STEEL);
  }
  for (const [cx, cz] of [[rc.x0 + 0.25, rc.z0 + 0.25], [rc.x1 - 0.25, rc.z1 - 0.25]]) pipe(gb, 'atlas', V(cx, Y, cz), V(cx, Y + h, cz), 0.09, RUST);
  // caged bulbs: dim, orange, flickering
  const nb = Math.max(1, Math.round((r.w * r.h) / 4));
  for (let k = 0; k < nb; k++) {
    const bx = rng.float(rc.x0 + 1, rc.x1 - 1), bz = rng.float(rc.z0 + 1, rc.z1 - 1);
    solidBox(gb, 'atlas', bx, Y + h - 0.08, bz, 0.12, 0.08, 0.12, STEEL);
    flatQuad(gb, 'lit', bx, bz, 0.07, 0.07, 0, Y + h - 0.2, false, regionUV('bulb'), [1, 0.7, 0.4]);
    for (const [ox, oz] of [[0.07, 0], [-0.07, 0], [0, 0.07], [0, -0.07]]) pipe(gb, 'atlas', V(bx + ox, Y + h - 0.12, bz + oz), V(bx + ox, Y + h - 0.24, bz + oz), 0.008, STEEL, 3);
    emit(bx, Y + h - 0.3, bz, 0xffa050, 0.55, 6.5, { flicker: rng.chance(0.5) ? 0.4 : 0.12 });
  }
}

/** Level 2 tunnel partitions (plan.l2walls): full-height grimy walls on internal cell edges, pipes on both faces. */
function decorateL2Walls(ctx, K, gb, plan) {
  const L = ctx.layout, Y = ctx.Y, C = K.C, rng = ctx.rng;
  // a landmark prop may stand on the room centre = on a partition line: drop those
  const onLine = (o) => plan.l2walls.some((e) => {
    const f = edgeFrame(K, e.x, e.z, e.d);
    return Math.abs((o.position.x - f.ecx) * f.nx + (o.position.z - f.ecz) * f.nz) < 0.6 && Math.abs((o.position.x - f.ecx) * f.rx + (o.position.z - f.ecz) * f.rz) < C / 2 + 0.3;
  });
  for (const o of [...ctx.group.children]) {
    if (!o.userData?.propId && !o.userData?.ext) continue;
    if (Math.abs(o.position.y - Y) > 0.2 || !onLine(o)) continue;
    o.traverse((m) => { if (m.isMesh) m.visible = false; });
    o.removeFromParent();
  }
  for (const e of plan.l2walls) {
    const i = L.idx(e.x, e.z), h = L.heightOf[i];
    const f = edgeFrame(K, e.x, e.z, e.d);
    for (const side of [1, -1]) {
      const g = side > 0 ? f : { ...f, nx: -f.nx, nz: -f.nz, rx: -f.rx, rz: -f.rz };
      edgeQuad(gb, 'l2wall', K, g, 0, C, Y, Y + h, 0.12, edgeWorldUV(K, g, 0, C, Y, Y + h));
      const at = (s, y, off) => V(g.ecx + g.rx * (s - C / 2) + g.nx * off, y, g.ecz + g.rz * (s - C / 2) + g.nz * off);
      pipe(gb, 'atlas', at(-0.1, Y + h - 0.3, 0.26), at(C + 0.1, Y + h - 0.3, 0.26), 0.1, RUST);
      pipe(gb, 'atlas', at(-0.1, Y + 1.25, 0.22), at(C + 0.1, Y + 1.25, 0.22), 0.07, COPPER);
      pipe(gb, 'atlas', at(-0.1, Y + 0.3, 0.26), at(C + 0.1, Y + 0.3, 0.26), 0.12, STEEL);
      if (rng.chance(0.5)) { const s = rng.float(0.6, C - 0.6); pipe(gb, 'atlas', at(s, Y, 0.2), at(s, Y + h, 0.2), 0.08, RUST); }
    }
    const alongX = e.d === 1;
    ctx.addBox(f.ecx, Y + h / 2, f.ecz, alongX ? C + 0.24 : 0.24, h, alongX ? 0.24 : C + 0.24);
    ctx.nav.blockedEdges.add(e.key);
  }
}

// ------------------------------------------------------------------------------------------ Level Fun =)
const PARTY = [[1, 0.22, 0.32], [1, 0.84, 0.2], [0.24, 0.72, 1], [0.5, 1, 0.36], [1, 0.48, 0.94], [1, 0.55, 0.16]];
function decorateFun(ctx, K, gb, r) {
  const Y = ctx.Y, rng = ctx.rng, C = K.C, L = ctx.layout, h = r.height;
  const rc = K.roomRect(r);
  const rcx = (rc.x0 + rc.x1) / 2, rcz = (rc.z0 + rc.z1) / 2;
  // balloons: clusters bumping against the ceiling, a few loose ones on the floor, strings hanging down
  const nb = Math.round(r.w * r.h * 1.6);
  for (let k = 0; k < nb; k++) {
    const col = PARTY[rng.int(0, PARTY.length - 1)];
    const floor = rng.chance(0.22);
    const bx = rng.float(rc.x0 + 0.5, rc.x1 - 0.5), bz = rng.float(rc.z0 + 0.5, rc.z1 - 0.5);
    const by = floor ? Y + 0.26 : Y + h - 0.3 - rng.float(0, 0.12);
    ball(gb, 'atlas', bx, by, bz, 0.22, col);
    if (!floor) {
      const len = rng.float(0.9, 1.8);
      const sw = rng.float(-0.12, 0.12);
      quadN(gb, 'atlas', V(bx - 0.006, by - 0.27, bz), V(bx + 0.006, by - 0.27, bz), V(bx + 0.006 + sw, by - 0.27 - len, bz + sw), V(bx - 0.006 + sw, by - 0.27 - len, bz + sw), regionUV('white'), [0.95, 0.95, 0.95], [0, 0, 1]);
    }
  }
  // confetti over the carpet
  for (let k = 0; k < r.w * r.h * 2; k++) {
    const s = rng.float(0.5, 1.1);
    flatQuad(gb, 'atlas', rng.float(rc.x0 + 0.6, rc.x1 - 0.6), rng.float(rc.z0 + 0.6, rc.z1 - 0.6), s, s, rng.float(0, Math.PI), Y + 0.01 + k * 0.0004, true, regionUV('confetti'));
  }
  // festoon garlands sagging between the walls just under the ceiling, and a few short twisted streamers
  const garland = (ax, az, bx, bz, sag, col) => {
    const N = 10, tw = regionUV('streamer');
    for (let k = 0; k < N; k++) {
      const t0 = k / N, t1 = (k + 1) / N;
      const y0 = Y + h - 0.06 - Math.sin(t0 * Math.PI) * sag, y1 = Y + h - 0.06 - Math.sin(t1 * Math.PI) * sag;
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
      const nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz) || 1;
      quadN(gb, 'atlas', V(p0[0], y0 - 0.09, p0[1]), V(p1[0], y1 - 0.09, p1[1]), V(p1[0], y1, p1[1]), V(p0[0], y0, p0[1]), [tw[1], tw[2], tw[3], tw[0]], col, [nx / nl, 0, nz / nl]);
    }
  };
  const alongGX = (rc.x1 - rc.x0) >= (rc.z1 - rc.z0);
  for (let k = 0; k < 2 + Math.round((alongGX ? r.w : r.h) * 0.9); k++) {
    const t = (k + 0.5) / (2 + Math.round((alongGX ? r.w : r.h) * 0.9));
    const col = PARTY[rng.int(0, PARTY.length - 1)], sag = rng.float(0.35, 0.7);
    if (alongGX) garland(rc.x0 + (rc.x1 - rc.x0) * t, rc.z0 + 0.1, rc.x0 + (rc.x1 - rc.x0) * t + rng.float(-1.5, 1.5), rc.z1 - 0.1, sag, col);
    else garland(rc.x0 + 0.1, rc.z0 + (rc.z1 - rc.z0) * t, rc.x1 - 0.1, rc.z0 + (rc.z1 - rc.z0) * t + rng.float(-1.5, 1.5), sag, col);
  }
  for (let k = 0; k < r.w * r.h * 0.5; k++) {
    const sx = rng.float(rc.x0 + 0.4, rc.x1 - 0.4), sz = rng.float(rc.z0 + 0.4, rc.z1 - 0.4), len = rng.float(0.4, 0.9), a = rng.float(0, Math.PI);
    const dx = Math.cos(a) * 0.035, dz = Math.sin(a) * 0.035;
    quadN(gb, 'atlas', V(sx - dx, Y + h - len, sz - dz), V(sx + dx, Y + h - len, sz + dz), V(sx + dx, Y + h - 0.02, sz + dz), V(sx - dx, Y + h - 0.02, sz - dz), regionUV('streamer'), PARTY[rng.int(0, PARTY.length - 1)], [dz, 0, -dx]);
  }
  // "=)" graffiti, a HAPPY BIRTHDAY banner, and the party table with a cake nobody ordered
  const walls = K.perimeter(r).filter((e) => { const k = L.edgeKey(e.x, e.z, e.d); return !L.open.has(k) && !L.edgeInfo.has(k); });
  rng.shuffle(walls);
  walls.slice(0, 3).forEach((e, k) => {
    const f = edgeFrame(K, e.x, e.z, e.d);
    if (k === 0) edgeQuad(gb, 'atlas', K, f, 0.4, C - 0.4, Y + h - 0.95, Y + h - 0.35, 0.02, regionUV('banner'));
    else { const s = rng.float(0.9, 1.3); edgeQuad(gb, 'atlas', K, f, C / 2 - s / 2 + rng.float(-0.8, 0.8), C / 2 + s / 2 + rng.float(-0.8, 0.8), Y + 0.9, Y + 0.9 + s, 0.015, regionUV('smiley')); }
  });
  if (navClear(ctx.nav, rcx - 1, rcz - 0.6, rcx + 1, rcz + 0.6)) {
    ctx.placeProp('table', rcx, Y, rcz, 0);
    const ty = Y + 0.78;
    solidBox(gb, 'atlas', rcx, ty + 0.1, rcz, 0.42, 0.2, 0.42, [1, 0.93, 0.9]);
    solidBox(gb, 'atlas', rcx, ty + 0.25, rcz, 0.28, 0.1, 0.28, [1, 0.62, 0.78]);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, cx = rcx + Math.cos(a) * 0.09, cz = rcz + Math.sin(a) * 0.09;
      solidBox(gb, 'atlas', cx, ty + 0.35, cz, 0.015, 0.1, 0.015, PARTY[k]);
      flatQuad(gb, 'lit', cx, cz, 0.012, 0.02, 0, ty + 0.415, true, regionUV('bulb'), [1, 0.8, 0.4]);
    }
    for (let k = 0; k < 4; k++) cone(gb, 'atlas', rcx + rng.float(-0.8, 0.8), ty + 0.001, rcz + rng.chance(0.5) * 0.9 - 0.45, 0.08, 0.24, PARTY[rng.int(0, PARTY.length - 1)]);
  }
}

// ------------------------------------------------------------------------------------------ Level !
function decorateRun(ctx, K, gb, run, emit) {
  const L = ctx.layout, Y = ctx.Y, C = K.C, rng = ctx.rng;
  const cells = run.cells;
  cells.forEach((i, n) => {
    const x = i % L.w, z = Math.floor(i / L.w), h = L.heightOf[i];
    const x0 = K.wx(x), z0 = K.wz(z);
    // red emergency lights (pulsed by the runtime) every other cell
    if (n % 2 === 0) emit(x0 + C / 2, Y + h - 0.35, z0 + C / 2, 0xff2a14, 1.1, 8, { brRun: true, halo: true });
    for (let d = 0; d < 4; d++) {
      const key = L.edgeKey(x, z, d);
      if (L.open.has(key) || L.edgeInfo.has(key)) continue;
      const f = edgeFrame(K, x, z, d);
      // rotating-beacon housings high on the wall, floor LED strips along both walls
      if ((n + d) % 2 === 0) {
        const bx = f.ecx + f.nx * 0.08, bz = f.ecz + f.nz * 0.08;
        solidBox(gb, 'atlas', bx, Y + h - 0.32, bz, 0.26, 0.08, 0.26, [0.2, 0.2, 0.2]);
        solidBox(gb, 'beacon', bx, Y + h - 0.22, bz, 0.16, 0.13, 0.16, [1, 1, 1], 'bulb');
      }
      edgeQuad(gb, 'beacon', K, f, 0, C, Y + 0.04, Y + 0.085, 0.02, regionUV('white'), [1, 0.6, 0.5]);
      if (rng.chance(0.3)) edgeQuad(gb, 'atlas', K, f, C / 2 - 0.9, C / 2 + 0.9, Y + 1.1, Y + 1.8, 0.012, regionUV('run'));
      else if (rng.chance(0.35)) {
        // arrows point "onwards" along the run (towards its far end)
        const flip = (run.axis === 'x' ? f.rx : f.rz) < 0;
        edgeQuad(gb, 'atlas', K, f, C / 2 - 0.6, C / 2 + 0.6, Y + 1.2, Y + 1.8, 0.012, regionUV('arrow', flip));
      }
    }
  });
}

// ------------------------------------------------------------------------------------------ The Manila Room
function decorateManila(ctx, K, gb, man, emit, pillars = []) {
  const L = ctx.layout, Y = ctx.Y, C = K.C, r = man.room, h = r.height;
  const rc = K.roomRect(r);
  const slotKey = man.slot.key;
  const sealed = new Set(man.sealed.map((e) => e.key));
  // inside: manila paper on every wall (full overlay 2 cm in front of the wallpaper), red carpet on the floor
  for (const e of K.perimeter(r)) {
    const key = L.edgeKey(e.x, e.z, e.d), f = edgeFrame(K, e.x, e.z, e.d);
    const info = L.edgeInfo.get(key);
    const OFF = 0.02;
    if (key === slotKey) {
      const a = (C - SLOT_W) / 2, b = (C + SLOT_W) / 2;
      edgeQuad(gb, 'manila', K, f, 0, a, Y, Y + h, OFF, edgeWorldUV(K, f, 0, a, Y, Y + h));
      edgeQuad(gb, 'manila', K, f, b, C, Y, Y + h, OFF, edgeWorldUV(K, f, b, C, Y, Y + h));
      edgeQuad(gb, 'manila', K, f, a, b, Y + SLOT_H, Y + h, OFF, edgeWorldUV(K, f, a, b, Y + SLOT_H, Y + h));
      // slot panels: close the arch down to a narrow gap (wallpaper outside, jambs), colliders
      const s0 = (C - info.width) / 2, s1 = (C + info.width) / 2, dh = info.doorH;
      const out = { ...f, nx: -f.nx, nz: -f.nz, rx: -f.rx, rz: -f.rz };
      const mir = (s) => C - s;   // along coordinate seen from the other side
      edgeQuad(gb, 'wall', K, out, mir(a), mir(s0), Y, Y + dh, SEAL_OFF, edgeWorldUV(K, out, mir(a), mir(s0), Y, Y + dh));
      edgeQuad(gb, 'wall', K, out, mir(s1), mir(b), Y, Y + dh, SEAL_OFF, edgeWorldUV(K, out, mir(s1), mir(b), Y, Y + dh));
      edgeQuad(gb, 'wall', K, out, mir(b), mir(a), Y + SLOT_H, Y + dh, SEAL_OFF, edgeWorldUV(K, out, mir(b), mir(a), Y + SLOT_H, Y + dh));
      // jambs + head of the slot (thin reveals)
      for (const s of [a, b]) {
        const px = f.ecx + f.rx * (s - C / 2), pz = f.ecz + f.rz * (s - C / 2);
        const n = s === a ? [f.rx, 0, f.rz] : [-f.rx, 0, -f.rz];
        quadN(gb, 'wall', V(px - f.nx * SEAL_OFF, Y, pz - f.nz * SEAL_OFF), V(px + f.nx * OFF, Y, pz + f.nz * OFF), V(px + f.nx * OFF, Y + SLOT_H, pz + f.nz * OFF), V(px - f.nx * SEAL_OFF, Y + SLOT_H, pz - f.nz * SEAL_OFF), [[0, 0], [0.02, 0], [0.02, 1], [0, 1]], WHITE, n);
      }
      {
        const pa = [f.ecx + f.rx * (a - C / 2), f.ecz + f.rz * (a - C / 2)], pb = [f.ecx + f.rx * (b - C / 2), f.ecz + f.rz * (b - C / 2)];
        quadN(gb, 'wall', V(pa[0] - f.nx * SEAL_OFF, Y + SLOT_H, pa[1] - f.nz * SEAL_OFF), V(pb[0] - f.nx * SEAL_OFF, Y + SLOT_H, pb[1] - f.nz * SEAL_OFF), V(pb[0] + f.nx * OFF, Y + SLOT_H, pb[1] + f.nz * OFF), V(pa[0] + f.nx * OFF, Y + SLOT_H, pa[1] + f.nz * OFF), [[0, 0], [0.5, 0], [0.5, 0.06], [0, 0.06]], WHITE, [0, -1, 0]);
      }
      const colAt = (s0_, s1_, y0, y1) => {
        const m = (s0_ + s1_) / 2, cx = f.ecx + f.rx * (m - C / 2) - f.nx * 0.04, cz = f.ecz + f.rz * (m - C / 2) - f.nz * 0.04;
        const lenA = s1_ - s0_;
        ctx.addBox(cx, (y0 + y1) / 2, cz, Math.abs(f.rx) * lenA + Math.abs(f.nx) * 0.14, y1 - y0, Math.abs(f.rz) * lenA + Math.abs(f.nz) * 0.14);
      };
      colAt(s0, a, Y, Y + dh); colAt(b, s1, Y, Y + dh); colAt(a, b, Y + SLOT_H, Y + dh);
      continue;
    }
    edgeQuad(gb, 'manila', K, f, 0, C, Y, Y + h, OFF, edgeWorldUV(K, f, 0, C, Y, Y + h));
    if (sealed.has(key)) {
      // the arch is walled up: wallpaper on the outside, a collider, and the nav edge closed
      const s0 = (C - info.width) / 2, s1 = (C + info.width) / 2, dh = info.doorH;
      const out = { ...f, nx: -f.nx, nz: -f.nz, rx: -f.rx, rz: -f.rz };
      edgeQuad(gb, 'wall', K, out, C - s1, C - s0, Y, Y + dh, SEAL_OFF, edgeWorldUV(K, out, C - s1, C - s0, Y, Y + dh));
      const m = C / 2, cx = f.ecx + f.rx * (m - C / 2) - f.nx * 0.04, cz = f.ecz + f.rz * (m - C / 2) - f.nz * 0.04;
      ctx.addBox(cx, Y + dh / 2, cz, Math.abs(f.rx) * info.width + Math.abs(f.nx) * 0.14, dh, Math.abs(f.rz) * info.width + Math.abs(f.nz) * 0.14);
      ctx.nav.blockedEdges.add(key);
      // outside baseboard across the sealed gap
      edgeQuad(gb, 'atlas', K, out, C - s1, C - s0, Y, Y + 0.11, SEAL_OFF + 0.018, SUB_UV('baseboard', 0, info.width / 4));
    }
    // baseboard inside
    edgeQuad(gb, 'atlas', K, f, 0, C, Y, Y + 0.11, 0.032, SUB_UV('baseboard', 0, 1), [0.62, 0.3, 0.26]);
  }
  gb.hrect('redcarpet', rc.x0, rc.z0, rc.x1, rc.z1, Y + 0.01, true, 0.5, WHITE);
  // a single warm lamp, a desk with the prize on it, and a note
  const rcx = (rc.x0 + rc.x1) / 2, rcz = (rc.z0 + rc.z1) / 2;
  // the desk (and the prize on it) goes to the free spot nearest the middle - the room's centre may hold a pillar
  const spots = [];
  for (let gz = rc.z0 + 1.1; gz <= rc.z1 - 1.1; gz += 0.5) for (let gx = rc.x0 + 1.3; gx <= rc.x1 - 1.3; gx += 0.5) spots.push([gx, gz, Math.hypot(gx - rcx, gz - rcz)]);
  spots.sort((a, b) => a[2] - b[2]);
  // (the 1 m nav grid can miss a 0.6 m pillar standing on a cell centre, so keep clear of the known ones as well)
  const clearOfPillars = (x, z, r0) => pillars.every(([px, pz]) => Math.abs(px - x) > r0 + 0.35 || Math.abs(pz - z) > 0.95);
  const desk = spots.find(([x, z]) => clearOfPillars(x, z, 0.95) && navClear(ctx.nav, x - 0.9, z - 0.6, x + 0.9, z + 0.6, 0.15));
  if (desk) {
    ctx.placeProp('desk', desk[0], Y, desk[1], 0);
    man.loot = { x: desk[0], z: desk[1] }; man.lootY = Y + 0.95;
  } else {
    const free = spots.find(([x, z]) => clearOfPillars(x, z, 0.4) && navClear(ctx.nav, x - 0.35, z - 0.35, x + 0.35, z + 0.35, 0.1)) || [rcx + 1, rcz + 1];
    man.loot = { x: free[0], z: free[1] }; man.lootY = Y + 0.2;
  }
  emit(man.loot.x, Y + h - 0.5, man.loot.z, 0xffd6a0, 0.9, 8, { flicker: 0.08 });
  const walls = K.perimeter(r).filter((e) => { const k = L.edgeKey(e.x, e.z, e.d); return !L.open.has(k) && !L.edgeInfo.has(k); });
  if (walls.length) { const e = walls[0], f = edgeFrame(K, e.x, e.z, e.d); edgeQuad(gb, 'atlas', K, f, C / 2 - 0.2, C / 2 + 0.2, Y + 1.35, Y + 1.65, 0.03, regionUV('note')); }
  ctx.scrapSpots.push({ x: man.loot.x + 0.6, y: Y, z: man.loot.z + 0.9, room: r.id, type: 'manila', dist: K.roomDist(r) });
}
