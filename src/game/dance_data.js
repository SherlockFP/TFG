// DANCE DATA (wave 6, docs/wave6/dance.md): pure, Node-safe (no three.js). 21 new dances / emotes for the avatar2 rig as sparse per-channel
// keyframes (beats, easing per key), the sampler, sync-dance phase maths, wheel layout, favourites and search.
// Rendering lives in dance.js (poses -> avatar), the wheel in ui/emotewheel.js. Everything here is unit-tested (tools/harness/dance.test.mjs).

// ---------------------------------------------------------------------------------------------- channels
// root: y x z (metres, x = avatar-left, z = forward), yaw / pt (body pitch about the feet, + = face down) / rl (roll)   (radians)
// torso + neck are ADDITIVE on top of the idle pose; arms + legs are ABSOLUTE (blended in from whatever the rig did this frame).
// Arms: L/R shoulder x y z + elbow (Le); shoulder z: left +out/up, right -out/up; x - = forward/up; elbow - = bent.  Legs: hip x (- = forward),
// knee (+ = bent), splay (z).
export const CH = {
  y: 0, x: 0, z: 0, yaw: 0, pt: 0, rl: 0,
  tx: 0, ty: 0, tz: 0, nx: 0, ny: 0, nz: 0,
  Lx: 0, Ly: 0, Lz: 0.14, Le: -0.25, Rx: 0, Ry: 0, Rz: -0.14, Re: -0.25,
  Hl: 0, Hr: 0, Kl: 0, Kr: 0, Sl: 0.04, Sr: -0.04,
};
export const CHANNELS = Object.keys(CH);
const ARM_CH = ['Lx', 'Ly', 'Lz', 'Le', 'Rx', 'Ry', 'Rz', 'Re'];
const LEG_CH = ['Hl', 'Hr', 'Kl', 'Kr', 'Sl', 'Sr'];
// mirror: swap the sides, flip lateral channels
const MIRROR = { Lx: ['Rx', 1], Ly: ['Ry', -1], Lz: ['Rz', -1], Le: ['Re', 1], Rx: ['Lx', 1], Ry: ['Ly', -1], Rz: ['Lz', -1], Re: ['Le', 1], Hl: ['Hr', 1], Hr: ['Hl', 1], Kl: ['Kr', 1], Kr: ['Kl', 1], Sl: ['Sr', -1], Sr: ['Sl', -1], x: ['x', -1], yaw: ['yaw', -1], rl: ['rl', -1], ty: ['ty', -1], tz: ['tz', -1], ny: ['ny', -1], nz: ['nz', -1] };
export const mirrorChannel = (c) => (MIRROR[c] ? MIRROR[c][0] : c);

// ---------------------------------------------------------------------------------------------- easing
export const EASE = {
  s: (u) => u * u * (3 - 2 * u),                                   // smoothstep (default)
  l: (u) => u,                                                     // linear
  h: () => 0,                                                      // hold (step at the next key)
  q: (u) => 1 - (1 - u) ** 3,                                      // quick out (robotic snap)
  i: (u) => u * u * u,                                             // accelerate (falls)
  o: (u) => { const c = 1.70158, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; },   // overshoot
  b: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2), // cubic in-out
};
const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);
export const hash = (n) => fract(Math.sin(n * 127.1) * 43758.5453);
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const sin = Math.sin, cos = Math.cos, PI = Math.PI;

