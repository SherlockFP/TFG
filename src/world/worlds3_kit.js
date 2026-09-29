// WORLDS3 kit (wave 8): merged-geometry prop recipes for the facility set dressing + the themed pockets + the wrong door frame.
// Everything is a colour-per-vertex box/sphere/cylinder batch (2 draw calls: lit + glow), no lights, no textures except the hotel plate atlas.
// Recipe coordinates: x along the wall, z OUT from the wall (+z faces into the room), footprint centre at (0, *, 0), y from the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KINDS, POCKET_KINDS } from '../game/worlds3_core.js';

const hash = (x, z) => { let h = Math.imul(Math.round(x * 31) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(Math.round(z * 37) ^ 0x27d4eb2f, 0xc2b2ae35); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

export class BoxBatch {
  constructor(y0 = 0) { this.lit = []; this.glow = []; this.plates = []; this.y0 = y0; }   // y0 = floor height added to every local y
  _push(list, geo, color) {
    geo.deleteAttribute('uv');
    const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    list.push(geo);
  }
  /** world-space axis box (yaw rotates it about its own centre) */
  box(cx, cy, cz, sx, sy, sz, color, glow = false, yaw = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (yaw) g.rotateY(yaw);
    g.translate(cx, cy, cz);
    this._push(glow ? this.glow : this.lit, g, color);
  }
  sphere(cx, cy, cz, r, color, glow = false) {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.translate(cx, cy, cz);
    this._push(glow ? this.glow : this.lit, g, color);
  }
  /** cylinder with its axis along world x (wheels) */
  wheel(cx, cy, cz, r, len, color, yaw = 0) {
    const g = new THREE.CylinderGeometry(r, r, len, 10);
    g.rotateZ(Math.PI / 2);
    if (yaw) g.rotateY(yaw);
    g.translate(cx, cy, cz);
    this._push(this.lit, g, color);
  }
  /** local-frame box, placed with footprint centre (px, pz) and yaw */
  lbox(p, x, y, z, sx, sy, sz, color, glow = false) {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    this.box(p.x + x * c + z * s, y + this.y0, p.z - x * s + z * c, sx, sy, sz, color, glow, p.yaw);
  }
  lsph(p, x, y, z, r, color, glow = false) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw); this.sphere(p.x + x * c + z * s, y + this.y0, p.z - x * s + z * c, r, color, glow); }
  lwheel(p, x, y, z, r, len, color) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw); this.wheel(p.x + x * c + z * s, y + this.y0, p.z - x * s + z * c, r, len, color, p.yaw); }
  /** flat quad on a wall (hotel number plate); world position + yaw, uv cell filled at build */
  plate(p, x, y, z, w, h) { const c = Math.cos(p.yaw), s = Math.sin(p.yaw); this.plates.push({ x: p.x + x * c + z * s, y: y + this.y0, z: p.z - x * s + z * c, w, h, yaw: p.yaw }); }
  get empty() { return !this.lit.length && !this.glow.length && !this.plates.length; }
  /** -> THREE.Group (meshes named w3_lit / w3_glow / w3_plates). `atlas` = { tex, cells, pick(i) } for plates. */
  build(name, atlas = null) {
    const group = new THREE.Group();
    group.name = name;
    if (this.lit.length) { const m = new THREE.Mesh(mergeGeometries(this.lit, false), new THREE.MeshLambertMaterial({ vertexColors: true })); m.name = 'w3_lit'; group.add(m); }
    if (this.glow.length) { const m = new THREE.Mesh(mergeGeometries(this.glow, false), new THREE.MeshBasicMaterial({ vertexColors: true })); m.name = 'w3_glow'; group.add(m); }
    if (this.plates.length && atlas) {
      const n = this.plates.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
      this.plates.forEach((q, i) => {
        const c = Math.cos(q.yaw), s = Math.sin(q.yaw), hw = q.w / 2, hh = q.h / 2;
        const corner = (lx, ly, k) => { pos[i * 12 + k * 3] = q.x + lx * c; pos[i * 12 + k * 3 + 1] = q.y + ly; pos[i * 12 + k * 3 + 2] = q.z - lx * s; };
        corner(-hw, -hh, 0); corner(hw, -hh, 1); corner(hw, hh, 2); corner(-hw, hh, 3);
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: atlas.tex, side: THREE.DoubleSide }));
      m.name = 'w3_plates';
      group.add(m);
      const fill = () => {
        for (let i = 0; i < n; i++) {
          const cell = atlas.pick(i), cx = cell % atlas.cols, cy = Math.floor(cell / atlas.cols);
          const u0 = cx / atlas.cols, u1 = (cx + 1) / atlas.cols, v1 = 1 - cy / atlas.rows, v0 = 1 - (cy + 1) / atlas.rows;
          uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
        }
        g.attributes.uv.needsUpdate = true;
      };
      fill();
      group.userData.rerollPlates = fill;
    }
    return group;
  }
}

