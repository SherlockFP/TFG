// HQ FORGE rules (pure data + functions, no DOM / three: node-testable, see tools/harness/forge_rules.test.mjs).
// Design source: docs/MASTERPLAN.md section 12. Everything the host rolls goes through resolveEnhance / resolveAscend /
// rollCreatureTier with a ForgeRng (seeded, logged, forceable in tests), so numbers live in ONE place.
import { TIER_ORDER, TIERS, tierIndex, rollTier } from './tiers.js';
import { RNG } from '../core/rng.js';
import { forgeFailFrom, forgeDriveMul } from './difficulty.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ shards
/** The six forge materials, one per tier (index = tier index). Data Crystal is the same fiction as crafting's comp_crystal. */
export const SHARD_DEFS = [
  { id: 'shard_scrap',   key: 'scrap',   name: 'Scrap Shard',        tier: 'common',    value: [2, 4],     color: '#b6bdb4' },
  { id: 'shard_circuit', key: 'circuit', name: 'Circuit Core',       tier: 'uncommon',  value: [8, 14],    color: '#4ecb5a' },
  { id: 'shard_crystal', key: 'crystal', name: 'Data Crystal',       tier: 'rare',      value: [20, 30],   color: '#3d8bff' },
  { id: 'shard_ecto',    key: 'ecto',    name: 'Ecto Core',          tier: 'epic',      value: [40, 60],   color: '#b35cff' },
  { id: 'shard_algo',    key: 'algo',    name: 'Algorithm Fragment', tier: 'legendary', value: [70, 100],  color: '#ff9a1f' },
  { id: 'shard_source',  key: 'source',  name: 'Source Code',        tier: 'mythic',    value: [150, 220], color: '#ff3b6b' },
];
export const SHARD_IDS = SHARD_DEFS.map((s) => s.id);
export const shardOfTier = (tier) => SHARD_DEFS[tierIndex(tier)].id;
export const shardDef = (id) => SHARD_DEFS.find((s) => s.id === id) || null;
/** crafting's `comp_crystal` counts as a Data Crystal for forge costs (same name, same fiction). */
export const SHARD_ALIASES = { shard_crystal: ['comp_crystal'] };
export const BACKUP_ID = 'forge_backup';
export const BACKUP_COST = { id: 'shard_crystal', n: 3 };
/** live cost of a Backup Drive (difficulty.js: x2 shards in Standard from quota 3) */
export const backupCost = () => ({ id: BACKUP_COST.id, n: Math.ceil(BACKUP_COST.n * forgeDriveMul()) });

/** Shard Exchange: 5 lower shards -> 1 upper shard, up to Legendary (Source Code can never be bought). */
export const EXCHANGE_N = 5;
export function exchangeRule(shardId) {
  const i = SHARD_IDS.indexOf(shardId);
  if (i < 0 || i >= SHARD_IDS.length - 2) return null;   // Algorithm Fragment / Source Code cannot be converted upward
  return { from: shardId, n: EXCHANGE_N, to: SHARD_IDS[i + 1] };
}

