// LCMONSTERS core (wave 8, docs/wave8/lcmonsters.md): pure rules, no THREE / DOM, node-testable (tools/harness/lcmonsters.test.mjs).
//   Six "Lethal Company mod" style threats, each with ONE readable rule (Blood Witch, Lantern Keeper, Trick-or-Treat, Cursed Scraps,
//   The Other Side, Mimics + Masked). Everything here is numbers and small deciders; the game glue lives in lcmonsters.js.
import { RNG } from '../core/rng.js';

export const TUNE = Object.freeze({
  // day budget: how many of OUR creatures may be scheduled in one landing (max 1 of each kind). crdirector may veto each spawn on top.
  budget: Object.freeze([[0, 2], [3, 3]]),        // [from quota index, max scheduled events per landing]
  earliest: 45, latest: 330,                       // s after landing an indoor event may fire (moonT)
  duskMin: 17 * 60 + 20,                           // run.time (minutes) from which the Blood Witch walks (17:20; eclipse counts as dusk)
  // blood witch
  circleR: 6.5, circleLife: 42, castS: 3.0,        // circle radius (m), how long a circle stays, ritual time before it goes live (telegraph)
  curseExposure: 1.4, curseImmune: 8,              // s inside the circle in her line of sight before the curse lands / s of immunity after
  bleedT: 12, bleedDps: 1.6, bleedFloor: 12,       // curse: bleed seconds, HP per second, never bleeds you below this HP
  // lantern keeper
  beamRange: 11, beamHalf: 0.42, markT: 22, markPing: 1.6,   // beam length (m) / half angle (rad) / marked seconds / creature-lure interval
  snatchReach: 1.9, snatchFront: 0.15,             // E on the lantern works within reach when the keeper is NOT facing you (dot(face, toYou) below this)
  lanternValue: [95, 150],
  holdSafe: 3.4,                                   // masked: the hug lets go by itself after this (balance_rules also caps holds at 3.2 s)
  // trick or treat
  treatStay: 75, treatReach: 2.6,
  // cursed scraps
  curseChance: 0.07, curseCap: 3, curseValueMul: 1.6, cleanseBonusKeep: 1.25,
  whisperEvery: [14, 26], lureEvery: 22, lureLoud: 1.3, invertEvery: [38, 60], invertT: 4, invertWarn: 1.1, heavyMul: 0.72,
  // other side
  osWarnS: 7, osRiftS: 4, osChaseMax: 75, osHunter: { hp: 190, dmg: 28, run: 6.4 },
  // mimics
  maskLatchS: 42, maskWarnS: 26, maskedMax: 2,
});

export const KINDS = Object.freeze(['witch', 'keeper', 'treat', 'otherside', 'lootmimic', 'masked']);
export const OUTDOOR_KINDS = new Set(['witch']);
export const CURSES = Object.freeze(['heavy', 'whisper', 'lure', 'invert']);

