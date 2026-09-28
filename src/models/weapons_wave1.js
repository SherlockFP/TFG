// TFG wave 1 - procedural low-poly models for the Company Store weapons, their ammo and the Stacked Deck.
//
// Conventions (same as models/items.js): meters, +Y up, TOOLS: origin = grip point, muzzle / blade points to -Z,
// userData.tip = Object3D at the business end. Static parts sharing a material are merged (2-5 draw calls each).
// Models are registered into the mod item-model map by game/weapons.js (window.__kefalMods.itemModels), so world
// items, hand-held items and the store icons (ui/icons.js) all use them.
//
//   WEAPON_MODELS[id](THREE) -> Group        (kitchen knife, baseball bat, nail bat, crowbar, katana, pistol, nail gun,
//                                             crossbow, flare gun, rounds / nails / bolts / flares boxes, stacked deck)
//   createCardMesh(kind)     -> Mesh          flying playing card (kind: 'std' | 'blue' | 'red' | 'gold'), unlit + spin-ready
//   CARD_COLORS                               { blue, red, gold, std } hex colours shared by HUD / trails / glow
import * as THREE from 'three';
import { ModelKit } from './items.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const { Kit, G, anchor } = ModelKit;
const PI = Math.PI, HP = PI / 2;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const { box, cyl, cone, sph, tor } = G;

export const CARD_COLORS = { std: 0xe9e4d2, blue: 0x3d8bff, red: 0xff4a3a, gold: 0xffc93a };

const TOOL = { kind: 'weapon' };
function finish(k, root, tip) {
  k.into(root);
  if (tip) root.userData.tip = anchor(root, 'tip', tip);
  root.userData.kind = TOOL.kind;
  return root;
}

// ------------------------------------------------------------------------------------------------ melee
function knife() {
  const k = new Kit(), root = new THREE.Group();
  const blade = L('metal', 0xd6dade, { flat: true }), wood = L('wood_dark', 0x6a4426), dark = L('metal_dark', 0x40444a);
  k.add(wood, box(0.024, 0.032, 0.115), [0, 0, 0.005]);
  for (const z of [-0.03, 0.02, 0.06]) k.add(L('metal', 0xb8a070), cyl(0.0045, 0.0045, 0.034, 6), [0, 0, z], [0, 0, HP]);
  k.add(dark, box(0.028, 0.042, 0.012), [0, 0.004, -0.058]);
  k.add(blade, box(0.005, 0.038, 0.17), [0, 0.006, -0.145]);
  k.add(L('metal', 0xd6dade, { flat: true, double: true }), G.tri([0, 0.025, -0.23], [0, -0.013, -0.23], [0, 0.021, -0.275]));
  k.add(L('metal', 0xffffff), box(0.0058, 0.004, 0.16), [0, 0.02, -0.145]);
  return finish(k, root, [0, 0.01, -0.28]);
}

function bat(nails = false) {
  const k = new Kit(), root = new THREE.Group();
  const wood = L('wood_planks', nails ? 0xa87a4a : 0xdcb47a);
  k.limb(wood, [0, 0, 0.09], [0, 0, -0.68], 0.017, 0.037, 8);
  k.add(wood, sph(0.037, 8, 6), [0, 0, -0.68], null, [1, 1, 0.55]);
  k.add(wood, sph(0.026, 6, 4), [0, 0, 0.1], null, [1, 1, 0.6]);
  k.add(L('rubber', 0x1c1c22), cyl(0.0195, 0.0195, 0.18, 8, true), [0, 0, 0.0], [HP, 0, 0]);
  if (nails) {
    const iron = L('metal_rust', 0x9a9a98);
    const dirty = L('metal_rust', 0x6a3a2a);
    let n = 0;
    for (let z = -0.46; z > -0.7; z -= 0.055) {
      const a0 = (n++ % 2) * 0.9;
      for (let a = 0; a < 6; a++) {
        const ang = a0 + (a / 6) * PI * 2;
        const r = 0.035 + (z < -0.58 ? 0 : 0.002);
        k.add(iron, cone(0.0055, 0.03, 4), [Math.cos(ang) * (r + 0.011), Math.sin(ang) * (r + 0.011), z], [0, 0, ang - HP]);
      }
    }
    k.add(dirty, cyl(0.0385, 0.0385, 0.02, 8, true), [0, 0, -0.5], [HP, 0, 0]);
    k.add(dirty, cyl(0.0385, 0.0385, 0.02, 8, true), [0, 0, -0.62], [HP, 0, 0]);
  }
  return finish(k, root, [0, 0, -0.74]);
}

