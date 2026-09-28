// FOOD & DRINKS models (module `food`, docs/wave2/food.md): procedural item models (cans, bottles, noodle cup, ramen bowl, pizza, bar,
// cake, mystery meat), the ship table + stools and the vending machine / fridge. Cheap flat-shaded meshes, no textures, safe to import in node.
// Item convention: origin = grip, upright on +Y (the icon renderer and the hand frame both use that).
import * as THREE from 'three';

const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const bas = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...o });
function add(parent, geo, mat, p = [0, 0, 0], r = null, s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  parent.add(m);
  return m;
}
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const sph = (r, a = 7, b = 5) => new THREE.SphereGeometry(r, a, b);
const METAL = 0xc9ced4;

function canModel(body, band, accent = 0xffffff) {
  return () => {
    const g = new THREE.Group();
    add(g, cyl(0.033, 0.033, 0.12, 9), lam(body), [0, 0.06, 0]);
    add(g, cyl(0.0345, 0.0345, 0.03, 9), lam(band), [0, 0.06, 0]);
    add(g, cyl(0.03, 0.033, 0.008, 9), lam(METAL), [0, 0.124, 0]);
    add(g, cyl(0.03, 0.033, 0.008, 9), lam(METAL), [0, -0.002, 0]);
    add(g, box(0.02, 0.006, 0.012), lam(accent), [0, 0.13, 0]);
    add(g, box(0.05, 0.04, 0.004), bas(accent), [0, 0.085, 0.034]);
    return g;
  };
}
function bottleModel(glass, label, capColor) {
  return () => {
    const g = new THREE.Group();
    const gm = () => lam(glass, { transparent: true, opacity: 0.88 });
    add(g, cyl(0.031, 0.031, 0.15, 9), gm(), [0, 0.075, 0]);
    add(g, cyl(0.0225, 0.031, 0.03, 9), gm(), [0, 0.165, 0]);
    add(g, cyl(0.0125, 0.0125, 0.07, 7), gm(), [0, 0.215, 0]);
    add(g, cyl(0.0145, 0.0145, 0.014, 7), lam(capColor), [0, 0.256, 0]);
    add(g, cyl(0.0322, 0.0322, 0.07, 9), lam(label), [0, 0.07, 0]);
    add(g, box(0.03, 0.03, 0.004), bas(0xffffff), [0, 0.075, 0.032]);
    return g;
  };
}
function noodleCup() {
  const g = new THREE.Group();
  add(g, cyl(0.055, 0.038, 0.1, 9), lam(0xe8e2d0), [0, 0.05, 0]);
  add(g, cyl(0.0565, 0.0565, 0.03, 9), lam(0xd83a2a), [0, 0.06, 0]);
  add(g, cyl(0.058, 0.058, 0.008, 9), lam(0xf4f0e0), [0, 0.104, 0]);
  add(g, box(0.05, 0.05, 0.004), bas(0xffd040), [0, 0.055, 0.052]);
  add(g, box(0.008, 0.008, 0.11), lam(0xb0b0b0), [0.035, 0.14, 0.0], [0.6, 0, 0.35]);   // plastic fork
  return g;
}
function ramenBowl() {
  const g = new THREE.Group();
  add(g, sph(0.08, 9, 5), lam(0xf2efe6), [0, 0.09, 0], [Math.PI, 0, 0], [1, 0.75, 1]);
  add(g, cyl(0.062, 0.062, 0.012, 9), lam(0xe8a840), [0, 0.09, 0]);   // broth
  add(g, cyl(0.05, 0.05, 0.016, 8), lam(0xf4d878), [0, 0.098, 0]);    // noodles
  add(g, sph(0.018, 6, 4), lam(0xfff6d8), [0.02, 0.112, 0.01]);         // egg
  add(g, box(0.018, 0.006, 0.03), lam(0x3a9a3a), [-0.02, 0.112, -0.015]);
  for (const s of [-1, 1]) add(g, cyl(0.004, 0.004, 0.2, 5), lam(0x8a5a2a), [0.03 * s, 0.17, 0.02], [0.35, 0, 0.5 * s]);
  return g;
}
function pizzaSlice() {
  const g = new THREE.Group();
  const slice = add(g, cyl(0.13, 0.13, 0.014, 3), lam(0xf0c060), [0, 0.01, 0], [0, Math.PI / 2, 0]);
  slice.scale.set(1, 1, 0.9);
  add(g, cyl(0.011, 0.011, 0.16, 6), lam(0xc98a3a), [-0.065, 0.02, 0], [0, 0, Math.PI / 2]);
  for (const [x, z] of [[0.02, 0.0], [-0.02, 0.05], [-0.02, -0.05]]) add(g, cyl(0.014, 0.014, 0.006, 7), lam(0xb8382a), [x, 0.022, z]);
  add(g, box(0.02, 0.005, 0.01), lam(0x3a8a3a), [0.035, 0.021, 0.03]);
  return g;
}
function pizzaBox() {
  const g = new THREE.Group();
  add(g, box(0.26, 0.035, 0.26), lam(0xc8a06a), [0, 0.0175, 0]);
  add(g, box(0.26, 0.012, 0.26), lam(0xd6b07a), [0, 0.04, 0]);
  add(g, cyl(0.07, 0.07, 0.004, 10), lam(0xd83a2a), [0, 0.048, 0]);
  add(g, box(0.1, 0.004, 0.02), lam(0xf4f0e0), [0, 0.048, 0.1]);
  return g;
}
function energyBar() {
  const g = new THREE.Group();
  add(g, box(0.13, 0.022, 0.048), lam(0x2a6ad0), [0, 0.011, 0]);
  add(g, box(0.06, 0.004, 0.036), bas(0xffd040), [0, 0.024, 0]);
  add(g, box(0.012, 0.022, 0.05), lam(0xd8dce0), [0.066, 0.011, 0]);
  add(g, box(0.012, 0.022, 0.05), lam(0xd8dce0), [-0.066, 0.011, 0]);
  return g;
}
function partyCake() {
  const g = new THREE.Group();
  add(g, cyl(0.1, 0.1, 0.05, 12), lam(0xf4e4c8), [0, 0.025, 0]);
  add(g, cyl(0.1, 0.1, 0.012, 12), lam(0xff7ac0), [0, 0.056, 0]);
  add(g, cyl(0.065, 0.065, 0.045, 12), lam(0xfff0f4), [0, 0.0845, 0]);
  add(g, cyl(0.065, 0.065, 0.01, 12), lam(0x7ad8ff), [0, 0.112, 0]);
  add(g, cyl(0.0035, 0.0035, 0.04, 5), lam(0xffe066), [0, 0.137, 0]);
  add(g, sph(0.008, 5, 4), bas(0xffa030), [0, 0.163, 0]);
  add(g, sph(0.014, 6, 4), lam(0xd0203a), [0.03, 0.12, 0.02]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, sph(0.009, 5, 4), lam(i % 2 ? 0xff7ac0 : 0x7ad8ff), [Math.cos(a) * 0.09, 0.06, Math.sin(a) * 0.09]); }
  add(g, cyl(0.12, 0.12, 0.008, 12), lam(0xd8d8e0), [0, -0.003, 0]);
  return g;
}
function mysteryMeat() {
  const g = new THREE.Group();
  add(g, sph(0.065, 7, 5), lam(0xb85a5a), [0, 0.06, 0], null, [1.25, 0.9, 1]);
  add(g, sph(0.04, 6, 4), lam(0xd88a8a), [0.03, 0.09, 0.02]);
  add(g, cyl(0.009, 0.009, 0.15, 5), lam(0xf0e8d8), [-0.09, 0.06, 0], [0, 0, 1.2]);
  for (const s of [-1, 1]) add(g, sph(0.014, 5, 4), lam(0xf0e8d8), [-0.15, 0.09 + s * 0.008, s * 0.012]);
  add(g, box(0.05, 0.02, 0.05), lam(0x7a2a2a), [0.02, 0.0, 0.04]);
  return g;
}

