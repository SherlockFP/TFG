// [labyrinths] The two VERTICAL interiors (docs/wave8/labyrinths.md), built with LabBuilder + src/world/stairs.js flights (ramp colliders):
//   prison  "Banhammer Penitentiary": the hub is a 3-tier CELLBLOCK (11.9 m atrium): catwalk rings with cells on every tier, two stair flights
//           (ground -> tier 1 on the north side, tier 1 -> tier 2 on the south side), railings, red alarm beacons. Every cell has a barred gate
//           that stays open until the runtime slams all of them for 20 s (LOCKDOWN). The rest of the level is the ordinary room labyrinth.
//   tower   "The Ivory Tower": the hub is a 28 m atrium with a 12 m WELL cut through its floor (facility.js `pit`): three lower floors (ring
//           of offices around the well, blocks, loot; richer the deeper), zig-zag stair flights down the well and a central ELEVATOR shaft
//           (cab + gates; the ride is runtime, src/game/labyrinths.js). The lowest floor also closes the well.
// Everything vertical is OPTIONAL loot: the ground floor alone still connects entrance and exits (the generic layout rules).
import * as THREE from 'three';
import { layoutKit, SPECIAL_ROOMS } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';

for (const ty of ['cellblock', 'tower']) SPECIAL_ROOMS.add(ty);
const R = (o) => ({ ceil: 'metal_dark', lamp: null, wall_: [], clutter: [], posters: 0, ...o });

export const PRISON = {
  id: 'prison',
  name: 'Banhammer Penitentiary',
  blurb: 'Every banned account ends up here. When the alarm sounds, the cell doors slam shut.',
  style: {
    corridor: { floor: 'concrete', wall: 'concrete', ceil: 'metal_dark', base: 'metal_dark' },
    rooms: {
      entrance: R({ floor: 'tiles_dirty', wall: 'concrete', lamp: 'fluorescent', wall_: ['bench', 'locker'], clutter: ['wet_floor_sign', 'cardboard_boxes'], posters: 1 }),
      cellblock: R({ floor: 'concrete_stained', wall: 'brick', ceil: 'metal_dark' }),
      mess_hall: R({ floor: 'tiles_checker', wall: 'concrete', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['table', 'table'], wall_: ['vending_machine', 'water_cooler'], clutter: ['office_chair', 'bench'] }),
      armory: R({ floor: 'metal_plate', wall: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['locker', 'locker', 'shelf_metal'], clutter: ['crate_metal', 'barrel'] }),
      infirmary: R({ floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['hospital_bed'], wall_: ['sink', 'filing_cabinet', 'iv_stand'], clutter: ['wheelchair'] }),
      warden_office: R({ floor: 'carpet_red', wall: 'wood_dark', ceil: 'wood_dark', lamp: 'wall_lamp', center: ['desk'], wall_: ['bookcase', 'filing_cabinet', 'armchair'], clutter: ['office_chair'], posters: 1 }),
      guard_room: R({ floor: 'metal_plate', wall: 'metal_dark', lamp: 'fluorescent', center: ['desk'], wall_: ['server_rack_prop', 'server_rack_prop', 'fuse_box'], clutter: ['office_chair'] }),
      showers: R({ floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['sink', 'toilet', 'sink'], clutter: ['mop_bucket', 'wet_floor_sign'] }),
      workshop: R({ floor: 'concrete_stained', wall: 'metal_rust', lamp: 'wall_lamp', wall_: ['shelf_metal', 'crate_metal', 'fuse_box'], clutter: ['barrel', 'crate_metal'] }),
      generator: R({ floor: 'concrete', wall: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true }),
      vault: R({ floor: 'metal_plate', wall: 'metal_plate', lamp: 'wall_lamp' }),
      nest: R({ floor: 'concrete_dark', wall: 'concrete_stained', clutter: ['hanging_chains', 'cobweb'], webs: true }),
    },
  },
  roomTypes: [['mess_hall', 4, true], ['workshop', 2, true], ['armory', 2], ['infirmary', 2], ['warden_office', 2], ['guard_room', 3], ['showers', 2], ['nest', 1]],
  roomHeight(type) { return type === 'cellblock' ? 11.9 : type === 'mess_hall' || type === 'workshop' ? 4.6 : 3.5; },
  layout: { plan: 'rooms', doorP: 0.6, blastP: 0.14, loops: 0.4, bigChance: 0.25, corridorH: 3.2, hub: { type: 'cellblock', w: 7, h: 6 }, hubAlways: true, lockedP: 0.14, roomMul: 1 },
  lamps: { corridor: 'ceiling_lamp', every: 2, color: 0xffe0b0, flicker: 0.18 },
  lampColor: 0xffe0b0,
  posters: ['poster_missing', 'poster_safety', 'graffiti', 'sign_danger', 'poster_delete'],
  landmarks: ['locker', 'bench', 'barrel'],
  doorProp: 'door_single',
  corridorScrap: 0.07,
  footstep: { concrete: 'concrete', concrete_stained: 'concrete', metal_plate: 'metal' },
  ambience: { base: 'ambience_facility', vol: 0.5, buzz: 'lights_buzz', buzzVol: 0.12, env: 'facility' },
  atmosphere: { fog: 0x060607, density: 0.066 },
  noFlood: ['cellblock'],
  decorate: decoratePrison,
};

