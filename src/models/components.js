// TFG - procedural low-poly models for the CRAFTING module: components, crafted items, strange items, the workbench.
//
//   createComponentModel(id)  -> THREE.Group for any id in COMPONENT_MODEL_IDS (null for unknown ids)
//   COMPONENT_MODEL_IDS       every id this file can build (components, craft_* items, strange_* items)
//   createWorkbench()         -> { group, size, lamp, screen, ... } the ship workbench (origin = floor at bench centre,
//                                front faces +z, back against the wall at -z)
//
// Same conventions as models/items.js (meters, +Y up, TOOLS: origin = grip, pointing axis -Z; SCRAP-like: origin at the
// bounding-box centre). Static parts sharing a material are merged (2-6 draw calls per item). Registered with the item
// model registry by game/crafting.js (mods.itemModels), so world items AND inventory icons use them.
import * as THREE from 'three';
import { ModelKit } from './items.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const { Kit, G, anchor } = ModelKit;
const PI = Math.PI, HP = PI / 2, TAU = PI * 2;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const { box, cyl, cone, sph, hemi, lathe, tor, plane, circ, oct } = G;

const SCRAP = { kind: 'scrap', center: true };
const TOOL = { kind: 'tool', center: false };

function setTip(root, p, r) { const t = anchor(root, 'tip', p, r); root.userData.tip = t; return t; }
function setLight(root, p, light, r) {
  const a = anchor(root, 'lightAnchor', p, r);
  root.userData.lightAnchor = a;
  root.userData.light = light;
  return a;
}

const M = Object.create(null);   // id -> (kit, root) => info

