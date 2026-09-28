// MINESHAFT - third facility interior theme (next to factory & mansion).
// Timbered dirt tunnels, mine-cart rails, hanging cage lanterns, rubble, stalactite caverns,
// ore veins with glowing crystals, flooded caves. Very different silhouette from the tiled
// factory / wallpapered mansion: low warm light pools, wooden frames every ~2 cells, rock walls.
//
// Exports
//   MINESHAFT_THEME              room/corridor style table (same shape as THEMES.* in facility.js)
//   MINESHAFT_ROOM_TYPES         [type, weight, big?] for generateLayout's room type assignment
//   mineshaftRoomHeight(t, rng)  ceiling height for a mine room type (uses the LAYOUT rng)
//   decorateMineshaft(ctx)       frames / rails / lanterns / rubble / carts / stalactites ...
//                                ctx = { layout, group, physics, lightPool, rng, addBox, placeProp, nav,
//                                        Y, CELL, levelMaterial, GeoBuilder, emitters,
//                                        darkCells?, setPieces?, reserved? }
//                                darkCells: optional Set of corridor cell indices whose lamps are broken
//                                (setpieces.js planDarkCorridors) - lanterns there are placed dead.
//                                setPieces: optional buildSetPieces() result (built before this call):
//                                catwalk stairs / bridges / steam jets stay clear of mine solids.
//                                reserved: optional { edges:[{x,z,d}], wall:[{x,z}], floor:[{x,z}] } -
//                                wall edges (posters), wall-mounted gameplay spots (mimic-door wallSpots,
//                                vent covers, fuse boxes) and floor spawn points (vent / turret / door
//                                spawns) that the decoration must not bury. Vent covers, fuse boxes and
//                                steam pipes are also detected from the placed props themselves.
//   MINESHAFT_EXT_SCRAP          mining-themed 'x_*' scrap weights (added only if the model loaded)
//   mineshaftFootstep(fac, p, has)   footstep surface ('gravel' | 'mud' | 'wood' | ...) at a position
//   mineshaftAmbience(audio)     ambience loop name for the mine (never an undecoded external-only loop)
//
// Rules: everything is deterministic from ctx.rng (seeded, never Math.random) plus the layout, the
// props already placed and the setpieces (all identical on every peer). Solids, wall lanterns,
// crystals, tools and chain lanterns that may be refused draw from rng.fork(), and wall rock draws the
// same numbers whether or not it is emitted, so a refusal barely touches the main random stream.
// Nothing buries reserved spots (see ctx.reserved), doorway aprons, catwalk stairs / bridges or placed
// props, and solids never cut a room / corridor apart on the nav grid. Geometry is merged per material into a few meshes under ctx.group,
// colliders go through ctx.addBox and lights into ctx.emitters, so the facility's own dispose()
// (colliders, emitters, geometries) cleans everything up. No per-frame work.
import * as THREE from 'three';

// ------------------------------------------------------------------------------------ theme data
export const MINESHAFT_THEME = {
  corridor: { floor: 'dirt', wall: 'rock', ceil: 'rock', base: null },
  rooms: {
    entrance: {
      floor: 'wood_planks', wall: 'rock', ceil: 'wood_dark', lamp: null,
      wall_: ['bench', 'crate_wood', 'barrel', 'ext:ks_barrel'], clutter: ['pallet', 'crate_wood', 'ext:retro_bucket'], posters: 1,
    },
    cavern: {
      floor: 'rock', wall: 'rock', ceil: 'rock', lamp: null, center: [],
      wall_: ['rock_small', 'ext:kk_stone_chunks', 'ext:kk_log_stack', 'crate_wood', 'barrel'],
      clutter: ['rock_small', 'ext:kk_stone_chunks', 'hanging_chains'],
    },
    minecart_depot: {
      floor: 'dirt', wall: 'wood_planks', ceil: 'wood_dark', lamp: null,
      wall_: ['crate_wood', 'barrel', 'pallet', 'ext:kst_skip_rocks', 'ext:kk_fuel_barrels', 'ext:ks_box_large'],
      clutter: ['crate_wood', 'ext:ks_box', 'ext:kk_parts_pile_large', 'barrel'],
    },
    ore_vein: {
      floor: 'rock', wall: 'rock', ceil: 'rock', lamp: null,
      wall_: ['ext:kst_skip_rocks', 'rock_small', 'ext:kk_stone_chunks', 'ext:ks_bucket'],
      clutter: ['rock_small', 'ext:kk_stone_chunks', 'ext:kk_iron_bars_stack'],
    },
    supply_cache: {
      floor: 'wood_planks', wall: 'wood_dark', ceil: 'wood_dark', lamp: null, rows: 'crate_wood',
      wall_: ['crate_wood', 'barrel', 'ext:ks_barrel', 'ext:ks_box_large', 'ext:ind_box_wood', 'shelf_metal'],
      clutter: ['crate_wood', 'cardboard_boxes', 'ext:ks_box', 'ext:kk_pallet', 'barrel'],
    },
    collapsed_shaft: {
      floor: 'rock', wall: 'rock', ceil: 'wood_dark', lamp: null,
      wall_: ['rock_small', 'ext:kk_log_stack', 'ext:kk_stone_chunks'], clutter: ['rock_small', 'rock_small', 'ext:kk_stone_chunks', 'cobweb'],
    },
    flooded_cave: {
      floor: 'mud', wall: 'rock', ceil: 'rock', lamp: null,
      wall_: ['rock_small', 'barrel', 'ext:ks_bucket'], clutter: ['rock_small', 'barrel_toxic'],
    },
    crew_quarters: {
      floor: 'wood_planks', wall: 'wood_dark', ceil: 'wood_dark', lamp: null, center: ['table'],
      wall_: ['bunkbed', 'locker', 'bench', 'ext:ks_workbench'], clutter: ['barrel', 'crate_wood', 'ext:psx_trash_bag', 'ext:ks_bucket'], posters: 1,
    },
    generator: {
      floor: 'concrete_dark', wall: 'rock', ceil: 'wood_dark', lamp: 'ceiling_lamp',
      wall_: ['generator', 'fuse_box', 'ext:psx_transformer'], clutter: ['barrel', 'ext:kk_fuel_barrels'], reactor: true,
    },
    vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
    nest: {
      floor: 'mud', wall: 'rock', ceil: 'rock', lamp: null, wall_: [],
      clutter: ['cobweb', 'hanging_chains', 'rock_small', 'ext:psx_mattress'], webs: true,
    },
  },
};

// [type, weight, big?] - same format as factoryTypes / mansionTypes in generateLayout
export const MINESHAFT_ROOM_TYPES = [
  ['cavern', 5, true], ['minecart_depot', 3, true], ['flooded_cave', 2, true],
  ['ore_vein', 4], ['supply_cache', 4], ['collapsed_shaft', 2], ['crew_quarters', 3], ['nest', 1],
];

// Ceiling height per mine room type. Called from generateLayout with the layout rng (vault /
// generator are forced to 4 by the generator right after this).
export function mineshaftRoomHeight(type, rng) {
  switch (type) {
    case 'cavern': return rng.float(6.5, 9.0);
    case 'flooded_cave': return rng.float(5.0, 5.8);
    case 'minecart_depot': return rng.float(4.6, 5.4);
    case 'collapsed_shaft': return rng.float(4.2, 5.2);
    case 'nest': return rng.float(4.0, 5.6);
    case 'ore_vein': return rng.float(3.7, 4.5);
    case 'entrance': return 4.2;
    case 'supply_cache': case 'crew_quarters': return 3.7;
    default: return 4.0;
  }
}

// Mining scrap from the downloaded models (extcontent.js registers these only when the GLB loaded).
export const MINESHAFT_EXT_SCRAP = {
  x_nuggets: 9, x_copper: 12, x_silverbar: 5, x_goldbars: 2, x_jerrycan: 7, x_chest: 3, x_padlock: 3,
  x_keyring: 3, x_heater: 2, x_clock: 2, x_bottle: 5, x_multimeter: 2,
  x_pickaxe: 7, x_hammer: 5, x_wrench: 4, x_axe: 3,
};

const FLOOR_STEP = { wood_planks: 'wood', wood_dark: 'wood', wood_floor: 'wood', mud: 'mud', metal_plate: 'metal', concrete_dark: 'concrete', concrete: 'concrete', dirt: 'gravel', rock: 'gravel' };
// Footstep surface inside a mineshaft. has(name) -> bool (audio.has); 'gravel' needs the downloaded
// step_gravel_* set, otherwise mud (procedural) is used so steps are never silent.
export function mineshaftFootstep(fac, pos, has) {
  const L = fac?.layout;
  if (!L) return 'concrete';
  let floor = MINESHAFT_THEME.corridor.floor;
  const i = fac.cellAt ? fac.cellAt(pos.x, pos.z) : -1;
  if (i >= 0) {
    const r = L.roomOf[i];
    if (r >= 0) floor = MINESHAFT_THEME.rooms[L.rooms[r]?.type]?.floor || floor;
  }
  const surf = FLOOR_STEP[floor] || 'gravel';
  if (surf === 'gravel' && has && !has('step_gravel_1')) return 'mud';
  return surf;
}

// Preferred mine drones (downloaded .ogg only - no procedural sfxlib version) and the fallback that
// always plays (procedural 'ambience_facility'). audio.setAmbience() re-calls itself when a pending
// load resolves; for an external-only name whose fetch/decode fails that would retry forever, so an
// external loop is only returned once its buffer is decoded. Until then (or if it never loads) the
// fallback plays and the next updateAmbience() cross-fades to the drone when it is ready.
export const MINESHAFT_AMBIENCE = ['amb_drone_3', 'ambience_facility_2'];
export const MINESHAFT_AMBIENCE_FALLBACK = 'ambience_facility';
// a: the AudioManager (game.audio). Anything else (e.g. an older has(name) callback) -> fallback.
export function mineshaftAmbience(a) {
  if (!a || typeof a !== 'object' || typeof a.getBuffer !== 'function' || typeof a.has !== 'function' || !a.buffers?.get) return MINESHAFT_AMBIENCE_FALLBACK;
  for (const n of MINESHAFT_AMBIENCE) {
    if (!a.has(n)) continue;              // not shipped, or its load already failed (audio drops it)
    if (a.buffers.get(n)) return n;       // decoded: play() starts it synchronously
    a.getBuffer(n);                       // start / keep loading it; switch over once decoded
    return MINESHAFT_AMBIENCE_FALLBACK;
  }
  return MINESHAFT_AMBIENCE_FALLBACK;
}

// ------------------------------------------------------------------------------ geometry helpers
const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const INWARD = [[-1, 0], [0, -1], [1, 0], [0, 1]];   // from edge d back into the cell
const SKIP_BOTTOM = 1 << 5;
const LANTERN = 0xffa552, CRYSTAL = 0x58d0ff;
// setpieces.js puts catwalks (1.2 m deck at 3.4 m, +0.42 inset at blast doors) into rooms >= 6 m tall;
// tall caverns keep that band clear: nothing between 3.2 m and CATWALK_TOP within CATWALK_BAND of a wall.
const CATWALK_MIN_H = 6, CATWALK_TOP = 5.7, CATWALK_BAND = 1.75;

