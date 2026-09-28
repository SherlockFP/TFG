// Procedural sounds + small helpers shared by the wave-1 "fun" systems (football, tasks, echo).
// The main sound library (audio/sfxlib.js) is not ours, so these buffers are synthesised on first use and registered
// straight into the AudioManager buffer table (audio.play() resolves names through audio.getBuffer()).
import * as THREE from 'three';

const TAU = Math.PI * 2;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;

function makeBuf(ctx, dur, fn) {
  const sr = ctx.sampleRate, n = Math.max(1, Math.floor(dur * sr));
  const b = ctx.createBuffer(1, n, sr);
  fn(b.getChannelData(0), sr, n);
  // soft limiter so nothing clips
  const d = b.getChannelData(0);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0.95) for (let i = 0; i < n; i++) d[i] *= 0.95 / peak;
  return b;
}

const GEN = {
  fun_kick: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * (60 + 140 * Math.exp(-t * 20)) * t) * Math.exp(-t * 22) * 0.9 + noise() * Math.exp(-t * 110) * 0.4; } },
  fun_bounce: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * (55 + 70 * Math.exp(-t * 26)) * t) * Math.exp(-t * 30) * 0.8 + noise() * Math.exp(-t * 160) * 0.15; } },
  fun_knock: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr, t2 = t - 0.24; let s = Math.sin(TAU * 170 * t) * Math.exp(-t * 34) + noise() * Math.exp(-t * 150) * 0.55; if (t2 > 0) s += Math.sin(TAU * 150 * t2) * Math.exp(-t2 * 34) * 0.9 + noise() * Math.exp(-t2 * 150) * 0.5; d[i] = s * 0.8; } },
  fun_whistle: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const vib = 1 + 0.03 * Math.sin(TAU * 28 * t); const env = Math.min(1, t * 60) * Math.max(0, 1 - Math.max(0, t - 0.55) / 0.15) * (t < 0.7 ? 1 : 0); d[i] = (Math.sin(TAU * 2750 * vib * t) * 0.5 + Math.sin(TAU * 2750 * 2 * vib * t) * 0.12 + noise() * 0.06) * env * 0.6; } },
  fun_cheer: (d, sr, n) => {
    let lp1 = 0, lp2 = 0;
    const ph = Array.from({ length: 6 }, () => rnd() * TAU), fr = Array.from({ length: 6 }, () => 3 + rnd() * 6);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const w = noise();
      lp1 += (w - lp1) * 0.34; lp2 += (w - lp2) * 0.05;
      const band = lp1 - lp2;                               // roughly 400 Hz - 3 kHz "roar"
      let mod = 0; for (let k = 0; k < 6; k++) mod += 0.5 + 0.5 * Math.sin(TAU * fr[k] * t + ph[k]);
      mod = 0.55 + mod / 6 * 0.8;
      const env = Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.5) * 0.85);
      d[i] = band * mod * env * 2.6;
    }
  },
  fun_ok: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const a = Math.sin(TAU * 660 * t) * Math.exp(-t * 9) * (t < 0.12 ? 1 : 0.0); const t2 = t - 0.11; const b = t2 > 0 ? Math.sin(TAU * 880 * t2) * Math.exp(-t2 * 7) + Math.sin(TAU * 1320 * t2) * Math.exp(-t2 * 10) * 0.35 : 0; d[i] = (a + b) * 0.55; } },
  fun_bad: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const f = 240 - 90 * t / 0.4; d[i] = ((((t * f) % 1) * 2 - 1) * 0.35 + Math.sin(TAU * f * 0.5 * t) * 0.3) * Math.exp(-t * 5) * 0.8; } },
  fun_echo: (d, sr, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr, u = t / (n / sr); const f = 210 + 260 * u; const env = Math.sin(Math.PI * Math.min(1, u)) ** 1.5; lp += (noise() - lp) * 0.06; d[i] = (Math.sin(TAU * f * t + 2 * Math.sin(TAU * 5 * t)) * 0.35 + Math.sin(TAU * f * 1.5 * t) * 0.15 + lp * 1.4) * env * 0.7; } },
  fun_glitch: (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const g = Math.floor(t * 24) % 3; d[i] = (Math.sin(TAU * (300 + 220 * g) * t) * 0.35 + noise() * 0.25) * (Math.sin(TAU * 18 * t) > -0.2 ? 1 : 0.15) * Math.exp(-t * 4) * 0.8; } },
};
const DUR = { fun_kick: 0.35, fun_bounce: 0.25, fun_knock: 0.55, fun_whistle: 0.75, fun_cheer: 3.2, fun_ok: 0.6, fun_bad: 0.5, fun_echo: 1.1, fun_glitch: 0.7 };

/** make sure the named buffer exists (needs a running AudioContext); returns true when it can be played */
export function ensureFx(audio, name) {
  if (!audio?.ctx || !GEN[name]) return audio?.has?.(name) || false;
  if (audio.buffers.has(name) && audio.buffers.get(name)) return true;
  try { audio.buffers.set(name, makeBuf(audio.ctx, DUR[name], GEN[name])); return true; } catch (e) { console.warn('[funfx]', name, e); return false; }
}
/** play a fun sound: pos (Vector3) for 3D, otherwise UI/sfx bus */
export function fx(audio, name, { pos = null, volume = 0.8, pitch = 1, ref = 3, max = 50 } = {}) {
  if (!ensureFx(audio, name)) return null;
  return pos ? audio.play(name, { pos, volume, pitch, refDistance: ref, maxDistance: max, bus: 'sfx' }) : audio.play(name, { volume, pitch, bus: 'sfx' });
}

const _v = new THREE.Vector3();
/** world point -> screen pixels + camera-space x/y/z (behind = camera-space z > 0; x/y are then mirrored, clamp with cx/cy) */
export function toScreen(pos, camera, W, H, out = { x: 0, y: 0, behind: false, cx: 0, cy: 0, cz: 0 }) {
  _v.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  out.cx = _v.x; out.cy = _v.y; out.cz = _v.z; out.behind = _v.z > 0;
  _v.applyMatrix4(camera.projectionMatrix);
  out.x = (_v.x * 0.5 + 0.5) * W; out.y = (-_v.y * 0.5 + 0.5) * H;
  return out;
}