const P = { // facility palettes by interior theme (walls are their own; these are the furniture colours)
  factory: { wood: 0x6b5a45, metal: 0x59616b, crate: 0x8a6a3c, crate2: 0x6a5230, paper: 0xe9e2cf, chair: 0x2e3238, screen: 0x7fe0b0, shelf: 0x4a5058 },
  office: { wood: 0x8a7a62, metal: 0x7a828c, crate: 0xa08c6a, crate2: 0x7a6a4c, paper: 0xf0ecdf, chair: 0x3a4a5a, screen: 0x8fd0ff, shelf: 0x6a727c },
  hospital: { wood: 0xc8ccc8, metal: 0xb4bcc0, crate: 0x9ab0ac, crate2: 0x7a9490, paper: 0xf4f6f2, chair: 0x5a7a80, screen: 0x9fffd0, shelf: 0xa8b0b0 },
  serverfarm: { wood: 0x2a2f38, metal: 0x3a424e, crate: 0x2c3440, crate2: 0x222a34, paper: 0xc8d0dc, chair: 0x1c2028, screen: 0x7fc4ff, shelf: 0x2a303a },
  mansion: { wood: 0x4a2c1c, metal: 0x6a5a3a, crate: 0x5a3a24, crate2: 0x3c2618, paper: 0xe0d4b8, chair: 0x3a1c18, screen: 0xffc27a, shelf: 0x3c2618 },
};
export const paletteFor = (theme) => P[theme] || P.factory;

