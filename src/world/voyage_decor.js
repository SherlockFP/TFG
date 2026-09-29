// VOYAGE biome set dressing (wave 4): decor builders for the 8 voyage biomes, registered into the outdoor decor registry (outdoor_biomes.js).
// Same contract as the other decor builders: buildX(C) with C = { R, biome, terrain, addBox, avoid, emitters, sc, lim, h, spot, add, own, mat, updaters, scrapSpots }.
// Everything is merged into a few Kit meshes (per quadrant, so frustum culling still works), colliders are static boxes on the big pieces only,
// lights are light-pool emitters, and placement uses the decor's own seeded RNG (identical on every peer).
import * as THREE from 'three';
import { registerDecor } from './outdoor_biomes.js';
import { Kit } from './voyage_kit.js';

const TAU = Math.PI * 2;

/** 4 quadrant kits sharing one env; kit(x, z) picks the right one, finish() bakes all of them */
function quadKits(C) {
  const env = { add: (o) => C.add(o), own: (g) => C.own({ geometry: g }), mat: (m) => C.mat(m), addBox: C.addBox, emitters: C.emitters };
  const kits = [0, 1, 2, 3].map(() => new Kit(env, 0, 0, 0, 0));
  return { kit: (x, z) => kits[(x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)], finish: () => kits.forEach((k) => k.finish()), env };
}
const rc = (R, list) => list[R.int(0, list.length - 1)];
const scrapNear = (C, x, z, dx = 2.4) => { if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: x + dx, z }); };
/** scatter n things at free spots: fn(x, z, y, i) */
function scatter(C, n, margin, fn, test = null) {
  let placed = 0;
  for (let i = 0; i < n * 3 && placed < n; i++) {
    const p = C.spot(margin, 6, test);
    if (!p) continue;
    fn(p.x, p.z, C.h(p.x, p.z), placed++);
  }
  return placed;
}
const n2 = (C, base) => Math.round(base * C.sc * C.sc);

// ==================================================================================================== crystal desert
function buildCrystalDesert(C) {
  const { R } = C, Q = quadKits(C);
  const PASTEL = [0xf0a8d8, 0xb8a0f8, 0x98e0f0, 0xf8d0e8, 0xd0b0ff];
  scatter(C, n2(C, 70), 3, (x, z, y) => {
    const s = R.float(0.6, 2.6), col = rc(R, PASTEL), tilt = R.float(-0.18, 0.18);
    Q.kit(x, z).cone(x, y - 0.2, z, 0.55 * s, 3.4 * s, col, { seg: 5, ry: R.float(0, TAU), rz: tilt, solid: s > 1.5 });
    if (R.chance(0.25)) Q.kit(x, z).ico(x + 0.7 * s, y + 0.3, z, 0.25 * s, 0xffffff, { glow: true });
  });
  scatter(C, Math.round(5 * C.sc), 10, (x, z, y, i) => {
    const s = R.float(4, 6.5), col = PASTEL[i % PASTEL.length];
    Q.kit(x, z).cone(x, y - 0.4, z, 1.1 * s, 3.6 * s, col, { seg: 6, ry: R.float(0, TAU), solid: true });
    Q.kit(x, z).cone(x + 1.3 * s, y - 0.4, z + 0.6 * s, 0.6 * s, 2.2 * s, 0xffffff, { seg: 5, glow: true });
    Q.kit(x, z).light(x, y + 3.5, z, i % 2 ? 0xa8b0ff : 0xff90e0, 1.5, 24, 0.04);
    scrapNear(C, x, z, 1.1 * s + 1.8);
  });
  scatter(C, n2(C, 220), -6, (x, z, y) => Q.kit(x, z).cone(x, y - 0.05, z, R.float(0.08, 0.2), R.float(0.3, 0.8), 0xe8d8ff, { seg: 4, glow: true }), (x, z) => !C.avoid(x, z, -6));
  Q.finish();
}

