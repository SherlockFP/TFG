// Remote players: avatar (with voice-driven mouth), interpolated movement, name tag, held item,
// kinematic capsule for raycasts/collisions, flashlight spot requests.
import * as THREE from 'three';
import { createAvatar, SUIT_COLORS } from '../models/avatar.js';
import { G } from '../physics/physics.js';
import { damp, dampAngle } from '../core/util.js';
import { applyNameTagTitle } from '../game/achievements.js';
import { emoteFromNet, applyEmoteFx } from '../game/emotes.js';

export function suitColor(id) {
  return (SUIT_COLORS?.find((s) => s.id === id) || SUIT_COLORS?.[0] || { color: '#d9642b' }).color;
}

function makeNameTag(name, level) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '28px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.0)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#b8ffcc';
  ctx.fillText(name.slice(0, 18), 128, 30);
  ctx.font = '20px VT323, monospace';
  ctx.fillStyle = '#ffd27a';
  ctx.fillText('Lv.' + level, 128, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.1, 0.28, 1);
  return s;
}

export class RemotePlayer {
  constructor(game, id, info) {
    this.game = game;
    this.id = id;
    this.name = info.name || 'Employee';
    this.level = info.level || 1;
    this.suit = info.suit || 'orange';
    this.hat = info.hat || 'none';
    this.title = String(info.title || '').slice(0, 24);
    this.pos = new THREE.Vector3(0, -1000, 0);
    this.target = new THREE.Vector3(0, -1000, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.targetYaw = 0; this.pitch = 0;
    this.flags = 0;
    this.dead = false;
    this.hp = 100;
    this.voiceLevel = 0;
    this.heldType = null;
    this.heldObj = null;
    this.flashOn = false;
    this.lastUpdate = 0;
    this.stepDist = 0;
    this.swing = 0;
    this.emote = null;
    this.walkie = false;
    this.indoor = false;
    this.noise = 0;
    try {
      this.avatar = createAvatar({ suitColor: suitColor(this.suit), hat: this.hat });
    } catch (e) {
      console.warn('avatar', e);
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: suitColor(this.suit) }));
      m.position.y = 0.9; g.add(m);
      this.avatar = { root: g, parts: { head: m, handR: m, handL: m }, update() {}, setMouth() {}, setExpression() {}, setSuitColor() {}, setHat() {}, setHitFlash() {}, setVisible(v) { g.visible = v; }, dispose() {} };
    }
    try { this.avatar.setLook?.({ suit: this.suit, hat: this.hat, face: info.face, back: info.back }); } catch (e) { console.warn('wardrobe look', e); }   // wardrobe outfit + accessories
    this.root = this.avatar.root;
    game.engine.scene.add(this.root);
    this.tag = makeNameTag(this.name, this.level);
    this.tag.position.y = 2.15;
    applyNameTagTitle(this.tag, this.name, this.level, this.title);
    this.root.add(this.tag);
    const { body, col } = game.physics.createKinematicCapsule({ x: 0, y: -1000, z: 0 }, 0.56, 0.34, G.REMOTE, G.ITEM | G.BIG, { kind: 'remote', peerId: id });
    this.body = body; this.col = col;
  }

  setInfo(info) {
    const title = info.title !== undefined ? String(info.title || '').slice(0, 24) : this.title;
    if (info.name && info.name !== this.name || (info.level && info.level !== this.level) || title !== this.title) {
      this.title = title;
      this.name = info.name || this.name; this.level = info.level || this.level;
      this.root.remove(this.tag); this.tag.material.map?.dispose(); this.tag.material.dispose();
      this.tag = makeNameTag(this.name, this.level); this.tag.position.y = 2.15; this.root.add(this.tag);
      applyNameTagTitle(this.tag, this.name, this.level, this.title); this.tag.visible = !this.dead;
    }
    if (info.suit && info.suit !== this.suit) { this.suit = info.suit; this.avatar.setSuitColor(suitColor(this.suit)); }
    if (info.hat && info.hat !== this.hat) { this.hat = info.hat; this.avatar.setHat(this.hat); }
    try { this.avatar.setLook?.({ suit: info.suit, hat: info.hat, face: info.face, back: info.back }); } catch { /* wardrobe */ }   // outfit / face / back (undefined fields keep their value)
  }

  // state packet: { p:[x,y,z], y:yaw, pt:pitch, f:flags, h:heldType, fl:flashOn, vl:voice, n:noise, sw:swing, e:emote }
  applyState(s) {
    const first = this.lastUpdate === 0;
    this.lastUpdate = performance.now();
    this.lastState = s;
    this.target.fromArray(s.p);
    if (first || this.target.distanceTo(this.pos) > 8) this.pos.copy(this.target);
    this.targetYaw = s.y; this.pitch = s.pt || 0;
    this.flags = s.f || 0;
    this.flashOn = !!s.fl;
    this.noise = s.n || 0;
    this.swing = s.sw || 0;
    if ((s.e || null) !== this.emoteNet) { this.emoteNet = s.e || null; this.emoteDef = emoteFromNet(this.emoteNet); this.emoteStart = performance.now(); }
    this.emote = this.emoteDef ? this.emoteDef.base : null;
    this.walkie = !!s.wk;
    this.indoor = !!(this.flags & 8);
    if (s.hp !== undefined) this.hp = s.hp;
    if (s.h !== this.heldType) this.setHeld(s.h);
  }

  get crouch() { return !!(this.flags & 1); }
  get sprint() { return !!(this.flags & 2); }
  get grounded() { return !(this.flags & 4); }

  setHeld(type) {
    this.heldType = type || null;
    // the real item object is parented by the game via onItemHeld; this handles pose only
  }

  headPos(out) { return out.set(this.pos.x, this.pos.y + (this.crouch ? 1.0 : 1.62), this.pos.z); }

  setDead(dead) {
    this.dead = dead;
    this.avatar.setExpression(dead ? 'dead' : 'normal');
    this.root.visible = !dead;           // body is represented by a body item
    this.tag.visible = !dead;
    if (dead) this.body.setNextKinematicTranslation({ x: 0, y: -1000, z: 0 });
  }

  update(dt) {
    // interpolation toward target
    const prev = this.pos.clone();
    this.pos.x = damp(this.pos.x, this.target.x, 15, dt);
    this.pos.y = damp(this.pos.y, this.target.y, 15, dt);
    this.pos.z = damp(this.pos.z, this.target.z, 15, dt);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 15, dt);
    const speed = prev.distanceTo(this.pos) / Math.max(dt, 1e-4);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw + Math.PI; // avatar faces +Z, camera yaw 0 faces -Z
    const held = this.heldType ? this.game.itemDefOf(this.heldType) : null;
    this.avatar.update(dt, {
      speed: Math.min(speed, 9), crouch: this.crouch, sprint: this.sprint, grounded: this.grounded,
      carry2h: held?.hands === 2 || held?.kind === 'body', holding: !!held, dead: this.dead,
      emote: this.emote, swing: this.swing, lookPitch: this.pitch, climbing: false, time: this.game.time,
    });
    this.avatar.setMouth(this.voiceLevel);
    if (this.emoteDef && !this.dead) { applyEmoteFx(this.avatar, this.root, this.emoteDef, (performance.now() - this.emoteStart) / 1000); if (!this.faceSet) { this.avatar.setExpression?.(this.emoteDef.face || 'normal'); this.faceSet = true; } }
    else if (this.faceSet) { this.root.rotation.x = 0; this.root.rotation.z = 0; this.avatar.setExpression?.(this.dead ? 'dead' : 'normal'); this.faceSet = false; }
    if (!this.dead) this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + 0.9, z: this.pos.z });
    // footsteps
    if (!this.dead && this.grounded && speed > 0.6) {
      this.stepDist += speed * dt;
      const stride = this.sprint ? 2.3 : this.crouch ? 1.4 : 1.9;
      if (this.stepDist > stride) { this.stepDist = 0; this.game.footstep(this.pos, this.crouch ? 0.12 : this.sprint ? 0.5 : 0.3, false); }
    }
    // flashlight request
    if (this.flashOn && !this.dead) {
      const eye = this.headPos(new THREE.Vector3());
      const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const d = this.game.camera.position.distanceTo(eye);
      this.game.lights.requestSpot({ pos: eye.clone().addScaledVector(dir, 0.3), target: eye.clone().addScaledVector(dir, 8), priority: 2 + d / 50, intensity: 30, distance: 24, angle: 0.42 });
    }
    this.game.mods?.emit('remoteAvatar', this, dt);
  }

  dispose() {
    this.root.removeFromParent();
    this.avatar.dispose?.();
    this.tag?.material?.map?.dispose(); this.tag?.material?.dispose();
    this.game.physics.removeBody(this.body);
  }
}