// ---------------------------------------------------------------------------------------------- the dances
// bpm + beats = one cycle; keys = [{ b (beat), e (ease into the NEXT key), ...channels }] (sparse: a channel holds until its next key);
// half:true -> the keys cover the first half of the cycle, the second half is their mirror image (both sides must be written in each key).
// proc(b, t) adds procedural channels on top (run cycles, circles, glitch jitter). loop = repeats until you move; else one-shot of `dur` s.
// music = a loop id for audio/sfxlib.js ('dance_*', 8 beats at the same bpm). cat: dance | social | taunt | signal.  src: free | shop | crate.
const RUN = (b, k = 0.9) => { const s = sin(PI * b); return { Hl: -s * k, Hr: s * k, Kl: 0.9 * Math.max(0, -cos(PI * b)) + 0.2, Kr: 0.9 * Math.max(0, cos(PI * b)) + 0.2, Lx: s * 0.9, Rx: -s * 0.9 }; };
const D = (id, en, tr, ru, o) => ({ id, en, tr, ru, loop: true, face: 'happy', src: 'free', ...o });
export const DANCE_LIST = [
  D('office_shuffle', 'Office Shuffle', 'Ofis Sürtmesi', 'Офисный шаффл', {
    cat: 'dance', bpm: 112, beats: 4, half: true, music: 'dance_office', thumb: 0.1,
    keys: [
      { b: 0, x: -0.1, ty: 0.28, tz: 0.1, ny: -0.25, Lx: -0.85, Lz: 0.32, Le: -1.35, Rx: -0.55, Rz: -0.3, Re: -1.15, Hl: -0.3, Kl: 0.45, Hr: 0.12, Kr: 0.1, Sl: 0.1, Sr: -0.1 },
      { b: 1, y: 0.07, x: 0, ty: 0, tz: 0, ny: 0, Lx: -0.7, Lz: 0.28, Le: -1.2, Rx: -0.7, Rz: -0.28, Re: -1.2, Hl: -0.1, Kl: 0.2, Hr: -0.1, Kr: 0.2, Sl: 0.04, Sr: -0.04 },
    ] }),
  D('spreadsheet_robot', 'Spreadsheet Robot', 'Tablo Robotu', 'Робот из таблиц', {
    cat: 'dance', bpm: 128, beats: 8, half: true, e: 'q', face: 'normal', music: 'dance_robot', thumb: 0.5,
    keys: [
      { b: 0, Lz: 1.57, Le: 0, Lx: 0, Rx: -1.57, Rz: -0.14, Re: 0, ty: 0.5, ny: -0.5, y: -0.04, Hl: -0.35, Hr: 0.2, Kl: 0.4, Kr: 0, nx: 0 },
      { b: 1, Lz: 1.57, Le: -1.57, Lx: 0, Rx: -1.57, Re: -1.57, ty: 0.5, ny: -0.5, y: 0, Hl: 0.2, Hr: -0.35, Kl: 0, Kr: 0.4 },
      { b: 2, Lx: -1.4, Lz: 0.25, Le: -0.2, Rx: -1.4, Rz: -0.25, Re: -0.2, ty: 0, ny: 0, nx: 0.3, y: -0.04, Hl: -0.35, Hr: 0.2, Kl: 0.4, Kr: 0 },
      { b: 3, Lx: -1.25, Lz: 0.25, Le: -0.2, Rx: -1.5, Rz: -0.25, Re: -0.2, nx: 0.3, y: 0, Hl: 0.2, Hr: -0.35, Kl: 0, Kr: 0.4 },
    ] }),
  D('coffee_sway', 'Coffee-Break Sway', 'Kahve Molası Sallanışı', 'Кофе-брейк', {
    cat: 'dance', bpm: 84, beats: 8, e: 's', music: 'dance_sway', thumb: 5.6,
    keys: [
      { b: 0, x: -0.13, y: 0, tz: 0.1, ty: 0.1, ny: 0.15, nx: 0, Rx: -1.0, Rz: -0.25, Re: -1.6, Lx: 0.1, Lz: 0.35, Le: -1.0, Hl: -0.1, Kl: 0.1, Hr: 0, Kr: 0.05, Sl: 0.08, Sr: -0.08 },
      { b: 2, x: 0, y: 0.03, tz: 0, ty: 0, ny: 0, nx: 0.05, Rx: -1.0, Re: -1.6, Lx: 0.1, Le: -1.0 },
      { b: 4, x: 0.13, y: 0, tz: -0.1, ty: -0.1, ny: -0.15, Rx: -1.0, Re: -1.6, Hl: 0, Kl: 0.05, Hr: -0.1, Kr: 0.1 },
      { b: 5.4, x: 0.03, tz: -0.02, ny: 0, nx: 0.02, Rx: -1.05, Re: -1.65 },
      { b: 6.1, x: 0, tz: 0, nx: -0.28, tx: -0.05, Rx: -1.3, Re: -2.05, ny: 0.05 },
      { b: 7, nx: 0, tx: 0, Rx: -1.05, Re: -1.65, ny: 0.1, x: -0.06 },
    ] }),
  D('algo_glitch', 'Algorithm Glitch', 'Algoritma Arızası', 'Сбой Алгоритма', {
    cat: 'dance', bpm: 140, beats: 4, e: 'h', face: 'scared', music: 'dance_glitch', glitch: true, nosec: true, thumb: 1.7,
    keys: [
      { b: 0, Lz: 2.4, Lx: 0, Le: -0.2, Rz: -0.3, Rx: -0.6, Re: -0.5, tz: 0.25, tx: 0, ny: 0, Hl: -0.5, Kl: 0.8, Hr: 0.1, Kr: 0.1 },
      { b: 1, Lz: 0.3, Lx: -0.4, Le: -0.5, Rz: -2.4, Rx: 0, Re: -0.2, tz: -0.25, Hl: 0.1, Kl: 0.1, Hr: -0.5, Kr: 0.8 },
      { b: 2, Lz: 0.2, Lx: -1.5, Le: -0.1, Rz: -0.2, Rx: -1.5, Re: -0.1, tz: 0, tx: 0.3, ny: 0.8, Hl: -0.2, Hr: -0.2, Kl: 0.3, Kr: 0.3 },
      { b: 3, Lz: -0.6, Lx: -0.9, Le: -1.7, Rz: 0.6, Rx: -0.9, Re: -1.7, tx: -0.1, ny: -0.8, Hl: 0.2, Hr: 0.2, Kl: 0.6, Kr: 0.6 },
    ],
    proc: (b, t) => { const q = Math.floor(t * 12), g = hash(q * 0.37) > 0.55 ? 1 : 0.25; return { x: (hash(q) - 0.5) * 0.22 * g, z: (hash(q + 3) - 0.5) * 0.18 * g, yaw: (hash(q + 5) - 0.5) * 0.5 * g, flash: hash(q + 7) > 0.86 ? 0.7 : 0 }; } }),
  D('firewall', 'Firewall', 'Güvenlik Duvarı', 'Брандмауэр', {
    cat: 'dance', bpm: 120, beats: 4, half: true, music: 'dance_disco', thumb: 0,
    keys: [
      { b: 0, x: 0.14, tx: 0.2, tz: 0.12, ty: -0.15, nz: 0.1, Lx: -0.35, Lz: -0.55, Le: -0.15, Rx: -0.2, Rz: -1.05, Re: -0.15, Hl: -0.15, Kl: 0.3, Hr: 0.05, Kr: 0.5, y: -0.05 },
      { b: 1, x: 0, tx: 0.2, tz: 0, ty: 0, nz: 0, Lx: -0.35, Lz: 0.1, Le: -0.15, Rx: -0.35, Rz: -0.1, Re: -0.15, Hl: -0.1, Kl: 0.3, Hr: -0.1, Kr: 0.3, y: 0 },
    ] }),
  D('worm', 'The Worm', 'Solucan', 'Червяк', {
    cat: 'dance', bpm: 128, beats: 4, ph: 0.3, music: 'dance_robot', nosec: true, thumb: 1.0,
    keys: [
      { b: 0, pt: 1.5, tx: 0.5, y: 0, Lx: -0.6, Lz: 0.35, Le: -0.4, Rx: -0.6, Rz: -0.35, Re: -0.4, Hl: 0.3, Hr: 0.3, Kl: 0.2, Kr: 0.2, nx: -0.3 },
      { b: 1, pt: 1.5, tx: -0.1, y: 0.16, Kl: 0.9, Kr: 0.9, Hl: 0, Hr: 0, nx: 0.1 },
      { b: 2, pt: 1.5, tx: -0.55, y: 0, Kl: 0.3, Kr: 0.3, Hl: -0.2, Hr: -0.2, nx: 0.35 },
      { b: 3, pt: 1.5, tx: 0.1, y: 0.1, Kl: 0.7, Kr: 0.7, Hl: 0.1, Hr: 0.1, nx: 0 },
    ] }),
  D('cmoonwalk', 'Moonwalk Pro', 'Ay Yürüyüşü Pro', 'Мунуокер Про', {
    cat: 'dance', bpm: 112, beats: 8, music: 'dance_office', src: 'shop', tier: 'uncommon', price: 180, thumb: 1.3,
    keys: [
      { b: 0, z: 0.3, tx: -0.12, Rx: -0.2, Rz: -0.4, Re: -0.6, Lz: 0.5, Lx: 0.3, Le: -0.3, yaw: 0 },
      { b: 1, Rx: -2.3, Rz: -0.5, Re: -1.9 },
      { b: 2, Rx: -2.3, Re: -1.9, Rz: -0.5 },
      { b: 3, Rx: -0.2, Rz: -0.4, Re: -0.6 },
      { b: 4, z: -0.3, yaw: 0, Lz: 1.3, Rz: -1.3, Lx: -0.3, Rx: -0.3, Le: -0.3, Re: -0.3, e: 'b' },
      { b: 8, z: 0.3, yaw: TAU, Lz: 0.5, Rz: -0.4, Lx: 0.3, Rx: -0.2 },
    ],
    chE: { z: 'l' },
    proc: (b) => { const s = sin(PI * b); return { Hl: 0.28 * s, Hr: -0.28 * s, Kl: 0.6 * Math.max(0, -s), Kr: 0.6 * Math.max(0, s), y: 0.02 * Math.abs(s) }; } }),
  D('disco_point', 'Disco Point', 'Disko Işaret', 'Диско-указатель', {
    cat: 'dance', bpm: 120, beats: 4, half: true, music: 'dance_disco', thumb: 0,
    keys: [
      { b: 0, x: -0.12, tz: -0.14, tx: -0.05, ny: 0.3, nz: 0.15, Rz: -2.45, Rx: -0.15, Re: -0.1, Lz: 0.1, Lx: 0.4, Le: -1.0, Hl: -0.4, Kl: 0.5, Hr: 0.1, Kr: 0.2, y: -0.03 },
      { b: 1, x: -0.06, tz: -0.08, ny: 0.2, Rz: -2.2, Rx: -0.6, Re: -0.2, Lz: 0.15, Le: -1.1, Hl: -0.6, Kl: 0.8, Hr: 0.1, Kr: 0.3, y: -0.09 },
    ] }),
  D('chair_spin', 'Chair Spin', 'Sandalye Dönüşü', 'Кручусь на стуле', {
    cat: 'dance', bpm: 100, beats: 4, base: 'sit', music: 'dance_sway', chE: { yaw: 'l' }, thumb: 0.8,
    keys: [
      { b: 0, yaw: 0, Lz: 0.7, Rz: -0.7, Lx: -0.4, Rx: -0.4, Le: -0.3, Re: -0.3, tz: 0.05, nx: 0.1, y: 0.02 },
      { b: 1, yaw: PI / 2, tz: -0.05, Lz: 0.5, Rz: -0.9, y: 0.04 },
      { b: 2, yaw: PI, tz: 0.05, Lz: 0.9, Rz: -0.5, y: 0.02 },
      { b: 3, yaw: PI * 1.5, tz: -0.05, Lz: 0.6, Rz: -0.8, y: 0.04 },
      { b: 4, yaw: TAU, tz: 0.05, Lz: 0.7, Rz: -0.7, y: 0.02 },
    ] }),
  D('panic_dance', 'Panic Dance', 'Panik Dansı', 'Танец паники', {
    cat: 'dance', bpm: 150, beats: 2, half: true, face: 'scared', music: 'dance_glitch', thumb: 0,
    keys: [
      { b: 0, x: -0.06, y: 0.05, tz: 0.2, ny: -0.5, nz: 0.2, Lz: 2.5, Lx: -0.2, Le: -0.3, Rz: -0.6, Rx: -0.5, Re: -1.0, Hl: -1.0, Kl: 1.2, Hr: 0.1, Kr: 0.1 },
      { b: 0.5, x: 0, y: 0.12, tz: 0, ny: 0, Lz: 1.2, Lx: -0.2, Rz: -1.8, Rx: -0.2, Re: -0.4, Hl: -0.2, Kl: 0.3, Hr: -0.2, Kr: 0.3 },
    ],
    proc: (b, t) => ({ x: 0.012 * sin(t * 40) }) }),
  D('sync_dance', 'Sync Dance', 'Eşzamanlı Dans', 'Синхро-танец', {
    cat: 'dance', bpm: 120, beats: 8, syncR: 5, music: 'dance_robot', thumb: 2.4,
    keys: [
      { b: 0, x: 0, ty: 0, Lx: -1.2, Lz: 0.2, Le: -0.6, Rx: -1.2, Rz: -0.2, Re: -0.6, y: 0 },
      { b: 1, x: -0.2, ty: -0.25, Lx: -0.3, Lz: -0.5, Le: -0.2, Rx: 0, Rz: -1.4, Re: -0.1, y: 0.04 },
      { b: 2, x: -0.4, ty: -0.3, Rz: -1.5, y: 0 },
      { b: 3, x: -0.2, ty: 0, Lx: -1.2, Lz: 0.2, Le: -0.6, Rx: -1.2, Rz: -0.2, Re: -0.6, y: 0.04 },
      { b: 4, x: 0, ty: 0.25, Lx: 0, Lz: 1.4, Le: -0.1, Rx: -0.3, Rz: 0.5, Re: -0.2, y: 0 },
      { b: 5, x: 0.2, ty: 0.3, Lz: 1.5, y: 0.04 },
      { b: 6, x: 0.4, ty: 0, Lz: 2.5, Le: -0.1, Rz: -2.5, Re: -0.1, Lx: 0, Rx: 0, y: 0.22 },
      { b: 7, x: 0.2, Lz: 2.3, Rz: -2.3, y: 0 },
    ],
    proc: (b) => ({ y: 0.025 * Math.abs(sin(PI * b)) }) }),
  D('metal_night', 'Metal Night', 'Metal Gecesi', 'Метал-ночь', {
    cat: 'dance', bpm: 150, beats: 4, half: true, face: 'angry', nosec: true, music: 'dance_metal', thumb: 0,
    keys: [
      { b: 0, tx: 0.2, Rx: -1.2, Rz: -1.0, Re: -1.4, Lz: 0.5, Lx: 0.4, Le: -0.6, Sl: 0.3, Sr: -0.3, Kl: 0.6, Kr: 0.6, Hl: -0.3, Hr: -0.3, tz: 0.06 },
      { b: 2, tx: 0.2, Lx: -1.2, Lz: 1.0, Le: -1.4, Rz: -0.5, Rx: 0.4, Re: -0.6, Sl: 0.3, Sr: -0.3, Kl: 0.6, Kr: 0.6, Hl: -0.3, Hr: -0.3, tz: -0.06 },
    ],
    proc: (b) => { const c = cos(TAU * b); return { nx: 0.1 + 0.6 * c, tx: 0.08 * c, y: -0.05 + 0.06 * c }; } }),
  D('victory_lap', 'Victory Lap', 'Zafer Turu', 'Круг почёта', {
    cat: 'dance', bpm: 128, beats: 8, music: 'dance_office', src: 'shop', tier: 'rare', price: 320, nosec: true, thumb: 1.0,
    keys: [
      { b: 0, Rz: -2.5, Rx: -0.4, Re: -0.6, tx: 0.12 },
      { b: 1, Rz: -2.15, Rx: -0.2 },
      { b: 2, Rz: -2.5, Rx: -0.4 },
    ],
    proc: (b) => { const th = TAU * b / 8, r = 0.7, run = RUN(b, 0.9), s = sin(PI * b); return { x: r * (1 - cos(th)), z: r * sin(th), yaw: th, y: 0.08 * Math.abs(cos(PI * b)), Hl: run.Hl, Hr: run.Hr, Kl: run.Kl, Kr: run.Kr, Lx: run.Lx, Lz: 0.25, Le: -1.2 - 0.3 * s }; } }),
  // ---- one-shots
  D('quota_party', 'Quota Celebration', 'Kota Kutlaması', 'Праздник квоты', {
    cat: 'social', loop: false, dur: 4.6, bpm: 120, src: 'crate', tier: 'uncommon', music: 'dance_office', thumb: 1.2,
    keys: [
      { b: 0, y: 0, Lz: 0.14, Rz: -0.14, Le: -0.25, Re: -0.25, Kl: 0, Kr: 0, Hl: 0, Hr: 0 },
      { b: 0.5, y: -0.12, Lz: 0.2, Lx: 0.3, Le: -0.9, Rz: -0.2, Rx: 0.3, Re: -0.9, Kl: 0.8, Kr: 0.8, Hl: -0.5, Hr: -0.5 },
      { b: 1, y: 0.38, Lz: 2.6, Le: -0.1, Rz: -2.6, Re: -0.1, Lx: 0, Rx: 0, Kl: 0.5, Kr: 0.5, Hl: -0.3, Hr: -0.3 },
      { b: 1.6, y: 0, Lz: 2.2, Rz: -2.2, Kl: 0.3, Kr: 0.3 },
      { b: 2, y: 0.42, Lz: 2.2, Lx: -0.5, Le: -1.4, Rz: -2.2, Rx: -0.5, Re: -1.4, Kl: 0.5, Kr: 0.5 },
      { b: 2.7, y: 0, Kl: 0.3, Kr: 0.3 },
      { b: 3.5, Rz: -2.5, Rx: -0.2, Re: -0.4, Lz: 0.3, Lx: 0, Le: -0.4, y: 0.06, ny: 0.2 },
      { b: 4.5, Lz: 2.5, Le: -0.4, Rz: -0.3, Re: -0.4, y: 0.06, ny: -0.2 },
      { b: 5.5, Rz: -2.5, Re: -0.4, Lz: 0.3, y: 0.06, ny: 0.2 },
      { b: 6.5, Lz: 2.5, Le: -0.4, Rz: -0.3, y: 0.06, ny: -0.2 },
      { b: 7.3, Rx: -1.6, Rz: -0.14, Re: 0, Lz: 0.14, Le: -0.25, y: 0, ny: 0, nx: 0.1, Kl: 0, Kr: 0, Hl: 0, Hr: 0 },
    ] }),
  D('layoff_flop', 'Layoff Flop', 'İşten Çıkarma Çöküşü', 'Увольнение: падение', {
    cat: 'taunt', loop: false, dur: 5.0, bpm: 120, face: 'scared', ph: 0.25, nosec: true, thumb: 3.3,
    chE: { pt: 'i' },
    keys: [
      { b: 0, tx: 0, pt: 0, Rx: 0, Re: -0.25, Lz: 0.14, Rz: -0.14, y: 0 },
      { b: 0.6, tx: 0.2, Rx: -1.2, Re: -1.6, Rz: -0.2 },
      { b: 1.5, tx: -0.1, pt: 0, nz: 0.2 },
      { b: 2.4, pt: -1.57, tx: 0, Rx: -0.3, Re: -0.3, Rz: -1.3, Lz: 1.3, Lx: -0.3, nz: 0 },
      { b: 2.7, pt: -1.4, y: 0.05 },
      { b: 3.0, pt: -1.57, y: 0 },
      { b: 5, Rx: -0.3, Rz: -1.3 },
      { b: 6, Rx: -2.6, Re: -0.2, Rz: -0.4 },
      { b: 7, Rx: -2.4, Re: -0.4 },
      { b: 8, Rx: -0.3, Rz: -1.3, Re: -0.3 },
      { b: 9, pt: -1.57 },
    ] }),
  D('salary_bow', 'Salary Man Bow', 'Ofis Çalışanı Selamı', 'Поклон клерка', {
    cat: 'social', loop: false, dur: 3.6, bpm: 120, face: 'normal', nosec: true, thumb: 2.6,
    keys: [
      { b: 0, tx: 0, nx: 0, Lx: 0, Lz: 0.05, Le: -0.05, Rx: 0, Rz: -0.05, Re: -0.05 },
      { b: 1, tx: 0, Lz: 0.05 },
      { b: 2.5, tx: 1.35, nx: 0.3, Lx: 0.5, Lz: 0.1, Rx: 0.5, Rz: -0.1 },
      { b: 4.2, tx: 1.42, nx: 0.3 },
      { b: 5.4, tx: 0.05, nx: 0, Lx: 0, Rx: 0 },
      { b: 6.2, Rx: -0.9, Re: -1.5, Rz: -0.1, tx: -0.04 },
      { b: 7.2, Rx: 0, Re: -0.25, Rz: -0.14 },
    ] }),
  D('thumbs_up', 'Approved', 'Onaylandı', 'Одобрено', {
    cat: 'signal', loop: false, dur: 2.6, bpm: 120, thumb: 1.5,
    keys: [
      { b: 0, Rx: 0, Rz: -0.14, Re: -0.25, nx: 0, tx: 0 },
      { b: 1, Rx: -1.35, Rz: -0.25, Re: -1.1, tx: -0.03 },
      { b: 1.5, Re: -0.9, nx: 0.2 },
      { b: 2, Re: -1.1, nx: -0.05 },
      { b: 2.5, Re: -0.9, nx: 0.2 },
      { b: 3.2, Re: -1.1, nx: 0 },
      { b: 4.4, Rx: -1.35 },
    ] }),
  D('hold_position', 'Hold Position', 'Pozisyonu Koru', 'Держать позицию', {
    cat: 'signal', loop: false, dur: 3.2, bpm: 120, face: 'normal', thumb: 2.0,
    keys: [
      { b: 0, Rx: -0.2, Re: -0.25, Lz: 0.14, Lx: 0, Le: -0.25, tx: 0 },
      { b: 0.8, Rx: -1.55, Re: -0.05, Lz: 0.4, Lx: 0.1, Le: -1.2, tx: -0.05 },
      { b: 2, Rx: -1.72, tx: -0.08 },
      { b: 3, Rx: -1.55, tx: -0.05 },
      { b: 4, Rx: -1.72 },
      { b: 5, Rx: -1.55 },
      { b: 6.4, Rx: -1.55 },
    ] }),
  D('follow_me', 'Follow Me', 'Beni Takip Et', 'За мной', {
    cat: 'signal', loop: false, dur: 3.4, bpm: 120, thumb: 1.5,
    keys: [
      { b: 0, Rx: 0, Rz: -0.14, Re: -0.25, ty: 0, ny: 0 },
      { b: 0.6, Rx: -1.3, Rz: -0.7, Re: -0.2, ty: 0.3, ny: -0.4 },
      { b: 1.5, Rx: -2.3, Rz: -0.6 },
      { b: 2, Rx: -1.0 },
      { b: 2.5, Rx: -2.3 },
      { b: 3, Rx: -1.0 },
      { b: 3.5, Rx: -2.3 },
      { b: 4, Rx: -1.0 },
      { b: 5, Rx: -1.3 },
      { b: 6, Rx: -1.3 },
    ] }),
  D('need_help', 'Send Help', 'Yardım Gönderin', 'Нужна помощь', {
    cat: 'signal', loop: false, dur: 4.0, bpm: 120, face: 'scared', thumb: 1.0,
    keys: [
      { b: 0, Lz: 0.14, Rz: -0.14, Le: -0.25, Re: -0.25, Lx: 0, Rx: 0 },
      { b: 0.6, Lz: 2.7, Rz: -2.7, Le: -0.1, Re: -0.1 },
      { b: 7.2, Lz: 2.7, Rz: -2.7 },
      { b: 8, Lz: 0.14, Rz: -0.14 },
    ],
    proc: (b, t) => ({ Lz: 0.3 * sin(TAU * b * 2), Rz: -0.3 * sin(TAU * b * 2 + PI), y: 0.05 * Math.abs(sin(TAU * b)), nz: 0.1 * sin(TAU * b) }) }),
  D('rejected', 'Rejected', 'Reddedildi', 'Отказано', {
    cat: 'taunt', loop: false, dur: 2.8, bpm: 120, face: 'angry', thumb: 1.4,
    keys: [
      { b: 0, Rx: 0, Rz: -0.14, Re: -0.25, tz: 0, tx: 0 },
      { b: 0.8, Rx: -1.2, Rz: -0.3, Re: -1.1, tz: -0.06, tx: -0.08 },
      { b: 3, Rx: -1.2 },
      { b: 4.5, Rx: -1.2 },
      { b: 5.6, Rx: -1.2 },
    ],
    proc: (b) => ({ ny: b > 1 ? 0.35 * sin(TAU * b * 0.75) : 0 }) }),
];

