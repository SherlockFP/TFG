// THE DEAD MALL (wave 10, docs/wave10/labyr10.md): a liminal abandoned shopping mall for the Algorithm's live stream. Layout = labyr10_plan.js planMall
// (atrium crossing, wide promenade + concourse, shops that open through one arch each). This file: room styles + decorate().
//   look    warm-sick fluorescent light, terrazzo promenade, peach walls, dead shopfronts with parody brand boards (some neon still buzzes), half-lowered
//           roll-down grilles (visual only, never a collider: the arches stay clear), kiosks / planters / benches placed as a soft slalom through the halls
//   hero    the ATRIUM: a dry fountain with a golden thumbs-up statue (guaranteed trophy spot in the basin), dead palms, a dusk skylight and a stalled
//           ESCALATOR (a real ramp, world/stairs.js) up to a mezzanine with elevated loot spots
//   sound   ambience_deadmall (procedural muzak, audio/sfxlib_l10.js) + PA announcements from game/labyr10.js
// Merged static geometry only (one LabBuilder), no THREE lights (LightPool emitters), deterministic from the layout seed (ctx.rng + hash2).
import * as THREE from 'three';
import { layoutKit, SPECIAL_ROOMS } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';
import { doorLanes, makeFree, panel, frameBars } from './labyr10_kit.js';
import { MALL_TYPES } from './labyr10_plan.js';
import { installLabyr10Textures } from '../../render/labyr10_textures.js';

installLabyr10Textures();
for (const ty of MALL_TYPES) SPECIAL_ROOMS.add(ty);

const C_SICK = 0xe0e6a4, C_DIM = 0xc8b878;
const R = (o) => ({ ceil: 'ml_ceil', lamp: 'wall_lamp', lampColor: C_SICK, wall: 'ml_wall', wall_: [], clutter: [], posters: 0, ...o });
const GEN = { floor: 'concrete', wall: 'ml_service', ceil: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true };
const VAULT = { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] };

