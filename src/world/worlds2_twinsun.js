// WAVE 3 worlds2 - the twin-sun desert (biome `twinsun`, decor kind 'twinsun'; original names / shapes, no borrowed IP).
//   * crescent dunes come from terrain.js (biome.dunes); this file adds the set dressing:
//   * MOISTURE HARVESTER towers (tall finned columns, many near the outpost), a CANTINA-STYLE OUTPOST (octagonal adobe hall with a dome
//     roof, neon, bar, stools, landing pad, parked skiffs, huts, a glowing sign) whose neutral alien patrons are spawned by
//     game/worlds2.js from decor.info.cantina.npcSpots, a wrecked SAND CRAWLER (enterable hull, ramp, breach, loot),
//     a giant RIBCAGE landmark, scavenger camps (fire + tents; raiders are spawned there), windblown sand.
//   * TWO SUNS: two sun discs follow env.sunDir (the second one offset), and cheap fake TWIN SHADOWS (one long soft quad per sun per tall
//     prop, refreshed twice a second); a subtle HEAT SHIMMER (engine warp) by day. No scene light is ever added or removed.
// Layout is seeded (C.R); Math.random only drives the particles / flicker.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { getLang } from '../core/i18n.js';
import { levelTexture } from './geobuilder.js';
import { makeCanvasTexture } from '../render/textures.js';
import { DECOR_HELPERS } from './outdoor_biomes.js';
import { FrameGeo, Solids, w2Material, groundStats, rectMinus, createSiteFinder, guard } from './worlds2_solids.js';

const { instanced, TAU } = DECOR_HELPERS;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const SAND = [1.0, 0.9, 0.7], SAND2 = [0.95, 0.78, 0.6], BONE = [0.96, 0.92, 0.8];

const SIGN = { en: ['THE THIRSTY BYTE', 'ALL SPECIES WELCOME  -  NO BLASTERS AT THE BAR'], tr: ['SUSAMIS BAYT', 'HER TURDEN MISAFIR ISTER  -  BARDA SILAH YASAK'], ru: ['ЖАЖДУЩИЙ БАЙТ', 'ВСЕМ ВИДАМ РАДЫ  -  БЕЗ БЛАСТЕРОВ У СТОЙКИ'] };
function signText() { let l = 'en'; try { l = getLang(); } catch { /* ignore */ } return SIGN[l] || SIGN.en; }

/** base of an object footprint: lowest / highest ground under it */
const baseOf = (C, x, z, r) => { const g = groundStats(C.h, x, z, r); return { y0: g.hi + 0.05, yLo: g.lo }; };

// ---------------------------------------------------------------------------------------------------------- pieces
function vaporator(S, x, z, y0, yLo, h, rot) {
  S.frame(x, z, rot);
  S.solid('rust', 0, yLo - 0.5, 0, 1.5, y0 - yLo + 0.5 + 0.35, 1.5, { tint: 0.85 });                         // footing
  S.solid('metal', 0, y0 + 0.35, 0, 0.55, h, 0.55, { tint: 0.95, color: [0.92, 0.94, 1.0] });                // column
  for (const [dx, dz, sx, sz] of [[0.42, 0, 0.06, 0.7], [-0.42, 0, 0.06, 0.7], [0, 0.42, 0.7, 0.06], [0, -0.42, 0.7, 0.06]]) S.vis('dark', dx, y0 + 1.2, dz, sx, h - 1.6, sz, { col: false, tint: 0.6 });   // fins
  S.solid('rust', 0, y0 + 0.35 + h, 0, 1.0, 0.25, 1.0, { tint: 0.8 });                                        // cap
  S.vis('glow', 0, y0 + 0.6 + h, 0, 0.2, 0.2, 0.2, { col: false, color: [0.5, 1, 0.9] });                     // status lamp
}

