// creatures12 (wave 12) rules + host logic test:  node tools/harness/creatures12.test.mjs
// Pure rules (404 look / glitch / static, cookie back spot + host pick, echo tape + lure spot, lag history / rubber-band clock / delayed input), registration (spawn gate / pools / i18n / codex rows),
// the four state machines against a fake manager, models + sound recipes, the client fx (lag input wrap + rubber-band with a fake game) and the installer. No browser, no physics, no rendering.
import { register } from 'node:module';
register('data:text/javascript,export async function load(u,c,n){if(u.endsWith(".css"))return{format:"module",source:"export default {}",shortCircuit:true};return n(u,c);}');
import assert from 'node:assert/strict';
import fs from 'node:fs';

const C = await import('../../src/game/creatures12_core.js');
const AI = await import('../../src/game/creatures12_ai.js');
const { CREATURES, EXTRA_SPAWNS, spawnTable, canSpawnMore } = await import('../../src/game/creatures.js');
const { IDENT } = await import('../../src/game/identify.js');
const { HEADLINE, HEAD_IDS } = await import('../../src/game/threatpool.js');
const { FIELD_NOTES } = await import('../../src/game/collection.js');
const { TR, RU, ROWS } = await import('../../src/game/creatures12_text.js');
const { HOST_ONLY } = await import('../../src/net/session.js');
const THREE = await import('three');
const T = C.TUNE, TN = T.nf, TC = T.ck, TE = T.echo, TL = T.lag, { nf: NF, cookie: CK, echo: EC, lag: LG } = C.IDS;
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };

await ok('pure rules: 404 look / glitch edge / static, cookie back spot + host pick + ribbon, lure spot + big room', () => {
  assert.equal(C.nfLook({}), 0); assert.equal(C.nfLook({ glitch: 0.1 }), 1); assert.equal(C.nfLook({ scan: 1 }), 2); assert.equal(C.nfLook({ drone: true, glitch: 1 }), 2); assert.equal(C.nfLook({ dead: true }), 2);
  let s = { lit: false, rearm: 0, glitch: 0 };
  s = C.glitchStep(s, true, 0.05); assert.equal(s.glitch, TN.glitchT, 'the beam crossing starts a 0.3 s glitch');
  s = C.glitchStep(s, true, 0.1); assert.ok(s.glitch < TN.glitchT && s.glitch > 0.15, 'holding the beam does not re-trigger');
  for (let i = 0; i < 20; i++) s = C.glitchStep(s, true, 0.05); assert.equal(s.glitch, 0, 'a steady beam only glitches once');
  s = C.glitchStep(s, false, 0.05); for (let i = 0; i < 15; i++) s = C.glitchStep(s, false, 0.05);
  s = C.glitchStep(s, true, 0.05); assert.equal(s.glitch, TN.glitchT, 'sweeping back across it glitches again');
  assert.equal(C.staticLevel(50, 0), 0); assert.ok(C.staticLevel(3, 0) > C.staticLevel(9, 0)); assert.ok(C.staticLevel(2, 1) >= 0.9 && C.staticLevel(2, 1) <= 0.95); assert.ok(C.staticLevel(6, 0.5) > C.staticLevel(6, 0));
  const b = C.backSpot({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }); assert.ok(b.z > 0 && b.y > 1, 'behind a player facing -z, at shoulder height');
  const pl = [{ id: 'a', pos: { x: 3, z: 0 } }, { id: 'b', pos: { x: 8, z: 0 } }];
  assert.equal(C.pickHost(pl, { x: 0, z: 0 }, new Set()).id, 'a'); assert.equal(C.pickHost(pl, { x: 0, z: 0 }, new Set(['a'])).id, 'b', 'skips a player who already carries one');
  assert.equal(C.pickHost(pl, { x: 0, z: 0 }, new Set(['a', 'b'])), null); assert.equal(C.ribbonOn(5.9), false); assert.equal(C.ribbonOn(6), true); assert.equal(C.pullDone(1.1), false); assert.equal(C.pullDone(1.2), true);
  const cands = [{ x: 3, z: 0 }, { x: 30, z: 0 }, { x: 0, z: 40 }, { x: 60, z: 0 }];
  assert.equal(C.pickLureSpot(cands, { x: 0, z: 0 }, [{ pos: { x: 30, z: 2 } }], 0).x, 0, 'far from the chamber AND from every player when possible');
  assert.ok(C.pickLureSpot(cands, { x: 0, z: 0 }, [{ pos: { x: 30, z: 2 } }, { pos: { x: 0, z: 41 } }, { pos: { x: 60, z: 1 } }], 0.5).x !== 3, 'else at least far from the chamber');
  assert.equal(C.pickLureSpot([], { x: 0, z: 0 }, [], 0.3), null);
  const rooms = [{ id: 0, type: 'entrance', w: 9, h: 9 }, { id: 1, type: 'hall', w: 4, h: 4 }, { id: 2, type: 'hall', w: 5, h: 4 }, { id: 3, type: 'vault', w: 8, h: 8 }];
  assert.equal(C.bigRoom(rooms).id, 2, 'largest non-entrance non-vault room'); assert.equal(C.bigRoom([]), null);
});

