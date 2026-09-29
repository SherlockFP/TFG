// [labyrinths] HERO ROOMS for the older themes: one memorable set piece per theme (two for the mansion), dropped into an existing big room of the
// right type AFTER the theme decoration. Merged geometry only (LabBuilder), emissive lamps (no THREE lights), pillars / low solids only where the
// nav grid is free (navClear), so nothing lands inside a prop and no corridor gets blocked. Also a light generic variation pass (ceiling beams,
// floor inlays, wall pilasters) so ordinary rooms stop being plain boxes.
//   factory     crusher hall      two hanging presses over a conveyor, hazard stripes, red warning lamps
//   mansion     ballroom          checkerboard floor, a chandelier ring of candle glow, corner pillars, tall moonlit windows on the walls
//               portrait hall     pilasters + a run of emissive stained windows
//   mineshaft   crystal grotto    emissive crystal clusters + stalagmite columns
//   office      collapsed floor   fallen ceiling slabs, rubble, hanging tiles and a shaft of daylight
//   serverfarm  cold aisle        glowing floor rails, ceiling light bars, frost haze planes
//   sewer       waterfall junction a translucent water sheet falling from an outlet into a foaming pool
//   hospital    operating theatre a surgical lamp disc, tiered observation steps and a glass gallery
import * as THREE from 'three';
import { layoutKit, navClear } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';

const HERO_TYPES = {
  factory: ['storage', 'boiler'], mansion: ['hall', 'gallery', 'dining'], mineshaft: ['cavern', 'flooded_cave', 'crystal'], office: ['cubicles', 'conference', 'storage'],
  serverfarm: ['server_hall', 'racks', 'aisle', 'cold_aisle', 'hall'], sewer: ['junction', 'cistern', 'overflow'], hospital: ['ward', 'operating', 'pharmacy'],
};
const NO_HERO = new Set(['entrance', 'vault', 'generator', 'core', 'nest']);

/** ordered candidate rooms: preferred types first, then any large ordinary room; bigger and farther from the entrance first */
function candidates(L, theme, need) {
  const pref = HERO_TYPES[theme] || [];
  const ok = (r) => !NO_HERO.has(r.type) && !r.arena && !r.maze && !r.treasure && !String(r.type).startsWith('m2_') && !String(r.type).startsWith('lim_') && r.w * r.h >= need && r.w >= 2 && r.h >= 2;
  const score = (r) => (pref.includes(r.type) ? 1000 : 0) + r.w * r.h * 4 + (L.distOf[L.idx(r.cx, r.cz)] || 0);
  return L.rooms.filter(ok).sort((a, b) => score(b) - score(a) || a.id - b.id);
}

export function decorateHeroes(ctx) {
  const L = ctx.layout, theme = L.theme;
  if (globalThis.__kefalHeroOff || !HEROES[theme] || L.opts?.arena) return null;
  const K = layoutKit(L), B = new LabBuilder(ctx), out = [];
  const used = new Set();
  for (const [name, need, fn] of HEROES[theme]) {
    const r = candidates(L, theme, need).find((q) => !used.has(q.id));
    if (!r) continue;
    used.add(r.id);
    const rc = K.roomRect(r);
    if (fn(B, ctx, K, r, rc, r.height || L.heightOf[L.idx(r.cx, r.cz)] || 4)) { r.hero = name; out.push({ name, room: r.id }); }
  }
  variation(B, ctx, K, used);
  B.build('heroes');
  return { rooms: out };
}

