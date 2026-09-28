// TFG wave 1 - Company Store weapons (data + behaviour).
//
// Registers (at import time, so every module and save can spawn them by id):
//   melee   knife, bat, nailbat, crowbar, katana       -> use the stock melee pipeline (actions.meleeSwing / resolveMelee)
//   ranged  pistol, nailgun, crossbow, flaregun        -> fired here (mods 'useItem' hook), client raycast/projectile ->
//                                                         host request 'wshot' (host recomputes damage: def x tier x affix)
//   ammo    rounds, nails, bolts, flares               -> item.charges = rounds left; R reloads the held gun from them
//   deck    stackeddeck                                -> behaviour lives in game/deck.js (shares the context built here)
//
// Nothing here edits actions.js: the few behaviours that need to differ (tier scaling of melee damage, reload for the new
// guns, prying locked doors with a crowbar) are instance-level wrappers around game.meleeSwing / reload / doorInteraction
// that dispose() puts back.
import * as THREE from 'three';
import { ITEMS, registerItem, SCRAP_TABLE } from './items.js';
import { TIERS } from './tiers.js';
import { plusMul } from './enhance.js';   // [forge]
import { WEAPON_ARCS, WEAPON_RECOIL } from '../models/avatar.js';
import { WEAPON_MODELS, createCardMesh, CARD_COLORS } from '../models/weapons_wave1.js';
import { G } from '../physics/physics.js';
import { applyAffixes, applyAffixEffects, affixCooldown, rollWeaponAffixes, lootLevelFor } from './loot.js';
import { RNG, hashString } from '../core/rng.js';
import { addTranslations, t } from '../core/i18n.js';
import { CREATURES } from './creatures.js';
import { MOONS } from './moons.js';
import { hudDock } from '../ui/dock.js';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const UP = new THREE.Vector3(0, 1, 0);

// ================================================================================================== item data
// dmg = damage at the item's own tier (see relMul); cd = seconds; reach = m. price = credits, coin = Clout.
const W = (id, name, o) => ({ id, name, kind: 'weapon', hands: 1, weight: 5, ...o });
export const WEAPON_DEFS = [
  W('knife', 'Kitchen Knife', { price: 18, weight: 1, dmg: 9, cd: 0.32, reach: 1.75, rarity: 'common', tier: 'common', shop: 'weapons', value: [10, 20],
    blurb: 'Fast and quiet. Nobody takes you seriously until it is too late.' }),
  W('bat', 'Baseball Bat', { price: 45, weight: 4, dmg: 22, cd: 0.68, reach: 2.3, knock: 1.6, rarity: 'common', tier: 'common', shop: 'weapons', value: [18, 32],
    blurb: 'Solid swing, big knockback. Home run.' }),
  W('nailbat', 'Nail Bat', { price: 120, upgradeFrom: 'bat', upgradePrice: 60, weight: 5, dmg: 31, cd: 0.7, reach: 2.3, knock: 1.3, rarity: 'uncommon', tier: 'uncommon', shop: 'weapons', value: [32, 54],
    blurb: 'A Baseball Bat with a hobby. Trade in your bat for a discount.' }),
  W('crowbar', 'Crowbar', { price: 60, weight: 6, dmg: 18, cd: 0.55, reach: 2.1, pry: 5, rarity: 'uncommon', tier: 'uncommon', shop: 'weapons', value: [24, 42],
    blurb: 'Pries locked doors and supply crates open (slowly, loudly). Also good at hitting things.' }),
  W('katana', 'Katana', { price: 650, faction: 'bureau', minRep: -20, weight: 3, dmg: 30, cd: 0.42, reach: 2.35, rarity: 'epic', tier: 'epic', shop: 'weapons', value: [80, 130],
    blurb: 'Folded 1000 times. Cuts through spam like it was never there.' }),
  W('pistol', 'Pistol', { price: 240, weight: 3, dmg: 17, cd: 0.28, reach: 45, ammo: 8, ammoItem: 'rounds', reload: 1.15, ranged: true, wfire: 'hitscan', fireSnd: 'wv1_pistol', noise: 2.2, spread: 0.008, knock: 0.9,
    rarity: 'rare', tier: 'rare', shop: 'weapons', blurb: 'Magazine of 8. Loud, accurate and cheap enough to lose.' }),
  W('nailgun', 'Nail Gun', { price: 190, weight: 6, dmg: 5, cd: 0.11, reach: 20, ammo: 30, ammoItem: 'nails', reload: 1.6, ranged: true, wfire: 'hitscan', auto: true, fireSnd: 'wv1_nail', noise: 0.9, spread: 0.03, knock: 0.5,
    rarity: 'uncommon', tier: 'uncommon', shop: 'weapons', blurb: 'Hold the trigger. Weak nails, ridiculous fire rate.' }),
  W('crossbow', 'Crossbow', { price: 320, weight: 6, hands: 2, dmg: 58, cd: 1.35, reach: 60, ammo: 1, ammoItem: 'bolts', reload: 1.25, ranged: true, wfire: 'bolt', fireSnd: 'wv1_bolt', noise: 0.15, knock: 1.2,
    rarity: 'rare', tier: 'rare', shop: 'weapons', blurb: 'Near-silent one-shot punch. Pick your bolts up again.' }),
  W('flaregun', 'Flare Gun', { price: 85, weight: 3, dmg: 10, cd: 1.0, reach: 60, ammo: 1, ammoItem: 'flares', reload: 1.0, ranged: true, wfire: 'flare', fireSnd: 'wv1_flare', noise: 1.5,
    rarity: 'uncommon', tier: 'uncommon', shop: 'weapons', blurb: 'Lights up a room for 24 s and scares off the small stuff.' }),
  // the Stacked Deck: coin-only (Clout), rare/epic find. Behaviour: game/deck.js
  W('stackeddeck', 'Stacked Deck', { price: 0, coin: 900, weight: 1, dmg: 9, cd: 0.75, reach: 40, ranged: true, wfire: 'deck', rarity: 'epic', tier: 'epic', shop: 'weapons', noAffix: false,
    blurb: 'LMB throws three cards. R: Pick a Card - gold stuns, red splashes and slows, blue steals mana.' }),
];
// ammo: item.charges = rounds left (a box lasts several reloads). Weight 0.5-1: it costs a slot, not your back.
const A = (id, name, o) => ({ id, name, kind: 'consumable', hands: 1, weight: 0.5, ammoFor: true, ...o });
export const AMMO_DEFS = [
  A('rounds', 'Pistol Ammo Box', { price: 30, charges: 24, shop: 'consumables', blurb: '24 rounds for the Pistol.' }),
  A('nails', 'Nail Box', { price: 25, charges: 90, shop: 'consumables', blurb: '90 nails for the Nail Gun.' }),
  A('bolts', 'Bolt Quiver', { price: 26, charges: 8, weight: 1, shop: 'consumables', blurb: '8 bolts for the Crossbow. Recover the ones that hit.' }),
  A('flares', 'Flare Pack', { price: 22, charges: 4, shop: 'consumables', blurb: '4 flares for the Flare Gun.' }),
];
export const WEAPON_IDS = WEAPON_DEFS.map((d) => d.id);
export const AMMO_IDS = AMMO_DEFS.map((d) => d.id);

