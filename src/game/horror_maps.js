// HORROR module - pocket maps (pure data, node-testable). Tiles are 2 m. Built from rectangles so nothing is typed by hand-counted columns.
// A pocket is reached through a "closet" (see horror.js): tile 'X' is the alcove of the closet on the pocket side, its door faces the neighbouring floor tile.
// Legend
//   '#' wall  ' ' nothing   '.' floor  ',' carpet  's' safe-room floor (creatures never enter)  'F' tall floor (foyer)  'r' trap-run floor
//   walkable specials: 'X' closet alcove, 'z' Shambler, 'w' Manor Warden, 'p' pistol, 'a' ammo box, 'h' herb plant, 'l' loot, 'L' lamp, 'D' secret door
//   blocking props:    'T' typewriter, 'B' item box, 'C' chest, 'P' pillar, '$' shelf
export const TILE = 2;
export const WALK = new Set('.,sFrXzwpahlLD'.split(''));
export const SOLID_PROPS = new Set('TBCP$'.split(''));
export const FLOORS = new Set('.,sFrXzwpahlLD'.split(''));

class G {
  constructor(w, h, ch = '#') { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill(ch)); }
  fill(x, z, w, h, ch) { for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.g[j][i] = ch; return this; }
  set(x, z, ch) { if (x >= 0 && z >= 0 && x < this.w && z < this.h) this.g[z][x] = ch; return this; }
  get(x, z) { return this.g[z]?.[x] ?? '#'; }
  rows() { return this.g.map((r) => r.join('')); }
}

// ------------------------------------------------------------------------------------------------ Outbreak wing
function outbreak() {
  const m = new G(34, 22);
  m.fill(3, 10, 12, 10, ',');            // reception foyer
  m.set(8, 20, 'X');                     // the closet alcove (door faces north into the foyer)
  m.fill(1, 2, 7, 6, 's');               // safe room
  m.fill(4, 8, 1, 2, '.');               // its doorway
  m.fill(15, 14, 8, 2, '.');             // east corridor
  m.fill(17, 14, 4, 2, 'r');             // the trap run inside it
  m.fill(23, 14, 1, 2, '.');
  m.fill(24, 6, 9, 14, '.');             // lab
  m.fill(15, 2, 8, 7, '.');              // morgue
  m.fill(23, 7, 1, 2, '.');              // morgue <-> lab
  // safe room dressing
  m.set(1, 2, 'T'); m.set(7, 2, 'B'); m.set(2, 7, 'h'); m.set(6, 7, 'h'); m.set(4, 4, 'L');
  // foyer: sidearm on the reception desk side, shamblers, lamps
  m.set(5, 18, 'p'); m.set(6, 12, 'z'); m.set(11, 13, 'z'); m.set(10, 17, 'z');
  for (const [x, z] of [[4, 11], [13, 11], [8, 15], [4, 18], [13, 18]]) m.set(x, z, 'L');
  // corridor
  m.set(16, 14, 'L'); m.set(21, 15, 'L');
  // lab
  for (const [x, z] of [[26, 8], [30, 9], [27, 13], [31, 15], [28, 18]]) m.set(x, z, 'z');
  for (const [x, z] of [[25, 7], [31, 7], [32, 19], [25, 19]]) m.set(x, z, 'l');
  m.set(24, 18, 'h');
  for (const [x, z] of [[27, 10], [30, 17], [25, 15]]) m.set(x, z, 'L');
  // morgue
  m.set(17, 4, 'z'); m.set(20, 6, 'z'); m.set(16, 3, 'l'); m.set(21, 3, 'l'); m.set(22, 2, 'a'); m.set(18, 5, 'L');
  return m;
}
export const OUTBREAK = {
  id: 'outbreak', style: 'outbreak', H: 3.4, tallH: 3.4, map: outbreak().rows(), title: 'Quarantine Wing',
  entry: { x: 8, z: 20, fx: 0, fz: -1 },                                      // alcove tile + direction the closet door faces (into the pocket)
  traps: [{ id: 'p0', type: 'crusher', axis: 'x', box: [17, 14, 4, 2], panel: { x: 16, z: 14, side: 'n' } }],   // box = x, z, w, h in tiles
  zombies: [8, 10],
  safe: [1, 2, 7, 6],                                                          // the safe room rectangle (x, z, w, h in tiles): creatures never path into it
};