// ---------------------------------------------------------------- facility recipes
const FAC = {
  workstation(b, p, c) {
    b.lbox(p, 0, 0.74, -0.25, 1.6, 0.05, 0.7, c.wood);
    b.lbox(p, -0.77, 0.36, -0.25, 0.05, 0.72, 0.66, c.wood); b.lbox(p, 0.77, 0.36, -0.25, 0.05, 0.72, 0.66, c.wood);
    b.lbox(p, 0, 0.5, -0.56, 1.5, 0.5, 0.04, c.wood);
    b.lbox(p, 0, 0.8, -0.4, 0.12, 0.06, 0.1, c.metal);
    b.lbox(p, 0, 1.02, -0.42, 0.56, 0.38, 0.05, 0x14171c);
    b.lbox(p, 0, 1.02, -0.385, 0.5, 0.31, 0.01, c.screen, true);
    b.lbox(p, 0, 0.775, -0.08, 0.42, 0.02, 0.15, 0x22262c);
    b.lbox(p, 0.55, 0.767, -0.2, 0.24, 0.012, 0.3, c.paper);
    b.lbox(p, 0, 0.48, 0.32, 0.46, 0.06, 0.46, c.chair); b.lbox(p, 0, 0.78, 0.53, 0.46, 0.5, 0.05, c.chair);
    b.lbox(p, 0, 0.24, 0.32, 0.06, 0.44, 0.06, 0x1a1c20); b.lbox(p, 0, 0.03, 0.32, 0.42, 0.04, 0.42, 0x1a1c20);
  },
  shelf(b, p, c, r) {
    for (const sx of [-0.78, 0.78]) for (const sz of [-0.24, 0.24]) b.lbox(p, sx, 1.0, sz, 0.05, 2.0, 0.05, c.shelf);
    for (const y of [0.1, 0.62, 1.14, 1.66, 1.98]) b.lbox(p, 0, y, 0, 1.56, 0.04, 0.5, c.metal);
    const cols = [c.crate, c.crate2, c.paper, 0x8a3a3a, 0x3a5a7a];
    for (let row = 0; row < 3; row++) { let x = -0.7; while (x < 0.55) { const w = 0.22 + r() * 0.24, h = 0.18 + r() * 0.26; if (r() < 0.72) b.lbox(p, x + w / 2, 0.12 + row * 0.52 + h / 2, (r() - 0.5) * 0.06, w, h, 0.34, cols[Math.floor(r() * cols.length)]); x += w + 0.06; } }
  },
  crates(b, p, c) {
    b.lbox(p, 0, 0.06, 0, 1.2, 0.12, 1.0, c.crate2);
    b.lbox(p, -0.3, 0.45, -0.1, 0.6, 0.6, 0.6, c.crate); b.lbox(p, 0.35, 0.4, 0.1, 0.5, 0.5, 0.5, c.crate2);
    b.lbox(p, -0.3, 0.95, -0.1, 0.45, 0.4, 0.45, c.crate);
    b.lbox(p, -0.3, 0.45, 0.21, 0.4, 0.06, 0.02, 0xd8c890);
  },
  tableset(b, p, c) {
    b.lbox(p, 0, 0.75, 0, 1.4, 0.05, 0.8, c.wood);
    for (const sx of [-0.62, 0.62]) for (const sz of [-0.33, 0.33]) b.lbox(p, sx, 0.37, sz, 0.06, 0.74, 0.06, c.metal);
    for (const sz of [-0.68, 0.68]) { b.lbox(p, 0, 0.42, sz, 1.3, 0.06, 0.28, c.chair); for (const sx of [-0.55, 0.55]) b.lbox(p, sx, 0.2, sz, 0.05, 0.4, 0.24, c.metal); }
    b.lbox(p, 0.3, 0.83, 0.1, 0.09, 0.11, 0.09, 0xe8e0d0); b.lbox(p, -0.4, 0.78, -0.1, 0.34, 0.02, 0.26, c.paper);
  },
  bench(b, p, c) {
    b.lbox(p, 0, 0.45, 0, 1.6, 0.06, 0.4, c.wood);
    for (const sx of [-0.72, 0.72]) b.lbox(p, sx, 0.21, 0, 0.06, 0.42, 0.36, c.metal);
  },
  cart(b, p, c) {
    b.lbox(p, 0, 0.3, 0, 0.9, 0.04, 0.6, c.metal); b.lbox(p, 0, 0.85, 0, 0.9, 0.04, 0.6, c.metal);
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.27, 0.27]) { b.lbox(p, sx, 0.55, sz, 0.04, 0.9, 0.04, c.shelf); b.lbox(p, sx, 0.05, sz, 0.08, 0.1, 0.08, 0x111111); }
    b.lbox(p, 0, 1.0, 0, 0.4, 0.2, 0.3, 0x1c2026); b.lbox(p, 0, 1.03, 0.16, 0.34, 0.13, 0.01, c.screen, true);
    b.lbox(p, -0.28, 0.4, 0, 0.3, 0.16, 0.4, c.crate);
  },
  cabinet(b, p, c, r) {
    const aid = r() < 0.4, y = KINDS.cabinet.mount;
    b.lbox(p, 0, y + 0.3, 0, 0.36, 0.6, 0.12, aid ? 0xe8ece8 : 0xb02a22);
    if (aid) b.lbox(p, 0, y + 0.3, 0.065, 0.16, 0.05, 0.01, 0x3aff8a, true), b.lbox(p, 0, y + 0.3, 0.065, 0.05, 0.16, 0.01, 0x3aff8a, true);
    else { b.lbox(p, 0, y + 0.3, 0.065, 0.14, 0.34, 0.01, 0xe8e0d0); b.lbox(p, 0, y + 0.52, 0.07, 0.1, 0.03, 0.02, 0x222222); }
  },
};

