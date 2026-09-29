// HOMEWORLD TYCOON core (wave 2, module 'homeworld'): building table, costs, power / cooling limits, per-DAY production, storage caps,
// placement rules and the RAID maths. Pure data + functions: no DOM / three / game access (node-tested by tools/harness/homeworld.test.mjs).
// Design: docs/MASTERPLAN.md section 17. Numbers + reasoning: docs/wave2/homeworld.md.
// State (persisted in the host's profile, synced through run.hw):
//   { v, b:[{i,t,x,z,r,l,h?}], n, s:{cr,clout,parts,meals,s1..s4}, days, mk:{run,day}, lastRaid, st:{...} }
//   b.i id, b.t type, b.x/b.z grid cell (lower-left cell of the footprint), b.r rotation (0..3 quarter turns), b.l level 1-5, b.h current hp (absent = full).
import { RNG } from '../core/rng.js';
import { SG, planWave, waveCount } from './siege_core.js';
import * as DC from './defense_core.js';   // [unify] towers / walls / spikes / mines are registered in the shared defence table

export const CELL = 3;                 // metres per grid cell
export const GRID_MIN = -15, GRID_MAX = 15;   // cell index range [-15, 15): 30 x 30 cells = 90 m square plateau
export const PAD_CLEAR = 16;           // build cells must be at least this far (m) from the landing pad centre (the ship sits at the origin)
export const MAX_LV = 5;
export const MAX_BUILDINGS = 60;
export const FREE_POWER = 4, FREE_COOL = 6;   // shore power of the pad + passive radiators of the plateau
export const BOOST_CAP = 0.5;          // Barracks: max +50 % on every producer
export const MAX_DAYS_PER_CREDIT = 12; // sanity clamp per credit call

export const RES_KEYS = ['cr', 'clout', 'parts', 'meals', 's1', 's2', 's3', 's4'];
export const RES_ICON = { cr: '▮', clout: '◈', parts: '⚙', meals: '♨', s1: 's1', s2: 's2', s3: 's3', s4: 's4' };
export const SHARD_ITEM = { s1: 'shard_scrap', s2: 'shard_circuit', s3: 'shard_crystal', s4: 'shard_ecto' };
/** value of one unit in credits ("▮ equivalents"), used for the income numbers in the docs + the node sim */
export const VALUE = { cr: 1, clout: 4, parts: 4, meals: 5, s1: 3, s2: 11, s3: 25, s4: 50 };
export const BASE_CAP = { cr: 500, clout: 80, parts: 60, meals: 24, s1: 20, s2: 12, s3: 6, s4: 3 };
export const START_STORE = { cr: 0, clout: 0, parts: 14, meals: 0, s1: 0, s2: 0, s3: 0, s4: 0 };
/** "an average active day" the passive income is measured against (credits-equivalent, mid-game crew, see docs) */
export const ACTIVE_DAY_VALUE = 480;
/** the same for a late-game crew (quota index ~12: quota ~4000 over 3 days + upgrades): a MAXED homeworld is measured against this one */
export const ACTIVE_DAY_LATE = 1400;
export const PASSIVE_SHARE = [0.2, 0.3];

