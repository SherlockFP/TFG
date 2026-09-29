// WAVE 3 worlds2 - pure rules (no three.js / DOM): days-in-run difficulty, facility decay, raid schedule, fauna plan.
// Shared by src/game/worlds2.js and tools/harness/worlds2.test.mjs (node). Deterministic where peers must agree (RNG from core/rng.js).
import { RNG, hashString } from '../core/rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ 4. days-in-run difficulty
/** First day the run starts getting harder (docs/MASTERPLAN.md 19: quota 0-1 = learning period, no extra pressure before day 4). */
export const HARD_FROM_DAY = 4;
export const DAYS = { spawnPer: 0.035, spawnCap: 1.7, hpPer: 0.015, hpCap: 1.4, dmgPer: 0.01, dmgCap: 1.3, speedPer: 0.004, speedCap: 1.1 };
/** Days the run has lasted (run.day is 1-based and grows at every day end). */
export const runDays = (run) => Math.max(0, (Number(run?.day) || 1) - 1);
/** Multipliers on top of balance.scale(): 1.0 until day 4, then +3.5 % spawn budget / +1.5 % hp / +1 % dmg / +0.4 % speed per day (capped). */
export function dayFactors(day) {
  const extra = Math.max(0, (Number(day) || 1) - (HARD_FROM_DAY - 1));
  return {
    extra,
    spawn: Math.min(DAYS.spawnCap, 1 + DAYS.spawnPer * extra),
    hp: Math.min(DAYS.hpCap, 1 + DAYS.hpPer * extra),
    dmg: Math.min(DAYS.dmgCap, 1 + DAYS.dmgPer * extra),
    speed: Math.min(DAYS.speedCap, 1 + DAYS.speedPer * extra),
  };
}

// ------------------------------------------------------------------ 4. facility decay (time pressure inside one day)
export const DECAY = {
  from: 14 * 60,                                 // "after mid-day" (the day runs 08:00 - 24:00, run.time in minutes)
  steps: [14 * 60, 16.5 * 60, 19 * 60, 21.5 * 60],
  mul: 0.92,                                     // uncollected loot value x0.92 per step -> x0.716 after the last one
  lockdownAt: [19 * 60, 22 * 60],                // facility lockdown pulses (game.facilitysys.force('lockdown'))
  lateSpawn: 0.3, latePace: 0.35,                // spawn budget / spawn rate up to +30 % / +35 % towards midnight
};
/** 0 before 14:00, 1 at 24:00 */
export const lateFraction = (time) => clamp(((Number(time) || 0) - DECAY.from) / (24 * 60 - DECAY.from), 0, 1);
/** how many decay steps a clock time has passed */
export const decayStepsPassed = (time) => DECAY.steps.reduce((n, t) => n + ((Number(time) || 0) >= t ? 1 : 0), 0);
/** cumulative loot value multiplier after n steps */
export const decayMulAfter = (n) => Math.pow(DECAY.mul, clamp(n | 0, 0, DECAY.steps.length));

// ------------------------------------------------------------------ 1. raids
/** seconds between raids on a moon: shrinks with the days-in-run factor, never below 110 s */
export function raidInterval(raid, day) {
  const f = dayFactors(day);
  return Math.max(110, Math.round((raid?.every || 260) / Math.min(1.6, 1 + (f.spawn - 1) * 0.7)));
}
/** squad size: base n (+1 every 4 days past day 3, max 6) */
export function raidSize(raid, day) { return clamp((raid?.n || 3) + Math.floor(Math.max(0, (day | 0) - 2) / 4), 2, 6); }
/** deterministic faction for raid number k of a run */
export function raidFaction(raid, runSeed, moonId, k) {
  const list = raid?.factions?.length ? raid.factions : ['bureau'];
  return list[Math.abs(hashString(`raid:${runSeed}:${moonId}:${k}`)) % list.length];
}
/** ring point around the crew for a raid: 42-58 m out, angle seeded (all hosts agree, only the host uses it) */
export function raidAngle(runSeed, moonId, k) { return ((Math.abs(hashString(`raidang:${runSeed}:${moonId}:${k}`)) % 6283) / 1000); }

