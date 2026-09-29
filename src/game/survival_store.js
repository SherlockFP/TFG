// SURVIVAL storage + structures (pure rules, no DOM / three.js). Crates hold compact item RECORDS (not world items): depositing removes the
// item from the world, withdrawing spawns it again with the same tier / value / battery / affix / forge / durability. Grid rules come from
// inventory_core.js (same footprints as the player's bag), so the panel can show both grids side by side.
//   struct = { id, k: 'crate' | 'planter' | 'brew' | 'stove' | 'fire', w: 'ship' | 'home' | 'moon', x, y, z, yaw, ver, b?: built-in, ... }
//   crate  = struct + { t: 1..3, lab, col, n (next record id), it: [record] }   record = { u, i: type, x, y, v?, bv?, tr?, b?, c?, af?, pl?, oc?, du?, dr?, col? }
//   planter = struct + { cells: [crop | null] x3 }     crop = { k: plant, t, p, wet }   (survival_data.js growTick)
//   brew   = struct + { job: null | { type, tr, done (wall ms) } }     fire = struct + { until (wall ms) } (moon only, never saved)
import { ITEMS } from './items.js';
import { itemSize, bagRejectReason, buildOcc, fitsAt, findSpot, packLayout, sortCompare, clampInt } from './inventory_core.js';
import { TIERS } from './tiers.js';
import { PLANTS } from './survival_data.js';
import { crateMax } from './difficulty.js';

export const CRATE_TIERS = {
  1: { id: 'wood', name: 'Wooden Crate', cols: 6, rows: 3, item: 'sv_crate1', size: [1.0, 0.7, 0.7] },
  2: { id: 'metal', name: 'Metal Crate', cols: 8, rows: 4, item: 'sv_crate2', size: [1.1, 0.85, 0.75] },
  3: { id: 'secure', name: 'Secure Crate', cols: 10, rows: 5, item: 'sv_crate3', size: [1.2, 0.95, 0.8] },
};
export const CRATE_COLORS = ['#c9a06a', '#d24a3a', '#e0a030', '#4aa860', '#3a7fd0', '#9a5ad0', '#e8e4dc'];
export const LABEL_MAX = 12;
export const PLANTER_CELLS = 3;
export const PLANTER_SIZE = [1.5, 0.42, 0.62];
export const STAND_SIZE = [0.9, 1.1, 0.6];
/** per place ('ship' | 'home'): how many of each structure a crew may place (the built-in ones count too) */
export const MAX_STRUCTS = { crate: 6, planter: 3, brew: 2 };
export const SPACING = 1.15;   // min distance between two structure centres
export const BUILTIN = { crate: 'ship0', planter: 'ship1' };

export const crateGrid = (t) => { const c = CRATE_TIERS[clampInt(t, 1, 3)]; return { cols: c.cols, rows: c.rows, weightMul: 1, speed: 0 }; };

// ------------------------------------------------------------------------------------------------ records
/** Why an item can't go into a crate (null = it can). `it` = a WorldItem or { type, def, soulbound, bag, ladder, carrier }. */
export function storeReject(it) {
  if (!it) return 'Unknown item.';
  const def = it.def || ITEMS[it.type];
  if (!def) return 'Unknown item.';
  if (it.soulbound) return 'Soulbound items cannot be stored.';
  if (it.bag?.length) return 'Empty the bag first.';
  const why = bagRejectReason({ ...it, def, type: it.type });
  if (why) return why;
  return null;
}
/** compact record of a world item (host) */
export function recordFromItem(it, u = 0) {
  const r = { u, i: it.type, x: 0, y: 0 };
  if (it.value) r.v = Math.round(it.value);
  if (it.baseValue && it.baseValue !== it.value) r.bv = Math.round(it.baseValue);
  if (it.tier) r.tr = it.tier;
  if (it.battery != null) r.b = Math.round(it.battery * 10) / 10;
  if (it.charges != null) r.c = it.charges;
  if (it.affix) r.af = it.affix;
  if (it.plus) r.pl = it.plus;
  if (it.oc?.length) r.oc = [...it.oc];
  if (it.dur != null) r.du = Math.round(it.dur * 10) / 10;
  if (it.dr) r.dr = it.dr;
  if (it.collected) r.col = 1;
  return r;
}
/** hostSpawn options that restore a record */
export function spawnOpts(r) {
  const o = {};
  if (r.v != null) o.value = r.v;
  if (r.bv != null) o.baseValue = r.bv;
  if (r.tr && TIERS[r.tr]) o.tier = r.tr;
  if (r.b != null) o.battery = r.b;
  if (r.c != null) o.charges = r.c;
  if (r.af) o.af = r.af;
  if (r.pl) o.plus = r.pl;
  if (r.oc) o.oc = r.oc;
  if (r.du != null) o.dur = r.du;
  if (r.dr) o.dr = r.dr;
  if (r.col) o.col = 1;
  return o;
}
/** inventory_core-style entries of a crate (id 'r<u>') */
export function entriesOf(crate) {
  const out = [];
  for (const r of crate.it || []) {
    const def = ITEMS[r.i];
    if (!def) continue;
    out.push({ id: 'r' + r.u, def, inv: { k: 'bag', x: r.x, y: r.y }, tier: r.tr || def.tier || 'common', value: r.v || 0, rec: r });
  }
  return out;
}
export const sizeOfType = (ty) => itemSize(ITEMS[ty]) || null;
export const usedCells = (crate) => (crate.it || []).reduce((n, r) => { const s = sizeOfType(r.i); return n + (s ? s.w * s.h : 0); }, 0);
export const capacity = (crate) => { const g = crateGrid(crate.t); return g.cols * g.rows; };

