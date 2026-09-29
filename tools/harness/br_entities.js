// Headless feature test for the Backrooms entities (module 'brcreatures', docs/wave1/brcreatures.md).
//   flock /tmp/tfg-browser.lock node tools/harness/headless.mjs --port 5203 --script tools/harness/br_entities.js --shot /tmp/br_hug.png
// Add &brshots=1 to --url to also return a JPEG data URL per entity pose (out.shots) - decode them with any base64 tool.
// Lands on hamsi with the 'backrooms' interior, then runs isolated host scenarios with concrete numbers:
//   gating (spawn tables + noSpawn getter), landing seed, Smiler lit / unlit, Pale Hound quiet / loud, Moth Swarm lure,
//   Partygoer hug -> E-mash struggle -> stagger, ally knock-off. Ends mid-hug so --shot shows the hug prompt.
const g = kefal.game, errs = [];
addEventListener('error', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shotsOn = /brshots=1/.test(location.search);
const shots = {};
const r2 = (v) => Math.round(v * 100) / 100;
const { MOONS } = await import('/src/game/moons.js');
const { CREATURES, spawnTable, canSpawnMore } = await import('/src/game/creatures.js');
const { struggleNeed } = await import('/src/game/creatures_backrooms.js');
const BR = ['br_smiler', 'br_hound', 'br_partygoer', 'br_moth'];
const out = { registered: BR.filter((id) => CREATURES[id]).length, module: !!g.brcreatures };

// ---- gating before landing: no facility -> nobody may spawn them; factory tables carry no br_* weights
out.noSpawnInOrbit = BR.every((id) => CREATURES[id]?.noSpawn === true);
out.factoryTableBr = Object.keys(spawnTable({ ...MOONS.hamsi, interior: 'factory' }, 'in')).filter((k) => k.startsWith('br_')).length;
out.backroomsTable = Object.fromEntries(Object.entries(spawnTable({ ...MOONS.hamsi, interior: 'backrooms' }, 'in')).filter(([k]) => k.startsWith('br_')));

// ---- land on a backrooms facility
const prevInterior = MOONS.hamsi.interior;
MOONS.hamsi.interior = 'backrooms';
g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding();
for (let i = 0; i < 12; i++) { kefal.tick(10, 1 / 30, false); await sleep(10); }
const fac = g.world.facility, nav = fac.nav, Y = fac.layout.y;
out.theme = fac.layout.theme;
out.noSpawnInBackrooms = BR.every((id) => CREATURES[id]?.noSpawn === false);
out.canSpawnSmiler = canSpawnMore('br_smiler', g.creatures.host);
const count = (t) => [...g.creatures.host.values()].filter((c) => c.type === t && !c.dead).length;
out.seeded = Object.fromEntries(BR.map((t) => [t, count(t)]));
out.seedDark = [...g.creatures.host.values()].filter((c) => c.type === 'br_smiler').map((c) => g.brcreatures.darkAt(c.pos));
out.darkCells = g.brcreatures.stats.dark; out.flickerLamps = g.brcreatures.stats.flick;
// the host.js indoor spawner, wrapped: Smilers land in the dark
const before = g.brcreatures.stats.placed;
const okIndoor = [0, 1, 2].map(() => g.hostSpawnCreatureIndoor('br_smiler'));
out.indoorSmiler = { ok: okIndoor.filter(Boolean).length, placed: g.brcreatures.stats.placed - before };
out.indoorSmilerDark = [...g.creatures.host.values()].filter((c) => c.type === 'br_smiler').map((c) => g.brcreatures.darkAt(c.pos));

// ---- isolation for the scenarios: no other creatures, no new spawns, flashlight under test control
g.hostData.powerBoost = -999;
const clearAll = () => { for (const id of [...g.creatures.host.keys()]) g.creatures.hostRemove(id); kefal.tick(2, 1 / 30, false); };
let FL = false;
g.flashlightOn = () => FL;
const heal = () => { g.player.hp = g.stats.maxHp; g.player.dead = false; };
const door = fac.mainDoor?.pos || new THREE.Vector3();
function openSpot(run = 7, pred = null) {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  for (let k = 0; k < 400; k++) {
    const w = nav.randomWalkable(Math.random);
    if (!w || Math.hypot(w.x - door.x, w.z - door.z) < 16) continue;
    for (const [dx, dz] of dirs) {
      let ok = true;
      for (let s = 0.5; s <= run && ok; s += 0.5) {
        for (const side of [-0.7, 0, 0.7]) {
          const [gx, gz] = nav.toGrid(w.x + dx * s - dz * side, w.z + dz * s + dx * side);
          if (!nav.isWalkable(gx, gz)) { ok = false; break; }
        }
      }
      if (ok && (!pred || pred(w, { x: dx, z: dz }))) return { p: w, dir: { x: dx, z: dz } };
    }
  }
  return null;
}
function place(s) {
  g.player.teleport(new THREE.Vector3(s.p.x, Y, s.p.z));
  g.player.yaw = Math.atan2(-s.dir.x, -s.dir.z); g.player.pitch = 0;
}
const ahead = (s, d) => ({ x: s.p.x + s.dir.x * d, y: Y, z: s.p.z + s.dir.z * d });
const dist = (c) => r2(Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z));
const spawn = (type, pos, extra = {}) => {
  const c = g.brcreatures.spawn(type, pos, { level: 1, elite: false, affix: null, ...extra });
  if (c) c.yaw = Math.atan2(g.player.pos.x - c.pos.x, g.player.pos.z - c.pos.z);
  return c;
};
async function run(sec, onTick, dt = 1 / 30) {
  const n = Math.round(sec / dt);
  for (let i = 0; i < n; i++) { onTick?.(i * dt); kefal.tick(1, dt, false); if (i % 15 === 14) await sleep(1); }
}
const statesOf = (c) => { const s = new Set(); return { s, tick: () => s.add(c.state) }; };