// ============================================================================================ components
M.comp_scrapmetal = (k) => {
  const rust = L('metal_rust', 0xb8b0a8), steel = L('metal', 0x9aa0a4), plate = L('metal_plate', 0x8a8a86);
  k.add(rust, box(0.17, 0.014, 0.12), [0, 0.007, 0], [0, 0.3, 0]);
  k.add(steel, box(0.14, 0.014, 0.09), [0.012, 0.024, 0.01], [0.1, -0.45, 0.07]);
  k.add(plate, box(0.11, 0.012, 0.075), [-0.012, 0.04, -0.006], [-0.08, 0.95, -0.06]);
  k.add(rust, box(0.05, 0.014, 0.05), [0.07, 0.05, 0.03], [0.5, 0.2, 0.9]);            // bent tab
  for (const [x, z] of [[-0.05, -0.02], [0.04, 0.03]]) k.add(L('metal', 0xd0d0d0), cyl(0.011, 0.011, 0.01, 6), [x, 0.05, z]);
  return SCRAP;
};
M.comp_wood = (k) => {
  const w = L('wood_planks', 0xc09060), d = L('wood_dark', 0x8a6238);
  for (let i = 0; i < 3; i++) k.add(i === 1 ? d : w, box(0.24, 0.026, 0.055), [0, 0.013 + i * 0.027, (i - 1) * 0.012], [0, (i - 1) * 0.13, 0]);
  k.add(w, box(0.2, 0.024, 0.05), [0.01, 0.094, 0], [0, 1.1, 0]);
  for (const x of [-0.08, 0.08]) k.add(L('metal', 0xb0b0b0), cyl(0.006, 0.006, 0.02, 5), [x, 0.11, 0.0]);
  return SCRAP;
};
M.comp_cable = (k) => {
  const cu = L('metal', 0xc8763a), dk = L('plastic', 0x1e1e22);
  for (let i = 0; i < 3; i++) k.add(cu, tor(0.055, 0.013, 4, 10), [0, 0.014 + i * 0.024, 0], [HP, 0, 0]);
  k.add(dk, tor(0.056, 0.006, 3, 10), [0, 0.086, 0], [HP, 0, 0]);
  k.add(cu, cyl(0.009, 0.009, 0.1, 5), [0.07, 0.03, 0.07], [HP, 0, 0.9]);            // loose end
  k.add(L('metal', 0xc8c8c8), cyl(0.011, 0.011, 0.03, 5), [0.115, 0.03, 0.115], [HP, 0, 0.9]);
  k.add(B(null, 0xffc040), cyl(0.008, 0.008, 0.008, 5), [0.13, 0.03, 0.13], [HP, 0, 0.9]);
  return SCRAP;
};
M.comp_battery = (k) => {
  k.add(L('paint', 0x1e5a2e), cyl(0.032, 0.032, 0.12, 10), [0, 0.06, 0]);
  k.add(L('gold', 0xd8b048), cyl(0.033, 0.033, 0.03, 10), [0, 0.105, 0]);
  k.add(L('gold', 0xd8b048), cyl(0.013, 0.013, 0.014, 6), [0, 0.13, 0]);
  k.add(B(null, 0x70ff90), box(0.02, 0.05, 0.005), [0, 0.05, 0.0335]);                // charge bar
  k.add(B(null, 0x70ff90), box(0.05, 0.012, 0.005), [0, 0.078, 0.0335]);
  k.add(L('metal_dark', 0x303030), cyl(0.0335, 0.0335, 0.012, 10), [0, 0.006, 0]);
  return SCRAP;
};
M.comp_fuse = (k) => {
  k.add(L('glass', 0xffffff, { opacity: 0.5, double: true }), cyl(0.014, 0.014, 0.09, 8, true), [0, 0.02, 0], [0, 0, HP]);
  const cap = L('metal', 0xc8a050);
  k.add(cap, cyl(0.016, 0.016, 0.02, 8), [-0.052, 0.02, 0], [0, 0, HP]);
  k.add(cap, cyl(0.016, 0.016, 0.02, 8), [0.052, 0.02, 0], [0, 0, HP]);
  k.add(B(null, 0xff9a40), cyl(0.0025, 0.0025, 0.09, 4), [0, 0.02, 0], [0, 0, HP]);   // filament
  k.add(L('plastic', 0xd8d0c0), box(0.02, 0.008, 0.03), [0, -0.003, 0.02]);            // rating tag
  return SCRAP;
};
M.comp_circuit = (k) => {
  k.add(L('plastic', 0x1a6a4a), box(0.15, 0.007, 0.11), [0, 0.0035, 0]);
  k.add(L('plastic', 0x101418), box(0.045, 0.014, 0.045), [-0.025, 0.014, -0.012]);
  k.add(L('plastic', 0x101418), box(0.03, 0.011, 0.02), [0.04, 0.012, 0.02]);
  k.add(L('metal', 0xc8c8c8), box(0.05, 0.02, 0.014), [0.035, 0.017, -0.03]);          // heatsink
  for (let i = 0; i < 5; i++) k.add(L('metal', 0xc8c8c8), box(0.002, 0.018, 0.012), [0.014 + i * 0.01, 0.019, -0.03]);
  for (let i = 0; i < 6; i++) k.add(L('gold', 0xd8b048), box(0.008, 0.004, 0.018), [-0.06 + i * 0.011, 0.009, 0.045]);
  for (let i = 0; i < 3; i++) k.add(L('paint', 0x40608a), cyl(0.008, 0.008, 0.02, 6), [-0.06 + i * 0.02, 0.017, -0.035]);
  k.add(B(null, 0x40f0ff), box(0.012, 0.005, 0.005), [0.06, 0.01, -0.04]);
  k.add(B(null, 0x60ffd0), box(0.005, 0.004, 0.06), [0.005, 0.0085, 0.0], [0, 0.4, 0]);
  return SCRAP;
};
M.comp_sensor = (k, root) => {
  k.add(L('plastic', 0xe4e6e2), box(0.09, 0.06, 0.055), [0, 0.03, 0]);
  k.add(L('metal_dark', 0x2a2c30), cyl(0.022, 0.022, 0.012, 10), [0, 0.032, 0.03], [HP, 0, 0]);
  k.add(B(null, 0x40b8ff), cyl(0.014, 0.014, 0.006, 10), [0, 0.032, 0.036], [HP, 0, 0]);
  k.add(B(null, 0xffffff), box(0.005, 0.005, 0.004), [0.006, 0.038, 0.0405]);
  k.add(L('metal', 0xb0b0b0), cyl(0.0035, 0.0035, 0.05, 4), [0.032, 0.085, -0.01]);
  k.add(B(null, 0xff8a30), sph(0.005, 5, 4), [0.032, 0.112, -0.01]);
  k.add(L('metal_plate', 0x707474), box(0.11, 0.008, 0.03), [0, 0.004, -0.02]);
  for (const sx of [-1, 1]) k.add(L('metal', 0xc0c0c0), cyl(0.005, 0.005, 0.012, 5), [sx * 0.05, 0.012, -0.02]);
  void root;
  return SCRAP;
};
M.comp_fuel = (k) => {
  const red = L('paint', 0xb02a1c);
  k.add(red, box(0.1, 0.13, 0.05), [0, 0.065, 0]);
  k.add(red, box(0.1, 0.014, 0.05), [0, 0.135, 0]);
  k.add(L('metal_dark', 0x2a2a2a), box(0.04, 0.02, 0.016), [-0.02, 0.15, 0]);           // handle
  k.add(L('metal_dark', 0x2a2a2a), box(0.012, 0.03, 0.016), [-0.038, 0.14, 0]);
  k.add(L('metal_dark', 0x2a2a2a), box(0.012, 0.03, 0.016), [0.0, 0.14, 0]);
  k.add(L('metal', 0xd8b048), cyl(0.011, 0.011, 0.035, 8), [0.034, 0.152, 0], [0, 0, -0.5]);   // spout
  k.add(L('plastic', 0xe8e0c0), cyl(0.014, 0.014, 0.01, 8), [0.045, 0.166, 0], [0, 0, -0.5]);
  k.add(B(null, 0xffc22a), box(0.05, 0.05, 0.003), [0, 0.07, 0.0255]);                  // label
  k.add(B(null, 0x301008), cone(0.014, 0.03, 4), [0, 0.068, 0.028]);                     // flame glyph
  k.add(red, box(0.07, 0.004, 0.052), [0, 0.05, 0]);                                     // press ribs
  return SCRAP;
};
M.comp_coolant = (k, root) => {
  k.add(L('paint', 0x3a70c0), cyl(0.04, 0.04, 0.13, 10), [0, 0.065, 0]);
  k.add(L('metal', 0xd8e4f0), cyl(0.041, 0.041, 0.02, 10), [0, 0.035, 0]);
  k.add(L('metal', 0xd8e4f0), cyl(0.041, 0.041, 0.02, 10), [0, 0.105, 0]);
  k.add(L('metal', 0xb0b8c0), cyl(0.014, 0.018, 0.03, 8), [0, 0.145, 0]);
  k.add(L('metal', 0xd05030), tor(0.022, 0.004, 3, 8), [0, 0.165, 0], [HP, 0, 0]);       // valve wheel
  k.add(B(null, 0x80f0ff), box(0.024, 0.05, 0.004), [0, 0.07, 0.0405]);                   // frost window
  k.add(B(null, 0xd0ffff), box(0.024, 0.008, 0.004), [0, 0.09, 0.0405]);
  setLight(root, [0, 0.07, 0.05], { type: 'point', color: 0x80f0ff, intensity: 0.5, distance: 2.5 });
  return SCRAP;
};
M.comp_chem = (k, root) => {
  k.add(L('glass', 0xffffff, { opacity: 0.4, double: true }), lathe([[0, 0], [0.05, 0], [0.052, 0.006], [0.018, 0.1], [0.018, 0.13], [0.024, 0.14]], 10));
  k.add(B(null, 0xc850ff), lathe([[0, 0.004], [0.047, 0.004], [0.03, 0.052], [0, 0.052]], 10));
  k.add(L('wood_dark', 0xc08a50), cyl(0.017, 0.015, 0.026, 6), [0, 0.144, 0]);
  k.add(B(null, 0xf0e020), box(0.03, 0.03, 0.003), [0, 0.03, 0.05]);                     // hazard label
  k.add(L('plastic', 0x101010), cone(0.008, 0.016, 3), [0, 0.03, 0.052]);
  setLight(root, [0, 0.03, 0], { type: 'point', color: 0xc850ff, intensity: 0.6, distance: 3 });
  return SCRAP;
};
M.comp_cloth = (k) => {
  const cols = [0xb8a888, 0x5a7aa0, 0xa85a4a];
  for (let i = 0; i < 3; i++) {
    k.add(L('fabric', cols[i]), box(0.17 - i * 0.012, 0.03, 0.12), [i * 0.004, 0.015 + i * 0.03, 0], [0, (i - 1) * 0.24, 0]);
    k.add(L('fabric', 0x2a2a30), box(0.172 - i * 0.012, 0.006, 0.012), [i * 0.004, 0.02 + i * 0.03, 0.05], [0, (i - 1) * 0.24, 0]);
  }
  k.add(L('fabric', 0xd8d0c0), box(0.08, 0.012, 0.05), [0.03, 0.1, 0.01], [0.1, 0.5, 0.12]);   // draped scrap on top
  return SCRAP;
};
M.comp_crystal = (k, root) => {
  const glow = B(null, 0x60e8ff), glow2 = B(null, 0xb8fbff);
  k.add(glow, oct(0.05), [0, 0.07, 0], null, [0.7, 1.5, 0.7]);
  k.add(glow2, oct(0.02), [0.008, 0.11, 0.012], null, [0.6, 1.6, 0.6]);
  k.add(glow, oct(0.028), [0.055, 0.03, 0.01], [0.3, 0.4, 0.5], [0.7, 1.4, 0.7]);
  k.add(glow, oct(0.022), [-0.05, 0.026, -0.01], [-0.3, 0.9, -0.5], [0.7, 1.3, 0.7]);
  k.add(L('metal_dark', 0x2c3038), cyl(0.05, 0.06, 0.016, 6), [0, 0.008, 0]);
  setLight(root, [0, 0.07, 0], { type: 'point', color: 0x60e8ff, intensity: 0.9, distance: 4 });
  return SCRAP;
};
M.comp_ecto = (k, root) => {
  k.add(L('glass', 0xffffff, { opacity: 0.32, double: true }), cyl(0.038, 0.038, 0.1, 10, true), [0, 0.06, 0]);
  k.add(L('glass', 0xffffff, { opacity: 0.32 }), cyl(0.038, 0.038, 0.004, 10), [0, 0.01, 0]);
  k.add(L('metal_dark', 0x40444a), cyl(0.04, 0.04, 0.014, 10), [0, 0.111, 0]);
  k.add(L('metal_dark', 0x40444a), cyl(0.04, 0.04, 0.012, 10), [0, 0.004, 0]);
  const goo = B(null, 0x60ffa8);
  k.add(goo, sph(0.03, 7, 5), [0, 0.05, 0], null, [1, 1.15, 1]);
  k.add(goo, cone(0.012, 0.05, 5), [0.014, 0.1, 0.004], [0, 0, -0.3]);                    // wisps
  k.add(goo, cone(0.009, 0.04, 5), [-0.016, 0.098, -0.006], [0, 0, 0.35]);
  k.add(L('plastic', 0x10301c), sph(0.006, 5, 4), [-0.01, 0.06, 0.028]);                 // eyes
  k.add(L('plastic', 0x10301c), sph(0.006, 5, 4), [0.012, 0.06, 0.028]);
  setLight(root, [0, 0.06, 0], { type: 'point', color: 0x60ffa8, intensity: 0.9, distance: 4 });
  return SCRAP;
};
M.comp_accesscard = (k) => {
  k.add(L('plastic', 0xe8ecf0), box(0.086, 0.003, 0.054), [0, 0.0015, 0]);
  k.add(L('paint', 0x2860c8), box(0.086, 0.0032, 0.014), [0, 0.0016, -0.02]);
  k.add(L('plastic', 0x181818), box(0.086, 0.0034, 0.008), [0, 0.0017, 0.018]);          // mag stripe
  k.add(L('gold', 0xd8b048), box(0.012, 0.0036, 0.01), [-0.026, 0.0018, -0.002]);        // chip
  k.add(B(null, 0x40e070), box(0.008, 0.0036, 0.004), [0.03, 0.0018, -0.004]);           // ok light
  return SCRAP;
};

