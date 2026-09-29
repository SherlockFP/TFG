// WAVE 3 worlds2 - PLASMA BLADE (glowing humming energy sword, tier colours, coloured swing trails, deflects blaster bolts while blocking)
// and the BLASTER PISTOL (+ Blaster Cell ammo). Both plug into the wave-2 combat module:
//   * the blade is a melee weapon with its own move set `saber` (added to combat.js CLASSES: fast 3-hit chain, wide parry window, strong guard);
//     RMB hold = block: incoming BLASTER shots from creatures (scavenger raiders, squad gunners, turrets...) are deflected for 0 damage and
//     reflected back at the shooter (host request `w2deflect`, damage scaled by the blade tier); melee blows use the normal block / parry.
//   * the blaster is a `cfire: 'hitscan'` weapon, so combat_weapons.js already gives it ammo HUD, reload (R) and host validation; it only adds
//     a red tracer colour (def.tracer), sounds and recoil.
// Everything degrades gracefully when the combat module is missing (items still exist, only the extras are skipped).
import * as THREE from 'three';
import { ITEMS, registerItem } from './items.js';
import { WEAPON_RECOIL } from '../models/avatar.js';
import { tierOfItem, TIERS } from './tiers.js';
import { CLASSES } from './combat.js';
import { W2_ITEM_MODELS } from '../models/worlds2_models.js';
import { synth, sin, ex, nz, clamp, fin3, arr3 } from './combat_kit.js';
import { t } from '../core/i18n.js';

// ------------------------------------------------------------------------------------------------ item data
export const BLADE_COLORS = { common: 0x35e0ff, uncommon: 0x4eff6a, rare: 0x4a7dff, epic: 0xb35cff, legendary: 0xffa02a, mythic: 0xff2a4a };
export const bladeColor = (tier) => BLADE_COLORS[tier] ?? BLADE_COLORS.common;
const W = (id, name, o) => ({ id, name, kind: 'weapon', hands: 1, weight: 4, shop: 'weapons', ...o });
export const W2_WEAPON_DEFS = [
  W('plasmablade', 'Plasma Blade', { price: 1100, weight: 3, dmg: 30, cd: 0.42, reach: 2.35, knock: 1.1, rarity: 'epic', tier: 'epic', value: [170, 260], cclass: 'saber', deflect: true, parryMul: 1.3, blockMul: 1.15,
    blurb: 'A humming energy blade whose colour follows its tier. Hold RMB to block: blaster bolts are deflected back at the shooter. Fast 3-hit combo, wide parry window.' }),
  W('blaster', 'Blaster Pistol', { price: 420, weight: 3, dmg: 20, cd: 0.34, reach: 70, ammo: 10, ammoItem: 'blastercell', reload: 1.3, ranged: true, cfire: 'hitscan', spread: 0.012, noise: 2, fireSnd: 'w2_blaster', tracer: 0xff3a2a, knock: 0.5,
    rarity: 'rare', tier: 'rare', value: [60, 95], blurb: 'Sidearm of the desert scavengers. Red bolts, 10 shots per cell. R reloads from a Blaster Cell in your slots.' }),
];
export const W2_AMMO_DEFS = [
  { id: 'blastercell', name: 'Blaster Cell', kind: 'consumable', hands: 1, weight: 0.5, ammoFor: true, shop: 'consumables', price: 45, charges: 30, value: [6, 12], blurb: '30 shots for the Blaster Pistol.' },
];
for (const d of [...W2_WEAPON_DEFS, ...W2_AMMO_DEFS]) if (!ITEMS[d.id]) registerItem(d);
WEAPON_RECOIL.blaster = { dur: 0.3, jitter: 0.004, K: { x: 0.3, e: 0.14, pz: 0.1, py: 0.03, wr: -0.16 } };

// ------------------------------------------------------------------------------------------------ the saber move set (combat.js CLASSES)
const A = (arc, o = {}) => ({ arc, t: 1.1, dmg: 1, kb: 1, half: 0.8, reach: 1, stam: 1, cleave: 1, stun: 0, ...o });
export function registerSaberClass() {
  if (CLASSES.saber) return false;
  CLASSES.saber = {
    L: [A('cb:slashR', { t: 0.9, half: 0.95, cleave: 3, stam: 0.8 }), A('cb:slashL', { t: 0.9, half: 0.95, cleave: 3, stam: 0.8 }), A('cb:over', { t: 1.3, dmg: 1.4, kb: 1.3, half: 0.7, cleave: 3, stun: 0.3, stam: 0.9 })],
    H: A('cb:sweepR', { t: 1.5, dmg: 1.9, kb: 2.0, half: 1.25, cleave: 4, stun: 0.7 }), chargeT: 0.5, guard: 'cb:guard1', block: 0.85, parry: 0.34, backstab: 1.6,
  };
  return true;
}

