// REPOMAPS props (wave 8): procedural low-poly set dressing for the four themed interiors (Influencer Mansion, Content Academy, Cold Storage Data
// Station, Museum of Deleted Content). Ids are used as 'st:<id>' through world/propfactory.js (createAnyProp). Conventions as models/maps5_props.js:
// metres, +Y up, front = +Z, origin = bottom centre, userData.colliders, glow = unlit MeshBasic only (NO scene lights, the light count stays constant).
//   ring_light  tripod + glowing ring        trophy_case  glass case with gold cups     neon_backdrop  pink / cyan streaming backdrop
//   school_desk desk + chair                 lectern      teacher's podium               blackboard     wall board (chalk)
//   rail_shelf  bookshelf on a floor rail    frost_rack   frosted server rack            ice_column     pillar of blue ice
//   glass_case  museum plinth + glass cube   stanchion    velvet rope posts (visual)     art_frame      big framed "deleted" post
import * as THREE from 'three';
import { getMaterial, getBasicMaterial, seededRandom, hashString } from '../render/textures.js';
import { ModelKit } from './items.js';

const { Kit, G } = ModelKit;
const { box, cyl, sph } = G;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const r3 = (v) => Math.round(v * 1000) / 1000;
const col = (c, x, y, z, w, h, d) => c.colliders.push({ c: [r3(x), r3(y), r3(z)], s: [r3(w), r3(h), r3(d)] });

export const PROPST_IDS = ['ring_light', 'trophy_case', 'neon_backdrop', 'school_desk', 'lectern', 'blackboard', 'rail_shelf', 'frost_rack', 'ice_column', 'glass_case', 'stanchion', 'art_frame'];
/** rail_shelf footprint: shelf is SHELF_W wide (x), SHELF_D deep (z); the game module slides it along x */
export const SHELF_W = 1.8, SHELF_D = 0.5, SHELF_H = 2.2;

const P = Object.create(null);
const GOLD = () => L('gold', 0xe8c060), DARK = () => L('metal_dark', 0x30343c), GLASS = () => L(null, 0xbfe4f0, { opacity: 0.28 });

P.ring_light = (k, c) => {
  const pole = DARK(), n = 14, R = 0.42, y = 1.75;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.limb(pole, [0, 1.0, 0], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 0.02, 0.02, 5); }
  k.add(pole, cyl(0.025, 0.025, 1.7, 6), [0, 0.85, 0]);
  for (let i = 0; i < n; i++) {                       // ring made of short glowing bars (no torus: cheap, reads as a ring)
    const a = (i / n) * Math.PI * 2;
    k.add(B(null, 0xfff2e0), box(0.2, 0.06, 0.06), [Math.cos(a) * R, y + Math.sin(a) * R, 0.02], [0, 0, a + Math.PI / 2]);
  }
  k.add(pole, sph(0.06, 6, 4), [0, y, -0.05]);        // phone clamp in the middle
  col(c, 0, 0.9, 0, 0.5, 1.8, 0.5);
};

P.trophy_case = (k, c) => {
  const frame = L('wood_dark', 0x4a2c20), gold = GOLD();
  k.add(frame, box(1.2, 0.35, 0.5), [0, 0.175, 0]);
  k.add(frame, box(1.2, 0.08, 0.5), [0, 2.0, 0]);
  for (const s of [-1, 1]) k.add(frame, box(0.06, 1.6, 0.5), [s * 0.57, 1.15, 0]);
  k.add(GLASS(), box(1.08, 1.6, 0.42), [0, 1.15, 0.03]);
  for (const y of [0.75, 1.3]) k.add(L('wood_dark', 0x6a4030), box(1.08, 0.04, 0.42), [0, y, 0]);
  for (let i = 0; i < 3; i++) for (const y of [0.79, 1.34]) {
    k.add(gold, cyl(0.07, 0.04, 0.2, 6), [(i - 1) * 0.34, y + 0.1, 0]);
    k.add(gold, cyl(0.03, 0.03, 0.06, 5), [(i - 1) * 0.34, y + 0.23, 0]);
  }
  k.add(B(null, 0xff5cc8), box(1.0, 0.03, 0.03), [0, 0.32, 0.26]);     // pink under-glow strip
  col(c, 0, 1.0, 0, 1.2, 2.0, 0.5);
};

