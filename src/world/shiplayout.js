// SHIP LAYOUT (wave 4 ship2, rebuilt in wave 5 ship_interior): pure data + tiny helpers, no three.js, node-testable (tools/harness/ship2_overlap.test.mjs).
// THE one place that says where every fixture of the default (tier 0) "Mini-Skeld" ship stands - for EVERY module: ship props, shop kiosk, contract
// board, pet incubator, decon shower, workbench, food table, frame console, horn / teleporter buttons, mirror, survival stove / brewing stand / crate /
// planter, arcade chess table, cycle3 trophy wall, polish4 hull emblem, ship2 planters, the helmet-cam monitor + LED loot board of the built-in mods.
// A new in-ship fixture gets a SPOTS entry here (+ a box in fixtureBoxes and a standing spot in ACCESS) and the overlap test proves it fits.
//
// Top view (x runs nose -> tail, z runs -3.5 north wall -> +3.5 south wall with the airlock door at x 2.6):
//
//   z -3.5  +-plant--N1-monitors-+-GALLEY: stove(quota) brew coffee charger TP arcade -N2-+-ENGINE: workbench  reactor-+
//           |                    |                                                      |____________________________|  engine bulkhead z -1.68
//           | window  lever      H    MESS: food table        (TP pad)                   | pot  LOOT BAY    suits      R1 (shipyard)
//   z  0    | box     (hatch) .. H ........ blue guide line (hatch -> airlock) ..........  |                  SHIP crate
//           |         terminal   | TROPHIES  chess table                                 | bunks  cupboard  crates
//   z +3.5  +-frame console------+-mirror--STORE+board--incubator--DECON/MED--AIRLOCK----+----------------------------+
//
// SHIPYARD ATTACHMENT POINTS (documented in docs/wave4/ship2.md, data in world/hardpoints.js): the core keeps the three doorway gaps
// R1 (+x wall, z -1.125), N1 (-z wall, x -5.4) and N2 (-z wall, x 2.25). Rooms grow OUTSIDE those doorways; nothing in this layout may fill the
// walkway in front of them (checked by the overlap test: `aisles` + the 0.9 m walker in `ACCESS`).
import { planStairs } from './stairs.js';
const PI = Math.PI;

export const SHELL = { x0: -7, x1: 7, z0: -3.5, z1: 3.5, h: 3.4, doorX: 2.6, doorW: 2.2, doorH: 2.6 };

/** engine-room bulkhead (z of its centre line): moved from -1.85 to -1.68 in wave 5 so the walkway in front of the workbench is >= 0.9 m */
export const ENGINE_Z = -1.68;
const PT = 0.16;   // partition thickness

/** Fixture positions. x, z = origin of the model (props: their own origin, see DIMS); y = mounting height for wall props; ry = rotation about Y.
 *  WAVE 5 (ship_interior): EVERY in-ship fixture of every module lives here (survival stove / brew / crate / planter, arcade chess table, cycle3 trophy
 *  wall, food table, polish4 hull emblem, ship2 planters...). Modules read their spot from this table; tools/harness/ship2_overlap.test.mjs checks them all. */
