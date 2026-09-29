// Ship2 visuals (wave 4): hull damage spots (dent / spark / leak / breach), planter plants, roof mount plates, tool + fruit item models.
// Everything is a few merged meshes with vertex colours (glowing parts are separate unlit meshes); no THREE lights are created here.
import * as THREE from 'three';
import { bakeParts } from '../world/shipdeco.js';

const DARK = [0.16, 0.17, 0.19], METAL = [0.46, 0.48, 0.5], LIGHT = [0.62, 0.64, 0.66], SOOT = [0.06, 0.06, 0.07];
const ORANGE = [1.0, 0.55, 0.14], YELLOW = [1.0, 0.85, 0.3], TEAL = [0.35, 0.95, 0.9], RED = [1.0, 0.25, 0.1];
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h, s = 8) => new THREE.CylinderGeometry(r, r, h, s);

let mats = null;
function materials() {
  if (!mats) mats = { lit: new THREE.MeshLambertMaterial({ vertexColors: true }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }), glowSoft: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }) };
  return mats;
}
const geoCache = new Map();
/** {lit, glow} geometries per kind, local +z = away from the hull */
function spotGeos(kind) {
  if (geoCache.has(kind)) return geoCache.get(kind);
  const lit = [], glow = [];
  const PI = Math.PI;
  if (kind === 'dent') {
    lit.push({ g: cyl(0.42, 0.03, 12), p: [0, 0, 0.015], r: [PI / 2, 0, 0], s: [1, 1, 0.75], c: DARK });
    for (let i = 0; i < 3; i++) lit.push({ g: box(0.62, 0.03, 0.02), p: [0, 0, 0.035], r: [0, 0, (i * PI) / 3 + 0.3], c: SOOT });
    lit.push({ g: box(0.2, 0.14, 0.06), p: [0.14, 0.08, 0.04], r: [0.2, 0.3, 0.5], c: METAL }, { g: box(0.16, 0.1, 0.05), p: [-0.15, -0.1, 0.035], r: [0.1, -0.2, 0.9], c: LIGHT });
  } else if (kind === 'spark') {
    lit.push({ g: box(0.72, 0.52, 0.03), p: [0, -0.02, 0.05], r: [0.55, 0, 0.08], c: DARK });                 // panel hanging open at the top hinge
    lit.push({ g: box(0.78, 0.58, 0.02), p: [0, 0, 0.012], c: SOOT });                                       // the hole behind it
    for (const [x, y, a] of [[-0.18, 0.05, 0.4], [0.12, -0.05, -0.5], [0.24, 0.12, 0.9]]) lit.push({ g: cyl(0.012, 0.36, 4), p: [x, y, 0.08], r: [0, 0, a], c: YELLOW });   // loose wires
    for (const [x, y] of [[-0.12, 0.0], [0.05, 0.08], [0.2, -0.04], [-0.02, -0.1], [0.14, 0.14]]) glow.push({ g: box(0.06, 0.06, 0.06), p: [x, y, 0.1], c: ORANGE });
  } else if (kind === 'leak') {
    lit.push({ g: cyl(0.075, 0.55, 8), p: [0, 0.05, 0.1], r: [0, 0, PI / 2], c: METAL }, { g: cyl(0.11, 0.06, 8), p: [-0.12, 0.05, 0.1], r: [0, 0, PI / 2], c: LIGHT }, { g: cyl(0.11, 0.06, 8), p: [0.15, 0.05, 0.1], r: [0, 0, PI / 2], c: LIGHT });
    lit.push({ g: cyl(0.3, 0.02, 10), p: [0.02, -0.3, 0.012], r: [PI / 2, 0, 0], s: [0.8, 1, 1.3], c: [0.1, 0.25, 0.27] });   // wet streak below
    glow.push({ g: box(0.05, 0.11, 0.04), p: [0.02, -0.06, 0.12], c: TEAL }, { g: box(0.04, 0.09, 0.04), p: [0.06, -0.18, 0.12], c: TEAL });
  } else {   // breach
    lit.push({ g: cyl(0.5, 0.03, 14), p: [0, 0, 0.02], r: [PI / 2, 0, 0], c: SOOT });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; lit.push({ g: box(0.08, 0.2 + (i % 3) * 0.06, 0.07), p: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.06], r: [0, 0, a + PI / 2 + (i % 2 ? 0.25 : -0.25)], c: i % 2 ? DARK : METAL }); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2 + 0.2; glow.push({ g: box(0.07, 0.07, 0.05), p: [Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.05], c: i % 2 ? ORANGE : RED }); }
  }
  const out = { lit: bakeParts(lit), glow: glow.length ? bakeParts(glow) : null };
  geoCache.set(kind, out);
  return out;
}
/** A damage spot at a hull slot: group.position = surface point, +z = slot normal. update(dt, t) animates the glow. */
export function createSpotModel(kind, slot, phase = 0) {
  const m = materials(), g = spotGeos(kind);
  const root = new THREE.Group(); root.name = 'ship2_spot_' + kind;
  root.add(new THREE.Mesh(g.lit, m.lit));
  let glow = null;
  if (g.glow) { glow = new THREE.Mesh(g.glow, m.glow); root.add(glow); }
  root.position.set(slot.x, slot.y, slot.z);
  const n = new THREE.Vector3(slot.n[0], slot.n[1], slot.n[2]).normalize();
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const fr = (v) => v - Math.floor(v);
  return {
    root, kind, glow,
    update(dt, t) {
      if (!glow) return;
      const p = t + phase * 10;
      if (kind === 'spark') { glow.visible = fr(p * 6.3 + Math.sin(p * 2.1)) > 0.45; glow.scale.setScalar(0.8 + 0.5 * Math.abs(Math.sin(p * 13))); }
      else if (kind === 'leak') { glow.position.y = -fr(p * 0.9) * 0.28; glow.scale.set(1, 0.8 + 0.5 * fr(p * 0.9), 1); glow.visible = true; }
      else glow.scale.setScalar(1 + 0.06 * Math.sin(p * 5));
    },
    dispose() { root.removeFromParent(); },
  };
}
export function disposeSpotModels() { for (const v of geoCache.values()) { v.lit.dispose(); v.glow?.dispose(); } geoCache.clear(); if (mats) { for (const k of Object.keys(mats)) mats[k].dispose(); mats = null; } }

