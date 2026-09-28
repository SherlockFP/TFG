// TFG - procedural low-poly PSX item models (scrap, valuables, fish, drops, tools).
//
// API
//   ITEM_MODEL_IDS              every supported id
//   createItemModel(id)         -> THREE.Group (unknown id -> small '?' box)
// Extra export (shared with props.js): ModelKit - geometry kit (merge-by-material builder + helpers).
//
// Conventions: meters, +Y up.
//   TOOLS  (kind 'tool'): origin = grip point, forward/pointing axis = -Z.
//          userData.tip (Object3D at blade/barrel end or lens), lights: userData.lightAnchor (faces -Z)
//          + userData.light hint { type:'spot'|'point', color, intensity, distance, angle? }.
//   SCRAP / VALUABLES / FISH / DROPS: origin at bounding-box centre, natural upright orientation.
//          Glowing ones also get userData.lightAnchor + userData.light.
//   Every root: userData.size = [w,h,d], userData.itemId, userData.kind.
// Materials: only cached MeshLambertMaterial / MeshBasicMaterial from render/textures.js.
// Static parts sharing a material are merged -> typically 2-6 draw calls per item.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const PI = Math.PI, HP = PI / 2, TAU = PI * 2;

// =============================================================================== geometry kit
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
const _v = new THREE.Vector3(), _sv = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

/** Transform geometry in place: scale, then rotate (Euler XYZ array or Quaternion), then translate. */
function xf(g, p, r, s) {
  if (r && r.isQuaternion) _q.copy(r); else _q.setFromEuler(_eu.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
  _v.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
  if (s == null) _sv.set(1, 1, 1); else if (typeof s === 'number') _sv.setScalar(s); else _sv.set(s[0], s[1], s[2]);
  _m4.compose(_v, _q, _sv);
  g.applyMatrix4(_m4);
  return g;
}

/** Box-projected world-scale UVs (1 texture repeat per `sc` meters). Call after transforming. */
function boxUV(g, sc = 1) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  let uv = g.attributes.uv;
  if (!uv) { uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2); g.setAttribute('uv', uv); }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = ny > 0 ? -z : z; }
    else if (ax >= az) { u = nx > 0 ? -z : z; v = y; }
    else { u = nz > 0 ? x : -x; v = y; }
    uv.setXY(i, u / sc, v / sc);
  }
  uv.needsUpdate = true;
  return g;
}
function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}
function swapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return g;
}
/** planar UV from local XY (used for rotated discs / shapes) */
function planarUV(g, r) {
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + 0.5, pos.getY(i) / (2 * r) + 0.5);
  return g;
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  cone: (r, h, seg = 8, open = false) => new THREE.ConeGeometry(r, h, seg, 1, open),
  sph: (r, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs),
  hemi: (r, ws = 8, hs = 3) => new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, HP),
  lathe: (pts, seg = 8) => new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), seg),
  tor: (R, r, rs = 4, ts = 10, arc = TAU) => new THREE.TorusGeometry(R, r, rs, ts, arc),
  plane: (w, h) => new THREE.PlaneGeometry(w, h),
  circ: (r, seg = 8) => new THREE.CircleGeometry(r, seg),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  /** quad from 4 corners (counter-clockwise when seen from the front) */
  quad(a, b, c, d) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  },
  tri(a, b, c) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    g.computeVertexNormals();
    return g;
  },
};

function prepGeo(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
function mergeList(list) {
  const allIndexed = list.every((g) => g.index);
  const prepared = list.map((g) => prepGeo(allIndexed || !g.index ? g : g.toNonIndexed()));
  if (prepared.length === 1) return prepared[0];
  const m = mergeGeometries(prepared, false);
  if (!m) throw new Error('ModelKit: mergeGeometries failed');
  return m;
}

/** Collects transformed geometries per material and merges them into one mesh per material. */
class Kit {
  constructor() { this.bins = new Map(); }
  push(mat, g) {
    let b = this.bins.get(mat);
    if (!b) { b = []; this.bins.set(mat, b); }
    b.push(g);
    return g;
  }
  /** add(material, geometry, position?, rotation?, scale?, boxUVScale?) */
  add(mat, g, p, r, s, uv) {
    xf(g, p, r, s);
    if (uv) boxUV(g, uv);
    return this.push(mat, g);
  }
  /** tapered cylinder between two points (r0 at a, r1 at b) */
  limb(mat, a, b, r0, r1 = r0, seg = 6, uv) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length() || 1e-4;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, dir);
    return this.add(mat, new THREE.CylinderGeometry(r1, r0, len, seg, 1, false), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q, null, uv);
  }
  /** box beam between two points (w x d cross-section) */
  beam(mat, a, b, w, d = w, uv) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length() || 1e-4;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, dir);
    return this.add(mat, new THREE.BoxGeometry(w, len, d), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], q, null, uv);
  }
  /** merge a whole item model (all its meshes) into this kit with an extra transform */
  item(id, p, r, s) {
    const src = createItemModel(id);
    src.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    if (r && r.isQuaternion) _q.copy(r); else _q.setFromEuler(_eu.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
    m.compose(new THREE.Vector3(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0), _q,
      s == null ? new THREE.Vector3(1, 1, 1) : typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]));
    src.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.applyMatrix4(m);
      this.push(o.material, g);
    });
    return this;
  }
  /** build merged meshes into parent */
  into(parent) {
    for (const [mat, list] of this.bins) {
      const mesh = new THREE.Mesh(mergeList(list), mat);
      mesh.name = mat.name || 'part';
      mesh.matrixAutoUpdate = true;
      parent.add(mesh);
    }
    this.bins.clear();
    return parent;
  }
}

