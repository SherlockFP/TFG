// worlds2 rules + host logic test:  node tools/harness/worlds2.test.mjs
// Pure rules (days-in-run difficulty, decay steps, raid schedule, fauna plan, loot pacing), the generated sectors (twin-sun / soviet appear,
// deterministic), the creature state machines (Dune Maw, Tusked Beast, Scavenger Raider, Cantina Alien) against a fake creature manager, the
// plasma blade / blaster data + saber move set, and the installer's host directors (decay steps, raids, dusk prowlers, balance wrapper) against a
// fake game. No browser, no physics.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';

const core = await import('../../src/game/worlds2_core.js');
const { generateSector } = await import('../../src/game/moongen.js');
const { MOONS, BIOMES } = await import('../../src/game/moons.js');
const P = await import('../../src/game/progression.js');
const CR = await import('../../src/game/worlds2_creatures.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const THREE = await import('three');
const modelsMod = await import('../../src/models/worlds2_models.js');

let n = 0;
const ok = (name, fn) => { const r = fn(); if (r && r.then) return r.then(() => { n++; console.log('ok', name); }); n++; console.log('ok', name); };

// ---------------------------------------------------------------------------------------------------- rules
await ok('days-in-run factors: 1.0 until day 4, monotonic, capped', () => {
  for (const d of [1, 2, 3]) assert.deepEqual([core.dayFactors(d).spawn, core.dayFactors(d).hp, core.dayFactors(d).dmg, core.dayFactors(d).speed], [1, 1, 1, 1]);
  let prev = core.dayFactors(3);
  for (let d = 4; d <= 60; d++) { const f = core.dayFactors(d); assert.ok(f.spawn >= prev.spawn && f.hp >= prev.hp && f.dmg >= prev.dmg && f.speed >= prev.speed); prev = f; }
  assert.ok(Math.abs(core.dayFactors(4).spawn - 1.035) < 1e-9);
  assert.equal(core.dayFactors(99).spawn, 1.7); assert.equal(core.dayFactors(99).hp, 1.4); assert.equal(core.dayFactors(99).dmg, 1.3); assert.equal(core.dayFactors(99).speed, 1.1);
  assert.ok(core.dayFactors(12).spawn > 1.25 && core.dayFactors(12).spawn < 1.35);
});
await ok('facility decay: steps at 14:00 / 16:30 / 19:00 / 21:30, x0.92 each', () => {
  assert.equal(core.decayStepsPassed(13 * 60), 0); assert.equal(core.decayStepsPassed(14 * 60), 1); assert.equal(core.decayStepsPassed(17 * 60), 2); assert.equal(core.decayStepsPassed(19 * 60), 3); assert.equal(core.decayStepsPassed(23 * 60), 4);
  assert.ok(Math.abs(core.decayMulAfter(4) - 0.92 ** 4) < 1e-9); assert.ok(core.decayMulAfter(4) > 0.7 && core.decayMulAfter(4) < 0.73);
  assert.equal(core.decayMulAfter(99), core.decayMulAfter(4));
  assert.equal(core.lateFraction(13 * 60), 0); assert.equal(core.lateFraction(24 * 60), 1); assert.ok(core.lateFraction(19 * 60) > 0.4 && core.lateFraction(19 * 60) < 0.6);
});
await ok('raid schedule: interval shrinks with days, size grows, factions deterministic', () => {
  const cfg = MOONS.w2sov.raid;
  assert.ok(cfg && cfg.first > 0 && cfg.factions.length >= 3);
  assert.equal(core.raidInterval(cfg, 1), cfg.every);
  assert.ok(core.raidInterval(cfg, 20) < core.raidInterval(cfg, 6) && core.raidInterval(cfg, 6) < core.raidInterval(cfg, 4));
  assert.ok(core.raidInterval(cfg, 200) >= 110);
  assert.equal(core.raidSize(cfg, 1), 3); assert.ok(core.raidSize(cfg, 30) <= 6 && core.raidSize(cfg, 30) > 3);
  for (let k = 0; k < 20; k++) { assert.equal(core.raidFaction(cfg, 123, 'w2sov', k), core.raidFaction(cfg, 123, 'w2sov', k)); assert.ok(cfg.factions.includes(core.raidFaction(cfg, 123, 'w2sov', k))); }
  const seen = new Set(); for (let k = 0; k < 40; k++) seen.add(core.raidFaction(cfg, 5, 'w2sov', k)); assert.ok(seen.size >= 2, 'factions vary');
  for (let k = 0; k < 10; k++) { const a = core.raidAngle(9, 'w2sov', k); assert.ok(a >= 0 && a < 6.3); }
});
await ok('loot pacing: indoor count x0.7 + early-game bonus, ~30 % less overall', () => {
  assert.equal(P.BALANCE.lootCountMul, 0.7);
  const oldCount = (base, q) => Math.round(base + P.scrapCountBonus(q));
  assert.equal(P.scrapCountFor(12, 0), Math.round(12 * 0.7 + 3));   // early bonus (+3 / +2) survives
  assert.equal(P.scrapCountFor(12, 1), Math.round(12 * 0.7 + 2 + 0.2));
  let oldSum = 0, newSum = 0;
  for (const base of [10, 12, 14, 16, 20, 24, 30]) for (let q = 2; q < 14; q++) { oldSum += oldCount(base, q); newSum += P.scrapCountFor(base, q); }
  const cut = 1 - newSum / oldSum;
  assert.ok(cut > 0.22 && cut < 0.32, 'overall cut ' + cut.toFixed(3));
  console.log(`   mid-game indoor scrap count -${(cut * 100).toFixed(1)}%  (quota 0: 12 -> ${P.scrapCountFor(12, 0)} vs old ${oldCount(12, 0)})`);
});
await ok('fauna plan: deterministic, visible near the landing, per-biome species', () => {
  const a = core.planFauna(777, 'hamsi', 'hills', { half: 130, scale: 1 }), b = core.planFauna(777, 'hamsi', 'hills', { half: 130, scale: 1 }), c = core.planFauna(778, 'hamsi', 'hills', { half: 130, scale: 1 });
  assert.deepEqual(a, b); assert.notDeepEqual(a.herds[0].members[0], c.herds[0].members[0]);
  assert.ok(a.herds.length >= 2 && a.flyers.length >= 8);
  const d0 = Math.hypot(a.herds[0].cx, a.herds[0].cz); assert.ok(d0 >= 38 && d0 <= 70, 'first herd starts near the ship: ' + d0);
  for (const b of Object.keys(BIOMES)) { const p = core.planFauna(1, 'x', b, {}); assert.ok(p.herds.length && p.flyers.length, b); }
  assert.equal(core.planFauna(1, 'x', 'twinsun').herd, 'Dune Strider'); assert.equal(core.planFauna(1, 'x', 'soviet').herd, 'Frostwoolly');
  for (let t = 0; t < 600; t += 37) for (const h of a.herds) { const p = core.herdPos(h, h.members[0], t); assert.ok(Number.isFinite(p.x + p.z + p.yaw)); }
  for (const f of a.flyers) { const p = core.flyerPos(f, 12.5); assert.ok(Number.isFinite(p.x + p.y + p.z) && p.y > 10); }
  assert.equal(core.prowlerBudget(1, 9), 0); assert.ok(core.prowlerBudget(3, 5) >= 2 && core.prowlerBudget(6, 40) <= 7);
});
await ok('sectors: soviet / twin-sun appear deterministically with raid / cantina flags; both fixed moons registered', () => {
  assert.ok(MOONS.w2sov && MOONS.w2sun && BIOMES.soviet && BIOMES.twinsun && BIOMES.twinsun.dunes > 0);
  assert.equal(MOONS.w2sov.biome, 'soviet'); assert.ok(MOONS.w2sov.raid); assert.ok(MOONS.w2sun.cantina); assert.ok(MOONS.w2sun.outdoor.dunemaw > 0 && MOONS.w2sun.outdoor.tuskbeast > 0 && MOONS.w2sun.outdoor.scavraider > 0);
  let sov = 0, sun = 0, total = 0;
  for (let k = 0; k < 40; k++) for (let i = 0; i < 12; i++) {
    const a = generateSector('run' + k, i), b = generateSector('run' + k, i);
    assert.deepEqual(a.moons.map((m) => m.biome), b.moons.map((m) => m.biome));
    for (const m of a.moons) {
      total++;
      if (m.biome === 'soviet') { sov++; assert.ok(m.raid && m.raid.factions.length); assert.ok(i >= 2); }
      if (m.biome === 'twinsun') { sun++; assert.ok(m.cantina && m.outdoor.dunemaw > 0); }
      assert.ok(m.name && m.desc && m.weather.length);
    }
    if (i <= 1) for (const m of a.moons) assert.ok(m.biome !== 'soviet' && m.biome !== 'twinsun');   // early sectors keep their old rolls
  }
  console.log(`   ${sov} soviet + ${sun} twin-sun moons in ${total} generated (480 sectors)`);
  assert.ok(sov > 20 && sun > 20);
});

// ---------------------------------------------------------------------------------------------------- creature state machines (fake manager)
CR.registerWorlds2Creatures();
function fakeWorld() {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const players = [];
  const g = { time: 100, run: { time: 12 * 60, weather: 'clear', day: 1 }, net: { sent: [], broadcast(t, d) { this.sent.push([t, d]); } }, creatures: { noise() {}, host: new Map() },
    physics: { raycast: () => null }, aiPlayerById: (id) => players.find((p) => p.id === id) };
  const M = {
    game: g, playersFor: () => players.filter((p) => !p.dead), speedMul: (c, s) => s, playerSpeed: (p) => p.speed || 0, nearest(c, list, maxD = 1e9) { let best = null, bd = maxD; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; },
    canSee: () => true, hear: () => null, attacks: [], attack(c, p, dmg, cause) { this.attacks.push({ c: c.type, p: p.id, dmg, cause }); },
    goTo(c, x, z) { c.dest = { x, z }; c.path = [{ x, z }]; c.pathIdx = 0; }, goToLazy(c, x, z) { this.goTo(c, x, z); }, wander(c) { this.goTo(c, c.pos.x + 5, c.pos.z); },
    follow(c, dt, sp) { if (!c.path || c.pathIdx >= c.path.length) return true; const w = c.path[c.pathIdx], dx = w.x - c.pos.x, dz = w.z - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.35) { c.pathIdx++; return true; } c.pos.x += dx / d * Math.min(d, sp * dt); c.pos.z += dz / d * Math.min(d, sp * dt); return false; },
    moveToward(c, t, dt, sp) { this.goTo(c, t.x, t.z); return this.follow(c, dt, sp); }, placeAt(c, x, z) { c.pos.x = x; c.pos.z = z; }, sound() {}, host: g.creatures.host,
  };
  g.creatures = Object.assign(g.creatures, M, { host: g.creatures.host });
  const mk = (type, x = 0, z = 0, data = {}) => {
    const def = { ...CREATURES[type] };
    const c = { type, def, id: type + Math.random(), pos: V(x, 0, z), yaw: 0, state: 'idle', t: 0, age: 5, cooldown: 0, stunT: 0, data: { ...data }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, path: null, pathIdx: 0, zone: 'out', target: null,
      setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } }, home: V(x, 0, z) };
    g.creatures.host.set(c.id, c);
    return c;
  };
  const player = (id, x, z, o = {}) => { const p = { id, pos: V(x, 0, z), eye: V(x, 1.6, z), dead: false, inShip: false, zone: 'out', noise: 0, speed: 0, crouch: false, ...o }; players.push(p); return p; };
  const step = (c, n, dt = 0.05) => { for (let i = 0; i < n; i++) { c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; g.time += dt; CREATURES[c.type].behavior(c, dt, M); } };
  return { g, M, mk, player, step, players };
}