function crowbar() {
  const k = new Kit(), root = new THREE.Group();
  const steel = L('metal_dark', 0x606468), red = L('paint', 0xa02424);
  k.add(steel, cyl(0.014, 0.014, 0.62, 6), [0, 0, -0.27], [HP, 0, 0]);
  k.add(red, cyl(0.0155, 0.0155, 0.16, 6), [0, 0, -0.06], [HP, 0, 0]);
  k.add(red, cyl(0.0155, 0.0155, 0.1, 6), [0, 0, -0.42], [HP, 0, 0]);
  // hooked claw end (forward): bends up and out
  k.limb(steel, [0, 0, -0.58], [0, 0.05, -0.65], 0.014, 0.012, 6);
  k.limb(steel, [0, 0.05, -0.65], [0, 0.11, -0.63], 0.012, 0.008, 6);
  k.add(steel, box(0.006, 0.05, 0.03), [0, 0.13, -0.615], [0.3, 0, 0]);
  k.add(steel, box(0.006, 0.04, 0.025), [0, 0.095, -0.635], [0.3, 0, 0]);
  // flat chisel end (grip end)
  k.limb(steel, [0, 0, 0.04], [0, -0.03, 0.1], 0.014, 0.012, 6);
  k.add(steel, box(0.03, 0.006, 0.05), [0, -0.05, 0.13], [-0.45, 0, 0]);
  return finish(k, root, [0, 0.12, -0.63]);
}

function katana() {
  const k = new Kit(), root = new THREE.Group();
  const steel = L('metal', 0xeef2f6, { flat: true }), edge = L('metal', 0xffffff, { flat: true }), dark = L('rubber', 0x14141a);
  const gold = L('gold', 0xd8b048), red = L('paint', 0x8a1022);
  // handle (tsuka) with diamond wrap
  k.add(dark, box(0.026, 0.032, 0.2), [0, 0, 0.06]);
  for (let z = -0.02; z < 0.16; z += 0.045) k.add(red, box(0.028, 0.034, 0.008), [0, 0, z], [0, 0, 0.4]);
  k.add(gold, cyl(0.02, 0.02, 0.012, 8), [0, 0, 0.165], [HP, 0, 0]);     // kashira
  k.add(gold, cyl(0.03, 0.03, 0.008, 10), [0, 0, -0.045], [HP, 0, 0]);   // tsuba
  k.add(gold, cyl(0.022, 0.022, 0.03, 8), [0, 0, -0.06], [HP, 0, 0]);    // habaki
  // gently curved blade (4 segments)
  const seg = [[-0.07, 0], [-0.32, 0.004], [-0.58, 0.012], [-0.82, 0.026]];
  for (let i = 0; i < seg.length - 1; i++) {
    const [z0, y0] = seg[i], [z1, y1] = seg[i + 1];
    k.beam(steel, [0, y0, z0], [0, y1, z1], 0.006, 0.036);
    k.beam(edge, [0, y0 - 0.017, z0], [0, y1 - 0.017, z1], 0.007, 0.004);
  }
  k.add(L('metal', 0xeef2f6, { flat: true, double: true }), G.tri([0, 0.026 + 0.018, -0.82], [0, 0.026 - 0.018, -0.82], [0, 0.026 + 0.014, -0.865]));
  return finish(k, root, [0, 0.03, -0.86]);
}