// box faces in local space: normal n, tangents u, v with u x v = n (so GeoBuilder.quad faces outward)
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];
const QUAD = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// corner(a, b, c) with a, b, c in {-1, 1} -> world Vector3 (must be a proper, right-handed mapping)
function emitFaces(gb, key, corner, half, color, skip = 0, uvScale = 0.5) {
  for (let f = 0; f < 6; f++) {
    if (skip & (1 << f)) continue;
    const { n, u, v } = FACES[f];
    const p = QUAD.map(([a, b]) => corner(n[0] + a * u[0] + b * v[0], n[1] + a * u[1] + b * v[1], n[2] + a * u[2] + b * v[2]));
    const su = 2 * (Math.abs(u[0]) * half[0] + Math.abs(u[1]) * half[1] + Math.abs(u[2]) * half[2]) * uvScale;
    const sv = 2 * (Math.abs(v[0]) * half[0] + Math.abs(v[1]) * half[1] + Math.abs(v[2]) * half[2]) * uvScale;
    gb.quad(key, p[0], p[1], p[2], p[3], [[0, 0], [su, 0], [su, sv], [0, sv]], color);
  }
}

// box of size (sx, sy, sz) centred at (cx, cy, cz) in the local frame M (null = world axes)
function mbox(gb, key, M, cx, cy, cz, sx, sy, sz, color, skip = 0) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  emitFaces(gb, key, (a, b, c) => {
    const p = new V3(cx + a * hx, cy + b * hy, cz + c * hz);
    return M ? p.applyMatrix4(M) : p;
  }, [hx, hy, hz], color, skip);
}

// box running from point a to point b (local Y along a->b), cross section w x d
function beam(gb, key, a, b, w, d, color) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) return;
  const ay = dir.multiplyScalar(1 / len);
  const ref = Math.abs(ay.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const ax = new V3().crossVectors(ay, ref).normalize();
  const az = new V3().crossVectors(ax, ay);
  const M = new THREE.Matrix4().makeBasis(ax, ay, az).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  mbox(gb, key, M, 0, 0, 0, w, len, d, color);
}

// jittered box = cheap low-poly rock (12 tris). M optional local frame.
function lump(gb, key, M, x, y, z, sx, sy, sz, r, color, jit = 0.3, yaw = 0, flatBottom = true) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const pts = new Array(8);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const A = a ? 1 : -1, B = b ? 1 : -1, Cc = c ? 1 : -1;
    let px = A * sx / 2 * (1 + (r.next() - 0.5) * 2 * jit);
    let py = B * sy / 2 * (1 + (r.next() - 0.5) * 2 * jit);
    let pz = Cc * sz / 2 * (1 + (r.next() - 0.5) * 2 * jit);
    if (B > 0) { px *= 0.55 + r.next() * 0.35; pz *= 0.55 + r.next() * 0.35; }
    if (flatBottom && B < 0) py = -sy / 2;
    const p = new V3(x + px * cs + pz * sn, y + py, z - px * sn + pz * cs);
    pts[a * 4 + b * 2 + c] = M ? p.applyMatrix4(M) : p;
  }
  emitFaces(gb, key, (a, b, c) => pts[(a > 0 ? 4 : 0) + (b > 0 ? 2 : 0) + (c > 0 ? 1 : 0)], [sx / 2, sy / 2, sz / 2], color);
}

// rock lump growing out of a wall plane (flat back on the plane, never pokes through to the other side).
// t is measured along the WORLD axis of the wall (x for d=1/3, z for d=0/2), like every caller's
// `ex + (iz ? t : 0)`. clear(lo, hi) optional: false -> nothing emitted (rng draws are identical either
// way, so a rejection never shifts the random stream). Returns true if emitted.
function wallLump(gb, key, ex, ez, d, t, y, w, h, prot, r, color, jit = 0.3, clear = null) {
  const inw = INWARD[d];
  let along = d === 0 || d === 2 ? [0, 1] : [1, 0];
  // make (along, up, inward) right-handed: along x up must equal inward. Flipping the local axis must
  // not move the lump: negate t with it so it stays at world offset t.
  const cross = [-along[1], along[0]];   // (ax,0,az) x (0,1,0) = (-az, 0, ax)
  if (cross[0] * inw[0] + cross[1] * inw[1] < 0) { along = [-along[0], -along[1]]; t = -t; }
  const pts = new Array(8);
  const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const A = a ? 1 : -1, B = b ? 1 : -1;
    const tt = t + A * w / 2 * (1 + (r.next() - 0.5) * 2 * jit);
    const yy = y + B * h / 2 * (1 + (r.next() - 0.5) * 2 * jit);
    const nn = c ? prot * (0.6 + r.next() * 0.6) : 0.01;
    const p = new V3(ex + along[0] * tt + inw[0] * nn, yy, ez + along[1] * tt + inw[1] * nn);
    pts[a * 4 + b * 2 + c] = p;
    lo.min(p); hi.max(p);
  }
  if (clear && !clear(lo, hi)) return false;
  emitFaces(gb, key, (a, b, c) => pts[(a > 0 ? 4 : 0) + (b > 0 ? 2 : 0) + (c > 0 ? 1 : 0)], [w / 2, h / 2, prot / 2], color);
  return true;
}

// pyramid spike (stalactite / stalagmite / crystal) from base point along unit dir
function spike(gb, key, base, dir, rad, len, r, color, sides = 5) {
  const ref = Math.abs(dir.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  const p = new V3().crossVectors(dir, ref).normalize();
  const q = new V3().crossVectors(dir, p);
  const a0 = r.next() * TAU;
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = a0 + (i / sides) * TAU, rr = rad * (0.75 + r.next() * 0.5);
    ring.push(new V3().copy(base).addScaledVector(p, Math.cos(a) * rr).addScaledVector(q, Math.sin(a) * rr));
  }
  const tip = new V3().copy(base).addScaledVector(dir, len)
    .addScaledVector(p, (r.next() - 0.5) * rad * 0.5).addScaledVector(q, (r.next() - 0.5) * rad * 0.5);
  const e1 = new V3(), e2 = new V3(), nrm = new V3(), mid = new V3();
  for (let i = 0; i < sides; i++) {
    let a = ring[i], b = ring[(i + 1) % sides];
    e1.subVectors(b, a); e2.subVectors(tip, a); nrm.crossVectors(e1, e2);
    mid.addVectors(a, b).multiplyScalar(0.5).sub(base);
    if (nrm.dot(mid) < 0) { const t = a; a = b; b = t; }
    const s = rad * 0.5;
    gb.quad(key, a, b, tip, tip, [[0, 0], [s, 0], [s * 0.5, len * 0.5], [s * 0.5, len * 0.5]], color);
  }
}

function frameMatrix(x, y, z, yaw) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw), new V3(1, 1, 1));
}
function aabbOf(M, min, max) {
  const lo = new V3(Infinity, Infinity, Infinity), hi = new V3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    const p = new V3(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]).applyMatrix4(M);
    lo.min(p); hi.max(p);
  }
  return { lo, hi };
}
const tint = (r, lo = 0.72, hi = 1.05, warm = 0) => { const t = lo + r.next() * (hi - lo); return [t, t * (0.96 - warm * 0.05), t * (0.9 - warm * 0.1)]; };

// ---------------------------------------------------------------------------------- nav safety
// Blocking a nav box must never cut a room/corridor cell into pieces or cover a doorway strip.
function makeNavGuard(L, nav) {
  if (!nav || !nav.walk || !nav.w) return null;
  const NW = nav.w, NH = nav.h, sub = nav.sub, res = nav.res || 1;
  const mark = new Uint32Array(NW * NH);
  const queue = new Int32Array(NW * NH);
  let stamp = 0;
  const regions = new Map();
  const region = (key, cells) => {
    let reg = regions.get(key);
    if (reg) return reg;
    const set = new Set(cells);
    const seeds = [];
    for (const ci of set) {
      const x = ci % L.w, z = (ci / L.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], nz = z + DZ[d];
        if (nx >= 0 && nz >= 0 && nx < L.w && nz < L.h && set.has(nz * L.w + nx)) continue;
        const k = L.edgeKey(x, z, d);
        if (!L.open.has(k) && !L.edgeInfo.has(k)) continue;
        for (let s = 0; s < sub; s++) {
          let gx, gz;
          if (d === 0) { gx = x * sub + sub - 1; gz = z * sub + s; } else if (d === 2) { gx = x * sub; gz = z * sub + s; } else if (d === 1) { gx = x * sub + s; gz = z * sub + sub - 1; } else { gx = x * sub + s; gz = z * sub; }
          seeds.push(gz * NW + gx);
        }
      }
    }
    reg = { set, seeds };
    regions.set(key, reg);
    return reg;
  };
  const cellOfSub = (i) => Math.floor(((i / NW) | 0) / sub) * L.w + Math.floor((i % NW) / sub);
  const bfs = (reg, blocked) => {
    stamp++;
    let qh = 0, qt = 0;
    for (const s of reg.seeds) {
      if (nav.walk[s] !== 1 || mark[s] === stamp || (blocked && blocked.has(s))) continue;
      mark[s] = stamp; queue[qt++] = s;
    }
    while (qh < qt) {
      const c = queue[qh++];
      const gx = c % NW, gz = (c / NW) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = gx + DX[d], nz = gz + DZ[d];
        if (nx < 0 || nz < 0 || nx >= NW || nz >= NH) continue;
        const n = nz * NW + nx;
        if (mark[n] === stamp || (blocked && blocked.has(n))) continue;
        if (!reg.set.has(cellOfSub(n))) continue;
        if (nav.canStep ? !nav.canStep(gx, gz, nx, nz) : nav.walk[n] !== 1) continue;
        mark[n] = stamp; queue[qt++] = n;
      }
    }
    return qt;
  };
  return {
    // Sub-cells a solid footprint takes off the nav grid: NavGrid.blockBox's selection (sub-cell centre
    // inside the padded box) + every sub-cell the footprint itself covers deeper than `inset` (so no
    // scrap / item spot ends up inside the collider) + at least the sub-cell under its centre (small
    // stalagmites between sub-cell centres used to block nothing).
    cellsOf(minX, minZ, maxX, maxZ, pad, inset = 0.1) {
      const out = new Set();
      const x0 = Math.floor((minX - pad - nav.ox) / res), x1 = Math.floor((maxX + pad - nav.ox) / res);
      const z0 = Math.floor((minZ - pad - nav.oz) / res), z1 = Math.floor((maxZ + pad - nav.oz) / res);
      for (let z = Math.max(0, z0); z <= Math.min(NH - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(NW - 1, x1); x++) {
        const cx = nav.ox + (x + 0.5) * res, cz = nav.oz + (z + 0.5) * res;
        const centreIn = cx >= minX - pad && cx <= maxX + pad && cz >= minZ - pad && cz <= maxZ + pad;
        const sx0 = nav.ox + x * res, sz0 = nav.oz + z * res;
        const covers = minX + inset < sx0 + res && maxX - inset > sx0 && minZ + inset < sz0 + res && maxZ - inset > sz0;
        if (centreIn || covers) out.add(z * NW + x);
      }
      if (!out.size) {
        const gx = Math.floor(((minX + maxX) / 2 - nav.ox) / res), gz = Math.floor(((minZ + maxZ) / 2 - nav.oz) / res);
        if (gx >= 0 && gz >= 0 && gx < NW && gz < NH) out.add(gz * NW + gx);
      }
      return out;
    },
    block(set) { for (const c of set) nav.walk[c] = 0; },
    ok(key, cells, blocked) {
      const reg = region(key, cells);
      for (const b of blocked) if (nav.walk[b] !== 1 || !reg.set.has(cellOfSub(b))) return false;
      for (const s of reg.seeds) if (blocked.has(s)) return false;
      if (!reg.seeds.length) return true;
      const base = bfs(reg, null);
      const baseStamp = stamp;
      let lost = 0;
      for (const b of blocked) if (mark[b] === baseStamp) lost++;
      return bfs(reg, blocked) === base - lost;
    },
  };
}

