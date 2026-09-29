// [ux] wave 3 wardrobe outfits: Moderator Armor, Data Monk, three Astronaut variants, Soviet Worker, Tracksuit, Samurai, Knight,
// Cyber Ninja, Viking, Secret Agent. Pure appearance data + procedural geometry (same builder contract as BUILDERS in
// models/cosmetics.js: { tint, glove, boot, belt, emissive, hide, visor, eye, build(c, headgear) }). NO gameplay stats.
// models/cosmetics.js imports this file and merges W3_OUTFITS / W3_BUILDERS into OUTFITS / BUILDERS (no import cycle: this file
// only needs the modelkit).
import * as THREE from 'three';
import { G, xf, lam, bas, PI, TAU } from './modelkit.js';

const flat = (c) => lam(c);
const glow = (c, e) => lam(c, { emissive: e });
const rT = (y) => 0.22 + 0.06 * y;
const ring = (y, h, grow = 0.012) => xf(G.cyl(rT(y + h / 2) + grow, rT(y - h / 2) + grow, h, 8, true), [0, y, 0], [0, PI / 8, 0], [1, 1, 0.665]);
const limbRing = (r, h, y, s = 6) => xf(G.cyl(r, r, h, s, true), [0, y, 0]);
const dome = (r, y, sy = 0.85, sz = 1.05) => xf(G.sph(r, 9, 5, 0, TAU, 0, PI / 2), [0, y, 0], [0, 0, 0], [1, sy, sz]);

export const W3_OUTFITS = [
  { id: 'modarmor', name: 'Moderator Armor', tier: 'epic', color: '#e8e8ea', desc: 'White plastoid plates, black joints, a very confident helmet. Bans on sight.', how: 'Black Market (HQ), level 12' },
  { id: 'datamonk', name: 'Data Monk', tier: 'rare', color: '#a8865a', desc: 'A hooded robe, a rope belt and a glowing data-stylus. Trust the Codex.', how: 'Fill 50% of the Codex' },
  { id: 'astro_lunar', name: 'Lunar Astronaut', tier: 'epic', color: '#f1f2f6', desc: 'Gold visor, silver rings, clean boots. One giant leap for scrap.', how: 'Reach level 25' },
  { id: 'astro_mars', name: 'Mars Astronaut', tier: 'epic', color: '#c8542a', desc: 'Rust-red pressure suit, dusty boots. The red planet called.', how: 'Land on 6 different moons' },
  { id: 'astro_deep', name: 'Deep-Space Astronaut', tier: 'legendary', color: '#262b36', desc: 'Black hardsuit with cyan status lights. Nobody hears you scream.', how: 'Meet the quota 5 times' },
  { id: 'soviet', name: 'Soviet Worker', tier: 'uncommon', color: '#6b6f5c', desc: 'Quilted jacket, ushanka, red armband. The quota is a five-year plan.', how: 'Black Market (HQ), level 6' },
  { id: 'tracksuit', name: 'Tracksuit', tier: 'common', color: '#1f5fb4', desc: 'Three stripes, gold chain, zero regrets.', how: 'Black Market (HQ), level 3' },
  { id: 'samurai', name: 'Samurai', tier: 'epic', color: '#9a1f24', desc: 'Lacquered plates, layered shoulder guards and a crested kabuto.', how: 'Kill 100 creatures' },
  { id: 'knight', name: 'Knight', tier: 'epic', color: '#aab0ba', desc: 'Full steel plate, a great helm and a cross on the tabard.', how: 'Black Market (HQ), level 15' },
  { id: 'cyberninja', name: 'Cyber Ninja', tier: 'legendary', color: '#101218', desc: 'Matte black, cyan light lines, a scarf that flutters in nothing.', how: 'Crack 10 vaults' },
  { id: 'viking', name: 'Viking', tier: 'rare', color: '#6a4a2e', desc: 'Fur mantle, horned helm and a very loud voice.', how: 'Black Market (HQ), level 10' },
  { id: 'agent', name: 'Secret Agent', tier: 'rare', color: '#15171c', desc: 'Black suit, thin tie, earpiece. Definitely not a janitor.', how: 'Hit the GACHA jackpot 3 times' },
];