export const DEADMALL = {
  id: 'deadmall',
  name: 'The Dead Mall',
  blurb: 'Muzak, dead neon and shutters half-down. The stores closed years ago; the Algorithm kept the lights on for you.',
  style: {
    corridor: { floor: 'concrete_stained', wall: 'ml_service', ceil: 'metal_dark', base: null },
    rooms: {
      entrance: R({ floor: 'ml_tile', lamp: 'fluorescent', wall_: ['bench', 'planter', 'vending_machine'], clutter: ['planter', 'cardboard_boxes'], posters: 2 }),
      mall_promenade: R({ floor: 'ml_tile', lamp: null }),
      mall_concourse: R({ floor: 'ml_tile', lamp: null }),
      mall_atrium: R({ floor: 'ml_tile', lamp: null }),
      mall_anchor: R({ floor: 'ml_carpet', rows: 'shelf_metal', rowGap: 0.6, rowMargin: 2.6, wall_: ['suit_rack', 'cupboard', 'curtain_divider'], clutter: ['cardboard_boxes', 'mop_bucket'], posters: 2 }),
      shop_fashion: R({ floor: 'carpet_red', center: ['suit_rack', 'suit_rack'], wall_: ['suit_rack', 'curtain_divider', 'cupboard'], clutter: ['cardboard_boxes'], posters: 2 }),
      shop_tech: R({ floor: 'tiles_white', center: ['table'], wall_: ['monitor_bank', 'shelf_metal', 'copier'], clutter: ['office_chair', 'cardboard_boxes'], posters: 1 }),
      shop_food: R({ floor: 'tiles_checker', center: ['table', 'table'], wall_: ['coffee_machine', 'vending_machine', 'water_cooler', 'cupboard'], clutter: ['mop_bucket', 'wet_floor_sign'], posters: 1 }),
      shop_arcade: R({ floor: 'ml_carpet', lampColor: 0xffb0d8, wall_: ['arcade_cabinet', 'arcade_cabinet', 'slot_machine', 'vending_machine'], clutter: ['cardboard_boxes'], posters: 1 }),
      food_court: R({ floor: 'ml_carpet', rows: 'table', rowGap: 0.7, rowMargin: 2.6, wall_: ['vending_machine', 'coffee_machine', 'planter', 'water_cooler'], clutter: ['mop_bucket', 'wet_floor_sign'], posters: 2 }),
      cinema: R({ floor: 'carpet_red', lamp: 'wall_lamp', lampColor: 0xff9a70, rows: 'armchair', rowGap: 0.2, rowMargin: 2.6, wall_: ['vending_machine', 'planter'], clutter: ['cardboard_boxes'], posters: 3 }),
      generator: GEN,
      vault: VAULT,
      core: VAULT,
      nest: R({ floor: 'ml_carpet', lamp: null, clutter: ['cobweb', 'cardboard_boxes'], webs: true }),
    },
  },
  roomTypes: [['shop_fashion', 4], ['shop_tech', 3], ['shop_food', 3], ['shop_arcade', 3], ['nest', 1], ['food_court', 3, true], ['cinema', 2, true]],
  roomHeight(type) {
    if (type === 'mall_atrium') return 7.6;
    if (type === 'mall_promenade' || type === 'mall_concourse') return 4.6;
    if (type === 'mall_anchor') return 6.0;
    if (type === 'food_court') return 4.8;
    if (type === 'cinema') return 5.0;
    if (type === 'entrance') return 4.2;
    return 3.6;
  },
  layout: { plan: 'wings', arch: 'mall', doorP: 0, blastP: 0, loops: 0.08, bigChance: 0.35, corridorH: 3.0, hub: null, lockedP: 0.1, roomMul: 0.7 },
  lamps: { corridor: 'fluorescent', every: 3, color: C_SICK, flicker: 0.32 },
  lampColor: C_SICK,
  practicals: { corridor: 2 },
  posters: ['poster_missing', 'poster_like', 'poster_hang', 'graffiti', 'poster_delete'],
  landmarks: ['planter', 'vending_machine', 'bench'],
  doorProp: 'door_single',
  corridorScrap: 0.08,
  footstep: { ml_tile: 'tile', ml_carpet: 'carpet', carpet_red: 'carpet', tiles_white: 'tile', tiles_checker: 'tile', concrete_stained: 'concrete' },
  ambience: { base: 'ambience_deadmall', vol: 0.5, buzz: 'lights_buzz', buzzVol: 0.1, env: 'facility' },
  atmosphere: { fog: 0x1a1c0e, density: 0.05 },
  noFlood: MALL_TYPES,
  decorate: decorateMall,
};

const NEON = ['ff3a8c', '38d8ff', 'ffd23a', '7aff6a'];
const HALL = new Set(['promenade', 'concourse']);

