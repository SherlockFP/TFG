// MMO-style personal progression: XP curve, ranks, skill effects, mastery tree, rebirth (prestige),
// black market, bounties, quota formula.
import { RNG } from '../core/rng.js';
import { t } from '../core/i18n.js';
import { CREATURES } from './creatures.js';
import { treeBonus, treeFlags, treeSpent } from './passivetree.js';

// Level cap (raised from 50 -> 100 in the meta round). REBIRTH_LEVEL is where a Rebirth becomes available:
// levels past it keep paying skill points, a Rebirth trades the level for a permanent star.
export const MAX_LEVEL = 100;
export const REBIRTH_LEVEL = 50;
export const MAX_STARS = 20;          // stars keep counting (badge) up to here; the bonus stops at STAR_BONUS_CAP
export const STAR_BONUS_CAP = 10;

// XP curve history. Saves remember the curve they were earned under (profile.xpCurve); migrateXpCurve keeps
// the level (never lowers it, never touches skill points) and carries the in-level progress over as a fraction.
//   v1 (rounds 1-2, cap 50): 120 * L^1.55 + 80
//   v2 (round 3):            60 * L^1.3 + 100
//   v3 (balance round):      see xpForLevel
export const XP_CURVE_VERSION = 3;
const XP_CURVES = {
  1: (L) => Math.round(120 * Math.pow(Math.max(1, L), 1.55) + 80),
  2: (L) => Math.round(60 * Math.pow(Math.max(1, L), 1.3) + 100),
  3: (L) => Math.round(32 * Math.pow(Math.max(1, L), 1.2) + 80),
};

export function xpForLevel(level) {
  // XP needed to go from `level` to `level+1`. Tuned with tools/sim/economy.mjs: ~82k XP to the Rebirth at Lv.50
  // = ~21 h for a competent crew player (~16 h great, ~26-29 h average), Lv.100 (~370k) is the long tail (~90 h).
  return XP_CURVES[XP_CURVE_VERSION](level);
}

/**
 * Convert a profile saved under an older XP curve (idempotent, mutates, returns true when it changed anything).
 * Level and skill points are kept exactly; banked XP becomes the same fraction of the new level's requirement,
 * so loading an old save can never re-level (up or down) the player.
 */
export function migrateXpCurve(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.xpCurve === XP_CURVE_VERSION) return false;
  // saves without a version: round-3 profiles already carry the meta fields (prestige / mastery), older ones don't
  const from = XP_CURVES[p.xpCurve] ? p.xpCurve : (p.prestige || p.mastery ? 2 : 1);
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(p.level) || 1)));
  const xp = Math.max(0, Number(p.xp) || 0);
  const frac = Math.max(0, Math.min(0.999, xp / Math.max(1, XP_CURVES[from](lv))));
  p.level = lv;
  p.xp = Math.floor(frac * xpForLevel(lv));
  p.xpCurve = XP_CURVE_VERSION;
  return true;
}

/** Total XP from level 1 to `level` on the current curve (sims / UI). */
export function xpToReach(level) {
  let t = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) t += xpForLevel(l);
  return t;
}

