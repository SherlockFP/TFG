// MAPS5 (wave 4) - pure planning rules for the three new labyrinths. No three.js, no DOM, no Math.random: everything is a pure function
// of (seed, options), so every peer derives the same layout and node tests can prove the guarantees.
//
//   HEDGE MAZE    planHedge(seed)    outdoor garden labyrinth: perfect maze + a few braid loops, a 3x3 centre chamber (reward), a south
//                                    entrance gate and a far north exit gate, dead-end pockets (small rewards)
//   SERVER STACKS planStacks(seed)   tight labyrinth whose aisles SHIFT: a cycle of spanning trees (phases). Consecutive phases differ by a
//                                    few edge swaps; the union of both is always connected, so the walls can be opened first and closed
//                                    second (nothing is ever cut off). Each phase is a spanning tree + permanent braid edges.
//   PAPER ARCHIVE planArchive(seed)  two levels: a full ground maze, plus a deck level made of two islands that are only joined by
//                                    bridges. One ladder leads from the ground to island A (a dead-end cell), the reward sits on island B.
//
// Grid conventions: cell (x, z), index i = z * cols + x; sides 0 = E (+x), 1 = S (+z), 2 = W, 3 = N. An EDGE joins two neighbouring cells
// and is numbered eid = 2 * i + (0 for the east neighbour | 1 for the south neighbour) of its lower-left cell.
import { RNG, hashString } from '../core/rng.js';

export const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1], OPP = [2, 3, 0, 1];

// ------------------------------------------------------------------------------------------------ grid + edges
export function makeGrid(cols, rows) { return { cols, rows, n: cols * rows, open: new Uint8Array(cols * rows) }; }
export const cellIdx = (g, x, z) => z * g.cols + x;
export const inBounds = (g, x, z) => x >= 0 && z >= 0 && x < g.cols && z < g.rows;
export function link(g, i, d) {
  const x = i % g.cols, z = (i / g.cols) | 0, j = (z + DZ[d]) * g.cols + x + DX[d];
  g.open[i] |= 1 << d; g.open[j] |= 1 << OPP[d];
  return j;
}
export const isLinked = (g, i, d) => (g.open[i] & (1 << d)) !== 0;
export const degree = (g, i) => { let n = 0; for (let d = 0; d < 4; d++) if (g.open[i] & (1 << d)) n++; return n; };

