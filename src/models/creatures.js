// creatures.js — procedural PSX creature models for TFG.
// Every model: origin at feet / bottom-center, faces +Z, meters. Animation is procedural:
// update(dt, { state, speed, t, time, progress }) poses pivot Groups.
//   speed: m/s (null → per-state default), t: seconds in current state (drives attack loops,
//   hurt flinch, spring decay...), time: global seconds, progress: 0..1 (winding/emerge/grab).
// Living creatures: idle, walk, run, attack, hurt, stunned, dead (+ extras below).
//   yoinker: fly · lurker: sneak, flee, angry · mannequin: frozen · sludge: calm (music)
//   jester: box, box_walk, winding(progress), popped, run · spider: web
//   leech: ceiling, fall, latched (ring centred on origin, radius ≈0.18) · screamer: scream
//   hound: sniff, howl, lunge (t-driven leap, 0.8 s) · giant: grab(progress or t), eat
//   sandkefal: hidden, rumble, emerge(progress; 'attack' = emerge), dead
//   turret: idle, alert, fire(= attack), off(= dead) · mine: armed(= idle), triggered, off
//   kefaldayi: idle, walk, talk · company: hidden, idle (tips peek), grab(progress)
//   moderator: patrol, scan, aim (laser), fire, reload, hunt, kick · support: follow, windup, stab, run
//   ticketswarm: run · editor: idle, hop (on the beat), snip · tamagotchi: cry, rocked, morph(t), run, crouch, lunge, recover
//   stalker: hidden, lurk, reveal, chase · clickbait: hide, stalk, aim, tongue/drag (anim.aim = model-local target)
//   replyguy: posture, run, attack, flee. setTint(color, strong) = variant / affix glow.
// Extra parts: giant.hand/handL (grip points), company.hand (grip), screamer.materials,
//   mimic.avatar, turret.laser/light, spider.abdomen, leech.segments, sandkefal.mound.
import * as THREE from 'three';
import {
  G, xf, merged, lam, bas, lamI, basI, tex, noiseFill, noiseTex, mk, pv, Tinter,
  clamp, lerp, smooth, damp, ramp, keys, rng, TAU, PI,
} from './modelkit.js';
import { createAvatar } from './avatar.js';
import { createCreature32 } from './creatures32.js';

export const CREATURE_MODEL_IDS = ['scuttler', 'yoinker', 'crawler', 'lurker', 'mannequin', 'sludge', 'jester', 'spider', 'leech', 'screamer', 'mimic', 'hound', 'giant', 'sandkefal', 'turret', 'mine', 'kefaldayi', 'company',
  'moderator', 'support', 'ticketswarm', 'editor', 'tamagotchi', 'stalker', 'clickbait', 'replyguy', 'c32_dormant', 'c32_ram'];

const ELITE_EYE = new THREE.Color('#ff2414');

// ------------------------------------------------------------------ textures
function stripeTex(key, base, stripe, n = 4, amt = 0.12) {
  return tex('stripe|' + key, 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, base, amt, 2);
    ctx.fillStyle = stripe;
    for (let i = 0; i < n; i++) ctx.fillRect(0, ((i + 0.5) * h) / n - 1, w, 3);
  });
}
function fleshTex(key, base, vein, amt = 0.18) {
  return tex('flesh|' + key, 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, base, amt, 2);
    ctx.strokeStyle = vein; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); let x = r() * w, y = r() * h; ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 12; y += r() * 8; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
}
function scaleTex(key, base, dark, light) {
  return tex('scales|' + key, 32, 32, (ctx, w, h, r) => {
    noiseFill(ctx, w, h, r, base, 0.1, 2);
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 0 : 3; x < w; x += 6) {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y + 3, 3, 0, PI); ctx.fill();
      if (light) { ctx.fillStyle = light; ctx.fillRect(x - 1, y + 1, 2, 1); }
    }
  });
}

const _qd = new THREE.Quaternion(), _ed = new THREE.Euler(), _vd = new THREE.Vector3(), _upY = new THREE.Vector3(0, 1, 0);
/** Euler [x,y,z] rotating +Y onto direction (x,y,z) */
function dirRot(x, y, z) { _qd.setFromUnitVectors(_upY, _vd.set(x, y, z).normalize()); _ed.setFromQuaternion(_qd); return [_ed.x, _ed.y, _ed.z]; }

// ------------------------------------------------------------------ build context
class Ctx {
  constructor(id, opts) {
    this.id = id;
    this.opts = opts;
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.rnd = rng(this.seed * 31 + id.length * 7919);
    this.ph = this.rnd() * TAU; // per-instance phase offset
    this.root = new THREE.Group();
    this.root.name = 'creature_' + id;
    this.body = pv(this.root, null, null, 'scaler'); // elite scale lives here
    this.eyes = [];
    this.owned = []; // per-instance disposables (materials / geometries / textures)
    this.W = {};
    this.walkPh = this.rnd() * TAU;
    this.localTime = 0;
  }
  /** per-instance glowing eye material (recolored when elite) */
  eye(color, eliteColor, o = {}) {
    const m = basI(color, o);
    m.userData.baseColor = new THREE.Color(color);
    m.userData.eliteColor = new THREE.Color(eliteColor || ELITE_EYE);
    this.eyes.push(m);
    this.owned.push(m);
    return m;
  }
  own(x) { this.owned.push(x); return x; }
  /** damped 0..1 weight */
  w(key, on, rate, dt) { const v = damp(this.W[key] ?? 0, on ? 1 : 0, rate, dt); this.W[key] = v; return v; }
  /** walk phase advanced by distance (no foot sliding) */
  gait(speed, stride, dt) { this.walkPh = (this.walkPh + (speed * dt / stride) * TAU) % TAU; return this.walkPh; }
}

/** shared per-frame state helpers */
function common(ctx, a, dt, walk = 1.4, run = 4) {
  const st = a.state;
  const dead = ctx.w('dead', st === 'dead', 4, dt);
  const stun = ctx.w('stun', st === 'stunned', 6, dt);
  const hurt = st === 'hurt' ? Math.exp(-a.t * 6) * Math.min(1, a.t * 25) : 0;
  let speed = a.speed ?? (st === 'run' || st === 'flee' ? run : st === 'walk' || st === 'sneak' || st === 'box_walk' ? walk : 0);
  if (st === 'dead') speed = 0;
  return { st, dead, alive: 1 - dead, stun, hurt, speed, t: a.t, tm: a.time + ctx.ph * 3, p: a.progress };
}

// arthropod leg: hip pivot yawed outward, segments along local +X.
// dirAngle: 0 = left (+X), PI = right (-X); forward offset theta rotates toward +Z.
function bugLeg(parent, mat, pos, side, theta, segs, key) {
  const hip = pv(parent, pos, [0, side > 0 ? -theta : PI + theta, 0]);
  const joints = [];
  let cur = hip;
  segs.forEach(([len, r0, r1, ang], i) => {
    const j = pv(cur, i === 0 ? [0, 0, 0] : [segs[i - 1][0], 0, 0], [0, 0, ang]);
    mk(j, G.segX(len, r0, r1, 4), mat);
    joints.push(j);
    cur = j;
  });
  return { hip, joints, side, base: segs.map((s) => s[3]), yaw0: hip.rotation.y };
}

// ================================================================== 1. SCUTTLER
function buildScuttler(ctx) {
  const shellMat = lam('#c9bda2', { map: stripeTex('scuttler', '#d4c8ad', '#8c8068', 5) });
  const bellyMat = lam('#8f836c');
  const darkMat = lam('#3a3128');
  const body = pv(ctx.body, [0, 0.22, 0], null, 'body');
  const bob = pv(body);
  mk(bob, merged('sc_shell', () => {
    const a = [];
    const plates = [[0.2, 0.28, 0.19, 0.15], [0.07, 0.31, 0.2, 0.15], [-0.07, 0.3, 0.19, 0.15], [-0.2, 0.26, 0.16, 0.14], [-0.31, 0.2, 0.12, 0.12]];
    for (const [z, sx, sy, sz] of plates) a.push(xf(G.sph(1, 8, 3, 0, TAU, 0, PI / 2), [0, 0, z], [0.12, 0, 0], [sx, sy, sz]));
    a.push(xf(G.sph(1, 7, 4), [0, 0.02, 0.33], [0, 0, 0], [0.16, 0.11, 0.13])); // head
    a.push(xf(G.cone(0.04, 0.16, 4), [0.06, 0.05, -0.43], [-PI / 2 - 0.2, 0, 0]), xf(G.cone(0.04, 0.16, 4), [-0.06, 0.05, -0.43], [-PI / 2 - 0.2, 0, 0]));
    return a;
  }), shellMat);
  mk(bob, merged('sc_belly', () => [xf(G.sph(1, 7, 3), [0, 0, -0.02], [0, 0, 0], [0.31, 0.07, 0.42])]), bellyMat);
  mk(bob, merged('sc_ant', () => [
    xf(G.segZ(0.34, 0.01, 0.004, 3), [0.05, 0.08, 0.42], [-0.5, 0.35, 0]), xf(G.segZ(0.34, 0.01, 0.004, 3), [-0.05, 0.08, 0.42], [-0.5, -0.35, 0]),
  ]), darkMat);
  const eyeM = ctx.eye('#d6ff5a');
  mk(bob, merged('sc_eyes', () => [
    xf(G.box(0.025, 0.025, 0.02), [0.05, 0.07, 0.45]), xf(G.box(0.025, 0.025, 0.02), [-0.05, 0.07, 0.45]),
    xf(G.box(0.018, 0.018, 0.02), [0.1, 0.05, 0.42]), xf(G.box(0.018, 0.018, 0.02), [-0.1, 0.05, 0.42]),
  ]), eyeM);
  const mand = [1, -1].map((s) => {
    const p = pv(bob, [s * 0.05, -0.02, 0.43]);
    mk(p, merged('sc_mand', () => [xf(G.cone(0.025, 0.14, 4), [0, 0, 0.06], [PI / 2, 0, 0]), xf(G.cone(0.015, 0.07, 3), [-0.02, 0, 0.13], [PI / 2, 0, -0.9])]), darkMat);
    p.userData.s = s;
    return p;
  });
  const legs = [];
  [[0.18, 0.55], [0.0, 0.0], [-0.18, -0.55]].forEach(([z, th], i) => {
    for (const side of [1, -1]) {
      const L = bugLeg(bob, shellMat, [side * 0.18, 0.02, z], side, th, [[0.26, 0.035, 0.025, 0.7], [0.44, 0.025, 0.006, -2.0]]);
      L.group = (i + (side > 0 ? 0 : 1)) % 2;
      L.i = legs.length;
      legs.push(L);
    }
  });
  return {
    parts: { head: bob, mouth: mand[0] },
    height: 0.5, radius: 0.45,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.6, 5);
      const ph = ctx.gait(c.speed, 0.55, dt);
      const amp = clamp(c.speed / 2, 0, 1) * c.alive;
      const atk = c.st === 'attack' ? (a.t % 0.8) : -1;
      const lunge = atk >= 0 ? keys(atk, [[0, 0], [0.15, -0.08], [0.3, 0.28], [0.6, 0]]) : 0;
      bob.position.set(0, Math.abs(Math.sin(ph * 2)) * 0.02 * amp + Math.sin(c.tm * 2) * 0.004, lunge - c.hurt * 0.12);
      bob.rotation.set((atk >= 0 ? lunge * 0.8 : 0) - c.hurt * 0.4 + c.stun * 0.15, Math.sin(c.tm * 0.7) * 0.05 * (1 - amp), Math.sin(ph) * 0.05 * amp + c.stun * (0.25 + Math.sin(c.tm * 3) * 0.1));
      // mandibles: idle click bursts, attack snap
      let open = 0.12 + (Math.sin(c.tm * 1.3) > 0.4 ? Math.max(0, Math.sin(c.tm * 22)) * 0.35 : 0);
      if (atk >= 0) open = atk < 0.28 ? 0.7 : 0.05;
      for (const m of mand) m.rotation.y = m.userData.s * open * c.alive;
      // legs (alternating tripod)
      const deadK = smooth(c.dead);
      for (const L of legs) {
        const p = ph + L.group * PI;
        const swing = Math.sin(p) * 0.4 * amp, lift = Math.max(0, Math.cos(p)) * 0.45 * amp;
        const tw = c.stun * Math.sin(c.tm * 23 + L.i * 1.7) * 0.25 + deadK * Math.sin(c.tm * 9 + L.i) * 0.15 * Math.exp(-a.t * 0.4);
        L.hip.rotation.y = L.yaw0 + (swing + tw) * L.side;
        L.joints[0].rotation.z = lerp(L.base[0] + lift, -0.3, deadK) + tw * 0.5;
        L.joints[1].rotation.z = lerp(L.base[1] - lift * 0.3, -2.7, deadK);
      }
      body.rotation.z = PI * deadK;
      body.position.y = 0.22 + Math.sin(PI * deadK) * 0.2 - c.stun * 0.04;
    },
  };
}

// ================================================================== 2. YOINKER (hoarding bug)
function buildYoinker(ctx) {
  const shellMat = lam('#c9a23a', { map: stripeTex('yoinker', '#cfa640', '#6b4a1c', 4, 0.1) });
  const brownMat = lam('#7a5a24');
  const darkMat = lam('#3a2a14');
  const wingMat = ctx.own(lamI('#dfeede', { transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
  wingMat.userData.noTint = true;
  const hips = pv(ctx.body, [0, 0.32, 0], null, 'hips');
  const trunk = pv(hips, null, null, 'trunk');
  mk(trunk, merged('yo_abd', () => [xf(G.sph(0.33, 9, 7), [0, 0.22, -0.1], [-0.35, 0, 0], [1, 1.12, 0.95])]), shellMat);
  mk(trunk, merged('yo_thorax', () => [xf(G.sph(0.19, 7, 5), [0, 0.52, 0.04], [0, 0, 0], [1.1, 0.9, 1])]), brownMat);
  const head = pv(trunk, [0, 0.64, 0.12], null, 'head');
  mk(head, merged('yo_head', () => [xf(G.sph(0.15, 8, 6), [0, 0.02, 0.02], [0, 0, 0], [1.15, 0.9, 1])]), brownMat);
  const eyeM = ctx.eye('#1c0d05', '#ff2a14');
  mk(head, merged('yo_eyes', () => [xf(G.sph(0.075, 6, 5), [0.085, 0.04, 0.1]), xf(G.sph(0.075, 6, 5), [-0.085, 0.04, 0.1])]), eyeM);
  mk(head, merged('yo_glint', () => [xf(G.box(0.02, 0.02, 0.01), [0.1, 0.07, 0.17]), xf(G.box(0.02, 0.02, 0.01), [-0.07, 0.07, 0.17])]), bas('#fff6d0'));
  mk(head, merged('yo_mand', () => [xf(G.cone(0.02, 0.08, 4), [0.035, -0.08, 0.13], [PI / 2 + 0.6, 0, 0]), xf(G.cone(0.02, 0.08, 4), [-0.035, -0.08, 0.13], [PI / 2 + 0.6, 0, 0])]), darkMat);
  const ants = [1, -1].map((s) => { const p = pv(head, [s * 0.05, 0.12, 0.08], [0.3, 0, -s * 0.4]); mk(p, G.segY(0.2, 0.008, 0.004, 3), darkMat, null, [PI, 0, 0]); return p; });
  const wings = [1, -1].map((s) => { const p = pv(trunk, [s * 0.07, 0.58, -0.14]); mk(p, G.plane(0.16, 0.42), wingMat, [s * 0.05, -0.2, 0], [0, 0, s * 0.1]); return p; });
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.14, 0, 0]);
    mk(hip, G.segY(0.18, 0.065, 0.05, 5), shellMat);
    const knee = pv(hip, [0, -0.18, 0]);
    mk(knee, merged('yo_shin', () => [xf(G.segY(0.15, 0.045, 0.03, 4)), xf(G.box(0.1, 0.03, 0.12), [0, -0.15, 0.03])]), darkMat);
    return { hip, knee, s };
  });
  const midLegs = [1, -1].map((s) => bugLeg(trunk, darkMat, [s * 0.26, 0.2, 0.08], s, 0.3, [[0.16, 0.025, 0.02, 0.2], [0.2, 0.02, 0.006, -1.6]]));
  const arms = [1, -1].map((s) => {
    const sh = pv(trunk, [s * 0.15, 0.5, 0.14]);
    mk(sh, G.segY(0.18, 0.035, 0.028, 4), brownMat);
    const el = pv(sh, [0, -0.18, 0]);
    mk(el, merged('yo_fore', () => [xf(G.segY(0.18, 0.028, 0.015, 4)), xf(G.cone(0.02, 0.07, 3), [0, -0.2, 0.02], [PI, 0, 0])]), darkMat);
    return { sh, el, s };
  });
  const carry = new THREE.Object3D();
  carry.name = 'carry';
  carry.position.set(0, 0.36, 0.36);
  trunk.add(carry);
  return {
    parts: { head, carry, mouth: head },
    height: 1.0, radius: 0.35,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.3, 3.6);
      const fly = ctx.w('fly', c.st === 'fly', 5, dt);
      const ph = ctx.gait(c.speed * (1 - fly), 0.5, dt);
      const amp = clamp(c.speed / 1.8, 0, 1) * c.alive * (1 - fly);
      const s = Math.sin(ph);
      const atk = c.st === 'attack' ? a.t % 0.9 : -1;
      const rear = atk >= 0 ? keys(atk, [[0, 0], [0.25, -0.35], [0.45, 0.45], [0.8, 0]]) : 0;
      const deadK = smooth(c.dead);
      // body
      hips.position.set(0, 0.32 + Math.abs(s) * 0.03 * amp + fly * (0.45 + Math.sin(c.tm * 4) * 0.07) + (atk >= 0 ? Math.max(0, -rear) * 0.15 : 0), rear * 0.2 - c.hurt * 0.1);
      trunk.rotation.set(0.22 + 0.2 * amp * (c.st === 'run' ? 1 : 0.3) + rear + fly * 0.25 - c.hurt * 0.4 + Math.sin(c.tm * 1.7) * 0.03, 0,
        s * 0.14 * amp + c.stun * Math.sin(c.tm * 4) * 0.2);
      const breathe = 1 + Math.sin(c.tm * 2.2) * 0.02;
      trunk.scale.set(breathe, 1, breathe);
      head.rotation.set(-0.2 + Math.sin(c.tm * 0.9) * 0.1 - (atk >= 0 ? 0.3 : 0), Math.sin(c.tm * 0.6) * 0.35 * (1 - amp) + c.stun * Math.cos(c.tm * 4) * 0.3, Math.sin(c.tm * 0.45 + 1) * 0.25 * (1 - amp));
      for (const an of ants) an.rotation.x = 0.3 + Math.sin(c.tm * 7 + an.position.x * 40) * 0.15;
      // wings: folded / buzzing
      const buzz = Math.sin(c.tm * 71) * 0.6;
      for (const [i, w] of wings.entries()) {
        const sd = i === 0 ? 1 : -1;
        w.rotation.set(lerp(0.15, -0.4, fly), sd * lerp(0.1, 0.5 + buzz * 0.3, fly), sd * lerp(0.05, 1.0 + buzz, fly) + (c.st === 'attack' ? sd * 0.4 : 0));
      }
      // legs
      for (const L of legs) {
        const p = L.s > 0 ? s : -s;
        L.hip.rotation.x = lerp(-p * 0.5 * amp - 0.1, 0.35, fly) + lerp(0, -1.2, deadK);
        L.knee.rotation.x = lerp(Math.max(0, L.s > 0 ? Math.cos(ph) : -Math.cos(ph)) * 0.8 * amp + 0.1, 0.5, fly) + deadK * 1.2;
      }
      for (const L of midLegs) {
        L.hip.rotation.y = L.yaw0 + Math.sin(ph + (L.side > 0 ? 0 : PI)) * 0.3 * amp * L.side;
        L.joints[0].rotation.z = L.base[0] + fly * -0.6 + deadK * 0.8 + c.stun * Math.sin(c.tm * 20) * 0.2;
      }
      // arms: hold forward, flail when attacking
      for (const A of arms) {
        const fl = atk >= 0 ? Math.sin(c.tm * 18 + A.s) * 0.4 : 0;
        A.sh.rotation.set(-1.0 - (atk >= 0 ? 0.9 : 0) + fl + Math.sin(c.tm * 1.5 + A.s) * 0.05 + deadK * -0.8, 0, A.s * (0.25 + (atk >= 0 ? 0.3 : 0)));
        A.el.rotation.x = -0.9 + (atk >= 0 ? 0.5 : 0) + deadK * -0.5;
      }
      // dead: toppled onto its back, legs in the air
      ctx.body.rotation.x = -PI * 0.5 * deadK;
      ctx.body.position.set(0, deadK * 0.42, deadK * 0.35);
    },
  };
}

// ================================================================== 3. CRAWLER (thumper)
function buildCrawler(ctx) {
  const flesh = lam('#8a8480', { map: fleshTex('crawler', '#8e8784', '#6d4a4a') });
  const inner = lam('#3d0a0c', { side: THREE.DoubleSide });
  const bone = lam('#e3dcc4');
  const torso = pv(ctx.body, [0, 0.72, 0.15], null, 'torso');
  mk(torso, merged('cr_body', () => [
    xf(G.sph(1, 9, 7), [0, 0, 0], [0.15, 0, 0], [0.46, 0.42, 0.52]),
    xf(G.sph(1, 8, 6), [0, -0.2, -0.5], [0.3, 0, 0], [0.4, 0.34, 0.5]),
    xf(G.sph(1, 7, 5), [0, -0.45, -0.98], [0.35, 0, 0], [0.27, 0.2, 0.42]),
    xf(G.sph(1, 6, 4), [0.3, 0.12, 0.05], [0, 0, 0.4], [0.2, 0.22, 0.3]), xf(G.sph(1, 6, 4), [-0.3, 0.12, 0.05], [0, 0, -0.4], [0.2, 0.22, 0.3]),
  ]), flesh);
  // gaping mouth at the front
  mk(torso, merged('cr_throat', () => [xf(G.cone(0.27, 0.35, 8, true), [0, 0.02, 0.36], [-PI / 2, 0, 0])]), inner);
  mk(torso, merged('cr_uteeth', () => {
    const a = [];
    for (let i = 0; i < 9; i++) { const t = PI * (0.08 + (0.84 * i) / 8); a.push(xf(G.cone(0.035, 0.13, 3), [Math.cos(t) * 0.25, 0.02 + Math.sin(t) * 0.22, 0.44], [-0.3 - Math.sin(t) * 0.6, 0, t - PI / 2 + PI])); }
    return a;
  }), bone);
  const eyeM = ctx.eye('#e8dd8a');
  mk(torso, merged('cr_eyes', () => [xf(G.box(0.035, 0.035, 0.02), [0.16, 0.3, 0.45]), xf(G.box(0.035, 0.035, 0.02), [-0.16, 0.3, 0.45])]), eyeM);
  const jaw = pv(torso, [0, -0.08, 0.3], null, 'jaw');
  mk(jaw, merged('cr_jaw', () => [xf(G.sph(1, 7, 3, 0, TAU, PI / 2, PI / 2), [0, 0, 0.12], [0, 0, 0], [0.3, 0.14, 0.26])]), flesh);
  mk(jaw, merged('cr_lteeth', () => {
    const a = [];
    for (let i = 0; i < 7; i++) { const t = PI * (0.15 + (0.7 * i) / 6); a.push(xf(G.cone(0.03, 0.11, 3), [Math.cos(t) * 0.24, 0.03, 0.12 + Math.sin(t) * 0.2], [0.25, 0, 0])); }
    return a;
  }), bone);
  const arms = [1, -1].map((s) => {
    const sh = pv(torso, [s * 0.44, 0.12, 0.12]);
    mk(sh, merged('cr_uarm', () => [xf(G.segY(0.55, 0.15, 0.11, 6)), xf(G.sph(1, 6, 4), [0, -0.2, 0.05], [0, 0, 0], [0.16, 0.22, 0.17])]), flesh);
    const el = pv(sh, [0, -0.55, 0]);
    mk(el, G.segY(0.5, 0.12, 0.09, 6), flesh);
    const wr = pv(el, [0, -0.5, 0]);
    mk(wr, merged('cr_hand', () => [xf(G.box(0.24, 0.08, 0.24), [0, -0.03, 0.08]),
      xf(G.cone(0.035, 0.2, 4), [0.08, -0.05, 0.28], [PI / 2 + 0.4, 0, 0]), xf(G.cone(0.035, 0.22, 4), [0, -0.05, 0.3], [PI / 2 + 0.4, 0, 0]), xf(G.cone(0.035, 0.2, 4), [-0.08, -0.05, 0.28], [PI / 2 + 0.4, 0, 0])]), flesh);
    return { sh, el, wr, s };
  });
  return {
    parts: { head: torso, mouth: jaw },
    height: 1.2, radius: 0.6,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.8, 7);
      const run = ctx.w('run', c.st === 'run', 6, dt);
      const ph = ctx.gait(c.speed, lerp(1.4, 2.6, run), dt);
      const amp = clamp(c.speed / 2, 0, 1) * c.alive;
      const deadK = smooth(c.dead);
      const atk = c.st === 'attack' ? a.t % 1.0 : -1;
      const lunge = atk >= 0 ? keys(atk, [[0, 0], [0.2, -0.18], [0.4, 0.55], [0.7, 0]]) : 0;
      const s = Math.sin(ph), s2 = Math.sin(ph * 2);
      torso.position.set(Math.sin(c.tm * 0.8) * 0.02, 0.72 + Math.abs(s) * lerp(0.05, 0.16, run) * amp - c.stun * 0.15 - deadK * 0.15 + Math.sin(c.tm * 1.8) * 0.01, 0.15 + lunge - c.hurt * 0.2);
      torso.rotation.set(lerp(0, s2 * 0.1, run) * amp + lunge * 0.4 - c.hurt * 0.3 + c.stun * 0.15, Math.sin(c.tm * 0.5) * 0.08 * (1 - amp), (1 - run) * s * 0.08 * amp + deadK * 0.15 + c.stun * Math.sin(c.tm * 2) * 0.08);
      let open = 0.15 + Math.max(0, Math.sin(c.tm * 0.9)) * 0.2 + run * 0.35 * amp;
      if (atk >= 0) open = atk < 0.12 ? 0.3 : atk < 0.4 ? 1.0 : 0.05;
      jaw.rotation.x = lerp(open, 0.7, Math.max(c.stun, deadK));
      for (const A of arms) {
        // walk: alternating reach & pull; run: galloping, arms nearly in sync
        const p = ph + (A.s > 0 ? 0 : lerp(PI, 0.5, run));
        const reach = Math.sin(p), lift = Math.max(0, Math.cos(p));
        let sx = -0.55 - reach * lerp(0.55, 0.9, run) * amp;
        let sz = A.s * (0.35 + lift * 0.15 * amp);
        let ex = -0.5 - lift * 0.6 * amp;
        if (atk >= 0) { sx = lerp(sx, -1.6, ramp(atk, 0.1, 0.35)); sz = A.s * lerp(0.35, 1.0, ramp(atk, 0.1, 0.35)); ex = -0.2; }
        sx = lerp(sx, 0.1, c.stun * 0.6); ex = lerp(ex, -0.1, c.stun * 0.6);
        sx = lerp(sx, -0.2, deadK); sz = lerp(sz, A.s * 1.35, deadK); ex = lerp(ex, -0.15, deadK);
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
        A.wr.rotation.x = -(sx + ex) * 0.7 - 0.2;
      }
    },
  };
}

