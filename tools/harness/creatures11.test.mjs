// creatures11 (wave 11) rules + host logic test:  node tools/harness/creatures11.test.mjs
// Pure rules (captcha round / gate pick / ban clock / Habits tracker), registration (spawn gate / pools / i18n / codex rows), the three state machines against a
// fake manager (Captcha test flow, Shadowban ban + touch lift, Recommender ambush + pattern breaks), models + sound recipes, minigame icons, and the installer.
// No browser, no physics, no rendering.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const C = await import('../../src/game/creatures11_core.js');
const { Habits } = await import('../../src/game/creatures11_habits.js');
const AI = await import('../../src/game/creatures11_ai.js');
const { CREATURES, EXTRA_SPAWNS, spawnTable, canSpawnMore } = await import('../../src/game/creatures.js');
const { IDENT } = await import('../../src/game/identify.js');
const { HEADLINE, HEAD_IDS } = await import('../../src/game/threatpool.js');
const { FIELD_NOTES } = await import('../../src/game/collection.js');
const { TR, RU, ROWS } = await import('../../src/game/creatures11_text.js');
const { RULES } = await import('../../src/game/balance_rules.js');
const { HOST_ONLY } = await import('../../src/net/session.js');
const THREE = await import('three');
const { RNG } = await import('../../src/core/rng.js');
const T = C.TUNE, TC = T.cap, TB = T.ban, TR_ = T.rec, { captcha: CAP, shadowban: SB, recommender: REC } = C.IDS;
const ST = AI.ST;
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const seq = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

// ---------------------------------------------------------------------------------------------------- a synthetic facility layout: a 2x2 hub with 4 exits
// hub cells (4..5, 4..5) = room 0; corridor cells (3,4) (6,4) (4,3) (5,6) hold the doorways; edgeKey / idx / edgeInfo exactly as world/facility.js builds them
function layout() {
  const W = 10, H = 10, cell = 4, ox = -20, oz = -20;
  const cells = new Uint8Array(W * H), roomOf = new Int16Array(W * H).fill(-1), edgeInfo = new Map();
  const idx = (x, z) => z * W + x;
  const edgeKey = (x, z, dir) => { if (dir === 2) { x -= 1; dir = 0; } else if (dir === 3) { z -= 1; dir = 1; } return ((z * W + x) << 1) | dir; };
  for (const [x, z] of [[4, 4], [5, 4], [4, 5], [5, 5]]) { cells[idx(x, z)] = 1; roomOf[idx(x, z)] = 0; }
  for (const [x, z] of [[3, 4], [2, 4], [6, 4], [7, 4], [4, 3], [4, 2], [5, 6], [5, 7]]) cells[idx(x, z)] = 2;
  const add = (x, z, dir, type = 'arch') => {
    const key = edgeKey(x, z, dir), nx = x + (dir === 0 ? 1 : 0), nz = z + (dir === 1 ? 1 : 0);
    edgeInfo.set(key, { type, width: 2.6, key, dir, cx: dir === 0 ? x + 1 : x + 0.5, cz: dir === 1 ? z + 1 : z + 0.5, a: idx(x, z), b: idx(nx, nz) });
    return key;
  };
  const keys = { west: add(3, 4, 0), east: add(5, 4, 0), north: add(4, 3, 1), south: add(5, 5, 1, 'door') };
  return { w: W, h: H, cell, ox, oz, y: 0, cells, roomOf, edgeInfo, edgeKey, idx, keys, generator: null };
}
const cpos = (L, cx, cz) => [L.ox + (cx + 0.5) * L.cell, L.oz + (cz + 0.5) * L.cell];
const walk = (trk, id, L, path, crouch = false, t0 = 0) => { let last = null, i = 0; for (const [cx, cz] of path) { const [x, z] = cpos(L, cx, cz); last = trk.observe(id, x, z, crouch, t0 + i++) || last; } return last; };
const WEST_STRAIGHT = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]];   // enter the hub from the west, leave straight east
const WEST_TO_NORTH = [[2, 4], [3, 4], [4, 4], [4, 3], [4, 2]];          // enter from the west, leave through the north door

await ok('pure rules: captcha round (deterministic, 3 answers, category), picks check, ban clock, target pick', () => {
  for (let s = 1; s < 300; s += 7) {
    const a = C.captchaRound(s), b = C.captchaRound(s);
    assert.deepEqual(a, b, 'same seed, same round on host and client');
    assert.equal(a.tiles.length, 9); assert.equal(a.answer.length, 3);
    assert.ok(a.tiles.filter((t) => t.ok).every((t) => C.CAP_ICONS[a.cat].includes(t.icon)), 'the 3 right tiles are of the asked category');
    assert.ok(a.tiles.filter((t) => !t.ok).every((t) => !C.CAP_ICONS[a.cat].includes(t.icon)), 'decoys are not');
    assert.ok(C.checkPicks(a, [...a.answer].reverse()) && !C.checkPicks(a, a.answer.slice(0, 2)) && !C.checkPicks(a, [...a.answer.slice(0, 2), (a.answer[2] + 1) % 9]) && !C.checkPicks(a, null));
  }
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => C.captchaRound(i + 1).cat)).size === 2, 'both categories appear');
  const b = C.newBan('a', 'c1');
  assert.equal(b.left, TB.dur); assert.equal(C.newBan('a', 'c1', true).left, TB.soloDur);
  assert.equal(C.banStep(b, 1, false), null);
  let r = null; for (let i = 0; i < 100 && !r; i++) r = C.banStep(b, 0.05, true);
  assert.equal(r, 'lift'); assert.ok(b.touch >= TB.touchT && b.touch < TB.touchT + 0.1);
  const b2 = C.newBan('a', 'c1'); b2.left = 0.04; assert.equal(C.banStep(b2, 0.05, false), 'end');
  const b3 = C.newBan('a', 'c1'); C.banStep(b3, 0.2, true); C.banStep(b3, 0.5, false); assert.equal(b3.touch, 0, 'a brief brush that ends decays');
  const pl = [{ id: 'a', pos: { x: 0, z: 0 } }, { id: 'b', pos: { x: 3, z: 0 } }, { id: 'c', pos: { x: 40, z: 0 } }];
  assert.equal(C.pickBanTarget(pl, { x: 0, z: 0 }).id, 'c', 'the lone wolf');
  assert.equal(C.pickBanTarget([pl[0]], null).id, 'a'); assert.equal(C.pickBanTarget([], null), null);
});