// ------------------------------------------------------------------------------------------------ Mansion (two floors, dark oak)
function mansionGround() {
  const m = new G(40, 32);
  m.fill(15, 9, 10, 12, 'F');            // foyer (tall)
  m.fill(17, 21, 6, 3, ',');             // vestibule
  m.set(19, 24, 'X');
  m.fill(3, 9, 10, 8, '.');              // dining hall
  m.fill(13, 11, 2, 2, '.');
  m.fill(3, 18, 8, 7, '.');              // kitchen
  m.fill(6, 17, 2, 1, '.');
  m.fill(11, 22, 6, 2, '.');             // kitchen corridor
  m.fill(27, 9, 10, 8, '.');             // library
  m.fill(25, 11, 2, 2, '.');
  m.fill(29, 18, 8, 7, '.');             // study
  m.fill(31, 17, 2, 1, '.');
  m.fill(23, 22, 6, 2, '.');             // study corridor
  // hidden rooms behind secret bookcases
  m.fill(6, 4, 3, 4, '.'); m.set(7, 8, 'D');
  m.fill(38, 10, 1, 5, '.'); m.set(37, 12, 'D');
  // pillars + chests
  for (const [x, z] of [[17, 12], [22, 12], [17, 17], [22, 17]]) m.set(x, z, 'P');
  m.set(6, 4, 'C'); m.set(8, 4, 'C'); m.set(7, 5, 'l'); m.set(7, 6, 'l');
  m.set(38, 10, 'C'); m.set(38, 12, 'l'); m.set(38, 14, 'l');
  // wardens
  for (const [x, z] of [[8, 12], [31, 12], [6, 21], [33, 21]]) m.set(x, z, 'w');
  // ground loot
  for (const [x, z] of [[4, 10], [12, 15], [9, 23], [28, 10], [36, 15], [30, 23], [35, 23], [4, 22]]) m.set(x, z, 'l');
  // lamps
  for (const [x, z] of [[19, 11], [20, 15], [5, 12], [8, 21], [30, 12], [33, 21], [19, 22]]) m.set(x, z, 'L');
  return m;
}
function mansionUpper() {
  const m = new G(40, 32);
  m.fill(17, 11, 6, 8, ' '); m.fill(15, 17, 2, 3, ' ');                 // open air over the foyer and the stairwell (railings, no walls)
  m.fill(15, 9, 10, 2, 'F'); m.fill(17, 19, 8, 2, 'F');                 // balcony ring: north / south rows (the stairwell owns x15-16, z17-19)
  m.fill(15, 11, 2, 6, 'F'); m.fill(23, 11, 2, 8, 'F');                 // west column (down to the stair landing at z16) / east column
  m.fill(3, 9, 10, 8, '.'); m.fill(13, 11, 2, 2, '.');                  // west bedrooms
  m.fill(27, 9, 10, 8, '.'); m.fill(25, 11, 2, 2, '.');                 // east gallery
  m.fill(31, 4, 3, 4, '.'); m.set(32, 8, 'D');                          // hidden attic room
  m.set(31, 4, 'C'); m.set(33, 4, 'C'); m.set(32, 5, 'l'); m.set(32, 6, 'l');
  for (const [x, z] of [[4, 10], [11, 15], [5, 15], [28, 10], [35, 15], [30, 14], [19, 9], [23, 19]]) m.set(x, z, 'l');
  for (const [x, z] of [[7, 12], [32, 12], [16, 10], [23, 10], [23, 19]]) m.set(x, z, 'L');
  return m;
}
export const MANSION = {
  id: 'mansion', style: 'mansion', H: 3.6, tallH: 7.4, slab: 0.2, map: mansionGround().rows(), upper: mansionUpper().rows(), title: 'Dark Oak Manor',
  entry: { x: 19, z: 24, fx: 0, fz: -1 },
  // grand staircase: bottom edge at the south end of tile row 19, climbing north over 3 tiles (12 steps of 0.5 m) onto the balcony landing (tile row 16)
  stairs: [{ x: 15, z: 17, w: 2, len: 3, dir: 'n', rise: 3.8 }],
  landing: { x: 15, z: 16 },
};

