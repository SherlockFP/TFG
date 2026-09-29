// REPOMAPS (wave 8) - four themed interiors that are NOT a warehouse with pipes. The idea (a hand-themed, room-module level with a strong identity,
// readable silhouettes, physics-comedy props and fragile valuables) is taken from the "themed manor / academy / research station / museum" school of
// co-op extraction levels; every name, texture and prop here is TFG-original and tied to the Algorithm's live stream:
//   influencer  "Influencer Mansion"          a gaudy estate the Algorithm repossessed: ring lights, trophy rooms, fragile sponsored vases (VIRAL loot grows while carried)
//   academy     "Content Academy"             where the Algorithm trains streamers: lecture halls, detention, a library whose shelves SLIDE on rails
//   colddata    "Cold Storage Data Station"   snowy server outpost: freezer halls, ice floors that slide, FROZEN loot that thaws in warm rooms
//   museum      "Museum of Deleted Content"   banned posts as exhibits, laser-grid corridors, ART loot that sets off the alarm when bumped
// Data + a small decorate() per theme only: facility.js generates / builds any theme registered in interiors/index.js. The signature mechanics
// (viral growth, thaw, sliding shelves, exhibit alarm, ice slide, title card) run in src/game/repomaps.js.
import * as THREE from 'three';
import { layoutKit } from './common.js';
import { installStudioTextures } from '../../render/studio_textures.js';
import { SHELF_W, SHELF_D, SHELF_H } from '../../models/studio_props.js';

import { addTranslations } from '../../core/i18n.js';
import { TR, RU } from '../../game/repomaps_text.js';

installStudioTextures();
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

const GEN = { floor: 'concrete', wall: 'concrete_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true };
const VAULT = { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] };
const rectShape = (rng, big) => (big ? [rng.int(4, 6), rng.int(3, 5)] : [rng.int(2, 3), rng.int(2, 3)]);

