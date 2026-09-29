// HOMEWORLD 2 models + instanced view (wave 4, module 'homeworld2'). Everything is INSTANCED: one InstancedMesh per piece type (vertex coloured, lit),
// one for the belt items (per-instance colour), one for the status lamps, one for the wires, one for the resource nodes  ->  about 20 draw calls for a
// whole factory + rooms + garden, however many belts there are (renderer.info is reported by the harness script).
// Conventions: metres, +Y up, model origin = centre of the footprint on the ground, front / output = +X (rotation r turns it about Y by -r * 90 deg).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as X from '../game/homeworld2_core.js';
import { HOME_Y, LAYER, flatLayer } from '../world/homeworld_map.js';

const FC = X.FC, HALF = Math.PI / 2;
const C = { steel: 0x8a9096, dark: 0x30343a, mid: 0x565c64, rust: 0x8a5a3a, yellow: 0xd8b020, red: 0xd23a2a, green: 0x40e070, cyan: 0x50d8ff, blue: 0x3c6cc8, white: 0xe8e8e0,
  copper: 0xc8763a, olive: 0x4a5a3a, orange: 0xe07a20, purple: 0xb35cff, gold: 0xffd23f, glass: 0x7fc8d8, leaf: 0x3fa84a, leaf2: 0x2f8a3a, bark: 0x6a4a2a, plank: 0xb08a5a, wall: 0xb9b2a4, wall2: 0x8f8778, floor: 0x7a7468, floor2: 0x6a655a, roof: 0x5a4a44, cloth: 0xa84a5a, soil: 0x5a3c22, fruit: 0xe0403a };
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
function P(kind, a, pos = [0, 0, 0], rot = [0, 0, 0], color = C.steel) {
  let g;
  if (kind === 'box') g = new THREE.BoxGeometry(a[0], a[1], a[2]);
  else if (kind === 'cyl') g = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 8);
  else if (kind === 'cone') g = new THREE.ConeGeometry(a[0], a[1], a[2] || 6);
  else g = new THREE.SphereGeometry(a[0], a[1] || 8, a[2] || 6);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s);
  g.applyMatrix4(_m);
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  if (g.index) { const ng = g.toNonIndexed(); g.dispose(); return ng; }
  return g;
}
const merge = (l) => mergeGeometries(l, false);
const LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
const EMIT = new THREE.MeshBasicMaterial({ vertexColors: true });
const GLASS = new THREE.MeshBasicMaterial({ color: 0x9fe0f0, transparent: true, opacity: 0.32, depthWrite: false });
const GH = { ok: new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.45, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.45, depthWrite: false }) };
export const mats = { LIT, EMIT, GLASS, GH };

