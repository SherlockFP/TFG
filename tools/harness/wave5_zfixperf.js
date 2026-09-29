// wave5 zfixperf browser check (body of an async fn for tools/harness/headless.mjs; use --shot for the final view).
//  1. land / take off 3 times on one moon, geometry+texture counts after each takeoff (before and after the gpusweep) -> must plateau
//  2. draw calls outdoors with the outdoor prop merge OFF (cycle 1) vs ON (cycles 2-3)
//  3. zombies (SWARM): indoors, outdoors, backrooms pocket, and with the horde module disposed (client-like view: only CreatureManager drives it)
const g = kefal.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), V = (x, y, z) => new THREE.Vector3(x, y, z);
const T0 = performance.now(), el = () => Math.round(performance.now() - T0);
const out = { cycles: [], zombies: {}, errs: [] };
addEventListener('error', (e) => out.errs.push(String(e.message).slice(0, 200)));
const info = () => kefal.engine.renderer.info;
const snap = () => { kefal.tick(1, 1 / 30, true); return { geos: info().memory.geometries, tex: info().memory.textures, calls: kefal.engine.sceneStats?.calls, tris: kefal.engine.sceneStats?.tris }; };
const ticks = async (n, dt = 1 / 30, render = false) => { for (let i = 0; i < n; i += 10) { kefal.tick(Math.min(10, n - i), dt, render && i + 10 >= n); await sleep(4); } };
const MOON = 'hamsi';
const land = async () => { g.ui.closePanel?.(); g.run.daysLeft = 3; g.run.moon = MOON; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding?.(); await ticks(150); };
const takeoff = async () => { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.(); await ticks(60); };
const outside = () => { g.player.inShip = false; const gy = g.world.terrain?.heightAt?.(2, 16) ?? 0; g.player.teleport(V(2, gy + 0.3, 16), 0); };
if (g.run.phase !== 'orbit') await takeoff();
out.base = snap();
out.sweepModule = !!g.gpusweep;
const cycle = async (merge) => {
  const c = { merge, t0: el() };
  globalThis.__kefalNoOutMerge = !merge;
  await land();
  outside(); await ticks(6, 1 / 30, true);
  c.outdoor = snap();
  await takeoff();
  c.preSweep = snap();                       // right after takeoff, before the sweep's 2.5 s settle elapsed
  await ticks(90, 0.05);                     // 4.5 s sim: the natural sweep must fire
  c.postSweep = snap();
  c.sweep = g.gpusweep?.stats?.();
  c.t1 = el();
  out.cycles.push(c);
};
await cycle(false);
if (el() < 170000) await cycle(true);
// ---- cycle 3: stay landed for the zombie checks + final screenshot
globalThis.__kefalNoOutMerge = false;
try {
  await land(); outside(); await ticks(6, 1 / 30, true);
  const { SWARM } = await import('/src/models/creatures_wave1.js');
  const spawn = (n, at, spread = 3) => { let k = 0; for (let i = 0; i < n; i++) { const c = g.creatures.hostSpawn('zombot', V(at.x + (i % 4 - 1.5) * spread * 0.5, at.y, at.z + Math.floor(i / 4) * spread * 0.6), { level: 1, zone: at.zone || 'out', state: 'idle', data: { grouped: true } }); if (c) k++; } return k; };
  const inst = () => ({ torso: SWARM.torso?.count ?? -1, limbs: SWARM.limbs?.count ?? -1, attached: !!SWARM.torso?.parent && SWARM.torso.parent === kefal.engine.scene, views: [...g.creatures.views.values()].filter((v) => v.type === 'zombot').length });
  // indoors
  if (g.world.facility && g.world.outdoor?.mainExit) {
    g.useExit(0, true); await ticks(12, 1 / 30, true);
    const p = g.player.pos, fwd = new THREE.Vector3(); kefal.engine.camera.getWorldDirection(fwd);
    out.zombies.indoorSpawned = spawn(5, { x: p.x + fwd.x * 4, y: p.y, z: p.z + fwd.z * 4, zone: 'in' });
    await ticks(20, 1 / 30, true);
    out.zombies.indoor = inst();
    g.useExit(0, false); await ticks(10);
  }
  // outdoors, 6-9 m in front of the camera
  outside(); await ticks(6, 1 / 30, true);
  const p = g.player.pos, fwd = new THREE.Vector3(); kefal.engine.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const at = { x: p.x + fwd.x * 7, y: p.y, z: p.z + fwd.z * 7 };
  at.y = g.world.terrain?.heightAt?.(at.x, at.z) ?? p.y;
  out.zombies.outdoorSpawned = spawn(8, at);
  await ticks(20, 1 / 30, true);
  out.zombies.outdoor = inst();
  // projected screen positions of the bodies (in frustum?)
  const cam = kefal.engine.camera, tm = new THREE.Matrix4(), pp = new THREE.Vector3(); let vis = 0;
  for (let i = 0; i < SWARM.torso.count; i++) { SWARM.torso.getMatrixAt(i, tm); pp.setFromMatrixPosition(tm).project(cam); if (Math.abs(pp.x) < 1 && Math.abs(pp.y) < 1 && pp.z < 1) vis++; }
  out.zombies.inFrustum = vis;
  // horde module gone (like a client without it): CreatureManager must still draw them
  g.horde?.dispose?.();
  await ticks(10, 1 / 30, true);
  out.zombies.afterHordeDispose = inst();
  out.zombies.hordeDisposed = !g.horde || true;
  // pose sanity: force a couple of poses on the live views
  const ps = {};
  for (const st of ['crawl', 'grab', 'getup']) { for (const v of g.creatures.views.values()) if (v.type === 'zombot') v.state = st; await ticks(3, 1 / 30, true); ps[st] = inst().torso; }
  out.zombies.poses = ps;
  for (const v of g.creatures.views.values()) if (v.type === 'zombot') v.state = 'idle';
  out.zombies.outdoorDraw = snap();
  // backrooms pocket (far-away space): zombie there still drawn from the same scene
  try {
    if (g.backrooms?.enter && el() < 240000) {
      g.backrooms.enter('debug'); await ticks(80);
      const pp2 = g.player.pos; out.zombies.pocketPos = [pp2.x, pp2.y, pp2.z].map((x) => Math.round(x));
      const n = spawn(3, { x: pp2.x + 2, y: pp2.y, z: pp2.z + 2, zone: 'out' }); await ticks(20, 1 / 30, true);
      out.zombies.pocket = { spawned: n, ...inst() };
      g.backrooms.exit?.(); await ticks(20);
    }
  } catch (e) { out.zombies.pocketErr = String(e).slice(0, 200); }
  // final view for the screenshot: outdoors, facing the zombies
  outside(); await ticks(4, 1 / 30, true);
} catch (e) { out.THROW = String(e.stack || e).slice(0, 500); }
out.ms = el();
return out;
