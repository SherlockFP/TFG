// SWARM11 wave 11 - procedural sounds of the Scraper colony, the Streamer and the AutoMod (recipes: sr -> Float32Array, same shape as KefalAPI.registerSound).
//   sw_scr_chirp / skitter / wind / alarm / pop   Scraper: pickup + deposit chirp, leg skitter (loop), lunge whine, NEST SIREN (the 1.0 s telegraph), death pop
//   sw_nest_hum                                   Nest core hum (loop)
//   sw_live_jingle / hum / sw_ring_break          Streamer: LIVE! jingle (boot), crowd + mains hum (loop), the ring light shatters
//   sw_mod_lock / flag / delete / hum / sweep     AutoMod: target lock, FLAG siren (accelerating, 1.3 s), the delete, motor hum (loop), squeegee sweep (loop)
const TAU = Math.PI * 2;
const mkRnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; };
/** render(sr, dur, seed, fn(t, st), {loop}) -> normalised Float32Array; non-loops get 5 ms edge fades */
function render(sr, dur, seed, fn, { loop = false, peak = 0.85 } = {}) {
  const n = Math.max(1, Math.floor(dur * sr)), out = new Float32Array(n);
  const st = { ph: 0, ph2: 0, lp: 0, hp: 0, prev: 0, rnd: mkRnd(seed), dt: 1 / sr };
  let mx = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, st); out[i] = v; if (Math.abs(v) > mx) mx = Math.abs(v); }
  const g = peak / mx, fade = loop ? 0 : Math.max(1, Math.floor(sr * 0.005));
  for (let i = 0; i < n; i++) out[i] *= g * (fade ? Math.min(1, i / fade, (n - 1 - i) / fade) : 1);
  return out;
}
const soft = Math.tanh;
/** one-pole low-pass on the running state */
const lp = (st, key, x, a) => (st[key] = (st[key] || 0) + (x - (st[key] || 0)) * a);
const tick = (t, t0, f, k) => { const u = t - t0; return u > 0 ? Math.exp(-u * k) * Math.sin(TAU * f * u) : 0; };


