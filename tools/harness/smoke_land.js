// Smoke body for headless.mjs: land on a few moons, tick, take off. Returns per-moon stats + errors.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const res = [];
for (const m of ['hamsi', 'levrek', 'palamut']) {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
  res.push({ m, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size });
  g.player.teleport(new THREE.Vector3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
}
return { res, errs };
