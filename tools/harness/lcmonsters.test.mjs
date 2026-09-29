// lcmonsters (wave 8) rules + host logic test:  node tools/harness/lcmonsters.test.mjs
// Pure rules (day plan, curses, witch exposure, lantern beam, gamble, masks, other-side timeline), registration + balance_rules fit + i18n
// coverage, the six creature state machines against a fake manager, and the installer (day plan, crdirector veto, curse roll, requests) against a
// fake game. No browser, no physics, no rendering.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';

const C = await import('../../src/game/lcmonsters_core.js');
const AI = await import('../../src/game/lcmonsters_ai.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const { ITEMS, SCRAP_TABLE } = await import('../../src/game/items.js');
const { IDENT } = await import('../../src/game/identify.js');
const { TR, RU } = await import('../../src/game/lcmonsters_text.js');
const { INSTAKILL_OK } = await import('../../src/game/balance_rules.js');
const THREE = await import('three');
const T = C.TUNE;
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const seq = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

await ok('day plan: deterministic, within budget, one of a kind, early game has no hunter / masked, witch waits for dusk', () => {
  for (let day = 1; day <= 40; day++) {
    for (const q of [0, 1, 2, 3, 5]) {
      const a = C.planDay(777, day, q), b = C.planDay(777, day, q);
      assert.deepEqual(a, b);
      assert.ok(a.length <= C.budgetFor(q));
      assert.equal(new Set(a.map((e) => e.kind)).size, a.length);
      if (q === 0) for (const e of a) assert.ok(!['otherside', 'masked'].includes(e.kind), 'no hunter / masked at quota 0');
      for (const e of a) { if (e.kind === 'witch') assert.equal(e.at, 'dusk'); else assert.ok(e.at >= T.earliest && e.at <= T.latest); }
    }
  }
  assert.equal(C.budgetFor(0), 2); assert.equal(C.budgetFor(3), 3);
  assert.equal(C.planDay(1, 1, 0, { indoor: false, outdoor: true }).filter((e) => e.kind !== 'witch').length, 0);
  const kinds = new Set(); for (let d = 1; d < 200; d++) for (const e of C.planDay(9, d, 4)) kinds.add(e.kind);
  assert.equal(kinds.size, 6, 'every kind shows up over a run');
});

await ok('cursed scraps: ~7 % roll, capped per landing, value x1.6, cleanse cheaper than the bonus is worth, heavy slows', () => {
  const r = seq(5); let hits = 0; const N = 20000;
  for (let i = 0; i < N; i++) if (C.rollCurse(r, 2, 0)) hits++;
  assert.ok(hits / N > 0.05 && hits / N < 0.09, 'rate ' + hits / N);
  assert.equal(C.rollCurse(() => 0, 2, T.curseCap), null);
  assert.ok(C.CURSES.includes(C.rollCurse(() => 0.01, 2, 0)));
  assert.equal(C.cursedValue(100), 160); assert.ok(C.cleansedValue(160) > 100 && C.cleansedValue(160) < 160);
  for (const v of [10, 100, 400, 2000]) { const c = C.cleanseCost(v); assert.ok(c >= 20 && c <= 120); }
  assert.ok(C.heavyMul() < 1 && C.heavyMul() > 0.5);
});

await ok('blood witch: needs circle + line of sight, breaking sight drains, immunity, bleed never kills', () => {
  assert.ok(C.inCircle(3, 0, 0, 0) && !C.inCircle(9, 0, 0, 0));
  let e = 0, cursed = false;
  for (let i = 0; i < 100 && !cursed; i++) { const s = C.witchStep(e, true, true, 0.1); e = s.exp; cursed = s.cursed; }
  assert.ok(cursed, 'curse lands after ~1.4 s');
  e = 1.0; for (let i = 0; i < 20; i++) e = C.witchStep(e, true, false, 0.1).exp; assert.equal(e, 0, 'hiding drains it');
  assert.equal(C.witchStep(1.39, true, true, 0.1, 5).cursed, false, 'immune after a curse');
  let hp = 40, lost = 0; for (let i = 0; i < 400; i++) { const d = C.bleedTick(hp, 0.75); hp -= d; lost += d; }
  assert.ok(hp >= T.bleedFloor - 1e-9 && hp <= T.bleedFloor + 1e-9, 'stops at the floor'); assert.equal(C.bleedTick(5, 1), 0);
});

await ok('lantern keeper: beam is a forward cone, snatch only from behind / the side', () => {
  assert.ok(C.inBeam(0, 0, 0, 0, 6) && !C.inBeam(0, 0, 0, 0, -6) && !C.inBeam(0, 0, 0, 0, 20) && !C.inBeam(0, 0, 0, 6, 1));
  assert.ok(C.inBeam(0, 0, Math.PI / 2, 6, 0), 'yaw pi/2 looks along +x');
  assert.ok(C.canSnatch(0, 0, 0, 0, -1.2) && !C.canSnatch(0, 0, 0, 0, 1.2) && !C.canSnatch(0, 0, 0, 0, -3));
});

await ok('trick or treat: 55/45 gamble, sane payouts, all tricks reachable', () => {
  const r = seq(11); let treat = 0; const N = 20000, tricks = new Set();
  for (let i = 0; i < N; i++) {
    const g = C.gamble(r, 3);
    if (g.r === 'treat') { treat++; if (g.what === 'credits') assert.ok(g.credits >= 24 && g.credits <= 80); else assert.ok(g.value >= 55 && g.value <= 160); } else tricks.add(g.what);
  }
  assert.ok(treat / N > 0.52 && treat / N < 0.58); assert.deepEqual([...tricks].sort(), [...C.TRICKS].sort());
});

await ok('masks + other side timeline', () => {
  assert.deepEqual([0, 25.9, 26, 41.9, 42, 99].map(C.maskPhase), [0, 0, 1, 1, 2, 2]);
  assert.equal(C.osPhase(0), 'warn'); assert.equal(C.osPhase(T.osWarnS + 0.1), 'rift'); assert.equal(C.osPhase(C.OS_TIMELINE.hunter + 0.1), 'open'); assert.equal(C.osPhase(C.OS_TIMELINE.close + 0.1), 'closed');
  assert.deepEqual([0, 0.8, 1.5, 2.2, 3, 5].map(C.warnLetters), [1, 2, 3, 3, 3, 2]);
});

// ---------------------------------------------------------------------------------------------------- registration
AI.registerLcContent();
await ok('registration: 6 creatures, balance-safe (no 999, no instakill), items, scrap table, ident rows, TR + RU cover every text', () => {
  for (const id of AI.LC_TYPES) {
    const d = CREATURES[id]; assert.ok(d, id); assert.ok(d.dmg <= 90 && !INSTAKILL_OK.has(id) && !d.instakill); assert.ok(d.behavior, id + ' behaviour'); assert.ok(d.noSpawn, 'spawned only by lcmonsters');
    assert.ok(d.maxAlive <= 2); assert.ok(IDENT[id], 'scanner row');
    for (const s of [d.name, d.lore, d.deathText, IDENT[id][2]]) { assert.ok(TR[s], 'TR ' + s.slice(0, 30)); assert.ok(RU[s], 'RU ' + s.slice(0, 30)); }
  }
  assert.ok(CREATURES.lm_lootmimic.noScan && !CREATURES.lm_lootmimic.hazard);
  assert.equal(CREATURES.lm_hunter.run < 8.2, true, 'outrunnable by a sprinting player'); assert.ok(CREATURES.lm_masked.run < 5);
  for (const d of Object.values(AI.ITEM_DEFS)) { assert.ok(ITEMS[d.id]); for (const s of [d.name, d.tip]) { assert.ok(TR[s] && RU[s], 'item text ' + s); } }
  assert.ok(SCRAP_TABLE.factory.some((e) => e[0] === 'lm_mask_smile'));
  for (const k of Object.keys(TR)) assert.ok(RU[k], 'RU parity ' + k);
});

// ---------------------------------------------------------------------------------------------------- state machines (fake manager)
function world() {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const players = [], calls = { circleBegin: 0, circleLive: 0, marks: [], despawn: 0, maskedHit: 0, holds: 0 };
  const g = { time: 100, net: { sent: [], broadcast(t, d) { this.sent.push([t, d]); } }, physics: { lineOfSight: () => true }, hostHoldPlayer() { calls.holds++; }, balRules: null,
    lcm: { circleBegin() { calls.circleBegin++; }, circleLive() { calls.circleLive++; }, mark(pid) { calls.marks.push(pid); }, despawn() { calls.despawn++; }, maskedHit() { calls.maskedHit++; } } };
  const M = {
    game: g, playersFor: () => players.filter((p) => !p.dead),
    nearest(c, list, maxD = 1e9) { let best = null, bd = maxD; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; },
    canSee: () => true, hear: () => null, attacks: [], attack(c, p, dmg, cause) { this.attacks.push({ type: c.type, p: p.id, dmg, cause }); },
    goTo(c, x, z) { c.dest = { x, z }; }, wander(c) { this.goTo(c, c.pos.x + 5, c.pos.z); }, follow() { return false; }, noise() {},
    moveToward(c, t, dt, sp) { const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz) || 1; c.pos.x += dx / d * sp * dt; c.pos.z += dz / d * sp * dt; },
  };
  const mk = (type, x = 0, z = 0, data = {}) => {
    const def = { ...CREATURES[type] };
    return { type, def, id: type + Math.random(), pos: V(x, 0, z), yaw: 0, state: 'idle', t: 0, age: 5, cooldown: 0, stunT: 0, data: { ...data }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, target: null, seed: 3,
      setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } } };
  };
  const player = (id, x, z, o = {}) => { const p = { id, pos: V(x, 0, z), eye: V(x, 1.6, z), dead: false, inShip: false, zone: 'in', ...o }; players.push(p); return p; };
  const step = (c, s, dt = 0.05) => { for (let i = 0; i < s / dt; i++) { c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; g.time += dt; CREATURES[c.type].behavior(c, dt, M); } };
  return { g, M, mk, player, step, calls };
}