function decorateMall(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, rng = ctx.rng;
  const halls = L.rooms.filter((r) => r.mall);
  if (!halls.length) return null;                                   // tiny map: the plan was skipped, ordinary rooms
  const B = new LabBuilder(ctx), lanes = doorLanes(L), free = makeFree(ctx, lanes);
  const lab = { id: 'deadmall', spawnSpots: [], neon: [], hero: null, plans: [], built: null, pa: 'mall' };

  // ------------------------------------------------------------------------------------------------ halls: inlay, beams, pillars, slalom furniture
  let nEm = 0, kiosks = 0, planters = 0, benches = 0;
  for (const r of halls) {
    if (!HALL.has(r.mall)) continue;
    const rc = K.roomRect(r), h = r.height || 4.6, alongX = rc.x1 - rc.x0 >= rc.z1 - rc.z0;
    const mx = (rc.x0 + rc.x1) / 2, mz = (rc.z0 + rc.z1) / 2, len = alongX ? rc.x1 - rc.x0 : rc.z1 - rc.z0, wid = alongX ? rc.z1 - rc.z0 : rc.x1 - rc.x0;
    // inlay stripe down the middle + a brass-coloured border strip against each long wall
    if (alongX) B.floor('m:ml_tile_dark', rc.x0 + 0.4, mz - 0.9, rc.x1 - 0.4, mz + 0.9, Y + 0.012, true, 0.5);
    else B.floor('m:ml_tile_dark', mx - 0.9, rc.z0 + 0.4, mx + 0.9, rc.z1 - 0.4, Y + 0.012, true, 0.5);
    // ceiling beams every 6 m + dead skylight boxes between them
    for (let t = 3; t < len - 1; t += 6) {
      const bx = alongX ? rc.x0 + t : mx, bz = alongX ? mz : rc.z0 + t;
      B.box('m:concrete', bx, Y + h - 0.2, bz, alongX ? 0.4 : wid - 0.05, 0.36, alongX ? wid - 0.05 : 0.4, 0.5);
      if (t + 6 < len) B.floor('g:b8c07e', alongX ? bx + 1.2 : mx - 2.4, alongX ? mz - 2.4 : bz + 1.2, alongX ? bx + 4.8 : mx + 2.4, alongX ? mz + 2.4 : bz + 4.8, Y + h - 0.05, false);
    }
    // pillars on both long sides (visual + solid), clear of every doorway lane
    for (const side of [-1, 1]) for (let t = 6; t < len - 3; t += 8) {
      const px = alongX ? rc.x0 + t : mx + side * (wid / 2 - 1.7), pz = alongX ? mz + side * (wid / 2 - 1.7) : rc.z0 + t;
      if (!free(px - 0.5, pz - 0.5, px + 0.5, pz + 0.5, 0.5)) continue;
      B.solid('m:marble', px, Y + h / 2, pz, 0.8, h, 0.8);
      B.box('m:metal_dark', px, Y + 0.1, pz, 1.0, 0.2, 1.0); B.box('m:metal_dark', px, Y + h - 0.12, pz, 1.0, 0.24, 1.0);
    }
    // slalom: kiosk / planter / bench every 6 m, alternating sides of the centre line (never in front of a shopfront)
    let k = 0;
    for (let t = 4; t < len - 3; t += 6, k++) {
      const off = (k % 2 ? 1 : -1) * Math.min(2.7, wid * 0.22);
      const px = alongX ? rc.x0 + t : mx + off, pz = alongX ? mz + off : rc.z0 + t;
      const kind = hash2(Math.round(px * 3), Math.round(pz * 3), 21), rot = alongX ? 0 : 1;
      if (kind < 0.42) {
        const sx = rot ? 1.6 : 2.4, sz = rot ? 2.4 : 1.6;
        if (!free(px - sx / 2, pz - sz / 2, px + sx / 2, pz + sz / 2, 0.5)) continue;
        B.solid('m:wood_dark', px, Y + 0.55, pz, sx, 1.1, sz);
        B.box('m:marble', px, Y + 1.13, pz, sx + 0.1, 0.06, sz + 0.1, 0.5);
        for (const cx of [-1, 1]) for (const cz of [-1, 1]) B.box('m:metal_dark', px + cx * (sx / 2 - 0.05), Y + 1.6, pz + cz * (sz / 2 - 0.05), 0.07, 1.0, 0.07);
        B.box('m:awning', px, Y + 2.15, pz, sx + 0.5, 0.14, sz + 0.5, 0.6);
        panel(B, `e:ml_sign_${(hash2(Math.round(px), Math.round(pz), 3) * 8) | 0}:302418`, px + (rot ? 0.06 + sx / 2 : 0), Y + 1.5, pz + (rot ? 0 : sz / 2 + 0.06), rot ? 1 : 0, rot ? 0 : 1, Math.min(sx, sz) + 0.3, 0.45);
        B.box(`g:${NEON[(k + 1) & 3]}`, px, Y + 2.06, pz, sx + 0.3, 0.05, sz + 0.3);
        kiosks++;
      } else if (kind < 0.72) {
        if (!free(px - 0.9, pz - 0.9, px + 0.9, pz + 0.9, 0.5)) continue;
        B.solid('m:concrete', px, Y + 0.4, pz, 1.7, 0.8, 1.7);
        B.box('m:dirt', px, Y + 0.82, pz, 1.5, 0.05, 1.5, 0.6);
        for (let s = 0; s < 4; s++) {
          const sx = px + (hash2(s, Math.round(px), 5) - 0.5) * 1.0, sz = pz + (hash2(s, Math.round(pz), 6) - 0.5) * 1.0, sh = 0.9 + hash2(s, Math.round(px + pz), 7) * 1.2;
          B.box('m:bark', sx, Y + 0.8 + sh / 2, sz, 0.1, sh, 0.1);
          B.box('m:grass_dry', sx, Y + 0.8 + sh, sz, 0.55, 0.35, 0.55, 0.9);
        }
        planters++;
      } else {
        const sx = rot ? 0.6 : 1.9, sz = rot ? 1.9 : 0.6;
        if (!free(px - sx / 2, pz - sz / 2, px + sx / 2, pz + sz / 2, 0.5)) continue;
        B.solid('m:wood_planks', px, Y + 0.25, pz, sx, 0.5, sz);
        B.box('m:metal_dark', px + (rot ? 0.28 : 0), Y + 0.7, pz + (rot ? 0 : 0.28), rot ? 0.06 : sx, 0.4, rot ? sz : 0.06);
        benches++;
      }
    }
    // light: two rows of merged ceiling panels (hall lamps are emitters only: fixtures as props cost 3 meshes each) + a sick-white pool every 10 m, a pink neon spill every 16 m
    for (const side of [-1, 1]) for (let t = 3; t < len - 1.5; t += 6) {
      if (hash2(Math.round(t), Math.round(mx + mz) + side, 71) < 0.18) continue;                    // dead panel
      B.box('g:dfe6a6', alongX ? rc.x0 + t : mx + side * 3.2, Y + h - 0.06, alongX ? mz + side * 3.2 : rc.z0 + t, alongX ? 1.8 : 0.5, 0.06, alongX ? 0.5 : 1.8);
    }
    for (let t = 6; t < len - 2; t += 10) ctx.emitters.push({ pos: new THREE.Vector3(alongX ? rc.x0 + t : mx, Y + h - 1.3, alongX ? mz : rc.z0 + t), color: C_SICK, intensity: 0.85, distance: 13, group: 'facility', flicker: hash2(Math.round(t), Math.round(mx), 72) < 0.3 ? 0.35 : 0 });
    for (let t = 8; t < len - 4 && nEm < 8; t += 16, nEm++) ctx.emitters.push({ pos: new THREE.Vector3(alongX ? rc.x0 + t : mx, Y + h - 1.0, alongX ? mz : rc.z0 + t), color: 0xff5aa0, intensity: 0.55, distance: 11, group: 'facility', flicker: 0.25 });
  }
  // shop / court / cinema / anchor rooms: merged ceiling panels at the ordinary lamp grid (the lamps themselves are emitter-only wall_lamp)
  for (const r of L.rooms) {
    if (!(r.shop || r.mall === 'anchor' || /^(shop_|food_court|cinema)/.test(r.type))) continue;
    const rc = K.roomRect(r), nx = Math.max(1, Math.round(r.w / 2)), nz = Math.max(1, Math.round(r.h / 2)), h = r.height || 3.6;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      if (hash2(r.id, a * 7 + b, 73) < 0.22) continue;
      B.box(r.type === 'cinema' ? 'g:d89070' : 'g:cfd692', rc.x0 + (a + 0.5) * (rc.x1 - rc.x0) / nx, Y + h - 0.05, rc.z0 + (b + 0.5) * (rc.z1 - rc.z0) / nz, 0.5, 0.05, 1.4);
    }
  }

  // ------------------------------------------------------------------------------------------------ shopfronts: brand board + half-down grille
  let signs = 0, live = 0, grilles = 0;
  for (const inf of L.edgeInfo.values()) {
    if (inf.type !== 'arch' || inf.a < 0 || inf.b < 0) continue;
    const ra = L.roomOf[inf.a] >= 0 ? L.rooms[L.roomOf[inf.a]] : null, rb = L.roomOf[inf.b] >= 0 ? L.rooms[L.roomOf[inf.b]] : null;
    if (!ra || !rb) continue;
    const hallA = ra.mall && HALL.has(ra.mall), hallB = rb.mall && HALL.has(rb.mall);
    if (hallA === hallB) continue;
    const other = hallA ? rb : ra;
    if (!(other.mall === 'anchor' || /^(shop_|food_court|cinema)/.test(other.type))) continue;   // staff rooms, vaults and nests get no shopfront
    const hallCell = hallA ? inf.a : inf.b, shopCell = hallA ? inf.b : inf.a;
    const hx = hallCell % L.w, hz = (hallCell / L.w) | 0, sx = shopCell % L.w, sz = (shopCell / L.w) | 0;
    const nx = hx - sx, nz = hz - sz;
    const ex = L.ox + inf.cx * C, ez = L.oz + inf.cz * C, dh = inf.doorH, hall = hallA ? ra : rb;
    const brand = (hash2(sx, sz, 11) * 8) | 0, on = hash2(sx, sz, 5) < 0.6, hh = hall.height || 4.6;
    if (dh + 0.28 + 0.75 < hh - 0.1) {
      if (on) {
        panel(B, `e:ml_sign_${brand}:4a3a22`, ex + nx * 0.07, Y + dh + 0.28, ez + nz * 0.07, nx, nz, 3.0, 0.75);
        frameBars(B, `g:${NEON[(hash2(sx, sz, 8) * 4) | 0]}`, ex + nx * 0.09, Y + dh + 0.28, ez + nz * 0.09, nx, nz, 3.0, 0.75);
        live++;
      } else panel(B, `m:ml_sign_${brand}`, ex + nx * 0.07, Y + dh + 0.28, ez + nz * 0.07, nx, nz, 3.0, 0.75);
      signs++;
    }
    if (hash2(sx, sz, 9) < 0.55) {                                    // grille hung from the lintel: visual only, bottom edge 2.0 m
      const gy = Y + dh - 0.9;
      panel(B, 'm:ml_shutter', ex + nx * 0.05, gy, ez + nz * 0.05, nx, nz, inf.width, 0.9);
      panel(B, 'm:ml_shutter', ex - nx * 0.05, gy, ez - nz * 0.05, -nx, -nz, inf.width, 0.9);
      B.box('m:metal_dark', ex, gy, ez, Math.abs(nz) ? inf.width : 0.14, 0.08, Math.abs(nz) ? 0.14 : inf.width);
      grilles++;
    }
  }

  // ------------------------------------------------------------------------------------------------ hero: the atrium
  const at = L.rooms.find((r) => r.mall === 'atrium');
  if (at) {
    const rc = K.roomRect(at), cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2, h = at.height || 7.6;
    // floor rings around the fountain
    for (const [r0, r1] of [[5.0, 5.5], [7.2, 8.0]]) {
      B.floor('m:ml_tile_dark', cx - r1, cz - r1, cx + r1, cz - r0, Y + 0.012, true, 0.5); B.floor('m:ml_tile_dark', cx - r1, cz + r0, cx + r1, cz + r1, Y + 0.012, true, 0.5);
      B.floor('m:ml_tile_dark', cx - r1, cz - r0, cx - r0, cz + r0, Y + 0.012, true, 0.5); B.floor('m:ml_tile_dark', cx + r0, cz - r0, cx + r1, cz + r0, Y + 0.012, true, 0.5);
    }
    // dry fountain: 7 x 7 basin, 0.5 thick walls 0.75 high, a 2.4 m gap in the south wall
    B.solid('m:marble', cx, Y + 0.375, cz - 3.25, 7, 0.75, 0.5); B.solid('m:marble', cx - 3.25, Y + 0.375, cz, 0.5, 0.75, 6); B.solid('m:marble', cx + 3.25, Y + 0.375, cz, 0.5, 0.75, 6);
    B.solid('m:marble', cx - 2.35, Y + 0.375, cz + 3.25, 2.3, 0.75, 0.5); B.solid('m:marble', cx + 2.35, Y + 0.375, cz + 3.25, 2.3, 0.75, 0.5);
    B.box('m:metal_dark', cx, Y + 0.78, cz - 3.25, 7.1, 0.06, 0.6); B.box('m:metal_dark', cx - 3.25, Y + 0.78, cz, 0.6, 0.06, 6.1); B.box('m:metal_dark', cx + 3.25, Y + 0.78, cz, 0.6, 0.06, 6.1);
    B.floor('m:ml_fount', cx - 3.0, cz - 3.0, cx + 3.0, cz + 3.0, Y + 0.02, true, 0.4);
    for (let i = 0; i < 14; i++) B.box('m:ml_gold', cx + (hash2(i, 1, 41) - 0.5) * 5.4, Y + 0.05, cz + (hash2(i, 2, 41) - 0.5) * 5.4, 0.18, 0.05, 0.18, 1);   // wishing-well coins
    // pedestal + column + the golden thumbs-up
    B.solid('m:marble', cx, Y + 0.45, cz, 1.8, 0.9, 1.8); B.box('m:marble', cx, Y + 2.0, cz, 0.7, 2.2, 0.7);
    B.box('m:ml_gold', cx, Y + 3.5, cz, 1.3, 0.9, 0.9, 1); B.box('m:ml_gold', cx - 0.38, Y + 4.25, cz, 0.36, 0.65, 0.4, 1); B.box('m:ml_gold', cx + 0.28, Y + 3.98, cz, 0.7, 0.2, 0.5, 1);
    B.box('g:ffe070', cx, Y + 2.95, cz, 1.5, 0.05, 1.1);
    ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + 5.2, cz), color: 0xffe08a, intensity: 1.0, distance: 14, group: 'facility' });
    // dead palms in the four corners of the hall
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = cx + sx * (rc.x1 - rc.x0) / 2 * 0.78, pz = cz + sz * (rc.z1 - rc.z0) / 2 * 0.8;
      if (!free(px - 0.9, pz - 0.9, px + 0.9, pz + 0.9, 0.4)) continue;
      B.solid('m:concrete', px, Y + 0.4, pz, 1.6, 0.8, 1.6); B.box('m:dirt', px, Y + 0.82, pz, 1.4, 0.05, 1.4, 0.6);
      B.box('m:bark', px, Y + 2.5, pz, 0.28, 3.4, 0.28);
      for (let f = 0; f < 6; f++) { const a = f * 1.05 + hash2(f, Math.round(px), 8); B.rbox('m:grass_dry', px + Math.cos(a) * 0.7, Y + 4.05 - (f % 2) * 0.25, pz + Math.sin(a) * 0.7, 1.7, 0.06, 0.5, -a, 0.9); }
    }
    // dusk skylight + ribs + corner light
    B.floor('g:a2ac7a', rc.x0 + 4, rc.z0 + 4, rc.x1 - 4, rc.z1 - 4, Y + h - 0.06, false);
    for (let t = rc.x0 + 4; t <= rc.x1 - 4 + 0.1; t += 4) B.box('m:metal_dark', t, Y + h - 0.16, cz, 0.25, 0.22, rc.z1 - rc.z0 - 7.6, 0.5);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.emitters.push({ pos: new THREE.Vector3(cx + sx * 9, Y + h - 1.4, cz + sz * 6), color: C_SICK, intensity: 0.9, distance: 15, group: 'facility', flicker: 0.12 });
    // guaranteed trophy spot in the basin + three ordinary spots; the ordinary ones fall back to walkable cells when the nav grid disagrees
    const good = (x, z) => ctx.nav.walkableAt(x, z);
    const basin = [[1.9, -1.9], [-1.9, -1.9], [-1.9, 1.9], [1.9, 1.9], [2.1, 0], [-2.1, 0]];
    let hero = null;
    for (const [dx, dz] of basin) if (good(cx + dx, cz + dz)) { hero = { x: cx + dx, z: cz + dz }; break; }
    if (!hero) hero = { x: cx + 1.9, z: cz + 4.4 };                    // just outside the south gap
    ctx.scrapSpots.push({ x: hero.x, y: Y, z: hero.z, room: at.id, type: 'mall_atrium', dist: 9, item: 'trophy', hero: true });
    for (const [dx, dz] of basin) { const x = cx + dx, z = cz + dz; if (good(x, z) && Math.hypot(x - hero.x, z - hero.z) > 1.2) ctx.scrapSpots.push({ x, y: Y, z, room: at.id, type: 'mall_atrium', dist: 8 }); }
    lab.hero = { room: at.id, x: cx, z: cz, spot: hero, kind: 'fountain' };

    // stalled escalator + mezzanine along the north wall, west of the concourse openings (skipped on a 5-cell atrium: too little room)
    const conc = L.rooms.find((r) => r.mall === 'concourse'), rcC = conc ? K.roomRect(conc) : null;
    const xa0 = rc.x0 + 0.4, xa1 = Math.min(rc.x0 + 7.4, rcC ? rcC.x0 - 0.4 : rc.x0 + 7.4);
    if (xa1 - xa0 >= 6) {
      const dY = Y + 3.6, zd0 = rc.z0 + 0.35, zt = rc.z0 + 3.6, xf = xa0 + 4.4;
      const plan = B.stairs({ x: xf, z: zt + 7.2, y: Y, dir: 'z-', width: 1.6, rise: 3.6, run: 7.2, walls: [-1, 1], tex: 'm:rubber', topLanding: false });
      lab.plans.push(plan);
      B.slab('m:marble', xa0, zd0, xa1, zt + 0.05, dY, 0.25);
      B.box('m:metal_dark', (xa0 + xa1) / 2, dY - 0.4, zt - 0.1, xa1 - xa0, 0.3, 0.2);                                  // fascia
      B.box('g:ffd23a', xf - 0.7, Y + 0.03, zt + 7.55, 0.08, 0.03, 0.6); B.box('g:ffd23a', xf + 0.7, Y + 0.03, zt + 7.55, 0.08, 0.03, 0.6);   // dead step-edge lights
      B.rail(xa0, zt, xf - 0.85, zt, dY); B.rail(xf + 0.85, zt, xa1, zt, dY); B.rail(xa1, zd0, xa1, zt, dY);
      B.box('g:ff3a8c', (xa0 + xa1) / 2, dY - 0.55, zt + 0.02, xa1 - xa0 - 0.6, 0.05, 0.05);
      panel(B, 'e:ml_sign_5:4a3a22', (xa0 + xa1) / 2, dY + 1.2, rc.z0 + 0.2, 0, 1, 3.4, 0.85);                            // board on the wall above the deck
      for (const [dx, dz] of [[1.5, 1.5], [3.4, 1.5], [6.2, 1.9]]) { const x = xa0 + dx, z = zd0 + dz; if (x < xa1 - 0.4) ctx.scrapSpots.push({ x, y: dY, z, room: at.id, type: 'mall_atrium', elevated: true, dist: 9 }); }
      lab.deck = { x0: xa0, x1: xa1, z0: zd0, z1: zt, y: dY };
    }
  }

  // back-of-house shops are where creatures wait: expose a few far interior spots (ordinary nav spawn stays the game's rule)
  for (const r of L.rooms) if (r.type.startsWith('shop_') || r.type === 'food_court' || r.type === 'cinema') lab.spawnSpots.push({ x: K.wx(r.cx) + C / 2, z: K.wz(r.cz) + C / 2, room: r.id, dist: K.roomDist(r) });
  lab.spawnSpots.sort((a, b) => b.dist - a.dist); lab.spawnSpots.length = Math.min(lab.spawnSpots.length, 16);

  const built = B.build('deadmall');
  built.traverse((m) => { if (m.isMesh && m.userData.levelKey === 'g:ff3a8c') lab.neon.push(m); });   // the pink tubes flicker at runtime
  lab.built = built; lab.solids = B.cols;   // solids for the tests: every one is kept out of the door lanes
  lab.stats = { signs, live, grilles, kiosks, planters, benches, halls: halls.length };
  lab.dispose = () => {};
  void rng;
  return { lab };
}
