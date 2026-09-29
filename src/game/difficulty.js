// DIFFICULTY (wave 5 "hardmode", docs/wave5/hardmode.md, MASTERPLAN 25.4).
// ONE lobby setting (Casual / Standard / Hard) and ONE table with every number. Pure module (no imports, no DOM): the affected modules read it
// through the small helper functions below, and tools/sim/economy.mjs + the node tests import the very same table.
//
//   casual    = the values the game had before wave 5 (nothing here changes)
//   standard  = the MASTERPLAN 25.4 table (default)
//   hard      = the same rules one notch harder
//
// EARLY GAME STAYS COMFORTABLE: every pressure rule only applies from quota INDEX FROM_QUOTA (3) on. Quota 0-2 play with the casual numbers in every mode
// (MASTERPLAN 19). `eff(q)` returns the rule set in force at a quota index; every helper goes through it.
export const MODES = Object.freeze(['casual', 'standard', 'hard']);
export const DEFAULT_MODE = 'standard';
export const FROM_QUOTA = 3;

const CASUAL = Object.freeze({
  lootMul: 1,                                   // scrap value multiplier on top of progression.scrapValueMul
  carry: Object.freeze({ start: 10, div: 260, floor: 0.6, load: 40 }),   // weightMul = clamp(1 - max(0, weight - start) / div, floor, 1); load = typical haul weight (sim)
  growthMaxMul: 1, growthFullAt: 0.6,           // quota growth x(1 + (max-1) * performance); performance = surplus / quota / growthFullAt (0..1)
  lockWarnSec: 0, lockRepeatSec: 0,             // 0 = the old 23:00 autopilot warning only
  strand: false, strandHpFrac: 0, strandKeepsScrap: true,   // late crew are left behind AND killed (old behaviour)
  doorEveryS: 0, lightEveryS: 0, lightSec: 0,   // creature tricks off
  spoilDays: 0, spoilHealMul: 1,                // food never spoils
  stoveSingle: false, fireCooks: true, crateMax: 6,
  priceStep: 0, priceCap: 1,                    // trap / turret kit price growth per kit bought today, and its ceiling
  ammoMul: 1, drawMul: 1,                       // turret ammo per shot / battery draw
  forgeFailFrom: 6, forgeDriveCraft: true, forgeDriveMul: 1,   // a failed attempt at +N (N >= this) loses one level (never breaks); Backup Drive = the protection scroll: craftable at shard cost x mul
  deathNotice: false,
  dmgMul: 1,                                    // creature damage multiplier (balance_rules.js); Standard = 1, Hard +10 %, both only from FROM_QUOTA
  sim: Object.freeze({ threatMul: 1, foodCapMul: 1, upkeep: 0 }),
});

const STANDARD = Object.freeze({
  lootMul: 0.8,
  carry: Object.freeze({ start: 10, div: 220, floor: 0.55, load: 40 }),
  growthMaxMul: 1.15, growthFullAt: 0.6,
  lockWarnSec: 90, lockRepeatSec: 30,
  strand: true, strandHpFrac: 0.5, strandKeepsScrap: false,
  doorEveryS: 50, lightEveryS: 130, lightSec: 12,
  spoilDays: 3, spoilHealMul: 0.4,
  stoveSingle: true, fireCooks: true, crateMax: 5,
  priceStep: 0.10, priceCap: 1.8,
  ammoMul: 1.5, drawMul: 1.25,
  forgeFailFrom: 6, forgeDriveCraft: true, forgeDriveMul: 2,
  deathNotice: true,
  dmgMul: 1,
  sim: Object.freeze({ threatMul: 1.06, foodCapMul: 0.98, upkeep: 0.03 }),
});

const HARD = Object.freeze({
  lootMul: 0.7,
  carry: Object.freeze({ start: 8, div: 180, floor: 0.5, load: 40 }),
  growthMaxMul: 1.3, growthFullAt: 0.5,
  lockWarnSec: 120, lockRepeatSec: 40,
  strand: true, strandHpFrac: 0.3, strandKeepsScrap: false,
  doorEveryS: 32, lightEveryS: 85, lightSec: 16,
  spoilDays: 3, spoilHealMul: 0.25,
  stoveSingle: true, fireCooks: false, crateMax: 4,
  priceStep: 0.18, priceCap: 2.5,
  ammoMul: 2, drawMul: 1.5,
  forgeFailFrom: 5, forgeDriveCraft: false, forgeDriveMul: 1,
  deathNotice: true,
  dmgMul: 1.1,
  sim: Object.freeze({ threatMul: 1.12, foodCapMul: 0.96, upkeep: 0.06 }),
});

export const TABLE = Object.freeze({ casual: CASUAL, standard: STANDARD, hard: HARD });

// ---------------------------------------------------------------- ambient context (mode = lobby setting, q = run.quotaIndex; hardmode.js keeps both in sync)
const cur = { mode: DEFAULT_MODE, q: 0 };
export const norm = (m) => (MODES.includes(m) ? m : DEFAULT_MODE);
export function setMode(m) { cur.mode = norm(m); return cur.mode; }
export function setQuota(q) { cur.q = Math.max(0, q | 0); return cur.q; }
export const getMode = () => cur.mode;
export const getQuota = () => cur.q;

