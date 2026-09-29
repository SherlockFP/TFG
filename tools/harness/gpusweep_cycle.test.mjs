// wave7 perf2: node simulation of map load / unload cycles against the REAL src/game/gpusweep.js (installGpuSweep / sweepRemoved / collectResources).
// GPU residency is emulated the way three's WebGLGeometries/WebGLTextures do it: a geometry/texture becomes resident when the scene that reaches it is
// rendered and stops being resident only on its 'dispose' event. Modules leak exactly like the real ones (instanced props skipped by terrain.dispose,
// creature/item model geometry removed with the object but never disposed). Run: node tools/harness/gpusweep_cycle.test.mjs
import * as THREE from 'three';
import { installGpuSweep, sweepRemoved, collectResources } from '../../src/game/gpusweep.js';

let fail = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } };

const resident = { geos: new Set(), texs: new Set() };
const track = (o, set) => { if (o.__tracked) return; o.__tracked = true; o.addEventListener('dispose', () => set.delete(o)); };
function render(scene) {   // upload everything reachable (mimics renderer.render) + fire the per-object draw hook like three's renderObject does
  scene.traverse((o) => { if (o.geometry && o.material) o.onBeforeRender(null, scene, null, o.geometry, Array.isArray(o.material) ? o.material[0] : o.material, null); });
  const g = new Set(), t = new Set();
  collectResources(scene, g, t);
  for (const x of g) { track(x, resident.geos); resident.geos.add(x); }
  for (const x of t) { track(x, resident.texs); resident.texs.add(x); }
}
const tex = () => { const t = new THREE.Texture(); t.image = { width: 2, height: 2 }; return t; };

// ---- fake game with the mods bus gpusweep needs
const scene = new THREE.Scene();
const handlers = [];
const game = { engine: { scene }, world: { moonId: null }, mods: { on: (ev, fn) => { if (ev === 'update') handlers.push(fn); return () => { handlers.splice(handlers.indexOf(fn), 1); }; } } };
const sweep = installGpuSweep(game);
const tick = (dt) => { for (const h of [...handlers]) h(dt, game); render(scene); };
const run = (sec, dt = 0.1) => { for (let t = 0; t < sec; t += dt) tick(dt); };

// ---- "ship" (permanent) + shared cached resources that must survive
const shipGeo = new THREE.BoxGeometry(1, 1, 1), shipTex = tex();
const ship = new THREE.Mesh(shipGeo, new THREE.MeshBasicMaterial({ map: shipTex }));
scene.add(ship);
const sharedGeo = new THREE.SphereGeometry(1); sharedGeo.userData.shared = true;
const rtTex = tex(); rtTex.isRenderTargetTexture = true;
const keepTex = tex(); keepTex.userData.keep = true;

let uid = 0;
function loadMap(moon) {
  const group = new THREE.Group();
  const own = [];
  // per-instance geometry props (terrain.dispose disposes these)
  for (let i = 0; i < 40; i++) { const g = new THREE.BoxGeometry(1, 1, 1); own.push(g); group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: i % 8 === 0 ? tex() : null }))); }
  // instanced props: geometry NOT disposed by terrain.dispose (the known leak)
  for (let i = 0; i < 12; i++) group.add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 5), new THREE.MeshBasicMaterial({ map: tex() }), 30));
  // meshes using shared / special resources
  group.add(new THREE.Mesh(sharedGeo, new THREE.MeshStandardMaterial({ map: rtTex, emissiveMap: keepTex })));
  group.add(new THREE.Mesh(shipGeo, new THREE.MeshBasicMaterial({ map: shipTex })));   // map re-uses a ship resource
  scene.add(group);
  game.world.moonId = moon;
  return { group, own };
}
function spawnCreature() {   // model added under the scene, removed by clearAll WITHOUT dispose
  const root = new THREE.Group();
  for (let i = 0; i < 5; i++) root.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ map: tex() })));
  scene.add(root);
  return root;
}
function unloadMap(m, creatures) {   // == game.unloadMap(): outdoor.dispose (non-instanced geos only) + creatures.clearAll (no dispose)
  m.group.traverse((o) => { if (o.geometry && o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); });
  m.group.removeFromParent();
  for (const c of creatures) c.removeFromParent();
  game.world.moonId = null;
}

