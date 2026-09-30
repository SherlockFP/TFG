// SURVIVAL data + pure rules (module `survival`, docs/wave4/survival.md). No THREE / DOM / game access: node-testable
// (tools/harness/survival.test.mjs). src/game/survival.js installs it, src/models/survival.js draws it, src/ui/panels/survival.js is the UI.
//
// Content: foraged plants (seeded per biome), seeds + farming (real-time growth, watering), cooking (ingredient properties -> a dish, a
// timing minigame -> quality), brewing (herbs -> tonics), storage crates (see survival_store.js), a slow hunger meter + cold-moon warmth.
// Rule from the owner: HEALING ONLY VIA FOOD. Raw ingredients heal a token amount, cooked meals heal for real.
import { RNG } from '../core/rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ properties + buffs
/** ingredient property -> the timed buff it feeds. base = seconds at strength 2 (before quality). Numeric fields are read by survival.js. */
export const PROPS = {
  regen: { buff: 'sv_regen', base: 50, name: 'Restorative', short: 'Restore', desc: 'Regenerates 1.2 HP per second.', hps: 1.2, color: '#7dff9a', glyph: 'RST' },
  stam: { buff: 'sv_stam', base: 70, name: 'Second Wind', short: 'Second Wind', desc: 'Stamina regenerates 45% faster.', stamRegen: 1.45, color: '#7dd0ff', glyph: 'SWD' },
  night: { buff: 'sv_night', base: 60, name: 'Night Eyes', short: 'Night Eyes', desc: 'You can see in the dark.', night: 1, color: '#7dffb0', glyph: 'NGT' },
  quiet: { buff: 'sv_quiet', base: 60, name: 'Hush', short: 'Hush', desc: 'Your noise is dampened by 55%.', quiet: 0.45, color: '#b0a0ff', glyph: 'HSH' },
  fire: { buff: 'sv_fire', base: 70, name: 'Fireproof', short: 'Fireproof', desc: 'Fire, steam and burning damage -60%.', fire: 0.4, color: '#ff9a5a', glyph: 'FRP' },
  warm: { buff: 'sv_warm', base: 120, name: 'Warmed Up', short: 'Warming', desc: 'Immune to the cold. Regenerates 0.4 HP per second.', warm: 1, hps: 0.4, color: '#ffc06a', glyph: 'WRM' },
  speed: { buff: 'sv_speed', base: 60, name: 'Swift', short: 'Swift', desc: '+9% move speed.', speed: 0.09, color: '#ffe066', glyph: 'SWF' },
};
export const PROP_IDS = Object.keys(PROPS);
/** tie-break order when two properties are equal in a dish */
const PROP_PRIO = ['regen', 'night', 'fire', 'quiet', 'stam', 'speed', 'warm'];
/** potions only brew these properties */
export const POTION_PROPS = ['stam', 'night', 'quiet', 'fire'];

/** Passive state buffs (no timer, driven by hunger / warmth in survival.js through the stats hook) */
export const HUNGER = {
  max: 100, start: 80,
  drainMoon: 100 / (45 * 60),      // per second while on a moon: empty after ~45 min of play
  drainShip: 0.3,                  // ...x0.3 in orbit / at the company
  fullAt: 70, hungryAt: 25,
  rawHint: 3,
};
export const HUNGER_BANDS = {
  full: { name: 'Satisfied', desc: '+6 max HP, stamina regenerates 8% faster.', maxHp: 6, stamRegen: 1.08, speed: 0 },
  ok: { name: 'Fed', desc: '', maxHp: 0, stamRegen: 1, speed: 0 },
  hungry: { name: 'Hungry', desc: 'Stamina regenerates 12% slower. Eat something.', maxHp: 0, stamRegen: 0.88, speed: -0.02 },
  starving: { name: 'Starving', desc: 'Stamina regenerates 25% slower, -5% speed. It is never lethal, just miserable.', maxHp: 0, stamRegen: 0.75, speed: -0.05 },
};
export function hungerBand(h) { return h >= HUNGER.fullAt ? 'full' : h <= 0.5 ? 'starving' : h < HUNGER.hungryAt ? 'hungry' : 'ok'; }
/** hunger after dt seconds. phase: 'moon' | 'landing' | anything else = ship. Never drops below 0. */
export function hungerStep(h, dt, phase) {
  const rate = phase === 'moon' ? HUNGER.drainMoon : phase === 'landing' || phase === 'takeoff' ? HUNGER.drainMoon * 0.6 : HUNGER.drainMoon * HUNGER.drainShip;
  return clamp(h - rate * Math.max(0, dt), 0, HUNGER.max);
}
export const eatHunger = (h, n) => clamp(h + Math.max(0, n), 0, HUNGER.max);

