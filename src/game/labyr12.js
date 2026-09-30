// LABYR12 runtime (wave 12, docs/wave12/labyr12.md): the mechanics of The Dark Web and The Overload Hotel. Geometry / colliders / loot spots come from world/interiors/labyr12_*.js (fac.lab);
// pure rules are in labyr12_core.js. Host-authoritative; net: 'lab12req' client -> host, 'lab12fx' host -> everyone (HOST_ONLY).
//   darkweb  ECHOLOCATION. The host wraps creatures.noise: any noise >= 0.5 (sprint step 0.7, hard item drop, decoy, gun) broadcasts {k:'p', p, l} and every peer starts a sonar pulse (echo shell,
//            up to 4 on screen). The explicit knock is key M: request {op:'knock'} -> the host checks the per-player 2.6 s cooldown, makes a loud noise (1.4) that alerts creatures and pulses.
//   hotel    ELEVATOR. Buttons / call panels send {op:'go', to}; the host validates and broadcasts {k:'go', from, to, n, warn, dur}. Every peer runs the same clock: 3 s of chime + flashing lamp
//            (doors open), then the doors close (gate collider + mesh), the car rides 5-8 s (a rider is carried by per-frame teleports), the doors of the destination open with a bell.
//            The motor is loud at the ground shaft (creatures come to the lobby), the arrival bell at the destination. DO NOT DISTURB doors: {op:'dnd', id, key} with a held 'key' (consumed on the host).
//   both     landing-card hazard row, themed loot tables (existing item ids), atmosphere beds, debug API (kefal.game.labyr12.debug).
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { G } from '../physics/physics.js';
import { LAB_HINT } from './labyrinths_core.js';
import { SCRAP_TABLE, BIG_TABLES } from './items.js';
import { BEDS } from './atmos_core.js';
import { INTERIOR_NAMES as MG_NAMES } from './moongen.js';
import { hudDock } from '../ui/dock.js';
import * as K from './labyr12_core.js';
import './labyr12_text.js';

HOST_ONLY.add('lab12fx');

// Themed loot from EXISTING item ids (no new items).
export const DARK_SCRAP = [['server', 4], ['modem', 7], ['gpu', 4], ['hdd', 7], ['cryptocoin', 5], ['motherboard', 6], ['usbidol', 3], ['chainletter', 3], ['floppies', 6], ['webcam', 5], ['keyboard', 5],
  ['headset', 5], ['cdspindle', 5], ['printer', 4], ['captcha', 4], ['flipphone', 4], ['pager', 3], ['key', 3], ['goldbar', 1], ['playbutton', 1]];
export const HOTEL_SCRAP = [['mug', 8], ['perfume', 7], ['lamp', 5], ['tv', 4], ['canned', 6], ['painting', 4], ['bell', 5], ['phone', 5], ['pot', 4], ['flask', 5], ['pickles', 3], ['trophy', 3],
  ['vase', 2], ['key', 4], ['ring', 1], ['goldbar', 1], ['clownhorn', 1], ['robot', 2], ['magnify', 3]];
export const DARK_BIG = [['cryptorig', 5], ['pctower', 5], ['server', 4], ['vase', 1]];
export const HOTEL_BIG = [['vase', 6], ['statue', 3], ['amphora', 4], ['aquarium', 2]];
export const DARK_BED = { level: 0.34, gap: [9, 24], layers: [{ t: 'hum', f: [[38, 0.5], [57, 0.2]], lp: 200, g: 0.45, wob: [0.05, 0.25] },
  { t: 'noise', n: 'brown', ft: 'bandpass', f: 300, q: 0.8, g: 0.08, lfo: [0.06, 0.3, 0.3] }], events: [['drip', 3], ['relay', 3], ['vent', 2], ['creak', 1], ['ping', 2]] };
export const HOTEL_BED = { level: 0.36, gap: [9, 24], layers: [{ t: 'buzz', f: 100, g: 0.1 }, { t: 'hum', f: [[47, 0.3]], lp: 260, g: 0.3, wob: [0.05, 0.25] },
  { t: 'noise', n: 'brown', ft: 'bandpass', f: 350, q: 0.9, g: 0.07, lfo: [0.06, 0.3, 0.3] }], events: [['chime', 3], ['creak', 3], ['flicker', 3], ['drip', 1], ['relay', 1], ['groan', 1]] };

