// WAVE 3 worlds2 - the Soviet panel district (biome `soviet`, decor kind 'soviet'). Built from the biome decor hook (outdoor_biomes.js
// registerDecor), so it shares the terrain's seeded RNG stream, avoid(), colliders, light emitters and disposal.
//
//   * enterable KHRUSHCHYOVKA blocks: 3-4 storeys, 2-3 stair sections (through-going dogleg stairwell, 2 flats per landing, 2 rooms per flat),
//     windows / broken walls / balconies, roof access with parapet, entrance canopy + steps. Every solid is a box (merged: ONE mesh per
//     material key for the whole district) with a Rapier static box. Loot spots + a roof prize are exposed as decor.info.loot.
//   * facade-only skyline blocks (windows drawn on, a few lit), rusted playgrounds (swings, slide, carousel, sandbox), garage rows,
//     heroic statues on plinths, propaganda billboards (one canvas atlas, TFG internet parody), snowdrifts, falling snow.
// Layout uses only C.R (seeded); the canvas atlas / snow particles may use Math.random (visual only).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { getLang } from '../core/i18n.js';
import { makeCanvasTexture } from '../render/textures.js';
import { DECOR_HELPERS } from './outdoor_biomes.js';
import { FrameGeo, Solids, w2Material, groundStats, rectMinus, guard } from './worlds2_solids.js';

const { instanced, TAU } = DECOR_HELPERS;

// ---------------------------------------------------------------------------------------------------------- constants
const FH = 3.0, SLAB = 0.3, T = 0.3;              // storey height, slab thickness, wall thickness
const SEC_HX = 5.8, SEC_HZ = 4.8;                  // section half extents (x along the block, z across it)
const SEC_W = SEC_HX * 2;                          // section width 11.6 m
const CORE = 1.6;                                  // stairwell half width
const LANE_A = -0.8, LANE_B = 0.8, LANE_W = 1.45, STEP_H = 0.3, STEP_D = 0.32, NSTEP = 10;
const PANELS = [[0.96, 0.96, 0.92], [0.9, 0.93, 0.98], [0.98, 0.94, 0.86], [0.86, 0.9, 0.86], [1, 1, 1]];   // prefab panel tints (concrete, blue-grey, cream, green-grey)

const L = (y0, lv) => y0 + FH * lv;
const laneOf = (f) => (f % 2 === 0 ? LANE_A : LANE_B);
const dirOf = (f) => (f % 2 === 0 ? 1 : -1);      // even flights climb +z, odd flights climb -z
/** z of the pad (landing across the whole core) at level lv: +z for odd levels, -z for even ones (level 0 = ground vestibule) */
const padZ = (lv) => (lv % 2 === 1 ? 1 : -1);

// ---------------------------------------------------------------------------------------------------------- one block
/**
 * Build one enterable block in the frame (x, z, rot). site = { x, z, rot, y0, yLo, nSec, nF }. Pushes loot spots into out.loot
 * ({ x, y, z, kind }) and emitters through S.
 */
