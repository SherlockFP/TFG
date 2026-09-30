// creatures10 (wave 10) rules + host logic test:  node tools/harness/creatures10.test.mjs
// Pure rules, registration (spawn gate / pools / i18n / codex rows), the three state machines against a fake manager, models + sound recipes, and the installer.
// No browser, no physics, no rendering.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const C = await import('../../src/game/creatures10_core.js');
const AI = await import('../../src/game/creatures10_ai.js');
const { CREATURES, EXTRA_SPAWNS, spawnTable, canSpawnMore } = await import('../../src/game/creatures.js');
const { IDENT } = await import('../../src/game/identify.js');
const { HEADLINE, HEAD_IDS } = await import('../../src/game/threatpool.js');
const { FIELD_NOTES } = await import('../../src/game/collection.js');
const { TR, RU, ROWS } = await import('../../src/game/creatures10_text.js');
const { RULES } = await import('../../src/game/balance_rules.js');
const THREE = await import('three');
const T = C.TUNE, { buffering: BUF, doom: DOOM, ratio: RATIO } = C.IDS;
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const seq = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

await ok('pure rules: buffer clock, dwell meter, tick ramp, ceiling height, ratio mode', () => {
  const r = seq(3);
  for (let i = 0; i < 200; i++) { const s = C.rollSpin(r); assert.ok(s >= T.buf.spinMin && s <= T.buf.spinMax); }
  assert.equal(C.bufferFill(2, 4), 0.5); assert.equal(C.bufferFill(-1, 4), 1);
  let m = 0; for (let i = 0; i < 100; i++) m = C.dwellStep(m, true, true, 0.05);   // 5 s still under it
  assert.equal(m, 1);
  let m2 = 0.9; for (let i = 0; i < 100; i++) m2 = C.dwellStep(m2, true, false, 0.05);
  assert.equal(m2, 0, 'moving drains it');
  assert.ok(C.dwellStep(0.5, false, true, 1) < 0.5, 'still but not under it does not fill');
  assert.ok(C.tickInterval(0) > C.tickInterval(0.5) && C.tickInterval(0.5) > C.tickInterval(1) && C.tickInterval(1) >= T.doom.tickFast - 1e-9);
  assert.ok(C.tickPitch(1) > C.tickPitch(0) && C.tickVolume(1) > C.tickVolume(0));
  const lay = { y: -300, ox: -40, oz: -40, w: 20, h: 20, heightOf: new Float32Array(400).fill(4.4) };
  lay.heightOf[5 * 20 + 5] = 8.5;
  assert.equal(C.ceilingY(lay, -40 + 4 * 5 + 1, -40 + 4 * 5 + 1), -300 + T.doom.maxCeil, 'tall hall is capped');
  assert.ok(Math.abs(C.ceilingY(lay, 0, 0) - (-300 + 4.4)) < 1e-4);
  assert.equal(C.ceilingY(null, 0, 0, 10), 10 + T.doom.defCeil);
  assert.equal(C.ratioMode(true, true, true), 'freeze'); assert.equal(C.ratioMode(true, false, true), 'freeze');
  assert.equal(C.ratioMode(false, true, true), 'rush'); assert.equal(C.ratioMode(false, false, true), 'creep');
  assert.equal(C.ratioMode(false, true, false), 'creep', 'an orphan never rushes');
  assert.notEqual(C.ratioSide(4), C.ratioSide(4 ^ 1));
});

