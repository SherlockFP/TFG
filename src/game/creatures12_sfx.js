// CREATURES12 wave 12 - procedural sounds (recipes: sr -> Float32Array; same shape as creatures11_sfx / KefalAPI.registerSound). Loops use whole-Hz partials.
//   c12_404_hiss     404 seeking: a thin analog-TV hiss with a slow carrier wobble (loop; it is the only sound the invisible thing makes)
//   c12_404_burst    the static burst wind-up: noise + a rising carrier for 1.0 s, ending on a clipped spike
//   c12_404_hit      the hit: a broken-file thud
//   c12_404_gone     it lets go: a short falling fizz
//   c12_404_die      it is deleted: a glitching descending buzz
//   c12_cookie_tick  the cookie primes: three tiny ticks (0.8 s)
//   c12_cookie_latch it lands on a back: a soft crumb
//   c12_cookie_crumb it is pulled off / dies: a dry crumble
//   c12_cookie_ribbon TRACKING ENABLED chirp (the victim's ribbon appears)
//   c12_echo_hum     chamber listening: a wet low throb (loop)
//   c12_echo_wail    chamber replaying: a wavering hollow drone (loop)
//   c12_echo_play    replay begins: a rising organic groan
//   c12_echo_done    replay over: a soft exhale
//   c12_echo_die     chamber destroyed: a collapsing bubble
//   c12_echo_voice   a replayed "voice": formant babble with no words
//   c12_lag_hum      lag spike drifting: a quantised, stair-stepping tone (loop)
//   c12_lag_zone     zone active: a stuttering tone that keeps repeating its last 60 ms (loop)
//   c12_lag_stutter  the telegraph: frame-stutter, the same 90 ms grain repeated with growing gaps (1.5 s)
//   c12_lag_on       the zone snaps on
//   c12_lag_off      the zone drops
//   c12_lag_die      the cube is destroyed
//   c12_lag_snap     the rubber-band tug: a short reverse blip
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
const hp = (st, key, x, a) => x - lp(st, key, x, a);