export const FOOD_MODELS = {
  fd_noodles: noodleCup,
  fd_ramen: ramenBowl,
  fd_pizza: pizzaSlice,
  fd_pizzabox: pizzaBox,
  fd_bar: energyBar,
  fd_cake: partyCake,
  fd_meat: mysteryMeat,
  fd_mega: canModel(0x1a2a1a, 0x27ffb0, 0x27ffb0),
  fd_coffee: canModel(0x4a2f1a, 0xd0a060, 0xffe0b0),
  fd_glitch: canModel(0x2a1a3a, 0xff3ad0, 0x00ffd0),
  fd_cringe: canModel(0xe8c020, 0xff8a20, 0xffffff),
  fd_lager: bottleModel(0x6a4a10, 0x2a5aa0, 0xd8b04a),
  fd_raki: bottleModel(0xd8ecf4, 0x2a8a8a, 0xe8e8e8),
  fd_vodka: bottleModel(0xcfe8f0, 0xc02a2a, 0x2a2a2a),
};

// ------------------------------------------------------------------------------------------------ ship table + stools
export const TABLE_SIZE = { w: 1.3, d: 0.8, h: 0.76, stoolR: 0.17, stoolH: 0.46, stoolDz: 0.68, stoolDx: 0.32 };
/** Small mess-hall table with four stools. Origin on the floor at the table centre. userData.colliders = [[cx, cy, cz, hx, hy, hz]]. */
export function createTable() {
  const g = new THREE.Group();
  g.name = 'ship_table';
  const S = TABLE_SIZE;
  add(g, box(S.w, 0.05, S.d), lam(0xa88458), [0, S.h - 0.025, 0]);
  add(g, box(S.w + 0.02, 0.012, S.d * 0.32), lam(0xd8404a), [0, S.h + 0.001, 0]);   // checkered runner
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, box(0.06, S.h - 0.05, 0.06), lam(0x5a4632), [sx * (S.w / 2 - 0.08), (S.h - 0.05) / 2, sz * (S.d / 2 - 0.08)]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * S.stoolDx, z = sz * S.stoolDz;
    add(g, cyl(S.stoolR, S.stoolR, 0.05, 9), lam(0x3a4a6a), [x, S.stoolH, z]);
    add(g, cyl(0.03, 0.04, S.stoolH - 0.03, 6), lam(0x8a8f96), [x, (S.stoolH - 0.03) / 2, z]);
    add(g, cyl(0.11, 0.11, 0.015, 8), lam(0x8a8f96), [x, 0.01, z]);
  }
  add(g, cyl(0.045, 0.045, 0.002, 9), lam(0xf4f0e0), [-0.3, S.h + 0.008, 0.05]);            // plates
  add(g, cyl(0.045, 0.045, 0.002, 9), lam(0xf4f0e0), [0.3, S.h + 0.008, -0.05]);
  add(g, cyl(0.02, 0.026, 0.06, 7), lam(0x7ad8ff), [0.0, S.h + 0.03, 0]);                   // pitcher
  g.userData.colliders = [[0, S.h / 2, 0, S.w / 2, S.h / 2, S.d / 2]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.userData.colliders.push([sx * S.stoolDx, S.stoolH / 2, sz * S.stoolDz, S.stoolR, S.stoolH / 2, S.stoolR]);
  g.userData.size = { w: S.w + 0.2, d: S.d + 2 * S.stoolDz + 0.4 };
  return g;
}

