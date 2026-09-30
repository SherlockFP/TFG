// THE DARK WEB (wave 12, docs/wave12/labyr12.md): a pitch-black network of low tunnels under the live stream. No lamps, no ambient light: the only glow is trim (LED strips at the skirting, dim amber
// door frames, dead terminals). MECHANIC = ECHOLOCATION: any loud noise sends a sonar pulse that draws the walls as a cyan wireframe for ~1.6 s, expanding from the source (echo shell:
// labyr12_echo.js, runtime + net: game/labyr12.js). The same noise alerts creatures (creatures.noise), so a pulse is a map and an alarm at once.
//   layout   the ordinary room labyrinth (plan 'rooms', many loops) with a 5x5 hub: the .ONION MARKET (auction terminal, tarp stalls, guaranteed hero loot)
//   look     dw_wall / dw_floor / dw_ceil, cable bundles crowding the corridor walls (visual only, tunnels read narrow), server-rack rooms, hex packets chasing along the LED strips
//   tells    strips colour by depth (cyan near the entrance, blue, magenta deep), amber door frames, green exit signs (practicals), terminal screens
// Merged static geometry (one LabBuilder) + ONE line mesh for the echo. No THREE lights, constant scene cost. Deterministic (layout + hash2, no shared RNG stream order).
import { layoutKit, SPECIAL_ROOMS } from './common.js';
import { LabBuilder, hash2 } from './lab_kit.js';
import { doorLanes, makeFree, panel } from './labyr10_kit.js';
import { buildEcho } from './labyr12_echo.js';
import { installLabyr12Textures } from '../../render/labyr12_textures.js';

installLabyr12Textures();
SPECIAL_ROOMS.add('dw_market');

export const DW_TYPES = ['dw_market', 'dw_rack', 'dw_cell', 'dw_relay'];
const R = (o) => ({ floor: 'dw_floor', wall: 'dw_wall', ceil: 'dw_ceil', lamp: null, wall_: [], clutter: [], posters: 0, ...o });
const GEN = R({ floor: 'concrete_dark', wall_: ['generator', 'fuse_box'], clutter: ['barrel'], reactor: true });
const VAULT = R({ floor: 'metal_plate', wall: 'metal_plate' });

export const DARKWEB = {
  id: 'darkweb',
  name: 'The Dark Web',
  blurb: 'No lamps, no signal, no mercy. Knock to see the tunnels, and everything down here hears you knock.',
  style: {
    corridor: { floor: 'dw_floor', wall: 'dw_wall', ceil: 'dw_ceil', base: null },
    rooms: {
      entrance: R({ wall_: ['vending_machine', 'bench'], clutter: ['cardboard_boxes'] }),
      dw_market: R({ wall_: ['crate_metal', 'shelf_metal', 'crate_metal'], clutter: ['barrel', 'cardboard_boxes'] }),
      dw_rack: R({ rows: 'server_rack_prop', wall_: ['server_rack_prop', 'fuse_box'], clutter: ['cardboard_boxes'] }),
      dw_cell: R({ wall_: ['desk_computer', 'filing_cabinet'], clutter: ['office_chair', 'cardboard_boxes'] }),
      dw_relay: R({ wall_: ['fuse_box', 'generator'], clutter: ['barrel'] }),
      generator: GEN,
      vault: VAULT,
      core: VAULT,
      nest: R({ clutter: ['cobweb', 'hanging_chains'], webs: true }),
    },
  },
  roomTypes: [['dw_rack', 4], ['dw_cell', 4], ['dw_relay', 2], ['nest', 1], ['dw_rack', 3, true], ['dw_relay', 1, true]],
  roomHeight(type) { return type === 'dw_market' ? 6.2 : type === 'entrance' ? 3.4 : type === 'dw_rack' ? 3.0 : 2.8; },
  layout: { plan: 'rooms', doorP: 0.4, blastP: 0.04, loops: 0.75, bigChance: 0.22, corridorH: 2.6, hub: { type: 'dw_market', w: 5, h: 5 }, hubAlways: true, lockedP: 0.1, roomMul: 1.1 },
  lamps: { corridor: 'cobweb', every: 3, flicker: 0 },       // the corridor "lamp" slot holds a cobweb: the generator still walks its lamp grid, but nothing shines
  lampColor: 0x0a4a48,                                       // practicals (dim ceiling strips in rooms + exit signs) inherit this: a faint teal, far below torch level
  practicals: { corridor: 9999 },
  posters: [],
  landmarks: ['server_rack_prop', 'crate_metal'],
  doorProp: 'door_single',
  corridorScrap: 0.09,
  footstep: { dw_floor: 'metal', metal_plate: 'metal', concrete_dark: 'concrete' },
  ambience: { base: 'ambience_darkweb', vol: 0.55, buzz: null, buzzVol: 0, env: 'facility' },
  atmosphere: { fog: 0x000205, density: 0.09, hemi: 0.012, ambient: 0.0 },
  noFlood: DW_TYPES,
  decorate: decorateDark,
};