await ok('registration: creatures, one rule in the first lore sentence, balance fit, telegraphs >= 0.8 s, codex + scanner rows', () => {
  AI.registerC10Content(); AI.registerC10Content();
  for (const id of C.ALL_IDS) {
    const d = CREATURES[id]; assert.ok(d && typeof d.behavior === 'function', id);
    assert.ok(d.dmg <= 45, 'hit fits the quota 0-1 cap: ' + d.dmg); assert.ok(d.maxAlive >= 1); assert.ok(d.hp > 0 && d.hp <= 300);
    assert.ok(/^[^.!?]{25,}[.!?]/.test(d.lore), 'first sentence is the rule caption');
    assert.ok(IDENT[id] && IDENT[id][2].length > 20 && FIELD_NOTES[id]);
    assert.ok(HEAD_IDS.has(id) && HEADLINE.some((h) => h.id === id && h.zone === 'in'));
  }
  assert.ok(T.buf.windup >= 0.8 && T.doom.windup >= 0.8 && T.ratio.windup >= 0.8 && T.buf.resume >= 0.8, 'telegraph >= 0.8 s');
  assert.ok(T.buf.windup + RULES.windup > T.buf.windup);
  assert.ok(T.buf.buffer >= 2.4, 'a real window to pass');
  assert.ok(T.buf.spinMax * 4.6 < 40, 'it cannot run away with the room');
});

await ok('spawn pools: not on tier 1 moons, not in the first quotas (generic gate), Ratio from quota 2, data-driven weights', () => {
  for (const id of C.ALL_IDS) { assert.ok(EXTRA_SPAWNS[id]); assert.equal(EXTRA_SPAWNS[id].zone, 'in'); assert.equal(EXTRA_SPAWNS[id].w[0], 0, 'tier 1 = 0'); assert.ok(EXTRA_SPAWNS[id].w[3] > 0); }
  const moon = (tier) => ({ id: 'x', tier, interior: 'factory', creatures: { scuttler: 10 }, outdoor: {} });
  assert.ok(!(BUF in spawnTable(moon(1), 'in')) && (BUF in spawnTable(moon(2), 'in')) && (DOOM in spawnTable(moon(3), 'in')) && (RATIO in spawnTable(moon(4), 'in')));
  const M = new Map();
  AI.setC10Game(null); assert.equal(canSpawnMore(BUF, M), false, 'no run: blocked');
  const g = { run: { quotaIndex: 0 } }; AI.setC10Game(g);
  for (const id of C.ALL_IDS) assert.equal(canSpawnMore(id, M), false, 'quota 0 blocked ' + id);
  for (let q = 1; q <= 4; q++) { g.run.quotaIndex = q; for (const id of C.ALL_IDS) assert.equal(canSpawnMore(id, M), q >= T.minQuota[id], `quota ${q} gate ${id}`); }   // wave 12: staggered gates (Buffering / Doomscroller 2, Ratio 3)
  assert.ok(T.minQuota[BUF] >= 2 && T.minQuota[RATIO] > T.minQuota[BUF], 'balance12: the chase rules wait, the Ratio last');
  M.set('a', { type: BUF, dead: false }); assert.equal(canSpawnMore(BUF, M), false, 'max 1 Buffering alive');
});

await ok('i18n: EN + TR + RU for every player-facing string (name, lore, death text, hint, field note)', () => {
  for (const id of C.ALL_IDS) for (const s of [CREATURES[id].$name, CREATURES[id].$lore, CREATURES[id].deathText, IDENT[id][2], FIELD_NOTES[id]]) {
    assert.ok(TR[s] && RU[s], 'missing ' + String(s).slice(0, 40)); assert.notEqual(TR[s], s); assert.notEqual(RU[s], s);
  }
  for (const [en, tr, ru] of ROWS) { assert.ok(en && tr && ru); assert.ok(/[а-яА-Я]/.test(ru), 'RU is Cyrillic: ' + en.slice(0, 30)); }
});

