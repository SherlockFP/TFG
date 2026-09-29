// HUBGATE core (wave 8, docs/wave8/hubgate.md): pure data + rules, no DOM / three / game imports (node-tested by tools/harness/hubgate.test.mjs).
//   1. SYSTEMS   the side systems behind the ship's Hub door: what each unlock id switches off while it is locked (terminal commands, hotkeys, HUD docks,
//                ship fixtures). The ladder itself (id -> quota) lives in onboard_core.js UNLOCKS; this file only adds the "what".
//   2. QUICK SHIFT  the one-day mode: seeded easy / medium moon, fixed small quota, 15-minute day clock, no persistence, the ladder never advances.
import { UNLOCKS, isOpen } from './onboard_core.js';
import { SPOTS, DECOR } from '../world/shiplayout.js';
import { RNG, hashString } from '../core/rng.js';

export const NET = 'hg';

/** fixture zones are ship-interior circles (world x, z, radius) taken from world/shiplayout.js, the single authority for where things stand */
const zone = (s, r) => ({ x: s.x, z: s.z, r });
/**
 * id -> what is inert while locked.
 *   cmds   terminal words                  keys   settings.keys action names (the module itself asks game.onboard.deny(id); listed for the docs / test)
 *   docks  hud dock item ids (hidden)      zones  ship interactables inside these circles are replaced by one "Unlocks at quota N" prompt
 *   hint   where the system lives (Hub panel line, EN; translated in hubgate.js)
 */
export const SYSTEMS = {
  shop: { hint: 'Company Store kiosk: rare and better stock.' },
  tree: { cmds: ['tree', 'respec', 'role'], keys: ['skillTree'], hint: 'Press K for the skill tree.' },
  arcade: { cmds: ['arcade'], zones: [zone(SPOTS.arcade, 0.8), zone(SPOTS.chess, 1.5)], hint: 'The arcade cabinet and the chess table in the ship.' },
  pets: { cmds: ['pets'], keys: ['pets'], zones: [zone(SPOTS.incubator, 0.8)], hint: 'Press N for your pets. The incubator is in the ship.' },
  homeworld: { cmds: ['home', 'factory', 'ghost'], docks: ['h2', 'h2g'], hint: 'Terminal: ROUTE HOME.' },
  farming: { zones: [zone(SPOTS.svPlanter, 0.9), zone(SPOTS.stove, 0.75), zone(SPOTS.brew, 0.7), ...DECOR.filter((d) => d.planter).map((d) => zone(d, 0.7))], hint: 'The planters, the stove and the brewing stand in the ship.' },
  restaurant: { hint: 'The restaurant.' },
  forge: { hint: 'The Monetizer at HQ.' },
  zones: { cmds: ['zones'], hint: 'Reclaim sectors: capture zone cores on the moons.' },
  voyage: { cmds: ['signals', 'missions', 'mission', 'take', 'dropjob', 'voyage', 'warp'], docks: ['vyprompt'], hint: 'Terminal: MOON RANDOM, SIGNALS, MISSIONS.' },
  season: { cmds: ['daily'], keys: ['daily'], docks: ['daily'], hint: 'Press F2 for the daily board and the season track.' },
  gates: { hint: 'Glitch gates open in orbit after the first sector boss.' },
};
/** the Hub panel shows every ladder id in ladder order */
export const HUB_ORDER = UNLOCKS.map((u) => u.id);
export const requirement = (id) => UNLOCKS.find((u) => u.id === id) || null;

/** terminal word -> unlock id (onboard.js builds its command guard from this; `moon random` / `route signal N` stay special cases there) */
export const HUB_CMDS = {};
for (const [id, def] of Object.entries(SYSTEMS)) for (const c of def.cmds || []) HUB_CMDS[c] = id;

/** hud dock ids to hide for the currently locked ids */
export function hiddenDocks(lockedIds) { const out = []; for (const id of lockedIds) out.push(...(SYSTEMS[id]?.docks || [])); return out; }

