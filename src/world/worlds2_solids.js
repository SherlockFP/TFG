// WAVE 3 worlds2 - box-solid builder shared by the Soviet blocks and the twin-sun outpost (world/worlds2_biomes.js).
// Same conventions as world/landmarks.js (Solids + FrameGeo): every solid is an axis-aligned box in a local frame (yaw + translation),
// drawn through ONE GeoBuilder (merged: one mesh per material key for the whole map) and given a Rapier static box.
// Nothing here depends on optional GLB models or Math.random: placement / layout is seeded by the caller.
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { planStairs, rampWorld } from './stairs.js';

// material keys -> level texture (tinted through vertex colours, so every key is ONE material for the whole map)
export const W2_MATS = {
  concrete: 'concrete', stain: 'concrete_stained', brick: 'brick', rust: 'metal_rust', dark: 'metal_dark', metal: 'metal_plate',
  wood: 'wood_planks', hazard: 'hazard_stripes', sand: 'sand', adobe: 'red_sand', paint: 'paint', bone: 'concrete',
};
let glowMat = null;
export function w2Material(key) {
  if (key === 'glow') return glowMat || (glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }));
  return levelMaterial(W2_MATS[key] || W2_MATS.concrete, { vertexColors: true });
}

/** GeoBuilder whose quads are transformed by a frame matrix (local -> world). Winding stays valid: pure yaw + translation. */
export class FrameGeo extends GeoBuilder {
  constructor() { super(); this.M = new THREE.Matrix4(); }
  quad(key, p0, p1, p2, p3, uvs, color) {
    for (const p of [p0, p1, p2, p3]) p.applyMatrix4(this.M);
    super.quad(key, p0, p1, p2, p3, uvs, color);
  }
}

export const rot2 = (x, z, r) => { const c = Math.cos(r), s = Math.sin(r); return [x * c + z * s, -x * s + z * c]; };