/** edge id between cell i and its neighbour in direction d (no bounds check) */
export function edgeId(cols, i, d) {
  if (d === 0) return i * 2;
  if (d === 1) return i * 2 + 1;
  return d === 2 ? (i - 1) * 2 : (i - cols) * 2 + 1;
}
/** [cellA, cellB] of an edge */
export function edgeCells(cols, eid) { const i = eid >> 1; return [i, (eid & 1) ? i + cols : i + 1]; }
/** all in-bounds edge ids of a grid */
export function allEdges(cols, rows) {
  const out = [];
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    const i = z * cols + x;
    if (x < cols - 1) out.push(i * 2);
    if (z < rows - 1) out.push(i * 2 + 1);
  }
  return out;
}
/** grid whose open bits are the union of edge-flag arrays (Uint8Array indexed by edge id) */
export function gridFromFlags(cols, rows, ...flagSets) {
  const g = makeGrid(cols, rows);
  for (const eid of allEdges(cols, rows)) {
    if (!flagSets.some((f) => f[eid])) continue;
    const [a, b] = edgeCells(cols, eid);
    g.open[a] |= 1 << ((eid & 1) ? 1 : 0); g.open[b] |= 1 << ((eid & 1) ? 3 : 2);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ carving + search
/**
 * Randomised spanning tree over the cells accepted by `has(i)` (all cells when null): growing-tree with `twist` = chance to branch from a
 * random visited cell instead of the newest one (0 = long winding corridors, 1 = many short branches). Returns the tree edges [[i, j, d], ...] (d = side of i facing j).
 */
export function carveTree(g, rng, has = null, twist = 0.2, start = -1) {
  const ok = (i) => !has || has(i);
  const cells = [];
  for (let i = 0; i < g.n; i++) if (ok(i)) cells.push(i);
  if (!cells.length) return [];
  const seen = new Uint8Array(g.n), edges = [], stack = [];
  const s = start >= 0 && ok(start) ? start : rng.pick(cells);
  seen[s] = 1; stack.push(s);
  while (stack.length) {
    const k = rng.chance(twist) ? rng.int(0, stack.length - 1) : stack.length - 1;
    const i = stack[k], x = i % g.cols, z = (i / g.cols) | 0;
    const nb = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (!inBounds(g, nx, nz)) continue;
      const j = nz * g.cols + nx;
      if (ok(j) && !seen[j]) nb.push(d);
    }
    if (!nb.length) { stack[k] = stack[stack.length - 1]; stack.pop(); continue; }
    const d = rng.pick(nb), j = link(g, i, d);
    seen[j] = 1; stack.push(j); edges.push([i, j, d]);
  }
  return edges;
}

/** BFS distances from `start` over the open bits (-1 = unreachable). `block(i)` may forbid cells. */
export function bfs(g, start, block = null) {
  const dist = new Int32Array(g.n).fill(-1), q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % g.cols, z = (i / g.cols) | 0;
    for (let d = 0; d < 4; d++) {
      if (!(g.open[i] & (1 << d))) continue;
      const j = (z + DZ[d]) * g.cols + x + DX[d];
      if (dist[j] >= 0 || (block && block(j))) continue;
      dist[j] = dist[i] + 1; q.push(j);
    }
  }
  return dist;
}
/** shortest cell path a -> b (inclusive), or null */
export function shortestPath(g, a, b) {
  const prev = new Int32Array(g.n).fill(-2), q = [a];
  prev[a] = -1;
  for (let h = 0; h < q.length && prev[b] === -2; h++) {
    const i = q[h], x = i % g.cols, z = (i / g.cols) | 0;
    for (let d = 0; d < 4; d++) {
      if (!(g.open[i] & (1 << d))) continue;
      const j = (z + DZ[d]) * g.cols + x + DX[d];
      if (prev[j] !== -2) continue;
      prev[j] = i; q.push(j);
    }
  }
  if (prev[b] === -2) return null;
  const path = [];
  for (let c = b; c !== -1; c = prev[c]) path.push(c);
  return path.reverse();
}
export const reachedAll = (g, start, has = null) => { const d = bfs(g, start); for (let i = 0; i < g.n; i++) if ((!has || has(i)) && d[i] < 0) return false; return true; };

// ------------------------------------------------------------------------------------------------ 1. HEDGE MAZE
export const HEDGE = { cols: 15, rows: 15, pitch: 3.4, thick: 1.0, height: 3.2, loops: 0.07, twist: 0.22 };

/**
 * Outdoor labyrinth. Returns { seed, cols, rows, g (open bits), entrance {x, gate side S}, exit {x, side N}, centre {x0, z0, x1, z1 (cell block)},
 * pockets [cell], distEntrance / distExit (Int32Array), pathToCentre, pathToExit, solvable }.
 */
