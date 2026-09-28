// ITEM DURABILITY - pure rules (no DOM, no game access; node-tested by tools/harness/durability.test.mjs).
// Weapons wear per swing / hit / shot, worn armour per damage taken. At 0 a Common / Uncommon item SHATTERS (destroyed, leaves one
// scrap shard); Rare+ items - and any item carrying a forge investment (+N or overclocks) - become BROKEN until repaired.
// Numbers live ONLY in this file: max durability = base(item) x TIER_MUL[tier] x (1 + PLUS_STEP x plus) x age(repairs).
//
// Item instance fields (synced like it.plus / it.oc, see docs/wave2/durability.md):  it.dur  current durability (null = untouched = full)
//                                                                                    it.dr   number of full repairs (ages the maximum)
import { tierOfItem, tierIndex } from './tiers.js';
import { shardOfTier } from './enhance.js';

// ------------------------------------------------------------------------------------------------ tables
/** tier multiplier on the base durability (higher tier = sturdier) */
export const TIER_MUL = { common: 1, uncommon: 1.3, rare: 1.8, epic: 2.6, legendary: 4, mythic: 5.5 };
export const PLUS_STEP = 0.08;             // forge +N adds +8 % each (+9 = +72 %)
export const AGE_STEP = 0.05;              // every full repair costs 5 % of the maximum ...
export const AGE_MIN = 0.6;                // ... down to 60 %
export const AGE_MIN_MISSING = 0.25;       // a repair only ages the item when it restores at least this fraction of the max ("full repair")
export const WARN = 0.25;                  // <= 25 %: "worn" (yellow bar, toast)
export const CRIT = 0.10;                  // <= 10 %: "critical" (red bar, toast, crack sound on hits)
export const BROKEN_SELL_MUL = 0.3;        // broken Rare+ items sell for 30 %
export const KIT_FRAC = 0.4;               // Repair Kit restores 40 % of the maximum (no ageing)
export const KIT_ID = 'repairkit';
export const FLUSH_WEAR = 5;               // client -> host: send accumulated wear at 5 units, or after FLUSH_MS, or when the held item changes
export const FLUSH_MS = 3500;
export const BROADCAST_STEP = 0.1;         // host -> all: a state message only when the 10 % bucket changes (plus the 25 / 10 / 0 thresholds)

/** wear per event (durability units; a "hit" = 1 unit in total: swing 0.4 + connect 0.6) */
export const WEAR = { swing: 0.4, hit: 0.6, shot: 1, pry: 6, armorPerDmg: 0.5, armorCap: 25 };

/** base durability at Common tier: melee = hits, ranged = shots, armour = damage points absorbed (x armorPerDmg per hit taken) */
export const MELEE_BASE = {
  pipe: 120, shovel: 130, stopsign: 110, bat: 130, nailbat: 110, craft_nailbat: 110, knife: 110, crowbar: 140, machete: 130, sledge: 90,
  katana: 150, longsword: 140, greatsword: 110, twindaggers: 100, spear: 120, waraxe: 110, warhammer: 90,
};
export const RANGED_BASE = {
  pistol: 160, nailgun: 260, crossbow: 150, flaregun: 160, stackeddeck: 100, taser: 100, harpoon: 90, shotgun: 100,
  rocketlauncher: 70, grenadelauncher: 80, smg: 250, rifle: 200, hs_pistol: 160,
};
export const DEFAULT_BASE = { melee: 120, melee2h: 100, ranged: 150 };
export const armorBase = (def) => Math.round(250 + (def?.gear?.armor || 0.08) * 2500);   // hoodie 400, riot vest 550, kevlar 700 (Common)

const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ classification
/** 'melee' | 'ranged' | 'armor' | null (null = not durable: tools with charges / battery, consumables, scrap, trinkets, bags, gravtool) */
export function durKind(def) {
  if (!def || def.noDurability || def.unbreakable) return null;
  if (def.kind === 'weapon') {
    if (def.ranged || def.wfire || def.cfire) return (def.dmg || 0) > 0 || def.wfire ? 'ranged' : null;   // Grav-Tool (dmg 0, cfire grav) never wears
    return (def.dmg || 0) > 0 ? 'melee' : null;
  }
  if (def.kind === 'armor' && def.gear) return 'armor';
  return null;
}
export const isDurable = (def) => durKind(def) !== null;

