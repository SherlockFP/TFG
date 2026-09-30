// MOONS12 (wave 12, docs/wave12/moons12.md): two moons with their OWN GOAL. Installed with this.useModule('moons12', installMoons12) -> game.moons12.
//   c9sky   CLOUD-9    GOAL: re-align 3 relay dishes (hold E at a console, the dish turns and slows down when it is close, the beam links to the next). Wind gusts (streaks first, push after: crouch to
//                      brace), rope bridges, hover pads (step on it, hold still 0.9 s), a fall = teleported to the ship + downed + a retrieval fee.
//   dcable  DEEP CABLE GOAL: carry 3 heavy DATA CORES (bulky: two carriers walk at near-normal speed, carry2) from the hulks to the ship. The water is slow + has an air meter (domes refill fast and
//                      shield the beacon, intact tunnels refill slowly). A carried core pulses a beacon every 8 s (1.6 s warning): creatures hear it and hunters are sent.
// Maps + biomes + route-board data are registered at IMPORT (moons12_core.js); geometry is biome decor (world/moons12_decor.js). Goal state is host-authoritative: game.run.m12 (synced with
// broadcastRun, late joiners read it) = { m:'c9'|'dc', d: day, st:'go'|'won', a:[deg x3] (c9), l:[0|1 x3] (c9), n: done, of: 3, p: paid }.
// Net (prefix m12): 'm12req' client -> host {op:'turn', i, dt} | {op:'fall'}    'm12fx' host -> everyone {k:'ang'|'lock'|'pay'|'banner'|'say'|'tele'|'pulse'|'core'|'shield', ...}
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { MOONS, BIOMES } from './moons.js';
import { registerItem, ITEMS } from './items.js';
import { hudDock } from '../ui/dock.js';
import * as K from './moons12_core.js';
import { TX } from './moons12_text.js';
import '../world/moons12_decor.js';   // registers the decor kinds 'cloud9' / 'dcable'

HOST_ONLY.add('m12fx');
const V3 = THREE.Vector3;
const L = (k, v) => { const s = TX[k] ? TX[k][0] : k; return v ? tf(s, v) : t(s); };   // a TX id, or the English string itself
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mod = (a, n) => ((a % n) + n) % n;
const angDiff = (to, from) => mod(to - from + 180, 360) - 180;

// the data core: a bulky two-hand valuable (carry2 makes one carrier crawl and two carriers walk it home)
const CORE_DEF = { id: 'dc_core', name: TX.dc_item[0], kind: 'scrap', weight: 46, hands: 2, bulky: true, value: [130, 190], tier: 'rare', tip: TX.dc_item_tip[0] };
if (!ITEMS.dc_core) registerItem({ ...CORE_DEF });
function coreModel() {
  const g = new THREE.Group(), lam = (c) => new THREE.MeshLambertMaterial({ color: c }), bas = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10), lam(0x1c2a30));
  add(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 10), bas(0x40e8ff), 0, 0.14);
  add(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 10), bas(0x40e8ff), 0, -0.14);
  add(new THREE.CylinderGeometry(0.07, 0.11, 0.16, 6), bas(0xa8f8ff), 0, 0.33);   // the beacon cap
  add(new THREE.BoxGeometry(0.06, 0.4, 0.3), lam(0x3c4c52), 0.22, 0, 0);
  return g;
}

const CSS = `.m12-bar{background:#12130d;border:2px solid #40c8e8;color:#e8f6ff;font:700 13px/1.1 'Bahnschrift','Arial Narrow',sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:3px 10px;display:flex;gap:8px;align-items:center;box-shadow:0 0 0 2px #12130d;min-width:190px}
.m12-bar u{flex:1;height:7px;background:rgba(255,255,255,.14);display:block;text-decoration:none}.m12-bar u b{display:block;height:100%;background:#40c8e8}
.m12-bar i{font-style:normal;opacity:.85;min-width:34px;text-align:right}
.m12-bar.c9{border-color:#ffb040}.m12-bar.c9 u b{background:#ffb040}.m12-bar.bc{border-color:#ff5a3a}.m12-bar.bc u b{background:#ff5a3a}
.m12-bar.low{animation:m12blink .6s steps(2) infinite}@keyframes m12blink{50%{border-color:#ff3a2a}}
.m12-ov{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .4s}`;

