// FEEDCAMS 2 tests (pure node, wave 8 pass 2, docs/wave8/feedcams2.md): node tools/harness/feedcams2.test.mjs
//  1. rules: sprint draws the eye, Watched +2 cameras, drones (plan / patrol / bait / searchlight), jammer bubble, showcase tip, highlight ranking
//  2. hooks: crdirector heat multipliers, the Follower moves when a camera watches it, module smoke (tax event -> showcase tip + highlight)
//  3. strings: TR + RU for every new key
import * as K from '../../src/game/feedcams_core.js';
import * as C from '../../src/game/feedcams2_core.js';
import * as D from '../../src/game/crdirector_core.js';
import { followerBehavior } from '../../src/game/crdirector_creatures.js';
import { FC2_KEYS, HL_TEXT } from '../../src/game/feedcams2_i18n.js';
import { installFeedcams2 } from '../../src/game/feedcams2.js';
import { HYPE } from '../../src/game/algo2_core.js';
import { tIn } from '../../src/core/i18n.js';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. rules
ok(K.exposureRate(8, false, 1, true) > K.exposureRate(8, false, 1, false) && K.exposureRate(8, true, 1, true) < K.exposureRate(8, false, 1, false), 'sprint > walk > crouch');
ok(K.camCount(1.5, 1, 0, 2) === 1, 'Watched never touches the tutorial landing');
ok(K.camCount(1.5, 5, 2, 2) === K.camCount(1.5, 5, 2) + 2 && K.camCount(3, 9, 5, 2) <= 12, 'Watched = +2 cameras (cap 12)');
const e = { x: 60, z: 40 };
const a = C.planDrones({ entrance: e, seed: 5, day: 3, quotaIndex: 0 }), b = C.planDrones({ entrance: e, seed: 5, day: 3, quotaIndex: 0 });
ok(JSON.stringify(a) === JSON.stringify(b) && a.length === 1, 'drones deterministic, 1 early');
ok(C.planDrones({ entrance: e, seed: 5, day: 3, quotaIndex: 2 }).length === 2 && C.planDrones({ entrance: e, seed: 5, day: 3, quotaIndex: 0, watched: true }).length === 2, '2 drones from quota 2 / Watched');
let far = 0;
for (let t = 0; t < 80; t += 0.5) { const g = C.dronePos(a[0], t); far = Math.max(far, Math.hypot(g.x - e.x, g.z - e.z)); }
ok(far < C.DRONE.off[1] + C.DRONE.loop[1] + 0.5 && far > 3, `patrol stays near the entrance (${far.toFixed(1)} m)`);
const bait = { x: e.x + 25, z: e.z, t0: 10, t1: 16 }, gb = C.dronePos(a[0], 13, bait);
ok(Math.hypot(gb.x - bait.x, gb.z - bait.z) < 0.01 && Math.hypot(C.dronePos(a[0], 30, bait).x - C.dronePos(a[0], 30).x, 0) < 1e-9, 'noise bait pulls the drone over, then lets go');
ok(C.droneSees({ x: 0, z: 0 }, 5, 0, false).ok && !C.droneSees({ x: 0, z: 0 }, 5, 0, true).ok && !C.droneSees({ x: 0, z: 0 }, 7, 0, false).ok, 'searchlight radius, crouch shrinks it');
ok(C.isNight(18 * 60) && !C.isNight(12 * 60) && C.isNight(600, 'eclipsed'), 'night gate');
ok(C.jammed(3, 2.5, 3, [{ x: 0, y: 1, z: 0 }]) && !C.jammed(9, 1, 0, [{ x: 0, y: 1, z: 0 }]) && !C.jammed(0, 0, 0, []), 'jammer bubble 8 m');
ok(C.showTip(20, 7) === 0 && C.showTip(80, 28) === 28 && C.showTip(400, 140) === C.SHOW.tipMax && C.showTip(80, 28, C.SHOW.perDay) === 0, 'showcase tip: min value, cap, 3 per day');
const hDown = C.hlMake('down', 'Ana'), hShow = C.hlMake('show', 'Bo', 120, 'Server Rack'), hLive = C.hlMake('live', 'Cy');
ok(C.hlBetter(C.hlBetter(hLive, hShow), hDown) === hDown && C.hlBetter(hShow, hLive) === hShow && C.hlBetter(null, hLive) === hLive, 'highlight ranking');
for (const k of Object.keys(C.HL)) ok(HL_TEXT[k], 'highlight text for ' + k);