// ---- SMILER: flashlight on it -> freezes and recedes
clearAll(); heal();
let spot = openSpot(9);
place(spot);
FL = true;
let sm = spawn('br_smiler', ahead(spot, 4.5));
let seen = statesOf(sm);
await run(3, seen.tick);
out.smilerLit = { states: [...seen.s], d0: 4.5, d3s: dist(sm), hp: g.player.hp };
// ---- SMILER: lights out (blackout) -> stalks and lunges
clearAll(); heal();
place(spot);
FL = false; g.run.powerOn = false;
sm = spawn('br_smiler', ahead(spot, 4.5));
seen = statesOf(sm);
let hp0 = g.player.hp, minD = 99;
await run(4.5, () => { seen.tick(); minD = Math.min(minD, dist(sm)); });
out.smilerDark = { states: [...seen.s], minDist: r2(minD), hpLost: hp0 - g.player.hp, after: sm.state };
g.run.powerOn = true;

// ---- PALE HOUND: silence -> it does not find you; noise -> it hunts and bites; silence again -> it loses you
clearAll(); heal();
spot = openSpot(11) || spot; place(spot);
let hd = spawn('br_hound', ahead(spot, 9));
seen = statesOf(hd);
await run(3, seen.tick);
out.houndQuiet = { states: [...seen.s], d: dist(hd), hp: g.player.hp };
hp0 = g.player.hp; minD = 99;
const loudSeen = statesOf(hd);
await run(4, () => { g.creatures.noise(g.player.pos.clone(), 0.9, g.selfId); loudSeen.tick(); minD = Math.min(minD, dist(hd)); });
out.houndLoud = { states: [...loudSeen.s], minDist: r2(minD), hpLost: hp0 - g.player.hp };
heal(); hp0 = g.player.hp;
await run(5, null);
out.houndSilentAgain = { state: hd.state, hpLost: hp0 - g.player.hp };

// ---- MOTH SWARM: lured by a flashlight, nibbles, leaves when it goes dark
clearAll(); heal();
spot = openSpot(9) || spot; place(spot);
FL = true;
let mo = spawn('br_moth', ahead(spot, 7));
seen = statesOf(mo); hp0 = g.player.hp;
await run(6, seen.tick);
out.mothLit = { states: [...seen.s], d: dist(mo), hpLost: hp0 - g.player.hp, extraIsMe: mo.extra === g.selfId };
FL = false;
await run(3, null);
out.mothDark = { state: mo.state, extra: mo.extra };