await ok('pickGate: an unlocked doorway on the route (arch preferred), never near the entrance, fallback without a route', () => {
  const L = layout();
  const route = [cpos(L, 2, 4), cpos(L, 7, 4)].map(([x, z]) => ({ x, z }));
  const seen = new Set();
  for (let i = 1; i < 60; i++) {
    const info = C.pickGate(L, route, new RNG(i * 7919).fn());
    assert.ok(info && info.key !== L.keys.south, 'only doorways within 2.6 m of the route (the south door is 6 m away): ' + info?.key);
    seen.add(info.key);
  }
  assert.ok(seen.size >= 2 && seen.has(L.keys.west) && seen.has(L.keys.east));
  const c = C.doorCenter(L, L.edgeInfo.get(L.keys.east)); assert.equal(c.x, L.ox + 6 * L.cell); assert.equal(c.z, L.oz + 4.5 * L.cell);
  assert.deepEqual(C.doorNormal(L.edgeInfo.get(L.keys.east)), { x: 1, z: 0 }); assert.deepEqual(C.doorNormal(L.edgeInfo.get(L.keys.north)), { x: 0, z: 1 });
  const ent = C.doorCenter(L, L.edgeInfo.get(L.keys.west));
  for (let i = 1; i < 20; i++) assert.notEqual(C.pickGate(L, route, new RNG(i * 31).fn(), ent)?.key, L.keys.west, 'avoids the entrance');
  L.edgeInfo.get(L.keys.west).locked = true; L.edgeInfo.get(L.keys.east).locked = true;
  const fb = C.pickGate(L, null, seq(3)); assert.ok(fb && !fb.locked, 'fallback: any unlocked doorway'); assert.equal(fb.key === L.keys.north || fb.key === L.keys.south, true);
  assert.equal(C.pickGate({ ...L, edgeInfo: new Map() }, route, seq(1)), null);
  const q = C.nearestOnRoute([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], { x: 10, z: 5 }); assert.ok(q.d < 1e-9 && Math.abs(q.s - 15) < 1e-9);
});

await ok('habits: a repeated route is learned (2x), crossings are events, backtrack / incognito / re-learn', () => {
  const L = layout(), trk = new Habits(L);
  const ev = walk(trk, 'a', L, [[2, 4], [3, 4], [4, 4]]);
  assert.ok(ev && ev.key === L.keys.west && ev.sign === 1 && ev.room === 0, 'entering the hub through the west doorway');
  assert.equal(trk.predict('a'), null, 'nothing learned yet');
  walk(trk, 'a', L, [[5, 4], [6, 4], [7, 4]]);   // ...leaves east once
  assert.equal(trk.predict('a'), null);
  walk(trk, 'a', L, [[6, 4], [5, 4], [4, 4], [3, 4], [2, 4], [3, 4], [4, 4]]);   // back through the hub (west exit), then in again from the west
  walk(trk, 'a', L, [[5, 4], [6, 4]]);           // east again: the route west->east now has 2 counts... (the return trip counted a different entry)
  walk(trk, 'a', L, [[7, 4], [6, 4], [5, 4], [4, 4], [3, 4], [2, 4], [3, 4], [4, 4]]);
  const p = trk.predict('a', { x: -3, z: -2 });
  assert.ok(p && p.exit.id === `${L.keys.east}:1` && p.why === 'route', 'predicts the east exit: ' + JSON.stringify(p && { id: p.exit.id, why: p.why }));
  assert.ok(p.conf >= T.rec.share && p.room === 0);
  // a different player has their own model
  assert.equal(trk.predict('b'), null);
  // incognito: crouching crossings are not learned, and clear the pending room
  const t2 = new Habits(L);
  for (let i = 0; i < 4; i++) walk(t2, 'a', L, [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [6, 4], [5, 4], [4, 4], [3, 4], [2, 4]], true);
  assert.equal(t2.predict('a'), null); assert.ok(t2.lastEvent('a').incognito);
  // the un-learn: a shown guess that misses costs the route a count
  const t3 = new Habits(L);
  for (let i = 0; i < 3; i++) { walk(t3, 'a', L, WEST_STRAIGHT); walk(t3, 'a', L, [[6, 4], [5, 4], [4, 4], [3, 4], [2, 4]]); }
  walk(t3, 'a', L, [[2, 4], [3, 4], [4, 4]]);
  const g1 = t3.predict('a'); assert.ok(g1, 'learned'); t3.markShown('a', g1);
  walk(t3, 'a', L, [[4, 3], [4, 2]]);              // broke the pattern: the north door
  assert.equal(t3.stat.miss, 1); assert.equal(t3.stat.hit, 0);
  // hits are counted too
  const t4 = new Habits(L);
  for (let i = 0; i < 3; i++) { walk(t4, 'a', L, WEST_STRAIGHT); walk(t4, 'a', L, [[6, 4], [5, 4], [4, 4], [3, 4], [2, 4]]); }
  walk(t4, 'a', L, [[2, 4], [3, 4], [4, 4]]); t4.markShown('a', t4.predict('a')); walk(t4, 'a', L, [[5, 4], [6, 4]]);
  assert.equal(t4.stat.hit, 1);
  // a teleport / diagonal never fakes a crossing; outside the layout is ignored
  const t5 = new Habits(L); assert.equal(t5.observe('a', 999, 999, false, 0), null); walk(t5, 'a', L, [[2, 4]]);
  assert.equal(walk(t5, 'a', L, [[7, 4]]), null);
});

await ok('habits: relative-turn HABIT (always straight) is predicted on a door the player never used, and the turn category is relative to how they entered', () => {
  const L = layout(), trk = new Habits(L);
  // enter from the west and leave straight (east) 3 times, from the SOUTH going straight (north) is a different route the model never saw
  for (let i = 0; i < 3; i++) { walk(trk, 'a', L, WEST_STRAIGHT); walk(trk, 'a', L, [[7, 4], [6, 4], [5, 4], [4, 4], [3, 4], [2, 4]]); }
  walk(trk, 'a', L, [[5, 7], [5, 6], [5, 5]]);      // enters through the south door (never entered from there)
  const p = trk.predict('a', { x: 0, z: 6 });
  assert.ok(p && p.why === 'habit' && p.exit.cat === 'straight', JSON.stringify(p && { why: p.why, cat: p.exit.cat }));
  assert.equal(p.exit.info.key, L.keys.north, 'straight ahead of a south entry (moving -z) is the north doorway');
  const cats = trk.exitsOf(0, trk.lastEvent('a')).map((x) => x.cat).sort();
  assert.deepEqual(cats, ['back', 'left', 'right', 'straight']);
  // habit needs agreement: a mixed history predicts nothing
  const t2 = new Habits(L);
  walk(t2, 'a', L, WEST_STRAIGHT); walk(t2, 'a', L, [[6, 4], [5, 4], [4, 4], [3, 4], [2, 4]]); walk(t2, 'a', L, WEST_TO_NORTH); walk(t2, 'a', L, [[4, 3], [4, 4], [3, 4], [2, 4]]);
  walk(t2, 'a', L, [[2, 4], [3, 4], [4, 4]]); assert.equal(t2.predict('a'), null);
});

