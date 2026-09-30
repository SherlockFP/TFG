// SWARM11 wave 11 - pure rules of the creature-ecology module (docs/wave11/swarm11.md). No THREE / DOM: node-tested (tools/harness/swarm11.test.mjs).
//   SCRAPERS   a colony of small bots that carry LOOSE scrap to a glowing NEST (sw_nest, smashable). Taking a heap item or hitting the nest wakes them.
//   STREAMER   ring-light creature that never attacks: while LIVE it pulls every calm creature within 30 m to itself. Break the ring light (half its HP) or use it.
//   AUTOMOD    janitor-like moderator: deletes bodies, dropped items, chalk and blood; a player who lingers next to a body is "flagged" (telegraphed heavy hit).
export const IDS = Object.freeze({ scraper: 'sw_scraper', nest: 'sw_nest', streamer: 'sw_streamer', automod: 'sw_automod' });
export const ALL_IDS = Object.freeze([IDS.scraper, IDS.nest, IDS.streamer, IDS.automod]);

export const TUNE = Object.freeze({
  // ---- Scrapers: every damage moment has the 1.0 s nest alarm + a 0.85 s lunge wind-up in front of it
  scr: {
    min: 5, max: 8, cap: 12, hp: 30, dmg: 6, walk: 2.5, run: 4.6, carryMul: 0.85,
    forageR: 26, pickR: 1.15, depositR: 1.7, heapR: 5.2, homeR: 30,          // heapR: an item this close to the nest counts as stored
    alarmT: 1.0, rageT: 20, leash: 48, guardR: 6.5, guardFill: 1.4,           // guardR / guardFill: a player this close for this long wakes the colony
    windup: 0.85, attackT: 0.45, reach: 1.9, hitReach: 2.3, cd: 2.4,
    nestHp: 120, bonusMax: 4, bonusEvery: 4,
  },
  colony: { base: 0.35, poolBonus: 0.5, doorDist: 16, tickMs: 250 },
  // ---- Streamer: bootT is the telegraph (ring light warms + "LIVE!" jingle) before the first pull
  live: {
    hp: 70, breakFrac: 0.5, bootT: 1.6, liveT: 24, coolMin: 12, coolMax: 20, pulse: 1.5, radius: 30, dy: 7, loud: 3.4, hear: 26,
    fleeT: 10, walk: 1.9, run: 4.2, budget: 6, toastR: 70, standOff: 9,
  },
  // ---- AutoMod: scan (locks a target) -> sweep 2.4 s (cleans it) ; dwell meter -> hunt -> flag 1.3 s telegraph -> delete (heavy hit)
  mod: {
    hp: 220, dmg: 55, walk: 1.7, run: 3.4, scanR: 30, scanEvery: 1.0, sweepT: 2.4, reach: 1.7, dropGrace: 8, protectR: 3,
    bodyR: 4.5, dwellFill: 4, dwellDrain: 1.5, awareR: 22, flagT: 1.3, strikeT: 0.55, hitReach: 2.8, cd: 7, bloodCap: 28, bloodGap: 1.4, aimEvery: 1,
  },
  minQuota: { sw_streamer: 1, sw_automod: 3 },   // wave 12 balance12: AutoMod (55 dmg delete) from quota 3 (was 1)
  spawn: {
    sw_streamer: { zone: 'in', w: [0, 4, 6, 7], interior: { office: 1.3, serverfarm: 1.3, mansion: 0.8 } },
    sw_automod: { zone: 'in', w: [0, 3, 5, 6], interior: { office: 1.3, hospital: 1.2, factory: 0.9 } },
  },
});