// ================================================================== 4. LURKER (bracken)
function buildLurker(ctx) {
  const skin = lam('#1c2419', { map: tex('lurkSkin', 32, 32, (c2, w, h, r) => { noiseFill(c2, w, h, r, '#222c1d', 0.25, 2); }) });
  const frondM = lam('#33422a', { map: scaleTex('lurker', '#34442b', '#1a2314', '#5b6d43'), side: THREE.DoubleSide });
  const hips = pv(ctx.body, [0, 1.0, 0], null, 'hips');
  mk(hips, merged('lu_pelvis', () => [xf(G.sph(1, 6, 4), [0, 0.02, 0], [0, 0, 0], [0.16, 0.1, 0.11])]), skin);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.11, 0, 0]);
    mk(hip, G.segY(0.52, 0.065, 0.04, 5), skin);
    const knee = pv(hip, [0, -0.52, 0]);
    mk(knee, G.segY(0.48, 0.045, 0.028, 5), skin);
    const ankle = pv(knee, [0, -0.48, 0]);
    mk(ankle, merged('lu_foot', () => [xf(G.boxZ(0.07, 0.025, 0.18), [0, -0.01, -0.03]), xf(G.cone(0.012, 0.08, 3), [0.025, -0.015, 0.18], [PI / 2, 0, 0]), xf(G.cone(0.012, 0.08, 3), [-0.025, -0.015, 0.18], [PI / 2, 0, 0])]), skin);
    return { hip, knee, ankle, s };
  });
  const spine = pv(hips, [0, 0.06, 0], null, 'spine');
  mk(spine, merged('lu_torso', () => [
    xf(G.cyl(0.13, 0.08, 0.62, 6), [0, 0.31, 0], [0, 0, 0], [1, 1, 0.7]),
    xf(G.sph(1, 6, 4), [0, 0.56, -0.02], [0, 0, 0], [0.2, 0.09, 0.1]),
    xf(G.cone(0.03, 0.12, 3), [0, 0.45, -0.1], [-1.9, 0, 0]), xf(G.cone(0.03, 0.12, 3), [0, 0.3, -0.08], [-1.9, 0, 0]),
  ]), skin);
  const neck = pv(spine, [0, 0.62, 0.02], null, 'neck');
  mk(neck, G.segY(0.14, 0.035, 0.04, 4), skin, null, [PI, 0, 0]);
  const head = pv(neck, [0, 0.13, 0.03], null, 'head');
  mk(head, merged('lu_head', () => [xf(G.sph(1, 6, 5), [0, 0.05, 0.02], [0, 0, 0], [0.1, 0.13, 0.11])]), skin);
  const eyeM = ctx.eye('#e2ff9a');
  mk(head, merged('lu_eyes', () => [xf(G.box(0.055, 0.012, 0.01), [0.045, 0.07, 0.125], [0, 0, -0.35]), xf(G.box(0.055, 0.012, 0.01), [-0.045, 0.07, 0.125], [0, 0, 0.35])]), eyeM);
  const fronds = [];
  const FR = [[-1.35, 0.3, 1.0], [-0.95, 0.55, 1.15], [-0.5, 0.75, 1.25], [0, 0.85, 1.3], [0.5, 0.75, 1.25], [0.95, 0.55, 1.15], [1.35, 0.3, 1.0], [-0.35, -0.6, 0.8], [0.35, -0.6, 0.8]];
  FR.forEach(([al, el, len], i) => {
    const o = pv(head, [0, 0.08, 0.0], [0, 0, al]);
    const f = pv(o, null, [el, 0, 0]);
    const front = el < 0; // two small hood fronds curling over the face
    mk(f, merged('lu_frond' + (front ? 'F' : 'B'), () => [xf(G.sph(1, 5, 3), [0, 0, front ? 0.12 : -0.2], [0, 0, 0], front ? [0.05, 0.012, 0.14] : [0.075, 0.014, 0.26])]), frondM, null, null, [1, 1, len]);
    f.userData = { el, al, i };
    fronds.push({ o, f });
  });
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * 0.2, 0.56, 0]);
    mk(sh, G.segY(0.5, 0.045, 0.035, 5), skin);
    const el = pv(sh, [0, -0.5, 0]);
    mk(el, G.segY(0.48, 0.035, 0.025, 5), skin);
    mk(el, merged('lu_hand', () => [xf(G.cone(0.014, 0.2, 3), [0.025, -0.58, 0.01], [PI, 0, 0.1]), xf(G.cone(0.014, 0.22, 3), [0, -0.59, 0.03], [PI, 0, 0]), xf(G.cone(0.014, 0.2, 3), [-0.025, -0.58, 0.01], [PI, 0, -0.1]), xf(G.sph(0.035, 4, 3), [0, -0.49, 0])]), skin);
    return { sh, el, s };
  });
  return {
    parts: { head },
    height: 2.2, radius: 0.4,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.3, 5.5);
      const sneak = ctx.w('sneak', c.st === 'sneak', 5, dt);
      const angry = ctx.w('angry', c.st === 'angry', 6, dt);
      const fast = ctx.w('fast', c.st === 'run' || c.st === 'flee', 5, dt);
      const deadK = smooth(c.dead);
      const ph = ctx.gait(c.speed, lerp(lerp(1.5, 2.4, fast), 0.9, sneak), dt);
      const amp = clamp(c.speed / 2, 0, 1) * c.alive;
      const s = Math.sin(ph), co = Math.cos(ph);
      const atk = c.st === 'attack' ? a.t % 0.9 : -1;
      const grab = atk >= 0 ? keys(atk, [[0, 0], [0.25, 1], [0.55, 1], [0.8, 0]]) : 0;
      const shake = angry * Math.sin(c.tm * 43) * 0.02;
      // legs (crouch via sneak)
      const ct = lerp(0.25, 0.85, sneak) * (1 - angry) * c.alive;
      const la = lerp(0.5, 0.75, fast) * amp;
      for (const L of legs) {
        const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
        L.hip.rotation.set(-p * la - ct - c.hurt * 0.2, 0, L.s * (0.05 + angry * 0.12));
        L.knee.rotation.x = 2 * ct + Math.max(0, pc) * lerp(0.9, 1.3, fast) * amp;
        L.ankle.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.85;
      }
      hips.position.set(shake, 1.0 * Math.cos(ct) + Math.abs(s) * 0.04 * amp + angry * 0.05 + shake, 0);
      // torso hunch
      const hunch = lerp(lerp(0.55, 0.95, sneak), 0.08, angry) + fast * 0.25 + grab * 0.35 - c.hurt * 0.5 + Math.sin(c.tm * 1.2) * 0.03;
      spine.rotation.set(lerp(hunch, -0.1, deadK), s * 0.1 * amp + Math.sin(c.tm * 0.4) * 0.06, c.stun * Math.sin(c.tm * 2.5) * 0.2);
      neck.rotation.set(-lerp(hunch, 0, deadK) * 0.8 + Math.sin(c.tm * 0.7) * 0.08 - sneak * 0.2, Math.sin(c.tm * 0.37) * 0.3 * (1 - amp) * (1 - angry), Math.sin(c.tm * 0.53) * 0.25 * (1 - amp) + c.stun * 0.3);
      // fronds: breathe, flare when angry
      for (const { o, f } of fronds) {
        const u = f.userData, flut = Math.sin(c.tm * (3 + angry * 14) + u.i * 1.3) * (0.04 + angry * 0.08);
        f.rotation.x = u.el + (u.el > 0 ? angry * 0.55 + fast * -0.25 : angry * 0.3) + flut;
        o.rotation.z = u.al * (1 + angry * 0.25);
      }
      // arms
      for (const A of arms) {
        let sx = -0.15 - hunch * 0.6 + (A.s > 0 ? s : -s) * 0.35 * amp * (1 - fast) + Math.sin(c.tm * 0.9 + A.s) * 0.04;
        let sz = A.s * 0.12, ex = -0.35;
        sx = lerp(sx, -0.9, sneak); ex = lerp(ex, -0.2, sneak);
        sx = lerp(sx, 0.6, fast * 0.7); ex = lerp(ex, -0.9, fast * 0.7);
        sx = lerp(sx, -0.5 + shake * 5, angry); sz = lerp(sz, A.s * 1.25, angry); ex = lerp(ex, -0.6, angry);
        sx = lerp(sx, -1.9, grab); sz = lerp(sz, A.s * 0.25, grab); ex = lerp(ex, -0.1, grab);
        sx = lerp(sx, 0.3, c.stun * 0.5);
        sx = lerp(sx, -2.8, deadK); sz = lerp(sz, A.s * 0.3, deadK);
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
      }
      // dead: falls flat on its face
      ctx.body.rotation.x = PI * 0.49 * deadK * deadK;
      ctx.body.position.y = 0.14 * deadK;
    },
  };
}

// ================================================================== 5. MANNEQUIN (coil-head)
// sphere UVs: the +Z face centre sits at u = 0.25 → x = 16 on a 64x32 canvas
function mannequinFaceTex() {
  return tex('mannequinFace', 64, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#e6dccb', 0.04, 2);
    c.fillStyle = 'rgba(214,120,120,0.55)';
    c.beginPath(); c.arc(9, 18, 3, 0, TAU); c.arc(23, 18, 3, 0, TAU); c.fill();
    c.fillStyle = '#140808';
    c.fillRect(11, 11, 3, 3); c.fillRect(18, 11, 3, 3);
    c.strokeStyle = '#a3141a'; c.lineWidth = 2;
    c.beginPath(); c.arc(16, 15, 8, 0.15 * PI, 0.85 * PI); c.stroke();
    c.fillStyle = '#7a0a0f';
    c.fillRect(12, 13, 1, 6); c.fillRect(19, 13, 1, 4); c.fillRect(14, 23, 1, 5); c.fillRect(18, 23, 1, 7); c.fillRect(21, 21, 1, 4);
    c.fillStyle = '#e9e2d0'; for (let i = 0; i < 6; i++) c.fillRect(11 + i * 2, 21, 1, 1);
  }, false);
}
function helixGeo() {
  return merged('mq_spring', () => {
    class Helix extends THREE.Curve {
      getPoint(t, tgt = new THREE.Vector3()) { const a = t * TAU * 7; return tgt.set(Math.cos(a) * 0.05, t * 0.36, Math.sin(a) * 0.05); }
    }
    return [new THREE.TubeGeometry(new Helix(), 56, 0.012, 3, false)];
  });
}
function buildMannequin(ctx) {
  const plastic = lam('#e2d8c8', { flat: false });
  const joint = lam('#c9bfae', { flat: false });
  const metal = lam('#8d9194');
  const hips = pv(ctx.body, [0, 0.95, 0], null, 'hips');
  mk(hips, merged('mq_pelvis', () => [xf(G.sph(1, 8, 5), [0, 0, 0], [0, 0, 0], [0.16, 0.12, 0.11])]), plastic);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.09, -0.03, 0]);
    mk(hip, G.segY(0.45, 0.075, 0.052, 7), plastic);
    const knee = pv(hip, [0, -0.45, 0]);
    mk(knee, merged('mq_shin', () => [xf(G.segY(0.42, 0.05, 0.036, 7)), xf(G.box(0.08, 0.05, 0.2), [0, -0.44, 0.05]), xf(G.sph(0.05, 5, 4))]), joint);
    return { hip, knee, s };
  });
  const spine = pv(hips, [0, 0.06, 0], null, 'spine');
  mk(spine, merged('mq_torso', () => [
    xf(G.lathe('mq_torso', [[0.001, 0], [0.12, 0], [0.135, 0.1], [0.115, 0.22], [0.165, 0.38], [0.175, 0.47], [0.12, 0.54], [0.04, 0.57], [0.001, 0.57]], 9), [0, 0, 0], [0, 0, 0], [1, 1, 0.7]),
    xf(G.cyl(0.035, 0.04, 0.06, 6), [0, 0.59, 0]),
  ]), plastic);
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * 0.2, 0.49, 0]);
    mk(sh, merged('mq_uarm', () => [xf(G.segY(0.3, 0.045, 0.038, 7)), xf(G.sph(0.05, 5, 4))]), plastic);
    const el = pv(sh, [0, -0.3, 0]);
    mk(el, merged('mq_farm', () => [xf(G.segY(0.27, 0.038, 0.028, 7)), xf(G.box(0.05, 0.12, 0.025), [0, -0.32, 0])]), joint);
    return { sh, el, s };
  });
  const springP = pv(spine, [0, 0.61, 0], null, 'spring');
  const coil = pv(springP);
  mk(coil, helixGeo(), metal);
  const head = pv(springP, [0, 0.36, 0], null, 'head');
  mk(head, G.sph(0.12, 10, 7), lam('#ffffff', { flat: false, map: mannequinFaceTex() }), [0, 0.12, 0], [0, 0, 0], [0.9, 1.18, 0.95]);
  const eyeM = ctx.eye('#1a0808', '#ff2020');
  mk(head, merged('mq_eyes', () => [xf(G.box(0.02, 0.02, 0.01), [0.026, 0.15, 0.113]), xf(G.box(0.02, 0.02, 0.01), [-0.026, 0.15, 0.113])]), eyeM);
  let wobE = 0.35, lastSt = '';
  return {
    parts: { head, spring: springP },
    height: 2.2, radius: 0.35,
    update(dt, a) {
      const c = common(ctx, a, dt, 2.2, 6);
      if (c.st !== lastSt) { wobE = Math.max(wobE, 0.35); lastSt = c.st; }
      const deadK = smooth(c.dead);
      const moving = (c.st === 'walk' || c.st === 'run') && c.speed > 0.05;
      const run = ctx.w('run', c.st === 'run', 8, dt);
      const ph = ctx.gait(c.speed, lerp(1.3, 2.0, run), dt);
      // rigid, jerky locomotion: phase quantised into snapping steps
      const q = PI / 3, qph = Math.floor(ph / q) * q + q * smooth(((ph % q) / q - 0.8) / 0.2);
      const amp = moving ? lerp(0.42, 0.7, run) : 0;
      const sq = Math.sin(qph);
      for (const L of legs) { L.hip.rotation.x = (L.s > 0 ? -sq : sq) * amp; L.knee.rotation.x = deadK * 0.1; }
      for (const A of arms) { A.sh.rotation.set((A.s > 0 ? sq : -sq) * amp * 0.35 + deadK * -0.3, 0, A.s * 0.08); A.el.rotation.x = -0.1; }
      hips.position.y = 0.95 - (1 - Math.cos(sq * amp)) * 0.1;
      spine.rotation.set(run * 0.15 * (moving ? 1 : 0) - c.hurt * 0.3, 0, c.stun * 0.15);
      // spring head: persistent decaying wobble, re-excited by motion
      if (moving) wobE = Math.max(wobE, 0.12 + run * 0.1 + Math.abs(Math.sin(qph * 3)) * 0.1);
      if (c.hurt > 0.5) wobE = 0.5;
      if (c.stun > 0.1) wobE = Math.max(wobE, 0.45);
      wobE = Math.max(0.025, wobE * Math.exp(-dt * 1.2));
      const tt = c.tm;
      let sx = Math.sin(tt * 9.3) * wobE, sz = Math.cos(tt * 7.1) * wobE * 0.8, stretch = 1 + Math.sin(tt * 11) * wobE * 0.25;
      // attack: head lunges out on the spring
      if (c.st === 'attack') { const k = keys(a.t % 0.7, [[0, 0], [0.15, 1], [0.35, 1], [0.6, 0]]); stretch += k * 1.3; sx += k * 1.1; }
      springP.rotation.set(sx + deadK * 0.9, Math.sin(tt * 0.3) * 0.05, sz);
      coil.scale.y = stretch;
      head.position.y = 0.36 * stretch;
      head.rotation.set(-sx * 0.6, Math.sin(tt * 5.3) * wobE * 0.5 + c.stun * tt * 3, -sz * 0.5);
      ctx.body.rotation.x = -PI * 0.48 * deadK * deadK;
      ctx.body.position.set(0, 0.12 * deadK, 0);
    },
  };
}

// ================================================================== 6. SLUDGE
function buildSludge(ctx) {
  const blobMat = lam('#5fbf3a', { transparent: true, opacity: 0.7, depthWrite: false });
  const coreMat = lam('#2f7a1c', { transparent: true, opacity: 0.55, depthWrite: false });
  const bone = lam('#ddd6bc'), rust = lam('#6b4a2a');
  // per-instance jiggling geometry
  const geo = ctx.own(new THREE.IcosahedronGeometry(1, 2));
  const pos = geo.attributes.position, base = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    y = y < 0 ? y * 0.12 : y;
    base[i * 3] = x * 0.8; base[i * 3 + 1] = y * 0.95 + 0.12; base[i * 3 + 2] = z * 0.8;
  }
  geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const jig = pv(ctx.body, null, null, 'blob');
  const blob = mk(jig, geo, blobMat);
  blob.renderOrder = 2;
  const core = mk(jig, G.ico(0.42, 1), coreMat, [0, 0.42, 0], null, [1, 0.8, 1]);
  core.renderOrder = 1;
  const eyeM = ctx.eye('#caff7a', '#ff3020', { transparent: true, opacity: 0.85 });
  const nucleus = mk(jig, G.ico(0.06, 0), eyeM, [0.08, 0.5, 0.15]);
  const debris = [];
  const addD = (geoD, mat, p, spd) => { const piv = pv(jig, p); const m = mk(piv, geoD, mat); m.rotation.set(ctx.rnd() * 3, ctx.rnd() * 3, 0); debris.push({ piv, m, p, spd, ph: ctx.rnd() * TAU }); };
  const boneG = merged('sl_bone', () => [xf(G.cyl(0.018, 0.018, 0.34, 4), [0, 0, 0], [0, 0, PI / 2]), xf(G.sph(0.035, 4, 3), [0.17, 0, 0]), xf(G.sph(0.035, 4, 3), [-0.17, 0, 0])]);
  addD(boneG, bone, [0.3, 0.35, -0.1], 0.6);
  addD(boneG, bone, [-0.25, 0.25, 0.2], -0.4);
  addD(merged('sl_skull', () => [xf(G.sph(0.09, 6, 5), [0, 0.03, 0]), xf(G.box(0.1, 0.05, 0.07), [0, -0.04, 0.03])]), bone, [-0.1, 0.55, -0.25], 0.3);
  addD(G.box(0.1, 0.12, 0.2), rust, [0.2, 0.3, 0.3], -0.5);
  addD(G.box(0.12, 0.02, 0.12), rust, [-0.35, 0.18, -0.2], 0.8);
  let surge = 0;
  return {
    parts: { head: jig, core },
    height: 1.0, radius: 0.8,
    update(dt, a) {
      const c = common(ctx, a, dt, 0.8, 1.6);
      const deadK = smooth(c.dead);
      const ph = ctx.gait(c.speed, 0.7, dt);
      const amp = clamp(c.speed / 0.8, 0, 1) * c.alive;
      const calm = ctx.w('calm', c.st === 'calm' || c.st === 'dance', 4, dt);
      const tm = c.tm;
      surge = c.st === 'attack' ? keys(a.t % 1.2, [[0, 0], [0.2, -0.3], [0.45, 1], [0.8, 0.3], [1.2, 0]]) : damp(surge, 0, 6, dt);
      const beat = calm * Math.abs(Math.sin(tm * 4));
      const sp = Math.sin(ph);
      const sy = (1 - 0.14 * sp * amp) * (1 + surge * 0.25 - beat * 0.12) * lerp(1, 0.13, deadK) * (1 - c.stun * 0.15);
      const sz = (1 + 0.18 * sp * amp) * (1 + surge * 0.45) * lerp(1, 1.5, deadK);
      const sx = (1 + 0.05 * sp * amp) * (1 - surge * 0.1 + beat * 0.08) * lerp(1, 1.55, deadK) * (1 + c.stun * 0.08);
      jig.scale.set(sx, sy, sz);
      jig.position.set(0, 0, 0.06 * sp * amp + surge * 0.35);
      jig.rotation.set(surge * 0.15 + Math.sin(tm * 1.1) * 0.02, calm * Math.sin(tm * 2) * 0.2, Math.sin(tm * 0.8) * 0.03);
      // vertex jiggle
      const A = (0.035 + amp * 0.03 + c.hurt * 0.12 + c.stun * 0.05 + surge * 0.04) * (1 - deadK * 0.7);
      const arr = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const k = y > 0.15 ? 1 : y / 0.15;
        const n = Math.sin(x * 4 + tm * 2.3) + Math.sin(z * 5 - tm * 1.9 + y * 3) * 0.8 + Math.sin((x + z) * 7 + tm * 4.1) * 0.3;
        const f = 1 + A * n * k;
        arr[i * 3] = x * f; arr[i * 3 + 1] = y * (1 + A * 0.5 * n * k); arr[i * 3 + 2] = z * f;
      }
      pos.needsUpdate = true;
      core.position.y = 0.42 + Math.sin(tm * 1.3) * 0.04;
      nucleus.position.set(0.08 + Math.sin(tm * 0.7) * 0.1, 0.5 + Math.sin(tm * 1.1) * 0.06, 0.15 + Math.cos(tm * 0.9) * 0.1);
      for (const d of debris) {
        d.piv.position.set(d.p[0] + Math.sin(tm * d.spd + d.ph) * 0.08, lerp(d.p[1] + Math.sin(tm * 0.9 + d.ph) * 0.05, 0.4, deadK), d.p[2] + Math.cos(tm * d.spd + d.ph) * 0.08);
        d.m.rotation.y += dt * d.spd * 0.5; d.m.rotation.x += dt * d.spd * 0.3;
      }
    },
  };
}