// ---- PARTYGOER: waves, walks up, hugs; E-mash struggle frees you; a teammate's hit knocks it off
clearAll(); heal();
spot = openSpot(8) || spot; place(spot);
let pg = spawn('br_partygoer', ahead(spot, 3.6));
seen = statesOf(pg);
let tHug = -1;
await run(9, (t) => { seen.tick(); if (tHug < 0 && pg.state === 'hug') tHug = r2(t); });
kefal.tick(2, 1 / 30, false);
out.partyApproach = { states: [...seen.s], tHug, hugged: g.brcreatures.hugged(), victimIsMe: pg.extra === g.selfId };
hp0 = g.player.hp;
await run(3, null);
out.partyHugDmg3s = hp0 - g.player.hp;
const need = struggleNeed(pg.level);
let presses = 0;
for (let i = 0; i < need + 3 && pg.state === 'hug'; i++) { g.net.request('brstruggle', { c: pg.id }); presses++; await sleep(75); kefal.tick(1, 1 / 30, false); }
kefal.tick(3, 1 / 30, false);
out.partyStruggle = { need, presses, state: pg.state, hugged: g.brcreatures.hugged() };
// the ally knock-off (a teammate's hit marker, as CreatureManager.damage sets it for a real player)
heal();
await run(9, null);
const reHug = pg.state === 'hug';
pg.data.hitAt = g.time; pg.data.hitBy = 'ally-test';
kefal.tick(2, 1 / 30, false);
out.partyAllyHit = { reHugged: reHug, state: pg.state };

// ---- screenshots (optional): one pose per entity, HUD-less canvas captures
if (shotsOn) {
  const frozen = new Map();
  const freeze = (type, state) => { frozen.set(type, CREATURES[type].behavior); CREATURES[type].behavior = (c) => { if (c.state !== state) c.setState(state); }; };
  const thaw = () => { for (const [t, b] of frozen) CREATURES[t].behavior = b; frozen.clear(); };
  const snap = (name, n = 40) => { kefal.tick(n, 1 / 30, true); shots[name] = kefal.engine.renderer.domElement.toDataURL('image/jpeg', 0.82); };
  const pose = async (name, type, state, d, opts = {}) => {
    clearAll(); heal();
    const sp = opts.spot || openSpot(d + 3) || spot;
    place(sp);
    g.player.pitch = opts.pitch || 0;
    freeze(type, state);
    const c = spawn(type, ahead(sp, d));
    if (opts.before) opts.before(c);
    kefal.tick(20, 1 / 30, false);
    g.player.pitch = opts.pitch || 0;
    snap(name);
    thaw();
    await sleep(5);
  };
  // the Smiler in a real dark corridor if there is one (else a blackout)
  const darkSpot = openSpot(6, (w, dir) => g.brcreatures.darkAt(new THREE.Vector3(w.x + dir.x * 4, Y, w.z + dir.z * 4)) === 2 && g.brcreatures.darkAt(new THREE.Vector3(w.x, Y, w.z)) === 2);
  out.shotDarkSpot = !!darkSpot;
  if (!darkSpot) { g.setPower(false); g.run.powerOn = false; }
  await pose('smiler_dark', 'br_smiler', 'lurk', 4, { spot: darkSpot || undefined, pitch: 0.12 });
  await pose('smiler_stalk_close', 'br_smiler', 'stalk', 2.4, { spot: darkSpot || undefined, pitch: 0.2 });
  await pose('smiler_lunge', 'br_smiler', 'lunge', 1.9, { spot: darkSpot || undefined, pitch: 0.18 });
  if (!darkSpot) { g.setPower(true); g.run.powerOn = true; }
  await pose('smiler_lit', 'br_smiler', 'lit', 3.2, { pitch: 0.15 });
  await pose('hound_walk', 'br_hound', 'walk', 3, { pitch: -0.25 });
  await pose('hound_lunge', 'br_hound', 'lunge', 2.4, { pitch: -0.2 });
  await pose('party_wave', 'br_partygoer', 'wave', 4.2, { pitch: 0.2 });
  await pose('moth_orbit', 'br_moth', 'orbit', 3.2, { pitch: 0.35 });
  out.shots = shots;
}

// ---- draw calls with one of each in view
clearAll(); heal();
spot = openSpot(10) || spot; place(spot);
kefal.tick(4, 1 / 30, true);
const callsEmpty = kefal.engine.sceneStats?.calls ?? -1;
spawn('br_smiler', ahead(spot, 5)); spawn('br_hound', ahead(spot, 6)); spawn('br_moth', ahead(spot, 7));
kefal.tick(4, 1 / 30, true);
out.drawCalls = { empty: callsEmpty, withThree: kefal.engine.sceneStats?.calls ?? -1 };

// ---- leave the player mid-hug so the --shot shows the prompt and the face
clearAll(); heal();
place(spot);
g.player.pitch = 0.5;
pg = spawn('br_partygoer', ahead(spot, 1.0));
pg.data.greeted = true;
await run(1.2, null);
out.finalHug = pg.state;
out.stats = g.brcreatures.stats;
delete g.flashlightOn;
MOONS.hamsi.interior = prevInterior;
out.errs = errs;
return out;
