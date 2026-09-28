// Procedural low-poly models for the playable instruments (guitar_acoustic, guitar_electric, keytar, drumpad).
// Origin = where the hand grips (neck / centre); +Y is the item's "up" (guitar necks point up), the front face looks +Z.
// Each model merges to 4-6 meshes. Registered into the mod item-model map (window.__kefalMods.itemModels), which the world
// item visual and the inventory icons both read, and also used for the mesh strapped on a playing avatar (third person).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const HP = Math.PI / 2;
const L = (c) => getMaterial(null, c);
const B = (c) => getBasicMaterial(null, c);

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
      const mesh = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      root.add(mesh);
    }
    return root;
  }
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

const CHROME = 0xcfd2d6, STRING = 0xe8e4d4;

/** six strings + frets along a neck (+Y), shared by both guitars */
function neckDetails(k, y0, y1, z, width) {
  for (let i = 0; i < 6; i++) k.add(L(STRING), box(0.0022, y1 - y0, 0.002), [-width / 2 + 0.006 + i * ((width - 0.012) / 5), (y0 + y1) / 2, z]);
  for (let i = 0; i < 7; i++) k.add(L(CHROME), box(width, 0.004, 0.003), [0, -0.02 + i * 0.065, z - 0.001]);
}

function acousticGuitar() {
  const k = new Build();
  const top = 0xd39a4a, side = 0x9c6128, neck = 0x5a3a1e, board = 0x191411;
  k.add(L(side), cyl(0.178, 0.178, 0.1, 14), [0, -0.37, 0], [HP, 0, 0]);
  k.add(L(side), cyl(0.132, 0.132, 0.1, 14), [0, -0.165, 0], [HP, 0, 0]);
  k.add(L(top), cyl(0.172, 0.172, 0.006, 14), [0, -0.37, 0.05], [HP, 0, 0]);
  k.add(L(top), cyl(0.126, 0.126, 0.006, 14), [0, -0.165, 0.05], [HP, 0, 0]);
  k.add(L(0x0b0806), cyl(0.048, 0.048, 0.004, 12), [0, -0.255, 0.054], [HP, 0, 0]);
  k.add(L(0xe9d9a8), cyl(0.056, 0.056, 0.003, 12), [0, -0.255, 0.053], [HP, 0, 0]);
  k.add(L(board), box(0.11, 0.022, 0.014), [0, -0.46, 0.056]);
  k.add(L(neck), box(0.05, 0.56, 0.032), [0, 0.18, -0.006]);
  k.add(L(board), box(0.046, 0.5, 0.008), [0, 0.2, 0.014]);
  k.add(L(neck), box(0.075, 0.12, 0.024), [0, 0.505, -0.006], [0, 0, 0.0]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.add(L(CHROME), cyl(0.008, 0.008, 0.02, 6), [s * 0.046, 0.47 + i * 0.035, -0.006], [0, 0, HP]);
  neckDetails(k, -0.46, 0.45, 0.02, 0.046);
  return k.group('guitar_acoustic');
}

function electricGuitar() {
  const k = new Build();
  const body = 0xc2232c, trim = 0xf2ecdc, neck = 0xd8b478, board = 0x231b16, dark = 0x101012;
  k.add(L(body), cyl(0.165, 0.165, 0.045, 14), [0, -0.38, 0], [HP, 0, 0]);
  k.add(L(body), cyl(0.125, 0.125, 0.045, 14), [0, -0.19, 0], [HP, 0, 0]);
  k.add(L(body), box(0.075, 0.2, 0.045), [-0.1, -0.07, 0], [0, 0, 0.32]);
  k.add(L(body), box(0.075, 0.2, 0.045), [0.1, -0.09, 0], [0, 0, -0.2]);
  k.add(L(trim), box(0.2, 0.2, 0.006), [0.005, -0.33, 0.026]);
  for (const y of [-0.27, -0.36]) { k.add(L(dark), box(0.13, 0.03, 0.014), [0, y, 0.03]); }
  k.add(L(CHROME), box(0.11, 0.02, 0.014), [0, -0.46, 0.03]);
  for (const [x, y] of [[0.085, -0.43], [0.055, -0.48]]) k.add(L(CHROME), cyl(0.015, 0.015, 0.02, 8), [x, y, 0.036], [HP, 0, 0]);
  k.add(L(neck), box(0.046, 0.56, 0.03), [0, 0.2, -0.004]);
  k.add(L(board), box(0.042, 0.5, 0.008), [0, 0.22, 0.014]);
  k.add(L(body), box(0.07, 0.13, 0.026), [0, 0.53, -0.004]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.add(L(CHROME), cyl(0.007, 0.007, 0.018, 6), [s * 0.042, 0.5 + i * 0.035, -0.004], [0, 0, HP]);
  neckDetails(k, -0.46, 0.47, 0.02, 0.042);
  k.add(B(0xff8a3d), box(0.05, 0.008, 0.004), [0, -0.235, 0.032]);   // glowing "TFG" strip
  return k.group('guitar_electric');
}

function keytar() {
  const k = new Build();
  const shell = 0x1b1c22, white = 0xf1eee4, black = 0x0b0b0d, accent = 0x2ec8d8;
  k.add(L(shell), box(0.66, 0.075, 0.22), [-0.06, 0, 0]);
  k.add(L(shell), box(0.2, 0.075, 0.22), [0.37, 0, 0]);
  k.add(L(shell), box(0.36, 0.045, 0.06), [0.62, 0.005, 0], [0, 0, 0.0]);      // neck
  k.add(L(0x5a3a1e), box(0.34, 0.012, 0.04), [0.62, 0.032, 0]);
  k.add(L(shell), box(0.08, 0.09, 0.09), [0.82, 0.01, 0]);                       // headstock
  k.add(L(white), box(0.5, 0.012, 0.15), [-0.14, 0.043, 0.0]);
  for (let i = 0; i < 10; i++) k.add(L(0x88857c), box(0.0018, 0.013, 0.15), [-0.14 - 0.25 + (i + 1) * 0.05, 0.044, 0]);
  for (const i of [0, 1, 3, 4, 5, 7, 8]) k.add(L(black), box(0.03, 0.018, 0.09), [-0.14 - 0.25 + (i + 1) * 0.05, 0.052, -0.03]);
  for (let i = 0; i < 4; i++) k.add(L(CHROME), cyl(0.014, 0.014, 0.02, 8), [0.32 + i * 0.045, 0.048, -0.05]);
  for (let i = 0; i < 3; i++) k.add(B(i === 1 ? 0xff3b6b : accent), box(0.03, 0.006, 0.02), [0.33 + i * 0.05, 0.041, 0.05]);
  k.add(L(CHROME), cyl(0.012, 0.012, 0.03, 8), [-0.36, -0.045, 0.08], [HP, 0, 0]);   // strap pin
  const g = k.group('keytar');
  g.scale.setScalar(0.8);                                                             // ~1 m long
  return g;
}

const PAD_COLORS = [0xe0323a, 0xffc93a, 0x4bd0e8, 0x5ad26a];   // 4 shared materials: keeps the model at ~8 draw calls
function drumPad() {
  const k = new Build();
  k.add(L(0x24262b), box(0.36, 0.06, 0.3), [0, 0, 0]);
  k.add(L(0x14151a), box(0.34, 0.012, 0.28), [0, 0.034, 0]);
  for (let i = 0; i < 8; i++) {
    const x = -0.12 + (i % 4) * 0.08, z = i < 4 ? 0.055 : -0.06;
    k.add(B(PAD_COLORS[i % 4]), cyl(0.032, 0.032, 0.014, 10), [x, 0.046, z]);
    k.add(L(0x14151a), cyl(0.036, 0.036, 0.012, 10), [x, 0.041, z]);
  }
  k.add(L(CHROME), cyl(0.012, 0.012, 0.03, 8), [-0.16, 0.04, -0.12]);
  k.add(L(CHROME), cyl(0.012, 0.012, 0.03, 8), [0.16, 0.04, -0.12]);
  k.add(B(0x39ff8a), box(0.09, 0.004, 0.02), [0.09, 0.041, -0.12]);   // tiny display
  return k.group('drumpad');
}

export const INSTRUMENT_MODELS = { guitar_acoustic: acousticGuitar, guitar_electric: electricGuitar, keytar, drumpad: drumPad };

/**
 * How the instrument sits on a playing avatar (parent = the avatar's torso pivot; avatar faces +Z, its left arm is +X).
 * Guitars hang on a strap with the neck pointing to the avatar's left; the keytar lies across the waist; the pad sits on the knees.
 */
export const INSTRUMENT_POSE = {
  guitar_acoustic: { pos: [0.25, 0.2, 0.2], rot: [0, 0, -1.2], scale: 0.9 },
  guitar_electric: { pos: [0.25, 0.2, 0.2], rot: [0, 0, -1.2], scale: 0.9 },
  keytar: { pos: [0.02, 0.1, 0.27], rot: [0.12, 0, 0.1], scale: 1.05 },
  drumpad: { pos: [0, -0.02, 0.4], rot: [0.5, 0, 0], scale: 1.05 },
};

/** a fresh mesh of the instrument (for the avatar). Caller owns disposal of nothing: geometry is per-instance, materials are shared. */
export function createInstrumentMesh(itemId) {
  const fn = INSTRUMENT_MODELS[itemId];
  return fn ? fn() : new THREE.Group();
}
export function disposeInstrumentMesh(obj) {
  obj?.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose(); });
  obj?.removeFromParent?.();
}

/** Register every instrument model with the mod item-model map (idempotent). Returns how many were added. */
export function registerInstrumentModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.itemModels) return 0;
  let n = 0;
  for (const [id, fn] of Object.entries(INSTRUMENT_MODELS)) if (!mm.itemModels.has(id)) { mm.itemModels.set(id, () => fn()); n++; }
  return n;
}