await ok('pure rules: tape (rate limits, thresholds, plan <= 5.5 s), history / rubber-band clock / delayed input / lag machine', () => {
  const tp = new C.Tape();
  assert.equal(tp.add('step', 0.2), false, 'too quiet'); assert.equal(tp.add('voice', 0.1), false);
  assert.equal(tp.add('step', 0.6), true); assert.equal(tp.add('step', 0.6), false, 'rate-limited'); tp.tick(0.6); assert.equal(tp.add('step', 0.6), true);
  for (let i = 0; i < 4; i++) { tp.tick(0.2); tp.add('drop', 0.5); }
  assert.equal(tp.ready, true); assert.ok(tp.fill === 1);
  for (let i = 0; i < 30; i++) { tp.tick(1); tp.add('bang', 1); } assert.ok(tp.ev.length <= TE.max, 'tape is bounded');
  const plan = tp.plan(); assert.ok(plan.length === tp.ev.length && plan[0].at === TE.lead && plan[plan.length - 1].at <= TE.lead + TE.replay + 1e-9, 'replay squeezed into the window');
  assert.ok(plan.every((e, i) => !i || e.at >= plan[i - 1].at)); tp.clear(); assert.equal(tp.ev.length, 0); assert.deepEqual(tp.plan(), []);
  assert.equal(C.kindOfNoise(0.3), 'drop'); assert.equal(C.kindOfNoise(1), 'bang');
  const h = new C.PosHistory(3);
  for (let i = 0; i <= 30; i++) h.push(i * 0.1, i, 0, 0);
  assert.ok(Math.abs(h.at(2.2 - 0.8).x - 14) < 1e-6, 'where you were 0.8 s ago: ' + JSON.stringify(h.at(1.4))); assert.equal(h.at(-5).x, 0 + h.a[0][1]);
  assert.ok(h.a.length <= 33 && h.a[0][0] >= 0, 'window trimmed'); assert.equal(new C.PosHistory().at(1), null);
  assert.equal(C.inZone({ x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), true); assert.equal(C.inZone({ x: 6.1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), false); assert.equal(C.inZone({ x: 1, y: 4, z: 0 }, { x: 0, y: 0, z: 0 }), false);
  const bs = { t: 0, next: TL.snapFirst }, snaps = []; for (let i = 0; i < 300; i++) if (C.bandStep(bs, true, 0.02)) snaps.push(+(i * 0.02).toFixed(2));
  assert.ok(snaps.length >= 3 && snaps.length <= 4 && Math.abs(snaps[0] - TL.snapFirst) < 0.05 && Math.abs(snaps[1] - snaps[0] - TL.snapEvery) < 0.05, 'snaps every ~1.5 s: ' + snaps);
  assert.equal(C.bandStep(bs, false, 0.02), false); assert.equal(bs.t, 0, 'leaving the zone resets the clock');
  const keys = [{ t: 1, st: { forward: false } }, { t: 1.1, st: { forward: true } }, { t: 1.4, st: { forward: true } }];
  assert.equal(C.delayedDown(keys, 1.4, 'forward', 0.28), true); assert.equal(C.delayedDown(keys, 1.4, 'forward', 0.28 + 0.15), false, 'the key press arrives late'); assert.equal(C.delayedDown([], 2, 'forward'), false);
  const st = { state: 'fly', t: 0, cool: 0 };
  assert.equal(C.lagNext(st, false), null); assert.equal(C.lagNext(st, true), 'scan'); assert.equal(C.lagNext({ ...st, cool: 3 }, true), null);
  assert.equal(C.lagNext({ state: 'scan', t: TL.shimmer - 0.1 }), null); assert.equal(C.lagNext({ state: 'scan', t: TL.shimmer }), 'active'); assert.equal(C.lagNext({ state: 'active', t: TL.active }), 'off'); assert.equal(C.lagNext({ state: 'off', t: TL.off }), 'fly');
  assert.ok(TL.shimmer >= 0.8 && TN.windup >= 0.8 && TC.prime >= 0.8, 'every telegraph >= 0.8 s');
});

await ok('registration: defs, spawn tables + pool rows, quota gate, codex / ident rows, TR + RU for every player-facing string, HOST_ONLY', async () => {
  await import('../../src/game/creatures12_fx.js');
  AI.setC12Game(null); AI.registerC12Content();
  for (const id of C.ALL_IDS) {
    assert.ok(CREATURES[id] && CREATURES[id].custom && CREATURES[id].deathText && CREATURES[id].lore, id); assert.ok(EXTRA_SPAWNS[id]); assert.ok(HEAD_IDS.has(id), id + ' in the threat pool');
    assert.ok(IDENT[id] && IDENT[id][2]); assert.ok(FIELD_NOTES[id]); assert.equal(CREATURES[id].noSpawn, true, 'blocked without a run');
  }
  assert.equal(CREATURES[EC].hp > 0 && CREATURES[CK].hp > 0 && CREATURES[LG].hp > 0 && CREATURES[NF].hp > 0, true);
  AI.setC12Game({ run: { quotaIndex: 0 } }); assert.equal(CREATURES[NF].noSpawn, true); assert.equal(CREATURES[CK].noSpawn, true, 'cookie needs quota >= 1');
  AI.setC12Game({ run: { quotaIndex: 2 } }); for (const id of C.ALL_IDS) assert.equal(CREATURES[id].noSpawn, false, id);
  assert.equal(canSpawnMore(NF, new Map([['x', { type: NF, dead: false }]])), false, 'max 1 404');
  const tbl = spawnTable({ tier: 3, interior: 'office', creatures: {} }, 'in', null); for (const id of C.ALL_IDS) assert.ok(tbl[id] > 0, id + ' spawns on tier 3');
  assert.ok(HEADLINE.some((h) => h.id === NF && h.minQ === 2));
  for (const [en, tr, ru] of ROWS) { assert.ok(en && tr && ru, en); assert.equal(typeof TR[en], 'string'); assert.equal(typeof RU[en], 'string'); }
  for (const id of C.ALL_IDS) { const d = AI.DEFS[id]; for (const k of ['name', 'lore', 'deathText']) assert.ok(TR[d[k]] && RU[d[k]], id + ' ' + k); assert.ok(TR[AI.HINTS[id]] && RU[AI.HINTS[id]] && TR[AI.NOTES[id]] && RU[AI.NOTES[id]], id + ' hint / note'); }
  const fxSrc = fs.readFileSync(new URL('../../src/game/creatures12_fx.js', import.meta.url), 'utf8');
  for (const m of fxSrc.matchAll(/\b(?:t|tf)\('([^']+)'/g)) assert.ok(TR[m[1]] && RU[m[1]], 'fx string without TR / RU: ' + m[1]);
  assert.ok(HOST_ONLY.has('c12fx'), 'HOST_ONLY registered by the fx module import'); void fxSrc;
});

// ---------------------------------------------------------------------------------------------------- state machines (fake manager)
function world() {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const players = [], host = new Map(), sent = [], attacks = [], hurts = [], noises = [], dmg = [];
  const g = {
    time: 100, isHost: true, selfId: 'a', net: { broadcast(t, d) { sent.push([t, d]); } }, world: { facility: { layout: { y: 0, ox: 0, oz: 0, cell: 4, rooms: [{ id: 0, type: 'entrance', x: 0, z: 0, w: 2, h: 2, cx: 1, cz: 1 }, { id: 1, type: 'hall', x: 10, z: 0, w: 5, h: 5, cx: 12, cz: 2 }, { id: 2, type: 'hall', x: 0, z: 20, w: 3, h: 3, cx: 1, cz: 21 }, { id: 3, type: 'hall', x: 30, z: 30, w: 3, h: 3, cx: 31, cz: 31 }] }, nav: null } },
    hostHurtPlayer(id, d, cause, from) { hurts.push({ id, dmg: d, cause, from }); }, aiPlayers: () => players.filter((p) => !p.dead), run: { quotaIndex: 3 },
  };
  const M = {
    game: g, host, pvel: new Map(), noises, playersFor: (c) => players.filter((p) => !p.dead && (c.zone === 'any' || p.zone === c.zone)),
    nearest(c, list, maxD = 1e9) { let best = null, bd = maxD; for (const p of list) { const d = p.pos.distanceTo(c.pos); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; },
    nearSafeZone: (p) => !!p.safe, playerSpeed: () => 3,
    attack(c, p, d, cause) { attacks.push({ type: c.type, p: p.id, dmg: d, cause }); },
    damage(id, amount) { const c = host.get(id); c.hp -= amount; dmg.push(amount); if (c.hp <= 0) this.kill(c); },
    kill(c, by, o) { c.dead = true; c.setState('dead'); c.killedBy = by; c.silent = !!o?.silent; },
    goTo(c, x, z) { c.dest = { x, z }; }, wander(c) { this.goTo(c, c.pos.x + 5, c.pos.z); }, follow() { return false; },
    moveToward(c, t, dt, sp) { const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz) || 1; c.pos.x += dx / d * sp * dt; c.pos.z += dz / d * sp * dt; },
  };
  g.creatures = M;
  let idn = 0;
  const mk = (type, x = 0, z = 0, data = {}) => {
    const def = { ...CREATURES[type] }, id = 'c' + (idn++);
    const c = { type, def, id, pos: V(x, 0, z), yaw: 0, state: 'idle', t: 0, age: 5, cooldown: 0, stunT: 0, data: { ...data }, hp: def.hp, maxHp: def.hp, dmg: def.dmg, seed: 4, level: 1, zone: 'in', extra: 0, dead: false, path: null, home: V(x, 0, z),
      setState(s) { if (s !== this.state) { this.state = s; this.t = 0; } } };
    host.set(id, c); return c;
  };
  const player = (id, x, z, o = {}) => { const p = { id, pos: V(x, 0, z), eye: V(x, 1.6, z), look: V(0, 0, -1), dead: false, inShip: false, zone: 'in', crouch: false, noise: 0, voice: 0, ...o }; players.push(p); return p; };
  const step = (cs, s, dt = 0.05) => { for (let i = 0; i < Math.round(s / dt); i++) { g.time += dt; for (const c of [].concat(cs)) { if (c.dead) continue; c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.age += dt; CREATURES[c.type].behavior(c, dt, M); } } };
  return { g, M, mk, player, step, attacks, hurts, noises, sent, host, dmg };
}

await ok('404: seeks the nearest player slowly, 1.0 s static wind-up (cancels when you step out), the hit DOWNS (lethal hurt, cause = its id); a normal capped hit near the entrance', () => {
  const W = world(), a = W.player('a', 12, 0), c = W.mk(NF, 0, 0); W.player('b', 40, 0);
  W.step(c, 0.1); assert.equal(c.state, 'seek'); const x0 = c.pos.x; W.step(c, 2); assert.ok(c.pos.x - x0 > 3.5 && c.pos.x - x0 < 4.6, 'walks ~2.1 m/s: ' + (c.pos.x - x0));
  assert.ok(TN.walk < 3.5, 'slower than a walking crewmate');
  a.pos.set(c.pos.x + 2.0, 0, 0); W.step(c, 0.1); assert.equal(c.state, 'windup'); assert.equal(W.hurts.length, 0);
  W.step(c, 0.8); assert.equal(c.state, 'windup', 'wind-up is a full second'); assert.ok(c.extra > 0.7 && c.extra < 1, 'extra = the burst ramp: ' + c.extra); assert.equal(W.hurts.length, 0, 'no hit during the telegraph');
  a.pos.x += 5; W.step(c, 0.1); assert.equal(c.state, 'seek', 'stepping out of 3.6 m cancels the burst'); assert.equal(W.hurts.length, 0);
  W.step(c, 1.6); a.pos.set(c.pos.x + 1.5, 0, 0); W.step(c, 0.1); assert.equal(c.state, 'windup'); W.step(c, 1.1);
  assert.equal(W.hurts.length, 1); assert.equal(W.hurts[0].id, 'a'); assert.equal(W.hurts[0].cause, NF); assert.equal(W.hurts[0].dmg, 999, 'a downing hit'); assert.equal(W.hurts[0].from, null);
  assert.equal(c.state, 'attack'); W.step(c, 0.7); assert.equal(c.state, 'off'); W.step(c, TN.off + 0.1); assert.ok(c.state === 'seek' || c.state === 'windup', 'resumes (and winds up again if you are still next to it)');
  const W2 = world(), s = W2.player('a', 0, 2, { safe: true }), c2 = W2.mk(NF, 0, 0); W2.step(c2, 0.1); W2.step(c2, 1.3);
  assert.equal(W2.hurts.length, 0); assert.equal(W2.attacks.length, 1, 'entrance / ship: an ordinary hit, never the downing one'); void s;
});

await ok('cookie: crawls to a player with none, 0.8 s prime, latches on the back (silent), every creature hears the victim, no damage; the next cookie takes another player', () => {
  const W = world(), a = W.player('a', 6, 0), b = W.player('b', 30, 0), c = W.mk(CK, 0, 0), c2 = W.mk(CK, 2, 0);
  W.step(c, 0.1); assert.equal(c.state, 'crawl'); W.step(c, 1); assert.equal(c.state, 'crawl', 'still crawling, 6 m away');
  a.pos.set(c.pos.x + 1, 0, 0); for (let i = 0; i < 40 && c.state === 'crawl'; i++) W.step(c, 0.05);
  assert.equal(c.state, 'prime'); W.step(c, 0.5); assert.equal(c.state, 'prime', 'a 0.8 s telegraph'); assert.equal(c.extra > 0 && c.extra < 1, true);
  W.step(c, 0.4); assert.equal(c.state, 'follow'); assert.equal(c.extra, 'a'); assert.equal(W.hurts.length + W.attacks.length, 0, 'never damages');
  W.step(c, 1.7); assert.ok(W.noises.length >= 1 && W.noises.every((q) => q.owner === 'a' && q.loud === TC.loud), 'the victim is heard by everything');
  assert.ok(c.pos.z > a.pos.z - 0.01 && c.pos.y > 1, 'sits on the back'); a.pos.set(9, 0, 3); W.step(c, 0.1); assert.ok(Math.abs(c.pos.x - 9) < 0.5, 'follows the victim');
  const n0 = W.noises.length; W.step(c, 3.3); assert.ok(W.noises.length >= n0 + 2, 'keeps pinging every 1.6 s');
  b.pos.set(a.pos.x + 12, 0, a.pos.z); c2.pos.set(a.pos.x + 11, 0, a.pos.z); W.step(c2, 0.2); assert.equal(c2.data.tid, 'b', 'the second cookie skips a player who already carries one');
  a.dead = true; W.step(c, 0.1); assert.equal(c.state, 'crawl', 'falls off a dead victim'); assert.equal(c.extra, 0);
});

await ok('cookie: pull (teammate within reach, never the victim, must be alive) and CLEAR COOKIES (aboard only)', () => {
  const W = world(), a = W.player('a', 5, 5), b = W.player('b', 6.5, 5), far = W.player('f', 30, 5), c = W.mk(CK, 5, 5, { init: 1, retry: 0, ping: 1 }); c.extra = 'a'; c.setState('follow');
  assert.equal(AI.pullCookie(W.M, c.id, 'a'), false, 'cannot pull your own'); assert.equal(AI.pullCookie(W.M, c.id, 'f'), false, 'too far'); assert.equal(c.dead, false);
  assert.equal(AI.pullCookie(W.M, 'nope', 'b'), false);
  assert.equal(AI.pullCookie(W.M, c.id, 'b'), true); assert.equal(c.dead, true); assert.equal(c.killedBy, 'b'); assert.ok(W.sent.some(([t, d]) => t === 'c12fx' && d.k === 'pulled' && d.v === 'a' && d.by === 'b'));
  const c2 = W.mk(CK, 5, 5, { init: 1, retry: 0, ping: 1 }); c2.extra = 'a'; c2.setState('follow');
  assert.equal(AI.clearCookies(W.M, 'a'), -1, 'not aboard'); assert.equal(c2.dead, false); a.inShip = true; assert.equal(AI.clearCookies(W.M, 'a'), 1); assert.equal(c2.dead, true); assert.equal(c2.silent, true); assert.equal(AI.clearCookies(W.M, 'a'), 0); void far;
});

await ok('echo: records footsteps / voice / noise() near it, replays 18+ m away with fx sounds + lure noises, x2.5 damage while it replays, back to listening', () => {
  const W = world(), a = W.player('a', 5, 0, { noise: 0.6, voice: 0.5 }), c = W.mk(EC, 0, 0, { init: 1, tape: new C.Tape(), cool: 0, hp: CREATURES[EC].hp }); c.setState('dormant'); c.pos.set(0, 0, 0);
  W.step(c, 0.1); assert.equal(c.state, 'dormant');
  AI.hearNoise(W.M, new THREE.Vector3(3, 0, 0), 0.5); AI.hearNoise(W.M, new THREE.Vector3(60, 0, 0), 0.5); assert.equal(c.data.tape.ev.filter((e) => e.k === 'drop').length, 1, 'only noises within its ears');
  W.step(c, 1.2); assert.ok(c.data.tape.ev.length >= 3, 'footsteps + voice recorded: ' + c.data.tape.ev.length);
  for (let i = 0; i < 8; i++) { AI.hearNoise(W.M, new THREE.Vector3(2, 0, 0), 0.9); } W.step(c, 0.1);
  assert.equal(c.state, 'feed', 'a full tape starts the replay'); assert.equal(c.extra, 1);
  a.noise = 0; a.voice = 0; W.step(c, TE.lead + 0.3);
  const snd = W.sent.filter(([t, d]) => t === 'fx' && d.k === 'snd'); assert.ok(snd.length >= 1); const sp = snd[0][1].p; assert.ok(Math.hypot(sp[0], sp[2]) >= TE.spotMin - 2.5, 'the replay is far from the chamber: ' + Math.hypot(sp[0], sp[2]));
  assert.ok(W.noises.some((q) => q.owner === 'c12_echo' && q.loud >= 0.8), 'creatures are lured');
  const hp0 = c.hp; c.hp -= 10; W.step(c, 0.05); assert.ok(Math.abs(hp0 - c.hp - 25) < 0.01, 'x2.5 damage while it replays: ' + (hp0 - c.hp));
  W.step(c, TE.replay + 3); assert.equal(c.state, 'dormant'); assert.equal(c.data.tape.ev.length, 0, 'tape is spent'); assert.ok(c.data.cool > 0);
  const hp1 = c.hp; c.hp -= 10; W.step(c, 0.05); assert.equal(hp1 - c.hp, 10, 'normal damage while it only listens');
  // quiet crew = an empty tape
  const W2 = world(), q = W2.player('q', 5, 0, { noise: 0.1 }), c2 = W2.mk(EC, 0, 0, { init: 1, tape: new C.Tape(), cool: 0, hp: CREATURES[EC].hp }); c2.setState('dormant'); W2.step(c2, 30); assert.equal(c2.data.tape.ev.length, 0, 'sneaking gives it nothing'); void q;
});

await ok('lag spike: fly -> scan 1.5 s shimmer (telegraph) -> active 12 s -> off 5 s -> fly; stun cancels the zone', () => {
  const W = world(), a = W.player('a', 40, 0), c = W.mk(LG, 0, 0, { init: 1, cool: 0 }); c.setState('fly');
  W.step(c, 0.2); assert.equal(c.state, 'fly'); a.pos.set(c.pos.x + 5, 0, 0); W.step(c, 0.1); assert.equal(c.state, 'scan');
  W.step(c, 1.2); assert.equal(c.state, 'scan', 'shimmer lasts 1.5 s'); assert.ok(c.extra > 0.6 && c.extra < 1);
  W.step(c, 0.35); assert.equal(c.state, 'active'); assert.ok(c.extra > 0.9); W.step(c, 6); assert.equal(c.state, 'active'); assert.ok(c.extra < 0.6);
  W.step(c, 6.2); assert.equal(c.state, 'off'); assert.ok(c.data.cool >= TL.rest[0]); W.step(c, TL.off + 0.1); assert.equal(c.state, 'fly');
  c.data.cool = 0; W.step(c, 1.7); assert.equal(c.state, 'active'); c.setState('stunned'); W.step(c, 0.1); assert.equal(c.state, 'fly', 'a stun ends the zone'); assert.ok(c.data.cool >= 2.9);
});

await ok('models build + animate through every state (no THREE lights), 404 look modes, registry; sound recipes are finite and loops are whole seconds', async () => {
  const M = await import('../../src/models/creatures12_models.js');
  const states = ['idle', 'seek', 'windup', 'attack', 'off', 'crawl', 'prime', 'follow', 'dormant', 'feed', 'fly', 'scan', 'active', 'stunned', 'dead'];
  for (const [name, fn] of [['404', M.createNotFoundModel], ['cookie', M.createCookieModel], ['echo', M.createEchoModel], ['lag', M.createLagModel]]) {
    const m = fn(); m.root.traverse((o) => assert.ok(!o.isLight, name + ' has a light')); assert.ok(m.height > 0 && m.radius > 0);
    for (const st of states) for (const pr of [0, 0.5, 1]) m.update(0.05, { state: st, speed: 2, t: 0.4, time: 5 + pr, progress: pr });
    m.setHitFlash(0.5); m.dispose();
  }
  const nf = M.createNotFoundModel(); assert.equal(nf.root.visible, false, '404 is invisible by default'); nf.setLook(1); assert.equal(nf.root.visible, true); nf.setLook(2); assert.equal(nf.getLook(), 2); nf.setLook(0); assert.equal(nf.root.visible, false);
  const reg = new Map(); M.registerC12Models(reg); assert.equal(reg.size, 4); for (const id of C.ALL_IDS) assert.equal(typeof reg.get(id), 'function');
  const S = await import('../../src/game/creatures12_sfx.js');
  for (const id of S.SOUND_IDS) { const a = S.SOUNDS[id](8000); assert.ok(a instanceof Float32Array && a.length > 100, id); let peak = 0; for (const v of a) { assert.ok(Number.isFinite(v), id); peak = Math.max(peak, Math.abs(v)); } assert.ok(peak > 0.3 && peak <= 1, id + ' peak ' + peak); }
  for (const id of ['c12_404_hiss', 'c12_echo_hum', 'c12_echo_wail', 'c12_lag_hum', 'c12_lag_zone']) assert.equal(S.SOUNDS[id](8000).length, 16000, id + ' loop length');
  for (const id of ['c12_404_burst', 'c12_404_hit', 'c12_cookie_tick', 'c12_echo_play', 'c12_echo_voice', 'c12_lag_stutter']) assert.ok(S.SOUND_IDS.includes(id), id);
  const used = new Set(); for (const src of ['creatures12_ai.js', 'creatures12_fx.js']) for (const m of fs.readFileSync(new URL('../../src/game/' + src, import.meta.url), 'utf8').matchAll(/'(c12_[a-z0-9_]+)'/g)) used.add(m[1]);
  for (const id of used) if (/^c12_(404|cookie|echo|lag)_/.test(id)) assert.ok(S.SOUND_IDS.includes(id), 'sound used but not defined: ' + id);
});

await ok('client fx: lag zone wraps input (delayed movement), rubber-bands to 0.8 s ago on a 1.5 s clock, restores on dispose; ribbon after 6 s; static; installer + debug', async () => {
  const { installCreatures12 } = await import('../../src/game/creatures12.js');
  const handlers = new Map(), offs = [];
  const real = { forward: false, jump: false };
  const input = { enabled: true, isDown(a) { return !!real[a]; }, pressed(a) { return a === 'jump' && !!real.jump; } };
  const tele = [], view = { type: LG, state: 'active', pos: new THREE.Vector3(0, 0, 0), extra: 1, stateT: 0 }, nf = { type: NF, state: 'seek', pos: new THREE.Vector3(20, 0, 0), extra: 0, model: { setLook(m) { nf.look = m; } } };
  const cookie = { type: CK, state: 'follow', extra: 'a', pos: new THREE.Vector3(), stateT: 0, id: 'ck1' };
  const views = new Map([['l', view], ['n', nf], ['k', cookie]]);
  const player = { pos: new THREE.Vector3(2, 0, 0), dead: false, yaw: 0, teleport(p) { tele.push(p.clone()); this.pos.copy(p); }, eyePos: () => new THREE.Vector3(0, 1.6, 0), forward: () => new THREE.Vector3(0, 0, -1) };
  const fxs = { noise: 0 };
  const game = {
    isHost: true, selfId: 'a', time: 5, mods: { soundGens: new Map(), api: {}, on(ev, fn) { handlers.set(ev, fn); return () => handlers.delete(ev); } }, audio: null, ui: { toast() {} }, remotes: new Map(), input, player, engine: { fx: fxs, flash() {} }, sfx() {},
    net: { on_() {}, request() {}, broadcast() {}, sendTo() {}, msgHandlers: new Map() }, later() {}, camera: { position: new THREE.Vector3() }, isLitByFlashlight: () => false, physics: { lineOfSight: () => true },
    stats: { scanRange: 20 }, run: { phase: 'moon', quotaIndex: 3 }, world: { facility: null }, aiPlayers: () => [], creatures: { host: new Map(), views, hostSpawn: () => null, noise() {} },
  };
  const api = installCreatures12(game); assert.ok(api && api.ids && api.debug && typeof api.dispose === 'function');
  assert.notEqual(input.isDown.toString().indexOf('delayedDown'), -1, 'input.isDown is wrapped'); assert.ok(handlers.has('update') && handlers.has('scanLabels') && handlers.has('registerHandlers'));
  const tick = (dt, n = 1) => { for (let i = 0; i < n; i++) { player.pos.x += real.forward ? 4 * dt : 0; handlers.get('update')(dt, game); } };
  real.forward = true; tick(0.05, 9); // walking inside the zone: real input is forward, delayed input starts as "not pressed yet"
  assert.equal(input.isDown('sprint'), false); assert.equal(input.isDown('forward'), true, 'held long enough: the delayed state has caught up');
  real.forward = false; tick(0.05, 2); assert.equal(input.isDown('forward'), true, 'released 0.1 s ago: still "down" through the delay'); tick(0.05, 6); assert.equal(input.isDown('forward'), false);
  assert.equal(game.player.pos.x <= 2 + 4 * 0.05 * 6 + 1e-9, true);
  real.forward = true; const x0 = player.pos.x; tick(0.05, 40); assert.ok(tele.length >= 1, 'rubber-banded'); assert.ok(tele[0].x < x0 + 4 * 0.05 * 20, 'snapped back to an earlier position');
  view.state = 'off'; tele.length = 0; tick(0.05, 60); assert.equal(tele.length, 0, 'no snaps outside an active zone'); assert.equal(input.isDown('forward'), true, 'input is real again');
  // 404: hidden by default; the scanner pulse reveals it; static near it
  tick(0.05); assert.equal(nf.look, 0); handlers.get('scanLabels')([], new THREE.Vector3(10, 1.6, 0), new THREE.Vector3(1, 0, 0), game); tick(0.05); assert.equal(nf.look, 2, 'scan reveals'); tick(0.05, 60); assert.equal(nf.look, 0, 'after 2.5 s it is gone again');
  nf.pos.set(player.pos.x + 4, 0, 0); tick(0.05); assert.ok(fxs.noise > 0.05, 'static grows near it: ' + fxs.noise); nf.pos.set(80, 0, 0); tick(0.05); assert.equal(fxs.noise, 0);
  game.gear11 = { state: { pilot: true } }; nf.pos.set(30, 0, 0); tick(0.05); assert.equal(nf.look, 2, 'the drone view sees it'); game.gear11 = null; tick(0.05); assert.equal(nf.look, 0);
  // debug
  assert.equal(api.debug.spawn('bogus'), false); assert.equal(api.debug.state().lagged, false); assert.equal(typeof api.debug.reveal(), 'number');
  const before = input.isDown; api.dispose(); assert.notEqual(input.isDown, before, 'dispose restores the input methods'); assert.equal(handlers.has('update'), false);
  const src = fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8');
  assert.ok(src.includes("import { installCreatures12 } from './creatures12.js';") && src.includes("this.useModule('creatures12', installCreatures12);"));
});

console.log(`\n${n} groups passed`);