P.neon_backdrop = (k, c) => {
  k.add(L('st_pinkgold', 0xffffff), box(2.6, 2.3, 0.12), [0, 1.15, 0]);
  k.add(B(null, 0xff3ea8), box(2.3, 0.06, 0.05), [0, 2.05, 0.08]);
  k.add(B(null, 0x38e8ff), box(2.3, 0.06, 0.05), [0, 0.3, 0.08]);
  for (const s of [-1, 1]) k.add(B(null, 0xff3ea8), box(0.06, 1.8, 0.05), [s * 1.15, 1.17, 0.08]);
  k.add(B(null, 0xffffff), box(0.7, 0.28, 0.04), [0, 1.2, 0.08]);        // "LIVE" plate
  k.add(B(null, 0xd8203c), box(0.6, 0.18, 0.05), [0, 1.2, 0.1]);
  for (const s of [-1, 1]) k.add(DARK(), box(0.08, 0.5, 0.5), [s * 1.2, 0.25, -0.2]);   // feet
  col(c, 0, 1.15, 0, 2.6, 2.3, 0.25);
};

P.school_desk = (k, c) => {
  const wood = L('wood_planks', 0xc09a68), steel = DARK();
  k.add(wood, box(0.8, 0.05, 0.55), [0, 0.74, 0]);
  for (const [x, z] of [[-0.35, -0.22], [0.35, -0.22], [-0.35, 0.22], [0.35, 0.22]]) k.add(steel, box(0.03, 0.72, 0.03), [x, 0.36, z]);
  k.add(wood, box(0.4, 0.04, 0.4), [0, 0.44, 0.55]);
  k.add(wood, box(0.4, 0.36, 0.04), [0, 0.66, 0.74]);
  for (const x of [-0.17, 0.17]) k.add(steel, box(0.03, 0.42, 0.03), [x, 0.21, 0.55]);
  col(c, 0, 0.4, 0.25, 0.85, 0.8, 1.05);
};

P.lectern = (k, c) => {
  const wood = L('wood_dark', 0x6a4830);
  k.add(wood, box(0.7, 0.9, 0.5), [0, 0.45, 0]);
  k.add(wood, box(0.78, 0.06, 0.6), [0, 1.0, 0], [0.32, 0, 0]);
  k.add(L(null, 0xeeeadc), box(0.4, 0.02, 0.3), [0, 1.06, 0.02], [0.32, 0, 0]);
  col(c, 0, 0.55, 0, 0.75, 1.1, 0.55);
};

P.blackboard = (k, c) => {
  const frame = L('wood_dark', 0x7a5a38);
  k.add(frame, box(3.0, 1.4, 0.08), [0, 1.5, 0]);
  k.add(L(null, 0x24382c), box(2.84, 1.24, 0.04), [0, 1.5, 0.05]);
  k.add(B(null, 0xd8d8cc), box(2.0, 0.02, 0.01), [-0.3, 1.85, 0.075]);
  k.add(B(null, 0xd8d8cc), box(1.4, 0.02, 0.01), [-0.6, 1.6, 0.075]);
  k.add(B(null, 0xd89090), box(0.8, 0.02, 0.01), [0.5, 1.3, 0.075]);
  k.add(frame, box(2.8, 0.05, 0.12), [0, 0.86, 0.06]);                     // chalk tray
  k.add(L('wood_planks', 0xa07c50), box(3.0, 0.82, 0.3), [0, 0.41, 0.1]);   // low cabinet under the board: nothing floats
  col(c, 0, 1.1, 0.06, 3.0, 2.2, 0.3);
};

P.rail_shelf = (k, c) => {
  const wood = L('wood_dark', 0x5a3a24), W = SHELF_W, D = SHELF_D, H = SHELF_H;
  for (const s of [-1, 1]) k.add(wood, box(0.05, H, D), [s * (W / 2 - 0.025), H / 2, 0]);
  for (let y = 0.1; y < H; y += 0.5) k.add(wood, box(W, 0.04, D), [0, y, 0]);
  k.add(wood, box(W, H, 0.03), [0, H / 2, -D / 2 + 0.015]);
  const books = [0xa83232, 0x2c5aa0, 0x3a8a4a, 0xd8b040, 0x6a3a8a, 0xd8d0b8];
  for (let row = 0; row < 4; row++) {
    let x = -W / 2 + 0.08;
    while (x < W / 2 - 0.16) {
      const w = 0.05 + c.rng() * 0.05, h = 0.26 + c.rng() * 0.14;
      k.add(L(null, books[Math.floor(c.rng() * books.length)]), box(w, h, D * 0.7), [x + w / 2, 0.12 + row * 0.5 + h / 2, 0.02]);
      x += w + 0.01;
    }
  }
  k.add(DARK(), box(W + 0.1, 0.04, 0.12), [0, 0.02, D / 2 + 0.02]);        // the floor rail it slides on
  col(c, 0, H / 2, 0, W, H, D);
};

