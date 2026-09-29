// MAZEGEN (wave 5, "unify"): ONE entry point for every labyrinth / maze planner of the game + ONE solvability checker. Pure (no three / DOM), node-tested by
// tools/harness/mazegen.test.mjs. Docs: docs/wave5/unify.md.
//
// The planners themselves are the proven ones and are NOT rewritten, only re-exported from here:
//   maps5_core.js       grid + carveTree (growing tree), bfs / shortestPath / reachedAll, wallLattice (merged wall runs), planHedge / planStacks / planArchive, mazeRoute
//   maze_styles.js      carveMaze(style, w, h, rng): dfs / braid / prim / serpentine / spiral / ring edge lists (the facility "labyrinth" rooms, stealth wave)
//   backrooms_plan.js   generatePocket(key): the Level-0 noclip pocket (edge types OPEN / WALL / DOOR / STUB + halls + exit)
//   horror_maps.js      POCKET_SPECS: hand-drawn ASCII pocket layouts (outbreak / mansion / ballroom / warehouse), analyzeSpec / reachTiles
// Callers that only need a planner import it from here (pure renames: facility.js, facility_variety.js, maps5_*.js).
//
// One API on top:
//   planMaze(kind, seed, opts)   -> { kind, seed, w, h, graph, start, goals, raw }   kind = 'tree' | a MAZE_STYLES id | 'hedge' | 'stacks' | 'archive' | 'pocket'
//   asciiMaze(spec)              -> the same shape for a horror ASCII pocket spec
//   checkSolvable(plan)          -> { ok, errors[], reached, total }   one checker: every cell reachable from the start, every goal reachable, plus the
//                                   planner's own extra proof (stacks: every phase + transition, archive: 3D search, ascii: analyzeSpec)
//   graphFrom{Grid,Edges,Pocket,Ascii}  normalised graphs { n, adj[i] = [j, ...] } (also handy for AI / nav tests)
import { RNG } from '../core/rng.js';
import * as M5 from '../game/maps5_core.js';
import { MAZE_STYLES, carveMaze, mazeConnected, mazeDeadEnds, pickMazeStyle } from './maze_styles.js';
import { generatePocket, pocketKey, POCKET, EDGE } from './backrooms_plan.js';
import { POCKET_SPECS, WALK, analyzeSpec, reachTiles } from '../game/horror_maps.js';

export { M5 };
export const {
  DX, DZ, OPP, makeGrid, cellIdx, inBounds, link, isLinked, degree, edgeId, edgeCells, allEdges, gridFromFlags, carveTree, bfs, shortestPath, reachedAll,
  HEDGE, STACKS, ARCHIVE, planHedge, planStacks, planArchive, stacksOpen, stacksPhaseAt, stacksDiff, verifyStacks, archiveSolve, wallLattice, cellCentre, toWorld, toLocal,
  cellAtWorld, mazeRoute, siteSeed,
} = M5;
// maze_styles / backrooms / horror pockets
export { MAZE_STYLES, carveMaze, mazeConnected, mazeDeadEnds, pickMazeStyle, generatePocket, pocketKey, POCKET, EDGE, POCKET_SPECS, analyzeSpec, reachTiles };

// ---------------------------------------------------------------------------------------------- normalised graphs
/** { n, adj } from a maps5 grid (open bits) */
export function graphFromGrid(g) {
  const adj = Array.from({ length: g.n }, () => []);
  for (let i = 0; i < g.n; i++) {
    const x = i % g.cols, z = (i / g.cols) | 0;
    for (let d = 0; d < 4; d++) if (g.open[i] & (1 << d)) adj[i].push((z + DZ[d]) * g.cols + x + DX[d]);
  }
  return { n: g.n, adj, cols: g.cols, rows: g.rows };
}
/** { n, adj } from a maze_styles edge list ([x, z, d] with d 0 = +x, 1 = +z) over w x h cells */
export function graphFromEdges(w, h, edges) {
  const adj = Array.from({ length: w * h }, () => []);
  for (const [x, z, d] of edges) { const a = z * w + x, b = d === 0 ? a + 1 : a + w; if (b < w * h) { adj[a].push(b); adj[b].push(a); } }
  return { n: w * h, adj, cols: w, rows: h };
}
/** { n, adj } from a backrooms pocket plan (an edge is passable unless it is a WALL) */
export function graphFromPocket(P) {
  const adj = Array.from({ length: P.W * P.H }, () => []);
  const DXs = [1, 0, -1, 0], DZs = [0, 1, 0, -1];
  for (let z = 0; z < P.H; z++) for (let x = 0; x < P.W; x++) for (let d = 0; d < 4; d++) {
    const nx = x + DXs[d], nz = z + DZs[d];
    if (nx < 0 || nz < 0 || nx >= P.W || nz >= P.H) continue;
    if (P.typeOf(P.edgeKey(x, z, d)) !== EDGE.WALL) adj[z * P.W + x].push(nz * P.W + nx);
  }
  return { n: P.W * P.H, adj, cols: P.W, rows: P.H };
}
/** { n, adj, cells } over the walkable tiles of an ASCII map (n counts every tile, blocked ones stay isolated and are listed out of `cells`) */
export function graphFromAscii(rows, walk = WALK) {
  const H = rows.length, W = rows[0].length, adj = Array.from({ length: W * H }, () => []), cells = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (!walk.has(rows[z][x])) continue;
    cells.push(z * W + x);
    if (x + 1 < W && walk.has(rows[z][x + 1])) { adj[z * W + x].push(z * W + x + 1); adj[z * W + x + 1].push(z * W + x); }
    if (z + 1 < H && walk.has(rows[z + 1][x])) { adj[z * W + x].push((z + 1) * W + x); adj[(z + 1) * W + x].push(z * W + x); }
  }
  return { n: W * H, adj, cols: W, rows: H, cells };
}
/** BFS distances (Int32Array, -1 = unreachable) */
export function distances(graph, start) {
  const d = new Int32Array(graph.n).fill(-1), q = [start];
  d[start] = 0;
  for (let h = 0; h < q.length; h++) for (const j of graph.adj[q[h]]) if (d[j] < 0) { d[j] = d[q[h]] + 1; q.push(j); }
  return d;
}

