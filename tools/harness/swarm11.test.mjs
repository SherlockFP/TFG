// swarm11 (wave 11) rules + host logic test:  node tools/harness/swarm11.test.mjs
// Pure rules, registration (pool / i18n / codex / spawn gate), Scraper + Nest, Streamer pull, AutoMod cleanup + flag state machines against a fake manager, models + sound recipes.
// No browser, no physics, no rendering.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';

const C = await import('../../src/game/swarm11_core.js');
const AI = await import('../../src/game/swarm11_ai.js');
const { CREATURES, EXTRA_SPAWNS, canSpawnMore } = await import('../../src/game/creatures.js');
const { IDENT } = await import('../../src/game/identify.js');
const { HEADLINE } = await import('../../src/game/threatpool.js');
const { FIELD_NOTES } = await import('../../src/game/collection.js');
const { TR, RU, ROWS } = await import('../../src/game/swarm11_text.js');
const THREE = await import('three');
const T = C.TUNE, { scraper: SCR, nest: NEST, streamer: STR, automod: MOD } = C.IDS, FY = -300;
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const seq = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

await ok('pure rules: colony chance / size, heap fill + bonus, stealable, heap verdicts, guard meter', () => {
  assert.ok(C.colonyChance(true, 0) > C.colonyChance(false, 0) && C.colonyChance(false, 3) <= 0.95);
  assert.equal(C.colonySize(0.99, 0), T.scr.min, 'quota 0 = small colony'); assert.equal(C.colonySize(0.999, 2), T.scr.max); assert.equal(C.colonySize(0, 2), T.scr.min);
  assert.equal(C.heapFill(0), 0); assert.equal(C.heapFill(T.scr.cap), 1); assert.equal(C.heapFill(99), 1);
  assert.ok(C.bonusCount(0) === 1 && C.bonusCount(8) === 3 && C.bonusCount(99) === T.scr.bonusMax, 'bonus grows with the heap, capped');
  const base = { state: 'world', holder: null, owner: null, carrier: null, sellable: true, big: false, type: 'bolt', soulbound: false, inShip: false, claimed: false };
  assert.ok(C.stealable(base));
  for (const k of [{ holder: 'p1' }, { owner: 'p1' }, { carrier: 'c1' }, { sellable: false }, { big: true }, { type: 'body' }, { soulbound: true }, { inShip: true }, { claimed: true }, { state: 'held' }]) assert.ok(!C.stealable({ ...base, ...k }), JSON.stringify(k));
  assert.equal(C.heapVerdict({ state: 'world', holder: null }, 2), 'in'); assert.equal(C.heapVerdict({ state: 'world', holder: null }, 30), 'gone');
  assert.equal(C.heapVerdict({ state: 'held', holder: 'p1' }, 1), 'taken'); assert.equal(C.heapVerdict({ state: 'held', holder: 'c:c4' }, 1), 'gone'); assert.equal(C.heapVerdict(null, 0), 'gone');
  let m = 0; for (let i = 0; i < 40; i++) m = C.guardStep(m, true, 0.05); assert.equal(m, 1); for (let i = 0; i < 60; i++) m = C.guardStep(m, false, 0.05); assert.equal(m, 0);
});

await ok('pure rules: attractable (never bosses / hazards / hunters / own types), ring health, cooldown, live phases, pull range', () => {
  const hunt = (s) => s === 'chase' || s === 'run';
  assert.ok(C.attractable('lurker', { walk: 2 }, 'idle', hunt) && C.attractable('scuttler', { walk: 2 }, 'walk', hunt));
  assert.ok(!C.attractable('lurker', { walk: 2 }, 'chase', hunt), 'a hunter keeps its prey');
  for (const [ty, d] of [['turret', { walk: 0 }], ['jester', { walk: 2 }], ['x', { walk: 2, boss: true }], ['y', { walk: 2, hazard: true }], ['sw_scraper', { walk: 2 }], ['z', { walk: 0 }]]) assert.ok(!C.attractable(ty, d, 'idle', hunt), ty);
  assert.ok(!C.attractable('lurker', { walk: 2 }, 'stunned', hunt) && !C.attractable('lurker', { walk: 2 }, 'dead', hunt));
  assert.equal(C.ringExtra(70, 70, false), 1); assert.equal(C.ringExtra(35, 70, false), 0); assert.equal(C.ringExtra(10, 70, true), -1);
  assert.ok(C.ringBreaks(35, 70) && !C.ringBreaks(36, 70));
  assert.equal(C.livePhase(0), 'boot'); assert.equal(C.livePhase(T.live.bootT + 1), 'live'); assert.equal(C.livePhase(T.live.bootT + T.live.liveT + 0.1), 'done');
  const cd = C.nextCooldown(0.5); assert.ok(cd >= T.live.coolMin && cd <= T.live.coolMax);
  assert.ok(C.inPullRange(0, 0, 0, 29, 3, 0) && !C.inPullRange(0, 0, 0, 31, 0, 0) && !C.inPullRange(0, 0, 0, 5, 9, 0), '30 m, same floor band');
});