// ---------------------------------------------------------------- run balance knobs (host.js + tools/sim/economy.mjs)
// One place for every number that scales a run with the quota index, so the economy sim and the host use the
// exact same formulas. q = run.quotaIndex (0 on the first quota), tier = moon tier (1..6).
export const BALANCE = {
  // Tuned with tools/sim/economy.mjs (balance round). Before: value +6 %/quota, +0.8 items/quota, creature budget
  // +25 %/quota and creature level +1/quota on top of the sector tier -> every crew farmed tier-1 moons and was
  // wiped around quota 6 while holding 20x the quota in scrap. Now the quota curve binds the economy and the crew
  // has to move to deeper (richer, riskier) moons as it grows: median quotas met ~8-11 (competent 2-4 players),
  // ~11-13 for great crews (p90 15+).
  quotaBase: 130,             // first quota
  quotaGrowth: 100,           // LC growth term: quotaGrowth * (1 + q^2/16) * (0.8..1.2)
  valuePerQuota: 0.015,       // scrap value multiplier growth per met quota
  countPerQuota: 0.2,         // extra indoor scrap items per met quota
  indoorPowerPerQuota: 0.03,  // indoor creature budget growth per met quota
  outdoorPowerPerQuota: 0.03, // outdoor creature budget growth per met quota
  levelPerTier: 0.6,          // creature level per moon tier above 1
  levelPerQuota: 0.25,        // creature level per met quota
  levelCap: 20,               // creature base-level ceiling (normal creatures + bosses)
};
export function scrapValueMul(q) { return 1 + BALANCE.valuePerQuota * Math.max(0, q | 0); }
export function scrapCountBonus(q) { return BALANCE.countPerQuota * Math.max(0, q | 0); }
export function indoorPowerMul(q) { return 1 + BALANCE.indoorPowerPerQuota * Math.max(0, q | 0); }
export function outdoorPowerMul(q) { return 1 + BALANCE.outdoorPowerPerQuota * Math.max(0, q | 0); }
/** Base creature level for a moon tier + quota index (host adds a -1..+2 roll; bosses use it as is). */
export function creatureBaseLevel(tier, q) {
  const t = Math.max(1, Number(tier) || 1);
  return Math.max(1, Math.min(BALANCE.levelCap, Math.round(1 + (t - 1) * BALANCE.levelPerTier + Math.max(0, q | 0) * BALANCE.levelPerQuota)));
}

export const RANKS = [
  [1, 'Lurker'], [3, 'Newbie'], [6, 'Poster'], [10, 'Regular'], [15, 'Moderator'],
  [20, 'Admin'], [26, 'Influencer'], [33, 'Viral'], [41, 'Main Character'], [50, 'Internet Legend'],
  [60, 'Terminally Online'], [70, "Algorithm's Chosen"], [80, 'Server Deity'], [90, 'Dead Internet'], [100, 'The Final Post'],
];
export function rankOf(level) {
  let r = RANKS[0][1];
  for (const [lv, name] of RANKS) if (level >= lv) r = name;
  return t(r);
}

// LEGACY base skills. Since the passive tree (passivetree.js, K) the six skills are no longer sold: profile.js refunds every
// point once (profile.rpg.v) and the tree carries the same effects (Vitality -> Thick Skin, Agility -> Quick Feet ...).
// The table and the derivedStats terms stay so old saves, mods and tools keep working (all zero after the refund).
export const SKILLS = {
  vit: { name: 'Vitality', short: 'VIT', desc: '+10 max health per point' },
  end: { name: 'Endurance', short: 'END', desc: '+12 max stamina, faster regen' },
  str: { name: 'Strength', short: 'STR', desc: '+8% melee damage, -6 lb effective carry weight' },
  agi: { name: 'Agility', short: 'AGI', desc: '+2.5% move speed, +3% jump' },
  lck: { name: 'Luck', short: 'LCK', desc: '+2% scrap value, +1.5% crit chance' },
  tec: { name: 'Tech', short: 'TEC', desc: '+10% battery life, +2 m scan range, easier minigames' },
};
export const SKILL_CAP = 20;