// ---------------------------------------------------------------- pocket recipes
const rackUnit = (b, p, ox, r) => {
  b.lbox(p, ox, 1.05, -0.02, 0.9, 2.1, 0.86, 0x1c222c);
  for (let i = 0; i < 8; i++) {
    const y = 0.25 + i * 0.23;
    b.lbox(p, ox, y, 0.45, 0.82, 0.2, 0.04, 0x2b3340);
    b.lbox(p, ox - 0.3, y, 0.475, 0.06, 0.05, 0.01, r() < 0.15 ? 0xff4a3a : r() < 0.5 ? 0x3aff8a : 0x4ab0ff, true);
    b.lbox(p, ox + 0.1, y, 0.475, 0.4, 0.02, 0.01, 0x0b0e14);
  }
};
const POC = {
  lifeguard(b, p) {
    for (const sx of [-0.35, 0.35]) for (const sz of [-0.35, 0.35]) b.lbox(p, sx, 0.5, sz, 0.06, 1.0, 0.06, 0xe8eef0);
    b.lbox(p, 0, 1.05, 0, 0.8, 0.06, 0.8, 0xe8eef0); b.lbox(p, 0, 1.6, -0.38, 0.8, 0.9, 0.05, 0xd83a3a);
    for (const y of [0.3, 0.6]) b.lbox(p, 0, y, 0.4, 0.6, 0.03, 0.05, 0xc8ccd0);
    for (const sx of [-0.3, 0.3]) b.lbox(p, sx, 0.45, 0.4, 0.04, 0.9, 0.04, 0xc8ccd0);
  },
  deckchair(b, p) {
    b.lbox(p, 0, 0.28, 0.15, 0.6, 0.04, 0.9, 0xf2f2f0); b.lbox(p, 0, 0.5, -0.5, 0.6, 0.5, 0.04, 0x3ac8d8);
    for (const sx of [-0.3, 0.3]) { b.lbox(p, sx, 0.14, 0.5, 0.04, 0.28, 0.04, 0xd8d8d8); b.lbox(p, sx, 0.14, -0.3, 0.04, 0.28, 0.04, 0xd8d8d8); }
  },
  poolsign(b, p) { b.lbox(p, 0, 1.95, 0, 1.1, 0.5, 0.06, 0x1a6a8a); b.lbox(p, 0, 1.95, 0.04, 0.9, 0.08, 0.01, 0xffffff, true); b.lbox(p, 0, 1.82, 0.04, 0.5, 0.05, 0.01, 0xffffff, true); },
  ringbuoy(b, p) { b.lbox(p, 0, 1.6, 0, 0.56, 0.56, 0.06, 0xd83a3a); b.lbox(p, 0, 1.6, 0.01, 0.3, 0.3, 0.07, 0xbfe4ea); b.lbox(p, 0, 1.6, 0.04, 0.58, 0.1, 0.02, 0xffffff); },
  rack(b, p, c, r) { rackUnit(b, p, 0, r); },
  rackpair(b, p, c, r) { rackUnit(b, p, -0.475, r); rackUnit(b, p, 0.475, r); },
  ups(b, p) { b.lbox(p, 0, 0.55, 0, 0.66, 1.1, 0.76, 0x2a3038); b.lbox(p, 0, 0.9, 0.385, 0.3, 0.1, 0.01, 0x7fc4ff, true); b.lbox(p, 0, 0.7, 0.385, 0.5, 0.03, 0.01, 0xffb030, true); },
  cabletray(b, p, c, r) {
    b.lbox(p, 0, 2.4, 0, 2.4, 0.06, 0.45, 0x50575f);
    for (const sx of [-1, 1]) b.lbox(p, sx, 2.25, -0.16, 0.05, 0.25, 0.05, 0x50575f);
    b.lbox(p, 0, 2.46, 0, 2.3, 0.05, 0.3, 0x0d1015);
    for (let i = 0; i < 5; i++) b.lbox(p, -0.9 + i * 0.45, 2.5, (r() - 0.5) * 0.2, 0.05, 0.03, 0.05, r() < 0.5 ? 0x3ac8ff : 0xffd24a, true);
  },
  hoteldoor(b, p) {
    b.lbox(p, 0, 1.09, -0.01, 1.1, 2.18, 0.06, 0x241208); b.lbox(p, 0, 1.05, 0.02, 0.95, 2.1, 0.06, 0x4a2a1a);
    b.lbox(p, 0.36, 1.0, 0.07, 0.1, 0.03, 0.05, 0xc8a24a); b.lbox(p, 0, 1.75, 0.055, 0.05, 0.05, 0.02, 0xc8a24a);
    b.plate(p, 0, 1.55, 0.056, 0.26, 0.15);
  },
  luggage(b, p) {
    b.lbox(p, 0, 0.2, 0, 1.2, 0.04, 0.6, 0xc8a24a);
    for (const sx of [-0.55, 0.55]) { b.lbox(p, sx, 0.75, -0.28, 0.04, 1.4, 0.04, 0xc8a24a); b.lbox(p, sx, 0.05, 0.25, 0.08, 0.1, 0.08, 0x222222); b.lbox(p, sx, 0.05, -0.25, 0.08, 0.1, 0.08, 0x222222); }
    b.lbox(p, 0, 1.4, -0.28, 1.14, 0.04, 0.04, 0xc8a24a);
    b.lbox(p, -0.3, 0.42, 0, 0.5, 0.36, 0.4, 0x6a2a2a); b.lbox(p, 0.28, 0.4, 0.05, 0.46, 0.32, 0.36, 0x2a3a4a); b.lbox(p, -0.25, 0.75, 0, 0.36, 0.3, 0.3, 0x5a4a2a);
  },
  sconce(b, p) { b.lbox(p, 0, 2.05, -0.02, 0.1, 0.3, 0.04, 0xc8a24a); b.lbox(p, 0, 2.1, 0.05, 0.2, 0.24, 0.1, 0xffcf88, true); },
  plant(b, p) { b.lbox(p, 0, 0.25, 0, 0.4, 0.5, 0.4, 0x6a3a26); b.lbox(p, 0, 0.85, 0, 0.55, 0.7, 0.55, 0x2e6a3a); b.lbox(p, 0.1, 1.28, -0.05, 0.35, 0.35, 0.35, 0x3a8048); },
  gifts(b, p) {
    b.lbox(p, -0.35, 0.25, -0.1, 0.6, 0.5, 0.6, 0xd83a5a); b.lbox(p, -0.35, 0.25, -0.1, 0.08, 0.52, 0.62, 0xffe27a); b.lbox(p, -0.35, 0.25, -0.1, 0.62, 0.52, 0.08, 0xffe27a);
    b.lbox(p, 0.35, 0.2, 0.1, 0.5, 0.4, 0.5, 0x3a8ad8); b.lbox(p, 0.35, 0.2, 0.1, 0.08, 0.42, 0.52, 0xffffff);
    b.lbox(p, -0.3, 0.7, -0.1, 0.4, 0.4, 0.4, 0x7ad84a); b.lbox(p, -0.3, 0.7, -0.1, 0.06, 0.42, 0.42, 0xd83a5a);
  },
  partytable(b, p) {
    b.lbox(p, 0, 0.75, 0, 1.6, 0.05, 0.9, 0xf2f2f0);
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.36, 0.36]) b.lbox(p, sx, 0.37, sz, 0.06, 0.74, 0.06, 0xd83a5a);
    b.lbox(p, 0, 0.87, 0, 0.4, 0.14, 0.4, 0xffd0dc); b.lbox(p, 0, 0.99, 0, 0.03, 0.09, 0.03, 0xffe27a, true);
    b.lbox(p, 0.55, 0.86, 0.2, 0.12, 0.16, 0.12, 0x3ac8d8); b.lbox(p, -0.55, 0.86, 0.15, 0.12, 0.16, 0.12, 0xffd24a);
  },
  balloons(b, p) {
    b.lbox(p, 0, 0.06, 0, 0.2, 0.12, 0.2, 0x444444); b.lbox(p, 0, 0.97, 0, 0.012, 1.7, 0.012, 0xf0f0f0);
    b.lsph(p, 0, 2.05, 0, 0.28, 0xe8384a); b.lsph(p, 0.2, 1.98, 0.1, 0.24, 0x3a7ae8); b.lsph(p, -0.18, 2.02, -0.1, 0.24, 0xffd24a);
  },
  banner(b, p) { for (let i = 0; i < 5; i++) b.lbox(p, -1.0 + i * 0.5, 2.05, 0, 0.5, 0.9, 0.04, i & 1 ? 0xffd24a : 0xe8384a); b.lbox(p, 0, 2.52, 0, 2.6, 0.04, 0.05, 0xffffff); },
  wheelchair(b, p) {
    b.lbox(p, 0, 0.5, 0.05, 0.5, 0.06, 0.45, 0x2a2f34); b.lbox(p, 0, 0.85, -0.2, 0.5, 0.6, 0.05, 0x2a2f34);
    for (const sx of [-0.3, 0.3]) { b.lwheel(p, sx, 0.3, -0.1, 0.3, 0.04, 0x1a1a1a); b.lwheel(p, sx * 0.93, 0.08, 0.4, 0.08, 0.04, 0x1a1a1a); b.lbox(p, sx * 0.9, 0.7, 0.05, 0.04, 0.04, 0.4, 0x8a929a); b.lbox(p, sx * 0.83, 1.1, -0.25, 0.03, 0.03, 0.14, 0x8a929a); }
    b.lbox(p, 0, 0.2, 0.42, 0.35, 0.03, 0.15, 0x8a929a);
  },
  hospbed(b, p) {
    b.lbox(p, 0, 0.35, 0, 0.9, 0.1, 2.0, 0xc8ccc8); b.lbox(p, 0, 0.5, 0.05, 0.85, 0.14, 1.85, 0xd8d8cc);
    b.lbox(p, 0, 0.75, -1.0, 0.9, 0.6, 0.05, 0xb8bcb8); b.lbox(p, 0, 0.65, 1.0, 0.9, 0.4, 0.05, 0xb8bcb8);
    b.lbox(p, 0, 0.58, 0.45, 0.86, 0.03, 1.0, 0x7a8a90); b.lbox(p, 0, 0.62, -0.75, 0.5, 0.08, 0.3, 0xe8e8e0);
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.95, 0.95]) b.lbox(p, sx, 0.15, sz, 0.05, 0.3, 0.05, 0x8a929a);
  },
  padded(b, p, c, r) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const g = 0.78 + r() * 0.16; b.lbox(p, -0.6 + i * 0.4, 0.35 + j * 0.65, 0, 0.38, 0.62, 0.1, new THREE.Color(0.8 * g, 0.82 * g, 0.76 * g).getHex()); }
  },
  filecab(b, p) {
    b.lbox(p, 0, 0.675, 0, 0.5, 1.35, 0.55, 0x6a7078);
    for (const y of [0.3, 0.7, 1.1]) { b.lbox(p, 0, y, 0.28, 0.44, 0.3, 0.02, 0x545a62); b.lbox(p, 0, y, 0.3, 0.14, 0.03, 0.02, 0xb0b0b0); }
    b.lbox(p, 0.05, 1.37, 0, 0.3, 0.03, 0.25, 0xe9e2cf);
  },
};

