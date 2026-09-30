// HOMEWORLD 2 core (wave 4, module 'homeworld2'; docs/wave4/homeworld2.md). PURE rules: no three / DOM / game access, node-tested by
// tools/harness/homeworld2.test.mjs.
//   * a FINE build grid (1.5 m cells, two per 3 m homeworld cell) for factory machines, belts, poles, room pieces and trees
//   * FACTORY (Satisfactory-lite): seeded resource nodes -> miners -> belts (1 item per cell, 60 items/min) -> smelters / assemblers -> uplink
//     (= the export dock that pays into the EXISTING homeworld storage: credits, components, circuit shards), power poles + generators
//   * offline catch-up (capped, reduced rate) measured from the very same belt simulation, so live and offline income cannot drift apart
//   * ROOMS (floor / wall / window / door / roof + furniture) with an enclosure detector, TREES (real-time growth, fruit, wood)
//   * WAVES (base value -> wave power, first-wave gate, interval, shield), GHOST bases (snapshots, share codes, generated rivals, vault loot)
// State (host profile.homeworld2, layout mirrored to clients by ops):  { v, seed, n, p:[{i,t,x,z,r,l,...}], ms, wv, st, pvp, g }
import { RNG } from '../core/rng.js';
import * as H from './homeworld_core.js';
import { towerStats } from './defense_core.js';

// ---------------------------------------------------------------------------------------------- grid
export const FC = 1.5;                       // metres per fine cell
export const FMIN = -30, FMAX = 30;          // fine cell index range [-30, 30) = the 90 m build square of the homeworld
export const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const MAX_PIECES = 480;
export const MAX_LV = 3;
export const BELT_SPEED = 1.0;               // cells per second -> exactly 1 item per second = 60 items per minute per belt
export const STEP = 0.1;                     // fixed simulation step (s)
export const POLE_R = 7.5, POLE_LINK = 12, SHORE_R = 30;   // metres: machine -> pole, pole -> pole, pole -> pad shore power
export const OFFLINE = { maxSec: 8 * 3600, eff: 0.1, treeEff: 0.5 };   // offline catch-up: 8 h max, 10 % of the live rate (trees 50 %); the storage caps bound it further
export const MK_SPEED = [1, 1.5, 2.2];       // machine level -> speed multiplier
export const MK_POWER = [1, 1.4, 2.0];       // machine level -> power draw multiplier
export const MK_COST = [1, 1.9, 3.6];        // machine level -> cost multiplier (total, not per upgrade)
export const PURITY = [0.5, 1, 1.6];         // node purity -> miner multiplier
export const CELL_KEY = (x, z) => (x + 64) * 256 + (z + 64);
export const fcx = (x) => x * FC, fcz = (z) => z * FC;

// ---------------------------------------------------------------------------------------------- items
export const IT = { scrap: 1, ore: 2, crystal: 3, plate: 4, ingot: 5, part: 6, circuit: 7 };
export const IT_NAME = ['', 'Scrap', 'Iron Ore', 'Data Crystal', 'Scrap Plate', 'Ingot', 'Assembled Part', 'Circuit Core'];
export const IT_COLOR = [0, 0x8a8f96, 0xb0683a, 0x7fe8ff, 0xc9ced4, 0xffb060, 0x5fe08a, 0xd79bff];
/** what one item is worth at the export dock (credits). Tuned so a developed factory is a nice passive income, never a run replacement. */
export const IT_VALUE = [0, 0.06, 0.1, 0.55, 0.26, 0.4, 1.0, 1.4];
export const RECIPES = [
  { m: 'assembler', in: { [IT.ingot]: 2, [IT.crystal]: 1 }, out: IT.circuit, time: 6 },
  { m: 'assembler', in: { [IT.plate]: 1, [IT.ingot]: 1 }, out: IT.part, time: 4 },
  { m: 'smelter', in: { [IT.scrap]: 2 }, out: IT.plate, time: 3 },
  { m: 'smelter', in: { [IT.ore]: 2 }, out: IT.ingot, time: 4 },
];
const RECIPES_OF = { smelter: RECIPES.filter((r) => r.m === 'smelter'), assembler: RECIPES.filter((r) => r.m === 'assembler') };
const ACCEPT = { smelter: new Set([IT.scrap, IT.ore]), assembler: new Set([IT.plate, IT.ingot, IT.crystal]) };
export const MINER_RATE = 30;                // items per minute at Mk1 on a normal node
export const GEN = { supply: 12, burn: 10, buf: 4 };   // one scrap item = 10 s of 12 power at Mk1
export const UPLINK_RATE = 1.0;              // items per second the export dock takes (x Mk speed)
/** ECONOMY GOVERNOR: value (credit-equivalents) per minute one export dock can pay out at Mk1 / Mk2 / Mk3. Two docks max = 50 / min at the very top, whatever the belts carry. */
export const DOCK_VALUE = [12, 18, 26];
/** the dock packs 4 assembled parts into ONE Component (value 4 = H.VALUE.parts, so the credit-equivalent bookkeeping stays consistent) */
export const PART_PACK = 0.25;
export const CIRCUIT_SHARD_EVERY = 5;        // every 5th exported circuit also pays one Circuit Core shard (s2, worth 11)
/** what an item costs the dock's value budget: the credits it pays + its share of the shard bonus (a circuit is worth 1.4 + 11 / 5 = 3.6 in total) */
export const IT_DOCK = IT_VALUE.map((v, i) => (i === IT.circuit ? v + H.VALUE.s2 / CIRCUIT_SHARD_EVERY : v));

