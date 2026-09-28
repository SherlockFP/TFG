// ANOMALY system (wave 2, MASTERPLAN #23): STATIC exposure + mutations + dice + temporary power-ups.
// Installed with `this.useModule('anomaly', installAnomaly)` (game.js). Files: static.js (exposure, hot zones, Decon, Signal Counter,
// Antivirus, Faraday), mutations.js, powerups.js, dice.js (Loot Box Shrine + Cursed Die), models/anomaly.js, ui/buffbar.js.
//
// Net (all prefixed 'an'): 'an' request (client -> host: gl | pu | gamble), 'anfx' (host -> all, HOST_ONLY), 'anst' (peer -> all: stage, beacon,
// active buff ids; relayed) so crewmates see the aura and the host knows who is Ad-Free / Viral. Each player owns their own exposure.
//
// game.anomaly = { exposure, stage, addExposure(n), setExposure(v), grant(id, dur), has(id), clear(), muted(), buffs, static, mutations,
//                  powerups, dice, force: { roll(nat), face(f) }, debug(), dispose() }
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t } from '../core/i18n.js';
import { MUTATIONS, installMutations, rollMutation, mutDuration } from './mutations.js';
import { POWERUPS, installPowerups } from './powerups.js';
import { installStatic, STAGES } from './static.js';
import { installDice } from './dice.js';
import { createBuffBar } from '../ui/buffbar.js';
import { ANOMALY_ITEM_MODELS, createAura } from '../models/anomaly.js';

HOST_ONLY.add('anfx');   // clients only take 'anfx' broadcasts from the host

addTranslations({
  TAKEOFF: 'KALKIŞ', SIGNAL: 'SİNYAL', resist: 'direnç', immune: 'bağışık',
  'wore off': 'bitti', 'Glitch dice': 'Glitch zarı',
  'Restoring from backup. Some data was lost. It was probably yours.': 'Yedekten geri yükleniyor. Bazı veriler kayboldu. Muhtemelen seninkilerdi.',
  'You are glitching. How wonderfully engaging.': 'Glitch oluyorsun. Ne kadar da etkileşimli.',
});
const DEFS = { ...MUTATIONS, ...POWERUPS };
const GL_COOLDOWN = 40;   // s per player between Glitching dice rolls (host side)

