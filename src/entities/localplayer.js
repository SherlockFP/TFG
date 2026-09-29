// Local first-person player: Rapier character controller, stamina, weight, fall damage,
// crouch, head bob, camera effects, inventory state (item ids are world item ids).
// Game feel: footstep-synced head bob, spring landing dip, stair smoothing, trauma camera shake,
// camera punch spring (engine.punch), directional hurt (onHurt), low-HP heartbeat, effort breathing,
// coyote time + jump buffer. settings.reduceMotion scales all of the camera motion down.
import * as THREE from 'three';
import { G, groups } from '../physics/physics.js';
import { clamp, damp, lerp } from '../core/util.js';
import { itemDef } from '../game/items.js';
import { slowFactorAt } from '../world/setpieces.js';
import { weightMul as diffWeightMul } from '../game/difficulty.js';
import * as FACILITY from '../world/facility.js';
import { probeLedge, mantlePose, MANTLE } from './mantle.js';
import { t } from '../core/i18n.js';

const RADIUS = 0.34;
const HALF_STAND = 0.56;   // capsule half height (cylinder part) -> total 1.8
const HALF_CROUCH = 0.22;
const EYE_STAND = 1.62;
const EYE_CROUCH = 0.95;
const COYOTE = 0.12;       // s after walking off a ledge that a jump still works
const JUMP_BUFFER = 0.14;  // s a jump press is remembered before landing

// ---- footstep surfaces -------------------------------------------------------------------------
// Floor texture name -> footstep sound set (step_<surface>_N in sfxlib / downloaded packs).
const FLOOR_SURF = [
  [/carpet|rug|velvet/, 'carpet'], [/tile|checker|linoleum|marble/, 'tile'], [/snow|ice|frost/, 'snow'],
  [/water|flood|puddle/, 'water'], [/metal|grate|steel|plate|iron/, 'metal'], [/wood|plank|parquet/, 'wood'],
  [/grass|moss|leaf|leaves/, 'grass'], [/mud|sludge/, 'mud'], [/dirt|rock|gravel|stone|sand/, 'gravel'],
  [/concrete|asphalt|cement/, 'concrete'],
];
// Fallback when a theme's floor textures are not available: room type keywords.
const ROOM_SURF = [
  [/library|study|lounge|theat|suite|nursery|chapel/, 'carpet'], [/kitchen|bath|toilet|shower|lab|clinic|morgue|ward|surgery|breakroom|locker|cafeteria/, 'tile'],
  [/server|vault|reactor|boiler|generator|engine|catwalk|hangar|security|cryo/, 'metal'], [/garden|greenhouse|conservatory|grove/, 'grass'],
  [/flood|sewer|cistern|drain/, 'water'], [/cave|mine|pit|quarry|tunnel/, 'gravel'],
];
const THEME_SURF = [
  [/ice|cryo|frozen|snow|glacier/, 'snow'], [/sewer|flood|aqua|drown/, 'water'], [/garden|jungle|overgrown|forest/, 'grass'],
  [/cave|quarry|catacomb/, 'gravel'], [/hospital|clinic|asylum/, 'tile'], [/station|reactor|server|data|hangar|foundry/, 'metal'],
  [/hotel|mall|backroom|office/, 'carpet'],
];
const pick = (table, name) => { if (!name) return null; for (const [re, s] of table) if (re.test(name)) return s; return null; };
function facilityFloor(fac, pos) {
  const L = fac.layout;
  const i = fac.cellAt(pos.x, pos.z);
  if (i < 0 || !L.cells[i]) return null;
  const theme = FACILITY.THEMES?.[L.theme];
  const r = L.roomOf[i];
  if (r >= 0) {
    const type = L.rooms[r]?.type;
    const floor = theme?.rooms?.[type]?.floor;
    return pick(FLOOR_SURF, floor) || pick(ROOM_SURF, type);
  }
  // corridor: carpet runner down the middle of each cell (mansion style)
  const cor = theme?.corridor;
  if (cor?.carpet) {
    const C = L.cell, lx = (pos.x - L.ox) / C, lz = (pos.z - L.oz) / C;
    const fx = (lx - Math.floor(lx)) * C, fz = (lz - Math.floor(lz)) * C;
    if (fx > 0.9 && fx < C - 0.9 && fz > 0.9 && fz < C - 0.9) return 'carpet';
  }
  return pick(FLOOR_SURF, cor?.floor) || pick(THEME_SURF, L.theme);
}
/**
 * Refine the footstep surface game.footstep picked (concrete/wood defaults) using the facility floor
 * under `pos` or the outdoor biome. Deterministic from world data, so every peer hears the same thing.
 * Falls back to `surf` when the refined set has no sounds.
 */
