// Procedural low-poly models for the wave-1 inventory gear (bags, armor, trinkets). Registered into the mod item-model
// map (window.__kefalMods.itemModels), which WorldItem.makeVisual and the icon renderer (ui/icons.js) both consult,
// so no edit of models/items.js is needed. Materials come from the shared cached texture/material helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const HP = Math.PI / 2;
const L = (t, c) => getMaterial(t, c);
const B = (c) => getBasicMaterial(null, c);

/** Tiny builder: collects transformed geometries per material and merges them (2-5 draw calls per model). */
class Build {
  constructor() { this.parts = new Map(); }
  add(mat, geo, p = [0, 0, 0], r = null, s = null) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
    const sc = s == null ? new THREE.Vector3(1, 1, 1) : typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]);
    m.compose(new THREE.Vector3(p[0], p[1], p[2]), q, sc);
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  group(name) {
    const root = new THREE.Group();
    root.name = name;
    for (const [mat, list] of this.parts) {
      const geo = list.length > 1 ? mergeGeometries(list, false) : list[0];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      root.add(mesh);
    }
    return root;
  }
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, ws = 10, hs = 7) => new THREE.SphereGeometry(r, ws, hs);
const tor = (R, r, arc = Math.PI * 2, ts = 14) => new THREE.TorusGeometry(R, r, 5, ts, arc);

// ------------------------------------------------------------------ bags
function fieldPack() {
  const k = new Build();
  const cloth = L('fabric', 0x4d5a36), dark = L('fabric', 0x2c3320), strap = L('fabric', 0x1c1c1c), metal = L('metal', 0xb8b8b0);
  k.add(cloth, box(0.34, 0.44, 0.2), [0, 0, 0]);
  k.add(cloth, cyl(0.1, 0.1, 0.34, 10), [0, 0.22, 0], [0, 0, HP], [1, 1, 1]);
  k.add(dark, box(0.26, 0.2, 0.08), [0, -0.08, 0.13]);
  k.add(dark, box(0.28, 0.035, 0.1), [0, 0.03, 0.13]);
  k.add(strap, box(0.05, 0.46, 0.03), [-0.1, 0, -0.115]);
  k.add(strap, box(0.05, 0.46, 0.03), [0.1, 0, -0.115]);
  k.add(strap, box(0.04, 0.12, 0.03), [-0.11, 0.2, 0.105]);
  k.add(strap, box(0.04, 0.12, 0.03), [0.11, 0.2, 0.105]);
  k.add(metal, box(0.05, 0.03, 0.012), [-0.11, 0.13, 0.12]);
  k.add(metal, box(0.05, 0.03, 0.012), [0.11, 0.13, 0.12]);
  k.add(B(0xff8a3d), box(0.08, 0.035, 0.004), [0, -0.1, 0.172]);
  return k.group('gear_fieldpack');
}
function hauler() {
  const k = new Build();
  const frame = L('metal', 0x9aa0a8), pack = L('fabric', 0x7a4a24), roll = L('fabric', 0x3a5a7a), strap = L('fabric', 0x1a1a1a);
  for (const sx of [-1, 1]) {
    k.add(frame, box(0.03, 0.72, 0.03), [sx * 0.19, 0, -0.14]);
    k.add(frame, box(0.03, 0.03, 0.2), [sx * 0.19, -0.35, -0.05]);
  }
  for (const y of [-0.3, 0, 0.3]) k.add(frame, box(0.4, 0.025, 0.025), [0, y, -0.14]);
  k.add(pack, box(0.34, 0.46, 0.22), [0, -0.06, 0]);
  k.add(pack, box(0.28, 0.14, 0.06), [0, -0.12, 0.14]);
  k.add(roll, cyl(0.075, 0.075, 0.42, 10), [0, 0.26, 0.0], [0, 0, HP]);
  k.add(strap, box(0.44, 0.02, 0.17), [0.0, 0.26, 0.0]);
  k.add(strap, box(0.05, 0.36, 0.02), [-0.1, -0.06, 0.115]);
  k.add(strap, box(0.05, 0.36, 0.02), [0.1, -0.06, 0.115]);
  k.add(B(0xffd23f), box(0.06, 0.06, 0.004), [0.12, -0.34, 0.112]);
  return k.group('gear_hauler');
}
function voidSatchel() {
  const k = new Build();
  const cloth = L('fabric', 0x1c0f2a), trim = L('metal', 0x3a2a4e), glow = B(0xff3b8a), glow2 = B(0x9a5cff);
  k.add(cloth, box(0.3, 0.22, 0.1), [0, 0, 0]);
  k.add(cloth, box(0.31, 0.12, 0.11), [0, 0.07, 0.012], [-0.25, 0, 0]);
  k.add(trim, tor(0.16, 0.012, Math.PI, 12), [0, 0.1, 0], [0, 0, 0]);
  k.add(glow, tor(0.045, 0.008, Math.PI * 2, 14), [0, -0.01, 0.052]);
  k.add(glow2, sph(0.022, 8, 6), [0, -0.01, 0.055]);
  k.add(glow, box(0.2, 0.006, 0.004), [0, -0.09, 0.052]);
  k.add(trim, box(0.03, 0.05, 0.02), [0, 0.03, 0.07]);
  return k.group('gear_void');
}

