// UPLINK VAN — the crew's buyable, drivable 4-seat utility van (TFG's take on Lethal Company's Company Cruiser).
//
// Player-facing:
//   * Buy it at the ship terminal (BUY UPLINK VAN / BUY VAN, or the VAN command) for ▮CRUISER.price.
//     Bought in orbit -> it is lowered on a cable next to the ship on the next landing; bought while landed ->
//     delivered right away. It is part of the run save (run.cruiser) and comes back on every landing.
//   * Driver seat: E at the driver door. W/S throttle / brake / reverse, A/D steer, SPACE handbrake,
//     H horn (loud: creatures hear it), F headlights, E exit. Passenger seat + two bench seats in the bed.
//   * Cargo bed: drop/throw scrap into the bed (or E "Load ... into the van bed" while holding it) and it rides
//     along, locked to the bed. E on a cargo item takes it back (big items are set down behind the tailgate).
//   * Ramming: creatures take damage above ~15 km/h (and get knocked back); crewmates get hurt too.
//     Heavy creatures (Influencer, The Worm, bosses) stop the van dead. Hard crashes hurt the occupants.
//   * Flipped? Walk up and E "Push the van upright" (two people make it quicker).
//   * Takeoff: if the van is parked near the ship (< CRUISER.dockRadius m) it is winched aboard and its cargo is
//     moved into ship storage; left far away, it is LOST with its cargo (LC rules).
//
// Tech:
//   * Rapier ray-cast vehicle controller on a compound dynamic body (physics.createVehicleBody /
//     createVehicleController, stepped from a physics pre-step hook). Collider membership is STATIC so the
//     character controller, items and wheel rays treat it as solid; players/creatures are hit logically.
//   * Authority: the DRIVER's peer simulates it (or the host when nobody drives) and streams 'vanst' at 20 Hz
//     (net.send, peer -> all); everyone else runs it as an interpolated kinematic body. The host owns existence,
//     purchase, seats and cargo ('van' request -> 'van' broadcast). Late joiners send { op: 'sync' } on 'joined'.
//   * Headlights use ONE pooled spot light request (lights.requestSpot) + emissive lenses / glow sprites: no
//     THREE lights are ever created at runtime. Engine / horn / starter sounds are synthesized at runtime and
//     injected into the audio manager's buffer cache (audio.play('van_engine', ...)).
//
// Export: installCruiser(game) -> api (see bottom). Everything is guarded: a failure disables the van only.
import * as THREE from 'three';
import { G, groups } from '../physics/physics.js';
import { createCruiserModel, VAN } from '../models/cruiser.js';
import { insideShip } from '../world/ship.js';
import { itemDef } from '../game/items.js';
import { t } from '../core/i18n.js';
import { clamp, damp } from '../core/util.js';

export const CRUISER = {
  name: 'Uplink Van',
  price: 350,
  dockRadius: 38,          // parked within this distance of the ship at takeoff -> winched aboard
  maxSpeed: 19,            // m/s (~68 km/h)
  maxReverse: 6,
  engineForce: 1000,        // per wheel (AWD)
  brakeForce: 55,
  handbrake: 90,
  parkBrake: 30,
  ramMinSpeed: 4.2,        // m/s
};

const SEND_HZ = 20;
const UP = new THREE.Vector3(0, 1, 0);
const HEAVY = new Set(['giant', 'sandkefal', 'foreman', 'kefalshark']);
const PARK_SPOTS = [[-3.5, 9.6, Math.PI / 2], [-3.5, -9.6, Math.PI / 2], [10.5, 7.5, 0], [10.5, -7.5, 0], [-13.5, 7, 0], [0, 15, Math.PI / 2], [-15, -8, 0]];
const BED_SLOTS = [];
for (const z of [0.9, 1.35, 1.8, 2.15]) for (const x of [-0.55, 0, 0.55]) BED_SLOTS.push([x, z]);

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();

const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const yawOfQ = (q) => { _v3.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-_v3.x, -_v3.z); };

// ------------------------------------------------------------------ procedural sounds (runtime synth)
function makeRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function synthEngine(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 1.0), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const rnd = makeRng(7);
  let lp = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const ph = tt * 36;                                             // 36 firing pulses per loop (integer -> seamless)
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * ph), 5);
    const lump = Math.sin(Math.PI * 2 * 18 * tt) * 0.35 + Math.sin(Math.PI * 2 * 9 * tt + 1) * 0.15;
    lp += (rnd() * 2 - 1 - lp) * 0.08;
    const v = pulse * 0.9 + lump * (0.4 + pulse * 0.6) + lp * (0.25 + pulse * 0.9) + Math.sin(Math.PI * 2 * 72 * tt) * 0.12 * pulse;
    d[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) d[i] = d[i] / peak * 0.85;
  return buf;
}
function synthHorn(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 0.5), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    let v = 0;
    for (const f of [370, 466]) for (let h = 1; h <= 7; h += 2) v += Math.sin(Math.PI * 2 * f * h * tt) / (h * 1.3);
    v = Math.tanh(v * 1.6);
    d[i] = v; peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) d[i] = d[i] / peak * 0.8;
  return buf;
}
function synthStarter(ctx) {
  const sr = ctx.sampleRate, n = Math.round(sr * 1.1), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  const rnd = makeRng(3);
  let lp = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    lp += (rnd() * 2 - 1 - lp) * 0.2;
    let v;
    if (tt < 0.6) {                                                  // starter motor cranking
      const crank = Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * 9 * tt), 3);
      v = crank * (Math.sin(Math.PI * 2 * 140 * tt) * 0.5 + lp * 0.6);
    } else {                                                         // catch + rev
      const k = tt - 0.6, f = 30 + 50 * Math.exp(-k * 5);
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * f * k * 1.4), 4);
      v = (pulse + lp * 0.5 * pulse) * Math.min(1, k * 20) * Math.exp(-k * 1.2);
    }
    d[i] = v; peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) d[i] = d[i] / peak * 0.85;
  return buf;
}

