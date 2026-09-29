// MAPS5 props (wave 4): procedural low-poly set dressing for Estate 9 and Cold Storage. Ids are used as 'm5:<id>' through world/propfactory.js
// (createAnyProp), so decor builders instance them (one InstancedMesh per material of the prototype) and facility code can merge them.
// Same conventions as models/props2.js: metres, +Y up, front = +Z, origin = bottom centre, userData.colliders. Glowing parts use unlit
// (MeshBasic) materials only - NO scene lights are ever added, so the constant light-count rule holds. Geometry is merged per material (Kit).
//   filing_wall   a wall of steel filing cabinets (drawers ajar, label plates)      cryo_pod / cryo_pod_open   upright cryo capsule
//   fountain      tiered stone fountain, glowing water                              topiary   4 clipped-hedge statues (variant 3 = the gardener)
//   broken_rack   tilted server rack, door hanging, sparks                          conveyor  roller conveyor with crates
//   archive_ladder  fixed archive ladder (opts.h)                                   bench     stone garden bench           ice_cluster  glowing ice crystals
import * as THREE from 'three';
import { getMaterial, getBasicMaterial, seededRandom, hashString } from '../render/textures.js';
import { ModelKit } from './items.js';

const { Kit, G } = ModelKit;
const { box, cyl, cone, sph } = G;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const r3 = (v) => Math.round(v * 1000) / 1000;
const col = (c, x, y, z, w, h, d) => c.colliders.push({ c: [r3(x), r3(y), r3(z)], s: [r3(w), r3(h), r3(d)] });

/** footprints [w, d] (metres) for placement clearance */
export const SIZE5 = { filing_wall: [2.4, 0.5], cryo_pod: [1.0, 1.0], cryo_pod_open: [1.0, 1.0], fountain: [3.4, 3.4], topiary: [1.0, 1.0], topiary1: [1.0, 1.0], topiary2: [1.0, 1.0], topiary3: [1.0, 1.0], broken_rack: [0.9, 0.9], conveyor: [4.0, 1.2], archive_ladder: [0.7, 0.3], bench: [1.9, 0.6], ice_cluster: [1.4, 1.4] };
export const PROP5_IDS = ['filing_wall', 'cryo_pod', 'cryo_pod_open', 'fountain', 'topiary', 'topiary1', 'topiary2', 'topiary3', 'broken_rack', 'conveyor', 'archive_ladder', 'bench', 'ice_cluster'];

const P5 = Object.create(null);
const STEEL = () => L('metal', 0x8e98a2), STEELD = () => L('metal_dark', 0x4a525c), STONE = () => L('concrete_stained', 0xb8b4a8), MARBLE = () => L('marble', 0xd8d4c8);

// ------------------------------------------------------------------------------------------------ filing cabinets
P5.filing_wall = (k, c) => {
  const cw = 0.6, n = 4, h = 2.0;
  const body = L('metal', 0x7f8a72), front = L('metal', 0x9aa48c), hand = L('metal', 0x3a3e38), tag = L(null, 0xe8e0c0);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * cw;
    k.add(body, box(cw - 0.02, h, 0.5), [x, h / 2, 0]);
    for (let d = 0; d < 5; d++) {
      const y = 0.22 + d * 0.38, open = c.rng() < 0.16 ? 0.06 + c.rng() * 0.25 : 0;
      k.add(front, box(cw - 0.07, 0.33, 0.03), [x, y, 0.255 + open]);
      if (open) k.add(L(null, 0xd8d0b8), box(cw - 0.12, 0.05, 0.3), [x, y - 0.08, 0.12 + open / 2]);   // paper poking out of the ajar drawer
      k.add(hand, box(0.22, 0.03, 0.03), [x, y + 0.06, 0.29 + open]);
      k.add(tag, box(0.14, 0.06, 0.005), [x, y - 0.06, 0.273 + open]);
    }
  }
  k.add(B(null, 0x48e070), box(0.05, 0.05, 0.02), [-0.9, 1.95, 0.26]);   // one tiny status LED
  col(c, 0, h / 2, 0, cw * n, h, 0.52);
};