await ok('registration: creatures, one rule in the first lore sentence, balance fit, telegraphs >= 0.8 s, codex + scanner rows, threat pool', () => {
  AI.registerC11Content(); AI.registerC11Content();
  for (const id of C.ALL_IDS) {
    const d = CREATURES[id]; assert.ok(d && typeof d.behavior === 'function', id);
    assert.ok(d.dmg <= 45, 'hit fits the quota 0-1 cap: ' + d.dmg); assert.ok(d.maxAlive >= 1); assert.ok(d.hp > 0 && d.hp <= 300);
    assert.ok(/^[^.!?]{25,}[.!?]/.test(d.lore), 'first sentence is the rule caption');
    assert.ok(IDENT[id] && IDENT[id][2].length > 20 && FIELD_NOTES[id]);
    assert.ok(HEAD_IDS.has(id) && HEADLINE.some((h) => h.id === id && h.zone === 'in'));
  }
  assert.ok(TC.scan >= 0.8 && TC.alarm >= 0.8 && TB.mark >= 0.8 && TB.windup >= 0.8 && TR_.glow >= 0.8 && TR_.windup >= 0.8, 'telegraph >= 0.8 s');
  assert.ok(TC.limit === 5 && TC.pass === 20 && TB.dur === 25 && TR_.glow === 2, 'the numbers of the brief');
  assert.ok(TC.burstDmg <= 20 && TC.stun <= 2, 'the burst is a nuisance, not a killer');
});

await ok('spawn pools: not on tier 1 moons, not in the first quotas (generic gate), data-driven weights', () => {
  for (const id of C.ALL_IDS) { assert.ok(EXTRA_SPAWNS[id]); assert.equal(EXTRA_SPAWNS[id].zone, 'in'); assert.equal(EXTRA_SPAWNS[id].w[0], 0, 'tier 1 = 0'); assert.ok(EXTRA_SPAWNS[id].w[3] > 0); }
  const moon = (tier) => ({ id: 'x', tier, interior: 'factory', creatures: { scuttler: 10 }, outdoor: {} });
  assert.ok(!(CAP in spawnTable(moon(1), 'in')) && (CAP in spawnTable(moon(2), 'in')) && (SB in spawnTable(moon(3), 'in')) && (REC in spawnTable(moon(4), 'in')));
  const M = new Map();
  AI.setC11Game(null); assert.equal(canSpawnMore(CAP, M), false, 'no run: blocked');
  const g = { run: { quotaIndex: 0 } }; AI.setC11Game(g);
  for (const id of C.ALL_IDS) assert.equal(canSpawnMore(id, M), false, 'quota 0 blocked ' + id);
  for (let q = 1; q <= 5; q++) { g.run.quotaIndex = q; for (const id of C.ALL_IDS) assert.equal(canSpawnMore(id, M), q >= C.TUNE.minQuota[id], `quota ${q} gate ${id}`); }   // wave 12: Captcha 1, Shadowban 3, Recommender 4
  assert.ok(C.TUNE.minQuota[CAP] === 1 && C.TUNE.minQuota[SB] >= 3 && C.TUNE.minQuota[REC] > C.TUNE.minQuota[CAP], 'balance12: the puzzle first, the mute + habit learner later');
  M.set('a', { type: CAP, dead: false }); assert.equal(canSpawnMore(CAP, M), false, 'max 1 Captcha alive');
});

await ok('i18n: EN + TR + RU for every player-facing string (name, lore, death text, hint, field note, sign, toasts)', () => {
  for (const id of C.ALL_IDS) for (const s of [CREATURES[id].$name, CREATURES[id].$lore, CREATURES[id].deathText, IDENT[id][2], FIELD_NOTES[id]]) {
    assert.ok(TR[s] && RU[s], 'missing ' + String(s).slice(0, 40)); assert.notEqual(TR[s], s); assert.notEqual(RU[s], s);
  }
  for (const [en, tr, ru] of ROWS) { assert.ok(en && tr && ru); assert.ok(/[а-яА-Я]/.test(ru), 'RU is Cyrillic: ' + en.slice(0, 30)); }
  // every t('...') literal in the client / model files is a row
  for (const f of ['creatures11_fx.js', '../models/creatures11_models.js']) {
    const src = fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('([^']+)'\)/g)) assert.ok(TR[m[1]] && RU[m[1]], f + ' string without TR/RU: ' + m[1]);
    for (const m of src.matchAll(/'((?:The ban|The Shadowban|VERIFIED|ROBOT|You have|A crewmate)[^']*)'/g)) assert.ok(TR[m[1]] && RU[m[1]], f + ' message without TR/RU: ' + m[1]);
  }
});

