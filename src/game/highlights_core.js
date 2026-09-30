// HIGHLIGHTS CLIP pure rules (wave 8, docs/wave8/highlights.md): a cheap ring buffer of player + creature positions, freeze-window -> compact clip, keep the best 3 of the day.
// No THREE / DOM here so tools/harness/highlights.test.mjs runs in plain node. Track packing is reused from algo2_core (packTrack / unpackTrack, base64 dm deltas).
import { packTrack, unpackTrack } from './algo2_core.js';

export const HC = {
  hz: 10, ringSecs: 12,        // recorder: 120 frames
  pre: 7, post: 3,             // window around the moment (s)
  netHz: 5,                    // clip sample rate on the wire (every 2nd frame)
  maxClips: 3, minScore: 18, gap: 8,   // best 3 per day, ignore dull moments, a clip per 8 s of day at most
  NP: 4, NC: 5, near: 35,      // slots: players, creatures (only those within 35 m of a player)
  maxBytes: 20000, minRun: 4,  // wire cap for all clips together, shortest track worth drawing (samples)
  jump: 12,                    // a step longer than this (m) is a teleport / slot reuse: the track breaks there
};
const W_P = 3, W_C = 2;

/** allocation-free ring: begin(t) -> setPlayer / setCreature -> next begin(). Slots are sticky per id (a creature keeps its slot while it stays near). */
export class Ring {
  constructor(hz = HC.hz, secs = HC.ringSecs, NP = HC.NP, NC = HC.NC) {
    this.hz = hz; this.cap = Math.round(hz * secs); this.NP = NP; this.NC = NC;
    this.W = NP * W_P + NC * W_C;
    this.T = new Float64Array(this.cap); this.F = new Float32Array(this.cap * this.W);
    this.pid = new Array(NP).fill(null); this.cid = new Array(NC).fill(null);
    this.cseen = new Int32Array(NC); this.n = 0; this.frame = 0; this.cur = -1;
  }
  clear() { this.n = 0; this.frame = 0; this.cur = -1; this.pid.fill(null); this.cid.fill(null); this.cseen.fill(0); }
  /** start a new frame stamped `t` (seconds of the day clock) */
  begin(t) {
    this.cur = this.n % this.cap; this.n++; this.frame++;
    this.T[this.cur] = t;
    this.F.fill(NaN, this.cur * this.W, (this.cur + 1) * this.W);
  }
  setPlayer(id, x, z, yaw) {
    let s = this.pid.indexOf(id);
    if (s < 0) { s = this.pid.indexOf(null); if (s < 0) return; this.pid[s] = id; }
    const o = this.cur * this.W + s * W_P; this.F[o] = x; this.F[o + 1] = z; this.F[o + 2] = yaw;
  }
  setCreature(id, x, z) {
    let s = this.cid.indexOf(id);
    if (s < 0) {   // a free slot = never used, or unseen for > 5 frames
      for (let i = 0; i < this.NC; i++) if (this.cid[i] === null || this.frame - this.cseen[i] > 5) { s = i; break; }
      if (s < 0) return;
      this.cid[s] = id;
    }
    this.cseen[s] = this.frame;
    const o = this.cur * this.W + this.NP * W_P + s * W_C; this.F[o] = x; this.F[o + 1] = z;
  }
  get size() { return Math.min(this.n, this.cap); }
  /** the i-th stored frame, oldest first -> ring index */
  idx(i) { return (this.n > this.cap ? (this.n + i) : i) % this.cap; }
  time(i) { return this.T[this.idx(i)]; }
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** longest contiguous run of valid, non-teleporting samples of one slot within frames [i0, i1] step `st`: [start, end] (indices into the picked list) or null */
function bestRun(pts) {
  let best = null, s = -1;
  for (let i = 0; i <= pts.length; i++) {
    const ok = i < pts.length && pts[i] && (s < 0 || dist(pts[i], pts[i - 1]) <= HC.jump);
    if (ok) { if (s < 0) s = i; continue; }
    if (s >= 0 && (!best || i - s > best[1] - best[0] + 1)) best = [s, i - 1];
    s = i < pts.length && pts[i] ? i : -1;
  }
  return best && best[1] - best[0] + 1 >= HC.minRun ? best : null;
}

/**
 * freeze the window [tm - pre, tm + post] of the ring into a wire clip. moment m = [kind, name, v, extra, score]; subject = player id of the actor; nameOf(id) -> label.
 * clip = { k, s, v, sc, hz, n, e (event time in s from the start), ev: [[sec, kind]...], p: [[label, i0, packed, isSubject]], c: [[i0, packed]] }
 */
export function buildClip(ring, tm, m, subject, nameOf, events = []) {
  const st = Math.max(1, Math.round(ring.hz / HC.netHz)), picks = [];
  const lo = tm - HC.pre, hi = tm + HC.post;
  for (let i = 0; i < ring.size; i++) { const t = ring.time(i); if (t >= lo && t <= hi) picks.push(ring.idx(i)); }
  if (picks.length < HC.minRun * st) return null;
  const sel = []; for (let i = 0; i < picks.length; i += st) sel.push(picks[i]);
  const t0 = ring.T[sel[0]];
  const get = (fi, o) => { const b = fi * ring.W + o, x = ring.F[b]; return x === x ? [x, ring.F[b + 1], ring.F[b + 2]] : null; };
  const pack = (pts, r) => { const s = pts.slice(r[0], r[1] + 1).map((q) => [q[0], 0, q[1], q[2] || 0]); return packTrack(s, HC.netHz); };
  const P = [];
  for (let s = 0; s < ring.NP; s++) {
    if (ring.pid[s] === null) continue;
    const pts = sel.map((fi) => get(fi, s * W_P)), r = bestRun(pts); if (!r) continue;
    P.push([nameOf(ring.pid[s]), r[0], pack(pts, r), ring.pid[s] === subject ? 1 : 0, pts.slice(r[0], r[1] + 1)]);
  }
  if (!P.length) return null;
  const sub = P.find((q) => q[3]) || P[0];
  const C = [];
  for (let s = 0; s < ring.NC; s++) {
    if (ring.cid[s] === null) continue;
    const pts = sel.map((fi) => get(fi, ring.NP * W_P + s * W_C)), r = bestRun(pts); if (!r) continue;
    let near = 1e9; const seg = pts.slice(r[0], r[1] + 1);
    for (let i = 0; i < seg.length; i++) { const sp = sub[4][Math.min(sub[4].length - 1, Math.max(0, r[0] + i - sub[1]))]; if (sp) near = Math.min(near, dist(seg[i], sp)); }
    if (near <= HC.near) C.push([near, r[0], pack(pts, r)]);
  }
  C.sort((a, b) => a[0] - b[0]);
  const ev = events.map(([t, k]) => [Math.round((t - t0) * 10) / 10, k]).filter(([s]) => s >= 0 && s <= hi - t0);
  return {
    k: m[0], s: String(m[1] || '?'), v: m[2] | 0, x: String(m[3] || ''), sc: m[4] | 0, hz: HC.netHz, n: sel.length, e: Math.round((tm - t0) * 10) / 10, ev,
    p: P.map((q) => q.slice(0, 4)), c: C.slice(0, HC.NC).map((q) => [q[1], q[2]]),
  };
}

/** keep the best `max` clips (highest score), a new clip within `gap` s of a kept one only replaces it when it scores higher. clip.tm = day-clock time of the moment. */
export function keepBest(list, clip, max = HC.maxClips, gap = HC.gap) {
  const out = list.slice(), near = out.findIndex((c) => Math.abs(c.tm - clip.tm) < gap);
  if (near >= 0) { if (clip.sc > out[near].sc) out[near] = clip; } else out.push(clip);
  out.sort((a, b) => b.sc - a.sc);
  return out.slice(0, max);
}
/** wire size in chars */
export const clipBytes = (c) => JSON.stringify(c).length;
/** strip local fields; drop creature tracks then whole low clips until everything fits `max` chars. -> clips for the wire */
export function fitClips(list, max = HC.maxBytes) {
  const wire = list.map((c) => { const { tm, ...rest } = c; return { ...rest, c: rest.c.slice() }; });
  const total = () => wire.reduce((n, c) => n + clipBytes(c), 0);
  while (wire.length && total() > max) {
    const rich = wire.find((c) => c.c.length);
    if (rich) { rich.c.pop(); continue; }
    wire.pop();
  }
  return wire;
}

/** wire clip -> drawable tracks: [{ label, sub, i0, pts: [[x, z, yaw]...] }] for players, [{ i0, pts }] for creatures (absolute metres) */
export function unpackClip(clip) {
  const tr = (p) => { const rel = unpackTrack(p), ax = p.ax / 10, az = p.az / 10; return rel.map((q) => [ax + q[0], az + q[2], q[3]]); };
  return {
    P: (clip.p || []).map(([label, i0, p, sub]) => ({ label, sub: !!sub, i0, pts: tr(p) })),
    C: (clip.c || []).map(([i0, p]) => ({ i0, pts: tr(p) })),
  };
}
/** position of a track at clip second u (linear), or null while it is not on screen: { x, z, yaw } */
export function trackAt(track, u, hz = HC.netHz) {
  const f = u * hz - track.i0;
  if (f < -0.5 || f > track.pts.length - 0.5) return null;
  const c = Math.max(0, Math.min(track.pts.length - 1, f)), i = Math.floor(c), k = c - i, a = track.pts[i], b = track.pts[Math.min(track.pts.length - 1, i + 1)];
  return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: a[2] };
}
/** playback clock: slow-mo (0.5x) within 0.7 s of the moment, so the beat lands. Returns the clip second for elapsed wall seconds. */
export function clipClock(elapsed, len, ev) {
  // integrate the rate piecewise: normal, 0.5x in [ev-0.7, ev+0.7], normal
  const a = Math.max(0, Math.min(len, ev - 0.7)), b = Math.max(a, Math.min(len, ev + 0.7));
  if (elapsed <= a) return elapsed;
  if (elapsed <= a + (b - a) * 2) return a + (elapsed - a) / 2;
  return b + (elapsed - a - (b - a) * 2);
}
export const clipWall = (len, ev) => { const a = Math.max(0, Math.min(len, ev - 0.7)), b = Math.max(a, Math.min(len, ev + 0.7)); return len + (b - a); };
/** fake LIVE viewers counter: climbs with ease-out from a floor, more for a better moment (cosmetic) */
export function viewersAt(clip, k) {
  const u = Math.max(0, Math.min(1, k)), base = 300 + (clip.sc | 0) * 47 + (clip.v | 0) * 3;
  return Math.round(base * (0.08 + 0.92 * (1 - Math.pow(1 - u, 3))) + 7 * Math.sin(u * 40));
}
export const pickCaption = (arr, seed) => arr[Math.abs(seed | 0) % arr.length];
export const seedOf = (clip) => (clip.sc | 0) * 31 + (clip.v | 0) * 7 + String(clip.s).length * 13 + clip.n;
