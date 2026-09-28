// TFG wave 2 - procedural low-poly models for the combat weapons (same conventions as weapons_wave1.js: meters, +Y up,
// origin = grip, blade / muzzle towards -Z, userData.tip = the business end). Registered by game/combat_weapons.js.
import * as THREE from 'three';
import { ModelKit } from './items.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const { Kit, G, anchor } = ModelKit;
const PI = Math.PI, HP = PI / 2;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const { box, cyl, cone, sph, tor } = G;

function finish(k, root, tip, kind = 'weapon') {
  k.into(root);
  if (tip) root.userData.tip = anchor(root, 'tip', tip);
  root.userData.kind = kind;
  return root;
}
const steel = () => L('metal', 0xdfe4ea, { flat: true });
const edge = () => L('metal', 0xffffff, { flat: true });
const dark = () => L('rubber', 0x18181e);
const gold = () => L('gold', 0xd8b048);

function bladeSword(k, len, w, guardW, wrapCol) {
  k.add(dark(), box(0.028, 0.034, 0.24), [0, 0, 0.08]);                               // grip
  for (let z = -0.02; z < 0.18; z += 0.05) k.add(L('paint', wrapCol), box(0.03, 0.036, 0.008), [0, 0, z], [0, 0, 0.4]);
  k.add(gold(), sph(0.03, 8, 6), [0, 0, 0.215], null, [1, 1, 0.8]);                    // pommel
  k.add(gold(), box(guardW, 0.026, 0.03), [0, 0, -0.05]);                             // crossguard
  k.add(gold(), sph(0.02, 6, 4), [guardW / 2, 0, -0.05]); k.add(gold(), sph(0.02, 6, 4), [-guardW / 2, 0, -0.05]);
  k.add(steel(), box(0.006, w, len), [0, 0, -0.07 - len / 2]);                         // blade
  k.add(edge(), box(0.0072, w * 0.35, len * 0.94), [0, 0, -0.07 - len / 2]);           // fuller
  k.add(L('metal', 0xdfe4ea, { flat: true, double: true }), G.tri([0, w / 2, -0.07 - len], [0, -w / 2, -0.07 - len], [0, 0, -0.07 - len - w * 0.9]));
}
function longsword() { const k = new Kit(), root = new THREE.Group(); bladeSword(k, 0.86, 0.05, 0.2, 0x2a4aa8); return finish(k, root, [0, 0, -1.02]); }
function greatsword() { const k = new Kit(), root = new THREE.Group(); bladeSword(k, 1.3, 0.085, 0.3, 0x8a1022); k.add(gold(), box(0.05, 0.04, 0.06), [0, 0, -0.12]); return finish(k, root, [0, 0, -1.52]); }

function dagger(k, x) {
  k.add(dark(), box(0.024, 0.03, 0.11), [x, 0, 0.02]);
  k.add(gold(), box(0.07, 0.02, 0.02), [x, 0, -0.04]);
  k.add(steel(), box(0.005, 0.034, 0.17), [x, 0, -0.13]);
  k.add(L('metal', 0xdfe4ea, { flat: true, double: true }), G.tri([x, 0.017, -0.215], [x, -0.017, -0.215], [x, 0, -0.27]));
}
function twindaggers() { const k = new Kit(), root = new THREE.Group(); dagger(k, 0); dagger(k, -0.16); return finish(k, root, [0, 0, -0.27]); }

function spear() {
  const k = new Kit(), root = new THREE.Group();
  const wood = L('wood_planks', 0x9a7040), iron = L('metal_dark', 0x60646a);
  k.add(wood, cyl(0.016, 0.016, 1.55, 6), [0, 0, -0.55], [HP, 0, 0]);
  k.add(iron, cyl(0.02, 0.02, 0.05, 6), [0, 0, -1.3], [HP, 0, 0]);
  k.add(L('paint', 0xa02424), box(0.04, 0.05, 0.012), [0, 0, -1.28]);                 // tassel
  k.add(steel(), box(0.005, 0.07, 0.24), [0, 0, -1.43]);
  k.add(L('metal', 0xdfe4ea, { flat: true, double: true }), G.tri([0, 0.035, -1.55], [0, -0.035, -1.55], [0, 0, -1.66]));
  k.add(iron, cyl(0.02, 0.014, 0.06, 6), [0, 0, 0.24], [HP, 0, 0]);                    // butt cap
  return finish(k, root, [0, 0, -1.66]);
}