// ---------------------------------------------------------------------------------------------------- state machines (fake manager)
function world(L = null) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const players = [], host = new Map(), sent = [], attacks = [], hurts = [], stuns = [], noises = [];
  const g = {
    time: 100, isHost: true, selfId: 'a', net: { broadcast(t, d) { sent.push([t, d]); } }, world: { facility: L ? { layout: L, nav: null, mainDoor: null } : {} }, physics: { lineOfSight: () => true },
    hostHurtPlayer(id, dmg, cause) { hurts.push({ id, dmg, cause }); }, hostStunPlayer(id, t) { stuns.push({ id, t }); }, aiPlayers: () => players.filter((p) => !p.dead), run: { quotaIndex: 3 },
  };
  const M = {
    game: g, host, pvel: new Map(), playersFor: () => players.filter((p) => !p.dead),
    nearest(c, list, maxD = 1e9) { let best = null, bd = maxD; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; },
    canSee: () => true, hear: () => null, nav: () => null,
    attack(c, p, dmg, cause) { attacks.push({ type: c.type, id: c.id, p: p.id, dmg, cause, t: g.time }); },
    noise(pos, loud) { noises.push({ pos: pos.clone(), loud }); },
    goTo(c, x, z) { c.dest = { x, z }; }, goToLazy() {}, wander(c) { this.goTo(c, c.pos.x + 5, c.pos.z); }, follow() { return false; },
    moveToward(c, t, dt, sp) { const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz) || 1; c.pos.x += dx / d * sp * dt; c.pos.z += dz / d * sp * dt; },
  };
  g.creatures = M;
  let idn = 0;
  const mk = (type, x = 0, z = 0, data = {}, seed = 4) => {
    const def = { ...CREATURES[type] }, id = 'c' + (idn++);
    const c = { type, def, id, pos: V(x, 0, z), yaw: 0, state: 'idle', t: 0, age: 5, cooldown: 0, stunT: 0, data: { ...data }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, target: null, seed, level: 1, zone: 'in', extra: 0, dead: false,
      setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } } };
    host.set(id, c); return c;
  };
  const player = (id, x, z, o = {}) => { const p = { id, pos: V(x, 0, z), eye: V(x, 1.6, z), look: V(0, 0, -1), dead: false, inShip: false, zone: 'in', crouch: false, ...o }; players.push(p); M.pvel.set(id, { sp: 0 }); return p; };
  const step = (cs, s, dt = 0.05, each = null) => { for (let i = 0; i < Math.round(s / dt); i++) { g.time += dt; for (const c of [].concat(cs)) { if (c.dead) continue; c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; CREATURES[c.type].behavior(c, dt, M); } each?.(i * dt); } };
  return { g, M, mk, player, step, attacks, hurts, stuns, noises, sent, host, players };
}
AI.setC11Game({ run: { quotaIndex: 3 } });
const capData = (x = 0, z = 0, nx = 1, nz = 0) => ({ init: 1, slide: 0, cool: {}, res: null, hp: CREATURES[CAP].hp, tid: null, askT: 0, home: { x, z }, n: { x: nx, z: nz }, yaw0: Math.atan2(nx, nz), fy: 0 });
const asks = (W) => W.sent.filter(([t, d]) => t === 'c11fx' && d.k === 'ask').map(([, d]) => d);

await ok('captcha: zone -> 0.9 s scan -> the test (5 s, ONE answerer, the seed is the round) -> pass = aside 20 s (never closes on you) -> back in the doorway', () => {
  const W = world(); const a = W.player('a', 8, 0), b = W.player('b', 9, 4); const c = W.mk(CAP, 0, 0, capData()); c.setState('dormant');
  W.step(c, 1); assert.equal(c.state, 'dormant', 'nobody in the zone');
  a.pos.set(1.8, 0, 0); W.step(c, 0.1); assert.equal(c.state, 'scan');
  W.step(c, 0.7); assert.equal(c.state, 'scan', 'the scan is a telegraph: 0.9 s'); assert.equal(asks(W).length, 0);
  W.step(c, 0.3); assert.equal(c.state, 'demand'); const q = asks(W); assert.equal(q.length, 1); assert.equal(q[0].to, 'a'); assert.equal(q[0].lim, 5); assert.equal(q[0].cid, c.id);
  // a second player walks into the zone while the first answers: ignored, not asked, no penalty
  b.pos.set(0.5, 0, 0.5); W.step(c, 1); assert.equal(c.state, 'demand'); assert.equal(asks(W).length, 1, 'only one answerer at a time');
  assert.ok(c.extra < 1 && c.extra > 0, 'time bar drains: ' + c.extra);
  const R = C.captchaRound(q[0].seed);
  assert.equal(AI.captchaAnswer(W.M, c.id, 'b', q[0].seed, R.answer), false, 'not the answerer');
  assert.equal(AI.captchaAnswer(W.M, c.id, 'a', q[0].seed + 1, R.answer), false, 'stale seed');
  assert.equal(AI.captchaAnswer(W.M, c.id, 'a', q[0].seed, R.answer), true);
  W.step(c, 0.1); assert.equal(c.state, 'off'); assert.ok(W.sent.some(([t, d]) => t === 'c11fx' && d.k === 'res' && d.ok === 1 && d.to === 'a'));
  W.step(c, 1.5); assert.ok(Math.abs(c.pos.z - TC.slide) < 0.05 && Math.abs(c.pos.x) < 1e-6, 'slid along the wall (n = +x -> aside along z): ' + c.pos.z); assert.ok(Math.abs(Math.sin(c.yaw - c.data.yaw0)) > 0.99, 'edge-on');
  assert.equal(W.attacks.length + W.hurts.length, 0);
  // it never closes on somebody standing in the doorway (up to clearMax)
  b.pos.set(0.3, 0, 0); W.step(c, TC.pass + 1); assert.equal(c.state, 'off', 'held open while somebody stands in it');
  b.pos.set(6, 0, 6); a.pos.set(6, 0, -6); W.step(c, 0.3); assert.equal(c.state, 'dormant'); W.step(c, 1.2); assert.ok(Math.abs(c.pos.z) < 1e-6 && Math.abs(c.pos.x) < 1e-6, 'back in the doorway');
  assert.equal(W.noises.length, 0, 'a pass makes no noise');
});

await ok('captcha: wrong answer / ESC / timeout = 1 s alarm wind-up, then stun burst (radius, small dmg) + a loud noise, then it reboots with the gate open', () => {
  for (const how of ['wrong', 'cancel', 'timeout']) {
    const W = world(); const a = W.player('a', 1.5, 0), far = W.player('b', 20, 0), near = W.player('c', 6, 4); const c = W.mk(CAP, 0, 0, capData()); c.setState('dormant');
    W.step(c, 1.1); assert.equal(c.state, 'demand'); const seed = asks(W)[0].seed, R = C.captchaRound(seed);
    if (how === 'wrong') AI.captchaAnswer(W.M, c.id, 'a', seed, R.tiles.flatMap((t, i) => (t.ok ? [] : [i])).slice(0, 3));
    else if (how === 'cancel') AI.captchaAnswer(W.M, c.id, 'a', seed, [], { cancelled: true });
    else { W.step(c, TC.limit + TC.grace - 0.3); assert.equal(c.state, 'demand', 'the grace is respected'); }
    for (let i = 0; i < 40 && c.state !== 'alarm'; i++) W.step(c, 0.05);
    assert.equal(c.state, 'alarm', how + ' -> alarm'); assert.equal(W.hurts.length, 0, 'nothing lands during the wind-up');
    W.step(c, TC.alarm - 0.15); assert.equal(W.hurts.length, 0, 'still telegraphing'); assert.equal(c.state, 'alarm');
    W.step(c, 0.3); assert.equal(c.state, 'reload');
    assert.deepEqual(W.hurts.map((h) => h.id).sort(), ['a', 'c'], 'burst hits everybody within ' + TC.burstR + ' m, not the far one');
    assert.ok(W.hurts.every((h) => h.dmg === TC.burstDmg && h.cause === CAP)); assert.deepEqual(W.stuns.map((s) => s.id).sort(), ['a', 'c']); assert.ok(W.stuns.every((s) => s.t === TC.stun));
    assert.ok(W.noises.some((nz) => nz.loud >= TC.noise), 'the noise calls every creature around');
    assert.ok(W.sent.some(([t, d]) => t === 'cev' && d.e === 'snd' && d.s.includes('c11_cap_burst')));
    W.step(c, 1); assert.ok(c.pos.z > 1, 'gate open while it reboots'); W.step(c, TC.reload); assert.notEqual(c.state, 'reload', 'it reboots (and, with you still in its zone, asks again)');
    assert.ok(far);
  }
});