/** stable 32-bit string / number hash */
export function hash32(s) {
  s = String(s); let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export const budgetFor = (q) => { let n = TUNE.budget[0][1]; for (const [from, v] of TUNE.budget) if ((q || 0) >= from) n = v; return n; };

/** weights per kind (indoor-only kinds need a facility, the witch needs an outdoor moon). Early game: no hunter and no masked before quota 1. */
export function kindWeights(q, { indoor = true, outdoor = true } = {}) {
  const w = { witch: outdoor ? 3 : 0, keeper: indoor ? 3 : 0, treat: indoor ? 3 : 0, otherside: indoor && q >= 1 ? 2.5 : 0, lootmimic: indoor ? 3.2 : 0, masked: indoor && q >= 1 ? 2 : 0 };
  return w;
}
/** The day plan: [{ kind, at }] (at = seconds after landing for indoor events, 'dusk' for the witch). Deterministic per (seed, day). */
export function planDay(seed, day, q, opts = {}) {
  const rng = new RNG((hash32(seed + ':' + day) ^ 0x1c0a57) >>> 0);
  const w = kindWeights(q, opts), out = [];
  for (let n = budgetFor(q); n > 0; n--) {
    let tot = 0; for (const k of KINDS) tot += w[k];
    if (tot <= 0) break;
    let r = rng.next() * tot, pick = KINDS[0];
    for (const k of KINDS) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    w[pick] = 0;                                                    // max one of a kind per landing
    out.push({ kind: pick, at: pick === 'witch' ? 'dusk' : Math.round(TUNE.earliest + rng.next() * (TUNE.latest - TUNE.earliest)) });
  }
  return out.sort((a, b) => (a.at === 'dusk' ? 1e9 : a.at) - (b.at === 'dusk' ? 1e9 : b.at));
}

// ------------------------------------------------------------------------------------------------ cursed scraps
/** roll a curse for a freshly spawned scrap. rng = () => [0,1). returns kind or null. */
export function rollCurse(rng, q, already) {
  if (already >= TUNE.curseCap) return null;
  if (rng() >= TUNE.curseChance * (q >= 1 ? 1 : 0.6)) return null;
  return CURSES[Math.floor(rng() * CURSES.length) % CURSES.length];
}
export const cursedValue = (v) => Math.max(1, Math.round(v * TUNE.curseValueMul));
export const cleansedValue = (v) => Math.max(1, Math.round(v / TUNE.curseValueMul * TUNE.cleanseBonusKeep));
export const cleanseCost = (v) => Math.max(20, Math.min(120, Math.round(v * 0.22)));
/** carried-curse speed factor ('heavy') */
export const heavyMul = () => TUNE.heavyMul;

// ------------------------------------------------------------------------------------------------ blood witch
export const inCircle = (px, pz, cx, cz, r = TUNE.circleR) => Math.hypot(px - cx, pz - cz) <= r;
/** one exposure step: inside a live circle AND in her line of sight fills the meter, breaking sight drains it twice as fast. */
export function witchStep(exp, inside, los, dt, immune = 0) {
  if (immune > 0) return { exp: 0, cursed: false };
  exp = inside && los ? exp + dt : Math.max(0, exp - 2 * dt);
  return exp >= TUNE.curseExposure ? { exp: 0, cursed: true } : { exp, cursed: false };
}
/** bleed tick: hp to lose this tick (never below the floor, so the curse cannot finish you) */
export const bleedTick = (hp, dt) => Math.max(0, Math.min(TUNE.bleedDps * dt, hp - TUNE.bleedFloor));

// ------------------------------------------------------------------------------------------------ lantern keeper
/** is target inside the lantern beam of a keeper at (x,z) facing yaw (creature yaw: forward = (sin, cos))? */
export function inBeam(kx, kz, yaw, tx, tz, range = TUNE.beamRange, half = TUNE.beamHalf) {
  const dx = tx - kx, dz = tz - kz, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d < 0.6) return true;
  const dot = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d;
  return Math.acos(Math.max(-1, Math.min(1, dot))) <= half;
}
/** may the player snatch the lantern? close enough and NOT in front of the keeper */
export function canSnatch(kx, kz, yaw, px, pz) {
  const dx = px - kx, dz = pz - kz, d = Math.hypot(dx, dz);
  if (d > TUNE.snatchReach) return false;
  return (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.max(d, 1e-4) < TUNE.snatchFront;
}

// ------------------------------------------------------------------------------------------------ trick or treat
export const TREATS = Object.freeze(['loot', 'credits']);
export const TRICKS = Object.freeze(['teleport', 'scuttlers', 'drop', 'static']);
/** the gamble. Treat 55 %, trick 45 % (shown to the player). rng = () => [0,1) */
export function gamble(rng, q) {
  if (rng() < 0.55) {
    if (rng() < 0.5) return { r: 'treat', what: 'loot', value: Math.round(55 + rng() * 60 + q * 6) };
    return { r: 'treat', what: 'credits', credits: Math.round(24 + rng() * 34 + Math.min(q, 8) * 4) };
  }
  const w = [0.34, 0.24, 0.26, 0.16];
  let x = rng(), i = 0; for (; i < w.length - 1; i++) { x -= w[i]; if (x < 0) break; }
  return { r: 'trick', what: TRICKS[i] };
}

// ------------------------------------------------------------------------------------------------ masks
/** seconds of continuous carrying: 0 fine, 1 warning (it giggles / weeps), 2 latch (calls a Masked clone) */
export function maskPhase(held) { return held >= TUNE.maskLatchS ? 2 : held >= TUNE.maskWarnS ? 1 : 0; }
/** a player who dies within this many seconds of a Masked hit is converted */
export const CONVERT_WINDOW = 12;

// ------------------------------------------------------------------------------------------------ other side
/** timeline of the event, seconds from its start: lights spell the warning, the rift opens, the hunter steps through */
export const OS_TIMELINE = Object.freeze({ warn: 0, rift: TUNE.osWarnS, hunter: TUNE.osWarnS + TUNE.osRiftS, close: TUNE.osWarnS + TUNE.osRiftS + 38 });
export function osPhase(t) { return t < OS_TIMELINE.rift ? 'warn' : t < OS_TIMELINE.hunter ? 'rift' : t < OS_TIMELINE.close ? 'open' : 'closed'; }
/** the letters blink one after another: which of the 3 letters of RUN are lit at time t (each 0.7 s, then a pause) */
export function warnLetters(t) { const c = Math.floor(t / 0.7) % 6; return c < 3 ? c + 1 : 3; }