export const WARMTH = {
  max: 100, drain: 0.35, near: 2.6, indoor: 1.4, fireRadius: 6.5, coldAt: 45, freezeAt: 18,
  chilled: { speed: -0.04, stamRegen: 0.88 }, freezing: { speed: -0.08, stamRegen: 0.7 },
};
export const COLD_BIOMES = ['snow', 'ice', 'crystal'];
export const isColdMoon = (biome, weather) => COLD_BIOMES.includes(biome) || (biome === 'moor' && weather === 'stormy');
/** warmth after dt. ctx = { cold: bool (cold moon), outdoors: bool, nearFire: bool, warmBuff: bool } */
export function warmthStep(w, dt, ctx) {
  const d = Math.max(0, dt);
  if (ctx.nearFire) return clamp(w + WARMTH.near * d, 0, WARMTH.max);
  if (ctx.warmBuff) return clamp(w + 0.8 * d, 0, WARMTH.max);
  if (!ctx.cold || !ctx.outdoors) return clamp(w + WARMTH.indoor * d, 0, WARMTH.max);
  return clamp(w - WARMTH.drain * d, 0, WARMTH.max);
}
export const warmthBand = (w) => (w <= WARMTH.freezeAt ? 'freezing' : w <= WARMTH.coldAt ? 'chilled' : 'warm');

// ------------------------------------------------------------------------------------------------ plants
// cat: leaf | mushroom | root | berry | moss | fruit.   heal / nutri = per-ingredient numbers used by cooking.   grow = ms to ripen when watered.
export const PLANTS = {
  wildmint: { name: 'Wildmint', cat: 'leaf', heal: 8, nutri: 6, props: { regen: 1, stam: 1 }, grow: 4 * 60000, yield: [2, 3], glow: 0, color: '#62c46a', hint: 'A cool, sharp herb. Regenerates a little, wakes you up.' },
  glowcap: { name: 'Glowcap', cat: 'mushroom', heal: 10, nutri: 12, props: { night: 2 }, grow: 9 * 60000, yield: [1, 3], glow: 1, color: '#5affe8', hint: 'A cave mushroom that shines faintly cyan. Eaten, it lets you see in the dark.' },
  ashroot: { name: 'Ashroot', cat: 'root', heal: 12, nutri: 16, props: { fire: 2 }, grow: 8 * 60000, yield: [1, 3], glow: 0, color: '#c8452a', hint: 'A charred red root from burnt ground. Tastes of smoke. Fireproofs you.' },
  frostleaf: { name: 'Frostleaf', cat: 'leaf', heal: 8, nutri: 7, props: { warm: 2 }, grow: 6 * 60000, yield: [2, 3], glow: 0, color: '#9ad8ff', hint: 'Icy blue leaves that burn like pepper. A tea of it keeps the cold out.' },
  bloodberry: { name: 'Bloodberry', cat: 'berry', heal: 22, nutri: 10, props: { regen: 2 }, grow: 6 * 60000, yield: [2, 4], glow: 0, color: '#d0243c', hint: 'Juicy dark berries. The best healing herb you can just pick.' },
  staticmoss: { name: 'Static Moss', cat: 'moss', heal: 4, nutri: 5, props: { quiet: 2 }, grow: 10 * 60000, yield: [1, 3], glow: 1, color: '#7a9cff', hint: 'Crackling moss. It swallows sound; you tread softer after eating it.' },
  sunfruit: { name: 'Twin-Sun Fruit', cat: 'fruit', heal: 10, nutri: 14, props: { speed: 2, stam: 1 }, grow: 7 * 60000, yield: [1, 3], glow: 0, color: '#ffb02a', hint: 'The sweet fruit of the desert cactus. Sugar and speed.' },
};
export const PLANT_IDS = Object.keys(PLANTS);
export const plantItem = (k) => 'sv_p_' + k;
export const seedItem = (k) => 'sv_s_' + k;
export const plantOfItem = (ty) => (/^sv_p_/.test(ty) ? ty.slice(5) : /^sv_s_/.test(ty) ? ty.slice(5) : null);
export const isSeedItem = (ty) => /^sv_s_/.test(ty || '') && !!PLANTS[ty.slice(5)];