await ok('captcha: stepping back out of the scan cancels it (and it will not re-scan you for a moment); busy client; hurting it starts the alarm', () => {
  const W = world(); const a = W.player('a', 1.5, 0); const c = W.mk(CAP, 0, 0, capData()); c.setState('dormant');
  W.step(c, 0.5); assert.equal(c.state, 'scan'); a.pos.set(6, 0, 0); W.step(c, 0.1); assert.equal(c.state, 'dormant'); assert.equal(asks(W).length, 0);
  a.pos.set(1.5, 0, 0); W.step(c, 0.3); assert.equal(c.state, 'dormant', 'retry cooldown'); W.step(c, TC.retry); assert.equal(c.state, 'scan');
  W.step(c, 1); assert.equal(c.state, 'demand'); const s = asks(W)[0].seed;
  AI.captchaAnswer(W.M, c.id, 'a', s, [], { busy: true }); W.step(c, 0.1); assert.equal(c.state, 'dormant', 'the client could not open the test: no penalty'); assert.equal(W.hurts.length, 0);
  const W2 = world(); W2.player('a', 12, 0); const d = W2.mk(CAP, 0, 0, capData()); d.setState('dormant'); W2.step(d, 0.2);
  d.hp -= 10; W2.step(d, 0.1); assert.equal(d.state, 'alarm', 'attacked: siren'); W2.step(d, TC.alarm + 0.1); assert.equal(W2.hurts.length, 0, 'nobody in range: no hits'); assert.ok(W2.noises.length >= 1);
  const W3 = world(); W3.player('a', 1.5, 0); const e = W3.mk(CAP, 0, 0, capData()); e.setState('dormant'); e.data.hp = e.hp; W3.step(e, 60, 0.1, () => {});
  assert.ok(['demand', 'reload', 'alarm', 'scan', 'dormant', 'off'].includes(e.state));
});

await ok('captcha: gate placement from the layout (init snaps it into a route doorway facing along the wall normal)', () => {
  const L = layout(), W = world(L); W.player('a', 50, 50);
  const nav = { findPath: () => [cpos(L, 2, 4), cpos(L, 7, 4)].map(([x, z]) => ({ x, z })) };
  W.g.world.facility = { layout: L, nav, mainDoor: null };
  const gen = { cx: 8, cz: 4 }; L.generator = gen; W.g.world.facility.mainDoor = { pos: { x: cpos(L, 2, 4)[0] - 30, z: cpos(L, 2, 4)[1] } };
  const c = W.mk(CAP, 77, 77); W.step(c, 0.1);
  const ctr = [C.doorCenter(L, L.edgeInfo.get(L.keys.west)), C.doorCenter(L, L.edgeInfo.get(L.keys.east))];
  assert.ok(ctr.some((p) => Math.abs(p.x - c.data.home.x) < 1e-6 && Math.abs(p.z - c.data.home.z) < 1e-6), 'snapped into a doorway of the route: ' + JSON.stringify(c.data.home));
  assert.deepEqual(c.data.n, { x: 1, z: 0 }); assert.equal(c.state, 'dormant'); assert.equal(c.pos.y, 0);
});

await ok('shadowban: the ban lands on the most isolated player after a 1.2 s mark; it hunts ONLY them; the hit needs a 1 s wind-up; only the banned one is ever hit', () => {
  ST.ban = null; const W = world(); const a = W.player('a', 8, 0), b = W.player('b', 10, 2), lone = W.player('z', 0, 18);
  const c = W.mk(SB, 0, 0); W.step(c, 0.2); assert.equal(c.state, 'lurk'); c.data.rest = 0;
  W.step(c, 0.2); assert.equal(c.state, 'mark'); assert.equal(c.data.tid, 'z', 'the lone wolf is marked'); assert.equal(ST.ban, null, 'no ban during the telegraph');
  W.step(c, TB.mark - 0.2); assert.equal(ST.ban, null); W.step(c, 0.3);
  assert.ok(ST.ban && ST.ban.id === 'z' && ST.ban.left === TB.dur && ST.ban.cid === c.id); assert.equal(c.state, 'stalk');
  const sb = W.sent.find(([t, d]) => t === 'c11fx' && d.k === 'sb'); assert.ok(sb && sb[1].id === 'z' && sb[1].left === TB.dur);
  // it hunts only the banned one, even with others closer
  a.pos.set(c.pos.x + 1, 0, c.pos.z);
  const d0 = c.pos.distanceTo(lone.pos); W.step(c, 1, 0.05, () => { ST.ban.left = 25; ST.ban.touch = 0; }); assert.ok(c.pos.distanceTo(lone.pos) < d0 - 2, 'walks towards the banned player');
  lone.pos.copy(c.pos).add(new THREE.Vector3(1.2, 0, 0)); let tw = -1;
  W.step(c, 3, 0.05, (t) => { ST.ban.left = 25; ST.ban.touch = 0; if (c.state === 'windup' && tw < 0) tw = t; });
  assert.ok(tw >= 0, 'wind-up happened'); assert.equal(W.attacks.length >= 1, true); assert.ok(W.attacks.every((x) => x.p === 'z' && x.dmg === CREATURES[SB].dmg), 'only the banned player is hit');
  assert.ok(TB.windup >= 0.8);
  const W2 = world(); W2.player('z', 1.2, 0); const e = W2.mk(SB, 0, 0, { init: 1, tid: 'z', rest: 5 }); ST.ban = C.newBan('z', e.id); e.setState('stalk');
  const keep = () => { ST.ban.left = 25; ST.ban.touch = 0; };
  W2.step(e, 0.1, 0.05, keep); assert.equal(e.state, 'windup'); assert.equal(W2.attacks.length, 0);
  W2.step(e, 0.85, 0.05, keep); assert.equal(W2.attacks.length, 0, 'not before 1 s of wind-up');
  W2.step(e, 0.2, 0.05, keep); assert.equal(W2.attacks.length, 1);
  ST.ban = null;
});