export function buildBlock(S, site, R, out) {
  const { y0, nSec, nF } = site;
  S.frame(site.x, site.z, site.rot);
  const len = nSec * SEC_W, x0 = -len / 2;
  S.tint = 1;
  // foundation + plinth: reaches below the lowest terrain point under the footprint
  S.solid('stain', 0, site.yLo - 0.8, 0, len + 0.6, y0 - site.yLo + 0.8, SEC_HZ * 2 + 0.6, { uv: 0.4, tint: 0.7 });
  const breachSide = R.pick([-1, 1]);
  for (let k = 0; k < nSec; k++) {
    const sx = x0 + SEC_W * (k + 0.5);
    section(S, site, R, out, k, sx, nSec, breachSide);
  }
  // roof: parapet with a couple of broken gaps, antennas, vent stacks
  const rY = L(y0, nF), pz = SEC_HZ - 0.15;
  for (const sz of [-1, 1]) {
    const ops = [];
    for (let g = 0; g < 2; g++) { const u = R.float(1, len - 4); if (!ops.some((o) => u < o.u1 + 0.6 && u + 2.4 > o.u0 - 0.6)) ops.push({ u0: u, u1: u + R.float(1.2, 2.4), v0: 0, v1: 1.1 }); }
    S.wall('concrete', 'x', sz * pz, x0, len, rY, 1.0, ops, 0.25, { tint: 0.85 });
  }
  for (const sx of [-1, 1]) S.wall('concrete', 'z', sx * (len / 2 - 0.15), -pz, pz * 2, rY, 1.0, [], 0.25, { tint: 0.85 });
  for (let a = 0; a < nSec; a++) {
    const sx = x0 + SEC_W * (a + 0.5) + R.pick([-1, 1]) * R.float(2.6, 4.6);                                     // never above the stairwell (its roof hatch must stay open)
    S.solid('rust', sx, rY, R.float(-3, 3), 0.5, R.float(1.2, 2.2), 0.5, { tint: 0.8 });                       // vent stack
    if (R.chance(0.6)) S.vis('dark', sx + 0.4, rY, -2.6, 0.08, R.float(3.5, 5.5), 0.08, { col: false });          // antenna mast
  }
  // entrance canopy + steps at the ground floor front door of section 0's core (and the last one)
  for (let k = 0; k < nSec; k += Math.max(1, nSec - 1)) {
    const sx = x0 + SEC_W * (k + 0.5);
    S.solid('concrete', sx, y0 + 2.55, -SEC_HZ - 0.65, 3.4, 0.22, 1.5, { tint: 0.85 });
    for (const dx of [-1.55, 1.55]) S.solid('concrete', sx + dx, y0, -SEC_HZ - 1.3, 0.2, 2.55, 0.2, { tint: 0.85 });
    for (let j = 1; j <= 8; j++) {
      const top = y0 - STEP_H * j, sz = -SEC_HZ - 0.4 - 0.4 * j;
      const [wx, wz] = S.w(sx, sz);
      const gh = out.terrain.heightAt(wx, wz);
      if (top <= gh + 0.02) break;
      S.solid('stain', sx, Math.min(gh, top) - 0.4, sz, 1.9, top - Math.min(gh, top) + 0.4, 0.4, { uv: 0.6, tint: 0.85 });
    }
  }
  // roof prize + light at the ground vestibule
  const roofX = x0 + SEC_W * (Math.floor(nSec / 2) + 0.5) + 2.0;
  out.loot.push({ x: S.w(roofX, 1.4)[0], y: rY, z: S.w(roofX, 1.4)[1], kind: 'roof', floor: nF });
}