/** Add a record (in place). x / y optional (first free spot). Returns { ok, reason, rec }. */
export function putRecord(crate, rec, x = null, y = null, keepU = false) {
  const def = ITEMS[rec.i];
  const size = itemSize(def);
  if (!def || !size) return { ok: false, reason: 'That does not fit in a bag.' };
  const grid = crateGrid(crate.t);
  const list = entriesOf(crate);
  const occ = buildOcc(list, grid);
  if (!occ) return { ok: false, reason: 'Does not fit there.' };
  let at = null;
  if (Number.isFinite(x) && Number.isFinite(y) && fitsAt(occ, grid, size, x | 0, y | 0)) at = { x: x | 0, y: y | 0 };
  else at = findSpot(list, grid, size);
  if (!at) return { ok: false, reason: 'The crate is full.' };
  const u = keepU && rec.u > 0 ? rec.u : (crate.n = (crate.n | 0) + 1);
  crate.n = Math.max(crate.n | 0, u);
  const out = { ...rec, u, x: at.x, y: at.y };
  (crate.it || (crate.it = [])).push(out);
  crate.ver = (crate.ver | 0) + 1;
  return { ok: true, rec: out };
}
/** Remove a record by u. Returns it or null. */
export function takeRecord(crate, u) {
  const i = (crate.it || []).findIndex((r) => r.u === u);
  if (i < 0) return null;
  const [r] = crate.it.splice(i, 1);
  crate.ver = (crate.ver | 0) + 1;
  return r;
}
/** Move a record inside the crate (drag in the grid). */
export function moveRecord(crate, u, x, y) {
  const r = (crate.it || []).find((q) => q.u === u);
  if (!r) return { ok: false, reason: 'Nothing there.' };
  const size = sizeOfType(r.i);
  const grid = crateGrid(crate.t);
  const occ = buildOcc(entriesOf(crate).filter((e) => e.rec !== r), grid);
  if (!occ || !fitsAt(occ, grid, size, x | 0, y | 0)) return { ok: false, reason: 'Does not fit there.' };
  r.x = x | 0; r.y = y | 0;
  crate.ver = (crate.ver | 0) + 1;
  return { ok: true };
}
/** Repack the crate: big / high tier first. Returns true when it changed anything. */
export function sortCrate(crate) {
  const list = entriesOf(crate);
  const lay = packLayout(list, crateGrid(crate.t), sortCompare);
  if (!lay) return false;
  let ch = false;
  for (const e of list) { const p = lay.get(e.id); if (p && (p.x !== e.rec.x || p.y !== e.rec.y)) { e.rec.x = p.x; e.rec.y = p.y; ch = true; } }
  if (ch) crate.ver = (crate.ver | 0) + 1;
  return ch;
}
/** Every record moved out (host 'take all'): [records]; the crate is left empty. */
export function emptyCrate(crate) { const out = crate.it || []; crate.it = []; crate.ver = (crate.ver | 0) + 1; return out; }

