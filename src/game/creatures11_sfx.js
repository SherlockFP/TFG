// CREATURES11 wave 11 - procedural sounds (recipes: sr -> Float32Array; same shape as creatures10_sfx / KefalAPI.registerSound). Loops use whole-Hz partials.
//   c11_cap_hum     CAPTCHA idle: a mains hum + a slow "are you there" blip (loop)
//   c11_cap_scan    it starts scanning you: a rising sweep (0.9 s)
//   c11_cap_ask     the test starts: three ascending verify notes
//   c11_cap_pass    verified: a bright two-note chime
//   c11_cap_alarm   ROBOT DETECTED: a two-tone siren wail (1.0 s wind-up)
//   c11_cap_burst   the stun burst: static crunch + low thump
//   c11_sb_hum      Shadowban lurking: airy whisper of filtered noise (loop)
//   c11_sb_mark     the ban lands: a gavel knock + a descending glitch
//   c11_sb_lift     the ban is lifted: an upward two-note release
//   c11_sb_wind     its hammer goes up: a rising creak (1.0 s)
//   c11_sb_hit      the hammer hits
//   c11_rec_glow    RECOMMENDED FOR YOU: a soft shimmer swelling for 2 s
//   c11_rec_ding    it is here: one notification ding
//   c11_rec_wind    wind-up: three dings speeding up (0.9 s)
//   c11_rec_gone    dismissed: a glitchy fizz
const TAU = Math.PI * 2;
const mkRnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; }; };
function render(sr, dur, seed, fn, { loop = false, peak = 0.85 } = {}) {
  const n = Math.max(1, Math.floor(dur * sr)), out = new Float32Array(n);
  const st = { ph: 0, ph2: 0, dt: 1 / sr, rnd: mkRnd(seed) };
  let mx = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, st); out[i] = v; if (Math.abs(v) > mx) mx = Math.abs(v); }
  const g = peak / mx, fade = loop ? 0 : Math.max(1, Math.floor(sr * 0.005));
  for (let i = 0; i < n; i++) out[i] *= g * (fade ? Math.min(1, i / fade, (n - 1 - i) / fade) : 1);
  return out;
}
const soft = Math.tanh;
const lp = (st, key, x, a) => (st[key] = (st[key] || 0) + (x - (st[key] || 0)) * a);
const tick = (t, t0, f, k) => { const u = t - t0; return u > 0 ? Math.exp(-u * k) * Math.sin(TAU * f * u) : 0; };
const note = (t, t0, f, k = 6) => { const u = t - t0; return u > 0 ? Math.exp(-u * k) * (Math.sin(TAU * f * u) + 0.35 * Math.sin(TAU * f * 2.76 * u) * Math.exp(-u * 9)) : 0; };

