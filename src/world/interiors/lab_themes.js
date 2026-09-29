// [labyrinths] Two NEW facility interiors on top of the shared generator (docs/wave8/labyrinths.md):
//   metro       "The Packet Subway": one long straight tunnel from the entrance to a terminus (station halls on the way), alcoves + cross passages
//               along it, maintenance side halls with the ordinary rooms. MECHANIC: a ghost train roars through the tunnel (runtime: src/game/labyrinths.js).
//   greenhouse  "Link Rot Greenhouse": open organic zones (hydroponic bays, a dome hub), grow-lights, vine walls that a melee weapon cuts open
//               (shortcuts, never the only way) and spore vents that blur the screen (runtime: src/game/labyrinths.js).
// Planners are pure (used by generateLayout through planLabArch); decorate() builds merged geometry only (no THREE lights) and returns { lab }.
import * as THREE from 'three';
import { layoutKit, SPECIAL_ROOMS, navClear } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';

export const LAB_ROOM_TYPES = ['tunnel', 'platform', 'terminus', 'alcove', 'dome', 'hydro_bay'];
for (const ty of LAB_ROOM_TYPES) SPECIAL_ROOMS.add(ty);

// ------------------------------------------------------------------------------------------------ metro: layout
/** ctx: { arch, W, H, ent, cells, idx, addRoom, line, spines, nodes, open, edgeKey, rng, size }; true when the plan was drawn. */
export function planLabArch(ctx) { return ctx.arch === 'metro' ? planMetro(ctx) : false; }

function planMetro({ W, H, ent, cells, idx, addRoom, line, spines, open, edgeKey, size }) {
  const tx = ent.cx, zBot = ent.z - 1, zTop = 3, stLen = 4;
  if (zBot - zTop < 17 || tx - 8 < 2 || tx + 8 > W - 3) return false;
  const span = zBot - zTop + 1;
  const starts = [zTop, ...(size >= 1.5 ? [zTop + Math.round(span * 0.38), zTop + Math.round(span * 0.7)] : [zTop + Math.round(span * 0.55)])];
  const segs = [];
  let z = zTop;
  starts.forEach((s, i) => { if (i > 0) segs.push({ t: 'tunnel', a: z, b: s - 1 }); segs.push({ t: i === 0 ? 'terminus' : 'platform', a: s, b: s + stLen - 1 }); z = s + stLen; });
  segs.push({ t: 'tunnel', a: z, b: zBot });
  if (segs.some((s) => s.t === 'tunnel' && s.b - s.a < 4)) return false;
  const mark = (x, zz) => { if (!cells[idx(x, zz)]) cells[idx(x, zz)] = 2; };
  for (const s of segs) {
    s.room = s.t === 'tunnel' ? addRoom(tx, s.a, 1, s.b - s.a + 1, 'tunnel') : s.t === 'terminus' ? addRoom(tx - 3, s.a, 7, stLen, 'terminus') : addRoom(tx - 2, s.a, 5, stLen, 'platform');
    s.room.hub = true; s.room.metro = s.t;
  }
  for (let i = 0; i < segs.length - 1; i++) open.add(edgeKey(tx, segs[i].b, 1));
  open.add(edgeKey(tx, ent.z, 3));                                     // entrance foyer opens straight into the tunnel
  // maintenance side halls (the long, safe way round) + the foyer side doors
  for (const sd of [-1, 1]) {
    const hx = tx + sd * 7;
    mark(hx, zTop + 1); line(hx, zTop + 1, hx, ent.cz);
    spines.push({ axis: 'z', c: hx, a: zTop + 1, b: ent.cz });
    const ex = sd < 0 ? ent.x - 1 : ent.x + ent.w;
    line(hx, ent.cz, ex, ent.cz);
    open.add(sd < 0 ? edgeKey(ex, ent.cz, 0) : edgeKey(ex, ent.cz, 2));
    for (const s of segs) {
      if (s.t === 'tunnel') continue;
      const half = s.t === 'terminus' ? 3 : 2;
      for (const row of [s.a + 1, s.a + stLen - 2]) {
        const cx = tx + sd * (half + 1);
        mark(hx, row); line(hx, row, cx, row);
        open.add(sd < 0 ? edgeKey(cx, row, 0) : edgeKey(cx, row, 2));
      }
    }
  }
  // alcoves along every tunnel section: every 3rd cell, alternating sides; every other one is a cross passage to the side hall (the shortcut in)
  let k = 0;
  for (const s of segs) {
    if (s.t !== 'tunnel') continue;
    for (let zz = s.a + 1; zz <= s.b - 1; zz += 3, k++) {
      const sd = k % 2 ? -1 : 1, ax = tx + sd;
      const r = addRoom(ax, zz, 1, 1, 'alcove'); r.hub = true; r.metro = 'alcove';
      open.add(edgeKey(tx, zz, sd > 0 ? 0 : 2));
      if (k % 4 < 2) {
        r.crossing = true;
        const hx = tx + sd * 7, cx = tx + sd * 2;
        mark(hx, zz); line(hx, zz, cx, zz);
        open.add(sd > 0 ? edgeKey(cx, zz, 2) : edgeKey(cx, zz, 0));
      }
    }
  }
  return true;
}