// ---------------------------------------------------------------------------------------------- geometry builders (lit list L, glow list G)
const S3 = FC * 2;   // machine footprint side (3 m)
const M = {
  miner(L, G) {
    L.push(P('box', [S3 - 0.2, 0.22, S3 - 0.2], [0, 0.11, 0], [0, 0, 0], C.dark), P('box', [1.7, 1.3, 1.7], [-0.2, 0.87, 0], [0, 0, 0], C.mid), P('box', [1.9, 0.18, 1.9], [-0.2, 1.6, 0], [0, 0, 0], C.dark),
      P('cyl', [0.42, 0.06, 1.9, 6], [-0.2, 0.2, 0], [Math.PI, 0, 0], C.steel), P('cyl', [0.18, 0.18, 1.2, 6], [-0.2, 2.2, 0], [0, 0, 0], C.steel), P('box', [0.9, 0.5, 0.6], [1.0, 0.5, 0], [0, 0, 0], C.olive));
    G.push(P('box', [1.3, 0.12, 0.05], [-0.2, 1.05, 0.86], [0, 0, 0], C.orange), P('box', [0.3, 0.12, 0.12], [1.0, 0.72, 0.2], [0, 0, 0], C.yellow));
  },
  smelter(L, G) {
    L.push(P('box', [S3 - 0.2, 0.2, S3 - 0.2], [0, 0.1, 0], [0, 0, 0], C.dark), P('box', [2.1, 1.8, 2.1], [-0.15, 1.1, 0], [0, 0, 0], C.rust), P('cyl', [0.34, 0.42, 1.6, 7], [-0.55, 2.7, -0.55], [0, 0, 0], C.dark),
      P('box', [0.5, 0.9, 1.5], [1.0, 0.65, 0], [0, 0, 0], C.mid));
    G.push(P('box', [0.06, 0.6, 0.9], [0.92, 1.0, 0], [0, 0, 0], C.orange), P('sph', [0.17, 6, 4], [-0.55, 3.55, -0.55], [0, 0, 0], C.orange));
  },
  assembler(L, G) {
    L.push(P('box', [S3 - 0.2, 0.2, S3 - 0.2], [0, 0.1, 0], [0, 0, 0], C.dark), P('box', [2.3, 0.9, 2.3], [-0.1, 0.65, 0], [0, 0, 0], C.blue), P('box', [0.5, 1.5, 0.5], [-0.7, 1.7, -0.6], [0, 0, 0], C.mid),
      P('box', [1.4, 0.24, 0.24], [-0.1, 2.35, -0.6], [0, 0, 0], C.mid), P('cyl', [0.09, 0.09, 1.1, 5], [0.55, 1.75, -0.6], [0, 0, 0], C.steel), P('box', [0.7, 0.3, 0.7], [0.5, 1.25, 0.4], [0, 0, 0], C.steel));
    G.push(P('box', [1.5, 0.1, 0.05], [-0.1, 0.9, 1.16], [0, 0, 0], C.cyan), P('sph', [0.14, 6, 4], [0.55, 2.4, -0.6], [0, 0, 0], C.green));
  },
  uplink(L, G) {
    L.push(P('cyl', [1.35, 1.45, 0.3, 14], [0, 0.15, 0], [0, 0, 0], C.dark), P('cyl', [0.35, 0.5, 1.6, 8], [-0.2, 1.1, 0], [0, 0, 0], C.mid), P('cyl', [0.95, 0.15, 0.4, 12], [-0.2, 2.1, 0], [0.5, 0, 0.3], C.white),
      P('box', [0.8, 0.8, 0.8], [0.9, 0.7, 0.4], [0, 0, 0], C.steel));
    G.push(P('cyl', [1.15, 1.15, 0.05, 14], [0, 0.32, 0], [0, 0, 0], C.cyan), P('sph', [0.13, 6, 4], [-0.2, 2.55, 0], [0, 0, 0], C.gold));
  },
  generator(L, G) {
    L.push(P('box', [S3 - 0.2, 0.22, S3 - 0.2], [0, 0.11, 0], [0, 0, 0], C.dark), P('box', [2.0, 1.4, 1.7], [-0.2, 0.95, 0], [0, 0, 0], C.olive), P('cyl', [0.22, 0.28, 2.0, 6], [-0.7, 2.4, -0.4], [0, 0, 0], C.dark),
      P('cyl', [0.4, 0.4, 1.1, 8], [0.9, 0.75, 0.7], [0, 0, HALF], C.red));
    G.push(P('box', [1.4, 0.16, 0.05], [-0.2, 0.9, 0.88], [0, 0, 0], C.orange), P('sph', [0.15, 6, 4], [-0.7, 3.45, -0.4], [0, 0, 0], C.orange));
  },
  pole(L, G) {
    L.push(P('cyl', [0.09, 0.13, 3.0, 5], [0, 1.5, 0], [0, 0, 0], C.bark), P('box', [1.0, 0.1, 0.1], [0, 2.8, 0], [0, 0, 0], C.bark), P('box', [0.1, 0.1, 0.8], [0, 2.55, 0], [0, 0, 0], C.bark));
    G.push(P('sph', [0.1, 5, 3], [0, 3.1, 0], [0, 0, 0], C.cyan));
  },
  belt(L, G) {
    L.push(P('box', [FC - 0.04, 0.12, FC - 0.04], [0, 0.08, 0], [0, 0, 0], C.dark), P('box', [FC - 0.04, 0.2, 0.09], [0, 0.14, FC / 2 - 0.08], [0, 0, 0], C.mid), P('box', [FC - 0.04, 0.2, 0.09], [0, 0.14, -FC / 2 + 0.08], [0, 0, 0], C.mid));
    G.push(P('box', [0.5, 0.02, 0.1], [-0.05, 0.155, 0], [0, 0, 0], 0x6a9a3a), P('box', [0.22, 0.02, 0.1], [0.22, 0.155, 0.16], [0, 0, 0.7], 0x6a9a3a), P('box', [0.22, 0.02, 0.1], [0.22, 0.155, -0.16], [0, 0, -0.7], 0x6a9a3a));
  },
  splitter(L, G) {
    L.push(P('box', [FC - 0.04, 0.16, FC - 0.04], [0, 0.1, 0], [0, 0, 0], C.mid), P('box', [FC - 0.5, 0.3, FC - 0.5], [0, 0.25, 0], [0, 0, 0], C.dark));
    G.push(P('box', [0.5, 0.02, 0.12], [0.2, 0.42, 0], [0, 0, 0], C.yellow), P('box', [0.12, 0.02, 0.5], [0, 0.42, 0], [0, 0, 0], C.yellow));
  },
  floor(L) { L.push(P('box', [FC, 0.1, FC], [0, 0.05, 0], [0, 0, 0], C.floor)); L.push(P('box', [FC - 0.08, 0.11, FC - 0.08], [0, 0.05, 0], [0, 0, 0], C.floor2)); },
  roof(L) { L.push(P('box', [FC, 0.14, FC], [0, 2.75, 0], [0, 0, 0], C.roof)); },
  crate(L) { L.push(P('box', [1.05, 0.95, 1.05], [0, 0.47, 0], [0, 0, 0], C.plank), P('box', [1.1, 0.1, 0.12], [0, 0.6, 0.5], [0, 0, 0], C.bark), P('box', [1.1, 0.1, 0.12], [0, 0.6, -0.5], [0, 0, 0], C.bark)); },
  bench(L, G) { L.push(P('box', [2.6, 0.12, 1.1], [0, 0.95, 0], [0, 0, 0], C.plank), P('box', [0.12, 0.95, 0.9], [-1.15, 0.47, 0], [0, 0, 0], C.mid), P('box', [0.12, 0.95, 0.9], [1.15, 0.47, 0], [0, 0, 0], C.mid), P('box', [0.5, 0.3, 0.4], [0.6, 1.2, 0], [0, 0, 0], C.red)); G.push(P('box', [0.3, 0.05, 0.05], [-0.6, 1.05, 0.4], [0, 0, 0], C.yellow)); },
  bed(L) { L.push(P('box', [2.6, 0.4, 1.2], [0, 0.3, 0], [0, 0, 0], C.bark), P('box', [2.4, 0.22, 1.0], [-0.05, 0.62, 0], [0, 0, 0], C.cloth), P('box', [0.6, 0.18, 0.8], [-0.95, 0.8, 0], [0, 0, 0], C.white)); },
  planter(L) { L.push(P('box', [2.6, 0.5, 1.1], [0, 0.25, 0], [0, 0, 0], C.plank), P('box', [2.4, 0.08, 0.9], [0, 0.52, 0], [0, 0, 0], C.soil), P('cone', [0.2, 0.5, 5], [-0.6, 0.85, 0], [0, 0, 0], C.leaf), P('cone', [0.2, 0.6, 5], [0.1, 0.9, 0.1], [0, 0, 0], C.leaf2), P('cone', [0.2, 0.45, 5], [0.7, 0.8, -0.1], [0, 0, 0], C.leaf)); },
  tree(L) {   // canopy + trunk at full size; the instance matrix scales it by the growth stage
    L.push(P('cyl', [0.16, 0.24, 2.2, 6], [0, 1.1, 0], [0, 0, 0], C.bark), P('cone', [1.35, 2.0, 7], [0, 2.7, 0], [0, 0, 0], C.leaf), P('cone', [1.0, 1.6, 7], [0, 3.6, 0], [0, 0, 0], C.leaf2), P('cone', [0.6, 1.1, 6], [0, 4.4, 0], [0, 0, 0], C.leaf));
  },
  post(L) { L.push(P('box', [0.34, 2.6, 0.34], [0, 1.3, 0], [0, 0, 0], C.wall2)); },
  arm(L) { L.push(P('box', [FC / 2 + 0.02, 2.6, 0.26], [FC / 4, 1.3, 0], [0, 0, 0], C.wall)); },            // half a wall segment towards +X
  armLow(L) { L.push(P('box', [FC / 2 + 0.02, 0.9, 0.26], [FC / 4, 0.45, 0], [0, 0, 0], C.wall)); },
  armHigh(L) { L.push(P('box', [FC / 2 + 0.02, 0.5, 0.26], [FC / 4, 2.35, 0], [0, 0, 0], C.wall)); },
  armGlass(L) { L.push(P('box', [FC / 2 + 0.02, 1.2, 0.1], [FC / 4, 1.5, 0], [0, 0, 0], 0xffffff)); },
  doorFrame(L) { L.push(P('box', [0.22, 2.3, 0.3], [-FC / 2 + 0.11, 1.15, 0], [0, 0, 0], C.bark), P('box', [0.22, 2.3, 0.3], [FC / 2 - 0.11, 1.15, 0], [0, 0, 0], C.bark), P('box', [FC, 0.3, 0.3], [0, 2.45, 0], [0, 0, 0], C.bark)); },
  fruit(L) { L.push(P('sph', [0.14, 5, 4], [0, 0, 0], [0, 0, 0], C.fruit)); },
};
/** resource node: a rock cluster with glowing shards (tinted per resource by the instance colour) */
function nodeGeo() {
  const L = [P('cone', [1.5, 0.9, 7], [0, 0.35, 0], [0, 0.3, 0], 0x707070), P('cone', [0.8, 1.4, 5], [0.5, 0.7, 0.3], [0.1, 0.5, 0.15], 0xb0b0b0), P('cone', [0.6, 1.1, 5], [-0.55, 0.55, -0.35], [-0.12, 0.2, -0.1], 0xd8d8d8),
    P('cone', [0.4, 0.9, 5], [0.05, 0.6, -0.7], [0.15, 0, 0], 0xf0f0f0), P('box', [0.5, 0.35, 0.5], [-0.8, 0.18, 0.7], [0, 0.6, 0], 0x909090)];
  return merge(L);
}
const cache = new Map();
export function geoOf(name) {
  if (cache.has(name)) return cache.get(name);
  const Ls = [], Gs = [];
  if (name === 'node') { const g = { lit: nodeGeo(), glow: null }; cache.set(name, g); return g; }
  M[name](Ls, Gs);
  const g = { lit: Ls.length ? merge(Ls) : null, glow: Gs.length ? merge(Gs) : null };
  cache.set(name, g);
  return g;
}
export const NODE_TINT = { scrap: 0xa9adb4, ore: 0xd9905a, crystal: 0x7fe8ff };
const LAMP = [0x555a60, 0x54ff7a, 0xffb020, 0xff3a2a, 0xff3a2a, 0xffb020];   // idle, running, blocked, no power, broken, no node