export const TOWER = {
  id: 'tower',
  name: 'The Ivory Tower',
  blurb: 'A corporate skyscraper with a hole in the middle. Ride the elevator down: the lower the floor, the richer the loot.',
  style: {
    corridor: { floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', base: 'wood_dark' },
    rooms: {
      entrance: R({ floor: 'marble', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['reception_desk'], wall_: ['planter', 'bench'], clutter: ['wet_floor_sign'], posters: 2 }),
      tower: R({ floor: 'marble', wall: 'wall_office', ceil: 'ceiling_tiles' }),
      office: R({ floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['desk_computer'], wall_: ['filing_cabinet', 'water_cooler', 'bookcase'], clutter: ['office_chair'], posters: 1 }),
      conference: R({ floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['conference_table'], wall_: ['whiteboard', 'planter'], clutter: ['office_chair'] }),
      lounge: R({ floor: 'carpet_red', wall: 'wall_office', ceil: 'ceiling_tiles', lamp: 'fluorescent', center: ['table'], wall_: ['vending_machine', 'coffee_machine', 'planter'], clutter: ['armchair'] }),
      server_closet: R({ floor: 'raised_floor', wall: 'server_wall', lamp: 'fluorescent', rows: 'server_rack_prop', wall_: ['server_rack_prop', 'fuse_box'], clutter: ['cardboard_boxes'] }),
      restroom: R({ floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['toilet', 'sink', 'toilet'], clutter: ['mop_bucket'] }),
      generator: R({ floor: 'concrete', wall: 'concrete_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true }),
      vault: R({ floor: 'metal_plate', wall: 'metal_plate', lamp: 'wall_lamp' }),
      nest: R({ floor: 'carpet_office', wall: 'wall_office', ceil: 'ceiling_tiles', clutter: ['cobweb', 'office_chair'], webs: true }),
    },
  },
  roomTypes: [['office', 5, true], ['conference', 3, true], ['lounge', 2], ['server_closet', 2], ['restroom', 2], ['office', 3], ['nest', 1]],
  roomHeight(type) { return type === 'tower' ? 5.6 : type === 'conference' ? 3.8 : 3.4; },
  layout: { plan: 'rooms', doorP: 0.55, blastP: 0.06, loops: 0.4, bigChance: 0.3, corridorH: 3.1, hub: { type: 'tower', w: 7, h: 7 }, hubAlways: true, lockedP: 0.14, roomMul: 1 },
  lamps: { corridor: 'fluorescent', every: 2, color: 0xeaf4ff, flicker: 0.12 },
  lampColor: 0xeaf4ff,
  posters: ['poster_work', 'poster_like', 'poster_hang', 'poster_hr', 'poster_delete', 'poster_wash'],
  landmarks: ['planter', 'water_cooler'],
  doorProp: 'door_single',
  corridorScrap: 0.08,
  footstep: { carpet_office: 'carpet', carpet_red: 'carpet', marble: 'tile', raised_floor: 'metal' },
  ambience: { base: 'ambience_facility', vol: 0.45, buzz: 'lights_buzz', buzzVol: 0.1, env: 'facility' },
  atmosphere: { fog: 0x05070a, density: 0.06 },
  noFlood: ['tower'],
  pit: towerPit,
  decorate: decorateTower,
};

// ------------------------------------------------------------------------------------------------ shared
/** railing along an axis-aligned line with gaps ([[a0,a1],...] in the running coordinate) */
function railGaps(B, axis, c, a0, a1, y, gaps = []) {
  const cuts = [a0, ...gaps.flatMap(([g0, g1]) => [g0, g1]), a1];
  for (let i = 0; i < cuts.length; i += 2) {
    const s = cuts[i], e = cuts[i + 1];
    if (e - s > 0.05) axis === 'x' ? B.rail(s, c, e, c, y) : B.rail(c, s, c, e, y);
  }
}
const lampBar = (B, x0, z0, x1, z1, y) => B.box('g:ffe6b0', (x0 + x1) / 2, y, (z0 + z1) / 2, Math.max(0.12, x1 - x0), 0.06, Math.max(0.12, z1 - z0));

// ------------------------------------------------------------------------------------------------ prison
export const PRISON_GEO = { tier: 3.9, ring: 4.4, cell: 2.6, modW: 2.0, gateW: 1.2, gateH: 2.3, run: 6.0 };

function decoratePrison(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C;
  const r = L.rooms.find((q) => q.type === 'cellblock');
  if (!r) return null;
  const { tier: T, ring: D, cell: CD, modW: MW, gateW, gateH, run } = PRISON_GEO;
  const rc = K.roomRect(r), X0 = rc.x0, X1 = rc.x1, Z0 = rc.z0, Z1 = rc.z1;
  if (X1 - X0 < 4 * D || Z1 - Z0 < 4 * D) return null;
  const B = new LabBuilder(ctx);
  const ys = [Y, Y + T, Y + 2 * T], wallH = T - 0.25;
  // flights: F1 ground -> tier 1 on the north strip (climbing +x), F2 tier 1 -> tier 2 on the south strip (climbing -x)
  const xa = X0 + D + 0.8, xb = X1 - D - 0.8, zn = Z0 + (CD + D) / 2, zs = Z1 - (CD + D) / 2;
  const F = [
    { side: 'N', tier: 0, x: xa, z: zn, y: ys[0], dir: 'x+', lo: xa - 1.6, hi: xa + run + 1.2 },
    { side: 'S', tier: 1, x: xb, z: zs, y: ys[1], dir: 'x-', lo: xb - run - 1.2, hi: xb + 1.6 },
  ];
  const plans = F.map((f) => B.stairs({ x: f.x, z: f.z, y: f.y, dir: f.dir, width: 1.5, rise: T, run, walls: [-1, 1], tex: 'm:metal_plate' }));
  // deck rings (tier 1 and 2): four slabs around the void; the flight arriving at that tier leaves a hole in the walkway strip
  for (const t of [1, 2]) {
    const y = ys[t], hole = t === 1 ? { side: 'N', x0: xa - 0.8, x1: xa + run } : { side: 'S', x0: xb - run, x1: xb + 0.8 };
    const strip = (side) => (side === 'N' ? [Z0, Z0 + D, Z0 + CD] : [Z1 - D, Z1, Z1 - CD]);
    for (const side of ['N', 'S']) {
      const [z0, z1, zc] = strip(side);
      if (hole.side !== side) { B.slab('m:metal_plate', X0, z0, X1, z1, y, 0.25); continue; }
      B.slab('m:metal_plate', X0, z0, hole.x0, z1, y, 0.25); B.slab('m:metal_plate', hole.x1, z0, X1, z1, y, 0.25);
      if (side === 'N') B.slab('m:metal_plate', hole.x0, z0, hole.x1, zc, y, 0.25); else B.slab('m:metal_plate', hole.x0, zc, hole.x1, z1, y, 0.25);
      const hx = side === 'N' ? hole.x0 : hole.x1;   // the LOW end of the flight gets the rail; the top end is where you step off
      B.rail(hx, side === 'N' ? Z0 + CD : Z1 - D, hx, side === 'N' ? Z0 + D : Z1 - CD, y);
      B.rail(hole.x0, side === 'N' ? Z0 + CD : Z1 - CD, hole.x1, side === 'N' ? Z0 + CD : Z1 - CD, y);
    }
    B.slab('m:metal_plate', X0, Z0 + D, X0 + D, Z1 - D, y, 0.25); B.slab('m:metal_plate', X1 - D, Z0 + D, X1, Z1 - D, y, 0.25);
    railGaps(B, 'x', Z0 + D, X0 + D, X1 - D, y); railGaps(B, 'x', Z1 - D, X0 + D, X1 - D, y);
    railGaps(B, 'z', X0 + D, Z0 + D, Z1 - D, y); railGaps(B, 'z', X1 - D, Z0 + D, Z1 - D, y);
    // lamps under the deck + alarm beacon posts on the void corners
    for (const [ax, az] of [[X0 + D, Z0 + D], [X1 - D, Z0 + D], [X0 + D, Z1 - D], [X1 - D, Z1 - D]]) B.box('m:metal_dark', ax, y + 1.25, az, 0.14, 0.4, 0.14);
    lampBar(B, X0 + D + 0.4, Z0 + D + 0.3, X1 - D - 0.4, Z0 + D + 0.4, y - 0.32); lampBar(B, X0 + D + 0.4, Z1 - D - 0.4, X1 - D - 0.4, Z1 - D - 0.3, y - 0.32);
  }
  // corners + cells
  const busy = (x, z, d) => K.edgeBusy(x, z, d);
  const gates = [], cellsOut = [];
  const skipF = (side, t, a) => F.some((f) => f.side === side && (f.tier === t || (f.tier + 1 === t)) && a > f.lo && a < f.hi);
  const unitBusy = (side, a) => {   // ground level: is the 4 m wall unit at running coordinate a (world) a doorway?
    const p = side === 'N' || side === 'S' ? (a - L.ox) / C : (a - L.oz) / C;
    const i = Math.floor(p);
    if (side === 'N') return busy(i, r.z, 3);
    if (side === 'S') return busy(i, r.z + r.h - 1, 1);
    if (side === 'W') return busy(r.x, i, 2);
    return busy(r.x + r.w - 1, i, 0);
  };
  const seenP = new Set();
  const partition = (t, side, a) => {
    const key = `${t}|${side}|${a.toFixed(2)}`;
    if (seenP.has(key)) return; seenP.add(key);
    const y = ys[t], hgt = wallH;
    if (side === 'N') B.solid('m:concrete', a, y + hgt / 2, Z0 + CD / 2, 0.16, hgt, CD);
    else if (side === 'S') B.solid('m:concrete', a, y + hgt / 2, Z1 - CD / 2, 0.16, hgt, CD);
    else if (side === 'W') B.solid('m:concrete', X0 + CD / 2, y + hgt / 2, a, CD, hgt, 0.16);
    else B.solid('m:concrete', X1 - CD / 2, y + hgt / 2, a, CD, hgt, 0.16);
  };
  for (let t = 0; t < 3; t++) {
    const y = ys[t];
    // guard posts in the four corners (ground: only where no doorway opens into them)
    for (const [cxp, czp, sideA, sideB] of [[X0, Z0, 'N', 'W'], [X1 - CD, Z0, 'N', 'E'], [X0, Z1 - CD, 'S', 'W'], [X1 - CD, Z1 - CD, 'S', 'E']]) {
      if (t === 0 && (unitBusy(sideA, sideA === 'N' || sideA === 'S' ? (cxp === X0 ? X0 + 1 : X1 - 1) : 0) || unitBusy(sideB, sideB === 'W' ? (czp === Z0 ? Z0 + 1 : Z1 - 1) : (czp === Z0 ? Z0 + 1 : Z1 - 1)))) continue;
      B.solid('m:metal_plate', cxp + CD / 2, y + wallH / 2, czp + CD / 2, CD, wallH, CD);
      B.box('g:ffb040', cxp + CD / 2, y + 2.0, czp + CD / 2 + (czp === Z0 ? CD / 2 + 0.02 : -CD / 2 - 0.02), 0.9, 0.5, 0.04);
    }
    for (const side of ['N', 'S', 'W', 'E']) {
      const horiz = side === 'N' || side === 'S';
      const a0 = (horiz ? X0 : Z0) + CD, a1 = (horiz ? X1 : Z1) - CD;
      for (let a = a0 + MW / 2; a <= a1 - MW / 2 + 0.01; a += MW) {
        if (t === 0 && (unitBusy(side, a - 1.4) || unitBusy(side, a + 1.4) || unitBusy(side, a))) continue;
        if (skipF(side, t, a)) continue;
        partition(t, side, a - MW / 2); partition(t, side, a + MW / 2);
        // front: two pillars and a lintel around a 1.2 m opening; the gate itself is a runtime collider + instanced bars
        const fz = side === 'N' ? Z0 + CD : side === 'S' ? Z1 - CD : null, fx = side === 'W' ? X0 + CD : side === 'E' ? X1 - CD : null;
        for (const s of [-0.8, 0.8]) {
          if (horiz) B.solid('m:metal_plate', a + s, y + wallH / 2, fz, 0.4, wallH, 0.16); else B.solid('m:metal_plate', fx, y + wallH / 2, a + s, 0.16, wallH, 0.4);
        }
        if (horiz) B.box('m:metal_plate', a, y + (gateH + wallH) / 2, fz, MW, wallH - gateH, 0.16); else B.box('m:metal_plate', fx, y + (gateH + wallH) / 2, a, 0.16, wallH - gateH, MW);
        const bx = horiz ? a : side === 'W' ? X0 + 0.9 : X1 - 0.9, bz = horiz ? (side === 'N' ? Z0 + 0.9 : Z1 - 0.9) : a;
        B.box('m:fabric', bx, y + 0.35, bz, horiz ? 1.6 : 0.7, 0.3, horiz ? 0.7 : 1.6, 0.5);
        gates.push({ x: horiz ? a : fx, y, z: horiz ? fz : a, axis: horiz ? 'x' : 'z', tier: t });
        if (hash2(Math.round(a * 3), t * 7 + side.charCodeAt(0), 5) < 0.42) {
          const sp = { x: bx + (horiz ? 0 : side === 'W' ? 0.6 : -0.6), y, z: bz + (horiz ? (side === 'N' ? 0.6 : -0.6) : 0), room: r.id, type: 'cell', dist: K.roomDist(r) };
          if (t === 0) ctx.scrapSpots.push(sp); else ctx.scrapSpots.push({ ...sp, elevated: true });
          cellsOut.push(sp);
        }
      }
    }
  }
  // roof skylights + pooled lights (constant light count: the facility light pool)
  lampBar(B, X0 + D + 2, (Z0 + Z1) / 2 - 0.2, X1 - D - 2, (Z0 + Z1) / 2 + 0.2, Y + (r.height || 11.9) - 0.1);
  for (const [px, py, pz] of [[(X0 + X1) / 2, Y + 2.2, (Z0 + Z1) / 2], [(X0 + X1) / 2, ys[1] + 2.4, Z0 + D + 1], [(X0 + X1) / 2, ys[2] + 2.4, Z1 - D - 1]]) ctx.emitters.push({ pos: new THREE.Vector3(px, py, pz), color: 0xffe0b0, intensity: 1.1, distance: 15, group: 'facility' });
  const built = B.build('prison');
  // barred gates: ONE instanced mesh, hidden (scale 0) until the lockdown; own alarm beacon material
  const gg = new THREE.BoxGeometry(gateW, gateH, 0.07), gm = ctx.levelMaterial('metal_grate', { color: 0x9aa0a8 });
  const inst = new THREE.InstancedMesh(gg, gm, Math.max(1, gates.length));
  const M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0), open = [];
  gates.forEach((g, i) => {
    M.compose(new THREE.Vector3(g.x, g.y + gateH / 2, g.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.axis === 'z' ? Math.PI / 2 : 0), new THREE.Vector3(1, 1, 1));
    open.push(M.clone()); inst.setMatrixAt(i, Z);
  });
  inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false; inst.name = 'prison_gates'; ctx.group.add(inst);
  const alarm = new THREE.MeshBasicMaterial({ color: 0x2a0000 });
  const ag = new THREE.BoxGeometry(0.3, 0.3, 0.3), beacons = new THREE.Group(); beacons.name = 'prison_alarm';
  for (const t of [1, 2]) for (const [ax, az] of [[X0 + D, Z0 + D], [X1 - D, Z0 + D], [X0 + D, Z1 - D], [X1 - D, Z1 - D]]) { const m = new THREE.Mesh(ag, alarm); m.position.set(ax, ys[t] + 1.6, az); beacons.add(m); }
  ctx.group.add(beacons);
  return { lab: { id: 'prison', room: r.id, gates, inst, openM: open, zeroM: Z, alarm, plans, cells: cellsOut, built, rc, dispose() { alarm.dispose(); gg.dispose(); ag.dispose(); } } };
}

// ------------------------------------------------------------------------------------------------ tower
export const TOWER_GEO = { drop: 4.4, levels: 4, well: 12, shaft: 2.2, lane: 1.4, run: 11.2 };

/** the well: 3x3 cells in the middle of the 7x7 hub room (cell aligned) */
export function towerPit(L) {
  const r = L.rooms.find((q) => q.type === 'tower');
  if (!r || r.w < 7 || r.h < 7) return null;
  const cells = new Set();
  for (let z = r.z + 2; z <= r.z + 4; z++) for (let x = r.x + 2; x <= r.x + 4; x++) cells.add(L.idx(x, z));
  return { room: r, cells, x0: L.ox + (r.x + 2) * L.cell, z0: L.oz + (r.z + 2) * L.cell, x1: L.ox + (r.x + 5) * L.cell, z1: L.oz + (r.z + 5) * L.cell, depth: TOWER_GEO.drop * (TOWER_GEO.levels - 1) };
}

function decorateTower(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y;
  const pit = towerPit(L);
  if (!pit) return null;
  const { drop, shaft: SH, lane, run } = TOWER_GEO;
  const r = pit.room, rc = K.roomRect(r), X0 = rc.x0, X1 = rc.x1, Z0 = rc.z0, Z1 = rc.z1;
  const Vx0 = pit.x0, Vx1 = pit.x1, Vz0 = pit.z0, Vz1 = pit.z1, cx = (Vx0 + Vx1) / 2, cz = (Vz0 + Vz1) / 2;
  const ys = [0, 1, 2, 3].map((k) => Y - drop * k);
  const B = new LabBuilder(ctx);
  const tex = 'm:carpet_office';
  // nothing may walk into the well from the ground: creature nav + prop avoidance
  ctx.nav?.blockBox(Vx0, Vz0, Vx1, Vz1, 0.1); ctx.propBoxes?.push([Vx0, Vz0, Vx1, Vz1]);
  // lower floors: ring slabs (the well stays open), outer walls, ceiling strips, blocks
  for (let k = 1; k <= 3; k++) {
    const y = ys[k];
    if (k < 3) {
      B.slab(tex, X0, Z0, X1, Vz0, y, 0.4); B.slab(tex, X0, Vz1, X1, Z1, y, 0.4); B.slab(tex, X0, Vz0, Vx0, Vz1, y, 0.4); B.slab(tex, Vx1, Vz0, X1, Vz1, y, 0.4);
    } else B.slab('m:marble', X0, Z0, X1, Z1, y, 0.6);   // the well floor
    const wy = y + 2.0;
    B.solid('m:wall_office', (X0 + X1) / 2, wy, Z0, X1 - X0, 4.0, 0.3, { nav: false }); B.solid('m:wall_office', (X0 + X1) / 2, wy, Z1, X1 - X0, 4.0, 0.3, { nav: false });
    B.solid('m:wall_office', X0, wy, (Z0 + Z1) / 2, 0.3, 4.0, Z1 - Z0, { nav: false }); B.solid('m:wall_office', X1, wy, (Z0 + Z1) / 2, 0.3, 4.0, Z1 - Z0, { nav: false });
    const cy = y + 3.4;
    for (const [a, b, c2, d] of [[X0 + 3, Z0 + 4, X1 - 3, Z0 + 4.2], [X0 + 3, Z1 - 4.2, X1 - 3, Z1 - 4], [X0 + 4, Z0 + 3, X0 + 4.2, Z1 - 3], [X1 - 4.2, Z0 + 3, X1 - 4, Z1 - 3]]) lampBar(B, a, b, c2, d, cy);
    ctx.emitters.push({ pos: new THREE.Vector3(cx, y + 2.6, Z0 + 3.5), color: 0xbfe0ff, intensity: 0.9, distance: 15, group: 'facility' });
    ctx.emitters.push({ pos: new THREE.Vector3(cx, y + 2.6, Z1 - 3.5), color: 0xbfe0ff, intensity: 0.9, distance: 15, group: 'facility' });
    // office blocks on the ring centre line (gaps stay >= 2 m) + loot: richer the deeper (3 / 5 / 7 spots per floor)
    const line = [];
    for (let x = X0 + 3; x <= X1 - 3; x += 4) { line.push([x, Z0 + 4]); line.push([x, Z1 - 4]); }
    for (let z = Z0 + 7; z <= Z1 - 7; z += 4) { line.push([X0 + 4, z]); line.push([X1 - 4, z]); }
    const spots = [];
    line.forEach(([x, z], i) => {
      const h = hash2(i, k, 41);
      if (h < 0.55) B.solid('m:wall_office', x, y + 1.3, z, 2.0, 2.6, 2.0, { nav: false });
      else spots.push([x, z, h]);
    });
    spots.sort((p, q) => p[2] - q[2]);
    for (const [x, z] of spots.slice(0, 1 + 2 * k)) ctx.scrapSpots.push({ x: x + 0.3, y, z: z + 0.3, room: r.id, type: 'tower', elevated: true, dist: K.roomDist(r) + k * 4, floor: k });
  }
  // flights down the well (zig-zag): G1 west lane L1 -> ground, G2 east lane L2 -> L1, G3 west lane L3 -> L2
  const xl = Vx0 + lane, xr = Vx1 - lane;
  const plans = [
    B.stairs({ x: xl, z: Vz1 - 0.4, y: ys[1], baseY: ys[1], dir: 'z-', width: 1.5, rise: drop, run, walls: [-1, 1], tex: 'm:metal_plate' }),
    B.stairs({ x: xr, z: Vz0 + 0.4, y: ys[2], baseY: ys[2], dir: 'z+', width: 1.5, rise: drop, run, walls: [-1, 1], tex: 'm:metal_plate' }),
    B.stairs({ x: xl, z: Vz1 - 0.4, y: ys[3], baseY: ys[3], dir: 'z-', width: 1.5, rise: drop, run, walls: [-1, 1], tex: 'm:metal_plate' }),
  ];
  // rims + bridges to the shaft
  const gw = 0.95, bw = 1.2;
  const laneGap = (x) => [x - gw, x + gw];
  const N = { 0: [laneGap(xl)], 1: [], 2: [laneGap(xr), laneGap(xl)] }, S = { 0: [[cx - bw, cx + bw]], 1: [laneGap(xl), [cx - bw, cx + bw], laneGap(xr)], 2: [[cx - bw, cx + bw]] };
  for (let k = 0; k <= 2; k++) {
    const y = ys[k], g0 = N[k].slice().sort((a, b) => a[0] - b[0]), g1 = S[k].slice().sort((a, b) => a[0] - b[0]);
    railGaps(B, 'x', Vz0, Vx0, Vx1, y, g0); railGaps(B, 'x', Vz1, Vx0, Vx1, y, g1);
    railGaps(B, 'z', Vx0, Vz0, Vz1, y); railGaps(B, 'z', Vx1, Vz0, Vz1, y);
    B.slab(tex, cx - bw, cz + SH, cx + bw, Vz1 + 0.1, y, 0.3);
    B.rail(cx - bw, cz + SH, cx - bw, Vz1, y); B.rail(cx + bw, cz + SH, cx + bw, Vz1, y);
  }
  // shaft: walls with a door gap on the south face per level, floor slab inside per level, level indicators, gates, the cab
  const top = Y + 3.4, wt = 0.25, dw = 1.0, dh = 2.4;
  const wall = (x, z, sx, sz, y0, y1) => { if (y1 - y0 > 0.05) B.solid('m:metal', x, (y0 + y1) / 2, z, sx, y1 - y0, sz, { nav: false }); };
  wall(cx, cz - SH, SH * 2, wt, ys[3], top); wall(cx - SH, cz, wt, SH * 2, ys[3], top); wall(cx + SH, cz, wt, SH * 2, ys[3], top);
  wall(cx - (SH + dw) / 2, cz + SH, SH - dw, wt, ys[3], top); wall(cx + (SH + dw) / 2, cz + SH, SH - dw, wt, ys[3], top);
  for (let k = 3; k >= 1; k--) wall(cx, cz + SH, dw * 2, wt, ys[k] + dh, ys[k - 1]);
  wall(cx, cz + SH, dw * 2, wt, Y + dh, top);
  for (let k = 0; k <= 2; k++) B.slab('m:metal_plate', cx - SH + wt / 2, cz - SH + wt / 2, cx + SH - wt / 2, cz + SH - wt / 2, ys[k], 0.3);
  B.box('g:9fe8ff', cx, top + 0.02, cz, SH * 2 - 0.6, 0.05, SH * 2 - 0.6);
  const gm = ctx.levelMaterial('elevator_panel', {});
  const gates = [];
  for (let k = 0; k <= 3; k++) {
    const gx = cx, gy = ys[k] + dh / 2, gz = cz + SH;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(dw * 2, dh, 0.2), gm); mesh.position.set(gx, gy, gz); mesh.visible = k !== 0; mesh.name = 'tower_gate'; ctx.group.add(mesh);
    const col = k !== 0 ? ctx.addBox(gx, gy, gz, dw * 2, dh, 0.2) : null;
    const ind = new THREE.MeshBasicMaterial({ color: k === 0 ? 0x33ff66 : 0xff3322 });
    const im = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.06), ind); im.position.set(cx, ys[k] + dh + 0.3, gz + 0.16); ctx.group.add(im);
    gates.push({ level: k, x: gx, y: ys[k], z: gz, sx: dw * 2, sy: dh, sz: 0.2, mesh, col, ind });
  }
  // the cab (moves in the runtime): floor, back + side walls, glowing ceiling
  const cab = new THREE.Group(); cab.name = 'tower_cab';
  const cm = ctx.levelMaterial('metal', {}), cl = new THREE.MeshBasicMaterial({ color: 0xdff4ff });
  const cb = (w, h, d, m, x, y, z) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); cab.add(q); };
  const hw = 1.65;
  cb(hw * 2, 0.12, hw * 2, cm, 0, 0.06 - 0.02, 0); cb(hw * 2, 2.5, 0.1, cm, 0, 1.3, -hw); cb(0.1, 2.5, hw * 2, cm, -hw, 1.3, 0); cb(0.1, 2.5, hw * 2, cm, hw, 1.3, 0); cb(hw * 2, 0.1, hw * 2, cm, 0, 2.55, 0); cb(hw * 2 - 0.6, 0.04, hw * 2 - 0.6, cl, 0, 2.48, 0);
  cab.position.set(cx, Y, cz); ctx.group.add(cab);
  const built = B.build('tower');
  return { lab: { id: 'tower', room: r.id, cx, cz, ys, well: { x0: Vx0, z0: Vz0, x1: Vx1, z1: Vz1 }, gates, cab, cabHalf: hw, plans, shaft: SH, built, cabLamp: cl, dispose() { cl.dispose(); } } };
}