// ---------------------------------------------------------------------------------------------- piece table
// size [w, h] fine cells (rotation 1 / 3 swaps them), layer g = ground / f = floor / r = roof, cost { cr, parts } for lv 1, pw = power draw at Mk1
const P = (o) => o;
export const PT = {
  miner: P({ cat: 'fac', size: [2, 2], layer: 'g', max: 8, cost: { cr: 120, parts: 4 }, pw: 2, mk: 1, solid: 1, desc: 'Digs a resource node. 30 items/min on a normal node.' }),
  smelter: P({ cat: 'fac', size: [2, 2], layer: 'g', max: 4, cost: { cr: 160, parts: 6 }, pw: 4, mk: 1, solid: 1, desc: 'Scrap -> plate, iron ore -> ingot.' }),
  assembler: P({ cat: 'fac', size: [2, 2], layer: 'g', max: 4, cost: { cr: 240, parts: 8 }, pw: 6, mk: 1, solid: 1, desc: 'Plate + ingot -> assembled part. 2 ingot + crystal -> circuit core.' }),
  uplink: P({ cat: 'fac', size: [2, 2], layer: 'g', max: 2, cost: { cr: 140, parts: 5 }, pw: 2, mk: 1, solid: 1, desc: 'Export dock: pays credits, components (4 parts = 1) and circuit shards into the homeworld storage. Pays out at most 12 / 18 / 26 per minute.' }),
  generator: P({ cat: 'fac', size: [2, 2], layer: 'g', max: 4, cost: { cr: 110, parts: 4 }, pw: 0, mk: 1, solid: 1, desc: 'Burns scrap from a belt: 12 power per unit.' }),
  pole: P({ cat: 'fac', size: [1, 1], layer: 'g', max: 30, cost: { cr: 10, parts: 0 }, pw: 0, mk: 0, solid: 0, desc: 'Power pole: wires reach 12 m, machines within 7.5 m.' }),
  belt: P({ cat: 'fac', size: [1, 1], layer: 'g', max: 320, cost: { cr: 2, parts: 0 }, pw: 0, mk: 0, solid: 0, desc: 'Conveyor: 1 item per second. Drag to lay a line, R rotates.' }),
  splitter: P({ cat: 'fac', size: [1, 1], layer: 'g', max: 12, cost: { cr: 18, parts: 0 }, pw: 0, mk: 0, solid: 0, desc: 'Splits a belt three ways (front, left, right).' }),
  floor: P({ cat: 'str', size: [1, 1], layer: 'f', max: 220, cost: { cr: 4, parts: 0 }, pw: 0, mk: 0, solid: 0, desc: 'Floor tile.' }),
  wall: P({ cat: 'str', size: [1, 1], layer: 'g', max: 220, cost: { cr: 6, parts: 0 }, pw: 0, mk: 0, solid: 1, desc: 'Wall segment.' }),
  window: P({ cat: 'str', size: [1, 1], layer: 'g', max: 60, cost: { cr: 9, parts: 0 }, pw: 0, mk: 0, solid: 1, desc: 'Wall with a window.' }),
  door: P({ cat: 'str', size: [1, 1], layer: 'g', max: 16, cost: { cr: 16, parts: 0 }, pw: 0, mk: 0, solid: 0, desc: 'Doorway: closes a room, you walk through.' }),
  roof: P({ cat: 'str', size: [1, 1], layer: 'r', max: 220, cost: { cr: 4, parts: 0 }, pw: 0, mk: 0, solid: 0, desc: 'Roof tile.' }),
  crate: P({ cat: 'str', size: [1, 1], layer: 'g', max: 8, cost: { cr: 30, parts: 1 }, pw: 0, mk: 0, solid: 1, needFloor: 1, desc: 'Storage crate. In a closed room: storage +20 %.' }),
  bench: P({ cat: 'str', size: [2, 1], layer: 'g', max: 4, cost: { cr: 60, parts: 2 }, pw: 0, mk: 0, solid: 1, needFloor: 1, desc: 'Workbench. In a closed room: every machine +6 % speed.' }),
  bed: P({ cat: 'str', size: [2, 1], layer: 'g', max: 4, cost: { cr: 50, parts: 2 }, pw: 0, mk: 0, solid: 1, needFloor: 1, desc: 'Bed. In a closed, roofed room: slow passive Followers.' }),
  planter: P({ cat: 'str', size: [2, 1], layer: 'g', max: 4, cost: { cr: 40, parts: 1 }, pw: 0, mk: 0, solid: 1, needFloor: 1, desc: 'Planter. A closed, roofed room with one is a greenhouse: trees grow twice as fast.' }),
  tree: P({ cat: 'nat', size: [2, 2], layer: 'g', max: 24, cost: { cr: 45, parts: 0 }, pw: 0, mk: 0, solid: 1, desc: 'Sapling. Grows in real time, bears fruit, can be felled for wood.' }),
};
const NAMES = { miner: 'Miner', smelter: 'Smelter', assembler: 'Assembler', uplink: 'Export Dock', generator: 'Scrap Generator', pole: 'Power Pole', belt: 'Conveyor Belt', splitter: 'Splitter',
  floor: 'Floor Tile', wall: 'Room Wall', window: 'Window Wall', door: 'Doorway', roof: 'Roof Tile', crate: 'Storage Crate', bench: 'Workbench', bed: 'Bed', planter: 'Planter', tree: 'Sapling' };
for (const k of Object.keys(PT)) PT[k].name = NAMES[k];
export const TYPES = Object.keys(PT);                  // index = wire id
export const TIDX = Object.fromEntries(TYPES.map((k, i) => [k, i]));
export const CATS = [['fac', 'FACTORY'], ['str', 'ROOMS'], ['nat', 'GARDEN']];
export const isMachine = (t) => t === 'miner' || t === 'smelter' || t === 'assembler' || t === 'uplink' || t === 'generator';
export const isFac = (t) => PT[t]?.cat === 'fac';

/** footprint (fine cells) of a piece: rotation 1 / 3 swaps width and height */
export function dims(t, r) { const s = PT[t].size; return (r & 1) ? [s[1], s[0]] : [s[0], s[1]]; }
export function cellsOf(t, x, z, r = 0) { const [w, h] = dims(t, r), out = []; for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, z + j]); return out; }
/** centre of a piece in world metres */
export function centerOf(p) { const [w, h] = dims(p.t, p.r); return { x: (p.x + w / 2) * FC, z: (p.z + h / 2) * FC }; }
export const snapFine = (t, r, wx, wz) => { const [w, h] = dims(t, r); return { x: Math.round(wx / FC - w / 2), z: Math.round(wz / FC - h / 2) }; };

export function levelCost(t, lv = 1) {
  const c = PT[t].cost, m = PT[t].mk ? MK_COST[lv - 1] : 1;
  return { cr: Math.round(c.cr * m), parts: Math.ceil(c.parts * m) };
}
/** cost of upgrading lv -> lv + 1 (difference of the totals) */
export function upgradeCost(t, lv) { const a = levelCost(t, lv + 1), b = levelCost(t, lv); return { cr: a.cr - b.cr, parts: a.parts - b.parts }; }
export function spentOf(p) { let cr = 0, parts = 0; for (let l = 1; l <= (p.l || 1); l++) { const c = levelCost(p.t, l), pre = l > 1 ? levelCost(p.t, l - 1) : { cr: 0, parts: 0 }; cr += c.cr - pre.cr; parts += c.parts - pre.parts; } return { cr, parts }; }
export const sellOf = (p) => { const s = spentOf(p); return { cr: Math.floor(s.cr * 0.6), parts: Math.floor(s.parts * 0.6) }; };
export function repairCostOf(p) { const s = spentOf(p); return { cr: Math.max(1, Math.ceil(s.cr * 0.3)), parts: Math.ceil(s.parts * 0.3) }; }

// ---------------------------------------------------------------------------------------------- state
export function blank(seed = 1) {
  return {
    v: 1, seed: (seed >>> 0) || 1, n: 1, p: [], ms: 0,
    wv: { left: 0, n: 0, armed: 0, shield: 0, called: 0 },
    st: { built: 0, exported: 0, exportedCr: 0, waves: 0, repelled: 0, lost: 0, harvested: 0, ghostWins: 0, ghostRuns: 0 },
    pvp: 0, g: { raided: {}, mine: null, imported: [] },
  };
}
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** validate / repair a saved state (corrupt or oversized data never bricks the homeworld). Returns a NEW clean object. */
export function sanitize(raw, hw = null) {
  const s = blank(num(raw?.seed, 0) || 1);
  if (!raw || typeof raw !== 'object') return s;
  s.ms = Math.max(0, Math.floor(num(raw.ms, 0)));
  s.pvp = raw.pvp ? 1 : 0;
  for (const k of Object.keys(s.st)) s.st[k] = Math.max(0, num(raw.st?.[k], 0));
  const w = raw.wv || {};
  s.wv = { left: Math.max(0, Math.min(3600, num(w.left, 0))), n: Math.max(0, Math.floor(num(w.n, 0))), armed: w.armed ? 1 : 0, shield: Math.max(0, Math.floor(num(w.shield, 0))), called: 0 };
  s.g.raided = {};
  for (const [k, v] of Object.entries(raw.g?.raided || {}).slice(0, 40)) s.g.raided[String(k).slice(0, 24)] = Math.max(0, Math.floor(num(v, 0)));
  s.g.mine = sanitizeGhost(raw.g?.mine);
  s.g.imported = (Array.isArray(raw.g?.imported) ? raw.g.imported : []).slice(0, 8).map((x) => sanitizeGhost(x)).filter(Boolean);
  const seen = new Set(), occ = new Map(), counts = {};
  const nodes = hw ? null : null; void nodes;
  let maxId = 0;
  for (const p of Array.isArray(raw.p) ? raw.p : []) {
    const d = PT[p?.t];
    if (!d || s.p.length >= MAX_PIECES) continue;
    const i = Math.floor(num(p.i, 0)), x = Math.floor(num(p.x, NaN)), z = Math.floor(num(p.z, NaN)), r = ((Math.floor(num(p.r, 0)) % 4) + 4) % 4;
    if (i <= 0 || seen.has(i) || !Number.isFinite(x) || !Number.isFinite(z)) continue;
    if ((counts[p.t] || 0) >= d.max) continue;
    const cells = cellsOf(p.t, x, z, r);
    if (cells.some(([cx, cz]) => cx < FMIN || cz < FMIN || cx >= FMAX || cz >= FMAX)) continue;
    if (cells.some(([cx, cz]) => Math.hypot((cx + 0.5) * FC, (cz + 0.5) * FC) < H.PAD_CLEAR)) continue;
    if (cells.some(([cx, cz]) => occ.has(CELL_KEY(cx, cz) * 4 + LAYER_IDX[d.layer]))) continue;
    for (const [cx, cz] of cells) occ.set(CELL_KEY(cx, cz) * 4 + LAYER_IDX[d.layer], i);
    seen.add(i); counts[p.t] = (counts[p.t] || 0) + 1; maxId = Math.max(maxId, i);
    const np = { i, t: p.t, x, z, r };
    if (d.mk) np.l = Math.max(1, Math.min(MAX_LV, Math.floor(num(p.l, 1)))); else np.l = 1;
    if (p.br && isMachine(p.t)) np.br = 1;
    if (p.t === 'tree') { np.a = Math.max(0, num(p.a, 0)); np.f = Math.max(0, Math.min(TREE.maxFruit, Math.floor(num(p.f, 0)))); np.ft = Math.max(0, num(p.ft, 0)); }
    s.p.push(np);
  }
  s.n = Math.max(maxId + 1, Math.floor(num(raw.n, 1)));
  return s;
}
const LAYER_IDX = { g: 0, f: 1, r: 2 };
export const pieceById = (s, id) => s.p.find((p) => p.i === id) || null;
export const countOf = (s, t) => s.p.reduce((n, p) => n + (p.t === t ? 1 : 0), 0);