await ok('witch: ritual telegraph (3 s) before the circle goes live, keeps her distance, never melees', () => {
  const W = world(); W.player('a', 25, 0, { zone: 'out' }); const c = W.mk('lm_witch', 0, 0); c.zone = 'out';
  W.step(c, 6.5); assert.equal(W.calls.circleBegin, 1); assert.equal(c.state, 'ritual');
  W.step(c, T.castS + 0.2); assert.equal(W.calls.circleLive, 1); assert.equal(W.M.attacks.length, 0);
  const W2 = world(); W2.player('a', 6, 0, { zone: 'out' }); const c2 = W2.mk('lm_witch', 0, 0); W2.step(c2, 8, 0.05); assert.ok(W2.M.attacks.length === 0);
});

await ok('keeper: marks only players in the beam, not behind it; dark after the snatch does not mark', () => {
  const W = world(); const front = W.player('front', 0, 6), back = W.player('back', 0, -6); const c = W.mk('lm_keeper', 0, 0); c.yaw = 0;
  c.state = 'idle'; c.data.dir = 0; W.step(c, 1); assert.ok(W.calls.marks.includes('front') && !W.calls.marks.includes('back'));
  const W2 = world(); W2.player('p', 0, 6); const d = W2.mk('lm_keeper', 0, 0); d.state = 'dark'; d.data.init = 1; d.data.life = 100; W2.step(d, 2); assert.equal(W2.calls.marks.length, 0);
});