await ok('pure rules: AutoMod target pick (bodies first), item grace + protection, dwell meter, blood merge / cap', () => {
  const cands = [{ kind: 'item', id: 'a', x: 5, y: 0, z: 0 }, { kind: 'body', id: 'b', x: 8, y: 0, z: 0 }, { kind: 'chalk', id: 1, x: 9, y: 0, z: 0 }, { kind: 'blood', id: 2, x: 2, y: 9, z: 0 }];
  assert.equal(C.pickTarget(cands, 0, 0, 0).id, 'b', 'a body at 8 m beats an item at 5 m (weights) and chalk at 9 m');
  assert.equal(C.pickTarget(cands, 0, 0, 0, 6).id, 'a', 'range');
  assert.equal(C.pickTarget([{ kind: 'item', id: 'x', x: 1, y: 8, z: 0 }], 0, 0, 0), null, 'other floor');
  assert.ok(!C.itemCleanable(10, 5, 9) && C.itemCleanable(14, 5, 9) && !C.itemCleanable(14, 5, 1) && !C.itemCleanable(14, undefined, 9));
  let m = 0; for (let i = 0; i < 100; i++) m = C.dwellStep(m, true, true, 0.05); assert.equal(m, 1);
  assert.equal(C.dwellStep(0.5, true, false, 0.1) < 0.5, true, 'not aware = drains'); assert.ok(C.dwellStep(0.9, false, true, 3) < 0.9);
  const list = []; let id = 1;
  for (let i = 0; i < T.mod.bloodCap + 5; i++) C.addBlood(list, i * 3, 0, 0, 1, id++);
  assert.equal(list.length, T.mod.bloodCap);
  const before = list[list.length - 1].s, r = C.addBlood(list, list[list.length - 1].x + 0.3, 0, 0, 1, id++); assert.ok(r.updated && list.length === T.mod.bloodCap && r.updated.s > before, 'merges into an old stain');
  assert.ok(C.bloodSize(0, true) > C.bloodSize(20, false));
});

await ok('registration: four creatures, one rule in the first lore sentence, telegraphs >= 0.8 s, pool + codex + scanner rows, quota gate', () => {
  AI.registerSw11Content(); AI.registerSw11Content();
  for (const id of C.ALL_IDS) {
    const d = CREATURES[id]; assert.ok(d && typeof d.behavior === 'function', id);
    assert.ok(/^[^.!?]{25,}[.!?]/.test(d.lore), 'first sentence is the rule caption');
    assert.ok(IDENT[id] && IDENT[id][2].length > 20 && FIELD_NOTES[id], 'scanner + codex ' + id);
  }
  for (const id of [SCR, STR, MOD]) assert.ok(HEADLINE.some((h) => h.id === id && h.zone === 'in'), 'pool ' + id);
  assert.ok(T.scr.alarmT + T.scr.windup >= 0.8 && T.scr.windup >= 0.8, 'nest alarm + lunge wind-up');
  assert.ok(T.live.bootT >= 0.8 && T.mod.flagT >= 0.8 && T.mod.sweepT >= 1.5, 'boot / flag telegraph');
  assert.equal(CREATURES[STR].dmg, 0, 'the Streamer never attacks');
  assert.ok(CREATURES[SCR].dmg <= 10 && CREATURES[SCR].hp <= 40, 'low damage, fragile');
  for (const id of [SCR, NEST]) assert.equal(CREATURES[id].noSpawn, true, 'module-spawned only');
  const M = new Map(); AI.setSwGame(null); assert.equal(canSpawnMore(STR, M), false, 'no run: blocked');
  const g = { run: { quotaIndex: 0 } }; AI.setSwGame(g);
  assert.equal(canSpawnMore(STR, M), false); assert.equal(canSpawnMore(MOD, M), false);
  g.run.quotaIndex = 1; assert.ok(canSpawnMore(STR, M)); assert.equal(canSpawnMore(MOD, M), false, 'balance12: AutoMod from quota 3');
  g.run.quotaIndex = 3; assert.ok(canSpawnMore(STR, M) && canSpawnMore(MOD, M));
  M.set('a', { type: MOD, dead: false }); assert.equal(canSpawnMore(MOD, M), false, 'max 1 AutoMod alive');
  for (const id of [STR, MOD]) { assert.ok(EXTRA_SPAWNS[id] && EXTRA_SPAWNS[id].w[0] === 0 && EXTRA_SPAWNS[id].w[3] > 0); }
});