/** add one planned prop (planner output) to a batch. `pal` = furniture colours, `seed` decorrelates the little details */
export function addProp(batch, p, pal, pocket = false) {
  const fn = (pocket ? POC : FAC)[p.kind];
  if (!fn) return false;
  let k = hash(p.x, p.z) * 4294967296 | 0;
  const r = () => { k = (Math.imul(k, 1664525) + 1013904223) | 0; return ((k >>> 8) & 0xffff) / 65536; };
  fn(batch, p, pal || paletteFor('factory'), r);
  return true;
}
export const propHeight = (kind, pocket) => (pocket ? POCKET_KINDS : KINDS)[kind]?.h || 1;

// ---------------------------------------------------------------- wrong door frame (facility)
/** flush frame around the glitch patch: posts, lintel, a flickering glow bar, a "?" plate, the floor spill. Returns { group, glowMat, spillMat }. */
export function buildDoorFrame(pos, normal) {
  const yaw = Math.atan2(normal.x, normal.z);
  const p = { x: pos.x + normal.x * 0.1, z: pos.z + normal.z * 0.1, yaw };
  const b = new BoxBatch();
  const y0 = pos.y;
  b.lbox(p, -0.86, y0 + 1.25, 0, 0.14, 2.5, 0.18, 0x2a1c10); b.lbox(p, 0.86, y0 + 1.25, 0, 0.14, 2.5, 0.18, 0x2a1c10);
  b.lbox(p, 0, y0 + 2.46, 0, 1.86, 0.16, 0.18, 0x2a1c10);
  const group = b.build('w3_wrongdoor');
  // flickering glow bar over the lintel + a yellow strip down each post (own materials so the frame can pulse)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, fog: false });
  const bar = new BoxBatch();
  const gp = { x: p.x, z: p.z, yaw };
  bar.lbox(gp, 0, y0 + 2.6, 0.02, 1.7, 0.07, 0.07, 0xffffff, true);
  bar.lbox(gp, -0.86, y0 + 1.25, 0.1, 0.03, 2.3, 0.02, 0xffffff, true); bar.lbox(gp, 0.86, y0 + 1.25, 0.1, 0.03, 2.3, 0.02, 0xffffff, true);
  bar.lbox(gp, 0, y0 + 2.86, 0.02, 0.5, 0.2, 0.03, 0xffffff, true);
  const glowGroup = bar.build('w3_wrongdoor_glow');
  for (const m of glowGroup.children) { m.material.dispose(); m.material = glowMat; }
  group.add(glowGroup);
  // floor spill: soft additive yellow pool in front of the door
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,214,90,0.85)'); grd.addColorStop(1, 'rgba(255,214,90,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spillMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), spillMat);
  spill.rotation.x = -Math.PI / 2; spill.position.set(pos.x + normal.x * 1.5, y0 + 0.03, pos.z + normal.z * 1.5);
  spill.name = 'w3_spill'; spill.renderOrder = 2;
  group.add(spill);
  return { group, glowMat, spillMat, spillTex: tex };
}