// ------------------------------------------------------------------------------------------------ cryo pods
function cryo(k, c, open) {
  const frame = STEELD(), plinth = L('metal_plate', 0x505a66), frost = L(null, 0xdcecf4);
  k.add(plinth, box(1.0, 0.25, 1.0), [0, 0.125, 0]);
  k.add(frame, cyl(0.46, 0.5, 2.0, 8), [0, 1.25, 0]);
  k.add(frost, cyl(0.5, 0.5, 0.1, 8), [0, 0.3, 0]);
  k.add(frost, cyl(0.42, 0.46, 0.14, 8), [0, 2.28, 0]);                                // frosted cap
  k.add(STEEL(), box(0.5, 1.6, 0.06), [0, 1.2, 0.44]);                                 // door frame on the front
  if (!open) {
    k.add(B(null, 0x5ad8ff), box(0.4, 1.4, 0.03), [0, 1.2, 0.475]);                    // glowing window
    k.add(B(null, 0x102030), sph(0.11, 6, 4), [0, 1.78, 0.45]);                         // the sleeper: a dark head + torso silhouette
    k.add(B(null, 0x102030), box(0.26, 0.5, 0.06), [0, 1.42, 0.45]);
    k.add(B(null, 0x102030), box(0.34, 0.06, 0.06), [0, 1.62, 0.45]);
    k.add(B(null, 0x2af0a0), box(0.06, 0.06, 0.02), [0.3, 0.55, 0.47]);                // status LED (green = alive)
  } else {
    k.add(B(null, 0x1a2a34), box(0.4, 1.4, 0.03), [0, 1.2, 0.475]);                    // dark, empty window
    k.add(STEEL(), box(0.44, 1.5, 0.04), [0.3, 1.2, 0.62], [0, -0.9, 0]);              // the door hangs open
    k.add(B(null, 0xff4a3a), box(0.06, 0.06, 0.02), [0.3, 0.55, 0.47]);
  }
  for (const s of [-1, 1]) k.add(frame, box(0.06, 0.06, 0.5), [s * 0.36, 0.1, -0.2]);   // feed pipes to the wall
  k.add(STEELD(), box(0.16, 0.9, 0.16), [0, 0.7, -0.55]);
  col(c, 0, 1.15, 0, 1.0, 2.3, 1.0);
}
P5.cryo_pod = (k, c) => cryo(k, c, false);
P5.cryo_pod_open = (k, c) => cryo(k, c, true);

// ------------------------------------------------------------------------------------------------ fountain
P5.fountain = (k, c) => {
  const st = STONE(), mb = MARBLE(), water = B(null, 0x4aa0c8), foam = B(null, 0xbfe8f4);
  k.add(st, cyl(1.7, 1.75, 0.5, 10), [0, 0.25, 0]);                                   // outer basin wall
  k.add(mb, cyl(1.78, 1.78, 0.1, 10), [0, 0.52, 0]);                                  // rim
  k.add(water, cyl(1.55, 1.55, 0.06, 10), [0, 0.46, 0]);                              // glowing water
  k.add(st, cyl(0.35, 0.5, 1.1, 8), [0, 0.95, 0]);                                    // pedestal
  k.add(mb, cyl(0.95, 0.3, 0.32, 10), [0, 1.62, 0]);                                  // upper bowl
  k.add(water, cyl(0.82, 0.82, 0.05, 10), [0, 1.76, 0]);
  k.add(st, cyl(0.12, 0.2, 0.6, 6), [0, 2.05, 0]);
  k.add(mb, cyl(0.42, 0.14, 0.18, 8), [0, 2.4, 0]);
  k.add(foam, cone(0.1, 0.28, 5), [0, 2.63, 0]);                                       // the spout
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.add(foam, box(0.04, 0.5, 0.04), [Math.cos(a) * 0.55, 1.5, Math.sin(a) * 0.55], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]); }   // falling water
  col(c, 0, 0.3, 0, 3.4, 0.6, 3.4); col(c, 0, 1.2, 0, 0.9, 2.4, 0.9);
};