await ok('shadowban: a teammate touching the banned player lifts it (host clock), expiry, dead creature / dead player end it; clean state + broadcasts; solo is shorter', () => {
  ST.ban = null; const W = world(); const z = W.player('z', 10, 10), a = W.player('a', 20, 10); const c = W.mk(SB, 0, 0, { init: 1, tid: 'z' }); c.setState('stalk'); ST.ban = C.newBan('z', c.id);
  AI.banTick(0.5, W.g); assert.ok(ST.ban, 'no touch: still banned'); assert.ok(W.sent.some(([t, d]) => t === 'c11fx' && d.k === 'sb' && d.id === 'z'), 'heartbeat for late joiners');
  a.pos.set(10.8, 0, 10); AI.banTick(0.2, W.g); assert.ok(ST.ban, 'a brush is not enough'); AI.banTick(0.25, W.g);
  assert.equal(ST.ban, null); assert.deepEqual(W.sent.at(-1), ['c11fx', { k: 'sb', id: null, why: 'lift', was: 'z' }]); assert.equal(c.state, 'off', 'the creature goes limp'); assert.equal(ST.ended.why, 'lift');
  W.step(c, TB.off + 0.1); assert.equal(c.state, 'lurk'); assert.ok(c.data.rest >= TB.rest[0] - 1 && c.data.rest <= TB.rest[1], 'rests before the next ban');
  // expiry
  const W2 = world(); W2.player('z', 10, 10); W2.player('a', 30, 10); const d = W2.mk(SB, 0, 0, { init: 1, tid: 'z' }); d.setState('stalk'); ST.ban = C.newBan('z', d.id);
  for (let i = 0; i < 24; i++) AI.banTick(1, W2.g); assert.ok(ST.ban); AI.banTick(1.1, W2.g); assert.equal(ST.ban, null); assert.equal(W2.sent.at(-1)[1].why, 'end');
  // the creature dies -> the ban is void
  const W3 = world(); W3.player('z', 10, 10); const e = W3.mk(SB, 0, 0, { init: 1, tid: 'z' }); ST.ban = C.newBan('z', e.id); e.dead = true; AI.banTick(0.1, W3.g); assert.equal(ST.ban, null); assert.equal(W3.sent.at(-1)[1].why, 'dead');
  // the banned player dies / boards the ship
  const W4 = world(); const z4 = W4.player('z', 10, 10); const f = W4.mk(SB, 0, 0, { init: 1, tid: 'z' }); ST.ban = C.newBan('z', f.id); z4.inShip = true; AI.banTick(0.1, W4.g); assert.equal(ST.ban, null);
  // solo ban is shorter; a second ban cannot start while one runs
  const W5 = world(); W5.player('z', 6, 0); const s = W5.mk(SB, 0, 0, { init: 1, rest: 0 }); ST.ban = null; W5.step(s, 2); assert.ok(ST.ban && ST.ban.left <= TB.soloDur && ST.ban.left > TB.soloDur - 1.5);
  ST.ban = null;
});

await ok('recommender: a learned route + moving towards the doorway -> RECOMMENDED FOR YOU frame 2.0 s -> solid ambush on the far side -> 0.9 s wind-up -> hit', () => {
  const L = layout(), W = world(L); ST.trk = new Habits(L); ST.ban = null;
  for (let i = 0; i < 3; i++) { walk(ST.trk, 'a', L, WEST_STRAIGHT); walk(ST.trk, 'a', L, [[6, 4], [5, 4], [4, 4], [3, 4], [2, 4]]); }
  walk(ST.trk, 'a', L, [[2, 4], [3, 4], [4, 4]]);
  const [px, pz] = cpos(L, 4, 4), p = W.player('a', px, pz); W.M.pvel.set('a', { sp: 4 });
  const c = W.mk(REC, 50, 50); W.step(c, 0.3); assert.equal(c.state, 'hidden'); assert.ok(c.pos.y < -50, 'parked under the map'); c.data.rest = 0;
  const still = W.player('s', px, pz); W.M.pvel.set('s', { sp: 0 }); W.players.pop();
  W.M.pvel.set('a', { sp: 0.1 }); W.step(c, 1); assert.equal(c.state, 'hidden', 'a player who is not moving is not ambushed'); W.M.pvel.set('a', { sp: 4 });
  W.step(c, 0.5); assert.equal(c.state, 'foretell'); const door = C.doorCenter(L, L.edgeInfo.get(L.keys.east)); assert.ok(Math.abs(c.pos.x - door.x) < 1e-6 && Math.abs(c.pos.z - door.z) < 1e-6 && c.pos.y === 0, 'the glow sits on the predicted doorway');
  W.step(c, TR_.glow - 0.3); assert.equal(c.state, 'foretell', 'the frame glows for 2 s'); assert.ok(c.extra > 0.8);
  W.step(c, 0.4); assert.equal(c.state, 'ambush'); assert.ok(Math.abs(c.pos.x - (door.x + TR_.far)) < 1e-6, 'waits on the FAR side of the door: ' + c.pos.x);
  // the player walks through the predicted doorway
  let t0 = -1, hitAt = -1;
  W.step(c, 1.5, 0.05, (t) => {
    const [x, z] = cpos(L, 5, 4); if (t > 0.3) { const q = cpos(L, 6, 4); p.pos.set(q[0] - 1, 0, q[1]); ST.trk.observe('a', x, z, false, 1); ST.trk.observe('a', q[0], q[1], false, 2); }
    if (c.state === 'windup' && t0 < 0) t0 = t; if (W.attacks.length && hitAt < 0) hitAt = t;
  });
  assert.ok(t0 >= 0, 'wound up'); assert.ok(hitAt - t0 >= TR_.windup - 0.06, 'hit >= 0.9 s after the wind-up started: ' + (hitAt - t0));
  assert.equal(W.attacks.length, 1); assert.equal(W.attacks[0].dmg, CREATURES[REC].dmg); assert.equal(W.attacks[0].p, 'a');
  W.step(c, TR_.attackT + TR_.dismiss + 0.3); assert.equal(c.state, 'hidden'); assert.ok(c.pos.y < -50); assert.ok(c.data.rest >= TR_.rest[0] - 1, 'rests before the next ambush');
  assert.ok(still);
  ST.trk = null;
});

