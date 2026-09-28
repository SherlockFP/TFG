// BACKROOMS interior - "Level 0". Endless liminal yellow space: huge irregular open areas (layout plan
// 'open': overlapping open zones whose inner walls are knocked out, then random wall runs are put back
// while the whole map stays connected), buzzing fluorescent panels on a strict grid, damp carpet, a few
// pillars, and deep inside the POOLROOMS landmark: a flooded white-tiled hall with bright cold light.
import * as THREE from 'three';
import { layoutKit, surfacePlane, navClear } from './common.js';

const C_PANEL = 0xfff0c0;

export const BACKROOMS = {
  id: 'backrooms',
  name: 'The Backrooms',
  blurb: 'You noclipped out of the internet. Mono-yellow, damp carpet, 600 million square miles.',
  style: {
    corridor: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', base: null },
    rooms: {
      entrance: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'ceiling_panel', wall_: ['bench'], clutter: ['wet_floor_sign'], posters: 1 },
      yellow_room: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'ceiling_panel', wall_: [], clutter: ['office_chair', 'wet_floor_sign', 'cardboard_boxes'], posters: 0 },
      office_void: { floor: 'carpet_office', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'ceiling_panel', center: ['desk'], wall_: ['filing_cabinet', 'water_cooler', 'filing_cabinet'], clutter: ['office_chair', 'office_chair', 'cardboard_boxes'], posters: 1 },
      supply_room: { floor: 'concrete_stained', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'ceiling_panel', rows: 'shelf_metal', wall_: ['shelf_metal', 'ext:psx_shelf'], clutter: ['cardboard_boxes', 'ext:psx_cardboard_box'] },
      dark_zone: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: null, wall_: [], clutter: ['cobweb', 'office_chair'], posters: 0 },
      poolrooms: { floor: 'pool_tiles', wall: 'pool_tiles', ceil: 'pool_tiles', lamp: 'ceiling_panel', lampColor: 0xe8fcff, wall_: ['bench'], clutter: [], posters: 0 },
      generator: { floor: 'concrete', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: 'ceiling_panel', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'carpet_wet', wall: 'wallpaper_yellow', ceil: 'ceiling_stained', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains', 'ext:psx_mattress'], webs: true },
    },
  },
  roomTypes: [
    ['yellow_room', 5, true], ['supply_room', 1, true],
    ['yellow_room', 4], ['office_void', 3], ['dark_zone', 2], ['nest', 1],
  ],
  roomHeight(type, rng) {
    if (type === 'poolrooms') return rng.float(5.6, 6.2);
    if (type === 'vault' || type === 'generator') return 4;
    if (type === 'entrance') return 3.6;
    return rng.float(2.9, 3.3);
  },
  layout: { plan: 'open', doorP: 0.06, blastP: 0, loops: 0.2, bigChance: 0.2, corridorH: 3.0, hub: { type: 'poolrooms', w: 4, h: 4 }, hubAlways: true, roomMul: 0.55, lockedP: 0.1 },
  lamps: { corridor: 'ceiling_panel', every: 2, color: C_PANEL, flicker: 0.28 },
  lampColor: C_PANEL,
  posters: ['sign_noclip', 'poster_missing', 'graffiti', 'poster_hang'],
  landmarks: ['office_chair', 'wet_floor_sign', 'cardboard_boxes'],
  doorProp: 'door_single',
  corridorScrap: 0.12,
  footstep: { carpet_wet: 'mud', carpet_office: 'carpet', pool_tiles: 'tile' },
  ambience: { base: 'ambience_facility', vol: 0.32, buzz: 'lights_buzz', buzzVol: 0.34, env: 'facility' },   // the hum dies with the power
  atmosphere: { fog: 0x1c1706, density: 0.058 },
  decorate,
};