function section(S, site, R, out, k, sx, nSec, breachSide) {
  const { y0, nF } = site, x0 = sx;
  const tintKey = R.int(0, PANELS.length - 1);
  const col = PANELS[tintKey];
  const stairUnder = (f) => {   // rectangle (section-local) above which the slab of level f+1 needs a headroom cut
    const lane = laneOf(f), z0 = dirOf(f) > 0 ? -CORE + STEP_D * 2 : -CORE, z1 = dirOf(f) > 0 ? CORE : CORE - STEP_D * 2;
    return [x0 + lane - LANE_W / 2 - 0.02, x0 + lane + LANE_W / 2 + 0.02, z0 - 0.02, z1 + 0.02];
  };
  // ---- stairs: full-column steps, one flight per storey
  for (let f = 0; f < nF; f++) {
    const lane = laneOf(f), dir = dirOf(f), base = L(y0, f);
    for (let i = 0; i < NSTEP; i++) {
      const z = dir > 0 ? -CORE + STEP_D * (i + 0.5) : CORE - STEP_D * (i + 0.5), h = STEP_H * (i + 1);
      S.solid('concrete', x0 + lane, base, z, LANE_W, h, STEP_D, { uv: 0.6, tint: 0.9, bottom: false });
    }
  }
  // ---- slabs per level (ground = foundation top): roof and floors, minus the stair headroom cut
  for (let lv = 1; lv <= nF; lv++) {
    const cuts = [stairUnder(lv - 1)];
    for (const r of rectMinus([x0 - SEC_HX, x0 + SEC_HX, -SEC_HZ, SEC_HZ], cuts)) S.slab('concrete', r, L(y0, lv), SLAB, { uv: 0.5, tint: lv === nF ? 0.9 : 0.95 });
  }
  // ---- walls
  const dz = SEC_HZ - T / 2, dx = SEC_HX - T / 2;
  for (let lv = 0; lv < nF; lv++) {
    const yb = L(y0, lv), h = FH - SLAB, cw = { color: col, panel: 2.9 };
    // front (-z) / back (+z) facades with windows; ground floor front / back door of the core
    for (const sz of [-1, 1]) {
      const ops = [];
      for (const fx of [-3.65, 3.65]) {
        const bal = sz > 0 && lv >= 1 && R.chance(0.35);
        const broken = lv >= 1 && R.chance(0.1);
        ops.push(bal ? { u0: SEC_HX + fx - 0.6, u1: SEC_HX + fx + 0.6, v0: 0, v1: 2.15 } : { u0: SEC_HX + fx - 0.7, u1: SEC_HX + fx + 0.7, v0: broken ? 0.3 : 0.9, v1: 2.25 });
        if (bal) out.balconies.push([sx + fx, yb, sz]);
      }
      if (lv === 0) ops.push({ u0: SEC_HX - 0.85, u1: SEC_HX + 0.85, v0: 0, v1: 2.35, door: true });
      else ops.push({ u0: SEC_HX - 0.6, u1: SEC_HX + 0.6, v0: 0.9, v1: 2.1 });
      if (lv >= 2 && R.chance(0.12) && sz === breachSide) ops.push({ u0: 0.4, u1: 0.4 + R.float(2.2, 3.4), v0: R.float(0.3, 1.0), v1: h });   // a wall collapse
      // drop overlapping ops (keep the door)
      const clean = [];
      for (const o of ops.sort((a, b) => (b.door ? 1 : 0) - (a.door ? 1 : 0))) if (!clean.some((q) => o.u0 < q.u1 + 0.4 && o.u1 > q.u0 - 0.4)) clean.push(o);
      wallX(S, 'concrete', sz * dz, x0 - SEC_HX, SEC_W, yb, h, clean, cw);
    }
    // party walls: left of the first section, right of every section; upper floors sometimes breached
    for (const side of k === 0 ? [-1, 1] : [1]) {
      const ops = [];
      if (nSec > 1 && lv >= 1 && R.chance(0.3)) ops.push({ u0: SEC_HZ - 1.2, u1: SEC_HZ + 1.2, v0: 0, v1: 2.3 });
      wallZ(S, 'concrete', x0 + side * dx, -SEC_HZ, SEC_HZ * 2, yb, h, ops, cw);
    }
    // core side walls with a door at the pad end of this level (both flats)
    const pz = padZ(lv);
    for (const side of [-1, 1]) {
      const door = { u0: SEC_HZ + pz * 2.9 - 0.55, u1: SEC_HZ + pz * 2.9 + 0.55, v0: 0, v1: 2.2, door: true };
      const ops = [door];
      if (lv >= 1 && R.chance(0.15)) ops.push({ u0: SEC_HZ - 0.9, u1: SEC_HZ + 0.9, v0: 0, v1: 2.2 });
      wallZ(S, 'concrete', x0 + side * CORE, -SEC_HZ, SEC_HZ * 2, yb, h, ops, { color: col.map((v) => v * 0.94), thick: 0.25 });
    }
    // flat partitions (z = 0) with a doorway
    for (const side of [-1, 1]) {
      const cx = x0 + side * (CORE + (SEC_HX - CORE) / 2);
      const w = SEC_HX - CORE - T / 2;
      wallX(S, 'concrete', 0, cx - w / 2, w, yb, h, [{ u0: w / 2 - 0.5, u1: w / 2 + 0.5, v0: 0, v1: 2.15 }], { color: [0.92, 0.9, 0.84], panel: 3.5, thick: 0.2 });
      // furniture: a bed / wardrobe / table in random rooms (blocks the view, gives cover)
      if (R.chance(0.7)) {
        const rz = R.pick([-3.2, 3.2]);
        S.solid('wood', cx + R.float(-0.4, 0.4), yb, rz, 1.9, 0.5, 0.95, { tint: 0.8 });
        S.vis('paint', cx, yb + 0.5, rz, 1.8, 0.16, 0.9, { color: [0.75, 0.75, 0.85], col: false });
      }
      if (R.chance(0.6)) S.solid('wood', cx + side * 1.3, yb, R.float(-3.6, 3.6), 0.55, 1.9, 1.0, { tint: 0.7 });
      if (R.chance(0.4)) S.solid('wood', cx - side * 0.6, yb, R.float(-1.8, 1.8), 1.1, 0.75, 0.75, { tint: 0.9 });
      // loot spot
      if (R.chance(0.25 + (lv === 0 ? 0.15 : 0))) out.loot.push({ x: S.w(cx, (R.chance(0.5) ? -1 : 1) * 2.2)[0], y: yb, z: S.w(cx, (R.chance(0.5) ? -1 : 1) * 2.2)[1], kind: 'flat', floor: lv });
    }
  }
  // stairwell lights: warm lamp at the ground vestibule (first section), cold light on the 2nd landing
  if (k === 0) { S.light(sx, y0 + 2.4, -3.4, 0xffc27a, 0.9, 9, 0.25); if (nF >= 3) S.light(sx, L(y0, 2) + 2.3, -3.4, 0x9ab8ff, 0.7, 8, 0.1); }
  // balconies on the back wall (slab + rust rails)
  for (const [bx, by, bz] of out.balconies.splice(0)) {
    S.solid('concrete', bx, by - 0.22, SEC_HZ + 0.6, 2.6, 0.22, 1.2, { tint: 0.85 });
    S.vis('rust', bx, by, SEC_HZ + 1.15, 2.6, 0.9, 0.05, { col: false, tint: 0.8 });
    S.col(bx, by, SEC_HZ + 1.15, 2.6, 0.9, 0.12);
    void bz;
  }
}

