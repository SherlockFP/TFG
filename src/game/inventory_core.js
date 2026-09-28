// Inventory core (pure logic, no DOM / three.js): grid sizes, item footprints, placement, packing, validation,
// equipment bonuses and carried weight. Used by the host (authoritative validation of 'inv' requests), the client
// (prediction + the I panel) and node tests. Everything works on plain entries:
//   entry = { id, def, inv, tier?, it? }   inv = null (hotbar) | { k: 'bag', x, y } | { k: 'eq', s: EQUIP_SLOTS[i] }
import { TIERS, tierDef, tierIndex, tierOfItem } from './tiers.js';

/** No bag equipped: a few pockets. */
export const POCKETS = Object.freeze({ id: null, cols: 4, rows: 2, weightMul: 1, speed: 0 });
export const EQUIP_SLOTS = Object.freeze(['armor', 'trinket1', 'trinket2', 'bag']);
export const SLOT_KIND = Object.freeze({ armor: 'armor', trinket1: 'trinket', trinket2: 'trinket', bag: 'bag' });
export const SLOT_LABEL = Object.freeze({ armor: 'Suit / Armor', trinket1: 'Trinket I', trinket2: 'Trinket II', bag: 'Bag' });
/** extra bag columns from the passive tree (game.rpg.bonus('bagSlots')) are clamped to this */
export const MAX_EXTRA_COLS = 4;
/** hotbar hard cap the host allows (config.inventorySlots + Pack Mule perk; the client knows the exact number) */
export const MAX_HOTBAR = 6;
/** Rolled tiers multiply scrap value by TIERS[t].valueMul * TIER_VALUE_NORM. The norm keeps the average loot value
 *  at luck 0 equal to the pre-tier economy (E[valueMul] = 1.186 at luck 0 -> 1.186 * 0.85 ~= 1.0). Luck (moon danger,
 *  Lucky Dongle, balance module) pushes the average above 1. */
export const TIER_VALUE_NORM = 0.85;
/** loot luck sources (added, then clamped to 0..MAX_LUCK) */
export const MAX_LUCK = 1;
export const MOON_LUCK_PER_DANGER = 0.05;   // (danger - 1) * this, danger = moon tier + quotaIndex * 0.35
export const MOON_LUCK_CAP = 0.35;
export const CREW_LUCK_CAP = 0.3;

const KINDS_WITH_ROLLED_TIER = new Set(['scrap', 'drop', 'big']);
const GEAR_KINDS = new Set(['armor', 'trinket']);

export const clampInt = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : lo);

/** Grid + carry rules of a bag definition (or the pockets when def is null / not a bag). */
export function bagInfo(def) {
  const b = def && def.kind === 'bag' && def.bag;
  if (!b) return POCKETS;
  return { id: def.id, cols: clampInt(b.cols, 1, 12), rows: clampInt(b.rows, 1, 10), weightMul: Number.isFinite(b.weightMul) ? b.weightMul : 1, speed: Number(b.speed) || 0 };
}
/** Final grid for a player: the equipped bag (or pockets) + extra columns from the passive tree. */
export function gridFor(bagDef, extraCols = 0) {
  const b = bagInfo(bagDef);
  return { ...b, cols: b.cols + clampInt(extraCols, 0, MAX_EXTRA_COLS) };
}

/** Cells an item occupies in the bag grid: small 1x1, medium (weight >= 10) 1x2, two-handed 2x2. null = can't be bagged. */
export function itemSize(def) {
  if (!def) return null;
  if (def.kind === 'big' || def.kind === 'body' || def.id === 'body' || def.hands === 0 || def.noBag) return null;
  if (def.size && Number.isFinite(def.size[0]) && Number.isFinite(def.size[1])) return { w: clampInt(def.size[0], 1, 3), h: clampInt(def.size[1], 1, 3) };
  if (def.hands === 2) return { w: 2, h: 2 };
  if ((def.weight || 0) >= 10) return { w: 1, h: 2 };
  return { w: 1, h: 1 };
}

/** Why a world item (or entry-like { def, type, soulbound, ladder, carrier }) can't go into a bag; null = it can. */
export function bagRejectReason(it) {
  const d = it?.def;
  if (!d) return 'Unknown item.';
  if (!itemSize(d)) return d.kind === 'big' ? 'Too big for a bag. Carry it with the grab beam.' : 'That does not fit in a bag.';
  if (it.type === 'body') return 'That does not fit in a bag.';
  if (d.special) return 'It is humming. It will not fit in a bag.';
  if (d.hot) return 'It is way too hot to stash.';
  if (d.cursed) return 'The letter refuses to be put away.';
  if (it.ladder) return 'Fold the ladder first.';
  if (it.carrier) return 'Out of reach.';
  return null;
}

