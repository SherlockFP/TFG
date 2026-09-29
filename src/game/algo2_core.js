// algo2 pure rules (docs/wave6/algo2.md): live-stream HYPE maths + tier payouts, GHOST record / pack / replay, GLITCH placement + PATCH meter, chat rate gate.
// No THREE / DOM here so tools/harness/algo2.test.mjs can run it in plain node. All knobs live in HYPE / GHOST / GLITCH / PATCH.

// ------------------------------------------------------------------ hype (per facility day, host)
export const HYPE = {
  pts: { escape: 12, dodge: 10, door_shut: 8, boss_hit: 4, closet: 12, late_extract: 18, sprint_away: 6, glitch: 5, death: 3 },
  cd: { escape: 0, dodge: 8, door_shut: 15, boss_hit: 6, closet: 60, late_extract: 1e9, sprint_away: 20, glitch: 4, death: 0 },
  repeatK: 0.75,       // every repeat of the same act inside a day is worth 75 % of the last one (floor 25 %): no farming one trick
  cap: 200,
  tiers: [0, 25, 60, 110],   // minimum hype for tier 0 / 1 (bronze) / 2 (silver) / 3 (gold)
  lateExtractSec: 10,  // extraction with fewer real seconds than this left on the clock
  wantMoreTier: 2,     // tier that makes the Algorithm "want more show" (+1 small creature the next landing)
};
export const TIER_NAMES = ['NONE', 'BRONZE', 'SILVER', 'GOLD'];
export const newHype = () => ({ h: 0, n: {}, cd: {} });
export function tierOf(h) { let t = 0; for (let i = 1; i < HYPE.tiers.length; i++) if (h >= HYPE.tiers[i]) t = i; return t; }
/** worth of the next `kind` given how many were already counted (diminishing) */
export function ptsFor(kind, count) {
  const base = HYPE.pts[kind]; if (!base) return 0;
  return Math.max(base * 0.25, base * Math.pow(HYPE.repeatK, Math.max(0, count | 0)));
}
/** add an act. `now` in seconds (any monotonic clock). Returns { gain, tier, up } (gain 0 = ignored / on cooldown). */
export function addHype(s, kind, now) {
  if (!HYPE.pts[kind]) return { gain: 0, tier: tierOf(s.h), up: false };
  if ((s.cd[kind] ?? -1e9) > now) return { gain: 0, tier: tierOf(s.h), up: false };
  const before = tierOf(s.h);
  const gain = Math.round(ptsFor(kind, s.n[kind] || 0) * 10) / 10;
  s.n[kind] = (s.n[kind] || 0) + 1;
  s.cd[kind] = now + (HYPE.cd[kind] || 0);
  s.h = Math.min(HYPE.cap, s.h + gain);
  const tier = tierOf(s.h);
  return { gain, tier, up: tier > before };
}
export const PAY = {
  coin: [0, 30, 80, 160],       // base Clout per aboard player by tier
  coinPerQuota: [0, 15, 30, 50],
  xp: [0, 20, 50, 100],
  crate: [null, null, { kind: 'supply', tier: 'uncommon' }, { kind: 'supply', tier: 'rare' }],   // the sponsor drop
};
/** what one aboard player is paid at extraction. Nothing when nobody is aboard / everyone died. */
export function payout(tier, o = {}) {
  const ti = Math.max(0, Math.min(3, tier | 0));
  if (!ti || !(o.aboard > 0) || o.allDead) return { tier: ti, coin: 0, xp: 0, crate: null };
  const q = Math.max(0, o.quotaIndex | 0);
  return { tier: ti, coin: PAY.coin[ti] + PAY.coinPerQuota[ti] * Math.min(q, 6), xp: PAY.xp[ti], crate: PAY.crate[ti] ? { ...PAY.crate[ti] } : null };
}
/** the Algorithm "wants more show" after a hot day: how many small extra creatures tomorrow (never in quota 0) */
export const wantMore = (tier, quotaIndex) => ((quotaIndex | 0) > 0 && tier >= HYPE.wantMoreTier ? 1 : 0);
/** seconds of real day left on the clock (run.time in game minutes, 24*60 = midnight; dayLen = config.dayLengthSec) */
export const secondsLeft = (time, dayLen = 720) => Math.max(0, (24 * 60 - time) / ((16 * 60) / Math.max(60, dayLen)));
export const isLateExtract = (time, dayLen, outsideAgo) => secondsLeft(time, dayLen) < HYPE.lateExtractSec && outsideAgo != null && outsideAgo < 30;

