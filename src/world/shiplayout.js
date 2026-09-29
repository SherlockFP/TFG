// SHIP LAYOUT (wave 4, module ship2): pure data + tiny helpers, no three.js, node-testable (tools/harness/ship2_overlap.test.mjs).
// One place that says where every fixture of the default (tier 0) "Mini-Skeld" ship stands. Every module that owns an in-ship fixture (shop kiosk,
// contract board, pet incubator, decon shower, workbench, food table, frame console, horn / teleporter buttons, mirror) reads its position from SPOTS,
// so nothing can silently end up inside another fixture again. world/ship.js builds the partitions, floor tints, signs and props from this file.
//
// Top view (x runs nose -> tail, z runs -3.5 north wall -> +3.5 south wall with the airlock door at x 2.6):
//
//   z -3.5  +-------+----------------------------+-------------------+
//           | COCK- | HUB / GALLEY               | ENGINE            |   <- N1 doorway (shipyard) in the cockpit north wall, N2 in the hub
//           |  PIT  |  quota screen, coffee,     |  workbench,       |
//           |       |  arcade, TP pad, table     |  reactor          |
//   z  0    |  hatch  ....................  hub  +--- R1 doorway (tail) ---+
//           |       |                            |  SUITS / CARGO    |
//   z +3.5  +-------+--mirror-store-nursery-med-DOOR-bunk--crates---+
//
// SHIPYARD ATTACHMENT POINTS (documented in docs/wave4/ship2.md, data in world/hardpoints.js): the core keeps the three doorway gaps
// R1 (+x wall, z -1.125), N1 (-z wall, x -5.4) and N2 (-z wall, x 2.25). Rooms grow OUTSIDE those doorways; nothing in this layout may fill the
// walkway in front of them (checked by the overlap test: `aisles`). Extra room hooks for other agents: ROOM_SLOTS below.
const PI = Math.PI;

export const SHELL = { x0: -7, x1: 7, z0: -3.5, z1: 3.5, h: 3.4, doorX: 2.6, doorW: 2.2, doorH: 2.6 };