/** Can this item go into equipment slot s? */
export function fitsSlot(def, s) {
  const k = SLOT_KIND[s];
  return !!k && !!def && def.kind === k;
}
/** First equipment slot for an item (trinkets: the first free trinket slot, else trinket1). */
export function slotFor(def, occupied = {}) {
  if (!def) return null;
  if (def.kind === 'armor') return 'armor';
  if (def.kind === 'bag') return 'bag';
  if (def.kind === 'trinket') return !occupied.trinket1 ? 'trinket1' : !occupied.trinket2 ? 'trinket2' : 'trinket1';
  return null;
}
export const isEquippable = (def) => !!def && (def.kind === 'armor' || def.kind === 'trinket' || def.kind === 'bag');

/** Sanitize an inventory location from the network / saves. */
export function normalizeInv(iv) {
  if (!iv || typeof iv !== 'object') return null;
  if (iv.k === 'bag') return { k: 'bag', x: clampInt(iv.x, 0, 15), y: clampInt(iv.y, 0, 15) };
  if (iv.k === 'eq' && EQUIP_SLOTS.includes(iv.s)) return { k: 'eq', s: iv.s };
  return null;
}
export const sameInv = (a, b) => (!a && !b) || (!!a && !!b && a.k === b.k && (a.k === 'eq' ? a.s === b.s : a.x === b.x && a.y === b.y));

// ------------------------------------------------------------------ grid placement
/** Occupancy grid (array of ids, '' = free). Returns null when entries overlap / leave the grid. */
export function buildOcc(entries, grid, ignoreId = null) {
  const occ = new Array(grid.cols * grid.rows).fill('');
  for (const e of entries) {
    if (!e.inv || e.inv.k !== 'bag' || e.id === ignoreId) continue;
    const s = itemSize(e.def);
    if (!s) return null;
    const { x, y } = e.inv;
    if (x < 0 || y < 0 || x + s.w > grid.cols || y + s.h > grid.rows) return null;
    for (let j = y; j < y + s.h; j++) for (let i = x; i < x + s.w; i++) {
      const k = j * grid.cols + i;
      if (occ[k]) return null;
      occ[k] = e.id;
    }
  }
  return occ;
}
export function fitsAt(occ, grid, size, x, y) {
  if (!occ || !size || x < 0 || y < 0 || x + size.w > grid.cols || y + size.h > grid.rows) return false;
  for (let j = y; j < y + size.h; j++) for (let i = x; i < x + size.w; i++) if (occ[j * grid.cols + i]) return false;
  return true;
}
/** ids overlapping a size-w×h footprint at x,y (for swap / hover highlighting) */
export function overlapIds(occ, grid, size, x, y) {
  const out = new Set();
  if (!occ || !size) return out;
  for (let j = Math.max(0, y); j < Math.min(grid.rows, y + size.h); j++) for (let i = Math.max(0, x); i < Math.min(grid.cols, x + size.w); i++) {
    const id = occ[j * grid.cols + i];
    if (id) out.add(id);
  }
  return out;
}
/** First free spot (row-major, top-left first) for a size in a grid with the given entries. */
export function findSpot(entries, grid, size, ignoreId = null) {
  if (!size) return null;
  const occ = buildOcc(entries, grid, ignoreId);
  if (!occ) return null;
  for (let y = 0; y + size.h <= grid.rows; y++) for (let x = 0; x + size.w <= grid.cols; x++) if (fitsAt(occ, grid, size, x, y)) return { x, y };
  return null;
}

/** Sort order: big footprints first, then tier (high first), then kind, then value (high first), then name. */
export function sortCompare(a, b) {
  const sa = itemSize(a.def) || { w: 1, h: 1 }, sb = itemSize(b.def) || { w: 1, h: 1 };
  const da = sb.w * sb.h - sa.w * sa.h;
  if (da) return da;
  if (sb.h !== sa.h) return sb.h - sa.h;
  const ta = tierIndex(b.tier || 'common') - tierIndex(a.tier || 'common');
  if (ta) return ta;
  const ka = String(a.def?.kind || '').localeCompare(String(b.def?.kind || ''));
  if (ka) return ka;
  const va = (b.value || 0) - (a.value || 0);
  if (va) return va;
  return String(a.def?.name || a.id).localeCompare(String(b.def?.name || b.id));
}
/**
 * Pack entries into a grid (Tetris-style first fit, column-major so tall items stack neatly on the left).
 * Returns Map id -> { k:'bag', x, y } or null when they don't all fit.
 */
export function packLayout(entries, grid, compare = sortCompare) {
  const list = entries.slice().sort(compare);
  const placed = [];
  const out = new Map();
  for (const e of list) {
    const s = itemSize(e.def);
    if (!s) return null;
    const occ = buildOcc(placed, grid);
    let spot = null;
    for (let x = 0; x + s.w <= grid.cols && !spot; x++) for (let y = 0; y + s.h <= grid.rows; y++) if (fitsAt(occ, grid, s, x, y)) { spot = { x, y }; break; }
    if (!spot) return null;
    const inv = { k: 'bag', x: spot.x, y: spot.y };
    placed.push({ ...e, inv });
    out.set(e.id, inv);
  }
  return out;
}

