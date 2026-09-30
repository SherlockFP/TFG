// THE ELEVATOR HOTEL (wave 12, docs/wave12/labyr12.md): a liminal hotel. The ordinary generator builds the ground floor (numbered guest rooms off carpeted corridors, kitchen, laundry, ballroom);
// the HUB is the LOBBY, an 8x6-cell hall 16 m tall that holds the rest of the building, stacked on the prison / tower pattern (LabBuilder + stairs.js ramps, merged geometry, no THREE lights):
//   level 0  the lobby (ground): reception desk, sofas, a piano, the central CORE (stairwell + elevator shaft) and a guaranteed master key on the desk
//   level 1  floor "2"    ring corridor around the core, 22 rooms around the outside (most are solid doors, some open, some DO NOT DISTURB)
//   level 2  floor "3"    same, different dice
//   level 3  floor "13"   HIDDEN: no button for it, no shaft door that opens; only the stairwell reaches it. Cold flickering sconces, the hero suite 1313 (guaranteed ring).
//   ELEVATOR one shaft, one car (cab group + a gate collider per level), driven by game/labyr12.js: doors close 3 s after the chime, 5-8 s ride, whoever is left outside waits.
//   DND      locked room doors (a separate leaf mesh + collider each) open with a master key (the ordinary 'key' item, consumed on the host); their loot spots ask for a real item.
// Floors above the ground have no creature nav: their spots are `elevated` (ordinary rule of prison / tower). Ground rooms + corridors are the ordinary facility.
import * as THREE from 'three';
import { layoutKit, SPECIAL_ROOMS } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';
import { doorLanes, makeFree, panel } from './labyr10_kit.js';
import { HZ } from '../../game/labyr12_core.js';
import { installLabyr12Textures, plaqueKey } from '../../render/labyr12_textures.js';

installLabyr12Textures();
SPECIAL_ROOMS.add('hotel_core');

export const HOTEL_TYPES = ['hotel_core', 'guest'];
export const HZ_GEO = { depth: 5.4, corr: 2.6, coreHX: 8, coreHZ: 4, wallT: 0.3, doorH: 2.4, gateW: 1.8, run: 8, lane: 2.0, holeHW: 0.95, slab: 0.3 };
const R = (o) => ({ ceil: 'hz_ceil', lamp: null, wall: 'hz_wall', floor: 'hz_carpet', wall_: [], clutter: [], posters: 0, ...o });

