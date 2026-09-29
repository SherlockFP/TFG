// SECTOR CORE / KEYSTONE / RAID planning - pure functions (no DOM, no three). Used by cycle.js (glue) and tools/harness/cycle2.test.mjs.
// Design: docs/MASTERPLAN.md 14 (sector cycle), 11 #15 (Corrupted Keystone), 11 #16 (raid), docs/wave3/cycle2.md.
//
//   coreMoonDef(runKey, sector)          the Sector Core moon (deterministic on every peer, registered into MOONS by cycle.js)
//   raidMoonDef(runKey, key, opts)       the raid facility moon (3 wings, 2 mazes, arena)
//   keystoneMoonDef(base, level, seed)   a real moon re-generated with wings / a labyrinth / an arena for a keystone run
//   planContent(layout, spec)            what goes where in a facility with wings / key rooms / an arena (rooms only, no world positions)
//   keystone*, raid*, weekKey            rules (affixes, timers, forces, rewards, weekly best, crew scaling)
import { RNG, hashString } from '../core/rng.js';
import { generateSector, mapScaleFor } from './moongen.js';
import { bossFor, keysNeeded, dominantInterior, hash01, crewMul, bossHp, secondPhase, BOSS_TABLE } from './cycle_core.js';

export const THEMES = ['factory', 'mansion', 'mineshaft', 'office', 'backrooms', 'serverfarm', 'sewer', 'hospital'];
export const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'];

// ------------------------------------------------------------------ Sector Core
export const coreId = (sector) => `core${Math.max(0, sector | 0)}`;
export const isCoreId = (id) => /^core\d+$/.test(String(id || ''));

/** Dominant interior of the sector's moons decides the boss (design 14). */
export function coreTheme(runKey, sector) {
  const sec = generateSector(String(runKey), Math.max(0, sector | 0));
  return dominantInterior(sec.moons.map((m) => m.interior), hash01(`coretheme:${runKey}:${sector}`));
}

export function coreLayoutOpts(sector) {
  return { plan: 'wings', wings: sector >= 1 ? 3 : 2, labyrinth: 1, arena: true, roomMul: 1.15, keys: keysNeeded(sector), kind: 'core' };
}

export function coreMoonDef(runKey, sector, theme = null) {
  sector = Math.max(0, sector | 0);
  const sec = generateSector(String(runKey), sector);
  theme = theme || coreTheme(runKey, sector);
  const same = sec.moons.filter((m) => m.interior === theme);
  const src = same[same.length - 1] || sec.moons[sec.moons.length - 1];
  const boss = bossFor(theme, sector);
  const size = +Math.min(2.4, Math.max(1.9, (src.size || 1.2) + 0.3)).toFixed(2);
  const tier = Math.max(2, Math.min(6, (src.tier || 2) + 1));
  const def = {
    ...src, generated: false, stale: false, core: true, coreSector: sector, id: coreId(sector),
    name: `SECTOR ${sector + 1} CORE`, short: `Core ${sector + 1}`, tier, cost: 0, size, mapScale: mapScaleFor(size, sector),
    interior: theme, weather: ['foggy'], mods: [], risk: 'LETHAL', riskScore: 5,
    scrapCount: [Math.round(src.scrapCount[0] + 6), Math.round(src.scrapCount[1] + 8)], scrapMul: +(src.scrapMul * 1.35).toFixed(2),
    power: Math.round((src.power || 5) * 1.25), outdoorPower: Math.max(2, Math.round((src.outdoorPower || 2) * 0.6)),
    coreBoss: { id: boss.id, name: boss.name, title: boss.title, rank: boss.rank },
    layoutOpts: coreLayoutOpts(sector),
    desc: `The Sector ${sector + 1} core. Boss: ${boss.name}, ${boss.title} (rank ${boss.rank}). Wings, elites, key holders and a locked boss arena. No time pressure, but the building gets hungrier.`,
  };
  delete def.slot; delete def.wantedInterior;
  return def;
}

// ------------------------------------------------------------------ content plan (rooms only)
/**
 * spec { sector, keys, crew, boss: 'kind' }. Returns { arena, keyHolders:[{room,wing}], keys, elites:[{room,wing,n}], bossRoom, guards:[{room}] }.
 * Never returns a key holder in the arena or in a sealed room; `keys` is lowered to the number of key rooms the layout has, so the arena
 * door can always be opened (0 key rooms = keys 0 = open at once). Deterministic in (layout.seed, spec).
 */
