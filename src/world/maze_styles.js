// STEALTH wave 4 - labyrinth carvers for the procedural facility (pure, no three.js, deterministic).
// A maze room of w x h layout cells starts with every inner wall closed; a carver returns the list of inner edges to OPEN.
//   edge = [x, z, d]  local cell (x, z), d 0 = the wall towards +x, d 1 = the wall towards +z
// Every carver returns a CONNECTED graph over all w x h cells (checked by tools/harness/stealth_maze.test.mjs on hundreds of seeds),
// so a maze can never trap loot or hide the exit; the facility generator only has to connect the room to the outside.
//   dfs        long twisty corridors (recursive backtracker, the original cycle2 labyrinth minus its loops)
//   braid      dfs with most dead ends knocked through: lots of loops, hard to get lost for good but easy to be chased in circles
//   prim       short branchy bramble: many little dead ends (loot nooks)
//   serpentine one long back-and-forth hall with a few shortcuts
//   spiral     a snail: walk to the middle and back, a couple of shortcuts
//   ring       a hallway that loops around the room with repeating alcove rooms hanging off the inside ("endless" hallway, actually finite)
export const MAZE_STYLES = ['dfs', 'braid', 'prim', 'serpentine', 'spiral', 'ring'];

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const key = (x, z, d) => { if (d === 2) { x -= 1; d = 0; } else if (d === 3) { z -= 1; d = 1; } return [x, z, d]; };
const ek = (w, x, z, d) => { const k = key(x, z, d); return (k[1] * w + k[0]) * 2 + k[2]; };

/** small edge set helper over a w x h grid */
function grid(w, h) {
  const open = new Set();
  const inb = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
  const link = (x, z, d) => { if (inb(x + DX[d], z + DZ[d]) && inb(x, z)) open.add(ek(w, x, z, d)); };
  const isOpen = (x, z, d) => open.has(ek(w, x, z, d));
  const deg = (x, z) => { let n = 0; for (let d = 0; d < 4; d++) if (inb(x + DX[d], z + DZ[d]) && isOpen(x, z, d)) n++; return n; };
  const edges = () => {
    const out = [];
    for (const k of open) { const d = k & 1, ci = k >> 1; out.push([ci % w, (ci / w) | 0, d]); }
    out.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
    return out;
  };
  return { open, inb, link, isOpen, deg, edges };
}

function dfs(w, h, rng, G) {
  const seen = new Uint8Array(w * h);
  const sx = rng.int(0, w - 1), sz = rng.int(0, h - 1);
  seen[sz * w + sx] = 1;
  const st = [[sx, sz]];
  while (st.length) {
    const [x, z] = st[st.length - 1];
    const opts = [];
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], nz = z + DZ[d]; if (G.inb(nx, nz) && !seen[nz * w + nx]) opts.push(d); }
    if (!opts.length) { st.pop(); continue; }
    const d = opts[rng.int(0, opts.length - 1)];
    G.link(x, z, d);
    seen[(z + DZ[d]) * w + x + DX[d]] = 1;
    st.push([x + DX[d], z + DZ[d]]);
  }
}

function braid(w, h, rng, G, keep = 0.22) {
  dfs(w, h, rng, G);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (G.deg(x, z) !== 1 || rng.next() < keep) continue;
    const opts = [];
    for (let d = 0; d < 4; d++) if (G.inb(x + DX[d], z + DZ[d]) && !G.isOpen(x, z, d)) opts.push(d);
    if (opts.length) G.link(x, z, opts[rng.int(0, opts.length - 1)]);
  }
}

function prim(w, h, rng, G) {
  const seen = new Uint8Array(w * h);
  const front = [];
  const add = (x, z) => { seen[z * w + x] = 1; for (let d = 0; d < 4; d++) if (G.inb(x + DX[d], z + DZ[d])) front.push([x, z, d]); };
  add(rng.int(0, w - 1), rng.int(0, h - 1));
  while (front.length) {
    const i = rng.int(0, front.length - 1);
    const [x, z, d] = front[i];
    front[i] = front[front.length - 1]; front.pop();
    const nx = x + DX[d], nz = z + DZ[d];
    if (seen[nz * w + nx]) continue;
    G.link(x, z, d);
    add(nx, nz);
  }
}

function shortcuts(w, h, rng, G, n) {
  for (let k = 0, guard = 0; k < n && guard < 60; guard++) {
    const x = rng.int(0, w - 1), z = rng.int(0, h - 1), d = rng.int(0, 1);
    if (!G.inb(x + DX[d], z + DZ[d]) || G.isOpen(x, z, d)) continue;
    G.link(x, z, d); k++;
  }
}