export function planHedge(seed, o = {}) {
  const cols = o.cols | 0 || HEDGE.cols, rows = o.rows | 0 || HEDGE.rows;
  const R = new RNG(hashString('m5hedge:' + (seed >>> 0)));
  const g = makeGrid(cols, rows);
  carveTree(g, R, null, o.twist ?? HEDGE.twist);
  // centre chamber: a 3x3 block in the middle whose inner walls all come down
  const cx = (cols - 3) >> 1, cz = (rows - 3) >> 1;
  const centre = { x0: cx, z0: cz, x1: cx + 2, z1: cz + 2 };
  const inCentre = (i) => { const x = i % cols, z = (i / cols) | 0; return x >= centre.x0 && x <= centre.x1 && z >= centre.z0 && z <= centre.z1; };
  for (let z = centre.z0; z <= centre.z1; z++) for (let x = centre.x0; x <= centre.x1; x++) {
    const i = z * cols + x;
    if (x < centre.x1) link(g, i, 0);
    if (z < centre.z1) link(g, i, 1);
  }
  // braid: dead ends (outside the chamber) may open one more wall, so the maze has loops and fewer long detours
  const loops = o.loops ?? HEDGE.loops;
  for (let i = 0; i < g.n; i++) {
    if (inCentre(i) || degree(g, i) !== 1 || !R.chance(loops * 4)) continue;
    const x = i % cols, z = (i / cols) | 0, cand = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d], j = nz * cols + nx;
      if (inBounds(g, nx, nz) && !isLinked(g, i, d) && !inCentre(j)) cand.push(d);
    }
    if (cand.length) link(g, i, R.pick(cand));
  }
  // gates: entrance on the south edge (near the middle, so the walk in is fair), exit on the north edge as far away as possible
  const ex = R.int(2, cols - 3), entranceCell = (rows - 1) * cols + ex;
  const dE = bfs(g, entranceCell);
  let best = -1, exitCell = 0;
  for (let x = 1; x < cols - 1; x++) { const i = x; if (dE[i] > best) { best = dE[i]; exitCell = i; } }
  const dX = bfs(g, exitCell);
  // pockets: dead ends far from both gates (small rewards); never the chamber
  const ends = [];
  for (let i = 0; i < g.n; i++) if (!inCentre(i) && degree(g, i) === 1 && i !== entranceCell && i !== exitCell) ends.push(i);
  ends.sort((a, b) => (Math.min(dE[b], dX[b]) - Math.min(dE[a], dX[a])) || (a - b));
  const pockets = ends.slice(0, Math.max(3, Math.min(6, ends.length >> 1)));
  const centreCell = (centre.z0 + 1) * cols + centre.x0 + 1;
  const plan = {
    kind: 'hedge', seed: seed >>> 0, cols, rows, g, entrance: { cell: entranceCell, x: ex }, exit: { cell: exitCell, x: exitCell % cols }, centre, centreCell, pockets,
    distEntrance: dE, distExit: dX,
    pathToCentre: shortestPath(g, entranceCell, centreCell), pathToExit: shortestPath(g, entranceCell, exitCell),
  };
  plan.solvable = !!plan.pathToCentre && !!plan.pathToExit && reachedAll(g, entranceCell);
  return plan;
}

// ------------------------------------------------------------------------------------------------ 2. SERVER STACKS (shifting aisles)
export const STACKS = { cols: 11, rows: 11, pitch: 3.0, thick: 0.8, height: 3.7, phases: 4, swaps: 6, perm: 0.06, interval: 45, warn: 6 };

function treeAdjacency(cols, rows, flags) {
  const adj = Array.from({ length: cols * rows }, () => []);
  for (const eid of allEdges(cols, rows)) if (flags[eid]) { const [a, b] = edgeCells(cols, eid); adj[a].push([b, eid]); adj[b].push([a, eid]); }
  return adj;
}
function treePath(adj, a, b) {
  const prev = new Map([[a, null]]), q = [a];
  for (let h = 0; h < q.length && !prev.has(b); h++) for (const [j, eid] of adj[q[h]]) if (!prev.has(j)) { prev.set(j, [q[h], eid]); q.push(j); }
  const out = [];
  for (let c = b; prev.get(c); c = prev.get(c)[0]) out.push(prev.get(c)[1]);
  return out;   // edge ids of the tree path b -> a
}
/** new spanning tree: `m` edge swaps (add a non-tree edge, remove a tree edge of the cycle it closes). perm edges are never touched. */
function swapTree(cols, rows, flags, R, m, perm) {
  const next = Uint8Array.from(flags), fresh = new Set();
  const cand = R.shuffle(allEdges(cols, rows).filter((e) => !next[e] && !perm[e]));
  let done = 0;
  for (const e of cand) {
    if (done >= m) break;
    const [a, b] = edgeCells(cols, e);
    const path = treePath(treeAdjacency(cols, rows, next), a, b).filter((x) => !fresh.has(x));
    if (!path.length) continue;
    const drop = R.pick(path);
    next[drop] = 0; next[e] = 1; fresh.add(e); done++;
  }
  return next;
}

/**
 * Shifting labyrinth. Returns { cols, rows, trees[p] (edge flags), perm (edge flags), seq (phase order, ping-pong), movable [eid],
 * open(p) -> flags, entrance {cell, x}, exit {cell, x}, core (cell) }.
 */