export const DANCE_IDS = DANCE_LIST.map((d) => d.id);
export const DANCE_BY_ID = Object.fromEntries(DANCE_LIST.map((d) => [d.id, d]));
export const DANCE_TIERS = { uncommon: 'uncommon', rare: 'rare', epic: 'epic' };
// item ids / paid rows (pushed into cosm5's rotation by dance.js): { id, tier, src, price? }
Object.assign(DANCE_BY_ID.worm, { src: 'crate', tier: 'rare' });
Object.assign(DANCE_BY_ID.algo_glitch, { src: 'crate', tier: 'epic' });
Object.assign(DANCE_BY_ID.firewall, { src: 'shop', tier: 'uncommon', price: 200 });
Object.assign(DANCE_BY_ID.metal_night, { src: 'shop', tier: 'rare', price: 260 });
Object.assign(DANCE_BY_ID.spreadsheet_robot, { src: 'shop', tier: 'uncommon', price: 240 });

// ---------------------------------------------------------------------------------------------- keyframe compile + sampling
const mirrorKeys = (keys, off) => keys.map((k) => {
  const o = { b: k.b + off }; if (k.e) o.e = k.e;
  for (const [c, v] of Object.entries(k)) { if (c === 'b' || c === 'e') continue; const m = MIRROR[c]; if (m) o[m[0]] = v * m[1]; else o[c] = v; }
  return o;
});
/** { ch: [{ b, v, e }] } sorted per channel (half:true adds the mirrored second half). Cached on def._c. */
export function compile(def) {
  if (def._c) return def._c;
  let keys = def.keys;
  if (!def.beats) def.beats = Math.max(...keys.map((k) => k.b));
  if (def.half) keys = keys.concat(mirrorKeys(keys, def.beats / 2));
  const c = {};
  for (const k of keys) for (const [ch, v] of Object.entries(k)) { if (ch === 'b' || ch === 'e') continue; (c[ch] ||= []).push({ b: k.b, v, e: k.e || def.e || 's' }); }
  for (const ch of Object.keys(c)) c[ch].sort((p, q) => p.b - q.b);
  def._c = c;
  return c;
}
/** channel value at beat position p (loops wrap, one-shots hold their last key) */
export function curveAt(pts, p, loop, B, chE) {
  const n = pts.length;
  if (n === 1) return pts[0].v;
  let i = -1;
  for (let k = 0; k < n; k++) if (pts[k].b <= p) i = k; else break;
  let a, b2, ab, bb;
  if (i < 0) {                                  // before the first key: loop = wrap from the last, one-shot = hold
    if (!loop) return pts[0].v;
    a = pts[n - 1]; ab = a.b - B; b2 = pts[0]; bb = b2.b;
  } else if (i === n - 1) {
    if (!loop) return pts[i].v;
    a = pts[i]; ab = a.b; b2 = pts[0]; bb = b2.b + B;
  } else { a = pts[i]; ab = a.b; b2 = pts[i + 1]; bb = b2.b; }
  const span = bb - ab;
  if (span <= 1e-6) return b2.v;
  const u = (p - ab) / span;
  return a.v + (b2.v - a.v) * EASE[chE || a.e](Math.min(1, Math.max(0, u)));
}
/** beat position of time t (seconds) */
export const beatOf = (def, t) => (t * def.bpm) / 60;
export const cycleSeconds = (def) => (def.beats * 60) / def.bpm;
/** 0..1 phase of a looping dance at time t */
export const phaseAt = (def, t) => { const c = cycleSeconds(def); return ((t % c) + c) % c / c; };