/** wall along x at z=c, u = position along the section: helper turning the wall() options into the Solids API */
function wallX(S, key, c, xStart, len, y0, h, ops, o = {}) {
  S.wall(key, 'x', c, xStart, len, y0, h, ops, o.thick || T, { color: o.color, panel: o.panel, tint: 1 });
}
function wallZ(S, key, c, zStart, len, y0, h, ops, o = {}) {
  S.wall(key, 'z', c, zStart, len, y0, h, ops, o.thick || T, { color: o.color, panel: o.panel, tint: 1 });
}

// ---------------------------------------------------------------------------------------------------------- facade-only skyline blocks
function buildFacade(S, site, R) {
  S.frame(site.x, site.z, site.rot);
  const len = site.len, h = site.h, hz = 4.8;
  S.solid('stain', 0, site.yLo - 0.6, 0, len, h + (site.y0 - site.yLo) + 0.6, hz * 2, { uv: 0.35, tint: 0.85, color: PANELS[R.int(0, PANELS.length - 1)] });
  for (const sz of [-1, 1]) {
    const nx = Math.floor(len / 3.0), floors = Math.floor(h / FH);
    for (let f = 0; f < floors; f++) for (let i = 0; i < nx; i++) {
      const lit = R.chance(0.08);
      const px = -len / 2 + (i + 0.5) * (len / nx), py = site.y0 + f * FH + 1.0;
      if (lit) S.vis('glow', px, py, sz * (hz + 0.02), 1.1, 1.2, 0.04, { col: false, color: [1, 0.78, 0.45], bottom: false });
      else if (R.chance(0.92)) S.vis('dark', px, py, sz * (hz + 0.02), 1.1, 1.2, 0.04, { col: false, tint: 0.45, bottom: false });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------- props
function playground(S, R, x, z, rot, y) {
  S.frame(x, z, rot);
  const rust = { tint: 0.9 };
  // swing set (two A-frames + top bar + two swings)
  for (const sx of [-1.6, 1.6]) { S.solid('rust', sx, y, 0, 0.12, 2.5, 0.12, { ...rust, col: false }); S.col(sx, y, 0, 0.3, 2.5, 0.3); }
  S.solid('rust', 0, y + 2.4, 0, 3.4, 0.12, 0.12, rust);
  for (const sx of [-0.6, 0.6]) { S.vis('dark', sx, y + 0.5, 0, 0.04, 1.9, 0.04, { col: false }); S.vis('wood', sx, y + 0.42, 0, 0.5, 0.06, 0.24, { col: false, tint: R.chance(0.5) ? 0.8 : 1.0 }); }
  // slide
  const sz = 4.0;
  S.solid('rust', -1.5, y, sz, 0.9, 0.12, 0.9, rust); S.solid('rust', -1.5, y + 1.6, sz, 0.9, 0.12, 0.9, rust);
  S.vis('dark', -1.5, y, sz - 0.4, 0.06, 1.7, 0.06, { col: false }); S.vis('dark', -1.5, y, sz + 0.4, 0.06, 1.7, 0.06, { col: false });
  S.solid('metal', -1.5, y + 0.4, sz + 1.6, 0.6, 0.1, 1.9, { tint: 0.8 });
  // carousel (two crossed boards + hub)
  S.solid('wood', 3.6, y + 0.35, 1.5, 2.6, 0.12, 0.5, { tint: 0.85 }); S.solid('wood', 3.6, y + 0.35, 1.5, 0.5, 0.12, 2.6, { tint: 0.85 }); S.solid('rust', 3.6, y, 1.5, 0.3, 0.5, 0.3, rust);
  // sandbox
  for (const [bx, bz, bw, bd] of [[-3.5, -4.2, 2.6, 0.15], [-3.5, -1.8, 2.6, 0.15], [-4.75, -3.0, 0.15, 2.4], [-2.25, -3.0, 0.15, 2.4]]) S.solid('wood', bx, y, bz, bw, 0.35, bd, { tint: 0.75 });
}

function statue(S, R, x, z, rot, y, variant) {
  S.frame(x, z, rot);
  const steel = variant === 'cosmonaut' ? [0.85, 0.87, 0.9] : [0.7, 0.72, 0.7];
  S.solid('concrete', 0, y - 0.3, 0, 4.2, 1.9, 4.2, { tint: 0.95 });                 // plinth
  S.solid('stain', 0, y + 1.6, 0, 2.9, 1.5, 2.9, { tint: 0.85 });
  S.solid('metal', -0.3, y + 3.1, 0, 0.7, 2.0, 0.55, { color: steel, tint: 0.9 });     // legs
  S.solid('metal', 0.3, y + 3.1, 0, 0.7, 2.0, 0.55, { color: steel, tint: 0.9 });
  S.solid('metal', 0, y + 5.1, 0, 1.6, 2.1, 0.8, { color: steel, tint: 1.0 });        // torso
  S.solid('metal', 0, y + 7.2, 0, 0.75, 0.8, 0.75, { color: steel, tint: 1.05, col: false });   // head / helmet
  if (variant === 'cosmonaut') { S.vis('glow', 0, y + 7.35, 0.4, 0.5, 0.35, 0.05, { col: false, color: [0.5, 0.75, 1] }); S.solid('metal', 0, y + 5.6, -0.7, 1.0, 1.4, 0.5, { color: steel, tint: 0.9, col: false }); }
  S.vis('metal', -1.05, y + 6.0, 0.15, 0.4, 2.6, 0.4, { color: steel, col: false });     // raised arm
  S.vis('metal', 1.05, y + 5.0, 0.2, 0.4, 1.6, 0.4, { color: steel, col: false });
  S.vis('glow', -1.05, y + 8.7, 0.15, 0.55, 0.55, 0.15, { col: false, color: [1, 0.15, 0.1] });   // red star held aloft
  S.vis('glow', -1.05, y + 8.55, 0.15, 0.9, 0.18, 0.12, { col: false, color: [1, 0.15, 0.1] });
}

function garages(S, R, x, z, rot, y, n) {
  S.frame(x, z, rot);
  for (let i = 0; i < n; i++) {
    const gx = (i - (n - 1) / 2) * 3.4;
    S.solid('stain', gx, y, 0, 3.3, 2.6, 5.4, { tint: 0.78, uv: 0.4 });
    const open = R.chance(0.35);
    S.vis('rust', gx, y + 0.1, -2.72, 2.7, open ? 0.6 : 2.3, 0.08, { col: false, tint: 0.95, color: [1, 0.85, 0.7] });
    if (R.chance(0.35)) S.vis('rust', gx, y + 0.1, -2.9, 2.6, 0.5, 0.05, { col: false, tint: 0.5 });
  }
}

// ---------------------------------------------------------------------------------------------------------- billboards (one atlas, one draw call)
const SLOGANS = {
  en: [['THE ALGORITHM', 'PROVIDES'], ['FULFIL THE', 'FIVE-CLICK PLAN!'], ['SHARE THE WORK,', 'SHARE THE MEME'], ['ENGAGEMENT', 'IS STRENGTH'],
    ['COMRADE! HAVE YOU', 'LIKED TODAY?'], ['YOUR SCREEN TIME', 'IS A STATE SECRET'], ['GLORY TO', 'THE UPTIME!'], ['500K FOLLOWERS', 'BY 1991!']],
  tr: [['ALGORITMA', 'SAGLAR'], ['BES-TIKLAMA', 'PLANINI TAMAMLA!'], ['ISI PAYLAS,', 'MEMI PAYLAS'], ['ETKILESIM', 'GUCTUR'],
    ['YOLDAS! BUGUN', 'BEGENDIN MI?'], ['EKRAN SURENIN', 'DEVLET SIRRIDIR'], ['ONLINE KALMAYA', 'SEREFLER OLSUN!'], ['1991\'E KADAR', '500K TAKIPCI!']],
  ru: [['АЛГОРИТМ', 'ОБЕСПЕЧИТ'], ['ВЫПОЛНИМ ПЯТИ-', 'КЛИКОВЫЙ ПЛАН!'], ['ДЕЛИСЬ РАБОТОЙ,', 'ДЕЛИСЬ МЕМОМ'], ['ВОВЛЕЧЁННОСТЬ —', 'ЭТО СИЛА'],
    ['ТОВАРИЩ! ТЫ УЖЕ', 'ЛАЙКНУЛ СЕГОДНЯ?'], ['ЭКРАННОЕ ВРЕМЯ —', 'ГОСТАЙНА'], ['СЛАВА', 'АПТАЙМУ!'], ['500 ТЫСЯЧ', 'К 1991 ГОДУ!']],
};
function slogans() { let l = 'en'; try { l = getLang(); } catch { /* ignore */ } return SLOGANS[l] || SLOGANS.en; }

function makeAtlas(C) {
  const tex = makeCanvasTexture(512, 512, (ctx, w, h) => {
    const list = slogans();
    for (let i = 0; i < 8; i++) {
      const cx = (i % 2) * 256, cy = Math.floor(i / 2) * 128;
      const [a, b] = list[i];
      ctx.fillStyle = i % 3 === 0 ? '#b4160f' : i % 3 === 1 ? '#c8ad70' : '#20242c';
      ctx.fillRect(cx, cy, 256, 128);
      ctx.fillStyle = i % 3 === 1 ? '#7a1010' : '#0c0c0c';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx + 170 + k * 24, cy); ctx.lineTo(cx + 194 + k * 24, cy); ctx.lineTo(cx + 194 + k * 24 - 60, cy + 128); ctx.lineTo(cx + 170 + k * 24 - 60, cy + 128); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = i % 3 === 1 ? '#7a1010' : '#f4e8c8';
      ctx.font = "bold 22px 'Arial Black', Impact, 'TFG Cyr VT', sans-serif"; ctx.textAlign = 'left';
      ctx.fillText(a, cx + 10, cy + 48, 236); ctx.fillText(b, cx + 10, cy + 78, 236);
      ctx.font = "12px 'TFG Cyr VT', monospace"; ctx.fillStyle = i % 3 === 1 ? '#3a1010' : '#e8d8b0';
      ctx.fillText('TFG  *  PLAN 1991-' + (i + 1), cx + 10, cy + 116);
      // star
      ctx.fillStyle = '#ffd230'; const sx = cx + 222, sy = cy + 100;
      ctx.beginPath(); for (let p = 0; p < 10; p++) { const r = p % 2 ? 6 : 14, an = -Math.PI / 2 + (p * Math.PI) / 5; ctx.lineTo(sx + Math.cos(an) * r, sy + Math.sin(an) * r); } ctx.closePath(); ctx.fill();
    }
  });
  if (tex) C.texs.push(tex);
  return tex;
}

function billboards(C, S, list) {
  const tex = makeAtlas(C);
  const pos = [], uv = [], idx = [];
  list.forEach((b, n) => {
    S.frame(b.x, b.z, b.rot);
    for (const sx of [-2.4, 2.4]) S.solid('rust', sx, b.y, 0, 0.5, 8.0, 0.5, { tint: 0.8 });
    S.solid('dark', 0, b.y + 8.0, 0, 6.6, 0.3, 0.7, { tint: 0.7, col: false });
    S.solid('dark', 0, b.y + 3.4, 0.05, 6.2, 4.5, 0.25, { tint: 0.55, col: false });
    const cell = b.cell % 8, u0 = (cell % 2) / 2, v0 = 1 - (Math.floor(cell / 2) + 1) / 4, du = 0.5, dv = 0.25;
    const w = 6.0, h = 3.0, yc = b.y + 5.6, base = pos.length / 3;
    for (const side of [1, -1]) {
      const zz = side * 0.2;
      const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
      const b0 = pos.length / 3;
      for (const [px, py] of pts) { const [wx, wz] = S.w(px * side, zz); pos.push(wx, yc + py, wz); }
      const us = [u0, u0 + du, u0 + du, u0], vs = [v0, v0, v0 + dv, v0 + dv];
      for (let i = 0; i < 4; i++) uv.push(side > 0 ? us[i] : us[i], vs[i]);
      if (side > 0) idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); else idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
    void base; void n;
  });
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = C.mat(new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d8d8, side: THREE.DoubleSide, fog: true }));
  const mesh = C.add(C.own(new THREE.Mesh(g, mat)));
  mesh.frustumCulled = false;
  C.updaters.push(guard((dt, t) => { mat.color.setScalar(0.82 + 0.06 * Math.sin(t * 0.7)); }));
}

