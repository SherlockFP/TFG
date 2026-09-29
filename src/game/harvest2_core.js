// HARVEST2 - pure rules (no DOM / three / game access; node-tested by tools/harness/harvest2.test.mjs).
// Big harvestables (trees, rocks) are gathered by HITTING them with the held item (docs/wave5/harvest2.md, MASTERPLAN 25.8).
// The client only reports {id, base melee damage, tool class}; the HOST multiplies, validates (distance, rate) and applies HP.

export const MULT = {
  tree: { axe: 2, pick: 0.6, weapon: 0.6, hand: 0.3 },
  rock: { axe: 0.6, pick: 2, weapon: 0.6, hand: 0.3 },
};
export const TOOL_IDS = { axe: /^(tool_axe|axe|hatchet|x_axe)$/, pick: /^(tool_pickaxe|tool_pickaxe_steel|tool_drill|pickaxe|x_pickaxe)$/ };
export const MAX_BASE_DMG = 120;      // host clamp on the client-reported base melee damage (crits / heavy swings included)
export const MIN_BASE_DMG = 3;        // floor so a bare-handed swing always chips something
export const HIT_RANGE = 6;           // host: max horizontal distance sender -> target
export const HIT_RANGE_Y = 6;
export const MIN_HIT_GAP = 0.2;       // host: min seconds between hits of one player on one target
export const MIN_PEER_GAP = 0.08;     // host: min seconds between ANY two hit requests of one player (spam guard)
export const hpFor = (kind, scale) => (kind === 'tree' ? 50 + 30 * scale : 90 + 50 * scale);

/** 'axe' | 'pick' | 'weapon' | 'hand' from a held item definition (null = bare hands) */
export function toolClass(def) {
  if (!def) return 'hand';
  const id = def.id || '';
  if (TOOL_IDS.axe.test(id)) return 'axe';
  if (TOOL_IDS.pick.test(id)) return 'pick';
  if (def.kind === 'weapon' && !def.ranged && (def.dmg || 0) > 0) return 'weapon';
  return 'hand';   // torches, scrap, ranged guns: you bonk with it like a fist
}
export const multiplier = (cls, kind) => (MULT[kind] || MULT.rock)[cls] ?? MULT[kind]?.hand ?? 0.3;

/** final HP damage of one hit. `base` = the melee damage of the swing (client-reported, clamped here) */
export function hitDamage(base, cls, kind) {
  const b = Math.min(MAX_BASE_DMG, Math.max(MIN_BASE_DMG, Number(base) || 0));
  return Math.round(b * multiplier(cls, kind) * 10) / 10;
}

/**
 * Host validation of one hit request. `ctx` = { now, peerLast, pairLast, pos:{x,y,z}, target:{x,y,z}, fallen }.
 * Returns { ok:true } or { ok:false, why }.
 */
export function validateHit(ctx) {
  if (!ctx.target) return { ok: false, why: 'target' };
  if (ctx.fallen) return { ok: false, why: 'fallen' };
  if (!ctx.pos) return { ok: false, why: 'pos' };
  if (Math.hypot(ctx.pos.x - ctx.target.x, ctx.pos.z - ctx.target.z) > HIT_RANGE || Math.abs(ctx.pos.y - ctx.target.y) > HIT_RANGE_Y) return { ok: false, why: 'range' };
  if (ctx.now - (ctx.peerLast ?? -9) < MIN_PEER_GAP) return { ok: false, why: 'rate' };
  if (ctx.now - (ctx.pairLast ?? -9) < MIN_HIT_GAP) return { ok: false, why: 'rate' };
  return { ok: true };
}

/** hits needed to fell a target of `hp` with `base` melee damage and a tool class (planning / balance helper) */
export const hitsToBreak = (hp, base, cls, kind) => Math.ceil(hp / Math.max(0.1, hitDamage(base, cls, kind)));

/** wobble offset (rad) of a struck target, t in 0..1 */
export const wobble = (t, amp = 0.05) => (t >= 1 ? 0 : Math.sin(t * Math.PI * 5) * amp * (1 - t) * (1 - t));

/** drop table of a harvested kind */
export const DROPS = {
  tree: { item: 'comp_wood', kind: 'wood', n: [2, 4], bigBonus: 1 },
  rock: { item: 'comp_scrapmetal', kind: 'metal', n: [1, 3], crystalChance: 0.07 },
};