// ---------------------------------------------------------------- mastery tree (skill point sink past the base skills)
// Nodes cost 1 skill point per rank. A tier opens at its level AND after `need` points in the tiers below.
// Mastery is permanent: it survives a Rebirth (base skills do not). Any star unlocks every tier's level gate.
export const MASTERY_TIERS = [
  { tier: 1, name: 'Tier I', minLevel: 12, need: 0 },
  { tier: 2, name: 'Tier II', minLevel: 25, need: 6 },
  { tier: 3, name: 'Tier III', minLevel: 40, need: 14 },
];
export const MASTERY = {
  thick: { tier: 1, icon: '🛡', name: 'Thick Skin', tr: 'Kalın Deri', max: 5, desc: '+2% damage reduction per rank', trDesc: 'Rütbe başına +%2 hasar azaltma', fx: { armor: 0.02 } },
  marathon: { tier: 1, icon: '🏃', name: 'Marathon', tr: 'Maraton', max: 5, desc: '+8 max stamina, +5% regen per rank', trDesc: 'Rütbe başına +8 dayanıklılık, +%5 yenilenme', fx: { maxStamina: 8, regenPct: 0.05 } },
  bruiser: { tier: 1, icon: '👊', name: 'Bruiser', tr: 'Kabadayı', max: 5, desc: '+5% melee damage per rank', trDesc: 'Rütbe başına +%5 yakın dövüş hasarı', fx: { meleePct: 0.05 } },
  hoarder: { tier: 1, icon: '🎒', name: 'Hoarder', tr: 'İstifçi', max: 5, desc: '-4 lb effective carry weight per rank', trDesc: 'Rütbe başına -4 lb taşıma ağırlığı', fx: { carryRelief: 4 } },
  parkour: { tier: 2, icon: '🤸', name: 'Parkour', tr: 'Parkur', max: 5, desc: '+1.5% move speed, +2% jump per rank', trDesc: 'Rütbe başına +%1.5 hız, +%2 zıplama', fx: { speedPct: 0.015, jumpPct: 0.02 } },
  deadeye: { tier: 2, icon: '🎯', name: 'Deadeye', tr: 'Keskin Göz', max: 5, desc: '+1.5% crit chance per rank', trDesc: 'Rütbe başına +%1.5 kritik şansı', fx: { crit: 0.015 } },
  powersave: { tier: 2, icon: '🔋', name: 'Power Saver', tr: 'Güç Tasarrufu', max: 5, desc: '+8% battery life per rank', trDesc: 'Rütbe başına +%8 pil ömrü', fx: { batteryPct: 0.08 } },
  radar: { tier: 2, icon: '📡', name: 'Radar Ping', tr: 'Radar', max: 5, desc: '+2 m scan range per rank', trDesc: 'Rütbe başına +2 m tarama menzili', fx: { scanRange: 2 } },
  script: { tier: 3, icon: '⌨', name: 'Script Kiddie', tr: 'Script Kiddie', max: 5, desc: 'Minigames 2% easier per rank', trDesc: 'Rütbe başına mini oyunlar %2 daha kolay', fx: { minigameEase: 0.02 } },
  grind: { tier: 3, icon: '📈', name: 'Grindset', tr: 'Grindset', max: 5, desc: '+4% XP from gameplay per rank', trDesc: 'Rütbe başına oyundan +%4 XP', fx: { xpPct: 0.04 } },
  hustle: { tier: 3, icon: '◈', name: 'Side Hustle', tr: 'Yan Gelir', max: 5, desc: '+4% Clout from gameplay per rank', trDesc: 'Rütbe başına oyundan +%4 Clout', fx: { coinPct: 0.04 } },
  heart: { tier: 3, icon: '❤', name: 'Second Heart', tr: 'İkinci Kalp', max: 5, desc: '+8 max health per rank', trDesc: 'Rütbe başına +8 maksimum can', fx: { maxHp: 8 } },
};
export const MASTERY_POINTS_TOTAL = Object.values(MASTERY).reduce((a, m) => a + m.max, 0);

