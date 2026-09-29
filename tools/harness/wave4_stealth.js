// Wave 4 stealth headless body (tools/harness/headless.mjs --script): land on a big factory moon, check the variety runtime (hatch drop, latch shortcut,
// nook rewards), sneak / walk / sprint noise levels, the Listener + Web Crawler reacting to noise and to a Noisemaker decoy, the HUD meter, no page errors.
// Ends with the camera inside a liminal room / maze for the screenshot.
const g = kefal.game, errs = []; addEventListener('error', (e) => errs.push(e.message));
const out = { module: !!g.stealth };
const tick = async (n, dt = 1 / 30) => { kefal.tick(n, dt, false); await new Promise((r) => setTimeout(r, 5)); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const cellC = (L, x, z) => [L.ox + x * L.cell + L.cell / 2, L.oz + z * L.cell + L.cell / 2];

// ---- smoke: the ordinary landing flow on three moons still works (tools/harness/smoke_land.js) and reports what the variety pass made there
out.smoke = [];
for (const m of ['hamsi', 'lufer', 'palamut']) {
  g.run.daysLeft = 3; g.run.moon = m; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  for (let i = 0; i < 12; i++) await tick(10);
  const v = g.world.facility?.layout?.variety;
  out.smoke.push({ m, theme: g.world.facility?.layout?.theme, creatures: g.creatures.host.size, mazes: v?.mazes.length, liminal: v?.liminal.map((l) => l.kind), hatches: v?.hatches.length, shortcut: !!v?.shortcut, rewards: g.stealth?.stats.rewards });
  g.player.teleport(V3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(5);
}

// ---- land (try a few seeds until the facility has a hatch + a shortcut)
let fac = null;
for (const seed of [11, 23, 37, 51]) {
  g.run.seed = seed; g.run.daysLeft = 3; g.run.moon = 'orkinos'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
  await tick(30);
  fac = g.world.facility;
  const V = fac?.layout?.variety;
  if (V && V.hatches.length && V.shortcut && V.liminal.length) { out.seed = seed; break; }
  g.player.teleport(V3(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff(); await tick(10);
}
const L = fac.layout, V = L.variety;
out.variety = { mazes: V.mazes.map((m) => m.style), liminal: V.liminal.map((l) => l.kind), hatches: V.hatches.length, deadEnds: V.deadEnds.length, shortcut: !!V.shortcut, size: L.size };
out.built = { hatches: fac.variety?.hatches.length, rewards: fac.variety?.rewards.length, latch: !!fac.variety?.shortcut, pools: fac.variety?.pools.length };
out.rewardsSpawned = g.stealth?.stats.rewards;
out.hud = !!document.querySelector('.tfg-noise');

// ---- noise levels (real input): walk / sneak / sprint on the same floor
const p = g.player;
const cs = L.entrance.room;
const [ex, ez] = cellC(L, cs.cx, cs.cz - 1);
p.teleport(V3(ex, L.y + 0.2, ez), 0); p.inShip = false; await tick(20);
const inp = g.input;
const measure = async (keys, frames = 40) => {
  for (const k of keys) inp.down.add(k);
  await tick(frames);
  const n = p.noise, sn = p.sneak, sp = p.sprinting, spd = p.hSpeed;
  for (const k of keys) inp.down.delete(k);
  await tick(20);
  return { noise: +n.toFixed(3), sneak: !!sn, sprint: !!sp, speed: +(spd || 0).toFixed(2) };
};
out.walk = await measure(['KeyW']);
out.sneakWalk = await measure(['KeyW', 'AltLeft']);
out.crouchWalk = await measure(['KeyW', 'ControlLeft']);
out.sprint = await measure(['KeyW', 'ShiftLeft']);
out.surface = g.lastStepSurface;
out.meter = document.querySelector('.tfg-noise .nz-name')?.textContent;

// ---- Noisemaker item + shop registration
const it = g.items.hostSpawn('noisemaker', V3(ex + 1, L.y + 1, ez), {});
out.noisemaker = { def: !!it?.def, name: it?.def?.name, grenade: it?.def?.grenade, price: it?.def?.price, shop: it?.def?.shop };

// ---- creatures: a Listener 14 m away (nav-reachable), silent vs noisy vs decoy
const nav = fac.nav;
const spot = nav.randomWalkable(() => 0.37, ex, ez, 14) || { x: ex + 6, z: ez };
const lis = g.creatures.hostSpawn('listener', V3(spot.x, L.y, spot.z), { zone: 'in', level: 1 });
lis.age = 5;
const dist = () => Math.hypot(lis.pos.x - p.pos.x, lis.pos.z - p.pos.z);
out.listener = { spawned: !!lis, dist0: +dist().toFixed(1), speeds: { walk: lis.def.walk, run: lis.def.run } };
// 1. player stands still and silent: nothing happens
p.noise = 0; await tick(45);
out.listener.silentState = lis.state;
// 2. a decoy noise 30 m away in the other direction -> hunt / alert, walks there
const far = nav.randomWalkable(() => 0.81, spot.x, spot.z, 20) || { x: spot.x - 10, z: spot.z };
g.creatures.noise(V3(far.x, L.y + 1, far.z), 2.6);
await tick(6);
out.listener.afterDecoy = lis.state;
await tick(60);
out.listener.afterDecoy2 = lis.state;
out.listener.decoyDist = +Math.hypot(lis.pos.x - far.x, lis.pos.z - far.z).toFixed(1);
// 3. player sprints: it hears him
g.creatures.noises.length = 0;
for (const k of ['KeyW', 'ShiftLeft']) inp.down.add(k);
await tick(30);
for (const k of ['KeyW', 'ShiftLeft']) inp.down.delete(k);
out.listener.afterSprint = lis.state;
// crawler now hears instead of sees
const cr = g.creatures.hostSpawn('crawler', V3(spot.x, L.y, spot.z), { zone: 'in', level: 1 });
cr.age = 5; await tick(10);
out.crawler = { state: cr.state, brain: !!cr.data.init };
g.creatures.hostRemove(lis.id); g.creatures.hostRemove(cr.id);

// ---- wall attenuation on the live nav grid
out.hearDist = g.stealth ? {
  open: +g.stealth.hearDist(V3(ex, L.y, ez), V3(ex + 3, L.y, ez), { zone: 'in' }, 3).toFixed(2),
  farCorner: +g.stealth.hearDist(V3(ex, L.y, ez), V3(ex + 20, L.y, ez - 20), { zone: 'in' }, 28.28).toFixed(2),
} : null;

// ---- hatch: a noisy step drops you, a quiet one does not
if (fac.variety?.hatches.length) {
  const h = fac.variety.hatches[0];
  p.teleport(V3(h.x, h.y + 0.2, h.z), 0); await tick(3);
  p.noise = 0.02;
  for (let i = 0; i < 20; i++) { p.noise = 0.02; await tick(1); }
  out.hatch = { quietStayed: Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < 1.5 };
  p.teleport(V3(h.x, h.y + 0.2, h.z), 0); await tick(2);
  p.noise = 0.9; await tick(14);
  out.hatch.noisyFell = Math.hypot(p.pos.x - h.x, p.pos.z - h.z) > 4;
  out.hatch.landedNear = +Math.hypot(p.pos.x - h.to.x, p.pos.z - h.to.z).toFixed(1);
}

// ---- shortcut latch
{
  const door = fac.doors.find((d) => d.info?.shortcut);
  if (door) {
    const info = door.info, inf = { locked: door.locked };
    const side = (s) => { const off = 1.6 * (s === 'b' ? 1 : -1); return info.dir === 0 ? V3(door.pos.x + off, L.y + 0.2, door.pos.z) : V3(door.pos.x, L.y + 0.2, door.pos.z + off); };
    p.teleport(side(info.latch === 'a' ? 'b' : 'a'), 0); const wrong = g.stealth.shortcutPrompt(door);
    p.teleport(side(info.latch), 0); const right = g.stealth.shortcutPrompt(door);
    out.latch = { lockedAtStart: inf.locked, wrongSide: wrong?.label, latchSide: right?.label };
    right?.action(); await tick(20);
    out.latch.openedForEveryone = !door.locked && door.open;
  }
}

// ---- screenshot spot: inside the first liminal room (or maze)
const room = L.rooms.find((r) => r.lim === 'office') || L.rooms.find((r) => r.lim) || L.rooms.find((r) => r.maze);
if (room) {
  const [rx, rz] = cellC(L, room.x, room.z);
  p.teleport(V3(rx - 0.5, L.y + 0.2, rz + 0.5), -0.5); p.pitch = 0.05; await tick(30);
  out.shotRoom = { type: room.type, lim: room.lim, maze: room.maze };
}
out.errs = errs;
return out;