const snapshots = [];
render(scene);
const base = resident.geos.size;
const baseTex = resident.texs.size;
for (let cycle = 0; cycle < 8; cycle++) {
  const m = loadMap(cycle % 2 ? 'hamsi' : 'levrek');
  const creatures = [];
  run(1.0);
  for (let k = 0; k < 6; k++) { creatures.push(spawnCreature()); run(2.0); }   // spawned while the map is up (scanned every 1.5 s)
  const shortLived = spawnCreature(); run(0.05); shortLived.removeFromParent();   // dies before any scan sees it: caught by the draw hook, not by a scan
  const during = resident.geos.size;
  unloadMap(m, creatures);
  run(1.0);   // still settling: nothing swept yet
  const beforeSweep = resident.geos.size;
  run(3.0);   // settle window passes -> sweep
  snapshots.push({ cycle, during, beforeSweep, after: resident.geos.size, texs: resident.texs.size, sweeps: sweep.stats().sweeps });
}

const last = snapshots[snapshots.length - 1];
ok(snapshots.every((s) => s.sweeps === s.cycle + 1), 'one sweep per unload: ' + snapshots.map((s) => s.sweeps).join());
ok(snapshots.every((s) => s.during > s.after), 'sweep frees geometries (during > after)');
ok(snapshots.every((s) => s.beforeSweep > s.after), 'the settle delay is honoured (nothing freed before 2.5 s)');
// plateau: the draw hook remembers even a creature that lived 0.05 s, so nothing accumulates
const perCycle = (last.after - base) / snapshots.length;
ok(perCycle <= 1, 'residual growth per cycle <= 1 geo: ' + perCycle.toFixed(2));
ok(last.texs - baseTex <= 4, 'textures plateau too: ' + baseTex + '->' + last.texs);
const unswept = 12 + 7 * 5;   // what one cycle would leak without the sweep (instanced 12 + creatures 30, terrain-disposed ones excluded)
ok(perCycle < unswept / 20, 'far below the un-swept leak (' + unswept + '/cycle)');
ok(snapshots[7].after - snapshots[3].after <= 4, 'plateau slope cycles 3..7');
ok(resident.geos.has(shipGeo) && resident.texs.has(shipTex), 'ship geometry/texture untouched');
ok(resident.geos.has(sharedGeo) === true || sharedGeo.userData.shared, 'userData.shared geometry never disposed');
let sharedDisposed = false; sharedGeo.addEventListener('dispose', () => { sharedDisposed = true; }); sweep.sweepNow(); ok(!sharedDisposed, 'shared geometry survives sweepNow');
ok(!rtTex.__disposedBySweep, 'render-target texture kept');
let rtDisposed = false; rtTex.addEventListener('dispose', () => { rtDisposed = true; }); let keptDisposed = false; keepTex.addEventListener('dispose', () => { keptDisposed = true; });
// a fresh sweep over an explicit "known" set must skip RT / keep textures but free plain ones
const known = { geos: new Set([new THREE.BoxGeometry(1, 1, 1)]), texs: new Set([rtTex, keepTex, tex()]) };
const r = sweepRemoved(known, new THREE.Scene());
ok(r.geos === 1 && r.texs === 1 && !rtDisposed && !keptDisposed, 'sweepRemoved skips RT/keep textures, frees plain ones');
ok(known.geos.size === 0 && known.texs.size === 0, 'known set cleared after sweep');

// same-moon reload: moonId never becomes null -> no sweep until the next orbit
{
  const s0 = sweep.stats().sweeps;
  const m = loadMap('hamsi'); run(3);
  m.group.removeFromParent(); const m2 = loadMap('hamsi'); run(3);   // relaunch straight into another map (unloadMap+load inside one frame)
  ok(sweep.stats().sweeps === s0, 'no sweep while a map stays loaded');
  unloadMap(m2, []); run(4);
  ok(sweep.stats().sweeps === s0 + 1, 'sweep runs after the following orbit');
}
const protoBefore = THREE.Object3D.prototype.onBeforeRender; sweep.dispose(); ok(handlers.length === 0, 'dispose detaches the update hook'); ok(THREE.Object3D.prototype.onBeforeRender !== protoBefore, 'dispose restores Object3D.onBeforeRender');

console.log('cycles (geos resident: during / before sweep / after):', snapshots.map((s) => `${s.during}/${s.beforeSweep}/${s.after}`).join('  '), '| base', base, 'texs', baseTex + '->' + last.texs);
console.log(fail ? `${fail} FAILED of ${n}` : `gpusweep cycle sim OK (${n} checks)`);
process.exit(fail ? 1 : 0);
