// VOYAGE set pieces (wave 4): 7 compact "contents" a random voyage can drop the ship next to, and the structures of the 9 mission types.
// Everything is built into a Kit (2 merged meshes + a few standalone pulsing meshes), colliders are static boxes, lights are light-pool emitters.
// Every builder returns spots in WORLD coordinates for the host runtime (game/voyage.js):
//   { loot: [{ x, y, z, mul, kind }], guards: [{ type, n, x, z, r }], inter: [{ id, x, y, z, r, kind }], npc?: {x,y,z}, dyn: {...} }
// Builders are pure functions of (kit, rng, info) so every peer builds the identical geometry from the seed.
import * as THREE from 'three';
import { Kit, wallWithGaps } from './voyage_kit.js';

const PALETTE = { hull: 0x7c848e, hullDark: 0x3a4048, rust: 0x7a4a30, metal: 0x50565e, dark: 0x24282e, cloth: [0xb04030, 0x2f8a86, 0xc09030, 0x6a4aa0], warm: 0xffc070, red: 0xff3a24, teal: 0x40f0d0, stone: 0x8a8478, stoneDark: 0x5a564e, wood: 0x6a4c30, yellow: 0xe8b830 };
const P = PALETTE;
const pickCloth = (R) => P.cloth[R.int(0, P.cloth.length - 1)];

function pulseMesh(K, geo, color, x, y, z, dyn, speed = 2.2, o = {}) {
  const m = K.mesh(geo, color, x, y, z, o);
  (dyn.pulses ||= []).push({ mat: m.material, base: new THREE.Color(color), speed, phase: Math.random() * 6 });
  return m;
}
const L = (K, x, y, z, r = 0) => { const p = K.at(x, y, z); return { x: p.x, y: p.y, z: p.z, r }; };

/** open hull section: walls with gaps, roof with a hole, rear ramp door */
function hull(K, { len, wid, h, gapsL = [], gapsR = [], rear = true, front = false, roofGap = null, color = P.hull, stripe = P.red, z0 = 0 }) {
  const hw = wid / 2, a = z0 - len / 2, b = z0 + len / 2;
  wallWithGaps(K, 'z', -hw, a, b, h, 0.4, color, gapsL, { lintel: h - 0.9 });
  wallWithGaps(K, 'z', hw, a, b, h, 0.4, color, gapsR, { lintel: h - 0.9 });
  wallWithGaps(K, 'x', a, -hw, hw, h, 0.4, color, rear ? [[-1.6, 1.6]] : [], { lintel: h - 0.9 });
  wallWithGaps(K, 'x', b, -hw, hw, h, 0.4, color, front ? [[-1.4, 1.4]] : [], { lintel: h - 0.9 });
  // roof slabs (a hole lets the sky in)
  const cuts = roofGap ? [[a, roofGap[0]], [roofGap[1], b]] : [[a, b]];
  for (const [s0, s1] of cuts) if (s1 - s0 > 0.3) K.box(0, h - 0.3, (s0 + s1) / 2, wid + 0.4, 0.3, s1 - s0, P.hullDark, { solid: true });
  // glow hazard stripes along the outside
  K.box(-hw - 0.22, 0.9, z0, 0.06, 0.18, len - 1.5, stripe, { glow: true });
  K.box(hw + 0.22, 0.9, z0, 0.06, 0.18, len - 1.5, stripe, { glow: true });
}
const crate = (K, x, z, s, color = P.rust, ry = 0) => K.box(x, 0, z, s, s * 0.8, s, color, { solid: true, ry });
const screenBank = (K, x, z, ry, color = 0x40ff90, n = 3) => {
  K.box(x, 0, z, 1.8 * n, 1.05, 0.8, P.dark, { solid: true, ry });
  for (let i = 0; i < n; i++) K.box(x + (i - (n - 1) / 2) * 1.7 * Math.cos(ry), 1.05, z - (i - (n - 1) / 2) * 1.7 * Math.sin(ry), 1.3, 0.55, 0.06, color, { glow: true, rx: -0.5, ry });
};