// ------------------------------------------------------------------------------------------------ topiary statues
const topiary = (v) => (k, c) => {
  const g1 = L(null, 0x2f5a2a, { flat: true }), g2 = L(null, 0x3b6b32, { flat: true }), g3 = L(null, 0x244a22, { flat: true }), plinth = STONE();
  k.add(plinth, box(0.9, 0.35, 0.9), [0, 0.175, 0]);
  if (v === 0) {           // spiral cone
    k.add(g1, cone(0.5, 0.9, 7), [0, 0.8, 0]); k.add(g2, cone(0.4, 0.8, 7), [0, 1.45, 0]); k.add(g1, cone(0.28, 0.7, 7), [0, 2.0, 0]); k.add(g3, cone(0.12, 0.35, 5), [0, 2.45, 0]);
  } else if (v === 1) {    // tiers
    k.add(g1, sph(0.5, 7, 5), [0, 0.85, 0]); k.add(g2, sph(0.38, 7, 5), [0, 1.5, 0]); k.add(g1, sph(0.26, 6, 4), [0, 1.96, 0]);
  } else if (v === 2) {    // bird
    k.add(g2, sph(0.42, 7, 5), [0, 0.95, 0], null, [1, 0.9, 1.35]); k.add(g1, sph(0.22, 6, 4), [0, 1.5, 0.45]); k.add(g3, cone(0.08, 0.3, 4), [0, 1.5, 0.75], [1.5, 0, 0]);
    k.add(g3, cone(0.2, 0.7, 5), [0, 1.1, -0.65], [-1.9, 0, 0]);
  } else {                 // the gardener: a hedge figure with shears
    k.add(g1, box(0.5, 0.9, 0.34), [0, 1.0, 0]); k.add(g2, sph(0.24, 6, 5), [0, 1.66, 0]);
    for (const s of [-1, 1]) k.add(g3, box(0.14, 0.7, 0.14), [s * 0.36, 1.1, 0.12], [-0.7, 0, s * 0.15]);
    k.add(L('metal', 0xb8c0c8), box(0.04, 0.5, 0.02), [0, 1.0, 0.55], [0, 0, 0.5]); k.add(L('metal', 0xb8c0c8), box(0.04, 0.5, 0.02), [0, 1.0, 0.55], [0, 0, -0.5]);   // shears
    k.add(B(null, 0xffd23a), box(0.06, 0.05, 0.02), [-0.09, 1.7, 0.21]); k.add(B(null, 0xffd23a), box(0.06, 0.05, 0.02), [0.09, 1.7, 0.21]);
  }
  col(c, 0, 1.2, 0, 1.0, 2.4, 1.0);
};
P5.topiary = topiary(0); P5.topiary1 = topiary(1); P5.topiary2 = topiary(2); P5.topiary3 = topiary(3);

// ------------------------------------------------------------------------------------------------ broken server rack
P5.broken_rack = (k, c) => {
  const tilt = 0.16 + c.rng() * 0.1;
  const frame = L('metal_dark', 0x30363e), front = L('server_front', 0x9aa4b0);
  k.add(frame, box(0.8, 2.0, 0.8), [0, 1.0, 0], [0, 0, tilt]);
  k.add(front, box(0.7, 1.86, 0.03), [0.02, 1.0, 0.41], [0, 0, tilt]);
  k.add(front, box(0.66, 1.8, 0.03), [-0.42, 0.95, 0.75], [0, 1.15, tilt + 0.05]);          // door hanging on one hinge
  for (let i = 0; i < 4; i++) k.add(B(null, i % 2 ? 0xff6a2a : 0x35e8ff), box(0.05, 0.03, 0.02), [-0.15 + i * 0.1, 1.4 - (i % 3) * 0.22, 0.43], [0, 0, tilt]);
  k.add(B(null, 0xffe08a), box(0.06, 0.06, 0.06), [0.3, 1.95, 0.2]);                          // spark
  for (let i = 0; i < 5; i++) k.add(L(null, 0x141414), box(0.02, 0.5 + c.rng() * 0.6, 0.02), [-0.3 + i * 0.15, 0.4, 0.5 + c.rng() * 0.2], [0.3, 0, 0.1]);   // cables
  col(c, 0, 1.0, 0, 1.0, 2.0, 0.9);
};