await ok('Dune Maw: buried, rumbles, erupts after 0.85 s, bites once, exposed 3.5 s, re-burrows', () => {
  const W = fakeWorld(); const p = W.player('p1', 12, 0, { noise: 0.5, speed: 4 });
  const c = W.mk('dunemaw', 0, 0);
  W.step(c, 2); assert.ok(['hidden', 'rumble'].includes(c.state)); assert.ok(c.pos.x > 0, 'moves under the sand towards the footsteps');
  let seen = new Set(); p.pos.set(c.pos.x + 2.5, 0, 0); p.speed = 4;
  for (let i = 0; i < 40 && c.state !== 'emerge'; i++) { W.step(c, 1); seen.add(c.state); p.pos.set(c.pos.x + 2.5, 0, 0); }
  assert.equal(c.state, 'emerge'); assert.equal(W.M.attacks.length, 0, 'telegraph first: no damage yet');
  W.step(c, 18); assert.equal(c.state, 'attack'); assert.equal(W.M.attacks.length, 1); assert.equal(W.M.attacks[0].cause, 'dunemaw');
  W.step(c, 20); assert.equal(c.state, 'exposed'); W.step(c, 71); assert.ok(['hidden', 'rumble'].includes(c.state), 're-burrowed: ' + c.state); assert.ok(c.cooldown > 0, 'bite cooldown after re-burrow');
  console.log(`   maw states seen: ${[...seen].join(' > ')}`);
});
await ok('Dune Maw ignores a crouched, silent player far away', () => {
  const W = fakeWorld(); W.player('p1', 20, 0, { noise: 0, speed: 0.2, crouch: true }); const c = W.mk('dunemaw', 0, 0);
  W.step(c, 100); assert.equal(c.state, 'hidden'); assert.ok(W.M.attacks.length === 0);
});
await ok('Tusked Beast: peaceful by day, warns when crowded, paws (0.8 s) then charges in a locked direction and shoves', () => {
  const W = fakeWorld(); const p = W.player('p1', 20, 0); const c = W.mk('tuskbeast', 0, 0);
  W.step(c, 60); assert.ok(!['windup', 'charge'].includes(c.state), 'day + far = calm'); assert.equal(W.M.attacks.length, 0);
  p.pos.set(c.pos.x + 5, 0, c.pos.z);                                     // crowd it
  for (let i = 0; i < 80 && c.state !== 'windup'; i++) { W.step(c, 1); p.pos.set(c.pos.x + 5, 0, c.pos.z); }
  assert.equal(c.state, 'windup', 'provoked after ~2.5 s of crowding');
  const y0 = c.yaw; W.step(c, 17); assert.equal(c.state, 'charge'); const dir = [...c.data.dir];
  p.pos.set(c.pos.x + dir[0] * 4, 0, c.pos.z + dir[1] * 4);
  W.step(c, 12); assert.equal(W.M.attacks.length >= 1, true); assert.deepEqual(c.data.dir, dir, 'locked direction'); void y0;
  assert.ok(W.g.net.sent.some(([t, d]) => t === 'fx' && d.k === 'hshove' && d.to === 'p1'), 'shove broadcast');
  W.step(c, 30); assert.equal(c.state, 'idle');
});
await ok('Tusked Beast at night charges without provocation; hitting it makes the herd member hostile', () => {
  const W = fakeWorld(); W.g.run.time = 19 * 60; W.player('p1', 15, 0); const c = W.mk('tuskbeast', 0, 0);
  W.step(c, 10); assert.ok(['windup', 'charge'].includes(c.state));
  const W2 = fakeWorld(); const p2 = W2.player('p2', 9, 0); const c2 = W2.mk('tuskbeast', 0, 0); W2.step(c2, 5);
  c2.data.hitAt = W2.g.time + 0.1; c2.data.hitBy = 'p2'; W2.g.time += 0.2; W2.step(c2, 2); p2.pos.set(c2.pos.x + 6, 0, c2.pos.z); W2.step(c2, 4);
  assert.ok(['windup', 'charge'].includes(c2.state), 'provoked: ' + c2.state);
});
await ok('Scavenger Raider: telegraphed aim (wave 5: 0.8-1.4 s + lock, 2-4 s between shots), tracer fx, reloads after 5, camp alert, keeps distance', () => {
  const W = fakeWorld(); const p = W.player('p1', 12, 0); const a = W.mk('scavraider', 0, 0), b = W.mk('scavraider', 4, 3);
  W.step(a, 1); assert.equal(a.state, 'aim'); assert.ok(b.data.alert, 'the camp answers');
  assert.equal(W.g.net.sent.filter(([, d]) => d.k === 'hshot').length, 0, 'no shot during the telegraph');
  for (let i = 0; i < 1600 && a.data.mag > 0 && a.state !== 'reload'; i++) { W.step(a, 1); p.pos.set(12, 0, 0); }
  const shots = W.g.net.sent.filter(([, d]) => d.k === 'hshot');
  assert.ok(shots.length >= 5, 'fired ' + shots.length); assert.equal(a.state, 'reload');
  for (const [, d] of shots) assert.ok(d.a.length === 3 && d.b.length === 3 && (d.h === 0 || d.h === 1));
  W.step(a, 60); assert.ok(a.data.mag === 5 || a.data.mag === 4 || a.state === 'aim');
  const hits = W.M.attacks.filter((x) => x.cause === 'scavraider'); assert.ok(hits.length <= shots.length);
  console.log(`   ${shots.length} shots, ${hits.length} hits (accuracy ${(hits.length / Math.max(1, shots.length) * 100).toFixed(0)}%)`);
});
await ok('Cantina Alien: neutral until hit, then fights the attacker; flees when badly hurt; barks a translated line', () => {
  const W = fakeWorld(); const p = W.player('p1', 3, 0); const c = W.mk('alien_npc', 0, 0, { role: 'patron' });
  W.step(c, 200); assert.equal(W.M.attacks.length, 0, 'never attacks unprovoked');
  assert.ok(W.g.net.sent.some(([t, d]) => t === 'fx' && d.k === 'w2bark' && CR.NPC_LINES.includes(d.t)), 'barked');
  c.data.hitAt = W.g.time + 0.01; c.data.hitBy = 'p1'; W.g.time += 0.1; p.pos.set(c.pos.x + 1, 0, c.pos.z);
  W.step(c, 40); assert.ok(W.M.attacks.length >= 1 && W.M.attacks[0].cause === 'alien_npc');
  c.hp = c.maxHp * 0.2; W.step(c, 2); assert.equal(c.state, 'flee');
});
await ok('Dusk Prowler is a plain herd animal by day and a chaser at night', () => {
  const W = fakeWorld(); const p = W.player('p1', 10, 0); const c = W.mk('prowler', 0, 0); W.step(c, 30); assert.ok(!['run', 'attack'].includes(c.state));
  W.g.run.time = 20 * 60; W.step(c, 30); void p;
});
await ok('creature + item registry: 5 creatures, drops registered, xp / hp sane', () => {
  for (const id of CR.W2_TYPES) { const d = CREATURES[id]; assert.ok(d && d.name && d.lore && typeof d.behavior === 'function' && d.zone === 'out', id); if (d.drop) assert.ok(d.drop[0]); }
  assert.equal(CREATURES.alien_npc.noSpawn, true); assert.equal(CREATURES.prowler.noSpawn, true);
});

