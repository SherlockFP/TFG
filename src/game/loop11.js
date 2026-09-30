// LOOP11 - "THE LOOP" (wave 11, `this.useModule('loop11', installLoop11)`): an Exit-8 style observation corridor behind a door in the facility.
// Docs: docs/wave11/loop11.md.   Pure rules: loop11_core.js   Geometry: loop11_build.js   Anomalies: loop11_anom.js   Strings: loop11_text.js   Sounds: audio/sfxlib_l11.js
//
// A door marked EMPLOYEE RE-ONBOARDING stands against a closed wall of one ordinary room (tier 2-3 moons always, others sometimes). It leads into a hall far away from the map
// (x = 14000, on the facility floor plane like the horror pockets). Each pass the hall is exactly the one the crew knows or has ONE anomaly. Walk out of the far end = "nothing
// is different", walk out of the near end = "turn back". The host judges the first crossing: right = exit counter +1 (8 = the break room with rare scrap + the handbook
// appendix), wrong = counter 0 + a strike (3: HR is watching, 4: Customer Support is sent to the door, 6: terminated, door sealed, The Moderator waits outside).
// The crew shares one state; every peer renders the same pass from (run seed, moon, pass, variant seed) so they agree on what is different.
//
// Net (prefix 'loop'): client -> host request 'loopq' {op: 'end' side 'f'|'b' pass | 'sync'}, host -> all 'loops' {t: 'pass'|'win'|'fired'|'all', p, n, w, an, vs, ok, sd, pa, by}.
// Hooks: mapLoaded / phase / update / interactables / netReady / registerHandlers / playerJoin. Soft interface: game.loop11 = { state(), debug }.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { addTranslations, t, tf, upperT } from '../core/i18n.js';
import { registerItem, ITEMS } from './items.js';
import { MOONS } from './moons.js';
import { hudDock } from '../ui/dock.js';
import { saveProfile } from '../core/save.js';
import { RNG, hashString } from '../core/rng.js';
import { levelMaterial } from '../world/geobuilder.js';
import { makeCanvasTexture } from '../render/textures.js';
import { installLoop11Textures } from '../render/loop11_textures.js';
import * as C from './loop11_core.js';
import { buildSpace } from './loop11_build.js';
import { IMPL, baseTick } from './loop11_anom.js';
import { TR, RU, ANOM_TEXT, HUD } from './loop11_text.js';

HOST_ONLY.add('loops');

const V3 = THREE.Vector3;
const { GEO, LP } = C;
const FONT = (px) => `bold ${px}px "Courier New", monospace`;
const _f = new V3();

// ------------------------------------------------------------------------------------------------ the item behind exit 8
function registerLoopItems(mm) {
  if (!ITEMS.lp_badge) registerItem({ id: 'lp_badge', name: HUD.badge, kind: 'scrap', value: [230, 330], weight: 1, hands: 1, tip: HUD.badgeTip });
  if (mm?.itemModels && !mm.itemModels.has('lp_badge')) mm.itemModels.set('lp_badge', () => {
    const g = new THREE.Group();
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: e });
    const box = (m, sx, sy, sz, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); me.position.set(x, y, z); g.add(me); return me; };
    box(lam(0xf2efe2, 0x1a1a14), 0.085, 0.005, 0.12, 0, 0.03, 0); box(lam(0x1e5a9a), 0.085, 0.006, 0.026, 0, 0.032, -0.045); box(lam(0xb02020), 0.02, 0.007, 0.02, 0.025, 0.033, 0.02);
    box(lam(0x2a2a2a), 0.05, 0.007, 0.05, -0.012, 0.033, 0.018);
    box(lam(0x2a7a44), 0.014, 0.004, 0.16, -0.02, 0.028, -0.13); box(lam(0x2a7a44), 0.014, 0.004, 0.16, 0.02, 0.028, -0.13);
    return g;
  });
}