export const HOTEL = {
  id: 'hotel',
  name: 'The Overload Hotel',
  blurb: 'Check in any time. One elevator, one missing floor and a lot of doors that say DO NOT DISTURB.',
  style: {
    corridor: { floor: 'hz_carpet', wall: 'hz_wall', ceil: 'hz_ceil', base: 'wood_dark' },
    rooms: {
      entrance: R({ floor: 'hz_lobby', lamp: 'wall_lamp', wall_: ['bench', 'planter'], clutter: ['planter'], posters: 1 }),
      hotel_core: R({ floor: 'hz_lobby' }),
      guest: R({ lamp: 'wall_lamp', center: ['table'], wall_: ['bookcase', 'armchair'], clutter: ['cardboard_boxes'], posters: 1 }),
      suite: R({ lamp: 'chandelier', center: ['table'], wall_: ['grandfather_clock', 'bookcase', 'armchair'], clutter: ['armchair'], posters: 1 }),
      laundry: R({ floor: 'tiles_white', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['locker', 'sink'], clutter: ['mop_bucket', 'cardboard_boxes'] }),
      kitchen: R({ floor: 'tiles_dirty', wall: 'tiles_white', ceil: 'ceiling_tiles', lamp: 'fluorescent', wall_: ['sink', 'shelf_metal', 'vending_machine'], clutter: ['crate_metal', 'cardboard_boxes'] }),
      ballroom: R({ floor: 'hz_lobby', lamp: 'chandelier', center: ['table', 'table'], wall_: ['grandfather_clock', 'bookcase'], clutter: ['armchair'] }),
      generator: R({ floor: 'concrete', wall: 'concrete_dark', ceil: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true }),
      vault: R({ floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp' }),
      core: R({ floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp' }),
      nest: R({ lamp: null, clutter: ['cobweb', 'hanging_chains'], webs: true }),
    },
  },
  roomTypes: [['guest', 9], ['guest', 4], ['suite', 3], ['laundry', 2], ['kitchen', 2, true], ['ballroom', 2, true], ['nest', 1]],
  roomHeight(type) { return type === 'hotel_core' ? HZ.floorH * HZ.levels : type === 'ballroom' ? 4.8 : type === 'entrance' ? 3.6 : type === 'suite' ? 3.6 : 3.2; },
  layout: { plan: 'rooms', doorP: 0.85, blastP: 0.02, loops: 0.4, bigChance: 0.25, corridorH: 3.0, hub: { type: 'hotel_core', w: 8, h: 6 }, hubAlways: true, lockedP: 0.1, roomMul: 1.15 },
  lamps: { corridor: 'wall_lamp', every: 2, color: 0xffc078, flicker: 0.3 },
  lampColor: 0xffc078,
  practicals: { corridor: 3 },
  posters: ['poster_missing', 'graffiti', 'poster_hang'],
  landmarks: ['grandfather_clock', 'planter', 'armchair'],
  doorProp: 'door_single',
  corridorScrap: 0.07,
  footstep: { hz_carpet: 'carpet', hz_lobby: 'tile', tiles_white: 'tile', tiles_dirty: 'tile', metal_plate: 'metal' },
  ambience: { base: 'ambience_hotel', vol: 0.5, buzz: 'lights_buzz', buzzVol: 0.07, env: 'facility' },
  atmosphere: { fog: 0x120a08, density: 0.052 },
  noFlood: HOTEL_TYPES,
  decorate: decorateHotel,
};

const DND_ITEMS = ['perfume', 'painting', 'trophy', 'tv', 'lamp', 'bell'];

function decorateHotel(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C;
  const r = L.rooms.find((q) => q.type === 'hotel_core');
  if (!r || r.w < 8 || r.h < 6) return null;                                   // no lobby: the ground floor alone is still a complete level
  const G = HZ_GEO, FH = HZ.floorH, TS = G.slab;
  const rc = K.roomRect(r), X0 = rc.x0, X1 = rc.x1, Z0 = rc.z0, Z1 = rc.z1;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const B = new LabBuilder(ctx), lanes = doorLanes(L), free = makeFree(ctx, lanes);
  const ys = [0, 1, 2, 3].map((k) => Y + FH * k);
  const lab = { id: 'hotel', room: r.id, cx, cz, ys, spawnSpots: [], gates: [], dnd: [], flick: [], plans: [], hero: null, cab: null, built: null, solids: null };
  // loot spot; upper floors have no nav of their own, and the facility keeps a spot only where the GROUND nav under it is walkable, so slide it to the nearest clear ground cell
  const OFFS = [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [1.1, 1.1], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1]];
  const spot = (x, y, z, level, extra = {}) => {
    let p = [x, z];
    if (level > 0) { p = null; for (const [dx, dz] of OFFS) if (ctx.nav.walkableAt(x + dx, z + dz)) { p = [x + dx, z + dz]; break; } }
    if (!p) return false;
    ctx.scrapSpots.push({ x: p[0], y, z: p[1], room: r.id, type: 'hotel', elevated: level > 0, dist: 8 + level * 3, level, ...extra });
    return true;
  };
  const hc = (k) => (k === 3 ? FH : FH - TS);                                 // clear wall height on level k
  const S = (key, x0, y0, z0, x1, y1, z1, uv = 0.25) => B.solid(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, { uv });
  /** wall along `axis` ('x': runs along x at z = c; 'z': runs along z at x = c) from a to b, gaps = [[g0, g1]] (door openings, lintel above dh) */
  const wall = (axis, c, a, b, y0, y1, gaps = [], thick = G.wallT, key = 'm:hz_wall', dh = G.doorH) => {
    const cuts = [a, ...gaps.flatMap((g) => g), b], h = thick / 2;
    const seg = (s, e, ya, yb) => { if (e - s < 0.04 || yb - ya < 0.04) return; if (axis === 'x') S(key, s, ya, c - h, e, yb, c + h); else S(key, c - h, ya, s, c + h, yb, e); };
    for (let i = 0; i < cuts.length; i += 2) seg(cuts[i], cuts[i + 1], y0, y1);
    for (const [g0, g1] of gaps) seg(g0, g1, y0 + dh, y1);
  };

  // ------------------------------------------------------------------------------------------------ geometry constants (core = stairwell + elevator shaft in the middle of the hall)
  const cx0 = cx - G.coreHX, cx1 = cx + G.coreHX, cz0 = cz - G.coreHZ, cz1 = cz + G.coreHZ;
  const zN = cz - G.lane, zS = cz + G.lane, HW = G.holeHW;
  const doorX = [cx + 2.0, cx + 3.4];                                          // the two stairwell doors (north + south face, east end)
  const gateX = cx + 5.8, gateW = G.gateW;                                     // elevator door on the south face
  const shaft = { x0: cx + 4.0, x1: cx + 7.6, z0: cz + 0.6, z1: cz1 - 0.15 };
  const cabX = gateX, cabZ = (shaft.z0 + shaft.z1) / 2 - 0.05;
  const holes = { 1: [cx - 4.0, zN - HW, cx + 1.6, zN + HW], 2: [cx - 7.6, zS - HW, cx - 2.0, zS + HW], 3: [cx - 4.0, zN - HW, cx + 1.6, zN + HW] };

  // ------------------------------------------------------------------------------------------------ slabs (one per level 1..3, hole over the flight that arrives there)
  const slabRects = (holeR) => {
    const xs = [X0, X1, ...(holeR ? [holeR[0], holeR[2]] : [])].sort((p, q) => p - q), out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1];
      if (xb - xa < 0.05) continue;
      if (holeR && xa >= holeR[0] - 1e-6 && xb <= holeR[2] + 1e-6) { if (holeR[1] - Z0 > 0.05) out.push([xa, Z0, xb, holeR[1]]); if (Z1 - holeR[3] > 0.05) out.push([xa, holeR[3], xb, Z1]); }
      else out.push([xa, Z0, xb, Z1]);
    }
    return out;
  };
  for (let k = 1; k <= 3; k++) {
    const y = ys[k];
    for (const [a, b, c2, d] of slabRects(holes[k])) {
      B.floor('m:hz_carpet', a, b, c2, d, y, true, 0.25); B.floor('m:hz_ceil', a, b, c2, d, y - TS, false, 0.25);
      B.col((a + c2) / 2, y - TS / 2, (b + d) / 2, c2 - a, TS, d - b, 0, false);
    }
    const h = holes[k];                                                        // hole edge faces (both windings: they are seen from inside the hole)
    for (const [x0, z0, x1, z1] of [[h[0], h[1], h[2], h[1]], [h[2], h[3], h[0], h[3]], [h[0], h[3], h[0], h[1]], [h[2], h[1], h[2], h[3]]]) { B.wall('m:wood_dark', x0, z0, x1, z1, y - TS, y); B.wall('m:wood_dark', x1, z1, x0, z0, y - TS, y); }
    // rails: the two long sides along the flight BODY (the flight's own walls are lower than the deck there) and the low end; the top landing and the step-off end stay open,
    // so a rider can walk off the landing sideways (flight B leaves west into a 0.25 m gap by the wall: the sideways exit is the only one)
    const up = k === 2 ? -1 : 1, topX = up > 0 ? cx + 1.0 : cx - 7.0;
    const rx0 = up > 0 ? h[0] : topX, rx1 = up > 0 ? topX : h[2], lowX = up > 0 ? h[0] : h[2];
    B.rail(rx0, h[1], rx1, h[1], y); B.rail(rx0, h[3], rx1, h[3], y);
    B.rail(lowX, h[1], lowX, h[3], y);
  }

  // ------------------------------------------------------------------------------------------------ core: walls, doors, shaft, stairs
  const dead = ctx.levelMaterial('hz_elev', {});
  const coreLevel = (k) => {
    const y = ys[k], H = hc(k), tk = G.wallT;
    wall('x', cz0, cx0, cx1, y, y + H, [doorX], tk);                          // north face
    wall('x', cz1, cx0, cx1, y, y + H, [doorX, ...(k < 3 ? [[gateX - gateW / 2, gateX + gateW / 2]] : [])], tk);   // south face (+ the elevator door)
    wall('z', cx0, cz0, cz1, y, y + H, [[cz - 0.7, cz + 0.7]], tk);           // west face (stairwell door)
    wall('z', cx1, cz0, cz1, y, y + H, [], tk);                               // east face
    // shaft walls (west, north, east); the south side is the core's south face
    wall('z', shaft.x0 - 0.1, shaft.z0, cz1, y, y + H, [], 0.2, 'm:metal'); wall('x', shaft.z0, shaft.x0 - 0.1, shaft.x1 + 0.1, y, y + H, [], 0.2, 'm:metal'); wall('z', shaft.x1 + 0.1, shaft.z0, cz1, y, y + H, [], 0.2, 'm:metal');
    // green stair signs above the three doors, the elevator label above the gate
    for (const [px, pz, nx, nz] of [[(doorX[0] + doorX[1]) / 2, cz0 - 0.17, 0, -1], [(doorX[0] + doorX[1]) / 2, cz1 + 0.17, 0, 1], [cx0 - 0.17, cz, -1, 0]]) panel(B, 'e:hz_stairs:1c3a20', px, y + G.doorH + 0.15, pz, nx, nz, 0.9, 0.9);
    if (k < 3) B.box('m:metal', gateX, y + G.doorH + 0.5, cz1 + 0.12, 0.7, 0.34, 0.06);
    if (k < 3) panel(B, plaqueKey(HZ.labels[k]), gateX, y + G.doorH + 0.32, cz1 + 0.16, 0, 1, 0.6, 0.3);
    else { panel(B, 'm:hz_elev', gateX, y, cz1 + 0.17, 0, 1, gateW, G.doorH); panel(B, plaqueKey(HZ.labels[3]), gateX, y + G.doorH + 0.32, cz1 + 0.16, 0, 1, 0.6, 0.3); }   // floor 13: a door that never opens
  };
  for (let k = 0; k <= 3; k++) coreLevel(k);
  // shaft floors: one under each stop (the car rides through them; the slab is part of the level slab above)
  ctx.nav?.blockBox(cx0, cz0, cx1, cz1, 0.05); ctx.propBoxes?.push([cx0, cz0, cx1, cz1]);   // the whole core is off the creature nav (thin walls do not block a 1 m grid on their own)
  B.box('g:ffe6b0', (shaft.x0 + shaft.x1) / 2, ys[3] + FH - 0.06, (shaft.z0 + shaft.z1) / 2, shaft.x1 - shaft.x0 - 0.6, 0.05, shaft.z1 - shaft.z0 - 0.6);
  // stairs: A ground -> 1 (north lane, climbing east), B 1 -> 2 (south lane, climbing west), C 2 -> 3 (north lane, climbing east)
  lab.plans.push(
    B.stairs({ x: cx - 7.0, z: zN, y: ys[0], baseY: ys[0], dir: 'x+', width: 1.5, rise: FH, run: G.run, walls: [-1, 1], tex: 'm:wood_dark' }),
    B.stairs({ x: cx + 1.0, z: zS, y: ys[1], baseY: ys[1], dir: 'x-', width: 1.5, rise: FH, run: G.run, walls: [-1, 1], tex: 'm:wood_dark' }),
    B.stairs({ x: cx - 7.0, z: zN, y: ys[2], baseY: ys[2], dir: 'x+', width: 1.5, rise: FH, run: G.run, walls: [-1, 1], tex: 'm:wood_dark' }),
  );

  // ------------------------------------------------------------------------------------------------ elevator: gates, indicators, cab
  const gm = ctx.levelMaterial('hz_elev', {});
  for (let k = 0; k < HZ.stops; k++) {
    const gy = ys[k] + G.doorH / 2, mesh = new THREE.Mesh(new THREE.BoxGeometry(gateW, G.doorH, 0.16), gm);
    mesh.position.set(gateX, gy, cz1); mesh.visible = k !== 0; mesh.name = 'hotel_gate'; ctx.group.add(mesh);
    const col = k !== 0 ? ctx.addBox(gateX, gy, cz1, gateW, G.doorH, 0.16) : null;
    const ind = new THREE.MeshBasicMaterial({ color: k === 0 ? 0x33ff66 : 0xff3322 }), im = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.06), ind);
    im.position.set(gateX, ys[k] + G.doorH + 0.75, cz1 + 0.16); ctx.group.add(im);
    lab.gates.push({ level: k, x: gateX, y: ys[k], z: cz1, sx: gateW, sy: G.doorH, sz: 0.16, mesh, col, ind });
  }
  const cab = new THREE.Group(); cab.name = 'hotel_cab';
  const cmW = ctx.levelMaterial('wood_dark', {}), cmF = ctx.levelMaterial('hz_carpet', {}), cl = new THREE.MeshBasicMaterial({ color: 0xffe8c0 });
  const cb = (w, h, d, m, x, y, z) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); cab.add(q); return q; };
  const chw = 1.5, chd = 1.4;
  cb(chw * 2, 0.12, chd * 2, cmF, 0, 0.04, 0); cb(chw * 2, 2.5, 0.1, cmW, 0, 1.3, -chd); cb(0.1, 2.5, chd * 2, cmW, -chw, 1.3, 0); cb(0.1, 2.5, chd * 2, cmW, chw, 1.3, 0); cb(chw * 2, 0.1, chd * 2, cmW, 0, 2.55, 0); cb(chw * 2 - 0.6, 0.04, chd * 2 - 0.6, cl, 0, 2.48, 0);
  // control panel on the back wall: L, 2, 3 and a taped-over fourth button
  const btn = [];
  for (let i = 0; i < 4; i++) {
    const on = i < HZ.stops, m = new THREE.MeshBasicMaterial({ color: on ? 0xd8a040 : 0x201c18 });
    cb(0.22, 0.22, 0.05, m, (i - 1.5) * 0.42, 1.3, -chd + 0.08); btn.push(m);
  }
  cb(0.3, 0.07, 0.03, cmW, 1.5 * 0.42, 1.3, -chd + 0.115).rotation.z = 0.5;      // the tape
  cab.position.set(cabX, ys[0], cabZ); ctx.group.add(cab);
  Object.assign(lab, { cab, cabX, cabZ, cabHalf: [chw - 0.15, chd - 0.1], cabLamp: cl, cabButtons: btn, gateX, gateZ: cz1, callPos: [gateX + 1.5, cz1 + 0.2], shaft, indicators: lab.gates.map((g) => g.ind) });

  // ------------------------------------------------------------------------------------------------ levels 1..3: rooms around the ring corridor
  const D = G.depth;
  const strips = [
    { side: 'N', axis: 'x', a0: X0, a1: X1, wc: Z0 + D, n: 8, to: 1 }, { side: 'S', axis: 'x', a0: X0, a1: X1, wc: Z1 - D, n: 8, to: -1 },
    { side: 'W', axis: 'z', a0: Z0 + D, a1: Z1 - D, wc: X0 + D, n: 3, to: 1 }, { side: 'E', axis: 'z', a0: Z0 + D, a1: Z1 - D, wc: X1 - D, n: 3, to: -1 },
  ];
  const swing = { N: 1.75, S: -1.75, W: -1.75, E: 1.75 };
  const leafMat = ctx.levelMaterial('hz_dnd', {});
  let nDnd = 0, nOpen = 0, nSealed = 0, sconces = 0, trays = 0;
  const level = (k) => {
    const y = ys[k], H = hc(k), num0 = k === 3 ? 1300 : (k + 1) * 100;
    // room states: a seeded shuffle; level 3 merges the four middle north rooms into the hero suite
    const rooms = [];
    for (const st of strips) for (let i = 0; i < st.n; i++) rooms.push({ st, i, state: 'sealed', id: rooms.length });
    const order = rooms.map((q) => q).sort((p, q) => hash2(p.id, k, 71) - hash2(q.id, k, 71));
    const wantD = k === 3 ? 2 : 3, wantO = k === 3 ? 4 : 6;
    let d = 0, o = 0;
    for (const q of order) {
      if (k === 3 && q.st.side === 'N' && q.i >= 2 && q.i <= 5) continue;
      if (d < wantD) { q.state = 'dnd'; d++; } else if (o < wantO) { q.state = 'open'; o++; }
    }
    if (k === 3) for (const q of rooms) if (q.st.side === 'N' && q.i >= 2 && q.i <= 5) q.state = 'suite';
    for (const st of strips) {
      const len = (st.a1 - st.a0) / st.n, rs = rooms.filter((q) => q.st === st);
      const span = (q) => [st.a0 + q.i * len, st.a0 + (q.i + 1) * len];
      const rect = (a, b) => (st.axis === 'x' ? { x0: a, x1: b, z0: st.to > 0 ? Z0 : Z1 - D, z1: st.to > 0 ? Z0 + D : Z1 } : { z0: a, z1: b, x0: st.to > 0 ? X0 : X1 - D, x1: st.to > 0 ? X0 + D : X1 });
      // 1) solid runs of sealed rooms
      for (let i = 0; i < st.n;) {
        if (rs[i].state !== 'sealed') { i++; continue; }
        let j = i; while (j + 1 < st.n && rs[j + 1].state === 'sealed') j++;
        const a = span(rs[i])[0], b = span(rs[j])[1], q = rect(a, b);
        S('m:hz_wall', q.x0, y, q.z0, q.x1, y + H, q.z1, 0.25);
        i = j + 1;
      }
      // 2) partitions between two neighbouring hollow rooms (a solid neighbour already is a wall; the suite is one room)
      for (let i = 0; i + 1 < st.n; i++) {
        const p = rs[i], q2 = rs[i + 1];
        if (p.state === 'sealed' || q2.state === 'sealed' || (p.state === 'suite' && q2.state === 'suite')) continue;
        const b = span(p)[1], rr = rect(b - 1, b + 1);
        if (st.axis === 'x') S('m:hz_wall', b - 0.1, y, rr.z0, b + 0.1, y + H, rr.z1); else S('m:hz_wall', rr.x0, y, b - 0.1, rr.x1, y + H, b + 0.1);
      }
      // 3) hollow rooms: door gaps, furniture, doors
      const gaps = [];
      for (const q of rs) {
        const [a, b] = span(q), c = (a + b) / 2;
        q.c = c; q.num = num0 + (q.id + 1);
        // door decal (sealed) or the room itself
        const gx0 = q.state === 'suite' ? (q.i === 2 ? cx - 1.2 : 0) : c - 0.6, gx1 = q.state === 'suite' ? (q.i === 2 ? cx + 1.2 : 0) : c + 0.6;
        const nrm = st.axis === 'x' ? [0, st.to] : [st.to, 0];                 // from the room towards the corridor
        const onWall = (u, v, off) => (st.axis === 'x' ? [u, st.wc + nrm[1] * off] : [st.wc + nrm[0] * off, u]);
        if (q.state === 'sealed') {
          const [dx, dz] = onWall(c, 0, 0.03);
          panel(B, 'm:hz_door', dx, y, dz, nrm[0], nrm[1], 1.2, G.doorH);
          const [px, pz] = onWall(c, 0, 0.05); panel(B, plaqueKey(q.num), px, y + 1.75, pz, nrm[0], nrm[1], 0.5, 0.25);
          nSealed++;
          continue;
        }
        if (q.state === 'suite') { if (q.i === 2) gaps.push([gx0, gx1, 'suite']); continue; }
        gaps.push([c - 0.6, c + 0.6, q.state, q]);
        const [px, pz] = onWall(c + 1.05, 0, 0.05); panel(B, plaqueKey(q.num), px, y + 1.6, pz, nrm[0], nrm[1], 0.5, 0.25);
        // furniture: a bed against the outer wall, a wardrobe on a side wall (visual + collider, never in the door line)
        const back = st.axis === 'x' ? (st.to > 0 ? Z0 : Z1) : (st.to > 0 ? X0 : X1), bp = back + st.to * 1.35;
        const bed = st.axis === 'x' ? [c, bp] : [bp, c];
        S('m:fabric', bed[0] - (st.axis === 'x' ? 0.8 : 1.15), y, bed[1] - (st.axis === 'x' ? 1.15 : 0.8), bed[0] + (st.axis === 'x' ? 0.8 : 1.15), y + 0.6, bed[1] + (st.axis === 'x' ? 1.15 : 0.8), 0.5);
        const wp = st.axis === 'x' ? [a + 0.45, back + st.to * 3.6] : [back + st.to * 3.6, a + 0.45];
        S('m:wood_dark', wp[0] - 0.4, y, wp[1] - 0.4, wp[0] + 0.4, y + 2.0, wp[1] + 0.4, 0.5);
        const sp = st.axis === 'x' ? [c + 1.2, back + st.to * 0.7] : [back + st.to * 0.7, c + 1.2];
        if (q.state === 'dnd') { nDnd++; } else nOpen++;
        q.spot = sp;
      }
      // 4) the inner wall: all gaps at once (suite gap is one 2.4 m opening)
      const gapRanges = gaps.map((g) => [g[0], g[1]]).sort((p, q) => p[0] - q[0]);
      // sealed runs already fill their span; the inner wall is only needed in front of hollow rooms
      const hollowSpans = [];
      for (const q of rs) if (q.state !== 'sealed') { const [a, b] = span(q); if (hollowSpans.length && Math.abs(hollowSpans[hollowSpans.length - 1][1] - a) < 1e-6) hollowSpans[hollowSpans.length - 1][1] = b; else hollowSpans.push([a, b]); }
      for (const [a, b] of hollowSpans) wall(st.axis, st.wc, a, b, y, y + H, gapRanges.filter((g) => g[0] >= a - 1e-6 && g[1] <= b + 1e-6), 0.2);
      // 5) doors: open rooms get an ajar leaf (visual), DND rooms a real leaf mesh + collider (runtime unlock)
      for (const g of gaps) {
        const q = g[3];
        if (!q) continue;
        const hinge = g[0];
        if (q.state === 'open') {
          const lx = st.axis === 'x' ? hinge + 0.15 : st.wc - st.to * 0.55, lz = st.axis === 'x' ? st.wc - st.to * 0.55 : hinge + 0.15;
          B.rbox('m:hz_door', lx, y + 1.15, lz, st.axis === 'x' ? 0.1 : 1.1, 2.3, st.axis === 'x' ? 1.1 : 0.1, 0, 0.6);
          if (q.spot) spot(q.spot[0], y, q.spot[1], k);
        } else {
          const pivot = new THREE.Group();
          pivot.position.set(st.axis === 'x' ? hinge : st.wc, y, st.axis === 'x' ? st.wc : hinge);
          const th0 = st.axis === 'x' ? 0 : -Math.PI / 2;
          pivot.rotation.y = th0;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.3, 0.12), leafMat); leaf.position.set(0.6, 1.15, 0); pivot.add(leaf); pivot.name = 'hotel_dnd'; ctx.group.add(pivot);
          const mx = st.axis === 'x' ? hinge + 0.6 : st.wc, mz = st.axis === 'x' ? st.wc : hinge + 0.6;
          const col = ctx.addBox(mx, y + 1.15, mz, st.axis === 'x' ? 1.2 : 0.12, 2.3, st.axis === 'x' ? 0.12 : 1.2);
          const id = lab.dnd.length;
          lab.dnd.push({ id, level: k, room: q.num, x: mx, y, z: mz, pivot, leaf, col, open: false, th0, swing: swing[st.side] });
          if (q.spot) spot(q.spot[0], y, q.spot[1], k, { dnd: id, ...(lab.dnd.length % 2 === 1 ? { item: DND_ITEMS[(hash2(id, k, 79) * DND_ITEMS.length) | 0] } : {}), dist: 12 + k * 3 });
        }
      }
      // level 3 suite: furniture + the hero loot
      if (k === 3 && st.side === 'N') {
        const a = span(rs[2])[0], b = span(rs[5])[1], sc = (a + b) / 2, sz = Z0 + 2.4;
        S('m:fabric', sc - 1.1, y, Z0 + 0.2, sc + 1.1, y + 0.7, Z0 + 2.6, 0.5);                       // the bed
        S('m:wood_dark', a + 0.6, y, Z0 + 0.4, a + 2.6, y + 0.9, Z0 + 1.4, 0.5);                      // a long desk
        S('m:fabric', b - 3.2, y, Z0 + 3.4, b - 0.6, y + 0.8, Z0 + 4.3, 0.5);                         // a sofa
        panel(B, plaqueKey(1313), (st.axis === 'x' ? cx : 0), y + 1.9, st.wc + 0.09, 0, 1, 1.0, 0.5);
        spot(sc, y, sz + 1.4, k, { item: 'ring', hero: true, dist: 16 });
        spot(a + 1.4, y, Z0 + 2.4, k, { dist: 15 }); spot(b - 1.9, y, Z0 + 2.6, k, { dist: 15 });
        lab.hero = { kind: 'suite', level: 3, x: sc, y, z: sz, room: 1313 };
      }
    }
    // corridor dressing: sconces on the core faces, an ice machine, room-service trays, two lamps
    const sc = [[cx - 6, cz0 - 0.22, 0, -1], [cx - 2, cz0 - 0.22, 0, -1], [cx + 6, cz0 - 0.22, 0, -1], [cx - 6, cz1 + 0.22, 0, 1], [cx - 2, cz1 + 0.22, 0, 1], [cx0 - 0.22, cz - 3, -1, 0], [cx0 - 0.22, cz + 3, -1, 0], [cx1 + 0.22, cz - 2, 1, 0], [cx1 + 0.22, cz + 2, 1, 0]];
    for (const [px, pz] of sc) {
      if (k === 3) {                                                                                    // hidden floor: sconces are separate meshes so the runtime can flicker them
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xa8d8ff })); m.position.set(px, y + 2.3, pz); m.name = 'hotel_sconce'; ctx.group.add(m); lab.flick.push(m);
      } else B.box('g:ffb860', px, y + 2.3, pz, 0.3, 0.4, 0.3);
      sconces++;
    }
    S('m:metal', cx - 5.4, y, cz0 - 0.85, cx - 4.6, y + 1.7, cz0 - 0.15, 0.5); B.box('g:60c0ff', cx - 5.0, y + 1.25, cz0 - 0.14, 0.5, 0.3, 0.03);   // ice machine
    for (const [tx, tz] of [[cx - 9.3, cz0 - 0.9], [cx + 9.3, cz1 + 0.9]]) {                             // room-service trays, cloche on top
      B.box('m:metal', tx, y + 0.9, tz, 0.5, 0.05, 0.36); B.box('m:metal', tx, y + 0.98, tz, 0.3, 0.16, 0.24); B.solid('m:wood_dark', tx, y + 0.42, tz, 0.5, 0.84, 0.36, { uv: 0.5 });
      spot(tx, y, tz + (tz < cz ? -0.45 : 0.45), k, k === 1 && tx < cx ? { item: 'key', hero: true, dist: 9 } : { dist: 9 + k * 2 });
      trays++;
    }
    const e = (px, pz, color, inten) => ctx.emitters.push({ pos: new THREE.Vector3(px, y + 2.7, pz), color, intensity: inten, distance: 12, group: 'facility', flicker: k === 3 ? 0.5 : 0.12 });
    if (k === 3) { e(X0 + 6.7, Z0 + 6.7, 0xb0d8ff, 0.8); e(X1 - 6.7, Z0 + 6.7, 0xb0d8ff, 0.8); e(X0 + 6.7, Z1 - 6.7, 0xb0d8ff, 0.8); e(X1 - 6.7, Z1 - 6.7, 0xb0d8ff, 0.8); }
    else if (k === 1) { e(X0 + 6.7, Z0 + 6.7, 0xffc078, 0.9); e(X1 - 6.7, Z1 - 6.7, 0xffc078, 0.9); } else { e(X1 - 6.7, Z0 + 6.7, 0xffc078, 0.9); e(X0 + 6.7, Z1 - 6.7, 0xffc078, 0.9); }
  };
  for (let k = 1; k <= 3; k++) level(k);

  // ------------------------------------------------------------------------------------------------ level 0: the lobby (reception, sofas, piano, planters, warm light)
  {
    const y = Y;
    const lobby = [
      [cx, Z0 + 2.3, 6.0, 1.1, 0.95, 'm:wood_dark'],                                                   // reception desk
      [X0 + 2.0, cz - 6.5, 2.4, 0.95, 0.85, 'm:fabric'], [X0 + 2.0, cz + 6.5, 2.4, 0.95, 0.85, 'm:fabric'], [X1 - 2.0, cz - 6.5, 2.4, 0.95, 0.85, 'm:fabric'], [X1 - 2.0, cz + 6.5, 2.4, 0.95, 0.85, 'm:fabric'],
      [X1 - 3.2, Z1 - 2.6, 2.0, 1.1, 1.6, 'm:wood_dark'],                                              // the piano nobody plays
      [X0 + 1.4, Z0 + 1.4, 0.7, 1.2, 0.7, 'm:leaves'], [X1 - 1.4, Z0 + 1.4, 0.7, 1.2, 0.7, 'm:leaves'], [X0 + 1.4, Z1 - 1.4, 0.7, 1.2, 0.7, 'm:leaves'],
    ];
    let placed = 0;
    for (const [px, pz, sx, sy, sz, key] of lobby) {
      const alongZ = key === 'm:fabric' && Math.abs(px - cx) > 8;
      const w = alongZ ? sz : sx, dd = alongZ ? sx : sz;
      if (!free(px - w / 2, pz - dd / 2, px + w / 2, pz + dd / 2, 0.55)) continue;
      B.solid(key, px, y + sy / 2, pz, w, sy, dd, { uv: 0.5 });
      placed++;
    }
    for (const [px, pz] of [[X0 + 5, Z0 + 5], [X1 - 5, Z0 + 5], [X0 + 5, Z1 - 5], [X1 - 5, Z1 - 5]]) {
      B.box('g:ffe0b0', px, y + FH - TS - 0.06, pz, 1.4, 0.06, 1.4);
      ctx.emitters.push({ pos: new THREE.Vector3(px, y + 3.0, pz), color: 0xffc078, intensity: 1.0, distance: 14, group: 'facility', flicker: 0.05 });
    }
    // the master key on the desk (guaranteed), a spot by each sofa
    const keyAt = [[cx, Z0 + 3.6], [cx + 2.6, Z0 + 3.6], [cx - 2.6, Z0 + 3.6], [cx, Z0 + 5.0]].find(([x, z]) => ctx.nav.walkableAt(x, z));
    if (keyAt) ctx.scrapSpots.push({ x: keyAt[0], y, z: keyAt[1], room: r.id, type: 'hotel_desk', dist: 6, item: 'key', hero: true });
    for (const [x, z] of [[X0 + 3.6, cz - 6.5], [X1 - 3.6, cz + 6.5], [X0 + 4.4, Z1 - 3.2]]) if (ctx.nav.walkableAt(x, z)) ctx.scrapSpots.push({ x, y, z, room: r.id, type: 'hotel_lobby', dist: 7 });
    // the sign over the core's west face
    panel(B, 'e:hz_sign:3a3a3a', cx0 - 0.17, y + 2.75, cz + 0.0, -1, 0, 3.6, 0.9);
    lab.lobby = { placed };
  }

  // ------------------------------------------------------------------------------------------------ ground floor: brass number plaques beside every door of a guest room
  let plaques = 0;
  const ri = (i) => (i >= 0 ? L.roomOf[i] : -1);
  let nGuest = 0;
  const guestNo = new Map();
  for (const q of L.rooms) if (q.type === 'guest' || q.type === 'suite') guestNo.set(q.id, 101 + nGuest++);
  for (const inf of L.edgeInfo.values()) {
    if (inf.type !== 'door' || inf.a < 0 || inf.b < 0) continue;
    const ra = ri(inf.a), rb = ri(inf.b), ga = ra >= 0 && guestNo.has(ra), gb = rb >= 0 && guestNo.has(rb);
    if (ga === gb) continue;                                                 // guest room on exactly one side
    const roomSideA = ga, no = guestNo.get(roomSideA ? ra : rb);
    const ex = L.ox + inf.cx * C, ez = L.oz + inf.cz * C;
    // the plaque goes on the corridor side of the wall, 1.2 m along the wall from the door
    const along = hash2(inf.a, inf.b, 83) < 0.5 ? -1.25 : 1.25;
    const dirN = inf.dir === 0 ? [roomSideA ? 1 : -1, 0] : [0, roomSideA ? 1 : -1];   // pointing from the room side to the corridor side
    const px = ex + dirN[0] * 0.06 + (inf.dir === 0 ? 0 : along), pz = ez + dirN[1] * 0.06 + (inf.dir === 0 ? along : 0);
    panel(B, plaqueKey(no), px, Y + 1.55, pz, dirN[0], dirN[1], 0.5, 0.25);
    plaques++;
  }
  for (const q of L.rooms) if (['guest', 'suite', 'laundry', 'kitchen', 'ballroom', 'nest'].includes(q.type)) lab.spawnSpots.push({ x: K.wx(q.cx) + C / 2, z: K.wz(q.cz) + C / 2, room: q.id, dist: K.roomDist(q) });
  lab.spawnSpots.sort((a, b) => b.dist - a.dist); lab.spawnSpots.length = Math.min(lab.spawnSpots.length, 16);

  const built = B.build('hotel');
  lab.built = built; lab.solids = B.cols;
  lab.holes = holes;
  lab.stats = { levels: HZ.levels, dnd: lab.dnd.length, open: nOpen, sealed: nSealed, sconces, trays, plaques, guests: nGuest, hero: !!lab.hero };
  lab.dispose = () => { try { cl.dispose(); gm.dispose?.(); } catch { /* gone */ } };
  return { lab };
}
