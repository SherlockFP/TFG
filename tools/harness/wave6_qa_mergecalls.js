// QA: does the outdoor prop merge (terrain.js mergeStaticMeshes, kill switch globalThis.__kefalNoOutMerge) lower draw calls? 2 moons x merge on/off.
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port PORT --script tools/harness/wave6_qa_mergecalls.js --wait 4000
const g = kefal.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), V = (x, y, z) => new THREE.Vector3(x, y, z);
const out = { rows: [], errs: [] };
addEventListener('error', (e) => out.errs.push(String(e.message).slice(0, 200)));
const ticks = async (n, dt = 1 / 30) => { for (let i = 0; i < n; i += 10) { kefal.tick(Math.min(10, n - i), dt, false); await sleep(3); } };
const land = async (m) => { g.ui.closePanel?.(); g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding?.(); await ticks(100); };
const takeoff = async () => { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.(); await ticks(60); };
const meas = () => { const R = kefal.engine.renderer, i = R.info; let best = 0; for (const [x, z] of [[2, 16], [40, -30], [-50, 20]]) { g.player.inShip = false; g.player.teleport(V(x, (g.world.terrain?.heightAt?.(x, z) ?? 0) + 0.3, z), 0); kefal.tick(4, 1 / 30, true); i.autoReset = true; kefal.tick(1, 1 / 30, true); best += i.render.calls; } return Math.round(best / 3); };
if (g.run.phase !== 'orbit') await takeoff();
for (const off of [false, true]) {
  globalThis.__kefalNoOutMerge = off;
  for (const m of ['hamsi', 'levrek']) {
    await land(m);
    out.rows.push({ noMerge: off, m, calls: meas(), geos: kefal.engine.renderer.info.memory.geometries });
    await takeoff();
  }
}
return out;