// ------------------------------------------------------------------------------------------------ the door in the facility wall
function buildDoor(frame) {
  const g = new THREE.Group(); g.name = 'loop11_door';
  g.position.set(frame.wallX, frame.y, frame.wallZ); g.rotation.y = Math.atan2(frame.fx, frame.fz);
  const disp = [];
  const lam = (c, o = {}) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o }); disp.push(m); return m; };
  const box = (m, sx, sy, sz, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); me.position.set(x, y, z); g.add(me); return me; };
  const Z = 0.26;   // stands proud of the wall (facility walls are ~0.3 thick)
  const paint = lam(0x2a4a3a);
  box(paint, 0.1, 2.3, 0.18, -0.66, 1.15, Z); box(paint, 0.1, 2.3, 0.18, 0.66, 1.15, Z); box(paint, 1.42, 0.1, 0.18, 0, 2.32, Z);
  box(lam(0x0a0c0b), 1.22, 2.2, 0.03, 0, 1.1, Z - 0.05);
  const dm = levelMaterial('lp_door', {});
  const leaf = box(dm, 1.2, 2.2, 0.06, 0, 1.1, Z + 0.02);
  box(lam(0xc8c0a0), 0.05, 0.05, 0.1, 0.46, 1.0, Z + 0.09);
  box(lam(0x3a0a0a), 1.3, 0.02, 0.8, 0, 0.011, Z + 0.55);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x40ff80 }); disp.push(lightMat);
  box(lightMat, 0.12, 0.12, 0.05, 0.86, 2.24, Z + 0.02);
  const tx = makeCanvasTexture(160, 40, (c) => {
    c.fillStyle = '#12261c'; c.fillRect(0, 0, 160, 40); c.strokeStyle = '#d8f0d8'; c.lineWidth = 3; c.strokeRect(2, 2, 156, 36);
    c.fillStyle = '#e8f6e8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = FONT(15); c.fillText(upperT(HUD.doorPlaque), 80, 20);
  });
  const pm = new THREE.MeshBasicMaterial({ map: tx, color: 0xffffff }); disp.push(pm); if (tx) disp.push(tx);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.32), pm); pl.position.set(0, 2.62, Z + 0.1); g.add(pl);
  return { group: g, lightMat, leaf, dispose() { g.removeFromParent(); g.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); for (const d of disp) d.dispose?.(); } };
}

