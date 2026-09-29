// Node tests for the wave 8 creature director. node tools/harness/crdirector.test.mjs            (checks)
//                                               node tools/harness/crdirector.test.mjs --report   (before/after concurrent-hostile table used by docs/wave8/creatures_audit.md)
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const K = await import('../../src/game/crdirector_core.js');
const N = await import('../../src/game/crdirector_creatures.js');
const I = await import('../../src/game/crdirector_i18n.js');
const C = await import('../../src/game/creatures.js');
const R = await import('../../src/game/balance_rules.js');
const { MOONS } = await import('../../src/game/moons.js');
const { scaleFor } = await import('../../src/game/balance_core.js');
const { hasTranslation } = await import('../../src/core/i18n.js');
for (const [m, f] of [['horror_creatures', 'registerHorrorCreatures'], ['maps5_creatures', 'registerMaps5Creatures'], ['mirror_creatures', 'registerMirrorCreatures'],
  ['worlds2_creatures', 'registerWorlds2Creatures'], ['creatures_backrooms', 'registerBackroomsCreatures'], ['skeletons', 'registerSkeletonContent'], ['stealth', 'registerStealthCreatures']]) {
  try { (await import(`../../src/game/${m}.js`))[f]?.(); } catch { /* optional content */ }
}
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const V = (x = 0, z = 0, y = 0) => ({ x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z); } });
const seq = (a) => { let i = 0; return () => a[i++ % a.length]; };

// ------------------------------------------------------------------------------------------------ budget maths
const c0 = { q: 0, tier: 1 }, c2 = { q: 2, tier: 2 }, c4 = { q: 4, tier: 3 };
ok(K.capOf(c0) >= 3 && K.capOf(c0) <= 4, 'quota 0 cap is 3-4 points (2-3 small hostiles): ' + K.capOf(c0));
ok(K.capOf(c0) < K.capOf(c2) && K.capOf(c2) < K.capOf(c4), 'cap grows with quota / tier');
ok(K.capOf({ ...c4, hard: true }) > K.capOf(c4) && K.capOf({ ...c4, danger: 1.22 }) > K.capOf(c4) && K.capOf({ ...c4, danger: 0.78 }) < K.capOf(c4), 'hard mode / daily event danger scale the cap');
ok(K.capOf({ q: 99, tier: 4, hard: true, danger: 3, pressure: 3 }) <= K.TUNE.capMax && K.capOf({ q: 0, tier: 1, danger: 0.1 }) >= K.TUNE.capMin, 'cap is clamped');
ok(K.residentsFor(0) === 1 && K.residentsFor(3) === 1 && K.residentsFor(4) === 2, 'residents');
ok(K.costOf('crawler', C.CREATURES.crawler) === 2 && K.costOf('turret', C.CREATURES.turret) === 0 && K.costOf('jester', C.CREATURES.jester) === 3, 'costs = vanilla power, hazards free');
ok(!K.isCounted('web', C.CREATURES.web) && !K.isCounted('x', { boss: true, dmg: 50 }) && K.isCounted('lurker', C.CREATURES.lurker), 'what is budgeted');