// ------------------------------------------------------------------------------------------------ vending machine / fridge
export const MACHINE_SIZE = { vend: { w: 0.9, h: 1.85, d: 0.8 }, fridge: { w: 0.8, h: 1.75, d: 0.72 } };
/** kind: 'vend' | 'fridge'. Front faces +Z. userData.colliders = [[cx, cy, cz, hx, hy, hz]], userData.size = { w, h, d }. */
export function createMachine(kind = 'vend') {
  const g = new THREE.Group();
  g.name = 'food_' + kind;
  const S = MACHINE_SIZE[kind] || MACHINE_SIZE.vend;
  if (kind === 'fridge') {
    add(g, box(S.w, S.h, S.d), lam(0xe4e8ea), [0, S.h / 2, 0]);
    add(g, box(S.w + 0.01, 0.012, 0.005), lam(0x9aa0a4), [0, S.h * 0.62, S.d / 2 + 0.002]);
    add(g, box(0.03, 0.34, 0.04), lam(0x8a9096), [S.w / 2 - 0.09, S.h * 0.8, S.d / 2 + 0.02]);
    add(g, box(0.03, 0.5, 0.04), lam(0x8a9096), [S.w / 2 - 0.09, S.h * 0.36, S.d / 2 + 0.02]);
    for (let i = 0; i < 4; i++) add(g, box(0.05, 0.05, 0.005), lam([0xd8404a, 0x40a0d8, 0xd8c040, 0x60c060][i]), [-0.28 + i * 0.07, S.h * 0.5, S.d / 2 + 0.006]);   // magnets
  } else {
    add(g, box(S.w, S.h, S.d), lam(0x2a4aa8), [0, S.h / 2, 0]);
    add(g, box(0.62, 1.15, 0.03), lam(0x10141c), [-0.06, S.h * 0.63, S.d / 2 + 0.005]);
    add(g, box(0.58, 1.1, 0.01), bas(0x9ad8ff, { transparent: true, opacity: 0.4 }), [-0.06, S.h * 0.63, S.d / 2 + 0.024]);
    const cols = [0x27ffb0, 0xd0a060, 0xff3ad0, 0xffa020, 0x60a0ff];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) add(g, cyl(0.03, 0.03, 0.1, 6), lam(cols[(r + c) % cols.length]), [-0.28 + c * 0.11, S.h * 0.63 + 0.4 - r * 0.26, S.d / 2 - 0.02]);
    add(g, box(0.16, 0.34, 0.04), lam(0x1a2a60), [S.w / 2 - 0.09, S.h * 0.64, S.d / 2 + 0.01]);
    add(g, box(0.1, 0.1, 0.006), bas(0x27ffb0), [S.w / 2 - 0.09, S.h * 0.72, S.d / 2 + 0.032]);
    add(g, box(0.5, 0.16, 0.05), lam(0x0a0e18), [-0.06, 0.2, S.d / 2 - 0.02]);
    add(g, box(0.62, 0.08, 0.01), bas(0xffd040), [-0.06, S.h - 0.09, S.d / 2 + 0.008]);   // marquee
  }
  g.userData.colliders = [[0, S.h / 2, 0, S.w / 2, S.h / 2, S.d / 2]];
  g.userData.size = S;
  return g;
}

export function disposeGroup(root) {
  root?.traverse?.((o) => {
    o.geometry?.dispose?.();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) m.dispose?.();
  });
  root?.removeFromParent?.();
}