// ---------------------------------------------------------------------------------- decoration
export function decorateMineshaft(ctx) {
  const L = ctx.layout;
  const { group, rng, addBox, placeProp, nav, emitters } = ctx;
  const Y = ctx.Y ?? L.y, C = ctx.CELL ?? L.cell, W = L.w, H = L.h;
  const levelMaterial = ctx.levelMaterial;
  const gb = new ctx.GeoBuilder();
  const guard = makeNavGuard(L, nav);
  const dark = ctx.darkCells && typeof ctx.darkCells.has === 'function' ? ctx.darkCells : null;
  // if the host already pushed the facility emitters into the light pool, add ours directly too
  const lightsLive = !!(ctx.lightPool?.emitters?.has && emitters.some((e) => ctx.lightPool.emitters.has(e)));
  const added = [];
  const stats = { frames: 0, portals: 0, lanterns: 0, railCells: 0, carts: 0, rubble: 0, stalactites: 0, stalagmites: 0, pillars: 0, crates: 0, crystals: 0, blocked: 0, rejected: 0,
    rejSetpiece: 0, rejDoor: 0, rejSpot: 0, rejProp: 0, rejNav: 0, skippedWall: 0 };

  const wx = (x) => L.ox + x * C, wz = (z) => L.oz + z * C;
  const cidx = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const isOpen = (x, z, d) => { const k = L.edgeKey(x, z, d); return L.open.has(k) || L.edgeInfo.has(k); };
  const edgeCenter = (x, z, d) => d === 0 ? [wx(x + 1), wz(z) + C / 2] : d === 2 ? [wx(x), wz(z) + C / 2] : d === 1 ? [wx(x) + C / 2, wz(z + 1)] : [wx(x) + C / 2, wz(z)];

  const addLight = (pos, color, intensity, distance, flicker = 0, grp = 'facility') => {
    const e = { pos, color, intensity, distance, group: grp, flicker };
    emitters.push(e);
    added.push(e);
  };

  // ---- what the decoration must leave alone ----
  // world AABBs of every prop already placed (facility wall props, vent covers, fuse boxes, doors, lamps,
  // setpieces stairs / steam pipes ...), bucketed per layout cell. Our own timber, crates, lanterns and
  // tools are added as built; our wall rock is added flagged `rock` (rock may merge with rock).
  const propBuckets = new Map();
  const addPropBox = (bb) => {
    const gx0 = Math.max(0, Math.floor((bb.min.x - L.ox) / C)), gx1 = Math.min(W - 1, Math.floor((bb.max.x - L.ox) / C));
    const gz0 = Math.max(0, Math.floor((bb.min.z - L.oz) / C)), gz1 = Math.min(H - 1, Math.floor((bb.max.z - L.oz) / C));
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const k = cidx(gx, gz);
      let a = propBuckets.get(k);
      if (!a) propBuckets.set(k, (a = []));
      a.push(bb);
    }
  };
  const addBoxAt = (x0, y0, z0, x1, y1, z1, rock = false) => {
    const bb = new THREE.Box3(new V3(x0, y0, z0), new V3(x1, y1, z1));
    if (rock) bb.rock = true;
    addPropBox(bb);
  };
  let hitStamp = 0;
  const propHit = (x0, y0, z0, x1, y1, z1, m = 0.03, withRock = false) => {
    const gx0 = Math.max(0, Math.floor((x0 - m - L.ox) / C)), gx1 = Math.min(W - 1, Math.floor((x1 + m - L.ox) / C));
    const gz0 = Math.max(0, Math.floor((z0 - m - L.oz) / C)), gz1 = Math.min(H - 1, Math.floor((z1 + m - L.oz) / C));
    hitStamp++;
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const a = propBuckets.get(cidx(gx, gz));
      if (!a) continue;
      for (const b of a) {
        if (b._s === hitStamp || (b.rock && !withRock)) continue;
        b._s = hitStamp;
        if (b.max.x > x0 - m && b.min.x < x1 + m && b.max.y > y0 - m && b.min.y < y1 + m && b.max.z > z0 - m && b.min.z < z1 + m) return true;
      }
    }
    return false;
  };
  const addPropObj = (o) => {
    if (!o) return null;
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.isEmpty() || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return null;
    addPropBox(bb);
    return bb;
  };
  // wall edges nothing may grow on (key per cell SIDE: the other side of the same wall is separate)
  const resEdges = new Set();
  const sideKey = (x, z, d) => (z * W + x) * 4 + d;
  const isReserved = (x, z, d) => resEdges.has(sideKey(x, z, d));
  const KEEP_R = 0.75;                 // solids stay this far from a reserved floor point
  const keepPts = [];                  // floor points: spawn spots, standing space in front of wall spots
  const keepRects = [];                // { x0, z0, x1, z1, y0, y1 } world boxes solids may not enter
  const aprons = [];                   // floor in front of every doorway (both sides)
  const reserveWallPoint = (px, pz) => {
    const gx = Math.floor((px - L.ox) / C), gz = Math.floor((pz - L.oz) / C);
    if (!inb(gx, gz)) return;
    const dist = [wx(gx + 1) - px, wz(gz + 1) - pz, px - wx(gx), pz - wz(gz)];
    let d = 0;
    for (let k = 1; k < 4; k++) if (dist[k] < dist[d]) d = k;
    if (!(dist[d] <= 0.8)) return;
    resEdges.add(sideKey(gx, gz, d));
    const [ix, iz] = INWARD[d];
    keepPts.push({ x: px + ix * (0.9 - dist[d]), z: pz + iz * (0.9 - dist[d]) });
  };
  const WALL_KEEP = new Set(['vent_cover', 'fuse_box', 'pipe_vertical', 'keypad']);
  for (const o of group.children) {
    const ud = o.userData;
    if (!ud || !(ud.propId || ud.ext)) continue;
    addPropObj(o);
    if (WALL_KEEP.has(ud.propId)) reserveWallPoint(o.position.x, o.position.z);
  }
  const res = ctx.reserved || {};
  const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
  for (const e of res.edges || []) if (e && Number.isInteger(e.x) && Number.isInteger(e.z) && e.d >= 0 && e.d < 4 && inb(e.x, e.z)) resEdges.add(sideKey(e.x, e.z, e.d));
  for (const p of res.wall || []) if (finite(p)) reserveWallPoint(p.x, p.z);
  for (const p of res.floor || []) if (finite(p) && !p.elevated) keepPts.push({ x: p.x, z: p.z });
  // setpieces (built before us): catwalk stairs + their approach, bridges, deck ring, steam jets
  const spc = ctx.setPieces || null;
  const catwalkRooms = new Set();
  const rect6 = (a, m, y0, y1) => ({ x0: a.x0 - m, z0: a.z0 - m, x1: a.x1 + m, z1: a.z1 + m, y0, y1 });
  for (const cw of spc?.catwalks || []) {
    catwalkRooms.add(cw.room);
    const top = cw.top ?? Y + 3.4;
    for (const s of cw.stairs || []) {
      if (s.fp) keepRects.push(rect6(s.fp, 0.3, Y - 1, top + 2.0));
      if (s.ap) keepRects.push(rect6(s.ap, 0.3, Y - 1, Y + 2.2));
    }
    if (cw.bridge?.rect) keepRects.push(rect6(cw.bridge.rect, 0.3, top - 0.35, top + 2.0));
    const a = cw.ring, n = cw.inner;
    if (a && n) {
      for (const s of [{ x0: a.x0, z0: a.z0, x1: a.x1, z1: n.z0 }, { x0: a.x0, z0: n.z1, x1: a.x1, z1: a.z1 },
        { x0: a.x0, z0: n.z0, x1: n.x0, z1: n.z1 }, { x0: n.x1, z0: n.z0, x1: a.x1, z1: n.z1 }]) keepRects.push(rect6(s, 0.2, top - 0.35, top + 2.0));
    }
  }
  for (const v of spc?.vents || []) {
    if (v.rect) keepRects.push(rect6(v.rect, 0.2, Y - 1, Y + 2.4));
    if (Number.isFinite(v.ox) && Number.isFinite(v.dx)) reserveWallPoint(v.ox - v.dx * 0.33, v.oz - v.dz * 0.33);
  }
  for (const s of spc?.scrapSpots || []) if (finite(s) && !s.elevated) keepPts.push({ x: s.x, z: s.z });
  // doorway aprons: nothing solid right in front of a door / arch / exit (door swing; entrance and
  // fire exits put the arriving player 1.6 m inside)
  for (const info of L.edgeInfo.values()) {
    const px = L.ox + info.cx * C, pz = L.oz + info.cz * C;
    const hw = Math.min(C, info.width || C) / 2 + 0.3;
    const dep = info.type === 'entrance' || info.type === 'fireexit' ? 2.1 : info.type === 'arch' ? 1.0 : 1.35;
    if (info.dir === 1) aprons.push({ x0: px - hw, z0: pz - dep, x1: px + hw, z1: pz + dep });
    else aprons.push({ x0: px - dep, z0: pz - hw, x1: px + dep, z1: pz + hw });
  }
  // may a solid (footprint min/max, top height above Y) go here? rockSolid: mounds / stalagmites /
  // pillars may merge with wall rock; carts and crates may not.
  const solidOk = (minX, minZ, maxX, maxZ, top, rockSolid = false) => {
    const yTop = Y + top;
    for (const k of keepRects) if (k.y0 < yTop && k.y1 > Y && minX < k.x1 && maxX > k.x0 && minZ < k.z1 && maxZ > k.z0) { stats.rejSetpiece++; return false; }
    for (const a of aprons) if (minX < a.x1 && maxX > a.x0 && minZ < a.z1 && maxZ > a.z0) { stats.rejDoor++; return false; }
    for (const p of keepPts) if (p.x > minX - KEEP_R && p.x < maxX + KEEP_R && p.z > minZ - KEEP_R && p.z < maxZ + KEEP_R) { stats.rejSpot++; return false; }
    if (propHit(minX, Y + 0.03, minZ, maxX, yTop, maxZ, 0.02, !rockSolid)) { stats.rejProp++; return false; }
    return true;
  };
  // wall rock (outcrops, ore, cave-in lumps) must not clip placed props / our timber, lanterns, carts;
  // what it emits is registered as rock so lanterns / tools placed later keep off it
  const rockClear = (lo, hi) => {
    if (propHit(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, 0.03)) { stats.skippedWall++; return false; }
    addBoxAt(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, true);
    return true;
  };
  // does wall (x,z,d) continue past its end (sgn = +1 / -1 along the world axis) as the same wall of
  // the same open space? If not, rock on it must stop at the edge end (no lump hanging into an open
  // junction or poking through a cross wall / into a reserved neighbour edge).
  const wallContinues = (x, z, d, sgn) => {
    const ax = d === 1 || d === 3;
    const nx = x + (ax ? sgn : 0), nz = z + (ax ? 0 : sgn);
    if (!inb(nx, nz) || !L.cells[cidx(nx, nz)]) return false;
    const k = L.edgeKey(x, z, ax ? (sgn > 0 ? 0 : 2) : (sgn > 0 ? 1 : 3));
    if (!L.open.has(k) || L.edgeInfo.has(k)) return false;
    return !isOpen(nx, nz, d) && !isReserved(nx, nz, d);
  };
  // rock lump on wall (x,z,d) at world along offset t, clamped to the wall's extent
  const wlump = (x, z, d, key, t, y, w, h, prot, r, color, jit = 0.3) => {
    const [ex, ez] = edgeCenter(x, z, d);
    const hiT = wallContinues(x, z, d, 1) ? C / 2 + 0.9 : C / 2 - 0.06;
    const loT = wallContinues(x, z, d, -1) ? -C / 2 - 0.9 : -C / 2 + 0.06;
    let hw = w / 2 * (1 + jit);
    if (2 * hw > hiT - loT) { w = (hiT - loT) / (1 + jit); hw = w / 2 * (1 + jit); }
    t = Math.min(hiT - hw, Math.max(loT + hw, t));
    return wallLump(gb, key, ex, ez, d, t, y, w, h, prot, r, color, jit, rockClear);
  };
  // world box of a feature on wall (x,z,d): along offset t0..t1 (world axis), height y0..y1, depth 0..dep
  const wallBox = (x, z, d, t0, t1, y0, y1, dep) => {
    const [ex, ez] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    const ax0 = iz ? ex + t0 : Math.min(ex, ex + ix * dep), ax1 = iz ? ex + t1 : Math.max(ex, ex + ix * dep);
    const az0 = ix ? ez + t0 : Math.min(ez, ez + iz * dep), az1 = ix ? ez + t1 : Math.max(ez, ez + iz * dep);
    return [ax0, y0, az0, ax1, y1, az1];
  };
  const wallBoxHit = (x, z, d, t0, t1, y0, y1, dep, withRock = true) => {
    const b = wallBox(x, z, d, t0, t1, y0, y1, dep);
    return propHit(b[0], b[1], b[2], b[3], b[4], b[5], 0.03, withRock);
  };
  const wallBoxAdd = (x, z, d, t0, t1, y0, y1, dep) => { const b = wallBox(x, z, d, t0, t1, y0, y1, dep); addBoxAt(...b); };
  // keep-out height band over (x, z) from the setpieces rects (for things hanging from the ceiling)
  const bandTopAt = (x, z, m) => {
    let top = -Infinity;
    for (const k of keepRects) if (x > k.x0 - m && x < k.x1 + m && z > k.z0 - m && z < k.z1 + m) top = Math.max(top, k.y1);
    return top;
  };
  // solid blocker for nav + physics; returns false (and changes nothing) if it would bury a reserved
  // spot / setpiece, or cut the room / corridor region
  const tryBlock = (regKey, cells, minX, minZ, maxX, maxZ, pad = 0.15, top = 2, rockSolid = false) => {
    if (!solidOk(minX, minZ, maxX, maxZ, top, rockSolid)) { stats.rejected++; return false; }
    if (!guard) {
      nav?.blockBox?.(minX, minZ, maxX, maxZ, pad);
      stats.blocked++;
      return true;
    }
    const set = guard.cellsOf(minX, minZ, maxX, maxZ, pad);
    if (!guard.ok(regKey, cells, set)) { stats.rejected++; stats.rejNav++; return false; }
    guard.block(set);
    stats.blocked++;
    return true;
  };
  // same checks for a prop placed through placeProp (which blocks its own colliders on the nav grid)
  const canBlock = (regKey, cells, minX, minZ, maxX, maxZ, pad = 0.15, top = 1.2) => {
    let ok = solidOk(minX, minZ, maxX, maxZ, top);
    if (ok && guard && !(ok = guard.ok(regKey, cells, guard.cellsOf(minX, minZ, maxX, maxZ, pad)))) stats.rejNav++;
    if (!ok) stats.rejected++;
    return ok;
  };
  // placeProp for a solid we checked with canBlock: registers its box (wall rock avoids it) and takes
  // every sub-cell its footprint really covers off the nav grid (placeProp only blocks sub-cells whose
  // centre it covers, so scrap could spawn inside a crate's edge)
  const placeSolid = (id, x, y, z, rot) => {
    const obj = placeProp(id, x, y, z, rot);
    const bb = addPropObj(obj);
    if (bb && guard) guard.block(guard.cellsOf(bb.min.x, bb.min.z, bb.max.x, bb.max.z, 0.15));
    return obj;
  };
  const nearKeep = (x, z, m) => keepPts.some((p) => Math.abs(p.x - x) < m && Math.abs(p.z - z) < m);
  // current cell / room rect: loose rubble and mound beams are kept inside it (no poking through walls)
  let bounds = null;
  const clampIn = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const inBounds = (x, z, m) => (bounds ? [clampIn(x, bounds.x0 + m, bounds.x1 - m), clampIn(z, bounds.z0 + m, bounds.z1 - m)] : [x, z]);

  // ---- small builders ----
  const lantern = (x, yTop, z, chainLen, r, opts = {}) => {
    const dead = opts.dead ?? r.chance(0.07);
    const flick = opts.flicker ?? (r.chance(0.22) ? r.float(0.2, 0.65) : 0);
    const yaw = r.float(0, Math.PI);
    if (chainLen > 0.02) mbox(gb, 'metal_dark', null, x, yTop - chainLen / 2, z, 0.025, chainLen, 0.025);
    const M = frameMatrix(x, yTop - chainLen, z, yaw);
    mbox(gb, 'metal_dark', M, 0, -0.03, 0, 0.2, 0.06, 0.2);
    mbox(gb, dead ? 'glass_dead' : 'glow_warm', M, 0, -0.17, 0, 0.13, 0.2, 0.13);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mbox(gb, 'metal_dark', M, sx * 0.075, -0.17, sz * 0.075, 0.02, 0.22, 0.02);
    mbox(gb, 'metal_dark', M, 0, -0.29, 0, 0.17, 0.04, 0.17);
    if (!dead) addLight(new V3(x, yTop - chainLen - 0.17, z), opts.color ?? LANTERN, opts.intensity ?? 0.78, opts.distance ?? 7.5, flick);
    stats.lanterns++;
  };
  // bracket lantern on wall (x,z,d). Draws from its own fork (one draw of r), so a rejection (placed
  // prop in the way) never shifts r. Returns true if built.
  const wallLantern = (x, z, d, y, r0, opts) => {
    const r = r0.fork('wl');
    const [ex, ez] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    const along = r.float(-1.2, 1.2);
    if (wallBoxHit(x, z, d, along - 0.2, along + 0.2, y - 0.5, y + 0.25, 0.65)) { stats.skippedWall++; return false; }
    const bx = ex + (iz ? along : 0), bz = ez + (ix ? along : 0);
    mbox(gb, 'wood_dark', null, bx + ix * 0.03, y, bz + iz * 0.03, ix ? 0.06 : 0.16, 0.4, iz ? 0.06 : 0.16, tint(r, 0.8, 1));
    mbox(gb, 'metal_dark', null, bx + ix * 0.28, y + 0.14, bz + iz * 0.28, ix ? 0.5 : 0.04, 0.04, iz ? 0.5 : 0.04);
    lantern(bx + ix * 0.5, y + 0.12, bz + iz * 0.5, 0.1, r, opts);
    wallBoxAdd(x, z, d, along - 0.2, along + 0.2, y - 0.5, y + 0.25, 0.65);
    return true;
  };
  const post = (x, z, h, color, collide = true) => {
    mbox(gb, 'wood_dark', null, x, Y + h / 2, z, 0.24, h, 0.24, color, SKIP_BOTTOM);
    if (collide) addBox(x, Y + h / 2, z, 0.24, h, 0.24);
    addBoxAt(x - 0.12, Y, z - 0.12, x + 0.12, Y + h + 0.34, z + 0.12);   // + the beam end resting on it
  };
  // steel rails on wooden sleepers between two points on an axis-aligned line (visual only, 0.14 m high)
  const rails = (ax, az, bx, bz, r) => {
    const alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < 0.5) return;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const n = Math.max(1, Math.round(len / 0.7));
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5 + (i > 0 && i < n ? r.float(-0.04, 0.04) : 0);
      const px = alongX ? cx + t * len : cx, pz = alongX ? cz : cz + t * len;
      mbox(gb, 'wood_dark', null, px, Y + 0.03, pz, alongX ? 0.18 : 1.25, 0.06, alongX ? 1.25 : 0.18, tint(r, 0.55, 0.85, 1), SKIP_BOTTOM);
    }
    for (const s of [-0.42, 0.42]) {
      mbox(gb, 'metal', null, alongX ? cx : cx + s, Y + 0.1, alongX ? cz + s : cz, alongX ? len : 0.07, 0.08, alongX ? 0.07 : len, [0.7, 0.66, 0.62], SKIP_BOTTOM);
    }
  };
  const bufferStop = (x, z, alongX, r) => {
    mbox(gb, 'wood_dark', null, x, Y + 0.3, z, alongX ? 0.25 : 1.3, 0.3, alongX ? 1.3 : 0.25, tint(r, 0.6, 0.9, 1), SKIP_BOTTOM);
    for (const s of [-0.5, 0.5]) mbox(gb, 'wood_dark', null, alongX ? x : x + s, Y + 0.22, alongX ? z + s : z, 0.18, 0.44, 0.18, tint(r, 0.6, 0.9, 1), SKIP_BOTTOM);
    addBoxAt(x - (alongX ? 0.13 : 0.65), Y, z - (alongX ? 0.65 : 0.13), x + (alongX ? 0.13 : 0.65), Y + 0.45, z + (alongX ? 0.65 : 0.13));
  };
  // mine cart from primitives. Local frame: length along z, floor at y=0. Returns false if the nav
  // check rejected it (nothing built).
  const minecart = (regKey, cells, x, z, yaw, r, opts = {}) => {
    const M = frameMatrix(x, Y, z, yaw);
    if (opts.tipped) M.multiply(new THREE.Matrix4().makeTranslation(0.5, 0.48, 0)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    const { lo, hi } = aabbOf(M, [-0.5, 0, -0.92], [0.5, 1.0, 0.92]);
    if (!tryBlock(regKey, cells, lo.x, lo.z, hi.x, hi.z, 0.15, hi.y - Y)) return false;
    addBoxAt(lo.x, Y, lo.z, hi.x, hi.y, hi.z);
    const rust = tint(r, 0.75, 1.05, 1);
    mbox(gb, 'metal_rust', M, 0, 0.62, 0, 0.92, 0.62, 1.45, rust);
    mbox(gb, 'metal_dark', M, 0, 0.9, 0.745, 0.98, 0.07, 0.05);
    mbox(gb, 'metal_dark', M, 0, 0.9, -0.745, 0.98, 0.07, 0.05);
    mbox(gb, 'metal_dark', M, 0.475, 0.9, 0, 0.05, 0.07, 1.5);
    mbox(gb, 'metal_dark', M, -0.475, 0.9, 0, 0.05, 0.07, 1.5);
    for (const sz of [-0.4, 0.4]) for (const sx of [-0.47, 0.47]) mbox(gb, 'metal_dark', M, sx, 0.62, sz, 0.03, 0.6, 0.08);
    for (const sx of [-0.3, 0.3]) mbox(gb, 'metal_dark', M, sx, 0.26, 0, 0.1, 0.1, 1.3);
    for (const sz of [-0.5, 0.5]) {
      mbox(gb, 'metal_dark', M, 0, 0.17, sz, 0.95, 0.06, 0.06);
      for (const sx of [-0.44, 0.44]) {
        mbox(gb, 'metal_dark', M, sx, 0.17, sz, 0.07, 0.34, 0.2);
        mbox(gb, 'metal_dark', M, sx, 0.17, sz, 0.07, 0.2, 0.34);
      }
    }
    for (const sz of [-0.83, 0.83]) mbox(gb, 'metal_dark', M, 0, 0.4, sz, 0.08, 0.06, 0.2);
    if (opts.loaded && !opts.tipped) {
      const n = r.int(4, 6);
      for (let i = 0; i < n; i++) {
        const gold = r.chance(0.15);
        lump(gb, gold ? 'gold' : 'rock', M, r.float(-0.28, 0.28), 0.9, r.float(-0.55, 0.55), r.float(0.25, 0.45), r.float(0.18, 0.3), r.float(0.25, 0.45), r, gold ? [1, 1, 1] : tint(r, 0.45, 0.7), 0.3, r.float(0, TAU), false);
      }
    } else {
      mbox(gb, 'metal_dark', M, 0, 0.935, 0, 0.84, 0.006, 1.37, [0.25, 0.23, 0.22]);
    }
    addBox((lo.x + hi.x) / 2, Y + (hi.y - Y) / 2, (lo.z + hi.z) / 2, (hi.x - lo.x) * 0.95, hi.y - Y, (hi.z - lo.z) * 0.95);
    stats.carts++;
    return true;
  };
  const rubbleSmall = (x, z, spread, n, r) => {
    for (let i = 0; i < n; i++) {
      const s = r.float(0.12, 0.34);
      const [px, pz] = inBounds(x + r.float(-spread, spread), z + r.float(-spread, spread), 0.32);
      if (keepPts.length && nearKeep(px, pz, 0.8)) continue;
      lump(gb, 'rock', null, px, Y + s * 0.3, pz, s * r.float(1, 1.6), s, s * r.float(1, 1.6), r, tint(r, 0.5, 0.85), 0.35, r.float(0, TAU));
    }
    stats.rubble++;
  };
  // cave-in mound (solid). maxHalf caps the collider / nav footprint half size.
  const mound = (regKey, cells, x, z, size, r, beams = 0, maxHalf = Infinity) => {
    const sx = size * r.float(1, 1.3), sz = size * r.float(0.8, 1.1), sy = size * r.float(0.45, 0.7);
    const yaw = r.int(0, 1) * Math.PI / 2 + r.float(-0.2, 0.2);
    const hx = Math.min(maxHalf, Math.max(sx, sz) * 0.42), hz = hx;
    if (!tryBlock(regKey, cells, x - hx, z - hz, x + hx, z + hz, 0.15, sy * 0.9, true)) return false;
    lump(gb, 'rock', null, x, Y + sy * 0.4, z, sx, sy, sz, r, tint(r, 0.5, 0.8), 0.25, yaw);
    lump(gb, 'rock', null, x + r.float(-0.3, 0.3), Y + sy * 0.75, z + r.float(-0.3, 0.3), sx * 0.55, sy * 0.6, sz * 0.55, r, tint(r, 0.55, 0.85), 0.35, r.float(0, TAU));
    addBox(x, Y + sy * 0.45, z, hx * 2, sy * 0.9, hz * 2);
    rubbleSmall(x, z, size * 0.75, r.int(4, 8), r);
    for (let i = 0; i < beams; i++) {
      const a = r.float(0, TAU);
      const [sx0, sz0] = inBounds(x + Math.cos(a) * size * 0.9, z + Math.sin(a) * size * 0.9, 0.2);
      const s = new V3(sx0, Y + 0.1, sz0);
      const e = new V3(x + Math.cos(a) * 0.2, Y + sy * r.float(0.7, 1.1), z + Math.sin(a) * 0.2);
      const col = tint(r, 0.5, 0.8, 1);
      if (keepPts.length && nearKeep(sx0, sz0, 0.9)) continue;
      beam(gb, 'wood_dark', s, e, 0.2, 0.2, col);
    }
    return true;
  };
  // tall rooms (>= CATWALK_MIN_H) may get setpieces.js catwalks: a 1.2 m deck ring at 3.4 m along the
  // walls. band = keep that ring's walking space clear (near the walls stalactites stop above it).
  // Over known catwalk stairs / bridges (keepRects) they stop 2 m above the deck.
  const stalactites = (x0, z0, x1, z1, h, n, r, maxLen = 2.4, band = h >= CATWALK_MIN_H) => {
    const room = h - 2.7;
    if (room < 0.25) return;
    for (let i = 0; i < n; i++) {
      const px = r.float(x0 + 0.3, x1 - 0.3), pz = r.float(z0 + 0.3, z1 - 0.3);
      const nearWall = Math.min(px - x0, x1 - px, pz - z0, z1 - pz) < CATWALK_BAND;
      let lim = band && nearWall ? Math.min(maxLen, h - CATWALK_TOP) : Math.min(maxLen, room);
      const over = keepRects.length ? bandTopAt(px, pz, 0.5) : -Infinity;
      if (over > Y) lim = Math.min(lim, Y + h - over);
      const len = r.float(0.25, Math.max(0.3, lim));
      const rad = len * r.float(0.16, 0.28) + 0.06;
      if (lim < 0.3) continue;
      spike(gb, 'rock', new V3(px, Y + h + 0.02, pz), new V3(0, -1, 0), rad, len, r, tint(r, 0.55, 0.9));
      stats.stalactites++;
    }
  };
  // wall outcrop centre height; with a catwalk band it stays below / above the walking space
  const outcropY = (hh, h, r, band = h >= CATWALK_MIN_H) => {
    if (!band) return Y + r.float(hh * 0.4, h - hh * 0.5);
    const e = hh * 0.66;   // half height + corner jitter
    const lowOk = 3.2 - e >= hh * 0.4, highOk = h - hh * 0.5 >= CATWALK_TOP + e;
    if (highOk && (!lowOk || r.chance(0.4))) return Y + r.float(CATWALK_TOP + e, h - hh * 0.5);
    return Y + (lowOk ? r.float(hh * 0.4, 3.2 - e) : hh * 0.4);
  };
  // glowing crystal cluster on wall (x,z,d); own fork, skipped whole if a placed prop is in the way
  const crystals = (x, z, d, r0, y) => {
    const r = r0.fork('cr');
    const [ex, ez] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    const t = r.float(-1.2, 1.2);
    if (wallBoxHit(x, z, d, t - 1.1, t + 1.1, y - 0.45, y + 1.0, 0.95, false)) { stats.skippedWall++; return false; }
    wallBoxAdd(x, z, d, t - 1.1, t + 1.1, y - 0.45, y + 1.0, 0.95);
    const bx = ex + (iz ? t : 0), bz = ez + (ix ? t : 0);
    const n = r.int(3, 6);
    for (let i = 0; i < n; i++) {
      const dir = new V3(ix * r.float(0.5, 1) + (iz ? r.float(-0.5, 0.5) : 0), r.float(0.2, 0.9), iz * r.float(0.5, 1) + (ix ? r.float(-0.5, 0.5) : 0)).normalize();
      spike(gb, 'glow_cold', new V3(bx + (iz ? r.float(-0.25, 0.25) : 0), y + r.float(-0.2, 0.2), bz + (ix ? r.float(-0.25, 0.25) : 0)), dir, r.float(0.05, 0.11), r.float(0.3, 0.8), r, null, 4);
    }
    wallLump(gb, 'rock', ex, ez, d, t, y - 0.1, 0.7, 0.45, 0.2, r, tint(r, 0.4, 0.6));
    // natural light: not on the facility power grid (stays lit when the reactor is pulled)
    addLight(new V3(bx + ix * 0.5, y + 0.3, bz + iz * 0.5), CRYSTAL, 0.42, 5.5, 0, 'misc');
    stats.crystals++;
    return true;
  };
  const oreVein = (x, z, d, h, r) => {
    const y0 = r.float(0.5, Math.min(2.4, h - 0.8)), slope = r.float(-0.35, 0.35);
    const n = r.int(3, 7);
    const kind = r.next();
    for (let i = 0; i < n; i++) {
      const t = r.float(-1.7, 1.7), s = r.float(0.12, 0.34);
      const gold = kind < 0.4 ? r.chance(0.6) : r.chance(0.15);
      const key = gold ? 'gold' : kind < 0.75 ? 'metal_rust' : 'rock';
      const col = gold ? [1, 0.95, 0.8] : key === 'metal_rust' ? [1.1, 0.72, 0.48] : tint(r, 0.3, 0.5);
      wlump(x, z, d, key, t, Y + Math.max(0.2, y0 + t * slope + r.float(-0.2, 0.2)), s * r.float(1, 1.8), s, s * 0.6, r, col, 0.35);
    }
  };
  // pickaxe / shovel leaning on wall (x,z,d); own fork, skipped if a placed prop is in the way
  const wallTool = (x, z, d, r0) => {
    const r = r0.fork('wt');
    const [ex, ez] = edgeCenter(x, z, d);
    const [ix, iz] = INWARD[d];
    const t = r.float(-1.3, 1.3);
    if (wallBoxHit(x, z, d, t - 0.45, t + 0.45, Y + 0.6, Y + 1.95, 0.35)) { stats.skippedWall++; return false; }
    wallBoxAdd(x, z, d, t - 0.45, t + 0.45, Y + 0.6, Y + 1.95, 0.35);
    const bx = ex + (iz ? t : 0) + ix * 0.07, bz = ez + (ix ? t : 0) + iz * 0.07;
    const lean = r.float(-0.25, 0.25);
    const top = new V3(bx + (iz ? lean : 0), Y + 1.75, bz + (ix ? lean : 0));
    beam(gb, 'wood_dark', new V3(bx, Y + 0.95, bz), top, 0.045, 0.045, tint(r, 0.8, 1.05, 1));
    if (r.chance(0.6)) {   // pickaxe head
      const h1 = new V3(top.x + (iz ? 0.32 : 0), top.y - 0.12, top.z + (ix ? 0.32 : 0));
      const h2 = new V3(top.x - (iz ? 0.32 : 0), top.y - 0.12, top.z - (ix ? 0.32 : 0));
      beam(gb, 'metal_dark', top, h1, 0.05, 0.05);
      beam(gb, 'metal_dark', top, h2, 0.05, 0.05);
    } else {               // shovel blade
      mbox(gb, 'metal_rust', null, bx, Y + 0.82, bz, iz ? 0.26 : 0.03, 0.3, ix ? 0.26 : 0.03, [0.8, 0.75, 0.7]);
    }
    mbox(gb, 'metal_dark', null, top.x - ix * 0.035, top.y - 0.05, top.z - iz * 0.035, 0.04, 0.08, 0.04);
    return true;
  };
  // try up to `tries` free walls for a wall feature (fn returns false when something is in the way)
  const onWall = (next, tries, fn) => {
    for (let k = 0; k < tries; k++) { const w = next(); if (!w) return false; if (fn(w)) return true; }
    return false;
  };

  // =========================================================================== arch portals
  // (first: wall rock / lanterns next to a doorway keep off the timber)
  for (const info of L.edgeInfo.values()) {
    if (info.type !== 'arch') continue;
    const px = L.ox + info.cx * C, pz = L.oz + info.cz * C;
    const alongX = info.dir === 1;   // edge plane z = const -> opening spans x
    const hw = info.width / 2, dh = info.doorH, depth = 0.4;
    const col = tint(rng, 0.7, 1.0, 1);
    for (const sg of [-1, 1]) {
      const a = sg * (hw - 0.12);
      const x = alongX ? px + a : px, z = alongX ? pz : pz + a;
      mbox(gb, 'wood_dark', null, x, Y + (dh - 0.24) / 2, z, alongX ? 0.24 : depth, dh - 0.24, alongX ? depth : 0.24, col, SKIP_BOTTOM);
      addBox(x, Y + (dh - 0.24) / 2, z, alongX ? 0.24 : depth, dh - 0.24, alongX ? depth : 0.24);
      addBoxAt(x - (alongX ? 0.12 : depth / 2), Y, z - (alongX ? depth / 2 : 0.12), x + (alongX ? 0.12 : depth / 2), Y + dh, z + (alongX ? depth / 2 : 0.12));
    }
    mbox(gb, 'wood_dark', null, px, Y + dh - 0.12, pz, alongX ? info.width + 0.1 : depth, 0.24, alongX ? depth : info.width + 0.1, col);
    stats.portals++;
  }

  // =========================================================================== corridors
  // rails along some long straight runs (x runs first, then z runs; fixed scan order)
  const railAxis = new Uint8Array(W * H);
  for (let axis = 0; axis < 2; axis++) {
    const outer = axis === 0 ? H : W, inner = axis === 0 ? W : H;
    for (let o = 0; o < outer; o++) {
      let run = [];
      const flush = () => {
        if (run.length >= 3 && rng.chance(0.45)) {
          const a = run[0], b = run[run.length - 1];
          // tracks run to 0.3 m from an end wall, but stop 1 m short of a vent cover / steam pipe there
          const ea = isReserved(a[0], a[1], axis === 0 ? 2 : 3) ? 0.7 : 1.7, eb = isReserved(b[0], b[1], axis === 0 ? 0 : 1) ? 0.7 : 1.7;
          const ax = wx(a[0]) + C / 2 - (axis === 0 ? ea : 0), az = wz(a[1]) + C / 2 - (axis === 1 ? ea : 0);
          const bx = wx(b[0]) + C / 2 + (axis === 0 ? eb : 0), bz = wz(b[1]) + C / 2 + (axis === 1 ? eb : 0);
          rails(ax, az, bx, bz, rng);
          for (const [x, z] of run) railAxis[cidx(x, z)] |= axis === 0 ? 1 : 2;
          stats.railCells += run.length;
        }
        run = [];
      };
      for (let i = 0; i < inner; i++) {
        const x = axis === 0 ? i : o, z = axis === 0 ? o : i;
        if (L.cells[cidx(x, z)] !== 2) { flush(); continue; }
        run.push([x, z]);
        const nx = x + (axis === 0 ? 1 : 0), nz = z + (axis === 1 ? 1 : 0);
        if (!inb(nx, nz) || L.cells[cidx(nx, nz)] !== 2 || !L.open.has(L.edgeKey(x, z, axis === 0 ? 0 : 1))) flush();
      }
      flush();
    }
  }

  let frameN = 0;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const i = cidx(x, z);
    if (L.cells[i] !== 2) continue;
    const h = L.heightOf[i];
    const o = [0, 1, 2, 3].map((d) => isOpen(x, z, d));
    const nOpen = o.filter(Boolean).length;
    const straightX = o[0] && o[2] && !o[1] && !o[3];
    const straightZ = o[1] && o[3] && !o[0] && !o[2];
    const cx = wx(x) + C / 2, cz = wz(z) + C / 2;
    const regKey = 'c' + i, cells = [i];
    const dead = dark && dark.has(i) ? { dead: true } : {};   // setpieces dark run: broken lanterns
    // closed walls that nothing reserved hangs on (vent covers, steam pipes, posters)
    const freeWall = [0, 1, 2, 3].map((d) => !o[d] && !isReserved(x, z, d));
    bounds = { x0: wx(x), z0: wz(z), x1: wx(x + 1), z1: wz(z + 1) };
    let framed = false;

    // ---- a crate / barrel against a wall of a straight tunnel (first, so wall rock avoids it) ----
    if ((straightX || straightZ) && rng.chance(0.07)) {
      const s = rng.fork('crate' + i);
      const d = straightX ? (s.chance(0.5) ? 1 : 3) : (s.chance(0.5) ? 0 : 2);
      const [ex, ez] = edgeCenter(x, z, d);
      const [ix, iz] = INWARD[d];
      const t = -s.float(0.9, 1.4);
      const px = ex + ix * 0.62 + (iz ? t : 0), pz = ez + iz * 0.62 + (ix ? t : 0);
      if (freeWall[d] && canBlock(regKey, cells, px - 0.62, pz - 0.62, px + 0.62, pz + 0.62, 0.15, 1.2)) {
        const id = s.chance(0.7) ? 'crate_wood' : 'barrel';
        if (placeSolid(id, px, Y, pz, s.int(0, 3) * Math.PI / 2 + s.float(-0.12, 0.12))) stats.crates++;
      }
    }

    // ---- dead ends: parked mine cart (with rails into it) or a cave-in (before the wall rock) ----
    // Both stay in the far half of the cell: the cell centre is where corridor vent / turret spawns go.
    if (nOpen === 1) {
      const s = rng.fork('dead' + i);
      const dOpen = o.findIndex((v) => v);
      const dFar = (dOpen + 2) & 3;
      const alongX = dOpen === 0 || dOpen === 2;
      const [fx, fz] = edgeCenter(x, z, dFar);
      const [ix, iz] = INWARD[dFar];
      if (!freeWall[dFar]) {
        // vent cover / steam pipe / poster on the end wall: leave the dead end empty
      } else if (s.chance(0.55)) {
        if (!(railAxis[i] & (alongX ? 1 : 2))) {
          const [ox, oz] = edgeCenter(x, z, dOpen);
          rails(ox + (fx - ox) * 0.02, oz + (fz - oz) * 0.02, fx + ix * 0.15, fz + iz * 0.15, s);
        }
        bufferStop(fx + ix * 0.12, fz + iz * 0.12, alongX, s);
        // cart collider spans 0.23..1.97 m from the end wall (bumper resting on the buffer beam)
        minecart(regKey, cells, fx + ix * 1.1, fz + iz * 1.1, (alongX ? Math.PI / 2 : 0) + s.float(-0.05, 0.05), s, { loaded: s.chance(0.6) });
      } else if (s.chance(0.6)) {
        mound(regKey, cells, fx + ix * 1.05, fz + iz * 1.05, s.float(1.2, 1.7), s, s.int(0, 2), 0.85);
      }
    }

    // ---- timber support frame (every 2nd cell of a straight run, 1 m past the centre) ----
    if ((straightX && x % 2 === 0) || (straightZ && z % 2 === 0)) {
      const alongX = straightX;
      const missing = rng.chance(0.08), broken = rng.chance(0.08);
      const lanternHere = rng.chance(0.55) && (alongX ? x : z) % 4 === 0;
      if (!missing) {
        framed = true;
        stats.frames++; frameN++;
        const p = (alongX ? cx : cz) + C * 0.25;
        const a0 = alongX ? wz(z) : wx(x), a1 = a0 + C;
        const P = (along, across, y) => (alongX ? new V3(along, y, across) : new V3(across, y, along));
        const col = tint(rng, 0.7, 1.0, 1);
        const postH = h - 0.33;
        const brokenSide = rng.int(0, 1);
        for (let side = 0; side < 2; side++) {
          const ac = side ? a1 - 0.15 : a0 + 0.15, sg = side ? -1 : 1;
          if (broken && side === brokenSide) {
            // snapped post leaning on the wall + a stub lying on the floor
            beam(gb, 'wood_dark', P(p - 0.25, ac + sg * 0.45, Y + 0.02), P(p - 0.1, ac, Y + h - 1.2), 0.22, 0.22, col);
            const lp = P(p + 0.6, ac + sg * 0.2, Y + 0.11);
            mbox(gb, 'wood_dark', null, lp.x, lp.y, lp.z, alongX ? 1.1 : 0.22, 0.22, alongX ? 0.22 : 1.1, col);
            continue;
          }
          const c = P(p, ac, 0);
          post(c.x, c.z, postH, col);
          beam(gb, 'wood_dark', P(p, ac + sg * 0.1, Y + h - 1.05), P(p, ac + sg * 0.75, Y + h - 0.33), 0.12, 0.12, col);
        }
        if (!broken) {
          const c = P(p, (a0 + a1) / 2, Y + h - 0.2);
          mbox(gb, 'wood_dark', null, c.x, c.y, c.z, alongX ? 0.26 : C, 0.26, alongX ? C : 0.26, col);
          if (lanternHere) {
            const lp = P(p, (a0 + a1) / 2 + rng.float(-0.9, 0.9), 0);
            lantern(lp.x, Y + h - 0.33, lp.z, rng.float(0.12, 0.4), rng, dead);
          }
        } else {
          // beam sagging onto the broken side (stays above head height)
          const hi = P(p, brokenSide ? a0 + 0.05 : a1 - 0.05, Y + h - 0.2);
          const lo = P(p, brokenSide ? a1 - 0.3 : a0 + 0.3, Y + 2.25);
          beam(gb, 'wood_dark', hi, lo, 0.26, 0.26, col);
          if (lanternHere) lantern((hi.x + lo.x) / 2, (hi.y + lo.y) / 2 - 0.13, (hi.z + lo.z) / 2, 0.15, rng, { flicker: 0.8, ...dead });
        }
      }
    } else if (nOpen >= 3 && rng.chance(0.45)) {
      lantern(cx + rng.float(-0.6, 0.6), Y + h, cz + rng.float(-0.6, 0.6), rng.float(0.55, 0.75), rng, dead);
    } else if (nOpen === 2 && !straightX && !straightZ && rng.chance(0.3)) {
      const d = freeWall.findIndex(Boolean);
      if (d >= 0) wallLantern(x, z, d, Y + 2.35, rng, dead);
    }

    // ---- rock outcrops on closed walls (framed cells: on the side away from the frame at +1 m) ----
    for (let d = 0; d < 4; d++) {
      if (!freeWall[d] || !rng.chance(0.32)) continue;
      const n = rng.int(1, 2);
      for (let k = 0; k < n; k++) {
        const t = framed ? rng.float(-1.75, -0.6) : rng.sign() * rng.float(0.6, 1.75);
        const hh = rng.float(0.4, 1.3);
        wlump(x, z, d, 'rock', t, Y + rng.float(hh * 0.5, h - hh * 0.5), rng.float(0.5, 1.3), hh, rng.float(0.12, 0.3), rng, tint(rng, 0.55, 0.9));
      }
    }
    // ---- tiny stalactites ----
    if (rng.chance(0.1)) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const len = rng.float(0.15, 0.5);
        const off = rng.float(-1.7, 0.3);
        spike(gb, 'rock', new V3(straightX ? cx + off : cx + rng.float(-1.5, 1.5), Y + h + 0.02, straightX ? cz + rng.float(-1.5, 1.5) : cz + off), new V3(0, -1, 0), len * 0.3 + 0.05, len, rng, tint(rng, 0.55, 0.85));
        stats.stalactites++;
      }
    }
    // ---- corner rubble (visual, below step height) ----
    if (nOpen <= 2 && rng.chance(0.14)) {
      const d = freeWall.findIndex(Boolean);
      if (d >= 0) {
        const [ex, ez] = edgeCenter(x, z, d);
        const [ix, iz] = INWARD[d];
        const t = -rng.float(0.9, 1.5);
        rubbleSmall(ex + ix * 0.45 + (iz ? t : 0), ez + iz * 0.45 + (ix ? t : 0), 0.35, rng.int(3, 6), rng);
      }
    }
  }
  bounds = null;

  // =========================================================================== rooms
  const TIMBER = new Set(['entrance', 'minecart_depot', 'supply_cache', 'crew_quarters', 'collapsed_shaft', 'generator', 'ore_vein']);
  const LIT_BEAMS = new Set(['entrance', 'minecart_depot', 'supply_cache', 'crew_quarters', 'collapsed_shaft', 'ore_vein']);
  for (const r of L.rooms) {
    const type = r.type;
    if (type === 'vault') continue;
    const x0 = wx(r.x), z0 = wz(r.z), x1 = wx(r.x + r.w), z1 = wz(r.z + r.h);
    const rcx = (x0 + x1) / 2, rcz = (z0 + z1) / 2;
    const h = r.height;
    const area = r.w * r.h;
    const regKey = 'r' + r.id;
    const cells = [];
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) cells.push(cidx(xx, zz));
    // free (closed) perimeter wall edges, shuffled deterministically. Edges holding a reserved thing
    // (mimic-door wall spot, vent cover, fuse box, poster) get no rock / ore / lantern / tool / mound.
    const walls = [];
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      for (let d = 0; d < 4; d++) {
        const nx = xx + DX[d], nz = zz + DZ[d];
        if (nx >= r.x && nx < r.x + r.w && nz >= r.z && nz < r.z + r.h) continue;
        if (isOpen(xx, zz, d) || isReserved(xx, zz, d)) continue;
        walls.push({ x: xx, z: zz, d });
      }
    }
    rng.shuffle(walls);
    let wi = 0;
    const nextWall = () => (walls.length ? walls[wi++ % walls.length] : null);
    bounds = { x0, z0, x1, z1 };
    // catwalk band: known exactly when setPieces was passed, else assumed for every tall room
    const band = h >= CATWALK_MIN_H && (!spc || catwalkRooms.has(r.id));

    // ---- timber: beams across the short side at every inner cell boundary + wall posts ----
    if (TIMBER.has(type)) {
      const longX = r.w >= r.h;
      const nB = (longX ? r.w : r.h) - 1;
      const lanternRoom = LIT_BEAMS.has(type) && (type !== 'collapsed_shaft' || rng.chance(0.5));
      // facility's ceiling lamp grid for this room (buildFacility: round(w/2) x round(h/2) lamps):
      // no beam through a lamp (generator rooms: the single lamp hangs on the centre line)
      const st = MINESHAFT_THEME.rooms[type];
      const lampAxis = [];
      if (st?.lamp && st.lamp !== 'wall_lamp') {
        const nL = Math.max(1, Math.round((longX ? r.w : r.h) / 2)), span = longX ? x1 - x0 : z1 - z0;
        for (let a = 0; a < nL; a++) lampAxis.push((longX ? x0 : z0) + (a + 0.5) * span / nL);
      }
      for (let k = 1; k <= nB; k++) {
        const bp = (longX ? x0 : z0) + k * C;
        const col = tint(rng, 0.68, 1.0, 1);
        const broken = type === 'collapsed_shaft' && rng.chance(0.5);
        const a0 = longX ? z0 : x0, a1 = longX ? z1 : x1;
        const P = (across, y) => (longX ? new V3(bp, y, across) : new V3(across, y, bp));
        const brokenSide = rng.int(0, 1);
        const lampHere = lampAxis.some((v) => Math.abs(v - bp) < 0.7);
        for (let side = 0; side < 2; side++) {
          if (broken && side === brokenSide) {
            const lp = P(side ? a1 - 0.6 : a0 + 0.6, Y + 0.12);
            mbox(gb, 'wood_dark', null, lp.x + (longX ? 0.4 : 0), lp.y, lp.z + (longX ? 0 : 0.4), longX ? 1.4 : 0.24, 0.24, longX ? 0.24 : 1.4, col);
            continue;
          }
          const c = P(side ? a1 - 0.15 : a0 + 0.15, 0);
          post(c.x, c.z, h - 0.34, col);
        }
        if (lampHere) {
          // wall posts only; short headers on top of them instead of a beam through the lamp
          for (const ac of [a0 + 0.35, a1 - 0.35]) { const c = P(ac, Y + h - 0.2); mbox(gb, 'wood_dark', null, c.x, c.y, c.z, longX ? 0.28 : 0.7, 0.28, longX ? 0.7 : 0.28, col); }
        } else if (!broken) {
          const c = P((a0 + a1) / 2, Y + h - 0.2);
          mbox(gb, 'wood_dark', null, c.x, c.y, c.z, longX ? 0.28 : a1 - a0, 0.28, longX ? a1 - a0 : 0.28, col);
        } else {
          beam(gb, 'wood_dark', P(brokenSide ? a0 + 0.05 : a1 - 0.05, Y + h - 0.2), P(brokenSide ? a1 - 0.3 : a0 + 0.3, Y + Math.min(2.4, h - 1.2)), 0.28, 0.28, col);
        }
        if (lanternRoom && !broken && !lampHere && (k % 2 === 1 || nB <= 2)) {
          const lp = P((a0 + a1) / 2 + rng.float(-1.2, 1.2), 0);
          const chain = Math.max(0.1, Math.min(rng.float(0.3, 0.9), h - 0.34 - 0.32 - 2.3));
          lantern(lp.x, Y + h - 0.34, lp.z, chain, rng, type === 'entrance' ? { flicker: 0, dead: false, intensity: 0.9 } : type === 'collapsed_shaft' ? { flicker: rng.float(0.5, 0.9) } : {});
        }
      }
    }

    // ---- per-type set dressing ----
    if (type === 'cavern' || type === 'flooded_cave' || type === 'nest' || type === 'ore_vein') {
      const dens = { cavern: 1.6, flooded_cave: 1.0, nest: 0.8, ore_vein: 0.45 }[type];
      stalactites(x0, z0, x1, z1, h, Math.round(area * dens), rng, type === 'ore_vein' ? 0.8 : 2.4, band);
      // rock outcrops break up the flat walls
      for (const w of walls) {
        const n = type === 'ore_vein' ? rng.int(0, 1) : rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const hh = rng.float(0.6, Math.min(2.2, h * 0.45));
          wlump(w.x, w.z, w.d, 'rock', rng.float(-1.5, 1.5), outcropY(hh, h, rng, band), rng.float(0.8, 2.0), hh, rng.float(0.18, 0.45), rng, tint(rng, 0.5, 0.85));
        }
      }
    }
    if (type === 'cavern') {
      // stalagmites (solid, nav-blocking)
      const nG = Math.max(2, Math.round(area * 0.3));
      for (let k = 0; k < nG; k++) {
        const s = rng.fork('sg' + r.id + ':' + k);
        const rad = s.float(0.22, 0.5), ht = s.float(0.7, 2.0);
        const px = s.float(x0 + 0.9, x1 - 0.9), pz = s.float(z0 + 0.9, z1 - 0.9);
        const hb = rad * 0.9;
        if (!tryBlock(regKey, cells, px - hb, pz - hb, px + hb, pz + hb, 0.15, ht, true)) continue;
        spike(gb, 'rock', new V3(px, Y - 0.02, pz), new V3(0, 1, 0), rad, ht, s, tint(s, 0.55, 0.9));
        for (let j = 0; j < 2; j++) lump(gb, 'rock', null, px + s.float(-rad, rad), Y + 0.08, pz + s.float(-rad, rad), rad * 1.1, rad * 0.6, rad * 1.1, s, tint(s, 0.5, 0.8), 0.35, s.float(0, TAU));
        addBox(px, Y + ht * 0.42, pz, rad * 1.4, ht * 0.84, rad * 1.4);
        stats.stalagmites++;
      }
      // floor-to-ceiling rock pillars in big caverns
      const nP = area >= 16 ? rng.int(0, 2) : 0;
      for (let k = 0; k < nP; k++) {
        const s = rng.fork('pl' + r.id + ':' + k);
        const rad = s.float(0.55, 0.85);
        const px = s.float(x0 + 2.2, x1 - 2.2), pz = s.float(z0 + 2.2, z1 - 2.2);
        if (band) {
          // keep clear of the catwalk deck ring; without setpieces info also of every possible bridge
          // line (setpieces tries the centre line and +-1.1 / +-2.2 m). Known stairs / bridges / deck
          // are keepRects, checked by tryBlock.
          const m = CATWALK_BAND + rad * 1.3 + 0.3;
          if (Math.min(px - x0, x1 - px, pz - z0, z1 - pz) < m) continue;
          if (!spc) {
            const c = rad * 0.85 + 0.7 + 0.3;
            const nearLine = (v, mid) => [0, -1.1, 1.1, -2.2, 2.2].some((o) => Math.abs(v - (mid + o)) < c);
            if (nearLine(px, rcx) || nearLine(pz, rcz)) continue;
          }
        }
        if (!tryBlock(regKey, cells, px - rad * 0.85, pz - rad * 0.85, px + rad * 0.85, pz + rad * 0.85, 0.15, h, true)) continue;
        const segs = Math.ceil(h / 1.6);
        for (let j = 0; j < segs; j++) {
          const sy = (h / segs) * 1.3, cy = Y + (j + 0.5) * (h / segs);
          const wide = 1 + Math.abs(j - (segs - 1) / 2) / segs * 0.8;   // hourglass
          lump(gb, 'rock', null, px + s.float(-0.1, 0.1), cy, pz + s.float(-0.1, 0.1), rad * 2 * wide * s.float(0.85, 1.1), sy, rad * 2 * wide * s.float(0.85, 1.1), s, tint(s, 0.5, 0.85), 0.2, s.float(0, TAU), false);
        }
        addBox(px, Y + h / 2, pz, rad * 1.7, h, rad * 1.7);
        stats.pillars++;
      }
      // rubble piles near walls
      const nR = rng.int(1, 2);
      for (let k = 0; k < nR; k++) {
        const w = nextWall();
        const s = rng.fork('rb' + r.id + ':' + k);
        if (!w) continue;
        const [ex, ez] = edgeCenter(w.x, w.z, w.d);
        const [ix, iz] = INWARD[w.d];
        mound(regKey, cells, ex + ix * 1.3 + (iz ? s.float(-0.8, 0.8) : 0), ez + iz * 1.3 + (ix ? s.float(-0.8, 0.8) : 0), s.float(1.1, 1.8), s, s.int(0, 1));
      }
      // lanterns: brackets on the walls + long chains from the high ceiling
      const nL = Math.min(6, Math.max(2, Math.round(area / 4)));
      for (let k = 0; k < nL; k++) onWall(nextWall, 2, (w) => wallLantern(w.x, w.z, w.d, Y + 2.4, rng));
      if (h > 5) {
        // long chains from the high ceiling, off the room centre lines (where a catwalk bridge may run),
        // never through a known catwalk deck / bridge / stair or a hanging prop
        for (let k = rng.int(1, 2); k > 0; k--) {
          const s = rng.fork('ch' + r.id + ':' + k);
          const ox = s.sign() * s.float(1.2, Math.max(1.3, (x1 - x0) / 2 - 2.2)), oz = s.sign() * s.float(1.2, Math.max(1.3, (z1 - z0) / 2 - 2.2));
          const lx = rcx + ox, lz = rcz + oz;
          if (bandTopAt(lx, lz, 0.35) > Y + 2.5) continue;
          if (propHit(lx - 0.2, Y + 2.4, lz - 0.2, lx + 0.2, Y + h, lz + 0.2, 0.05)) continue;
          lantern(lx, Y + h, lz, h - 3.0, s);
        }
      }
      if (rng.chance(0.3)) onWall(nextWall, 2, (w) => crystals(w.x, w.z, w.d, rng, Y + rng.float(0.6, 1.8)));
      // an abandoned cart tipped on its side, ore spilled out
      if (rng.chance(0.3)) {
        const s = rng.fork('tc' + r.id);
        const px = s.float(x0 + 1.6, x1 - 1.6), pz = s.float(z0 + 1.6, z1 - 1.6), yaw = s.float(0, TAU);
        if (minecart(regKey, cells, px, pz, yaw, s, { tipped: true })) rubbleSmall(px - Math.cos(yaw) * 0.9, pz + Math.sin(yaw) * 0.9, 0.5, s.int(3, 6), s);
      }
    } else if (type === 'minecart_depot') {
      const longX = r.w >= r.h;
      // a track end stops 1.3 m short when the end wall there has a doorway or a reserved spot
      // (mimic door, vent, fuse box, poster) so the buffer stop does not sit in front of it
      const endGap = (hiEnd) => {
        const d = longX ? (hiEnd ? 0 : 2) : (hiEnd ? 1 : 3);
        const along = longX ? rcz : rcx, lo = longX ? r.z : r.x, n = longX ? r.h : r.w;
        for (let k = lo; k < lo + n; k++) {
          const c0 = longX ? wz(k) : wx(k);
          if (c0 > along + 0.75 || c0 + C < along - 0.75) continue;
          const cx0 = longX ? (hiEnd ? r.x + r.w - 1 : r.x) : k, cz0 = longX ? k : (hiEnd ? r.z + r.h - 1 : r.z);
          if (isOpen(cx0, cz0, d) || isReserved(cx0, cz0, d)) return 1.3;
        }
        return 0;
      };
      const g0 = endGap(false), g1 = endGap(true);
      const ax = longX ? x0 + 0.5 + g0 : rcx, az = longX ? rcz : z0 + 0.5 + g0;
      const bx = longX ? x1 - 0.5 - g1 : rcx, bz = longX ? rcz : z1 - 0.5 - g1;
      rails(ax, az, bx, bz, rng);
      bufferStop(ax + (longX ? 0.1 : 0), az + (longX ? 0 : 0.1), longX, rng);
      bufferStop(bx - (longX ? 0.1 : 0), bz - (longX ? 0 : 0.1), longX, rng);
      // carts stay between the buffer stops (overlapping carts are refused by the nav check)
      const tlen = longX ? bx - ax : bz - az, mid = longX ? (ax + bx) / 2 : (az + bz) / 2;
      const nC = 1 + (area >= 16 ? 1 : 0) + rng.int(0, 1);
      for (let k = 0; k < nC; k++) {
        const s = rng.fork('dc' + r.id + ':' + k);
        const t = (k + 0.5) / nC - 0.5 + s.float(-0.08, 0.08);
        const px = longX ? mid + t * Math.max(0, tlen - 2.2) : rcx, pz = longX ? rcz : mid + t * Math.max(0, tlen - 2.2);
        minecart(regKey, cells, px, pz, (longX ? Math.PI / 2 : 0) + s.float(-0.04, 0.04), s, { loaded: s.chance(0.5) });
      }
      for (let k = rng.int(1, 2); k > 0; k--) onWall(nextWall, 2, (w) => wallTool(w.x, w.z, w.d, rng));
    } else if (type === 'ore_vein') {
      for (const w of walls) if (rng.chance(0.8)) oreVein(w.x, w.z, w.d, h, rng);
      if (rng.chance(0.7)) onWall(nextWall, 2, (w) => crystals(w.x, w.z, w.d, rng, Y + rng.float(0.5, 1.6)));
      for (let k = rng.int(0, 1); k > 0; k--) onWall(nextWall, 2, (w) => wallTool(w.x, w.z, w.d, rng));
      rubbleSmall(rcx + rng.float(-1, 1), rcz + rng.float(-1, 1), 0.6, rng.int(3, 5), rng);
    } else if (type === 'supply_cache') {
      const nS = rng.int(2, 4);
      for (let k = 0; k < nS; k++) {
        const w = nextWall();
        const s = rng.fork('cs' + r.id + ':' + k);
        if (!w) continue;
        const [ex, ez] = edgeCenter(w.x, w.z, w.d);
        const [ix, iz] = INWARD[w.d];
        const t = s.float(-1.2, 1.2);
        const px = ex + ix * 0.75 + (iz ? t : 0), pz = ez + iz * 0.75 + (ix ? t : 0);
        // +-0.75: the top crate may sit 0.1 m off the bottom one
        if (!canBlock(regKey, cells, px - 0.75, pz - 0.75, px + 0.75, pz + 0.75, 0.15, 2.2)) continue;
        const rot = s.int(0, 3) * Math.PI / 2 + s.float(-0.1, 0.1);
        const bottom = placeSolid('crate_wood', px, Y, pz, rot);
        if (!bottom) continue;
        stats.crates++;
        const top = new THREE.Box3().setFromObject(bottom).max.y;
        if (s.chance(0.7) && Number.isFinite(top) && top - Y < 1.3) {
          if (placeSolid('crate_wood', px + s.float(-0.1, 0.1), top, pz + s.float(-0.1, 0.1), rot + s.float(-0.25, 0.25))) stats.crates++;
        }
      }
      for (let k = rng.int(0, 1); k > 0; k--) onWall(nextWall, 2, (w) => wallTool(w.x, w.z, w.d, rng));
    } else if (type === 'collapsed_shaft') {
      // cave-in along the wall side with the most closed edges
      const bySide = [0, 0, 0, 0];
      for (const w of walls) bySide[w.d]++;
      let side = 0;
      for (let d = 1; d < 4; d++) if (bySide[d] > bySide[side]) side = d;
      const sideWalls = walls.filter((w) => w.d === side);
      sideWalls.sort((a, b) => (a.z - b.z) || (a.x - b.x));
      for (let k = 0; k < sideWalls.length; k++) {
        const w = sideWalls[k];
        const s = rng.fork('cv' + r.id + ':' + k);
        const [ex, ez] = edgeCenter(w.x, w.z, w.d);
        const [ix, iz] = INWARD[w.d];
        mound(regKey, cells, ex + ix * 1.25 + (iz ? s.float(-0.5, 0.5) : 0), ez + iz * 1.25 + (ix ? s.float(-0.5, 0.5) : 0), s.float(1.4, 2.1), s, s.int(1, 2));
        wlump(w.x, w.z, w.d, 'rock', s.float(-0.8, 0.8), Y + s.float(1.8, 2.6), s.float(1.5, 2.6), s.float(1.2, 2.0), s.float(0.4, 0.7), s, tint(s, 0.45, 0.7));
      }
      for (let k = 0; k < 3; k++) rubbleSmall(rng.float(x0 + 1, x1 - 1), rng.float(z0 + 1, z1 - 1), 0.5, rng.int(2, 5), rng);
      stalactites(x0, z0, x1, z1, h, Math.round(area * 0.3), rng, 0.6, band);
    } else if (type === 'flooded_cave') {
      gb.hrect('water', x0 + 0.02, z0 + 0.02, x1 - 0.02, z1 - 0.02, Y + 0.09, true, 0.25);
      for (let k = Math.max(1, Math.round(area / 8)); k > 0; k--) {
        const fl = rng.chance(0.4) ? rng.float(0.3, 0.7) : 0;
        onWall(nextWall, 2, (w) => wallLantern(w.x, w.z, w.d, Y + 2.3, rng, { flicker: fl }));
      }
      for (let k = rng.int(1, 3); k > 0; k--) {
        const w = nextWall();
        if (!w) continue;
        const [ex, ez] = edgeCenter(w.x, w.z, w.d);
        const [ix, iz] = INWARD[w.d];
        rubbleSmall(ex + ix * 0.6, ez + iz * 0.6, 0.6, rng.int(2, 4), rng);
      }
    } else if (type === 'crew_quarters') {
      for (let k = rng.int(1, 2); k > 0; k--) onWall(nextWall, 2, (w) => wallTool(w.x, w.z, w.d, rng));
    } else if (type === 'nest') {
      if (rng.chance(0.5)) onWall(nextWall, 2, (w) => crystals(w.x, w.z, w.d, rng, Y + rng.float(0.4, 1.2)));
      for (let k = 0; k < 2; k++) rubbleSmall(rng.float(x0 + 0.8, x1 - 0.8), rng.float(z0 + 0.8, z1 - 0.8), 0.6, rng.int(2, 5), rng);
    } else if (type === 'entrance') {
      for (let k = rng.int(0, 1); k > 0; k--) onWall(nextWall, 2, (w) => wallTool(w.x, w.z, w.d, rng));
    }
  }
  bounds = null;

  // =========================================================================== build
  const special = {
    glow_warm: () => levelMaterial(null, { color: 0xffe0a8, emissive: 0xff9a3c }),
    glow_cold: () => levelMaterial(null, { color: 0xa8f0ff, emissive: 0x2aa8d8 }),
    glass_dead: () => levelMaterial(null, { color: 0x2a2620 }),
    water: () => levelMaterial('water', { transparent: true, opacity: 0.55, color: 0x7fa0a0 }),
  };
  const mesh = gb.build((key) => (special[key] ? special[key]() : levelMaterial(key, { vertexColors: true })));
  mesh.name = 'mineshaft';
  group.add(mesh);
  if (lightsLive) for (const e of added) ctx.lightPool.add(e);
  return { mesh, emitters: added, stats };
}