// ---------------------------------------------------------------------------------------------- instanced view
const CAP = { miner: 12, smelter: 8, assembler: 8, uplink: 4, generator: 8, pole: 40, belt: 340, splitter: 20, floor: 240, roof: 240, crate: 12, bench: 8, bed: 8, planter: 8, tree: 32, post: 260, arm: 700, armLow: 130, armHigh: 130, armGlass: 130, doorFrame: 24, fruit: 100, node: 16 };
const DIRV = X.DIR;
export function createFactoryView(parent, nodes) {
  const root = new THREE.Group(); root.name = 'h2-view'; parent.add(root);
  const meshes = {}, tmp = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const mk = (name, lit = true) => {
    const g = geoOf(name);
    if (!g.lit && !g.glow) return null;
    const out = {};
    for (const [k, geo, mat] of [['lit', g.lit, name === 'armGlass' ? GLASS : LIT], ['glow', g.glow, EMIT]]) {
      if (!geo) continue;
      const im = new THREE.InstancedMesh(geo, mat, CAP[name] || 16);
      im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (k === 'lit' && name !== 'armGlass') { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((CAP[name] || 16) * 3).fill(1), 3); }
      if (name === 'armGlass') im.renderOrder = 3;
      im.name = 'h2-' + name + '-' + k; root.add(im); out[k] = im;
    }
    void lit;
    return out;
  };
  const get = (name) => (meshes[name] ||= mk(name));
  const counts = {};
  const add = (name, x, y, z, rotY = 0, s = 1, sy = s, tint = null) => {
    const m = get(name); if (!m) return;
    const i = counts[name] || 0; if (i >= (CAP[name] || 16)) return;
    counts[name] = i + 1;
    q.setFromAxisAngle(up, rotY); pos.set(x, y, z); sc.set(s, sy, s); tmp.compose(pos, q, sc);
    for (const im of Object.values(m)) { im.setMatrixAt(i, tmp); im.count = i + 1; if (tint !== null && im.instanceColor) { col.setHex(tint); im.setColorAt(i, col); } else if (im.instanceColor) im.setColorAt(i, col.setRGB(1, 1, 1)); }
  };
  const finish = () => { for (const m of Object.values(meshes)) if (m) for (const im of Object.values(m)) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } };
  const reset = () => { for (const k of Object.keys(counts)) { counts[k] = 0; const m = meshes[k]; if (m) for (const im of Object.values(m)) im.count = 0; } };

  // ---- belt items (one instanced box, per-instance colour), lamps (one instanced box), wires (one LineSegments), nodes
  const itemMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.26, 0.42), new THREE.MeshLambertMaterial({ color: 0xffffff }), 700);
  itemMesh.count = 0; itemMesh.frustumCulled = false; itemMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3); itemMesh.name = 'h2-items'; root.add(itemMesh);
  const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }), 64);
  lampMesh.count = 0; lampMesh.frustumCulled = false; lampMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3); lampMesh.name = 'h2-lamps'; root.add(lampMesh);
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 260), 3)); wireGeo.setDrawRange(0, 0);
  const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.85 })); wire.frustumCulled = false; wire.name = 'h2-wires'; root.add(wire);
  // resource nodes (static)
  const nm = get('node');
  if (nm) {
    nm.lit.count = nodes.length;
    nodes.forEach((n, i) => { tmp.compose(pos.set((n.x + 1) * FC, HOME_Y, (n.z + 1) * FC), q.setFromAxisAngle(up, n.id * 1.7), sc.setScalar(0.85 + 0.2 * n.pur)); nm.lit.setMatrixAt(i, tmp); nm.lit.setColorAt(i, col.setHex(NODE_TINT[n.res])); });
    nm.lit.instanceMatrix.needsUpdate = true; nm.lit.instanceColor.needsUpdate = true;
  }
  // node ground rings (flat, own layer): a coloured disc under each node so the resource reads from far away
  const ringGeo = new THREE.CircleGeometry(2.3, 16); ringGeo.rotateX(-HALF);
  const ringMat = flatLayer(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }), LAYER.decal);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, nodes.length)); rings.frustumCulled = false; rings.count = nodes.length; rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nodes.length) * 3), 3); rings.name = 'h2-noderings'; root.add(rings);
  nodes.forEach((n, i) => { tmp.compose(pos.set((n.x + 1) * FC, HOME_Y + LAYER.decal, (n.z + 1) * FC), q.identity(), sc.setScalar(1)); rings.setMatrixAt(i, tmp); rings.setColorAt(i, col.setHex(NODE_TINT[n.res])); });
  rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true;

  const wx = (x) => x * FC, wz = (z) => z * FC;
  const has = (occ, x, z) => occ.get(X.CELL_KEY(x, z) * 4);
  /** rebuild every static instance from the layout. `occ` = ground-layer occupancy (cell -> piece id), `byId` = Map id -> piece. */
  function sync(s) {
    reset();
    const occ = X.occupancy(s), byId = new Map(s.p.map((p) => [p.i, p]));
    const wallish = (x, z) => { const id = has(occ, x, z), p = id && byId.get(id); return p && (p.t === 'wall' || p.t === 'window' || p.t === 'door') ? p : null; };
    for (const p of s.p) {
      const [w, h] = X.dims(p.t, p.r), cx = (p.x + w / 2) * FC, cz = (p.z + h / 2) * FC, y = HOME_Y, rot = -p.r * HALF, tint = p.l === 2 ? 0xd8f4ff : p.l === 3 ? 0xffe6a8 : null;
      if (p.br) { add(p.t, cx, y, cz, rot, 1, 1, 0x554a48); continue; }
      switch (p.t) {
        case 'miner': case 'smelter': case 'assembler': case 'uplink': case 'generator': add(p.t, cx, y, cz, rot, 1, 1, tint); break;
        case 'pole': case 'belt': case 'splitter': case 'floor': case 'roof': add(p.t, cx, y, cz, p.t === 'belt' || p.t === 'splitter' ? rot : 0); break;
        case 'crate': case 'bench': case 'bed': case 'planter': add(p.t, cx, y, cz, rot); break;
        case 'tree': { const st = X.treeStage(p.a || 0), k = st === 0 ? 0.32 : st === 1 ? 0.66 : 1; add('tree', cx, y, cz, p.i * 1.3, k, k); for (let f = 0; f < (p.f || 0); f++) add('fruit', cx + Math.cos(p.i + f * 2.1) * 0.9, y + 2.4 + f * 0.3, cz + Math.sin(p.i + f * 2.1) * 0.9); break; }
        case 'wall': case 'window': case 'door': {
          const nb = DIRV.map(([dx, dz]) => wallish(p.x + dx, p.z + dz));
          if (p.t === 'door') { const alongX = !!(nb[0] || nb[2]); add('doorFrame', cx, y, cz, alongX ? 0 : HALF); break; }
          add('post', cx, y, cz);
          nb.forEach((n, d) => {
            if (!n) return;
            const yaw = -d * HALF, names = p.t === 'window' ? ['armLow', 'armHigh', 'armGlass'] : ['arm'];
            for (const nn of names) add(nn, cx, y, cz, yaw);
          });
          if (!nb.some(Boolean)) { add(p.t === 'window' ? 'armLow' : 'arm', cx, y, cz, 0); add(p.t === 'window' ? 'armLow' : 'arm', cx, y, cz, Math.PI); }
          break;
        }
        default: break;
      }
    }
    // wires: pole <-> pole (<= link) and machine -> nearest pole
    const poles = s.p.filter((p) => p.t === 'pole').map((p) => X.centerOf(p)), arr = wireGeo.attributes.position.array;
    let n = 0;
    const seg = (a, b, ya, yb) => { if (n + 6 > arr.length) return; arr[n++] = a.x; arr[n++] = HOME_Y + ya; arr[n++] = a.z; arr[n++] = b.x; arr[n++] = HOME_Y + yb; arr[n++] = b.z; };
    for (let i = 0; i < poles.length; i++) for (let j = i + 1; j < poles.length; j++) if (Math.hypot(poles[i].x - poles[j].x, poles[i].z - poles[j].z) <= X.POLE_LINK) seg(poles[i], poles[j], 2.8, 2.8);
    for (const p of s.p) if (X.isMachine(p.t)) {
      const c = X.centerOf(p); let best = null, bd = X.POLE_R + 1e-6;
      for (const o of poles) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } }
      if (best) seg(c, best, 2.6, 2.7);
    }
    wireGeo.setDrawRange(0, n / 3); wireGeo.attributes.position.needsUpdate = true;
    finish();
    // lamp anchors (machines) for the dynamic updates
    lampSpec.length = 0;
    for (const p of s.p) if (X.isMachine(p.t)) { const c = X.centerOf(p); lampSpec.push({ id: p.i, x: c.x, z: c.z, y: HOME_Y + (p.t === 'uplink' ? 2.8 : p.t === 'generator' ? 1.8 : p.t === 'miner' ? 2.1 : 2.6) }); }
    return { fac: s.p.filter((p) => X.isFac(p.t)).sort((a, b) => a.i - b.i) };
  }
  const lampSpec = [];
  /** dynamic part, every frame: belt items + machine lamps. `items` = [{x,z,item,prog,r}] resolved by the caller. */
  function setItems(list) {
    const n = Math.min(list.length, 700);
    for (let i = 0; i < n; i++) {
      const e = list[i], d = DIRV[e.r];
      tmp.compose(pos.set(wx(e.x + 0.5) + d[0] * (e.prog - 0.5) * FC, HOME_Y + 0.33, wz(e.z + 0.5) + d[1] * (e.prog - 0.5) * FC), q.identity(), sc.setScalar(e.item === X.IT.crystal || e.item === X.IT.circuit ? 0.85 : 1));
      itemMesh.setMatrixAt(i, tmp); itemMesh.setColorAt(i, col.setHex(X.IT_COLOR[e.item] || 0xffffff));
    }
    itemMesh.count = n; itemMesh.instanceMatrix.needsUpdate = true; if (itemMesh.instanceColor) itemMesh.instanceColor.needsUpdate = true;
  }
  function setLamps(states /* Map piece id -> state code */) {
    let n = 0;
    for (const l of lampSpec) {
      if (n >= 64) break;
      tmp.compose(pos.set(l.x, l.y, l.z), q.identity(), sc.setScalar(1)); lampMesh.setMatrixAt(n, tmp); lampMesh.setColorAt(n, col.setHex(LAMP[states.get(l.id) ?? 0] ?? LAMP[0])); n++;
    }
    lampMesh.count = n; lampMesh.instanceMatrix.needsUpdate = true; if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
  }
  function dispose() {
    for (const m of Object.values(meshes)) if (m) for (const im of Object.values(m)) im.dispose();
    itemMesh.geometry.dispose(); itemMesh.material.dispose(); itemMesh.dispose(); lampMesh.geometry.dispose(); lampMesh.material.dispose(); lampMesh.dispose();
    wireGeo.dispose(); wire.material.dispose(); ringGeo.dispose(); ringMat.dispose(); rings.dispose();
    root.removeFromParent();
  }
  const drawCalls = () => { let n = 3 + 2 + 1; for (const m of Object.values(meshes)) if (m) for (const im of Object.values(m)) if (im.count > 0) n++; return n; };
  return { root, sync, setItems, setLamps, dispose, drawCalls };
}