export function masteryRank(profile, id) {
  const v = profile?.mastery?.[id];
  return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(MASTERY[id]?.max || 0, Math.floor(v))) : 0;
}
export function masterySpent(profile, belowTier = 99) {
  let n = 0;
  for (const [id, m] of Object.entries(MASTERY)) if (m.tier < belowTier) n += masteryRank(profile, id);
  return n;
}
/** Why a mastery rank cannot be bought right now ('' = it can). */
export function masteryBlock(profile, id) {
  const m = MASTERY[id];
  if (!m) return 'unknown';
  const t = MASTERY_TIERS.find((x) => x.tier === m.tier);
  if (masteryRank(profile, id) >= m.max) return 'MAX';
  if ((profile.level || 1) < t.minLevel && prestigeStars(profile) === 0) return `Lv.${t.minLevel}`;
  if (masterySpent(profile, m.tier) < t.need) return `${t.need} pts in lower tiers`;
  if ((profile.skillPoints || 0) <= 0) return 'no points';
  return '';
}
function masteryFx(profile) {
  const out = {};
  for (const [id, m] of Object.entries(MASTERY)) {
    const r = masteryRank(profile, id);
    if (!r) continue;
    for (const [k, v] of Object.entries(m.fx)) out[k] = (out[k] || 0) + v * r;
  }
  return out;
}

// ---------------------------------------------------------------- rebirth (prestige)
export function prestigeStars(profile) {
  const s = profile?.prestige?.stars;
  return typeof s === 'number' && isFinite(s) ? Math.max(0, Math.min(MAX_STARS, Math.floor(s))) : 0;
}
/** Permanent per-star bonuses (capped at STAR_BONUS_CAP stars). */
export function prestigeBonus(stars) {
  const s = Math.max(0, Math.min(STAR_BONUS_CAP, stars | 0));
  return { xpPct: 0.05 * s, coinPct: 0.03 * s, maxHp: 3 * s, staminaPct: 0.02 * s };
}
export function canRebirth(profile) { return (profile?.level || 1) >= REBIRTH_LEVEL && prestigeStars(profile) < MAX_STARS; }
/** What a Rebirth would give right now (pure). */
export function rebirthPreview(profile) {
  const spent = Object.values(profile?.skills || {}).reduce((a, v) => a + (Number(v) | 0), 0) + treeSpent(profile?.rpg);
  const lv = profile?.level || 1;
  const keep = Math.floor(spent * 0.25);
  const extra = 3 + Math.floor(Math.max(0, lv - REBIRTH_LEVEL) / 10);
  return { spent, keep, extra, points: (profile?.skillPoints || 0) + keep + extra, stars: prestigeStars(profile) + 1 };
}
/**
 * Rebirth (mutates the profile, never saves): level -> 1, XP -> 0, base skills + passive tree refunded at 25%, +3 bonus points
 * (+1 per 10 levels past 50), +1 star. Mastery, gear, Clout, cosmetics and achievements are kept.
 */
export function applyRebirth(profile) {
  if (!canRebirth(profile)) return null;
  const pv = rebirthPreview(profile);
  const pr = profile.prestige = profile.prestige && typeof profile.prestige === 'object' ? profile.prestige : { stars: 0, history: [] };
  if (!Array.isArray(pr.history)) pr.history = [];
  pr.stars = pv.stars;
  pr.history.push({ at: Date.now(), level: profile.level });
  if (pr.history.length > 30) pr.history.splice(0, pr.history.length - 30);
  pr.peak = Math.max(pr.peak || 0, profile.level);
  profile.skills = profile.skills || {};
  for (const k of Object.keys(SKILLS)) profile.skills[k] = 0;
  if (profile.rpg && Array.isArray(profile.rpg.nodes)) profile.rpg.nodes = [];   // passive tree: 25% refunded like the base skills, the role stays
  profile.skillPoints = pv.points;
  profile.level = 1;
  profile.xp = 0;
  return pv;
}
/** One-time rewards per star count (granted by the meta layer after a Rebirth; idempotent via prestige.claimed). */
export const STAR_REWARDS = [
  { stars: 1, title: 'Reborn', cosmetic: 'suit:reborn', emote: 'ascend', coin: 500 },
  { stars: 2, coin: 800 },
  { stars: 3, title: 'Thrice Reborn', cosmetic: 'suit:aurora', coin: 1000 },
  { stars: 5, title: 'Ascended', coin: 2000 },
  { stars: 10, title: 'Eternal Poster', cosmetic: 'suit:obsidian', coin: 5000 },
  { stars: 20, title: 'Final Form', coin: 10000 },
];