function serpentine(w, h, rng, G) {
  // horizontal runs when the room is wider than tall, else vertical runs
  const horiz = w >= h;
  const A = horiz ? h : w, B = horiz ? w : h;       // A runs of length B
  const at = (a, b) => (horiz ? [b, a] : [a, b]);
  for (let a = 0; a < A; a++) {
    for (let b = 0; b < B - 1; b++) { const [x, z] = at(a, b); G.link(x, z, horiz ? 0 : 1); }
    if (a < A - 1) { const b = a % 2 === 0 ? B - 1 : 0; const [x, z] = at(a, b); G.link(x, z, horiz ? 1 : 0); }
  }
  shortcuts(w, h, rng, G, Math.max(1, Math.round(A / 2)));
}

function spiral(w, h, rng, G) {
  let x0 = 0, z0 = 0, x1 = w - 1, z1 = h - 1;
  const order = [];
  while (x0 <= x1 && z0 <= z1) {
    for (let x = x0; x <= x1; x++) order.push([x, z0]);
    for (let z = z0 + 1; z <= z1; z++) order.push([x1, z]);
    if (z1 > z0) for (let x = x1 - 1; x >= x0; x--) order.push([x, z1]);
    if (x1 > x0) for (let z = z1 - 1; z > z0; z--) order.push([x0, z]);
    x0++; z0++; x1--; z1--;
  }
  for (let i = 0; i + 1 < order.length; i++) {
    const [ax, az] = order[i], [bx, bz] = order[i + 1];
    const d = bx > ax ? 0 : bx < ax ? 2 : bz > az ? 1 : 3;
    G.link(ax, az, d);
  }
  shortcuts(w, h, rng, G, 2 + (w * h > 24 ? 1 : 0));
}

function ring(w, h, rng, G) {
  if (w < 3 || h < 3) { dfs(w, h, rng, G); return; }
  // border cycle
  for (let x = 0; x < w - 1; x++) { G.link(x, 0, 0); G.link(x, h - 1, 0); }
  for (let z = 0; z < h - 1; z++) { G.link(0, z, 1); G.link(w - 1, z, 1); }
  // interior alcoves: grow a spanning forest rooted at the ring (each inner cell joins the ring / another alcove once)
  const inRing = (x, z) => x === 0 || z === 0 || x === w - 1 || z === h - 1;
  const seen = new Uint8Array(w * h);
  const front = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (inRing(x, z)) seen[z * w + x] = 1;
  const push = (x, z) => { for (let d = 0; d < 4; d++) { const nx = x + DX[d], nz = z + DZ[d]; if (G.inb(nx, nz) && !seen[nz * w + nx]) front.push([x, z, d]); } };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (inRing(x, z)) push(x, z);
  while (front.length) {
    const i = rng.int(0, front.length - 1);
    const [x, z, d] = front[i];
    front[i] = front[front.length - 1]; front.pop();
    const nx = x + DX[d], nz = z + DZ[d];
    if (seen[nz * w + nx]) continue;
    G.link(x, z, d);
    seen[nz * w + nx] = 1;
    push(nx, nz);
  }
}

const CARVERS = { dfs, braid, prim, serpentine, spiral, ring };

/** Inner edges to open for a maze of style `style` over w x h cells. rng: core/rng.js RNG (int / next). */
export function carveMaze(style, w, h, rng) {
  const G = grid(w, h);
  (CARVERS[style] || dfs)(w, h, rng, G);
  return G.edges();
}

/** true when the edge list connects every cell of the w x h grid */
export function mazeConnected(w, h, edges) {
  const G = grid(w, h);
  for (const [x, z, d] of edges) G.link(x, z, d);
  const seen = new Uint8Array(w * h);
  const st = [0]; seen[0] = 1; let n = 1;
  while (st.length) {
    const i = st.pop(), x = i % w, z = (i / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (!G.inb(nx, nz) || seen[nz * w + nx] || !G.isOpen(x, z, d)) continue;
      seen[nz * w + nx] = 1; n++; st.push(nz * w + nx);
    }
  }
  return n === w * h;
}

/** local cells with exactly one inner opening (dead ends). `extra` = Set of "x,z" cells that also have an opening to the outside. */
export function mazeDeadEnds(w, h, edges, extra = null) {
  const G = grid(w, h);
  for (const [x, z, d] of edges) G.link(x, z, d);
  const out = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (G.inb(nx, nz) && G.isOpen(x, z, d)) n++;
    }
    if (extra?.has(x + ',' + z)) n++;
    if (n === 1) out.push([x, z]);
  }
  return out;
}

/** pick a style for a maze room from its shape (long thin rooms suit serpentine, squares suit spiral / ring) */
export function pickMazeStyle(rng, w, h, size = 1) {
  const pool = [['dfs', 3], ['braid', 3], ['prim', 3]];
  if (Math.min(w, h) >= 2) pool.push(['serpentine', 2]);
  if (Math.min(w, h) >= 3 && w * h >= 12) pool.push(['spiral', 2]);
  if (Math.min(w, h) >= 4 && size >= 1) pool.push(['ring', 2]);
  let tot = 0; for (const [, wt] of pool) tot += wt;
  let r = rng.next() * tot;
  for (const [id, wt] of pool) { r -= wt; if (r <= 0) return id; }
  return 'dfs';
}
