// SPAMBOMB model (wave 2, gameplay2): a pop-up-ad creature. A puffy orange "window" body with a title bar and a red X button,
// an angry face on its content area and two stubby feet that never make a sound. It inflates while its fuse burns.
// Model contract (CreatureView): { root, parts, height, radius, update(dt, anim), setElite, setTint, setHitFlash, dispose }.
import * as THREE from 'three';
import { G, lam, basI, tex, noiseFill, mk, pv, Tinter, clamp, TAU, PI } from './modelkit.js';

export function createSpambombModel(opts = {}) {
  const root = new THREE.Group();
  const body = pv(root, null, null, 'scaler');
  const shell = lam('#ff8a2a', { map: tex('sbShell', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#ffffff', 0.16, 2); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, w, 3); }) });
  const bar = lam('#2a63d8'), barDk = lam('#173c8a'), dark = lam('#1c1410'), white = lam('#f4efe6');
  const xBtn = basI('#ff2a2a'); xBtn.userData.noTint = true;
  const eyeM = basI('#fff36a'); eyeM.userData.noTint = true;
  const mouthM = basI('#1a0603'); mouthM.userData.noTint = true;
  const puff = pv(body, [0, 0.5, 0]);                       // everything that swells
  mk(puff, G.sph(0.4, 9, 7), shell, [0, 0, 0], null, [1.05, 0.92, 0.85]);
  // browser-window title bar across the top, with three buttons
  mk(puff, G.box(0.66, 0.11, 0.06), bar, [0, 0.27, 0.28], [-0.5, 0, 0]);
  mk(puff, G.box(0.66, 0.02, 0.07), barDk, [0, 0.215, 0.3], [-0.5, 0, 0]);
  mk(puff, G.box(0.09, 0.08, 0.05), xBtn, [0.26, 0.27, 0.31], [-0.5, 0, 0]);
  mk(puff, G.box(0.07, 0.06, 0.05), white, [0.15, 0.27, 0.31], [-0.5, 0, 0]);
  // face: two mean eyes and a jagged mouth
  const eyes = [1, -1].map((s) => {
    const e = pv(puff, [s * 0.14, 0.08, 0.31]);
    mk(e, G.box(0.13, 0.09, 0.03), white, [0, 0, 0]);
    mk(e, G.box(0.06, 0.06, 0.03), eyeM, [0, -0.005, 0.02]);
    mk(e, G.box(0.17, 0.035, 0.03), dark, [-s * 0.01, 0.075, 0.02], [0, 0, s * 0.42]);   // angry brow
    return e;
  });
  const mouth = pv(puff, [0, -0.1, 0.33]);
  mk(mouth, G.box(0.3, 0.075, 0.03), mouthM, [0, 0, 0]);
  for (let i = -2; i <= 2; i++) mk(mouth, G.box(0.03, 0.05, 0.035), white, [i * 0.058, i % 2 ? -0.012 : 0.012, 0.005]);
  // fuse spike on top (a little antenna that blinks red while primed)
  mk(puff, G.cyl(0.012, 0.018, 0.16, 5), dark, [0.05, 0.44, -0.02], [0, 0, -0.25]);
  const led = basI('#ff2a2a'); led.userData.noTint = true;
  mk(puff, G.sph(0.028, 5, 4), led, [0.085, 0.52, -0.02]);
  // stubby feet
  const feet = [1, -1].map((s) => { const f = pv(body, [s * 0.14, 0.12, 0.02]); mk(f, G.box(0.13, 0.12, 0.2), dark, [0, 0, 0.03]); return f; });
  const tinter = new Tinter(root);
  let ph = (opts.seed || 1) % 7;
  const model = {
    root, parts: { head: puff }, height: 1.1, radius: 0.42,
    update(dt, a = {}) {
      dt = clamp(dt || 0, 0, 0.1);
      const st = a.state || 'idle', t = a.t || 0, time = a.time || 0;
      const moving = st === 'walk' || st === 'run';
      const sp = moving ? (st === 'run' ? 9 : 5) : 0;
      ph = (ph + dt * sp) % TAU;
      const s = Math.sin(ph);
      feet[0].position.y = 0.12 + Math.max(0, s) * 0.09 * (moving ? 1 : 0); feet[1].position.y = 0.12 + Math.max(0, -s) * 0.09 * (moving ? 1 : 0);
      let k = 1, wob = 0;
      if (st === 'primed') { k = 1 + 0.6 * clamp(t / 1.5, 0, 1.1); wob = Math.sin(time * 42) * 0.03 * (0.4 + t); }
      else if (st === 'hesitate') { k = 0.93; wob = Math.sin(time * 30) * 0.05; }
      else if (st === 'dead') { k = Math.max(0.1, 1 - t * 2.4); }
      else if (st === 'run') wob = Math.sin(time * 14) * 0.012;
      const squash = st === 'dead' ? 0.4 : 1;
      puff.scale.set(k + wob, k * squash - wob * 0.6, k + wob);
      puff.position.y = 0.5 + (k - 1) * 0.3 - (st === 'dead' ? t * 0.2 : 0) + (moving ? Math.abs(s) * 0.03 : 0) + Math.sin(time * 2 + ph) * 0.008;
      puff.rotation.z = moving ? s * 0.05 : 0;
      led.color.set(st === 'primed' && Math.sin(time * 30) > 0 ? '#ffffff' : Math.sin(time * 5) > 0.2 ? '#ff2a2a' : '#4a0606');
      const angry = st === 'run' || st === 'primed';
      for (const e of eyes) e.scale.y = angry ? 1.15 : st === 'hesitate' ? 0.5 : 1;
      mouth.scale.set(st === 'primed' ? 1.3 : 1, st === 'primed' ? 2.2 : 1, 1);
    },
    setElite(b) { body.scale.setScalar(b ? 1.15 : 1); if (b) tinter.setBase('#2c0606'); },
    setTint(c, strong) { tinter.setBase(new THREE.Color(c).multiplyScalar(strong ? 0.26 : 0.13)); },
    setHitFlash(v) { tinter.setFlash(v); },
    dispose() { tinter.dispose(); },
  };
  void PI;
  return model;
}

/** Hull Patch: a flat steel plate with rivets and an orange adhesive strip (item model, also used for the icon). */
export function createHullPatchModel() {
  const g = new THREE.Group();
  mk(g, G.box(0.34, 0.03, 0.26), lam('#8d949b'), [0, 0.015, 0]);
  mk(g, G.box(0.36, 0.012, 0.06), lam('#ff8a2a'), [0, 0.034, 0]);
  for (const [x, z] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.1], [0.14, 0.1]]) mk(g, G.cyl(0.02, 0.02, 0.014, 6), lam('#3a3f45'), [x, 0.036, z]);
  mk(g, G.box(0.08, 0.008, 0.05), lam('#e9e2d0'), [0.09, 0.037, -0.02]);
  g.userData.tip = 'Plugs a hull breach.';
  return g;
}

/** register creature / item model factories with the mod model registry (idempotent) */
export function registerCreeperModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.creatureModels) return false;
  if (!mm.creatureModels.has('spambomb')) mm.creatureModels.set('spambomb', (_T, o) => createSpambombModel(o || {}));
  if (mm.itemModels && !mm.itemModels.has('hullpatch')) mm.itemModels.set('hullpatch', () => createHullPatchModel());
  return true;
}