const D = (o) => o;
// ---------------------------------------------------------------------------------------------- building table
// size: footprint in cells (square). base: level-1 cost. g: cost growth per level (exponential). pw: power draw / lv, heat: heat / lv,
// sup: power supplied / lv, cool: cooling supplied / lv. out: per-day output arrays. tw: tower stats. hp: structure hit points / lv.
export const BUILDINGS = {
  farm: D({ cat: 'eco', name: 'Content Farm', size: 3, max: 6, base: { cr: 80, parts: 4 }, g: 1.9, hp: [120, 180, 260, 380, 540], pw: [2, 3, 4, 6, 8], heat: [0, 0, 0, 0, 0],
    out: { cr: [5, 9, 15, 24, 36] }, desc: 'Posts content all day. Passive credits per day.' }),
  rack: D({ cat: 'eco', name: 'Server Rack Array', size: 2, max: 3, base: { cr: 160, parts: 8 }, g: 1.9, adv: 1, hp: [140, 200, 290, 420, 600], pw: [4, 6, 9, 13, 18], heat: [3, 5, 7, 10, 14],
    out: { clout: [1, 2, 3, 5, 7] }, desc: 'Turns Engagement into Clout. Runs hot: needs cooling.' }),
  generator: D({ cat: 'pow', name: 'Generator', size: 2, max: 6, base: { cr: 60, parts: 6 }, g: 1.8, hp: [150, 220, 320, 460, 660], pw: [0, 0, 0, 0, 0], heat: [1, 2, 3, 4, 5],
    sup: [8, 14, 22, 34, 50], desc: 'Burns anything. Lots of power, some heat.' }),
  solar: D({ cat: 'pow', name: 'Solar Array', size: 2, max: 6, base: { cr: 90, parts: 5 }, g: 1.8, hp: [90, 140, 200, 290, 410], pw: [0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0],
    sup: [5, 9, 14, 21, 30], desc: 'Clean power. No heat, fragile, costs more per watt.' }),
  cooler: D({ cat: 'pow', name: 'Cooling Unit', size: 2, max: 4, base: { cr: 70, parts: 5 }, g: 1.8, hp: [130, 190, 270, 390, 550], pw: [1, 2, 3, 4, 5], heat: [0, 0, 0, 0, 0],
    cool: [6, 10, 16, 24, 34], desc: 'Removes heat so hot buildings can be built.' }),
  refinery: D({ cat: 'eco', name: 'Scrap Refinery', size: 3, max: 3, base: { cr: 110, parts: 6 }, g: 1.9, hp: [160, 240, 340, 490, 700], pw: [3, 4, 6, 8, 11], heat: [1, 1, 2, 3, 4],
    out: { parts: [1, 2, 3, 5, 7] }, desc: 'Melts scrap into components. Components pay for every build.' }),
  distiller: D({ cat: 'eco', name: 'Shard Distiller', size: 2, max: 2, base: { cr: 200, parts: 10 }, g: 2.0, adv: 1, hp: [150, 220, 320, 460, 660], pw: [3, 5, 7, 10, 14], heat: [2, 3, 4, 6, 8],
    out: { s: [1, 2, 1, 2, 1] }, shardKey: ['s1', 's1', 's2', 's2', 's3'], desc: 'Slowly distils forge shards. Higher tiers, better shards.' }),
  garden: D({ cat: 'eco', name: 'Garden / Kitchen', size: 3, max: 3, base: { cr: 70, parts: 3 }, g: 1.85, hp: [100, 150, 220, 320, 450], pw: [1, 1, 2, 3, 4], heat: [0, 0, 0, 0, 0],
    out: { meals: [1, 2, 3, 4, 6] }, desc: 'Meals for the crew (collected as medkits).' }),
  barracks: D({ cat: 'eco', name: 'Barracks', size: 3, max: 2, base: { cr: 140, parts: 6 }, g: 1.9, hp: [180, 260, 380, 540, 780], pw: [2, 3, 4, 6, 8], heat: [0, 0, 0, 0, 0],
    boost: [0.06, 0.12, 0.18, 0.26, 0.36], workers: [1, 2, 3, 4, 6], desc: 'Hired hands. Every producer works faster.' }),
  museum: D({ cat: 'eco', name: 'Trophy Hall', size: 3, max: 1, base: { cr: 150, parts: 6 }, g: 1.9, hp: [160, 240, 340, 490, 700], pw: [2, 3, 4, 5, 7], heat: [0, 0, 0, 0, 0],
    out: { clout: [1, 2, 3, 4, 6] }, slots: [2, 3, 4, 5, 6], desc: 'Bestiary trophies draw visitors: passive Clout.' }),
  arcade: D({ cat: 'eco', name: 'Arcade / Lounge', size: 2, max: 1, base: { cr: 120, parts: 4 }, g: 1.85, hp: [110, 160, 230, 330, 470], pw: [2, 2, 3, 4, 5], heat: [0, 0, 0, 0, 0],
    clout: [0.03, 0.05, 0.08, 0.12, 0.16], desc: 'Games, jam, friends. +Clout from every source.' }),
  warehouse: D({ cat: 'eco', name: 'Warehouse', size: 3, max: 3, base: { cr: 100, parts: 8 }, g: 1.85, hp: [170, 250, 360, 520, 740], pw: [1, 1, 2, 2, 3], heat: [0, 0, 0, 0, 0],
    cap: [0.5, 1.0, 1.6, 2.4, 3.4], desc: 'Raises every storage cap.' }),
  // ---- defence (tower defence: raids)
  gun: D({ cat: 'def', name: 'Gun Tower', size: 1, max: 8, base: { cr: 120, parts: 6 }, g: 1.8, hp: [180, 260, 380, 540, 760], pw: [3, 4, 6, 8, 11], heat: [0, 0, 0, 0, 0],
    tw: { dps: [14, 22, 34, 50, 72], range: [22, 24, 26, 28, 30] }, desc: 'Reliable single-target fire.' }),
  tesla: D({ cat: 'def', name: 'Tesla Tower', size: 1, max: 4, base: { cr: 200, parts: 10 }, g: 1.85, adv: 1, hp: [160, 230, 340, 490, 690], pw: [5, 7, 10, 14, 20], heat: [1, 1, 2, 2, 3],
    tw: { dps: [22, 34, 50, 74, 110], range: [15, 16, 17, 18, 19], chain: [2, 3, 3, 4, 5] }, desc: 'Arcs chain between raiders. Great vs swarms.' }),
  flame: D({ cat: 'def', name: 'Flame Tower', size: 1, max: 4, base: { cr: 170, parts: 8 }, g: 1.85, hp: [200, 290, 420, 600, 850], pw: [3, 4, 6, 8, 11], heat: [2, 3, 4, 5, 6],
    tw: { dps: [40, 62, 95, 140, 200], range: [9, 9.5, 10, 10.5, 11] }, desc: 'Short range, huge damage. Burns everything close.' }),
  cryo: D({ cat: 'def', name: 'Cryo Tower', size: 1, max: 4, base: { cr: 150, parts: 8 }, g: 1.8, hp: [170, 240, 350, 500, 700], pw: [4, 5, 7, 9, 13], heat: [1, 1, 2, 2, 3],
    tw: { dps: [6, 9, 13, 18, 25], range: [16, 17, 18, 19, 20], slow: [0.3, 0.38, 0.46, 0.54, 0.62] }, desc: 'Slows raiders so every other tower gets more shots.' }),
  sniper: D({ cat: 'def', name: 'Sniper Tower', size: 1, max: 3, base: { cr: 180, parts: 8 }, g: 1.9, adv: 1, hp: [150, 210, 310, 440, 620], pw: [4, 6, 8, 11, 15], heat: [0, 0, 0, 0, 0],
    tw: { dps: [28, 44, 66, 100, 150], range: [50, 54, 58, 62, 66], shot: [90, 140, 210, 320, 480] }, desc: 'Huge range, slow heavy shots.' }),
  wall: D({ cat: 'def', name: 'Wall', size: 1, max: 40, base: { cr: 12, parts: 1 }, g: 1.7, hp: [250, 450, 750, 1200, 1900], pw: [0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0],
    desc: 'Raiders path around walls, or chew through.' }),
  gate: D({ cat: 'def', name: 'Gate', size: 1, max: 6, base: { cr: 22, parts: 2 }, g: 1.7, hp: [200, 360, 600, 960, 1500], pw: [0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0],
    passable: true, desc: 'Crew walks through, raiders do not.' }),
  spikes: D({ cat: 'def', name: 'Spike Field', size: 1, max: 8, base: { cr: 25, parts: 2 }, g: 1.75, hp: [120, 180, 270, 400, 600], pw: [0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0],
    trap: { dps: [12, 20, 32, 50, 80], r: 1.7 }, passable: true, desc: 'Hurts everything that walks over it.' }),
  mines: D({ cat: 'def', name: 'Mine Field', size: 1, max: 6, base: { cr: 40, parts: 3 }, g: 1.8, hp: [100, 150, 220, 320, 470], pw: [0, 0, 0, 0, 0], heat: [0, 0, 0, 0, 0],
    trap: { burst: [120, 200, 320, 500, 800], r: 5, charges: [1, 2, 3, 4, 5] }, passable: true, desc: 'Rearmed free after every raid.' }),
};
DC.regHomeworld(BUILDINGS);   // [unify] hw_gun, hw_tesla, hw_flame, hw_cryo, hw_sniper, hw_wall, hw_gate, hw_spikes, hw_mines
export const TYPE_ORDER = Object.keys(BUILDINGS);
export const CATS = [['eco', 'ECONOMY'], ['pow', 'POWER'], ['def', 'DEFENCE']];
export const isTower = (t) => !!BUILDINGS[t]?.tw;
export const isWall = (t) => t === 'wall' || t === 'gate';