const sampleRaw = (def, b) => {
  const c = compile(def), B = def.beats;
  const p = def.loop ? ((b % B) + B) % B : Math.min(b, B);
  const out = {};
  for (const ch of Object.keys(c)) out[ch] = curveAt(c[ch], p, def.loop, B, def.chE?.[ch]);
  return out;
};
const LAG = 0.2;   // beats of follow-through
/** Full pose at time t (seconds): keyframes + procedural + secondary motion (neck follows the torso, elbows trail the shoulders, head bob). */
export function samplePose(def, t) {
  const b = beatOf(def, t);
  const pose = sampleRaw(def, b);
  if (def.proc) { const e = def.proc(b, t); for (const [c, v] of Object.entries(e)) pose[c] = c === 'flash' ? v : (c in pose && (c in PROC_ABS) ? v : (pose[c] ?? CH[c] ?? 0) + v); }
  if (!def.nosec) {
    const lag = sampleRaw(def, b - LAG), g = (c, o) => o[c] ?? CH[c];
    pose.nx = (pose.nx || 0) + 0.5 * (g('tx', lag) - g('tx', pose)) + (def.loop ? 0.035 * sin(TAU * b * 2) : 0);
    pose.ny = (pose.ny || 0) + 0.4 * (g('ty', lag) - g('ty', pose));
    if ('Lx' in pose || 'Le' in pose) pose.Le = g('Le', pose) + Math.max(-0.5, Math.min(0.5, 0.45 * (g('Lx', pose) - g('Lx', lag))));
    if ('Rx' in pose || 'Re' in pose) pose.Re = g('Re', pose) + Math.max(-0.5, Math.min(0.5, 0.45 * (g('Rx', pose) - g('Rx', lag))));
  }
  return pose;
}
const PROC_ABS = { Hl: 1, Hr: 1, Kl: 1, Kr: 1, Lx: 1, Le: 1, Rx: 1, Re: 1 };   // procedural leg / arm channels replace the keyed value (run cycles)
/** channel groups a def touches (so untouched limbs keep their idle pose) */
export function groupsOf(def) {
  if (def._g) return def._g;
  const set = new Set(Object.keys(compile(def)));
  if (def.proc) for (const c of Object.keys(def.proc(0, 0))) set.add(c);
  const g = { arms: ARM_CH.some((c) => set.has(c)), legs: LEG_CH.some((c) => set.has(c)) || !!def.proc?.(0, 0)?.Hl, pt: set.has('pt'), all: set };
  def._g = g;
  return g;
}
/** blend weight of a dance at time t: 0->1 over the first 0.3 s, one-shots fade out in the last 0.35 s */
export function blendWeight(def, t, dur = def.dur) {
  const a = sm(t / 0.3);
  return def.loop ? a : Math.min(a, sm(((dur ?? 30) - t) / 0.35));
}