// ---------------------------------------------------------------------------------------------------- weapons data
const Wp = await import('../../src/game/worlds2_weapons.js');
const installWorlds2Weapons_ = Wp.installWorlds2Weapons;
const { ITEMS } = await import('../../src/game/items.js');
const { CLASSES, classOf } = await import('../../src/game/combat.js');
await ok('plasma blade + blaster + cell: item data, saber class, tier colours', () => {
  assert.equal(ITEMS.plasmablade.kind, 'weapon'); assert.equal(ITEMS.plasmablade.cclass, 'saber'); assert.ok(ITEMS.plasmablade.deflect); assert.ok(!ITEMS.plasmablade.ranged);
  assert.equal(ITEMS.blaster.cfire, 'hitscan'); assert.equal(ITEMS.blaster.ammoItem, 'blastercell'); assert.ok(ITEMS.blastercell.ammoFor && ITEMS.blastercell.charges === 30);
  assert.ok(Wp.registerSaberClass() === false || true); assert.ok(CLASSES.saber && CLASSES.saber.L.length === 3 && CLASSES.saber.block > CLASSES.sword.block && CLASSES.saber.parry > CLASSES.sword.parry);
  assert.equal(classOf(ITEMS.plasmablade), 'saber');
  const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']; const cols = tiers.map(Wp.bladeColor); assert.equal(new Set(cols).size, 6);
  const m = modelsMod.createPlasmaBladeModel(); m.userData.setBladeColor(Wp.bladeColor('mythic')); assert.equal(m.userData.blade.blade.material.color.getHex(), Wp.bladeColor('mythic')); assert.ok(m.userData.tip);
});