// ---------------------------------------------------------------------------------------------- state
export function blankState() {
  return { v: 1, b: [], n: 1, s: { ...START_STORE }, days: 0, mk: { run: '', day: 0 }, lastRaid: -9, st: { repelled: 0, held: 0, breached: 0, visits: 0, produced: 0, collected: 0, built: 0 } };
}
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
/** Validate / repair a saved state (corrupt fields never brick the homeworld). Returns a NEW clean object. */
export function sanitize(raw) {
  const s = blankState();
  if (!raw || typeof raw !== 'object') return s;
  for (const k of RES_KEYS) s.s[k] = Math.max(0, num(raw.s?.[k], s.s[k]));
  const seen = new Set(), occ = new Set();
  let maxId = 0;
  for (const b of Array.isArray(raw.b) ? raw.b : []) {
    const d = BUILDINGS[b?.t];
    if (!d || s.b.length >= MAX_BUILDINGS) continue;
    const x = Math.floor(num(b.x, NaN)), z = Math.floor(num(b.z, NaN)), i = Math.floor(num(b.i, 0));
    if (!Number.isFinite(x) || !Number.isFinite(z) || i <= 0 || seen.has(i)) continue;
    if (!cellsOk(d.size, x, z)) continue;
    const cells = cellsOf(d.size, x, z);
    if (cells.some((c) => occ.has(c))) continue;
    for (const c of cells) occ.add(c);
    seen.add(i); maxId = Math.max(maxId, i);
    const l = Math.max(1, Math.min(MAX_LV, Math.floor(num(b.l, 1))));
    const nb = { i, t: b.t, x, z, r: ((Math.floor(num(b.r, 0)) % 4) + 4) % 4, l };
    if (b.h !== undefined && b.h !== null) nb.h = Math.max(0, Math.min(d.hp[l - 1], num(b.h, d.hp[l - 1])));
    s.b.push(nb);
  }
  s.n = Math.max(maxId + 1, Math.floor(num(raw.n, 1)));
  s.days = Math.max(0, Math.floor(num(raw.days, 0)));
  s.mk = { run: String(raw.mk?.run || '').slice(0, 24), day: Math.max(0, Math.floor(num(raw.mk?.day, 0))) };
  s.lastRaid = Math.floor(num(raw.lastRaid, -9));
  for (const k of Object.keys(s.st)) s.st[k] = Math.max(0, num(raw.st?.[k], 0));
  return s;
}

