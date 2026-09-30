// MIRROR FUNHOUSE (wave 10, docs/wave10/labyr10.md): an abandoned "viral challenge" funhouse the Algorithm keeps streaming. Layout = labyr10_plan.js planFun
// (foyer -> midway -> spinning tunnel -> mirror maze, crooked rooms on the sides, everything else from the room table). This file: styles + decorate().
//   look    big-top stripes, purple checker floors, carnival bulbs chasing along the corridors (two glow sets that alternate at runtime), clown-meme murals,
//           mirror walls (fh_mirror: cheap glare + wave texture, NO real-time reflection) with the odd "ghost" reflection of someone who is not there
//   maze    the far room is a mirror MAZE (facility maze carver, braid style); hall rooms get free-standing mirror panels on a 4 m lattice (aisles >= 1.6 m)
//   crooked tilted rooms: diagonal wall texture, vertigo floor, a canted false ceiling and furniture rolled 8-16 degrees (visual; upright colliders)
//   hero    the SPINNING TUNNEL: a 1-cell-wide, 8-cell-long room whose walkway is flat and still; a striped shell rotates around it (visual only, ticked by
//           game/labyr10.js). Guaranteed figurine spot in the middle of the tunnel.
// Merged static geometry (one LabBuilder), no THREE lights, the only non-merged meshes are the rotating shell. Deterministic (layout hashes).
import * as THREE from 'three';
import { layoutKit, SPECIAL_ROOMS } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';
import { doorLanes, makeFree, panel, tiltBox } from './labyr10_kit.js';
import { FUN_TYPES } from './labyr10_plan.js';
import { installLabyr10Textures, FUN_MURALS } from '../../render/labyr10_textures.js';

installLabyr10Textures();
for (const ty of ['fun_midway', 'fun_spin', 'fun_maze']) SPECIAL_ROOMS.add(ty);

const C_PINK = 0xff6ac8, C_GLOW = 0x1c2a3a;
const R = (o) => ({ ceil: 'fh_back', lamp: 'ceiling_lamp', lampColor: C_PINK, wall: 'fh_stripes', wall_: [], clutter: [], posters: 0, ...o });
const GEN = { floor: 'concrete', wall: 'fh_back', ceil: 'metal_dark', lamp: 'ceiling_lamp', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true };
const VAULT = { floor: 'metal_plate', wall: 'metal_plate', ceil: 'metal_dark', lamp: 'wall_lamp', wall_: [], clutter: [] };