export const quotaAllows = (id, quotaIndex) => (quotaIndex | 0) >= (TUNE.minQuota[id] ?? 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ Scrapers
/** chance that a moon gets a colony (host, seeded by the run): every moon has one sometimes, a moon whose pool lists them nearly always */
export function colonyChance(inPool, quotaIndex = 0) { const T = TUNE.colony; return clamp(T.base + (inPool ? T.poolBonus : 0) + Math.min(0.1, (quotaIndex | 0) * 0.02), 0, 0.95); }
/** how many bots: quota 0 is the small colony */
export function colonySize(r01, quotaIndex = 0) { const S = TUNE.scr; return quotaIndex < 1 ? S.min : S.min + Math.floor(clamp(r01, 0, 0.999) * (S.max - S.min + 1)); }
/** 0..1: how full / bright the nest is */
export const heapFill = (n, cap = TUNE.scr.cap) => clamp((n | 0) / cap, 0, 1);
/** bonus scrap pieces when the nest is smashed */
export const bonusCount = (n) => Math.min(TUNE.scr.bonusMax, 1 + Math.floor(Math.max(0, n | 0) / TUNE.scr.bonusEvery));
/** can a bot take this item? `it` = plain data { state, holder, owner, carrier, kind, type, soulbound, sellable, big, inShip, claimed } */
export function stealable(it) {
  return !!it && it.state === 'world' && !it.holder && !it.owner && !it.carrier && it.sellable && !it.big && it.type !== 'body' && !it.soulbound && !it.inShip && !it.claimed;
}
/** heap bookkeeping: 'in' (stored, still near the nest) | 'taken' (a player holds it -> wake the colony) | 'gone' (removed / carried off by something else) */
export function heapVerdict(it, dNest) {
  if (!it || it.state === 'removed') return 'gone';
  if (it.holder) return String(it.holder).startsWith('c:') ? 'gone' : 'taken';
  if (it.state !== 'world') return 'gone';
  return dNest <= TUNE.scr.heapR ? 'in' : 'gone';
}
/** guard meter of one player near the nest: fills while inside guardR (and the heap is not empty), drains outside */
export function guardStep(m, near, dt) { const S = TUNE.scr; return clamp(m + (near ? dt / S.guardFill : -dt / S.guardFill), 0, 1); }

// ------------------------------------------------------------------------------------------------ Streamer
const NEVER_PULL = new Set(['jester', 'sandkefal', 'mimicdoor', 'web', 'mine', 'turret', 'stalker', 'ticketswarm', 'editor', 'mannequin', 'dunemaw']);
/** may the stream pull this creature? def = CREATURES[type]; a hunting creature (state) keeps its prey; the module's own types are exempt */
export function attractable(type, def, state, isHunting = () => false) {
  if (!def || def.hazard || def.boss || NEVER_PULL.has(type) || String(type).startsWith('sw_')) return false;
  if (!(def.walk > 0)) return false;
  return !isHunting(state) && state !== 'dead' && state !== 'stunned';
}
/** 1 = ring pristine, ~0 = about to shatter, -1 = broken */
export function ringExtra(hp, maxHp, broken) {
  if (broken) return -1;
  const br = TUNE.live.breakFrac;
  return clamp((hp / maxHp - br) / (1 - br), 0, 1);
}
export const ringBreaks = (hp, maxHp) => maxHp > 0 && hp / maxHp <= TUNE.live.breakFrac;
export const nextCooldown = (r01) => TUNE.live.coolMin + (TUNE.live.coolMax - TUNE.live.coolMin) * clamp(r01, 0, 1);
/** phase of the live state by time in it: 'boot' | 'live' | 'done' */
export const livePhase = (t) => (t < TUNE.live.bootT ? 'boot' : t < TUNE.live.bootT + TUNE.live.liveT ? 'live' : 'done');
/** within reach of the pull (same floor band) */
export function inPullRange(sx, sy, sz, cx, cy, cz) { const L = TUNE.live; return Math.hypot(cx - sx, cz - sz) <= L.radius && Math.abs(cy - sy) <= L.dy; }

// ------------------------------------------------------------------------------------------------ AutoMod
export const KIND_WEIGHT = Object.freeze({ body: 0.55, item: 1, chalk: 1.15, blood: 1.3 });
/** nearest target by weighted distance; cands = [{ kind, id, x, y, z }]; the floor band is +-3 m */
export function pickTarget(cands, fx, fy, fz, maxR = TUNE.mod.scanR) {
  let best = null, bs = 1e9;
  for (const c of cands) {
    if (Math.abs(c.y - fy) > 3) continue;
    const d = Math.hypot(c.x - fx, c.z - fz);
    if (d > maxR) continue;
    const s = d * (KIND_WEIGHT[c.kind] ?? 1);
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}
/** a dropped item is fair game once it has lain unattended for dropGrace s with nobody within protectR */
export function itemCleanable(now, seenAt, nearestPlayerDist) { const M = TUNE.mod; return seenAt != null && now - seenAt >= M.dropGrace && nearestPlayerDist >= M.protectR; }
/** flag meter (0..1) of one player: fills while within bodyR of a lying body and the AutoMod is aware, drains faster when away */
export function dwellStep(m, nearBody, aware, dt) {
  const M = TUNE.mod;
  if (nearBody && aware) return clamp(m + dt / M.dwellFill, 0, 1);
  return clamp(m - dt / (M.dwellFill / M.dwellDrain), 0, 1);
}
/** stains: merge into an old one within bloodGap (it grows), else add; the oldest is dropped at bloodCap. returns { list, added, removed } */
export function addBlood(list, x, y, z, size, nextId) {
  const M = TUNE.mod;
  for (const b of list) if (Math.hypot(b.x - x, b.z - z) < M.bloodGap && Math.abs(b.y - y) < 1.5) { b.s = Math.min(2.4, b.s + size * 0.35); return { list, added: null, updated: b, removed: null }; }
  const b = { id: nextId, x, y, z, s: clamp(size, 0.5, 2.4) };
  list.push(b);
  const removed = list.length > M.bloodCap ? list.shift() : null;
  return { list, added: b, updated: null, removed };
}
/** one blood stain size from a hit / death */
export const bloodSize = (dmg, died) => (died ? 2.0 : clamp(0.5 + dmg / 60, 0.6, 1.5));