// ---------------------------------------------------------------------------------------------- geometry
export const cellCenter = (b, d = BUILDINGS[b.t]) => ({ x: (b.x + d.size / 2) * CELL, z: (b.z + d.size / 2) * CELL });
const key = (x, z) => (x + 64) * 256 + (z + 64);
export function cellsOf(size, x, z) { const out = []; for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) out.push(key(x + i, z + j)); return out; }
export function cellsOk(size, x, z) {
  if (x < GRID_MIN || z < GRID_MIN || x + size > GRID_MAX || z + size > GRID_MAX) return false;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) if (Math.hypot((x + i + 0.5) * CELL, (z + j + 0.5) * CELL) < PAD_CLEAR) return false;
  return true;
}
export function occupied(state, ignoreId = 0) {
  const occ = new Map();
  for (const b of state.b) { if (b.i === ignoreId) continue; for (const c of cellsOf(BUILDINGS[b.t].size, b.x, b.z)) occ.set(c, b.i); }
  return occ;
}
export const byId = (state, id) => state.b.find((b) => b.i === id) || null;
export const count = (state, type) => state.b.reduce((n, b) => n + (b.t === type ? 1 : 0), 0);
/** world-space snap: nearest valid origin cell whose footprint is centred on (wx, wz) */
export function snapCell(type, wx, wz) {
  const n = BUILDINGS[type].size;
  return { x: Math.round(wx / CELL - n / 2), z: Math.round(wz / CELL - n / 2) };
}

// ---------------------------------------------------------------------------------------------- costs
const r5 = (v) => (v >= 60 ? Math.round(v / 5) * 5 : Math.round(v));
/** cost of building the type at level `lv` (lv 1 = build, lv n = the upgrade n-1 -> n). */
export function levelCost(type, lv) {
  const d = BUILDINGS[type];
  const c = { cr: r5(d.base.cr * Math.pow(d.g, lv - 1)), parts: Math.ceil(d.base.parts * Math.pow(1.7, lv - 1)) };
  if (d.adv && lv >= 4) c.s2 = lv - 3;
  if (d.adv && lv >= 5) c.s3 = 1;
  return c;
}
/** total credits + parts spent on a building (all levels up to its level) */
export function spentOn(b) {
  let cr = 0, parts = 0;
  for (let l = 1; l <= b.l; l++) { const c = levelCost(b.t, l); cr += c.cr; parts += c.parts; }
  return { cr, parts };
}
export const sellValue = (b) => { const s = spentOn(b); return { cr: Math.floor(s.cr * 0.6), parts: Math.floor(s.parts * 0.6) }; };
export const hpMax = (b) => BUILDINGS[b.t].hp[b.l - 1];
export const hpOf = (b) => (b.h === undefined ? hpMax(b) : b.h);
export const wrecked = (b) => hpOf(b) <= 0;
export function repairCost(b) {
  const miss = 1 - hpOf(b) / hpMax(b);
  if (miss <= 0.001) return { cr: 0, parts: 0 };
  const s = spentOn(b);
  return { cr: Math.max(1, Math.ceil(s.cr * 0.35 * miss)), parts: Math.max(b.h === 0 ? 1 : 0, Math.ceil(s.parts * 0.3 * miss)) };
}
export function canPay(state, wallet, cost) {
  if (num(wallet.cr) < (cost.cr || 0)) return 'Not enough credits.';
  for (const k of RES_KEYS) if (k !== 'cr' && (cost[k] || 0) > state.s[k] + 1e-9) return k === 'parts' ? 'Not enough components.' : 'Not enough shards.';
  return '';
}
function pay(state, wallet, cost) { wallet.cr -= cost.cr || 0; for (const k of RES_KEYS) if (k !== 'cr' && cost[k]) state.s[k] -= cost[k]; }

// ---------------------------------------------------------------------------------------------- power / cooling
export function powerStats(state) {
  let supply = FREE_POWER, demand = 0, heat = 0, cooling = FREE_COOL;
  for (const b of state.b) {
    if (wrecked(b)) continue;
    const d = BUILDINGS[b.t], i = b.l - 1;
    supply += d.sup?.[i] || 0; demand += d.pw[i] || 0; heat += d.heat[i] || 0; cooling += d.cool?.[i] || 0;
  }
  return { supply, demand, heat, cooling, powerRatio: demand > 0 ? Math.min(1, supply / demand) : 1, coolRatio: heat > 0 ? Math.min(1, cooling / heat) : 1 };
}
const limitsOk = (p) => p.demand <= p.supply + 1e-9 && p.heat <= p.cooling + 1e-9;
function limitWhy(p) { return p.demand > p.supply ? `Needs +${Math.ceil(p.demand - p.supply)} power: build a Generator or Solar Array first.` : `Needs +${Math.ceil(p.heat - p.cooling)} cooling: build a Cooling Unit first.`; }