for (const d of [...WEAPON_DEFS, ...AMMO_DEFS]) if (!ITEMS[d.id]) registerItem(d);

// weapons and ammo are sometimes found lying around too (melee as ordinary scrap, guns via game/weapons.js finds)
const SCRAP_ADD = [['knife', 2], ['bat', 1.6], ['crowbar', 1.6], ['nailbat', 0.5], ['rounds', 0.8], ['nails', 0.8]];
let scrapAdded = false;
function addScrapWeights() {
  if (scrapAdded) return;
  scrapAdded = true;
  for (const tbl of Object.values(SCRAP_TABLE)) if (Array.isArray(tbl)) for (const [id, w] of SCRAP_ADD) if (!tbl.some((e) => e[0] === id)) tbl.push([id, w]);
}
addScrapWeights();

// first-person swing arcs and recoil (models/avatar.js data tables, keyed by item id)
WEAPON_ARCS.knife = { w: 0.18, s: 0.4, trail: 0.7, W: { x: 0.35, y: -0.55, z: -0.5, e: 0.55, px: 0.06, py: 0.03, pz: 0.1, roll: 0.5 }, S: { x: 0.25, y: 0.8, z: 0.3, e: -0.6, px: -0.1, pz: -0.3, roll: -0.4, wr: 0.25 } };
WEAPON_ARCS.bat = { w: 0.3, s: 0.58, trail: 1, W: { x: 1.2, y: -0.85, z: -0.85, e: 0.8, py: 0.1, px: 0.08, pz: 0.12, roll: 0.5, wr: -0.35 }, S: { x: -0.6, y: 1.05, z: 0.5, e: -0.2, py: -0.08, px: -0.18, pz: -0.16, roll: -0.6, wr: 0.45 } };
WEAPON_ARCS.nailbat = WEAPON_ARCS.bat;
WEAPON_ARCS.crowbar = { w: 0.28, s: 0.55, trail: 0.85, W: { x: 1.8, y: -0.25, z: -0.5, e: 0.75, py: 0.15, pz: 0.12, roll: 0.3, wr: -0.45 }, S: { x: -1.0, y: 0.45, z: 0.25, e: -0.2, py: -0.1, pz: -0.16, px: -0.06, wr: 0.55 } };
WEAPON_ARCS.katana = { w: 0.2, s: 0.44, trail: 1, W: { x: 0.9, y: -1.0, z: -1.1, e: 0.85, px: 0.1, py: 0.08, pz: 0.1, roll: 1.0, wr: -0.3 }, S: { x: 0.25, y: 1.35, z: 0.3, e: -0.15, px: -0.22, py: -0.03, pz: -0.2, roll: -0.95, wr: 0.4 } };
WEAPON_RECOIL.pistol = { dur: 0.26, jitter: 0.006, K: { x: 0.38, e: 0.2, pz: 0.09, py: 0.035, roll: 0.06, wr: -0.24 } };
WEAPON_RECOIL.nailgun = { dur: 0.15, jitter: 0.012, K: { x: 0.1, pz: 0.04, py: 0.008 } };
WEAPON_RECOIL.crossbow = { dur: 0.45, jitter: 0.002, K: { x: 0.32, e: 0.16, pz: 0.14, py: 0.03, wr: -0.2 } };
WEAPON_RECOIL.flaregun = { dur: 0.4, jitter: 0.004, K: { x: 0.55, e: 0.32, pz: 0.12, py: 0.05, wr: -0.35 } };
WEAPON_RECOIL.stackeddeck = { dur: 0.34, jitter: 0.002, K: { x: 0.18, y: -0.2, pz: 0.05, wr: 0.3, roll: -0.15 } };

const TR = {
  'Kitchen Knife': 'Mutfak Bıçağı', 'Baseball Bat': 'Beyzbol Sopası', 'Nail Bat': 'Çivili Sopa', Crowbar: 'Levye', Katana: 'Katana',
  Pistol: 'Tabanca', 'Nail Gun': 'Çivi Tabancası', Crossbow: 'Tatar Yayı', 'Flare Gun': 'Fişek Tabancası', 'Stacked Deck': 'Hileli Deste',
  'Pistol Ammo Box': 'Tabanca Mermi Kutusu', 'Nail Box': 'Çivi Kutusu', 'Bolt Quiver': 'Ok Kılıfı', 'Flare Pack': 'Fişek Paketi',
  'Out of ammo. [R] to reload.': 'Mermi bitti. [R] ile doldur.', 'No ammo for this weapon in your slots.': 'Envanterinde bu silah için mermi yok.',
  'Already fully loaded.': 'Zaten dolu.', 'Reloading...': 'Dolduruluyor...', 'Prying...': 'Zorlanıyor...',
  'Pry the door open with the Crowbar [E]': 'Kapıyı levyeyle zorla [E]', 'Hold [E]: slow and loud.': '[E] basılı tut: yavaş ve gürültülü.',
  'Pry the crate open with the Crowbar [E]': 'Kasayı levyeyle zorla [E]',
  'The door gives way with a crack.': 'Kapı çatırdayarak açıldı.',
};
addTranslations(TR);

// ================================================================================================== tier scaling
/** Damage multiplier of an item instance relative to its definition's own tier (1 when the instance has no tier of its own). */
export function relMul(it) {
  const def = it?.def;
  const tier = it?.tier;
  const plus = it?.plus ? plusMul(it.plus) : 1;   // [forge] +N enhancement (ranged host damage + Stacked Deck use relMul)
  if (!def || !tier || !TIERS[tier]) return plus;
  const base = TIERS[def.tier] || TIERS[def.rarity] || TIERS.common;
  return (TIERS[tier].statMul / base.statMul) * plus;
}

