// OFFICE interior - "Corporate Intranet" (analogue of the Lethal Company "Office" interior mod).
// Long carpeted corridors (wing plan) with rooms hanging off them: cubicle farms, conference rooms,
// manager offices, copy rooms, a server closet and, in the middle of the building, the ELEVATOR HUB -
// a tall lobby lined with dead elevators that is visible from far away (landmark).
import * as THREE from 'three';
import { layoutKit, WALL_ROT } from './common.js';

const C_LAMP = 0xeaf4ff;

export const OFFICE = {
  id: 'office',
  name: 'Corporate Intranet',
  blurb: 'Cubicle farms and dead elevators. The quarterly review never ended.',
  style: {
    corridor: { floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', base: 'wood_dark' },
    rooms: {
      entrance: { floor: 'marble', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['reception_desk'], wall_: ['planter', 'water_cooler', 'bench', 'planter'], clutter: ['wet_floor_sign'], posters: 1 },
      cubicles: { floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', grid: { id: 'cubicle', step: 3.6, margin: 2.6, skip: 0.1 }, wall_: ['filing_cabinet', 'water_cooler', 'planter', 'copier', 'whiteboard'], clutter: ['cardboard_boxes', 'ext:psx_trash_bag'], posters: 2 },
      conference: { floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['conference_table'], wall_: ['whiteboard', 'planter', 'filing_cabinet', 'water_cooler'], clutter: ['cardboard_boxes'], posters: 1 },
      manager: { floor: 'carpet_red', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['desk_computer'], wall_: ['bookcase', 'filing_cabinet', 'planter', 'armchair'], clutter: ['office_chair', 'cardboard_boxes'], posters: 1 },
      break_room: { floor: 'tiles_checker', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['table'], wall_: ['vending_machine', 'coffee_machine', 'water_cooler', 'ext:psx_fridge'], clutter: ['office_chair', 'ext:psx_trash_bag'], posters: 1 },
      copy_room: { floor: 'tiles_dirty', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['copier', 'copier', 'shelf_metal', 'filing_cabinet'], clutter: ['cardboard_boxes', 'cardboard_boxes', 'ext:psx_cardboard_box'] },
      server_closet: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0x9fd0ff, rows: 'server_rack_prop', wall_: ['server_rack_prop', 'fuse_box'], clutter: ['cardboard_boxes'] },
      restroom: { floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['toilet', 'sink', 'toilet', 'sink'], clutter: ['mop_bucket', 'wet_floor_sign'] },
      storage: { floor: 'concrete_stained', wall: 'concrete', ceil: 'metal_dark', lamp: 'ceiling_lamp', rows: 'shelf_metal', wall_: ['shelf_metal', 'ext:psx_shelf'], clutter: ['cardboard_boxes', 'ext:psx_cardboard_box', 'pallet'] },
      elevator_hub: { floor: 'marble', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['planter', 'bench', 'planter'], wall_: ['elevator_door', 'elevator_door', 'elevator_door', 'planter'], clutter: ['wet_floor_sign'], posters: 2 },
      generator: { floor: 'concrete', wall: 'concrete_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: null, wall_: [], clutter: ['cobweb', 'office_chair', 'ext:psx_trash_bag'], webs: true },
    },
  },
  roomTypes: [
    ['cubicles', 6, true], ['conference', 3, true], ['storage', 1, true],
    ['manager', 4], ['break_room', 3], ['copy_room', 3], ['server_closet', 2], ['restroom', 2], ['nest', 1],
  ],
  roomHeight(type, rng) {
    if (type === 'elevator_hub') return rng.float(6.4, 7.2);
    if (type === 'cubicles' || type === 'conference') return 3.6;
    if (type === 'storage') return rng.float(4.4, 5.2);
    return 3.4;
  },
  layout: { plan: 'wings', doorP: 0.62, blastP: 0.05, loops: 0.35, bigChance: 0.34, corridorH: 3.1, hub: { type: 'elevator_hub', w: 4, h: 4 }, hubAlways: true, lockedP: 0.16 },
  lamps: { corridor: 'fluorescent', every: 2, color: C_LAMP, flicker: 0.14 },
  lampColor: C_LAMP,
  posters: ['poster_work', 'poster_like', 'poster_hang', 'poster_fish', 'poster_missing', 'poster_safety'],
  landmarks: ['planter', 'copier', 'water_cooler'],
  doorProp: 'door_single',
  corridorScrap: 0.08,
  footstep: { carpet_office: 'carpet', carpet_red: 'carpet', marble: 'tile', raised_floor: 'metal' },
  ambience: { base: 'ambience_facility', vol: 0.45, buzz: 'lights_buzz', buzzVol: 0.1, env: 'facility' },
  atmosphere: { fog: 0x05060a, density: 0.07 },
  decorate,
};

// Corridor dressing: planters, water coolers, filing cabinets and corkboards against plain corridor
// walls, so the long wings do not read as empty tubes.
function decorate(ctx) {
  const L = ctx.layout, K = layoutKit(L), rng = ctx.rng, Y = ctx.Y;
  const pool = ['planter', 'water_cooler', 'filing_cabinet', 'planter', 'bench'];
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2 || L.distOf[i] < 3 || K.cellHasDoorway(x, z)) continue;
    if (!rng.chance(0.11)) continue;
    for (let d = 0; d < 4; d++) {
      if (K.edgeBusy(x, z, d)) continue;
      const id = rng.pick(pool);
      const [px, pz] = K.wallPoint(x, z, d, rng.float(-1.1, 1.1), 0.42);
      ctx.placeProp(id, px, Y, pz, WALL_ROT[d]);
      break;
    }
  }
  // The elevator hub: a warm chandelier-like glow high up in the lobby makes it readable from the wings.
  for (const r of L.rooms) {
    if (r.type !== 'elevator_hub') continue;
    const rc = K.roomRect(r);
    ctx.emitters.push({ pos: new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + r.height - 1.2, (rc.z0 + rc.z1) / 2), color: 0xffd7a0, intensity: 1.1, distance: 14, group: 'facility' });
  }
}
