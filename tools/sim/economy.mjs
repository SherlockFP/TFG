// TFG economy / danger / XP-pacing simulator (node tools/sim/economy.mjs [--runs N] [--csv] [--seed S] [--mode casual|standard|hard] [--modes-only]).
//
// Wave 5 (hardmode): the difficulty table (src/game/difficulty.js, MASTERPLAN 25.4) is part of the model. Sections 1-8 use --mode (default standard); the last section
// "DIFFICULTY MODES" runs Casual / Standard / Hard side by side. Modelled: loot value curve x0.8 from quota 3 (real scrapValueMul), heavier carry penalty (carry
// capacity + speed), quota growth x1..1.15 by surplus (real quotaGrowthMul), creature tricks + spoiling food + lock warning as a threat / capacity tax
// (sim.threatMul / sim.foodCapMul), trap-price upkeep (sim.upkeep x quota per cycle). NOT modelled: forge levels (no forge in the economy), stranding.
//
// Monte-Carlo model of whole endless runs. It imports the REAL data and formulas (item values, scrap tables,
// handcrafted moons, the generated sectors from moongen.js, daily events, quota growth, the BALANCE knobs in
// progression.js, creature XP/level stats), and only models the players:
//
//   crew profile   size 2-4, skill (average / competent / great): how much of the generated value they bring
//                  back, how many items they can carry per day, how much creature pressure they handle.
//   moon choice    every quota cycle the crew routes to the moon with the best risk-adjusted 3-day value it can
//                  afford (handcrafted moons + the current sector), then lands there three days, then sells
//                  everything at 100% on deadline day (the usual Lethal Company strategy).
//   danger         threat = indoor budget x creature level (sqrt(hp x dmg) multiplier) x event danger, compared
//                  to the crew's capacity -> collection efficiency, deaths (fines), and a full-wipe chance
//                  (everyone dead = every unsold scrap on the ship is lost, like the host does).
//   XP             per-player XP from the real reward formulas (scrap secured, survive, quota met, sold,
//                  kills at creature level, vault/fuse/crates, bounties/achievements/login amortised per hour).
//
// The player model is a set of assumptions (documented next to each number) - use it to compare tunings,
// not as a prediction of an exact quota. Output: per-cycle economy table, quotas-survived distribution per
// crew, generated-moon affordability, modifier risk/reward, and hours to the first Rebirth (Lv.50).
import { ITEMS, scrapTableFor, bigTableFor } from '../../src/game/items.js';
import { HERO_THEMES, BIG_THEMES } from '../../src/game/herocontent_core.js';   // wave 8: themed tables for metro / greenhouse / prison / tower (registered on import)
import { MOONS } from '../../src/game/moons.js';
import { generateSector, MODIFIERS } from '../../src/game/moongen.js';
import { DAILY_EVENTS } from '../../src/game/dailyEvents.js';
import { CREATURES, spawnTable, creatureLevelStats } from '../../src/game/creatures.js';
import * as DIFF from '../../src/game/difficulty.js';
import { rollMap, addAffix, effectsOf, rewardOf } from '../../src/game/mapmods_core.js';   // wave 8 layer (see below)
import * as RS from '../../src/game/resto_core.js';
import { JOBS as FJ, SIDE_MUL as FJ_SIDE, FAIL_FEE as FJ_FEE, ARCH_CHANCE as FJ_ARCH } from '../../src/game/facjobs_core.js';
import { TUNE as LCT } from '../../src/game/lcmonsters_core.js';
import { THEMES as W3T, W3_ITEMS, doorChance as w3DoorChance } from '../../src/game/worlds3_core.js';
import { FC } from '../../src/game/feedcams_core.js';
import { MN } from '../../src/game/mining_core.js';
import { scaleFor } from '../../src/game/balance_core.js';   // wave-1 balance: sector creature scale + threat (default ON, --no-balance = the old flat numbers)
import {
  nextQuota, scrapValueMul, scrapCountBonus, indoorPowerMul, outdoorPowerMul, creatureBaseLevel,
  xpForLevel, xpToReach, REBIRTH_LEVEL, MAX_LEVEL, BALANCE,
} from '../../src/game/progression.js';

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RUNS = +argv('--runs', 600);
const SEED = +argv('--seed', 1234567);
const CSV = args.includes('--csv');
const BALANCE_ON = !args.includes('--no-balance');
const MODE = DIFF.norm(argv('--mode', DIFF.DEFAULT_MODE));
const MODES_ONLY = args.includes('--modes-only');
const PRE8 = args.includes('--pre8');                       // the economy before wave 8: no wave-8 layer and indoor loot x0.7 (pre-wave-8 median for 4 competent Standard was 8 quotas)
const W8 = !PRE8 && !args.includes('--no-wave8');          // wave-8 income / cost layer (docs/wave8/econ8.md)
DIFF.setMode(MODE);
const AVG_THREAT = +argv('--avg-threat', 40);   // mean Threat over a landing for a crew that holds loot and stays a while (see docs/wave1/balance.md)
if (PRE8) BALANCE.lootCountMul = 0.7;
Object.assign(BALANCE, JSON.parse(argv('--bal', '{}')));   // try knob changes without editing: --bal '{"levelPerQuota":0.5}'

// ---------------------------------------------------------------- deterministic rng
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let rand = mulberry(SEED);
const pickW = (list, w = (e) => e.w) => { let tot = 0; for (const e of list) tot += w(e); let r = rand() * tot; for (const e of list) { r -= w(e); if (r <= 0) return e; } return list[list.length - 1]; };
const noise = (spread) => Math.exp((rand() * 2 - 1) * spread);   // multiplicative, median 1
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- value tables (real data)
const avgVal = (id) => { const d = ITEMS[id]; return d?.value ? (d.value[0] + d.value[1]) / 2 : 0; };
const tableAvg = (t) => { let s = 0, w = 0; for (const [id, wt] of t) { if (!ITEMS[id]?.value || id === 'key') continue; s += avgVal(id) * wt; w += wt; } return w ? s / w : 40; };
const THEMES = ['factory', 'mansion', 'mineshaft', 'office', 'backrooms', 'serverfarm', 'sewer', 'hospital', ...HERO_THEMES, ...BIG_THEMES.filter((x) => !HERO_THEMES.includes(x))];
const SCRAP_AVG = Object.fromEntries(THEMES.map((t) => [t, tableAvg(scrapTableFor(t))]));
const BIG_AVG = Object.fromEntries(THEMES.map((t) => [t, tableAvg(bigTableFor(t))]));
const PRIZE_AVG = ['goldbar', 'ring', 'figurine', 'trophy'].reduce((s, id) => s + avgVal(id), 0) / 4;
const VAULT_AVG = ['goldbar', 'ring', 'figurine', 'goldbar', 'perfume', 'trophy', 'register'].reduce((s, id) => s + avgVal(id), 0) / 7;
const WEATHER_BONUS = { stormy: 1.2, eclipsed: 1.3, foggy: 1.1, rainy: 1.05 };
const DEPTH_AVG = 1.06;          // host depthMul averaged over scrap spot depths (0..22 %)
const OUTPOST_SHARE = 0.16;      // outposts.js DAY_SHARE of the indoor scrap by day (+0.12 at night, not taken here)