// ---------------------------------------------------------------------------------------------------- state machines (fake manager)
function world() {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const players = [], host = new Map(), sent = [], attacks = [], looked = new Set(), calls = { spawns: 0 };
  const g = { time: 100, net: { broadcast(t, d) { sent.push([t, d]); } }, world: {}, physics: { lineOfSight: () => true } };
  const M = {
    game: g, host, pvel: new Map(), playersFor: () => players.filter((p) => !p.dead),
    nearest(c, list, maxD = 1e9) { let best = null, bd = maxD; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; },
    canSee: () => true, hear: () => null, isLookedAt: (c) => looked.has(c.id), nav: () => null,
    attack(c, p, dmg, cause) { attacks.push({ type: c.type, id: c.id, p: p.id, dmg, cause, t: g.time }); },
    goTo(c, x, z) { c.dest = { x, z }; }, goToLazy() {}, wander(c) { this.goTo(c, c.pos.x + 5, c.pos.z); }, follow() { return false; },
    moveToward(c, t, dt, sp) { const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz) || 1; c.pos.x += dx / d * sp * dt; c.pos.z += dz / d * sp * dt; },
    hostSpawn(type, pos, opts = {}) { calls.spawns++; const c = mk(type, pos.x, pos.z, opts.data, opts.seed); c.level = opts.level || 1; host.set(c.id, c); return c; },
  };
  let idn = 0;
  const mk = (type, x = 0, z = 0, data = {}, seed = 4) => {
    const def = { ...CREATURES[type] }, id = 'c' + (idn++);
    const c = { type, def, id, pos: V(x, 0, z), yaw: 0, state: 'idle', t: 0, age: 5, cooldown: 0, stunT: 0, data: { ...data }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, target: null, seed, level: 1, zone: 'in', extra: 0, dead: false,
      setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } } };
    host.set(id, c); return c;
  };
  const player = (id, x, z, o = {}) => { const p = { id, pos: V(x, 0, z), eye: V(x, 1.6, z), look: V(0, 0, -1), dead: false, inShip: false, zone: 'in', ...o }; players.push(p); M.pvel.set(id, { sp: 0 }); return p; };
  const step = (cs, s, dt = 0.05, each = null) => { for (let i = 0; i < Math.round(s / dt); i++) { g.time += dt; for (const c of [].concat(cs)) { if (c.dead) continue; c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; CREATURES[c.type].behavior(c, dt, M); } each?.(i * dt); } };
  return { g, M, mk, player, step, attacks, sent, looked, host, calls };
}
AI.setC10Game({ run: { quotaIndex: 3 } });

await ok('buffering: moves only while the ring spins, buffers every 4-6.5 s (frozen, harmless), 0.8 s resume cue, then moves again', () => {
  const W = world(); const pa = W.player('a', 24, 0); const c = W.mk(BUF, 0, 0);
  const log = []; let last = c.pos.x;
  W.step(c, 40, 0.05, () => { pa.pos.x = c.pos.x + 24; log.push({ st: c.state, moved: Math.abs(c.pos.x - last) > 1e-6 || false }); last = c.pos.x; });
  const sts = new Set(log.map((l) => l.st)); for (const s of ['spin', 'buffer', 'resume']) assert.ok(sts.has(s), 'has ' + s);
  for (const l of log) if (l.st === 'buffer' || l.st === 'resume') assert.equal(l.moved, false, 'frozen while ' + l.st);
  assert.ok(log.filter((l) => l.st === 'spin').every((l) => l.moved || true));
  assert.equal(W.attacks.length, 0, 'never touches from 24 m');
  // every buffer lasts buffer - resume (frozen) + resume, and gaps between buffers are the spin time
  const runs = []; let cur = null; for (const l of log) { const f = l.st === 'buffer' || l.st === 'resume'; if (f) { cur ||= { n: 0 }; cur.n++; } else if (cur) { runs.push(cur.n * 0.05); cur = null; } }
  assert.ok(runs.length >= 3 && runs.every((s) => s > T.buf.buffer - 0.2 && s < T.buf.buffer + 0.3), 'window ' + runs.join(','));
  assert.ok(c.pos.x > 40, 'it keeps coming while spinning: ' + c.pos.x);
});