// ==================================================================================================== contents
const CONTENT_BUILD = {
  // ---------------------------------------------------------------- derelict ship (walkable, red emergency light)
  derelict(K, R, info) {
    hull(K, { len: 22, wid: 8, h: 3.6, gapsL: [[-6, -3.5], [4, 6]], gapsR: [[-2, 1.5]], rear: true, roofGap: [-2, 2] });
    for (const z of [-3, 5]) wallWithGaps(K, 'x', z, -4, 4, 3.3, 0.3, P.hullDark, [[-1.2, 1.2]], { lintel: 2.4 });
    K.box(0, 0, 12.6, 6, 2.6, 3, P.hull, { solid: true }); K.box(0, 0, 14.4, 3.4, 1.6, 2.4, P.hull, { solid: true, rx: 0 });   // crumpled nose
    for (const sx of [-2.6, 2.6]) { K.cyl(sx, 0, -12.8, 1.15, 3.2, P.hullDark, { solid: true }); K.cyl(sx, 3.1, -12.8, 1.25, 0.2, P.red, { glow: true }); }
    screenBank(K, 0, 9.4, 0, 0x40ff90, 3);
    K.box(-1.2, 0, 7.2, 0.9, 1.0, 0.9, P.metal, { solid: true }); K.box(1.2, 0, 7.2, 0.9, 1.0, 0.9, P.metal, { solid: true });   // chairs
    crate(K, -2.8, -8.2, 1.2); crate(K, 2.6, -9, 1.5, P.metal, 0.3); crate(K, 3, -6.6, 0.9);
    K.box(-3.3, 2.6, 0, 0.2, 0.2, 9, P.metal, {}); K.box(3.3, 2.7, 1, 0.2, 0.2, 9, P.metal, {});   // ceiling pipes
    K.box(0, 3.25, -6, 0.2, 0.06, 6, P.red, { glow: true }); K.box(0, 3.25, 7, 0.2, 0.06, 6, P.red, { glow: true });
    K.light(0, 2.7, -6, 0xff3020, 1.3, 11, 0.05); K.light(0, 2.7, 7, 0xff3020, 1.1, 10, 0.05);
    for (let i = 0; i < 5; i++) K.box(R.float(-9, 9), 0, R.float(-13, 13), R.float(0.3, 1.1), R.float(0.2, 0.7), R.float(0.3, 1.1), P.rust, { ry: R.float(0, 6), rz: R.float(-0.2, 0.2) });   // debris
    return {
      loot: [[-3, -8.5, 0.3], [3, -7.2, 0.3], [-3, 2, 0.3], [2.5, 8, 0.3], [0, 5.6, 1.0], [0, -1.2, 0.3]].map(([x, z, m]) => ({ ...L(K, x, 0.3, z), mul: 1.1 + m * 0.5, kind: m > 0.9 ? 'prize' : 'scrap' })),
      guards: [{ type: 'hound', n: 1 + (info.tier >= 3 ? 1 : 0), ...L(K, 8, 0, -4, 5) }, { type: 'zombot', n: 2, ...L(K, -6, 0, 12, 5) }],
      inter: [{ id: 'recorder', kind: 'recorder', ...L(K, 0, 1.4, 9.4, 1.1) }],
    };
  },

  // ---------------------------------------------------------------- abandoned colony
  colony(K, R, info) {
    const spots = [[-8, -6, 0.6], [8, -6, -0.6], [-8, 7, 2.5], [8, 7, -2.5]];
    const loot = [], dyn = {};
    spots.forEach(([x, z, ry], i) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      const kx = (lx, lz) => x + lx * c + lz * s, kz = (lx, lz) => z - lx * s + lz * c;
      // cabin 5 x 5, door on the local +z side; walls are single boxes around the centre so the colliders stay axis-aligned to the cabin
      const cab = new Kit(K.env, K.wx(x, z), K.oy, K.wz(x, z), K.yaw + ry);
      wallWithGaps(cab, 'x', -2.5, -2.5, 2.5, 2.8, 0.3, i % 2 ? 0x8a8478 : 0x9a9488, []);
      wallWithGaps(cab, 'x', 2.5, -2.5, 2.5, 2.8, 0.3, i % 2 ? 0x8a8478 : 0x9a9488, [[-0.9, 0.9]], { lintel: 2.1 });
      wallWithGaps(cab, 'z', -2.5, -2.5, 2.5, 2.8, 0.3, 0x8a8478, [[-1, 0.4]], { lintel: 1.9 });
      wallWithGaps(cab, 'z', 2.5, -2.5, 2.5, 2.8, 0.3, 0x8a8478, []);
      cab.box(0, 2.8, 0, 5.4, 0.3, 5.4, 0x5a5e66, { solid: true });
      cab.box(-1.4, 0, -1.6, 1.8, 0.7, 0.9, P.wood, { solid: true }); cab.box(1.4, 0, -1.6, 0.9, 1.0, 0.6, P.metal, { solid: true });   // bunk + locker
      cab.box(0, 1.4, -2.31, 1.2, 0.7, 0.05, P.warm, { glow: true });   // lit window
      if (i % 2 === 0) cab.light(0, 2.2, 0, 0xffb060, 0.8, 8, 0.02);
      cab.finish();
      loot.push({ ...L(K, kx(0, -0.8), 0.3, kz(0, -0.8)), mul: 1.0, kind: 'scrap' });
      if (i === 1) loot.push({ ...L(K, kx(-1.2, 1), 0.3, kz(-1.2, 1)), mul: 1.7, kind: 'prize' });
    });
    K.cyl(-3, 0, -1, 1.5, 3.4, 0x6a7078, { solid: true, seg: 10 }); K.cyl(-3, 3.3, -1, 1.6, 0.25, 0x484c54, { seg: 10 });   // water tank
    K.box(4, 0, -1, 2.4, 1.6, 1.6, P.metal, { solid: true }); K.box(4, 1.6, -0.2, 0.3, 0.3, 0.05, 0x40ff60, { glow: true });   // generator + status led
    for (let i = 0; i < 3; i++) K.box(-2 + i * 2.6, 0.6, 8.4, 2.2, 0.08, 1.3, 0x2a3a6a, { rx: -0.6, solid: false }), K.box(-2 + i * 2.6, 0, 8.6, 0.12, 0.7, 0.12, P.metal, {});   // solar panels
    K.box(0, 0, 1.6, 1.2, 1.3, 0.8, P.dark, { solid: true }); K.box(0, 1.3, 1.6, 1.0, 0.6, 0.06, 0x60ff90, { glow: true, rx: -0.45 });   // log terminal
    K.light(0, 2.2, 1.6, 0x60ff90, 0.7, 8, 0.03);
    for (let a = 0; a < 16; a++) { const ang = (a / 16) * 6.283, gx = Math.cos(ang) * 13, gz = Math.sin(ang) * 13; if (Math.abs(gz) > 11.5 && gx > -2 && gx < 2) continue; K.box(gx, 0, gz, 0.15, 1.5, 0.15, P.wood, {}); }   // fence posts
    return {
      loot: loot.concat([{ ...L(K, 4.5, 0.3, 2), mul: 1.0, kind: 'scrap' }]),
      guards: [{ type: 'zombot', n: 3 + (info.tier >= 3 ? 2 : 0), ...L(K, 0, 0, -11, 6) }, { type: 'mimic', n: 1, ...L(K, 11, 0, 0, 3) }],
      inter: [{ id: 'log', kind: 'log', ...L(K, 0, 1.1, 1.6, 1.0) }],
      dyn,
    };
  },

  // ---------------------------------------------------------------- alien temple (relic on the altar; taking it wakes the guardians)
  temple(K, R, info) {
    const dyn = {};
    K.box(0, 0, 0, 24, 0.36, 24, P.stoneDark, { solid: true }); K.box(0, 0.36, 0, 18, 0.36, 18, P.stone, { solid: true }); K.box(0, 0.72, 0, 12, 0.36, 12, P.stoneDark, { solid: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283 + 0.39, x = Math.cos(a) * 7.6, z = Math.sin(a) * 7.6;
      K.box(x, 0.72, z, 1.3, 5.2, 1.3, P.stone, { solid: true, ry: a }); K.box(x, 5.92, z, 1.9, 0.5, 1.9, P.stoneDark, { ry: a });
      if (i % 2) K.box(x, 6.4, z, 0.3, 0.9, 0.3, P.teal, { glow: true });   // glowing finials
    }
    K.box(0, 1.08, 0, 2.6, 1.0, 2.6, P.stone, { solid: true }); K.box(0, 2.08, 0, 3.0, 0.3, 3.0, P.stoneDark, { solid: false });
    for (const [x, z] of [[-3.4, 0], [3.4, 0], [0, -3.4], [0, 3.4]]) { K.box(x, 1.08, z, 0.5, 2.6, 0.5, 0x3a3a46, { solid: true }); K.box(x, 3.7, z, 0.4, 0.4, 0.4, 0xb050ff, { glow: true }); }
    for (const sx of [-1, 1]) { K.box(sx * 5.4, 0, 13.2, 1.8, 6.2, 1.8, P.stone, { solid: true }); K.box(sx * 5.4, 6.2, 13.2, 2.4, 0.6, 2.4, P.stoneDark, {}); }   // gate columns
    K.box(0, 6.4, 13.2, 12, 0.7, 1.4, P.stoneDark, { solid: true });
    for (const [x, z, ry] of [[-10, -10, 0.8], [10, -10, -0.8], [-10, 10, 2.3], [10, 10, -2.3]]) {   // sentinel statues
      K.box(x, 0.36, z, 1.5, 0.6, 1.5, P.stoneDark, { solid: true, ry }); K.box(x, 0.96, z, 0.9, 2.2, 0.7, P.stone, { solid: true, ry }); K.box(x, 3.16, z, 0.6, 0.6, 0.6, P.stone, { ry });
      K.box(x, 3.3, z, 0.4, 0.06, 0.06, P.teal, { glow: true, ry });   // glowing eyes
    }
    K.light(0, 3.4, 0, 0x40f0d0, 2.0, 18, 0.06); K.light(-9, 2.5, 9, 0xb050ff, 1.0, 12, 0.05); K.light(9, 2.5, 9, 0xb050ff, 1.0, 12, 0.05);
    pulseMesh(K, new THREE.IcosahedronGeometry(0.55, 0), P.teal, 0, 2.7, 0, dyn, 2.6);   // the relic
    pulseMesh(K, new THREE.CylinderGeometry(0.05, 0.05, 9, 5), 0x30c8b0, 0, 4, 0, dyn, 1.4, { opacity: 0.35 });
    return {
      loot: [[-7, 0.9, 7.8], [7, 0.9, 7.8], [-2.6, 1.6, -7.4], [2.6, 1.6, -7.4]].map(([x, y, z], i) => ({ ...L(K, x, y, z), mul: 1.3, kind: i === 0 ? 'prize' : 'scrap' })),
      guards: [],
      inter: [{ id: 'relic', kind: 'relic', ...L(K, 0, 2.5, 0, 1.4) }],
      ambush: [{ type: 'hound', n: 2 + (info.tier >= 3 ? 1 : 0), ...L(K, -11, 0, 11, 3) }, { type: 'zombot', n: 3 + info.tier, ...L(K, 11, 0, 11, 3) }],
      dyn,
    };
  },

  // ---------------------------------------------------------------- merchant outpost (stalls: buy things; nobody shoots)
  merchant(K, R, info) {
    const dyn = {}, inter = [];
    const cloths = [pickCloth(R), pickCloth(R), pickCloth(R)];
    K.box(0, 0, 2, 20, 0.04, 14, 0x5a3a30, {});   // rug
    [[-7, -2, 0.3], [0, -6, 0], [7, -2, -0.3]].forEach(([x, z, ry], i) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      K.box(x, 0, z - 0.9 * c, 4.4, 2.4, 0.25, P.wood, { solid: true, ry });                        // back wall
      K.box(x, 0, z + 1.2 * c, 4.2, 1.0, 0.9, P.wood, { solid: true, ry });                         // counter
      K.box(x, 2.4, z, 4.8, 0.14, 3.6, cloths[i], { rx: -0.16, ry });                               // canopy
      for (const sx of [-2.2, 2.2]) K.box(x + sx * c, 0, z + 1.5 * c - sx * s, 0.16, 2.5, 0.16, P.wood, { ry });
      K.box(x, 1.0, z + 1.2 * c, 3.6, 0.06, 0.6, 0x60ff90, { glow: i === 1, ry });   // shelf
      inter.push({ id: 'ware' + i, kind: 'ware', ...L(K, x + 0.4 * s, 1.2, z + 1.6 * c, 1.5) });
    });
    for (const [x, z] of [[-4, 2], [4, 2], [0, 5], [-11, 3], [11, 3]]) { K.box(x, 0, z, 0.15, 3.2, 0.15, P.wood, { solid: true }); K.box(x, 3.0, z, 0.35, 0.4, 0.35, P.warm, { glow: true }); }
    K.light(-4, 3.1, 2, 0xffc070, 1.2, 13, 0.04); K.light(4, 3.1, 2, 0xffc070, 1.2, 13, 0.04); K.light(0, 3.1, 5, 0xffa040, 1.0, 12, 0.04);
    K.box(0, 0, 8.8, 0.3, 4.6, 0.3, P.wood, { solid: true }); K.box(0, 3.4, 8.7, 3.0, 1.2, 0.08, pickCloth(R), { glow: true });   // banner
    // the merchant: hooded figure behind the middle stall
    K.cyl(0, 0, -4.2, 0.45, 1.5, 0x3a3048, { seg: 7 }); K.box(0, 1.4, -4.2, 0.5, 0.5, 0.5, 0x2a2438, {}); K.box(0, 1.55, -3.94, 0.28, 0.16, 0.05, 0xffd060, { glow: true });
    K.box(-9.5, 0, -7, 1.6, 1.2, 1.6, P.rust, { solid: true }); K.box(9.5, 0, -6.4, 1.2, 1.5, 1.2, P.metal, { solid: true });
    inter.push({ id: 'talk', kind: 'talk', ...L(K, 0, 1.6, -3.6, 1.3) });
    return { loot: [], guards: [], inter, dyn };
  },

  // ---------------------------------------------------------------- pirate camp (guards + strongbox)
  pirate(K, R, info) {
    const dyn = {};
    [[-8, -4, 0.4], [8, -5, -0.5], [-2, -10, 0]].forEach(([x, z, ry], i) => {
      K.cone(x, 0, z, 2.6, 2.4, i === 1 ? 0x30383a : 0x4a2a2a, { seg: 4, ry: ry + 0.78, solid: true });
      K.box(x, 0.02, z + 2.3 * Math.cos(ry), 1.0, 1.4, 0.06, 0x14100e, { ry });   // tent flap dark
    });
    for (let a = 0; a < 8; a++) { const ang = a / 8 * 6.283; K.box(Math.cos(ang) * 1.6 + 1, 0, Math.sin(ang) * 1.6 + 3, 0.5, 0.35, 0.4, P.stoneDark, { ry: ang }); }
    K.box(1, 0, 3, 0.8, 0.2, 0.8, 0x2a1a10, {});
    pulseMesh(K, new THREE.ConeGeometry(0.5, 1.4, 6), 0xff8a24, 1, 0.6, 3, dyn, 7.0);   // bonfire flame
    K.light(1, 1.4, 3, 0xff8030, 2.2, 15, 0.14);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(9 + sx * 1.4, 0, 6 + sz * 1.4, 0.35, 6.4, 0.35, P.wood, { solid: true, rx: sz * 0.05, rz: -sx * 0.05 });   // watchtower legs
    K.box(9, 6.2, 6, 4.2, 0.3, 4.2, P.wood, { solid: true }); K.box(9, 6.5, 8.0, 4.2, 0.9, 0.12, P.wood, {}); K.box(9, 6.5, 4.0, 4.2, 0.9, 0.12, P.wood, {});
    K.box(7.4, 0, 9.5, 0.12, 5.2, 0.12, P.wood, {}); K.box(7.4, 4.0, 9.5, 1.5, 1.0, 0.05, 0x101010, {}); K.box(7.4, 4.4, 9.53, 0.4, 0.4, 0.02, 0xf0f0e0, { glow: true });   // skull flag
    for (let i = 0; i < 6; i++) { K.cyl(R.float(-11, 11), 0, R.float(4, 11), 0.5, 1.0, P.wood, { seg: 8, solid: true }); }
    K.box(0, 0, -6, 1.7, 1.0, 1.1, 0x2c2a36, { solid: true }); K.box(0, 1.0, -6, 1.7, 0.08, 1.1, P.yellow, { glow: true }); K.box(0, 0.4, -5.44, 0.4, 0.3, 0.06, P.yellow, { glow: true });   // strongbox
    for (let i = 0; i < 4; i++) K.box(R.float(-2, 2), 0, R.float(-9, -7), 0.9, 0.7, 0.9, P.rust, { solid: true, ry: R.float(0, 3) });
    return {
      loot: [[-8, 1, -0.3], [8, -2, 0.2], [6, 8, 0.3]].map(([x, z]) => ({ ...L(K, x, 0.4, z), mul: 1.2, kind: 'scrap' })),
      guards: [{ type: 'scavraider', n: 3 + Math.floor(info.tier / 2), ...L(K, 0, 0, 2, 8), fallback: 'zombot' }],
      inter: [{ id: 'strongbox', kind: 'strongbox', ...L(K, 0, 1.0, -6, 1.2) }],
      dyn,
    };
  },

  // ---------------------------------------------------------------- crashed Company freighter (cargo everywhere)
  freighter(K, R, info) {
    // two hull sections + a trail of debris; sections use their own kits (different yaw)
    const bow = new Kit(K.env, K.wx(0, 8), K.oy, K.wz(0, 8), K.yaw + 0.25);
    hull(bow, { len: 12, wid: 7, h: 4, gapsL: [[-2, 1.5]], gapsR: [[1, 4]], rear: true, roofGap: [-1, 2], color: 0x8a8060, stripe: P.yellow });
    bow.box(0, 0, 6.6, 5, 3.2, 3, 0x8a8060, { solid: true }); bow.box(0, 2.5, 4.6, 6, 0.5, 0.5, P.yellow, { glow: true });
    bow.finish();
    const stern = new Kit(K.env, K.wx(-2, -7), K.oy, K.wz(-2, -7), K.yaw - 0.15);
    hull(stern, { len: 13, wid: 7.4, h: 4.2, gapsL: [[-4, 0]], gapsR: [], rear: false, front: true, roofGap: [1, 4.5], color: 0x8a8060, stripe: P.yellow });
    for (const sx of [-2, 2]) { stern.cyl(sx, 0, -7.6, 1.5, 3.6, P.hullDark, { solid: true }); stern.cyl(sx, 3.5, -7.6, 1.6, 0.2, 0xff8020, { glow: true }); }
    stern.box(0, 2.4, 6.6, 3.4, 0.9, 0.06, P.yellow, { glow: true });   // company logo bar on the bulkhead
    stern.finish();
    const cols = [0x2a5aa0, 0xa03a2a, P.yellow, 0x3a7a4a];
    const conts = [];
    for (let i = 0; i < 6; i++) {
      const x = R.float(-11, 11), z = R.float(-2, 12) + (i < 3 ? 0 : 0), ry = R.float(0, 6.28);
      if (Math.hypot(x + 0, z - 1) < 3) continue;
      K.box(x, 0, z, 2.4, 2.5, 6, cols[i % 4], { solid: true, ry, rz: 0 }); conts.push({ x, z });
    }
    for (let i = 0; i < 9; i++) K.box(R.float(-12, 12), 0, R.float(-14, 4), R.float(0.4, 1.4), R.float(0.2, 0.9), R.float(0.4, 1.6), R.float(0, 1) > 0.5 ? P.rust : P.hullDark, { ry: R.float(0, 6), rz: R.float(-0.3, 0.3) });
    K.light(0, 3.4, -6, 0xffa030, 1.1, 11, 0.06);
    K.box(3, 0, 13, 0.2, 3.2, 0.2, P.metal, {}); K.box(3, 3.1, 13, 0.45, 0.3, 0.45, P.red, { glow: true }); K.light(3, 3.6, 13, 0xff3020, 0.9, 10, 0.08);   // beacon mast
    const loot = [];
    for (const c of conts.slice(0, 5)) loot.push({ ...L(K, c.x + 1.8, 0.3, c.z), mul: 1.3, kind: 'scrap' });
    loot.push({ ...L(K, -2.4, 0.4, -9), mul: 1.6, kind: 'prize' });
    const cargo = conts[0] || { x: 5, z: 5 };
    return {
      loot,
      guards: [{ type: 'hound', n: 2 + (info.tier >= 3 ? 1 : 0), ...L(K, 6, 0, -8, 5) }],
      inter: [{ id: 'cargo', kind: 'cargo', ...L(K, cargo.x, 1.3, cargo.z + 3.3, 1.4) }],
      dyn: {},
    };
  },

  // ---------------------------------------------------------------- meteor shower field (craters + falling rocks: see the host director)
  meteor(K, R, info) {
    const dyn = {}, loot = [], craters = [];
    for (let i = 0; i < 8; i++) {
      let x = 0, z = 0, ok = false;
      for (let t = 0; t < 12 && !ok; t++) { x = R.float(-11.5, 11.5); z = R.float(-11.5, 11.5); ok = craters.every((c) => Math.hypot(c.x - x, c.z - z) > 5); }
      if (!ok) continue;
      craters.push({ x, z });
      const r = R.float(1.8, 3.0);
      K.cyl(x, 0.02, z, r, 0.06, 0x1a1816, { seg: 12 });
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.283 + R.float(-0.2, 0.2); K.box(x + Math.cos(a) * r, 0, z + Math.sin(a) * r, R.float(0.4, 0.9), R.float(0.3, 0.7), R.float(0.4, 0.8), 0x3a3230, { ry: a, solid: k % 3 === 0 }); }
      if (i < 5) { K.ico(x, 0.4, z, 0.55, 0x2c2624, { s: 1 }); pulseMesh(K, new THREE.IcosahedronGeometry(0.36, 0), 0xff6a20, x, 0.42, z, dyn, 2.4); loot.push({ ...L(K, x, 0.3, z), mul: 1.0, kind: 'meteor' }); }
    }
    K.light(-4, 1.0, 2, 0xff6a20, 0.8, 9, 0.05);
    for (let i = 0; i < 5; i++) K.box(R.float(-13, 13), 0, R.float(-13, 13), R.float(0.3, 0.7), R.float(0.2, 0.5), R.float(0.3, 0.7), 0x4a4038, { ry: R.float(0, 6) });
    return { loot, guards: [], inter: [], dyn, craters: craters.map((c) => L(K, c.x, 0, c.z)) };
  },
};