// ------------------------------------------------------------------------------------------------ ranged
function pistol() {
  const k = new Kit(), root = new THREE.Group();
  const slide = L('metal_dark', 0x3a3e44), frame = L('plastic', 0x24262a), grip = L('wood_dark', 0x7a5030), hi = L('metal', 0x8a9098);
  k.add(grip, box(0.03, 0.105, 0.05), [0, -0.055, 0.03], [-0.22, 0, 0]);
  k.add(frame, box(0.028, 0.03, 0.15), [0, 0.0, -0.03]);
  k.add(slide, box(0.03, 0.036, 0.235), [0, 0.032, -0.05]);
  k.add(hi, box(0.031, 0.008, 0.02), [0, 0.056, -0.155]);     // front sight
  k.add(hi, box(0.02, 0.008, 0.016), [0, 0.056, 0.06]);       // rear sight
  k.add(frame, box(0.008, 0.05, 0.012), [0, -0.03, -0.01], [0.2, 0, 0]);   // trigger guard front
  k.add(frame, box(0.024, 0.006, 0.05), [0, -0.05, -0.035]);
  k.add(hi, box(0.006, 0.02, 0.008), [0, -0.02, -0.03]);       // trigger
  for (let i = 0; i < 4; i++) k.add(hi, box(0.032, 0.03, 0.004), [0, 0.032, 0.03 + i * 0.012]);   // slide serrations
  return finish(k, root, [0, 0.032, -0.17]);
}

function nailgun() {
  const k = new Kit(), root = new THREE.Group();
  const body = L('plastic', 0xe6a41c), black = L('plastic', 0x1e1e22), steel = L('metal', 0x9aa0a6), mag = L('metal_dark', 0x505458);
  k.add(black, box(0.034, 0.11, 0.05), [0, -0.06, 0.05], [-0.25, 0, 0]);       // handle
  k.add(body, box(0.06, 0.07, 0.22), [0, 0.03, -0.02]);                          // motor housing
  k.add(body, box(0.05, 0.05, 0.1), [0, 0.03, -0.17]);
  k.add(steel, cyl(0.014, 0.014, 0.09, 8), [0, 0.025, -0.27], [HP, 0, 0]);      // nose
  k.add(black, cyl(0.02, 0.02, 0.03, 8), [0, 0.025, -0.2], [HP, 0, 0]);
  k.add(mag, box(0.018, 0.05, 0.18), [0, -0.035, -0.19], [0.2, 0, 0]);          // strip magazine (angled)
  for (let i = 0; i < 6; i++) k.add(steel, cyl(0.003, 0.003, 0.022, 4), [0, -0.062 - i * 0.002, -0.12 - i * 0.026], [0.2, 0, 0]);
  k.add(black, cyl(0.011, 0.011, 0.06, 6), [0, 0.02, 0.135], [HP, 0, 0]);       // air hose stub
  k.add(black, tor(0.05, 0.007, 4, 10, PI), [0, -0.005, 0.18], [0, 0, PI]);
  k.add(L('paint', 0x8a1e1e), box(0.062, 0.012, 0.04), [0, 0.068, -0.06]);
  return finish(k, root, [0, 0.025, -0.32]);
}

function crossbow() {
  const k = new Kit(), root = new THREE.Group();
  const wood = L('wood_dark', 0x8a6238), steel = L('metal_dark', 0x54585e), limb = L('rubber', 0x22262a), string = B(null, 0xdcd4b8);
  k.add(wood, box(0.045, 0.06, 0.55), [0, -0.005, -0.06]);                       // stock
  k.add(wood, box(0.04, 0.09, 0.14), [0, -0.05, 0.26], [-0.12, 0, 0]);           // butt
  k.add(wood, box(0.032, 0.1, 0.045), [0, -0.09, 0.06], [-0.25, 0, 0]);          // grip
  k.add(steel, box(0.038, 0.02, 0.4), [0, 0.033, -0.16]);                        // rail
  // prod (bow limbs)
  const px = 0.36;
  k.beam(limb, [0, 0.02, -0.34], [px * 0.55, 0.02, -0.33], 0.024, 0.022);
  k.beam(limb, [px * 0.55, 0.02, -0.33], [px, 0.02, -0.27], 0.02, 0.018);
  k.beam(limb, [0, 0.02, -0.34], [-px * 0.55, 0.02, -0.33], 0.024, 0.022);
  k.beam(limb, [-px * 0.55, 0.02, -0.33], [-px, 0.02, -0.27], 0.02, 0.018);
  k.add(steel, box(0.09, 0.05, 0.05), [0, 0.02, -0.34]);
  // string
  k.beam(string, [px, 0.02, -0.27], [0, 0.03, -0.02], 0.004, 0.004);
  k.beam(string, [-px, 0.02, -0.27], [0, 0.03, -0.02], 0.004, 0.004);
  // loaded bolt
  const bolt = L('metal', 0xc8ccd0);
  k.add(L('wood_planks', 0xd8c090), cyl(0.0055, 0.0055, 0.3, 5), [0, 0.048, -0.17], [HP, 0, 0]);
  k.add(bolt, cone(0.011, 0.045, 4), [0, 0.048, -0.34], [-HP, 0, 0]);
  k.add(L('paint', 0xb02020), box(0.024, 0.002, 0.03), [0, 0.048, -0.045]);
  // stirrup
  k.add(steel, tor(0.03, 0.005, 4, 8), [0, 0.02, -0.41], [HP, 0, 0]);
  return finish(k, root, [0, 0.048, -0.4]);
}