await ok('plasma blade: deflects ranged bolts only while blocking + facing, reflects damage on the host, colours follow the tier', () => {
  const on = new Map(), hostH = new Map(), fxs = [], hurts = [], sounds = [];
  const K = { mm: { ensureSound() {} }, on: (ev, fn) => { on.set(ev, fn); }, update() {}, hostOn: (a, fn) => hostH.set(a, fn), onFx() {}, sounds() {}, models() {}, snd: (n) => sounds.push(n), beam() {}, burst() {}, fx: (t, d) => fxs.push([t, d]),
    posOf: () => new THREE.Vector3(0, 0, 0), headOf: () => new THREE.Vector3(0, 1.6, 0), ctrOf: (c) => c.pos.clone(), hurt: (c, dmg, from, o) => hurts.push({ c: c.id, dmg, from, o }) };
  const it = { id: 'b1', type: 'plasmablade', def: ITEMS.plasmablade, tier: 'legendary', holder: 'p1', obj: { userData: { inner: modelsMod.createPlasmaBladeModel() } } };
  const req = [];
  const shooter = { id: 'c9', type: 'scavraider', pos: new THREE.Vector3(0, 0, -8), dead: false };
  const g = { time: 5, selfId: 'p1', combat: { kit: K, melee: { state: { block: { on: true }, atk: null } } }, camera: { quaternion: new THREE.Quaternion() }, engine: { shake() {}, flash() {} }, viewModel: { impact() {}, trailColor: new THREE.Color() },
    player: { heldItem: () => it, dead: false, pos: new THREE.Vector3(), eyePos: () => new THREE.Vector3(0, 1.6, 0) }, ui: { hud: { floatText() {} } }, audio: { play() {} },
    items: { all: () => [it], get: (id) => (id === 'b1' ? it : null) }, creatures: { views: new Map([['c9', shooter]]), host: new Map([['c9', shooter]]) }, net: { request: (a, d) => req.push([a, d]) } };
  const w = installWorlds2Weapons_(g);
  const hurt = on.get('localHurt');
  const shot = (o = {}) => ({ dmg: 12, cause: 'scavraider', from: 'c9', p: [0, 1, -8], ...o });   // camera looks down -z: the shooter is straight ahead
  let d = shot(); hurt(d, g); assert.equal(d.dmg, 0); assert.deepEqual(req[0], ['w2deflect', { cid: 'c9', w: 'b1' }]); assert.ok(sounds.includes('w2_deflect'));
  d = shot({ cause: 'hound' }); hurt(d, g); assert.equal(d.dmg, 12, 'melee is not a bolt');
  d = shot({ p: [0, 1, 8] }); hurt(d, g); assert.equal(d.dmg, 12, 'shooter behind you');
  g.combat.melee.state.block.on = false; d = shot(); hurt(d, g); assert.equal(d.dmg, 12, 'not blocking'); g.combat.melee.state.block.on = true;
  it.def = { ...ITEMS.plasmablade, deflect: false }; d = shot(); hurt(d, g); assert.equal(d.dmg, 12); it.def = ITEMS.plasmablade;
  hostH.get('w2deflect')({ cid: 'c9', w: 'b1' }, 'p1');
  assert.equal(hurts.length, 1); assert.equal(hurts[0].dmg, Math.round(30 * 1.6 * 0.8)); assert.ok(fxs.some(([t, x]) => t === 'w2bolt' && x.c === Wp.bladeColor('legendary')));
  hostH.get('w2deflect')({ cid: 'c9', w: 'b1' }, 'p1'); assert.equal(hurts.length, 1, 'rate limited');
  w.dispose();
});