// ------------------------------------------------------------------------------------------------ variation pass
function variation(B, ctx, K, skip) {
  const L = ctx.layout, Y = ctx.Y, th = L.theme;
  const beam = th === 'mansion' ? 'm:wood_dark' : th === 'sewer' ? 'm:concrete_dark' : 'm:metal_dark';
  for (const r of L.rooms) {
    if (NO_HERO.has(r.type) || skip.has(r.id) || r.maze || String(r.type).startsWith('lim_') || r.w * r.h < 6) continue;
    const rc = K.roomRect(r), h = r.height || 4;
    const roll = hash2(r.id, L.seed & 0xffff, 21);
    if (roll < 0.45 && h >= 3.2) {   // exposed ceiling beams across the short axis
      const alongX = rc.x1 - rc.x0 >= rc.z1 - rc.z0;
      for (let a = 3; a < (alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0) - 1; a += 4) {
        if (alongX) B.box(beam, rc.x0 + a, Y + h - 0.2, (rc.z0 + rc.z1) / 2, 0.35, 0.34, rc.z1 - rc.z0 - 0.1, 0.5);
        else B.box(beam, (rc.x0 + rc.x1) / 2, Y + h - 0.2, rc.z0 + a, rc.x1 - rc.x0 - 0.1, 0.34, 0.35, 0.5);
      }
    }
    if (roll > 0.3 && roll < 0.8) {   // floor inlay (a contrasting rug / tile patch) - flat, walkable
      const tex = th === 'mansion' ? 'm:carpet_red' : th === 'hospital' || th === 'office' ? 'm:tiles_checker' : 'm:metal_plate';
      B.floor(tex, rc.x0 + 1.6, rc.z0 + 1.6, rc.x1 - 1.6, rc.z1 - 1.6, Y + 0.011, true, 0.5, [0.8, 0.8, 0.8]);
    }
    if (roll > 0.62 && h >= 3.4) {   // wall pilasters on closed edges (visual)
      for (const e of K.perimeter(r)) {
        if (K.edgeBusy(e.x, e.z, e.d) || hash2(e.x, e.z, e.d + 30) > 0.35) continue;
        const [px, pz] = K.wallPoint(e.x, e.z, e.d, (hash2(e.x, e.z, 31) - 0.5) * 1.6, 0.13);
        B.box(beam, px, Y + h / 2, pz, e.d & 1 ? 0.5 : 0.26, h, e.d & 1 ? 0.26 : 0.5, 0.5);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ hero builders (return true when placed)
const centre = (rc) => [(rc.x0 + rc.x1) / 2, (rc.z0 + rc.z1) / 2];
const free = (ctx, x, z, hx, hz, pad = 0.5) => navClear(ctx.nav, x - hx, z - hz, x + hx, z + hz, pad);

function crusher(B, ctx, K, r, rc, h) {
  const Y = ctx.Y, [cx, cz] = centre(rc);
  const alongX = rc.x1 - rc.x0 >= rc.z1 - rc.z0;
  const put = (a, b) => (alongX ? [cx + a, cz + b] : [cx + b, cz + a]);
  let n = 0;
  for (const a of [-3.2, 3.2]) {
    const [x, z] = put(a, 0);
    if (!free(ctx, x, z, 1.6, 1.6, 0.4)) continue;
    for (const s of [-1.35, 1.35]) { const [px, pz] = put(a, s); B.solid('m:metal_rust', px, Y + h * 0.5, pz, 0.6, h, 0.6); }
    B.box('m:hazard_stripes', x, Y + 2.7, z, alongX ? 2.6 : 2.6, 0.55, 2.6, 0.6);          // the press plate hangs above head height
    B.box('m:metal_dark', x, Y + h - 0.4, z, alongX ? 0.5 : 3.2, 0.6, alongX ? 3.2 : 0.5, 0.5);
    B.box('g:ff2a20', x, Y + 3.05, z + 1.36, 0.2, 0.2, 0.08); B.box('g:ff2a20', x, Y + 3.05, z - 1.36, 0.2, 0.2, 0.08);
    n++;
  }
  if (!n) return false;
  const [bx, bz] = put(0, 0);
  if (free(ctx, bx, bz, alongX ? 2.6 : 0.7, alongX ? 0.7 : 2.6, 0.4)) {
    B.solid('m:metal_dark', bx, Y + 0.3, bz, alongX ? 5.2 : 1.2, 0.6, alongX ? 1.2 : 5.2);
    B.box('g:ffb030', bx, Y + 0.62, bz, alongX ? 5.0 : 0.05, 0.03, alongX ? 0.05 : 5.0);
  }
  ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + h - 1.0, cz), color: 0xff6a3a, intensity: 0.8, distance: 12, group: 'facility' });
  return true;
}

function ballroom(B, ctx, K, r, rc, h) {
  const Y = ctx.Y, [cx, cz] = centre(rc);
  const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
  B.floor('m:tiles_checker', rc.x0 + 0.6, rc.z0 + 0.6, rc.x1 - 0.6, rc.z1 - 0.6, Y + 0.013, true, 0.5, [0.55, 0.5, 0.5]);
  // chandelier: a ring of candle glow hanging from a chain, high above the dancers
  const cy = Y + Math.max(3.2, h - 1.3);
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; B.box('g:ffd9a0', cx + Math.cos(a) * 1.5, cy, cz + Math.sin(a) * 1.5, 0.16, 0.34, 0.16); }
  B.box('m:gold', cx, cy - 0.15, cz, 3.2, 0.08, 0.08, 0.5); B.box('m:gold', cx, cy - 0.15, cz, 0.08, 0.08, 3.2, 0.5);
  B.box('m:metal_dark', cx, (cy + Y + h) / 2, cz, 0.06, Y + h - cy, 0.06, 0.5);
  ctx.emitters.push({ pos: new THREE.Vector3(cx, cy - 0.4, cz), color: 0xffcf90, intensity: 1.3, distance: 16, group: 'facility' });
  // corner pillars (only where free) + tall moonlit windows on the closed long walls
  for (const [px, pz] of [[rc.x0 + 1.5, rc.z0 + 1.5], [rc.x1 - 1.5, rc.z0 + 1.5], [rc.x0 + 1.5, rc.z1 - 1.5], [rc.x1 - 1.5, rc.z1 - 1.5]]) if (free(ctx, px, pz, 0.5, 0.5, 0.35)) B.solid('m:marble', px, Y + h / 2, pz, 0.8, h, 0.8);
  let win = 0;
  for (const e of K.perimeter(r)) {
    if (K.edgeBusy(e.x, e.z, e.d) || win >= 6 || hash2(e.x, e.z, e.d + 50) > 0.6) continue;
    const [px, pz] = K.wallPoint(e.x, e.z, e.d, 0, 0.05);
    const axisZ = e.d === 1 || e.d === 3;
    B.box('g:7f9cff', px, Y + Math.min(h - 0.8, 2.6), pz, axisZ ? 1.3 : 0.05, 2.6, axisZ ? 0.05 : 1.3);
    win++;
  }
  return w > 4 && d > 4;
}