await ok('i18n: EN + TR + RU for every player-facing string (name, lore, death text, hint, field note, toasts)', () => {
  for (const id of C.ALL_IDS) for (const s of [CREATURES[id].$name, CREATURES[id].$lore, CREATURES[id].deathText, IDENT[id][2], FIELD_NOTES[id]]) {
    if (!s) continue;
    assert.ok(TR[s] && RU[s], 'missing ' + String(s).slice(0, 40)); assert.notEqual(TR[s], s); assert.notEqual(RU[s], s);
  }
  for (const [en, tr, ru] of ROWS) { assert.ok(en && tr && ru); assert.ok(/[а-яА-Я]/.test(ru), 'RU is Cyrillic: ' + en.slice(0, 30)); }
  for (const k of ['FLAGGED', 'LIVE!', 'AutoMod deleted: {name}', 'The nest is smashed: {n} bonus scrap. The swarm is awake.']) assert.ok(TR[k] && RU[k], k);
});

// ---------------------------------------------------------------------------------------------------- state machines (fake manager + items)
function world() {
  const V = (x = 0, y = FY, z = 0) => new THREE.Vector3(x, y, z);
  const players = [], host = new Map(), sent = [], attacks = [], items = new Map(), noises = [], gotos = [];
  const g = {
    time: 100, net: { broadcast(t, d) { sent.push([t, d]); if (t === 'it') onItem(d); } }, world: {}, isHost: true,
    items: { all: () => items.values(), get: (id) => items.get(id) },
    aiPlayers: () => players, aiPlayerById: (id) => players.find((p) => p.id === id), hostSpawnRandomScrap(pos) { addItem('bonus' + items.size, pos.x, pos.z); },
  };
  function onItem(d) {
    const it = items.get(d.id); if (!it) return;
    if (d.e === 'held') { it.holder = d.h; it.state = 'held'; }
    if (d.e === 'drop') { it.holder = null; it.state = 'world'; it.dropHolder = it.dropHolder || String(d.h || ''); it.obj.position.set(d.p[0], d.p[1], d.p[2]); }
    if (d.e === 'rm') items.delete(d.id);
  }
  const addItem = (id, x, z, o = {}) => { const it = { id, type: 'bolt', state: 'world', holder: null, owner: null, carrier: null, soulbound: false, def: { kind: 'scrap', value: 10 }, obj: { position: V(x, FY + 0.3, z) }, ...o }; items.set(id, it); return it; };
  const M = {
    game: g, host, pvel: new Map(), noises, playersFor: () => players.filter((p) => !p.dead),
    nearest(c, list, maxD = 1e9) { let best = null, bd = maxD; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; },
    hear: () => null, nav: () => null,
    attack(c, p, dmg, cause) { attacks.push({ type: c.type, id: c.id, p: p.id, dmg, cause, t: g.time, state: c.state, ct: c.t }); },
    goTo(c, x, z) { c.dest = { x, z }; c.path = [{ x, z }]; gotos.push(c.id); }, goToLazy(c, x, z) { this.goTo(c, x, z); }, wander(c) { this.goTo(c, c.pos.x + 3, c.pos.z); }, follow(c, dt, sp) { return this.moveToward(c, c.dest || c.pos, dt, sp); },
    moveToward(c, t, dt, sp) { const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz); if (d < 0.05) return true; const s = Math.min(d, sp * dt); c.pos.x += dx / d * s; c.pos.z += dz / d * s; return d - s < 0.05; },
    hostSpawn(type, pos, opts = {}) { const c = mk(type, pos.x, pos.z, opts.data); return c; },
    damage(c, amt, by) { c.hp -= amt; c.data.hitBy = by; c.attackers.set(by, amt); if (c.hp <= 0) { c.dead = true; c.setState('dead'); } },
  };
  let idn = 0;
  const mk = (type, x = 0, z = 0, data = {}) => {
    const def = { ...CREATURES[type] }, id = 'c' + (idn++);
    const c = { type, def, id, pos: V(x, FY, z), yaw: 0, state: 'idle', t: 0, age: 5, cooldown: 0, stunT: 0, data: { ...data }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, target: null, level: 1, zone: 'in', extra: 0, dead: false, attackers: new Map(),
      setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } } };
    host.set(id, c); return c;
  };
  const player = (id, x, z, o = {}) => { const p = { id, pos: V(x, FY, z), eye: V(x, FY + 1.6, z), dead: false, inShip: false, zone: 'in', ...o }; players.push(p); M.pvel.set(id, { sp: 0 }); return p; };
  const step = (cs, s, dt = 0.05, each = null) => {
    for (let i = 0; i < Math.round(s / dt); i++) {
      g.time += dt;
      for (const c of [].concat(cs)) { if (c.dead || c.stunT > 0) continue; c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; CREATURES[c.type].behavior(c, dt, M); }
      if (i % 5 === 0) AI.hostTick(Object.assign(g, { creatures: M }));
      each?.(i * dt);
    }
  };
  g.creatures = M;
  return { g, M, mk, player, step, attacks, sent, host, items, addItem, noises, gotos };
}
AI.setSwGame({ run: { quotaIndex: 3 } });

