// SURVIVAL (wave 4, docs/wave4/survival.md). Installed with `this.useModule('survival', installSurvival)` (game.js).
// Foraging (seeded plants per biome, hold E, sickle bonus) -> seeds -> planter boxes (real-time growth, watering) -> cooking (ship stove / campfire, timing
// minigame decides quality) and brewing (tonics) -> storage crates (grid UI, shared, saved) + a slow hunger meter and cold-moon warmth.
// Owner rule: healing ONLY via food. Raw ingredients heal 3 HP; cooked meals heal for real. Nothing here can kill you.
//
// State: every structure is a top-level run key `run['sv:<id>']` (crate / planter / brew / stove / fire). The host mutates it and calls broadcastRun([key]);
// hostSave persists it with the run. Home structures are mirrored into the HOST profile (profile.survival.home) so the base survives new runs.
// Net (all prefixed 'sv'): requests svh (harvest wild plant), svplace, svst (storage), svfarm, svcook, svbrew, svuse (eat / drink), svfire, svsync;
// host -> peers `svfx` (HOST_ONLY): taken plants, errors, results, fx.
// Soft API for other modules (ship2 / homeworld2 planters): game.survival = { plantables, growTick, waterCrop, stageOf, farmYield, ... }.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { ITEMS, registerItem } from './items.js';
import { RECIPES } from './recipes.js';
import { MOONS } from './moons.js';
import { CREATURE_FLAVOUR } from './components.js';
import { G } from '../physics/physics.js';
import { insideShip, SHIP } from '../world/ship.js';
import { boxOccupied } from '../world/doorsafe.js';
import { SPOTS as SHIP_SPOTS, TABLE_SPOTS } from '../world/shiplayout.js';
import { hudDock } from '../ui/dock.js';
import { WEAPON_ARCS } from '../models/avatar.js';
import { EMOTE_BY_ID } from './emotes.js';
import { FOOD_SOUNDS } from './food.js';
import * as D from './survival_data.js';
import * as S from './survival_store.js';
import * as M from '../models/survival.js';
import { createCookPanel, createStoragePanel } from '../ui/panels/survival.js';
import { buildDictionaries } from './survival_i18n.js';

HOST_ONLY.add('svfx');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const KEY = (id) => 'sv:' + id;

// ------------------------------------------------------------------------------------------------ registration at import (ids stable)
{
  const dict = buildDictionaries();
  addTranslations(dict.tr, 'tr');
  addTranslations(dict.ru, 'ru');
  for (const [id, d] of Object.entries(D.ALL_ITEMS)) if (!ITEMS[id]) registerItem({ id, hands: 1, ...d });
  for (const r of D.SV_RECIPES) if (!RECIPES.some((x) => x.id === r.id)) RECIPES.push({ ...r });
  const ARC_EAT = { w: 0.24, s: 0.86, trail: 0, W: { x: 0.35, y: -0.1, e: 0.8, px: -0.19, py: 0.15, pz: 0.16, wr: -0.35 }, S: { x: 0.4, y: -0.12, e: 0.98, px: -0.19, py: 0.16, pz: 0.17, wr: -0.5 } };
  const ARC_DRINK = { w: 0.28, s: 0.84, trail: 0, W: { x: 0.45, y: -0.05, e: 0.95, px: -0.18, py: 0.16, pz: 0.14, wr: -0.6 }, S: { x: 0.55, y: -0.05, e: 1.1, px: -0.18, py: 0.19, pz: 0.15, wr: -1.0 } };
  for (const id of Object.keys(D.ALL_ITEMS)) if (D.isEdible(id) && !WEAPON_ARCS[id]) WEAPON_ARCS[id] = D.isPotionId(id) ? ARC_DRINK : ARC_EAT;
}

// ------------------------------------------------------------------------------------------------ timed buffs (anomaly registry, `food` class)
const BUFF_DEFS = {};
for (const [p, P] of Object.entries(D.PROPS)) BUFF_DEFS[P.buff] = { good: true, glyph: P.glyph, color: P.color, name: P.name, desc: P.desc, hps: P.hps, stamRegen: P.stamRegen, speed: P.speed, night: P.night, quiet: P.quiet, fire: P.fire, warm: P.warm };
BUFF_DEFS.sv_sick = { good: false, glyph: 'SIK', color: '#9acb4a', name: 'Food Poisoning', desc: '-12% speed, stamina regenerates 20% slower. Cook your meat.', speed: -0.12, stamRegen: 0.8 };
const MY_BUFFS = Object.keys(BUFF_DEFS);

const CSS = `
.svh{background:rgba(8,5,2,.72);border:1px solid rgba(255,150,70,.35);padding:2px 8px;font:19px var(--font,'VT323',monospace);color:#ffd9b8;min-width:170px;text-shadow:1px 1px 0 #000}
.svh i{display:block;height:5px;background:rgba(255,255,255,.12);margin:1px 0 2px}.svh i b{display:block;height:100%;background:#ffb04a}
.svh.low i b{background:#ff6a4a}.svh.full i b{background:#8affb0}.svh.cold i b{background:#8ad0ff}.svh small{font-size:15px;opacity:.7;display:flex;justify-content:space-between}
#sv-cold{position:fixed;inset:0;pointer-events:none;z-index:3;box-shadow:inset 0 0 140px rgba(150,210,255,0);transition:box-shadow .6s}
#sv-hold{position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:30;font:22px var(--font,'VT323',monospace);color:#ffe9b8;background:rgba(10,6,2,.8);border:1px solid #a8531f;padding:2px 12px;pointer-events:none}
`;

