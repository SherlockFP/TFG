// Wave 2 siege proof (body for tools/harness/headless.mjs):
//   flock /tmp/tfg-browser.lock timeout 400 node tools/harness/headless.mjs --port 5252 --script tools/harness/wave2_siege.js
// Part 1 = smoke_land (three moons, no page errors). Part 2 = deployables + SIEGE on 56K-Dialup at quota index 1:
// gating (never before quota 2, contract hook), place a turret + a barricade through the real 'sgplace' path (nav cost
// appears in the flow field and goes away again), start a siege, waves spawn and walk to the ship, the turret shoots,
// the hull takes damage, the siege completes with rewards, everything is cleaned up. Returns a compact checklist.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const out = { smoke: [], checks: {}, nums: {}, notes: [] };
const wait = async (n = 4, dt = 1 / 15) => { for (let i = 0; i < n; i++) { kefal.tick(3, dt, false); await new Promise((r) => setTimeout(r, 2)); } };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = out.checks;
try {
  // ---- part 1: smoke
  for (const m of ['hamsi', 'levrek', 'palamut']) {
    g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
    for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
    out.smoke.push({ m, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size });
    g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); kefal.tick(5, 1 / 30, false);
  }
  out.smokeErrs = errs.slice();

  // ---- part 2: siege
  g.godMode = true;
  C.moduleLoaded = !!g.siege && !!g.deployables;
  C.techRecipes = g.crafting.recipes().filter((r) => r.cat === 'tech').length;
  try { C.techShopTab = !!g.shop.categories().some((c) => c.id === 'tech'); } catch (e) { C.techShopTab = 'n/a ' + e.message; }
  g.run.quotaIndex = 0; g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 20; i++) { kefal.tick(10, 1 / 30, false); await new Promise((r) => setTimeout(r, 10)); }
  C.gateQuota1 = g.siege.tryStart('extraction') === false;        // never before quota 2
  g.run.quotaIndex = 1;
  C.gateAfter = g.siege.riskLines().join(' | ').slice(0, 90);
  const T = g.world.terrain, hy = (x, z) => T.heightAt(x, z);
  const pickSpot = (type, r0) => {
    for (let a = 0.4; a < 6.2; a += 0.35) for (const r of [r0, r0 + 3]) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = hy(x, z);
      if (z > 0 && Math.abs(x - 2.6) < 4) continue;
      if (g.deployables.validate(type, x, y, z, 0).ok) return { x, y, z };
    }
    return null;
  };
  const place = async (type, spot, yaw = 0) => {
    const id = g.items.hostSpawn('dep_' + type, V(spot.x, spot.y + 1, spot.z), { holder: g.selfId });
    await wait(1);
    g.player.teleport(V(spot.x * 0.85, spot.y + 0.4, spot.z * 0.85)); g.psTimer = 0; await wait(2);
    const before = g.deployables.list().length;
    g.net.request('sgplace', { id, x: spot.x, y: spot.y, z: spot.z, yaw });
    await wait(2);
    return { placed: g.deployables.list().length === before + 1, itemGone: !g.items.get(id) || g.items.get(id)._sgUsed === true };
  };
  const spotT = pickSpot('turret1', 13), spotB = pickSpot('barr_wood', 19);
  C.spotsFound = !!spotT && !!spotB;
  const pt = await place('turret1', spotT), pb = await place('barr_wood', spotB, Math.PI / 2);
  C.turretPlaced = pt.placed; C.barricadePlaced = pb.placed;
  const bad = g.deployables.validate('turret1', 2.6, hy(2.6, 6), 6, 0);
  C.doorPathRejected = bad.ok === false && /door|ship/i.test(bad.why);
  g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.psTimer = 0;

  // contract hook -> siege (forced: we are at quota index 1 anyway, prep shortened)
  g.mods.emit('tfg:siege', { reason: 'contract', prep: 3, waves: 3 }, g);
  await wait(6);
  const s0 = g.run.siege;
  C.siegeStarted = !!s0 && s0.phase === 'prep' && s0.waves === 3;
  C.hull0 = s0?.hull;
  await wait(4);
  const bar = g.deployables.list().find((d) => d.type === 'barr_wood');
  C.navBlocked = !!g.siege.flow && !!bar && g.siege.flow.penAt(bar.pos.x, bar.pos.z) >= 25;
  C.secondSiegeRejected = g.siege.tryStart('night') === false;      // max one per day / already running
  // waves
  const sgList = () => [...g.creatures.host.values()].filter((c) => c.type.startsWith('sg_') && !c.dead);
  let spawned = 0, walked = null, dMin = 1e9, hullMin = 100, turretShots = 0, kills0 = g.siege.stats.kills;
  const credits0 = g.run.credits;
  const phases = [];
  for (let i = 0; i < 260 && g.run.siege && g.run.siege.phase !== 'done'; i++) {
    await wait(1, 1 / 10);
    const s = g.run.siege; if (!s) break;
    if (!phases.length || phases[phases.length - 1] !== `${s.phase}${s.wave}`) phases.push(`${s.phase}${s.wave}`);
    const list = sgList(); spawned = Math.max(spawned, list.length);
    if (list.length) { const c = list[0]; const d = Math.hypot(c.pos.x, c.pos.z); if (walked === null) walked = { d0: Math.round(d) }; dMin = Math.min(dMin, ...list.map((q) => Math.hypot(q.pos.x, q.pos.z))); walked.d1 = Math.round(d); }
    hullMin = Math.min(hullMin, s.hull);
    for (const d of g.deployables.list()) if (d.type === 'turret1') turretShots = Math.max(turretShots, d.shots);
    // let wave 1 play for real for a while (turret fights, hull gets hit), then finish waves quickly
    if (i === 60 && bar) { g.deployables.destroy(bar.id, 'destroyed'); C.barricadeDestroyed = true; }
    if (i === 75 && bar && g.siege.flow) C.navRestored = g.siege.flow.penAt(bar.pos.x, bar.pos.z) === 0;
    const realTime = s.wave === 1 && i < 140;
    if (s.phase === 'lull') s.t = 0;
    if (!realTime && s.phase === 'wave') for (const c of list) g.creatures.damage(c.id, 99999, 'test');
  }
  C.phases = phases.join(' > ');
  C.creaturesSpawned = spawned;
  C.walkedToShip = walked;
  C.closestToShip = Math.round(dMin);
  C.turretShots = turretShots;
  C.kills = g.siege.stats.kills - kills0;
  C.hullMin = +hullMin.toFixed(1);
  C.hullDamaged = hullMin < 100;
  const end = g.run.siege;
  C.result = end?.result || null;
  C.creditsGain = g.run.credits - credits0;
  C.raided = end?.raided ?? null;
  await wait(4, 1 / 5);
  // finish + cleanup
  for (let i = 0; i < 90 && g.run.siege; i++) { if (g.run.siege.phase === 'done') g.run.siege.t = 0; await wait(1, 1 / 5); }
  C.siegeCleared = g.run.siege === null || g.run.siege === undefined;
  C.sgCreaturesLeft = sgList().length;
  C.oneADay = g.siege.tryStart('night') === false;
  g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await wait(3);
  C.deployablesAfterTakeoff = g.deployables.list().length;
} catch (e) { out.fatal = String(e && e.stack || e).slice(0, 900); }
out.errs = errs;
return out;