// ------------------------------------------------------------------ armor
function hoodie() {
  const k = new Build();
  const c = L('fabric', 0x5a4a7a), c2 = L('fabric', 0x463a60), cord = L('fabric', 0xe8e0d0);
  k.add(c, box(0.42, 0.08, 0.32), [0, 0, 0]);
  k.add(c2, box(0.4, 0.05, 0.1), [0, 0.035, 0.12]);
  k.add(c, sph(0.13, 10, 5), [0, 0.03, -0.14], null, [1.1, 0.45, 0.8]);
  k.add(c2, box(0.18, 0.02, 0.1), [0, 0.045, 0.02]);
  k.add(cord, cyl(0.006, 0.006, 0.12, 5), [-0.04, 0.05, -0.02], [HP, 0, 0]);
  k.add(cord, cyl(0.006, 0.006, 0.12, 5), [0.04, 0.05, -0.02], [HP, 0, 0]);
  k.add(B(0xff8a3d), box(0.08, 0.004, 0.05), [0.1, 0.042, 0.06]);
  return k.group('gear_hoodie');
}
function vest(col, plate, name, heavy) {
  const k = new Build();
  const c = L('fabric', col), p = L('metal', plate), strap = L('fabric', 0x151515);
  k.add(c, box(0.4, 0.5, 0.16), [0, 0, 0]);
  k.add(c, box(0.13, 0.14, 0.16), [-0.135, 0.3, 0]);
  k.add(c, box(0.13, 0.14, 0.16), [0.135, 0.3, 0]);
  k.add(p, box(0.3, 0.3, 0.04), [0, 0.02, 0.09]);
  if (heavy) {
    k.add(p, box(0.12, 0.08, 0.05), [-0.13, 0.3, 0.06]);
    k.add(p, box(0.12, 0.08, 0.05), [0.13, 0.3, 0.06]);
    k.add(c, box(0.44, 0.06, 0.18), [0, -0.24, 0]);
    k.add(p, cyl(0.14, 0.15, 0.08, 10), [0, 0.38, -0.02]);
  }
  for (const y of [-0.12, 0.0, 0.12]) k.add(strap, box(0.42, 0.03, 0.17), [0, y - 0.05, 0]);
  k.add(B(heavy ? 0xffd23f : 0x3d8bff), box(0.16, 0.05, 0.004), [0, 0.12, 0.112]);
  return k.group(name);
}

// ------------------------------------------------------------------ trinkets
function dongle() {
  const k = new Build();
  k.add(L('plastic', 0x1f8a3a), box(0.05, 0.022, 0.1), [0, 0, 0.01]);
  k.add(L('metal', 0xd8d8d8), box(0.034, 0.012, 0.045), [0, 0, -0.06]);
  k.add(L('plastic', 0x101010), box(0.02, 0.004, 0.02), [0, 0.001, -0.07]);
  k.add(B(0x7dff7d), box(0.01, 0.004, 0.01), [0.012, 0.013, 0.045]);
  // four-leaf clover sticker
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; k.add(B(0x7dff4d), cyl(0.009, 0.009, 0.003, 6), [Math.cos(a) * 0.009, 0.0125, 0.012 + Math.sin(a) * 0.009]); }
  k.add(L('metal', 0xc0c0c0), tor(0.014, 0.003, Math.PI * 2, 10), [0, 0, 0.07], [HP, 0, 0]);
  return k.group('gear_dongle');
}
function charm() {
  const k = new Build();
  k.add(L('metal', 0xc8c8c8), cyl(0.028, 0.028, 0.09, 12), [0, -0.02, 0]);
  k.add(L('paint', 0x39ff6a), cyl(0.0285, 0.0285, 0.045, 12), [0, -0.02, 0]);
  k.add(L('paint', 0x101010), cyl(0.029, 0.029, 0.012, 12), [0, -0.02, 0]);
  k.add(L('metal', 0xe0e0e0), cyl(0.022, 0.028, 0.008, 12), [0, 0.029, 0]);
  k.add(L('metal', 0xb0b0b0), tor(0.012, 0.0025, Math.PI * 2, 10), [0, 0.04, 0], [0, HP, 0]);
  k.add(L('metal', 0xd0d0d0), tor(0.024, 0.003, Math.PI * 2, 14), [0, 0.074, 0], [0, 0, 0]);
  return k.group('gear_charm');
}
function amulet() {
  const k = new Build();
  const gold = L('metal', 0xd8b04a), glow = B(0x8fe8ff);
  k.add(gold, cyl(0.03, 0.03, 0.008, 12), [0, -0.04, 0], [HP, 0, 0]);
  k.add(glow, sph(0.011, 8, 6), [0, -0.052, 0.004]);
  for (let i = 1; i <= 3; i++) k.add(i === 3 ? glow : gold, tor(0.012 + i * 0.011, 0.0035, Math.PI * 0.5, 8), [0, -0.052, 0.004], [0, 0, Math.PI * 0.25]);
  k.add(gold, tor(0.075, 0.0025, Math.PI * 2, 18), [0, 0.04, 0], [0, 0, 0]);
  return k.group('gear_amulet');
}

export const GEAR_MODELS = {
  bag_fieldpack: fieldPack,
  bag_hauler: hauler,
  bag_void: voidSatchel,
  arm_hoodie: hoodie,
  arm_riot: () => vest(0x2a3448, 0x5a6478, 'gear_riot', false),
  arm_kevlar: () => vest(0x3a3322, 0x6a6048, 'gear_kevlar', true),
  trk_dongle: dongle,
  trk_charm: charm,
  trk_amulet: amulet,
};

/** Register every gear model with the mod item-model map (idempotent). Returns the number registered. */
export function registerGearModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.itemModels) return 0;
  let n = 0;
  for (const [id, fn] of Object.entries(GEAR_MODELS)) if (!mm.itemModels.has(id)) { mm.itemModels.set(id, () => fn()); n++; }
  return n;
}