// ================================================================== 7. JESTER (music box)
function jesterBoxTex() {
  return tex('jesterBox', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#8c2a22', 0.12, 2);
    c.fillStyle = '#d7b13d';
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const cx = 8 + x * 16, cy = 8 + y * 16;
      c.beginPath(); c.moveTo(cx, cy - 6); c.lineTo(cx + 5, cy); c.lineTo(cx, cy + 6); c.lineTo(cx - 5, cy); c.fill();
    }
    c.fillStyle = '#4b1712'; c.fillRect(0, 0, w, 1); c.fillRect(0, 0, 1, h);
    c.fillStyle = 'rgba(90,50,20,0.6)'; for (let i = 0; i < 14; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 2, 1 + ((r() * 3) | 0));
  });
}
function clownFaceTex() {
  return tex('clownFace', 64, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#ece6da', 0.05, 2);
    c.fillStyle = '#0b0606'; c.beginPath(); c.ellipse(11, 11, 3, 4, 0.3, 0, TAU); c.ellipse(21, 11, 3, 4, -0.3, 0, TAU); c.fill();
    c.fillStyle = '#b01018'; c.beginPath(); c.moveTo(3, 15); c.quadraticCurveTo(16, 31, 29, 15); c.quadraticCurveTo(16, 23, 3, 15); c.fill();
    c.fillStyle = '#f4f0e0'; for (let i = 0; i < 10; i++) c.fillRect(6 + i * 2, 18 + Math.abs(i - 4.5) * -0.6, 1, 2);
    c.fillStyle = '#d82020'; c.beginPath(); c.arc(16, 15, 2.2, 0, TAU); c.fill();
    c.fillStyle = '#3a1a5a'; c.fillRect(10, 5, 3, 1); c.fillRect(19, 5, 3, 1);
  }, false);
}
function buildJester(ctx) {
  const boxMat = lam('#8c2a22', { map: jesterBoxTex() });
  const trim = lam('#4a4a4e');
  const brass = lam('#b08a3a');
  const pale = lam('#ece6da');
  const hatA = lam('#8a1c2a'), hatB = lam('#d7b13d');
  const legs = [1, -1].map((s) => {
    const hip = pv(ctx.body, [s * 0.25, 0.42, 0]);
    mk(hip, G.segY(0.22, 0.085, 0.07, 5), trim);
    const knee = pv(hip, [0, -0.22, 0]);
    mk(knee, merged('je_shin', () => [xf(G.segY(0.15, 0.07, 0.06, 5)), xf(G.box(0.17, 0.08, 0.28), [0, -0.16, 0.05])]), trim);
    return { hip, knee, s };
  });
  const box = pv(ctx.body, [0, 0.42, 0], null, 'box');
  mk(box, merged('je_box', () => [xf(G.box(0.9, 1.35, 0.9), [0, 0.675, 0])]), boxMat);
  mk(box, merged('je_trim', () => [xf(G.box(0.96, 0.08, 0.96), [0, 0.04, 0]), xf(G.box(0.96, 0.06, 0.96), [0, 1.32, 0]), xf(G.box(0.06, 1.35, 0.06), [0.45, 0.675, 0.45]), xf(G.box(0.06, 1.35, 0.06), [-0.45, 0.675, 0.45]), xf(G.box(0.06, 1.35, 0.06), [0.45, 0.675, -0.45]), xf(G.box(0.06, 1.35, 0.06), [-0.45, 0.675, -0.45])]), trim);
  mk(box, G.box(0.8, 0.004, 0.8), bas('#050505'), [0, 1.353, 0]);
  const lid = pv(box, [0, 1.35, -0.47], null, 'lid');
  mk(lid, merged('je_lid', () => [xf(G.box(0.96, 0.08, 0.96), [0, 0.04, 0.47]), xf(G.sph(0.05, 5, 3), [0, 0.1, 0.47])]), brass);
  const crank = pv(box, [0.47, 0.75, 0], null, 'crank');
  mk(crank, merged('je_crank', () => [xf(G.cyl(0.025, 0.025, 0.12, 5), [0.06, 0, 0], [0, 0, PI / 2]), xf(G.box(0.03, 0.26, 0.04), [0.12, 0.11, 0]), xf(G.cyl(0.03, 0.03, 0.12, 5), [0.18, 0.22, 0], [0, 0, PI / 2])]), brass);
  // the jack: long neck + clown head + spindly arms
  const jack = pv(box, [0, 1.2, 0], null, 'jack');
  const necks = [];
  let parent = jack;
  for (let i = 0; i < 3; i++) {
    const n = pv(parent, i === 0 ? [0, 0, 0] : [0, 0.42, 0]);
    mk(n, merged('je_neck', () => [xf(G.cyl(0.035, 0.05, 0.42, 5), [0, 0.21, 0]), xf(G.tor(0.05, 0.02, 3, 6), [0, 0.36, 0], [PI / 2, 0, 0])]), trim);
    necks.push(n);
    parent = n;
  }
  const top = pv(parent, [0, 0.42, 0]);
  mk(top, merged('je_collar', () => { const a = []; for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; a.push(xf(G.cone(0.08, 0.2, 3), [Math.sin(t) * 0.12, 0.02, Math.cos(t) * 0.12], [PI / 2 - 0.3, t, 0], [1, 1, 0.4])); } return a; }), pale);
  const head = pv(top, [0, 0.2, 0], null, 'head');
  mk(head, G.sph(0.2, 10, 8), lam('#ffffff', { map: clownFaceTex() }), [0, 0, 0], null, [0.92, 1.1, 0.95]);
  const eyeM = ctx.eye('#fff6d8');
  mk(head, merged('je_eyes', () => [xf(G.sph(0.018, 4, 3), [0.07, 0.07, 0.17]), xf(G.sph(0.018, 4, 3), [-0.07, 0.07, 0.17])]), eyeM);
  mk(head, merged('je_hatA', () => [xf(G.cone(0.1, 0.34, 5), [0.13, 0.2, 0], [0, 0, -1.0]), xf(G.cyl(0.19, 0.2, 0.08, 8), [0, 0.15, 0])]), hatA);
  mk(head, merged('je_hatB', () => [xf(G.cone(0.1, 0.34, 5), [-0.13, 0.2, 0], [0, 0, 1.0]), xf(G.sph(0.04, 4, 3), [0.3, 0.3, 0]), xf(G.sph(0.04, 4, 3), [-0.3, 0.3, 0])]), hatB);
  const arms = [1, -1].map((s) => {
    const sh = pv(top, [s * 0.12, -0.02, 0]);
    mk(sh, G.segY(0.42, 0.022, 0.018, 4), trim, null, [0, 0, 0]);
    const el = pv(sh, [0, -0.42, 0]);
    mk(el, merged('je_farm', () => [xf(G.segY(0.4, 0.018, 0.014, 4)), xf(G.sph(0.05, 5, 4), [0, -0.43, 0]), xf(G.cone(0.012, 0.12, 3), [0.02, -0.5, 0.02], [PI, 0, 0.3])]), pale);
    return { sh, el, s };
  });
  let crankA = 0, wasPopped = false;
  return {
    parts: { head, lid, crank, jack },
    height: 1.9, radius: 0.55,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.1, 7);
      const st = c.st;
      const popped = st === 'popped' || st === 'run' || st === 'attack' || (st === 'dead' && wasPopped);
      if (st !== 'dead') wasPopped = popped;
      const deadK = smooth(c.dead);
      const pop = ctx.w('pop', popped, 14, dt);
      const walkLike = st === 'box_walk' || st === 'walk' || st === 'run';
      const run = ctx.w('run', st === 'run', 6, dt);
      const speed = walkLike ? (a.speed ?? (st === 'run' ? 7 : 1.1)) : (a.speed ?? 0);
      const ph = ctx.gait(speed, lerp(0.7, 1.4, run), dt);
      const amp = clamp(speed / 1.2, 0, 1) * c.alive;
      const s = Math.sin(ph);
      for (const L of legs) {
        L.hip.rotation.x = (L.s > 0 ? -s : s) * lerp(0.55, 0.9, run) * amp + deadK * 0.5;
        L.knee.rotation.x = Math.max(0, L.s > 0 ? Math.cos(ph) : -Math.cos(ph)) * 0.9 * amp;
      }
      // winding: crank speeds up, box trembles harder with progress
      const wind = st === 'winding' ? clamp(c.p || 0, 0, 1) : 0;
      crankA += dt * (st === 'winding' ? 3 + wind * 14 : st === 'box' || st === 'idle' ? 0.4 : 0);
      crank.rotation.x = crankA;
      const trem = (st === 'winding' ? 0.004 + wind * 0.03 : 0) + c.stun * 0.01;
      box.position.set(Math.sin(c.tm * 53) * trem, 0.42 + Math.abs(s) * 0.05 * amp + Math.abs(Math.sin(c.tm * 41)) * trem, Math.cos(c.tm * 47) * trem);
      box.rotation.set(run * 0.25 * amp - c.hurt * 0.2 + Math.sin(c.tm * 37) * trem * 1.5, Math.sin(c.tm * 0.4) * 0.03, s * lerp(0.1, 0.06, run) * amp + Math.sin(c.tm * 31) * trem * 2);
      // lid + jack
      lid.rotation.x = -2.3 * pop + (st === 'winding' && wind > 0.85 ? -Math.abs(Math.sin(c.tm * 30)) * 0.12 : 0);
      jack.visible = pop > 0.02;
      const tp = popped ? (st === 'popped' ? a.t : 1) : 0;
      const ext = pop * (1 + Math.exp(-tp * 5) * Math.sin(tp * 22) * 0.25);
      jack.scale.set(1, Math.max(0.01, ext), 1);
      const atk = st === 'attack' ? keys(a.t % 0.8, [[0, 0], [0.25, 1], [0.45, 1], [0.7, 0]]) : 0;
      necks.forEach((n, i) => {
        n.rotation.x = Math.sin(c.tm * 2.1 + i) * 0.1 + run * 0.18 + atk * 0.45 + deadK * 0.6;
        n.rotation.z = Math.sin(c.tm * 1.7 + i * 1.4) * (0.12 + run * 0.08);
      });
      head.rotation.set(Math.sin(c.tm * 1.3) * 0.2 - atk * 0.3, Math.sin(c.tm * 0.9) * 0.5, Math.sin(c.tm * 0.7) * 0.45 + (st === 'popped' ? Math.sin(c.tm * 9) * 0.1 : 0));
      head.scale.y = 1 / Math.max(0.2, ext) * pop;
      for (const A of arms) {
        const fl = Math.sin(c.tm * (run > 0.5 ? 14 : 5) + A.s * 2);
        A.sh.rotation.set(-0.6 + fl * 0.6 - atk * 1.2, 0, A.s * (0.8 + fl * 0.3) * (1 - deadK * 0.8));
        A.el.rotation.x = -0.7 + fl * 0.4;
      }
      // dead: tipped over onto its side
      ctx.body.rotation.z = PI * 0.5 * deadK * deadK;
      ctx.body.position.y = 0.5 * deadK;
    },
  };
}

// ================================================================== 8. SPIDER
function buildSpider(ctx) {
  const chitin = lam('#171517', { map: tex('spiderHair', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#1c191c', 0.35, 1); }) });
  const abdM = lam('#1b1719', { map: tex('spiderAbd', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#1d191b', 0.3, 1);
    c.fillStyle = '#6e1010'; c.fillRect(14, 6, 4, 6); c.fillRect(12, 12, 8, 2); c.fillRect(14, 14, 4, 6); c.fillRect(6, 24, 20, 1);
  }) });
  const fangM = lam('#2b0f0f');
  const silkM = ctx.own(basI('#e8e8e0', { transparent: true, opacity: 0.55 }));
  const body = pv(ctx.body, [0, 0.6, 0], null, 'body');
  const bob = pv(body);
  mk(bob, merged('sp_thorax', () => [xf(G.sph(1, 9, 6), [0, 0.04, 0.08], [0, 0, 0], [0.3, 0.19, 0.36]), xf(G.sph(1, 6, 4), [0, 0.07, 0.36], [0, 0, 0], [0.16, 0.12, 0.12])]), chitin);
  const abd = pv(bob, [0, 0.1, -0.22], null, 'abdomen');
  mk(abd, merged('sp_abd', () => [xf(G.sph(1, 10, 7), [0, 0.12, -0.5], [0.2, 0, 0], [0.44, 0.38, 0.58]), xf(G.cone(0.05, 0.12, 4), [0, 0.0, -1.06], [-PI / 2 - 0.4, 0, 0])]), abdM);
  const eyeM = ctx.eye('#ff2a1a', '#ffb040');
  mk(bob, merged('sp_eyes', () => {
    const e = [[0.045, 0.14, 0.47, 0.035], [-0.045, 0.14, 0.47, 0.035], [0.1, 0.13, 0.44, 0.022], [-0.1, 0.13, 0.44, 0.022], [0.03, 0.17, 0.43, 0.02], [-0.03, 0.17, 0.43, 0.02], [0.08, 0.16, 0.415, 0.016], [-0.08, 0.16, 0.415, 0.016]];
    return e.map(([x, y, z, r]) => xf(G.oct(r), [x, y, z]));
  }), eyeM);
  const fangs = [1, -1].map((s) => {
    const p = pv(bob, [s * 0.06, 0.0, 0.44]);
    mk(p, merged('sp_fang', () => [xf(G.cone(0.04, 0.2, 4), [0, -0.08, 0.02], [PI - 0.3, 0, 0]), xf(G.cone(0.015, 0.08, 3), [0, -0.19, 0.06], [PI + 0.6, 0, 0])]), fangM);
    p.userData.s = s;
    return p;
  });
  const palps = [1, -1].map((s) => bugLeg(bob, chitin, [s * 0.1, 0.0, 0.42], s, 1.2, [[0.18, 0.025, 0.02, 0.3], [0.2, 0.02, 0.012, -1.4]]));
  const legs = [];
  [[0.2, 0.95], [0.08, 0.35], [-0.04, -0.25], [-0.15, -0.85]].forEach(([z, th], i) => {
    for (const side of [1, -1]) {
      const L = bugLeg(bob, chitin, [side * 0.2, 0.02, z], side, th, [[0.7, 0.05, 0.04, 0.785], [0.8, 0.04, 0.022, -1.745], [0.45, 0.022, 0.006, -0.349]]);
      L.group = (i + (side > 0 ? 0 : 1)) % 2;
      L.pair = i;
      L.i = legs.length;
      legs.push(L);
    }
  });
  const silk = mk(abd, G.cyl(0.006, 0.006, 1, 3), silkM, [0, -0.3, -1.08], [0.9, 0, 0]);
  silk.visible = false;
  return {
    parts: { head: bob, mouth: fangs[0], abdomen: abd },
    height: 1.0, radius: 0.9,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.6, 5);
      const deadK = smooth(c.dead);
      const web = ctx.w('web', c.st === 'web', 4, dt);
      const ph = ctx.gait(c.speed, 1.1, dt);
      const amp = clamp(c.speed / 2, 0, 1) * c.alive;
      const atk = c.st === 'attack' ? a.t % 1.0 : -1;
      const rear = atk >= 0 ? keys(atk, [[0, 0], [0.35, 1], [0.45, 1], [0.55, -0.4], [0.8, 0]]) : 0;
      const up = Math.max(0, rear), strike = Math.max(0, -rear);
      bob.position.set(0, Math.abs(Math.sin(ph * 2)) * 0.03 * amp - c.stun * 0.25 + up * 0.15 + web * 0.08 + Math.sin(c.tm * 1.4) * 0.01, strike * 0.3 - c.hurt * 0.15);
      bob.rotation.set(-up * 0.55 + strike * 0.3 - c.hurt * 0.3 + web * 0.15, Math.sin(c.tm * 0.5) * 0.06 * (1 - amp), Math.sin(ph) * 0.04 * amp + c.stun * Math.sin(c.tm * 3) * 0.12);
      abd.rotation.set(-web * 0.5 + Math.sin(c.tm * (web > 0.5 ? 5 : 1.5)) * (0.03 + web * 0.08) + up * 0.3, Math.sin(ph) * 0.06 * amp, 0);
      const fo = atk >= 0 ? (atk < 0.45 ? 0.6 : 0.05) : 0.08 + Math.max(0, Math.sin(c.tm * 3)) * 0.06;
      for (const f of fangs) { f.rotation.z = f.userData.s * fo; f.rotation.x = -fo * 0.5; }
      for (const P of palps) { P.hip.rotation.y = P.yaw0 + Math.sin(c.tm * 4 + P.side) * 0.2 * P.side; }
      for (const L of legs) {
        const p = ph + L.group * PI;
        const swing = Math.sin(p) * 0.3 * amp, lift = Math.max(0, Math.cos(p)) * 0.35 * amp;
        let yaw = swing, j0 = L.base[0] + lift, j1 = L.base[1] - lift * 0.3, j2 = L.base[2];
        if (L.pair <= 1 && up > 0) { j0 += up * (L.pair === 0 ? 1.1 : 0.7); j1 += up * 0.6; yaw -= up * 0.2; }
        if (L.pair === 3 && web > 0.01) { yaw += web * Math.sin(c.tm * 6 + L.side * 1.5) * 0.4; j0 += web * (0.3 + Math.max(0, Math.sin(c.tm * 6 + L.side)) * 0.4); }
        const tw = c.stun * Math.sin(c.tm * 21 + L.i * 1.3) * 0.2;
        j0 = lerp(j0 + tw, -0.3, deadK); j1 = lerp(j1, -2.5, deadK); j2 = lerp(j2, -1.3, deadK);
        L.hip.rotation.y = L.yaw0 + (yaw + tw) * L.side;
        L.joints[0].rotation.z = j0 + deadK * Math.sin(c.tm * 7 + L.i) * 0.1 * Math.exp(-a.t * 0.5);
        L.joints[1].rotation.z = j1;
        L.joints[2].rotation.z = j2;
      }
      silk.visible = web > 0.3;
      silk.scale.y = 1.4 + Math.sin(c.tm * 3) * 0.3;
      body.rotation.z = PI * deadK;
      body.position.y = 0.6 + Math.sin(PI * deadK) * 0.35 + deadK * 0.02;
    },
  };
}

// ================================================================== 9. LEECH (ceiling leech)
function buildLeech(ctx) {
  const N = 11, SP = 0.1;
  const matA = lam('#d8c7b1'), matB = lam('#b89e8a'), dark = lam('#5a3a32');
  const chain = pv(ctx.body, [0, 0.06, 0.45], null, 'chain');
  const segs = [];
  let parent = chain;
  for (let i = 0; i < N; i++) {
    const s = pv(parent, i === 0 ? [0, 0, 0] : [0, 0, -SP]);
    const sc = i === 0 ? 1 : 1 - (i / N) * 0.55;
    if (i === 0) {
      mk(s, merged('le_head', () => [xf(G.sph(1, 6, 4), [0, 0, 0.02], [0, 0, 0], [0.065, 0.045, 0.075]), xf(G.segZ(0.16, 0.008, 0.003, 3), [0.03, 0.02, 0.06], [-0.4, 0.5, 0]), xf(G.segZ(0.16, 0.008, 0.003, 3), [-0.03, 0.02, 0.06], [-0.4, -0.5, 0])]), matA);
      mk(s, merged('le_mand', () => [xf(G.cone(0.018, 0.08, 3), [0.03, -0.015, 0.09], [PI / 2, 0, -0.5]), xf(G.cone(0.018, 0.08, 3), [-0.03, -0.015, 0.09], [PI / 2, 0, 0.5])]), dark);
      const eyeM = ctx.eye('#ffb4c8');
      mk(s, merged('le_eyes', () => [xf(G.box(0.015, 0.015, 0.01), [0.03, 0.03, 0.08]), xf(G.box(0.015, 0.015, 0.01), [-0.03, 0.03, 0.08])]), eyeM);
    } else {
      const key = 'le_seg' + i;
      mk(s, merged(key, () => {
        const a = [xf(G.sph(1, 6, 3), [0, 0, -SP * 0.5], [0, 0, 0], [0.07 * sc, 0.042 * sc, 0.068])];
        for (const sd of [1, -1]) a.push(xf(G.box(0.16 * sc + 0.04, 0.01, 0.012), [sd * (0.07 * sc + 0.05), -0.025, -SP * 0.5], [0, sd * 0.25, sd * -0.5]));
        if (i === N - 1) a.push(xf(G.segZ(0.1, 0.008, 0.002, 3), [0.02, 0, -0.1], [0, PI + 0.3, 0]), xf(G.segZ(0.1, 0.008, 0.002, 3), [-0.02, 0, -0.1], [0, PI - 0.3, 0]));
        return a;
      }), i % 2 ? matB : matA);
    }
    segs.push(s);
    parent = s;
  }
  const R = SP / (2 * Math.sin(PI / N));
  return {
    parts: { head: segs[0], segments: segs },
    height: 0.15, radius: 0.35,
    update(dt, a) {
      const c = common(ctx, a, dt, 0.9, 2.2);
      const st = c.st;
      const deadK = smooth(c.dead);
      const ring = ctx.w('ring', st === 'latched', 6, dt);
      const ceil = ctx.w('ceil', st === 'ceiling', 4, dt);
      const fall = ctx.w('fall', st === 'fall', 8, dt);
      const ph = ctx.gait(c.speed, 0.45, dt);
      const amp = clamp(c.speed / 1, 0, 1) * c.alive * (1 - ring);
      const atk = st === 'attack' ? keys(a.t % 0.8, [[0, 0], [0.3, 1], [0.45, -0.4], [0.7, 0]]) : 0;
      const tm = c.tm;
      segs.forEach((s, i) => {
        const wave = Math.sin(ph * 1.0 - i * 0.7) * 0.28 * amp + Math.sin(tm * 1.2 - i * 0.5) * 0.06 * (1 - amp);
        let ry = wave, rx = 0;
        ry = lerp(ry, i === 0 ? 0 : 0.32 + Math.sin(tm * 1.5 + i) * 0.04, ceil);
        rx = lerp(rx, i < 3 ? -0.3 + Math.sin(tm * 2 + i) * 0.15 : 0, ceil);
        rx = lerp(rx, 0.4 + Math.sin(tm * 17 + i * 1.3) * 0.3, fall);
        ry = lerp(ry, Math.sin(tm * 13 + i) * 0.3, fall);
        if (i < 4 && atk !== 0) rx += (i === 0 ? -0.2 : -0.35) * Math.max(0, atk) + 0.3 * Math.min(0, atk) * -1;
        rx += c.stun * Math.sin(tm * 19 + i) * 0.2;
        ry = lerp(ry, i === 0 ? 0 : (TAU / N) * (1 + Math.sin(tm * 6) * 0.02), ring);
        rx = lerp(rx, i === 0 ? 0 : Math.sin(tm * 6 - i) * 0.05, ring);
        ry = lerp(ry, Math.sin(i * 1.7) * 0.08, deadK);
        rx = lerp(rx, 0, deadK);
        s.rotation.set(rx, ry, Math.sin(tm * 12 + i * 0.9) * (0.08 + amp * 0.1) * (1 - deadK));
      });
      chain.position.set(lerp(0, R, ring), lerp(0.06, 0.0, ring) + deadK * 0.04, lerp(0.45, 0, ring));
      chain.rotation.set(0, 0, PI * deadK);
      chain.scale.setScalar(1 + ring * Math.sin(tm * 6) * 0.04);
    },
  };
}