function decorate(ctx) {
  const L = ctx.layout, K = layoutKit(L), rng = ctx.rng, Y = ctx.Y, C = K.C;
  const gb = new ctx.GeoBuilder();
  // pillars in the middle of open-zone cells whose four sides are open (never on a doorway or walls)
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.zoneMask?.[i] || L.distOf[i] < 3) continue;
    let open = 0;
    for (let d = 0; d < 4; d++) if (L.open.has(K.ek(x, z, d))) open++;
    if (open < 4 || !rng.chance(0.2)) continue;
    const cx = K.wx(x) + C / 2, cz = K.wz(z) + C / 2, h = L.heightOf[i] || 3, s = 0.9;
    if (!navClear(ctx.nav, cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2)) continue;
    gb.box('w:wallpaper_yellow', cx, Y + h / 2, cz, s, h, s, 0.5);
    ctx.addBox(cx, Y + h / 2, cz, s, h, s);
    ctx.nav.blockBox(cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2, 0.15);
  }
  // damp patches on the carpet (dark vertex-tinted floor quads), deterministic
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i] || !rng.chance(0.12)) continue;
    const cx = K.wx(x) + rng.float(0.8, C - 0.8), cz = K.wz(z) + rng.float(0.8, C - 0.8), s = rng.float(0.5, 1.2);
    gb.hrect('f:carpet_wet', cx - s, cz - s * 0.7, cx + s, cz + s * 0.7, Y + 0.006, true, 0.5, [0.55, 0.5, 0.36]);
  }
  // abandoned objects in the open zones (solid, small, against nothing - liminal clutter)
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (!L.zoneMask?.[i] || L.distOf[i] < 4 || !rng.chance(0.05)) continue;
    const id = rng.pick(['office_chair', 'wet_floor_sign', 'cardboard_boxes', 'traffic_cone']);
    ctx.placeProp(id, K.wx(x) + rng.float(1, C - 1), Y, K.wz(z) + rng.float(1, C - 1), rng.float(0, Math.PI * 2), { visualOnly: true });
  }
  // POOLROOMS: shallow pool over the inner hall, tiled pillars at the corners of the pool
  for (const r of L.rooms) {
    if (r.type !== 'poolrooms') continue;
    const rc = K.roomRect(r);
    const pool = { x0: rc.x0 + 1.6, z0: rc.z0 + 1.6, x1: rc.x1 - 1.6, z1: rc.z1 - 1.6 };
    const wy = Y + 0.32;
    surfacePlane(ctx.group, ctx.levelMaterial, 'water', pool, wy, { color: 0x9fe8f0, opacity: 0.62, uv: 0.25 });
    // pool rim (tiled curb, visual - ankle deep water, no step)
    for (const [a, b, c2, d] of [[pool.x0, pool.z0, pool.x1, pool.z0 + 0.12], [pool.x0, pool.z1 - 0.12, pool.x1, pool.z1], [pool.x0, pool.z0, pool.x0 + 0.12, pool.z1], [pool.x1 - 0.12, pool.z0, pool.x1, pool.z1]]) {
      gb.box('w:pool_tiles', (a + c2) / 2, Y + 0.05, (b + d) / 2, c2 - a, 0.1, d - b, 0.5);
    }
    ctx.zones.push({ type: 'water', min: [pool.x0, pool.z0], max: [pool.x1, pool.z1], y: wy, room: r.id });
    const s = 0.8;
    for (const [px, pz] of [[pool.x0 + 2.4, pool.z0 + 2.4], [pool.x1 - 2.4, pool.z0 + 2.4], [pool.x0 + 2.4, pool.z1 - 2.4], [pool.x1 - 2.4, pool.z1 - 2.4]]) {
      if (pool.x1 - pool.x0 < 7 || pool.z1 - pool.z0 < 7) break;
      if (!navClear(ctx.nav, px - s / 2, pz - s / 2, px + s / 2, pz + s / 2)) continue;
      gb.box('w:pool_tiles', px, Y + r.height / 2, pz, s, r.height, s, 0.5);
      ctx.addBox(px, Y + r.height / 2, pz, s, r.height, s);
      ctx.nav.blockBox(px - s / 2, pz - s / 2, px + s / 2, pz + s / 2, 0.15);
    }
    // loot at the bottom of the pool (you have to wade for it)
    for (let k = 0; k < 3; k++) ctx.scrapSpots.push({ x: rng.float(pool.x0 + 0.8, pool.x1 - 0.8), y: Y, z: rng.float(pool.z0 + 0.8, pool.z1 - 0.8), room: r.id, type: 'poolrooms', dist: K.roomDist(r) });
    ctx.emitters.push({ pos: new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + 0.6, (rc.z0 + rc.z1) / 2), color: 0x7fe0ff, intensity: 0.7, distance: 12, group: 'facility' });
  }
  const levelMaterial = ctx.levelMaterial;
  const built = gb.build((key) => levelMaterial(key.split(':')[1], { vertexColors: key.startsWith('f:') }));
  if (built.children.length) { built.name = 'backrooms'; ctx.group.add(built); }
}
