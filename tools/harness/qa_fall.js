// QA night 1: fall check. Real landing (hostLever, ~9 s), stand still 10 s in the ship, then 10 s outside next to the ship. Samples player y.
const g = kefal.game, out = [], errs = []; addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yOf = () => +g.player.pos.y.toFixed(2);
for (const m of ['hamsi', 'levrek']) {
  const r = { m, samples: [], minY: 1e9, outside: [] };
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId);
  const t0 = performance.now();
  while (g.run.phase !== 'moon' && performance.now() - t0 < 30000) { r.minY = Math.min(r.minY, yOf()); await sleep(100); }
  r.landedAfterMs = Math.round(performance.now() - t0); r.phase = g.run.phase;
  r.yAtLanding = yOf(); r.theme = g.world.facility?.layout?.theme;
  for (let i = 0; i < 20; i++) { await sleep(500); const y = yOf(); r.samples.push(y); r.minY = Math.min(r.minY, y); }
  r.inShipAfter = g.player.inShip; r.dead = g.player.dead;
  const tx = 0, tz = 9; const gy = g.world.terrain?.heightAt?.(tx, tz);
  r.terrainY = gy == null ? null : +gy.toFixed(2);
  g.player.teleport(new THREE.Vector3(tx, (gy ?? 0) + 1.2, tz)); g.player.inShip = false;
  for (let i = 0; i < 20; i++) { await sleep(500); const y = yOf(); r.outside.push(y); r.minY = Math.min(r.minY, y); }
  r.outsideDead = g.player.dead;
  out.push(r);
  g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await sleep(1500);
}
return { out, errs };