export function usedCells(entries) {
  let n = 0;
  for (const e of entries) if (e.inv?.k === 'bag') { const s = itemSize(e.def); if (s) n += s.w * s.h; }
  return n;
}

/** The equipped bag entry in a list (or null). */
export const bagEntryOf = (list) => list.find((e) => e.inv?.k === 'eq' && e.inv.s === 'bag') || null;
export const gridOfList = (list, extraCols = 0) => gridFor(bagEntryOf(list)?.def || null, extraCols);

/**
 * Validate a player's complete inventory (every item they hold, after the requested moves).
 * Returns null when valid, else a short reason string.
 */
export function validateState(list, { extraCols = 0, maxHot = MAX_HOTBAR } = {}) {
  const eq = {};
  let hot = 0;
  for (const e of list) {
    if (!e.inv) { hot++; continue; }
    if (e.inv.k === 'eq') {
      if (eq[e.inv.s]) return 'slot taken';
      if (!fitsSlot(e.def, e.inv.s)) return 'wrong slot';
      eq[e.inv.s] = e.id;
    } else if (e.inv.k === 'bag') {
      if (bagRejectReason(e.it || { def: e.def, type: e.def?.id })) return 'not baggable';
    } else return 'bad location';
  }
  if (hot > maxHot) return 'hotbar full';
  const grid = gridOfList(list, extraCols);
  if (!buildOcc(list, grid)) return 'does not fit';
  return null;
}

/** Apply moves [[id, inv]] to a list of entries (returns new entries; unknown ids are ignored). */
export function applyMoves(list, moves) {
  const m = new Map();
  for (const [id, iv] of moves || []) m.set(id, normalizeInv(iv));
  return list.map((e) => (m.has(e.id) ? { ...e, inv: m.get(e.id) } : e));
}

// ------------------------------------------------------------------ tiers
export const tierStat = (tier) => tierDef(tier).statMul;
/** Does a freshly spawned item of this def get a rolled tier? (store gear stays common; opts.rollTier forces) */
export function rollsTier(def, opts = {}) {
  if (!def) return false;
  if (def.tier || def.component || def.keyItem || def.special || def.id === 'key' || def.id === 'body') return false;   // fixed tier / never tiered
  if (opts.rollTier) return true;
  if (KINDS_WITH_ROLLED_TIER.has(def.kind)) return true;
  if (GEAR_KINDS.has(def.kind)) return opts.valueMul !== undefined;   // loot context (populate passes valueMul)
  return false;
}
/** Tier of an entry: explicit it.tier / affix / def tier / value fallback (tiers.js tierOfItem). */
export const entryTier = (it, def) => tierOfItem(it, def);

/** Host loot luck: balance module + moon danger + the crew's Lucky Dongles. */
export function lootLuck({ balance = 0, danger = 1, crewLuck = 0 } = {}) {
  const moon = Math.min(MOON_LUCK_CAP, Math.max(0, (Number(danger) || 1) - 1) * MOON_LUCK_PER_DANGER);
  const crew = Math.min(CREW_LUCK_CAP, Math.max(0, Number(crewLuck) || 0));
  return Math.min(MAX_LUCK, Math.max(0, (Number(balance) || 0) + moon + crew));
}
/** Expected valueMul of a tier roll at a luck (for docs / balance). */
export function expectedValueMul(luck = 0) {
  let w = 0, v = 0;
  Object.values(TIERS).forEach((T, i) => { const ww = T.weight * Math.pow(1 + luck * 2.5, i); w += ww; v += ww * T.valueMul; });
  return v / w;
}

// ------------------------------------------------------------------ equipment effects
/**
 * Stat bonuses from equipped gear (entries with inv.k === 'eq'). Gear defs carry `gear: { armor, speed, luck, crit,
 * stamina, regenPct, scan, battery }`, scaled by the item's tier statMul (speed penalties are not scaled).
 */
export function equipBonuses(list) {
  const b = { armor: 0, speed: 0, luck: 0, crit: 0, stamina: 0, regenPct: 0, scan: 0, battery: 0 };
  for (const e of list) {
    if (e.inv?.k !== 'eq') continue;
    const g = e.def?.gear;
    const mul = tierStat(e.tier || entryTier(e.it, e.def));
    if (g) for (const k of Object.keys(b)) if (g[k]) b[k] += k === 'speed' ? g[k] : g[k] * mul;
    if (e.def?.kind === 'bag') b.speed += bagInfo(e.def).speed || 0;
  }
  return b;
}

/** Extra carried weight of stashed + equipped items (hotbar items are counted by LocalPlayer.carryWeight). */
export function stashedWeight(list, extraCols = 0) {
  const grid = gridOfList(list, extraCols);
  let w = 0;
  for (const e of list) {
    if (!e.inv) continue;
    const base = (e.def?.weight || 0) + (e.it?.extraWeight || 0);
    w += e.inv.k === 'bag' ? base * grid.weightMul : base;
  }
  return w;
}