// ------------------------------------------------------------------------------------------------------------------ Influencer Mansion
const C_PINK = 0xffb8e4, C_GOLD = 0xffe0a0;
export const INFLUENCER = {
  id: 'influencer',
  name: 'Influencer Mansion',
  blurb: 'A gaudy estate the Algorithm repossessed. Ring lights, trophy rooms, sponsored vases. Everything is fragile and everything is watching.',
  sig: 'VIRAL loot grows in value while you carry it, fastest under the studio ring lights. Every bump resets the hype.',
  style: {
    corridor: { floor: 'st_velvet', wall: 'st_pinkgold', ceil: 'wallpaper_damask', base: 'wood_dark' },
    rooms: {
      entrance: { floor: 'marble', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'chandelier', lampColor: C_GOLD, center: ['st:neon_backdrop'], wall_: ['planter', 'armchair', 'st:ring_light'], clutter: ['planter'], posters: 1 },
      atrium: { floor: 'marble', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'chandelier', lampColor: C_GOLD, center: ['st:ring_light', 'st:trophy_case'], wall_: ['st:trophy_case', 'planter', 'st:ring_light', 'armchair'], clutter: ['planter'], posters: 2 },
      studio: { floor: 'st_velvet', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'chandelier', lampColor: C_PINK, center: ['st:ring_light', 'st:neon_backdrop', 'st:ring_light'], wall_: ['st:ring_light', 'armchair', 'planter'], clutter: ['st:ring_light'], posters: 2 },
      trophy_room: { floor: 'marble', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'chandelier', lampColor: C_GOLD, center: ['st:glass_case', 'st:glass_case'], wall_: ['st:trophy_case', 'st:trophy_case', 'st:trophy_case', 'st:glass_case'], clutter: [], posters: 1 },
      lounge: { floor: 'st_velvet', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'chandelier', lampColor: C_PINK, center: ['table', 'armchair'], wall_: ['fireplace', 'armchair', 'planter', 'bookcase'], clutter: ['planter'], posters: 1 },
      bedroom: { floor: 'st_velvet', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'chandelier', lampColor: C_PINK, center: ['table'], wall_: ['bookcase', 'armchair', 'cupboard', 'st:ring_light'], clutter: ['planter'], posters: 1 },
      vanity: { floor: 'st_velvet', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'ceiling_lamp', lampColor: C_PINK, wall_: ['st:ring_light', 'cupboard', 'suit_rack', 'armchair'], clutter: ['st:ring_light'], posters: 1 },
      juice_bar: { floor: 'tiles_checker', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: 'ceiling_lamp', lampColor: C_GOLD, center: ['table'], wall_: ['coffee_machine', 'vending_machine', 'water_cooler', 'planter'], clutter: ['mop_bucket'], posters: 1 },
      generator: GEN,
      vault: VAULT,
      nest: { floor: 'st_velvet', wall: 'st_pinkgold', ceil: 'wallpaper_damask', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains'], webs: true },
    },
  },
  roomTypes: [['studio', 4, true], ['trophy_room', 3, true], ['lounge', 3, true], ['bedroom', 4], ['vanity', 3], ['juice_bar', 2], ['nest', 1]],
  roomHeight(type, rng) { return type === 'atrium' ? rng.float(6.2, 7.0) : type === 'studio' || type === 'trophy_room' ? 4.8 : 3.8; },
  layout: { plan: 'rooms', doorP: 0.8, blastP: 0, loops: 0.4, bigChance: 0.32, corridorH: 3.4, hub: { type: 'atrium', w: 5, h: 4 }, hubAlways: true, lockedP: 0.14, shape: rectShape },
  lamps: { corridor: 'ceiling_lamp', every: 2, color: C_PINK, flicker: 0.06 },
  lampColor: C_PINK,
  posters: ['poster_like', 'poster_hang', 'portrait', 'poster_like'],
  landmarks: ['st:ring_light', 'st:neon_backdrop', 'st:trophy_case'],
  doorProp: 'door_mansion',
  corridorScrap: 0.1,
  footstep: { st_velvet: 'carpet', marble: 'tile', tiles_checker: 'tile' },
  ambience: { base: 'ambience_facility', vol: 0.4, buzz: 'lights_buzz', buzzVol: 0.08, env: 'facility' },
  atmosphere: { fog: 0x16060f, density: 0.06 },
  decorate: decorateGlow(['studio', 'trophy_room'], C_PINK, 1.0),
};

// ------------------------------------------------------------------------------------------------------------------ Content Academy
const C_CHALK = 0xf2f0cc;
export const ACADEMY = {
  id: 'academy',
  name: 'Content Academy',
  blurb: 'Where the Algorithm trains streamers. Lecture halls, detention, a library that will not stay where you left it.',
  sig: 'Library shelves slide on rails: the bell warns, then they shift. Watch the floor rails and do not stand in the track.',
  style: {
    corridor: { floor: 'st_linoleum', wall: 'st_school', ceil: 'ceiling_tiles', base: 'wood_dark' },
    rooms: {
      entrance: { floor: 'st_linoleum', wall: 'st_school', ceil: 'ceiling_tiles', lamp: 'fluorescent', lampColor: C_CHALK, wall_: ['locker', 'locker', 'bench', 'st:blackboard'], clutter: ['cardboard_boxes'], posters: 2 },
      quad: { floor: 'wood_floor', wall: 'st_school', ceil: 'wood_dark', lamp: 'chandelier', lampColor: C_CHALK, center: ['st:lectern'], wall_: ['st:blackboard', 'bench', 'planter', 'bench'], clutter: ['planter'], posters: 2 },
      lecture: { floor: 'st_linoleum', wall: 'st_school', ceil: 'ceiling_tiles', lamp: 'fluorescent', lampColor: C_CHALK, rows: 'st:school_desk', rowGap: 0.35, rowMargin: 2.6, wall_: ['st:blackboard', 'st:blackboard', 'locker'], clutter: ['office_chair'], posters: 1 },
      detention: { floor: 'st_linoleum', wall: 'st_school', ceil: 'ceiling_tiles', lamp: 'fluorescent', lampColor: 0xd0d8a8, center: ['st:school_desk', 'st:school_desk'], wall_: ['st:blackboard', 'locker', 'water_cooler'], clutter: ['mop_bucket'], posters: 1 },
      library: { floor: 'wood_floor', wall: 'st_school', ceil: 'wood_dark', lamp: 'ceiling_lamp', lampColor: 0xffe2a8, wall_: ['bookcase', 'bookcase', 'bookcase', 'bookcase', 'armchair'], clutter: ['cardboard_boxes', 'planter'], posters: 0 },
      cafeteria: { floor: 'tiles_checker', wall: 'st_school', ceil: 'ceiling_tiles', lamp: 'fluorescent', lampColor: C_CHALK, rows: 'table', rowGap: 0.5, rowMargin: 2.6, wall_: ['vending_machine', 'coffee_machine', 'water_cooler'], clutter: ['mop_bucket', 'wet_floor_sign'], posters: 1 },
      locker_room: { floor: 'tiles_dirty', wall: 'st_school', ceil: 'ceiling_tiles', lamp: 'fluorescent', lampColor: 0xd8e8d8, wall_: ['locker', 'locker', 'locker', 'bench'], clutter: ['bench', 'mop_bucket'], posters: 1 },
      principal: { floor: 'carpet_red', wall: 'st_school', ceil: 'ceiling_tiles', lamp: 'ceiling_lamp', lampColor: 0xffe2a8, center: ['desk_computer'], wall_: ['bookcase', 'filing_cabinet', 'grandfather_clock', 'armchair'], clutter: ['office_chair'], posters: 1 },
      generator: GEN,
      vault: VAULT,
      nest: { floor: 'st_linoleum', wall: 'st_school', ceil: 'ceiling_tiles', lamp: null, wall_: [], clutter: ['cobweb', 'st:school_desk'], webs: true },
    },
  },
  roomTypes: [['lecture', 5, true], ['library', 4, true], ['cafeteria', 2, true], ['detention', 3], ['locker_room', 3], ['principal', 2], ['nest', 1]],
  roomHeight(type, rng) { return type === 'quad' ? rng.float(6.0, 6.8) : type === 'library' ? 4.6 : 3.6; },
  layout: { plan: 'wings', doorP: 0.7, blastP: 0.04, loops: 0.32, bigChance: 0.34, corridorH: 3.2, hub: { type: 'quad', w: 5, h: 4 }, hubAlways: true, lockedP: 0.12, shape: rectShape },
  lamps: { corridor: 'fluorescent', every: 2, color: C_CHALK, flicker: 0.14 },
  lampColor: C_CHALK,
  posters: ['poster_safety', 'poster_work', 'poster_missing', 'poster_fish', 'poster_like'],
  landmarks: ['locker', 'st:school_desk', 'st:blackboard'],
  doorProp: 'door_single',
  corridorScrap: 0.08,
  footstep: { st_linoleum: 'tile', wood_floor: 'wood', tiles_checker: 'tile', tiles_dirty: 'tile', carpet_red: 'carpet' },
  ambience: { base: 'ambience_facility', vol: 0.42, buzz: 'lights_buzz', buzzVol: 0.16, env: 'facility' },
  atmosphere: { fog: 0x080a06, density: 0.066 },
  decorate: decorateAcademy,
};

// ------------------------------------------------------------------------------------------------------------------ Cold Storage Data Station
const C_ICE = 0xbfe0ff;
export const COLDDATA = {
  id: 'colddata',
  name: 'Cold Storage Data Station',
  blurb: 'A snowed-in server outpost. Freezer halls, glass-smooth ice, sleepers in the cryo bay. Do not thaw anything.',
  sig: 'FROZEN loot thaws (loses value) in the warm rooms and outside. Freezer floors and ice halls are slippery.',
  ICE_ROOMS: ['freezer', 'ice_hall'],
  COLD_ROOMS: ['freezer', 'ice_hall', 'cold_aisle', 'cryo_bay'],
  style: {
    corridor: { floor: 'metal_plate', wall: 'st_frost', ceil: 'metal_dark', base: null },
    rooms: {
      entrance: { floor: 'metal_plate', wall: 'st_frost', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: C_ICE, wall_: ['locker', 'shelf_metal', 'suit_rack'], clutter: ['cardboard_boxes'], posters: 1 },
      ice_hall: { floor: 'st_icefloor', wall: 'st_frost', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0xa8d8ff, center: ['st:ice_column', 'st:ice_column'], wall_: ['st:ice_column', 'pipe_vertical'], clutter: [], posters: 0 },
      freezer: { floor: 'st_icefloor', wall: 'st_frost', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0xa8d8ff, rows: 'st:frost_rack', rowGap: 0.3, rowMargin: 2.6, wall_: ['pipe_vertical', 'st:frost_rack'], clutter: ['cardboard_boxes', 'pallet'], posters: 0 },
      cold_aisle: { floor: 'metal_plate', wall: 'st_frost', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: C_ICE, rows: 'st:frost_rack', rowGap: 0.25, rowMargin: 2.4, wall_: ['pipe_vertical', 'crac_unit'], clutter: ['cardboard_boxes'], posters: 0 },
      control: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0xffe8c8, center: ['desk_computer'], wall_: ['monitor_bank', 'coffee_machine', 'filing_cabinet', 'water_cooler'], clutter: ['office_chair'], posters: 1 },
      cryo_bay: { floor: 'metal_plate', wall: 'st_frost', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0x9adcff, wall_: ['m5:cryo_pod', 'm5:cryo_pod', 'm5:cryo_pod_open', 'm5:cryo_pod'], clutter: ['m5:ice_cluster'], posters: 0 },
      generator: { ...GEN, floor: 'metal_plate' },
      vault: VAULT,
      nest: { floor: 'st_icefloor', wall: 'st_frost', ceil: 'metal_dark', lamp: null, wall_: [], clutter: ['cobweb', 'm5:ice_cluster'], webs: true },
    },
  },
  roomTypes: [['freezer', 4, true], ['cold_aisle', 4, true], ['ice_hall', 2, true], ['control', 3], ['cryo_bay', 3], ['nest', 1]],
  roomHeight(type, rng) { return type === 'ice_hall' ? rng.float(5.4, 6.4) : type === 'freezer' || type === 'cold_aisle' ? 4.4 : 3.4; },
  layout: { plan: 'wings', doorP: 0.55, blastP: 0.08, loops: 0.34, bigChance: 0.34, corridorH: 3.1, hub: { type: 'ice_hall', w: 4, h: 4 }, hubAlways: true, lockedP: 0.14, shape: rectShape },
  lamps: { corridor: 'fluorescent', every: 2, color: C_ICE, flicker: 0.2 },
  lampColor: C_ICE,
  posters: ['poster_safety', 'poster_missing', 'sign_danger'],
  landmarks: ['st:ice_column', 'st:frost_rack', 'm5:ice_cluster'],
  doorProp: 'blast_door',
  corridorScrap: 0.07,
  footstep: { st_icefloor: 'snow', metal_plate: 'metal', raised_floor: 'metal' },
  ambience: { base: 'ambience_facility', vol: 0.5, buzz: 'ship_hum', buzzVol: 0.2, env: 'facility' },
  atmosphere: { fog: 0x0a1622, density: 0.062 },
  decorate: decorateGlow(['freezer', 'ice_hall', 'cryo_bay'], 0x8cd0ff, 0.9),
};