// ---------------------------------------------------------------------------------------------- resource nodes (seeded, identical on every peer)
export const NODE_RES = { scrap: IT.scrap, ore: IT.ore, crystal: IT.crystal };
/** 12 deposits on the plateau: 6 scrap, 4 ore, 2 crystal. Aligned to the 3 m grid (even fine coordinates), outside the pad, spread apart. */
const NODE_MEMO = new Map();
export function genNodes(seed) {
  const key = seed >>> 0;
  if (NODE_MEMO.has(key)) return NODE_MEMO.get(key);
  const out = genNodesRaw(key);
  if (NODE_MEMO.size > 8) NODE_MEMO.clear();
  NODE_MEMO.set(key, out);
  return out;
}
function genNodesRaw(seed) {
  const rng = new RNG(((seed >>> 0) ^ 0x2b7e1516) >>> 0), out = [];
  const plan = [['scrap', 6, 21, 34], ['ore', 4, 24, 38], ['crystal', 2, 36, 43]];
  let id = 1;
  for (const [res, n, r0, r1] of plan) {
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 200; tries++) {
        const a = rng.float(0, Math.PI * 2), r = rng.float(r0, r1);
        let x = Math.round(Math.cos(a) * r / (FC * 2)) * 2, z = Math.round(Math.sin(a) * r / (FC * 2)) * 2;
        x = Math.max(FMIN + 2, Math.min(FMAX - 4, x)); z = Math.max(FMIN + 2, Math.min(FMAX - 4, z));
        const cx = (x + 1) * FC, cz = (z + 1) * FC;
        if (Math.hypot(cx, cz) < H.PAD_CLEAR + 4 || Math.hypot(cx, cz) > 46) continue;
        if (out.some((o) => Math.hypot((o.x - x) * FC, (o.z - z) * FC) < 12)) continue;
        const pur = res === 'crystal' ? (rng.chance(0.4) ? 1 : 0) : (rng.chance(0.25) ? 2 : rng.chance(0.5) ? 1 : 0);
        out.push({ id: id++, res, x, z, pur });
        break;
      }
    }
  }
  return out;
}
export function nodeAt(nodes, x, z) { return nodes.find((n) => n.x === x && n.z === z) || null; }
function nodeCells(nodes) { const m = new Map(); for (const n of nodes) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) m.set(CELL_KEY(n.x + i, n.z + j), n); return m; }

// ---------------------------------------------------------------------------------------------- placement
/** occupancy of a layout: Map key*4+layer -> piece id */
export function occupancy(s, ignoreId = 0) {
  const m = new Map();
  for (const p of s.p) { if (p.i === ignoreId) continue; const L = LAYER_IDX[PT[p.t].layer]; for (const [x, z] of cellsOf(p.t, p.x, p.z, p.r)) m.set(CELL_KEY(x, z) * 4 + L, p.i); }
  return m;
}
/** `hw` = homeworld_core state (its 3 m buildings block the fine cells they cover). */
export function placementCheck(s, hw, type, x, z, r = 0, opts = {}) {
  const d = PT[type];
  if (!d) return { ok: false, why: 'Unknown building.' };
  if (!opts.ignoreId) {
    if (s.p.length >= MAX_PIECES) return { ok: false, why: 'Homeworld is full.' };
    if (countOf(s, type) >= d.max) return { ok: false, why: `Limit reached (${d.max}).` };
  }
  const cells = cellsOf(type, x, z, r);
  const nodes = opts.nodes || genNodes(s.seed), ncells = nodeCells(nodes);
  for (const [cx, cz] of cells) {
    if (cx < FMIN || cz < FMIN || cx >= FMAX || cz >= FMAX) return { ok: false, why: 'Out of the build zone (or on the landing pad).' };
    if (Math.hypot((cx + 0.5) * FC, (cz + 0.5) * FC) < H.PAD_CLEAR) return { ok: false, why: 'Out of the build zone (or on the landing pad).' };
  }
  if (hw) {
    const occ = H.occupied(hw);
    for (const [cx, cz] of cells) if (occ.has(H.cellsOf(1, Math.floor(cx / 2), Math.floor(cz / 2))[0])) return { ok: false, why: 'Blocked by another building.' };
  }
  if (type === 'miner') {
    const n = nodeAt(nodes, x, z);
    if (!n) return { ok: false, why: 'Miners must sit on a resource node.' };
  } else if (d.layer === 'g' || d.layer === 'f') {
    for (const [cx, cz] of cells) if (ncells.has(CELL_KEY(cx, cz))) return { ok: false, why: 'Blocked by a resource node.' };
  }
  const occ = occupancy(s, opts.ignoreId || 0), L = LAYER_IDX[d.layer];
  for (const [cx, cz] of cells) if (occ.has(CELL_KEY(cx, cz) * 4 + L)) return { ok: false, why: 'Blocked by another piece.' };
  if (d.needFloor) for (const [cx, cz] of cells) if (!occ.has(CELL_KEY(cx, cz) * 4 + 1)) return { ok: false, why: 'Needs a floor.' };
  return { ok: true };
}
const payable = (hw, wallet, cost) => {
  if (num(wallet.cr) < (cost.cr || 0)) return 'Not enough credits.';
  if ((cost.parts || 0) > (hw.s.parts || 0) + 1e-9) return 'Not enough components.';
  return '';
};
const pay = (hw, wallet, cost) => { wallet.cr -= cost.cr || 0; hw.s.parts -= cost.parts || 0; };
export function tryBuild(s, hw, wallet, type, x, z, r = 0) {
  const pc = placementCheck(s, hw, type, x, z, r);
  if (!pc.ok) return pc;
  const cost = levelCost(type, 1), why = payable(hw, wallet, cost);
  if (why) return { ok: false, why, cost };
  pay(hw, wallet, cost);
  const p = { i: s.n, t: type, x, z, r: ((r % 4) + 4) % 4, l: 1 };
  if (type === 'tree') { p.a = 0; p.f = 0; p.ft = 0; }
  s.p.push(p); s.n += 1; s.st.built += 1;
  return { ok: true, p, cost };
}
export function tryUpgrade(s, hw, wallet, id) {
  const p = pieceById(s, id);
  if (!p) return { ok: false, why: 'No such building.' };
  if (!PT[p.t].mk) return { ok: false, why: 'Already at the maximum level.' };
  if (p.br) return { ok: false, why: 'Repair it first.' };
  if (p.l >= MAX_LV) return { ok: false, why: 'Already at the maximum level.' };
  const cost = upgradeCost(p.t, p.l), why = payable(hw, wallet, cost);
  if (why) return { ok: false, why, cost };
  pay(hw, wallet, cost); p.l += 1;
  return { ok: true, p, cost };
}
export function trySell(s, hw, wallet, id) {
  const p = pieceById(s, id);
  if (!p) return { ok: false, why: 'No such building.' };
  const v = sellOf(p);
  s.p.splice(s.p.indexOf(p), 1);
  wallet.cr += v.cr; hw.s.parts = Math.min(H.capOf(hw, 'parts'), hw.s.parts + v.parts);
  return { ok: true, refund: v, p };
}
export function tryRotate(s, hw, id) {
  const p = pieceById(s, id);
  if (!p) return { ok: false, why: 'No such building.' };
  const r = (p.r + 1) & 3;
  const pc = placementCheck(s, hw, p.t, p.x, p.z, r, { ignoreId: id });
  if (!pc.ok) return pc;
  p.r = r;
  return { ok: true, p };
}
export function tryRepair(s, hw, wallet, id) {
  const list = id === 'all' ? s.p.filter((p) => p.br) : [pieceById(s, id)].filter((p) => p && p.br);
  if (!list.length) return { ok: false, why: 'Nothing to repair.' };
  let done = 0, spent = { cr: 0, parts: 0 };
  for (const p of list) {
    const c = repairCostOf(p), why = payable(hw, wallet, c);
    if (why) { if (id !== 'all') return { ok: false, why, cost: c }; continue; }
    pay(hw, wallet, c); spent.cr += c.cr; spent.parts += c.parts; delete p.br; done++;
  }
  return done ? { ok: true, n: done, cost: spent } : { ok: false, why: 'Not enough credits.' };
}