/** Fixture positions. x, z = origin of the model (props: their own origin, see DIMS); y = mounting height for wall props; ry = rotation about Y. */
export const SPOTS = {
  terminal: { x: -6.25, z: 2.55, ry: PI / 2 },
  monitors: { x: -6.45, z: -2.45, ry: PI / 2 },
  lever: { x: -5.9, z: 0.9, ry: PI / 2 },
  cupboard: { x: 6.45, z: 2.15, ry: -PI / 2 },
  bunks: { x: 4.75, z: 2.42, ry: PI },
  arcade: { x: 0.95, z: SHELL.z0 + 0.5, ry: 0 },
  charger: { x: -3.05, y: 1.0, z: SHELL.z0 + 0.12, ry: 0 },
  suits: { x: 6.5, z: 0.45, ry: -PI / 2 },
  coffee: { x: -1.75, z: SHELL.z0 + 0.4, ry: 0 },
  quota: { x: -3.05, y: 1.9, z: SHELL.z0 + 0.06, ry: 0 },
  doorPanel: { x: 3.98, y: 1.2, z: SHELL.z1 - 0.06, ry: PI },
  frame: { x: -4.9, z: 3.22 },                       // Frame Console (shipyard)
  horn: { x: -5.25, y: 1.75 },                       // +z wall panel
  mirror: { x: -3.2, y: 1.27 },                      // +z wall
  tp: { x: 0.1, y: 1.3 },                            // -z wall panel (pad = ship.spawns[2])
  kiosk: { x: -1.75, z: 3.02 },                      // Company Store terminal
  board: { x: -1.75, y: 1.75 },                      // contract board (+z wall, above the kiosk)
  incubator: { x: -0.38, z: 2.95 },                  // pet incubator
  decon: { x: 0.86, z: 2.88 },                       // decon shower / med corner
  bench: { x: 4.45, z: SHELL.z0 + 0.39 + 0.03 },     // crafting workbench (engine room)
  reactor: { x: 6.3, z: -2.6 },                      // engine room reactor core (decor + collider)
  cargo: { x: 5.05, z: 0.3, w: 1.4, d: 1.0 },        // LOOT BAY: store orders and the dropship land here (terminal.js / shop.js use dropPoint())
};
/** where store deliveries appear: inside the yellow loot bay, i = 0.. stacks upward */
export function dropPoint(i = 0, rand = Math.random) { const c = SPOTS.cargo; return { x: c.x + (rand() - 0.5) * c.w, y: 1.2 + i * 0.25, z: c.z + (rand() - 0.5) * c.d }; }
export const TABLE_SPOTS = [[-1.9, -0.4], [-2.0, 0.35], [-3.0, -0.9]];   // food table candidates, first free one wins (food.js)
export const PAD = { x: 0, z: -1.0, r: 0.68 };      // teleporter pad = spawns[2]
export const DISCO = { x: 2.0, z: 0.0 };
/** ceiling lamps (world x, z) */
export const LAMPS = [[-5.4, 0], [-1.6, 0], [1.3, 0], [5.0, -2.7], [5.2, 1.0]];
/** decor with a collider (crates in the cargo corner, planters). h = height, w/d footprint. */
export const DECOR = [
  { id: 'crateA', x: 6.6, z: 3.12, w: 0.6, d: 0.6, h: 0.6 },
  { id: 'crateC', x: 6.6, z: 3.12, w: 0.42, d: 0.42, h: 0.42, y: 0.6 },     // stacked on crateA
  { id: 'planterHub', x: -0.85, z: SHELL.z0 + 0.35, w: 0.6, d: 0.6, h: 0.5, planter: true },
  { id: 'planterCargo', x: 5.6, z: 3.15, w: 0.6, d: 0.6, h: 0.5, planter: true },
];
/** extension hooks for shipyard rooms / other agents: a planter can be added at any of these (ship2.addPlanter) */
export const PLANTER_SLOTS = [
  { id: 'planterHub', x: -0.85, z: SHELL.z0 + 0.35, ry: 0, where: 'core' },
  { id: 'planterCargo', x: 5.6, z: 3.15, ry: PI, where: 'core' },
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
    const s = S[spotKey], d = DIMS[key], y0 = s.y ?? 0;
    out.push(aabb(id, d, s.x, s.z, s.ry || 0, y0, y0 + d.h, { kind }));
  };
  prop('terminal', 'terminal'); prop('monitors', 'monitors'); prop('lever', 'lever'); prop('cupboard', 'cupboard'); prop('bunks', 'bunks'); prop('arcade', 'arcade');
  prop('charger', 'charger', 'charger', 'wall'); prop('suits', 'suits'); prop('coffee', 'coffee'); prop('quota', 'quota', 'quota', 'wall'); prop('doorPanel', 'doorPanel', 'doorPanel', 'wall');
  const F = { w: 0.95, d: 0.5 };
  out.push(box('frameConsole', S.frame.x, S.frame.z, F.w / 2, F.d / 2, 0, 1.2, { kind: 'solid' }));
  out.push(box('frameScreen', S.frame.x, S.frame.z - 0.05, 0.4, 0.02, 1.2, 1.6, { kind: 'solid' }));
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
  const T = { hx: 0.66, hz: 0.85 };
  for (const [i, [tx, tz]] of (opts.tables || [TABLE_SPOTS[0]]).entries()) out.push(box('table' + i, tx, tz, T.hx, T.hz, 0, 0.82, { kind: 'solid' }));
  for (const d of opts.decor || DECOR) out.push(box(d.id, d.x, d.z, d.w / 2, d.d / 2, d.y || 0, (d.y || 0) + d.h, { kind: 'solid' }));
  return out;
}