// ------------------------------------------------------------------------------------------------ Ballroom (closet variant 1) and Warehouse (variant 2)
function ballroom() {
  const m = new G(32, 24);
  m.fill(1, 1, 30, 20, '.'); m.fill(13, 1, 6, 20, ',');
  m.set(15, 21, 'X');
  for (let x = 5; x <= 27; x += 6) for (let z = 4; z <= 16; z += 6) m.set(x, z, 'P');
  for (const [x, z] of [[2, 2], [29, 2], [2, 19], [29, 19]]) m.set(x, z, 'C');
  for (const [x, z] of [[3, 8], [28, 8], [3, 14], [28, 14], [15, 2], [16, 2], [8, 19], [23, 19]]) m.set(x, z, 'l');
  for (const [x, z] of [[8, 7], [23, 7], [8, 13], [23, 13], [15, 10], [15, 17], [8, 3], [23, 3]]) m.set(x, z, 'L');
  return m;
}
export const BALLROOM = { id: 'ballroom', style: 'ballroom', H: 7.2, tallH: 7.2, map: ballroom().rows(), title: 'The Cupboard', entry: { x: 15, z: 21, fx: 0, fz: -1 } };
function warehouse() {
  const m = new G(36, 26);
  m.fill(1, 1, 34, 22, '.');
  m.set(17, 23, 'X');
  for (let x = 5; x <= 29; x += 4) { for (let z = 3; z <= 12; z++) m.set(x, z, '$'); for (let z = 15; z <= 20; z++) m.set(x, z, '$'); }
  for (const [x, z] of [[3, 2], [33, 2], [3, 21], [33, 21], [11, 13], [23, 13]]) m.set(x, z, 'C');
  for (const [x, z] of [[3, 7], [7, 2], [15, 2], [19, 12], [27, 2], [33, 8], [13, 20], [21, 20], [31, 18], [3, 17]]) m.set(x, z, 'l');
  for (const [x, z] of [[7, 8], [15, 8], [23, 8], [31, 8], [7, 18], [15, 18], [23, 18], [17, 13]]) m.set(x, z, 'L');
  return m;
}
export const WAREHOUSE = { id: 'warehouse', style: 'warehouse', H: 8.0, tallH: 8.0, map: warehouse().rows(), title: 'The Back Room', entry: { x: 17, z: 23, fx: 0, fz: -1 } };

export const POCKET_SPECS = { outbreak: OUTBREAK, mansion: MANSION, ballroom: BALLROOM, warehouse: WAREHOUSE };

// ------------------------------------------------------------------------------------------------ analysis (used by the builder and the tests)
export function tilesOf(rows, chars) {
  const out = [];
  for (let z = 0; z < rows.length; z++) for (let x = 0; x < rows[z].length; x++) if (chars.includes(rows[z][x])) out.push({ x, z, ch: rows[z][x] });
  return out;
}
/** BFS over walkable tiles from (x, z). Returns a Set of "x,z" keys. Blocking props do not conduct. */
export function reachTiles(rows, x0, z0, walk = WALK) {
  const seen = new Set();
  const q = [[x0, z0]];
  seen.add(x0 + ',' + z0);
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const ch = rows[nz]?.[nx];
      if (!ch || !walk.has(ch) || seen.has(nx + ',' + nz)) continue;
      seen.add(nx + ',' + nz); q.push([nx, nz]);
    }
  }
  return seen;
}
/** every special of a spec reachable from the entry (upper floor from the stair landing) */
export function analyzeSpec(spec) {
  const errs = [];
  const rows = spec.map, W = rows[0].length;
  if (!rows.every((r) => r.length === W)) errs.push('ragged map');
  const e = spec.entry;
  if (rows[e.z]?.[e.x] !== 'X') errs.push('entry tile is not X');
  const seen = reachTiles(rows, e.x, e.z);
  const adj = (t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen.has(t.x + dx + ',' + (t.z + dz)));
  const specials = tilesOf(rows, 'zwpahlLTBCD');
  for (const t of specials) if (!(seen.has(t.x + ',' + t.z) || (SOLID_PROPS.has(t.ch) && adj(t)))) errs.push(`unreachable ${t.ch} at ${t.x},${t.z}`);
  // the door faces a walkable tile
  if (!seen.has(e.x + e.fx + ',' + (e.z + e.fz))) errs.push('closet door faces a wall');
  let upperSeen = null;
  if (spec.upper) {
    const u = spec.upper, L = spec.landing;
    if (!u.every((r) => r.length === W)) errs.push('ragged upper map');
    upperSeen = reachTiles(u, L.x, L.z);
    const ups = tilesOf(u, 'lLCDh');
    for (const t of ups) if (!(upperSeen.has(t.x + ',' + t.z) || (SOLID_PROPS.has(t.ch) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => upperSeen.has(t.x + dx + ',' + (t.z + dz)))))) errs.push(`unreachable upper ${t.ch} at ${t.x},${t.z}`);
    // stair footprint is void upstairs and the landing floor exists
    for (const s of spec.stairs || []) for (let i = 0; i < s.len; i++) for (let k = 0; k < s.w; k++) if (u[s.z + i]?.[s.x + k] !== ' ' && u[s.z + i]?.[s.x + k] !== '#') errs.push('stair footprint not open upstairs');
    // stair base (south end) is reachable on the ground floor
    const s0 = (spec.stairs || [])[0];
    if (s0 && !seen.has(s0.x + ',' + (s0.z + s0.len))) errs.push('stair base unreachable');
  }
  return { errs, seen, upperSeen, specials: specials.length };
}
export const countChars = (rows, chars) => [].concat(rows).reduce((n, r) => n + [...r].filter((c) => chars.includes(c)).length, 0);