export const FUNHOUSE = {
  id: 'funhouse',
  name: 'Mirror Funhouse',
  blurb: 'A viral challenge that never ended. Hall of mirrors, crooked rooms and a tunnel that spins. Someone is still smiling in the glass.',
  style: {
    corridor: { floor: 'fh_checker', wall: 'fh_stripes', ceil: 'fh_back', base: null },
    rooms: {
      entrance: R({ floor: 'fh_checker', wall_: ['bench', 'planter', 'vending_machine'], clutter: ['planter', 'cardboard_boxes'], posters: 2 }),
      fun_midway: R({ floor: 'fh_checker', lamp: 'wall_lamp', wall_: ['slot_machine', 'arcade_cabinet', 'vending_machine'], clutter: ['cardboard_boxes'], posters: 2 }),
      fun_spin: R({ floor: 'metal_plate', wall: 'fh_back', lamp: null }),
      fun_maze: R({ floor: 'fh_checker', wall: 'fh_mirror', lamp: 'wall_lamp', lampColor: 0xb8b0ff }),
      fun_hall: R({ floor: 'fh_checker', wall: 'fh_mirror', lamp: 'wall_lamp', lampColor: 0xff8ad8 }),
      fun_crooked: R({ floor: 'fh_tilt', wall: 'fh_diag', ceil: 'fh_stripes', lampColor: 0xffe070, wall_: ['bookcase', 'cupboard', 'armchair'], clutter: ['cardboard_boxes'], posters: 1 }),
      prize: R({ floor: 'fh_checker', wall_: ['vending_machine', 'shelf_metal', 'slot_machine', 'arcade_cabinet'], clutter: ['cardboard_boxes'], posters: 2 }),
      backstage: R({ floor: 'concrete_stained', wall: 'fh_back', ceil: 'metal_dark', lamp: 'fluorescent', lampColor: 0xd0c8ff, wall_: ['suit_rack', 'cupboard', 'locker'], clutter: ['cardboard_boxes', 'mop_bucket'] }),
      generator: GEN,
      vault: VAULT,
      core: VAULT,
      nest: R({ floor: 'fh_checker', lamp: null, clutter: ['cobweb', 'hanging_chains'], webs: true }),
    },
  },
  roomTypes: [['prize', 3], ['backstage', 3], ['fun_crooked', 3], ['nest', 1], ['fun_hall', 5, true], ['fun_crooked', 2, true]],
  roomHeight(type) {
    if (type === 'fun_midway') return 5.2;
    if (type === 'fun_spin') return 4.6;
    if (type === 'fun_maze') return 3.6;
    if (type === 'fun_hall') return 4.2;
    if (type === 'fun_crooked') return 3.8;
    if (type === 'entrance') return 4.0;
    if (type === 'backstage') return 3.2;
    return 3.4;
  },
  layout: { plan: 'wings', arch: 'fun', doorP: 0.3, blastP: 0, loops: 0.12, bigChance: 0.35, corridorH: 3.0, hub: null, lockedP: 0.1, roomMul: 0.9 },
  lamps: { corridor: 'ceiling_lamp', every: 3, color: 0xffa0d8, flicker: 0.2 },
  lampColor: C_PINK,
  practicals: { corridor: 2 },
  posters: ['poster_like', 'poster_missing', 'graffiti', 'poster_hang'],
  landmarks: ['planter', 'slot_machine', 'arcade_cabinet'],
  doorProp: 'door_single',
  corridorScrap: 0.08,
  footstep: { fh_checker: 'tile', fh_tilt: 'tile', metal_plate: 'metal', concrete_stained: 'concrete' },
  ambience: { base: 'ambience_funhouse', vol: 0.5, buzz: 'lights_buzz', buzzVol: 0.06, env: 'facility' },
  atmosphere: { fog: 0x14061c, density: 0.055 },
  noFlood: FUN_TYPES,
  decorate: decorateFun,
};

const SET_A = ['ff2a6a', 'ffd23a'], SET_B = ['38d8ff', '7aff5a'];
const bulbKey = (i) => 'g:' + (i % 2 ? SET_B : SET_A)[(i >> 1) % 2];