// ------------------------------------------------------------------ chat rate gate (fake stream chat, client side)
export function makeChatGate(o = {}) {
  const gap = o.gap ?? 1.1, burst = o.burst ?? 4, win = o.win ?? 8;
  const stamps = [];
  return (now) => {
    while (stamps.length && now - stamps[0] > win) stamps.shift();
    if (stamps.length && now - stamps[stamps.length - 1] < gap) return false;
    if (stamps.length >= burst) return false;
    stamps.push(now); return true;
  };
}

// ------------------------------------------------------------------ ghost replay (a dead player's last 10 s)
export const GHOST = { hz: 10, secs: 10, minSamples: 15, hold: 2.5, maxPerMoon: 3, maxAgeDays: 8, minFromEntrance: 12, apart: 6, biasEvery: 6, biasLoud: 0.45, biasSec: 150 };
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = Object.fromEntries([...B64].map((c, i) => [c, i]));
const zz = (n) => (n << 1) ^ (n >> 31);              // zigzag
const unzz = (u) => (u >>> 1) ^ -(u & 1);
function enc12(n) { const v = zz(Math.max(-2047, Math.min(2047, n | 0))); return B64[(v >> 6) & 63] + B64[v & 63]; }
function dec12(s, i) { return unzz((B64I[s[i]] << 6) | B64I[s[i + 1]]); }
const TAU = Math.PI * 2, YAWQ = 256;                   // yaw in 1/256 turn
const wrapQ = (d) => ((d % YAWQ) + YAWQ * 1.5) % YAWQ - YAWQ / 2;
/**
 * pack samples [[x,y,z,yaw]...] (world floats, oldest first) into { n, s, ax, ay, az, aq, hz }: the LAST sample is the anchor (ax/ay/az in dm),
 * the string s holds 4 x 2 base64 chars per sample: dm offset from the previous sample (the first one from the anchor), yaw delta in 1/256 turn.
 * ~8 chars per sample: 100 samples = 800 chars.
 */