// ==================================================================================================== fungal swamp
function buildFungalSwamp(C) {
  const { R } = C, Q = quadKits(C);
  const CAPS = [0x9a3ab0, 0x3ab0a0, 0xc04a78, 0x4a80e0, 0xb0c040];
  scatter(C, n2(C, 60), 3, (x, z, y, i) => {
    const s = R.float(0.7, 2.4), cap = rc(R, CAPS), K = Q.kit(x, z), big = s > 1.5;
    K.cyl(x, y - 0.2, z, 0.28 * s, 2.6 * s, 0xe4d8c4, { seg: 6, solid: big });
    K.cyl(x, y + 2.3 * s, z, 1.9 * s, 0.9 * s, cap, { seg: 8, rTop: 0.4 * s });
    K.cyl(x, y + 2.25 * s, z, 1.55 * s, 0.1, 0xffffff, { seg: 8, glow: true, rTop: 1.3 * s });   // glowing gills
    if (big && i % 6 === 0) { K.light(x, y + 2.6 * s, z, cap, 1.3, 18, 0.03); scrapNear(C, x, z, 1.6 * s + 1.5); }
  });
  scatter(C, n2(C, 240), -4, (x, z, y) => {
    const K = Q.kit(x, z), col = rc(R, CAPS), s = R.float(0.5, 1.2);
    K.cyl(x, y - 0.05, z, 0.05 * s, 0.4 * s, 0xe4d8c4, { seg: 4 }); K.cone(x, y + 0.35 * s, z, 0.22 * s, 0.2 * s, col, { seg: 5, glow: true });
  }, (x, z) => !C.avoid(x, z, -4));
  Q.finish();
}

// ==================================================================================================== sky shards (low gravity)
function buildSkyShards(C) {
  const { R, terrain } = C, Q = quadKits(C);
  // floating islands high above (visual)
  for (let i = 0; i < Math.round(22 * C.sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (Math.hypot(x, z) < 45) continue;
    const y = C.h(x, z) + R.float(22, 58), s = R.float(1.4, 4.2), K = Q.kit(x, z);
    K.cyl(x, y, z, 0.45 * s, 2.6 * s, 0x8a8c96, { seg: 7, rTop: 2.6 * s, ry: R.float(0, TAU) });
    K.cyl(x, y + 2.6 * s, z, 2.7 * s, 0.3, 0x7ab070, { seg: 7 });
    if (R.chance(0.5)) K.cone(x + s * 0.4, y + 2.9 * s, z, 0.5 * s, 1.6 * s, 0x4a7a4a, { seg: 5 });
  }
  // rock pillars on the ground
  scatter(C, n2(C, 42), 3, (x, z, y) => {
    const s = R.float(0.9, 2.6), K = Q.kit(x, z);
    K.cyl(x, y - 0.4, z, 1.0 * s, 4 * s * R.float(0.8, 1.6), 0x9096a4, { seg: 6, rTop: 0.6 * s, solid: true, ry: R.float(0, TAU) });
  });
  // stepping-stone staircases (low gravity jump ~2 m): chains of slabs rising 1.5 m each, ending on a loot platform
  const chains = Math.max(3, Math.round(5 * C.sc));
  for (let c = 0; c < chains; c++) {
    const p = C.spot(6, 20);
    if (!p) continue;
    const dir = R.float(0, TAU), turn = R.float(-0.35, 0.35), steps = R.int(5, 8);
    let x = p.x, z = p.z, a = dir, top = C.h(x, z);
    for (let k = 0; k < steps; k++) {
      x += Math.cos(a) * 3.3; z += Math.sin(a) * 3.3; a += turn;
      const y = top + 1.4 + k * 1.45;
      if (C.avoid(x, z, 1)) break;
      Q.kit(x, z).box(x, y, z, 2.8, 0.5, 2.8, k % 2 ? 0xa8a8b4 : 0x9a9aa8, { solid: true, ry: a });
      Q.kit(x, z).box(x, y - 1.8, z, 0.6, 1.8, 0.6, 0x767a88, {});
      if (k === steps - 1) {
        Q.kit(x, z).box(x, y, z, 5, 0.6, 5, 0xb8b8c4, { solid: true });
        Q.kit(x, z).box(x - 1.4, y + 0.6, z, 0.4, 1.6, 0.4, 0x50d0ff, { glow: true });
        (C.info.cache ||= []).push({ x, y: y + 0.7, z });   // loot the host spawns on top of the staircase (voyage.js)
      }
    }
  }
  scatter(C, n2(C, 160), -6, (x, z, y) => Q.kit(x, z).cone(x, y - 0.05, z, R.float(0.1, 0.25), R.float(0.3, 0.7), 0xffffff, { seg: 4, glow: true }), (x, z) => !C.avoid(x, z, -6));
  void terrain;
  Q.finish();
}

// ==================================================================================================== acid sea shore
function buildAcidShore(C) {
  const { R, terrain } = C, Q = quadKits(C);
  const fl = terrain.flood ?? -1.4;
  const geo = new THREE.PlaneGeometry(terrain.half * 2.2, terrain.half * 2.2);
  geo.rotateX(-Math.PI / 2);
  const mat = C.mat(new THREE.MeshBasicMaterial({ color: 0x98ff30, transparent: true, opacity: 0.72, depthWrite: false, fog: true }));
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = fl + 0.05;
  C.own({ geometry: geo });
  C.add(sea);
  const a = new THREE.Color(0x98ff30), b = new THREE.Color(0xd8ff50);
  C.updaters.push((dt, t) => { mat.color.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(t * 0.8)); });
  const dry = (x, z) => C.h(x, z) > fl + 0.7;
  scatter(C, n2(C, 90), 2, (x, z, y) => {
    const K = Q.kit(x, z), s = R.float(0.5, 1.6);
    K.cone(x, y - 0.1, z, 0.35 * s, 1.8 * s, 0xf4e050, { seg: 4, glow: true, rz: R.float(-0.3, 0.3), ry: R.float(0, TAU) });
  }, dry);
  scatter(C, n2(C, 60), 3, (x, z, y) => {
    const K = Q.kit(x, z), s = R.float(0.8, 2.2);
    K.box(x, y - 0.2, z, 1.6 * s, 1.1 * s, 1.3 * s, 0xd8d4b8, { solid: s > 1.2, ry: R.float(0, TAU) });
  }, dry);
  scatter(C, n2(C, 22), 3, (x, z, y) => {   // corroded poles with a hazard light
    const K = Q.kit(x, z);
    K.box(x, y - 0.1, z, 0.2, R.float(4, 8), 0.2, 0x6a6a44, { rz: R.float(-0.1, 0.1), solid: true }); K.box(x, y + 4, z, 0.4, 0.4, 0.4, 0xf4e050, { glow: true });
  }, dry);
  let barrels = 0;
  scatter(C, 10, 4, (x, z, y) => { Q.kit(x, z).cyl(x, y - 0.05, z, 0.5, 1.0, 0x8a9a30, { seg: 8, solid: true }); if (barrels++ < 2) scrapNear(C, x, z); }, dry);
  Q.finish();
}