// ---------------------------------------------------------------------------------------------- FACTORY SIMULATION
const OPP = [2, 3, 0, 1];
/** cells next to the output edge of a machine (2 cells for a 2x2), in fine-cell coordinates */
export function frontCells(p) {
  const [w, h] = dims(p.t, p.r), d = DIR[p.r], out = [];
  if (d[0] === 1) for (let j = 0; j < h; j++) out.push([p.x + w, p.z + j]);
  else if (d[0] === -1) for (let j = 0; j < h; j++) out.push([p.x - 1, p.z + j]);
  else if (d[1] === 1) for (let i = 0; i < w; i++) out.push([p.x + i, p.z + h]);
  else for (let i = 0; i < w; i++) out.push([p.x + i, p.z - 1]);
  return out;
}
/**
 * FactorySim: the belt network + machines + power of a layout. Deterministic (no RNG). `room` = remaining store capacity per export target
 * ({ cr, parts, s2 }); the export dock refuses items whose target is full, so belts back up instead of wasting output (the HUD says STORAGE FULL).
 * `shore` = free surplus power of the pad grid (homeworld power supply - demand, >= 0) available to the poles near the pad.
 */
export class FactorySim {
  constructor(s, { shore = 4, nodes = null, room = null, speedBonus = 0 } = {}) {
    this.shore = shore; this.speedBonus = speedBonus;
    this.room = room || { cr: 1e9, parts: 1e9, s2: 1e9 };
    this.nodes = nodes || genNodes(s.seed);
    this.time = 0; this.acc = 0;
    this.gain = { cr: 0, parts: 0, s2: 0 };
    this.sold = new Array(8).fill(0); this.made = new Array(8).fill(0);
    this.circuits = 0;
    this.build(s);
  }
  build(s) {
    const ps = s.p.filter((p) => isFac(p.t)).sort((a, b) => a.i - b.i);
    this.ps = ps; this.n = ps.length;
    this.cell = new Map();                       // fine cell key -> index into ps
    this.st = ps.map((p) => ({ p, item: 0, prog: 0, rr: 0, buf: null, out: [], busy: null, tok: 0, vt: 0, fuel: 0, fuelBuf: 0, state: 0, mp: 0, net: -1, spd: 0 }));
    ps.forEach((p, k) => { for (const [x, z] of cellsOf(p.t, p.x, p.z, p.r)) this.cell.set(CELL_KEY(x, z), k); });
    const ncells = nodeCells(this.nodes);
    this.link = ps.map(() => null);
    ps.forEach((p, k) => {
      const q = this.st[k];
      if (p.t === 'belt' || p.t === 'splitter') this.link[k] = p.t === 'belt' ? [this.at(p.x + DIR[p.r][0], p.z + DIR[p.r][1])] : [0, 1, 3].map((o) => this.at(p.x + DIR[(p.r + o) & 3][0], p.z + DIR[(p.r + o) & 3][1]));
      else if (isMachine(p.t)) {
        q.buf = new Array(8).fill(0);
        q.front = frontCells(p).map(([x, z]) => this.at(x, z));
        if (p.t === 'miner') { const n = ncells.get(CELL_KEY(p.x, p.z)); q.node = n && n.x === p.x && n.z === p.z ? n : null; }
      }
    });
    // processing order: closest to the destination first (so a full belt advances in one step), loops / dead ends last
    const depth = new Array(this.n).fill(-1), visiting = new Set();
    const dep = (k) => {
      if (depth[k] >= 0) return depth[k];
      if (visiting.has(k)) return 1e6;
      const q = this.st[k], t = q.p.t;
      if (t !== 'belt' && t !== 'splitter') return (depth[k] = 0);
      visiting.add(k);
      let best = 1e6;
      for (const nx of this.link[k]) if (nx >= 0) { const d = dep(nx); if (d < best) best = d; }
      visiting.delete(k);
      return (depth[k] = best >= 1e6 ? 1e5 : best + 1);
    };
    for (let k = 0; k < this.n; k++) dep(k);
    this.belts = []; this.machines = [];
    for (let k = 0; k < this.n; k++) (isMachine(ps[k].t) ? this.machines : this.belts).push(k);
    this.belts.sort((a, b) => depth[a] - depth[b] || a - b);
    this.buildPower(s);
  }
  at(x, z) { const k = this.cell.get(CELL_KEY(x, z)); return k === undefined ? -1 : k; }
  // ---- power: poles link within POLE_LINK, machines attach to poles within POLE_R, a pole within SHORE_R of the pad joins the shore grid
  buildPower(s) {
    const poles = s.p.filter((p) => p.t === 'pole'), parent = poles.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const pc = poles.map((p) => centerOf(p));
    for (let a = 0; a < poles.length; a++) for (let b = a + 1; b < poles.length; b++) if (Math.hypot(pc[a].x - pc[b].x, pc[a].z - pc[b].z) <= POLE_LINK) parent[find(a)] = find(b);
    const nets = new Map();
    const netOf = (root) => { if (!nets.has(root)) nets.set(root, { id: nets.size, shore: false, supply: 0, demand: 0, ratio: 1, machines: [] }); return nets.get(root); };
    poles.forEach((p, i) => { const n = netOf(find(i)); if (Math.hypot(pc[i].x, pc[i].z) <= SHORE_R) n.shore = true; });
    this.nets = nets;
    for (const k of this.machines) {
      const q = this.st[k], c = centerOf(q.p);
      let best = -1, bd = POLE_R + 1e-6;
      poles.forEach((_, i) => { const d = Math.hypot(pc[i].x - c.x, pc[i].z - c.z); if (d < bd) { bd = d; best = i; } });
      q.net = best < 0 ? -1 : netOf(find(best)).id;
    }
    this.netList = [...nets.values()];
    for (const n of this.netList) n.machines = [];
    for (const k of this.machines) { const q = this.st[k]; if (q.net >= 0) this.netList[q.net].machines.push(k); }
    this.updatePower();
  }
  updatePower() {
    let shoreDemand = 0;
    for (const n of this.netList) {
      let supply = 0, demand = 0;
      for (const k of n.machines) {
        const q = this.st[k], p = q.p;
        if (p.br) continue;
        if (p.t === 'generator') { if (q.fuel > 0) supply += GEN.supply * MK_SPEED[p.l - 1]; }
        else demand += PT[p.t].pw * MK_POWER[p.l - 1];
      }
      n.supply = supply; n.demand = demand;
      if (n.shore) shoreDemand += demand;
    }
    // the pad's shore surplus is ONE budget shared by every shore-connected network (split by demand), never granted once per network
    for (const n of this.netList) {
      if (n.shore && shoreDemand > 1e-9) n.supply += this.shore * n.demand / shoreDemand;
      n.ratio = n.demand <= 1e-9 ? 1 : Math.min(1, n.supply / n.demand);
    }
  }
  /** machine state code for the lamps: 0 idle / no work, 1 running, 2 blocked (output full / store full), 3 no power, 4 broken, 5 no node */
  // ---- item transfer
  accepts(k, item, from) {
    if (k < 0) return false;
    const q = this.st[k], p = q.p;
    if (p.t === 'belt') { if (q.item) return false; const d = DIR[p.r]; return !this.cellOf(from, p.x + d[0], p.z + d[1]); }   // a belt never takes items from what it points at
    if (p.t === 'splitter') return !q.item;
    if (p.br) return false;
    if (p.t === 'generator') return item === IT.scrap && q.fuelBuf < GEN.buf;
    if (p.t === 'uplink') return this.uplinkAccepts(q, item);
    if (p.t === 'smelter' || p.t === 'assembler') return ACCEPT[p.t].has(item) && q.buf[item] < 6;
    return false;
  }
  cellOf(from, x, z) { const p = this.st[from].p; return cellsOf(p.t, p.x, p.z, p.r).some(([cx, cz]) => cx === x && cz === z); }
  uplinkAccepts(q, item) {
    if (q.tok < 1 || q.vt < IT_DOCK[item]) return false;
    if (item === IT.part) return this.room.parts >= PART_PACK || this.room.cr >= IT_VALUE[IT.part];
    return this.room.cr >= IT_VALUE[item];
  }
  deposit(k, item, from) {
    const q = this.st[k], p = q.p;
    if (p.t === 'belt' || p.t === 'splitter') { q.item = item; q.prog = 0; return; }
    if (p.t === 'generator') { q.fuelBuf++; return; }
    if (p.t === 'uplink') {
      q.tok -= 1; q.vt -= IT_DOCK[item]; this.sold[item]++;
      if (item === IT.part && this.room.parts >= PART_PACK) { this.gain.parts += PART_PACK; this.room.parts -= PART_PACK; }
      else { const v = IT_VALUE[item]; this.gain.cr += v; this.room.cr -= v; }
      if (item === IT.circuit && ++this.circuits % CIRCUIT_SHARD_EVERY === 0 && this.room.s2 >= 1) { this.gain.s2 += 1; this.room.s2 -= 1; }
      return;
    }
    q.buf[item]++;
    void from;
  }
  push(k, item) {   // machine output -> the first accepting front cell (alternating)
    const q = this.st[k], fr = q.front;
    for (let i = 0; i < fr.length; i++) {
      const t = fr[(q.rr + i) % fr.length];
      if (t < 0) continue;
      if (this.accepts(t, item, k)) { this.deposit(t, item, k); q.rr = (q.rr + i + 1) % fr.length; return true; }
    }
    return false;
  }
  // ---- stepping
  step(dt = STEP) {
    this.time += dt;
    this.updatePower();
    const spdBonus = 1 + this.speedBonus;
    // belts / splitters first (downstream first), then the machines: a machine that emits finds its first belt already emptied this tick
    const v = BELT_SPEED * dt;
    for (const k of this.belts) {
      const q = this.st[k];
      if (!q.item) continue;
      q.prog = Math.min(1 + v, q.prog + v);
      if (q.prog < 1 - 1e-9) continue;
      const outs = this.link[k];
      if (q.p.t === 'belt') {
        const t = outs[0];
        if (t >= 0 && this.accepts(t, q.item, k)) { const it = q.item; q.item = 0; const carry = q.prog - 1; this.deposit(t, it, k); if (this.st[t].p.t === 'belt' || this.st[t].p.t === 'splitter') this.st[t].prog = Math.min(carry, v); }
        else q.prog = 1;
      } else {
        for (let i = 0; i < 3; i++) {
          const t = outs[(q.rr + i) % 3];
          if (t >= 0 && this.accepts(t, q.item, k)) { const it = q.item; q.item = 0; q.rr = (q.rr + i + 1) % 3; this.deposit(t, it, k); break; }
        }
        if (q.item) q.prog = 1;
      }
    }
      // machines
    for (const k of this.machines) {
      const q = this.st[k], p = q.p;
      if (p.t === 'uplink') { q.tok = Math.min(3, q.tok + UPLINK_RATE * MK_SPEED[p.l - 1] * dt); q.vt = Math.min(6, q.vt + DOCK_VALUE[p.l - 1] / 60 * dt); }
      if (p.br) { q.state = 4; continue; }
      const net = q.net >= 0 ? this.netList[q.net] : null, ratio = net ? net.ratio : 0;
      q.spd = MK_SPEED[p.l - 1] * ratio * spdBonus;
      if (p.t === 'generator') {
        if (q.fuel <= 0 && q.fuelBuf > 0) { q.fuelBuf--; q.fuel = GEN.burn / MK_SPEED[p.l - 1] * 1.0; }
        if (q.fuel > 0) q.fuel -= dt;
        q.state = q.fuel > 0 ? 1 : 0;
        continue;
      }
      if (p.t === 'uplink') { q.state = ratio <= 0 ? 3 : 1; continue; }
      // flush the output buffer first
      while (q.out.length && this.push(k, q.out[0])) q.out.shift();
      if (ratio <= 1e-9) { q.state = net ? 3 : 3; continue; }
      if (p.t === 'miner') {
        if (!q.node) { q.state = 5; continue; }
        if (q.out.length >= 3) { q.state = 2; continue; }
        q.mp += MINER_RATE * PURITY[q.node.pur] * q.spd * dt / 60;
        if (q.mp >= 1) { q.mp -= 1; q.out.push(NODE_RES[q.node.res]); this.made[NODE_RES[q.node.res]]++; }
        q.state = 1; continue;
      }
      // smelter / assembler
      if (q.busy) {
        q.busy.t += q.spd * dt;
        if (q.busy.t >= q.busy.r.time) { if (q.out.length < 4) { q.out.push(q.busy.r.out); this.made[q.busy.r.out]++; q.busy = null; } else { q.state = 2; continue; } }
        else { q.state = 1; continue; }
      }
      if (!q.busy) {
        for (const r of RECIPES_OF[p.t]) {
          let ok = true; for (const [it, n] of Object.entries(r.in)) if (q.buf[it] < n) { ok = false; break; }
          if (ok) { for (const [it, n] of Object.entries(r.in)) q.buf[it] -= n; q.busy = { r, t: 0 }; q.state = 1; break; }
        }
        if (!q.busy) q.state = q.out.length ? 2 : 0;
      }
    }
  }
  run(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) this.step(STEP); }
  /** flush the accumulated gains (host applies them to storage) */
  takeGain() { const g = this.gain; this.gain = { cr: 0, parts: 0, s2: 0 }; return g; }
  /** power summary over the whole layout */
  powerInfo() {
    let supply = 0, demand = 0, dead = 0;
    for (const n of this.netList) { supply += n.supply; demand += n.demand; }
    for (const k of this.machines) if (this.st[k].net < 0 && !this.st[k].p.br && this.st[k].p.t !== 'generator') dead++;
    return { supply, demand, ratio: demand <= 1e-9 ? 1 : Math.min(1, supply / demand), unpowered: dead, nets: this.netList.length };
  }
}
/** steady-state income per MINUTE of a layout, measured by running the very same simulation (warm-up + window). Used for the HUD and the offline catch-up. */
export function measureRates(s, opts = {}) {
  const sim = new FactorySim(s, { shore: opts.shore ?? 4, speedBonus: opts.speedBonus || 0 });
  if (!sim.machines.length) return { cr: 0, parts: 0, s2: 0, perMin: 0, sim };
  sim.run(opts.warm ?? 90);
  sim.takeGain();
  const win = opts.window ?? 240;
  sim.run(win);
  const g = sim.takeGain(), k = 60 / win;
  const rates = { cr: g.cr * k, parts: g.parts * k, s2: g.s2 * k };
  rates.perMin = valueOfGain(rates);
  rates.sold = sim.sold.map((x) => x * k);
  return { ...rates, power: sim.powerInfo(), sim };
}
export const valueOfGain = (g) => (g.cr || 0) + (g.parts || 0) * H.VALUE.parts + (g.s2 || 0) * H.VALUE.s2;
/** offline catch-up: rates are per minute; elapsed seconds are clamped to the cap and scaled by the offline efficiency. Pure. */
export function offlineGain(rates, elapsedSec, opts = {}) {
  const sec = Math.max(0, Math.min(opts.maxSec ?? OFFLINE.maxSec, Number.isFinite(elapsedSec) ? elapsedSec : 0)), k = (sec / 60) * (opts.eff ?? OFFLINE.eff);
  return { cr: (rates.cr || 0) * k, parts: (rates.parts || 0) * k, s2: (rates.s2 || 0) * k, sec };
}
/** write a gain into the homeworld_core store, capped by the storage caps. Returns what was wasted. */
export function applyGain(hw, g) {
  const waste = { cr: 0, parts: 0, s2: 0 };
  for (const k of ['cr', 'parts', 's2']) {
    const v = g[k] || 0; if (v <= 0) continue;
    const room = Math.max(0, H.capOf(hw, k) - hw.s[k]), add = Math.min(v, room);
    hw.s[k] += add; waste[k] = v - add;
  }
  return waste;
}
export const roomOf = (hw) => ({ cr: Math.max(0, H.capOf(hw, 'cr') - hw.s.cr), parts: Math.max(0, H.capOf(hw, 'parts') - hw.s.parts), s2: Math.max(0, H.capOf(hw, 's2') - hw.s.s2) });
/** the pad grid's free power for the factory: whatever the classic buildings do not use (never negative) */
export function shoreSurplus(hw) { const P = H.powerStats(hw); return Math.max(0, P.supply - P.demand); }