export function planStacks(seed, o = {}) {
  const cols = o.cols | 0 || STACKS.cols, rows = o.rows | 0 || STACKS.rows, nPh = o.phases | 0 || STACKS.phases, swaps = o.swaps | 0 || STACKS.swaps;
  const R = new RNG(hashString('m5stacks:' + (seed >>> 0)));
  const nE = cols * rows * 2;
  const g0 = makeGrid(cols, rows);
  const edges = carveTree(g0, R, null, 0.3);
  const T0 = new Uint8Array(nE);
  for (const [a, , d] of edges) T0[edgeId(cols, a, d)] = 1;
  // permanent braid edges: a few walls that stay open in every phase (loops make the maze forgiving)
  const perm = new Uint8Array(nE);
  const walls = allEdges(cols, rows).filter((e) => !T0[e]);
  for (const e of R.shuffle(walls.slice())) if (R.chance(o.perm ?? STACKS.perm)) perm[e] = 1;
  const trees = [T0];
  for (let p = 1; p < nPh; p++) trees.push(swapTree(cols, rows, trees[p - 1], R, swaps, perm));
  const seq = [];
  for (let p = 0; p < nPh; p++) seq.push(p);
  for (let p = nPh - 2; p >= 1; p--) seq.push(p);   // ping-pong: 0 1 2 3 2 1 (every step is a small change)
  const flagsOf = (p) => { const f = new Uint8Array(nE); for (let e = 0; e < nE; e++) f[e] = trees[p][e] | perm[e]; return f; };
  const states = trees.map((_, p) => flagsOf(p));
  const movableSet = new Set();
  for (let k = 0; k < seq.length; k++) {
    const a = states[seq[k]], b = states[seq[(k + 1) % seq.length]];
    for (const e of allEdges(cols, rows)) if (a[e] !== b[e]) movableSet.add(e);
  }
  const movable = [...movableSet].sort((a, b) => a - b);
  // gates + core: entrance south, exit north (far apart), the Cold Core is the middle cell
  const ex = R.int(2, cols - 3);
  let xx = R.int(1, cols - 2);
  for (let t = 0; t < 8 && Math.abs(xx - ex) < 3; t++) xx = R.int(1, cols - 2);
  const plan = {
    kind: 'stacks', seed: seed >>> 0, cols, rows, nPhases: nPh, trees, perm, states, seq, movable,
    entrance: { cell: (rows - 1) * cols + ex, x: ex }, exit: { cell: xx, x: xx }, core: (rows >> 1) * cols + (cols >> 1),
    interval: o.interval ?? STACKS.interval, warn: o.warn ?? STACKS.warn,
  };
  plan.movableSet = movableSet;
  return plan;
}
/** open flags for phase p (tree + permanent edges) */
export const stacksOpen = (plan, p) => plan.states[((p % plan.nPhases) + plan.nPhases) % plan.nPhases];
/** phase index played at step k of the endless cycle */
export const stacksPhaseAt = (plan, k) => plan.seq[((k % plan.seq.length) + plan.seq.length) % plan.seq.length];
/** { open: [eid], close: [eid] } between two phases */
export function stacksDiff(plan, fromP, toP) {
  const a = stacksOpen(plan, fromP), b = stacksOpen(plan, toP), open = [], close = [];
  for (const e of plan.movable) { if (!a[e] && b[e]) open.push(e); else if (a[e] && !b[e]) close.push(e); }
  return { open, close };
}
/**
 * Prove the guarantees: every phase is connected (entrance reaches every cell incl. exit + core), and so is every transition state
 * (union of both phases while walls open, then the target). Returns { ok, errors }.
 */
export function verifyStacks(plan) {
  const errors = [];
  const { cols, rows } = plan;
  for (let p = 0; p < plan.nPhases; p++) {
    const g = gridFromFlags(cols, rows, stacksOpen(plan, p));
    if (!reachedAll(g, plan.entrance.cell)) errors.push(`phase ${p} not connected`);
    if (bfs(g, plan.entrance.cell)[plan.exit.cell] < 0) errors.push(`phase ${p} exit unreachable`);
  }
  for (let k = 0; k < plan.seq.length; k++) {
    const a = plan.seq[k], b = plan.seq[(k + 1) % plan.seq.length];
    const g = gridFromFlags(cols, rows, stacksOpen(plan, a), stacksOpen(plan, b));
    if (!reachedAll(g, plan.entrance.cell)) errors.push(`transition ${a}->${b} not connected`);
  }
  for (const e of plan.movable) if (plan.perm[e]) errors.push('movable edge is permanent');
  return { ok: !errors.length, errors };
}