// ------------------------------------------------------------------------------------------------ procedural sounds
export const W2_SOUNDS = {
  w2_blaster: (sr) => synth(sr, 0.28, (tt) => sin(1500 * Math.exp(-tt * 9) + 260, tt) * ex(tt, 14) + nz() * ex(tt, 60) * 0.35 + sin(90, tt) * ex(tt, 20) * 0.4),
  w2_saber_on: (sr) => synth(sr, 0.55, (tt) => (sin(90 + 260 * tt, tt) * 0.6 + sin(180 + 520 * tt, tt) * 0.3) * Math.min(1, tt * 14) * (1 - tt * 0.6) + nz() * ex(tt, 40) * 0.15),
  w2_saber_off: (sr) => synth(sr, 0.4, (tt) => (sin(310 - 500 * tt, tt) * 0.6 + sin(120, tt) * 0.3) * ex(tt, 7)),
  w2_swing: (sr) => synth(sr, 0.34, (tt) => (sin(150 + 380 * Math.sin(Math.min(1, tt / 0.34) * Math.PI), tt) * 0.55 + sin(300, tt) * 0.25) * Math.sin(Math.min(1, tt / 0.34) * Math.PI) + nz() * 0.06),
  w2_hum: (sr) => synth(sr, 1.0, (tt) => (sin(96, tt) + 0.6 * sin(192, tt) + 0.3 * sin(288, tt) + 0.12 * sin(31, tt)) * (0.8 + 0.2 * sin(4, tt))),
  w2_deflect: (sr) => synth(sr, 0.5, (tt) => (sin(1980, tt) * 0.6 + sin(3120, tt) * 0.35 + sin(240 + 900 * ex(tt, 12), tt) * 0.5) * ex(tt, 9) + nz() * ex(tt, 70) * 0.5),
};