await ok('scrapers: carry LOOSE scrap to the nest (real item, moved by the host), the nest fills + glows, only one bot per item, the ship and held items are safe', () => {
  const W = world();
  const nest = W.mk(NEST, 0, 0), bots = [W.mk(SCR, 3, 0, { nest: nest.id }), W.mk(SCR, -3, 0, { nest: nest.id })];
  W.addItem('a', 10, 0); W.addItem('b', -10, 2); W.addItem('held', 6, 6, { holder: 'p1', state: 'held' }); W.addItem('body', 8, 8, { type: 'body' });
  W.step([nest, ...bots], 40);
  for (const id of ['a', 'b']) { const it = W.items.get(id); assert.equal(it.state, 'world'); assert.ok(Math.hypot(it.obj.position.x, it.obj.position.z) < T.scr.heapR, id + ' is at the nest: ' + JSON.stringify(it.obj.position)); }
  assert.deepEqual([...nest.data.heap].sort(), ['a', 'b'], 'both stored'); assert.ok(nest.extra > 0 && nest.extra === C.heapFill(2), 'glow follows the heap');
  assert.equal(W.items.get('held').holder, 'p1', 'never takes what a player holds'); assert.ok(Math.hypot(W.items.get('body').obj.position.x - 8, W.items.get('body').obj.position.z - 8) < 1e-6, 'never a body');
  const held = W.sent.filter(([t, d]) => t === 'it' && d.e === 'held' && String(d.h).startsWith('c:')); assert.equal(held.length, 2, 'two carry events (holder c:<id>)'); assert.ok(AI.H.stats.stolen === 2);
  const W2 = world(); const ne = W2.mk(NEST, 0, 0), b1 = W2.mk(SCR, 1, 0, { nest: ne.id }), b2 = W2.mk(SCR, 1, 1, { nest: ne.id }); W2.addItem('solo', 12, 0);
  W2.step([ne, b1, b2], 3); assert.equal([b1, b2].filter((b) => b.data.want === 'solo').length, 1, 'one claimant');
});

await ok('scrapers: a hit bot drops its load and the colony rages after the 1.0 s nest alarm; lunge wind-up 0.85 s; stun / death drops the item too', () => {
  const W = world(); AI.resetHost();
  const nest = W.mk(NEST, 0, 0), b = W.mk(SCR, 2, 0, { nest: nest.id }), b2 = W.mk(SCR, -2, 0, { nest: nest.id }); W.addItem('a', 6, 0);
  const p = W.player('p1', 40, 0);
  W.step([nest, b, b2], 12); assert.ok(nest.data.heap.includes('a'), 'stored'); W.addItem('c', 4, 0);
  let carrier = null; for (let i = 0; i < 200 && !carrier; i++) { W.step([nest, b, b2], 0.05); carrier = [b, b2].find((x) => x.data.carry?.length) || null; }
  assert.ok(carrier, 'one bot is carrying the second item by now'); { const id = carrier.data.carry[0]; W.M.damage(carrier, 1, 'p1'); W.step([nest, b, b2], 0.1); assert.equal(carrier.data.carry.length, 0, 'load dropped'); assert.equal(W.items.get(id).holder, null); }
  assert.equal(nest.state, 'alarm', 'the nest rings first'); const t0 = W.g.time;
  W.step([nest, b, b2], 0.8); assert.notEqual(b2.state, 'rage', 'still the siren'); W.step([nest, b, b2], 0.4); assert.ok(['rage', 'windup'].includes(b2.state), 'the swarm moves: ' + b2.state);
  assert.ok(W.g.time - t0 >= T.scr.alarmT - 0.1);
  // lunge telegraph
  p.pos.set(b2.pos.x + 1, FY, b2.pos.z); b2.cooldown = 0; b2.data.rageT = 10; b2.data.tid = 'p1'; b2.setState('rage'); W.attacks.length = 0;
  let wind = null; W.step(b2, 3, 0.05, () => { if (b2.state === 'windup' && wind === null) wind = W.g.time; if (W.attacks.length && !W.attacks[0].at) W.attacks[0].at = W.g.time; });
  assert.ok(W.attacks.length >= 1 && W.attacks[0].at - wind >= T.scr.windup - 0.06, 'hit lands >= 0.85 s after the wind-up starts'); assert.equal(W.attacks[0].dmg, CREATURES[SCR].dmg);
  // stun drops
  const W2 = world(); const ne = W2.mk(NEST, 0, 0), s1 = W2.mk(SCR, 1, 0, { nest: ne.id }); W2.addItem('z', 5, 0);
  W2.step([ne, s1], 12, 0.05, () => { if (s1.data.carry?.length && !s1.stunT) { s1.stunT = 3; s1.setState('stunned'); } });
  assert.ok(s1.stunT > 0 || W2.items.get('z').state === 'world', 'stun dropped it'); assert.equal(W2.items.get('z').holder, null);
});