// ------------------------------------------------------------------------------------------------ 3. PAPER ARCHIVE (two levels)
export const ARCHIVE = { cols: 7, rows: 7, pitch: 3.2, thick: 0.8, h0: 3.25, deckY: 3.6, wallH1: 1.3, roofY: 7.6, loops: 0.06 };

/**
 * Two-level shelf labyrinth. Level 0 = a full maze. Level 1 = two deck islands (A, B) separated by a gap column that only bridges cross;
 * a ladder joins one dead-end cell of island A with level 0; island B holds the reward and can only be entered by a bridge.
 * Returns { g0, g1, deck (Uint8: 1 island, 2 bridge cell), islandOf, bridges [{row, cells:[a, mid, b]}], ladder {cell, hole (side of the hole), out (side of the opening)},
 *           reward (cell on B), entrance, exit, solvable, dist (3D BFS from the entrance) }.
 */
export function planArchive(seed, o = {}) {
  const cols = o.cols | 0 || ARCHIVE.cols, rows = o.rows | 0 || ARCHIVE.rows;
  const R = new RNG(hashString('m5archive:' + (seed >>> 0)));
  const g0 = makeGrid(cols, rows);
  carveTree(g0, R, null, 0.25);
  const loops = o.loops ?? ARCHIVE.loops;
  for (let i = 0; i < g0.n; i++) {
    if (degree(g0, i) !== 1 || !R.chance(loops * 4)) continue;
    const x = i % cols, z = (i / cols) | 0, cand = [];
    for (let d = 0; d < 4; d++) if (inBounds(g0, x + DX[d], z + DZ[d]) && !isLinked(g0, i, d)) cand.push(d);
    if (cand.length) link(g0, i, R.pick(cand));
  }
  // deck level: rows 1 .. rows-2; island A on the left, gap column(s), island B on the right (the seed may mirror it by the runtime rotation)
  const gapW = 1, ca = (cols - gapW) >> 1;
  const aCols = ca, bFrom = ca + gapW;
  const deck = new Uint8Array(cols * rows), islandOf = new Int8Array(cols * rows).fill(-1);
  for (let z = 1; z <= rows - 2; z++) for (let x = 0; x < cols; x++) {
    const i = z * cols + x;
    if (x < aCols) { deck[i] = 1; islandOf[i] = 0; } else if (x >= bFrom) { deck[i] = 1; islandOf[i] = 1; } else { deck[i] = 2; islandOf[i] = -1; }   // 2 = potential bridge cell
  }
  const g1 = makeGrid(cols, rows);
  carveTree(g1, R, (i) => deck[i] === 1 && islandOf[i] === 0, 0.25);
  carveTree(g1, R, (i) => deck[i] === 1 && islandOf[i] === 1, 0.25);
  // bridges: two rows across the gap (never the top / bottom deck row so the rails have room)
  const rowsPick = R.shuffle(Array.from({ length: rows - 4 }, (_, k) => k + 2)).slice(0, 2).sort((a, b) => a - b);
  const bridges = [];
  for (const r of rowsPick) {
    const a = r * cols + (aCols - 1), m = r * cols + aCols, b = r * cols + bFrom;
    link(g1, a, 0); link(g1, m, 0);
    bridges.push({ row: r, cells: [a, m, b] });
  }
  const bridgeCells = new Set(bridges.map((b) => b.cells[1]));
  for (const c of bridgeCells) deck[c] = 2;
  for (let i = 0; i < g1.n; i++) if (deck[i] === 2 && !bridgeCells.has(i)) deck[i] = 0;   // unused gap cells are voids
  // ladder: a leaf of island A that is not a bridge landing
  const landing = new Set(bridges.flatMap((b) => [b.cells[0], b.cells[2]]));
  const leavesA = [];
  for (let i = 0; i < g1.n; i++) if (deck[i] === 1 && islandOf[i] === 0 && degree(g1, i) === 1 && !landing.has(i)) leavesA.push(i);
  if (!leavesA.length) { for (let i = 0; i < g1.n; i++) if (deck[i] === 1 && islandOf[i] === 0 && !landing.has(i) && degree(g1, i) <= 2) leavesA.push(i); }
  const dA = bfs(g1, bridges[0].cells[0], (j) => islandOf[j] !== 0 && j !== bridges[0].cells[0]);
  leavesA.sort((a, b) => (dA[b] - dA[a]) || (a - b));
  const ladderCell = leavesA[0] ?? bridges[0].cells[0];
  let outSide = 0;
  for (let d = 0; d < 4; d++) if (isLinked(g1, ladderCell, d)) { outSide = d; break; }
  const ladder = { cell: ladderCell, out: outSide, hole: OPP[outSide] };
  // reward: the leaf of island B farthest from the bridge landings
  const dB = bfs(g1, bridges[0].cells[2], (j) => islandOf[j] !== 1 && j !== bridges[0].cells[2]);
  let reward = -1, bd = -1;
  for (let i = 0; i < g1.n; i++) if (deck[i] === 1 && islandOf[i] === 1 && degree(g1, i) === 1 && dB[i] > bd) { bd = dB[i]; reward = i; }
  if (reward < 0) for (let i = 0; i < g1.n; i++) if (deck[i] === 1 && islandOf[i] === 1 && dB[i] > bd) { bd = dB[i]; reward = i; }
  // gates on level 0: entrance south, exit north (opposite corners of the maze so the walk crosses the archive)
  const ex = R.int(1, cols - 2);
  let xx = R.int(1, cols - 2);
  for (let t = 0; t < 8 && Math.abs(xx - ex) < 2; t++) xx = R.int(1, cols - 2);
  const plan = { kind: 'archive', seed: seed >>> 0, cols, rows, g0, g1, deck, islandOf, bridges, ladder, reward, entrance: { cell: (rows - 1) * cols + ex, x: ex }, exit: { cell: xx, x: xx } };
  Object.assign(plan, archiveSolve(plan));
  return plan;
}
/** 3D graph search: nodes = level 0 cells (0 .. n-1) and level 1 cells (n .. 2n-1), ladder = vertical edge. */
export function archiveSolve(plan) {
  const { g0, g1, cols, rows, ladder } = plan, n = cols * rows;
  const dist = new Int32Array(n * 2).fill(-1), q = [plan.entrance.cell];
  dist[plan.entrance.cell] = 0;
  const step = (from, to) => { if (dist[to] < 0) { dist[to] = dist[from] + 1; q.push(to); } };
  for (let h = 0; h < q.length; h++) {
    const node = q[h], lvl = node >= n ? 1 : 0, i = node % n, x = i % cols, z = (i / cols) | 0, g = lvl ? g1 : g0;
    for (let d = 0; d < 4; d++) if (g.open[i] & (1 << d)) step(node, lvl * n + (z + DZ[d]) * cols + x + DX[d]);
    if (i === ladder.cell) step(node, lvl ? i : n + i);
  }
  const toReward = plan.reward >= 0 ? dist[n + plan.reward] : -1, toExit = dist[plan.exit.cell];
  let l0All = true;
  for (let i = 0; i < n; i++) if (dist[i] < 0) l0All = false;
  let l1All = true;
  for (let i = 0; i < n; i++) if (plan.deck[i] && dist[n + i] < 0) l1All = false;
  return { dist, toReward, toExit, solvable: toReward > 0 && toExit > 0 && l0All && l1All };
}