export function planContent(L, spec = {}) {
  const rng = new RNG(hashString('cycleplan:' + L.seed + ':' + (spec.kind || 'core')));
  const sector = spec.sector | 0, crew = Math.max(1, spec.crew | 0);
  const arenaId = L.arena ? L.arena.id : null;
  const isBad = (r) => !r || ['entrance', 'vault', 'generator', 'core'].includes(r.type) || r.treasure || r.arena;
  const keyRooms = (L.keyRooms || []).filter((id) => !isBad(L.rooms[id]));
  const keys = Math.max(0, Math.min(spec.keys ?? keysNeeded(sector), keyRooms.length));
  const keyHolders = keyRooms.slice(0, keys).map((room) => ({ room, wing: L.rooms[room].wing ?? -1 }));
  const elites = [];
  const perWing = spec.perWing ?? (2 + Math.floor(sector / 2) + (crew > 2 ? 1 : 0) + (crew > 4 ? 1 : 0));
  for (const w of L.wings || []) {
    const cand = rng.shuffle(w.rooms.filter((id) => !isBad(L.rooms[id]) && !keyHolders.some((k) => k.room === id) && L.rooms[id].w * L.rooms[id].h >= 4));
    for (let i = 0; i < Math.min(perWing, cand.length); i++) elites.push({ room: cand[i], wing: w.id, n: 1 });
  }
  // the labyrinth always holds one extra elite (besides a possible key holder)
  for (const mr of L.mazes || []) if (!keyHolders.some((k) => k.room === mr.id)) elites.push({ room: mr.id, wing: mr.wing ?? -1, n: 1, maze: true });
  const bossRoom = arenaId ?? (() => {   // no arena (attach failed): the biggest ordinary room is the lair (door stays open)
    let best = null;
    for (const r of L.rooms) if (!isBad(r) && (!best || r.w * r.h > best.w * best.h)) best = r;
    return best ? best.id : L.entrance.room.id;
  })();
  return { arena: arenaId, bossRoom, keys, keyHolders, elites, lockedArena: arenaId !== null && keys > 0 };
}

/** Rooms the arena boss may spawn near (centre first). The arena door stays locked only while lockedArena and keys are missing. */
export const arenaLocked = (plan, keysUsed) => !!plan?.lockedArena && (keysUsed | 0) < plan.keys;

// ------------------------------------------------------------------ CORRUPTED KEYSTONE (design 11 #15)
export const KS = { minLevel: 2, maxLevel: 40, baseTime: 540, timePerSize: 170, timePerLevel: -6, minTime: 420, spawnEvery: 24, wave: 14 };

/** affix table: `from` = first level it appears at. `k` = knobs the glue reads. */
export const KS_AFFIXES = {
  viral:       { from: 2, name: 'VIRAL',       desc: 'A dying creature spawns two Spam Bots.',                 k: { spread: 2 } },
  laggy:       { from: 3, name: 'LAGGY',       desc: 'Doors open 2.5 seconds after you ask.',                  k: { doorLag: 2.5 } },
  demonetized: { from: 4, name: 'DEMONETIZED', desc: 'Scrap is worth 25% less, XP is 30% higher.',             k: { lootMul: 0.75, xpMul: 1.3 } },
  overclocked: { from: 5, name: 'OVERCLOCKED', desc: 'Creatures move 15% faster.',                             k: { speedMul: 1.15 } },
  sponsored:   { from: 6, name: 'SPONSORED',   desc: 'Creatures spawn 2 levels higher (tougher, harder hitting).', k: { levelBonus: 2 } },
  trending:    { from: 7, name: 'TRENDING',    desc: 'Elite creatures are three times as common.',             k: { eliteMul: 3 } },
};
export const KS_AFFIX_IDS = Object.keys(KS_AFFIXES);