// ------------------------------------------------------------------ install
export function installCruiser(game) {
  const physics = game.physics;
  const scene = game.scene;
  const offs = [];
  let disposed = false, errors = 0, boundNet = null;

  // replicated / local state
  const st = {
    present: false, body: null, colliders: [], vc: null, model: null,
    seats: [null, null, null, null],
    cargo: new Map(),                     // itemId -> { o: Vector3 (local), q: Quaternion (local) }
    lights: false, brake: false, reverse: false, horn: false, engine: false, handbrake: false,
    steer: 0, rpm: 0, speed: 0,
    target: null,                         // { p, q, v, at } latest authoritative snapshot (non-authority)
    drop: null,                           // { t, dur, to: Vector3, q: Quaternion, rope }
    spin: [0, 0, 0, 0], susp: [0.224, 0.224, 0.224, 0.224],
    kinematic: false,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(),
  };
  const ctl = { throttle: 0, steer: 0, handbrake: false, horn: false };
  const local = {
    seat: -1, seatRel: 0, bob: 0, bobV: 0, prevVy: 0, sendT: 0, idleSendT: 0, seq: 0, noiseT: 0,
    ramCd: new Map(), hitCd: new Map(), lastSpeed: 0, crashCd: 0, pendingBuy: false, requestedSeat: -1,
  };
  const snd = { engine: null, horn: null, ready: false };
  const hostState = { lastPhase: null, lastOwned: undefined, attachT: 0, seatT: 0, deploying: false };

  const net = () => game.net;
  const selfId = () => game.net?.selfId;
  const isHost = () => !!game.net?.isHost;
  const authId = () => st.seats[0] || game.net?.hostId || null;
  const isAuth = () => !!game.net && authId() === selfId();
  const run = () => game.run || {};
  const dropping = () => !!st.drop && !st.drop.landed;

  // ------------------------------------------------------------------ audio
  function ensureSounds() {
    if (snd.ready) return true;
    const a = game.audio;
    if (!a?.ctx || !a.buffers) return false;
    try {
      if (!a.buffers.get('van_engine')) a.buffers.set('van_engine', synthEngine(a.ctx));
      if (!a.buffers.get('van_horn')) a.buffers.set('van_horn', synthHorn(a.ctx));
      if (!a.buffers.get('van_start')) a.buffers.set('van_start', synthStarter(a.ctx));
      snd.ready = true;
    } catch (e) { console.warn('cruiser sounds', e); snd.ready = true; }
    return true;
  }
  function stopLoops() {
    snd.engine?.stop(0.4); snd.engine = null;
    snd.horn?.stop(0.08); snd.horn = null;
  }
  function updateSounds() {
    if (!st.present || !st.model || !ensureSounds()) { stopLoops(); return; }
    const a = game.audio;
    const inside = local.seat >= 0;
    if (st.engine) {
      if (!snd.engine) snd.engine = a.play('van_engine', { loop: true, follow: st.model.root, volume: 0.1, refDistance: 4, maxDistance: 90, bus: 'sfx', reverb: 0.2 });
      if (snd.engine) {
        snd.engine.setPitch(0.62 + st.rpm * 1.25);
        snd.engine.setVolume((inside ? 0.28 : 0.42) * (0.55 + st.rpm * 0.6));
      }
    } else if (snd.engine) { snd.engine.stop(0.5); snd.engine = null; }
    if (st.horn) {
      if (!snd.horn) snd.horn = a.play('van_horn', { loop: true, follow: st.model.root, volume: 0.75, refDistance: 8, maxDistance: 160, bus: 'sfx' });
    } else if (snd.horn) { snd.horn.stop(0.06); snd.horn = null; }
  }
  const sfxAt = (name, vol = 0.8, pitch = 1, ref = 4) => { try { game.audio.at(name, st.pos.clone(), vol, { refDistance: ref, maxDistance: 80, pitch, occlude: true }); } catch { /* ignore */ } };

  // ------------------------------------------------------------------ spawn / despawn (all peers)
  function spawnVan(p, q, drop) {
    despawnVan(true);
    st.model = createCruiserModel();
    scene.add(st.model.root);
    const pos = new THREE.Vector3().fromArray(p);
    const quat = new THREE.Quaternion().fromArray(q);
    const start = drop ? pos.clone().add(new THREE.Vector3(0, 70, 0)) : pos;
    const { body, colliders } = physics.createVehicleBody(start, quat, VAN.colliders, { data: { kind: 'vehicle', vehicle: 'cruiser' } });
    st.body = body; st.colliders = colliders;
    const vc = physics.createVehicleController(body);
    for (const w of VAN.wheels) {
      vc.addWheel({ x: w.x, y: VAN.wheelY, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, VAN.suspRest, VAN.wheelR);
    }
    for (let i = 0; i < VAN.wheels.length; i++) {
      vc.setWheelSuspensionStiffness(i, 40);
      vc.setWheelMaxSuspensionForce(i, 1e5);
      vc.setWheelSuspensionCompression(i, 3.5);
      vc.setWheelSuspensionRelaxation(i, 4.5);
      vc.setWheelMaxSuspensionTravel(i, 0.3);
      vc.setWheelFrictionSlip(i, 2.4);
      vc.setWheelSideFrictionStiffness(i, 1.0);
    }
    st.vc = vc;
    st.present = true;
    st.kinematic = false;
    st.pos.copy(start); st.quat.copy(quat); st.vel.set(0, 0, 0);
    st.target = { p: pos.clone(), q: quat.clone(), v: new THREE.Vector3(), at: performance.now() };
    st.lights = false; st.brake = false; st.reverse = false; st.horn = false; st.engine = !!st.seats[0];
    st.model.root.position.copy(start); st.model.root.quaternion.copy(quat);
    if (drop) {
      const rope = makeRope();
      st.drop = { t: 0, dur: 3.4, to: pos.clone(), q: quat.clone(), rope, landed: false, retract: 0 };
      sfxAt('dropship', 1, 1, 12);
    } else st.drop = null;
    ensureBodyMode(true);
  }

  function makeRope() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 80, 0)]);
    const mat = new THREE.LineBasicMaterial({ color: 0x1c1c1c });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    return line;
  }
  function disposeRope(d) { if (!d?.rope) return; d.rope.removeFromParent(); d.rope.geometry.dispose(); d.rope.material.dispose(); d.rope = null; }

  function despawnVan(silent) {
    if (st.drop) disposeRope(st.drop);
    st.drop = null;
    if (local.seat >= 0) leaveSeatLocal(false);
    stopLoops();
    if (st.vc) { physics.removeVehicleController(st.vc); st.vc = null; }
    if (st.body) { physics.removeBody(st.body); st.body = null; st.colliders = []; }
    if (st.model) { st.model.dispose(); st.model = null; }
    // cargo items keep their last world transform and get physics back
    for (const id of st.cargo.keys()) { const it = game.items.get(id); if (it) { it.vanCargo = false; if (it.state === 'world' && !it.body) it.makeBody(); } }
    st.cargo.clear();
    const wasPresent = st.present;
    st.present = false;
    st.seats = [null, null, null, null];
    if (wasPresent && !silent) game.ui?.hud?.setPrompt?.(null);
  }

  // ------------------------------------------------------------------ body authority
  function ensureBodyMode(force) {
    if (!st.body) return;
    const wantKin = !!st.drop || !isAuth() || ['takeoff', 'orbit', 'landing'].includes(run().phase);
    if (!force && wantKin === st.kinematic) return;
    st.kinematic = wantKin;
    st.body.setBodyType(wantKin ? 2 : 0, true);
    if (!wantKin) {
      st.body.setTranslation(st.pos, true);
      st.body.setRotation(st.quat, true);
      const v = st.target?.v || st.vel;
      st.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      st.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      st.body.wakeUp();
    }
  }

  function snapshot() {
    const p = st.pos, q = st.quat, v = st.vel;
    const flags = (st.lights ? 1 : 0) | (st.brake ? 2 : 0) | (st.reverse ? 4 : 0) | (st.horn ? 8 : 0) | (st.engine ? 16 : 0) | (st.handbrake ? 32 : 0);
    return [r3(p.x), r3(p.y), r3(p.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w), r3(v.x), r3(v.y), r3(v.z), r3(st.steer), flags, Math.round(st.rpm * 100) / 100, ++local.seq];
  }
  function applySnap(s, hard) {
    if (!Array.isArray(s) || s.length < 13) return;
    const tg = st.target || (st.target = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), at: 0 });
    tg.p.set(s[0], s[1], s[2]); tg.q.set(s[3], s[4], s[5], s[6]).normalize(); tg.v.set(s[7], s[8], s[9]); tg.at = performance.now();
    if (!isAuth() || hard) {
      st.steer = s[10];
      const f = s[11] | 0;
      if (!isAuth()) { st.lights = !!(f & 1); st.brake = !!(f & 2); st.reverse = !!(f & 4); st.horn = !!(f & 8); st.handbrake = !!(f & 32); st.rpm = s[12] || 0; }
      st.engine = !!(f & 16);
    }
    if (hard || tg.p.distanceTo(st.pos) > 12) {
      st.pos.copy(tg.p); st.quat.copy(tg.q); st.vel.copy(tg.v);
      if (st.body) {
        st.body.setTranslation(st.pos, true); st.body.setRotation(st.quat, true);
        if (!st.kinematic) st.body.setLinvel({ x: st.vel.x, y: st.vel.y, z: st.vel.z }, true);
      }
    }
  }

  // ------------------------------------------------------------------ seats (local)
  function seatWorld(i, key, out = new THREE.Vector3()) {
    const s = VAN.seats[i];
    return out.fromArray(s[key]).applyQuaternion(st.quat).add(st.pos);
  }
  function enterSeatLocal(i) {
    const p = game.player;
    local.seat = i;
    local.seatRel = 0;                                   // face forward when sitting down
    p.pitch = clamp(p.pitch, -0.35, 0.25);
    local.bob = 0; local.bobV = 0; local.prevVy = st.vel.y; local.placed = false;
    ctl.throttle = 0; ctl.steer = 0; ctl.handbrake = false; ctl.horn = false;
    try { game.grab?.item && game.grab.stop(); } catch { /* ignore */ }
    p.crouch = true;
    p.vel.set(0, 0, 0);
    sfxAt('door_close', 0.55, 1.25, 2);
    if (i === 0) { ensureSounds(); try { game.audio.play('van_start', { follow: st.model?.root, volume: 0.7, refDistance: 4, bus: 'sfx' }); } catch { /* ignore */ } }
    if (!local.told) { local.told = true; game.ui?.toast?.(i === 0 ? t('UPLINK VAN: W/S drive · A/D steer · SPACE brake · H horn · F lights · E exit') : t('You hop in. [E] to get out.'), 'info'); }
  }
  function leaveSeatLocal(teleport = true) {
    const p = game.player;
    const i = local.seat;
    local.seat = -1;
    ctl.throttle = 0; ctl.steer = 0; ctl.horn = false; ctl.handbrake = false;
    if (i === 0 && isAuth()) { st.horn = false; }
    p.vel.set(0, 0, 0); p.minVelY = 0; p.fallStartY = null;
    if (teleport && st.present && !p.dead) {
      const spot = exitSpot(i);
      p.teleport(spot, p.yaw);
      sfxAt('door_close', 0.55, 1.2, 2);
    }
    game.ui?.hud?.setPrompt?.(null);
  }
  function exitSpot(i) {
    const s = VAN.seats[Math.max(0, i)];
    const tries = [s.exit, [-s.exit[0], s.exit[1], s.exit[2]], [0, 0, 3.4], [0, 0, -3.6]];
    const eye = seatWorld(Math.max(0, i), 'eye');
    for (const tl of tries) {
      const w = new THREE.Vector3().fromArray(tl).applyQuaternion(st.quat).add(st.pos);
      w.y = Math.max(w.y, st.pos.y) + 1.2;
      const dir = w.clone().sub(eye); const L = dir.length(); dir.normalize();
      const block = physics.raycast(eye, dir, L, G.STATIC | G.DOOR, null, st.body);
      if (block) continue;
      const g = physics.raycast(w, { x: 0, y: -1, z: 0 }, 6, G.STATIC | G.DOOR, null, st.body);
      if (!g) continue;
      return new THREE.Vector3(w.x, g.point.y + 0.05, w.z);
    }
    return st.pos.clone().add(new THREE.Vector3(0, 2.0, 0));   // roof
  }

  // LocalPlayer hook: returns true when the player is seated (skip walking). Mouse look was already applied.
  function seatedUpdate(p, dt, input) {
    if (local.seat < 0 || !st.present) return false;
    local.seatRel = clamp(local.seatRel - (p.lookDelta?.x || 0), -2.3, 2.3);
    if (local.seat === 0 && input.enabled) {
      ctl.throttle = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      ctl.steer = (input.isDown('left') ? 1 : 0) - (input.isDown('right') ? 1 : 0);
      ctl.handbrake = input.isDown('jump');
      ctl.horn = input.codeDown('KeyH');
    } else if (local.seat === 0) { ctl.throttle = 0; ctl.steer = 0; ctl.horn = false; ctl.handbrake = false; }
    p.stunT = Math.max(0, (p.stunT || 0) - dt);
    p.slowT = Math.max(0, (p.slowT || 0) - dt);
    p.vel.set(0, 0, 0);
    p.grounded = true; p.minVelY = 0; p.fallStartY = null;
    p.sprinting = false; p.jetting = false;
    p.crouch = true;
    // resting in the seat slowly restores stamina
    p.stamina = Math.min(p.maxStamina || 100, (p.stamina || 0) + (game.stats?.staminaRegen || 10) * dt);
    return true;
  }

  // actions.js hook: seated players only get exit / lights / horn / scan instead of the normal interactions.
  function seatedActions(dt, input) {
    const driver = local.seat === 0;
    try { game.ensureSlots?.(); } catch { /* ignore */ }
    const kmh = Math.abs(st.speed) * 3.6;
    const label = driver ? `${t('UPLINK VAN')} · ${Math.round(kmh)} km/h` : t('Riding in the Uplink Van');
    const sub = driver ? t('[W/S] drive · [A/D] steer · [SPACE] brake · [H] horn · [F] lights · [E] exit') : t('[E] exit · [RMB] scan');
    game.ui?.hud?.setPrompt?.(label, sub);
    if (!input.enabled) return;
    if (input.pressed('interact')) { requestExit(); return; }
    if (input.pressed('flashlight')) {
      if (driver) { st.lights = !st.lights; sfxAt('flashlight_click', 0.6, 0.8, 2); }
      else game.toggleFlashlight?.();
    }
    if (input.mouseClicked(2)) game.scan?.();
    try { game.updateBatteries?.(dt); } catch { /* ignore */ }
  }

  function requestEnter(i) {
    if (!st.present || dropping()) return;
    local.requestedSeat = i;
    net()?.request('van', { op: 'enter', seat: i });
  }
  function requestExit() {
    const snap = local.seat === 0 && isAuth() ? snapshot() : undefined;
    net()?.request('van', { op: 'exit', x: snap });
    // predict locally so the exit feels instant
    leaveSeatLocal(true);
  }

  // ------------------------------------------------------------------ driving (authority, fixed step)
  // the game runs at 2x gravity: give the engine extra pull on climbs so hills stay drivable (arcade)
  const hillAssist = (climb) => (climb > 0 ? (st.body ? st.body.mass() : 800) * 19.6 * clamp(climb, 0, 0.6) * 0.95 / VAN.wheels.length : 0);

  function preStep(dt) {
    if (disposed || !st.present || !st.body || !st.vc || st.kinematic || st.drop) return;
    const body = st.body, vc = st.vc;
    const rot = body.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    const fwd = _v.set(0, 0, -1).applyQuaternion(_q);
    const lv = body.linvel();
    const speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z;
    const driver = !!st.seats[0];
    const localDriver = driver && st.seats[0] === selfId();
    const thr = localDriver ? ctl.throttle : 0;
    const steerIn = localDriver ? ctl.steer : 0;
    const hb = localDriver ? ctl.handbrake : false;
    let engine = 0, brake = 0, rev = false, braking = false;
    if (!driver) brake = CRUISER.parkBrake;
    else if (thr > 0) {
      if (speed < -0.6) { brake = CRUISER.brakeForce; braking = true; }
      else engine = -(CRUISER.engineForce * clamp(1.15 - Math.max(0, speed) / CRUISER.maxSpeed, 0, 1) + hillAssist(fwd.y)) * thr;
    } else if (thr < 0) {
      if (speed > 0.6) { brake = CRUISER.brakeForce; braking = true; }
      else { engine = (CRUISER.engineForce * 0.7 * clamp(1 - Math.max(0, -speed) / CRUISER.maxReverse, 0, 1) + hillAssist(-fwd.y)) * -thr; rev = true; }
    } else brake = 1.5;                                             // engine braking / rolling resistance
    if (hb) { braking = true; }
    if (engine !== 0) body.wakeUp();
    const steerMax = clamp(0.58 - Math.abs(speed) * 0.018, 0.2, 0.58);
    st.steer = damp(st.steer, steerIn * steerMax, steerIn ? 5 : 7, dt);
    for (let i = 0; i < VAN.wheels.length; i++) {
      const w = VAN.wheels[i];
      vc.setWheelEngineForce(i, engine);
      vc.setWheelBrake(i, hb && !w.front ? CRUISER.handbrake : brake);
      vc.setWheelSteering(i, w.front ? st.steer : 0);
      if (hb && !w.front) vc.setWheelSideFrictionStiffness(i, 0.55); else vc.setWheelSideFrictionStiffness(i, 1.0);
    }
    if (st.rightT > 0) {
      st.rightT -= dt;
      const up = _v2.set(0, 1, 0).applyQuaternion(_q);
      if (up.y > 0.93) st.rightT = 0;
      else {
        let ax = _v3.crossVectors(up, UP);
        if (ax.lengthSq() < 1e-3) ax = _v3.set(0, 0, 1).applyQuaternion(_q);   // exactly upside down: roll about the long axis
        ax.normalize();
        const ang = Math.acos(clamp(up.y, -1, 1));
        const w = Math.min(3.2, ang * 2.4 + 0.6) * (st.rightPow || 1);
        body.setAngvel({ x: ax.x * w, y: ax.y * w, z: ax.z * w }, true);
        const lvy = body.linvel();
        body.setLinvel({ x: lvy.x * 0.9, y: Math.max(lvy.y, up.y < 0.3 ? 2.2 : 0.6), z: lvy.z * 0.9 }, true);
      }
    }
    const self = body.handle;
    vc.updateVehicle(dt, undefined, groups(0xffff, G.STATIC), (c) => c.parent()?.handle !== self);
    // gentle anti-roll assist while grounded (keeps a PSX van from tumbling on every bump)
    let contacts = 0;
    for (let i = 0; i < VAN.wheels.length; i++) if (vc.wheelIsInContact(i)) contacts++;
    if (contacts >= 2) {
      const up = _v2.set(0, 1, 0).applyQuaternion(_q);
      const ax = _v3.crossVectors(up, UP);
      const m = body.mass();
      body.applyTorqueImpulse({ x: ax.x * m * 2.2 * dt, y: 0, z: ax.z * m * 2.2 * dt }, true);
    }
    st.brake = braking || (driver && thr === 0 && Math.abs(speed) < 0.3);
    st.reverse = rev;
    st.handbrake = hb;
    st.contacts = contacts;
  }

  // ------------------------------------------------------------------ per-frame
  function syncTransform(dt) {
    if (!st.body) return;
    if (st.drop) {
      const d = st.drop;
      if (!d.landed) {
        d.t += dt;
        const u = clamp(d.t / d.dur, 0, 1);
        const e = 1 - Math.pow(1 - u, 3);
        st.pos.copy(d.to).add(_v.set(Math.sin(d.t * 2.1) * 0.25 * (1 - u), 70 * (1 - e), 0));
        st.quat.copy(d.q).multiply(_q2.setFromEuler(_e.set(Math.sin(d.t * 1.7) * 0.05 * (1 - u), 0, Math.sin(d.t * 2.3) * 0.06 * (1 - u))));
        st.body.setNextKinematicTranslation(st.pos); st.body.setNextKinematicRotation(st.quat);
        if (u >= 1) {
          d.landed = true;
          sfxAt('land_hard', 1.1, 0.6, 8);
          sfxAt('ship_land', 0.35, 1.4, 10);
          try { game.particles?.burst(st.pos.clone().add(_v.set(0, -0.6, 0)), 'dust', null, 2.5); } catch { /* ignore */ }
          const dist = st.pos.distanceTo(game.camera.position);
          game.engine?.shake?.(clamp(0.9 - dist / 40, 0, 0.7));
          if (isHost()) game.net.broadcast('sys', { text: 'UPLINK VAN delivered next to the ship. Hop in!', kind: 'good' });
        }
      } else {
        d.retract += dt;
        if (d.retract > 1.4) { disposeRope(d); st.drop = null; ensureBodyMode(true); }
      }
      if (d.rope) {
        const a = st.pos.clone().add(_v.set(0, 1.6, 0).applyQuaternion(st.quat));
        const pos = d.rope.geometry.attributes.position;
        const top = d.landed ? a.y + 2 + d.retract * 60 : a.y + 80;
        pos.setXYZ(0, a.x, d.landed ? a.y + d.retract * 55 : a.y, a.z); pos.setXYZ(1, a.x, top, a.z);
        pos.needsUpdate = true;
      }
    } else if (!st.kinematic) {
      const tr = st.body.translation(), ro = st.body.rotation(), lv = st.body.linvel();
      st.pos.set(tr.x, tr.y, tr.z); st.quat.set(ro.x, ro.y, ro.z, ro.w); st.vel.set(lv.x, lv.y, lv.z);
      if (tr.y < -420) { st.body.setTranslation({ x: 0, y: 5, z: 12 }, true); st.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    } else {
      const tg = st.target;
      if (tg) {
        const age = Math.min(0.3, (performance.now() - tg.at) / 1000);
        _v.copy(tg.p).addScaledVector(tg.v, age);
        const k = 1 - Math.exp(-18 * dt);
        st.pos.lerp(_v, k);
        st.quat.slerp(tg.q, k);
        st.vel.lerp(tg.v, k);
      }
      st.body.setNextKinematicTranslation(st.pos); st.body.setNextKinematicRotation(st.quat);
    }
    const fwd = _v.set(0, 0, -1).applyQuaternion(st.quat);
    st.speed = st.vel.dot(fwd);
    st.model.root.position.copy(st.pos);
    st.model.root.quaternion.copy(st.quat);
  }

  function updateVisuals(dt) {
    const m = st.model;
    if (!m) return;
    if (!st.kinematic && st.vc) {
      for (let i = 0; i < 4; i++) {
        const L = st.vc.wheelSuspensionLength(i);
        st.susp[i] = damp(st.susp[i], L == null ? VAN.suspRest : clamp(L, 0.05, VAN.suspRest), 20, dt);
      }
    } else for (let i = 0; i < 4; i++) st.susp[i] = damp(st.susp[i], 0.224, 6, dt);
    for (let i = 0; i < 4; i++) st.spin[i] -= (st.speed / VAN.wheelR) * dt;
    if (isAuth() && st.seats[0]) st.rpm = damp(st.rpm, clamp(Math.abs(st.speed) / CRUISER.maxSpeed + Math.abs(ctl.throttle) * 0.25, 0, 1), 4, dt);
    else if (!st.seats[0]) st.rpm = damp(st.rpm, 0, 3, dt);
    if (isAuth()) st.engine = !!st.seats[0];
    m.update(dt, { steer: st.steer, spin: st.spin, susp: st.susp });
    m.setLights(st.lights && st.engine);
    m.setBrake(st.brake && st.engine);
    m.setReverse(st.reverse && st.engine);
    m.setBeacon(st.horn);
    if (local.seat >= 0) m.setDash(Math.abs(st.speed) * 3.6, upFactor() < 0.4 ? 'FLIPPED!' : st.handbrake ? 'HANDBRAKE' : 'UPLINK OK');
    // headlights: one pooled spot for the pair (+ lens glow in the model)
    if (st.lights && st.engine) {
      const front = _v.set(0, 0.47, -2.6).applyQuaternion(st.quat).add(st.pos);
      const fwd = _v2.set(0, -0.12, -1).normalize().applyQuaternion(st.quat);
      const d = game.camera.position.distanceTo(front);
      game.lights.requestSpot({
        pos: front.clone(), target: front.clone().addScaledVector(fwd, 16), color: 0xfff0d0,
        priority: local.seat >= 0 ? 0.5 : 1 + d / 80, intensity: 70, distance: 48, angle: 0.62, penumbra: 0.55,
      });
    }
  }
  const upFactor = () => _v3.set(0, 1, 0).applyQuaternion(st.quat).y;

  function updateLocalSeat(dt) {
    const p = game.player;
    if (local.seat < 0) return;
    if (p.dead) { local.seat = -1; net()?.request('van', { op: 'exit' }); return; }
    const feet = seatWorld(local.seat, 'feet');
    if (p.pos.distanceTo(feet) > 3.5 && local.placed) {        // teleported away (ship teleporter etc.)
      local.seat = -1; local.placed = false;
      net()?.request('van', { op: 'exit' });
      return;
    }
    local.placed = true;
    p.pos.copy(feet);
    const eyeW = seatWorld(local.seat, 'eye');
    p.eye = eyeW.y - feet.y;
    const half = p.half ?? 0.22;
    p.body?.setNextKinematicTranslation({ x: feet.x, y: feet.y + half + 0.36, z: feet.z });
    // head bob from vertical acceleration + engine rumble
    const ay = (st.vel.y - local.prevVy) / Math.max(dt, 1e-3);
    local.prevVy = st.vel.y;
    local.bobV += (-local.bob * 90 - local.bobV * 11 - clamp(ay, -40, 40) * 0.05) * dt;
    local.bob = clamp(local.bob + local.bobV * dt, -0.12, 0.12);
    const bobOn = game.settings?.headBob !== false;
    const rumble = st.engine && bobOn ? Math.sin(game.time * 71) * 0.0035 * (0.5 + st.rpm) : 0;
    const shake = game.engine?.fx?.shake || 0;
    const cam = game.camera;
    const vanYaw = yawOfQ(st.quat);
    p.yaw = vanYaw + local.seatRel;
    cam.position.copy(eyeW);
    cam.position.y += (bobOn ? local.bob : 0) + rumble + (Math.random() - 0.5) * shake * 0.08;
    _q.setFromEuler(_e.set(p.pitch, local.seatRel, 0, 'YXZ'));
    cam.quaternion.copy(st.quat).multiply(_q);
    cam.rotation.setFromQuaternion(cam.quaternion, 'YXZ');
    const fovT = (game.settings?.fov || 75) + clamp(Math.abs(st.speed) * 0.35, 0, 8);
    cam.fov = damp(cam.fov, fovT, 5, dt);
    cam.updateProjectionMatrix();
    p.noise = st.engine ? 0.45 + st.rpm * 0.4 : 0.05;
    p.hSpeed = Math.abs(st.speed);
  }

  // remote avatars sitting in the van follow the local van transform (smooth, no double interpolation)
  function onRemoteAvatar(r) {
    if (!st.present) return;
    const i = st.seats.indexOf(r.id);
    if (i < 0 || r.dead) return;
    const feet = seatWorld(i, 'feet');
    r.pos.copy(feet); r.target.copy(feet);
    r.root.position.copy(feet);
    r.root.rotation.y = yawOfQ(st.quat) + Math.PI;
    r.body?.setNextKinematicTranslation({ x: feet.x, y: feet.y + 0.9, z: feet.z });
  }

  // ------------------------------------------------------------------ cargo (all peers)
  function cargoAdd(id, o, q) {
    const it = game.items.get(id);
    if (!it) return;
    it.removeBody();
    it.vanCargo = true;
    st.cargo.set(id, { o: new THREE.Vector3().fromArray(o), q: new THREE.Quaternion().fromArray(q).normalize() });
  }
  function cargoRemove(id) {
    const c = st.cargo.get(id);
    if (!c) return;
    st.cargo.delete(id);
    const it = game.items.get(id);
    if (it) it.vanCargo = false;
  }
  function updateCargo() {
    for (const [id, c] of st.cargo) {
      const it = game.items.get(id);
      if (!it || it.state !== 'world') { st.cargo.delete(id); if (it) it.vanCargo = false; continue; }
      if (it.body) it.removeBody();
      it.obj.position.copy(c.o).applyQuaternion(st.quat).add(st.pos);
      it.obj.quaternion.copy(st.quat).multiply(c.q);
    }
  }
  function inBed(lp, margin = 0) {
    const b = VAN.bed;
    return lp.x > b.x0 - margin && lp.x < b.x1 + margin && lp.z > b.z0 - margin && lp.z < b.z1 + margin && lp.y > b.y0 - 0.25 && lp.y < b.y1;
  }

  // ------------------------------------------------------------------ ramming (local driver = authority)
  function updateRamming(dt) {
    if (!isAuth() || st.seats[0] !== selfId() || st.drop) return;
    for (const [k, v] of local.ramCd) { const nv = v - dt; if (nv <= 0) local.ramCd.delete(k); else local.ramCd.set(k, nv); }
    for (const [k, v] of local.hitCd) { const nv = v - dt; if (nv <= 0) local.hitCd.delete(k); else local.hitCd.set(k, nv); }
    // crash detection (sudden stop)
    local.crashCd = Math.max(0, local.crashCd - dt);
    const dv = local.lastSpeed - Math.abs(st.speed);
    local.lastSpeed = Math.abs(st.speed);
    if (dv > 6.5 && local.crashCd <= 0) {
      local.crashCd = 0.8;
      net()?.send('vanfx', { k: 'crash', s: r3(dv) });
      onVanFx({ k: 'crash', s: dv });
    }
    const spd = Math.abs(st.speed);
    if (spd < CRUISER.ramMinSpeed) return;
    const inv = _q2.copy(st.quat).invert();
    const lead = st.speed >= 0 ? -1 : 1;                             // front is -z when driving forward
    const test = (pos, rad) => {
      const lp = _v.copy(pos).sub(st.pos).applyQuaternion(inv);
      if (lp.y < -1.6 || lp.y > 2.6) return false;
      if (Math.abs(lp.x) > VAN.halfW + rad) return false;
      if (Math.abs(lp.z) > VAN.halfL + rad + 0.25) return false;
      return lp.z * lead > -0.8;                                     // leading half only
    };
    for (const v of game.creatures.views.values()) {
      if (v.state === 'dead' || v.def?.hazard || local.ramCd.has(v.id)) continue;
      const rad = clamp((v.model?.radius || v.def?.radius || 0.55), 0.3, 1.6);
      if (!test(v.pos, rad)) continue;
      local.ramCd.set(v.id, 0.9);
      const heavy = HEAVY.has(v.type) || !!v.def?.boss;
      const dmg = Math.round((spd - 3) * (heavy ? 2.2 : 7.5));
      const dir = _v2.copy(st.vel).setY(0).normalize();
      net()?.request('van', { op: 'ram', cid: v.id, dmg, d: [r3(dir.x), r3(dir.z)], s: r3(spd) });
      sfxAt(heavy ? 'hit_metal' : 'hit_flesh', 1, heavy ? 0.6 : 0.8, 4);
      game.engine?.shake?.(heavy ? 0.8 : 0.35);
      if (heavy && st.body && !st.kinematic) st.body.setLinvel({ x: -st.vel.x * 0.25, y: st.vel.y + 1.5, z: -st.vel.z * 0.25 }, true);
    }
    if (spd < 5) return;
    for (const r of game.remotes.values()) {
      if (r.dead || st.seats.includes(r.id) || local.hitCd.has(r.id)) continue;
      if (!test(r.pos, 0.4)) continue;
      local.hitCd.set(r.id, 1.4);
      net()?.request('van', { op: 'hitp', pid: r.id, dmg: Math.round(clamp((spd - 4) * 5.5, 8, 90)) });
      sfxAt('hit_flesh', 0.9, 0.7, 4);
    }
  }

  function onVanFx(d) {
    if (!st.present) return;
    if (d.k === 'crash') {
      const s = +d.s || 0;
      sfxAt('hit_metal', clamp(0.5 + s / 14, 0.5, 1.2), 0.55, 5);
      sfxAt('land_hard', 0.7, 0.8, 4);
      if (local.seat >= 0) {
        game.engine?.shake?.(clamp(s / 14, 0.3, 1));
        if (s > 11) game.damageLocal?.(Math.round(clamp((s - 11) * 6, 5, 70)), 'cruiser', st.pos.clone());
      }
    }
  }

  // ------------------------------------------------------------------ push (flip righting / nudge) on the authority
  function applyPush(dir) {
    if (!st.body || st.kinematic) return;
    const m = st.body.mass();
    const up = _v.set(0, 1, 0).applyQuaternion(st.quat);
    st.body.wakeUp();
    if (up.y < 0.55) {
      // righting: the pre-step drives the body upright over ~1 s (each push adds time; two people = faster)
      st.rightT = Math.min(2.6, (st.rightT || 0) + 1.15);
      st.rightPow = Math.min(2, (st.rightT > 1.2 ? 1.5 : 1));
    } else {
      const dx = +dir?.[0] || 0, dz = +dir?.[1] || 0, L = Math.hypot(dx, dz) || 1;
      st.body.applyImpulse({ x: (dx / L) * m * 1.6, y: m * 0.4, z: (dz / L) * m * 1.6 }, true);
    }
  }

  // ------------------------------------------------------------------ streaming
  function updateNet(dt) {
    if (!net() || !st.present || st.drop) return;
    if (!isAuth()) return;
    const moving = st.vel.lengthSq() > 0.01 || !!st.seats[0];
    local.sendT -= dt; local.idleSendT -= dt;
    if (moving ? local.sendT <= 0 : local.idleSendT <= 0) {
      local.sendT = 1 / SEND_HZ; local.idleSendT = 1.5;
      net().send('vanst', snapshot());
    }
    // creatures hear the engine / horn (host rule: 'noise' requests)
    if (st.seats[0] === selfId()) {
      local.noiseT -= dt;
      if (local.noiseT <= 0) {
        local.noiseT = st.horn ? 0.4 : 1.0;
        const loud = st.horn ? 3.2 : 0.8 + st.rpm * 1.2;
        net().request('noise', { p: [st.pos.x, st.pos.y + 1, st.pos.z], loud });
      }
    }
  }

  // ------------------------------------------------------------------ host logic
  const reply = (from, text, err) => net()?.sendTo(from, 'term', { to: from, text, err, cls: err ? 'err' : '' });
  function posOf(id) { return id === selfId() ? game.player.pos : game.remotes.get(id)?.pos || null; }

  function findPark() {
    for (const [x, z, yaw] of PARK_SPOTS) {
      const hit = physics.raycast({ x, y: 40, z }, { x: 0, y: -1, z: 0 }, 120, G.STATIC);
      if (!hit || (hit.normal && hit.normal.y < 0.86)) continue;
      const gy = hit.point.y;
      if (Math.abs(gy) > 30) continue;
      // nothing solid where the van will stand
      let blocked = false;
      try {
        const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        physics.overlapSphere({ x, y: gy + 1.5, z }, 1.1, G.STATIC, () => { blocked = true; });
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
        for (const s of [-1.7, 1.7]) physics.overlapSphere({ x: x + fwd.x * s, y: gy + 1.5, z: z + fwd.z * s }, 1.0, G.STATIC, () => { blocked = true; });
      } catch { /* ignore */ }
      if (blocked) continue;
      return { x, y: gy + VAN.restHeight + 0.08, z, yaw };
    }
    const [x, z, yaw] = PARK_SPOTS[0];
    const th = game.world.terrain?.heightAt?.(x, z);
    return { x, y: (Number.isFinite(th) ? th : 0) + VAN.restHeight + 0.3, z, yaw };
  }

  function hostDeploy() {
    const r = run();
    if (!r.cruiser || st.present || !game.world.outdoor) return;
    const pk = findPark();
    const q = new THREE.Quaternion().setFromAxisAngle(UP, pk.yaw);
    const drop = !r.cruiser.d;
    if (drop) { r.cruiser = { ...r.cruiser, d: 1 }; game.broadcastRun?.(['cruiser']); }
    net().broadcast('van', { k: 'spawn', p: [r3(pk.x), r3(pk.y), r3(pk.z)], q: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)], drop: drop ? 1 : 0 });
  }

  function hostTakeoff() {
    if (!st.present) return;
    const r = run();
    const docked = Math.hypot(st.pos.x, st.pos.z) < CRUISER.dockRadius && st.pos.y > -60;
    const ids = [...st.cargo.keys()];
    net().broadcast('van', { k: 'cargo', clear: 1 });
    if (docked) {
      ids.forEach((id, k) => {
        const p = [3.4 + (k % 5) * 0.55, 1.1 + Math.floor(k / 10) * 0.35, -2.4 + (Math.floor(k / 5) % 2) * 0.55];
        net().broadcast('it', { e: 'drop', id, p, q: [0, 0, 0, 1] });
      });
      if (ids.length) net().broadcast('sys', { text: 'Uplink Van winched aboard. Cargo moved to ship storage:' + ' ' + ids.length, kind: 'good' });
      net().broadcast('van', { k: 'despawn', why: 'dock' });
    } else {
      for (const id of ids) net().broadcast('it', { e: 'rm', id });
      r.cruiser = null;
      game.broadcastRun?.(['cruiser']);
      net().broadcast('sys', { text: 'The Uplink Van was left behind. Signal lost.', kind: 'bad' });
      net().broadcast('van', { k: 'despawn', why: 'lost' });
    }
  }

  function hostBuy(from, rep) {
    const r = run();
    const say = rep || ((text, err) => reply(from, text, err));
    if (r.cruiser) { say('You already own the Uplink Van.', true); return; }
    if ((r.credits || 0) < CRUISER.price) { say('Insufficient credits.', true); return; }
    r.credits -= CRUISER.price;
    r.cruiser = { d: 0 };
    game.broadcastRun?.(['credits', 'cruiser']);
    net().broadcast('sys', { text: `${game.playerName?.(from) || 'Someone'} ${'bought the UPLINK VAN.'}`, kind: 'good' });
    if (r.phase === 'moon' && game.world.outdoor) {
      say(`${'Uplink Van purchased. Your new balance is'} ▮${r.credits}.\n${'Delivery inbound - look up!'}`);
      hostDeploy();
    } else say(`${'Uplink Van purchased. Your new balance is'} ▮${r.credits}.\n${'It will be lowered next to the ship on your next landing.'}`);
  }

  function hostSyncTo(to) {
    const cargo = [...st.cargo.entries()].map(([id, c]) => [id, r3(c.o.x), r3(c.o.y), r3(c.o.z), r4(c.q.x), r4(c.q.y), r4(c.q.z), r4(c.q.w)]);
    net().sendTo(to, 'van', {
      k: 'sync', present: st.present ? 1 : 0, s: st.seats, x: st.present ? snapshot() : null, cargo,
      drop: st.drop && !st.drop.landed ? 1 : 0, lights: st.lights ? 1 : 0,
    });
  }

  function onRequest(d, from) {
    if (disposed) return;
    const r = run();
    switch (d.op) {
      case 'buy': hostBuy(from); return;
      case 'sync': hostSyncTo(from); return;
      case 'enter': {
        const i = d.seat | 0;
        if (!st.present || dropping() || i < 0 || i > 3) return;
        const p = posOf(from);
        if (!p || p.distanceTo(st.pos) > 7.5) return;
        if (st.seats[i] && st.seats[i] !== from) { net().sendTo(from, 'sys', { text: 'That seat is taken.', kind: 'info' }); return; }
        const seats = st.seats.map((s) => (s === from ? null : s));
        seats[i] = from;
        net().broadcast('van', { k: 'seats', s: seats, x: i === 0 ? snapshot() : undefined });
        return;
      }
      case 'exit': {
        const i = st.seats.indexOf(from);
        if (i < 0) return;
        const seats = st.seats.slice(); seats[i] = null;
        net().broadcast('van', { k: 'seats', s: seats, x: i === 0 && Array.isArray(d.x) ? d.x : undefined });
        return;
      }
      case 'load': {
        if (!st.present || dropping()) return;
        const it = game.items.get(d.id);
        if (!it || it.holder !== from || it.soulbound) return;
        const p = posOf(from);
        if (!p || p.distanceTo(st.pos) > 6) return;
        let slot = null;
        for (const [x, z] of BED_SLOTS) {
          let free = true;
          for (const c of st.cargo.values()) if (Math.hypot(c.o.x - x, c.o.z - z) < 0.36) { free = false; break; }
          if (free) { slot = [x, z]; break; }
        }
        if (!slot) { net().sendTo(from, 'sys', { text: 'The van bed is full.', kind: 'bad' }); return; }
        const h = Math.min(0.6, (it.size?.y || 0.3) / 2);
        const lo = new THREE.Vector3(slot[0], VAN.bed.y0 + 0.04 + h, slot[1]);
        const lq = new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2);
        const wp = lo.clone().applyQuaternion(st.quat).add(st.pos);
        const wq = st.quat.clone().multiply(lq);
        net().broadcast('it', { e: 'drop', id: it.id, p: [wp.x, wp.y, wp.z], q: [wq.x, wq.y, wq.z, wq.w] });
        net().broadcast('van', { k: 'cargo', add: [it.id, r3(lo.x), r3(lo.y), r3(lo.z), r4(lq.x), r4(lq.y), r4(lq.z), r4(lq.w)] });
        net().broadcast('fx', { k: 'snd', s: 'item_drop', p: [wp.x, wp.y, wp.z], v: 0.8 });
        return;
      }
      case 'unload': {
        if (!st.cargo.has(d.id)) return;
        const it = game.items.get(d.id);
        const p = posOf(from);
        if (!it || !p || p.distanceTo(it.obj.position) > 5) return;
        net().broadcast('van', { k: 'cargo', rm: it.id });
        const big = it.def?.kind === 'big' || it.type === 'body' || it.def?.hands === 2;
        if (!big && Number.isInteger(d.slot) && d.slot >= 0) {
          net().broadcast('it', { e: 'held', id: it.id, h: from, sl: d.slot });
          it.lastHolder = from;
        } else {
          const tp = new THREE.Vector3().fromArray(VAN.tailgate).applyQuaternion(st.quat).add(st.pos);
          net().broadcast('it', { e: 'drop', id: it.id, p: [tp.x, tp.y + 0.3, tp.z], q: [0, 0, 0, 1] });
        }
        return;
      }
      case 'push': {
        if (!st.present || dropping()) return;
        const p = posOf(from);
        if (!p || p.distanceTo(st.pos) > 6) return;
        const a = authId();
        if (a === selfId()) applyPush(d.dir);
        else net().sendTo(a, 'van', { k: 'push', dir: d.dir });
        net().broadcast('fx', { k: 'snd', s: 'hit_metal', p: [st.pos.x, st.pos.y, st.pos.z], v: 0.6, pt: 0.5 });
        return;
      }
      case 'ram': {
        if (st.seats[0] !== from) return;
        const c = game.creatures.host.get(d.cid);
        if (!c || c.dead) return;
        if (c.pos.distanceTo(st.pos) > 9 && (!posOf(from) || c.pos.distanceTo(posOf(from)) > 9)) return;
        const dmg = clamp(+d.dmg || 0, 0, 160);
        const heavy = HEAVY.has(c.type) || !!c.def?.boss;
        game.creatures.damage(c.id, dmg, from, { stun: heavy ? 0.3 : 1.4 });
        if (!heavy && c.maxHp !== null && !['mimicdoor', 'web', 'leech', 'turret', 'mine'].includes(c.type)) {
          const dx = +d.d?.[0] || 0, dz = +d.d?.[1] || 0;
          const k = clamp((+d.s || 6) * 0.22, 0.8, 4);
          const nav = game.creatures.nav?.(c);
          const nx = c.pos.x + dx * k, nz = c.pos.z + dz * k;
          if (!nav || nav.walkableAt?.(nx, nz)) { c.pos.x = nx; c.pos.z = nz; }
        }
        return;
      }
      case 'hitp': {
        if (st.seats[0] !== from || !d.pid || st.seats.includes(d.pid)) return;
        const vp = posOf(d.pid);
        if (!vp || vp.distanceTo(st.pos) > 8) return;
        game.hostHurtPlayer?.(d.pid, clamp(+d.dmg || 0, 0, 90), 'cruiser', from, st.pos.clone());
        return;
      }
      default: void r;
    }
  }

  function onMessage(d) {
    if (disposed || !d) return;
    switch (d.k) {
      case 'spawn': spawnVan(d.p, d.q, !!d.drop); return;
      case 'despawn': {
        const seated = local.seat >= 0;
        if (seated && d.why === 'dock') { local.seat = -1; game.ui?.hud?.setPrompt?.(null); game.spawnInShip?.(); }
        despawnVan(false);
        return;
      }
      case 'seats': {
        const prevAuth = authId();
        st.seats = Array.isArray(d.s) ? d.s.slice(0, 4).map((x) => x || null) : [null, null, null, null];
        while (st.seats.length < 4) st.seats.push(null);
        if (d.x) applySnap(d.x, true);
        if (authId() !== prevAuth) ensureBodyMode(true);
        const mine = st.seats.indexOf(selfId());
        if (mine !== local.seat) {
          if (mine >= 0 && st.present) {
            if (local.seat >= 0) local.seat = mine; else enterSeatLocal(mine);
          } else if (local.seat >= 0) leaveSeatLocal(true);
        }
        if (!st.seats[0] && isAuth()) { st.horn = false; st.lights = st.lights && false; }
        return;
      }
      case 'cargo': {
        if (d.clear) { for (const id of [...st.cargo.keys()]) cargoRemove(id); return; }
        if (d.add) cargoAdd(d.add[0], d.add.slice(1, 4), d.add.slice(4, 8));
        if (d.rm) cargoRemove(d.rm);
        return;
      }
      case 'push': applyPush(d.dir); return;
      case 'sync': {
        if (!d.present) { despawnVan(true); return; }
        if (!st.present && d.x) spawnVan(d.x.slice(0, 3), d.x.slice(3, 7), false);
        st.seats = Array.isArray(d.s) ? d.s.map((x) => x || null) : st.seats;
        if (d.x) applySnap(d.x, true);
        ensureBodyMode(true);
        for (const c of d.cargo || []) cargoAdd(c[0], c.slice(1, 4), c.slice(4, 8));
        return;
      }
      default: break;
    }
  }

  function hostUpdate(dt) {
    const r = run();
    const ph = r.phase;
    // ownership changed outside of us (fired -> fresh run): make sure clients forget it
    const owned = !!r.cruiser;
    if (hostState.lastOwned !== undefined && owned !== hostState.lastOwned && !owned) {
      if (r.cruiser === undefined) { r.cruiser = null; game.broadcastRun?.(['cruiser']); }
      if (st.present) net().broadcast('van', { k: 'despawn', why: 'lost' });
    }
    hostState.lastOwned = owned;
    if (ph !== hostState.lastPhase) {
      const prev = hostState.lastPhase;
      hostState.lastPhase = ph;
      if (ph === 'takeoff' && prev !== 'takeoff') hostTakeoff();
    }
    if (ph === 'moon' && owned && !st.present && game.world.outdoor) hostDeploy();
    if (ph !== 'moon' && st.present && ph !== 'takeoff') net().broadcast('van', { k: 'despawn', why: 'dock' });
    if (!st.present) return;
    // seats: drop players that left / died
    hostState.seatT -= dt;
    if (hostState.seatT <= 0) {
      hostState.seatT = 0.5;
      let changed = false;
      const seats = st.seats.map((id) => {
        if (!id) return null;
        if (id === selfId()) return game.player.dead ? (changed = true, null) : id;
        const rp = game.remotes.get(id);
        if (!rp || rp.dead || !net().players.has(id)) { changed = true; return null; }
        return id;
      });
      if (changed) net().broadcast('van', { k: 'seats', s: seats });
    }
    // auto-attach items resting in the bed
    hostState.attachT -= dt;
    if (hostState.attachT <= 0 && !st.drop) {
      hostState.attachT = 0.2;
      const inv = _q2.copy(st.quat).invert();
      for (const it of game.items.all()) {
        if (it.state !== 'world' || !it.body || it.owner || it.holder || it.ladder || it.carrier || st.cargo.has(it.id)) continue;
        const lp = _v.copy(it.obj.position).sub(st.pos).applyQuaternion(inv);
        if (!inBed(lp)) continue;
        const lv = it.body.linvel();
        if (Math.hypot(lv.x - st.vel.x, lv.y - st.vel.y, lv.z - st.vel.z) > 2.5) continue;
        const h = Math.min(0.6, (it.size?.y || 0.3) / 2);
        lp.x = clamp(lp.x, VAN.bed.x0 + 0.1, VAN.bed.x1 - 0.1);
        lp.z = clamp(lp.z, VAN.bed.z0 + 0.05, VAN.bed.z1 - 0.1);
        lp.y = clamp(lp.y, VAN.bed.y0 + 0.02 + h * 0.8, VAN.bed.y0 + 0.9);
        const lq = _q.copy(inv).multiply(it.obj.quaternion);
        net().broadcast('van', { k: 'cargo', add: [it.id, r3(lp.x), r3(lp.y), r3(lp.z), r4(lq.x), r4(lq.y), r4(lq.z), r4(lq.w)] });
      }
    }
  }

  // ------------------------------------------------------------------ interactables (via mods 'interactables')
  function addInteractables(out) {
    if (!st.present || dropping() || local.seat >= 0) return;
    const p = game.player;
    if (p.dead || p.indoor) return;
    const d = p.pos.distanceTo(st.pos);
    if (d > 6) return;
    const add = (o) => out.push(o);
    const flipped = upFactor() < 0.5;
    if (flipped) {
      add({
        pos: st.pos.clone().add(_v.set(0, 0.6, 0)), r: 2.2, reach: 3.8, noLos: true, label: t('Push the van upright [E]'),
        action: () => { net().request('van', { op: 'push', dir: [st.pos.x - p.pos.x, st.pos.z - p.pos.z] }); game.sfx?.('swing_whoosh', 0.4); },
      });
      return;
    }
    const labels = [t('Drive the Uplink Van [E]'), t('Ride shotgun [E]'), t('Sit in the back [E]'), t('Sit in the back [E]')];
    VAN.doors.forEach((dp, i) => {
      if (st.seats[i]) return;
      add({ pos: new THREE.Vector3().fromArray(dp).applyQuaternion(st.quat).add(st.pos), r: 0.7, reach: 2.6, noLos: true, label: labels[i], action: () => requestEnter(i) });
    });
    const held = p.heldItem?.();
    if (held && !held.soulbound) {
      const tp = new THREE.Vector3().fromArray(VAN.tailgate).applyQuaternion(st.quat).add(st.pos);
      add({ pos: tp, r: 1.0, reach: 2.8, noLos: true, label: `${t('Load')} ${held.def?.name || 'item'} ${t('into the van bed [E]')}`, action: () => net().request('van', { op: 'load', id: held.id }) });
    }
    for (const [id] of st.cargo) {
      const it = game.items.get(id);
      if (!it) continue;
      const big = it.def?.kind === 'big' || it.type === 'body' || it.def?.hands === 2;
      add({
        pos: it.obj.position.clone(), r: 0.4, reach: 2.6, noLos: true,
        label: `${big ? t('Unload') : t('Take')} ${it.label || it.def?.name || 'item'} [E]`,
        sub: it.value ? `▮${it.value}` : '',
        action: () => {
          const slots = p.slots || [];
          const slot = slots[p.slot] ? slots.findIndex((s) => !s) : p.slot;
          if (!big && slot < 0) { game.ui?.toast?.(t('Inventory full.')); return; }
          net().request('van', { op: 'unload', id, slot: big ? -1 : slot });
        },
      });
    }
  }

  // ------------------------------------------------------------------ terminal
  const matchesVan = (q) => {
    q = String(q || '').toLowerCase().trim();
    if (q.length < 2) return false;
    if (['van', 'car', 'truck', 'vehicle', 'the van'].includes(q)) return true;
    return q.length >= 3 && ['uplink', 'uplink van', 'cruiser', 'company cruiser'].some((n) => n.startsWith(q));
  };
  function storeLines() {
    const owned = !!run().cruiser;
    return ['', 'VEHICLES:', `* ${CRUISER.name.padEnd(18)} ▮${CRUISER.price}${owned ? '  [OWNED]' : ''}`];
  }
  function terminalBuy(q, term) {
    if (!matchesVan(q)) return false;
    const r = run();
    if (r.cruiser) { term.print(t('You already own the Uplink Van.') + ' ' + statusText()); return true; }
    term.pending = { op: 'cruiser' };
    term.print(`${t('Order the UPLINK VAN for')} ▮${CRUISER.price}? ${t('4 seats, cargo bed, headlights, horn. Delivered next to the ship.')}\n${t('Credits')}: ▮${r.credits}\n${t('Type CONFIRM or DENY.')}`);
    return true;
  }
  function statusText() {
    const r = run();
    if (!r.cruiser) return t('Not owned. BUY VAN to order one.');
    if (st.present) return `${t('Parked')} ${Math.round(Math.hypot(st.pos.x, st.pos.z))} m ${t('from the ship')}. ${t('Cargo')}: ${st.cargo.size}.`;
    return r.cruiser.d ? t('Stowed. It comes down with the ship on the next landing.') : t('Awaiting delivery on the next landing.');
  }
  function registerTerminalCommand() {
    const mm = game.mods;
    if (!mm?.commands || mm.commands.has('van')) return;
    mm.commands.set('van', {
      help: 'Uplink Van status  (VAN BUY / VAN CONFIRM to order)',
      fn: (rest, term) => {
        const w = String(rest?.[0] || '').toLowerCase();
        if (w === 'buy') {
          if (run().cruiser) { term.print(t('You already own the Uplink Van.')); return; }
          local.pendingBuy = true;
          term.print(`${t('Order the UPLINK VAN for')} ▮${CRUISER.price}? ${t('Credits')}: ▮${run().credits}\n${t('Type VAN CONFIRM.')}`);
          return;
        }
        if (w === 'confirm' && local.pendingBuy) { local.pendingBuy = false; net()?.request('van', { op: 'buy' }); return; }
        term.print(`${CRUISER.name.toUpperCase()}  ▮${CRUISER.price}\n${statusText()}`);
      },
    });
    const mine = mm.commands.get('van');
    offs.push(() => { if (mm.commands.get('van') === mine) mm.commands.delete('van'); });
  }

  // ------------------------------------------------------------------ net binding
  function bindNet(n) {
    if (!n || n === boundNet) return;
    boundNet = n;
    n.handle('van', (d, from) => { if (n.isHost) onRequest(d, from); });
    n.on_('van', (d) => { try { onMessage(d); } catch (e) { console.warn('van msg', e); } });
    n.on_('vanst', (d, from) => { if (from !== n.selfId && st.present && from === authId() && !st.drop) applySnap(d, false); });
    n.on_('vanfx', (d, from) => { if (from !== n.selfId) onVanFx(d); });
  }

  // ------------------------------------------------------------------ main update (after physics)
  let updatedAt = -1;
  function update(dt) {
    if (disposed) return;
    updatedAt = game.time;
    try {
      if (game.net && game.net !== boundNet) bindNet(game.net);
      if (isHost() && game.run) hostUpdate(dt);
      const ph = run().phase;
      if (st.present && (ph === 'orbit' || !game.world.outdoor) && !isHost()) despawnVan(true);
      if (!st.present) { if (local.seat >= 0) leaveSeatLocal(false); stopLoops(); return; }
      ensureBodyMode(false);
      syncTransform(dt);
      updateCargo();
      updateVisuals(dt);
      updateLocalSeat(dt);
      updateRamming(dt);
      updateNet(dt);
      updateSounds();
    } catch (e) {
      errors++;
      if (errors < 5) console.warn('cruiser update', e);
      if (errors > 40) { console.warn('cruiser disabled after repeated errors'); api.dispose(); }
    }
  }

  // ------------------------------------------------------------------ wiring
  const removePre = physics.addPreStep?.(preStep);
  if (game.mods?.on) {
    offs.push(game.mods.on('interactables', (out, g) => { if (g === game) { try { addInteractables(out); } catch (e) { console.warn('van interact', e); } } }));
    offs.push(game.mods.on('remoteAvatar', (r) => { if (r?.game === game) { try { onRemoteAvatar(r); } catch { /* ignore */ } } }));
    offs.push(game.mods.on('netReady', (n, g) => { if (g === game) bindNet(n); }));
    offs.push(game.mods.on('sessionEnd', (g) => { if (g === game) api.dispose(); }));
    // fallback driver if the Game.update hook is missing (normally Game.update calls update() right after physics)
    offs.push(game.mods.on('update', (dt, g) => { if (g === game && updatedAt !== game.time) update(dt); }));
  }
  offs.push(game.on?.('joined', () => { game.net?.request('van', { op: 'sync' }); }) || null);
  registerTerminalCommand();

  const api = {
    state: st,
    get present() { return st.present; },
    get seated() { return local.seat >= 0 && st.present; },
    get seat() { return local.seat; },
    get speed() { return st.speed; },
    get cargoCount() { return st.cargo.size; },
    update, bindNet, seatedUpdate, seatedActions, storeLines, terminalBuy, hostBuy, statusText,
    enter: requestEnter, exit: requestExit,
    // debug helpers for the console
    debugTeleportNear(dist = 6) {
      if (!st.present) return false;
      const p = game.player, f = p.forward().setY(0).normalize();
      const at = p.pos.clone().addScaledVector(f, dist);
      const hit = physics.raycast({ x: at.x, y: at.y + 20, z: at.z }, { x: 0, y: -1, z: 0 }, 60, G.STATIC, null, st.body);
      if (hit) at.y = hit.point.y + VAN.restHeight + 0.2;
      st.pos.copy(at); st.quat.setFromAxisAngle(UP, p.yaw);
      if (st.body) { st.body.setTranslation(st.pos, true); st.body.setRotation(st.quat, true); st.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      return true;
    },
    dispose() {
      if (disposed) return;
      try { despawnVan(true); } catch (e) { console.warn(e); }
      disposed = true;
      removePre?.();
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      offs.length = 0;
    },
  };
  return api;
}
