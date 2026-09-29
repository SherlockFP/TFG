// AIMTELL (wave 5, docs/wave5/aimchase.md, MASTERPLAN 25.9): ONE shared telegraphed-aim helper for every creature that shoots at players.
//   Host  : atReady / atBegin / atStep / atShoot / atCancel (used by hs_gunner+hs_leader, scavraider, moderator, h2_sentry, facility turret,
//           skel_archer group claim). Timings, lock, accuracy table and the group limit live in aimtell_core.js (node-tested).
//   Client: installAimtell draws a thin emissive laser (no lights) from the muzzle to the aim point of every aiming creature, from the
//           creature's already-synced state: state 'aim' (or 'alert' for sentries) + `extra` = "pid" (aiming) / "pid|x|y|z" (locked).
//           Red + jittery while aiming, white and frozen during the 0.25 s lock ("dodge now"). Charge beeps (3D) rise in tempo; a sharp
//           tone marks the lock. No new net message: the shot itself still uses the existing 'hshot' fx.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import * as C from './aimtell_core.js';
import { sig, onCbMode } from '../core/a11y_core.js';   // [a11y]

const nowOf = (M) => M.game.time || 0;
const quotaOf = (M) => M.game.run?.quotaIndex || 0;
const grpOf = (g) => g._aimGrp || (g._aimGrp = new C.AimGroup());
export const atOf = (c) => c.data.at || (c.data.at = C.newAim());
const chestOf = (p) => [p.pos.x, p.eye.y - 0.45, p.pos.z];

/** group slot only (for shooters with their own windup, e.g. skeleton archers): claim before the draw, release when the arrow is loosed / interrupted */
export const atClaim = (c, M) => grpOf(M.game).claim(c.id, nowOf(M), C.maxFiring(quotaOf(M)));
export const atRelease = (c, M) => grpOf(M.game).release(c.id);

/** may this shooter start a new aim right now (cooldown over, idle)? */
export const atReady = (c, M) => C.aimReady(atOf(c), nowOf(M));
export const atLocked = (c) => atOf(c).ph === 'lock';
export const atAiming = (c) => atOf(c).ph !== 'idle';

/** start the aim phase at player `p`. Returns false (and backs off ~0.5 s) when the group limit is full or it is still cooling down.
 *  o.state: creature state to enter (default none), o.mul: aim-time multiplier (< 1 = trained shooter, still >= 0.8 s) */
export function atBegin(c, M, p, o = {}) {
  const a = atOf(c), now = nowOf(M), q = quotaOf(M);
  if (!C.aimReady(a, now)) return false;
  if (!grpOf(M.game).claim(c.id, now, C.maxFiring(q))) { a.next = now + 0.4 + Math.random() * 0.5; return false; }
  C.aimBegin(a, p.id, Math.random(), q, o.mul || 1);
  if (o.state && c.state !== o.state) c.setState(o.state);
  c.target = p.id; if (!o.noExtra) c.extra = C.encodeAim(p.id);   // noExtra: creatures whose `extra` is a number (turret head yaw)
  return true;
}

/** advance one tick. Returns 'lock' | 'fire' | null. `o.face(dt)` is called only while aiming (never during the lock: no tracking). */
export function atStep(c, dt, M, p, o = {}) {
  const a = atOf(c), now = nowOf(M);
  if (a.ph === 'idle') return null;
  grpOf(M.game).touch(c.id, now);
  if (a.ph === 'aim' && o.face) o.face(dt);
  const ev = C.aimTick(a, dt, now, Math.random(), quotaOf(M));
  if (ev === 'lock') { a.lock = chestOf(p); if (!o.noExtra) c.extra = C.encodeLock(p.id, a.lock); }
  else if (ev === 'fire') grpOf(M.game).release(c.id);
  return ev;
}

/** abort an aim (target lost / creature interrupted / dead): no shot, short pause */
export function atCancel(c, M) {
  const a = atOf(c);
  if (a.ph !== 'idle') { C.aimAbort(a, nowOf(M)); grpOf(M.game).release(c.id); }
  if (typeof c.extra === 'string') c.extra = 0;
}