// ------------------------------------------------------------------ 3. fauna plan
/** species per biome family: cosmetic herds + flyers. col = base colours (hex, picked per animal), size = body scale. */
export const FAUNA = {
  hills: { herd: { name: 'Pixelope', cols: [0xc8a878, 0xb89868, 0xd8b888], size: 1.0, n: [16, 26] }, fly: { name: 'Kitebird', cols: [0xf0f0e8, 0xe8d8a0], size: 1.0, n: [8, 14] } },
  swamp: { herd: { name: 'Bogback', cols: [0x4a5a3a, 0x5a6a48, 0x3a4a30], size: 1.15, n: [12, 18] }, fly: { name: 'Marsh Wisp', cols: [0xa0d8a0, 0xc8f0b0], size: 0.9, n: [10, 16] } },
  frost: { herd: { name: 'Frostwoolly', cols: [0xe8eef4, 0xc8d8e8, 0xd8e0e8], size: 1.1, n: [14, 22] }, fly: { name: 'Snowcrow', cols: [0x282c34, 0x3a4048], size: 0.9, n: [8, 14] } },
  dunes: { herd: { name: 'Dune Strider', cols: [0xc8a060, 0xb08850, 0xd8b070], size: 1.2, n: [12, 20] }, fly: { name: 'Skyray', cols: [0xd0a070, 0xa88458], size: 1.7, n: [6, 10] } },
  dark: { herd: { name: 'Heathcow', cols: [0x4a4238, 0x3a342c, 0x5a5044], size: 1.25, n: [8, 14] }, fly: { name: 'Bat-Kite', cols: [0x201820, 0x302838], size: 1.0, n: [10, 16] } },
  jungle: { herd: { name: 'Vine Tapir', cols: [0x5a7a4a, 0x6a8a52, 0x486a3c], size: 1.15, n: [10, 16] }, fly: { name: 'Glowmoth', cols: [0xb0f080, 0x90e8a8], size: 0.8, n: [12, 20] } },
  glitch: { herd: { name: 'Glitch Stag', cols: [0x2af4ff, 0xff2ad8, 0xfff04a], size: 1.1, n: [8, 14] }, fly: { name: 'Packet Moth', cols: [0xffffff, 0x9adfff], size: 0.8, n: [12, 20] } },
  ember: { herd: { name: 'Cinder Hog', cols: [0x5a3a2c, 0x7a4a30, 0x3c2a24], size: 1.15, n: [8, 14] }, fly: { name: 'Ember Moth', cols: [0xff9a40, 0xffc060], size: 0.8, n: [10, 16] } },
  crystal: { herd: { name: 'Prism Deer', cols: [0xc0a8ff, 0xa0d8ff, 0xffb8f0], size: 1.05, n: [8, 14] }, fly: { name: 'Shard Sprite', cols: [0xe0c8ff, 0x9ae8ff], size: 0.8, n: [12, 18] } },
};
const FAMILY = { hills: 'hills', swamp: 'swamp', servermarsh: 'swamp', snow: 'frost', ice: 'frost', soviet: 'frost', desert: 'dunes', twinsun: 'dunes', moor: 'dark', blackforest: 'dark', jungle: 'jungle', datascape: 'glitch', ashfield: 'ember', lava: 'ember', crystal: 'crystal' };
export const faunaFamily = (biomeId) => FAMILY[biomeId] || 'hills';

/**
 * Fauna plan for one moon: herds (centre path + members) and flyers, all in world XZ. Deterministic (`seed` = run seed).
 * ctx: { half: half-extent to keep inside, avoid(x, z, m) -> bool, scale (map scale) }. Herds start 38-95 m from the ship so they
 * are visible from the landing spot, flyers circle 20-42 m up around the ship / the map.
 */