// ---------------------------------------------------------------------------------------------- partitions (Among-Us style bulkheads)
const T = 0.16;
/** solid partition boxes: {id, x0..z1, y0, y1, room, col}: col=false for headers (visual + collider anyway, they sit above the walkway) */
export const PARTITIONS = [
  // cockpit bulkhead at x = -4.0, 2.0 m wide hatch (z -1..1), header above 2.5
  { id: 'cockpitN', x0: -4.0 - T / 2, x1: -4.0 + T / 2, z0: SHELL.z0, z1: -1.0, y0: 0, y1: SHELL.h },
  { id: 'cockpitS', x0: -4.0 - T / 2, x1: -4.0 + T / 2, z0: 1.0, z1: SHELL.z1, y0: 0, y1: SHELL.h },
  { id: 'cockpitH', x0: -4.0 - T / 2, x1: -4.0 + T / 2, z0: -1.0, z1: 1.0, y0: 2.5, y1: SHELL.h },
  // engine room: south wall z = -1.85 from x 3.2 to the tail, open toward the hub under a header beam at x = 3.2
  { id: 'engineS', x0: 3.2, x1: SHELL.x1, z0: -1.85 - T / 2, z1: -1.85 + T / 2, y0: 0, y1: SHELL.h },
  { id: 'engineH', x0: 3.2 - T / 2, x1: 3.2 + T / 2, z0: SHELL.z0, z1: -1.85, y0: 2.5, y1: SHELL.h },
];
/** rounded door-frame posts (visual + tiny colliders): cylinders r = 0.11 */
export const POSTS = [
  { id: 'hatchN', x: -4.0, z: -1.0 }, { id: 'hatchS', x: -4.0, z: 1.0 }, { id: 'engineP', x: 3.2, z: -1.85 },
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
/** floor tints per room: [x0, z0, x1, z1, rgb] drawn as vertex-coloured decals; stripes: [x0, z0, x1, z1, rgb] thin coloured guide lines */
export const ROOM_TINTS = [
  { id: 'cockpit', x0: -7, z0: -3.5, x1: -4.08, z1: 3.5, c: [0.62, 0.78, 0.95] },
  { id: 'hub', x0: -3.92, z0: -3.5, x1: 3.2, z1: 3.5, c: [0.86, 0.92, 0.9] },
  { id: 'engine', x0: 3.2, z0: -3.5, x1: 7, z1: -1.93, c: [1.0, 0.72, 0.5] },
  { id: 'cargo', x0: 3.2, z0: -1.77, x1: 7, z1: 3.5, c: [0.98, 0.9, 0.62] },
];
export const STRIPES = [
  // path lines from the airlock: blue to the cockpit, orange to the engine room, green to the med corner, yellow frame around the cargo corner
  { id: 'toCockpitA', x0: 2.24, z0: 0.68, x1: 2.36, z1: 3.3, c: [0.2, 0.55, 1.0] },
  { id: 'toCockpitB', x0: -4.9, z0: 0.68, x1: 2.36, z1: 0.8, c: [0.2, 0.55, 1.0] },
  { id: 'toEngineA', x0: 3.34, z0: -2.3, x1: 3.46, z1: 3.3, c: [1.0, 0.5, 0.12] },
  { id: 'toEngineB', x0: 3.34, z0: -2.3, x1: 5.2, z1: -2.18, c: [1.0, 0.5, 0.12] },
  { id: 'toMedA', x0: 1.62, z0: 1.9, x1: 1.74, z1: 3.3, c: [0.25, 0.85, 0.45] },
  { id: 'toMedB', x0: 0.86, z0: 1.9, x1: 1.74, z1: 2.02, c: [0.25, 0.85, 0.45] },
  { id: 'bayN', x0: 4.2, z0: -0.6, x1: 5.9, z1: -0.5, c: [1.0, 0.85, 0.1] },
  { id: 'bayS', x0: 4.2, z0: 1.1, x1: 5.9, z1: 1.2, c: [1.0, 0.85, 0.1] },
  { id: 'bayW', x0: 4.2, z0: -0.6, x1: 4.3, z1: 1.2, c: [1.0, 0.85, 0.1] },
  { id: 'bayE', x0: 5.8, z0: -0.6, x1: 5.9, z1: 1.2, c: [1.0, 0.85, 0.1] },
];
/** room signs (text drawn into one atlas, one mesh): id, text, colour, position of the centre, y, facing (ry of the plane; 0 faces +z) */
export const SIGNS = [
  { id: 'cockpitA', text: 'COCKPIT', c: '#2d7fd6', x: -4.0, y: 2.95, z: 0, ry: PI / 2, off: 0.09 },          // on the hub side of the header (faces +x)
  { id: 'cockpitB', text: 'GALLEY', c: '#3aa88a', x: -4.0, y: 2.95, z: 0, ry: -PI / 2, off: 0.09 },         // on the cockpit side (faces -x)
  { id: 'engine', text: 'ENGINE', c: '#e07a1c', x: 3.2, y: 3.05, z: -2.7, ry: PI / 2, off: 0.09 },
  { id: 'med', text: 'MED', c: '#2bb15a', x: 0.86, y: 2.75, z: 3.47, ry: PI, off: 0 },
  { id: 'cargo', text: 'CARGO', c: '#d8b21c', x: 7.0, y: 2.75, z: 2.15, ry: -PI / 2, off: 0.02 },
  { id: 'loot', text: 'LOOT BAY', c: '#b89410', x: 5.05, y: 2.45, z: -1.75, ry: 0, off: 0 },
  { id: 'store', text: 'STORE', c: '#c8581c', x: -1.75, y: 2.6, z: 3.47, ry: PI, off: 0 },
  { id: 'airlock', text: 'AIRLOCK', c: '#c83a3a', x: 2.6, y: 2.95, z: 3.47, ry: PI, off: 0 },
];
/** clerestory windows in the +z wall (real holes through both hull plates): x0, x1, y0, y1 */
export const WINDOWS_Z = [
  { x0: -6.3, x1: -4.9, y0: 2.4, y1: 3.0 },
  { x0: -3.75, x1: -2.55, y0: 2.4, y1: 3.0 },
  { x0: -1.0, x1: 0.2, y0: 2.4, y1: 3.0 },
];

/** ship spawn points (metres, y = 0.05); the teleporter pad is spawns[2] */
export const SPAWNS = [[-3, 0.4], [-1.5, 1.4], [PAD.x, PAD.z], [1.5, 0.9], [3.0, -0.8], [-2.9, -1.8], [2.4, 1.7], [4.4, 0.3]];

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