function skiff(S, x, z, y0, rot) {
  S.frame(x, z, rot);
  S.solid('metal', 0, y0 + 0.5, 0, 3.4, 0.85, 1.7, { tint: 0.9, color: [0.85, 0.88, 0.95] });
  S.solid('metal', 0.9, y0 + 1.35, 0, 1.3, 0.55, 1.2, { tint: 0.85 });
  S.vis('glow', 1.58, y0 + 1.42, 0, 0.05, 0.36, 0.9, { col: false, color: [0.4, 0.75, 1] });                  // canopy glass
  for (const sz of [-1, 1]) { S.solid('rust', -1.6, y0 + 0.6, sz * 1.15, 1.2, 0.55, 0.5, { tint: 0.8 }); S.vis('dark', -0.4, y0 + 0.75, sz * 1.5, 1.6, 0.06, 0.9, { col: false, tint: 0.7 }); }
  for (const sz of [-1, 1]) S.vis('glow', -2.25, y0 + 0.7, sz * 1.15, 0.05, 0.3, 0.3, { col: false, color: [1, 0.55, 0.2] });
  for (const dx of [-1.2, 1.2]) for (const dz of [-0.6, 0.6]) S.vis('dark', dx, y0, dz, 0.3, 0.5, 0.3, { col: false });
}

function hut(S, x, z, rot, C, R) {
  const b = baseOf(C, x, z, 3.2);
  S.frame(x, z, rot);
  S.solid('adobe', 0, b.yLo - 0.6, 0, 5.0, b.y0 - b.yLo + 0.6, 5.0, { tint: 0.9, color: SAND2 });
  S.wall('adobe', 'x', -2.2, -2.3, 4.6, b.y0, 2.6, [], 0.5, { color: SAND, panel: 2.4 });
  S.wall('adobe', 'x', 2.2, -2.3, 4.6, b.y0, 2.6, [{ u0: 1.7, u1: 2.9, v0: 0, v1: 2.1 }], 0.5, { color: SAND, panel: 2.4 });
  S.wall('adobe', 'z', -2.2, -1.95, 3.9, b.y0, 2.6, [], 0.5, { color: SAND, panel: 2.4 });
  S.wall('adobe', 'z', 2.2, -1.95, 3.9, b.y0, 2.6, [{ u0: 1.2, u1: 2.3, v0: 1.1, v1: 1.9 }], 0.5, { color: SAND, panel: 2.4 });
  S.solid('adobe', 0, b.y0 + 2.6, 0, 5.0, 0.4, 5.0, { tint: 0.85, color: SAND2 });
  S.vis('adobe', 0, b.y0 + 3.0, 0, 3.6, 0.5, 3.6, { col: false, color: SAND });
  return b;
}