export function planFauna(seed, moonId, biomeId, ctx = {}) {
  const fam = FAUNA[faunaFamily(biomeId)];
  const R = new RNG((hashString(`fauna:${moonId}`) ^ (seed | 0) ^ 0xfa07a) >>> 0);
  const half = (ctx.half || 130) - 10, sc = ctx.scale || 1;
  const avoid = ctx.avoid || (() => false);
  const herds = [];
  const nHerds = R.int(2, 3) + (sc > 1.2 ? 1 : 0);
  for (let h = 0; h < nHerds; h++) {
    let cx = 0, cz = 0;
    for (let t = 0; t < 30; t++) {
      const a = R.float(0, Math.PI * 2), d = h === 0 ? R.float(38, 70) : R.float(45, 105) * sc;
      cx = Math.cos(a) * d; cz = Math.sin(a) * d;
      if (Math.abs(cx) < half - 14 && Math.abs(cz) < half - 14 && !avoid(cx, cz, 4)) break;
    }
    const n = R.int(fam.herd.n[0], fam.herd.n[1]);
    const members = [];
    for (let i = 0; i < n; i++) members.push({ ox: R.float(-7, 7), oz: R.float(-7, 7), ph: R.float(0, 6.28), sp: R.float(0.85, 1.15), sz: R.float(0.8, 1.2), col: R.pick(fam.herd.cols) });
    herds.push({ cx, cz, r: R.float(9, 22), w: R.float(0.025, 0.05) * (R.chance(0.5) ? 1 : -1), ph: R.float(0, 6.28), ph2: R.float(0, 6.28), members, size: fam.herd.size });
  }
  const flyers = [];
  const nFly = R.int(fam.fly.n[0], fam.fly.n[1]);
  for (let i = 0; i < nFly; i++) {
    const near = i < Math.ceil(nFly / 2);   // half circle right over the landing zone
    flyers.push({ cx: near ? R.float(-25, 25) : R.float(-half, half) * 0.8, cz: near ? R.float(-25, 25) : R.float(-half, half) * 0.8, r: R.float(14, 42), w: R.float(0.12, 0.3) * (R.chance(0.5) ? 1 : -1),
      ph: R.float(0, 6.28), alt: R.float(20, 42), bob: R.float(0.3, 1.2), col: R.pick(fam.fly.cols), sz: R.float(0.8, 1.25) * fam.fly.size, fl: R.float(5, 9) });
  }
  return { family: faunaFamily(biomeId), herd: fam.herd.name, fly: fam.fly.name, herds, flyers };
}

/** position of a herd member / flyer at time t (pure; used by the renderer and the tests) */
export function herdPos(h, m, t) {
  const a = h.ph + h.w * t;
  const cx = h.cx + Math.cos(a) * h.r, cz = h.cz + Math.sin(a * 1.31 + h.ph2) * h.r * 0.8;
  const ax = h.cx + Math.cos(a + 0.05) * h.r, az = h.cz + Math.sin((a + 0.05) * 1.31 + h.ph2) * h.r * 0.8;
  const wob = Math.sin(t * 0.4 * m.sp + m.ph) * 1.2;
  const yaw = Math.atan2(ax - cx, az - cz) * (h.w < 0 ? -1 : 1) + (h.w < 0 ? Math.PI : 0);
  return { x: cx + m.ox + wob, z: cz + m.oz + Math.cos(t * 0.33 * m.sp + m.ph) * 1.2, yaw, moving: Math.abs(h.w) > 0 };
}
export function flyerPos(f, t) {
  const a = f.ph + f.w * t;
  return { x: f.cx + Math.cos(a) * f.r, z: f.cz + Math.sin(a) * f.r, y: f.alt + Math.sin(t * f.bob + f.ph) * 2.5, yaw: Math.atan2(-Math.sin(a) * f.w, Math.cos(a) * f.w), bank: -f.w * 2.2 };
}

// ------------------------------------------------------------------ night predators (hostile fauna)
/** how many Prowlers the dusk director may spawn on this moon at this tier / day (0 on tier 1 moons, HQ and the homeworld) */
export function prowlerBudget(tier, day) {
  if (!(tier >= 2)) return 0;
  return clamp(Math.round(1 + tier * 0.6 + Math.max(0, (day | 0) - 3) * 0.25), 1, 7);
}