// ---------------------------------------------------------------------------------------------------------- snow
function snowfall(C) {
  const n = 1100, box = 64, height = 26;
  const P = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[i * 3] = (Math.random() - 0.5) * box; P[i * 3 + 1] = Math.random() * height; P[i * 3 + 2] = (Math.random() - 0.5) * box; ph[i] = Math.random() * TAU; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const m = C.mat(new THREE.PointsMaterial({ size: 0.11, color: 0xf2f6fa, transparent: true, opacity: 0.85, depthWrite: false, fog: true }));
  const pts = C.add(C.own(new THREE.Points(g, m)));
  pts.frustumCulled = false;
  let lx = null, lz = null;
  C.updaters.push(guard((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam) return;
    pts.visible = cam.y > -100;
    if (!pts.visible) return;
    pts.position.set(cam.x, cam.y - height * 0.35, cam.z);
    const mx = lx === null ? 0 : cam.x - lx, mz = lz === null ? 0 : cam.z - lz;
    lx = cam.x; lz = cam.z;
    const half = box / 2, arr = g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      arr[k] += (0.9 + Math.sin(t * 0.7 + ph[i]) * 0.5) * dt - mx;
      arr[k + 1] -= (1.3 + (i % 5) * 0.12) * dt;
      arr[k + 2] += Math.cos(t * 0.6 + ph[i]) * 0.4 * dt - mz;
      if (arr[k] > half) arr[k] -= box; else if (arr[k] < -half) arr[k] += box;
      if (arr[k + 2] > half) arr[k + 2] -= box; else if (arr[k + 2] < -half) arr[k + 2] += box;
      if (arr[k + 1] < 0) arr[k + 1] += height;
    }
    g.attributes.position.needsUpdate = true;
  }, "soviet"));
}

