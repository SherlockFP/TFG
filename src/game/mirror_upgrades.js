// MIRROR DIMENSION - temporary upgrades, dimension level and Reflection Meter (PURE: no DOM / three / game imports, node-testable).
// Upgrades are per player, local, and vanish when the player leaves the dimension (or the day ends / they die for real).
// Numbers are documented in docs/wave2/mirror.md; tools/harness/mirror.test.mjs covers the pool, rolls, thresholds and scaling.
import { TIER_ORDER } from './tiers.js';

export const MAX_LEVEL = 15;

/** id -> { name, tpl + args(level) (English template, translated in the UI), max, glyph, color, w (roll weight) } */
export const UPGRADES = {
  dmg:       { id: 'dmg',       name: 'Sharpened Glass',    max: 5, glyph: 'DMG', color: '#ff6a6a', w: 10, tpl: '+{a}% damage (all mirror weapons)', args: (l) => ({ a: l * 12 }) },
  speed:     { id: 'speed',     name: 'Quicksilver',        max: 5, glyph: 'SPD', color: '#7fe8ff', w: 9,  tpl: '+{a}% move speed', args: (l) => ({ a: l * 7 }) },
  shards:    { id: 'shards',    name: 'Mirror Shards',      max: 5, glyph: 'SHD', color: '#c9b8ff', w: 10, tpl: '{a} shards orbit you and cut what they touch', args: (l) => ({ a: l + 1 }) },
  aura:      { id: 'aura',      name: 'Burning Reflection', max: 5, glyph: 'FIR', color: '#ff9a3a', w: 9,  tpl: 'Fire aura {a} m, {b} dmg every 0.5 s', args: (l) => ({ a: (2.4 + 0.4 * l).toFixed(1), b: 4 + 3 * l }) },
  bolt:      { id: 'bolt',      name: 'Twin Bolt',          max: 4, glyph: 'BLT', color: '#ffe36a', w: 10, tpl: 'Auto-bolt fires {a} bolts per volley', args: (l) => ({ a: l + 1 }) },
  lifesteal: { id: 'lifesteal', name: 'Vampiric Sliver',    max: 4, glyph: 'LST', color: '#ff4f8a', w: 6,  tpl: 'Heal {a}% of the damage you deal', args: (l) => ({ a: l * 4 }) },
  magnet:    { id: 'magnet',    name: 'Gravity Well',       max: 4, glyph: 'MAG', color: '#5affc0', w: 6,  tpl: 'Crystals are pulled from {a} m', args: (l) => ({ a: 3 + 2 * l }) },
  dash:      { id: 'dash',      name: 'Shatter Step',       max: 3, glyph: 'DSH', color: '#e0e0ff', w: 7,  tpl: 'Dash [N] {a} m, i-frames, {b} s cooldown', args: (l) => ({ a: (6 + 1.5 * l).toFixed(1), b: (5.4 - 0.7 * l).toFixed(1) }) },
};
/** English text of an upgrade at level l (the UI translates `tpl` and fills `args` itself) */
export function describe(id, l) { const u = UPGRADES[id]; return u ? u.tpl.replace(/\{(\w+)\}/g, (_, k) => u.args(l)[k]) : ''; }
export const UPGRADE_IDS = Object.keys(UPGRADES);

/** fresh per-visit progression state */
export function newProgress() { return { level: 1, xp: 0, owned: {} }; }

/** XP needed to go from `level` to `level + 1` */
export function xpToNext(level) { return Math.round(20 + 12 * level + 1.5 * level * level); }

/** Adds XP (mutates st). Returns how many levels were gained (each one opens a 3-card choice). Level caps at MAX_LEVEL. */
export function addXp(st, amount) {
  if (!(amount > 0) || st.level >= MAX_LEVEL) return 0;
  st.xp += amount;
  let gained = 0;
  while (st.level < MAX_LEVEL && st.xp >= xpToNext(st.level)) { st.xp -= xpToNext(st.level); st.level++; gained++; }
  if (st.level >= MAX_LEVEL) st.xp = 0;
  return gained;
}