// ------------------------------------------------------------------------------------------------ +1 ... +9
export const MAX_PLUS = 9;
/** Row N = the attempt to reach +N. chance 0..1, credits, mat = [shardId, n], bonus = damage (weapon) / DR (gear) multiplier. */
export const PLUS = [
  null,
  { lv: 1, chance: 1.00, credits: 20,  mat: ['shard_scrap', 2],   bonus: 0.06 },
  { lv: 2, chance: 1.00, credits: 35,  mat: ['shard_scrap', 3],   bonus: 0.12 },
  { lv: 3, chance: 0.95, credits: 55,  mat: ['shard_circuit', 2], bonus: 0.18 },
  { lv: 4, chance: 0.85, credits: 80,  mat: ['shard_circuit', 3], bonus: 0.24 },
  { lv: 5, chance: 0.70, credits: 120, mat: ['shard_crystal', 2], bonus: 0.31 },
  { lv: 6, chance: 0.55, credits: 170, mat: ['shard_crystal', 3], bonus: 0.38 },
  { lv: 7, chance: 0.40, credits: 240, mat: ['shard_ecto', 2],    bonus: 0.46 },
  { lv: 8, chance: 0.30, credits: 330, mat: ['shard_algo', 2],    bonus: 0.55 },
  { lv: 9, chance: 0.20, credits: 450, mat: ['shard_source', 1],  bonus: 0.65 },
];
/** A failed attempt at this level and above drops the item one level (Backup Drive prevents it). */
export const FAIL_DROP_FROM = 6;   // legacy default; the live value comes from difficulty.js (forgeFailFrom: 6 Casual / Standard, 5 Hard from quota 3)
export const SACRIFICE_BONUS = 0.10;

export const plusBonus = (n) => PLUS[clamp(n | 0, 0, MAX_PLUS)]?.bonus || 0;
/** Damage (weapon) / stat (gear) multiplier of a +N item. */
export const plusMul = (n) => 1 + plusBonus(n);
export const plusInfo = (target) => PLUS[target] || null;
/** Faint glow from +3, tier aura + sparks from +5, glitch camo from +7, full camo + trail + sound at +9. */
export const glowLevel = (n) => (n >= 9 ? 4 : n >= 7 ? 3 : n >= 5 ? 2 : n >= 3 ? 1 : 0);

export function canEnhance(def) { return !!def && (def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'trinket'); }
/** Overclock sockets only exist on weapons: +5 opens the first, +9 the second. */
export function overclockSlots(plus, def = null) {
  if (def && def.kind !== 'weapon') return 0;
  return plus >= 9 ? 2 : plus >= 5 ? 1 : 0;
}
export const trimOverclocks = (oc, plus, def = null) => (Array.isArray(oc) ? oc.slice(0, overclockSlots(plus, def)) : []);

/** What one attempt costs / gives. `cur` = current plus, returns null at +9. */
export function enhanceInfo(cur, { backup = false } = {}) {
  const target = (cur | 0) + 1;
  const row = PLUS[target];
  if (!row) return null;
  return {
    target, chance: row.chance, credits: row.credits, mat: row.mat.slice(), bonus: row.bonus, from: plusBonus(cur),
    failDrops: target >= forgeFailFrom(), protect: !!backup && target >= forgeFailFrom(),
    opens: overclockSlots(target) > overclockSlots(cur) ? overclockSlots(target) : 0,
  };
}

/** Pure resolution of ONE attempt. roll = rng.next() in [0,1). Returns { ok, from, to, chance, backupUsed, dropped }. */
export function resolveEnhance(cur, roll, { backup = false } = {}) {
  const info = enhanceInfo(cur);
  if (!info) return null;
  const ok = roll < info.chance;
  if (ok) return { ok: true, from: cur, to: info.target, chance: info.chance, backupUsed: false, dropped: false };
  if (!info.failDrops) return { ok: false, from: cur, to: cur, chance: info.chance, backupUsed: false, dropped: false };
  if (backup) return { ok: false, from: cur, to: cur, chance: info.chance, backupUsed: true, dropped: false };
  return { ok: false, from: cur, to: Math.max(0, cur - 1), chance: info.chance, backupUsed: false, dropped: true };
}