// ---------------------------------------------------------------------------------------------------------- the decor builder
/** planning + geometry. Exposes decor.info = { kind:'soviet', blocks:[{x,z,rot,nSec,nF,y0}], loot:[{x,y,z,kind,floor}], statues, playgrounds, billboards } */
export function buildSoviet(C) {
  const { R, terrain, sc } = C;
  const gb = new FrameGeo();
  const B = { gb, addBox: (...a) => C.addBox(...a), R: new RNG(((C.seed | 0) ^ 0x5017e7) >>> 0), boxes: 0, emitters: [] };
  const S = new Solids(B);
  const out = { loot: [], balconies: [], terrain };
  const info = C.info;
  Object.assign(info, { kind: 'soviet', blocks: [], loot: out.loot, statues: [], playgrounds: [], billboards: [], garages: [] });
  const hFn = (x, z) => terrain.heightAt(x, z);
  // site search: seeded random points, flat enough, inside the map, clear of the ship / path / exits (C.avoid) and of earlier sites
  const taken = [];
  const site = (radius, tol, tries = 60) => {
    for (let t = 0; t < tries; t++) {
      const x = R.float(-C.lim * 0.82, C.lim * 0.82), z = R.float(-C.lim * 0.82, C.lim * 0.82);
      if (C.avoid(x, z, radius)) continue;
      if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + radius + 3)) continue;
      const gs = groundStats(hFn, x, z, radius * 0.75);
      if (gs.hi - gs.lo > tol) continue;
      return { x, z, lo: gs.lo, hi: gs.hi, y0: gs.hi + 0.05 };
    }
    return null;
  };
  const claim = (s, r) => { taken.push({ x: s.x, z: s.z, r }); C.reserve?.(s.x, s.z, r); };

  // ---- enterable blocks
  const nBlocks = 2 + (sc > 1.15 ? 1 : 0) + (C.moon?.generated && (C.moon.tier || 1) >= 4 ? 1 : 0);
  for (let i = 0; i < nBlocks; i++) {
    const nSec = R.int(2, 3), nF = R.int(3, 4);
    const rad = Math.hypot(nSec * SEC_HX, SEC_HZ) + 4;
    const s = site(rad, 2.4);
    if (!s) continue;
    const rot = R.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + R.float(-0.1, 0.1);
    Object.assign(s, { rot, nSec, nF, yLo: s.lo });
    claim(s, rad);
    S.tint = 1;
    const before = out.loot.length;
    try { buildBlock(S, s, new RNG((((C.seed | 0) ^ 0x51c0 ^ ((i + 1) * 7919)) >>> 0)), out); } catch (e) { console.warn('soviet block', e); }
    // keep the loot list bounded per block (roof prize always survives)
    const mine = out.loot.splice(before);
    const roof = mine.filter((m) => m.kind === 'roof'), flats = mine.filter((m) => m.kind !== 'roof').slice(0, 3);
    out.loot.push(...flats, ...roof);
    info.blocks.push({ x: s.x, z: s.z, rot, nSec, nF, y0: s.y0 });
    // loot outside the entrance for the outdoor scrap logic (terrain uses decor.scrapSpots, max 2)
    if (C.scrapSpots.length < 2) { const [wx, wz] = S.w(0, -SEC_HZ - 2.6); C.scrapSpots.push({ x: wx, z: wz }); }
  }
  // ---- facade skyline blocks (walls of a distant estate)
  for (let i = 0; i < 3 + (sc > 1.15 ? 1 : 0); i++) {
    const len = R.pick([24, 36]), h = R.pick([12, 15]);
    const rad = len / 2 + 4;
    const s = site(rad, 3.0);
    if (!s) continue;
    Object.assign(s, { rot: R.pick([0, Math.PI / 2]) + R.float(-0.08, 0.08), len, h, yLo: s.lo });
    claim(s, rad);
    try { buildFacade(S, s, R); } catch (e) { console.warn('soviet facade', e); }
  }
  // ---- playgrounds, garages, statues, billboards
  for (let i = 0; i < 2 + (sc > 1.15 ? 1 : 0); i++) {
    const s = site(7.5, 1.4);
    if (!s) continue;
    claim(s, 7.5);
    playground(S, R, s.x, s.z, R.float(0, TAU), s.hi + 0.02);
    info.playgrounds.push({ x: s.x, z: s.z });
  }
  for (let i = 0; i < 2; i++) {
    const s = site(11, 1.6);
    if (!s) continue;
    claim(s, 11);
    const rot = R.pick([0, Math.PI / 2]);
    garages(S, R, s.x, s.z, rot, s.hi + 0.02, R.int(4, 6));
    info.garages.push({ x: s.x, z: s.z });
    if (C.scrapSpots.length < 2 && R.chance(0.5)) C.scrapSpots.push({ x: s.x, z: s.z - 4 });
  }
  const nSt = 2 + (sc > 1.15 ? 1 : 0);
  for (let i = 0; i < nSt; i++) {
    const s = site(5.5, 1.2);
    if (!s) continue;
    claim(s, 5.5);
    statue(S, R, s.x, s.z, R.float(0, TAU), s.hi + 0.02, R.chance(0.4) ? 'cosmonaut' : 'worker');
    info.statues.push({ x: s.x, z: s.z });
  }
  const bills = [];
  for (let i = 0; i < 4 + Math.round((sc - 1) * 4); i++) {
    const s = site(5, 2.0);
    if (!s) continue;
    claim(s, 5);
    bills.push({ x: s.x, z: s.z, rot: R.float(0, TAU), y: s.hi, cell: i + R.int(0, 3) });
    info.billboards.push({ x: s.x, z: s.z });
  }
  billboards(C, S, bills);

  // ---- flush the merged geometry: ONE mesh per material key for the whole district
  const mesh = gb.build(w2Material);
  C.add(mesh);
  mesh.traverse((o) => { if (o.geometry) C.geos.push(o.geometry); });
  for (const e of B.emitters) C.emitters.push(e);
  // ---- snowdrifts (no collision) + snowfall
  const drifts = [];
  for (let i = 0; i < Math.round(46 * sc * sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (C.avoid(x, z, 1) || taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) continue;
    const s = R.float(1.2, 3.4);
    drifts.push({ x, y: C.h(x, z) - s * 0.28, z, ry: R.float(0, TAU), sx: s * R.float(1, 1.8), sy: s * 0.34, sz: s });
  }
  instanced(C, new THREE.SphereGeometry(1, 7, 5), C.mat(new THREE.MeshLambertMaterial({ color: 0xe6edf4 })), drifts);
  snowfall(C);
  info.boxes = B.boxes;
  info.drawCalls = mesh.children.length;
  // slow flicker of the lit windows / stairwell lamps is handled by the light pool flicker field
}