/** base durability of a definition at Common tier */
export function baseDur(def) {
  const k = durKind(def);
  if (!k) return 0;
  if (k === 'armor') return armorBase(def);
  if (k === 'ranged') return RANGED_BASE[def.id] ?? DEFAULT_BASE.ranged;
  return MELEE_BASE[def.id] ?? (def.hands === 2 ? DEFAULT_BASE.melee2h : DEFAULT_BASE.melee);
}
export const ageMul = (repairs = 0) => Math.max(AGE_MIN, 1 - AGE_STEP * Math.max(0, repairs | 0));

/** maximum durability from (def, tier, forge plus, repairs) */
export function maxDur(def, tier = 'common', plus = 0, repairs = 0) {
  const b = baseDur(def);
  if (!b) return 0;
  return Math.max(1, Math.round(b * (TIER_MUL[tier] || 1) * (1 + PLUS_STEP * clamp(plus | 0, 0, 9)) * ageMul(repairs)));
}
/** maximum durability of an item instance (0 = not durable) */
export const itemMax = (it, def = it?.def) => (it && def ? maxDur(def, tierOfItem(it, def), it.plus | 0, it.dr | 0) : 0);
/** current durability of an item instance (untouched items are full) */
export function itemDur(it, def = it?.def) {
  const max = itemMax(it, def);
  if (!max) return 0;
  return it.dur == null ? max : clamp(Number(it.dur) || 0, 0, max);
}
export const stateOf = (dur, max) => (dur <= 0 ? 'broken' : dur / max <= CRIT ? 'critical' : dur / max <= WARN ? 'worn' : 'ok');

/** everything the UI needs: null for non-durable items */
export function durInfo(it, def = it?.def) {
  const kind = durKind(def);
  if (!kind || !it) return null;
  const max = itemMax(it, def), dur = itemDur(it, def);
  const tier = tierOfItem(it, def);
  return { kind, max, dur, frac: max ? dur / max : 1, state: stateOf(dur, max), tier, repairs: it.dr | 0, outcome: zeroOutcome(tier, it.plus | 0, it.oc?.length | 0), broken: dur <= 0 };
}
export const isBroken = (it, def = it?.def) => { const k = durKind(def); return !!k && !!it && it.dur != null && it.dur <= 0; };

// ------------------------------------------------------------------------------------------------ wear
/** Common / Uncommon items with no forge investment are destroyed at 0; everything else becomes BROKEN */
export function zeroOutcome(tier, plus = 0, ocCount = 0) {
  return tierIndex(tier) >= 2 || plus > 0 || ocCount > 0 ? 'broken' : 'destroy';
}
/** wear for one event of an item kind: ev 'swing' | 'hit' | 'shot' | 'pry' | 'dmg' (amount = raw damage taken) */
export function wearFor(kind, ev, amount = 0) {
  if (kind === 'melee') return ev === 'swing' ? WEAR.swing : ev === 'hit' ? WEAR.hit : ev === 'pry' ? WEAR.pry : 0;
  if (kind === 'ranged') return ev === 'shot' ? WEAR.shot : 0;
  if (kind === 'armor') return ev === 'dmg' && amount > 0 && amount < 999 ? Math.min(WEAR.armorCap, amount * WEAR.armorPerDmg) : 0;
  return 0;
}
/** pure wear step: { dur, before, after, changed, zero } */
export function applyWear(dur, max, w) {
  const before = stateOf(dur, max);
  const nd = Math.max(0, round1(dur - Math.max(0, w)));
  const after = stateOf(nd, max);
  return { dur: nd, before, after, changed: before !== after, zero: nd <= 0 && dur > 0 };
}
/** host: does this wear step need a state broadcast? (10 % bucket change or a threshold crossing) */
export function shouldBroadcast(prevDur, nextDur, max) {
  if (!max) return false;
  if (stateOf(prevDur, max) !== stateOf(nextDur, max)) return true;
  return Math.floor((prevDur / max) / BROADCAST_STEP) !== Math.floor((nextDur / max) / BROADCAST_STEP);
}
/** value of a broken item: x0.3 (and back again when it is repaired) */
export const brokenValue = (v) => Math.round((v || 0) * BROKEN_SELL_MUL);
export const repairedValue = (v) => Math.round((v || 0) / BROKEN_SELL_MUL);