function flaregun() {
  const k = new Kit(), root = new THREE.Group();
  const orange = L('plastic', 0xe8560e), black = L('plastic', 0x1c1c20), steel = L('metal', 0x8a9096);
  k.add(black, box(0.032, 0.1, 0.05), [0, -0.055, 0.04], [-0.28, 0, 0]);
  k.add(orange, box(0.04, 0.05, 0.1), [0, 0.0, 0.0]);
  k.add(orange, cyl(0.026, 0.026, 0.19, 10), [0, 0.03, -0.1], [HP, 0, 0]);       // fat barrel
  k.add(black, cyl(0.03, 0.03, 0.02, 10), [0, 0.03, -0.2], [HP, 0, 0]);
  k.add(B(null, 0x1a0a04), G.circ(0.02, 10), [0, 0.03, -0.211], [0, PI, 0]);      // bore
  k.add(steel, box(0.006, 0.02, 0.012), [0, 0.066, 0.02]);                        // hammer
  k.add(steel, box(0.006, 0.014, 0.01), [0, 0.066, -0.19]);                       // front sight
  k.add(black, box(0.006, 0.05, 0.012), [0, -0.025, -0.04], [0.15, 0, 0]);
  k.add(L('paint', 0xf2e0a0), box(0.042, 0.01, 0.02), [0, 0.02, -0.06]);          // label stripe
  return finish(k, root, [0, 0.03, -0.22]);
}

// ------------------------------------------------------------------------------------------------ ammo
function ammoBox(kind) {
  const k = new Kit(), root = new THREE.Group();
  if (kind === 'rounds') {
    const olive = L('paint', 0x5a6a3a), brass = L('gold', 0xd6b04a), lead = L('metal', 0xb8b8b8);
    k.add(olive, box(0.09, 0.05, 0.06), [0, 0.025, 0]);
    k.add(L('paint', 0xe8e0c0), box(0.05, 0.02, 0.002), [0, 0.03, 0.031]);
    for (let i = 0; i < 6; i++) {
      k.add(brass, cyl(0.0046, 0.0046, 0.02, 6), [-0.03 + i * 0.012, 0.06, 0.005]);
      k.add(lead, cone(0.0046, 0.009, 6), [-0.03 + i * 0.012, 0.076, 0.005]);
    }
  } else if (kind === 'nails') {
    const blue = L('paint', 0x2a5aa8), nail = L('metal', 0xc0c4c8);
    k.add(blue, box(0.09, 0.045, 0.06), [0, 0.0225, 0]);
    k.add(L('paint', 0xf0e6c0), box(0.05, 0.02, 0.002), [0, 0.026, 0.031]);
    for (let i = 0; i < 9; i++) k.add(nail, cyl(0.0022, 0.0022, 0.03, 4), [-0.032 + (i % 3) * 0.032, 0.06, -0.015 + Math.floor(i / 3) * 0.015], [0, 0, (i % 3 - 1) * 0.35]);
  } else if (kind === 'bolts') {
    const leather = L('wood_dark', 0x6a4426), shaft = L('wood_planks', 0xd8c090), head = L('metal', 0xc8ccd0);
    k.add(leather, cyl(0.03, 0.028, 0.22, 8, true), [0, 0.11, 0]);
    k.add(leather, cyl(0.03, 0.03, 0.02, 8), [0, 0.0, 0], null);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      k.add(shaft, cyl(0.004, 0.004, 0.16, 4), [Math.cos(a) * 0.012, 0.29, Math.sin(a) * 0.012], [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]);
      k.add(L('paint', 0xb02020), box(0.02, 0.03, 0.002), [Math.cos(a) * 0.016, 0.36, Math.sin(a) * 0.016], [0, a, 0]);
      void head;
    }
    k.add(L('metal_dark', 0x3a3a3e), cyl(0.031, 0.031, 0.02, 8, true), [0, 0.2, 0]);
  } else {   // flares: three red tubes taped together
    const red = L('paint', 0xd8281c), cap = L('plastic', 0x1c1c20), tape = L('paint', 0xe8e0c0);
    for (const [x, z] of [[-0.013, 0.008], [0.013, 0.008], [0, -0.014]]) {
      k.add(red, cyl(0.011, 0.011, 0.11, 8), [x, 0.055, z]);
      k.add(cap, cyl(0.0112, 0.0112, 0.014, 8), [x, 0.114, z]);
      k.add(L('gold', 0xffd060), cyl(0.004, 0.004, 0.012, 5), [x, 0.127, z]);
    }
    k.add(tape, cyl(0.026, 0.026, 0.014, 10, true), [0, 0.04, 0]);
  }
  k.into(root);
  root.userData.kind = 'consumable';
  return root;
}

