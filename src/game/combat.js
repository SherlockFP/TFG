// TFG wave 2 - DETAILED COMBAT (docs/wave2/combat.md). Module `combat`, installed by game.js with
//   this.useModule('combat', installCombat);
//
// This file = the MELEE system for every melee weapon (existing + new): LMB tap = light attack chained into a 3-hit combo
// with distinct arcs, LMB hold = charged heavy attack with stagger, RMB hold = BLOCK (first ~0.28 s = PARRY: negates the hit,
// stuns the attacker, slow-mo flash, riposte bonus), RMB tap = scan (unchanged), backstab bonus, stamina per swing, hit-stop and
// camera kick scaled by weapon weight. Host-authoritative: the client finds targets (arc sweep), the host recomputes damage
// (`cbhit`), validates parries (`cbparry`) and applies stagger / bleed.
// The rest lives in combat_weapons.js (new weapons, rockets, grav tool), spells_ext.js and role_skills.js, all sharing combat_kit.js.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { WEAPON_ARCS } from '../models/avatar.js';
import { damp } from '../core/util.js';
import { addTranslations, t } from '../core/i18n.js';
import { hudDock } from '../ui/dock.js';
import { applyAffixes, applyAffixEffects } from './loot.js';
import { tierDmg } from './actions.js';
import { createKit, clamp, fin3, arr3, synth, sin, ex, nz } from './combat_kit.js';
import { installCombatWeapons } from './combat_weapons.js';
import { installSpellsExt } from './spells_ext.js';
import { installRoleSkills } from './role_skills.js';

// ================================================================================================== swing arcs (models/avatar.js data)
// pose deltas: x/y/z shoulder rotation (y<0 = right, y>0 = left), e elbow, px/py/pz arm position, roll/wr wrist. w / s = end of wind-up / strike.
const mir = (p) => { const o = { ...p }; for (const k of ['y', 'z', 'roll', 'px']) if (o[k] != null) o[k] = -o[k]; return o; };
const arc = (key, W, S, o = {}) => { WEAPON_ARCS[key] = { w: 0.3, s: 0.58, trail: 1, both: 0.85, ...o, W, S }; };
const arcPair = (key, W, S, o) => { arc(key + 'R', W, S, o); arc(key + 'L', mir(W), mir(S), o); };
arcPair('cb:slash', { x: 0.55, y: -0.95, z: -1.1, e: 0.9, px: 0.1, py: 0.08, pz: 0.1, roll: 1.1, wr: -0.3 }, { x: 0.3, y: 1.25, z: 0.2, e: -0.1, px: -0.2, py: -0.02, pz: -0.16, roll: -0.9, wr: 0.35 }, { w: 0.27, s: 0.55, both: 0.5 });
arcPair('cb:chop', { x: 1.7, y: -0.7, z: -0.7, e: 0.8, py: 0.15, pz: 0.12, roll: 0.5, wr: -0.5 }, { x: -1.0, y: 0.8, z: 0.5, e: -0.15, py: -0.1, pz: -0.16, px: -0.12, roll: -0.6, wr: 0.55 }, { w: 0.3, s: 0.6 });
arcPair('cb:sweep', { x: 0.5, y: -1.2, z: -1.0, e: 0.9, px: 0.14, py: 0.08, pz: 0.14, roll: 1.0, wr: -0.3 }, { x: 0.2, y: 1.5, z: 0.3, e: -0.05, px: -0.24, pz: -0.2, roll: -1.0, wr: 0.4 }, { w: 0.36, s: 0.66 });
arcPair('cb:stab', { x: 0.25, y: -0.35, z: -0.3, e: 1.0, px: 0.06, pz: 0.16, wr: -0.2 }, { x: 0.15, y: 0.15, z: 0.1, e: -0.55, px: -0.06, pz: -0.5, wr: 0.2 }, { w: 0.3, s: 0.52, trail: 0.6, both: 0.4 });
arcPair('cb:thrust', { x: 0.2, y: -0.2, z: -0.2, e: 1.15, px: 0.05, pz: 0.34, wr: -0.1 }, { x: 0.1, y: 0.05, e: -0.75, px: -0.02, pz: -0.62, wr: 0.1 }, { w: 0.32, s: 0.55, trail: 0.6, both: 0.6 });
arc('cb:over', { x: 2.0, y: -0.1, z: -0.4, e: 0.8, py: 0.18, pz: 0.14, roll: 0.2, wr: -0.5 }, { x: -1.15, y: 0.35, z: 0.2, e: -0.2, py: -0.12, pz: -0.18, px: -0.04, wr: 0.6 }, { w: 0.32, s: 0.62 });
arc('cb:overH', { x: 2.3, y: 0, z: -0.2, e: 1.0, py: 0.24, pz: 0.2, wr: -0.6 }, { x: -1.3, y: 0.25, z: 0.1, e: -0.3, py: -0.22, pz: -0.2, wr: 0.7 }, { w: 0.38, s: 0.66 });
arc('cb:slamG', { x: 2.5, e: 1.1, py: 0.28, pz: 0.24, wr: -0.7 }, { x: -1.4, y: 0.2, e: -0.35, py: -0.25, pz: -0.24, wr: 0.8 }, { w: 0.4, s: 0.68 });
arc('cb:lunge', { x: 0.5, y: -0.3, e: 1.4, py: 0.06, pz: 0.35, wr: -0.3 }, { x: 0, y: 0.1, e: -1.0, pz: -0.85, wr: 0.3 }, { w: 0.4, s: 0.64, trail: 0.6, both: 0.6 });
arc('cb:stabF', { x: 0.35, y: -0.2, e: 1.2, py: 0.05, pz: 0.25 }, { x: 0.05, y: 0.1, e: -0.8, pz: -0.7 }, { w: 0.34, s: 0.58, trail: 0.6, both: 0.5 });
arc('cb:guard1', { x: 0.95, y: 0.5, z: 0.5, e: 0.9, px: -0.12, py: 0.1, pz: 0.08, roll: -0.5, wr: -0.2 }, {}, { trail: 0 });
arc('cb:guard2', { x: 1.1, y: 0.35, z: 0.4, e: 0.95, px: -0.08, py: 0.12, pz: 0.1, roll: -0.4, wr: -0.25 }, {}, { trail: 0 });