// ---------------------------------------------------------------- crew model (assumptions)
// eff: share of the reachable value a crew brings back on a calm day; carry: items per player per full day;
// cap: creature power per player the crew handles comfortably (grows +3.5 %/quota: gear, levels, practice);
// wipe: base chance per day that everyone dies anyway (bad luck, jester, mistakes).
const SKILL = {
  average: { eff: 0.52, carry: 9, cap: 1.9, wipe: 0.035, kill: 0.30, risk: 0.10 },
  competent: { eff: 0.66, carry: 12, cap: 2.5, wipe: 0.02, kill: 0.42, risk: 0.14 },
  great: { eff: 0.80, carry: 15, cap: 3.3, wipe: 0.01, kill: 0.55, risk: 0.20 },
};
const CREWS = [
  ['2 average', 2, 'average'], ['4 average', 4, 'average'],
  ['2 competent', 2, 'competent'], ['4 competent', 4, 'competent'],
  ['2 great', 2, 'great'], ['4 great', 4, 'great'],
];
const CAP_GROWTH = 0.035;
const REAL_DAY_MIN = 11.5;       // real minutes per landed day (720 s day, crews usually leave a bit early)
const CYCLE_OVERHEAD_MIN = 6;    // company visit + orbit/terminal per quota cycle

// ---------------------------------------------------------------- moon catalogue
const HANDCRAFTED = ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'].map((id) => MOONS[id]);
function moonsFor(runKey, q) { return [...HANDCRAFTED, ...generateSector(runKey, q).moons]; }
const theme = (m) => (THEMES.includes(m.interior) ? m.interior : 'factory');

/** Expected generated scrap value of one landing (no crew): { value, items } */
function dayValue(m, q, ev, weather) {
  const vm = m.scrapMul * scrapValueMul(q) * (WEATHER_BONUS[weather] || 1) * (ev.valueMul || 1);
  const spotsCap = Math.round(10 + (m.size || 1) * 22);
  const n = Math.min(spotsCap, (m.scrapCount[0] + m.scrapCount[1]) / 2 * BALANCE.lootCountMul + scrapCountBonus(q));   // wave 3: x0.7 count, early bonus kept
  const t = theme(m);
  let v = n * SCRAP_AVG[t] * vm * DEPTH_AVG;
  const bigN = (1 + 2 + Math.floor(m.tier / 2)) / 2;
  v += bigN * BIG_AVG[t] * vm;
  v += 0.8 * PRIZE_AVG * vm * 1.65;                          // deep-room prize (most layouts)
  v += 0.5 * 0.8 * VAULT_AVG * vm * 1.4;                     // ~half the facilities have a vault spot
  v += 0.4 * 220 * (1 + q * 0.1);                            // reactor core (optional, heavy)
  v += 3 * SCRAP_AVG[t] * vm * 0.8 * (ev.outdoorMul || 1);   // outdoor scrap
  v += OUTPOST_SHARE * n * SCRAP_AVG[t] * vm;                // outposts
  let items = n + bigN * 2 + 3 + OUTPOST_SHARE * n + 1.5;
  if (ev.extraScrap) { const k = n * 0.35 * ev.extraScrap + 2; v += k * SCRAP_AVG[t] * vm; items += k; }
  if (ev.cache) { v += ev.cache * 0.5 * (avgVal('goldbar') + avgVal('trophy')) * vm * 2.2; items += ev.cache; }
  if (ev.drops) { const k = 600 / ev.drops * 0.6; v += k * SCRAP_AVG[t] * vm * 1.1; items += k; }
  return { value: v, items };
}

// creature mix: one-shot killers (Lurker, Pop-up, Influencer, Worm, Parasocial...) weigh more per power point,
// fragile swarm creatures (Spam Bot, Leecher) less
const mixCache = new Map();
function mixFactor(m, zone) {
  const key = m.id + zone + JSON.stringify(zone === 'in' ? m.creatures : m.outdoor);
  if (mixCache.has(key)) return mixCache.get(key);
  let s = 0, w = 0;
  for (const [id, wt] of Object.entries(spawnTable(m, zone, { quotaIndex: 0 }))) {
    const d = CREATURES[id];
    if (!d || d.hazard || d.boss) continue;
    const k = d.dmg >= 90 ? 1.35 : d.hp && d.hp < 60 ? 0.7 : 1;
    s += k * wt; w += wt;
  }
  const f = w ? s / w : 1;
  mixCache.set(key, f);
  return f;
}

/** Creature threat of one landing (power units x level toughness). */
function dayThreat(m, q, ev, weather) {
  const lv = creatureBaseLevel(m.tier, q) + 0.5;              // host rolls base -1..+2
  const bs = BALANCE_ON ? scaleFor(q, AVG_THREAT) : null;     // wave-1: sector scale (weak early creatures) + the Threat meter's spawn multiplier
  const tough = Math.sqrt((1 + 0.18 * (lv - 1)) * (1 + 0.1 * (lv - 1))) * (bs ? Math.sqrt(bs.hp * bs.dmg) : 1);
  const ramp = 0.8;                                           // 35 % at 8:00 -> 100 % at 14:00, day average
  const pressure = bs ? bs.spawn : 1.2;                       // haul pressure used to be a flat x1.2 here; it is now the Threat meter (greed term)
  const indoor = m.power * indoorPowerMul(q) * (ev.dangerMul || 1) * ramp * pressure;
  const outdoorShare = weather === 'eclipsed' ? 0.8 : 0.3;    // outdoors only matters after 17:00 unless eclipsed
  const outdoor = (m.outdoorPower || 2) * outdoorPowerMul(q) * (ev.dangerMul || 1) * outdoorShare;
  const elite = 1 + (0.04 + m.tier * 0.02 + q * 0.01 + (ev.eliteAdd || 0)) * 0.8;
  // traps: host places round(turret/5 + danger*0.4) turrets and round(mine/4 + danger*0.8) mines (spots permitting)
  const danger = (m.tier + q * 0.35) * (ev.dangerMul || 1);
  const traps = Math.min(4, Math.round((m.creatures?.turret || 0) / 5 + danger * 0.4)) * 0.3 + Math.min(8, Math.round((m.creatures?.mine || 0) / 4 + danger * 0.8)) * 0.12;
  return { threat: (indoor * mixFactor(m, 'in') + outdoor * 0.6 * mixFactor(m, 'out')) * tough * elite + traps, level: lv, indoor };
}

