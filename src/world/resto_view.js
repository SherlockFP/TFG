// RESTO visuals (wave 8): procedural low-poly PSX models for the restaurant pieces, alien customers, robots, pests, the landing shuttle, buy pads, labels.
// Every model = one merged vertex-coloured LIT mesh + one merged EMISSIVE mesh (no THREE lights, geometry cached, shared materials). Pure three, no game access.
// Units: metres, +Y up. Piece groups are positioned by resto.js at (piece.at, HOME_Y) except the floor shell, which uses absolute plot coordinates.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flatLayer, LAYER } from './homeworld_map.js';
import { PLOT, PIECE, DOOR, PASS, DISH } from '../game/resto_core.js';

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
export const LIT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const EMIT = new THREE.MeshBasicMaterial({ vertexColors: true });

/** primitive with baked transform + vertex colour (non-indexed, no uv) */
function P(kind, a, pos = [0, 0, 0], rot = [0, 0, 0], color = 0x888888) {
  let g;
  if (kind === 'box') g = new THREE.BoxGeometry(a[0], a[1], a[2]);
  else if (kind === 'cyl') g = new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 8);
  else if (kind === 'cone') g = new THREE.ConeGeometry(a[0], a[1], a[2] || 6);
  else g = new THREE.SphereGeometry(a[0], a[1] || 7, a[2] || 5);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _one);
  g.applyMatrix4(_m);
  if (g.index) g = g.toNonIndexed();
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
class B {
  constructor() { this.l = []; this.e = []; }
  box(w, h, d, x, y, z, c, glow = false, ry = 0) { (glow ? this.e : this.l).push(P('box', [w, h, d], [x, y, z], [0, ry, 0], c)); return this; }
  cyl(r, h, x, y, z, c, glow = false, seg = 8) { (glow ? this.e : this.l).push(P('cyl', [r, r, h, seg], [x, y, z], [0, 0, 0], c)); return this; }
  cone(r, h, x, y, z, c, glow = false, seg = 6) { (glow ? this.e : this.l).push(P('cone', [r, h, seg], [x, y, z], [0, 0, 0], c)); return this; }
  sph(r, x, y, z, c, glow = false, sx = 1, sy = 1, sz = 1) { const g = P('sph', [r, 7, 5], [x, y, z], [0, 0, 0], c); if (sx !== 1 || sy !== 1 || sz !== 1) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, x + (p.getX(i) - x) * sx, y + (p.getY(i) - y) * sy, z + (p.getZ(i) - z) * sz); } (glow ? this.e : this.l).push(g); return this; }
  build(name) {
    const grp = new THREE.Group(); grp.name = name || 'rs';
    const geos = [];
    for (const [list, mat] of [[this.l, LIT], [this.e, EMIT]]) {
      if (!list.length) continue;
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      geos.push(g); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = true; grp.add(m);
    }
    grp.userData.geos = geos;
    return grp;
  }
}