// ================================================================================================== weapon classes
// t = swing duration as a multiple of def.cd (light chain averages ~0.95 x cd, so dps stays close to the old numbers), dmg / kb multipliers,
// half = arc half-width (rad), reach multiplier, cleave = max targets, stun = stagger seconds (heavy scales with charge).
const A = (a, o = {}) => ({ arc: a, t: 1.1, dmg: 1, kb: 1, half: 0.8, reach: 1, stam: 1, cleave: 1, stun: 0, ...o });
export const CLASSES = {
  club: { L: [A('cb:slashR', { cleave: 2 }), A('cb:slashL', { cleave: 2 }), A('cb:over', { t: 1.6, dmg: 1.3, kb: 2, half: 0.55, stun: 0.4 })],
    H: A('cb:overH', { t: 1.7, dmg: 2.0, kb: 3, half: 0.7, cleave: 2, stun: 0.9 }), chargeT: 0.65, guard: 'cb:guard1', block: 0.5, parry: 0.26 },
  sword: { L: [A('cb:slashR', { t: 1.05, half: 0.85, cleave: 2 }), A('cb:slashL', { t: 1.05, half: 0.85, cleave: 2 }), A('cb:over', { t: 1.55, dmg: 1.35, kb: 1.6, half: 0.6, stun: 0.35, cleave: 2 })],
    H: A('cb:overH', { t: 1.6, dmg: 1.9, kb: 2.4, half: 0.75, cleave: 3, stun: 0.8 }), chargeT: 0.55, guard: 'cb:guard1', block: 0.7, parry: 0.28 },
  dagger: { L: [A('cb:stabR', { t: 1.0, half: 0.45, reach: 0.9 }), A('cb:stabL', { t: 1.0, half: 0.45, reach: 0.9 }), A('cb:stabF', { t: 1.5, dmg: 1.5, kb: 1.2, half: 0.4, reach: 1.05 })],
    H: A('cb:lunge', { t: 1.5, dmg: 1.9, kb: 1.8, half: 0.3, reach: 1.3 }), chargeT: 0.4, guard: 'cb:guard1', block: 0.3, parry: 0.32, backstab: 1.75 },
  axe: { L: [A('cb:chopR', { t: 1.15, half: 0.7, cleave: 2 }), A('cb:chopL', { t: 1.15, half: 0.7, cleave: 2 }), A('cb:over', { t: 1.6, dmg: 1.4, kb: 1.5, half: 0.55 })],
    H: A('cb:overH', { t: 1.8, dmg: 2.2, kb: 2.4, half: 0.7, cleave: 2, stun: 0.7 }), chargeT: 0.7, guard: 'cb:guard1', block: 0.5, parry: 0.24 },
  great: { L: [A('cb:sweepR', { t: 1.2, half: 1.15, cleave: 4, kb: 1.5 }), A('cb:sweepL', { t: 1.2, half: 1.15, cleave: 4, kb: 1.5 }), A('cb:over', { t: 1.7, dmg: 1.35, kb: 2.2, half: 0.85, cleave: 3, stun: 0.5 })],
    H: A('cb:slamG', { t: 1.9, dmg: 2.1, kb: 3, half: 1.5, cleave: 5, stun: 1.0 }), chargeT: 0.8, guard: 'cb:guard2', block: 0.8, parry: 0.2 },
  hammer: { L: [A('cb:over', { t: 1.3, kb: 2, half: 0.65, cleave: 2, stun: 0.3 }), A('cb:sweepR', { t: 1.25, kb: 2, half: 0.95, cleave: 2 }), A('cb:over', { t: 1.8, dmg: 1.4, kb: 3, half: 0.8, cleave: 3, stun: 0.6 })],
    H: A('cb:slamG', { t: 2.0, dmg: 2.2, kb: 3, half: 1.4, cleave: 5, stun: 1.2 }), chargeT: 0.85, guard: 'cb:guard2', block: 0.6, parry: 0.18 },
  spear: { L: [A('cb:thrustR', { t: 1.05, half: 0.22, cleave: 2 }), A('cb:thrustL', { t: 1.05, half: 0.22, cleave: 2 }), A('cb:stabF', { t: 1.5, dmg: 1.3, kb: 1.6, half: 0.25, reach: 1.12, cleave: 3 })],
    H: A('cb:lunge', { t: 1.7, dmg: 1.9, kb: 2.2, half: 0.28, reach: 1.3, cleave: 3 }), chargeT: 0.6, guard: 'cb:guard1', block: 0.5, parry: 0.26 },
};
const CLASS_OF_ID = { knife: 'dagger', twindaggers: 'dagger', bat: 'club', nailbat: 'club', pipe: 'club', crowbar: 'club', stopsign: 'club', machete: 'sword', katana: 'sword', longsword: 'sword',
  greatsword: 'great', shovel: 'axe', waraxe: 'axe', sledge: 'hammer', warhammer: 'hammer', spear: 'spear' };