// phase machine: order, lengths, first calm, early peak end, no release in calm / relax
const rnd = seq([0.5]);
const st = K.newState(c0, rnd);
ok(st.phase === 'calm' && st.len >= 80 * 0.96 && st.len <= 105, 'first calm ~90 s: ' + st.len);
const order = []; let t = 0, guard = 0;
while (order.length < 9 && guard++ < 20000) { const ph = K.step(st, 0.25, c0, rnd, { active: 0, cap: 3.5 }); t += 0.25; if (ph) order.push(ph); }
ok(order.join() === 'build,peak,relax,calm,build,peak,relax,calm,build', 'phase order: ' + order.join());
ok(!K.mayRelease({ phase: 'calm', gapT: 0 }, c0, 0, 1) && !K.mayRelease({ phase: 'relax', gapT: 0 }, c0, 0, 1), 'nothing is released in calm / relax');
ok(K.mayRelease({ phase: 'peak', gapT: 0 }, c0, 0, 2) && !K.mayRelease({ phase: 'peak', gapT: 0 }, c0, 3, 2) && !K.mayRelease({ phase: 'peak', gapT: 2 }, c0, 0, 1), 'peak: room + gap');
ok(K.mayRelease({ phase: 'build', gapT: 0 }, c0, 0, 1) && !K.mayRelease({ phase: 'build', gapT: 0 }, c0, 1.5, 1), 'build only fills ~55 % of the cap');
const s2 = { phase: 'peak', t: 0, len: 40, cycle: 1, gapT: 0, overT: 0 };
K.step(s2, 5, c0, rnd, { active: 1, cap: 3.5, stress: true }); ok(s2.phase === 'relax', 'a hurt crewmate ends the peak early');
const s3 = { phase: 'peak', t: 0, len: 40, cycle: 1, gapT: 0, overT: 0 };
for (let i = 0; i < 40; i++) K.step(s3, 0.25, c0, rnd, { active: 9, cap: 3.5 }); ok(s3.phase === 'relax', 'others overspawning ends the peak early');
// active threat: far idle does not count, near / hunting / fresh does
const crew = [{ x: 0, z: 0, zone: 'in', dead: false }];
const cr = (o) => ({ type: 'crawler', def: C.CREATURES.crawler, state: 'idle', dead: false, x: 100, z: 0, zone: 'in', age: 99, ...o });
ok(K.activeThreat([cr({})], crew).sum === 0 && K.activeThreat([cr({ x: 10 })], crew).sum === 2 && K.activeThreat([cr({ state: 'run' })], crew).sum === 2 && K.activeThreat([cr({ age: 3 })], crew).sum === 2, 'active = near / hunting / fresh');
ok(K.activeThreat([cr({ x: 5, state: 'dormant' }), cr({ x: 5, dead: true }), cr({ x: 5, zone: 'out' })], crew).sum === 0, 'sleeping / dead / other zone are not active');
// queue
const q = []; for (let i = 0; i < 10; i++) K.enqueue(q, { zone: 'in', type: 'x', cost: 1 }, i);
ok(q.length === K.TUNE.queueMax, 'queue is bounded'); K.expire(q, 9 + K.TUNE.queueTtl + 1); ok(q.length === 0, 'queue entries expire');
const q2 = [{ zone: 'out', cost: 1.5, t: 0 }, { zone: 'in', cost: 1, t: 0 }]; const pk = K.pickRelease(q2, { phase: 'peak', gapT: 0 }, c0, 0, (e) => e.cost, (z) => z === 'in');
ok(pk === 1, 'a closed zone is skipped');
// edge cue: camera looks along -z; +x is right
ok(K.edgeOf(0, -5, 0, -1) === 'f' && K.edgeOf(0, 5, 0, -1) === 'b' && K.edgeOf(5, 0, 0, -1) === 'r' && K.edgeOf(-5, 0, 0, -1) === 'l', 'edge of the danger');
// telegraph tables
const types = Object.keys(K.TELLS);
ok(types.every((k) => K.TELLS[k].s.length && K.TELLS[k].r > 0 && K.TELLS[k].v > 0), 'every tell has a sound, radius, volume');
ok(new Set(types.map((k) => K.TELLS[k].s[0] + '|' + K.TELLS[k].p)).size >= types.length - 3, 'signature cues are (nearly) all distinct');
ok(['scuttler', 'crawler', 'lurker', 'spider', 'hound', 'giant', 'listener', 'moderator', 'cd_dimmer', 'cd_follower', 'cd_auditor'].every((k) => K.TELLS[k]), 'core creatures have a tell');
ok(Object.keys(I.RULE_LINES).every((k) => I.RULE_LINES[k].every((s) => s && s.length > 8)) && Object.values(I.RULE_LINES).every(([en]) => hasTranslation('tr', en) && hasTranslation('ru', en)), 'EN + TR + RU rule lines');
ok(I.RULE_LINES.listener[0].startsWith('THE LISTENER — it hunts sound. Stand still.'), 'owner example line');
ok(['The Dimmer', 'The Follower', 'The Auditor'].every((k) => hasTranslation('tr', k) && hasTranslation('ru', k)) && Object.values(N.DEFS).every((d) => hasTranslation('tr', d.lore) && hasTranslation('ru', d.lore)), 'new creature names + lore translated');

// ------------------------------------------------------------------------------------------------ new creatures: fake manager
function world() {
  const G = { time: 100, items: { list: [], all() { return this.list; }, get(id) { return this.list.find((i) => i.id === id); } }, sent: [], off: [],
    net: { broadcast(t, d) { G.sent.push([t, d]); } }, setItemOn(it, on) { it.on = on; G.off.push(it.id); }, players: [], aiPlayerById(id) { return G.players.find((p) => p.id === id); } };
  const M = {
    game: G, attacks: [], spawned: [], sounds: [], look: new Set(),
    playersFor: () => G.players.filter((p) => !p.dead), nearest(c, list, r = 1e9) { let b = null, bd = r; for (const p of list) { const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z); if (d < bd) { bd = d; b = p; } } return b ? { p: b, d: bd } : null; },
    moveToward(c, to, dt, sp) { const dx = to.x - c.pos.x, dz = to.z - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.4) return true; const s = Math.min(d, sp * dt); c.pos.x += dx / d * s; c.pos.z += dz / d * s; return false; },
    follow: () => true, goTo() {}, wander() {}, attack(c, p, dmg, cause) { M.attacks.push({ c, p, dmg, cause }); }, isLookedAt: (c, p) => M.look.has(p.id),
    placeAt(c, x, z) { c.pos.x = x; c.pos.z = z; }, nav: () => null, hostSpawn(type, pos, o) { M.spawned.push({ type, pos, o }); }, sound(c, s) { M.sounds.push(s); },
  };
  return { G, M };
}
const mkc = (type, o = {}) => ({ id: type, type, def: { ...C.CREATURES[type] || N.DEFS[type] }, data: {}, pos: V(0, 0), yaw: 0, state: 'idle', t: 0, cooldown: 0, age: 5, hp: 100, maxHp: 100, dmg: (N.DEFS[type] || {}).dmg || 10,
  target: null, variant: null, home: V(0, 0), setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } }, ...o });