// ============================================================================================ crafted items
M.craft_batterypack = (k) => {
  k.add(L('paint', 0x2a2e34), box(0.15, 0.06, 0.08), [0, 0.03, 0]);
  for (const sx of [-1, 1]) k.add(L('paint', 0x1e5a2e), cyl(0.024, 0.024, 0.07, 8), [sx * 0.04, 0.09, 0], [0, 0, 0]);
  for (const sx of [-1, 1]) k.add(L('gold', 0xd8b048), cyl(0.011, 0.011, 0.012, 6), [sx * 0.04, 0.131, 0]);
  k.add(B(null, 0x70ff90), box(0.06, 0.012, 0.004), [0, 0.03, 0.0405]);                   // charge bars
  k.add(B(null, 0x70ff90), box(0.02, 0.012, 0.004), [-0.05, 0.03, 0.0405]);
  k.add(L('metal_dark', 0x101010), box(0.16, 0.014, 0.09), [0, 0.007, 0]);
  k.add(L('metal', 0xc0c0c0), box(0.075, 0.008, 0.012), [0, 0.064, 0.02]);               // strap plate
  k.add(L('plastic', 0xd8b020), box(0.03, 0.03, 0.004), [0.05, 0.03, 0.0405]);           // bolt logo
  return SCRAP;
};
M.craft_decoy = (k, root) => {
  k.add(L('plastic', 0x3a3a3c), box(0.12, 0.09, 0.07), [0, 0.045, 0]);
  k.add(L('metal_dark', 0x18181a), cyl(0.032, 0.032, 0.012, 10), [0, 0.05, 0.036], [HP, 0, 0]);
  k.add(L('metal', 0x606468), cyl(0.012, 0.012, 0.014, 8), [0, 0.05, 0.038], [HP, 0, 0]);
  k.add(L('metal', 0xb0b0b0), cyl(0.003, 0.003, 0.13, 4), [0.045, 0.14, 0], [0, 0, -0.15]);   // antenna
  k.add(B(null, 0xff3a2a), sph(0.007, 5, 4), [0.03, 0.098, 0]);
  k.add(B(null, 0x40ff70), box(0.014, 0.006, 0.004), [-0.04, 0.078, 0.0365]);
  k.add(L('metal', 0xc0c0c0), box(0.03, 0.005, 0.02), [0.02, 0.092, -0.01]);                // button
  setTip(root, [0, 0.09, 0]);
  return SCRAP;
};
M.craft_floodlight = (k, root) => {
  const dk = L('plastic', 0x2c2e32), y = L('paint', 0xd8b020);
  k.add(y, cyl(0.075, 0.09, 0.09, 10), [0, 0, -0.06], [HP, 0, 0]);                        // head
  k.add(L('metal', 0xc8c8c8), cyl(0.085, 0.085, 0.01, 10), [0, 0, -0.108], [HP, 0, 0]);   // bezel
  k.add(B(null, 0xfff4d0), cyl(0.07, 0.07, 0.004, 10), [0, 0, -0.114], [HP, 0, 0]);       // lens
  k.add(dk, box(0.05, 0.16, 0.06), [0, -0.1, 0.03], [0.15, 0, 0]);                        // handle grip
  k.add(dk, box(0.07, 0.03, 0.08), [0, -0.19, 0.04]);                                     // battery base
  k.add(y, box(0.02, 0.08, 0.02), [0, 0.05, -0.02]);                                      // yoke
  k.add(L('metal', 0x9a9a9a), cyl(0.008, 0.008, 0.08, 5), [0, 0.1, -0.02], [0, 0, HP]);   // carry bar
  k.add(B(null, 0x70ff90), box(0.012, 0.006, 0.004), [0, -0.19, 0.081]);
  setLight(root, [0, 0, -0.12], { type: 'spot', color: 0xfff4d0, intensity: 1.2, distance: 14, angle: 0.6 });
  setTip(root, [0, 0, -0.12]);
  return TOOL;
};
M.craft_lantern = (k, root) => {
  const dk = L('metal_dark', 0x2a2c30);
  k.add(dk, cyl(0.04, 0.05, 0.02, 8), [0, 0, 0]);
  k.add(L('glass', 0xffffff, { opacity: 0.4, double: true }), cyl(0.038, 0.038, 0.1, 8, true), [0, 0.06, 0]);
  k.add(B(null, 0x70ffd0), oct(0.032), [0, 0.06, 0], null, [0.8, 1.3, 0.8]);
  k.add(dk, cyl(0.032, 0.042, 0.02, 8), [0, 0.12, 0]);
  k.add(dk, tor(0.038, 0.004, 3, 8, PI), [0, 0.13, 0]);
  for (const a of [0, HP, PI, PI * 1.5]) k.add(dk, box(0.005, 0.1, 0.005), [Math.cos(a) * 0.04, 0.06, Math.sin(a) * 0.04]);
  k.add(B(null, 0x9affc8), sph(0.008, 4, 3), [0.015, 0.05, 0.01]);
  setLight(root, [0, 0.06, 0], { type: 'point', color: 0x70ffd0, intensity: 1.2, distance: 12 });
  setTip(root, [0, 0.06, 0]);
  return TOOL;
};
M.craft_gasmask = (k) => {
  const rub = L('rubber', 0x2c2e2a);
  k.add(rub, sph(0.09, 8, 6), [0, 0, 0], null, [1, 1.05, 0.8]);
  k.add(L('glass', 0x30402c, { opacity: 0.85 }), sph(0.03, 6, 4), [-0.038, 0.02, -0.06], null, [1, 0.8, 0.4]);
  k.add(L('glass', 0x30402c, { opacity: 0.85 }), sph(0.03, 6, 4), [0.038, 0.02, -0.06], null, [1, 0.8, 0.4]);
  k.add(L('metal', 0x50554a), cyl(0.036, 0.036, 0.05, 8), [0, -0.035, -0.09], [HP, 0, 0]);   // filter canister
  k.add(L('metal', 0x8a8e80), cyl(0.038, 0.038, 0.008, 8), [0, -0.035, -0.118], [HP, 0, 0]);
  k.add(B(null, 0xd8c040), cyl(0.02, 0.02, 0.004, 8), [0, -0.035, -0.123], [HP, 0, 0]);
  for (const sx of [-1, 1]) k.add(rub, box(0.01, 0.02, 0.09), [sx * 0.093, 0.0, 0.01]);   // straps
  k.add(rub, box(0.2, 0.014, 0.014), [0, 0.06, 0.05], [0, 0, 0]);
  return SCRAP;
};
M.craft_trap = (k) => {
  const steel = L('metal', 0xa0a4a8), dk = L('metal_dark', 0x3a3c40), rust = L('metal_rust', 0xb08a70);
  k.add(dk, box(0.3, 0.02, 0.18), [0, 0.01, 0]);
  k.add(rust, box(0.09, 0.012, 0.08), [0, 0.026, 0]);                                     // pressure plate
  for (const sz of [-1, 1]) {
    k.add(steel, tor(0.11, 0.008, 3, 12, PI), [0, 0.03, sz * 0.0], [0, sz > 0 ? 0 : PI, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) / 6 * PI;
      k.add(steel, cone(0.01, 0.04, 3), [Math.cos(a) * 0.11 * 0.98, 0.05, Math.sin(a) * 0.11 * 0.98 * (sz > 0 ? 1 : -1)], [0, 0, 0]);
    }
  }
  k.add(dk, cyl(0.014, 0.014, 0.04, 6), [-0.13, 0.03, 0], [0, 0, HP]);                    // spring
  k.add(steel, tor(0.03, 0.004, 3, 8), [0.16, 0.02, 0], [HP, 0, 0]);                      // chain ring
  k.add(dk, cyl(0.004, 0.004, 0.1, 4), [0.2, 0.012, 0.03], [HP, 0, 0.6]);
  return SCRAP;
};
M.craft_molotov = (k, root) => {
  k.add(L('glass', 0x2a5a2a, { opacity: 0.6, double: true }), lathe([[0, 0], [0.04, 0], [0.042, 0.01], [0.04, 0.13], [0.018, 0.17], [0.018, 0.23], [0.02, 0.24]], 9));
  k.add(B(null, 0xffb040), lathe([[0, 0.006], [0.037, 0.006], [0.036, 0.11], [0, 0.11]], 9));   // fuel
  k.add(L('fabric', 0xd8d0b8), cyl(0.011, 0.011, 0.07, 5), [0, 0.255, 0]);                       // rag
  k.add(L('fabric', 0xd8d0b8), cone(0.014, 0.05, 5), [0.006, 0.31, 0], [0, 0, -0.2]);
  k.add(B(null, 0xff6a1a), cone(0.016, 0.07, 5), [0.012, 0.35, 0], [0, 0, -0.2]);                // flame
  k.add(B(null, 0xffe080), cone(0.009, 0.045, 5), [0.012, 0.345, 0], [0, 0, -0.2]);
  k.add(L('fabric', 0xa02818), box(0.083, 0.03, 0.083), [0, 0.07, 0], [0, 0.78, 0]);             // label band
  setLight(root, [0.012, 0.35, 0], { type: 'point', color: 0xff8a30, intensity: 0.9, distance: 5 });
  return SCRAP;
};
M.craft_emp = (k, root) => {
  k.add(L('metal', 0x9aa0a8), sph(0.06, 10, 8), [0, 0.06, 0]);
  k.add(B(null, 0x50c8ff), tor(0.061, 0.006, 3, 14), [0, 0.06, 0], [HP, 0, 0]);
  k.add(B(null, 0x50c8ff), tor(0.061, 0.005, 3, 14), [0, 0.06, 0], [0.4, 0, 0]);
  k.add(L('metal_dark', 0x2a2c30), cyl(0.02, 0.026, 0.02, 8), [0, 0.128, 0]);
  k.add(L('metal', 0xc0c0c0), cyl(0.008, 0.008, 0.03, 5), [0, 0.15, 0]);
  k.add(B(null, 0xb0f0ff), sph(0.011, 5, 4), [0, 0.172, 0]);
  for (const a of [0, PI * 2 / 3, PI * 4 / 3]) k.add(L('metal_dark', 0x2a2c30), box(0.02, 0.02, 0.04), [Math.cos(a) * 0.055, 0.02, Math.sin(a) * 0.055], [0, -a, 0]);
  setLight(root, [0, 0.17, 0], { type: 'point', color: 0x50c8ff, intensity: 0.7, distance: 4 });
  return SCRAP;
};
M.craft_cryo = (k, root) => {
  k.add(L('paint', 0x88d0e8), cyl(0.032, 0.032, 0.1, 8), [0, 0.05, 0]);
  k.add(L('metal', 0xe0f0f8), cyl(0.033, 0.033, 0.014, 8), [0, 0.02, 0]);
  k.add(L('metal', 0xe0f0f8), cyl(0.033, 0.033, 0.014, 8), [0, 0.08, 0]);
  k.add(L('metal', 0xb0b8c0), cyl(0.012, 0.018, 0.024, 6), [0, 0.112, 0]);
  k.add(L('metal', 0xc8c8c8), box(0.012, 0.075, 0.006), [0, 0.13, 0.03], [-0.15, 0, 0]);
  k.add(L('metal', 0xc0c0c0), tor(0.012, 0.0022, 3, 8), [0.022, 0.13, 0], [0, HP, 0]);
  k.add(B(null, 0xd8ffff), box(0.03, 0.03, 0.003), [0, 0.05, 0.0335]);
  k.add(B(null, 0x40b0e0), box(0.006, 0.026, 0.004), [0, 0.05, 0.0345]);
  k.add(B(null, 0x40b0e0), box(0.026, 0.006, 0.004), [0, 0.05, 0.0345]);
  setTip(root, [0, 0.13, 0]);
  return TOOL;
};
M.craft_traumakit = (k, root) => {
  k.add(L('paint', 0xe8e8e2), box(0.3, 0.19, 0.11), [0, -0.12, 0]);
  k.add(B(null, 0xd02a20), box(0.1, 0.036, 0.004), [0, -0.12, 0.057]);                   // red cross
  k.add(B(null, 0xd02a20), box(0.036, 0.1, 0.004), [0, -0.12, 0.057]);
  k.add(L('plastic', 0x2a2a2a), box(0.11, 0.015, 0.022), [0, 0, 0]);                      // handle
  for (const sx of [-1, 1]) k.add(L('metal', 0xb8b8b8), box(0.03, 0.022, 0.006), [sx * 0.1, -0.05, 0.058]);
  k.add(B(null, 0x40e070), box(0.05, 0.012, 0.004), [0.09, -0.19, 0.057]);
  k.add(L('paint', 0x101010), box(0.3, 0.02, 0.112), [0, -0.055, 0]);                     // seam
  setTip(root, [0, -0.12, -0.06]);
  return TOOL;
};
M.craft_nailbat = (k, root) => {
  const w = L('wood_planks', 0xc09060), n = L('metal', 0xc8c8c8);
  k.add(L('rubber', 0x1a1a1a), cyl(0.017, 0.017, 0.18, 7), [0, 0, 0.1], [HP, 0, 0]);       // grip
  k.add(w, cyl(0.02, 0.026, 0.14, 7), [0, 0, -0.06], [HP, 0, 0]);
  k.add(w, cyl(0.026, 0.038, 0.32, 8), [0, 0, -0.27], [HP, 0, 0]);
  k.add(w, sph(0.038, 8, 5), [0, 0, -0.44], null, [1, 1, 0.5]);
  k.add(L('metal_dark', 0x40382c), cyl(0.0175, 0.0175, 0.02, 7), [0, 0, 0.0], [HP, 0, 0]);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, z = -0.24 - (i % 3) * 0.075;
    k.add(n, cyl(0.0035, 0.0035, 0.035, 4), [Math.cos(a) * 0.036, Math.sin(a) * 0.036, z], [0, 0, a + HP]);
    k.add(n, cyl(0.007, 0.007, 0.004, 5), [Math.cos(a) * 0.031, Math.sin(a) * 0.031, z], [0, 0, a + HP]);
  }
  setTip(root, [0, 0, -0.47]);
  return TOOL;
};