// ---------------------------------------------------------------------------------------------- actions (pure; wallet = { cr } is the ship credits)
export function placementCheck(state, type, x, z, opts = {}) {
  const d = BUILDINGS[type];
  if (!d) return { ok: false, why: 'Unknown building.' };
  if (!opts.ignoreId && state.b.length >= MAX_BUILDINGS) return { ok: false, why: 'Homeworld is full.' };
  if (!opts.ignoreId && count(state, type) >= d.max) return { ok: false, why: `Limit reached (${d.max}).` };
  if (!cellsOk(d.size, x, z)) return { ok: false, why: 'Out of the build zone (or on the landing pad).' };
  const occ = occupied(state, opts.ignoreId || 0);
  for (const c of cellsOf(d.size, x, z)) if (occ.has(c)) return { ok: false, why: 'Blocked by another building.' };
  return { ok: true };
}
export function tryBuild(state, wallet, type, x, z, r = 0) {
  const pc = placementCheck(state, type, x, z);
  if (!pc.ok) return pc;
  const cost = levelCost(type, 1);
  const why = canPay(state, wallet, cost);
  if (why) return { ok: false, why, cost };
  const b = { i: state.n, t: type, x, z, r: ((r % 4) + 4) % 4, l: 1 };
  const p = powerStats({ b: [...state.b, b] });
  if (!limitsOk(p)) return { ok: false, why: limitWhy(p) };
  pay(state, wallet, cost);
  state.b.push(b); state.n += 1; state.st.built += 1;
  return { ok: true, b, cost };
}
export function tryUpgrade(state, wallet, id) {
  const b = byId(state, id);
  if (!b) return { ok: false, why: 'No such building.' };
  if (wrecked(b)) return { ok: false, why: 'Repair it first.' };
  if (b.l >= MAX_LV) return { ok: false, why: 'Already at the maximum level.' };
  const cost = levelCost(b.t, b.l + 1);
  const why = canPay(state, wallet, cost);
  if (why) return { ok: false, why, cost };
  const p = powerStats({ b: state.b.map((o) => (o === b ? { ...o, l: o.l + 1 } : o)) });
  if (!limitsOk(p)) return { ok: false, why: limitWhy(p) };
  pay(state, wallet, cost);
  const full = hpOf(b) >= hpMax(b) - 1e-6;
  b.l += 1;
  if (full) delete b.h;
  return { ok: true, b, cost };
}
export function trySell(state, wallet, id) {
  const b = byId(state, id);
  if (!b) return { ok: false, why: 'No such building.' };
  const p = powerStats({ b: state.b.filter((o) => o !== b) });
  if (!limitsOk(p)) return { ok: false, why: 'Other buildings depend on it (power / cooling).' };
  const v = sellValue(b);
  state.b.splice(state.b.indexOf(b), 1);
  wallet.cr += v.cr; state.s.parts = Math.min(capOf(state, 'parts'), state.s.parts + v.parts);
  return { ok: true, refund: v };
}
export function tryMove(state, id, x, z, r) {
  const b = byId(state, id);
  if (!b) return { ok: false, why: 'No such building.' };
  const pc = placementCheck(state, b.t, x, z, { ignoreId: id });
  if (!pc.ok) return pc;
  b.x = x; b.z = z; b.r = ((r % 4) + 4) % 4;
  return { ok: true, b };
}
export function tryRepair(state, wallet, id) {
  const list = id === 'all' ? state.b.filter((b) => hpOf(b) < hpMax(b)) : [byId(state, id)].filter(Boolean);
  if (!list.length) return { ok: false, why: 'Nothing to repair.' };
  let done = 0, spent = { cr: 0, parts: 0 };
  for (const b of list) {
    const c = repairCost(b);
    if (canPay(state, wallet, c)) { if (id !== 'all') return { ok: false, why: canPay(state, wallet, c), cost: c }; continue; }
    pay(state, wallet, c); spent.cr += c.cr; spent.parts += c.parts; delete b.h; done++;
  }
  return done ? { ok: true, n: done, cost: spent } : { ok: false, why: 'Not enough credits.' };
}

// ---------------------------------------------------------------------------------------------- storage
export function capOf(state, k) {
  let m = 1 + (state.xcap || 0);   // [h2] storage rooms of homeworld2 (transient, recomputed by that module; never persisted)
  for (const b of state.b) if (b.t === 'warehouse' && !wrecked(b)) m += BUILDINGS.warehouse.cap[b.l - 1];
  return Math.floor(BASE_CAP[k] * Math.min(8, m));
}
export function boostOf(state) {
  let v = 0;
  for (const b of state.b) if (b.t === 'barracks' && !wrecked(b)) v += BUILDINGS.barracks.boost[b.l - 1];
  return Math.min(BOOST_CAP, v);
}
export const workersOf = (state) => state.b.reduce((n, b) => n + (b.t === 'barracks' && !wrecked(b) ? BUILDINGS.barracks.workers[b.l - 1] : 0), 0);
export function loungeOf(state) {
  let v = 0;
  for (const b of state.b) if (b.t === 'arcade' && !wrecked(b)) v += BUILDINGS.arcade.clout[b.l - 1];
  return v;
}