await ok('nest: taking a heap item or lingering next to it wakes the colony; smashing it pays a bonus once and rages the swarm at the raider; an empty nest is free to walk by', () => {
  const W = world(); AI.resetHost();
  const nest = W.mk(NEST, 0, 0), b = W.mk(SCR, 5, 0, { nest: nest.id }), b2 = W.mk(SCR, -5, 0, { nest: nest.id });
  const a = W.addItem('a', 1, 1), pl = W.player('p1', 30, 0); nest.data.init = 1; nest.data.heap = ['a']; nest.data.guard = {}; nest.data.alarmT = 0; nest.data.pruneT = 0;
  W.step([nest], 3); assert.equal(nest.state, 'idle', 'far away = quiet');
  pl.pos.set(4, FY, 0); W.step([nest], 1.0); assert.equal(nest.state, 'idle', 'guard meter still filling'); W.step([nest], 0.6); assert.equal(nest.state, 'alarm', 'lingering wakes it');
  W.step([nest, b, b2], 1.2); assert.equal(b.data.tid, 'p1'); assert.ok(b.data.rageT > 0);
  const W2 = world(); AI.resetHost(); const n2 = W2.mk(NEST, 0, 0), q = W2.mk(SCR, 4, 0, { nest: n2.id }); W2.addItem('a', 1, 1); n2.data.init = 1; n2.data.heap = ['a']; n2.data.guard = {}; n2.data.alarmT = 0; n2.data.pruneT = 0;
  W2.step([n2], 0.5); W2.items.get('a').holder = 'p9'; W2.items.get('a').state = 'held'; W2.step([n2], 0.6); assert.equal(n2.state, 'alarm', 'taking an item = raid'); assert.equal(n2.data.alarmPid, 'p9');
  const W3 = world(); AI.resetHost(); const n3 = W3.mk(NEST, 0, 0), q3 = W3.mk(SCR, 4, 0, { nest: n3.id }); n3.data.init = 1; n3.data.heap = ['x', 'y', 'z', 'w', 'v']; for (const id of n3.data.heap) W3.addItem(id, 1, 1);
  W3.player('p1', 2, 0); W3.M.damage(n3, 9999, 'p1'); assert.ok(n3.dead); const before = W3.items.size; W3.step([q3], 0.6);
  assert.equal(W3.items.size - before, C.bonusCount(5), 'bonus pieces'); const after = W3.items.size; W3.step([q3], 0.6); assert.equal(W3.items.size, after, 'paid once');
  assert.ok(q3.data.rageT > 0 && q3.data.tid === 'p1', 'colony rages at the raider'); assert.ok(W3.sent.some(([t, d]) => t === 'swfx' && d.k === 'raid'));
  const W4 = world(); AI.resetHost(); const n4 = W4.mk(NEST, 0, 0); W4.player('p1', 2, 0); W4.step(n4, 5); assert.equal(n4.state, 'idle', 'empty nest: nothing to guard');
});