// ---------------------------------------------------------------------------------------------- sync dance (group phase)
export const SYNC_RADIUS = 3;
/**
 * dancers: [{ id, x, y, z, dance, start }] (start = ms timestamp when they began; only looping dances). Returns Map id -> { size, anchorId, anchorStart, offset }:
 * everybody in a cluster (same dance, within radius of a chain of others) plays the phase of the EARLIEST starter, offset = seconds ahead of their own clock.
 */
export function clusterDancers(dancers, radius = SYNC_RADIUS) {
  const n = dancers.length, par = dancers.map((_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = dancers[i], b = dancers[j];
    if (a.dance !== b.dance) continue;
    const r = Math.max(radius, DANCE_BY_ID[a.dance]?.syncR || 0);
    if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= r) par[find(i)] = find(j);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(dancers[i]); }
  const out = new Map();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    let anchor = g[0];
    for (const d of g) if (d.start < anchor.start || (d.start === anchor.start && String(d.id) < String(anchor.id))) anchor = d;
    for (const d of g) out.set(d.id, { size: g.length, anchorId: anchor.id, anchorStart: anchor.start, offset: (d.start - anchor.start) / 1000, dance: d.dance });
  }
  return out;
}
/** move `cur` toward `target` by at most rate*dt (catch up to the beat without a pop) */
export const approach = (cur, target, dt, rate = 1.2) => { const d = target - cur, m = rate * dt; return Math.abs(d) <= m ? target : cur + Math.sign(d) * m; };
/** phase error (0..0.5) between two dancers of the same dance at their own clocks + offsets */
export function phaseError(def, t1, o1, t2, o2) { const a = phaseAt(def, t1 + o1), b = phaseAt(def, t2 + o2); const d = Math.abs(a - b); return Math.min(d, 1 - d); }
/** combo size label / hype bonus */
export const comboHype = (size) => Math.min(5, Math.max(0, size - 1));

