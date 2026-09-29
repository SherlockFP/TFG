// BACKROOMS POCKET - pure plan generator (no DOM / three.js: node-testable).
// generatePocket(key) -> a deterministic "Level 0" maze: 6 m grid cells, irregular walls, doorless openings,
// wall stubs, open halls with pillars, a few dark zones, a strict troffer grid, a far EXIT, loot/landing spots and
// decoration slots. src/world/backrooms_pocket.js turns the plan into geometry, colliders and a NavGrid.
// Every peer builds the same pocket from the same key (pocketKey(runSeed, day, index)).
import { RNG, hashString } from '../core/rng.js';

// Far away from every map: facility interiors live at x/z ~ +-200, the ship at the origin. Floor height = facility
// floor (FACILITY_Y in facility.js), so the game treats a pocket player as "indoor" (fog, far plane, creature zone).
export const POCKET = Object.freeze({ x: 5000, z: 0, y: -300, cell: 6, ceil: 2.9, wall: 0.22, doorH: 2.22 });
export const EDGE = Object.freeze({ OPEN: 0, WALL: 1, DOOR: 2, STUB: 3 });
const { OPEN, WALL, DOOR, STUB } = EDGE;
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

/** 32-bit pocket key from the run seed, the day and the pocket index of that day. */
export function pocketKey(seed, day, index) { return hashString(`noclip|${seed >>> 0}|${day | 0}|${index | 0}`) || 1; }

// Wall writing (graffiti atlas slots, see backrooms_pocket.js GRAFFITI). Index 0 is the rare "=)".
export const GRAFFITI_TEXT = ['=)', 'EXIT →', '← EXIT', "DON'T TRUST THE LIGHTS", 'ALMOND WATER = SAFE', 'u/throwaway_janitor was here', 'IT HEARS YOU WALK', 'DAY 41', 'NO SIGNAL', 'LEVEL 0 NEVER ENDS'];