// ============================================================================================ strange items
M.strange_blackbox = (k, root) => {
  k.add(L('paint', 0xe0641c), box(0.2, 0.12, 0.13), [0, 0.06, 0]);
  k.add(L('metal_dark', 0x18181a), box(0.204, 0.03, 0.134), [0, 0.06, 0]);
  k.add(L('plastic', 0xe8e0d0), box(0.03, 0.045, 0.004), [-0.06, 0.06, 0.068]);           // reflective tags
  k.add(L('plastic', 0xe8e0d0), box(0.03, 0.045, 0.004), [0.06, 0.06, -0.068]);
  k.add(L('metal', 0xb0b0b0), cyl(0.014, 0.014, 0.012, 8), [0.07, 0.126, 0.02]);           // underwater beacon
  k.add(L('metal_dark', 0x101010), box(0.06, 0.004, 0.01), [-0.02, 0.122, 0.03]);
  k.add(B(null, 0xff2a2a), sph(0.007, 5, 4), [0.07, 0.136, 0.02]);                         // blinking red light
  k.add(L('metal_dark', 0x101010), box(0.012, 0.13, 0.135), [0.06, 0.06, 0], [0, 0, 0.2]); // impact crack
  k.add(B(null, 0x40ffb0), box(0.04, 0.008, 0.004), [-0.06, 0.02, 0.068]);
  setLight(root, [0.07, 0.136, 0.02], { type: 'point', color: 0xff2a2a, intensity: 0.5, distance: 3 });
  return SCRAP;
};
M.strange_aicore = (k, root) => {
  k.add(L('metal_dark', 0x26282c), box(0.16, 0.16, 0.16), [0, 0.09, 0]);
  k.add(L('metal_plate', 0x585c64), box(0.17, 0.02, 0.17), [0, 0.02, 0]);
  for (const [x, z] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) k.add(L('metal', 0xd0d0d0), cyl(0.007, 0.007, 0.008, 6), [x, 0.171, z]);
  k.add(L('plastic', 0x101418), box(0.11, 0.004, 0.11), [0, 0.1735, 0]);
  k.add(B(null, 0xff2a40), circ(0.032, 10), [0, 0.09, 0.0805]);                            // dead red eye
  k.add(L('metal_dark', 0x0a0a0c), circ(0.014, 8), [0, 0.09, 0.081]);
  for (let i = 0; i < 6; i++) k.add(B(null, i % 2 ? 0x40f0ff : 0xff8a30), box(0.006, 0.006, 0.004), [-0.05 + i * 0.02, 0.15, 0.0805]);
  k.add(L('paint', 0xc84020), cyl(0.006, 0.006, 0.12, 4), [0.09, 0.05, 0.04], [0.3, 0, HP + 0.5]);   // torn wires
  k.add(L('paint', 0x2060c8), cyl(0.006, 0.006, 0.1, 4), [-0.08, 0.06, 0.06], [-0.4, 0, HP - 0.4]);
  k.add(B(null, 0xffe040), box(0.012, 0.004, 0.004), [0.14, 0.03, 0.09]);                  // spark
  setLight(root, [0, 0.09, 0.09], { type: 'point', color: 0xff2a40, intensity: 0.6, distance: 4 });
  return SCRAP;
};
M.strange_egg = (k, root) => {
  k.add(L('plastic', 0x1e1a26), lathe([[0, 0], [0.06, 0], [0.066, 0.014], [0.05, 0.02], [0, 0.02]], 10));
  k.add(L('paint', 0xc4b6a0), sph(0.06, 10, 8), [0, 0.09, 0], null, [0.85, 1.25, 0.85]);
  for (const [x, y, z, r] of [[0.03, 0.12, 0.04, 0.012], [-0.035, 0.08, 0.04, 0.016], [0.0, 0.05, 0.06, 0.01], [0.03, 0.06, -0.045, 0.014], [-0.03, 0.14, -0.03, 0.01]])
    k.add(L('paint', 0x5a3a70), sph(r, 5, 4), [x, y, z], null, [1, 1, 0.5]);
  k.add(B(null, 0x8affc8), box(0.004, 0.06, 0.004), [0.02, 0.11, 0.052], [0, 0, 0.3]);      // glowing crack
  k.add(B(null, 0x8affc8), box(0.004, 0.03, 0.004), [0.03, 0.075, 0.056], [0, 0, -0.5]);
  setLight(root, [0, 0.09, 0], { type: 'point', color: 0x8affc8, intensity: 0.5, distance: 3 });
  return SCRAP;
};
M.strange_watch = (k, root) => {
  const gold = L('gold', 0xd8b048);
  k.add(gold, cyl(0.05, 0.05, 0.02, 14), [0, 0.01, 0], [HP, 0, 0]);
  k.add(L('plastic', 0x101830), cyl(0.043, 0.043, 0.004, 14), [0, 0.0115, 0.011], [HP, 0, 0]);
  k.add(B(null, 0x6a8aff), tor(0.04, 0.0015, 3, 16), [0, 0.0115, 0.0125]);
  k.add(B(null, 0xe8f0ff), box(0.003, 0.03, 0.002), [0, 0.02, 0.0145], [0, 0, 0.2]);       // hands (wrong time)
  k.add(B(null, 0xff5a8a), box(0.0025, 0.038, 0.002), [0, 0.008, 0.015], [0, 0, -1.9]);
  k.add(gold, cyl(0.009, 0.009, 0.014, 6), [0, 0.066, 0], [HP, 0, 0]);
  k.add(gold, tor(0.012, 0.003, 3, 8), [0, 0.082, 0], [0, 0, 0]);
  for (let i = 0; i < 9; i++) k.add(gold, tor(0.012, 0.0028, 3, 6), [0.035 * Math.sin(i * 0.7 + 0.2), 0.096 + i * 0.02, 0.0], [i % 2 ? HP : 0, i * 0.3, 0]);
  k.add(B(null, 0x9aa8ff), circ(0.006, 6), [0, 0.0115, 0.015]);
  setLight(root, [0, 0.01, 0.02], { type: 'point', color: 0x6a8aff, intensity: 0.5, distance: 3 });
  void root;
  return SCRAP;
};