/** an astronaut suit in different colours (the stock Astronaut is untouched) */
function astro(p, o) {
  return {
    tint: o.tint, glove: o.glove, boot: o.boot, visor: o.visor, eye: o.eye || '#141008', hide: ['backpack', 'helmetbits'],
    build(c) {
      const { spine, armL, armR, backpack, legL, legR } = c.rig;
      const acc = flat(o.acc), grey = flat('#3a3f48'), silver = flat(o.trim);
      c.mesh(spine, p + '_ring', silver, () => [xf(G.tor(0.19, 0.035, 4, 12), [0, 0.53, 0], [PI / 2, 0, 0], [1, 0.7, 1])]);
      c.mesh(spine, p + '_stripe', acc, () => [ring(0.42, 0.05, 0.014)]);
      c.mesh(spine, p + '_ctrl', grey, () => [xf(G.box(0.2, 0.12, 0.05), [0, 0.28, 0.16])]);
      c.mesh(spine, p + '_l1', bas(o.l1), () => [xf(G.box(0.03, 0.03, 0.01), [-0.06, 0.3, 0.19])]);
      c.mesh(spine, p + '_l2', bas(o.l2), () => [xf(G.box(0.03, 0.03, 0.01), [0, 0.3, 0.19])]);
      c.mesh(spine, p + '_l3', bas(o.l3), () => [xf(G.box(0.03, 0.03, 0.01), [0.06, 0.3, 0.19])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, p + '_sh', acc, () => [limbRing(0.083, 0.04, -0.03)]);
        c.mesh(arm.el, p + '_wr', silver, () => [limbRing(0.07, 0.035, -0.22)]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, p + '_knee', silver, () => [limbRing(0.09, 0.05, -0.02)]);
      c.mesh(backpack, p + '_pack', flat(o.pack), () => [xf(G.box(0.36, 0.5, 0.2), [0, 0, -0.1]), xf(G.box(0.3, 0.06, 0.16), [0, 0.28, -0.1])]);
      c.mesh(backpack, p + '_pack2', acc, () => [xf(G.box(0.36, 0.06, 0.205), [0, -0.1, -0.1])]);
      c.mesh(backpack, p + '_ant', silver, () => [xf(G.cyl(0.006, 0.01, 0.25, 4), [0.12, 0.42, -0.1])]);
      if (o.tanks) c.mesh(backpack, p + '_tanks', flat(o.tanks), () => [xf(G.cyl(0.07, 0.07, 0.42, 7), [0.11, -0.02, -0.26]), xf(G.cyl(0.07, 0.07, 0.42, 7), [-0.11, -0.02, -0.26])]);
    },
  };
}

export const W3_BUILDERS = {
  // ---------------------------------------------------------------- MODERATOR ARMOR (white plates, black joints, helmet)
  modarmor: {
    tint: '#1c1d22', glove: '#f2f2f4', boot: '#f2f2f4', belt: '#101014', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const white = flat('#eeeef0'), black = flat('#141418'), grey = flat('#a8acb4');
      c.mesh(spine, 'ma_chest', white, () => [xf(G.box(0.4, 0.3, 0.05), [0, 0.32, 0.165]), xf(G.box(0.34, 0.26, 0.05), [0, 0.33, -0.165]), xf(G.box(0.3, 0.1, 0.05), [0, 0.06, 0.16]), xf(G.box(0.1, 0.2, 0.06), [0, 0.06, 0.16], [0, 0, 0])]);
      c.mesh(spine, 'ma_abs', black, () => [xf(G.box(0.05, 0.16, 0.02), [0.06, 0.18, 0.165]), xf(G.box(0.05, 0.16, 0.02), [-0.06, 0.18, 0.165]), xf(G.box(0.36, 0.03, 0.02), [0, 0.2, 0.19])]);
      c.mesh(spine, 'ma_collar', white, () => [xf(G.cyl(0.17, 0.2, 0.08, 8), [0, 0.52, 0], [0, PI / 8, 0], [1, 1, 0.7])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'ma_sh', white, () => [xf(G.sph(0.12, 7, 4, 0, TAU, 0, PI / 2), [0, 0.05, 0], [0, 0, 0], [1, 0.8, 1]), limbRing(0.085, 0.14, -0.15)]);
        c.mesh(arm.el, 'ma_fore', white, () => [limbRing(0.078, 0.2, -0.12), xf(G.box(0.06, 0.14, 0.03), [0, -0.1, 0.075])]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.hip, 'ma_thigh', white, () => [xf(G.box(0.16, 0.24, 0.05), [0, -0.2, 0.09])]);
        c.mesh(leg.knee, 'ma_shin', white, () => [limbRing(0.09, 0.22, -0.14), xf(G.sph(0.06, 6, 4), [0, 0.0, 0.07], [0, 0, 0], [1, 0.8, 0.6])]);
      }
      c.mesh(spine, 'ma_belt', black, () => [xf(G.box(0.4, 0.06, 0.02), [0, 0.03, 0.17]), xf(G.box(0.07, 0.1, 0.06), [0.245, 0.03, 0.04]), xf(G.box(0.07, 0.1, 0.06), [-0.245, 0.03, 0.04])]);
      // helmet: white dome + cheek guards + the black T-visor slit
      c.mesh(headgear, 'ma_helm', white, () => [dome(0.205, -0.065, 0.92, 1.06), xf(G.box(0.05, 0.16, 0.14), [0.195, -0.13, 0.03]), xf(G.box(0.05, 0.16, 0.14), [-0.195, -0.13, 0.03]), xf(G.box(0.32, 0.06, 0.08), [0, -0.105, -0.17])]);
      c.mesh(headgear, 'ma_slit', black, () => [xf(G.box(0.24, 0.035, 0.02), [0, -0.085, 0.205]), xf(G.box(0.03, 0.09, 0.02), [0, -0.135, 0.2]), xf(G.box(0.05, 0.03, 0.02), [0.09, -0.16, 0.19]), xf(G.box(0.05, 0.03, 0.02), [-0.09, -0.16, 0.19])]);
    },
  },

  // ---------------------------------------------------------------- DATA MONK (hooded robe)
  datamonk: {
    tint: '#b09468', glove: '#7a6040', boot: '#4a3a28', belt: '#5a4028', hide: ['belt', 'helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      const cloth = flat('#a8865a'), dark = flat('#6a5030'), rope = flat('#d8c8a0');
      c.mesh(spine, 'dm_robe', cloth, () => [xf(G.cyl(0.3, 0.38, 0.62, 9, true), [0, -0.28, 0], [0, PI / 8, 0], [1, 1, 0.74]), xf(G.box(0.22, 0.34, 0.03), [0.09, 0.32, 0.165], [0, 0, 0.35]), xf(G.box(0.22, 0.34, 0.03), [-0.09, 0.32, 0.165], [0, 0, -0.35])]);
      c.mesh(spine, 'dm_sash', dark, () => [ring(0.07, 0.09, 0.02)]);
      c.mesh(spine, 'dm_rope', rope, () => [xf(G.cyl(0.012, 0.012, 0.28, 5), [0.09, -0.08, 0.19], [0, 0, 0.1]), xf(G.sph(0.022, 5, 4), [0.1, -0.23, 0.19])]);
      for (const arm of [armL, armR]) c.mesh(arm.sh, 'dm_sleeve', cloth, () => [xf(G.cyl(0.1, 0.13, 0.3, 7, true), [0, -0.18, 0]), xf(G.cyl(0.115, 0.15, 0.12, 7, true), [0, -0.34, 0])]);
      c.mesh(armR.el, 'dm_stylus', glow('#8fe8ff', '#2a90b8'), () => [xf(G.cyl(0.014, 0.014, 0.26, 6), [0, -0.28, 0.1], [PI / 2, 0, 0])]);
      c.mesh(armR.el, 'dm_hilt', flat('#b8bcc4'), () => [xf(G.cyl(0.02, 0.02, 0.09, 6), [0, -0.28, 0.02], [PI / 2, 0, 0])]);
      // hood
      c.mesh(headgear, 'dm_hood', cloth, () => [dome(0.225, -0.05, 1.0, 1.12), xf(G.box(0.4, 0.3, 0.06), [0, -0.2, -0.2]), xf(G.box(0.05, 0.3, 0.12), [0.2, -0.16, 0.02]), xf(G.box(0.05, 0.3, 0.12), [-0.2, -0.16, 0.02])]);
      c.mesh(headgear, 'dm_trim', dark, () => [xf(G.tor(0.2, 0.012, 3, 12, PI), [0, -0.09, 0.03], [PI / 2 - 0.4, 0, PI])]);
    },
  },

  // ---------------------------------------------------------------- ASTRONAUT VARIANTS
  astro_lunar: astro('al', { tint: '#f1f2f6', glove: '#fafafa', boot: '#dfe2ea', visor: '#c9a03a', acc: '#9aa3b4', trim: '#d0d4dc', l1: '#ff4b3a', l2: '#4bff7a', l3: '#4ba8ff', pack: '#f4f5f8' }),
  astro_mars: astro('am', { tint: '#c8542a', glove: '#5a2a18', boot: '#7a3a20', visor: '#e88a3a', acc: '#f0b24a', trim: '#e6d2b0', l1: '#ffd24a', l2: '#ff6a3a', l3: '#ffffff', pack: '#a8421f', tanks: '#e6d2b0' }),
  astro_deep: {
    ...astro('ad', { tint: '#262b36', glove: '#12151b', boot: '#12151b', visor: '#1a7a9a', eye: '#7aeaff', acc: '#12151b', trim: '#4a5262', l1: '#44e0ff', l2: '#44e0ff', l3: '#44e0ff', pack: '#1a1e27', tanks: '#2e3542' }),
    emissive: '#04080c',
    build(c) {
      const base = astro('ad', { tint: '#262b36', glove: '#12151b', boot: '#12151b', visor: '#1a7a9a', acc: '#12151b', trim: '#4a5262', l1: '#44e0ff', l2: '#44e0ff', l3: '#44e0ff', pack: '#1a1e27', tanks: '#2e3542' });
      base.build(c);
      const { spine, armL, armR, legL, legR } = c.rig;
      const cy = bas('#44e0ff');
      c.mesh(spine, 'ad_lines', cy, () => [xf(G.box(0.012, 0.3, 0.01), [0.14, 0.32, 0.168], [0, 0, 0.15]), xf(G.box(0.012, 0.3, 0.01), [-0.14, 0.32, 0.168], [0, 0, -0.15])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'ad_arm', cy, () => [xf(G.box(0.01, 0.2, 0.01), [0, -0.1, 0.075])]);
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'ad_leg', cy, () => [xf(G.box(0.01, 0.22, 0.01), [0, -0.12, 0.09])]);
    },
  },

  // ---------------------------------------------------------------- SOVIET WORKER
  soviet: {
    tint: '#6b6f5c', glove: '#3a3a34', boot: '#1c1a16', belt: '#2a241c', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      const quilt = flat('#7a7e68'), red = flat('#c4161c'), fur = flat('#6a5a48');
      c.mesh(spine, 'sv_coat', quilt, () => [xf(G.cyl(0.27, 0.31, 0.3, 8, true), [0, -0.1, 0], [0, PI / 8, 0], [1, 1, 0.74]), ring(0.32, 0.03, 0.02), ring(0.18, 0.03, 0.02), ring(0.05, 0.03, 0.02)]);
      c.mesh(spine, 'sv_buttons', flat('#2a2a26'), () => [0.36, 0.24, 0.12].map((y) => xf(G.box(0.03, 0.03, 0.012), [0, y, 0.16])));
      c.mesh(spine, 'sv_star', bas('#ffd23a'), () => [xf(G.cone(0.022, 0.03, 5), [-0.12, 0.38, 0.162], [PI / 2, 0, 0])]);
      c.mesh(armL.sh, 'sv_band', red, () => [limbRing(0.09, 0.07, -0.1)]);
      c.mesh(armL.sh, 'sv_bandstar', bas('#ffd23a'), () => [xf(G.box(0.03, 0.03, 0.012), [-0.088, -0.1, 0])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'sv_cuff', fur, () => [limbRing(0.075, 0.05, -0.2)]);
      // ushanka: fur dome, ear flaps, red star
      c.mesh(headgear, 'sv_hat', fur, () => [dome(0.2, -0.06, 0.8, 1.05), xf(G.box(0.05, 0.16, 0.14), [0.2, -0.16, 0.0]), xf(G.box(0.05, 0.16, 0.14), [-0.2, -0.16, 0.0]), xf(G.box(0.34, 0.06, 0.05), [0, -0.09, 0.2])]);
      c.mesh(headgear, 'sv_hatstar', red, () => [xf(G.cone(0.028, 0.03, 5), [0, -0.075, 0.235], [PI / 2, 0, 0])]);
    },
  },

  // ---------------------------------------------------------------- TRACKSUIT
  tracksuit: {
    tint: '#1f5fb4', glove: '#1a1a1e', boot: '#f2f2f2', belt: '#101014', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const white = flat('#f4f4f4');
      c.mesh(spine, 'ts_zip', flat('#e8e8e8'), () => [xf(G.box(0.02, 0.4, 0.012), [0, 0.28, 0.16])]);
      c.mesh(spine, 'ts_collar', white, () => [xf(G.box(0.1, 0.05, 0.03), [0.05, 0.5, 0.15], [0, 0, 0.5]), xf(G.box(0.1, 0.05, 0.03), [-0.05, 0.5, 0.15], [0, 0, -0.5])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'ts_arm', white, () => [xf(G.box(0.016, 0.34, 0.03), [0.086 * (arm === armL ? 1 : -1), -0.18, 0]), xf(G.box(0.03, 0.34, 0.016), [0, -0.18, -0.086])]);
        c.mesh(arm.el, 'ts_cuff', white, () => [limbRing(0.073, 0.03, -0.22)]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.hip, 'ts_leg', white, () => [xf(G.box(0.016, 0.44, 0.06), [0.098 * (leg === legL ? 1 : -1), -0.24, 0])]);
        c.mesh(leg.knee, 'ts_leg2', white, () => [xf(G.box(0.016, 0.4, 0.06), [0.088 * (leg === legL ? 1 : -1), -0.2, 0])]);
      }
      c.mesh(spine, 'ts_chain', glow('#f0c040', '#5a4000'), () => [xf(G.tor(0.13, 0.008, 3, 10, PI), [0, 0.42, 0.11], [PI / 2 + 0.5, 0, PI])]);
      c.mesh(headgear, 'ts_band', flat('#e8e8e8'), () => [xf(G.tor(0.185, 0.016, 3, 12), [0, -0.1, 0], [PI / 2, 0, 0])]);
    },
  },

  // ---------------------------------------------------------------- SAMURAI
  samurai: {
    tint: '#7a1a20', glove: '#1a1416', boot: '#1a1416', belt: '#c8a030', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const red = flat('#a01f26'), gold = glow('#d8b048', '#3a2a00'), black = flat('#16141a');
      c.mesh(spine, 'sm_plate', red, () => [0.42, 0.32, 0.22, 0.12].map((y, i) => ring(y, 0.11, 0.02 + i * 0.004)));
      c.mesh(spine, 'sm_lace', gold, () => [xf(G.box(0.03, 0.4, 0.014), [0.08, 0.28, 0.163]), xf(G.box(0.03, 0.4, 0.014), [-0.08, 0.28, 0.163])]);
      c.mesh(spine, 'sm_skirt', black, () => [xf(G.cyl(0.29, 0.34, 0.24, 8, true), [0, -0.12, 0], [0, PI / 8, 0], [1, 1, 0.75])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'sm_sode', red, () => [0, 1, 2].map((i) => xf(G.box(0.2 - i * 0.02, 0.05, 0.16), [0, 0.06 - i * 0.055, 0], [0, 0, 0])));
        c.mesh(arm.sh, 'sm_sode2', gold, () => [xf(G.box(0.2, 0.012, 0.165), [0, 0.09, 0])]);
        c.mesh(arm.el, 'sm_kote', black, () => [limbRing(0.078, 0.2, -0.13)]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'sm_sune', black, () => [limbRing(0.09, 0.22, -0.14)]);
      // kabuto: red bowl, neck guard, gold crest
      c.mesh(headgear, 'sm_kabuto', red, () => [dome(0.2, -0.06, 0.9, 1.06), xf(G.box(0.42, 0.05, 0.14), [0, -0.14, -0.2], [0.25, 0, 0]), xf(G.box(0.05, 0.12, 0.12), [0.2, -0.13, -0.05], [0, 0, -0.4]), xf(G.box(0.05, 0.12, 0.12), [-0.2, -0.13, -0.05], [0, 0, 0.4])]);
      c.mesh(headgear, 'sm_crest', gold, () => [xf(G.cone(0.02, 0.24, 4), [0.05, 0.11, 0.17], [-0.2, 0, 0.9]), xf(G.cone(0.02, 0.24, 4), [-0.05, 0.11, 0.17], [-0.2, 0, -0.9]), xf(G.cyl(0.015, 0.015, 0.03, 5), [0, 0.0, 0.2], [PI / 2, 0, 0])]);
    },
  },

  // ---------------------------------------------------------------- KNIGHT
  knight: {
    tint: '#8d939e', glove: '#6a707a', boot: '#5a606a', belt: '#3a2a1a', hide: ['helmetbits', 'belt'],
    build(c, headgear) {
      const { spine, armL, armR, legL, legR } = c.rig;
      const steel = lam('#b8bec8', { emissive: '#1a1c20' }), dark = flat('#5a606a'), white = flat('#e8e6e0'), red = flat('#b0202a');
      c.mesh(spine, 'kn_plate', steel, () => [xf(G.box(0.4, 0.3, 0.06), [0, 0.32, 0.16]), xf(G.box(0.36, 0.28, 0.06), [0, 0.32, -0.16]), ring(0.06, 0.1, 0.02)]);
      c.mesh(spine, 'kn_tabard', white, () => [xf(G.box(0.26, 0.5, 0.02), [0, 0.12, 0.2]), xf(G.box(0.24, 0.42, 0.02), [0, 0.1, -0.2])]);
      c.mesh(spine, 'kn_cross', red, () => [xf(G.box(0.05, 0.36, 0.012), [0, 0.14, 0.212]), xf(G.box(0.2, 0.05, 0.012), [0, 0.2, 0.212])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.sh, 'kn_pauld', steel, () => [xf(G.sph(0.13, 7, 4, 0, TAU, 0, PI / 2), [0, 0.05, 0], [0, 0, 0], [1, 0.75, 1]), limbRing(0.09, 0.16, -0.15)]);
        c.mesh(arm.el, 'kn_vambrace', dark, () => [limbRing(0.08, 0.2, -0.12), xf(G.sph(0.06, 6, 4), [0, 0.0, 0.0])]);
      }
      for (const leg of [legL, legR]) {
        c.mesh(leg.hip, 'kn_cuisse', steel, () => [limbRing(0.11, 0.26, -0.2)]);
        c.mesh(leg.knee, 'kn_greave', steel, () => [limbRing(0.094, 0.24, -0.14), xf(G.sph(0.07, 6, 4), [0, 0.0, 0.07], [0, 0, 0], [1, 0.9, 0.6])]);
      }
      // great helm: closed bucket with a slit and a crest
      c.mesh(headgear, 'kn_helm', steel, () => [xf(G.cyl(0.215, 0.22, 0.26, 10), [0, -0.12, 0.0]), dome(0.215, 0.01, 0.55, 1.0)]);
      c.mesh(headgear, 'kn_slit', flat('#0a0a0e'), () => [xf(G.box(0.24, 0.03, 0.02), [0, -0.09, 0.225]), xf(G.box(0.03, 0.14, 0.02), [0, -0.15, 0.226])]);
      c.mesh(headgear, 'kn_plume', red, () => [xf(G.cone(0.05, 0.2, 5), [0, 0.12, -0.02], [-0.3, 0, 0], [0.6, 1, 1.4])]);
    },
  },

  // ---------------------------------------------------------------- CYBER NINJA
  cyberninja: {
    tint: '#101218', glove: '#07080b', boot: '#07080b', belt: '#0a0a10', emissive: '#04070c', hide: ['backpack', 'helmetbits'], eye: '#38f0ff',
    build(c, headgear) {
      const { spine, armL, armR, legL, legR, head } = c.rig;
      const cy = bas('#38f0ff'), black = flat('#0b0c10');
      c.mesh(spine, 'cn_lines', cy, () => [xf(G.box(0.014, 0.34, 0.01), [0.1, 0.3, 0.166], [0, 0, 0.2]), xf(G.box(0.014, 0.34, 0.01), [-0.1, 0.3, 0.166], [0, 0, -0.2]), xf(G.box(0.2, 0.014, 0.01), [0, 0.1, 0.168])]);
      for (const arm of [armL, armR]) {
        c.mesh(arm.el, 'cn_arm', cy, () => [xf(G.box(0.01, 0.2, 0.01), [0, -0.1, 0.076]), limbRing(0.076, 0.012, -0.2)]);
        c.mesh(arm.sh, 'cn_pad', black, () => [xf(G.box(0.14, 0.04, 0.14), [0, 0.05, 0])]);
      }
      for (const leg of [legL, legR]) c.mesh(leg.knee, 'cn_leg', cy, () => [xf(G.box(0.01, 0.22, 0.01), [0, -0.12, 0.09])]);
      // hood + face band, katana on the back, fluttering scarf
      c.mesh(headgear, 'cn_hood', black, () => [dome(0.215, -0.06, 0.95, 1.08), xf(G.box(0.38, 0.2, 0.05), [0, -0.19, -0.2])]);
      c.mesh(headgear, 'cn_band', cy, () => [xf(G.box(0.34, 0.018, 0.02), [0, -0.09, 0.2])]);
      c.mesh(spine, 'cn_sheath', black, () => [xf(G.cyl(0.018, 0.018, 0.7, 5), [-0.05, 0.3, -0.19], [0, 0, 0.6])]);
      c.mesh(spine, 'cn_hilt', cy, () => [xf(G.box(0.03, 0.02, 0.03), [0.18, 0.55, -0.19], [0, 0, 0.6])]);
      const scarf = c.group(spine, [0, 0.52, -0.05]);
      c.mesh(scarf, 'cn_scarf', flat('#38f0ff'), () => [xf(G.box(0.08, 0.02, 0.4), [0, 0, -0.2]), xf(G.box(0.07, 0.02, 0.3), [0.06, -0.02, -0.16])]);
      c.anim((dt, t) => { scarf.rotation.x = 0.35 + Math.sin(t * 3) * 0.12; scarf.rotation.y = Math.sin(t * 2.1) * 0.15; });
      void head;
    },
  },

  // ---------------------------------------------------------------- VIKING
  viking: {
    tint: '#6a4a2e', glove: '#3a2818', boot: '#2a1c10', belt: '#3a2a1a', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine, armL, armR } = c.rig;
      const fur = flat('#8a7a68'), leather = flat('#4a3220'), iron = flat('#8a8e96'), bone = flat('#e8e0c8');
      c.mesh(spine, 'vk_mantle', fur, () => [xf(G.cyl(0.24, 0.34, 0.18, 8, true), [0, 0.46, 0], [0, PI / 8, 0], [1, 1, 0.78]), xf(G.sph(0.1, 6, 4), [0.3, 0.44, 0], [0, 0, 0], [1, 0.7, 1]), xf(G.sph(0.1, 6, 4), [-0.3, 0.44, 0], [0, 0, 0], [1, 0.7, 1])]);
      c.mesh(spine, 'vk_belt', leather, () => [ring(0.04, 0.07, 0.02), xf(G.box(0.07, 0.07, 0.02), [0, 0.04, 0.19])]);
      for (const arm of [armL, armR]) c.mesh(arm.el, 'vk_brace', leather, () => [limbRing(0.076, 0.16, -0.12)]);
      c.mesh(headgear, 'vk_helm', iron, () => [dome(0.2, -0.06, 0.9, 1.06), xf(G.box(0.03, 0.03, 0.4), [0, 0.04, 0]), xf(G.box(0.05, 0.14, 0.02), [0, -0.12, 0.2])]);
      c.mesh(headgear, 'vk_horns', bone, () => [xf(G.cone(0.038, 0.24, 5), [0.22, 0.0, 0], [0, 0, -1.0]), xf(G.cone(0.038, 0.24, 5), [-0.22, 0.0, 0], [0, 0, 1.0]), xf(G.cone(0.02, 0.1, 4), [0.33, 0.08, 0], [0, 0, -0.3]), xf(G.cone(0.02, 0.1, 4), [-0.33, 0.08, 0], [0, 0, 0.3])]);
      c.mesh(headgear, 'vk_beard', flat('#c0782a'), () => [xf(G.box(0.2, 0.2, 0.05), [0, -0.26, 0.17]), xf(G.box(0.12, 0.15, 0.05), [0, -0.38, 0.17])]);
    },
  },

  // ---------------------------------------------------------------- SECRET AGENT
  agent: {
    tint: '#15171c', glove: '#0a0a0c', boot: '#0a0a0c', belt: '#0a0a0c', hide: ['helmetbits'],
    build(c, headgear) {
      const { spine } = c.rig;
      c.mesh(spine, 'ag_shirt', flat('#f2f2f2'), () => [xf(G.box(0.12, 0.34, 0.012), [0, 0.3, 0.158])]);
      c.mesh(spine, 'ag_tie', flat('#101014'), () => [xf(G.box(0.028, 0.3, 0.014), [0, 0.3, 0.166]), xf(G.box(0.045, 0.04, 0.02), [0, 0.46, 0.165])]);
      c.mesh(spine, 'ag_lapel', flat('#0c0d10'), () => [xf(G.box(0.1, 0.3, 0.02), [0.1, 0.3, 0.163], [0, 0, 0.28]), xf(G.box(0.1, 0.3, 0.02), [-0.1, 0.3, 0.163], [0, 0, -0.28])]);
      c.mesh(spine, 'ag_pin', flat('#d8b048'), () => [xf(G.box(0.02, 0.02, 0.01), [-0.12, 0.38, 0.172])]);
      c.mesh(spine, 'ag_holster', flat('#0c0c0e'), () => [xf(G.box(0.05, 0.14, 0.07), [-0.245, 0.24, 0.02])]);
      // earpiece + wire, shades-band (visor stays readable)
      c.mesh(headgear, 'ag_ear', flat('#1a1a1e'), () => [xf(G.box(0.03, 0.05, 0.03), [0.2, -0.16, 0.02])]);
      c.mesh(headgear, 'ag_wire', flat('#d8c8a0'), () => [xf(G.cyl(0.005, 0.005, 0.2, 4), [0.2, -0.27, 0.0])]);
    },
  },
};

void THREE;
