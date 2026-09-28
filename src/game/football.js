// FOOTBALL (wave 1, "fun" module): a physics ball that lives in the ship (all trips) and on the pitch next to the ship at
// the Company HQ, with two goals, score toasts, a crowd cheer and a juggle (keep-up) counter.
//
// Authority: the HOST owns the only physics body (a Rapier dynamic sphere in the shared world, ball-only collision group so
// it never shoves scrap / players by itself). Clients render a dead-reckoned mesh from 15 Hz snapshots ('ball' messages,
// host-only type). Kicks are requests: LMB near the ball (consumed before the melee swing), E on the ball, or just walk /
// sprint into it (the host pushes the ball from every player's capsule). Out-of-bounds / lost ball -> respawn in the ship
// (orbit and in-flight are ship-only: the ball may never leave the hull) or on the centre spot at HQ.
//
// Net: request 'ball' { op: 'kick' d:[x,y,z] sp | 'sync' | 'reset' } -> host. Host -> all 'ball' { k: 'st' | 'kick' | 'bounce' | 'goal' | 'reset' }.
import * as THREE from 'three';
import { RAPIER, groups, G } from '../physics/physics.js';
import { insideShip } from '../world/ship.js';
import { HOST_ONLY } from '../net/session.js';
import { hudDock } from '../ui/dock.js';
import { fx } from './funfx.js';
import { ensureWardrobeProfile } from './cosmetics.js';
import { t } from '../core/i18n.js';

HOST_ONLY.add('ball');

const R = 0.2;                                   // ball radius (m): bigger than a real ball so it reads at PSX resolution
const BALL_GROUP = 0x0100, NET_GROUP = 0x0200;   // collision membership bits nobody else uses
const SHIP_SPAWN = new THREE.Vector3(-1.6, 0.45, 0.7);
const PITCH = { cx: -21, cz: 18, halfL: 9.5, halfW: 8.5, goalHalf: 2.5, goalH: 2.3, depth: 1.6 };
const KICK_REACH = 3.3, KICK_CD = 0.28, MAX_SPEED = 22;
const SNAP_MOVING = 1 / 15, SNAP_IDLE = 0.5;
const REWARD_CAP = 6;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _axis = new THREE.Vector3();

// ------------------------------------------------------------------ visuals
function makeBallMesh() {
  const g = new THREE.IcosahedronGeometry(R, 1);   // already non-indexed in three r18x
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  // 12 icosahedron vertex directions -> the black "pentagon" patches
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) { dirs.push([0, a, b], [a, b, 0], [b, 0, a]); }
  const D = dirs.map((d) => new THREE.Vector3(...d).normalize());
  for (let f = 0; f < pos.count; f += 3) {
    _v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) _v.add(_v2.fromBufferAttribute(pos, f + k));
    _v.normalize();
    let best = 0; for (const d of D) best = Math.max(best, d.dot(_v));
    const dark = best > 0.955;
    for (let k = 0; k < 3; k++) { const i = (f + k) * 3; col[i] = dark ? 0.06 : 0.96; col[i + 1] = dark ? 0.06 : 0.96; col[i + 2] = dark ? 0.07 : 0.94; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1a1a1a }));
  m.name = 'football';
  return m;
}
function netTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 32, 32); x.strokeStyle = '#ffffff'; x.lineWidth = 2;
  x.strokeRect(0, 0, 32, 32); x.beginPath(); x.moveTo(16, 0); x.lineTo(16, 32); x.moveTo(0, 16); x.lineTo(32, 16); x.stroke();
  const tx = new THREE.CanvasTexture(c); tx.magFilter = tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}