await ok('buffering: 0.9 s wind-up before the touch, big hit (<= cap), no hit if you step away, no buffer during the wind-up', () => {
  const W = world(); const p = W.player('a', 1.3, 0); const c = W.mk(BUF, 0, 0); c.data.init = 1; c.data.tid = 'a'; c.data.left = c.data.dur = 6; c.setState('spin');
  W.step(c, 0.5); assert.equal(c.state, 'windup'); assert.equal(W.attacks.length, 0);
  W.step(c, 0.3); assert.equal(W.attacks.length, 0, 'still telegraphing at ~0.8 s'); assert.equal(c.state, 'windup');
  W.step(c, 0.3); assert.equal(W.attacks.length, 1); assert.equal(W.attacks[0].dmg, CREATURES[BUF].dmg); assert.ok(W.attacks[0].dmg >= 35, 'heavy');
  assert.equal(c.state, 'attack');
  const W2 = world(); const p2 = W2.player('a', 1.3, 0); const d = W2.mk(BUF, 0, 0); d.data.init = 1; d.data.tid = 'a'; d.data.left = d.data.dur = 6; d.setState('spin');
  W2.step(d, 0.6); assert.equal(d.state, 'windup'); p2.pos.set(6, 0, 0); W2.step(d, 0.6); assert.equal(W2.attacks.length, 0, 'stepped away: whiff');
  const W3 = world(); W3.player('a', 1.3, 0); const e = W3.mk(BUF, 0, 0); e.data.init = 1; e.data.tid = 'a'; e.data.left = 0.1; e.data.dur = 6; e.setState('spin');
  W3.step(e, 0.05); e.setState('windup'); e.data.left = 0.01; W3.step(e, 0.4); assert.equal(e.state, 'windup', 'no buffer in the middle of a wind-up');
});

await ok('doomscroller: scroll-tick ramps while you stand still under it, notification + 1 s hover, drop hits only who stayed, then sprawl -> climb -> roam', () => {
  const W = world(); const p = W.player('a', 0.5, 0); const c = W.mk(DOOM, 0, 0);
  const ticks = []; let sawWind = false, windFrom = 0, hit = null;
  W.step(c, 6, 0.05, (t) => {
    for (const [ty, d] of W.sent.splice(0)) if (ty === 'cev' && d.e === 'snd' && d.s.includes('c10_scroll_tick')) ticks.push({ t, pt: d.pt, v: d.v });
    if (c.state === 'windup' && !sawWind) { sawWind = true; windFrom = t; }
    if (W.attacks.length && hit === null) hit = t;
  });
  assert.ok(ticks.length > 8, 'ticks ' + ticks.length);
  assert.ok(ticks[ticks.length - 1].pt > ticks[0].pt && ticks[ticks.length - 1].v > ticks[0].v, 'pitch + volume ramp');
  const gaps = ticks.slice(1).map((k, i) => k.t - ticks[i].t); assert.ok(gaps[gaps.length - 1] < gaps[0], 'rate ramps');
  assert.ok(sawWind && windFrom > 2.5, 'wind-up only after several still seconds: ' + windFrom);
  assert.ok(hit !== null && hit - windFrom >= T.doom.windup, 'hit lands >= 1 s after the ping: ' + (hit - windFrom));
  assert.equal(W.attacks[0].dmg, CREATURES[DOOM].dmg); assert.equal(W.attacks.length, 1);
  assert.ok(['sprawl', 'climb'].includes(c.state)); assert.ok(c.pos.y < 0.2 || c.state === 'climb');
  W.step(c, T.doom.sprawl + T.doom.climb + 0.5); assert.ok(['roam', 'scroll'].includes(c.state), 'back to hunting (you are still standing there): ' + c.state); assert.ok(Math.abs(c.pos.y - (T.doom.defCeil - T.doom.hang)) < 0.05, 'back on the ceiling');
  // step out after the ping: it lands on nothing
  const W2 = world(); const q = W2.player('a', 0.3, 0); const d = W2.mk(DOOM, 0, 0);
  W2.step(d, 8, 0.05, () => { if (d.state === 'windup') q.pos.set(6, 0, 0); });
  assert.equal(W2.attacks.length, 0, 'dodged'); assert.ok(['sprawl', 'climb', 'roam'].includes(d.state));
  // a player who keeps walking under it never triggers it
  const W3 = world(); const w3 = W3.player('a', 0, 0); const e = W3.mk(DOOM, 0, 0);
  W3.step(e, 30, 0.05, () => { W3.M.pvel.get('a').sp = 3; });
  assert.equal(W3.attacks.length, 0); assert.ok(!['windup', 'drop'].includes(e.state));
  // it never leaves the ceiling while roaming (hitbox / model contract: pos.y = ceiling - hang)
  assert.ok(Math.abs(e.pos.y - (T.doom.defCeil - T.doom.hang)) < 0.05);
});