function portraitHall(B, ctx, K, r, rc, h) {
  const Y = ctx.Y;
  let n = 0;
  for (const e of K.perimeter(r)) {
    if (K.edgeBusy(e.x, e.z, e.d) || hash2(e.x, e.z, e.d + 70) > 0.75) continue;
    const [px, pz] = K.wallPoint(e.x, e.z, e.d, 0, 0.06), axisZ = e.d === 1 || e.d === 3;
    B.box('g:c85a5a', px, Y + 2.0, pz, axisZ ? 0.9 : 0.05, 1.4, axisZ ? 0.05 : 0.9); B.box('g:5a8ac8', px, Y + 2.0, pz + (axisZ ? 0 : 0.9), axisZ ? 0.05 : 0.05, 1.0, axisZ ? 0.05 : 0.05);
    for (const s of [-1.05, 1.05]) B.box('m:wood_dark', px + (axisZ ? s : 0), Y + h / 2, pz + (axisZ ? 0 : s), axisZ ? 0.3 : 0.3, h, axisZ ? 0.3 : 0.3, 0.5);
    n++;
  }
  return n > 1;
}

function grotto(B, ctx, K, r, rc, h) {
  const Y = ctx.Y, [cx, cz] = centre(rc);
  let n = 0;
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + 0.3, rad = 1.6 + (i % 3) * 1.3, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
    if (x < rc.x0 + 1 || x > rc.x1 - 1 || z < rc.z0 + 1 || z > rc.z1 - 1) continue;
    const hh = 1.2 + hash2(i, r.id, 5) * 1.8, col = i % 2 ? 'g:6affd0' : 'g:a89aff';
    if (free(ctx, x, z, 0.3, 0.3, 0.3)) { B.rbox(col, x, Y + hh / 2, z, 0.34, hh, 0.34, a, 0.5); B.solid('m:rock', x, Y + 0.25, z, 0.7, 0.5, 0.7); n++; }
  }
  if (n) ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + 1.4, cz), color: 0x80ffd8, intensity: 1.0, distance: 13, group: 'facility' });
  return n > 2;
}