/** weighted plant table per biome id (moons: MOONS[id].biome). Unknown biomes use `hills`. */
export const BIOME_PLANTS = {
  hills: { wildmint: 5, bloodberry: 4, glowcap: 1 },
  swamp: { glowcap: 5, wildmint: 3, staticmoss: 2, bloodberry: 1 },
  snow: { frostleaf: 6, wildmint: 1, glowcap: 1 },
  desert: { sunfruit: 6, ashroot: 3 },
  moor: { ashroot: 4, bloodberry: 3, wildmint: 3 },
  blackforest: { glowcap: 5, bloodberry: 4, ashroot: 2 },
  datascape: { staticmoss: 6, glowcap: 2 },
  servermarsh: { glowcap: 4, staticmoss: 5, wildmint: 1 },
  ashfield: { ashroot: 6, sunfruit: 1 },
  crystal: { frostleaf: 4, staticmoss: 3, glowcap: 3 },
  lava: { ashroot: 6, sunfruit: 3 },
  ice: { frostleaf: 7, glowcap: 1 },
  jungle: { bloodberry: 5, wildmint: 4, glowcap: 3, sunfruit: 1 },
  soviet: { wildmint: 4, frostleaf: 3, bloodberry: 1 },
  twinsun: { sunfruit: 7, ashroot: 3, staticmoss: 1 },
  pier: {},
  homeworld: {},
};
export const plantTable = (biome) => BIOME_PLANTS[biome] || BIOME_PLANTS.hills;

/** Seeded plant scatter. o = { scale (terrain scale), avoid(x, z, margin) -> bool, heightAt(x, z) -> y, count }. Same seed -> same list on every peer. */
/** placement guard for wild plants on a built outdoor map: the map's own avoid() + never inside a rock / trunk ([geomfix]; harvest lists carry x, z, scale, kind) */
export function plantAvoid(out) {
  return (x, z, m) => {
    try {
      if (out.avoid?.(x, z, m) || out.solidAt?.(x, z, 0.25, (out.terrain?.heightAt?.(x, z) ?? 0) - 0.02)) return true;
      const h = out.harvest;
      return !!h && (h.rocks.some((q) => Math.hypot(q.x - x, q.z - z) < 1.8 * q.scale + 0.3) || h.trees.some((q) => Math.hypot(q.x - x, q.z - z) < (q.kind === 'rock' ? 1.8 : 0.6) * q.scale + 0.3));
    } catch { return false; }
  };
}

export function planPlants(seed, biome, o = {}) {
  const tbl = plantTable(biome);
  const entries = Object.entries(tbl).map(([k, w]) => ({ k, w }));
  if (!entries.length) return [];
  const R = new RNG((((seed | 0) ^ 0x5e11d) >>> 0) || 1);
  const sc = o.scale || 1;
  const want = o.count ?? Math.round((26 + 8 * (sc - 1) * 3) * (sc >= 1 ? 1 : 0.8));
  const avoid = o.avoid || (() => false);
  const heightAt = o.heightAt || (() => 0);
  const out = [];
  const R0 = 138 * sc;
  for (let tries = 0; tries < want * 12 && out.length < want; tries++) {
    const k = R.weighted(entries).k;
    // plants like clusters: 60% of them are placed near an earlier one of the same kind
    let x, z;
    const mates = out.filter((p) => p.k === k);
    if (mates.length && R.chance(0.6)) {
      const m = R.pick(mates), a = R.float(0, Math.PI * 2), d = R.float(1.5, 6);
      x = m.x + Math.cos(a) * d; z = m.z + Math.sin(a) * d;
    } else { x = R.float(-R0, R0); z = R.float(-R0, R0); }
    if (Math.abs(x) > R0 || Math.abs(z) > R0) continue;
    if (avoid(x, z, 2)) continue;
    out.push({ id: 'w' + out.length, k, x, y: heightAt(x, z), z, rot: R.float(0, 6.28), scale: R.float(0.85, 1.25), rare: R.chance(0.08) });
  }
  return out;
}

/** What a wild plant gives. rnd = () => [0,1). opts.sickle: +1 plant, better seed chance. Rare variants give double + a guaranteed seed. */
export function forageYield(kind, rare, rnd, opts = {}) {
  const P = PLANTS[kind];
  if (!P) return { plants: 0, seeds: 0 };
  const [lo, hi] = P.yield;
  let plants = lo + Math.floor(rnd() * (hi - lo + 1));
  if (opts.sickle) plants += 1;
  if (rare) plants *= 2;
  let seeds = rnd() < (opts.sickle ? 0.45 : 0.28) ? 1 : 0;
  if (rare) seeds = Math.max(seeds, 1);
  return { plants, seeds };
}
export const HARVEST_SEC = { hand: 1.3, sickle: 0.6 };