const pl = (id, x, z, o = {}) => ({ id, pos: V(x, z), look: V(0, -1), dead: false, inShip: false, flash: false, ...o });
const tick = (b, c, M, n, dt = 0.1) => { for (let i = 0; i < n; i++) { c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; b(c, dt, M); } };

// balance: every new def obeys the hit cap of a quota 0-1 crew and never instakills
ok(Object.values(N.DEFS).every((d) => d.dmg <= R.hitCapFrac(0) * 100 && d.noSpawn && d.maxAlive === 1), 'new defs: hits <= 45, no vanilla spawning, one alive');

// FOLLOWER: frozen unless watched; camera flash (stun) is handled by the manager (creature loop skips stunned)
{
  const { G, M } = world(); const f = mkc('cd_follower', { pos: V(0, 30) }); const me = pl('a', 0, 0); G.players.push(me);
  const b = N.followerBehavior();
  tick(b, f, M, 30, 0.1); ok(f.pos.z === 30 && f.state === 'lurk', 'Follower does not move while nobody looks');
  M.look.add('a'); tick(b, f, M, 20, 0.1); ok(f.pos.z < 30 && f.state === 'chase', 'Follower advances while watched');
  const z1 = f.pos.z; tick(b, f, M, 30, 0.1); ok(z1 - f.pos.z > 1.2, 'and speeds up the longer it is watched');
  M.look.clear(); const z2 = f.pos.z; tick(b, f, M, 20, 0.1); ok(f.pos.z === z2 && f.state === 'lurk', 'looking away freezes it again');
  f.pos.z = 1; f.cooldown = 0; M.attacks.length = 0; tick(b, f, M, 2, 0.1); ok(M.attacks.length === 1 && M.attacks[0].dmg === N.DEFS.cd_follower.dmg, 'it strikes anything within arm\'s reach, watched or not');
  tick(b, f, M, 3, 0.1); ok(M.attacks.length === 1, 'one strike per cooldown (the 0.4 s wind-up gate lives in CreatureManager.attack)');
  ok(N.followerBehavior({}) !== undefined && N.FOL.walk < 3 && N.FOL.run < 5, 'Follower is slower than a sprint');
}
// DIMMER: a lit glowstick beats a flashlight; it eats the light and goes on
{
  const { G, M } = world(); const d = mkc('cd_dimmer', { pos: V(0, 0) }); const me = pl('a', 6, 0, { flash: true }); G.players.push(me);
  const stick = { id: 's1', type: 'glowstick', on: true, holder: null, state: 'world', obj: { position: V(-8, 0) } }; G.items.list.push(stick);
  const b = N.dimmerBehavior(); tick(b, d, M, 5, 0.1);
  ok(d.state === 'run' && d.pos.x < 0, 'Dimmer goes for the glowstick, not the flashlight');
  tick(b, d, M, 80, 0.1); ok(d.state === 'feed' || d.state === 'flee' || d.state === 'run', 'it reaches the stick');
  tick(b, d, M, 80, 0.1); ok(stick.on === false && G.off.includes('s1'), 'a fed glowstick goes dark');
  ok(!G.sent.some(([t, m]) => t === 'cd' && m.k === 'dim'), 'no flashlight was eaten while a stick was around');
  const d2 = mkc('cd_dimmer', { pos: V(3, 0) }); const w2 = world(); w2.G.players.push(pl('a', 4.2, 0, { flash: true })); tick(b, d2, w2.M, 3, 0.1);
  ok(d2.state === 'feed' && w2.G.sent.some(([t, m]) => t === 'cd' && m.k === 'dim' && m.to === 'a' && m.ms >= 5000), 'it eats a flashlight: the owner is told (forced off ~6 s)');
  const w3 = world(); w3.G.players.push(pl('a', 4.2, 0, { flash: false })); const d3 = mkc('cd_dimmer', { pos: V(3, 0) }); tick(b, d3, w3.M, 30, 0.1);
  ok(d3.state !== 'feed' && d3.state !== 'run' && w3.M.attacks.length === 0, 'in the dark it ignores you');
}
// AUDITOR: hunts the richest carrier, ignores the poor and the ship, seizes the best item on a hit
{
  const { G, M } = world(); const a = mkc('cd_auditor', { pos: V(0, 0) });
  G.players.push(pl('rich', 10, 0), pl('poor', 5, 0), pl('safe', 4, 0, { inShip: true }));
  const item = (id, holder, value) => ({ id, holder, value, type: 'goldbar', def: { kind: 'scrap' } });
  G.items.list.push(item('i1', 'rich', 120), item('i2', 'poor', 12), item('i3', 'safe', 500), { id: 'w', holder: 'rich', value: 999, type: 'shovel', def: { kind: 'weapon' } });
  ok(N.carriedValue(G.items.list).get('rich') === 120, 'only scrap counts as loot');
  const b = N.auditorBehavior(); tick(b, a, M, 10, 0.1);
  ok(a.state === 'run' && a.target === 'rich' && a.pos.x > 0.5, 'Auditor follows the richest carrier (not the poor one, not the ship)');
  a.pos.x = 9.4; tick(b, a, M, 4, 0.1);
  ok(M.attacks.length === 1 && M.attacks[0].p.id === 'rich' && M.attacks[0].dmg === N.DEFS.cd_auditor.dmg, 'it hits once');
  tick(b, a, M, 8, 0.1); ok(G.sent.some(([t, m]) => t === 'cd' && m.k === 'seize' && m.to === 'rich'), 'the hit makes the carrier drop the best item');
  { const w2 = world(); w2.G.players.push(pl('rich', 10, 0)); w2.G.items.list.push(item('i1', 'rich', 120)); const a2 = mkc('cd_auditor', { pos: V(9.4, 0) }); tick(b, a2, w2.M, 3, 0.1); w2.G.players[0].pos.x = 30; tick(b, a2, w2.M, 8, 0.1); ok(!w2.G.sent.some(([t, m]) => m.k === 'seize'), 'stepping away during the wind-up dodges the seizure'); }
  G.items.list[0].holder = null; a.state = 'idle'; a.pos.x = 0; tick(b, a, M, 3, 0.1); ok(a.state !== 'run', 'once the loot is dropped / handed to a poor player it loses interest');
  ok(N.AUD.walk * 1.8 < 4.5, 'never sprints');
}
// SPIDER: chokepoint webs, ceiling-dust tell before a drop-in behind you, retreat when hurt
{
  const cells = new Set(); for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) if (Math.abs(x) < 2 || Math.abs(z) < 2 || (x > 4 && x < 9 && z > 4 && z < 9)) cells.add(x + ',' + z);   // a plus-shaped corridor + a room
  const nav = { randomWalkable(r, x, z, rad) { for (let i = 0; i < 80; i++) { const gx = Math.round(x + (r() * 2 - 1) * rad), gz = Math.round(z + (r() * 2 - 1) * rad); if (cells.has(gx + ',' + gz)) return { x: gx, z: gz }; } return null; },
    toGrid: (x, z) => [Math.round(x), Math.round(z)], isWalkable: (gx, gz) => cells.has(gx + ',' + gz), walkableAt: (x, z) => cells.has(Math.round(x) + ',' + Math.round(z)) };
  let s = 7; const rr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const spots = N.chokeSpots(nav, { x: 0, z: 0 }, 3, rr);
  const open = (p) => { let n = 0; const [gx, gz] = nav.toGrid(p.x, p.z); for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if ((dx || dz) && cells.has((gx + dx) + ',' + (gz + dz))) n++; return n; };
  ok(spots.length >= 2 && spots.every((p) => open(p) <= 16), 'webs go to narrow spots (corridors / doorways), not the open room');
  const { G, M } = world(); M.nav = () => nav; const orig = () => { orig.n++; }; orig.n = 0;
  const sp = mkc('spider', { pos: V(0, 0), home: V(0, 0), hp: 140, maxHp: 140, data: {} });
  const me = pl('a', 5, 0, { look: V(1, 0) }); G.players.push(me);
  const b = N.spiderBehavior(orig);
  tick(b, sp, M, 1, 0.1); ok(M.spawned.filter((x) => x.type === 'web').length >= 2 && M.spawned.every((x) => x.o.data.owner === sp.id), 'spider lays webs around its lair once');
  ok(G.sent.some(([t, m]) => t === 'fx' && m.s === 'vent_rattle' && m.p[1] > 2), 'ceiling-dust / rattle tell above the player first');
  const x0 = sp.pos.x; tick(b, sp, M, 12, 0.1);
  ok(sp.state === 'run' && Math.abs(sp.pos.x - x0) > 0 && sp.target === 'a', 'then it drops in and hunts');
  ok(Math.hypot(sp.pos.x - 5, sp.pos.z) < 3.2, 'landing ~2.4 m from the player: ' + sp.pos.x.toFixed(1) + ',' + sp.pos.z.toFixed(1));
  sp.hp = 60; tick(b, sp, M, 2, 0.1); ok(sp.data.retreatT > 0 || sp.data.retreated, 'hurt below 50 %: retreats');
  tick(b, sp, M, 90, 0.1); ok(Math.hypot(sp.pos.x, sp.pos.z) < 1.5 && sp.state === 'idle', 'and is back at the lair, calm');
  const hunter = mkc('spider', { variant: 'hunter' }); const n0 = orig.n; b(hunter, 0.1, M); ok(orig.n === n0 + 1, 'the Hunter Spider variant keeps its old AI');
}

