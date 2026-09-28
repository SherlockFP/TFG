// Why does the character stall for ~4 frames every second or so on a flat floor? Try controller variants.
import * as THREE from 'three';
const { initPhysics, Physics } = await import('../../src/physics/physics.js');
await initPhysics();
const { LocalPlayer } = await import('../../src/entities/localplayer.js');
const clampY = (v) => (p) => { const o = p.ctrl.computeColliderMovement.bind(p.ctrl); p.ctrl.computeColliderMovement = (c, d, a, b) => { if (d.y < 0 && d.y > -0.03) d.y = v; return o(c, d, a, b); }; };
const L = (fn) => (p) => { p.fpLegacy = true; fn(p); };
const variants = {
  'LEGACY (shipped: vel.y = -1 while grounded)': L(() => {}),
  'FIXED (desired.y = 0 while grounded)': () => {},
  'legacy + desired.y clamped to 0': L(clampY(0)),
  'legacy + desired.y clamped to -3 mm': L(clampY(-0.003)),
  'legacy + desired.y clamped to -1 mm': L(clampY(-0.001)),
  'legacy + autostep off': L((p) => p.ctrl.disableAutostep()),
  'legacy + snap-to-ground off': L((p) => p.ctrl.disableSnapToGround()),
  'legacy + offset 0.01': L((p) => p.ctrl.setOffset?.(0.01)),
  'legacy + offset 0.04': L((p) => p.ctrl.setOffset?.(0.04)),
  'legacy + autostep min width 0.05': L((p) => p.ctrl.enableAutostep(0.42, 0.05, false)),
};
for (const [name, fn] of Object.entries(variants)) {
  const physics = new Physics(); physics.addStaticBox(0, -0.5, 0, 80, 0.5, 80);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420); const noop = () => {};
  const game = { physics, camera, settings: { fov: 72, headBob: true, reduceMotion: false }, engine: { camera, fx: { punch: new THREE.Vector3(), shake: 0 }, punch: noop, shake: noop, setLowHealth: noop, beat: noop, hurtFrom: noop }, stats: { maxHp: 100, maxStamina: 100, staminaRegen: 10, speedMul: 1, jumpMul: 1, carryRelief: 0, crit: 0 }, sfx: noop, footstep: noop, hasPerk: () => false, damageLocal: noop, items: { get: () => null }, audio: { play: () => null }, world: { facility: null, terrain: null }, onExhausted: noop, time: 0 };
  const p = new LocalPlayer(game); p.teleport(new THREE.Vector3(-70, 0.05, 0), -Math.PI / 2);
  try { fn(p); } catch (e) { console.log(name, 'ERR', e.message); continue; }
  const input = { consumeMouse: () => ({ dx: 0, dy: 0 }), isDown: (a) => a === 'forward', pressed: () => false, mouseDown: () => false };
  let stall = 0, stallRuns = 0, inRun = false, minSp = 9, ungr = 0, maxY = 0;
  for (let i = 0; i < 1500; i++) {
    p.update(1 / 60, input); physics.step(1 / 60);
    if (i > 40) {
      const sp = p.hSpeed; minSp = Math.min(minSp, sp);
      if (sp < 3) { stall++; if (!inRun) { stallRuns++; inRun = true; } } else inRun = false;
      if (!p.grounded) ungr++;
      maxY = Math.max(maxY, p.pos.y);
    }
  }
  console.log(name.padEnd(46), 'stalled frames', stall, 'stall events', stallRuns, 'min speed', minSp.toFixed(2), 'ungrounded', ungr, 'max feet y', maxY.toFixed(4), 'end x', p.pos.x.toFixed(1));
}