await ok('ratio: a twin is spawned; watched = frozen, the OTHER rushes; both watched = both frozen; nobody watched = both creep; 0.9 s wind-up', () => {
  const W = world(); W.player('a', 0, 20); const A = W.mk(RATIO, 0, 0, {}, 8);
  W.step(A, 2); assert.equal(W.calls.spawns, 1, 'one twin spawned'); const B = W.host.get(A.data.twin); assert.ok(B && B.data.twin === A.id && B.data.second);
  assert.notEqual(C.ratioSide(A.seed), C.ratioSide(B.seed), 'mirrored');
  const pos = () => [A.pos.clone(), B.pos.clone()];
  // nobody watches: both creep (slow)
  let p0 = pos(); W.step([A, B], 2); assert.equal(A.state, 'creep'); assert.equal(B.state, 'creep');
  const creepA = A.pos.distanceTo(p0[0]) / 2; assert.ok(creepA > 0.5 && creepA < CREATURES[RATIO].run * 0.6, 'creep speed ' + creepA);
  // watch A only: A frozen, B rushes
  W.looked.add(A.id); W.step([A, B], 0.5); p0 = pos(); W.step([A, B], 1);
  assert.equal(A.state, 'freeze'); assert.equal(B.state, 'rush');
  assert.ok(A.pos.distanceTo(p0[0]) < 1e-6, 'watched twin does not move'); assert.ok(B.pos.distanceTo(p0[1]) > 3.5, 'the other one advances fast');
  // swap
  W.looked.clear(); W.looked.add(B.id); W.step([A, B], 0.6); assert.equal(B.state, 'freeze'); assert.equal(A.state, 'rush');
  // both watched: both frozen
  W.looked.add(A.id); W.step([A, B], 0.5); p0 = pos(); W.step([A, B], 1.5);
  assert.equal(A.state, 'freeze'); assert.equal(B.state, 'freeze'); assert.ok(A.pos.distanceTo(p0[0]) < 1e-6 && B.pos.distanceTo(p0[1]) < 1e-6);
  assert.equal(W.attacks.length, 0);
  // host migration: two lone bodies pair up instead of spawning a third
  const W4 = world(); W4.player('a', 0, 20); const X = W4.mk(RATIO, 0, 0), Y = W4.mk(RATIO, 4, 0); W4.step([X, Y], 1);
  assert.equal(W4.calls.spawns, 0); assert.equal(X.data.twin, Y.id); assert.equal(Y.data.twin, X.id);
});

await ok('ratio: 0.9 s wind-up counts only while unwatched, hit is the twin dmg, an orphan never rushes, far from everybody = statue', () => {
  const W = world(); const p = W.player('a', 1.2, 0); const A = W.mk(RATIO, 0, 0, { init: 1, second: 1, w: 0 }); const B = W.mk(RATIO, 10, 10, { init: 1, second: 1, w: 0 }); A.data.twin = B.id; B.data.twin = A.id;
  W.step(A, 0.3); assert.equal(A.state, 'windup'); W.step(A, 0.4); assert.equal(W.attacks.length, 0);
  W.looked.add(A.id); W.step(A, 0.3); assert.equal(A.state, 'freeze', 'looking cancels the wind-up'); W.looked.clear(); W.step(A, 0.3); assert.equal(A.state, 'windup');
  W.step(A, 0.6); assert.equal(W.attacks.length, 0, 'wind-up restarted from zero'); W.step(A, 0.5); assert.equal(W.attacks.length, 1); assert.equal(W.attacks[0].dmg, CREATURES[RATIO].dmg); assert.equal(A.state, 'attack');
  const W2 = world(); W2.player('a', 0, 20); const O = W2.mk(RATIO, 0, 0, { init: 1, second: 1, w: 0 }); const dead = W2.mk(RATIO, 5, 5, { init: 1, second: 1 }); dead.dead = true; O.data.twin = dead.id;
  W2.looked.add(dead.id); W2.step(O, 1); assert.equal(O.state, 'creep', 'orphan: creep even when the "twin" is watched');
  const W3 = world(); W3.player('a', 0, 90); const S = W3.mk(RATIO, 0, 0, { init: 1, second: 1, w: 0 }); W3.step(S, 1); assert.equal(S.state, 'statue');
});