// ================================================================== 10. SCREAMER
function buildScreamer(ctx) {
  const skinTex = tex('screamSkin', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#cfc6b6', 0.1, 2);
    c.fillStyle = 'rgba(80,60,60,0.35)'; for (let y = 4; y < h; y += 5) c.fillRect(0, y, w, 1);
  });
  const skin = ctx.own(lamI('#cfc6b6', { map: skinTex, transparent: true }));
  const dark = ctx.own(lamI('#1a0707', { transparent: true }));
  const bone = ctx.own(lamI('#e9e2cc', { transparent: true }));
  const eyeM = ctx.eye('#ffffff', '#ff2a1a', { transparent: true });
  const hips = pv(ctx.body, [0, 1.02, 0], null, 'hips');
  mk(hips, merged('scr_pelvis', () => [xf(G.sph(1, 6, 4), [0, 0, 0], [0, 0, 0], [0.13, 0.08, 0.09])]), skin);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.09, -0.02, 0]);
    mk(hip, G.segY(0.52, 0.05, 0.03, 5), skin);
    const knee = pv(hip, [0, -0.52, 0]);
    mk(knee, merged('scr_shin', () => [xf(G.segY(0.48, 0.035, 0.022, 5)), xf(G.sph(0.04, 4, 3)), xf(G.boxZ(0.06, 0.025, 0.2), [0, -0.49, -0.04])]), skin);
    return { hip, knee, s };
  });
  const spine = pv(hips, [0, 0.05, 0], null, 'spine');
  mk(spine, merged('scr_torso', () => [xf(G.cyl(0.13, 0.07, 0.58, 6), [0, 0.29, 0], [0, 0, 0], [1, 1, 0.55]), xf(G.sph(1, 6, 3), [0, 0.56, 0], [0, 0, 0], [0.2, 0.05, 0.07])]), skin);
  const neck = pv(spine, [0, 0.58, 0.02], null, 'neck');
  mk(neck, G.segY(0.2, 0.03, 0.035, 4), skin, null, [PI, 0, 0]);
  const head = pv(neck, [0, 0.2, 0.02], null, 'head');
  mk(head, merged('scr_skull', () => [xf(G.sph(1, 7, 5), [0, 0.08, 0], [0.2, 0, 0], [0.095, 0.14, 0.11])]), skin);
  mk(head, merged('scr_sockets', () => [xf(G.sph(0.028, 4, 3), [0.04, 0.09, 0.085]), xf(G.sph(0.028, 4, 3), [-0.04, 0.09, 0.085]), xf(G.box(0.1, 0.2, 0.04), [0, -0.08, 0.02])]), dark);
  mk(head, merged('scr_pupils', () => [xf(G.box(0.01, 0.01, 0.01), [0.04, 0.09, 0.11]), xf(G.box(0.01, 0.01, 0.01), [-0.04, 0.09, 0.11])]), eyeM);
  mk(head, merged('scr_uteeth', () => { const a = []; for (let i = 0; i < 6; i++) a.push(xf(G.cone(0.008, 0.035, 3), [(i - 2.5) * 0.016, -0.015, 0.08], [PI, 0, 0])); return a; }), bone);
  const jaw = pv(head, [0, 0.0, 0.0], null, 'jaw');
  mk(jaw, merged('scr_jaw', () => [xf(G.sph(1, 6, 3, 0, TAU, PI / 2, PI / 2), [0, 0, 0.02], [0, 0, 0], [0.075, 0.2, 0.085])]), skin);
  mk(jaw, merged('scr_lteeth', () => { const a = []; for (let i = 0; i < 6; i++) a.push(xf(G.cone(0.008, 0.035, 3), [(i - 2.5) * 0.015, -0.03, 0.075])); return a; }), bone);
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * 0.17, 0.55, 0]);
    mk(sh, merged('scr_uarm', () => [xf(G.segY(0.55, 0.035, 0.025, 5)), xf(G.sph(0.045, 4, 3))]), skin);
    const el = pv(sh, [0, -0.55, 0]);
    mk(el, merged('scr_farm', () => [xf(G.segY(0.52, 0.025, 0.018, 5)), xf(G.box(0.05, 0.08, 0.02), [0, -0.56, 0]),
      xf(G.cone(0.01, 0.22, 3), [0.02, -0.7, 0.01], [PI, 0, 0.12]), xf(G.cone(0.01, 0.24, 3), [0, -0.72, 0.015], [PI, 0, 0]), xf(G.cone(0.01, 0.22, 3), [-0.02, -0.7, 0.01], [PI, 0, -0.12])]), skin);
    return { sh, el, s };
  });
  let twitchT = 0, twitchY = 0, twitchZ = 0;
  return {
    parts: { head, mouth: jaw, materials: [skin, dark, bone, eyeM] },
    height: 1.9, radius: 0.35,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.1, 4.5);
      const deadK = smooth(c.dead);
      const scream = ctx.w('scream', c.st === 'scream', 9, dt);
      const run = ctx.w('run', c.st === 'run', 5, dt);
      const ph = ctx.gait(c.speed, lerp(1.7, 2.4, run), dt);
      const amp = clamp(c.speed / 1.5, 0, 1) * c.alive;
      const s = Math.sin(ph), co = Math.cos(ph);
      const shake = scream * Math.sin(c.tm * 57) * 0.015;
      const atk = c.st === 'attack' ? keys(a.t % 0.9, [[0, 0], [0.3, 1], [0.45, -0.6], [0.75, 0]]) : 0;
      twitchT -= dt;
      if (twitchT <= 0) { twitchT = 0.4 + ctx.rnd() * 2.2; twitchY = (ctx.rnd() - 0.5) * 0.9; twitchZ = (ctx.rnd() - 0.5) * 0.8; }
      for (const L of legs) {
        const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
        L.hip.rotation.set(-p * lerp(0.45, 0.7, run) * amp - 0.1 - deadK * 1.4, 0, L.s * 0.04);
        L.knee.rotation.x = Math.max(0, pc) * lerp(1.3, 1.1, run) * amp + 0.15 + deadK * 2.3 + c.stun * 0.3;
      }
      hips.position.set(shake, 1.0 - (1 - Math.cos(0.45 * amp)) * 0.5 + Math.abs(s) * 0.05 * amp - c.stun * 0.1 - deadK * 0.55, 0);
      spine.rotation.set(0.25 + run * 0.35 - scream * 0.35 + atk * 0.3 - c.hurt * 0.4 + deadK * 1.1 + Math.sin(c.tm * 1.1) * 0.03, s * 0.12 * amp, c.stun * Math.sin(c.tm * 2) * 0.15);
      const snap = (1 - scream) * c.alive;
      neck.rotation.set(-0.2 - run * 0.2 - scream * 0.25 + deadK * 0.4, twitchY * snap * 0.6, twitchZ * snap * 0.5 + shake * 4);
      head.rotation.set(-scream * 0.35, 0, 0);
      const open = Math.max(scream * 1.25, Math.max(0, atk) * 0.6, Math.sin(c.tm * 0.7) > 0.8 ? 0.25 : 0.05, deadK * 0.5);
      jaw.rotation.x = open;
      jaw.position.y = -scream * 0.07;
      jaw.scale.y = 1 + scream * 0.7;
      for (const A of arms) {
        let sx = 0.05 + (A.s > 0 ? s : -s) * 0.25 * amp + Math.sin(c.tm * 0.8 + A.s) * 0.05, sz = A.s * 0.1, ex = -0.25;
        sx = lerp(sx, 0.9, run * 0.8); ex = lerp(ex, -0.5, run);
        sx = lerp(sx, -0.4 + shake * 5, scream); sz = lerp(sz, A.s * 1.35, scream); ex = lerp(ex, -0.15, scream);
        if (atk !== 0) { sx = lerp(sx, atk > 0 ? -2.6 : -0.6, Math.abs(atk)); ex = lerp(ex, -0.3, Math.abs(atk)); }
        sx = lerp(sx, 0.25, deadK); sz = lerp(sz, A.s * 0.6, deadK);
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
      }
      head.rotation.x += deadK * 0.5;
    },
  };
}

// ================================================================== 11. MIMIC
function buildMimic(ctx, opts) {
  const av = createAvatar({ suitColor: opts.suitColor || '#d9642b', hat: opts.hat || 'none', faceStyle: 'mimic', eyeColor: '#f2f2f2' });
  ctx.body.add(av.root);
  let twT = 0, twZ = 0, twY = 0, talkT = 0, talk = 0;
  return {
    parts: { head: av.parts.head, handR: av.parts.handR, handL: av.parts.handL, avatar: av },
    height: 1.8, radius: 0.35,
    onElite(b) { av.setEyeColor(b ? '#ff2a1a' : '#f2f2f2'); },
    dispose() { av.dispose(); },
    update(dt, a) {
      const st = a.state;
      const run = st === 'run', walk = st === 'walk';
      const speed = a.speed ?? (run ? 4.5 : walk ? 1.4 : 0);
      // twitchy head: sudden jerks that snap back
      twT -= dt;
      const nerv = st === 'run' || st === 'attack' || st === 'stunned' || st === 'hurt' ? 2.5 : 1;
      if (twT <= 0) { twT = (0.25 + ctx.rnd() * 1.6) / nerv; twZ = (ctx.rnd() - 0.5) * 0.9; twY = (ctx.rnd() - 0.5) * 0.8; }
      twZ = damp(twZ, 0, 5, dt); twY = damp(twY, 0, 4, dt);
      // it "talks" in bursts
      talkT -= dt;
      if (talkT <= 0) { talkT = 0.08 + ctx.rnd() * 0.15; talk = ctx.rnd() < 0.3 && st !== 'dead' ? ctx.rnd() : 0; }
      av.setMouth(st === 'attack' ? 0.9 : talk);
      const atk = st === 'attack';
      av.update(dt, {
        speed: st === 'dead' || st === 'stunned' ? 0 : speed,
        sprint: run,
        carry2h: run || atk, // arms held forward, zombie-like
        crouch: st === 'stunned',
        dead: st === 'dead',
        swing: atk ? (a.t % 0.7) / 0.7 : 0,
        lookPitch: atk ? -0.3 : Math.sin(a.time * 0.7 + ctx.ph) * 0.15,
        grounded: true,
        time: a.time + ctx.ph,
        twitch: twZ + (st === 'stunned' ? Math.sin(a.time * 9) * 0.3 : 0),
        twitchY: twY,
      });
    },
  };
}

// ================================================================== 12. HOUND (blind hound)
function buildHound(ctx) {
  const flesh = lam('#8e2e24', { map: tex('houndFlesh', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#8e3026', 0.2, 2);
    c.fillStyle = 'rgba(40,5,5,0.45)'; for (let x = 0; x < w; x += 3) c.fillRect(x + ((r() * 2) | 0), 0, 1, h);
    c.fillStyle = 'rgba(230,190,170,0.35)'; for (let i = 0; i < 5; i++) c.fillRect(0, (r() * h) | 0, w, 1);
  }) });
  const inner = lam('#3a0606'), bone = lam('#e6dcc0');
  const torso = pv(ctx.body, [0, 0.95, 0], null, 'torso');
  mk(torso, merged('ho_body', () => [
    xf(G.sph(1, 9, 6), [0, 0, 0.35], [0.1, 0, 0], [0.3, 0.34, 0.45]),
    xf(G.sph(1, 8, 5), [0, 0.02, -0.25], [0, 0, 0], [0.21, 0.22, 0.42]),
    xf(G.sph(1, 8, 5), [0, 0.02, -0.62], [0, 0, 0], [0.26, 0.27, 0.3]),
  ]), flesh);
  mk(torso, merged('ho_spikes', () => { const a = []; for (let i = 0; i < 7; i++) a.push(xf(G.cone(0.035, 0.12 + (i % 2) * 0.05, 3), [0, 0.3 - Math.abs(i - 2) * 0.03, 0.45 - i * 0.17], [-0.4, 0, 0])); return a; }), bone);
  const neck = pv(torso, [0, 0.12, 0.72], [0.35, 0, 0], 'neck');
  mk(neck, G.segZ(0.34, 0.15, 0.1, 6), flesh);
  const head = pv(neck, [0, 0, 0.32], null, 'head');
  const upper = pv(head, [0, 0.02, 0]);
  mk(upper, merged('ho_upper', () => [xf(G.sph(1, 7, 4, 0, TAU, 0, PI / 2), [0, 0, 0.15], [0, 0, 0], [0.16, 0.12, 0.32])]), flesh);
  mk(upper, merged('ho_uteeth', () => { const a = []; for (let i = 0; i < 9; i++) { const t = PI * (0.1 + (0.8 * i) / 8); a.push(xf(G.cone(0.018, 0.08, 3), [Math.cos(t) * 0.14, -0.03, 0.15 + Math.sin(t) * 0.28], [PI, 0, 0])); } return a; }), bone);
  mk(upper, merged('ho_palate', () => [xf(G.box(0.2, 0.01, 0.4), [0, -0.005, 0.12])]), inner);
  const lower = pv(head, [0, -0.02, 0], null, 'jaw');
  mk(lower, merged('ho_lower', () => [xf(G.sph(1, 7, 3, 0, TAU, PI / 2, PI / 2), [0, 0, 0.14], [0, 0, 0], [0.13, 0.08, 0.3])]), flesh);
  mk(lower, merged('ho_lteeth', () => { const a = []; for (let i = 0; i < 8; i++) { const t = PI * (0.12 + (0.76 * i) / 7); a.push(xf(G.cone(0.016, 0.07, 3), [Math.cos(t) * 0.11, 0.02, 0.14 + Math.sin(t) * 0.26])); } return a; }), bone);
  mk(lower, merged('ho_tongue', () => [xf(G.box(0.14, 0.01, 0.34), [0, 0.0, 0.12])]), inner);
  const throat = ctx.eye('#7a0d08', '#ff3010');
  mk(head, G.circle(0.07, 6), throat, [0, 0, 0.02]);
  const legs = [];
  for (const [z, fore] of [[0.45, true], [-0.62, false]]) for (const s of [1, -1]) {
    const hip = pv(torso, [s * 0.18, -0.08, z]);
    let knee, ank = null;
    if (fore) {
      mk(hip, G.segY(0.42, 0.09, 0.06, 5), flesh);
      knee = pv(hip, [0, -0.42, 0]);
      mk(knee, merged('ho_fore', () => [xf(G.segY(0.4, 0.055, 0.04, 5)), xf(G.box(0.1, 0.06, 0.14), [0, -0.42, 0.04])]), flesh);
    } else {
      mk(hip, merged('ho_thigh', () => [xf(G.segY(0.4, 0.12, 0.07, 5)), xf(G.sph(1, 5, 4), [0, -0.12, 0], [0, 0, 0], [0.13, 0.18, 0.15])]), flesh);
      knee = pv(hip, [0, -0.4, 0]);
      mk(knee, G.segY(0.4, 0.06, 0.04, 5), flesh);
      ank = pv(knee, [0, -0.4, 0]);
      mk(ank, merged('ho_meta', () => [xf(G.segY(0.24, 0.04, 0.03, 4)), xf(G.box(0.1, 0.06, 0.14), [0, -0.25, 0.04])]), flesh);
    }
    legs.push({ hip, knee, ank, fore, s });
  }
  const tail = pv(torso, [0, 0.1, -0.88], [0.6, 0, 0]);
  mk(tail, G.segZ(0.35, 0.05, 0.01, 4), flesh, null, [0, PI, 0]);
  return {
    parts: { head, mouth: lower },
    height: 1.2, radius: 0.55,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.4, 8);
      const st = c.st, deadK = smooth(c.dead);
      const gallop = ctx.w('gallop', st === 'run' || st === 'lunge', 6, dt);
      const sniff = ctx.w('sniff', st === 'sniff', 5, dt);
      const howl = ctx.w('howl', st === 'howl', 4, dt);
      const ph = ctx.gait(c.speed, lerp(1.3, 3.2, gallop), dt);
      const amp = clamp(c.speed / 2, 0, 1) * c.alive * (1 - howl);
      const lt = st === 'lunge' ? clamp(a.t / 0.8, 0, 1) : -1;
      const crouchL = lt >= 0 ? keys(lt, [[0, 0], [0.2, 1], [0.35, 0], [1, 0]]) : 0;
      const leap = lt >= 0 ? keys(lt, [[0, 0], [0.25, 0], [0.4, 1], [0.8, 1], [1, 0]]) : 0;
      const atk = st === 'attack' ? a.t % 0.6 : -1;
      const breathe = Math.sin(c.tm * (2.5 + gallop * 3));
      torso.scale.set(1 + breathe * 0.025, 1 + breathe * 0.02, 1);
      const flex = Math.sin(ph) * 0.12 * gallop * amp;
      torso.position.set(0, 0.95 + Math.abs(Math.sin(ph)) * lerp(0.03, 0.12, gallop) * amp - crouchL * 0.25 + leap * Math.sin(lt * PI) * 0.5 - howl * 0.3 - c.stun * 0.15 + deadK * -0.65, leap * 0.3 - c.hurt * 0.15);
      torso.rotation.set(flex - howl * 0.5 + leap * -0.12 + crouchL * 0.1 - c.hurt * 0.3, 0, c.stun * Math.sin(c.tm * 2.2) * 0.1);
      // head / neck
      const sniffBob = sniff * Math.sin(c.tm * 15) * 0.05;
      neck.rotation.set(0.35 + sniff * 0.55 + sniffBob - howl * 1.35 + gallop * 0.15 + (atk >= 0 ? 0.2 : 0) + deadK * 0.3, sniff * Math.sin(c.tm * 1.7) * 0.5 + Math.sin(c.tm * 0.6) * 0.15 * (1 - amp), howl * Math.sin(c.tm * 23) * 0.03);
      head.rotation.set(-0.2 * howl + (atk >= 0 ? -0.2 : 0), 0, 0);
      let open = 0.08 + Math.max(0, Math.sin(c.tm * 1.3)) * 0.1 + gallop * 0.25 * amp;
      open = lerp(open, 0.02, sniff);
      open = lerp(open, 0.55 + Math.sin(c.tm * 3) * 0.1, howl);
      if (lt >= 0) open = lerp(open, 0.9, leap);
      if (atk >= 0) open = atk < 0.2 ? 0.9 : atk < 0.3 ? 0.02 : 0.3;
      open = lerp(open, 0.5, deadK);
      upper.rotation.x = -open * 0.6;
      lower.rotation.x = open;
      tail.rotation.set(0.6 - gallop * 0.5 - howl * 0.3, Math.sin(c.tm * (3 + gallop * 6)) * 0.3, 0);
      for (const L of legs) {
        let p;
        if (gallop > 0.5) p = ph + (L.fore ? 0 : PI) + (L.s > 0 ? 0 : 0.35);
        else p = ph + ((L.fore ? 0 : 1) + (L.s > 0 ? 0 : 1)) % 2 * PI; // trot: diagonal pairs
        const sw = Math.sin(p) * lerp(0.45, 0.8, gallop) * amp, lift = Math.max(0, Math.cos(p)) * amp;
        let hx, kx, ax = 0;
        if (L.fore) {
          hx = -sw - flex; kx = lift * 0.9;
          hx = lerp(hx, -1.3, leap); kx = lerp(kx, 0.2, leap);
          hx = lerp(hx, 0.15, howl); kx = lerp(kx, 0, howl);
          hx += crouchL * 0.4; kx += crouchL * 0.6;
        } else {
          hx = -0.6 - sw - flex; kx = 1.4 + lift * 0.6; ax = -0.8 - lift * 0.3;
          hx = lerp(hx, 0.6, leap); kx = lerp(kx, 0.2, leap); ax = lerp(ax, 0.2, leap);
          hx = lerp(hx, -1.35, howl); kx = lerp(kx, 2.5, howl); ax = lerp(ax, -1.2, howl);
          hx -= crouchL * 0.5; kx += crouchL * 0.7;
        }
        hx = lerp(hx, L.fore ? -0.6 : 0.5, deadK); kx = lerp(kx, 0.2, deadK); ax = lerp(ax, 0, deadK);
        L.hip.rotation.set(hx + c.stun * 0.1, 0, L.s * c.stun * 0.15);
        L.knee.rotation.x = kx;
        if (L.ank) L.ank.rotation.x = ax;
      }
      ctx.body.rotation.z = PI * 0.5 * deadK * deadK;
      ctx.body.position.y = 0.32 * deadK;
    },
  };
}

// ================================================================== 13. GIANT (forest keeper)
function giantFaceTex() {
  return tex('giantFace', 64, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#d8d0c3', 0.05, 2);
    c.fillStyle = '#0a0808';
    c.beginPath(); c.ellipse(11, 13, 2.2, 2.8, 0, 0, TAU); c.ellipse(21, 13, 2.2, 2.8, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(90,70,60,0.5)'; c.fillRect(15, 17, 1, 1); c.fillRect(17, 17, 1, 1);
    c.strokeStyle = 'rgba(80,50,50,0.8)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(12, 21); c.quadraticCurveTo(16, 23, 20, 21); c.stroke();
    c.fillStyle = 'rgba(120,100,90,0.25)'; c.fillRect(9, 9, 5, 1); c.fillRect(19, 9, 5, 1);
  }, false);
}
function buildGiant(ctx) {
  const skin = lam('#d6cfc2', { flat: false, map: tex('giantSkin', 32, 32, (c, w, h, r) => noiseFill(c, w, h, r, '#ddd6ca', 0.06, 2)) });
  const hips = pv(ctx.body, [0, 3.3, 0], null, 'hips');
  mk(hips, merged('gi_pelvis', () => [xf(G.sph(1, 8, 5), [0, 0.1, 0], [0, 0, 0], [0.75, 0.45, 0.55])]), skin);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.42, 0, 0]);
    mk(hip, G.segY(1.7, 0.42, 0.32, 7), skin);
    const knee = pv(hip, [0, -1.7, 0]);
    mk(knee, merged('gi_shin', () => [xf(G.segY(1.52, 0.31, 0.22, 7)), xf(G.box(0.4, 0.2, 0.62), [0, -1.5, 0.12])]), skin);
    return { hip, knee, s };
  });
  const spine = pv(hips, [0, 0.2, 0], null, 'spine');
  mk(spine, merged('gi_torso', () => [xf(G.lathe('gi_torso', [[0.01, 0], [0.72, 0], [0.98, 0.6], [0.92, 1.3], [0.84, 1.9], [1.0, 2.35], [0.72, 2.7], [0.3, 2.82], [0.01, 2.85]], 10), [0, 0, 0], [0, 0, 0], [1, 1, 0.72])]), skin);
  const neck = pv(spine, [0, 2.75, 0.05], null, 'neck');
  mk(neck, G.segY(0.35, 0.3, 0.34, 7), skin, null, [PI, 0, 0]);
  const head = pv(neck, [0, 0.3, 0.05], null, 'head');
  mk(head, G.sph(0.72, 12, 9), lam('#ffffff', { flat: false, map: giantFaceTex() }), [0, 0.8, 0], [0, 0, 0], [1, 1.15, 0.95]);
  const eyeM = ctx.eye('#050404', '#ff2020');
  mk(head, merged('gi_eyes', () => [xf(G.sph(0.12, 6, 4), [0.2, 0.98, 0.6], [0, 0, 0], [0.8, 1, 0.3]), xf(G.sph(0.12, 6, 4), [-0.2, 0.98, 0.6], [0, 0, 0], [0.8, 1, 0.3])]), eyeM);
  const mouth = mk(head, G.sph(0.14, 6, 4), bas('#1a0c0c'), [0, 0.52, 0.64], null, [1.2, 0.05, 0.3]);
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * 0.95, 2.45, 0]);
    mk(sh, merged('gi_uarm', () => [xf(G.segY(2.0, 0.27, 0.2, 7)), xf(G.sph(0.32, 6, 5))]), skin);
    const el = pv(sh, [0, -2.0, 0]);
    mk(el, G.segY(1.85, 0.21, 0.15, 7), skin);
    const wr = pv(el, [0, -1.85, 0]);
    mk(wr, merged('gi_palm', () => [xf(G.box(0.42, 0.5, 0.2), [0, -0.25, 0])]), skin);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = pv(wr, [(i - 1.5) * 0.1, -0.48, 0.02]);
      mk(f, G.segY(0.5, 0.055, 0.04, 4), skin);
      fingers.push(f);
    }
    const thumb = pv(wr, [-s * 0.2, -0.2, 0.08], [0.4, 0, -s * 0.5]);
    mk(thumb, G.segY(0.35, 0.06, 0.045, 4), skin);
    const grip = new THREE.Object3D();
    grip.position.set(0, -0.6, 0.25);
    wr.add(grip);
    return { sh, el, wr, fingers, thumb, grip, s };
  });
  return {
    parts: { head, mouth, hand: arms[1].grip, handL: arms[0].grip },
    height: 8, radius: 1.3,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.4, 3.5);
      const st = c.st, deadK = smooth(c.dead);
      const run = ctx.w('run', st === 'run', 4, dt);
      const grab = ctx.w('grab', st === 'grab' || st === 'attack', 4, dt);
      const eat = ctx.w('eat', st === 'eat', 4, dt);
      const ph = ctx.gait(c.speed, lerp(2.8, 4.4, run), dt);
      const amp = clamp(c.speed / 1.5, 0, 1) * c.alive * (1 - grab) * (1 - eat);
      const s = Math.sin(ph), co = Math.cos(ph);
      const gp = st === 'grab' || st === 'attack' ? clamp(a.progress || a.t / 1.4, 0, 1) : 0;
      const close = ramp(gp, 0.55, 0.8);
      for (const L of legs) {
        const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
        L.hip.rotation.set(-p * lerp(0.35, 0.55, run) * amp - grab * 0.5 + deadK * 0.1, 0, L.s * 0.05);
        L.knee.rotation.x = Math.max(0, pc) * 0.7 * amp + grab * 1.0 + 0.05;
      }
      hips.position.set(Math.sin(ph) * 0.12 * amp, 3.3 - (1 - Math.cos(0.35 * amp)) * 3.3 - grab * 0.3 + Math.abs(s) * 0.12 * amp, 0);
      spine.rotation.set(0.08 + run * 0.15 + grab * 0.85 - eat * 0.1 - c.hurt * 0.2 + Math.sin(c.tm * 0.6) * 0.02, s * 0.08 * amp, Math.sin(ph) * 0.06 * amp + c.stun * Math.sin(c.tm * 1.1) * 0.08);
      neck.rotation.set(-grab * 0.5 - eat * 0.3 + Math.sin(c.tm * 0.4) * 0.05, Math.sin(c.tm * 0.23) * 0.45 * (1 - amp) * (1 - grab), Math.sin(c.tm * 0.31) * 0.12 * (1 - grab));
      const chew = eat * Math.max(0, Math.sin(c.tm * 5));
      mouth.scale.set(1.2, 0.05 + chew * 0.9 + grab * close * 0.3, 0.3);
      for (const A of arms) {
        const right = A.s < 0;
        let sx = (A.s > 0 ? s : -s) * 0.35 * amp + Math.sin(c.tm * 0.5 + A.s) * 0.04, sz = A.s * 0.12, ex = -0.2 - run * 0.4;
        if (right) {
          sx = lerp(sx, lerp(-1.1, -0.7, close), grab); sz = lerp(sz, 0.15, grab); ex = lerp(ex, lerp(-0.25, -0.9, close), grab);
          sx = lerp(sx, -2.1, eat); sz = lerp(sz, 0.55, eat); ex = lerp(ex, -2.1, eat);
        } else { sx = lerp(sx, -0.3, grab); sz = lerp(sz, A.s * 0.3, grab); }
        sx = lerp(sx, -2.6, deadK); sz = lerp(sz, A.s * 0.5, deadK);
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
        A.wr.rotation.x = right ? grab * 0.3 + eat * -0.4 : 0;
        const curl = right ? lerp(0.25, 1.5, Math.max(close * grab, eat * 0.9)) - grab * (1 - close) * 0.3 : 0.3;
        for (const f of A.fingers) f.rotation.x = -curl;
        A.thumb.rotation.z = -A.s * (0.5 - curl * 0.2);
      }
      ctx.body.rotation.x = -PI * 0.48 * deadK * deadK;
      ctx.body.position.set(0, 0.6 * deadK, 0);
    },
  };
}