function landingOutcome(crew, m, q, ev, weather) {
  const sk = SKILL[crew.skill];
  const { value, items } = dayValue(m, q, ev, weather);
  const th = dayThreat(m, q, ev, weather);
  const cap = Math.pow(crew.n, 0.85) * sk.cap * (1 + CAP_GROWTH * q) * (ev.hpMul ? 0.85 + 0.15 * ev.hpMul : 1);
  const dm = DIFF.eff(q);   // wave 5: rules in force at this quota index (casual numbers before quota 3 in every mode)
  const r = th.threat * dm.sim.threatMul / (cap * dm.sim.foodCapMul);   // creature door / light tricks, lock pressure -> threat; spoiling food -> less sustain
  const timeFrac = clamp((1440 - (ev.startTime || 480)) / 960 / (ev.timeMul || 1), 0.3, 1.3);
  const carryMul = DIFF.weightMul(dm.carry.load, q) / DIFF.weightMul(dm.carry.load, 0, 'casual');   // heavier hauls: slower and fewer items per trip
  const carryItems = crew.n * sk.carry * timeFrac * carryMul;
  const carryFrac = carryItems >= items ? 1 : Math.pow(carryItems / items, 0.7);   // the best items first
  const eff = sk.eff / (1 + 0.55 * Math.max(0, r - 0.75)) * (ev.blackout ? 0.92 : 1) * carryMul;
  const wipe = clamp(sk.wipe + 0.16 * Math.pow(Math.max(0, r - 0.8), 1.5), 0, 0.95);
  const deathRate = clamp(0.03 + 0.09 * r, 0, 0.9);           // per player per day (non-wipe days)
  return { value, items, eff: Math.min(eff, carryFrac), wipe, deathRate, r, threat: th, cap };
}

function expectedDay(crew, m, q) {
  // expectation over events and weather (for routing decisions)
  let ev = 0, wipe = 0, k = 0;
  for (const e of DAILY_EVENTS) for (const w of m.weather) {
    const o = landingOutcome(crew, m, q, e, w);
    ev += e.w * o.value * o.eff; wipe += e.w * o.wipe; k += e.w;
  }
  return { value: ev / k, wipe: wipe / k };
}

// ---------------------------------------------------------------- XP model (real formulas, per player)
const KILLABLE = Object.entries(CREATURES).filter(([, d]) => d.hp && d.xp > 0 && !d.hazard && !d.boss && !d.noSpawn);
const AVG_POWER = 2;
function killXp(m, q, level) {
  // average XP of a creature from the moon's spawn table at this level
  const tbl = Object.entries(spawnTable(m, 'in', { quotaIndex: q })).filter(([id]) => CREATURES[id]?.hp && CREATURES[id].xp > 0 && !CREATURES[id].hazard);
  let s = 0, w = 0;
  for (const [id, wt] of tbl) { s += creatureLevelStats(CREATURES[id], Math.round(level), false).xp * wt; w += wt; }
  return w ? s / w : 60;
}
const META_XP_PER_HOUR = (lv) => 450 + 12 * lv;   // bounties (~1/h, lvScale), achievements + codex (~34k over ~60 h), login