function decorateFun(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C, rng = ctx.rng;
  const B = new LabBuilder(ctx), lanes = doorLanes(L), free = makeFree(ctx, lanes);
  const lab = { id: 'funhouse', spawnSpots: [], hero: null, shell: null, chase: { a: [], b: [] }, built: null, pa: 'fun' };
  const has = (fn) => L.rooms.filter(fn);
  let nEm = 0;
  const glow = (pos, color, intensity, distance, flicker = 0) => { if (nEm++ < 14) ctx.emitters.push({ pos, color, intensity, distance, group: 'facility', flicker }); };

  // ------------------------------------------------------------------------------------------------ carnival bulbs: straight corridor cells + string lines across big halls
  let bulbs = 0, bi = 0;
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2) continue;
    const ax = K.straightAxis(x, z);
    if (!ax) continue;
    const cx = K.wx(x) + C / 2, cz = K.wz(z) + C / 2, y = Y + (L.heightOf[i] || 3) - 0.32;
    B.box('m:metal_dark', cx, y + 0.06, cz, ax === 'x' ? C : 0.03, 0.03, ax === 'x' ? 0.03 : C);
    for (let t = -1.6; t <= 1.61; t += 0.8, bi++) { B.box(bulbKey(bi), ax === 'x' ? cx + t : cx, y - 0.05 + (Math.abs(t) < 0.1 ? -0.08 : 0), ax === 'x' ? cz : cz + t, 0.14, 0.14, 0.14); bulbs++; }
  }
  for (const r of has((q) => q.type === 'fun_midway' || q.type === 'entrance')) {
    const rc = K.roomRect(r), h = r.height || 4;
    for (let z = rc.z0 + 3; z < rc.z1 - 1.5; z += 4) {
      B.box('m:metal_dark', (rc.x0 + rc.x1) / 2, Y + h - 0.5, z, rc.x1 - rc.x0 - 0.6, 0.03, 0.03);
      for (let x = rc.x0 + 0.6; x < rc.x1 - 0.5; x += 1.0, bi++) { B.box(bulbKey(bi), x, Y + h - 0.6 + Math.sin(x * 1.3) * 0.12, z, 0.14, 0.14, 0.14); bulbs++; }
    }
  }

  // ------------------------------------------------------------------------------------------------ midway: game booths + the big sign + colour pools
  const mid = has((r) => r.fun === 'midway')[0];
  if (mid) {
    const rc = K.roomRect(mid), cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2, h = mid.height || 5.2;
    let nb = 0;
    for (const [dx, dz, rot] of [[-6, -3.5, 0], [6, -3.5, 0], [-6, 3.5, 0], [6, 3.5, 0], [0, -5, 1]]) {
      const px = cx + dx, pz = cz + dz, sx = rot ? 1.3 : 2.6, sz = rot ? 2.6 : 1.3;
      if (!free(px - sx / 2, pz - sz / 2, px + sx / 2, pz + sz / 2, 0.6)) continue;
      B.solid('m:fh_stripes', px, Y + 0.55, pz, sx, 1.1, sz, { uv: 0.4 });
      B.box('m:metal_dark', px, Y + 1.13, pz, sx + 0.1, 0.06, sz + 0.1);
      for (const a of [-1, 1]) for (const b of [-1, 1]) B.box('m:metal_dark', px + a * (sx / 2 - 0.05), Y + 1.6, pz + b * (sz / 2 - 0.05), 0.07, 1.0, 0.07);
      B.box('m:fh_stripes', px, Y + 2.2, pz, sx + 0.5, 0.16, sz + 0.5, 0.4);
      B.box(`g:${(nb & 1 ? SET_B : SET_A)[0]}`, px, Y + 2.08, pz, sx + 0.3, 0.05, sz + 0.3);
      for (let k = 0; k < 3; k++) B.box('m:plastic', px - 0.7 + k * 0.7, Y + 1.25, pz, 0.28, 0.32, 0.28, 1);   // rigged milk bottles
      nb++;
    }
    panel(B, 'e:fh_sign:404040', cx, Y + 3.2, rc.z1 - 0.2, 0, -1, 4.6, 1.15);
    glow(new THREE.Vector3(cx - 7, Y + h - 1.2, cz), 0xff3a9a, 1.0, 14, 0.15); glow(new THREE.Vector3(cx + 7, Y + h - 1.2, cz), 0x38d8ff, 1.0, 14, 0.1);
    lab.hero2 = { room: mid.id, x: cx, z: cz };
  }

  // ------------------------------------------------------------------------------------------------ hero: the spinning tunnel
  const tun = has((r) => r.fun === 'spin')[0];
  if (tun) {
    const rc = K.roomRect(tun), cx = (rc.x0 + rc.x1) / 2, len = rc.z1 - rc.z0, cz = (rc.z0 + rc.z1) / 2, RAD = 2.1, CY = Y + 1.4;
    const geo = new THREE.CylinderGeometry(RAD, RAD, len - 0.5, 8, 1, true);
    geo.rotateX(Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * (len - 0.5) / 2);
    const tex = ctx.levelMaterial('fh_spin', {}).map;
    const mat = new THREE.MeshBasicMaterial({ map: tex || null, side: THREE.BackSide, color: 0xc8c8c8 });
    const shell = new THREE.Mesh(geo, mat);
    shell.position.set(cx, CY, cz); shell.name = 'fun_shell'; shell.frustumCulled = false; shell.userData.setPiece = true;
    ctx.group.add(shell);
    lab.shell = shell; lab.shellMat = mat;
    // still walkway lights (two rows of floor studs) + a magenta frame at both mouths
    for (let z = rc.z0 + 1; z < rc.z1 - 0.5; z += 2) for (const sx of [-1.45, 1.45]) B.box('g:ff2a6a', cx + sx, Y + 0.04, z, 0.12, 0.05, 0.12);
    for (const zz of [rc.z0 + 0.25, rc.z1 - 0.25]) {
      B.box('g:ffd23a', cx, Y + 3.55, zz, 3.6, 0.14, 0.14); B.box('g:ffd23a', cx - 1.8, Y + 1.8, zz, 0.14, 3.6, 0.14); B.box('g:ffd23a', cx + 1.8, Y + 1.8, zz, 0.14, 3.6, 0.14);
    }
    for (let k = 0; k < 3; k++) glow(new THREE.Vector3(cx, Y + 3.0, rc.z0 + len * (k + 0.5) / 3), k === 1 ? 0xff3aa0 : 0x7a5aff, 0.9, 10, 0.1);
    // hero loot: a guaranteed figurine in the middle of the walkway, two ordinary spots on the way
    const mids = [[cx, cz], [cx, rc.z0 + len * 0.25], [cx, rc.z0 + len * 0.75]];
    let placed = 0;
    for (const [x, z] of mids) if (ctx.nav.walkableAt(x, z)) { ctx.scrapSpots.push({ x, y: Y, z, room: tun.id, type: 'fun_spin', dist: 9, ...(placed === 0 ? { item: 'figurine', hero: true } : {}) }); placed++; }
    lab.hero = { room: tun.id, x: cx, z: cz, spots: placed, kind: 'spinning_tunnel', len };
  }

  // ------------------------------------------------------------------------------------------------ mirror halls: lattice of free-standing mirror panels
  let panels = 0, ghosts = 0;
  for (const r of has((q) => q.type === 'fun_hall' && !q.maze)) {
    const rc = K.roomRect(r);
    let ix = 0;
    for (let x = rc.x0 + 3; x < rc.x1 - 2; x += 4, ix++) for (let z = rc.z0 + 3, iz = 0; z < rc.z1 - 2; z += 4, iz++) {
      const along = (ix + iz) & 1 ? 1 : 0, sx = along ? 2.4 : 0.16, sz = along ? 0.16 : 2.4;
      if (!free(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 0.55)) continue;
      const ghost = hash2(Math.round(x), Math.round(z), 31) < 0.16;
      B.solid(`e:${ghost ? 'fh_mirror_ghost' : 'fh_mirror'}:1c2a3a`, x, Y + 1.3, z, sx, 2.6, sz, { uv: 0.42 });
      panels++; if (ghost) ghosts++;
    }
    glow(new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + (r.height || 4.2) - 1.0, (rc.z0 + rc.z1) / 2), 0x9a8aff, 0.85, 12, 0.12);
  }
  // ghost reflections on maze / hall walls: "someone standing behind you"
  const maze = has((q) => q.maze && q.type === 'fun_maze').concat(has((q) => q.maze && q.type === 'fun_hall'));
  for (const r of maze) {
    const IN = [[-1, 0], [0, -1], [1, 0], [0, 1]];
    for (let zz = r.z; zz < r.z + r.h; zz++) for (let xx = r.x; xx < r.x + r.w; xx++) for (const d of [0, 1]) {
      const nx = xx + (d === 0 ? 1 : 0), nz = zz + (d === 1 ? 1 : 0);
      if (nx >= r.x + r.w || nz >= r.z + r.h || L.open.has(K.ek(xx, zz, d))) continue;
      if (hash2(xx, zz, 33 + d) > 0.2) continue;
      const [ex, ez] = K.edgeCenter(xx, zz, d), face = hash2(xx, zz, 35) < 0.5 ? d : d + 2, [ix, iz] = IN[face];
      panel(B, 'e:fh_mirror_ghost:1c2a3a', ex + ix * 0.05, Y + 0.3, ez + iz * 0.05, ix, iz, 1.7, 2.3);
      ghosts++;
    }
    lab.spawnSpots.push({ x: K.wx(r.cx) + C / 2, z: K.wz(r.cz) + C / 2, room: r.id, dist: K.roomDist(r) });
  }

  // ------------------------------------------------------------------------------------------------ crooked rooms: canted false ceiling + rolled furniture
  let tilted = 0;
  for (const r of has((q) => q.type === 'fun_crooked' && !q.maze)) {
    const rc = K.roomRect(r), h = r.height || 3.8, w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    tiltBox(B, 'm:fh_diag', (rc.x0 + rc.x1) / 2, Y + h - 0.95, (rc.z0 + rc.z1) / 2, w - 1.4, 0.16, d - 1.4, 0, 0.08, 0.5);
    let n = 0;
    for (let a = 0; a < 40 && n < 4; a++) {
      const x = rc.x0 + 1.8 + hash2(a, Math.round(rc.x0), 51) * (w - 3.6), z = rc.z0 + 1.8 + hash2(a, Math.round(rc.z0), 52) * (d - 3.6);
      const sx = 1.3 + hash2(a, 3, 53) * 0.8, sz = 0.8 + hash2(a, 4, 54) * 0.5, sy = 1.0 + hash2(a, 5, 55) * 1.0;
      if (!free(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 0.6)) continue;
      const roll = (hash2(a, 6, 56) < 0.5 ? -1 : 1) * (0.14 + hash2(a, 7, 57) * 0.14);
      tiltBox(B, n % 2 ? 'm:wood_dark' : 'm:fh_stripes', x, Y + sy / 2 + 0.05, z, sx, sy, sz, hash2(a, 8, 58) < 0.5 ? 0 : Math.PI / 2, roll, 0.6);
      B.col(x, Y + sy / 2, z, sx * 0.8, sy, sz * 0.8);
      n++; tilted++;
    }
    glow(new THREE.Vector3((rc.x0 + rc.x1) / 2, Y + h - 1.2, (rc.z0 + rc.z1) / 2), 0xffd23a, 0.8, 10, 0.2);
  }

  // ------------------------------------------------------------------------------------------------ clown-meme murals on closed walls of the public rooms and corridors
  let murals = 0;
  const wallOK = (x, z, d) => !K.edgeBusy(x, z, d) && !K.cellHasDoorway(x, z);
  const IN = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  for (let z = 0; z < K.H && murals < 16; z++) for (let x = 0; x < K.W && murals < 16; x++) {
    const i = L.idx(x, z);
    if (!L.cells[i]) continue;
    const r = L.roomOf[i] >= 0 ? L.rooms[L.roomOf[i]] : null;
    if (r && !['entrance', 'fun_midway', 'prize', 'backstage'].includes(r.type)) continue;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx >= 0 && nz >= 0 && nx < K.W && nz < K.H && L.cells[L.idx(nx, nz)]) continue;   // only walls that back onto solid rock: no doubled murals through a wall
      if (!wallOK(x, z, d) || hash2(x, z, 61 + d) > 0.11) continue;
      const [ex, ez] = K.edgeCenter(x, z, d);
      panel(B, `m:fh_clown${((hash2(x, z, 63) * FUN_MURALS) | 0) % FUN_MURALS}`, ex + IN[d][0] * 0.05, Y + 0.9, ez + IN[d][1] * 0.05, IN[d][0], IN[d][1], 2.4, 2.4);
      murals++;
      break;
    }
  }

  // creatures wait in the crooked rooms and behind the booths
  for (const r of L.rooms) if (r.type === 'fun_crooked' || r.type === 'fun_hall' || r.type === 'prize') lab.spawnSpots.push({ x: K.wx(r.cx) + C / 2, z: K.wz(r.cz) + C / 2, room: r.id, dist: K.roomDist(r) });
  lab.spawnSpots.sort((a, b) => b.dist - a.dist); lab.spawnSpots.length = Math.min(lab.spawnSpots.length, 16);

  const built = B.build('funhouse');
  built.traverse((m) => {
    if (!m.isMesh) return;
    const k = m.userData.levelKey;
    if (SET_A.some((c) => k === 'g:' + c)) lab.chase.a.push(m);
    else if (SET_B.some((c) => k === 'g:' + c)) lab.chase.b.push(m);
  });
  lab.built = built; lab.solids = B.cols;   // solids for the tests: every one is kept out of the door lanes
  lab.stats = { bulbs, panels, ghosts, murals, tilted, tunnel: !!tun, maze: maze.length };
  lab.tick = (dt, t) => {                                             // called from game/labyr10.js every frame
    if (lab.shell) lab.shell.rotation.z += dt * 0.85;
    const on = ((t * 2.2) | 0) % 2 === 0;
    for (const m of lab.chase.a) m.visible = on;
    for (const m of lab.chase.b) m.visible = !on;
  };
  lab.dispose = () => { try { lab.shell?.geometry.dispose(); lab.shellMat?.dispose(); } catch { /* gone */ } };
  void rng;
  return { lab };
}