/** owned = { id: level }. Returns n distinct upgrade ids that are not maxed (weighted; brand new ones weigh 1.5x). rnd = () => [0,1). */
export function rollChoices(rnd, owned = {}, n = 3) {
  const pool = UPGRADE_IDS.filter((id) => (owned[id] || 0) < UPGRADES[id].max);
  const out = [];
  while (out.length < n && pool.length) {
    let tot = 0;
    const ws = pool.map((id) => { const w = UPGRADES[id].w * ((owned[id] || 0) === 0 ? 1.5 : 1); tot += w; return w; });
    let r = rnd() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= ws[k]; if (r <= 0) break; }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

/** Pure: returns a new owned map with `id` one level higher (clamped to max); unknown ids are ignored. */
export function applyChoice(owned, id) {
  const u = UPGRADES[id];
  if (!u) return { ...owned };
  return { ...owned, [id]: Math.min(u.max, (owned[id] || 0) + 1) };
}

/** Every derived combat number from the owned map (the base kit: 1 auto-bolt, magnet 3 m, no shards / aura / dash). */
export function derive(owned = {}) {
  const l = (id) => owned[id] || 0;
  return {
    dmgMul: 1 + 0.12 * l('dmg'),
    speedMul: 1 + 0.07 * l('speed'),
    bolts: 1 + l('bolt'),
    boltCd: 1.1 * Math.pow(0.94, l('bolt')),
    boltDmg: 7,
    boltRange: 16,
    shards: l('shards') ? l('shards') + 1 : 0,
    shardDmg: 9, shardR: 2.1, shardSpin: 2.6,
    aura: l('aura') ? { r: 2.4 + 0.4 * l('aura'), dmg: 4 + 3 * l('aura'), tick: 0.5 } : null,
    lifesteal: 0.04 * l('lifesteal'),
    magnet: 3 + 2 * l('magnet'),
    dash: l('dash') ? { cd: 5.4 - 0.7 * l('dash'), dist: 6 + 1.5 * l('dash'), iframes: 0.3 } : null,
  };
}

// ---------------------------------------------------------------- Reflection Meter (crew-wide, host side)
/** meter value needed for reward number k (0 based): 60, 135, 220, 315, 420 ... */
export function meterThreshold(k) { return 60 + 70 * k + 5 * k * k; }
/** Where a meter value sits: { k: rewards already earned, prev, next, frac 0..1 to the next threshold } */
export function meterState(v) {
  let k = 0;
  while (v >= meterThreshold(k)) k++;
  const prev = k === 0 ? 0 : meterThreshold(k - 1), next = meterThreshold(k);
  return { k, prev, next, frac: Math.max(0, Math.min(1, (v - prev) / (next - prev))) };
}
/** reward for threshold k: chest tier (models/chest.js), tier-luck bump for its loot, and a power-up for every crewmate inside */
export function meterReward(k) {
  const chest = k < 2 ? 'iron' : k < 4 ? 'gold' : 'void';
  return { chest, luck: Math.min(0.8, 0.15 + 0.1 * k), powerup: true };
}
/** how many rewards a meter jump from `from` to `to` earns (the list of threshold indices crossed) */
export function crossed(from, to) {
  const out = [];
  for (let k = meterState(from).k; to >= meterThreshold(k) && out.length < 8; k++) out.push(k);
  return out;
}
/** tier luck: with chance `luck` a loot entry rolls one tier higher (never past legendary from a chest). rnd = () => [0,1) */
export function bumpTier(tier, rnd, luck) {
  const i = Math.max(0, TIER_ORDER.indexOf(tier));
  if (!(luck > 0) || rnd() >= luck) return tier;
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf('legendary'), i + 1)];
}