// ---------------------------------------------------------------------------------------------------------- the cantina outpost
function cantina(C, S, R, s, out) {
  const cx = s.x, cz = s.z, y0 = s.y0, yLo = s.yLo;
  const A = Math.atan2(-cz, -cx);                       // direction to the ship: the door faces it
  const RC = 6.4, AP = RC * Math.cos(Math.PI / 8), SIDE = 2 * RC * Math.sin(Math.PI / 8), WH = 3.4;
  // foundation
  S.frame(cx, cz, 0);
  S.solid('adobe', 0, yLo - 0.9, 0, 13.2, y0 - yLo + 0.9, 13.2, { tint: 0.85, color: SAND2 });
  // walls: 8 segments, k = 0 is the door segment
  for (let k = 0; k < 8; k++) {
    const th = A + (k * Math.PI) / 4;
    const px = cx + Math.cos(th) * AP, pz = cz + Math.sin(th) * AP, rot = Math.atan2(-Math.cos(th), -Math.sin(th));
    S.frame(px, pz, rot);
    const ops = [];
    if (k === 0) ops.push({ u0: SIDE / 2 - 1.15, u1: SIDE / 2 + 1.15, v0: 0, v1: 2.7 });
    else if (k % 2 === 0) ops.push({ u0: SIDE / 2 - 0.5, u1: SIDE / 2 + 0.5, v0: 1.5, v1: 2.2 });
    S.wall('adobe', 'x', 0, -SIDE / 2, SIDE, y0, WH, ops, 0.6, { color: SAND, panel: 2.5 });
    // pillars at the corners
    const ca = th + Math.PI / 8;
    S.frame(cx + Math.cos(ca) * RC, cz + Math.sin(ca) * RC, 0);
    S.solid('adobe', 0, y0, 0, 0.95, WH + 0.4, 0.95, { tint: 1.05, color: SAND2 });
  }
  // interior frame: local +x points to the door, local z is +90 degrees
  S.frame(cx, cz, -A);
  S.solid('wood', -3.4, y0, 0, 0.95, 1.15, 6.4, { tint: 0.85, color: [0.75, 0.6, 0.45] });                    // bar counter
  S.vis('wood', -3.4, y0 + 1.15, 0, 1.15, 0.1, 6.6, { col: false, tint: 0.6 });
  S.solid('dark', -5.35, y0, 0, 0.5, 2.6, 5.2, { tint: 0.5 });                                                 // back shelves
  for (let i = 0; i < 9; i++) S.vis('glow', -5.05, y0 + 1.0 + (i % 3) * 0.55, -2.2 + Math.floor(i / 3) * 2.2 + (i % 3) * 0.2, 0.12, 0.34, 0.12, { col: false, color: [[1, 0.3, 0.8], [0.3, 1, 0.9], [1, 0.8, 0.3]][i % 3] });
  for (const [tx, tz] of [[0.6, -2.6], [0.6, 2.6], [2.0, 0]]) {                                                // tables + stools
    S.solid('wood', tx, y0, tz, 1.2, 0.9, 1.2, { tint: 0.8, color: [0.7, 0.55, 0.42] });
    for (const [dx, dz] of [[0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95]]) S.solid('dark', tx + dx, y0, tz + dz, 0.42, 0.55, 0.42, { tint: 0.7 });
  }
  for (let i = 0; i < 5; i++) S.solid('dark', -2.55, y0, -2.6 + i * 1.3, 0.42, 0.7, 0.42, { tint: 0.7 });       // bar stools
  // neon strips + lights
  S.vis('glow', -5.6, y0 + 2.6, 0, 0.06, 0.1, 5.4, { col: false, color: [1, 0.2, 0.85] });
  S.vis('glow', 0, y0 + WH - 0.1, -5.7, 6.0, 0.08, 0.06, { col: false, color: [0.2, 0.95, 1] });
  S.light(-3.4, y0 + 2.7, 0, 0xff2ad8, 1.15, 11, 0.12);
  S.light(2.2, y0 + 2.7, 2.6, 0x2af4ff, 0.95, 10, 0.08);
  S.light(2.0, y0 + 2.9, -2.8, 0xffb060, 0.7, 9, 0.2);
  // patron / bartender spots (world coordinates)
  const spots = [];
  const spot = (lx, lz, role) => { const [wx, wz] = S.w(lx, lz); spots.push({ x: wx, z: wz, y: y0, role, yaw: Math.atan2(cx - wx, cz - wz) + Math.PI * 0 }); };
  spot(-4.4, 0, 'bartender'); spot(-1.9, -1.3, 'patron'); spot(-1.9, 1.8, 'patron'); spot(1.7, -2.6, 'patron'); spot(0.4, 2.6, 'patron'); spot(3.0, 0.2, 'patron'); spot(1.0, -0.4, 'patron');
  // dome roof (visual, open oculus) + sign
  const domeMat = C.mat(new THREE.MeshLambertMaterial({ map: levelTexture('sand'), color: 0xe8cfa0, side: THREE.DoubleSide }));
  const dome = C.add(C.own(new THREE.Mesh(new THREE.SphereGeometry(RC * 1.04, 12, 6, 0, TAU, 0, Math.PI / 2 - 0.3), domeMat)));
  dome.scale.set(1, 0.55, 1); dome.position.set(cx, y0 + WH, cz);
  // sign above the door
  const st = signText();
  const tex = makeCanvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#14081c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff2ad8'; ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, h - 3, w, 3);
    ctx.textAlign = 'center'; ctx.fillStyle = '#2af4ff'; ctx.font = "bold 24px 'TFG Cyr VT', 'Arial Black', monospace"; ctx.fillText(st[0], w / 2, 30, 240);
    ctx.fillStyle = '#ffe070'; ctx.font = "10px 'TFG Cyr VT', monospace"; ctx.fillText(st[1], w / 2, 52, 244);
  });
  if (tex) C.texs.push(tex);
  const sign = C.add(C.own(new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), C.mat(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true })))));
  sign.position.set(cx + Math.cos(A) * (AP + 0.5), y0 + WH + 0.9, cz + Math.sin(A) * (AP + 0.5));
  sign.rotation.y = Math.PI / 2 - A;
  C.updaters.push(guard((dt, t) => { sign.material.color.setScalar(0.82 + 0.18 * Math.sin(t * 7) * (Math.random() < 0.03 ? 0.4 : 1)); }));
  // huts, landing pad + skiffs, vaporators around
  const ring = [Math.PI * 0.62, Math.PI * 1.28, Math.PI * 1.7];
  ring.forEach((a, i) => { const ang = A + a; hut(S, cx + Math.cos(ang) * 13.5, cz + Math.sin(ang) * 13.5, R.float(0, TAU), C, R); void i; });
  const padA = A + Math.PI * 0.16, px = cx + Math.cos(padA) * 17, pz = cz + Math.sin(padA) * 17;
  const pb = baseOf(C, px, pz, 5);
  S.frame(px, pz, R.float(0, TAU));
  S.solid('metal', 0, pb.yLo - 0.5, 0, 9.4, pb.y0 - pb.yLo + 0.5, 9.4, { tint: 0.75, uv: 0.3 });
  S.vis('hazard', 0, pb.y0, 0, 9.0, 0.03, 9.0, { col: false, tint: 0.9, bottom: false });
  skiff(S, px + 1.0, pz - 0.5, pb.y0 + 0.02, R.float(0, TAU));
  for (let i = 0; i < 3; i++) {
    const a = A + Math.PI * (0.35 + i * 0.5) + R.float(-0.2, 0.2), x = cx + Math.cos(a) * 11, z = cz + Math.sin(a) * 11, bb = baseOf(C, x, z, 1.5);
    vaporator(S, x, z, bb.y0, bb.yLo, R.float(3.2, 4.4), R.float(0, TAU));
    out.casters.push({ x, z, y: bb.y0, h: 4, w: 0.7 });
  }
  // fuel drums + crates by the door
  const doorX = cx + Math.cos(A) * (AP + 2.2), doorZ = cz + Math.sin(A) * (AP + 2.2);
  S.frame(doorX, doorZ, -A);
  const db = baseOf(C, doorX, doorZ, 2.5);
  for (let i = 0; i < 3; i++) S.solid('rust', 1.4, db.y0, -2.8 + i * 0.55, 0.5, 0.8, 0.5, { tint: 0.85, color: [1, 0.6, 0.4] });
  S.solid('wood', 1.6, db.y0, 2.6, 1.1, 0.9, 1.1, { tint: 0.9 });
  out.casters.push({ x: cx, z: cz, y: y0, h: WH + 1.4, w: 9 });
  const doorPos = { x: cx + Math.cos(A) * AP, z: cz + Math.sin(A) * AP };
  return { x: cx, z: cz, y: y0, r: RC, npcSpots: spots, door: doorPos, yaw: A, pad: { x: px, z: pz } };
}

