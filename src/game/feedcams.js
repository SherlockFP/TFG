// FEEDCAMS (wave 8, module 'feedcams'; docs/wave8/feedcams.md): the Algorithm's camera network is physical. "DODGE THE CAMERA / CUT THE FEED".
//   Cameras (wall + ceiling, 1-10 per facility, layout in feedcams_core.planCams, rebuilt identically on every peer) sweep a readable cone on the floor.
//   Seen for ~3 s = ON AIR: viewers up (algo1 bump), heat up (lures / a faster creature wave), scrap carried into the ship while ON AIR pays a 25 % VIEWER TAX.
//   Counter-play: blind spots (under the camera, behind walls / doors / props), spray the lens (40 s), melee / shoot it (dead), Zap Gun (25 s),
//   a loud noise turns a camera toward it for 5 s (bait), the CUT THE FEED job (facjobs) blacks the network out for 150 s, a mapart pylon too.
// Net (prefix 'fc'): 'fcreq' client -> host {op:'hit'|'zap'|'cut', i}; 'fcfx' host -> everyone (HOST_ONLY) {k:'live'|'juke'|'tax'|'sale'|'smash'|'zap'|'spray'|'cut'|'untag'|'say', ...}.
// feedcams2 (wave 8 pass 2): TAGGED trips (going live tags you until you reach the ship; kill the camera that tagged you to clear it), sprint draws the eye,
//   junction-box cable cut, Watched affix = +2 cameras, host API for drones / Lantern Keeper / Follower / jammer (expose, sees, blind), host mods event 'feedcams'.
// State = game.run.fc (host-authoritative, synced with broadcastRun(['fc'])): { ck host clock, c: [[st, until, baitH, baitT0, baitT1, seeing]...],
//   p: { playerId: [meter %, live, tagged] }, h heat, tx tax (this day), tn taxed items, lv times live, as seconds on air, off network-dark-until }; run.fcTax = tax since the last sale.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t, tf } from '../core/i18n.js';
import { HOST_ONLY } from '../net/session.js';
import { isSellable } from './items.js';
import { MOONS } from './moons.js';
import { insideShip } from '../world/ship.js';
import { G } from '../physics/physics.js';
import * as K from './feedcams_core.js';
import './feedcams_i18n.js';
import './feedcams2_i18n.js';

HOST_ONLY.add('fcfx');
const { FC, ST } = K;
const TIPS = [
  'That red light is a camera. The cone on the floor is what it sees. Stay out of it, or you go live.',
  'Camera lock. You have three seconds before the stream goes live. Break line of sight.',
  'You are ON AIR. Scrap you carry to the ship now pays a viewer tax. Cut the feed, smash a lens or spray it.',
  'Blind spot: right under a camera, behind walls, doors and crates. Hug the wall and slip past.',
  'That grey box on the wall feeds a camera. Cut its cable and the camera dies quietly.',
];
const CSS = `#fc-vig{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .18s;box-shadow:inset 0 0 120px 30px rgba(255,20,20,.75)}
.algo-live.fc-onair{color:#ff4040!important;animation:fcb .7s steps(2) infinite}.algo-live.fc-onair::after,.algo-live.fc-tag::after{content:' | ' attr(data-fc)}.algo-live.fc-tag{color:#ff9a40!important}@keyframes fcb{50%{opacity:.45}}`;

