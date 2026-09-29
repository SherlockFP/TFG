// HOSPITAL interior - "Telehealth Clinic". Long mint-green wings (wing plan) with wards full of beds,
// IV stands and privacy curtains, patient rooms, a pharmacy, a morgue with cold drawers, reception and
// the OPERATING THEATRE landmark (surgical lamps, blood). Pale fluorescent light that flickers a lot.
import { layoutKit, WALL_ROT } from './common.js';

const C_CLINIC = 0xe6fff2;

export const HOSPITAL = {
  id: 'hospital',
  name: 'Telehealth Clinic',
  blurb: 'Symptoms searched: all of them. The doctor will see you now.',
  style: {
    corridor: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', base: 'metal_dark' },
    rooms: {
      entrance: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['reception_desk'], wall_: ['bench', 'bench', 'water_cooler', 'planter'], clutter: ['wheelchair', 'wet_floor_sign'], posters: 2 },
      ward: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', lamp: 'fluorescent', rows: 'hospital_bed', rowGap: 1.5, rowMargin: 2.0, wall_: ['iv_stand', 'filing_cabinet', 'sink', 'wheelchair'], clutter: ['iv_stand', 'wheelchair'], posters: 1 },
      patient_room: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['hospital_bed'], wall_: ['iv_stand', 'curtain_divider', 'armchair', 'sink'], clutter: ['wheelchair'], posters: 1 },
      operating: { floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'surgical_lamp', center: ['operating_table'], wall_: ['sink', 'shelf_metal', 'iv_stand', 'server_rack_prop'], clutter: ['iv_stand'], posters: 0 },
      morgue: { floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', lampColor: 0xc8e4ff, center: ['operating_table'], wall_: ['morgue_drawers', 'morgue_drawers', 'morgue_drawers', 'sink'], clutter: [], posters: 0 },
      pharmacy: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', lamp: 'fluorescent', rows: 'shelf_metal', wall_: ['shelf_metal', 'filing_cabinet', 'ext:psx_shelf'], clutter: ['cardboard_boxes', 'ext:psx_cardboard_box'], posters: 1 },
      nurse_station: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['desk_computer'], wall_: ['filing_cabinet', 'water_cooler', 'coffee_machine', 'whiteboard'], clutter: ['office_chair', 'wheelchair'], posters: 2 },
      restroom: { floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['toilet', 'sink', 'toilet'], clutter: ['mop_bucket', 'wet_floor_sign'] },
      isolation: { floor: 'tiles_white', wall: 'mattress', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['hospital_bed'], wall_: [], clutter: [], posters: 0 },
      generator: { floor: 'concrete', wall: 'concrete_dark', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'tiles_mint', wall: 'wall_hospital', ceil: 'ceiling_tiles', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains', 'wheelchair'], webs: true },
    },
  },
  roomTypes: [
    ['ward', 5, true], ['pharmacy', 1, true], ['nurse_station', 1, true],
    ['patient_room', 5], ['morgue', 2], ['nurse_station', 2], ['restroom', 2], ['isolation', 1], ['operating', 1], ['nest', 1],
  ],
  roomHeight(type, rng) {
    if (type === 'operating') return rng.float(4.6, 5.2);
    if (type === 'ward') return 3.8;
    return 3.4;
  },
  layout: {
    plan: 'wings', doorP: 0.72, blastP: 0.04, loops: 0.3, bigChance: 0.3, corridorH: 3.1, hub: { type: 'operating', w: 3, h: 3 }, hubAlways: true, lockedP: 0.14,
    shape(rng, big) {
      if (!big) return [rng.int(2, 3), rng.int(2, 3)];
      const long = rng.int(4, 6), short = 3;
      return rng.chance(0.5) ? [long, short] : [short, long];
    },
  },
  lamps: { corridor: 'fluorescent', every: 2, color: C_CLINIC, flicker: 0.3 },
  lampColor: C_CLINIC,
  posters: ['poster_hospital', 'poster_missing', 'poster_safety', 'poster_like', 'blood_splat', 'poster_wash', 'poster_hr', 'poster_delete'],
  landmarks: ['wheelchair', 'iv_stand', 'hospital_bed'],
  doorProp: 'door_single',
  corridorScrap: 0.07,
  footstep: { mattress: 'carpet' },
  ambience: { base: 'ambience_facility', vol: 0.45, buzz: 'lights_buzz', buzzVol: 0.14, env: 'facility' },
  atmosphere: { fog: 0x030605, density: 0.072 },
  decorate,
};

// Wards: an IV stand and a privacy curtain beside every bed. Corridors: parked wheelchairs / gurneys.
function decorate(ctx) {
  const L = ctx.layout, K = layoutKit(L), rng = ctx.rng, Y = ctx.Y;
  for (const r of L.rooms) {
    if (r.type !== 'ward' || !r.rowSlots) continue;
    for (const s of r.rowSlots) {
      // bed long axis follows its facing; the curtain stands beside the bed, across its long axis
      const fx = Math.sin(s.rot), fz = Math.cos(s.rot);   // bed front direction
      const sx = fz, sz = -fx;                             // sideways
      const gap = (s.spacing || 2.4) / 2;
      if (rng.chance(0.75)) ctx.placeProp('curtain_divider', s.x + sx * gap, Y, s.z + sz * gap, s.rot + Math.PI / 2, { visualOnly: true });
      if (rng.chance(0.6)) ctx.placeProp('iv_stand', s.x - sx * 0.75 - fx * 0.6, Y, s.z - sz * 0.75 - fz * 0.6, 0, { visualOnly: true });
    }
  }
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2 || L.distOf[i] < 3 || K.cellHasDoorway(x, z) || !rng.chance(0.09)) continue;
    for (let d = 0; d < 4; d++) {
      if (K.edgeBusy(x, z, d)) continue;
      const [px, pz] = K.wallPoint(x, z, d, rng.float(-1.1, 1.1), 0.5);
      ctx.placeProp(rng.pick(['wheelchair', 'iv_stand', 'bench']), px, Y, pz, WALL_ROT[d]);
      break;
    }
  }
}