// ------------------------------------------------------------------------------------------------ farming
export const WET_MS = 5 * 60000;      // one watering keeps a crop growing at full speed for 5 minutes
export const WET_CAP_MS = 10 * 60000; // watering twice does not stack beyond 10 minutes
export const DRY_RATE = 0.25;         // growth speed of a thirsty crop
export const STAGES = ['seed', 'sprout', 'growing', 'ripe'];
export const plantables = () => PLANT_IDS.map((k) => ({ kind: k, seed: seedItem(k), item: plantItem(k), growMs: PLANTS[k].grow, name: PLANTS[k].name }));
export const newCrop = (kind, now) => ({ k: kind, t: now, p: 0, wet: 0 });
/** Advance a crop to `now` (ms, wall clock) in place. Returns the crop. Progress p in 0..1. */
export function growTick(crop, now) {
  if (!crop) return crop;
  const P = PLANTS[crop.k];
  if (!P) return crop;
  let ms = now - crop.t;
  if (!(ms > 0)) { if (now < crop.t) crop.t = now; return crop; }
  const wetMs = clamp(crop.wet - crop.t, 0, ms);   // part of the interval that was watered
  const eff = wetMs + (ms - wetMs) * DRY_RATE;
  crop.p = clamp(crop.p + eff / P.grow, 0, 1);
  crop.t = now;
  return crop;
}
export function waterCrop(crop, now) {
  growTick(crop, now);
  crop.wet = Math.min(Math.max(crop.wet, now) + WET_MS, now + WET_CAP_MS);
  return crop;
}
export const isWet = (crop, now) => !!crop && crop.wet > now;
export const stageOf = (p) => (p >= 1 ? 3 : p >= 0.5 ? 2 : p >= 0.15 ? 1 : 0);
/** ms until ripe at the current watering state (for the label "ripe in 2:10") */
export function msToRipe(crop, now) {
  if (!crop) return 0;
  const c = { ...crop };
  growTick(c, now);
  if (c.p >= 1) return 0;
  const left = (1 - c.p) * PLANTS[c.k].grow;
  const wetLeft = Math.max(0, c.wet - now);
  if (wetLeft * 1 >= left) return left;
  const rest = left - wetLeft;
  return wetLeft + rest / DRY_RATE;
}
/** Farm harvest: 2-4 plants and a good chance for more seeds. */
export function farmYield(kind, rnd, opts = {}) {
  const P = PLANTS[kind];
  if (!P) return { plants: 0, seeds: 0 };
  const [lo, hi] = P.yield;
  const plants = lo + 1 + Math.floor(rnd() * (hi - lo + 1)) + (opts.sickle ? 1 : 0);
  const seeds = 1 + (rnd() < 0.45 ? 1 : 0);
  return { plants, seeds };
}

// ------------------------------------------------------------------------------------------------ ingredients
/** type -> { cat, heal, nutri, props, meat } for everything a pot accepts. Plants come from PLANTS, the rest from this table. */
export const INGREDIENTS = {
  sv_meat: { cat: 'meat', heal: 26, nutri: 30, props: {}, meat: true },
  fd_meat: { cat: 'meat', heal: 22, nutri: 26, props: {}, meat: true },
  fish_kefal: { cat: 'fish', heal: 20, nutri: 24, props: {}, meat: true },
  fish_lufer: { cat: 'fish', heal: 24, nutri: 28, props: {}, meat: true },
  fish_levrek: { cat: 'fish', heal: 28, nutri: 32, props: {}, meat: true },
  fish_golden: { cat: 'fish', heal: 34, nutri: 40, props: { regen: 1 }, meat: true },
  fish_eel: { cat: 'fish', heal: 30, nutri: 34, props: { quiet: 1 }, meat: true },
};
for (const [k, P] of Object.entries(PLANTS)) INGREDIENTS[plantItem(k)] = { cat: P.cat, heal: P.heal, nutri: P.nutri, props: { ...P.props }, meat: false };
export const isIngredient = (ty) => !!INGREDIENTS[ty];
export const isRawMeat = (ty) => !!INGREDIENTS[ty]?.meat;
export const MAX_INGREDIENTS = 3;