// ---------------------------------------------------------------- wave 8 layer (docs/wave8/econ8.md)
// What wave 8 added to credits per day, modelled from the REAL constants where a core module exports them. Assumptions (crew behaviour) are in W8K.
// Everything is gated by W8, so --no-wave8 / --pre8 reproduce the old numbers exactly (no extra rand() calls).
const W8K = Object.assign({
  cursedNet: 0.03,              // lcmonsters: 7 % of scrap is cursed x1.6 -> +4.2 % value, minus what crews leave behind (heavy / whispers / lure)
  lcDanger: 1.05,               // lcmonsters events (witch, keeper, mimics) add a little creature pressure per landing
  lanternP: 0.35, snatch: { average: 0.4, competent: 0.55, great: 0.7 },   // Lantern Keeper on a landing / crew steals the lantern (value LCT.lanternValue)
  mapBuy: 0.5, mapMinCredits: 520, mapPrice: 200,   // mapmods: share of crews that buy a Sector Map (ATLAS ADD) once they hold this many credits
  camMarked: { average: 0.22, competent: 0.15, great: 0.08 }, camCover: 0.9,   // feedcams: share of carried scrap that is ON AIR when it reaches the ship / share of moons with cams
  jobDone: { average: 0.55, competent: 0.75, great: 0.9 }, jobDivert: 0.08, sideP: 0.55, sideDone: 0.7, jobPartial: 0.4,   // facjobs
  crate: { wood: 40, iron: 90, gold: 200 },     // sale value of a job crate's contents (mostly components / tools, at most 2 scrap items)
  mineP: { average: 0.25, competent: 0.35, great: 0.35 }, mineMin: { average: 3, competent: 5, great: 6 }, orePerMin: 30,   // mining: share of days a crew digs / minutes of ONE player / ore value per minute
  pocketEnter: { average: 0.5, competent: 0.7, great: 0.8 }, pocketDivert: 0.18, pocketWipe: 0.008,   // worlds3 pockets
  restoP: 0.5, restoMin: 5, restoSetup: 500, restoDone: 0.7,   // resto: share of runs that keep a diner / minutes on the homeworld per cycle / cost of the first pieces / contract + inspector success
  arcadeClout: 40,              // arcade2: per player per UTC day (a ~5 h session), counted 1 Clout = 1 credit for the share
}, JSON.parse(argv('--w8', '{}')));
const POCKET_VAL = (() => {   // mean sale value of a pocket's loot at scrapValueMul 1 (theme loot tables x the theme's lootMul; Level 0 keeps the stock loot)
  const w3 = Object.fromEntries(W3_ITEMS.map((d) => [d.id, (d.value[0] + d.value[1]) / 2]));
  const v = (id) => w3[id] ?? avgVal(id);
  const per = Object.values(W3T).filter((T) => T.loot).map((T) => {
    const L = T.loot, tot = L.pool.reduce((a, [, w]) => a + w, 0);
    return (L.sigN * (L.sig.reduce((a, id) => a + v(id), 0) / L.sig.length) + L.n * L.pool.reduce((a, [id, w]) => a + v(id) * w / tot, 0)) * (T.lootMul || 1);
  });
  return { l0: SCRAP_AVG.backrooms * 5, other: per.reduce((a, b) => a + b, 0) / per.length };
})();
const jobList = Object.values(FJ).filter((j) => j.main);
const sideList = Object.values(FJ).filter((j) => j.side);
/** one landing: the affix map + job / mining / pocket / lantern extras. Returns the merged event and what to add after the normal haul. */
function w8Day(crew, q, gday, ev, mapObj, sk) {
  const out = { ev, mul: 1, addSold: 0, divert: 0, wipeAdd: 0, ore: 0, job: 0, crate: 0, pocket: 0, lantern: 0 };
  const fx = effectsOf(mapObj.a);
  out.ev = { ...ev, valueMul: (ev.valueMul || 1) * (fx.valueMul || 1), dangerMul: (ev.dangerMul || 1) * (fx.dangerMul || 1) * W8K.lcDanger, extraScrap: (ev.extraScrap || 0) + (fx.extraScrap || 0), eliteAdd: (ev.eliteAdd || 0) + (fx.eliteAdd || 0), blackout: ev.blackout || fx.blackout };
  out.mul *= 1 + W8K.cursedNet;
  out.mul *= 1 - W8K.camCover * W8K.camMarked[sk] * FC.tax;            // viewer tax
  if (rand() < W8K.lanternP && rand() < W8K.snatch[sk]) { out.lantern = (LCT.lanternValue[0] + LCT.lanternValue[1]) / 2; out.addSold += out.lantern; }
  // facility jobs (credits + a crate that is sold like scrap)
  if (rand() < FJ_ARCH) {
    const J = jobList[Math.floor(rand() * jobList.length)], m = 1 + 0.15 * q;
    out.divert += W8K.jobDivert;
    if (rand() < W8K.jobDone[sk]) { out.job += J.cr * m; out.crate += W8K.crate[J.tier] || 0; }
    else if (rand() < W8K.jobPartial) out.job += J.cr * m * 0.7 * 0.5;
    else out.job -= FJ_FEE;
    if (rand() < W8K.sideP) {   // a side job on the same day
      const S = sideList[Math.floor(rand() * sideList.length)];
      out.divert += 0.02;
      if (rand() < W8K.sideDone) { out.job += S.cr * m * FJ_SIDE; out.crate += S.tier === 'gold' ? W8K.crate.iron : W8K.crate[S.tier] || 0; }
    }
  }
  // mining (ore is scrap: it is sold for the quota; hard-capped per moon and day)
  if (rand() < W8K.mineP[sk]) { out.ore = Math.min(MN.valueCap, W8K.orePerMin * W8K.mineMin[sk]); out.divert += W8K.mineMin[sk] / REAL_DAY_MIN / crew.n; }
  // worlds3 pocket (wrong door): guaranteed every 3rd day, else 22 %
  if (rand() < w3DoorChance(gday) && rand() < W8K.pocketEnter[sk]) {
    out.pocket = (gday <= 1 ? POCKET_VAL.l0 : POCKET_VAL.other) * scrapValueMul(q) * 0.95;
    out.divert += W8K.pocketDivert; out.wipeAdd += W8K.pocketWipe;
  }
  out.addSold += out.ore + out.crate + out.pocket;
  return out;
}
/** diner income for cycle k of a run that keeps one (gross credits; setup and upgrades are a separate sink) */
function restoCycle(k) {
  const stars = Math.min(5, 1 + Math.floor((k - 1) / 2));
  const dishes = RS.DISHES.filter((d) => d.star <= stars);
  const price = dishes.reduce((a, d) => a + d.price, 0) / dishes.length * 0.95;
  const arrival = Math.max(22, 62 - 6 * stars - 8 - 5);
  const active = Math.min(3 * (RS.ECON.dayCapBase + RS.ECON.dayCapPerStar * stars), W8K.restoMin * 60 / arrival * 0.8 * price);
  const passive = 3 * (RS.ECON.passiveBase + RS.ECON.passivePerStar * stars);
  const contract = stars >= 3 ? W8K.restoDone * (RS.ECON.contractBase + RS.ECON.contractPerStar * stars) / (RS.ECON.contractGap / 3) : 0;
  const insp = W8K.restoDone * (80 + 40 * stars) / (RS.ECON.inspectEvery / 3);
  return { active, passive, contract, insp, stars, total: active + passive + contract + insp };
}