// ------------------------------------------------------------------------------------------------ definitions
const C_SODIUM = 0xffb070;
const R = (o) => ({ ceil: 'metal_dark', lamp: null, wall_: [], clutter: [], posters: 0, ...o });

export const METRO = {
  id: 'metro',
  name: 'The Packet Subway',
  blurb: 'Ghost trains still run the old routes. When the horn sounds, get into an alcove.',
  style: {
    corridor: { floor: 'concrete_dark', wall: 'tiles_dirty', ceil: 'concrete_dark', base: 'metal_rust' },
    rooms: {
      entrance: R({ floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['vending_machine', 'bench'], clutter: ['wet_floor_sign', 'cardboard_boxes'], posters: 2 }),
      tunnel: R({ floor: 'asphalt', wall: 'concrete_dark', ceil: 'concrete_dark' }),
      platform: R({ floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'concrete_dark' }),
      terminus: R({ floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'concrete_dark' }),
      alcove: R({ floor: 'concrete_stained', wall: 'concrete_dark', ceil: 'concrete_dark', wall_: ['fuse_box'], clutter: ['barrel'] }),
      control_room: R({ floor: 'metal_plate', wall: 'metal_dark', lamp: 'fluorescent', center: ['desk'], wall_: ['server_rack_prop', 'server_rack_prop', 'fuse_box'], clutter: ['office_chair'], posters: 1 }),
      depot: R({ floor: 'concrete_stained', wall: 'metal_rust', lamp: 'ceiling_lamp', rows: 'shelf_metal', wall_: ['crate_metal', 'pallet', 'barrel'], clutter: ['crate_wood', 'barrel', 'traffic_cone'] }),
      substation: R({ floor: 'metal_plate', wall: 'metal_dark', lamp: 'wall_lamp', center: ['generator'], wall_: ['fuse_box', 'generator', 'pipe_vertical'], clutter: ['barrel'], pipes: true }),
      workshop: R({ floor: 'concrete_stained', wall: 'metal_rust', lamp: 'wall_lamp', wall_: ['shelf_metal', 'crate_metal', 'fuse_box'], clutter: ['barrel', 'crate_metal', 'mop_bucket'] }),
      breakroom: R({ floor: 'tiles_checker', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['table'], wall_: ['vending_machine', 'water_cooler'], clutter: ['office_chair'] }),
      lockers: R({ floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['bench'], wall_: ['locker', 'locker', 'locker'], clutter: ['mop_bucket'] }),
      storage: R({ floor: 'concrete_stained', wall: 'metal_plate', lamp: 'ceiling_lamp', rows: 'shelf_metal', wall_: ['shelf_metal', 'crate_metal'], clutter: ['crate_wood', 'pallet', 'cardboard_boxes'] }),
      maintenance: R({ floor: 'concrete_stained', wall: 'metal_rust', lamp: 'wall_lamp', wall_: ['pipe_vertical', 'fuse_box', 'shelf_metal'], clutter: ['barrel', 'hanging_chains'], pipes: true }),
      generator: R({ floor: 'concrete', wall: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true }),
      vault: R({ floor: 'metal_plate', wall: 'metal_plate', lamp: 'wall_lamp' }),
      nest: R({ floor: 'concrete_dark', wall: 'concrete_stained', clutter: ['hanging_chains', 'cobweb', 'barrel'], webs: true }),
    },
  },
  roomTypes: [['control_room', 3, true], ['depot', 3, true], ['substation', 2, true], ['workshop', 3], ['breakroom', 2], ['lockers', 2], ['storage', 3], ['maintenance', 2], ['nest', 1]],
  roomHeight(type) {
    if (type === 'tunnel') return 4.6;
    if (type === 'platform') return 5.6;
    if (type === 'terminus') return 6.4;
    if (type === 'alcove') return 3.4;
    if (type === 'depot' || type === 'substation') return 4.6;
    return 3.5;
  },
  layout: { plan: 'wings', arch: 'metro', doorP: 0.5, blastP: 0.06, loops: 0.22, bigChance: 0.3, corridorH: 3.2, hub: null, lockedP: 0.1, roomMul: 1.25 },
  lamps: { corridor: 'ceiling_lamp', every: 3, color: C_SODIUM, flicker: 0.2 },
  lampColor: C_SODIUM,
  posters: ['poster_safety', 'poster_missing', 'graffiti', 'sign_danger', 'poster_delete', 'poster_wash'],
  landmarks: ['generator', 'crate_metal', 'barrel'],
  doorProp: 'door_single',
  corridorPipes: true,
  corridorScrap: 0.07,
  footstep: { asphalt: 'concrete', tiles_dirty: 'concrete' },
  ambience: { base: 'ambience_facility', vol: 0.5, buzz: 'lights_buzz', buzzVol: 0.1, env: 'facility' },
  atmosphere: { fog: 0x05070a, density: 0.06 },
  steamRooms: ['substation'],
  noFlood: ['tunnel', 'platform', 'terminus', 'alcove'],
  decorate: decorateMetro,
};