// ---------------------------------------------------------------------------------------------- ROOMS
/** Enclosure detector. A room is a connected set of floor cells; it is CLOSED when every neighbour of the set is a wall / window / door / floor of the
 *  same set (nothing open), ROOFED when every cell has a roof tile. Furniture inside decides the kind. Returns [{cells, closed, roofed, kind[], n}]. */
export function detectRooms(s) {
  const at = new Map();   // key -> { f, g, r } piece types
  for (const p of s.p) { const L = PT[p.t].layer; for (const [x, z] of cellsOf(p.t, p.x, p.z, p.r)) { const k = CELL_KEY(x, z); const e = at.get(k) || {}; e[L] = p; at.set(k, e); } }
  const isWall = (e) => e?.g && (e.g.t === 'wall' || e.g.t === 'window' || e.g.t === 'door');
  const seen = new Set(), rooms = [];
  for (const [k0, e0] of at) {
    if (!e0.f || seen.has(k0) || isWall(e0)) continue;
    const cells = [], q = [k0]; seen.add(k0);
    let closed = true, roofed = true;
    while (q.length) {
      const k = q.pop(), x = Math.floor(k / 256) - 64, z = (k % 256) - 64, e = at.get(k);
      cells.push([x, z]);
      if (!e.r) roofed = false;
      for (const [dx, dz] of DIR) {
        const nk = CELL_KEY(x + dx, z + dz), ne = at.get(nk);
        if (ne?.f && !isWall(ne)) { if (!seen.has(nk)) { seen.add(nk); q.push(nk); } continue; }
        if (isWall(ne)) continue;
        closed = false;
      }
    }
    const kinds = { crate: 0, bench: 0, bed: 0, planter: 0 }, trees = new Set(), ids = new Set();   // furniture spans 2 cells: count each piece once
    for (const [x, z] of cells) {
      const g = at.get(CELL_KEY(x, z)).g;
      if (!g || ids.has(g.i)) continue;
      ids.add(g.i);
      if (kinds[g.t] !== undefined) kinds[g.t]++; else if (g.t === 'tree') trees.add(g.i);
    }
    rooms.push({ cells, n: cells.length, closed: closed && cells.length >= 4, roofed, kinds, trees: [...trees] });
  }
  return rooms;
}
export const ROOM = { storage: 0.2, storageMax: 0.6, bench: 0.06, benchMax: 0.12, bedClout: 0.3, bedMax: 0.6, greenhouse: 2 };
/** the numeric effects of all rooms of a layout */
export function roomEffects(s) {
  const rooms = detectRooms(s), fx = { storage: 0, speed: 0, cloutPerMin: 0, greenhouse: new Set(), rooms: 0 };
  for (const r of rooms) {
    if (!r.closed) continue;
    fx.rooms += 1;
    if (r.kinds.crate) fx.storage += ROOM.storage * r.kinds.crate;
    if (r.kinds.bench) fx.speed += ROOM.bench * r.kinds.bench;
    if (r.roofed && r.kinds.bed) fx.cloutPerMin += ROOM.bedClout * Math.min(2, r.kinds.bed);
    if (r.roofed && r.kinds.planter) for (const id of r.trees) fx.greenhouse.add(id);
  }
  fx.storage = Math.min(ROOM.storageMax, fx.storage); fx.speed = Math.min(ROOM.benchMax, fx.speed); fx.cloutPerMin = Math.min(ROOM.bedMax, fx.cloutPerMin);
  return fx;
}
/** preset room kits (one click stamps floor + walls + door + roof + furniture). Coordinates are relative to the anchor cell, rotation 0. */
export const KITS = {
  storage: { w: 5, h: 4, furn: [['crate', 1, 1], ['crate', 2, 1], ['crate', 3, 2]], door: [2, 0] },
  workshop: { w: 5, h: 4, furn: [['bench', 1, 1], ['bench', 1, 3 - 1]], door: [2, 0] },
  bedroom: { w: 4, h: 4, furn: [['bed', 1, 1]], door: [1, 0] },
  greenhouse: { w: 6, h: 5, furn: [['planter', 1, 1]], door: [3, 0], glass: true },
};
/** the pieces of a room kit at anchor (x, z): [{t,x,z,r}] */
export function kitPieces(kind, x, z) {
  const K = KITS[kind], out = [];
  if (!K) return out;
  for (let i = 0; i < K.w; i++) for (let j = 0; j < K.h; j++) {
    const edge = i === 0 || j === 0 || i === K.w - 1 || j === K.h - 1;
    out.push({ t: 'floor', x: x + i, z: z + j, r: 0 });
    out.push({ t: 'roof', x: x + i, z: z + j, r: 0 });
    if (edge) {
      if (i === K.door[0] && j === K.door[1]) out.push({ t: 'door', x: x + i, z: z + j, r: 0 });
      else out.push({ t: K.glass && ((i + j) % 2 === 0) && !(i === 0 && j === 0) && !(i === K.w - 1 && j === K.h - 1) ? 'window' : 'wall', x: x + i, z: z + j, r: 0 });
    }
  }
  for (const [t, fx, fz] of K.furn) out.push({ t, x: x + fx, z: z + fz, r: 0 });
  return out;
}
export function kitCost(kind) {
  let cr = 0, parts = 0; for (const p of kitPieces(kind, 0, 0)) { const c = levelCost(p.t, 1); cr += c.cr; parts += c.parts; }
  return { cr, parts };
}
export function tryBuildKit(s, hw, wallet, kind, x, z) {
  const list = kitPieces(kind, x, z);
  if (!list.length) return { ok: false, why: 'Unknown building.' };
  const cost = kitCost(kind), why = payable(hw, wallet, cost);
  if (why) return { ok: false, why, cost };
  const trial = { ...s, p: s.p.map((p) => ({ ...p })), n: s.n, st: { ...s.st } };
  const hwc = { ...hw, s: { ...hw.s } };
  const w2 = { cr: 1e12 };
  const made = [];
  // floors first (furniture needs them), then the rest
  const order = [...list.filter((p) => p.t === 'floor'), ...list.filter((p) => p.t !== 'floor')];
  for (const p of order) {
    const pc = placementCheck(trial, hw, p.t, p.x, p.z, p.r);
    if (!pc.ok) return { ok: false, why: pc.why, at: [p.x, p.z] };
    const r = tryBuild(trial, hwc, w2, p.t, p.x, p.z, p.r);
    if (!r.ok) return { ok: false, why: r.why };
    made.push(r.p);
  }
  pay(hw, wallet, cost);
  for (const p of made) { const np = { ...p, i: s.n }; s.p.push(np); s.n += 1; s.st.built += 1; }
  return { ok: true, n: made.length, cost };
}