function collapsed(B, ctx, K, r, rc, h) {
  const Y = ctx.Y, [cx, cz] = centre(rc);
  const rng = ctx.rng;
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const x = cx + rng.float(-3, 3), z = cz + rng.float(-3, 3);
    if (x < rc.x0 + 1.4 || x > rc.x1 - 1.4 || z < rc.z0 + 1.4 || z > rc.z1 - 1.4 || !free(ctx, x, z, 0.9, 0.9, 0.3)) continue;
    B.solid('m:concrete_stained', x, Y + 0.3, z, 1.5, 0.6, 1.3);
    B.rbox('m:ceiling_tiles', x + 0.2, Y + 0.68, z, 1.3, 0.08, 1.1, rng.float(0, 3), 0.5);
    n++;
  }
  for (let i = 0; i < 6; i++) B.rbox('m:ceiling_tiles', cx + rng.float(-3, 3), Y + h - 0.5 - rng.float(0, 0.4), cz + rng.float(-3, 3), 1.1, 0.06, 0.9, rng.float(0, 3), 0.5);
  B.box('t:-:ffe9b0:0.13', cx, Y + h / 2, cz, 2.4, h, 2.4, 0.5);                       // the shaft of daylight through the hole
  B.box('g:fff4d0', cx, Y + h - 0.05, cz, 2.4, 0.05, 2.4);
  ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + h - 0.8, cz), color: 0xfff0c0, intensity: 1.2, distance: 14, group: 'facility' });
  return n > 1;
}

function coldAisle(B, ctx, K, r, rc, h) {
  const Y = ctx.Y, [cx, cz] = centre(rc);
  const alongX = rc.x1 - rc.x0 >= rc.z1 - rc.z0;
  for (const s of [-0.8, 0.8]) B.box('g:6ad8ff', alongX ? cx : cx + s, Y + 0.02, alongX ? cz + s : cz, alongX ? rc.x1 - rc.x0 - 1.2 : 0.06, 0.02, alongX ? 0.06 : rc.z1 - rc.z0 - 1.2);
  for (let a = 1.5; a < (alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0) - 1; a += 3) B.box('g:cfeeff', alongX ? rc.x0 + a : cx, Y + h - 0.12, alongX ? cz : rc.z0 + a, alongX ? 0.2 : 2.4, 0.06, alongX ? 2.4 : 0.2);
  B.box('t:-:bfe8ff:0.1', cx, Y + 0.5, cz, rc.x1 - rc.x0 - 1.0, 1.0, rc.z1 - rc.z0 - 1.0, 0.5);
  ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + h - 0.8, cz), color: 0x8fdcff, intensity: 1.0, distance: 13, group: 'facility' });
  return true;
}