// ---------------------------------------------------------------- one run
function simRun(crew, runKey, stats) {
  let q = 0, quota = nextQuota(0, 0, rand), credits = 60, stash = 0, minutes = 0, xp = 0, current = 'hamsi', van = false;
  const perCycle = [];
  const inc = { scrap: 0, ore: 0, crate: 0, job: 0, pocket: 0, lantern: 0, resto: 0, arcade: 0, map: 0 };   // where the run's income came from (wave 8 layer)
  const sk0 = crew.skill, usesResto = W8 && rand() < W8K.restoP;
  let restoK = -1, restoSpent = 0, mapNow = null;
  for (;;) {
    // ---- routing (quota-aware, like real crews): the safest affordable moon whose expected 3-day haul covers
    // the quota with a margin; ambitious crews also want surplus. Nothing covers it -> best risk-adjusted value.
    const cands = moonsFor(runKey, q).filter((m) => m && !m.company);
    const sk = SKILL[crew.skill];
    const need = quota * (1.35 + sk.risk * 2);
    let best = null, fallback = null;
    for (const m of cands) {
      const cost = m.id === current ? 0 : m.cost || 0;
      if (cost > credits - 30) continue;
      const e = expectedDay(crew, m, q);
      const haul = 3 * e.value, surv = Math.pow(1 - e.wipe, 3);
      const fb = haul * surv - cost;
      if (!fallback || fb > fallback.score) fallback = { m, score: fb, cost, e };
      if (haul < need) continue;
      const score = -e.wipe * 1000 + haul / 1e5 - cost / 1e4;   // safest first, then richer / cheaper
      if (!best || score > best.score) best = { m, score, cost, e };
    }
    best = best || fallback;
    const m = best.m;
    credits -= best.cost; current = m.id;
    if (!van && credits > 900 && crew.n >= 3) { credits -= 350; van = true; }
    credits -= 15 * crew.n;                                  // flashlights / batteries / medkits
    credits -= Math.round(DIFF.eff(q).sim.upkeep * quota);   // wave 5: trap / turret kits get pricier with daily use, turrets eat ammo
    let cycleValue = 0, wipes = 0, deaths = 0, rSum = 0;
    for (let d = 0; d < 3; d++) {
      const e = pickW(DAILY_EVENTS);
      const w = m.weather[Math.floor(rand() * m.weather.length)];
      let w8 = null;
      if (W8) {
        let mp = rollMap(runKey + ':' + q + ':' + d, q);                 // every landing carries a free rolled map
        if (d === 0 && credits >= W8K.mapMinCredits && rand() < W8K.mapBuy) { credits -= W8K.mapPrice; mp = addAffix(mp, runKey + ':' + q, q); }   // Sector Map: ATLAS ADD
        w8 = w8Day(crew, q, q * 3 + d + 1, e, mp, sk0);
      }
      const o = landingOutcome(crew, m, q, w8 ? w8.ev : e, w);
      if (w8) { o.wipe = Math.min(0.95, o.wipe + w8.wipeAdd); w8.pocket *= SKILL[sk0].eff; w8.addSold = w8.ore + w8.crate + w8.pocket + w8.lantern; }
      rSum += o.r;
      const base = o.value * o.eff * (van ? 1.08 : 1) * noise(0.3) * (w8 ? w8.mul * (1 - w8.divert) : 1);
      const got = base + (w8 ? w8.addSold : 0);
      if (w8) { inc.scrap += base; inc.ore += w8.ore; inc.crate += w8.crate; inc.pocket += w8.pocket; inc.lantern += w8.lantern; }
      minutes += REAL_DAY_MIN * clamp((1440 - (e.startTime || 480)) / 960 / (e.timeMul || 1), 0.5, 1);
      // XP for this landing (per player)
      const lv = o.threat.level;
      const spawned = (o.threat.indoor / AVG_POWER) * 1.3;
      const kills = spawned * SKILL[crew.skill].kill / (1 + Math.max(0, o.r - 1));
      const shareMul = (1 + 0.35 * (crew.n - 1)) / crew.n;   // killer 1, helpers 0.25-0.5
      let dxp = kills * killXp(m, q, lv) * shareMul + 0.35 * got / crew.n + 0.5 * (120 + q * 20) / crew.n + 70 * 0.5 + (35 + m.tier * 15 + q * 5) * 0.6;
      dxp *= (e.xpMul || 1);
      if (rand() < o.wipe) {
        wipes++; stash = 0; deaths += crew.n;
        credits -= Math.min(credits, Math.round(credits * 0.15 * crew.n));
        xp += dxp * 0.6;                                    // XP earned before dying still counts
        continue;
      }
      let dd = 0; for (let i = 0; i < crew.n; i++) if (rand() < o.deathRate) dd++;
      deaths += dd;
      credits -= Math.min(credits, Math.round(credits * 0.1 * dd));
      stash += got * (1 - 0.5 * dd / crew.n * 0.3);        // a dead player's carried scrap is often lost
      cycleValue += got;
      if (w8) { credits = Math.max(0, credits + w8.job); inc.job += w8.job; }   // job pay goes straight to credits (not the quota)
      xp += dxp + (40 + m.tier * 20 + q * 10) * (1 - dd / crew.n);
    }
    minutes += CYCLE_OVERHEAD_MIN;
    const sold = stash; stash = 0;
    credits += sold;
    if (W8) {
      inc.arcade += W8K.arcadeClout * crew.n * ((REAL_DAY_MIN * 3 + CYCLE_OVERHEAD_MIN) / 300);
      if (usesResto) {   // keep a diner: first the setup, then gross income per cycle; half of it is re-invested in pieces until the ~6.5k build is done
        if (restoK < 0 && credits >= W8K.restoSetup + 300) { credits -= W8K.restoSetup; restoK = 0; }
        else if (restoK >= 0) { restoK++; const r = restoCycle(restoK); credits += r.total; inc.resto += r.total; const sp = Math.min(6500 - restoSpent, r.total * 0.5); restoSpent += sp; credits -= sp; }
      }
    }
    xp += 0.25 * sold / Math.sqrt(crew.n);
    xp += META_XP_PER_HOUR(stats.level) * ((REAL_DAY_MIN * 3 + CYCLE_OVERHEAD_MIN) / 60);
    perCycle.push({ q, quota, sold, moon: m.id, tier: m.tier, cost: best.cost, credits, wipes, deaths, r: rSum / 3, met: sold >= quota });
    if (sold < quota) break;
    credits += Math.floor((sold - quota) / BALANCE.overtimeDiv);
    xp += 150 + (q + 1) * 80;
    const surplusRatio = (sold - quota) / quota;
    q += 1;
    { const nq = nextQuota(quota, q, rand); quota = Math.round(quota + (nq - quota) * DIFF.quotaGrowthMul(surplusRatio, q)); }   // wave 5: growth x1..1.15 for crews that overshoot
    if (q >= 40) break;
  }
  return { quotas: q, perCycle, minutes, xp, inc, usesResto };
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (v, n = 0) => (typeof v === 'number' ? v.toFixed(n) : String(v));
const pad = (s, n) => String(s).padStart(n);

// ---------------------------------------------------------------- difficulty modes side by side (wave 5 hardmode)
function modeComparison() {
  const CMP_CREWS = [['4 average', 4, 'average'], ['4 competent', 4, 'competent'], ['2 great', 2, 'great']];
  const N = +argv('--cmp-runs', Math.min(RUNS, 300));
  const median = (a) => (a.length ? pct(a, 0.5) : null);
  const out = {};
  console.log(`\n== DIFFICULTY MODES (Casual = the old numbers / Standard = MASTERPLAN 25.4 / Hard = one notch harder), runs/crew=${N}, same seeds per mode ==`);
  console.log('rules from quota index ' + DIFF.FROM_QUOTA + ' on; quota 0-2 use the casual numbers in every mode');
  console.log('\nq   | loot value x (real scrapValueMul) casual/standard/hard | carry speed x @ load 40 | growth x for +60% surplus');
  for (const q of [0, 1, 2, 3, 4, 6, 8, 10, 14]) {
    const row = DIFF.MODES.map((m) => { DIFF.setMode(m); return [scrapValueMul(q), DIFF.weightMul(40, q), DIFF.quotaGrowthMul(0.6, q)]; });
    console.log(`${pad(q, 3)} | ${row.map((r) => fmt(r[0], 3)).join(' / ')} | ${row.map((r) => fmt(r[1], 3)).join(' / ')} | ${row.map((r) => fmt(r[2], 2)).join(' / ')}`);
  }
  for (const m of DIFF.MODES) {
    DIFF.setMode(m);
    out[m] = {};
    for (const [label, n, skill] of CMP_CREWS) {
      const qs = [], hours = [], cycles = [];
      for (let i = 0; i < N; i++) { rand = mulberry(SEED ^ (n * 7919) ^ skill.length * 104729 ^ Math.imul(i + 1, 2654435761)); /* per-run stream: every mode sees the same dice */ const res = simRun({ n, skill }, 'R' + i, { level: 25 }); qs.push(res.quotas); hours.push(res.minutes / 60); cycles.push(res.perCycle); }
      const at = (q, f) => median(cycles.map((r) => r.find((c) => c.q === q)).filter(Boolean).map(f));
      const early = [0, 1, 2].map((q) => at(q, (c) => c.sold / c.quota));
      out[m][label] = { p10: pct(qs, 0.1), p50: pct(qs, 0.5), p90: pct(qs, 0.9), mean: qs.reduce((a, b) => a + b, 0) / qs.length, hours: hours.reduce((a, b) => a + b, 0) / hours.length,
        early, quota4: at(4, (c) => c.quota), quota6: at(6, (c) => c.quota), cred3: at(3, (c) => c.credits), cred6: at(6, (c) => c.credits), sold3: at(3, (c) => c.sold / c.quota), sold6: at(6, (c) => c.sold / c.quota),
        fired: qs.filter((v) => v < 3).length / qs.length };
    }
  }
  DIFF.setMode(MODE);
  console.log('\ncrew        | mode     | quotas met p10 median p90 mean | run h | sold/quota at q0 q1 q2 (early comfort) | sold/quota q3 q6 | quota at q4 q6 | credits q3 q6 | fired before q3');
  for (const [label] of CMP_CREWS) {
    for (const m of DIFF.MODES) {
      const o = out[m][label];
      console.log(`${label.padEnd(11)} | ${m.padEnd(8)} | ${pad(o.p10, 4)} ${pad(o.p50, 6)} ${pad(o.p90, 3)} ${pad(fmt(o.mean, 1), 5)} | ${pad(fmt(o.hours, 1), 5)} | ${o.early.map((v) => pad(v == null ? '-' : fmt(v, 1) + 'x', 6)).join(' ')} | ${pad(o.sold3 == null ? '-' : fmt(o.sold3, 1) + 'x', 6)} ${pad(o.sold6 == null ? '-' : fmt(o.sold6, 1) + 'x', 6)} | ${pad(o.quota4 ?? '-', 5)} ${pad(o.quota6 ?? '-', 5)} | ${pad(o.cred3 == null ? '-' : fmt(o.cred3), 6)} ${pad(o.cred6 == null ? '-' : fmt(o.cred6), 6)} | ${fmt(o.fired * 100, 1)}%`);
    }
  }
  // headline: how much each mode shortens / hardens the run of the 4-competent crew, relative to Casual
  const base = out.casual['4 competent'];
  console.log('\nheadline (4 competent, vs Casual): ' + ['standard', 'hard'].map((m) => { const o = out[m]['4 competent']; return `${m}: median quotas ${o.p50} (${o.p50 - base.p50 >= 0 ? '+' : ''}${o.p50 - base.p50}), mean ${fmt(o.mean, 1)} (${fmt(o.mean - base.mean, 1)}), run ${fmt(o.hours, 1)} h (${fmt(o.hours - base.hours, 1)} h), quota at q6 ${o.quota6 ?? '-'} (${base.quota6 ?? '-'} casual)`; }).join(' | '));
  const e = ['casual', 'standard', 'hard'].map((m) => out[m]['4 average'].early.map((v) => (v == null ? 0 : v)));
  const same = e[0].every((v, i) => Math.abs(v - e[1][i]) < 1e-9 && Math.abs(v - e[2][i]) < 1e-9);
  console.log(`early comfort check (4 average, sold/quota at q0-2 identical in all modes): ${same ? 'OK' : 'DIFFERS ' + JSON.stringify(e)}`);
  return out;
}


// ---------------------------------------------------------------- wave 8: where the income comes from + shop items
function w8Report() {
  const N = +argv('--cmp-runs', Math.min(RUNS, 300));
  console.log(`\n== WAVE 8 income mix (${MODE}, runs/crew=${N}; per run, credits-equivalent; W8 layer ${W8 ? 'ON' : 'OFF'}) ==`);
  if (!W8) { console.log('(layer off)'); return; }
  console.log('crew        | quotas | scrap  ore  crate pocket lantern | jobs | diner (resto runs) | arcade | passive% (resto+ore+arcade) all runs / diner runs | side% (+jobs+crate+pocket)');
  for (const [label, n, skill] of [['4 average', 4, 'average'], ['4 competent', 4, 'competent'], ['2 great', 2, 'great']]) {
    const A = [], D = [], qs = [];
    for (let i = 0; i < N; i++) { rand = mulberry(SEED ^ (n * 7919) ^ skill.length * 104729 ^ Math.imul(i + 1, 2654435761)); const r = simRun({ n, skill }, 'R' + i, { level: 25 }); qs.push(r.quotas); (r.usesResto ? D : A).push(r.inc); }
    const all = [...A, ...D], mean = (L, k) => (L.length ? L.reduce((a, x) => a + x[k], 0) / L.length : 0);
    const share = (L) => { const t = L.reduce((a, x) => a + x.scrap + x.ore + x.crate + x.job + x.pocket + x.lantern + x.resto + x.arcade, 0), p = L.reduce((a, x) => a + x.resto + x.ore + x.arcade, 0), sd = L.reduce((a, x) => a + x.resto + x.ore + x.arcade + x.job + x.crate + x.pocket, 0); return [p / t * 100, sd / t * 100]; };
    const sa = share(all), sd = share(D);
    console.log(`${label.padEnd(11)} | ${pad(pct(qs, 0.5), 5)}  | ${['scrap', 'ore', 'crate', 'pocket', 'lantern'].map((k) => pad(fmt(mean(all, k)), 6)).join(' ')} | ${pad(fmt(mean(all, 'job')), 4)} | ${pad(fmt(mean(D, 'resto')), 7)} | ${pad(fmt(mean(all, 'arcade')), 5)} | ${fmt(sa[0], 1)}% / ${fmt(sd[0], 1)}% | ${fmt(sa[1], 1)}% / ${fmt(sd[1], 1)}%`);
  }
  // diner per cycle (upper bound: a crew that keeps it open every cycle)
  console.log('\ndiner gross per cycle by cycle number k (stars 1,1,2,2,3...): active / passive / contract / inspector = total');
  for (const k of [1, 2, 3, 4, 6, 8]) { const r = restoCycle(k); console.log(`k=${k} stars ${r.stars}: ${fmt(r.active)} / ${fmt(r.passive)} / ${fmt(r.contract)} / ${fmt(r.insp)} = ${fmt(r.total)}`); }
  // shop items: is the price in a sane band? expected credits gained per use vs price, 4 competent
  console.log('\nshop items (4 competent, one landing at that q): gain per use vs price');
  const crew = { n: 4, skill: 'competent' };
  for (const q of [0, 3, 6, 10]) {
    const mm = q >= 3 ? MOONS.palamut : MOONS.hamsi;
    const base = landingOutcome(crew, mm, q, {}, 'clear'), haul = base.value * base.eff;
    let vs = 0, qs2 = 0, dg = 0; const K = 400;
    for (let i = 0; i < K; i++) { const mp = addAffix(rollMap('SH' + i, q), 'SHA' + i, q), rw = rewardOf(mp.a), fx = effectsOf(mp.a); vs += rw.val; qs2 += rw.qty; dg += (fx.dangerMul || 1); }
    const mapGain = haul * (vs / K / 100 + qs2 / K / 100 * 0.6);
    const ore = Math.min(MN.valueCap, W8K.orePerMin * W8K.mineMin.competent), oreLoss = haul * W8K.mineMin.competent / REAL_DAY_MIN / crew.n;
    console.log(`q${pad(q, 2)} day haul ~${pad(fmt(haul), 5)} | Sector Map (${W8K.mapPrice}): +${fmt(mapGain)} (val +${fmt(vs / K)}% qty +${fmt(qs2 / K)}%, danger x${fmt(dg / K, 2)}) | Pickaxe day: ore ${fmt(ore)} - lost hauling ${fmt(oreLoss)} = ${fmt(ore - oreLoss)} (one-off 45; Steel 140 / Drill 380 only dig faster) | job day: ${fmt(FJ.power.cr * (1 + 0.15 * q))} cr + crate vs -${fmt(haul * W8K.jobDivert)} hauling`);
  }
}

if (MODES_ONLY) { console.log(`TFG economy sim (modes only) runs/crew=${RUNS} seed=${SEED}`); modeComparison(); w8Report(); process.exit(0); }

// ---------------------------------------------------------------- run everything

console.log(`TFG economy sim  runs/crew=${RUNS}  seed=${SEED}  mode=${MODE}`);
console.log(`BALANCE ${JSON.stringify(BALANCE)}`);
console.log(`scrap table avg value: ${THEMES.map((t) => `${t} ${SCRAP_AVG[t].toFixed(0)}`).join(', ')}`);

// 1) quota curve vs generated value (4 competent crew on the moon it routes to)
{
  console.log('\n== Quota curve vs moon value (expected per LANDING, 4 competent players; x3 days per quota) ==');
  console.log(' q | quota | hamsi gen/got | orkinos gen/got | best-sector moon (tier cost) gen/got   threat/cap');
  let quota = nextQuota(0, 0);
  const crew = { n: 4, skill: 'competent' };
  for (let q = 0; q < 20; q++) {
    const sec = generateSector('SIMRUN', q).moons;
    const row = (m) => { const o = landingOutcome(crew, m, q, { valueMul: 1 }, m.weather[0]); return [o.value, o.value * o.eff, o.r]; };
    const h = row(MOONS.hamsi), o = row(MOONS.orkinos);
    const deep = sec[sec.length - 1], dr = row(deep);
    console.log(`${pad(q, 2)} | ${pad(quota, 5)} | ${pad(fmt(h[0]), 5)}/${pad(fmt(h[1]), 5)} (${fmt(h[2], 2)}) | ${pad(fmt(o[0]), 5)}/${pad(fmt(o[1]), 5)} (${fmt(o[2], 2)}) | ${deep.id} T${deep.tier} ▮${deep.cost} ${pad(fmt(dr[0]), 5)}/${pad(fmt(dr[1]), 5)}  r=${fmt(dr[2], 2)}`);
    quota = nextQuota(quota, q + 1, () => 0.5);
  }
}

// 2) Monte Carlo runs per crew profile
const summary = [];
for (const [label, n, skill] of CREWS) {
  rand = mulberry(SEED ^ (n * 7919) ^ skill.length * 104729);
  const qs = [], hours = [], xph = [], cycles = [];
  for (let i = 0; i < RUNS; i++) {
    const res = simRun({ n, skill }, 'R' + i, { level: 25 });
    qs.push(res.quotas); hours.push(res.minutes / 60); xph.push(res.xp / (res.minutes / 60));
    cycles.push(res.perCycle);
  }
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  summary.push({ label, n, skill, p10: pct(qs, 0.1), p50: pct(qs, 0.5), p90: pct(qs, 0.9), mean: avg(qs), hours: avg(hours), xph: avg(xph), cycles });
}
console.log('\n== Quotas met per run (fired on the next one) ==');
console.log('crew          |  p10  median  p90  mean | run length h | XP/h per player');
for (const s of summary) console.log(`${s.label.padEnd(13)} | ${pad(s.p10, 4)} ${pad(s.p50, 6)} ${pad(s.p90, 5)} ${pad(fmt(s.mean, 1), 5)} | ${pad(fmt(s.hours, 1), 12)} | ${pad(fmt(s.xph), 6)}`);

// 3) a typical 4-competent run cycle by cycle (median run)
{
  const s = summary.find((x) => x.label === '4 competent');
  const runs = s.cycles.slice().sort((a, b) => a.length - b.length);
  const med = runs[Math.floor(runs.length / 2)];
  console.log('\n== Median 4-competent run, per quota cycle ==');
  console.log(' q | quota |  sold | moon      T | route | credits | wipes deaths | threat/cap');
  for (const c of med) console.log(`${pad(c.q, 2)} | ${pad(c.quota, 5)} | ${pad(fmt(c.sold), 5)} | ${String(c.moon).padEnd(9)} ${c.tier} | ${pad(c.cost, 5)} | ${pad(fmt(c.credits), 7)} | ${pad(c.wipes, 5)} ${pad(c.deaths, 6)} | ${fmt(c.r, 2)}${c.met ? '' : '  FIRED'}`);
  // moon usage across all runs
  const use = {};
  for (const r of s.cycles) for (const c of r) use[c.tier] = (use[c.tier] || 0) + 1;
  console.log('tier usage (4 competent, all cycles):', JSON.stringify(use));
}

// 4) generated-moon affordability: route cost vs credits a 4-competent crew holds at that quota
{
  console.log('\n== Sector route costs vs crew credits (4 competent, median credits at cycle start) ==');
  const s = summary.find((x) => x.label === '4 competent');
  const credAt = (q) => { const v = s.cycles.map((r) => r.find((c) => c.q === q)?.credits).filter((v) => v != null); return v.length ? pct(v, 0.5) : null; };
  for (const q of [0, 1, 2, 4, 6, 8, 10, 12, 15]) {
    const sec = generateSector('AFFORD', q).moons;
    const c = credAt(q);
    console.log(`q${pad(q, 2)}  credits~${pad(c == null ? '-' : fmt(c), 6)}  ${sec.map((m) => `T${m.tier}:▮${m.cost}${m.mods.length ? '(' + m.mods.join('+') + ')' : ''}`).join('  ')}`);
  }
}

// 5) modifier risk/reward: value and threat change vs the same unmodified moon (tier 3, q 4)
{
  console.log('\n== Moon modifiers (unmodified tier-3 generated moon, q=4, 4 competent): value / threat / haul x survival ==');
  let clean = null;
  for (let i = 0; i < 400 && !clean; i++) for (let q = 2; q < 8 && !clean; q++) clean = generateSector('MODS' + i, q).moons.find((m) => m.tier === 3 && !m.mods.length) || null;
  const crew = { n: 4, skill: 'competent' };
  const e0 = expectedDay(crew, clean, 4), v0 = dayValue(clean, 4, {}, clean.weather[0]).value, t0 = dayThreat(clean, 4, {}, clean.weather[0]).threat;
  const hs0 = 3 * e0.value * Math.pow(1 - e0.wipe, 3);
  for (const [id, mod] of Object.entries(MODIFIERS)) {
    const d = { ...clean, creatures: { ...clean.creatures }, outdoor: { ...clean.outdoor }, scrapCount: [...clean.scrapCount], weather: [...clean.weather] };
    mod.apply(d);
    const e = expectedDay(crew, d, 4);
    const v = dayValue(d, 4, {}, d.weather[0]).value, t = dayThreat(d, 4, {}, d.weather[0]).threat;
    const hs = 3 * e.value * Math.pow(1 - e.wipe, 3);
    console.log(`${id.padEnd(13)} risk ${pad(fmt(mod.risk, 1), 4)} | value ${pad(fmt((v / v0 - 1) * 100), 4)}% | threat ${pad(fmt((t / t0 - 1) * 100), 4)}% | wipe/day ${pad(fmt(e.wipe * 100, 1), 4)}% (base ${fmt(e0.wipe * 100, 1)}%) | haul x surv ${pad(fmt((hs / hs0 - 1) * 100), 4)}%${d.cost !== clean.cost ? `  cost ${clean.cost}->${d.cost}` : ''}`);
  }
}

// 6) daily events: value vs danger
{
  console.log('\n== Daily events (33-Guestbook T2, q=3, 4 competent): value x / threat x / wipe ==');
  const m = MOONS.palamut, crew = { n: 4, skill: 'competent' };
  const b = landingOutcome(crew, m, 3, {}, 'clear');
  for (const e of DAILY_EVENTS) {
    const o = landingOutcome(crew, m, 3, e, 'clear');
    console.log(`${e.id.padEnd(12)} got x${fmt((o.value * o.eff) / (b.value * b.eff), 2)}  threat x${fmt(o.threat.threat / b.threat.threat, 2)}  wipe ${fmt(o.wipe * 100, 1)}%  xp x${fmt(e.xpMul || 1, 1)}  ${e.mood}`);
  }
}

// 7) creature power budget per tier (indoor budget x toughness) at several quota indices
{
  console.log('\n== Creature budget by tier (generated moons: avg indoor power at 14:00 | base level | toughness x | threat vs T1) ==');
  const acc = {};
  for (let i = 0; i < 60; i++) for (let q = 0; q < 14; q++) for (const m of generateSector('PWR' + i, q).moons) { const a = acc[m.tier] || (acc[m.tier] = [0, 0]); a[0] += m.power; a[1]++; }
  const GEN_POWER = Object.fromEntries(Object.entries(acc).map(([t, [sum, n]]) => [t, sum / n]));
  console.log('handcrafted power:', ['hamsi', 'lufer', 'palamut', 'levrek', 'cipura', 'orkinos'].map((id) => `${id} T${MOONS[id].tier} ${MOONS[id].power}`).join(', '));
  for (const q of [0, 3, 5, 8, 10, 15]) {
    let t1 = 0;
    const row = [1, 2, 3, 4, 5, 6].map((t) => {
      const power = GEN_POWER[t] || 0;
      const lv = creatureBaseLevel(t, q);
      const tough = Math.sqrt((1 + 0.18 * (lv - 1)) * (1 + 0.1 * (lv - 1)));
      const th = power * indoorPowerMul(q) * tough;
      if (t === 1) t1 = th;
      return `T${t}:${pad(fmt(power * indoorPowerMul(q), 1), 5)} L${pad(lv, 2)} x${fmt(tough, 2)} (${fmt(th / t1, 1)})`;
    });
    console.log(`q${pad(q, 2)}  ${row.join(' | ')}`);
  }
}

// 8) XP pacing: hours to Rebirth (Lv.50) and to Lv.100 at the simulated XP/h (with the level-dependent meta XP)
{
  console.log('\n== XP pacing (per player, runs repeated back to back) ==');
  console.log(`XP to Lv.${REBIRTH_LEVEL}: ${xpToReach(REBIRTH_LEVEL)}   to Lv.${MAX_LEVEL}: ${xpToReach(MAX_LEVEL)}   Lv.1->2 ${xpForLevel(1)}  Lv.25 ${xpForLevel(25)}  Lv.49 ${xpForLevel(49)}  Lv.99 ${xpForLevel(99)}`);
  for (const s of summary) {
    const h50 = xpToReach(REBIRTH_LEVEL) / s.xph, h100 = xpToReach(MAX_LEVEL) / s.xph;
    console.log(`${s.label.padEnd(13)} ~${pad(fmt(s.xph), 5)} XP/h -> Rebirth ~${pad(fmt(h50, 1), 5)} h, Lv.100 ~${pad(fmt(h100, 0), 4)} h`);
  }
}

modeComparison();
w8Report();

if (CSV) {
  console.log('\ncrew,p10,p50,p90,mean,hours,xph');
  for (const s of summary) console.log([s.label, s.p10, s.p50, s.p90, s.mean.toFixed(2), s.hours.toFixed(2), s.xph.toFixed(0)].join(','));
}