// ---------------------------------------------------------------------------------------------- TREES
export const TREE = { sapling: 300, young: 900, fruitEvery: 200, maxFruit: 3, wood: [1, 2, 4], fruitHp: 22 };
/** stage 0 sapling / 1 young / 2 mature (bears fruit) from the age in seconds */
export const treeStage = (a) => (a < TREE.sapling ? 0 : a < TREE.young ? 1 : 2);
export const treeWood = (p) => TREE.wood[treeStage(p.a || 0)];
/** advance every tree by `sec` real seconds (mult: greenhouse x2, offline x0.5). Returns true when a stage or a fruit count changed. */
export function growTrees(s, sec, greenhouse = new Set(), mult = 1) {
  let changed = false;
  for (const p of s.p) {
    if (p.t !== 'tree') continue;
    const st0 = treeStage(p.a || 0), f0 = p.f || 0;
    const k = (greenhouse.has(p.i) ? ROOM.greenhouse : 1) * mult;
    p.a = (p.a || 0) + sec * k;
    if (treeStage(p.a) >= 2) {
      p.ft = (p.ft || 0) + sec * k;
      while (p.ft >= TREE.fruitEvery && p.f < TREE.maxFruit) { p.ft -= TREE.fruitEvery; p.f += 1; }
      if (p.f >= TREE.maxFruit) p.ft = Math.min(p.ft, TREE.fruitEvery);
    }
    if (treeStage(p.a) !== st0 || (p.f || 0) !== f0) changed = true;
  }
  return changed;
}
export function harvestTree(p) { const n = p.f || 0; p.f = 0; return n; }

