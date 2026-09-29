// EGGS (wave 4, module 'eggs'; docs/wave4/eggs.md): pure rules for the easter-egg system. No THREE / DOM / game access: node-tested by
// tools/harness/eggs.test.mjs. Used by src/ui/menueggs.js (main-menu Content Review Cell), src/game/eggs.js (moons / facilities).
//
//   profile.eggs = { v:1, found:{ id: 1 }, n:{ mug, duck, call }, flags:{ panel, maestro, ... }, meta:0|1 }   (localStorage via saveProfile)
//
// META-SECRET "THE LAST APPEAL" (multi-step, spans the menu room and the maps):
//   1. cassette  (menu)   the Janitor's tape: he hid three things on the moons
//   2. crt       (menu)   channel 7 shows the wall-knock rhythm
//   3. diary     (maps)   the previous crew's diary
//   4. statue    (maps)   the frozen employee
//   5. ducks     (menu + maps) three rubber ducks
//   final: knock the rhythm on the cell wall (opens the hatch), then look inside -> title + hat.
import { RNG, hashString } from '../core/rng.js';

export const EGG_VERSION = 1;
export const MENU_EGGS = ['cassette', 'crt', 'drawer', 'mug', 'knock', 'poster', 'phone', 'piano', 'duck0', 'lamp'];
export const MAP_EGGS = ['graffiti', 'shrine', 'vending', 'diary', 'duck', 'statue', 'payphone', 'stash'];
export const META_ID = 'lastappeal';
export const ALL_EGGS = [...MENU_EGGS, ...MAP_EGGS, META_ID];
export const TOTAL_EGGS = ALL_EGGS.length;
export const IS_EGG = new Set(ALL_EGGS);
export const META_TITLE = 'Cell 07 Alumnus';
export const META_HAT = 'crthead';
export const DUCKS_NEEDED = 3;
export const MUG_UNLOCK = 50;
export const KNOCK_PATTERN = 'SSLS';          // tap tap tap ... tap tap  (S = short gap, L = long gap between taps)
export const LAMP_CLICKS = 5;                 // lamp toggled this often inside LAMP_WINDOW seconds
export const LAMP_WINDOW = 4;
export const POSTER_FRAMES = 5;               // the rotating poster; frame POSTER_SECRET shows the wanted notice
export const POSTER_SECRET = 3;
export const POSTER_PERIOD = 5;               // seconds per frame
export const PIANO_TUNE = { id: 'algo', pcs: [2, 4, 5, 7, 9, 7, 5, 4] };   // D E F G A G F E: the Algorithm hums when it thinks nobody listens

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : 0);

// ---------------------------------------------------------------------------------------------------------------- profile
/** Repair / create profile.eggs (garbage-proof: a corrupted save must never brick the menu). Mutates + returns the eggs object. */
export function ensureEggs(p) {
  if (!p || typeof p !== 'object') return null;
  const raw = p.eggs && typeof p.eggs === 'object' && !Array.isArray(p.eggs) ? p.eggs : {};
  const e = { v: EGG_VERSION, found: {}, n: { mug: 0, duck: 0, call: 0 }, flags: {}, meta: 0 };
  if (raw.found && typeof raw.found === 'object') for (const id of ALL_EGGS) if (raw.found[id]) e.found[id] = 1;
  if (raw.n && typeof raw.n === 'object') for (const k of ['mug', 'duck', 'call']) e.n[k] = num(raw.n[k], 0, 1e6);
  if (raw.flags && typeof raw.flags === 'object') for (const k of Object.keys(raw.flags).slice(0, 16)) if (/^[a-z0-9_]{1,16}$/.test(k) && raw.flags[k]) e.flags[k] = 1;
  e.meta = e.found[META_ID] ? 1 : 0;
  p.eggs = e;
  return e;
}
export const has = (p, id) => !!ensureEggs(p)?.found[id];
export const foundCount = (p) => { const e = ensureEggs(p); return e ? ALL_EGGS.filter((id) => e.found[id]).length : 0; };
/** mark an egg found; true when it is new */
export function discover(p, id) {
  const e = ensureEggs(p);
  if (!e || !IS_EGG.has(id) || e.found[id]) return false;
  e.found[id] = 1;
  return true;
}
export function bump(p, key, by = 1) {
  const e = ensureEggs(p);
  if (!e || !(key in e.n)) return 0;
  e.n[key] = num(e.n[key] + by, 0, 1e6);
  return e.n[key];
}
export function setFlag(p, key, on = true) { const e = ensureEggs(p); if (!e || !/^[a-z0-9_]{1,16}$/.test(key)) return false; if (on) e.flags[key] = 1; else delete e.flags[key]; return true; }
export const flag = (p, key) => !!ensureEggs(p)?.flags[key];