await ok('models build + animate through every state, no THREE lights, mirrored twin, disposal', async () => {
  const M = await import('../../src/models/creatures10_models.js');
  const states = ['idle', 'walk', 'spin', 'buffer', 'resume', 'windup', 'attack', 'roam', 'scroll', 'drop', 'sprawl', 'climb', 'freeze', 'creep', 'rush', 'statue', 'stunned', 'dead'];
  for (const [name, fn] of [['buffering', M.createBufferingModel], ['doomscroller', M.createDoomscrollerModel], ['ratio', M.createRatioModel]]) {
    const m = fn({ seed: 5 });
    m.root.traverse((o) => assert.ok(!o.isLight, name + ' has a light'));
    assert.ok(m.height > 0 && m.radius > 0);
    for (const st of states) for (const pr of [0, 0.5, 1]) { m.root.position.x += 0.1; m.update(0.05, { state: st, speed: 2, t: 0.4, time: 5 + pr, progress: pr }); }
    m.setHitFlash(0.5); m.dispose();
  }
  assert.equal(M.createRatioModel({ seed: 2 }).root.children[0].scale.x, 1); assert.equal(M.createRatioModel({ seed: 3 }).root.children[0].scale.x, -1);
  const reg = new Map(); M.registerC10Models(reg); assert.equal(reg.size, 3); for (const id of C.ALL_IDS) assert.equal(typeof reg.get(id), 'function');
});

await ok('sound recipes: finite, non-empty, loops are whole seconds', async () => {
  const S = await import('../../src/game/creatures10_sfx.js');
  assert.equal(S.SOUND_IDS.length, 11);
  for (const id of S.SOUND_IDS) {
    const a = S.SOUNDS[id](8000); assert.ok(a instanceof Float32Array && a.length > 100, id);
    let peak = 0; for (const v of a) { assert.ok(Number.isFinite(v), id); peak = Math.max(peak, Math.abs(v)); } assert.ok(peak > 0.3 && peak <= 1, id + ' peak ' + peak);
  }
  for (const id of ['c10_buf_spin', 'c10_scroll_crawl', 'c10_ratio_creak']) assert.equal(S.SOUNDS[id](8000).length, 8000, id + ' loop length');
  const gens = new Map(); assert.equal(S.ensureC10Sounds({ mods: { soundGens: gens } }), false); assert.equal(gens.size, 11);
});

await ok('installer: registers, wires the sound pump, debugSpawn (host), dispose; game.js placeholders are the two allowed lines only', async () => {
  const { installCreatures10 } = await import('../../src/game/creatures10.js');
  const spawned = [];
  const game = { isHost: true, mods: { soundGens: new Map() }, audio: null, player: { yaw: 0, pos: new THREE.Vector3(1, 2, 3) }, creatures: { host: new Map(), hostSpawn(t, p, o) { spawned.push([t, p.clone(), o]); return { id: 'x' }; } } };
  const api = installCreatures10(game);
  assert.ok(api && api.ids.buffering === BUF);
  assert.equal(api.debugSpawn('ratio'), true); assert.equal(spawned[0][0], RATIO); assert.ok(Math.abs(spawned[0][1].z - (3 - 8)) < 1e-6, '8 m ahead');
  assert.equal(api.debugSpawn('nope'), false);
  api.dispose();
  const src = fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8');
  assert.ok(src.includes("import { installCreatures10 } from './creatures10.js';") && src.includes("this.useModule('creatures10', installCreatures10);"));
  assert.ok(!src.includes('[import:creatures10]') && !src.includes('[slot:creatures10]'));
});

console.log('creatures10.test: ' + n + ' checks passed');
process.exit(0);