/** resolve the shot after atStep returned 'fire': the bullet goes to the LOCKED point; it hurts only if `p` is still there and the accuracy roll succeeds.
 *  o: muzzle {x,y,z}, dmg, cause, accMul, noise, fx:false (caller draws its own tracer). Returns { hit, acc, cover, end:[x,y,z] }. */
export function atShoot(c, M, p, o = {}) {
  const g = M.game, a = atOf(c), q = quotaOf(M), m = o.muzzle;
  const lock = a.lock || chestOf(p), chest = chestOf(p);
  const dist = Math.hypot(chest[0] - m.x, chest[2] - m.z);
  const los = (a, b) => g.physics.lineOfSight?.(a, b) ?? true;
  const eyeLos = los(m, p.eye);
  const cover = eyeLos && !los(m, { x: p.pos.x, y: p.pos.y + 0.4, z: p.pos.z });
  const acc = C.accuracy({ dist, sprint: C.isSprinting(M.playerSpeed(p)), cover, crouch: !!p.crouch, quota: q, mul: o.accMul || 1 });
  const res = C.resolveShot(lock, chest, acc, Math.random());
  const hit = eyeLos && res.hit;
  let end = lock;
  if (!hit) {                                   // fly on past the locked point until a wall stops it
    const dir = new THREE.Vector3(lock[0] - m.x, lock[1] - m.y, lock[2] - m.z);
    const L = dir.length() || 1; dir.divideScalar(L);
    const h = g.physics.raycast?.(new THREE.Vector3(m.x, m.y, m.z), dir, L + 10, G.STATIC | G.DOOR);
    const T = h?.distance != null ? Math.min(h.distance, L + 10) : L + 6;
    end = [m.x + dir.x * T, m.y + dir.y * T, m.z + dir.z * T];
  }
  if (hit) M.attack(c, p, o.dmg ?? c.dmg, o.cause || c.type);
  if (o.fx !== false) {
    const r2 = (v) => +v.toFixed(2);
    g.net.broadcast('fx', { k: 'hshot', id: c.id, a: [r2(m.x), r2(m.y), r2(m.z)], b: end.map(r2), h: hit ? 1 : 0 });
  }
  M.noise?.(c.pos, o.noise ?? 2.6);
  if (typeof c.extra === 'string') c.extra = 0;
  return { hit, acc, cover, end };
}

// =====================================================================================================================================
// client: the visible laser
// =====================================================================================================================================
const AIM_STATES = new Set(['aim', 'alert']);
const FROM_LOCK_ONLY = new Set(['moderator']);   // its model already draws a red laser along its facing: we only add the white lock line