const IN = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const TRIM = ['0e9a90', '1c5cff', 'b0208a'];
const DOT_A = 'g:8fffee', DOT_B = 'g:8ffff0';
const NO_FOG = ['g:7a4a10', 'g:20ff70'];

function decorateDark(ctx) {
  const L = ctx.layout, K = layoutKit(L), Y = ctx.Y, C = K.C;
  const B = new LabBuilder(ctx), lanes = doorLanes(L), free = makeFree(ctx, lanes);
  const lab = { id: 'darkweb', spawnSpots: [], hero: null, chase: { a: [], b: [] }, echo: null, built: null };
  let maxD = 1;
  for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && (L.distOf[i] || 0) > maxD) maxD = L.distOf[i];

  // ------------------------------------------------------------------------------------------------ trim: LED strips + hex packets + cable bundles on the corridor walls
  let strips = 0, cables = 0, dots = 0, frames = 0;
  for (let z = 0; z < K.H; z++) for (let x = 0; x < K.W; x++) {
    const i = L.idx(x, z);
    if (L.cells[i] !== 2) continue;
    const dn = (L.distOf[i] || 0) / maxD, col = TRIM[dn < 0.33 ? 0 : dn < 0.66 ? 1 : 2];
    for (let d = 0; d < 4; d++) {
      if (K.edgeBusy(x, z, d)) continue;
      const h = hash2(x, z, 11 + d), [ex, ez] = K.edgeCenter(x, z, d), [ix, iz] = IN[d], alongX = d % 2 === 1;
      if (h < 0.5) {
        B.box('g:' + col, ex + ix * 0.03, Y + 0.24, ez + iz * 0.03, alongX ? 3.4 : 0.05, 0.05, alongX ? 0.05 : 3.4);
        strips++;
        for (let k = 0; k < 7; k++) {                                // packets: two interleaved sets, toggled by lab.tick
          const u = -1.5 + k * 0.5;
          B.box(k % 2 ? DOT_B : DOT_A, ex + ix * 0.04 + (alongX ? u : 0), Y + 0.33, ez + iz * 0.04 + (alongX ? 0 : u), 0.09, 0.09, 0.09);
          dots++;
        }
      } else if (h < 0.82) {
        B.box('m:dw_cable', ex + ix * 0.2, Y + 1.85, ez + iz * 0.2, alongX ? 3.6 : 0.34, 0.34, alongX ? 0.34 : 3.6, 0.5);
        if (h < 0.6) B.box('m:dw_cable', ex + ix * 0.2, Y + 1.25, ez + iz * 0.2, alongX ? 3.2 : 0.3, 0.28, alongX ? 0.3 : 3.2, 0.5);
        cables++;
      }
    }
  }
  // dim amber door frames: every doorway is findable in the dark (posts + lintel, visual only)
  for (const inf of L.edgeInfo.values()) {
    if (inf.type === 'vault' || inf.type === 'contain') continue;
    const ex = L.ox + inf.cx * C, ez = L.oz + inf.cz * C, w = (inf.width || 2.6) / 2, dh = Math.min(inf.doorH || 2.5, 3.0);
    const px = inf.dir === 0 ? [0, 1] : [1, 0];                       // along the wall
    const off = 0.06, nx = inf.dir === 0 ? off : 0, nz = inf.dir === 0 ? 0 : off;
    for (const sd of [-1, 1]) for (const s of [-1, 1]) {
      B.box('g:7a4a10', ex + sd * nx + px[0] * w * s, Y + dh / 2, ez + sd * nz + px[1] * w * s, 0.08, dh, 0.08);
    }
    for (const sd of [-1, 1]) B.box('g:7a4a10', ex + sd * nx, Y + dh, ez + sd * nz, inf.dir === 0 ? 0.08 : w * 2, 0.08, inf.dir === 0 ? w * 2 : 0.08);
    frames++;
  }

  // ------------------------------------------------------------------------------------------------ hero: the .ONION MARKET (auction terminal, stalls, guaranteed loot)
  const hubs = L.rooms.filter((r) => r.type === 'dw_market');
  const mk = hubs[0] || null;
  let stalls = 0;
  if (mk) {
    const rc = K.roomRect(mk), cx = (rc.x0 + rc.x1) / 2, cz = (rc.z0 + rc.z1) / 2, h = mk.height || 6.2;
    // the auction terminal: a black pillar with a live screen on every face
    if (free(cx - 0.7, cz - 0.7, cx + 0.7, cz + 0.7, 0.5)) {
      B.solid('m:dw_wall', cx, Y + 1.2, cz, 1.2, 2.4, 1.2);
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) panel(B, 'e:dw_screen:20c040', cx + nx * 0.62, Y + 0.9, cz + nz * 0.62, nx, nz, 1.0, 1.1);
      B.box('g:20ff70', cx, Y + 2.46, cz, 1.0, 0.06, 1.0);
    }
    // stalls: counters along the two long sides, tarp roof over each, a monitor on the counter face
    for (const sx of [-1, 1]) for (const dz of [-6.2, -3.1, 0, 3.1, 6.2]) {
      const px = cx + sx * 6.6, pz = cz + dz;
      if (!free(px - 0.6, pz - 1.3, px + 0.6, pz + 1.3, 0.5)) continue;
      B.solid('m:dw_tarp', px, Y + 0.5, pz, 1.0, 1.0, 2.6, { uv: 0.6 });
      B.box('m:dw_tarp', px + sx * 0.3, Y + 2.35, pz, 1.8, 0.08, 2.9, 0.5);
      for (const cz2 of [-1.35, 1.35]) B.box('m:metal_dark', px + sx * 1.1, Y + 1.15, pz + cz2, 0.07, 2.3, 0.07);
      panel(B, 'e:dw_screen:20c040', px - sx * 0.52, Y + 0.45, pz, -sx, 0, 1.5, 0.45);
      stalls++;
    }
    panel(B, 'e:dw_sign:2a4a44', cx, Y + 3.6, rc.z0 + 0.08, 0, 1, 5.6, 1.4);
    // hero loot: one guaranteed gold bar just south of the terminal, plus two stall spots
    const cand = [[cx, cz + 2.4], [cx + 2.4, cz], [cx - 2.4, cz], [cx, cz - 2.4], [cx + 2.6, cz + 2.6]];
    const at = cand.find(([x, zz]) => ctx.nav.walkableAt(x, zz));
    let placed = 0;
    if (at) { ctx.scrapSpots.push({ x: at[0], y: Y, z: at[1], room: mk.id, type: 'dw_hero', dist: 9, item: 'goldbar', hero: true }); placed++; }
    for (const [x, zz] of [[cx - 4.6, cz - 2], [cx + 4.6, cz + 2], [cx - 4.6, cz + 4.4]]) if (ctx.nav.walkableAt(x, zz)) { ctx.scrapSpots.push({ x, y: Y, z: zz, room: mk.id, type: 'dw_stall', dist: 8 }); placed++; }
    lab.hero = { room: mk.id, x: cx, z: cz, kind: 'auction', spots: placed, stalls };
    void h;
  }
  // a hidden-service spot in every cell room (a locked-away desk: worth the detour)
  for (const r of L.rooms) if (r.type === 'dw_cell' && !r.treasure && !r.arena) {
    const x = K.wx(r.cx) + C / 2, zz = K.wz(r.cz) + C / 2;
    if (ctx.nav.walkableAt(x, zz)) ctx.scrapSpots.push({ x, y: Y, z: zz, room: r.id, type: 'dw_cell', dist: K.roomDist(r) });
  }
  // creatures wait in the deep rooms and the racks
  for (const r of L.rooms) if (['dw_rack', 'dw_relay', 'dw_cell', 'nest'].includes(r.type)) lab.spawnSpots.push({ x: K.wx(r.cx) + C / 2, z: K.wz(r.cz) + C / 2, room: r.id, dist: K.roomDist(r) });
  lab.spawnSpots.sort((a, b) => b.dist - a.dist); lab.spawnSpots.length = Math.min(lab.spawnSpots.length, 16);

  // ------------------------------------------------------------------------------------------------ echo shell + build
  lab.echo = buildEcho({ layout: L, Y, group: ctx.group });
  const own = [];
  const built = B.build('darkweb');
  built.traverse((m) => {
    if (!m.isMesh) return;
    const k = m.userData.levelKey;
    if (k === DOT_A) lab.chase.a.push(m); else if (k === DOT_B) lab.chase.b.push(m);
    if (NO_FOG.includes(k)) { m.material = m.material.clone(); m.material.fog = false; own.push(m.material); }   // the tells that must survive the fog: door frames + the auction beacon
  });
  lab.built = built; lab.solids = B.cols;
  lab.stats = { strips, cables, dots, frames, stalls, segments: lab.echo.segments, walls: lab.echo.walls };
  lab.tick = (dt, t) => {                                             // called from game/labyr12.js every frame: the hex packets crawl along the strips
    const on = ((t * 2.5) | 0) % 2 === 0;
    for (const m of lab.chase.a) m.visible = on;
    for (const m of lab.chase.b) m.visible = !on;
  };
  lab.dispose = () => { try { lab.echo?.dispose(); for (const m of own) m.dispose(); } catch { /* gone */ } };
  return { lab };
}