await ok('loot mimic: dormant (no attack) until grabbed or hurt, then bites with the balance-gated attack and can go back to sleep', () => {
  const W = world(); const p = W.player('a', 1.2, 0); const c = W.mk('lm_lootmimic', 0, 0);
  W.step(c, 5); assert.equal(W.M.attacks.length, 0); assert.equal(c.state, 'idle');
  c.data.woke = true; c.data.tid = 'a'; c.data.awake = 0; W.step(c, 0.5); assert.equal(W.M.attacks[0].cause, 'lm_lootmimic'); assert.ok(W.M.attacks[0].dmg <= 45);
  p.pos.set(60, 0, 0); W.step(c, 3); assert.equal(c.state, 'idle', 'plays dead again when you are gone');
  const W2 = world(); W2.player('b', 5, 0); const h = W2.mk('lm_lootmimic', 0, 0); h.hp = 50; W2.step(h, 3); assert.ok(h.data.woke, 'hit first = awake');
});

await ok('trick-or-treater: three knocks (telegraph), walks up, stops in reach, leaves when done', () => {
  const W = world(); W.player('a', 9, 0); const c = W.mk('lm_treater', 0, 0);
  W.step(c, 3.5); assert.equal(W.g.net.sent.filter(([t, d]) => t === 'cev' && d.e === 'snd').length >= 3, true);
  W.step(c, 12); assert.ok(c.pos.distanceTo(new THREE.Vector3(9, 0, 0)) < T.treatReach + 0.3 && c.state === 'idle');
  c.setState('done'); W.step(c, 3); assert.equal(W.calls.despawn >= 1, true);
});

