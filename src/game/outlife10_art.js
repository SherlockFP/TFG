// OUTLIFE art (wave 10): every mesh of the outdoor-life layer. Instanced / merged only (a dozen draw calls per moon), Lambert vertex colours or unlit, NO scene lights.
//   rocksMesh   1 InstancedMesh (jittered icosahedron: boulders, slabs, standing stones, snow mounds / dunes)
//   tuftMeshes  2 InstancedMesh (cross-quad billboards with a cut-out canvas texture: blades / reeds / spikes, dry twigs)
//   woodMeshes  2 InstancedMesh (snag = dead tree, stump)
//   poiMeshes   2 merged meshes (solid + glow) for the five Company-debris points of interest
//   fogMesh     1 InstancedMesh of soft radial cards, 3 layers per pool
//   skylineMeshes  1 merged silhouette mesh + 1 Points (blinking beacons)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.js';
import { makeCanvasTexture, getTexture } from '../render/textures.js';
import { thinDecor } from '../render/quality.js';
import { Bag } from './mapart_art.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function instanced(geo, mat, list, place, colorOf, { fixed = false } = {}) {
  if (!list.length) return null;
  const inst = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    place(it, _p, _e, _s);
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    inst.setMatrixAt(i, _m);
    if (colorOf) inst.setColorAt(i, _c.set(colorOf(it)));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.matrixAutoUpdate = false;
  inst.userData.fixed = fixed;
  return inst;
}
const hash3 = (x, y, z) => { let h = Math.imul(Math.round(x * 997) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(y * 991) + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(Math.round(z * 983) + 0x165667b1, 0x27d4eb2f); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return ((h >>> 0) % 10007) / 10007; };
/** Euler (YXZ) that turns +Y onto the unit vector d */
const eulerFor = (dx, dy, dz) => { _q.setFromUnitVectors(_p.set(0, 1, 0), _s.set(dx, dy, dz).normalize()); _e.setFromQuaternion(_q, 'YXZ'); return [_e.x, _e.y, _e.z]; };

// ------------------------------------------------------------------ rocks
export function rocksMesh(rocks) {
  const cols = rocks.filter((r) => r.col), rest = thinDecor(rocks.filter((r) => !r.col));
  const list = cols.concat(rest);
  if (!list.length) return null;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {   // vertex jitter keyed by position so shared corners move together (no cracks)
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 0.8 + 0.34 * hash3(x, y, z);
    pos.setXYZ(i, x * k, y * k * (y < 0 ? 0.85 : 1), z * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: getTexture('rock'), flatShading: true });
  const mesh = instanced(geo, mat, list, (r, p, e, s) => { p.set(r.x, r.y, r.z); e.set(r.rx, r.ry, r.rz, 'YXZ'); s.set(r.sx, r.sy, r.sz); }, (r) => r.c);
  if (mesh) mesh.name = 'ol-rocks';
  return mesh;
}
/** box collider of a boulder: half-extents + centre, inscribed in the visible ellipsoid */
export const rockCollider = (r) => ({ x: r.x, y: r.y - r.sy * 0.5 + r.sy * 0.55, z: r.z, hx: r.sx * 0.66, hy: r.sy * 0.55, hz: r.sz * 0.66, ry: r.ry });

// ------------------------------------------------------------------ tufts (cross-quad billboards)
function crossQuadGeo() {
  const pos = [], uv = [], nor = [], idx = [];
  for (let q = 0; q < 3; q++) {
    const a = (q * Math.PI) / 3, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5, o = q * 4;
    pos.push(-c, 0, s, c, 0, -s, c, 1, -s, -c, 1, s);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);   // up-facing normals: no dark back faces, the tuft takes the ground light
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
const TUFT_DRAW = {
  blade(c, W, H, R) {
    for (let i = 0; i < 13; i++) {
      const x0 = W * (0.12 + 0.76 * R.next()), len = H * (0.45 + 0.5 * R.next()), lean = (R.next() - 0.5) * W * 0.35, w = 2 + R.next() * 3;
      const g = c.createLinearGradient(0, H, 0, H - len); g.addColorStop(0, grey(120)); g.addColorStop(1, grey(255));
      c.fillStyle = g; c.beginPath(); c.moveTo(x0 - w, H); c.quadraticCurveTo(x0 + lean * 0.2, H - len * 0.55, x0 + lean, H - len); c.quadraticCurveTo(x0 + lean * 0.3 + w * 0.4, H - len * 0.5, x0 + w, H); c.closePath(); c.fill();
    }
  },
  reed(c, W, H, R) {
    for (let i = 0; i < 8; i++) {
      const x0 = W * (0.15 + 0.7 * R.next()), lean = (R.next() - 0.5) * W * 0.3, w = 1.6 + R.next() * 1.6;
      const g = c.createLinearGradient(0, H, 0, 0); g.addColorStop(0, grey(110)); g.addColorStop(1, grey(250));
      c.fillStyle = g; c.beginPath(); c.moveTo(x0 - w, H); c.quadraticCurveTo(x0 + lean * 0.1, H * 0.5, x0 + lean, 2 + R.next() * 8); c.quadraticCurveTo(x0 + lean * 0.2 + w, H * 0.5, x0 + w, H); c.closePath(); c.fill();
    }
  },
  spike(c, W, H, R) {
    for (let i = 0; i < 6; i++) {
      const x0 = W * (0.1 + 0.8 * R.next()), len = H * (0.35 + 0.6 * R.next()), w = 4 + R.next() * 5, lean = (R.next() - 0.5) * 10;
      c.fillStyle = grey(160 + R.next() * 95); c.beginPath(); c.moveTo(x0 - w, H); c.lineTo(x0 + lean, H - len); c.lineTo(x0 + w, H); c.closePath(); c.fill();
    }
  },
  twig(c, W, H, R) {
    c.lineCap = 'round';
    const branch = (x, y, a, len, wd, d) => {
      const x2 = x + Math.sin(a) * len, y2 = y - Math.cos(a) * len;
      c.strokeStyle = grey(140 + d * 22); c.lineWidth = wd; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      if (d < 3) { branch(x2, y2, a - 0.5 - R.next() * 0.4, len * 0.7, Math.max(1, wd - 0.8), d + 1); branch(x2, y2, a + 0.4 + R.next() * 0.4, len * 0.66, Math.max(1, wd - 0.8), d + 1); }
    };
    for (let i = 0; i < 3; i++) branch(W * (0.3 + 0.2 * i), H, (R.next() - 0.5) * 0.5, H * 0.34, 3.2, 0);
  },
};
export function tuftMeshes(tufts, P) {
  const out = [];
  [0, 1].forEach((kind) => {
    const list = thinDecor(tufts.filter((t) => t.k === kind));
    if (!list.length) return;
    const texKind = P.tex[kind];
    const map = makeCanvasTexture(64, 64, (c, W, H) => TUFT_DRAW[texKind](c, W, H, new RNG(0x7f1 + kind * 31)));
    const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = instanced(crossQuadGeo(), mat, list, (t, p, e, s) => { p.set(t.x, t.y, t.z); e.set(0, t.ry, 0, 'YXZ'); s.set(t.w, t.h, t.w); }, (t) => t.c);
    if (mesh) { mesh.name = 'ol-tufts' + kind; out.push(mesh); }
  });
  return out;
}

// ------------------------------------------------------------------ snags + stumps
export function woodMeshes(snags, stumps) {
  const out = [];
  if (snags.length) {
    const R = new RNG(0x51a9), b = new Bag();
    b.cyl(0, 2.3, 0, 0.09, 0.3, 4.6, 0xffffff, 5);
    b.cyl(0, 0.16, 0, 0.42, 0.34, 0.34, 0xd8d0c8, 5);   // root flare
    for (let i = 0; i < 5; i++) {   // limbs: tilted out from the trunk, each with a twig fork
      const y0 = 1.7 + i * 0.6 + R.float(0, 0.3), ph = i * 2.4 + R.float(0, 1), tilt = R.float(0.7, 1.25), len = R.float(1.0, 2.1) * (1.15 - i * 0.12);
      const d = [Math.sin(tilt) * Math.cos(ph), Math.cos(tilt), Math.sin(tilt) * Math.sin(ph)], [rx, ry, rz] = eulerFor(...d);
      const r0 = 0.085 - i * 0.008;
      b.cyl(d[0] * len / 2, y0 + d[1] * len / 2, d[2] * len / 2, 0.02, r0, len, i % 2 ? 0xe4dcd4 : 0xf4f0ec, 4, rx, rz, ry);
      const t2 = tilt + R.float(0.5, 0.9), ph2 = ph + R.sign() * R.float(0.6, 1.1), l2 = len * 0.55;
      const d2 = [Math.sin(t2) * Math.cos(ph2), Math.cos(t2), Math.sin(t2) * Math.sin(ph2)], [rx2, ry2, rz2] = eulerFor(...d2);
      const bx = d[0] * len * 0.85, by = y0 + d[1] * len * 0.85, bz = d[2] * len * 0.85;
      b.cyl(bx + d2[0] * l2 / 2, by + d2[1] * l2 / 2, bz + d2[2] * l2 / 2, 0.012, 0.038, l2, 0xece6e0, 4, rx2, rz2, ry2);
    }
    b.geo(new THREE.ConeGeometry(0.1, 0.7, 4), 0.02, 4.85, 0, 1, 1, 1, 0xd8d0c8);   // splintered top
    const geo = b.build();
    const mesh = instanced(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), thinDecor(snags), (s, p, e, sc) => { p.set(s.x, s.y, s.z); e.set(s.rx, s.ry, s.rz, 'YXZ'); sc.set(s.s, s.s * (0.9 + 0.2 * hash3(s.x, 0, s.z)), s.s); }, (s) => s.c);
    if (mesh) { mesh.name = 'ol-snags'; out.push(mesh); }
  }
  if (stumps.length) {
    const b = new Bag();
    b.cyl(0, 0.26, 0, 0.27, 0.4, 0.52, 0xffffff, 7);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; b.geo(new THREE.ConeGeometry(0.12, 0.6, 4), Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.42, 1, 1, 1, 0xe0d8d0, 0, 0, 0); }
    b.cyl(0, 0.53, 0, 0.26, 0.26, 0.03, 0xffe8c0, 7);   // pale cut face
    const mesh = instanced(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), thinDecor(stumps), (s, p, e, sc) => { p.set(s.x, s.y, s.z); e.set(0, s.ry, 0, 'YXZ'); sc.set(s.s, s.s, s.s); }, (s) => s.c);
    if (mesh) { mesh.name = 'ol-stumps'; out.push(mesh); }
  }
  return out;
}