export const SPOTS = {
  // ---- cockpit (blue): flight controls on the nose side, frame console + a plant by the bulkhead
  terminal: { x: -6.25, z: 2.55, ry: PI / 2 },
  monitors: { x: -6.45, z: -2.45, ry: PI / 2 },
  lever: { x: -5.9, z: 0.9, ry: PI / 2 },
  svPlanter: { x: SHELL.x0 + 0.35, z: 0, ry: PI / 2 },   // survival built-in planter: window box under the cockpit window (faces +x)
  frame: { x: -4.9, z: 3.22 },                       // Frame Console (shipyard)
  horn: { x: -5.6, y: 1.75 },                        // +z wall panel, between the terminal and the frame console
  // ---- hub north wall = GALLEY counter: stove (quota screen above), brewing stand, coffee, charger, teleporter button, arcade cabinet
  stove: { x: -3.25, z: SHELL.z0 + 0.35, ry: 0 },    // survival built-in stove
  quota: { x: -3.25, y: 1.9, z: SHELL.z0 + 0.06, ry: 0 },
  brew: { x: -2.05, z: SHELL.z0 + 0.35, ry: 0 },     // survival built-in brewing stand
  coffee: { x: -1.1, z: SHELL.z0 + 0.4, ry: 0 },
  charger: { x: -0.35, y: 1.0, z: SHELL.z0 + 0.12, ry: 0 },
  tp: { x: 0.1, y: 1.3 },                            // -z wall panel (pad = ship.spawns[2])
  arcade: { x: 0.95, z: SHELL.z0 + 0.5, ry: 0 },
  // ---- hub south wall = SERVICES: mirror, store kiosk + contract board, pet incubator, decon shower (MED)
  mirror: { x: -3.2, y: 1.27 },                      // +z wall
  kiosk: { x: -1.75, z: 3.02 },                      // Company Store terminal
  board: { x: -1.75, y: 1.75 },                      // contract board (+z wall, above the kiosk)
  incubator: { x: -0.38, z: 2.95 },                  // pet incubator
  decon: { x: 0.86, z: 2.88 },                       // decon shower / med corner
  doorPanel: { x: 3.98, y: 1.2, z: SHELL.z1 - 0.06, ry: PI },
  // ---- hub centre = MESS: food table + chess table, trophy wall on the cockpit bulkhead (hub side)
  chess: { x: -2.25, z: 1.0, ry: PI / 2 },          // arcade chess / draughts table (stools along x)
  trophy: { x: -4.0 + PT / 2 + 0.01, z: 2.27, y: 1.62, cols: 6, rows: 2, dz: 0.38, dy: 0.5 },   // cycle3 trophy wall: face x, centre z / y, pitch, plaque scale
  // ---- engine room (orange)
  bench: { x: 4.55, z: SHELL.z0 + 0.39 + 0.03 },     // crafting workbench (wave 5: 0.1 m aft so the way in under the arch stays >= 0.9 m)
  reactor: { x: 6.35, z: -2.8 },                     // reactor core (decor + collider)
  // ---- cargo / quarters (yellow)
  suits: { x: 6.5, z: 0.3, ry: -PI / 2 },
  cupboard: { x: 5.84, z: SHELL.z1 - 0.32, ry: PI },   // south wall, between the bunks and the crate corner
  bunks: { x: 4.65, z: 2.42, ry: PI },
  crate: { x: SHELL.x1 - 0.39, z: 1.75, ry: -PI / 2 },   // survival built-in SHIP storage crate (+x wall, faces -x)
  cargo: { x: 5.05, z: 0.3, w: 1.4, d: 1.0 },        // LOOT BAY: store orders and the dropship land here (terminal.js / shop.js use dropPoint())
  // ---- outside
  emblem: { x: -0.9, y: 1.45, zOut: 3.84, xNeg: -2.2, s: 1.3 },   // polish4 hull decal (+z side at x, -z side at xNeg: clear of the KC-07 number, the windows and the N1 / N2 doorways)
};
/** where store deliveries appear: inside the yellow loot bay, i = 0.. stacks upward */
export function dropPoint(i = 0, rand = Math.random) { const c = SPOTS.cargo; return { x: c.x + (rand() - 0.5) * c.w, y: 1.2 + i * 0.25, z: c.z + (rand() - 0.5) * c.d }; }
/** food table candidates [x, z, ry], first free one wins (food.js). ry = PI / 2 puts the stools along x. */
export const TABLE_SPOTS = [[-2.3, -1.2, PI / 2], [1.95, -0.3, PI / 2], [-2.3, -1.2, 0]];
export const PAD = { x: 0, z: -1.0, r: 0.68 };      // teleporter pad = spawns[2]
export const DISCO = { x: -0.6, z: 0.5 };   // wave 5 shipdeck: was (2, 0), which is inside the stairwell now
/** ceiling lamps (world x, z) */
export const LAMPS = [[-5.4, 0], [-1.6, 0], [1.8, 2.0], [5.0, -2.6], [5.2, 1.0]];   // wave 5 shipdeck: the third lamp left the stairwell (x 0.8..2.8, z -1.6..1.3)
/** decor with a collider (crates in the cargo corner, planters). h = height, w/d footprint. */
export const DECOR = [
  { id: 'crateA', x: 6.72, z: 3.2, w: 0.5, d: 0.5, h: 0.5 },
  { id: 'crateC', x: 6.72, z: 3.2, w: 0.36, d: 0.36, h: 0.36, y: 0.5 },     // stacked on crateA
  { id: 'planterHub', x: -4.5, z: SHELL.z0 + 0.36, w: 0.6, d: 0.6, h: 0.5, planter: true },               // cockpit corner by the bulkhead
  { id: 'planterCargo', x: 3.65, z: ENGINE_Z + PT / 2 + 0.36, w: 0.6, d: 0.6, h: 0.5, planter: true },    // cargo, against the engine bulkhead by the arch
];
/** extension hooks for shipyard rooms / other agents: a planter can be added at any of these (ship2.addPlanter) */
export const PLANTER_SLOTS = [
  { id: 'planterHub', x: DECOR[2].x, z: DECOR[2].z, ry: 0, where: 'core' },
  { id: 'planterCargo', x: DECOR[3].x, z: DECOR[3].z, ry: 0, where: 'core' },
];