// ================================================================== 14. SAND KEFAL (desert leviathan)
const SK = { H: 14, Z: 12, N: 14, SP: 1.4, HEAD: 1.9 };
// arc-length table for the parabola y = H (1 - (z/Z)^2), sampled well below ground on both sides
const skArc = (() => {
  const n = 800, z0 = -34, z1 = 34, zs = new Float32Array(n + 1), ss = new Float32Array(n + 1);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    if (i > 0) { const zp = zs[i - 1], dy = SK.H * ((1 - (z / SK.Z) ** 2) - (1 - (zp / SK.Z) ** 2)); s += Math.hypot(z - zp, dy); }
    zs[i] = z; ss[i] = s;
  }
  const sAtZ = (z) => { const i = clamp(Math.round(((z - z0) / (z1 - z0)) * n), 0, n); return ss[i]; };
  const zAtS = (sv) => {
    if (sv <= 0) return z0 + sv; if (sv >= ss[n]) return z1 + (sv - ss[n]);
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] < sv) lo = m; else hi = m; }
    return lerp(zs[lo], zs[hi], (sv - ss[lo]) / (ss[hi] - ss[lo] || 1));
  };
  return { sAtZ, zAtS, sIn: sAtZ(-SK.Z), sOut: sAtZ(SK.Z) };
})();
function buildSandkefal(ctx) {
  const scales = lam('#b99a6a', { map: scaleTex('sandkefal', '#bb9c6c', '#7a6040', '#e0c898') });
  const finM = lam('#8d6a44', { side: THREE.DoubleSide });
  const inner = bas('#120606'), bone = lam('#efe6cc');
  const dirt = lam('#6d5638', { map: tex('dirt', 32, 32, (c, w, h, r) => noiseFill(c, w, h, r, '#6d5638', 0.3, 2)) });
  const worm = pv(ctx.body, null, null, 'worm');
  // head (mouth leads along +Z of the head group)
  const head = pv(worm, null, null, 'head');
  mk(head, merged('sk_skull', () => [
    xf(G.sph(1, 10, 7), [0, 0, -0.5], [0, 0, 0], [1.15, 1.05, 1.5]),
    xf(G.tor(0.68, 0.17, 4, 12), [0, 0, 0.85]),
  ]), scales);
  mk(head, merged('sk_fins', () => [
    xf(G.cone(0.5, 1.2, 3), [1.05, -0.3, -0.7], [PI / 2 + 0.9, 0, -0.5], [1, 1, 0.15]), xf(G.cone(0.5, 1.2, 3), [-1.05, -0.3, -0.7], [PI / 2 + 0.9, 0, 0.5], [1, 1, 0.15]),
    xf(G.cone(0.45, 1.3, 3), [0, 1.0, -1.1], [-2.3, 0, 0], [0.15, 1, 1]),
    xf(G.box(0.05, 0.6, 0.08), [1.1, 0, -0.2], [0, 0, 0.1]), xf(G.box(0.05, 0.6, 0.08), [1.08, 0, -0.45], [0, 0, 0.1]),
    xf(G.box(0.05, 0.6, 0.08), [-1.1, 0, -0.2], [0, 0, -0.1]), xf(G.box(0.05, 0.6, 0.08), [-1.08, 0, -0.45], [0, 0, -0.1]),
  ]), finM);
  mk(head, G.circle(0.62, 10), inner, [0, 0, 0.55]);
  mk(head, merged('sk_teeth', () => {
    const a = [];
    [[0.66, 12, 0.85, 0.34], [0.5, 10, 0.72, 0.28], [0.36, 8, 0.62, 0.22]].forEach(([r, n, z, len], ring) => {
      for (let i = 0; i < n; i++) { const t = (i / n) * TAU + ring * 0.3; a.push(xf(G.cone(0.06, len, 3), [Math.cos(t) * r, Math.sin(t) * r, z], dirRot(-Math.cos(t), -Math.sin(t), -0.7))); }
    });
    return a;
  }), bone);
  const eyeM = ctx.eye('#ffd23a', '#ff2a14');
  mk(head, merged('sk_eyes', () => [xf(G.sph(0.14, 5, 4), [0.82, 0.45, 0.1]), xf(G.sph(0.14, 5, 4), [-0.82, 0.45, 0.1])]), eyeM);
  const segs = [];
  for (let i = 0; i < SK.N; i++) {
    const r = lerp(1.05, 0.42, i / (SK.N - 1));
    const seg = pv(worm);
    mk(seg, merged('sk_seg' + i, () => {
      const a = [xf(G.sph(1, 8, 6), [0, 0, 0], [PI / 2, 0, 0], [r, Math.max(r, 0.8), r * 0.95])];
      if (i % 2 === 0) a.push(xf(G.cone(r * 0.5, r * 0.9, 3), [0, r * 0.95, -0.1], [-2.2, 0, 0], [0.12, 1, 1]));
      return a;
    }), scales);
    if (i === SK.N - 1) mk(seg, merged('sk_tail', () => [xf(G.cone(0.9, 1.6, 3), [0, 0.5, -1.0], [-2.4, 0, 0], [0.1, 1, 1]), xf(G.cone(0.9, 1.6, 3), [0, -0.5, -1.0], [-0.74, 0, 0], [0.1, 1, 1])]), finM);
    segs.push({ seg, r, off: SK.HEAD + i * SK.SP });
  }
  // dirt mound (hidden / rumble) + entry & exit craters (emerge)
  const mound = pv(ctx.body, null, null, 'mound');
  mk(mound, merged('sk_mound', () => [xf(G.cone(3.2, 0.7, 10), [0, 0.35, 0]), xf(G.cone(1.6, 0.5, 7), [0.4, 0.6, -0.3])]), dirt);
  const chunks = [];
  for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; const m = mk(mound, G.ico(0.18 + (i % 3) * 0.06, 0), dirt, [Math.cos(t) * 1.8, 0.3, Math.sin(t) * 1.8]); chunks.push(m); }
  const craters = [-SK.Z, SK.Z].map((z) => mk(ctx.body, merged('sk_crater', () => [xf(G.cyl(1.8, 3.2, 0.8, 12, true), [0, 0.4, 0]), xf(G.ico(0.4, 0), [2.2, 0.3, 0.5]), xf(G.ico(0.35, 0), [-2.1, 0.25, -0.6])]), dirt, [0, 0, z]));
  const tmpV = new THREE.Vector3();
  const place = (obj, s, time, wig) => {
    const z = skArc.zAtS(s);
    const y = SK.H * (1 - (z / SK.Z) ** 2);
    const dy = (-2 * SK.H * z) / (SK.Z * SK.Z);
    obj.position.set(Math.sin(s * 0.35 + time * 2.2) * wig, y, z);
    obj.rotation.set(-Math.atan2(dy, 1), 0, Math.sin(s * 0.35 + time * 2.2) * 0.1);
    obj.visible = y > -3;
    return tmpV.set(0, y, z);
  };
  return {
    parts: { head, mouth: head, mound },
    height: 2.2, radius: 1.1,
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph;
      const hidden = st === 'hidden' || st === 'idle' || st === 'walk' || st === 'run';
      const rumble = st === 'rumble';
      const emerge = st === 'emerge' || st === 'attack';
      const dead = st === 'dead';
      mound.visible = hidden || rumble;
      const shake = rumble ? 0.06 + 0.06 * Math.abs(Math.sin(tm * 3)) : 0.0;
      mound.position.set(Math.sin(tm * 43) * shake, Math.abs(Math.sin(tm * 31)) * shake * 1.5, Math.cos(tm * 37) * shake);
      mound.scale.set(1, rumble ? 1 + Math.sin(tm * 9) * 0.12 + 0.2 : 1, 1);
      chunks.forEach((m, i) => { m.position.y = 0.3 + (rumble ? Math.abs(Math.sin(tm * (7 + i) + i)) * 0.5 : 0); m.rotation.set(tm * (rumble ? 3 : 0) + i, i, 0); });
      worm.visible = emerge || dead;
      for (const cr of craters) cr.visible = emerge;
      if (emerge) {
        const p = clamp(a.progress ?? 0, 0, 1);
        const total = skArc.sOut - skArc.sIn + SK.HEAD + SK.N * SK.SP;
        const sHead = skArc.sIn + p * total;
        place(head, sHead, tm, 0.15);
        head.rotation.z = 0;
        for (const S of segs) place(S.seg, sHead - S.off, tm, 0.35);
        const pulse = 1 + Math.sin(tm * 6) * 0.03;
        head.scale.set(pulse, pulse, 1);
        for (const cr of craters) cr.scale.set(1, 1 + Math.sin(tm * 12) * 0.08, 1);
      } else if (dead) {
        // carcass lying across the sand in a lazy S-curve
        head.position.set(Math.sin(10 * 0.18) * 1.5, 1.05, 10);
        head.rotation.set(0.1, 0.25, 0.6);
        head.visible = true;
        head.scale.set(1, 1, 1);
        for (const S of segs) {
          const z = 10 - S.off;
          S.seg.position.set(Math.sin(z * 0.18) * 1.5, S.r * 0.85, z);
          S.seg.rotation.set(0, Math.cos(z * 0.18) * 0.27, 0.5);
          S.seg.visible = true;
        }
      }
    },
  };
}

// ================================================================== 15. TURRET
function buildTurret(ctx) {
  const metal = lam('#3c3f43', { map: tex('turretMetal', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#44474b', 0.12, 2); c.fillStyle = '#26282b'; c.fillRect(0, 15, w, 1); c.fillRect(15, 0, 1, h); }) });
  const hazard = lam('#d8b020', { map: tex('hazard', 16, 16, (c, w, h) => { c.fillStyle = '#e0b420'; c.fillRect(0, 0, w, h); c.fillStyle = '#151515'; for (let i = -16; i < 16; i += 6) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 3, 0); c.lineTo(i + 3 + h, h); c.lineTo(i + h, h); c.fill(); } }) });
  const dark = lam('#1b1c1e');
  mk(ctx.body, merged('tu_base', () => [xf(G.box(0.62, 0.08, 0.62), [0, 0.04, 0]), xf(G.cyl(0.11, 0.16, 0.46, 8), [0, 0.31, 0]), xf(G.cyl(0.2, 0.2, 0.06, 10), [0, 0.56, 0])]), metal);
  mk(ctx.body, merged('tu_bolts', () => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => xf(G.box(0.05, 0.03, 0.05), [x * 0.25, 0.09, z * 0.25]))), dark);
  const head = pv(ctx.body, [0, 0.62, 0], null, 'head');
  mk(head, merged('tu_housing', () => [xf(G.box(0.38, 0.3, 0.48), [0, 0.15, -0.02]), xf(G.box(0.12, 0.18, 0.3), [0.24, 0.12, -0.06])]), metal);
  mk(head, merged('tu_stripes', () => [xf(G.box(0.39, 0.06, 0.49), [0, 0.27, -0.02])]), hazard);
  const barrel = pv(head, [0, 0.14, 0.22], null, 'barrel');
  mk(barrel, merged('tu_barrel', () => [xf(G.segZ(0.26, 0.075, 0.07, 6)), xf(G.segZ(0.52, 0.035, 0.035, 6)), xf(G.box(0.08, 0.08, 0.06), [0, 0, 0.52])]), dark);
  const lightM = ctx.own(basI('#30ff50'));
  ctx.eyes.push(lightM); lightM.userData.baseColor = new THREE.Color('#30ff50'); lightM.userData.eliteColor = new THREE.Color('#ff2a14');
  mk(head, G.sph(0.045, 5, 4), lightM, [0, 0.32, -0.12]);
  const lensM = ctx.own(basI('#401010'));
  mk(barrel, G.box(0.03, 0.03, 0.01), lensM, [0.06, 0.05, 0.13]);
  const laserM = ctx.own(basI('#ff2418', { transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  const laser = mk(barrel, G.boxZ(0.012, 0.012, 15), laserM, [0.06, 0.05, 0.14]);
  const flashM = ctx.own(basI('#ffd060', { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const flash = pv(barrel, [0, 0, 0.58]);
  mk(flash, merged('tu_flash', () => [xf(G.plane(0.35, 0.35), [0, 0, 0.1], [0, PI / 2, 0]), xf(G.plane(0.35, 0.35), [0, 0, 0.1], [PI / 2, 0, 0]), xf(G.ico(0.07, 0), [0, 0, 0.03])]), flashM);
  return {
    parts: { head, barrel, laser, light: lightM },
    height: 1.0, radius: 0.35,
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph;
      const off = st === 'off' || st === 'dead';
      const alert = st === 'alert', fire = st === 'fire' || st === 'attack';
      let col = '#30ff50';
      if (off) col = '#151515';
      else if (fire) col = Math.floor(tm * 16) % 2 ? '#ff2a14' : '#ffb0a0';
      else if (alert) col = Math.floor(tm * 5) % 2 ? '#ff2a14' : '#601008';
      else col = Math.sin(tm * 2) > -0.2 ? '#30ff50' : '#1a8a2a';
      lightM.color.set(col);
      lensM.color.set(off ? '#200808' : alert || fire ? '#ff3020' : '#602020');
      laser.visible = alert || fire;
      laserM.opacity = 0.4 + Math.sin(tm * 40) * 0.1;
      const fl = fire && Math.floor(tm * 30) % 2 === 0;
      flash.visible = fl;
      if (fl) { flash.rotation.z = Math.random() * TAU; flash.scale.setScalar(0.7 + Math.random() * 0.6); }
      const recoil = fire ? Math.max(0, Math.sin(tm * 30 * PI)) * 0.06 : 0;
      barrel.position.z = damp(barrel.position.z, 0.22 - recoil, 40, dt);
      head.position.y = 0.62 + (fire ? Math.sin(tm * 60) * 0.004 : 0);
      barrel.rotation.x = off ? damp(barrel.rotation.x, 0.35, 3, dt) : damp(barrel.rotation.x, 0, 6, dt);
    },
  };
}

// ================================================================== 16. MINE
function buildMine(ctx) {
  const olive = lam('#4f5638'), plate = lam('#6f7470'), dark = lam('#222420');
  mk(ctx.body, merged('mi_body', () => [xf(G.cyl(0.19, 0.21, 0.05, 12), [0, 0.025, 0])]), olive);
  const top = pv(ctx.body, [0, 0.05, 0]);
  mk(top, merged('mi_plate', () => [xf(G.cyl(0.12, 0.13, 0.025, 12), [0, 0.0125, 0])]), plate);
  mk(ctx.body, merged('mi_ridges', () => { const a = []; for (let i = 0; i < 6; i++) { const t = (i / 6) * TAU; a.push(xf(G.box(0.03, 0.02, 0.05), [Math.sin(t) * 0.165, 0.055, Math.cos(t) * 0.165], [0, t, 0])); } return a; }), dark);
  const lightM = ctx.own(basI('#30ff50'));
  ctx.eyes.push(lightM); lightM.userData.baseColor = new THREE.Color('#30ff50'); lightM.userData.eliteColor = new THREE.Color('#ff2a14');
  mk(ctx.body, G.sph(0.022, 5, 3), lightM, [0, 0.06, 0.155]);
  const haloM = ctx.own(basI('#30ff50', { transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  const halo = mk(ctx.body, G.circle(0.08, 8), haloM, [0, 0.07, 0.155], [-PI / 2, 0, 0]);
  return {
    parts: { head: top, light: lightM },
    height: 0.08, radius: 0.2,
    update(dt, a) {
      const st = a.state, tm = a.time;
      const off = st === 'off' || st === 'dead';
      const trig = st === 'triggered' || st === 'attack';
      let on = false, col = '#30ff50';
      if (trig) { on = Math.floor(tm * 10) % 2 === 0; col = '#ff2414'; }
      else if (!off) on = (tm + ctx.ph) % 1.2 < 0.15;
      lightM.color.set(on ? col : off ? '#0c0c0c' : trig ? '#300806' : '#0a300f');
      halo.visible = on;
      haloM.color.set(col);
      halo.scale.setScalar(trig ? 1.4 : 1);
      top.position.y = trig ? 0.042 : 0.05;
    },
  };
}

// ================================================================== 17. KEFALDAYI (black-market merchant)
function buildKefaldayi(ctx) {
  const pants = lam('#3b3a44'), shoes = lam('#2a1d14');
  const shirt = lam('#cdc5a8', { map: stripeTex('kdShirt', '#d2caac', '#8c8468', 6, 0.05) });
  const apron = lam('#2f4a3a', { map: tex('kdApron', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#31503d', 0.12, 2); c.fillStyle = 'rgba(120,40,30,0.5)'; c.fillRect(8, 20, 5, 4); c.fillRect(20, 10, 3, 6); }) });
  const gold = lam('#e8b43a', { emissive: '#3d2800' });
  const fishM = lam('#8fa3b3', { map: tex('mulletSkin', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#9ab0bf', 0.08, 2);
    c.fillStyle = 'rgba(40,55,70,0.55)'; for (let y = 3; y < h; y += 5) c.fillRect(0, y, w, 2);
    c.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 20; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 1, 1);
  }) });
  const finM = lam('#6d8292', { side: THREE.DoubleSide });
  const hands = lam('#9fb0bb');
  const hips = pv(ctx.body, [0, 0.92, 0], null, 'hips');
  mk(hips, merged('kd_pelvis', () => [xf(G.box(0.34, 0.2, 0.24), [0, 0.02, 0])]), pants);
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.1, -0.02, 0]);
    mk(hip, G.segY(0.44, 0.08, 0.065, 6), pants);
    const knee = pv(hip, [0, -0.44, 0]);
    mk(knee, G.segY(0.4, 0.065, 0.055, 6), pants);
    mk(knee, merged('kd_shoe', () => [xf(G.box(0.12, 0.08, 0.26), [0, -0.44, 0.05])]), shoes);
    return { hip, knee, s };
  });
  const spine = pv(hips, [0, 0.08, 0], null, 'spine');
  mk(spine, merged('kd_torso', () => [
    xf(G.lathe('kd_torso', [[0.001, 0], [0.19, 0], [0.24, 0.14], [0.23, 0.3], [0.22, 0.45], [0.16, 0.54], [0.06, 0.57], [0.001, 0.57]], 8), [0, 0, 0], [0, 0, 0], [1, 1, 0.75]),
  ]), shirt);
  mk(spine, merged('kd_apron', () => [xf(G.box(0.4, 0.62, 0.02), [0, 0.1, 0.19], [-0.08, 0, 0]), xf(G.box(0.02, 0.3, 0.02), [0.12, 0.52, 0.12], [-0.3, 0, 0]), xf(G.box(0.02, 0.3, 0.02), [-0.12, 0.52, 0.12], [-0.3, 0, 0]), xf(G.box(0.12, 0.08, 0.03), [0.08, 0.02, 0.205])]), apron);
  mk(spine, merged('kd_chain', () => [xf(G.tor(0.15, 0.018, 3, 12), [0, 0.46, 0.06], [PI / 2 - 0.5, 0, 0]), xf(G.box(0.07, 0.09, 0.02), [0, 0.32, 0.18], [0, 0, PI / 4])]), gold);
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * 0.25, 0.47, 0]);
    mk(sh, merged('kd_uarm', () => [xf(G.segY(0.3, 0.07, 0.06, 6)), xf(G.sph(0.08, 5, 4))]), shirt);
    const el = pv(sh, [0, -0.3, 0]);
    mk(el, merged('kd_farm', () => [xf(G.segY(0.26, 0.055, 0.045, 6)), xf(G.box(0.08, 0.12, 0.05), [0, -0.31, 0])]), hands);
    return { sh, el, s };
  });
  const neck = pv(spine, [0, 0.56, 0.02], null, 'neck');
  mk(neck, G.segY(0.1, 0.06, 0.07, 6), hands, null, [PI, 0, 0]);
  const head = pv(neck, [0, 0.08, 0], [-0.35, 0, 0], 'head');
  mk(head, merged('kd_fish', () => [
    xf(G.sph(1, 10, 7), [0, 0.2, -0.02], [0, 0, 0], [0.19, 0.26, 0.34]),
    xf(G.sph(1, 6, 4), [0, 0.18, 0.28], [0, 0, 0], [0.12, 0.1, 0.1]),
  ]), fishM);
  mk(head, merged('kd_fins', () => [
    xf(G.cone(0.1, 0.34, 3), [0, 0.46, -0.12], [-1.6, 0, 0], [0.12, 1, 1]),
    xf(G.cone(0.07, 0.2, 3), [0.19, 0.1, -0.05], [-1.9, 0, -0.5], [1, 1, 0.15]), xf(G.cone(0.07, 0.2, 3), [-0.19, 0.1, -0.05], [-1.9, 0, 0.5], [1, 1, 0.15]),
    xf(G.box(0.01, 0.2, 0.03), [0.17, 0.18, -0.12], [0, 0, 0.2]), xf(G.box(0.01, 0.2, 0.03), [-0.17, 0.18, -0.12], [0, 0, -0.2]),
  ]), finM);
  const eyeM = ctx.eye('#f2eedc', '#ff3020');
  mk(head, merged('kd_eyes', () => [xf(G.sph(0.06, 6, 4), [0.168, 0.27, 0.12], [0, 0, 0], [0.6, 1, 1]), xf(G.sph(0.06, 6, 4), [-0.168, 0.27, 0.12], [0, 0, 0], [0.6, 1, 1])]), eyeM);
  mk(head, merged('kd_pupils', () => [xf(G.box(0.02, 0.035, 0.035), [0.197, 0.27, 0.13]), xf(G.box(0.02, 0.035, 0.035), [-0.197, 0.27, 0.13])]), bas('#0a0a0a'));
  const jaw = pv(head, [0, 0.12, 0.2], null, 'jaw');
  mk(jaw, merged('kd_jaw', () => [xf(G.sph(1, 6, 3, 0, TAU, PI / 2, PI / 2), [0, 0.02, 0.06], [0, 0, 0], [0.1, 0.06, 0.13])]), fishM);
  mk(jaw, merged('kd_mouthin', () => [xf(G.box(0.14, 0.01, 0.16), [0, 0.02, 0.05])]), lam('#5a2020'));
  let glance = 0, glanceT = 1, talkV = 0, talkT = 0;
  return {
    parts: { head, mouth: jaw },
    height: 1.95, radius: 0.35,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.2, 3);
      const talking = ctx.w('talk', c.st === 'talk', 8, dt);
      const ph = ctx.gait(c.speed, 1.4, dt);
      const amp = clamp(c.speed / 1.5, 0, 1);
      const s = Math.sin(ph);
      glanceT -= dt;
      if (glanceT <= 0) { glanceT = 1.2 + ctx.rnd() * 3; glance = (ctx.rnd() - 0.5) * 1.3; }
      talkT -= dt;
      if (talkT <= 0) { talkT = 0.07 + ctx.rnd() * 0.12; talkV = ctx.rnd() < 0.8 ? 0.2 + ctx.rnd() * 0.5 : 0; }
      const breathe = Math.sin(c.tm * 1.6);
      spine.scale.set(1 + breathe * 0.02, 1 + breathe * 0.01, 1 + breathe * 0.03);
      hips.position.set(Math.sin(c.tm * 0.35) * 0.02, 0.92 + Math.abs(s) * 0.03 * amp, 0);
      hips.rotation.z = Math.sin(c.tm * 0.35) * 0.02;
      for (const L of legs) { L.hip.rotation.x = (L.s > 0 ? -s : s) * 0.45 * amp; L.knee.rotation.x = Math.max(0, L.s > 0 ? Math.cos(ph) : -Math.cos(ph)) * 0.7 * amp + 0.03; }
      spine.rotation.set(0.02 + talking * Math.sin(c.tm * 2.1) * 0.04, Math.sin(c.tm * 0.5) * 0.05, -Math.sin(c.tm * 0.35) * 0.02);
      neck.rotation.set(talking * Math.sin(c.tm * 3.3) * 0.08, damp(neck.rotation.y, glance * (1 - talking * 0.7), 3, dt), Math.sin(c.tm * 0.7) * 0.05);
      jaw.rotation.x = talking * talkV * (0.6 + Math.sin(c.tm * 11) * 0.2) + (1 - talking) * Math.max(0, Math.sin(c.tm * 0.9)) * 0.08;
      for (const A of arms) {
        const r = A.s < 0;
        let sx = (A.s > 0 ? s : -s) * 0.35 * amp - 0.1, sz = A.s * 0.12, ex = -0.25;
        if (r) { sx = lerp(sx, -0.7 + Math.sin(c.tm * 2.3) * 0.35, talking); ex = lerp(ex, -1.1 + Math.sin(c.tm * 3.1) * 0.3, talking); sz = lerp(sz, 0.1, talking); }
        else { sx = lerp(sx, -0.35, talking * 0.5); ex = lerp(ex, -0.9, talking * 0.5); }
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
      }
    },
  };
}