// ================================================================================================== procedural sounds
let seed = 0x9e3779b9;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const nz = () => rnd() * 2 - 1;
function synth(sr, dur, fn) {
  const n = Math.max(1, Math.floor(sr * dur));
  const b = new Float32Array(n);
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { const v = fn(i / sr, i); b[i] = v; const a = Math.abs(v); if (a > peak) peak = a; }
  const k = 0.9 / peak;
  const fade = Math.min(n, Math.floor(sr * 0.006));
  for (let i = 0; i < n; i++) { b[i] *= k; if (i > n - fade) b[i] *= (n - i) / fade; }
  return b;
}
const sin = (f, t) => Math.sin(TAU * f * t);
const ex = (t, k) => Math.exp(-t * k);
export const SOUNDS = {
  wv1_pistol: (sr) => { let lp = 0; return synth(sr, 0.55, (t) => { lp += (nz() - lp) * 0.4; return lp * ex(t, 60) * 1.3 + sin(60 + 110 * ex(t, 20), t) * ex(t, 13) + nz() * ex(t, 7) * 0.12; }); },
  wv1_nail: (sr) => synth(sr, 0.14, (t) => sin(480 + 200 * ex(t, 40), t) * ex(t, 60) * 0.6 + nz() * ex(t, 110) * 0.7 + sin(90, t) * ex(t, 40) * 0.4),
  wv1_bolt: (sr) => synth(sr, 0.6, (t) => sin(150 + 60 * ex(t, 22), t) * ex(t, 8) * 0.8 + sin(310 + 30 * ex(t, 15), t) * ex(t, 12) * 0.3 + nz() * ex(t, 90) * 0.6),
  wv1_flare: (sr) => { let lp = 0; return synth(sr, 1.0, (t) => { lp += (nz() - lp) * 0.25; return lp * ex(t, 26) * 1.1 + sin(85 + 60 * ex(t, 12), t) * ex(t, 9) * 0.9 + nz() * 0.16 * Math.min(1, t * 10) * ex(t - 0.05, 2.4); }); },
  wv1_reload: (sr) => synth(sr, 0.62, (t) => { const c = (t0, k) => (t >= t0 ? nz() * ex(t - t0, k) : 0); return c(0, 120) * 0.8 + c(0.28, 90) * 0.9 + sin(2400, t) * c(0.28, 200) * 0.4 + nz() * 0.18 * (t > 0.08 && t < 0.24 ? 1 : 0) * Math.sin(((t - 0.08) / 0.16) * PI); }),
  wv1_empty: (sr) => synth(sr, 0.12, (t) => (nz() * 0.7 + sin(1800, t)) * ex(t, 90)),
  wv1_card: (sr) => { let lp = 0; return synth(sr, 0.26, (t) => { const u = t / 0.26; lp += (nz() - lp) * (0.12 + u * 0.5); return lp * Math.sin(u * PI) * 0.8 + nz() * ex(t, 160) * 0.5; }); },
  wv1_cardhit: (sr) => synth(sr, 0.22, (t) => nz() * ex(t, 55) * 0.8 + sin(1320 + 400 * ex(t, 30), t) * ex(t, 30) * 0.5),
  wv1_pick: (sr) => synth(sr, 0.11, (t) => (sin(880, t) + sin(1760, t) * 0.4) * ex(t, 32)),
  wv1_gold: (sr) => synth(sr, 0.9, (t) => (sin(1318, t) + sin(1975, t) * 0.6 + sin(2637, t) * 0.4 + sin(3951, t) * 0.15) * ex(t, 5.5)),
  wv1_red: (sr) => { let lp = 0; return synth(sr, 0.7, (t) => { lp += (nz() - lp) * 0.08; return sin(120 * ex(t, 4) + 46, t) * ex(t, 6) + lp * ex(t, 9) * 1.4; }); },
  wv1_blue: (sr) => synth(sr, 0.6, (t) => { const note = (t0, f) => (t >= t0 ? sin(f, t) * ex(t - t0, 9) : 0); return note(0, 660) + note(0.07, 880) + note(0.14, 1320) + note(0.21, 1760) * 0.7; }),
  wv1_pry: (sr) => synth(sr, 0.7, (t) => { const f = 150 + 70 * Math.sin(t * 9) + 30 * t; const saw = ((t * f) % 1) * 2 - 1; return saw * 0.45 * Math.sin((t / 0.7) * PI) + nz() * 0.18 * Math.sin((t / 0.7) * PI); }),
  wv1_snap: (sr) => synth(sr, 0.5, (t) => nz() * ex(t, 40) + sin(70 * ex(t, 6) + 45, t) * ex(t, 12) * 0.9),
  wv1_flarehiss: (sr) => { let lp = 0; return synth(sr, 0.5, (t) => { lp += (nz() - lp) * 0.5; return (nz() - lp) * 0.5 * (0.5 + 0.5 * Math.sin(t * 40)); }); },
};

// ================================================================================================== shared context
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _seg = new THREE.Vector3(), _dir = new THREE.Vector3();

/** Client-predicted projectile simulation (cards, bolts, flares). Each entry raycasts its own path every step. */
class Projectiles {
  constructor(game) { this.g = game; this.list = []; }
  /** o: { mesh, pos, vel, grav, life, local, spin, trail (hex|null), maxRange, orient:'card'|'dir', onCreature(p, hit, dir), onWall(p, hit, dir), onExpire(p) } */
  spawn(o) {
    o.t = 0; o.dist = 0; o.spinA = Math.random() * TAU; o.trailT = 0;
    if (o.mesh) { o.mesh.position.copy(o.pos); this.g.scene.add(o.mesh); }
    this.list.push(o);
    return o;
  }
  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    if (p.mesh) { p.mesh.removeFromParent(); p.mesh.userData.dispose?.(); p.mesh.traverse?.((m) => { if (m.isMesh && m.userData.ownGeo) m.geometry.dispose(); }); }
  }
  clear() { for (const p of [...this.list]) this.remove(p); }
  update(dt) {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      let done = p.t > p.life;
      const steps = Math.max(1, Math.ceil(dt / 0.02)), h = dt / steps;
      for (let s = 0; s < steps && !done; s++) {
        _a.copy(p.pos);
        if (p.grav) p.vel.y -= p.grav * h;
        _seg.copy(p.vel).multiplyScalar(h);
        const len = _seg.length();
        if (len < 1e-6) continue;
        _dir.copy(_seg).divideScalar(len);
        const wall = g.physics.raycast(_a, _dir, len, G.STATIC | G.DOOR);
        const cr = p.noCreatures ? null : g.creatures.raycast(_a, _dir, wall ? wall.distance : len);
        if (cr) {
          p.pos.copy(_a).addScaledVector(_dir, cr.t);
          p.onCreature?.(p, cr, _dir);
          done = true;
        } else if (wall) {
          p.pos.set(wall.point.x, wall.point.y, wall.point.z);
          p.onWall?.(p, wall, _dir);
          done = true;
        } else {
          p.pos.add(_seg);
          p.dist += len;
          if (p.maxRange && p.dist > p.maxRange) { p.onExpire?.(p); done = true; }
        }
      }
      if (p.mesh && !done) {
        p.mesh.position.copy(p.pos);
        if (p.orient === 'card') { p.spinA += dt * (p.spin || 26); p.mesh.rotation.set(0, p.spinA, 0); }
        else if (p.vel.lengthSq() > 1e-4) p.mesh.quaternion.setFromUnitVectors(_c.set(0, 0, -1), _b.copy(p.vel).normalize());
      }
      if (p.trail != null && g.particles) {
        p.trailT -= dt;
        if (p.trailT <= 0) { p.trailT = p.trailEvery || 0.025; g.particles.burst(p.pos, { count: 1, color: [p.trail, 0xffffff], speed: 0.15, up: 0, life: 0.32, size: p.trailSize || 0.05, gravity: 0, drag: 4 }, null, 1); }
      }
      if (done) { p.onDone?.(p); this.remove(p); }
    }
  }
}