export const SOUNDS = {
  c12_404_hiss: (sr) => render(sr, 2, 1301, (t, s) => {
    const n = hp(s, 'h', s.rnd(), 0.25);
    return n * (0.45 + 0.25 * Math.sin(TAU * 1 * t)) + 0.16 * Math.sin(TAU * 3200 * t) * (0.5 + 0.5 * Math.sin(TAU * 2 * t)) + 0.1 * Math.sin(TAU * 120 * t);
  }, { loop: true }),
  c12_404_burst: (sr) => render(sr, 1.0, 1302, (t, s) => {
    const u = t / 1.0; s.ph += (200 + 2400 * u * u * u) * s.dt;
    const n = hp(s, 'h', s.rnd(), 0.15) * (0.25 + 0.75 * u);
    const spike = t > 0.93 ? Math.sign(Math.sin(TAU * 900 * t)) * 0.9 : 0;
    return soft((n * 1.4 + Math.sin(TAU * s.ph) * 0.45 * u + spike) * (0.5 + 0.5 * u));
  }),
  c12_404_hit: (sr) => render(sr, 0.6, 1303, (t, s) => soft(Math.sin(TAU * (48 + 100 * Math.exp(-t * 16)) * t) * Math.exp(-t * 6) * 1.5 + hp(s, 'h', s.rnd(), 0.3) * Math.exp(-t * 14) * 1.1 + tick(t, 0, 3100, 38) * 0.4)),
  c12_404_gone: (sr) => render(sr, 0.5, 1304, (t, s) => { s.ph += (1800 - 1500 * t) * s.dt; return soft(Math.sin(TAU * s.ph) * 0.4 + hp(s, 'h', s.rnd(), 0.2) * 0.6) * Math.exp(-t * 6) * (Math.sin(TAU * 26 * t) > -0.2 ? 1 : 0.2); }),
  c12_404_die: (sr) => render(sr, 1.0, 1305, (t, s) => { s.ph += (700 * Math.exp(-t * 3.2) + 40) * s.dt; const g = Math.sin(TAU * 14 * t) > 0 ? 1 : 0.2; return soft(((s.ph % 1) * 2 - 1) * 0.7 + s.rnd() * 0.3) * g * Math.exp(-t * 2.2); }),
  c12_cookie_tick: (sr) => render(sr, 0.8, 1306, (t) => tick(t, 0.05, 2600, 60) * 0.7 + tick(t, 0.3, 2900, 60) * 0.8 + tick(t, 0.55, 3200, 60)),
  c12_cookie_latch: (sr) => render(sr, 0.3, 1307, (t, s) => soft(hp(s, 'h', s.rnd(), 0.2) * Math.exp(-t * 34) * 0.9 + Math.sin(TAU * 160 * t) * Math.exp(-t * 26) * 0.6)),
  c12_cookie_crumb: (sr) => render(sr, 0.5, 1308, (t, s) => { let v = 0; for (let k = 0; k < 6; k++) v += tick(t, 0.02 + k * 0.05, 1200 + k * 310, 45) * (0.9 - k * 0.1); return soft(v * 1.1 + hp(s, 'h', s.rnd(), 0.3) * Math.exp(-t * 20) * 0.4); }),
  c12_cookie_ribbon: (sr) => render(sr, 0.5, 1309, (t) => note(t, 0, 880, 9) + note(t, 0.12, 660, 9) + note(t, 0.24, 990, 7) * 0.8),
  c12_echo_hum: (sr) => render(sr, 2, 1310, (t, s) => 0.6 * Math.sin(TAU * 42 * t) * (0.7 + 0.3 * Math.sin(TAU * 2 * t)) + 0.3 * Math.sin(TAU * 84 * t + 0.6 * Math.sin(TAU * 1 * t)) + lp(s, 'l', s.rnd(), 0.05) * 0.25, { loop: true }),
  c12_echo_wail: (sr) => render(sr, 2, 1311, (t) => 0.5 * Math.sin(TAU * (110 * t + 6 * Math.sin(TAU * 3 * t))) + 0.4 * Math.sin(TAU * (221 * t + 9 * Math.sin(TAU * 2 * t))) + 0.2 * Math.sin(TAU * 331 * t), { loop: true }),
  c12_echo_play: (sr) => render(sr, 1.2, 1312, (t, s) => { const u = t / 1.2; s.ph += (70 + 180 * u * u) * s.dt; return soft(Math.sin(TAU * s.ph) * 0.9 + Math.sin(TAU * s.ph * 2.01) * 0.4 + lp(s, 'l', s.rnd(), 0.2) * 0.3) * (0.3 + 0.7 * u) * Math.exp(-Math.max(0, t - 0.9) * 8); }),
  c12_echo_done: (sr) => render(sr, 0.8, 1313, (t, s) => { s.ph += (160 - 90 * t) * s.dt; return (Math.sin(TAU * s.ph) * 0.6 + lp(s, 'l', s.rnd(), 0.1) * 0.5) * Math.exp(-t * 4); }),
  c12_echo_die: (sr) => render(sr, 1.0, 1314, (t, s) => { s.ph += (260 * Math.exp(-t * 3) + 30) * s.dt; let v = 0; for (let k = 0; k < 5; k++) v += tick(t, 0.08 + k * 0.11, 380 - k * 40, 22) * 0.6; return soft(Math.sin(TAU * s.ph) * 0.8 * Math.exp(-t * 2.5) + v + lp(s, 'l', s.rnd(), 0.12) * 0.3 * Math.exp(-t * 3)); }),
  c12_echo_voice: (sr) => render(sr, 0.9, 1315, (t, s) => {
    const f0 = 118 + 30 * Math.sin(TAU * 2.3 * t), f = [[730, 1090], [520, 1400], [300, 2200]][Math.floor(t * 4.2) % 3];
    s.ph += f0 * s.dt;
    const src = ((s.ph % 1) * 2 - 1) * 0.6 + s.rnd() * 0.08;
    return soft((lp(s, 'a', src, 0.12) * 1.6 + Math.sin(TAU * f[0] * t) * 0.1 + Math.sin(TAU * f[1] * t) * 0.05)) * (0.5 + 0.5 * Math.abs(Math.sin(TAU * 4.2 * t / 2))) * Math.min(1, t / 0.05, (0.9 - t) / 0.12);
  }),
  c12_lag_hum: (sr) => render(sr, 2, 1316, (t) => 0.5 * Math.sin(TAU * (220 + 40 * Math.floor(((t * 6) % 6))) * t) * (Math.sin(TAU * 6 * t) > -0.6 ? 1 : 0.1) + 0.2 * Math.sin(TAU * 55 * t), { loop: true }),
  c12_lag_zone: (sr) => render(sr, 2, 1317, (t, s) => {
    const gt = (t * 15) % 1, held = Math.floor(t * 15);           // 15 Hz sample-and-hold: the tone keeps repeating its last grain
    const f = 300 + ((held * 137) % 500);
    return soft(Math.sin(TAU * f * gt / 15) * 3 + hp(s, 'h', s.rnd(), 0.4) * 0.2 * (held % 3 === 0 ? 1 : 0.2)) * 0.8;
  }, { loop: true }),
  c12_lag_stutter: (sr) => render(sr, 1.5, 1318, (t, s) => {
    const grain = 0.09, gap = 0.05 + 0.5 * (t / 1.5) * (t / 1.5), per = grain + gap, k = Math.floor(t / per), u = t - k * per;
    if (u > grain) return 0;
    const f = 520 + 40 * (k % 2);
    return soft(Math.sin(TAU * f * u) * 1.2 + hp(s, 'h', mkRnd(k + 7)(), 0.5) * 0.2) * Math.min(1, u / 0.004, (grain - u) / 0.01);
  }),
  c12_lag_on: (sr) => render(sr, 0.5, 1319, (t, s) => { s.ph += (1600 * Math.exp(-t * 8) + 120) * s.dt; return soft(Math.sin(TAU * s.ph) * 1.1 + hp(s, 'h', s.rnd(), 0.4) * 0.5 * Math.exp(-t * 12)) * Math.exp(-t * 4); }),
  c12_lag_off: (sr) => render(sr, 0.5, 1320, (t, s) => { s.ph += (150 + 900 * t) * s.dt; return Math.sin(TAU * s.ph) * Math.exp(-t * 7) * 0.9; }),
  c12_lag_die: (sr) => render(sr, 0.7, 1321, (t, s) => { const g = Math.sin(TAU * 22 * t) > 0 ? 1 : 0; s.ph += (900 - 800 * t) * s.dt; return soft(Math.sin(TAU * s.ph) * g * 1.2 + s.rnd() * 0.3 * g) * Math.exp(-t * 4); }),
  c12_lag_snap: (sr) => render(sr, 0.3, 1322, (t, s) => { s.ph += (200 + 2400 * t * t * 10) * s.dt; return soft(Math.sin(TAU * s.ph) * 1.2) * Math.exp(-t * 9) * Math.min(1, t / 0.01); }),
};
export const SOUND_IDS = Object.keys(SOUNDS);

/** registers the recipes with the mod API and renders them into audio.buffers once an AudioContext exists (poll until it does) */
export function ensureC12Sounds(game) {
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
    } catch (e) { console.warn('c12 sound', n, e); audio.buffers.set(n, null); }
  }
  return true;
}