// ================================================================== 18. THE ALGORITHM (tentacles under the counter)
function buildCompany(ctx) {
  const wet = lam('#16101b', { emissive: '#050208', side: THREE.DoubleSide, map: tex('companyWet', 32, 32, (c, w, h, r) => {
    noiseFill(c, w, h, r, '#1a1320', 0.25, 2);
    c.fillStyle = 'rgba(150,130,170,0.35)'; for (let i = 0; i < 8; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 1, 3 + ((r() * 6) | 0));
  }) });
  const rise = pv(ctx.body, [0, -7, 0], null, 'rise');
  const tents = [];
  const TP = [[-0.6, 0.35, 0.0], [0.65, 0.3, 1.3], [-0.2, -0.45, 2.6], [0.45, -0.5, 4.0]];
  TP.forEach(([x, z, phs], ti) => {
    const segs = [];
    let parent = pv(rise, [x, 0, z]);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const r0 = lerp(0.3, 0.05, i / n), r1 = lerp(0.3, 0.05, (i + 1) / n);
      const sg = pv(parent, i === 0 ? [0, 0, 0] : [0, 0.55, 0]);
      mk(sg, merged(`co_t${i}`, () => [i === n - 1 ? xf(G.cone(r0, 0.7, 6), [0, 0.35, 0]) : xf(G.cyl(r1, r0, 0.6, 6, true), [0, 0.3, 0])]), wet);
      segs.push(sg);
      parent = sg;
    }
    tents.push({ segs, phs, ti, side: x > 0 ? 1 : -1 });
  });
  // long-fingered hand on a thick arm
  const arm = [];
  let parent = pv(rise, [0, 0, -0.1]);
  for (let i = 0; i < 5; i++) {
    const sg = pv(parent, i === 0 ? [0, 0, 0] : [0, 0.8, 0]);
    mk(sg, merged('co_arm' + i, () => [xf(G.cyl(lerp(0.34, 0.2, (i + 1) / 5), lerp(0.34, 0.2, i / 5), 0.85, 7, true), [0, 0.42, 0])]), wet);
    arm.push(sg);
    parent = sg;
  }
  const palm = pv(parent, [0, 0.8, 0], null, 'palm');
  mk(palm, merged('co_palm', () => [xf(G.box(0.55, 0.5, 0.16), [0, 0.22, 0])]), wet);
  const eyeM = ctx.eye('#f2ecc0');
  mk(arm[1], merged('co_eyes', () => [[0.12, 0.3, 0.3], [-0.08, 0.45, 0.31], [0.02, 0.62, 0.3], [0.2, 0.55, 0.27], [-0.18, 0.25, 0.28]].map(([x, y, z]) => xf(G.oct(0.035), [x, y, z]))), eyeM);
  const fingers = [];
  for (let f = 0; f < 5; f++) {
    const thumb = f === 4;
    let fp = pv(palm, thumb ? [0.3, 0.1, 0.05] : [(f - 1.5) * 0.13, 0.46, 0], thumb ? [0, 0, -0.9] : [0, 0, (f - 1.5) * -0.08]);
    const joints = [];
    for (let j = 0; j < 3; j++) {
      const jp = pv(fp, j === 0 ? [0, 0, 0] : [0, thumb ? 0.28 : 0.45, 0]);
      mk(jp, merged(`co_f${thumb ? 't' : ''}${j}`, () => [j === 2 ? xf(G.cone(0.045, thumb ? 0.3 : 0.5, 5), [0, thumb ? 0.15 : 0.25, 0]) : xf(G.cyl(0.045, 0.055, thumb ? 0.3 : 0.47, 5, true), [0, thumb ? 0.15 : 0.235, 0])]), wet);
      joints.push(jp);
      fp = jp;
    }
    fingers.push({ joints, thumb, f });
  }
  const grip = new THREE.Object3D();
  grip.name = 'grip';
  grip.position.set(0, 0.7, 0.35);
  palm.add(grip);
  return {
    parts: { head: palm, hand: grip, rise },
    height: 5, radius: 1.5,
    update(dt, a) {
      const st = a.state, tm = a.time + ctx.ph;
      const grabbing = st === 'grab' || st === 'attack';
      const p = grabbing ? clamp(a.progress ?? 0, 0, 1) : 0;
      const up = grabbing ? keys(p, [[0, 0], [0.35, 1], [0.55, 1], [1, 0]]) : 0;
      const reach = grabbing ? keys(p, [[0, 0.2], [0.3, 1], [0.45, 0.9], [0.6, 0.4], [1, 0]]) : 0;
      const close = grabbing ? ramp(p, 0.38, 0.52) : 0;
      let y;
      if (grabbing) y = p < 0.55 ? lerp(-7, 0, smooth(p / 0.35)) : lerp(0, -7, ramp(p, 0.55, 1) ** 2);
      else y = st === 'idle' ? -4.9 + Math.sin(tm * 0.8) * 0.15 : -7;
      rise.position.y = damp(rise.position.y, y, grabbing ? 30 : 4, dt);
      for (const T of tents) {
        T.segs.forEach((s, i) => {
          const w = Math.sin(tm * 1.7 + T.phs - i * 0.6), w2 = Math.cos(tm * 1.3 + T.phs * 1.7 - i * 0.5);
          const amp = 0.12 + (1 - up) * 0.1;
          s.rotation.set(w * amp + reach * 0.13 * (i > 2 ? 1 : 0.3) + close * 0.12, 0, w2 * amp + T.side * 0.05 * (i < 3 ? 1 : -0.5) - T.side * close * 0.08);
        });
      }
      arm.forEach((s, i) => {
        const w = Math.sin(tm * 1.1 - i * 0.7) * 0.06 * (1 - reach);
        s.rotation.set(w + reach * (i < 2 ? 0.05 : 0.33) - close * (i >= 3 ? 0.15 : 0), 0, Math.cos(tm * 0.9 - i * 0.5) * 0.05);
      });
      palm.rotation.set(reach * 0.2 + close * 0.3, 0, 0);
      for (const F of fingers) {
        const spread = (1 - close) * reach;
        F.joints.forEach((j, k) => {
          const wig = Math.sin(tm * 3 + F.f + k) * 0.08 * (1 - close);
          j.rotation.x = (F.thumb ? 0.4 : 0.15) * (1 - spread) + close * (F.thumb ? 0.9 : 1.05) + wig - spread * 0.25 * (k === 0 ? 1 : 0);
        });
      }
      const vis = rise.position.y > -6.95;
      ctx.body.visible = vis;
    },
  };
}

// ================================================================== ROUND 3 (LC-inspired, internet horror)
// Shared humanoid rig: hips -> legs (hip/knee), spine -> arms (sh/el/hand), neck -> head. Keys must be unique.
function humanoid(ctx, key, M, o) {
  const hips = pv(ctx.body, [0, o.hipY, 0], null, 'hips');
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * o.hipW, 0, 0]);
    mk(hip, G.segY(o.thigh, o.legR, o.legR * 0.8, 5), M.leg);
    const knee = pv(hip, [0, -o.thigh, 0]);
    mk(knee, merged(key + '_shin', () => [xf(G.segY(o.shin, o.legR * 0.8, o.legR * 0.6, 5)), xf(G.box(o.legR * 2.2, 0.07, o.legR * 3.6), [0, -o.shin - 0.01, o.legR * 0.9])]), M.leg);
    if (M.boot) mk(knee, merged(key + '_boot', () => [xf(G.box(o.legR * 2.4, 0.16, o.legR * 3.8), [0, -o.shin + 0.04, o.legR * 0.8])]), M.boot);
    return { hip, knee, s };
  });
  const spine = pv(hips, [0, 0.04, 0], null, 'spine');
  const arms = [1, -1].map((s) => {
    const sh = pv(spine, [s * o.shW, o.shY, 0]);
    mk(sh, G.segY(o.uarm, o.armR, o.armR * 0.85, 5), M.arm);
    const el = pv(sh, [0, -o.uarm, 0]);
    mk(el, G.segY(o.farm, o.armR * 0.85, o.armR * 0.7, 5), M.arm);
    const hand = pv(el, [0, -o.farm, 0]);
    if (M.hand) mk(hand, G.box(o.armR * 1.8, o.armR * 2.4, o.armR * 1.2), M.hand, [0, -o.armR, 0]);
    return { sh, el, hand, s };
  });
  const neck = pv(spine, [0, o.neckY, 0], null, 'neck');
  const head = pv(neck, [0, 0.05, 0], null, 'head');
  return { hips, legs, spine, arms, neck, head };
}
function gaitLegs(R, ph, amp, swing = 0.5, knee = 0.8) {
  const s = Math.sin(ph), co = Math.cos(ph);
  for (const L of R.legs) {
    const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
    L.hip.rotation.set(-p * swing * amp, 0, L.s * 0.04);
    L.knee.rotation.x = Math.max(0, pc) * knee * amp + 0.02;
  }
}
function screenTex(key, w, h, draw) { return tex('scr|' + key, w, h, draw, false); }

