// HOMEWORLD procedural models (module 'homeworld'): one merged vertex-coloured LIT mesh + one merged EMISSIVE mesh per building
// (2 draw calls), geometry cached per (type, level). Levels are visibly bigger / fancier (more floors, stacks, panels, glow).
// Conventions: metres, +Y up, origin = floor centre of the footprint, footprint = size * 3 m square, long sides along x.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, CELL } from '../game/homeworld_core.js';

const PI = Math.PI;
const C = { steel: 0x8a9096, dark: 0x30343a, mid: 0x565c64, rust: 0x8a5a3a, yellow: 0xd8b020, red: 0xd23a2a, green: 0x40e070, cyan: 0x50d8ff, blue: 0x3c6cc8, white: 0xe8e8e0,
  copper: 0xc8763a, olive: 0x4a5a3a, orange: 0xe07a20, purple: 0xb35cff, pink: 0xff4fd8, gold: 0xffd23f, glass: 0x7fc8d8, plant: 0x3fa84a, soil: 0x5a3c22, brick: 0x8a4a3a, sand: 0xb8a078 };
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
function P(kind, a, pos = [0, 0, 0], rot = [0, 0, 0], color = C.steel) {
  let g;
  if (kind === 'box') g = new THREE.BoxGeometry(a[0], a[1], a[2]);
  else if (kind === 'cyl') g = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 8);
  else if (kind === 'cone') g = new THREE.ConeGeometry(a[0], a[1], a[2] || 6);
  else if (kind === 'sph') g = new THREE.SphereGeometry(a[0], a[1] || 8, a[2] || 6);
  else g = new THREE.TorusGeometry(a[0], a[1], a[2] || 4, a[3] || 10);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _one);
  g.applyMatrix4(_m);
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const merge = (l) => (l.length ? (l.length === 1 ? l[0] : mergeGeometries(l, false)) : null);
export const LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
export const EMIT = new THREE.MeshBasicMaterial({ vertexColors: true });
const WRECK = new THREE.MeshLambertMaterial({ color: 0x2a2624 });
const GHOST = { ok: new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.45, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.45, depthWrite: false }) };

