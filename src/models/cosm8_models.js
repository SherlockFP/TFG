// cosm8 (wave 8, "lcmods") - procedural models for the +8 suits, +8 hats, +6 back items of the cosmetics drop.
// Same contracts as cosm5_models.js (which merges these tables into its own exports, so no registry code changes anywhere):
//   SUIT builder { tint, glove, boot, belt, emissive, hide, build(c, headgear) }   BACK builder (c, rig)   HAT builder (g, add)
// Merged geometry + cached materials; animated pieces use tiny per-instance Basic materials + Mesh.onBeforeRender / c.anim.
// Appearance only. Node-safe (no DOM access at import time).
import * as THREE from 'three';
import { G, xf, lam, bas, mk, clamp, PI, TAU } from './modelkit.js';

const flat = (c) => lam(c);
const ghost = (c, o = 0.3) => lam(c, { transparent: true, opacity: o, depthWrite: false });
const rT = (y) => 0.22 + 0.06 * y;
const ring = (y, h, grow = 0.012) => xf(G.cyl(rT(y + h / 2) + grow, rT(y - h / 2) + grow, h, 8, true), [0, y, 0], [0, PI / 8, 0], [1, 1, 0.665]);
const limbRing = (r, h, y, s = 6) => xf(G.cyl(r, r, h, s, true), [0, y, 0]);
const dome = (r, y, sy = 0.85, sz = 1.05) => xf(G.sph(r, 9, 5, 0, TAU, 0, PI / 2), [0, y, 0], [0, 0, 0], [1, sy, sz]);
const clock = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
const speedOf = (a) => clamp((a?.speed || 0) / 4, 0, 1);
const inst = (color, o = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...o }); m.userData.noTint = true; return m; };
const tick = (mesh, fn) => { mesh.onBeforeRender = () => fn(clock()); return mesh; };