// ------------------------------------------------------------------ THE MODERATOR (nutcracker)
function modPlateTex() {
  return screenTex('modPlate', 32, 32, (c, w, h) => {
    c.fillStyle = '#d8b040'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#8a6010'; c.fillRect(2, 2, w - 4, h - 4);
    c.fillStyle = '#f4d060'; c.fillRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#2a1a04';
    // "MOD" in 3x5 pixel glyphs
    const g = { M: ['10001', '11011', '10101', '10001', '10001'], O: ['01110', '10001', '10001', '10001', '01110'], D: ['11110', '10001', '10001', '10001', '11110'] };
    ['M', 'O', 'D'].forEach((ch, i) => g[ch].forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') c.fillRect(3 + i * 9 + x * 1.6, 12 + y * 1.6, 1.6, 1.6); })));
  });
}
function buildModerator(ctx) {
  const coat = lam('#27432e', { map: stripeTex('modCoat', '#2a4832', '#1a2e20', 3, 0.1) });
  const white = lam('#e6e0cc'), gold = lam('#d8b040', { emissive: '#2a1c00' }), black = lam('#141416');
  const wood = lam('#c8966a', { map: tex('modWood', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#c8966a', 0.1, 2); c.fillStyle = 'rgba(90,50,20,0.35)'; for (let y = 0; y < h; y += 4) c.fillRect(0, y + ((r() * 2) | 0), w, 1); }) });
  const metal = lam('#50555c', { map: noiseTex('modMetal', '#50555c', 0.2) });
  const R = humanoid(ctx, 'mod', { leg: white, arm: coat, boot: black, hand: white }, { hipY: 1.02, hipW: 0.11, thigh: 0.5, shin: 0.48, legR: 0.075, shW: 0.27, shY: 0.62, uarm: 0.34, farm: 0.3, armR: 0.06, neckY: 0.76 });
  mk(R.spine, merged('mod_torso', () => [
    xf(G.lathe('mod_torso', [[0.001, -0.08], [0.2, -0.08], [0.24, 0.1], [0.22, 0.38], [0.27, 0.62], [0.2, 0.74], [0.001, 0.76]], 8), [0, 0, 0], [0, 0, 0], [1, 1, 0.72]),
    xf(G.cyl(0.26, 0.3, 0.3, 8), [0, -0.12, 0], [0, 0, 0], [1, 1, 0.75]),
  ]), coat);
  mk(R.spine, merged('mod_belts', () => [
    xf(G.box(0.07, 0.8, 0.02), [0, 0.34, 0.16], [0, 0, 0.62]), xf(G.box(0.07, 0.8, 0.02), [0, 0.34, 0.165], [0, 0, -0.62]),
    xf(G.box(0.5, 0.07, 0.36), [0, 0.02, 0]),
  ]), white);
  mk(R.spine, merged('mod_gold', () => [
    xf(G.box(0.2, 0.05, 0.2), [0.27, 0.66, 0], [0, 0, -0.2]), xf(G.box(0.2, 0.05, 0.2), [-0.27, 0.66, 0], [0, 0, 0.2]),
    xf(G.box(0.08, 0.08, 0.03), [0, 0.34, 0.18]), ...[0.5, 0.42, 0.26, 0.18].map((y) => xf(G.sph(0.018, 4, 3), [0.06, y, 0.17])),
  ]), gold);
  // head: wooden nutcracker face with a clacking jaw, painted eyes, moustache
  mk(R.head, merged('mod_face', () => [xf(G.box(0.26, 0.26, 0.24), [0, 0.13, 0.01])]), wood);
  const eyeM = ctx.eye('#141414', '#ff2414');
  mk(R.head, merged('mod_eyes', () => [xf(G.box(0.05, 0.035, 0.01), [0.06, 0.17, 0.135]), xf(G.box(0.05, 0.035, 0.01), [-0.06, 0.17, 0.135])]), eyeM);
  mk(R.head, merged('mod_stache', () => [xf(G.box(0.2, 0.035, 0.04), [0, 0.085, 0.14]), xf(G.box(0.05, 0.06, 0.05), [0, 0.13, 0.15])]), white);
  const jaw = pv(R.head, [0, 0.04, 0.02], null, 'jaw');
  mk(jaw, merged('mod_jaw', () => [xf(G.box(0.24, 0.07, 0.22), [0, -0.03, 0.02]), ...[-0.07, -0.02, 0.03, 0.08].map((x) => xf(G.box(0.03, 0.03, 0.02), [x, 0.01, 0.13]))]), wood);
  // shako hat with the REVIEW eye hidden under a split lid
  const hat = pv(R.head, [0, 0.26, 0], null, 'hat');
  mk(hat, merged('mod_hat', () => [xf(G.cyl(0.16, 0.14, 0.4, 10), [0, 0.2, 0]), xf(G.cyl(0.16, 0.16, 0.03, 10), [0, 0.02, 0.03], [0, 0, 0], [1, 1, 1.3])]), black);
  mk(hat, G.plane(0.14, 0.14), lam('#ffffff', { map: modPlateTex() }), [0, 0.22, 0.152]);
  mk(hat, merged('mod_plume', () => [xf(G.cone(0.03, 0.2, 5), [0, 0.5, 0.1], [0.3, 0, 0])]), lam('#b01818'));
  const lidL = pv(hat, [0.15, 0.4, 0]), lidR = pv(hat, [-0.15, 0.4, 0]);
  mk(lidL, merged('mod_lid', () => [xf(G.box(0.15, 0.025, 0.3), [-0.075, 0.012, 0])]), black);
  mk(lidR, merged('mod_lid', () => [xf(G.box(0.15, 0.025, 0.3), [-0.075, 0.012, 0])]), black, null, [0, PI, 0]);
  const orb = pv(hat, [0, 0.36, 0]);
  mk(orb, G.sph(0.09, 8, 6), white);
  const irisM = ctx.own(basI('#20ff60'));
  mk(orb, G.sph(0.045, 6, 4), irisM, [0, 0.02, 0.06], null, [1, 1, 0.5]);
  // the ban-hammer shotgun: long double barrel held across the chest; laser sight + muzzle flash
  const gun = pv(R.spine, [0.08, 0.36, 0.22], null, 'gun');
  mk(gun, merged('mod_stock', () => [xf(G.box(0.07, 0.12, 0.34), [0, -0.02, -0.12]), xf(G.box(0.05, 0.1, 0.1), [0, -0.1, 0.02])]), wood);
  const barrel = pv(gun, [0, 0.02, 0.05]);
  mk(barrel, merged('mod_barrels', () => [xf(G.cyl(0.026, 0.026, 0.9, 6), [0.026, 0, 0.45], [PI / 2, 0, 0]), xf(G.cyl(0.026, 0.026, 0.9, 6), [-0.026, 0, 0.45], [PI / 2, 0, 0]), xf(G.box(0.1, 0.03, 0.12), [0, -0.035, 0.5])]), metal);
  mk(barrel, merged('mod_hammer', () => [xf(G.box(0.16, 0.14, 0.12), [0, 0.02, 0.96]), xf(G.box(0.06, 0.06, 0.06), [0, 0.12, 0.96])]), black);
  const laserM = ctx.own(basI('#ff1a10', { transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  laserM.userData.noTint = true;
  const laser = mk(barrel, G.boxZ(0.012, 0.012, 14), laserM, [0, 0.03, 1.0]);
  const flashM = ctx.own(basI('#ffd070', { transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  const flash = mk(barrel, G.ico(0.16, 0), flashM, [0, 0, 1.08]);
  flash.visible = false; laser.visible = false;
  let lidOpen = 0, orbUp = 0;
  return {
    parts: { head: R.head, mouth: jaw, gun, laser },
    height: 2.3, radius: 0.45,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.6, 3.4);
      const st = c.st, deadK = smooth(c.dead);
      if (st === 'patrol' || st === 'hunt') c.speed = a.speed ?? (st === 'hunt' ? 3 : 1.6);
      const scan = ctx.w('scan', st === 'scan', 6, dt);
      const aim = ctx.w('aim', st === 'aim' || st === 'fire', 10, dt);
      const reload = ctx.w('reload', st === 'reload', 6, dt);
      const ph = ctx.gait(c.speed, 1.5, dt);
      const amp = clamp(c.speed / 1.5, 0, 1) * c.alive;
      gaitLegs(R, ph, amp, 0.45, 0.35);                    // stiff, marching
      const kick = st === 'kick' ? keys(a.t, [[0, 0], [0.2, -0.3], [0.32, 1], [0.55, 0.6], [0.75, 0]]) : 0;
      R.legs[0].hip.rotation.x += -kick * 1.3; R.legs[0].knee.rotation.x = lerp(R.legs[0].knee.rotation.x, 0.05, Math.abs(kick));
      R.hips.position.y = 1.02 + Math.abs(Math.sin(ph)) * 0.03 * amp - c.stun * 0.05;
      const recoil = st === 'fire' ? keys(a.t, [[0, 1], [0.12, 0.6], [0.4, 0]]) : 0;
      R.spine.rotation.set(-0.04 + aim * 0.05 - recoil * 0.12 + c.stun * 0.25, Math.sin(ph) * 0.05 * amp, c.stun * Math.sin(c.tm * 2) * 0.1);
      // head: sweeps slowly while reviewing, locks on while aiming
      R.neck.rotation.set(-aim * 0.08 + c.stun * 0.3, scan * Math.sin(c.tm * 1.6) * 0.7 + (1 - scan) * Math.sin(c.tm * 0.3) * 0.12 * (1 - aim), 0);
      jaw.rotation.x = (st === 'hunt' || st === 'kick' ? Math.max(0, Math.sin(c.tm * 14)) * 0.35 : Math.max(0, Math.sin(c.tm * 0.9)) * 0.05) + scan * 0.1 + deadK * 0.4;
      // hat lid + eye
      lidOpen = damp(lidOpen, st === 'scan' || st === 'aim' || st === 'fire' ? 1 : 0, 9, dt);
      lidL.rotation.z = lidOpen * 1.25; lidR.rotation.z = -lidOpen * 1.25;
      orbUp = damp(orbUp, lidOpen, 7, dt);
      orb.position.y = 0.26 + orbUp * 0.2;
      orb.rotation.y = scan * Math.sin(c.tm * 3.1) * 0.6;
      const red = st === 'aim' || st === 'fire' || st === 'hunt' || st === 'kick';
      irisM.color.set(c.dead > 0.5 ? '#101010' : red ? '#ff2010' : st === 'scan' ? '#30ff60' : '#1a5a2a');
      // gun: across the chest -> shouldered; breaks open to reload
      gun.position.set(0.08 - aim * 0.1, 0.36 + aim * 0.2, 0.22 + aim * 0.02);
      gun.rotation.set(lerp(0.95, 0, aim) + recoil * -0.35 + reload * 0.5, lerp(-0.5, 0.02, aim), lerp(0.6, 0, aim));
      barrel.rotation.x = reload * 0.75;
      for (const A of R.arms) {
        const r = A.s < 0;
        let sx = lerp(-0.6, r ? -1.45 : -1.25, aim), sz = A.s * lerp(r ? 0.15 : 0.45, r ? 0.1 : 0.35, aim), ex = lerp(-1.1, r ? -0.2 : -0.55, aim);
        sx += reload * 0.3; ex -= reload * 0.3;
        sx = lerp(sx, -0.2, deadK); ex = lerp(ex, -0.1, deadK);
        A.sh.rotation.set(sx, 0, sz);
        A.el.rotation.x = ex;
      }
      // laser sight: the telegraph. Pulses faster the closer the shot is.
      const aiming = st === 'aim' && c.alive > 0.5;
      laser.visible = aiming;
      if (aiming) laserM.opacity = 0.35 + 0.35 * Math.abs(Math.sin(a.t * (8 + a.t * 22)));
      flash.visible = st === 'fire' && a.t < 0.08;
      if (flash.visible) flash.rotation.z = c.tm * 20;
      ctx.body.rotation.x = -PI * 0.48 * deadK * deadK;
      ctx.body.position.set(0, 0.12 * deadK, -0.2 * deadK);
    },
  };
}

// ------------------------------------------------------------------ CUSTOMER SUPPORT (butler)
function supportFace(mood) {
  return screenTex('support_' + mood, 32, 32, (c, w, h) => {
    c.fillStyle = mood === 'bad' ? '#1a0204' : '#04121a'; c.fillRect(0, 0, w, h);
    c.fillStyle = mood === 'bad' ? 'rgba(255,40,40,0.12)' : 'rgba(80,220,255,0.1)';
    for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
    c.fillStyle = mood === 'bad' ? '#ff3030' : '#70e8ff';
    if (mood === 'bad') { c.fillRect(7, 9, 6, 2); c.fillRect(19, 9, 6, 2); c.fillRect(9, 11, 3, 3); c.fillRect(20, 11, 3, 3); }
    else { c.fillRect(9, 10, 3, 4); c.fillRect(20, 10, 3, 4); }
    // smile (wider and toothy when hostile)
    for (let x = 8; x <= 23; x++) { const y = 20 + Math.round(Math.sin(((x - 8) / 15) * PI) * (mood === 'bad' ? 5 : 3)); c.fillRect(x, y, 1, 2); }
    if (mood === 'bad') for (let x = 10; x < 23; x += 3) c.fillRect(x, 21, 1, 3);
  });
}
function buildSupport(ctx) {
  const suit = lam('#1b1b22', { map: noiseTex('supSuit', '#1c1c24', 0.08) });
  const shirt = lam('#e8e6e0'), skin = lam('#cdbfb4'), red = lam('#a01822'), shell = lam('#b8bcc4');
  const R = humanoid(ctx, 'sup', { leg: suit, arm: suit, boot: lam('#0c0c0e'), hand: lam('#f2f2f2') }, { hipY: 0.9, hipW: 0.09, thigh: 0.45, shin: 0.43, legR: 0.06, shW: 0.2, shY: 0.5, uarm: 0.3, farm: 0.28, armR: 0.045, neckY: 0.6 });
  mk(R.spine, merged('sup_torso', () => [xf(G.lathe('sup_torso', [[0.001, -0.06], [0.15, -0.06], [0.17, 0.2], [0.2, 0.48], [0.14, 0.6], [0.001, 0.62]], 8), [0, 0, 0], [0, 0, 0], [1, 1, 0.7]),
    xf(G.box(0.34, 0.3, 0.2), [0, -0.12, -0.08], [0.25, 0, 0])]), suit);                        // tailcoat
  mk(R.spine, merged('sup_shirt', () => [xf(G.box(0.12, 0.34, 0.02), [0, 0.38, 0.13])]), shirt);
  mk(R.spine, merged('sup_tie', () => [xf(G.box(0.1, 0.035, 0.02), [0, 0.54, 0.14]), xf(G.box(0.03, 0.04, 0.02), [0, 0.54, 0.15])]), red);
  mk(R.neck, G.segY(0.08, 0.04, 0.045, 5), skin, null, [PI, 0, 0]);
  // monitor head with a headset and a smiling face-screen
  mk(R.head, merged('sup_head', () => [xf(G.box(0.26, 0.22, 0.2), [0, 0.12, 0])]), shell);
  const faceGood = bas('#ffffff', { map: supportFace('good') }), faceBad = bas('#ffffff', { map: supportFace('bad') });
  const face = mk(R.head, G.plane(0.22, 0.18), faceGood, [0, 0.12, 0.101]);
  mk(R.head, merged('sup_headset', () => [xf(G.tor(0.15, 0.012, 3, 10, PI), [0, 0.14, 0], [0, PI / 2, 0]), xf(G.cyl(0.04, 0.04, 0.03, 8), [0.14, 0.1, 0], [0, 0, PI / 2]), xf(G.cyl(0.04, 0.04, 0.03, 8), [-0.14, 0.1, 0], [0, 0, PI / 2]), xf(G.box(0.012, 0.012, 0.16), [0.13, 0.04, 0.08], [0, -0.5, 0]), xf(G.sph(0.018, 4, 3), [0.09, 0.04, 0.16])]), lam('#1a1a1a'));
  const eyeM = ctx.eye('#70e8ff', '#ff3020');
  mk(R.head, G.box(0.02, 0.02, 0.01), eyeM, [0.1, 0.22, 0.101]);          // status LED
  // feather duster (polite) / knife (not polite)
  const hand = R.arms[1].hand;
  const duster = pv(hand, [0, -0.05, 0.02]);
  mk(duster, merged('sup_duster', () => [xf(G.cyl(0.012, 0.012, 0.36, 4), [0, -0.12, 0.08], [1.1, 0, 0])]), lam('#5a3a20'));
  mk(duster, merged('sup_fluff', () => [0, 1, 2, 3, 4].map((i) => xf(G.cone(0.05, 0.16, 4), [Math.sin(i * 1.3) * 0.03, -0.3 + Math.cos(i * 1.7) * 0.02, 0.3], [1.1 + (i - 2) * 0.15, i, 0]))), lam('#e0c070'));
  const knife = pv(hand, [0, -0.05, 0.02]);
  mk(knife, merged('sup_knife', () => [xf(G.box(0.02, 0.05, 0.1), [0, 0, 0.02]), xf(G.box(0.008, 0.05, 0.28), [0, 0, 0.2])]), lam('#d8dde2', { emissive: '#1a1a1a' }));
  knife.visible = false;
  let mood = 0;
  return {
    parts: { head: R.head, hand: knife },
    height: 1.9, radius: 0.4,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.5, 4.5);
      const st = c.st, deadK = smooth(c.dead);
      if (st === 'follow') c.speed = a.speed ?? 1.5;
      const hostile = st === 'windup' || st === 'stab' || st === 'run';
      mood = damp(mood, hostile ? 1 : 0, 10, dt);
      face.material = mood > 0.5 ? faceBad : faceGood;
      knife.visible = mood > 0.5; duster.visible = !knife.visible;
      const run = ctx.w('run', st === 'run', 6, dt);
      const ph = ctx.gait(c.speed, lerp(1.2, 2.0, run), dt);
      const amp = clamp(c.speed / 1.4, 0, 1) * c.alive;
      gaitLegs(R, ph, amp, lerp(0.4, 0.7, run), lerp(0.6, 1.1, run));
      R.hips.position.y = 0.9 + Math.abs(Math.sin(ph)) * 0.03 * amp;
      const wind = st === 'windup' ? smooth(a.t / 0.8) : 0;
      const stab = st === 'stab' ? keys(a.t, [[0, 0], [0.1, 1], [0.3, 1], [0.45, 0]]) : 0;
      const bow = (st === 'idle' ? 1 : 0) * (0.08 + Math.max(0, Math.sin(c.tm * 0.4)) * 0.12);   // polite little bows
      R.spine.rotation.set(bow + run * 0.25 + stab * 0.3 - wind * 0.1 + c.stun * 0.3, 0, c.stun * Math.sin(c.tm * 2) * 0.1);
      R.neck.rotation.set(-bow * 0.5 + wind * 0.25, Math.sin(c.tm * 0.5) * 0.15 * (1 - run), wind * 0.35 + (st === 'idle' ? Math.sin(c.tm * 0.7) * 0.18 : 0));
      // left arm behind the back (butler), right arm sweeps / stabs
      const L = R.arms[0], Rr = R.arms[1];
      L.sh.rotation.set(lerp(0.35, -0.3 + Math.sin(ph) * 0.6 * amp, run), 0, 0.12); L.el.rotation.x = lerp(-1.5, -0.6, run);
      const sweep = st === 'idle' || st === 'walk' ? Math.sin(c.tm * 3.2) * 0.4 : 0;
      let sx = -0.7 + sweep * 0.3, sz = -0.15 + sweep * 0.5, ex = -0.6;
      sx = lerp(sx, -2.7, wind); ex = lerp(ex, -1.4, wind); sz = lerp(sz, -0.3, wind);
      sx = lerp(sx, -1.5, stab); ex = lerp(ex, 0, stab); sz = lerp(sz, 0, stab);
      sx = lerp(sx, -1.2, run * (1 - wind) * (1 - stab)); ex = lerp(ex, -0.4, run * (1 - wind) * (1 - stab));
      Rr.sh.rotation.set(lerp(sx, -0.2, deadK), 0, sz); Rr.el.rotation.x = ex;
      ctx.body.rotation.x = PI * 0.47 * deadK * deadK;
      ctx.body.position.y = 0.1 * deadK;
    },
  };
}

// ------------------------------------------------------------------ TICKET SWARM
function buildTicketSwarm(ctx) {
  const paper = lam('#efe07a', { side: THREE.DoubleSide }), urgent = lam('#e04a3a', { side: THREE.DoubleSide });
  const core = pv(ctx.body, [0, 1.0, 0], null, 'core');
  const tickets = [];
  for (let i = 0; i < 18; i++) {
    const p = pv(core);
    mk(p, G.box(0.16, 0.1, 0.008), i % 5 === 0 ? urgent : paper);
    tickets.push({ p, r: 0.25 + ctx.rnd() * 0.6, sp: (1.5 + ctx.rnd() * 2.5) * (ctx.rnd() < 0.5 ? -1 : 1), ph: ctx.rnd() * TAU, y: (ctx.rnd() - 0.5) * 0.9, tilt: ctx.rnd() * TAU, wob: 2 + ctx.rnd() * 4 });
  }
  const eyeM = ctx.eye('#ff4030');
  mk(core, G.oct(0.06), eyeM);
  return {
    parts: { head: core },
    height: 1.6, radius: 0.7,
    update(dt, a) {
      const c = common(ctx, a, dt, 3, 5);
      const deadK = smooth(c.dead);
      const agit = c.st === 'run' ? 1.6 : 1;
      core.position.y = lerp(1.0 + Math.sin(c.tm * 3) * 0.1, 0.05, deadK);
      for (const T of tickets) {
        const ang = T.ph + c.tm * T.sp * agit;
        const r = T.r * (1 + Math.sin(c.tm * T.wob) * 0.15) * (1 - deadK * 0.3);
        T.p.position.set(Math.cos(ang) * r, T.y * (1 - deadK) + Math.sin(c.tm * T.wob + T.ph) * 0.08, Math.sin(ang) * r);
        T.p.rotation.set(T.tilt + c.tm * T.wob * (1 - deadK), ang, Math.sin(c.tm * 9 + T.ph) * 0.6 * (1 - deadK));
        T.p.scale.setScalar(1 - deadK * 0.9);
      }
    },
  };
}

// ------------------------------------------------------------------ THE EDITOR (barber): moves on the beat
function clapTex() {
  return screenTex('clapper', 32, 16, (c, w, h) => {
    c.fillStyle = '#e8e8e8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#101010'; for (let x = -8; x < w; x += 8) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 4, h); c.lineTo(x + 12, 0); c.lineTo(x + 8, 0); c.fill(); }
  });
}
function buildEditor(ctx) {
  const robe = lam('#3b0f18', { map: tex('edRobe', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#3d1019', 0.14, 2); c.fillStyle = 'rgba(0,0,0,0.5)'; for (let x = 2; x < w; x += 8) c.fillRect(x, 0, 2, h); c.fillStyle = 'rgba(220,200,160,0.25)'; for (let y = 1; y < h; y += 4) { c.fillRect(0, y, 2, 2); c.fillRect(w - 2, y, 2, 2); } }) });
  const film = lam('#151515', { map: tex('edFilm', 32, 8, (c, w, h) => { c.fillStyle = '#121212'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8d0b0'; for (let x = 1; x < w; x += 4) { c.fillRect(x, 1, 2, 1); c.fillRect(x, h - 2, 2, 1); } c.fillStyle = '#6a5a40'; for (let x = 0; x < w; x += 8) c.fillRect(x + 1, 3, 6, 2); }) });
  const steel = lam('#c8ccd2', { emissive: '#101216' }), black = lam('#0e0e0e'), mask = lam('#e6e2d6');
  const hover = pv(ctx.body, [0, 0, 0], null, 'hover');
  const bodyG = pv(hover, [0, 0.1, 0], null, 'robe');
  mk(bodyG, G.lathe('ed_robe', [[0.001, 0], [0.42, 0], [0.36, 0.5], [0.26, 1.2], [0.22, 1.6], [0.26, 1.78], [0.12, 1.9], [0.001, 1.92]], 9), robe);
  mk(bodyG, merged('ed_film', () => [xf(G.tor(0.25, 0.03, 3, 12), [0, 1.72, 0], [PI / 2 + 0.2, 0, 0], [1, 1, 3]), xf(G.box(0.1, 0.6, 0.02), [0.12, 1.4, 0.24], [0.1, 0, 0.2])]), film);
  // the drum it marches to, strapped to its belly
  const drum = pv(bodyG, [0, 1.05, 0.3]);
  mk(drum, merged('ed_drum', () => [xf(G.cyl(0.2, 0.2, 0.18, 10), [0, 0, 0], [PI / 2, 0, 0])]), lam('#8a1a1a'));
  mk(drum, merged('ed_drumrim', () => [xf(G.tor(0.2, 0.015, 3, 12), [0, 0, 0.09]), xf(G.tor(0.2, 0.015, 3, 12), [0, 0, -0.09])]), lam('#d8b040'));
  const skinM = ctx.own(lamI('#e8e0c8'));
  mk(drum, G.circle(0.19, 10), skinM, [0, 0, 0.092]);
  // clapperboard head that snaps on every beat
  const head = pv(bodyG, [0, 1.92, 0], null, 'head');
  mk(head, merged('ed_mask', () => [xf(G.sph(1, 8, 6), [0, 0.16, 0], [0, 0, 0], [0.16, 0.19, 0.15])]), mask);
  const eyeM = ctx.eye('#ff2a2a');
  mk(head, merged('ed_eyes', () => [xf(G.box(0.06, 0.012, 0.01), [0.055, 0.2, 0.145], [0, 0, 0.2]), xf(G.box(0.06, 0.012, 0.01), [-0.055, 0.2, 0.145], [0, 0, -0.2])]), eyeM);
  mk(head, merged('ed_cut', () => [xf(G.box(0.12, 0.012, 0.01), [0, 0.09, 0.14])]), black);
  mk(head, merged('ed_board', () => [xf(G.box(0.36, 0.08, 0.03), [0, 0.34, 0.02])]), black);
  const clap = pv(head, [-0.18, 0.39, 0.02]);
  mk(clap, G.box(0.36, 0.05, 0.03), bas('#ffffff', { map: clapTex() }), [0.18, 0.025, 0]);
  // scissor-blade arms: a hinge in front of the chest, two long blades
  const hinge = pv(bodyG, [0, 1.35, 0.35], null, 'scissors');
  mk(hinge, G.cyl(0.05, 0.05, 0.08, 8), black, null, [PI / 2, 0, 0]);
  const blades = [1, -1].map((s) => {
    const b = pv(hinge);
    mk(b, merged('ed_blade', () => [xf(G.box(0.06, 0.02, 0.9), [0.02, 0, 0.48]), xf(G.cone(0.03, 0.14, 3), [0.02, 0, 0.98], [PI / 2, 0, 0])]), steel);
    mk(b, merged('ed_handle', () => [xf(G.tor(0.08, 0.018, 3, 8), [0.06, 0, -0.14], [PI / 2, 0, 0])]), black);
    return { b, s };
  });
  const sleeves = [1, -1].map((s) => { const sl = pv(bodyG, [s * 0.24, 1.62, 0]); mk(sl, G.segY(0.5, 0.07, 0.05, 5), robe, null, null); return sl; });
  let beatK = 0, lastSt = '';
  return {
    parts: { head, hand: hinge },
    height: 2.4, radius: 0.55,
    update(dt, a) {
      const c = common(ctx, a, dt, 0, 0);
      const st = c.st, deadK = smooth(c.dead);
      if (st !== lastSt) { if (st === 'hop') beatK = 1; lastSt = st; }
      beatK = Math.max(0, beatK - dt * 4);
      const hop = st === 'hop' ? Math.sin(clamp(a.t / 0.28, 0, 1) * PI) : 0;
      const snip = st === 'snip' ? a.t : -1;
      // hover bob, jump on the beat, squash when landing
      hover.position.y = hop * 0.28 + Math.sin(c.tm * 2) * 0.02 * (1 - hop) - deadK * 0.05;
      bodyG.scale.set(1 + beatK * 0.06, 1 - beatK * 0.08 + hop * 0.05, 1 + beatK * 0.06);
      bodyG.rotation.set(hop * 0.25 + (snip >= 0 ? keys(snip, [[0, 0], [0.25, 0.2], [0.5, 0.1], [0.7, 0]]) : 0) + c.stun * 0.2, 0, c.stun * Math.sin(c.tm * 3) * 0.1);
      skinM.color.setScalar(0.75 + beatK * 0.6);
      head.rotation.set(-beatK * 0.15, Math.sin(c.tm * 0.4) * 0.3 * (st === 'idle' ? 1 : 0), Math.sin(c.tm * 0.9) * 0.1);
      clap.rotation.z = beatK > 0.7 ? 0 : 0.5 * (1 - beatK) * (st === 'snip' ? 0 : 1);
      // blades: open wider while hopping (telegraph), slam shut on the snip
      let open = 0.35 + Math.sin(c.tm * 1.3) * 0.05;
      if (st === 'hop') open = 0.35 + hop * 0.55;
      if (snip >= 0) open = keys(snip, [[0, 0.9], [0.22, 1.0], [0.3, 0.02], [0.6, 0.02], [0.7, 0.35]]);
      open = lerp(open, 0.6, deadK);
      for (const B of blades) B.b.rotation.set(0.15, B.s * open * 0.5, 0);
      hinge.rotation.x = -0.15 + (snip >= 0 ? keys(snip, [[0, -0.3], [0.28, 0.35], [0.7, 0]]) : 0);
      for (let i = 0; i < 2; i++) sleeves[i].rotation.set(-1.1, 0, (i ? -1 : 1) * 0.35);
      ctx.body.rotation.x = -PI * 0.46 * deadK * deadK;
    },
  };
}

// ------------------------------------------------------------------ TAMAGOTCHI (maneater): baby console -> adult
function tamaFace(mood) {
  return screenTex('tama_' + mood, 32, 24, (c, w, h) => {
    c.fillStyle = mood === 'angry' ? '#5a1010' : '#9cb88a'; c.fillRect(0, 0, w, h);
    c.fillStyle = mood === 'angry' ? '#ff4040' : '#1e2a18';
    const px = (x, y, ww = 2, hh = 2) => c.fillRect(x, y, ww, hh);
    if (mood === 'happy') { px(9, 8); px(21, 8); for (let x = 10; x < 23; x++) px(x, 15 + Math.round(Math.sin(((x - 10) / 12) * PI) * 3), 1, 2); px(26, 4, 2, 2); px(28, 4, 2, 2); px(26, 6, 4, 2); px(27, 8, 2, 1); }
    else if (mood === 'cry') { px(8, 9, 4, 1); px(20, 9, 4, 1); px(9, 11, 1, 5); px(22, 11, 1, 6); for (let x = 12; x < 21; x++) px(x, 18 - Math.round(Math.sin(((x - 12) / 8) * PI) * 3), 1, 2); }
    else { px(8, 7, 5, 2); px(19, 7, 5, 2); px(10, 9); px(20, 9); for (let x = 8; x < 25; x += 2) px(x, 16 + (x % 4 ? 0 : 2), 2, 2); }
  });
}
function buildTamagotchi(ctx) {
  const shellM = lam('#ff9ac8', { map: tex('tamaShell', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#ff9ccb', 0.06, 2); c.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 14; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 2, 2); }) });
  const btn = lam('#ffe04a'), dark = lam('#2a2230', { map: noiseTex('tamaAdult', '#2a2230', 0.2) }), bone = lam('#f0e4d8');
  const faces = { happy: bas('#ffffff', { map: tamaFace('happy') }), cry: bas('#ffffff', { map: tamaFace('cry') }), angry: bas('#ffffff', { map: tamaFace('angry') }) };
  // ---- baby
  const baby = pv(ctx.body, [0, 0, 0], null, 'baby');
  const egg = pv(baby, [0, 0.3, 0]);
  mk(egg, merged('ta_egg', () => [xf(G.sph(1, 10, 8), [0, 0, 0], [0, 0, 0], [0.22, 0.27, 0.15])]), shellM);
  const screen = mk(egg, G.plane(0.2, 0.15), faces.happy, [0, 0.05, 0.152]);
  mk(egg, merged('ta_btn', () => [xf(G.sph(0.028, 5, 4), [-0.07, -0.13, 0.12]), xf(G.sph(0.028, 5, 4), [0, -0.15, 0.125]), xf(G.sph(0.028, 5, 4), [0.07, -0.13, 0.12])]), btn);
  mk(egg, merged('ta_chain', () => [xf(G.tor(0.05, 0.012, 3, 8), [0, 0.3, 0]), xf(G.segY(0.1, 0.006, 0.006, 3), [0.12, 0.25, 0], [0, 0, -0.5]), xf(G.sph(0.02, 4, 3), [0.17, 0.33, 0])]), lam('#c0c0c8'));
  const eyeM = ctx.eye('#fff2a0');
  mk(egg, G.sph(0.018, 4, 3), eyeM, [0.17, 0.33, 0]);
  const feet = [1, -1].map((s) => { const f = pv(baby, [s * 0.09, 0.05, 0.02]); mk(f, merged('ta_foot', () => [xf(G.sph(1, 6, 4), [0, 0, 0.02], [0, 0, 0], [0.05, 0.045, 0.07])]), shellM); return f; });
  const tearM = ctx.own(basI('#60c8ff', { transparent: true, opacity: 0.9 }));
  const tears = [1, -1].map((s) => mk(egg, G.box(0.018, 0.03, 0.01), tearM, [s * 0.06, 0, 0.16]));
  // ---- adult: long-limbed thing wearing the cracked shell as jaws
  const adult = pv(ctx.body, [0, 0, 0], null, 'adult');
  const A = humanoid({ body: adult }, 'taa', { leg: dark, arm: dark, hand: bone }, { hipY: 1.08, hipW: 0.14, thigh: 0.55, shin: 0.52, legR: 0.07, shW: 0.26, shY: 0.55, uarm: 0.55, farm: 0.5, armR: 0.055, neckY: 0.62 });
  mk(A.spine, merged('taa_torso', () => [xf(G.cyl(0.2, 0.12, 0.7, 7), [0, 0.3, 0], [0, 0, 0], [1, 1, 0.75]), ...[0, 1, 2, 3].map((i) => xf(G.box(0.3 - i * 0.03, 0.03, 0.05), [0, 0.15 + i * 0.13, -0.14]))]), dark);
  mk(A.spine, merged('taa_ribs', () => [0, 1, 2].map((i) => xf(G.tor(0.17 - i * 0.015, 0.012, 3, 8, PI), [0, 0.2 + i * 0.12, 0.02], [0, 0, 0])) ), bone);
  const upperJ = pv(A.head, [0, 0.1, 0.02]), lowerJ = pv(A.head, [0, 0.1, 0.02]);
  mk(upperJ, merged('taa_upper', () => [xf(G.sph(1, 10, 6, 0, TAU, 0, PI / 2), [0, 0, 0.06], [0, 0, 0], [0.22, 0.26, 0.24])]), shellM);
  mk(upperJ, merged('taa_uteeth', () => { const t = []; for (let i = 0; i < 9; i++) { const ang = PI * (0.1 + 0.8 * i / 8); t.push(xf(G.cone(0.018, 0.07, 3), [Math.cos(ang) * 0.19, -0.03, 0.06 + Math.sin(ang) * 0.2], [PI, 0, 0])); } return t; }), bone);
  mk(lowerJ, merged('taa_lower', () => [xf(G.sph(1, 10, 5, 0, TAU, PI / 2, PI / 2), [0, 0, 0.06], [0, 0, 0], [0.2, 0.18, 0.22])]), shellM);
  const aScreen = mk(upperJ, G.plane(0.16, 0.12), faces.angry, [0, 0.12, 0.27], [-0.4, 0, 0]);
  void aScreen;
  const aEye = ctx.eye('#ff3050');
  mk(upperJ, merged('taa_eyes', () => [xf(G.sph(0.025, 4, 3), [0.1, 0.06, 0.24]), xf(G.sph(0.025, 4, 3), [-0.1, 0.06, 0.24])]), aEye);
  adult.visible = false;
  return {
    parts: { head: egg, mouth: lowerJ },
    height: 0.6, radius: 0.35,
    update(dt, a) {
      const st = a.state;
      const grown = st !== 'morph' && (a.progress >= 1 || ['run', 'crouch', 'lunge', 'recover'].includes(st)) ? 1 : 0;
      const morph = st === 'morph' ? clamp(a.t / 3, 0, 1) : grown;
      const c = common(ctx, a, dt, grown ? 1.6 : 0.8, grown ? 7 : 1.5);
      const deadK = smooth(c.dead);
      // morph: the baby shakes and swells, then the adult unfolds out of it
      const babyK = 1 - ramp(morph, 0.55, 0.8);
      const adultK = ramp(morph, 0.55, 1);
      baby.visible = babyK > 0.01; adult.visible = adultK > 0.01;
      if (baby.visible) {
        const cry = st === 'cry', rocked = st === 'rocked';
        screen.material = st === 'morph' ? faces.angry : cry ? faces.cry : rocked ? faces.happy : (Math.sin(c.tm * 0.3) > -0.7 ? faces.happy : faces.cry);
        const ph = ctx.gait(c.speed, 0.35, dt);
        const amp = clamp(c.speed / 0.8, 0, 1) * c.alive;
        const shake = (cry ? Math.sin(c.tm * 30) * 0.06 : 0) + (st === 'morph' ? Math.sin(c.tm * 55) * 0.12 * morph : 0);
        const sway = rocked ? Math.sin(c.tm * 3) * 0.3 : 0;
        egg.position.set(shake * 0.3, 0.3 + Math.abs(Math.sin(ph)) * 0.05 * amp + (cry ? Math.abs(Math.sin(c.tm * 8)) * 0.03 : 0), 0);
        egg.rotation.set(Math.sin(ph) * 0.1 * amp - c.stun * 0.3, 0, shake + sway + Math.sin(ph * 2) * 0.12 * amp);
        for (let i = 0; i < 2; i++) feet[i].position.set((i ? -1 : 1) * 0.09, 0.05 + Math.max(0, Math.sin(ph + i * PI)) * 0.05 * amp, 0.02);
        for (let i = 0; i < 2; i++) { const u = (c.tm * 1.6 + i * 0.5) % 1; tears[i].visible = cry; tears[i].position.set((i ? -1 : 1) * (0.06 + u * 0.08), -0.02 - u * 0.22, 0.14); }
        baby.scale.setScalar((1 + morph * 1.2) * babyK + 0.001);
        baby.rotation.x = PI * 0.5 * deadK * babyK;
      }
      if (adult.visible) {
        adult.scale.setScalar(lerp(0.3, 1, adultK));
        const run = ctx.w('run', st === 'run', 6, dt);
        const crouch = st === 'crouch' ? smooth(a.t / 0.6) : 0;
        const lunge = st === 'lunge' ? 1 : 0;
        const rec = st === 'recover' ? Math.exp(-a.t * 3) : 0;
        const ph = ctx.gait(c.speed, lerp(1.6, 2.6, run), dt);
        const amp = clamp(c.speed / 1.5, 0, 1) * c.alive * (1 - crouch) * (1 - lunge);
        gaitLegs(A, ph, amp, 0.7, 1.1);
        for (const L of A.legs) { L.hip.rotation.x += -crouch * 1.1 - lunge * 0.3; L.knee.rotation.x += crouch * 1.9 + lunge * 0.2; }
        A.hips.position.y = 1.08 - crouch * 0.45 - lunge * 0.2 + Math.abs(Math.sin(ph)) * 0.05 * amp;
        A.spine.rotation.set(0.45 + run * 0.25 + crouch * 0.5 + lunge * 0.6 - rec * 0.3 + c.stun * 0.3, 0, c.stun * Math.sin(c.tm * 2.5) * 0.15);
        A.neck.rotation.set(-0.3 - crouch * 0.5 - lunge * 0.5, Math.sin(c.tm * 0.8) * 0.25 * (1 - run), (st === 'morph' ? Math.sin(c.tm * 40) * 0.2 : 0));
        const open = lunge ? 1 : crouch ? 0.5 + Math.sin(c.tm * 30) * 0.1 : 0.15 + Math.max(0, Math.sin(c.tm * 2)) * 0.15 + run * 0.2;
        upperJ.rotation.x = -open * 0.6; lowerJ.rotation.x = open * 0.7;
        for (const Ar of A.arms) {
          const sw = (Ar.s > 0 ? Math.sin(ph) : -Math.sin(ph)) * 0.8 * amp;
          Ar.sh.rotation.set(lerp(-0.4 + sw, -1.9, lunge) - crouch * 0.6, 0, Ar.s * (0.15 + crouch * 0.3));
          Ar.el.rotation.x = lerp(-0.5, -0.1, lunge) - crouch * 0.4;
        }
        adult.rotation.x = PI * 0.47 * deadK * deadK;
        adult.position.y = 0.12 * deadK;
      }
    },
  };
}

// ------------------------------------------------------------------ PARASOCIAL (ghost girl): only its victim sees it
function phoneTex(mode) {
  return screenTex('phone_' + mode, 16, 32, (c, w, h) => {
    c.fillStyle = mode === 'rec' ? '#140204' : '#ffd8ec'; c.fillRect(0, 0, w, h);
    if (mode === 'rec') {
      c.fillStyle = '#ff1a1a'; c.beginPath(); c.arc(4, 4, 2, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(7, 3, 7, 2);
      c.fillStyle = '#ff2020'; c.beginPath(); c.ellipse(8, 17, 6, 4, 0, 0, TAU); c.fill();
      c.fillStyle = '#000'; c.beginPath(); c.arc(8, 17, 2.5, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#ff3a8a';
      const heart = (x, y) => { c.fillRect(x, y + 1, 5, 2); c.fillRect(x + 1, y + 3, 3, 1); c.fillRect(x + 2, y + 4, 1, 1); c.fillRect(x, y, 2, 1); c.fillRect(x + 3, y, 2, 1); };
      heart(1, 12); heart(9, 12);
      c.fillStyle = '#6a1a3a'; for (let x = 4; x < 12; x++) c.fillRect(x, 21 + Math.round(Math.sin(((x - 4) / 7) * PI) * 2), 1, 1);
    }
  });
}
function buildStalker(ctx) {
  const hoodie = lam('#b8aed0', { map: stripeTex('psHood', '#bcb2d4', '#a49ac0', 3, 0.05) });
  const skin = lam('#ecdcd8', { flat: false }), hair = lam('#0c0a0e'), jeans = lam('#2a2e44');
  const R = humanoid(ctx, 'ps', { leg: jeans, arm: hoodie, boot: lam('#e8e8ee'), hand: skin }, { hipY: 0.84, hipW: 0.08, thigh: 0.42, shin: 0.4, legR: 0.055, shW: 0.17, shY: 0.45, uarm: 0.27, farm: 0.25, armR: 0.045, neckY: 0.54 });
  mk(R.spine, merged('ps_torso', () => [xf(G.lathe('ps_torso', [[0.001, -0.05], [0.16, -0.05], [0.17, 0.18], [0.18, 0.42], [0.1, 0.54], [0.001, 0.55]], 8), [0, 0, 0], [0, 0, 0], [1, 1, 0.72]), xf(G.sph(1, 6, 4, 0, TAU, 0, PI / 2), [0, 0.5, -0.06], [-0.4, 0, 0], [0.16, 0.14, 0.12])]), hoodie);
  mk(R.head, G.sph(0.11, 9, 7), skin, [0, 0.11, 0.01], null, [0.9, 1.1, 0.95]);
  mk(R.head, merged('ps_hair', () => [xf(G.sph(1, 8, 5, 0, TAU, 0, PI * 0.6), [0, 0.13, -0.01], [0, 0, 0], [0.12, 0.13, 0.12]), ...[-0.08, -0.04, 0, 0.04, 0.08].map((x) => xf(G.box(0.045, 0.42, 0.03), [x, -0.05, -0.08 - Math.abs(x) * 0.2], [0.12, 0, x]))]), hair);
  const eyeM = ctx.eye('#050505', '#ff1010');
  mk(R.head, merged('ps_eyes', () => [xf(G.sph(0.022, 5, 4), [0.04, 0.13, 0.095], [0, 0, 0], [1, 1.3, 0.5]), xf(G.sph(0.022, 5, 4), [-0.04, 0.13, 0.095], [0, 0, 0], [1, 1.3, 0.5])]), eyeM);
  mk(R.head, merged('ps_smile', () => [xf(G.box(0.09, 0.012, 0.01), [0, 0.06, 0.1]), xf(G.box(0.012, 0.02, 0.01), [0.045, 0.07, 0.098]), xf(G.box(0.012, 0.02, 0.01), [-0.045, 0.07, 0.098])]), lam('#5a0a10'));
  // phone held up in front of the face, filming you
  const phone = pv(R.spine, [0, 0.62, 0.2], null, 'phone');
  mk(phone, G.box(0.08, 0.15, 0.012), lam('#111114'));
  const heartScr = bas('#ffffff', { map: phoneTex('heart') }), recScr = bas('#ffffff', { map: phoneTex('rec') });
  const scr = mk(phone, G.plane(0.07, 0.135), heartScr, [0, 0, 0.007]);   // screen faces the victim
  const flashM = ctx.own(basI('#ffffff', { transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  flashM.userData.noTint = true;
  const flash = mk(phone, G.circle(0.012, 6), flashM, [0.025, 0.055, 0.011]);
  return {
    parts: { head: R.head, hand: phone },
    height: 1.75, radius: 0.35,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.3, 5.5);
      const st = c.st;
      const chase = ctx.w('chase', st === 'chase', 6, dt);
      const reveal = st === 'reveal' ? smooth(a.t / 2.2) : 0;
      const lower = Math.max(reveal, chase);                     // the phone comes down: now you see its face
      scr.material = lower > 0.5 ? recScr : heartScr;
      flash.visible = Math.sin(c.tm * 6) > 0.6 || lower > 0.5;
      const ph = ctx.gait(c.speed, lerp(1.1, 1.9, chase), dt);
      const amp = clamp(c.speed / 1.3, 0, 1) * c.alive;
      gaitLegs(R, ph, amp, lerp(0.4, 0.75, chase), lerp(0.5, 1.1, chase));
      R.hips.position.y = 0.84 + Math.abs(Math.sin(ph)) * 0.03 * amp + Math.sin(c.tm * 1.1) * 0.01;
      R.spine.rotation.set(chase * 0.2, Math.sin(c.tm * 0.5) * 0.05, Math.sin(c.tm * 0.7) * 0.04 * (1 - chase));
      // the head tilt: a little too far
      R.neck.rotation.set(0.1 * (1 - lower), 0, lerp(Math.sin(c.tm * 0.35) * 0.25, 0.95, lower));
      phone.position.set(lerp(0, 0.18, lower), lerp(0.62, 0.3, lower), lerp(0.2, 0.18, lower));
      phone.rotation.set(lerp(0, 0.4, lower), 0, lerp(0, 0.3, lower));
      for (const A of R.arms) {
        const sw = (A.s > 0 ? Math.sin(ph) : -Math.sin(ph)) * 0.7 * amp * chase;
        A.sh.rotation.set(lerp(-1.5, 0.1 + sw, lower), 0, A.s * lerp(0.3, 0.08, lower));
        A.el.rotation.x = lerp(-1.2, -0.15, lower);
      }
    },
  };
}

// ------------------------------------------------------------------ CLICKBAIT (kidnapper fox): outdoor
function thumbTex() {
  return screenTex('thumb', 48, 32, (c, w, h) => {
    c.fillStyle = '#ffe000'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff2a00'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3);
    // shocked face
    c.fillStyle = '#f0c090'; c.beginPath(); c.arc(14, 17, 9, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.fillRect(9, 12, 4, 4); c.fillRect(15, 12, 4, 4);
    c.fillStyle = '#000'; c.fillRect(10, 13, 2, 2); c.fillRect(16, 13, 2, 2);
    c.beginPath(); c.ellipse(14, 21, 3, 4, 0, 0, TAU); c.fill();
    // big red arrow + "!!"
    c.fillStyle = '#ff1a1a';
    c.beginPath(); c.moveTo(40, 6); c.lineTo(30, 20); c.lineTo(35, 20); c.lineTo(32, 28); c.lineTo(44, 14); c.lineTo(39, 14); c.closePath(); c.fill();
    c.fillRect(26, 4, 2, 7); c.fillRect(26, 13, 2, 2); c.fillRect(29, 4, 2, 7); c.fillRect(29, 13, 2, 2);
  });
}
const _tz = new THREE.Vector3(0, 0, 1), _tq = new THREE.Quaternion(), _td = new THREE.Vector3();
function buildClickbait(ctx) {
  const fur = lam('#c8561c', { map: tex('cbFur', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#c8581e', 0.18, 2); c.fillStyle = 'rgba(60,20,5,0.4)'; for (let i = 0; i < 20; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 1, 3); }) });
  const cream = lam('#f0e0c0'), dark = lam('#3a1a0c');
  const torso = pv(ctx.body, [0, 0.62, 0], null, 'torso');
  mk(torso, merged('cb_body', () => [xf(G.sph(1, 9, 6), [0, 0, 0], [0, 0, 0], [0.26, 0.24, 0.55]), xf(G.sph(1, 7, 4), [0, -0.08, 0.1], [0, 0, 0], [0.2, 0.16, 0.4])]), fur);
  mk(torso, merged('cb_belly', () => [xf(G.sph(1, 7, 4), [0, -0.12, 0.1], [0, 0, 0], [0.18, 0.1, 0.38])]), cream);
  const legs = [];
  for (const [z, fore] of [[0.36, true], [-0.36, false]]) for (const s of [1, -1]) {
    const hip = pv(torso, [s * 0.15, -0.1, z]);
    mk(hip, G.segY(0.3, 0.06, 0.045, 5), fur);
    const knee = pv(hip, [0, -0.3, 0]);
    mk(knee, merged('cb_shin', () => [xf(G.segY(0.26, 0.04, 0.03, 5)), xf(G.box(0.07, 0.04, 0.11), [0, -0.27, 0.03])]), dark);
    legs.push({ hip, knee, fore, s });
  }
  const tail = [];
  let tp = pv(torso, [0, 0.1, -0.52], [0.7, 0, 0]);
  for (let i = 0; i < 3; i++) {
    mk(tp, merged('cb_tail' + i, () => [xf(G.sph(1, 6, 4), [0, 0, -0.15], [0, 0, 0], [0.12 - i * 0.015, 0.12 - i * 0.015, 0.2])]), i === 2 ? cream : fur);
    tail.push(tp);
    tp = pv(tp, [0, 0, -0.28]);
  }
  const neck = pv(torso, [0, 0.12, 0.5], [0.3, 0, 0], 'neck');
  mk(neck, G.segZ(0.22, 0.1, 0.08, 6), fur);
  const head = pv(neck, [0, 0.06, 0.24], [-0.3, 0, 0], 'head');
  mk(head, merged('cb_frame', () => [xf(G.box(0.46, 0.32, 0.08), [0, 0.1, 0])]), lam('#1a1a1a'));
  const thumbM = ctx.own(basI('#ffffff', { map: thumbTex() }));
  thumbM.userData.noTint = true;
  const thumb = mk(head, G.plane(0.42, 0.28), thumbM, [0, 0.1, 0.041]);
  void thumb;
  mk(head, merged('cb_ears', () => [xf(G.cone(0.06, 0.16, 4), [0.15, 0.32, -0.02], [0, 0, -0.3]), xf(G.cone(0.06, 0.16, 4), [-0.15, 0.32, -0.02], [0, 0, 0.3])]), fur);
  mk(head, merged('cb_snout', () => [xf(G.cone(0.07, 0.16, 5), [0, -0.1, 0.06], [PI / 2, 0, 0])]), cream);
  const eyeM = ctx.eye('#ffe040');
  mk(head, merged('cb_eyes', () => [xf(G.box(0.03, 0.02, 0.01), [0.08, 0.3, 0.041]), xf(G.box(0.03, 0.02, 0.01), [-0.08, 0.3, 0.041])]), eyeM);
  // tongue: lives on the root so it can reach a victim anywhere around it
  const tongueP = pv(ctx.root, [0, 0.55, 0.62], null, 'tongue');
  const tongueM = lam('#e0506a', { emissive: '#300810' });
  const tongue = mk(tongueP, G.boxZ(0.07, 0.04, 1), tongueM);
  mk(tongue, G.sph(0.08, 5, 4), tongueM, [0, 0, 1], null, [1, 0.7, 0.4]);
  tongueP.visible = false;
  let tongueLen = 0;
  return {
    parts: { head, mouth: tongueP },
    height: 1.1, radius: 0.6,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.6, 6.5);
      const st = c.st, deadK = smooth(c.dead);
      if (st === 'stalk') c.speed = a.speed ?? 3;
      const hide = ctx.w('hide', st === 'hide', 4, dt);
      const low = ctx.w('low', st === 'stalk' || st === 'aim', 6, dt);
      const aim = st === 'aim' ? a.t : -1;
      const ph = ctx.gait(c.speed, lerp(0.9, 1.6, clamp(c.speed / 6, 0, 1)), dt);
      const amp = clamp(c.speed / 1.5, 0, 1) * c.alive;
      torso.position.y = 0.62 - hide * 0.3 - low * 0.16 + Math.abs(Math.sin(ph)) * 0.04 * amp - deadK * 0.35;
      torso.rotation.set(-low * 0.05 + (aim >= 0 ? -0.08 : 0), 0, deadK * 1.4);
      for (const L of legs) {
        const p = ph + ((L.fore ? 0 : 1) + (L.s > 0 ? 0 : 1)) % 2 * PI;
        const sw = Math.sin(p) * 0.6 * amp, lift = Math.max(0, Math.cos(p)) * amp;
        L.hip.rotation.set(-sw - hide * (L.fore ? 1.1 : -0.9) - low * 0.4, 0, 0);
        L.knee.rotation.x = lift * 0.9 + hide * (L.fore ? -1.2 : 1.9) + low * 0.8;
      }
      tail.forEach((t, i) => t.rotation.set((i ? 0.2 : 0.7) - hide * 0.5, Math.sin(c.tm * (2 + amp * 5) + i) * (0.3 + low * 0.3), 0));
      neck.rotation.x = 0.3 + hide * 0.5 - low * 0.2;
      head.rotation.set(-0.3 - hide * 0.3, Math.sin(c.tm * 0.6) * 0.3 * (1 - low) * (1 - hide), aim >= 0 ? Math.sin(c.tm * 40) * 0.05 : 0);
      // the thumbnail: dim while hiding, strobes white-hot during the aim (the telegraph)
      let bright = lerp(1, 0.25, hide);
      if (aim >= 0) bright = Math.sin(aim * (14 + aim * 30)) > 0 ? 2.2 : 1;
      if (st === 'drag') bright = 1.3;
      thumbM.color.setScalar(bright * (1 - deadK * 0.8));
      // tongue towards the victim (a.aim, model-local)
      const want = (st === 'tongue' || st === 'drag') && a.aim ? 1 : 0;
      tongueP.visible = want > 0 || tongueLen > 0.05;
      if (a.aim && want) {
        _td.copy(a.aim).sub(tongueP.position);
        const len = _td.length();
        _tq.setFromUnitVectors(_tz, _td.normalize());
        tongueP.quaternion.copy(_tq);
        const target = st === 'tongue' ? len * keys(a.t, [[0, 0], [0.3, 1], [0.35, 1]]) : len;
        tongueLen = damp(tongueLen, target, 30, dt);
      } else tongueLen = damp(tongueLen, 0, 20, dt);
      tongue.scale.set(1, 1, Math.max(0.01, tongueLen));
    },
  };
}

// ------------------------------------------------------------------ REPLY GUY (baboon hawk): outdoor flock
function bubbleTex() {
  return screenTex('bubble', 32, 16, (c, w, h) => {
    c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, w, h - 4); c.fillRect(4, h - 4, 4, 3); c.fillRect(6, h - 1, 2, 1);
    c.fillStyle = '#101010'; c.fillRect(8, 5, 3, 3); c.fillRect(14, 5, 3, 3); c.fillRect(20, 5, 3, 3);
  });
}
function buildReplyGuy(ctx) {
  const feath = lam('#5c6068', { map: scaleTex('replyguy', '#60646c', '#3a3d44', '#8a8e96') });
  const skin = lam('#b89078'), beakM = lam('#e8c040'), wingM = lam('#484c54', { side: THREE.DoubleSide, map: stripeTex('rgWing', '#4a4e56', '#2e3036', 6, 0.1) });
  const hips = pv(ctx.body, [0, 0.72, 0], null, 'hips');
  const legs = [1, -1].map((s) => {
    const hip = pv(hips, [s * 0.1, 0, 0]);
    mk(hip, merged('rg_thigh', () => [xf(G.segY(0.4, 0.08, 0.05, 5)), xf(G.sph(1, 5, 4), [0, -0.1, 0], [0, 0, 0], [0.09, 0.14, 0.09])]), feath);
    const knee = pv(hip, [0, -0.4, 0]);
    mk(knee, G.segY(0.42, 0.035, 0.03, 4), skin);
    const ank = pv(knee, [0, -0.42, 0]);
    mk(ank, merged('rg_foot', () => [xf(G.cone(0.02, 0.14, 3), [0.04, -0.03, 0.07], [PI / 2, 0.3, 0]), xf(G.cone(0.02, 0.15, 3), [0, -0.03, 0.08], [PI / 2, 0, 0]), xf(G.cone(0.02, 0.14, 3), [-0.04, -0.03, 0.07], [PI / 2, -0.3, 0]), xf(G.cone(0.015, 0.08, 3), [0, -0.03, -0.05], [-PI / 2, 0, 0])]), skin);
    return { hip, knee, ank, s };
  });
  const spine = pv(hips, [0, 0.05, 0], null, 'spine');
  mk(spine, merged('rg_torso', () => [xf(G.sph(1, 8, 6), [0, 0.28, 0.05], [0.3, 0, 0], [0.22, 0.34, 0.2]), xf(G.cone(0.14, 0.4, 5), [0, 0.02, -0.2], [-2.3, 0, 0])]), feath);
  const neck = pv(spine, [0, 0.55, 0.12], null, 'neck');
  mk(neck, G.segY(0.26, 0.06, 0.07, 5), skin, null, [PI + 0.6, 0, 0]);
  const head = pv(neck, [0, 0.2, 0.14], null, 'head');
  mk(head, merged('rg_head', () => [xf(G.sph(1, 7, 5), [0, 0.04, 0], [0, 0, 0], [0.1, 0.1, 0.12])]), feath);
  const beak = pv(head, [0, 0.02, 0.1]);
  mk(beak, merged('rg_beak', () => [xf(G.cone(0.05, 0.2, 4), [0, 0.01, 0.09], [PI / 2, 0, 0], [1, 0.8, 1])]), beakM);
  const jaw = pv(head, [0, -0.01, 0.1]);
  mk(jaw, merged('rg_jaw', () => [xf(G.cone(0.035, 0.14, 4), [0, -0.01, 0.06], [PI / 2, 0, 0], [1, 0.5, 1])]), beakM);
  const eyeM = ctx.eye('#ffb020');
  mk(head, merged('rg_eyes', () => [xf(G.box(0.02, 0.02, 0.01), [0.055, 0.07, 0.09]), xf(G.box(0.02, 0.02, 0.01), [-0.055, 0.07, 0.09])]), eyeM);
  mk(head, merged('rg_glasses', () => [xf(G.tor(0.03, 0.006, 3, 8), [0.05, 0.07, 0.1]), xf(G.tor(0.03, 0.006, 3, 8), [-0.05, 0.07, 0.1]), xf(G.box(0.04, 0.006, 0.006), [0, 0.075, 0.1])]), lam('#101010'));
  // the "..." speech bubble floating over its head: it is typing a reply
  const bubble = pv(head, [0.12, 0.28, 0]);
  const bubbleM = bas('#ffffff', { map: bubbleTex(), side: THREE.DoubleSide });
  mk(bubble, G.plane(0.26, 0.13), bubbleM);
  const wings = [1, -1].map((s) => {
    const w = pv(spine, [s * 0.18, 0.46, -0.02]);
    const inner = pv(w);
    mk(inner, merged('rg_wing', () => [xf(G.box(0.62, 0.02, 0.26), [0.31, 0, -0.05]), ...[0, 1, 2, 3].map((i) => xf(G.box(0.07, 0.015, 0.34), [0.3 + i * 0.1, -0.005, -0.18], [0, 0.15 * i, 0]))]), wingM, null, null, [s, 1, 1]);
    return { w, s };
  });
  return {
    parts: { head, mouth: jaw },
    height: 1.7, radius: 0.45,
    update(dt, a) {
      const c = common(ctx, a, dt, 1.4, 6);
      const st = c.st, deadK = smooth(c.dead);
      const posture = ctx.w('posture', st === 'posture', 8, dt);
      const run = ctx.w('run', st === 'run' || st === 'flee', 6, dt);
      const atk = st === 'attack' ? keys(a.t, [[0, 0], [0.12, 1], [0.3, 0.6], [0.5, 0]]) : 0;
      const ph = ctx.gait(c.speed, lerp(0.9, 1.6, run), dt);
      const amp = clamp(c.speed / 1.2, 0, 1) * c.alive;
      const s = Math.sin(ph), co = Math.cos(ph);
      for (const L of legs) {
        const p = L.s > 0 ? s : -s, pc = L.s > 0 ? co : -co;
        L.hip.rotation.x = -0.5 - p * 0.5 * amp - posture * 0.2;
        L.knee.rotation.x = 1.1 + Math.max(0, pc) * 0.5 * amp + posture * 0.3;
        L.ank.rotation.x = -0.6 - Math.max(0, pc) * 0.3 * amp;
      }
      hips.position.y = 0.72 + Math.abs(s) * 0.05 * amp - posture * 0.05 - deadK * 0.45;
      spine.rotation.set(0.35 + run * 0.35 - posture * 0.35 + atk * 0.4 + c.stun * 0.3, s * 0.08 * amp, c.stun * Math.sin(c.tm * 3) * 0.1);
      neck.rotation.set(-0.2 - atk * 0.8 + posture * 0.3 + Math.sin(c.tm * (2 + posture * 18)) * 0.05, Math.sin(c.tm * 0.9) * 0.4 * (1 - run) * (1 - posture), 0);
      jaw.rotation.x = posture ? 0.4 + Math.abs(Math.sin(c.tm * 22)) * 0.4 * posture : atk * 0.6 + Math.max(0, Math.sin(c.tm * 1.7)) * 0.1;
      // wings: folded; spread wide + beating when posturing; flapping when fleeing
      const flap = (st === 'flee' ? 1 : posture) * Math.sin(c.tm * (st === 'flee' ? 16 : 10)) * 0.35;
      for (const W of wings) {
        W.w.rotation.set(lerp(0.2, -0.2, posture), W.s * lerp(-1.25, -0.2, posture) - W.s * run * 0.2, W.s * (lerp(-0.2, 0.35, posture) + flap) - W.s * deadK * 0.5);
      }
      // typing... bubble bobs, pulses faster when agitated
      bubble.position.y = 0.28 + Math.sin(c.tm * (3 + posture * 10)) * 0.02;
      bubble.scale.setScalar((1 + posture * 0.4 + atk * 0.2) * (1 - deadK));
      bubble.rotation.y = -head.rotation.y;
      ctx.body.rotation.z = PI * 0.5 * deadK * deadK;
      ctx.body.position.y = 0.2 * deadK;
    },
  };
}

// ------------------------------------------------------------------ registry / factory
const BUILDERS = {
  scuttler: buildScuttler, yoinker: buildYoinker, crawler: buildCrawler, lurker: buildLurker,
  mannequin: buildMannequin, sludge: buildSludge, jester: buildJester, spider: buildSpider,
  leech: buildLeech, screamer: buildScreamer, mimic: buildMimic, hound: buildHound,
  giant: buildGiant, sandkefal: buildSandkefal, turret: buildTurret, mine: buildMine,
  kefaldayi: buildKefaldayi, company: buildCompany,
  moderator: buildModerator, support: buildSupport, ticketswarm: buildTicketSwarm, editor: buildEditor,
  tamagotchi: buildTamagotchi, stalker: buildStalker, clickbait: buildClickbait, replyguy: buildReplyGuy,
};

/**
 * createCreatureModel(id, { elite, seed, suitColor, hat })
 * → { root, parts:{ head, eyes:[materials], carry?, mouth?, barrel?, ... }, height, radius,
 *     update(dt, { state, speed, t, time, progress }), setElite(bool), setHitFlash(v), dispose() }
 */
export function createCreatureModel(id, opts = {}) {
  if (id === 'c32_dormant' || id === 'c32_ram') return createCreature32(id);
  const build = BUILDERS[id];
  if (!build) throw new Error('Unknown creature model: ' + id);
  const ctx = new Ctx(id, opts);
  const def = build(ctx, opts);
  const tinter = new Tinter(ctx.root);
  let elite = false;
  const api = {
    id,
    root: ctx.root,
    parts: { ...def.parts, eyes: ctx.eyes },
    height: def.height,
    radius: def.radius,
    update(dt, anim = {}) {
      dt = clamp(dt || 0, 0, 0.1);
      ctx.localTime += dt;
      def.update(dt, {
        state: anim.state || 'idle',
        speed: anim.speed ?? null,
        t: anim.t ?? 0,
        time: anim.time ?? ctx.localTime,
        progress: anim.progress ?? 0,
      });
    },
    setElite(b) {
      elite = !!b;
      ctx.body.scale.setScalar(elite ? def.eliteScale ?? 1.12 : 1);
      for (const m of ctx.eyes) m.color.copy(elite ? m.userData.eliteColor : m.userData.baseColor);
      if (elite) tinter.setBase(def.aura || '#2c0606');
      else if (tinter.active) tinter.setBase('#000000');
      if (def.onElite) def.onElite(elite);
    },
    isElite: () => elite,
    // variant / affix glow: emissive tint on every lambert part + eyes in that colour (strong = affix)
    setTint(color, strong = false) {
      const col = new THREE.Color(color);
      tinter.setBase(col.clone().multiplyScalar(strong ? 0.26 : 0.13));
      for (const m of ctx.eyes) m.color.copy(col);
    },
    setHitFlash(v) { tinter.setFlash(v); },
    dispose() {
      if (def.dispose) def.dispose();
      tinter.dispose();
      for (const x of ctx.owned) if (x && x.dispose) x.dispose();
      ctx.owned.length = 0;
    },
  };
  if (opts.elite) api.setElite(true);
  api.update(0, { state: 'idle', time: 0 });
  return api;
}