// ---------------------------------------------------------------------------------------------- per-type builders: (lv, S, L, G) push primitives
// L = lit list, G = glow list, S = footprint side in metres, lv = 1..5
const B = {
  farm(lv, S, L, G) {
    const w = S - 1.4, h = 2 + 0.7 * lv;
    L.push(P('box', [S - 0.4, 0.25, S - 0.4], [0, 0.12, 0], [0, 0, 0], C.dark), P('box', [w, h, w * 0.8], [0, 0.25 + h / 2, 0.4], [0, 0, 0], C.mid), P('box', [w + 0.4, 0.3, w * 0.8 + 0.4], [0, 0.25 + h, 0.4], [0, 0, 0], C.dark));
    for (let i = 0; i < lv + 1; i++) G.push(P('box', [0.7, 0.5, 0.06], [-w / 2 + 0.7 + i * ((w - 1.2) / (lv + 1)), 0.9 + (i % 2) * 0.8, 0.4 + w * 0.4 + 0.02], [0, 0, 0], i % 2 ? C.cyan : C.green));
    if (lv >= 3) L.push(P('cyl', [0.05, 0.05, 1.6, 5], [w / 2 - 0.4, 0.25 + h + 0.8, 0], [0, 0, 0], C.steel), P('sph', [0.7, 8, 4], [w / 2 - 0.4, 0.25 + h + 1.5, 0], [0.4, 0, 0], C.white));
    if (lv >= 4) L.push(P('box', [2.4, 1.6, 2.4], [-w / 2 + 1.2, 0.25 + h + 0.8, -w * 0.3], [0, 0, 0], C.steel));
    if (lv >= 5) G.push(P('box', [w * 0.7, 0.35, 0.08], [0, 0.25 + h - 0.3, 0.4 + w * 0.4 + 0.05], [0, 0, 0], C.pink));
  },
  rack(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.dark));
    const n = Math.min(6, lv + 1), h = 2.2 + 0.25 * lv;
    for (let i = 0; i < n; i++) {
      const x = -S / 2 + 0.8 + (i % 3) * 1.9, z = i < 3 ? -0.8 : 0.9;
      L.push(P('box', [1.3, h, 1.1], [x, 0.2 + h / 2, z], [0, 0, 0], C.dark));
      for (let k = 0; k < 4 + lv; k++) G.push(P('box', [0.12, 0.08, 0.05], [x - 0.4 + (k % 4) * 0.27, 0.6 + Math.floor(k / 4) * 0.5, z + (i < 3 ? 0.58 : -0.58)], [0, 0, 0], k % 3 ? C.green : C.cyan));
    }
    L.push(P('cyl', [0.12, 0.12, S - 1, 6], [0, h + 0.5, 0], [0, 0, HALF], C.copper));
  },
  generator(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.3, S - 0.4], [0, 0.15, 0], [0, 0, 0], C.dark), P('box', [S - 1, 1.5 + lv * 0.2, S - 1.4], [0, 1.0 + lv * 0.1, 0], [0, 0, 0], C.olive));
    for (let i = 0; i < 1 + Math.ceil(lv / 2); i++) L.push(P('cyl', [0.2, 0.26, 2 + i * 0.4, 6], [-S / 2 + 0.9 + i * 0.8, 2.3 + i * 0.2, -0.5], [0, 0, 0], C.dark));
    G.push(P('box', [S - 1.4, 0.16, 0.06], [0, 0.9 + lv * 0.1, (S - 1.4) / 2 + 0.02], [0, 0, 0], C.orange));
    L.push(P('cyl', [0.4, 0.4, 1.2, 8], [S / 2 - 0.7, 0.9, S / 2 - 0.9], [0, 0, HALF], C.red));
    if (lv >= 4) G.push(P('sph', [0.22, 6, 4], [0, 2.9, 0], [0, 0, 0], C.orange));
  },
  solar(lv, S, L, G) {
    L.push(P('box', [S - 0.6, 0.15, S - 0.6], [0, 0.08, 0], [0, 0, 0], C.dark));
    const n = Math.min(4, lv > 2 ? 4 : lv + 1);
    for (let i = 0; i < n; i++) {
      const x = -S / 4 + (i % 2) * (S / 2), z = -S / 4 + Math.floor(i / 2) * (S / 2);
      L.push(P('cyl', [0.06, 0.06, 0.9, 5], [x, 0.55, z], [0, 0, 0], C.steel), P('box', [S / 2 - 0.15, 0.08, S / 2 - 0.15], [x, 1.1, z], [-0.5, 0, 0], C.blue));
      G.push(P('box', [S / 2 - 0.5, 0.02, S / 2 - 0.5], [x, 1.15, z + 0.02], [-0.5, 0, 0], 0x2a58c8));
    }
    if (lv >= 5) G.push(P('sph', [0.2, 6, 4], [0, 1.8, 0], [0, 0, 0], C.cyan));
  },
  cooler(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.dark));
    for (let i = 0; i < Math.min(3, 1 + Math.floor(lv / 2)); i++) {
      const y = 0.2 + i * 1.3;
      L.push(P('cyl', [1.15, 1.15, 1.2, 12], [0, y + 0.6, 0], [0, 0, 0], C.steel), P('cyl', [1.25, 1.25, 0.12, 12], [0, y + 1.25, 0], [0, 0, 0], C.mid));
      G.push(P('cyl', [0.9, 0.9, 0.05, 10], [0, y + 1.32, 0], [0, 0, 0], C.cyan));
      for (let k = 0; k < 4; k++) L.push(P('box', [0.12, 0.05, 1.7], [0, y + 1.34, 0], [0, (k * PI) / 4, 0], C.white));
    }
    for (const s of [-1, 1]) L.push(P('cyl', [0.12, 0.12, S - 1.4, 5], [s * (S / 2 - 0.5), 0.7, 0], [HALF, 0, 0], C.blue));
  },
  refinery(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.25, S - 0.4], [0, 0.12, 0], [0, 0, 0], C.dark), P('cyl', [1.6, 1.8, 2.4 + lv * 0.25, 10], [-0.9, 1.4 + lv * 0.12, -0.6], [0, 0, 0], C.rust), P('box', [S - 1.2, 0.5, 1.4], [0.4, 0.5, S / 2 - 1.1], [0, 0, 0], C.mid));
    for (let i = 0; i < 1 + Math.floor(lv / 2); i++) L.push(P('cyl', [0.3, 0.42, 3 + i * 0.7, 7], [1.5 + i * 0.7, 2.3 + i * 0.3, -1.4], [0, 0, 0], C.dark));
    G.push(P('box', [1.2, 0.8, 0.08], [-0.9, 0.9, -0.6 + 1.82], [0, 0, 0], C.orange));
    for (let i = 0; i < lv + 1; i++) L.push(P('box', [0.5, 0.4, 0.5], [-1.2 + i * 0.6, 0.7, S / 2 - 1.1], [0, 0, 0], C.sand));
  },
  distiller(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.dark));
    const cols = [C.cyan, C.purple, C.gold, C.green, C.pink];
    for (let i = 0; i < Math.min(4, 1 + lv); i++) {
      const x = -S / 4 + (i % 2) * (S / 2), z = -S / 4 + Math.floor(i / 2) * (S / 2), h = 2.4 + (lv >= 3 ? 0.8 : 0);
      L.push(P('cyl', [0.62, 0.62, h, 8], [x, 0.2 + h / 2, z], [0, 0, 0], C.glass), P('cyl', [0.7, 0.7, 0.2, 8], [x, 0.3, z], [0, 0, 0], C.dark), P('cyl', [0.7, 0.7, 0.2, 8], [x, 0.2 + h, z], [0, 0, 0], C.dark));
      G.push(P('cyl', [0.36, 0.36, h * 0.7, 6], [x, 0.3 + h * 0.4, z], [0, 0, 0], cols[i % cols.length]));
    }
    L.push(P('cyl', [0.08, 0.08, S - 1, 5], [0, 3.2, 0], [0, 0, HALF], C.copper));
  },
  garden(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.soil));
    const rows = Math.min(3, 1 + Math.floor((lv + 1) / 2));
    for (let r = 0; r < rows; r++) for (let k = 0; k < 4; k++) L.push(P('cone', [0.32, 0.9 + (lv * 0.06), 5], [-S / 2 + 1 + k * 0.85, 0.65, -S / 2 + 1.1 + r * 1.2], [0, 0, 0], C.plant));
    L.push(P('box', [S - 0.6, 0.06, S - 0.6], [0, 2.3 + lv * 0.1, 0], [0, 0, 0], C.glass));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.push(P('cyl', [0.06, 0.06, 2.3 + lv * 0.1, 5], [x * (S / 2 - 0.4), 1.2, z * (S / 2 - 0.4)], [0, 0, 0], C.steel));
    for (let i = 0; i < 2 + (lv > 2 ? 2 : 0); i++) G.push(P('box', [0.8, 0.06, 0.3], [-1.2 + (i % 2) * 2.4, 2.2 + lv * 0.1, i < 2 ? -0.8 : 0.8], [0, 0, 0], 0xff5ad8));
    if (lv >= 3) L.push(P('box', [1.1, 0.9, 0.8], [S / 2 - 0.9, 0.65, S / 2 - 0.7], [0, 0, 0], C.brick));
  },
  barracks(lv, S, L, G) {
    const h = 1.8 + Math.min(2, Math.floor((lv - 1) / 2)) * 1.4;
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.dark), P('box', [S - 1, h, S - 1.6], [0, 0.2 + h / 2, 0], [0, 0, 0], C.olive), P('box', [S - 0.6, 0.25, S - 1.2], [0, 0.2 + h + 0.12, 0], [0, 0, 0], C.dark));
    for (let i = 0; i < 2 + lv; i++) G.push(P('box', [0.45, 0.4, 0.05], [-S / 2 + 1 + (i % 4) * 0.72, 0.9 + Math.floor(i / 4) * 1.2, (S - 1.6) / 2 + 0.02], [0, 0, 0], C.gold));
    L.push(P('cyl', [0.05, 0.05, 2.4, 5], [S / 2 - 0.6, 0.2 + h + 1.2, S / 2 - 1], [0, 0, 0], C.steel), P('box', [0.7, 0.4, 0.04], [S / 2 - 0.25, 0.2 + h + 2.1, S / 2 - 1], [0, 0, 0], C.red));
  },
  museum(lv, S, L, G) {
    L.push(P('box', [S - 0.2, 0.3, S - 0.2], [0, 0.15, 0], [0, 0, 0], C.white), P('box', [S - 1.4, 2.4 + lv * 0.15, S - 1.6], [0, 1.5, -0.3], [0, 0, 0], C.sand), P('box', [S - 0.6, 0.3, S - 0.6], [0, 2.9 + lv * 0.15, 0], [0, 0, 0], C.white));
    for (let i = 0; i < 4; i++) L.push(P('cyl', [0.18, 0.18, 2.6, 6], [-S / 2 + 0.6 + i * ((S - 1.2) / 3), 1.6, S / 2 - 0.5], [0, 0, 0], C.white));
    L.push(P('cone', [S / 2 - 0.2, 0.9 + lv * 0.1, 4], [0, 3.5 + lv * 0.15, 0], [0, PI / 4, 0], C.copper));
    for (let i = 0; i < 2 + lv; i++) G.push(P('box', [0.4, 0.5, 0.4], [-S / 2 + 1 + (i % 4) * 0.75, 0.6 + Math.floor(i / 4) * 0.9, (S - 1.6) / 2 - 0.3], [0, 0, 0], C.gold));
  },
  arcade(lv, S, L, G) {
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.dark), P('box', [S - 0.8, 2 + lv * 0.2, S - 1.2], [0, 1.2, 0], [0, 0, 0], 0x40285a));
    G.push(P('box', [S - 1.2, 0.5, 0.08], [0, 2.2 + lv * 0.2, (S - 1.2) / 2 + 0.03], [0, 0, 0], C.pink), P('box', [S - 2, 0.28, 0.08], [0, 1.7, (S - 1.2) / 2 + 0.03], [0, 0, 0], C.cyan));
    for (let i = 0; i < lv + 1; i++) G.push(P('box', [0.3, 0.3, 0.05], [-S / 2 + 0.8 + i * 0.55, 0.8, (S - 1.2) / 2 + 0.03], [0, 0, 0], i % 2 ? C.green : C.yellow));
    if (lv >= 3) G.push(P('sph', [0.3, 6, 4], [0, 3.6 + lv * 0.2, 0], [0, 0, 0], C.pink));
  },
  warehouse(lv, S, L, G) {
    const h = 2.6 + lv * 0.3;
    L.push(P('box', [S - 0.4, 0.2, S - 0.4], [0, 0.1, 0], [0, 0, 0], C.dark), P('box', [S - 0.8, h, S - 1.2], [0, 0.2 + h / 2, 0], [0, 0, 0], C.steel), P('box', [S - 0.5, 0.25, S - 0.9], [0, 0.2 + h, 0], [0, 0, 0], C.rust), P('box', [2, h * 0.7, 0.1], [0, 0.2 + h * 0.35, (S - 1.2) / 2 + 0.03], [0, 0, 0], C.mid));
    for (let i = 0; i < lv; i++) L.push(P('box', [0.6, 0.6, 0.6], [S / 2 - 0.2 + (i % 2) * 0.05, 0.5 + Math.floor(i / 2) * 0.6, -S / 2 + 0.7 + (i % 3) * 0.7], [0, i * 0.2, 0], C.sand));
    G.push(P('box', [0.5, 0.2, 0.06], [S / 2 - 0.8, h - 0.2, (S - 1.2) / 2 + 0.04], [0, 0, 0], C.orange));
  },
  gun(lv, S, L, G) {
    const h = 1.6 + lv * 0.35;
    L.push(P('box', [S - 0.5, 0.25, S - 0.5], [0, 0.12, 0], [0, 0, 0], C.dark), P('cyl', [0.4, 0.55, h, 8], [0, 0.25 + h / 2, 0], [0, 0, 0], C.mid), P('box', [0.9, 0.5, 0.9], [0, 0.25 + h + 0.25, 0], [0, 0, 0], C.steel));
    const nb = lv >= 3 ? 2 : 1;
    for (let i = 0; i < nb; i++) L.push(P('cyl', [0.07, 0.07, 1.3 + lv * 0.1, 6], [(i - (nb - 1) / 2) * 0.32, 0.25 + h + 0.3, 0.9], [HALF, 0, 0], C.dark));
    G.push(P('box', [0.5, 0.1, 0.05], [0, 0.25 + h + 0.3, 0.46], [0, 0, 0], lv >= 4 ? C.orange : C.green));
  },
  tesla(lv, S, L, G) {
    const h = 2.4 + lv * 0.5;
    L.push(P('box', [S - 0.5, 0.25, S - 0.5], [0, 0.12, 0], [0, 0, 0], C.dark), P('cyl', [0.22, 0.45, h, 8], [0, 0.25 + h / 2, 0], [0, 0, 0], C.copper));
    for (let i = 0; i < lv; i++) L.push(P('tor', [0.45 + i * 0.04, 0.06, 4, 10], [0, 0.9 + i * ((h - 0.9) / Math.max(1, lv)), 0], [HALF, 0, 0], C.steel));
    G.push(P('sph', [0.38 + lv * 0.03, 8, 6], [0, 0.25 + h + 0.3, 0], [0, 0, 0], C.cyan));
  },
  flame(lv, S, L, G) {
    L.push(P('box', [S - 0.5, 0.25, S - 0.5], [0, 0.12, 0], [0, 0, 0], C.dark), P('cyl', [0.5, 0.5, 1.3 + lv * 0.1, 8], [-0.3, 0.9, -0.2], [0, 0, 0], C.red), P('cyl', [0.16, 0.2, 1.5 + lv * 0.1, 6], [0.2, 1.3, 0.5], [HALF - 0.3, 0, 0], C.dark));
    G.push(P('cone', [0.16 + lv * 0.03, 0.5 + lv * 0.12, 5], [0.2, 1.8 + lv * 0.02, 1.25], [HALF, 0, 0], C.orange));
    if (lv >= 3) L.push(P('cyl', [0.4, 0.4, 1, 8], [0.5, 0.75, -0.5], [0, 0, 0], C.red));
  },
  cryo(lv, S, L, G) {
    const h = 1.4 + lv * 0.45;
    L.push(P('box', [S - 0.5, 0.25, S - 0.5], [0, 0.12, 0], [0, 0, 0], C.dark), P('cyl', [0.55, 0.65, 0.5, 6], [0, 0.5, 0], [0, 0, 0], C.mid));
    G.push(P('cone', [0.42, h, 5], [0, 0.75 + h / 2, 0], [0, 0, 0], C.cyan));
    for (let i = 0; i < Math.min(3, lv); i++) G.push(P('cone', [0.2, 0.9 + i * 0.3, 4], [0.45 * Math.cos(i * 2.1), 0.75 + 0.45, 0.45 * Math.sin(i * 2.1)], [0.2, 0, 0.2], 0x9be8ff));
  },
  sniper(lv, S, L, G) {
    const h = 3 + lv * 0.7;
    L.push(P('box', [S - 0.5, 0.25, S - 0.5], [0, 0.12, 0], [0, 0, 0], C.dark), P('cyl', [0.14, 0.22, h, 6], [0, 0.25 + h / 2, 0], [0, 0, 0], C.mid), P('box', [0.7, 0.35, 0.7], [0, 0.25 + h + 0.15, 0], [0, 0, 0], C.steel), P('cyl', [0.05, 0.05, 2.1, 5], [0, 0.25 + h + 0.25, 1.0], [HALF, 0, 0], C.dark));
    G.push(P('box', [0.2, 0.2, 0.05], [0, 0.25 + h + 0.55, 0.36], [0, 0, 0], C.red));
  },
  wall(lv, S, L) {
    const h = 1.5 + lv * 0.3;
    L.push(P('box', [S, h, 0.7], [0, h / 2, 0], [0, 0, 0], lv >= 4 ? C.steel : lv >= 2 ? C.mid : C.sand), P('box', [S + 0.06, 0.18, 0.86], [0, h + 0.09, 0], [0, 0, 0], C.dark));
    if (lv >= 3) for (let i = 0; i < 4; i++) L.push(P('cone', [0.08, 0.34, 4], [-1.1 + i * 0.73, h + 0.35, 0], [0, 0, 0], C.dark));
  },
  gate(lv, S, L, G) {
    const h = 2.2 + lv * 0.2;
    for (const s of [-1, 1]) L.push(P('box', [0.5, h, 0.7], [s * (S / 2 - 0.25), h / 2, 0], [0, 0, 0], C.mid));
    L.push(P('box', [S, 0.4, 0.7], [0, h + 0.2, 0], [0, 0, 0], C.dark));
    for (let i = 0; i < 4; i++) L.push(P('box', [0.08, h - 0.4, 0.08], [-0.85 + i * 0.57, (h - 0.4) / 2 + 0.2, 0], [0, 0, 0], C.steel));
    G.push(P('box', [0.5, 0.12, 0.05], [0, h + 0.2, 0.37], [0, 0, 0], C.yellow));
  },
  spikes(lv, S, L) {
    L.push(P('box', [S - 0.3, 0.1, S - 0.3], [0, 0.05, 0], [0, 0, 0], C.dark));
    const n = 3 + lv;
    for (let i = 0; i < n * n; i++) L.push(P('cone', [0.09, 0.4 + lv * 0.05, 4], [-S / 2 + 0.4 + (i % n) * ((S - 0.8) / (n - 1)), 0.3, -S / 2 + 0.4 + Math.floor(i / n) * ((S - 0.8) / (n - 1))], [0, 0, 0], C.steel));
  },
  mines(lv, S, L, G) {
    L.push(P('box', [S - 0.3, 0.08, S - 0.3], [0, 0.04, 0], [0, 0, 0], C.dark));
    for (let i = 0; i < Math.min(5, 1 + lv); i++) { const x = -0.9 + (i % 3) * 0.9, z = -0.6 + Math.floor(i / 3) * 1.2; L.push(P('cyl', [0.3, 0.34, 0.14, 8], [x, 0.14, z], [0, 0, 0], C.olive)); G.push(P('sph', [0.09, 5, 3], [x, 0.24, z], [0, 0, 0], C.red)); }
  },
};
const HALF = PI / 2;