export function footSurface(game, pos, surf) {
  try {
    if (surf !== 'concrete' && surf !== 'wood') return surf;       // set pieces / ship / mine already decided
    const w = game.world;
    let out = null;
    const fac = w.facility;
    if (fac?.layout && fac.cellAt && fac.contains?.(pos)) {
      if (fac.layout.theme === 'mineshaft') return surf;
      out = facilityFloor(fac, pos);
    } else if (w.terrain && !w.company) {
      const g = w.terrain.biome?.ground || '';
      out = pick([[/sand|dune|ash|gravel|rock/, 'gravel']], g);
    }
    if (!out || out === surf) return surf;
    return game.audio?.has?.(`step_${out}_1`) ? out : surf;
  } catch { return surf; }
}

export class LocalPlayer {
  constructor(game) {
    this.game = game;
    this.physics = game.physics;
    this.camera = game.engine.camera;
    this.pos = new THREE.Vector3(0, 0.1, 0);   // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.grounded = false;
    this.crouch = false;
    this.sprinting = false;
    this.eye = EYE_STAND;
    this.hp = 100; this.maxHp = 100;
    this.stamina = 100; this.maxStamina = 100;
    this.exhausted = false;
    this.dead = false;
    this.slots = [null, null, null, null];     // world item ids
    this.slot = 0;
    this.bobT = 0; this.bobAmt = 0;
    this.landDip = 0;
    this.fallStartY = null;
    this.minVelY = 0;
    this.lastDamageT = 0;
    this.noise = 0;            // current noise level emitted (for creatures)
    this.stepDist = 0;
    this.inShip = true;
    this.indoor = false;
    this.frozen = false;       // cutscenes / minigames
    this.stunT = 0;
    this.slowT = 0;            // webs
    this.blindT = 0;
    this.latched = null;       // leech
    this.speedBoost = 0;       // adrenaline
    this.jetFuel = 0;
    // game feel state
    this.bobPhase = 0;         // multiples of PI = a foot lands (drives head + view model bob)
    this.footIdx = 0;
    this.landVel = 0;          // landing dip spring velocity (landDip = offset, + = down)
    this.stepOff = 0;          // stair smoothing offset
    this.airT = 0; this.jumpBuf = 0; this.jumpedAir = false;
    this.mantle = null; this.mantleAir = false; this.mantleMsgT = 0;   // [movefix] scripted mantle / vault (mantle.js)
    this.punchA = new THREE.Vector3(); this.punchV = new THREE.Vector3();
    this.strafeRoll = 0; this.shakeT = 0;
    this.hbT = 0;              // heartbeat timer (low HP)
    this.breath = { heavy: null, tired: null, heavyOff: 0, tiredOff: 0 };
    this.createBody();
  }

  createBody() {
    const { body, col } = this.physics.createKinematicCapsule(
      { x: this.pos.x, y: this.pos.y + HALF_STAND + RADIUS, z: this.pos.z }, HALF_STAND, RADIUS,
      // Large loot uses BIG colliders, but it must never behave like an
      // invisible wall. Loot is picked up/interacted with separately.
      G.PLAYER, G.STATIC | G.DOOR, { kind: 'localplayer' });
    this.body = body; this.col = col;
    this.half = HALF_STAND;
    this.ctrl = this.physics.createController(0.02);
  }

  setCapsule(half) {
    if (half === this.half) return;
    this.physics.removeBody(this.body);
    const { body, col } = this.physics.createKinematicCapsule(
      { x: this.pos.x, y: this.pos.y + half + RADIUS, z: this.pos.z }, half, RADIUS,
      G.PLAYER, G.STATIC | G.DOOR, { kind: 'localplayer' });
    this.body = body; this.col = col; this.half = half;
  }