// ==================================================================================================== storm plateau
function buildStormPlateau(C) {
  const { R } = C, Q = quadKits(C);
  scatter(C, n2(C, 50), 3, (x, z, y) => {
    const s = R.float(0.8, 1.8), h = R.float(4, 9.5);
    Q.kit(x, z).box(x, y - 0.4, z, 1.4 * s, h, 1.2 * s, R.chance(0.5) ? 0x767c86 : 0x666c76, { solid: true, ry: R.float(0, TAU), rz: R.float(-0.04, 0.04) });
  });
  let lit = 0;
  scatter(C, n2(C, 16), 4, (x, z, y) => {   // lightning rods
    const K = Q.kit(x, z);
    K.box(x, y - 0.1, z, 0.16, 13, 0.16, 0x8a8e96, { solid: true }); K.ico(x, y + 13.2, z, 0.3, 0xcfe0ff, { glow: true });
    if (lit++ < 4) { K.light(x, y + 13, z, 0xbcd0ff, 1.8, 26, 0.35); scrapNear(C, x, z, 2.0); }
  });
  scatter(C, n2(C, 30), -3, (x, z, y) => Q.kit(x, z).box(x, y - 0.1, z, R.float(0.5, 1.3), R.float(0.3, 0.8), R.float(0.5, 1.3), 0x585e68, { ry: R.float(0, TAU) }), (x, z) => !C.avoid(x, z, -3));
  Q.finish();
  let nextFlash = R.float(6, 14);
  C.updaters.push((dt, t, game) => {
    nextFlash -= dt;
    if (nextFlash > 0) return;
    nextFlash = 7 + Math.random() * 14;
    if (game && !game.player?.indoor) game.engine?.flash?.(0xcfe0ff, 0.28);
  });
}