// ---------------------------------------------------------------------------------------------------------------- meta secret
export const META_STEPS = [
  { id: 'tape', test: (e) => !!e.found.cassette },
  { id: 'code', test: (e) => !!e.found.crt },
  { id: 'diary', test: (e) => !!e.found.diary },
  { id: 'statue', test: (e) => !!e.found.statue },
  { id: 'ducks', test: (e) => e.n.duck >= DUCKS_NEEDED },
];
export function metaProgress(p) {
  const e = ensureEggs(p);
  return META_STEPS.map((s) => ({ id: s.id, done: !!e && s.test(e) }));
}
export const metaReady = (p) => metaProgress(p).every((s) => s.done);
/**
 * The last step: looking inside the opened hatch. Grants the unique title + hat once.
 * Returns { ok, isNew, missing:[stepIds] }.
 */
export function claimMeta(p) {
  const e = ensureEggs(p);
  if (!e) return { ok: false, isNew: false, missing: META_STEPS.map((s) => s.id) };
  const missing = metaProgress(p).filter((s) => !s.done).map((s) => s.id);
  if (missing.length) return { ok: false, isNew: false, missing };
  const isNew = discover(p, META_ID);
  e.meta = 1;
  if (!Array.isArray(p.titles)) p.titles = [];
  if (!p.titles.includes(META_TITLE)) p.titles.push(META_TITLE);
  if (!p.title) p.title = META_TITLE;
  if (!p.cosmetics || typeof p.cosmetics !== 'object') p.cosmetics = { suits: ['orange'], hats: ['none'] };
  if (!Array.isArray(p.cosmetics.hats)) p.cosmetics.hats = ['none'];
  if (!p.cosmetics.hats.includes(META_HAT)) p.cosmetics.hats.push(META_HAT);
  return { ok: true, isNew, missing: [] };
}

// ---------------------------------------------------------------------------------------------------------------- menu helpers
/** wall-knock detector: push(now) on every knock; returns true when the rhythm matches. Gap < 0.5 s = S, 0.5..1.6 s = L, longer = restart. */
export class KnockMatcher {
  constructor(pattern = KNOCK_PATTERN) { this.pattern = pattern; this.gaps = ''; this.last = -99; }
  push(now) {
    const d = now - this.last;
    this.last = now;
    if (d > 1.6) this.gaps = '';
    else this.gaps += d < 0.5 ? 'S' : 'L';
    if (this.gaps.length > 12) this.gaps = this.gaps.slice(-12);
    if (this.gaps.endsWith(this.pattern)) { this.gaps = ''; return true; }
    return false;
  }
}
/** counts lamp toggles inside a time window */
export class ClickBurst {
  constructor(n = LAMP_CLICKS, win = LAMP_WINDOW) { this.n = n; this.win = win; this.ts = []; }
  push(now) {
    this.ts.push(now);
    while (this.ts.length && now - this.ts[0] > this.win) this.ts.shift();
    if (this.ts.length >= this.n) { this.ts.length = 0; return true; }
    return false;
  }
}
export const posterFrame = (time) => Math.floor(Math.max(0, time) / POSTER_PERIOD) % POSTER_FRAMES;
/** mug milestones: returns the milestone crossed by this sip (10 / 25 / 50) or 0 */
export const mugMilestone = (n) => (n === 10 || n === 25 || n === MUG_UNLOCK ? n : 0);
/** should the phone give the secret call? (3rd answered call ever, then 1 in 8) rnd = () => [0,1) */
export function phoneSpecial(callsBefore, rnd) { return callsBefore === 2 || (callsBefore > 2 && rnd() < 0.125); }