// ---------------------------------------------------------------------------------------------- textures (canvas, nearest, cached)
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (typeof document === 'undefined') return null;
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tx); return tx;
}
export const disposeTextures = () => { for (const t of texCache.values()) t.dispose(); texCache.clear(); };
const floorTex = () => canvasTex('floor', 64, 64, (g, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#3a3f4a' : '#2a2e36'; g.fillRect(x * 8, y * 8, 8, 8); } g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, w, 1); });
/** text label texture -> Sprite (cached by text + colour) */
export function labelSprite(text, { color = '#ffe9a8', bg = 'rgba(8,8,12,.78)', w = 256, h = 48, scale = 1.6 } = {}) {
  const key = 'lb|' + text + '|' + color;
  const tx = canvasTex(key, w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = color; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
  sp.scale.set(scale, scale * h / w, 1); return sp;
}

// ---------------------------------------------------------------------------------------------- restaurant pieces
const C = { wall: 0x5a4a6a, wallDk: 0x3a2f48, trim: 0xffa030, steel: 0x8a9096, dark: 0x2a2e36, white: 0xe8e8e0, cyan: 0x50d8ff, wood: 0x8a5a3a, red: 0xd23a2a, green: 0x40e070, plant: 0x3fa84a, gold: 0xffd23f, pink: 0xff4fd8, purple: 0xb35cff, cloth: 0x6a3a8a };

function buildFloor() {
  const g = new THREE.Group(); g.name = 'rs-floor';
  const w = PLOT.x1 - PLOT.x0, d = PLOT.z1 - PLOT.z0, cx = (PLOT.x0 + PLOT.x1) / 2, cz = (PLOT.z0 + PLOT.z1) / 2;
  const fg = new THREE.PlaneGeometry(w, d); fg.rotateX(-Math.PI / 2);
  const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 2), uv.getY(i) * (d / 2));
  const fm = flatLayer(new THREE.MeshLambertMaterial({ map: floorTex(), color: 0xffffff }), LAYER.pad);
  const floor = new THREE.Mesh(fg, fm); floor.position.set(cx, LAYER.pad + 0.005, cz); g.add(floor);
  const b = new B(), h = 2.5, t = 0.3;
  b.box(w + t, h, t, cx, h / 2, PLOT.z1 + 0.05, C.wall);                                              // back wall
  b.box(t, h, d, PLOT.x0 - 0.05, h / 2, cz, C.wall); b.box(t, h, d, PLOT.x1 + 0.05, h / 2, cz, C.wall);   // side walls
  b.box(PLOT.doorX0 - PLOT.x0, h, t, (PLOT.x0 + PLOT.doorX0) / 2, h / 2, PLOT.z0, C.wall); b.box(PLOT.x1 - PLOT.doorX1, h, t, (PLOT.doorX1 + PLOT.x1) / 2, h / 2, PLOT.z0, C.wall);   // front with a door gap
  b.box(PLOT.doorX1 - PLOT.doorX0 + 0.4, 0.5, t, DOOR.x, h - 0.15, PLOT.z0, C.wallDk);                    // lintel
  b.box(w + t, 0.1, t + 0.05, cx, h + 0.05, PLOT.z1 + 0.05, C.trim, true);                             // amber trim strips (emissive)
  b.box(t + 0.05, 0.1, d, PLOT.x0 - 0.05, h + 0.05, cz, C.trim, true); b.box(t + 0.05, 0.1, d, PLOT.x1 + 0.05, h + 0.05, cz, C.trim, true);
  // pass counter (plates) + hanging ticket rail + shelf lamp
  b.box(4.8, 1.0, 0.7, PASS.x, 0.5, PASS.z, C.steel); b.box(4.9, 0.06, 0.8, PASS.x, 1.03, PASS.z, 0x30343a);
  b.box(3.6, 0.5, 0.05, PASS.x, 1.9, PASS.z + 4.3, C.dark); b.box(3.4, 0.04, 0.06, PASS.x, 1.66, PASS.z + 4.3, C.trim, true);
  const m = b.build('shell'); g.add(m);
  g.userData.geos = [fg, ...m.userData.geos]; g.userData.mats = [fm];
  return g;
}
function buildStove() {
  const b = new B();
  b.box(1.5, 0.9, 0.85, 0, 0.45, 0, C.steel).box(1.5, 0.06, 0.9, 0, 0.93, 0, C.dark);
  for (const x of [-0.4, 0.4]) b.cyl(0.24, 0.03, x, 0.97, 0, 0x181a1e);
  b.box(1.4, 0.7, 0.4, 0, 2.25, 0.2, C.steel).box(0.5, 0.9, 0.4, 0, 2.9, 0.2, C.dark);                // hood + chimney
  const grp = b.build('stove');
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.24), new THREE.MeshBasicMaterial({ color: 0x40e070 })); lamp.position.set(0, 0.98, 0); grp.add(lamp);
  grp.userData.lamp = lamp; grp.userData.geos.push(lamp.geometry); grp.userData.mats = [lamp.material];
  return grp;
}
const buildFridge = () => new B().box(0.9, 1.9, 0.9, 0, 0.95, 0, 0xd8dee4).box(0.06, 0.6, 0.06, 0.32, 1.1, 0.48, 0x30343a).box(0.7, 0.05, 0.02, 0, 1.55, 0.46, C.cyan, true).box(0.86, 0.05, 0.86, 0, 1.92, 0, 0x30343a).build('fridge');
const buildCounter = () => new B().box(1.6, 1.0, 0.7, 0, 0.5, 0, C.wood).box(1.66, 0.06, 0.76, 0, 1.02, 0, 0x30343a).box(0.5, 0.3, 0.4, -0.3, 1.2, 0, 0x22262c).box(0.36, 0.2, 0.02, -0.3, 1.24, 0.21, C.green, true).cyl(0.07, 0.05, 0.4, 1.07, 0.1, C.gold).build('counter');
function buildTable(vip) {
  const b = new B(), top = vip ? C.cloth : C.wood;
  b.box(1.1, 0.08, 1.1, 0, 0.78, 0, top).cyl(0.09, 0.74, 0, 0.37, 0, 0x2a2e36).cyl(0.4, 0.04, 0, 0.02, 0, 0x2a2e36).sph(0.06, 0, 0.9, 0, vip ? C.pink : C.gold, true);
  for (const s of [-1, 1]) b.cyl(0.28, 0.42, s * 0.95, 0.21, 0, vip ? 0x8a3a8a : 0x565c64).box(0.06, 0.4, 0.5, s * 1.13, 0.55, 0, 0x30343a);
  if (vip) b.box(1.2, 0.03, 0.02, 0, 1.4, -0.7, C.gold, true).cone(0.14, 0.3, 0, 1.6, -0.7, C.gold, true, 5);
  return b.build(vip ? 'booth' : 'table');
}
function buildSign() {
  const g = new B().box(0.15, 2.6, 0.15, -1.6, 1.3, 0, 0x30343a).box(0.15, 2.6, 0.15, 1.6, 1.3, 0, 0x30343a).box(3.6, 0.7, 0.12, 0, 2.9, 0, 0x14101c).build('sign');
  const tx = canvasTex('signtx', 128, 24, (c, w, h) => { c.fillStyle = '#14101c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff4fd8'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ALIEN DINER', w / 2, h / 2 + 1); c.strokeStyle = '#40e0ff'; c.strokeRect(1.5, 1.5, w - 3, h - 3); });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.62), new THREE.MeshBasicMaterial({ map: tx })); pl.position.set(0, 2.9, -0.07); pl.rotation.y = Math.PI; g.add(pl);
  g.userData.geos.push(pl.geometry); g.userData.mats = [pl.material]; return g;
}
function buildDecor(tier) {
  const b = new B();
  if (tier === 1) {   // plants in the corners + a rug down the aisle (flat, so it is a separate layer mesh below)
    for (const [x, z] of [[-3.7, -2.5], [3.7, -2.5], [-3.7, 0.5], [3.7, 0.5]]) { b.cyl(0.32, 0.5, x, 0.25, z, 0x6a4a3a).cone(0.5, 1.3, x, 1.1, z, C.plant, false, 5).sph(0.1, x + 0.2, 1.5, z, C.pink, true); }
  } else if (tier === 2) {   // lantern posts + banners along the side walls
    for (const [x, z] of [[-3.7, -8], [3.7, -8], [-3.7, -4], [3.7, -4], [-3.7, -1], [3.7, -1]]) { b.box(0.08, 2.0, 0.08, x, 1.0, z, 0x30343a).sph(0.22, x, 2.15, z, C.trim, true, 1, 1.2, 1); b.box(0.5, 0.9, 0.03, x * 1.02, 1.6, z + 0.5, C.red); }
  } else {   // terrace: raised planter walls + neon arch + stars
    for (const s of [-1, 1]) { b.box(0.5, 0.5, 5, s * 3.75, 0.25, 0, 0x5a4a3a).cone(0.4, 0.8, s * 3.75, 0.9, -1.5, C.plant, false, 5).cone(0.4, 0.8, s * 3.75, 0.9, 1.5, C.plant, false, 5); b.box(0.12, 3.7, 0.12, s * 3.4, 1.85, -4.7, 0x30343a); }
    b.box(7, 0.12, 0.12, 0, 3.75, -4.7, C.cyan, true); b.box(6.6, 0.08, 0.08, 0, 3.58, -4.7, C.pink, true);
    for (let i = 0; i < 7; i++) b.cone(0.1, 0.35, -3 + i, 4.1 + (i % 2) * 0.2, -4.7, C.gold, true, 4);
  }
  const grp = b.build('decor' + tier);
  if (tier === 1) {   // the rug
    const rg = new THREE.PlaneGeometry(2.2, 9.5); rg.rotateX(-Math.PI / 2);
    const rm = flatLayer(new THREE.MeshBasicMaterial({ color: 0x7a2a4a }), LAYER.ring); const rug = new THREE.Mesh(rg, rm); rug.position.set(0, LAYER.ring + 0.01, 0.5); grp.add(rug);
    const rg2 = new THREE.PlaneGeometry(1.7, 9), rm2 = flatLayer(new THREE.MeshBasicMaterial({ color: 0xa8442a }), LAYER.lamp); rg2.rotateX(-Math.PI / 2); const r2 = new THREE.Mesh(rg2, rm2); r2.position.set(0, LAYER.lamp + 0.01, 0.5); grp.add(r2);
    grp.userData.geos.push(rg, rg2); grp.userData.mats = [rm, rm2];
  }
  return grp;
}
function buildBot(kind) {
  const col = kind === 'chef' ? 0xe8e8e0 : kind === 'waiter' ? 0x50d8ff : 0xffd23f;
  const b = new B().box(0.5, 0.6, 0.4, 0, 0.75, 0, col).box(0.36, 0.3, 0.3, 0, 1.2, 0, 0xd8dee4).box(0.28, 0.08, 0.02, 0, 1.22, 0.16, 0x40e070, true).box(0.6, 0.15, 0.5, 0, 0.32, 0, 0x30343a).cyl(0.03, 0.2, 0, 1.45, 0, 0x30343a).sph(0.05, 0, 1.58, 0, 0xff4a4a, true);
  b.box(0.12, 0.42, 0.12, -0.34, 0.78, 0.05, 0x565c64).box(0.12, 0.42, 0.12, 0.34, 0.78, 0.05, 0x565c64);
  if (kind === 'chef') b.cyl(0.17, 0.28, 0, 1.5, 0, 0xffffff); else if (kind === 'cash') b.box(0.3, 0.05, 0.2, 0, 1.4, 0, 0xffd23f, true);
  return b.build('bot-' + kind);
}
export function buildPiece(id) {
  const p = PIECE[id]; if (!p) return null;
  switch (p.kind) {
    case 'floor': return buildFloor();
    case 'stove': return buildStove();
    case 'fridge': return buildFridge();
    case 'counter': return buildCounter();
    case 'table': return buildTable(!!p.vip);
    case 'sign': return buildSign();
    case 'decor': return buildDecor(p.tier);
    case 'bot': return buildBot(p.bot);
    default: return null;
  }
}
/** extra static colliders per piece: [x, yCentre, z, hx, hy, hz] in world metres relative to ground (resto.js adds HOME_Y) */
export function piecePads(id) {
  const p = PIECE[id]; if (!p) return [];
  const [x, z] = p.at;
  switch (p.kind) {
    case 'floor': { const h = 1.25, t = 0.15, w = PLOT.x1 - PLOT.x0, cz = (PLOT.z0 + PLOT.z1) / 2, cx = (PLOT.x0 + PLOT.x1) / 2;
      return [[cx, h, PLOT.z1 + 0.05, w / 2 + 0.2, h, t], [PLOT.x0 - 0.05, h, cz, t, h, (PLOT.z1 - PLOT.z0) / 2], [PLOT.x1 + 0.05, h, cz, t, h, (PLOT.z1 - PLOT.z0) / 2],
        [(PLOT.x0 + PLOT.doorX0) / 2, h, PLOT.z0, (PLOT.doorX0 - PLOT.x0) / 2, h, t], [(PLOT.doorX1 + PLOT.x1) / 2, h, PLOT.z0, (PLOT.x1 - PLOT.doorX1) / 2, h, t], [PASS.x, 0.5, PASS.z, 2.4, 0.5, 0.35]]; }
    case 'stove': return [[x, 0.45, z, 0.75, 0.45, 0.42]];
    case 'fridge': return [[x, 0.95, z, 0.45, 0.95, 0.45]];
    case 'counter': return [[x, 0.5, z, 0.8, 0.5, 0.35]];
    case 'table': return [[x, 0.4, z, 0.55, 0.4, 0.55]];
    default: return [];
  }
}

// ---------------------------------------------------------------------------------------------- buy pads
export function buildPad(color = 0x50ff80) {
  const grp = new THREE.Group();
  const dg = new THREE.CircleGeometry(0.85, 20); dg.rotateX(-Math.PI / 2);
  const rg = new THREE.RingGeometry(0.85, 1.0, 20); rg.rotateX(-Math.PI / 2);
  const dm = flatLayer(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }), LAYER.decal);
  const rm = flatLayer(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), LAYER.decal + 0.02);
  const d = new THREE.Mesh(dg, dm), r = new THREE.Mesh(rg, rm); d.position.y = LAYER.decal + 0.01; r.position.y = LAYER.decal + 0.03; grp.add(d, r);
  const ag = new THREE.ConeGeometry(0.22, 0.4, 4), am = new THREE.MeshBasicMaterial({ color });
  const arrow = new THREE.Mesh(ag, am); arrow.rotation.x = Math.PI; arrow.position.y = 1.15; grp.add(arrow);
  grp.userData = { disc: d, ring: r, arrow, geos: [dg, rg, ag], mats: [dm, rm, am] };
  return grp;
}