// ------------------------------------------------------------------------------------------------ install
const RANGED_CAUSES = new Set(['scavraider', 'hs_gunner', 'hs_leader', 'moderator', 'turret']);
export function installWorlds2Weapons(game) {
  const g = game, offs = [];
  const K = g.combat?.kit || null;
  const state = { hum: null, humFor: null, ignite: 0, wasHeld: false, colorT: 0, lastAtk: null, trailSet: false, deflects: 0 };
  const held = () => g.player?.heldItem?.() || null;
  const isBlade = (it) => it?.type === 'plasmablade';
  const modelOf = (it) => it?.obj?.userData?.inner || null;
  const api = { state, bladeColor, dispose() {} };
  if (!K) return api;

  registerSaberClass();
  K.sounds(W2_SOUNDS);
  K.models({ plasmablade: W2_ITEM_MODELS.plasmablade, blaster: W2_ITEM_MODELS.blaster, blastercell: W2_ITEM_MODELS.blastercell });

  // ---- tier colours + ignite animation + hum + coloured swing trail (client, every peer for the model colour)
  const applyColor = (it) => {
    const m = modelOf(it);
    if (!m?.userData?.setBladeColor) return;
    const hex = bladeColor(tierOfItem(it, it.def));
    if (it._w2c !== hex) { it._w2c = hex; m.userData.setBladeColor(hex); }
  };
  const setIgnite = (it, s) => {
    const b = modelOf(it)?.userData?.blade;
    if (!b) return;
    const L = 0.98;
    for (const part of [b.blade, b.core, b.glow]) { part.scale.y = Math.max(0.001, s); part.position.z = -0.18 - (L * Math.max(0.001, s)) / 2; }
    b.glow.material.opacity = 0.26 + 0.07 * Math.sin(g.time * 41) * s;
  };
  K.update((dt) => {
    const it = held();
    // world / remote copies: keep the colour right (cheap: only blades)
    state.colorT -= dt;
    if (state.colorT <= 0) { state.colorT = 0.5; for (const x of g.items.all()) if (isBlade(x)) applyColor(x); }
    const blade = isBlade(it) && !g.player.dead;
    if (blade) {
      applyColor(it);
      if (!state.wasHeld) { state.ignite = 0; K.snd('w2_saber_on', null, 0.7); }
      state.ignite = Math.min(1, state.ignite + dt * 5);
      setIgnite(it, state.ignite);
      // hum loop
      if (!state.hum) { try { K.mm?.ensureSound?.('w2_hum'); state.hum = g.audio.play('w2_hum', { loop: true, volume: 0.13, bus: 'sfx' }) || null; } catch { state.hum = null; } }
      // trail colour follows the tier
      const vm = g.viewModel;
      if (vm?.trailColor) { vm.trailColor.setHex(bladeColor(tierOfItem(it, it.def))); state.trailSet = true; }
      // swing whoosh + glow flash on the frame an attack starts
      const atk = g.combat?.melee?.state?.atk || null;
      if (atk && atk !== state.lastAtk) { K.snd('w2_swing', null, 0.5, 0.92 + Math.random() * 0.16); g.engine.flash?.(bladeColor(tierOfItem(it, it.def)), 0.06); }
      state.lastAtk = atk;
    } else {
      if (state.hum) { try { state.hum.stop?.(0.15); } catch { /* ignore */ } state.hum = null; if (state.wasHeld) K.snd('w2_saber_off', null, 0.5); }
      if (state.trailSet && g.viewModel?.trailColor) { g.viewModel.trailColor.setHex(0xdff0ff); state.trailSet = false; }
      state.lastAtk = null;
    }
    state.wasHeld = blade;
  });

  // ---- deflect (client): runs after the melee module's own block hook, so it can only make things better
  K.on('localHurt', (d, gg) => {
    if (gg !== g || !d || d.cbDeflected) return;
    const it = held();
    if (!it?.def?.deflect || !g.combat?.melee?.state?.block?.on) return;
    const v = d.from ? g.creatures.views.get(d.from) : null;
    if (!RANGED_CAUSES.has(d.cause)) return;                                // cause = the shooter's creature type (M.attack default)
    const p = g.player, src = fin3(d.p) || v?.pos;
    if (!src) return;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion); f.y = 0; f.normalize();
    const tx = src.x - p.pos.x, tz = src.z - p.pos.z, Lh = Math.hypot(tx, tz) || 1;
    if ((f.x * tx + f.z * tz) / Lh < 0.1) return;                       // must face the shooter
    d.dmg = 0; d.cbDeflected = true; state.deflects++;
    K.snd('w2_deflect', null, 0.9, 0.9 + Math.random() * 0.25);
    g.engine.shake(0.14); g.engine.flash?.(bladeColor(tierOfItem(it, it.def)), 0.12);
    g.viewModel?.impact?.('metal', 1.1);
    const at = p.eyePos().clone().addScaledVector(f, 0.9);
    K.burst(at, 'sparks', null, 1.4);
    g.ui?.hud?.floatText(p.eyePos().clone().setY(p.eyePos().y + 0.25), t('DEFLECTED'), '#9fe8ff', true);
    if (d.from) g.net.request('w2deflect', { cid: d.from, w: it.id });
  });
  // the reflected bolt: a bright tracer back to the shooter (every peer)
  K.onFx('w2bolt', (d) => {
    const a = fin3(d.a), b = fin3(d.b);
    if (!a || !b) return;
    K.beam(a, b, Number.isFinite(d.c) ? d.c : 0x9fe8ff, 0.14, 0.03);
    K.burst(b, 'sparks', null, 1.2);
  });
  // ---- deflect (host): reflect damage back at the shooter
  const last = new Map();
  K.hostOn('w2deflect', (d, from) => {
    const it = g.items.get(d?.w), c = g.creatures.host.get(d?.cid);
    if (!it || it.holder !== from || !it.def.deflect || !c || c.dead) return;
    const now = g.time;
    if (now - (last.get(from) ?? -9) < 0.25) return;
    last.set(from, now);
    const pp = K.posOf(from);
    if (pp && pp.distanceTo(c.pos) > 60) return;
    const dmg = Math.round((it.def.dmg || 30) * (TIERS[tierOfItem(it, it.def)]?.statMul || 1) * 0.8);
    K.hurt(c, dmg, from, { stun: 0.3 });
    K.fx('w2bolt', { a: arr3(K.headOf(from) || pp || c.pos), b: arr3(K.ctrOf(c)), c: bladeColor(tierOfItem(it, it.def)) });
  });

  api.dispose = () => {
    if (state.hum) { try { state.hum.stop?.(0.1); } catch { /* ignore */ } state.hum = null; }
    if (state.trailSet && g.viewModel?.trailColor) g.viewModel.trailColor.setHex(0xdff0ff);
    for (const off of offs) { try { off(); } catch { /* ignore */ } }
  };
  return api;
}
void clamp;
