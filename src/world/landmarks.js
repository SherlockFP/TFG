// Outdoor LANDMARKS (wave 1, worldx): climbable radio / watch towers, ruined 2-3 storey buildings you can enter,
// parkour routes that end at a high-tier chest, and billboard wrecks. 3-7 per moon, more on big / deep moons.
//
//   planLandmarks(ctx)   pure + deterministic (own RNG stream from the moon seed): [{ kind, x, z, radius, ... }]
//   buildLandmarks(ctx)  visuals (ONE merged mesh per level texture for the whole map), static colliders, chest / scrap
//                        spots. Returns { sites, chests, scrapSpots, parkour, update(dt, game), dispose() }
//   ctx = { seed, moon, plan, terrain, group, addBox, avoid, emitters, sites? }
//
// Everything is built from axis-aligned boxes in a per-landmark frame (GeoBuilder + Rapier boxes), so layout and
// colliders never depend on which optional GLB models finished loading. Only the seeded RNG from core/rng.js is used.
//
// PLAYER NUMBERS the parkour is tuned for (src/entities/localplayer.js): jump velocity 6.2 m/s, gravity 19.6 -> max jump
// height 0.98 m, air time 0.63 m/s; walk 5.0 m/s, sprint 8.2 m/s; a jump costs 8 stamina; falls above ~3.1 m hurt
// (25 dmg), above 6.5 m 50 dmg. Autostep 0.42 m: every stair step is 0.3 m.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { getBasicMaterial, makeCanvasTexture } from '../render/textures.js';
import { createAnyProp } from './propfactory.js';
import { EXT_PRELOAD } from './extmodels.js';
import { planStairs, rampWorld } from './stairs.js';

const TAU = Math.PI * 2;
export const PLAYER = { jumpV: 6.2, g: 19.6, walk: 5.0, sprint: 8.2 };
/** horizontal distance covered by a jump that ends `dh` metres above the take-off point (NaN when out of reach) */
export function hopReach(dh, speed) {
  const disc = PLAYER.jumpV * PLAYER.jumpV - 2 * PLAYER.g * dh;
  if (disc < 0) return NaN;
  return (speed * (PLAYER.jumpV + Math.sqrt(disc))) / PLAYER.g;
}
for (const id of ['ind_generator', 'kk_containers_a', 'barrier_jersey', 'kk_solarpanel', 'psx_dumpster', 'kk_lights']) if (!EXT_PRELOAD.includes(id)) EXT_PRELOAD.push(id);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// level-texture keys -> [texture, tint]
// Only 5 real materials (= 5 draw calls for ALL landmarks of a map); the other keys are aliases with a tint / colour multiplier.
const MATS = { concrete: ['concrete_stained'], metal: ['metal_plate'], rust: ['metal_rust'], hazard: ['hazard_stripes'] };
const KEYMAP = {
  slab: ['concrete', 1.14], dark: ['metal', 0.5], crate: ['rust', 1.0, [1.0, 0.92, 0.62]], wood: ['rust', 0.95, [1.0, 0.72, 0.46]], pipes: ['rust', 1.0, [0.78, 0.94, 1.0]],
};
let glowMat = null;
function materialFor(key) {
  if (key === 'glow') return glowMat || (glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }));
  return levelMaterial((MATS[key] || MATS.concrete)[0], { vertexColors: true });
}

// GeoBuilder whose quads are transformed by a frame matrix (landmark-local -> world). Winding stays valid because the
// frame is a pure yaw + translation.
class FrameGeo extends GeoBuilder {
  constructor() { super(); this.M = new THREE.Matrix4(); }
  quad(key, p0, p1, p2, p3, uvs, color) {
    for (const p of [p0, p1, p2, p3]) p.applyMatrix4(this.M);
    super.quad(key, p0, p1, p2, p3, uvs, color);
  }
}

const rot2 = (x, z, r) => { const c = Math.cos(r), s = Math.sin(r); return [x * c + z * s, -x * s + z * c]; };