// ------------------------------------------------------------------------------------------------ wall lattice (shared by the builders)
/**
 * Wall segments of a grid in maze-local metres, origin = the middle of the grid. `openFn(edgeKind, ...)` is replaced by two predicates:
 * `open(cellA, cellB)` says whether the edge between two neighbouring cells is open; gates lists openings: perimeter {side S|N|W|E, x | z} or inner {side V, z, x} / {side H, z, x} (a vertical / horizontal segment).
 * Returns { V[vz][vx], H[hz][hx] } boolean walls, plus merged runs { ax: 'x'|'z', c (line coordinate), u0, u1 (span, metres) }.
 */
export function wallLattice(cols, rows, isOpen, gates = [], pitch = 3, hasCell = null) {
  const V = Array.from({ length: rows }, () => new Uint8Array(cols + 1)), Hh = Array.from({ length: rows + 1 }, () => new Uint8Array(cols));
  const has = (x, z) => x >= 0 && z >= 0 && x < cols && z < rows && (!hasCell || hasCell(z * cols + x));
  for (let z = 0; z < rows; z++) for (let x = 0; x <= cols; x++) {
    const a = has(x - 1, z), b = has(x, z);
    if (!a && !b) continue;
    V[z][x] = a && b ? (isOpen(z * cols + x - 1, z * cols + x) ? 0 : 1) : 1;
  }
  for (let z = 0; z <= rows; z++) for (let x = 0; x < cols; x++) {
    const a = has(x, z - 1), b = has(x, z);
    if (!a && !b) continue;
    Hh[z][x] = a && b ? (isOpen((z - 1) * cols + x, z * cols + x) ? 0 : 1) : 1;
  }
  for (const gt of gates) { if (gt.side === 'S') Hh[rows][gt.x] = 0; else if (gt.side === 'N') Hh[0][gt.x] = 0; else if (gt.side === 'W') V[gt.z][0] = 0; else if (gt.side === 'E') V[gt.z][cols] = 0; else if (gt.side === 'V') V[gt.z][gt.x] = 0; else if (gt.side === 'H') Hh[gt.z][gt.x] = 0; }
  const ox = (cols * pitch) / 2, oz = (rows * pitch) / 2, runs = [];
  for (let x = 0; x <= cols; x++) {   // vertical walls (along z) merged down each lattice line
    let z = 0;
    while (z < rows) {
      if (!V[z][x]) { z++; continue; }
      let z1 = z;
      while (z1 + 1 < rows && V[z1 + 1][x]) z1++;
      runs.push({ ax: 'z', c: x * pitch - ox, u0: z * pitch - oz, u1: (z1 + 1) * pitch - oz });
      z = z1 + 1;
    }
  }
  for (let z = 0; z <= rows; z++) {
    let x = 0;
    while (x < cols) {
      if (!Hh[z][x]) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < cols && Hh[z][x1 + 1]) x1++;
      runs.push({ ax: 'x', c: z * pitch - oz, u0: x * pitch - ox, u1: (x1 + 1) * pitch - ox });
      x = x1 + 1;
    }
  }
  return { V, H: Hh, runs };
}