export function generatePocket(key) {
  key = (key >>> 0) || 1;
  const rng = new RNG(key);
  const C = POCKET.cell, Y = POCKET.y;
  const W = 13 + rng.int(0, 2), H = 13 + rng.int(0, 2);
  const ox = POCKET.x - (W * C) / 2, oz = POCKET.z - (H * C) / 2;
  // vertical wall lines x = 0..W (one entry per cell row z), horizontal lines z = 0..H (one entry per column x)
  const V = new Uint8Array((W + 1) * H).fill(WALL);
  const Hz = new Uint8Array(W * (H + 1)).fill(WALL);
  const vid = (x, z) => (x + z * (W + 1)) * 2;          // even ids: vertical edges
  const hid = (x, z) => (x + z * W) * 2 + 1;            // odd ids: horizontal edges
  const typeOf = (id) => (id & 1 ? Hz[id >> 1] : V[id >> 1]);
  const setT = (id, t) => { if (id & 1) Hz[id >> 1] = t; else V[id >> 1] = t; };
  const idx = (x, z) => x + z * W;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  // NavGrid contract: edge key between cell (x, z) and its neighbour in direction d (0 +x, 1 +z, 2 -x, 3 -z)
  const edgeKey = (x, z, d) => (d === 0 ? vid(x + 1, z) : d === 2 ? vid(x, z) : d === 1 ? hid(x, z + 1) : hid(x, z));

  // 1) random spanning tree (every cell reachable), the rest of the edges become walls / openings / stubs
  const inner = [];
  for (let z = 0; z < H; z++) for (let x = 1; x < W; x++) inner.push({ id: vid(x, z), a: idx(x - 1, z), b: idx(x, z) });
  for (let z = 1; z < H; z++) for (let x = 0; x < W; x++) inner.push({ id: hid(x, z), a: idx(x, z - 1), b: idx(x, z) });
  rng.shuffle(inner);
  const par = new Int32Array(W * H);
  for (let i = 0; i < par.length; i++) par[i] = i;
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const extra = [];
  for (const e of inner) {
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) { par[ra] = rb; setT(e.id, rng.chance(0.5) ? OPEN : DOOR); } else extra.push(e);
  }
  for (const e of extra) {
    const r = rng.next();
    setT(e.id, r < 0.33 ? OPEN : r < 0.5 ? DOOR : r < 0.64 ? STUB : WALL);
  }
  // 2) open halls: every edge inside a 2..4 x 2..3 block is knocked out (the huge empty rooms with pillars)
  const nHall = rng.int(2, 4);
  for (let k = 0; k < nHall; k++) {
    const hw = rng.int(2, 4), hh = rng.int(2, 3);
    const hx = rng.int(0, W - hw), hz = rng.int(0, H - hh);
    for (let z = hz; z < hz + hh; z++) for (let x = hx + 1; x < hx + hw; x++) setT(vid(x, z), OPEN);
    for (let z = hz + 1; z < hz + hh; z++) for (let x = hx; x < hx + hw; x++) setT(hid(x, z), OPEN);
  }
  // 3) per-edge shape data in a fixed id order (doorway widths, stub side + length)
  const doorW = new Map(), stub = new Map();
  const allIds = [];
  for (let z = 0; z < H; z++) for (let x = 0; x <= W; x++) allIds.push(vid(x, z));
  for (let z = 0; z <= H; z++) for (let x = 0; x < W; x++) allIds.push(hid(x, z));
  for (const id of allIds) {
    const t = typeOf(id);
    if (t === DOOR) doorW.set(id, rng.float(1.5, 2.4));
    else if (t === STUB) stub.set(id, { from: rng.chance(0.5) ? 0 : 1, len: rng.float(1.8, 3.4) });
  }
  // edge geometry: endpoints of the grid line segment an edge id stands for
  const edgeSeg = (id) => {
    const k = id >> 1;
    if (id & 1) { const x = k % W, z = (k / W) | 0; return { x0: ox + x * C, z0: oz + z * C, x1: ox + (x + 1) * C, z1: oz + z * C, axis: 'x', gx: x, gz: z }; }
    const x = k % (W + 1), z = (k / (W + 1)) | 0;
    return { x0: ox + x * C, z0: oz + z * C, x1: ox + x * C, z1: oz + (z + 1) * C, axis: 'z', gx: x, gz: z };
  };

  // 4) pillars on grid vertices where all four edges are open (classic Level 0 halls)
  const pillars = [];
  for (let j = 1; j < H; j++) for (let i = 1; i < W; i++) {
    if (typeOf(vid(i, j - 1)) !== OPEN || typeOf(vid(i, j)) !== OPEN || typeOf(hid(i - 1, j)) !== OPEN || typeOf(hid(i, j)) !== OPEN) continue;
    if (rng.chance(0.42)) pillars.push({ x: ox + i * C, z: oz + j * C, i, j });
  }

  // 5) walking distances (cells) from the landing cell
  const passable = (x, z, d) => { const nx = x + DX[d], nz = z + DZ[d]; return inb(nx, nz) && typeOf(edgeKey(x, z, d)) !== WALL; };
  const bfs = (start) => {
    const dist = new Int16Array(W * H).fill(-1);
    const q = [start]; dist[start] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi], x = c % W, z = (c / W) | 0;
      for (let d = 0; d < 4; d++) {
        if (!passable(x, z, d)) continue;
        const n = idx(x + DX[d], z + DZ[d]);
        if (dist[n] < 0) { dist[n] = dist[c] + 1; q.push(n); }
      }
    }
    return dist;
  };
  const spawnCell = idx(W >> 1, H >> 1);
  const dist = bfs(spawnCell);

  // 6) dark zones: dead troffers over a few connected clusters away from the landing cell
  const dark = new Uint8Array(W * H);
  const nDark = rng.int(2, 4);
  const darkCands = [];
  for (let i = 0; i < W * H; i++) if (dist[i] >= 3) darkCands.push(i);
  for (let k = 0; k < nDark && darkCands.length; k++) {
    const seed = rng.pick(darkCands);
    const size = rng.int(5, 9);
    const q = [seed]; let n = 0;
    const seen = new Set([seed]);
    for (let qi = 0; qi < q.length && n < size; qi++) {
      const c = q[qi];
      if (dist[c] < 2) continue;
      dark[c] = 1; n++;
      const x = c % W, z = (c / W) | 0;
      for (const d of rng.shuffle([0, 1, 2, 3])) {
        if (!passable(x, z, d)) continue;
        const nb = idx(x + DX[d], z + DZ[d]);
        if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
      }
    }
  }

  // 7) the EXIT: a solid wall of one of the farthest lit cells
  let maxD = 0;
  for (let i = 0; i < W * H; i++) maxD = Math.max(maxD, dist[i]);
  const exitCands = [];
  for (let i = 0; i < W * H; i++) {
    if (dist[i] < Math.max(2, Math.floor(maxD * 0.72))) continue;
    const x = i % W, z = (i / W) | 0;
    const walls = [0, 1, 2, 3].filter((d) => typeOf(edgeKey(x, z, d)) === WALL);
    if (walls.length) exitCands.push({ i, x, z, walls });
  }
  exitCands.sort((a, b) => dist[b.i] - dist[a.i] || a.i - b.i);
  const ex = exitCands.length ? exitCands[Math.min(exitCands.length - 1, rng.int(0, 4))] : { i: 0, x: 0, z: 0, walls: [3] };
  dark[ex.i] = 0;
  const exD = rng.pick(ex.walls);
  const exSeg = edgeSeg(edgeKey(ex.x, ex.z, exD));
  const inX = -DX[exD], inZ = -DZ[exD];                               // wall normal pointing into the exit cell
  const exit = {
    cell: ex.i, d: exD, edge: edgeKey(ex.x, ex.z, exD), nx: inX, nz: inZ, yaw: Math.atan2(inX, inZ),
    x: (exSeg.x0 + exSeg.x1) / 2 + inX * (POCKET.wall / 2 + 0.01), z: (exSeg.z0 + exSeg.z1) / 2 + inZ * (POCKET.wall / 2 + 0.01),
    dist: dist[ex.i],
  };

  // 8) troffer grid: 4 panels per cell on a strict 3 m grid (v = light strength, fl = flicker phase / -1 dead)
  const troffers = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = idx(x, z);
    for (const [ax, az] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]]) {
      let v = 1, fl = 0;
      const r = rng.next();
      if (dark[c]) { if (r < 0.12) { v = 0.35; fl = 1 + rng.int(0, 97); } else { v = 0; fl = -1; } }
      else if (r < 0.03) { v = 0; fl = -1; }
      else if (r < 0.085) { v = 0.7; fl = 1 + rng.int(0, 97); }
      troffers.push({ x: ox + x * C + ax, z: oz + z * C + az, v, fl, cell: c });
    }
  }

  // 9) spots: loot, landings, chairs, stains, puddles
  const cellPos = (c, m = 1.1) => ({ x: ox + (c % W) * C + rng.float(m, C - m), z: oz + ((c / W) | 0) * C + rng.float(m, C - m) });
  const order = [];
  for (let i = 0; i < W * H; i++) if (i !== spawnCell) order.push(i);
  rng.shuffle(order);
  const loot = order.slice(0, 18).map((c) => ({ ...cellPos(c), cell: c, dark: !!dark[c], dist: dist[c] }));
  const landings = order.filter((c) => !dark[c] && dist[c] >= 2 && Math.abs(dist[c] - exit.dist) >= 3).slice(0, 10).map((c) => ({ ...cellPos(c, 1.6), cell: c }));
  const chairs = [];
  for (const c of order.slice(18, 18 + rng.int(3, 6))) chairs.push({ ...cellPos(c, 0.9), yaw: rng.float(0, Math.PI * 2), tipped: rng.chance(0.25), cell: c });
  const stains = [];
  for (let i = 0; i < W * H; i++) if (rng.chance(0.5)) for (let k = rng.int(1, 2); k > 0; k--) stains.push({ ...cellPos(i, 0.4), r: rng.float(0.5, 1.7), a: rng.float(0.25, 0.5) });
  const ceilStains = [];
  for (let i = 0; i < W * H; i++) if (rng.chance(0.35)) ceilStains.push({ ...cellPos(i, 0.6), r: rng.float(0.4, 1.2), a: rng.float(0.2, 0.42) });
  const puddles = [];
  for (let k = rng.int(2, 4); k > 0; k--) { const c = rng.pick(order); puddles.push({ ...cellPos(c, 1.4), rx: rng.float(0.5, 1.3), rz: rng.float(0.4, 1.0), cell: c }); }

  // 10) wall faces (for outlets, vents and graffiti): every solid wall edge side that faces into a cell
  const faces = [];
  for (const id of allIds) {
    if (typeOf(id) !== WALL || id === exit.edge) continue;
    const s = edgeSeg(id);
    if (s.axis === 'z') {
      if (s.gx < W) faces.push({ id, nx: 1, nz: 0, cell: idx(s.gx, s.gz), ...s });
      if (s.gx > 0) faces.push({ id, nx: -1, nz: 0, cell: idx(s.gx - 1, s.gz), ...s });
    } else {
      if (s.gz < H) faces.push({ id, nx: 0, nz: 1, cell: idx(s.gx, s.gz), ...s });
      if (s.gz > 0) faces.push({ id, nx: 0, nz: -1, cell: idx(s.gx, s.gz - 1), ...s });
    }
  }
  const outlets = [], vents = [], graffiti = [];
  for (const f of faces) {
    if (rng.chance(0.14)) outlets.push({ f, along: rng.float(0.9, C - 0.9), y: 0.32 });
    if (rng.chance(0.06)) vents.push({ f, along: rng.float(1.2, C - 1.2), y: rng.chance(0.6) ? POCKET.ceil - 0.32 : 0.3 });
  }
  const gFaces = rng.shuffle(faces.filter((f) => !dark[f.cell]).slice());
  for (let k = 0; k < Math.min(gFaces.length, rng.int(4, 7)); k++) {
    const text = k === 0 && rng.chance(0.35) ? 0 : 1 + rng.int(0, GRAFFITI_TEXT.length - 2);
    graffiti.push({ f: gFaces[k], along: rng.float(1.4, C - 1.4), y: rng.float(1.2, 1.9), text, rot: rng.float(-0.12, 0.12) });
  }

  // NavGrid-compatible layout (src/world/nav.js): cells, edgeKey, open edges, doorway widths
  const cells = new Uint8Array(W * H).fill(1);
  const open = new Set(), edgeInfo = new Map();
  for (const e of inner) { const t = typeOf(e.id); if (t !== WALL) { open.add(e.id); if (t === DOOR) edgeInfo.set(e.id, { width: doorW.get(e.id), key: e.id }); } }
  const layout = { cell: C, w: W, h: H, ox, oz, y: Y, cells, edgeKey, open, edgeInfo, idx, seed: key, theme: 'br_pocket' };

  return {
    key, W, H, C, ox, oz, y: Y, ceil: POCKET.ceil, V, Hz, typeOf, vid, hid, edgeKey, edgeSeg, allIds, doorW, stub,
    pillars, dist, maxDist: maxD, spawnCell, dark, exit, troffers, loot, landings, chairs, stains, ceilStains, puddles,
    outlets, vents, graffiti, layout, idx, inb,
    spawn: { x: ox + (spawnCell % W) * C + C / 2, z: oz + ((spawnCell / W) | 0) * C + C / 2 },
  };
}
