// MIRROR DIMENSION - timer, overtime, wave scaling, membership rules (PURE: node-testable, no DOM / three / game imports).
// The host director in mirror.js feeds these with the time each player has spent inside; docs/wave2/mirror.md lists every number.

export const MIRROR = {
  PORTAL_CHANCE: 0.25,      // share of outdoor maps that carry a mirror portal
  MIN_SECTOR: 1,            // no portals before sector 1 (run.quotaIndex >= 1)
  LIMIT_S: 180,             // visible countdown from the moment you step in (3:00)
  WARN_S: 30,               // below this the screen cracks and the mirror creaks
  OT_STEP_S: 20,            // overtime: one escalation step every 20 s
  ROUND_S: 38,              // one wave cycle ("round"); a cracked player sits out exactly one
  RESPAWN_S: 38,
  CAP: 50,                  // hard cap of live dimension creatures (all players together)
  ENTER_RANGE: 4,           // host: how close to the portal a request must come from
  RESPAWN_HP: 0.75,
};

// ---------------------------------------------------------------- countdown / overtime
/** seconds left on the countdown after `t` seconds inside (never below 0) */
export function timeLeft(t) { return Math.max(0, MIRROR.LIMIT_S - t); }
/** 0 while the countdown runs; 1 for the first 20 s past zero, 2 for the next 20 s ... (waves escalate hard with it) */
export function overtimeLevel(t) { return t <= MIRROR.LIMIT_S ? 0 : Math.floor((t - MIRROR.LIMIT_S) / MIRROR.OT_STEP_S) + 1; }
/** 'normal' | 'warn' (last 30 s: cracks) | 'overtime' */
export function timerPhase(t) { return t > MIRROR.LIMIT_S ? 'overtime' : MIRROR.LIMIT_S - t <= MIRROR.WARN_S ? 'warn' : 'normal'; }
/** wave cycle index (0 based) */
export function roundIndex(t) { return Math.max(0, Math.floor(t / MIRROR.ROUND_S)); }
/** how hard the ASCII effect glitches: 0 normally, ramps 0.35 .. 1 through overtime steps */
export function glitchLevel(t) { const ot = overtimeLevel(t); return ot <= 0 ? 0 : Math.min(1, 0.25 + 0.15 * ot); }
export function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

// ---------------------------------------------------------------- wave scaling
/** creature level (creatureLevelStats: +18% hp / +10% dmg per level): sector, time inside, overtime */
export function creatureLevel(sector, round, ot) { return Math.max(1, Math.min(14, 1 + Math.floor(sector / 2) + Math.floor(round / 2) + 2 * ot)); }
/** seconds between spawn groups for one player */
export function spawnInterval(round, ot) { return Math.max(0.9, 3.2 - 0.25 * round - 0.4 * ot); }
/** creatures per spawn group (spawnMul = game.balance creature spawn scale, clamped 0.5 .. 2) */
export function groupSize(round, ot, spawnMul = 1) {
  const m = Math.max(0.5, Math.min(2, spawnMul || 1));
  return Math.max(1, Math.min(7, Math.round((1 + Math.floor(round / 2) + ot) * m)));
}
/** live creature cap: grows with time and overtime, 50 hard for the whole dimension */
export function activeCap(round, ot, players = 1) {
  return Math.min(MIRROR.CAP, Math.round((10 + 3 * round + 5 * ot) * (1 + 0.35 * (Math.max(1, players) - 1))));
}
/** spawn weights by round: ghosts + fodder from the start, fire fiends from round 1, mirror copies from round 2 (needs crew to copy) */
export function typeWeights(round, ot) {
  return {
    zombot: Math.max(14, 40 - 4 * round),
    mr_ghost: 30 + 2 * round,
    mr_fiend: round >= 1 ? 12 + 2 * round + 3 * ot : 0,
    mr_copy: round >= 2 ? 8 + 2 * round + 3 * ot : 0,
  };
}
export function pickType(rnd, round, ot, opts = {}) {
  const w = typeWeights(round, ot);
  if (opts.noCopy) w.mr_copy = 0;
  const ids = Object.keys(w).filter((k) => w[k] > 0);
  let tot = 0; for (const k of ids) tot += w[k];
  let r = rnd() * tot;
  for (const k of ids) { r -= w[k]; if (r <= 0) return k; }
  return ids[ids.length - 1];
}
/** overtime elites: chance a spawned creature is elite */
export function eliteChance(ot) { return ot >= 2 ? Math.min(0.5, 0.1 * (ot - 1)) : 0; }

// ---------------------------------------------------------------- rewards
/** per-kill crystal XP and Reflection Meter value */
export const KILL_VALUE = { zombot: 4, mr_ghost: 7, mr_fiend: 12, mr_copy: 20 };
export function killValue(type, elite = false) { return Math.round((KILL_VALUE[type] ?? 5) * (elite ? 2.2 : 1)); }

// ---------------------------------------------------------------- membership (who sees / hits what)
/** a dimension creature / item / chest is visible to (and only interacts with) viewers who are inside; normal things are the reverse */
export function visibleTo(isMirrorEntity, viewerInside) { return !!isMirrorEntity === !!viewerInside; }
export const canTarget = visibleTo;
/** other-dimension players show as faint silhouettes instead of avatars */
export function showsAsSilhouette(viewerInside, otherInside) { return !!viewerInside !== !!otherInside; }

// ---------------------------------------------------------------- death rules
// members: array of { id, dead } (only players currently inside the dimension)
/** everyone inside is dead at the same time -> SHATTERED (real death for all of them) */
export function wiped(members) { return members.length > 0 && members.every((m) => m.dead); }
/** a cracked player respawns at the mirror only while at least one crewmate inside is still alive */
export function respawnEligible(members, id) {
  const me = members.find((m) => m.id === id);
  return !!me && me.dead && members.some((m) => m.id !== id && !m.dead);
}
/** every cracked member whose timer ran out and who may respawn now (deadAt: seconds on the host clock) */
export function dueRespawns(members, now) {
  return members.filter((m) => m.dead && now >= (m.respawnAt ?? Infinity) && respawnEligible(members, m.id)).map((m) => m.id);
}
/** the last living member walked out: cracked players still inside are pulled out alive ("rescued") instead of shattering */
export function rescued(membersBefore, leavingId) {
  const rest = membersBefore.filter((m) => m.id !== leavingId);
  const me = membersBefore.find((m) => m.id === leavingId);
  return !!me && !me.dead && rest.length > 0 && rest.every((m) => m.dead) ? rest.map((m) => m.id) : [];
}

// ---------------------------------------------------------------- portal
/** does this map carry a mirror? u = seeded roll in [0,1). Never before sector 1, never at HQ / company. */
export function hasPortal(sector, moon, u) {
  if (!(sector >= MIRROR.MIN_SECTOR) || !moon || moon.company) return false;
  return u < MIRROR.PORTAL_CHANCE;
}