// ---------------------------------------------------------------------------------------------------------- sand crawler wreck
export function crawler(C, S, R, s, rot, out) {
  const y0 = s.y0, yLo = s.yLo, D = 1.4;              // deck height above the sand
  S.frame(s.x, s.z, rot);
  S.solid('rust', 0, yLo - 1.0, 0, 15.2, y0 - yLo + 1.0 + 0.7, 7.6, { tint: 0.8, color: SAND2, uv: 0.3 });          // half-buried in the dune
  for (const sz of [-1, 1]) S.solid('dark', 0, y0 + 0.2, sz * 3.0, 13.2, 1.4, 1.5, { tint: 0.55 });                     // tread pods
  const fy = y0 + D;                                                                                                   // deck top
  S.slab('rust', [-6.6, 6.6, -2.7, 2.7], fy + 0.25, 0.25, { tint: 0.75 });
  const hy = fy + 0.25, H = 3.6;
  // walls: rear (-x) with the door opening, front (+x) with a cracked windshield, sides with a tear + vents
  S.wall('rust', 'z', -6.55, -2.7, 5.4, hy, H, [{ u0: 1.6, u1: 3.8, v0: 0, v1: 2.5 }], 0.35, { tint: 0.9, panel: 2.7 });
  S.wall('rust', 'z', 6.55, -2.7, 5.4, hy, H, [{ u0: 1.0, u1: 4.4, v0: 1.7, v1: 2.9 }], 0.35, { tint: 0.9, panel: 2.7 });
  const tearSide = R.pick([-1, 1]);
  for (const sz of [-1, 1]) {
    const ops = [{ u0: 2.2, u1: 3.0, v0: 1.9, v1: 2.6 }, { u0: 9.6, u1: 10.4, v0: 1.9, v1: 2.6 }];
    if (sz === tearSide) ops.push({ u0: 4.4, u1: 8.0, v0: 0.2, v1: 3.3 });
    S.wall('rust', 'x', sz * 2.55, -6.6, 13.2, hy, H, ops, 0.35, { tint: 0.85, panel: 3.3 });
  }
  const roof = rectMinus([-6.6, 6.6, -2.7, 2.7], [[-1.0, 3.6, -1.6, 0.9]]);                                            // breach in the roof
  for (const r of roof) S.slab('rust', r, hy + H + 0.25, 0.25, { tint: 0.8 });
  // ramp at the rear door
  // (world/stairs.js: visual steps + one inclined ramp collider, ending flush with the door sill at deck height)
  S.stairs({ key: 'rust', x: -10.475, z: 0, y: y0 - 0.4, baseY: y0 - 1.0, dir: 'x+', width: 2.2, rise: fy + 0.25 - (y0 - 0.4), run: 3.3, n: 7, tint: 0.8, tag: 'crawler' });
  // contents: crates, a dead console, cables
  for (const [x, z, sz] of [[-4.2, 1.6, 1.0], [-3.2, -1.6, 0.9], [4.6, 1.5, 1.1], [-1.0, -1.8, 0.8]]) S.solid(R.chance(0.5) ? 'wood' : 'dark', x, hy, z, sz, sz * 0.9, sz, { tint: 0.8 });
  S.solid('dark', 5.7, hy, 0, 0.8, 1.1, 3.4, { tint: 0.55 });
  S.vis('glow', 5.28, hy + 0.7, 0, 0.04, 0.4, 2.4, { col: false, color: [0.2, 1, 0.5] });
  S.light(5.0, hy + 1.6, 0, 0x30ff80, 0.55, 7, 0.4);
  const spot = (lx, lz, kind) => { const [wx, wz] = S.w(lx, lz); out.loot.push({ x: wx, y: hy, z: wz, kind, floor: 0 }); };
  spot(-2.2, 1.7, 'crawler'); spot(3.2, -1.8, 'crawler'); spot(4.6, 0.2, 'prize');
  out.casters.push({ x: s.x, z: s.z, y: y0, h: hy + H - y0, w: 7 });
  return { x: s.x, z: s.z, rot };
}