// ---------------------------------------------------------------------------------------------------------------- map placement
/** kinds: where they may spawn + weight. Facility = interior; outdoor = surface of a moon. */
export const KINDS = {
  graffiti: { w: 3, where: ['outdoor', 'facility'] },
  shrine: { w: 2, where: ['outdoor'] },
  vending: { w: 1.5, where: ['facility'] },
  diary: { w: 2, where: ['outdoor', 'facility'] },
  statue: { w: 1.5, where: ['outdoor', 'facility'] },
  payphone: { w: 1.5, where: ['outdoor'] },
  stash: { w: 2, where: ['outdoor', 'facility'] },
};
export const DUCK_CHANCE = 0.3;
export const SHRINE_TIERS = [
  { id: 'egg_bless1', minValue: 0, sec: 90, speed: 0.08, armor: 0.04, maxHp: 0 },
  { id: 'egg_bless2', minValue: 30, sec: 150, speed: 0.12, armor: 0.06, maxHp: 8 },
  { id: 'egg_bless3', minValue: 90, sec: 240, speed: 0.16, armor: 0.08, maxHp: 16 },
];
export function shrineTier(value) {
  let t = SHRINE_TIERS[0];
  for (const s of SHRINE_TIERS) if (value >= s.minValue) t = s;
  return t;
}
export const graffitiVariant = (seed) => (hashString('gf' + (seed | 0)) % 8);
export const diaryVariant = (seed) => (hashString('dy' + (seed | 0)) % 6);

/**
 * Deterministic egg plan for one map (every peer computes the same list).
 *   opts.seed / opts.moonId / opts.tier (1..) / opts.sector (0..)
 *   opts.outdoor  = (rng) => ({ x, y, z } | null)   sampler for open ground (the caller checks paths / landmarks)  | null when there is no surface
 *   opts.facility = [{ x, y, z, room, dist, sealed }]  candidate interior spots | null
 * returns [{ id, kind, where, x, y, z, yaw }]  (ids are stable per map: e0, e1, ... and 'duck')
 */
export function planEggs(opts) {
  const rng = new RNG(hashString(`egg|${opts.moonId}|${opts.seed | 0}`));
  const tier = Math.max(1, opts.tier | 0 || 1), out = [];
  const used = new Set();
  const places = [];   // { where, pick() }
  if (opts.outdoor) places.push({ where: 'outdoor', chance: [0.4, 0.12] });
  if (opts.facility?.length) places.push({ where: 'facility', chance: [0.35, 0.1] });
  const taken = [];
  const far = (x, z, d = 9) => !taken.some((q) => Math.hypot(q.x - x, q.z - z) < d);
  const findSpot = (where) => {
    if (where === 'outdoor') {
      for (let k = 0; k < 30; k++) { const s = opts.outdoor(rng); if (s && Number.isFinite(s.x) && Number.isFinite(s.z) && far(s.x, s.z, 14)) return s; }
      return null;
    }
    const spots = opts.facility.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.z) && !s.sealed && far(s.x, s.z, 8));
    if (!spots.length) return null;
    // prefer the far end of the facility (the entrance is where everyone walks)
    const sorted = spots.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0));
    return sorted[Math.min(sorted.length - 1, Math.floor(rng.next() * rng.next() * sorted.length))];
  };
  let idx = 0;
  const add = (kind, where) => {
    const s = findSpot(where);
    if (!s) return false;
    taken.push({ x: s.x, z: s.z });
    const o = where === 'facility' ? 0.7 : 0;
    const a = rng.float(0, Math.PI * 2);
    out.push({ id: kind === 'duck' ? 'd' + out.filter((e) => e.kind === 'duck').length : 'e' + idx++, kind, where, x: s.x + Math.cos(a) * o, y: s.y, z: s.z + Math.sin(a) * o, yaw: rng.float(0, Math.PI * 2) });
    return true;
  };
  for (const pl of places) {
    const bonus = Math.min(0.12, (tier - 1) * 0.04);
    for (let slot = 0; slot < pl.chance.length; slot++) {
      if (!rng.chance(pl.chance[slot] + bonus)) continue;
      const pool = Object.entries(KINDS).filter(([k, d]) => d.where.includes(pl.where) && !used.has(k)).map(([k, d]) => ({ k, w: d.w }));
      if (!pool.length) break;
      const kind = rng.weighted(pool).k;
      if (add(kind, pl.where)) used.add(kind);
    }
    if (rng.chance(DUCK_CHANCE / places.length)) add('duck', pl.where);
  }
  return out;
}

/** host: pick the (cheap, weird) item the hidden vending machine sells. pool = ids that exist in ITEMS */
export function vendingItem(seed, pool) { return pool.length ? pool[hashString('vd' + (seed | 0)) % pool.length] : null; }
export const VENDING_POOL = ['fd_glitch', 'fd_cringe', 'fd_mega', 'fd_meat', 'glowstick', 'spraypaint', 'adrenaline'];
export const STASH_POOL = ['medkit', 'flashlight', 'glowstick', 'lockpick', 'walkie', 'adrenaline', 'stungrenade', 'fd_bar', 'fd_coffee'];