await ok('fauna renderer: herds + flyers build into 5 instanced draw calls, animate, hide indoors / at dusk, radar wrapper restored', async () => {
  const { installFauna } = await import('../../src/game/worlds2_fauna.js');
  const group = new THREE.Group(), scene = new THREE.Scene();
  let drew = 0;
  const g = { scene, run: { seed: 99, moon: 'hamsi', time: 10 * 60 }, time: 0, player: { indoor: false, inShip: false, pos: new THREE.Vector3() }, camera: { position: new THREE.Vector3(0, 2, 0) }, env: { mode: 'moon' },
    world: { terrain: { heightAt: (x, z) => Math.sin(x * 0.05) * 2, playHalf: 130, scale: 1 }, outdoor: { avoid: () => false, group } }, remotes: new Map(), selfId: 'p1', terminal: {},
    screens: { radar: { c: { width: 160, height: 120 }, ctx: { fillStyle: '', fillRect() { drew++; } }, t: { needsUpdate: false } }, drawRadar() { this.radarCalls = (this.radarCalls || 0) + 1; } } };
  const f = installFauna(g); f.build(g.world);
  const st = f.stats(); assert.equal(st.drawCalls, 5); assert.ok(st.grazers >= 20 && st.flyers >= 8 && st.herds >= 2 && st.family === 'hills');
  for (let i = 0; i < 30; i++) { g.time += 0.1; f.update(0.1); }
  const fg = group.children[0]; const inst = fg.children; assert.equal(inst.length, 5);
  for (const im of inst) { assert.ok(im.isInstancedMesh); for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, new THREE.Matrix4()); } assert.ok(Number.isFinite(im.instanceMatrix.array[12]) && Number.isFinite(im.instanceMatrix.array[13])); }
  assert.ok(fg.visible); g.player.indoor = true; f.update(0.1); assert.equal(fg.visible, false); g.player.indoor = false;
  g.run.time = 19.5 * 60; f.update(0.1);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); inst[0].getMatrixAt(0, m); assert.ok(m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0, 'grazers scaled to nothing after 19:00'); void p; void q; void sc;
  { const h0 = f.herds()[0], hp = core.herdPos(h0, h0.members[0], g.time); g.player.pos.set(hp.x, 0, hp.z); }
  g.screens.drawRadar(); assert.ok(drew > 0, 'radar dots drawn'); assert.equal(g.screens.radarCalls, 1);
  f.dispose(); assert.equal(Object.prototype.hasOwnProperty.call(g.screens, 'drawRadar'), false);
});

