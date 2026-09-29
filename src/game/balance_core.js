// Balance core (pure, no DOM / three): every number that scales creatures and the Threat meter.
// Imported by src/game/balance.js (game glue) and tools/sim/balance.mjs (node sim), so the sim and the game use
// the exact same formulas. See docs/wave1/balance.md for the tables and the reasoning.

import { capOne } from './balance_rules.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------------------------------------ sector curve
// q = run.quotaIndex (0 = first quota, every met quota opens a new sector). Owner complaint: "creatures are way
// too strong at the start, they should be weak and slow at first" -> a start value that ramps LINEARLY to 1.0 at
// RAMP_Q, then creeps up slowly to a cap.
export const RAMP_Q = 4;
export const SECTOR = {
  //          quota 0   after RAMP_Q per quota   cap
  hp: { start: 0.80, slope: 0.05, cap: 1.5 },
  dmg: { start: 0.60, slope: 0.05, cap: 1.5 },
  speed: { start: 0.80, slope: 0.015, cap: 1.2 },     // speed cap is low on purpose: >1.2x makes sprinting pointless
  spawn: { start: 0.90, slope: 0.0, cap: 1.0 },       // creature BUDGET (host.js already adds +3 %/quota on top)
  detect: { start: 0.90, slope: 0.0, cap: 1.0 },      // sight / hearing range
};
export function ramp(q, spec) {
  q = Math.max(0, q || 0);
  if (q <= RAMP_Q) return lerp(spec.start, 1, q / RAMP_Q);
  return Math.min(spec.cap, 1 + spec.slope * (q - RAMP_Q));
}
export function sectorScale(q) {
  return { hp: ramp(q, SECTOR.hp), dmg: ramp(q, SECTOR.dmg), speed: ramp(q, SECTOR.speed), spawn: ramp(q, SECTOR.spawn), detect: ramp(q, SECTOR.detect) };
}

// Early-game safety nets (quota index -> value). Interpolated by step: the LAST entry whose q <= quotaIndex wins.
//  hitCap: a single hit may take at most this fraction of a 100 HP bar (player max HP is always >= 100, so it is
//          never more than that fraction of the real max HP). Applies to creature / trap damage only.
//  speedCap: absolute creature speed ceiling in m/s (player sprint is 8.2, so sprinting always escapes).
export const EARLY = [
  { q: 0, hitCap: 0.45, speedCap: 8.0 },
  { q: 2, hitCap: 0.60, speedCap: 9.5 },
  { q: 3, hitCap: 0.60, speedCap: 0 },   // 0 = no speed cap; the hit cap itself now lives in balance_rules.js (85 % from quota 4)
];
export function earlyRules(q) {
  let r = EARLY[0];
  for (const e of EARLY) if ((q || 0) >= e.q) r = e;
  return r;
}
/** Cap one creature / trap hit (dmg may be 999 = instakill). Rules: balance_rules.js (45 % / 60 % / 85 % of a 100 HP bar; ok = telegraphed instakill allowed from quota 4). */
export function capHit(dmg, q, ok = false) { return capOne(dmg, q, ok); }

// ------------------------------------------------------------------------------------------------ threat -> scale
// Piecewise-linear over the threat meter (anchors: [threat, value]).
const A = {
  spawn: [[0, 0.85], [25, 1.0], [50, 1.2], [75, 1.45], [100, 1.7]],     // budget AND spawn pace
  detect: [[0, 0.9], [25, 1.0], [50, 1.15], [75, 1.3], [100, 1.4]],
  speed: [[0, 1.0], [50, 1.04], [75, 1.08], [100, 1.12]],
  dmg: [[0, 1.0], [50, 1.0], [75, 1.08], [100, 1.15]],
  hunt: [[0, 0], [40, 0.05], [50, 0.2], [75, 0.4], [100, 0.55]],        // chance that an idle wander heads for a player
};
function interp(anchors, x) {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    if (x <= anchors[i][0]) { const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i]; return lerp(y0, y1, (x - x0) / (x1 - x0)); }
  }
  return anchors[anchors.length - 1][1];
}
export function threatScale(T) {
  T = clamp(T || 0, 0, 100);
  return { spawn: interp(A.spawn, T), detect: interp(A.detect, T), speed: interp(A.speed, T), dmg: interp(A.dmg, T), hunt: interp(A.hunt, T) };
}
const CAP = { hp: 1.5, dmg: 1.6, speed: 1.25, spawn: 3, detect: 1.5 };

