// CREATURES10 wave 10 - pure rules for the three internet-horror creatures (docs/wave10/creatures10.md). No THREE / DOM: node-tested.
//   BUFFERING     moves only while its loading ring spins; buffers (freezes) every few seconds - that is the window to pass.
//   DOOMSCROLLER  ceiling crawler of phone screens; drops on a player who stands still under it (scroll-tick ramps up first).
//   RATIO         mirrored pair; a twin moves only while nobody looks at it, and rushes while the OTHER twin is watched.
export const IDS = Object.freeze({ buffering: 'c10_buffering', doom: 'c10_doomscroller', ratio: 'c10_ratio' });
export const ALL_IDS = Object.freeze([IDS.buffering, IDS.doom, IDS.ratio]);

export const TUNE = Object.freeze({
  // ---- Buffering: every timer here is a telegraph or a window; damage only after `windup` (+ the 0.4 s balance_rules gate)
  buf: { spinMin: 4.0, spinMax: 6.5, buffer: 2.6, resume: 0.8, windup: 0.9, attackT: 0.55, reach: 1.7, hitReach: 2.5, cd: 2.6, sight: 26, fov: 160, hear: 16, lose: 8, wanderR: 16 },
  // ---- Doomscroller: `fill` seconds of standing still under it; moving drains 3x faster; windup 1.0 s (notification ping + red screens)
  doom: { under: 2.6, still: 0.7, fill: 3.6, drain: 1.2, windup: 1.0, fall: 16, hitR: 1.8, sprawl: 2.8, climb: 2.2, tickSlow: 0.62, tickFast: 0.1, hang: 0.6, maxCeil: 4.6, defCeil: 3.3, sense: 34, focusMin: 0.04 },
  // ---- Ratio: watchDist / cone decide "looked at" (M.isLookedAt); grace keeps a twin frozen 0.2 s after the look ends (net jitter)
  ratio: { watchDist: 34, cone: 0.8, grace: 0.2, sense: 45, reach: 1.6, hitReach: 2.3, windup: 0.9, attackT: 0.6, cd: 3, twinMin: 3.5, twinMax: 9, twinTries: 6 },
  // first quota index (run.quotaIndex) in which the generic spawners may roll each of them: not the first days
  minQuota: { c10_buffering: 1, c10_doomscroller: 1, c10_ratio: 2 },
  // spawn weight per moon tier 1..4 (tier 1 = the first two moons never get them) - merged into creatures.js EXTRA_SPAWNS
  spawn: {
    c10_buffering: { zone: 'in', w: [0, 4, 6, 7] },
    c10_doomscroller: { zone: 'in', w: [0, 3, 5, 6], interior: { office: 1.3, serverfarm: 1.3, factory: 1.1, mansion: 0.8 } },
    c10_ratio: { zone: 'in', w: [0, 2, 4, 6], interior: { mansion: 1.4, museum: 1.4, academy: 1.2 } },
  },
});

export const quotaAllows = (id, quotaIndex) => (quotaIndex | 0) >= (TUNE.minQuota[id] ?? 0);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------------------------------------ Buffering
/** seconds of movement before the next buffer; r = () => [0,1) */
export const rollSpin = (r = Math.random) => lerp(TUNE.buf.spinMin, TUNE.buf.spinMax, r());
/** 0..1 fill of the ring "loading %" (the model flickers above 0.85: lag is coming) */
export const bufferFill = (left, dur) => (dur > 0 ? clamp(1 - left / dur, 0, 1) : 0);

// ------------------------------------------------------------------------------------------------ Doomscroller
/** next dwell meter (0..1) of one player. under = inside the radius below it, still = horizontal speed under the threshold */
export function dwellStep(m, under, still, dt) {
  const D = TUNE.doom;
  if (under && still) return clamp(m + dt / D.fill, 0, 1);
  return clamp(m - dt / (under ? D.drain : D.drain * 0.5), 0, 1);   // out of range it forgets you faster
}
/** seconds between two scroll ticks at meter m (0..1): slow flick -> machine-gun */
export const tickInterval = (m) => lerp(TUNE.doom.tickSlow, TUNE.doom.tickFast, clamp(m, 0, 1) ** 1.3);
export const tickPitch = (m) => lerp(0.85, 1.9, clamp(m, 0, 1));
export const tickVolume = (m) => lerp(0.35, 0.95, clamp(m, 0, 1));
/** ceiling y above (x, z) for a facility layout {y, ox, oz, w, h, heightOf} (or a plain floor y when there is none), capped for tall halls */
export function ceilingY(layout, x, z, floorY = 0) {
  const D = TUNE.doom;
  if (!layout || !layout.heightOf) return (layout?.y ?? floorY) + D.defCeil;
  const gx = Math.floor((x - layout.ox) / 4), gz = Math.floor((z - layout.oz) / 4);
  const inb = gx >= 0 && gz >= 0 && gx < layout.w && gz < layout.h;
  const h = (inb && layout.heightOf[gz * layout.w + gx]) || D.defCeil;
  return layout.y + Math.min(h, D.maxCeil);
}

// ------------------------------------------------------------------------------------------------ Ratio
/** the rule: watched = freeze; else the other twin watched = rush; else a slow creep (an orphan never rushes) */
export function ratioMode(selfWatched, otherWatched, hasTwin) {
  if (selfWatched) return 'freeze';
  return hasTwin && otherWatched ? 'rush' : 'creep';
}
/** mirror side of a twin from its seed (the model mirrors on odd seeds; the twin gets seed ^ 1) */
export const ratioSide = (seed) => ((seed | 0) & 1 ? 1 : 0);