// ------------------------------------------------------------------------------------------------ overclocks
export const OVERCLOCKS = {
  shock:  { id: 'shock',  name: 'Shock',  icon: '⚡', color: '#8fe8ff', desc: 'Hits chain to 2 nearby enemies (35% damage).' },
  burn:   { id: 'burn',   name: 'Burn',   icon: '🔥', color: '#ff8a1a', desc: 'Sets the target on fire: 30% of the hit per second for 4 s.' },
  freeze: { id: 'freeze', name: 'Freeze', icon: '❄', color: '#9fdcff', desc: 'Slows the target by 45% for 3 s.' },
  void:   { id: 'void',   name: 'Void',   icon: '◐', color: '#b35cff', desc: 'Pierces armour: +25% true damage that ignores affix armour.' },
  vamp:   { id: 'vamp',   name: 'Vamp',   icon: '♥', color: '#ff5a7a', desc: 'Steals 6% of damage dealt as health.' },
  viral:  { id: 'viral',  name: 'Viral',  icon: '☣', color: '#7dff7d', desc: 'Enemies killed by you burst, hurting everything within 4 m.' },
};
export const OVERCLOCK_IDS = Object.keys(OVERCLOCKS);
/** Pick a new overclock the item does not own yet (rng = anything with next()). */
export function rollOverclock(rng, owned = []) {
  const pool = OVERCLOCK_IDS.filter((id) => !owned.includes(id));
  return pool.length ? pool[Math.floor(rng.next() * pool.length) % pool.length] : null;
}

/** "+7 Katana ⚡" (name shown everywhere an item is named). */
export function forgeName(name, plus = 0, oc = null) {
  let s = name;
  if (plus > 0) s = `+${plus} ${s}`;
  if (oc && oc.length) s = `${s} ⚡`;
  return s;
}

// ------------------------------------------------------------------------------------------------ ascension (tier up)
export const ASCEND = {
  uncommon:  { chance: 0.90, shard: 'shard_circuit', n: 3, credits: 50 },
  rare:      { chance: 0.75, shard: 'shard_crystal', n: 3, credits: 120 },
  epic:      { chance: 0.55, shard: 'shard_ecto',    n: 3, credits: 300 },
  legendary: { chance: 0.35, shard: 'shard_algo',    n: 3, credits: 700 },
  mythic:    { chance: 0.15, shard: 'shard_source',  n: 2, credits: 1600 },
};
/** Workbench tier-up (crafting.js) stops at Rare; Epic and above only at the HQ Altar. */
export const WORKBENCH_MAX_TIER = 'rare';
export function ascendInfo(fromTier, { sacrifice = false } = {}) {
  const i = tierIndex(fromTier);
  if (i >= TIER_ORDER.length - 1) return null;
  const to = TIER_ORDER[i + 1];
  const a = ASCEND[to];
  return { from: fromTier, to, chance: Math.min(0.98, a.chance + (sacrifice ? SACRIFICE_BONUS : 0)), credits: a.credits, mat: [a.shard, a.n], sacrifice: !!sacrifice };
}
/** Failure never lowers the tier; the materials (and the sacrifice) are gone. */
export function resolveAscend(fromTier, roll, opts = {}) {
  const info = ascendInfo(fromTier, opts);
  if (!info) return null;
  const ok = roll < info.chance;
  return { ok, from: fromTier, to: ok ? info.to : fromTier, chance: info.chance };
}