// ------------------------------------------------------------------------------------------------ wiring: the REAL installCrdirector on a fake game
{
  const { installCrdirector } = await import('../../src/game/crdirector.js');
  const { BEHAVIORS } = await import('../../src/entities/creatures.js');
  const spiderWas = BEHAVIORS.spider;
  const L = {}, sent = [], mods = { on(ev, fn) { (L[ev] ||= []).push(fn); return () => { L[ev] = L[ev].filter((f) => f !== fn); }; }, emit(ev, ...a) { for (const f of L[ev] || []) f(...a); } };
  let nid = 1;
  const game = {
    isHost: true, selfId: 'me', mods, time: 0, config: {}, hostData: { pressureStage: 0, moonT: 0 }, run: { phase: 'moon', moon: 'hamsi', quotaIndex: 0, seed: 5, day: 1 },
    net: { hostId: 'me', broadcast(t, d) { sent.push([t, d]); }, sendTo(to, t, d) { sent.push([t, d, to]); }, on() {}, off() {} },
    player: { pos: { x: 0, y: 0, z: 0 }, dead: false, inShip: false, hp: 100, maxHp: 100, slots: [] }, remotes: new Map(),
    aiPlayers() { return [{ id: 'me', pos: { x: 0, y: 0, z: 0 }, zone: 'in', dead: false, inShip: false }]; },
    creatures: { host: new Map(), views: new Map(),
      hostSpawn(type, pos, opts = {}) { const def = C.CREATURES[type]; if (!def) return null; const c = { id: 'c' + nid++, type, def, state: 'idle', dead: false, pos: { x: pos.x, y: 0, z: pos.z }, zone: opts.zone || 'in', age: 0, t: 0, data: { ...(opts.data || {}) } }; this.host.set(c.id, c); return c; },
      hostRemove(id) { this.host.delete(id); } },
    spawnLog: [],
    hostPopulateMoon() { this.hostSpawnCreatureIndoor('crawler'); this.hostSpawnCreatureIndoor('scuttler'); this.hostSpawnCreatureIndoor('yoinker'); this.hostSpawnCreatureIndoor('lurker'); },
    hostSpawnCreatureIndoor(type) { const n = type === 'scuttler' ? 4 : 1; for (let i = 0; i < n; i++) this.creatures.hostSpawn(type, { x: 20 + i, z: 0 }, { zone: 'in' }); this.spawnLog.push(type); return true; },
    hostSpawnOutdoor() { this.spawnLog.push('out'); }, toggleFlashlight() { return 'toggled'; },
  };
  const api = installCrdirector(game);
  ok(api && typeof api.dispose === 'function' && ['cd_dimmer', 'cd_follower', 'cd_auditor'].every((k) => C.CREATURES[k]?.behavior), 'installs; the three creatures are registered with behaviours');
  ok(BEHAVIORS.spider !== spiderWas, 'spider / web behaviours are wrapped');
  game.hostPopulateMoon();
  const alive = () => [...game.creatures.host.values()].filter((c) => !c.dead);
  ok(alive().length >= 1 && alive().length <= 2 && game.spawnLog.length === 1, 'landing: only the resident(s) spawn at once (' + alive().length + ' bodies), the rest is queued: ' + game.spawnLog.join());
  ok(api.debug().queue.length === 3 && api.phase() === 'calm', 'three wanted spawns wait in the queue; the landing starts calm');
  const tickN = (secs, fn) => { for (let t = 0; t < secs; t += 0.25) { game.time += 0.25; for (const c of game.creatures.host.values()) c.age += 0.25; mods.emit('update', 0.25, game); fn?.(t); } };
  const before = game.spawnLog.length; tickN(60);
  ok(game.spawnLog.length === before && api.phase() === 'calm', 'calm: nothing is released for the first minute');
  const phases = []; let maxActive = 0, released = 0;
  const cap = K.capOf({ q: 0, tier: 1 });
  tickN(400, () => {
    const ph = api.phase(); if (phases[phases.length - 1] !== ph) phases.push(ph);
    const a = K.activeThreat([...game.creatures.host.values()].map((c) => ({ ...c, x: c.pos.x, z: c.pos.z })), [{ x: 0, z: 0, zone: 'in', dead: false }]); maxActive = Math.max(maxActive, a.sum);
  });
  ok(phases.join().startsWith('calm,build,peak,relax,calm,build'), 'phases cycle: ' + phases.join());
  ok(game.spawnLog.length > before, 'queued spawns are released in build / peak');
  ok(maxActive <= cap + 2.5, 'active threat stays near the cap (' + maxActive.toFixed(1) + ' vs cap ' + cap.toFixed(1) + ')');
  ok(sent.filter(([t, d]) => t === 'cd' && d.k === 'ph').map(([, d]) => d.p).slice(0, 4).join() === 'calm,build,peak,relax', 'phase messages go to every peer, in order');
  game.creatures.host.clear();
  if (!C.CREATURES.zombot) C.registerCreature('zombot', { name: 'Zombie Account', hp: 18, dmg: 5, power: 0.6 });
  const zs = []; for (let i = 0; i < 10; i++) zs.push(game.creatures.hostSpawn('zombot', { x: 60 + i, z: 0 }, { data: { ambient: true } }));
  ok(zs.filter(Boolean).length === K.ambientZombieCap(0), 'ambient zombies capped at ' + K.ambientZombieCap(0) + ' on quota 0 (got ' + zs.filter(Boolean).length + ')');
  ok(game.creatures.hostSpawn('zombot', { x: 5, z: 5 }, { data: { wave: 1 } }) !== null, 'wave zombies are not capped');
  game.config.crdirector = false; game.spawnLog.length = 0; game.hostSpawnCreatureIndoor('crawler'); ok(game.spawnLog.length === 1 && api.debug().queue.length >= 0, 'config.crdirector = false: vanilla spawning');
  game.config.crdirector = true;
  ok(game.toggleFlashlight() === 'toggled', 'flashlight works normally');
  L.update.forEach((f) => f(0.25, game)); // (no client crash without camera / DOM)
  api.dispose();
  ok(BEHAVIORS.spider === spiderWas && Object.prototype.hasOwnProperty.call(game, 'hostSpawnCreatureIndoor') === true, 'dispose restores the spider behaviour and the wrapped spawners');
  game.spawnLog.length = 0; game.hostSpawnCreatureIndoor('crawler'); ok(game.spawnLog.length === 1, 'after dispose spawning is vanilla again');
  ok((L.update || []).length === 0, 'after dispose no listener is left');
}