await ok('rift stalker: emerges 1.2 s before it runs, always finds a target, despawns when nobody is left', () => {
  const W = world(); W.player('a', 12, 0); const c = W.mk('lm_hunter', 0, 0);
  W.step(c, 1.0); assert.equal(c.state, 'emerge'); W.step(c, 0.4); assert.ok(c.state === 'run' || c.state === 'walk'); W.step(c, 1); assert.equal(c.target, 'a');
  const W2 = world(); const d = W2.mk('lm_hunter', 0, 0); W2.step(d, T.osChaseMax + 5, 0.5); assert.ok(W2.calls.despawn >= 1);
});

await ok('masked: walks slowly, grabs inside 1.35 m, hug is capped and releases, marks the hit for conversion', () => {
  const W = world(); const p = W.player('a', 20, 0); const c = W.mk('lm_masked', 0, 0);
  W.step(c, 2); assert.ok(c.pos.x > 1 && c.pos.x < 6, 'slow walk ' + c.pos.x);
  p.pos.set(c.pos.x + 1, 0, 0); c.cooldown = 0; W.step(c, 0.2); assert.equal(c.state, 'grab'); assert.ok(W.calls.maskedHit >= 1);
  W.step(c, T.holdSafe + 0.5); assert.notEqual(c.state, 'grab'); assert.ok(W.calls.holds >= 1); assert.ok(W.M.attacks.length >= 1 && W.M.attacks.every((a) => a.dmg <= 15 && a.cause === 'lm_masked'));
});

// ---------------------------------------------------------------------------------------------------- installer against a fake game
const { installLcmonsters } = await import('../../src/game/lcmonsters.js');
function fakeGame({ q = 2, veto = false } = {}) {
  const handlers = new Map();
  const mods = { on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of handlers.get(ev) || []) f(...a); }, creatureModels: new Map(), itemModels: new Map() };
  const items = new Map(); let iid = 1, csn = 0;
  const g = {
    mods, isHost: true, time: 100, selfId: 'p1', profile: { name: 'Me' }, remotes: new Map(), run: { phase: 'moon', moon: 'hamsi', seed: 999, day: 3, time: 600, quotaIndex: q, weather: 'clear', credits: 500 },
    net: { sent: [], sentTo: [], broadcast(t, d) { this.sent.push([t, d]); }, sendTo(id, t, d) { this.sentTo.push([id, t, d]); }, request() {}, on_() {} }, later: (fn) => fn(),
    hostData: { moonT: 0 }, broadcastRun() {}, rollLevel: () => 1, playerName: (id) => id, hostStunPlayer() {},
    world: { terrain: { heightAt: () => 0 }, facility: { layout: { theme: 'factory' }, scrapSpots: Array.from({ length: 30 }, (_, i) => ({ x: i * 6, y: -300, z: (i % 5) * 5, elevated: false })), wallSpots: Array.from({ length: 10 }, (_, i) => ({ x: 20 + i * 4, y: -300, z: 9, rotY: 0 })) } },
    physics: { lineOfSight: () => true }, engine: { scene: new THREE.Scene(), flash() {} }, ui: { toast() {} }, audio: { play() {}, has: () => true }, sfx() {}, lights: { emitters: new Set() },
    player: { pos: new THREE.Vector3(5, -300, 5), hp: 100, inShip: false, dead: false, heldItem: () => null, forward: () => new THREE.Vector3(0, 0, 1) },
    items: { all: () => [...items.values()], get: (id) => items.get(id), hostSpawn(type, pos, o = {}) { const id = 'i' + iid++; items.set(id, { id, type, def: ITEMS[type] || { kind: 'scrap', value: [10, 20], hands: 1 }, value: o.value ?? 100, state: 'world', holder: o.holder || null, obj: { position: pos.clone() } }); return id; } },
    creatures: { host: new Map(), views: new Map(), spawned: [], hostRemove() {}, noise() {}, attack() {}, game: null, hostSpawn(type, pos, o) { const c = { id: 'c' + (++csn), type, pos: pos.clone(), dead: false, data: {}, state: 'idle', yaw: 0, cooldown: 0, def: CREATURES[type], setState(s) { this.state = s; } }; this.spawned.push({ type, o }); this.host.set(c.id, c); return c; } },
    players: [{ id: 'p1', pos: new THREE.Vector3(5, -300, 5), eye: new THREE.Vector3(5, -298.4, 5), look: new THREE.Vector3(0, 0, 1), dead: false, inShip: false, zone: 'in' }],
    aiPlayers() { return this.players; }, aiPlayerById(id) { return this.players.find((p) => p.id === id); },
    crdirector: veto ? { canSpawn: () => false } : undefined,
  };
  g.creatures.game = g;
  return { g, mods, items };
}
const emitUpdate = (F, sec, dt = 0.5) => { for (let t = 0; t < sec; t += dt) { F.g.time += dt; F.g.hostData.moonT += dt; F.mods.emit('update', dt, F.g); } };