// ---------------------------------------------------------------------------------------------- categories, wheel layout, favourites, search
export const CATS = [
  { id: 'fav', en: 'Favourites', tr: 'Favoriler', ru: 'Избранное', glyph: 'star' },
  { id: 'dance', en: 'Dance', tr: 'Dans', ru: 'Танцы', glyph: 'bolt' },
  { id: 'social', en: 'Social', tr: 'Sosyal', ru: 'Общение', glyph: 'person' },
  { id: 'taunt', en: 'Taunt', tr: 'Alay', ru: 'Дразнилки', glyph: 'skull' },
  { id: 'signal', en: 'Signal', tr: 'Sinyal', ru: 'Сигналы', glyph: 'eye' },
];
export const CAT_IDS = CATS.map((c) => c.id);
/** category of the older emotes (wave 1-4); everything from DANCE_LIST carries its own */
export const LEGACY_CAT = {
  dance: 'dance', party: 'dance', spin: 'dance', moonwalk: 'dance', ascend: 'dance', headbang: 'dance', hop: 'dance', flip: 'dance',
  wave: 'social', bow: 'social', cheer: 'social', salute: 'social', rally: 'social', clockout: 'social', clap: 'social', shrug: 'social',
  laugh: 'taunt', rage: 'taunt', flex: 'taunt', playdead: 'taunt', praise: 'taunt', undo: 'taunt', lagspike: 'taunt', facepalm: 'taunt',
  point: 'signal', sit: 'signal', scared: 'signal', buffering: 'signal',
};
export const catOf = (id) => DANCE_BY_ID[id]?.cat || LEGACY_CAT[id] || 'social';
/** looping dances (repeat until you move) vs one-shot emotes */
export const isLoop = (def) => (def && def.loop !== undefined ? !!def.loop : (def?.dur || 0) >= 12);
export const SLOTS = 8;
export const DEFAULT_FAVS = ['dance', 'wave', 'point', 'office_shuffle', 'cheer', 'laugh', 'firewall', 'thumbs_up'];
/** favourites as stored on the profile (array of ids or null), normalised to SLOTS entries of an owned id or null */
export function normFavs(raw, owned) {
  const src = Array.isArray(raw) ? raw : DEFAULT_FAVS;
  const seen = new Set(), out = [];
  for (let i = 0; i < SLOTS; i++) { const id = src[i]; if (id && !seen.has(id) && (!owned || owned(id))) { out.push(id); seen.add(id); } else out.push(null); }
  return out;
}
/** put id into slot i (moving it if it is already a favourite); returns a new array */
export function setFav(favs, id, i) {
  const f = favs.slice(); const j = f.indexOf(id);
  if (j >= 0) f[j] = f[i];
  f[i] = id || null;
  return f;
}
export const toggleFav = (favs, id) => { const j = favs.indexOf(id); if (j >= 0) { const f = favs.slice(); f[j] = null; return f; } const e = favs.indexOf(null); return e < 0 ? favs : setFav(favs, id, e); };
/**
 * Wheel pages: 'fav' first (always exactly SLOTS slots, empties are null), then every category split into even chunks of at most SLOTS.
 * ids: unlocked emote ids in display order.  Returns [{ cat, part, parts, ids:[..SLOTS-or-fewer] }].
 */