const cache = new Map();
function geometries(type, lv) {
  const k = type + lv;
  let e = cache.get(k);
  if (!e) {
    const S = BUILDINGS[type].size * CELL, L = [], G = [];
    B[type](lv, S, L, G);
    e = { lit: merge(L), glow: merge(G) };
    cache.set(k, e);
  }
  return e;
}
/** building model (group with .lit / .glow meshes, rotation applied by the caller). Geometry is shared between instances: never dispose it per model. */
export function createBuildingModel(type, lv = 1) {
  const g = geometries(type, Math.max(1, Math.min(5, lv)));
  const root = new THREE.Group();
  root.name = 'hw-' + type;
  if (g.lit) { const m = new THREE.Mesh(g.lit, LIT); m.matrixAutoUpdate = true; root.add(m); root.userData.lit = m; }
  if (g.glow) { const m = new THREE.Mesh(g.glow, EMIT); root.add(m); root.userData.glow = m; }
  root.userData.type = type; root.userData.lv = lv;
  return root;
}
/** wrecked buildings go dark and dead until repaired */
export function setWrecked(root, wrecked) {
  const { lit, glow } = root.userData;
  if (lit) lit.material = wrecked ? WRECK : LIT;
  if (glow) glow.visible = !wrecked;
}
/** translucent placement ghost (green ok / red blocked) + footprint plate + optional range ring */
export function createGhost(type, lv = 1) {
  const root = createBuildingModel(type, lv);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) { o.material = GHOST.ok; o.frustumCulled = false; meshes.push(o); } });
  const S = BUILDINGS[type].size * CELL;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(S - 0.1, S - 0.1), new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  plate.rotation.x = -HALF; plate.position.y = 0.06; root.add(plate);
  const rng = BUILDINGS[type].tw?.range?.[0];
  let ring = null;
  if (rng) {
    ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64), new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -HALF; ring.position.y = 0.08; ring.scale.set(rng, rng, 1); root.add(ring);
  }
  return {
    root,
    set(ok) { for (const m of meshes) m.material = ok ? GHOST.ok : GHOST.bad; plate.material.color.setHex(ok ? 0x40ff70 : 0xff3a2a); if (ring) ring.material.color.setHex(ok ? 0x40ff70 : 0xff3a2a); },
    dispose() { plate.geometry.dispose(); plate.material.dispose(); if (ring) { ring.geometry.dispose(); ring.material.dispose(); } },
  };
}
/** the BUILD console on the pad (screen glows amber) */
export function createConsoleModel() {
  const L = [P('box', [1.6, 0.25, 1.1], [0, 0.12, 0], [0, 0, 0], C.dark), P('box', [1.3, 1.0, 0.7], [0, 0.75, 0], [0, 0, 0], C.mid), P('box', [1.3, 0.75, 0.1], [0, 1.55, -0.12], [-0.35, 0, 0], C.dark), P('cyl', [0.05, 0.05, 1.4, 5], [0.7, 1.8, 0.2], [0, 0, 0], C.steel)];
  const G = [P('box', [1.1, 0.55, 0.05], [0, 1.56, -0.075], [-0.35, 0, 0], 0xffa030), P('sph', [0.09, 5, 3], [0.7, 2.55, 0.2], [0, 0, 0], C.red)];
  const root = new THREE.Group();
  root.add(new THREE.Mesh(merge(L), LIT), new THREE.Mesh(merge(G), EMIT));
  return root;
}
/** a tiny idle worker (Barracks) */
export function createWorkerModel(color = 0xe07a20) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(merge([P('box', [0.32, 0.5, 0.2], [0, 0.55, 0], [0, 0, 0], color), P('sph', [0.14, 6, 4], [0, 0.98, 0], [0, 0, 0], 0xe0b090), P('box', [0.1, 0.4, 0.1], [-0.09, 0.2, 0], [0, 0, 0], C.dark), P('box', [0.1, 0.4, 0.1], [0.09, 0.2, 0], [0, 0, 0], C.dark)]), LIT));
  return root;
}
export const modelMaterials = { LIT, EMIT };