function waraxe() {
  const k = new Kit(), root = new THREE.Group();
  const wood = L('wood_dark', 0x6a4426), iron = L('metal_dark', 0x54585e);
  k.add(wood, cyl(0.02, 0.024, 0.95, 6), [0, 0, -0.32], [HP, 0, 0]);
  k.add(iron, box(0.05, 0.05, 0.13), [0, 0, -0.74]);
  for (const s of [-1, 1]) {                                                          // double bit
    k.add(steel(), box(0.012, 0.19, 0.14), [0, s * 0.11, -0.74]);
    k.add(L('metal', 0xffffff, { flat: true }), box(0.006, 0.05, 0.17), [0, s * 0.2, -0.74]);
  }
  k.add(L('paint', 0x8a1022), cyl(0.026, 0.026, 0.02, 6), [0, 0, -0.62], [HP, 0, 0]);
  k.add(iron, cone(0.02, 0.07, 5), [0, 0, -0.85], [-HP, 0, 0]);
  return finish(k, root, [0, 0.2, -0.74]);
}

function warhammer() {
  const k = new Kit(), root = new THREE.Group();
  const wood = L('wood_dark', 0x6a4426), iron = L('metal_dark', 0x60646a);
  k.add(wood, cyl(0.024, 0.028, 1.1, 6), [0, 0, -0.35], [HP, 0, 0]);
  k.add(iron, box(0.12, 0.12, 0.2), [0, 0, -0.92]);
  k.add(L('metal', 0x8a9098), box(0.125, 0.125, 0.03), [0, 0, -1.03]);
  k.add(iron, cone(0.03, 0.14, 5), [0, 0, -0.78], [HP, 0, 0]);                        // rear spike
  k.add(iron, cone(0.03, 0.12, 5), [0, 0.12, -0.92]);                                  // top spike
  k.add(L('paint', 0x8a1022), cyl(0.03, 0.03, 0.12, 6), [0, 0, 0.0], [HP, 0, 0]);
  return finish(k, root, [0, 0, -1.05]);
}

// ------------------------------------------------------------------------------------------------ ranged / tech
function rocketlauncher() {
  const k = new Kit(), root = new THREE.Group();
  const olive = L('paint', 0x4a5a3a), blk = L('plastic', 0x1c1c20), steelD = L('metal_dark', 0x54585e);
  k.add(olive, cyl(0.075, 0.075, 0.95, 10), [0, 0.03, -0.32], [HP, 0, 0]);
  k.add(steelD, cyl(0.095, 0.075, 0.12, 10), [0, 0.03, -0.84], [HP, 0, 0]);           // muzzle bell
  k.add(steelD, cyl(0.06, 0.1, 0.16, 10), [0, 0.03, 0.2], [HP, 0, 0]);                // rear cone
  k.add(blk, box(0.035, 0.11, 0.05), [0, -0.09, 0.02], [-0.2, 0, 0]);                 // grip
  k.add(blk, box(0.03, 0.06, 0.16), [0, -0.075, -0.3]);                                // fore grip
  k.add(steelD, box(0.03, 0.06, 0.09), [0.09, 0.1, -0.2]);                             // sight
  k.add(L('paint', 0xe8a41c), cyl(0.077, 0.077, 0.05, 10), [0, 0.03, -0.62], [HP, 0, 0]);
  k.add(B(null, 0xff5a1a), G.circ(0.05, 8), [0, 0.03, -0.902], [0, PI, 0]);            // warhead glow inside the tube
  return finish(k, root, [0, 0.03, -0.92]);
}

