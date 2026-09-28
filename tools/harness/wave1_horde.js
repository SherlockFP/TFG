// Wave-1 HORDE check for headless.mjs (body of an async function; see docs/wave1/horde.md).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5189 --script tools/harness/wave1_horde.js --shot /tmp/horde.png
// Proves: collector steals to its nest + drops loot when killed, janitor closes a door, a swarm wave spawns/advances/
// clears, frame time with 40 swarm bodies, a hit squad gunner telegraphs (laser) and shoots, the Doppel copies a
// player and the Instant Camera reveals + stuns it. Ends on a composite scene (swarm + squad + polaroid) for --shot.
const g = kefal.game, H = g.horde, errs = [], out = {};
addEventListener('error', (e) => errs.push(e.message));
const oe = console.error.bind(console);
console.error = (...a) => { errs.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 300)); oe(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HT = new Set(['zombot', 'hs_enforcer', 'hs_gunner', 'hs_leader', 'doppel', 'collector', 'janitor', 'hoardnest', 'janitorbin']);
const sim = async (sec, dt = 1 / 15, each = null) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { kefal.tick(1, dt, false); if (each && each(i * dt)) return true; if (i % 60 === 59) await sleep(1); } return false; };
const cull = () => { for (const c of [...g.creatures.host.values()]) if (!HT.has(c.type) && !c.dead) g.creatures.kill(c, null, { silent: true }); };
const r1 = (n) => Math.round(n * 10) / 10;
out.installed = !!H && typeof H.spawnHitSquad === 'function';
g.godMode = true;
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
await sim(1);
g.hostData.spawnT = 1e9; g.hostData.outdoorSpawnT = 1e9;
cull();
const fac = g.world.facility, nav = fac.nav, Y = fac.layout.y;
const ter = g.world.terrain;
const outside = (x, z) => V(x, ter.heightAt(x, z) + 0.1, z);
g.player.teleport(outside(24, 24)); g.player.inShip = false;
await sim(0.5);

// ---------------------------------------------------------------- collector: steal -> nest -> drop when killed
{
  const door = fac.mainDoor.pos;
  const spot = fac.scrapSpots.filter((s) => !s.elevated && Math.hypot(s.x - door.x, s.z - door.z) > 10)[3] || fac.scrapSpots[0];
  const col = g.creatures.hostSpawn('collector', V(spot.x, Y, spot.z), { zone: 'in', state: 'idle', variant: null, affix: null });
  await sim(0.3);
  const w = nav.randomWalkable(Math.random, spot.x, spot.z, 3);
  const baitId = g.items.hostSpawn('goldbar', V(w.x, Y + 0.5, w.z), {});
  let stolen = false, nested = false;
  await sim(60, 1 / 15, () => {
    if ((col.data.carry || []).includes(baitId)) stolen = true;
    const it = g.items.get(baitId);
    if (stolen && it && it.state === 'world' && !it.carrier && it.obj.position.distanceTo(col.data.nest) < 2.6) { nested = true; return true; }
    return false;
  });
  // second bait: kill it while it carries -> drops
  let w2 = null;   // outside the nest pile radius (items within 2.6 m of the nest count as already stolen)
  for (let i = 0; i < 40 && !w2; i++) { const w = nav.randomWalkable(Math.random, col.data.nest.x, col.data.nest.z, 9); if (w && Math.hypot(w.x - col.data.nest.x, w.z - col.data.nest.z) > 4.5) w2 = w; }
  w2 = w2 || nav.randomWalkable(Math.random, col.pos.x, col.pos.z, 8);
  const bait2 = g.items.hostSpawn('ring', V(w2.x, Y + 0.5, w2.z), {});
  let carrying2 = false;
  await sim(40, 1 / 15, () => { carrying2 = (col.data.carry || []).includes(bait2); return carrying2; });
  if (carrying2) g.creatures.damage(col.id, 999, g.selfId);
  await sim(1);
  const it2 = g.items.get(bait2);
  out.collector = { nest: !!col.data.nestId && !!g.creatures.views.get(col.data.nestId), stolen, nested, carriedSecond: carrying2, droppedOnDeath: !!it2 && !it2.carrier && it2.state === 'world' && col.dead };
}

// ---------------------------------------------------------------- janitor closes a door
{
  const doors = fac.doors.filter((d) => d.kind === 'door' && !d.locked && !d.teleport);
  const door = doors[Math.floor(doors.length / 2)] || doors[0];
  g.hostSetDoor(door.id, true);
  await sim(0.3);
  const wasOpen = !!door.open;
  const w = nav.randomWalkable(Math.random, door.pos.x, door.pos.z, 4);
  const jan = g.creatures.hostSpawn('janitor', V(w.x, Y, w.z), { zone: 'in', state: 'idle', variant: null, affix: null });
  const closed = await sim(60, 1 / 15, () => !door.open);
  out.janitor = { wasOpen, closed, bin: !!jan.data.binId, task: jan.data.task?.k || null, carry: (jan.data.carry || []).length };
}