// ---------------------------------------------------------------------------------------------- customers
const custCache = new Map();
function customerBuilder(shape, body, accent) {
  const b = new B(), eye = 0xffffff;
  switch (shape) {
    case 'blob': b.sph(0.5, 0, 0.62, 0, body, false, 1.1, 1, 1).sph(0.28, 0, 1.28, 0.05, body).box(0.1, 0.1, 0.05, -0.1, 1.32, 0.3, eye, true).box(0.1, 0.1, 0.05, 0.1, 1.32, 0.3, eye, true).box(0.18, 0.5, 0.18, -0.55, 0.7, 0, accent).box(0.18, 0.5, 0.18, 0.55, 0.7, 0, accent); break;
    case 'jelly': b.sph(0.42, 0, 0.62, 0, body, false, 1, 1.25, 1).box(0.09, 0.09, 0.04, -0.13, 0.85, 0.36, 0x101010, true).box(0.09, 0.09, 0.04, 0.13, 0.85, 0.36, 0x101010, true).cyl(0.02, 0.4, 0, 1.4, 0, accent).sph(0.07, 0, 1.62, 0, accent, true); break;
    case 'lizard': b.box(0.5, 0.95, 0.4, 0, 0.75, 0, body).box(0.36, 0.3, 0.42, 0, 1.4, 0.05, body).cone(0.16, 0.9, 0, 0.3, -0.5, body, false, 4).box(0.1, 0.1, 0.05, -0.1, 1.45, 0.27, 0xffee00, true).box(0.1, 0.1, 0.05, 0.1, 1.45, 0.27, 0xffee00, true).cone(0.1, 0.4, 0, 1.75, 0, accent, true, 4).box(0.12, 0.6, 0.12, -0.4, 0.8, 0.05, body).box(0.12, 0.6, 0.12, 0.4, 0.8, 0.05, body); break;
    case 'bot': b.box(0.6, 0.7, 0.45, 0, 0.75, 0, body).box(0.4, 0.34, 0.36, 0, 1.3, 0, 0xa8adb8).box(0.28, 0.1, 0.02, 0, 1.32, 0.19, accent, true).cyl(0.03, 0.3, 0.12, 1.65, 0, 0x30343a).box(0.7, 0.14, 0.5, 0, 0.32, 0, 0x30343a).box(0.14, 0.5, 0.14, -0.42, 0.8, 0, accent).box(0.14, 0.5, 0.14, 0.42, 0.8, 0, accent); break;
    case 'critic': b.box(0.45, 1.3, 0.3, 0, 0.85, 0, body).box(0.5, 0.06, 0.4, 0, 1.55, 0, 0x101018).cyl(0.2, 0.3, 0, 1.75, 0, 0x101018).sph(0.16, 0, 1.4, 0.12, 0xf0f0f0).sph(0.08, 0, 1.4, 0.26, accent, true).box(0.1, 0.5, 0.03, 0, 1.0, 0.16, 0xd23a2a).box(0.12, 0.7, 0.12, -0.32, 0.95, 0, body).box(0.12, 0.7, 0.12, 0.32, 0.95, 0, body); break;
    default: b.box(0.5, 1.0, 0.35, 0, 0.8, 0, body).sph(0.22, 0, 1.55, 0, 0xe8c8a8).box(0.34, 0.1, 0.34, 0, 1.75, 0.03, 0x30343a).box(0.1, 0.1, 0.05, -0.08, 1.55, 0.2, 0x101010, true).box(0.1, 0.1, 0.05, 0.08, 1.55, 0.2, 0x101010, true).box(0.3, 0.4, 0.05, 0.36, 0.95, 0.15, accent, true).box(0.12, 0.6, 0.12, -0.34, 0.85, 0, body).box(0.12, 0.6, 0.12, 0.34, 0.85, 0, body);
  }
  b.box(0.16, 0.42, 0.18, -0.17, 0.21, 0, 0x30343a).box(0.16, 0.42, 0.18, 0.17, 0.21, 0, 0x30343a);   // legs
  return b.build('alien-' + shape);
}
export function buildCustomer(sp) {
  let key = sp.id; let base = custCache.get(key);
  if (!base) { base = customerBuilder(sp.shape, sp.body, sp.accent); custCache.set(key, base); }
  const grp = new THREE.Group();
  for (const m of base.children) { const c = new THREE.Mesh(m.geometry, m.material); grp.add(c); }
  return grp;
}
export const disposeCustomers = () => { for (const g of custCache.values()) for (const geo of g.userData.geos) geo.dispose(); custCache.clear(); };