// ------------------------------------------------------------------------------------------------ Stacked Deck
/** Draws a card face. kind: std | blue | red | gold. */
function cardCanvas(kind) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const col = '#' + CARD_COLORS[kind].toString(16).padStart(6, '0');
  const dark = { std: '#1c1c22', blue: '#0c2a66', red: '#6a0e08', gold: '#6a4a00' }[kind];
  const face = { std: '#f2eedd', blue: '#dbe8ff', red: '#ffe0da', gold: '#fff2c4' }[kind];
  x.fillStyle = dark; x.fillRect(0, 0, 64, 96);
  x.fillStyle = face; x.fillRect(3, 3, 58, 90);
  x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(6.5, 6.5, 51, 83);
  x.fillStyle = col;
  x.strokeStyle = dark;
  const cx = 32, cy = 48;
  x.beginPath();
  if (kind === 'blue') { x.moveTo(cx, cy - 22); x.lineTo(cx + 15, cy); x.lineTo(cx, cy + 22); x.lineTo(cx - 15, cy); x.closePath(); }   // diamond
  else if (kind === 'red') {                                                                                                        // heart
    x.moveTo(cx, cy + 20); x.bezierCurveTo(cx - 30, cy - 2, cx - 16, cy - 26, cx, cy - 10); x.bezierCurveTo(cx + 16, cy - 26, cx + 30, cy - 2, cx, cy + 20);
  } else if (kind === 'gold') {                                                                                                     // star
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 23, a = -HP + (i * PI) / 5; x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath();
  } else {                                                                                                                          // spade-ish
    x.moveTo(cx, cy - 22); x.bezierCurveTo(cx + 34, cy + 6, cx + 10, cy + 22, cx, cy + 8); x.bezierCurveTo(cx - 10, cy + 22, cx - 34, cy + 6, cx, cy - 22);
    x.fill(); x.beginPath(); x.moveTo(cx - 3, cy + 8); x.lineTo(cx - 7, cy + 24); x.lineTo(cx + 7, cy + 24); x.lineTo(cx + 3, cy + 8); x.closePath();
  }
  x.fill(); x.lineWidth = 1.5; x.stroke();
  // corner pips
  for (const [px, py] of [[13, 14], [51, 82]]) { x.fillStyle = col; x.fillRect(px - 3, py - 3, 6, 6); }
  return c;
}
const cardTex = {};
function cardTexture(kind) {
  if (!cardTex[kind]) {
    const t = new THREE.CanvasTexture(cardCanvas(kind));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    cardTex[kind] = t;
  }
  return cardTex[kind];
}
const cardBackTex = { v: null };
function cardBack() {
  if (!cardBackTex.v) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#5a0f22'; x.fillRect(0, 0, 64, 96);
    x.fillStyle = '#e8d8a8'; x.fillRect(3, 3, 58, 90);
    x.fillStyle = '#7a1230'; x.fillRect(6, 6, 52, 84);
    x.strokeStyle = '#e8d8a8'; x.lineWidth = 1;
    for (let i = -96; i < 96; i += 8) { x.beginPath(); x.moveTo(6 + i, 6); x.lineTo(58 + i, 90); x.stroke(); }
    x.fillStyle = '#e8d8a8'; x.beginPath(); x.arc(32, 48, 12, 0, PI * 2); x.fill();
    x.fillStyle = '#7a1230'; x.beginPath(); x.arc(32, 48, 8, 0, PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    cardBackTex.v = t;
  }
  return cardBackTex.v;
}