export function installMoons12(game) {
  const mods = game.mods;
  if (!mods) return null;
  if (mods.itemModels && !mods.itemModels.has('dc_core')) mods.itemModels.set('dc_core', coreModel);
  const offs = [], restores = [];
  let disposed = false, boundNet = null, dock = null, ov = null, style = null;
  const S = {
    id: null, kind: null, P: null, info: null, H: null, lastEx: null,
    wind: { id: -1, tele: 0, k: 0, dx: 0, dz: 0 }, wet: false, air: K.AIR.max, hurtT: 0, fogK: 0, lowSaid: false, uiT: 0, windSayT: 0, ambT: 0,
    ride: null, rideCd: 0, padT: 0, padOn: -1, fallCd: 0, dizzy: 0,
    ang: [], want: [], wantT: [], turn: null, turnAcc: 0, turnSend: 0, tickT: 0,
    teleT: 0, bcLast: 0, brief: '', beaconPoll: 0, bubT: 2, airT: 0,
    rings: [], ringI: 0,
  };
  const run = () => game.run, host = () => !!game.isHost, me = () => game.player;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const sfx = (n, v = 0.5) => { try { const list = Array.isArray(n) ? n : [n], a = game.audio, nm = list.find((x) => !a?.has || a.has(x)); if (nm) game.sfx?.(nm, v); } catch { /* unknown sound */ } };
  const say = (k, v) => { try { game.lore?.say?.(L(k, v), { mood: 'curious' }); } catch { /* lore optional */ } };
  const fx = (d) => { try { game.net.broadcast('m12fx', d); } catch { /* net closing */ } };
  const sync = () => { try { game.broadcastRun?.(['m12']); } catch { /* not ready */ } };
  const active = () => run()?.phase === 'moon' && !!S.P && K.isMoon12(run().moon);
  const EX = () => (run()?.m12 && run().m12.m === S.kind ? run().m12 : null);
  const later = (fn, ms) => (game.later ? game.later(fn, ms) : setTimeout(fn, ms));
  const holdsType = (id, type) => { for (const it of game.items.all()) if (it.holder === id && it.type === type) return it; return null; };
  const levelNow = () => Math.max(1, 1 + Math.floor((run()?.quotaIndex | 0) / 3));

  // ------------------------------------------------------------------------------------------ UI
  function ensureUi() {
    if (typeof document === 'undefined') return;
    if (!style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
    if (!ov) { ov = document.createElement('div'); ov.className = 'm12-ov'; (document.getElementById('ui') || document.body).appendChild(ov); }
    if (!dock) dock = hudDock('bottom', 'm12_bar', 6);
  }
  function hideUi() { if (dock) { dock.style.display = 'none'; dock.dataset.h = ''; } if (ov) ov.style.opacity = '0'; }
  const bar = (cls, label, frac, right, low) => `<div class="m12-bar ${cls}${low ? ' low' : ''}"><span>${label}</span><u><b style="width:${Math.round(clamp(frac, 0, 1) * 100)}%"></b></u><i>${right}</i></div>`;
  function hudTick() {
    ensureUi(); if (!dock) return;
    const ex = EX(); if (!ex) { hideUi(); return; }
    let html = '';
    if (S.kind === 'dc') {
      html = bar('dc', L('AIR'), S.air / K.AIR.max, Math.ceil(S.air) + ' s', S.wet && S.air <= K.AIR.warn) + `<div class="m12-bar dc"><span>${L('CORES')}</span><i style="flex:1;text-align:right">${ex.n | 0} / ${ex.of}</i></div>`;
      const left = S.teleT - game.time;
      if (left > 0) html += bar('bc', L('BEACON'), 1 - left / K.BEACON.tele, left.toFixed(1) + ' s', true);
    } else html = `<div class="m12-bar c9"><span>${L('RELAYS')}</span><i style="flex:1;text-align:right">${ex.n | 0} / ${ex.of}</i></div>`;
    if (dock.dataset.h !== html) { dock.dataset.h = html; dock.innerHTML = html; }
    dock.style.display = '';
  }
  function overlayTick() {
    if (!ov) return;
    let bg = 'none', op = 0;
    if (S.kind === 'dc' && S.fogK > 0.05) { bg = 'radial-gradient(ellipse at 50% 45%,rgba(20,110,120,.14) 30%,rgba(2,30,40,.62))'; op = S.fogK; }
    if (ov.dataset.b !== bg) { ov.dataset.b = bg; ov.style.background = bg; }
    ov.style.opacity = String(op);
  }
  function briefRows() {
    const r = run();
    if (!r || r.phase !== 'landing' || typeof document === 'undefined' || !K.isMoon12(r.moon)) { S.brief = ''; return; }
    const grid = document.querySelector('.br-card .br-grid');
    if (!grid || grid.querySelector('.m12-row')) return;
    const rows = r.moon === K.CLOUD ? [[t('GOAL'), L('c9_goal')], [t('NEED'), L('c9_need')]] : [[t('GOAL'), L('dc_goal')], [t('NEED'), L('dc_need')]];
    for (const [lab, txt] of rows) {
      const d = document.createElement('div'); d.className = 'm12-row';
      const a = document.createElement('span'); a.textContent = lab; const b = document.createElement('b'); b.textContent = txt; b.style.cssText = 'font-size:.85em;text-align:right';
      d.append(a, b); grid.appendChild(d);
    }
  }

  // ------------------------------------------------------------------------------------------ CLOUD-9 (client)
  const consoleOf = (i) => S.info?.dish?.[i]?.console;
  function nearestConsole(p) {
    let best = -1, bd = K.DISH.reach;
    for (const h of S.info.dish) {
      const c = h.console, d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < bd && Math.abs(c.y - p.pos.y - 1.2) < 2.6) { bd = d; best = h.i; }
    }
    return best;
  }
  function windTick(dt, p) {
    const r = run(), w = K.windAt(r.seed | 0, r.time || 0);
    S.wind = w;
    const out = !p.indoor && !p.inShip && !p.dead;
    if (w.tele > 0 && w.id !== S.windSayT && w.k === 0 && out) { S.windSayT = w.id; sfx(['wind_gust', 'cloth_rustle'], 0.4); }
    if (w.k > 0.02 && out && !S.ride && !p.downed) {
      const push = w.k * K.WIND.push * (p.crouch ? K.WIND.brace : 1);
      p.exPush = { x: w.dx * push, z: w.dz * push };
    } else p.exPush = null;
    S.ambT -= dt;
    if (S.ambT <= 0 && out) { S.ambT = 0.5; try { game.audio?.setAmbience?.('wind', 'wind', 0.16 + w.k * 0.6 + w.tele * 0.12, 1.2); } catch { /* audio optional */ } }
  }
  function fallTick(dt, p) {
    S.fallCd = Math.max(0, S.fallCd - dt);
    if (S.dizzy > 0) { S.dizzy -= dt; p.exMul = S.dizzy > 0 ? 0.6 : null; }
    if (p.pos.y >= K.FALL_Y || p.inShip || p.indoor || p.dead || S.ride || S.fallCd > 0) return;
    S.fallCd = 3;
    sfx(['wind_gust', 'land_hard'], 0.6);
    try { game.net.request('m12req', { op: 'fall' }); } catch { /* net closing */ }
    toast(L('You fell through the clouds. The retrieval drone brings you back.'), 'warn');
    try { game.spawnInShip(); } catch { /* not ready */ }
    S.dizzy = K.FALL.dizzy;
    try { game.damageLocal(999, 'fall', null); } catch { /* not ready */ }   // downed (downed.js) at the ship: the crew can pick you up
  }
  function padTick(dt, p) {
    S.rideCd = Math.max(0, S.rideCd - dt);
    if (S.ride) {
      const r = S.ride; r.t += dt;
      const s = clamp(r.t / r.dur, 0, 1), y = r.y0 + (r.y1 - r.y0) * s + Math.sin(Math.PI * s) * r.apex;
      p.teleport(new V3(r.x0 + (r.x1 - r.x0) * s, y, r.z0 + (r.z1 - r.z0) * s));
      if (s >= 1) { p.teleport(new V3(r.x1, r.y1 + 0.05, r.z1)); S.ride = null; S.rideCd = K.PAD.cd; sfx('land_soft', 0.45); }
      return;
    }
    let on = -1;
    if (!p.downed && !p.dead && S.rideCd <= 0) for (const pd of S.info.pads) if (Math.hypot(pd.x - p.pos.x, pd.z - p.pos.z) < K.PAD.r && Math.abs(pd.y - p.pos.y) < 1.4) { on = pd.id; break; }
    if (on !== S.padOn) { S.padOn = on; S.padT = 0; }
    for (const pd of S.info.pads) {
      const on2 = pd.id === on, k = on2 ? clamp(S.padT / K.PAD.charge, 0, 1) : 0;
      pd.col.visible = k > 0; pd.col.material.opacity = 0.15 + 0.5 * k; pd.col.scale.set(1.2 - 0.5 * k, 1, 1.2 - 0.5 * k);
    }
    if (on < 0) return;
    S.padT += dt;
    if (S.padT >= K.PAD.charge) {
      const pd = S.info.pads[on], d = pd.dist;
      S.ride = { t: 0, dur: clamp(d / 14, 1.2, 2.6), x0: p.pos.x, y0: p.pos.y, z0: p.pos.z, x1: pd.tx, y1: pd.ty, z1: pd.tz, apex: Math.min(9, 2.5 + d * 0.22) };
      S.padT = 0; S.padOn = -1; sfx('power_up', 0.6);
      pd.col.visible = false;
    }
  }
  function dishTick(dt, p) {
    const ex = EX(), D = S.info.dish, P = S.P;
    if (!ex) return;
    for (const h of D) {
      const i = h.i, locked = !!ex.l?.[i];
      if (h.locked !== locked) { h.setLock(locked); if (locked) h.setAngle(P.dishes[i].target); }
      if (S.wantT[i] == null || game.time - S.wantT[i] > 1.5) S.want[i] = ex.a?.[i] ?? P.dishes[i].start;
      if (S.ang[i] == null) S.ang[i] = S.want[i];
      if (!locked && !(S.turn && S.turn.i === i)) { S.ang[i] += angDiff(S.want[i], S.ang[i]) * Math.min(1, dt * 8); h.setAngle(mod(S.ang[i], 360)); }
    }
    if (S.info.mast) S.info.mast.setOn(ex.st === 'won');
    // hold E at a console
    const inp = game.input, want = !p.downed && !p.dead && !S.ride && inp?.enabled && inp.isDown?.('interact');
    const i = want ? nearestConsole(p) : -1;
    if (i >= 0 && !ex.l?.[i]) {
      const h = D[i], T = P.dishes[i].target;
      S.turn = { i }; S.turnAcc += dt; S.turnSend -= dt;
      const r = K.dishStep(S.ang[i], T, dt);   // local prediction: the same rule the host runs
      S.ang[i] = r.a; h.setAngle(r.a); S.want[i] = r.a; S.wantT[i] = game.time;
      S.tickT -= dt;
      if (S.tickT <= 0) { S.tickT = 0.22 + (K.dishRem(r.a, T) < 30 ? 0.18 : 0); sfx('hdd_click', 0.32); }
      if (S.turnSend <= 0 || r.locked) { S.turnSend = 0.2; try { game.net.request('m12req', { op: 'turn', i, dt: Math.min(0.35, S.turnAcc) }); } catch { /* net closing */ } S.turnAcc = 0; }
    } else S.turn = null, S.turnAcc = 0, S.turnSend = 0;
  }

  // ------------------------------------------------------------------------------------------ DEEP CABLE (client)
  function airTick(dt, p) {
    const safe = p.inShip || p.indoor, lvl = safe ? 3 : K.airAt(S.P, p.pos.x, p.pos.z);
    S.wet = !safe && lvl === 0;
    if (!p.downed && !p.dead) {
      const carry = !!holdsType(game.selfId, 'dc_core');
      if (S.wet) S.air = Math.max(0, S.air - dt * (p.sprinting ? K.AIR.sprint : 1) * (carry ? K.AIR.carry : 1));
      else S.air = Math.min(K.AIR.max, S.air + dt * (lvl >= 2 ? K.AIR.dome * (lvl === 3 ? 1.5 : 1) : K.AIR.tunnel));
      if (S.wet && S.air <= 0) { S.hurtT -= dt; if (S.hurtT <= 0) { S.hurtT = 1; try { game.damageLocal?.(K.AIR.hurt, 'drown', null); } catch { /* not ready */ } } } else S.hurtT = 0.4;
      if (S.wet && S.air <= K.AIR.warn && !S.lowSaid) { S.lowSaid = true; toast(L('AIR LOW: find a dome or an intact tunnel'), 'warn'); }
      if (S.wet && S.air <= K.AIR.warn) { S.airT -= dt; if (S.airT <= 0) { S.airT = 3.5; sfx('air_warning', 0.5); } }
      if (S.air > K.AIR.warn + 10) S.lowSaid = false;
    }
    p.exMul = S.wet ? K.AIR.slow : null;
    S.fogK += ((S.wet ? 1 : lvl >= 2 || safe ? 0 : 0.5) - S.fogK) * Math.min(1, dt * 3);
    const b = BIOMES[K.CABLE]; if (b) b.fogDensity = 0.011 + S.fogK * 0.011;
    if (S.wet && game.sound2) {
      game.sound2.muffle(1300); game.sound2.hold('uw', 'uw_loop', { vol: 0.8, lease: 0.3 });
      S.bubT -= dt; if (S.bubT <= 0) { S.bubT = 3 + Math.random() * 4; game.sound2.cue('uw_bubbles', null, 0.45); }
    }
  }
  function beaconTick() {   // hide a hulk's light column once its core has left the bay
    S.beaconPoll -= 1; if (S.beaconPoll > 0) return; S.beaconPoll = 30;
    for (const w of S.info.wrecks) {
      let there = false;
      for (const it of game.items.all()) if (it.type === 'dc_core' && it.state === 'world' && Math.hypot(it.obj.position.x - w.core.x, it.obj.position.z - w.core.z) < 3) { there = true; break; }
      w.col.visible = there;
    }
  }
  function ringPulse(x, y, z, warn) {   // expanding ring at a pulse: pooled, additive, never fogged
    if (!S.rings.length) for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.frustumCulled = false; game.scene.add(m); S.rings.push({ m, t: 9 });
    }
    const r = S.rings[S.ringI++ % S.rings.length]; r.t = 0; r.m.position.set(x, y + 0.3, z); r.m.visible = true; r.m.material.color.setHex(warn ? 0xff8a40 : 0x40e8ff);
  }
  function ringsTick(dt) {
    for (const r of S.rings) {
      if (!r.m.visible) continue;
      r.t += dt; const s = 1 + r.t * 26; r.m.scale.set(s, s, 1); r.m.material.opacity = Math.max(0, 0.8 * (1 - r.t / 1.2));
      if (r.t > 1.2) r.m.visible = false;
    }
  }

  // ------------------------------------------------------------------------------------------ interactables + objectives
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || !active() || S.kind !== 'c9') return;
    const p = me(), ex = EX(); if (!p || p.dead || !ex) return;
    for (const h of S.info.dish) {
      const c = h.console;
      if (ex.l?.[h.i] || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 9) continue;
      const rem = () => Math.round(K.dishRem(S.ang[h.i] ?? S.P.dishes[h.i].start, S.P.dishes[h.i].target));
      out.push({ pos: new V3(c.x, c.y, c.z), r: 0.8, reach: K.DISH.reach, label: () => L('Hold E: turn the dish'), sub: () => tf(TX.c9_sub[0], { n: h.i + 1, d: rem() }), action: () => {} });
    }
  }));
  offs.push(mods.on('objectives', (add, g, phase) => {
    if (g !== game || disposed || phase !== 'moon' || !active() || me()?.dead) return;
    const ex = EX(); if (!ex) return;
    const frac = ex.of ? (ex.n | 0) / ex.of : 0;
    if (S.kind === 'c9') {
      if (ex.st === 'won') add(L('Uplink online. The Algorithm has signal. Head back to the ship.'), 'hint', true, 1);
      else {
        add(L('Re-align the relay dishes: {n} / {of}', { n: ex.n | 0, of: ex.of }), 'main', false, frac);
        add(L('Hold E at a dish console. The dish turns, and slows down when it is close.'), 'sub');
        if (S.wind.tele > 0 && S.wind.k < 0.05) add(L('GUST INCOMING: crouch to brace'), 'warn');
      }
    } else if (ex.st === 'won') add(L('All cores delivered. Head back to the ship.'), 'hint', true, 1);
    else {
      const carrying = !!holdsType(game.selfId, 'dc_core');
      add(L('Deliver the data cores: {n} / {of}', { n: ex.n | 0, of: ex.of }), 'main', false, frac);
      add(L(carrying ? 'A carried core pulses a beacon. Domes shield it. Set it down to silence it.' : 'Cores sit in the lit bays of the dead hulks. Two carriers walk faster.'), 'sub');
      if (S.wet && S.air <= K.AIR.warn) add(L('AIR LOW: find a dome or an intact tunnel'), 'warn');
      if (S.teleT - game.time > 0) add(L('BEACON PULSE incoming: get into a dome or set the core down'), 'warn');
    }
    if ((run().time || 0) > 23 * 60) add(L('THE SHIP LEAVES AT MIDNIGHT - RUN BACK NOW'), 'warn');
  }));
  offs.push(mods.on('daySummary', (d, extra, g) => {
    if (g !== game || disposed || d?.company) return;
    const ex = run()?.m12 || S.lastEx; if (!ex) return;
    const won = ex.st === 'won';
    if (ex.m === 'c9') extra.push(`${L('CLOUD-9 UPLINK')}: ${L('{n} / {of} relays aligned', { n: ex.n | 0, of: ex.of })}${ex.p ? '  ·  +▮' + ex.p : ''}${won ? '  ·  ' + L('UPLINK BONUS') : ''}`);
    else extra.push(`${L('DEEP CABLE')}: ${L('{n} / {of} data cores delivered', { n: ex.n | 0, of: ex.of })}${ex.p ? '  ·  +▮' + ex.p : ''}${won ? '  ·  ' + L('ARCHIVE SECURED') : ''}`);
    S.lastEx = null;
  }));
  offs.push(mods.on('tfg:revived', (d, g) => { if (g === game && d?.id === game.selfId) S.air = Math.max(S.air, K.AIR.max * K.AIR.revive); }));

  // ------------------------------------------------------------------------------------------ host: state, goal logic
  const pl = () => K.payout(S.kind, run().quota || 100);
  const pay = (n, why) => {
    const r = run(), ex = EX(); r.credits = (r.credits | 0) + n; if (ex) ex.p = (ex.p | 0) + n;
    try { game.broadcastRun?.(['credits']); } catch { /* ignore */ }
    fx({ k: 'pay', n, why });
  };
  const groundY = (x, z) => game.world?.terrain?.heightAt?.(x, z) ?? 0;
  function hostInit() {
    const r = run(), P = S.P;
    r.m12 = S.kind === 'c9' ? { m: 'c9', d: r.day, st: 'go', a: P.dishes.map((q) => q.start), l: [0, 0, 0], n: 0, of: K.GOAL_N, p: 0 }
      : { m: 'dc', d: r.day, st: 'go', n: 0, of: K.GOAL_N, p: 0 };
    S.H = { spawned: false, paid: new Set(), scanT: 1, bc: {}, hunters: [], dirtyT: 0, dirty: false, fallAt: {}, said: false };
    sync();
  }
  function hostSpawnCores() {
    const h = S.H; h.spawned = true;
    const v = pl().item;
    for (const w of S.info.wrecks) { try { game.items.hostSpawn('dc_core', new V3(w.core.x, w.core.y + 0.5, w.core.z), { value: Math.round(v * (0.9 + Math.random() * 0.2)), tier: 'rare' }); } catch (e) { console.warn('[moons12] core', e); } }
  }
  function spawnHunter(pos) {
    const h = S.H, C = game.creatures; if (!C?.hostSpawn) return;
    h.hunters = h.hunters.filter((id) => C.host?.has?.(id));
    if (h.hunters.length >= K.BEACON.cap) return;
    const type = Math.random() < 0.6 ? 'hound' : 'sandkefal';
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, d = type === 'hound' ? 30 + Math.random() * 12 : 16 + Math.random() * 10;
      const x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
      if (Math.abs(x) > S.P.lim + 10 || Math.abs(z) > S.P.lim + 10 || K.airAt(S.P, x, z) === 2) continue;
      const c = C.hostSpawn(type, new V3(x, groundY(x, z), z), { zone: 'out', level: game.rollLevel ? game.rollLevel() : levelNow(), ...(type === 'sandkefal' ? { state: 'hidden' } : {}) });
      if (c) h.hunters.push(c.id);
      return;
    }
  }
  function hostCable(dt, ex) {
    const h = S.H; if (!h.spawned && game.time > 0) hostSpawnCores();
    const players = game.aiPlayers();
    const seen = new Set();
    for (const it of game.items.all()) {
      if (it.type !== 'dc_core') continue;
      seen.add(it.id);
      const bc = h.bc[it.id] || (h.bc[it.id] = { t: 0, n: 0, tele: false, shield: false });
      const hd = it.holder && !String(it.holder).startsWith('c:') ? players.find((p) => p.id === it.holder) : null;
      if (!hd || hd.dead || hd.inShip || hd.zone === 'in' || ex.st === 'won') { bc.t = 0; bc.tele = false; bc.shield = false; continue; }
      if (K.airAt(S.P, hd.pos.x, hd.pos.z) === 2) { bc.t = 0; bc.tele = false; if (!bc.shield) { bc.shield = true; fx({ k: 'shield', to: hd.id }); } continue; }
      bc.shield = false; bc.t += dt;
      if (!bc.tele && bc.t >= K.BEACON.period - K.BEACON.tele) { bc.tele = true; fx({ k: 'tele', to: hd.id, x: hd.pos.x, y: hd.pos.y, z: hd.pos.z }); }
      if (bc.t >= K.BEACON.period) {
        bc.t = 0; bc.tele = false; bc.n++;
        try { game.creatures.noise(new V3(hd.pos.x, hd.pos.y, hd.pos.z), K.BEACON.loud, hd.id); } catch { /* not ready */ }
        fx({ k: 'pulse', x: hd.pos.x, y: hd.pos.y, z: hd.pos.z });
        if (bc.n % K.BEACON.spawnEvery === 0) spawnHunter(hd.pos);
        if (!h.said) { h.said = true; fx({ k: 'say', s: 'dc_say_pulse' }); }
      }
    }
    for (const id of Object.keys(h.bc)) if (!seen.has(id)) delete h.bc[id];
    h.scanT -= dt;
    if (h.scanT <= 0 && ex.st === 'go') {
      h.scanT = 1;
      for (const it of game.items.inShipItems()) if (it.type === 'dc_core' && !h.paid.has(it.id)) {
        h.paid.add(it.id); ex.n = h.paid.size; pay(pl().step, 'core'); sync();
        fx({ k: 'core', n: ex.n });
        if (ex.n >= ex.of) { ex.st = 'won'; pay(pl().final, 'goal'); sync(); fx({ k: 'banner', main: 'ALL CORES DELIVERED', sub: 'The archive is yours. The Algorithm is pleased.' }); }
      }
    }
  }
  function hostTick(dt) {
    const ex = EX(), h = S.H; if (!ex || !h) return;
    if (S.kind === 'dc') hostCable(dt, ex);
    else if (h.dirty) { h.dirtyT -= dt; if (h.dirtyT <= 0) { h.dirty = false; sync(); } }
  }
  function hostReq(d, from) {
    if (!host() || !d) return;
    const ex = EX(), h = S.H; if (!ex || !h) return;
    const p0 = game.aiPlayers().find((p) => p.id === from);
    if (d.op === 'fall' && S.kind === 'c9') {   // (a downed faller counts as dead to aiPlayers: no alive check here)
      const now = game.time; if (now - (h.fallAt[from] || -9) < 2.5) return; h.fallAt[from] = now;
      const fee = K.fallFee(run().credits);
      if (fee > 0) { run().credits = (run().credits | 0) - fee; try { game.broadcastRun?.(['credits']); } catch { /* ignore */ } fx({ k: 'fee', n: fee, to: from }); }
    } else if (d.op === 'turn' && S.kind === 'c9') {
      if (!p0 || p0.dead) return;
      const i = d.i | 0, D = S.P.dishes[i]; if (!D || ex.l[i] || ex.st !== 'go') return;
      const c = D.console; if (!(d.dbg && from === game.selfId) && Math.hypot(c.x - p0.pos.x, c.z - p0.pos.z) > K.DISH.hostReach) return;
      const r = K.dishStep(ex.a[i], D.target, clamp(+d.dt || 0, 0, 0.35));
      ex.a[i] = Math.round(r.a * 10) / 10;
      h.dirty = true; h.dirtyT = 0.7;
      if (!r.locked) { fx({ k: 'ang', i, a: ex.a[i] }); return; }
      ex.l[i] = 1; ex.n = ex.l.reduce((s, v) => s + v, 0); ex.a[i] = D.target;
      pay(pl().step, 'relay'); fx({ k: 'lock', i, n: ex.n });
      if (ex.n >= ex.of) { ex.st = 'won'; pay(pl().final, 'goal'); fx({ k: 'banner', main: 'UPLINK ESTABLISHED', sub: 'The Algorithm has signal. It is smiling.' }); fx({ k: 'say', s: 'c9_say_won' }); }
      sync(); h.dirty = false;
    }
  }
  offs.push(mods.on('registerHandlers', (Hh, g) => { if (g === game) Hh('m12req', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[moons12] req', e); } }); }));

  // ------------------------------------------------------------------------------------------ client: messages
  function onMsg(d) {
    if (disposed || !d) return;
    const mine = !d.to || d.to === game.selfId;
    if (d.k === 'say') { if (d.s) say(d.s); }
    else if (d.k === 'pay') { toast(L('Goal pay: ▮{n}', { n: d.n }), 'good'); sfx('register', 0.5); }
    else if (d.k === 'fee') { if (d.to === game.selfId) toast(L('Retrieval fee: -▮{n}', { n: d.n }), 'warn'); }
    else if (d.k === 'banner') { const m = L(d.main); try { game.ui?.hud?.bigText?.(m, L(d.sub || '')); } catch { toast(m, 'good'); } sfx('ui_levelup', 0.5); }
    else if (d.k === 'ang') { if (!(S.turn && S.turn.i === d.i)) { S.want[d.i] = d.a; S.wantT[d.i] = game.time; } }
    else if (d.k === 'lock') {
      const h = S.info?.dish?.[d.i]; if (h) { h.setLock(true); h.setAngle(S.P.dishes[d.i].target); }
      S.ang[d.i] = S.P?.dishes[d.i].target; sfx('power_up', 0.7); toast(L('Relay {n} aligned: the beam links to the next', { n: d.i + 1 }), 'good');
      if (d.n === 1) say('c9_say_first');
    } else if (d.k === 'core') { toast(L('Core delivered: {n} / {of}', { n: d.n, of: K.GOAL_N }), 'good'); sfx('ui_levelup', 0.4); if (d.n === 1) say('dc_say_first'); }
    else if (d.k === 'tele') {
      if (mine) { S.teleT = game.time + K.BEACON.tele; sfx('bios_beep', 0.5); }
      else if (S.info && d.x != null) { sfx('bios_beep', 0.25); }
      ringPulse(d.x ?? 0, d.y ?? 0, d.z ?? 0, true);
    } else if (d.k === 'pulse') {
      ringPulse(d.x, d.y, d.z, false); sfx(['sonar_ping', 'ui_notify', 'bios_beep'], mine ? 0.7 : 0.4); if (mine) { try { game.engine?.shake?.(0.25); } catch { /* optional */ } }
    } else if (d.k === 'shield') { if (mine) toast(L('The dome shields the beacon.'), 'good'); }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:m12fx', onMsg);
    boundNet = net; net.on('msg:m12fx', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  // ------------------------------------------------------------------------------------------ lifecycle
  function clearPlayer() { const p = me(); if (p) { p.exPush = null; if (p.exMul != null && (S.kind || S.id)) p.exMul = null; } }
  function restoreFog() { const b = BIOMES[K.CABLE]; if (b) b.fogDensity = 0.019; }
  function reset() {
    clearPlayer(); restoreFog(); hideUi(); api.wet = false;
    for (const r of S.rings) { r.m.removeFromParent(); r.m.geometry.dispose(); r.m.material.dispose(); }
    Object.assign(S, { id: null, kind: null, P: null, info: null, H: null, wet: false, air: K.AIR.max, fogK: 0, ride: null, rideCd: 0, padT: 0, padOn: -1, fallCd: 0, dizzy: 0, ang: [], want: [], wantT: [], turn: null,
      teleT: 0, lowSaid: false, wind: { id: -1, tele: 0, k: 0, dx: 0, dz: 0 }, rings: [], ringI: 0, windSayT: 0 });
  }
  offs.push(mods.on('mapLoaded', (w, g) => {
    if (g !== game || disposed) return;
    reset();
    const id = run()?.moon, info = w?.outdoor?.decor?.info;
    if (!K.isMoon12(id) || !info?.plan) return;
    S.id = id; S.kind = K.kindOf(id); S.P = info.plan; S.info = info;
    if (S.kind === 'dc') { try { game.env.fogCap = 0.03; } catch { /* env optional */ } }
    if (host()) hostInit();
    ensureUi();
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g !== game || disposed) return;
    if (ph === 'orbit') { reset(); if (host() && run().m12) { run().m12 = null; sync(); } }
    else if (ph === 'takeoff' || ph === 'company') { clearPlayer(); restoreFog(); hideUi(); }
  }));
  offs.push(mods.on('localDeath', () => { S.ride = null; S.turn = null; }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed || !run()) return;
    briefRows();
    if (!active()) { if (S.kind && run().phase !== 'landing') { clearPlayer(); hideUi(); api.wet = false; } return; }
    const p = me(); if (!p) return;
    const ex = EX(); if (ex) S.lastEx = { ...ex, day: run().day };
    if (p.dead) { clearPlayer(); hideUi(); return; }
    if (S.kind === 'c9') { windTick(dt, p); fallTick(dt, p); padTick(dt, p); dishTick(dt, p); api.wind = S.wind; }
    else { airTick(dt, p); beaconTick(); ringsTick(dt); api.wet = S.wet; }
    S.uiT -= dt; if (S.uiT <= 0) { S.uiT = 0.2; hudTick(); }
    overlayTick();
    if (host()) hostTick(dt);
  }));

  // ------------------------------------------------------------------------------------------ debug (console: kefal.game.moons12.debug...)
  const api = {
    wind: S.wind, wet: false, state: S,
    ids: K.MOON12_IDS,
    plan: () => S.P,
    moons: () => [MOONS[K.CLOUD], MOONS[K.CABLE]],
    debug: {
      state: () => ({ moon: S.id, kind: S.kind, ex: EX(), air: S.air, wet: S.wet, wind: S.wind, ride: !!S.ride, pos: me()?.pos?.toArray?.().map((v) => +v.toFixed(1)) }),
      /** teleport near a target: 'ship' | 'door' | 'dish0..2' | 'pad0..' | 'hub' | 'dome1..' | 'wreck0..2' */
      tp(name) {
        const P = S.P, p = me(); if (!P || !p) return null;
        const g = (x, z) => game.world.terrain.heightAt(x, z);
        let q = null;
        const m = /^([a-z]+)(\d*)$/.exec(String(name)), i = +(m?.[2] || 0);
        if (name === 'ship') q = { x: 0, z: 12 };
        else if (name === 'door') q = game.world.outdoor.mainExit.spawn;
        else if (m?.[1] === 'dish' && P.dishes) q = { x: P.dishes[i].console.x, z: P.dishes[i].console.z };
        else if (m?.[1] === 'pad' && S.info.pads[i]) q = S.info.pads[i];
        else if (name === 'hub' && P.hub) q = P.hub;
        else if (m?.[1] === 'dome' && P.domes?.[i]) q = P.domes[i];
        else if (m?.[1] === 'wreck' && P.wrecks?.[i]) q = P.wrecks[i].mouth;
        if (!q) return null;
        p.teleport(new V3(q.x, g(q.x, q.z) + 0.3, q.z));
        return { x: q.x, z: q.z };
      },
      /** host: lock dish i right now (or all) */
      lock(i) { const ex = EX(); if (!host() || !ex || S.kind !== 'c9') return false; for (const k of i == null ? [0, 1, 2] : [i]) { const D = S.P.dishes[k]; ex.a[k] = D.target - 0.5; hostReq({ op: 'turn', i: k, dt: 0.3, dbg: 1 }, game.selfId); } return EX().n; },
      /** local player falls */
      fall() { const p = me(); if (p) p.teleport(new V3(p.pos.x, K.FALL_Y - 2, p.pos.z)); },
      /** host: a beacon pulse now at the local player */
      pulse() { const p = me(); if (!host() || !p) return false; try { game.creatures.noise(p.pos, K.BEACON.loud, game.selfId); } catch { /* not ready */ } fx({ k: 'pulse', x: p.pos.x, y: p.pos.y, z: p.pos.z }); spawnHunter(p.pos); return true; },
      air: (v) => { if (v != null) S.air = v; return S.air; },
      windAt: (m) => K.windAt(run().seed | 0, m ?? run().time),
      cores: () => [...game.items.all()].filter((it) => it.type === 'dc_core').map((it) => ({ id: it.id, holder: it.holder, state: it.state })),
    },
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o(); } catch { /* ignore */ } }
      for (const r of restores.splice(0)) { try { r(); } catch { /* ignore */ } }
      try { boundNet?.off?.('msg:m12fx', onMsg); } catch { /* ignore */ }
      clearPlayer(); restoreFog();
      for (const r of S.rings) { r.m.removeFromParent(); r.m.geometry.dispose(); r.m.material.dispose(); }
      dock?.remove(); ov?.remove(); style?.remove(); dock = ov = style = null;
    },
  };
  void later; void BIOMES;
  return api;
}