// =====================================================================================================================
// SUITS
// =====================================================================================================================
export const C8_SUITS = {
  mailroom: {
    tint: '#38485c', glove: '#c9cdd2', boot: '#1e2530', belt: '#2a2a2a', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c8_mr_vest', flat('#f08a24'), () => [xf(G.box(0.34, 0.34, 0.02), [0, 0.2, 0.172]), xf(G.box(0.34, 0.34, 0.02), [0, 0.2, -0.172]), xf(G.box(0.05, 0.34, 0.3), [0.17, 0.2, 0]), xf(G.box(0.05, 0.34, 0.3), [-0.17, 0.2, 0])]);
      c.mesh(spine, 'c8_mr_refl', bas('#e8f0a0'), () => [xf(G.box(0.34, 0.03, 0.006), [0, 0.15, 0.184]), xf(G.box(0.34, 0.03, 0.006), [0, 0.27, 0.184])]);
      c.mesh(spine, 'c8_mr_bag', flat('#6b4a2c'), () => [xf(G.box(0.26, 0.2, 0.09), [0.25, -0.02, 0.02], [0, 0, 0.15]), xf(G.box(0.27, 0.03, 0.1), [0.25, 0.09, 0.02], [0, 0, 0.15])]);
      c.mesh(spine, 'c8_mr_strap', flat('#4a3220'), () => [xf(G.box(0.05, 0.5, 0.012), [0.12, 0.3, 0.17], [0, 0, -0.35])]);
      c.mesh(spine, 'c8_mr_letter', flat('#f4f0e2'), () => [xf(G.box(0.1, 0.06, 0.01), [0.3, 0.1, 0.06], [0.2, 0.2, 0.3])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c8_mr_cuff', flat('#f08a24'), () => [limbRing(0.078, 0.03, -0.2)]);
      c.mesh(headgear, 'c8_mr_cap', flat('#38485c'), () => [dome(0.2, -0.06, 0.55, 1.05), xf(G.box(0.3, 0.018, 0.13), [0, -0.035, 0.235], [0.12, 0, 0])]);
    },
  },
  hrofficer: {
    tint: '#6e737a', glove: '#e6e2d8', boot: '#1a1a1e', belt: '#2a2a2e', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c8_hr_shirt', flat('#f2f0ea'), () => [xf(G.box(0.12, 0.42, 0.01), [0, 0.27, 0.172]), xf(G.box(0.2, 0.06, 0.05), [0, 0.5, 0.15])]);
      c.mesh(spine, 'c8_hr_tie', flat('#c0281f'), () => [xf(G.box(0.05, 0.34, 0.012), [0, 0.27, 0.18]), xf(G.box(0.07, 0.05, 0.014), [0, 0.44, 0.18])]);
      c.mesh(spine, 'c8_hr_lapel', flat('#565a61'), () => [xf(G.box(0.07, 0.3, 0.02), [0.09, 0.3, 0.175], [0, 0, 0.3]), xf(G.box(0.07, 0.3, 0.02), [-0.09, 0.3, 0.175], [0, 0, -0.3])]);
      c.mesh(spine, 'c8_hr_lan', flat('#2a6fdc'), () => [xf(G.box(0.012, 0.36, 0.006), [-0.06, 0.28, 0.19], [0, 0, 0.16]), xf(G.box(0.012, 0.36, 0.006), [0.06, 0.28, 0.19], [0, 0, -0.16])]);
      c.mesh(spine, 'c8_hr_badge', flat('#f6f6f0'), () => [xf(G.box(0.09, 0.12, 0.008), [0, 0.06, 0.19])]);
      c.mesh(spine, 'c8_hr_photo', bas('#2a6fdc'), () => [xf(G.box(0.04, 0.045, 0.004), [0, 0.085, 0.196])]);
      c.mesh(spine, 'c8_hr_folder', flat('#d4b45a'), () => [xf(G.box(0.16, 0.21, 0.014), [-0.26, 0.05, 0.1], [0.1, 0.5, 0.1])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c8_hr_cuff', flat('#f2f0ea'), () => [limbRing(0.078, 0.035, -0.2)]);
    },
  },
  lostfound: {
    tint: '#a37a4a', glove: '#8a6a3c', boot: '#5a4028', belt: '#7a5a34', hide: ['belt', 'helmetbits'],
    build(c, headgear) {
      const { spine } = c.rig;
      c.mesh(spine, 'c8_lf_box', flat('#b48a54'), () => [xf(G.box(0.44, 0.44, 0.3), [0, 0.2, 0])]);
      c.mesh(spine, 'c8_lf_tape', flat('#d8c9a0'), () => [xf(G.box(0.07, 0.45, 0.31), [0, 0.2, 0]), xf(G.box(0.45, 0.05, 0.31), [0, 0.1, 0])]);
      c.mesh(spine, 'c8_lf_label', flat('#f4f0e2'), () => [xf(G.box(0.17, 0.09, 0.006), [0.09, 0.3, 0.153])]);
      c.mesh(spine, 'c8_lf_ink', flat('#c0281f'), () => [xf(G.box(0.12, 0.014, 0.006), [0.09, 0.32, 0.158]), xf(G.box(0.08, 0.012, 0.006), [0.09, 0.28, 0.158])]);
      c.mesh(spine, 'c8_lf_arrows', flat('#3a2a18'), () => [xf(G.box(0.03, 0.12, 0.006), [-0.12, 0.12, 0.153]), xf(G.cone(0.03, 0.04, 3), [-0.12, 0.2, 0.153])]);
      c.mesh(headgear, 'c8_lf_flaps', flat('#a37a4a'), () => [xf(G.box(0.16, 0.014, 0.26), [0.19, -0.06, 0], [0, 0, 0.5]), xf(G.box(0.16, 0.014, 0.26), [-0.19, -0.06, 0], [0, 0, -0.5])]);
    },
  },
  streamer: {
    tint: '#232733', glove: '#e83fd0', boot: '#1b1d28', belt: '#181a24', emissive: '#040308', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c8_st_hood', flat('#1c1f2a'), () => [xf(G.cyl(0.2, 0.24, 0.09, 8, true), [0, 0.5, -0.02], [0, PI / 8, 0], [1, 1, 0.8]), xf(G.box(0.3, 0.12, 0.02), [0, 0.02, 0.17])]);
      c.mesh(spine, 'c8_st_mag', bas('#ff2fd0'), () => [xf(G.box(0.012, 0.42, 0.008), [0.15, 0.26, 0.172]), xf(G.box(0.012, 0.42, 0.008), [-0.15, 0.26, 0.172])]);
      c.mesh(spine, 'c8_st_cy', bas('#35e6ff'), () => [ring(0.08, 0.014, 0.018)]);
      const dot = inst('#ff2a2a');
      c.raw(spine, G.sph(0.028, 6, 4), dot, [0.09, 0.4, 0.19]);
      c.mesh(spine, 'c8_st_livebar', flat('#101014'), () => [xf(G.box(0.15, 0.05, 0.01), [-0.02, 0.4, 0.182])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c8_st_armrgb', bas('#35e6ff'), () => [xf(G.box(0.01, 0.2, 0.01), [0, -0.11, 0.077])]);
      // headset with a boom mic
      c.mesh(headgear, 'c8_st_band', flat('#15161c'), () => [xf(G.tor(0.215, 0.014, 4, 12, PI), [0, -0.2, 0])]);
      c.mesh(headgear, 'c8_st_cups', bas('#ff2fd0'), () => [xf(G.cyl(0.06, 0.06, 0.05, 8), [0.225, -0.2, 0], [0, 0, PI / 2]), xf(G.cyl(0.06, 0.06, 0.05, 8), [-0.225, -0.2, 0], [0, 0, PI / 2])]);
      c.mesh(headgear, 'c8_st_boom', flat('#15161c'), () => [xf(G.cyl(0.006, 0.006, 0.26, 4), [-0.22, -0.3, 0.12], [1.1, 0, 0.35]), xf(G.sph(0.02, 5, 4), [-0.15, -0.36, 0.23])]);
      c.anim((dt, t) => dot.color.setHex(Math.sin(t * 5) > -0.2 ? 0xff2a2a : 0x4a0d0d));
    },
  },
  redtape: {
    tint: '#cfc8b4', glove: '#c0281f', boot: '#c0281f', belt: '#c0281f', hide: ['belt', 'helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const tape = flat('#c0281f');
      c.mesh(spine, 'c8_rt_wrap', tape, () => [-0.1, 0.0, 0.1, 0.2, 0.3, 0.4].map((y, i) => xf(G.cyl(rT(y) + 0.018, rT(y) + 0.018, 0.04, 8, true), [0, y, 0], [0, PI / 8 + i * 0.25, 0.08 * (i % 2 ? 1 : -1)], [1, 1, 0.665]))
        .concat([xf(G.box(0.05, 0.36, 0.01), [0.05, 0.26, 0.176], [0, 0, 0.5])]));
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c8_rt_arm', tape, () => [-0.05, -0.13, -0.21].map((y) => limbRing(0.079, 0.035, y)));
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c8_rt_leg', tape, () => [-0.05, -0.16, -0.27].map((y) => limbRing(0.094, 0.035, y)));
      c.mesh(spine, 'c8_rt_label', flat('#f4f0e2'), () => [xf(G.box(0.12, 0.07, 0.008), [-0.06, 0.3, 0.19], [0, 0, 0.12])]);
      c.mesh(headgear, 'c8_rt_head', tape, () => [-0.02, -0.1, -0.18].map((y, i) => xf(G.cyl(0.21 - Math.abs(y + 0.1) * 0.12, 0.21 - Math.abs(y + 0.1) * 0.12, 0.04, 9, true), [0, y, 0], [0, i * 0.4, 0.1 * (i - 1)])));
      c.mesh(headgear, 'c8_rt_loose', tape, () => [xf(G.box(0.03, 0.22, 0.01), [0.17, -0.3, 0.06], [0, 0, 0.2]), xf(G.box(0.03, 0.18, 0.01), [-0.15, -0.28, 0.08], [0, 0, -0.3])]);
    },
  },
  quotasuit: {
    tint: '#2f4a3a', glove: '#e8e2cc', boot: '#181c1a', belt: '#1a1a18', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c8_qs_pin', flat('#8fb59a'), () => [-0.1, -0.05, 0, 0.05, 0.1].map((x) => xf(G.box(0.006, 0.42, 0.006), [x * 1.4, 0.24, 0.174])));
      c.mesh(spine, 'c8_qs_tie', flat('#d8b03a'), () => [xf(G.box(0.045, 0.24, 0.012), [0, 0.32, 0.184]), xf(G.box(0.06, 0.04, 0.014), [0, 0.45, 0.184])]);
      c.mesh(spine, 'c8_qs_frame', flat('#0e0f10'), () => [xf(G.box(0.22, 0.07, 0.012), [0, 0.08, 0.19])]);
      const fill = c.raw(spine, G.box(0.2, 0.045, 0.006), inst('#3dff7a'), [0, 0.08, 0.2]);
      const tail = c.raw(spine, G.box(0.2, 0.045, 0.006), inst('#ff3a3a'), [0, 0.08, 0.198]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c8_qs_cuff', flat('#d8b03a'), () => [limbRing(0.078, 0.025, -0.2)]);
      c.mesh(headgear, 'c8_qs_hat', flat('#2f4a3a'), () => [dome(0.2, -0.06, 0.6, 1.05), xf(G.cyl(0.21, 0.21, 0.03, 10), [0, -0.075, 0])]);
      c.mesh(headgear, 'c8_qs_band', flat('#d8b03a'), () => [xf(G.cyl(0.205, 0.205, 0.03, 10, true), [0, -0.06, 0])]);
      c.anim((dt, t) => { const k = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.35)); fill.scale.x = k; fill.position.x = -0.1 * (1 - k); tail.scale.x = 1 - k + 0.001; tail.position.x = 0.1 * k; });
    },
  },
  reaper: {
    tint: '#101015', glove: '#1a1a20', boot: '#0a0a0e', belt: '#0a0a0e', emissive: '#040406', hide: ['belt', 'helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      const cloth = flat('#0d0d12');
      c.mesh(spine, 'c8_rp_skirt', cloth, () => [xf(G.cyl(0.29, 0.38, 0.34, 8, true), [0, -0.1, 0], [0, PI / 8, 0], [1, 1, 0.8]), xf(G.cyl(0.21, 0.27, 0.12, 8, true), [0, 0.5, 0], [0, PI / 8, 0], [1, 1, 0.75])]);
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'c8_rp_sleeve', cloth, () => [xf(G.cyl(0.1, 0.16, 0.34, 6, true), [0, -0.2, 0])]);
      c.mesh(spine, 'c8_rp_glass', flat('#c9b48a'), () => [xf(G.cone(0.04, 0.06, 6), [-0.27, -0.02, 0.06], [PI, 0, 0]), xf(G.cone(0.04, 0.06, 6), [-0.27, 0.05, 0.06]), xf(G.cyl(0.05, 0.05, 0.012, 6), [-0.27, -0.06, 0.06]), xf(G.cyl(0.05, 0.05, 0.012, 6), [-0.27, 0.09, 0.06])]);
      const sand = inst('#ffb43a');
      c.raw(spine, G.cone(0.028, 0.045, 5), sand, [-0.27, 0.052, 0.06]);
      c.mesh(headgear, 'c8_rp_hood', cloth, () => [dome(0.245, -0.05, 1.05, 1.1), xf(G.box(0.46, 0.3, 0.06), [0, -0.2, -0.22]), xf(G.box(0.05, 0.32, 0.16), [0.23, -0.18, 0.0]), xf(G.box(0.05, 0.32, 0.16), [-0.23, -0.18, 0.0])]);
      const eyes = inst('#ff2a2a');
      c.raw(headgear, G.box(0.05, 0.022, 0.01), eyes, [0.07, -0.17, 0.235]);
      c.raw(headgear, G.box(0.05, 0.022, 0.01), eyes, [-0.07, -0.17, 0.235]);
      c.anim((dt, t) => { const k = 0.55 + 0.45 * Math.sin(t * 2.2); eyes.color.setRGB(1, 0.16 * k, 0.16 * k); sand.color.setHSL(0.1, 1, 0.45 + 0.15 * Math.sin(t * 3)); });
    },
  },
  chosen: {
    tint: '#e6e6ee', glove: '#f4f4fa', boot: '#d8d8e4', belt: '#c9c9d8', emissive: '#08080c', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c8_ch_skirt', flat('#e6e6ee'), () => [xf(G.cyl(0.29, 0.36, 0.3, 8, true), [0, -0.08, 0], [0, PI / 8, 0], [1, 1, 0.8])]);
      c.mesh(spine, 'c8_ch_mag', bas('#ff2fd0'), () => [xf(G.cyl(0.3, 0.3, 0.014, 8, true), [0, 0.06, 0], [0, PI / 8, 0], [1, 1, 0.8]), xf(G.box(0.014, 0.4, 0.008), [0.12, 0.26, 0.174]), xf(G.box(0.014, 0.4, 0.008), [-0.12, 0.26, 0.174])]);
      c.mesh(spine, 'c8_ch_cy', bas('#35e6ff'), () => [xf(G.cyl(0.36, 0.36, 0.012, 8, true), [0, -0.22, 0], [0, PI / 8, 0], [1, 1, 0.8]), ring(0.46, 0.012, 0.018)]);
      c.mesh(spine, 'c8_ch_sigil', bas('#ff2fd0'), () => [xf(G.tor(0.05, 0.008, 3, 12), [0, 0.3, 0.186], [0, 0, 0], [1, 0.55, 1]), xf(G.sph(0.016, 5, 4), [0, 0.3, 0.19])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'c8_ch_pad', flat('#f4f4fa'), () => [xf(G.sph(0.115, 7, 4, 0, TAU, 0, PI / 2), [0, 0.05, 0], [0, 0, 0], [1, 0.7, 1])]);
        c.mesh(arm.el, 'c8_ch_cuff', bas('#35e6ff'), () => [limbRing(0.078, 0.014, -0.2)]);
      }
      const halo = c.group(headgear, [0, 0.14, 0]);
      const h1 = mk(halo, G.tor(0.21, 0.014, 3, 16), inst('#35e6ff'), [0, 0, 0], [PI / 2, 0, 0]);
      const h2 = mk(halo, G.tor(0.17, 0.01, 3, 16), inst('#ff2fd0'), [0, 0.02, 0], [PI / 2, 0, 0]);
      c.anim((dt, t) => { h1.rotation.z = t * 1.6; h2.rotation.z = -t * 2.4; halo.position.y = 0.14 + Math.sin(t * 1.5) * 0.015; halo.rotation.x = Math.sin(t * 0.9) * 0.08; });
    },
  },
};