export const GREENHOUSE = {
  id: 'greenhouse',
  name: 'Link Rot Greenhouse',
  blurb: 'Hydroponics gone feral. Cut the vines for shortcuts, hold your breath in the spores.',
  style: {
    corridor: { floor: 'grass_dry', wall: 'leaves', ceil: 'glass', base: null },
    rooms: {
      entrance: R({ floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'glass', lamp: 'fluorescent', wall_: ['bench', 'planter'], clutter: ['wet_floor_sign', 'cardboard_boxes'], posters: 1 }),
      dome: R({ floor: 'grass', wall: 'leaves', ceil: 'glass' }),
      hydro_bay: R({ floor: 'metal_plate', wall: 'leaves', ceil: 'glass' }),
      seedling: R({ floor: 'tiles_white', wall: 'tiles_mint', ceil: 'glass', lamp: 'fluorescent', center: ['table'], wall_: ['shelf_metal', 'sink', 'planter'], clutter: ['cardboard_boxes', 'planter'] }),
      compost: R({ floor: 'mud', wall: 'bark', ceil: 'glass', lamp: 'wall_lamp', wall_: ['barrel', 'crate_wood'], clutter: ['barrel', 'crate_wood', 'cobweb'] }),
      pump_house: R({ floor: 'metal_plate', wall: 'metal_rust', ceil: 'metal_dark', lamp: 'wall_lamp', center: ['pump_machine'], wall_: ['pipe_vertical', 'fuse_box', 'generator'], clutter: ['barrel'], pipes: true }),
      potting: R({ floor: 'wood_floor', wall: 'wood_dark', ceil: 'wood_dark', lamp: 'wall_lamp', center: ['table'], wall_: ['shelf_metal', 'crate_wood', 'planter'], clutter: ['crate_wood', 'barrel'] }),
      generator: R({ floor: 'concrete', wall: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true }),
      vault: R({ floor: 'metal_plate', wall: 'metal_plate', lamp: 'wall_lamp' }),
      nest: R({ floor: 'mud', wall: 'bark', ceil: 'glass', clutter: ['cobweb', 'hanging_chains'], webs: true }),
    },
  },
  roomTypes: [['hydro_bay', 5, true], ['seedling', 2, true], ['compost', 2], ['pump_house', 2], ['potting', 3], ['seedling', 2], ['nest', 1]],
  roomHeight(type) { return type === 'dome' ? 7.4 : type === 'hydro_bay' ? 4.8 : 3.8; },
  layout: { plan: 'open', doorP: 0.1, blastP: 0, loops: 0.3, bigChance: 0.3, corridorH: 3.6, hub: { type: 'dome', w: 5, h: 5 }, hubAlways: true, roomMul: 0.75, lockedP: 0.08 },
  lamps: { corridor: 'ceiling_lamp', every: 4, color: 0xc880ff, flicker: 0.1 },
  lampColor: 0xd8a0ff,
  posters: ['poster_safety', 'graffiti', 'poster_missing'],
  landmarks: ['planter', 'barrel', 'crate_wood'],
  doorProp: 'door_single',
  corridorScrap: 0.1,
  footstep: { grass_dry: 'grass', grass: 'grass', mud: 'mud' },
  ambience: { base: 'ambience_facility', vol: 0.4, buzz: 'rain', buzzVol: 0.1, env: 'facility' },
  atmosphere: { fog: 0x061208, density: 0.062 },
  noFlood: ['dome', 'hydro_bay'],
  decorate: decorateGreenhouse,
};