export function installLoop11(game) {
  const g = game, mods = game.mods;
  if (!mods) return null;
  installLoop11Textures();
  addTranslations(TR, 'tr'); addTranslations(RU, 'ru');
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || mods;
  registerLoopItems(mm);
  const offs = [], patches = [];
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  const patch = (obj, key, make) => { if (!obj) return; const prev = obj[key]; const own = Object.prototype.hasOwnProperty.call(obj, key); const fn = make(prev); obj[key] = fn; patches.push(() => { if (obj[key] === fn) { if (own) obj[key] = prev; else delete obj[key]; } }); };

  const S = {
    active: false, disposed: false, gen: 0, time: 0, seed: 0, moonId: '', tier: 1, L: null, oy: 0,
    frame: null, door: null, room: -1, st: C.newState(0, ''), space: null, curAn: null,
    inside: false, armed: false, sentPass: -1, sentAt: -99, savedFog: undefined, dock: null, dockHtml: '', dockT: 0, introShown: false,
    doorHex: 0x40ff80, hostT: -99, rewardDone: false, supportDone: false, firedDone: false, warnT: 0, doorT: 0,
  };
  const toast = (m, k = 'info') => { try { g.ui.toast(m, k); } catch { /* ui optional */ } };
  const snd = (name, pos, vol = 1, o = {}) => { try { if (g.audio?.has?.(name)) g.audio.at(name, pos, vol, { refDistance: 3, maxDistance: 40, ...o }); } catch { /* audio optional */ } };
  const sfx = (name, vol = 0.6) => { try { if (g.audio?.has?.(name)) g.sfx(name, vol); } catch { /* audio optional */ } };
  const later = (fn, ms) => { try { if (g.later) g.later(fn, ms); else setTimeout(fn, ms); } catch { /* ignore */ } };
  const nameOf = (id) => g.playerName?.(id) || 'Employee';
  const posOf = (id) => (id === g.selfId ? g.player?.pos : g.remotes?.get(id)?.pos);
  const inHallAt = (p) => !!p && Math.abs(p.z - GEO.oz) <= GEO.W / 2 + 0.8 && p.x - GEO.ox >= -GEO.STUB - 0.6 && p.x - GEO.ox <= GEO.L + GEO.STUB + 0.6 && Math.abs(p.y - S.oy) < 8;
  const inRoomAt = (p) => !!p && Math.abs(p.z - GEO.oz) <= GEO.R.hw + 0.8 && p.x - GEO.ox >= GEO.R.u0 - 0.6 && p.x - GEO.ox <= GEO.R.u1 + 0.6 && Math.abs(p.y - S.oy) < 8;
  const inLoopAt = (p) => inHallAt(p) || inRoomAt(p);

  // ================================================================================ profile (personal, this peer only)
  const prof = () => { const p = g.profile; if (!p) return null; const o = p.loop11 && typeof p.loop11 === 'object' ? p.loop11 : (p.loop11 = {}); o.seen = o.seen || {}; o.wins = o.wins | 0; o.handbook = o.handbook | 0; return o; };
  let saveT = null;
  const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; try { g.progress?.save?.() ?? saveProfile(g.profile); } catch { /* storage may be unavailable */ } }, 400); };

  // ================================================================================ build / teardown (every peer, from the finished facility)
  function teardown() {
    S.gen++;
    dockShow(false);
    if (S.inside) leaveFx();
    S.inside = false;
    S.door?.dispose(); S.door = null;
    disposeSpace();
    S.active = false; S.frame = null; S.L = null;
    S.rewardDone = S.supportDone = S.firedDone = false; S.armed = false; S.sentPass = -1;
  }
  function disposeSpace() { S.space?.dispose(); S.space = null; S.curAn = null; }
  function activate(frame, L, seed, moonId, tier) {
    S.frame = frame; S.L = L; S.oy = L?.y ?? -300; S.seed = seed >>> 0; S.moonId = moonId; S.tier = tier;
    S.st = C.newState(S.seed, moonId); S.active = true;
    S.door = buildDoor(frame); g.scene.add(S.door.group); setDoorLight();
  }
  function build(world) {
    teardown();
    const fac = world?.facility;
    if (!fac?.layout || !g.run || world.company) return;
    const moon = MOONS[world.moonId] || {};
    const L = fac.layout;
    let site = null;
    try { site = C.doorSite(L, { moonId: world.moonId, day: g.run.day, quotaIndex: g.run.quotaIndex }, moon.tier || 1); } catch (e) { console.warn('[loop11] site', e); }
    if (!site) return;
    const gen = S.gen;
    const run = () => {
      if (gen !== S.gen || S.disposed) return;
      try { activate(C.closetFrame(L, site.cell), L, g.run.seed, world.moonId, moon.tier || 1); S.room = site.room; if (!g.isHost) g.net?.request?.('loopq', { op: 'sync' }); } catch (e) { console.warn('[loop11] build', e); teardown(); }
    };
    if (g.landQ?.addNext) g.landQ.addNext('loop11:door', run); else run();
  }
  function ensureSpace() {
    if (S.space || !S.active) return S.space;
    try {
      S.space = buildSpace({ physics: g.physics, lightPool: g.lights, oy: S.oy });
      g.scene.add(S.space.group);
      S.curAn = null; applyState();
    } catch (e) { console.warn('[loop11] space', e); S.space = null; }
    return S.space;
  }
  function applyState() {
    const sp = S.space; if (!sp) return;
    const E = sp.E, st = S.st;
    try { if (S.curAn && IMPL[S.curAn]) IMPL[S.curAn].off(E); } catch (e) { console.warn('[loop11] off', e); }
    S.curAn = null;
    E.setCounter(st.won ? C.LP.GOAL : st.n);
    if (st.an && IMPL[st.an]) {
      try { const v = C.variantOf(st.an, st.vs); IMPL[st.an].on(E, { v, vs: st.vs, rng: new RNG(st.vs) }); S.curAn = st.an; } catch (e) { console.warn('[loop11] on', st.an, e); }
    }
  }
  function setDoorLight() {
    if (!S.door) return;
    S.doorHex = S.st.sealed ? 0xff2a1a : S.st.won ? 0xffd040 : 0x40ff80;
  }

  // ================================================================================ local player moves
  const yawOut = () => Math.atan2(-S.frame.fx, -S.frame.fz);
  function blink(a = 0.9) { try { g.engine.flash(0x000000, a); } catch { /* engine optional */ } }
  function tpTo(w, yaw) { const p = g.player; p.teleport(w, yaw); p.pitch = 0; g.psTimer = 0; }
  function toStart() { const sp = S.space; if (!sp) return; const s = C.startSpot(g.selfId); tpTo(sp.world(s.u, 0, s.v), GEO.FRAME.yaw); S.armed = false; S.sentPass = -1; }
  function toReward() { const sp = S.space; if (!sp) return; const s = C.rewardSpot(g.selfId); tpTo(sp.world(s.u, 0, s.v), GEO.FRAME.yaw); }
  function toDoor() {
    if (!S.frame) return;
    const f = S.frame;
    tpTo(new V3(f.wallX + f.fx * 1.15, f.y, f.wallZ + f.fz * 1.15), yawOut());
    blink(0.6);
  }
  function enter() {
    if (!S.active || g.player.dead) return;
    if (S.st.sealed) { toast(t(HUD.doorSealed), 'bad'); sfx('door_locked', 0.7); return; }
    if (S.st.won) { toast(t(HUD.doorDone), 'info'); return; }
    if (!ensureSpace()) return;
    blink(0.9); sfx('door_creak', 0.5);
    toStart();
  }

  // ================================================================================ presentation while inside (local)
  const FOG = { fog: 0xb6c2b2, density: 0.013, hemi: 0.46, ambient: 0.1 };
  function enterFx() {
    S.savedFog = g.env.interiorFog; g.env.interiorFog = FOG;
    try { const a = g.audio; a.setAmbience('base', a.has('ambience_loop11') ? 'ambience_loop11' : 'ambience_facility', 0.5); a.setAmbience('buzz', null); a.setEnvironment?.('facility'); } catch { /* audio optional */ }
    dockShow(true);
    if (!S.introShown) { S.introShown = true; try { g.ui.hud?.bigText?.(t(HUD.title), t(HUD.intro)); } catch { /* hud optional */ } }
  }
  function leaveFx() {
    if (g.env.interiorFog === FOG) g.env.interiorFog = S.savedFog !== undefined ? S.savedFog : (g.world?.facility?.atmosphere || null);
    S.savedFog = undefined;
    dockShow(false);
    try { g.updateAmbience?.(); } catch { /* audio optional */ }
  }
  function dockShow(v) {
    try {
      if (v && !S.dock) { S.dock = hudDock('left', 'loop11', 3); S.dockHtml = ''; S.dockT = 0; }
      else if (!v && S.dock) { S.dock.remove(); S.dock = null; }
    } catch { S.dock = null; /* no DOM (tests) */ }
  }
  function dockTick(dt) {
    if (!S.dock) return;
    S.dockT -= dt; if (S.dockT > 0) return; S.dockT = 0.3;
    const st = S.st, blinkOn = Math.floor(g.time * 2) % 2 === 0;
    let pips = ''; for (let i = 0; i < LP.LIMIT; i++) pips += `<span style="color:${i < st.wrong ? (blinkOn && st.wrong >= LP.WARN ? '#ff5a4a' : '#e03a2a') : '#5a6a5a'}">${i < st.wrong ? '&#9646;' : '&#9647;'}</span>`;
    const html = `<div style="background:linear-gradient(270deg,rgba(10,26,18,0),rgba(10,26,18,0.7));padding:6px 30px 7px 12px;text-align:left;font-family:monospace">
      <div style="font:700 20px/1 monospace;letter-spacing:4px;color:#b8f0c8;text-shadow:2px 2px 0 #000">${t(HUD.title)}</div>
      <div style="font:700 15px/1.5 monospace;letter-spacing:3px">${pips} <span style="color:#9fb89a;font-size:12px;letter-spacing:1px">${tf(HUD.strikes, { w: st.wrong, max: LP.LIMIT })}</span></div>
      <div style="font:12px/1.35 monospace;color:#8fa890">${t(HUD.crew)}</div></div>`;
    if (html !== S.dockHtml) { S.dock.innerHTML = html; S.dockHtml = html; }
  }

  // ================================================================================ host: judge, reward, punishment
  const msgOf = (t0, r) => { const st = S.st; return { t: t0, p: st.pass, n: st.n, w: st.wrong, an: st.an || 0, vs: st.vs, won: st.won ? 1 : 0, sealed: st.sealed ? 1 : 0, ...(r || {}) }; };
  function stFromMsg(d) { return { pass: d.p | 0, n: d.n | 0, wrong: d.w | 0, an: d.an || null, vs: d.vs | 0, hist: [], won: !!d.won, sealed: !!d.sealed }; }
  function hostEnd(d, from) {
    if (!S.active || S.disposed || !d || (g.time || 0) - S.hostT < 0.7) return;
    if (d.pass !== S.st.pass || S.st.won || S.st.sealed) return;
    if (!inHallAt(posOf(from))) return;
    const r = C.advance(S.st, d.side, S.seed, S.moonId);
    if (!r) return;
    S.hostT = g.time || 0;
    S.st = r.st;
    g.net.broadcast('loops', msgOf(r.ev, { ok: r.ok ? 1 : 0, sd: r.side, pa: r.prevAn || 0, by: from }));
    if (r.ev === 'win') g.later?.(() => hostReward(), 1400);
    if (r.ev === 'fired') g.later?.(() => hostPunish('moderator'), 2000);
    else if (!r.ok && S.st.wrong === LP.SUPPORT_AT) g.later?.(() => hostPunish('support'), 2500);
  }
  function hostReward() {
    if (S.rewardDone || !S.active || S.disposed) return; S.rewardDone = true;
    const sp = ensureSpace(); if (!sp) return;
    const rng = new RNG(hashString(`loop11|reward|${S.seed}|${S.moonId}`));
    const spots = sp.E.rewardSpots, extra = 2 + (S.st.wrong === 0 ? 1 : 0);
    try {
      g.items.hostSpawn('lp_badge', spots[0].clone(), { valueMul: 1 });
      for (let i = 0; i < extra; i++) {
        const id = rng.weighted(C.REWARD_POOL.filter(([k]) => ITEMS[k]).map(([k, w]) => ({ id: k, w }))).id;
        g.items.hostSpawn(id, spots[1 + i].clone(), { valueMul: 1.35 });
      }
    } catch (e) { console.warn('[loop11] reward', e); }
  }
  function hostPunish(kind) {
    if (!S.active || S.disposed || !S.frame || !g.creatures?.hostSpawn) return;
    if (kind === 'support' ? S.supportDone : S.firedDone) return;
    if (kind === 'support') S.supportDone = true; else S.firedDone = true;
    const f = S.frame;
    try { g.creatures.hostSpawn(kind, new V3(f.wallX + f.fx * 2.4, f.y, f.wallZ + f.fz * 2.4), { zone: 'in', level: g.rollLevel?.() || 1 }); } catch (e) { console.warn('[loop11] punish', e); }
  }
  function onReq(d, from) {
    if (!d || !S.active) return;
    if (d.op === 'sync') g.net.sendTo(from, 'loops', msgOf('all'));
    else if (d.op === 'end') hostEnd(d, from);
  }

  // ================================================================================ all peers: apply a state message
  function onState(d) {
    if (!d || !S.active || S.disposed) return;
    if (!g.isHost) S.st = stFromMsg(d);
    setDoorLight();
    if (d.t === 'all') { applyState(); return; }
    applyState();
    const p = g.player, inH = S.space?.inHall(p.pos), inR = S.space?.inReward(p.pos);
    const st = S.st, who = nameOf(d.by);
    if (inH || inR) {
      const an = d.pa ? t(ANOM_TEXT[d.pa]?.[0] || d.pa) : '';
      if (d.t === 'pass') {
        toast(d.ok ? (d.sd === 'b' ? tf(HUD.okBack, { name: who, an, n: st.n, goal: LP.GOAL }) : tf(HUD.okOn, { name: who, n: st.n, goal: LP.GOAL }))
          : (d.sd === 'f' ? tf(HUD.badOn, { name: who, an, w: st.wrong, max: LP.LIMIT }) : tf(HUD.badBack, { name: who, w: st.wrong, max: LP.LIMIT })), d.ok ? 'good' : 'bad');
        sfx(d.ok ? 'loop_ok' : 'loop_bad', 0.6);
        if (!d.ok && st.wrong === LP.WARN) later(() => { sfx('loop_pa', 0.6); toast(t(HUD.warn), 'bad'); }, 1400);
        if (!d.ok && st.wrong === LP.SUPPORT_AT) later(() => { sfx('loop_pa', 0.6); toast(t(HUD.support), 'bad'); }, 1400);
        if (d.ok && d.sd === 'b' && d.pa) { const q = prof(); if (q && inH) { q.seen[d.pa] = (q.seen[d.pa] | 0) + 1; save(); } }
        if (inH) { blink(0.85); sfx('loop_warp', 0.55); toStart(); }
      } else if (d.t === 'win') {
        toast(t(HUD.win), 'good'); sfx('loop_win', 0.7);
        const q = prof(); if (q) { q.wins++; q.handbook = 1; if (d.pa) q.seen[d.pa] = q.seen[d.pa] | 0; save(); }
        blink(0.9); ensureSpace(); toReward();
      } else if (d.t === 'fired') {
        toast(t(HUD.fired), 'bad'); sfx('loop_bad', 0.7); blink(0.9); toDoor();
      }
    }
  }
  function sendAll(to) { try { g.net.sendTo(to, 'loops', msgOf('all')); } catch { /* peer gone */ } }
  on('netReady', (net) => { net.on_('loops', (d) => { try { onState(d); } catch (e) { console.warn('[loop11] loops', e); } }); });
  on('registerHandlers', (H, gg) => { if (gg === g) H('loopq', (d, from) => { try { onReq(d, from); } catch (e) { console.warn('[loop11] loopq', e); } }); });
  on('playerJoin', (id) => { if (g.isHost && S.active) later(() => { if (S.active) sendAll(id); }, 1500); });

  // ================================================================================ interactables
  on('interactables', (out) => {
    if (!S.active || S.disposed) return;
    const p = g.player; if (p.dead) return;
    try {
      if (S.frame && !S.inside && p.indoor) {
        const f = S.frame, pos = new V3(f.wallX + f.fx * 0.75, f.y + 1.2, f.wallZ + f.fz * 0.75);
        if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 6) {
          out.push({ pos, r: 0.9, reach: 2.6, label: () => (S.st.sealed ? t(HUD.doorSealed) : S.st.won ? t(HUD.doorDone) : t(HUD.door)), sub: () => t(HUD.doorSub), action: enter });
        }
      }
      const sp = S.space;
      if (sp && S.inside) {
        if (sp.inHall(p.pos)) out.push({ pos: sp.E.staff.pos, r: 0.9, reach: 2.6, label: t(HUD.leave), sub: t(HUD.leaveSub), action: () => { blink(0.7); toDoor(); } });
        if (sp.inReward(p.pos)) out.push({ pos: sp.E.roomDoor.pos, r: 0.9, reach: 2.8, label: t(HUD.back), action: () => { blink(0.7); toDoor(); } });
      }
    } catch (e) { if (!S.warnedI) { S.warnedI = true; console.warn('[loop11] interactables', e); } }
  });

  // creatures standing in the loop only see players in the loop, and the other way round
  patch(g.creatures, 'playersFor', (prev) => function (c) {
    const list = prev.call(this, c);
    if (!S.active || !S.space || !c) return list;
    const here = inLoopAt(c.pos);
    return list.filter((q) => inLoopAt(q.pos) === here);
  });

  // ================================================================================ frame update
  const tickCx = { dt: 0, t: 0, cam: null, fwd: _f, pl: null, moving: false, sprint: false, u: 0, inHall: false, snd };
  on('update', (dt) => {
    if (!S.active || S.disposed) return;
    S.time += dt;
    const p = g.player, sp = S.space;
    if (S.door) S.door.lightMat.color.setHex(S.doorHex).multiplyScalar(0.62 + 0.38 * Math.sin(S.time * (S.st.sealed ? 6 : 2.2)));
    if (!sp) return;
    const inH = sp.inHall(p.pos), inR = sp.inReward(p.pos), inside = (inH || inR) && !p.dead;
    if (inside !== S.inside) { S.inside = inside; if (inside) enterFx(); else leaveFx(); }
    if (!inside) return;
    try {
      const cam = g.camera.position; _f.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
      const sh = Math.hypot(p.vel.x, p.vel.z), lc = sp.local(p.pos);
      tickCx.dt = dt; tickCx.t = S.time; tickCx.cam = cam; tickCx.pl = p.pos; tickCx.moving = sh > 0.8; tickCx.sprint = sh > 5; tickCx.u = lc.u; tickCx.inHall = inH;
      baseTick(sp.E, tickCx);
      if (S.curAn && IMPL[S.curAn]?.tick) IMPL[S.curAn].tick(sp.E, tickCx);
      dockTick(dt);
      if ((S.quietT = (S.quietT || 0) - dt) <= 0) { S.quietT = 0.5; try { g.atmos?.quietFor?.(1.2); } catch { /* atmos optional */ } }   // the facility's random drips and clanks stay out of the office
      if (inH) checkEnds(lc);
    } catch (e) { if (!S.warnedU) { S.warnedU = true; console.warn('[loop11] update', e); } }
  });
  function checkEnds(lc) {
    const st = S.st;
    if (st.won || st.sealed) return;
    if (lc.u > GEO.ARM_U) S.armed = true;
    if (S.sentPass === st.pass) {
      if (g.time - S.sentAt > 2.5) { S.sentPass = -1; toStart(); blink(0.6); }   // the host said no (stale pass / rate limit): back to the start, try again
      return;
    }
    let side = null;
    if (lc.u > GEO.L + GEO.TRIG && Math.abs(lc.v) < 1.3) side = 'f';
    else if (S.armed && lc.u < -GEO.TRIG && Math.abs(lc.v) < 1.3) side = 'b';
    if (!side) return;
    S.sentPass = st.pass; S.sentAt = g.time; blink(0.7);
    g.net.request('loopq', { op: 'end', side, pass: st.pass });
  }
  on('mapLoaded', (world) => { try { build(world); } catch (e) { console.warn('[loop11] build', e); teardown(); } });
  on('phase', (ph) => { if (ph === 'orbit' || ph === 'fired') teardown(); });

  // ================================================================================ codex tab: the handbook (anomalies you have identified)
  const codex = {
    id: 'loop11',
    label: (p) => { const q = p?.loop11; return `${t(HUD.handbook)} ${Object.values(q?.seen || {}).filter((n) => n > 0).length}/${C.ANOM_IDS.length}`; },
    render(body, p) {
      const q = p?.loop11 || { seen: {}, wins: 0, handbook: 0 };
      const box = document.createElement('div'); box.style.cssText = 'font-family:monospace;line-height:1.45;padding:4px 2px;max-width:640px';
      const row = (html, css = '') => { const d = document.createElement('div'); d.style.cssText = css; d.innerHTML = html; box.appendChild(d); return d; };
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      row(esc(t(HUD.handbookHead)), 'font-weight:700;letter-spacing:2px;color:#b8f0c8;margin-bottom:4px');
      row(q.handbook ? esc(t(HUD.handbookBody)) : esc(t(HUD.handbookLocked)), `opacity:${q.handbook ? 0.9 : 0.5};margin-bottom:8px`);
      row(esc(tf(HUD.wins, { n: q.wins | 0 })), 'color:#ffd070;margin-bottom:8px');
      let any = false;
      for (const id of C.ANOM_IDS) {
        const n = q.seen?.[id] | 0, tx = ANOM_TEXT[id]; if (!tx) continue;
        if (n > 0) { any = true; row(`<b>${esc(t(tx[0]))}</b> <span style="opacity:.55">${esc(tf(HUD.seenN, { n }))}</span><br><span style="opacity:.8">${esc(t(tx[1]))}</span>`, 'margin:0 0 7px;padding-left:8px;border-left:2px solid #3a6a4a'); }
        else row(`<b style="opacity:.4">${esc(t(HUD.unknown))}</b>`, 'margin:0 0 4px;padding-left:8px;border-left:2px solid #2a3a30');
      }
      if (!any) row(esc(t(HUD.handbookNone)), 'opacity:.6;margin-top:6px');
      body.appendChild(box);
    },
  };
  if (typeof window !== 'undefined') (window.__tfgCodexExt = window.__tfgCodexExt || []).push(codex);

  // ================================================================================ api + debug console (kefal.game.loop11.debug...)
  const debug = {
    /** put a door on the wall in front of the player (any moon, host or solo) and build its state; then debug.enter() */
    spawnDoor() {
      const p = g.player, yaw = p.yaw, fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));   // facing back at the player (opposite of their view)
      const dir = Math.abs(fx) > Math.abs(fz) ? [Math.sign(fx) || 1, 0] : [0, Math.sign(fz) || 1];
      const frame = { wallX: p.pos.x - dir[0] * 3, wallZ: p.pos.z - dir[1] * 3, fx: dir[0], fz: dir[1], y: p.pos.y };
      teardown();
      activate(frame, g.world?.facility?.layout || { y: p.pos.y }, g.run?.seed || 1, g.run?.moon || 'debug', 2);
      return { frame, oy: S.oy };
    },
    enter() { enter(); return S.inside; },
    leave() { toDoor(); },
    ensure() { return !!ensureSpace(); },
    state: () => ({ ...S.st, hist: S.st.hist.slice(-4) }),
    /** apply anomaly `id` (or null) locally right now, without the host; the counter shows n */
    show(id = null, n = 0) { ensureSpace(); S.st = { ...S.st, an: id, n, vs: (S.st.vs + 1) | 0 }; applyState(); return S.curAn; },
    /** host: really end the pass as the local player would */
    end(side = 'f') { g.net.request('loopq', { op: 'end', side, pass: S.st.pass }); },
    /** host: force the next pass to be anomaly `id` (or normal when null) */
    force(id = null) { if (!g.isHost) return false; S.st = { ...S.st, an: id, vs: (S.st.vs * 7 + 13) | 0 }; g.net.broadcast('loops', msgOf('all')); return true; },
    win() { if (!g.isHost) return false; S.st = { ...S.st, n: LP.GOAL, won: true, pass: S.st.pass + 1 }; g.net.broadcast('loops', msgOf('win', { ok: 1, sd: 'f', by: g.selfId })); later(hostReward, 1400); return true; },
    fire() { if (!g.isHost) return false; S.st = { ...S.st, wrong: LP.LIMIT, sealed: true, pass: S.st.pass + 1 }; g.net.broadcast('loops', msgOf('fired', { ok: 0, sd: 'f', by: g.selfId })); later(() => hostPunish('moderator'), 2000); return true; },
    reward() { S.rewardDone = false; hostReward(); },
    site: () => (S.frame ? { frame: S.frame, room: S.room, tier: S.tier } : null),
    /** every anomaly once, for eyeballing: returns ids; call debug.show(id) to look at one */
    ids: () => C.ANOM_IDS.slice(),
  };
  const api = {
    S, core: C, debug,
    get state() { return S.st; },
    stats: () => ({ active: S.active, door: !!S.frame, inside: S.inside, built: !!S.space, an: S.curAn, pass: S.st.pass, n: S.st.n, wrong: S.st.wrong, won: S.st.won, sealed: S.st.sealed }),
    dispose() {
      S.disposed = true;
      for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
      teardown();
      for (const undo of patches.splice(0).reverse()) { try { undo(); } catch { /* ignore */ } }
      if (typeof window !== 'undefined' && window.__tfgCodexExt) window.__tfgCodexExt = window.__tfgCodexExt.filter((e) => e !== codex);
      if (saveT) { clearTimeout(saveT); saveT = null; }
    },
  };
  return api;
}