P.frost_rack = (k, c) => {
  const body = L('metal_dark', 0x56626e), frost = L(null, 0xdcecf4);
  k.add(body, box(0.7, 2.1, 0.9), [0, 1.05, 0]);
  k.add(frost, box(0.74, 0.12, 0.94), [0, 2.14, 0]);
  k.add(frost, box(0.74, 0.3, 0.94), [0, 0.15, 0]);
  for (let i = 0; i < 9; i++) {
    k.add(L('server_front', 0xa0b4c4), box(0.6, 0.16, 0.03), [0, 0.5 + i * 0.17, 0.46]);
    k.add(B(null, i % 3 ? 0x5ad8ff : 0x9af0ff), box(0.05, 0.03, 0.02), [0.22, 0.54 + i * 0.17, 0.48]);
  }
  col(c, 0, 1.05, 0, 0.72, 2.1, 0.92);
};

P.ice_column = (k, c) => {
  const ice = B(null, 0x9ad4f0), ice2 = B(null, 0xd0eeff);
  k.add(L('snow', 0xdfe8f0), cyl(0.55, 0.62, 0.25, 7), [0, 0.125, 0]);
  k.add(ice, cyl(0.3, 0.42, 2.2, 6), [0, 1.3, 0]);
  k.add(ice2, cyl(0.16, 0.3, 0.6, 6), [0.06, 2.6, 0.04]);
  col(c, 0, 1.45, 0, 0.85, 2.9, 0.85);
};

P.glass_case = (k, c) => {
  const plinth = L('marble', 0xe4e0d8), item = c.pick(3);
  k.add(plinth, box(0.9, 0.9, 0.9), [0, 0.45, 0]);
  k.add(GLASS(), box(0.8, 0.7, 0.8), [0, 1.27, 0]);
  k.add(DARK(), box(0.84, 0.03, 0.84), [0, 0.92, 0]);
  k.add(item === 0 ? B(null, 0xd8a040) : item === 1 ? B(null, 0xd85a5a) : B(null, 0x7ad0e8), item === 1 ? sph(0.16, 7, 5) : box(0.24, 0.3, 0.24), [0, 1.1, 0]);
  k.add(B(null, 0xffffff), box(0.3, 0.02, 0.02), [0, 0.75, 0.46]);         // label plate
  col(c, 0, 0.8, 0, 0.9, 1.6, 0.9);
};

P.stanchion = (k, c) => {
  const brass = GOLD();
  for (const s of [-1, 1]) {
    k.add(brass, cyl(0.16, 0.18, 0.05, 7), [s * 0.8, 0.025, 0]);
    k.add(brass, cyl(0.03, 0.03, 0.95, 6), [s * 0.8, 0.5, 0]);
    k.add(brass, sph(0.05, 6, 4), [s * 0.8, 1.0, 0]);
  }
  k.add(L(null, 0x9a1830), box(1.6, 0.05, 0.05), [0, 0.86, 0]);
  col(c, -0.8, 0.5, 0, 0.3, 1.0, 0.3);
  col(c, 0.8, 0.5, 0, 0.3, 1.0, 0.3);
};

P.art_frame = (k, c) => {
  const w = 1.8, h = 1.3, y = 1.6, gold = GOLD();
  k.add(gold, box(w + 0.16, h + 0.16, 0.06), [0, y, 0]);
  k.add(L('st_redacted', 0xffffff), box(w, h, 0.04), [0, y, 0.04]);
  k.add(B(null, 0xd8203c), box(0.5, 0.06, 0.02), [0.5, y - 0.45, 0.065]);
  k.add(B(null, 0xffffff), box(0.3, 0.02, 0.02), [0, y - 0.85, 0.05]);
  for (const s of [-1, 1]) { k.add(DARK(), box(0.07, y - h / 2 - 0.08, 0.07), [s * 0.7, (y - h / 2 - 0.08) / 2, 0]); k.add(DARK(), box(0.2, 0.03, 0.34), [s * 0.7, 0.015, 0.05]); }   // easel feet
  col(c, 0, 1.15, 0, w + 0.16, 2.3, 0.14);
};

function unknown(k, c) { k.add(L('crate_wood'), box(0.5, 0.5, 0.5), [0, 0.25, 0]); col(c, 0, 0.25, 0, 0.5, 0.5, 0.5); }

export function createPropSt(id, opts = {}) {
  opts = opts || {};
  const seed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const root = new THREE.Group();
  root.name = 'prop_st_' + id;
  const rng = seededRandom(hashString(`st:${id}:${seed}`));
  const c = { id, opts, seed, rng, root, colliders: [], pick: (n) => Math.floor(rng() * n) % n };
  const k = new Kit();
  (P[id] || unknown)(k, c);
  k.into(root);
  root.userData.propId = 'st:' + id;
  root.userData.mount = 'floor';
  root.userData.colliders = c.colliders;
  root.updateMatrixWorld(true);
  return root;
}