// ---------------------------------------------------------------------------------------------- placement ghost
/** translucent preview of a piece (green ok / red blocked) with its footprint plate and, for power poles / machines, the wire reach ring */
export function createPieceGhost(type) {
  const root = new THREE.Group(), meshes = [];
  // wall pieces are drawn from several instanced parts: the ghost assembles the same parts (post + two arms / frame)
  const PARTS = { wall: [['post', 0], ['arm', 0], ['arm', Math.PI]], window: [['post', 0], ['armLow', 0], ['armLow', Math.PI], ['armHigh', 0], ['armHigh', Math.PI]], door: [['doorFrame', 0]] };
  for (const [name, rot] of PARTS[type] || [[type, 0]]) {
    const g = geoOf(name);
    for (const geo of [g.lit, g.glow]) if (geo) { const m = new THREE.Mesh(geo, GH.ok); m.frustumCulled = false; m.rotation.y = rot; root.add(m); meshes.push(m); }
  }
  const [w, h] = X.PT[type].size;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(w * FC - 0.08, h * FC - 0.08), flatLayer(new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }), LAYER.decal));
  plate.rotation.x = -HALF; plate.position.y = LAYER.decal; root.add(plate);
  let ring = null;
  if (type === 'pole') { ring = new THREE.Mesh(new THREE.RingGeometry(X.POLE_R - 0.06, X.POLE_R, 48), flatLayer(new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), LAYER.decal)); ring.rotation.x = -HALF; ring.position.y = LAYER.decal + 0.02; root.add(ring); }
  return {
    root, plate,
    set(ok) { for (const m of meshes) m.material = ok ? GH.ok : GH.bad; plate.material.color.setHex(ok ? 0x40ff70 : 0xff3a2a); },
    dispose() { plate.geometry.dispose(); plate.material.dispose(); if (ring) { ring.geometry.dispose(); ring.material.dispose(); } },
  };
}
/** footprint-only ghost for room kits (w x h fine cells) */
export function createKitGhost(kind) {
  const K = X.KITS[kind], root = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(K.w * FC - 0.1, K.h * FC - 0.1), flatLayer(new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }), LAYER.decal));
  plate.rotation.x = -HALF; plate.position.set(K.w * FC / 2, LAYER.decal, K.h * FC / 2); root.add(plate);
  const door = new THREE.Mesh(new THREE.BoxGeometry(FC, 2.4, 0.2), GH.ok); door.position.set((K.door[0] + 0.5) * FC, 1.2, (K.door[1] + 0.5) * FC); root.add(door);
  return { root, set(ok) { plate.material.color.setHex(ok ? 0x40ff70 : 0xff3a2a); door.material = ok ? GH.ok : GH.bad; }, dispose() { plate.geometry.dispose(); plate.material.dispose(); door.geometry.dispose(); } };
}
/** the fine grid patch around the cursor (LineSegments, redrawn when the cursor cell changes) */
export function createGridPatch(radius = 7) {
  const n = (radius * 2 + 1), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 2 * 3), 3));
  const line = new THREE.LineSegments(geo, flatLayer(new THREE.LineBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.4, depthWrite: false }), LAYER.grid));
  line.frustumCulled = false; line.name = 'h2-gridpatch';
  return {
    line,
    at(cx, cz) {
      const a = geo.attributes.position.array, x0 = (cx - radius) * FC, z0 = (cz - radius) * FC, x1 = (cx + radius + 1) * FC, z1 = (cz + radius + 1) * FC, y = HOME_Y + LAYER.grid;
      let o = 0;
      for (let i = 0; i <= n; i++) { const x = x0 + i * FC; a[o++] = x; a[o++] = y; a[o++] = z0; a[o++] = x; a[o++] = y; a[o++] = z1; a[o++] = x0; a[o++] = y; a[o++] = z0 + i * FC; a[o++] = x1; a[o++] = y; a[o++] = z0 + i * FC; }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() { geo.dispose(); line.material.dispose(); },
  };
}
/** the Homegrown Apple item (held / dropped fruit): a small red sphere, stem and leaf */
export function appleModel() {
  const g = new THREE.Group(), lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), lam(0xd8332e)); a.position.y = 0.06; a.scale.set(1, 0.92, 1); g.add(a);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), lam(0x5a3a1a)); st.position.y = 0.125; g.add(st);
  const lf = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.004, 0.018), lam(0x3f9a3a)); lf.position.set(0.02, 0.13, 0); lf.rotation.z = 0.35; g.add(lf);
  return g;
}
export { HOME_Y };
