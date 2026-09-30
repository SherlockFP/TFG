// FIRST SIGHTING (wave 8 morning review task 2, docs/wave8/firstsight.md). Module `firstSight`, net type 'fsight'. Host-authoritative.
//   HOST   once per landing, when the moon's threat pool (threatpool.js) holds a creature this run has not met yet (run.fsSeen), in a calm
//          moment (director not at a peak, nothing hunting within 40 m of the crew, the one budget gate crdirector.canSpawn(type, pos,
//          'firstsight') says yes) and a crewmate has been in that creature's zone for a few seconds: the creature is placed 6-10 m ahead in
//          that crewmate's view cone (end of a corridor, across a room, a ridge outdoors), side-on. Its AI stays frozen for the whole beat
//          (stunT: CreatureManager skips the behaviour), it turns to stare (state 'stare'), holds 2-4 s (seeded per run), walks off round a
//          corner and is removed. It never attacks: a crewmate walking up to it (5 m), hurting it, a peak or a chase ends the beat at once.
//   CLIENT every player near it (34 m): lights dip + dust as it appears, its signature tell sound + eyes + stare pose (creature_read), a short
//          bodycam autofocus zoom while it is in view (off with settings.reduceMotion), then the first-encounter rule caption through the
//          director's one caption gate (crdirector.teach -> onboard.fr slot / lease -> lore.say).
// Messages (host -> all): fsight {k:'in', id, ty, p:[x,y,z], at, h} | {k:'out', id, p, why}. Knob: game.config.firstSight = false switches it off.
import * as THREE from 'three';
import { RNG, hashString } from '../core/rng.js';
import { CREATURES } from './creatures.js';
import { MOONS } from './moons.js';
import * as K from './crdirector_core.js';
import * as F from './firstsight_core.js';
import { cloneMat } from '../models/modelkit.js';