await ok('streamer: boot telegraph 1.6 s, then LIVE pulses pull only calm mobile creatures within 30 m; hunters / hazards / far ones ignored; ring breaks at half HP and it never streams again; stun cuts it short', () => {
  const W = world(); AI.resetHost(); W.player('p1', 0, 12);
  const s = W.mk(STR, 0, 0); s.data.init = 1; s.data.cool = 0; s.data.walkT = 10; s.data.broken = false; s.setState('boot');
  const calm = W.mk('scuttler', 20, 0); calm.setState('idle'); const hunter = W.mk('lurker', 0, 20); hunter.setState('chase'); const far = W.mk('crawler', 45, 0); far.setState('idle'); const turret = W.mk('turret', 10, 10); turret.setState('idle'); const upstairs = W.mk('spider', 5, 5); upstairs.pos.y = FY + 9; upstairs.setState('idle');
  const log = []; W.step(s, 1.5, 0.05, () => log.push(s.state)); assert.ok(log.every((x) => x === 'boot'), 'still telegraphing at 1.5 s'); assert.equal(W.M.noises.length, 0);
  W.step(s, 0.3); assert.equal(s.state, 'live'); W.step(s, 0.2);
  assert.ok(W.sent.some(([t, d]) => t === 'swfx' && d.k === 'live'), 'LIVE toast broadcast'); assert.ok(W.sent.some(([t, d]) => t === 'swfx' && d.k === 'say'), 'speech tag');
  assert.ok(W.M.noises.length >= 1 && W.M.noises[0].loud >= 3, 'noise pulse for listeners');
  assert.ok(calm.dest && Math.hypot(calm.dest.x - s.pos.x, calm.dest.z - s.pos.z) < 6, 'calm creature pulled to the streamer'); assert.equal(calm.state, 'walk');
  for (const x of [hunter, far, turret, upstairs]) assert.ok(!x.dest, 'not pulled: ' + x.type);
  assert.ok(s.data.pulled >= 1);
  W.step(s, T.live.liveT + 0.2); assert.equal(s.state, 'walk', 'stream ends'); assert.ok(s.data.cool >= T.live.coolMin);
  // ring
  const W2 = world(); AI.resetHost(); W2.player('p1', 0, 5); const t2 = W2.mk(STR, 0, 0); t2.data.init = 1; t2.data.cool = 0; t2.data.walkT = 9; t2.setState('live'); t2.data.wasLive = true;
  W2.M.damage(t2, t2.maxHp * 0.3, 'p1'); W2.step(t2, 0.1); assert.equal(t2.state, 'live', 'a scratch does not break it'); assert.ok(t2.extra > 0 && t2.extra < 1);
  W2.M.damage(t2, t2.maxHp * 0.25, 'p1'); W2.step(t2, 0.1); assert.equal(t2.state, 'flee'); assert.equal(t2.extra, -1); assert.ok(W2.sent.some(([t, d]) => t === 'swfx' && d.k === 'ring'));
  W2.step(t2, 20); assert.ok(t2.data.broken && t2.state === 'walk'); W2.step(t2, 40); assert.notEqual(t2.state, 'boot', 'never streams again');
  // stun
  const W3 = world(); AI.resetHost(); W3.player('p1', 0, 5); const t3 = W3.mk(STR, 0, 0); t3.data.init = 1; t3.data.cool = 0; t3.data.walkT = 9; t3.setState('live'); t3.data.wasLive = true;
  t3.setState('idle'); W3.step(t3, 0.1); assert.equal(t3.state, 'walk'); assert.ok(t3.data.cool >= 7, 'a stun cancels the stream and delays the next');
});

await ok('automod: cleans bodies first, waits the 8 s item grace + never near a player, deletes chalk / blood, deletes for everybody with a sweep telegraph', () => {
  const W = world(); AI.resetHost(); const m = W.mk(MOD, 0, 0);
  const body = W.addItem('body1', 10, 0, { type: 'body', label: 'Bob' }); const drop = W.addItem('drop1', 6, 0, { dropHolder: 'p1' });
  W.g.horror = { store: { marks: new Map([[7, { id: 7, x: 4, y: FY, z: 4 }]]), remove(id) { return this.marks.delete(id); } } };
  AI.addBloodStain(W.g, -5, FY, 0, 1);
  W.step(m, 0.6); assert.ok(AI.H.cands.some((c) => c.kind === 'body') && AI.H.cands.some((c) => c.kind === 'chalk') && AI.H.cands.some((c) => c.kind === 'blood'));
  assert.ok(!AI.H.cands.some((c) => c.kind === 'item'), 'a fresh drop is not a target yet');
  const seen = []; W.step(m, 30, 0.05, () => { if (!seen.length || seen[seen.length - 1] !== m.state) seen.push(m.state); });
  assert.ok(seen.includes('scan') && seen.includes('sweep'), 'scan -> sweep telegraph: ' + seen.join('>'));
  assert.ok(!W.items.has('body1') && !W.items.has('drop1'), 'body and dropped item deleted'); assert.equal(W.g.horror.store.marks.size, 0, 'chalk wiped'); assert.equal(AI.H.blood.length, 0, 'blood cleaned');
  assert.ok(W.sent.some(([t, d]) => t === 'hrch' && d.rm?.includes(7))); assert.ok(W.sent.some(([t, d]) => t === 'swfx' && d.k === 'del' && d.kind === 'body') && W.sent.some(([t, d]) => t === 'swfx' && d.k === 'aim'));
  // an item somebody stands next to is left alone; carried bodies are not targets
  const W2 = world(); AI.resetHost(); const m2 = W2.mk(MOD, 0, 0); W2.addItem('mine', 6, 0, { dropHolder: 'p1' }); W2.player('p1', 7, 0);
  W2.step(m2, 20); assert.ok(W2.items.has('mine'), 'in use = protected');
  const W3 = world(); AI.resetHost(); const m3 = W3.mk(MOD, 0, 0); W3.addItem('b', 6, 0, { type: 'body', holder: 'p1', state: 'held' }); W3.step(m3, 20); assert.ok(W3.items.has('b'));
  const W4 = world(); AI.resetHost(); const m4 = W4.mk(MOD, 0, 0); W4.addItem('creatureDrop', 6, 0, { dropHolder: 'c:c9' }); W4.step(m4, 20); assert.ok(W4.items.has('creatureDrop'), 'creature drops (scraper nest items) are not the crew\'s');
});