export const classOf = (def) => (CLASSES[def?.cclass] ? def.cclass : CLASS_OF_ID[def?.id] || (def?.hands === 2 ? 'hammer' : 'club'));
export const isMeleeDef = (def) => !!def && def.kind === 'weapon' && !def.ranged && !def.cfire && !def.wfire;

addTranslations({
  'PARRY!': 'PARRY!', 'BLOCKED': 'BLOKLANDI', 'GUARD BROKEN': 'SAVUNMA KIRILDI', 'BACKSTAB': 'ARKADAN', 'RIPOSTE': 'KARŞI SALDIRI',
  'Longsword': 'Uzun Kılıç', 'Greatsword': 'Büyük Kılıç', 'Twin Daggers': 'İkiz Hançer', 'Spear': 'Mızrak', 'War Axe': 'Savaş Baltası', 'War Hammer': 'Savaş Çekici',
});

// ---------------------------------------------------------------- procedural sounds
const SOUNDS = {
  cb_whoosh: (sr) => { let lp = 0; return synth(sr, 0.22, (t) => { lp += (nz() - lp) * (0.1 + t * 2); return lp * Math.sin((t / 0.22) * Math.PI) * 0.9; }); },
  cb_whoosh_h: (sr) => { let lp = 0; return synth(sr, 0.4, (t) => { lp += (nz() - lp) * (0.05 + t * 0.6); return lp * Math.sin((t / 0.4) * Math.PI) * 1.1 + sin(70 - 30 * t, t) * ex(t, 6) * 0.4; }); },
  cb_parry: (sr) => synth(sr, 0.6, (t) => (sin(1870, t) + sin(2790, t) * 0.7 + sin(4110, t) * 0.4) * ex(t, 9) + nz() * ex(t, 60) * 0.7),
  cb_block: (sr) => synth(sr, 0.3, (t) => (sin(310 + 80 * ex(t, 30), t) * ex(t, 16) + sin(920, t) * ex(t, 24) * 0.4) + nz() * ex(t, 70) * 0.6),
  cb_charge: (sr) => synth(sr, 0.5, (t) => sin(180 + 320 * t, t) * Math.min(1, t * 8) * 0.5 * (1 - t)),
  cb_full: (sr) => synth(sr, 0.4, (t) => (sin(880, t) + sin(1320, t) * 0.6) * ex(t, 9)),
};

// ================================================================================================== install
export function installCombat(game) {
  const g = game;
  const K = createKit(g);
  K.sounds(SOUNDS);
  const parts = [];
  const sub = (label, fn) => { try { const r = fn(); if (r) parts.push(r); return r; } catch (e) { console.warn('[combat] ' + label, e); return null; } };
  const weapons = sub('weapons', () => installCombatWeapons(g, K));
  const melee = sub('melee', () => installMelee(g, K));
  const spells = sub('spells', () => installSpellsExt(g, K));
  const roles = sub('roles', () => installRoleSkills(g, K));
  const api = {
    kit: K, melee, weapons, spells, roles, CLASSES, classOf,
    dispose() {
      for (const p of parts.reverse()) { try { p.dispose?.(); } catch (e) { console.warn('[combat] dispose', e); } }
      K.dispose();
    },
  };
  return api;
}