// prop-local bounding boxes (measured from models/props.js; the test re-measures them and fails on drift): x0,x1,z0,z1,h (+ mount y for wall props)
export const DIMS = {
  terminal: { x0: -0.7, x1: 0.7, z0: -0.49, z1: 0.35, h: 1.27 },
  monitors: { x0: -0.88, x1: 0.88, z0: -0.35, z1: 0.28, h: 1.71 },
  lever: { x0: -0.25, x1: 0.25, z0: -0.22, z1: 0.4, h: 1.64 },
  cupboard: { x0: -0.6, x1: 0.6, z0: -0.3, z1: 0.35, h: 2.0 },
  bunks: { x0: -0.47, x1: 0.47, z0: -1.0, z1: 1.06, h: 1.8 },
  arcade: { x0: -0.35, x1: 0.35, z0: -0.4, z1: 0.41, h: 1.89 },
  charger: { x0: -0.2, x1: 0.2, z0: -0.08, z1: 0.08, h: 0.87 },
  suits: { x0: -0.85, x1: 0.85, z0: -0.31, z1: 0.31, h: 2.27 },
  coffee: { x0: -0.37, x1: 0.37, z0: -0.27, z1: 0.28, h: 1.52 },
  quota: { x0: -0.6, x1: 0.6, z0: -0.06, z1: 0.06, h: 0.72 },
  doorPanel: { x0: -0.15, x1: 0.15, z0: -0.05, z1: 0.05, h: 0.5 },
  lamp: { x0: -0.3, x1: 0.3, z0: -0.3, z1: 0.3, h: 0.1 },
  // module-owned fixtures (models measured by the overlap test: models/survival.js, models/arcade.js, models/food.js)
  stove: { x0: -0.62, x1: 0.62, z0: -0.32, z1: 0.35, h: 1.61 },
  brew: { x0: -0.47, x1: 0.47, z0: -0.32, z1: 0.32, h: 1.17 },
  svPlanter: { x0: -0.76, x1: 0.76, z0: -0.33, z1: 0.33, h: 0.47 },
  crate: { x0: -0.52, x1: 0.52, z0: -0.37, z1: 0.37, h: 0.7 },
  chess: { x0: -0.5, x1: 0.5, z0: -0.97, z1: 0.97, h: 0.91 },
  table: { x0: -0.66, x1: 0.66, z0: -0.85, z1: 0.85, h: 0.82 },
};
/** cycle3 trophy wall: plaque size (the wall is SPOTS.trophy: cols x rows plaques on the hub face of the cockpit bulkhead, facing +x) */
export const TROPHY_PLAQUE = { w: 0.357, h: 0.365, d: 0.1 };
/** the trophy wall's plaque centres (world), row-major like cycle3_core TROPHY_SLOTS: [{x, y, z}] */
export function trophySlots(T = SPOTS.trophy) {
  const out = [];
  for (let i = 0; i < T.cols * T.rows; i++) {
    const c = i % T.cols, r = Math.floor(i / T.cols);
    out.push({ x: T.x, y: T.y + ((T.rows - 1) / 2 - r) * T.dy, z: T.z - (c - (T.cols - 1) / 2) * T.dz });   // the wall faces +x: reading left -> right = +z -> -z
  }
  return out;
}
/** mods (public/mods): crew helmet-cam monitor hanging in the cockpit, LED loot board above the door */
export const MOD_SPOTS = {
  crewMonitor: { x: -5.6, y: 2.75, z: -2.55 },
  lootBoard: { x: 2.6, y: 3.02, z: SHELL.z1 - 0.07 },
};

const rot = (x, z, ry) => { const c = Math.cos(ry), s = Math.sin(ry); return [x * c + z * s, -x * s + z * c]; };   // three.js rotation.y
/** world AABB of a local box {x0,x1,z0,z1} placed at (x,z) with rotation ry and vertical range y0..y1 */
export function aabb(id, dims, x, z, ry, y0, y1, extra = {}) {
  let xs = [], zs = [];
  for (const [lx, lz] of [[dims.x0, dims.z0], [dims.x1, dims.z0], [dims.x1, dims.z1], [dims.x0, dims.z1]]) { const [wx, wz] = rot(lx, lz, ry); xs.push(x + wx); zs.push(z + wz); }
  return { id, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0, y1, ...extra };
}
const box = (id, x, z, hx, hz, y0, y1, extra) => ({ id, x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0, y1, ...extra });