// =====================================================================================================================
// BACK ITEMS (attach to rig.backpack; hidden by the first-person body)
// =====================================================================================================================
export const C8_BACK_HIDES = ['battpack', 'parachute', 'fieldradio', 'holoscreen'];
export const C8_BACKS = {
  lootsack(c, rig) {
    const p = c.group(rig.backpack, [0, 0.02, -0.19]);
    c.mesh(p, 'c8_ls_sack', flat('#b39461'), () => [xf(G.sph(0.19, 8, 6), [0, -0.02, 0], [0, 0, 0], [1, 1.15, 0.85]), xf(G.cone(0.08, 0.12, 6), [0, 0.24, 0])]);
    c.mesh(p, 'c8_ls_rope', flat('#5a4028'), () => [xf(G.tor(0.07, 0.014, 3, 8), [0, 0.19, 0], [PI / 2, 0, 0])]);
    c.mesh(p, 'c8_ls_patch', flat('#7a5e34'), () => [xf(G.box(0.12, 0.12, 0.01), [0.05, -0.05, -0.16], [0, 0.15, 0.2])]);
    c.mesh(p, 'c8_ls_coin', bas('#f2c33a'), () => [xf(G.cyl(0.03, 0.03, 0.008, 8), [0.03, 0.28, 0.02], [0.4, 0, 0.3]), xf(G.cyl(0.03, 0.03, 0.008, 8), [-0.04, 0.26, -0.02], [0.2, 0, -0.5])]);
    c.anim((dt, t, a) => { const sp = speedOf(a); p.rotation.z = Math.sin(t * 6) * 0.1 * sp + Math.sin(t * 1.2) * 0.02; p.position.y = 0.02 + Math.abs(Math.sin(t * 6)) * 0.02 * sp; });
  },
  fieldradio(c, rig) {
    const p = c.group(rig.backpack, [0, 0.0, -0.16]);
    c.mesh(p, 'c8_fr_body', flat('#5a6238'), () => [xf(G.box(0.3, 0.38, 0.14), [0, 0, 0]), xf(G.box(0.16, 0.06, 0.03), [0, 0.22, 0.02])]);
    c.mesh(p, 'c8_fr_grille', flat('#2a2e1a'), () => [0, 1, 2, 3].map((i) => xf(G.box(0.2, 0.014, 0.01), [0, 0.1 - i * 0.04, -0.076])));
    c.mesh(p, 'c8_fr_knobs', flat('#1a1a1a'), () => [xf(G.cyl(0.03, 0.03, 0.03, 6), [0.08, -0.1, -0.08], [PI / 2, 0, 0]), xf(G.cyl(0.03, 0.03, 0.03, 6), [-0.08, -0.1, -0.08], [PI / 2, 0, 0])]);
    const led = inst('#3dff7a');
    mk(p, G.box(0.03, 0.03, 0.01), led, [0.1, 0.16, -0.078]);
    const ant = c.group(p, [0.11, 0.19, 0]);
    c.mesh(ant, 'c8_fr_ant', flat('#b8bcc2'), () => [xf(G.cyl(0.006, 0.01, 0.6, 4), [0, 0.3, 0]), xf(G.sph(0.014, 4, 3), [0, 0.6, 0])]);
    c.anim((dt, t, a) => { const sp = speedOf(a); ant.rotation.z = -0.1 - Math.sin(t * 6) * 0.1 * sp; ant.rotation.x = -0.1 - sp * 0.3; led.color.setHex(Math.sin(t * 3) > 0.3 ? 0x3dff7a : 0x0f4a26); });
  },
  camarm(c, rig) {
    const p = c.group(rig.backpack, [0, 0.0, -0.13]);
    c.mesh(p, 'c8_ca_base', flat('#2a2d33'), () => [xf(G.box(0.18, 0.22, 0.08), [0, 0, 0]), xf(G.cyl(0.014, 0.014, 0.62, 5), [0.09, 0.3, -0.02]), xf(G.cyl(0.012, 0.012, 0.3, 5), [0.16, 0.6, 0.1], [PI / 2, 0, 0.2])]);
    const cam = c.group(p, [0.17, 0.62, 0.26]);
    c.mesh(cam, 'c8_ca_body', flat('#3a3e46'), () => [xf(G.box(0.1, 0.075, 0.13), [0, 0, 0])]);
    c.mesh(cam, 'c8_ca_lens', flat('#0c0c0e'), () => [xf(G.cyl(0.032, 0.036, 0.05, 8), [0, 0, 0.09], [PI / 2, 0, 0])]);
    const rec = inst('#ff2a2a');
    mk(cam, G.sph(0.012, 5, 4), rec, [0.035, 0.046, 0.04]);
    c.anim((dt, t, a) => { cam.rotation.y = Math.sin(t * 0.8) * 0.25 + PI; cam.rotation.x = Math.sin(t * 1.1) * 0.05 + speedOf(a) * 0.1; rec.color.setHex(Math.sin(t * 4) > -0.1 ? 0xff2a2a : 0x3a0b0b); });
  },
  battpack(c, rig) {
    const p = c.group(rig.backpack, [0, 0.0, -0.15]);
    c.mesh(p, 'c8_bp_case', flat('#2b2f36'), () => [xf(G.box(0.34, 0.46, 0.16), [0, 0, 0])]);
    c.mesh(p, 'c8_bp_hazard', flat('#f2c33a'), () => [xf(G.box(0.35, 0.04, 0.165), [0, 0.2, 0]), xf(G.box(0.35, 0.04, 0.165), [0, -0.2, 0])]);
    c.mesh(p, 'c8_bp_term', flat('#b8bcc2'), () => [xf(G.cyl(0.024, 0.024, 0.05, 6), [0.09, 0.26, 0]), xf(G.cyl(0.024, 0.024, 0.05, 6), [-0.09, 0.26, 0])]);
    const cells = [0, 1, 2, 3, 4, 5].map((i) => mk(p, G.box(0.08, 0.06, 0.01), inst('#3dff7a'), [-0.095 + (i % 3) * 0.095, 0.06 - Math.floor(i / 3) * 0.09, -0.085]));
    c.anim((dt, t, a) => { const lit = 2 + Math.floor((0.5 + 0.5 * Math.sin(t * 0.7)) * 4.99); cells.forEach((m, i) => m.material.color.setHex(i < lit ? (i > 3 ? 0xffb43a : 0x3dff7a) : 0x123a20)); });
  },
  parachute(c, rig) {
    const p = c.group(rig.backpack, [0, 0.0, -0.15]);
    c.mesh(p, 'c8_pc_pack', flat('#d8642a'), () => [xf(G.box(0.36, 0.44, 0.18), [0, 0, 0]), xf(G.box(0.37, 0.05, 0.19), [0, 0.1, 0])]);
    c.mesh(p, 'c8_pc_strap', flat('#2a2a2e'), () => [xf(G.box(0.03, 0.44, 0.19), [0.1, 0, 0]), xf(G.box(0.03, 0.44, 0.19), [-0.1, 0, 0])]);
    c.mesh(p, 'c8_pc_tag', flat('#f4f0e2'), () => [xf(G.box(0.1, 0.05, 0.006), [0, -0.1, -0.094])]);
    const cord = c.group(p, [0.14, -0.05, -0.1]);
    c.mesh(cord, 'c8_pc_ring', flat('#c0281f'), () => [xf(G.tor(0.035, 0.008, 3, 8), [0, -0.05, 0]), xf(G.cyl(0.004, 0.004, 0.05, 3), [0, -0.01, 0])]);
    c.anim((dt, t, a) => { const sp = speedOf(a); cord.rotation.z = Math.sin(t * 5) * 0.4 * sp + Math.sin(t * 1.3) * 0.05; cord.rotation.x = -sp * 0.4; });
  },
  holoscreen(c, rig) {
    const p = c.group(rig.backpack, [0, 0.08, -0.18]);
    c.mesh(p, 'c8_hs_frame', flat('#22252c'), () => [xf(G.box(0.44, 0.03, 0.03), [0, 0.2, 0]), xf(G.box(0.44, 0.03, 0.03), [0, -0.2, 0]), xf(G.box(0.03, 0.4, 0.03), [0.22, 0, 0]), xf(G.box(0.03, 0.4, 0.03), [-0.22, 0, 0]), xf(G.box(0.05, 0.24, 0.1), [0, -0.05, 0.08])]);
    const scr = inst('#ff2fd0', { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    mk(p, G.plane(0.4, 0.36), scr, [0, 0, 0]);
    const bar = mk(p, G.box(0.38, 0.03, 0.004), inst('#ffffff', { transparent: true, opacity: 0.6 }), [0, 0, 0.01]);
    const bars = [0, 1, 2].map((i) => mk(p, G.box(0.14 + i * 0.05, 0.035, 0.004), inst('#0a0a12', { transparent: true, opacity: 0.55 }), [-0.08, 0.1 - i * 0.08, 0.012]));
    c.anim((dt, t) => { scr.color.setHSL(((t * 0.12) % 1 + 0.85) % 1, 1, 0.55); bar.position.y = ((t * 0.5) % 1) * 0.36 - 0.18; bars.forEach((b, i) => { b.visible = Math.sin(t * 0.8 + i * 2) > -0.3; }); });
  },
};

// =====================================================================================================================
// HATS
// =====================================================================================================================
export const C8_HATS = {
  headset(g, add) {
    add('a', flat('#1a1c22'), () => [xf(G.tor(0.215, 0.014, 4, 12, PI), [0, -0.2, 0]), xf(G.cyl(0.06, 0.06, 0.05, 8), [0.225, -0.2, 0], [0, 0, PI / 2]), xf(G.cyl(0.06, 0.06, 0.05, 8), [-0.225, -0.2, 0], [0, 0, PI / 2])]);
    add('b', flat('#3a3e48'), () => [xf(G.cyl(0.05, 0.05, 0.03, 8), [0.24, -0.2, 0], [0, 0, PI / 2]), xf(G.cyl(0.05, 0.05, 0.03, 8), [-0.24, -0.2, 0], [0, 0, PI / 2]), xf(G.cyl(0.006, 0.006, 0.26, 4), [-0.22, -0.3, 0.12], [1.1, 0, 0.35])]);
    add('c', flat('#2a6fdc'), () => [xf(G.sph(0.02, 5, 4), [-0.15, -0.36, 0.23])]);
  },
  trafficcone(g, add) {
    add('a', flat('#ee6a1a'), () => [xf(G.cone(0.15, 0.38, 8), [0, 0.15, 0]), xf(G.box(0.34, 0.03, 0.34), [0, -0.03, 0])]);
    add('b', flat('#f4f0e2'), () => [xf(G.cyl(0.085, 0.11, 0.08, 8), [0, 0.13, 0])]);
  },
  antenna(g, add) {
    add('a', flat('#4a4e58'), () => [xf(G.cyl(0.07, 0.09, 0.04, 8), [0, 0.0, 0]), xf(G.cyl(0.008, 0.008, 0.4, 4), [0, 0.22, 0]), xf(G.cyl(0.05, 0.05, 0.008, 8), [0, 0.15, 0]), xf(G.cyl(0.035, 0.035, 0.008, 8), [0, 0.25, 0])]);
    const tip = inst('#ff3a3a'); const b = mk(g, G.sph(0.024, 6, 4), tip, [0, 0.43, 0]);
    tick(b, (t) => tip.color.setHex(Math.sin(t * 4) > 0 ? 0xff3a3a : 0x4a1010));
  },
  nightcap(g, add) {
    add('a', flat('#3a4a9a'), () => [dome(0.21, -0.05, 0.9, 1.05), xf(G.cone(0.17, 0.4, 8), [0.06, 0.12, -0.1], [-0.5, 0, -0.25])]);
    add('b', flat('#f4f0e2'), () => [xf(G.cyl(0.215, 0.215, 0.045, 10, true), [0, -0.075, 0])]);
    const pom = mk(g, G.sph(0.05, 6, 5), flat('#f4f0e2'), [0.19, 0.24, -0.4]);
    tick(pom, (t) => { pom.position.y = 0.24 + Math.sin(t * 1.4) * 0.02; });
  },
  livesign(g, add) {
    add('a', flat('#15161a'), () => [xf(G.box(0.36, 0.11, 0.04), [0, 0.3, 0]), xf(G.cyl(0.008, 0.008, 0.22, 4), [0.12, 0.15, 0]), xf(G.cyl(0.008, 0.008, 0.22, 4), [-0.12, 0.15, 0]), xf(G.cyl(0.13, 0.15, 0.03, 8), [0, 0.0, 0])]);
    add('b', bas('#ff2a2a'), () => [xf(G.box(0.05, 0.05, 0.005), [-0.11, 0.3, 0.023]), xf(G.box(0.03, 0.05, 0.005), [-0.03, 0.3, 0.023]), xf(G.box(0.05, 0.012, 0.005), [0.05, 0.325, 0.023]), xf(G.box(0.05, 0.012, 0.005), [0.05, 0.275, 0.023]), xf(G.box(0.012, 0.05, 0.005), [0.03, 0.3, 0.023])]);
    const dot = inst('#ff2a2a'); const d = mk(g, G.sph(0.018, 5, 4), dot, [0.13, 0.3, 0.025]);
    tick(d, (t) => dot.color.setHex(Math.sin(t * 5) > -0.1 ? 0xff2a2a : 0x3a0b0b));
  },
  spotlight(g, add) {
    add('a', flat('#2a2d33'), () => [xf(G.box(0.16, 0.11, 0.14), [0, 0.42, 0]), xf(G.cyl(0.012, 0.012, 0.3, 4), [0.06, 0.24, 0]), xf(G.cyl(0.012, 0.012, 0.3, 4), [-0.06, 0.24, 0]), xf(G.cyl(0.13, 0.15, 0.03, 8), [0, 0.0, 0])]);
    add('b', bas('#fff2b0'), () => [xf(G.cyl(0.06, 0.06, 0.02, 8), [0, 0.36, 0])]);
    const beam = mk(g, G.cone(0.3, 0.6, 10, true), inst('#fff2b0', { transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), [0, 0.06, 0], [PI, 0, 0]);
    tick(beam, (t) => { beam.material.opacity = 0.12 + Math.sin(t * 2) * 0.02; });
  },
  watcheye(g, add) {
    const eye = new THREE.Group(); eye.position.set(0, 0.34, 0); g.add(eye);
    const ball = mk(eye, G.sph(0.11, 10, 8), flat('#f4f0e2'), [0, 0, 0]);
    mk(eye, G.tor(0.11, 0.006, 3, 10, PI), flat('#c0281f'), [0, 0, 0], [0, 0, PI]);
    const iris = mk(eye, G.cyl(0.05, 0.05, 0.01, 10), inst('#2a8ae0'), [0, 0, 0.105], [PI / 2, 0, 0]);
    const pupil = mk(eye, G.cyl(0.024, 0.024, 0.012, 8), inst('#0a0a0e'), [0, 0, 0.108], [PI / 2, 0, 0]);
    add('a', flat('#8a8e94'), () => [xf(G.cyl(0.06, 0.08, 0.03, 8), [0, 0.0, 0]), xf(G.cyl(0.006, 0.006, 0.16, 4), [0, 0.12, 0])]);
    tick(ball, (t) => {
      const ox = Math.sin(Math.sin(t * 0.9) * 0.6) * 0.1, oy = Math.sin(Math.sin(t * 1.7 + 1) * 0.3) * 0.1;
      iris.position.set(ox, oy, 0.105 - Math.abs(ox) * 0.3); pupil.position.set(ox * 1.03, oy * 1.03, 0.108 - Math.abs(ox) * 0.3);
      eye.position.y = 0.34 + Math.sin(t * 1.3) * 0.015;
    });
  },
  trendcrown(g, add) {
    add('a', flat('#e8b82a'), () => [xf(G.cyl(0.2, 0.19, 0.08, 10, true), [0, 0.02, 0]), ...[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = (i / 7) * TAU; return xf(G.cone(0.035, 0.2 + (i % 2) * 0.05, 4), [Math.cos(a) * 0.195, 0.16, Math.sin(a) * 0.195]); })]);
    const mat = inst('#ff2fd0');
    add('b', mat, () => [0, 1, 2, 3, 4, 5, 6].map((i) => { const a = (i / 7) * TAU; return xf(G.cone(0.02, 0.05, 3), [Math.cos(a) * 0.195, 0.29 + (i % 2) * 0.05, Math.sin(a) * 0.195]); }));
    const glow = mk(g, G.tor(0.2, 0.008, 3, 14), inst('#35e6ff'), [0, 0.0, 0], [PI / 2, 0, 0]);
    tick(glow, (t) => { mat.color.setHSL((t * 0.25) % 1, 1, 0.6); glow.material.color.setHSL((t * 0.25 + 0.5) % 1, 1, 0.55); });
  },
};