export const SOUNDS = {
  c11_cap_hum: (sr) => render(sr, 2, 1201, (t, s) => {
    let v = 0.4 * Math.sin(TAU * 60 * t) + 0.22 * Math.sin(TAU * 120 * t) + 0.1 * Math.sin(TAU * 180 * t);
    v += 0.35 * tick(t, 0.5, 1800, 40) + 0.35 * tick(t, 1.5, 1500, 40);
    return v + lp(s, 'l', s.rnd(), 0.05) * 0.1;
  }, { loop: true }),
  c11_cap_scan: (sr) => render(sr, 0.9, 1202, (t, s) => {
    const u = t / 0.9; s.ph += (280 + 1500 * u * u) * s.dt;
    return soft(Math.sin(TAU * s.ph) * (0.3 + 0.7 * u) * 1.2 + Math.sin(TAU * s.ph * 1.5) * 0.2) * (0.6 + 0.4 * Math.sin(TAU * 18 * t));
  }),
  c11_cap_ask: (sr) => render(sr, 0.7, 1203, (t) => note(t, 0, 660, 8) + note(t, 0.14, 880, 8) + note(t, 0.28, 1320, 6)),
  c11_cap_pass: (sr) => render(sr, 0.7, 1204, (t) => note(t, 0, 988, 6) + note(t, 0.13, 1568, 5)),
  c11_cap_alarm: (sr) => render(sr, 1.1, 1205, (t, s) => {
    const f = 620 + 260 * Math.sign(Math.sin(TAU * 3.2 * t)) * (0.6 + 0.4 * Math.sin(TAU * 1.6 * t));
    s.ph += f * s.dt;
    return soft((Math.sin(TAU * s.ph) + 0.5 * Math.sin(TAU * s.ph * 2) + 0.3 * ((s.ph % 1) * 2 - 1)) * 1.3) * Math.min(1, t / 0.03);
  }),
  c11_cap_burst: (sr) => render(sr, 0.7, 1206, (t, s) => {
    const n = s.rnd(), thump = Math.sin(TAU * (45 + 80 * Math.exp(-t * 20)) * t) * Math.exp(-t * 6);
    return soft(thump * 1.4 + n * Math.exp(-t * 10) * 0.9 + Math.sin(TAU * 2300 * t) * Math.exp(-t * 30) * 0.4);
  }),
  c11_sb_hum: (sr) => render(sr, 2, 1207, (t, s) => {
    const air = lp(s, 'a', lp(s, 'b', s.rnd(), 0.4), 0.15);
    return air * (0.6 + 0.4 * Math.sin(TAU * 1 * t)) * 1.2 + 0.18 * Math.sin(TAU * 73 * t) * (0.5 + 0.5 * Math.sin(TAU * 2 * t));
  }, { loop: true }),
  c11_sb_mark: (sr) => render(sr, 1, 1208, (t, s) => {
    const knock = tick(t, 0, 180, 22) * 1.2 + tick(t, 0, 620, 40) * 0.6 + tick(t, 0.22, 170, 24) * 1.1 + tick(t, 0.22, 600, 40) * 0.5;
    const u = Math.max(0, t - 0.4); s.ph += (900 * Math.exp(-u * 3) + 60) * s.dt;
    return soft(knock + (t > 0.4 ? Math.sin(TAU * s.ph) * Math.exp(-u * 3.5) * (Math.sin(TAU * 40 * t) > 0 ? 1 : 0.2) * 0.5 : 0));
  }),
  c11_sb_lift: (sr) => render(sr, 0.8, 1209, (t) => note(t, 0, 523, 5) + note(t, 0.12, 784, 5) + note(t, 0.26, 1046, 4)),
  c11_sb_wind: (sr) => render(sr, 1.0, 1210, (t, s) => {
    const u = t / 1.0; s.ph += (90 + 260 * u * u) * s.dt;
    return soft(((s.ph % 1) * 2 - 1) * 0.7 * (0.3 + 0.7 * u) + lp(s, 'l', s.rnd(), 0.3) * 0.35 * (Math.sin(TAU * 14 * t) > 0 ? 1 : 0.4));
  }),
  c11_sb_hit: (sr) => render(sr, 0.6, 1211, (t, s) => soft(Math.sin(TAU * (50 + 90 * Math.exp(-t * 18)) * t) * Math.exp(-t * 6) * 1.5 + s.rnd() * Math.exp(-t * 26) * 0.9 + tick(t, 0, 320, 30) * 0.6)),
  c11_rec_glow: (sr) => render(sr, 2, 1212, (t) => {
    const u = t / 2, sw = Math.sin(TAU * (400 + 500 * u) * t), sw2 = Math.sin(TAU * (600 + 750 * u) * t);
    return (sw * 0.5 + sw2 * 0.3) * u * u * (0.7 + 0.3 * Math.sin(TAU * 6 * t));
  }),
  c11_rec_ding: (sr) => render(sr, 0.8, 1213, (t) => note(t, 0, 1175, 7) * 0.9 + note(t, 0, 2349, 10) * 0.3),
  c11_rec_wind: (sr) => render(sr, 0.9, 1214, (t) => note(t, 0, 1175, 12) + note(t, 0.4, 1175, 12) * 1.05 + note(t, 0.67, 1175, 12) * 1.1 + note(t, 0.82, 1568, 14) * 1.2),
  c11_rec_gone: (sr) => render(sr, 0.6, 1215, (t, s) => {
    const g = Math.sin(TAU * 18 * t) > 0 ? 1 : 0.15, n = s.rnd();
    return soft((n * 0.6 + Math.sin(TAU * (1400 - 1000 * t) * t) * 0.5) * g * Math.exp(-t * 4));
  }),
};
export const SOUND_IDS = Object.keys(SOUNDS);

/** registers the recipes with the mod API and renders them into audio.buffers once an AudioContext exists (poll until it does) */
export function ensureC11Sounds(game) {
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
    } catch (e) { console.warn('c11 sound', n, e); audio.buffers.set(n, null); }
  }
  return true;
}
