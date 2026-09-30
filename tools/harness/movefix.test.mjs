// wave 8 movefix: (1) standing still must not bounce at any refresh rate, (2) mantle / vault plans + LocalPlayer integration.
// node tools/harness/movefix.test.mjs
import * as THREE from 'three';
const { initPhysics, Physics } = await import('../../src/physics/physics.js');
await initPhysics();
const { LocalPlayer } = await import('../../src/entities/localplayer.js');
const { probeLedge } = await import('../../src/entities/mantle.js');
const { rampQuat } = await import('../../src/world/stairs.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const noop = () => {};

function mk(setup, start, yaw = 0) {
  const physics = new Physics(); physics.addStaticBox(0, -0.5, 0, 40, 0.5, 40); setup?.(physics);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420);
  const log = { sfx: [], toast: [] };
  const game = {
    physics, camera, settings: { fov: 72, headBob: true, reduceMotion: false }, ui: { toast: (m) => log.toast.push(m) },
    engine: { camera, fx: { punch: new THREE.Vector3(), shake: 0 }, punch: noop, shake: noop, setLowHealth: noop, beat: noop, hurtFrom: noop },
    stats: { maxHp: 100, maxStamina: 100, staminaRegen: 10, speedMul: 1, jumpMul: 1, carryRelief: 0, crit: 0 },
    sfx: (n) => log.sfx.push(n), footstep: noop, hasPerk: () => false, damageLocal: noop, items: { get: () => null }, audio: { play: () => null },
    world: { facility: null, terrain: null }, onExhausted: noop, time: 0,
  };
  const p = new LocalPlayer(game); p.teleport(new THREE.Vector3(...start), yaw);
  return { p, physics, game, log };
}
function inputOf(down = [], jump = false) {
  return { consumeMouse: () => ({ dx: 0, dy: 0 }), isDown: (a) => down.includes(a), pressed: (a) => jump && a === 'jump', mouseDown: () => false };
}
const still = inputOf();

// Shelter holds position while preserving look; other frozen scenes still lock look.
{
  const { p, physics } = mk(null, [0, .03, 0]);
  p.frozen = true; p.hiding = true;
  const peek = { ...inputOf(['forward', 'sprint']), consumeMouse: () => ({ dx: .03, dy: -.01 }) };
  for (let i = 0; i < 10; i++) { p.update(1 / 60, peek); physics.step(1 / 60); }
  ok(Math.hypot(p.pos.x, p.pos.z) < .01, 'shelter keeps WASD movement held');
  ok(p.crouch && p.yaw < -.2 && p.pitch > .05, 'shelter lets crouched players look around');
  const yaw = p.yaw; p.hiding = false;
  p.update(1 / 60, peek);
  ok(p.yaw === yaw, 'ordinary frozen states still hold camera look');
}

// ---- 1. idle bounce -------------------------------------------------------------------------------------------------------------------
function idleRange(setup, start, fps, noPropagate = false) {
  const { p, physics } = mk(setup, start);
  if (noPropagate) physics.world.propagateModifiedBodyPositionsToColliders = undefined;   // negative control: the pre-fix behaviour
  const dt = 1 / fps; let lo = 1e9, hi = -1e9, ungrounded = 0;
  for (let T = 0; T < 5; T += dt) {
    p.update(dt, still); physics.step(dt);
    if (T > 3) { const y = p.camera.position.y; lo = Math.min(lo, y); hi = Math.max(hi, y); if (!p.grounded) ungrounded++; }
  }
  return { mm: (hi - lo) * 1000, ungrounded };
}
const flat = () => {};
const slope = (ph) => ph.addStaticBox(10, 0, 0, 10, 0.25, 4, rampQuat(1, 0, 25 * Math.PI / 180));
const steps = (ph) => { for (let i = 0; i < 12; i++) ph.addStaticBox(10 + i * 0.3, i * 0.1 + 0.1, 0, 0.15, (i + 1) * 0.1, 2); };
for (const fps of [60, 144, 240]) {
  for (const [nm, su, st] of [['flat', flat, [0, 0.05, 0]], ['slope', slope, [10, 3, 0]], ['stairs', steps, [11.5, 2, 0]]]) {
    const r = idleRange(su, st, fps);
    ok(r.mm < 5 && r.ungrounded === 0, `idle ${nm} @${fps} Hz: camera range ${r.mm.toFixed(2)} mm, ungrounded ${r.ungrounded}`);
  }
}
{ const r = idleRange(flat, [0, 0.05, 0], 144, true); ok(r.mm > 20, `negative control (no collider sync) @144 Hz bounces: ${r.mm.toFixed(0)} mm`); }

