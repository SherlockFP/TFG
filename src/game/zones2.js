// ZONES 2 runtime (wave 6): installed BY zones.js (`installZones2(X)`), it is not a separate game module. Pure rules: zones2_core.js. Docs: docs/wave6/zones2.md
//   1. INTERIOR wings: relay cores inside the facility, permanently armed horror traps (laser / crusher / spikes / live floor / flame vent) on corridor cells, interior raiders on a cell flow
//   2. OUTDOOR walls + gates on the snap grid (validated, colliders on every peer, breached by raiders) + the validated ring-defence placer (replaces debugPlace-without-checks)
//   3. EXTRACTOR (miner) per zone, upkeep ammo for turrets, generated-sector archive
//   4. raiders path around barricades (flow field aimed at the core), ship CRT sector map
// Net: extends 'znx' (host -> all): tp (trap placements), ts (trap states), wl (valid wall pieces), wbr (breached piece); 'znreq' ops wall / wsell / mine / msell.
// Everything here is host-authoritative; clients only build views + colliders from what the host sends.
import * as THREE from 'three';
import { RAPIER, G, groups } from '../physics/physics.js';
import { hashString } from '../core/rng.js';
import { TRAPS, newTrap, stepTrap, trapDamageTo, laserFrac, sweepHit, zoneCoords, trapZoneOf } from './horror_core.js';
import { TrapView } from './horror_traps.js';
import { drawSectorMap } from '../ui/panels/zones.js';
import { t } from '../core/i18n.js';

const AMMO_KINDS = new Set(['turret', 'tesla', 'shield', 'flood']);
const RING_OUT = new Set(['barr_wood', 'barr_metal', 'spikes', 'mine']);