export const keystoneAffixes = (level) => KS_AFFIX_IDS.filter((id) => KS_AFFIXES[id].from <= (level | 0));
export function keystoneKnobs(level) {
  const k = { spread: 0, doorLag: 0, lootMul: 1, xpMul: 1, speedMul: 1, levelBonus: 0, eliteMul: 1 };
  for (const id of keystoneAffixes(level)) for (const [key, v] of Object.entries(KS_AFFIXES[id].k)) {
    if (key === 'lootMul' || key === 'xpMul' || key === 'speedMul' || key === 'eliteMul') k[key] = +(k[key] * v).toFixed(3); else k[key] = Math.max(k[key], v);
  }
  // base scaling with the key level itself
  k.levelBonus += Math.floor(Math.max(0, level - 2) / 3);
  return k;
}
/** seconds on the clock for a facility of `size` at `level` */
export const keystoneTime = (size, level) => Math.max(KS.minTime, Math.round(KS.baseTime + KS.timePerSize * (size || 1) + KS.timePerLevel * Math.max(0, level - 2)));
/** enemy-force points needed (each kill gives its `power`, min 0.5, elites x2) */
export const keystoneForces = (level, size = 1) => Math.round(14 + 2.5 * (level | 0) + 5 * (size || 1));
export const killPoints = (power, elite) => Math.max(0.5, +power || 0.5) * (elite ? 2 : 1);
/** +1 / +2 / +3 depending on the time left when the guardian died; a depleted key loses one level (never below the minimum) */
export function keystoneResult(level, timeLeftFrac, success) {
  if (!success) return { next: Math.max(KS.minLevel, level - 1), up: 0, depleted: true };
  const up = timeLeftFrac >= 0.4 ? 3 : timeLeftFrac >= 0.2 ? 2 : 1;
  return { next: Math.min(KS.maxLevel, level + up), up, depleted: false };
}
export const keystoneReward = (level, up, quotaIndex = 0) => ({ credits: Math.round(90 * level + 40 * quotaIndex), xp: Math.round(120 + 55 * level), coin: Math.round(20 + 6 * level), chestItems: 1 + up + (level >= 8 ? 1 : 0), minRarity: level >= 10 ? 'epic' : level >= 5 ? 'rare' : 'uncommon' });

/** the base moon regenerated with wings / labyrinth / arena. `base` is a MOONS entry. Returns the instance moon def. */
export function keystoneMoonDef(base, level, seed) {
  const size = +Math.min(2.4, Math.max(1.6, (base.size || 1.2) + 0.25)).toFixed(2);
  const def = {
    ...base, generated: false, stale: false, keystone: true, id: `ks${(seed >>> 0).toString(36)}`, baseMoon: base.id,
    name: `${base.short || base.name} +${level}`, short: `Key +${level}`, cost: 0, size, mapScale: mapScaleFor(size, base.sector | 0),
    layoutOpts: { plan: 'wings', wings: 2, labyrinth: 1, arena: true, roomMul: 1.05, keys: 0, kind: 'keystone' },
    desc: `Corrupted Keystone +${level}. Clear the enemy forces, then the Guardian, before the timer runs out.`,
  };
  delete def.slot; delete def.wantedInterior;
  return def;
}

// ISO week key ("2026-W39"), UTC. The weekly best resets with it.
export function weekKey(ms = Date.now()) {
  const d = new Date(ms);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7;
  const thursday = t + (4 - day) * 86400000;
  const y = new Date(thursday).getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}
/** weekly best: higher level wins, then more time left. Returns { best, improved }. */
export function bestUpdate(best, wk, level, timeLeft) {
  const cur = best && best.week === wk ? best : null;
  const better = !cur || level > cur.level || (level === cur.level && timeLeft > (cur.left || 0));
  return better ? { best: { week: wk, level, left: Math.max(0, Math.round(timeLeft)) }, improved: true } : { best: cur, improved: false };
}

// ------------------------------------------------------------------ RAID (design 11 #16)
export const RAID_DIFFS = {
  normal: { name: 'NORMAL', hp: 1, dmg: 1, elite: 1, tierAdd: 0, chests: 1, shard: 'shard_ecto' },
  heroic: { name: 'HEROIC', hp: 1.7, dmg: 1.2, elite: 1.4, tierAdd: 1, chests: 2, shard: 'shard_algo' },
  mythic: { name: 'MYTHIC', hp: 2.6, dmg: 1.45, elite: 2, tierAdd: 2, chests: 3, shard: 'shard_source' },
};
export const RAID_MIN_PLAYERS = 1, RAID_MAX_PLAYERS = 8;
/** boss HP multiplier for the crew: 1..4 follow the sector cycle table, 5..8 keep growing but slower per head (design: usable by any crew size) */
export const raidCrewMul = (n) => { n = Math.max(1, Math.min(RAID_MAX_PLAYERS, n | 0)); return n <= 4 ? crewMul(n) : +(crewMul(4) + 0.4 * (n - 4)).toFixed(2); };
export const raidCrewDmg = (n) => +(0.9 + 0.05 * Math.min(8, Math.max(1, n | 0))).toFixed(2);   // bosses hit a little harder in bigger crews
export const raidLockKey = (wk, diff) => `${wk}:${diff}`;