// ================================================================================================== melee
function installMelee(g, K) {
  const HOLD_T = 0.22;                     // s of LMB before a tap becomes a heavy charge
  const held = () => g.player?.heldItem?.() || null;
  const isMelee = (it) => !!it && isMeleeDef(it.def);
  const canAct = () => !g.player.dead && g.input.enabled && !g.cruiser?.seated && !g.emotes?.active && !g.minigame;
  const M = { itemId: null, press: null, charge: 0, atk: null, queued: null, queuedT: 0, step: -1, comboT: 0, lockUntil: 0, rmbT: 0, pendingScan: false,
    block: { on: false, t: 0, win: 0.28, used: false, lastStart: -9, amt: 0, force: false }, riposteT: 0 };
  let origScan = null;
  const hs = new Map();                    // host: per player { swingT, parryT, ripT }
  const hst = (id) => { let s = hs.get(id); if (!s) { s = { swingT: -9, parryT: -9, ripT: -9 }; hs.set(id, s); } return s; };

  // ---------------------------------------------------------------- HUD bar (charge / guard)
  const box = hudDock('bottom', 'cbmelee', 9);
  box.style.cssText = 'display:none;width:150px;height:6px;border:1px solid rgba(255,200,120,.55);background:rgba(0,0,0,.55)';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0;background:linear-gradient(90deg,#ff8a3d,#ffd23f)';
  box.appendChild(fill);
  const bar = (mode, u) => {
    if (mode == null) { if (box.style.display !== 'none') box.style.display = 'none'; return; }
    box.style.display = 'block';
    fill.style.width = Math.round(clamp(u, 0, 1) * 100) + '%';
    fill.style.background = mode === 'charge' ? (u >= 1 ? '#fff2c0' : 'linear-gradient(90deg,#ff8a3d,#ffd23f)') : mode === 'parry' ? '#ffffff' : 'linear-gradient(90deg,#3d8bff,#9fd4ff)';
  };

  // ---------------------------------------------------------------- helpers
  const staminaCost = (def, atk, kind) => Math.min(30, (2 + (def.weight || 5) * 0.5) * atk.stam * (kind === 'h' ? 2.4 : 1));
  const flatFwd = () => { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion); f.y = 0; return f.lengthSq() < 1e-4 ? new THREE.Vector3(0, 0, -1) : f.normalize(); };
  const behind = (yaw, cx, cz, px, pz) => { const vx = px - cx, vz = pz - cz, L = Math.hypot(vx, vz) || 1; return (Math.sin(yaw) * vx + Math.cos(yaw) * vz) / L < -0.25; };

  function reset() {
    M.press = null; M.charge = 0; M.atk = null; M.queued = null; M.step = -1; M.comboT = 0; M.block.on = false; M.block.amt = 0; M.rmbT = 0; M.pendingScan = false;
  }

  // ---------------------------------------------------------------- start an attack
  function request(kind, charge = 0) {
    if (M.atk || g.time < M.lockUntil) { M.queued = { k: kind, c: charge }; M.queuedT = g.time; return; }
    start(kind, charge);
  }
  function start(kind, charge) {
    const it = held();
    if (!isMelee(it)) return;
    const def = it.def, cls = CLASSES[classOf(def)], p = g.player;
    const last = cls.L.length - 1;
    const step = kind === 'h' ? 9 : (M.comboT > 0 && M.step < last ? M.step + 1 : 0);
    const atk = kind === 'h' ? cls.H : cls.L[step];
    const ar = WEAPON_ARCS[atk.arc];
    const dur = Math.max(0.3, (def.cd || 0.6) * atk.t);
    const cost = staminaCost(def, atk, kind);
    const tired = p.stamina < cost * 0.6;
    p.stamina = Math.max(0, p.stamina - cost);
    p.staminaDelay = Math.max(p.staminaDelay || 0, 0.8);
    const finisher = kind === 'l' && step === last;
    const a = { kind, step, atk, it, def, cls, dur, charge, tired, finisher, resolved: false,
      t: kind === 'h' ? ar.w * dur * 0.9 : 0, hitAt: dur * (ar.w + (ar.s - ar.w) * 0.45), cancelAt: 0 };
    a.cancelAt = Math.max(a.hitAt + 0.03, dur * (finisher || kind === 'h' ? 0.9 : 0.72));
    M.atk = a; M.step = kind === 'h' ? 9 : step; M.comboT = 0; M.lockUntil = 0;
    g.swingAnim = 1;
    g.nextSwing = g.time + dur * 0.72;
    const w = def.weight || 5, wf = clamp(0.6 + w / 12, 0.6, 2);
    const dirSign = /L$/.test(atk.arc) ? -1 : 1;
    K.snd(kind === 'h' ? 'cb_whoosh_h' : 'cb_whoosh', null, 0.55, clamp(1.25 - w * 0.03, 0.75, 1.25) + (Math.random() - 0.5) * 0.08);
    g.engine.punch?.(-0.004 * wf, 0.01 * wf * dirSign, -0.012 * wf * dirSign);
  }

  // ---------------------------------------------------------------- find targets (client-side arc sweep)
  function gather(atk, def) {
    const eye = g.camera.position, reach = (def.reach || 2.2) * atk.reach + 0.3, f = flatFwd(), out = [];
    for (const v of g.creatures.views.values()) {
      if ((v.state === 'dead' && v.type !== 'mimicdoor') || v.hidden) continue;
      const hgt = v.height || 1.2, r = v.radius || 0.5;
      const cy = v.pos.y + Math.min(hgt, 2.2) * 0.5;
      const dx = v.pos.x - eye.x, dz = v.pos.z - eye.z, h = Math.hypot(dx, dz);
      if (h - r > reach) continue;
      if (Math.abs(cy - eye.y) > 1.4 + Math.min(hgt, 2.2) * 0.5) continue;
      const ang = Math.atan2(Math.abs(f.x * dz - f.z * dx), f.x * dx + f.z * dz);
      const wide = h > 0.05 ? Math.asin(clamp(r / h, 0, 1)) : 1.6;
      if (ang - wide > atk.half) continue;
      if (atk.half < 0.35 && Math.abs(Math.sin(ang)) * h > r + 0.28) continue;      // thrusts: must be on the line
      const to = new THREE.Vector3(dx, cy - eye.y, dz), d = to.length();
      to.divideScalar(d || 1);
      const wall = g.physics.raycast(eye, to, d, G.STATIC | G.DOOR);
      if (wall && wall.distance < d - r - 0.1) continue;
      out.push({ v, d: h });
    }
    out.sort((x, y) => x.d - y.d);
    return out.slice(0, atk.cleave);
  }

  function resolve(a) {
    const { it, def, atk } = a, p = g.player, eye = g.camera.position;
    const list = p.latched ? [{ v: g.creatures.views.get(p.latched) }].filter((x) => x.v) : gather(atk, def);
    const mulBase = clamp((g.stats.meleeMul || 1) * (g.hasPerk?.('berserk') && p.hp < p.maxHp * 0.5 ? 1.25 : 1), 0.5, 2.5);
    const w = def.weight || 5, wf = clamp(0.6 + w / 12, 0.6, 2), heavy = a.kind === 'h';
    if (list.length) {
      const hits = [];
      let crit = false, metal = false, bs = false;
      for (const { v } of list) {
        const c = Math.random() < (g.stats.crit || 0);
        hits.push({ i: v.id, c: c ? 1 : 0 });
        crit = crit || c;
        if (v.maxHp === null && v.type !== 'mimicdoor') metal = true;
        if (!v.def?.hazard && behind(v.yaw, v.pos.x, v.pos.z, p.pos.x, p.pos.z)) {
          bs = true;
          g.ui?.hud?.floatText(v.pos.clone().setY(v.pos.y + (v.height || 1.5) + 0.4), t('BACKSTAB'), '#ffcf6a', true);
        }
        if (it.affix) { const r = applyAffixes(it.affix, { dmg: def.dmg, crit: c, cd: def.cd, stun: 0 }); applyAffixEffects(g, r, v); }
      }
      g.net.request('cbhit', { w: it.id, k: a.kind, s: a.step, c: +a.charge.toFixed(2), mul: +mulBase.toFixed(2), ex: a.tired ? 1 : 0, hits });
      g.hitstopT = Math.max(g.hitstopT || 0, (0.035 + w * 0.004) * (heavy ? 1.6 : 1) * (crit ? 1.3 : 1) + (bs ? 0.02 : 0));
      g.engine.shake(0.08 * wf * (heavy ? 1.6 : 1));
      g.engine.punch?.(0.012 * wf, 0, 0);
      g.viewModel?.impact?.(metal ? 'metal' : 'flesh', clamp(0.7 + wf * 0.35, 0.8, 1.5));
      g.sfx(metal ? 'hit_metal' : 'hit_flesh', 0.9);
      return;
    }
    // miss: wall / big item, like the stock swing
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const reach = (def.reach || 2.2) * atk.reach + 0.2;
    const wall = g.physics.raycast(eye, fwd, reach, G.STATIC | G.DOOR);
    const ih = g.physics.raycast(eye, fwd, wall ? wall.distance : reach, G.ITEM | G.BIG);
    if (ih?.info?.itemId) {
      const im = g.items.get(ih.info.itemId);
      if (im?.body && im.isSimulatedHere()) im.body.applyImpulse({ x: fwd.x * 3 * atk.kb, y: 1.5, z: fwd.z * 3 * atk.kb }, true);
      g.sfx('hit_metal', 0.6); g.viewModel?.impact?.('metal', 0.8);
    } else if (wall) {
      g.viewModel?.impact?.('wall', 1.1); g.engine.punch?.(0.012, 0, 0.01); g.sfx('hit_wall', 0.5, 0.9 + Math.random() * 0.2);
      if (wall.point && g.particles) g.particles.burst(new THREE.Vector3(wall.point.x, wall.point.y, wall.point.z), 'sparks', fwd.clone().negate(), 0.6);
      g.net.request('noise', { p: [wall.point.x, wall.point.y, wall.point.z], loud: 0.4 });
    }
  }

  // ---------------------------------------------------------------- block / parry (client)
  function startBlock(cls, def) {
    const b = M.block, now = g.time;
    b.on = true; b.t = 0; b.used = false;
    b.win = (now - b.lastStart > 0.7 ? cls.parry : cls.parry * 0.35) * (def.parryMul || 1);
    b.lastStart = now;
    M.press = null; M.charge = 0; M.queued = null;
    K.snd('cb_block', null, 0.25, 1.6);
  }
  function doParry(v, it) {
    const p = g.player;
    g.net.request('cbparry', { cid: v.id, w: it.id });
    M.riposteT = g.time + 2.2;
    p.stamina = Math.min(p.maxStamina, p.stamina + 12);
    g.hitstopT = Math.max(g.hitstopT || 0, 0.2);          // slow-mo flash
    g.engine.flash?.(0xffffff, 0.5); g.engine.shake(0.3); g.engine.punch?.(0.03, 0, 0);
    g.viewModel?.impact?.('metal', 1.5);
    const spot = p.eyePos().clone().addScaledVector(flatFwd(), 0.9);
    g.particles?.burst(spot, 'sparks', null, 1.6);
    K.snd('cb_parry', null, 0.9);
    g.ui?.hud?.floatText(v.pos.clone().setY(v.pos.y + (v.height || 1.5) + 0.3), t('PARRY!'), '#ffffff', true);
  }
  K.on('localHurt', (d, gg) => {
    const b = M.block;
    if (gg !== g || !b.on || !d || !(d.dmg > 0)) return;
    const it = held();
    if (!isMelee(it)) return;
    const v = d.from ? g.creatures.views.get(d.from) : null;
    if (!v || (v.def?.hazard && v.type !== 'mimicdoor')) return;               // only creature melee blows can be blocked
    const p = g.player, src = fin3(d.p) || v.pos;
    const f = flatFwd(), tx = src.x - p.pos.x, tz = src.z - p.pos.z, L = Math.hypot(tx, tz) || 1;
    if ((f.x * tx + f.z * tz) / L < 0.15) return;                              // must face the attacker
    const cls = CLASSES[classOf(it.def)];
    if (b.t <= b.win + 0.04) { d.dmg = 0; b.used = true; doParry(v, it); return; }
    if (d.dmg >= 999) return;                                                   // instant-death moves can only be parried
    const raw = d.dmg, cost = clamp(raw * 0.4, 3, 45);
    b.used = true;
    K.snd('cb_block', null, 0.8, 0.9 + Math.random() * 0.2);
    g.engine.shake(0.25); g.engine.punch?.(0.03, (Math.random() - 0.5) * 0.04, 0);
    g.viewModel?.impact?.('metal', 1.3);
    g.particles?.burst(p.eyePos().clone().addScaledVector(flatFwd(), 0.8), 'sparks', null, 0.9);
    p.vel.x -= (tx / L) * 3; p.vel.z -= (tz / L) * 3;                           // pushed back a little
    if (p.stamina >= cost) { p.stamina -= cost; d.dmg = raw * (1 - clamp(cls.block * (it.def.blockMul || 1), 0, 0.9)); g.ui?.hud?.floatText(p.eyePos().clone().setY(p.eyePos().y + 0.2), t('BLOCKED'), '#9fd4ff'); }
    else { d.dmg = raw * 0.75; p.stamina = 0; p.stunT = Math.max(p.stunT || 0, 0.6); b.on = false; g.ui?.hud?.floatText(p.eyePos().clone().setY(p.eyePos().y + 0.2), t('GUARD BROKEN'), '#ff5a4a', true); }
    p.staminaDelay = Math.max(p.staminaDelay || 0, 1.2);
  });

  // ---------------------------------------------------------------- input hooks
  K.on('useItem', (it, hk, gg) => {
    if (gg !== g || hk.handled || !isMelee(it) || !canAct()) return;
    hk.handled = true;
    M.press = { t: 0, id: it.id };
  });
  K.wrap(g, 'scan', (orig) => { origScan = orig; return function (...a) {
    const it = held();
    if (g.player.dead || g.cruiser?.seated || !g.input.enabled) return orig(...a);
    for (const h of K.rmbHooks) { if (K.safe('rmb', () => h(it))) return; }
    if (isMelee(it)) { M.pendingScan = true; return; }                          // RMB tap = scan, RMB hold = block
    return orig(...a);
  }; });
  K.moveMod(() => { const f = M.block.on ? 0.62 : M.charge > 0 ? 0.75 : M.atk ? 0.88 : 1; return f === 1 ? null : { speed: f }; });

  // ---------------------------------------------------------------- per frame
  K.update((dt) => {
    const it = held(), p = g.player, input = g.input;
    const melee = isMelee(it) && canAct();
    if (!melee) { if (M.press || M.atk || M.block.on || M.charge || M.pendingScan) reset(); M.itemId = it?.id || null; bar(null); return; }
    if (M.itemId !== it.id) { reset(); M.itemId = it.id; }
    const def = it.def, cls = CLASSES[classOf(def)], b = M.block;
    if (!M.atk && M.comboT > 0) M.comboT -= dt;

    // RMB: block, or scan on a quick tap
    const rmb = input.mouseDown(2) || b.force;
    if (input.mouseDown(2)) M.rmbT += dt;
    else if (M.rmbT > 0) { if (M.pendingScan && M.rmbT < 0.22 && !b.used) origScan?.(); M.pendingScan = false; M.rmbT = 0; }
    const wantBlock = rmb && !M.atk && !p.latched && !g.grab?.item;
    if (wantBlock && !b.on) startBlock(cls, def);
    else if (!wantBlock && b.on) b.on = false;
    if (b.on) b.t += dt;
    b.amt = damp(b.amt, b.on ? 1 : 0, 16, dt);

    // LMB: tap = light, hold = heavy
    if (M.press) {
      const lmb = input.mouseDown(0);
      if (b.on || !input.enabled) { M.press = null; M.charge = 0; }
      else {
        if (lmb) {
          M.press.t += dt;
          if (M.press.t >= HOLD_T && !M.atk) {
            const before = M.charge;
            M.charge = clamp((M.press.t - HOLD_T) / cls.chargeT, 0, 1);
            if (before === 0) K.snd('cb_charge', null, 0.4);
            if (before < 1 && M.charge >= 1) { K.snd('cb_full', null, 0.7); g.engine.flash?.(0xffe0a0, 0.12); }
          }
        } else {
          const charged = M.press.t >= HOLD_T, c = M.charge;
          M.press = null; M.charge = 0;
          request(charged ? 'h' : 'l', c);
        }
      }
    }

    // attack progress
    const a = M.atk;
    if (a) {
      a.t += dt;
      if (!a.resolved && a.t >= a.hitAt) { a.resolved = true; resolve(a); }
      const q = M.queued;
      if (a.resolved && q && a.t >= a.cancelAt) { M.queued = null; M.atk = null; M.comboT = 0.55; if (g.time - M.queuedT < 0.7) start(q.k, q.c); }
      else if (a.t >= a.dur) { M.atk = null; M.comboT = 0.55; M.lockUntil = a.finisher ? g.time + 0.12 : 0; }
    } else if (M.queued) {
      if (g.time - M.queuedT > 0.7) M.queued = null;
      else if (g.time >= M.lockUntil) { const q = M.queued; M.queued = null; start(q.k, q.c); }
    }

    // HUD bar
    if (M.charge > 0) bar('charge', M.charge);
    else if (b.on) bar(b.t <= b.win ? 'parry' : 'guard', b.t <= b.win ? 1 - b.t / Math.max(0.01, b.win) : 1);
    else bar(null);
  });

  // ---------------------------------------------------------------- view model: our own arcs, wind-up and guard pose
  const vm = g.viewModel;
  const vmOrig = vm?.update;
  const vmMine = vm ? (dt, a) => {
    const it = held();
    if (!it || !isMelee(it) || !g.input.enabled) return vmOrig(dt, a);
    const cls = CLASSES[classOf(it.def)], b = M.block;
    const o = { ...a, swing: 0, charging: 0, leftHand: !!it.def.twin };
    if (M.atk) { o.item = M.atk.atk.arc; o.swing = clamp(M.atk.t / M.atk.dur, 0.001, 0.999); }
    else if (b.amt > 0.02) { o.item = cls.guard; o.charging = b.amt; }
    else if (M.press) {
      const next = M.charge > 0 ? cls.H : cls.L[M.comboT > 0 && M.step < cls.L.length - 1 ? M.step + 1 : 0];
      o.item = next.arc;
      o.charging = M.charge > 0 ? 0.3 + 0.7 * M.charge : 0.28 * clamp(M.press.t / HOLD_T, 0, 1);
    }
    return vmOrig(dt, o);
  } : null;
  if (vm && vmOrig) vm.update = vmMine;

  // ---------------------------------------------------------------- host: cbhit (damage) and cbparry
  K.hostOn('cbhit', (d, from) => {
    const it = g.items.get(d?.w), def = it?.def;
    if (!it || it.holder !== from || !isMeleeDef(def)) return;
    const st = hst(from), now = g.time;
    if (now - st.swingT < 0.09) return;
    st.swingT = now;
    const cls = CLASSES[classOf(def)];
    const kind = d.k === 'h' ? 'h' : 'l';
    const atk = kind === 'h' ? cls.H : cls.L[clamp(d.s | 0, 0, cls.L.length - 1)];
    const charge = clamp(Number(d.c) || 0, 0, 1);
    const mul = clamp(Number(d.mul) || 1, 0.5, 2.5) * (d.ex ? 0.7 : 1);
    const shooter = K.posOf(from);
    const hitH = g.net.handlers.get('hit');
    const rip = now - st.parryT < 2.5 && st.parryT > st.ripT;
    let usedRip = false;
    for (const h of (Array.isArray(d.hits) ? d.hits : []).slice(0, atk.cleave + 1)) {
      const c = g.creatures.host.get(h?.i);
      if (!c || c.dead) continue;
      if (shooter && Math.hypot(shooter.x - c.pos.x, shooter.z - c.pos.z) > (def.reach || 2.2) * atk.reach + 2.4 + (c.def?.radius || 0.5)) continue;
      let dmg = def.dmg * tierDmg(it) * atk.dmg * (kind === 'h' ? 0.6 + 0.4 * charge : 1) * mul;
      const crit = !!h.c;
      if (crit) dmg *= 2;
      if (shooter && !c.def?.hazard && behind(c.yaw, c.pos.x, c.pos.z, shooter.x, shooter.z)) dmg *= def.backstab ?? cls.backstab ?? 1.5;
      if (rip) { dmg *= 1.6; usedRip = true; }
      let stun = atk.stun ? atk.stun * (kind === 'h' ? 0.5 + 0.5 * charge : 1) : 0;
      if (kind === 'h' && def.heavyStun) stun = def.heavyStun * (0.5 + 0.5 * charge);
      stun = Math.max(stun, def.stun || 0);
      let out = { dmg, stun, crit };
      if (it.affix) { const a = applyAffixes(it.affix, { dmg, crit, cd: def.cd, stun }); out = { dmg: a.dmg, stun: a.stun, crit: a.crit }; }
      const kb = (def.knock || 1) * atk.kb;
      if (hitH) hitH({ cid: c.id, dmg: out.dmg, stun: out.stun, crit: out.crit, kb }, from);
      else K.hurt(c, out.dmg, from, { stun: out.stun, crit: out.crit });
      if (def.bleed && !c.dead) K.bleed(c, def.bleed.dps * (kind === 'h' ? 1.6 : 1), def.bleed.t, from);
    }
    if (usedRip) st.ripT = now;
  });
  K.hostOn('cbparry', (d, from) => {
    const c = g.creatures.host.get(d?.cid), it = g.items.get(d?.w);
    if (!c || c.dead || !it || it.holder !== from || !isMeleeDef(it.def)) return;
    const st = hst(from), now = g.time;
    if (now - st.parryT < 0.3) return;
    const pp = K.posOf(from);
    if (pp && pp.distanceTo(c.pos) > 7) return;
    st.parryT = now;
    K.stun(c, c.def?.boss ? 1.0 : 2.2, from);
    c.cooldown = Math.max(c.cooldown || 0, 1.5);
    K.fx('parry', { p: arr3(K.ctrOf(c)), by: from });
  });
  K.onFx('parry', (d) => { const p = fin3(d.p); if (!p) return; K.ring(p, 0xffffff, 0.2, 2.2, 0.35, new THREE.Vector3(0, 0, 1)); K.burst(p, 'sparks', null, 1.4); if (d.by !== g.selfId) K.snd('cb_parry', p, 0.9); });

  return {
    state: M,
    /** debug / tests: start an attack without input ('l' light, 'h' heavy) */
    swing: (kind = 'l', charge = 0) => request(kind, charge),
    /** debug / tests: hold the guard */
    setBlock: (on) => { M.block.force = !!on; },
    dispose() { if (vm && vm.update === vmMine) vm.update = vmOrig; box.remove(); },
  };
}