/** always-on plot marker: four glowing corner posts + a signpost by the door (so the empty plot reads as "something goes here") */
export function buildMarker() {
  const b = new B();
  for (const [x, z] of [[PLOT.x0, PLOT.z0], [PLOT.x1, PLOT.z0], [PLOT.x0, PLOT.z1], [PLOT.x1, PLOT.z1]]) b.box(0.18, 1.6, 0.18, x, 0.8, z, 0x30343a).box(0.22, 0.22, 0.22, x, 1.7, z, 0xffa030, true);
  b.box(0.14, 2.2, 0.14, DOOR.x + 2.6, 1.1, 26.6, 0x30343a).box(1.9, 0.9, 0.1, DOOR.x + 2.6, 2.3, 26.6, 0x14101c);
  const g = b.build('marker');
  const tx = canvasTex('marker', 128, 48, (c, w, h) => { c.fillStyle = '#14101c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffa030'; c.strokeRect(1.5, 1.5, w - 3, h - 3); c.fillStyle = '#ffd9a0'; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ALIEN DINER', w / 2, 17); c.fillStyle = '#ff4fd8'; c.fillText('PLOT [E]', w / 2, 34); });
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.8), new THREE.MeshBasicMaterial({ map: tx })); pl.position.set(DOOR.x + 2.6, 2.3, 26.54); pl.rotation.y = Math.PI; g.add(pl);
  g.userData.geos.push(pl.geometry); g.userData.mats = [pl.material]; return g;
}
export function buildPest() { return new B().sph(0.16, 0, 0.16, 0, 0x3a2a22, false, 1, 0.7, 1.4).sph(0.06, 0, 0.16, 0.22, 0xff2a2a, true).box(0.02, 0.02, 0.2, 0.08, 0.2, 0.22, 0x101010).box(0.02, 0.02, 0.2, -0.08, 0.2, 0.22, 0x101010).build('pest'); }
export function buildShuttle() {
  const b = new B().sph(1.6, 0, 1.4, 0, 0x8a90a0, false, 1.5, 0.7, 1.1).box(1.4, 0.4, 0.8, 0, 2.0, 0.9, 0x30343a).box(1.2, 0.18, 0.06, 0, 2.0, 1.32, 0x60e0ff, true);
  for (const [x, z] of [[-1.6, -0.7], [1.6, -0.7], [0, 1.4]]) { b.cyl(0.08, 0.9, x, 0.45, z, 0x565c64).cyl(0.3, 0.06, x, 0.03, z, 0x30343a); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.sph(0.12, Math.cos(a) * 1.9, 1.35, Math.sin(a) * 1.3, 0xffd23f, true); }
  b.box(0.9, 0.06, 0.9, 0, 0.02, 0, 0xffa030, true);
  return b.build('shuttle');
}

