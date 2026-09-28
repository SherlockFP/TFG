// Offline (node + Rapier wasm) walking-smoothness measurement with the REAL LocalPlayer + Physics classes and the same sub-stepping loop
// as Game.update, on a flat floor, legacy vs fixed (player.fpLegacy + dt smoothing).   node tools/harness/fpbody_walk_offline.mjs
import * as THREE from 'three';
const { initPhysics, Physics } = await import('../../src/physics/physics.js');
await initPhysics();
const { LocalPlayer } = await import('../../src/entities/localplayer.js');
const { makeDtSmoother } = await import('../../src/game/fpbody_grip.js');
const f = (v, d = 4) => +(+v).toFixed(d);

function build() {
  const physics = new Physics();
  physics.addStaticBox(0, -0.5, 0, 80, 0.5, 80);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420);
  const noop = () => {};
  const game = {
    physics, camera, settings: { fov: 72, headBob: true, reduceMotion: false },
    engine: { camera, fx: { punch: new THREE.Vector3(), shake: 0 }, punch: noop, shake: noop, setLowHealth: noop, beat: noop, hurtFrom: noop },
    stats: { maxHp: 100, maxStamina: 100, staminaRegen: 10, speedMul: 1, jumpMul: 1, carryRelief: 0, crit: 0 },
    sfx: noop, footstep: noop, hasPerk: () => false, damageLocal: noop, items: { get: () => null }, audio: { play: () => null }, world: { facility: null, terrain: null },
    onExhausted: noop, time: 0,
  };
  const p = new LocalPlayer(game);
  p.teleport(new THREE.Vector3(-20, 0.05, 0), -Math.PI / 2);   // facing +x
  return { game, p, physics };
}
const input = { consumeMouse: () => ({ dx: 0, dy: 0 }), isDown: (a) => a === 'forward', pressed: () => false, mouseDown: () => false };

function run({ legacy, jitterMs, spikeP, lipH, frames = 420, seed = 20260928 }) {
  const { game, p, physics } = build();
  p.fpLegacy = legacy;
  const smooth = makeDtSmoother();
  let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let lip = null;
  if (lipH) lip = physics.addStaticBox(-20 + 6, lipH / 2, 0, 0.25, lipH / 2, 3.4, 0);   // 6 m ahead, across the walk
  let nSteps = 0; const ws = physics.world.step.bind(physics.world); physics.world.step = () => { nSteps++; return ws(); };
  const fwd = [], cy = [], steps = [], lipRec = []; let stall = 0, stallEv = 0, inStall = false;
  let prev = null;
  for (let i = 0; i < frames; i++) {
    let dt = 1 / 60 + (rnd() - 0.5) * 2 * jitterMs / 1000;
    if (spikeP && rnd() < spikeP) dt = 0.03 + rnd() * 0.012;
    if (!legacy) dt = smooth(dt);
    game.time += dt;
    // Game.update: local player sub-steps, then physics
    const n = Math.min(3, Math.max(1, Math.ceil(dt * 30 - 1e-3)));
    nSteps = 0;
    for (let k = 0; k < n; k++) p.update(dt / n, input);
    physics.step(dt);
    const c = game.camera.position;
    if (prev) {
      if (i >= 50 && i < 50 + 240) { fwd.push(c.x - prev.x); cy.push(c.y - prev.y); steps.push(nSteps); const sl = p.hSpeed < 3; if (sl) { stall++; if (!inStall) stallEv++; } inStall = sl; }
      if (lipH && i > 80) lipRec.push(Math.abs(c.y - prev.y));
    }
    prev = c.clone();
  }
  const mean = fwd.reduce((a, b) => a + b, 0) / fwd.length, sd = Math.sqrt(fwd.reduce((a, b) => a + (b - mean) ** 2, 0) / fwd.length);
  const med = [...fwd].sort((a, b) => a - b)[fwd.length >> 1];
  const sc = [0, 0, 0, 0]; for (const n of steps) sc[Math.min(3, n)]++;
  return { stalledFrames: stall, stallEvents: stallEv, fwdMeanCm: f(mean * 100, 3), fwdStdCm: f(sd * 100, 3), cvPct: f(100 * sd / mean, 2), off15pct: fwd.filter((v) => Math.abs(v - med) > 0.15 * med).length, off30pct: fwd.filter((v) => Math.abs(v - med) > 0.3 * med).length, camYjumpMaxCm: f(Math.max(...cy.map(Math.abs)) * 100, 2), physicsStepsPerFrame: { 0: sc[0], 1: sc[1], 2: sc[2], '3+': sc[3] }, lipMaxCameraJumpCm: lipH ? f(Math.max(...lipRec) * 100, 2) : undefined };
}

const out = {};
for (const [name, cfg] of [['fixed 60 Hz', { jitterMs: 0, spikeP: 0 }], ['+-2.5 ms frame-time jitter', { jitterMs: 2.5, spikeP: 0 }], ['+-2.5 ms jitter + 2% 30-42 ms spikes', { jitterMs: 2.5, spikeP: 0.02 }]]) {
  out[name] = { legacy: run({ legacy: true, ...cfg }), fixed: run({ legacy: false, ...cfg }) };
}
out.ledges = {};
for (const h of [0.015, 0.03, 0.06, 0.10]) {
  const a = run({ legacy: true, jitterMs: 0, spikeP: 0, lipH: h, frames: 200 }), b = run({ legacy: false, jitterMs: 0, spikeP: 0, lipH: h, frames: 200 });
  out.ledges[`${h * 100} cm step`] = { legacyMaxCameraJumpPerFrameCm: a.lipMaxCameraJumpCm, fixedMaxCameraJumpPerFrameCm: b.lipMaxCameraJumpCm };
}
console.log(JSON.stringify(out, null, 1));
