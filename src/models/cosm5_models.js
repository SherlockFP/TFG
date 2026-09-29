// cosm5 (wave 4) - procedural three.js models for the cosmetics drop: 14 suits, 19 hats / head items, 10 back items.
// Same contracts as models/cosmetics.js + cosmetics_wave3.js:
//   SUIT builder  { tint, glove, boot, belt, emissive, hide, scale, visor, eye, build(c, headgear) }  (c = look-controller ctx)
//   BACK builder  (c, rig) => void   attaches to rig.backpack (hidden by the first-person body, so it never clips the FP camera)
//   HAT builder   (id) => THREE.Group  hangs on the head hatSlot (hidden in first person as well)
// Merged geometry + cached materials; the few animated pieces use tiny per-instance Basic materials and Mesh.onBeforeRender
// (no update hook is needed for hats). NO gameplay stats. Node-safe (no DOM access at import time).
import * as THREE from 'three';
import { G, xf, merged, lam, bas, mk, pv, clamp, PI, TAU } from './modelkit.js';
import { C5, bySlot } from '../game/cosm5_data.js';

const flat = (c) => lam(c);
const glow = (c, e) => lam(c, { emissive: e });
const ghost = (c, o = 0.3) => lam(c, { transparent: true, opacity: o, depthWrite: false });
const rT = (y) => 0.22 + 0.06 * y;
const ring = (y, h, grow = 0.012) => xf(G.cyl(rT(y + h / 2) + grow, rT(y - h / 2) + grow, h, 8, true), [0, y, 0], [0, PI / 8, 0], [1, 1, 0.665]);
const limbRing = (r, h, y, s = 6) => xf(G.cyl(r, r, h, s, true), [0, y, 0]);
const dome = (r, y, sy = 0.85, sz = 1.05) => xf(G.sph(r, 9, 5, 0, TAU, 0, PI / 2), [0, y, 0], [0, 0, 0], [1, sy, sz]);
const clock = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
const speedOf = (a) => clamp((a?.speed || 0) / 4, 0, 1);
/** uncached Basic material (animated pieces: never shared, never tinted) */
const inst = (color, o = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...o }); m.userData.noTint = true; return m; };

// =====================================================================================================================
// glitch: a shared additive shell with a scrolling hue shift and block-shifted scanlines (real shader shimmer)
// =====================================================================================================================
const GLITCH_VS = `
uniform float uTime; varying vec3 vP; varying vec3 vN;
float h(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
void main() {
  vec3 p = position;
  float band = floor(p.y * 14.0 + uTime * 0.0);
  float k = step(0.86, h(band + floor(uTime * 9.0)));
  p.x += k * (h(band * 3.1 + floor(uTime * 9.0)) - 0.5) * 0.09;
  vP = p; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const GLITCH_FS = `