export function buildContent(id, K, R, info) {
  const fn = CONTENT_BUILD[id];
  if (!fn) return null;
  const out = fn(K, R, info) || {};
  out.dyn = out.dyn || {};
  K.finish();
  return out;
}

// ==================================================================================================== mission structures
const MISSION_BUILD = {
  rescue(K, R, info, idx) {
    const dyn = {};
    K.cyl(0, 0.2, 0, 1.4, 2.2, 0xd8d0c0, { seg: 8, rz: 1.5708, solid: false }); K.box(0, 0, 0, 3.4, 2.0, 2.4, 0xc8c0b0, { solid: true, ry: 0.4 });   // escape pod (chunky)
    K.box(0.4, 0.9, 1.22, 1.1, 0.8, 0.06, 0x30d0ff, { glow: true, ry: 0.4 });   // viewport
    K.cone(-3, 0, -2, 1.6, 0.7, 0xf0e0c0, { seg: 5, solid: false });               // chute rags
    K.box(-2, 0.05, 3, 2.2, 0.04, 1.6, 0xe08030, { ry: 0.3 }); K.box(3, 0.05, -2.4, 1.6, 0.04, 2.2, 0xe08030, { ry: -0.6 });
    for (let i = 0; i < 4; i++) K.box(R.float(-4, 4), 0, R.float(-4, 4), R.float(0.3, 0.8), R.float(0.2, 0.5), R.float(0.3, 0.8), P.hullDark, { ry: R.float(0, 6) });
    K.light(0, 2.4, 0, 0x30d0ff, 1.1, 10, 0.04);
    pulseMesh(K, new THREE.CylinderGeometry(0.08, 0.08, 14, 5), 0x30d0ff, 0, 7, 0, dyn, 2.0, { opacity: 0.4 });
    return { npc: L(K, 1.2, 0, 3.2), marker: L(K, 0, 2.5, 0), inter: [], loot: [], guards: [{ type: 'hound', n: 1, ...L(K, 9, 0, 6, 4) }], dyn };
  },
  blackbox(K, R, info) {
    const dyn = {};
    K.cyl(0, 0.02, 0, 4.2, 0.06, 0x14120f, { seg: 14 });
    K.box(-1.4, 0, -1, 0.3, 3.4, 2.6, P.hullDark, { solid: true, rz: 0.12, ry: 0.2 }); K.box(2.2, 0, 1.4, 2.4, 1.3, 1.6, P.hull, { solid: true, ry: 0.7, rx: 0 });
    for (let i = 0; i < 9; i++) K.box(R.float(-5, 5), 0, R.float(-5, 5), R.float(0.3, 1.1), R.float(0.15, 0.5), R.float(0.3, 1.1), i % 3 ? P.hullDark : P.rust, { ry: R.float(0, 6), rz: R.float(-0.3, 0.3) });
    pulseMesh(K, new THREE.CylinderGeometry(0.07, 0.07, 12, 5), 0xff8a24, 0, 6, 0, dyn, 3.0, { opacity: 0.45 });
    K.light(0, 1.5, 0, 0xff8a24, 1.0, 9, 0.08);
    return { spot: L(K, 0, 0.35, 0), marker: L(K, 0, 2.0, 0), inter: [], loot: [], guards: [{ type: 'zombot', n: 3, ...L(K, 6, 0, 0, 5) }], dyn };
  },
  relay(K, R, info) {
    const dyn = { panels: [] };
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(sx * 1.6, 0, sz * 1.6, 0.3, 15.5, 0.3, P.metal, { solid: true, rx: sz * -0.045, rz: sx * 0.045 });
    for (const y of [3, 6.5, 10, 13.2]) { const w = 3.6 - y * 0.1; K.box(0, y, w / 2 - 0.15, w, 0.14, 0.14, P.metal, {}); K.box(0, y, -(w / 2 - 0.15), w, 0.14, 0.14, P.metal, {}); K.box(w / 2 - 0.15, y, 0, 0.14, 0.14, w, P.metal, {}); K.box(-(w / 2 - 0.15), y, 0, 0.14, 0.14, w, P.metal, {}); }
    K.cyl(0, 15, 0, 1.6, 0.4, 0x8a9098, { seg: 10, rTop: 0.2 });
    pulseMesh(K, new THREE.SphereGeometry(0.3, 6, 5), P.red, 0, 16, 0, dyn, 4.0);
    K.box(-4.5, 0, 0, 1.4, 1.8, 2.4, P.dark, { solid: true });   // generator shed
    K.light(0, 3.0, 3, 0xffa040, 0.9, 10, 0.05);
    const at = [[0, 3.4], [-3.4, -1.6], [3.4, -1.6]];
    const inter = at.map(([x, z], i) => {
      K.box(x, 0, z, 1.0, 1.5, 0.35, P.dark, { solid: true });
      dyn.panels.push(K.mesh(new THREE.BoxGeometry(0.6, 0.35, 0.06), P.red, x, 1.0, z + (z > 0 ? 0.2 : 0.2)));
      return { id: 'p' + i, kind: 'panel', ...L(K, x, 1.0, z, 1.1), i };
    });
    return { marker: L(K, 0, 3, 0), inter, loot: [], guards: [], dyn, ambush: [{ type: 'hound', n: 1 + (info.tier >= 3 ? 1 : 0), ...L(K, 7, 0, 7, 3) }, { type: 'zombot', n: 3, ...L(K, -7, 0, 7, 3) }] };
  },
  hunt(K, R, info) {
    const dyn = {};
    K.cyl(0, 0.02, 0, 6, 0.06, 0x1c1410, { seg: 14 });
    for (let i = 0; i < 7; i++) { const a = R.float(0, 6.28), d = R.float(1, 5); K.box(Math.cos(a) * d, 0, Math.sin(a) * d, 0.3, R.float(0.5, 1.5), 0.3, 0xd8d0b8, { rx: R.float(-0.5, 0.5), rz: R.float(-0.5, 0.5) }); }
    for (const [x, z] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) { K.box(x, 0, z, 0.14, 2.6, 0.14, P.wood, {}); K.ico(x, 2.8, z, 0.3, 0xd8d0b8, {}); }
    pulseMesh(K, new THREE.CylinderGeometry(0.08, 0.08, 10, 5), 0xff2a2a, 0, 5, 0, dyn, 2.6, { opacity: 0.35 });
    return { spot: L(K, 0, 0, 0), marker: L(K, 0, 2, 0), inter: [], loot: [], guards: [], dyn };
  },
  drone(K, R, info, idx) {
    const dyn = {};
    K.cyl(0, 0, 0, 2.6, 0.2, P.dark, { seg: 12 });
    pulseMesh(K, new THREE.CylinderGeometry(2.4, 2.4, 0.08, 16, 1, true), idx === 0 ? 0x30d0ff : 0x40ff70, 0, 0.22, 0, dyn, 2.2, { opacity: 0.8 });
    if (idx === 1) pulseMesh(K, new THREE.CylinderGeometry(0.08, 0.08, 16, 5), 0x40ff70, 0, 8, 0, dyn, 2.0, { opacity: 0.4 });
    K.light(0, 1.6, 0, idx === 0 ? 0x30d0ff : 0x40ff70, 0.9, 9, 0.03);
    for (const [x, z] of [[-3.2, 0], [3.2, 0]]) K.box(x, 0, z, 0.25, 1.6, 0.25, P.metal, { solid: true });
    const p = L(K, 0, 0.3, 0);
    return idx === 0 ? { npc: p, marker: L(K, 0, 1.5, 0), inter: [{ id: 'power', kind: 'power', ...L(K, 0, 1.2, 0, 1.6) }], loot: [], guards: [], dyn } : { goal: p, marker: L(K, 0, 1.5, 0), inter: [], loot: [], guards: [], dyn };
  },
  defend(K, R, info) {
    const dyn = {};
    K.box(0, 0, 0, 5, 0.6, 5, P.dark, { solid: true });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(sx * 1.6, 0.6, sz * 1.6, 0.3, 9, 0.3, 0xc08a30, { solid: true, rx: sz * -0.06, rz: sx * 0.06 });
    for (const y of [3, 6.5]) for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) K.box(sx * 1.2, y, sz * 1.2, sx ? 0.14 : 2.6, 0.14, sz ? 0.14 : 2.6, 0xc08a30, {});
    K.cyl(0, 0.6, 0, 0.5, 8, 0x60646c, { seg: 8 });
    K.box(3.6, 0, 1.4, 2.0, 1.4, 1.6, 0x3a3f48, { solid: true }); K.box(3.6, 1.4, 2.22, 0.5, 0.3, 0.05, 0x40ff60, { glow: true });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; K.box(Math.cos(a) * 6.4, 0, Math.sin(a) * 6.4, 1.6, 0.8, 0.7, 0x8a7a5a, { ry: a + 1.57, solid: true }); }   // sandbag ring
    pulseMesh(K, new THREE.SphereGeometry(0.35, 6, 5), 0xff8a24, 0, 9.5, 0, dyn, 3.4);
    K.light(0, 8.6, 0, 0xffa040, 1.5, 16, 0.05);
    return { marker: L(K, 0, 4, 0), rigPos: L(K, 0, 0, 0), inter: [{ id: 'start', kind: 'rig', ...L(K, 3.6, 1.0, 2.4, 1.6) }], loot: [], guards: [], dyn };
  },
  heist(K, R, info) {
    const dyn = {};
    K.box(-4.6, 0, 0, 0.5, 4.4, 8, 0x6a6e74, { solid: true }); K.box(4.6, 0, 0, 0.5, 4.4, 8, 0x6a6e74, { solid: true }); K.box(0, 0, -4, 9.6, 4.4, 0.5, 0x6a6e74, { solid: true }); K.box(0, 4.4, 0, 9.8, 0.5, 8.6, 0x585c62, { solid: true });
    K.box(-3.0, 0, 4, 3.4, 4.4, 0.5, 0x6a6e74, { solid: true }); K.box(3.0, 0, 4, 3.4, 4.4, 0.5, 0x6a6e74, { solid: true });   // front wall with a 2.6 wide door
    K.box(0, 3.4, 4, 2.8, 1.0, 0.5, 0x6a6e74, { solid: true });
    dyn.door = K.mesh(new THREE.BoxGeometry(2.7, 3.4, 0.3), 0x3a4048, 0, 1.7, 4.0);
    dyn.doorCollider = K.env.addBox(K.wx(0, 4.0), K.oy + 1.7, K.wz(0, 4.0), 2.7, 3.4, 0.3, K.yaw, { kind: 'vydoor' });
    pulseMesh(K, new THREE.BoxGeometry(0.4, 0.4, 0.08), P.red, 2.2, 1.6, 4.35, dyn, 3.0);   // keypad light
    K.box(2.0, 1.0, 4.3, 0.7, 1.2, 0.2, P.dark, { solid: false });
    pulseMesh(K, new THREE.SphereGeometry(0.28, 6, 5), P.red, 0, 5.0, 4.2, dyn, 5.0);   // alarm light
    K.box(0, 0, -2.4, 2.2, 1.1, 1.3, 0x2c2a36, { solid: true }); K.box(0, 1.1, -2.4, 2.2, 0.08, 1.3, P.yellow, { glow: true });   // vault safe
    K.light(0, 2.4, 1.0, 0xffe0a0, 0.9, 9, 0.02);
    return { marker: L(K, 0, 3, 0), inter: [{ id: 'start', kind: 'vault', ...L(K, 2.2, 1.3, 4.6, 1.6) }], loot: [], guards: [], dyn, spot: L(K, 0, 0.3, 0.6), rigPos: L(K, 0, 0, 0) };
  },
};
export function buildMissionSite(type, idx, K, R, info) {
  const fn = MISSION_BUILD[type];
  if (!fn) return null;
  const out = fn(K, R, info, idx) || {};
  out.dyn = out.dyn || {};
  K.finish();
  return out;
}