// ------------------------------------------------------------------------------------------------ repair
export const COMP_VALUE = { comp_scrapmetal: 5, comp_cloth: 3, comp_circuit: 12 };
export const SHARD_VALUE = [0, 0, 25, 50, 85, 185];       // credit value of the extra tier shard (Rare+ broken items), by tier index
export const BENCH_BASE_CREDITS = 12;
export const HQ_MARKUP = 1.6;                                 // HQ service = (bench credits + component value + shard value) x 1.6, credits only

/** how many of the four repair "units" are missing (1..4) */
const units = (missFrac) => clamp(Math.ceil(missFrac * 4 - 1e-9), 1, 4);
/**
 * Repair quote for an item instance.  via 'bench' (components + a little credit) or 'hq' (credits only).
 * -> { ok:false, reason } | { ok:true, kind, missing, full, broken, comps:[[id,n]], shard, credits, newMax, newDur, newRepairs, aged }
 */
export function repairPlan(it, via = 'bench', def = it?.def) {
  const info = durInfo(it, def);
  if (!info) return { ok: false, reason: 'That item cannot be repaired.' };
  if (info.dur >= info.max) return { ok: false, reason: 'Nothing to repair.' };
  const missing = info.max - info.dur, missFrac = missing / info.max, ti = tierIndex(info.tier), u = units(missFrac);
  const full = missFrac >= AGE_MIN_MISSING;
  const newRepairs = (it.dr | 0) + (full ? 1 : 0);
  const newMax = maxDur(def, info.tier, it.plus | 0, newRepairs);
  let comps;
  if (info.kind === 'melee') comps = [['comp_scrapmetal', 1 + u], ...(u >= 3 ? [['comp_cloth', 1]] : [])];
  else if (info.kind === 'ranged') comps = [['comp_scrapmetal', u], ['comp_circuit', 1 + (ti >= 2 ? 1 : 0)]];
  else comps = [['comp_cloth', 1 + u], ['comp_scrapmetal', Math.ceil(u / 2)]];
  const needShard = info.broken && ti >= 2;
  const shard = needShard ? shardOfTier(info.tier) : null;
  const benchCredits = Math.round(BENCH_BASE_CREDITS * (0.3 + 0.7 * missFrac) * (1 + ti * 0.5));
  const compVal = comps.reduce((s, [id, n]) => s + (COMP_VALUE[id] || 4) * n, 0);
  const shardVal = needShard ? SHARD_VALUE[ti] || 0 : 0;
  const credits = via === 'hq' ? Math.round((benchCredits + compVal + shardVal) * HQ_MARKUP) : benchCredits;
  return { ok: true, via, kind: info.kind, tier: info.tier, missing, missFrac, full, aged: full, broken: info.broken,
    comps: via === 'hq' ? [] : comps, shard: via === 'hq' ? null : shard, credits, newMax, newDur: newMax, newRepairs };
}
/** Repair Kit: +40 % of the maximum, no ageing, works on broken items too. -> { dur } */
export function kitRepair(it, def = it?.def) {
  const info = durInfo(it, def);
  if (!info || info.dur >= info.max) return null;
  return { dur: Math.min(info.max, round1(info.dur + Math.round(info.max * KIT_FRAC))), max: info.max, revived: info.broken };
}
/** the most worn repairable item of a list (lowest fraction first, broken first) */
export function mostWorn(items) {
  let best = null, bf = 2;
  for (const it of items) {
    const i = durInfo(it);
    if (!i || i.dur >= i.max) continue;
    if (i.frac < bf) { bf = i.frac; best = it; }
  }
  return best;
}