function waterfall(B, ctx, K, r, rc, h) {
  const Y = ctx.Y;
  let best = null;
  for (const e of K.perimeter(r)) { if (!K.edgeBusy(e.x, e.z, e.d) && (!best || hash2(e.x, e.z, 61) > best.s)) best = { e, s: hash2(e.x, e.z, 61) }; }
  if (!best) return false;
  const e = best.e, [px, pz] = K.wallPoint(e.x, e.z, e.d, 0, 0.5), axisZ = e.d === 1 || e.d === 3;
  const top = Y + Math.min(h - 0.6, 4.6);
  B.box('m:sewer_brick', ...(axisZ ? [px, top, pz + (e.d === 1 ? 0.3 : -0.3)] : [px + (e.d === 0 ? 0.3 : -0.3), top, pz]), axisZ ? 1.6 : 0.5, 0.9, axisZ ? 0.5 : 1.6);   // the outlet
  B.box('t:water:8ac8b0:0.55', px, (top + Y) / 2, pz, axisZ ? 1.2 : 0.14, top - Y, axisZ ? 0.14 : 1.2, 0.5);
  for (let i = 0; i < 5; i++) B.box('g:dff4ff', px + (axisZ ? (i - 2) * 0.22 : 0), Y + 0.9 + i * 0.7, pz + (axisZ ? 0 : (i - 2) * 0.22), 0.04, 0.5, 0.04);
  B.box('t:water:6a9a88:0.7', px, Y + 0.08, pz, axisZ ? 3.0 : 2.4, 0.06, axisZ ? 2.4 : 3.0, 0.5);   // foaming pool at the foot
  return true;
}

function theatre(B, ctx, K, r, rc, h) {
  const Y = ctx.Y, [cx, cz] = centre(rc);
  B.box('g:fff6e6', cx, Y + Math.min(h - 0.5, 3.4), cz, 1.7, 0.08, 1.7);
  B.box('m:metal', cx, (Y + h + Y + Math.min(h - 0.5, 3.4)) / 2, cz, 0.08, h - Math.min(h - 0.5, 3.4), 0.08, 0.5);
  ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + Math.min(h - 0.5, 3.4) - 0.3, cz), color: 0xfff6e6, intensity: 1.5, distance: 12, group: 'facility' });
  // observation gallery: two low steps along the longest closed wall + glass panes (0.3 m risers stay under the 0.42 autostep)
  let placed = false;
  for (const e of K.perimeter(r)) {
    if (placed || K.edgeBusy(e.x, e.z, e.d)) continue;
    const [px, pz] = K.wallPoint(e.x, e.z, e.d, 0, 0.6), axisZ = e.d === 1 || e.d === 3;
    if (!free(ctx, px, pz, axisZ ? 1.9 : 0.6, axisZ ? 0.6 : 1.9, 0.2)) continue;
    B.solid('m:tiles_white', px, Y + 0.15, pz, axisZ ? 3.6 : 1.2, 0.3, axisZ ? 1.2 : 3.6);
    const [qx, qz] = K.wallPoint(e.x, e.z, e.d, 0, 0.2);
    B.solid('m:tiles_white', qx, Y + 0.3, qz, axisZ ? 3.6 : 0.5, 0.6, axisZ ? 0.5 : 3.6);
    B.box('t:glass:bfe8ff:0.25', px, Y + 1.5, pz + (axisZ ? (e.d === 1 ? -0.55 : 0.55) : 0), axisZ ? 3.6 : 0.05, 1.0, axisZ ? 0.05 : 3.6);
    placed = true;
  }
  return true;
}

const HEROES = {
  factory: [['crusher_hall', 12, crusher]],
  mansion: [['ballroom', 12, ballroom], ['portrait_hall', 6, portraitHall]],
  mineshaft: [['crystal_grotto', 9, grotto]],
  office: [['collapsed_floor', 12, collapsed]],
  serverfarm: [['cold_aisle', 8, coldAisle]],
  sewer: [['waterfall_junction', 9, waterfall]],
  hospital: [['operating_theatre', 6, theatre]],
};
