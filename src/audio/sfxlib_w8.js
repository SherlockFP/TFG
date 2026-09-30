// Wave 8 "sound pass 2": procedural sfx for everything added in wave 8 (feed cams, downed, carry, highlights, labyrinths, expeditions,
// LC monsters, director creatures, restaurant, mining, arcade 2, hub gate, reward viz, repomaps). Installed from sfxlib.js with its private
// helpers (H) so this file stays a plain list of recipes. Every sound is short, quiet by default and routed through mixpolicy.js (WAVE8_RULES).
// See docs/wave8/sound2.md for the id -> feature table.
import * as D from './dsp.js';

const TAU = D.TAU;

/** id -> where it is used (docs + the node test read this) */
export const W8_IDS = [
  // feed cams 1 / 2
  'cam_servo_loop', 'rec_lock', 'onair_sting', 'cam_smash', 'cam_spray', 'junction_cut', 'jammer_hum', 'drone_rotor',
  // downed / carry / highlights
  'down_thud', 'revive_loop', 'stand_up', 'carry_creak', 'fragile_crunch', 'catch_thump', 'crt_on', 'crt_off', 'chat_blip',
  // labyrinths
  'train_horn', 'train_rumble', 'lockdown_siren', 'gate_slam', 'elevator_hum', 'elevator_stall', 'vine_cut', 'spore_puff',
  // expeditions
  'uw_loop', 'uw_bubbles', 'air_warning', 'sand_wind', 'sand_storm', 'zip_line', 'generator_loop', 'battery_charge',
  // lc monsters + director creatures
  'door_knock', 'light_flicker', 'heart_monitor_beep', 'lm_witch_chant', 'lm_cage_chime', 'lm_mark_bell', 'lm_giggle', 'lm_treat_jingle',
  'lm_mimic_creak', 'lm_mask_laugh', 'lm_mask_weep', 'lm_rift_rumble', 'cd_dimmer_hum', 'cd_follower_static', 'cd_auditor_stamp',
  // restaurant, mining, arcade 2, hub gate, reward viz, repomaps
  'resto_sizzle', 'resto_bell', 'alien_chatter', 'mine_pick_stone', 'mine_pick_ore', 'mine_pick_crystal', 'mine_drill', 'cave_creak',
  'arcade2_flap', 'arcade2_pass', 'arcade2_crash', 'arcade2_tick', 'hub_unlock', 'coin_pop', 'shift_bell', 'shelf_slide',
];