// ---- 2. mantle / vault ------------------------------------------------------------------------------------------------------------------
const ledge = (h, depth = 1.5) => (ph) => ph.addStaticBox(0, h / 2, -0.8 - depth / 2, 2, h / 2, depth / 2);   // front face at z = -0.8, player at 0 facing -z
const plan = (h) => { const { p, physics } = mk(ledge(h), [0, 0.02, 0]); physics.world.step(); return probeLedge(physics, p.pos, 0, {}); };
ok(plan(0.3) === null, 'step 0.3 m: no mantle (autostep handles it)');
ok(plan(0.8)?.kind === 'mantle', 'ledge 0.8 m: mantle');
ok(plan(1.4)?.kind === 'mantle', 'ledge 1.4 m: mantle');
ok(plan(2.2) === null, 'wall 2.2 m: no mantle');
ok(plan(1.8) === null, 'ledge 1.8 m: out of reach');

function runMantle(setup, { start = [0, 0.02, 0], keys = [], frames = 90, mod } = {}) {
  const { p, physics, log } = mk(setup, start); mod?.(p, log);
  let st0 = p.stamina, st1 = p.stamina, t0 = -1, t1 = -1, noise = 0;
  for (let i = 0; i < frames; i++) {
    const jump = i === 3;
    p.update(1 / 60, inputOf(i < 3 ? [] : keys, jump)); physics.step(1 / 60);
    if (i === 2) st0 = p.stamina;
    if (p.mantle && t0 < 0) { t0 = i; st1 = p.stamina; }
    if (p.mantle) noise = Math.max(noise, p.noise);
    if (!p.mantle && t0 >= 0 && t1 < 0) t1 = i;
  }
  return { p, log, dur: t0 >= 0 && t1 >= 0 ? (t1 - t0) / 60 : -1, cost: st0 - st1, noise, started: t0 >= 0 };
}
{
  const r = runMantle(ledge(1.2), { mod: (p) => { p.stamina = 60; } });
  ok(r.started && r.dur >= 0.3 && r.dur <= 0.55, `mantle 1.2 m lasts ${r.dur.toFixed(2)} s`);
  ok(Math.abs(r.p.pos.y - 1.2) < 0.06 && r.p.pos.z < -0.8 && r.p.grounded, `mantle ends standing on top (y ${r.p.pos.y.toFixed(2)}, z ${r.p.pos.z.toFixed(2)})`);
  ok(r.cost > 5 && r.noise >= 0.5, `stamina cost ${r.cost.toFixed(1)}, noise ${r.noise.toFixed(2)}`);
}
// sprint at an obstacle and press jump as soon as a plan exists
function sprintJump(setup) {
  const { p, physics } = mk(setup, [0, 0.02, 3.5]);
  let kind = null, exit = 0;
  for (let i = 0; i < 240; i++) {
    const pl = probeLedge(physics, p.pos, 0, { sprint: true });
    p.update(1 / 60, inputOf(['forward', 'sprint'], !!pl && !p.mantle)); physics.step(1 / 60);
    if (p.mantle && !kind) kind = p.mantle.kind;
    if (kind && !p.mantle) { exit = p.vel.z; break; }
  }
  return { p, kind, exit };
}
{
  const r = sprintJump(ledge(0.8));
  ok(r.kind === 'mantle' && r.p.pos.z < -0.8 && r.exit < -4, `sprint into a 0.8 m block keeps the run: ${r.kind}, z ${r.p.pos.z.toFixed(2)}, exit ${r.exit.toFixed(1)} m/s`);
}
{
  const r = sprintJump((ph) => ph.addStaticBox(0, 0.45, -0.85, 3, 0.45, 0.05));   // thin fence 0.9 m
  ok(r.kind === 'vault' && r.p.pos.z < -0.9 && r.exit < -4, `sprint vault over a fence: z ${r.p.pos.z.toFixed(2)}, exit speed ${r.exit.toFixed(1)} m/s`);
}
{
  const r = runMantle(ledge(1.2), { mod: (p) => { p.game.items.get = () => ({ type: 'sledge' }); p.slots[0] = 'x'; } });
  ok(!r.started && r.log.toast.length === 1 && r.cost < 8.5, `two-handed loot: no mantle, comic toast (${r.log.toast[0]})`);
}
{
  const r = runMantle(ledge(1.2), { mod: (p) => { p.stamina = 6; } });
  ok(!r.started, 'too tired: no mantle');
}
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