// 2. hooks
ok(D.feedMul('peak', 100) > 1.3 && D.feedMul('build', 0) === D.FEED.buildQuiet && D.feedMul('calm', 90) === 1 && D.feedMul('peak', null) === 1, 'crdirector feed multipliers');
ok(D.feedCalmMul(100) === 0.5 && D.feedCalmMul(0) === 1, 'hot stream shortens the calm');
{
  const moved = [], cams = { v: false };
  const c = { data: {}, state: '', t: 0, cooldown: 0, yaw: 0, pos: { x: 0, y: 0, z: 0 }, setState(s) { this.state = s; } };
  const P = { id: 'p', pos: { x: 10, y: 0, z: 0 } };
  const M = { game: { feedcams: { sees: () => cams.v } }, playersFor: () => [P], nearest: () => ({ p: P, d: 10 }), isLookedAt: () => false, moveToward: (cc, to) => moved.push(to), attack() {} };
  const beh = followerBehavior();
  beh(c, 0.1, M); const n0 = moved.length;
  cams.v = true; beh(c, 0.1, M);
  ok(n0 === 0 && moved.length === 1 && c.state === 'chase', 'the Follower moves while a camera watches it');
}
{ // module smoke: a showcase tax event -> sponsor tip for the carrier + highlight; downed on camera -> hype
  const handlers = new Map(), sent = [], hyped = [];
  const mods = { on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of handlers.get(ev) || []) f(...a); } };
  const game = { mods, isHost: true, time: 100, selfId: 'h', run: { phase: 'moon', moon: 'x', fc: {}, fc2: { dr: [], hl: null } }, net: { broadcast: (k, d) => sent.push([k, d]), on() {}, off() {} },
    broadcastRun() {}, playerName: (id) => ({ h: 'Host', p: 'Pal' }[id] || '?'), aiPlayers: () => [{ id: 'p', pos: { x: 0, y: 0, z: 0 } }],
    algo2: { hype: (k) => hyped.push(k) }, feedcams: { meter: () => ({ m: 0.6, live: true, tag: 'c1' }), sees: () => true } };
  const api = installFeedcams2(game);
  mods.emit('feedcams', { k: 'tax', item: 'i1', name: 'Server Rack', v: 120, cut: 42, by: 'p' }, game);
  const tip = sent.find(([k, d]) => k === 'fc2fx' && d.k === 'tip');
  ok(tip && tip[1].to === 'p' && tip[1].n === Math.min(C.SHOW.tipMax, 42), 'showcase tips the carrier');
  ok(hyped.includes('showcase') && HYPE.pts.showcase > 0, 'showcase hype registered + sent');
  ok(game.run.fc2.hl?.[0] === 'show' && game.run.fc2.hl[1] === 'Pal', 'showcase recorded as highlight');
  mods.emit('tfg:downed', { id: 'p' }, game);
  ok(hyped.includes('downed_live') && game.run.fc2.hl[0] === 'down', 'downed on camera: hype + best highlight');
  const extra = []; mods.emit('phase', 'takeoff', game); mods.emit('daySummary', {}, extra, game);
  ok(extra.length === 1 && /Pal/.test(extra[0]), 'day summary names the highlight');
  api.dispose();
}

// 3. strings
for (const k of FC2_KEYS) { ok(tIn('tr', k) !== k, 'missing TR: ' + k.slice(0, 40)); ok(tIn('ru', k) !== k, 'missing RU: ' + k.slice(0, 40)); }

console.log(`feedcams2: ${fails.length ? 'FAIL' : 'ok'}`);
for (const f of fails) console.log('  x ' + f);
process.exit(fails.length ? 1 : 0);