// ---------------------------------------------------------------------------------------------- production (per GAME DAY)
/** what one game day yields right now (fractions allowed; nothing is produced by wrecked buildings) */
export function dayOutput(state, ctx = {}) {
  const P = powerStats(state), boost = boostOf(state);
  const out = { cr: 0, clout: 0, parts: 0, meals: 0, s1: 0, s2: 0, s3: 0, s4: 0 };
  for (const b of state.b) {
    const d = BUILDINGS[b.t];
    if (!d.out || wrecked(b)) continue;
    const i = b.l - 1;
    let mul = P.powerRatio * (1 + boost);
    if (d.heat[i] > 0) mul *= P.coolRatio;
    if (b.t === 'museum') mul *= 0.6 + 0.4 * Math.min(1, (ctx.exhibits || 0) / 15);
    for (const k of Object.keys(d.out)) out[k === 's' ? d.shardKey[i] : k] += d.out[k][i] * mul;
  }
  out.clout *= 1 + loungeOf(state);
  return out;
}
export const valueOf = (o) => RES_KEYS.reduce((s, k) => s + (o[k] || 0) * VALUE[k], 0);
/** credit `days` game days: adds to the store (capped), returns { gained, wasted, days } */
export function advanceDays(state, days, ctx = {}) {
  days = Math.max(0, Math.min(MAX_DAYS_PER_CREDIT, Math.floor(days)));
  const gained = {}, wasted = {};
  for (const k of RES_KEYS) { gained[k] = 0; wasted[k] = 0; }
  for (let d = 0; d < days; d++) {
    const o = dayOutput(state, ctx);
    for (const k of RES_KEYS) {
      const cap = capOf(state, k), room = Math.max(0, cap - state.s[k]), add = Math.min(o[k], room);
      state.s[k] += add; gained[k] += add; wasted[k] += o[k] - add;
    }
    state.days += 1;
  }
  state.st.produced += valueOf(gained);
  return { gained, wasted, days };
}
/** run/day tracker: how many NEW game days passed since the last call (a new run or a rewound counter resets the mark, never pays) */
export function daysSince(state, runId, day) {
  const mk = state.mk;
  if (mk.run !== runId || day < mk.day) { mk.run = runId; mk.day = day; return 0; }
  const n = day - mk.day; mk.day = day;
  return n;
}
/** collect whole units of everything except components (they stay in the store: they pay for builds) */
export function collect(state) {
  const out = {};
  for (const k of RES_KEYS) {
    if (k === 'parts') continue;
    const n = Math.floor(state.s[k] + 1e-9);
    if (n > 0) { out[k] = n; state.s[k] -= n; }
  }
  state.st.collected += valueOf(out);
  return out;
}
export const stored = (state) => RES_KEYS.reduce((n, k) => n + (k === 'parts' ? 0 : Math.floor(state.s[k])), 0);

// ---------------------------------------------------------------------------------------------- raids
export const RAID = { maxChance: 0.08, minBuildings: 3, minDayGap: 2, engageR: 24, spawnR: 52, speed: 4.5, prep: 6, lull: 4, waveCap: 26, hardCap: 150, dpsMul: 0.4, coreR: 14 };
/** chance per LANDED (non-home) day that the homeworld is raided while the crew is away */
export function raidChance(state, day) {
  const n = state.b.length;
  if (n < RAID.minBuildings) return 0;
  if (day - state.lastRaid < RAID.minDayGap) return 0;
  return Math.min(RAID.maxChance, 0.02 + 0.005 * (n - RAID.minBuildings));
}
/** raid power: grows with what the base is worth (Sigma levels of the non-wall buildings) and with the sector */
export function raidPower(state, quotaIndex = 0) {
  const sum = state.b.reduce((n, b) => n + (BUILDINGS[b.t].cat === 'def' ? 0 : b.l), 0);   // defences never make the raid stronger
  return Math.max(0.8, Math.min(3.0, 0.75 + 0.03 * sum + 0.07 * Math.max(0, quotaIndex)));
}
const RTYPES = ['sg_swarmer', 'sg_runner', 'sg_brute', 'sg_boss'];
export function poolOf(plan, level = 1) {
  const cnt = [plan.swarm, plan.runner, plan.tank, plan.boss], lv = 1 + 0.18 * (level - 1);
  let n = 0, hp = 0, dps = 0;
  RTYPES.forEach((t, i) => { const S = SG[t]; n += cnt[i]; hp += cnt[i] * S.hp * lv; dps += cnt[i] * (S.dep / S.cd) * (1 + 0.1 * (level - 1)); });
  return { n, hp, hp0: hp, dps, plan };
}
/** tower stats of the live (non wrecked) defence buildings */
export function defenseOf(state) {
  const P = powerStats(state), towers = [], traps = [], walls = [];
  for (const b of state.b) {
    if (wrecked(b)) continue;
    const d = BUILDINGS[b.t], i = b.l - 1, c = cellCenter(b, d);
    if (d.tw) towers.push({ id: b.i, t: b.t, lv: b.l, x: c.x, z: c.z, ...DC.towerStats(d, b.l, P.powerRatio) });   // [unify] shared stat read
    else if (d.trap) traps.push({ id: b.i, t: b.t, lv: b.l, x: c.x, z: c.z, dps: d.trap.dps?.[i] || 0, burst: d.trap.burst?.[i] || 0, charges: d.trap.charges?.[i] || 0 });
    else if (isWall(b.t)) walls.push({ id: b.i, t: b.t, x: c.x, z: c.z });
  }
  return { towers, traps, walls, P };
}
export const defenseScore = (state) => defenseOf(state).towers.reduce((s, t) => s + t.dps, 0);
/** the same "defence power" number zones use (defense_core ratings of every live defence building, walls / traps included) */
export const defenseRating = (state) => DC.round1(state.b.reduce((n, b) => (BUILDINGS[b.t].cat === 'def' && !wrecked(b) ? n + DC.hwDef(b.t, BUILDINGS[b.t], b.l).rating : n), 0));