// ============================================================================ solids (visual box + collider)
export class Solids {
  constructor(B) { this.B = B; this.x = 0; this.z = 0; this.rot = 0; this.R = null; this.tint = 1; }
  frame(x, z, rot) { this.x = x; this.z = z; this.rot = rot; this.B.gb.M.makeRotationY(rot).setPosition(x, 0, z); }
  w(lx, lz) { const [a, b] = rot2(lx, lz, this.rot); return [this.x + a, this.z + b]; }
  /** collider only (local centre lx, lz; bottom y0) */
  col(lx, y0, lz, sx, sy, sz) {
    const [wx, wz] = this.w(lx, lz);
    this.B.addBox(wx, y0 + sy / 2, wz, sx, sy, sz, this.rot);
    this.B.boxes++;
  }
  /** visual box (no collider) */
  vis(key, lx, y0, lz, sx, sy, sz, o = {}) {
    if (sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return;
    const gb = this.B.gb, uv = o.uv ?? 0.45;
    const [mk, mt, mc] = KEYMAP[key] || [key, 1, null];
    key = mk;
    const shade = (o.tint ?? 1) * mt * this.tint * (0.94 + 0.12 * this.B.R.next());
    const base = o.color || mc || [1, 1, 1];
    const c = [base[0] * shade, base[1] * shade, base[2] * shade];
    const cb = { bottom: [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72], top: c };
    const x0 = lx - sx / 2, x1 = lx + sx / 2, z0 = lz - sz / 2, z1 = lz + sz / 2, y1 = y0 + sy;
    gb.hrect(key, x0, z0, x1, z1, y1, true, uv, c);
    if (o.bottom !== false) gb.hrect(key, x0, z0, x1, z1, y0, false, uv, cb.bottom);
    gb.vrect(key, x0, z1, x1, z1, y0, y1, uv, cb);
    gb.vrect(key, x1, z0, x0, z0, y0, y1, uv, cb);
    gb.vrect(key, x1, z1, x1, z0, y0, y1, uv, cb);
    gb.vrect(key, x0, z0, x0, z1, y0, y1, uv, cb);
  }
  solid(key, lx, y0, lz, sx, sy, sz, o = {}) {
    this.vis(key, lx, y0, lz, sx, sy, sz, o);
    if (o.col !== false) this.col(lx, y0, lz, sx, sy, sz);
  }
  /** straight stair flight (world/stairs.js): visual steps (no collider) + ONE inclined ramp collider + landings / skirts */
  stairs(o) {
    const plan = planStairs(o);
    for (const s of plan.steps) this.vis(o.key || 'concrete', s.cx, s.y0, s.cz, s.sx, s.top - s.y0, s.sz, { uv: 0.6, tint: o.tint ?? 0.95, bottom: false });
    for (const b of plan.boxes) this.col(b.cx, b.cy - b.sy / 2, b.cz, b.sx, b.sy, b.sz);
    const r = rampWorld(plan, this);
    this.B.addBox(r.x, r.y, r.z, r.sx, r.sy, r.sz, r.q);
    this.B.boxes++;
    return plan;
  }
  /** register a chest at local (lx, lz) facing local yaw `yawL` */
  chest(out, id, lx, lz, y, yawL, tier, kind, landmark) {
    const [x, z] = this.w(lx, lz);
    out.chests.push({ id, x, z, y, yaw: this.rot + yawL, tier, kind, landmark });
  }
  scrap(out, lx, lz, y, top = false) {
    const [x, z] = this.w(lx, lz);
    out.scrap.push({ x, z, y, top });
  }
  light(lx, y, lz, color, intensity, distance, flicker = 0) {
    const [wx, wz] = this.w(lx, lz);
    const e = { pos: new THREE.Vector3(wx, y, wz), color, intensity, distance, flicker, group: 'outdoor' };
    this.B.emitters.push(e);
    return e;
  }
}

// ============================================================================ planning
function groundStats(terrain, x, z, r) {
  let lo = Infinity, hi = -Infinity;
  const pts = [[0, 0]];
  for (const rr of [r * 0.5, r]) for (let k = 0; k < 8; k++) pts.push([Math.cos((k / 8) * TAU) * rr, Math.sin((k / 8) * TAU) * rr]);
  for (const [dx, dz] of pts) { const h = terrain.heightAt(x + dx, z + dz); if (h < lo) lo = h; if (h > hi) hi = h; }
  return { lo, hi };
}

const KIND_RADIUS = { tower: 6.8, ruin: 9.0, billboard: 6.5 };

/** Parkour route from (sx, sz) heading `ang`; platforms in WORLD coordinates. Returns null when the terrain does not allow it. */
export function genParkour(R, terrain, avoid, sx, sz, ang0, tier, depth) {
  const nHops = R.int(9, 11 + Math.min(4, depth));
  const targetTop = Math.min(9.4, 4.6 + tier * 0.55 + depth * 0.25);
  const gmax = (x, z, r) => groundStats(terrain, x, z, r).hi;
  const plats = [];
  const first = { type: 'pillar', x: sx, z: sz, sx: 2.4, sz: 2.4, yaw: ang0, top: gmax(sx, sz, 1.6) + 0.7, hard: false };
  if (avoid(sx, sz, 3)) return null;
  plats.push(first);
  let ang = ang0;
  for (let i = 1; i <= nHops; i++) {
    const prev = plats[i - 1];
    const goal = i === nHops;
    const type = goal ? 'goal' : i % 4 === 0 ? 'rest' : R.weighted([{ t: 'pillar', w: 5 }, { t: 'beam', w: 2 }, { t: 'debris', w: 2 }, { t: 'crates', w: 1 }]).t;
    const size = type === 'goal' ? [4.2, 4.2] : type === 'rest' ? [3.8, 3.8] : type === 'beam' ? [0.85, 5.2] : type === 'debris' ? [2.5, 2.5] : type === 'crates' ? [2.2, 2.2] : [R.float(1.8, 2.6), R.float(1.8, 2.6)];
    const desired = prev.top + ((goal ? targetTop + 0.4 : targetTop) - prev.top) / (nHops - i + 1) * R.float(0.7, 1.4);
    const dh = clamp(desired - prev.top, -1.0, 0.7);
    const hard = !goal && type !== 'rest' && i > 2 && R.chance(0.28 + 0.05 * Math.min(depth, 4));
    const reachWalk = hopReach(dh, PLAYER.walk) * 0.88 - 0.35, reachSprint = hopReach(dh, PLAYER.sprint) * 0.86 - 0.35;
    if (!(reachWalk > 1.6)) return null;
    // a "hard" hop is really beyond a walking jump (needs a sprint run-up); the others fit a plain walking jump
    const isHard = hard && reachSprint > reachWalk + 0.6;
    const gap = isHard ? R.float(Math.max(reachWalk + 0.2, 2.3), Math.min(3.7, reachSprint)) : R.float(1.5, Math.min(2.6, reachWalk));
    ang = clamp(ang + R.float(-0.6, 0.6), ang0 - 1.1, ang0 + 1.1);
    const halfPrev = prev.sz / 2, halfNew = size[1] / 2;
    const dist = gap + halfPrev + halfNew;
    const x = prev.x + Math.sin(ang) * dist, z = prev.z + Math.cos(ang) * dist;
    if (avoid(x, z, 2)) return null;
    let top = prev.top + dh;
    const gm = gmax(x, z, Math.max(size[0], size[1]) * 0.7);
    if (top < gm + 0.55) top = gm + 0.55;
    if (top - prev.top > 0.78) return null;
    plats.push({ type, x, z, sx: size[0], sz: size[1], yaw: ang, top, hard: isHard });
    // hop bookkeeping (world distances along the flight path)
    const p = plats[i];
    p.gap = Math.hypot(p.x - prev.x, p.z - prev.z) - halfPrev - halfNew;
    p.dh = p.top - prev.top;
  }
  // platform i faces the next one
  for (let i = 0; i < plats.length - 1; i++) plats[i].yaw = Math.atan2(plats[i + 1].x - plats[i].x, plats[i + 1].z - plats[i].z);
  plats[plats.length - 1].yaw = plats[plats.length - 2].yaw;
  // safe way down from the goal: ledges dropping 2.4 m each towards the side
  const goal = plats[plats.length - 1];
  const side = R.sign(), pa = goal.yaw + (side * Math.PI) / 2;
  const ledges = [];
  let lx = goal.x, lz = goal.z, lt = goal.top;
  for (let j = 1; j <= 5; j++) {
    const d = j === 1 ? goal.sx / 2 + 1.3 : 2.5;
    lx += Math.sin(pa) * d; lz += Math.cos(pa) * d;
    lt -= 2.4;
    const g = gmax(lx, lz, 1.4);
    if (lt <= g + 0.5) break;
    ledges.push({ type: 'ledge', x: lx, z: lz, sx: 2.2, sz: 2.2, yaw: pa, top: lt, hard: false });
  }
  return { plats, ledges };
}

/** Deterministic list of landmark sites for a moon (no geometry). */
export function planLandmarks({ seed, moon, plan, terrain, avoid }) {
  const R = new RNG(((seed | 0) ^ 0x1a4d3a) >>> 0);
  const sc = terrain.scale || 1, tier = moon?.tier || 1, depth = moon?.generated ? (moon.sector | 0) : 0;
  let n = 3 + Math.round((sc - 1) * 5) + (tier >= 3 ? 1 : 0) + (depth >= 3 ? 1 : 0) + R.int(0, 1) + (moon?.landmarkBonus | 0);
  n = clamp(n, 3, 7);
  const kinds = ['tower', 'ruin', 'parkour'];
  while (kinds.length < n) kinds.push(R.weighted([{ k: 'tower', w: 3 }, { k: 'ruin', w: 3 }, { k: 'parkour', w: 2 + Math.min(2, depth) }, { k: 'billboard', w: 3 }]).k);
  R.shuffle(kinds);
  const sites = [];
  const lim = (terrain.playHalf || 130) * 0.9;
  const okAt = (x, z, r) => {
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    if (avoid(x, z, r + 4)) return false;
    if (terrain.distToPath(x, z) < r + 8) return false;
    return sites.every((s) => Math.hypot(s.x - x, s.z - z) > s.radius + r + 9);
  };
  for (const kind of kinds) {
    const idx = sites.length;
    let placed = null;
    for (let t = 0; t < 90 && !placed; t++) {
      const a = R.float(0, TAU), d = R.float(46, 118) * sc;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (kind === 'parkour') {
        const rr = new RNG((R.next() * 4294967296) >>> 0);
        const route = genParkour(rr, terrain, avoid, x, z, R.float(0, TAU), tier, depth);
        if (!route) continue;
        const all = route.plats.concat(route.ledges);
        const cx = all.reduce((q, p) => q + p.x, 0) / all.length, cz = all.reduce((q, p) => q + p.z, 0) / all.length;
        const radius = Math.max(...all.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 4;
        if (!all.every((p) => Math.abs(p.x) < lim && Math.abs(p.z) < lim && !avoid(p.x, p.z, 4) && terrain.distToPath(p.x, p.z) > 9
          && sites.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > q.radius + 4))) continue;
        placed = { kind, idx, x: cx, z: cz, radius, plats: route.plats, ledges: route.ledges };
      } else {
        const r = KIND_RADIUS[kind];
        if (!okAt(x, z, r)) continue;
        const gs = groundStats(terrain, x, z, r * 0.8);
        if (gs.hi - gs.lo > (kind === 'ruin' ? 1.8 : 3.0)) continue;
        placed = { kind, idx, x, z, radius: r, rot: R.pick([0, 1, 2, 3]) * (Math.PI / 2) + R.float(-0.25, 0.25), yLo: gs.lo, y0: gs.hi + 0.15 };
        if (kind === 'tower') { placed.flights = R.int(3, 4 + (tier >= 3 || depth >= 2 ? 1 : 0)); placed.style = R.chance(0.5) ? 'radio' : 'watch'; }
        if (kind === 'ruin') placed.floors = R.chance(0.5 + Math.min(0.25, depth * 0.06)) ? 3 : 2;
        if (kind === 'billboard') { placed.leaning = R.chance(0.5); placed.text = R.int(0, 7); }
      }
    }
    if (placed) sites.push(placed);
  }
  return sites;
}

// ============================================================================ builders
const AD_LINES = [['CLICK HERE', 'YOU WON!!!'], ['404', 'AD NOT FOUND'], ['HOT SINGLES', 'IN YOUR AREA'], ['YOU ARE VISITOR', 'NUMBER 1,000,000'], ['FREE ROBUX', 'NO SURVEY'],
  ['SUBSCRIBE', 'OR ELSE'], ['BEST VIEWED IN', 'NETSCAPE 4.0'], ['THIS SPACE', 'AVAILABLE']];

function pickChestTier(R, kind, tier, depth) {
  const x = R.next();
  if (kind === 'parkour') { const v = Math.min(0.5, 0.12 + tier * 0.06 + depth * 0.03); return x < v ? 'void' : x < 0.85 ? 'gold' : 'iron'; }
  if (kind === 'tower') { const g = Math.min(0.6, 0.2 + tier * 0.07 + depth * 0.03); return x < g ? 'gold' : 'iron'; }
  if (kind === 'ruin') return x < 0.28 + Math.min(0.2, tier * 0.04) ? 'gold' : 'iron';
  return x < 0.3 ? 'iron' : 'wood';
}

export function buildTower(S, site, R, out, tier, depth) {
  const nFl = site.flights, y0 = site.y0, Htop = y0 + 3 * nFl;
  const P = 3.25, C = 2.6, LS = 1.7, STEP = (2 * C - LS) / 10;
  S.frame(site.x, site.z, site.rot);
  S.solid('slab', 0, site.yLo - 0.7, 0, 7.8, y0 - site.yLo + 0.7, 7.8, { uv: 0.5, tint: 0.85 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.solid('rust', sx * P, y0, sz * P, 0.4, 3 * nFl + 1.3, 0.4, { tint: 0.9 });
  // ring beams at every landing level (visual only)
  for (let k = 1; k <= nFl; k++) {
    const y = y0 + 3 * k - 0.45;
    for (const s of [-1, 1]) { S.vis('rust', 0, y, s * P, 2 * P, 0.16, 0.16, { tint: 0.8 }); S.vis('rust', s * P, y, 0, 0.16, 0.16, 2 * P, { tint: 0.8 }); }
  }
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]], corners = [[-C, -C], [C, -C], [C, C], [-C, C]];
  for (let k = 0; k < nFl; k++) {
    const [dx, dz] = dirs[k % 4], [cx, cz] = corners[k % 4];
    const hk = y0 + 3 * k;
    const outSign = dx ? Math.sign(cz) : Math.sign(cx);
    S.stairs({ key: 'metal', x: cx + dx * LS / 2, z: cz + dz * LS / 2, y: hk, dir: dx > 0 ? 'x+' : dx < 0 ? 'x-' : dz > 0 ? 'z+' : 'z-', width: 1.4, rise: 3.0, run: 10 * STEP, n: 10, tag: 'tower' });
    for (let i = 0; i < 10; i++) {
      const top = hk + 0.3 * (i + 1);
      if (i % 2 === 1) {
        const rc = cx + dx * (LS / 2 + STEP * i), rz = cz + dz * (LS / 2 + STEP * i);
        for (const sgn of [1, -1]) {
          const ox = dx ? 0 : sgn * 0.75 * outSign, oz = dz ? 0 : sgn * 0.75 * outSign;
          S.solid('rust', rc + ox, top - 0.3, rz + oz, dx ? STEP * 2 : 0.08, 1.05, dz ? STEP * 2 : 0.08, { tint: 0.85 });
        }
      }
    }
    if (k + 1 < nFl) {
      const [ex, ez] = corners[(k + 1) % 4], top = y0 + 3 * (k + 1);
      S.solid('slab', ex, top - 0.25, ez, LS, 0.25, LS, { uv: 0.6, tint: 0.9 });
      const sx = Math.sign(ex), sz = Math.sign(ez);
      S.solid('rust', ex, top, ez + sz * (LS / 2 + 0.04), LS, 1.05, 0.08, { tint: 0.85 });
      S.solid('rust', ex + sx * (LS / 2 + 0.04), top, ez, 0.08, 1.05, LS, { tint: 0.85 });
    }
  }
  // deck in canonical orientation (arrival at corner 0, opening on the west side), rotated to the arrival corner
  const cIdx = nFl % 4, a = -cIdx * (Math.PI / 2), odd = cIdx % 2 === 1;
  const R2 = (x, z) => { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; };
  const db = (key, cx, cz, sx, sy, sz, y, o = {}) => { const [x, z] = R2(cx, cz); S.solid(key, x, y, z, odd ? sz : sx, sy, odd ? sx : sz, o); };
  db('slab', 0.925, 0, 5.55, 0.3, 7.4, Htop - 0.3, { uv: 0.5 });
  db('slab', -2.775, -2.775, 1.85, 0.3, 1.85, Htop - 0.3, { uv: 0.5 });
  db('slab', -2.775, 2.775, 1.85, 0.3, 1.85, Htop - 0.3, { uv: 0.5 });
  db('rust', 0, 3.7, 7.5, 1.1, 0.1, Htop); db('rust', 0, -3.7, 7.5, 1.1, 0.1, Htop);
  db('rust', 3.7, 0, 0.1, 1.1, 7.5, Htop); db('rust', -3.7, 0, 0.1, 1.1, 7.5, Htop);
  db('rust', -1.85, 0, 0.1, 1.1, 3.7, Htop);
  // crown: radio mast (blinking beacon) or a watch cabin
  if (site.style === 'radio') {
    db('rust', 0.5, -2.3, 0.5, 5.0, 0.5, Htop, { tint: 0.9 });
    db('metal', 0.5, -2.3, 0.28, 3.0, 0.28, Htop + 5.0);
    for (const h of [2.4, 4.0, 6.0]) db('rust', 0.5, -2.3, 2.2, 0.12, 0.12, Htop + h, { col: false });
    db('dark', 0.5, -2.3, 1.6, 0.9, 0.12, Htop + 3.4, { col: false, tint: 0.7 });
    const [bx, bz] = R2(0.5, -2.3);
    db('glow', 0.5, -2.3, 0.34, 0.34, 0.34, Htop + 8.0, { col: false, color: [1, 0.12, 0.08] });
    out.beacons.push(S.light(bx, Htop + 8.2, bz, 0xff2a1a, 2.2, 30, 0));
  } else {
    for (const sz of [-2.3, 2.3]) for (const sx of [1.3, 3.5]) db('wood', sx, sz, 0.2, 2.6, 0.2, Htop, { tint: 0.85 });
    db('wood', 2.4, 0, 2.6, 0.25, 5.2, Htop + 2.6, { uv: 0.5, tint: 0.9, col: false });
    db('wood', 3.55, 0, 0.12, 2.6, 4.9, Htop, { uv: 0.5, tint: 0.85 });
    const [bx, bz] = R2(2.4, 0);
    out.beacons.push(S.light(bx, Htop + 2.2, bz, 0xffb060, 1.6, 20, 0.2));
  }
  // chest + a keepsake on the deck
  const [cx, cz] = R2(2.7, 0.0);
  const [fx, fz] = R2(-1, 0);
  S.chest(out, `L${site.idx}a`, cx, cz, Htop, Math.atan2(fx, fz), pickChestTier(R, 'tower', tier, depth), 'tower', site.idx);
  { const [sx, sz] = R2(2.4, -2.6); S.scrap(out, sx, sz, Htop, true); }
  // dressing at the foot
  out.dress.push({ id: 'ext:psx_dumpster', lx: 4.9, lz: 2.6, yaw: 0.4, box: [2.55, 1.72, 1.79] });
  out.dress.push({ id: 'ext:ind_generator', lx: -4.8, lz: 3.4, yaw: -0.3, box: [3.65, 1.75, 1.3] });
}

function wallRects(len, h, openings) {
  const cuts = openings.slice().sort((a, b) => a.u0 - b.u0), rects = [];
  let u = 0;
  for (const o of cuts) {
    if (o.u0 > u) rects.push([u, o.u0, 0, h]);
    if (o.v0 > 0) rects.push([o.u0, o.u1, 0, o.v0]);
    if (o.v1 < h) rects.push([o.u0, o.u1, o.v1, h]);
    u = Math.max(u, o.u1);
  }
  if (u < len) rects.push([u, len, 0, h]);
  return rects.filter((r) => r[1] - r[0] > 0.05 && r[3] - r[2] > 0.05);
}

export function buildRuin(S, site, R, out, tier, depth) {
  const nF = site.floors, y0 = site.y0, FH = 3.0, W = 11.0, D = 9.0, T = 0.4;
  const L = (i) => y0 + FH * i;
  S.frame(site.x, site.z, site.rot);
  S.solid('slab', 0, site.yLo - 0.7, 0, W + 2, y0 - site.yLo + 0.7, D + 2, { uv: 0.5, tint: 0.8 });
  // stairs: lane A (x -5.1..-3.65) climbs +z, lane B (-3.65..-2.2) climbs -z, both 3.2 m long
  const Z0 = -2.6, Z1 = 0.6, ST = 0.32, laneA = -4.375, laneB = -2.925, LW = 1.45;
  const flights = [{ lane: laneA, dir: 1, base: L(0) }, { lane: laneB, dir: -1, base: L(1) }];
  if (nF === 3) flights.push({ lane: laneA, dir: 1, base: L(2) });
  for (const f of flights) S.stairs({ key: 'concrete', x: f.lane, z: f.dir > 0 ? Z0 : Z1, y: f.base, dir: f.dir > 0 ? 'z+' : 'z-', width: LW, rise: 3.0, run: 10 * ST, n: 10, tint: 0.9, tag: 'ruin' });
  // slabs per level as tile runs (stair cut-outs + a few holes)
  const NX = 10, NZ = 8, X0 = -5.3, Z0s = -4.3, TX = (2 * 5.3) / NX, TZ = (2 * 4.3) / NZ;
  const cut = (lv) => {
    const r = [];
    if (lv === 1) r.push([-5.1, -3.65, -1.96, 0.6]);
    if (lv === 2) r.push([-3.65, -2.2, -2.6, -0.15]);
    if (lv === 3) r.push([-5.1, -3.65, -1.85, 0.6]);
    return r;
  };
  const stairBlock = [-5.35, -2.15, -4.4, 2.3];
  const corr = nF === 2 ? [-2.4, 1.6, -4.4, -2.4] : [-2.4, 1.2, 0.4, 2.4];
  const holes = {};
  for (let lv = 1; lv <= nF; lv++) {
    holes[lv] = cut(lv);
    const nH = lv === nF ? 1 : 2;
    for (let h = 0; h < nH; h++) for (let t = 0; t < 12; t++) {
      const hx = R.float(-1.6, 3.9), hz = R.float(-3.3, 3.3), hw = R.float(1.6, 2.4), hd = R.float(1.4, 2.2);
      const rect = [hx - hw / 2, hx + hw / 2, hz - hd / 2, hz + hd / 2];
      const hit = (a, b, m) => !(rect[1] < a[0] - m || rect[0] > a[1] + m || rect[3] < a[2] - m || rect[2] > a[3] + m);
      if (hit(stairBlock, stairBlock, 0.4)) continue;
      if (lv === nF && hit(corr, corr, 0.8)) continue;
      // keep the top-level chest spot and the ground/L1 rubble areas walkable
      holes[lv].push(rect);
      break;
    }
  }
  const solidAt = (lv, x, z) => !holes[lv].some((r) => x > r[0] && x < r[1] && z > r[2] && z < r[3]);
  for (let lv = 1; lv <= nF; lv++) {
    for (let j = 0; j < NZ; j++) {
      let run = null;
      const flush = () => { if (run) { S.solid('slab', (run.x0 + run.x1) / 2, L(lv) - 0.3, run.z, run.x1 - run.x0, 0.3, TZ, { uv: 0.5, tint: 0.92 }); run = null; } };
      for (let i = 0; i < NX; i++) {
        const cx = X0 + TX * (i + 0.5), cz = Z0s + TZ * (j + 0.5);
        // a tile is kept when its centre and its four corners' inner points are outside every hole
        const ok = [[0, 0], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]].every(([a, b]) => solidAt(lv, cx + a * TX, cz + b * TZ));
        if (ok) { if (!run) run = { x0: cx - TX / 2, x1: cx + TX / 2, z: cz }; else run.x1 = cx + TX / 2; } else flush();
      }
      flush();
    }
  }
  // walls per level with door / window / collapse openings
  const doorSides = [];
  const sides = [
    { n: 'S', along: 'x', c: -4.3, len: W + 0.8, o: -5.5 - 0.4 },
    { n: 'N', along: 'x', c: 4.3, len: W + 0.8, o: -5.5 - 0.4 },
    { n: 'W', along: 'z', c: -5.3, len: D, o: -4.5 },
    { n: 'E', along: 'z', c: 5.3, len: D, o: -4.5 },
  ];
  const nDoors = R.chance(0.6) ? 2 : 1;
  const ds = R.shuffle([0, 1, 2, 3]).filter((s) => s !== 2).slice(0, nDoors);   // never through the stair wall
  const collapseSide = R.pick([0, 1, 3]);
  for (let lv = 0; lv < nF; lv++) {
    sides.forEach((sd, si) => {
      const ops = [];
      if (lv === 0 && ds.includes(si)) {
        const u = R.float(2.2, sd.len - 2.2 - 1.5);
        ops.push({ u0: u, u1: u + 1.5, v0: 0, v1: 2.4, door: true });
        doorSides.push({ side: si, u: u + 0.75 });
      }
      const nWin = R.int(1, 2);
      for (let k = 0; k < nWin; k++) {
        const u = R.float(1.3, sd.len - 2.5);
        if (ops.some((o) => u < o.u1 + 0.7 && u + 1.2 > o.u0 - 0.7)) continue;
        ops.push({ u0: u, u1: u + 1.2, v0: R.chance(0.5) ? 0.8 : 1.0, v1: 2.1 });
      }
      if (lv >= nF - 1 && si === collapseSide) {
        const u = R.float(1.5, sd.len - 5.0), w = R.float(2.4, 4.0), hb = R.float(0.6, 1.6);
        if (!ops.some((o) => u < o.u1 + 0.3 && u + w > o.u0 - 0.3)) ops.push({ u0: u, u1: u + w, v0: hb, v1: FH - 0.3 });
      }
      for (const [u0, u1, v0, v1] of wallRects(sd.len, FH - 0.3, ops)) {
        const uc = sd.o + (u0 + u1) / 2, yb = L(lv) + v0;
        if (sd.along === 'x') S.solid('concrete', uc, yb, sd.c, u1 - u0, v1 - v0, T, { uv: 0.45 });
        else S.solid('concrete', sd.c, yb, uc, T, v1 - v0, u1 - u0, { uv: 0.45 });
      }
    });
  }
  // parapet on the roof (broken)
  sides.forEach((sd, si) => {
    const ops = [];
    for (let k = 0; k < 2; k++) { const u = R.float(0.5, sd.len - 3); if (!ops.some((o) => u < o.u1 + 0.5 && u + 2.2 > o.u0 - 0.5)) ops.push({ u0: u, u1: u + R.float(1.4, 2.6), v0: 0, v1: 1.1 }); }
    for (const [u0, u1, v0, v1] of wallRects(sd.len, 1.0, ops)) {
      const uc = sd.o + (u0 + u1) / 2;
      if (sd.along === 'x') S.solid('concrete', uc, L(nF) + v0, sd.c, u1 - u0, v1 - v0, T, { tint: 0.85 });
      else S.solid('concrete', sd.c, L(nF) + v0, uc, T, v1 - v0, u1 - u0, { tint: 0.85 });
    }
  });
  // door steps down to the ground (outer side)
  for (const d of doorSides) {
    const sd = sides[d.side];
    const outX = sd.along === 'x' ? 0 : Math.sign(sd.c), outZ = sd.along === 'z' ? 0 : Math.sign(sd.c);
    const px = sd.along === 'x' ? sd.o + d.u : sd.c, pz = sd.along === 'z' ? sd.o + d.u : sd.c;
    for (let j = 1; j <= 8; j++) {
      const top = y0 - 0.3 * j, sx = px + outX * (1.05 + 0.4 * j), sz = pz + outZ * (1.05 + 0.4 * j);
      const [wx, wz] = S.w(sx, sz);
      const gh = out.terrain.heightAt(wx, wz);
      if (top <= gh + 0.02) break;
      S.solid('slab', sx, Math.min(gh, top) - 0.4, sz, outX ? 0.4 : 1.5, top - Math.min(gh, top) + 0.4, outZ ? 0.4 : 1.5, { uv: 0.6, tint: 0.85 });
    }
  }
  // rubble on the floors + loot
  for (let k = 0; k < 4; k++) {
    const lv = R.pick([0, 0, 1]), x = R.float(-1.0, 4.2), z = R.float(-3.2, 3.2);
    if (lv > 0 && (!solidAt(lv, x, z) || lv >= nF)) continue;
    const s = R.float(0.5, 0.95);
    S.solid(R.chance(0.5) ? 'crate' : 'concrete', x, L(lv), z, s, s * R.float(0.7, 1.0), s, { tint: 0.85 });
  }
  const topChest = nF === 2 ? [0.4, -3.3] : [-0.6, 1.4];
  const [fx, fz] = nF === 2 ? [0, 1] : [1, 0];
  S.chest(out, `L${site.idx}a`, topChest[0], topChest[1], L(nF), Math.atan2(fx, fz), pickChestTier(R, 'ruin', tier, depth), 'ruin', site.idx);
  if (R.chance(0.7)) S.chest(out, `L${site.idx}b`, 4.4, 3.2, L(0), Math.atan2(-1, 0), 'wood', 'ruin', site.idx);
  for (const [x, z, lv] of [[3.6, -2.4, 0], [2.4, 2.8, 1], [1.5, -3.0, nF - 1]]) {
    if (lv >= 1 && !solidAt(lv, x, z)) continue;
    S.scrap(out, x, z, L(lv));
  }
}