await ok('installer: landing plans <= budget, fires indoor events after their time, never more than 1 alive per kind', () => {
  const F = fakeGame({ q: 2 }); const api = installLcmonsters(F.g); F.mods.emit('moonPopulated', F.g);
  const plan = api.state().plan; assert.ok(plan.length >= 1 && plan.length <= 2);
  emitUpdate(F, 5); assert.equal(F.g.creatures.spawned.length, 0, 'nothing before the earliest time');
  emitUpdate(F, 340, 1);
  const lc = F.g.creatures.spawned.filter((s) => AI.LC_TYPES.has(s.type)); assert.ok(lc.length <= 2);
  for (const t of AI.LC_TYPES) assert.ok(lc.filter((s) => s.type === t).length <= 1);
  api.dispose();
});

await ok('installer: crdirector.canSpawn veto blocks every spawn; missing crdirector = allowed', () => {
  const F = fakeGame({ q: 4, veto: true }); const api = installLcmonsters(F.g); F.mods.emit('moonPopulated', F.g);
  for (const k of ['keeper', 'treat', 'lootmimic', 'masked']) assert.equal(api.debugSpawn(k), false, k);
  api.dispose();
  const G2 = fakeGame({ q: 4 }); const a2 = installLcmonsters(G2.g); G2.mods.emit('moonPopulated', G2.g);
  assert.equal(a2.debugSpawn('keeper'), true); assert.equal(a2.debugSpawn('keeper'), false, 'max 1 alive'); assert.equal(a2.debugSpawn('lootmimic'), true); a2.dispose();
});

await ok('installer: cursed scraps roll on landing loot only, capped, value x1.6, late joiners get the map; other side runs its timeline', () => {
  const F = fakeGame({ q: 3 }); const api = installLcmonsters(F.g); F.mods.emit('moonPopulated', F.g);
  for (let i = 0; i < 600; i++) F.g.items.hostSpawn('goldbar', new THREE.Vector3(), {});
  assert.ok(api.cursed.size >= 1 && api.cursed.size <= T.curseCap, 'cursed ' + api.cursed.size);
  const [id] = [...api.cursed.keys()]; assert.ok(F.g.net.sent.some(([t, d]) => t === 'it' && d.e === 'val' && d.id === id && d.v === 160));
  F.g.items.hostSpawn('goldbar', new THREE.Vector3(), { holder: 'p1' }); F.g.items.hostSpawn('body', new THREE.Vector3(), { label: 'x' });
  F.mods.emit('playerJoin', 'p2'); assert.ok(F.g.net.sentTo.some(([to, t, d]) => to === 'p2' && t === 'lm' && d.k === 'cm'));
  assert.equal(api.debugSpawn('otherside'), true);
  emitUpdate(F, 8, 0.5); assert.ok(F.g.net.sent.some(([t, d]) => t === 'lm' && d.k === 'os' && d.ph === 'rift'));
  emitUpdate(F, T.osRiftS + 1, 0.5); assert.equal(F.g.creatures.spawned.filter((s) => s.type === 'lm_hunter').length, 1, 'the stalker steps out of the rift');
  emitUpdate(F, 60, 1); assert.ok(F.g.net.sent.some(([t, d]) => t === 'lm' && d.k === 'os' && d.ph === 'closed'));
  api.dispose();
});