/** which locked system owns a ship position (interactable pos), or null. `lockedIds` = ids currently locked. */
export function zoneOwner(x, z, lockedIds) {
  for (const id of lockedIds) for (const q of SYSTEMS[id]?.zones || []) if (Math.hypot(x - q.x, z - q.z) <= q.r) return id;
  return null;
}

/** the host's ladder as run.hub = { mode, q, boss } (joiners are ruled by it); pure open test for a joiner */
export function hubOf(u, prog) {
  if (!u) return null;
  return { mode: u.mode === 'all' ? 'all' : 'staged', q: Math.max(u.q | 0, prog?.q | 0), boss: !!(u.boss || prog?.boss) };
}
export const hubOpen = (id, hub, unlockAll = false) => isOpen(id, hub ? { mode: hub.mode, q: hub.q | 0, boss: !!hub.boss } : null, { q: 0, boss: false }, unlockAll);
export const sameHub = (a, b) => !!a && !!b && a.mode === b.mode && a.q === b.q && a.boss === b.boss;
/** ids that are open under `hub` (Hub door lamp, panel) */
export const openIds = (hub, unlockAll = false) => HUB_ORDER.filter((id) => hubOpen(id, hub, unlockAll));

// ------------------------------------------------------------------------------------------------ QUICK SHIFT
export const QUICK = {
  v: 1,
  dayLengthSec: 900,                      // 15 real minutes for the 08:00 -> 24:00 clock (the campaign day is 720 s)
  moons: ['hamsi', 'lufer', 'palamut', 'levrek'],   // tier 1 (easy) and tier 2 (medium), none needs a purchase
  quotaByTier: { 1: 90, 2: 120 },         // scrap value to bring aboard in the one day (a 2-player crew's good day; the campaign's quota 1 is 130 over 3 days)
  xpMet: 120, coinMet: 25,                // extra reward when the quota is met (the normal survive XP still applies)
  xpShort: 40, coinShort: 5,
};
export function quickMoon(seed, moons) {
  const rng = new RNG(hashString('quick:' + seed));
  const pool = moons && moons.length ? moons : QUICK.moons;
  return pool[rng.int(0, pool.length - 1)];
}
export const quickQuota = (tier) => QUICK.quotaByTier[tier] || QUICK.quotaByTier[1];
/** the run fields a Quick Shift run starts with. `tierOf(moonId)` comes from moons.js (kept out of here). */
export function quickFields(seed, tierOf, avoid = null) {
  let moon = quickMoon(seed);
  if (avoid && moon === avoid) { const rest = QUICK.moons.filter((m) => m !== avoid); moon = rest[new RNG(hashString('quick2:' + seed)).int(0, rest.length - 1)]; }
  return { moon, quota: quickQuota(tierOf ? tierOf(moon) : 1), quotaIndex: 0, daysLeft: 1, day: 1, sold: 0, credits: 60, time: 480, quick: { v: QUICK.v, n: 0 } };
}
/** the end-of-shift result from the day summary every peer receives */
export function quickResult(summary, run) {
  const quota = run?.quota | 0, got = Math.max(0, summary?.collected | 0);
  const players = summary?.players || [];
  const alive = players.filter((p) => !p.dead).length;
  const ok = !summary?.allDead && got >= quota;
  return { ok, got, quota, pct: quota ? Math.min(999, Math.round((got / quota) * 100)) : 0, left: Math.max(0, summary?.leftValue | 0), crew: players.length, alive, deaths: players.length - alive, allDead: !!summary?.allDead, moon: summary?.moon || '' };
}
/** reward for a result: { xp, coin, reason } */
export function quickReward(res) { return res.ok ? { xp: QUICK.xpMet, coin: QUICK.coinMet } : { xp: QUICK.xpShort, coin: QUICK.coinShort }; }