let cardGeo = null, haloGeo = null, haloTex = null;
/** Flying card: front face + back face + (for coloured cards) an additive halo. The mesh is planar in XY, facing +Z. */
export function createCardMesh(kind = 'std', scale = 1) {
  const g = new THREE.Group();
  cardGeo = cardGeo || new THREE.PlaneGeometry(0.11, 0.165);
  const front = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardTexture(kind), side: THREE.FrontSide, fog: true }));
  const back = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardBack(), side: THREE.FrontSide, fog: true }));
  back.rotation.y = PI;
  g.add(front, back);
  if (kind !== 'std') {
    if (!haloTex) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      haloTex = new THREE.CanvasTexture(c);
    }
    haloGeo = haloGeo || new THREE.PlaneGeometry(0.5, 0.5);
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, color: CARD_COLORS[kind], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85, fog: false }));
    halo.position.z = -0.01;
    g.add(halo);
  }
  g.scale.setScalar(scale);
  g.userData.dispose = () => { front.material.dispose(); back.material.dispose(); if (kind !== 'std') g.children[2].material.dispose(); };
  return g;
}

function stackedDeck() {
  const root = new THREE.Group();
  const k = new Kit();
  const cardBk = L(null, 0x7a1230), edge = L(null, 0xe8d8a8), gold = L('gold', 0xd8b048);
  // the deck block (cards stacked on their long edge, grip = middle of the deck)
  k.add(edge, box(0.07, 0.11, 0.032), [0, 0.02, 0]);
  k.add(cardBk, box(0.074, 0.112, 0.006), [0, 0.02, 0.019]);
  k.add(cardBk, box(0.074, 0.112, 0.006), [0, 0.02, -0.019]);
  // gold clasp band + corner studs
  k.add(gold, box(0.078, 0.014, 0.04), [0, 0.02, 0]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.add(gold, box(0.008, 0.008, 0.042), [sx * 0.036, 0.02 + sy * 0.056, 0]);
  // three fanned cards sticking out of the top
  const fan = [[-0.3, 0xffc93a], [0, 0xff4a3a], [0.3, 0x3d8bff]];
  k.into(root);
  const fanG = new THREE.Group(); fanG.position.set(0, 0.06, 0); root.add(fanG);
  const glow = [];
  fan.forEach(([a, c], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.09), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(Math.sin(a) * 0.05, 0.05 + Math.cos(a) * 0.01, (i - 1) * 0.003);
    m.rotation.z = -a;
    fanG.add(m);
    glow.push(m.material);
  });
  // aura: additive quad behind the deck, tinted by the selected card (weapons.js / deck.js recolours it)
  const auraMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), auraMat);
  aura.position.set(0, 0.06, 0);
  aura.name = 'deck_aura';
  root.add(aura);
  root.userData.deck = { aura: auraMat, fan: glow, fanGroup: fanG };
  // the grip is at the bottom of the deck, forward is -Z: rotate so the fan points forward/up in the hand
  root.userData.tip = anchor(root, 'tip', [0, 0.12, -0.02]);
  root.userData.kind = 'weapon';
  return root;
}

export const WEAPON_MODELS = {
  knife, bat: () => bat(false), nailbat: () => bat(true), crowbar, katana, pistol, nailgun, crossbow, flaregun,
  rounds: () => ammoBox('rounds'), nails: () => ammoBox('nails'), bolts: () => ammoBox('bolts'), flares: () => ammoBox('flares'),
  stackeddeck: stackedDeck,
};