/** 3 distinct bosses (mid, mid, final) drawn from the whole table, deterministic in (runKey, week). The final is the highest rank. */
export function raidBosses(runKey, wk) {
  const r = new RNG(hashString(`raidbosses:${runKey}:${wk}`));
  const themes = r.shuffle(THEMES.slice()).slice(0, 3);
  const list = themes.map((th) => ({ theme: th, ...BOSS_TABLE[th] }));
  list.sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank) || a.hp - b.hp);
  return list;   // [mid1, mid2, final]
}
export function raidTheme(runKey, wk) { return new RNG(hashString(`raidtheme:${runKey}:${wk}`)).pick(THEMES); }
export function raidMoonDef(runKey, sector, wk, diff = 'normal') {
  const theme = raidTheme(runKey, wk);
  const D = RAID_DIFFS[diff] || RAID_DIFFS.normal;
  const tier = Math.min(6, 3 + Math.floor(Math.max(0, sector) / 2) + D.tierAdd);
  const size = 2.6;
  const bosses = raidBosses(runKey, wk);
  const R = new RNG(hashString(`raidmoon:${runKey}:${wk}`));
  return {
    id: 'raid1', name: "THE ALGORITHM'S CORE", short: 'RAID', tier, cost: 0, biome: R.pick(['datascape', 'ashfield', 'crystal', 'servermarsh']), interior: theme, size, mapScale: 1.25,
    raid: true, raidDiff: diff, generated: false, weather: ['foggy'], scrapCount: [26, 34], scrapMul: +(1.9 + 0.25 * tier).toFixed(2), power: Math.round(9 + 1.5 * tier), outdoorPower: 2,
    creatures: { scuttler: 14, yoinker: 6, crawler: 16, lurker: 10, mannequin: 8, spider: 12, screamer: 8, leech: 6, turret: 8, mine: 10 }, outdoor: { hound: 4 },
    mods: [], risk: 'LETHAL', riskScore: 5,
    layoutOpts: { plan: 'wings', wings: 3, labyrinth: 2, arena: true, roomMul: 1.3, keys: 2, kind: 'raid' },
    raidBosses: bosses.map((b) => ({ id: b.id, name: b.name, title: b.title, rank: b.rank, theme: b.theme })),
    desc: `Multi-wing raid: ${bosses.map((b) => b.name).join(', ')}. Scales to any crew size (1 to 8). Weekly lock on the raid chest per difficulty.`,
  };
}
/** rooms of a raid layout: mid boss 1 and 2 hold the keys in two wings, the final boss is in the arena */
export function raidPlan(L, spec = {}) {
  const base = planContent(L, { ...spec, keys: 2, kind: 'raid' });
  const holders = base.keyHolders.slice(0, 2);
  return { ...base, mids: holders.map((k, i) => ({ ...k, boss: i })), finalRoom: base.bossRoom };
}
/** number of elites per wing for the crew size and difficulty */
export const raidElites = (n, diff) => Math.round((2 + Math.ceil((n | 0) / 2)) * (RAID_DIFFS[diff]?.elite || 1));
export function raidReward(diff, crew, firstOfWeek) {
  const D = RAID_DIFFS[diff] || RAID_DIFFS.normal;
  return { chests: firstOfWeek ? D.chests : 0, shard: D.shard, shards: firstOfWeek ? 2 + D.tierAdd : 0, credits: Math.round(400 * (1 + D.tierAdd) * Math.max(1, crew)), xp: 500 * (1 + D.tierAdd), coin: 90 * (1 + D.tierAdd), minRarity: diff === 'mythic' ? 'legendary' : diff === 'heroic' ? 'epic' : 'rare' };
}

// ------------------------------------------------------------------ boss numbers used by the glue
/** final HP for a boss of `def` (base hp) in this context; keystone / raid multipliers stack on the cycle formula */
export function bossHpFor(def, { sector = 0, crew = 1, raid = false, hpMul = 1 } = {}) {
  return Math.max(1, Math.round((raid ? def.hp * (1 + 0.35 * Math.max(0, sector)) * raidCrewMul(crew) : bossHp(def.hp, sector, crew)) * hpMul));
}
export const phase2On = (sector, raid = false) => raid || secondPhase(sector);

// ------------------------------------------------------------------ world-position helper (pure): centre of a room in world metres
export function roomCenter(L, room) {
  const r = typeof room === 'number' ? L.rooms[room] : room;
  return { x: L.ox + (r.cx + 0.5) * L.cell, z: L.oz + (r.cz + 0.5) * L.cell, y: L.y };
}
/** rooms are `w x h` cells: the walkable centre for a room of even width is the cell (cx, cz) that generateLayout reports */
export function areaNameAt(L, cellIndex) { const a = L.areas?.[L.areaOf?.[cellIndex]]; return a ? a.name : null; }