function buildParkour(S, site, R, out, tier, depth) {
  S.frame(0, 0, 0);
  const gh = (x, z) => out.terrain.heightAt(x, z);
  const one = (p) => {
    S.frame(p.x, p.z, p.yaw);
    const lo = Math.min(gh(p.x, p.z), gh(p.x + p.sx * 0.5, p.z + p.sz * 0.5), gh(p.x - p.sx * 0.5, p.z - p.sz * 0.5)) - 0.6;
    const key = p.type === 'beam' ? 'pipes' : p.type === 'crates' ? 'crate' : p.type === 'debris' ? 'dark' : p.type === 'rest' || p.type === 'goal' ? 'slab' : 'concrete';
    if (p.type === 'debris') {
      // floating slab: glowing underside + hanging cables, nothing underneath
      S.solid('dark', 0, p.top - 0.5, 0, p.sx, 0.5, p.sz, { uv: 0.6, tint: 0.9 });
      S.vis('glow', 0, p.top - 0.56, 0, p.sx * 0.8, 0.06, p.sz * 0.8, { color: [0.1, 0.9, 1.0], col: false });
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) S.vis('rust', a * p.sx * 0.42, p.top - 2.1, b * p.sz * 0.42, 0.08, 1.6, 0.08, { col: false });
    } else if (p.type === 'beam') {
      S.solid(key, 0, p.top - 0.55, 0, p.sx, 0.55, p.sz, { uv: 0.5, tint: 0.85 });
      for (const s of [-1, 1]) S.solid('rust', 0, lo, s * (p.sz / 2 - 0.5), 0.6, p.top - 0.55 - lo, 0.5, { tint: 0.85 });
    } else {
      S.solid(key, 0, lo, 0, p.sx, p.top - lo, p.sz, { uv: 0.5, tint: p.type === 'crates' ? 1 : 0.9 });
      if (p.type === 'pillar') S.vis('hazard', 0, p.top - 0.5, 0, p.sx + 0.04, 0.3, p.sz + 0.04, { col: false, bottom: false, uv: 0.5 });
      if (p.type === 'rest' || p.type === 'goal') S.vis('hazard', 0, p.top - 0.02, 0, p.sx - 0.2, 0.02, 0.5, { col: false, uv: 0.6, tint: 0.9 });
    }
  };
  site.plats.forEach(one);
  site.ledges.forEach(one);
  const start = site.plats[0], goal = site.plats[site.plats.length - 1];
  const tierId = pickChestTier(R, 'parkour', tier, depth);
  // trail marker: a hazard post with a lamp next to the first platform
  S.frame(start.x, start.z, start.yaw);
  S.solid('hazard', 1.9, start.top - 0.7, -1.0, 0.3, 2.0, 0.3, { uv: 0.4 });
  S.vis('glow', 1.9, start.top + 1.3, -1.0, 0.36, 0.2, 0.36, { color: [1, 0.85, 0.2], col: false });
  // lamps on the rest platforms and the goal (a lamp post in one corner; the goal glows in its chest colour)
  for (const p of site.plats) if (p.type === 'rest' || p.type === 'goal') {
    S.frame(p.x, p.z, p.yaw);
    S.solid('rust', p.sx / 2 - 0.3, p.top, p.sz / 2 - 0.3, 0.18, 2.4, 0.18, { tint: 0.8 });
    S.vis('glow', p.sx / 2 - 0.3, p.top + 2.4, p.sz / 2 - 0.3, 0.34, 0.18, 0.34, { color: [1, 0.9, 0.6], col: false });
    const e = S.light(0, p.top + 2.6, 0, p.type === 'goal' ? CHEST_LIGHT[tierId] : 0xffe0a0, p.type === 'goal' ? 1.8 : 1.2, 22, 0.05);
    out.beacons.push(e);
    if (p.type === 'rest') S.scrap(out, 0, 0, p.top);
  }
  S.frame(0, 0, 0);
  S.chest(out, `L${site.idx}a`, goal.x, goal.z, goal.top, goal.yaw + Math.PI, tierId, 'parkour', site.idx);
  out.parkour.push({ id: site.idx, plats: site.plats, ledges: site.ledges });
}
const CHEST_LIGHT = { iron: 0x7fc4ff, gold: 0xffc830, void: 0xb45cff, wood: 0xffb060 };

