// wave5 zfixperf: land/take off on two alternating moons x2 (4 landings). Geometry/texture counts after each takeoff must plateau.
const g = kefal.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), V = (x, y, z) => new THREE.Vector3(x, y, z);
const T0 = performance.now(), el = () => Math.round(performance.now() - T0);
const out = { cycles: [], errs: [] };
addEventListener('error', (e) => out.errs.push(String(e.message).slice(0, 200)));
const info = () => kefal.engine.renderer.info;
const snap = () => { kefal.tick(1, 1 / 30, true); return { geos: info().memory.geometries, tex: info().memory.textures, calls: kefal.engine.sceneStats?.calls }; };
const ticks = async (n, dt = 1 / 30, render = false) => { for (let i = 0; i < n; i += 10) { kefal.tick(Math.min(10, n - i), dt, render && i + 10 >= n); await sleep(3); } };
const land = async (m) => { g.ui.closePanel?.(); g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding?.(); await ticks(120); };
const takeoff = async () => { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.(); await ticks(60); };
if (g.run.phase !== 'orbit') await takeoff();
out.base = snap(); out.base.phase = g.run.phase;
for (const m of ['hamsi', 'levrek', 'hamsi', 'levrek']) {
  if (el() > 200000) { out.cut = true; break; }
  const c = { m, t: el() };
  await land(m);
  c.phaseLanded = g.run.phase; c.moonId = g.world.moonId;
  g.player.inShip = false; g.player.teleport(V(2, (g.world.terrain?.heightAt?.(2, 16) ?? 0) + 0.3, 16), 0); await ticks(4, 1 / 30, true);
  c.landed = snap();
  await takeoff();
  c.phaseAfter = g.run.phase; c.moonIdAfter = g.world.moonId;
  c.preSweep = snap();
  await ticks(90, 0.05);
  c.postSweep = snap(); c.sweep = g.gpusweep?.stats?.();
  out.cycles.push(c);
}
out.ms = el();
return out;
