// CREATURES12 wave 12 - pure rules of the four PERCEPTION creatures (docs/wave12/creatures12.md). No THREE / DOM: node-tested.
//   404 (NOT FOUND)  invisible: seen only through the scanner pulse / the scout drone / a 0.3 s glitch outline when a flashlight beam crosses it / the ship radar dot.
//                    Slow and relentless; 1.0 s static burst wind-up, then a hit that DOWNS the target.
//   COOKIE           a crumb that latches on a back. While it sits there every creature in the facility hears where that player is; after 6 s a
//                    TRACKING ENABLED ribbon shows on the victim. A teammate holds E to pull it off, or the victim clears cookies at the ship terminal.
//   ECHO CHAMBER     stationary organ in a big room: records the crew's sounds (footsteps, item drops, bangs, voice) and replays them somewhere else; the weak point glows while it does.
//   LAG SPIKE        floating corrupted cube: a 6 m lag zone (rubber-band every ~1.5 s to where you were 0.8 s ago + delayed movement input). Shimmer + stutter first.
export const IDS = Object.freeze({ nf: 'c12_404', cookie: 'c12_cookie', echo: 'c12_echo', lag: 'c12_lag' });
export const ALL_IDS = Object.freeze([IDS.nf, IDS.cookie, IDS.echo, IDS.lag]);