// ==================================================================================================== survey anomalies (standalone, dynamic colour)
export function buildAnomaly(env, x, y, z, seed) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0x3a3f48, flatShading: true }));
  post.position.y = 0.8;
  const mat = new THREE.MeshBasicMaterial({ color: 0x30e8ff, fog: true });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat);
  core.position.y = 2.0;
  g.add(post, core);
  g.position.set(x, y, z);
  env.add(g); env.own(post.geometry); env.own(core.geometry); env.mat(post.material); env.mat(mat);
  return { group: g, core, mat, seed };
}

// ==================================================================================================== npc / specimen models (client views)
export function createNpcModel(kind) {
  const g = new THREE.Group();
  const own = [];
  const mk = (geo, color, basic = false) => { const m = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }); own.push(geo, m); return new THREE.Mesh(geo, m); };
  if (kind === 'drone') {
    const body = mk(new THREE.BoxGeometry(1.5, 0.7, 1.1), 0xd0a030); body.position.y = 0.6;
    const cargo = mk(new THREE.BoxGeometry(1.3, 0.9, 0.9), 0x3a6a9a); cargo.position.y = 1.35;
    const led = mk(new THREE.BoxGeometry(0.25, 0.14, 0.06), 0x40ff70, true); led.position.set(0, 0.7, 0.58);
    g.add(body, cargo, led);
    const rotors = [];
    for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) { const r = mk(new THREE.BoxGeometry(0.9, 0.04, 0.12), 0x30343a); r.position.set(x, 0.98, z); g.add(r); rotors.push(r); }
    return { root: g, rotors, led, height: 1.8, dispose() { own.forEach((o) => o.dispose()); } };
  }
  // stranded crewmate: orange suit, helmet
  const legs = mk(new THREE.BoxGeometry(0.5, 0.85, 0.3), 0xd86a1a); legs.position.y = 0.42;
  const torso = mk(new THREE.BoxGeometry(0.62, 0.7, 0.36), 0xe87a20); torso.position.y = 1.2;
  const head = mk(new THREE.BoxGeometry(0.42, 0.42, 0.42), 0xd8d0c0); head.position.y = 1.78;
  const visor = mk(new THREE.BoxGeometry(0.34, 0.2, 0.05), 0x30c8ff, true); visor.position.set(0, 1.8, 0.22);
  const armL = mk(new THREE.BoxGeometry(0.16, 0.6, 0.16), 0xe87a20); armL.position.set(-0.4, 1.2, 0);
  const armR = armL.clone(); armR.position.x = 0.4;
  const beacon = mk(new THREE.BoxGeometry(0.12, 0.12, 0.12), 0xff3a24, true); beacon.position.set(0, 2.15, 0);
  g.add(legs, torso, head, visor, armL, armR, beacon);
  return { root: g, armL, armR, beacon, height: 1.9, dispose() { own.forEach((o) => o.dispose()); } };
}