/**
 * Combined multipliers for a sector + threat. kind: 'creature' (default) | 'boss' (never weaker than 0.7x dmg / 0.9x hp
 * / 0.85x speed, so the Foreman is still a fight on quota 0) | 'hazard' (traps: only damage scales).
 */
export function scaleFor(q, T, kind = 'creature') {
  const s = sectorScale(q), t = threatScale(T);
  let out = {
    hp: clamp(s.hp, 0.1, CAP.hp),
    dmg: clamp(s.dmg * t.dmg, 0.1, CAP.dmg),
    speed: clamp(s.speed * t.speed, 0.1, CAP.speed),
    spawn: clamp(s.spawn * t.spawn, 0.1, CAP.spawn),
    detect: clamp(s.detect * t.detect, 0.1, CAP.detect),
    pace: t.spawn,       // spawn pace (threat part only: waves come faster while you are hunted)
    hunt: t.hunt,
  };
  if (kind === 'boss') { out.hp = Math.max(out.hp, 0.9); out.dmg = Math.max(out.dmg, 0.7); out.speed = Math.max(out.speed, 0.85); }
  else if (kind === 'hazard') { out.hp = 1; out.speed = 1; out.detect = 1; out.hunt = 0; }
  return out;
}

/** Loot luck 0..1 for tier rolls: a little from the sector, most of it from how much trouble the crew is in (greed pays). */
export function lootLuckFor(q, T) {
  return clamp(0.06 + 0.025 * Math.min(12, Math.max(0, q || 0)) + 0.55 * (clamp(T || 0, 0, 100) / 100), 0, 0.95);
}

// ------------------------------------------------------------------------------------------------ threat meter
export const LEVELS = [
  { id: 'calm', name: 'CALM', at: 0, color: '#6fdc8c', line: 'Nothing has noticed you. Yet.' },
  { id: 'uneasy', name: 'UNEASY', at: 25, color: '#e8d24a', line: 'Something in the walls is paying attention.' },
  { id: 'hunted', name: 'HUNTED', at: 50, color: '#ff9a2e', line: 'The facility is sending things after you.' },
  { id: 'fucked', name: 'FUCKED', at: 75, color: '#ff3b3b', line: 'EVERYTHING KNOWS WHERE YOU ARE.' },
];
export const LEVEL_HYST = 3;     // the meter must fall this far below a threshold before the level drops
/** Level index 0..3 for a threat value; `prev` (index) adds hysteresis on the way down. */
export function levelIndex(T, prev = -1) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (T >= LEVELS[k].at) i = k;
  if (prev >= 0 && i < prev && T > LEVELS[prev].at - LEVEL_HYST) i = prev;
  return i;
}

export const THREAT = {
  BASE_CAP: 72,                // the slow integrator saturates here: time + greed alone can reach HUNTED, never FUCKED
  SPIKE_CAP: 38,               // fast component (noise, alarms): decays in ~a minute
  spikeTau: 40,                // s (spike *= exp(-dt / tau))
  time: { r0: 0.06, r1: 0.16, ramp: 600 },   // /s while somebody is inside: 0.06 at the door, 0.16 after 10 min inside
  crew: { per: 0.12, cap: 1.4 },             // more crewmates inside = more disturbance
  greed: { perValue: 0.07, cap: 2.0, secured: 0.35, min: 60, quotaFrac: 0.6 },   // /s at greed factor 1 (carried = 0.6 quota)
  sprint: { minLoud: 0.55, rate: 0.30 },     // /s * (loud - minLoud + 0.25) per sprinting player inside
  voice: { min: 0.6, rate: 0.10 },           // loud voice / shouting
  noiseEvent: { min: 0.45, gain: 1.4, cap: 6 },   // creatures.noise(pos, loud) events: gain * loud, capped
  decayShip: 0.55,             // /s of base while every living crewmate is aboard
  decayOutside: 0.10,          // /s while nobody is inside but somebody walks about outside
  deathRelief: 15,             // base points removed when a crewmate dies (and half of the spike)
  directorRelief: 4,           // base points removed by a director relief
  floors: { alarm: 45, lockdown: 62, extraction: 80 },
  edges: { alarm: 12, lockdown: 18, overload: 10, extraction: 25 },
  extractionRate: 3.0,         // base growth multiplier while an extraction is running
  overloadRate: 1.5,
};