// ------------------------------------------------------------------------------------------------ metro: geometry
function decorateMetro(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C;
  const parts = L.rooms.filter((r) => r.metro === 'tunnel' || r.metro === 'platform' || r.metro === 'terminus');
  if (!parts.length) return null;
  const B = new LabBuilder(ctx);
  const xC = K.wx(L.entrance.room.cx) + C / 2;
  let zA = Infinity, zB = -Infinity, nEm = 0;
  const warnLamps = [];
  for (const r of parts) {
    const rc = K.roomRect(r), h = r.height || 4.6;
    zA = Math.min(zA, rc.z0); zB = Math.max(zB, rc.z1);
    B.floor('m:asphalt', xC - 1.05, rc.z0, xC + 1.05, rc.z1, Y + 0.012, true, 0.5, [0.55, 0.55, 0.55]);
    for (const sx of [-1.5, 1.5]) B.floor('m:hazard_stripes', xC + sx - 0.1, rc.z0, xC + sx + 0.1, rc.z1, Y + 0.014, true, 0.8);
    for (const sx of [-0.72, 0.72]) B.box('m:metal_rust', xC + sx, Y + 0.07, (rc.z0 + rc.z1) / 2, 0.09, 0.14, rc.z1 - rc.z0, 0.5);
    for (let z = rc.z0 + 0.4; z < rc.z1; z += 0.9) B.box('m:wood_dark', xC, Y + 0.035, z, 2.0, 0.07, 0.22, 0.5);
    for (let z = rc.z0 + 3; z < rc.z1; z += 6) {
      B.box('m:metal_rust', (rc.x0 + rc.x1) / 2, Y + h - 0.2, z, rc.x1 - rc.x0 - 0.05, 0.3, 0.35, 0.5);
      if (r.metro === 'tunnel' && nEm < 16 && ((z / 6) | 0) % 2 === 0) { ctx.emitters.push({ pos: new THREE.Vector3(xC, Y + h - 0.7, z), color: 0xffaa60, intensity: 0.7, distance: 11, group: 'facility' }); nEm++; }
    }
    if (r.metro === 'tunnel') {
      for (const sx of [rc.x0 + 0.16, rc.x1 - 0.16]) {
        B.box('m:metal_dark', sx, Y + 2.75, (rc.z0 + rc.z1) / 2, 0.24, 0.07, rc.z1 - rc.z0, 0.5);
        for (let z = rc.z0 + 4; z < rc.z1; z += 8) B.box('g:ff8a2a', sx + (sx < xC ? 0.1 : -0.1), Y + 2.1, z, 0.05, 0.16, 0.6);
      }
      // warning lamps (red when the train is coming): one merged strip of small boxes with its own material
      for (let z = rc.z0 + 2; z < rc.z1; z += 10) warnLamps.push([xC, Y + h - 0.45, z]);
    } else {
      // station hall: pillar rows either side of the tracks, benches, a hanging station board
      for (let z = rc.z0 + 3; z < rc.z1 - 2.5; z += 6.5) for (const sx of [-5.4, 5.4]) {
        const px = xC + sx;
        if (navClear(ctx.nav, px - 0.5, z - 0.5, px + 0.5, z + 0.5, 0.4)) B.solid('m:concrete', px, Y + h / 2, z, 0.9, h, 0.9);
      }
      for (const sx of [-2.6, 2.6]) B.box('g:2aa0ff', xC + sx * 2, Y + 3.7, (rc.z0 + rc.z1) / 2, 3.0, 0.5, 0.08);
      if (r.metro === 'terminus') {
        B.solid('m:hazard_stripes', xC, Y + 0.45, rc.z0 + 0.45, 2.4, 0.9, 0.5);
        for (const sx of [-0.9, 0.9]) B.box('g:ff2a2a', xC + sx, Y + 1.05, rc.z0 + 0.72, 0.16, 0.16, 0.06);
      }
    }
  }
  const built = B.build('metro');
  // ghost train (hidden until the runtime sends it): body, glowing windows, headlights front + back. Own materials (never shared with other geometry).
  const T = new THREE.Group(); T.name = 'metro_train'; T.visible = false;
  const body = new THREE.MeshLambertMaterial({ color: 0x18242b, emissive: 0x06262a, transparent: true, opacity: 0.9 });
  const glass = new THREE.MeshBasicMaterial({ color: 0x9ffcf0, transparent: true, opacity: 0.85 });
  const lampF = new THREE.MeshBasicMaterial({ color: 0xfff4c8 }), lampR = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
  const mk = (w, hh, d, m, x, y, z) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); q.position.set(x, y, z); T.add(q); return q; };
  const LEN = 24;
  mk(2.9, 3.0, LEN, body, 0, 1.75, 0);
  for (const sx of [-1.47, 1.47]) for (let i = -4; i <= 4; i++) mk(0.04, 0.9, 1.7, glass, sx, 2.2, i * 2.5);
  for (const sx of [-0.9, 0.9]) { mk(0.5, 0.3, 0.08, lampF, sx, 1.1, LEN / 2 + 0.03); mk(0.5, 0.3, 0.08, lampR, sx, 1.1, -LEN / 2 - 0.03); }
  ctx.group.add(T);
  // warning strip (dark until the horn)
  const wm = new THREE.MeshBasicMaterial({ color: 0x140000 });
  const wg = new THREE.BufferGeometry(), pos = [];
  for (const [x, y, z] of warnLamps) for (const [a, b] of [[-0.35, 0.35]]) pos.push(x + a, y, z - 0.2, x + b, y, z - 0.2, x + b, y + 0.18, z - 0.2, x + a, y, z - 0.2, x + b, y + 0.18, z - 0.2, x + a, y + 0.18, z - 0.2);
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const wmesh = new THREE.Mesh(wg, wm); wmesh.material.side = THREE.DoubleSide; wmesh.frustumCulled = false; wmesh.name = 'metro_warn'; ctx.group.add(wmesh);
  // safe pockets (alcoves / cross passages) for the tests + hit rules
  const pockets = L.rooms.filter((r) => r.metro === 'alcove').map((r) => K.roomRect(r));
  return { lab: { id: 'metro', xC, zA, zB, y: Y, len: LEN, hw: 1.45, train: T, warn: wm, warnCount: warnLamps.length, pockets, built, dispose() { body.dispose(); glass.dispose(); lampF.dispose(); lampR.dispose(); wm.dispose(); } } };
}