/** Every fixture as a world AABB {id, x0..z1, y0, y1, kind}: 'solid' (blocks walking) or 'wall' (mounted on a wall, may share a footprint above / below others). */
export function fixtureBoxes(S = SPOTS, opts = {}) {
  const out = [];
  const prop = (id, key, spotKey = key, kind = 'solid') => {
    const s = S[spotKey], d = DIMS[key];
    if (!s) return;
    const y0 = s.y ?? 0;
    out.push(aabb(id, d, s.x, s.z, s.ry || 0, y0, y0 + d.h, { kind }));
  };
  prop('terminal', 'terminal'); prop('monitors', 'monitors'); prop('lever', 'lever'); prop('cupboard', 'cupboard'); prop('bunks', 'bunks'); prop('arcade', 'arcade');
  prop('charger', 'charger', 'charger', 'wall'); prop('suits', 'suits'); prop('coffee', 'coffee'); prop('quota', 'quota', 'quota', 'wall'); prop('doorPanel', 'doorPanel', 'doorPanel', 'wall');
  // survival built-ins + arcade chess table (wave 5: they used to pick spots at runtime and landed in the cockpit doorway / the kiosk / the workbench)
  prop('stove', 'stove'); prop('brew', 'brew'); prop('svPlanter', 'svPlanter'); prop('svCrate', 'crate', 'crate'); prop('chess', 'chess');
  const F = { w: 0.95, d: 0.5 };
  if (S.frame) {
    out.push(box('frameConsole', S.frame.x, S.frame.z, F.w / 2, F.d / 2, 0, 1.2, { kind: 'solid' }));
    out.push(box('frameScreen', S.frame.x, S.frame.z - 0.05, 0.4, 0.02, 1.2, 1.6, { kind: 'solid' }));
  }
  out.push(box('kiosk', S.kiosk.x, S.kiosk.z, 0.33, 0.24, 0, 1.6, { kind: 'solid' }));
  out.push(box('board', S.board.x, SHELL.z1 - 0.075, 0.81, 0.03, S.board.y - 0.49, S.board.y + 0.49, { kind: 'wall' }));
  out.push(box('incubator', S.incubator.x, S.incubator.z, 0.52, 0.33, 0, 1.38, { kind: 'solid' }));
  out.push(box('decon', S.decon.x, S.decon.z, 0.6, 0.6, 0, 2.4, { kind: 'solid' }));
  out.push(box('bench', S.bench.x, S.bench.z, 1.16, 0.405, 0, 2.8, { kind: 'solid' }));
  out.push(box('hornPanel', S.horn.x, SHELL.z1 - 0.03, 0.17, 0.03, S.horn.y - 0.25, S.horn.y + 0.25, { kind: 'wall' }));
  out.push(box('mirror', S.mirror.x, SHELL.z1 - 0.03, 0.56, 0.03, S.mirror.y - 0.88, S.mirror.y + 0.88, { kind: 'wall' }));
  out.push(box('tpPanel', S.tp.x, SHELL.z0 + 0.03, 0.17, 0.03, S.tp.y - 0.25, S.tp.y + 0.25, { kind: 'wall' }));
  out.push(box('tpPad', PAD.x, PAD.z, PAD.r, PAD.r, 0, 0.05, { kind: 'floor' }));
  if (S.reactor) out.push(box('reactor', S.reactor.x, S.reactor.z, 0.5, 0.5, 0, 2.6, { kind: 'solid' }));
  if (S.trophy) {   // one wall panel covering every plaque (+ the name plates under them)
    const T = S.trophy, P = TROPHY_PLAQUE, hz = ((T.cols - 1) * T.dz + P.w) / 2, hy = ((T.rows - 1) * T.dy + P.h) / 2;
    out.push({ id: 'trophyWall', x0: T.x - 0.01, x1: T.x + 0.09, z0: T.z - hz, z1: T.z + hz, y0: T.y - hy, y1: T.y + hy, kind: 'wall' });
  }
  if (opts.deck) { const b = deckStairs().block; out.push(box('deckStair', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2, 0, S.h, { kind: 'solid' })); }   // [shipdeck] the stair housing (once the deck is bought)
  for (const [i, t] of (opts.tables || [TABLE_SPOTS[0]]).entries()) out.push(aabb('table' + i, DIMS.table, t[0], t[1], t[2] || 0, 0, DIMS.table.h, { kind: 'solid' }));
  for (const d of opts.decor || DECOR) out.push(box(d.id, d.x, d.z, d.w / 2, d.d / 2, d.y || 0, (d.y || 0) + d.h, { kind: 'solid' }));
  if (!opts.noMods) {
    const M = MOD_SPOTS;
    out.push({ id: 'crewMonitor', x0: M.crewMonitor.x - 0.4, x1: M.crewMonitor.x + 0.12, z0: M.crewMonitor.z - 0.51, z1: M.crewMonitor.z + 0.51, y0: M.crewMonitor.y - 0.42, y1: SHELL.h, kind: 'hanging' });
    out.push({ id: 'lootBoard', x0: M.lootBoard.x - 0.86, x1: M.lootBoard.x + 0.86, z0: SHELL.z1 - 0.09, z1: SHELL.z1, y0: M.lootBoard.y - 0.28, y1: M.lootBoard.y + 0.28, kind: 'wall' });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- partitions (Among-Us style bulkheads)
const T = PT;
const EZ = ENGINE_Z;
/** solid partition boxes: {id, x0..z1, y0, y1, room, col}: col=false for headers (visual + collider anyway, they sit above the walkway) */
export const PARTITIONS = [
  // cockpit bulkhead at x = -4.0, 2.0 m wide hatch (z -1..1), header above 2.5
  { id: 'cockpitN', x0: -4.0 - T / 2, x1: -4.0 + T / 2, z0: SHELL.z0, z1: -1.0, y0: 0, y1: SHELL.h },
  { id: 'cockpitS', x0: -4.0 - T / 2, x1: -4.0 + T / 2, z0: 1.0, z1: SHELL.z1, y0: 0, y1: SHELL.h },
  { id: 'cockpitH', x0: -4.0 - T / 2, x1: -4.0 + T / 2, z0: -1.0, z1: 1.0, y0: 2.5, y1: SHELL.h },
  // engine room: south wall z = ENGINE_Z from x 3.2 to the tail, open toward the hub under a header beam at x = 3.2
  { id: 'engineS', x0: 3.2, x1: SHELL.x1, z0: EZ - T / 2, z1: EZ + T / 2, y0: 0, y1: SHELL.h },
  { id: 'engineH', x0: 3.2 - T / 2, x1: 3.2 + T / 2, z0: SHELL.z0, z1: EZ, y0: 2.5, y1: SHELL.h },
];
/** rounded door-frame posts (visual + tiny colliders): cylinders r = 0.11 */
export const POSTS = [
  { id: 'hatchN', x: -4.0, z: -1.0 }, { id: 'hatchS', x: -4.0, z: 1.0 }, { id: 'engineP', x: 3.2, z: EZ },
];
/** doorway walk-through volumes that MUST stay free (fixtures may not enter): the shell hatches + shipyard doorways (+ 0.9 m into the room) */
export const AISLES = [
  { id: 'hatch', x0: -4.3, x1: -3.7, z0: -0.8, z1: 0.8, y0: 0.05, y1: 2.2 },
  { id: 'airlock', x0: 1.6, x1: 3.6, z0: 2.6, z1: 3.5, y0: 0.05, y1: 2.2 },
  { id: 'R1', x0: 5.9, x1: 7.0, z0: -1.55, z1: -0.7, y0: 0.05, y1: 2.2 },
  { id: 'N1', x0: -5.95, x1: -4.85, z0: -3.5, z1: -2.6, y0: 0.05, y1: 2.2 },
  { id: 'N2', x0: 1.7, x1: 2.8, z0: -3.5, z1: -2.6, y0: 0.05, y1: 2.2 },
  { id: 'lootBay', x0: 4.3, x1: 5.8, z0: -0.5, z1: 1.1, y0: 0.05, y1: 1.2 },
  { id: 'engineDoor', x0: 3.0, x1: 3.5, z0: -2.65, z1: -2.0, y0: 0.05, y1: 2.2 },
];
/** where a player stands to use each interactable: the overlap test flood-fills the floor from the airlock with a 0.9 m wide walker and
 *  requires every one of these points to be reachable (x, z = the standing spot in front of the fixture). */
export const ACCESS = [
  { id: 'terminal', x: -5.35, z: 2.45 }, { id: 'lever', x: -5.25, z: 0.9 }, { id: 'monitors', x: -5.7, z: -2.2 }, { id: 'frame', x: -4.9, z: 2.4 },
  { id: 'door', x: 2.6, z: 2.9 }, { id: 'doorPanel', x: 3.95, z: 2.9 }, { id: 'stove', x: -3.25, z: -2.3 }, { id: 'brew', x: -2.05, z: -2.3 }, { id: 'coffee', x: -1.1, z: -2.3 },
  { id: 'charger', x: -0.35, z: -2.8 }, { id: 'arcade', x: 0.95, z: -2.1 }, { id: 'tpPad', x: 0, z: -1.0 },
  { id: 'mirror', x: -3.2, z: 2.9 }, { id: 'kiosk', x: -1.75, z: 2.35 }, { id: 'incubator', x: -0.38, z: 2.2 }, { id: 'decon', x: 0.86, z: 1.8 },
  { id: 'trophies', x: -3.3, z: 2.4 }, { id: 'chess', x: -2.25, z: 0.05 }, { id: 'table', x: -2.3, z: -0.1 },
  { id: 'bench', x: 4.55, z: -2.25 }, { id: 'reactor', x: 5.3, z: -2.3 }, { id: 'svPlanter', x: -5.85, z: 0.0 }, { id: 'planterCargo', x: 3.65, z: -0.5 },
  { id: 'planterHub', x: -4.5, z: -2.3 }, { id: 'lootBay', x: 5.05, z: 0.3 }, { id: 'suits', x: 5.8, z: 0.3 }, { id: 'cupboard', x: 5.84, z: 2.4 },
  { id: 'bunks', x: 4.65, z: 1.0 }, { id: 'crate', x: 5.8, z: 1.75 },
  { id: 'R1', x: 6.5, z: -1.12 }, { id: 'N1', x: -5.4, z: -3.0 }, { id: 'N2', x: 2.25, z: -3.0 }, { id: 'hatch', x: -4.0, z: 0 },
];
/** floor colour per room: [x0, z0, x1, z1, rgb]; wave 5: this IS the floor (one vertex-coloured mesh, no overlay decal over a second floor = no z-fighting) */
export const ROOM_TINTS = [
  { id: 'cockpit', x0: SHELL.x0, z0: SHELL.z0, x1: -4.0, z1: SHELL.z1, c: [0.62, 0.78, 0.95] },
  { id: 'hub', x0: -4.0, z0: SHELL.z0, x1: 3.2, z1: SHELL.z1, c: [0.86, 0.92, 0.9] },
  { id: 'engine', x0: 3.2, z0: SHELL.z0, x1: SHELL.x1, z1: EZ, c: [1.0, 0.72, 0.5] },
  { id: 'cargo', x0: 3.2, z0: EZ, x1: SHELL.x1, z1: SHELL.z1, c: [0.98, 0.9, 0.62] },
];
const W = 0.12;   // stripe width
export const STRIPES = [
  // path lines from the airlock: blue to the cockpit (down the middle of the hatch), orange to the engine room (hub side of the arch), green to the
  // med corner, yellow frame around the loot bay
  { id: 'toCockpitA', x0: 2.24, z0: 0.02, x1: 2.24 + W, z1: 3.1, c: [0.2, 0.55, 1.0] },
  { id: 'toCockpitB', x0: -5.0, z0: 0.02, x1: 2.24 + W, z1: 0.02 + W, c: [0.2, 0.55, 1.0] },
  { id: 'toEngineA', x0: 2.9, z0: -2.36, x1: 2.9 + W, z1: 3.1, c: [1.0, 0.5, 0.12] },
  { id: 'toEngineB', x0: 2.9, z0: -2.36, x1: 5.0, z1: -2.36 + W, c: [1.0, 0.5, 0.12] },
  { id: 'toMedA', x0: 1.62, z0: 1.9, x1: 1.62 + W, z1: 3.1, c: [0.25, 0.85, 0.45] },
  { id: 'toMedB', x0: 0.86, z0: 1.9, x1: 1.62 + W, z1: 1.9 + W, c: [0.25, 0.85, 0.45] },
  { id: 'bayN', x0: 4.2, z0: -0.6, x1: 5.9, z1: -0.5, c: [1.0, 0.85, 0.1] },
  { id: 'bayS', x0: 4.2, z0: 1.1, x1: 5.9, z1: 1.2, c: [1.0, 0.85, 0.1] },
  { id: 'bayW', x0: 4.2, z0: -0.5, x1: 4.3, z1: 1.1, c: [1.0, 0.85, 0.1] },
  { id: 'bayE', x0: 5.8, z0: -0.5, x1: 5.9, z1: 1.1, c: [1.0, 0.85, 0.1] },
];
/** hazard strip inside the airlock door (drawn with the stripes, above the floor) */
export const DOOR_HAZARD = { x0: SHELL.doorX - SHELL.doorW / 2, x1: SHELL.doorX + SHELL.doorW / 2, z0: SHELL.z1 - 0.35, z1: SHELL.z1 };
/** room signs (text drawn into one atlas, one mesh): id, text, colour, position of the centre, y, facing (ry of the plane; 0 faces +z) */
export const SIGNS = [
  { id: 'cockpitA', text: 'COCKPIT', c: '#2d7fd6', x: -4.0, y: 2.95, z: 0, ry: PI / 2, off: 0.09 },          // on the hub side of the header (faces +x)
  { id: 'cockpitB', text: 'GALLEY', c: '#3aa88a', x: -4.0, y: 2.95, z: 0, ry: -PI / 2, off: 0.09 },         // on the cockpit side (faces -x)
  { id: 'engine', text: 'ENGINE', c: '#e07a1c', x: 3.2, y: 2.95, z: -2.6, ry: PI / 2, off: 0.09 },
  { id: 'med', text: 'MED', c: '#2bb15a', x: 0.86, y: 2.75, z: 3.47, ry: PI, off: 0 },
  { id: 'cargo', text: 'CARGO', c: '#d8b21c', x: 7.0, y: 2.75, z: 1.85, ry: -PI / 2, off: 0.02 },
  { id: 'loot', text: 'LOOT BAY', c: '#b89410', x: 5.05, y: 2.2, z: EZ + T / 2 + 0.01, ry: 0, off: 0 },
  { id: 'store', text: 'STORE', c: '#c8581c', x: -1.75, y: 2.6, z: 3.47, ry: PI, off: 0 },
  { id: 'trophies', text: 'TROPHIES', c: '#8a5a2a', x: -4.0, y: 2.45, z: 2.27, ry: PI / 2, off: 0.09 },     // above the trophy wall (hub face of the bulkhead)
  { id: 'galleyN', text: 'GALLEY', c: '#3aa88a', x: -2.15, y: 2.95, z: SHELL.z0 + 0.03, ry: 0, off: 0 },  // over the galley counter (-z wall)
];
/** clerestory windows in the +z wall (real holes through both hull plates): x0, x1, y0, y1 */
export const WINDOWS_Z = [
  { x0: -6.3, x1: -4.9, y0: 2.4, y1: 3.0 },
  { x0: -3.75, x1: -2.55, y0: 2.4, y1: 3.0 },
  { x0: -1.0, x1: 0.2, y0: 2.4, y1: 3.0 },
];

/** ship spawn points (metres, y = 0.05); the teleporter pad is spawns[2] */
export const SPAWNS = [[-3.0, 0.15], [-0.8, 1.3], [PAD.x, PAD.z], [1.6, 1.9], [-1.0, -2.1], [-1.4, 0.15], [2.4, 1.95], [4.0, 0.3]];   // wave 5 shipdeck: two spawns left the stairwell

/** every static solid of the layout as AABBs for the overlap test / fault-panel obstacles: partitions + posts + fixtures */
export function solidBoxes(S = SPOTS, opts = {}) {
  const out = [];
  for (const p of opts.noPartitions ? [] : PARTITIONS) out.push({ ...p, kind: 'wall' });
  return [...out, ...fixtureBoxes(S, opts)];
}

/** Legacy (pre ship2) placements, kept for the before / after report in the overlap test. */
export const LEGACY_SPOTS = {
  terminal: { x: -6.25, z: 2.55, ry: PI / 2 }, monitors: { x: -6.45, z: -2.45, ry: PI / 2 }, lever: { x: -5.9, z: 0.9, ry: PI / 2 },
  cupboard: { x: 6.45, z: -2.3, ry: -PI / 2 }, bunks: { x: 5.6, z: 2.6, ry: PI }, arcade: { x: 1.2, z: -3.0, ry: 0 },
  charger: { x: -2.6, y: 1.0, z: -3.38, ry: 0 }, suits: { x: 6.5, z: 0.3, ry: -PI / 2 }, coffee: { x: -1.0, z: -3.1, ry: 0 },
  quota: { x: -3.6, y: 1.9, z: -3.44, ry: 0 }, doorPanel: { x: 4.25, y: 1.2, z: 3.44, ry: PI },
  frame: { x: -4.9, z: 3.22 }, horn: { x: -5.25, y: 1.4 }, mirror: { x: -3.2, y: 1.27 }, tp: { x: 0.1, y: 1.3 },
  kiosk: { x: -2.2, z: 3.02 }, board: { x: -2.2, y: 1.75 }, incubator: { x: -0.7, z: 2.95 }, decon: { x: -0.1, z: 2.92 },
  bench: { x: 4.05, z: -3.08 }, reactor: null,
};
export const LEGACY_TABLES = [[-4.4, -0.9]];
export const LEGACY_LAMPS = [[-4, 0], [0, 0], [4, 0]];
export const LEGACY_SPAWNS = [[-3, 0], [-1.5, 1.2], [0, -1.0], [1.5, 1.0], [3, -1.2], [-2.2, -1.5], [2.4, 1.6], [4, 0.2]];

// ---------------------------------------------------------------------------------------------- UPPER DECK (wave 5 shipdeck, docs/wave5/shipdeck.md)
// A second floor on the roof over the hub (x -0.5..4.0, z -3.3..3.3, floor top y 4.0), reached from INSIDE: a U-shaped stair in the hub (lane A climbs north to
// a platform, lane B climbs back south) that rises through a hatch (the "well": an opening in the ceiling, the roof plate and the deck floor). Until the
// deck is bought the well is closed by a lid (ship.js `deckHatch`). Everything below is pure data so the overlap test and the walk test see what the game builds.
export const WELL = { x0: 0.85, x1: 2.95, z0: -1.5, z1: 1.3 };
export const DECK = { y: 4.0, slab: 0.15, x0: -0.5, x1: 4.0, z0: -3.3, z1: 3.3, wall: 0.12, h: 2.6, rail: 1.1 };
const LANE = 1.0, DIVIDER = 0.1, MID_Y = 1.975, RUN = 1.9;
let _stairs = null;
/** the two flights (planStairs plans, world coordinates) + the turning platform */
export function deckStairs() {
  if (_stairs) return _stairs;
  const bz = WELL.z1 - RUN;
  const a = planStairs({ x: WELL.x0 + LANE / 2, z: WELL.z1, y: 0, dir: 'z-', width: LANE, rise: MID_Y, run: RUN, n: 10, landing: 0, tag: 'deckA' });
  const b = planStairs({ x: WELL.x1 - LANE / 2, z: bz, y: MID_Y, dir: 'z+', width: LANE, rise: DECK.y - MID_Y, run: RUN, n: 10, baseY: 0, landing: 0, tag: 'deckB' });
  _stairs = { a, b, laneW: LANE, dividerX0: WELL.x0 + LANE, dividerX1: WELL.x0 + LANE + DIVIDER, platform: { x0: WELL.x0, x1: WELL.x1, z0: WELL.z0, z1: bz, y: MID_Y },
    block: { x0: WELL.x0 - 0.1, x1: WELL.x1 + 0.1, z0: WELL.z0 - 0.1, z1: WELL.z1 }, inAt: { x: WELL.x0 + LANE / 2, z: WELL.z1 + 0.5 }, outAt: { x: WELL.x1 - LANE / 2, z: WELL.z1 + 0.5 } };
  return _stairs;
}
/** rectangles [x0, z0, x1, z1] that tile a plate without the well (ceiling collider, deck slab) */
export function withoutWell(x0, z0, x1, z1) { const W = WELL; return [[x0, z0, W.x0, z1], [W.x1, z0, x1, z1], [W.x0, z0, W.x1, W.z0], [W.x0, W.z1, W.x1, z1]]; }

export const DECK_ROOMS = ['bunk', 'store', 'turret', 'lounge'];
/** room height (collider) per type; the slots hug the north / south cabin wall; `face` = the way you face to use them (+1 = south, -1 = north) */
export const DECK_ROOM_H = { bunk: 1.6, store: 1.9, turret: 1.15, lounge: 0.9 };
export const DECK_SLOTS = [
  { x0: -0.3, x1: 1.8, z0: -3.14, z1: -2.59, face: 1 }, { x0: 1.95, x1: 3.85, z0: -3.14, z1: -2.59, face: 1 },
  { x0: -0.3, x1: 1.8, z0: 2.28, z1: 3.14, face: -1 }, { x0: 1.95, x1: 3.85, z0: 2.28, z1: 3.14, face: -1 },
];
/** number of usable room slots per deck tier (Mk2 = 2, Mk3 = 4) */
export const deckSlots = (t) => (t >= 3 ? 4 : t >= 2 ? 2 : 0);
export const slotSpot = (i) => { const s = DECK_SLOTS[i]; return { x: (s.x0 + s.x1) / 2, z: s.face > 0 ? s.z1 + 0.47 : s.z0 - 0.47 }; };
/** the extra roof mount that Mk III adds (ship2 mounts; the plate sits in the west strip of the deck, under the dome) */
export const DECK_MOUNT = { id: 'M6', x: 0.25, z: 0, y: DECK.y, label: 'DECK' };
/** standing spots on the deck floor the overlap test must reach with a 0.9 m walker (start = the top of lane B) */
export const DECK_ACCESS = (t = 3) => [
  ...(t >= 2 ? DECK_SLOTS.slice(0, deckSlots(t)).map((_, i) => ({ id: 'slot' + i, ...slotSpot(i) })) : []),
  ...(t >= 3 ? [{ id: 'mountM6', x: DECK_MOUNT.x - 0.1, z: DECK_MOUNT.z - 0.9 }, { id: 'mountM6s', x: DECK_MOUNT.x - 0.1, z: DECK_MOUNT.z + 0.9 }] : []),
  { id: 'wellRim', x: 0.2, z: 0 }, { id: 'stairExit', ...deckStairs().outAt },
];

const cbox = (id, x0, x1, z0, z1, y0, y1, extra) => ({ id, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, ...extra });
/** every static collider the deck adds, as {id, cx, cy, cz, sx, sy, sz, q?} (centre + full size): game/shipdeck.js hands them to physics.addStaticBox */
export function deckColliders(t = 1, rooms = []) {
  if (t < 1) return [];
  const St = deckStairs(), W = WELL, D = DECK, out = [];
  for (const [k, p] of [['A', St.a], ['B', St.b]]) {
    out.push({ id: 'ramp' + k, ...p.ramp });
    p.boxes.forEach((b, i) => out.push({ id: 'skirt' + k + i, ...b }));
  }
  const bz = St.platform.z1;
  out.push(cbox('platform', W.x0, W.x1, W.z0, bz, 0, MID_Y));
  out.push(cbox('divider', St.dividerX0, St.dividerX1, bz, W.z1, 0, D.y + D.rail));
  out.push(cbox('houseN', W.x0 - 0.1, W.x1 + 0.1, W.z0 - 0.1, W.z0, 0, 3.4), cbox('houseW', W.x0 - 0.1, W.x0, W.z0, W.z1, 0, 3.4), cbox('houseE', W.x1, W.x1 + 0.1, W.z0, W.z1, 0, 3.4));
  withoutWell(D.x0, D.z0, D.x1, D.z1).forEach(([x0, z0, x1, z1], i) => out.push(cbox('slab' + i, x0, x1, z0, z1, D.y - D.slab, D.y)));
  // rails round the well (open only where lane B comes out) + the deck edge (rails at Mk I, cabin walls from Mk II)
  const r = 0.04, top = D.y + D.rail;
  out.push(cbox('rimW', W.x0 - r, W.x0 + r, W.z0 - r, W.z1, D.y, top), cbox('rimN', W.x0 - r, W.x1 + r, W.z0 - r, W.z0 + r, D.y, top), cbox('rimE', W.x1 - r, W.x1 + r, W.z0 - r, W.z1, D.y, top),
    cbox('rimS', W.x0 - r, St.dividerX1, W.z1 - r, W.z1 + r, D.y, top));
  const th = t >= 2 ? D.wall : 0.08, y1 = t >= 2 ? D.y + D.h : top;
  out.push(cbox('edgeN', D.x0, D.x1, D.z0, D.z0 + th, D.y, y1), cbox('edgeS', D.x0, D.x1, D.z1 - th, D.z1, D.y, y1), cbox('edgeW', D.x0, D.x0 + th, D.z0, D.z1, D.y, y1), cbox('edgeE', D.x1 - th, D.x1, D.z0, D.z1, D.y, y1));
  if (t >= 2) for (let i = 0; i < deckSlots(t); i++) { const rm = rooms[i], s = DECK_SLOTS[i]; if (rm && DECK_ROOM_H[rm]) out.push(cbox('room' + i, s.x0, s.x1, s.z0, s.z1, D.y, D.y + DECK_ROOM_H[rm], { room: rm })); }
  return out;
}
/** deck-floor fixtures as world AABBs for the overlap test (rooms + rails + cabin walls; the mount plate is walkable, not a solid) */
export function deckFixtures(t = 3, rooms = DECK_ROOMS) {
  return deckColliders(t, rooms).filter((c) => /^(room|rim|edge)/.test(c.id)).map((c) => ({ id: c.id, x0: c.cx - c.sx / 2, x1: c.cx + c.sx / 2, z0: c.cz - c.sz / 2, z1: c.cz + c.sz / 2, y0: c.cy - c.sy / 2, y1: c.cy + c.sy / 2, kind: /^room/.test(c.id) ? 'solid' : 'wall' }));
}

// the foot of lane A must stay reachable from the airlock (hub walkway) and free of fixtures
AISLES.push({ id: 'deckStairIn', x0: WELL.x0, x1: WELL.x0 + LANE, z0: WELL.z1, z1: WELL.z1 + 0.6, y0: 0.05, y1: 2.2 });
ACCESS.push({ id: 'deckStairIn', ...deckStairs().inAt });