export class ThreatModel {
  constructor() { this.reset(); }
  reset() {
    this.base = 0; this.spike = 0; this.insideT = 0; this.T = 0; this.floor = 0;
    this.ev = { alarm: false, lockdown: false, overload: false, extraction: false };
    this.parts = { time: 0, greed: 0, noise: 0 };   // last per-second rates (debug / HUD tooltip)
  }
  value() { return this.T; }
  addSpike(v) { this.spike = clamp(this.spike + v, 0, THREAT.SPIKE_CAP); this._update(); }
  addBase(v) { this.base = clamp(this.base + v, 0, THREAT.BASE_CAP); this._update(); }
  /** creatures.noise(pos, loud) event */
  noiseEvent(loud) {
    const n = THREAT.noiseEvent;
    if (!(loud >= n.min)) return 0;
    const g = Math.min(n.cap, loud * n.gain);
    this.addSpike(g);
    return g;
  }
  death() { this.base = Math.max(0, this.base - THREAT.deathRelief); this.spike *= 0.5; this._update(); }
  relief(v = THREAT.directorRelief) { this.base = Math.max(0, this.base - v); this._update(); }
  /** facility state edges: flags = { alarm, lockdown, overload, extraction } (booleans) */
  setEvents(flags) {
    for (const k of Object.keys(this.ev)) {
      const on = !!flags[k];
      if (on && !this.ev[k]) this.addSpike(THREAT.edges[k] || 0);
      this.ev[k] = on;
    }
    this.floor = Math.max(this.ev.extraction ? THREAT.floors.extraction : 0, this.ev.lockdown ? THREAT.floors.lockdown : 0, this.ev.alarm ? THREAT.floors.alarm : 0);
    this._update();
  }
  /**
   * ctx: { inside: alive players inside the facility, crew: alive players, aboardAll: every living crewmate is in the ship,
   *        carried: value carried by players inside, secured: value already in the ship today, quota,
   *        sprint: sum over inside players of (noise level - sprint.minLoud) for sprinters (>= 0), voice: same for shouting }
   */
  step(dt, c) {
    const P = THREAT;
    let rate = 0;
    let time = 0, greed = 0, noise = 0;
    if (c.inside > 0) {
      this.insideT += dt;
      const crewMul = Math.min(P.crew.cap, 1 + P.crew.per * (c.inside - 1));
      time = lerp(P.time.r0, P.time.r1, Math.min(1, this.insideT / P.time.ramp)) * crewMul;
      const ref = Math.max(P.greed.min, (c.quota || 0) * P.greed.quotaFrac);
      const g = ((c.carried || 0) + P.greed.secured * (c.secured || 0)) / ref;
      greed = P.greed.perValue * Math.min(P.greed.cap, g);
      noise = (c.sprint || 0) * P.sprint.rate + (c.voice || 0) * P.voice.rate;
      rate = time + greed + noise;
      if (this.ev.extraction) rate *= P.extractionRate;
      else if (this.ev.overload) rate *= P.overloadRate;
      // saturating: the closer to the cap the slower it grows
      this.base = Math.min(P.BASE_CAP, this.base + rate * dt * (1 - this.base / (P.BASE_CAP + 12)));
    } else if (c.crew > 0 && c.aboardAll) this.base = Math.max(0, this.base - P.decayShip * dt);
    else if (c.crew > 0) this.base = Math.max(0, this.base - P.decayOutside * dt);
    this.spike = this.spike * Math.exp(-dt / P.spikeTau);
    if (this.spike < 0.01) this.spike = 0;
    this.parts = { time, greed, noise };
    this._update();
    return this.T;
  }
  _update() { this.T = clamp(Math.max(this.base + this.spike, this.floor), 0, 100); }
}