/** Builds the shared helpers used by weapons.js and deck.js. Everything registered through it is undone by dispose(). */
export function createWeaponContext(game) {
  const g = game, mm = game.mods;
  const ctx = {
    g, mm, proj: new Projectiles(game), offs: [], updaters: [], hostHandlers: [], fxHandlers: new Map(), phaseHandlers: [], patches: [], disposed: false,
    /** local sound (3D when pos given) using the procedural wv1_* generators or any stock sound name */
    snd(name, pos, vol = 1, pitch, opts = {}) {
      try {
        mm?.ensureSound?.(name);
        if (pos) g.audio.at(name, pos.isVector3 ? pos : new THREE.Vector3().fromArray(pos), vol, { refDistance: opts.ref ?? 4, maxDistance: opts.max ?? 60, pitch, occlude: opts.occlude !== false });
        else g.audio.play(name, { volume: vol, bus: 'sfx', pitch });
      } catch (e) { /* audio not ready */ }
    },
    /** sound for everyone (the sender hears it through the loop-back too) */
    bsnd(name, pos, vol = 1, pitch) { g.net?.broadcast('fx', { k: 'sh', t: 'snd', s: name, p: [pos.x, pos.y, pos.z], v: vol, pt: pitch }); },
    /** send a wave-1 fx message to every peer (and to ourselves) */
    fx(t, d) { g.net?.broadcast('fx', { ...d, k: 'sh', t }); },
    onFx(t, fn) { ctx.fxHandlers.set(t, fn); },
    hostOn(action, fn) { ctx.hostHandlers.push([action, fn]); },
    update(fn) { ctx.updaters.push(fn); },
    onPhase(fn) { ctx.phaseHandlers.push(fn); },
    /** instance-level wrapper around a Game method, restored on dispose (only when nobody wrapped it after us) */
    wrap(obj, name, make) {
      const orig = obj[name];
      if (typeof orig !== 'function') return;
      const mine = make(orig.bind(obj));
      obj[name] = mine;
      ctx.patches.push(() => { if (obj[name] === mine) obj[name] = orig; });
    },
    dispose() {
      if (ctx.disposed) return;
      ctx.disposed = true;
      for (const off of ctx.offs) { try { off(); } catch { /* ignore */ } }
      for (const undo of ctx.patches.reverse()) { try { undo(); } catch { /* ignore */ } }
      ctx.proj.clear();
    },
  };
  // model + sound registration (world items, held items and store icons all read these maps)
  if (mm?.itemModels) for (const [id, fn] of Object.entries(WEAPON_MODELS)) if (!mm.itemModels.has(id)) mm.itemModels.set(id, () => fn());
  if (mm?.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mm.soundGens.has(n)) mm.soundGens.set(n, fn);
  ctx.offs.push(mm.on('update', (dt, gg) => { if (gg !== g) return; ctx.proj.update(dt); for (const u of ctx.updaters) { try { u(dt); } catch (e) { console.warn('[weapons] update', e); } } }));
  ctx.offs.push(mm.on('fx', (d, from) => { if (d?.k === 'sh') { try { ctx.fxHandlers.get(d.t)?.(d, from); } catch (e) { console.warn('[weapons] fx', d.t, e); } } }));
  ctx.offs.push(mm.on('registerHandlers', (H) => { for (const [a, fn] of ctx.hostHandlers) H(a, fn); }));
  ctx.offs.push(mm.on('phase', (ph) => { ctx.proj.clear(); for (const fn of ctx.phaseHandlers) { try { fn(ph); } catch (e) { console.warn('[weapons] phase', e); } } }));
  ctx.onFx('snd', (d) => ctx.snd(d.s, d.p, d.v ?? 1, d.pt));
  return ctx;
}