export function installW8(def, H, setCat) {
  const { nburst, thud, metal, click, hiss, creak, bubble, beep, vox, norm } = H;
  const gate = (c, pts) => c.env(pts);
  const lpf = (x, c, f) => D.svf(x, c.sr, 'lp', f);

  // =============================================================== feed cams
  setCat('facility');
  def('cam_servo_loop', { dur: 2.4, loop: true, vol: 0.22, warm: 0.2, xf: 0.05 }, c => {
    const f = c.curve(t => 300 + 55 * Math.sin(TAU * t / 2.4));
    const o = c.osc('saw', f); D.svf(o, c.sr, 'bpq', 950, 3);
    D.mul(o, gate(c, [[0, 0.1], [0.2, 1], [1.0, 1], [1.2, 0.1], [1.4, 0.1], [1.6, 1], [2.3, 1], [2.4, 0.1]]));
    const n = c.noise('white'); D.svf(n, c.sr, 'bp', 2600, 1.2); D.add(o, n, 0.05);
    return o;
  });
  def('rec_lock', { dur: 1.6, loop: true, vol: 0.28, warm: 0.1, xf: 0.04 }, c => {
    const a = c.osc('sine', 660), b = c.osc('sine', 990), tr = c.osc('sine', 8);
    const o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = (a[i] + 0.35 * b[i]) * (0.65 + 0.35 * tr[i]);
    return o;
  });
  def('onair_sting', { dur: 1.3, vol: 0.55 }, c => {
    const o = c.buf();
    c.place(o, beep(c, { f: 1480, len: 0.11, type: 'square', lp: 3200 }), 0, 0.4);
    c.place(o, beep(c, { f: 1480, len: 0.11, type: 'square', lp: 3200 }), 0.16, 0.4);
    c.place(o, beep(c, { f: 1976, len: 0.5, r: 0.4, type: 'tri' }), 0.32, 0.6);
    c.place(o, thud(c, { f0: 85, f1: 40, len: 0.55, body: 0.4 }), 0.32, 0.7);
    return o;
  });
  def('cam_smash', { dur: 1.1, vol: 0.7 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 190, f1: 60, len: 0.3, click: 0.4 }), 0, 0.8);
    c.place(o, metal(c, { f: 1300, count: 7, len: 0.45, t60: 0.3, bright: 0.9 }), 0, 0.55);
    for (const t of [0.04, 0.11, 0.2]) c.place(o, nburst(c, { len: 0.4, f: 5200 + t * 3000, type: 'hp', t60: 0.25 }), t, 0.22);
    c.place(o, nburst(c, { len: 0.16, f: 3200, q: 0.7, t60: 0.1 }), 0.02, 0.4);
    return o;
  });
  def('cam_spray', { dur: 1.0, vol: 0.4 }, c => {
    const o = c.buf();
    for (const t of [0, 0.06, 0.11]) c.place(o, metal(c, { f: 2600, count: 3, t60: 0.05, len: 0.07 }), t, 0.35);
    c.place(o, hiss(c, { len: 0.8, lo: 2200, hi: 8500, a: 0.03, r: 0.3, flutter: 0.18 }), 0.14, 0.55);
    return o;
  });
  def('junction_cut', { dur: 0.7, vol: 0.55 }, c => {
    const o = c.buf();
    for (const t of [0, 0.035]) c.place(o, click(c, { f: 1800, q: 3, len: 0.03 }), t, 0.7);
    c.place(o, nburst(c, { len: 0.28, f: 2600, f2: 500, q: 2, t60: 0.2 }), 0.06, 0.5);
    const h = D.osc(c.S(0.5), c.sr, 'saw', 50); D.svf(h, c.sr, 'lp', 500); D.mul(h, D.perc(h.length, c.sr, 0.002, 0.35));
    c.place(o, h, 0.06, 0.35);
    return o;
  });
  def('jammer_hum', { dur: 2.0, loop: true, vol: 0.2, warm: 0.2, xf: 0.05 }, c => {
    const a = c.osc('sine', 200), b = c.osc('square', 203), am = c.osc('sine', 3), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = (a[i] + 0.35 * b[i]) * (0.7 + 0.3 * am[i]);
    lpf(o, c, 900); D.add(o, D.svf(c.dust(8), c.sr, 'hp', 3000), 0.15);
    return o;
  });
  def('drone_rotor', { dur: 1.2, loop: true, vol: 0.32, warm: 0.2, xf: 0.04 }, c => {
    const a = c.osc('saw', 96), am = c.osc('sine', 20), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = a[i] * (0.55 + 0.45 * am[i]);
    lpf(o, c, 900);
    const n = c.noise('pink'); D.svf(n, c.sr, 'bp', 1200, 0.7); D.add(o, n, 0.28);
    D.add(o, c.osc('sine', 3000), 0.02);                                         // whine
    const l = c.osc('square', 100); lpf(l, c, 700); D.add(o, l, 0.05);           // searchlight ballast
    return o;
  });

  // =============================================================== downed / carry / highlights
  setCat('player');
  def('down_thud', { dur: 1.1, vol: 0.7 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 110, f1: 45, len: 0.5, click: 0.2, body: 0.5 }), 0, 0.9);
    c.place(o, nburst(c, { len: 0.35, color: 'pink', f: 900, q: 0.5, a: 0.02, t60: 0.3 }), 0.03, 0.4);
    c.place(o, hiss(c, { len: 0.35, lo: 600, hi: 3500, a: 0.08, r: 0.15 }), 0.28, 0.3);
    return o;
  });
  def('revive_loop', { dur: 1.6, loop: true, vol: 0.25, warm: 0.1, xf: 0.04 }, c => {
    const pulse = c.curve(t => Math.pow(Math.max(0, Math.sin(TAU * t / 0.8)), 3));
    const lo = c.osc('sine', 90), hi = c.osc('sine', 1100), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = lo[i] * pulse[i] + 0.05 * hi[i] * (0.4 + 0.6 * pulse[i]);
    return o;
  });
  def('stand_up', { dur: 0.9, vol: 0.5 }, c => {
    const o = c.buf();
    c.place(o, nburst(c, { len: 0.5, color: 'pink', f: 600, f2: 1400, q: 0.6, a: 0.06, t60: 0.4 }), 0, 0.5);
    c.place(o, hiss(c, { len: 0.3, lo: 500, hi: 3000, a: 0.1, r: 0.1 }), 0.1, 0.3);
    c.place(o, thud(c, { f0: 95, f1: 55, len: 0.2, body: 0.5 }), 0.5, 0.5);
    return o;
  });
  setCat('item');
  def('carry_creak', { dur: 1.1, vol: 0.3 }, c => {
    const o = c.buf();
    c.place(o, creak(c, { len: 0.95, rate: [[0, 18], [0.5, 40], [1, 25]], res: [420, 900, 1500], q: 10, amp: [[0, 0], [0.2, 1], [0.8, 0.8], [1, 0]] }), 0.05, 0.8);
    return o;
  });
  def('fragile_crunch', { dur: 0.5, vol: 0.5 }, c => {
    const o = c.buf();
    for (const t of [0, 0.03, 0.07]) c.place(o, nburst(c, { len: 0.12, f: 3500 + t * 5000, q: 0.6, t60: 0.06 }), t, 0.5);
    c.place(o, nburst(c, { len: 0.25, color: 'pink', f: 1800, q: 0.7, t60: 0.15 }), 0.01, 0.4);
    return o;
  });
  def('catch_thump', { dur: 0.45, vol: 0.5 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 130, f1: 70, len: 0.22, click: 0.1, body: 0.6 }), 0, 0.8);
    c.place(o, nburst(c, { len: 0.12, f: 1200, q: 0.6, t60: 0.08 }), 0, 0.3);
    c.place(o, metal(c, { f: 2200, count: 3, len: 0.2, t60: 0.12 }), 0.01, 0.12);
    return o;
  });
  setCat('ui');
  def('crt_on', { dur: 0.8, vol: 0.3 }, c => {
    const o = c.buf(), n = c.S(0.7);
    c.place(o, thud(c, { f0: 70, f1: 40, len: 0.25, body: 0.3 }), 0, 0.4);
    const w = D.osc(n, c.sr, 'sine', D.env(n, c.sr, [[0, 1800], [0.25, 6500], [0.7, 6300]], 'exp')); D.mul(w, D.env(n, c.sr, [[0, 0], [0.05, 1], [0.7, 0]]));
    c.place(o, w, 0.02, 0.14);
    c.place(o, nburst(c, { len: 0.25, type: 'hp', f: 3000, t60: 0.15 }), 0.02, 0.15);
    return o;
  });
  def('crt_off', { dur: 0.5, vol: 0.3 }, c => {
    const o = c.buf(), n = c.S(0.2);
    const w = D.osc(n, c.sr, 'sine', D.env(n, c.sr, [[0, 6000], [0.12, 300], [0.2, 200]], 'exp')); D.mul(w, D.perc(n, c.sr, 0.001, 0.15));
    c.place(o, w, 0, 0.5);
    c.place(o, click(c, { f: 2000, len: 0.02 }), 0.12, 0.4);
    c.place(o, thud(c, { f0: 60, f1: 40, len: 0.2, body: 0.2 }), 0.12, 0.3);
    return o;
  });
  def('chat_blip', { dur: 0.09, vol: 0.2 }, c => {
    const o = c.buf();
    c.place(o, beep(c, { f: [[0, 1400], [0.05, 1900]], len: 0.06, a: 0.004, r: 0.03, lp: 4200 }), 0, 1);
    return o;
  });

  // =============================================================== labyrinths
  setCat('facility');
  def('train_horn', { dur: 2.6, vol: 0.6 }, c => {
    const n = c.S(2.3), o = c.buf(), h = new Float32Array(n);
    for (const [f, g] of [[196, 1], [247, 0.8], [294, 0.5]]) D.add(h, D.osc(n, c.sr, 'saw', f * (1 + 0.004 * g)), g);
    D.svf(h, c.sr, 'lp', 1300); D.mul(h, D.env(n, c.sr, [[0, 0], [0.09, 1], [1.7, 0.9], [2.3, 0]], 'cos'));
    c.place(o, norm(h), 0, 0.85);
    return D.reverb([o, o.slice()], c.sr, { room: 0.8, damp: 0.5, wet: 0.25, dry: 0.9, size: 1.2, down: 3 });
  });
  def('train_rumble', { dur: 4.0, loop: true, vol: 0.4, warm: 0.3, xf: 0.06 }, c => {
    const n = c.noise('brown'); D.svf(n, c.sr, 'bp', 90, 0.7);
    const am = c.osc('sine', 7), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = n[i] * (0.7 + 0.3 * am[i]);
    const cl = c.dust(3.5); D.svf(cl, c.sr, 'bp', 700, 2); D.add(o, cl, 0.12);
    return o;
  });
  def('lockdown_siren', { dur: 2.6, vol: 0.5 }, c => {
    const n = c.S(2.4), s = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 480], [1.2, 900], [2.4, 480]], 'cos'));
    D.svf(s, c.sr, 'lp', 2400); D.mul(s, D.env(n, c.sr, [[0, 0], [0.1, 1], [2.2, 1], [2.4, 0]]));
    const o = c.buf(); c.place(o, norm(s), 0, 0.8); return o;
  });
  def('gate_slam', { dur: 1.3, vol: 0.75 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 90, f1: 40, len: 0.5, click: 0.3, body: 0.5 }), 0, 0.9);
    c.place(o, metal(c, { f: 230, count: 8, len: 0.95, t60: 0.6 }), 0, 0.6);
    c.place(o, nburst(c, { len: 0.06, f: 1800, q: 0.7, t60: 0.04 }), 0, 0.5);
    return o;
  });
  def('elevator_hum', { dur: 3.0, loop: true, vol: 0.25, warm: 0.2, xf: 0.05 }, c => {
    const w = c.wob([0.3, 0.7], [1, 0.5]), a = c.osc('sine', 55), b = c.osc('sine', 110), d = c.osc('sine', 165), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = (a[i] + 0.4 * b[i] + 0.1 * d[i]) * (0.85 + 0.15 * w[i]);
    const n = c.noise('brown'); lpf(n, c, 300); D.add(o, n, 0.25);
    return o;
  });
  def('elevator_stall', { dur: 2.6, vol: 0.65 }, c => {
    const o = c.buf(), n = c.S(1.5), m = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 95], [1.4, 28]], 'exp'));
    D.svf(m, c.sr, 'lp', 320); D.mul(m, D.env(n, c.sr, [[0, 1], [1.3, 0.9], [1.5, 0]]));
    c.place(o, norm(m), 0, 0.7);
    c.place(o, creak(c, { len: 1.3, rate: [[0, 20], [1, 8]], res: [200, 420, 800], q: 9 }), 0.2, 0.4);
    c.place(o, thud(c, { f0: 80, f1: 38, len: 0.45, click: 0.3, body: 0.5 }), 1.5, 0.9);
    c.place(o, metal(c, { f: 300, count: 6, len: 0.7, t60: 0.5 }), 1.5, 0.3);
    return o;
  });
  setCat('outdoor');
  def('vine_cut', { dur: 0.45, vol: 0.5 }, c => {
    const o = c.buf();
    c.place(o, nburst(c, { len: 0.1, color: 'pink', f: 2200, q: 1, t60: 0.06 }), 0, 0.7);
    c.place(o, nburst(c, { len: 0.18, color: 'pink', f: 500, q: 0.8, t60: 0.12 }), 0.02, 0.5);
    c.place(o, click(c, { f: 3200, len: 0.02 }), 0.05, 0.3);
    return o;
  });
  def('spore_puff', { dur: 0.9, vol: 0.35 }, c => {
    const o = c.buf();
    c.place(o, hiss(c, { len: 0.6, lo: 800, hi: 4500, a: 0.02, r: 0.4, flutter: 0.3 }), 0, 0.6);
    c.place(o, D.svf(c.dust(300), c.sr, 'hp', 2500), 0.05, 0.12);
    return o;
  });

  // =============================================================== expeditions
  def('uw_loop', { dur: 4.0, loop: true, vol: 0.35, warm: 0.3, xf: 0.06 }, c => {
    const o = c.noise('brown'); lpf(o, c, 220);
    D.add(o, c.osc('sine', 45), 0.2);
    const b = c.dust(5); D.svf(b, c.sr, 'bpq', 620, 8); D.add(o, b, 0.35);
    return o;
  });
  def('uw_bubbles', { dur: 1.0, vol: 0.4 }, c => {
    const o = c.buf();
    for (let i = 0; i < 7; i++) c.place(o, bubble(c, { f: 380 + c.rng() * 700, len: 0.07 + c.rng() * 0.05, rise: 1.6 }), i * 0.1 + c.rng() * 0.06, 0.5);
    return o;
  });
  def('air_warning', { dur: 1.2, vol: 0.5 }, c => {
    const o = c.buf();
    for (let k = 0; k < 3; k++) c.place(o, beep(c, { f: 660 - k * 30, len: 0.17, type: 'square', lp: 1300, a: 0.006, r: 0.05 }), k * 0.33, 0.55);
    return o;
  });
  def('sand_wind', { dur: 6.0, loop: true, vol: 0.28, warm: 0.4, xf: 0.08 }, c => {
    const n = c.noise('pink'); D.svf(n, c.sr, 'bp', 520, 0.6);
    const w = c.wob([0.17, 0.5], [1, 0.4]), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = n[i] * (0.55 + 0.45 * w[i]);
    const h = c.noise('white'); D.svf(h, c.sr, 'bp', 3200, 0.8); D.add(o, h, 0.06);
    return o;
  });
  def('sand_storm', { dur: 6.0, loop: true, vol: 0.4, warm: 0.4, xf: 0.08 }, c => {
    const n = c.noise('pink'); D.svf(n, c.sr, 'bp', 380, 0.5);
    const w = c.wob([0.2, 0.6], [1, 0.5]), o = c.buf();
    for (let i = 0; i < c.N; i++) o[i] = n[i] * (0.65 + 0.35 * w[i]);
    const g = c.dust(220); D.svf(g, c.sr, 'hp', 3000); D.add(o, g, 0.2);
    const h = c.noise('white'); D.svf(h, c.sr, 'bp', 2400, 0.7); D.add(o, h, 0.1);
    return o;
  });
  setCat('item');
  def('zip_line', { dur: 1.7, vol: 0.4 }, c => {
    const n = c.S(1.6), s = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 700], [0.6, 1300], [1.6, 900]], 'exp'));
    D.svf(s, c.sr, 'lp', 2400); D.mul(s, D.env(n, c.sr, [[0, 0], [0.1, 1], [1.4, 0.8], [1.6, 0]]));
    const j = D.smoothNoise(n, c.sr, c.rng, 40); for (let i = 0; i < n; i++) s[i] *= 0.7 + 0.3 * j[i];
    const rr = D.noise(n, c.rng, 'pink'); D.svf(rr, c.sr, 'bp', 1800, 1.2); D.mul(rr, D.env(n, c.sr, [[0, 0], [0.1, 1], [1.4, 0.8], [1.6, 0]]));
    D.add(s, rr, 0.35);
    const o = c.buf(); c.place(o, norm(s), 0, 0.8); return o;
  });
  setCat('facility');
  def('generator_loop', { dur: 1.6, loop: true, vol: 0.4, warm: 0.2, xf: 0.05 }, c => {
    const pulse = c.curve(t => Math.pow(0.5 + 0.5 * Math.sin(TAU * 12 * t / 1.6), 2)), a = c.osc('sine', 70), b = c.osc('saw', 55), o = c.buf();
    lpf(b, c, 300);
    for (let i = 0; i < c.N; i++) o[i] = a[i] * pulse[i] + 0.4 * b[i];
    const n = c.noise('white'); D.svf(n, c.sr, 'bp', 500, 1); D.add(o, n, 0.05);
    return o;
  });
  setCat('item');
  def('battery_charge', { dur: 1.3, vol: 0.5 }, c => {
    const o = c.buf();
    [[440, 0], [660, 0.12], [990, 0.24]].forEach(([f, t]) => c.place(o, beep(c, { f, len: 0.16, type: 'tri', lp: 3200 }), t, 0.5));
    c.place(o, beep(c, { f: [[0, 700], [0.7, 1500]], len: 0.7, r: 0.4, type: 'sine' }), 0.36, 0.3);
    c.place(o, click(c, { f: 2600, len: 0.02 }), 0, 0.5);
    return o;
  });

  // =============================================================== lc monsters + director creatures
  setCat('creature');
  def('door_knock', { dur: 0.35, vol: 0.85 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 230, f1: 110, len: 0.18, click: 0.5, body: 0.3, lp: 900 }), 0, 0.9);
    c.place(o, nburst(c, { len: 0.05, f: 800, q: 0.8, t60: 0.03 }), 0, 0.35);
    return o;
  });
  def('light_flicker', { dur: 1.0, vol: 0.45 }, c => {
    const o = c.buf();
    let t = 0.02;
    while (t < 0.85) {
      const l = 0.04 + c.rng() * 0.09, n = c.S(l), b = D.osc(n, c.sr, 'square', 100); D.svf(b, c.sr, 'lp', 2500); D.mul(b, D.perc(n, c.sr, 0.002, l));
      c.place(o, b, t, 0.7); c.place(o, click(c, { f: 3500, len: 0.015 }), t, 0.5);
      t += l + 0.05 + c.rng() * 0.16;
    }
    return o;
  });
  def('heart_monitor_beep', { dur: 0.4, vol: 0.4 }, c => {
    const o = c.buf(); c.place(o, beep(c, { f: 1000, len: 0.28, a: 0.004, r: 0.12, lp: 3000 }), 0, 0.8); return o;
  });
  def('lm_witch_chant', { dur: 2.4, vol: 0.5 }, c => {
    const o = c.buf();
    c.place(o, vox(c, { len: 2.2, f0: [[0, 92], [1.1, 108], [2.2, 88]], vowels: [[0, 'o'], [0.8, 'a'], [1.5, 'o'], [2.2, 'u']], src: 'saw', breath: 0.3, fry: 0.4, scale: 0.95, amp: [[0, 0], [0.4, 1], [1.9, 0.9], [2.2, 0]] }), 0, 0.8);
    return D.reverb([o, o.slice()], c.sr, { room: 0.7, damp: 0.5, wet: 0.3, dry: 0.8, size: 1.1, down: 3 });
  });
  def('lm_cage_chime', { dur: 1.7, vol: 0.35 }, c => {
    const o = c.buf(); c.place(o, metal(c, { f: 1760, count: 5, len: 1.5, t60: 1.0, bright: 0.85 }), 0, 0.8); return o;
  });
  def('lm_mark_bell', { dur: 2.2, vol: 0.55 }, c => {
    const o = c.buf(), e = new Float32Array(c.S(2.2)); e[0] = 1;
    c.place(o, D.modal(e, c.sr, [[330, 2.0, 1], [330 * 2.4, 1.5, 0.6], [330 * 3.9, 0.9, 0.3], [165, 2.0, 0.5], [332, 1.9, 0.6]]), 0, 0.9);
    c.place(o, click(c, { f: 1800, len: 0.012 }), 0, 0.3);
    return o;
  });
  def('lm_giggle', { dur: 1.0, vol: 0.45 }, c => {
    const o = c.buf();
    for (let k = 0; k < 4; k++) c.place(o, vox(c, { len: 0.14, f0: [[0, 430 + k * 25], [0.14, 380 + k * 20]], vowels: [[0, 'a']], src: 'pulse', breath: 0.15, scale: 1.4, amp: [[0, 0], [0.02, 1], [0.14, 0]] }), 0.05 + k * 0.19, 0.7);
    return o;
  });
  def('lm_treat_jingle', { dur: 1.3, vol: 0.45 }, c => {
    const o = c.buf();
    [[1047, 0], [1319, 0.13], [1568, 0.26], [2093, 0.4]].forEach(([f, t]) => c.place(o, beep(c, { f, len: 0.3, type: 'tri', lp: 5000, r: 0.25 }), t, 0.5));
    return D.reverb([o, o.slice()], c.sr, { room: 0.5, damp: 0.4, wet: 0.2, dry: 0.9, size: 0.8, down: 3 });
  });
  def('lm_mimic_creak', { dur: 1.4, vol: 0.28 }, c => {
    const o = c.buf();
    c.place(o, creak(c, { len: 1.1, rate: [[0, 10], [1, 16]], res: [300, 600, 1100], q: 9 }), 0, 0.7);
    c.place(o, hiss(c, { len: 0.6, lo: 300, hi: 1400, a: 0.2, r: 0.3 }), 0.5, 0.25);
    return o;
  });
  def('lm_mask_laugh', { dur: 1.7, vol: 0.4 }, c => {
    const o = c.buf();
    for (let k = 0; k < 5; k++) c.place(o, vox(c, { len: 0.2, f0: [[0, 270 - k * 8], [0.2, 240 - k * 8]], vowels: [[0, 'a']], src: 'saw', breath: 0.2, scale: 1.05, amp: [[0, 0], [0.03, 1], [0.2, 0]] }), 0.1 + k * 0.29, 0.6);
    D.ring(o, c.sr, 55, 0.35);
    return o;
  });
  def('lm_mask_weep', { dur: 1.9, vol: 0.4 }, c => {
    const o = c.buf();
    c.place(o, vox(c, { len: 1.7, f0: [[0, 340], [0.8, 300], [1.7, 250]], vib: [6, 0.03], vowels: [[0, 'e'], [0.7, 'a'], [1.4, 'uh']], src: 'saw', breath: 0.35, scale: 1.1, amp: [[0, 0], [0.25, 1], [1.4, 0.7], [1.7, 0]] }), 0.05, 0.7);
    return o;
  });
  def('lm_rift_rumble', { dur: 3.2, vol: 0.65 }, c => {
    const o = c.buf(), n = c.S(3.0), r = D.noise(n, c.rng, 'brown');
    D.svf(r, c.sr, 'lp', 110); D.mul(r, D.env(n, c.sr, [[0, 0], [1.6, 1], [3, 0]], 'cos'));
    c.place(o, norm(r), 0, 0.8);
    const s = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 34], [3, 46]])); D.svf(s, c.sr, 'lp', 160); D.mul(s, D.env(n, c.sr, [[0, 0], [1.6, 1], [3, 0]], 'cos'));
    c.place(o, s, 0, 0.4);
    c.place(o, D.svf(D.dust(n, c.sr, c.rng, 22), c.sr, 'hp', 1500), 0, 0.15);
    return o;
  });
  def('cd_dimmer_hum', { dur: 1.9, vol: 0.45 }, c => {
    const n = c.S(1.8), o = c.buf(), s = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 130], [1.6, 55]], 'exp')), am = D.osc(n, c.sr, 'sine', 60);
    for (let i = 0; i < n; i++) s[i] *= 0.7 + 0.3 * am[i];
    D.svf(s, c.sr, 'lp', 520); D.mul(s, D.env(n, c.sr, [[0, 0], [0.1, 1], [1.2, 0.7], [1.8, 0]]));
    c.place(o, norm(s), 0, 0.8);
    c.place(o, D.svf(D.dust(n, c.sr, c.rng, 30), c.sr, 'hp', 2500), 0, 0.15);
    return o;
  });
  def('cd_follower_static', { dur: 1.1, vol: 0.4 }, c => {
    const o = c.buf();
    c.place(o, click(c, { f: 1200, len: 0.03 }), 0, 0.5);
    c.place(o, nburst(c, { len: 0.7, f: 2400, q: 0.6, a: 0.02, t60: 0.6 }), 0.03, 0.5);
    c.place(o, beep(c, { f: 1150, len: 0.09, lp: 3000 }), 0.75, 0.35);
    c.place(o, nburst(c, { len: 0.12, f: 2000, t60: 0.08 }), 0.86, 0.35);
    return o;
  });
  def('cd_auditor_stamp', { dur: 1.0, vol: 0.6 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 150, f1: 65, len: 0.22, click: 0.4, body: 0.5 }), 0, 0.9);
    c.place(o, nburst(c, { len: 0.1, f: 3000, q: 0.7, t60: 0.05 }), 0, 0.3);
    c.place(o, metal(c, { f: 2000, count: 4, len: 0.55, t60: 0.35, bright: 0.8 }), 0.13, 0.4);
    return o;
  });

  // =============================================================== restaurant, mining, arcade 2, hub gate, reward viz, repomaps
  setCat('company');
  def('resto_sizzle', { dur: 1.1, vol: 0.28 }, c => {
    const o = c.buf();
    c.place(o, D.svf(c.dust(90), c.sr, 'hp', 3000), 0, 0.5);
    c.place(o, hiss(c, { len: 1.0, lo: 3000, hi: 8000, a: 0.05, r: 0.5, flutter: 0.4 }), 0, 0.3);
    return o;
  });
  def('resto_bell', { dur: 1.5, vol: 0.4 }, c => {
    const o = c.buf(), e = new Float32Array(c.S(1.5)); e[0] = 1;
    c.place(o, D.modal(e, c.sr, [[2200, 1.2, 1], [2200 * 2.7, 0.7, 0.4], [2200 * 4.1, 0.4, 0.15]]), 0, 0.8);
    c.place(o, click(c, { f: 4200, len: 0.008 }), 0, 0.2);
    return o;
  });
  def('alien_chatter', { dur: 1.3, vol: 0.28 }, c => {
    const o = c.buf();
    let t = 0.02;
    for (let k = 0; k < 6; k++) {
      const l = 0.06 + c.rng() * 0.08, f0 = 400 + c.rng() * 800, up = c.rng() < 0.5;
      c.place(o, beep(c, { f: [[0, f0], [l, up ? f0 * 1.6 : f0 * 0.65]], len: l, type: 'sine', lp: 3500, a: 0.008, r: 0.03 }), t, 0.6);
      t += l + 0.04 + c.rng() * 0.12;
    }
    return o;
  });
  setCat('item');
  def('mine_pick_stone', { dur: 0.4, vol: 0.55 }, c => {
    const o = c.buf();
    c.place(o, thud(c, { f0: 260, f1: 120, len: 0.14, click: 0.6, body: 0.2, lp: 1500 }), 0, 0.9);
    c.place(o, nburst(c, { len: 0.06, f: 2500, q: 0.7, t60: 0.04 }), 0, 0.4);
    return o;
  });
  def('mine_pick_ore', { dur: 0.7, vol: 0.5 }, c => {
    const o = c.buf();
    c.place(o, click(c, { f: 2600, len: 0.02 }), 0, 0.6);
    c.place(o, thud(c, { f0: 220, f1: 110, len: 0.1, click: 0.3, body: 0.2, lp: 1500 }), 0, 0.5);
    c.place(o, metal(c, { f: 1900, count: 5, len: 0.55, t60: 0.35, bright: 0.8 }), 0, 0.5);
    return o;
  });
  def('mine_pick_crystal', { dur: 1.0, vol: 0.45 }, c => {
    const o = c.buf();
    c.place(o, click(c, { f: 3800, len: 0.015 }), 0, 0.5);
    c.place(o, metal(c, { f: 3300, count: 6, len: 0.85, t60: 0.65, bright: 0.95 }), 0, 0.55);
    return o;
  });
  def('mine_drill', { dur: 0.9, vol: 0.45 }, c => {
    const n = c.S(0.85), s = D.osc(n, c.sr, 'saw', D.env(n, c.sr, [[0, 140], [0.2, 190], [0.85, 175]])), am = D.osc(n, c.sr, 'sine', 60);
    for (let i = 0; i < n; i++) s[i] *= 0.6 + 0.4 * am[i];
    D.svf(s, c.sr, 'lp', 1400);
    const g = D.noise(n, c.rng, 'white'); D.svf(g, c.sr, 'bp', 1800, 1); D.add(s, g, 0.3);
    D.mul(s, D.env(n, c.sr, [[0, 0], [0.05, 1], [0.75, 0.9], [0.85, 0]]));
    const o = c.buf(); c.place(o, norm(s), 0, 0.8); return o;
  });
  setCat('facility');
  def('cave_creak', { dur: 2.8, vol: 0.65 }, c => {
    const o = c.buf(), n = c.S(2.4), r = D.noise(n, c.rng, 'brown');
    c.place(o, creak(c, { len: 2.2, rate: [[0, 8], [0.5, 22], [1, 12]], res: [110, 240, 420], q: 8 }), 0.05, 0.7);
    D.svf(r, c.sr, 'lp', 120); D.mul(r, D.env(n, c.sr, [[0, 0], [1.2, 1], [2.4, 0]], 'cos'));
    c.place(o, norm(r), 0, 0.5);
    for (const t of [0.6, 1.1, 1.7]) c.place(o, nburst(c, { len: 0.05, f: 1600 + t * 300, q: 0.8, t60: 0.03 }), t + c.rng() * 0.2, 0.25);
    return o;
  });
  setCat('minigame');
  def('arcade2_flap', { dur: 0.16, vol: 0.5 }, c => { const o = c.buf(); c.place(o, beep(c, { f: [[0, 420], [0.1, 760]], len: 0.11, type: 'square', lp: 3200, r: 0.04 }), 0, 0.5); return o; });
  def('arcade2_pass', { dur: 0.3, vol: 0.5 }, c => {
    const o = c.buf();
    c.place(o, beep(c, { f: 880, len: 0.09, type: 'square', lp: 3500 }), 0, 0.4);
    c.place(o, beep(c, { f: 1320, len: 0.16, type: 'square', lp: 3500, r: 0.08 }), 0.09, 0.4);
    return o;
  });
  def('arcade2_crash', { dur: 0.5, vol: 0.55 }, c => {
    const o = c.buf(), n = c.S(0.4), s = D.osc(n, c.sr, 'square', D.env(n, c.sr, [[0, 300], [0.4, 70]], 'exp'));
    D.svf(s, c.sr, 'lp', 1800); D.mul(s, D.perc(n, c.sr, 0.002, 0.35));
    c.place(o, s, 0, 0.5); c.place(o, nburst(c, { len: 0.25, f: 1500, q: 0.6, t60: 0.15 }), 0, 0.35);
    return o;
  });
  def('arcade2_tick', { dur: 0.06, vol: 0.4 }, c => { const o = c.buf(); c.place(o, beep(c, { f: 1500, len: 0.04, type: 'square', lp: 3500, r: 0.02 }), 0, 0.4); return o; });
  setCat('ui');
  def('hub_unlock', { dur: 2.0, vol: 0.55 }, c => {
    const o = c.buf();
    [[523, 0], [659, 0.11], [784, 0.22], [1047, 0.33]].forEach(([f, t]) => c.place(o, beep(c, { f, len: 0.4, type: 'tri', lp: 4500, r: 0.3 }), t, 0.5));
    const e = new Float32Array(c.S(1.6)); e[0] = 1;
    c.place(o, D.modal(e, c.sr, [[1047, 1.4, 1], [1047 * 2.01, 1.0, 0.4], [1047 * 3.0, 0.7, 0.2]]), 0.33, 0.5);
    return D.reverb([o, o.slice()], c.sr, { room: 0.6, damp: 0.4, wet: 0.2, dry: 0.9, size: 0.9, down: 3 });
  });
  def('coin_pop', { dur: 0.22, vol: 0.35 }, c => {
    const o = c.buf();
    c.place(o, bubble(c, { f: 900, len: 0.09, rise: 1.4 }), 0, 0.6);
    c.place(o, beep(c, { f: 2400, len: 0.05, lp: 5000, r: 0.03 }), 0.02, 0.25);
    return o;
  });
  setCat('company');
  def('shift_bell', { dur: 2.0, vol: 0.6 }, c => {
    const o = c.buf(), e = new Float32Array(c.S(2.0)); e[0] = 1;
    c.place(o, D.modal(e, c.sr, [[520, 2.0, 1], [520 * 2.4, 1.3, 0.55], [520 * 4.0, 0.8, 0.25], [261, 2.0, 0.4]]), 0, 0.9);
    c.place(o, click(c, { f: 2200, len: 0.012 }), 0, 0.3);
    return o;
  });
  def('shelf_slide', { dur: 1.3, vol: 0.5 }, c => {
    const o = c.buf(), n = c.S(1.0), g = D.noise(n, c.rng, 'brown');
    D.svf(g, c.sr, 'bp', 200, 1.2); D.mul(g, D.env(n, c.sr, [[0, 0], [0.1, 1], [0.9, 0.8], [1.0, 0]]));
    c.place(o, norm(g), 0, 0.6);
    c.place(o, creak(c, { len: 0.9, rate: [[0, 25], [1, 45]], res: [500, 1000], q: 9 }), 0.05, 0.3);
    c.place(o, thud(c, { f0: 100, f1: 50, len: 0.25, body: 0.5 }), 1.02, 0.6);
    return o;
  });
}