function turfTexture() {
  const W = 256, H = 232;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#2e6a36' : '#2a6031'; x.fillRect(i * (W / 8), 0, W / 8, H); }
  x.strokeStyle = '#e8f2e8'; x.lineWidth = 3;
  x.strokeRect(6, 6, W - 12, H - 12);
  x.beginPath(); x.moveTo(W / 2, 6); x.lineTo(W / 2, H - 6); x.stroke();
  x.beginPath(); x.arc(W / 2, H / 2, 26, 0, Math.PI * 2); x.stroke();
  x.strokeRect(6, H / 2 - 44, 34, 88); x.strokeRect(W - 40, H / 2 - 44, 34, 88);
  x.fillStyle = '#e8f2e8'; x.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
  const tx = new THREE.CanvasTexture(c); tx.magFilter = tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

export function installFootball(game) {
  const S = {
    mesh: null, visible: false,
    p: new THREE.Vector3(SHIP_SPAWN.x, SHIP_SPAWN.y, SHIP_SPAWN.z), v: new THREE.Vector3(), age: 0, has: false,
    render: new THREE.Vector3(),
    juggle: 0, best: 0, lastBy: null, goals: 0, celebrate: 0, rewards: 0,
    // host only
    body: null, col: null, snapT: 0, grounded: false, touchT: new Map(), kickT: new Map(), prevPos: new Map(), lastTouchAny: -9, chainLive: false,
    bounceT: 0, oobT: 0, prevVy: 0, prevSpeed: 0,
  };
  let disposed = false, boundNet = null;
  const offs = [];
  const goalObjs = { group: null, goals: [], colliders: [], co: null };
  const dock = hudDock('bottom', 'fun-ball', 45);
  dock.style.cssText = 'font-family:VT323,monospace;font-size:24px;color:#ffe9b0;text-shadow:0 0 6px #000,0 0 10px rgba(255,160,40,.5);display:none;background:rgba(0,0,0,.45);padding:1px 12px;border:1px solid rgba(255,190,110,.35)';

  const floorY = () => game.world?.company?.groundY ?? -1.25;
  const phase = () => game.run?.phase;
  const atHQ = () => phase() === 'company' && !!game.world?.company;
  const spawnPos = (where) => (where === 'pitch' ? new THREE.Vector3(PITCH.cx, floorY() + R + 0.1, PITCH.cz) : SHIP_SPAWN.clone());
  const homeSpot = () => spawnPos(atHQ() ? 'pitch' : 'ship');

  // ---------------------------------------------------------------- mesh
  function ensureMesh() {
    if (S.mesh || disposed) return;
    S.mesh = makeBallMesh();
    S.mesh.visible = false;
    game.scene.add(S.mesh);
  }

  // ---------------------------------------------------------------- host physics
  function hostEnsureBody() {
    if (S.body || !game.isHost) return;
    const w = game.physics.world;
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(S.p.x, S.p.y, S.p.z).setLinearDamping(0.4).setAngularDamping(0.9).setCcdEnabled(true);
    S.body = w.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.ball(R).setDensity(9).setRestitution(0.66).setFriction(0.75)
      .setCollisionGroups(groups(BALL_GROUP, G.STATIC | G.DOOR | NET_GROUP));
    S.col = w.createCollider(cd, S.body);
    game.physics.tag(S.col, { kind: 'ball' });
  }
  function hostRespawn(where, notify = true) {
    if (!game.isHost) return;
    hostEnsureBody();
    const p = spawnPos(where);
    S.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    S.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    S.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    S.p.copy(p); S.v.set(0, 0, 0);
    S.juggle = 0; S.chainLive = false; S.celebrate = 0; S.oobT = 0;
    S.snapT = 0;
    if (notify) game.net?.broadcast('ball', { k: 'reset', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
  }
  function hostTouch(id, launch) {
    const now = game.time;
    S.lastBy = id; S.lastTouchAny = now;
    if (launch) {
      if (S.chainLive || S.juggle === 0) S.juggle += 1;
      S.chainLive = true;
    }
    S.best = Math.max(S.best, S.juggle);
  }
  function hostKick(from, d) {
    if (!S.body) return;
    const pl = game.aiPlayerById?.(from);
    if (!pl || pl.dead) return;
    const now = game.time;
    if (now - (S.kickT.get(from) || -9) < KICK_CD) return;
    const dir = Array.isArray(d.d) && d.d.length === 3 && d.d.every(Number.isFinite) ? _v.fromArray(d.d) : null;
    if (!dir || dir.lengthSq() < 0.01) return;
    dir.normalize();
    const b = S.body.translation();
    const dist = Math.hypot(b.x - pl.eye.x, b.y - pl.eye.y, b.z - pl.eye.z);
    if (dist > KICK_REACH) return;
    S.kickT.set(from, now);
    const power = 8.5 + (d.sp ? 4.8 : 0);
    dir.y = Math.min(0.85, Math.max(-0.15, dir.y)) + 0.2;
    dir.normalize();
    const v0 = S.body.linvel();
    const nv = _v2.set(v0.x * 0.15 + dir.x * power, v0.y * 0.1 + dir.y * power, v0.z * 0.15 + dir.z * power);
    if (nv.length() > MAX_SPEED) nv.setLength(MAX_SPEED);
    S.body.setLinvel({ x: nv.x, y: nv.y, z: nv.z }, true);
    S.body.setAngvel({ x: -dir.z * 9 + (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 6, z: dir.x * 9 }, true);
    hostTouch(from, nv.y > 1.6);
    game.net.broadcast('ball', { k: 'kick', p: [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2)], pw: +power.toFixed(1) });
  }
  // walk / sprint into the ball: push it from each player's capsule
  function hostBumps(dt, b, v) {
    let moved = false;
    const now = game.time;
    for (const pl of game.aiPlayers?.() || []) {
      if (pl.dead) { S.prevPos.delete(pl.id); continue; }
      const pr = S.prevPos.get(pl.id);
      let pvx = 0, pvz = 0;
      if (pr && dt > 1e-4) { pvx = (pl.pos.x - pr.x) / dt; pvz = (pl.pos.z - pr.z) / dt; if (Math.hypot(pvx, pvz) > 14) pvx = pvz = 0; }
      S.prevPos.set(pl.id, { x: pl.pos.x, z: pl.pos.z });
      const h = pl.crouch ? 1.05 : 1.75;
      const cy = Math.min(Math.max(b.y, pl.pos.y + 0.34), pl.pos.y + h - 0.34);
      const dx = b.x - pl.pos.x, dy = b.y - cy, dz = b.z - pl.pos.z;
      const dist = Math.hypot(dx, dy, dz), reach = 0.34 + R + 0.02;
      if (dist >= reach || dist < 1e-4) continue;
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      const pn = pvx * nx + pvz * nz;
      const vn = v.x * nx + v.y * ny + v.z * nz;
      const target = Math.min(9, Math.max(0.9, pn * 1.25 + 0.9));
      if (vn < target) {
        const before = v.length();
        v.x += nx * (target - vn); v.y += ny * (target - vn); v.z += nz * (target - vn);
        if (ny > 0.65 && vn < 0) v.y += 2.6;               // header / knee: pop it up
        else if (pn > 4 && b.y < pl.pos.y + 0.6) v.y += 1.3;   // sprint dribble hops
        moved = true;
        if (v.length() - before > 1.2 && now - (S.touchT.get(pl.id) || -9) > 0.22) { S.touchT.set(pl.id, now); hostTouch(pl.id, v.y > 1.8); }
      }
      const push = reach - dist;
      b.x += nx * push; b.y += ny * push; b.z += nz * push;
      moved = true;
    }
    return moved;
  }
  function hostGoal(pos) {
    if (S.celebrate > 0 || !goalObjs.goals.length) return;
    for (const g of goalObjs.goals) {
      if (pos.y < g.y0 - 0.1 || pos.y > g.y0 + PITCH.goalH || Math.abs(pos.z - PITCH.cz) > PITCH.goalHalf) continue;
      const inside = g.s < 0 ? (pos.x < g.line - R * 0.6 && pos.x > g.line - PITCH.depth) : (pos.x > g.line + R * 0.6 && pos.x < g.line + PITCH.depth);
      if (!inside) continue;
      S.goals += 1; S.celebrate = 3.2;
      const by = S.lastBy;
      game.net.broadcast('ball', { k: 'goal', by, n: S.goals, side: g.s, p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] });
      if (by && S.rewards < REWARD_CAP) { S.rewards++; game.net.broadcast('xp', { to: by, xp: 15, coin: 2, reason: 'Goal scored' }); }
      return;
    }
  }
  function hostTick(dt) {
    hostEnsureBody();
    if (!S.body) return;
    const t = S.body.translation(), lv = S.body.linvel();
    S.p.set(t.x, t.y, t.z); S.v.set(lv.x, lv.y, lv.z);
    const moved = hostBumps(dt, S.p, S.v);
    if (moved) {
      if (S.v.length() > MAX_SPEED) S.v.setLength(MAX_SPEED);
      S.body.setLinvel({ x: S.v.x, y: S.v.y, z: S.v.z }, true);
      S.body.setTranslation({ x: S.p.x, y: S.p.y, z: S.p.z }, true);
    }
    // ground contact -> juggle chains end when the ball lands
    const hit = game.physics.raycast(S.p, { x: 0, y: -1, z: 0 }, R + 0.06, G.STATIC | G.DOOR | G.BIG);
    const grounded = !!hit && Math.abs(S.v.y) < 2.5;
    if (grounded && game.time - S.lastTouchAny > 0.2) { S.juggle = 0; S.chainLive = false; }
    S.grounded = grounded;
    // bounce / impact sounds
    S.bounceT -= dt;
    const sp = S.v.length();
    if (S.bounceT <= 0 && ((S.prevVy < -2.2 && S.v.y > 0.6) || sp < S.prevSpeed - 4)) {
      S.bounceT = 0.14;
      game.net.broadcast('ball', { k: 'bounce', p: [+S.p.x.toFixed(2), +S.p.y.toFixed(2), +S.p.z.toFixed(2)], s: +Math.min(1, Math.abs(S.prevVy) / 8 + 0.2).toFixed(2) });
    }
    S.prevVy = S.v.y; S.prevSpeed = sp;
    // bounds
    let oob = !Number.isFinite(S.p.x + S.p.y + S.p.z) || S.p.y < -70 || Math.abs(S.p.x) > 260 || Math.abs(S.p.z) > 260;
    const ph = phase();
    if (ph === 'orbit' || ph === 'landing' || ph === 'takeoff') oob = oob || !insideShip(S.p, 0.15);
    else if (atHQ()) oob = oob || S.p.y < floorY() - 5.5;
    if (oob) { S.oobT += dt; if (S.oobT > 0.05) { hostRespawn(atHQ() ? 'pitch' : 'ship'); return; } } else S.oobT = 0;
    if (atHQ()) hostGoal(S.p);
    if (S.celebrate > 0) { S.celebrate -= dt; if (S.celebrate <= 0) hostRespawn('pitch'); }
    // snapshots
    S.snapT -= dt;
    if (S.snapT <= 0) {
      S.snapT = sp > 0.15 || !S.grounded ? SNAP_MOVING : SNAP_IDLE;
      const r = (x) => +x.toFixed(2);
      game.net.broadcast('ball', { k: 'st', p: [r(S.p.x), r(S.p.y), r(S.p.z)], v: [r(S.v.x), r(S.v.y), r(S.v.z)], j: S.juggle, b: S.best, w: S.lastBy, g: S.goals, c: S.celebrate > 0 ? 1 : 0 });
    }
  }

  // ---------------------------------------------------------------- pitch (HQ): turf, goals, net colliders
  function buildPitch(world) {
    disposePitch();
    const co = world?.company;
    if (!co || typeof document === 'undefined') return;
    const y0 = co.groundY ?? -1.25;
    const grp = new THREE.Group(); grp.name = 'pitch';
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.halfL * 2 + 0.6, PITCH.halfW * 2), new THREE.MeshLambertMaterial({ map: turfTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    turf.rotation.x = -Math.PI / 2; turf.position.set(PITCH.cx, y0 + 0.02, PITCH.cz);
    grp.add(turf);
    const post = new THREE.MeshLambertMaterial({ color: 0xf2f2ee, emissive: 0x303030 });
    const netMat = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, fog: true, color: 0xdfe8e8 });
    goalObjs.goals = [];
    for (const s of [-1, 1]) {
      const line = PITCH.cx + s * PITCH.halfL;      // goal line x (s = -1 west, +1 east)
      // NOTE: goals face the pitch centre: the net extends OUTWARDS (away from the centre)
      const sign = s;                                // outward direction along x
      const zc = PITCH.cz, hw = PITCH.goalHalf, gh = PITCH.goalH, dep = PITCH.depth;
      for (const dz of [-hw, hw]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, gh, 6), post); p.position.set(line, y0 + gh / 2, zc + dz); grp.add(p);
        goalObjs.colliders.push(game.physics.addStaticBox(line, y0 + gh / 2, zc + dz, 0.08, gh / 2, 0.08));
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, hw * 2 + 0.14, 6), post); bar.rotation.x = Math.PI / 2; bar.position.set(line, y0 + gh, zc); grp.add(bar);
      goalObjs.colliders.push(game.physics.addStaticBox(line, y0 + gh, zc, 0.08, 0.08, hw + 0.07));
      // nets (visual) + ball-only colliders
      const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, gh), netMat); back.rotation.y = Math.PI / 2; back.position.set(line + sign * dep, y0 + gh / 2, zc); grp.add(back);
      back.material.map.repeat.set(8, 4);
      for (const dz of [-hw, hw]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(dep, gh), netMat); side.position.set(line + sign * dep / 2, y0 + gh / 2, zc + dz); grp.add(side); }
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(dep, hw * 2), netMat); roof.rotation.x = Math.PI / 2; roof.position.set(line + sign * dep / 2, y0 + gh, zc); grp.add(roof);
      const box = (x, y, z, hx, hy, hzz) => game.physics.addStaticBox(x, y, z, hx, hy, hzz, 0, NET_GROUP, { kind: 'net' });
      goalObjs.colliders.push(box(line + sign * dep, y0 + gh / 2, zc, 0.06, gh / 2 + 0.1, hw + 0.1));
      goalObjs.colliders.push(box(line + sign * dep / 2, y0 + gh / 2, zc - hw, dep / 2 + 0.05, gh / 2 + 0.1, 0.06));
      goalObjs.colliders.push(box(line + sign * dep / 2, y0 + gh / 2, zc + hw, dep / 2 + 0.05, gh / 2 + 0.1, 0.06));
      goalObjs.colliders.push(box(line + sign * dep / 2, y0 + gh + 0.06, zc, dep / 2 + 0.05, 0.06, hw + 0.1));
      goalObjs.goals.push({ line, s, y0 });
    }
    goalObjs.group = grp; goalObjs.co = co;
    co.group.add(grp);
    for (const c of goalObjs.colliders) co.colliders.push(c);       // removed with the map at takeoff / unload
  }
  function disposePitch() {
    if (goalObjs.group) {
      goalObjs.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
      goalObjs.group.removeFromParent();
    }
    // colliders the map already removed (takeoff / unload) are gone from company.colliders: never remove them twice
    for (const c of goalObjs.colliders) {
      const i = goalObjs.co?.colliders?.indexOf(c) ?? -1;
      if (i >= 0) { goalObjs.co.colliders.splice(i, 1); try { game.physics.removeCollider(c); } catch { /* ignore */ } }
    }
    goalObjs.group = null; goalObjs.colliders = []; goalObjs.goals = []; goalObjs.co = null;
  }

  // ---------------------------------------------------------------- client side
  function onMsg(d) {
    if (!d || disposed) return;
    switch (d.k) {
      case 'st': {
        if (game.isHost) return;
        ensureMesh();
        S.p.fromArray(d.p); S.v.fromArray(d.v); S.age = 0;
        if (!S.has) { S.has = true; S.render.copy(S.p); }
        const prevJ = S.juggle;
        S.juggle = d.j | 0; S.best = d.b | 0; S.lastBy = d.w || null; S.goals = d.g | 0;
        if (S.juggle !== prevJ) juggleChanged(prevJ);
        break;
      }
      case 'kick': {
        const p = _v.fromArray(d.p);
        fx(game.audio, 'fun_kick', { pos: p.clone(), volume: Math.min(1, 0.45 + d.pw / 14), pitch: 0.9 + Math.random() * 0.2, ref: 4, max: 60 });
        game.particles?.burst?.(p.clone(), { count: 5, color: [0xdddddd, 0x9a9a8a], speed: 1.2, up: 0.4, life: 0.35, size: 0.05, gravity: 3, drag: 2 });
        break;
      }
      case 'bounce': fx(game.audio, 'fun_bounce', { pos: _v.fromArray(d.p).clone(), volume: 0.3 + 0.5 * (d.s || 0.4), pitch: 0.85 + Math.random() * 0.3, ref: 3, max: 45 }); break;
      case 'reset': {
        ensureMesh();
        S.p.fromArray(d.p); S.v.set(0, 0, 0); S.render.copy(S.p); S.has = true; S.juggle = 0;
        game.particles?.burst?.(S.p.clone(), { count: 10, color: [0xffffff, 0x88ccff], speed: 1.6, up: 1.2, life: 0.6, size: 0.06, gravity: -1, drag: 2 });
        break;
      }
      case 'goal': onGoal(d); break;
      default: break;
    }
  }
  function onGoal(d) {
    S.goals = d.n | 0;
    const name = d.by ? game.playerName?.(d.by) || 'Someone' : 'Nobody';
    const p = _v.fromArray(d.p).clone();
    fx(game.audio, 'fun_whistle', { volume: 0.8 });
    fx(game.audio, 'fun_cheer', { volume: 0.95 });
    game.ui?.hud?.bigText?.(t('GOAL!'), `${name} scores!  (crew goals: ${S.goals})`);
    game.ui?.toast?.(`⚽ GOAL! ${name} — ${S.goals} total`, 'good');
    const conf = { count: 26, color: [0xff5a5a, 0xffd23f, 0x5adfff, 0x7dff8a, 0xffffff], speed: 4.2, up: 4, life: 1.1, size: 0.07, gravity: 7, drag: 1.2 };
    game.particles?.burst?.(p, conf);
    game.engine?.shake?.(0.05);
    if (d.by === game.selfId) {
      const pr = ensureWardrobeProfile(game.profile); pr.fun.goals += 1; game.progress?.save?.();
      game.mods?.emit('tfg:goal', pr.fun.goals, game);
    }
    if (game.isHost) game.mods?.emit('tfg:goalHost', d, game);
  }
  function juggleChanged(prev) {
    if (S.lastBy !== game.selfId) return;
    const pr = ensureWardrobeProfile(game.profile);
    if (S.juggle > pr.fun.juggleBest) { pr.fun.juggleBest = S.juggle; game.progress?.save?.(); }
    for (const m of [5, 10, 25, 50, 100]) if (prev < m && S.juggle >= m) { game.ui?.toast?.(`⚽ JUGGLE x${m}!`, 'good'); fx(game.audio, 'fun_ok', { volume: 0.6 }); }
  }

  function kickLocal() {
    const p = game.player;
    if (!S.has || p.dead) return false;
    const f = p.forward();
    const eye = p.eyePos();
    if (_v.copy(S.render).distanceTo(eye) > KICK_REACH + 0.2) return false;
    game.net?.request('ball', { op: 'kick', d: [+f.x.toFixed(3), +f.y.toFixed(3), +f.z.toFixed(3)], sp: p.sprinting ? 1 : 0 });
    return true;
  }
  // LMB near the ball: consumed in the capture phase, so the melee swing / grab beam never see it
  function onMouseDown(e) {
    if (e.button !== 0 || disposed || !S.mesh?.visible) return;
    const inp = game.input, p = game.player;
    if (!inp?.locked || !inp.enabled || p.dead || game.minigame || game.terminal?.active || game.emotes?.active || game.ui?.blocksInput?.()) return;
    const eye = p.eyePos(), fwd = p.forward();
    _v.copy(S.render).sub(eye);
    const d = _v.length();
    if (d > 2.8 || d < 0.05 || _v.normalize().dot(fwd) < 0.82) return;
    if (p.heldItem?.() && d > 1.9) return;               // carrying something: only when standing over the ball
    e.stopImmediatePropagation(); e.preventDefault();
    kickLocal();
  }

  function onRequest(d, from) {
    if (!d || !game.isHost) return;
    switch (d.op) {
      case 'kick': hostKick(from, d); break;
      case 'sync': game.net.sendTo(from, 'ball', { k: 'st', p: [+S.p.x.toFixed(2), +S.p.y.toFixed(2), +S.p.z.toFixed(2)], v: [0, 0, 0], j: S.juggle, b: S.best, w: S.lastBy, g: S.goals, c: 0 }); break;
      case 'reset': {
        if (game.time - (S.resetT || -99) < 8) { game.net.sendTo(from, 'sys', { text: 'The ball was just reset.', kind: 'info' }); break; }
        S.resetT = game.time;
        hostRespawn(atHQ() ? 'pitch' : 'ship');
        game.net.broadcast('sys', { text: `${game.playerName(from)} fetched the ball.`, kind: 'info' });
        break;
      }
      default: break;
    }
  }

  function bindNet(net) {
    if (!net || net === boundNet) return;
    boundNet = net;
    net.on_('ball', onMsg);
    net.handle('ball', onRequest);
    if (!game.isHost) setTimeout(() => { if (!disposed) net.request('ball', { op: 'sync' }); }, 900);
  }

  // ---------------------------------------------------------------- frame
  function update(dt) {
    if (disposed) return;
    dt = Math.min(dt, 0.1);
    if (game.net && game.net !== boundNet) bindNet(game.net);
    const ph = phase();
    const active = !!ph && ph !== 'fired';
    if (game.isHost && active) hostTick(dt);
    if (!S.mesh && (S.has || game.isHost)) ensureMesh();
    if (!S.mesh) return;
    // render position: host = body, clients = dead reckoning between snapshots
    if (game.isHost) {
      S.render.copy(S.p);
      const q = S.body?.rotation?.();
      if (q) S.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      S.has = true;
    } else if (S.has) {
      S.age = Math.min(0.35, S.age + dt);
      _v.copy(S.p).addScaledVector(S.v, S.age);
      if (S.p.y + S.v.y * S.age < floorY() - 4) _v.y = S.p.y;
      S.render.lerp(_v, 1 - Math.exp(-18 * dt));
      // roll: axis = up x velocity
      const hs = Math.hypot(S.v.x, S.v.z);
      if (hs > 0.05) { _axis.set(S.v.z, 0, -S.v.x).normalize(); _q.setFromAxisAngle(_axis, (hs * dt) / R); S.mesh.quaternion.premultiply(_q); }
    }
    S.mesh.position.copy(S.render);
    S.mesh.visible = S.has && active;
    // HUD line (juggle / goals) while near the ball
    const cam = game.camera.position;
    const near = S.mesh.visible && cam.distanceTo(S.render) < 30;
    const txt = near && (S.juggle >= 2 || S.goals > 0) ? `⚽ ${S.juggle >= 2 ? `JUGGLE x${S.juggle}` : ''}${S.juggle >= 2 && S.goals ? '  ·  ' : ''}${S.goals ? `GOALS ${S.goals}` : ''}${S.best ? `  (best ${S.best})` : ''}` : '';
    if (dock.textContent !== txt) { dock.textContent = txt; dock.style.display = txt ? '' : 'none'; }
  }

  // ---------------------------------------------------------------- hooks
  offs.push(game.mods.on('update', (dt, g) => { if (g === game) update(dt); }));
  offs.push(game.mods.on('netReady', (net, g) => { if (g === game) bindNet(net); }));
  offs.push(game.mods.on('mapLoaded', (world, g) => { if (g === game && world?.company) buildPitch(world); }));
  offs.push(game.mods.on('phase', (ph, g) => {
    if (g !== game || !game.isHost) return;
    if (ph === 'takeoff' || ph === 'orbit' || ph === 'landing') hostRespawn('ship');
    else if (ph === 'company') game.later?.(() => hostRespawn('pitch'), 600);
  }));
  offs.push(game.mods.on('interactables', (list, g) => {
    if (g !== game || !S.mesh?.visible || game.player.dead) return;
    if (game.camera.position.distanceTo(S.render) > 5) return;
    list.push({ pos: S.render.clone().add(_v2.set(0, 0.05, 0)), r: 0.75, reach: 3.2, label: () => t('Kick the ball [LMB / E]'), action: () => kickLocal() });
  }));
  window.addEventListener('mousedown', onMouseDown, true);
  try { game.mods.chatCommands?.set('ball', { fn: (args, g) => g.net?.request('ball', { op: 'reset' }), owner: null }); } catch { /* ignore */ }
  if (game.net) bindNet(game.net);
  if (game.world?.company) buildPitch(game.world);
  if (game.isHost) hostEnsureBody();

  return {
    state: S,
    /** test / debug helpers */
    kick(dir, sprint = false) { if (game.isHost && S.body) { const pl = game.aiPlayerById(game.selfId); if (pl) { hostKickAs(pl.id, dir, sprint); } } },
    respawn: (where) => hostRespawn(where || (atHQ() ? 'pitch' : 'ship')),
    kickLocal,
    position: () => S.render.clone(),
    goals: () => goalObjs.goals,
    dispose() {
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      window.removeEventListener('mousedown', onMouseDown, true);
      try { game.mods.chatCommands?.delete('ball'); } catch { /* ignore */ }
      if (boundNet) {
        if (boundNet.msgHandlers?.get('ball') === onMsg) boundNet.msgHandlers.delete('ball');
        if (boundNet.handlers?.get('ball') === onRequest) boundNet.handlers.delete('ball');
      }
      disposePitch();
      if (S.body) { try { game.physics.removeBody(S.body); } catch { /* world freed */ } S.body = null; }
      if (S.mesh) { S.mesh.geometry.dispose(); S.mesh.material.dispose(); S.mesh.removeFromParent(); S.mesh = null; }
      dock.remove();
    },
  };

  // eslint-disable-next-line no-unused-vars
  function hostKickAs(id, dir, sprint) {
    const eye = game.aiPlayerById(id)?.eye;
    if (!eye) return;
    hostKick(id, { d: Array.isArray(dir) ? dir : [dir.x, dir.y, dir.z], sp: sprint ? 1 : 0 });
  }
}
