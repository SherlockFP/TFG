// SEWER interior - "The Comment Sewer". Everything the internet flushed ends up here: brick tunnels with a
// water channel down the middle of every corridor (wade = slow + splashing, or keep to the ledges), rusty
// pipe runs, sodium lamps, pump rooms that vent steam, flooded overflow chambers, toxic sludge pits
// (hazards.js) and the CISTERN landmark: a huge flooded hall that usually gets a catwalk ring.
import * as THREE from 'three';
import { layoutKit, surfacePlane } from './common.js';

const C_SODIUM = 0xffb468;
const CH_HALF = 0.8;          // half width of the corridor water channel
const CH_Y = 0.1;             // channel water height above the floor

export const SEWER = {
  id: 'sewer',
  name: 'The Comment Sewer',
  blurb: 'Where every deleted comment drains to. Mind the sludge.',
  style: {
    corridor: { floor: 'sewer_floor', wall: 'sewer_brick', ceil: 'concrete_dark', base: null },
    rooms: {
      entrance: { floor: 'concrete_stained', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['locker', 'bench', 'shelf_metal'], clutter: ['barrel', 'mop_bucket'], posters: 1 },
      junction: { floor: 'sewer_floor', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['sewer_outlet', 'sewer_outlet', 'pipe_vertical', 'barrel'], clutter: ['barrel', 'ext:psx_trash_bag', 'crate_wood'], pipes: true },
      pump_room: { floor: 'metal_plate', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', center: ['pump_machine'], wall_: ['pump_machine', 'generator', 'fuse_box', 'ext:psx_pump'], clutter: ['barrel', 'barrel_toxic', 'hanging_chains'], pipes: true },
      cistern: { floor: 'sewer_floor', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['sewer_outlet', 'sewer_outlet', 'sewer_outlet'], clutter: ['barrel'], posters: 0 },
      overflow: { floor: 'sewer_floor', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['sewer_outlet', 'barrel'], clutter: ['barrel', 'crate_wood'] },
      sludge_pit: { floor: 'sewer_floor', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: null, wall_: ['sewer_outlet', 'barrel_toxic'], clutter: ['barrel_toxic', 'barrel_toxic'] },
      storm_drain: { floor: 'concrete_stained', wall: 'concrete_dark', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['sewer_outlet', 'pipe_vertical'], clutter: ['ext:psx_trash_bag', 'barrel', 'traffic_cone'] },
      maintenance: { floor: 'concrete_stained', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['locker', 'shelf_metal', 'fuse_box', 'ext:ks_workbench'], clutter: ['crate_metal', 'mop_bucket', 'barrel'], posters: 1 },
      camp: { floor: 'sewer_floor', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'wall_lamp', center: ['table'], wall_: ['ext:psx_mattress', 'shelf_metal', 'ext:psx_couch'], clutter: ['ext:psx_trash_bag', 'cardboard_boxes', 'barrel'], posters: 2 },
      generator: { floor: 'concrete', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'mud', wall: 'sewer_brick', ceil: 'concrete_dark', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains', 'ext:psx_trash_bag'], webs: true },
    },
  },
  roomTypes: [
    ['junction', 4, true], ['overflow', 2, true], ['pump_room', 2, true], ['sludge_pit', 2, true],
    ['storm_drain', 3], ['maintenance', 3], ['camp', 2], ['nest', 1],
  ],
  roomHeight(type, rng) {
    if (type === 'cistern') return rng.float(8.0, 9.0);
    if (type === 'junction' || type === 'pump_room') return rng.float(4.6, 6.8);
    if (type === 'overflow' || type === 'sludge_pit') return rng.float(4.4, 5.2);
    return 3.8;
  },
  layout: { plan: 'rooms', doorP: 0.14, blastP: 0.12, loops: 0.8, bigChance: 0.32, corridorH: 3.6, hub: { type: 'cistern', w: 5, h: 5 }, hubAlways: true, lockedP: 0.1 },
  lamps: { corridor: 'ceiling_lamp', every: 3, color: C_SODIUM, flicker: 0.22 },
  lampColor: C_SODIUM,
  posters: ['graffiti', 'poster_missing', 'sign_danger', 'blood_splat', 'poster_fish'],
  landmarks: ['pump_machine', 'barrel', 'crate_wood'],
  doorProp: 'door_single',
  corridorPipes: true,
  corridorScrap: 0.07,
  footstep: { sewer_floor: 'mud', mud: 'mud', metal_plate: 'metal', concrete_stained: 'concrete' },
  ambience: { base: 'ambience_facility', vol: 0.5, buzz: 'rain', buzzVol: 0.12, env: 'facility' },
  atmosphere: { fog: 0x040804, density: 0.082 },
  steamRooms: ['pump_room'],
  noFlood: ['overflow', 'sludge_pit', 'cistern'],
  decorate,
};

function decorate(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, rng = ctx.rng;
  const gb = new ctx.GeoBuilder();
  const water = new ctx.GeoBuilder();
  const wy = Y + CH_Y;
  const addWater = (x0, z0, x1, z1) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    water.hrect('water', x0, z0, x1, z1, wy, true, 0.3);
    gb.hrect('f:sewer_floor', x0, z0, x1, z1, Y + 0.004, true, 0.5, [0.42, 0.46, 0.36]);
    ctx.zones.push({ type: 'water', min: [x0, z0], max: [x1, z1], y: wy, room: -1 });
  };
  // corridor channels: an X strip and a Z strip per cell, running out to open corridor neighbours only
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2) continue;
    const corr = (d) => {
      if (!L.open.has(K.ek(x, z, d))) return false;
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      return K.inb(nx, nz) && L.cells[L.idx(nx, nz)] === 2;
    };
    const cx = K.wx(x) + C / 2, cz = K.wz(z) + C / 2;
    const e = corr(0), w = corr(2), s = corr(1), n = corr(3);
    if (!(e || w || s || n)) continue;
    // X strip (includes the centre square)
    addWater(w ? K.wx(x) : cx - CH_HALF, cz - CH_HALF, e ? K.wx(x + 1) : cx + CH_HALF, cz + CH_HALF);
    if (n) addWater(cx - CH_HALF, K.wz(z), cx + CH_HALF, cz - CH_HALF);
    if (s) addWater(cx - CH_HALF, cz + CH_HALF, cx + CH_HALF, K.wz(z + 1));
    // grated drain in the ceiling now and then (visual)
    if (rng.chance(0.08)) gb.box('grate', cx, Y + (L.corridorH || 3.6) - 0.02, cz, 1.2, 0.04, 1.2, 1);
  }
  // overflow chambers: ankle deep water across the whole room; cistern: a flooded pit in the middle
  for (const r of L.rooms) {
    const rc = K.roomRect(r);
    if (r.type === 'overflow') {
      const y = Y + 0.3;
      surfacePlane(ctx.group, ctx.levelMaterial, 'water', rc, y, { color: 0x5a6a48, opacity: 0.82 });
      ctx.zones.push({ type: 'water', min: [rc.x0, rc.z0], max: [rc.x1, rc.z1], y, room: r.id });
    } else if (r.type === 'cistern') {
      const pit = { x0: rc.x0 + 3.4, z0: rc.z0 + 3.4, x1: rc.x1 - 3.4, z1: rc.z1 - 3.4 };
      if (pit.x1 - pit.x0 > 2 && pit.z1 - pit.z0 > 2) {
        const y = Y + 0.34;
        surfacePlane(ctx.group, ctx.levelMaterial, 'water', pit, y, { color: 0x4a5a40, opacity: 0.85 });
        ctx.zones.push({ type: 'water', min: [pit.x0, pit.z0], max: [pit.x1, pit.z1], y, room: r.id });
        for (let k = 0; k < 2; k++) ctx.scrapSpots.push({ x: rng.float(pit.x0 + 0.6, pit.x1 - 0.6), y: Y, z: rng.float(pit.z0 + 0.6, pit.z1 - 0.6), room: r.id, type: 'cistern', dist: K.roomDist(r) });
      }
      ctx.emitters.push({ pos: new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + 1.2, (rc.z0 + rc.z1) / 2), color: 0x8ab070, intensity: 0.6, distance: 12, group: 'facility' });
    }
  }
  const levelMaterial = ctx.levelMaterial;
  const built = gb.build((key) => (key === 'grate' ? levelMaterial('metal_grate', {}) : levelMaterial(key.split(':')[1], { vertexColors: key.startsWith('f:') })));
  if (built.children.length) { built.name = 'sewer'; ctx.group.add(built); }
  const wet = water.build(() => levelMaterial('water', { transparent: true, opacity: 0.78, color: 0x55624a }));
  if (wet.children.length) {
    wet.name = 'sewer_water';
    wet.traverse((m) => { if (m.isMesh) { m.renderOrder = 2; m.userData.setPiece = true; } });
    ctx.group.add(wet);
  }
}