// ------------------------------------------------------------------------------------------------------------------ Museum of Deleted Content
const C_SPOT = 0xfff0d8;
export const MUSEUM = {
  id: 'museum',
  name: 'Museum of Deleted Content',
  blurb: 'Every banned post, framed and lit. Laser-grid corridors, glass cases, and art that screams when you bump it.',
  sig: 'ART loot sets off the alarm when it is bumped or broken. Laser grids guard the corridors.',
  style: {
    corridor: { floor: 'st_gfloor', wall: 'st_gallery', ceil: 'metal_dark', base: null },
    rooms: {
      entrance: { floor: 'st_gfloor', wall: 'st_gallery', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: C_SPOT, center: ['st:stanchion'], wall_: ['st:art_frame', 'planter', 'bench'], clutter: ['planter'], posters: 1 },
      rotunda: { floor: 'marble', wall: 'st_gallery', ceil: 'metal_dark', lamp: 'chandelier', lampColor: C_SPOT, center: ['st:glass_case', 'st:stanchion'], wall_: ['st:art_frame', 'st:art_frame', 'bench', 'planter'], clutter: [], posters: 1 },
      gallery: { floor: 'st_gfloor', wall: 'st_gallery', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: C_SPOT, center: ['st:glass_case', 'st:stanchion', 'st:glass_case'], wall_: ['st:art_frame', 'st:art_frame', 'st:art_frame', 'bench'], clutter: [], posters: 0 },
      sculpture_hall: { floor: 'st_gfloor', wall: 'st_gallery', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: C_SPOT, rows: 'st:glass_case', rowGap: 1.6, rowMargin: 2.8, wall_: ['st:art_frame', 'bench', 'planter'], clutter: [], posters: 0 },
      banned_wing: { floor: 'st_gfloor', wall: 'st_redacted', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: 0xff9088, center: ['st:glass_case'], wall_: ['st:art_frame', 'st:art_frame', 'st:stanchion'], clutter: [], posters: 0 },
      archive: { floor: 'concrete_dark', wall: 'st_redacted', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: 0xff8070, rows: 'shelf_metal', wall_: ['filing_cabinet', 'shelf_metal'], clutter: ['cardboard_boxes'], posters: 0 },
      restoration: { floor: 'concrete', wall: 'st_gallery', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0xe8f0ff, center: ['table'], wall_: ['shelf_metal', 'sink', 'cupboard'], clutter: ['cardboard_boxes', 'wet_floor_sign'], posters: 0 },
      gift_shop: { floor: 'tiles_checker', wall: 'st_gallery', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: C_SPOT, center: ['table', 'table'], wall_: ['vending_machine', 'shelf_metal', 'sell_counter'], clutter: ['cardboard_boxes'], posters: 1 },
      generator: GEN,
      vault: { ...VAULT, floor: 'st_gfloor' },
      nest: { floor: 'st_gfloor', wall: 'st_gallery', ceil: 'metal_dark', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains'], webs: true },
    },
  },
  roomTypes: [['gallery', 5, true], ['sculpture_hall', 3, true], ['banned_wing', 3], ['archive', 2], ['restoration', 2], ['gift_shop', 2], ['nest', 1]],
  roomHeight(type, rng) { return type === 'rotunda' ? rng.float(6.6, 7.4) : type === 'gallery' || type === 'sculpture_hall' ? 4.8 : 3.6; },
  layout: { plan: 'rooms', doorP: 0.5, blastP: 0.02, loops: 0.42, bigChance: 0.34, corridorH: 3.3, hub: { type: 'rotunda', w: 5, h: 5 }, hubAlways: true, lockedP: 0.12, shape: rectShape },
  lamps: { corridor: 'ceiling_lamp', every: 3, color: C_SPOT, flicker: 0.03 },
  lampColor: C_SPOT,
  posters: ['poster_missing', 'graffiti', 'poster_like'],
  landmarks: ['st:glass_case', 'st:art_frame', 'st:stanchion'],
  doorProp: 'door_single',
  corridorScrap: 0.06,
  footstep: { st_gfloor: 'tile', marble: 'tile', concrete_dark: 'concrete', tiles_checker: 'tile' },
  ambience: { base: 'ambience_facility', vol: 0.38, buzz: 'lights_buzz', buzzVol: 0.06, env: 'facility' },
  atmosphere: { fog: 0x07070b, density: 0.058 },
};

export const STUDIO_THEMES = { influencer: INFLUENCER, academy: ACADEMY, colddata: COLDDATA, museum: MUSEUM };
export const STUDIO_IDS = Object.freeze(Object.keys(STUDIO_THEMES));

// ------------------------------------------------------------------------------------------------------------------ decorate hooks
/** one soft coloured glow (a LightPool emitter, so the scene light count never changes) high in each listed room type */
function decorateGlow(types, color, intensity) {
  return function decorate(ctx) {
    const L = ctx.layout, K = layoutKit(L), Y = ctx.Y;
    for (const r of L.rooms) {
      if (!types.includes(r.type) || r.w * r.h < 6) continue;
      const rc = K.roomRect(r);
      ctx.emitters.push({ pos: new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + r.height - 1.0, (rc.z0 + rc.z1) / 2), color, intensity, distance: 12, group: 'facility' });
    }
  };
}