await ok('automod: lingering next to a body flags YOU (meter, 1.3 s stationary telegraph, heavy hit only if you stay); walking away or carrying the body avoids it; hitting it flags you too', () => {
  const W = world(); AI.resetHost(); const m = W.mk(MOD, 6, 0); const p = W.player('p1', 0, 0); W.addItem('body1', 1, 0, { type: 'body' });
  let flagAt = null, hitAt = null, extraMax = 0;
  W.step(m, 12, 0.05, () => { extraMax = Math.max(extraMax, m.extra); if (m.state === 'flag' && flagAt === null) flagAt = W.g.time; if (W.attacks.length && hitAt === null) hitAt = W.g.time; });
  assert.ok(extraMax > 0.5, 'the meter is visible on the model'); assert.ok(flagAt !== null && hitAt !== null, 'flag then hit');
  assert.ok(hitAt - flagAt >= T.mod.flagT - 0.06, 'hit >= 1.3 s after the flag: ' + (hitAt - flagAt)); assert.equal(W.attacks[0].dmg, CREATURES[MOD].dmg); assert.equal(W.attacks[0].cause, MOD); assert.equal(W.attacks[0].state, 'flag');
  assert.ok(AI.H.stats.flags >= 1);
  // step away during the telegraph = whiff
  const W2 = world(); AI.resetHost(); const m2 = W2.mk(MOD, 3, 0); const q = W2.player('p1', 0, 0); W2.addItem('body1', 1, 0, { type: 'body' });
  W2.step(m2, 12, 0.05, () => { if (m2.state === 'flag') q.pos.set(9, FY, 0); }); assert.equal(W2.attacks.length, 0, 'whiff');
  // walks away from the body before the meter fills: nothing
  const W3 = world(); AI.resetHost(); const m3 = W3.mk(MOD, 6, 0); const r = W3.player('p1', 0, 0); W3.addItem('body1', 1, 0, { type: 'body' });
  W3.step(m3, 3, 0.05); r.pos.set(0, FY, 20); W3.step(m3, 10, 0.05); assert.equal(W3.attacks.length, 0);
  // carrying the body: it is not lying there
  const W4 = world(); AI.resetHost(); const m4 = W4.mk(MOD, 6, 0); W4.player('p1', 0, 0); const b4 = W4.addItem('body1', 1, 0, { type: 'body' }); b4.holder = 'p1'; b4.state = 'held'; W4.step(m4, 15); assert.equal(W4.attacks.length, 0);
  // hitting it
  const W5 = world(); AI.resetHost(); const m5 = W5.mk(MOD, 3, 0); W5.player('p1', 0, 0); W5.step(m5, 0.2); W5.M.damage(m5, 5, 'p1'); W5.step(m5, 5); assert.ok(W5.attacks.length >= 1 && W5.attacks[0].p === 'p1', 'retaliation, with the same telegraph');
});