/** Gameplay XP / Clout multipliers from stars + mastery (daily events and crew level are applied by Progress). */
export function metaMultipliers(profile) {
  const pb = prestigeBonus(prestigeStars(profile));
  const mf = masteryFx(profile);
  const tb = profile?.rpg ? treeBonus(profile.rpg) : null;   // passive tree: XP Gain / Clout Gain nodes
  return { xp: 1 + pb.xpPct + (mf.xpPct || 0) + (tb?.xpGain || 0), coin: 1 + pb.coinPct + (mf.coinPct || 0) + (tb?.cloutGain || 0) };
}

export function derivedStats(profile) {
  const s = profile.skills || {};
  const lv = profile.level || 1;
  const gear = gearBonuses(profile);
  const mf = masteryFx(profile);
  const pb = prestigeBonus(prestigeStars(profile));
  const mm = metaMultipliers(profile);
  // passive tree + role (passivetree.js): every static bonus folds in here so the TAB sheet (which calls derivedStats on the
  // profile) and game.stats agree. Dynamic keystones (Adrenaline Junkie, Lone Wolf) are layered on by rpg.js via the 'stats' event.
  const tb = treeBonus(profile.rpg);
  const packMule = !!profile.rpg && treeFlags(profile.rpg).has('packmule');
  return {
    maxHp: Math.max(20, Math.round((100 + (s.vit || 0) * 10 + Math.floor(lv / 5) * 5 + gear.hp + (mf.maxHp || 0) + pb.maxHp + tb.maxHp) * (1 + tb.maxHpPct))),
    maxStamina: Math.max(30, Math.round((100 + (s.end || 0) * 12 + (mf.maxStamina || 0) + tb.stamina) * (1 + pb.staminaPct))),
    staminaRegen: 16 * Math.max(0.2, 1 + (s.end || 0) * 0.04 + (mf.regenPct || 0) + tb.staminaRegen),
    meleeMul: (1 + (s.str || 0) * 0.08 + (mf.meleePct || 0) + tb.meleeDmg) * gear.dmgMul,
    rangedMul: (1 + tb.rangedDmg) * gear.dmgMul,
    carryRelief: (s.str || 0) * 6 + (mf.carryRelief || 0) + tb.carry + (packMule ? 9999 : 0),   // Pack Mule: weight never slows you (no sprint: rpg.js)
    speedMul: Math.max(0.5, 1 + (s.agi || 0) * 0.025 + gear.speed + (mf.speedPct || 0) + tb.moveSpeed),
    jumpMul: 1 + (s.agi || 0) * 0.03 + (mf.jumpPct || 0) + tb.jump,
    valueMul: Math.max(0.5, 1 + (s.lck || 0) * 0.02 + tb.scrapValue),
    crit: 0.05 + (s.lck || 0) * 0.015 + (mf.crit || 0) + tb.crit,
    batteryMul: 1 + (s.tec || 0) * 0.1 + (mf.batteryPct || 0) + tb.batteryLife,
    scanRange: 22 + (s.tec || 0) * 2 + (mf.scanRange || 0) + tb.scanRange,
    minigameEase: (s.tec || 0) * 0.02 + (mf.minigameEase || 0) + tb.minigameEase,
    armor: gear.armor + (mf.armor || 0) + tb.armor,
    xpBonus: mm.xp,
    coinBonus: mm.coin,
    tree: tb,             // full bonus map (maxMana, spellPower, bagSlots, lootLuck ... for modules reading game.stats)
    noSprint: packMule,
  };
}