// ---------------------------------------------------------------------------------------------- planter plant (origin = soil surface)
const GREENS = [[0.24, 0.62, 0.26], [0.3, 0.72, 0.3], [0.2, 0.52, 0.24], [0.36, 0.78, 0.32]];
const plantCache = new Map();
export function createPlantModel(stage) {
  const m = materials(), root = new THREE.Group(); root.name = 'ship2_plant';
  if (stage < 1) return { root, dispose() { root.removeFromParent(); } };
  let geo = plantCache.get(stage);
  if (!geo) {
    const parts = [];
    const leaf = (x, y, z, ry, rz, s, c) => parts.push({ g: box(0.16 * s, 0.015, 0.08 * s), p: [x, y, z], r: [0, ry, rz], c });
    if (stage === 1) { parts.push({ g: cyl(0.012, 0.1, 5), p: [0, 0.05, 0], c: GREENS[0] }); leaf(0.06, 0.1, 0, 0, 0.5, 1, GREENS[1]); leaf(-0.06, 0.1, 0, 0, -0.5, 1, GREENS[1]); }
    else if (stage === 2) {
      parts.push({ g: cyl(0.018, 0.38, 5), p: [0, 0.19, 0], c: [0.4, 0.3, 0.18] });
      for (let i = 0; i < 6; i++) { const a = i * 1.05, y = 0.16 + i * 0.05; leaf(Math.cos(a) * 0.1, y, Math.sin(a) * 0.1, -a, 0.4, 1.3, GREENS[i % 4]); }
    } else {
      parts.push({ g: cyl(0.05, 0.75, 6), p: [0, 0.375, 0], c: [0.42, 0.3, 0.18] }, { g: cyl(0.03, 0.3, 5), p: [0.08, 0.7, 0.02], r: [0, 0, -0.6], c: [0.42, 0.3, 0.18] });
      const crown = [[0, 1.0, 0, 0.26], [0.18, 0.88, 0.06, 0.2], [-0.17, 0.9, -0.06, 0.2], [0.05, 0.86, -0.18, 0.18], [-0.04, 0.84, 0.2, 0.18], [0.02, 1.17, 0.02, 0.16]];
      crown.forEach(([x, y, z, r], i) => parts.push({ g: new THREE.IcosahedronGeometry(r, 0), p: [x, y, z], c: GREENS[i % 4] }));
      if (stage >= 4) for (const [x, y, z] of [[0.22, 0.98, 0.1], [-0.2, 0.86, 0.12], [0.1, 0.8, -0.2], [-0.12, 1.05, -0.16], [0.02, 0.92, 0.26], [0.26, 0.82, -0.06]]) parts.push({ g: new THREE.IcosahedronGeometry(0.055, 0), p: [x, y, z], c: [0.9, 0.2, 0.14] });
    }
    geo = bakeParts(parts); plantCache.set(stage, geo);
  }
  root.add(new THREE.Mesh(geo, m.lit));
  return { root, dispose() { root.removeFromParent(); } };
}

