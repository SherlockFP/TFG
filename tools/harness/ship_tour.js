// Ship interior tour (wave 5 ship_interior): body for tools/harness/headless_shots.mjs.
//   flock /tmp/tfg-browser.lock timeout 900 node tools/harness/headless_shots.mjs --port 5201 --script tools/harness/ship_tour.js --shotdir OUT --wait 4000
// Shots: 12 interior views in orbit (o01..o12), the same 12 landed (l01..l12) + 3 outside (door open / closed / nose). Returns renderer stats per view,
// a dump of every ship.group child with its world AABB (landed + orbit) and the page errors.
const g = kefal.game, out = { errs: [] }; addEventListener('error', (e) => out.errs.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n = 10, dt = 1 / 30) => { kefal.tick(n, dt, false); await wait(5); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAG = window.__TOUR_TAG || 'b';
const ONLY = window.__TOUR_ONLY || null;   // optional array of view names to shoot
const cv = g.engine.renderer.domElement;
for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden';
const cam = g.engine.camera, fov0 = cam.fov, near0 = cam.near;
out.stats = {};
// the page's rAF loop keeps rendering with the player camera: pin our camera inside engine.render while a shot is posed
let pose = null;
const eng = g.engine, render0 = eng.render.bind(eng);
eng.render = (dt) => {
  if (pose) {
    for (const c of cam.children) c.visible = false;   // first-person arms / held item
    const fb = g.scene.getObjectByName('fpbody'); if (fb) fb.visible = false;
    cam.fov = pose.fov; cam.near = pose.near; cam.up.set(...pose.up); cam.updateProjectionMatrix();
    cam.position.set(...pose.pos); cam.lookAt(...pose.look); cam.updateMatrixWorld(true);
  }
  render0(dt);
};
const shot = async (name, pos, look, opts = {}) => {
  if (ONLY && !ONLY.some((k) => name.includes(k))) return;
  g.player.teleport(V(pos[0], (opts.feetY ?? 0.05), pos[2]), 0); g.player.inShip = opts.inShip ?? true;
  await tick(3);
  pose = { pos, look, fov: opts.fov || 70, near: opts.near || near0, up: opts.up || [0, 1, 0] };
  eng.render(1 / 30); eng.render(1 / 30);
  out.stats[name] = { ...eng.sceneStats };
  await wait(60);
  await window.__shot(TAG + '_' + name);
  pose = null; cam.fov = fov0; cam.near = near0; cam.up.set(0, 1, 0); cam.updateProjectionMatrix();
};
const dump = () => {
  const list = []; const b = new THREE.Box3();
  g.ship.group.updateMatrixWorld(true);
  let meshes = 0; g.ship.group.traverse((o) => { if (o.isMesh && o.visible) meshes++; });
  for (const [i, c] of g.ship.group.children.entries()) {
    if (!c.visible) continue;
    b.setFromObject(c); if (b.isEmpty()) continue;
    let n = 0; c.traverse((o) => { if (o.isMesh) n++; });
    const f = (v) => +v.toFixed(2);
    list.push([i, c.name || c.type, n, f(b.min.x), f(b.max.x), f(b.min.y), f(b.max.y), f(b.min.z), f(b.max.z), Object.keys(c.userData || {}).slice(0, 3).join('|')]);
  }
  return { meshes, list };
};
// runtime overlap check: world AABBs of every fixture really installed in ship.group (+ the trophy wall in the scene), pairwise
const runtimeCheck = () => {
  const skip = /^(ship2_(deco|partitions|floor|signs|nose|mount|ladder|spot)|shipFeatures|reactorCore|prop_ship_light|polish4_deco|shipyard_paint)/;
  const b = new THREE.Box3(), list = [];
  g.ship.group.updateMatrixWorld(true);
  const add = (c, name) => { b.setFromObject(c); if (b.isEmpty()) return; const e = 0.02; if (b.min.x < -7 - e || b.max.x > 7 + e || b.min.z < -3.5 - e || b.max.z > 3.5 + e || b.min.y < -0.05 || b.max.y > 3.45) return; list.push({ n: name, x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z }); };
  for (const [i, c] of g.ship.group.children.entries()) { if (!c.visible || skip.test(c.name || '')) continue; add(c, (c.name || c.type) + '#' + i); }
  const tw = g.scene.getObjectByName('c3_trophy_wall'); if (tw) add(tw, 'c3_trophy_wall');
  const E = 0.01, hits = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i], c = list[j]; if (a.x0 < c.x1 - E && a.x1 > c.x0 + E && a.z0 < c.z1 - E && a.z1 > c.z0 + E && a.y0 < c.y1 - E && a.y1 > c.y0 + E) hits.push(a.n + ' x ' + c.n); }
  return { fixtures: list.length, overlaps: hits };
};
const tour = async (p) => {
  const E = 1.62;
  await shot(p + '01_cockpit', [-3.3, E, 0.2], [-7, 1.2, 0]);
  await shot(p + '02_hub_from_cockpit', [-6.3, E, 0.3], [3, 1.3, 0]);
  await shot(p + '03_south_wall', [-1.2, E, -2.9], [-1.2, 1.2, 3.5], { fov: 80 });
  await shot(p + '04_north_wall', [-1.0, E, 3.0], [-1.0, 1.2, -3.5], { fov: 80 });
  await shot(p + '05_engine', [2.3, E, -2.35], [7.0, 1.0, -2.75]);
  await shot(p + '06_cargo', [2.0, E, -1.2], [6.8, 0.8, 2.9]);
  await shot(p + '07_tail_to_nose', [5.6, E, 0.9], [-7, 1.2, 0]);
  await shot(p + '08_up', [0, 1.5, 0.5], [1.0, 3.4, 0.3], { fov: 90 });
  await shot(p + '09_down_door', [1.0, 2.0, 1.2], [2.3, 0, 3.2], { fov: 80 });
  await shot(p + '10_cockpit_south', [-4.6, E, -1.2], [-6.8, 0.9, 3.2]);
  await shot(p + '11_topdown', [0, 10, 0.001], [0, 0, 0], { near: 6.6, up: [0, 0, -1], fov: 55 });
  await shot(p + '12_cockpit_north', [-4.4, E, 1.6], [-6.4, 1.0, -3.4]);
  await shot(p + '16_from_airlock', [2.6, E, 3.05], [-4.5, 1.1, -1.2], { fov: 80 });
};
out.phase0 = g.run.phase;
g.ship.door.setOpen(false, true);
await tick(20);
out.dumpOrbit = dump();
out.runtimeOrbit = runtimeCheck();
if (!window.__TOUR_SKIP_ORBIT) await tour('o');
// ---- land
g.run.quotaIndex = 1; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 14; i++) await tick(10);
out.phase1 = g.run.phase;
await tick(30);
out.dumpLanded = dump();
out.runtimeLanded = runtimeCheck();
await tour('l');
const gy = (() => { try { const h = g.physics.raycast({ x: 8, y: 6, z: 12 }, { x: 0, y: -1, z: 0 }, 30); return h ? h.point.y : -1.8; } catch { return -1.8; } })();
g.ship.door.setOpen(true, true); await tick(5);
await shot('l13_out_door_open', [8, gy + 1.7, 12], [1.5, 0.5, 3.5], { inShip: false, feetY: gy + 0.05 });
g.ship.door.setOpen(false, true); await tick(5);
await shot('l14_out_door_closed', [8, gy + 1.7, 12], [1.5, 0.5, 3.5], { inShip: false, feetY: gy + 0.05 });
g.ship.door.setOpen(true, true); await tick(5);
await shot('l15_out_front', [-13, gy + 2.5, 7], [-2, 1, 0], { inShip: false, feetY: gy + 0.05 });
out.gy = gy;
eng.render = render0;
return out;