export function installFeedcams(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [], V3 = THREE.Vector3;
  let disposed = false, boundNet = null, tickT = 0, sendT = 0, itemT = 0, tipT = 0, vigT = 0, lastFp = '';
  const S = { fac: null, plan: [], vis: null, off: 0, ck: -1, mt: new Map(), mark: new Map(), ext: new Map(), fjBait: 0, hp: [], pingAt: 0, waveAt: 0, jukeAt: -99, baitAt: [], noiseCm: null, noiseOrig: null, said: 0, sum: null, vig: null, style: null, taxT: 0, taxSum: 0 };
  const run = () => game.run, fc = () => game.run?.fc || null, host = () => !!game.isHost;
  const toast = (s, k = 'info') => { try { game.ui?.toast?.(s, k); } catch { /* ui optional */ } };
  const fx = (d) => { try { game.net.broadcast('fcfx', d); } catch { /* net closing */ } };
  const snd = (n, pos, v = 0.7) => { try { pos ? game.audio?.at?.(n, pos, v, { refDistance: 6, maxDistance: 50 }) : game.sfx?.(n, v); } catch { /* audio optional */ } };
  const posOf = (id) => (id === game.selfId ? game.player?.pos : game.remotes?.get(id)?.pos);
  const netOff = () => { const F = fc(); return !!((F && game.time < (F.off || 0)) || game.mapart?.offStream?.()); };
  const camPos = (c) => new V3(c.x, c.y, c.z);
  const stOf = (i) => (fc()?.c?.[i]?.[0]) | 0;
  const emit = (ev) => { try { mods.emit('feedcams', ev, game); } catch (e) { console.warn('[feedcams] emit', e); } };   // host-side hook for feedcams2 / other modules

  // ------------------------------------------------------------------ build (every peer): plan + instanced meshes + floor cones
  function clearVis() {
    const v = S.vis; if (!v) return;
    for (const m of [v.body, v.lamp, v.env, v.cone, v.jb]) { if (!m) continue; m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
    S.vis = null;
  }
  function build(F) {
    clearVis(); S.plan = []; S.hp = [];
    const r = run(), L = F?.layout;
    if (!L || !r) return;
    const watched = (r.dailyEvent?.mm || []).includes('watched');   // mapmods 'Watched' affix: the Algorithm streams this floor (+2 cameras)
    S.plan = K.planCams(L, { seed: r.seed, day: r.day, quotaIndex: r.quotaIndex, size: L.size, extra: watched ? 2 : 0 });
    const n = S.plan.length; if (!n) return;
    const box = (sx, sy, sz, x, y, z, col) => {
      const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z);
      const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
    };
    const geo = mergeGeometries([box(0.5, 0.24, 0.26, 0, 0, 0, 0x2b2f36), box(0.07, 0.15, 0.15, 0.28, 0, 0, 0x0a1218), box(0.08, 0.3, 0.08, -0.24, 0.16, 0, 0x1a1c20)]);
    const body = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.06, 0.08).translate(-0.02, 0.15, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    body.frustumCulled = lamp.frustumCulled = false;
    lamp.setColorAt(0, new THREE.Color(0xff2020));
    // footprints: the sweep envelope, clipped by walls (static rays once). tab[i] = { a0, step, d[] }
    const STEP = 0.1, floorY = L.y + 0.05, envP = [], envC = [], tabs = [];
    const o = new V3(), dir = new V3();
    for (const c of S.plan) {
      const a0 = c.h - c.amp - c.fov / 2, a1 = c.h + c.amp + c.fov / 2, N = Math.ceil((a1 - a0) / STEP), d = [];
      for (let k = 0; k <= N; k++) {
        const a = a0 + k * STEP, ca = Math.cos(a), sa = Math.sin(a), off = c.kind === 'wall' ? 0.5 : 0;
        o.set(c.x + Math.cos(c.h) * off, L.y + 1.0, c.z + Math.sin(c.h) * off); dir.set(ca, 0, sa);
        let hit = null; try { hit = game.physics.raycast(o, dir, c.R - off, G.STATIC); } catch { /* physics not ready: open cone */ }
        d.push(Math.max(c.r0 + 0.2, (hit ? hit.distance : c.R - off) + off));
      }
      tabs.push({ a0, step: STEP, d });
      for (let k = 0; k < N; k++) {
        const P = (kk, rr) => { const a = a0 + kk * STEP; return [c.x + Math.cos(a) * rr, floorY, c.z + Math.sin(a) * rr]; };
        const i0 = P(k, c.r0), o0 = P(k, d[k]), i1 = P(k + 1, c.r0), o1 = P(k + 1, d[k + 1]);
        envP.push(...i0, ...o0, ...i1, ...i1, ...o0, ...o1);
        for (let q = 0; q < 6; q++) envC.push(1, 0.18, 0.12, (q === 0 || q === 2 || q === 3) ? 0.11 : 0.03);
      }
    }
    const mkMesh = (pos, col, n4) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
      m.frustumCulled = false; m.renderOrder = 4; void n4; return m;
    };
    const M = 8, coneP = new Float32Array(n * M * 18), coneC = new Float32Array(n * M * 24);
    const env = mkMesh(envP, envC), cone = mkMesh(coneP, coneC);
    cone.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); cone.geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
    // junction boxes + cables (static, one merged mesh): the quiet way to kill a camera ([E] on the box)
    const jbg = [];
    for (const c of S.plan) {
      jbg.push(box(0.3, 0.4, 0.3, c.jb.x, c.jb.y, c.jb.z, 0x4a4f44), box(0.08, 0.06, 0.08, c.jb.x, c.jb.y + 0.12, c.jb.z, 0xd8b030));
      const P = c.jb.path;
      for (let k = 0; k + 1 < P.length; k++) {
        const a = P[k], b = P[k + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (len < 0.05) continue;
        const g = box(0.035, len, 0.035, 0, 0, 0, 0x151515), q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
        g.applyQuaternion(q); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); jbg.push(g);
      }
    }
    const jb = new THREE.Mesh(mergeGeometries(jbg), new THREE.MeshLambertMaterial({ vertexColors: true }));
    for (const g of jbg) g.dispose();
    F.group.add(body, lamp, env, cone, jb);
    S.vis = { jb, body, lamp, env, cone, tabs, M, lampKey: new Array(n).fill(''), coneOn: new Array(n).fill(true), floorY, dummy: new THREE.Object3D(), col: new THREE.Color() };
  }
  function ensure() {
    const F = game.world?.facility, r = run();
    const want = r?.phase === 'moon' && F && MOONS[r.moon] && !MOONS[r.moon].company ? F : null;
    if (want === S.fac) return;
    S.fac = want;
    if (!want) { clearVis(); S.plan = []; return; }
    try { build(want); } catch (e) { console.warn('[feedcams] build', e); clearVis(); S.plan = []; }
  }

  // ------------------------------------------------------------------ per-frame visuals (every peer)
  const lampColor = (st, seeing, off, phase) => {
    if (st === ST.DEAD || st === ST.CUT) return 0x0c0c0c;
    if (st === ST.BLIND) return 0xff9a20;
    if (off) return Math.sin(phase * 2) > 0 ? 0x2a7a3a : 0x0c1a10;
    if (seeing) return Math.sin(phase * 12) > 0 ? 0xff6060 : 0x500808;
    return Math.sin(phase * 3) > 0 ? 0xff2020 : 0x3a0808;
  };
  function visuals(dt) {
    const v = S.vis, F = fc(); if (!v || !S.plan.length) return;
    const tH = game.time + S.off, off = netOff(), pp = game.player?.pos;
    const cp = v.cone.geometry.attributes.position, cc = v.cone.geometry.attributes.color;
    const per = v.M * 18, perC = v.M * 24;
    let dirty = false;
    for (const c of S.plan) {
      const e = F?.c?.[c.i] || [0, 0, 0, 0, 0, 0], st = e[0] === ST.BLIND && game.time + S.off >= e[1] ? 0 : e[0];
      const near = !pp || Math.hypot(pp.x - c.x, pp.z - c.z) < 60;
      const active = st === ST.OK && !off;
      const bait = e[4] > 0 && tH <= e[4] + 0.7 ? { h: e[2], t0: e[3], t1: e[4] } : null;
      const yaw = K.camYaw(c, tH, bait);
      // body
      const d = v.dummy;
      d.position.set(c.x, c.y, c.z); d.rotation.set(0, -yaw, active || st === ST.BLIND ? -0.35 : -1.15, 'YZX');
      d.updateMatrix(); v.body.setMatrixAt(c.i, d.matrix); v.lamp.setMatrixAt(c.i, d.matrix);
      const lc = lampColor(st, e[5], off && st === ST.OK, tH + c.i);
      if (v.lampKey[c.i] !== lc) { v.lampKey[c.i] = lc; v.lamp.setColorAt(c.i, v.col.setHex(lc)); v.lamp.instanceColor.needsUpdate = true; }
      // cone
      const o = c.i * per, oc = c.i * perC;
      if (!active || !near) {
        if (v.coneOn[c.i]) { cp.array.fill(0, o, o + per); cc.array.fill(0, oc, oc + perC); v.coneOn[c.i] = false; dirty = true; }
        continue;
      }
      v.coneOn[c.i] = true; dirty = true;
      const tab = v.tabs[c.i], A = e[5] ? 0.5 : 0.24;
      const distAt = (a) => { const f = Math.max(0, Math.min(tab.d.length - 1.001, (a - tab.a0) / tab.step)), i0 = f | 0; return tab.d[i0] + (tab.d[i0 + 1] - tab.d[i0]) * (f - i0); };
      let w = 0, wc = 0;
      const gg = e[5] ? 0.12 : 0.28, bb = e[5] ? 0.1 : 0.12;
      const vert = (a, r, al) => { cp.array[o + w++] = c.x + Math.cos(a) * r; cp.array[o + w++] = v.floorY + 0.01; cp.array[o + w++] = c.z + Math.sin(a) * r; const q = oc + wc; cc.array[q] = 1; cc.array[q + 1] = gg; cc.array[q + 2] = bb; cc.array[q + 3] = al; wc += 4; };
      for (let j = 0; j < v.M; j++) {
        const a0 = yaw - c.fov / 2 + c.fov * j / v.M, a1 = yaw - c.fov / 2 + c.fov * (j + 1) / v.M, r0 = distAt(a0), r1 = distAt(a1);
        vert(a0, c.r0, A); vert(a0, r0, A * 0.2); vert(a1, c.r0, A);
        vert(a1, c.r0, A); vert(a0, r0, A * 0.2); vert(a1, r1, A * 0.2);
      }
    }
    v.body.instanceMatrix.needsUpdate = v.lamp.instanceMatrix.needsUpdate = true;
    if (dirty) { cp.needsUpdate = true; cc.needsUpdate = true; }
    void dt;
  }

  // ------------------------------------------------------------------ HOST: vision, meters, heat, viewer tax
  const feedLine = (s) => fx({ k: 'say', s });   // s is an English key from feedcams_i18n.js, translated on receipt
  function noise(pos, loud) {
    try { S.selfNoise = true; game.creatures?.noise?.(new V3(pos.x, pos.y, pos.z), loud); } catch { /* creatures optional */ } finally { S.selfNoise = false; }
  }
  function initFc() {
    const r = run(); if (!r) return;
    r.fc = { ck: game.time, c: S.plan.map(() => [0, 0, 0, 0, 0, 0]), p: {}, h: 0, tx: 0, tn: 0, lv: 0, as: 0, off: 0 };
    S.mt.clear(); S.mark.clear(); S.ext.clear(); S.hp = S.plan.map(() => FC.hp); S.pingAt = S.waveAt = S.fjBait = 0; S.said = 0; S.feedDone = false; lastFp = '';
    game.broadcastRun?.(['fc']);
  }
  function setState(i, st, until = 0) {
    const e = fc()?.c?.[i]; if (!e) return;
    e[0] = st; e[1] = Math.round(until * 10) / 10;
    if (st === ST.DEAD || st === ST.CUT) untag('c' + i);   // the recording is gone: whoever this camera tagged is clean again
  }
  /** clear the tag of every player tagged by `src` ('c3' camera, 'd1' drone, '*' = everyone) */
  function untag(src) {
    for (const [id, m] of S.mt) if (m.tag && (src === '*' || m.tag === src)) { m.tag = ''; fx({ k: 'untag', to: id }); }
  }
  function hostTick(dt) {
    const F = fc(), r = run(), now = game.time;
    if (!F || r?.phase !== 'moon' || !S.plan.length) return;
    const all = (game.aiPlayers?.() || []).filter((p) => !p.dead);
    const inFac = all.filter((p) => p.zone === 'in' && !p.inShip);
    // CUT THE FEED job (facjobs): the whole network goes dark
    const fj = r.fj?.j?.find?.((j) => j.id === 'feed');
    if (fj && fj.st === 1 && !S.feedDone) { S.feedDone = true; F.off = now + FC.off; untag('*'); for (const m of S.mt.values()) { m.m = 0; m.air = 0; } feedLine('The feed is cut. Every camera goes dark for a while.'); }
    // somebody is at the feed splitter: the Algorithm turns every camera in earshot toward the panel (every 3 s)
    if (fj && fj.st !== 1 && fj.ex?.on && Array.isArray(fj.pos) && now >= S.fjBait) { S.fjBait = now + 3; bait({ x: fj.pos[0], y: fj.pos[1], z: fj.pos[2] }, true); if (!(S.said & 4)) { S.said |= 4; feedLine('Somebody is touching my cables. Smile for the cameras.'); } }
    const off = netOff();
    const exp = new Map();
    for (const c of S.plan) {
      const e = F.c[c.i];
      if (e[0] === ST.BLIND && now >= e[1]) e[0] = ST.OK;
      e[5] = 0;
      if (off || e[0] !== ST.OK) continue;
      const yaw = K.camYaw(c, now, e[4] > 0 && now <= e[4] + 0.7 ? { h: e[2], t0: e[3], t1: e[4] } : null);
      const lens = { x: c.x + Math.cos(yaw) * 0.3, y: c.y - 0.1, z: c.z + Math.sin(yaw) * 0.3 };
      for (const p of inFac) {
        const cr = !!p.crouch, q = K.inCone(c, yaw, p.pos.x, p.pos.z, cr);
        if (!q.ok || Math.abs(p.pos.y - (c.y - 2)) > 9) continue;
        if (!game.physics.lineOfSight(lens, { x: p.pos.x, y: p.pos.y + (cr ? 0.7 : 1.1), z: p.pos.z }, G.STATIC | G.DOOR)) continue;
        const x = exp.get(p.id) || { d: 99, n: 0, cr, src: '' }; if (q.d < x.d) { x.d = q.d; x.src = 'c' + c.i; } x.n++; exp.set(p.id, x); e[5] = 1;
      }
    }
    // mobile cameras (feedcams2 drones, the Lantern Keeper's beam) report through expose(): same meter, same rules
    for (const [id, e] of S.ext) {
      if (e.until < now) { S.ext.delete(id); continue; }
      const p = all.find((q) => q.id === id); if (!p || off) continue;
      const x = exp.get(id) || { d: 99, n: 0, cr: !!p.crouch, src: '' }; if (e.d < x.d) { x.d = e.d; x.src = e.src; } x.n++; exp.set(id, x);
    }
    let nAir = 0;
    for (const p of all) {
      const mt = S.mt.get(p.id) || { m: 0, air: 0, tag: '' }; S.mt.set(p.id, mt);
      const v = mt.lx != null ? Math.hypot(p.pos.x - mt.lx, p.pos.z - mt.lz) / Math.max(0.02, dt) : 0; mt.lx = p.pos.x; mt.lz = p.pos.z;
      const pk0 = mt.pk || 0, x = exp.get(p.id), res = K.meterStep(mt.m, x ? K.exposureRate(x.d, x.cr, x.n, v >= FC.sprintV && v < 20) : 0, dt, mt.pk || 0);
      mt.m = res.m; mt.pk = res.pk;
      if (res.live) {
        mt.air = now + FC.hold; F.lv++; F.h = Math.min(FC.heat.max, F.h + FC.heat.spike);
        const fresh = !mt.tag; mt.tag = x?.src || mt.tag || 'x';
        fx({ k: 'live', id: p.id, tag: fresh ? 1 : 0 });
        emit({ k: 'live', id: p.id, src: mt.tag, pos: p.pos });
        try { game.algo1?.bump?.('onair', 'onair'); } catch { /* algo1 optional */ }
        if (!(S.said & 1)) { S.said |= 1; feedLine("You're live. Chat is loving it. Try not to die on camera."); }
      } else if (mt.m >= 1) mt.air = now + FC.hold;
      if (mt.air && now >= mt.air) { mt.air = 0; mt.m = Math.min(mt.m, 0.5); }
      if (res.juke) emit({ k: 'juke', id: p.id, pk: pk0 });
      if (res.juke && now - S.jukeAt > 45) { S.jukeAt = now; fx({ k: 'juke', to: p.id }); try { game.algo1?.bump?.('escape', 'escape'); } catch { /* optional */ } }
      if (mt.air > now) nAir++;
    }
    for (const id of [...S.mt.keys()]) if (!all.some((p) => p.id === id)) S.mt.delete(id);
    F.as = Math.round((F.as + nAir * dt) * 10) / 10;
    F.h = Math.round(K.heatStep(F.h, nAir, dt) * 10) / 10;
    // the Algorithm reacts to heat: lure pings, then a faster creature wave (the creature director may veto)
    const H = FC.heat, live = all.filter((p) => (S.mt.get(p.id)?.air || 0) > now);
    if (live.length && F.h >= H.ping && now >= S.pingAt) { S.pingAt = now + H.pingEvery; noise(live[0].pos, H.pingLoud); }
    if (live.length && F.h >= H.wave && now >= S.waveAt) {
      S.waveAt = now + H.waveEvery;
      let ok = true; try { ok = game.crdirector?.canSpawn?.('feedcams', live[0].pos) !== false; } catch { /* director optional */ }
      if (ok && game.hostData) game.hostData.spawnT = Math.min(game.hostData.spawnT || 0, 4);
      if (ok) emit({ k: 'fans', id: live[0].id, h: F.h });
      if (!(S.said & 2)) { S.said |= 2; feedLine('Your numbers are through the roof. I am sending some fans.'); }
    }
    try { game.crdirector?.onFeedHeat?.(F.h, live.map((p) => p.pos)); } catch { /* optional */ }
    F.p = {}; for (const [id, m] of S.mt) if (m.m > 0.01 || m.air > now || m.tag) F.p[id] = [Math.round(m.m * 100), m.air > now ? 1 : 0, m.tag ? 1 : 0];
    // sync (4 Hz on change, plus a clock refresh every 5 s)
    F.ck = Math.round(now * 100) / 100;
    sendT += dt;
    const fp = JSON.stringify([F.c, F.p, Math.round(F.h), F.off, F.tx, F.lv]);
    if ((fp !== lastFp && sendT >= 0.25) || sendT >= 5) { sendT = 0; lastFp = fp; game.broadcastRun?.(['fc']); }
  }
  /** every 0.5 s: scrap held by someone ON AIR or TAGGED is marked; marked scrap that reaches the ship pays the viewer tax; reaching the ship clears the tag */
  function taxTick() {
    const F = fc(), now = game.time; if (!F || !game.items) return;
    const players = game.aiPlayers?.() || [];
    const hot = new Set([...S.mt].filter(([, m]) => m.air > now || m.tag).map(([id]) => id));
    for (const it of game.items.all()) {
      const ok = isSellable(it.def) && !it.soulbound && it.type !== 'body' && it.value > 1;
      if (!ok) continue;
      if (it.holder && hot.has(it.holder)) S.mark.set(it.id, it.holder);
    }
    let cut = 0, n = 0;
    for (const [id, by] of [...S.mark]) {
      const it = game.items.get?.(id);
      if (!it || it.value <= 1) { S.mark.delete(id); continue; }
      const carrier = it.holder ? players.find((p) => p.id === it.holder) : null;
      const inShip = carrier ? carrier.inShip : it.obj && insideShip(it.obj.position);
      if (!inShip) continue;
      S.mark.delete(id);
      const v0 = it.value, r = K.taxOf(v0); if (r.cut <= 0) continue;
      game.net.broadcast('it', { e: 'val', id, v: r.v });
      cut += r.cut; n++;
      emit({ k: 'tax', item: id, type: it.type, name: it.def?.name || it.type, v: v0, cut: r.cut, by });
    }
    if (cut > 0) { F.tx += cut; F.tn += n; run().fcTax = (run().fcTax | 0) + cut; game.broadcastRun?.(['fc', 'fcTax']); fx({ k: 'tax', cut, n }); }
    for (const p of players) { const m = S.mt.get(p.id); if (m?.tag && p.inShip && !(m.air > now)) { m.tag = ''; } }   // home: the tag is paid off
  }
  // noise bait: a loud sound turns nearby cameras toward it for a few seconds
  function onNoise(pos, loud) {
    if (!fc() || S.selfNoise || loud < FC.baitLoud || run()?.phase !== 'moon') return;
    emit({ k: 'noise', pos: { x: pos.x, y: pos.y, z: pos.z }, loud });   // feedcams2 drones listen too
    if (!netOff()) bait(pos, false);
  }
  function bait(pos, force) {
    const F = fc(), now = game.time; if (!F) return;
    for (const c of S.plan) {
      const e = F.c[c.i];
      if (e[0] !== ST.OK || (!force && now < e[4] + FC.baitGap) || Math.abs(pos.y - (c.y - 2)) > 9 || Math.hypot(pos.x - c.x, pos.z - c.z) > FC.baitRange) continue;
      e[2] = Math.round(K.baitHeading(c, Math.atan2(pos.z - c.z, pos.x - c.x)) * 100) / 100; e[3] = Math.round(now * 10) / 10; e[4] = Math.round((now + FC.bait) * 10) / 10;
    }
  }
  function wrapNoise() {
    const cm = game.creatures;
    if (!cm || S.noiseCm === cm || typeof cm.noise !== 'function') return;
    unwrapNoise();
    const orig = cm.noise; S.noiseCm = cm; S.noiseOrig = orig;
    cm.noise = function (pos, loud, owner) { try { if (host()) onNoise(pos, loud); } catch { /* bait is optional */ } return orig.call(this, pos, loud, owner); };
  }
  function unwrapNoise() { if (S.noiseCm && S.noiseOrig) S.noiseCm.noise = S.noiseOrig; S.noiseCm = S.noiseOrig = null; }

  // counter-play requests (host validates reach)
  const rate = new Map();
  function hostReq(d, from) {
    const F = fc(); if (!host() || !F || !d || run()?.phase !== 'moon') return;
    const c = S.plan[d.i | 0], pp = posOf(from), now = game.time; if (!c || !pp) return;
    if (now - (rate.get(from) ?? -9) < 0.25) return; rate.set(from, now);
    const e = F.c[c.i], dist = Math.hypot(pp.x - c.x, pp.y + 1.5 - c.y, pp.z - c.z);
    if (e[0] === ST.DEAD || e[0] === ST.CUT) return;
    if (d.op === 'hit' && dist <= 5) {
      S.hp[c.i] = (S.hp[c.i] ?? FC.hp) - 1;
      if (S.hp[c.i] <= 0) { const m = S.mt.get(from)?.m || 0; setState(c.i, ST.DEAD); fx({ k: 'smash', i: c.i }); emit({ k: 'smash', i: c.i, by: from, m }); noise(camPos(c), 1.2); } else fx({ k: 'spark', i: c.i });
      game.broadcastRun?.(['fc']);
    } else if (d.op === 'cut' && Math.hypot(pp.x - c.jb.x, pp.z - c.jb.z) <= 2.8 && Math.abs(pp.y + 1 - c.jb.y) < 2.5) {
      setState(c.i, ST.CUT); fx({ k: 'cut', i: c.i, by: from }); emit({ k: 'cut', i: c.i, by: from, m: S.mt.get(from)?.m || 0 }); game.broadcastRun?.(['fc']);
      if (!(S.said & 8)) { S.said |= 8; feedLine('Hey. That cable was load-bearing.'); }
    } else if (d.op === 'zap' && dist <= 16) {
      setState(c.i, ST.BLIND, now + FC.zap); fx({ k: 'zap', i: c.i }); game.broadcastRun?.(['fc']);
    }
  }
  /** spray paint on the wall / ceiling right at a camera blinds it; a rifle tracer through it smashes it */
  function onFx(d, from) {
    const F = fc(); if (!host() || !F || !d || run()?.phase !== 'moon') return;
    if (d.k === 'spray' && Array.isArray(d.p)) {
      const pp = posOf(from); if (!pp) return;
      for (const c of S.plan) {
        const e = F.c[c.i];
        if (e[0] === ST.DEAD || e[0] === ST.CUT || Math.hypot(d.p[0] - c.x, d.p[1] - c.y, d.p[2] - c.z) > 1.7 || Math.hypot(pp.x - c.x, pp.z - c.z) > 6.5) continue;
        setState(c.i, ST.BLIND, game.time + FC.blind); fx({ k: 'spray', i: c.i }); game.broadcastRun?.(['fc']);
      }
    } else if (d.k === 'cb' && d.t === 'tr' && Array.isArray(d.a) && Array.isArray(d.b)) {
      const pp = posOf(from); if (!pp || Math.hypot(pp.x - d.a[0], pp.z - d.a[2]) > 6) return;
      for (const c of S.plan) {
        if (F.c[c.i][0] >= ST.DEAD || !K.segNear(d.a, d.b, [c.x, c.y, c.z], 0.8)) continue;
        setState(c.i, ST.DEAD); fx({ k: 'smash', i: c.i }); emit({ k: 'smash', i: c.i, by: from, m: S.mt.get(from)?.m || 0 }); game.broadcastRun?.(['fc']);
      }
    }
  }
  offs.push(mods.on('fx', (d, from) => { try { onFx(d, from); } catch (e) { console.warn('[feedcams] fx', e); } }));
  offs.push(mods.on('registerHandlers', (H, g) => { if (g === game) H('fcreq', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[feedcams] req', e); } }); }));

  // local swings / zaps become requests (host validates)
  const wraps = [];
  function wrap(name, fn) {
    const orig = game[name]; if (typeof orig !== 'function') return;
    const own = Object.prototype.hasOwnProperty.call(game, name);
    const mine = function (...a) { try { fn.apply(this, a); } catch (e) { console.warn('[feedcams]', name, e); } return orig.apply(this, a); };
    game[name] = mine; wraps.push([name, orig, mine, own]);
  }
  const aim = (reach) => {
    const eye = game.camera.position, f = new V3(0, 0, -1).applyQuaternion(game.camera.quaternion);
    return [[eye.x, eye.y, eye.z], [eye.x + f.x * reach, eye.y + f.y * reach, eye.z + f.z * reach]];
  };
  const camAt = (a, b, r) => S.plan.find((c) => stOf(c.i) < ST.DEAD && K.segNear(a, b, [c.x, c.y, c.z], r));
  wrap('resolveMelee', (h) => { if (!S.plan.length) return; const [a, b] = aim((h?.reach || 2.4) + 0.5), c = camAt(a, b, 0.9); if (c) game.net.request('fcreq', { op: 'hit', i: c.i }); });
  wrap('fireRanged', (it) => { if (!S.plan.length || it?.type !== 'taser') return; const [a, b] = aim(it.def?.reach || 12), c = camAt(a, b, 1.0); if (c) game.net.request('fcreq', { op: 'zap', i: c.i }); });

  // ------------------------------------------------------------------ client: reactions, vignette, tips, summary
  function onFxMsg(d) {
    if (disposed || !d) return;
    const c = S.plan[d.i | 0], me = game.selfId;
    if (d.k === 'live') { if (d.id === me) { snd('ui_error', null, 0.5); toast(t(d.tag ? 'ON AIR - you are TAGGED until you reach the ship. Kill that camera to clear it.' : 'ON AIR - you are live'), 'bad'); } else toast(tf('{name} went live', { name: game.playerName?.(d.id) || '?' }), 'warn'); }
    else if (d.k === 'untag') { if (d.to === me) toast(t('Tag cleared. The recording is gone.'), 'good'); }
    else if (d.k === 'juke') { if (d.to === me) toast(t('Clean dodge. The stream lagged behind you.'), 'good'); }
    else if (d.k === 'tax') { S.taxSum = d.cut; toast(tf('The Algorithm took its cut: -▮{n} viewer tax', { n: d.cut }), 'bad'); }
    else if (d.k === 'sale') toast(tf('Viewer tax on this haul: -▮{n} (scrap carried while ON AIR)', { n: d.cut }), 'warn');
    else if (d.k === 'say') { try { game.lore?.say?.(t(d.s), { mood: 'curious' }); } catch { /* lore optional */ } }
    else if (c) {
      const p = camPos(c);
      if (d.k === 'smash' || d.k === 'spark') { snd('hit_metal', p, 0.9); game.particles?.burst?.(p, 'sparks', new V3(0, -1, 0), d.k === 'smash' ? 1.2 : 0.5); }
      else if (d.k === 'zap') { snd('taser_zap', p, 0.8); game.particles?.burst?.(p, 'sparks', new V3(0, -1, 0), 0.8); }
      else if (d.k === 'spray') snd('spray_paint', p, 0.7);
      else if (d.k === 'cut') { const j = new V3(c.jb.x, c.jb.y, c.jb.z); snd('hit_metal', j, 0.4); game.particles?.burst?.(j, 'sparks', new V3(0, 1, 0), 0.4); if (d.by === me) toast(t('Cable cut. That camera is dead for today.'), 'good'); }
    }
  }
  function onSell(d) {
    if (!host() || !d || d.pending || !(d.total > 0)) return;
    const cut = run()?.fcTax | 0; if (cut <= 0) return;
    fx({ k: 'sale', cut }); run().fcTax = 0; game.broadcastRun?.(['fcTax']);
  }
  function bindNet(net) {
    if (!net || boundNet === net) return;
    boundNet?.off?.('msg:fcfx', onFxMsg); boundNet?.off?.('msg:sell', onSell);
    boundNet = net; net.on('msg:fcfx', onFxMsg); net.on('msg:sell', onSell);
  }
  offs.push(mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
  if (game.net) bindNet(game.net);

  function ensureUi() {
    if (S.vig || typeof document === 'undefined') return;
    S.style = document.createElement('style'); S.style.textContent = CSS; document.head.appendChild(S.style);
    S.vig = document.createElement('div'); S.vig.id = 'fc-vig'; document.body.appendChild(S.vig);
  }
  function tip(bit) {
    let got = 0; try { got = +localStorage.getItem('tfg.fc.tips') || 0; } catch { /* storage optional */ }
    if ((got & bit) || (S.tipNow & bit)) return; S.tipNow = (S.tipNow || 0) | bit;
    try { localStorage.setItem('tfg.fc.tips', String(got | bit)); } catch { /* storage optional */ }
    try { game.lore?.say?.(t(TIPS[Math.log2(bit)]), { mood: 'curious' }); } catch { /* lore optional */ }
  }
  function clientTick(dt) {
    ensureUi();
    const F = fc(), me = F?.p?.[game.selfId], m = me ? me[0] / 100 : 0, live = me ? me[1] : 0, tag = me ? me[2] : 0;
    if (S.vig) {
      const a = Math.min(1, m * 0.55 + (live ? 0.3 : 0) + (F ? F.h / 100 * 0.15 : 0));
      const key = Math.round(a * 20);
      if (key !== S.vigKey) { S.vigKey = key; S.vig.style.opacity = String(key / 20); }
    }
    vigT += dt;
    if (vigT >= 0.5) {
      vigT = 0;
      if (typeof document !== 'undefined') for (const el of document.querySelectorAll('.algo-live')) { el.classList.toggle('fc-onair', !!live); el.classList.toggle('fc-tag', !live && !!tag); if (live || tag) el.dataset.fc = t(live ? 'ON AIR' : 'TAGGED'); }
      const p = game.player;
      if (p && !p.dead && S.plan.length && F) {
        if (live) tip(4); else if (m > 0.3) tip(2);
        for (const c of S.plan) {
          const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
          if (stOf(c.i) === ST.OK && d < 16 && Math.abs(p.pos.y - (c.y - 2)) < 6 && !p.inShip) { tip(1); if (c.tut && d < 9 && (run()?.day | 0) <= 1) tip(8); if (Math.hypot(p.pos.x - c.jb.x, p.pos.z - c.jb.z) < 4) tip(16); break; }
        }
      }
    }
  }
  // junction box: [E] cuts the camera cable (quiet kill; the host checks reach)
  offs.push(mods.on('interactables', (out, g) => {
    const p = game.player;
    if (g !== game || disposed || !S.plan.length || !p || p.dead || !fc() || run()?.phase !== 'moon') return;
    for (const c of S.plan) {
      if (stOf(c.i) >= ST.DEAD || Math.hypot(p.pos.x - c.jb.x, p.pos.z - c.jb.z) > 3.2 || Math.abs(p.pos.y + 1 - c.jb.y) > 2.5) continue;
      out.push({ pos: new V3(c.jb.x, c.jb.y, c.jb.z), r: 0.5, reach: 2.4, label: () => t('Camera junction box: cut the cable [E]'), sub: () => t('Kills this camera quietly for the rest of the day.'),
        action: () => { try { game.net.request('fcreq', { op: 'cut', i: c.i }); } catch { /* net closing */ } } });
    }
  }));
  offs.push(mods.on('daySummary', (d, extra, g) => {
    if (g !== game || d.company) return;
    const F = S.sum || fc(); if (!F || !(F.n > 0)) return;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    extra.push(F.tx > 0 ? `<b>${esc(t('VIEWER TAX'))}</b> -▮${F.tx} (${esc(tf('{n} items carried out while ON AIR', { n: F.tn }))}) - ${esc(tf('live {n} s', { n: Math.round(F.as) }))}`
      : `<b>${esc(t('OFF THE FEED'))}</b> ${esc(F.lv ? tf('Went live {n}x but kept the haul clean.', { n: F.lv }) : t('Never went live. The Algorithm saw nothing.'))}`);
  }));
  offs.push(mods.on('phase', (ph, g) => {
    if (g && g !== game) return;
    const F = fc();
    if (ph === 'takeoff' && F) S.sum = { tx: F.tx, tn: F.tn, lv: F.lv, as: F.as, n: S.plan.length };
    if (ph === 'moon') { S.sum = null; S.mark.clear(); }
    if (ph === 'orbit' && host() && run()?.fc) { run().fc = null; game.broadcastRun?.(['fc']); }
    if (ph !== 'moon' && ph !== 'landing') { S.mt.clear(); }
  }));

  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    try {
      ensure();
      const F = fc();
      if (F && !host() && F.ck !== S.ck) { S.ck = F.ck; S.off = F.ck - game.time; }
      if (host()) S.off = 0;
      if (host() && S.plan.length && !F && run()?.phase === 'moon') initFc();
      else if (host() && F && F.c.length !== S.plan.length && S.plan.length) initFc();
      if (S.vis) visuals(dt);
      clientTick(dt);
      if (host() && run()?.phase === 'moon') {
        wrapNoise();
        tickT += dt; itemT += dt;
        if (tickT >= 1 / FC.hz) { const d = tickT; tickT = 0; hostTick(d); }
        if (itemT >= 0.5) { itemT = 0; taxTick(); }
      }
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[feedcams] update', e); } }
  }));

  return {
    state: S, plan: () => S.plan, hostTick, hostReq, onNoise, taxTick, untag,
    /** HOST: a mobile camera (drone, Lantern Keeper beam) sees player `id` from `d` metres this tick; src = tag source ('d0', 'x') */
    expose(id, d, src = 'x') { if (host() && id) S.ext.set(id, { d: Math.max(0.5, +d || 8), src, until: game.time + 0.35 }); },
    /** HOST: does a working camera see this point right now? (The Follower counts cameras as watchers.) Cached 0.25 s per 2 m cell. */
    sees(pos) {
      const F = fc(); if (!host() || !F || !pos || !S.plan.length || netOff()) return false;
      const key = Math.round(pos.x / 2) + ',' + Math.round(pos.z / 2), now = game.time, hit = (S.seeC ||= new Map()).get(key);
      if (hit && now - hit.t < 0.25) return hit.v;
      let v = false;
      for (const c of S.plan) {
        const e = F.c[c.i]; if (e[0] !== ST.OK || Math.abs(pos.y - (c.y - 2)) > 9) continue;
        const yaw = K.camYaw(c, now, e[4] > 0 && now <= e[4] + 0.7 ? { h: e[2], t0: e[3], t1: e[4] } : null);
        if (!K.inCone(c, yaw, pos.x, pos.z, false).ok) continue;
        try { if (game.physics.lineOfSight({ x: c.x, y: c.y - 0.1, z: c.z }, { x: pos.x, y: pos.y + 1.2, z: pos.z }, G.STATIC | G.DOOR)) { v = true; break; } } catch { /* physics gone */ }
      }
      if (S.seeC.size > 200) S.seeC.clear();
      S.seeC.set(key, { t: now, v }); return v;
    },
    /** HOST: meter 0..1 / live / tagged of a player */
    meter(id) { const m = S.mt.get(id); return m ? { m: m.m, live: m.air > game.time, tag: m.tag || '' } : { m: 0, live: false, tag: '' }; },
    /** HOST: blind camera i for `secs` (feedcams2 jammer); never shortens a longer blind or revives a dead camera */
    blind(i, secs) { const e = fc()?.c?.[i]; if (!host() || !e || e[0] >= ST.DEAD || (e[0] === ST.BLIND && e[1] > game.time + secs)) return; const was = e[0]; setState(i, ST.BLIND, game.time + secs); if (was !== ST.BLIND) game.broadcastRun?.(['fc']); },
    netOff,
    dispose() {
      disposed = true;
      for (const o of offs.splice(0)) { try { o?.(); } catch { /* ignore */ } }
      for (const [name, orig, mine, own] of wraps.reverse()) { if (game[name] === mine) { if (own) game[name] = orig; else delete game[name]; } }
      unwrapNoise(); clearVis();
      try { boundNet?.off?.('msg:fcfx', onFxMsg); boundNet?.off?.('msg:sell', onSell); } catch { /* ignore */ }
      S.vig?.remove(); S.style?.remove();
      if (typeof document !== 'undefined') for (const el of document.querySelectorAll('.algo-live')) el.classList.remove('fc-onair');
    },
  };
}