// shared small visuals ------------------------------------------------------------------------------------
let tracerGeo = null;
function tracerMesh(scene, a, b, color, life = 0.07, width = 0.012) {
  const len = a.distanceTo(b);
  if (len < 0.05) return;
  tracerGeo = tracerGeo || new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.scale.set(width, width, len);
  m.position.copy(a).lerp(b, 0.5);
  m.lookAt(b);
  scene.add(m);
  let t = 0;
  const tick = () => { t += 1 / 60; m.material.opacity = Math.max(0, 0.95 * (1 - t / life)); if (t >= life) { m.removeFromParent(); m.material.dispose(); } else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
export { tracerMesh };

let boltGeoCache = null;
function boltMesh() {
  const g = new THREE.Group();
  if (!boltGeoCache) {
    boltGeoCache = {
      shaft: new THREE.CylinderGeometry(0.006, 0.006, 0.36, 5).rotateX(PI / 2),
      head: new THREE.ConeGeometry(0.014, 0.06, 4).rotateX(-PI / 2).translate(0, 0, -0.2),
      fin: new THREE.BoxGeometry(0.03, 0.002, 0.05).translate(0, 0, 0.16),
    };
  }
  const shaft = new THREE.Mesh(boltGeoCache.shaft, new THREE.MeshBasicMaterial({ color: 0xd8c090 }));
  const head = new THREE.Mesh(boltGeoCache.head, new THREE.MeshBasicMaterial({ color: 0xd8dde2 }));
  const fin = new THREE.Mesh(boltGeoCache.fin, new THREE.MeshBasicMaterial({ color: 0xc02020 }));
  g.add(shaft, head, fin);
  g.userData.dispose = () => { shaft.material.dispose(); head.material.dispose(); fin.material.dispose(); };
  return g;
}

let flareTex = null;
function flareSprite(color = 0xff5a2a, size = 1) {
  if (!flareTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    flareTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  s.userData.dispose = () => s.material.dispose();
  return s;
}
export { flareSprite, boltMesh };

// ================================================================================================== install
export function installWeapons(game, ctx) {
  const g = game, mm = game.mods;
  const scene = g.scene;
  const held = () => g.player?.heldItem?.() || null;
  const eyeFwd = () => new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
  const muzzleOf = (fwd) => {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion), down = new THREE.Vector3(0, -1, 0).applyQuaternion(g.camera.quaternion);
    return g.camera.position.clone().addScaledVector(fwd, 0.75).addScaledVector(right, 0.16).addScaledVector(down, 0.1);
  };
  const toast = (s, k) => g.ui?.toast?.(t(s), k);
  const posOf = (id) => g.aiPlayerById?.(id)?.pos || (id === g.selfId ? g.player.pos : g.remotes.get(id)?.pos);
  let reload = null;   // { it, t, dur }
  let autoShots = 0;

  // ---------------------------------------------------------------- ammo / reload
  function ammoItemFor(def) {
    for (const id of g.player.slots) {
      if (!id) continue;
      const a = g.items.get(id);
      if (a && a.type === def.ammoItem && (a.charges ?? 0) > 0) return a;
    }
    return null;
  }
  function startReload(it) {
    const def = it.def;
    if (reload) return;
    if ((it.ammo ?? 0) >= def.ammo) { toast(t('Already fully loaded.')); return; }
    if (!ammoItemFor(def)) { ctx.snd('wv1_empty', null, 0.6); toast(t('No ammo for this weapon in your slots.'), 'bad'); return; }
    reload = { it, t: 0, dur: def.reload || 1.2, base: null };
    ctx.bsnd('wv1_reload', g.camera.position, 0.8);
  }
  function finishReload() {
    const { it } = reload;
    const def = it.def;
    const box = ammoItemFor(def);
    if (box) {
      const take = Math.min(def.ammo - (it.ammo ?? 0), box.charges);
      it.ammo = (it.ammo ?? 0) + take;
      box.charges -= take;
      g.net.broadcast('itst', { id: it.id, am: it.ammo });
      if (box.charges <= 0) g.net.request('consume', { id: box.id }); else g.net.broadcast('itst', { id: box.id, c: box.charges });
    }
  }
  function animateReload(dt) {
    if (!reload) return;
    const cur = held();
    if (!cur || cur.id !== reload.it.id || g.player.dead) { restoreReloadPose(); reload = null; return; }
    reload.t += dt;
    const o = cur.obj;
    if (!reload.base) reload.base = { p: o.position.clone(), q: o.quaternion.clone() };
    const u = clamp(reload.t / reload.dur, 0, 1), dip = Math.sin(u * PI);
    o.position.copy(reload.base.p).add(_c.set(0.02 * dip, -0.11 * dip, 0.05 * dip));
    o.quaternion.copy(reload.base.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7 * dip, 0, -0.25 * dip)));
    if (reload.t >= reload.dur) { restoreReloadPose(); finishReload(); reload = null; }
  }
  function restoreReloadPose() {
    if (!reload?.base) return;
    reload.it.obj.position.copy(reload.base.p); reload.it.obj.quaternion.copy(reload.base.q);
  }
  ctx.wrap(g, 'reload', (orig) => function () {
    const it = held();
    if (it?.def?.wfire && it.def.ammoItem) { startReload(it); return; }
    return orig();
  });

  // ---------------------------------------------------------------- firing
  function cooldownOk(it) {
    if (reload) return false;
    return g.time >= (g.nextSwing || 0);
  }
  function commonFire(it, def, fwd) {
    g.nextSwing = g.time + affixCooldown(it.affix, def.cd);
    it.ammo = Math.max(0, (it.ammo ?? 1) - 1);
    // full-auto guns (nail gun, 9 shots/s) throttle their network chatter: every 3rd shot syncs ammo / noise / sound
    const n = (autoShots = def.auto ? autoShots + 1 : 0);
    const chatty = !def.auto || n % 3 === 1 || it.ammo === 0;
    if (chatty) g.net.broadcast('itst', { id: it.id, am: it.ammo });
    g.swingAnim = 0.6;
    g.viewModel?.kick?.(it.type);
    g.engine.punch?.(def.wfire === 'bolt' ? 0.05 : def.wfire === 'hitscan' && def.auto ? 0.012 : 0.04, (Math.random() - 0.5) * 0.02, 0);
    g.engine.shake(def.auto ? 0.06 : 0.2);
    if (chatty) {
      g.net.request('noise', { p: g.camera.position.toArray(), loud: def.noise ?? 1 });
      ctx.bsnd(def.fireSnd, g.camera.position, 1, def.auto ? 0.92 + Math.random() * 0.16 : undefined);
    }
    void fwd;
  }
  function fire(it) {
    const def = it.def;
    if (!cooldownOk(it)) return;
    if ((it.ammo ?? 0) <= 0) {
      g.nextSwing = g.time + 0.35;
      ctx.snd('wv1_empty', null, 0.7);
      toast(t('Out of ammo. [R] to reload.'), 'bad');
      return;
    }
    const fwd = eyeFwd();
    commonFire(it, def, fwd);
    if (def.wfire === 'hitscan') fireHitscan(it, def, fwd);
    else if (def.wfire === 'bolt') fireBolt(it, def, fwd);
    else if (def.wfire === 'flare') fireFlare(it, def, fwd);
  }

  function requestShot(it, extra) { g.net.request('wshot', { id: it.id, mul: clamp(g.stats.meleeMul || 1, 0.5, 2.5), ...extra }); }
  function clientAffixFx(it, def, view, crit) {
    if (!it.affix) return;
    const a = applyAffixes(it.affix, { dmg: def.dmg, crit, cd: def.cd, stun: def.stun || 0 });
    applyAffixEffects(g, a, view);
  }

  function fireHitscan(it, def, fwd) {
    const eye = g.camera.position.clone();
    const dir = fwd.clone();
    if (def.spread) dir.add(_a.set((Math.random() - 0.5) * def.spread, (Math.random() - 0.5) * def.spread, (Math.random() - 0.5) * def.spread)).normalize();
    const wall = g.physics.raycast(eye, dir, def.reach, G.STATIC | G.DOOR);
    const maxD = wall ? wall.distance : def.reach;
    const r = g.creatures.raycast(eye, dir, maxD);
    const endD = r ? r.t : maxD;
    const end = eye.clone().addScaledVector(dir, endD);
    ctx.fx('tr', { a: muzzleOf(fwd).toArray(), b: end.toArray(), c: def.id === 'nailgun' ? 0xcfd6dc : 0xffe8a0, w: r ? 0 : wall ? 1 : 0 });
    if (r) {
      const crit = Math.random() < g.stats.crit;
      requestShot(it, { cid: r.view.id, crit });
      clientAffixFx(it, def, r.view, crit);
      g.hitstopT = Math.max(g.hitstopT || 0, crit ? 0.06 : 0.03);
      g.viewModel?.impact?.(r.view.maxHp === null ? 'metal' : 'flesh', 0.6);
    } else if (wall) g.net.request('noise', { p: end.toArray(), loud: 0.3 });
  }
  ctx.onFx('tr', (d) => {
    const a = new THREE.Vector3().fromArray(d.a), b = new THREE.Vector3().fromArray(d.b);
    tracerMesh(scene, a, b, d.c ?? 0xffe8a0, 0.07, d.c === 0xcfd6dc ? 0.008 : 0.014);
    if (d.w && g.particles) g.particles.burst(b, 'sparks', null, 0.5);
  });

  function fireBolt(it, def, fwd) {
    const from = muzzleOf(fwd), vel = fwd.clone().multiplyScalar(72);
    ctx.fx('pbolt', { o: from.toArray(), v: vel.toArray() });   // everyone (incl. us: the local copy is the predicted one)
    g.viewModel && (g.swingAnim = 0.7);
  }
  function spawnBolt(o, v, local, it) {
    const pos = new THREE.Vector3().fromArray(o), vel = new THREE.Vector3().fromArray(v);
    ctx.proj.spawn({
      mesh: boltMesh(), pos, vel, grav: 4, life: 3, orient: 'dir', local, maxRange: 90, trail: 0xd8c090, trailEvery: 0.04, trailSize: 0.035,
      onCreature: (p, cr) => { if (!local) return; const crit = Math.random() < g.stats.crit; requestShot(it, { cid: cr.view.id, crit, bolt: 1 }); clientAffixFx(it, it.def, cr.view, crit); g.hitstopT = Math.max(g.hitstopT || 0, 0.05); g.viewModel?.impact?.('flesh', 0.9); },
      onWall: (p, w) => { if (g.particles) g.particles.burst(p.pos, 'sparks', null, 0.4); if (local) requestShot(it, { op: 'recover', p: [p.pos.x, p.pos.y, p.pos.z], n: [w.normal?.x || 0, w.normal?.y || 1, w.normal?.z || 0] }); },
    });
  }
  let localBoltItem = null;
  ctx.onFx('pbolt', (d, from) => {
    const mine = !from || from === g.selfId;
    const it = mine ? (localBoltItem = held() || localBoltItem) : null;
    spawnBolt(d.o, d.v, mine && !!it, it);
  });

  // flares: a lobbed projectile that turns into a burning flare on impact
  function fireFlare(it, def, fwd) {
    const from = muzzleOf(fwd), vel = fwd.clone().multiplyScalar(30);
    ctx.fx('pflare', { o: from.toArray(), v: vel.toArray() });
  }
  ctx.onFx('pflare', (d, from) => {
    const mine = !from || from === g.selfId;
    const it = mine ? held() : null;
    const pos = new THREE.Vector3().fromArray(d.o), vel = new THREE.Vector3().fromArray(d.v);
    const land = (p, hitView) => { if (mine && it) requestShot(it, { op: 'flare', p: [p.pos.x, p.pos.y, p.pos.z], cid: hitView?.id }); };
    ctx.proj.spawn({
      mesh: flareSprite(0xff6a3a, 0.5), pos, vel, grav: 9, life: 3.2, orient: 'none', local: mine, maxRange: 80, trail: 0xff8a3a, trailEvery: 0.03, trailSize: 0.05,
      onCreature: (p, cr) => land(p, cr.view), onWall: (p) => land(p, null),
    });
  });
  // the resulting burning flare (light emitter from the LightPool, no new lights)
  const flares = new Map();   // id -> { sprite, emitter, t, life, p }
  function addFlare(id, p, life) {
    if (flares.has(id)) return;
    if (flares.size >= 5) removeFlare(flares.keys().next().value);
    const pos = new THREE.Vector3().fromArray(p);
    const sprite = flareSprite(0xff5a2a, 1.4);
    sprite.position.copy(pos).add(new THREE.Vector3(0, 0.12, 0));
    scene.add(sprite);
    const emitter = g.lights.add({ pos: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), color: 0xff4a2a, intensity: 2.6, distance: 18, flicker: 0.35, group: 'fx' });
    flares.set(id, { sprite, emitter, t: 0, life, pos, sm: 0 });
    ctx.snd('wv1_flarehiss', pos, 0.6, 1, { ref: 5 });
  }
  function removeFlare(id) {
    const f = flares.get(id);
    if (!f) return;
    f.sprite.removeFromParent(); f.sprite.userData.dispose?.();
    g.lights.remove(f.emitter);
    flares.delete(id);
  }
  ctx.onFx('flare', (d) => addFlare(d.id, d.p, d.life));
  ctx.update((dt) => {
    for (const [id, f] of [...flares]) {
      f.t += dt; f.sm -= dt;
      const k = f.t > f.life - 3 ? Math.max(0, (f.life - f.t) / 3) : 1;
      f.emitter.intensity = 2.6 * k * (0.85 + 0.15 * Math.sin(f.t * 31));
      f.sprite.material.opacity = k;
      f.sprite.scale.setScalar(1.2 + 0.25 * Math.sin(f.t * 23));
      if (f.sm <= 0) { f.sm = 0.22; g.particles?.burst(f.pos.clone().add(new THREE.Vector3(0, 0.25, 0)), { count: 2, color: [0xff8a3a, 0xffd27a, 0x888888], speed: 0.5, up: 1.2, life: 0.8, size: 0.05, gravity: -1.5, drag: 1.5 }, null, 1); }
      if (f.t >= f.life) removeFlare(id);
    }
  });
  ctx.onPhase(() => { for (const id of [...flares.keys()]) removeFlare(id); });

  // ---------------------------------------------------------------- input: LMB (mods 'useItem'), hold-to-fire, R
  ctx.offs.push(mm.on('useItem', (it, hk, gg) => {
    if (gg !== g || hk.handled || !it) return;
    const def = it.def;
    if (def?.wfire && def.wfire !== 'deck') { hk.handled = true; fire(it); }
  }));
  ctx.update((dt) => {
    const it = held(), input = g.input;
    animateReload(dt);
    if (!it || !input.enabled || g.player.dead) return;
    if (it.def?.auto && input.mouseDown(0) && !g.grab?.item && !g.ui.blocksInput()) fire(it);
  });

  // ---------------------------------------------------------------- melee: tier scaling (instance wrapper, actions.js untouched)
  // (tier damage for melee is applied once, in actions.js meleeSwing via tierDmg - relative to the definition's tier)

  // ---------------------------------------------------------------- crowbar: pry locked doors and crates (hold E)
  let pry = null;   // { kind, target, it, t, dur, next }
  const progressBox = hudDock('bottom', 'pry', 12);
  progressBox.style.cssText = 'display:none;min-width:260px;font-family:var(--font);font-size:22px;color:#ffd9b8;text-align:center;text-shadow:0 0 8px rgba(255,138,61,.5)';
  const setProgress = (u) => {
    if (u == null) { progressBox.style.display = 'none'; return; }
    progressBox.style.display = 'block';
    progressBox.innerHTML = `${t('Prying...')}<div style="height:8px;margin-top:4px;background:rgba(255,255,255,.12);border:1px solid rgba(255,150,70,.5)"><div style="height:100%;width:${Math.round(u * 100)}%;background:linear-gradient(90deg,#ff8a3d,#ffd23f)"></div></div>`;
  };
  const targetPos = (p) => (p.kind === 'door' ? p.target.pos.clone().add(_a.set(0, 1.2, 0)) : p.target.pos.clone());
  function startPry(kind, target, it) {
    if (pry) return;
    pry = { kind, target, it, t: 0, dur: it.def.pry || 5, next: 0 };
    ctx.snd('wv1_pry', null, 0.5);
  }
  ctx.wrap(g, 'doorInteraction', (orig) => function (door) {
    const base = orig(door);
    const it = held();
    if (it?.type === 'crowbar' && door.locked && door.kind === 'door' && !door.teleport) {
      return { label: t('Pry the door open with the Crowbar [E]'), sub: t('Hold [E]: slow and loud.'), action: () => startPry('door', door, it), color: '#ffcf6a' };
    }
    return base;
  });
  ctx.offs.push(mm.on('interactables', (list, gg) => {
    if (gg !== g) return;
    const it = held();
    if (it?.type !== 'crowbar') return;
    const outposts = g.world.outdoor?.outposts;
    for (const e of list) {
      if (typeof e.label !== 'string' || !/^Pry the crate open/.test(e.label)) continue;
      const cr = outposts?.crates?.find((c) => c.pos && c.pos.distanceToSquared(e.pos) < 0.01);
      if (!cr) continue;
      e.label = t('Pry the crate open with the Crowbar [E]');
      e.sub = t('Hold [E]: slow and loud.');
      e.action = () => startPry('crate', cr, it);
    }
  }));
  ctx.update((dt) => {
    if (!pry) { if (progressBox.style.display !== 'none') setProgress(null); return; }
    const p = g.player, cur = held(), input = g.input;
    const tp = targetPos(pry);
    const ok = cur && cur.id === pry.it.id && !p.dead && input.isDown('interact') && p.eyePos().distanceTo(tp) < 3.6 && (pry.kind !== 'door' || pry.target.locked);
    if (!ok) { pry = null; setProgress(null); return; }
    pry.t += dt;
    pry.next -= dt;
    if (pry.next <= 0) {
      pry.next = 0.9;
      ctx.bsnd('wv1_pry', tp, 0.5, 0.85 + Math.random() * 0.3);
      g.net.request('noise', { p: tp.toArray(), loud: 1.1 });
    }
    setProgress(pry.t / pry.dur);
    if (pry.t >= pry.dur) {
      const k = pry;
      pry = null; setProgress(null);
      if (k.kind === 'door') g.net.request('wpry', { op: 'door', id: k.target.id, wid: k.it.id });
      else g.net.request('opCrate', { id: k.target.id, s: g.world.outdoor.outposts.seed, pry: k.it.id });
      mm.emit('tfg:pry', { kind: k.kind, id: k.target.id, item: k.it.type, by: g.selfId });
    }
  });

  // ---------------------------------------------------------------- host side
  ctx.hostOn('wshot', (d, from) => {
    const it = g.items.get(d.id);
    const def = it?.def;
    if (!it || it.holder !== from || !def?.wfire || def.wfire === 'deck') return;
    const now = g.time * 1000;   // sim time, not wall clock
    it._wlast = it._wlast || 0;
    if (d.op !== 'recover' && d.op !== 'flare' && now - it._wlast < def.cd * 1000 * 0.5) return;
    if (d.op !== 'recover') it._wlast = now;
    const shooter = posOf(from);
    const mul = clamp(Number(d.mul) || 1, 0.5, 2.5);
    const dmgOf = (crit) => {
      let dmg = def.dmg * relMul(it) * mul;
      if (crit) dmg *= 2;
      const a = it.affix ? applyAffixes(it.affix, { dmg, crit, cd: def.cd, stun: def.stun || 0 }) : null;
      return { dmg: a ? a.dmg : dmg, stun: a ? a.stun : def.stun || 0, crit: a ? a.crit : crit };
    };
    if (d.op === 'recover') {
      if (def.wfire !== 'bolt' || !Array.isArray(d.p) || d.p.length < 3 || !d.p.every(Number.isFinite)) return;
      it._recN = it._recN || { n: 0, t: now };
      if (now - it._recN.t > 60000) it._recN = { n: 0, t: now };
      if (++it._recN.n > 24 || (shooter && shooter.distanceTo(_a.fromArray(d.p)) > def.reach + 15)) return;
      if (Math.random() < 0.75) {
        const n = Array.isArray(d.n) ? d.n : [0, 1, 0];
        g.items.hostSpawn('bolts', new THREE.Vector3(d.p[0] + n[0] * 0.15, d.p[1] + n[1] * 0.15 + 0.05, d.p[2] + n[2] * 0.15), { charges: 1, value: 0 });
      }
      return;
    }
    if (d.op === 'flare') {
      if (def.wfire !== 'flare' || !Array.isArray(d.p) || d.p.length < 3 || !d.p.every(Number.isFinite)) return;
      if (shooter && shooter.distanceTo(_a.fromArray(d.p)) > def.reach + 15) return;
      if (d.cid) { const c = g.creatures.host.get(d.cid); if (c && !c.dead) g.creatures.damage(d.cid, Math.round(def.dmg * relMul(it) * mul), from, {}); }
      const id = 'fl' + Math.floor(Math.random() * 1e9).toString(36);
      hostFlares.push({ id, p: d.p.slice(0, 3), t: 0, life: 24 });
      if (hostFlares.length > 8) hostFlares.shift();
      g.net.broadcast('fx', { k: 'sh', t: 'flare', id, p: d.p.slice(0, 3), life: 24 });
      g.creatures.noise(_a.fromArray(d.p), 1.4);
      return;
    }
    if (!d.cid) return;
    const c = g.creatures.host.get(d.cid);
    if (!c || c.dead) return;
    if (shooter && shooter.distanceTo(c.pos) > def.reach + 8) return;
    const r = dmgOf(!!d.crit);
    const hit = g.net.handlers.get('hit');
    if (hit) hit({ cid: d.cid, dmg: r.dmg, stun: r.stun, crit: r.crit, kb: def.knock || 1 }, from);
    else g.creatures.damage(d.cid, r.dmg, from, { stun: r.stun, crit: r.crit });
    if (d.bolt && Math.random() < 0.6) g.items.hostSpawn('bolts', c.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4)), { charges: 1, value: 0 });
  });
  ctx.hostOn('wpry', (d, from) => {
    const it = g.items.get(d.wid);
    if (!it || it.holder !== from || it.type !== 'crowbar' || d.op !== 'door') return;
    const door = g.doorById?.(d.id);
    if (!door || !door.locked || door.kind === 'vault' || door.kind === 'blast' || door.teleport) return;
    const p = posOf(from);
    if (p && p.distanceTo(door.pos) > 6) return;
    door.locked = false;
    g.hostSetDoor(door.id, true);
    g.creatures.noise(door.pos, 2.6);
    g.net.broadcast('fx', { k: 'sh', t: 'snd', s: 'wv1_snap', p: [door.pos.x, door.pos.y + 1, door.pos.z], v: 1 });
    g.net.broadcast('sys', { text: t('The door gives way with a crack.'), kind: 'info' });
  });

  // host status effects on creatures: scared (flares), slowed (red card). All movement funnels through follow().
  const hostFlares = [];
  const fleeCreature = (c, dt, speed) => {
    const M = g.creatures, sf = c.scareFrom;
    if (!sf) return false;
    let dx = c.pos.x - sf.x, dz = c.pos.z - sf.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const step = Math.max(speed, c.def?.run || 4) * 1.1 * dt;
    const nav = M.nav?.(c);
    for (const [ax, az] of [[dx, dz], [-dz, dx], [dz, -dx]]) {
      const nx = c.pos.x + ax * step, nz = c.pos.z + az * step;
      if (!nav || nav.walkableAt(nx, nz)) { M.placeAt(c, nx, nz); c.yaw = Math.atan2(ax, az); c.setState?.('run'); return true; }
    }
    return true;
  };
  ctx.wrap(g.creatures, 'follow', (orig) => function (c, dt, speed, turn) {
    if (c.scaredT > 0 && fleeCreature(c, dt, speed)) return false;
    if (c.slowT > 0) speed *= c.slowMul || 0.55;
    return orig(c, dt, speed, turn);
  });
  let scareT = 0;
  ctx.update((dt) => {
    if (!g.isHost) return;
    for (let i = hostFlares.length - 1; i >= 0; i--) { hostFlares[i].t += dt; if (hostFlares[i].t > hostFlares[i].life) hostFlares.splice(i, 1); }
    scareT -= dt;
    for (const c of g.creatures.host.values()) {
      if (c.dead) continue;
      if (c.slowT > 0) c.slowT -= dt;
      if (c.scaredT > 0) { c.scaredT -= dt; c.cooldown = Math.max(c.cooldown || 0, 0.4); }
    }
    if (scareT > 0 || !hostFlares.length) return;
    scareT = 0.3;
    for (const f of hostFlares) {
      for (const c of g.creatures.host.values()) {
        if (c.dead || c.def?.boss || c.def?.hazard) continue;
        const base = CREATURES[c.type]?.hp;
        if (!base || base > 100) continue;
        if (Math.hypot(c.pos.x - f.p[0], c.pos.z - f.p[2]) > 9 || Math.abs(c.pos.y - f.p[1]) > 4) continue;
        c.scaredT = 1.2; c.scareFrom = { x: f.p[0], z: f.p[2] }; c.target = null;
      }
    }
  });

  // ---------------------------------------------------------------- finds: the odd gun lying in a deep room (seeded per run + day + moon)
  const FIND_TABLE = [['stackeddeck', 0.5], ['katana', 1.2], ['crossbow', 2], ['pistol', 3], ['nailgun', 3], ['flaregun', 3], ['nailbat', 3], ['crowbar', 3]];
  ctx.offs.push(mm.on('moonPopulated', (gg) => {
    if (gg !== g || !g.isHost) return;
    try {
      const run = g.run, moon = MOONS[run?.moon], fac = g.world.facility;
      if (!run || !moon || moon.company || !fac?.scrapSpots?.length) return;
      const rng = new RNG(hashString(`${run.runId}:finds:${run.day}:${run.moon}`));
      if (!rng.chance(0.42)) return;
      const spots = fac.scrapSpots.filter((s) => (s.dist || 0) >= 6);
      const s = rng.pick(spots.length ? spots : fac.scrapSpots);
      const id = rng.weighted(FIND_TABLE.map(([i, w]) => ({ id: i, w }))).id;
      const def = ITEMS[id];
      const danger = (moon.tier || 1) + (run.quotaIndex || 0) * 0.35;
      const af = rollWeaponAffixes(def, lootLevelFor(danger), rng, { minRarity: def.tier === 'epic' ? 'rare' : 'uncommon', luck: 0.3 });
      g.items.hostSpawn(id, new THREE.Vector3(s.x, s.y + 0.5, s.z), { af, value: 0 });
      if (def.ammoItem) g.items.hostSpawn(def.ammoItem, new THREE.Vector3(s.x + 0.35, s.y + 0.4, s.z + 0.2), { value: 0 });
    } catch (e) { console.warn('[weapons] finds', e); }
  }));

  return {
    reloading: () => !!reload, pryProgress: () => (pry ? pry.t / pry.dur : 0), hostFlares,
    dispose() { progressBox.remove(); for (const id of [...flares.keys()]) removeFlare(id); },
  };
}

export { CARD_COLORS, createCardMesh };