// ------------------------------------------------------------------ points of interest
const TORUS = new THREE.TorusGeometry(0.42, 0.17, 5, 9);
const ARCH = new THREE.TorusGeometry(0.75, 0.07, 5, 8, Math.PI);
const CONE4 = new THREE.ConeGeometry(0.5, 1, 4);
const rot2 = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
/** each builder places parts around the POI centre with the local frame rotated by yaw; g(x, z) = ground height */
const POI_BUILD = {
  tires(p, { solid, g, R }) {
    const part = (lx, lz, y, o) => { const [dx, dz] = rot2(lx, lz, p.yaw), x = p.x + dx, z = p.z + dz; return [x, g(x, z) + y, z]; };
    for (let i = 0; i < 3; i++) { const [x, y, z] = part(0, 0, 0.17 + i * 0.34); solid.geo(TORUS, x, y, z, 1, 1, 1.05, i === 1 ? 0x2c2c30 : 0x1c1c20, Math.PI / 2, R.float(0, TAU), 0); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + R.float(-0.2, 0.2), [x, y, z] = part(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.17); solid.geo(TORUS, x, y, z, 1, 1, 1.05, i % 2 ? 0x24242a : 0x1a1a1e, Math.PI / 2, R.float(0, TAU), 0); }
    for (let i = 0; i < 2; i++) { const a = R.float(0, TAU), d = R.float(1.4, 2.2), [x, y, z] = part(Math.cos(a) * d, Math.sin(a) * d, 0.59); solid.geo(TORUS, x, y, z, 1, 1, 1.05, 0x202024, R.float(0.08, 0.3), R.float(0, TAU), 0); }   // tyres standing on their edge
    { const [x, y, z] = part(1.7, -1.2, 0.17); solid.geo(TORUS, x, y, z, 1, 1, 1.05, 0x1c1c20, Math.PI / 2, 0, 0); solid.cyl(x, y, z, 0.3, 0.3, 0.05, 0x8a8a8e, 8); }   // a tyre that still has its rim
  },
  crates(p, { solid, glow, g, R }) {
    const part = (lx, lz, y) => { const [dx, dz] = rot2(lx, lz, p.yaw), x = p.x + dx, z = p.z + dz; return [x, g(x, z) + y, z]; };
    const CR = [0xa8894a, 0x6a7078, 0x8a7440];
    const crate = (lx, lz, y, s, yaw, tilt = 0, c = R.pick(CR)) => {
      const [x, yy, z] = part(lx, lz, y);
      solid.box(x, yy, z, s, s * 0.85, s * 1.15, c, p.yaw + yaw, 0, tilt);
      solid.box(x, yy, z, s * 1.02, s * 0.14, s * 1.17, 0x30302c, p.yaw + yaw, 0, tilt);   // strap band
      return [x, yy, z];
    };
    crate(-0.6, 0, 0.44, 0.95, 0.1); crate(0.6, 0.1, 0.44, 0.95, -0.12); crate(0, 0.05, 1.3, 0.9, 0.5);
    crate(1.9, -0.9, 0.4, 0.9, 1.1, 0.5); crate(-1.6, 1.4, 0.3, 0.8, -0.6, 1.2);
    { const [x, y, z] = part(0.2, 1.6, 0.05); solid.box(x, y, z, 1.0, 0.08, 1.1, 0xb4934e, p.yaw + 0.7, 0.1, 0.15); }   // a lid
    for (let i = 0; i < 4; i++) { const [x, y, z] = part(R.float(-2, 2), R.float(0.9, 2.3), 0.13); solid.box(x, y, z, 0.32, 0.26, 0.4, 0xd8d4c8, R.float(0, TAU)); solid.box(x, y + 0.02, z, 0.34, 0.06, 0.14, 0xc83a2a, R.float(0, TAU)); }   // parcels with a red band
    const top = part(0, 0.05, 1.82); glow.box(top[0], top[1], top[2], 0.14, 0.14, 0.14, 0xff3a1a, 0);   // the tracker nobody switched off
    solid.box(top[0], top[1] - 0.08, top[2], 0.3, 0.06, 0.3, 0x2a2a2c, 0);
  },
  monitors(p, { solid, glow, g, R }) {
    const part = (lx, lz, y) => { const [dx, dz] = rot2(lx, lz, p.yaw), x = p.x + dx, z = p.z + dz; return [x, g(x, z) + y, z]; };
    const SCR = [0x9fd8d0, 0x14141c, 0xe8e8ec, 0x2ac0a0, 0x58587a, 0x14141c];
    const facing = Math.atan2(-p.x, -p.z);   // yaw of a monitor whose screen looks at the ship
    const mon = (lx, lz, y, yaw, tiltX, tiltZ, scr) => {
      const [x, yy, z] = part(lx, lz, y), cy = Math.cos(yaw), sy = Math.sin(yaw);
      solid.box(x, yy, z, 0.62, 0.52, 0.5, 0xc4bca4, yaw, tiltX, tiltZ);
      solid.box(x - sy * 0.36, yy, z - cy * 0.36, 0.4, 0.36, 0.34, 0xb4ac94, yaw, tiltX, tiltZ);   // the tube behind the face
      solid.box(x + sy * 0.26, yy, z + cy * 0.26, 0.54, 0.44, 0.03, 0x1c1c20, yaw, tiltX, tiltZ);   // bezel
      glow.box(x + sy * 0.275, yy, z + cy * 0.275, 0.44, 0.34, 0.02, scr, yaw, tiltX, tiltZ);
    };
    mon(0, 0, 0.26, R.float(0, TAU), 0, 0, SCR[0]); mon(0.7, 0.3, 0.26, R.float(0, TAU), 0, 0.15, SCR[2]); mon(-0.6, 0.5, 0.26, R.float(0, TAU), 0, -0.1, SCR[1]);
    mon(0.1, 0.15, 0.78, R.float(0, TAU), 0.1, 0, SCR[3]); mon(-1.5, -0.9, 0.26, R.float(0, TAU), 0.5, 0, SCR[4]);
    mon(1.8, -0.7, 0.32, R.float(0, TAU), 0, 0.7, SCR[5]); mon(-0.2, -1.6, 0.26, R.float(0, TAU), 0, 0, SCR[0]);
    mon(-0.9, 1.9, 0.26, facing, 0, 0, 0xff2a2a);   // the one that is still watching: it faces the ship
    { const [x, y, z] = part(1.4, 1.5, 0.04); solid.box(x, y, z, 0.62, 0.05, 0.2, 0xc4bca4, R.float(0, TAU)); }   // keyboard
    for (let i = 0; i < 3; i++) {   // cables snaking between them
      let [x, y, z] = part(R.float(-1, 1), R.float(-1, 1), 0.05), a = R.float(0, TAU);
      for (let s = 0; s < 4; s++) { const nx = x + Math.cos(a) * 0.7, nz = z + Math.sin(a) * 0.7, ny = g(nx, nz) + 0.04; solid.cyl((x + nx) / 2, (y + ny) / 2, (z + nz) / 2, 0.025, 0.025, 0.72, 0x151515, 4, Math.PI / 2, 0, -a + Math.PI / 2); x = nx; y = ny; z = nz; a += R.float(-0.7, 0.7); }
    }
  },
  chairs(p, { solid, glow, g, R }) {
    const N = 7, RAD = 2.35;
    const at = (lx, lz) => { const [dx, dz] = rot2(lx, lz, p.yaw); return [p.x + dx, p.z + dz]; };
    const chair = (x, z, yaw, tip = 0, c = 0x3a4658) => {
      const y = g(x, z), cy = Math.cos(yaw), sy = Math.sin(yaw);
      const L = (fx, fy, fz) => [x + sy * fz + cy * fx, y + fy, z + cy * fz - sy * fx];   // local (right, up, forward)
      if (tip) { solid.box(x, y + 0.26, z, 0.5, 0.5, 0.5, c, yaw, 0, tip); solid.box(x + 0.32, y + 0.14, z, 0.07, 0.5, 0.5, 0x2c3440, yaw, 0, tip); return; }
      solid.box(...L(0, 0.5, 0), 0.5, 0.09, 0.5, c, yaw);
      solid.box(...L(0, 0.86, -0.24), 0.46, 0.55, 0.07, c, yaw, -0.12);
      solid.cyl(...L(0, 0.3, 0), 0.03, 0.03, 0.4, 0x6a6a70, 5);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + yaw; solid.box(x + Math.cos(a) * 0.19, y + 0.1, z + Math.sin(a) * 0.19, 0.38, 0.04, 0.05, 0x24242a, -a); solid.box(x + Math.cos(a) * 0.36, y + 0.04, z + Math.sin(a) * 0.36, 0.06, 0.06, 0.06, 0x101012, 0); }
      solid.box(...L(-0.27, 0.66, 0), 0.05, 0.05, 0.3, 0x24242a, yaw); solid.box(...L(0.27, 0.66, 0), 0.05, 0.05, 0.3, 0x24242a, yaw);
    };
    const tipped = R.int(0, N - 1), out = R.int(0, N - 1);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + R.float(-0.08, 0.08), d = RAD + (i === out ? 0.9 : R.float(-0.15, 0.15)), [x, z] = at(Math.cos(a) * d, Math.sin(a) * d);
      chair(x, z, Math.atan2(p.x - x, p.z - z) + (i === out ? 2.4 : R.float(-0.15, 0.15)), i === tipped && tipped !== out ? 1.45 : 0, i % 3 === 0 ? 0x2e6a70 : 0x3a4658);
    }
    { const [x, z] = at(0, 0), y = g(x, z); solid.box(x, y + 0.02, z, 0.5, 0.02, 0.36, 0xe8e2d0, R.float(0, TAU)); solid.cyl(x + 0.3, y + 0.08, z + 0.1, 0.05, 0.045, 0.14, 0xe8e8e8, 6); }   // the agenda + a mug
    { const [x, z] = at(0.2, -1.05), y = g(x, z), yw = p.yaw + 0.3;   // whiteboard on an easel
      solid.box(x, y + 1.2, z, 1.25, 0.85, 0.04, 0xe8e8e2, yw); solid.box(x, y + 1.2, z, 1.31, 0.91, 0.03, 0x50545a, yw);
      solid.box(x - 0.55 * Math.cos(yw), y + 0.55, z + 0.55 * Math.sin(yw), 0.05, 1.1, 0.05, 0x50545a, yw, 0.1, 0); solid.box(x + 0.55 * Math.cos(yw), y + 0.55, z - 0.55 * Math.sin(yw), 0.05, 1.1, 0.05, 0x50545a, yw, 0.1, 0);
      const cs = Math.cos(yw), sn = Math.sin(yw), W = (lx, ly, w, hh, c) => glow.box(x + sn * 0.03 + cs * lx, y + 1.2 + ly, z + cs * 0.03 - sn * lx, w, hh, 0.012, c, yw);
      W(-0.3, 0.2, 0.35, 0.05, 0x22222a); W(-0.25, 0.08, 0.5, 0.05, 0x22222a); W(0.3, -0.15, 0.32, 0.32, 0xc83a2a); W(-0.3, -0.1, 0.4, 0.04, 0x22222a); }
  },
  cables(p, { solid, glow, g, R }) {
    const part = (lx, lz, y) => { const [dx, dz] = rot2(lx, lz, p.yaw), x = p.x + dx, z = p.z + dz; return [x, g(x, z) + y, z]; };
    const CAB = [0x161618, 0x1c2620, 0x2a1c30, 0x30302a];
    { const [x, y, z] = part(0, 0, 0.35); solid.box(x, y, z, 1.2, 0.72, 0.9, 0x5a5e62, p.yaw); solid.box(x, y + 0.2, z + 0.0, 1.24, 0.14, 0.94, 0xd8a820, p.yaw); solid.box(x, y + 0.42, z, 1.3, 0.1, 1.0, 0x3a3e42, p.yaw);
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      for (let i = 0; i < 3; i++) glow.box(x + s * 0.46 + c * (i - 1) * 0.3, y - 0.04, z + c * 0.46 - s * (i - 1) * 0.3, 0.16, 0.16, 0.04, i === 1 ? 0xff2bd6 : 0x2af4ff, p.yaw); }
    for (let i = 0; i < 4; i++) {   // thick cables out of the box, sagging, disappearing into the ground
      const a = p.yaw + (i / 4) * TAU + R.float(-0.3, 0.3), len = R.float(3.4, 5.6), col = CAB[i % 4];
      let [x, y, z] = part(0, 0, 0.5);
      x += Math.cos(a) * 0.6; z += Math.sin(a) * 0.6;
      const n = 7;
      for (let s = 1; s <= n; s++) {
        const f = s / n, nx = x + Math.cos(a) * (len / n), nz = z + Math.sin(a) * (len / n), ny = g(nx, nz) + (s === n ? -0.25 : 0.1 + 0.32 * Math.sin(f * Math.PI));
        const dx = nx - x, dy = ny - y, dz = nz - z, L = Math.hypot(dx, dy, dz) || 1, [rx, ry, rz] = eulerFor(dx, dy, dz);
        solid.cyl((x + nx) / 2, (y + ny) / 2, (z + nz) / 2, 0.075, 0.075, L, col, 5, rx, rz, ry);
        x = nx; y = ny; z = nz;
      }
      glow.box(x, y + 0.2, z, 0.1, 0.1, 0.1, i % 2 ? 0x2af4ff : 0xff2bd6, 0);
    }
    for (let i = 0; i < 2; i++) { const a = R.float(0, TAU), d = R.float(1.9, 2.8), [x, y, z] = part(Math.cos(a) * d, Math.sin(a) * d, -0.05); solid.geo(ARCH, x, y, z, 1, 1, 1, CAB[(i + 1) % 4], 0, R.float(0, TAU), 0); }
  },
};
export function poiMeshes(pois, g, seed) {
  if (!pois.length) return [];
  const solid = new Bag(), glow = new Bag();
  for (const p of pois) { const R = new RNG(((seed | 0) ^ Math.imul(Math.round(p.x * 13 + p.z * 7), 2654435761)) >>> 0); try { POI_BUILD[p.kind]?.(p, { solid, glow, g, R }); } catch (e) { console.warn('[outlife10] poi', p.kind, e); } }
  const out = [];
  const gs = solid.build(), gg = glow.build();
  if (gs) { const m = new THREE.Mesh(gs, new THREE.MeshLambertMaterial({ vertexColors: true })); m.name = 'ol-poi'; m.frustumCulled = false; out.push(m); }
  if (gg) { const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true })); m.name = 'ol-poi-glow'; m.frustumCulled = false; out.push(m); }
  return out;
}

