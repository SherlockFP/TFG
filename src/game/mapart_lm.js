// MAPART landmarks (wave 6): ONE big recognisable structure per biome family + the horizon skyline ring.
//   monolith  giant server-monolith field (datascape / neon / crystal / dark forest)     datafall  frozen data waterfall (ice / cold vault / soviet)
//   crane     rust city-skeleton crane + gutted tower (ash / lava / rust / desert)         fungal    fungal cable forest (jungle / marsh / acid / estate)
//   dish      radio dish array pointed at the sky (hills / moor / bone / anything else)
// Geometry goes into the caller's merged bags (solid = Lambert vertex colours, glow = unlit); colliders through col().
import * as THREE from 'three';
import { RNG } from '../core/rng.js';

const TAU = Math.PI * 2;
const SPHERE_CAP = new THREE.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2);
const TORUS = new THREE.TorusGeometry(1, 0.06, 5, 10, Math.PI);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const DISH = new THREE.SphereGeometry(1, 10, 5, 0, TAU, Math.PI - 0.8, 0.8);   // concave dish: the bottom cap of a sphere, opening up

export function buildLandmark(s, ctx) {
  const B = BUILD[s.fam] || BUILD.dish;
  B(s, ctx);
  return { fam: s.fam };
}

const BUILD = {
  monolith(s, { h, solid, glow, col, accent, R }) {
    const n = 11 + R.int(0, 4);
    for (let i = 0; i < n; i++) {
      const a = R.float(0, TAU), d = Math.sqrt(R.float(0, 1)) * s.r * 0.85;
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, g = h(x, z);
      const w = R.float(2, 3.6), dp = R.float(1.2, 2), H = i < 2 ? R.float(22, 27) : R.float(6, 19), yaw = R.float(0, TAU);
      solid.box(x, g + H / 2 - 0.8, z, w, H + 1.6, dp, 0x15131f, yaw);
      for (let k = 0; k < 3; k++) glow.box(x, g + H * (0.2 + 0.26 * k) + R.float(-0.3, 0.3), z, w + 0.1, 0.26, dp + 0.1, (i + k) % 3 === 0 ? 0xff2bd6 : accent, yaw);
      glow.box(x, g + H + 0.05, z, w * 0.6, 0.12, dp * 0.6, accent, yaw);   // status lamp on top
      col(x, g + H / 2, z, w, H, dp, yaw, { kind: 'prop' });
    }
  },
  datafall(s, { solid, glow, col, accent, R }) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), g = s.y;
    const P = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    const W = 18, H = 10.5, D = 5;
    solid.box(s.x, g + H / 2 - 0.6, s.z, W, H + 1.2, D, 0x6f8ca6, s.yaw);
    col(P(0, 0)[0], g + H / 2, P(0, 0)[1], W, H, D, s.yaw, { kind: 'prop' });
    for (const [lx, lz, w, hh] of [[-10, 0.6, 4, 6.5], [10.5, -0.4, 3.6, 4.4], [-13.4, 1.2, 3, 2.6]]) { const [x, z] = P(lx, lz); solid.box(x, g + hh / 2 - 0.5, z, w, hh + 1, D - 0.6, 0x8aa8c0, s.yaw); col(x, g + hh / 2, z, w, hh, D - 0.6, s.yaw, { kind: 'prop' }); }
    for (let i = 0; i < 17; i++) {
      const lx = -8.2 + i * 0.97, len = R.float(4.5, 10.2), [x, z] = P(lx, D / 2 + 0.2);
      glow.box(x, g + H - len / 2, z, 0.5, len, 0.24, i % 3 === 0 ? 0xf4fcff : i % 3 === 1 ? accent : 0x86e4ff, s.yaw);
    }
    for (let i = 0; i < 34; i++) { const [x, z] = P(R.float(-8.4, 8.4), D / 2 + R.float(0.5, 1.4)); glow.box(x, g + R.float(0.4, H - 1), z, 0.3, 0.3, 0.3, i % 4 === 0 ? 0xff2bd6 : 0xf4fcff, R.float(0, TAU)); }
    { const [x, z] = P(0, D / 2 + 5); glow.cyl(x, g + 0.08, z, 6, 6, 0.12, 0x2a90c0, 12); }
    for (let i = 0; i < 9; i++) { const [x, z] = P(R.float(-9, 9), D / 2 + R.float(3, 9.5)); solid.geo(CONE4, x, g + 0.9, z, 0.5, R.float(1.2, 2.6), 0.5, 0xbfe4f4, 0, R.float(0, TAU), 0); }
  },
  crane(s, { h, solid, glow, col, R }) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), g = s.y - 0.4, Ht = 27, RUST = 0x7a4a30, RUST2 = 0x9a5a34;
    const P = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    for (const [ax, az] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]]) { const [x, z] = P(ax, az); solid.box(x, g + Ht / 2, z, 0.36, Ht, 0.36, RUST, s.yaw); }
    const th = Math.atan2(4.5, 2.6);
    for (let j = 0; j < 6; j++) {
      const y0 = g + j * 4.5;
      for (const sgn of [1, -1]) {
        { const [x, z] = P(0, 1.3 * sgn); solid.box(x, y0 + 2.25, z, 5.2, 0.14, 0.14, RUST2, s.yaw, 0, sgn * th); }
        { const [x, z] = P(1.3 * sgn, 0); solid.box(x, y0 + 2.25, z, 0.14, 0.14, 5.2, RUST2, s.yaw, sgn * th, 0); }
      }
      for (const sgn of [1, -1]) { { const [x, z] = P(0, 1.3 * sgn); solid.box(x, y0, z, 2.9, 0.16, 0.16, RUST, s.yaw); } { const [x, z] = P(1.3 * sgn, 0); solid.box(x, y0, z, 0.16, 0.16, 2.9, RUST, s.yaw); } }
    }
    { const [x, z] = P(5, 0); solid.box(x, g + Ht + 1.2, z, 30, 0.7, 0.7, RUST2, s.yaw); }
    { const [x, z] = P(-9, 0); solid.box(x, g + Ht + 0.9, z, 4, 0.5, 0.5, RUST, s.yaw); solid.box(x, g + Ht - 0.4, z, 3, 2.2, 2.4, 0x5a5a60, s.yaw); }
    { const [x, z] = P(0.6, 0); solid.box(x, g + Ht + 1.9, z, 2.2, 2, 2.2, 0xd88030, s.yaw); glow.box(x + sn * 1.12, g + Ht + 2.1, z + c * 1.12, 1.4, 0.8, 0.05, 0xfff2b0, s.yaw); }
    { const [x, z] = P(15.5, 0); solid.cyl(x, g + Ht - 5, z, 0.05, 0.05, 12.4, 0x2a2a2a, 4); solid.box(x, g + Ht - 12.6, z, 6, 2.4, 2.4, 0x8a2a20, s.yaw); solid.box(x, g + Ht - 11.2, z, 6.1, 0.3, 2.5, 0x5a1a14, s.yaw); }
    { const [x, z] = P(19.6, 0); glow.geo(new THREE.SphereGeometry(0.3, 5, 4), x, g + Ht + 1.6, z, 1, 1, 1, 0xff2a2a); }
    col(s.x, g + Ht / 2, s.z, 3, Ht, 3, s.yaw, { kind: 'prop' });
    // gutted tower next to it: columns, floor plates, rebar
    const [bx, bz] = P(-8, -6.5), bg = h(bx, bz) - 0.4;
    for (const [ax, az] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) { const [x, z] = [bx + ax, bz + az]; solid.box(x, bg + 5.5, z, 0.7, 11, 0.7, 0x5a5a5e); }
    col(bx, bg + 5.5, bz, 7, 11, 7, 0, { kind: 'prop' });
    for (let f = 1; f <= 3; f++) for (let q = 0; q < 4; q++) if (R.chance(0.72)) { const ax = q % 2 ? 1.6 : -1.6, az = q < 2 ? -1.6 : 1.6; solid.box(bx + ax, bg + f * 3.2, bz + az, 3.2, 0.3, 3.2, 0x4a4a4e); }
    for (let k = 0; k < 8; k++) solid.box(bx + R.float(-3, 3), bg + 11.6, bz + R.float(-3, 3), 0.06, 1.6, 0.06, 0x8a4a2a, 0, R.float(-0.3, 0.3), R.float(-0.3, 0.3));
  },
  fungal(s, { h, solid, glow, col, accent, R }) {
    const CABLE = [0x1f2a24, 0x2a1a30, 0x24301c];
    for (let i = 0; i < 8; i++) {
      const a = R.float(0, TAU), d = Math.sqrt(R.float(0, 1)) * s.r * 0.75, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      const ar = R.float(3.4, 7), yaw = R.float(0, TAU), g = h(x, z);
      solid.geo(TORUS, x, g - 0.3, z, ar, ar, ar * (i % 2 ? 1.5 : 1), CABLE[i % 3], 0, yaw, 0);
      for (const sgn of [-1, 1]) glow.box(x + Math.cos(yaw) * ar * sgn, g + 0.2, z - Math.sin(yaw) * ar * sgn, 0.5, 0.4, 0.5, i % 2 ? 0x5aff9a : 0xc060ff);
      for (let k = 1; k <= 3; k++) { const th = (Math.PI * k) / 4; glow.geo(new THREE.SphereGeometry(0.2, 5, 4), x + Math.cos(th) * ar * Math.cos(yaw), g - 0.3 + Math.sin(th) * ar, z - Math.cos(th) * ar * Math.sin(yaw), 1, 1, 1, k === 2 ? 0xfff2b0 : 0x5aff9a); }
    }
    const CAPS = [0x5aff9a, 0xc060ff, 0xff70c0, accent];
    for (let i = 0; i < 13; i++) {
      const a = R.float(0, TAU), d = Math.sqrt(R.float(0, 1)) * s.r, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, g = h(x, z);
      const cr = R.float(0.9, 2.5), sh = R.float(1.4, 4.2);
      solid.cyl(x, g + sh / 2 - 0.2, z, cr * 0.16, cr * 0.24, sh, 0xb8a8c8, 6);
      glow.geo(SPHERE_CAP, x, g + sh - 0.3, z, cr, cr * 0.65, cr, CAPS[i % 4]);
      solid.geo(SPHERE_CAP, x, g + sh - 0.55, z, cr * 0.9, cr * 0.4, cr * 0.9, 0x2a2030, Math.PI);
      if (cr > 1.8) col(x, g + sh / 2, z, cr * 0.5, sh, cr * 0.5, 0, { kind: 'prop' });
    }
    for (let i = 0; i < 9; i++) {
      const a = R.float(0, TAU), d = R.float(0, s.r * 1.1), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      solid.cyl(x, h(x, z) + 0.12, z, 0.13, 0.13, R.float(5, 10), CABLE[i % 3], 5, 0, Math.PI / 2, R.float(0, TAU));
    }
  },
  dish(s, { h, solid, glow, col, accent, R }) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (let i = 0; i < 3; i++) {
      const a = s.yaw + (i * TAU) / 3, x = s.x + Math.cos(a) * 6.5, z = s.z + Math.sin(a) * 6.5, g = h(x, z) - 0.3, dr = R.float(3.2, 4.4), st = R.float(4.4, 6);
      const tilt = R.float(0.55, 1.05), ry = s.yaw + R.float(-0.4, 0.4), ax = Math.sin(tilt) * Math.sin(ry), ay = Math.cos(tilt), az = Math.sin(tilt) * Math.cos(ry), top = g + st;
      solid.box(x, g + 0.3, z, 2.2, 0.6, 2.2, 0x4a4a52);
      solid.cyl(x, g + st / 2, z, 0.22, 0.4, st, 0x8a8e96, 7);
      solid.geo(DISH, x + dr * ax, top + dr * ay, z + dr * az, dr, dr, dr, 0xc8ccd0, tilt, ry, 0);
      solid.cyl(x + dr * 0.3 * ax, top + dr * 0.3 * ay, z + dr * 0.3 * az, 0.06, 0.06, dr * 0.6, 0x3a3a44, 4, tilt, 0, ry);
      glow.geo(new THREE.SphereGeometry(0.22, 5, 4), x + dr * 0.6 * ax, top + dr * 0.6 * ay, z + dr * 0.6 * az, 1, 1, 1, i === 0 ? 0xff2a2a : accent);
      col(x, g + st / 2, z, 0.9, st, 0.9, 0, { kind: 'prop' });
    }
    { const x = s.x - c * 2.5, z = s.z + sn * 2.5, g = h(x, z) - 0.3;
      solid.box(x, g + 1.2, z, 3.4, 2.4, 2.4, 0xd8d4c8, s.yaw); glow.box(x + sn * 1.22, g + 1.4, z + c * 1.22, 1.4, 0.8, 0.05, 0xfff2b0, s.yaw);
      solid.cyl(x, g + 8, z + 3, 0.12, 0.2, 16, 0x5a5a62, 5); glow.geo(new THREE.SphereGeometry(0.3, 5, 4), x, g + 16.2, z + 3, 1, 1, 1, 0xff2a2a);
      col(x, g + 1.2, z, 3.4, 2.4, 2.4, s.yaw, { kind: 'prop' }); }
  },
};
// ------------------------------------------------------------------ horizon silhouettes
/** One merged mesh ring of skyline shapes (unlit, fog-less); its colour follows the fog every frame (mesh.userData.tint = 0..1 darkening). */
export function buildHorizon(fam, seed, sc = 1) {
  const R = new RNG((seed ^ 0x40217) >>> 0);
  const list = [];
  const Rr = 175 * sc + 45, N = 64;
  const put = (geo, x, y, z, sx, sy, sz, ry = 0) => {
    const g = geo.clone(); g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m); list.push(g);
  };
  const BX = new THREE.BoxGeometry(1, 1, 1), CN = new THREE.ConeGeometry(1, 1, 5), CY = new THREE.CylinderGeometry(1, 1, 1, 7), DM = new THREE.SphereGeometry(1, 7, 4, 0, TAU, 0, Math.PI / 2);
  for (let i = 0; i < 90; i++) {   // low ridge so the skyline is never empty
    const a = (i / 90) * TAU, w = R.float(22, 40);
    put(BX, Math.cos(a) * (Rr + 8), -4 + R.float(2, 8), Math.sin(a) * (Rr + 8), w, R.float(8, 22), 16, -a + Math.PI / 2);
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + R.float(-0.03, 0.03), x = Math.cos(a) * Rr, z = Math.sin(a) * Rr, ry = -a + Math.PI / 2;
    switch (fam) {
      case 'monolith': { const w = R.float(6, 14), H = R.float(20, 66); put(BX, x, -4 + H / 2, z, w, H, 6, ry); if (R.chance(0.5)) put(BX, x + Math.cos(a + 1.57) * w, -4 + H * 0.3, z + Math.sin(a + 1.57) * w, w * 0.7, H * 0.6, 5, ry); break; }
      case 'datafall': { const w = R.float(8, 20), H = R.float(22, 64); put(CN, x, -4 + H / 2, z, w, H, w, 0); if (R.chance(0.5)) put(CN, x + 9, -4 + H * 0.3, z + 4, w * 0.6, H * 0.6, w * 0.6, 0); break; }
      case 'crane': { if (R.chance(0.55)) { const H = R.float(38, 58); put(BX, x, -4 + H / 2, z, 3, H, 3, ry); put(BX, x + Math.cos(a + 1.57) * 8, -4 + H, z + Math.sin(a + 1.57) * 8, 30, 2.2, 2.2, ry); } else { const H = R.float(24, 42), r = R.float(3, 5); put(CY, x, -4 + H / 2, z, r, H, r, 0); put(BX, x + 12, -4 + 6, z, 22, 12, 12, ry); } break; }
      case 'fungal': { const r = R.float(10, 24); put(CY, x, -4 + r * 0.35, z, r * 0.22, r * 0.7, r * 0.22, 0); put(DM, x, -4 + r * 0.7, z, r, r * 0.6, r, 0); break; }
      default: { if (R.chance(0.45)) { const H = R.float(26, 48); put(CY, x, -4 + H / 2, z, 0.9, H, 0.9, 0); put(DM, x, -4 + H, z, 9, 4, 9, 0); } else put(CN, x, -4 + 12, z, R.float(24, 40), R.float(22, 34), R.float(24, 40), 0); }
    }
  }
  const geo = mergeAll(list);
  const mat = new THREE.MeshBasicMaterial({ color: 0x222222, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ma-horizon'; mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.matrixAutoUpdate = false;
  return mesh;
}

function mergeAll(list) {
  let n = 0;
  const parts = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const g of list) g.dispose();
  for (const g of parts) if (!list.includes(g)) g.dispose();
  return out;
}