// ------------------------------------------------------------------------------------------------ dishes (cooking pot)
/** main course kind: decided by the categories in the pot. mul scales the summed ingredient heal. */
export const MAINS = {
  stew: { name: 'Hearty Stew', mul: 1.05, hunger: 1.0, tip: 'Meat and greens in one pot.' },
  grill: { name: 'Grilled Catch', mul: 0.95, hunger: 0.95, tip: 'Fish over the fire.' },
  soup: { name: "Forager's Soup", mul: 0.85, hunger: 0.9, tip: 'Mushrooms, roots and leaves.' },
  tart: { name: 'Berry Tart', mul: 0.78, hunger: 0.8, tip: 'Sweet and light.' },
};
export const MAIN_IDS = Object.keys(MAINS);
export const BONUS_IDS = ['plain', ...PROP_IDS];
export const dishId = (main, bonus) => `sv_d_${main}_${bonus || 'plain'}`;
export const isDishId = (ty) => /^sv_d_(stew|grill|soup|tart)_[a-z]+$/.test(ty || '');
export const parseDish = (ty) => { const m = /^sv_d_([a-z]+)_([a-z]+)$/.exec(ty || ''); return m && MAINS[m[1]] && (m[2] === 'plain' || PROPS[m[2]]) ? { main: m[1], bonus: m[2] === 'plain' ? null : m[2] } : null; };
export function allDishIds() { const o = []; for (const m of MAIN_IDS) for (const b of BONUS_IDS) o.push(dishId(m, b === 'plain' ? null : b)); return o; }

/** Cooking quality ladder. The result item's TIER carries it (common / uncommon / rare / epic) so it survives saves and trades. */
export const QUAL = [
  { id: 'burnt', name: 'Burnt', tier: 'common', heal: 0.35, hunger: 0.5, buff: 0, poison: 0 },
  { id: 'raw', name: 'Undercooked', tier: 'uncommon', heal: 0.6, hunger: 0.75, buff: 0.5, poison: 0.5 },
  { id: 'cooked', name: 'Cooked', tier: 'rare', heal: 1, hunger: 1, buff: 1, poison: 0 },
  { id: 'perfect', name: 'Perfect', tier: 'epic', heal: 1.3, hunger: 1.25, buff: 1.4, poison: 0 },
];
export const qualOfTier = (tier) => { const i = QUAL.findIndex((q) => q.tier === tier); return i < 0 ? 2 : i; };
/** zone thresholds on the cooking meter (progress 0..1, the needle keeps going past 1 = burnt) */
export const COOK_ZONES = { cooked: 0.5, perfect: 0.72, burnt: 0.86 };
/** quality index (0 burnt .. 3 perfect) for a stop position p */
export function cookQuality(p) {
  if (!(p >= 0)) return 1;
  if (p < COOK_ZONES.cooked) return 1;
  if (p < COOK_ZONES.perfect) return 2;
  if (p < COOK_ZONES.burnt) return 3;
  return 0;
}
/** stations: how fast the meter runs. The ship stove is steady, a campfire is hasty. */
export const STATIONS = {
  stove: { name: 'Ship Stove', speed: 1.0 },
  fire: { name: 'Campfire', speed: 1.3 },
};
/** seconds the meter needs to reach 1.0 for n ingredients at a station */
export const cookSeconds = (n, station = 'stove') => (5.5 + 1.1 * Math.max(1, n)) / (STATIONS[station]?.speed || 1);

/** Normalise a list of ingredient types: 1..3 known ones. Returns { ok, list, reason }. */
export function checkIngredients(types) {
  const list = (types || []).filter((t) => typeof t === 'string');
  if (!list.length) return { ok: false, list, reason: 'Put 1-3 ingredients in the pot.' };
  if (list.length > MAX_INGREDIENTS) return { ok: false, list, reason: 'The pot holds three ingredients.' };
  for (const t of list) if (!INGREDIENTS[t]) return { ok: false, list, reason: 'That is not an ingredient.' };
  return { ok: true, list };
}
/**
 * Resolve what a pot makes. Returns null for an invalid list, else
 * { main, bonus, total, id, heal, hunger, nutri, meat, cats, props } at COOKED quality (multiply with QUAL for the real numbers).
 */