function buildBillboard(S, site, R, out, tier, depth, B) {
  S.frame(site.x, site.z, site.rot);
  const y0 = site.y0;
  S.solid('slab', 0, site.yLo - 0.6, 0, 3.6, y0 - site.yLo + 0.6, 2.4, { uv: 0.5, tint: 0.8 });
  for (const sx of [-2.4, 2.4]) S.solid('rust', sx, y0, 0, 0.55, 9.0, 0.55, { tint: 0.85 });
  S.vis('dark', 0, y0 + 9.0, 0, 6.6, 0.3, 0.7, { tint: 0.8 });
  // the screen: one unique canvas texture per billboard (extra draw call); leaning ones are tilted, cables dangle
  const [l1, l2] = AD_LINES[site.text % AD_LINES.length];
  const tex = makeCanvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#100418'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff2ad8'; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3);
    ctx.fillStyle = '#2af4ff'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText(l1, w / 2, 26);
    ctx.fillStyle = '#fff04a'; ctx.fillText(l2, w / 2, 46);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.0), mat);
  const [wx, wz] = S.w(0, 0.32);
  mesh.position.set(wx, y0 + 6.4, wz);
  mesh.rotation.set(site.leaning ? 0.12 : 0, site.rot, site.leaning ? 0.1 : 0);
  B.extra.push(mesh, mat, tex, mesh.geometry);
  B.group.add(mesh);
  S.vis('dark', 0, y0 + 4.7, 0.05, 6.2, 3.4, 0.2, { tint: 0.6, col: false });
  out.screens.push({ mat, phase: R.float(0, 6), e: null });
  // scaffolding + a fallen chunk to clamber over
  S.solid('metal', -1.6, y0, 1.6, 0.9, 1.0, 0.9, { tint: 0.85 });
  S.solid('crate', 1.0, y0, 2.0, 1.0, 0.9, 1.0, { tint: 0.9 });
  S.solid('rust', 3.2, y0, 2.6, 2.2, 0.35, 1.2, { tint: 0.8 });
  S.scrap(out, 0.2, 1.9, y0);
  if (R.chance(0.5)) S.chest(out, `L${site.idx}a`, -2.6, 1.9, y0, 0.6, 'wood', 'billboard', site.idx);
  const e = S.light(0, y0 + 6.4, 1.2, 0xff2ad8, 1.2, 22, 0.3);
  out.beacons.push(e);
}