// ------------------------------------------------------------------------------------------------ client telegraphs on a fake game (camera, audio, DOM stubs)
{
  const THREE = await import('three');
  const { installCrdirector } = await import('../../src/game/crdirector.js');
  const mkEl = () => ({ style: {}, children: [], _t: '', get textContent() { return this._t; }, set textContent(v) { this._t = v; this.children.length = 0; }, className: '', classList: { add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, _s: new Set() }, appendChild(x) { this.children.push(x); return x; }, remove() {} });
  globalThis.document = { createElement: mkEl, getElementById: () => null, body: mkEl(), head: mkEl(), createTextNode: (t) => ({ text: t }) };
  const L = {}, mods = { on(ev, fn) { (L[ev] ||= []).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of L[ev] || []) f(...a); } };
  const played = [], toasts = [], bursts = []; let netHandler = null;
  const emitter = { group: 'facility', pos: new THREE.Vector3(2, 3, 0), flicker: 0 };
  const flash = { id: 'f1', type: 'flashlight', on: true }; const offs = [];
  const view = { id: 'v1', type: 'crawler', def: C.CREATURES.crawler, state: 'run', pos: new THREE.Vector3(12, 0, 0), hidden: false, model: { height: 1.2, radius: 0.5, setTint() {} }, root: { add() {}, remove() {} } };
  const game = {
    isHost: false, selfId: 'me', mods, config: {}, time: 0, run: { phase: 'moon', moon: 'hamsi', quotaIndex: 0 }, profile: { bestiary: {} },
    net: { hostId: 'host', on(ev, fn) { if (ev === 'msg:cd') netHandler = fn; }, off() {} },
    player: { pos: new THREE.Vector3(0, 0, 0), dead: false, inShip: false, slots: ['f1', 'g'] }, remotes: new Map(), camera: { position: new THREE.Vector3(0, 1.6, 0), quaternion: new THREE.Quaternion() },
    audio: { has: () => true, play(n, o) { played.push([n, o]); return {}; }, variant: (n) => n + '_1' },
    world: { facility: { emitters: [emitter] } }, lights: {}, particles: { burst() { bursts.push(1); } }, ui: { hud: { toast(t) { toasts.push(t); } } },
    items: { get: (id) => (id === 'f1' ? flash : id === 'g' ? { id: 'g', type: 'goldbar', value: 200, def: { kind: 'scrap' } } : null), all: () => [] },
    creatures: { host: new Map(), views: new Map([['v1', view]]) }, toggleFlashlight() { return 'toggled'; }, setItemOn(it, on) { it.on = on; }, dropItem(it) { offs.push(it.id); },
    hostSpawnCreatureIndoor() {}, hostSpawnOutdoor() {}, hostPopulateMoon() {},
  };
  const api = installCrdirector(game);
  ok(typeof netHandler === 'function', 'client binds msg:cd');
  for (let i = 0; i < 4; i++) mods.emit('update', 0.25, game);
  ok(played.some(([n, o]) => n === 'crawler_step' && o.pos && o.volume > 0), 'a Web Crawler within 34 m plays its signature approach sound from its position');
  ok(bursts.length === 1, 'and ceiling dust falls (fx: dust)');
  const capEl = document.body.children.find((e) => e.className === 'cd-cap');
  ok(capEl && capEl.children[0]?.textContent === 'WEB CRAWLER' && capEl.classList._s.has('on'), 'first encounter: one-line caption naming the rule');
  const n1 = played.length; for (let i = 0; i < 4; i++) mods.emit('update', 0.25, game); ok(played.length === n1, 'the same creature does not repeat its cue for ~30 s');
  netHandler({ k: 'tr', id: 'v1', ty: 'crawler' }, 'host');
  const edge = document.body.children.find((e) => e.className === 'cd-edge');
  mods.emit('update', 0.016, game);
  const on = edge && edge.children.filter((i) => +i.style.opacity > 0.3);
  ok(on && on.length === 1 && on[0].className === 'r', 'tracking cue: the RIGHT screen edge pulses (creature at +x, camera looks along -z)');
  ok(played.some(([n, o]) => n === 'heartbeat' && o.pos.x > 2), 'and a thump comes from that side');
  netHandler({ k: 'tr', id: 'v1', ty: 'crawler' }, 'stranger'); const nn = played.length; netHandler({ k: 'ph', p: 'build', n: 1 }, 'stranger'); ok(played.length === nn, 'messages from non-host peers are ignored');
  netHandler({ k: 'ph', p: 'build', n: 1 }, 'host');
  ok(emitter.flicker === 0.72 && capEl.children[0]?.textContent?.startsWith('TRAFFIC SPIKE'), 'build phase: lights dip + caption');
  netHandler({ k: 'dim', to: 'me', ms: 6000 }, 'host');
  ok(flash.on === false && game.toggleFlashlight() === undefined && toasts.length >= 1, 'Dimmer: flashlight forced off and locked for a while');
  netHandler({ k: 'seize', to: 'me' }, 'host'); ok(offs.includes('g'), 'Auditor: the best carried scrap is dropped');
  ok(api.debug().cues === 1 && api.phase() === null, 'debug info');
  api.dispose(); ok(game.toggleFlashlight() === 'toggled', 'dispose unlocks the flashlight');
  delete globalThis.document;
}