// ---------------------------------------------------------------------------------------------------------- ribcage landmark
function ribcage(C, S, R, s, rot, out) {
  const y0 = s.y0, yLo = s.yLo, rr = R.float(4.2, 5.4), n = R.int(5, 7), sp = 2.3;
  S.frame(s.x, s.z, rot);
  S.solid('bone', 0, yLo - 0.6, 0, n * sp + 4, y0 - yLo + 0.9, rr * 2 + 1, { tint: 0.8, color: SAND2, uv: 0.3, col: false });   // sand mound
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * sp, sc = 1 - 0.32 * Math.pow(Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1), 2);
    for (let k = 0; k <= 9; k++) {
      const a = (k / 9) * Math.PI, z = Math.cos(a) * rr * sc, y = Math.sin(a) * rr * 0.95 * sc;
      const base = k === 0 || k === 9;
      const w = 0.55 * (1 - 0.2 * Math.abs(k - 4.5) / 4.5);
      const o = { color: BONE, tint: 0.95, uv: 0.3, col: base };
      S.solid('bone', x, y0 + y - 0.35, z, w, base ? 1.4 : 0.85, w, o);
    }
  }
  S.solid('bone', 0, y0 + rr * 0.95 - 0.1, 0, n * sp + 0.6, 0.6, 0.6, { color: BONE, tint: 0.9, uv: 0.3, col: false });                // spine
  // skull at one end
  const sx = (n / 2) * sp + 2.6;
  S.solid('bone', sx, y0 - 0.2, 0, 4.6, 2.6, 3.8, { color: BONE, tint: 1.0, uv: 0.3 });
  S.solid('bone', sx + 1.8, y0 + 2.3, 0, 2.2, 1.1, 3.0, { color: BONE, tint: 0.95, uv: 0.3, col: false });
  for (const sz of [-1, 1]) S.vis('dark', sx + 2.32, y0 + 1.5, sz * 1.0, 0.06, 0.9, 0.8, { col: false, tint: 0.4 });
  out.casters.push({ x: s.x, z: s.z, y: y0, h: rr, w: rr * 2 });
}