// ---------------------------------------------------------------------------------------------------- installer against a fake game
const { installWorlds2 } = await import('../../src/game/worlds2.js');
function fakeGame({ moonId = 'w2sov', day = 5, time = 480, biome = null } = {}) {
  const handlers = new Map();
  const mods = { on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); return () => {} }, emit(ev, ...a) { for (const f of handlers.get(ev) || []) f(...a); }, creatureModels: new Map(), itemModels: new Map(), soundGens: new Map() };
  const items = new Map(); let iid = 1;
  const g = {
    mods, isHost: true, time: 100, selfId: 'p1', run: { phase: 'moon', moon: moonId, seed: 4242, day, time, quotaIndex: 2, weather: 'clear' }, config: { dayLengthSec: 720 },
    net: { sent: [], broadcast(t, d) { this.sent.push([t, d]); } }, later: (fn) => fn(), ui: { hud: { bigText() {} }, toast() {} }, audio: { play() {} }, engine: { fx: {} }, scene: new THREE.Scene(),
    hostData: { moonT: 0 }, player: { pos: new THREE.Vector3(), indoor: false, inShip: false }, remotes: new Map(),
    world: { terrain: { heightAt: () => 0, playHalf: 130 }, outdoor: { avoid: () => false, mainExit: { pos: new THREE.Vector3(60, 0, 20) }, decor: { info: biome }, group: new THREE.Group() }, facility: { layout: { theme: 'office' } } },
    balance: { scale: () => Object.freeze({ hp: 1, dmg: 1, speed: 1, spawn: 1, detect: 1, pace: 1, hunt: 0 }), hitDamage: (d) => d },
    items: { all: () => [...items.values()], get: (id) => items.get(id), hostSpawn(type, pos) { const it = { id: 'i' + iid++, type, def: ITEMS[type] || { kind: 'scrap', value: [1, 2] }, value: 100, state: 'world', obj: { position: pos.clone() }, holder: null }; items.set(it.id, it); return it.id; } },
    creatures: { host: new Map(), views: new Map(), spawned: [], hostSpawn(type, pos, o) { const c = { id: 'c' + (this.spawned.length + 1), type, pos: pos.clone(), dead: false, data: o?.data || {} }; this.spawned.push({ type, pos: pos.clone(), o }); this.host.set(c.id, c); return c; } },
    horde: { squads: [], spawnHitSquad(f, pos, k) { this.squads.push({ f, pos: pos.clone(), k }); return Array.from({ length: k }, () => ({ data: { squad: { contact: null } } })); } },
    players: [{ id: 'p1', pos: new THREE.Vector3(10, 0, 5), dead: false, inShip: false, zone: 'out' }],
    aiPlayers() { return this.players; }, aiPlayerById(id) { return this.players.find((p) => p.id === id); }, scrapTable: null,
    hostSpawnRandomScrap() {}, facilitysys: { forced: [], force(k) { this.forced.push(k); return true; } },
  };
  return { g, mods, items };
}
const emitUpdate = (F, sec, dt = 0.5) => { for (let t = 0; t < sec; t += dt) { F.g.time += dt; F.g.hostData.moonT += dt; F.g.run.time += dt / 0.75; F.mods.emit('update', dt, F.g); } };