function grenadelauncher() {
  const k = new Kit(), root = new THREE.Group();
  const blk = L('plastic', 0x1e2024), steelD = L('metal_dark', 0x54585e), wood = L('wood_dark', 0x7a5030);
  k.add(steelD, cyl(0.035, 0.035, 0.42, 8), [0, 0.03, -0.28], [HP, 0, 0]);            // barrel
  k.add(steelD, cyl(0.06, 0.06, 0.13, 8), [0, 0.0, -0.06], [HP, 0, 0]);               // drum
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU4; k.add(blk, cyl(0.014, 0.014, 0.135, 5), [Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.06], [HP, 0, 0]); }
  k.add(blk, box(0.04, 0.09, 0.05), [0, -0.075, 0.08], [-0.25, 0, 0]);
  k.add(wood, box(0.04, 0.07, 0.24), [0, -0.02, 0.24], [0.08, 0, 0]);                  // stock
  k.add(steelD, box(0.012, 0.05, 0.05), [0, 0.09, -0.12]);                             // sight
  k.add(L('paint', 0x8a1e1e), cyl(0.037, 0.037, 0.04, 8), [0, 0.03, -0.42], [HP, 0, 0]);
  return finish(k, root, [0, 0.03, -0.5]);
}
const TAU4 = PI * 2;

function smg() {
  const k = new Kit(), root = new THREE.Group();
  const blk = L('plastic', 0x22262a), steelD = L('metal_dark', 0x44484e), hi = L('metal', 0x8a9098);
  k.add(blk, box(0.045, 0.075, 0.3), [0, 0.02, -0.06]);
  k.add(steelD, box(0.03, 0.035, 0.15), [0, 0.025, -0.28]);
  k.add(hi, cyl(0.011, 0.011, 0.09, 6), [0, 0.03, -0.39], [HP, 0, 0]);
  k.add(blk, box(0.03, 0.1, 0.05), [0, -0.075, 0.03], [-0.25, 0, 0]);
  k.add(steelD, box(0.028, 0.16, 0.04), [0, -0.1, -0.12], [0.12, 0, 0]);               // long mag
  k.add(blk, box(0.03, 0.045, 0.1), [0, 0.0, 0.18]);                                   // stock stub
  k.add(hi, box(0.012, 0.02, 0.012), [0, 0.07, -0.22]);
  return finish(k, root, [0, 0.03, -0.44]);
}

function rifle() {
  const k = new Kit(), root = new THREE.Group();
  const wood = L('wood_dark', 0x7a5030), steelD = L('metal_dark', 0x3a3e44), hi = L('metal', 0x8a9098);
  k.add(wood, box(0.04, 0.07, 0.55), [0, -0.005, -0.08]);
  k.add(wood, box(0.04, 0.09, 0.2), [0, -0.03, 0.34], [-0.1, 0, 0]);
  k.add(steelD, cyl(0.012, 0.012, 0.6, 6), [0, 0.03, -0.62], [HP, 0, 0]);
  k.add(steelD, box(0.03, 0.04, 0.22), [0, 0.04, -0.12]);
  k.add(steelD, cyl(0.022, 0.022, 0.28, 8), [0, 0.09, -0.12], [HP, 0, 0]);             // scope
  k.add(hi, cyl(0.026, 0.026, 0.03, 8), [0, 0.09, -0.26], [HP, 0, 0]);
  k.add(hi, cyl(0.026, 0.026, 0.03, 8), [0, 0.09, 0.02], [HP, 0, 0]);
  k.add(steelD, box(0.03, 0.05, 0.06), [0, -0.075, -0.02], [-0.2, 0, 0]);
  return finish(k, root, [0, 0.03, -0.93]);
}

function gravtool() {
  const k = new Kit(), root = new THREE.Group();
  const shell = L('plastic', 0xe0e2e6), blk = L('plastic', 0x1c1c22), steelD = L('metal_dark', 0x54585e), glow = B(null, 0x66e0ff);
  k.add(blk, box(0.04, 0.1, 0.05), [0, -0.075, 0.05], [-0.25, 0, 0]);
  k.add(shell, cyl(0.05, 0.06, 0.32, 8), [0, 0.0, -0.1], [HP, 0, 0]);
  k.add(steelD, cyl(0.075, 0.075, 0.05, 8), [0, 0.0, -0.27], [HP, 0, 0]);
  k.add(glow, tor(0.06, 0.008, 4, 12), [0, 0.0, -0.3]);
  k.add(steelD, cone(0.075, 0.13, 8), [0, 0.0, -0.36], [-HP, 0, 0]);
  k.add(glow, cyl(0.018, 0.018, 0.14, 6), [0.0, 0.0, -0.11], [HP, 0, 0]);
  for (const s of [-1, 1]) k.add(steelD, box(0.012, 0.05, 0.16), [s * 0.055, 0.02, -0.16]);
  return finish(k, root, [0, 0, -0.42]);
}