export function installZones2(X) {
  const { game, Z, Q, ZN, S, flat } = X;
  const W = Z.WALL;
  const restores = [];
  let disposed = false;
  const A = {   // runtime state (both sides unless marked host)
    L: null, part: null, key: '',                      // interior partition of the current landing
    group: null, views: new Map(), tp: [],             // trap views + the placement list the host sent
    wl: {}, wlJson: '', ver: 0, dead: new Set(), wSig: '', wMesh: null, wCols: [], // wall pieces (valid list per zone) + breached set + instanced view + colliders
    host: { traps: new Map(), sendT: 0, syncT: 0, flow: null, flowT: 0, ammoT: 0 },
  };
  const D = () => game.deployables;
  const terrain = () => game.world?.terrain || null;
  const run = () => X.run();
  const isHost = () => !!game.isHost;

  // ============================================================================================ interior context (every peer computes the same partition)
  const layout = () => game.world?.facility?.layout || null;
  function interior() {
    const L = layout(), r = run();
    if (!L || r?.phase !== 'moon') return null;
    const sp = X.spec(r.moon);
    if (!sp) return null;
    const names = sp.zones.filter((z) => z.kind === 'wing').map((z) => z.wing);
    if (!names.length) return null;
    const key = `${L.seed}:${r.moon}:${names.join()}:${X.runKey()}`;
    if (A.key !== key) { try { A.part = Q.partitionWings(L, names, X.runKey()); } catch (e) { console.warn('[zones2] partition', e); A.part = null; } A.L = L; A.key = key; A.names = names; }
    return A.part ? { L, part: A.part, sp, names: A.names } : null;
  }
  /** cores of the wing zones that got a relay inside the facility ([{id, x, y, z, in: 1, w}]); the others keep the v1 outdoor annex relay */
  function interiorCores() {
    const I = interior();
    if (!I) return [];
    const out = [];
    for (const z of I.sp.zones) {
      if (z.kind !== 'wing') continue;
      const wi = I.names.indexOf(z.wing), w = I.part.wings[wi];
      if (w?.core) out.push({ id: z.id, x: w.core.x, y: w.core.y, z: w.core.z, in: 1, w: wi });
    }
    return out;
  }
  /** is the player (world pos) inside the wing of this interior core? */
  function inWing(pos, core) {
    const I = interior();
    return !!(I && core?.in && Q.wingAt(I.L, I.part, pos.x, pos.y, pos.z) === core.w);
  }
  /** same level test for cores: interior cores only count for people inside the facility, outdoor ones for people outside */
  const sameLevel = (pos, core) => Math.abs(pos.y - core.y) < (core.in ? 6 : 16);

  // ============================================================================================ HOST: interior traps
  const traps = () => A.host.traps;
  function trapCtx() {
    const hz = (game.world?.facility?.hazards?.lasers || []).map((h) => ({ cx: h.cx ?? h.x, cz: h.cz ?? h.z }));
    return { horror: game.horror?.plan?.traps || [], hazards: hz };
  }
  function clearZoneTraps(zid) { for (const [uid, T] of traps()) if (T.zid === zid) traps().delete(uid); }
  /** (re)plan the traps of one interior zone from its stored counts; returns { placed, skipped } */
  function materializeInterior(m, zid, st, core) {
    clearZoneTraps(zid);
    const I = interior();
    if (!I || !core?.in || st?.s !== 'own') { broadcastTp(); return { placed: 0, skipped: 0 }; }
    const wants = Q.trapWants(st), pl = Q.planWingTraps(I.L, I.part, core.w, wants, trapCtx());
    let placed = 0, skipped = 0;
    pl.forEach((p, k) => {
      if (!p) { skipped++; return; }
      const uid = `${zid}${k}`, zone = trapZoneOf(I.L, { cells: p.cells, axis: p.axis });
      const tr = newTrap(p.type);
      traps().set(uid, { uid, zid, type: p.type, cells: p.cells, axis: p.axis, zone, st: tr, dry: !!st.dry, prevP: 0, slammed: false, nextTick: 0 });
      arm(traps().get(uid));
      placed++;
    });
    broadcastTp();
    return { placed, skipped };
  }
  const now = () => game.time || 0;
  function arm(T) { const st = T.st; if (T.dry) { st.s = 'idle'; return; } st.s = 'armed'; st.charges = 99; st.until = 1e12; st.t0 = now(); }
  function broadcastTp() {
    if (!isHost()) return;
    A.host.tpSig = null;
    X.znx({ k: 'tp', a: [...traps().values()].map((T) => [T.uid, T.zid, T.type, T.axis, T.cells]) });
  }
  function broadcastTs() { X.znx({ k: 'ts', a: [...traps().values()].map((T) => [T.uid, T.st.s, T.st.charges > 9 ? 9 : T.st.charges]) }); }
  const snd = (name, x, y, z, vol = 1, ref = 6, max = 70, pitch) => game.net?.broadcast('fx', { k: 'snd', s: name, p: [+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)], v: vol, r: ref, m: max, pt: pitch });
  const victimsIn = (T, margin = 0.2) => {
    const out = [], zone = { ...T.zone, len: T.zone.len + margin * 2, wid: T.zone.wid + margin };
    for (const c of game.creatures?.host?.values?.() || []) {
      if (c.dead || c.def?.hazard || c.maxHp === null || c.maxHp === undefined || Math.abs(c.pos.y - T.zone.y) > 3 || c.type === 'alien_npc') continue;
      const zc = zoneCoords(zone, c.pos.x, c.pos.z);
      if (zc.inside) out.push({ c, s: zc.s - margin, id: c.id });
    }
    return out;
  };
  function hit(T, v) {
    const c = v.c, dmg = trapDamageTo(T.type, { hp: c.hp, maxHp: c.maxHp, boss: c.def?.boss, hazard: c.def?.hazard, elite: c.elite, dead: c.dead });
    if (dmg > 0) game.creatures.damage(c.id, dmg, 'trap', { stun: T.type === 'electric' ? 0.6 : 0 });
  }
  function applyStrike(T) {
    const TR = TRAPS[T.type], el = now() - T.st.t0;
    if (T.type === 'laser') {
      const p = laserFrac(el, TR.strike);
      for (const v of victimsIn(T)) { if (T.st.hit.has(v.id) || !sweepHit(T.prevP, p, v.s, T.zone.len)) continue; T.st.hit.add(v.id); hit(T, v); }
      T.prevP = p;
    } else if (T.type === 'crusher' || T.type === 'spikes') {
      if (!T.slammed && el >= (T.type === 'crusher' ? 0.12 : 0.1)) {
        T.slammed = true;
        if (T.type === 'crusher') { snd('hit_wall', T.zone.cx, T.zone.y + 0.4, T.zone.cz, 1, 8, 90, 0.5); snd('blast_door', T.zone.cx, T.zone.y + 0.4, T.zone.cz, 0.9, 8, 90, 1.3); }
        for (const v of victimsIn(T)) hit(T, v);
      }
    } else if (TR.tick > 0) {
      while (now() >= T.nextTick && T.nextTick < T.st.t0 + TR.strike) { T.nextTick += TR.tick; for (const v of victimsIn(T)) hit(T, v); }
    }
  }
  function trapsTick(dt) {
    if (!traps().size) return;
    const t0 = now();
    let changed = false;
    for (const T of traps().values()) {
      const st = T.st;
      if (T.dry) { if (st.s !== 'idle') { st.s = 'idle'; changed = true; } continue; }
      let occupied = false;
      if (st.s === 'armed') for (const c of game.creatures?.host?.values?.() || []) {
        if (c.dead || c.def?.hazard || c.maxHp === null || c.maxHp === undefined || Math.abs(c.pos.y - T.zone.y) > 3 || c.type === 'alien_npc') continue;
        if (zoneCoords({ ...T.zone, len: T.zone.len + 0.6 }, c.pos.x, c.pos.z).inside) { occupied = true; break; }
      }
      const before = st.s;
      for (const ev of stepTrap(st, t0, occupied)) {
        const z = T.zone;
        if (ev === 'tele') snd('mine_beep', z.cx, z.y + 1.5, z.cz, 1, 8, 60, 0.7);
        if (ev === 'strike') { T.prevP = 0; T.slammed = false; T.nextTick = t0; st.hit = st.hit || new Set(); snd(T.type === 'flame' ? 'steam_hiss' : T.type === 'electric' ? 'spark' : T.type === 'spikes' ? 'hit_metal' : 'taser_zap', z.cx, z.y + 1, z.cz, 1, 8, 70, 0.7); }
      }
      if (st.s === 'spent' || st.s === 'idle') arm(T);   // permanent: they never run out while the zone is paid for
      if (st.s === 'cool' && st.charges < 5) st.charges = 99;
      if (st.s === 'strike') applyStrike(T);
      if (st.s !== before) changed = true;
    }
    void dt;
    if (changed) broadcastTs();
  }

  // ============================================================================================ CLIENT: trap views (from the host's placement list)
  function ensureGroup() { if (!A.group) { A.group = new THREE.Group(); A.group.name = 'zn_traps'; game.scene.add(A.group); } return A.group; }
  function disposeTrapViews() { for (const e of A.views.values()) e.v.dispose(); A.views.clear(); A.tp = []; }
  function syncTrapViews(list) {
    A.tp = list || [];
    const L = layout();
    if (!L) { disposeTrapViews(); return; }
    const seen = new Set();
    for (const [uid, zid, type, axis, cells] of A.tp) {
      seen.add(uid);
      const sig = `${type}${axis}${JSON.stringify(cells)}`;
      const old = A.views.get(uid);
      if (old && old.sig === sig) continue;
      old?.v.dispose();
      try {
        const zone = trapZoneOf(L, { cells, axis }), ceil = L.heightOf[L.idx(cells[0][0], cells[0][1])] || L.corridorH || 3.3;
        const v = new TrapView({ id: uid, type, axis }, zone, ceil, null, hashString(uid));
        ensureGroup().add(v.group);
        A.views.set(uid, { v, sig, zid });
      } catch (e) { console.warn('[zones2] trap view', type, e); }
    }
    for (const [uid, e] of [...A.views]) if (!seen.has(uid)) { e.v.dispose(); A.views.delete(uid); }
  }
  function applyTs(list) { for (const [uid, s, c] of list || []) { const e = A.views.get(uid); if (e) e.v.setState(s, c, 0, 0); } }

  // ============================================================================================ walls: placement ctx (host) + view / colliders (every peer)
  /** is a static collider (rock, tree, building...) inside this box? Our own wall colliders do not count (a new piece may touch its neighbours). */
  function staticHit(x, y, z, hx, hy, hz) {
    const P = game.physics;
    if (!P?.world || !RAPIER) return false;
    let hit = false;
    try {
      P.world.intersectionsWithShape({ x, y, z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Cuboid(Math.max(0.01, hx), Math.max(0.01, hy), Math.max(0.01, hz)),
        (col) => { if (P.infoOf(col)?.kind === 'znwall') return true; hit = true; return false; }, undefined, groups(0xffff, G.STATIC | G.DOOR));
    } catch { /* physics not ready */ }
    return hit;
  }
  function wallCtx(core, existing, people = false) {
    const ter = terrain(), outdoor = game.world?.outdoor;
    const circles = [];
    for (const d of D()?.list?.() || []) if (d.pos && d.def) circles.push({ x: d.pos.x, z: d.pos.z, r: Math.max(d.def.hx || 0.5, d.def.hz || 0.5) * 0.8 });
    const solid = game.physics ? staticHit : null;
    const ppl = people ? game.aiPlayers().filter((p) => !p.dead).map((p) => ({ x: p.pos.x, z: p.pos.z })) : [];   // a collider must never appear inside somebody
    return { core, zoneR: ZN.zoneR, ter, cores: S.cores.filter((c) => !c.in), obstacles: Q.obstaclesOf(outdoor), circles, solid, people: ppl, existing: existing || [], cap: 1e9 };
  }
  const outdoorCoreOf = (zid) => { const c = X.coreOf(zid); return c && !c.in ? c : null; };
  /** recompute which stored pieces fit this landing's terrain, for every owned outdoor zone; broadcast the list */
  function hostRefreshWalls(send = true) {
    const r = run(), m = r?.moon;
    const wl = {};
    if (r?.phase === 'moon') for (const c of S.cores) {
      if (c.in) continue;
      const st = Z.getZ(X.zn(), m, c.id);
      if (st?.s !== 'own' || !st.w?.length) continue;
      const fit = Q.fitWalls(wallCtx(c, []), st.w);
      wl[c.id] = fit.kept;
    }
    setWl(wl);
    if (send) X.znx({ k: 'wl', l: wl });
    syncWalls(false);
  }
  /** replace the valid-piece list (bumps the view version only when something changed) */
  function setWl(wl) {
    const j = JSON.stringify(wl || {});
    if (j !== A.wlJson) { A.wlJson = j; A.wl = wl || {}; A.dead.clear(); A.ver++; }
  }
  function dropWalls() {
    for (const c of A.wCols) { try { game.physics?.removeCollider(c); } catch { /* gone with the map */ } const out = game.world?.outdoor; if (out?.colliders) { const k = out.colliders.indexOf(c); if (k >= 0) out.colliders.splice(k, 1); } }
    A.wCols = [];
    if (A.wMesh) { for (const m of A.wMesh) { m.removeFromParent(); m.geometry?.dispose?.(); m.material?.dispose?.(); } A.wMesh = null; }
    A.wSig = '';
  }
  /** instanced walls + gate posts + crew-colour caps, and one static collider per solid piece (gates: two posts) */
  function syncWalls(force) {
    const r = run(), m = r?.moon;
    if (r?.phase !== 'moon' || !terrain()) { if (A.wMesh || A.wCols.length) dropWalls(); return; }
    const col = Z.crewColor(X.zn());
    const sig = `${A.ver}|${col}|${m}|${S.cores.map((c) => c.id + c.x).join()}`;
    if (!force && sig === A.wSig) return;
    dropWalls(); A.wSig = sig;
    const body = [], caps = [], boxes = [];
    for (const [zid, list] of Object.entries(A.wl)) {
      const core = outdoorCoreOf(zid); if (!core) continue;
      list.forEach((p, i) => {
        if (A.dead.has(`${zid}:${i}`)) return;
        const b = Q.pieceBox(core, p), ter = terrain();
        const ys = [-1, 0, 1].map((k) => (b.yaw ? ter.heightAt(b.x, b.z + k * b.hx) : ter.heightAt(b.x + k * b.hx, b.z)));
        const lo = Math.min(...ys) - 0.25, top = Math.max(...ys) + W.h, mid = (lo + top) / 2, hh = top - lo;   // the body reaches down to the lowest ground under the piece (no gap on a slope)
        const rot = b.yaw;
        if (p[0] === 0) {
          body.push({ x: b.x, y: mid, z: b.z, yaw: rot, sx: 2 * b.hx, sy: hh, sz: 2 * b.hz });
          caps.push({ x: b.x, y: top + 0.05, z: b.z, yaw: rot, sx: 2 * b.hx + 0.1, sy: 0.12, sz: 2 * b.hz + 0.12 });
          boxes.push([b.x, mid, b.z, b.hx, hh / 2, b.hz, rot]);
        } else {   // gate: two posts + a lintel, the middle stays open
          const cs = Math.cos(rot), sn = Math.sin(rot);
          for (const sd of [-1, 1]) {
            const ox = sd * (b.hx - 0.3) * cs, oz = -sd * (b.hx - 0.3) * sn;
            body.push({ x: b.x + ox, y: mid + 0.2, z: b.z + oz, yaw: rot, sx: 0.6, sy: hh + 0.4, sz: 0.7 });
            boxes.push([b.x + ox, mid + 0.2, b.z + oz, 0.3, (hh + 0.4) / 2, 0.35, rot]);
          }
          caps.push({ x: b.x, y: top + 0.1, z: b.z, yaw: rot, sx: 2 * b.hx, sy: 0.2, sz: 0.5 });
        }
      });
    }
    if (!body.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mk = (list, mat) => { const im = new THREE.InstancedMesh(geo.clone(), mat, Math.max(1, list.length)); const M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), Vp = new THREE.Vector3(), Vs = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((e, i) => { Qn.setFromAxisAngle(up, e.yaw); M.compose(Vp.set(e.x, e.y, e.z), Qn, Vs.set(e.sx, e.sy, e.sz)); im.setMatrixAt(i, M); });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; game.scene.add(im); return im; };
    A.wMesh = [mk(body, new THREE.MeshLambertMaterial({ color: 0x4a4e55, flatShading: true })), mk(caps, new THREE.MeshBasicMaterial({ color: new THREE.Color(col) }))];
    geo.dispose();
    if (game.physics?.addStaticBox) {
      const out = game.world?.outdoor;
      for (const b of boxes) { try { const c = game.physics.addStaticBox(b[0], b[1], b[2], b[3], b[4], b[5], b[6], G.STATIC, { kind: 'znwall' }); A.wCols.push(c); out?.colliders?.push(c); } catch { /* physics not ready */ } }
    }
  }
  const setDead = (zid, i) => { A.dead.add(`${zid}:${i}`); A.ver++; syncWalls(false); };

  // ---- host: build / sell walls, extractor
  const deny = (to, why) => game.net.sendTo(to, 'znx', { k: 'deny', why });
  function hostWall(d, from) {
    const r = run(), p = game.aiPlayerById(from), core = outdoorCoreOf(d.z);
    if (!p || !core || r?.phase !== 'moon') return;
    const st = Z.getZ(X.zn(), r.moon, d.z);
    if (st?.s !== 'own') return deny(from, 'Capture the zone first.');
    if (flat(p.pos, core) > ZN.zoneR || !sameLevel(p.pos, core)) return deny(from, 'Stand inside the zone.');
    const wx = +d.wx, wz = +d.wz, fy = +d.fy;
    if (![wx, wz, fy].every(Number.isFinite) || Math.hypot(wx - p.pos.x, wz - p.pos.z) > W.maxReach) return deny(from, 'Too far.');
    const n = Math.max(1, Math.min(4, d.n | 0 || 1)), gate = d.gate === 1 ? (n > 1 ? Math.floor(n / 2) : 0) : -1;
    const fx = Math.sin(fy), fz = Math.cos(fy), rot = Math.abs(fx) > Math.abs(fz) ? 1 : 0;
    const sn = Q.snapPiece(core, wx, wz, rot);
    const pcs = n > 1 ? Q.wallLine(core, wx, wz, fy, n, gate) : [[gate === 0 ? 1 : 0, sn.gx, sn.gz, sn.r]];
    const have = (st.w || []).slice(), ctx = wallCtx(core, have, true), added = [];
    let why = '', cost = 0;
    for (const pc of pcs) {
      const c = W.cost[pc[0]];
      if (r.credits < cost + c) { why = why || 'Not enough credits.'; break; }
      const v = Q.validateWall({ ...ctx, existing: have.concat(added), cap: Z.wallCap(st) }, pc);
      if (!v.ok) { why = why || v.why; continue; }
      added.push(pc); cost += c;
    }
    if (!added.length) return deny(from, why || 'Not possible.');
    r.credits -= cost; st.w = have.concat(added);
    X.pushZn('credits');
    hostRefreshWalls();
    game.net.broadcast('fx', { k: 'snd', s: 'lockpick_success', p: [core.x, core.y + 1, core.z], v: 0.7 });
    if (added.length < pcs.length && why) deny(from, why);
  }
  function hostWallSell(d, from) {
    const r = run(), p = game.aiPlayerById(from), core = outdoorCoreOf(d.z);
    if (!p || !core || r?.phase !== 'moon') return;
    const st = Z.getZ(X.zn(), r.moon, d.z);
    if (st?.s !== 'own' || !st.w?.length || flat(p.pos, core) > ZN.zoneR) return;
    let bi = -1, bd = 7;
    st.w.forEach((pc, i) => { const b = Q.pieceBox(core, pc), dd = Math.hypot(b.x - p.pos.x, b.z - p.pos.z); if (dd < bd) { bd = dd; bi = i; } });
    if (bi < 0) return deny(from, 'No wall piece within reach.');
    const pc = st.w.splice(bi, 1)[0];
    r.credits += Math.floor(W.cost[pc[0]] * W.sell);
    X.pushZn('credits'); hostRefreshWalls();
  }
  function hostMine(d, from) {
    const r = run(), p = game.aiPlayerById(from), core = X.coreOf(d.z), m = r?.moon;
    if (!p || !core || r?.phase !== 'moon') return;
    const st = Z.getZ(X.zn(), m, d.z);
    if (st?.s !== 'own') return deny(from, 'Capture the zone first.');
    if (!(core.in ? inWing(p.pos, core) : flat(p.pos, core) <= ZN.zoneR && sameLevel(p.pos, core))) return deny(from, 'Stand inside the zone.');
    if (X.qi() < Z.MINER.minQ) return deny(from, 'Not unlocked yet (later quota).');
    const lv = st.mn?.l | 0;
    if (lv >= Z.MINER.maxLv) return;
    const cost = lv ? Z.minerUpCost(lv) : Z.minerCost(1);
    if (r.credits < cost) return deny(from, 'Not enough credits.');
    r.credits -= cost;
    st.mn = { l: lv + 1, p: lv ? st.mn.p : Z.minerPurity(X.runKey(), m, d.z) };
    X.pushZn('credits');
    game.net.broadcast('fx', { k: 'snd', s: 'lockpick_success', p: [core.x, core.y + 1, core.z], v: 0.7 });
  }
  function hostMineSell(d, from) {
    const r = run(), p = game.aiPlayerById(from), core = X.coreOf(d.z);
    if (!p || !core || r?.phase !== 'moon') return;
    const st = Z.getZ(X.zn(), r.moon, d.z);
    if (st?.s !== 'own' || !st.mn) return;
    if (!(core.in ? inWing(p.pos, core) : flat(p.pos, core) <= ZN.zoneR)) return;
    r.credits += Math.floor(Z.minerCost(st.mn.l | 0) * Z.MINER.sell);
    delete st.mn; X.pushZn('credits');
  }
  function hostOp(op, d, from) {
    switch (op) {
      case 'wall': hostWall({ z: String(d.z || ''), wx: d.wx, wz: d.wz, fy: d.fy, n: d.n, gate: d.gate }, from); return true;
      case 'wsell': hostWallSell({ z: String(d.z || '') }, from); return true;
      case 'mine': hostMine({ z: String(d.z || '') }, from); return true;
      case 'msell': hostMineSell({ z: String(d.z || '') }, from); return true;
      default: return false;
    }
  }

  // ============================================================================================ HOST: validated ring placer (replaces debugPlace-without-checks)
  /** place every stored ring defence of an outdoor zone on a checked spot; returns { ids: [deployable ids], placed, skipped } */
  function placeRing(key, core, list, st) {
    const Dp = D(), ter = terrain(), ids = [];
    let skipped = 0;
    if (!Dp?.debugPlace) return { ids, placed: 0, skipped: list.length };
    const walls = (A.wl[core.id] || []).map((p) => Q.pieceBox(core, p));
    const ctx = { core, cores: S.cores, ter, obstacles: Q.obstaclesOf(game.world?.outdoor), placed: [], walls, solid: null };
    const frac = st?.dry ? 0 : st?.am == null ? 1 : st.am;
    list.forEach((def, k) => {
      const spots = Q.ringSpots(core, key + X.runKey(), k, RING_OUT.has(def)), dd = Z.DEFS[def], rad = Math.max(dd ? 0.5 : 0.5, (Dp.DEPS?.[def]?.r || 0.6));
      let done = false;
      for (const sp of spots) {
        const cs = Q.checkSpot(ctx, sp.x, sp.z, rad);
        if (!cs.ok) continue;
        if (Dp.validate) { const v = Dp.validate(def, sp.x, cs.y, sp.z, sp.yaw, {}); if (!v.ok) continue; }
        const dep = Dp.debugPlace(def, sp.x, sp.z, sp.yaw, null, null);
        if (!dep) continue;
        ids.push(dep.id); ctx.placed.push({ x: sp.x, z: sp.z, r: rad });
        if (dep.def?.cap && AMMO_KINDS.has(dep.def.kind)) dep.res = dep.def.cap * frac;
        else if (st?.dry && dep.def?.supply) dep.res = 0;
        done = true; break;
      }
      if (!done) skipped++;
    });
    return { ids, placed: ids.length, skipped };
  }

  // ============================================================================================ HOST: live defence helpers (raiders around barricades, upkeep ammo)
  function flowFor(L) {
    const H = A.host, ter = terrain();
    if (L.int || !ter) return null;
    const t0 = now();
    if (H.flow && H.flowKey === L.z && t0 - H.flowT < 2.5 && !H.flowDirty) return H.flow;
    // the zone's valid wall pieces that are not breached + the deployable barricades (solid) -> the field aimed at the core
    const list = A.wl[L.z] || [], pieces = list.filter((_, i) => !A.dead.has(`${L.z}:${i}`)), wb = Q.wallBlockers(L.core, pieces, null);
    const dep = D()?.blockers?.() || [];
    L.solid = [...dep, ...wb.solid];
    L.wallIdx = list.map((_, i) => i).filter((i) => !A.dead.has(`${L.z}:${i}`));
    H.flow = Q.coreFlow((ter.playHalf || 130) + 10, L.core, [...dep, ...wb.flow]);
    H.flowKey = L.z; H.flowT = t0; H.flowDirty = false;
    return H.flow;
  }
  function raiderTarget(L, c, S_) {
    const near = X.playersNear(c.pos, 14, L.int ? 6 : 16).sort((a, b) => flat(a.pos, c.pos) - flat(b.pos, c.pos))[0];
    if (near) return { k: 'p', id: near.id };
    if (!L.int) { const dep = D()?.nearest?.(c.pos.x, c.pos.z, 11, null); if (dep) return { k: 'd', id: dep.id }; }
    void S_;
    return { k: 'c' };
  }
  function raiderStep(L, c, dt) {
    const S_ = Z.SG[c.type]; if (!S_ || c.stunT > 0) return;
    const M = game.creatures, Dp = D();
    const doAttack = (fn) => { if (c.age < 1) return; if (c.state !== 'attack') c.setState('attack'); if (c.cooldown <= 0) { c.cooldown = S_.cd; fn(); } };
    c.data.tt -= dt;
    if (c.data.tt <= 0) { c.data.tt = 0.4 + Math.random() * 0.2; c.data.tg = raiderTarget(L, c, S_); }
    if (c.state === 'attack' && c.t < 0.4) return;
    const tg = c.data.tg || { k: 'c' };
    const lvl = 1 + 0.1 * ((c.level || 1) - 1);
    let tx, tz, reach = S_.reach, act = null;
    if (tg.k === 'p') {
      const p = game.aiPlayerById(tg.id);
      if (!p || p.dead || p.inShip || !sameLevel(p.pos, { y: L.core.y, in: L.int })) { c.data.tg = null; c.data.tt = 0; return; }
      tx = p.pos.x; tz = p.pos.z; act = () => M.attack(c, p, Math.round(c.dmg), 'siege');
    } else if (tg.k === 'd') {
      const dep = Dp?.get?.(tg.id);
      if (!dep || dep.dead) { c.data.tg = null; c.data.tt = 0; return; }
      tx = dep.pos.x; tz = dep.pos.z; reach += Math.max(dep.def.hx, dep.def.hz) * 0.7; act = () => Dp.damage(dep, S_.dep * lvl);
    } else if (tg.k === 'b') {
      const b = tg.b;
      if (b.wall !== undefined) {
        const key = `${L.z}:${L.wallIdx?.[b.wall] ?? b.wall}`;
        if (A.dead.has(key)) { c.data.tg = null; c.data.tt = 0; return; }
        tx = b.x; tz = b.z; reach += Math.max(b.hx, b.hz) * 0.5; act = () => wallHit(L, b, S_.dep * lvl * 2);
      } else {
        const dep = Dp?.get?.(b.id);
        if (!dep || dep.dead) { c.data.tg = null; c.data.tt = 0; return; }
        tx = dep.pos.x; tz = dep.pos.z; reach += Math.max(dep.def.hx, dep.def.hz) * 0.7; act = () => Dp.damage(dep, S_.dep * lvl);
      }
    } else { tx = L.core.x; tz = L.core.z; reach += 1.6; act = () => { L.hp -= S_.hull * S_.cd * 12 * lvl; }; }
    const dx = tx - c.pos.x, dz = tz - c.pos.z, d = Math.hypot(dx, dz) || 1;
    if (d <= reach) { c.yaw = Math.atan2(dx, dz); doAttack(act); return; }
    c.setState('run');
    let speed = M.speedMul(c, S_.run); if (c.slowT > 0) speed *= c.slowMul || 0.55;
    const step = speed * dt, dir = { x: dx / d, z: dz / d };
    if (L.int) {   // inside a wing: walk the cell flow to the core (chase a player who is close)
      let goal = null;
      if (tg.k === 'c' || d > 4.5) goal = Q.flowTarget(A.L, L.fd, c.pos.x, c.pos.z);
      if (goal) { const gx = goal.x - c.pos.x, gz = goal.z - c.pos.z, gl = Math.hypot(gx, gz) || 1; dir.x = gx / gl; dir.z = gz / gl; }
      c.pos.x += dir.x * step; c.pos.z += dir.z * step; c.pos.y = A.L.y; M.openDoorsNear?.(c);
    } else {
      if (tg.k === 'c') { const fl = flowFor(L); if (fl && !fl.dirAt(c.pos.x, c.pos.z, dir)) { dir.x = dx / d; dir.z = dz / d; } }
      else flowFor(L);
      const res = Q.moveRaider(c.pos, dir, step, (S_.radius || 0.5) * 0.7, L.solid || []);
      const ter = terrain(); if (ter) c.pos.y = ter.heightAt(c.pos.x, c.pos.z);
      if (res?.blocked && res.blocked !== 'ship') { c.data.tg = { k: 'b', b: res.blocked }; c.data.tt = 0.9; }
    }
    c.yaw = Math.atan2(dir.x, dir.z);
  }
  function wallHit(L, b, dmg) {
    const idx = L.wallIdx?.[b.wall] ?? b.wall, key = `${L.z}:${idx}`;
    L.wallHp = L.wallHp || {};
    if (L.wallHp[key] == null) L.wallHp[key] = W.hp[b.type === 'gate' ? 1 : 0];
    L.wallHp[key] -= dmg;
    if (L.wallHp[key] <= 0) { A.dead.add(key); A.ver++; A.host.flowDirty = true; syncWalls(false); X.znx({ k: 'wbr', z: L.z, i: idx }); snd('hit_wall', b.x, 1.2, b.z, 1, 8, 80, 0.6); }
  }
  /** upkeep ammo: turrets / tesla / dome / floodlight of the defended zone that ran low get a refill out of the zone's paid ammo reserve */
  function ammoTick(L, dt) {
    A.host.ammoT -= dt;
    if (A.host.ammoT > 0) return;
    A.host.ammoT = 6;
    if (L.ammo == null) L.ammo = ammoReserve(X.zn()?.m?.[L.m]?.[L.z]);
    if (L.ammo <= 0 || L.int) return;
    const Dp = D(), ids = X.host.deps.get(`${L.m}:${L.z}`) || [];
    for (const id of ids) {
      const d = Dp?.get?.(id);
      if (!d || d.dead || !d.def?.cap || !AMMO_KINDS.has(d.def.kind) || L.ammo <= 0) continue;
      if (d.res < d.cap * 0.3) { d.res = Math.min(d.cap, d.res + d.cap * 0.5); d.on = true; L.ammo--; snd('lockpick_success', d.pos.x, d.pos.y + 1, d.pos.z, 0.5, 5, 40, 1.4); }
    }
  }
  /** how many refills a zone's upkeep bought: 4 per zone level tier when paid in full, less when it went (partly) unpaid */
  function ammoReserve(st) { const f = st?.dry ? (st.am ?? 0) : st?.am == null ? 1 : st.am; return Math.round((4 + (st?.up | 0) * 2 + Math.min(6, Z.defCount(st))) * f); }
  function liveBegin(L) {
    L.flowDirty = true; A.host.flow = null; A.host.flowKey = null;
    const core = L.core;
    if (core.in) {
      const I = interior();
      L.int = true;
      if (I) L.fd = Q.coreDist(I.L, I.part, core.w);
    }
    L.ammo = ammoReserve(X.zn()?.m?.[L.m]?.[L.z]);
    if (A.dead.size) { A.dead.clear(); A.ver++; }
    A.host.ammoT = 4;
    if (!L.int) flowFor(L);
  }
  /** spawn points for interior raiders (null = the caller spawns outdoors as before) */
  function spawnPoints(L, n) {
    if (!L.int) return null;
    const I = interior();
    if (!I) return null;
    return Q.wingSpawnPoints(I.L, I.part, L.core.w, L.fd, n, L.rng);
  }
  function liveEnd() { if (A.dead.size) { A.dead.clear(); A.ver++; syncWalls(false); } A.host.flow = null; }

  // ============================================================================================ archive (generated sectors rotate)
  function archiveSync() {
    const z = X.zn(); if (!z) return;
    for (const id of Object.keys(z.m || {})) { const mo = X.realMoon(id); if (mo?.generated && !mo.stale) Q.archiveMoon(z, mo, X.qi()); }
    Q.pruneArchive(z);
  }

  // ============================================================================================ ship CRT (the sector map on the vitals monitor)
  function crtPick(snap) {
    if (!snap.moons.some((m) => m.owned || m.zones.some((q) => q.s === 'inf'))) return null;
    const pend = snap.pend[0]?.m, cur = snap.moons.find((m) => m.here && m.owned) ,
      most = snap.moons.slice().sort((a, b) => b.owned - a.owned)[0];
    return snap.moons.find((m) => m.id === pend) || cur || most || null;
  }
  function crtDraw(s) {
    const snap = X.snapshot(), mo = crtPick(snap);
    if (!mo) return false;
    const { ctx, c } = s, W_ = c.width, H_ = c.height;
    ctx.fillStyle = '#04080c'; ctx.fillRect(0, 0, W_, H_);
    ctx.save(); ctx.translate(4, 20); drawSectorMap(ctx, 96, mo, snap, null, { me: mo.here ? game.player?.pos : null }); ctx.restore();
    ctx.fillStyle = '#f0b040'; ctx.font = '11px "TFG Credit", monospace'; ctx.fillText(t('SECTOR MAP'), 6, 13);
    ctx.font = '9px "TFG Credit", monospace'; ctx.fillStyle = '#ffe7b0';
    const lines = [String(mo.name).slice(0, 12), `${t('HELD')} ${snap.owned}/${snap.maxOwned}`, `▮${snap.income.credits}/${t('day')}`, `${t('cap')} ▮${snap.income.cap}`];
    lines.forEach((l, i) => ctx.fillText(l, 104, 30 + i * 11));
    let y = 30 + lines.length * 11 + 4;
    for (const pe of snap.pend.slice(0, 2)) { ctx.fillStyle = '#ff6a4a'; ctx.fillText('! ' + String(X.zoneName(pe.m, pe.z)).slice(0, 15), 104, y); y += 11; }
    const inf = mo.zones.filter((q) => q.s === 'inf').length;
    if (inf) { ctx.fillStyle = '#ff3a4a'; ctx.fillText(`${t('INFECTED')} ${inf}`, 104, y); }
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let yy = 0; yy < H_; yy += 2) ctx.fillRect(0, yy, W_, 1);
    s.t.needsUpdate = true;
    return true;
  }
  let crtWrapped = false;
  function crtInstall() {
    const scr = game.shipScreens;
    if (crtWrapped || !scr || typeof scr.drawExtra !== 'function' || !scr.extra) return;
    crtWrapped = true;
    const had = Object.prototype.hasOwnProperty.call(scr, 'drawExtra'), orig = scr.drawExtra;
    const w = function () {
      try { if (Math.floor(performance.now() / 6000) % 2 === 1 && crtDraw(this.extra)) return; } catch (e) { if (!A.crtWarned) { A.crtWarned = 1; console.warn('[zones2] crt', e); } }
      return orig.call(this);
    };
    scr.drawExtra = w;
    restores.push(() => { if (scr.drawExtra === w) { if (had) scr.drawExtra = orig; else delete scr.drawExtra; } });
  }

  // ============================================================================================ per-frame + messages
  let lastCam = null;
  function update(dt) {
    if (disposed) return;
    crtInstall();
    const r = run();
    if (r?.phase !== 'moon') { if (A.views.size) disposeTrapViews(); if (A.wMesh || A.wCols.length) dropWalls(); if (A.wlJson !== '{}') setWl({}); return; }
    const cam = game.camera?.position || null;
    lastCam = cam;
    for (const e of A.views.values()) { try { e.v.update(dt, cam); } catch { /* view optional */ } }
    if (isHost()) {
      trapsTick(dt);
      A.host.syncT -= dt;
      if (A.host.syncT <= 0) { A.host.syncT = 8; if (traps().size) { broadcastTp(); broadcastTs(); } if (Object.keys(A.wl).length) X.znx({ k: 'wl', l: A.wl }); }
    }
    syncWalls(false);
  }
  function onMsg(m) {
    switch (m.k) {
      case 'tp': syncTrapViews(m.a); break;
      case 'ts': applyTs(m.a); break;
      case 'wl': if (!isHost()) { setWl(m.l); syncWalls(false); } break;
      case 'wbr': if (!isHost()) setDead(m.z, m.i); break;
      default: return false;
    }
    return true;
  }
  function onLanding() {   // mapLoaded: everything of the previous landing is gone
    disposeTrapViews(); dropWalls(); setWl({}); A.key = ''; A.part = null; A.L = null;
    traps().clear(); A.host.flow = null;
  }
  function dispose() {
    disposed = true;
    for (const r of restores.reverse()) { try { r(); } catch { /* ignore */ } }
    restores.length = 0;
    disposeTrapViews(); A.group?.removeFromParent(); A.group = null; dropWalls();
  }
  return {
    interior, interiorCores, inWing, sameLevel, materializeInterior, placeRing, hostRefreshWalls, hostOp, liveBegin, liveEnd, spawnPoints, raiderStep, ammoTick, ammoReserve,
    archiveSync, update, onMsg, onLanding, dispose, crtDraw, wallCtx,
    walls: () => A.wl, traps: () => [...traps().values()], views: () => A.views, state: A,
  };
}