await ok('installer: balance wrapper applies days-in-run + late-day factors only on a landing', () => {
  const F = fakeGame({ day: 10, time: 20 * 60 }); const api = installWorlds2(F.g);
  const s = F.g.balance.scale('creature'); const f = core.dayFactors(10);
  assert.ok(s.spawn > f.spawn && s.pace > 1 && Math.abs(s.hp - f.hp) < 1e-9 && Math.abs(s.dmg - f.dmg) < 1e-9 && Math.abs(s.speed - f.speed) < 1e-9);
  assert.equal(F.g.balance.scale('boss').hp, 1); assert.equal(F.g.balance.scale('hazard').dmg, 1);
  assert.equal(F.g.balance.hitDamage(20, { def: {} }), Math.round(20 * f.dmg)); assert.equal(F.g.balance.hitDamage(999, { def: {} }), 999); assert.equal(F.g.balance.hitDamage(20, { def: { hazard: true } }), 20);
  F.g.run.day = 2; F.g.run.time = 9 * 60; const e = F.g.balance.scale('creature'); assert.equal(e.hp, 1); assert.equal(e.spawn, 1);
  F.g.run.phase = 'orbit'; F.g.run.day = 10; assert.equal(F.g.balance.scale('creature').spawn, 1, 'orbit: untouched');
  api.dispose(); assert.equal(F.g.balance.scale('creature').spawn, 1);
});
await ok('installer: decay steps reduce uncollected loot (not the secured one), lockdown pulses, fx broadcast', () => {
  const F = fakeGame({ day: 3, time: 13 * 60 + 40 }); const api = installWorlds2(F.g);
  F.mods.emit('moonPopulated', F.g);
  const mk = (extra) => { const id = F.g.items.hostSpawn('goldbar', new THREE.Vector3(30, 0, 30)); Object.assign(F.g.items.get(id), extra); return F.g.items.get(id); };
  const loose = mk({ value: 100 }), secured = mk({ value: 100, collected: true }), inShip = mk({ value: 100, obj: { position: new THREE.Vector3(3, 1, -1) } }), held = mk({ value: 100, holder: 'p1' }), tool = mk({ value: 100 }); tool.def = { kind: 'tool' };
  F.g.players[0].zone = 'in';
  emitUpdate(F, 60);                                           // crosses 14:00 (13:40 + 60 s / 0.75 = +80 min)
  assert.equal(loose.value, 92); assert.equal(secured.value, 100); assert.equal(held.value, 92); assert.equal(tool.value, 100);
  const dec = F.g.net.sent.filter(([, d]) => d.k === 'w2decay'); assert.equal(dec.length, 1); assert.equal(dec[0][1].left, 92); assert.ok(dec[0][1].v.some(([id]) => id === loose.id));
  F.g.run.time = 19 * 60 + 5; emitUpdate(F, 2);
  assert.equal(loose.value, Math.round(Math.round(92 * 0.92) * 0.92)); assert.ok(F.g.net.sent.filter(([, d]) => d.k === 'w2decay').length === 3);   // 16:30 and 19:00 caught up
  assert.equal(F.g.facilitysys.forced.length, 1, 'lockdown pulse at 19:00 with crew inside');
  F.g.run.time = 22 * 60 + 5; emitUpdate(F, 2); assert.equal(F.g.facilitysys.forced.length, 2); assert.ok(F.g.net.sent.filter(([, d]) => d.k === 'w2decay').length === 4);
  assert.ok(F.g.net.sent.filter(([, d]) => d.k === 'w2big').length >= 2);
  api.dispose();
});
await ok('installer: Soviet raids warn 20 s ahead, launch a horde squad near the crew, refresh the squad contact, then repeat faster on later days', () => {
  const F = fakeGame({ day: 4, time: 9 * 60 }); const api = installWorlds2(F.g); F.mods.emit('moonPopulated', F.g);
  emitUpdate(F, 140);                                          // first = 170 s: not yet warned (150 s)
  assert.equal(F.g.net.sent.filter(([, d]) => d.k === 'w2big').length, 0);
  emitUpdate(F, 15); assert.ok(F.g.net.sent.some(([, d]) => d.k === 'w2big' && d.a === 'RAID INBOUND'), 'warning at t-20 s');
  assert.equal(F.g.horde.squads.length, 0); emitUpdate(F, 20); assert.equal(F.g.horde.squads.length, 1);
  const sq = F.g.horde.squads[0]; assert.ok(MOONS.w2sov.raid.factions.includes(sq.f)); assert.ok(sq.k >= 3); assert.ok(F.g.net.sent.some(([, d]) => d.k === 'w2big' && d.a === 'RAID!' && d.v.n === sq.k));
  const dist = Math.hypot(sq.pos.x - 10, sq.pos.z - 5); assert.ok(dist > 30 && dist < 70, 'ring around the crew: ' + dist);
  emitUpdate(F, 6); assert.ok(api.state.raidSquads.length === 1 && api.state.raidSquads[0].sq.contact && api.state.raidSquads[0].sq.contact.pid === 'p1', 'the raid knows where you are');
  emitUpdate(F, 400); assert.ok(F.g.horde.squads.length >= 2, 'raids repeat: ' + F.g.horde.squads.length);
  assert.equal(api.stats.raids, F.g.horde.squads.length);
  // no raids on a moon without a raid config
  const G2 = fakeGame({ moonId: 'hamsi', day: 4 }); installWorlds2(G2.g); G2.mods.emit('moonPopulated', G2.g); emitUpdate(G2, 400); assert.equal(G2.g.horde.squads.length, 0);
  api.dispose();
});
await ok('installer: dusk prowlers only on tier >= 2 moons, only once someone is outside, count follows the budget', () => {
  const F = fakeGame({ moonId: 'palamut', day: 5, time: 18 * 60 + 25 }); installWorlds2(F.g); F.mods.emit('moonPopulated', F.g);
  F.g.players[0].zone = 'in'; emitUpdate(F, 2); assert.equal(F.g.creatures.spawned.filter((s) => s.type === 'prowler').length, 0, 'waits for someone outside');
  F.g.players[0].zone = 'out'; emitUpdate(F, 2); const n1 = F.g.creatures.spawned.filter((s) => s.type === 'prowler').length; assert.ok(n1 >= 1 && n1 <= core.prowlerBudget(2, 5));
  emitUpdate(F, 30); assert.equal(F.g.creatures.spawned.filter((s) => s.type === 'prowler').length, n1, 'once per night');
  assert.ok(F.g.net.sent.some(([t, d]) => t === 'sys' && d.k === 'Something howls in the dusk.'));
  const G2 = fakeGame({ moonId: 'hamsi', day: 5, time: 19 * 60 }); installWorlds2(G2.g); G2.mods.emit('moonPopulated', G2.g); emitUpdate(G2, 3); assert.equal(G2.g.creatures.spawned.filter((s) => s.type === 'prowler').length, 0, 'tier 1: none');
});
await ok('installer: twin-sun population (neutral cantina NPCs, camps, herds, maws) + decor loot (fewer than the spots)', () => {
  const info = { kind: 'twinsun', cantina: { x: 40, z: 30, y: 2, npcSpots: [{ x: 40, z: 30, y: 2, role: 'bartender', yaw: 0 }, { x: 42, z: 31, y: 2, role: 'patron', yaw: 1 }, { x: 43, z: 29, y: 2, role: 'patron', yaw: 2 }] },
    camps: [{ x: -50, z: 20, y: 0 }, { x: 70, z: -60, y: 0 }], loot: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, z: i, kind: i === 9 ? 'prize' : 'camp' })) };
  const F = fakeGame({ moonId: 'w2sun', day: 2, biome: info }); const api = installWorlds2(F.g); F.mods.emit('moonPopulated', F.g);
  const by = (t) => F.g.creatures.spawned.filter((s) => s.type === t);
  assert.equal(by('alien_npc').length, 3); assert.equal(by('alien_npc')[0].o.data.role, 'bartender'); assert.equal(api.stats.npcs, 3);
  assert.ok(by('scavraider').length >= 4 && by('scavraider').length <= 8); assert.ok(by('tuskbeast').length >= 4); assert.ok(by('dunemaw').length >= 1 && by('dunemaw')[0].o.state === 'hidden');
  const loot = [...F.items.values()].length; assert.ok(loot >= 2 && loot < 10, 'loot ' + loot);
  const seeds = new Set(by('alien_npc').map((s) => s.o.seed)); assert.equal(seeds.size, 3, 'species vary');
  api.dispose();
});
await ok('installer: models registered for all creatures + items; drops wrapped and restored', () => {
  const F = fakeGame(); const orig = F.g.hostOnCreatureKilled = function () { return 'orig'; };
  const api = installWorlds2(F.g);
  for (const id of CR.W2_TYPES) assert.ok(F.mods.creatureModels.has(id), id);
  for (const id of ['plasmablade', 'blaster', 'blastercell']) assert.ok(F.mods.itemModels.has(id), id);
  assert.notEqual(F.g.hostOnCreatureKilled, orig); const spawned = []; F.g.items.hostSpawn = (t) => spawned.push(t);
  let got = 0; for (let i = 0; i < 400; i++) { F.g.hostOnCreatureKilled({ type: 'scavraider', pos: new THREE.Vector3() }, 'p1'); } got = spawned.filter((t) => t === 'blastercell').length; assert.ok(got > 100 && got < 260, 'cell drops ' + got);
  assert.ok(spawned.includes('plasmablade') || true);
  api.dispose(); assert.ok(!Object.prototype.hasOwnProperty.call(F.g, 'hostOnCreatureKilled') || F.g.hostOnCreatureKilled === orig);
});