export function installAimtell(game) {
  const offs = [];
  const lines = new Map();                        // creature id -> { line, dot, seen }
  let disposed = false, geo = null, dotGeo = null, matRed = null, matWhite = null, offCb = null;
  const _f = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
  const has = (n) => { try { return !!game.audio?.has?.(n); } catch { return false; } };
  const snd = (names, pos, vol, pitch) => {
    const n = names.find(has); if (!n) return;
    try { game.audio?.at?.(n, pos, vol, { occlude: false, refDistance: 5, maxDistance: 70, pitch }); } catch { /* audio not ready */ }
  };
  function ensure() {
    if (geo) return;
    geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    dotGeo = new THREE.SphereGeometry(1, 6, 4);
    const mk = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    matRed = mk(sig('aimtell'), 0.75); matWhite = mk('#ffffff', 1);
    offCb = onCbMode(() => matRed.color.set(sig('aimtell')));   // [a11y]
  }
  function pair(id) {
    let e = lines.get(id);
    if (!e) {
      ensure();
      const line = new THREE.Mesh(geo, matRed), dot = new THREE.Mesh(dotGeo, matRed);
      line.frustumCulled = false; dot.frustumCulled = false; line.renderOrder = 20; dot.renderOrder = 20;
      game.scene.add(line, dot);
      e = { line, dot, seen: 0 };
      lines.set(id, e);
    }
    return e;
  }
  function drop(id) { const e = lines.get(id); if (!e) return; e.line.removeFromParent(); e.dot.removeFromParent(); lines.delete(id); }
  function muzzleOf(v, out) {
    const m = v.model?.muzzleWorld?.(out);
    if (m) return out.copy(m);
    const h = (v.def?.height || 1.8) * (v.type === 'h2_sentry' ? 0.55 : 0.78), y = v.yaw || 0;
    return out.set(v.pos.x + Math.sin(y) * 0.6, v.pos.y + h, v.pos.z + Math.cos(y) * 0.6);
  }
  function update(dt) {
    const views = game.creatures?.views;
    if (!views) return;
    const time = game.time || 0;
    for (const [id, v] of views) {
      if (v.state === 'dead' || !AIM_STATES.has(v.state)) { if (v._atPh) v._atPh = null; continue; }
      const info = C.parseAim(v.extra);
      if (!info) { v._atPh = null; continue; }
      const locked = !!info.lock;
      const phase = locked ? 'lock' : 'aim';
      // sound cues on the phase edges + a rising charge tempo while aiming
      if (v._atPh !== phase) {
        v._atPh = phase;
        if (phase === 'aim') { v._atT = 0; v._atBeep = 0; snd(['beep_3', 'turret_detect'], v.pos, 0.6, 0.9); }
        else snd(['turret_detect', 'beep_3'], v.pos, 0.9, 1.7);
      }
      if (phase === 'aim') {
        v._atT = (v._atT || 0) + dt; v._atBeep -= dt;
        if (v._atBeep <= 0) { v._atBeep = Math.max(0.09, 0.34 - v._atT * 0.22); snd(['beep_3', 'turret_detect'], v.pos, 0.28, 1 + Math.min(0.7, v._atT * 0.5)); }
      }
      if (FROM_LOCK_ONLY.has(v.type) && !locked) { const e0 = lines.get(id); if (e0) { e0.line.visible = false; e0.dot.visible = false; e0.seen = time; } continue; }
      if (locked) _t.set(info.lock[0], info.lock[1], info.lock[2]);
      else {
        const head = game.playerHeadById?.(info.pid);
        if (!head) continue;
        const a = C.jitterAmp(v._atT || 0), ph = String(id).length * 1.7 + 1;
        _t.set(head.x + Math.sin(time * 31 + ph) * a, head.y - 0.3 + Math.sin(time * 27 + ph * 2) * a * 0.6, head.z + Math.cos(time * 29 + ph) * a);
      }
      muzzleOf(v, _f);
      _d.copy(_t).sub(_f); const L = _d.length();
      if (L < 0.2) continue;
      _d.divideScalar(L);
      const wall = game.physics?.raycast?.(_f, _d, L, G.STATIC | G.DOOR);
      const len = wall?.distance != null ? Math.min(L, wall.distance) : L;
      const e = pair(id); e.seen = time;
      const mat = locked ? matWhite : matRed;
      e.line.material = mat; e.dot.material = mat;
      e.line.visible = e.dot.visible = true;
      e.line.position.copy(_f); _h.copy(_f).add(_d); e.line.lookAt(_h);
      const w = locked ? 0.035 : 0.014;
      e.line.scale.set(w, w, len);
      e.dot.position.copy(_f).addScaledVector(_d, len); e.dot.scale.setScalar(locked ? 0.11 : 0.06);
      if (!locked) matRed.opacity = 0.55 + 0.25 * Math.sin(time * 40);
    }
    for (const [id, e] of [...lines]) if (e.seen !== time) { const v = views.get(id); if (!v || !AIM_STATES.has(v.state) || !C.parseAim(v.extra) || v.state === 'dead') drop(id); }
  }
  offs.push(game.mods.on('update', (dt, g) => { if (!disposed && g === game) update(dt); }));
  return {
    lineCount: () => lines.size,
    dispose() { disposed = true; for (const f of offs) { try { f(); } catch { /* ignore */ } } for (const id of [...lines.keys()]) drop(id); geo?.dispose(); dotGeo?.dispose(); matRed?.dispose(); matWhite?.dispose(); offCb?.(); },
  };
}