// ==================================================================================================== bone field
function buildBoneField(C) {
  const { R } = C, Q = quadKits(C);
  const BONE = [0xe8e0c8, 0xd8d0b4, 0xf0e8d0];
  scatter(C, Math.round(12 * C.sc), 9, (x, z, y, i) => {   // ribcage with spine
    const yaw = R.float(0, TAU), K = Q.kit(x, z), ribs = R.int(5, 8), Rr = R.float(2.6, 4.2), gap = 1.5, col = rc(R, BONE);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), P = (lx, lz) => [x + lx * cy + lz * sy, z - lx * sy + lz * cy];
    for (let r = 0; r < ribs; r++) {
      const lz = (r - ribs / 2) * gap, sc = 1 - Math.abs(r - ribs / 2) / ribs * 0.5;
      for (let k = 0; k < 6; k++) {
        const th = (k / 6) * Math.PI, [px, pz] = P(Rr * sc * Math.cos(th), lz);
        K.box(px, y + Rr * sc * Math.sin(th) - 0.3, pz, 0.36, (Rr * sc * Math.PI) / 6 * 1.15, 0.36, col, { rz: th, ry: yaw });
      }
    }
    const [sx, sz] = P(0, 0);
    K.box(sx, y - 0.2, sz, 0.7, 0.7, ribs * gap, 0xcfc6ac, { solid: true, ry: yaw });
    if (i < 2) scrapNear(C, sx, sz, 3.5);
  });
  scatter(C, n2(C, 22), 3, (x, z, y) => {   // giant skulls
    const s = R.float(1.0, 2.2), K = Q.kit(x, z);
    K.ico(x, y + 0.9 * s, z, 1.0 * s, rc(R, BONE), { sy: 0.85, detail: 0 }); C.addBox(x, y + 0.8 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, 0);
    K.box(x + 0.35 * s, y + 1.0 * s, z + 0.85 * s, 0.35 * s, 0.35 * s, 0.1, 0x1a1612, {}); K.box(x - 0.35 * s, y + 1.0 * s, z + 0.85 * s, 0.35 * s, 0.35 * s, 0.1, 0x1a1612, {});
  });
  scatter(C, n2(C, 60), 2, (x, z, y) => Q.kit(x, z).cyl(x, y - 0.05, z, R.float(0.25, 0.5), R.float(0.5, 1.6), rc(R, BONE), { seg: 6, rx: Math.PI / 2, ry: R.float(0, TAU) }), (x, z) => !C.avoid(x, z, 1));
  scatter(C, n2(C, 200), -5, (x, z, y) => Q.kit(x, z).box(x, y - 0.05, z, R.float(0.1, 0.25), R.float(0.05, 0.12), R.float(0.3, 0.9), 0xe8e0c8, { ry: R.float(0, TAU) }), (x, z) => !C.avoid(x, z, -5));
  Q.finish();
}

// ==================================================================================================== neon ruins
function buildNeonRuins(C) {
  const { R } = C, Q = quadKits(C);
  const NEON = [0xff2ad8, 0x2af4ff, 0xfff04a, 0x7a5cff, 0xff6a2a];
  let lit = 0;
  scatter(C, n2(C, 26), 8, (x, z, y, i) => {
    const w = R.float(5, 11), d = R.float(5, 11), h = R.float(6, 21), K = Q.kit(x, z), yaw = R.float(0, TAU), ne = rc(R, NEON);
    K.box(x, y - 0.5, z, w, h, d, R.chance(0.5) ? 0x2a2c3a : 0x34364a, { solid: true, ry: yaw });
    const cy = Math.cos(yaw), sy = Math.sin(yaw), fz = d / 2 + 0.06;
    for (let k = 0; k < R.int(2, 5); k++) {   // lit window bands + a big sign on the +z face
      const ly = R.float(1.5, h - 2), lx = R.float(-w / 2 + 1, w / 2 - 1);
      K.box(x + lx * cy + fz * sy, y + ly, z - lx * sy + fz * cy, R.float(1.2, 3), 0.5, 0.08, R.chance(0.5) ? ne : rc(R, NEON), { glow: true, ry: yaw });
    }
    if (R.chance(0.6)) K.box(x + fz * sy, y + h - 3, z + fz * cy, w * 0.7, 1.6, 0.14, ne, { glow: true, ry: yaw });
    if (lit < 6) { lit++; K.light(x + (fz + 1) * sy, y + 4, z + (fz + 1) * cy, ne, 1.5, 22, 0.05); if (lit <= 2) scrapNear(C, x + (d / 2 + 2) * sy, z + (d / 2 + 2) * cy, 0); }
  });
  scatter(C, n2(C, 18), 3, (x, z, y) => {   // holo billboards
    const K = Q.kit(x, z), ne = rc(R, NEON);
    K.box(x, y - 0.1, z, 0.25, 5, 0.25, 0x30323e, { solid: true }); K.box(x - 0.9, y + 4.6, z, 2.6, 1.8, 0.1, ne, { glow: true, ry: R.float(0, 1) });
  });
  scatter(C, n2(C, 60), -3, (x, z, y) => Q.kit(x, z).box(x, y - 0.05, z, R.float(0.5, 1.6), R.float(0.3, 1), R.float(0.5, 1.6), 0x3a3c4a, { ry: R.float(0, TAU) }), (x, z) => !C.avoid(x, z, -3));
  Q.finish();
}