export function resolveDish(types) {
  const chk = checkIngredients(types);
  if (!chk.ok) return null;
  const ings = chk.list.map((t) => INGREDIENTS[t]);
  const cats = {};
  const props = {};
  let heal = 0, nutri = 0, meat = false;
  for (const i of ings) {
    cats[i.cat] = (cats[i.cat] || 0) + 1;
    heal += i.heal; nutri += i.nutri; meat = meat || i.meat;
    for (const [p, v] of Object.entries(i.props)) props[p] = (props[p] || 0) + v;
  }
  const fishN = cats.fish || 0, meatN = cats.meat || 0;
  const sweet = (cats.berry || 0) + (cats.fruit || 0);
  const veg = (cats.leaf || 0) + (cats.mushroom || 0) + (cats.root || 0) + (cats.moss || 0);
  let main;
  if (meatN > 0) main = 'stew';
  else if (fishN > 0) main = 'grill';
  else if (veg === 0 && sweet > 0) main = 'tart';
  else if (sweet > veg) main = 'tart';
  else main = 'soup';
  // bonus: the strongest property with a total of at least 2
  let bonus = null, best = 1;
  for (const p of PROP_PRIO) if ((props[p] || 0) > best) { best = props[p]; bonus = p; }
  const variety = Object.keys(cats).length;
  const M = MAINS[main];
  const healBase = clamp(Math.round(heal * M.mul * (1 + 0.08 * (variety - 1))), 6, 100);
  const hungerBase = clamp(Math.round(nutri * M.hunger), 5, 70);
  return { main, bonus, total: bonus ? props[bonus] : 0, id: dishId(main, bonus), heal: healBase, hunger: hungerBase, nutri, meat, cats, props, count: ings.length };
}
/** duration of a meal's bonus buff in seconds for strength `total` (2..6) at quality index q (0..3) */
export function bonusSeconds(bonus, total, q) {
  const P = PROPS[bonus];
  if (!P) return 0;
  return Math.round(P.base * (0.75 + 0.25 * clamp(total, 2, 6) - 0.25) * QUAL[clamp(q | 0, 0, 3)].buff);
}
/** A dish item stores its batch numbers in the item's value fields: value = heal (cooked quality), baseValue = hunger * 10 + bonus strength. */
export const packDish = (r) => ({ value: clamp(Math.round(r.heal), 1, 120), baseValue: clamp(Math.round(r.hunger), 1, 90) * 10 + clamp(r.total | 0, 0, 9) });
export function unpackDish(type, value, baseValue) {
  const d = parseDish(type);
  if (!d) return null;
  const heal = value > 0 ? value : HEAL_BASE[d.main];
  const hunger = baseValue > 0 ? Math.floor(baseValue / 10) : HUNGER_BASE[d.main];
  const total = baseValue > 0 ? baseValue % 10 : 3;
  return { ...d, heal, hunger, total: d.bonus ? Math.max(2, total) : 0 };
}
/** Everything eating a dish does at quality index q (0..3). value / baseValue = the item's packed batch numbers. */
export function eatDish(type, q, value = 0, baseValue = 0, rnd = Math.random) {
  const d = unpackDish(type, value, baseValue);
  if (!d) return null;
  const Q = QUAL[clamp(q | 0, 0, 3)];
  const heal = Math.round(d.heal * Q.heal);
  const hunger = Math.round(d.hunger * Q.hunger);
  const secs = d.bonus ? bonusSeconds(d.bonus, d.total, q) : 0;
  const poison = (d.main === 'stew' || d.main === 'grill') && Q.poison > 0 && rnd() < Q.poison;
  return { main: d.main, bonus: d.bonus, heal, hunger, buff: d.bonus && secs > 0 ? { id: PROPS[d.bonus].buff, sec: secs } : null, poison, quality: Q.id, name: MAINS[d.main].name };
}
// fallback numbers for a dish item without packed values (e.g. one spawned by a debug command)
export const HEAL_BASE = { stew: 62, grill: 52, soup: 34, tart: 26 };
export const HUNGER_BASE = { stew: 46, grill: 40, soup: 28, tart: 22 };
/** Pot preview at a given quality index, using the real ingredient numbers (what the panel shows before you cook). */
export function previewDish(types, q = 2) {
  const r = resolveDish(types);
  if (!r) return null;
  const Q = QUAL[clamp(q | 0, 0, 3)];
  return { ...r, quality: Q.id, heal: Math.round(r.heal * Q.heal), hunger: Math.round(r.hunger * Q.hunger), secs: r.bonus ? bonusSeconds(r.bonus, r.total, q) : 0 };
}

// ------------------------------------------------------------------------------------------------ potions (brewing stand)
export const POTIONS = {
  stam: { name: 'Stamina Tonic', tip: 'LMB: drink. Refills 30 stamina and stamina regenerates 80% faster for a while.', instant: { stam: 30 }, mul: { stamRegen: 1.8 } },
  night: { name: 'Night Draught', tip: 'LMB: drink. See in the dark for a while.', instant: {} },
  quiet: { name: 'Hush Tonic', tip: 'LMB: drink. Your noise is dampened by 60%.', instant: {} },
  fire: { name: 'Fireward Tonic', tip: 'LMB: drink. Fire, steam and burning damage -65%.', instant: {} },
};
export const potionId = (p) => 'sv_pt_' + p;
export const isPotionId = (ty) => /^sv_pt_(stam|night|quiet|fire)$/.test(ty || '');
export const potionProp = (ty) => (isPotionId(ty) ? ty.slice(6) : null);
export const BREW_MS = 25000;
/** potion seconds by strength tier (0 weak .. 2 strong) */
export const POTION_SECS = { stam: [45, 75, 100], night: [75, 115, 160], quiet: [60, 90, 125], fire: [60, 95, 130] };
/**
 * Brew: 2-3 plant ingredients (no meat) -> { prop, type, tier (item tier), strength 0..2, sec } or null.
 * The potion follows the strongest of stam / night / quiet / fire; total >= 4 = strong, >= 6 = superb.
 */
