// FEEDCAMS 2 (wave 8, module 'feedcams2'; docs/wave8/feedcams2.md): wires the core verb "dodge the camera / cut the feed" into the rest of the game.
//   showcase  going live ON PURPOSE: big scrap (>= SHOW.min) carried home while tagged still pays the viewer tax, but sponsors tip the carrier Clout
//             (max 3 per day) + algo2 hype + viewers. Sneak it home for the full value, or put it on the stream for Clout / a sponsor crate tier.
//   drones    1-2 outdoor patrol drones circle the facility entrance at night; their searchlight is a mobile camera (same meter / tag / tax).
//             Counter-play: stay out of the light (trees / walls block it), crouch, a loud noise pulls them away, a rifle shot downs one, Zap Gun blinds it.
//   jammer    Signal Jammer (shop, 40): battery tool, cameras / drones within 8 m go blind while it runs; it hums (creatures hear it) and drains 1/s.
//   hooks     downed on camera = viewers spike + hype + Algorithm line; revive on camera; Lantern Keeper beam + Follower live in their own modules
//             (lcmonsters_ai / crdirector_creatures call game.feedcams.expose / sees); crdirector reads the heat (onFeedHeat).
//   highlights the host keeps the crew's best on-air moment of the day (run.fc2.hl); the day summary names it (text only).
// Net (prefix 'fc2'): 'fc2req' client -> host {op:'zap', i}; 'fc2fx' host -> everyone (HOST_ONLY) {k:'say'|'tip'|'show'|'dd'|'dz', ...}.
// State: game.run.fc2 = { dr: [[st, until, baitX, baitZ, baitT0, baitT1, seeing]...], hl: [kind, name, v, extra, score] | null } (host-authoritative).
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { STORE_ITEMS, registerItem, isSellable } from './items.js';
import { MOONS } from './moons.js';
import { G } from '../physics/physics.js';
import { HYPE } from './algo2_core.js';
import { VIEW_GAIN } from './algo1_core.js';
import { firstDay } from './firstrun_core.js';
import { segNear } from './feedcams_core.js';
import * as C from './feedcams2_core.js';
import { HL_TEXT } from './feedcams2_i18n.js';
import { createArtModel } from '../models/artpass.js';

HOST_ONLY.add('fc2fx');
Object.assign(HYPE.pts, { showcase: C.SHOW.hype, downed_live: 10 });
Object.assign(HYPE.cd, { showcase: 0, downed_live: 0 });
Object.assign(VIEW_GAIN, { showcase: 0.12, downed_live: 0.3 });
const JAM_TIP = 'LMB: on / off. Cameras and drones within 8 m go blind while it runs. 50 s of battery, it hums (creatures hear it). Charge it at the ship charger.';
registerItem({ id: C.JAM.id, name: 'Signal Jammer', kind: 'tool', price: C.JAM.price, weight: 2, hands: 1, battery: C.JAM.battery, tier: 'uncommon', tip: JAM_TIP });
if (!STORE_ITEMS.includes(C.JAM.id)) STORE_ITEMS.push(C.JAM.id);
const TIPS = [
  'Big scrap. Walk it past one of my cameras and my sponsors tip you Clout. I still take my cut, of course.',
  'Night shift. My drones sweep the entrance with searchlights. Same rules as the cameras: stay out of the light, or shoot them down.',
];
const ST = { OK: 0, BLIND: 1, DEAD: 2 };