// ---------------------------------------------------------------------------------------------- item models (plates + ingredients), for window.__kefalMods.itemModels
export function plateModel(dishId) {
  const d = DISH[dishId];
  return new B().cyl(0.16, 0.02, 0, 0.01, 0, 0xf4f4f0).cyl(0.11, 0.015, 0, 0.03, 0, 0xd8d8d0).sph(0.09, 0, 0.07, 0, d ? d.col : 0xffffff, false, 1, 0.7, 1).sph(0.03, 0.04, 0.12, 0.02, 0x40e070).build('plate');
}
export function ingredientModel(color, kind) {
  const b = new B();
  if (kind === 'moon') b.cone(0.04, 0.16, 0, 0.1, 0, 0x3fa84a, false, 4).sph(0.09, 0, 0.2, 0, color, true, 1, 0.5, 1);
  else if (kind === 'spice') b.cone(0.05, 0.22, 0, 0.11, 0, color, true, 5).cyl(0.02, 0.05, 0, 0.24, 0, 0x3fa84a);
  else if (kind === 'mushroom') b.cyl(0.03, 0.12, 0, 0.06, 0, 0xe8e8d0).sph(0.11, 0, 0.16, 0, color, true, 1, 0.6, 1);
  else b.sph(0.09, 0, 0.1, 0, color, true).sph(0.05, 0.09, 0.06, 0, 0x30203a);
  return b.build('ing');
}

// ---------------------------------------------------------------------------------------------- bubbles
const bubbleCache = new Map();
export function bubbleMaterial(dishId) {
  let m = bubbleCache.get(dishId); if (m) return m;
  const d = DISH[dishId] || { name: '...', col: '#888888' };
  const tx = canvasTex('bb|' + dishId, 192, 32, (g, w, h) => { g.fillStyle = 'rgba(10,8,16,.85)'; g.fillRect(0, 0, w, h); g.fillStyle = d.col; g.fillRect(0, 0, 10, h); g.fillStyle = '#fff'; g.font = 'bold 17px monospace'; g.textBaseline = 'middle'; g.fillText((d.name || '').slice(0, 18), 16, h / 2 + 1); });
  m = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }); bubbleCache.set(dishId, m); return m;
}
export const disposeBubbles = () => { for (const m of bubbleCache.values()) m.dispose(); bubbleCache.clear(); };
export { flatLayer, LAYER };