export function installSurvival(game) {
  const mods = game.mods;
  const offs = [], restores = [];
  let disposed = false;
  const audio = game.audio;

  if (typeof document !== 'undefined' && !document.getElementById('tfg-sv-css')) { const s = document.createElement('style'); s.id = 'tfg-sv-css'; s.textContent = CSS; document.head.appendChild(s); }

  const F = {
    sched: [], views: new Map(), viewSig: '', viewT: 0, planT: 0, near: [],
    plants: null, taken: new Set(), syncAsked: null,
    hunger: D.HUNGER.start, warmth: D.WARMTH.max, hBand: 'ok', wBand: 'warm', saveT: 0, hudT: 0,
    hud: null, cold: null, holdEl: null, hold: null,
    eat: null, emoteId: null, emoteEnd: 0, ledger: new Map(), nv: false, hpSync: 0,
    ghost: null, ghostFor: null, panel: null, panelKind: null,
    cook: { st: 'idle', ids: [], dur: 0, t0: 0, result: null, kind: 'stove', sid: null, at: 0 },
    // host
    sessions: new Map(), meatDrops: 0, meatFor: null, hostT: 0, lastFor: null, taken0: new Map(), lastPlace: new Map(), initDone: false,
  };
  const now = () => game.time;
  const wall = () => Date.now();
  const me = () => game.selfId;
  const player = () => game.player;
  const run = () => game.run;
  const host = () => !!game.isHost;
  const buffs = () => game.anomaly?.buffs || null;
  const toast = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const posOf = (id) => (id === me() ? player()?.pos : game.remotes?.get(id)?.pos) || null;
  const nameOf = (ty) => t(ITEMS[ty]?.name || ty);
  const later = (sec, fn) => { F.sched.push({ t: now() + sec, fn }); };
  const burst = (pos, opts) => { try { game.particles?.burst?.(pos, opts); } catch { /* particles optional */ } };
  const onHome = () => !!(MOONS[run()?.moon]?.home && run()?.phase === 'moon');
  const biomeOf = () => MOONS[run()?.moon]?.biome || 'hills';
  const svKeys = () => { const r = run(); return r ? Object.keys(r).filter((k) => k.startsWith('sv:')) : []; };
  const structs = () => { const r = run(), out = []; if (!r) return out; for (const k of svKeys()) if (r[k] && typeof r[k] === 'object') out.push(r[k]); return out; };
  const structById = (id) => { const s = run()?.[KEY(id)]; return s && typeof s === 'object' ? s : null; };

  function wrap(obj, key, make) {
    const orig = obj?.[key];
    if (typeof orig !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const w = make(orig);
    obj[key] = w;
    restores.push(() => { if (obj[key] === w) { if (had) obj[key] = orig; else delete obj[key]; } });
  }

  // ---------------------------------------------------------------- buff defs
  const DEFS = game.anomaly?.DEFS;
  const injected = [];
  if (DEFS) {
    for (const [id, d] of Object.entries(BUFF_DEFS)) {
      if (DEFS[id]) continue;
      DEFS[id] = { ...d, food: true, dur: 0, stats: (s) => { if (d.speed) s.speedMul += d.speed; if (d.stamRegen) s.staminaRegen *= d.stamRegen; } };
      injected.push(id);
    }
  }
  if (mods?.itemModels) for (const [id, fn] of Object.entries(M.svItemModels(Object.keys(D.ALL_ITEMS)))) if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => fn());
  function grant(id, sec) {
    const b = buffs();
    if (!b || !BUFF_DEFS[id]) return;
    b.add(id, sec);
    F.ledger.set(id, now() + sec);
  }
  const hasBuff = (id) => !!buffs()?.has(id);

  // ---------------------------------------------------------------- sounds
  function ensureSound(name) {
    if (!audio?.ctx || audio.buffers?.has(name) || !FOOD_SOUNDS[name]) return;
    try {
      const data = FOOD_SOUNDS[name](audio.ctx.sampleRate);
      const buf = audio.ctx.createBuffer(1, data.length, audio.ctx.sampleRate);
      buf.copyToChannel(data, 0);
      audio.buffers.set(name, buf);
    } catch { audio.buffers?.set(name, null); }
  }
  const sfx = (name, vol = 0.6, pitch) => { try { ensureSound(name); return audio?.play?.(name, { volume: vol, bus: 'sfx', pitch }); } catch { return null; } };
  const sfxAt = (name, pos, vol = 0.7, pitch, ref = 3) => { try { ensureSound(name); return audio?.at?.(name, pos, vol, { occlude: true, refDistance: ref, maxDistance: 40, pitch }); } catch { return null; } };
  const LEAVES = { count: 9, color: [0x62c46a, 0x4fa85a, 0x9ad88a], speed: 1.3, up: 1.3, life: 0.6, size: 0.045, gravity: 6, drag: 1.4 };
  const SMOKE = { count: 12, color: [0xdddddd, 0xaaaaaa, 0xffffff], speed: 0.8, up: 1.2, life: 0.9, size: 0.06, gravity: -1.2, drag: 1.5 };
  const SPARK = { count: 12, color: [0xffe9a0, 0xffb04a, 0xffffff], speed: 2, up: 1.6, life: 0.55, size: 0.04, gravity: 4, drag: 1.6 };

  // ================================================================================================ HUNGER + WARMTH (own player)
  const prof = () => { const p = game.profile; if (!p) return null; return p.survival || (p.survival = { hunger: D.HUNGER.start }); };
  function loadHunger() { const s = prof(); if (s && Number.isFinite(s.hunger)) F.hunger = clamp(s.hunger, 0, D.HUNGER.max); }
  function saveHunger(force) {
    const s = prof();
    if (!s) return;
    s.hunger = Math.round(F.hunger * 10) / 10;
    if (force || now() - F.saveT > 45) { F.saveT = now(); try { game.progress?.save?.(); } catch { /* profile optional */ } }
  }
  const stationary = () => !player() || player().dead || !run() || !game.net;
  function stepSurvival(dt) {
    const p = player();
    if (stationary()) return;
    const ph = run().phase;
    const before = F.hBand;
    F.hunger = D.hungerStep(F.hunger, dt, ph);
    F.hBand = D.hungerBand(F.hunger);
    if (F.hBand !== before) {
      game.refreshStats?.();
      if (F.hBand === 'hungry') toast(t('You are getting hungry. Cook something.'), 'info');
      else if (F.hBand === 'starving') toast(t('Starving: stamina and speed suffer. Not deadly, just miserable.'), 'bad');
      else if (F.hBand === 'full') toast(`${t(D.HUNGER_BANDS.full.name)}: ${t(D.HUNGER_BANDS.full.desc)}`, 'good');
    }
    // warmth
    const cold = ph === 'moon' && D.isColdMoon(biomeOf(), run().weather);
    const outdoors = !p.indoor && !p.inShip && !insideShip(p.pos);
    let nearFire = false;
    if (cold && outdoors) for (const s of structs()) if (s.k === 'fire' && s.until > wall() && Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < D.WARMTH.fireRadius && Math.abs(s.y - p.pos.y) < 4) { nearFire = true; break; }
    const w0 = F.wBand;
    F.warmth = D.warmthStep(F.warmth, dt, { cold, outdoors, nearFire, warmBuff: hasBuff('sv_warm') });
    F.wBand = D.warmthBand(F.warmth);
    if (F.wBand !== w0) {
      game.refreshStats?.();
      if (F.wBand === 'chilled' && w0 === 'warm') toast(t('You are getting cold. A campfire or a warm meal helps.'), 'info');
      else if (F.wBand === 'freezing') toast(t('Freezing: you move slower. Find a fire.'), 'bad');
    }
    F.cold = { on: cold && outdoors, fire: nearFire };
    saveHunger(false);
  }
  offs.push(mods.on('stats', (s, g) => {
    if (g !== game || !s) return;
    const b = D.HUNGER_BANDS[F.hBand];
    if (b) { s.maxHp += b.maxHp; s.staminaRegen *= b.stamRegen; s.speedMul += b.speed; }
    if (F.wBand !== 'warm') { const w = D.WARMTH[F.wBand]; if (w) { s.speedMul += w.speed; s.staminaRegen *= w.stamRegen; } }
  }));

  // ---------------------------------------------------------------- HUD
  function ensureHud() {
    if (F.hud || typeof document === 'undefined') return;
    try { F.hud = hudDock('left', 'survival', 62); } catch { F.hud = null; }
    const ov = document.createElement('div'); ov.id = 'sv-cold'; (document.getElementById('ui') || document.body).appendChild(ov); F.coldEl = ov;
  }
  function updateHud(dt) {
    ensureHud();
    F.hudT -= dt;
    if (F.hudT > 0) return;
    F.hudT = 0.5;
    const showCold = F.cold?.on || F.warmth < 99;
    if (F.hud) {
      const hb = D.HUNGER_BANDS[F.hBand];
      F.hud.innerHTML = `<div class="svh ${F.hBand === 'hungry' || F.hBand === 'starving' ? 'low' : F.hBand === 'full' ? 'full' : ''}"><small><span>${t('HUNGER')}</span><span>${t(hb.name)}</span></small><i><b style="width:${Math.round(F.hunger)}%"></b></i></div>`
        + (showCold ? `<div class="svh cold" style="margin-top:3px"><small><span>${t('WARMTH')}</span><span>${F.cold?.fire ? t('by the fire') : t(F.wBand === 'warm' ? 'Warm' : F.wBand === 'chilled' ? 'Chilled' : 'Freezing')}</span></small><i><b style="width:${Math.round(F.warmth)}%"></b></i></div>` : '');
    }
    if (F.coldEl) F.coldEl.style.boxShadow = `inset 0 0 140px rgba(150,210,255,${F.wBand === 'warm' ? 0 : F.wBand === 'chilled' ? 0.16 : 0.34})`;
  }

  // ---------------------------------------------------------------- effects of timed buffs
  const P0 = (id) => BUFF_DEFS[id];
  let nvBase = null;
  function setNight(on) {
    const U = game.engine?.postMat?.uniforms;
    if (!U) return;
    if (!nvBase) nvBase = { gamma: U.uGamma.value, vig: U.uVignette.value };
    if (game.anomaly?.buffs?.has?.('m_nv')) return;   // the mutation owns the uniforms while it runs
    U.uGamma.value = on ? nvBase.gamma * 1.4 : nvBase.gamma;
    U.uVignette.value = on ? nvBase.vig * 0.6 : nvBase.vig;
  }
  function buffFx(dt) {
    const p = player();
    if (!p || p.dead) { if (F.nv) { F.nv = false; setNight(false); } return; }
    const b = buffs();
    if (!b) return;
    let hps = 0;
    for (const r of b.list()) if (P0(r.id)?.hps) hps += P0(r.id).hps;
    if (hps > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + hps * dt);
      F.hpSync += dt;
      if (F.hpSync >= 1) { F.hpSync = 0; try { game.net?.send?.('pst', { hp: Math.round(p.hp) }); } catch { /* offline */ } }
    }
    const nv = b.has('sv_night');
    if (nv !== F.nv) { F.nv = nv; setNight(nv); }
  }
  // fire / steam damage and noise: instance wraps (restored on dispose)
  wrap(game, 'damageLocal', (orig) => function (dmg, cause, from) {
    if (dmg < 999 && hasBuff('sv_fire') && (cause === 'fire' || cause === 'steam' || cause === 'burn' || cause === 'lava' || cause === 'molotov')) dmg *= D.PROPS.fire.fire;
    return orig.call(this, dmg, cause, from);
  });
  if (game.net) {
    const net = game.net;
    wrap(net, 'request', (orig) => function (a, data) {
      if (a === 'noise' && data && typeof data.loud === 'number' && hasBuff('sv_quiet')) data = { ...data, loud: data.loud * D.PROPS.quiet.quiet };
      return orig.call(this, a, data);
    });
  }
  // the anomaly module clears buffs on every phase change: put mine back with what is left
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game) return;
    const b = buffs();
    if (b) for (const [id, until] of [...F.ledger]) { const left = until - now(); if (left > 1 && DEFS?.[id]) b.add(id, left); else F.ledger.delete(id); }
    if (host() && (ph === 'takeoff' || ph === 'orbit')) hostClearFires();
    F.hold = null;
  }));
  offs.push(mods.on('localDeath', (c, g) => { if (g === game) { F.ledger.clear(); F.eat = null; F.hold = null; F.cook.st = 'idle'; clearEmote(); } }));

  // ================================================================================================ EATING (own player)
  function setEmote(id, dur) {
    if (game.emotes?.active || player()?.dead) return;
    F.emoteId = 'x:' + id; F.emoteEnd = now() + dur;
    game.emote = F.emoteId; game.emoteT = F.emoteEnd;
  }
  const clearEmote = () => { if (F.emoteId && game.emote === F.emoteId) game.emote = null; F.emoteId = null; };
  function startEat(it) {
    const p = player();
    if (!p || p.dead || game.minigame || disposed) return;
    if (F.eat) return;
    const drink = D.isPotionId(it.type);
    const dur = drink ? 1.5 : it.type === 'sv_meat' ? 2.2 : 1.9;
    F.eat = { id: it.id, ty: it.type, t: 0, dur, marks: [false, false, false], drink };
    setEmote(drink ? 'fd_drink' : 'fd_eat', dur + 0.15);
    sfx(drink ? 'fd_pop' : 'fd_crunch', 0.35, 1.1);
  }
  function updateEat(dt) {
    const e = F.eat;
    if (!e) return;
    const p = player();
    if (!p || p.dead || p.heldItem?.()?.id !== e.id || game.minigame) { F.eat = null; clearEmote(); return; }
    e.t += dt;
    const prog = e.t / e.dur;
    [0.35, 0.55, 0.75].forEach((m, i) => { if (!e.marks[i] && prog >= m) { e.marks[i] = true; sfx(e.drink ? 'fd_gulp' : 'fd_crunch', 0.5, 0.9 + Math.random() * 0.25); game.viewModel?.kick?.('generic'); } });
    if (e.t >= e.dur) { F.eat = null; game.net?.request('svuse', { id: e.id }); }
  }
  function heal(n) {
    const p = player();
    if (!p || p.dead || !(n > 0)) return;
    p.hp = Math.min(p.maxHp, p.hp + n);
    try { game.net?.send?.('pst', { hp: Math.round(p.hp) }); } catch { /* offline */ }
    game.engine?.flash?.(0x66ff88, 0.14);
  }
  /** effects of an eaten item on MY player (after the host confirmed and removed the item) */
  function applyEaten(d) {
    const p = player();
    if (!p || p.dead) return;
    const ty = d.ty, q = D.qualOfTier(d.tr);
    const lines = [];
    if (D.isDishId(ty)) {
      const r = D.eatDish(ty, q, d.v | 0, d.bv | 0);
      if (!r) return;
      heal(r.heal); F.hunger = D.eatHunger(F.hunger, r.hunger);
      lines.push(`${t(D.QUAL[q].name)} ${t(r.name)}: +${r.heal} ${t('HP')}, +${r.hunger} ${t('hunger')}`);
      if (r.buff) { grant(r.buff.id, r.buff.sec); lines.push(`${t(BUFF_DEFS[r.buff.id].name)} ${Math.round(r.buff.sec)} s`); }
      if (r.poison) { grant('sv_sick', 35); lines.push(t('It was not cooked through. Food poisoning.')); }
      if (q === 0) lines.push(t('Burnt to a crisp. Barely edible.'));
    } else if (D.isPotionId(ty)) {
      const prop = D.potionProp(ty), sec = D.potionSeconds(ty, d.tr || 'uncommon');
      grant(D.PROPS[prop].buff, sec);
      if (prop === 'stam') p.stamina = Math.min(p.maxStamina, p.stamina + D.POTIONS.stam.instant.stam);
      lines.push(`${t(D.PROPS[prop].name)} ${sec} s`);
    } else {
      const r = D.eatRaw(ty);
      if (!r) return;
      heal(r.heal); F.hunger = D.eatHunger(F.hunger, r.hunger);
      if (r.poison) { grant('sv_sick', D.RAW.poisonSec); lines.push(t('Raw meat. You feel sick.')); } else lines.push(`${nameOf(ty)}: +${r.heal} ${t('HP')}`);
    }
    F.hBand = D.hungerBand(F.hunger); game.refreshStats?.(); saveHunger(true);
    toast(lines.join(' · '), lines.some((l) => /sick|poison/i.test(l)) ? 'bad' : 'good');
    sfx(lines.length > 1 ? 'ui_confirm' : 'ui_click', 0.35);
    mods?.emit?.('tfg:ate', ty, null);
  }
  // meals and hunger from the older food module (packaged snacks): they feed a little too
  offs.push(mods.on('tfg:ate', (ty, fd) => {
    if (typeof ty === 'string' && ty.startsWith('fd_')) { F.hunger = D.eatHunger(F.hunger, /booze|drink/.test(fd?.kind || '') ? 3 : 12); saveHunger(false); }
  }));

  // ================================================================================================ WILD PLANTS
  function clearPlants() {
    if (F.plants) for (const im of F.plants.meshes) { im.removeFromParent(); im.dispose(); }
    F.plants = null; F.taken.clear(); F.syncAsked = null;
  }
  function buildPlants(world) {
    clearPlants();
    const out = world?.outdoor;
    if (!out || world.company) return;
    const moon = MOONS[world.moonId];
    if (!moon || moon.home) return;
    const terrain = out.terrain || world.terrain;
    let list = [];
    try {
      list = D.planPlants(world.seed | 0, moon.biome, {
        scale: terrain?.scale || 1,
        avoid: (x, z, m) => { try { return !!out.avoid?.(x, z, m); } catch { return false; } },
        heightAt: (x, z) => (terrain?.heightAt ? terrain.heightAt(x, z) - 0.02 : 0),
      });
    } catch (e) { console.warn('[survival] plan', e); return; }
    const byKind = new Map();
    for (const pl of list) { (byKind.get(pl.k) || byKind.set(pl.k, []).get(pl.k)).push(pl); }
    const meshes = [], byId = new Map();
    for (const [k, arr] of byKind) {
      const im = M.createPlantInstances(k, arr);
      out.group.add(im);
      meshes.push(im);
      arr.forEach((pl, i) => { pl.im = im; pl.idx = i; byId.set(pl.id, pl); });
    }
    F.plants = { seed: world.seed | 0, list, byId, meshes };
    // wild plants are recorded per landing: everything already taken is hidden after a (late) join
  }
  function hidePlant(pl) {
    if (!pl || pl.gone) return;
    pl.gone = true;
    try { pl.im.setMatrixAt(pl.idx, M.HIDE_MATRIX); pl.im.instanceMatrix.needsUpdate = true; } catch { /* mesh gone */ }
  }
  const heldOf = (type) => { const p = player(); const it = p?.heldItem?.(); return it && it.type === type ? it : null; };

  // ---- hold-E machine (wild plants, pack up)
  function startHold(key, need, fn) { if (F.hold && F.hold.key === key) return; F.hold = { key, need, t: 0, fn }; }
  const holdBar = (f) => { const n = Math.round(clamp(f, 0, 1) * 10); return '[' + '#'.repeat(n) + '-'.repeat(10 - n) + ']'; };
  function updateHold(dt) {
    const h = F.hold;
    if (!h) return;
    const tgt = game.interactTarget;
    if (!game.input?.isDown?.('interact') || tgt?.action?.__sv !== h.key || player()?.dead || game.ui?.panelOpen) { F.hold = null; return; }
    h.t += dt;
    if (h.t >= h.need) { const fn = h.fn; F.hold = null; try { fn(); } catch (e) { console.warn('[survival] hold', e); } }
  }
  const holdAction = (key, need, fn) => Object.assign(() => startHold(key, need, fn), { __sv: key });
  const holdLabel = (key, text, need) => () => `${text} ${holdBar(F.hold?.key === key ? F.hold.t / need : 0)} [${t('hold E')}]`;

  function plantInteractables(out) {
    const p = player();
    if (!F.plants || !p) return;
    const pos = p.pos;
    const sickle = heldOf('sv_sickle');
    for (const pl of F.plants.list) {
      if (pl.gone) continue;
      const dx = pl.x - pos.x, dz = pl.z - pos.z;
      if (dx * dx + dz * dz > 20) continue;
      const P = D.PLANTS[pl.k], key = 'sv:p:' + pl.id, need = sickle ? D.HARVEST_SEC.sickle : D.HARVEST_SEC.hand;
      out.push({
        pos: new THREE.Vector3(pl.x, pl.y + 0.3 * pl.scale, pl.z), r: 0.7, reach: 3.4,
        label: holdLabel(key, `${t('Pick')} ${t(P.name)}${pl.rare ? ' (' + t('rare') + ')' : ''}`, need),
        sub: sickle ? t('Sickle: faster, +1') : t(P.hint),
        action: holdAction(key, need, () => game.net.request('svh', { id: pl.id, s: F.plants.seed, sk: sickle ? sickle.id : null })),
      });
    }
  }

  // ================================================================================================ STRUCTURE VIEWS (all peers)
  const rotOff = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  function destroyView(v) {
    for (const c of v.cols) { try { game.physics.removeCollider(c); } catch { /* gone */ } }
    if (v.light) { try { game.lights?.remove(v.light); } catch { /* gone */ } }
    try { v.model.dispose?.(); } catch { /* ignore */ }
    M.disposeGroup(v.model.group);
  }
  function createView(s) {
    const parent = s.w === 'ship' ? game.ship?.group : (game.world?.mapGroup || null);
    if (!parent) return null;
    let model;
    try {
      model = s.k === 'crate' ? M.createCrate(s.t, s.lab, s.col) : s.k === 'planter' ? M.createPlanter() : s.k === 'brew' ? M.createBrewStand() : s.k === 'stove' ? M.createStove() : M.createCampfire();
    } catch (e) { console.warn('[survival] model', s.k, e); return null; }
    const g = model.group;
    g.position.set(s.x, s.y, s.z); g.rotation.y = s.yaw || 0;
    parent.add(g);
    const cols = [];
    for (const [cx, cy, cz, hx, hy, hz] of model.colliders || []) {
      const [ox, oz] = rotOff(cx, cz, s.yaw || 0);
      try { cols.push(game.physics.addStaticBox(s.x + ox, s.y + cy, s.z + oz, hx, hy, hz, s.yaw || 0, G.STATIC, { kind: 'static' })); } catch { /* physics optional */ }
    }
    const v = { id: s.id, ver: s.ver, k: s.k, w: s.w, model, cols, pos: new THREE.Vector3(s.x, s.y, s.z), yaw: s.yaw || 0, light: null, cookOn: false };
    if (s.k === 'fire' && game.lights) {
      v.light = { pos: new THREE.Vector3(s.x, s.y + 0.7, s.z), color: 0xff8a3a, intensity: 2.4, distance: 15, flicker: 0.3, group: 'sv' };
      try { game.lights.add(v.light); } catch { v.light = null; }
    }
    return v;
  }
  const activeWhere = (w) => (w === 'ship' ? !!game.ship?.group : w === 'home' ? onHome() && !!game.world?.mapGroup : w === 'moon' ? run()?.phase === 'moon' && !!game.world?.mapGroup : false);
  function syncViews() {
    const want = new Map();
    for (const s of structs()) if (activeWhere(s.w)) want.set(s.id, s);
    for (const [id, v] of [...F.views]) {
      const s = want.get(id);
      if (!s || s.ver !== v.ver || v.w !== s.w || !v.model.group.parent) { destroyView(v); F.views.delete(id); }
    }
    for (const [id, s] of want) if (!F.views.has(id)) { const v = createView(s); if (v) F.views.set(id, v); }
  }
  const planterCells = (s, tt) => (s.cells || []).map((c) => { if (!c) return null; const cc = { ...c }; D.growTick(cc, tt); return { kind: cc.k, stage: D.stageOf(cc.p), p: cc.p, wet: D.isWet(cc, tt) }; });
  function updateViews(dt, tt) {
    const wt = wall();
    for (const v of F.views.values()) {
      const s = structById(v.id);
      if (!s) continue;
      if (v.k === 'planter') { const cs = planterCells(s, wt); v.model.setCells(cs.map((c) => c && { kind: c.kind, stage: c.stage })); v.model.setWet(cs.some((c) => c?.wet)); }
      else if (v.k === 'fire') { const left = (s.until - wt) / 1000; v.model.setBurn(left > 0 ? Math.min(1, left / 40) : 0); v.model.tick(tt); if (v.light) v.light.intensity = left > 0 ? 2.4 * Math.min(1, 0.4 + left / 30) : 0; }
      else if (v.k === 'brew') { const j = s.job; v.model.setJob(j ? D.PROPS[D.potionProp(j.type)]?.color : null, j && j.done <= wt); v.model.tick(tt); }
      else if (v.k === 'stove') v.model.setActive(F.cook.st === 'run' && F.cook.sid === v.id);
      else if (v.k === 'crate') v.model.open?.(F.panelKind === 'crate' && F.panel?.crateId === v.id ? 1 : 0);
    }
  }
  function clearViews() { for (const v of F.views.values()) destroyView(v); F.views.clear(); }

  // ---------------------------------------------------------------- interactables (structures)
  const cellPos = (s, i) => { const [ox, oz] = rotOff([-0.45, 0, 0.45][i], 0, s.yaw || 0); return new THREE.Vector3(s.x + ox, s.y + 0.6, s.z + oz); };
  function structInteractables(out) {
    const p = player();
    if (!p) return;
    const wt = wall();
    for (const v of F.views.values()) {
      const s = structById(v.id);
      if (!s || v.pos.distanceTo(p.pos) > 5.5) continue;
      const top = new THREE.Vector3(s.x, s.y + (v.model.top || 1) + 0.15, s.z);
      if (s.k === 'crate') {
        const T = S.CRATE_TIERS[s.t] || S.CRATE_TIERS[1];
        out.push({ pos: top, r: 0.95, reach: 3.3, label: `${t('Open')} ${s.lab || t(T.name)} [E]`, sub: `${S.usedCells(s)}/${S.capacity(s)}`, action: () => openStorage(s.id) });
      } else if (s.k === 'stove') {
        out.push({ pos: top.clone().add(new THREE.Vector3(0, 0.1, 0)), r: 0.95, reach: 3.3, label: t('Cook [E]'), sub: t('Ship stove: 1-3 ingredients, watch the needle'), action: () => openCook('stove', s.id) });
      } else if (s.k === 'brew') {
        const j = s.job;
        out.push({ pos: top.clone().add(new THREE.Vector3(0, 0.15, 0)), r: 0.9, reach: 3.3, label: t('Brew [E]'), sub: j ? (j.done > wt ? t('Brewing...') : t('Ready')) : t('Tonics from herbs'), action: () => openCook('brew', s.id) });
        if (!j && !s.b) out.push({ pos: new THREE.Vector3(s.x, s.y + 0.4, s.z), r: 0.5, reach: 2.6, noLos: false, label: holdLabel('sv:pk:' + s.id, t('Pack up'), 1.2), action: holdAction('sv:pk:' + s.id, 1.2, () => game.net.request('svst', { op: 'pack', id: s.id })) });
      } else if (s.k === 'fire') {
        const left = (s.until - wt) / 1000, wood = heldOf('comp_wood');
        if (left <= 0) continue;
        out.push({ pos: new THREE.Vector3(s.x, s.y + 0.5, s.z), r: 0.9, reach: 3.3, label: wood ? t('Add wood [E]') : t('Cook at the fire [E]'), sub: `${Math.ceil(left)} s`, action: () => (wood ? game.net.request('svfire', { id: s.id, it: wood.id }) : openCook('fire', s.id)) });
      } else if (s.k === 'planter') {
        const seed = player().heldItem?.(), can = heldOf('sv_can');
        for (let i = 0; i < S.PLANTER_CELLS; i++) {
          const c = s.cells?.[i];
          const cc = c ? { ...c } : null;
          if (cc) D.growTick(cc, wt);
          const pos = cellPos(s, i);
          let label, sub = '', act;
          if (!cc) {
            if (seed && D.isSeedItem(seed.type)) { label = tf('Plant {name} [E]', { name: nameOf(seed.type) }); act = () => game.net.request('svfarm', { op: 'plant', id: s.id, c: i, it: seed.id }); }
            else { label = t('Empty cell'); sub = t('Hold seeds and press E'); act = () => {}; }
          } else if (cc.p >= 1) { label = tf('Harvest {name} [E]', { name: t(D.PLANTS[cc.k].name) }); act = () => game.net.request('svfarm', { op: 'harvest', id: s.id, c: i, sk: heldOf('sv_sickle')?.id || null }); }
          else if (can) { label = tf('Water {name} [E]', { name: t(D.PLANTS[cc.k].name) }); sub = `${Math.round(cc.p * 100)}%`; act = () => game.net.request('svfarm', { op: 'water', id: s.id, c: i, it: can.id }); }
          else { label = `${t(D.PLANTS[cc.k].name)} ${Math.round(cc.p * 100)}%`; sub = `${D.isWet(cc, wt) ? t('Watered') : t('Thirsty: hold a watering can')} · ${t('ripe in')} ${fmtMs(D.msToRipe(cc, wt))}`; act = () => {}; }
          out.push({ pos, r: 0.36, reach: 3.2, label, sub, action: act });
        }
        if (!(s.cells || []).some(Boolean) && !s.b) out.push({ pos: new THREE.Vector3(s.x, s.y + 0.3, s.z), r: 0.5, reach: 2.6, label: holdLabel('sv:pk:' + s.id, t('Pack up'), 1.2), action: holdAction('sv:pk:' + s.id, 1.2, () => game.net.request('svst', { op: 'pack', id: s.id })) });
      }
    }
  }
  const fmtMs = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // ================================================================================================ PLACING (own player)
  function aimPoint() {
    const p = player(), cam = game.camera;
    if (!p || !cam) return null;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = game.physics.raycast(cam.position, dir, 6, G.STATIC | G.DOOR, p.col);
    if (!hit?.point) return null;
    if (Math.abs(hit.point.y - p.pos.y) > 0.7) return null;
    return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
  }
  const snapYaw = () => Math.round((player()?.yaw || 0) / (Math.PI / 4)) * (Math.PI / 4);
  function whereFor(kind, pt) {
    if (kind === 'fire') return run()?.phase === 'moon' && !insideShip(pt) ? 'moon' : null;
    if (insideShip(pt) && pt.x > SHIP.x0 + 0.7 && pt.x < SHIP.x1 - 0.7 && pt.z > SHIP.z0 + 0.55 && pt.z < SHIP.z1 - 0.55) return 'ship';
    if (onHome() && !insideShip(pt)) return 'home';
    return null;
  }
  const sizeOfKind = (kind, def) => (kind === 'crate' ? S.CRATE_TIERS[def.crate || 1].size : kind === 'planter' ? S.PLANTER_SIZE : kind === 'brew' ? S.STAND_SIZE : [0.9, 0.5, 0.9]);
  function placeCheck(def, pt, physics = true) {
    const kind = def.place;
    const where = whereFor(kind, pt);
    if (!where) return { ok: false, why: kind === 'fire' ? 'Light it outside.' : 'Only on your ship or your homeworld.' };
    const yaw = snapYaw();
    const sz = sizeOfKind(kind, def);
    const ex = structs().filter((s) => s.w === where && (kind === 'fire' ? s.k === 'fire' : s.k !== 'fire')).map((s) => ({ k: s.k, x: s.x, z: s.z }));
    const why = S.placeReject(kind, pt.x, pt.z, ex);
    if (why) return { ok: false, why, where, yaw };
    if (physics && kind !== 'fire') {
      const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
      const hx = (c * sz[0] + sn * sz[2]) / 2, hz = (sn * sz[0] + c * sz[2]) / 2;   // axis-aligned footprint of the rotated box
      if (boxOccupied(game.physics, pt.x, pt.y + sz[1] / 2 + 0.06, pt.z, Math.max(0.1, hx - 0.03), Math.max(0.05, sz[1] / 2 - 0.08), Math.max(0.1, hz - 0.03), G.STATIC | G.DOOR)) return { ok: false, why: 'Something is in the way.', where, yaw };
    }
    return { ok: true, where, yaw, sz };
  }
  function tryPlace(it, def) {
    const pt = aimPoint();
    if (!pt) { toast(t('Aim at the floor.'), 'info'); return; }
    const r = placeCheck(def, pt);
    if (!r.ok) { toast(t(r.why), 'bad'); sfx('ui_error', 0.3); return; }
    game.net.request('svplace', { it: it.id, x: +pt.x.toFixed(2), y: +pt.y.toFixed(2), z: +pt.z.toFixed(2), yaw: +r.yaw.toFixed(3) });
  }
  function updateGhost() {
    const p = player(), held = p?.heldItem?.(), def = held && ITEMS[held.type];
    if (!p || p.dead || !def?.place || game.ui?.panelOpen) { if (F.ghost) F.ghost.mesh.visible = false; return; }
    const pt = aimPoint();
    if (!pt) { if (F.ghost) F.ghost.mesh.visible = false; return; }
    if (!F.ghost) { F.ghost = M.createGhost(); game.scene.add(F.ghost.mesh); }
    const r = placeCheck(def, pt);
    const sz = sizeOfKind(def.place, def);
    F.ghost.mesh.visible = true;
    F.ghost.setSize(sz[0], sz[1], sz[2]);
    F.ghost.mesh.position.set(pt.x, pt.y + sz[1] / 2, pt.z);
    F.ghost.mesh.rotation.y = snapYaw();
    F.ghost.setOk(r.ok);
  }

  // ================================================================================================ PANELS
  function closePanel() { try { F.panel?.dispose?.(); } catch { /* gone */ } F.panel = null; F.panelKind = null; }
  function openCook(kind, sid) {
    if (!game.ui?.openPanel || game.ui.panelOpen) return;
    closePanel();
    F.cook = { st: 'idle', ids: [], dur: 0, t0: 0, result: null, kind, sid, at: 0 };
    F.panel = createCookPanel(game, api, { kind, sid });
    F.panelKind = kind;
    game.ui.openPanel(F.panel.el);
    sfx('ui_click', 0.3);
  }
  function openStorage(id) {
    if (!game.ui?.openPanel || game.ui.panelOpen) return;
    closePanel();
    F.panel = createStoragePanel(game, api, id);
    F.panelKind = 'crate';
    game.ui.openPanel(F.panel.el);
    sfx('cloth_rustle', 0.35, 1.1);
  }

  // ---------------------------------------------------------------- cooking client state
  const ingType = (id) => game.items?.get?.(id)?.type || null;
  function carried() {
    const out = [];
    for (const it of game.items.all()) {
      if (it.holder !== me() || it.inv?.k === 'eq' || !D.INGREDIENTS[it.type]) continue;
      out.push({ id: it.id, type: it.type, it });
    }
    return out;
  }
  function cookStart(kind, sid, ids) {
    const K = F.cook;
    if (K.st === 'run' || K.st === 'wait') return;
    K.st = 'wait'; K.kind = kind; K.sid = sid; K.ids = ids; K.result = null; K.at = now();
    game.net.request('svcook', { op: 'start', s: sid, ids });
    later(4, () => { if (F.cook.st === 'wait' && F.cook.at === K.at && !F.cook.result) { F.cook.st = 'idle'; F.panel?.refresh?.(); } });
  }
  function cookStop() {
    const K = F.cook;
    if (K.st !== 'run') return;
    const p = clamp((performance.now() - K.t0) / 1000 / K.dur, 0, 1.3);
    K.st = 'wait'; K.stopP = p; K.at = now();
    game.net.request('svcook', { op: 'stop', p: +p.toFixed(3) });
    later(4, () => { if (F.cook.st === 'wait' && F.cook.at === K.at) { F.cook.st = 'idle'; F.panel?.refresh?.(); } });
  }
  function resetCook() {
    const K = F.cook;
    if (K.st === 'run') game.net?.request('svcook', { op: 'cancel' });
    if (K.st !== 'wait') { K.st = 'idle'; K.result = null; }
    for (const v of F.views.values()) if (v.k === 'stove') v.model.setActive(false);
  }
  function brewJob(sid) { const s = structById(sid); return s?.job ? { type: s.job.type, left: s.job.done - wall() } : null; }

  // ================================================================================================ NET: client side
  function onFx(d) {
    if (!d || typeof d !== 'object') return;
    if (d.to && d.to !== me()) return;
    const p = player();
    switch (d.k) {
      case 'err': toast(t(String(d.why || 'Nope.')), 'bad'); sfx('ui_error', 0.3); if (F.cook.st === 'wait') F.cook.st = 'idle'; F.panel?.say?.(t(String(d.why || '')), true); F.panel?.refresh?.(); break;
      case 'list': if (F.plants && d.s === F.plants.seed) for (const id of d.ids || []) { F.taken.add(id); hidePlant(F.plants.byId.get(id)); } break;
      case 'taken': {
        if (!F.plants || d.s !== F.plants.seed) break;
        const pl = F.plants.byId.get(d.id);
        if (!pl) break;
        F.taken.add(d.id);
        const pos = new THREE.Vector3(pl.x, pl.y + 0.3, pl.z);
        hidePlant(pl); burst(pos, LEAVES); sfxAt('cloth_rustle', pos, 0.7, 0.9 + Math.random() * 0.3);
        break;
      }
      case 'ate': applyEaten(d); break;
      case 'cookok': { const K = F.cook; K.st = 'run'; K.dur = d.dur; K.t0 = performance.now(); K.result = null; sfx('ui_click', 0.3); F.panel?.refresh?.(); break; }
      case 'cooked': { const K = F.cook; K.st = 'done'; K.result = { ty: d.ty, q: d.q, p: d.p ?? K.stopP ?? 0 }; sfx(d.q >= 3 ? 'ui_confirm' : d.q === 0 ? 'ui_error' : 'ui_click', 0.4); if (d.q >= 3) toast(t('Perfect!'), 'good'); F.panel?.refresh?.(); break; }
      case 'fx': {
        if (!okPos(d.p)) break;
        const pos = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
        if (d.f === 'cook') { burst(pos, d.q === 0 ? SMOKE : SPARK); sfxAt(d.q === 0 ? 'ui_error' : 'ui_confirm', pos, 0.5, 1, 4); }
        else if (d.f === 'place') { burst(pos, SPARK); sfxAt('hit_wall', pos, 0.6, 0.9, 4); }
        else if (d.f === 'grow') { burst(pos, LEAVES); sfxAt('cloth_rustle', pos, 0.6, 1, 3); }
        else if (d.f === 'water') { burst(pos, { count: 8, color: [0x9ad8ff, 0xffffff], speed: 1, up: 0.6, life: 0.5, size: 0.04, gravity: 8, drag: 1.2 }); sfxAt('cloth_rustle', pos, 0.5, 1.4, 3); }
        else if (d.f === 'brew') { burst(pos, SPARK); sfxAt('ui_confirm', pos, 0.5, 1.3, 4); }
        break;
      }
      default: break;
    }
    void p;
  }
  const okPos = (a) => Array.isArray(a) && a.length === 3 && a.every((n) => Number.isFinite(n));

  // ================================================================================================ NET: host side
  const err = (to, why) => game.net.sendTo(to, 'svfx', { k: 'err', why, to });
  const fxAll = (f, p, q) => game.net.broadcast('svfx', { k: 'fx', f, p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], q });
  const rmItem = (it) => game.net.broadcast('it', { e: 'rm', id: it.id });
  const heldBy = (id, from) => { const it = game.items.get(id); return it && it.holder === from && it.state !== 'dead' ? it : null; };
  function commit(s) {
    s.ver = (s.ver | 0) + 1;
    run()[KEY(s.id)] = s;
    try { game.broadcastRun([KEY(s.id)]); } catch (e) { console.warn('[survival] broadcast', e); }
    if (s.w === 'home') mirrorHome();
  }
  function removeStruct(s) {
    delete run()[KEY(s.id)];
    try { game.broadcastRun([KEY(s.id)]); } catch { /* offline */ }
    if (s.w === 'home') mirrorHome();
  }
  /** persist home structures into the HOST profile (survives new runs) */
  function mirrorHome() {
    const sv = prof();
    if (!sv) return;
    const o = {};
    for (const s of structs()) if (s.w === 'home') o[s.id] = JSON.parse(JSON.stringify(s));
    sv.home = o;
    try { game.progress?.save?.(); } catch { /* profile optional */ }
  }
  function nextId(where) {
    let n = 0;
    for (const s of structs()) { const m = /(\d+)$/.exec(s.id); if (m) n = Math.max(n, +m[1]); }
    const sv = prof();
    if (sv?.home) for (const id of Object.keys(sv.home)) { const m = /(\d+)$/.exec(id); if (m) n = Math.max(n, +m[1]); }
    return (where === 'home' ? 'h' : where === 'moon' ? 'f' : 'c') + (n + 1);
  }
  const spawnAt = (type, pos, opts = {}) => game.items.hostSpawn(type, pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z), opts);
  const popVel = () => { const a = Math.random() * TAU; return [Math.cos(a) * 1.4, 2.4 + Math.random(), Math.sin(a) * 1.4]; };
  const near = (from, x, z, r) => { const q = posOf(from); return !!q && Math.hypot(q.x - x, q.z - z) <= r && true; };
  const xp = (to, n, reason) => { try { game.net.broadcast('xp', { to, xp: n, coin: 0, reason }); } catch { /* optional */ } };

  // ---- wild plants
  const takenSets = new Map();   // host: `${seed}` -> Set(plant ids)
  function hostHarvest(d, from) {
    if (!host() || run()?.phase !== 'moon' || !F.plants || d.s !== F.plants.seed) return;
    const pl = F.plants.byId.get(d.id);
    let set = takenSets.get(d.s);
    if (!set) takenSets.set(d.s, set = new Set());
    if (!pl || set.has(pl.id)) return;
    const q = posOf(from);
    if (!q || Math.hypot(q.x - pl.x, q.z - pl.z) > 5.5) return;
    const sk = d.sk ? heldBy(d.sk, from) : null;
    const y = D.forageYield(pl.k, pl.rare, Math.random, { sickle: !!(sk && sk.type === 'sv_sickle') });
    set.add(pl.id);
    const at = new THREE.Vector3(pl.x, pl.y + 0.5, pl.z);
    for (let i = 0; i < y.plants; i++) spawnAt(D.plantItem(pl.k), at, { linvel: popVel(), ...(pl.rare ? { tier: 'rare' } : {}) });
    for (let i = 0; i < y.seeds; i++) spawnAt(D.seedItem(pl.k), at, { linvel: popVel() });
    game.net.broadcast('svfx', { k: 'taken', s: d.s, id: pl.id });
    xp(from, pl.rare ? 8 : 3, t('Foraged'));
  }
  // ---- placing
  function hostPlace(d, from) {
    if (!host()) return;
    const it = heldBy(d.it, from);
    const def = it && ITEMS[it.type];
    if (!def?.place) return;
    const q = posOf(from);
    if (!q || !Number.isFinite(d.x) || !Number.isFinite(d.z) || Math.hypot(q.x - d.x, q.z - d.z) > 8) return err(from, 'Too far away.');
    const pt = { x: d.x, y: Number.isFinite(d.y) ? d.y : q.y, z: d.z };
    const yaw = Number.isFinite(d.yaw) ? clamp(d.yaw, -7, 7) : 0;
    const kind = def.place;
    const where = whereFor(kind, pt);
    if (!where) return err(from, kind === 'fire' ? 'Light it outside.' : 'Only on your ship or your homeworld.');
    const ex = structs().filter((s) => s.w === where && (kind === 'fire' ? s.k === 'fire' : s.k !== 'fire')).map((s) => ({ k: s.k, x: s.x, z: s.z }));
    const why = S.placeReject(kind, pt.x, pt.z, ex);
    if (why) return err(from, why);
    const id = nextId(where);
    const s = S.newStruct(kind, id, where, pt, yaw, { tier: def.crate, until: wall() + D.CAMPFIRE.burnSec * 1000 });
    rmItem(it);
    commit(s);
    fxAll('place', new THREE.Vector3(pt.x, pt.y + 0.4, pt.z));
  }
  // ---- storage
  function crateNear(id, from) {
    const c = structById(id);
    if (!c || c.k !== 'crate') return null;
    if (!near(from, c.x, c.z, 7.5)) return null;
    return c;
  }
  function giveBack(from, rec, at, to) {
    const def = ITEMS[rec.i];
    if (!def) return;
    const opts = S.spawnOpts(rec);
    const iv = to ? game.inventory?.hostPlaceFor?.(from, def, to) : game.inventory?.hostPlaceFor?.(from, def, 'bag');
    if (iv) game.items.hostSpawn(rec.i, new THREE.Vector3(at.x, at.y + 0.8, at.z), { ...opts, holder: from, inv: iv });
    else game.items.hostSpawn(rec.i, new THREE.Vector3(at.x, at.y + 0.9, at.z), { ...opts, linvel: [0, 1.2, 0] });   // pockets full: it drops at your feet
  }
  function hostStorage(d, from) {
    if (!host() || !d || typeof d !== 'object') return;
    const op = d.op;
    const s = structById(String(d.id || ''));
    if (!s) return err(from, 'That is gone.');
    const q = posOf(from);
    if (!q || Math.hypot(q.x - s.x, q.z - s.z) > 7.5) return err(from, 'Too far away.');
    if (op === 'pack') {
      if (s.b) return err(from, 'That one is bolted down.');
      if (!S.isEmptyStruct(s)) return err(from, s.k === 'crate' ? 'Empty the crate first.' : 'Empty it first.');
      const item = s.k === 'crate' ? S.CRATE_TIERS[s.t].item : s.k === 'planter' ? 'sv_planter' : s.k === 'brew' ? 'sv_brewstand' : null;
      if (!item) return;
      removeStruct(s);
      spawnAt(item, new THREE.Vector3(q.x, q.y + 0.9, q.z), { linvel: [0, 1.2, 0] });
      return;
    }
    if (s.k !== 'crate') return;
    if (op === 'label') {
      if (typeof d.lab === 'string') s.lab = S.sanitizeLabel(d.lab);
      if (typeof d.col === 'string') s.col = S.sanitizeColor(d.col);
      return commit(s);
    }
    if (op === 'sort') { S.sortCrate(s); return commit(s); }
    if (op === 'move') { const r = S.moveRecord(s, d.u | 0, d.x, d.y); if (!r.ok) return err(from, r.reason); return commit(s); }
    if (op === 'take') {
      const rec = S.takeRecord(s, d.u | 0);
      if (!rec) return;
      giveBack(from, rec, q, d.to && d.to.k === 'bag' ? { k: 'bag', x: d.to.x | 0, y: d.to.y | 0 } : null);
      return commit(s);
    }
    if (op === 'all') {
      const all = S.emptyCrate(s);
      for (const rec of all) giveBack(from, rec, q, null);
      return commit(s);
    }
    if (op === 'put') {
      const it = heldBy(String(d.it || ''), from);
      if (!it) return;
      const why = S.storeReject(it);
      if (why) return err(from, why);
      const r = S.putRecord(s, S.recordFromItem(it), Number.isFinite(d.x) ? d.x : null, Number.isFinite(d.y) ? d.y : null);
      if (!r.ok) return err(from, r.reason);
      rmItem(it);
      return commit(s);
    }
  }
  // ---- farming
  function hostFarm(d, from) {
    if (!host() || !d) return;
    const s = structById(String(d.id || ''));
    if (!s || s.k !== 'planter') return;
    const q = posOf(from);
    if (!q || Math.hypot(q.x - s.x, q.z - s.z) > 6) return err(from, 'Too far away.');
    const c = d.c | 0;
    if (c < 0 || c >= S.PLANTER_CELLS) return;
    const wt = wall();
    const at = new THREE.Vector3(s.x, s.y + 0.7, s.z);
    if (d.op === 'plant') {
      const it = heldBy(String(d.it || ''), from);
      if (!it || !D.isSeedItem(it.type) || s.cells[c]) return;
      s.cells[c] = D.newCrop(D.plantOfItem(it.type), wt);
      rmItem(it); commit(s); fxAll('grow', at);
    } else if (d.op === 'water') {
      const can = heldBy(String(d.it || ''), from);
      if (!can || can.type !== 'sv_can' || !s.cells[c]) return;
      D.waterCrop(s.cells[c], wt); commit(s); fxAll('water', at);
    } else if (d.op === 'harvest') {
      const cr = s.cells[c];
      if (!cr) return;
      D.growTick(cr, wt);
      if (cr.p < 1) return err(from, 'Not ripe yet.');
      const sk = d.sk ? heldBy(d.sk, from) : null;
      const y = D.farmYield(cr.k, Math.random, { sickle: !!(sk && sk.type === 'sv_sickle') });
      const kind = cr.k;
      s.cells[c] = null;
      for (let i = 0; i < y.plants; i++) spawnAt(D.plantItem(kind), at, { linvel: popVel() });
      for (let i = 0; i < y.seeds; i++) spawnAt(D.seedItem(kind), at, { linvel: popVel() });
      commit(s); fxAll('grow', at); xp(from, 5, t('Harvest'));
    }
  }
  // ---- eating
  function hostUse(d, from) {
    if (!host() || !d) return;
    const it = heldBy(String(d.id || ''), from);
    if (!it || !D.isEdible(it.type)) return;
    const k = 'u' + from;
    const t0 = now();
    if (t0 - (F.lastPlace.get(k) ?? -9) < 0.6) return;
    F.lastPlace.set(k, t0);
    rmItem(it);
    game.net.sendTo(from, 'svfx', { k: 'ate', to: from, ty: it.type, tr: it.tier || 'common', v: Math.round(it.value || 0), bv: Math.round(it.baseValue || 0) });
  }
  // ---- fire
  function hostFire(d, from) {
    if (!host() || !d) return;
    const s = structById(String(d.id || ''));
    const it = heldBy(String(d.it || ''), from);
    if (!s || s.k !== 'fire' || !it || it.type !== 'comp_wood' || !near(from, s.x, s.z, 5)) return;
    const wt = wall();
    s.until = wt + D.fireFuel(Math.max(0, (s.until - wt) / 1000)) * 1000;
    rmItem(it); commit(s);
    fxAll('place', new THREE.Vector3(s.x, s.y + 0.5, s.z));
  }
  function hostClearFires() {
    for (const s of structs()) if (s.k === 'fire') removeStruct(s);
  }
  // ---- cooking
  const stationNear = (sid, from) => { const s = structById(sid); if (!s || (s.k !== 'stove' && s.k !== 'fire')) return null; if (s.k === 'fire' && s.until <= wall()) return null; return near(from, s.x, s.z, 6) ? s : null; };
  function validIngredients(ids, from) {
    const list = [];
    const seen = new Set();
    for (const id of Array.isArray(ids) ? ids.slice(0, 3) : []) {
      const it = heldBy(String(id), from);
      if (!it || seen.has(it.id) || !D.INGREDIENTS[it.type]) return null;
      seen.add(it.id); list.push(it);
    }
    return list.length ? list : null;
  }
  function hostCook(d, from) {
    if (!host() || !d) return;
    if (d.op === 'cancel') { F.sessions.delete(from); return; }
    if (d.op === 'start') {
      const st = stationNear(String(d.s || ''), from);
      if (!st) return err(from, 'Get closer to the stove.');
      const items = validIngredients(d.ids, from);
      if (!items) return err(from, 'Those ingredients are gone.');
      const dur = D.cookSeconds(items.length, st.k === 'fire' ? 'fire' : 'stove');
      F.sessions.set(from, { ids: items.map((i) => i.id), sid: st.id, kind: st.k, dur, t0: performance.now() });
      return game.net.sendTo(from, 'svfx', { k: 'cookok', to: from, dur });
    }
    if (d.op === 'stop') {
      const se = F.sessions.get(from);
      if (!se) return;
      F.sessions.delete(from);
      const st = stationNear(se.sid, from) || structById(se.sid);
      const items = validIngredients(se.ids, from);
      if (!st || !items) return err(from, 'Those ingredients are gone.');
      const el = (performance.now() - se.t0) / 1000;
      let p = clamp(Number(d.p) || 0, 0, 1.3);
      p = Math.min(p, el / se.dur + 0.12);                       // the needle cannot be ahead of the host clock
      if (el > se.dur * 1.12 + 1.5) p = 1.2;                     // walked away / lagged out: it burnt
      const dish = D.resolveDish(items.map((i) => i.type));
      if (!dish) return err(from, 'That is not an ingredient.');
      const q = D.cookQuality(p);
      const pack = D.packDish(dish);
      const tier = D.QUAL[q].tier;
      for (const it of items) rmItem(it);
      const at = new THREE.Vector3(st.x + Math.sin(st.yaw || 0) * 0.1, st.y + (st.k === 'stove' ? 1.25 : 0.7), st.z + Math.cos(st.yaw || 0) * 0.1);
      game.items.hostSpawn(dish.id, at, { tier, value: pack.value, baseValue: pack.baseValue, linvel: [0, 1.5, 0] });
      fxAll('cook', at, q);
      xp(from, [1, 2, 4, 8][q], t('Chef'));
      return game.net.sendTo(from, 'svfx', { k: 'cooked', to: from, ty: dish.id, q, p: +p.toFixed(3) });
    }
  }
  // ---- brewing
  function hostBrew(d, from) {
    if (!host() || !d) return;
    const s = structById(String(d.id || ''));
    if (!s || s.k !== 'brew' || s.job || !near(from, s.x, s.z, 6)) return;
    const items = validIngredients(d.ids, from);
    if (!items) return err(from, 'Those ingredients are gone.');
    const r = D.resolveBrew(items.map((i) => i.type));
    if (!r) return err(from, 'That does not make a tonic.');
    for (const it of items) rmItem(it);
    s.job = { type: r.type, tr: r.tier, done: wall() + D.BREW_MS };
    commit(s);
    fxAll('brew', new THREE.Vector3(s.x, s.y + 1.1, s.z));
  }
  function hostTick(dt) {
    F.hostT -= dt;
    if (F.hostT > 0) return;
    F.hostT = 1;
    const wt = wall();
    for (const s of structs()) {
      if (s.k === 'brew' && s.job && s.job.done <= wt) {
        const j = s.job;
        s.job = null;
        commit(s);
        game.items.hostSpawn(j.type, new THREE.Vector3(s.x + Math.sin(s.yaw || 0) * 0.3, s.y + 1.05, s.z + Math.cos(s.yaw || 0) * 0.3), { tier: j.tr, linvel: [0, 1.4, 0] });
        fxAll('brew', new THREE.Vector3(s.x, s.y + 1.1, s.z));
      } else if (s.k === 'fire' && s.until < wt - 20000) removeStruct(s);
    }
    for (const [id, se] of F.sessions) if ((performance.now() - se.t0) / 1000 > 90) F.sessions.delete(id);
  }
  // ---- sync for late joiners
  function hostSync(d, from) {
    if (!host() || !F.plants || d?.s !== F.plants.seed) return;
    const set = takenSets.get(d.s);
    if (set?.size) game.net.sendTo(from, 'svfx', { k: 'list', s: d.s, ids: [...set] });
  }

  // ---------------------------------------------------------------- fixtures + starter kit (host, once per run)
  // [wave5 ship_interior] the built-in ship fixtures stand where world/shiplayout.js says (galley counter: stove + brewing stand; cargo: storage
  // crate + grow-strip planter). They used to probe candidate spots at runtime and ended up in the cockpit doorway, through the cockpit bulkhead,
  // in front of the mirror and inside the store kiosk. Saved runs are migrated: a built-in that stands anywhere else is moved to its spot.
  const FIX = { stove: 'stove', brew: 'brew', crate: 'crate', planter: 'svPlanter' };
  const spotOf = (kind) => { const sp = SHIP_SPOTS[FIX[kind]]; return { x: sp.x, z: sp.z, yaw: sp.ry || 0 }; };
  function ensureFixtures() {
    if (!host() || !run()) return;
    const builtin = (k) => structs().find((s) => s.w === 'ship' && s.k === k && s.b);
    const make = (kind, id, opts = {}) => {
      const sp = spotOf(kind), cur = builtin(kind);
      if (cur) {
        if (Math.abs(cur.x - sp.x) > 0.02 || Math.abs(cur.z - sp.z) > 0.02 || Math.abs((cur.yaw || 0) - sp.yaw) > 0.01 || cur.y) commit({ ...cur, x: sp.x, y: 0, z: sp.z, yaw: sp.yaw });
        return;
      }
      commit(S.newStruct(kind, id, 'ship', { x: sp.x, y: 0, z: sp.z }, sp.yaw, { builtin: true, ...opts }));
    };
    make('stove', 'stove0');
    make('brew', 'brew0');
    make('crate', S.BUILTIN.crate, { tier: 1, lab: 'SHIP' });
    make('planter', S.BUILTIN.planter);
    if (!run().svStart) {
      run().svStart = 1;
      const [tx, tz] = TABLE_SPOTS[0];
      let k = 0;
      // starter food is laid out on the mess table (it used to rain onto the cockpit floor by the N1 doorway); if the table is not built yet it lands on its spot
      for (const [ty, n] of D.STARTER) for (let i = 0; i < n; i++) { const j = k++; later(0.8 + 0.12 * j, () => { if (host() && game.items) spawnAt(ty, new THREE.Vector3(tx - 0.25 + (j % 3) * 0.25, 1.05, tz - 0.45 + (Math.floor(j / 3) % 4) * 0.3), {}); }); }
      try { game.broadcastRun(['svStart']); } catch { /* offline */ }
    }
    mirrorHome();
  }
  function hostInitState() {
    if (F.initDone || !host() || !run()) return;
    F.initDone = true;
    // clean what came out of the save: fires never persist, every struct is re-sanitised, home comes from the profile
    for (const k of svKeys()) {
      const s = S.sanitizeStruct(run()[k]);
      if (!s || s.k === 'fire' || s.w === 'home') delete run()[k]; else run()[k] = s;
    }
    const home = prof()?.home || {};
    for (const raw of Object.values(home)) { const s = S.sanitizeStruct(raw); if (s) run()[KEY(s.id)] = { ...s, w: 'home' }; }
    ensureFixtures();
  }

  // ---------------------------------------------------------------- creature meat
  wrap(game, 'hostOnCreatureKilled', (orig) => function (c, by) {
    const r = orig.call(this, c, by);
    try {
      if (host() && c && !c._svMeat && !c.def?.hazard && c.pos && game.run?.phase === 'moon') {
        c._svMeat = true;
        const key = `${game.run?.seed}:${game.run?.day}`;
        if (F.meatFor !== key) { F.meatFor = key; F.meatDrops = 0; }
        const flav = CREATURE_FLAVOUR[c.type] || 'random';
        const boss = !!c.def?.boss;
        if (F.meatDrops < D.MEAT_PER_LANDING && Math.random() < D.meatChance(flav, !!c.elite, boss)) {
          const n = boss ? 3 : 1;
          F.meatDrops += n;
          for (let i = 0; i < n; i++) game.items.hostSpawn('sv_meat', c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), { linvel: popVel() });
        }
      }
    } catch (e) { console.warn('[survival] meat', e); }
    return r;
  });

  // ================================================================================================ mod events
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed) return;
    const p = player();
    if (!p || p.dead || game.minigame || game.ui?.panelOpen) return;
    try { plantInteractables(out); structInteractables(out); } catch (e) { if (++errs <= 3) console.warn('[survival] interactables', e); }
  }));
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled) return;
    const def = ITEMS[it.type];
    if (def?.place) { hk.handled = true; tryPlace(it, def); return; }
    if (D.isSeedItem(it.type)) { hk.handled = true; toast(t('Aim at a planter cell and press E to plant it.'), 'info'); return; }
    if (D.isEdible(it.type)) { hk.handled = true; startEat(it); }
  }));
  offs.push(mods.on('netReady', (net, g) => {
    if (g !== game) return;
    net.on_('svfx', (d) => onFx(d));
  }));
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('svh', hostHarvest); H('svplace', hostPlace); H('svst', hostStorage); H('svfarm', hostFarm); H('svcook', hostCook);
    H('svbrew', hostBrew); H('svuse', hostUse); H('svfire', hostFire); H('svsync', hostSync);
  }));
  offs.push(mods.on('hostStart', (g) => { if (g === game) { F.initDone = false; hostInitState(); } }));
  offs.push(mods.on('mapLoaded', (world, g) => {
    if (g !== game) return;
    clearViews();
    buildPlants(world);
    F.hold = null;
    if (!host()) F.syncAsked = false;
  }));
  offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));

  let errs = 0;
  function update(dt) {
    if (disposed) return;
    const p = player();
    if (!p || !run()) return;
    dt = Math.min(dt, 0.25);
    for (let i = F.sched.length - 1; i >= 0; i--) if (now() >= F.sched[i].t) { const s = F.sched.splice(i, 1)[0]; try { s.fn(); } catch (e) { console.warn('[survival] sched', e); } }
    if (F.emoteId && now() > F.emoteEnd) clearEmote();
    if (!F.hungerLoaded && game.profile) { F.hungerLoaded = true; loadHunger(); F.hBand = D.hungerBand(F.hunger); game.refreshStats?.(); }
    if (host() && !F.initDone) hostInitState();
    stepSurvival(dt);
    updateHud(dt);
    if (!p.dead) { updateEat(dt); buffFx(dt); updateHold(dt); updateGhost(); }
    F.viewT -= dt;
    if (F.viewT <= 0) { F.viewT = 0.4; syncViews(); }
    updateViews(dt, now());
    if (F.syncAsked === false && !host() && run().phase === 'moon' && game.net?.connected && F.plants) { F.syncAsked = true; game.net.request('svsync', { s: F.plants.seed }); }
    if (F.cook.st === 'run' && (performance.now() - F.cook.t0) / 1000 > F.cook.dur * 1.25) cookStop();
    if (host()) hostTick(dt);
    // holding text
    if (F.hold && typeof document !== 'undefined') void 0;
  }
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game) return;
    try { update(dt); } catch (e) { if (++errs <= 3) console.warn('[survival] update', e); }
  }));

  // ================================================================================================ public API
  const api = {
    // ---- for other modules (ship2 / homeworld2 planters, terminal commands)
    plantables: D.plantables(),
    growTick: D.growTick, waterCrop: D.waterCrop, stageOf: D.stageOf, newCrop: D.newCrop, farmYield: D.farmYield, msToRipe: D.msToRipe, isWet: D.isWet,
    PLANTS: D.PLANTS, INGREDIENTS: D.INGREDIENTS,
    // ---- panels
    carried, itemType: ingType, cookState() {
      const K = F.cook;
      return { st: K.st, p: K.st === 'run' ? clamp((performance.now() - K.t0) / 1000 / K.dur, 0, 1.3) : 0, result: K.result, dur: K.dur };
    },
    cookStart, cookStop, resetCook, brewStart(sid, ids) { game.net.request('svbrew', { id: sid, ids }); }, brewJob,
    crate: (id) => structById(id),
    stReq(op, data) { game.net.request('svst', { op, ...data }); },
    close: closePanel,
    // ---- state / debug
    get hunger() { return F.hunger; }, set hunger(v) { F.hunger = clamp(Number(v) || 0, 0, D.HUNGER.max); F.hBand = D.hungerBand(F.hunger); game.refreshStats?.(); },
    get warmth() { return F.warmth; }, set warmth(v) { F.warmth = clamp(Number(v) || 0, 0, D.WARMTH.max); F.wBand = D.warmthBand(F.warmth); game.refreshStats?.(); },
    structs, structById, openCook, openStorage, placeCheck, applyEaten,
    state: () => ({ hunger: Math.round(F.hunger), band: F.hBand, warmth: Math.round(F.warmth), wband: F.wBand, views: F.views.size, structs: structs().map((s) => `${s.w}:${s.k}:${s.id}`), plants: F.plants ? F.plants.list.filter((p) => !p.gone).length : 0, kinds: F.plants ? [...new Set(F.plants.list.map((p) => p.k))] : [], buffs: (buffs()?.list?.() || []).map((r) => r.id).filter((id) => BUFF_DEFS[id]) }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
      for (const id of injected) delete DEFS[id];
      closePanel(); clearViews(); clearPlants();
      if (F.nv) setNight(false);
      F.ghost?.dispose(); F.hud?.remove(); F.coldEl?.remove(); clearEmote();
    },
  };
  return api;
}