// ------------------------------------------------------------------------------------------------ greenhouse: vines (pure planner) + geometry
/**
 * Vine plugs: open edges between two open-zone cells whose detour (the shortest way between the same two cells with the edge closed) is >= minDetour.
 * All chosen plugs are closed at once in the check, so the level stays fully connected without cutting anything. Pure + deterministic.
 * Returns [{ key, x, z, d, detour }].
 */
export function planVines(L, rng, max = 9, minDetour = 10) {
  const { w: W, h: H } = L, blocked = new Set(), out = [];
  const nb = (x, z, d) => [x + [1, 0, -1, 0][d], z + [0, 1, 0, -1][d]];
  const lockedEdge = (k) => { const inf = L.edgeInfo.get(k); return !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked)); };   // detours may only use edges that are open for everybody
  const detour = (ax, az, bx, bz, skip) => {                       // BFS a -> b over open edges, `skip` + blocked closed; returns steps or -1
    const seen = new Map([[L.idx(ax, az), 0]]), q = [[ax, az]];
    for (let qi = 0; qi < q.length; qi++) {
      const [x, z] = q[qi], dist = seen.get(L.idx(x, z));
      if (dist > 60) break;
      for (let d = 0; d < 4; d++) {
        const k = L.edgeKey(x, z, d);
        if (k === skip || blocked.has(k) || !L.open.has(k) || lockedEdge(k)) continue;
        const [nx, nz] = nb(x, z, d);
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || !L.cells[L.idx(nx, nz)] || seen.has(L.idx(nx, nz))) continue;
        seen.set(L.idx(nx, nz), dist + 1);
        if (nx === bx && nz === bz) return dist + 1;
        q.push([nx, nz]);
      }
    }
    return -1;
  };
  const cand = [];
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const i = L.idx(x, z);
    if (!L.zoneMask[i] || L.distOf[i] < 4) continue;
    for (const d of [0, 1]) {
      const k = L.edgeKey(x, z, d), [nx, nz] = nb(x, z, d);
      if (!L.open.has(k) || L.edgeInfo.has(k) || !L.zoneMask[L.idx(nx, nz)]) continue;
      cand.push({ key: k, x, z, d });
    }
  }
  rng.shuffle(cand);
  for (const c of cand) {
    if (out.length >= max) break;
    if (out.some((o) => Math.abs(o.x - c.x) + Math.abs(o.z - c.z) < 4)) continue;
    const [nx, nz] = nb(c.x, c.z, c.d), dd = detour(c.x, c.z, nx, nz, c.key);
    if (dd < minDetour) continue;
    blocked.add(c.key); out.push({ ...c, detour: dd });
  }
  return out;
}