export function installFeedcams2(game) {
  const mods = game.mods;
  if (!mods) return null;
  if (mods.itemModels && !mods.itemModels.has(C.JAM.id)) mods.itemModels.set(C.JAM.id, () => createArtModel(C.JAM.id));   // [artpass] Signal Jammer model
  const offs = [], wraps = [], V3 = THREE.Vector3;
  const S = { key: null, drones: [], vis: null, tick: 0, jamT: 0, humT: 0, tipNow: 0, tipT: 0, streak: new Map(), paid: new Map(), sumHl: null, jams: [] };
  let disposed = false, boundNet = null;
  const run = () => game.run, F2 = () => game.run?.fc2 || null, host = () => !!game.isHost, FC = () => game.feedcams;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const fx = (d) => { try { game.net.broadcast('fc2fx', d); } catch { /* net closing */ } };
  const nameOf = (id) => { try { return game.playerName?.(id) || '?'; } catch { return '?'; } };
  const onMoon = () => { const r = run(), m = r && MOONS[r.moon]; return !!m && r.phase === 'moon' && !m.company && !m.home; };
  const hostNow = () => game.time + (host() ? 0 : (FC()?.state?.off || 0));
  const sync = () => game.broadcastRun?.(['fc2']);

  // ------------------------------------------------------------------ highlights (host records, everyone reads at takeoff)
  function record(kind, id, v = 0, extra = '') {
    const s = F2(); if (!host() || !s) return;
    const m = C.hlMake(kind, nameOf(id), v, extra), best = C.hlBetter(s.hl, m);
    if (best !== s.hl) { s.hl = best; sync(); }
  }
  function hypeAct(kind) {
    try { if (game.algo2?.hype) game.algo2.hype(kind); else game.algo1?.bump?.(kind, kind); } catch { /* algo optional */ }
  }
  const say = (s, v) => fx({ k: 'say', s, v });

  // ------------------------------------------------------------------ feedcams host events: showcase / moments
  offs.push(mods.on('feedcams', (ev, g) => {
    if (g !== game || disposed || !host() || !ev || !F2()) return;
    try {
      if (ev.k === 'clock') {   // host migration re-based the feedcams clock: shift the drone timers the same way
        for (const e of F2().dr || []) { if (e[1]) e[1] = Math.round((e[1] - ev.d) * 10) / 10; if (e[4]) e[4] -= ev.d; if (e[5]) e[5] -= ev.d; }
        sync(); return;
      }
      if (ev.k === 'tax') {
        const paid = S.paid.get(ev.by) || 0, tip = C.showTip(ev.v, ev.cut, paid);
        if (ev.v >= C.SHOW.min) {
          hypeAct('showcase');
          record('show', ev.by, ev.v, ev.name);
          if (tip > 0) { S.paid.set(ev.by, paid + 1); fx({ k: 'tip', to: ev.by, n: tip }); }
          fx({ k: 'show', id: ev.by, name: ev.name, n: tip });
        }
      } else if (ev.k === 'juke') record('juke', ev.id, Math.round((ev.pk || 0.5) * 100));
      else if (ev.k === 'live') record('live', ev.id);
      else if (ev.k === 'fans') record('fans', ev.id, ev.h);
      else if (ev.k === 'smash') record('smash', ev.by, Math.round((ev.m || 0) * 100));
      else if (ev.k === 'cut') record('cut', ev.by);
      else if (ev.k === 'noise') droneBait(ev.pos, ev.loud);
    } catch (e) { console.warn('[feedcams2] event', e); }
  }));
  // downed / revived on camera
  const onCam = (id, pos) => { const m = FC()?.meter?.(id); return !!m && (m.live || m.m > 0.2 || !!m.tag || (!!pos && !!FC()?.sees?.(pos))); };
  offs.push(mods.on('tfg:downed', (d, g) => {
    if (g !== game || !host() || !F2() || !d?.id) return;
    const p = game.aiPlayers?.().find((q) => q.id === d.id);
    if (!onCam(d.id, p?.pos)) return;
    hypeAct('downed_live');
    record('down', d.id);
    say('{name} went down on camera. The viewers went up.', { name: nameOf(d.id) });
  }));
  offs.push(mods.on('tfg:revived', (d, g) => {
    if (g !== game || !host() || !F2() || !d?.by) return;
    const p = game.aiPlayers?.().find((q) => q.id === d.by);
    if (onCam(d.by, p?.pos) || onCam(d.id, null)) record('revive', d.by, 0, nameOf(d.id));
  }));

  // ------------------------------------------------------------------ drones: plan + visuals (every peer)
  function clearVis() {
    const v = S.vis; if (!v) return;
    for (const m of [v.body, v.lamp, ...v.beams, ...v.discs]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    S.vis = null;
  }
  function ensureDrones() {
    const out = game.world?.outdoor, r = run();
    const want = onMoon() && out?.plan?.entrance && out.terrain?.heightAt && out.group ? out : null;
    const watched = !!(r?.dailyEvent?.mm || []).includes('watched');
    if (want === S.key) return;
    S.key = want; clearVis(); S.drones = [];
    if (!want) return;
    const T = want.terrain, e = want.plan.entrance;
    S.drones = C.planDrones({ entrance: e, seed: r.seed, day: r.day, quotaIndex: r.quotaIndex, watched, first: firstDay(r) && !watched });
    S.ground = (x, z) => { try { return Math.max(T.heightAt(x, z), T.floodY ?? -1e9); } catch { return 0; } };
    const n = S.drones.length; if (!n) return;
    const bx = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
    const parts = [bx(0.55, 0.16, 0.55, 0, 0, 0), bx(1.3, 0.05, 0.08, 0, 0.05, 0).rotateY(Math.PI / 4), bx(1.3, 0.05, 0.08, 0, 0.05, 0).rotateY(-Math.PI / 4), bx(0.2, 0.14, 0.2, 0, -0.14, 0)];
    const merged = mergeBoxes(parts);
    const body = new THREE.InstancedMesh(merged, new THREE.MeshLambertMaterial({ color: 0x23262b }), n);
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.06, 0.1).translate(0, -0.23, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    body.frustumCulled = lamp.frustumCulled = false;
    for (let i = 0; i < n; i++) lamp.setColorAt(i, new THREE.Color(0xff2020));
    const beams = [], discs = [];
    for (let i = 0; i < n; i++) {
      const bm = new THREE.Mesh(new THREE.ConeGeometry(C.DRONE.R, C.DRONE.alt, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
      const dc = new THREE.Mesh(new THREE.CircleGeometry(C.DRONE.R, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
      bm.frustumCulled = dc.frustumCulled = false; bm.renderOrder = dc.renderOrder = 4;
      beams.push(bm); discs.push(dc);
    }
    want.group.add(body, lamp, ...beams, ...discs);
    S.vis = { body, lamp, beams, discs, dummy: new THREE.Object3D(), col: new THREE.Color(), lampKey: new Array(n).fill(-1) };
  }
  function mergeBoxes(list) {   // tiny local merge (4 boxes, no index juggling): non-indexed positions + normals
    const pos = [], nor = [];
    for (const g of list) { const ng = g.toNonIndexed(); pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); ng.dispose(); g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
  }
  const baitOf = (e) => (e && e[5] > 0 ? { x: e[2], z: e[3], t0: e[4], t1: e[5] } : null);
  const dronePos = (d, now) => { const e = F2()?.dr?.[d.i], g = C.dronePos(d, now, baitOf(e)); const gy = S.ground(g.x, g.z); return { x: g.x, z: g.z, gy, y: gy + C.DRONE.alt }; };
  const night = () => C.isNight(run()?.time, run()?.weather);
  function visuals() {
    const v = S.vis; if (!v) return;
    const now = hostNow(), on = night(), s = F2();
    for (const d of S.drones) {
      const e = s?.dr?.[d.i] || [0, 0, 0, 0, 0, 0, 0], st = e[0] === ST.BLIND && now >= e[1] ? ST.OK : e[0];
      const p = dronePos(d, now), dm = v.dummy, jam = C.jammed(p.x, p.y, p.z, S.jams);
      const active = on && st === ST.OK && !jam;
      if (!on) dm.position.set(p.x, -9999, p.z);
      else if (st === ST.DEAD) dm.position.set(e[2], S.ground(e[2], e[3]) + 0.2, e[3]);   // crashed where it was shot
      else dm.position.set(p.x, p.y + Math.sin(now * 1.7 + d.i) * 0.15, p.z);
      dm.rotation.set(st === ST.DEAD ? 0.6 : 0, now * 0.3 + d.i, st === ST.DEAD ? 0.4 : 0);
      dm.updateMatrix(); v.body.setMatrixAt(d.i, dm.matrix); v.lamp.setMatrixAt(d.i, dm.matrix);
      const lc = st === ST.DEAD ? 0x0c0c0c : st === ST.BLIND || jam ? 0xff9a20 : e[6] ? (Math.sin(now * 12) > 0 ? 0xff6060 : 0x500808) : (Math.sin(now * 3 + d.i) > 0 ? 0xff2020 : 0x3a0808);
      if (v.lampKey[d.i] !== lc) { v.lampKey[d.i] = lc; v.lamp.setColorAt(d.i, v.col.setHex(lc)); v.lamp.instanceColor.needsUpdate = true; }
      const bm = v.beams[d.i], dc = v.discs[d.i];
      bm.visible = dc.visible = active;
      if (active) {
        bm.position.set(p.x, p.gy + C.DRONE.alt / 2, p.z); dc.position.set(p.x, p.gy + 0.12, p.z);
        const hot = !!e[6]; bm.material.color.setHex(hot ? 0xff6a50 : 0xfff0c8); dc.material.color.setHex(hot ? 0xff6a50 : 0xfff0c8);
      }
    }
    v.body.instanceMatrix.needsUpdate = v.lamp.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ drones + jammer (host)
  function initF2() { const r = run(); if (!r) return; r.fc2 = { dr: S.drones.map(() => [0, 0, 0, 0, 0, 0, 0]), hl: null }; S.streak.clear(); S.paid.clear(); sync(); }
  function jamList() {
    const out = [], ai = game.aiPlayers?.() || [];
    for (const it of game.items?.all?.() || []) {
      if (it.type !== C.JAM.id || !it.on || !((it.battery ?? 1) > 0)) continue;
      let p = null;
      if (it.holder) { const q = ai.find((a) => a.id === it.holder); if (q) p = { x: q.pos.x, y: q.pos.y + 1, z: q.pos.z }; }
      else if (it.obj) { const w = it.obj.getWorldPosition(new V3()); p = { x: w.x, y: w.y, z: w.z }; }
      if (p) out.push(p);
    }
    return out;
  }
  function droneBait(pos, loud) {
    const s = F2(), now = game.time; if (!s || !pos || loud < C.DRONE.baitLoud || !night()) return;
    let ch = false;
    for (const d of S.drones) {
      const e = s.dr[d.i]; if (!e || e[0] === ST.DEAD || now < e[5] + C.DRONE.baitGap) continue;   // (dead drones keep their crash spot in e[2], e[3])
      const g = C.dronePos(d, now, baitOf(e)); if (Math.hypot(pos.x - g.x, pos.z - g.z) > C.DRONE.baitR) continue;
      e[2] = Math.round(pos.x * 10) / 10; e[3] = Math.round(pos.z * 10) / 10; e[4] = Math.round(now * 10) / 10; e[5] = Math.round((now + C.DRONE.bait) * 10) / 10; ch = true;
    }
    if (ch) sync();
  }
  function hostTick(dt) {
    const s = F2(), now = game.time, fc = FC();
    if (!s || !fc) return;
    // streaks: seconds ON AIR in one go
    for (const p of game.aiPlayers?.() || []) {
      const m = fc.meter(p.id), k = S.streak.get(p.id) || 0;
      if (m.live && !p.dead) S.streak.set(p.id, k + dt);
      else if (k) { if (k >= 20) record('streak', p.id, Math.round(k)); S.streak.delete(p.id); }
    }
    // jammer: blind cameras in the bubble, hum
    S.jamT -= dt;
    if (S.jamT <= 0) {
      S.jamT = 0.5; S.jams = jamList();
      if (S.jams.length) for (const c of fc.plan()) if (C.jammed(c.x, c.y, c.z, S.jams)) fc.blind(c.i, 0.8);
      S.humT -= 0.5;
      if (S.jams.length && S.humT <= 0) { S.humT = C.JAM.hum; for (const j of S.jams) { try { game.creatures?.noise?.(new V3(j.x, j.y, j.z), C.JAM.humLoud); } catch { /* creatures optional */ } } }
    }
    // drones
    if (!S.drones.length || !night() || fc.netOff?.()) { for (const e of s.dr) e[6] = 0; return; }
    const out = (game.aiPlayers?.() || []).filter((p) => !p.dead && !p.inShip && p.zone === 'out');
    let ch = false;
    for (const d of S.drones) {
      const e = s.dr[d.i]; if (!e) continue;
      if (e[0] === ST.BLIND && now >= e[1]) { e[0] = ST.OK; ch = true; }
      let see = 0;
      if (e[0] === ST.OK) {
        const p = dronePos(d, now);
        if (!C.jammed(p.x, p.y, p.z, S.jams)) for (const q of out) {
          const r = C.droneSees(p, q.pos.x, q.pos.z, !!q.crouch);
          if (!r.ok || Math.abs(q.pos.y - p.gy) > 6) continue;
          let los = true; try { los = game.physics.lineOfSight({ x: p.x, y: p.y - 0.4, z: p.z }, { x: q.pos.x, y: q.pos.y + 1.1, z: q.pos.z }, G.STATIC); } catch { /* physics optional */ }
          if (!los) continue;
          fc.expose(q.id, r.d, 'd' + d.i); see = 1;
        }
      }
      if (e[6] !== see) { e[6] = see; ch = true; }
    }
    if (ch) sync();
  }
  // a rifle tracer through a drone downs it
  offs.push(mods.on('fx', (d, from) => {
    const s = F2(); if (!host() || !s || !d || d.k !== 'cb' || d.t !== 'tr' || !Array.isArray(d.a) || !Array.isArray(d.b) || !night()) return;
    const now = game.time;
    for (const dr of S.drones) {
      const e = s.dr[dr.i]; if (!e || e[0] === ST.DEAD) continue;
      const p = dronePos(dr, now);
      if (!segNear(d.a, d.b, [p.x, p.y, p.z], C.DRONE.hitR)) continue;
      e[0] = ST.DEAD; e[6] = 0; e[2] = Math.round(p.x * 10) / 10; e[3] = Math.round(p.z * 10) / 10; e[5] = 0; FC()?.untag?.('d' + dr.i); record('drone', from); fx({ k: 'dd', i: dr.i }); sync();
    }
  }));
  function hostReq(d, from) {
    const s = F2(); if (!host() || !s || !d || d.op !== 'zap') return;
    const dr = S.drones[d.i | 0], e = dr && s.dr[dr.i], me = game.aiPlayers?.().find((q) => q.id === from);
    if (!e || !me || e[0] === ST.DEAD) return;
    const p = dronePos(dr, game.time);
    if (Math.hypot(p.x - me.pos.x, p.y - me.pos.y, p.z - me.pos.z) > 18) return;
    e[0] = ST.BLIND; e[1] = Math.round((game.time + C.DRONE.zap) * 10) / 10; e[6] = 0; fx({ k: 'dz', i: dr.i }); sync();
  }
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('fc2req', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[feedcams2] req', e); } }); }));
  function wrap(name, fn) {
    const orig = game[name]; if (typeof orig !== 'function') return;
    const own = Object.prototype.hasOwnProperty.call(game, name);
    const mine = function (...a) { try { fn.apply(this, a); } catch (e) { console.warn('[feedcams2]', name, e); } return orig.apply(this, a); };
    game[name] = mine; wraps.push([name, orig, mine, own]);
  }
  wrap('fireRanged', (it) => {
    if (!S.drones.length || it?.type !== 'taser' || !night() || !game.camera) return;
    const eye = game.camera.position, f = new V3(0, 0, -1).applyQuaternion(game.camera.quaternion), reach = it.def?.reach || 12;
    const a = [eye.x, eye.y, eye.z], b = [eye.x + f.x * reach, eye.y + f.y * reach, eye.z + f.z * reach], now = hostNow();
    const dr = S.drones.find((d) => { const p = dronePos(d, now); return segNear(a, b, [p.x, p.y, p.z], 1.3); });
    if (dr) { try { game.net.request('fc2req', { op: 'zap', i: dr.i }); } catch { /* net closing */ } }
  });

  // ------------------------------------------------------------------ jammer item (client)
  offs.push(mods.on('useItem', (it, hk, g) => {
    if (g !== game || !it || hk.handled || it.type !== C.JAM.id) return;
    hk.handled = true;
    if (!it.on && (it.battery ?? 0) <= 0) { game.sfx?.('battery_dead', 0.5); toast(t('Battery is dead. Charge it on the ship.')); return; }
    game.setItemOn(it, !it.on); game.sfx?.('flashlight_click', 0.6);
    toast(t(it.on ? 'Jammer ON' : 'Jammer OFF'));
  }));

  // ------------------------------------------------------------------ client: messages, tips, summary
  function onMsg(d) {
    if (disposed || !d) return;
    const me = game.selfId;
    if (d.k === 'say') { try { game.lore?.say?.(tf(d.s, d.v || {}), { mood: 'curious' }); } catch { /* lore optional */ } }
    else if (d.k === 'tip') { if (d.to === me && d.n > 0) { try { game.progress?.addCoins?.(d.n, 'Sponsor tip'); } catch { /* progress optional */ } } }
    else if (d.k === 'show') toast(d.n > 0 ? tf('{name} showcased the {item} live: sponsors tipped {n} Clout.', { name: nameOf(d.id), item: t(d.name || '?'), n: d.n }) : tf('{name} showcased the {item} live. The sponsors are out of budget today.', { name: nameOf(d.id), item: t(d.name || '?') }), 'good');
    else if (d.k === 'dd' || d.k === 'dz') {
      const dr = S.drones[d.i | 0]; if (!dr || !S.ground) return;
      const p = dronePos(dr, hostNow()), v = new V3(p.x, p.y, p.z);
      try { game.audio?.at?.(d.k === 'dd' ? 'hit_metal' : 'taser_zap', v, 0.9, { refDistance: 8, maxDistance: 70 }); game.particles?.burst?.(v, 'sparks', new V3(0, -1, 0), 1.2); } catch { /* fx optional */ }
      if (d.k === 'dd') toast(t('Drone down. The night feed lost an eye.'), 'good');
    }
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:fc2fx', onMsg);
    boundNet = net; net.on('msg:fc2fx', onMsg);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);
  function tip(bit) {
    let got = 0; try { got = +localStorage.getItem('tfg.fc2.tips') || 0; } catch { /* storage optional */ }
    if ((got & bit) || (S.tipNow & bit)) return; S.tipNow |= bit;
    try { localStorage.setItem('tfg.fc2.tips', String(got | bit)); } catch { /* storage optional */ }
    try { game.lore?.say?.(t(TIPS[Math.log2(bit)]), { mood: 'curious' }); } catch { /* lore optional */ }
  }
  function clientTips() {
    const p = game.player; if (!p || p.dead || p.inShip || !onMoon()) return;
    const fc = FC();
    if (p.indoor && fc?.plan?.().length) {
      const it = p.heldItem?.();
      if (it && it.value >= C.SHOW.min && isSellable(it.def)) tip(1);
    } else if (!p.indoor && S.drones.length && night()) {
      const now = hostNow();
      if (S.drones.some((d) => { const g = C.dronePos(d, now); return Math.hypot(g.x - p.pos.x, g.z - p.pos.z) < 40; })) tip(2);
    }
  }
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    if (ph === 'takeoff') S.sumHl = F2()?.hl || null;
    if (ph === 'moon') S.sumHl = null;
    if (ph === 'orbit' && host() && run()?.fc2) { run().fc2 = null; sync(); }
  }));
  offs.push(mods.on('daySummary', (d, extra, g) => {
    if (g !== game || d.company) return;
    const h = S.sumHl || F2()?.hl; if (!h || !HL_TEXT[h[0]]) return;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    extra.push(`<b>${esc(t('HIGHLIGHT'))}</b> ${esc(tf(HL_TEXT[h[0]], { name: h[1], v: h[2], x: t(h[3] || '') }))}`);
  }));

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      ensureDrones();
      if (host() && onMoon() && game.run?.fc && (!F2() || F2().dr.length !== S.drones.length)) initF2();
      if (!host()) { S.jamT -= dt; if (S.jamT <= 0) { S.jamT = 0.5; S.jams = jamList(); } }
      if (S.vis) visuals();
      if (host() && onMoon()) { S.tick += dt; if (S.tick >= 0.1) { const d = S.tick; S.tick = 0; hostTick(d); } }
      S.tipT -= dt; if (S.tipT <= 0) { S.tipT = 0.5; clientTips(); }
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[feedcams2] update', e); } }
  }));

  return {
    state: S, drones: () => S.drones, hostTick, hostReq, record, jamList,
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const [name, orig, mine, own] of wraps.reverse()) { if (game[name] === mine) { if (own) game[name] = orig; else delete game[name]; } }
      clearVis();
      try { boundNet?.off?.('msg:fc2fx', onMsg); } catch { /* ignore */ }
    },
  };
}