// ---------------------------------------------------------------- swarm wave (spawn / advance / clear) + perf with 40 bodies
{
  g.player.teleport(outside(30, 30));
  await sim(0.3);
  cull();
  const f0 = performance.now(); for (let i = 0; i < 8; i++) kefal.tick(1, 1 / 30, true); const base = (performance.now() - f0) / 8;
  const started = H.startWaves('night', 'out');
  let peak = 0, maxIdx = 0;
  const waves = [];
  const offWave = g.mods.on('fx', (d) => { if (d?.k === 'hwave') waves.push(d.s + (d.i ? d.i : '')); });
  await sim(95, 1 / 15, () => { const s = H.stats(); peak = Math.max(peak, s.swarm); maxIdx = Math.max(maxIdx, s.wave?.idx || 0); return s.wave && s.wave.idx >= s.wave.total; });
  for (const c of g.creatures.host.values()) if (c.type === 'zombot' && !c.dead) g.creatures.damage(c.id, 999, g.selfId);
  const cleared = await sim(12, 1 / 15, () => !H.waveActive());
  offWave();
  // 40 bodies in view: frame time
  const n40 = H.spawnSwarm(V(30, ter.heightAt(30, 18), 18), 40);
  g.player.yaw = 0; g.player.pitch = -0.1;
  await sim(1.2, 1 / 30);
  const f1 = performance.now(); for (let i = 0; i < 8; i++) kefal.tick(1, 1 / 30, true); const with40 = (performance.now() - f1) / 8;
  const tq = performance.now(); for (let i = 0; i < 30; i++) kefal.tick(1, 1 / 30, false); const simMs = (performance.now() - tq) / 30;
  out.swarm = { started, waves, peak, maxIdx, cleared, spawned40: n40, alive: H.stats().swarm, frameMsBase: r1(base), frameMs40: r1(with40), simMs40: r1(simMs), calls: kefal.engine.sceneStats?.calls, swarmDrawCalls: H.stats().drawCalls };
  for (const c of g.creatures.host.values()) if (c.type === 'zombot' && !c.dead) g.creatures.kill(c, null, { silent: true });
  await sim(3);
}

// ---------------------------------------------------------------- hit squad: laser telegraph + shots
{
  cull();
  const P = g.player.pos.clone();
  const sq = H.spawnHitSquad('bureau', outside(P.x + 5, P.z - 11), 3);
  let shots = 0, hits = 0, aimSeen = false, laser = false;
  const off = g.mods.on('fx', (d) => { if (d?.k === 'hshot') { shots++; if (d.h) hits++; } });
  await sim(14, 1 / 30, () => {
    for (const v of g.creatures.views.values()) if (v.type === 'hs_gunner' || v.type === 'hs_leader') { if (v.state === 'aim') aimSeen = true; if (v.model?.parts?.laser?.visible) laser = true; }
    return shots >= 2 && laser;
  });
  off();
  const names = [...g.creatures.views.values()].filter((v) => v.type.startsWith('hs_')).map((v) => v.def.name);
  out.squad = { roles: sq.map((c) => c.type), names, aimSeen, laserVisible: laser, shots, hits };
  for (const c of sq) g.creatures.kill(c, null, { silent: true });
  await sim(0.5);
}

// ---------------------------------------------------------------- Doppel + Instant Camera, then the composite screenshot scene
{
  cull();
  g.player.teleport(outside(26, 30)); g.player.yaw = 0; g.player.pitch = -0.05;
  await sim(0.3);
  const P = g.player.pos.clone();
  H.spawnSwarm(outside(P.x - 5, P.z - 19), 14);
  H.spawnHitSquad('algorithm', outside(P.x + 8, P.z - 20), 3);
  const dop = g.creatures.hostSpawn('doppel', outside(P.x + 0.3, P.z - 4.5), { zone: 'out', state: 'idle', variant: null, affix: null });
  await sim(1.2, 1 / 30);
  dop.pos.set(P.x + 0.3, ter.heightAt(P.x + 0.3, P.z - 4.5), P.z - 4.5); dop.yaw = Math.PI; dop.path = null;
  const dv = g.creatures.views.get(dop.id);
  out.doppel = { victimIsHost: dop.data.victim === g.selfId, uiType: dv?.type, hType: dv?.hType, name: dv?.name, hasTag: !!dv?.model?.tag, scanName: dv?.name === g.profile.name };
  const iid = g.items.hostSpawn('instacam', P.clone(), { holder: g.selfId });
  await sim(0.2, 1 / 30);
  const slot = g.player.slots.indexOf(iid);
  if (slot >= 0) g.player.slot = slot;
  g.player.yaw = 0; g.player.pitch = -0.05;
  kefal.tick(2, 1 / 30, true);
  const charges0 = g.items.get(iid)?.charges;
  g.useHeldPress();
  await sim(0.25, 1 / 30);
  out.camera = {
    heldSlot: slot, chargesBefore: charges0, chargesAfter: g.items.get(iid)?.charges, inFrame: H.camera.lastInFrame, photo: (H.camera.lastPhoto || '').length,
    revealed: !!dop.data.revealed, stunned: dop.state === 'stunned' && dop.stunT > 0, tag: g.creatures.views.get(dop.id)?.name,
    polaroid: !!document.querySelector('.hpola.in'),
    polaroidRect: (() => { const e = document.querySelector('.hpola'); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; })(),
  };
  for (let i = 0; i < 12; i++) { kefal.tick(1, 1 / 30, true); await sleep(80); }   // let the polaroid finish sliding in (CSS, real time)
}
out.errs = errs;
return out;