uniform float uTime; varying vec3 vP; varying vec3 vN;
float h(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
vec3 hue(float x) { return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float band = floor(vP.y * 22.0 + vP.x * 3.0);
  float on = step(0.72, h(band + floor(uTime * 7.0)));
  vec3 col = hue(fract(vP.y * 0.9 + vP.x * 0.5 + uTime * 0.35));
  float scan = 0.55 + 0.45 * sin(vP.y * 160.0 - uTime * 14.0);
  float rim = pow(1.0 - abs(vN.z), 1.6);
  vec3 c = col * (0.25 + 0.55 * scan) + vec3(1.0) * on * 0.7 + col * rim * 0.6;
  float a = 0.16 + 0.22 * rim + 0.5 * on;
  gl_FragColor = vec4(c, a);
}`;
let glitchMat = null;
export const glitchMaterial = () => glitchMat || (glitchMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } }, vertexShader: GLITCH_VS, fragmentShader: GLITCH_FS,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
}));

// =====================================================================================================================
// SUITS
// =====================================================================================================================
export const C5_SUIT_BUILDERS = {
  // ---------------------------------------------------------------- Night-Shift Janitor
  nightjan: {
    tint: '#5d6b74', glove: '#e8d23a', boot: '#23272b', belt: '#3a3026', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const refl = glow('#d9dd4a', '#44460e');
      c.mesh(spine, 'c5_nj_stripe', refl, () => [ring(0.2, 0.05, 0.016)]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c5_nj_armstripe', refl, () => [limbRing(0.078, 0.035, -0.12)]);
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_nj_legstripe', refl, () => [limbRing(0.093, 0.035, -0.16)]);
      // bucket + keys + spray bottle on the belt
      c.mesh(spine, 'c5_nj_bucket', flat('#2f7fc4'), () => [xf(G.cyl(0.085, 0.06, 0.13, 8), [0.29, -0.04, 0.03])]);
      c.mesh(spine, 'c5_nj_bhandle', flat('#b8bcc2'), () => [xf(G.tor(0.075, 0.006, 3, 8, PI), [0.29, 0.03, 0.03], [0, 0, 0])]);
      c.mesh(spine, 'c5_nj_bottle', flat('#e8f2f4'), () => [xf(G.cyl(0.025, 0.03, 0.12, 6), [-0.27, 0.02, 0.05]), xf(G.box(0.05, 0.03, 0.03), [-0.27, 0.1, 0.06])]);
      c.mesh(spine, 'c5_nj_keys', flat('#c9a83a'), () => [xf(G.tor(0.03, 0.006, 3, 8), [-0.14, 0.03, 0.175], [0, 0, 0]), xf(G.box(0.01, 0.05, 0.005), [-0.14, -0.03, 0.175])]);
      // work cap
      c.mesh(headgear, 'c5_nj_cap', flat('#2f7fc4'), () => [dome(0.2, -0.06, 0.55, 1.05), xf(G.box(0.3, 0.018, 0.13), [0, -0.035, 0.235], [0.12, 0, 0])]);
    },
  },
  // ---------------------------------------------------------------- Root Access Hoodie
  sysadmin: {
    tint: '#232a2c', glove: '#151a1c', boot: '#e8e8e2', belt: '#151a1c', emissive: '#020608', hide: ['belt', 'helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      c.mesh(spine, 'c5_sa_pocket', flat('#1a2022'), () => [xf(G.box(0.3, 0.13, 0.02), [0, 0.06, 0.168]), xf(G.cyl(0.29, 0.31, 0.09, 8, true), [0, -0.05, 0], [0, PI / 8, 0], [1, 1, 0.74])]);
      c.mesh(spine, 'c5_sa_cord', flat('#e8e4d8'), () => [xf(G.cyl(0.008, 0.008, 0.16, 4), [0.05, 0.42, 0.165]), xf(G.cyl(0.008, 0.008, 0.16, 4), [-0.05, 0.42, 0.165])]);
      // scrolling-code strip on the chest
      c.mesh(spine, 'c5_sa_code', bas('#3dff7a'), () => [0, 1, 2, 3, 4].map((i) => xf(G.box(0.04 + (i % 3) * 0.03, 0.012, 0.006), [-0.04 + (i % 2) * 0.05, 0.36 - i * 0.03, 0.172]))
        .concat([xf(G.box(0.012, 0.03, 0.006), [0.1, 0.3, 0.172])]));
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'c5_sa_sleeve', flat('#232a2c'), () => [xf(G.cyl(0.098, 0.115, 0.3, 7, true), [0, -0.17, 0])]);
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_sa_sock', flat('#3dff7a'), () => [limbRing(0.088, 0.03, -0.3)]);
      // coffee mug
      c.mesh(spine, 'c5_sa_mug', flat('#f4f4ee'), () => [xf(G.cyl(0.035, 0.03, 0.07, 8), [0.28, 0.02, 0.06]), xf(G.tor(0.025, 0.007, 3, 6, PI), [0.315, 0.02, 0.06], [0, 0, -PI / 2])]);
      c.mesh(headgear, 'c5_sa_hood', flat('#232a2c'), () => [dome(0.225, -0.05, 1.0, 1.12), xf(G.box(0.4, 0.3, 0.06), [0, -0.2, -0.2]), xf(G.box(0.05, 0.3, 0.12), [0.2, -0.16, 0.02]), xf(G.box(0.05, 0.3, 0.12), [-0.2, -0.16, 0.02])]);
    },
  },
  // ---------------------------------------------------------------- Hazmat Intern
  hazintern: {
    tint: '#f0f3f3', glove: '#3d8bff', boot: '#e9eded', belt: '#c9d0d0', hide: ['helmetbits', 'belt'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      c.mesh(spine, 'c5_hi_seams', flat('#c8d0d2'), () => [ring(0.32, 0.02, 0.014), ring(0.1, 0.02, 0.014), xf(G.box(0.012, 0.44, 0.01), [0, 0.28, 0.166])]);
      // INTERN sticker: yellow tag with fake print lines
      c.mesh(spine, 'c5_hi_tag', flat('#ffd23a'), () => [xf(G.box(0.16, 0.07, 0.01), [-0.1, 0.4, 0.17])]);
      c.mesh(spine, 'c5_hi_print', flat('#2a2a2a'), () => [xf(G.box(0.11, 0.012, 0.005), [-0.1, 0.42, 0.177]), xf(G.box(0.08, 0.012, 0.005), [-0.11, 0.39, 0.177])]);
      // clipboard
      c.mesh(spine, 'c5_hi_clip', flat('#8a5c34'), () => [xf(G.box(0.16, 0.2, 0.012), [0.24, 0.12, 0.14], [0.2, -0.5, 0])]);
      c.mesh(spine, 'c5_hi_paper', flat('#f6f6f0'), () => [xf(G.box(0.13, 0.17, 0.006), [0.24, 0.12, 0.148], [0.2, -0.5, 0])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c5_hi_tape', flat('#ffd23a'), () => [limbRing(0.076, 0.03, -0.2)]);
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_hi_tape2', flat('#ffd23a'), () => [limbRing(0.09, 0.03, -0.3)]);
      // oversized hood + cheek filters
      c.mesh(headgear, 'c5_hi_hood', flat('#f0f3f3'), () => [dome(0.235, -0.06, 1.0, 1.1), xf(G.box(0.42, 0.28, 0.06), [0, -0.2, -0.21]), xf(G.box(0.05, 0.3, 0.12), [0.21, -0.17, 0.01]), xf(G.box(0.05, 0.3, 0.12), [-0.21, -0.17, 0.01])]);
      c.mesh(headgear, 'c5_hi_filt', flat('#7a828a'), () => [xf(G.cyl(0.04, 0.04, 0.06, 8), [0.2, -0.27, 0.07], [0, 0, PI / 2]), xf(G.cyl(0.04, 0.04, 0.06, 8), [-0.2, -0.27, 0.07], [0, 0, PI / 2])]);
    },
  },
  // ---------------------------------------------------------------- Beekeeper
  beekeeper: {
    tint: '#e8e2cc', glove: '#c9b48a', boot: '#4a3a28', belt: '#5a4028', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c5_bk_belt', flat('#5a4028'), () => [ring(0.04, 0.06, 0.02)]);
      c.mesh(spine, 'c5_bk_smoker', flat('#8a8e94'), () => [xf(G.cyl(0.05, 0.055, 0.14, 8), [-0.28, 0.0, 0.03])]);
      c.mesh(spine, 'c5_bk_smokerlid', flat('#5a5e64'), () => [xf(G.cone(0.05, 0.07, 8), [-0.28, 0.1, 0.03]), xf(G.cyl(0.018, 0.018, 0.06, 5), [-0.28, 0.16, 0.03])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c5_bk_cuff', flat('#c9b48a'), () => [limbRing(0.079, 0.06, -0.19)]);
      // veil hat: wide brim + gauze cylinder that hangs around the visor
      c.mesh(headgear, 'c5_bk_hat', flat('#d8cfae'), () => [xf(G.cyl(0.13, 0.19, 0.11, 9), [0, -0.03, 0]), xf(G.cyl(0.34, 0.34, 0.016, 12), [0, -0.085, 0])]);
      c.mesh(headgear, 'c5_bk_veil', ghost('#f4f4ee', 0.28), () => [xf(G.cyl(0.3, 0.27, 0.42, 12, true), [0, -0.3, 0])]);
      // three bees that loop around the hat
      const orbit = c.group(headgear, [0, -0.05, 0]);
      const bee = ['c5_bk_b1', 'c5_bk_b2', 'c5_bk_b3'].map((k, i) => {
        const g = c.group(orbit, [0, 0, 0]);
        c.mesh(g, k, flat('#f5c62a'), () => [xf(G.sph(0.022, 5, 4), [0, 0, 0], [0, 0, 0], [1, 0.8, 1.4])]);
        c.mesh(g, k + 'w', ghost('#ffffff', 0.6), () => [xf(G.box(0.05, 0.004, 0.02), [0, 0.022, 0])]);
        return g;
      });
      c.anim((dt, t) => bee.forEach((g, i) => { const a = t * (1.6 + i * 0.5) + i * 2.1; g.position.set(Math.cos(a) * (0.36 + i * 0.03), 0.1 + Math.sin(t * 3 + i) * 0.06, Math.sin(a) * (0.36 + i * 0.03)); g.rotation.y = -a; }));
    },
  },
  // ---------------------------------------------------------------- Retro Astronaut
  retroastro: {
    tint: '#d4d7dc', glove: '#e8752a', boot: '#e8752a', belt: '#c04a1a', hide: ['backpack', 'helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR, backpack } = c.rig;
      c.mesh(spine, 'c5_ra_panel', flat('#2a2e34'), () => [xf(G.box(0.24, 0.16, 0.05), [0, 0.3, 0.17])]);
      c.mesh(spine, 'c5_ra_dials', bas('#ffb43a'), () => [xf(G.cyl(0.024, 0.024, 0.012, 8), [-0.06, 0.32, 0.2], [PI / 2, 0, 0]), xf(G.cyl(0.024, 0.024, 0.012, 8), [0.06, 0.32, 0.2], [PI / 2, 0, 0]), xf(G.box(0.1, 0.02, 0.01), [0, 0.26, 0.2])]);
      c.mesh(spine, 'c5_ra_stripe', flat('#e8752a'), () => [ring(0.12, 0.05, 0.014)]);
      c.mesh(spine, 'c5_ra_hose', flat('#e8752a'), () => [xf(G.tor(0.12, 0.014, 3, 10, PI), [0.1, 0.42, 0.06], [PI / 2, 0, 0]), xf(G.tor(0.12, 0.014, 3, 10, PI), [-0.1, 0.42, 0.06], [PI / 2, 0, 0])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'c5_ra_sh', flat('#e8752a'), () => [limbRing(0.085, 0.04, -0.03)]);
        c.mesh(arm.el, 'c5_ra_wr', flat('#9aa0a8'), () => [limbRing(0.07, 0.04, -0.22)]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_ra_kn', flat('#9aa0a8'), () => [limbRing(0.09, 0.05, -0.02)]);
      c.mesh(backpack, 'c5_ra_pack', flat('#d4d7dc'), () => [xf(G.box(0.34, 0.48, 0.18), [0, 0, -0.09]), xf(G.cyl(0.03, 0.03, 0.1, 6), [0.1, 0.22, -0.06], [PI / 2, 0, 0])]);
      c.mesh(backpack, 'c5_ra_packstripe', flat('#e8752a'), () => [xf(G.box(0.345, 0.05, 0.185), [0, 0.06, -0.09])]);
      // fishbowl helmet
      c.mesh(headgear, 'c5_ra_bowl', ghost('#bfe6ff', 0.2), () => [xf(G.sph(0.285, 10, 8), [0, -0.11, 0.01])]);
      c.mesh(headgear, 'c5_ra_neck', flat('#9aa0a8'), () => [xf(G.tor(0.22, 0.03, 4, 12), [0, -0.335, 0], [PI / 2, 0, 0])]);
    },
  },
  // ---------------------------------------------------------------- Neon Rider
  neonrider: {
    tint: '#15151b', glove: '#08080c', boot: '#08080c', belt: '#08080c', emissive: '#05040a', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const mag = bas('#ff2fd0'), cy = bas('#35e6ff'), leather = flat('#0d0d12');
      c.mesh(spine, 'c5_nr_lapel', leather, () => [xf(G.box(0.1, 0.28, 0.02), [0.1, 0.32, 0.165], [0, 0, 0.35]), xf(G.box(0.1, 0.28, 0.02), [-0.1, 0.32, 0.165], [0, 0, -0.35]), xf(G.cyl(0.17, 0.2, 0.06, 8), [0, 0.5, 0], [0, PI / 8, 0], [1, 1, 0.7])]);
      c.mesh(spine, 'c5_nr_neon', mag, () => [xf(G.box(0.014, 0.4, 0.008), [0.17, 0.26, 0.163], [0, 0, 0.08]), xf(G.box(0.014, 0.4, 0.008), [-0.17, 0.26, 0.163], [0, 0, -0.08]), ring(0.06, 0.014, 0.018)]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'c5_nr_pad', leather, () => [xf(G.sph(0.115, 7, 4, 0, TAU, 0, PI / 2), [0, 0.05, 0], [0, 0, 0], [1, 0.7, 1])]);
        c.mesh(arm.el, 'c5_nr_armneon', cy, () => [xf(G.box(0.01, 0.22, 0.01), [0, -0.11, 0.077]), limbRing(0.078, 0.012, -0.03)]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.knee, 'c5_nr_legneon', cy, () => [xf(G.box(0.01, 0.34, 0.01), [0.055, -0.18, 0.085]), limbRing(0.094, 0.012, -0.04)]);
        c.mesh(leg.knee, 'c5_nr_pad2', leather, () => [xf(G.sph(0.07, 6, 4), [0, 0.0, 0.075], [0, 0, 0], [1, 0.9, 0.6])]);
      }
      // open-face helmet: glossy dome, neon top stripe, rear fin
      c.mesh(headgear, 'c5_nr_helm', flat('#101016'), () => [dome(0.21, -0.06, 0.95, 1.07), xf(G.box(0.06, 0.1, 0.16), [0.2, -0.13, 0.0]), xf(G.box(0.06, 0.1, 0.16), [-0.2, -0.13, 0.0]), xf(G.box(0.26, 0.05, 0.1), [0, -0.09, -0.2], [0.3, 0, 0])]);
      c.mesh(headgear, 'c5_nr_stripe', mag, () => [xf(G.box(0.028, 0.012, 0.42), [0, 0.135, -0.01])]);
      c.mesh(headgear, 'c5_nr_ears', cy, () => [xf(G.cyl(0.03, 0.03, 0.012, 8), [0.235, -0.13, 0.0], [0, 0, PI / 2]), xf(G.cyl(0.03, 0.03, 0.012, 8), [-0.235, -0.13, 0.0], [0, 0, PI / 2])]);
    },
  },
  // ---------------------------------------------------------------- Brass Deep-Sea Diver
  brassdiver: {
    tint: '#2f5a5c', glove: '#3a3a30', boot: '#6a4c22', belt: '#3a2a1a', hide: ['helmetbits', 'backpack'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR, backpack } = c.rig;
      const brass = lam('#b8843a', { emissive: '#2a1a06' }), copper = lam('#a8642c', { emissive: '#241006' });
      c.mesh(spine, 'c5_bd_corselet', brass, () => [xf(G.cyl(0.19, 0.27, 0.22, 10, true), [0, 0.42, 0], [0, PI / 10, 0], [1, 1, 0.72]), xf(G.tor(0.23, 0.02, 4, 12), [0, 0.53, 0], [PI / 2, 0, 0], [1, 0.72, 1])]);
      c.mesh(spine, 'c5_bd_rivets', flat('#d8a858'), () => [-0.16, -0.08, 0, 0.08, 0.16].map((x) => xf(G.sph(0.016, 4, 3), [x, 0.5, 0.175])));
      c.mesh(spine, 'c5_bd_weights', flat('#3a3c40'), () => [xf(G.box(0.1, 0.09, 0.05), [0.14, 0.06, 0.18]), xf(G.box(0.1, 0.09, 0.05), [-0.14, 0.06, 0.18])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c5_bd_cuff', brass, () => [limbRing(0.08, 0.06, -0.2)]);
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_bd_boot', copper, () => [xf(G.cyl(0.1, 0.115, 0.14, 8), [0, -0.33, 0.02])]);
      c.mesh(backpack, 'c5_bd_pump', copper, () => [xf(G.cyl(0.09, 0.09, 0.3, 8), [0, 0, -0.12]), xf(G.sph(0.06, 6, 4), [0, 0.18, -0.12])]);
      // copper helmet (open on the visor side) with brass window ring and side portholes
      c.mesh(headgear, 'c5_bd_helm', copper, () => [xf(G.sph(0.275, 10, 8, 2.44, 4.54), [0, -0.1, 0])]);
      c.mesh(headgear, 'c5_bd_ring', brass, () => [xf(G.tor(0.21, 0.022, 4, 14), [0, -0.1, 0.17])]);
      c.mesh(headgear, 'c5_bd_port', flat('#1a2a34'), () => [xf(G.cyl(0.05, 0.05, 0.02, 8), [0.265, -0.1, 0.0], [0, 0, PI / 2]), xf(G.cyl(0.05, 0.05, 0.02, 8), [-0.265, -0.1, 0.0], [0, 0, PI / 2])]);
      c.mesh(headgear, 'c5_bd_portring', brass, () => [xf(G.tor(0.052, 0.012, 3, 8), [0.272, -0.1, 0.0], [0, PI / 2, 0]), xf(G.tor(0.052, 0.012, 3, 8), [-0.272, -0.1, 0.0], [0, PI / 2, 0])]);
      c.mesh(headgear, 'c5_bd_valve', brass, () => [xf(G.cyl(0.03, 0.03, 0.06, 6), [0, 0.14, -0.2], [0.6, 0, 0])]);
    },
  },
  // ---------------------------------------------------------------- Spam Mascot (foam can costume)
  mascot: {
    tint: '#ff8fb8', glove: '#f6f6f6', boot: '#ff5f9a', belt: '#ff5f9a', scale: [1.3, 1.02, 1.3], hide: ['belt', 'backpack', 'helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c5_ms_label', flat('#f6f0e6'), () => [ring(0.22, 0.13, 0.03)]);
      c.mesh(spine, 'c5_ms_band', flat('#d92b3a'), () => [ring(0.32, 0.03, 0.034), ring(0.12, 0.03, 0.034)]);
      // the smile is load-bearing
      c.mesh(spine, 'c5_ms_smile', bas('#3a1224'), () => [xf(G.tor(0.09, 0.012, 3, 10, PI), [0, 0.2, 0.196], [0, 0, PI], [1.1, 0.8, 0.4])]);
      c.mesh(spine, 'c5_ms_eyes', bas('#3a1224'), () => [xf(G.sph(0.018, 5, 4), [0.06, 0.29, 0.198], [0, 0, 0], [1, 1.6, 0.4]), xf(G.sph(0.018, 5, 4), [-0.06, 0.29, 0.198], [0, 0, 0], [1, 1.6, 0.4])]);
      c.mesh(spine, 'c5_ms_cheeks', flat('#ff5f9a'), () => [xf(G.sph(0.03, 5, 4), [0.13, 0.24, 0.192], [0, 0, 0], [1, 0.7, 0.4]), xf(G.sph(0.03, 5, 4), [-0.13, 0.24, 0.192], [0, 0, 0], [1, 0.7, 0.4])]);
      c.mesh(spine, 'c5_ms_rim', flat('#c9ccd2'), () => [xf(G.cyl(0.25, 0.25, 0.03, 10), [0, 0.47, 0], [0, 0, 0], [1, 1, 0.72])]);
      c.mesh(spine, 'c5_ms_tab', flat('#c9ccd2'), () => [xf(G.tor(0.04, 0.008, 3, 8), [0, 0.5, 0.15], [PI / 2, 0, 0]), xf(G.box(0.05, 0.008, 0.06), [0, 0.49, 0.1])]);
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'c5_ms_sleeve', flat('#ff8fb8'), () => [xf(G.sph(0.11, 6, 5), [0, -0.03, 0], [0, 0, 0], [1, 1.2, 1])]);
      void headgear;
    },
  },
  // ---------------------------------------------------------------- Samurai Salaryman
  samsalary: {
    tint: '#16171d', glove: '#ececec', boot: '#0a0a0c', belt: '#0a0a0c', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      c.mesh(spine, 'c5_ss_shirt', flat('#f4f4f2'), () => [xf(G.box(0.12, 0.34, 0.012), [0, 0.3, 0.158])]);
      c.mesh(spine, 'c5_ss_tie', flat('#b01a24'), () => [xf(G.box(0.03, 0.3, 0.014), [0, 0.3, 0.166]), xf(G.box(0.05, 0.04, 0.02), [0, 0.46, 0.165])]);
      // kamishimo shoulder wings + pleated hakama skirt
      c.mesh(spine, 'c5_ss_wings', flat('#101116'), () => [xf(G.box(0.26, 0.03, 0.2), [0.3, 0.5, 0], [0, 0, -0.3]), xf(G.box(0.26, 0.03, 0.2), [-0.3, 0.5, 0], [0, 0, 0.3])]);
      c.mesh(spine, 'c5_ss_hakama', flat('#3a3d48'), () => [xf(G.cyl(0.27, 0.42, 0.44, 10, true), [0, -0.2, 0], [0, PI / 10, 0], [1, 1, 0.78]), xf(G.cyl(0.29, 0.3, 0.05, 10, true), [0, 0.02, 0], [0, PI / 10, 0], [1, 1, 0.78])]);
      c.mesh(spine, 'c5_ss_pleats', flat('#22242c'), () => [-0.15, -0.05, 0.05, 0.15].map((x) => xf(G.box(0.012, 0.36, 0.01), [x, -0.2, 0.22 + Math.abs(x) * 0.1])));
      // katana at the hip
      c.mesh(spine, 'c5_ss_saya', flat('#0e0e12'), () => [xf(G.cyl(0.02, 0.02, 0.62, 5), [-0.3, -0.12, 0.08], [0.15, 0, 1.15])]);
      c.mesh(spine, 'c5_ss_tsuba', flat('#d8b048'), () => [xf(G.cyl(0.04, 0.04, 0.012, 8), [-0.155, 0.13, 0.11], [0.15, 0, 1.15 + PI / 2])]);
      c.mesh(spine, 'c5_ss_tsuka', flat('#7a1a20'), () => [xf(G.cyl(0.017, 0.017, 0.13, 5), [-0.11, 0.175, 0.115], [0.15, 0, 1.15])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'c5_ss_cuff', flat('#f4f4f2'), () => [limbRing(0.078, 0.02, -0.235)]);
      // topknot + headband
      c.mesh(headgear, 'c5_ss_knot', flat('#1a1620'), () => [xf(G.sph(0.06, 6, 4), [0, 0.07, -0.13]), xf(G.cyl(0.02, 0.03, 0.09, 5), [0, 0.02, -0.16], [0.9, 0, 0])]);
      c.mesh(headgear, 'c5_ss_band', flat('#f4f4f2'), () => [xf(G.tor(0.19, 0.016, 3, 12), [0, -0.055, 0], [PI / 2, 0, 0])]);
      c.mesh(headgear, 'c5_ss_sun', flat('#d92b3a'), () => [xf(G.cyl(0.03, 0.03, 0.01, 8), [0, -0.05, 0.19], [PI / 2, 0, 0])]);
    },
  },
  // ---------------------------------------------------------------- Knight of the Help Desk
  helpknight: {
    tint: '#8f96a0', glove: '#5a606a', boot: '#4a505a', belt: '#5a4020', hide: ['helmetbits', 'belt'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const steel = lam('#b0b6c0', { emissive: '#181a1e' });
      c.mesh(spine, 'c5_hk_mail', flat('#7f8690'), () => [xf(G.cyl(0.24, 0.31, 0.26, 8, true), [0, -0.1, 0], [0, PI / 8, 0], [1, 1, 0.74])]);
      c.mesh(spine, 'c5_hk_tabard', flat('#2a56c9'), () => [xf(G.box(0.27, 0.56, 0.02), [0, 0.1, 0.2]), xf(G.box(0.25, 0.46, 0.02), [0, 0.06, -0.2])]);
      c.mesh(spine, 'c5_hk_ticket', flat('#f4f4ee'), () => [xf(G.box(0.03, 0.14, 0.008), [-0.06, 0.2, 0.212]), xf(G.box(0.03, 0.14, 0.008), [0.0, 0.2, 0.212]), xf(G.box(0.03, 0.14, 0.008), [0.06, 0.2, 0.212]), xf(G.box(0.2, 0.025, 0.008), [0, 0.32, 0.212])]);
      c.mesh(spine, 'c5_hk_cord', flat('#1a1a20'), () => [xf(G.tor(0.11, 0.008, 3, 10, PI * 1.4), [0, 0.46, 0.06], [PI / 2, 0, 0])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'c5_hk_paul', steel, () => [xf(G.sph(0.13, 7, 4, 0, TAU, 0, PI / 2), [0, 0.05, 0], [0, 0, 0], [1, 0.7, 1])]);
        c.mesh(arm.el, 'c5_hk_vamb', flat('#5a606a'), () => [limbRing(0.08, 0.2, -0.12)]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_hk_greave', steel, () => [limbRing(0.094, 0.24, -0.14), xf(G.sph(0.065, 6, 4), [0, 0, 0.07], [0, 0, 0], [1, 0.9, 0.6])]);
      // chainmail coif with a nasal bar, a headset and a coiled-cable plume
      c.mesh(headgear, 'c5_hk_coif', flat('#8f96a0'), () => [dome(0.215, -0.06, 0.98, 1.08), xf(G.box(0.4, 0.26, 0.06), [0, -0.2, -0.2]), xf(G.box(0.05, 0.3, 0.14), [0.21, -0.17, 0.0]), xf(G.box(0.05, 0.3, 0.14), [-0.21, -0.17, 0.0])]);
      c.mesh(headgear, 'c5_hk_headset', flat('#15151a'), () => [xf(G.tor(0.2, 0.014, 3, 12, PI), [0, -0.06, 0], [0, PI / 2, PI / 2]), xf(G.box(0.045, 0.09, 0.07), [0.225, -0.17, 0.02]), xf(G.box(0.045, 0.09, 0.07), [-0.225, -0.17, 0.02]), xf(G.cyl(0.006, 0.006, 0.17, 4), [-0.2, -0.3, 0.1], [1.1, 0, 0.3]), xf(G.sph(0.018, 5, 4), [-0.19, -0.35, 0.18])]);
      c.mesh(headgear, 'c5_hk_plume', flat('#1a1a20'), () => [0, 1, 2, 3, 4].map((i) => xf(G.tor(0.06 - i * 0.004, 0.011, 3, 8), [0, 0.1 + i * 0.05, -0.02], [PI / 2, 0, 0])));
    },
  },
  // ---------------------------------------------------------------- Plague Accountant
  plagueacct: {
    tint: '#191a1c', glove: '#0c0c0e', boot: '#0c0c0e', belt: '#2a2018', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      const black = flat('#131416');
      c.mesh(spine, 'c5_pa_cloak', black, () => [xf(G.cyl(0.29, 0.4, 0.6, 9, true), [0, -0.22, 0], [0, PI / 9, 0], [1, 1, 0.78]), xf(G.cyl(0.2, 0.28, 0.14, 9, true), [0, 0.47, 0], [0, PI / 9, 0], [1, 1, 0.72])]);
      c.mesh(spine, 'c5_pa_ledger', flat('#1f6a3a'), () => [xf(G.box(0.2, 0.26, 0.05), [0.24, 0.02, 0.14], [0.1, -0.4, 0.2])]);
      c.mesh(spine, 'c5_pa_trim', flat('#d8b048'), () => [xf(G.box(0.205, 0.02, 0.055), [0.24, 0.14, 0.14], [0.1, -0.4, 0.2]), xf(G.box(0.205, 0.02, 0.055), [0.23, -0.1, 0.14], [0.1, -0.4, 0.2])]);
      c.mesh(spine, 'c5_pa_quill', flat('#e8e2d0'), () => [xf(G.cyl(0.004, 0.004, 0.24, 4), [0.3, 0.58, 0], [0, 0, -0.5]), xf(G.box(0.03, 0.14, 0.004), [0.36, 0.7, 0], [0, 0, -0.5])]);
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'c5_pa_sleeve', black, () => [xf(G.cyl(0.1, 0.13, 0.3, 7, true), [0, -0.18, 0])]);
      // wide leather hat + long beak below the screen + goggles rims
      c.mesh(headgear, 'c5_pa_hat', flat('#1a1614'), () => [xf(G.cyl(0.14, 0.18, 0.13, 9), [0, -0.02, 0]), xf(G.cyl(0.31, 0.31, 0.016, 12), [0, -0.085, 0])]);
      c.mesh(headgear, 'c5_pa_beak', flat('#d8d0b8'), () => [xf(G.cone(0.075, 0.42, 6), [0, -0.36, 0.24], [PI / 2 + 0.55, 0, 0])]);
      c.mesh(headgear, 'c5_pa_lens', flat('#8a1a1a'), () => [xf(G.tor(0.05, 0.01, 3, 8), [0.08, -0.06, 0.2], [0, 0, 0]), xf(G.tor(0.05, 0.01, 3, 8), [-0.08, -0.06, 0.2], [0, 0, 0])]);
    },
  },
  // ---------------------------------------------------------------- Algorithm Cultist Robe
  algocult: {
    tint: '#150c0e', glove: '#0c0708', boot: '#0c0708', belt: '#3a0c12', emissive: '#0a0204', hide: ['helmetbits', 'belt'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      const red = bas('#ff2a3a');
      c.mesh(spine, 'c5_ac_robe', flat('#170c0f'), () => [xf(G.cyl(0.3, 0.42, 0.66, 9, true), [0, -0.3, 0], [0, PI / 9, 0], [1, 1, 0.76]), xf(G.box(0.22, 0.34, 0.03), [0.09, 0.32, 0.165], [0, 0, 0.35]), xf(G.box(0.22, 0.34, 0.03), [-0.09, 0.32, 0.165], [0, 0, -0.35])]);
      c.mesh(spine, 'c5_ac_sigil', red, () => [xf(G.tor(0.085, 0.007, 3, 14), [0, 0.28, 0.176], [0, 0, 0]), xf(G.cone(0.07, 0.012, 3), [0, 0.28, 0.176], [PI / 2, 0, 0]), xf(G.sph(0.014, 4, 3), [0, 0.28, 0.18])]);
      c.mesh(spine, 'c5_ac_hem', red, () => [xf(G.cyl(0.418, 0.42, 0.012, 9, true), [0, -0.615, 0], [0, PI / 9, 0], [1, 1, 0.76])]);
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'c5_ac_sleeve', flat('#170c0f'), () => [xf(G.cyl(0.1, 0.15, 0.3, 7, true), [0, -0.18, 0]), xf(G.cyl(0.115, 0.17, 0.12, 7, true), [0, -0.34, 0])]);
      c.mesh(headgear, 'c5_ac_hood', flat('#170c0f'), () => [dome(0.23, -0.05, 1.05, 1.12), xf(G.box(0.4, 0.3, 0.06), [0, -0.2, -0.2]), xf(G.box(0.05, 0.3, 0.12), [0.2, -0.16, 0.02]), xf(G.box(0.05, 0.3, 0.12), [-0.2, -0.16, 0.02])]);
      c.mesh(headgear, 'c5_ac_trim', red, () => [xf(G.tor(0.205, 0.008, 3, 12, PI), [0, -0.075, 0.03], [PI / 2 - 0.4, 0, PI])]);
      // two red orbs circling the shoulders
      const orb = ['c5_ac_o1', 'c5_ac_o2'].map((k) => { const g = c.group(spine, [0, 0.62, 0]); c.mesh(g, k, red, () => [xf(G.sph(0.028, 5, 4))]); return g; });
      c.anim((dt, t) => orb.forEach((g, i) => { const a = t * 1.4 + i * PI; g.position.set(Math.cos(a) * 0.34, 0.6 + Math.sin(t * 2 + i) * 0.04, Math.sin(a) * 0.28); }));
    },
  },
  // ---------------------------------------------------------------- Glitch (animated shader shimmer)
  glitch: {
    tint: '#0d0f15', glove: '#07080b', boot: '#07080b', belt: '#07080b', emissive: '#03060a', hide: ['helmetbits', 'belt'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const M = glitchMaterial();
      c.raw(spine, cachedShell('torso', () => xf(G.cyl(rT(0.5) + 0.03, rT(0.0) + 0.03, 0.5, 8, true), [0, 0.25, 0], [0, PI / 8, 0], [1, 1, 0.665])), M);
      for (const arm of [armL, armR]) {
        c.raw(arm.sh, cachedShell('arm', () => xf(G.cyl(0.098, 0.088, 0.3, 7, true), [0, -0.15, 0])), M);
        c.raw(arm.el, cachedShell('fore', () => xf(G.cyl(0.088, 0.078, 0.26, 7, true), [0, -0.13, 0])), M);
      }
      for (const leg of [legL, legR]) {
        c.raw(leg.hip, cachedShell('thigh', () => xf(G.cyl(0.118, 0.1, 0.44, 7, true), [0, -0.22, 0])), M);
        c.raw(leg.knee, cachedShell('shin', () => xf(G.cyl(0.1, 0.09, 0.4, 7, true), [0, -0.2, 0])), M);
      }
      c.raw(headgear, cachedShell('head', () => xf(G.sph(0.215, 9, 6), [0, -0.1, -0.005])), M);
      c.anim((dt, t) => { M.uniforms.uTime.value = t; });
    },
  },
  // ---------------------------------------------------------------- Employee of the Year
  eoty: {
    tint: '#dfe3ea', glove: '#f4d24a', boot: '#f4d24a', belt: '#f4d24a', emissive: '#0c0e12', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const gold = lam('#f4d24a', { emissive: '#4a3a00' });
      c.mesh(spine, 'c5_eo_sash', gold, () => [xf(G.box(0.07, 0.62, 0.012), [0.02, 0.28, 0.17], [0, 0, 0.7]), xf(G.box(0.07, 0.62, 0.012), [-0.02, 0.28, -0.17], [0, 0, -0.7])]);
      c.mesh(spine, 'c5_eo_medal', gold, () => [xf(G.cyl(0.04, 0.04, 0.012, 10), [-0.12, 0.22, 0.176], [PI / 2, 0, 0]), xf(G.box(0.025, 0.06, 0.008), [-0.12, 0.29, 0.174])]);
      c.mesh(spine, 'c5_eo_plate', flat('#c8ced8'), () => [xf(G.cyl(0.18, 0.2, 0.07, 8), [0, 0.52, 0], [0, PI / 8, 0], [1, 1, 0.7]), ring(0.1, 0.04, 0.02)]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'c5_eo_epaulette', gold, () => [xf(G.cyl(0.11, 0.11, 0.03, 8), [0, 0.06, 0]), xf(G.box(0.14, 0.09, 0.012), [0, -0.02, 0.09])]);
        c.mesh(arm.el, 'c5_eo_cuff', gold, () => [limbRing(0.078, 0.03, -0.235)]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'c5_eo_stripe', gold, () => [xf(G.box(0.012, 0.36, 0.02), [0, -0.19, 0.09])]);
      c.mesh(headgear, 'c5_eo_pin', gold, () => [xf(G.cyl(0.028, 0.028, 0.01, 8), [0.14, -0.03, 0.15], [PI / 2, 0, 0])]);
      const sp = ['c5_eo_s1', 'c5_eo_s2', 'c5_eo_s3'].map((k) => { const m = c.mesh(spine, k, bas('#fff6c0'), () => [xf(G.oct(0.02))]); return m; });
      c.anim((dt, t) => {
        sp.forEach((m, i) => { const a = t * 0.9 + i * 2.1; m.position.set(Math.cos(a) * 0.38, 0.1 + i * 0.16 + Math.sin(t * 2 + i) * 0.03, Math.sin(a) * 0.3); const s = 0.6 + 0.6 * Math.abs(Math.sin(t * 3 + i * 1.7)); m.scale.setScalar(s); m.rotation.y = t * 2; });
        const e = 0.05 + 0.05 * Math.sin(t * 1.6), sm = c.rig.suitMat;
        if (sm?.emissive) { sm.emissive.setRGB(e, e, e * 1.1); sm.userData.baseEmissive?.setRGB(e, e, e * 1.1); }
      });
    },
  },
};
/** cached, shared geometry for the glitch shell pieces */
const shellCache = new Map();
function cachedShell(key, fn) { let g = shellCache.get(key); if (!g) { g = fn(); shellCache.set(key, g); } return g; }

// =====================================================================================================================
// BACK ITEMS (attach to rig.backpack; the stock pack is hidden for the big ones)
// =====================================================================================================================
export const C5_BACK_HIDES = ['jetpack', 'server', 'wings', 'dish'];
export const C5_BACK_BUILDERS = {
  lunchbox(c, rig) {
    const p = c.group(rig.backpack, [0, -0.02, -0.19]);
    c.mesh(p, 'c5_lb_box', flat('#d0342c'), () => [xf(G.box(0.26, 0.19, 0.08), [0, 0, 0])]);
    c.mesh(p, 'c5_lb_trim', flat('#f0efe8'), () => [xf(G.box(0.27, 0.02, 0.085), [0, 0.03, 0]), xf(G.box(0.03, 0.04, 0.09), [0, 0.09, 0])]);
    c.mesh(p, 'c5_lb_handle', flat('#2a2a2e'), () => [xf(G.tor(0.07, 0.008, 3, 8, PI), [0, 0.095, 0], [0, 0, 0])]);
    c.mesh(p, 'c5_lb_thermos', flat('#3a7ac8'), () => [xf(G.cyl(0.04, 0.04, 0.2, 8), [0.17, -0.02, 0.0]), xf(G.cyl(0.042, 0.042, 0.04, 8), [0.17, 0.11, 0.0])]);
    c.anim((dt, t, a) => { p.rotation.z = Math.sin(t * 6) * 0.05 * speedOf(a); });
  },
  cape(c, rig) {
    const top = c.group(rig.backpack, [0, 0.2, -0.14]);
    const low = c.group(top, [0, -0.36, -0.004]);
    c.mesh(top, 'c5_cp_top', flat('#b3202a'), () => [xf(G.box(0.4, 0.36, 0.014), [0, -0.18, 0])]);
    c.mesh(low, 'c5_cp_low', flat('#8f1820'), () => [xf(G.box(0.46, 0.36, 0.014), [0, -0.18, 0])]);
    c.mesh(top, 'c5_cp_clasp', flat('#d8b048'), () => [xf(G.sph(0.024, 5, 4), [0.19, 0.01, 0.06]), xf(G.sph(0.024, 5, 4), [-0.19, 0.01, 0.06])]);
    c.anim((dt, t, a) => { const sp = speedOf(a); top.rotation.x = 0.06 + sp * 0.35 + Math.sin(t * 3) * 0.03; low.rotation.x = 0.05 + sp * 0.4 + Math.sin(t * 4 + 1) * 0.05 * (0.4 + sp); low.rotation.z = Math.sin(t * 2.3) * 0.05 * sp; });
  },
  capevoid(c, rig) {
    const top = c.group(rig.backpack, [0, 0.2, -0.14]);
    const mid = c.group(top, [0, -0.3, -0.004]);
    const low = c.group(mid, [0, -0.3, -0.004]);
    c.mesh(top, 'c5_cv_top', flat('#15183a'), () => [xf(G.box(0.4, 0.3, 0.014), [0, -0.15, 0])]);
    c.mesh(mid, 'c5_cv_mid', flat('#101230'), () => [xf(G.box(0.44, 0.3, 0.014), [0, -0.15, 0])]);
    c.mesh(low, 'c5_cv_low', flat('#0b0c24'), () => [xf(G.box(0.48, 0.3, 0.014), [0, -0.15, 0])]);
    const stars = [[0.1, -0.1, -0.012, top], [-0.12, -0.2, -0.012, top], [0.05, -0.12, -0.012, mid], [-0.16, -0.22, -0.012, mid], [0.14, -0.1, -0.012, low], [-0.05, -0.24, -0.012, low]];
    for (let i = 0; i < stars.length; i++) c.mesh(stars[i][3], 'c5_cv_star' + i, bas(i % 2 ? '#ffffff' : '#8ad4ff'), () => [xf(G.oct(0.011), [stars[i][0], stars[i][1], stars[i][2]])]);
    c.anim((dt, t, a) => { const sp = speedOf(a); top.rotation.x = 0.05 + sp * 0.3; mid.rotation.x = 0.05 + sp * 0.35 + Math.sin(t * 3.1) * 0.04 * (0.3 + sp); low.rotation.x = 0.05 + sp * 0.4 + Math.sin(t * 3.9 + 1) * 0.06 * (0.3 + sp); low.rotation.z = Math.sin(t * 2.1) * 0.06 * sp; });
  },
  banner(c, rig) {
    const p = c.group(rig.backpack, [0.13, -0.05, -0.17]);
    c.mesh(p, 'c5_bn_pole', flat('#8a8e94'), () => [xf(G.cyl(0.008, 0.01, 0.84, 5), [0, 0.42, 0]), xf(G.sph(0.018, 5, 4), [0, 0.86, 0])]);
    const flag = c.group(p, [0, 0.74, 0]);
    c.mesh(flag, 'c5_bn_flag', flat('#e8752a'), () => [xf(G.box(0.24, 0.16, 0.008), [0.12, 0, 0])]);
    c.mesh(flag, 'c5_bn_ltr', flat('#f6f0e6'), () => [xf(G.box(0.05, 0.012, 0.01), [0.07, 0.035, 0]), xf(G.box(0.012, 0.07, 0.01), [0.07, 0.0, 0]), xf(G.box(0.05, 0.012, 0.01), [0.16, 0.035, 0]), xf(G.box(0.012, 0.05, 0.01), [0.16, 0.0, 0])]);
    c.anim((dt, t, a) => { const sp = speedOf(a); flag.rotation.y = Math.sin(t * 6) * (0.15 + sp * 0.3); p.rotation.x = -0.05 - sp * 0.18; p.rotation.z = Math.sin(t * 4) * 0.03 * sp; });
  },
  plushfrog(c, rig) {
    const p = c.group(rig.backpack, [0, 0.02, -0.21]);
    const green = flat('#5ecb4e'), dk = flat('#2f7a2a'), belly = flat('#d8f0a8');
    c.mesh(p, 'c5_pf_body', green, () => [xf(G.sph(0.11, 7, 5), [0, 0, 0], [0, 0, 0], [1.1, 1, 0.75]), xf(G.sph(0.07, 6, 4), [0.07, 0.11, 0], [0, 0, 0], [1, 1, 0.8]), xf(G.sph(0.07, 6, 4), [-0.07, 0.11, 0], [0, 0, 0], [1, 1, 0.8])]);
    c.mesh(p, 'c5_pf_belly', belly, () => [xf(G.sph(0.07, 6, 4), [0, -0.02, -0.05], [0, 0, 0], [1, 1.1, 0.5])]);
    c.mesh(p, 'c5_pf_eyes', bas('#f8f8f0'), () => [xf(G.sph(0.034, 6, 4), [0.07, 0.15, -0.02]), xf(G.sph(0.034, 6, 4), [-0.07, 0.15, -0.02])]);
    c.mesh(p, 'c5_pf_pupil', bas('#0c0c0c'), () => [xf(G.sph(0.017, 5, 4), [0.07, 0.15, -0.05]), xf(G.sph(0.017, 5, 4), [-0.07, 0.15, -0.05])]);
    c.mesh(p, 'c5_pf_legs', dk, () => [xf(G.cap(0.03, 0.08, 2, 5), [0.1, -0.09, 0.0], [0, 0, 0.8]), xf(G.cap(0.03, 0.08, 2, 5), [-0.1, -0.09, 0.0], [0, 0, -0.8])]);
    c.anim((dt, t, a) => { p.rotation.z = Math.sin(t * 6) * 0.1 * speedOf(a) + Math.sin(t * 1.3) * 0.02; p.position.y = 0.02 + Math.abs(Math.sin(t * 6)) * 0.02 * speedOf(a); });
  },
  balloons(c, rig) {
    const p = c.group(rig.backpack, [0, 0.16, -0.15]);
    const cols = ['#e8362c', '#f5c62a', '#35c6e8'];
    const ends = cols.map((col, i) => {
      const g = c.group(p, [0, 0, 0]);
      const x = (i - 1) * 0.15, y = 0.62 + (i === 1 ? 0.1 : 0), z = -0.03 * (i - 1);
      c.mesh(g, 'c5_bl_str' + i, flat('#e8e4d8'), () => [xf(G.cyl(0.003, 0.003, Math.hypot(x, y), 3), [x / 2, y / 2, z / 2], [0, 0, -Math.atan2(x, y)])]);
      c.mesh(g, 'c5_bl_b' + i, flat(col), () => [xf(G.sph(0.09, 8, 6), [x, y + 0.08, z], [0, 0, 0], [1, 1.15, 1])]);
      c.mesh(g, 'c5_bl_k' + i, flat(col), () => [xf(G.cone(0.02, 0.03, 4), [x, y - 0.03, z], [PI, 0, 0])]);
      return g;
    });
    c.anim((dt, t, a) => { const sp = speedOf(a); ends.forEach((g, i) => { g.rotation.z = Math.sin(t * 1.7 + i * 2) * 0.08 + sp * 0.15 * (i - 1) * 0.5; g.rotation.x = -sp * 0.28 + Math.sin(t * 2.3 + i) * 0.05; }); });
  },
  dish(c, rig) {
    const p = c.group(rig.backpack, [0, 0.02, -0.15]);
    c.mesh(p, 'c5_ds_base', flat('#7d8184'), () => [xf(G.box(0.3, 0.42, 0.06), [0, 0, 0]), xf(G.cyl(0.02, 0.025, 0.2, 5), [0, 0.3, -0.02])]);
    const head = c.group(p, [0, 0.4, -0.02]);
    c.mesh(head, 'c5_ds_dish', flat('#e8ecf0'), () => [xf(G.sph(0.17, 10, 4, 0, TAU, 0, PI / 2.6), [0, 0, 0], [-PI / 2 - 0.5, 0, 0], [1, 1, 1])]);
    c.mesh(head, 'c5_ds_feed', flat('#2a2e34'), () => [xf(G.cyl(0.006, 0.006, 0.17, 4), [0, -0.05, -0.1], [-1.05, 0, 0]), xf(G.sph(0.018, 5, 4), [0, -0.135, -0.19])]);
    c.anim((dt, t, a) => { head.rotation.y = Math.sin(t * 0.8) * 1.0; head.rotation.x = 0.1 - speedOf(a) * 0.1; });
  },
  server(c, rig) {
    const p = c.group(rig.backpack, [0, 0.0, -0.17]);
    c.mesh(p, 'c5_sv_rack', flat('#2a2d33'), () => [xf(G.box(0.32, 0.46, 0.12), [0, 0, 0]), xf(G.box(0.36, 0.03, 0.14), [0, 0.245, 0]), xf(G.box(0.36, 0.03, 0.14), [0, -0.245, 0])]);
    c.mesh(p, 'c5_sv_units', flat('#4a4e58'), () => [0, 1, 2, 3, 4].map((i) => xf(G.box(0.28, 0.06, 0.02), [0, 0.17 - i * 0.085, -0.066])));
    const leds = [0, 1, 2, 3, 4].map((i) => { const m = inst('#3dff7a'); mk(p, G.box(0.03, 0.012, 0.01), m, [0.1, 0.17 - i * 0.085, -0.078]); c.raw(p, G.box(0.05, 0.012, 0.01), inst('#ffb43a'), [-0.08, 0.17 - i * 0.085, -0.078]); return m; });
    c.mesh(p, 'c5_sv_cable', flat('#1a1a20'), () => [xf(G.tor(0.08, 0.01, 3, 8, PI), [0, -0.27, -0.02], [0, 0, PI])]);
    c.anim((dt, t) => leds.forEach((m, i) => m.color.setHex(Math.sin(t * (5 + i * 1.7) + i) > 0.2 ? 0x3dff7a : 0x0f4a26)));
  },
  jetpack(c, rig) {
    const p = c.group(rig.backpack, [0, 0.02, -0.14]);
    c.mesh(p, 'c5_jp_tanks', flat('#c8ccd4'), () => [xf(G.cyl(0.075, 0.075, 0.5, 8), [0.11, 0.0, -0.06]), xf(G.cyl(0.075, 0.075, 0.5, 8), [-0.11, 0.0, -0.06]), xf(G.sph(0.075, 8, 4, 0, TAU, 0, PI / 2), [0.11, 0.25, -0.06]), xf(G.sph(0.075, 8, 4, 0, TAU, 0, PI / 2), [-0.11, 0.25, -0.06])]);
    c.mesh(p, 'c5_jp_bands', flat('#e8752a'), () => [xf(G.cyl(0.078, 0.078, 0.04, 8), [0.11, 0.1, -0.06]), xf(G.cyl(0.078, 0.078, 0.04, 8), [-0.11, 0.1, -0.06]), xf(G.cyl(0.078, 0.078, 0.04, 8), [0.11, -0.12, -0.06]), xf(G.cyl(0.078, 0.078, 0.04, 8), [-0.11, -0.12, -0.06])]);
    c.mesh(p, 'c5_jp_frame', flat('#3a3e46'), () => [xf(G.box(0.32, 0.4, 0.05), [0, 0.0, 0.0]), xf(G.box(0.1, 0.06, 0.1), [0, 0.03, -0.06])]);
    c.mesh(p, 'c5_jp_noz', flat('#4a4e58'), () => [xf(G.cone(0.06, 0.12, 8, true), [0.11, -0.32, -0.06], [PI, 0, 0]), xf(G.cone(0.06, 0.12, 8, true), [-0.11, -0.32, -0.06], [PI, 0, 0])]);
    const fl = [0.11, -0.11].map((x) => { const m = inst('#ffb43a'); const f = mk(p, G.cone(0.045, 0.24, 6), m, [x, -0.5, -0.06], [PI, 0, 0]); return f; });
    const core = [0.11, -0.11].map((x) => mk(p, G.cone(0.022, 0.16, 5), inst('#fff6c0'), [x, -0.46, -0.06], [PI, 0, 0]));
    c.anim((dt, t, a) => { const sp = 0.6 + speedOf(a) * 0.9; fl.forEach((f, i) => { const k = sp * (0.75 + 0.25 * Math.sin(t * 40 + i * 2)); f.scale.set(1, k, 1); f.position.y = -0.38 - 0.12 * k; }); core.forEach((f, i) => { const k = sp * (0.7 + 0.3 * Math.sin(t * 55 + i)); f.scale.set(1, k, 1); f.position.y = -0.38 - 0.08 * k; }); });
  },
  wings(c, rig) {
    const p = c.group(rig.backpack, [0, 0.12, -0.13]);
    c.mesh(p, 'c5_wg_hub', flat('#2a2d33'), () => [xf(G.box(0.2, 0.3, 0.07), [0, 0, 0]), xf(G.cyl(0.03, 0.03, 0.12, 6), [0.1, 0.09, -0.02], [0, 0, PI / 2]), xf(G.cyl(0.03, 0.03, 0.12, 6), [-0.1, 0.09, -0.02], [0, 0, PI / 2])]);
    const sides = [1, -1].map((s) => {
      const w = c.group(p, [s * 0.15, 0.1, -0.03]);
      for (let i = 0; i < 4; i++) {
        const len = 0.56 - i * 0.09, ang = 0.45 + i * 0.32;
        c.mesh(w, 'c5_wg_b' + i, flat(i % 2 ? '#3a3e48' : '#2a2d35'), () => [xf(G.box(len, 0.035, 0.012), [s * len / 2, 0, 0], [0, 0, s * (ang - 0.6)])].map((g) => g));
        c.mesh(w, 'c5_wg_e' + i, bas('#35e6ff'), () => [xf(G.box(len * 0.96, 0.008, 0.008), [s * len / 2, 0.018, -0.008], [0, 0, s * (ang - 0.6)])]);
      }
      return { w, s };
    });
    c.anim((dt, t, a) => { const sp = speedOf(a); sides.forEach(({ w, s }) => { w.rotation.z = -s * (0.15 + 0.25 * sp + Math.sin(t * (2 + sp * 6)) * (0.06 + 0.16 * sp)); w.rotation.y = s * 0.35; }); });
  },
};

// =====================================================================================================================
// HATS / head items
// =====================================================================================================================
/** run fn once per rendered frame while the mesh is drawn (hats have no update hook) */
const tick = (mesh, fn) => { mesh.onBeforeRender = () => fn(clock()); return mesh; };

const HAT_BUILD = {
  mophead(g, add) {
    add('a', flat('#d8d2b8'), () => {
      const out = [xf(G.sph(0.19, 8, 4, 0, TAU, 0, PI / 2), [0, -0.075, 0], [0, 0, 0], [1, 0.8, 1])];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.26; if (Math.sin(a) > 0.55) continue; out.push(xf(G.cone(0.03, 0.3, 4), [Math.cos(a) * 0.2, -0.24, Math.sin(a) * 0.2], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], [1, -1, 1])); }
      return out;
    });
    add('b', flat('#8f8a78'), () => [xf(G.cyl(0.03, 0.03, 0.4, 5), [0.16, 0.12, -0.12], [0.2, 0, -0.5])]);
  },
  paperboat(g, add) {
    add('a', flat('#f4f2e8'), () => [xf(G.cone(0.25, 0.17, 4), [0, 0.02, 0], [0, PI / 4, 0], [1.15, 1, 0.42]), xf(G.box(0.4, 0.06, 0.2), [0, -0.07, 0])]);
    add('b', flat('#d8d4c4'), () => [xf(G.box(0.4, 0.008, 0.204), [0, -0.05, 0])]);
  },
  coffeecup(g, add) {
    add('a', flat('#f6f2ea'), () => [xf(G.cyl(0.13, 0.1, 0.26, 10), [0, 0.06, 0])]);
    add('b', flat('#a9713e'), () => [xf(G.cyl(0.122, 0.108, 0.1, 10), [0, 0.06, 0])]);
    add('c', flat('#2a2622'), () => [xf(G.cyl(0.135, 0.135, 0.028, 10), [0, 0.2, 0]), xf(G.cyl(0.02, 0.02, 0.03, 6), [0, 0.225, 0])]);
    for (let i = 0; i < 3; i++) {
      const m = mk(g, G.sph(0.028, 5, 4), inst('#ffffff', { transparent: true, opacity: 0.5, depthWrite: false }), [0, 0.28, 0]);
      tick(m, (t) => { const u = (t * 0.5 + i / 3) % 1; m.position.set(Math.sin(t * 2 + i * 2) * 0.03, 0.26 + u * 0.16, 0); m.material.opacity = 0.5 * (1 - u); m.scale.setScalar(0.7 + u * 0.8); });
    }
  },
  rubberduck(g, add) {
    add('a', flat('#f5d02a'), () => [xf(G.sph(0.115, 8, 6), [0, 0.03, -0.03], [0, 0, 0], [1, 0.85, 1.2]), xf(G.sph(0.075, 8, 6), [0, 0.13, 0.05])]);
    add('b', flat('#ee7a1e'), () => [xf(G.box(0.07, 0.025, 0.07), [0, 0.12, 0.13])]);
    add('c', bas('#101010'), () => [xf(G.sph(0.012, 4, 3), [0.04, 0.16, 0.105]), xf(G.sph(0.012, 4, 3), [-0.04, 0.16, 0.105])]);
    add('d', flat('#f5d02a'), () => [xf(G.cone(0.05, 0.09, 4), [0, 0.05, -0.16], [-PI / 2 - 0.5, 0, 0])]);
  },
  cowboy(g, add) {
    add('a', flat('#8a5a2a'), () => [xf(G.cyl(0.13, 0.17, 0.15, 9), [0, -0.01, 0]), xf(G.cyl(0.29, 0.29, 0.014, 12), [0, -0.08, 0]),
      xf(G.box(0.1, 0.014, 0.4), [0.27, -0.055, 0], [0, 0, 0.45]), xf(G.box(0.1, 0.014, 0.4), [-0.27, -0.055, 0], [0, 0, -0.45])]);
    add('b', flat('#3a2614'), () => [xf(G.cyl(0.171, 0.172, 0.03, 9, true), [0, -0.055, 0]), xf(G.box(0.05, 0.05, 0.012), [0, -0.055, 0.175])]);
    add('c', flat('#6a4218'), () => [xf(G.box(0.1, 0.03, 0.12), [0, 0.07, 0])]);
  },
  cablecoil(g, add) {
    add('a', flat('#2a6ad0'), () => [0, 1, 2, 3].map((i) => xf(G.tor(0.17 - i * 0.03, 0.028, 4, 12), [0, -0.06 + i * 0.05, 0], [PI / 2, 0, 0], [1, 1.1, 1])));
    add('b', flat('#b8bcc2'), () => [xf(G.box(0.06, 0.05, 0.07), [0.16, 0.04, 0.09], [0, 0.5, 0.2])]);
    add('c', flat('#e0b040'), () => [xf(G.box(0.03, 0.01, 0.02), [0.18, 0.04, 0.125], [0, 0.5, 0.2])]);
  },
  toaster(g, add) {
    add('a', flat('#c0c4cc'), () => [xf(G.box(0.3, 0.14, 0.2), [0, 0.0, 0]), xf(G.box(0.32, 0.03, 0.22), [0, -0.06, 0])]);
    add('b', flat('#2a2a30'), () => [xf(G.box(0.2, 0.012, 0.03), [0, 0.072, 0.045]), xf(G.box(0.2, 0.012, 0.03), [0, 0.072, -0.045]), xf(G.box(0.03, 0.03, 0.02), [0.13, 0.0, 0.11])]);
    for (let i = 0; i < 2; i++) {
      const m = mk(g, G.box(0.18, 0.13, 0.024), flat('#d8a860'), [0, 0.1, i ? -0.045 : 0.045]);
      tick(m, (t) => { const u = Math.max(0, Math.sin(t * 0.9 + i * 1.6)); m.position.y = 0.06 + u * u * 0.08; });
    }
  },
  jester(g, add) {
    add('a', flat('#6a2fb8'), () => [xf(G.tor(0.18, 0.04, 4, 12), [0, -0.075, 0], [PI / 2, 0, 0]), xf(G.cone(0.08, 0.3, 4), [0.2, -0.02, 0], [0, 0, -1.25]), xf(G.cone(0.08, 0.3, 4), [-0.2, -0.02, 0], [0, 0, 1.25])]);
    add('b', flat('#2fb87a'), () => [xf(G.cone(0.08, 0.32, 4), [0, 0.04, -0.2], [-1.15, 0, 0]), xf(G.sph(0.11, 8, 4, 0, TAU, 0, PI / 2), [0, -0.06, 0], [0, 0, 0], [1, 0.7, 1])]);
    add('c', flat('#f5c62a'), () => [xf(G.sph(0.03, 5, 4), [0.36, -0.14, 0]), xf(G.sph(0.03, 5, 4), [-0.36, -0.14, 0]), xf(G.sph(0.03, 5, 4), [0, -0.1, -0.36])]);
  },
  tricorn(g, add) {
    add('a', flat('#15151a'), () => [xf(G.cyl(0.13, 0.17, 0.09, 8), [0, -0.03, 0]), xf(G.box(0.2, 0.014, 0.34), [0.2, -0.04, 0.02], [0, 0, 0.5]), xf(G.box(0.2, 0.014, 0.34), [-0.2, -0.04, 0.02], [0, 0, -0.5]), xf(G.box(0.34, 0.014, 0.2), [0, -0.04, -0.2], [0.5, 0, 0])]);
    add('b', flat('#d8b048'), () => [xf(G.box(0.2, 0.014, 0.02), [0.2, -0.0, 0.02], [0, 0, 0.5]), xf(G.box(0.2, 0.014, 0.02), [-0.2, -0.0, 0.02], [0, 0, -0.5]), xf(G.cyl(0.171, 0.172, 0.016, 8, true), [0, -0.05, 0])]);
    add('c', bas('#f0f0e8'), () => [xf(G.sph(0.028, 5, 4), [0, -0.02, 0.18], [0, 0, 0], [1, 1, 0.4]), xf(G.box(0.05, 0.012, 0.01), [0, -0.055, 0.183]), xf(G.box(0.012, 0.012, 0.01), [0.01, -0.03, 0.2])]);
  },
  cursor(g, add) {
    const shape = (s) => [xf(G.cone(0.1 * s, 0.3 * s, 3), [0, 0, 0], [0, 0, 0]), xf(G.box(0.06 * s, 0.14 * s, 0.03 * s), [0.016 * s, -0.17 * s, 0], [0, 0, 0.35])];
    const pivot = pv(g, [0.03, 0.18, 0.0], [0, 0, -0.35]);
    mk(pivot, merged('c5hat_cursor_w', () => shape(1).map((x) => xf(x, [0, 0, 0.012]))), bas('#ffffff'));
    mk(pivot, merged('c5hat_cursor_k', () => shape(1.22).map((x) => xf(x, [0, -0.01, -0.006]))), bas('#0a0a0e'));
  },
  wifi(g, add) {
    const p = pv(g, [0, 0.03, 0], [0, 0, 0]);
    const arcs = [0, 1, 2].map((i) => { const m = mk(p, G.tor(0.11 + i * 0.075, 0.014, 3, 12, PI * 0.62), inst('#4cffb0', { transparent: true, opacity: 0.9 }), [0, 0.04, 0], [0, 0, PI / 2 - PI * 0.31]); return m; });
    mk(p, G.sph(0.028, 5, 4), inst('#4cffb0'), [0, 0.04, 0]);
    tick(arcs[0], (t) => arcs.forEach((m, i) => { m.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3 - i * 0.9)); }));
  },
  loading(g, add) {
    const r = mk(g, G.tor(0.19, 0.022, 4, 16, TAU * 0.78), inst('#7fe4ff'), [0, 0.02, 0], [PI / 2, 0, 0]);
    const dot = mk(g, G.sph(0.03, 5, 4), inst('#ffffff'), [0.19, 0.02, 0]);
    tick(r, (t) => { r.rotation.z = -t * 4; dot.position.set(Math.cos(-t * 4 + 0.0) * 0.19, 0.02, Math.sin(t * 4) * 0.19); });
  },
  crt(g, add) {
    add('a', flat('#d4c9a8'), () => [xf(G.box(0.28, 0.24, 0.26), [0, 0.04, 0]), xf(G.box(0.2, 0.2, 0.06), [0, 0.03, -0.16]), xf(G.cyl(0.1, 0.03, 0.03, 6), [0, 0.18, 0])]);
    add('b', flat('#6a6250'), () => [xf(G.box(0.22, 0.17, 0.02), [0, 0.04, 0.135]), xf(G.cyl(0.006, 0.006, 0.2, 4), [0.07, 0.29, 0], [0, 0, -0.5]), xf(G.cyl(0.006, 0.006, 0.2, 4), [-0.07, 0.29, 0], [0, 0, 0.5])]);
    const scr = mk(g, G.box(0.19, 0.14, 0.012), inst('#6cf0a8'), [0, 0.04, 0.148]);
    tick(scr, (t) => { const k = 0.35 + 0.65 * Math.abs(Math.sin(t * 19) * Math.sin(t * 7.3)); scr.material.color.setRGB(0.25 * k, 0.9 * k, 0.55 * k); });
    mk(g, G.box(0.19, 0.01, 0.006), inst('#ffffff'), [0, 0.09, 0.156]);
  },
  stormcloud(g, add) {
    add('a', flat('#7a828e'), () => [xf(G.sph(0.11, 7, 5), [0, 0.19, 0]), xf(G.sph(0.09, 7, 5), [0.1, 0.16, 0.02]), xf(G.sph(0.09, 7, 5), [-0.1, 0.16, -0.02]), xf(G.sph(0.08, 7, 5), [0.02, 0.15, 0.1]), xf(G.sph(0.08, 7, 5), [-0.02, 0.15, -0.1])]);
    add('b', flat('#5a616b'), () => [xf(G.sph(0.07, 6, 4), [0.05, 0.12, 0.0], [0, 0, 0], [1.6, 0.6, 1.4])]);
    for (let i = 0; i < 7; i++) {
      const m = mk(g, G.box(0.008, 0.05, 0.008), inst('#7fc0ff'), [0, 0.1, 0]);
      const ox = ((i * 37) % 11 - 5) * 0.02, oz = ((i * 53) % 9 - 4) * 0.02;
      tick(m, (t) => { const u = (t * 1.3 + i * 0.29) % 1; m.position.set(ox, 0.1 - u * 0.36, oz); });
    }
    const bolt = mk(g, G.box(0.02, 0.16, 0.012), inst('#fff6a0'), [0.02, 0.0, 0.1], [0, 0, 0.35]);
    tick(bolt, (t) => { bolt.visible = Math.sin(t * 1.7) > 0.86 && Math.sin(t * 23) > 0; });
  },
  dronebuddy(g, add) {
    const orbit = pv(g, [0, 0.04, 0]);
    const d = pv(orbit, [0.36, 0.05, 0]);
    mk(d, G.sph(0.045, 6, 4), flat('#3a3e48'), [0, 0, 0], null, [1, 0.7, 1]);
    mk(d, G.sph(0.016, 5, 4), inst('#ff3a3a'), [0, 0, 0.04]);
    const rot = [[0.06, 0.06], [-0.06, 0.06], [0.06, -0.06], [-0.06, -0.06]].map(([x, z]) => mk(d, G.cyl(0.05, 0.05, 0.004, 8), inst('#9ad8ff', { transparent: true, opacity: 0.5, depthWrite: false }), [x, 0.03, z]));
    mk(d, merged('c5hat_drone_arms', () => [xf(G.box(0.14, 0.01, 0.01), [0, 0.02, 0], [0, PI / 4, 0]), xf(G.box(0.14, 0.01, 0.01), [0, 0.02, 0], [0, -PI / 4, 0])]), flat('#22252c'));
    tick(rot[0], (t) => { orbit.rotation.y = t * 1.3; d.position.y = 0.05 + Math.sin(t * 3) * 0.02; d.rotation.y = -t * 1.3; rot.forEach((r, i) => { r.rotation.y = t * 40 * (i % 2 ? 1 : -1); }); });
  },
  foremanhat(g, add) {
    add('a', flat('#f5c62a'), () => [xf(G.sph(0.19, 9, 5, 0, TAU, 0, PI / 2), [0, -0.06, 0], [0, 0, 0], [1, 0.9, 1.05]), xf(G.box(0.34, 0.02, 0.15), [0, -0.075, 0.2]), xf(G.box(0.05, 0.05, 0.36), [0, 0.06, 0.0])]);
    add('b', flat('#d0a01a'), () => [xf(G.cyl(0.192, 0.196, 0.025, 9, true), [0, -0.075, 0])]);
    add('c', flat('#e8e8e2'), () => [xf(G.box(0.07, 0.05, 0.012), [0, 0.0, 0.2])]);
    const halo = mk(g, G.tor(0.15, 0.012, 3, 14), inst('#fff2a0'), [0, 0.24, 0], [PI / 2, 0, 0]);
    tick(halo, (t) => { halo.position.y = 0.24 + Math.sin(t * 2) * 0.012; halo.rotation.z = t; });
  },
  laurel(g, add) {
    add('a', lam('#e8c040', { emissive: '#3a2c00' }), () => {
      const out = [];
      for (let i = 0; i < 16; i++) {
        const a = -0.15 + (i / 15) * (PI + 0.3);
        for (const s of [1, -1]) out.push(xf(G.cone(0.028, 0.08, 4), [s * Math.sin(a) * 0.2, -0.075 + Math.cos(a) * 0.012, -Math.cos(a) * 0.2], [PI / 2 * 0.4, s * a, s * 1.1]));
      }
      out.push(xf(G.tor(0.2, 0.008, 3, 14, PI * 1.25), [0, -0.075, -0.02], [PI / 2, 0, PI * 0.875]));
      return out;
    });
  },
  firewall(g, add) {
    add('a', flat('#2a1a14'), () => [xf(G.tor(0.18, 0.03, 4, 14), [0, -0.07, 0], [PI / 2, 0, 0])]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, m = mk(g, G.cone(0.045, 0.22, 5), inst(i % 2 ? '#ff7a1a' : '#ffc02a'), [Math.cos(a) * 0.17, 0.06, Math.sin(a) * 0.17]);
      tick(m, (t) => { const k = 0.7 + 0.5 * Math.abs(Math.sin(t * (7 + i) + i)); m.scale.set(1, k, 1); m.position.y = -0.05 + 0.11 * k; });
    }
    const core = mk(g, G.cone(0.06, 0.3, 5), inst('#ff4a10'), [0, 0.08, 0]);
    tick(core, (t) => { const k = 0.8 + 0.4 * Math.sin(t * 9); core.scale.set(1, k, 1); core.position.y = 0.0 + 0.15 * k; });
  },
  blackhole(g, add) {
    const disc = mk(g, G.tor(0.17, 0.03, 3, 20), inst('#ffb04a'), [0, 0.2, 0], [PI / 2 - 0.35, 0, 0], [1, 1, 0.25]);
    mk(g, G.sph(0.075, 8, 6), inst('#000000'), [0, 0.2, 0]);
    const ring2 = mk(g, G.tor(0.115, 0.008, 3, 18), inst('#8ae4ff'), [0, 0.2, 0], [PI / 2 - 0.35, 0, 0]);
    tick(disc, (t) => { disc.rotation.z = t * 1.4; ring2.rotation.z = -t * 2.2; disc.position.y = ring2.position.y = 0.2 + Math.sin(t * 1.5) * 0.015; });
  },
};
export const C5_HAT_IDS = Object.keys(HAT_BUILD);
/** hat group for one of the cosm5 head items (null when the id is not ours) */
export function buildC5Hat(id) {
  const fn = HAT_BUILD[id];
  if (!fn) return null;
  const g = new THREE.Group();
  g.name = 'hat_' + id;
  const add = (key, mat, parts) => mk(g, merged('c5hat_' + id + '_' + key, parts), mat);
  fn(g, add);
  return g;
}

// =====================================================================================================================
// registry glue: OUTFITS / BACK_ACCS / HATS_EXTRA rows for models/cosmetics.js (same shape as the wave-3 rows)
// =====================================================================================================================
const row = (e, extra = {}) => ({ id: e.id, name: e.name, tier: e.tier, desc: e.desc, how: e.how || '', ...extra });
export const C5_OUTFITS = bySlot('suit').map((e) => row(e, { color: C5_SUIT_BUILDERS[e.id]?.tint || '#888888', secret: e.src === 'secret' }));
export const C5_BACKS = bySlot('back').map((e) => row(e));
export const C5_HATS = bySlot('hat').map((e) => row(e));
void C5;
