// CREATURES10 wave 10 - procedural sounds of Buffering / The Doomscroller / The Ratio (recipes: sr -> Float32Array, same shape as KefalAPI.registerSound).
// Loops use whole-Hz partials over a whole number of seconds so they wrap without a click.
//   c10_buf_spin      Buffering ring turning: a soft rotor whir with a tick per revolution-step (loop)
//   c10_buf_down      it freezes: a power-down whir falling away (start of the window)
//   c10_buf_up        0.8 s before it wakes: the whir climbing back (the "go / run" cue)
//   c10_buf_wind      wind-up of its touch: a harsh climbing buzzer
//   c10_scroll_tick   Doomscroller thumb flick (pitch / rate ramp up with the dwell meter)
//   c10_notif         two-note notification ping = the drop is one second away
//   c10_scroll_crawl  dry skittering of phones on a ceiling (loop)
//   c10_scroll_drop   the chain hits the floor: thud + cracked glass
//   c10_ratio_creak   plastic joints creaking while a twin advances (loop)
//   c10_ratio_clack   a twin locks up the moment it is looked at
//   c10_ratio_wind    two out-of-tune tones rising: the hit is one second away
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
  c10_buf_spin: (sr) => render(sr, 1, 1101, (t, s) => {
    const am = 0.6 + 0.4 * Math.sin(TAU * 8 * t);
    let v = 0.5 * Math.sin(TAU * 110 * t) + 0.22 * Math.sin(TAU * 221 * t) * am + 0.08 * Math.sin(TAU * 442 * t);
    for (let k = 0; k < 10; k++) v += 0.32 * tick(t, k * 0.1, 2800, 420);   // 10 ticks a second: the ring's dots stepping round
    v += lp(s, 'lp', s.rnd(), 0.05) * 0.25;
    return v;
  }, { loop: true }),
  c10_buf_down: (sr) => render(sr, 0.9, 1102, (t, s) => {
    const f = 55 + 470 * Math.exp(-t * 4.2) + 6 * Math.sin(TAU * 7 * t);
    s.ph += f * s.dt;
    const env = Math.exp(-t * 2.4) * Math.min(1, t / 0.01);
    return soft((Math.sin(TAU * s.ph) + 0.4 * Math.sin(TAU * s.ph * 2) + 0.25 * Math.sin(TAU * s.ph * 3.01)) * env * 1.3) + tick(t, 0, 1900, 260) * 0.5;
  }),
  c10_buf_up: (sr) => render(sr, 0.8, 1103, (t, s) => {
    const u = t / 0.8, f = 80 + 620 * u * u;
    s.ph += f * s.dt;
    const env = (0.25 + 0.75 * u) * Math.min(1, (0.8 - t) / 0.02);
    return soft((Math.sin(TAU * s.ph) + 0.45 * Math.sin(TAU * s.ph * 2) + 0.2 * Math.sin(TAU * s.ph * 3)) * env * 1.3) + tick(t, 0.78, 3200, 300) * 0.45;
  }),
  c10_buf_wind: (sr) => render(sr, 0.9, 1104, (t, s) => {
    const u = t / 0.9, f = 200 + 720 * u ** 1.5;
    s.ph += f * s.dt;
    const saw = (s.ph % 1) * 2 - 1, trem = 0.65 + 0.35 * Math.sin(TAU * 15 * t);
    return soft((saw * 0.8 + Math.sin(TAU * s.ph * 1.5) * 0.4 + lp(s, 'lp', s.rnd(), 0.4) * 0.25) * trem * (0.25 + 0.75 * u) * 1.5);
  }),
  c10_scroll_tick: (sr) => render(sr, 0.09, 1105, (t, s) => {
    const n = s.rnd(), hp = n - lp(s, 'hp', n, 0.25);
    return hp * Math.exp(-t * 170) * 0.9 + Math.sin(TAU * 1750 * t) * Math.exp(-t * 90) * 0.55;
  }),
  c10_notif: (sr) => render(sr, 0.75, 1106, (t) => {
    let v = 0;
    for (const [t0, f] of [[0, 988], [0.16, 1319]]) { const u = t - t0; if (u > 0) v += Math.exp(-u * 7) * (Math.sin(TAU * f * u) + 0.4 * Math.sin(TAU * f * 2.76 * u) * Math.exp(-u * 9) + 0.15 * Math.sin(TAU * f * 5.4 * u) * Math.exp(-u * 14)); }
    return v;
  }),
  c10_scroll_crawl: (sr) => render(sr, 1, 1107, (t, s) => {
    let v = 0.05 * Math.sin(TAU * 50 * t);
    const T0 = [0.03, 0.11, 0.19, 0.31, 0.38, 0.46, 0.57, 0.66, 0.74, 0.83, 0.92];
    for (let k = 0; k < T0.length; k++) v += 0.5 * tick(t, T0[k], 900 + (k * 173) % 900, 260) * (k % 3 === 0 ? 1 : 0.6);
    return v + lp(s, 'lp', s.rnd(), 0.5) * Math.max(0, Math.sin(TAU * 11 * t)) * 0.06;
  }, { loop: true }),
  c10_scroll_drop: (sr) => render(sr, 0.8, 1108, (t, s) => {
    const thud = Math.sin(TAU * (35 + 60 * Math.exp(-t * 14)) * t) * Math.exp(-t * 7);
    const n = s.rnd(), crash = (n - lp(s, 'hp', n, 0.2)) * Math.exp(-t * 9) * 0.8;
    let glass = 0; for (const [t0, f] of [[0.04, 3900], [0.09, 4700], [0.17, 3300], [0.26, 5200], [0.4, 4100]]) glass += 0.25 * tick(t, t0, f, 60);
    return soft((thud * 1.2 + crash + glass) * 1.2);
  }),
  c10_ratio_creak: (sr) => render(sr, 1, 1109, (t, s) => {
    const ph = 520 * t - (200 / TAU) * Math.cos(TAU * t);
    const env = (0.5 + 0.5 * Math.sin(TAU * 3 * t)) ** 2;
    return (Math.sin(TAU * ph) * 0.55 + Math.sin(TAU * ph * 2) * 0.3 + lp(s, 'lp', s.rnd(), 0.3) * 0.25) * env;
  }, { loop: true }),
  c10_ratio_clack: (sr) => render(sr, 0.14, 1110, (t, s) => tick(t, 0, 620, 90) * 0.8 + tick(t, 0, 1850, 140) * 0.6 + s.rnd() * Math.exp(-t * 300) * 0.5),
  c10_ratio_wind: (sr) => render(sr, 0.9, 1111, (t, s) => {
    const u = t / 0.9;
    s.ph += (300 + 260 * u) * s.dt; s.ph2 += (424 + 380 * u) * s.dt;   // a tritone apart, both climbing
    return soft((Math.sin(TAU * s.ph) + Math.sin(TAU * s.ph2)) * (0.65 + 0.35 * Math.sin(TAU * 9 * t)) * (0.2 + 0.8 * u) * 0.9);
  }),
};
export const SOUND_IDS = Object.keys(SOUNDS);

/** registers the recipes with the mod API (lazily rendered by mods.ensureSound) and renders them into audio.buffers once an AudioContext exists */
export function ensureC10Sounds(game) {
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
    } catch (e) { console.warn('c10 sound', n, e); audio.buffers.set(n, null); }
  }
  return true;
}