export function resolveBrew(types) {
  const chk = checkIngredients(types);
  if (!chk.ok || chk.list.length < 2) return null;
  const props = {};
  for (const t of chk.list) {
    const I = INGREDIENTS[t];
    if (I.meat) return null;
    for (const [p, v] of Object.entries(I.props)) props[p] = (props[p] || 0) + v;
  }
  let prop = null, best = 1;
  for (const p of PROP_PRIO) if (POTION_PROPS.includes(p) && (props[p] || 0) > best) { best = props[p]; prop = p; }
  if (!prop) return null;
  const strength = best >= 6 ? 2 : best >= 4 ? 1 : 0;
  return { prop, type: potionId(prop), strength, tier: ['uncommon', 'rare', 'epic'][strength], sec: POTION_SECS[prop][strength], total: best };
}
export const potionStrength = (tier) => (tier === 'epic' ? 2 : tier === 'rare' ? 1 : 0);
export const potionSeconds = (type, tier) => POTION_SECS[potionProp(type)]?.[potionStrength(tier)] || 0;

// ------------------------------------------------------------------------------------------------ raw eating (token healing, poison risk)
export const RAW = { heal: 3, hunger: 5, poisonChance: 0.6, poisonSec: 35 };
export function eatRaw(type, rnd = Math.random) {
  const I = INGREDIENTS[type];
  if (!I) return null;
  return { heal: RAW.heal, hunger: I.meat ? RAW.hunger : RAW.hunger + 1, poison: I.meat && rnd() < RAW.poisonChance };
}

// ------------------------------------------------------------------------------------------------ items (registerItem defs)
const T = (name, tip, extra = {}) => ({ name, tip, ...extra });
export const TOOL_ITEMS = {
  sv_sickle: T('Sickle', 'Hold while harvesting: plants come off in half the time, +1 plant and better seed odds.', { kind: 'tool', weight: 2 }),
  sv_can: T('Watering Can', 'E on a planter cell to water the crop. One watering lasts 5 minutes.', { kind: 'tool', weight: 2 }),
  sv_crate1: T('Wooden Crate', 'LMB on the floor of your ship or homeworld: place a storage crate (6x3).', { kind: 'tool', weight: 8, place: 'crate', crate: 1 }),
  sv_crate2: T('Metal Crate', 'LMB on the floor of your ship or homeworld: place a storage crate (8x4).', { kind: 'tool', weight: 10, place: 'crate', crate: 2 }),
  sv_crate3: T('Secure Crate', 'LMB on the floor of your ship or homeworld: place a big steel crate (10x5).', { kind: 'tool', weight: 12, place: 'crate', crate: 3 }),
  sv_planter: T('Planter Box', 'LMB on the floor of your ship or homeworld: place a planter with three cells.', { kind: 'tool', weight: 8, place: 'planter' }),
  sv_brewstand: T('Brewing Stand', 'LMB on the floor of your ship or homeworld: place an alchemy stand.', { kind: 'tool', weight: 7, place: 'brew' }),
  sv_campfire: T('Campfire Kit', 'LMB on the ground outside: light a campfire. It warms you, cooks food and burns for 5 minutes (feed it wood).', { kind: 'tool', weight: 4, place: 'fire' }),
};
export const RAW_ITEMS = { sv_meat: T('Raw Meat', 'LMB: eat it raw (a token amount, and it usually makes you sick). Cook it at a stove or campfire.', { kind: 'consumable', weight: 1.5 }) };
for (const [k, P] of Object.entries(PLANTS)) {
  RAW_ITEMS[plantItem(k)] = T(P.name, `${P.hint} LMB: eat it raw (a tiny bite). Cook it for the real effect.`, { kind: 'consumable', weight: 0.4, plant: k });
  RAW_ITEMS[seedItem(k)] = T(`${P.name} Seeds`, 'Plant them in a planter cell (E). Water them and wait.', { kind: 'consumable', weight: 0.1, seedOf: k, noEat: true });
}
export const POTION_ITEMS = {};
for (const p of POTION_PROPS) POTION_ITEMS[potionId(p)] = T(POTIONS[p].name, POTIONS[p].tip, { kind: 'consumable', weight: 0.6, potion: p, tier: undefined });
export const DISH_ITEMS = {};
for (const m of MAIN_IDS) for (const b of BONUS_IDS) {
  const id = dishId(m, b === 'plain' ? null : b);
  const bn = b === 'plain' ? '' : ` (${PROPS[b].short})`;
  DISH_ITEMS[id] = T(`${MAINS[m].name}${bn}`, `LMB: eat. A cooked meal: real healing and hunger. ${b === 'plain' ? '' : PROPS[b].desc + ' '}Its quality is its tier.`, { kind: 'consumable', weight: 1, dish: m, bonus: b === 'plain' ? null : b });
}
export const ALL_ITEMS = { ...TOOL_ITEMS, ...RAW_ITEMS, ...POTION_ITEMS, ...DISH_ITEMS };
export const isSvItem = (ty) => !!ALL_ITEMS[ty];
/** consumables that go through the 'svuse' request */
export const isEdible = (ty) => isDishId(ty) || isPotionId(ty) || (!!RAW_ITEMS[ty] && !RAW_ITEMS[ty].seedOf);