export function packTrack(samples, hz = GHOST.hz) {
  const n = samples.length; if (!n) return { n: 0, s: '', ax: 0, ay: 0, az: 0, aq: 0, hz };
  const last = samples[n - 1];
  const ax = Math.round(last[0] * 10), ay = Math.round(last[1] * 10), az = Math.round(last[2] * 10);
  const aq = Math.round(((last[3] % TAU) / TAU) * YAWQ);
  let px = ax, py = ay, pz = az, pq = aq;
  let s = '';
  for (let i = 0; i < n; i++) {
    const q = Math.round(((samples[i][3] % TAU) / TAU) * YAWQ);
    const x = Math.round(samples[i][0] * 10), y = Math.round(samples[i][1] * 10), z = Math.round(samples[i][2] * 10);
    s += enc12(x - px) + enc12(y - py) + enc12(z - pz) + enc12(wrapQ(q - pq));
    px = x; py = y; pz = z; pq = q;
  }
  return { n, s, ax, ay, az, aq, hz };
}
/** inverse of packTrack -> samples RELATIVE to the anchor: [[dx,dy,dz,yaw]...] in metres / radians (oldest first, last = [0,0,0,yaw]) */
export function unpackTrack(p) {
  const out = [];
  if (!p || !p.n || typeof p.s !== 'string' || p.s.length < p.n * 8) return out;
  let x = p.ax, y = p.ay, z = p.az, q = p.aq | 0, i = 0;
  const abs = [];
  for (let k = 0; k < p.n; k++, i += 8) {
    x += dec12(p.s, i); y += dec12(p.s, i + 2); z += dec12(p.s, i + 4); q += dec12(p.s, i + 6);
    abs.push([x, y, z, q]);
  }
  const [lx, ly, lz] = abs[abs.length - 1];
  for (const a of abs) out.push([(a[0] - lx) / 10, (a[1] - ly) / 10, (a[2] - lz) / 10, ((((a[3] / YAWQ) * TAU) % TAU) + TAU) % TAU]);
  return out;
}
const lerpA = (a, b, k) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; };
/** interpolated pose of an unpacked track at second `u` (0..len): { x, y, z, yaw, speed } */
export function sampleAt(track, u, hz = GHOST.hz) {
  const n = track.length; if (!n) return null;
  const f = Math.max(0, Math.min(n - 1, u * hz)), i = Math.floor(f), k = f - i, a = track[i], b = track[Math.min(n - 1, i + 1)];
  const sp = Math.hypot(b[0] - a[0], b[2] - a[2]) * hz;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, yaw: lerpA(a[3], b[3], k), speed: sp };
}
/** where in the loop are we: the track plays for `len` s then the ghost holds (fading) for GHOST.hold s. -> { u, alpha, holding } */
export function ghostLoop(t, len, hold = GHOST.hold) {
  const cyc = len + hold, m = ((t % cyc) + cyc) % cyc;
  if (m < len) return { u: m, alpha: Math.min(1, m / 0.6), holding: false };
  return { u: len, alpha: Math.max(0, 1 - (m - len) / hold), holding: true };
}
/** records the last GHOST.secs of every player at GHOST.hz. feed(dt, [{id,x,y,z,yaw,skip}]); skip clears the buffer (dead / in the ship). */
export class Recorder {
  constructor(hz = GHOST.hz, secs = GHOST.secs) { this.hz = hz; this.max = Math.round(hz * secs) + 1; this.acc = 0; this.buf = new Map(); }
  feed(dt, list) {
    this.acc += Math.min(dt, 0.5);
    const step = 1 / this.hz;
    if (this.acc < step) return;
    this.acc = this.acc % step;
    for (const p of list) {
      if (p.skip) { this.buf.delete(p.id); continue; }
      let b = this.buf.get(p.id); if (!b) this.buf.set(p.id, b = []);
      b.push([p.x, p.y, p.z, p.yaw]);
      if (b.length > this.max) b.shift();
    }
  }
  /** the packed track of `id` (and forget it), or null when there is too little to replay */
  finish(id) {
    const b = this.buf.get(id); this.buf.delete(id);
    return b && b.length >= GHOST.minSamples ? packTrack(b, this.hz) : null;
  }
  clear() { this.buf.clear(); this.acc = 0; }
}
/** ghost store in run.a2.ghosts = { [moon]: [ghost...] }: max 3 per moon (oldest dropped), entries older than maxAgeDays expire */
export function addGhost(a2, moon, g) {
  const st = (a2.ghosts = a2.ghosts || {});
  const list = (st[moon] = st[moon] || []);
  list.push(g);
  while (list.length > GHOST.maxPerMoon) list.shift();
  return list.length;
}
/** ghosts to replay on today's landing at `moon` (removes them from the store: a ghost plays once) */
export function takeGhosts(a2, moon, day) {
  const st = a2?.ghosts; if (!st?.[moon]) return [];
  const all = st[moon];
  const list = all.filter((g) => day > (g.day | 0) && day - (g.day | 0) <= GHOST.maxAgeDays);
  const keep = all.filter((g) => (g.day | 0) >= day);   // made today or later: not playable yet, stays in the store
  if (keep.length) st[moon] = keep; else delete st[moon];
  return list.slice(-GHOST.maxPerMoon);
}
/** pick a spot for every ghost: nearest pool spot to entrance + the recorded offset, >= minFromEntrance from the door, >= apart from each other. -> [spot|null] */
export function chooseAnchors(ghosts, pool, entrance) {
  const used = [], out = [];
  for (const g of ghosts) {
    const tx = entrance.x + (g.rx || 0), tz = entrance.z + (g.rz || 0);
    let best = null, bd = 1e18;
    for (const s of pool) {
      if (Math.hypot(s.x - entrance.x, s.z - entrance.z) < GHOST.minFromEntrance) continue;
      if (used.some((u) => Math.hypot(u.x - s.x, u.z - s.z) < GHOST.apart)) continue;
      const d = (s.x - tx) * (s.x - tx) + (s.z - tz) * (s.z - tz);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) used.push(best);
    out.push(best);
  }
  return out;
}