// ---------------------------------------------------------------------------------------------- WAVES
export const WAVE = { minPieces: 4, minValue: 450, first: 300, base: 540, min: 300, shield: 900, calledBonus: 1.25, maxPower: 3.0 };
/** what the base is worth: everything spent on buildings + pieces (credits + 4 x components) */
export function baseValue(hw, s) {
  let v = 0;
  for (const b of hw?.b || []) { const sp = H.spentOn(b); v += sp.cr + sp.parts * 4; }
  for (const p of s?.p || []) { const sp = spentOf(p); v += sp.cr + sp.parts * 4; }
  return Math.round(v);
}
const COUNTS = new Set(['miner', 'smelter', 'assembler', 'uplink', 'generator', 'splitter', 'tree', 'crate', 'bench', 'bed', 'planter']);
export function builtCount(hw, s) { return (hw?.b?.length || 0) + (s?.p || []).filter((p) => COUNTS.has(p.t)).length; }
/** the first wave only comes once the player has built a few things worth something */
export function waveGate(hw, s) {
  const n = builtCount(hw, s), v = baseValue(hw, s);
  return { ok: n >= WAVE.minPieces && v >= WAVE.minValue, n, v, needN: WAVE.minPieces, needV: WAVE.minValue };
}
/** raid power for RaidSim: grows with what the base is worth, with the waves already survived and with the sector; clamped to [0.85, 3] */
export function wavePower(value, wavesDone = 0, quotaIndex = 0) {
  return Math.max(0.85, Math.min(WAVE.maxPower, 0.85 + 0.5 * Math.log2(1 + Math.max(0, value) / 700) + 0.04 * Math.min(10, wavesDone) + 0.05 * Math.max(0, Math.min(12, quotaIndex))));
}
/** seconds between waves: richer bases are visited more often (never faster than 5 minutes) */
export function waveInterval(value) { return Math.max(WAVE.min, Math.min(WAVE.base, Math.round(WAVE.base - Math.max(0, value) / 25))); }
/** extra wave loot on top of the raid bonus (RaidSim reward): components + a shard, scaled with power */
export function waveLoot(power, kind, called = false) {
  const m = (kind === 'repelled' ? 1 : kind === 'held' ? 0.5 : 0) * (called ? WAVE.calledBonus : 1);
  return { parts: Math.round(m * (2 + 3 * power)), s2: m >= 1 && power >= 1.4 ? 1 : 0, cr: Math.round(m * 40 * power) };
}
/** advance the wave clock by dt seconds. Returns { fire } when a wave must start. `active` = somebody is on the homeworld, `busy` = a raid is running. */
export function tickWave(wv, dt, { gate, value, active, busy, nowMs }) {
  if (busy) return { fire: false };
  if (wv.shield > nowMs) return { fire: false, shielded: true };
  if (!gate.ok) { wv.armed = 0; return { fire: false }; }
  if (!wv.armed) { wv.armed = 1; wv.left = WAVE.first; }
  if (!active) return { fire: false };
  wv.left -= dt;
  if (wv.left <= 0) { wv.left = 0; return { fire: true }; }
  return { fire: false };
}
/** after a wave: reschedule, count, and put a shield up after a loss */
export function endWave(wv, kind, value, nowMs) {
  wv.n += 1; wv.called = 0;
  wv.left = waveInterval(value);
  if (kind === 'breached') { wv.shield = nowMs + WAVE.shield * 1000; }
}
export function callWave(wv) { if (wv.armed && wv.left > 20) { wv.left = 0.5; wv.called = 1; return true; } return false; }

