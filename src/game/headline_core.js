// HEADLINE core (wave 8 trim, docs/wave8/trim.md): PURE rules, no DOM / THREE / game imports, node-tested (tools/harness/trim.test.mjs).
// A landing carries at most ONE headline modifier; the rest are suppressed that day. Order = what is already known when it is decided:
//   mapmods  the sector-map affix set (rolled on arrival in orbit)      role   the role day (rolled in orbit, announced there: "Tomorrow, casting call")
//   warp     a voyage warp that fired at the lever (never rolled on a mapmods / role day)
//   daily    the daily event (rolled at the lever, so it can only yield to the three above)      trend  the weekly trend creature (only when nothing else)
export const ORDER = Object.freeze(['mapmods', 'role', 'warp', 'daily', 'trend']);
export const LABEL = Object.freeze({ mapmods: 'SECTOR MAP', role: 'ROLE DAY', warp: 'VOYAGE WARP', daily: 'DAILY EVENT', trend: 'TRENDING' });

/** cands = { mapmods, role, warp, daily, trend, weekly } (truthy = present). Returns the winning kind or 'none'. */
export function pickHeadline(cands) {
  const c = cands || {};
  if (c.weekly && c.daily) return 'daily';   // the weekly challenge is an opt-in mode with its own mutators: it always keeps the day
  for (const k of ORDER) if (c[k]) return k;
  return 'none';
}

/** may the role day be rolled now? (never on top of a mapmods affix set) */
export const roleMayRoll = (mmAffixCount) => !(mmAffixCount > 0);
/** may a voyage warp roll now? (never on top of a mapmods affix set or a scheduled role day) */
export const warpMayRoll = (mmAffixCount, roleScheduled) => !(mmAffixCount > 0) && !roleScheduled;
/** the trend creature only acts on a landing whose headline is the trend (or on runs from an old host that never decided: hl = null) */
export const trendActive = (hl) => !hl || !hl.k || hl.k === 'trend';

/** sector-map affix cards wait until quota 2 for a fresh staged profile (veterans, unlock-everything and Quick Shift are never gated) */
export const AFFIX_Q = 2;
export function affixCalm(o) {
  const { mode = null, q = 0, quick = false, unlockAll = false } = o || {};
  if (unlockAll || quick || mode !== 'staged') return false;
  return (q | 0) < AFFIX_Q;
}