export function installAnomaly(game) {
  const mods = game.mods;
  const offs = [];
  const B = new Map();                 // active buffs: id -> { id, def, t0, until, dur }
  const peers = new Map();             // other players: id -> { s, b, g, at }
  const auras = new WeakMap();
  const lastGl = new Map();
  const blip = { n: 0, w: 0, until: 0 };
  const last = { noise: -1, warp: -1 };
  const errCount = {};
  let dirty = true, stT = -9, hudT = 0, disposed = false;
  let overlay = null, overlayStage = -1;
  const noop = () => {};

  // ------------------------------------------------------------------ context shared by the sub-modules
  const ctx = {
    game, mods, peers,
    screen: { noise: 0, warp: 0, stage: 0 },
    hud: { setStatic: noop, setBuffs: noop },
    static: null, powerups: null, mutations: null, dice: null,
    markDirty() { dirty = true; },
    refreshStats() { game.refreshStats?.(); },
    toast(text, kind = 'info') { game.ui?.toast?.(text, kind); },
    say(text) { try { game.lore?.say?.(t(text)); } catch { /* lore is optional */ } },
    blip(noise, warp, dur) { blip.n = Math.max(blip.n, noise); blip.w = Math.max(blip.w, warp); blip.until = Math.max(blip.until, game.time + dur); },
    snd(names, vol = 0.6, at = null, pitch) {
      const a = game.audio;
      for (const n of names) {
        if (!a?.has?.(n)) continue;
        try { if (at) a.at(n, at, vol, { refDistance: 6, pitch }); else a.play(n, { volume: vol, bus: 'sfx', pitch }); } catch { /* audio is optional */ }
        return;
      }
    },
    hostFx(d) { game.net?.broadcast('anfx', d); },
    hostTo(id, d) { game.net?.sendTo(id, 'anfx', { ...d, to: id }); },
    netReq(op, data = {}) { game.net?.request('an', { op, ...data }); },
    peerHas(id, buffId) {
      if (id === game.selfId) return B.has(buffId);
      const p = peers.get(id);
      return !!p && game.time - p.at < 4 && p.g.includes(buffId);
    },
    grantBuff(id, dur, opts = {}) {
      const def = DEFS[id];
      if (!def || game.player?.dead) return null;
      const r = api.buffs.add(id, dur);
      if (!r) return null;
      ctx.toast(`${t(def.name)}: ${t(def.desc)}`, def.good ? 'good' : 'bad');
      ctx.snd(def.good ? ['ui_confirm', 'ui_notify'] : ['ui_error', 'walkie_static'], 0.5);
      game.engine?.flash?.(parseInt(def.color.slice(1), 16), 0.18);
      void opts;
      return r;
    },
    cloudRestore() { ctx.powerups?.cloudRestore?.(); },
  };

  // ------------------------------------------------------------------ buff registry (mutations + power-ups)
  const buffs = {
    list: () => [...B.values()],
    has: (id) => B.has(id),
    get: (id) => B.get(id) || null,
    add(id, dur = 0) {
      const def = DEFS[id];
      if (!def) return null;
      const now = game.time;
      let r = B.get(id);
      if (r) {   // no stacking: the longer of what is left and the new duration
        if (dur > 0) { r.until = Math.max(r.until === Infinity ? 0 : r.until, now + dur); r.dur = Math.max(r.dur, dur); }
      } else {
        const same = [...B.values()].filter((x) => !!x.def.power === !!def.power).sort((a, b) => a.t0 - b.t0);
        if (same.length >= 3) buffs.remove(same[0].id, 'bumped');   // max 3 mutations + 3 power-ups at once
        r = { id, def, t0: now, until: dur > 0 ? now + dur : Infinity, dur };
        B.set(id, r);
      }
      ctx.refreshStats(); dirty = true;
      return r;
    },
    remove(id, why = 'removed') {
      const r = B.get(id);
      if (!r) return;
      B.delete(id);
      ctx.refreshStats(); dirty = true;
      if (why === 'expired') {
        ctx.toast(`${t(r.def.name)} ${t('wore off')}`, 'info');
        if (id === 'p_premium') ctx.grantBuff('p_free', POWERUPS.p_free.dur);   // the trial ends: Free Tier
      }
    },
    clear(why = 'cleared') { for (const id of [...B.keys()]) buffs.remove(id, why); },
  };

  ctx.buffs = buffs;

  // ------------------------------------------------------------------ sub-systems
  ctx.hud = createBuffBar(game);
  ctx.static = installStatic(ctx);
  ctx.mutations = installMutations(ctx);
  ctx.powerups = installPowerups(ctx);
  ctx.dice = installDice(ctx);
  if (mods?.itemModels) for (const [id, fn] of Object.entries(ANOMALY_ITEM_MODELS)) if (!mods.itemModels.has(id)) mods.itemModels.set(id, () => fn());

  // ------------------------------------------------------------------ stats (every peer computes its own)
  offs.push(mods.on('stats', (s, g) => {
    if (g !== game) return;
    ctx.static.stats(s);
    for (const r of B.values()) r.def.stats?.(s, r);
  }));

  // ------------------------------------------------------------------ net
  offs.push(mods.on('netReady', (net, g) => {
    if (g !== game) return;
    try { net.relayTypes?.add?.('anst'); } catch { /* relay is best effort */ }
    net.on_('anst', (d, from) => {
      if (from === game.selfId || !d || typeof d !== 'object') return;
      const g2 = Array.isArray(d.g) ? d.g.filter((x) => typeof x === 'string' && DEFS[x]).slice(0, 8) : [];
      peers.set(from, { s: Math.max(0, Math.min(4, d.s | 0)), b: d.b ? 1 : 0, g: g2, at: game.time });
    });
    net.on_('anfx', (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.to && d.to !== game.selfId) return;
      if (d.k === 'mut') { const dur = Math.max(10, Math.min(200, Number(d.dur) || 60)); ctx.toast(t('Glitch dice') + '...', 'warn'); ctx.grantBuff(String(d.id), dur); return; }
      ctx.powerups.onFx(d);
      ctx.dice.onFx(d);
    });
    offs.push(net.on('peerLeave', (id) => peers.delete(id)));
  }));
  offs.push(mods.on('registerHandlers', (H, g) => {
    if (g !== game) return;
    H('an', (d, from) => {
      if (!d || typeof d !== 'object') return;
      if (d.op === 'gl') hostGlitch(d, from);
      else if (d.op === 'pu') ctx.powerups.hostClaim(d, from);
      else if (d.op === 'gamble') ctx.dice.hostGamble(d, from);
    });
  }));
  function hostGlitch(d, from) {
    const now = game.time;
    if (now - (lastGl.get(from) ?? -999) < GL_COOLDOWN - 1) return;
    lastGl.set(from, now);
    const st = Math.max(2, Math.min(4, d.st | 0 || 2));
    const active = from === game.selfId ? [...B.keys()] : (peers.get(from)?.g || []);
    const id = rollMutation(Math.random, st >= 3 ? 0.4 : 0.5, active);
    game.net.sendTo(from, 'anfx', { k: 'mut', id, dur: mutDuration(id, Math.random), to: from });
  }
  function sendState(force) {
    if (!game.net?.send) return;
    if (!force && !dirty && game.time - stT < 1) return;
    stT = game.time; dirty = false;
    try { game.net.send('anst', { s: ctx.static.stage, b: B.has('b_beacon') ? 1 : 0, g: [...B.keys()] }); } catch { /* not connected yet */ }
  }

  // ------------------------------------------------------------------ screen static (engine.fx noise / warp + a tinted CSS overlay)
  function mixFx(prop, key, mine) {
    const fx = game.engine?.fx;
    if (!fx) return;
    const cur = fx[prop], own = last[key];
    const base = cur === own ? 0 : cur;
    if (mine > base) { fx[prop] = mine; last[key] = mine; }
    else { if (cur === own) fx[prop] = 0; last[key] = -1; }
  }
  function drawOverlay(stage) {
    if (typeof document === 'undefined') return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;mix-blend-mode:screen;opacity:0;transition:opacity .4s';
      (document.getElementById('ui') || document.body).appendChild(overlay);
    }
    if (stage === overlayStage) return;
    overlayStage = stage;
    const c = ['0,0,0', '60,255,200', '120,255,190', '255,70,210', '255,40,40'][stage] || '0,0,0';
    overlay.style.background = `repeating-linear-gradient(0deg,rgba(${c},.10) 0 1px,transparent 1px 3px),radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(${c},.16) 100%)`;
    overlay.style.opacity = stage ? String([0, 0.55, 0.75, 0.9, 1][stage]) : '0';
  }

  // ------------------------------------------------------------------ frame
  function update(dt) {
    if (disposed) return;
    const now = game.time;
    ctx.screen.noise = 0; ctx.screen.warp = 0; ctx.screen.stage = 0;
    // expiry
    for (const r of [...B.values()]) if (now >= r.until) buffs.remove(r.id, 'expired');
    // sub-systems (each adds to ctx.screen)
    for (const [name, sys] of [['static', ctx.static], ['mutations', ctx.mutations], ['powerups', ctx.powerups], ['dice', ctx.dice]]) {
      try { sys.update(dt); } catch (e) { if ((errCount[name] = (errCount[name] || 0) + 1) <= 3) console.warn('[anomaly] ' + name + ' update', e); }
    }
    // engine noise / warp with ownership (other systems write these too)
    const bl = now < blip.until ? blip : null;
    mixFx('noise', 'noise', ctx.screen.noise + (bl ? bl.n : 0));
    mixFx('warp', 'warp', ctx.screen.warp + (bl ? bl.w : 0));
    drawOverlay(game.player?.dead ? 0 : ctx.screen.stage);
    // HUD
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.25;
      ctx.hud.setBuffs([...B.values()].map((r) => ({ id: r.id, name: r.def.name, desc: r.def.desc, glyph: r.def.glyph, color: r.def.color, good: r.def.good, power: !!r.def.power,
        left: r.until === Infinity ? null : Math.max(0, r.until - now), frac: r.until === Infinity || !r.dur ? null : Math.max(0, (r.until - now) / r.dur) })));
    }
    sendState(false);
    // crew auras (stage glow / beacon)
    for (const r of game.remotes.values()) {
      let a = auras.get(r);
      if (!a) { a = createAura(); r.root.add(a.mesh); auras.set(r, a); }
      const p = peers.get(r.id);
      a.setState(p && !r.dead && now - p.at < 4 ? p.s : 0, !!(p && !r.dead && now - p.at < 4 && p.b), now);
    }
  }
  offs.push(mods.on('update', (dt, g) => { if (g === game) update(dt); }));
  offs.push(mods.on('phase', (ph, g) => { if (g === game && ['landing', 'takeoff', 'orbit', 'company'].includes(ph)) { buffs.clear('phase'); peers.clear(); } }));
  offs.push(mods.on('localDeath', (c, g) => { if (g === game) buffs.clear('death'); }));
  offs.push(mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));

  // ------------------------------------------------------------------ public API
  const api = {
    get exposure() { return ctx.static.exposure; }, get stage() { return ctx.static.stage; }, STAGES,
    addExposure: (n) => ctx.static.addExposure(n), setExposure: (v) => ctx.static.setExposure(v),
    grant: (id, dur) => ctx.grantBuff(id, dur ?? DEFS[id]?.dur ?? 60),
    has: (id) => B.has(id), clear: () => buffs.clear('api'), muted: () => ctx.mutations.muted(),
    buffs, static: ctx.static, mutations: ctx.mutations, powerups: ctx.powerups, dice: ctx.dice, peers, DEFS,
    force: { roll: (n) => ctx.dice.forceNat(n), face: (f) => ctx.dice.forceFace(f) },
    debug: () => ({ exposure: ctx.static.exposure, stage: ctx.static.stage, rate: ctx.static.rate, buffs: [...B.keys()], zones: ctx.static.zones().length, shrine: !!ctx.dice.shrine, pickups: ctx.powerups.pickups().length }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
      for (const r of game.remotes?.values?.() || []) { const a = auras.get(r); if (a) a.dispose(); }
      for (const s of [ctx.dice, ctx.powerups, ctx.mutations, ctx.static]) { try { s?.dispose?.(); } catch (e) { console.warn('[anomaly] dispose', e); } }
      mixFx('noise', 'noise', 0); mixFx('warp', 'warp', 0);
      overlay?.remove(); overlay = null;
      ctx.hud.dispose?.();
      B.clear();
    },
  };
  void THREE;
  return api;
}