/** rule set in force at quota index q (casual numbers before FROM_QUOTA in every mode) */
export function eff(q = cur.q, mode = cur.mode) {
  const m = norm(mode);
  return m !== 'casual' && (q | 0) >= FROM_QUOTA ? TABLE[m] : CASUAL;
}
/** true when the pressure rules are on (a mode above casual AND quota index >= FROM_QUOTA) */
export const isLate = (q = cur.q, mode = cur.mode) => eff(q, mode) !== CASUAL;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- rule helpers (one per 25.4 row)
/** loot value: progression.scrapValueMul multiplies this (x0.8 from quota 3 on in Standard) */
export const lootValueMul = (q, mode) => eff(q, mode).lootMul;
/** carried-weight speed multiplier (LocalPlayer.update) */
export function weightMul(weight, q, mode) {
  const c = eff(q, mode).carry;
  return clamp(1 - Math.max(0, weight - c.start) / c.div, c.floor, 1);
}
/** quota GROWTH multiplier for the quota that starts at index newIdx; surplusRatio = (sold - quota) / quota of the quota just met */
export function quotaGrowthMul(surplusRatio, newIdx, mode) {
  const e = eff(newIdx, mode);
  if (!(e.growthMaxMul > 1)) return 1;
  return 1 + (e.growthMaxMul - 1) * clamp((Number(surplusRatio) || 0) / e.growthFullAt, 0, 1);
}
/** real seconds before midnight at which the ship door warns "locking" (0 = only the legacy 23:00 warning) */
export const lockWarnSec = (q, mode) => eff(q, mode).lockWarnSec;
/** crew outside at takeoff: stay on the moon (not killed) and come back hurt next morning */
export const strandRule = (q, mode) => { const e = eff(q, mode); return e.strand ? { hpFrac: e.strandHpFrac, keepsScrap: e.strandKeepsScrap } : null; };
/** creature tricks after quota 3: { doorEveryS, lightEveryS, lightSec } or null */
export const creatureTricks = (q, mode) => { const e = eff(q, mode); return e.doorEveryS > 0 ? { doorEveryS: e.doorEveryS, lightEveryS: e.lightEveryS, lightSec: e.lightSec } : null; };
/** days after cooking a dish stays fresh (0 = never spoils) and the heal multiplier of a spoiled dish */
export const spoilDays = (q, mode) => eff(q, mode).spoilDays;
export const spoilHealMul = (q, mode) => eff(q, mode).spoilHealMul;
export const stoveSingle = (q, mode) => eff(q, mode).stoveSingle;
export const fireCooks = (q, mode) => eff(q, mode).fireCooks;
export const crateMax = (q, mode) => eff(q, mode).crateMax;
/** trap / turret kits (deployables.js DEPS keys that get a price rise with use) */
export const TRAP_DEPLOY = Object.freeze(['turret1', 'turret2', 'turret3', 'tesla', 'mine', 'spikes', 'barr_wood', 'barr_metal']);
export const isTrapItem = (def) => !!def && typeof def.deploy === 'string' && TRAP_DEPLOY.includes(def.deploy);
/** price multiplier of a trap kit after `used` kits of ANY trap kind were bought today */
export function priceMul(used, q, mode) {
  const e = eff(q, mode);
  return e.priceStep > 0 ? Math.min(e.priceCap, 1 + e.priceStep * Math.max(0, used | 0)) : 1;
}
/** unit price of a trap kit when buying n of them with `used` already bought today (average of the rising steps) */
export function trapUnitPrice(base, used, n = 1, q, mode) {
  let s = 0;
  const k = Math.max(1, n | 0);
  for (let i = 0; i < k; i++) s += Math.round(base * priceMul((used | 0) + i, q, mode));
  return Math.round(s / k);
}
export const ammoMul = (q, mode) => eff(q, mode).ammoMul;
export const drawMul = (q, mode) => eff(q, mode).drawMul;
/** forge: a failed attempt to reach +N with N >= this loses one level (never breaks); the Backup Drive ("protection scroll") prevents it */
export const forgeFailFrom = (q, mode) => eff(q, mode).forgeFailFrom;
export const forgeDriveCraft = (q, mode) => eff(q, mode).forgeDriveCraft;
export const forgeDriveMul = (q, mode) => eff(q, mode).forgeDriveMul;

/** short one-line summaries for the host screen (English keys, translated by hardmode_i18n.js) */
export const SUMMARY = Object.freeze({
  casual: 'The old numbers. Relaxed: nothing here gets meaner.',
  standard: 'From quota 3: loot worth 20% less, heavier hauls, the ship door warns before it locks, creatures close doors, food spoils.',
  hard: 'Standard, one notch harder: loot -30%, 2 min lock warning, no campfire cooking, protection drives only from rare drops.',
});
export const LABEL = Object.freeze({ casual: 'Casual', standard: 'Standard', hard: 'Hard' });