// ------------------------------------------------------------------------------------------------ crafting recipes (workbench)
export const SV_RECIPES = [
  { id: 'sv_sickle', name: 'Sickle', cat: 'tools', out: 'sv_sickle', n: 1, in: [['comp_scrapmetal', 1], ['comp_wood', 1]], tier: null, time: 1.4, desc: 'Cuts herbs in half the time.' },
  { id: 'sv_can', name: 'Watering Can', cat: 'tools', out: 'sv_can', n: 1, in: [['comp_scrapmetal', 2]], tier: null, time: 1.4, desc: 'Water your planter.' },
  { id: 'sv_crate1', name: 'Wooden Crate', cat: 'tools', out: 'sv_crate1', n: 1, in: [['comp_wood', 4]], tier: null, time: 1.6, desc: 'Storage 6x3. Place it on your ship or homeworld.' },
  { id: 'sv_crate2', name: 'Metal Crate', cat: 'tools', out: 'sv_crate2', n: 1, in: [['comp_scrapmetal', 4], ['comp_wood', 1]], tier: null, time: 2, desc: 'Storage 8x4.' },
  { id: 'sv_crate3', name: 'Secure Crate', cat: 'tools', out: 'sv_crate3', n: 1, in: [['comp_scrapmetal', 5], ['comp_circuit', 1], ['comp_fuse', 1]], tier: null, time: 2.6, desc: 'Storage 10x5 in a steel shell.' },
  { id: 'sv_planter', name: 'Planter Box', cat: 'survival', out: 'sv_planter', n: 1, in: [['comp_wood', 3], ['comp_cloth', 1]], tier: null, time: 1.6, desc: 'Three crop cells.' },
  { id: 'sv_brewstand', name: 'Brewing Stand', cat: 'survival', out: 'sv_brewstand', n: 1, in: [['comp_scrapmetal', 3], ['comp_chem', 2], ['comp_fuse', 1]], tier: null, time: 2.2, desc: 'Brew tonics from herbs.' },
  { id: 'sv_campfire', name: 'Campfire Kit', cat: 'survival', out: 'sv_campfire', n: 1, in: [['comp_wood', 3], ['comp_fuel', 1]], tier: null, time: 1.4, desc: 'A portable fire: warmth and a cooking spot.' },
];

// ------------------------------------------------------------------------------------------------ starter kit + creature meat
export const STARTER = [['sv_meat', 2], ['sv_p_wildmint', 2], ['sv_p_bloodberry', 2], ['sv_s_wildmint', 1], ['sv_s_bloodberry', 1], ['sv_can', 1], ['sv_sickle', 1]];
/** chance a killed creature drops raw meat (organic ones mostly) */
export function meatChance(flavour, elite, boss) {
  if (boss) return 1;
  const base = flavour === 'organic' ? 0.3 : flavour === 'arcane' ? 0.06 : 0.04;
  return Math.min(0.9, base * (elite ? 2.2 : 1));
}
export const MEAT_PER_LANDING = 6;
export const CAMPFIRE = { burnSec: 300, feedSec: 90, maxSec: 480, warmRadius: WARMTH.fireRadius, cookRadius: 3.4 };
/** one wood log fuels the campfire for feedSec, up to maxSec */
export const fireFuel = (left, add = CAMPFIRE.feedSec) => Math.min(CAMPFIRE.maxSec, Math.max(0, left) + add);