// ---------------------------------------------------------------------------------------------------------- camps
function camp(C, S, R, s, out) {
  const y0 = s.y0;
  for (let i = 0; i < 2; i++) {
    const a = R.float(0, TAU), x = s.x + Math.cos(a) * 3.4, z = s.z + Math.sin(a) * 3.4, b = baseOf(C, x, z, 1.6);
    S.frame(x, z, a);
    S.solid('wood', 0, b.y0, 0, 2.4, 1.5, 1.9, { tint: 0.75, color: SAND2 });
    S.vis('wood', 0, b.y0 + 1.5, 0, 2.7, 0.18, 2.2, { col: false, tint: 0.8, color: [0.85, 0.7, 0.55] });
  }
  S.frame(s.x, s.z, 0);
  S.solid('dark', 0, y0, 0, 0.9, 0.22, 0.9, { tint: 0.5 });
  S.vis('glow', 0, y0 + 0.2, 0, 0.35, 0.3, 0.35, { col: false, color: [1, 0.5, 0.1] });
  S.light(0, y0 + 1.0, 0, 0xff8a30, 1.2, 12, 0.4);
  S.solid('rust', 1.6, y0, -1.4, 0.55, 0.85, 0.55, { tint: 0.85 }); S.solid('wood', -1.5, y0, 1.6, 0.9, 0.7, 0.9, { tint: 0.85 });
  out.loot.push({ x: s.x + 1.2, y: y0, z: s.z + 1.6, kind: 'camp', floor: 0 });
}

// ---------------------------------------------------------------------------------------------------------- particles + sky
function sandDrift(C) {
  const n = 700, box = 64, height = 14;
  const P = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[i * 3] = (Math.random() - 0.5) * box; P[i * 3 + 1] = Math.random() * height; P[i * 3 + 2] = (Math.random() - 0.5) * box; ph[i] = Math.random() * TAU; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const m = C.mat(new THREE.PointsMaterial({ size: 0.09, color: 0xe6c88c, transparent: true, opacity: 0.6, depthWrite: false, fog: true }));
  const pts = C.add(C.own(new THREE.Points(g, m)));
  pts.frustumCulled = false;
  let lx = null, lz = null;
  C.updaters.push(guard((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam) return;
    pts.visible = cam.y > -100;
    if (!pts.visible) return;
    pts.position.set(cam.x, cam.y - 2, cam.z);
    const mx = lx === null ? 0 : cam.x - lx, mz = lz === null ? 0 : cam.z - lz;
    lx = cam.x; lz = cam.z;
    const half = box / 2, arr = g.attributes.position.array, gust = 1 + 0.6 * Math.sin(t * 0.25);
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      arr[k] += (5.5 * gust + Math.sin(t + ph[i]) * 0.6) * dt - mx;
      arr[k + 1] += Math.sin(t * 1.3 + ph[i]) * 0.2 * dt;
      arr[k + 2] += (1.6 + Math.cos(t * 0.8 + ph[i]) * 0.5) * dt - mz;
      if (arr[k] > half) arr[k] -= box; else if (arr[k] < -half) arr[k] += box;
      if (arr[k + 2] > half) arr[k + 2] -= box; else if (arr[k + 2] < -half) arr[k + 2] += box;
      if (arr[k + 1] < 0) arr[k + 1] += height; else if (arr[k + 1] > height) arr[k + 1] -= height;
    }
    g.attributes.position.needsUpdate = true;
  }, "twinsun"));
}

function discTexture(C, inner, outer) {
  const tex = makeCanvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(0.38, inner); g.addColorStop(0.5, outer); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  if (tex) C.texs.push(tex);
  return tex;
}

