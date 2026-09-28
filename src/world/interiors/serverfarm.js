// SERVER FARM interior - "Cloud Storage". Long rack halls (hot / cold aisles: rows of racks facing each
// other, blue perforated cold-aisle tiles, yellow cable trays hanging over every row), a cooling plant
// that vents coolant (setpieces steam), a network operations centre, tape library, battery room and the
// CORE CHAMBER landmark: a humming mainframe column in a tall hall. Cold blue light everywhere.
import * as THREE from 'three';
import { layoutKit } from './common.js';

const C_COLD = 0x9fcfff;

export const SERVERFARM = {
  id: 'serverfarm',
  name: 'Cloud Storage',
  blurb: 'Rack after rack of rotting data, cooled to 18 degrees. The fans never stop.',
  style: {
    corridor: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', base: 'metal_dark' },
    rooms: {
      entrance: { floor: 'raised_floor', wall: 'server_wall', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['reception_desk'], wall_: ['water_cooler', 'bench', 'ext:ind_metal_cabinet_1'], clutter: ['cardboard_boxes'], posters: 1 },
      rack_hall: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', lamp: 'fluorescent', rows: 'server_rack_prop', rowMargin: 2.5, wall_: ['crac_unit', 'fuse_box', 'ext:kst_computer_system'], clutter: ['cardboard_boxes'], posters: 1 },
      cooling_plant: { floor: 'metal_plate', wall: 'metal', ceil: 'metal_dark', lamp: 'ceiling_lamp', center: ['boiler'], wall_: ['crac_unit', 'crac_unit', 'pipe_vertical', 'ext:ind_ventilation_1'], clutter: ['barrel', 'hanging_chains'], pipes: true },
      noc: { floor: 'carpet_office', wall: 'server_wall', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['desk_computer', 'desk_computer'], wall_: ['monitor_bank', 'server_rack_prop', 'filing_cabinet', 'whiteboard'], clutter: ['office_chair', 'cardboard_boxes'], posters: 2 },
      tape_library: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', lamp: 'fluorescent', rows: 'shelf_metal', wall_: ['shelf_metal', 'ext:psx_shelf'], clutter: ['cardboard_boxes', 'ext:psx_cardboard_box'] },
      battery_room: { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', lampColor: 0xffd070, rows: 'generator', rowGap: 0.8, wall_: ['fuse_box', 'ext:psx_transformer'], clutter: ['barrel_toxic'], posters: 1 },
      loading_dock: { floor: 'concrete_stained', wall: 'concrete', ceil: 'metal_dark', lamp: 'ceiling_lamp', center: [], wall_: ['pallet', 'crate_metal', 'ext:kst_container'], clutter: ['crate_wood', 'crate_metal', 'pallet', 'cardboard_boxes'] },
      security: { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', center: ['desk_computer'], wall_: ['monitor_bank', 'locker', 'fuse_box'], clutter: ['office_chair'], posters: 1 },
      core_chamber: { floor: 'raised_floor', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0x7fd8ff, center: ['core_pillar'], wall_: ['server_rack_prop', 'crac_unit', 'server_rack_prop'], clutter: [], posters: 0 },
      generator: { floor: 'metal_plate', wall: 'metal_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true },
      vault: { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] },
      nest: { floor: 'raised_floor', wall: 'server_wall', ceil: 'metal_dark', lamp: null, wall_: [], clutter: ['cobweb', 'hanging_chains', 'cardboard_boxes'], webs: true },
    },
  },
  roomTypes: [
    ['rack_hall', 7, true], ['cooling_plant', 2, true], ['loading_dock', 1, true], ['tape_library', 1, true],
    ['noc', 3], ['battery_room', 2], ['security', 2], ['nest', 1],
  ],
  roomHeight(type, rng) {
    if (type === 'core_chamber') return rng.float(7.8, 8.6);
    if (type === 'rack_hall') return rng.float(4.2, 4.8);
    if (type === 'cooling_plant' || type === 'loading_dock') return rng.float(6.4, 7.4);
    return 3.6;
  },
  layout: {
    plan: 'rooms', doorP: 0.36, blastP: 0.2, loops: 0.5, bigChance: 0.45, corridorH: 3.4, hub: { type: 'core_chamber', w: 4, h: 4 }, hubAlways: true, lockedP: 0.14,
    // rack halls are long and narrow (aisles run along the long axis)
    shape(rng, big) {
      if (!big) return [rng.int(2, 3), rng.int(2, 3)];
      const long = rng.int(5, 8), short = rng.int(3, 4);
      return rng.chance(0.5) ? [long, short] : [short, long];
    },
  },
  lamps: { corridor: 'fluorescent', every: 3, color: C_COLD, flicker: 0.1 },
  lampColor: C_COLD,
  posters: ['sign_aisle', 'sign_danger', 'poster_work', 'poster_fish', 'poster_like'],
  landmarks: ['server_rack_prop', 'crac_unit', 'generator'],
  doorProp: 'door_single',
  corridorPipes: true,
  corridorScrap: 0.06,
  footstep: { raised_floor: 'metal', metal_plate: 'metal', carpet_office: 'carpet' },
  ambience: { base: 'ambience_facility', vol: 0.5, buzz: 'ship_hum', buzzVol: 0.25, env: 'facility' },
  atmosphere: { fog: 0x02060c, density: 0.07 },
  steamRooms: ['cooling_plant'],
  decorate,
};

function decorate(ctx) {
  const L = ctx.layout, K = layoutKit(L), rng = ctx.rng, Y = ctx.Y, C = K.C;
  const gb = new ctx.GeoBuilder();
  // cable tray: ladder tray (two rails + rungs) hanging at y, running a -> b along one axis
  const tray = (ax, az, bx, bz, y) => {
    const alongX = Math.abs(bx - ax) >= Math.abs(bz - az);
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < 0.5) return;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, w = 0.5;
    for (const s of [-1, 1]) gb.box('tray', cx + (alongX ? 0 : s * w / 2), y, cz + (alongX ? s * w / 2 : 0), alongX ? len : 0.04, 0.08, alongX ? 0.04 : len, 1);
    const n = Math.floor(len / 0.4);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i * len) / n;
      gb.box('tray', cx + (alongX ? t : 0), y - 0.03, cz + (alongX ? 0 : t), alongX ? 0.04 : w, 0.02, alongX ? w : 0.04, 1);
    }
    // bundles of cable lying in the tray
    for (let k = 0; k < 3; k++) gb.box('cable', cx + (alongX ? 0 : (k - 1) * 0.12), y + 0.01, cz + (alongX ? (k - 1) * 0.12 : 0), alongX ? len : 0.07, 0.06, alongX ? 0.07 : len, 1);
  };
  for (const r of L.rooms) {
    if (r.type === 'rack_hall' && r.rowLines) {
      for (const ln of r.rowLines) {
        tray(ln.x0, ln.z0, ln.x1, ln.z1, Y + Math.min(r.height - 0.6, 2.75));
        // cold aisle in front of the row: blue-lit perforated floor strip
        const [fx, fz] = ln.front;
        const a = ln.alongX;
        const x0 = Math.min(ln.x0, ln.x1), x1 = Math.max(ln.x0, ln.x1), z0 = Math.min(ln.z0, ln.z1), z1 = Math.max(ln.z0, ln.z1);
        const off = 1.0;
        if (a) gb.hrect('f:raised_floor', x0, z0 + fz * off - 0.5, x1, z0 + fz * off + 0.5, Y + 0.005, true, 0.5, [0.62, 0.8, 1.15]);
        else gb.hrect('f:raised_floor', x0 + fx * off - 0.5, z0, x0 + fx * off + 0.5, z1, Y + 0.005, true, 0.5, [0.62, 0.8, 1.15]);
      }
    }
  }
  // cable trays along straight corridor cells (just under the ceiling)
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2) continue;
    const ax = K.straightAxis(x, z);
    if (!ax || !rng.chance(0.55)) continue;
    const cx = K.wx(x) + C / 2, cz = K.wz(z) + C / 2, y = Y + (L.corridorH || 3.3) - 0.35, side = rng.sign() * 1.1;
    if (ax === 'x') tray(K.wx(x), cz + side, K.wx(x + 1), cz + side, y);
    else tray(cx + side, K.wz(z), cx + side, K.wz(z + 1), y);
  }
  // core chamber: cold glow under the mainframe and cables from the core to every wall
  for (const r of L.rooms) {
    if (r.type !== 'core_chamber') continue;
    const rc = K.roomRect(r), cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2;
    const y = Y + 5.9;
    tray(cx + 1.3, cz, rc.x1 - 0.2, cz, y); tray(rc.x0 + 0.2, cz, cx - 1.3, cz, y);
    tray(cx, cz + 1.3, cx, rc.z1 - 0.2, y + 0.2); tray(cx, rc.z0 + 0.2, cx, cz - 1.3, y + 0.2);
    ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + 0.8, cz + 2.2), color: 0x40c8ff, intensity: 0.9, distance: 11, group: 'facility', flicker: 0.05 });
  }
  const levelMaterial = ctx.levelMaterial;
  const mats = {
    tray: () => levelMaterial('metal', { color: 0xc8a030 }),
    cable: () => levelMaterial('rubber', { color: 0x5a6a8a }),
  };
  const built = gb.build((key) => (mats[key] ? mats[key]() : levelMaterial(key.split(':')[1], { vertexColors: key.startsWith('f:') })));
  if (built.children.length) { built.name = 'serverfarm'; ctx.group.add(built); }
}