function decorateGreenhouse(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, rng = ctx.rng;
  const B = new LabBuilder(ctx);
  // dressing: grow-light rows + rib beams over every open-zone cell, hanging vine curtains against walls
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2 || !L.zoneMask[i]) continue;
    const h = L.heightOf[i], cx = K.wx(x) + C / 2, cz = K.wz(z) + C / 2;
    B.box('m:metal_rust', cx, Y + h - 0.15, cz, C, 0.12, 0.16, 0.5);
    if (hash2(x, z, 7) < 0.34) B.box('g:d060ff', cx + (hash2(x, z, 3) - 0.5) * 1.6, Y + h - 0.45, cz, 1.8, 0.07, 0.24);
    if (hash2(x, z, 11) < 0.3) {
      const d = (hash2(x, z, 5) * 4) | 0;
      if (!K.edgeBusy(x, z, d) && !(L.cells[L.idx(x + [1, 0, -1, 0][d], z + [0, 1, 0, -1][d])] && L.zoneMask[L.idx(x + [1, 0, -1, 0][d], z + [0, 1, 0, -1][d])])) {
        const [px, pz] = K.wallPoint(x, z, d, (hash2(x, z, 9) - 0.5) * 2.4, 0.22);
        B.box('t:leaves:5aa040:0.92', px, Y + h - 0.9, pz, 0.7, 1.6, 0.6, 0.6);
      }
    }
  }
  // rooms: hydroponic bays (trough rows + grow lights), the dome hub (a huge tree)
  const spotRooms = [];
  for (const r of L.rooms) {
    const rc = K.roomRect(r);
    if (r.type === 'hydro_bay') {
      const x0 = rc.x0 + 2.4, x1 = rc.x1 - 2.4, z0 = rc.z0 + 2.2, z1 = rc.z1 - 2.2;
      if (x1 - x0 < 2 || z1 - z0 < 2) continue;
      let n = 0;
      for (let bx = x0 + 1.5; bx <= x1 - 1.5 + 0.01; bx += 2.6) for (let bz = z0; bz <= z1 - 3.1; bz += 3.4) {
        if (!navClear(ctx.nav, bx - 0.6, bz, bx + 0.6, bz + 3.0, 0.3)) continue;
        B.solid('m:metal_plate', bx, Y + 0.45, bz + 1.5, 1.0, 0.9, 3.0);
        B.box('t:leaves:6ab84a:0.95', bx, Y + 1.15, bz + 1.5, 0.9, 0.5, 2.8, 0.6);
        B.box('g:2aa89a', bx, Y + 0.92, bz + 1.5, 0.8, 0.02, 2.7);
        B.box('g:d060ff', bx, Y + 2.7, bz + 1.5, 0.35, 0.07, 3.0);
        n++;
      }
      if (n) ctx.emitters.push({ pos: new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + 2.9, (rc.z0 + rc.z1) / 2), color: 0xc060ff, intensity: 0.9, distance: 13, group: 'facility' });
      spotRooms.push(r);
    } else if (r.type === 'dome') {
      const cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2, h = r.height || 7.4;
      B.solid('m:bark', cx, Y + h * 0.4, cz, 1.3, h * 0.8, 1.3);
      for (const [dx, dz, s, dy] of [[0, 0, 5.4, 0.86], [1.6, 0.8, 3.6, 0.78], [-1.5, -1.1, 3.8, 0.8], [0.6, -1.7, 3.2, 0.74]]) B.box('t:leaves:4a9a38:0.95', cx + dx, Y + h * dy, cz + dz, s, 1.5, s, 0.5);
      for (let k = 0; k < 6; k++) { const a = k * 1.05; B.box('g:e8ff5a', cx + Math.cos(a) * 1.9, Y + h * 0.7 + (k % 2) * 0.6, cz + Math.sin(a) * 1.9, 0.28, 0.28, 0.28); }
      ctx.emitters.push({ pos: new THREE.Vector3(cx, Y + h * 0.7, cz), color: 0xbfff70, intensity: 1.1, distance: 15, group: 'facility' });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6; ctx.scrapSpots.push({ x: cx + Math.cos(a) * 3.4, y: Y, z: cz + Math.sin(a) * 3.4, room: r.id, type: 'dome', dist: K.roomDist(r) }); }
    }
  }
  // vine plugs across the shortcut edges (cuttable; the runtime removes collider + mesh when one is cut)
  const vines = [];
  const plan = planVines(L, rng);
  const vm = ctx.levelMaterial('leaves', { color: 0x76c058 });
  for (const p of plan) {
    const [ex, ez] = K.edgeCenter(p.x, p.z, p.d), h = L.heightOf[L.idx(p.x, p.z)];
    const sx = p.d === 0 ? 0.6 : C, sz = p.d === 0 ? C : 0.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, h - 0.05, sz), vm);
    mesh.position.set(ex, Y + (h - 0.05) / 2, ez); mesh.name = 'lab_vine'; ctx.group.add(mesh);
    const col = ctx.addBox(ex, Y + h / 2, ez, sx, h, sz);
    ctx.nav.blockedEdges.add(p.key);
    vines.push({ id: vines.length, key: p.key, x: ex, y: Y + 1.2, z: ez, sx, sz, mesh, col, cut: false });
  }
  // spore vents: pods on the floor of open zones far from the entrance; the runtime grows a puff around each on a cycle
  const spores = [];
  const zc = [];
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) { const i = L.idx(x, z); if (L.cells[i] === 2 && L.zoneMask[i] && L.distOf[i] >= 5) zc.push([x, z]); }
  rng.shuffle(zc);
  const pm = new THREE.MeshBasicMaterial({ color: 0xe8ff5a });
  const puffM = new THREE.MeshBasicMaterial({ color: 0xc8ff70, transparent: true, opacity: 0, depthWrite: false });
  const puffG = new THREE.SphereGeometry(1, 10, 8);
  for (const [x, z] of zc.slice(0, Math.min(10, 4 + Math.round((L.size || 1) * 3)))) {
    const px = K.wx(x) + C / 2 + (hash2(x, z, 1) - 0.5) * 1.6, pz = K.wz(z) + C / 2 + (hash2(x, z, 2) - 0.5) * 1.6;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), pm); pod.position.set(px, Y + 0.95, pz);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), vm); stalk.position.set(px, Y + 0.4, pz);
    const puff = new THREE.Mesh(puffG, puffM.clone()); puff.position.set(px, Y + 1.1, pz); puff.visible = false; puff.renderOrder = 3;
    ctx.group.add(pod, stalk, puff);
    spores.push({ x: px, y: Y, z: pz, pod, puff, phase: hash2(x, z, 4) * 40 });
  }
  const built = B.build('greenhouse');
  return { lab: { id: 'greenhouse', vines, spores, built, plan, dispose() { pm.dispose(); puffM.dispose(); puffG.dispose(); } } };
}