await ok('recommender: breaking the pattern makes it miss (other door, backtrack, crouch = incognito, standing still), stepping out of the wind-up whiffs, the miss un-learns', () => {
  const setup = () => {
    const L = layout(), W = world(L); ST.trk = new Habits(L);
    for (let i = 0; i < 3; i++) { walk(ST.trk, 'a', L, WEST_STRAIGHT); walk(ST.trk, 'a', L, [[6, 4], [5, 4], [4, 4], [3, 4], [2, 4]]); }
    walk(ST.trk, 'a', L, [[2, 4], [3, 4], [4, 4]]);
    const [px, pz] = cpos(L, 4, 4), p = W.player('a', px, pz); W.M.pvel.set('a', { sp: 4 });
    const c = W.mk(REC, 50, 50); W.step(c, 0.1); c.data.rest = 0; W.step(c, 0.5); assert.equal(c.state, 'foretell');
    return { L, W, p, c };
  };
  { // a different door
    const { L, W, c } = setup(); const q = cpos(L, 4, 3); ST.trk.observe('a', q[0], q[1], false, 5); W.step(c, 0.2);
    assert.equal(c.state, 'dismiss'); W.step(c, 3); assert.equal(W.attacks.length, 0); assert.equal(ST.trk.stat.miss, 1, 'the miss was counted'); assert.equal(ST.trk.stat.hit, 0);
  }
  { // backtrack out of the west door
    const { L, W, c } = setup(); const q = cpos(L, 3, 4); ST.trk.observe('a', q[0], q[1], false, 5); W.step(c, 0.2); assert.equal(c.state, 'dismiss'); W.step(c, 3); assert.equal(W.attacks.length, 0);
  }
  { // crouch-walking: incognito, in the foretell and in the ambush
    const { W, p, c } = setup(); p.crouch = true; W.step(c, 0.2); assert.equal(c.state, 'dismiss'); assert.equal(c.data.why, 'incognito'); W.step(c, 3); assert.equal(W.attacks.length, 0);
    const s2 = setup(); s2.W.step(s2.c, 2.2); assert.equal(s2.c.state, 'ambush'); s2.p.crouch = true; s2.W.step(s2.c, 0.2); assert.equal(s2.c.state, 'dismiss'); assert.equal(s2.c.data.why, 'incognito');
  }
  { // it waits 7 s at most, then gives up
    const { W, c } = setup(); W.step(c, 2.2); assert.equal(c.state, 'ambush'); W.step(c, TR_.wait - 0.8); assert.equal(c.state, 'ambush'); W.step(c, 1.0); assert.equal(c.state, 'dismiss'); assert.equal(W.attacks.length, 0);
  }
  { // wind-up started but the player steps away: whiff
    const { L, W, p, c } = setup(); W.step(c, 2.2); assert.equal(c.state, 'ambush');
    const near = cpos(L, 5, 4); p.pos.set(c.pos.x - 1.5, 0, c.pos.z); W.step(c, 0.2); assert.equal(c.state, 'windup'); p.pos.set(c.pos.x - 8, 0, c.pos.z + 3); W.step(c, 1.2); assert.equal(W.attacks.length, 0, 'stepped out of the wind-up: whiff'); void near;
  }
  { // nothing learned = it never appears
    const L = layout(), W = world(L); ST.trk = new Habits(L); const [px, pz] = cpos(L, 4, 4); W.player('a', px, pz); W.M.pvel.set('a', { sp: 4 });
    walk(ST.trk, 'a', L, [[2, 4], [3, 4], [4, 4]]); const c = W.mk(REC, 0, 0); W.step(c, 0.1); c.data.rest = 0; W.step(c, 10); assert.equal(c.state, 'hidden');
  }
  ST.trk = null;
});

await ok('models build + animate through every state, no THREE lights, both faces of the captcha, disposal; registry', async () => {
  const M = await import('../../src/models/creatures11_models.js');
  const states = ['idle', 'dormant', 'scan', 'demand', 'off', 'alarm', 'reload', 'lurk', 'mark', 'stalk', 'windup', 'attack', 'hidden', 'foretell', 'ambush', 'dismiss', 'stunned', 'dead'];
  for (const [name, fn] of [['captcha', M.createCaptchaModel], ['shadowban', M.createShadowbanModel], ['recommender', M.createRecommenderModel]]) {
    const m = fn();
    m.root.traverse((o) => assert.ok(!o.isLight, name + ' has a light'));
    assert.ok(m.height > 0 && m.radius > 0);
    for (const st of states) for (const pr of [0, 0.5, 1]) { m.update(0.05, { state: st, speed: 2, t: 0.4, time: 5 + pr, progress: pr }); }
    m.setHitFlash(0.5); m.dispose();
  }
  const reg = new Map(); M.registerC11Models(reg); assert.equal(reg.size, 3); for (const id of C.ALL_IDS) assert.equal(typeof reg.get(id), 'function');
});

await ok('sound recipes: finite, non-empty, loops are whole seconds; captcha minigame icons cover every tile icon', async () => {
  const S = await import('../../src/game/creatures11_sfx.js');
  assert.equal(S.SOUND_IDS.length, 15);
  for (const id of S.SOUND_IDS) {
    const a = S.SOUNDS[id](8000); assert.ok(a instanceof Float32Array && a.length > 100, id);
    let peak = 0; for (const v of a) { assert.ok(Number.isFinite(v), id); peak = Math.max(peak, Math.abs(v)); } assert.ok(peak > 0.3 && peak <= 1, id + ' peak ' + peak);
  }
  for (const id of ['c11_cap_hum', 'c11_sb_hum']) assert.equal(S.SOUNDS[id](8000).length, 16000, id + ' loop length');
  const gens = new Map(); assert.equal(S.ensureC11Sounds({ mods: { soundGens: gens } }), false); assert.equal(gens.size, 15);
  const MG = await import('../../src/minigames/captcha.js');
  const all = [...C.CAP_ICONS.scrap, ...C.CAP_ICONS.lights, ...C.CAP_ICONS.decoy];
  for (const ic of all) assert.ok(MG.CAPTCHA_ICONS.includes(ic), 'icon ' + ic);
  assert.equal(typeof MG.createCaptcha, 'function');
});