// ---------------------------------------------------------------------------------------------- planners behind one API
export const KINDS = ['tree', ...MAZE_STYLES, 'hedge', 'stacks', 'archive', 'pocket'];
/**
 * kind 'tree' | a MAZE_STYLES id (w x h from opts, default 8 x 8) | 'hedge' | 'stacks' | 'archive' | 'pocket'. Deterministic in (kind, seed, opts).
 * Returns { kind, seed, w, h, graph, start, goals: [cell], raw } where raw is the planner's own plan / edge list.
 */
export function planMaze(kind, seed, o = {}) {
  seed = seed >>> 0;
  if (kind === 'tree') {
    const w = o.w | 0 || 8, h = o.h | 0 || 8, g = makeGrid(w, h);
    carveTree(g, new RNG(seed), null, o.twist ?? 0.2);
    return { kind, seed, w, h, graph: graphFromGrid(g), start: 0, goals: [w * h - 1], raw: g };
  }
  if (MAZE_STYLES.includes(kind)) {
    const w = o.w | 0 || 8, h = o.h | 0 || 8, edges = carveMaze(kind, w, h, new RNG(seed));
    return { kind, seed, w, h, graph: graphFromEdges(w, h, edges), start: 0, goals: [w * h - 1], raw: edges };
  }
  if (kind === 'hedge' || kind === 'archive') {
    const p = kind === 'hedge' ? planHedge(seed, o) : planArchive(seed, o);
    const g = kind === 'hedge' ? p.g : p.g0;
    return { kind, seed, w: p.cols, h: p.rows, graph: graphFromGrid(g), start: p.entrance.cell, goals: kind === 'hedge' ? [p.exit.cell, p.centreCell] : [p.exit.cell], raw: p };
  }
  if (kind === 'stacks') {
    const p = planStacks(seed, o), g = gridFromFlags(p.cols, p.rows, ...p.states);   // union of every phase: the walls a phase can ever open
    return { kind, seed, w: p.cols, h: p.rows, graph: graphFromGrid(g), start: p.entrance.cell, goals: [p.exit.cell, p.core], raw: p };
  }
  if (kind === 'pocket') {
    const p = generatePocket(seed);
    return { kind, seed, w: p.W, h: p.H, graph: graphFromPocket(p), start: p.spawnCell, goals: [p.exit.cell], raw: p };
  }
  throw new Error('mazegen: unknown kind ' + kind);
}
/** a horror ASCII pocket spec (POCKET_SPECS[x]) as a plan of the same shape */
export function asciiMaze(spec) {
  const graph = graphFromAscii(spec.map), W = spec.map[0].length;
  return { kind: 'ascii', seed: 0, w: W, h: spec.map.length, graph, start: spec.entry.z * W + spec.entry.x, goals: [], raw: spec };
}

// ---------------------------------------------------------------------------------------------- the one solvability checker
/**
 * Every cell reachable from the start (ASCII: every walkable tile), every goal reachable, and the planner's own proof where it has one:
 *   hedge  plan.solvable + entrance -> centre / exit paths      stacks  verifyStacks (every phase + every transition state)
 *   archive archiveSolve (ground maze + ladder + deck islands + reward)      ascii  analyzeSpec (specials reachable, closet door, upper floor)
 * Returns { ok, errors, reached, total }.
 */
export function checkSolvable(plan) {
  const errors = [], G = plan.graph, dist = distances(G, plan.start);
  const cells = G.cells || Array.from({ length: G.n }, (_, i) => i);
  let reached = 0;
  for (const i of cells) if (dist[i] >= 0) reached++;
  if (reached !== cells.length) errors.push(`${cells.length - reached} of ${cells.length} cells unreachable from the start`);
  for (const gcell of plan.goals) if (dist[gcell] < 0) errors.push(`goal cell ${gcell} unreachable`);
  const r = plan.raw;
  if (plan.kind === 'hedge') { if (!r.solvable) errors.push('hedge: planner says unsolvable'); if (!r.pathToCentre || !r.pathToExit) errors.push('hedge: no path to the centre / exit'); }
  if (plan.kind === 'stacks') { const v = verifyStacks(r); if (!v.ok) errors.push(...v.errors); }
  if (plan.kind === 'archive') { const a = archiveSolve(r); if (!a.solvable) errors.push('archive: ladder / decks / reward not all reachable'); }
  if (plan.kind === 'ascii') { const a = analyzeSpec(r); if (a.errs.length) errors.push(...a.errs); }
  return { ok: !errors.length, errors, reached, total: cells.length };
}