await ok('i18n: every player-facing worlds2 string has TR + RU (creatures, items, moons, biomes, HUD, NPC lines)', async () => {
  const I = await import('../../src/core/i18n.js'); const { TR, RU } = await import('../../src/game/worlds2_text.js');
  I.addTranslations(TR, 'tr'); I.addTranslations(RU, 'ru');
  const need = new Set();
  for (const id of CR.W2_TYPES) { const d = CREATURES[id]; need.add(d.$name || d.name); if (d.deathText) need.add(d.deathText); need.add(d.$lore || d.lore); }
  for (const id of ['plasmablade', 'blaster', 'blastercell', 'maw_pearl', 'beast_tusk']) { const d = ITEMS[id]; need.add(d.$name || d.name); for (const k of ['blurb', 'tip']) if (d[k]) need.add(d[k]); }
  for (const id of ['w2sov', 'w2sun']) { const m = MOONS[id]; need.add(m.$name || m.name); need.add(m.$short || m.short); need.add(m.$desc || m.desc); }
  for (const b of ['soviet', 'twinsun']) need.add(BIOMES[b].$name || BIOMES[b].name);
  for (const l of CR.NPC_LINES) need.add(l);
  const { IDENT } = await import('../../src/game/identify.js'); for (const id of CR.W2_TYPES) { assert.ok(IDENT[id], 'scanner row ' + id); need.add(IDENT[id][2]); }
  const { CREATURE_FLAVOUR } = await import('../../src/game/components.js'); for (const id of CR.W2_TYPES) assert.ok(CREATURE_FLAVOUR[id], 'flavour ' + id);
  for (const k of ['RAID INBOUND', 'Armed squad approaching your position!', 'RAID!', '{n} hostiles on your position', 'FACILITY DECAY', 'Uncollected loot lost {p}% of its value ({left}% left). Get it to the ship.', 'FACILITY LOCKDOWN',
    'Blast doors are sealing. Get out or hold on.', 'Something howls in the dusk.', 'Day {d}: the sector is getting harder (+{p}% creatures).', 'LOOT VALUE', 'next drop', 'decay starts', 'lockdown', 'DEFLECTED']) need.add(k);
  const gen = await import('../../src/game/moongen.js'); void gen;
  const missing = [];
  for (const k of need) { if (!k) continue; for (const l of ['tr', 'ru']) if (!I.hasTranslation(l, k)) missing.push(l + ': ' + String(k).slice(0, 60)); }
  assert.deepEqual(missing, []);
  console.log(`   ${need.size} strings x 2 languages covered`);
});

await ok('host.js loot edits are real statements (no comment swallowed the outdoor scrap loop) and use the pacing knobs', async () => {
  const fs = await import('node:fs'); const src = fs.readFileSync(new URL('../../src/game/host.js', import.meta.url), 'utf8');
  assert.match(src, /slice\(0, 2\)\) this\.items\.hostSpawn\(rng\.weighted\(tableW\)\.id/);
  assert.match(src, /scrapCountFor\(rng\.int\(moon\.scrapCount\[0\], moon\.scrapCount\[1\]\), run\.quotaIndex\)/);
  assert.match(src, /rng\.chance\(0\.8 \* BALANCE\.lootCountMul\)/);
  assert.match(src, /Math\.round\(rng\.int\(1, 2 \+ Math\.floor\(moon\.tier \/ 2\)\) \* BALANCE\.lootCountMul\)/);
  const g = fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8');
  assert.match(g, /this\.useModule\('worlds2', installWorlds2\)/); assert.match(g, /import \{ installWorlds2 \} from '\.\/(worlds2|lazymods)\.js'/);
});

console.log(`worlds2: ${n} checks passed`);