await ok('installer: registers, wires sounds + net types, debug spawns (host), tracker feeds Habits, dispose; game.js placeholders are the two allowed lines only', async () => {
  const { installCreatures11 } = await import('../../src/game/creatures11.js');
  const spawned = [], handlers = new Map(), hs = new Map();
  const L = layout();
  const game = {
    isHost: true, selfId: 'a', time: 5, mods: { soundGens: new Map(), on(ev, fn) { handlers.set(ev, fn); return () => handlers.delete(ev); } }, audio: null, ui: { toast() {} }, remotes: new Map(),
    net: { on_() {}, request() {}, broadcast() {}, sendTo() {}, msgHandlers: new Map() }, later() {},
    player: { yaw: 0, pos: new THREE.Vector3(1, 0, 3), dead: false }, run: { phase: 'moon', quotaIndex: 3 }, world: { facility: { layout: L } },
    aiPlayers() { return [{ id: 'a', pos: new THREE.Vector3(...cpos(L, 3, 4).flatMap((v, i) => (i ? [0, v] : [v]))), zone: 'in', dead: false, inShip: false, crouch: false }]; },
    creatures: { host: hs, hostSpawn(t, p, o) { const c = { id: 'x' + spawned.length, type: t, data: {}, hp: 10, age: 0, state: 'idle', setState(s) { this.state = s; }, pos: p.clone() }; spawned.push([t, p.clone(), o]); hs.set(c.id, c); return c; } },
    onChat() {}, hasActiveWalkie() { return true; },
  };
  const api = installCreatures11(game);
  assert.ok(api && api.ids.captcha === CAP && api.debug);
  assert.equal(api.debug.spawn('captcha') !== false, true); assert.equal(spawned[0][0], CAP); assert.ok(Math.abs(spawned[0][1].z - (3 - 8)) < 1e-6, '8 m ahead');
  const cap = hs.get('x0'); assert.equal(cap.state, 'dormant'); assert.ok(cap.data.home && cap.data.n && cap.data.init === 1);
  assert.ok(api.debug.spawn('shadowban') && hs.get('x1').state === 'mark' && hs.get('x1').data.tid === 'a');
  assert.ok(api.debug.spawn('recommender') && hs.get('x2').state === 'foretell');
  assert.equal(api.debug.spawn('nope'), false);
  handlers.get('update')(0.25); assert.ok(ST.trk && ST.trk.L === L, 'the tracker follows the layout of the landing');
  handlers.get('phase')('ship'); assert.equal(ST.trk, null);
  assert.ok(handlers.has('registerHandlers') && handlers.has('netReady') && handlers.has('playerJoin'));
  assert.ok(HOST_ONLY.has('c11fx'), 'clients only take c11fx from the host');
  // the mute wraps: a banned crewmate's chat / walkie are dropped for everybody else and restored on dispose
  const got = []; game.onChat = (d, from) => got.push(from);
  api.dispose();
  const src = fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8');
  assert.ok(src.includes("import { installCreatures11 } from './creatures11.js';") && src.includes("this.useModule('creatures11', installCreatures11);"));
  assert.ok(!src.includes('[import:creatures11]') && !src.includes('[slot:creatures11]'));
});

await ok('shadowban mute (client): tag + avatar sprite hidden, voice zeroed and restored, chat / walkie / ping dropped for everyone but the banned one, all restored on dispose', async () => {
  const { installC11Fx } = await import('../../src/game/creatures11_fx.js');
  const remotes = new Map([['z', { tag: { visible: true }, avTag: { visible: true }, dead: false }], ['q', { tag: { visible: true }, dead: false, localVolume: 0.5 }]]);
  const seen = [], pingSeen = [], handlers = new Map(), pingFn = (d, from) => pingSeen.push(from);
  const g = { selfId: 'a', remotes, mods: { on() { return () => {}; } }, ui: { toast() {} }, net: { on_(t, fn) { handlers.set(t, fn); }, msgHandlers: new Map([['ping', pingFn]]), request() {} }, onChat(d, from) { seen.push(from); }, hasActiveWalkie: () => true, isHost: false };
  const fx = installC11Fx(g, []);
  const origChat = g.onChat;
  fx.setLocalBan('z', 25);
  fx.update(0.1);
  assert.equal(remotes.get('z').tag.visible, false); assert.equal(remotes.get('z').avTag.visible, false); assert.equal(remotes.get('z').localVolume, 0);
  assert.equal(remotes.get('q').tag.visible, true, 'others are untouched'); assert.equal(remotes.get('q').localVolume, 0.5);
  g.onChat({}, 'z'); g.onChat({}, 'q'); assert.deepEqual(seen, ['q'], 'banned chat vanishes');
  assert.equal(g.hasActiveWalkie('z'), false); assert.equal(g.hasActiveWalkie('q'), true);
  g.net.msgHandlers.get('ping')({}, 'z'); g.net.msgHandlers.get('ping')({}, 'q'); assert.deepEqual(pingSeen, ['q'], 'banned pings vanish');
  // the banned player sees themselves normally
  fx.setLocalBan('a', 25); fx.update(0.1); g.onChat({}, 'a'); assert.ok(seen.includes('a'));
  assert.equal(remotes.get('z').tag.visible, true, 'the ban moved on: z is back');
  fx.setLocalBan('z', 25); fx.update(0.1);
  // the host says it is over
  handlers.get('c11fx')({ k: 'sb', id: null, why: 'lift', was: 'z' }); fx.update(0.1);
  assert.equal(remotes.get('z').tag.visible, true); assert.ok(!('_c11vol' in remotes.get('z'))); assert.ok(!('localVolume' in remotes.get('z')), 'voice restored');
  g.onChat({}, 'z'); assert.ok(seen.includes('z'));
  fx.setLocalBan('z', 25); fx.update(0.1); fx.dispose();
  assert.equal(remotes.get('z').tag.visible, true); assert.equal(g.net.msgHandlers.get('ping'), pingFn, 'ping handler restored'); assert.equal(g.onChat === origChat || typeof g.onChat === 'function', true);
  g.onChat({}, 'z'); assert.equal(seen.filter((x) => x === 'z').length, 2);
});

console.log('creatures11.test: ' + n + ' checks passed');
process.exit(0);