// ------------------------------------------------------------------------------------------------ creature tiers
export const CREATURE_TIERS = {
  common:    { mul: 1.0,  xp: 1.0, affixes: 0, drops: [['shard_scrap', 0.40]] },
  uncommon:  { mul: 1.25, xp: 1.3, affixes: 0, drops: [['shard_scrap', 0.40], ['shard_circuit', 0.30]] },
  rare:      { mul: 1.6,  xp: 1.7, affixes: 0, drops: [['shard_scrap', 0.40], ['shard_circuit', 0.30], ['shard_crystal', 0.30]] },
  epic:      { mul: 2.1,  xp: 2.3, affixes: 1, drops: [['shard_scrap', 0.40], ['shard_circuit', 0.30], ['shard_crystal', 0.30], ['shard_ecto', 0.25]] },
  legendary: { mul: 2.8,  xp: 3.2, affixes: 2, drops: [['shard_scrap', 0.40], ['shard_circuit', 0.30], ['shard_crystal', 0.30], ['shard_ecto', 0.25], ['shard_algo', 0.30]] },
  mythic:    { mul: 4.0,  xp: 5.0, affixes: 3, drops: [['shard_scrap', 0.40], ['shard_circuit', 0.30], ['shard_crystal', 0.30], ['shard_ecto', 0.25], ['shard_algo', 0.30], ['shard_source', 0.25]] },
};
export const creatureTierMul = (tier) => CREATURE_TIERS[tier]?.mul || 1;
export const creatureTierXp = (tier) => CREATURE_TIERS[tier]?.xp || 1;
export const creatureAffixCount = (tier) => CREATURE_TIERS[tier]?.affixes || 0;
/** Bosses have a fixed tier (their stats are hand-tuned: no multiplier, but they drop the matching shards). */
export const BOSS_TIERS = { foreman: 'legendary', legacybot: 'mythic' };
/** Extra affixes beyond the primary one (the existing elite affix system) that the forge implements itself. */
export const EXTRA_AFFIXES = ['paywalled', 'evergreen'];
export const EXTRA_ARMOR = 0.30;       // damage taken x0.70 with the extra 'paywalled'
export const EXTRA_REGEN = 0.02;       // max HP per second after 3 s without being hurt

/** Highest tier that may spawn (design: quota 0-1 Uncommon, 2-3 Rare, Mythic only sector 6+ or Threat FUCKED). */
export function creatureTierCap(quotaIndex = 0, threat = 0) {
  const q = Math.max(0, quotaIndex | 0);
  if (q <= 1) return 'uncommon';
  if (q <= 3) return 'rare';
  return q >= 6 || threat >= 75 ? 'mythic' : 'legendary';
}
/** 0..0.5 luck fed to tiers.rollTier: sector + Threat + moon danger. */
export function creatureTierLuck(quotaIndex = 0, threat = 0, moonTier = 1) {
  return clamp((quotaIndex | 0) * 0.02 + (Number(threat) || 0) / 100 * 0.2 + (Math.max(1, moonTier) - 1) * 0.04, 0, 0.5);
}
/** Can this creature definition carry a tier? Only killable living things (no hazards, bosses, unkillables, summons). */
export function tierable(def) {
  return !!def && def.hp != null && !def.hazard && !def.boss && !def.noSpawn && !def.noTier;
}
export function rollCreatureTier(rng, { quotaIndex = 0, threat = 0, moonTier = 1 } = {}) {
  return rollTier(rng, { luck: creatureTierLuck(quotaIndex, threat, moonTier), maxTier: creatureTierCap(quotaIndex, threat) });
}
/** Shard drops of a killed creature of this tier: [{ id, n }] (each row rolls independently). */
export function creatureShardDrops(tier, rng) {
  const out = [];
  for (const [id, p] of (CREATURE_TIERS[tier] || CREATURE_TIERS.common).drops) if (rng.next() < p) out.push({ id, n: 1 });
  return out;
}
/** Item tier floor of the creature's own item drop: one tier below the creature (Rare+ only). */
export function creatureItemMinTier(tier) {
  const i = tierIndex(tier);
  return i >= 2 ? TIER_ORDER[i - 1] : 'common';
}
export const tierColorOf = (tier) => (TIERS[tier] || TIERS.common).color;

// ------------------------------------------------------------------------------------------------ rng (seeded, logged, forceable)
export class ForgeRng {
  constructor(seed = 1) { this.rng = new RNG(seed); this.forced = []; this.log = []; }
  /** tests: the next rolls are exactly these values */
  force(...vals) { this.forced.push(...vals); return this; }
  next(tag = '') {
    const v = this.forced.length ? this.forced.shift() : this.rng.next();
    this.log.push({ tag, v: Math.round(v * 1e5) / 1e5 });
    if (this.log.length > 120) this.log.shift();
    return v;
  }
}