// ==================================================================================================== rust city
function buildRustCity(C) {
  const { R } = C, Q = quadKits(C);
  const RUST = [0x8a4a2a, 0x7a3e22, 0x9a5a34, 0x6a3a22];
  scatter(C, n2(C, 11), 10, (x, z, y, i) => {   // skeletal tower: 4 pillars, partial floors, braces
    const w = R.float(4, 7), h = R.float(14, 30), K = Q.kit(x, z), col = rc(R, RUST);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(x + sx * w / 2, y - 0.4, z + sz * w / 2, 0.55, h, 0.55, col, { solid: true });
    for (let f = 1; f * 4.6 < h; f++) {
      if (R.chance(0.6)) K.box(x, y + f * 4.6, z, w + 0.5, 0.25, w + 0.5, 0x5a4a3c, {});
      for (const [ax, az, sx, sz] of [[0, w / 2, w, 0.16], [0, -w / 2, w, 0.16], [w / 2, 0, 0.16, w], [-w / 2, 0, 0.16, w]]) if (R.chance(0.7)) K.box(x + ax, y + f * 4.6 - 0.5, z + az, sx, 0.4, sz, col, {});
    }
    for (let b = 0; b < 3; b++) K.box(x - w / 2, y + b * 9, z + w / 2, 0.16, 8.6, 0.16, 0x6a3a22, { rz: 0.72 * (b % 2 ? 1 : -1) * 0.2, rx: 0 });
    if (i % 3 === 0) { K.cyl(x, y + h - 0.2, z, 1.4, 1.8, 0x6a6a5a, { seg: 8 }); }
    if (i < 2) scrapNear(C, x + w / 2 + 2.5, z, 0);
  });
  scatter(C, n2(C, 8), 6, (x, z, y) => {   // cranes
    const K = Q.kit(x, z), a = R.float(0, TAU);
    K.box(x, y - 0.3, z, 0.7, 16, 0.7, 0xc09030, { solid: true }); K.box(x, y + 15.5, z, 14, 0.5, 0.5, 0xc09030, { ry: a }); K.box(x + Math.cos(a) * 5, y + 9, z - Math.sin(a) * 5, 0.06, 6.4, 0.06, 0x3a3a3a, {});
  });
  scatter(C, n2(C, 50), 2, (x, z, y) => Q.kit(x, z).box(x, y - 0.1, z, R.float(0.3, 0.6), R.float(0.3, 0.6), R.float(3, 8), rc(R, RUST), { ry: R.float(0, TAU), rz: R.float(-0.2, 0.2), solid: false }), (x, z) => !C.avoid(x, z, 2));
  scatter(C, n2(C, 30), 2, (x, z, y) => Q.kit(x, z).box(x, y - 0.1, z, R.float(1.2, 2.6), R.float(0.8, 1.6), R.float(1.2, 2.6), rc(R, RUST), { solid: true, ry: R.float(0, TAU) }));
  Q.finish();
}

export const VOYAGE_DECORS = { vycrys: buildCrystalDesert, vyfung: buildFungalSwamp, vysky: buildSkyShards, vyacid: buildAcidShore, vystorm: buildStormPlateau, vybone: buildBoneField, vyneon: buildNeonRuins, vyrust: buildRustCity };
for (const [k, fn] of Object.entries(VOYAGE_DECORS)) registerDecor(k, fn);