export const SOUNDS = {
  sw_scr_chirp: (sr) => render(sr, 0.2, 2101, (t, s) => {
    const f = t < 0.09 ? 1700 + 900 * (t / 0.09) : 2200 + 1200 * ((t - 0.09) / 0.11);
    s.ph += f * s.dt;
    return Math.sin(TAU * s.ph + 2 * Math.sin(TAU * 40 * t)) * Math.exp(-((t % 0.1) * 22)) * 0.9;
  }),
  sw_scr_skitter: (sr) => render(sr, 1, 2102, (t, s) => {
    let v = 0.04 * Math.sin(TAU * 60 * t);
    for (let k = 0; k < 16; k++) v += 0.4 * tick(t, (k * 0.0625 + (k % 3) * 0.006), 1400 + (k * 211) % 1300, 320) * (k % 2 ? 0.6 : 1);
    return v + lp(s, 'lp', s.rnd(), 0.5) * Math.max(0, Math.sin(TAU * 8 * t)) * 0.05;
  }, { loop: true }),
  sw_scr_wind: (sr) => render(sr, 0.9, 2103, (t, s) => {
    const u = t / 0.9; s.ph += (380 + 1300 * u * u) * s.dt;
    return soft((Math.sin(TAU * s.ph) + 0.4 * Math.sin(TAU * s.ph * 2.01)) * (0.7 + 0.3 * Math.sin(TAU * 18 * t)) * (0.2 + 0.8 * u) * 1.2);
  }),
  sw_scr_alarm: (sr) => render(sr, 1.0, 2104, (t, s) => {
    const hi = Math.floor(t * 4) % 2, f = hi ? 960 : 700;
    s.ph += f * s.dt;
    const sq = Math.sign(Math.sin(TAU * s.ph)) * 0.5 + Math.sin(TAU * s.ph) * 0.5;
    return soft(sq * (0.45 + 0.55 * Math.min(1, t / 0.3)) * 1.2) * Math.min(1, (1 - t) / 0.03);
  }),
  sw_scr_pop: (sr) => render(sr, 0.3, 2105, (t, s) => {
    const n = s.rnd(), hp = n - lp(s, 'hp', n, 0.3);
    return soft(Math.sin(TAU * (900 - 700 * t) * t) * Math.exp(-t * 16) * 1.4 + hp * Math.exp(-t * 30) * 0.7);
  }),
  sw_nest_hum: (sr) => render(sr, 2, 2106, (t, s) => {
    const am = 0.7 + 0.3 * Math.sin(TAU * 1 * t);
    return (Math.sin(TAU * 90 * t) * 0.5 + Math.sin(TAU * 135 * t) * 0.28 * am + Math.sin(TAU * 1200 * t) * 0.03 * (0.5 + 0.5 * Math.sin(TAU * 3 * t)) + lp(s, 'lp', s.rnd(), 0.04) * 0.2);
  }, { loop: true }),
  sw_live_jingle: (sr) => render(sr, 1.6, 2107, (t, s) => {
    let v = 0;
    for (const [t0, f] of [[0, 523], [0.18, 659], [0.36, 784], [0.54, 1047], [0.9, 1047]]) { const u = t - t0; if (u > 0) v += Math.exp(-u * (t0 > 0.8 ? 3 : 7)) * (Math.sin(TAU * f * u) + 0.35 * Math.sin(TAU * f * 2 * u)) * (t0 > 0.8 ? 1.2 : 0.8); }
    v += tick(t, 0.72, 2400, 220) * 0.6 + tick(t, 0.75, 900, 160) * 0.5;      // a camera shutter
    const crowd = lp(s, 'lp', s.rnd(), 0.18) * Math.max(0, Math.sin(Math.PI * clamp01((t - 0.7) / 0.9))) * 0.7;   // the audience swells: LIVE!
    return v + crowd;
  }),
  sw_live_ping: (sr) => render(sr, 0.7, 2115, (t, s) => {
    let v = 0; for (const [t0, f] of [[0, 1568], [0.09, 2093]]) { const u = t - t0; if (u > 0) v += Math.exp(-u * 8) * (Math.sin(TAU * f * u) + 0.3 * Math.sin(TAU * f * 2.7 * u)); }
    return v * 0.8 + lp(s, 'lp', s.rnd(), 0.1) * Math.sin(Math.PI * clamp01(t / 0.7)) * 0.3;
  }),
  sw_live_hum: (sr) => render(sr, 1, 2108, (t, s) => {
    const murmur = lp(s, 'lp', s.rnd(), 0.07) * (0.6 + 0.4 * Math.sin(TAU * 3 * t)) * 0.9;
    return Math.sin(TAU * 120 * t) * 0.3 + Math.sin(TAU * 240 * t) * 0.12 + murmur;
  }, { loop: true }),
  sw_ring_break: (sr) => render(sr, 0.8, 2109, (t, s) => {
    const n = s.rnd(), hp = n - lp(s, 'hp', n, 0.25);
    let glass = 0; for (const [t0, f] of [[0, 3600], [0.05, 4700], [0.11, 3100], [0.2, 5200], [0.3, 4300]]) glass += 0.3 * tick(t, t0, f, 42);
    const zap = Math.sin(TAU * (2200 * Math.exp(-t * 5)) * t) * Math.exp(-t * 6) * 0.7;
    return soft(hp * Math.exp(-t * 14) * 0.8 + glass + zap);
  }),
  sw_mod_lock: (sr) => render(sr, 0.26, 2110, (t) => tick(t, 0, 1200, 30) + tick(t, 0.12, 1700, 30)),
  sw_mod_flag: (sr) => render(sr, 1.3, 2111, (t, s) => {
    const u = t / 1.3, rate = 4 + 9 * u, hi = Math.floor(t * rate) % 2, f = hi ? 880 : 660;
    s.ph += f * s.dt;
    return soft((Math.sin(TAU * s.ph) + 0.5 * Math.sin(TAU * s.ph * 2)) * (0.35 + 0.65 * u) * 1.3);
  }),
  sw_mod_delete: (sr) => render(sr, 0.6, 2112, (t, s) => {
    const n = s.rnd(), hp = n - lp(s, 'hp', n, 0.2);
    const zap = Math.sin(TAU * (3000 * Math.exp(-t * 9) + 80) * t) * Math.exp(-t * 8);
    return soft(hp * Math.exp(-t * 6) * 0.9 + zap * 0.8 + Math.sin(TAU * (50 + 40 * Math.exp(-t * 10)) * t) * Math.exp(-t * 7) * 1.1);
  }),
  sw_mod_hum: (sr) => render(sr, 1, 2113, (t, s) => {
    const sq = tick(t, 0.5, 2100, 40) * 0.35 + tick(t, 0.0, 1900, 45) * 0.3;
    return Math.sin(TAU * 70 * t) * 0.35 + Math.sin(TAU * 140 * t) * 0.15 * (0.5 + 0.5 * Math.sin(TAU * 2 * t)) + sq + lp(s, 'lp', s.rnd(), 0.05) * 0.12;
  }, { loop: true }),
  sw_mod_sweep: (sr) => render(sr, 1.2, 2114, (t, s) => {
    const sweep = Math.abs(Math.sin(TAU * t / 1.2 * 1)), n = lp(s, 'lp', s.rnd(), 0.08 + 0.3 * sweep);
    return n * (0.3 + 0.7 * sweep) * 1.5 + tick(t, 0.3, 2400, 60) * 0.15 + tick(t, 0.9, 2600, 60) * 0.15;
  }, { loop: true }),
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const SOUND_IDS = Object.keys(SOUNDS);

/** registers the recipes with the mod API (lazily rendered by mods.ensureSound) and renders them into audio.buffers once an AudioContext exists */
export function ensureSw11Sounds(game) {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  const soundGens = game?.mods?.soundGens || mm?.soundGens;
  if (soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!soundGens.has(n)) soundGens.set(n, fn);
  const audio = game?.audio;
  if (!audio?.ctx || !audio.buffers) return false;
  for (const [n, gen] of Object.entries(SOUNDS)) {
    if (audio.buffers.has(n)) continue;
    try {
      const data = gen(audio.ctx.sampleRate), buf = audio.ctx.createBuffer(1, data.length, audio.ctx.sampleRate);
      buf.copyToChannel(data, 0); audio.buffers.set(n, buf);
    } catch (e) { console.warn('sw11 sound', n, e); audio.buffers.set(n, null); }
  }
  return true;
}
