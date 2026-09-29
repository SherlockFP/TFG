// AIMTELL core (wave 5, docs/wave5/aimchase.md, MASTERPLAN 25.9): pure maths + state machine of the telegraphed aim. No THREE / DOM: node-testable.
//   idle -> AIM (0.8-1.4 s, visible red laser that jitters then steadies, charge beep) -> LOCK (0.25 s, laser white = "dodge now", the
//   point is frozen) -> FIRE at the LOCKED point (never at the target's current position) -> cooldown 2-4 s.
//   A shot only hurts when the target is still standing near the locked point AND the accuracy roll succeeds:
//   accuracy falls with distance, x0.6 vs a sprinting target, x0.3 vs a target in cover, and early quotas are more forgiving.
//   AimGroup limits how many shooters may be in the aim/lock phase at the same time (1 early, 2 later).
export const AIM_T = {
  aimMin: 0.8, aimMax: 1.4, lock: 0.25, cdMin: 2, cdMax: 4,
  hitR: 0.9,          // horizontal radius around the locked point in which the target is still hit (m)
  hitH: 1.15,         // vertical tolerance (m)
  sprintSpeed: 6.4,   // m/s above which a target counts as sprinting
  claimTtl: 4,        // a group claim that is never released expires after this many seconds
};
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

/** 1 at the very first quota, 0 from quota 4 on: how forgiving the early game is */
export const forgive = (quota) => clamp(1 - (quota || 0) / 4, 0, 1);
/** aim phase length (s), r = random 0..1; early quotas aim up to 0.25 s longer; mul < 1 = trained shooters, never below aimMin */
export function aimDuration(r, quota = 0, mul = 1) { return Math.max(AIM_T.aimMin, lerp(AIM_T.aimMin, AIM_T.aimMax, clamp(r, 0, 1)) * mul) + 0.25 * forgive(quota); }
/** pause between two shots of one shooter (s) */
export function cooldownFor(r, quota = 0) { return lerp(AIM_T.cdMin, AIM_T.cdMax, clamp(r, 0, 1)) + 0.8 * forgive(quota); }
/** distance falloff of the base hit chance: 6 m 0.82, 20 m 0.58, 40 m 0.24 */
export function baseAccuracy(dist) { return clamp(0.92 - 0.017 * dist, 0.12, 0.92); }
/** final hit chance once the target is still inside the locked point: dist m, sprint/cover/crouch flags, quota index, extra multiplier */
export function accuracy({ dist = 10, sprint = false, cover = false, crouch = false, quota = 0, mul = 1 } = {}) {
  let a = baseAccuracy(dist);
  if (sprint) a *= 0.6;
  if (cover) a *= 0.3; else if (crouch) a *= 0.8;
  a *= 1 - 0.3 * forgive(quota);
  return clamp(a * mul, 0.03, 0.95);
}
export const isSprinting = (speed) => speed >= AIM_T.sprintSpeed;
/** how many shooters may be aiming / locked at once */
export function maxFiring(quota = 0) { return (quota || 0) < 2 ? 1 : 2; }

/** per-shooter state: ph idle|aim|lock, t (s in the phase), dur (aim length), next (absolute time the next aim may start), lock [x,y,z] | null */
export function newAim() { return { ph: 'idle', t: 0, dur: 0, next: 0, lock: null, tid: null }; }
export const aimReady = (a, now) => a.ph === 'idle' && now >= a.next;
export function aimBegin(a, tid, r, quota = 0, mul = 1) { a.ph = 'aim'; a.t = 0; a.dur = aimDuration(r, quota, mul); a.tid = tid; a.lock = null; return a; }
/** advance; returns 'lock' (freeze the point now), 'fire' (shoot at a.lock now) or null. rC = random for the cooldown. */
export function aimTick(a, dt, now, rC = 0.5, quota = 0) {
  if (a.ph === 'aim') { a.t += dt; if (a.t >= a.dur) { a.ph = 'lock'; a.t = 0; return 'lock'; } return null; }
  if (a.ph === 'lock') {
    a.t += dt;
    if (a.t >= AIM_T.lock) { a.ph = 'idle'; a.t = 0; a.next = now + cooldownFor(rC, quota); return 'fire'; }
  }
  return null;
}
/** target lost / creature interrupted: no shot, short pause */
export function aimAbort(a, now, pause = 0.6) { a.ph = 'idle'; a.t = 0; a.lock = null; a.next = Math.max(a.next, now + pause); }

/** the shot lands only if the target's chest is still within the locked volume; then the accuracy roll decides. */
export function resolveShot(lock, chest, acc, r) {
  const inside = Math.hypot(chest[0] - lock[0], chest[2] - lock[2]) <= AIM_T.hitR && Math.abs(chest[1] - lock[1]) <= AIM_T.hitH;
  return { inside, hit: inside && r < acc };
}

/** shared limit of simultaneous aimers (host side, one per game) */
export class AimGroup {
  constructor() { this.m = new Map(); }
  count(now) { for (const [k, t] of this.m) if (now - t > AIM_T.claimTtl) this.m.delete(k); return this.m.size; }
  claim(id, now, max = 1) {
    this.count(now);
    if (this.m.has(id)) { this.m.set(id, now); return true; }
    if (this.m.size >= max) return false;
    this.m.set(id, now); return true;
  }
  touch(id, now) { if (this.m.has(id)) this.m.set(id, now); }
  release(id) { this.m.delete(id); }
}

// ---- state sync: rides in the creature's existing `extra` field (string): "pid" while aiming, "pid|x|y|z" once locked ----
export const encodeAim = (pid) => String(pid);
export const encodeLock = (pid, p) => `${pid}|${(+p[0]).toFixed(2)}|${(+p[1]).toFixed(2)}|${(+p[2]).toFixed(2)}`;
export function parseAim(extra) {
  if (typeof extra !== 'string' || !extra) return null;
  const s = extra.split('|');
  if (s.length >= 4) {
    const n = s.slice(-3).map(Number);
    if (n.every(Number.isFinite)) return { pid: s.slice(0, -3).join('|'), lock: n };
  }
  return { pid: extra, lock: null };
}
/** the visual jitter (m) of the aim laser at `t` s into the aim: shaky at first, steady in the last 0.3 s */
export function jitterAmp(t, dur = 1.1) { const k = clamp(t / Math.max(0.4, dur - 0.3), 0, 1); return 0.55 * (1 - k) * (1 - k); }