function anchor(parent, name, p = [0, 0, 0], r) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(p[0], p[1], p[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  parent.add(o);
  return o;
}

export const ModelKit = { Kit, G, xf, boxUV, scaleUV, swapUV, planarUV, anchor, PI, HP, TAU };

// ==================================================================================== helpers
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const { box, cyl, cone, sph, hemi, lathe, tor, plane, circ, oct } = G;

const SCRAP = { kind: 'scrap', center: true };
const VALUABLE = { kind: 'valuable', center: true };
const FISH = { kind: 'fish', center: true };
const DROP = { kind: 'drop', center: true };
const TOOL = { kind: 'tool', center: false };

function setTip(root, p, r) { const t = anchor(root, 'tip', p, r); root.userData.tip = t; return t; }
function setLight(root, p, light, r) {
  const a = anchor(root, 'lightAnchor', p, r);
  root.userData.lightAnchor = a;
  root.userData.light = light;
  return a;
}

/** Generic low-poly fish, head toward +X, dorsal +Y. */
function fish(k, o) {
  const len = o.L, H = o.H, W = o.W;
  const skinOpts = o.emissive ? { emissive: o.emissive } : undefined;
  const skin = L('fish_skin', o.tint, skinOpts);
  const fin = L('fish_skin', o.finTint ?? o.tint, { ...(skinOpts || {}), double: true });
  const bodyL = len * 0.78;
  k.add(skin, sph(1, 8, 6), [len * 0.1, 0, 0], null, [bodyL / 2, H / 2, W / 2]);
  k.add(fin, cone(H * 0.45, len * 0.26, 4), [-len * 0.36, 0, 0], [0, 0, -HP], [1, 1, 0.12]);
  if (o.spiky) {
    k.add(fin, cone(len * 0.09, H * 0.42, 4), [len * 0.16, H * 0.52, 0], [0, 0, 0.25], [1, 1, 0.1]);
    k.add(fin, cone(len * 0.1, H * 0.3, 4), [-len * 0.08, H * 0.46, 0], [0, 0, 0.35], [1, 1, 0.1]);
  } else {
    k.add(fin, cone(len * 0.13, H * 0.34, 4), [len * 0.03, H * 0.5, 0], [0, 0, 0.35], [1, 1, 0.1]);
  }
  for (const sz of [-1, 1]) k.add(fin, cone(H * 0.12, len * 0.12, 4), [len * 0.22, -H * 0.18, sz * W * 0.42], [-sz * 0.5, 0, 2.3], [1, 1, 0.2]);
  const eye = o.eyeMat || L(null, 0x0e0e0e);
  for (const sz of [-1, 1]) k.add(eye, box(H * 0.13, H * 0.13, W * 0.1), [len * 0.36, H * 0.08, sz * W * 0.34]);
  if (o.jaw) k.add(L(null, 0x2a1a1a), box(len * 0.08, H * 0.06, W * 0.5), [len * 0.47, -H * 0.12, 0]);
}

function gearGeo(R, r0, teeth, hole, depth) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rr = i % 4 < 2 ? R : r0;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, TAU, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ==================================================================================== ITEMS
const ITEMS = Object.create(null);

// ------------------------------------------------------------------------------------ scrap
ITEMS.bolt = (k) => {
  const m = L('metal_rust', 0xc8c8c8), t = L('metal', 0x9a9a9a);
  k.add(m, cyl(0.06, 0.06, 0.05, 6), [0, 0.025, 0]);
  k.add(m, cyl(0.028, 0.028, 0.3, 8), [0, 0.2, 0]);
  for (let i = 0; i < 4; i++) k.add(t, cyl(0.031, 0.031, 0.012, 8, true), [0, 0.27 + i * 0.022, 0]);
  k.add(m, cyl(0.05, 0.05, 0.035, 6), [0, 0.16, 0], [0, 0.3, 0]);
  return SCRAP;
};
ITEMS.axle = (k) => {
  const m = L('metal_rust', 0xb0aca8), d = L('metal_dark');
  k.add(m, cyl(0.035, 0.035, 1.0, 8), [0, 0, 0], [0, 0, HP]);
  for (const sx of [-1, 1]) {
    k.add(d, cyl(0.16, 0.16, 0.07, 10), [sx * 0.52, 0, 0], [0, 0, HP]);
    k.add(m, cyl(0.07, 0.09, 0.05, 8), [sx * 0.58, 0, 0], [0, 0, sx * HP]);
  }
  k.add(d, sph(0.1, 8, 6), [0, 0, 0], null, [1.3, 1, 1]);
  return SCRAP;
};
ITEMS.bell = (k) => {
  const brass = L('gold', 0xc8a060);
  k.add(L('gold', 0xc8a060, { double: true }), lathe([[0.13, 0], [0.12, 0.02], [0.095, 0.06], [0.075, 0.14], [0.07, 0.2], [0.05, 0.24], [0, 0.25]], 10));
  k.add(L('wood_dark'), cyl(0.018, 0.022, 0.1, 6), [0, 0.3, 0]);
  k.add(L('wood_dark'), sph(0.03, 6, 4), [0, 0.36, 0]);
  k.add(brass, sph(0.025, 6, 4), [0, 0.03, 0]);
  k.add(brass, cyl(0.004, 0.004, 0.2, 4), [0, 0.13, 0]);
  return SCRAP;
};
ITEMS.register = (k) => {
  const body = L('paint', 0x6a5a48), brass = L('gold', 0xb89050), dark = L('metal_dark');
  k.add(body, box(0.36, 0.14, 0.34), [0, 0.07, 0]);
  k.add(brass, box(0.34, 0.08, 0.02), [0, 0.06, 0.175]);
  k.add(dark, box(0.08, 0.012, 0.012), [0, 0.06, 0.19]);
  k.add(L('keypad'), box(0.3, 0.04, 0.16), [0, 0.17, 0.07], [0.45, 0, 0]);
  k.add(body, box(0.3, 0.1, 0.14), [0, 0.19, -0.09]);
  k.add(body, box(0.16, 0.1, 0.06), [0, 0.29, -0.1]);
  k.add(B(null, 0x3a8a4a), plane(0.13, 0.05), [0, 0.3, -0.069]);
  k.add(brass, box(0.18, 0.02, 0.07), [0, 0.35, -0.1]);
  k.add(brass, cyl(0.012, 0.012, 0.1, 6), [0.22, 0.12, 0], [0, 0, HP]);
  k.add(brass, box(0.02, 0.08, 0.02), [0.27, 0.09, 0]);
  return SCRAP;
};
ITEMS.goldbar = (k) => {
  k.add(L('gold', 0xffffff, { emissive: 0x3a2800, flat: true }), cyl(0.07, 0.085, 0.045, 4).rotateY(PI / 4), [0, 0, 0], null, [1.8, 1, 0.8]);
  return SCRAP;
};
ITEMS.duck = (k) => {
  const y = L('plastic', 0xf2c820), o = L('plastic', 0xf08020), e = L(null, 0x101010);
  k.add(y, sph(0.065, 8, 6), [0, 0.055, -0.01], null, [1, 0.8, 1.3]);
  k.add(y, sph(0.042, 8, 6), [0, 0.12, 0.045]);
  k.add(o, box(0.03, 0.012, 0.035), [0, 0.112, 0.092]);
  k.add(y, cone(0.02, 0.04, 4), [0, 0.085, -0.09], [-1.0, 0, 0]);
  for (const sx of [-1, 1]) k.add(e, box(0.008, 0.01, 0.008), [sx * 0.022, 0.13, 0.08]);
  return SCRAP;
};
ITEMS.robot = (k) => {
  const tin = L('paint', 0xa83828), sil = L('metal', 0xc8c8c8), dk = L('metal_dark'), glow = B(null, 0xffe040);
  k.add(tin, box(0.1, 0.11, 0.07), [0, 0.15, 0]);
  k.add(sil, box(0.08, 0.07, 0.07), [0, 0.245, 0]);
  k.add(glow, box(0.014, 0.014, 0.006), [-0.018, 0.25, 0.036]);
  k.add(glow, box(0.014, 0.014, 0.006), [0.018, 0.25, 0.036]);
  k.add(dk, box(0.04, 0.008, 0.006), [0, 0.225, 0.036]);
  k.add(sil, cyl(0.003, 0.003, 0.04, 4), [0, 0.3, 0]);
  k.add(B(null, 0xff3030), sph(0.008, 4, 3), [0, 0.322, 0]);
  for (const sx of [-1, 1]) {
    k.add(sil, box(0.025, 0.08, 0.03), [sx * 0.065, 0.16, 0], [0, 0, sx * 0.15]);
    k.add(dk, box(0.032, 0.095, 0.04), [sx * 0.025, 0.047, 0]);
    k.add(dk, box(0.036, 0.015, 0.055), [sx * 0.025, 0.007, 0.008]);
  }
  k.add(L('gold', 0xc0a060), box(0.006, 0.03, 0.03), [0, 0.15, -0.045]);
  k.add(L('paint', 0xd8c040), box(0.05, 0.03, 0.006), [0, 0.16, 0.036]);
  return SCRAP;
};
ITEMS.lamp = (k) => {
  const brass = L('gold', 0xb89458);
  k.add(brass, lathe([[0.09, 0], [0.09, 0.015], [0.05, 0.03], [0.025, 0.06], [0.018, 0.08]], 8));
  k.add(brass, cyl(0.012, 0.012, 0.26, 6), [0, 0.2, 0]);
  k.add(brass, sph(0.03, 6, 4), [0, 0.17, 0]);
  k.add(L('fabric', 0xc8a070, { double: true }), cyl(0.07, 0.15, 0.17, 8, true), [0, 0.37, 0]);
  k.add(B(null, 0xfff0c0), sph(0.028, 6, 4), [0, 0.34, 0]);
  k.add(brass, sph(0.012, 4, 3), [0, 0.47, 0]);
  return SCRAP;
};
ITEMS.canned = (k) => {
  const m = L('metal', 0xd0d0d0);
  k.add(L('label_kefal'), cyl(0.042, 0.042, 0.11, 10, true));
  k.add(m, cyl(0.043, 0.043, 0.006, 10), [0, 0.056, 0]);
  k.add(m, cyl(0.043, 0.043, 0.006, 10), [0, -0.056, 0]);
  k.add(L('metal_dark'), box(0.012, 0.002, 0.02), [0.01, 0.06, 0]);
  return SCRAP;
};
ITEMS.figurine = (k) => {
  const gold = L('gold', 0xffffff, { emissive: 0x302000 });
  const fin = L('gold', 0xffffff, { emissive: 0x302000, double: true });
  k.add(L('wood_dark'), box(0.12, 0.035, 0.07), [0, 0.0175, 0]);
  k.add(gold, box(0.1, 0.006, 0.05), [0, 0.038, 0]);
  k.add(gold, cyl(0.006, 0.008, 0.045, 5), [0, 0.062, 0]);
  k.add(gold, sph(1, 8, 6), [0, 0.105, 0], [0, 0, 0.45], [0.055, 0.022, 0.016]);
  k.add(fin, cone(0.022, 0.035, 4), [-0.062, 0.078, 0], [0, 0, -HP + 0.45], [1, 1, 0.15]);
  k.add(fin, cone(0.012, 0.02, 4), [-0.004, 0.13, 0], [0, 0, 0.9], [1, 1, 0.15]);
  k.add(L(null, 0x1a1208), box(0.006, 0.006, 0.034), [0.036, 0.125, 0]);
  return SCRAP;
};
ITEMS.mug = (k) => {
  const c = L('plastic', 0xd8d2c4, { double: true });
  k.add(c, cyl(0.042, 0.038, 0.095, 10, true));
  k.add(c, circ(0.038, 10), [0, -0.047, 0], [HP, 0, 0]);
  k.add(L(null, 0x3a2414), circ(0.04, 10), [0, 0.03, 0], [-HP, 0, 0]);
  k.add(L('plastic', 0xa82424), tor(0.026, 0.007, 4, 6, PI), [0.042, 0, 0], [0, 0, -HP]);
  return SCRAP;
};
ITEMS.teeth = (k) => {
  const gum = L('plastic', 0xc84858), wt = L('plastic', 0xf0ece0), ft = L('plastic', 0xe08020);
  k.add(gum, box(0.07, 0.018, 0.05), [0, 0.021, 0]);
  k.add(gum, box(0.07, 0.018, 0.05), [0, 0.047, -0.0046], [-0.35, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const x = -0.024 + i * 0.016;
    k.add(wt, box(0.012, 0.012, 0.008), [x, 0.035, 0.019]);
    k.add(wt, box(0.012, 0.012, 0.008), [x, 0.045, 0.017], [-0.35, 0, 0]);
  }
  for (const sx of [-1, 1]) k.add(ft, box(0.025, 0.012, 0.04), [sx * 0.02, 0.006, 0.006]);
  k.add(L('gold', 0xc0a060), cyl(0.004, 0.004, 0.025, 4), [0.047, 0.025, -0.01], [0, 0, HP]);
  k.add(L('gold', 0xc0a060), box(0.004, 0.022, 0.012), [0.06, 0.025, -0.01]);
  return SCRAP;
};
ITEMS.airhorn = (k) => {
  const bk = L('plastic', 0x202020);
  k.add(L('paint', 0xc02820), cyl(0.032, 0.032, 0.13, 8), [0, 0.065, 0]);
  k.add(bk, cyl(0.022, 0.03, 0.03, 8), [0, 0.145, 0]);
  k.add(L('plastic', 0xd83020, { double: true }), cyl(0.045, 0.012, 0.12, 8, true), [0, 0.172, 0.05], [HP, 0, 0]);
  k.add(bk, box(0.02, 0.014, 0.03), [0, 0.168, -0.02]);
  return SCRAP;
};
ITEMS.clownhorn = (k) => {
  const br = L('gold', 0xc8a050, { double: true });
  k.add(L('rubber', 0xd02020), sph(0.045, 8, 6), [0, 0, -0.1], null, [1, 1, 1.2]);
  k.add(br, cyl(0.012, 0.012, 0.08, 6, true), [0, 0, -0.02], [HP, 0, 0]);
  k.add(br, cyl(0.055, 0.012, 0.1, 8, true), [0, 0, 0.07], [HP, 0, 0]);
  return SCRAP;
};
ITEMS.painting = (k) => {
  const fr = L('gold', 0x8a6a38);
  const W = 0.56, H = 0.76, t = 0.06, d = 0.05;
  k.add(fr, box(W + 2 * t, t, d), [0, H / 2 + t / 2, 0]);
  k.add(fr, box(W + 2 * t, t, d), [0, -H / 2 - t / 2, 0]);
  k.add(fr, box(t, H, d), [-W / 2 - t / 2, 0, 0]);
  k.add(fr, box(t, H, d), [W / 2 + t / 2, 0, 0]);
  k.add(L('wood_dark'), box(W, H, 0.01), [0, 0, -0.015]);
  k.add(L('portrait'), plane(W, H), [0, 0, -0.008]);
  return SCRAP;
};
ITEMS.pickles = (k) => {
  k.add(L('pickle_jar'), cyl(0.055, 0.055, 0.15, 10));
  k.add(L('paint', 0xc8a030), cyl(0.05, 0.05, 0.025, 10), [0, 0.087, 0]);
  return SCRAP;
};
ITEMS.bottles = (k) => {
  const w = L('wood_planks', 0xc0a080);
  k.add(w, box(0.3, 0.012, 0.11), [0, 0.006, 0]);
  k.add(w, box(0.3, 0.07, 0.01), [0, 0.035, 0.05]);
  k.add(w, box(0.3, 0.07, 0.01), [0, 0.035, -0.05]);
  k.add(w, box(0.01, 0.1, 0.11), [-0.145, 0.05, 0]);
  k.add(w, box(0.01, 0.1, 0.11), [0.145, 0.05, 0]);
  const prof = [[0, 0], [0.032, 0], [0.032, 0.15], [0.014, 0.19], [0.012, 0.25], [0, 0.25]];
  const cols = [0x2a6a3a, 0x6a4020, 0x2a6a3a];
  [-0.09, 0, 0.09].forEach((x, i) => k.add(L('glass', cols[i]), lathe(prof, 6), [x, 0.012, 0]));
  return SCRAP;
};
ITEMS.trophy = (k) => {
  const g = L('gold', 0xffffff, { emissive: 0x2a1c00, double: true });
  k.add(L('wood_dark'), box(0.12, 0.05, 0.12), [0, 0.025, 0]);
  k.add(g, lathe([[0.04, 0.05], [0.035, 0.06], [0.012, 0.08], [0.012, 0.14], [0.025, 0.155], [0.06, 0.2], [0.072, 0.28], [0.066, 0.28], [0.054, 0.21], [0, 0.18]], 8));
  k.add(g, tor(0.035, 0.007, 3, 6, PI), [0.07, 0.235, 0], [0, 0, -HP]);
  k.add(g, tor(0.035, 0.007, 3, 6, PI), [-0.07, 0.235, 0], [0, 0, HP]);
  k.add(L('gold', 0xd0c8b0), box(0.06, 0.02, 0.004), [0, 0.025, 0.061]);
  return SCRAP;
};
ITEMS.perfume = (k) => {
  const gold = L('gold', 0xd0b060);
  k.add(L('glass', 0xe070a0, { flat: true }), cyl(0.035, 0.042, 0.075, 6), [0, 0.0375, 0]);
  k.add(gold, cyl(0.012, 0.012, 0.015, 6), [0, 0.082, 0]);
  k.add(gold, sph(0.016, 6, 4), [0, 0.1, 0]);
  k.add(L('plastic', 0x303030), cyl(0.003, 0.003, 0.06, 4), [0.035, 0.09, 0], [0, 0, HP]);
  k.add(L('fabric', 0xc04070), sph(0.018, 6, 4), [0.07, 0.09, 0], null, [1, 1.3, 1]);
  return SCRAP;
};
ITEMS.flask = (k, root) => {
  k.add(L('glass', 0xffffff, { opacity: 0.4, double: true }), lathe([[0, 0], [0.075, 0], [0.078, 0.01], [0.022, 0.13], [0.022, 0.18], [0.028, 0.19]], 10));
  k.add(B(null, 0x70ff60), lathe([[0, 0.004], [0.07, 0.004], [0.042, 0.065], [0, 0.065]], 10));
  k.add(L('wood_dark', 0xc08a50), cyl(0.02, 0.018, 0.03, 6), [0, 0.195, 0]);
  setLight(root, [0, 0.04, 0], { type: 'point', color: 0x70ff60, intensity: 0.8, distance: 3.5 });
  return SCRAP;
};
ITEMS.cog = (k) => {
  k.add(L('metal_rust', 0xb8b0a8, { flat: true }), gearGeo(0.22, 0.18, 12, 0.05, 0.05), [0, 0, 0], [-HP, 0, 0], null, 0.4);
  return SCRAP;
};
ITEMS.phone = (k) => {
  const b = L('plastic', 0x8a1c1c, { flat: true });
  k.add(b, cyl(0.075, 0.11, 0.09, 4).rotateY(PI / 4), [0, 0.045, 0], null, [1, 1, 1.05]);
  k.add(L('plastic', 0xe8e0d0), cyl(0.038, 0.038, 0.01, 10), [0, 0.05, 0.07], [1.31, 0, 0]);
  k.add(L(null, 0x1a1a1a), cyl(0.012, 0.012, 0.012, 6), [0, 0.051, 0.072], [1.31, 0, 0]);
  const hs = L('plastic', 0x8a1c1c);
  k.add(hs, cyl(0.016, 0.016, 0.2, 6), [0, 0.118, 0], [0, 0, HP]);
  k.add(hs, box(0.05, 0.035, 0.06), [-0.1, 0.105, 0]);
  k.add(hs, box(0.05, 0.035, 0.06), [0.1, 0.105, 0]);
  return SCRAP;
};
ITEMS.pot = (k) => {
  k.add(L('metal_dark', 0x9a9a9a, { double: true }), lathe([[0, 0], [0.12, 0], [0.13, 0.012], [0.13, 0.15], [0.122, 0.15], [0.118, 0.015], [0, 0.015]], 10));
  for (const sx of [-1, 1]) k.add(L('rubber'), box(0.05, 0.018, 0.035), [sx * 0.15, 0.13, 0]);
  return SCRAP;
};
ITEMS.steering = (k) => {
  const sp = L('metal', 0xa0a0a0);
  k.add(L('rubber', 0x3a3a3a), tor(0.18, 0.018, 4, 12));
  k.add(sp, cyl(0.045, 0.05, 0.05, 8), [0, 0, 0], [HP, 0, 0]);
  for (const a of [-HP, PI / 6, (5 * PI) / 6]) k.add(sp, box(0.14, 0.03, 0.012), [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0], [0, 0, a]);
  k.add(L('paint', 0xa82424), circ(0.035, 8), [0, 0, 0.03]);
  return SCRAP;
};
ITEMS.tv = (k) => {
  const cab = L('wood_dark', 0x9a7050), pl = L('plastic', 0x3a3a38), mt = L('metal', 0x909090);
  k.add(cab, box(0.5, 0.4, 0.34), [0, 0.2, 0]);
  k.add(pl, box(0.34, 0.28, 0.16), [0, 0.19, -0.25]);
  k.add(pl, box(0.36, 0.3, 0.01), [-0.05, 0.2, 0.172]);
  k.add(L('screen_off'), plane(0.32, 0.25), [-0.05, 0.2, 0.178]);
  for (const y of [0.27, 0.19]) k.add(pl, cyl(0.018, 0.018, 0.02, 8), [0.19, y, 0.176], [HP, 0, 0]);
  k.add(L('vent', 0x707070), plane(0.06, 0.08), [0.19, 0.08, 0.171]);
  k.add(mt, sph(0.03, 6, 3), [0, 0.4, -0.05]);
  k.limb(mt, [0, 0.41, -0.05], [-0.16, 0.64, -0.08], 0.003, 0.003, 4);
  k.limb(mt, [0, 0.41, -0.05], [0.16, 0.64, -0.08], 0.003, 0.003, 4);
  return SCRAP;
};
ITEMS.magnify = (k) => {
  const rim = L('metal', 0x303030);
  k.add(rim, tor(0.05, 0.007, 4, 12), [0, 0, 0], [HP, 0, 0]);
  k.add(L('glass', 0xffffff, { opacity: 0.45, double: true }), circ(0.05, 12), [0, 0, 0], [-HP, 0, 0]);
  k.add(L('wood_dark'), cyl(0.012, 0.015, 0.11, 6), [0.115, 0, 0], [0, 0, HP]);
  k.add(rim, cyl(0.012, 0.012, 0.015, 6), [0.058, 0, 0], [0, 0, HP]);
  return SCRAP;
};
ITEMS.skull = (k) => {
  const bone = L('concrete', 0xfff0cc), dk = L(null, 0x0c0a08);
  k.add(bone, sph(0.075, 8, 6), [0, 0.105, -0.01], null, [0.88, 0.92, 1.1]);
  k.add(bone, box(0.085, 0.05, 0.06), [0, 0.06, 0.05]);
  k.add(bone, box(0.075, 0.022, 0.06), [0, 0.022, 0.045], [0.1, 0, 0]);
  for (const sx of [-1, 1]) k.add(dk, box(0.026, 0.024, 0.02), [sx * 0.024, 0.098, 0.068]);
  k.add(dk, box(0.012, 0.018, 0.01), [0, 0.07, 0.081]);
  k.add(L('plastic', 0xe8e0c8), box(0.06, 0.012, 0.006), [0, 0.042, 0.081]);
  return SCRAP;
};
ITEMS.ring = (k) => {
  const g = L('gold', 0xffffff, { emissive: 0x302000 });
  k.add(g, tor(0.011, 0.0025, 4, 10), [0, 0.011, 0]);
  k.add(g, cyl(0.004, 0.0025, 0.004, 6), [0, 0.0235, 0]);
  k.add(B(null, 0xd8f4ff), oct(0.0075), [0, 0.031, 0], null, [1, 1.3, 1]);
  return SCRAP;
};
ITEMS.reactor = (k, root) => {
  const md = L('metal_dark'), m = L('metal', 0xb0b0b0), band = B(null, 0xffe860);
  k.add(B(null, 0x7fffe0), cyl(0.085, 0.085, 0.3, 8), [0, 0, 0]);
  for (const y of [-0.06, 0.06]) k.add(band, cyl(0.089, 0.089, 0.02, 8, true), [0, y, 0]);
  k.add(md, cyl(0.13, 0.13, 0.06, 8), [0, 0.18, 0]);
  k.add(md, cyl(0.13, 0.13, 0.06, 8), [0, -0.18, 0]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; k.add(m, box(0.014, 0.3, 0.014), [Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11]); }
  for (const sx of [-1, 1]) {
    k.add(m, box(0.05, 0.02, 0.02), [sx * 0.15, 0.1, 0]);
    k.add(m, box(0.05, 0.02, 0.02), [sx * 0.15, -0.1, 0]);
    k.add(m, box(0.02, 0.22, 0.025), [sx * 0.17, 0, 0]);
  }
  k.add(m, cyl(0.03, 0.04, 0.05, 6), [0, 0.235, 0]);
  setLight(root, [0, 0, 0], { type: 'point', color: 0x80ffd8, intensity: 1.4, distance: 6 });
  return SCRAP;
};

// ------------------------------------------------------------------------ physics valuables
ITEMS.vase = (k) => {
  const p = L('porcelain', 0xffffff, { double: true });
  k.add(p, lathe([[0.07, 0], [0.1, 0.02], [0.16, 0.14], [0.175, 0.26], [0.15, 0.4], [0.08, 0.5], [0.065, 0.54], [0.085, 0.6]], 12));
  k.add(p, circ(0.07, 12), [0, 0, 0], [HP, 0, 0]);
  return VALUABLE;
};
ITEMS.statue = (k) => {
  const st = L('marble', 0xd8d4cc), br = L('gold', 0xb89058), fin = L('gold', 0xb89058, { double: true }), dk = L(null, 0x1a140c);
  k.add(st, box(0.46, 0.44, 0.46), [0, 0.28, 0], null, null, 0.6);
  k.add(st, box(0.54, 0.06, 0.54), [0, 0.53, 0], null, null, 0.6);
  k.add(st, box(0.54, 0.06, 0.54), [0, 0.03, 0], null, null, 0.6);
  // leaping mullet standing on its tail, flat sides facing +-Z so the front shows its profile
  const tilt = 0.3, ax = [-Math.sin(tilt), Math.cos(tilt)], c0 = [0.04, 0.93];
  const at = (t, off = 0) => [c0[0] + ax[0] * t + ax[1] * off, c0[1] + ax[1] * t - ax[0] * off];
  k.add(br, sph(1, 8, 8), [c0[0], c0[1], 0], [0, 0, tilt], [0.13, 0.33, 0.1]);
  const tb = at(-0.36);
  k.add(fin, cone(0.17, 0.16, 4), [tb[0], tb[1], 0], [0, 0, tilt], [1, 1, 0.16]);
  const df = at(0.02, 0.13);
  k.add(fin, cone(0.08, 0.17, 4), [df[0], df[1], 0], [0, 0, tilt - HP], [1, 1, 0.16]);
  for (const sz of [-1, 1]) { const pf = at(0.12, -0.06); k.add(fin, cone(0.035, 0.1, 4), [pf[0], pf[1], sz * 0.09], [sz * 0.5, 0, tilt + 2.2], [1, 1, 0.2]); }
  const e = at(0.2, -0.02);
  for (const sz of [-1, 1]) k.add(dk, box(0.035, 0.035, 0.03), [e[0], e[1], sz * 0.066]);
  const m = at(0.32);
  k.add(dk, box(0.06, 0.03, 0.06), [m[0], m[1], 0], [0, 0, tilt]);
  return VALUABLE;
};
ITEMS.amphora = (k) => {
  const t = L('amphora', 0xffffff, { double: true });
  k.add(t, lathe([[0, 0], [0.05, 0.01], [0.08, 0.04], [0.15, 0.16], [0.17, 0.28], [0.15, 0.42], [0.08, 0.52], [0.06, 0.6], [0.07, 0.64], [0.085, 0.66]], 10));
  for (const sx of [-1, 1]) k.add(L('amphora'), tor(0.07, 0.013, 3, 6, PI), [sx * 0.09, 0.53, 0], [0, 0, sx > 0 ? -HP : HP], [1, 1.3, 1]);
  return VALUABLE;
};
ITEMS.server = (k, root) => {
  const md = L('metal_dark'), m = L('metal', 0xa0a0a0);
  k.add(md, box(0.6, 1.4, 0.7), [0, 0.74, 0]);
  k.add(L('server_front'), plane(0.56, 1.34), [0, 0.74, 0.351]);
  for (const sx of [-1, 1]) k.add(m, box(0.02, 0.3, 0.03), [sx * 0.31, 0.9, 0.34]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(L('rubber'), box(0.06, 0.04, 0.06), [x * 0.24, 0.02, z * 0.28]);
  // blinking LED strip in its own sub group so the game can toggle it
  const leds = new THREE.Group();
  leds.name = 'leds';
  const lk = new Kit();
  for (let i = 0; i < 10; i++) {
    const y = 0.2 + i * 0.12;
    lk.add(B(null, i % 3 ? 0x50ff70 : 0xffb030), box(0.025, 0.012, 0.006), [-0.2 + (i % 2) * 0.03, y, 0.356]);
  }
  lk.into(leds);
  root.add(leds);
  root.userData.blink = leds;
  return VALUABLE;
};
ITEMS.aquarium = (k) => {
  const W = 0.8, H = 0.5, D = 0.4, fr = L('metal_dark', 0x505050);
  k.add(fr, box(W + 0.02, 0.04, D + 0.02), [0, 0.02, 0]);
  k.add(fr, box(W + 0.02, 0.03, D + 0.02), [0, H - 0.015, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(fr, box(0.02, H - 0.07, 0.02), [(x * W) / 2, H / 2 + 0.005, (z * D) / 2]);
  k.add(L('sand'), box(W - 0.02, 0.04, D - 0.02), [0, 0.06, 0], null, null, 0.5);
  k.add(L('water', 0x80c0d0, { opacity: 0.45 }), box(W - 0.02, 0.34, D - 0.02), [0, 0.25, 0]);
  k.add(L('glass', 0xffffff, { opacity: 0.2 }), box(W, H - 0.07, D), [0, H / 2 + 0.005, 0]);
  const f = L('plastic', 0xf07020);
  for (const [x, y, z, ry] of [[-0.15, 0.22, 0.05, 0.3], [0.12, 0.3, -0.06, 2.8]]) {
    k.add(f, sph(1, 6, 4), [x, y, z], [0, ry, 0], [0.04, 0.02, 0.012]);
    k.add(f, cone(0.018, 0.03, 3), [x - Math.cos(ry) * 0.05, y, z + Math.sin(ry) * 0.05], [0, ry, -HP], [1, 1, 0.3]);
  }
  const pl = L('leaves', 0x70b060);
  k.add(pl, plane(0.14, 0.18), [0.26, 0.17, -0.1]);
  k.add(pl, plane(0.14, 0.18), [0.26, 0.17, -0.1], [0, HP, 0]);
  return VALUABLE;
};

// ------------------------------------------------------------------------------------- fish
ITEMS.fish_kefal = (k) => { fish(k, { L: 0.45, H: 0.11, W: 0.08, tint: 0xb0b8b8 }); return FISH; };
ITEMS.fish_lufer = (k) => { fish(k, { L: 0.5, H: 0.12, W: 0.07, tint: 0x80a8b0, finTint: 0x7090a0, spiky: true, jaw: true }); return FISH; };
ITEMS.fish_levrek = (k) => { fish(k, { L: 0.45, H: 0.13, W: 0.07, tint: 0xd0d4d8, finTint: 0xa0a4a8, spiky: true }); return FISH; };
ITEMS.fish_golden = (k, root) => {
  fish(k, { L: 0.42, H: 0.11, W: 0.08, tint: 0xffc840, emissive: 0x5a3800, eyeMat: B(null, 0x301800) });
  setLight(root, [0, 0, 0], { type: 'point', color: 0xffc040, intensity: 0.7, distance: 3 });
  return FISH;
};
ITEMS.fish_boot = (k) => {
  const lt = L('fabric', 0x4a3424), sole = L('rubber', 0x2a2420);
  k.add(sole, box(0.1, 0.03, 0.28), [0, 0.015, 0.02]);
  k.add(lt, box(0.1, 0.08, 0.2), [0, 0.07, 0.04]);
  k.add(lt, sph(0.05, 6, 4), [0, 0.06, 0.14], null, [1, 0.9, 1.1]);
  k.add(lt, box(0.1, 0.2, 0.12), [0, 0.17, -0.06]);
  k.add(L('leaves', 0x6a8a3a), plane(0.12, 0.14), [0.052, 0.18, -0.05], [0, HP, 0.3]);
  k.add(L(null, 0x1a1410), box(0.08, 0.006, 0.1), [0, 0.27, -0.06]);
  return FISH;
};
ITEMS.fish_eel = (k, root) => {
  const bk = L('rubber', 0x141418);
  const pts = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([(t - 0.5) * 0.9, 0, Math.sin(t * TAU) * 0.06]); }
  for (let i = 0; i < 6; i++) {
    const r0 = 0.032 * (1 - i / 7) + 0.004, r1 = 0.032 * (1 - (i + 1) / 7) + 0.004;
    k.limb(bk, pts[i], pts[i + 1], r0, r1, 6);
  }
  k.add(bk, sph(0.036, 6, 4), [pts[0][0] - 0.02, 0, pts[0][2]], null, [1.5, 0.9, 1]);
  const eye = B(null, 0xe8ff50);
  for (const sz of [-1, 1]) k.add(eye, box(0.014, 0.01, 0.01), [pts[0][0] - 0.04, 0.012, sz * 0.03]);
  k.add(B(null, 0x600010), box(0.03, 0.006, 0.05), [pts[0][0] - 0.065, -0.01, 0]);
  setLight(root, [pts[0][0] - 0.04, 0.02, 0], { type: 'point', color: 0xd0ff40, intensity: 0.3, distance: 2 });
  return FISH;
};

// --------------------------------------------------------------------------- creature drops
ITEMS.drop_scuttler = (k) => {
  const sh = L('rock', 0xe8dcc8);
  k.add(sh, hemi(0.12, 8, 3), [0, 0, 0], null, [1, 0.45, 1.3]);
  k.add(sh, circ(0.12, 8), [0, 0, 0], [HP, 0, 0], [1, 1.3, 1]);
  const rd = L('rock', 0xb8a890);
  for (const z of [-0.07, 0, 0.07]) k.add(rd, box(0.2 * Math.sqrt(1 - (z / 0.156) ** 2), 0.012, 0.014), [0, 0.054 * Math.sqrt(1 - (z / 0.156) ** 2) - 0.002, z]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * 0.12, z = Math.sin(a) * 0.156;
    k.limb(rd, [x * 0.9, 0.005, z * 0.9], [x * 1.25, 0.01, z * 1.25], 0.012, 0.002, 4);
  }
  return DROP;
};
ITEMS.drop_spider = (k) => {
  const s = L('fabric', 0xe8e6dc), w = L('fabric', 0xc8c6bc);
  k.add(s, sph(0.1, 8, 6), [0, 0, 0], null, [0.8, 1.3, 0.8]);
  for (const y of [-0.05, 0.02, 0.07]) k.add(w, tor(0.08 * Math.sqrt(1 - (y / 0.13) ** 2) + 0.003, 0.007, 3, 8), [0, y, 0], [HP + y * 3, 0, 0]);
  k.add(w, box(0.003, 0.12, 0.003), [0, 0.19, 0]);
  return DROP;
};
ITEMS.drop_crawler = (k) => {
  const ch = L('rock', 0x5a4038), tip = L('plastic', 0xd8ccb0);
  const pts = [[0, 0, 0], [0.08, 0.06, 0], [0.13, 0.16, 0], [0.14, 0.27, 0], [0.11, 0.36, 0]];
  const rads = [0.05, 0.042, 0.032, 0.02, 0.003];
  for (let i = 0; i < 4; i++) k.limb(i < 3 ? ch : tip, pts[i], pts[i + 1], rads[i], rads[i + 1], 6);
  k.add(ch, sph(0.055, 6, 4), pts[0]);
  return DROP;
};
ITEMS.drop_hound = (k) => {
  const bone = L('plastic', 0xe8dcc0);
  k.add(L('fabric', 0x4a3424), tor(0.1, 0.004, 3, 12), [0, 0, 0], [HP, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const a = HP + (i - 2) * 0.35, cx = Math.cos(a), cz = Math.sin(a);
    k.limb(bone, [cx * 0.1, 0, cz * 0.1], [cx * 0.155, -0.01, cz * 0.155], 0.009, 0.001, 5);
  }
  return DROP;
};
ITEMS.drop_lurker = (k) => {
  const wood = L('bark', 0xe8d8b0, { double: true }), dk = B(null, 0x050505);
  k.add(wood, new THREE.SphereGeometry(0.14, 8, 6, 0, PI, 0.25, 2.6), [0, 0, 0], null, [1, 1.3, 0.55]);
  for (const sx of [-1, 1]) k.add(dk, box(0.045, 0.03, 0.03), [sx * 0.045, 0.03, 0.066]);
  k.add(dk, box(0.07, 0.012, 0.03), [0, -0.07, 0.058]);
  k.add(B(null, 0x8a1010), box(0.012, 0.09, 0.02), [0, 0.1, 0.06]);
  const lv = L('leaves', 0x7a9a4a);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    k.add(lv, plane(0.13, 0.13), [Math.cos(a) * 0.14, Math.sin(a) * 0.18, 0.0], [0, 0, a]);
  }
  return DROP;
};
ITEMS.drop_giant = (k) => {
  const bone = L('concrete', 0xfff4dc);
  k.add(bone, cyl(0.1, 0.11, 0.14, 6), [0, 0.28, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(bone, sph(0.045, 5, 3), [x * 0.05, 0.35, z * 0.045]);
  k.add(bone, cone(0.05, 0.21, 6), [-0.045, 0.105, 0], [PI, 0, 0.1]);
  k.add(bone, cone(0.05, 0.21, 6), [0.045, 0.105, 0], [PI, 0, -0.1]);
  return DROP;
};

// ------------------------------------------------------------------------------------ tools
ITEMS.flashlight = (k, root) => {
  const body = L('metal_dark', 0x606468), rb = L('rubber');
  k.add(body, cyl(0.02, 0.02, 0.16, 8), [0, 0, 0.02], [HP, 0, 0]);
  k.add(body, cyl(0.022, 0.034, 0.06, 8, true), [0, 0, -0.09], [HP, 0, 0]);
  k.add(rb, cyl(0.021, 0.021, 0.02, 8), [0, 0, 0.1], [HP, 0, 0]);
  k.add(rb, box(0.012, 0.008, 0.02), [0, 0.022, -0.02]);
  k.add(B(null, 0xfff2c8), circ(0.034, 8), [0, 0, -0.118], [0, PI, 0]);
  const a = setLight(root, [0, 0, -0.12], { type: 'spot', color: 0xfff0d0, intensity: 2, distance: 18, angle: 0.5 });
  root.userData.tip = a;
  return TOOL;
};
ITEMS.proflash = (k, root) => {
  const y = L('plastic', 0xe0b020), bk = L('rubber');
  k.add(y, cyl(0.026, 0.026, 0.2, 8), [0, 0, 0.03], [HP, 0, 0]);
  k.add(bk, cyl(0.03, 0.046, 0.08, 8, true), [0, 0, -0.11], [HP, 0, 0]);
  k.add(bk, cyl(0.028, 0.028, 0.02, 8), [0, 0, 0.135], [HP, 0, 0]);
  for (const z of [0.0, 0.04, 0.08]) k.add(bk, cyl(0.0275, 0.0275, 0.008, 8, true), [0, 0, z], [HP, 0, 0]);
  k.add(bk, box(0.014, 0.012, 0.026), [0, 0.03, -0.03]);
  k.add(B(null, 0xfff6d8), circ(0.046, 8), [0, 0, -0.148], [0, PI, 0]);
  const a = setLight(root, [0, 0, -0.15], { type: 'spot', color: 0xfff4e0, intensity: 3.5, distance: 28, angle: 0.4 });
  root.userData.tip = a;
  return TOOL;
};
ITEMS.walkie = (k, root) => {
  const bk = L('plastic', 0x2c2c2c);
  k.add(bk, box(0.06, 0.13, 0.035), [0, 0, 0]);
  k.add(bk, cyl(0.006, 0.008, 0.1, 5), [0.018, 0.115, 0]);
  k.add(bk, cyl(0.009, 0.009, 0.015, 6), [-0.015, 0.072, 0]);
  k.add(L('vent', 0x808080), plane(0.045, 0.05), [0, -0.025, 0.0178]);
  k.add(B(null, 0x50c070), plane(0.035, 0.018), [0, 0.035, 0.0178]);
  k.add(L('plastic', 0xc03020), box(0.006, 0.03, 0.015), [-0.032, 0.01, 0]);
  setTip(root, [0.018, 0.165, 0]);
  return TOOL;
};
ITEMS.shovel = (k, root) => {
  const wd = L('wood_planks', 0xc09060), mt = L('metal_rust', 0xa0a0a0, { flat: true });
  k.add(wd, box(0.1, 0.022, 0.022), [0, 0, 0]);
  k.beam(wd, [-0.05, 0, 0], [0, 0, -0.09], 0.018);
  k.beam(wd, [0.05, 0, 0], [0, 0, -0.09], 0.018);
  k.add(wd, cyl(0.016, 0.016, 0.8, 6), [0, 0, -0.49], [HP, 0, 0]);
  k.add(mt, cyl(0.022, 0.02, 0.1, 6), [0, 0, -0.9], [HP, 0, 0]);
  k.add(mt, cyl(0.11, 0.15, 0.26, 4).rotateY(PI / 4), [0, -0.01, -1.08], [-HP, 0, 0], [1, 1, 0.07]);
  setTip(root, [0, -0.01, -1.21]);
  return TOOL;
};
ITEMS.pipe = (k, root) => {
  const m = L('metal_rust', 0x8a8e90);
  k.add(m, cyl(0.02, 0.02, 0.62, 8), [0, 0, -0.23], [HP, 0, 0]);
  k.add(m, cyl(0.028, 0.028, 0.06, 8), [0, 0, -0.55], [HP, 0, 0]);
  k.add(m, cyl(0.02, 0.02, 0.07, 8), [0, 0.03, -0.555]);
  k.add(L('rubber'), cyl(0.023, 0.023, 0.14, 8, true), [0, 0, 0], [HP, 0, 0]);
  setTip(root, [0, 0, -0.58]);
  return TOOL;
};
ITEMS.stopsign = (k, root) => {
  const pole = L('metal', 0x9a9a9a);
  k.add(pole, cyl(0.02, 0.02, 1.4, 6), [0, 0, -0.5], [HP, 0, 0]);
  k.add(L('stop_sign'), planarUV(circ(0.3, 8).rotateZ(PI / 8), 0.3), [0.026, 0, -1.0], [0, HP, 0]);
  k.add(L('metal', 0x7a7a7a), circ(0.3, 8).rotateZ(PI / 8), [0.024, 0, -1.0], [0, -HP, 0]);
  k.add(pole, box(0.012, 0.06, 0.03), [0.017, 0.2, -1.0]);
  k.add(pole, box(0.012, 0.06, 0.03), [0.017, -0.2, -1.0]);
  setTip(root, [0, 0, -1.3]);
  return TOOL;
};
ITEMS.machete = (k, root) => {
  const bl = L('metal', 0xc0c0c0, { flat: true });
  k.add(L('rubber', 0x3a2a20), box(0.026, 0.034, 0.13), [0, 0, 0]);
  k.add(L('metal_dark'), box(0.03, 0.05, 0.012), [0, 0.005, -0.071]);
  k.add(bl, box(0.004, 0.05, 0.4), [0, 0.008, -0.275]);
  k.add(L('metal', 0xc0c0c0, { flat: true, double: true }), G.tri([0, 0.033, -0.475], [0, -0.017, -0.475], [0, 0.022, -0.56]));
  setTip(root, [0, 0.02, -0.56]);
  return TOOL;
};
ITEMS.sledge = (k, root) => {
  k.add(L('wood_planks', 0xc09060), cyl(0.017, 0.02, 0.9, 6), [0, 0, -0.35], [HP, 0, 0]);
  k.add(L('rubber'), cyl(0.022, 0.022, 0.16, 6, true), [0, 0, 0], [HP, 0, 0]);
  k.add(L('metal_dark', 0x909090, { flat: true }), box(0.09, 0.26, 0.09), [0, 0, -0.8]);
  setTip(root, [0, 0, -0.8]);
  return TOOL;
};
ITEMS.taser = (k, root) => {
  const y = L('plastic', 0xd8c030), bk = L('plastic', 0x242424), zap = B(null, 0x60d8ff), mt = L('metal');
  k.add(bk, box(0.032, 0.1, 0.04), [0, -0.04, 0.01], [-0.3, 0, 0]);
  k.add(y, box(0.05, 0.06, 0.18), [0, 0.04, -0.05]);
  k.add(bk, cyl(0.016, 0.016, 0.1, 8), [0, 0.04, -0.19], [HP, 0, 0]);
  for (const z of [-0.16, -0.19, -0.22]) k.add(zap, tor(0.02, 0.004, 3, 8), [0, 0.04, z]);
  for (const sx of [-1, 1]) k.add(mt, box(0.004, 0.004, 0.03), [sx * 0.008, 0.04, -0.255]);
  k.add(zap, box(0.03, 0.012, 0.06), [0, 0.075, -0.04]);
  k.add(bk, box(0.008, 0.02, 0.01), [0, -0.005, -0.02]);
  setTip(root, [0, 0.04, -0.27]);
  return TOOL;
};
ITEMS.harpoon = (k, root) => {
  const wd = L('wood_dark', 0xa07048), mt = L('metal', 0x8a9098), br = L('gold', 0xc8a050), fin = L('gold', 0xc8a050, { double: true });
  k.add(wd, box(0.03, 0.09, 0.04), [0, -0.04, 0.01], [-0.3, 0, 0]);
  k.add(wd, box(0.04, 0.045, 0.34), [0, 0.03, -0.02]);
  k.add(mt, cyl(0.018, 0.018, 0.4, 8), [0, 0.035, -0.39], [HP, 0, 0]);
  k.add(mt, cyl(0.005, 0.005, 0.2, 4), [0, 0.06, -0.62], [HP, 0, 0]);
  k.add(br, sph(1, 6, 4), [0, 0.06, -0.77], [HP, 0, 0], [0.012, 0.05, 0.022]);
  k.add(fin, cone(0.022, 0.035, 4), [0, 0.06, -0.71], [-HP, 0, 0], [0.25, 1, 1]);
  k.add(br, cone(0.01, 0.03, 4), [0, 0.06, -0.835], [-HP, 0, 0]);
  k.add(L('rubber', 0x802020), box(0.05, 0.006, 0.006), [0, 0.056, -0.56]);
  setTip(root, [0, 0.06, -0.85]);
  return TOOL;
};
ITEMS.shotgun = (k, root) => {
  const wd = L('wood_dark', 0xa06a40), mt = L('metal_dark', 0x707070);
  k.add(wd, box(0.035, 0.1, 0.045), [0, -0.035, 0.02], [-0.35, 0, 0]);
  k.add(wd, box(0.04, 0.08, 0.3), [0, -0.005, 0.2], [0.12, 0, 0]);
  k.add(L('rubber'), box(0.042, 0.09, 0.02), [0, -0.025, 0.36], [0.12, 0, 0]);
  k.add(mt, box(0.045, 0.055, 0.12), [0, 0.02, -0.04]);
  for (const sx of [-1, 1]) k.add(mt, cyl(0.0135, 0.0135, 0.62, 8), [sx * 0.0135, 0.04, -0.41], [HP, 0, 0]);
  k.add(wd, box(0.04, 0.03, 0.22), [0, 0.015, -0.24]);
  k.add(mt, box(0.004, 0.004, 0.6), [0, 0.056, -0.41]);
  k.add(mt, box(0.004, 0.02, 0.04), [0, -0.01, -0.01]);
  setTip(root, [0, 0.04, -0.72]);
  return TOOL;
};
ITEMS.shells = (k, root) => {
  k.add(L('shells_box'), box(0.08, 0.05, 0.06));
  for (let i = 0; i < 3; i++) {
    k.add(L('plastic', 0xb82a20), cyl(0.009, 0.009, 0.03, 6), [-0.02 + i * 0.02, 0.035, 0.01]);
    k.add(L('gold', 0xc8a050), cyl(0.0095, 0.0095, 0.008, 6), [-0.02 + i * 0.02, 0.054, 0.01]);
  }
  setTip(root, [0, 0, -0.03]);
  return TOOL;
};
ITEMS.stungrenade = (k, root) => {
  const mt = L('metal', 0x909090);
  k.add(L('paint', 0x4a5a44), cyl(0.03, 0.03, 0.09, 8));
  k.add(L('hazard_stripes'), cyl(0.032, 0.032, 0.015, 8, true), [0, -0.025, 0]);
  k.add(mt, cyl(0.012, 0.016, 0.025, 6), [0, 0.057, 0]);
  k.add(mt, box(0.012, 0.075, 0.006), [0, 0.03, 0.034], [-0.15, 0, 0]);
  k.add(L('metal', 0xc0c0c0), tor(0.012, 0.0022, 3, 8), [0.022, 0.066, 0], [0, HP, 0]);
  setTip(root, [0, 0.07, 0]);
  return TOOL;
};
ITEMS.medkit = (k, root) => {
  const h = L('plastic', 0x303030);
  k.add(L('medkit'), box(0.28, 0.18, 0.1), [0, -0.12, 0]);
  k.add(h, box(0.1, 0.015, 0.022), [0, 0, 0]);
  k.add(h, box(0.015, 0.03, 0.022), [-0.05, -0.02, 0]);
  k.add(h, box(0.015, 0.03, 0.022), [0.05, -0.02, 0]);
  for (const sx of [-1, 1]) k.add(L('metal'), box(0.03, 0.02, 0.006), [sx * 0.09, -0.04, 0.052]);
  setTip(root, [0, -0.12, -0.05]);
  return TOOL;
};
ITEMS.adrenaline = (k, root) => {
  const pl = L('plastic', 0xe8e8e0);
  k.add(L('glass', 0xffffff, { opacity: 0.45 }), cyl(0.012, 0.012, 0.1, 8, true), [0, 0, 0], [HP, 0, 0]);
  k.add(B(null, 0xf0d040), cyl(0.009, 0.009, 0.07, 6), [0, 0, -0.012], [HP, 0, 0]);
  k.add(pl, box(0.05, 0.004, 0.012), [0, 0, 0.05]);
  k.add(pl, cyl(0.004, 0.004, 0.06, 4), [0, 0, 0.07], [HP, 0, 0]);
  k.add(pl, cyl(0.011, 0.011, 0.004, 8), [0, 0, 0.1], [HP, 0, 0]);
  k.add(pl, cyl(0.011, 0.006, 0.01, 8), [0, 0, -0.055], [HP, 0, 0]);
  k.add(L('metal', 0xd0d0d0), cyl(0.0012, 0.0012, 0.04, 4), [0, 0, -0.08], [HP, 0, 0]);
  setTip(root, [0, 0, -0.1]);
  return TOOL;
};
ITEMS.boombox = (k, root) => {
  const body = L('plastic', 0x3a3a3c), mt = L('metal', 0xa0a0a0);
  k.add(body, box(0.4, 0.2, 0.1), [0, -0.14, 0]);
  k.add(L('boombox_front'), plane(0.39, 0.19), [0, -0.14, -0.0505], [0, PI, 0]);
  k.add(mt, cyl(0.01, 0.01, 0.3, 6), [0, 0, 0], [0, 0, HP]);
  k.add(mt, box(0.012, 0.045, 0.012), [-0.14, -0.02, 0]);
  k.add(mt, box(0.012, 0.045, 0.012), [0.14, -0.02, 0]);
  k.add(mt, cyl(0.003, 0.003, 0.25, 4), [0.17, 0.05, 0.02], [0, 0, -0.35]);
  setTip(root, [0, -0.14, -0.06]);
  return TOOL;
};
ITEMS.spraypaint = (k, root) => {
  const w = L('plastic', 0xe8e8e0);
  k.add(L('paint', 0xc03020), cyl(0.032, 0.032, 0.16, 8));
  k.add(L('metal', 0xc0c0c0), hemi(0.031, 8, 2), [0, 0.08, 0]);
  k.add(w, cyl(0.008, 0.008, 0.015, 6), [0, 0.112, 0]);
  k.add(w, box(0.01, 0.01, 0.014), [0, 0.118, -0.008]);
  setTip(root, [0, 0.118, -0.016]);
  return TOOL;
};
ITEMS.glowstick = (k, root) => {
  const cap = L('plastic', 0x40a040);
  k.add(B(null, 0x70ff70), cyl(0.008, 0.008, 0.15, 6), [0, 0, 0], [HP, 0, 0]);
  k.add(cap, cyl(0.009, 0.009, 0.012, 6), [0, 0, 0.078], [HP, 0, 0]);
  k.add(cap, cyl(0.009, 0.009, 0.012, 6), [0, 0, -0.078], [HP, 0, 0]);
  k.add(cap, tor(0.008, 0.002, 3, 6), [0, 0, 0.092], [0, HP, 0]);
  setLight(root, [0, 0, 0], { type: 'point', color: 0x70ff70, intensity: 0.8, distance: 5 });
  setTip(root, [0, 0, -0.084]);
  return TOOL;
};
ITEMS.rod = (k, root) => {
  const mt = L('metal', 0x909090);
  k.add(L('wood_planks', 0xd0a070), cyl(0.016, 0.016, 0.3, 6), [0, 0, 0.1], [HP, 0, 0]);
  k.add(L('rubber'), cyl(0.018, 0.018, 0.02, 6), [0, 0, 0.26], [HP, 0, 0]);
  k.add(L('plastic', 0x1e2a20), cyl(0.009, 0.0025, 1.3, 5), [0, 0, -0.7], [HP, 0, 0]);
  k.add(mt, box(0.008, 0.04, 0.012), [0, -0.025, 0.08]);
  k.add(L('metal_dark', 0x606060), cyl(0.028, 0.028, 0.03, 8), [0, -0.055, 0.08], [0, 0, HP]);
  k.add(mt, box(0.03, 0.006, 0.006), [0.03, -0.055, 0.08]);
  for (const z of [-0.2, -0.5, -0.8, -1.1]) k.add(mt, box(0.004, 0.012, 0.004), [0, -0.01, z]);
  setTip(root, [0, 0, -1.35]);
  return TOOL;
};
ITEMS.key = (k, root) => {
  const b = L('gold', 0x9a7a40);
  k.add(b, tor(0.02, 0.005, 4, 8), [0, 0, 0], [0, HP, 0]);
  k.add(b, cyl(0.005, 0.005, 0.11, 6), [0, 0, -0.075], [HP, 0, 0]);
  k.add(b, box(0.004, 0.028, 0.022), [0, -0.017, -0.115]);
  k.add(b, box(0.004, 0.01, 0.006), [0, -0.034, -0.108]);
  k.add(b, cyl(0.008, 0.008, 0.008, 6), [0, 0, -0.025], [HP, 0, 0]);
  setTip(root, [0, 0, -0.13]);
  return TOOL;
};
ITEMS.lockpick = (k, root) => {
  const mt = L('metal', 0xc0c0c0);
  k.add(L('plastic', 0x2a2e34), box(0.05, 0.025, 0.09));
  k.add(B(null, 0x40e070), plane(0.034, 0.03), [0, 0.0128, 0.01], [-HP, 0, 0]);
  k.add(mt, box(0.003, 0.003, 0.06), [0.01, 0, -0.075]);
  k.add(mt, box(0.003, 0.012, 0.003), [0.01, 0.005, -0.105]);
  k.add(mt, box(0.004, 0.004, 0.04), [-0.012, -0.006, -0.064]);
  k.add(B(null, 0xff3030), box(0.006, 0.004, 0.006), [0.018, 0.013, -0.03]);
  setTip(root, [0.01, 0.01, -0.105]);
  return TOOL;
};
ITEMS.jetpack = (k, root) => {
  const tank = L('paint', 0xb0b4b0), dk = L('metal_dark'), hz = L('hazard_stripes'), st = L('fabric', 0x3a3a30);
  for (const sx of [-1, 1]) {
    k.add(tank, cyl(0.08, 0.08, 0.42, 8), [sx * 0.09, -0.29, 0]);
    k.add(tank, hemi(0.08, 8, 2), [sx * 0.09, -0.08, 0]);
    k.add(dk, cyl(0.045, 0.065, 0.1, 8, true), [sx * 0.09, -0.55, 0]);
    k.add(hz, cyl(0.083, 0.083, 0.05, 8, true), [sx * 0.09, -0.2, 0]);
  }
  k.add(dk, box(0.3, 0.44, 0.06), [0, -0.3, 0.1]);
  k.add(dk, box(0.14, 0.014, 0.022), [0, 0, 0.02]);
  k.add(dk, box(0.014, 0.06, 0.02), [-0.065, -0.035, 0.02]);
  k.add(dk, box(0.014, 0.06, 0.02), [0.065, -0.035, 0.02]);
  for (const sx of [-1, 1]) k.add(st, box(0.05, 0.4, 0.015), [sx * 0.09, -0.3, 0.138]);
  const thr = [-1, 1].map((sx) => anchor(root, sx < 0 ? 'thrusterL' : 'thrusterR', [sx * 0.09, -0.6, 0], [-HP, 0, 0]));
  root.userData.thrusters = thr;
  setTip(root, [0, -0.6, 0], [-HP, 0, 0]);
  return TOOL;
};
ITEMS.body = (k, root) => {
  const bag = L('rubber', 0x6a7a66), strap = L('fabric', 0x2a2a2a);
  k.add(bag, cyl(0.2, 0.2, 1.4, 8, true), [0, 0, 0], [HP, 0, 0], [1, 1, 0.75]);
  k.add(bag, hemi(0.2, 8, 3), [0, 0, 0.7], [HP, 0, 0], [1, 1, 0.75]);
  k.add(bag, hemi(0.2, 8, 3), [0, 0, -0.7], [-HP, 0, 0], [1, 1, 0.75]);
  for (const z of [-0.45, 0, 0.45]) k.add(strap, cyl(0.212, 0.212, 0.05, 8, true), [0, 0, z], [HP, 0, 0], [1, 1, 0.77]);
  k.add(L('metal_dark'), box(0.012, 0.006, 1.5), [0.04, 0.151, 0]);
  k.add(strap, tor(0.05, 0.01, 3, 6, PI), [0, 0.15, 0.22], [0, HP, 0]);
  setTip(root, [0, 0, -0.9]);
  return TOOL;
};

// ------------------------------------------------------------------------------------ dead-internet scrap (round 3)
/** rotate a local XZ offset by yaw r (same convention as three's Y rotation) */
const yawXZ = (x, z, r) => [x * Math.cos(r) + z * Math.sin(r), -x * Math.sin(r) + z * Math.cos(r)];

ITEMS.floppies = (k) => {
  const cols = [0x2a2a2e, 0x3050a0, 0xa03030, 0x2a2a2e, 0xd8c040];
  const sh = L('metal', 0xc8c8cc), lb = L('plastic', 0xf0ece0);
  cols.forEach((c, i) => {
    const y = i * 0.0046, r = ((i * 0.37) % 0.4) - 0.2;
    k.add(L('plastic', c), box(0.09, 0.0036, 0.094), [0, y, 0], [0, r, 0]);
    const [sx, sz] = yawXZ(0, -0.032, r);
    k.add(sh, box(0.034, 0.0039, 0.03), [sx, y, sz], [0, r, 0]);
    const [lx, lz] = yawXZ(0, 0.018, r);
    k.add(lb, box(0.064, 0.0039, 0.04), [lx, y, lz], [0, r, 0]);
  });
  return SCRAP;
};
ITEMS.modem = (k) => {
  const body = L('plastic', 0xd8cfb4), dk = L('plastic', 0x3a3a3a);
  k.add(body, box(0.2, 0.04, 0.14), [0, 0.02, 0]);
  k.add(dk, box(0.2, 0.014, 0.012), [0, 0.02, 0.071]);
  for (let i = 0; i < 6; i++) k.add(B(null, i % 3 === 0 ? 0xff4030 : 0x50ff60), box(0.008, 0.005, 0.004), [-0.07 + i * 0.022, 0.02, 0.078]);
  k.add(L('vent', 0x9a9280), plane(0.12, 0.08), [0, 0.0406, -0.02], [-HP, 0, 0]);
  k.add(L('rubber'), cyl(0.005, 0.005, 0.09, 5), [0.06, 0.015, -0.11], [HP, 0, 0]);
  k.add(dk, box(0.03, 0.02, 0.012), [-0.06, 0.02, -0.075]);
  k.add(L('paint', 0x2a58c0), box(0.05, 0.002, 0.03), [0.05, 0.0412, 0.035]);
  return SCRAP;
};
ITEMS.keyboard = (k) => {
  k.add(L('plastic', 0x1c1c20), box(0.44, 0.028, 0.15), [0, 0.014, 0], [0.06, 0, 0]);
  k.add(L('keyboard'), plane(0.42, 0.13), [0, 0.0295, 0], [-HP + 0.06, 0, 0]);
  k.add(B(null, 0xff2bd6), box(0.43, 0.004, 0.004), [0, 0.002, 0.076]);
  k.add(B(null, 0x00ffd0), box(0.43, 0.004, 0.004), [0, 0.002, -0.076]);
  k.add(L('rubber'), cyl(0.004, 0.004, 0.12, 4), [0, 0.02, -0.13], [HP, 0, 0]);
  return SCRAP;
};
ITEMS.vhs = (k) => {
  k.add(L('plastic', 0x151515), box(0.188, 0.025, 0.104));
  k.add(L('plastic', 0xe8e4d8), box(0.15, 0.018, 0.002), [0, 0, 0.053]);
  k.add(L('plastic', 0xd04a2a), box(0.04, 0.018, 0.0024), [-0.052, 0, 0.053]);
  for (const sx of [-1, 1]) k.add(L('glass', 0x6a5a50), circ(0.02, 8), [sx * 0.045, 0.0128, -0.005], [-HP, 0, 0]);
  k.add(L('plastic', 0xe8e4d8), box(0.1, 0.0005, 0.04), [0, 0.0128, 0.025]);
  return SCRAP;
};
ITEMS.nftframe = (k) => {
  const fr = L('gold', 0xe0c060, { emissive: 0x201400 });
  const W = 0.26, H = 0.2, t = 0.03, d = 0.025;
  k.add(fr, box(W + 2 * t, t, d), [0, H / 2 + t / 2, 0]);
  k.add(fr, box(W + 2 * t, t, d), [0, -H / 2 - t / 2, 0]);
  k.add(fr, box(t, H, d), [-W / 2 - t / 2, 0, 0]);
  k.add(fr, box(t, H, d), [W / 2 + t / 2, 0, 0]);
  k.add(L('wood_dark'), box(W, H, 0.008), [0, 0, -0.003]);
  k.add(L('arcade_art'), plane(W, H), [0, 0, 0.0015]);
  k.add(B(null, 0x00ffd0), box(0.07, 0.012, 0.004), [0, -H / 2 - t / 2, d / 2 + 0.002]);
  k.add(L('wood_dark'), box(0.02, 0.19, 0.012), [0, -0.035, -0.055], [-0.42, 0, 0]);
  return SCRAP;
};
ITEMS.playbutton = (k) => {
  k.add(L('wood_dark', 0x1a1a1a), box(0.36, 0.28, 0.03));
  k.add(L('gold', 0xffffff, { emissive: 0x3a2800, flat: true }), box(0.24, 0.17, 0.02), [0, 0.012, 0.02]);
  k.add(L('plastic', 0xf8f4e8), cyl(0.045, 0.045, 0.012, 3), [0.008, 0.012, 0.032], [HP, HP, 0]);
  k.add(L('gold', 0xd8c080), box(0.14, 0.02, 0.004), [0, -0.105, 0.017]);
  return SCRAP;
};
ITEMS.liketrophy = (k) => {
  k.add(L('wood_dark'), box(0.14, 0.04, 0.1), [0, 0.02, 0]);
  k.add(L('gold', 0xffffff, { emissive: 0x2a1c00 }), cyl(0.012, 0.02, 0.1, 6), [0, 0.09, 0]);
  k.add(L('plastic', 0x2a6aff), box(0.15, 0.15, 0.035), [0, 0.215, 0]);
  const w = L('plastic', 0xf8f8f8);
  k.add(w, box(0.07, 0.05, 0.012), [0.008, 0.2, 0.022]);
  k.add(w, box(0.024, 0.055, 0.012), [-0.012, 0.245, 0.022], [0, 0, 0.25]);
  k.add(w, box(0.02, 0.06, 0.012), [-0.042, 0.2, 0.022]);
  k.add(L('gold', 0xd0c8b0), box(0.07, 0.02, 0.004), [0, 0.02, 0.051]);
  return SCRAP;
};
ITEMS.memecart = (k) => {
  k.add(L('plastic', 0x8a8a90), box(0.11, 0.12, 0.018));
  k.add(L('arcade_art'), plane(0.08, 0.06), [0, 0.02, 0.0095]);
  for (let i = 0; i < 4; i++) k.add(L('plastic', 0x6a6a70), box(0.1, 0.004, 0.004), [0, -0.034 - i * 0.007, 0.0095]);
  k.add(L('gold', 0xc8a050), box(0.08, 0.012, 0.012), [0, -0.062, 0]);
  return SCRAP;
};
ITEMS.flipphone = (k) => {
  const sh = L('plastic', 0x6a6f7a), a = 0.5;
  k.add(sh, box(0.05, 0.012, 0.095), [0, 0.006, 0.0475]);
  k.add(L('keypad'), plane(0.042, 0.07), [0, 0.0125, 0.05], [-HP, 0, 0]);
  const dir = [0, Math.sin(a), -Math.cos(a)];
  const c = [0, 0.012 + dir[1] * 0.0475, dir[2] * 0.0475];
  k.add(sh, box(0.05, 0.01, 0.095), c, [a, 0, 0]);
  const n = [0, Math.cos(a), Math.sin(a)];
  k.add(B(null, 0x60b0ff), plane(0.04, 0.05), [0, c[1] + n[1] * 0.0056, c[2] + n[2] * 0.0056], [a - HP, 0, 0]);
  k.add(L('metal', 0x909090), cyl(0.006, 0.006, 0.05, 6), [0, 0.012, 0], [0, 0, HP]);
  return SCRAP;
};
ITEMS.webcam = (k, root) => {
  const pl = L('plastic', 0x202024);
  k.add(pl, sph(0.035, 8, 6), [0, 0.07, 0], null, [1.25, 1, 1]);
  k.add(L('glass', 0x3050a0), cyl(0.017, 0.017, 0.014, 8), [0, 0.07, 0.033], [HP, 0, 0]);
  k.add(B(null, 0x6090ff), circ(0.01, 8), [0, 0.07, 0.0405]);
  k.add(B(null, 0xff2020), box(0.006, 0.006, 0.004), [0.026, 0.086, 0.028]);
  k.add(L('plastic', 0x303034), box(0.03, 0.04, 0.02), [0, 0.03, 0]);
  k.add(L('plastic', 0x303034), box(0.07, 0.012, 0.06), [0, 0.006, -0.01]);
  setLight(root, [0, 0.07, 0.045], { type: 'point', color: 0xffffff, intensity: 3, distance: 8 });
  return SCRAP;
};
ITEMS.gamingchair = (k) => {
  const blk = L('fabric', 0x1c1c20), red = L('fabric', 0xc01830), mt = L('metal_dark'), rb = L('rubber');
  k.add(blk, box(0.46, 0.08, 0.44), [0, 0.48, 0]);
  k.add(red, box(0.12, 0.084, 0.44), [0, 0.481, 0]);
  k.add(blk, box(0.44, 0.62, 0.08), [0, 0.82, -0.22], [-0.12, 0, 0]);
  k.add(red, box(0.1, 0.62, 0.084), [0, 0.82, -0.219], [-0.12, 0, 0]);
  k.add(blk, box(0.3, 0.14, 0.08), [0, 1.19, -0.265], [-0.12, 0, 0]);
  for (const sx of [-1, 1]) {
    k.add(red, box(0.06, 0.5, 0.1), [sx * 0.24, 0.8, -0.2], [-0.12, 0, 0]);
    k.add(mt, box(0.03, 0.2, 0.03), [sx * 0.25, 0.6, 0]);
    k.add(rb, box(0.06, 0.025, 0.24), [sx * 0.25, 0.71, 0]);
  }
  k.add(L('metal', 0xa0a0a0), cyl(0.025, 0.025, 0.32, 6), [0, 0.3, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU, x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3;
    k.beam(mt, [0, 0.13, 0], [x, 0.075, z], 0.045, 0.03);
    k.add(rb, sph(0.035, 6, 4), [x, 0.035, z]);
  }
  return SCRAP;
};
ITEMS.ringlight = (k, root) => {
  const st = L('metal_dark');
  k.add(L('plastic', 0xf6f2ea, { emissive: 0x302c26 }), tor(0.15, 0.022, 4, 16), [0, 0.42, 0]);
  k.add(L('plastic', 0x1a1a1a), tor(0.15, 0.012, 3, 16), [0, 0.42, -0.018]);
  k.add(st, cyl(0.008, 0.008, 0.2, 6), [0, 0.17, 0]);
  k.add(st, box(0.012, 0.13, 0.012), [0, 0.335, 0]);
  k.add(L('plastic', 0x202020), box(0.05, 0.09, 0.01), [0, 0.42, 0.004]);
  k.add(B(null, 0x5ab0ff), plane(0.04, 0.075), [0, 0.42, 0.0095]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    k.limb(st, [0, 0.08, 0], [Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13], 0.006, 0.006, 4);
  }
  setLight(root, [0, 0.42, 0.04], { type: 'point', color: 0xfff1e0, intensity: 1.6, distance: 9 });
  return SCRAP;
};
ITEMS.usbidol = (k) => {
  const g = L('gold', 0xffffff, { emissive: 0x4a3000 });
  k.add(L('rock', 0x5a4a3a), box(0.09, 0.03, 0.09), [0, 0.015, 0]);
  k.add(g, cyl(0.03, 0.04, 0.09, 6), [0, 0.075, 0]);
  k.add(g, sph(0.03, 6, 4), [0, 0.13, 0]);
  for (const sx of [-1, 1]) k.limb(g, [sx * 0.03, 0.105, 0], [sx * 0.052, 0.07, 0.02], 0.009, 0.007, 4);
  k.add(L('metal', 0xd0d0d0), box(0.036, 0.05, 0.016), [0, 0.176, 0]);
  for (const sx of [-1, 1]) k.add(B(null, 0x101010), box(0.008, 0.008, 0.0165), [sx * 0.009, 0.186, 0]);
  for (const sx of [-1, 1]) k.add(B(null, 0x40ffd0), box(0.008, 0.005, 0.004), [sx * 0.011, 0.135, 0.028]);
  return SCRAP;
};
ITEMS.chainletter = (k) => {
  const pap = L('cardboard', 0xe8dcc0);
  k.add(pap, box(0.16, 0.004, 0.11));
  k.add(L('cardboard', 0xd8ccb0, { double: true }), G.tri([-0.08, 0.0024, -0.055], [0, 0.0024, 0.012], [0.08, 0.0024, -0.055]));
  k.add(L('paint', 0x8a0a0a), cyl(0.014, 0.014, 0.004, 8), [0, 0.004, 0.006]);
  k.add(L('cardboard', 0xf4f0e6), box(0.14, 0.002, 0.09), [0.03, 0.0055, -0.025], [0, 0.25, 0]);
  for (let i = 0; i < 3; i++) {
    const [x, z] = yawXZ(0, -0.05 + i * 0.016, 0.25);
    k.add(B(null, 0xff2020), box(0.09 - i * 0.02, 0.0022, 0.004), [0.03 + x, 0.0068, -0.025 + z + 0.02], [0, 0.25, 0]);
  }
  return SCRAP;
};
ITEMS.gpu = (k) => {
  k.add(L('plastic', 0x202226), box(0.28, 0.045, 0.12), [0, 0.0225, 0]);
  const fan = L('metal_dark', 0x303030), bl = L('plastic', 0x151515), hub = B(null, 0xff5a10);
  for (const x of [-0.075, 0.075]) {
    k.add(fan, cyl(0.046, 0.046, 0.006, 10), [x, 0.046, 0]);
    for (let i = 0; i < 3; i++) k.add(bl, box(0.08, 0.004, 0.012), [x, 0.05, 0], [0, (i / 3) * PI + (x > 0 ? 0.4 : 0), 0]);
    k.add(hub, cyl(0.012, 0.012, 0.004, 8), [x, 0.053, 0]);
  }
  k.add(B(null, 0xff6a1a), box(0.28, 0.006, 0.004), [0, 0.03, 0.061]);
  k.add(L('gold', 0xc8a050), box(0.09, 0.004, 0.012), [0.03, 0.001, -0.066]);
  k.add(L('metal', 0xa0a0a0), box(0.004, 0.05, 0.12), [0.142, 0.025, 0]);
  k.add(L('metal', 0x8a8a8a), box(0.26, 0.004, 0.11), [0, -0.002, 0]);
  return SCRAP;
};
ITEMS.hdd = (k) => {
  k.add(L('metal', 0xb8bcc0), box(0.102, 0.026, 0.147), [0, 0.013, 0]);
  k.add(L('plastic', 0xf0f0f0), plane(0.07, 0.08), [0, 0.0263, 0.012], [-HP, 0, 0]);
  k.add(L('paint', 0x2a58c0), plane(0.07, 0.015), [0, 0.0264, -0.035], [-HP, 0, 0]);
  k.add(L('plastic', 0x1a4a2a), box(0.095, 0.004, 0.13), [0, 0.001, 0]);
  k.add(L('plastic', 0x202020), box(0.05, 0.01, 0.006), [0, 0.013, -0.075]);
  return SCRAP;
};
ITEMS.headset = (k) => {
  const bk = L('plastic', 0x18181c);
  k.add(bk, tor(0.09, 0.011, 4, 12, PI), [0, 0.09, 0]);
  for (const sx of [-1, 1]) {
    k.add(bk, box(0.014, 0.05, 0.02), [sx * 0.09, 0.065, 0]);
    k.add(bk, cyl(0.045, 0.045, 0.035, 10), [sx * 0.092, 0.03, 0], [0, 0, HP]);
    k.add(B(null, 0x00ffd0), tor(0.03, 0.004, 3, 10), [sx * 0.111, 0.03, 0], [0, HP, 0]);
    k.add(L('fabric', 0x2a2a2a), cyl(0.04, 0.04, 0.012, 10), [sx * 0.07, 0.03, 0], [0, 0, HP]);
  }
  k.limb(bk, [-0.1, 0.02, 0.012], [-0.06, -0.02, 0.08], 0.004, 0.004, 4);
  k.add(L('fabric', 0x303030), sph(0.012, 6, 4), [-0.055, -0.022, 0.085]);
  return SCRAP;
};
ITEMS.cdspindle = (k) => {
  k.add(L('plastic', 0x1a1a1a), cyl(0.07, 0.07, 0.012, 12), [0, 0.006, 0]);
  const disc = L('metal', 0xd8dce8);
  for (let i = 0; i < 8; i++) k.add(disc, cyl(0.06, 0.06, 0.0035, 12), [0, 0.015 + i * 0.005, 0]);
  k.add(B(null, 0xb8f0ff), cyl(0.0605, 0.0605, 0.0005, 12), [0, 0.0535, 0]);
  k.add(L('plastic', 0x2a2a2a), cyl(0.008, 0.008, 0.1, 6), [0, 0.06, 0]);
  k.add(L('glass', 0xffffff, { opacity: 0.35, double: true }), cyl(0.066, 0.066, 0.11, 12, true), [0, 0.067, 0]);
  k.add(L('glass', 0xffffff, { opacity: 0.35 }), circ(0.066, 12), [0, 0.122, 0], [-HP, 0, 0]);
  return SCRAP;
};
ITEMS.pocketpet = (k) => {
  k.add(L('plastic', 0xff7ac0), sph(0.035, 8, 6), [0, 0.035, 0], null, [1, 1.15, 0.55]);
  k.add(B(null, 0x9ad06a), plane(0.03, 0.026), [0, 0.043, 0.0196]);
  k.add(L(null, 0x203018), box(0.008, 0.008, 0.001), [0, 0.042, 0.0202]);
  for (let i = -1; i <= 1; i++) k.add(L('plastic', 0xf8e040), cyl(0.004, 0.004, 0.006, 6), [i * 0.011, 0.019, 0.016], [HP, 0, 0]);
  k.add(L('metal', 0xc0c0c0), tor(0.01, 0.0018, 3, 8), [0, 0.083, 0], [0, HP, 0]);
  return SCRAP;
};
ITEMS.pager = (k) => {
  k.add(L('plastic', 0x1e1e22), box(0.06, 0.04, 0.018), [0, 0.02, 0]);
  k.add(B(null, 0x7ad0a0), plane(0.042, 0.014), [0, 0.028, 0.0092]);
  for (const sx of [-1, 1]) k.add(L('plastic', 0x404048), box(0.01, 0.006, 0.006), [sx * 0.014, 0.009, 0.01]);
  k.add(L('metal', 0x909090), box(0.022, 0.032, 0.004), [0, 0.022, -0.011]);
  return SCRAP;
};
ITEMS.captcha = (k) => {
  const st = L('rock', 0x8e8a80);
  k.add(st, box(0.3, 0.32, 0.05), [0, 0.16, 0]);
  k.add(st, cyl(0.15, 0.15, 0.05, 10), [0, 0.32, 0], [HP, 0, 0]);
  const tile = L('concrete', 0x9a9486), sel = B(null, 0x3a78d8);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const on = (r * 3 + c) % 4 === 1;
    k.add(on ? sel : tile, box(0.07, 0.07, 0.012), [(c - 1) * 0.08, 0.3 - r * 0.08, 0.028]);
  }
  k.add(L('concrete', 0xe8e4d8), box(0.2, 0.035, 0.01), [0, 0.045, 0.027]);
  k.add(B(null, 0x40d060), box(0.022, 0.022, 0.004), [-0.075, 0.045, 0.033]);
  return SCRAP;
};
ITEMS.animefig = (k) => {
  const skin = L('plastic', 0xf0d8c8), hair = L('plastic', 0xff6ab0);
  k.add(L('plastic', 0x1a1a1a), cyl(0.045, 0.05, 0.012, 10), [0, 0.006, 0]);
  for (const sx of [-1, 1]) k.add(skin, cyl(0.007, 0.006, 0.06, 5), [sx * 0.012, 0.042, 0]);
  k.add(L('plastic', 0x2a3a8a), cone(0.03, 0.04, 8), [0, 0.085, 0]);
  k.add(L('plastic', 0xf4f4f8), box(0.03, 0.035, 0.02), [0, 0.12, 0]);
  for (const sx of [-1, 1]) k.limb(skin, [sx * 0.017, 0.132, 0], [sx * 0.03, 0.1, 0.008], 0.005, 0.004, 4);
  k.add(L('plastic', 0xf6dccc), sph(0.026, 8, 6), [0, 0.162, 0]);
  k.add(hair, sph(0.029, 8, 6), [0, 0.168, -0.006]);
  for (const sx of [-1, 1]) k.add(hair, cone(0.012, 0.075, 5), [sx * 0.036, 0.13, -0.006], [0, 0, PI - sx * 0.3]);
  for (const sx of [-1, 1]) k.add(B(null, 0x3a6aff), box(0.009, 0.011, 0.002), [sx * 0.01, 0.161, 0.0262]);
  return SCRAP;
};
ITEMS.printer = (k) => {
  const bd = L('plastic', 0xd8d4cc), dk = L('plastic', 0x3a3a3e), pap = L('cardboard', 0xf6f4ee, { double: true });
  k.add(bd, box(0.44, 0.2, 0.36), [0, 0.1, 0]);
  k.add(dk, box(0.36, 0.03, 0.2), [0, 0.06, 0.2]);
  k.add(dk, box(0.24, 0.012, 0.3), [0, 0.24, -0.2], [0.7, 0, 0]);
  k.add(pap, box(0.2, 0.004, 0.26), [0, 0.252, -0.19], [0.7, 0, 0]);
  k.add(pap, plane(0.18, 0.12), [0, 0.14, 0.195], [-0.5, 0.1, 0.15]);
  k.add(dk, box(0.14, 0.02, 0.06), [0.13, 0.205, 0.12]);
  k.add(B(null, 0x60c0ff), plane(0.05, 0.02), [0.11, 0.2155, 0.12], [-HP, 0, 0]);
  k.add(B(null, 0xff2020), box(0.012, 0.006, 0.012), [0.17, 0.217, 0.12]);
  return SCRAP;
};
ITEMS.motherboard = (k) => {
  k.add(L('plastic', 0x1e5a2e), box(0.3, 0.006, 0.24), [0, 0.003, 0]);
  k.add(L('metal', 0xc0c0c0), box(0.06, 0.012, 0.06), [-0.03, 0.012, -0.02]);
  k.add(L('gold', 0xd0b060), box(0.04, 0.004, 0.04), [-0.03, 0.02, -0.02]);
  for (let i = 0; i < 4; i++) k.add(L('plastic', 0x202020), box(0.008, 0.012, 0.13), [0.05 + i * 0.014, 0.012, -0.02]);
  for (let i = 0; i < 8; i++) k.add(L('metal', 0x3050a0), cyl(0.005, 0.005, 0.016, 6), [-0.12 + (i % 4) * 0.02, 0.014, 0.08 + Math.floor(i / 4) * 0.02]);
  k.add(L('metal_dark'), box(0.05, 0.03, 0.05), [-0.1, 0.021, -0.09]);
  k.add(L('plastic', 0x151515), box(0.18, 0.01, 0.01), [0.02, 0.011, 0.06]);
  k.add(L('metal', 0x9a9a9a), box(0.02, 0.04, 0.16), [-0.14, 0.02, -0.03]);
  k.add(B(null, 0xff2bd6), box(0.004, 0.004, 0.2), [0.145, 0.008, 0]);
  return SCRAP;
};
ITEMS.cryptocoin = (k) => {
  const g = L('gold', 0xffffff, { emissive: 0x3a2800, flat: true }), e = L('gold', 0xc89030);
  k.add(g, cyl(0.045, 0.045, 0.008, 16), [0, 0.004, 0]);
  k.add(L('gold', 0xd0a040), tor(0.042, 0.003, 3, 16), [0, 0.0085, 0], [HP, 0, 0]);
  k.add(e, box(0.006, 0.003, 0.042), [-0.008, 0.0095, 0]);
  for (const z of [-0.017, 0, 0.017]) k.add(e, box(0.018, 0.003, 0.006), [0.001, 0.0095, z]);
  for (const z of [-0.0085, 0.0085]) k.add(e, box(0.006, 0.003, 0.014), [0.011, 0.0095, z]);
  for (const z of [-0.024, 0.024]) k.add(e, box(0.003, 0.003, 0.008), [-0.003, 0.0095, z]);
  return SCRAP;
};
// physics valuables
ITEMS.cryptorig = (k) => {
  const fr = L('metal', 0xa8acb0), card = L('plastic', 0x202226), fan = L('metal_dark', 0x303030);
  for (const x of [-0.3, 0.3]) for (const z of [-0.17, 0.17]) k.add(fr, box(0.02, 0.45, 0.02), [x, 0.225, z]);
  for (const y of [0.01, 0.44]) {
    for (const z of [-0.17, 0.17]) k.add(fr, box(0.62, 0.02, 0.02), [0, y, z]);
    for (const x of [-0.3, 0.3]) k.add(fr, box(0.02, 0.02, 0.36), [x, y, 0]);
  }
  k.add(fr, box(0.62, 0.015, 0.03), [0, 0.2, 0]);
  k.add(L('plastic', 0x1e5a2e), box(0.56, 0.006, 0.3), [0, 0.03, 0]);
  const glows = [0xff2bd6, 0x00ffd0, 0xffa020];
  for (let i = 0; i < 6; i++) {
    const x = -0.25 + i * 0.1;
    k.add(card, box(0.03, 0.2, 0.26), [x, 0.31, 0]);
    for (const z of [-0.06, 0.06]) k.add(fan, cyl(0.048, 0.048, 0.004, 10), [x + 0.016, 0.31, z], [0, 0, HP]);
    k.add(B(null, glows[i % 3]), box(0.032, 0.004, 0.24), [x, 0.412, 0]);
    k.limb(L('rubber', 0x202020), [x, 0.21, 0.1], [0.2, 0.12, 0.08], 0.005, 0.005, 4);
  }
  k.add(L('metal_dark'), box(0.15, 0.086, 0.14), [0.2, 0.08, 0.05]);
  k.add(B(null, 0x50ff60), box(0.02, 0.01, 0.004), [0.2, 0.1, 0.121]);
  return VALUABLE;
};
ITEMS.pctower = (k) => {
  const bg = L('plastic', 0xd8ceb0), dk = L('plastic', 0x2a2a2a);
  k.add(bg, box(0.2, 0.42, 0.44), [0, 0.21, 0]);
  k.add(L('plastic', 0xcfc4a4), box(0.2, 0.42, 0.012), [0, 0.21, 0.226]);
  for (let i = 0; i < 3; i++) k.add(L('plastic', 0xc8bd9c), box(0.16, 0.04, 0.006), [0, 0.36 - i * 0.05, 0.234]);
  k.add(dk, box(0.12, 0.004, 0.004), [0, 0.355, 0.238]);
  k.add(dk, box(0.09, 0.006, 0.004), [0, 0.2, 0.235]);
  k.add(B(null, 0x50ff60), box(0.01, 0.006, 0.004), [-0.05, 0.1, 0.235]);
  k.add(B(null, 0xffa020), box(0.01, 0.006, 0.004), [-0.03, 0.1, 0.235]);
  k.add(L('plastic', 0xb0a484), cyl(0.014, 0.014, 0.01, 8), [0.04, 0.1, 0.236], [HP, 0, 0]);
  k.add(L('vent', 0xb0a684), plane(0.14, 0.08), [0, 0.045, 0.2332]);
  k.add(L('arcade_art'), plane(0.06, 0.08), [0.1006, 0.3, 0.1], [0, HP, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(L('rubber'), box(0.03, 0.012, 0.04), [x * 0.08, -0.006, z * 0.19]);
  return VALUABLE;
};

// ------------------------------------------------------------------------------------ round 3 store tools
ITEMS.ladder = (k, root) => {
  const al = L('metal', 0xc8ccd2), al2 = L('metal', 0xa8adb4), rb = L('rubber');
  const len = 1.3, z0 = 0.35;
  for (const sx of [-1, 1]) {
    k.add(al, box(0.035, 0.07, len), [sx * 0.2, 0, z0 - len / 2]);
    k.add(al2, box(0.03, 0.06, len - 0.1), [sx * 0.165, 0.055, z0 - len / 2 - 0.08]);
    k.add(rb, box(0.045, 0.08, 0.05), [sx * 0.2, 0, z0 + 0.02]);
  }
  for (let i = 0; i < 5; i++) k.add(al, cyl(0.016, 0.016, 0.4, 6), [0, 0, z0 - 0.12 - i * 0.27], [0, 0, HP]);
  for (let i = 0; i < 4; i++) k.add(al2, cyl(0.013, 0.013, 0.33, 6), [0, 0.055, z0 - 0.25 - i * 0.27], [0, 0, HP]);
  k.add(L('paint', 0xd8a020), box(0.05, 0.02, 0.03), [0.2, 0.045, -0.3]);
  setTip(root, [0, 0, z0 - len]);
  return TOOL;
};
ITEMS.booster = (k, root) => {
  k.add(L('paint', 0x3a4a3a), box(0.12, 0.1, 0.16), [0, 0, -0.06]);
  k.add(L('hazard_stripes'), box(0.122, 0.02, 0.162), [0, -0.035, -0.06]);
  k.add(L('metal_dark'), cyl(0.006, 0.006, 0.22, 5), [0.04, 0.16, -0.1]);
  k.add(B(null, 0xff3030), sph(0.011, 6, 4), [0.04, 0.275, -0.1]);
  k.add(L('metal', 0xc0c0c0, { double: true }), hemi(0.05, 8, 2), [-0.02, 0.08, -0.05], [PI - 0.4, 0, 0]);
  k.add(L('metal_dark'), cyl(0.004, 0.004, 0.05, 4), [-0.02, 0.07, -0.05]);
  k.add(B(null, 0x40ff80), box(0.04, 0.014, 0.004), [0, 0.02, 0.021]);
  k.add(L('rubber'), box(0.1, 0.014, 0.02), [0, 0.055, 0.0]);
  setTip(root, [0.04, 0.275, -0.1]);
  return TOOL;
};
ITEMS.inhaler = (k, root) => {
  const pk = L('plastic', 0xff3aa0);
  k.add(pk, box(0.045, 0.1, 0.03), [0, 0.02, 0.01]);
  k.add(L('metal', 0xd0d0d0), cyl(0.012, 0.012, 0.07, 8), [0, 0.09, 0.01]);
  k.add(pk, box(0.04, 0.03, 0.05), [0, -0.035, -0.03]);
  k.add(L('plastic', 0x202020), box(0.03, 0.02, 0.012), [0, -0.035, -0.058]);
  k.add(B(null, 0x7affff), box(0.03, 0.008, 0.002), [0, 0.03, 0.0256]);
  setTip(root, [0, -0.035, -0.066]);
  return TOOL;
};
ITEMS.beltbag = (k, root) => {
  k.add(L('fabric', 0x2a3a4a), sph(0.1, 10, 6), [0, 0, -0.04], null, [1.3, 0.6, 0.5]);
  k.add(L('fabric', 0x151515), box(0.5, 0.035, 0.008), [0, 0.01, 0.012]);
  k.add(L('plastic', 0x303030), box(0.04, 0.04, 0.014), [0.2, 0.01, 0.014]);
  k.add(L('metal', 0xc0c0c0), box(0.2, 0.006, 0.006), [0, 0.045, -0.075]);
  k.add(L('metal', 0xc0c0c0), box(0.008, 0.02, 0.004), [0.09, 0.035, -0.08]);
  k.add(B(null, 0xff2bd6), box(0.04, 0.03, 0.002), [0.05, -0.005, -0.091]);
  setTip(root, [0, 0, -0.1]);
  return TOOL;
};
ITEMS.adblock = (k, root) => {
  const dk = L('plastic', 0x1a1a1a);
  k.add(L('plastic', 0xe8e4dc), cyl(0.045, 0.05, 0.2, 10), [0, -0.05, 0.02]);
  k.add(L('paint', 0xc01820), cyl(0.051, 0.051, 0.07, 10, true), [0, -0.06, 0.02]);
  k.add(L('plastic', 0xf8f8f8), box(0.05, 0.012, 0.004), [0, -0.06, 0.0725]);
  k.add(dk, cyl(0.01, 0.01, 0.06, 6), [0, 0.08, 0.02]);
  k.add(dk, box(0.06, 0.015, 0.02), [0, 0.11, 0.02]);
  k.add(L('plastic', 0x2a2a2a), cyl(0.008, 0.008, 0.22, 6), [0, 0.02, -0.11], [HP, 0, 0]);
  k.add(L('paint', 0xc01820), cyl(0.012, 0.008, 0.03, 6), [0, 0.02, -0.235], [HP, 0, 0]);
  setTip(root, [0, 0.02, -0.25]);
  return TOOL;
};

/**
 * Deployed Extension Ladder: a vertical two-section ladder `h` meters tall, origin at the bottom centre,
 * rails along +Y, width along X, the wall side toward -Z. Returns a THREE.Group (merged, 2-3 draw calls).
 */
export function createLadderModel(h) {
  const g = new THREE.Group();
  g.name = 'ladder_deployed';
  const k = new Kit();
  const al = L('metal', 0xc8ccd2), al2 = L('metal', 0xa8adb4), rb = L('rubber');
  const H = Math.max(1, h);
  const low = H * 0.55, up0 = H * 0.42;
  for (const sx of [-1, 1]) {
    k.add(al, box(0.035, low, 0.06), [sx * 0.2, low / 2, 0]);
    k.add(al2, box(0.03, H - up0, 0.05), [sx * 0.165, up0 + (H - up0) / 2, -0.055]);
    k.add(rb, box(0.05, 0.05, 0.08), [sx * 0.2, 0.025, 0]);
    k.add(L('paint', 0xd8a020), box(0.04, 0.05, 0.03), [sx * 0.19, low - 0.08, -0.03]);
  }
  for (let y = 0.28; y < low - 0.05; y += 0.3) k.add(al, cyl(0.016, 0.016, 0.4, 6), [0, y, 0], [0, 0, HP]);
  for (let y = up0 + 0.15; y < H - 0.05; y += 0.3) k.add(al2, cyl(0.014, 0.014, 0.33, 6), [0, y, -0.055], [0, 0, HP]);
  k.into(g);
  return g;
}

function unknownItem(k) {
  k.add(L('unknown'), box(0.2, 0.2, 0.2));
  return { kind: 'unknown', center: true };
}

/** [trade] does models/items.js itself build this id? (module-registered models live in window.__kefalMods.itemModels) */
export const hasItemModel = (id) => !!ITEMS[id];

export const ITEM_MODEL_IDS = Object.freeze([
  // scrap
  'bolt', 'axle', 'bell', 'register', 'goldbar', 'duck', 'robot', 'lamp', 'canned', 'figurine', 'mug', 'teeth',
  'airhorn', 'clownhorn', 'painting', 'pickles', 'bottles', 'trophy', 'perfume', 'flask', 'cog', 'phone', 'pot',
  'steering', 'tv', 'magnify', 'skull', 'ring', 'reactor',
  // physics valuables
  'vase', 'statue', 'amphora', 'server', 'aquarium',
  // fish
  'fish_kefal', 'fish_lufer', 'fish_levrek', 'fish_golden', 'fish_boot', 'fish_eel',
  // creature drops
  'drop_scuttler', 'drop_spider', 'drop_crawler', 'drop_hound', 'drop_lurker', 'drop_giant',
  // tools
  'flashlight', 'proflash', 'walkie', 'shovel', 'pipe', 'stopsign', 'machete', 'sledge', 'taser', 'harpoon',
  'shotgun', 'shells', 'stungrenade', 'medkit', 'adrenaline', 'boombox', 'spraypaint', 'glowstick', 'rod', 'key',
  'lockpick', 'jetpack', 'body',
  // round 3: dead-internet scrap, big valuables, store tools
  'floppies', 'modem', 'keyboard', 'vhs', 'nftframe', 'playbutton', 'liketrophy', 'memecart', 'flipphone', 'webcam',
  'gamingchair', 'ringlight', 'usbidol', 'chainletter', 'gpu', 'hdd', 'headset', 'cdspindle', 'pocketpet', 'pager',
  'captcha', 'animefig', 'printer', 'motherboard', 'cryptocoin', 'cryptorig', 'pctower',
  'ladder', 'booster', 'inhaler', 'beltbag', 'adblock',
]);

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Build an item model. Unknown ids return a small '?' box. */
export function createItemModel(id) {
  const root = new THREE.Group();
  root.name = 'item_' + id;
  const k = new Kit();
  const fn = ITEMS[id];
  const info = (fn ? fn(k, root) : unknownItem(k)) || SCRAP;
  k.into(root);
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  if (info.center) {
    const c = bb.getCenter(new THREE.Vector3());
    for (const ch of root.children) ch.position.sub(c);
    bb.translate(c.negate());
    root.updateMatrixWorld(true);
  }
  const sz = bb.getSize(new THREE.Vector3());
  root.userData.itemId = id;
  root.userData.kind = info.kind;
  root.userData.size = [r3(sz.x), r3(sz.y), r3(sz.z)];
  return root;
}