export function installFirstSight(game) {
  const mods = game.mods, FS = F.FS;
  const offs = [];
  let disposed = false, boundNet = null;
  const H = { key: null, done: false, inT: new Map(), beat: null, searchT: 0, metT: 0, tries: 0, stats: { staged: 0, left: 0, abort: 0, blink: 0, vetoed: 0, retried: 0 } };
  const C = { b: null, zoom: 1, losT: 0, los: false, lift: null };
  const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();

  const enabled = () => game.config?.firstSight !== false && game.config?.crdirector !== false;
  const run = () => game.run;
  const onMoon = () => { const r = run(); const m = r && MOONS[r.moon]; return !!m && r.phase === 'moon' && !m.company && !m.home; };
  const send = (d) => { try { game.net.broadcast('fsight', d); } catch { /* net closing */ } };
  const zoneOf = (id) => (CREATURES[id]?.zone === 'out' ? 'out' : 'in');
  const los = (a, x, y, z) => { V2.set(x, y, z); try { return !!game.physics?.lineOfSight?.(a, V2); } catch { return false; } };
  const seenList = () => (Array.isArray(run()?.fsSeen) ? run().fsSeen : []);
  function markSeen(type) {
    const r = run(); if (!r || seenList().includes(type)) return;
    r.fsSeen = [...seenList(), type].slice(-24);   // new array: the run diff sync sees it (co-op, host migration, save)
  }
  function defOk(id) {
    const d = CREATURES[id];
    if (!d || d.hazard || d.boss) return false;
    let n = 0; for (const c of game.creatures.host.values()) if (c.type === id && !c.dead) n++;
    return n < (d.maxAlive || 99);
  }

  // ================================================================== HOST
  /** a hunting creature near any crewmate (a chase is on) */
  function chaseOn(crew) {
    for (const c of game.creatures.host.values()) {
      if (c.dead || c.data?.fs || !K.isCounted(c.type, c.def) || !K.isHunting(c.state)) continue;
      for (const p of crew) if (Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < FS.chaseR) return true;
    }
    return false;
  }
  function spotFor(p, rnd, type) {
    const out = p.zone === 'out', fac = game.world?.facility, ter = game.world?.terrain;
    let ground;
    if (out) {
      if (!ter?.heightAt) return null;
      const lim = (ter.playHalf ?? 130) - 4;
      ground = (x, z) => (Math.abs(x) > lim || Math.abs(z) > lim || Math.hypot(x, z) < 12 || ter.blocked?.(x, z) ? null : ter.heightAt(x, z));
    } else {
      const nav = fac?.nav;
      if (!nav || Math.abs(p.pos.y - nav.y) > 2.5) return null;   // another floor / a ledge: the nav grid is one layer
      ground = (x, z) => (nav.walkableAt(x, z) ? nav.y : null);
    }
    const em = out ? null : (fac.emitters || []).filter((e) => e.pos && e.pos.distanceToSquared(p.pos) < 32 * 32);
    const d = CREATURES[type], dPref = d ? F.distFor(d.height || 1.6, Math.max(2 * (d.radius || 0.4), 0.5)) : undefined;   // the real body width, not the zoom's assumed one
    return F.findSpot({
      dPref, eye: p.eye, look: p.look, feetY: p.pos.y, out, ground, rnd,
      los: (x, y, z) => los(p.eye, x, y, z),
      lit: em ? (x, z) => { let k = 0; for (const e of em) { const r = 0.7 * (e.distance || 8), d = Math.hypot(e.pos.x - x, e.pos.z - z); if (d < r) k = Math.max(k, Math.min(1, e.intensity ?? 1) * (1 - d / r)); } return k; } : null,
    });
  }
  /** where it walks off to: a floor cell out of the crewmate's view (round a corner) reachable in a short path; outdoors: straight away */
  function leaveFor(spot, p, rng) {
    if (p.zone === 'out') {
      const dx = spot.x - p.pos.x, dz = spot.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
      return { x: spot.x + (dx / l) * 10, z: spot.z + (dz / l) * 10 };
    }
    const nav = game.world?.facility?.nav; if (!nav) return null;
    let best = null;
    for (let i = 0; i < 16; i++) {
      const q = nav.randomWalkable(() => rng.float(0, 1), spot.x, spot.z, FS.leaveR);
      if (!q || Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < spot.d - 0.5 || los(p.eye, q.x, nav.y + 1.2, q.z)) continue;   // never back toward the crewmate
      const path = nav.findPath(spot.x, spot.z, q.x, q.z, 4000);
      if (!path?.length) continue;
      let len = 0, px = spot.x, pz = spot.z;
      for (const w of path) { len += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; }
      if (len <= FS.leaveLen && (!best || len < best.len)) best = { x: q.x, z: q.z, len };
    }
    return best;
  }
  function start(type, p, spot, rng) {
    const pos = new THREE.Vector3(spot.x, spot.y, spot.z);
    if (game.crdirector?.canSpawn && !game.crdirector.canSpawn(type, pos, 'firstsight')) { H.stats.vetoed++; return false; }   // the one threat budget
    const M = game.creatures, id = 'c' + (M.nextId++);
    const hold = F.holdFor(rng.float(0, 1));
    const face = F.yawTo(spot.x, spot.z, p.eye.x, p.eye.z), side = face + (rng.chance(0.5) ? 1 : -1) * Math.PI / 2;
    send({ k: 'in', id, ty: type, p: [+spot.x.toFixed(2), +spot.y.toFixed(2), +spot.z.toFixed(2)], at: FS.stareAt, h: +hold.toFixed(2) });   // before the spawn: no client captions it early
    const c = M.hostSpawn(type, pos, { id, level: game.rollLevel?.() || 1, elite: false, zone: p.zone, state: 'idle', variant: null, affix: null, yaw: side, data: { fs: 1 } });
    if (!c) { send({ k: 'out', id, p: null, why: 'fail' }); return false; }
    c.stunT = 1e4;   // CreatureManager.hostUpdate skips the behaviour of a stunned creature: no chase, no attack for the whole beat
    H.beat = { id, type, t: 0, goT: 0, hold, side, target: p.id, zone: p.zone, leave: leaveFor(spot, p, rng), losT: 0, seen: true, went: false };
    markSeen(type); H.done = true; H.stats.staged++;
    try { mods?.emit?.('firstsight', { kind: 'start', type, id, zone: p.zone }, game); } catch { /* mods optional */ }
    return true;
  }
  function end(why) {
    const b = H.beat; H.beat = null;
    if (!b) return;
    const c = game.creatures.host.get(b.id);
    const p = c ? [+c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2)] : null;
    if (c) game.creatures.hostRemove(b.id);
    send({ k: 'out', id: b.id, p, why });
    H.stats[why] = (H.stats[why] || 0) + 1;
    if (why === 'abort' && b.t < FS.stareAt && !b.hurt && H.tries < FS.retries && onMoon()) {   // nothing was seen yet (peak / crowd): not a met creature, try again a bit later
      H.tries++; H.stats.retried++; H.done = false; H.searchT = 4;
      const r = run(); if (r) r.fsSeen = seenList().filter((x) => x !== b.type);
    }
    try { mods?.emit?.('firstsight', { kind: 'end', type: b.type, why }, game); } catch { /* mods optional */ }
  }
  function beatTick(dt, crew) {
    const b = H.beat, M = game.creatures, c = M.host.get(b.id);
    if (!c || c.dead) { end('abort'); return; }
    b.t += dt; c.stunT = 1e4;
    const close = b.t >= FS.nearFrom && crew.some((p) => p.zone === b.zone && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < FS.near);   // frozen until then: a walker still gets the tell
    b.hurt = !!(c.maxHp && c.hp < c.maxHp);
    if (close || b.hurt || game.crdirector?.peakNow?.()) { end('abort'); return; }
    const ph = F.beatPhase(b.t, b.hold);
    if (ph === 'in') { c.yaw = b.side; return; }
    if (ph === 'stare') {
      if (c.state !== 'stare') c.setState('stare');
      const tp = crew.find((p) => p.id === b.target) || crew[0];
      if (tp) { const want = F.yawTo(c.pos.x, c.pos.z, tp.eye.x, tp.eye.z); c.yaw += Math.max(-FS.turnRate * dt, Math.min(FS.turnRate * dt, F.angDiff(want, c.yaw))); }
      return;
    }
    if (!b.went) {
      b.went = true;
      if (!b.leave) { end('blink'); return; }   // no hidden cell close by: it is gone in a flicker
      c.setState('walk'); M.goTo(c, b.leave.x, b.leave.z);
    }
    b.goT += dt; b.losT -= dt;
    const arrived = M.follow(c, dt, (c.def?.walk || 1.6) * 1.15);
    if (b.losT <= 0) {
      b.losT = 0.25; V1.set(c.pos.x, c.pos.y + 1.2, c.pos.z);
      b.seen = crew.some((p) => p.zone === b.zone && p.pos.distanceTo(c.pos) < 45 && los(p.eye, V1.x, V1.y, V1.z));
    }
    if (arrived || b.goT > FS.leaveMax || (b.goT > 0.6 && !b.seen)) end('left');
  }
  function hostTick(dt) {
    const r = run();
    if (!enabled() || !onMoon() || !game.hostData) { if (H.beat) end('abort'); H.key = null; return; }
    const key = `${r.runId ?? r.seed ?? ''}|${r.day | 0}|${r.moon}`;
    if (key !== H.key) { H.key = key; H.done = false; H.inT.clear(); H.beat = null; H.searchT = 1; H.metT = 0; H.tries = 0; }
    const crew = (game.aiPlayers?.() || []).filter((p) => !p.dead && !p.inShip);
    const ids = new Set();
    for (const p of crew) {
      ids.add(p.id); const e = H.inT.get(p.id);
      if (!e || e.z !== p.zone) H.inT.set(p.id, { z: p.zone, t: 0, x: p.pos.x, zz: p.pos.z, v: 0 });
      else { e.t += dt; e.v += (Math.hypot(p.pos.x - e.x, p.pos.z - e.zz) / Math.max(dt, 1e-3) - e.v) * Math.min(1, dt * 4); e.x = p.pos.x; e.zz = p.pos.z; }   // smoothed horizontal speed
    }
    for (const id of H.inT.keys()) if (!ids.has(id)) H.inT.delete(id);
    if (H.beat) { beatTick(dt, crew); return; }
    if (H.done) return;
    const pool = game.crdirector?.pool?.();
    if (!pool) { H.done = true; return; }
    H.metT -= dt;
    if (H.metT <= 0) {   // met in passing: a pool creature near a crewmate needs no staged introduction later
      H.metT = 1;
      for (const c of game.creatures.host.values()) {
        if (c.dead || c.data?.fs || !pool.all.includes(c.type) || seenList().includes(c.type)) continue;
        if (crew.some((p) => p.zone === c.zone && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < FS.metR)) markSeen(c.type);
      }
      if (F.poolDone(pool, seenList(), defOk)) { H.done = true; return; }
    }
    H.searchT -= dt;
    if (H.searchT > 0) return;
    H.searchT = FS.searchGap;
    if (game.crdirector?.phase?.() === 'peak' || game.crdirector?.peakNow?.() || chaseOn(crew)) return;
    const ready = crew.filter((p) => (H.inT.get(p.id)?.t || 0) >= FS.inDelay && (H.inT.get(p.id)?.v || 0) < FS.walkMax).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const type = F.pickType(pool, seenList(), (id) => ready.some((p) => p.zone === zoneOf(id)), defOk);
    if (!type) return;
    const rng = new RNG(hashString(`firstsight:${r.runId ?? r.seed ?? ''}:${type}`));   // deterministic per run + creature
    for (const p of ready) {
      if (p.zone !== zoneOf(type)) continue;
      const spot = spotFor(p, () => rng.float(0, 1), type);
      if (spot && start(type, p, spot, rng)) return;
    }
  }

  // ================================================================== CLIENT
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:fsight', onMsg);
    boundNet = net; net.on('msg:fsight', onMsg);
  }
  const localOk = () => onMoon() && !!game.player && !game.player.dead && !game.player.inShip;
  const nearMe = (p) => !!p && localOk() && Math.hypot(game.player.pos.x - p[0], game.player.pos.z - p[2]) < FS.nearbyR && Math.abs(game.player.pos.y - p[1]) < 8;
  function dust(p) { try { game.particles?.burst(new THREE.Vector3(p[0], p[1] + 0.9, p[2]), 'dust', null, 1.4); } catch { /* particles optional */ } }
  function onMsg(m, from) {
    if (disposed || !m || typeof m.k !== 'string') return;
    if (from !== game.selfId && from !== game.net?.hostId) return;   // host-authoritative
    if (m.k === 'in' && typeof m.id === 'string' && Array.isArray(m.p)) {
      C.b = { id: m.id, ty: String(m.ty), p: m.p, t: 0, at: +m.at || FS.stareAt, h: +m.h || 3, stared: false, taught: false };
      game.crdirector?.stage?.(m.id);   // the director's scan leaves this body alone: the beat plays its own tell + caption
      if (nearMe(m.p)) { game.crdirector?.dip?.(0.9, 9); game.crdirector?.dip?.(0.9, 8, { x: m.p[0], y: m.p[1], z: m.p[2] }); dust(m.p); }
    } else if (m.k === 'out' && C.b && C.b.id === m.id) {
      const b = C.b; C.b = null; liftOff();
      game.crdirector?.stage?.(null);
      if (m.p && nearMe(m.p)) { dust(m.p); if (m.why === 'blink') game.crdirector?.dip?.(0.8, 8, { x: m.p[0], y: m.p[1], z: m.p[2] }); }
      if (b.stared && !b.taught && nearMe(b.p)) game.crdirector?.teach?.(b.ty, b.id);
    }
  }
  function tell(b) {
    const tl = K.tellOf(b.ty), pos = { x: b.p[0], y: b.p[1] + 1, z: b.p[2] };
    game.crdirector?.cue?.(tl.s, { pos, volume: Math.min(1, tl.v * 1.5), pitch: tl.p, refDistance: 6, maxDistance: 50 });
    game.crdirector?.cue?.(['sting_piano', 'sting_synth'], { volume: 0.3, pitch: 0.6, bus: 'music' });
    if (tl.fx === 'flicker') game.crdirector?.dip?.(0.7, 8, pos);
  }
  /** autofocus target while the stare is on and the body is in view */
  function zoomWant(b, dt) {
    if (game.settings?.reduceMotion || !localOk()) return 1;
    const v = game.creatures?.views?.get(b.id), cam = game.camera;
    if (!v || v.hidden || !cam) return 1;
    const h = v.height || v.model?.height || v.def?.height || 1.6, rad = v.radius || v.model?.radius || v.def?.radius || 0.4;
    V1.set(v.pos.x, v.pos.y + h * 0.5, v.pos.z);
    C.losT -= dt;
    if (C.losT <= 0) { C.losT = 0.25; C.los = los(cam.position, V1.x, V1.y, V1.z); }
    if (!C.los) return 1;
    V2.copy(V1).project(cam);
    if (V2.z > 1 || V2.z < -1) return 1;
    const z0 = cam.zoom || 1, ndc = Math.max(Math.abs(V2.x), Math.abs(V2.y)) / z0;   // offset at zoom 1
    if (ndc > 0.75) return 1;
    return F.zoomFor(cam.position.distanceTo(V1), h, Math.max(2 * rad, 0.45 * h), cam.fov, cam.aspect, ndc);
  }
  /** the 'practical': a warm emissive lift on the staged body (no light) so it reads as a lit silhouette, not two eyes. The model calls
   *  setHitFlash every frame (it rewrites emissive), so the lift wraps it and is added on top; restored when the beat ends. */
  function liftOn(v, b) {
    if (C.lift || !v?.model || !v.root) return;
    const mats = new Set(), swap = [], cache = new Map();   // swap: [mesh, original material(s), own material(s)]: cached modelkit lam() materials are SHARED between instances, so the body gets its own before the lift touches emissive
    const mine = (m) => { if (!m?.emissive || m.isMeshBasicMaterial) return m; if (m.userData?.instance) { mats.add(m); return m; } let c = cache.get(m); if (!c) { c = cloneMat(m); cache.set(m, c); mats.add(c); } return c; };
    v.root.traverse((o) => {
      if (!o.isMesh || o.userData?.tell) return;
      const before = o.material, after = Array.isArray(before) ? before.map(mine) : mine(before);
      if (Array.isArray(before) ? after.some((m, i) => m !== before[i]) : after !== before) { o.material = after; swap.push([o, before, after]); }
    });
    const orig = v.model.setHitFlash, L = { v, swap, mats: [...mats], base: [...mats].map((m) => m.emissive.clone()), orig, own: Object.prototype.hasOwnProperty.call(v.model, 'setHitFlash'), k: 0 };
    v.model.setHitFlash = function (f) {   // damage ends the beat, so the flash colour is not needed while the lift is on
      orig?.call(this, f);
      L.mats.forEach((m, i) => m.emissive.setRGB(L.base[i].r + FS.lift[0] * L.k, L.base[i].g + FS.lift[1] * L.k, L.base[i].b + FS.lift[2] * L.k));
    };
    C.lift = L; b.lifted = true;
  }
  function liftOff() {
    const L = C.lift; C.lift = null;
    if (!L) return;
    if (L.own) L.v.model.setHitFlash = L.orig; else delete L.v.model.setHitFlash;
    L.mats.forEach((m, i) => m.emissive.copy(L.base[i]));
    for (const [o, before, after] of L.swap) {   // back to the shared materials (unless the Tinter has adopted the clones since: then they stay)
      if (o.material !== after) continue;
      o.material = before;
      for (const m of [].concat(after)) if (!([].concat(before)).includes(m)) m.dispose?.();
    }
  }
  function setZoom(z) {
    const cam = game.camera; if (!cam) return;
    C.zoom = z;
    if (cam.zoom !== z) { cam.zoom = z; cam.updateProjectionMatrix(); }
    const vm = game.viewModel?.root;   // the hands / held item hang off the camera: squash them so they keep their size on screen
    if (vm) vm.scale.set(1 / z, 1 / z, 1);
  }
  function clientUpdate(dt) {
    const b = C.b;
    let want = 1;
    if (b) {
      b.t += dt;
      const near = nearMe(b.p);
      if (!b.lifted && near) { const v = game.creatures?.views?.get(b.id); if (v) liftOn(v, b); }
      if (C.lift) C.lift.k = Math.min(1, b.t / 0.6);
      if (!b.stared && b.t >= b.at) { b.stared = true; if (near) tell(b); }
      if (b.stared && !b.taught && b.t >= b.at + b.h) { b.taught = true; if (near) game.crdirector?.teach?.(b.ty, b.id); }   // the rule line follows the beat
      if (b.stared && b.t < b.at + b.h + 0.3 && near) want = zoomWant(b, dt);
    }
    if (want === 1 && C.zoom === 1) return;
    let z = C.zoom + (want - C.zoom) * Math.min(1, dt * (want > C.zoom ? 2.4 : 3.6));
    if (want === 1 && Math.abs(z - 1) < 0.01) z = 1;
    setZoom(z);
  }

  // ================================================================== wiring
  if (mods?.on) {
    offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
    offs.push(mods.on('update', (dt, g) => {
      if (g !== game || disposed) return;
      bindNet(game.net);
      if (game.isHost) { try { hostTick(dt); } catch (e) { console.warn('[firstsight] host', e); } }
      try { clientUpdate(dt); } catch (e) { console.warn('[firstsight] client', e); }
    }));
    offs.push(mods.on('phase', (ph, g) => { if (g === game && ph !== 'moon') { H.beat = null; H.key = null; if (C.b) game.crdirector?.stage?.(null); C.b = null; liftOff(); if (C.zoom !== 1) setZoom(1); } }));
  }
  if (game.net) bindNet(game.net);

  return {
    /** host: best spot for crewmate `id` (default: me) right now, or null. Harness / debug. */
    probe(id = game.selfId, type) { const p = game.aiPlayerById?.(id); return p ? spotFor(p, () => 0.5, type) : null; },
    /** the beat running now (host: full state, client: what the host announced) */
    beat() { const b = H.beat || C.b; return b ? { id: b.id, type: b.type || b.ty, t: +b.t.toFixed(2), hold: b.hold || b.h, phase: H.beat ? F.beatPhase(b.t, b.hold) : (b.stared ? 'stare' : 'in') } : null; },
    zoom() { return C.zoom; },
    /** identify.js: hold the '??? UNKNOWN ENTITY' aim label while the staged body is younger than FS.labelAfter (2 s) */
    labelHold(id) { return !!C.b && C.b.id === id && C.b.t < FS.labelAfter; },
    seen() { return seenList().slice(); },
    debug() { return { key: H.key, done: H.done, beat: this.beat(), stats: { ...H.stats }, seen: seenList().slice(), zoom: +C.zoom.toFixed(2) }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (H.beat && game.isHost) { try { end('abort'); } catch { /* shutting down */ } }
      for (const o of offs) { try { o(); } catch { /* ignore */ } }
      boundNet?.off?.('msg:fsight', onMsg); boundNet = null; liftOff();
      if (C.zoom !== 1) setZoom(1);
      C.b = null;
    },
  };
}
