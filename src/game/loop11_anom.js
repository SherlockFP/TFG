// LOOP11 - the anomalies. Each one is a reversible mutation of the elements built by loop11_build.js (E): on(E, c) applies it, off(E) restores the baseline exactly,
// tick(E, c) animates it (local, cosmetic: every peer runs the same mutation from the host's pass state, so what the crew sees agrees). Never adds a light.
//   c (on)   = { v: variant (loop11_core variantOf), vs: variant seed, rng }
//   c (tick) = { dt, t, cam, fwd, pl, moving, sprint, snd(name, worldPos, vol, opts), u (player's hall coordinate), inHall }
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { GEO, ANOM_IDS } from './loop11_core.js';
import { DOOR_NUMS, DOOR_ALT } from './loop11_text.js';

const HW = GEO.W / 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _u = new THREE.Vector3();

/** true while the world point `p` is outside the ~55 degree cone around the camera's view (or the camera is far away) */
export function unseen(c, p, cone = 0.55) {
  _u.copy(p).sub(c.cam); const d = _u.length(); if (d < 0.01) return false;
  return _u.multiplyScalar(1 / d).dot(c.fwd) < cone;
}

const off1 = (E) => {
  E.decor.scale.z = 1;
};

export const IMPL = {
  eyes: {
    on(E) { E.eyesOn = true; },
    off(E) { E.eyesOn = false; for (const p of E.mascot.pupils) p.position.set(p.userData.base[0], p.userData.base[1], 0.006); },
    tick(E, c) {
      const g = E.mascot.group; _b.copy(c.cam); g.worldToLocal(_b);
      const len = Math.hypot(_b.x, _b.y - 0.2) || 1, k = 0.055 * Math.min(1, len / 2.5);
      for (const p of E.mascot.pupils) {
        const tx = p.userData.base[0] + (_b.x / len) * k, ty = p.userData.base[1] + ((_b.y - 0.2) / len) * k;
        p.position.x += (tx - p.position.x) * Math.min(1, c.dt * 6); p.position.y += (ty - p.position.y) * Math.min(1, c.dt * 6);
      }
    },
  },
  doornum: {
    on(E, c) { const i = c.v.door, alts = DOOR_ALT.filter((x) => x !== DOOR_NUMS[i]); E.plaques[i].set(alts[c.vs % alts.length]); E.doorNumSet = i; },
    off(E) { if (E.doorNumSet != null) E.plaques[E.doorNumSet].set(DOOR_NUMS[E.doorNumSet]); E.doorNumSet = null; },
  },
  coworker: {
    on(E) { const g = E.cow.group; g.visible = true; g.position.set(E.cow.base.u, 0, E.cow.base.v); g.rotation.y = 0; },
    off(E) { E.cow.group.visible = false; },
    tick(E, c) {
      const g = E.cow.group; g.getWorldPosition(_a); _a.y += 1.5;
      if (!c.inHall) return;
      const dx = c.cam.x - _a.x, dz = c.cam.z - _a.z;
      if (Math.hypot(dx, dz) < 1.4 || !unseen(c, _a)) return;     // he never moves while you can see him
      const want = Math.atan2(dx, dz); let d = want - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += Math.sign(d) * Math.min(Math.abs(d), c.dt * 5);
    },
  },
  breath: {
    on(E) { E.breathOn = true; },
    off(E) { E.breathOn = false; for (const e of E.emitters) e.intensity = e.base; E.panelMat.color.setHex(0xf2f6e8); },
    tick(E, c) {
      const f = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(c.t * 1.25));
      for (const e of E.emitters) e.intensity = e.base * f;
      E.panelMat.color.setHex(0xf2f6e8).multiplyScalar(0.3 + 0.7 * f);
    },
  },
  notice: { on(E, c) { E.notice.set(c.v.alt); }, off(E) { E.notice.set(-1); } },
  wetsign: {
    on(E, c) { const s = [[26.5, -0.9, 1.2], [8.4, 0.9, -0.4], [20.5, 0.0, 2.4]][c.v.spot]; E.wet.group.position.set(s[0], 0, s[1]); E.wet.group.rotation.y = s[2]; },
    off(E) { const b = E.wet.base; E.wet.group.position.set(b.u, 0, b.v); E.wet.group.rotation.y = b.ry; },
  },
  extinguisher: { on(E) { E.ext.rotation.z = Math.PI; }, off(E) { E.ext.rotation.z = 0; } },
  clock: { on(E) { E.clockRev = true; }, off(E) { E.clockRev = false; } },
  steps: {
    on(E) { E.steps = { d: 4.6, cd: 0, still: 0, n: 0 }; },
    off(E) { E.steps = null; },
    tick(E, c) {
      const s = E.steps; if (!s || !c.inHall || c.u < 12) return;
      s.cd -= c.dt;
      if (c.moving) { s.still = 0; s.d = Math.min(4.6, s.d + c.dt * 0.4); } else s.still += c.dt;
      if (s.cd > 0) return;
      const stopped = s.still > 1.1;
      if (stopped && s.d <= 1.5) return;                       // it stands right behind you now, and stops
      s.cd = c.moving ? (c.sprint ? 0.33 : 0.5) : 0.62;
      if (stopped) s.d = Math.max(1.5, s.d - 0.8);
      s.n++;
      _a.set(c.pl.x - s.d, c.pl.y + 0.1, c.pl.z + Math.sin(s.n * 1.7) * 0.25);
      c.snd('loop_step', _a, 0.55 + 0.3 * (1 - s.d / 4.6), { refDistance: 2.5, maxDistance: 22, pitch: 0.92 + (s.n % 3) * 0.05 });
    },
  },
  lowceil: {
    on(E, c) { const g = E.lowceil; g.visible = true; g.children[0].scale.x = 14; g.position.x = c.v.u0 + 7; },
    off(E) { E.lowceil.visible = false; },
  },
  carpet: { on(E, c) { E.carpet.visible = true; E.carpet.position.set(c.v.u, 0.013, (c.v.u % 2) * 0.4 - 0.2); }, off(E) { E.carpet.visible = false; } },
  shadow: {
    on(E, c) { const s = E.shadow; s.visible = true; E.shadowU = c.v.u; E.shadowWall = c.v.wall; s.rotation.y = c.v.wall > 0 ? Math.PI : 0; s.position.set(c.v.u, 0.95, c.v.wall * (HW - 0.02)); },
    off(E) { E.shadow.visible = false; },
    tick(E, c) {
      const s = E.shadow; s.getWorldPosition(_a);
      if (c.inHall && unseen(c, _a, 0.35) && Math.abs(c.u - E.shadowU) > 2.6) E.shadowU += Math.sign(c.u - E.shadowU) * c.dt * 0.55;   // creeps closer while unwatched
      s.position.x = E.shadowU;
    },
  },
  posters: { on(E, c) { E.postersHid = c.vs % 3; E.posters[E.postersHid].mesh.visible = false; }, off(E) { for (const p of E.posters) p.mesh.visible = true; } },
  cooler: {
    on(E) { const m = E.cooler.bottleMat; m.color.setHex(0xb01818); m.emissive.setHex(0x3a0606); m.opacity = 0.92; E.coolerOn = true; E.coolerT = 0; },
    off(E) { const m = E.cooler.bottleMat; m.color.setHex(0x8fc8ff); m.emissive.setHex(0x10303f); m.opacity = 0.8; E.coolerOn = false; },
    tick(E, c) {
      E.coolerT -= c.dt; if (E.coolerT > 0) return; E.coolerT = 1.4 + (Math.sin(c.t * 3.1) + 1) * 0.6;
      E.cooler.group.getWorldPosition(_a); _a.y += 1.1;
      if (_a.distanceTo(c.cam) < 12) c.snd('loop_gurgle', _a, 0.5, { refDistance: 2, maxDistance: 14, pitch: 0.9 + 0.2 * Math.sin(c.t) });
    },
  },
  ajar: {
    on(E, c) {
      const d = E.doors[c.v.door], u = d.u; E.ajarDoor = c.v.door; E.ajarT = 2;
      d.pivot.rotation.y = 0.55; E.doorGlow.glow.visible = true; E.doorGlow.strip.visible = true;
      E.doorGlow.glow.position.set(u + 0.15, 0.014, HW - 0.75); E.doorGlow.strip.position.set(u + 0.1, 1.05, HW - 0.032);
    },
    off(E) { if (E.ajarDoor != null) E.doors[E.ajarDoor].pivot.rotation.y = 0; E.ajarDoor = null; E.doorGlow.glow.visible = false; E.doorGlow.strip.visible = false; },
    tick(E, c) {
      E.ajarT -= c.dt; const k = 0.75 + 0.25 * Math.sin(c.t * 7) * Math.sin(c.t * 2.3); E.doorGlow.strip.scale.y = 0.98 + 0.02 * k; E.doorGlow.glow.material.opacity = 0.35 + 0.25 * k;
      if (E.ajarT > 0) return; E.ajarT = 6.5;
      const d = E.doors[E.ajarDoor]; if (!d) return;
      _a.set(E.ox + d.u, c.pl.y + 1.2, E.oz + HW - 0.3);
      if (_a.distanceTo(c.cam) < 11) c.snd('loop_murmur', _a, 0.45, { refDistance: 2, maxDistance: 14 });
    },
  },
  ceileyes: {
    on(E, c) { E.ceilHole.group.visible = true; E.ceilHole.group.position.x = c.v.u; },
    off(E) { E.ceilHole.group.visible = false; },
    tick(E, c) {
      const u0 = E.ceilHole.group.position.x, near = c.inHall && Math.abs(c.u - u0) < 4;
      const ph = c.t * (near ? 0.9 : 0.4), blink = (ph % 1) > (near ? 0.86 : 0.93);
      E.ceilHole.eyes[0].visible = !blink; E.ceilHole.eyes[1].visible = !(((ph + 0.08) % 1) > (near ? 0.86 : 0.93));
    },
  },
  mirror: { on(E) { E.decor.scale.z = -1; }, off: off1 },
  exitred: { on(E) { E.exitFar.mat.map = E.exitFar.red; E.exitFar.mat.needsUpdate = true; }, off(E) { E.exitFar.mat.map = E.exitFar.green; E.exitFar.mat.needsUpdate = true; } },
};
export const IMPL_IDS = Object.keys(IMPL);
void ANOM_IDS; void RNG;

/** the always-on baseline life: the wall clock (second hand, tick), driven from the module's update */
export function baseTick(E, c) {
  const step = Math.floor(c.t), k = Math.PI / 30;
  E.clock.sec.rotation.z = (E.clockRev ? 1 : -1) * step * k;
  if (step !== E.lastSec) {
    E.lastSec = step;
    E.clock.group.getWorldPosition(_a);
    if (c.inHall && _a.distanceTo(c.cam) < 9) c.snd('loop_tick', _a, 0.3, { refDistance: 1.5, maxDistance: 11, pitch: E.clockRev ? 0.85 : 1 });
  }
}