// Black market (personal Clout). Soulbound gear.
export const MARKET = {
  weapons: [
    { id: 'shovel', coin: 120, minLevel: 2 },
    { id: 'machete', coin: 350, minLevel: 5 },
    { id: 'sledge', coin: 600, minLevel: 9 },
    { id: 'taser', coin: 900, minLevel: 12 },
    { id: 'harpoon', coin: 1400, minLevel: 16 },
    { id: 'shotgun', coin: 2500, minLevel: 22 },
  ],
  armor: [
    { id: 'hardhat', slot: 'head', name: 'Hard Hat', coin: 150, minLevel: 2, armor: 0.08, rarity: 'common' },
    { id: 'riothelmet', slot: 'head', name: 'Riot Helmet', coin: 700, minLevel: 10, armor: 0.15, rarity: 'rare' },
    { id: 'kefalhelm', slot: 'head', name: 'Verified Crown Helm', coin: 2200, minLevel: 25, armor: 0.22, hp: 20, rarity: 'legendary' },
    { id: 'vest', slot: 'body', name: 'Padded Vest', coin: 200, minLevel: 3, armor: 0.1, rarity: 'common' },
    { id: 'kevlar', slot: 'body', name: 'Kevlar Vest', coin: 900, minLevel: 12, armor: 0.2, rarity: 'rare' },
    { id: 'exosuit', slot: 'body', name: 'Exo-Frame', coin: 3000, minLevel: 28, armor: 0.28, speed: 0.05, rarity: 'legendary' },
  ],
  perks: [
    { id: 'lightfoot', slot: 'perk', name: 'Light Foot', coin: 400, minLevel: 6, desc: 'Footsteps 50% quieter.', rarity: 'uncommon' },
    { id: 'packmule', slot: 'perk', name: 'Pack Mule', coin: 800, minLevel: 10, desc: '+1 inventory slot.', rarity: 'rare' },
    { id: 'lucky', slot: 'perk', name: 'Lucky Fin', coin: 600, minLevel: 8, desc: '+10% scrap value found by you.', rarity: 'rare' },
    { id: 'berserk', slot: 'perk', name: 'Berserker', coin: 1500, minLevel: 18, desc: '+25% melee dmg below 50% HP.', rarity: 'epic' },
    { id: 'secondwind', slot: 'perk', name: 'Second Wind', coin: 2000, minLevel: 20, desc: 'Survive a lethal hit once per day.', rarity: 'epic' },
  ],
  cosmetics: [
    { id: 'suit:green', coin: 0 }, { id: 'suit:blue', coin: 0 },
    { id: 'suit:purple', coin: 80 }, { id: 'suit:pink', coin: 80 }, { id: 'suit:black', coin: 150 }, { id: 'suit:white', coin: 150 },
    { id: 'suit:yellow', coin: 100 }, { id: 'suit:camo', coin: 200 }, { id: 'suit:kefal', coin: 500, minLevel: 10 },
    { id: 'hat:cone', coin: 60 }, { id: 'hat:bunny', coin: 120 }, { id: 'hat:kefal', coin: 250 }, { id: 'hat:tophat', coin: 180 },
    { id: 'hat:headphones', coin: 150 }, { id: 'hat:propeller', coin: 220 }, { id: 'hat:hardhat', coin: 90 }, { id: 'hat:chef', coin: 130 },
    { id: 'hat:crown', coin: 1500, minLevel: 30 },
  ],
};

export function armorDef(id) { return MARKET.armor.find((a) => a.id === id) || MARKET.perks.find((a) => a.id === id); }

export function gearBonuses(profile) {
  const out = { armor: 0, hp: 0, speed: 0, dmgMul: 1 };
  const lo = profile.loadout || {};
  for (const slot of ['head', 'body']) {
    const d = lo[slot] && armorDef(lo[slot]);
    if (d) { out.armor += d.armor || 0; out.hp += d.hp || 0; out.speed += d.speed || 0; }
  }
  return out;
}

export function hasPerk(profile, id) { return profile?.loadout?.perk === id; }

// Quota: LC-like growth with some randomness (base / growth scaled by BALANCE, see tools/sim/economy.mjs)
export function nextQuota(prevQuota, quotaIndex, rng = Math.random) {
  const base = BALANCE.quotaBase;
  if (quotaIndex === 0) return base;
  const growth = BALANCE.quotaGrowth * (1 + (quotaIndex * quotaIndex) / 16) * (0.8 + 0.4 * rng());
  return Math.round(prevQuota + growth);
}