// ---------------------------------------------------------------------------------------------- GHOST bases (async raids, no server needed)
export const GHOST = { off: { x: 0, z: -85 }, half: 135, cd: 30 * 60 * 1000, maxCr: 900, timeLimit: 420, crackSec: 8, codePrefix: 'TFG-H2:' };
const RIVAL_NAMES = ['Vex Hollow', 'Null Harbor', 'Kessel Rack', 'Dead Pixel Yard', 'Gilded Cache', 'Old Firewall', 'Hexa Fort', 'Static Keep'];
export function sanitizeGhost(g) {
  if (!g || typeof g !== 'object' || !Array.isArray(g.b)) return null;
  const b = [];
  for (const e of g.b.slice(0, H.MAX_BUILDINGS)) {
    if (!Array.isArray(e) || !H.BUILDINGS[e[0]]) continue;
    const x = Math.floor(num(e[1], NaN)), z = Math.floor(num(e[2], NaN));
    if (!Number.isFinite(x) || !Number.isFinite(z) || !H.cellsOk(H.BUILDINGS[e[0]].size, x, z)) continue;
    b.push([e[0], x, z, ((Math.floor(num(e[3], 0)) % 4) + 4) % 4, Math.max(1, Math.min(H.MAX_LV, Math.floor(num(e[4], 1))))]);
  }
  if (!b.length) return null;
  // overlapping entries are dropped (a hand-edited code must not stack towers)
  const occ = new Set(), clean = [];
  for (const e of b) { const cs = H.cellsOf(H.BUILDINGS[e[0]].size, e[1], e[2]); if (cs.some((c) => occ.has(c))) continue; cs.forEach((c) => occ.add(c)); clean.push(e); }
  return {
    id: String(g.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'ghost',
    name: String(g.name || 'Ghost base').slice(0, 24), tier: Math.max(1, Math.min(5, Math.floor(num(g.tier, 1)))),
    value: Math.max(0, Math.min(500000, Math.floor(num(g.value, 0)))), stash: { cr: Math.max(0, Math.min(20000, Math.floor(num(g.stash?.cr, 0)))), parts: Math.max(0, Math.min(500, Math.floor(num(g.stash?.parts, 0)))) },
    b: clean,
  };
}
/** snapshot of the player's own base (only the 3 m buildings: they are what defends it) */
export function ghostFromState(hw, s, name = 'My base') {
  return sanitizeGhost({ id: 'mine', name, tier: Math.max(1, Math.min(5, 1 + Math.floor(baseValue(hw, s) / 1500))), value: baseValue(hw, s), stash: { cr: Math.floor(hw.s.cr), parts: Math.floor(hw.s.parts) }, b: hw.b.map((b) => [b.t, b.x, b.z, b.r, b.l]) });
}
const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const b64 = (str) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, 'utf8').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (str) => { const t = str.replace(/-/g, '+').replace(/_/g, '/'); const pad = t + '==='.slice((t.length + 3) % 4); return typeof atob === 'function' ? decodeURIComponent(escape(atob(pad))) : Buffer.from(pad, 'base64').toString('utf8'); };
/** shareable base code: TFG-H2:<base64 json>.<checksum> (share it in chat / the hub; the other crew raids it offline) */
export function encodeGhost(g) {
  const clean = sanitizeGhost(g); if (!clean) return '';
  const body = b64(JSON.stringify({ n: clean.name, t: clean.tier, v: clean.value, s: [clean.stash.cr, clean.stash.parts], b: clean.b }));
  return `${GHOST.codePrefix}${body}.${fnv(body)}`;
}
export function decodeGhost(code) {
  try {
    const m = /^\s*TFG-H2:([A-Za-z0-9_-]+)\.([a-z0-9]+)\s*$/.exec(String(code || ''));
    if (!m || fnv(m[1]) !== m[2]) return null;
    const j = JSON.parse(unb64(m[1]));
    return sanitizeGhost({ id: 'g' + m[2], name: j.n, tier: j.t, value: j.v, stash: { cr: j.s?.[0], parts: j.s?.[1] }, b: j.b });
  } catch { return null; }
}
/** deterministic rival base of tier 1-5 (used when nobody shares a code) */
export function genRival(seed, tier = 1) {
  tier = Math.max(1, Math.min(5, tier | 0));
  const rng = new RNG(((seed >>> 0) ^ (tier * 0x9e3779b1)) >>> 0), st = H.blankState(), list = [];
  const put = (t, x, z, r, l) => { if (!H.BUILDINGS[t] || H.count(st, t) >= H.BUILDINGS[t].max) return false; const pc = H.placementCheck(st, t, x, z); if (!pc.ok) return false; st.b.push({ i: st.n++, t, x, z, r, l }); list.push([t, x, z, r, l]); return true; };
  const lvl = () => Math.max(1, Math.min(H.MAX_LV, Math.round(tier * 0.8 + rng.float(-0.6, 0.6))));
  // perimeter ring of wall / gate cells at cell radius ~ 9 (27 m), with one to two gates
  const gates = 1 + (tier > 2 ? 1 : 0), gateAngles = Array.from({ length: gates }, () => rng.float(0, Math.PI * 2));
  const ringR = 9;   // 27 m: the walls cover most of the ring (the wall limit leaves a few gaps, like a real base)
  for (let a = 0; a < 360; a += 360 / (ringR * 8)) {
    const ang = a * Math.PI / 180, x = Math.round(Math.cos(ang) * ringR - 0.5), z = Math.round(Math.sin(ang) * ringR - 0.5);
    const isGate = gateAngles.some((g) => Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))) < 0.16);
    put(isGate ? 'gate' : 'wall', x, z, 0, Math.min(H.MAX_LV, 1 + (tier > 2 ? 1 : 0)));
  }
  const towerTypes = ['gun', 'gun', 'gun', 'tesla', 'flame', 'sniper', 'cryo'].slice(0, 3 + tier);
  const nT = 3 + tier * 2;
  for (let k = 0; k < nT; k++) {
    const ang = (k / nT) * Math.PI * 2 + rng.float(-0.2, 0.2), rr = rng.float(5.5, ringR - 1.2);
    put(towerTypes[rng.int(0, towerTypes.length - 1)], Math.round(Math.cos(ang) * rr - 0.5), Math.round(Math.sin(ang) * rr - 0.5), 0, lvl());
  }
  for (const t of ['farm', 'generator', 'rack', 'refinery', 'barracks', 'solar'].slice(0, 2 + tier)) {
    for (let tries = 0; tries < 30; tries++) { const ang = rng.float(0, Math.PI * 2), rr = rng.float(6, ringR - 3); if (put(t, Math.round(Math.cos(ang) * rr - 1), Math.round(Math.sin(ang) * rr - 1), rng.int(0, 3), lvl())) break; }
  }
  const value = Math.round(400 * Math.pow(2.1, tier - 1) + rng.float(-80, 120));
  return sanitizeGhost({ id: `rival${tier}_${(seed >>> 0) % 997}`, name: RIVAL_NAMES[((seed >>> 0) + tier * 3) % RIVAL_NAMES.length], tier, value, stash: { cr: Math.round(120 * Math.pow(1.9, tier - 1) + rng.float(0, 60)), parts: 6 + tier * 4 }, b: list });
}
/** the tower / guard roster of a ghost raid (host spawns them, players kill them for real). Per-second damage to a player is deliberately gentle. */
export function ghostDefense(g) {
  const sentries = [], walls = [];
  for (const [t, x, z, r, l] of g.b) {
    const d = H.BUILDINGS[t], c = H.cellCenter({ x, z }, d);
    if (d.tw) { const ts = towerStats(d, l); sentries.push({ t, lv: l, x: c.x, z: c.z, hp: Math.round(d.hp[l - 1] * 0.5), range: Math.min(ts.range, t === 'sniper' ? 42 : 24), dps: Math.round(ts.dps * 0.2 * 10) / 10, shot: d.tw.shot ? Math.round(d.tw.shot[l - 1] * 0.2) : 0 }); }   // [unify] shared tower stat read
    else if (H.isWall(t)) walls.push({ t, x: c.x, z: c.z, gate: t === 'gate' });
  }
  const guards = Math.max(2, Math.min(9, Math.round(g.value / 700) + g.tier));
  return { sentries, walls, guards, vault: { x: 0, z: 0 } };
}
/** loot for cracking the vault: a share of the ghost's stash + a value bonus, hard-capped so a raid never outpays a good run */
export function ghostLoot(g, { quotaIndex = 0, mine = false } = {}) {
  const k = mine ? 0.4 : 1;
  const cr = Math.round(Math.min(GHOST.maxCr, g.stash.cr * 0.3 + g.value * 0.03 + 40 + 10 * quotaIndex) * k);
  return { cr, parts: Math.round(Math.min(14, 3 + g.tier * 2 + g.stash.parts * 0.1) * k), clout: Math.round((4 + g.tier * 3) * k), xp: 60 + g.tier * 30 };
}
export const ghostReady = (s, id, nowMs) => (s.g.raided[id] || 0) <= nowMs;
export const markRaided = (s, id, nowMs) => { s.g.raided[id] = nowMs + GHOST.cd; const keys = Object.keys(s.g.raided); if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete s.g.raided[k]; };

// ---------------------------------------------------------------------------------------------- wire encoding (layout ops + snapshots)
export const pack = (p) => [p.i, TIDX[p.t], p.x, p.z, p.r, p.l || 1, p.br ? 1 : 0, p.a ? Math.round(p.a) : 0, p.f || 0];
export const unpack = (a) => { const t = TYPES[a[0 + 1]]; if (!t || !PT[t]) return null; const p = { i: a[0] | 0, t, x: a[2] | 0, z: a[3] | 0, r: (a[4] | 0) & 3, l: Math.max(1, Math.min(MAX_LV, a[5] | 0)) }; if (a[6]) p.br = 1; if (t === 'tree') { p.a = +a[7] || 0; p.f = a[8] | 0; p.ft = 0; } return p; };
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** belt items -> string (3 chars each: 12 bit index into the fac list, 3 bit item, 3 bit progress) */
export function encodeItems(sim) {
  let out = '';
  for (let k = 0; k < sim.n; k++) {
    const q = sim.st[k]; if (!q.item) continue;
    const v = (k << 6) | (q.item << 3) | Math.min(7, Math.floor(q.prog * 8));
    out += B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
  }
  return out;
}
export function decodeItems(str) {
  const out = [];
  for (let i = 0; i + 2 < str.length; i += 3) { const v = (B64.indexOf(str[i]) << 12) | (B64.indexOf(str[i + 1]) << 6) | B64.indexOf(str[i + 2]); out.push({ k: v >> 6, item: (v >> 3) & 7, prog: ((v & 7) + 0.5) / 8 }); }
  return out;
}
export const encodeStates = (sim) => { let s = ''; for (const k of sim.machines) s += String(sim.st[k].state); return s; };