// ------------------------------------------------------------------------------------------------ structures
const cleanColor = (c) => (CRATE_COLORS.includes(c) ? c : CRATE_COLORS[0]);
const cleanLabel = (s) => String(s ?? '').replace(/[^\p{L}\p{N} .,+\-_!?#]/gu, '').trim().slice(0, LABEL_MAX).trim();
export const sanitizeLabel = cleanLabel;
export const sanitizeColor = cleanColor;
const fin = (n, d = 0) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : d);

export function newStruct(kind, id, where, pos, yaw, opts = {}) {
  const s = { id, k: kind, w: where === 'home' ? 'home' : where === 'moon' ? 'moon' : 'ship', x: fin(pos.x), y: fin(pos.y), z: fin(pos.z), yaw: fin(yaw), ver: 1 };
  if (opts.builtin) s.b = 1;
  if (kind === 'crate') Object.assign(s, { t: clampInt(opts.tier ?? 1, 1, 3), lab: cleanLabel(opts.lab || ''), col: cleanColor(opts.col), n: 0, it: [] });
  else if (kind === 'planter') s.cells = new Array(PLANTER_CELLS).fill(null);
  else if (kind === 'brew') s.job = null;
  else if (kind === 'fire') s.until = Number(opts.until) || 0;
  return s;
}
/** Clean a struct that came from a save / the network. Drops unknown items, repacks a crate that no longer fits. Returns null when unusable. */
export function sanitizeStruct(s) {
  if (!s || typeof s !== 'object' || !/^[a-z0-9_]{1,12}$/i.test(String(s.id || ''))) return null;
  if (!['crate', 'planter', 'brew', 'stove', 'fire'].includes(s.k)) return null;
  const o = { id: String(s.id), k: s.k, w: s.w === 'home' ? 'home' : s.w === 'moon' ? 'moon' : 'ship', x: fin(s.x), y: fin(s.y), z: fin(s.z), yaw: fin(s.yaw), ver: s.ver | 0 };
  if (s.b) o.b = 1;
  if (s.k === 'crate') {
    o.t = clampInt(s.t, 1, 3); o.lab = cleanLabel(s.lab); o.col = cleanColor(s.col); o.n = s.n | 0; o.it = [];
    const seen = new Set();
    for (const r of Array.isArray(s.it) ? s.it : []) {
      if (!r || !ITEMS[r.i] || !itemSize(ITEMS[r.i]) || seen.has(r.u)) continue;
      seen.add(r.u);
      o.n = Math.max(o.n, r.u | 0);
      const c = { u: r.u | 0, i: String(r.i), x: r.x | 0, y: r.y | 0 };
      for (const k of ['v', 'bv', 'b', 'c', 'du', 'dr', 'sd', 'sp']) if (Number.isFinite(r[k])) c[k] = r[k];
      if (typeof r.tr === 'string' && TIERS[r.tr]) c.tr = r.tr;
      if (typeof r.af === 'object' && r.af) c.af = r.af;
      if (Number.isFinite(r.pl) && r.pl > 0) c.pl = r.pl | 0;
      if (Array.isArray(r.oc)) c.oc = r.oc.filter((x) => typeof x === 'string').slice(0, 4);
      if (r.col) c.col = 1;
      o.it.push(c);
    }
    // anything overlapping / outside the grid gets re-placed
    const grid = crateGrid(o.t);
    if (!buildOcc(entriesOf(o), grid)) {
      const all = o.it;
      o.it = [];
      for (const c of all) putRecord(o, c, c.x, c.y, true);
    }
  } else if (s.k === 'planter') {
    o.cells = new Array(PLANTER_CELLS).fill(null);
    for (let i = 0; i < PLANTER_CELLS; i++) {
      const c = s.cells?.[i];
      if (c && PLANTS[c.k] && Number.isFinite(c.t)) o.cells[i] = { k: c.k, t: c.t, p: Math.min(1, Math.max(0, Number(c.p) || 0)), wet: Number(c.wet) || 0 };
    }
  } else if (s.k === 'fire') {
    o.until = Number(s.until) || 0;
  } else if (s.k === 'brew') {
    o.job = s.job && typeof s.job === 'object' && s.job.type && ITEMS[s.job.type] ? { type: String(s.job.type), tr: TIERS[s.job.tr] ? s.job.tr : 'uncommon', done: Number(s.job.done) || 0 } : null;
  }
  return o;
}
export const structsOf = (list, where) => (list || []).filter((s) => s && s.w === where);
/** can a structure of `kind` go at (x, z)? existing = the structs of the same place (incl. built-in fixtures as { x, z }). Returns null or a reason. */
export function placeReject(kind, x, z, existing) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Nowhere to put it.';
  const same = existing.filter((s) => s.k === kind && !s.fixture).length;
  const max = kind === 'crate' ? Math.min(MAX_STRUCTS.crate, crateMax()) : MAX_STRUCTS[kind];   // [hardmode] 6 / 5 / 4 crates from quota 3
  if (max != null && same >= max) return 'No room for another one here.';
  for (const s of existing) if (Math.hypot(s.x - x, s.z - z) < SPACING) return 'Too close to something else.';
  return null;
}
export const isEmptyStruct = (s) => (s.k === 'stove' ? false : s.k === 'fire' ? false : s.k === 'crate' ? !(s.it || []).length : s.k === 'planter' ? !(s.cells || []).some(Boolean) : !s.job);