// ------------------------------------------------------------------ fog pools
export const FOG_LAYERS = [[0.15, 1], [0.55, 0.82], [0.95, 0.62]];   // [dy above the pool, radius factor]
export function fogMesh(pools) {
  if (!pools.length) return null;
  const map = makeCanvasTexture(64, 64, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.55, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
  if (map) { map.minFilter = map.magFilter = THREE.LinearFilter; map.generateMipmaps = false; }
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.5, depthWrite: false, color: 0xffffff });
  const list = [];
  pools.forEach((p, i) => FOG_LAYERS.forEach((L, j) => list.push({ pool: p, i, j, L })));
  const mesh = instanced(geo, mat, list, (it, p, e, s) => { p.set(it.pool.x, it.pool.y + it.L[0], it.pool.z); e.set(0, it.pool.ry + it.j, 0, 'YXZ'); s.setScalar(it.pool.r * 2 * it.L[1]); }, null);
  mesh.name = 'ol-fog'; mesh.renderOrder = 2;
  mesh.userData.list = list;
  return mesh;
}
/** slow drift of the pools (call at ~10 Hz) */
export function driftFog(mesh, t) {
  const list = mesh.userData.list;
  for (let n = 0; n < list.length; n++) {
    const it = list[n], p = it.pool, k = t * 0.05 + it.i * 1.7 + it.j * 0.9;
    _p.set(p.x + Math.sin(k) * p.r * 0.14, p.y + it.L[0], p.z + Math.cos(k * 0.8) * p.r * 0.14);
    _e.set(0, p.ry + it.j + t * 0.01 * (it.j + 1), 0, 'YXZ'); _q.setFromEuler(_e); _s.setScalar(p.r * 2 * it.L[1] * (1 + Math.sin(k * 1.3) * 0.06));
    _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ horizon
let _units = null;
const units = () => _units || (_units = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: (seg) => new THREE.ConeGeometry(0.5, 1, seg || 5),
  cyl: (seg) => new THREE.CylinderGeometry(0.5, 0.5, 1, seg || 6),
  frust: (seg) => new THREE.CylinderGeometry(0.3, 0.5, 1, seg || 8),
  dome: () => new THREE.SphereGeometry(0.5, 8, 4, 0, TAU, 0, Math.PI / 2).translate(0, -0.25, 0),
  ring: () => new THREE.TorusGeometry(0.5, 0.04, 4, 22),
});
export function skylineGeometry(shapes) {
  const cache = new Map(), parts = [];
  for (const s of shapes) {
    const key = s.t + '|' + (s.seg || 0);
    let base = cache.get(key);
    if (!base) { const u = units()[s.t]; base = typeof u === 'function' ? u(s.seg) : u; base = (base.index ? base.toNonIndexed() : base.clone()); base.deleteAttribute('uv'); base.deleteAttribute('normal'); cache.set(key, base); }
    const g = base.clone();
    _e.set(s.rx || 0, s.ry || 0, s.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(s.sx, s.t === 'dome' ? s.sy * 2 : s.sy, s.sz));
    g.applyMatrix4(_m);
    parts.push(g);
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  for (const g of cache.values()) g.dispose();
  return geo;
}
export function skylineMeshes(spec) {
  const out = [];
  const geo = skylineGeometry(spec.shapes);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a3a3a, fog: false, side: THREE.DoubleSide }));
  mesh.name = 'ol-skyline'; mesh.frustumCulled = false; mesh.renderOrder = -2; mesh.matrixAutoUpdate = false;
  out.push(mesh);
  if (spec.beacons.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(spec.beacons.flat(), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff2a1a, size: 3.4, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    pts.name = 'ol-beacons'; pts.frustumCulled = false; pts.renderOrder = -1;
    out.push(pts);
  }
  return out;
}