export const COMPONENT_MODEL_IDS = Object.freeze(Object.keys(M));

const r3 = (v) => Math.round(v * 1000) / 1000;
/** Build a component / crafted / strange item model, or null when this file has no model for the id. */
export function createComponentModel(id) {
  const fn = M[id];
  if (!fn) return null;
  const root = new THREE.Group();
  root.name = 'item_' + id;
  const k = new Kit();
  const info = fn(k, root) || SCRAP;
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

// ============================================================================================ WORKBENCH
const TOP_Y = 0.955;                                      // bench surface height
export const WORKBENCH_SIZE = Object.freeze({ w: 2.3, d: 0.78, top: TOP_Y });

function pegboardTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#a98657'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 128; i += 2) for (let j = 0; j < 64; j += 2) if (((i + j) & 3) === 0 && (i % 8 === 0 || j % 8 === 0) && i % 4 === 0 && j % 4 === 0) { x.fillStyle = '#2a1c10'; x.fillRect(i, j, 2, 2); }
  x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 128; i += 3) x.fillRect(i, 0, 1, 64);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.6);
  return t;
}
function screenTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#031208'; x.fillRect(0, 0, 96, 64);
  x.fillStyle = '#40ff80'; x.font = 'bold 13px monospace'; x.textBaseline = 'top';
  x.fillText('FAB-1', 6, 6);
  x.fillStyle = '#2aa858'; x.font = '10px monospace';
  ['> CRAFT', '> DISMANTLE', '> ANALYZE', '> READY_'].forEach((s, i) => x.fillText(s, 6, 22 + i * 10));
  x.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 64; y += 2) x.fillRect(0, y, 96, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The ship workbench: solid bench + drawer cabinet + vise + pegboard with tools + shelf + gooseneck lamp + fabricator
 * monitor. Origin = floor at the bench centre, the front faces +z, the back (pegboard) at z = -d/2.
 * Returns { group, top: y of the surface, lamp: {bulb mesh, glowMat}, screen, colliders: [[x,y,z,hx,hy,hz]], lampPos, dispose() }.
 */
export function createWorkbench() {
  const group = new THREE.Group();
  group.name = 'workbench';
  const k = new Kit();
  const W = WORKBENCH_SIZE.w, D = WORKBENCH_SIZE.d;
  const wood = L('wood_planks', 0xc8a070), woodD = L('wood_dark', 0x7a5634), steel = L('metal_dark', 0x3a3e44), steelL = L('metal', 0xb0b4b8);
  const green = L('paint', 0x3c5a48), red = L('paint', 0x8a2a1e), yel = L('paint', 0xd8b020);

  // --- bench body
  k.add(wood, box(W, 0.07, D), [0, TOP_Y - 0.035, 0], null, null, 0.7);                       // top slab
  k.add(steel, box(W + 0.02, 0.025, D + 0.02), [0, TOP_Y - 0.075, 0]);                        // apron
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(steel, box(0.07, TOP_Y - 0.09, 0.07), [sx * (W / 2 - 0.06), (TOP_Y - 0.09) / 2, sz * (D / 2 - 0.06)]);
  k.add(woodD, box(W - 0.75, 0.035, D - 0.14), [-0.36, 0.26, 0]);                              // lower shelf
  k.add(steel, box(W - 0.75, 0.05, 0.03), [-0.36, 0.5, -D / 2 + 0.05]);                        // back brace
  // items stored on the lower shelf: crates + barrel
  k.add(L('crate_wood', 0xffffff), box(0.42, 0.24, 0.4), [-0.8, 0.4, 0.0], [0, 0.12, 0], null, 0.5);
  k.add(L('crate_metal', 0xffffff), box(0.36, 0.2, 0.3), [-0.28, 0.38, 0.06], [0, -0.2, 0], null, 0.5);
  k.add(L('metal_rust', 0xb08a70), cyl(0.09, 0.09, 0.2, 8), [0.12, 0.38, -0.05]);
  // --- drawer cabinet (right end)
  const cx = W / 2 - 0.3;
  k.add(green, box(0.56, TOP_Y - 0.08, D - 0.04), [cx, (TOP_Y - 0.08) / 2 + 0.02, 0]);
  for (let i = 0; i < 3; i++) {
    const y = 0.2 + i * 0.25;
    k.add(L('paint', 0x4a6c58), box(0.5, 0.2, 0.012), [cx, y, D / 2 - 0.02 + 0.006]);
    k.add(steelL, box(0.16, 0.022, 0.03), [cx, y + 0.03, D / 2 + 0.006]);
    k.add(yel, box(0.07, 0.03, 0.004), [cx - 0.16, y - 0.04, D / 2 - 0.008 + 0.014]);
  }
  // --- vise (left corner)
  const vx = -W / 2 + 0.22;
  k.add(red, box(0.14, 0.07, 0.2), [vx, TOP_Y + 0.035, 0.04]);
  k.add(steel, box(0.16, 0.05, 0.05), [vx, TOP_Y + 0.095, 0.16]);                              // fixed jaw
  k.add(steelL, box(0.14, 0.04, 0.03), [vx, TOP_Y + 0.09, 0.02]);                               // moving jaw
  k.add(steelL, cyl(0.009, 0.009, 0.16, 6), [vx, TOP_Y + 0.06, -0.09], [HP, 0, 0]);            // screw
  k.add(steelL, cyl(0.006, 0.006, 0.14, 5), [vx, TOP_Y + 0.06, -0.17], [0, 0, HP]);            // handle
  for (const s of [-1, 1]) k.add(red, sph(0.012, 5, 4), [vx + s * 0.07, TOP_Y + 0.06, -0.17]);
  // --- items on the bench top: mug, tape roll, wrench, cable coil, plate scraps, screws
  k.add(L('paint', 0x2860c8), cyl(0.04, 0.036, 0.09, 8), [0.52, TOP_Y + 0.045, 0.14]);
  k.add(L('paint', 0x2860c8), tor(0.026, 0.008, 3, 8, PI), [0.565, TOP_Y + 0.05, 0.14], [0, 0, -HP]);
  k.add(L('plastic', 0x9aa0a4), tor(0.05, 0.02, 4, 12), [-0.42, TOP_Y + 0.02, 0.2], [HP, 0, 0]);
  k.add(steelL, box(0.2, 0.012, 0.03), [0.18, TOP_Y + 0.006, 0.24], [0, 0.4, 0]);
  k.add(steelL, tor(0.028, 0.006, 3, 8), [0.11, TOP_Y + 0.006, 0.31], [HP, 0, 0]);
  k.add(L('metal_rust', 0xb8b0a8), box(0.12, 0.01, 0.09), [-0.02, TOP_Y + 0.005, 0.12], [0, 0.5, 0]);
  for (let i = 0; i < 6; i++) k.add(steelL, cyl(0.005, 0.005, 0.02, 5), [0.28 + (i % 3) * 0.03, TOP_Y + 0.006, 0.03 + Math.floor(i / 3) * 0.03], [HP, 0.4 * i, 0]);
  // soldering iron with an orange-hot tip
  k.add(L('plastic', 0x22262a), cyl(0.011, 0.014, 0.16, 6), [0.05, TOP_Y + 0.02, -0.02], [HP, 0.5, 0]);
  k.add(steelL, cyl(0.004, 0.004, 0.06, 4), [0.12, TOP_Y + 0.02, -0.07], [HP, 0.5, 0]);
  k.add(B(null, 0xff5a20), sph(0.005, 4, 3), [0.15, TOP_Y + 0.02, -0.085]);

  // --- pegboard + tools (back wall)
  const boardY = TOP_Y + 0.85, boardH = 0.95, boardW = W - 0.15, bz = -D / 2 + 0.03;
  const pt = pegboardTexture();
  const pegMat = pt ? new THREE.MeshLambertMaterial({ map: pt, flatShading: true }) : L('wood_planks', 0xa98657);
  const board = new THREE.Mesh(box(boardW, boardH, 0.03), pegMat);
  board.position.set(0, boardY, bz);
  group.add(board);
  k.add(woodD, box(boardW + 0.04, 0.04, 0.05), [0, boardY + boardH / 2 + 0.02, bz]);
  k.add(woodD, box(boardW + 0.04, 0.04, 0.05), [0, boardY - boardH / 2 - 0.02, bz]);
  const hz = bz + 0.03;
  const outline = L('plastic', 0x2a1c10);
  const tool = (x, y, sx, sy) => k.add(outline, box(sx + 0.03, sy + 0.03, 0.004), [x, y, hz - 0.006]);
  // hammer
  tool(-0.8, boardY + 0.02, 0.05, 0.4);
  k.add(woodD, box(0.03, 0.34, 0.02), [-0.8, boardY - 0.01, hz + 0.004]);
  k.add(steel, box(0.13, 0.06, 0.03), [-0.8, boardY + 0.19, hz + 0.006]);
  // wrench
  tool(-0.55, boardY + 0.02, 0.06, 0.4);
  k.add(steelL, box(0.032, 0.32, 0.014), [-0.55, boardY, hz + 0.004]);
  k.add(steelL, tor(0.032, 0.012, 3, 6, PI * 1.6), [-0.55, boardY + 0.19, hz + 0.004], [0, 0, 0.9]);
  // saw
  tool(-0.2, boardY + 0.04, 0.26, 0.36);
  k.add(steelL, box(0.26, 0.2, 0.006), [-0.2, boardY + 0.08, hz + 0.004], [0, 0, 0.0]);
  k.add(L('wood_planks', 0xb08050), box(0.1, 0.08, 0.02), [-0.14, boardY - 0.12, hz + 0.006]);
  // pliers + screwdriver + clipboard
  tool(0.16, boardY + 0.05, 0.05, 0.3);
  k.add(red, box(0.03, 0.26, 0.016), [0.16, boardY + 0.05, hz + 0.005]);
  k.add(steelL, box(0.008, 0.06, 0.008), [0.16, boardY + 0.2, hz + 0.005]);
  tool(0.36, boardY + 0.05, 0.06, 0.3);
  k.add(yel, box(0.032, 0.14, 0.02), [0.36, boardY - 0.04, hz + 0.006]);
  k.add(steelL, box(0.008, 0.16, 0.008), [0.36, boardY + 0.14, hz + 0.005]);
  k.add(L('plastic', 0xe8e0c8), box(0.26, 0.34, 0.012), [0.7, boardY + 0.02, hz + 0.004]);      // clipboard / blueprint sheet
  k.add(B(null, 0x3a6ad8), box(0.22, 0.28, 0.004), [0.7, boardY + 0.02, hz + 0.011]);
  k.add(B(null, 0xa8c8ff), box(0.14, 0.004, 0.003), [0.7, boardY + 0.08, hz + 0.014]);
  k.add(B(null, 0xa8c8ff), box(0.004, 0.14, 0.003), [0.66, boardY + 0.0, hz + 0.014]);
  k.add(steelL, box(0.1, 0.03, 0.02), [0.7, boardY + 0.2, hz + 0.008]);
  // tape rolls + coiled cable hung on pegs
  k.add(L('plastic', 0xb8b8b0), tor(0.045, 0.016, 4, 12), [-0.95, boardY - 0.3, hz + 0.02]);
  k.add(L('metal', 0xc8763a), tor(0.05, 0.014, 4, 12), [0.98, boardY - 0.3, hz + 0.02]);

  // --- shelf above the pegboard with jars / boxes
  const shY = boardY + boardH / 2 + 0.3;
  k.add(woodD, box(boardW * 0.8, 0.035, 0.24), [0.1, shY, bz + 0.1]);
  for (const sx of [-1, 1]) k.add(steel, box(0.03, 0.2, 0.2), [0.1 + sx * boardW * 0.38, shY - 0.1, bz + 0.1]);
  k.add(L('cardboard', 0xc8a070), box(0.22, 0.14, 0.18), [-0.42, shY + 0.088, bz + 0.1], [0, 0.1, 0]);
  k.add(L('paint', 0xb02a1c), box(0.16, 0.2, 0.14), [-0.1, shY + 0.118, bz + 0.1]);
  k.add(L('glass', 0xffffff, { opacity: 0.4, double: true }), cyl(0.06, 0.06, 0.16, 8), [0.24, shY + 0.098, bz + 0.1]);
  k.add(B(null, 0x70ff90), cyl(0.05, 0.05, 0.1, 8), [0.24, shY + 0.07, bz + 0.1]);
  k.add(L('crate_metal', 0xffffff), box(0.2, 0.12, 0.16), [0.58, shY + 0.078, bz + 0.1], [0, -0.15, 0], null, 0.5);

  // --- gooseneck lamp (emissive bulb)
  const lx = 0.55, lampBaseY = TOP_Y + 0.0;
  k.add(steel, cyl(0.06, 0.07, 0.02, 8), [lx, lampBaseY + 0.01, -D / 2 + 0.16]);
  k.add(steel, cyl(0.008, 0.008, 0.6, 5), [lx, lampBaseY + 0.31, -D / 2 + 0.16]);
  k.add(steel, cyl(0.008, 0.008, 0.36, 5), [lx, lampBaseY + 0.6, -D / 2 + 0.34], [HP - 0.3, 0, 0]);
  k.add(yel, cone(0.09, 0.11, 8, true), [lx, lampBaseY + 0.6, -D / 2 + 0.5], [Math.PI, 0, 0]);
  k.add(B(null, 0xfff0c0), sph(0.035, 6, 5), [lx, lampBaseY + 0.56, -D / 2 + 0.5]);

  // --- fabricator monitor
  k.add(L('plastic', 0xa8a498), box(0.42, 0.32, 0.3), [-0.9, TOP_Y + 0.16, -0.16], [0, 0.22, 0]);
  k.add(L('plastic', 0x8a877c), box(0.14, 0.04, 0.16), [-0.9, TOP_Y + 0.02, -0.16], [0, 0.22, 0]);
  k.into(group);
  // glowing screen (own material: emissive canvas)
  const st = screenTexture();
  const screen = new THREE.Mesh(box(0.34, 0.24, 0.006), st ? new THREE.MeshBasicMaterial({ map: st }) : B(null, 0x40ff80));
  screen.position.set(-0.9 + Math.sin(0.22) * 0.155, TOP_Y + 0.17, -0.16 + Math.cos(0.22) * 0.155);
  screen.rotation.y = 0.22;
  group.add(screen);
  // lamp glow halo card (additive, cheap)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), glowMat);
  halo.position.set(lx, lampBaseY + 0.52, -D / 2 + 0.5);
  halo.rotation.x = HP;
  group.add(halo);

  const lampPos = new THREE.Vector3(lx, lampBaseY + 0.55, -D / 2 + 0.5);
  const colliders = [
    [0, TOP_Y / 2, 0, W / 2, TOP_Y / 2, D / 2],                 // whole bench body (top slab rests items at y = TOP_Y)
    [0, boardY, -D / 2 + 0.02, boardW / 2, boardH / 2, 0.03],   // pegboard (keeps the player from clipping the wall)
  ];
  return {
    group, top: TOP_Y, size: WORKBENCH_SIZE, lampPos, colliders, screen, halo,
    dispose() {
      group.traverse((o) => {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
        if (o.material && !Array.isArray(o.material) && (o.material === pegMat || o.material === glowMat || o === screen)) { o.material.map?.dispose?.(); o.material.dispose?.(); }
      });
    },
  };
}