// ------------------------------------------------------------------ glitch exploits + patch meter
export const GLITCH = { minPerLanding: 1, maxPerLanding: 3, minFromEntrance: 10, apart: 8, wallHop: [16, 50], reach: 3.2, freezeR: 16, freezeSec: 5, punishLightsSec: 40, swarmN: [2, 3] };
export const GLITCH_TYPES = ['wall', 'dup', 'freeze'];
export const PATCH = { use: { wall: 16, dup: 40, freeze: 30 }, wallMaxUses: 8, landingDecay: 25, full: 100 };
/**
 * 1-3 glitches from the spot pool, seeded by `rng.next()`. pool = [{x,y,z,room}], entrance {x,z}. -> [{ id, type, x, y, z, to? }]; `to` (wall only) = the far side.
 * Deterministic for a given pool order: sort the pool first (sortPool) so every peer agrees.
 */
export const sortPool = (pool) => pool.slice().sort((a, b) => a.x - b.x || a.z - b.z);
export function planGlitches(pool, entrance, quotaIndex, rng) {
  const sp = sortPool(pool);
  const count = GLITCH.minPerLanding + Math.floor(rng() * (GLITCH.maxPerLanding - GLITCH.minPerLanding + 1));
  const types = GLITCH_TYPES.slice();
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  const out = [];
  const far = (s) => Math.hypot(s.x - entrance.x, s.z - entrance.z) >= GLITCH.minFromEntrance;
  const apart = (s) => out.every((g) => Math.hypot(g.x - s.x, g.z - s.z) >= GLITCH.apart && (!g.to || Math.hypot(g.to.x - s.x, g.to.z - s.z) >= GLITCH.apart));
  for (const type of types.slice(0, count)) {
    const cand = sp.filter((s) => far(s) && apart(s));
    if (!cand.length) break;
    const s = cand[Math.floor(rng() * cand.length)];
    const g = { id: type[0] + out.length, type, x: s.x, y: s.y, z: s.z };
    if (type === 'wall') {
      const [lo, hi] = GLITCH.wallHop;
      const far2 = sp.filter((q) => { const d = Math.hypot(q.x - s.x, q.z - s.z); return d >= lo && d <= hi && far(q) && (q.room !== s.room || q.room === -1) && out.every((o) => Math.hypot(o.x - q.x, o.z - q.z) >= GLITCH.apart); });
      if (!far2.length) continue;
      const q = far2[Math.floor(rng() * far2.length)];
      g.to = { x: q.x, y: q.y, z: q.z };
    }
    out.push(g);
  }
  return out;
}
export const newPatch = () => ({ meter: 0, patched: false, used: {}, wall: 0 });
/**
 * register a use of glitch `g` ({id,type}). Returns { ok, reason?, meter, patched } where patched = true only on the use that fills the meter.
 * dup / freeze are single use per glitch; the wall may be used PATCH.wallMaxUses times. Once patched nothing works any more this landing.
 */
export function useGlitch(ps, g) {
  if (ps.patched) return { ok: false, reason: 'patched', meter: ps.meter, patched: false };
  const inc = PATCH.use[g.type];
  if (!inc) return { ok: false, reason: 'unknown', meter: ps.meter, patched: false };
  if (g.type === 'wall') { if (ps.wall >= PATCH.wallMaxUses) return { ok: false, reason: 'used', meter: ps.meter, patched: false }; ps.wall++; }
  else { if (ps.used[g.id]) return { ok: false, reason: 'used', meter: ps.meter, patched: false }; ps.used[g.id] = 1; }
  ps.meter = Math.min(PATCH.full, ps.meter + inc);
  if (ps.meter >= PATCH.full) { ps.patched = true; return { ok: true, meter: ps.meter, patched: true }; }
  return { ok: true, meter: ps.meter, patched: false };
}
/** a new landing: the meter (kept in the run) cools down, the per-landing state resets */
export const landingMeter = (meter) => Math.max(0, (meter | 0) - PATCH.landingDecay);
/** what the Algorithm does when it patches: lights out (always possible) or a short swarm (not in quota 0) */
export const punishment = (quotaIndex, r) => ((quotaIndex | 0) <= 0 ? 'lights' : r < 0.5 ? 'swarm' : 'lights');
