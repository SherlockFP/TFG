// modelkit.js — shared helpers for procedural PSX models (avatar.js, creatures.js).
// Geometries and base materials are cached at module level; per-instance material
// clones (hit flash / elite tint) are created lazily by Tinter.
// Safe to import in Node: no `document` access at import time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HAS_DOM = typeof document !== 'undefined';
export const TAU = Math.PI * 2;
export const PI = Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
/** 0..1 ramp between a and b */
export const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
/** piecewise linear keyframes: keys = [[t0, v0], [t1, v1], ...] */
export function keys(t, k) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return lerp(a[1], b[1], smooth((t - a[0]) / (b[0] - a[0]))); }
  }
  return k[k.length - 1][1];
}

/** mulberry32 PRNG → () => [0,1) */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 0x9e3779b9;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
export function cached(key, fn) {
  let g = geoCache.get(key);
  if (!g) { g = fn(); geoCache.set(key, g); }
  return g;
}
const k = (...a) => a.map((v) => (typeof v === 'number' ? +v.toFixed(4) : v)).join('|');

export const G = {
  box: (w, h, d) => cached(k('box', w, h, d), () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, s = 6, open = false) => cached(k('cyl', rt, rb, h, s, open), () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open)),
  sph: (r, ws = 8, hs = 6, ps = 0, pl = TAU, ts = 0, tl = PI) =>
    cached(k('sph', r, ws, hs, ps, pl, ts, tl), () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl)),
  cone: (r, h, s = 6, open = false) => cached(k('cone', r, h, s, open), () => new THREE.ConeGeometry(r, h, s, 1, open)),
  ico: (r, d = 0) => cached(k('ico', r, d), () => new THREE.IcosahedronGeometry(r, d)),
  oct: (r) => cached(k('oct', r), () => new THREE.OctahedronGeometry(r, 0)),
  tor: (R, r, rs = 4, ts = 8, arc = TAU) => cached(k('tor', R, r, rs, ts, arc), () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  cap: (r, len, cs = 2, rs = 6) => cached(k('cap', r, len, cs, rs), () => new THREE.CapsuleGeometry(r, len, cs, rs, 1)),
  plane: (w, h) => cached(k('plane', w, h), () => new THREE.PlaneGeometry(w, h)),
  circle: (r, s = 8) => cached(k('circle', r, s), () => new THREE.CircleGeometry(r, s)),
  /** tapered limb segment from origin along -Y (len), radius r0 at top, r1 at bottom */
  segY: (len, r0, r1 = r0, s = 5) => cached(k('segY', len, r0, r1, s), () => new THREE.CylinderGeometry(r0, r1, len, s, 1).translate(0, -len / 2, 0)),
  /** tapered segment from origin along +X */
  segX: (len, r0, r1 = r0, s = 5) => cached(k('segX', len, r0, r1, s), () => new THREE.CylinderGeometry(r1, r0, len, s, 1).rotateZ(-PI / 2).translate(len / 2, 0, 0)),
  /** tapered segment from origin along +Z */
  segZ: (len, r0, r1 = r0, s = 5) => cached(k('segZ', len, r0, r1, s), () => new THREE.CylinderGeometry(r1, r0, len, s, 1).rotateX(PI / 2).translate(0, 0, len / 2)),
  /** box whose top face is at the origin (hangs along -Y) */
  boxY: (w, h, d) => cached(k('boxY', w, h, d), () => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0)),
  /** box extending along +Z from the origin */
  boxZ: (w, h, d) => cached(k('boxZ', w, h, d), () => new THREE.BoxGeometry(w, h, d).translate(0, 0, d / 2)),
  lathe: (key, pts, s = 8) => cached('lathe|' + key, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), s)),
};

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** clone + transform a geometry (for merging). s may be number or [x,y,z] */
export function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _v.set(p[0], p[1], p[2]);
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  _m4.compose(_v, _q, _s);
  return g.clone().applyMatrix4(_m4);
}
function prep(g) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(name)) out.deleteAttribute(name);
  out.clearGroups();
  return out;
}
/** merged geometry, cached by key; fn returns an array of (transformed) geometries */
export function merged(key, fn) {
  return cached('merged|' + key, () => {
    const src = fn();
    const list = src.map(prep);
    src.forEach((g) => g.dispose());
    const m = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    m.computeBoundingSphere();
    return m;
  });
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
function matKey(prefix, color, o) {
  const { map, ...rest } = o;
  return prefix + '|' + color + '|' + JSON.stringify(rest) + '|' + (map ? map.uuid : '');
}
/** cached MeshLambertMaterial (flatShading on by default) */
export function lam(color, o = {}) {
  const key = matKey('L', color, o);
  let m = matCache.get(key);
  if (!m) {
    const { flat = true, ...rest } = o;
    m = new THREE.MeshLambertMaterial({ color, flatShading: flat, ...rest });
    matCache.set(key, m);
  }
  return m;
}
/** cached MeshBasicMaterial */
export function bas(color, o = {}) {
  const key = matKey('B', color, o);
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...o }); matCache.set(key, m); }
  return m;
}
/** per-instance (uncached) materials — caller must dispose */
export const lamI = (color, o = {}) => { const { flat = true, ...rest } = o; const m = new THREE.MeshLambertMaterial({ color, flatShading: flat, ...rest }); m.userData.instance = true; return m; };
export const basI = (color, o = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...o }); m.userData.instance = true; return m; };