await ok('installer: requests - treat gamble pays out or tricks once, lantern snatch needs the back, purge costs credits', () => {
  const F = fakeGame({ q: 3 }); const api = installLcmonsters(F.g); F.mods.emit('moonPopulated', F.g);
  let req = null; F.mods.emit('registerHandlers', (a, fn) => { if (a === 'lmq') req = fn; }, F.g); assert.ok(req);
  const p = F.g.players[0];
  assert.equal(api.debugSpawn('treat'), true); const tr = [...F.g.creatures.host.values()].find((c) => c.type === 'lm_treater');
  tr.pos.copy(p.pos).add(new THREE.Vector3(1.5, 0, 0)); tr.state = 'idle';
  req({ k: 'tt', id: tr.id }, 'p1'); assert.equal(tr.state, 'done'); assert.ok(F.g.net.sentTo.some(([, t, d]) => t === 'lm' && d.k === 'tt' && ['treat', 'trick'].includes(d.r)));
  const before = F.g.net.sentTo.length; req({ k: 'tt', id: tr.id }, 'p1'); assert.equal(F.g.net.sentTo.length, before, 'no second gamble');
  assert.equal(api.debugSpawn('keeper'), true); const kp = [...F.g.creatures.host.values()].find((c) => c.type === 'lm_keeper');
  kp.pos.copy(p.pos).add(new THREE.Vector3(0, 0, 1.2)); kp.yaw = 0;   // player is IN FRONT of the keeper? keeper at z+1.2 facing +z: player behind it
  req({ k: 'sn', id: kp.id }, 'p1'); assert.equal(kp.state, 'dark'); assert.ok(F.g.items.all().some((i) => i.type === 'lm_lantern'));
  const it = F.g.items.get(F.g.items.hostSpawn('goldbar', p.pos, { value: 160, holder: 'p1' })); api.debugCurse(it.id, 'heavy'); it.holder = 'p1';
  p.inShip = true; const cr = F.g.run.credits; req({ k: 'cl', id: it.id }, 'p1');
  assert.ok(F.g.run.credits < cr && !api.cursed.has(it.id)); assert.ok(F.g.net.sent.some(([t, d]) => t === 'it' && d.e === 'val' && d.id === it.id && d.v < 160 && d.v > 100));
  api.dispose();
});

await ok('models build + animate through every state without throwing; no THREE lights', async () => {
  const M = await import('../../src/models/lcmonsters_models.js');
  for (const [name, fn] of [['witch', M.createWitchModel], ['keeper', M.createKeeperModel], ['treater', M.createTreaterModel], ['hunter', M.createHunterModel], ['lootmimic', M.createLootMimicModel]]) {
    let m; try { m = fn({ seed: 4 }); } catch (e) { if (/document|canvas|window/i.test(String(e))) { console.log('  (skip ' + name + ': needs DOM)'); continue; } throw e; }
    m.root.traverse((o) => assert.ok(!o.isLight, name + ' has a light'));
    for (const st of ['idle', 'walk', 'run', 'attack', 'ritual', 'knock', 'dark', 'emerge', 'stunned', 'dead']) m.update(0.05, { state: st, speed: 2, t: 0.3, time: 5 });
    m.setHitFlash(0.5); m.dispose();
  }
  for (const id of M.LC_ITEM_IDS) M.createLcItemModel(id);
  assert.ok(M.MIMIC_LOOK.includes(M.mimicLookOf(12345)));
});

console.log('lcmonsters.test: ' + n + ' checks passed');