// ============================================================================ public: build
export function buildLandmarks(ctx) {
  const { seed, moon, terrain, group, addBox, emitters, avoid } = ctx;
  const sites = ctx.sites || planLandmarks(ctx);
  const gb = new FrameGeo();
  const B = { gb, addBox, emitters: [], boxes: 0, R: new RNG(((seed | 0) ^ 0x7c0de5) >>> 0), extra: [], group };
  const S = new Solids(B);
  const tier = moon?.tier || 1, depth = moon?.generated ? (moon.sector | 0) : 0;
  const out = { chests: [], scrap: [], parkour: [], beacons: [], screens: [], dress: [], terrain };
  const dressList = [];
  for (const site of sites) {
    const R = new RNG(((seed | 0) ^ 0x2b11d ^ ((site.idx + 1) * 7919)) >>> 0);
    S.tint = 1;
    const before = out.dress.length;
    try {
      if (site.kind === 'tower') buildTower(S, site, R, out, tier, depth);
      else if (site.kind === 'ruin') buildRuin(S, site, R, out, tier, depth);
      else if (site.kind === 'parkour') buildParkour(S, site, R, out, tier, depth);
      else buildBillboard(S, site, R, out, tier, depth, B);
    } catch (err) { console.warn('landmark', site.kind, err); }
    for (let i = before; i < out.dress.length; i++) dressList.push({ ...out.dress[i], frame: [site.x, site.z, site.rot], y0: site.y0 });
  }
  const mesh = gb.build(materialFor);
  group.add(mesh);
  // ext-model dressing (visual only; colliders use the fixed sizes given here, not the model's bounds)
  const dressObjs = [];
  for (const d of dressList) {
    const [fx, fz, fr] = d.frame, [ax, az] = rot2(d.lx, d.lz, fr);
    const x = fx + ax, z = fz + az, y = terrain.heightAt(x, z);
    try {
      const o = createAnyProp(d.id, { seed: 5 });
      o.position.set(x, y - 0.05, z); o.rotation.y = fr + d.yaw;
      group.add(o); dressObjs.push(o);
      if (d.box) addBox(x, y + d.box[1] / 2, z, d.box[0], d.box[1], d.box[2], fr + d.yaw);
    } catch { /* optional */ }
  }
  const chests = out.chests, scrapSpots = out.scrap;
  for (const e of B.emitters) emitters.push(e);
  return {
    sites: sites.map((s) => ({ kind: s.kind, idx: s.idx, x: s.x, z: s.z, radius: s.radius, rot: s.rot || 0, y0: s.y0 ?? null, floors: s.floors, flights: s.flights, style: s.style })),
    chests, scrapSpots, parkour: out.parkour, boxes: B.boxes, mesh,
    update(dt, game) {
      this.t = (this.t || 0) + dt;
      const cam = game?.camera?.position;
      for (let i = 0; i < out.beacons.length; i++) {
        const e = out.beacons[i];
        if (!e.base) e.base = e.intensity;
        if (e.color === 0xff2a1a) e.intensity = e.base * (Math.sin(this.t * 3 + i) > 0.55 ? 1 : 0.08);
      }
      if (cam) for (const s of out.screens) s.mat.color.setScalar(0.8 + 0.2 * Math.sin(this.t * 9 + s.phase) * (Math.random() < 0.02 ? 0.3 : 1));
    },
    dispose() {
      mesh.removeFromParent();
      mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const o of dressObjs) o.removeFromParent();
      for (const x of B.extra) { x.removeFromParent?.(); x.dispose?.(); }
      for (const e of B.emitters) { const i = emitters.indexOf(e); if (i >= 0) emitters.splice(i, 1); }
      void avoid;
    },
  };
}