// ---------------------------------------------------------------------------------------------- roof mount plate
export function createMountModel() {
  const root = new THREE.Group(); root.name = 'ship2_mount';
  const parts = [{ g: cyl(0.55, 0.06, 16), p: [0, 0.03, 0], c: DARK }, { g: cyl(0.42, 0.02, 16), p: [0, 0.07, 0], c: METAL }];
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; parts.push({ g: cyl(0.04, 0.05, 6), p: [Math.cos(a) * 0.48, 0.08, Math.sin(a) * 0.48], c: LIGHT }); }
  root.add(new THREE.Mesh(bakeParts(parts), materials().lit));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb030 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 20), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.075; root.add(ring);
  return { root, ring, setState(s) { ringMat.color.setHex(s === 'on' ? 0x40ff80 : s === 'off' ? 0xff4a30 : s === 'dmg' ? 0xff8a20 : 0xffb030); }, dispose() { root.removeFromParent(); ring.geometry.dispose(); ringMat.dispose(); } };
}

// ---------------------------------------------------------------------------------------------- item models (world items / hotbar / icons)
export function createWrenchModel() {
  const g = new THREE.Group();
  const geo = bakeParts([
    { g: box(0.05, 0.05, 0.42), p: [0, 0, 0], c: [0.55, 0.57, 0.6] },
    { g: box(0.14, 0.05, 0.1), p: [0, 0, 0.24], c: [0.62, 0.64, 0.68] }, { g: box(0.045, 0.05, 0.1), p: [0.055, 0, 0.3], c: [0.62, 0.64, 0.68] }, { g: box(0.045, 0.05, 0.1), p: [-0.055, 0, 0.3], c: [0.62, 0.64, 0.68] },
    { g: cyl(0.045, 0.05, 8), p: [0, 0, -0.22], r: [Math.PI / 2, 0, 0], c: [0.5, 0.52, 0.55] },
    { g: box(0.052, 0.052, 0.14), p: [0, 0, -0.1], c: [0.9, 0.5, 0.12] },
  ]);
  g.add(new THREE.Mesh(geo, materials().lit)); g.name = 's2_wrench'; return g;
}
export function createTorchModel() {
  const g = new THREE.Group();
  const geo = bakeParts([
    { g: cyl(0.045, 0.24, 8), p: [0, 0, 0], r: [Math.PI / 2, 0, 0], c: [0.85, 0.35, 0.12] },
    { g: cyl(0.02, 0.2, 6), p: [0, 0, 0.2], r: [Math.PI / 2, 0, 0], c: [0.55, 0.57, 0.6] },
    { g: cyl(0.03, 0.05, 6), p: [0, -0.06, -0.06], c: [0.2, 0.2, 0.22] },
    { g: box(0.03, 0.1, 0.04), p: [0, -0.07, 0.02], c: [0.25, 0.25, 0.28] },
  ]);
  g.add(new THREE.Mesh(geo, materials().lit));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), new THREE.MeshBasicMaterial({ color: 0x8fe0ff })); tip.position.set(0, 0, 0.31); g.add(tip);
  g.name = 's2_torch'; return g;
}
export function createRepairKitModel() {
  const g = new THREE.Group();
  const geo = bakeParts([
    { g: box(0.3, 0.16, 0.2), p: [0, 0.08, 0], c: [0.9, 0.2, 0.15] }, { g: box(0.32, 0.03, 0.22), p: [0, 0.17, 0], c: [0.95, 0.95, 0.9] },
    { g: box(0.12, 0.015, 0.035), p: [0, 0.188, 0], c: [0.85, 0.15, 0.1] }, { g: box(0.035, 0.015, 0.12), p: [0, 0.188, 0], c: [0.85, 0.15, 0.1] },
    { g: box(0.1, 0.05, 0.03), p: [0, 0.2, 0.0], c: [0.3, 0.3, 0.3] },
  ]);
  g.add(new THREE.Mesh(geo, materials().lit)); g.name = 's2_kit'; return g;
}
export function createFruitModel() {
  const g = new THREE.Group();
  const geo = bakeParts([{ g: new THREE.IcosahedronGeometry(0.06, 1), p: [0, 0.06, 0], c: [0.9, 0.22, 0.14] }, { g: cyl(0.006, 0.05, 4), p: [0, 0.13, 0], c: [0.35, 0.25, 0.15] }, { g: box(0.05, 0.01, 0.025), p: [0.03, 0.135, 0], r: [0, 0, 0.4], c: [0.3, 0.7, 0.3] }]);
  g.add(new THREE.Mesh(geo, materials().lit)); g.name = 'fd_hydro'; return g;
}
