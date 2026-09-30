// SURVIVAL models (module `survival`): plants (merged, vertex-coloured, emissive tint for the glowing kinds), item models (seeds, raw meat, dishes,
// potions, tools, placeable kits) and the structures (storage crates, planter box, ship stove, brewing stand, campfire, placement ghost).
// Cheap flat-shaded meshes, no textures except one tiny label canvas per crate. Safe to import in node (no DOM until makeLabel runs).
// Item convention: origin = grip, upright on +Y (icon renderer + hand frame). Structures: origin on the floor, FRONT = +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANTS, PROPS, MAINS } from '../game/survival_data.js';
import { createArtModel, createPotionModel } from './artpass.js';   // [artpass]
import { CRATE_TIERS, PLANTER_SIZE, STAND_SIZE, PLANTER_CELLS } from '../game/survival_store.js';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const bas = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...o });
const cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sph = (r, a = 7, b = 5) => new THREE.SphereGeometry(r, a, b);
const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
function add(parent, geo, mat, p = [0, 0, 0], r = null, s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  parent.add(m);
  return m;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
/** merge parts [{ g, c (hex), p, r, s }] into ONE vertex-coloured geometry */
function merge(parts) {
  const geos = parts.map((d) => {
    const g = d.g.clone();
    _e.set(...(d.r || [0, 0, 0]));
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(...(d.p || [0, 0, 0])), _q, new THREE.Vector3(...(d.s || [1, 1, 1])));
    g.applyMatrix4(_m);
    _c.set(d.c);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
}
const P = (g, c, p, r, s) => ({ g, c, p, r, s });

// ------------------------------------------------------------------------------------------------ plants
function plantParts(kind) {
  const a = [];
  if (kind === 'wildmint') {
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2, h = 0.16 + (i % 3) * 0.05;
      a.push(P(box(0.11, 0.015, 0.2), i % 2 ? 0x62c46a : 0x4fa85a, [Math.cos(ang) * 0.09, h, Math.sin(ang) * 0.09], [-0.7, -ang, 0]));
    }
    a.push(P(cyl(0.012, 0.016, 0.22, 5), 0x3a8a44, [0, 0.11, 0]));
  } else if (kind === 'glowcap') {
    for (const [x, z, h, r] of [[0, 0, 0.26, 0.12], [0.16, 0.06, 0.16, 0.08], [-0.12, 0.12, 0.2, 0.09]]) {
      a.push(P(cyl(0.022, 0.03, h, 6), 0xd8f2ee, [x, h / 2, z]));
      a.push(P(sph(r, 8, 5), 0x2ae8d0, [x, h, z], null, [1, 0.6, 1]));
      a.push(P(sph(r * 0.28, 5, 3), 0xd0fff8, [x + r * 0.35, h + r * 0.4, z], null, [1, 0.5, 1]));
    }
  } else if (kind === 'ashroot') {
    a.push(P(sph(0.12, 7, 5), 0x8a2a1a, [0, 0.07, 0], null, [1, 0.85, 1]));
    a.push(P(sph(0.075, 6, 4), 0xa03820, [0.15, 0.04, 0.05]));
    a.push(P(sph(0.06, 6, 4), 0x7a2416, [-0.13, 0.03, -0.06]));
    for (let i = 0; i < 4; i++) { const ang = i * 1.6; a.push(P(cone(0.03, 0.34, 4), 0x2a3428, [Math.cos(ang) * 0.06, 0.26, Math.sin(ang) * 0.06], [Math.sin(ang) * 0.35, 0, -Math.cos(ang) * 0.35])); }
    a.push(P(box(0.03, 0.03, 0.03), 0xff8a2a, [0.02, 0.15, 0.1]));
  } else if (kind === 'frostleaf') {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2, tilt = 0.35 + (i % 3) * 0.12;
      a.push(P(cone(0.05, 0.55, 4), i % 2 ? 0x9ad8ff : 0xb8e6ff, [Math.cos(ang) * 0.12, 0.26, Math.sin(ang) * 0.12], [Math.sin(ang) * tilt, 0, -Math.cos(ang) * tilt], [1, 1, 0.5]));
    }
    a.push(P(sph(0.05, 5, 3), 0xffffff, [0, 0.5, 0]));
  } else if (kind === 'bloodberry') {
    a.push(P(sph(0.3, 6, 4), 0x2c5a34, [0, 0.26, 0], null, [1, 0.8, 1]));
    a.push(P(sph(0.2, 6, 4), 0x356a3c, [0.2, 0.2, 0.1]));
    for (let i = 0; i < 10; i++) { const ang = i * 2.4, r = 0.24 + (i % 3) * 0.04; a.push(P(sph(0.045, 5, 4), i % 4 ? 0xd0243c : 0x9a1428, [Math.cos(ang) * r, 0.2 + (i % 4) * 0.07, Math.sin(ang) * r])); }
  } else if (kind === 'staticmoss') {
    for (const [x, z, r] of [[0, 0, 0.2], [0.2, 0.08, 0.13], [-0.16, 0.14, 0.12], [0.02, -0.18, 0.11], [-0.12, -0.1, 0.1]]) a.push(P(sph(r, 6, 4), 0x5a6a9a, [x, r * 0.35, z], null, [1, 0.5, 1]));
    for (let i = 0; i < 7; i++) { const ang = i * 2.1, r = 0.06 + (i % 3) * 0.06; a.push(P(box(0.025, 0.025, 0.025), i % 2 ? 0xfff0a0 : 0xa0d8ff, [Math.cos(ang) * r, 0.11 + (i % 2) * 0.03, Math.sin(ang) * r])); }
  } else if (kind === 'sunfruit') {
    a.push(P(cyl(0.085, 0.11, 0.5, 6), 0x3f8a48, [0, 0.25, 0]));
    a.push(P(cyl(0.05, 0.06, 0.26, 5), 0x3f8a48, [0.17, 0.3, 0], [0, 0, -0.6]));
    a.push(P(cyl(0.05, 0.06, 0.22, 5), 0x3f8a48, [-0.15, 0.27, 0], [0, 0, 0.6]));
    for (const [x, y, z, c] of [[0, 0.54, 0, 0xffb02a], [0.28, 0.42, 0, 0xffd04a], [-0.24, 0.36, 0, 0xff9a1a]]) a.push(P(sph(0.075, 6, 4), c, [x, y, z]));
    for (let i = 0; i < 6; i++) a.push(P(box(0.01, 0.05, 0.01), 0xf0e8c0, [Math.cos(i * 1.1) * 0.09, 0.15 + i * 0.06, Math.sin(i * 1.1) * 0.09]));
  } else a.push(P(sph(0.1, 5, 4), 0x62c46a, [0, 0.1, 0]));
  return a;
}
const geoCache = new Map();
/** merged vertex-coloured geometry of a plant kind (shared, never dispose from callers) */
export function plantGeo(kind) {
  let g = geoCache.get(kind);
  if (!g) { g = merge(plantParts(kind)); geoCache.set(kind, g); }
  return g;
}
const matCache = new Map();
/** shared material of a plant kind. Glowing kinds get an emissive tint of their own colour. */
export function plantMaterial(kind) {
  let m = matCache.get(kind);
  if (!m) {
    const P0 = PLANTS[kind];
    m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...(P0?.glow ? { emissive: new THREE.Color(P0.color).multiplyScalar(0.55) } : {}) });
    matCache.set(kind, m);
  }
  return m;
}
/** an InstancedMesh for the placed plants of a kind; rare ones get a brighter tint through instanceColor */
export function createPlantInstances(kind, list) {
  const im = new THREE.InstancedMesh(plantGeo(kind), plantMaterial(kind), Math.max(1, list.length));
  const d = new THREE.Object3D();
  list.forEach((p, i) => {
    d.position.set(p.x, p.y, p.z); d.rotation.set(0, p.rot, 0); d.scale.setScalar(p.scale * (p.rare ? 1.3 : 1)); d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, _c.set(p.rare ? 0xffe8a0 : 0xffffff));
  });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  im.userData.kind = kind;
  return im;
}
export const HIDE_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