/** rectangles [u0, u1, v0, v1] of a len x h wall minus its openings ({u0,u1,v0,v1}) */
export function wallRects(len, h, openings) {
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

/** [x0, x1, z0, z1] rectangles of `rect` with the `cuts` removed (guillotine split; cuts may overlap the rect only partly) */
export function rectMinus(rect, cuts) {
  let list = [rect];
  for (const c of cuts) {
    const next = [];
    for (const r of list) {
      if (c[1] <= r[0] || c[0] >= r[1] || c[3] <= r[2] || c[2] >= r[3]) { next.push(r); continue; }
      if (c[0] > r[0]) next.push([r[0], c[0], r[2], r[3]]);
      if (c[1] < r[1]) next.push([c[1], r[1], r[2], r[3]]);
      const x0 = Math.max(r[0], c[0]), x1 = Math.min(r[1], c[1]);
      if (c[2] > r[2]) next.push([x0, x1, r[2], c[2]]);
      if (c[3] < r[3]) next.push([x0, x1, c[3], r[3]]);
    }
    list = next;
  }
  return list.filter((r) => r[1] - r[0] > 0.04 && r[3] - r[2] > 0.04);
}

/** Box solids in a yaw frame. `B` = { gb: FrameGeo, addBox(x,y,z,sx,sy,sz,rotY), R: RNG, boxes: 0, emitters: [] }. */
export class Solids {
  constructor(B) { this.B = B; this.x = 0; this.z = 0; this.rot = 0; this.tint = 1; }
  frame(x, z, rot) { this.x = x; this.z = z; this.rot = rot; this.B.gb.M.makeRotationY(rot).setPosition(x, 0, z); }
  w(lx, lz) { const [a, b] = rot2(lx, lz, this.rot); return [this.x + a, this.z + b]; }
  /** collider only (local centre lx, lz; bottom y0) */
  col(lx, y0, lz, sx, sy, sz) {
    if (sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return;
    const [wx, wz] = this.w(lx, lz);
    this.B.addBox(wx, y0 + sy / 2, wz, sx, sy, sz, this.rot);
    this.B.boxes++;
  }
  /** visual box (no collider). o: { uv, tint, color:[r,g,b], bottom:false } */
  vis(key, lx, y0, lz, sx, sy, sz, o = {}) {
    if (sx <= 0.001 || sy <= 0.001 || sz <= 0.001) return;
    const gb = this.B.gb, uv = o.uv ?? 0.45;
    const shade = (o.tint ?? 1) * this.tint * (0.95 + 0.1 * this.B.R.next());
    const base = o.color || [1, 1, 1];
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
  /**
   * A straight stair flight (world/stairs.js): visual step columns (no collider) + ONE inclined ramp collider, flat landings
   * and a few skirt boxes. o = planStairs options ({ x, z, y, dir:'x+'|'x-'|'z+'|'z-', width, rise, run, n, baseY, ... }) + { key, uv, tint }.
   */
  stairs(o) {
    const plan = planStairs(o);
    for (const s of plan.steps) this.vis(o.key || 'concrete', s.cx, s.y0, s.cz, s.sx, s.top - s.y0, s.sz, { uv: o.uv ?? 0.6, tint: o.tint ?? 0.9, bottom: false });
    for (const b of plan.boxes) this.col(b.cx, b.cy - b.sy / 2, b.cz, b.sx, b.sy, b.sz);
    const r = rampWorld(plan, this);
    this.B.addBox(r.x, r.y, r.z, r.sx, r.sy, r.sz, r.q);
    this.B.boxes++;
    return plan;
  }
  /** a slab from a [x0,x1,z0,z1] rectangle whose TOP is at `top` */
  slab(key, r, top, th, o = {}) { this.solid(key, (r[0] + r[1]) / 2, top - th, (r[2] + r[3]) / 2, r[1] - r[0], th, r[3] - r[2], o); }
  /**
   * A wall run along local x (ax 'x', at z = c) or z (ax 'z', at x = c), from u = u0 (local coordinate along the axis), length `len`,
   * base y0, height h, thickness T, with openings. Visuals are cut into `panel`-wide chunks with tint jitter (prefab panel look),
   * colliders are one box per rectangle.
   */
  wall(key, ax, c, u0, len, y0, h, ops, T = 0.3, o = {}) {
    const panel = o.panel || 2.9;
    for (const [a, b, v0, v1] of wallRects(len, h, ops || [])) {
      const uc = u0 + (a + b) / 2, wlen = b - a, yb = y0 + v0;
      if (ax === 'x') this.col(uc, yb, c, wlen, v1 - v0, T); else this.col(c, yb, uc, T, v1 - v0, wlen);
      const n = Math.max(1, Math.round(wlen / panel));
      for (let i = 0; i < n; i++) {
        const cu = u0 + a + (wlen / n) * (i + 0.5), wl = wlen / n;
        const oo = { ...o, tint: (o.tint ?? 1) * (0.9 + 0.15 * this.B.R.next()), col: false };
        if (ax === 'x') this.vis(key, cu, yb, c, wl - (n > 1 ? 0.03 : 0), v1 - v0, T, oo); else this.vis(key, c, yb, cu, T, v1 - v0, wl - (n > 1 ? 0.03 : 0), oo);
      }
    }
  }
  light(lx, y, lz, color, intensity, distance, flicker = 0) {
    const [wx, wz] = this.w(lx, lz);
    const e = { pos: new THREE.Vector3(wx, y, wz), color, intensity, distance, flicker, group: 'outdoor' };
    this.B.emitters.push(e);
    return e;
  }
}

/** ground statistics of a disc (centre + two rings) */
export function groundStats(h, x, z, r) {
  let lo = Infinity, hi = -Infinity;
  const pts = [[0, 0]];
  for (const rr of [r * 0.5, r]) for (let k = 0; k < 8; k++) pts.push([Math.cos((k / 8) * Math.PI * 2) * rr, Math.sin((k / 8) * Math.PI * 2) * rr]);
  for (const [dx, dz] of pts) { const v = h(x + dx, z + dz); if (v < lo) lo = v; if (v > hi) hi = v; }
  return { lo, hi };
}

/**
 * Seeded site finder for decor builders: random points inside the map that are clear (C.avoid), flat enough and not overlapping earlier
 * claims. `tol` grows by `grow` per 20 tries so a rough biome still gets its buildings (the foundation solid then reaches down to the
 * lowest terrain point). C = decor ctx (R, lim, avoid, h, reserve).
 */
export function createSiteFinder(C) {
  const taken = [];
  const site = (radius, tol = 2.4, tries = 80, grow = 1.2) => {
    for (let t = 0; t < tries; t++) {
      const x = C.R.float(-C.lim * 0.82, C.lim * 0.82), z = C.R.float(-C.lim * 0.82, C.lim * 0.82);
      if (C.avoid(x, z, radius)) continue;
      if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + radius + 3)) continue;
      const gs = groundStats(C.h, x, z, radius * 0.75);
      if (gs.hi - gs.lo > tol + Math.floor(t / 20) * grow) continue;
      return { x, z, lo: gs.lo, hi: gs.hi, y0: gs.hi + 0.05, yLo: gs.lo };
    }
    return null;
  };
  const claim = (s, r) => { taken.push({ x: s.x, z: s.z, r }); C.reserve?.(s.x, s.z, r); };
  return { site, claim, taken };
}

/** wrap a per-frame decor updater so a bug in cosmetics can never break the render loop (warns once) */
export function guard(fn, label = "worlds2 decor") {
  let warned = false;
  return (...a) => { try { fn(...a); } catch (e) { if (!warned) { warned = true; console.warn("[" + label + "]", e); } } };
}