/** Academy: sliding library shelves. layout.stShelves = [{ obj, colGeo, x: [xA, xB], z, y, at, k }]; src/game/repomaps.js slides them (host warns, everyone moves). */
export const SHELF_GAP = 2.2;   // shelf centre offset from the room centre for the two rail positions
function decorateAcademy(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, rng = ctx.rng;
  L.stShelves = [];
  for (const r of L.rooms) {
    if (r.type !== 'library' || r.maze || r.w < 4 || r.h < 3) continue;
    const rc = K.roomRect(r), cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    const lines = r.h >= 5 ? [-4, 4] : [0];
    for (const dz of lines) {
      const z = cz + dz, k = L.stShelves.length, at = (k + rng.int(0, 1)) % 2;
      const xs = [cx - SHELF_GAP, cx + SHELF_GAP];
      const obj = ctx.placeProp('st:rail_shelf', xs[at], Y, z, rng.chance(0.5) ? 0 : Math.PI, { visualOnly: true });
      if (!obj) continue;
      const col = ctx.addBox(xs[at], Y + SHELF_H / 2, z, SHELF_W, SHELF_H, SHELF_D);
      ctx.nav?.blockBox(cx - SHELF_GAP - SHELF_W / 2, z - SHELF_D / 2, cx + SHELF_GAP + SHELF_W / 2, z + SHELF_D / 2, 0.15);   // both rail ends stay blocked for pathing
      L.stShelves.push({ k, obj, col, x: xs, z, y: Y, at, cur: xs[at], room: r.id });
    }
  }
}