/**
 * Abstract raid while the crew is away: a deterministic (seeded) 1 s stepper. The host steps it once per second and publishes frame() to
 * the HUD; finish() (or run()) yields the result. Geometry is real: raiders come in along one seeded bearing, towers only shoot inside
 * their range, walls soak damage first, cryo slows the approach, mines blow once, spikes hurt at the wall line.
 */
export class RaidSim {
  constructor(state, { seed = 1, quotaIndex = 0, power = null, level = 1 } = {}) {
    this.rng = new RNG(seed >>> 0);
    this.P = power ?? raidPower(state, quotaIndex);
    this.W = waveCount(this.P, 'contract');
    this.level = level;
    this.ang = this.rng.float(0, Math.PI * 2);
    this.def = defenseOf(state);
    this.hp = new Map(state.b.map((b) => [b.i, hpOf(b)]));
    this.info = new Map(state.b.map((b) => [b.i, { t: b.t, ...cellCenter(b) }]));
    this.t = 0; this.w = 0; this.phase = 'prep'; this.timer = RAID.prep; this.pool = null; this.carry = 0;
    this.core = 100; this.done = false; this.result = null; this.killed = 0; this.threat = 0; this.reward = { cr: 0, clout: 0, parts: 0 };
    this.mines = new Map(this.def.traps.filter((x) => x.t === 'mines').map((x) => [x.id, x.charges]));
    this.maxHp = new Map(state.b.map((b) => [b.i, hpMax(b)]));
    this.wasWrecked = new Set(state.b.filter(wrecked).map((b) => b.i));
  }
  at(r) { return { x: Math.cos(this.ang) * r, z: Math.sin(this.ang) * r }; }
  alive(id) { return (this.hp.get(id) ?? 0) > 0; }
  startWave() {
    this.w += 1;
    const plan = planWave(this.w, this.W, this.P);
    if (plan.boss) { plan.tank += 3; plan.boss = 0; }   // no Behemoth on the homeworld: three more Blobs instead
    const p = poolOf(plan, this.level);
    if (this.carry > 0) { p.hp += this.carry; p.hp0 += this.carry; this.carry = 0; }
    p.r = RAID.spawnR; p.age = 0; p.mined = false;
    this.pool = p; this.phase = 'wave';
  }
  slowAt(pt) {
    let keep = 1;
    for (const c of this.def.towers) if (c.slow > 0 && this.alive(c.id) && Math.hypot(c.x - pt.x, c.z - pt.z) <= c.range) keep *= 1 - c.slow;
    return 1 - keep;
  }
  towerDps(c, pool) {
    const aid = this.aid || 1;   // >1 while the crew is on the homeworld helping (host sets it)
    if (c.t === 'tesla') return c.dps * aid * (1 + (c.chain - 1) * Math.min(1, pool.n / 10));
    return c.dps * aid;
  }
  /** damage the raiders deal this second to structures near `pt`: walls first, then towers / buildings, then the core */
  hit(pt, dmg) {
    const near = (arr, R) => arr.filter((s) => this.alive(s.id) && Math.hypot(s.x - pt.x, s.z - pt.z) <= R).sort((a, b) => Math.hypot(a.x - pt.x, a.z - pt.z) - Math.hypot(b.x - pt.x, b.z - pt.z));
    const all = [...this.info.entries()].map(([id, v]) => ({ id, ...v }));
    const walls = near(all.filter((s) => isWall(s.t)), 16);
    const rest = near(all.filter((s) => !isWall(s.t)), 20);
    let left = dmg; this.threat = 0;
    for (const s of [...walls, ...rest]) {
      if (left <= 0) break;
      const h = this.hp.get(s.id), take = Math.min(h, left);
      this.hp.set(s.id, h - take); left -= take; this.threat += 1;
    }
    if (left > 0) {
      // nothing left within reach of the raiders: they push further in towards the pad (the core), then hit it
      if (this.pool && this.pool.r > RAID.coreR) this.pool.r = Math.max(RAID.coreR, this.pool.r - RAID.speed);
      else { this.core = Math.max(0, this.core - left * 0.12); this.threat += 1; }
    }
  }
  step(dt = 1) {
    if (this.done) return;
    this.t += dt;
    if (this.phase === 'prep' || this.phase === 'lull') {
      this.timer -= dt;
      if (this.timer <= 0) { if (this.w >= this.W) this.finish(); else this.startWave(); }
      return;
    }
    const pool = this.pool;
    pool.age += dt;
    const pt0 = this.at(pool.r);
    if (pool.r > RAID.engageR) pool.r = Math.max(RAID.engageR, pool.r - RAID.speed * (1 - this.slowAt(pt0)) * dt);
    const pt = this.at(pool.r), engaged = pool.r <= RAID.engageR + 0.01;
    let dmg = 0;
    for (const c of this.def.towers) if (this.alive(c.id) && Math.hypot(c.x - pt.x, c.z - pt.z) <= c.range) dmg += this.towerDps(c, pool) * dt;
    if (engaged) {
      for (const s of this.def.traps) if (s.t === 'spikes' && this.alive(s.id) && Math.hypot(s.x - pt.x, s.z - pt.z) <= 12) dmg += s.dps * Math.min(1, pool.n / 5) * dt;
      if (!pool.mined) {
        pool.mined = true;
        for (const s of this.def.traps) if (s.t === 'mines' && this.alive(s.id) && (this.mines.get(s.id) || 0) > 0 && Math.hypot(s.x - pt.x, s.z - pt.z) <= 14) { dmg += s.burst * this.mines.get(s.id) * 0.5 * Math.min(1, pool.n / 6); this.mines.set(s.id, 0); }
      }
    }
    pool.hp -= dmg;
    if (pool.hp > 0 && engaged) this.hit(pt, pool.dps * RAID.dpsMul * Math.pow(Math.max(0, pool.hp) / pool.hp0, 0.8) * dt);
    else if (pool.hp <= 0) this.threat = 0;
    if (pool.hp <= 0) {
      this.killed += pool.n; this.pool = null;
      const q = this.P;
      this.reward.cr += Math.round(30 * q * (1 + 0.15 * this.w)); this.reward.parts += 1 + Math.ceil(this.w / 2); this.reward.clout += 1;
      this.phase = 'lull'; this.timer = RAID.lull;
      return;
    }
    if (pool.age >= RAID.waveCap && this.w < this.W) { this.carry = pool.hp; this.pool = null; this.phase = 'lull'; this.timer = 2; return; }
    if (this.core <= 0 || this.t >= RAID.hardCap) this.finish();
  }
  towerPct() {
    let a = 0, m = 0;
    for (const c of this.def.towers) { a += Math.max(0, this.hp.get(c.id) || 0); m += this.maxHp.get(c.id) || 1; }
    return m > 0 ? a / m : 1;
  }
  wreckedNow() { let n = 0; for (const [id, h] of this.hp) if (h <= 0 && !isWall(this.info.get(id).t) && !this.wasWrecked.has(id)) n++; return n; }
  frame() {
    return { t: Math.round(this.t), w: Math.min(this.w, this.W), W: this.W, raiders: this.pool ? Math.max(0, this.pool.hp / this.pool.hp0) : 0, tw: this.towerPct(), thr: this.threat, wr: this.wreckedNow(), core: this.core, phase: this.phase };
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const lost = [], wr = [];
    for (const [id, h] of this.hp) { const inf = this.info.get(id); if (h <= 0 && !this.wasWrecked.has(id)) { (isWall(inf.t) ? lost : wr).push(id); } }
    const cleared = this.w >= this.W && !this.pool && this.core > 0;
    const breached = !cleared || this.core <= 0 || wr.filter((id) => !isTower(this.info.get(id).t)).length >= 2;
    if (breached && !wr.length) {   // a lost raid always costs something: the most valuable machine gets trashed (never destroyed, only wrecked)
      const c = [...this.info.entries()].filter(([id, v]) => !isWall(v.t) && !isTower(v.t) && this.alive(id)).sort((a, b) => (this.maxHp.get(b[0]) || 0) - (this.maxHp.get(a[0]) || 0) || a[0] - b[0]);
      if (c.length) { const id = c[Math.floor(this.rng.next() * Math.min(2, c.length))][0]; this.hp.set(id, 0); wr.push(id); }
    }
    const kind = breached ? 'breached' : (wr.length || lost.length ? 'held' : 'repelled');
    this.result = { kind, waves: this.W, reached: this.w, wrecked: wr, lostWalls: lost, killed: this.killed, core: this.core, reward: breached ? { cr: 0, clout: 0, parts: 0 } : this.reward, hp: [...this.hp.entries()] };
  }
  run(maxSteps = 400) { let n = 0; while (!this.done && n++ < maxSteps) this.step(1); if (!this.done) this.finish(); return this.result; }
}
/** the host + the tests build the abstract raid through this (kept as a function so callers never depend on the class) */
export const makeRaid = (state, opts) => new RaidSim(state, opts);
/** write a finished raid back into the state: damage, stolen loot (breach only), rewards (paid by the caller), counters, mines rearmed */
export function applyRaidResult(state, res, day) {
  const hpMap = new Map(res.hp);
  for (const b of state.b) {
    const h = hpMap.get(b.i);
    if (h === undefined) continue;
    const mx = hpMax(b);
    if (h >= mx - 1e-6) delete b.h; else b.h = Math.max(0, Math.round(h));
  }
  const stolen = { cr: 0, parts: 0 };
  if (res.kind === 'breached') {
    stolen.cr = Math.floor(state.s.cr * 0.3); stolen.parts = Math.floor(state.s.parts * 0.2);
    state.s.cr -= stolen.cr; state.s.parts -= stolen.parts;
  } else {
    state.s.parts = Math.min(capOf(state, 'parts'), state.s.parts + res.reward.parts);
  }
  state.lastRaid = day;
  state.st[res.kind] = (state.st[res.kind] || 0) + 1;
  return stolen;
}
/** wave-clear bonus for a REPELLED raid, paid to the ship (credits) and the crew (Clout) */
export const raidBonus = (res, quotaIndex = 0) => (res.kind === 'breached' ? { cr: 0, clout: 0 } : { cr: Math.round((60 + 25 * quotaIndex) * (1 + 0.1 * res.waves) * (res.kind === 'repelled' ? 1 : 0.5)) + res.reward.cr, clout: 6 + 2 * quotaIndex + res.reward.clout });