export const TUNE = Object.freeze({
  // every timer that precedes a hit / a penalty is a telegraph of >= 0.8 s
  nf: { walk: 2.1, trigger: 2.3, cancelR: 3.6, windup: 1.0, hitReach: 2.9, attackT: 0.5, off: 2.6, staticR: 11, scanR: 24, scanReveal: 2.5, glitchT: 0.3, glitchRearm: 0.5, flashR: 13, droneR: 45, senseR: 60 },
  ck: { walk: 2.6, run: 4.4, prime: 0.8, primeR: 1.3, latchR: 1.9, retry: 2.5, ping: 1.6, loud: 3.4, ribbon: 6, pull: 1.2, pullR: 2.6, hostPullR: 3.4, seek: 40, back: 0.3, up: 1.2 },
  echo: { ear: 22, need: 6, max: 16, tape: 3.0, replay: 5.5, lead: 1.0, cool: 8, spotMin: 18, spotAway: 12, weakMul: 2.5, stepMin: 0.4, voiceMin: 0.28, stepGap: 0.55, voiceGap: 0.6 },
  lag: { zone: 6, zoneDy: 3.5, trigger: 9, shimmer: 1.5, active: 12, off: 5, rest: [8, 14], walk: 1.3, seek: 16, hover: 1.5, snapBack: 0.8, snapEvery: 1.5, snapFirst: 0.7, delay: 0.28, hist: 3 },
  minQuota: { c12_404: 2, c12_cookie: 2, c12_echo: 2, c12_lag: 2 },
  spawn: {
    c12_404: { zone: 'in', w: [0, 2, 4, 5], interior: { serverfarm: 1.3, hospital: 1.2, office: 1.1 } },
    c12_cookie: { zone: 'in', w: [0, 4, 5, 6], interior: { office: 1.3, mansion: 1.1 } },
    c12_echo: { zone: 'in', w: [0, 3, 4, 5], interior: { factory: 1.3, serverfarm: 1.2 } },
    c12_lag: { zone: 'in', w: [0, 3, 5, 6], interior: { serverfarm: 1.4, office: 1.2 } },
  },
});
export const quotaAllows = (id, quotaIndex) => (quotaIndex | 0) >= (TUNE.minQuota[id] ?? 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------------------------------------ 404
/** 404 look on the client: 0 invisible, 1 glitch outline, 2 revealed. Sources: alive flag, drone view, scan timer, glitch timer (all in seconds left) */
export function nfLook({ dead = false, drone = false, scan = 0, glitch = 0 } = {}) {
  if (dead || drone || scan > 0) return 2;
  return glitch > 0 ? 1 : 0;
}
/** edge-detect a flashlight sweep: returns the new { lit, rearm, glitch } given whether the beam is on it now */
export function glitchStep(s, litNow, dt, T = TUNE.nf) {
  const r = { lit: litNow, rearm: Math.max(0, (s.rearm || 0) - dt), glitch: Math.max(0, (s.glitch || 0) - dt) };
  if (litNow && !s.lit && r.rearm <= 0) { r.glitch = T.glitchT; r.rearm = T.glitchRearm + T.glitchT; }
  return r;
}
/** screen static 0..1 for a client at distance d from the nearest 404 (windup 0..1 = the burst ramp) */
export function staticLevel(d, windup = 0, T = TUNE.nf) {
  const near = d < T.staticR ? Math.pow(1 - d / T.staticR, 1.6) * 0.5 : 0;
  return clamp(Math.max(near, windup > 0 ? (0.4 + 0.55 * windup) * (d < T.staticR + 4 ? 1 : 0) : 0), 0, 0.95);
}

// ------------------------------------------------------------------------------------------------ COOKIE
/** the cookie sits on the victim's back: victim pos + a step behind their look direction, at shoulder height */
export function backSpot(pos, look, T = TUNE.ck) {
  const h = Math.hypot(look?.x || 0, look?.z || 0) || 1;
  return { x: pos.x - (look?.x || 0) / h * T.back, y: pos.y + T.up, z: pos.z - (look?.z || 0) / h * T.back };
}
/** who a cookie hunts: the nearest living player in the facility with NO cookie on them (falls back to any when everybody carries one) */
export function pickHost(players, from, carried, maxD = TUNE.ck.seek) {
  let best = null, bd = maxD;
  for (const p of players) {
    if (carried.has(p.id)) continue;
    const d = Math.hypot(p.pos.x - from.x, p.pos.z - from.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
/** ribbon visibility: TRACKING ENABLED shows on the victim 6 s after the latch */
export const ribbonOn = (latchedFor, T = TUNE.ck) => latchedFor >= T.ribbon;
/** hold-E pull progress: hold >= T.pull while facing a cookied crewmate within T.pullR */
export const pullDone = (held, T = TUNE.ck) => held >= T.pull;

// ------------------------------------------------------------------------------------------------ ECHO CHAMBER
/** tape of recorded sounds: [{ k: 'step' | 'drop' | 'bang' | 'voice', loud, t }] (t = seconds since the tape started) */
export class Tape {
  constructor(T = TUNE.echo) { this.T = T; this.ev = []; this.t = 0; this.gap = { step: 0, voice: 0 }; }
  tick(dt) { this.t += dt; this.gap.step = Math.max(0, this.gap.step - dt); this.gap.voice = Math.max(0, this.gap.voice - dt); }
  /** record one sound; steps / voice are rate-limited so a single sprinter cannot fill the tape alone */
  add(k, loud) {
    const T = this.T;
    if ((k === 'step' || k === 'voice') && this.gap[k] > 0) return false;
    if (k === 'step' && loud < T.stepMin) return false;
    if (k === 'voice' && loud < T.voiceMin) return false;
    if (k === 'step') this.gap.step = T.stepGap; else if (k === 'voice') this.gap.voice = T.voiceGap;
    if (!this.ev.length) this.t = 0;
    this.ev.push({ k, loud: clamp(loud, 0.2, 4), t: this.t });
    if (this.ev.length > T.max) this.ev.shift();
    return true;
  }
  get fill() { return clamp(this.ev.length / this.T.need, 0, 1); }
  get ready() { return this.ev.length >= this.T.need; }
  clear() { this.ev.length = 0; this.t = 0; }
  /** the replay schedule: the tape squeezed / kept into <= T.replay s, offsets from the first event, first one after T.lead s. [{ at, k, loud }] */
  plan() {
    const T = this.T, ev = this.ev;
    if (!ev.length) return [];
    const span = Math.max(0.01, ev[ev.length - 1].t - ev[0].t), sc = span > T.replay ? T.replay / span : 1;
    return ev.map((e) => ({ at: T.lead + (e.t - ev[0].t) * sc, k: e.k, loud: e.loud }));
  }
}
/** sound recorded from a host `noise(pos, loud)` call: loud >= 0.6 = a bang (gunshot, hit), otherwise an item drop / knock */
export const kindOfNoise = (loud) => (loud >= 0.6 ? 'bang' : 'drop');
/** which sound name (with fallbacks) a replayed event plays */
export const SOUND_OF = Object.freeze({ step: ['step_concrete_1', 'step_metal_1'], drop: ['item_drop'], bang: ['hit_metal', 'item_drop'], voice: ['c12_echo_voice', 'chat_blip'] });
/** pick the room to fake the sounds in: a candidate >= T.spotMin from the chamber and (when possible) >= T.spotAway from every player; r in [0,1) picks among the valid ones. cands: [{x,z}] */
export function pickLureSpot(cands, chamber, players, r = Math.random(), T = TUNE.echo) {
  const far = (p, q, m) => Math.hypot(p.x - q.x, p.z - q.z) >= m;
  const a = cands.filter((c) => far(c, chamber, T.spotMin));
  const b = a.filter((c) => players.every((p) => far(c, p.pos, T.spotAway)));
  const pool = b.length ? b : a.length ? a : cands;
  return pool.length ? pool[Math.floor(r * pool.length) % pool.length] : null;
}
/** the largest room that is not the entrance / vault / generator, ties -> the farthest from the entrance room; null if none. rooms: [{id,x,z,w,h,type,cx,cz}] */
export function bigRoom(rooms, distOf = null) {
  let best = null, bs = -1;
  for (const r of rooms || []) {
    if (r.type === 'entrance' || r.type === 'vault' || r.type === 'generator') continue;
    const s = r.w * r.h * 1000 + (distOf ? distOf(r) : 0);
    if (s > bs) { bs = s; best = r; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ LAG SPIKE
/** ring of [t, x, y, z] samples of the local player; `at(now - back)` = where you were `back` seconds ago (oldest sample when younger than the window) */
export class PosHistory {
  constructor(window = TUNE.lag.hist) { this.w = window; this.a = []; }
  push(t, x, y, z) {
    const a = this.a;
    a.push([t, x, y, z]);
    while (a.length > 2 && t - a[0][0] > this.w) a.shift();
  }
  clear() { this.a.length = 0; }
  at(t) {
    const a = this.a;
    if (!a.length) return null;
    if (t <= a[0][0]) return { x: a[0][1], y: a[0][2], z: a[0][3] };
    for (let i = a.length - 1; i > 0; i--) {
      if (a[i - 1][0] <= t) {
        const p = a[i - 1], q = a[i], u = q[0] > p[0] ? (t - p[0]) / (q[0] - p[0]) : 0;
        return { x: p[1] + (q[1] - p[1]) * u, y: p[2] + (q[2] - p[2]) * u, z: p[3] + (q[3] - p[3]) * u };
      }
    }
    const l = a[a.length - 1];
    return { x: l[1], y: l[2], z: l[3] };
  }
}
/** is a player at (x,y,z) inside a lag zone centred at c? (horizontal radius, limited vertical band) */
export const inZone = (p, c, T = TUNE.lag) => Math.hypot(p.x - c.x, p.z - c.z) < T.zone && Math.abs(p.y - c.y) < T.zoneDy;
/**
 * the rubber-band clock: call every frame with lagged=true/false. Returns true on the frame the player must snap back.
 * s = { t: seconds inside the zone, next: time of the next snap }
 */
export function bandStep(s, lagged, dt, T = TUNE.lag) {
  if (!lagged) { s.t = 0; s.next = T.snapFirst; return false; }
  s.t += dt;
  if (s.next === undefined) s.next = T.snapFirst;
  if (s.t >= s.next) { s.next = s.t + T.snapEvery; return true; }
  return false;
}
/** delayed key state: samples = [{ t, st: {action: bool} }] (oldest first); returns the state of `action` `delay` s ago (false before the first sample) */
export function delayedDown(samples, now, action, delay = TUNE.lag.delay) {
  const want = now - delay;
  let v = false;
  for (const s of samples) { if (s.t > want) break; v = !!s.st[action]; }
  return v;
}
/** host: what a lag spike does next. st = { state, t, cool }, near = a player within T.trigger m. Returns the next state or null */
export function lagNext(st, near, T = TUNE.lag) {
  if (st.state === 'fly') return near && st.cool <= 0 ? 'scan' : null;
  if (st.state === 'scan') return st.t >= T.shimmer ? 'active' : null;
  if (st.state === 'active') return st.t >= T.active ? 'off' : null;
  if (st.state === 'off') return st.t >= T.off ? 'fly' : null;
  return null;
}