const V3 = THREE.Vector3;
const ease = (x) => { const p = Math.min(1, Math.max(0, x)); return p * p * (3 - 2 * p); };
const hashf = (k) => { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

export function installLabyr12(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  Object.assign(LAB_HINT, K.LAB12_HINT);   // the mechanic line: labyrinths.js shows it on the landing card, terminal.js in the moon info
  if (!SCRAP_TABLE.darkweb) { SCRAP_TABLE.darkweb = DARK_SCRAP; BIG_TABLES.darkweb = DARK_BIG; }
  if (!SCRAP_TABLE.hotel) { SCRAP_TABLE.hotel = HOTEL_SCRAP; BIG_TABLES.hotel = HOTEL_BIG; }
  if (!BEDS.darkweb) BEDS.darkweb = DARK_BED;
  if (!BEDS.hotel) BEDS.hotel = HOTEL_BED;
  try { if (MG_NAMES && !MG_NAMES.darkweb) { MG_NAMES.darkweb = 'The Dark Web'; MG_NAMES.hotel = 'The Overload Hotel'; } } catch { /* names optional */ }

  const S = {
    fac: null, clock: 0, boundNet: null, wrapped: null, origNoise: null, selfNoise: false, syncAsked: false,
    pulses: [], lastPulse: -9, cds: new Map(), knockAt: -9, pulseN: 0,
    elev: { at: 0, phase: 'idle', n: 0, t: 0, from: 0, to: 0, warn: K.HZ.warn, dur: 6, rider: false, pending: false, chimes: 0 },
    box: null, bar: null, txt: null, flickT: 0,
  };
  let disposed = false;
  const host = () => !!game.isHost;
  const fac = () => game.world?.facility || null;
  const lab = () => fac()?.lab || null;
  const run = () => game.run;
  const toast = (m, kind = 'info') => { try { game.ui?.hud?.toast?.(m, kind); } catch { /* hud optional */ } };
  const sfx = (id, v) => { try { game.sfx?.(id, v); } catch { /* audio optional */ } };
  const at = (id, pos, v = 0.8, extra) => { try { game.audio?.at?.(id, pos, v, extra); } catch { /* audio optional */ } };
  const fx = (d) => { try { game.net.broadcast('lab12fx', d); } catch { /* net closing */ } };
  const inMoon = () => run()?.phase === 'moon';
  function posOf(id) { return id === game.selfId ? game.player?.pos : (game.remotes?.get?.(id)?.pos || null); }

  // ------------------------------------------------------------------------------------------------ dark web: pulses
  /** start a pulse on this peer (called for every host broadcast, the host included) */
  function addPulse(x, y, z, loud) {
    const L = lab();
    if (!L?.echo) return null;
    const p = { x, y, z, age: 0, radius: K.pulseRadius(loud), loud, n: ++S.pulseN };
    S.pulses.push(p);
    if (S.pulses.length > 8) S.pulses.shift();
    at('dw_ping', new V3(x, y, z), Math.min(0.75, 0.25 + 0.3 * loud), { refDistance: 4 });
    return p;
  }
  /** host: a noise happened (creatures.noise wrapper) */
  function onNoise(pos, loud) {
    if (disposed || S.selfNoise || !host() || !inMoon()) return;
    const L = lab();
    if (L?.id !== 'darkweb' || !K.drawsPulse(loud)) return;
    if (S.clock - S.lastPulse < K.KNOCK.gap) return;                            // sprint steps + a decoy in the same instant are one pulse
    S.lastPulse = S.clock;
    fx({ k: 'p', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], l: +Number(loud).toFixed(2) });
  }
  function wrapNoise() {
    const cm = game.creatures;
    if (!cm || S.wrapped === cm || typeof cm.noise !== 'function') return;
    unwrapNoise();
    const orig = cm.noise; S.wrapped = cm; S.origNoise = orig;
    cm.noise = function (pos, loud, owner) { try { if (pos) onNoise(pos, Number(loud) || 0); } catch { /* pulse is optional */ } return orig.call(this, pos, loud, owner); };
  }
  function unwrapNoise() { if (S.wrapped && S.origNoise) S.wrapped.noise = S.origNoise; S.wrapped = S.origNoise = null; }
  /** host: a knock request from player `from` */
  function hostKnock(from) {
    const L = lab(), p = posOf(from);
    if (!L || L.id !== 'darkweb' || !p || !inMoon()) return false;
    if ((S.cds.get(from) ?? -9) > S.clock) return false;
    S.cds.set(from, S.clock + K.KNOCK.cd - 0.15);                               // a little lag tolerance
    const pos = new V3(p.x, p.y + 1.3, p.z);
    S.selfNoise = true;
    try { game.creatures?.noise?.(pos, K.KNOCK.loud, from); } catch { /* creatures not ready */ }
    S.selfNoise = false;
    S.lastPulse = S.clock;
    fx({ k: 'p', p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)], l: K.KNOCK.loud, by: from });
    return true;
  }
  function tickEcho(dt, L) {
    for (const p of S.pulses) p.age += dt;
    S.pulses = S.pulses.filter((p) => p.age < K.KNOCK.life);
    const me = game.player?.pos;
    let list = S.pulses;
    if (list.length > 4 && me) list = list.slice().sort((a, b) => (Math.hypot(a.x - me.x, a.z - me.z) - a.radius) - (Math.hypot(b.x - me.x, b.z - me.z) - b.radius)).slice(0, 4);
    L.echo.setPulses(list);
    if (L.tick) L.tick(dt, S.clock);
    // local input: the knock
    const p = game.player, inp = game.input;
    if (p && !p.dead && p.indoor && inp?.enabled && inp.codePressed?.(K.KNOCK.key) && S.clock - S.knockAt >= K.KNOCK.cd) {
      S.knockAt = S.clock;
      try { game.net.request('lab12req', { op: 'knock' }); } catch { /* net closing */ }
    }
    paintHud(L);
  }

  // ------------------------------------------------------------------------------------------------ dark web: HUD (one small dock item)
  function ensureHud() {
    if (typeof document === 'undefined') return false;
    if (S.box?.isConnected) return true;
    try {
      S.box = hudDock('bottom', 'labyr12', 47);
      S.box.style.cssText += ';font:11px/1.2 monospace;color:#7fffe8;letter-spacing:.08em;text-shadow:0 0 6px #0a3a36;display:flex;align-items:center;gap:8px';
      S.txt = document.createElement('span'); S.txt.style.whiteSpace = 'nowrap';
      const wrap = document.createElement('span'); wrap.style.cssText = 'display:inline-block;width:64px;height:3px;background:#0c2a28';
      S.bar = document.createElement('span'); S.bar.style.cssText = 'display:block;height:100%;background:#7fffe8;width:100%';
      wrap.appendChild(S.bar); S.box.append(S.txt, wrap);
      return true;
    } catch { S.box = null; return false; }
  }
  function paintHud(L) {
    if (L?.id !== 'darkweb' || !inMoon() || !ensureHud()) { if (S.box) S.box.style.display = 'none'; return; }
    S.box.style.display = 'flex';
    const left = Math.max(0, S.knockAt + K.KNOCK.cd - S.clock), k = 1 - left / K.KNOCK.cd;
    const label = `${t('ECHO')}  ${left > 0 ? left.toFixed(1) + 's' : t('ready')}   ${t('Knock [M]')}`;
    if (S.txt.textContent !== label) S.txt.textContent = label;
    S.bar.style.width = Math.round(k * 100) + '%'; S.bar.style.opacity = left > 0 ? '0.45' : '1';
  }

  // ------------------------------------------------------------------------------------------------ hotel: elevator
  const gateCols = new Map();
  function gateSet(L, level, closed, quiet) {
    const g = L.gates[level];
    if (!g) return;
    g.mesh.visible = closed; g.ind.color.setHex(closed ? 0xff3322 : 0x33ff66);
    const cur = gateCols.has(level) ? gateCols.get(level) : g.col;
    if (closed && !cur) {
      const p = game.player;
      const near = p && Math.abs(p.pos.y - g.y) < 2.5 && Math.abs(p.pos.x - g.x) < g.sx / 2 + 0.3 && Math.abs(p.pos.z - g.z) < 0.9;   // never shut the door on someone standing in it
      if (!near) { try { gateCols.set(level, game.physics.addStaticBox(g.x, g.y + g.sy / 2, g.z, g.sx / 2, g.sy / 2, g.sz / 2, 0, G.STATIC, { kind: 'static' })); } catch { /* physics optional */ } }
    } else if (!closed && cur) { try { game.physics?.removeCollider(cur); } catch { /* gone */ } gateCols.set(level, null); if (g.col === cur) g.col = null; }
    void quiet;
  }
  function cabCentre(L) { return new V3(L.cabX, L.cab.position.y, L.cabZ); }
  function inCab(L, p, level) {
    return !!p && !p.dead && Math.abs(p.pos.x - L.cabX) < L.cabHalf[0] && Math.abs(p.pos.z - L.cabZ) < L.cabHalf[1] && Math.abs(p.pos.y - (level == null ? L.cab.position.y : L.ys[level])) < 1.6;
  }
  /** all peers: a trip was accepted */
  function startGo(d) {
    const L = lab(), E = S.elev;
    if (!L || L.id !== 'hotel' || E.phase !== 'idle') return;
    E.phase = 'warn'; E.t = 0; E.from = d.from | 0; E.to = d.to | 0; E.n = (d.n | 0) + 1; E.warn = +d.warn || K.HZ.warn; E.dur = +d.dur || 6; E.rider = false; E.chimes = 0; E.pending = false;
    const p = game.player;
    if (p && !p.dead && Math.hypot(p.pos.x - L.gateX, p.pos.z - L.gateZ) < 14 && Math.abs(p.pos.y - L.ys[E.from]) < 3) toast(t('Doors closing... step in or wait for the next car.'), 'warn');
  }
  function tickHotel(dt, L) {
    const E = S.elev, p = game.player;
    L.cabLamp.color.setHex(0xffe8c0);
    if (E.phase === 'warn') {
      E.t += dt;
      const g = L.gates[E.from];
      if (g) g.ind.color.setHex(Math.sin(E.t * 12) > 0 ? 0xffaa20 : 0x402000);
      while (E.chimes < Math.floor(E.t / 1.0) + 1 && E.chimes < 3) { E.chimes++; at('hz_chime', new V3(L.gateX, L.ys[E.from] + 2.2, L.gateZ), 0.8, { refDistance: 6 }); }
      if (E.t >= E.warn) {
        E.rider = inCab(L, p, E.from);
        gateSet(L, E.from, true);
        E.phase = 'ride'; E.t = 0;
        sfx('lever_pull', 0.35);
        if (host()) { try { game.creatures?.noise?.(new V3(L.gateX, L.ys[0] + 1, L.gateZ + 2), K.HZ.noise); } catch { /* creatures not ready */ } }   // the motor is loud in the lobby
        if (!E.rider && p && !p.dead && Math.hypot(p.pos.x - L.gateX, p.pos.z - L.gateZ) < 8 && Math.abs(p.pos.y - L.ys[E.from]) < 3) toast(t('The car left without you. Call it back.'), 'info');
      }
    } else if (E.phase === 'ride') {
      E.t += dt;
      const pr = K.hzProgress(E.dur, Math.min(E.t, E.dur)), y = L.ys[E.from] + (L.ys[E.to] - L.ys[E.from]) * pr;
      L.cab.position.y = y;
      try { game.sound2?.hold?.('elev', 'elevator_hum', { pos: new V3(L.cabX, y + 1, L.cabZ), vol: E.rider ? 0.45 : 0.85, lease: 0.3, ref: 5, max: 40 }); } catch { /* audio optional */ }
      if (E.rider && p && !p.dead) p.teleport(new V3(Math.max(L.cabX - L.cabHalf[0], Math.min(L.cabX + L.cabHalf[0], p.pos.x)), y + 0.03, Math.max(L.cabZ - L.cabHalf[1], Math.min(L.cabZ + L.cabHalf[1], p.pos.z))));
      if (E.t >= E.dur) {
        E.phase = 'idle'; E.at = E.to; L.cab.position.y = L.ys[E.to];
        gateSet(L, E.to, false);
        at('bell_ding', new V3(L.gateX, L.ys[E.to] + 2, L.gateZ), 0.8, { refDistance: 6 });
        if (host()) { try { game.creatures?.noise?.(new V3(L.gateX, L.ys[E.to] + 1, L.gateZ + 2), K.HZ.ding); } catch { /* creatures not ready */ } }
        if (E.to === 0 && inCab(L, p, 0)) toast(t('The elevator motor echoes through the lobby.'), 'info');
      }
    } else if (L.gates[E.at]) L.gates[E.at].ind.color.setHex(0x33ff66);
    // gate lamps of the levels the car is not at stay red
    for (const g of L.gates) if (E.phase === 'idle' && g.level !== E.at) g.ind.color.setHex(0xff3322);
    // DND doors swinging open
    for (const dd of L.dnd) if (dd.anim != null) {
      dd.anim += dt;
      dd.pivot.rotation.y = dd.th0 + dd.swing * ease(dd.anim / 0.6);
      if (dd.anim >= 0.6) dd.anim = null;
    }
    // hidden-floor sconces flicker (separate meshes)
    S.flickT += dt;
    if (L.flick.length && S.flickT > 0.12) { S.flickT = 0; const k = (S.clock * 8) | 0; L.flick.forEach((m, i) => { m.visible = hashf(k * 0.37 + i * 1.7) > 0.18; }); }
  }
  function applyState(L, d) {
    const E = S.elev, at2 = d.at | 0;
    if (E.phase !== 'idle') return;
    if (at2 >= 0 && at2 < K.HZ.stops) { E.at = at2; E.n = d.n | 0; L.cab.position.y = L.ys[at2]; for (let k = 0; k < K.HZ.stops; k++) gateSet(L, k, k !== at2); }
    for (const id of d.dnd || []) applyDnd(L, id, true);
  }
  function applyDnd(L, id, instant) {
    const dd = L.dnd[id | 0];
    if (!dd || dd.open) return;
    dd.open = true;
    try { game.physics?.removeCollider(dd.col); } catch { /* gone */ }
    dd.col = null;
    if (instant) dd.pivot.rotation.y = dd.th0 + dd.swing; else { dd.anim = 0; at('door_open', new V3(dd.x, dd.y + 1.2, dd.z), 0.8); }
  }
  function hostGo(d, from) {
    const L = lab(), E = S.elev;
    if (!host() || !L || L.id !== 'hotel' || !inMoon()) return;
    const to = d.to | 0;
    if (E.phase !== 'idle' || (E.pending && S.clock - E.pendingAt < 2) || to < 0 || to >= K.HZ.stops || to === E.at) return;
    const pp = posOf(from);
    if (!pp || Math.hypot(pp.x - L.gateX, pp.z - L.gateZ) > 10 || pp.y < L.ys[0] - 1 || pp.y > L.ys[2] + 3) return;   // must stand near the shaft (a loose reach, lag tolerant)
    const ride = K.hzRide(run()?.seed ?? 0, E.n, E.at, to);
    E.pending = true; E.pendingAt = S.clock;
    fx({ k: 'go', from: E.at, to, n: E.n, warn: ride.warn, dur: ride.dur });
  }
  function hostDnd(d, from) {
    const L = lab();
    if (!host() || !L || L.id !== 'hotel') return;
    const dd = L.dnd[d.id | 0], p = posOf(from);
    if (!dd || dd.open || !p || Math.hypot(p.x - dd.x, p.z - dd.z) > 4.5 || Math.abs(p.y - dd.y) > 2.5) return;
    const key = game.items?.get?.(d.key);
    if (!key || key.holder !== from || key.type !== 'key') return;
    try { game.net.broadcast('it', { e: 'rm', id: key.id }); } catch { /* net closing */ }
    fx({ k: 'dnd', id: dd.id });
  }

  // ------------------------------------------------------------------------------------------------ net
  function onFx(d) {
    const L = lab();
    if (!L || !d || disposed) return;
    if (d.k === 'p' && L.id === 'darkweb' && Array.isArray(d.p)) addPulse(+d.p[0], +d.p[1], +d.p[2], +d.l || 0.7);
    else if (d.k === 'go' && L.id === 'hotel') startGo(d);
    else if (d.k === 'dnd' && L.id === 'hotel') applyDnd(L, d.id, false);
    else if (d.k === 'hstate' && L.id === 'hotel') applyState(L, d);
  }
  function hostReq(d, from) {
    const L = lab();
    if (!host() || !L || !d) return;
    if (d.op === 'knock') hostKnock(from);
    else if (d.op === 'go') hostGo(d, from);
    else if (d.op === 'dnd') hostDnd(d, from);
    else if (d.op === 'sync' && L.id === 'hotel') {
      const E = S.elev;
      const dnd = L.dnd.filter((q) => q.open).map((q) => q.id);
      if ((E.at || dnd.length) && E.phase === 'idle') { try { game.net.sendTo(from, 'lab12fx', { k: 'hstate', at: E.at, n: E.n, dnd }); } catch { /* peer gone */ } }
    }
  }
  const bindNet = (net) => { if (!net || S.boundNet === net) return; S.boundNet = net; net.on('msg:lab12fx', onFx); };
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('lab12req', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[labyr12] req', e); } }); }));
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  // ------------------------------------------------------------------------------------------------ interactables (hotel)
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed) return;
    const L = lab(), p = game.player;
    if (!L || L.id !== 'hotel' || !p || p.dead || !inMoon()) return;
    const E = S.elev, req = (o) => { try { game.net.request('lab12req', o); } catch { /* net closing */ } };
    const lbl = (k) => t('Floor') + ' ' + K.HZ.labels[k];
    if (E.phase === 'idle') {
      for (let k = 0; k < K.HZ.stops; k++) {
        if (k === E.at || Math.abs(p.pos.y - L.ys[k]) > 2.5 || Math.hypot(p.pos.x - L.gateX, p.pos.z - L.gateZ) > 9) continue;
        out.push({ pos: new V3(L.callPos[0], L.ys[k] + 1.25, L.callPos[1]), r: 0.6, reach: 2.4, label: () => t('Call the elevator [E]'), sub: () => lbl(k), action: () => req({ op: 'go', to: k }) });
      }
      if (inCab(L, p, E.at)) {
        for (let k = 0; k < K.HZ.stops; k++) {
          if (k === E.at) continue;
          out.push({ pos: new V3(L.cabX + (k - 1.5) * 0.42, L.ys[E.at] + 1.3, L.cabZ - 1.32), r: 0.16, reach: 2.6, label: () => lbl(k) + ' [E]', sub: () => (k > E.at ? t('Up') : t('Down')), action: () => req({ op: 'go', to: k }) });
        }
        out.push({ pos: new V3(L.cabX + 0.63, L.ys[E.at] + 1.3, L.cabZ - 1.32), r: 0.14, reach: 2.6, label: () => t('Floor') + ' ' + K.HZ.labels[K.HZ.hidden], sub: () => t('Floor 13: the button was never installed.'), action: () => sfx('door_locked', 0.4) });
      }
    }
    const held = p.heldItem?.();
    for (const dd of L.dnd) {
      if (dd.open || Math.abs(p.pos.y - dd.y) > 2.5 || Math.hypot(p.pos.x - dd.x, p.pos.z - dd.z) > 3.2) continue;
      const pos = new V3(dd.x, dd.y + 1.2, dd.z);
      if (held?.type === 'key') out.push({ pos, r: 0.7, reach: 2.6, label: () => t('Unlock the room with a master key [E]'), sub: () => `${t('Room')} ${dd.room}`, action: () => req({ op: 'dnd', id: dd.id, key: held.id }) });
      else out.push({ pos, r: 0.7, reach: 2.6, label: () => t('DO NOT DISTURB'), sub: () => `${t('Room')} ${dd.room} - ${t('Needs a master key')}`, action: () => at('door_locked', pos, 0.8) });
    }
  }));

  // ------------------------------------------------------------------------------------------------ frame
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    S.clock += dt;
    const F = fac(), L = F?.lab || null;
    if (F !== S.fac) {   // a new facility: reset the per-day state
      for (const c of gateCols.values()) { if (c) { try { game.physics?.removeCollider(c); } catch { /* gone */ } } }
      gateCols.clear();
      S.fac = F; S.pulses = []; S.lastPulse = -9; S.cds.clear(); S.knockAt = -9; S.syncAsked = false; S.flickT = 0;
      S.elev = { at: 0, phase: 'idle', n: 0, t: 0, from: 0, to: 0, warn: K.HZ.warn, dur: 6, rider: false, pending: false, chimes: 0 };
      if (S.box) S.box.style.display = 'none';
    }
    if (host()) wrapNoise();
    if (!L || !inMoon() || (L.id !== 'darkweb' && L.id !== 'hotel')) { if (L?.echo) L.echo.setPulses([]); if (S.box) S.box.style.display = 'none'; return; }
    if (L.id === 'darkweb') tickEcho(dt, L);
    else {
      if (!S.syncAsked && !host()) { S.syncAsked = true; try { game.net.request('lab12req', { op: 'sync' }); } catch { /* net closing */ } }
      tickHotel(dt, L);
    }
  }));

  // ------------------------------------------------------------------------------------------------ debug
  const api = {
    _state: S, addPulse, onNoise, startGo, hostGo, hostKnock, hostDnd, hostReq, onFx,
    get state() { const L = lab(); return { theme: L?.id || null, pulses: S.pulses.length, elevator: { ...S.elev }, dnd: L?.dnd?.filter((q) => q.open).length ?? null }; },
    debug: {
      /** kefal.game.labyr12.debug.info() */
      info() { const L = lab(); return L ? { id: L.id, stats: L.stats, hero: L.hero, elevator: S.elev.phase + '@' + S.elev.at, pulses: S.pulses.length } : 'no darkweb / hotel loaded'; },
      /** dark web: force a knock (host rules apply) / a fake loud noise 6 m ahead */
      knock() { try { game.net.request('lab12req', { op: 'knock' }); } catch { /* ignore */ } return S.pulses.length; },
      pulse(loud = 1.4) { const p = game.player, L = lab(); if (!p || L?.id !== 'darkweb') return 'not in the dark web'; return !!addPulse(p.pos.x, p.pos.y + 1.3, p.pos.z, loud); },
      /** hotel: go to a level (0..2 by elevator) */
      go(to = 1) { try { game.net.request('lab12req', { op: 'go', to }); } catch { /* ignore */ } return S.elev.phase; },
      /** hotel: put yourself on level k (0..3, 3 = the hidden floor) in the ring corridor south of the core */
      tp(k = 3) { const L = lab(), p = game.player; if (!L || L.id !== 'hotel' || !p) return 'not in the hotel'; p.teleport(new V3(L.cx + 2.7, L.ys[k | 0] + 0.2, L.cz + 5.3)); return L.ys[k | 0]; },
      /** hotel: open every DND door (host) */
      unlockAll() { const L = lab(); if (!L || !host()) return 'host only'; for (const q of L.dnd) fx({ k: 'dnd', id: q.id }); return L.dnd.length; },
    },
    dispose() {
      disposed = true;
      for (const off of offs) { try { off(); } catch { /* ignore */ } }
      try { S.boundNet?.off?.('msg:lab12fx', onFx); } catch { /* ignore */ }
      unwrapNoise();
      for (const c of gateCols.values()) { if (c) { try { game.physics?.removeCollider(c); } catch { /* gone */ } } }
      gateCols.clear();
      try { S.box?.remove(); } catch { /* gone */ }
    },
  };
  return api;
}