/** two sun discs, fake twin shadows and the heat shimmer (all cosmetic, per-frame updaters) */
function twinSky(C, casters, info) {
  const mk = (tex, scale, color) => {
    const sp = new THREE.Sprite(C.mat(new THREE.SpriteMaterial({ map: tex, color, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })));
    sp.scale.set(scale, scale, 1); sp.renderOrder = -8; sp.frustumCulled = false;
    C.add(sp);
    return sp;
  };
  const sunA = mk(discTexture(C, 'rgba(255,250,225,1)', 'rgba(255,214,140,0.85)'), 62, 0xffffff);
  const sunB = mk(discTexture(C, 'rgba(255,190,110,1)', 'rgba(255,120,60,0.8)'), 38, 0xffffff);
  // twin shadows: 2 instanced unit quads (one per sun); every caster gets a stretched quad per sun
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 0.5);   // origin at one end, +z = length
  const mats = [0, 1].map(() => C.mat(new THREE.MeshBasicMaterial({ color: 0x1a1008, transparent: true, opacity: 0.3, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  const insts = mats.map((m) => { const im = new THREE.InstancedMesh(geo, m, Math.max(1, casters.length)); im.frustumCulled = false; im.count = casters.length; C.add(im); return im; });
  C.geos.push(geo);
  const dirA = new THREE.Vector3(), dirB = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let shadowT = 0, warp = 0, lastWarp = 0;
  info.suns = { a: sunA, b: sunB };
  C.updaters.push(guard((dt, t, game) => {
    const env = game?.env, cam = game?.camera?.position;
    if (!env || !cam) return;
    const day = env.indoor ? 0 : clamp(1 - (env.night ?? 0), 0, 1);
    dirA.copy(env.sunDir);
    // second sun: 0.62 rad further around, a little lower
    const ca = Math.cos(0.62), sa = Math.sin(0.62);
    dirB.set(dirA.x * ca - dirA.z * sa, dirA.y * 0.82 - 0.03, dirA.x * sa + dirA.z * ca).normalize();
    const vis = !env.indoor && env.mode === 'moon';
    sunA.visible = vis && dirA.y > -0.02; sunB.visible = vis && dirB.y > -0.02;
    sunA.position.copy(cam).addScaledVector(dirA, 340); sunB.position.copy(cam).addScaledVector(dirB, 340);
    sunA.material.opacity = sunB.material.opacity = clamp(0.35 + day, 0, 1) * (env.eclipse ? 0.25 : 1);
    // shadows (twice a second)
    shadowT -= dt;
    if (shadowT <= 0) {
      shadowT = 0.5;
      [dirA, dirB].forEach((d, si) => {
        const hz = Math.hypot(d.x, d.z) || 1, ux = -d.x / hz, uz = -d.z / hz, elev = Math.max(0.16, Math.asin(clamp(d.y, -1, 1)));
        const yaw = Math.atan2(ux, uz);
        q.setFromAxisAngle(up, yaw);
        casters.forEach((c, i) => {
          const len = clamp(c.h / Math.tan(elev), 1.5, 30) * (si ? 0.8 : 1);
          pv.set(c.x, c.y + 0.12, c.z); sv.set(c.w, 1, len);
          insts[si].setMatrixAt(i, m4.compose(pv, q, sv));
        });
        insts[si].instanceMatrix.needsUpdate = true;
        mats[si].opacity = day * (si ? 0.24 : 0.32);
        insts[si].visible = day > 0.05 && d.y > 0.02;
      });
    }
    // heat shimmer by day (the lava biome owns engine.fx.warp elsewhere; this biome has no lava)
    const fx = game.engine?.fx;
    if (fx) {
      const want = day * (game.player?.indoor ? 0 : 0.075) * (env.eclipse ? 0.3 : 1);
      warp += (want - warp) * Math.min(1, dt * 1.5);
      if (fx.warp === 0 || Math.abs(fx.warp - lastWarp) < 1e-4) { fx.warp = warp < 0.004 ? 0 : warp; lastWarp = fx.warp; }
    }
  }, "twinsun"));
}

// ---------------------------------------------------------------------------------------------------------- the decor builder
/** decor.info = { kind:'twinsun', cantina:{x,z,y,r,npcSpots,door,yaw}, crawler, camps:[{x,z}], loot:[{x,y,z,kind}], vaporators, ribs } */
export function buildTwinSun(C) {
  const { R, terrain, sc } = C;
  const gb = new FrameGeo();
  const B = { gb, addBox: (...a) => C.addBox(...a), R: new RNG(((C.seed | 0) ^ 0x7015e5) >>> 0), boxes: 0, emitters: [] };
  const S = new Solids(B);
  const out = { loot: [], casters: [] };
  const info = C.info;
  Object.assign(info, { kind: 'twinsun', cantina: null, crawler: null, camps: [], loot: out.loot, vaporators: 0, ribs: 0 });
  const { site, claim, taken } = createSiteFinder(C);
  void terrain;

  // cantina outpost (the moon def flag `cantina` is read by worlds2.js for the NPCs; the building is part of the biome)
  const cs = site(20, 3.0, 120, 1.5);
  if (cs) {
    claim(cs, 21);
    try { info.cantina = cantina(C, S, R, cs, out); } catch (e) { console.warn('cantina', e); }
    if (info.cantina) { C.scrapSpots.push({ x: info.cantina.x + Math.cos(info.cantina.yaw) * 10, z: info.cantina.z + Math.sin(info.cantina.yaw) * 10 }); }
  }
  // sand crawler wreck
  const ws = site(12, 3.0, 100, 1.5);
  if (ws) { claim(ws, 12); try { info.crawler = crawler(C, S, R, ws, R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + R.float(-0.2, 0.2), out); } catch (e) { console.warn('crawler', e); } if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: ws.x + 8, z: ws.z }); }
  // ribcage
  for (let i = 0; i < 1 + (sc > 1.2 ? 1 : 0); i++) {
    const rs = site(12, 4.0, 100, 1.5);
    if (!rs) continue;
    claim(rs, 12);
    try { ribcage(C, S, R, rs, R.float(0, TAU), out); info.ribs++; } catch (e) { console.warn('ribcage', e); }
  }
  // scavenger camps
  for (let i = 0; i < 2 + (sc > 1.15 ? 1 : 0); i++) {
    const s = site(7, 2.5, 80, 1.5);
    if (!s) continue;
    claim(s, 7);
    try { camp(C, S, R, s, out); info.camps.push({ x: s.x, z: s.z, y: s.y0 }); } catch (e) { console.warn('camp', e); }
  }
  // moisture harvesters on the ridges
  const nV = Math.round(9 * sc * sc);
  for (let i = 0; i < nV; i++) {
    const s = site(2.2, 1.6, 40, 1.0);
    if (!s) continue;
    claim(s, 2.2);
    const h = R.float(5.2, 8.0);
    vaporator(S, s.x, s.z, s.y0, s.yLo, h, R.float(0, TAU));
    out.casters.push({ x: s.x, z: s.z, y: s.y0, h: h + 0.6, w: 0.8 });
    info.vaporators++;
  }
  void taken;
  // flush merged geometry
  const mesh = gb.build(w2Material);
  C.add(mesh);
  mesh.traverse((o) => { if (o.geometry) C.geos.push(o.geometry); });
  for (const e of B.emitters) C.emitters.push(e);
  // a few wind-carved boulders / dune scrub (no collision)
  const tufts = [];
  for (let i = 0; i < Math.round(60 * sc * sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (C.avoid(x, z, 1)) continue;
    const s = R.float(0.4, 1.2);
    tufts.push({ x, y: C.h(x, z) - 0.05, z, ry: R.float(0, TAU), sx: s * 0.5, sy: s * R.float(0.8, 1.6), sz: s * 0.5 });
  }
  instanced(C, new THREE.ConeGeometry(1, 1, 5), C.mat(new THREE.MeshLambertMaterial({ color: 0x9a8a50 })), tufts.map((t) => ({ ...t, y: t.y + t.sy * 0.5 })));
  sandDrift(C);
  twinSky(C, out.casters, info);
  info.boxes = B.boxes;
  info.drawCalls = mesh.children.length;
  info.casters = out.casters.length;
}