// ------------------------------------------------------------------------------------------------ ammo boxes
function ammo(kind) {
  const k = new Kit(), root = new THREE.Group();
  const cols = { rockets: 0x5a6a3a, grenades40: 0x3a4a8a, smgammo: 0x8a5a1a, rifleammo: 0x6a3a2a }, col = cols[kind] || 0x555555;
  k.add(L('paint', col), box(0.11, 0.05, 0.07), [0, 0.025, 0]);
  k.add(L('paint', 0xe8e0c0), box(0.06, 0.02, 0.002), [0, 0.03, 0.036]);
  if (kind === 'rockets') for (let i = 0; i < 3; i++) { k.add(L('paint', 0x8a8a3a), cyl(0.012, 0.012, 0.09, 6), [-0.03 + i * 0.03, 0.065, 0], [HP, 0, 0]); k.add(L('paint', 0xe8561c), cone(0.012, 0.03, 6), [-0.03 + i * 0.03, 0.065, -0.06], [-HP, 0, 0]); }
  else if (kind === 'grenades40') for (let i = 0; i < 3; i++) k.add(L('metal_dark', 0x5a6a3a), sph(0.016, 6, 5), [-0.03 + i * 0.03, 0.062, 0]);
  else for (let i = 0; i < 6; i++) k.add(L('gold', 0xd6b04a), cyl(0.005, 0.005, 0.022, 6), [-0.035 + i * 0.014, 0.062, 0.005]);
  k.into(root);
  root.userData.kind = 'consumable';
  return root;
}

export const COMBAT_MODELS = {
  longsword, greatsword, twindaggers, spear, waraxe, warhammer, rocketlauncher, grenadelauncher, smg, rifle, gravtool,
  rockets: () => ammo('rockets'), grenades40: () => ammo('grenades40'), smgammo: () => ammo('smgammo'), rifleammo: () => ammo('rifleammo'),
};

// ------------------------------------------------------------------------------------------------ projectile / deployable meshes
export function createRocketMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8).rotateX(HP), new THREE.MeshBasicMaterial({ color: 0x8a8f5a }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8).rotateX(-HP).translate(0, 0, -0.28), new THREE.MeshBasicMaterial({ color: 0xe8561c }));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 8).rotateX(HP).translate(0, 0, 0.36), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(body, nose, flame);
  g.userData.flame = flame;
  g.userData.dispose = () => { for (const m of [body, nose, flame]) { m.geometry.dispose(); m.material.dispose(); } };
  return g;
}
export function createGrenadeMesh() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4a5a3a }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 4, 10), new THREE.MeshBasicMaterial({ color: 0xe8a41c }));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4).translate(0, 0.08, 0), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  g.add(s, band, led);
  g.userData.led = led;
  g.userData.dispose = () => { for (const m of [s, band, led]) { m.geometry.dispose(); m.material.dispose(); } };
  return g;
}
/** Mini-turret (Technician): tripod + gun + emissive eye. */
export function createMiniTurretMesh() {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshBasicMaterial({ color: c });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 8), M(0x3a3e44)); base.position.y = 0.06;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), M(0x54585e)); stem.position.y = 0.27;
  const head = new THREE.Group(); head.position.y = 0.48;
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), M(0x5b8cff)); head.add(hb);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 6).rotateX(HP).translate(0, 0, -0.3), M(0x22262a)); head.add(gun);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4).translate(0, 0.02, -0.16), M(0xff3020)); head.add(eye);
  g.add(base, stem, head);
  g.userData.head = head; g.userData.eye = eye;
  g.userData.dispose = () => g.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  return g;
}
/** Totem (spell): a glowing standing stone with a floating rune ring. */
export function createTotemMesh(color = 0xffd27a) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), new THREE.MeshBasicMaterial({ color: 0x4a4038 })); stone.position.y = 0.5;
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); cap.position.y = 1.25;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 4, 20).rotateX(HP), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); ring.position.y = 1.25;
  g.add(stone, cap, ring);
  g.userData.cap = cap; g.userData.ring = ring;
  g.userData.dispose = () => g.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  return g;
}