export function buildPages(ids, favs) {
  const pages = [{ cat: 'fav', part: 0, parts: 1, ids: favs.slice(0, SLOTS) }];
  for (const cat of CAT_IDS.slice(1)) {
    const list = ids.filter((id) => catOf(id) === cat);
    if (!list.length) continue;
    const parts = Math.ceil(list.length / SLOTS), size = Math.ceil(list.length / parts);
    for (let p = 0; p < parts; p++) pages.push({ cat, part: p, parts, ids: list.slice(p * size, (p + 1) * size) });
  }
  return pages;
}
/** slot i of n on a ring, slot 0 at the top, clockwise: unit vector * r */
export function slotPos(i, n, r = 1) { const a = (i / n) * TAU - PI / 2; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }
/** which of n slots a mouse offset (dx, dy) points at; -1 inside the dead zone */
export function slotAt(dx, dy, n, dead = 25) {
  if (n <= 0 || Math.hypot(dx, dy) < dead) return -1;
  const a = Math.atan2(dy, dx) + PI / 2;
  return ((Math.round((a / TAU) * n) % n) + n) % n;
}
/** next / previous page index, wrapping */
export const pageStep = (i, d, n) => ((i + d) % n + n) % n;
const fold = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
/** search: every whitespace-separated term must appear in the (folded) name / id / category label */
export function searchEmotes(list, q, nameOf = (e) => e.name || e.id) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return list.slice();
  return list.filter((e) => { const hay = fold(nameOf(e) + ' ' + e.id + ' ' + catOf(e.id)); return terms.every((w) => hay.includes(w)); });
}