export function cloneMat(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData = { ...m.userData, instance: true };
  return c;
}

// ---------------------------------------------------------------- textures
const texCache = new Map();
function setupTex(t, repeat) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** cached canvas texture; returns null in Node. draw(ctx, w, h, rnd) */
export function tex(key, w, h, draw, repeat = true) {
  if (!HAS_DOM) return null;
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h, rng(key.length * 977 + w * 13 + h));
    t = setupTex(new THREE.CanvasTexture(c), repeat);
    texCache.set(key, t);
  }
  return t;
}
/** uncached canvas texture for per-instance drawing → { tex, canvas, ctx } or null */
export function newTex(w, h, repeat = false) {
  if (!HAS_DOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, tex: setupTex(new THREE.CanvasTexture(canvas), repeat) };
}
/** fill with blotchy per-pixel noise around a base color */
export function noiseFill(ctx, w, h, rnd, base, amt = 0.15, px = 1) {
  const c = new THREE.Color(base);
  for (let y = 0; y < h; y += px) for (let x = 0; x < w; x += px) {
    const n = 1 + (rnd() - 0.5) * 2 * amt;
    ctx.fillStyle = `rgb(${clamp(c.r * 255 * n, 0, 255) | 0},${clamp(c.g * 255 * n, 0, 255) | 0},${clamp(c.b * 255 * n, 0, 255) | 0})`;
    ctx.fillRect(x, y, px, px);
  }
}
export function noiseTex(key, base, amt = 0.15, size = 32, px = 1) {
  return tex('noise|' + key + base + amt + size, size, size, (ctx, w, h, r) => noiseFill(ctx, w, h, r, base, amt, px));
}

// ---------------------------------------------------------------- scene helpers
export function mk(parent, geo, mat, p, r, s) {
  const m = new THREE.Mesh(geo, mat);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s != null) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  if (parent) parent.add(m);
  return m;
}
export function pv(parent, p, r, name) {
  const g = new THREE.Group();
  if (p) g.position.set(p[0], p[1], p[2]);
  if (r) g.rotation.set(r[0], r[1], r[2]);
  if (name) g.name = name;
  if (parent) parent.add(g);
  return g;
}

const FLASH = new THREE.Color(1, 0.08, 0.05);
/**
 * Per-instance tinting for hit flash / elite aura. Lambert materials under root are
 * lazily replaced by per-instance clones the first time a tint is needed.
 */
export class Tinter {
  constructor(root) {
    this.root = root;
    this.map = new Map();
    this.mats = [];
    this.flash = 0;
    this.base = new THREE.Color(0, 0, 0);
    this.active = false;
  }
  scan() {
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const single = !Array.isArray(o.material);
      const arr = single ? [o.material] : o.material;
      const out = arr.map((m) => {
        if (!m || !m.isMeshLambertMaterial || m.userData.noTint) return m;
        let c = this.map.get(m);
        if (!c) {
          if (m.userData.instance) c = m;
          else { c = cloneMat(m); c.userData.ownedByTinter = true; }
          c.userData.baseEmissive = c.emissive.clone();
          this.map.set(m, c);
          if (c !== m) this.map.set(c, c);
          if (!this.mats.includes(c)) this.mats.push(c);
        }
        return c;
      });
      o.material = single ? out[0] : out;
    });
  }
  ensure() { if (!this.active) { this.active = true; this.scan(); } }
  /** call after adding new meshes to an already-tinted hierarchy */
  refresh() { if (this.active) { this.scan(); this.apply(); } }
  apply() {
    for (const m of this.mats) {
      m.emissive.copy(m.userData.baseEmissive).add(this.base).lerp(FLASH, this.flash);
    }
  }
  setFlash(v) {
    v = clamp(v || 0, 0, 1);
    if (v === this.flash) return;
    if (v > 0) this.ensure();
    this.flash = v;
    if (this.active) this.apply();
  }
  setBase(color) {
    this.ensure();
    this.base.set(color);
    this.apply();
  }
  dispose() {
    for (const m of this.mats) if (m.userData.ownedByTinter) m.dispose();
    this.mats.length = 0;
    this.map.clear();
  }
}

export function countTris(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}