await ok('installer: wires events + the swfx handler, blood from hostHurtPlayer (wrap restored on dispose), colony / streamer debug, tick + late-join sync', async () => {
  const { installSwarm11 } = await import('../../src/game/swarm11.js');
  const W = world(); AI.resetHost(); const g = W.g;
  const handlers = new Map(), netOn = new Map(), later = [];
  const mods = { on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, soundGens: new Map() };
  const orig = function hostHurtPlayer() { return 'orig'; };
  Object.assign(g, { mods, run: { phase: 'moon', moon: 'hamsi', seed: 5, day: 1, quotaIndex: 1 }, scene: new THREE.Scene(), player: { yaw: 0, pos: new THREE.Vector3(0, FY, 0) }, selfId: 'p1', later: (fn) => later.push(fn), hostHurtPlayer: orig });
  g.net.sendTo = (id, t, d) => W.sent.push(['to:' + id, d]);
  const api = installSwarm11(g);
  assert.ok(api && api.debug && typeof api.dispose === 'function' && g.hostHurtPlayer !== orig, 'wrapped');
  for (const ev of ['netReady', 'playerJoin', 'moonPopulated', 'phase', 'update']) assert.ok(handlers.get(ev)?.length, ev);
  handlers.get('netReady')[0]({ on_: (t, fn) => netOn.set(t, fn) }, g); assert.ok(netOn.get('swfx'), 'swfx handler');
  W.player('p1', 3, 3); assert.equal(g.hostHurtPlayer('p1', 2, 'x'), 'orig'); assert.equal(AI.H.blood.length, 0, 'a scratch leaves no blood');
  assert.equal(g.hostHurtPlayer('p1', 20, 'crawler'), 'orig'); assert.equal(AI.H.blood.length, 1, 'a real hit does');
  assert.ok(W.sent.some(([t, d]) => t === 'swfx' && d.k === 'blood'));
  handlers.get('playerJoin')[0]('p2'); later.splice(0).forEach((f) => f()); assert.ok(W.sent.some(([t, d]) => t === 'to:p2' && d.k === 'sync' && d.blood.length === 1), 'late joiner gets the stains');
  netOn.get('swfx')({ k: 'blood', id: 5, p: [1, FY, 1], s: 1 }); assert.equal(api.fx.count(), 1); netOn.get('swfx')({ k: 'brm', id: 5 }); assert.equal(api.fx.count(), 0);
  const nid = api.debug.colony(6); assert.ok(nid); const st = api.debug.state(); assert.equal(st.creatures.filter((c) => c.type === SCR).length, 6); assert.equal(st.creatures.filter((c) => c.type === NEST).length, 1);
  assert.ok(api.debug.streamer()); assert.equal(api.debug.goLive(), 1); assert.ok(api.debug.automod());
  handlers.get('update')[0](0.3); handlers.get('moonPopulated')[0](g); handlers.get('phase')[0]('orbit');
  api.dispose(); assert.equal(g.hostHurtPlayer, orig, 'wrap restored'); assert.equal(AI.H.blood.length, 0);
});

await ok('models build + animate through every state, no THREE lights, carry anchor, pull rings, disposal', async () => {
  const M = await import('../../src/models/swarm11_models.js');
  const states = ['idle', 'walk', 'return', 'rage', 'windup', 'attack', 'alarm', 'boot', 'live', 'flee', 'scan', 'sweep', 'hunt', 'flag', 'delete', 'stunned', 'dead'];
  for (const [name, fn] of [['scraper', M.createScraperModel], ['nest', M.createNestModel], ['streamer', M.createStreamerModel], ['automod', M.createAutoModModel]]) {
    const m = fn({ seed: 5 });
    m.root.traverse((o) => assert.ok(!o.isLight, name + ' has a light'));
    assert.ok(m.height > 0 && m.radius > 0);
    for (const st of states) for (const pr of [0, 0.5, 1, -1]) for (let i = 0; i < 4; i++) m.update(0.05, { state: st, speed: i, t: i * 0.4, time: i * 0.7, progress: pr });
    m.setHitFlash(0.5); m.dispose();
  }
  assert.ok(M.createScraperModel({}).parts.carry, 'carry anchor');
  const s = M.createStreamerModel({}); s.update(0.05, { state: 'live', speed: 0, t: 0.4, time: 1, progress: 1 });
  let rings = 0; s.root.traverse((o) => { if (o.isMesh && o.geometry?.type === 'RingGeometry' && o.visible) rings++; }); assert.ok(rings >= 1, 'pull rings visible while LIVE');
  s.update(0.05, { state: 'walk', speed: 1, t: 0.4, time: 1, progress: 1 }); rings = 0; s.root.traverse((o) => { if (o.isMesh && o.geometry?.type === 'RingGeometry' && o.visible) rings++; }); assert.equal(rings, 0);
  const reg = new Map(); M.registerSw11Models(reg); for (const id of C.ALL_IDS) assert.ok(reg.get(id)(null, { seed: 3 }).root);
});

await ok('sound recipes render finite, non-silent buffers; the STATE_SOUNDS / LOOPS ids all exist', async () => {
  const S = await import('../../src/game/swarm11_sfx.js');
  for (const [id, fn] of Object.entries(S.SOUNDS)) {
    const b = fn(8000); assert.ok(b.length > 100, id); let mx = 0; for (const v of b) { assert.ok(Number.isFinite(v), id); mx = Math.max(mx, Math.abs(v)); } assert.ok(mx > 0.05, id + ' not silent');
  }
  const { STATE_SOUNDS, LOOPS } = await import('../../src/entities/creatures.js');
  for (const id of C.ALL_IDS) {
    for (const v of Object.values(STATE_SOUNDS[id] || {})) for (const nm of [].concat(Array.isArray(v[0]) ? v[0] : v[0])) if (String(nm).startsWith('sw_')) assert.ok(S.SOUNDS[nm], 'state sound ' + nm);
    for (const [, snd] of LOOPS[id] || []) assert.ok(S.SOUNDS[snd], 'loop ' + snd);
  }
});

console.log(n + ' checks passed');