// ---------------------------------------------------------------------------------------------- strings (EN source, TR, RU)
export const DESC = {
  office_shuffle: ['Side-step, elbows in, fists at the chest. Mandatory team-building energy.', 'Yana adım, dirsekler içeride, yumruklar göğüste. Zorunlu takım ruhu.', 'Шаг в сторону, локти прижаты, кулаки у груди. Обязательный тимбилдинг.'],
  spreadsheet_robot: ['Snap, snap, type. Cell B7 has never been so smooth.', 'Tık, tık, yaz. B7 hücresi hiç bu kadar akıcı olmamıştı.', 'Щёлк, щёлк, набор. Ячейка B7 ещё не была такой плавной.'],
  coffee_sway: ['Sway to the break-room fridge hum. Sip on beat six.', 'Mola odası buzdolabının uğultusuyla salın. Altıncı vuruşta bir yudum.', 'Покачивайся под гул холодильника. Глоток на шестой доле.'],
  algo_glitch: ['Your body has a rendering bug and it is proud of it.', 'Vücudunda bir render hatası var ve gurur duyuyor.', 'У твоего тела баг рендера, и оно этим гордится.'],
  firewall: ['Arms one way, hips the other. Blocks all incoming compliments.', 'Kollar bir yana, kalçalar öbür yana. Gelen tüm iltifatları engeller.', 'Руки в одну сторону, бёдра в другую. Блокирует все входящие комплименты.'],
  worm: ['Floor is lava, but you are the lava.', 'Zemin lav, ama lav sensin.', 'Пол — это лава, но лава здесь ты.'],
  cmoonwalk: ['Glide backwards, tip the hat, spin home. Legally distinct.', 'Geriye kay, şapkayı selamla, eve dön. Hukuken farklı.', 'Скользи назад, коснись шляпы, крутнись домой. Юридически отличается.'],
  disco_point: ['One finger to the ceiling. The ceiling has been notified.', 'Bir parmak tavana. Tavana haber verildi.', 'Один палец к потолку. Потолок уведомлён.'],
  chair_spin: ['A mimed office chair. The chair is imaginary, the dizziness is not.', 'Hayali bir ofis koltuğu. Koltuk hayal, baş dönmesi gerçek.', 'Воображаемое офисное кресло. Кресло мнимое, головокружение настоящее.'],
  panic_dance: ['Arms up, knees up, hope none of it is real.', 'Eller yukarı, dizler yukarı, hiçbiri gerçek değil umarım.', 'Руки вверх, колени вверх, надежда, что всё это не по-настоящему.'],
  sync_dance: ['A line dance for the whole crew. Dance within 5 m of a crewmate and you lock to the same beat.', 'Tüm ekip için halk oyunu. Bir ekip arkadaşının 5 m yakınında dans edersen aynı ritme kilitlenirsin.', 'Линейный танец для всего экипажа. Танцуй в 5 м от напарника и попадёшь в один ритм.'],
  metal_night: ['Horns up, head down. The quota is a suggestion.', 'Boynuzlar yukarı, kafa aşağı. Kota bir tavsiyedir.', 'Рожки вверх, голова вниз. Квота — лишь рекомендация.'],
  victory_lap: ['One lap of honour around your own feet.', 'Kendi ayaklarının etrafında bir şeref turu.', 'Круг почёта вокруг собственных ног.'],
  quota_party: ['We made the number. Jump twice, point at management.', 'Rakamı tutturduk. İki kez zıpla, yönetimi göster.', 'Мы сделали план. Два прыжка, палец на начальство.'],
  layoff_flop: ['Stagger, clutch the chest, fall over. Severance not included.', 'Sendele, göğsünü tut, yere yığıl. Kıdem tazminatı dahil değil.', 'Пошатнуться, схватиться за грудь, упасть. Выходное пособие не включено.'],
  salary_bow: ['A perfect ninety degrees. Adjust tie. Await feedback.', 'Kusursuz doksan derece. Kravatı düzelt. Geri bildirim bekle.', 'Ровные девяносто градусов. Поправить галстук. Ждать отзыва.'],
  thumbs_up: ['Signal: approved. Nobody will read the report.', 'Sinyal: onaylandı. Raporu kimse okumayacak.', 'Сигнал: одобрено. Отчёт никто не прочтёт.'],
  hold_position: ['Signal: stop. Palm out, no debate.', 'Sinyal: dur. Avuç dışarı, tartışma yok.', 'Сигнал: стоп. Ладонь вперёд, без обсуждений.'],
  follow_me: ['Signal: this way. Stay close, do not touch anything.', 'Sinyal: bu taraftan. Yakın dur, hiçbir şeye dokunma.', 'Сигнал: сюда. Держись рядом, ничего не трогай.'],
  need_help: ['Signal: urgent. Both arms up and a very bad feeling.', 'Sinyal: acil. İki kol havada ve çok kötü bir his.', 'Сигнал: срочно. Обе руки вверх и очень плохое предчувствие.'],
  rejected: ['Thumbs down and a head shake. Ticket closed.', 'Başparmak aşağı ve baş sallama. Bilet kapatıldı.', 'Палец вниз и покачивание головой. Тикет закрыт.'],
};
export const UI_STRINGS = {
  'EMOTES': ['İFADELER', 'ЭМОЦИИ'], 'Emote Studio': ['İfade Stüdyosu', 'Студия эмоций'], 'LOOP': ['DÖNGÜ', 'ЦИКЛ'], 'ONE-SHOT': ['TEK SEFER', 'РАЗОВО'],
  'Search emotes': ['İfade ara', 'Поиск эмоций'], 'Empty slot': ['Boş yuva', 'Пустой слот'], 'DRAG TO SLOT': ['YUVAYA SÜRÜKLE', 'ПЕРЕТАЩИ В СЛОТ'],
  'MOUSE pick · release B play': ['FARE seç · B bırak oynat', 'МЫШЬ выбор · отпусти B'], 'LEFT/RIGHT page': ['SOL/SAĞ sayfa', 'ВЛЕВО/ВПРАВО страница'], 'UP favourite': ['YUKARI favori', 'ВВЕРХ избранное'],
  'TAP B studio': ['B dokun stüdyo', 'B тап студия'], 'Locked': ['Kilitli', 'Закрыто'], 'Play (double click)': ['Oynat (çift tıkla)', 'Играть (двойной клик)'],
  'Favourite slots': ['Favori yuvaları', 'Слоты избранного'], 'Drag an emote onto a slot, click a slot to clear it.': ['Bir ifadeyi yuvaya sürükle, temizlemek için yuvaya tıkla.', 'Перетащи эмоцию в слот, клик по слоту очищает его.'],
  'GROUP DANCE': ['GRUP DANSI', 'ГРУППОВОЙ ТАНЕЦ'], 'Dance volume': ['Dans müziği sesi', 'Громкость танцев'], 'ALL': ['HEPSİ', 'ВСЕ'], 'No emotes match.': ['Eşleşen ifade yok.', 'Ничего не найдено.'],
  'Rotating wardrobe shop': ['Dönüşümlü gardırop dükkânı', 'Ротационный магазин гардероба'],
};
/** { tr: {..}, ru: {..} } maps for addTranslations (names, descriptions, categories, UI) */
export function translationMaps() {
  const tr = {}, ru = {};
  for (const d of DANCE_LIST) { tr[d.en] = d.tr; ru[d.en] = d.ru; const ds = DESC[d.id]; if (ds) { tr[ds[0]] = ds[1]; ru[ds[0]] = ds[2]; } }
  for (const c of CATS) { tr[c.en] = c.tr; ru[c.en] = c.ru; }
  for (const [k, v] of Object.entries(UI_STRINGS)) { tr[k] = v[0]; ru[k] = v[1]; }
  return { tr, ru };
}
/** shop / crate rows for cosm5 (same shape as cosm5_data E()) */
export function shopRows() {
  return DANCE_LIST.filter((d) => d.src !== 'free').map((d) => ({
    slot: 'emote', id: d.id, name: d.en, tier: d.tier, src: d.src, desc: DESC[d.id][0], how: d.src === 'shop' ? 'Rotating wardrobe shop' : 'Daily crates and cosmetic rewards',
    icon: '♪', dur: d.dur || 30, ...(d.price ? { price: d.price } : {}),
  }));
}