  teleport(p, yaw) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.fallStartY = null; this.minVelY = 0;
    this.body.setTranslation({ x: p.x, y: p.y + this.half + RADIUS + 0.02, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.half + RADIUS + 0.02, z: p.z });
    this.physics.world.propagateModifiedBodyPositionsToColliders?.();
    if (yaw !== undefined) this.yaw = yaw;
    this._prevY = p.y; this.stepOff = 0; this.landDip = 0; this.landVel = 0; this.mantle = null;
  }

  get stats() { return this.game.stats; }

  heldId() { return this.slots[this.slot]; }
  heldItem() { const id = this.heldId(); return id ? this.game.items.get(id) : null; }
  heldDef() { const it = this.heldItem(); return it ? itemDef(it.type) : null; }
  twoHanded() { const d = this.heldDef(); return d?.hands === 2; }
  /** A crewmate's body is in our hands (heavy: no sprint, slower walk). */
  carriesBody() {
    for (const id of this.slots) if (id && this.game.items.get(id)?.type === 'body') return true;
    return false;
  }

  carryWeight() {
    let w = 0;
    for (const id of this.slots) { if (!id) continue; const it = this.game.items.get(id); if (it) w += (itemDef(it.type).weight || 0) + (it.extraWeight || 0); }
    w += this.game.inventory?.stashedWeight?.() || 0;   // bag contents (x bag weight multiplier) + worn gear
    if (this.game.grab?.item) w += Math.min(60, (itemDef(this.game.grab.item.type).weight || 0) * 0.4);
    return Math.max(0, w - (this.stats.carryRelief || 0));
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }

  update(dt, input) {
    // A hitch should never turn into a giant collision step. Rapier itself is
    // fixed-step, so cap the controller's frame displacement as well.
    dt = Math.min(dt, 1 / 20);
    const s = this.stats;
    this.maxHp = s.maxHp; this.maxStamina = s.maxStamina;
    // look
    const { dx, dy } = input.consumeMouse();
    if (!this.frozen || this.dead) {
      this.yaw -= dx; this.pitch = clamp(this.pitch - dy, -1.5, 1.5);
    }
    if (!this.lookDelta) this.lookDelta = { x: 0, y: 0 };   // [fpbody] reused, no per-frame allocation
    this.lookDelta.x = dx; this.lookDelta.y = dy;
    if (!this.dead && this.game.cruiser?.seated && this.game.cruiser.seatedUpdate(this, dt, input)) return;
    if (this.dead) { this.noise = 0; this.game.engine.setLowHealth?.(0); this.stopBreathing(); return; }

    this.stunT = Math.max(0, this.stunT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    const canMove = !this.frozen && this.stunT <= 0;

    // input direction
    let mx = 0, mz = 0;
    if (canMove) {
      if (input.isDown('forward')) mz -= 1;
      if (input.isDown('back')) mz += 1;
      if (input.isDown('left')) mx -= 1;
      if (input.isDown('right')) mx += 1;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wishX = mx * cos + mz * sin;
    const wishZ = -mx * sin + mz * cos;

    // crouch
    const wantCrouch = canMove && input.isDown('crouch');
    if (wantCrouch && !this.crouch) { this.crouch = true; this.setCapsule(HALF_CROUCH); this.game.sfx('cloth_rustle', 0.22, 0.95 + Math.random() * 0.1); }
    else if (!wantCrouch && this.crouch) {
      // headroom check
      const head = this.physics.raycast({ x: this.pos.x, y: this.pos.y + 1.0, z: this.pos.z }, { x: 0, y: 1, z: 0 }, 0.9, G.STATIC | G.DOOR);
      if (!head) { this.crouch = false; this.setCapsule(HALF_STAND); this.game.sfx('cloth_rustle', 0.16, 1.1 + Math.random() * 0.1); }
    }

    // weight & speed
    const weight = this.carryWeight();
    const weightMul = diffWeightMul(weight, this.game.run?.quotaIndex | 0);   // [hardmode] was clamp(1 - max(0, weight - 10) / 260, 0.6, 1); Casual / quota 0-2 unchanged (difficulty.js)
    this.weightMul = weightMul;
    const moving = len > 0;
    const bodyCarry = this.carriesBody();
    this.bodyCarry = bodyCarry;
    this.sneak = canMove && input.isDown('sneak');   // [stealth] Alt: slow, near-silent walk (game/stealth.js: noise table, HUD meter)
    const wantSprint = canMove && moving && input.isDown('sprint') && !this.crouch && !this.sneak && !this.exhausted && mz <= 0.1 && !bodyCarry;   // no sprinting with a body over your shoulder
    this.sprinting = wantSprint && this.stamina > 0;
    // Snappier than the old 3.9/6.6 but still LC-paced so creatures stay threatening.
    let speed = this.sneak ? 2.1 : this.crouch ? 2.6 : this.sprinting ? 8.2 : 5.0;
    speed *= weightMul * s.speedMul * (this.speedBoost > 0 ? 1.25 : 1) * (this.slowT > 0 ? 0.35 : 1);
    if (this.game.grab?.item) speed *= 0.88;
    if (bodyCarry) speed *= 0.85;   // on top of the 90 lb weight penalty: a slow, heavy trudge (~2.9 m/s), never frozen
    if (this.game.weatherMud && !this.indoor && !this.inShip) speed *= 0.92;
    // facility set pieces: wading through the flooded room
    const spZones = this.indoor ? this.game.world.facility?.zones : null;
    const wade = spZones ? slowFactorAt(spZones, this.pos) : 1;
    this.wading = wade < 1;
    speed *= wade;

    // stamina
    const drainMul = 1 + (1 - weightMul) * 1.5;
    if (this.sprinting) {
      this.stamina -= 18 * drainMul * dt * (this.speedBoost > 0 ? 0.3 : 1);
      this.staminaDelay = 1.1;
    } else {
      this.staminaDelay = Math.max(0, (this.staminaDelay || 0) - dt);
      if (this.staminaDelay <= 0) this.stamina += s.staminaRegen * (moving && !this.sneak ? 0.7 : 1.1) * dt * (this.game.infiniteSprint ? 10 : 1);
    }
    if (this.game.infiniteSprint) this.stamina = this.maxStamina;
    this.stamina = clamp(this.stamina, 0, this.maxStamina);
    if (this.stamina <= 0.5) { this.exhausted = true; this.game.onExhausted?.(); }
    if (this.exhausted && this.stamina > this.maxStamina * 0.3) this.exhausted = false;

    // horizontal velocity with acceleration
    // in the air: steer with input, but keep momentum when no key is held (no mid-air braking)
    const accel = this.grounded ? (moving ? 20 : 26) : (moving ? 5 : 0.6);
    this.vel.x = damp(this.vel.x, wishX * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wishZ * speed, accel, dt);

    // jump (coyote time after leaving a ledge + a short input buffer before landing)
    this.airT = this.grounded ? 0 : this.airT + dt;
    if (this.grounded) this.jumpedAir = false;
    this.jumpBuf = canMove && input.pressed('jump') ? JUMP_BUFFER : Math.max(0, this.jumpBuf - dt);
    // [movefix] jump facing a ledge / fence: mantle or vault instead of a plain hop (settings.keys 'jump' is the same action)
    if (this.grounded) this.mantleAir = false;
    this.mantleMsgT = Math.max(0, this.mantleMsgT - dt);
    if (!this.mantle && canMove && this.jumpBuf > 0 && !this.crouch && !this.mantleAir && !this.latched && !this.jetting && this.game.settings.mantle !== false && (this.grounded || this.airT < 0.9)) {
      this.tryMantle(weightMul, bodyCarry);
    }
    if (this.mantle) {
      if (!canMove || this.latched) this.mantle = null;   // stunned / grabbed mid-climb: gravity takes over
      else {
        this.hSpeed = 0; this.noise = Math.max(0, this.noise - dt * 1.5);
        this.stepMantle(dt);
        this.updateBreathing(dt, weightMul, true); this.updateHeartbeat(dt); this.updateCamera(dt, 0, false);
        return;
      }
    }
    const canJump = this.grounded || (this.airT < COYOTE && !this.jumpedAir && this.vel.y <= 0.5);
    if (canMove && this.jumpBuf > 0 && canJump && !this.crouch && this.stamina > 8) {
      this.vel.y = 6.2 * (s.jumpMul || 1) * (weightMul > 0.7 ? 1 : 0.8);
      this.stamina -= 8;
      this.grounded = false;
      this.jumpedAir = true; this.jumpBuf = 0; this.airT = COYOTE;
      this.game.sfx('jump', 0.4);
      this.noise = Math.max(this.noise, this.sneak ? 0.1 : 0.5);   // [stealth] a jump is heard
      this.game.engine.punch?.(-0.012, 0, 0);
    }
    // jetpack
    const held = this.heldItem();
    if (held && held.type === 'jetpack' && input.mouseDown(0) && (held.battery ?? 0) > 0 && canMove) {
      this.vel.y = Math.min(this.vel.y + 30 * dt, 7);
      held.battery -= dt;
      this.jetting = true;
    } else this.jetting = false;

    // gravity
    if (!this.grounded || this.vel.y > 0) this.vel.y -= 19.6 * dt;
    else this.vel.y = -1.0;
    this.vel.y = Math.max(this.vel.y, -45);
    if (!this.grounded) this.minVelY = Math.min(this.minVelY, this.vel.y);

    // move with controller
    const desired = this._desired || (this._desired = { x: 0, y: 0, z: 0 });   // [fpbody] reused
    // [fpbody] ROOT CAUSE of the "hitch while walking": the constant -1 m/s 'stick to ground' push (vel.y = -1 while grounded) made the Rapier
    // character controller cancel its horizontal movement for ~3 frames every ~0.7 s on flat floors (measured: 7% of frames at < 3 m/s,
    // tools/harness/fpbody_stall_offline.mjs). Snap-to-ground (0.4 m) already keeps us glued to the floor, so grounded frames ask for no vertical move.
    desired.x = this.vel.x * dt; desired.y = (!this.fpLegacy && this.grounded && this.vel.y <= 0 ? 0 : this.vel.y * dt); desired.z = this.vel.z * dt;
    this.ctrl.computeColliderMovement(this.col, desired, undefined, groups(G.PLAYER, G.STATIC | G.DOOR));
    const mv = this.ctrl.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded();
    const t = this.body.translation();
    const np = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    this.body.setNextKinematicTranslation(np);
    // Physics steps at a fixed 60 Hz but we move every render frame: without this
    // teleport, frames with no physics step would read a stale translation next
    // frame and lose their movement (stutter / slow walking on >60 Hz screens).
    this.body.setTranslation(np, true);
    // [movefix] ROOT CAUSE of the "bounce in place": Rapier only copies a moved body's position to its collider inside world.step(). On frames
    // without a physics step (any display > 60 Hz: 2 of 3 frames at 144 Hz) the controller measured from the STALE collider while we added its
    // correction to the FRESH body position, so every snap-to-ground / depenetration was applied twice (+-4.4 cm ping-pong, grounded flicker).
    this.physics.world.propagateModifiedBodyPositionsToColliders?.();
    // if we bumped the ceiling, stop rising
    if (this.vel.y > 0 && mv.y < desired.y * 0.5) this.vel.y = 0;
    const realVx = mv.x / Math.max(dt, 1e-4), realVz = mv.z / Math.max(dt, 1e-4);
    if (Math.abs(realVx) < Math.abs(this.vel.x) * 0.3) this.vel.x = realVx;
    if (Math.abs(realVz) < Math.abs(this.vel.z) * 0.3) this.vel.z = realVz;
    this.pos.set(np.x, np.y - this.half - RADIUS, np.z);

    // landing / fall damage (velocity tiers)
    if (this.grounded && !wasGrounded) {
      const v = -this.minVelY;
      const eng = this.game.engine;
      if (v > 11) {
        let dmg = v > 26 ? 999 : v > 21 ? 80 : v > 16 ? 50 : 25;
        this.game.damageLocal(dmg, 'fall', null);
        this.game.sfx('land_hard', 0.8);
        eng.shake(0.6);
        eng.punch?.(-0.07, 0, (Math.random() - 0.5) * 0.05);
        this.landVel += Math.min(2.2, v * 0.12);
        this.landFx(v);
      } else if (v > 4) {
        this.game.sfx('land_soft', 0.35);
        this.landVel += Math.min(1.2, v * 0.09);
        eng.punch?.(-0.012 * Math.min(1, v / 9), 0, 0);
        if (v > 7) this.landFx(v);
      }
      // the feet hit the actual floor: a surface-flavoured footfall on top of the landing thud
      if (v > 3.5) {
        this.game.footstep(this.pos, clamp(v / 12, 0.25, 0.8) * (this.game.hasPerk('lightfoot') ? 0.5 : 1), true);
        this.stepDist = 0; this.footIdx++;
      }
      this.minVelY = 0;
      this.noise = Math.max(this.noise, clamp(v / 12, 0.2, 1));
    }
    if (this.grounded) this.minVelY = 0;

    // out of world safety
    if (this.pos.y < -380) this.game.damageLocal(999, 'void', null);

    // footsteps / noise
    const hs = Math.hypot(realVx, realVz);
    this.hSpeed = hs;
    let noise = 0;
    if (this.grounded && hs > 0.5) {
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 2.3 : this.sneak ? 1.25 : this.crouch ? 1.4 : 1.9;
      this.stride = stride;
      if (this.stepDist > stride) {
        this.stepDist = this.fpLegacy ? 0 : Math.min(this.stepDist - stride, stride * 0.5); this.footIdx++;   // [fpbody] keep the overshoot: the bob phase used to stall a few % every footfall
        const quiet = this.game.hasPerk('lightfoot') ? 0.5 : 1;
        const vol = (this.sneak ? 0.04 : this.crouch ? 0.12 : this.sprinting ? 0.55 : 0.32) * quiet;
        this.game.footstep(this.pos, vol, true);
      }
      noise = (this.sneak ? 0.02 : this.crouch ? 0.04 : this.sprinting ? 0.7 : 0.3) * (this.game.hasPerk('lightfoot') ? 0.5 : 1) * (this.game.stealth?.surfaceMul?.() ?? 1);   // [stealth] metal / water loud, carpet quiet
      if (this.wading) noise = Math.min(1, noise * 1.6 + 0.1);   // splashing is loud
    }
    this.noise = Math.max(noise, this.noise - dt * 1.5);

    this.updateBreathing(dt, weightMul, moving);
    this.updateHeartbeat(dt);

    this.updateCamera(dt, hs, wasGrounded);
  }

  // ------------------------------------------------------------------ mantle / vault (mantle.js)
  tryMantle(weightMul, bodyCarry) {
    const plan = probeLedge(this.physics, this.pos, this.yaw, { sprint: this.sprinting });
    if (!plan) return;
    const cost = plan.kind === 'mantle' ? MANTLE.stamina : MANTLE.vaultStamina;
    if (this.exhausted || this.stamina < cost + 3) return;
    if (this.twoHanded() || bodyCarry || this.game.grab?.item || weightMul < MANTLE.heavyMul) {
      // too much loot to climb: you flop against the wall (the normal jump still happens)
      if (this.mantleMsgT <= 0) {
        this.mantleMsgT = 3;
        this.game.ui?.toast?.(t('Too heavy to climb!'), 'info');
        this.game.sfx('cloth_rustle', 0.3, 0.8);
        this.game.engine.punch?.(0.03, 0, 0);
        this.noise = Math.max(this.noise, 0.3);
      }
      return;
    }
    this.stamina -= cost;
    this.staminaDelay = Math.max(this.staminaDelay || 0, 0.9);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    plan.t = 0; plan.sprint = this.sprinting; plan.speed = clamp(sp, 0, 8.2);
    this.mantle = plan; this.mantleAir = true; this.jumpBuf = 0; this.grounded = false; this.jumpedAir = true;
    this.vel.set(0, 0, 0); this.minVelY = 0; this.fallStartY = null;
    this.game.sfx(plan.kind === 'mantle' ? 'cloth_rustle' : 'jump', plan.kind === 'mantle' ? 0.35 : 0.3, 0.95 + Math.random() * 0.1);
    this.noise = Math.max(this.noise, this.sneak ? 0.12 : plan.kind === 'mantle' ? 0.55 : plan.sprint ? 0.6 : 0.4);   // [stealth] climbing is heard
    this.game.engine.punch?.(0.035, 0, 0);
  }
  stepMantle(dt) {
    const m = this.mantle;
    m.t += dt;
    const u = Math.min(1, m.t / m.dur);
    const q = mantlePose(m, u, this._mp || (this._mp = { x: 0, y: 0, z: 0 }));
    const np = { x: q.x, y: q.y + 0.02 + this.half + RADIUS, z: q.z };
    this.body.setNextKinematicTranslation(np);
    this.body.setTranslation(np, true);
    this.physics.world.propagateModifiedBodyPositionsToColliders?.();
    this.pos.set(np.x, np.y - this.half - RADIUS, np.z);
    if (u < 1) return;
    // done: standing on the far side. A sprinting vault keeps its momentum, everything else steps out gently.
    const low = m.sprint && m.H <= MANTLE.vaultH + 0.1;
    const keep = m.kind === 'vault' ? (m.sprint ? Math.max(m.speed, 5.5) : Math.min(m.speed, 3.5)) : low ? Math.max(m.speed, 5.5) : 0;
    this.vel.set(m.dirX * keep, m.kind === 'vault' ? 0 : -1, m.dirZ * keep);
    this.mantle = null; this.grounded = true; this.airT = 0; this.minVelY = 0;
    this.game.sfx('land_soft', 0.2, 1.2);
    this.game.engine.punch?.(-0.02, 0, 0);
    this.landVel += 0.5;
  }

  // ------------------------------------------------------------------ camera feel
  updateCamera(dt, hs, wasGrounded) {
    const g = this.game, eng = g.engine, cam = this.camera;
    const rm = g.settings.reduceMotion ? 0.35 : 1;
    const targetEye = this.crouch ? EYE_CROUCH : EYE_STAND;
    this.eye = damp(this.eye, targetEye, 12, dt);
    // stair smoothing: autostep / snap-to-ground move the feet in one frame; ease the eye instead
    const dy = this.pos.y - (this._prevY ?? this.pos.y);
    this._prevY = this.pos.y;
    if (this.grounded && wasGrounded && Math.abs(dy) > 0.04 && Math.abs(dy) < 0.6 && Math.abs(dy) / Math.max(dt, 1e-4) > 7) {
      this.stepOff = clamp(this.stepOff - dy, -0.5, 0.5);
    }
    this.stepOff = damp(this.stepOff, 0, 13, dt);
    // head bob, locked to the footfalls (lowest point when a foot lands)
    this.bobAmt = damp(this.bobAmt, (this.grounded || (!this.fpLegacy && this.airT < 0.1)) && hs > 0.5 ? Math.min(1, hs / 5) : 0, 8, dt);   // [fpbody] a one-frame ground-contact flicker no longer drops the bob
    this.bobPhase = (this.footIdx + clamp(this.stepDist / (this.stride || 1.9), 0, 1)) * Math.PI;
    this.bobT = this.bobPhase;   // legacy name
    const bob = (g.settings.headBob ? this.bobAmt : 0) * rm * (this.sprinting ? 1.25 : 1);
    const sp = Math.sin(this.bobPhase);
    const bobX = sp * 0.028 * bob, bobY = (Math.abs(sp) - 0.6) * 0.055 * bob, bobRoll = sp * 0.007 * bob;
    // landing dip: under-damped spring (dips, overshoots a hair, settles)
    this.landVel += (-160 * this.landDip - 16 * this.landVel) * dt;
    this.landDip = clamp(this.landDip + this.landVel * dt, -0.08, 0.35);
    // punch spring (impulses from engine.punch: hits, recoil, landings)
    const pin = eng.fx.punch;
    if (pin && (pin.x || pin.y || pin.z)) { this.punchV.addScaledVector(pin, 25); pin.set(0, 0, 0); }
    this.punchV.x += (-220 * this.punchA.x - 20 * this.punchV.x) * dt;
    this.punchV.y += (-220 * this.punchA.y - 20 * this.punchV.y) * dt;
    this.punchV.z += (-220 * this.punchA.z - 20 * this.punchV.z) * dt;
    this.punchA.addScaledVector(this.punchV, dt);
    this.punchA.clampScalar(-0.35, 0.35);
    // trauma shake: smooth noise, grows with the square of the shake amount
    this.shakeT += dt;
    const tr = Math.min(1, eng.fx.shake || 0), k2 = tr * tr * rm, t = this.shakeT;
    const n1 = Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7 + 1.3) * 0.4;
    const n2 = Math.sin(t * 43.3 + 2.1) * 0.6 + Math.sin(t * 71.9 + 0.4) * 0.4;
    const n3 = Math.sin(t * 29.7 + 4.2) * 0.6 + Math.sin(t * 53.3 + 3.3) * 0.4;
    // strafe lean
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const lat = this.vel.x * rx + this.vel.z * rz;
    if (this.grounded) this.strafeRoll = damp(this.strafeRoll, -clamp(lat / 8, -1, 1) * 0.012 * rm, 6, dt);
    const offX = bobX + n1 * 0.06 * k2, offY = bobY - this.landDip * rm + this.stepOff + n2 * 0.06 * k2;
    cam.position.set(this.pos.x + rx * offX, this.pos.y + this.eye + offY, this.pos.z + rz * offX);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.pitch + this.punchA.x + n3 * 0.03 * k2,
      this.yaw + this.punchA.y + n1 * 0.03 * k2,
      bobRoll + this.strafeRoll + this.punchA.z + n2 * 0.045 * k2,
    );
    // subtle sprint FOV kick (off with reduce motion)
    const fovTarget = g.settings.fov + (this.sprinting && hs > 4 && !g.settings.reduceMotion ? 4.5 : 0);
    if (Math.abs(cam.fov - fovTarget) > 0.01) { cam.fov = damp(cam.fov, fovTarget, 6, dt); cam.updateProjectionMatrix(); }
  }

  /** Called by Game.damageLocal: red edge towards the attacker + a flinch away from it. */
  onHurt(dmg, fromPos) {
    const eng = this.game.engine;
    const amt = clamp(dmg / 40, 0.3, 1);
    if (fromPos) {
      const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
      const fwd = -Math.sin(this.yaw) * dx - Math.cos(this.yaw) * dz;
      const right = Math.cos(this.yaw) * dx - Math.sin(this.yaw) * dz;
      const ang = Math.atan2(right, fwd);          // 0 = in front, +PI/2 = right
      eng.hurtFrom?.(ang, amt * 0.9);
      eng.punch?.(0.035 * amt * Math.cos(ang), 0.035 * amt * Math.sin(ang), 0.045 * amt * Math.sin(ang));
    } else {
      eng.punch?.(-0.04 * amt, 0, (Math.random() < 0.5 ? -1 : 1) * 0.025 * amt);
    }
  }

  /** Dust / snow / splash at the feet after a big landing. */
  landFx(v) {
    const g = this.game;
    if (!g.particles) return;
    const p = new THREE.Vector3(this.pos.x, this.pos.y + 0.05, this.pos.z);
    const snow = !this.indoor && !this.inShip && g.world.terrain?.biome?.ground === 'snow';
    g.particles.burst(p, this.wading ? 'splash' : snow ? 'snowpuff' : 'landpuff', null, clamp(v / 12, 0.6, 1.6));
  }

  // ------------------------------------------------------------------ body sounds
  /** Strained breathing while hauling heavy loot, panting when winded. */
  updateBreathing(dt, weightMul, moving) {
    const heavy = moving && weightMul < 0.9 ? clamp((0.9 - weightMul) / 0.25, 0, 1) : 0;
    const sf = this.stamina / Math.max(1, this.maxStamina);
    const tired = this.exhausted ? 1 : clamp((0.3 - sf) / 0.3, 0, 1) * (this.sprinting ? 1 : 0.6);
    this.breathLoop('heavy', 'breath_heavy', heavy * 0.42 * (1 - tired * 0.6), dt);
    this.breathLoop('tired', 'breath_tired', tired * 0.4, dt);
  }
  breathLoop(key, name, vol, dt) {
    const B = this.breath;
    let h = B[key];
    if (vol > 0.02) {
      B[key + 'Off'] = 0;
      if (!h || h.stopped) { h = this.game.audio.play(name, { loop: true, volume: 0.0001, bus: 'sfx', noRetry: true }); B[key] = h; }
      h?.setVolume(vol, 0.35);
    } else if (h) {
      if (!h.stopped) h.setVolume(0.0001, 0.4);
      B[key + 'Off'] += dt;
      if (B[key + 'Off'] > 1.5 || h.stopped) { h.stop(0.2); B[key] = null; B[key + 'Off'] = 0; }
    }
  }
  stopBreathing() {
    for (const k of ['heavy', 'tired']) { this.breath[k]?.stop(0.3); this.breath[k] = null; }
  }
  /** Low health: heartbeat you can hear and see (engine blur/vignette pulse). */
  updateHeartbeat(dt) {
    const eng = this.game.engine;
    const hpF = this.hp / Math.max(1, this.maxHp);
    const low = clamp((0.35 - hpF) / 0.25, 0, 1);
    eng.setLowHealth?.(low);
    if (low <= 0) { this.hbT = 0; return; }
    this.hbT -= dt;
    if (this.hbT <= 0) {
      this.hbT = lerp(1.0, 0.52, low);
      this.game.sfx('heartbeat', 0.3 + 0.4 * low, 0.95 + low * 0.1);
      eng.beat?.(0.6 + 0.4 * low);
    }
  }

  freeCam(dt, input) {
    // spectator free look while dead / no target
    const { dx, dy } = input.consumeMouse();
    this.yaw -= dx; this.pitch = clamp(this.pitch - dy, -1.5, 1.5);
  }

  destroy() {
    this.stopBreathing();
    this.game.engine.setLowHealth?.(0);
    this.physics.removeBody(this.body);
  }
}
