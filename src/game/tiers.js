// Shared item TIER contract (wave 1). Every module that shows, rolls or prices tiers uses this file so colours and
// multipliers match everywhere (inventory grid, loot beams, chests, shop, crafting, horde drops).
// Tier is a property of a world item instance (`it.tier`, synced in item state) OR of a definition (`def.tier`).
// Legacy `def.rarity` / `rarityOfValue()` from items.js map 1:1 onto the first five tiers.
export const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export const TIERS = {
  common:    { id: 'common',    name: 'Common',    color: '#9aa39a', hex: 0x9aa39a, valueMul: 1.0, statMul: 1.0,  weight: 60 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#4ecb5a', hex: 0x4ecb5a, valueMul: 1.25, statMul: 1.12, weight: 25 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#3d8bff', hex: 0x3d8bff, valueMul: 1.6, statMul: 1.25, weight: 10 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#b35cff', hex: 0xb35cff, valueMul: 2.1, statMul: 1.4,  weight: 4 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ff9a1f', hex: 0xff9a1f, valueMul: 2.8, statMul: 1.6,  weight: 0.9 },
  mythic:    { id: 'mythic',    name: 'Mythic',    color: '#ff3b6b', hex: 0xff3b6b, valueMul: 4.0, statMul: 1.85, weight: 0.1 },
};
export const tierIndex = (id) => Math.max(0, TIER_ORDER.indexOf(id));
export const tierDef = (id) => TIERS[id] || TIERS.common;
export const tierColor = (id) => tierDef(id).color;

/** Roll a tier with a seeded RNG (src/core/rng.js RNG, or anything with next()). luck 0..1 shifts weight upwards,
 *  minTier / maxTier clamp the result (e.g. a legendary chest never rolls below rare). */
export function rollTier(rng, { luck = 0, minTier = 'common', maxTier = 'mythic' } = {}) {
  const lo = tierIndex(minTier), hi = tierIndex(maxTier);
  const ids = TIER_ORDER.slice(lo, hi + 1);
  const ws = ids.map((id, i) => TIERS[id].weight * Math.pow(1 + luck * 2.5, i));
  let r = rng.next() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) return ids[i]; }
  return ids[ids.length - 1];
}

/** Tier of a world item instance / definition, falling back to value-based rarity for plain scrap. */
export function tierOfItem(it, def) {
  if (it?.tier && TIERS[it.tier]) return it.tier;
  if (it?.affix?.rarity && TIERS[it.affix.rarity]) return it.affix.rarity;
  if (def?.tier && TIERS[def.tier]) return def.tier;
  if (def?.rarity && TIERS[def.rarity]) return def.rarity;
  const v = it?.value ?? (Array.isArray(def?.value) ? (def.value[0] + def.value[1]) / 2 : 0);
  if (v >= 400) return 'mythic';
  if (v >= 200) return 'legendary';
  if (v >= 110) return 'epic';
  if (v >= 60) return 'rare';
  if (v >= 30) return 'uncommon';
  return 'common';
}
