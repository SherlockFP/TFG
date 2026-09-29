// Backrooms / NOCLIP feature test (body for tools/harness/headless.mjs).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5202 --script tools/harness/br_noclip.js --shot /tmp/br.png
// Lands on the Level 0 moon, noclips through the glitch wall, checks the pocket (geometry, nav, loot, creatures,
// walkie, Almond Water), takes the EXIT, noclips again by falling off the map, then lets the ship leave (lost).
// Set window.__brShots = true before running to also return base64 JPEG frames of the pocket (see docs/wave1/backrooms.md).
const g = kefal.game, errs = [], out = {}, shots = [];
addEventListener('error', (e) => errs.push(String(e.message)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = async (n, render = false) => { for (let i = 0; i < n; i += 10) { kefal.tick(Math.min(10, n - i), 1 / 30, render); await sleep(5); } };
const snap = (label) => { if (!window.__brShots) return; kefal.tick(1, 1 / 30, true); shots.push([label, kefal.engine.renderer.domElement.toDataURL('image/jpeg', 0.85)]); };
const B = g.backrooms, p = g.player;
out.module = !!B;
out.moon = !!kefal.game && !!(await import('/src/game/moons.js')).MOONS.br_level0;
// terminal: the moon is listed, NOCLIP is an easter egg
g.terminal.ensureDom?.(); g.terminal.lines = [];
g.terminal.exec('moons'); g.terminal.exec('noclip');
await sleep(50);
const termText = g.terminal.lines.map((l) => l.text).join('\n');
out.terminal = { lists: /Level 0/.test(termText), egg: /Try a wall/.test(termText) };
// ---- land on the Level 0 moon
g.run.daysLeft = 3; g.run.moon = 'br_level0'; p.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
await tick(150);
out.theme = g.world.facility?.layout?.theme;
out.spot = B.spot ? { x: +B.spot.pos.x.toFixed(1), z: +B.spot.pos.z.toFixed(1), dist: B.spot.dist } : null;
// ---- 1) the glitch wall: walk up to it and press E
const s = B.spot;
p.teleport(s.pos.clone().addScaledVector(s.normal, 1.6), Math.atan2(s.normal.x, s.normal.z));
p.pitch = 0;
await tick(6, true);
await sleep(600); await tick(3, true); snap('glitch_wall');
const near = g.findInteraction();
out.spotPrompt = near?.label || null;
near?.action?.();
out.cineStarted = !!B.debug.cine;
const t0 = g.time;
for (let i = 0; i < 160 && B.debug.cine; i++) await tick(2);
out.cineSeconds = +(g.time - t0).toFixed(2);
out.inPocket = B.inPocket();
out.state = { ...B.state };
const pk = B.pocket;
out.pocket = pk ? { key: pk.key, cells: pk.plan.W * pk.plan.H, dark: [...pk.plan.dark].filter(Boolean).length, pillars: pk.plan.pillars.length, troffers: pk.plan.troffers.length, colliders: pk.colliders.length, emitters: pk.emitters.length } : null;
out.posY = +p.pos.y.toFixed(2);
out.hudDock = !!document.querySelector('[data-dock-id="br_level0"]');
await sleep(1500); await tick(30, true);
out.calls = kefal.engine.sceneStats;
out.walkieBlocked = g.hasActiveWalkie(g.selfId) === false;
// nav + exit
const path = pk.nav.findPath(p.pos.x, p.pos.z, pk.exit.pos.x, pk.exit.pos.z, 40000);
out.exitPathLen = path ? Math.round(path.reduce((a, q, i) => (i ? a + Math.hypot(q.x - path[i - 1].x, q.z - path[i - 1].z) : 0), 0)) : null;
out.exitStraight = Math.round(p.pos.distanceTo(pk.exit.pos));
// loot that the host spawned in the pocket
const loot = [...g.items.all()].filter((it) => it.state === 'world' && pk.contains(it.obj.position));
out.loot = loot.map((it) => it.type);
await tick(20);
out.lootResting = loot.filter((it) => Math.abs(it.obj.position.y - pk.y) < 1.2).length;
// look around (screenshots)
p.pitch = 0.05; await tick(4, true); snap('landing');
p.yaw += Math.PI / 2; await tick(4, true); snap('landing_90');
// ---- 2) creatures: a hunter uses the pocket nav and only sees pocket players (god mode: the NPC hits hard)
g.godMode = true;
const c = B.hostSpawnHunter('mannequin');
out.hunter = c ? { type: c.type, navIsPocket: g.creatures.nav(c) === pk.nav } : null;
if (c) {
  const c0 = c.pos.clone();
  p.yaw = Math.atan2(-(c.pos.x - p.pos.x), -(c.pos.z - p.pos.z)) + Math.PI;   // look away so the NPC moves
  await tick(90);
  out.hunter.moved = +c.pos.distanceTo(c0).toFixed(1);
  out.hunter.inPocket = pk.contains(c.pos);
  out.hunter.sees = g.creatures.playersFor(c).map((q) => q.id === g.selfId);
  g.creatures.hostRemove(c.id);
}
// hunting starts ~4 min after the pocket opened (fast-forward the host clock)
B.debug.host.t0 -= 300; B.debug.host.nextSpawn = 0;
await tick(8);
out.hunt = { flag: B.state?.hunt, hunters: [...g.creatures.host.values()].filter((q) => pk.contains(q.pos)).map((q) => q.type) };
for (const q of [...g.creatures.host.values()]) if (pk.contains(q.pos)) g.creatures.hostRemove(q.id);
B.debug.host.nextSpawn = 999;
g.godMode = false;
// ---- 3) Almond Water: drink
const aid = g.items.hostSpawn('x_almondwater', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId });
await tick(4);
const slot = p.slots.indexOf(null);
if (slot >= 0) { p.slots[slot] = aid; p.slot = slot; g.refreshHeldVisuals(); }
p.hp = 40;
g.useHeldPress();
await tick(4);
out.almond = { hp: Math.round(p.hp), consumed: !g.items.get(aid) };
// ---- 4) walk to the EXIT and take it
p.teleport(pk.exit.pos.clone().add(new THREE.Vector3(pk.exit.nx * 0.8, 0, pk.exit.nz * 0.8)), pk.exit.yaw);   // facing the door
p.pitch = 0.05;
await tick(6, true); snap('exit');
const ex = g.findInteraction();
out.exitPrompt = ex?.label || null;
ex?.action?.();
await tick(4);
out.afterExit = { inPocket: B.inPocket(), atEntrance: g.world.facility.mainDoor.spawn.distanceTo(p.pos) < 2, members: (B.state?.m || []).length };
await sleep(200); await tick(160);   // host unloads an empty pocket after ~4 s (the spot is 'open' for 75 s: keep going)
out.afterExit.spotState = B.state?.sp;
// ---- 5) fall off the outdoor map -> noclip (forced roll)
B.debug.forceFall = true;
p.teleport(new THREE.Vector3(30, 8, 30)); await tick(4);
p.teleport(new THREE.Vector3(30, -148, 30)); p.vel.set(0, -20, 0);
await tick(6);
out.fallCine = !!B.debug.cine;
for (let i = 0; i < 160 && B.debug.cine; i++) await tick(2);
out.fall = { inPocket: B.inPocket(), key: B.state?.k, n: B.state?.n, y: +p.pos.y.toFixed(1), roll: B.debug.lastFallRoll };
B.debug.forceFall = null;
if (window.__brShowcase) {   // stop inside (page screenshot shows the HUD dock + found-footage overlay)
  await sleep(800); p.pitch = 0.04; await tick(20, true);
  out.errs = errs; if (window.__brShots) out.shots = shots; return out;
}
// ---- 6) the ship leaves while we are inside -> lost
g.hostBeginTakeoff('lever');
for (let i = 0; i < 12 && !p.dead; i++) { await sleep(500); await tick(15); }
out.lost = { dead: p.dead, cause: p.dead ? 'br_lost' : null, text: g.deathText('br_lost') };
for (let i = 0; i < 16 && g.run.phase !== 'orbit'; i++) { await sleep(500); await tick(10); }
out.orbit = { phase: g.run.phase, pocket: !!B.pocket, br: g.run.br ?? null };
out.errs = errs;
if (window.__brShots) out.shots = shots;
return out;