// ------------------------------------------------------------------------------------------------ item models
function plantItem(kind) {
  return () => { const g = new THREE.Group(); const m = new THREE.Mesh(plantGeo(kind), plantMaterial(kind)); m.scale.setScalar(0.4); g.add(m); return g; };
}
function seedItem(kind) {
  return () => {
    const g = new THREE.Group(), c = new THREE.Color(PLANTS[kind].color).multiplyScalar(0.8).getHex();
    add(g, sph(0.05, 7, 5), lam(0xc8b28a), [0, 0.045, 0], null, [1, 0.9, 1]);
    add(g, cone(0.02, 0.05, 5), lam(0xc8b28a), [0, 0.105, 0]);
    add(g, box(0.05, 0.02, 0.005), bas(c), [0, 0.05, 0.05]);
    return g;
  };
}
function meatItem() {
  const g = new THREE.Group();
  add(g, sph(0.07, 7, 5), lam(0xc0405a), [0, 0.06, 0], null, [1.3, 0.8, 1]);
  add(g, sph(0.045, 6, 4), lam(0xe8b0b8), [0.02, 0.09, 0.03]);
  add(g, cyl(0.011, 0.011, 0.17, 5), lam(0xf0e8d8), [0.1, 0.06, 0], [0, 0, Math.PI / 2 - 0.2]);
  return g;
}
function dishModel(main, bonus) {
  return () => {
    const g = new THREE.Group();
    const bowl = main === 'grill' ? 0xe8e4dc : main === 'tart' ? 0xb8b8c0 : 0xe6dccc;
    if (main === 'grill') {
      add(g, cyl(0.1, 0.09, 0.015, 10), lam(bowl), [0, 0.008, 0]);
      add(g, sph(0.05, 7, 4), lam(0xd8924a), [0, 0.04, 0], null, [2.1, 0.55, 0.9]);
      add(g, cone(0.03, 0.05, 4), lam(0xd8924a), [0.1, 0.04, 0], [0, 0, -Math.PI / 2]);
      add(g, box(0.03, 0.012, 0.03), lam(0x4aa04a), [-0.03, 0.062, 0.03]);
    } else if (main === 'tart') {
      add(g, cyl(0.1, 0.085, 0.03, 10), lam(0xc8904a), [0, 0.015, 0]);
      add(g, cyl(0.085, 0.085, 0.012, 10), lam(0x7a1a3a), [0, 0.034, 0]);
      for (let i = 0; i < 5; i++) add(g, sph(0.018, 5, 3), lam(0xd0243c), [Math.cos(i * 1.26) * 0.05, 0.048, Math.sin(i * 1.26) * 0.05]);
    } else {
      add(g, sph(0.085, 9, 5), lam(bowl), [0, 0.09, 0], [Math.PI, 0, 0], [1, 0.72, 1]);
      add(g, cyl(0.07, 0.07, 0.012, 9), lam(main === 'stew' ? 0x8a4a22 : 0xd8a038), [0, 0.088, 0]);
      add(g, sph(0.02, 5, 3), lam(main === 'stew' ? 0xb86a3a : 0x6ab04a), [0.025, 0.1, 0.01]);
      add(g, sph(0.016, 5, 3), lam(0xe8c070), [-0.03, 0.1, -0.02]);
    }
    if (bonus) add(g, box(0.03, 0.03, 0.03), bas(new THREE.Color(PROPS[bonus].color).getHex()), [0.09, 0.13, 0], [0.5, 0.5, 0.5]);
    return g;
  };
}
function potionModel(prop) { return () => createPotionModel(PROPS[prop].color); }
function sickleModel() { return createArtModel('sv_sickle'); }
function canModel() {
  const g = new THREE.Group();
  add(g, cyl(0.06, 0.065, 0.11, 9), lam(0x5a8ab0), [0, 0.055, 0]);
  add(g, cyl(0.012, 0.012, 0.13, 5), lam(0x5a8ab0), [0.09, 0.1, 0], [0, 0, -0.9]);
  add(g, cyl(0.02, 0.015, 0.02, 6), lam(0x3a6a90), [0.145, 0.15, 0], [0, 0, -0.9]);
  add(g, new THREE.TorusGeometry(0.045, 0.008, 4, 8, Math.PI), lam(0x3a6a90), [0, 0.12, 0]);
  return g;
}
function kitModel(kind, tier = 1) {
  return () => {
    const g = new THREE.Group();
    if (kind === 'crate') {
      const c = tier === 1 ? 0x8a6238 : tier === 2 ? 0x7a8590 : 0x30383e;
      add(g, box(0.26, 0.18, 0.18), lam(c), [0, 0.09, 0]);
      add(g, box(0.27, 0.03, 0.19), lam(tier === 3 ? 0x1c2226 : 0x6a4a2a), [0, 0.19, 0]);
      add(g, box(0.06, 0.06, 0.01), bas(tier === 3 ? 0x30e0e0 : tier === 2 ? 0xe8c040 : 0xd8c088), [0, 0.1, 0.092]);
    } else if (kind === 'planter') {
      add(g, box(0.3, 0.09, 0.14), lam(0x8a6238), [0, 0.045, 0]);
      add(g, box(0.26, 0.02, 0.1), lam(0x3a2a1c), [0, 0.09, 0]);
      for (const x of [-0.08, 0, 0.08]) add(g, cone(0.015, 0.06, 4), lam(0x4fa85a), [x, 0.12, 0]);
    } else if (kind === 'brew') {
      add(g, box(0.2, 0.1, 0.14), lam(0x6a4a2a), [0, 0.05, 0]);
      add(g, sph(0.05, 7, 5), lam(0xdfe9ee, { transparent: true, opacity: 0.85 }), [-0.04, 0.15, 0]);
      add(g, sph(0.04, 7, 5), bas(0x7dffb0, { transparent: true, opacity: 0.9 }), [-0.04, 0.14, 0]);
      add(g, cyl(0.03, 0.04, 0.09, 6), lam(0xc07a3a), [0.05, 0.15, 0]);
    } else {
      for (const [r, x] of [[0.3, 0], [-0.3, 0.02], [1.6, -0.01]]) add(g, cyl(0.022, 0.022, 0.2, 6), lam(0x6a4a2a), [x, 0.03, 0], [0, r, Math.PI / 2]);
      add(g, cone(0.04, 0.09, 5), bas(0xff8a2a), [0, 0.12, 0]);
    }
    return g;
  };
}
/** id -> () => Object3D for mods.itemModels */
export function svItemModels(ids) {
  const out = {};
  for (const id of ids) {
    let f = null;
    let m;
    if ((m = /^sv_p_(\w+)$/.exec(id)) && PLANTS[m[1]]) f = plantItem(m[1]);
    else if ((m = /^sv_s_(\w+)$/.exec(id)) && PLANTS[m[1]]) f = seedItem(m[1]);
    else if (id === 'sv_meat') f = meatItem;
    else if ((m = /^sv_d_([a-z]+)_([a-z]+)$/.exec(id)) && MAINS[m[1]]) f = dishModel(m[1], m[2] === 'plain' ? null : m[2]);
    else if ((m = /^sv_pt_(\w+)$/.exec(id))) f = potionModel(m[1]);
    else if (id === 'sv_sickle') f = sickleModel;
    else if (id === 'sv_can') f = canModel;
    else if ((m = /^sv_crate(\d)$/.exec(id))) f = kitModel('crate', +m[1]);
    else if (id === 'sv_planter') f = kitModel('planter');
    else if (id === 'sv_brewstand') f = kitModel('brew');
    else if (id === 'sv_campfire') f = kitModel('fire');
    if (f) out[id] = f;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ structures
export function disposeGroup(root) {
  root?.traverse?.((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); if (o.material && !o.userData.shared) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.map?.dispose?.(); m.dispose(); } } });
  root?.removeFromParent?.();
}
const shared = (m) => { m.userData.shared = true; return m; };
/** label canvas for a crate front: coloured plate + text */
function makeLabel(text, col) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 40;
  const x = cv.getContext('2d');
  x.fillStyle = col; x.fillRect(0, 0, 128, 40);
  x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 37, 128, 3);
  x.fillStyle = '#101010'; x.font = 'bold 26px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(text || '').toUpperCase().slice(0, 12), 64, 21);
  const tx = new THREE.CanvasTexture(cv);
  tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter;
  return tx;
}
/** Storage crate. Returns { group, colliders: [[cx, cy, cz, hx, hy, hz]] (local), setLabel(text, colour), pulse(open 0..1), top } */
export function createCrate(tier = 1, lab = '', col = '#c9a06a') {
  const T = CRATE_TIERS[tier] || CRATE_TIERS[1];
  const [w, h, d] = T.size;
  const g = new THREE.Group();
  const body = tier === 1 ? 0x8a6238 : tier === 2 ? 0x7d8792 : 0x2c3238;
  const trim = tier === 1 ? 0x5a3e22 : tier === 2 ? 0x4a525a : 0x171b1e;
  add(g, box(w, h - 0.06, d), lam(body), [0, (h - 0.06) / 2, 0]);
  const lid = add(g, box(w + 0.04, 0.07, d + 0.04), lam(trim), [0, h - 0.035, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, box(0.07, h, 0.07), lam(trim), [sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02)]);
  if (tier === 1) for (let i = 1; i < 4; i++) add(g, box(w - 0.02, 0.012, 0.012), lam(0x6a4a2a), [0, (h - 0.06) * i / 4, d / 2 + 0.002]);
  if (tier === 2) { add(g, box(w - 0.1, 0.05, 0.012), lam(0xe8c040), [0, 0.12, d / 2 + 0.003]); for (const x of [-0.42, 0.42]) add(g, box(0.04, 0.04, 0.02), lam(0xc9ced4), [x, h - 0.1, d / 2 + 0.006]); }
  if (tier === 3) {
    add(g, box(0.16, 0.16, 0.02), lam(0x0e1214), [w / 2 - 0.15, h * 0.55, d / 2 + 0.01]);
    add(g, box(0.09, 0.09, 0.012), bas(0x30e0e0), [w / 2 - 0.15, h * 0.55, d / 2 + 0.02]);
    add(g, box(w - 0.1, 0.02, 0.012), bas(0x30e0e0, { transparent: true, opacity: 0.55 }), [0, 0.1, d / 2 + 0.004]);
  }
  const plateMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const plate = add(g, new THREE.PlaneGeometry(0.5, 0.16), plateMat, [-0.06, h * 0.55, d / 2 + 0.012]);
  const api = {
    group: g, top: h, lid, plate,
    colliders: [[0, h / 2, 0, w / 2, h / 2, d / 2]],
    setLabel(text, colour) {
      const old = plateMat.map;
      plateMat.map = makeLabel(text || ' ', colour || '#c9a06a');
      plateMat.color.set(0xffffff);
      plateMat.needsUpdate = true;
      old?.dispose?.();
    },
    open(k) { lid.rotation.x = -k * 0.35; lid.position.y = h - 0.035 + k * 0.05; },
  };
  api.setLabel(lab || (tier === 3 ? 'SECURE' : ''), col);
  return api;
}
/** Planter box with three cells. setCells(list of { stage 0..3, kind, wet }) */
export function createPlanter() {
  const [w, h, d] = PLANTER_SIZE;
  const g = new THREE.Group();
  add(g, box(w, h, d), lam(0x8a6238), [0, h / 2, 0]);
  for (const sx of [-1, 1]) add(g, box(0.06, h + 0.05, d + 0.04), lam(0x5a3e22), [sx * (w / 2 - 0.02), (h + 0.05) / 2, 0]);
  const soilMat = lam(0x3a2a1c);
  const soil = add(g, box(w - 0.14, 0.03, d - 0.1), soilMat, [0, h + 0.005, 0]);
  const cellX = [-0.45, 0, 0.45];
  const cells = cellX.map((x) => { const c = new THREE.Group(); c.position.set(x, h + 0.02, 0); g.add(c); return { g: c, sig: '' }; });
  const wetMat = lam(0x1e150e);
  return {
    group: g, cellX, top: h,
    colliders: [[0, h / 2, 0, w / 2, h / 2, d / 2]],
    setCells(list) {
      list.forEach((c, i) => {
        const cell = cells[i];
        if (!cell) return;
        const sig = c ? `${c.kind}:${c.stage}` : '';
        if (sig === cell.sig) return;
        cell.sig = sig;
        for (const ch of [...cell.g.children]) { cell.g.remove(ch); if (ch.userData.own) ch.geometry.dispose(); }
        if (!c) return;
        if (c.stage === 0) { const m = add(cell.g, sph(0.035, 5, 3), lam(0x6a4a2a), [0, 0.01, 0], null, [1.4, 0.5, 1.4]); m.userData.own = true; return; }
        const m = new THREE.Mesh(plantGeo(c.kind), plantMaterial(c.kind));
        m.scale.setScalar([0, 0.26, 0.55, 0.85][c.stage]);
        cell.g.add(m);
      });
    },
    setWet(on) { soil.material = on ? wetMat : soilMat; },
    dispose() { wetMat.dispose(); soilMat.dispose(); },
  };
}
/** Ship stove: counter + two burners + pot. active() lights the burners */
export function createStove() {
  const g = new THREE.Group();
  const w = 1.2, h = 0.92, d = 0.62;
  add(g, box(w, h - 0.06, d), lam(0xa6adb4), [0, (h - 0.06) / 2, 0]);
  add(g, box(w + 0.03, 0.06, d + 0.03), lam(0x2c3236), [0, h - 0.03, 0]);
  add(g, box(0.5, 0.36, 0.02), lam(0x1a1f22), [-0.24, 0.42, d / 2 + 0.005]);
  add(g, box(0.44, 0.3, 0.012), lam(0x4a6a80, { transparent: true, opacity: 0.8 }), [-0.24, 0.42, d / 2 + 0.014]);
  const knobs = [];
  for (const x of [0.16, 0.3, 0.44]) knobs.push(add(g, cyl(0.03, 0.03, 0.04, 6), lam(0x1a1f22), [x, 0.72, d / 2 + 0.02], [Math.PI / 2, 0, 0]));
  const burnerMat = new THREE.MeshBasicMaterial({ color: 0x3a2a24, fog: false });
  const rings = [];
  for (const x of [-0.28, 0.28]) rings.push(add(g, new THREE.TorusGeometry(0.11, 0.014, 4, 12), burnerMat, [x, h + 0.008, 0.02], [Math.PI / 2, 0, 0]));
  add(g, cyl(0.13, 0.12, 0.14, 9), lam(0x6d7379), [-0.28, h + 0.08, 0.02]);
  add(g, cyl(0.135, 0.135, 0.02, 9), lam(0x585e64), [-0.28, h + 0.16, 0.02]);
  add(g, sph(0.02, 4, 3), lam(0x2a2e32), [-0.28, h + 0.18, 0.02]);
  add(g, box(0.02, 0.02, 0.12), lam(0x2a2e32), [-0.28 + 0.16, h + 0.1, 0.02], [0, 0.4, 0]);
  add(g, box(w, 0.26, 0.04), lam(0x7d848b), [0, h + 0.56, -d / 2 + 0.03]);   // splash back
  const api = {
    group: g, colliders: [[0, h / 2, 0, w / 2, h / 2, d / 2]], top: h,
    setActive(on) { burnerMat.color.set(on ? 0xff7a2a : 0x3a2a24); },
    dispose() { burnerMat.dispose(); },
  };
  return api;
}
/** Brewing stand: small table with flasks and an alembic. setJob(color | null, ready) */
export function createBrewStand() {
  const [w, h, d] = STAND_SIZE;
  const g = new THREE.Group();
  add(g, box(w, 0.82, d), lam(0x6a4a2a), [0, 0.41, 0]);
  add(g, box(w + 0.04, 0.05, d + 0.04), lam(0x4a321c), [0, 0.845, 0]);
  add(g, box(w - 0.1, 0.5, 0.04), lam(0x5a3e22), [0, 0.6, -d / 2 + 0.06]);
  const liq = [];
  for (const [x, c] of [[-0.28, 0x7dffb0], [-0.1, 0xb0a0ff], [0.08, 0xff9a5a]]) {
    add(g, sph(0.07, 8, 6), lam(0xdfe9ee, { transparent: true, opacity: 0.78 }), [x, 0.95, 0.06]);
    const m = new THREE.MeshBasicMaterial({ color: c, fog: false, transparent: true, opacity: 0.85 });
    add(g, sph(0.056, 8, 6), m, [x, 0.94, 0.06], null, [1, 0.75, 1]);
    add(g, cyl(0.02, 0.03, 0.06, 6), lam(0xdfe9ee, { transparent: true, opacity: 0.78 }), [x, 1.03, 0.06]);
    liq.push(m);
  }
  add(g, sph(0.11, 8, 6), lam(0xc07a3a), [0.3, 0.97, 0.02]);
  add(g, cyl(0.03, 0.05, 0.1, 6), lam(0xc07a3a), [0.3, 1.09, 0.02]);
  add(g, cyl(0.012, 0.012, 0.24, 5), lam(0xc07a3a), [0.25, 1.12, 0.1], [0, 0, 1.2]);
  const flame = add(g, cone(0.02, 0.06, 4), bas(0xffb040), [0.3, 0.9, 0.02]);
  flame.visible = false;
  return {
    group: g, colliders: [[0, 0.42, 0, w / 2, 0.42, d / 2]], top: 0.85,
    setJob(col, ready) {
      const c = col ? new THREE.Color(col) : null;
      liq[1].color.set(c || 0xb0a0ff);
      flame.visible = !!col && !ready;
      liq[2].color.set(ready && c ? c : 0xff9a5a);
    },
    tick(t) { if (flame.visible) flame.scale.set(1, 0.8 + 0.4 * Math.sin(t * 13), 1); },
    dispose() { for (const m of liq) m.dispose(); },
  };
}
/** Campfire: stone ring, logs and flames. setBurn(k 0..1) scales the flames; tick(t) flickers them. */
export function createCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; add(g, sph(0.09, 5, 4), lam(i % 2 ? 0x7a7670 : 0x66625c), [Math.cos(a) * 0.38, 0.06, Math.sin(a) * 0.38], null, [1, 0.7, 1]); }
  for (const [r, y] of [[0.2, 0.08], [1.4, 0.13], [2.7, 0.08]]) add(g, cyl(0.045, 0.05, 0.6, 6), lam(0x5a3e22), [0, y, 0], [0.15, r, Math.PI / 2]);
  add(g, cyl(0.27, 0.3, 0.02, 8), bas(0x8a2a10), [0, 0.03, 0]);
  const fl = new THREE.Group();
  const mats = [bas(0xff5a1a), bas(0xff9a2a), bas(0xffd860)];
  const cones = [add(fl, cone(0.17, 0.5, 6), mats[0], [0, 0.32, 0]), add(fl, cone(0.11, 0.4, 5), mats[1], [0.06, 0.28, 0.03]), add(fl, cone(0.07, 0.3, 5), mats[2], [-0.03, 0.22, -0.04])];
  g.add(fl);
  let burn = 1;
  return {
    group: g, colliders: [], top: 0.3,
    setBurn(k) { burn = Math.max(0, Math.min(1, k)); fl.visible = burn > 0.02; },
    tick(t) {
      const b = 0.35 + 0.65 * burn;
      cones.forEach((c, i) => c.scale.set(b * (1 + 0.1 * Math.sin(t * 9 + i)), b * (0.85 + 0.25 * Math.sin(t * 13 + i * 2)), b * (1 + 0.1 * Math.cos(t * 7 + i))));
    },
    dispose() { for (const m of mats) m.dispose(); },
  };
}
/** Translucent placement ghost: a box of size [w, h, d] (origin on the floor). setOk(bool). */
export function createGhost() {
  const okMat = shared(new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.32, depthWrite: false, fog: false }));
  const badMat = shared(new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.32, depthWrite: false, fog: false }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), okMat);
  m.frustumCulled = false; m.renderOrder = 5;
  return {
    mesh: m,
    setSize(w, h, d) { m.scale.set(w, h, d); m.position.y = h / 2; },
    setOk(ok) { m.material = ok ? okMat : badMat; },
    dispose() { m.geometry.dispose(); okMat.dispose(); badMat.dispose(); m.removeFromParent(); },
  };
}
export const SV_PLANTER_CELLS = PLANTER_CELLS;