// ------------------------------------------------------------------------------------------------ conveyor
P5.conveyor = (k, c) => {
  const frame = L('metal', 0xd8b02a), dark = STEELD(), belt = L('rubber', 0x2a2a30);
  k.add(belt, box(3.8, 0.08, 0.9), [0, 0.86, 0]);
  for (const s of [-1, 1]) k.add(frame, box(3.9, 0.16, 0.08), [0, 0.94, s * 0.5]);
  for (let i = 0; i < 9; i++) k.add(dark, cyl(0.05, 0.05, 1.0, 5), [-1.7 + i * 0.425, 0.84, 0], [Math.PI / 2, 0, 0]);
  for (const x of [-1.7, 0, 1.7]) for (const s of [-1, 1]) k.add(dark, box(0.1, 0.8, 0.1), [x, 0.4, s * 0.45]);
  k.add(L('crate_wood', 0xa88a5a), box(0.55, 0.4, 0.5), [-0.9, 1.1, 0.02]); k.add(L('crate_metal', 0x8a9098), box(0.45, 0.35, 0.45), [0.5, 1.08, -0.05]);
  k.add(B(null, 0x35e8ff), box(0.5, 0.05, 0.05), [1.6, 1.05, 0.56]);                         // status strip
  col(c, 0, 0.5, 0, 4.0, 1.0, 1.2);
};

// ------------------------------------------------------------------------------------------------ archive ladder
P5.archive_ladder = (k, c) => {
  const H = c.opts.h || 4.5, w = L('wood_dark', 0x6a4a2a), m = STEEL();
  for (const s of [-1, 1]) k.add(w, box(0.06, H, 0.06), [s * 0.28, H / 2, 0]);
  for (let y = 0.3; y < H; y += 0.3) k.add(w, box(0.5, 0.045, 0.045), [0, y, 0.005]);
  for (const y of [0.6, H - 0.4]) for (const s of [-1, 1]) k.add(m, box(0.06, 0.06, 0.24), [s * 0.28, y, -0.12]);   // wall brackets
  k.add(B(null, 0xffd070), box(0.5, 0.05, 0.05), [0, 0.06, 0.03]);                            // a marker strip at the foot
};

// ------------------------------------------------------------------------------------------------ garden bench
P5.bench = (k, c) => {
  const st = STONE(), wood = L('wood_planks', 0x7a5a38);
  for (const s of [-1, 1]) { k.add(st, box(0.18, 0.5, 0.5), [s * 0.75, 0.25, 0]); k.add(st, box(0.14, 0.4, 0.1), [s * 0.75, 0.7, -0.22]); }
  for (let i = 0; i < 3; i++) k.add(wood, box(1.8, 0.05, 0.14), [0, 0.5, -0.17 + i * 0.17]);
  k.add(wood, box(1.7, 0.3, 0.04), [0, 0.75, -0.24]);
  col(c, 0, 0.45, 0, 1.9, 0.9, 0.6);
};

// ------------------------------------------------------------------------------------------------ ice cluster
P5.ice_cluster = (k, c) => {
  const ice = B(null, 0xa8dcf4), ice2 = B(null, 0xd6f2ff), base = L('snow', 0xdfe8f0);
  k.add(base, cyl(0.6, 0.7, 0.2, 7), [0, 0.1, 0]);
  const n = 5 + c.pick(3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + c.rng(), r = 0.15 + c.rng() * 0.35, h = 0.7 + c.rng() * 1.1;
    k.add(i % 2 ? ice : ice2, cone(0.13 + c.rng() * 0.08, h, 5), [Math.cos(a) * r, 0.15 + h / 2, Math.sin(a) * r], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25]);
  }
  col(c, 0, 0.7, 0, 1.0, 1.4, 1.0);
};

function unknown(k, c) { k.add(L('crate_wood'), box(0.5, 0.5, 0.5), [0, 0.25, 0]); col(c, 0, 0.25, 0, 0.5, 0.5, 0.5); }

export function createProp5(id, opts = {}) {
  opts = opts || {};
  const seed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const root = new THREE.Group();
  root.name = 'prop_m5_' + id;
  const rng = seededRandom(hashString(`m5:${id}:${seed}`));
  const c = { id, opts, seed, rng, root, colliders: [], pick: (n) => Math.floor(rng() * n) % n };
  const k = new Kit();
  (P5[id] || unknown)(k, c);
  k.into(root);
  root.userData.propId = 'm5:' + id;
  root.userData.mount = 'floor';
  root.userData.colliders = c.colliders;
  root.updateMatrixWorld(true);
  return root;
}