// ------------------------------------------------------------------------------------------------ report: vanilla vs director concurrent hostiles
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pickW(rand, table) { let tot = 0; for (const e of table) tot += e.w; let r = rand() * tot; for (const e of table) { r -= e.w; if (r <= 0) return e; } return table[0]; }
const bodiesOf = (id, rand) => (id === 'scuttler' ? 2 + Math.floor(rand() * 3) : id === 'hound' ? 1 + Math.floor(rand() * 2) : 1);
const costOfBody = (id) => (id === 'scuttler' ? 0.5 : C.CREATURES[id]?.power || 1);
/** requests the VANILLA spawners produce in one 12 min day: {t, zone, id} (host.js hostSpawnWave / hostSpawnOutdoor budgets, verbatim maths) */
function requests(q, moonId, rand, T) {
  const moon = MOONS[moonId], press = scaleFor(q, T).spawn, mul = 1 + 0.03 * q;
  const budget = moon.power * mul * press, outBudget = moon.outdoorPower * mul * press;
  const inT = Object.entries(C.spawnTable(moon, 'in', { quotaIndex: q })).filter(([id]) => C.CREATURES[id] && !C.CREATURES[id].hazard && !C.CREATURES[id].boss && C.CREATURES[id].zone !== 'out' && !C.CREATURES[id].noSpawn).map(([id, w]) => ({ id, w }));
  const outT = Object.entries(C.spawnTable(moon, 'out', { quotaIndex: q })).filter(([id]) => C.CREATURES[id] && !C.CREATURES[id].boss && !C.CREATURES[id].noSpawn).map(([id, w]) => ({ id, w }));
  const out = []; let used = 0, outUsed = 0;
  const wave = (t, frac) => {
    const tt = (480 + (t / 720) * 960 - 480) / 360, allowed = budget * Math.min(1, Math.max(frac, 0.35 + 0.65 * tt));
    for (let g = 0; used < allowed && g < 20; g++) { const p = pickW(rand, inT), d = C.CREATURES[p.id]; if (used + d.power > allowed + 0.5) break; used += d.power; out.push({ t, zone: 'in', id: p.id }); }
  };
  wave(0, 0.35);
  for (let t = 20; t < 720; t += (45 + rand() * 35) / press) wave(t, 0);
  for (let t = 405 + 10; t < 720; t += (40 + rand() * 40) / press) { if (outUsed >= outBudget) break; const p = pickW(rand, outT); outUsed += C.CREATURES[p.id].power; out.push({ t, zone: 'out', id: p.id }); }
  return out.sort((a, b) => a.t - b.t);
}
function simulate(q, moonId, directed, seed, T = 25) {
  const rand = mulberry(seed), reqs = requests(q, moonId, rand, T), ctx = { q, tier: MOONS[moonId].tier, pressure: scaleFor(q, T).spawn };
  const bodies = []; let spawned = 0, i = 0; const queue = [];
  const sd = K.newState(ctx, rand); let res = K.residentsFor(q), peaks = 0, feat = 0;
  const active = (t) => bodies.filter((b) => t >= b.a && t < b.e && !(b.zone === 'out' && t < 405)).reduce((s, b) => s + b.cost, 0);
  const spawn = (r, t) => { for (let k = 0, n = directed ? Math.min(bodiesOf(r.id, rand), r.id === 'scuttler' ? K.packMax(q) : 9) : bodiesOf(r.id, rand); k < n; k++) bodies.push({ a: t + 10 + rand() * 15, e: t + 10 + 15 + 35 + rand() * 35, cost: costOfBody(r.id), zone: r.zone, id: r.id }); spawned++; };
  const samples = [];   // model: a body needs 10-25 s to arrive, then is engaged 35-70 s until killed / evaded (same for both variants)
  for (let t = 0; t < 720; t += 0.5) {
    while (i < reqs.length && reqs[i].t <= t) {
      const r = reqs[i++];
      if (!directed || (res > 0 && t < 1)) { if (directed) res--; spawn(r, t); }
      else K.enqueue(queue, { ...r, type: r.zone === 'in' ? r.id : undefined, cost: (r.id === 'scuttler' ? 0.5 * K.packMax(q) : r.zone === 'out' ? 1.5 : C.CREATURES[r.id].power) }, t);
    }
    if (directed) {
      const ph = K.step(sd, 0.5, ctx, rand, { active: active(t), cap: K.capOf(ctx) });
      if (ph === 'peak') { peaks++; if (q >= 1 && feat < 2 && rand() < 0.6) { feat++; bodies.push({ a: t + 8, e: t + 8 + 60, cost: 2.3, zone: 'in', id: 'cd_new' }); } }
      K.expire(queue, t);
      const k = K.pickRelease(queue, sd, ctx, active(t), (e) => e.cost, () => true, bodies.filter((b) => t >= b.a && t < b.e && !(b.zone === 'out' && t < 405)).length);
      if (k >= 0) { const r = queue.splice(k, 1)[0]; sd.gapT = K.gapFor(sd.phase); spawn(r, t); }
    }
    samples.push({ n: bodies.filter((b) => t >= b.a && t < b.e && !(b.zone === 'out' && t < 405)).length });
  }
  const ns = samples.map((s) => s.n).sort((a, b) => a - b), on = ns.filter((n) => n > 0);
  return { spawned: spawned + bodies.filter((b) => b.id === 'cd_new').length, bodies: bodies.length, max: ns[ns.length - 1], p95: ns[Math.floor(ns.length * 0.95)], mean: on.length ? on.reduce((a, b) => a + b, 0) / on.length : 0, busy: on.length / ns.length, peaks };
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function table() {
  const rows = [];
  for (const [q, moon] of [[0, 'hamsi'], [0, 'lufer'], [2, 'palamut'], [2, 'levrek'], [4, 'cipura'], [4, 'orkinos']]) {
    const A = [], B = [];
    for (let s = 1; s <= 30; s++) { A.push(simulate(q, moon, false, s)); B.push(simulate(q, moon, true, s)); }
    const f = (arr, k) => avg(arr.map((r) => r[k]));
    rows.push({ q, moon, van: { bodies: f(A, 'bodies'), max: f(A, 'max'), p95: f(A, 'p95'), mean: f(A, 'mean'), busy: f(A, 'busy') }, dir: { bodies: f(B, 'bodies'), max: f(B, 'max'), p95: f(B, 'p95'), mean: f(B, 'mean'), busy: f(B, 'busy') } });
  }
  return rows;
}
const rows = table();
const fx = (n) => n.toFixed(1);
if (process.argv.includes('--report')) {
  console.log('quota moon      | VANILLA bodies/day max p95 mean(active) busy% | DIRECTOR bodies/day max p95 mean(active) busy%');
  for (const r of rows) console.log(String(r.q).padEnd(5), r.moon.padEnd(9), '|', fx(r.van.bodies).padStart(5), fx(r.van.max).padStart(5), fx(r.van.p95).padStart(5), fx(r.van.mean).padStart(6), (r.van.busy * 100).toFixed(0).padStart(5), '|', fx(r.dir.bodies).padStart(5), fx(r.dir.max).padStart(5), fx(r.dir.p95).padStart(5), fx(r.dir.mean).padStart(6), (r.dir.busy * 100).toFixed(0).padStart(5));
}
const cx = (r) => ({ q: r.q, tier: MOONS[r.moon].tier });
ok(rows.filter((r) => r.q === 0).every((r) => r.dir.p95 <= r.van.p95 - 0.8 && r.dir.max <= 3.6 && r.dir.bodies < r.van.bodies), 'quota 0 (model): fewer bodies, 95th percentile <= vanilla - 0.8, never more than 3-4 at once');
ok(rows.every((r) => r.dir.p95 <= K.bodyCap(cx(r)) + 1 && r.dir.max <= K.bodyCap(cx(r)) + 2), 'quota 0-4 (model): concurrent bodies stay within the body cap (+ the one featured creature)');
ok(rows.every((r) => r.dir.busy < r.van.busy), 'quiet stretches exist (share of time with a hostile active drops at every quota)');
ok(K.ambientZombieCap(0) === 3 && K.ambientZombieCap(2) === 6 && K.ambientZombieCap(4) > 40, 'ambient zombie cap');
ok(K.bodyCap({ q: 0, tier: 1 }) === 3 && K.bodyCap({ q: 2, tier: 2 }) === 4 && K.bodyCap({ q: 4, tier: 3 }) === 4 && K.packMax(0) === 2 && K.packMax(2) === 3 && K.packMax(4) === 4, 'body cap / pack trim tables');

console.log(fails ? `${fails} FAILED of ${checks}` : `crdirector: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