/** The rare creature to photograph: a small glowing stag (registered by game/voyage.js as creature 'vy_specimen'). */
export function createSpecimenModel() {
  const root = new THREE.Group(), own = [];
  const mk = (geo, color, basic = false) => { const m = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }); own.push(geo, m); return { mesh: new THREE.Mesh(geo, m), mat: m }; };
  const body = mk(new THREE.BoxGeometry(0.7, 0.7, 1.5), 0xd8e8f0); body.mesh.position.y = 1.1;
  const neck = mk(new THREE.BoxGeometry(0.3, 0.8, 0.3), 0xd8e8f0); neck.mesh.position.set(0, 1.6, 0.7); neck.mesh.rotation.x = 0.4;
  const head = mk(new THREE.BoxGeometry(0.34, 0.34, 0.6), 0xe8f4ff); head.mesh.position.set(0, 2.05, 1.0);
  root.add(body.mesh, neck.mesh, head.mesh);
  for (const sx of [-1, 1]) {
    const antler = mk(new THREE.BoxGeometry(0.06, 0.9, 0.06), 0x6ad8ff, true); antler.mesh.position.set(sx * 0.16, 2.5, 0.95); antler.mesh.rotation.z = -sx * 0.5; root.add(antler.mesh);
    const tine = mk(new THREE.BoxGeometry(0.06, 0.5, 0.06), 0xb08aff, true); tine.mesh.position.set(sx * 0.42, 2.7, 0.95); tine.mesh.rotation.z = sx * 0.4; root.add(tine.mesh);
  }
  const legs = [];
  for (const [x, z] of [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.85, z);
    const leg = mk(new THREE.BoxGeometry(0.14, 0.85, 0.14), 0xb8c8d4); leg.mesh.position.y = -0.42; pivot.add(leg.mesh); root.add(pivot); legs.push(pivot);
  }
  const glow = mk(new THREE.BoxGeometry(0.3, 0.05, 1.2), 0x6ad8ff, true); glow.mesh.position.y = 1.47; root.add(glow.mesh);
  let ph = 0;
  return {
    root, parts: {}, height: 2.4, radius: 0.6, setElite() {}, setTint() {}, setHitFlash() {}, dispose() { own.forEach((o) => o.dispose()); },
    update(dt, a) {
      const sp = a.speed || 0; ph += dt * (2 + sp * 1.8);
      legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * Math.min(0.8, sp * 0.18); });
      glow.mat.color.setHex(0x6ad8ff).multiplyScalar(0.7 + 0.3 * Math.sin((a.time || 0) * 2));
    },
  };
}