// Company buy rate by days left (3 = first day of cycle ... 0 = deadline)
export function buyRate(daysLeft, rngVal = 0.5) {
  if (daysLeft <= 0) return 1.0;
  if (daysLeft === 1) return 0.77 + rngVal * 0.1;
  if (daysLeft === 2) return 0.53 + rngVal * 0.1;
  return 0.3 + rngVal * 0.08;
}

// Bounties (MMO quests) — rotate daily per profile
const BOUNTY_TEMPLATES = [
  { type: 'kill', target: 'scuttler', n: [3, 6], coin: 12, xp: 30 },
  { type: 'kill', target: 'spider', n: [1, 2], coin: 45, xp: 90 },
  { type: 'kill', target: 'crawler', n: [1, 2], coin: 60, xp: 120 },
  { type: 'kill', target: 'yoinker', n: [1, 3], coin: 25, xp: 50 },
  { type: 'kill', target: 'hound', n: [1, 2], coin: 80, xp: 160 },
  { type: 'kill', target: 'lurker', n: [1, 1], coin: 150, xp: 280 },
  { type: 'kill', target: 'leech', n: [1, 3], coin: 30, xp: 60 },
  { type: 'kill', target: 'screamer', n: [1, 2], coin: 40, xp: 90 },
  { type: 'kill', target: 'mimic', n: [1, 1], coin: 70, xp: 150 },
  { type: 'kill', target: 'giant', n: [1, 1], coin: 220, xp: 520 },
  { type: 'collect', target: 'scrap', n: [300, 900], coin: 0.12, xp: 0.3 },
  { type: 'fish', target: 'any', n: [2, 5], coin: 20, xp: 40 },
  { type: 'minigame', target: 'safe', n: [1, 1], coin: 60, xp: 100 },
  { type: 'minigame', target: 'fuse', n: [1, 2], coin: 35, xp: 70 },
  { type: 'survive', target: 'day', n: [2, 3], coin: 30, xp: 80 },
  { type: 'sell', target: 'value', n: [400, 1200], coin: 0.1, xp: 0.25 },
];

export function dailyBounties(seed, level) {
  const r = new RNG(seed);
  const pool = r.shuffle(BOUNTY_TEMPLATES.slice());
  const out = [];
  for (const t of pool.slice(0, 5)) {
    const lvScale = 1 + level * 0.06;
    let n = r.int(t.n[0], t.n[1]);
    let coin, xp;
    if (t.coin < 1) { coin = Math.round(n * t.coin * lvScale); xp = Math.round(n * t.xp * lvScale); }
    else { coin = Math.round(t.coin * n * lvScale); xp = Math.round(t.xp * n * lvScale); }
    if (t.type === 'collect' || t.type === 'sell') n = Math.round(n * (1 + level * 0.05) / 10) * 10;
    out.push({ id: `${t.type}:${t.target}:${n}`, type: t.type, target: t.target, n, progress: 0, coin, xp, done: false, claimed: false });
  }
  return out;
}

export function bountyText(b) {
  switch (b.type) {
    case 'kill': { const nm = CREATURES[b.target]?.name || b.target; return `Eliminate ${b.n} ${nm}${b.n > 1 && !/s$/.test(nm) ? 's' : ''}`; }
    case 'collect': return `Bring ▮${b.n} of scrap to the ship`;
    case 'fish': return `Catch ${b.n} fish`;
    case 'minigame': return b.target === 'safe' ? `Crack ${b.n} vault${b.n > 1 ? 's' : ''}` : `Repair ${b.n} fuse box${b.n > 1 ? 'es' : ''}`;
    case 'survive': return `Survive ${b.n} days`;
    case 'sell': return `Sell ▮${b.n} worth of scrap`;
    default: return b.id;
  }
}