/** local metres of a cell centre (origin = grid middle) */
export const cellCentre = (cols, rows, pitch, i) => ({ x: ((i % cols) + 0.5) * pitch - (cols * pitch) / 2, z: (((i / cols) | 0) + 0.5) * pitch - (rows * pitch) / 2 });
/** local -> world for a frame { x, z, rot } (same formula as worlds2_solids Solids.w) */
export function toWorld(f, lx, lz) { const c = Math.cos(f.rot), s = Math.sin(f.rot); return [f.x + lx * c + lz * s, f.z - lx * s + lz * c]; }
/** world -> local */
export function toLocal(f, wx, wz) { const dx = wx - f.x, dz = wz - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot); return [dx * c - dz * s, dx * s + dz * c]; }
/** which cell of a grid centred on the frame holds a world point (-1 outside) */
export function cellAtWorld(f, cols, rows, pitch, wx, wz) {
  const [lx, lz] = toLocal(f, wx, wz);
  const x = Math.floor((lx + (cols * pitch) / 2) / pitch), z = Math.floor((lz + (rows * pitch) / 2) / pitch);
  return x < 0 || z < 0 || x >= cols || z >= rows ? -1 : z * cols + x;
}
/** shortest waypoint list (world xz) between two world points inside a maze grid, via cell centres; null when a point is outside */
export function mazeRoute(f, plan, pitch, fromXZ, toXZ) {
  const a = cellAtWorld(f, plan.cols, plan.rows, pitch, fromXZ[0], fromXZ[1]), b = cellAtWorld(f, plan.cols, plan.rows, pitch, toXZ[0], toXZ[1]);
  if (a < 0 || b < 0) return null;
  const path = shortestPath(plan.g, a, b);
  if (!path) return null;
  return path.map((i) => { const c = cellCentre(plan.cols, plan.rows, pitch, i); return toWorld(f, c.x, c.z); });
}

/** seeded facts every peer agrees on, for a map seed: which stacks / hedge / archive variant a site uses */
export const siteSeed = (mapSeed, salt) => (hashString(`m5site:${mapSeed | 0}:${salt}`) >>> 0);
