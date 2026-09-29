// aimtell + chase tuning test:  node tools/harness/aimchase.test.mjs
import assert from 'node:assert/strict';
import * as A from '../../src/game/aimtell_core.js';
import * as T from '../../src/game/chase_tuning.js';
import { CREATURES } from '../../src/game/creatures.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

// ---------------------------------------------------------------- aim state machine
ok('aim durations are 0.8-1.4 s (+ early forgiveness), lock 0.25 s, cooldown 2-4 s', () => {
  for (const q of [4, 6]) { assert.equal(A.aimDuration(0, q), 0.8); assert.equal(A.aimDuration(1, q), 1.4); assert.equal(A.cooldownFor(0, q), 2); assert.equal(A.cooldownFor(1, q), 4); }
  assert.ok(A.aimDuration(0, 0) > 0.8 && A.aimDuration(1, 0) <= 1.4 + 0.25 + 1e-9);
  assert.equal(A.aimDuration(0, 5, 0.5), 0.8);                 // trained shooters never go below 0.8 s
  assert.equal(A.AIM_T.lock, 0.25);
});
ok('aim -> lock -> fire timings, lock point frozen, cooldown gate', () => {
  const a = A.newAim(); let now = 0;
  assert.ok(A.aimReady(a, now));
  A.aimBegin(a, 'p1', 0.5, 5);
  const dur = a.dur; assert.ok(dur >= 0.8 && dur <= 1.4);
  const evs = []; let tLock = -1, tFire = -1;
  for (let i = 0; i < 400; i++) {
    now += 0.01;
    const e = A.aimTick(a, 0.01, now, 0.5, 5);
    if (e === 'lock') { tLock = now; a.lock = [1, 1, 1]; }
    if (e === 'fire') { tFire = now; }
    if (e) evs.push(e);
  }
  assert.deepEqual(evs, ['lock', 'fire']);
  assert.ok(Math.abs(tLock - dur) < 0.02, 'lock at end of aim');
  assert.ok(Math.abs(tFire - tLock - 0.25) < 0.02, 'fire 0.25 s after lock');
  assert.deepEqual(a.lock, [1, 1, 1]);
  assert.ok(!A.aimReady(a, tFire + 1.9) && A.aimReady(a, tFire + 3.01 + 0.5), 'cooldown 2-4 s');
});
ok('no tracking: a target that left the locked point is not hit', () => {
  const lock = [10, 1.2, 0];
  assert.equal(A.resolveShot(lock, [10.3, 1.2, 0.2], 1, 0).hit, true);
  assert.equal(A.resolveShot(lock, [12.5, 1.2, 0], 1, 0).hit, false);   // sidestepped 2.5 m (a sprinter moves 2 m in the 0.25 s lock)
  assert.equal(A.resolveShot(lock, [10, 3, 0], 1, 0).hit, false);
  assert.ok(8.2 * A.AIM_T.lock > A.AIM_T.hitR, 'a sprinter leaves the hit radius during the lock');
});
ok('abort gives a pause and no shot', () => {
  const a = A.newAim(); A.aimBegin(a, 'p', 0.5, 0); A.aimAbort(a, 5); assert.equal(a.ph, 'idle'); assert.ok(!A.aimReady(a, 5.2) && A.aimReady(a, 5.7));
});
ok('state sync encoding round-trips', () => {
  assert.deepEqual(A.parseAim('peer-1'), { pid: 'peer-1', lock: null });
  const p = A.parseAim(A.encodeLock('a|b', [1.5, 2, -3.25])); assert.equal(p.pid, 'a|b'); assert.deepEqual(p.lock, [1.5, 2, -3.25]);
  assert.equal(A.parseAim(0), null);
  assert.ok(A.jitterAmp(0) > A.jitterAmp(0.5) && A.jitterAmp(1.2) === 0);
});

// ---------------------------------------------------------------- accuracy table
ok('accuracy falls with distance, x0.6 sprinting, x0.3 in cover, early quota forgiving', () => {
  const base = { dist: 10, quota: 6 };
  const a10 = A.accuracy(base), a25 = A.accuracy({ ...base, dist: 25 }), a40 = A.accuracy({ ...base, dist: 40 });
  assert.ok(a10 > a25 && a25 > a40);
  assert.ok(Math.abs(A.accuracy({ ...base, sprint: true }) / a10 - 0.6) < 1e-9);
  assert.ok(Math.abs(A.accuracy({ ...base, cover: true }) / a10 - 0.3) < 1e-9);
  assert.ok(A.accuracy({ ...base, quota: 0 }) < a10, 'quota 0 is more forgiving');
  assert.ok(A.accuracy({ ...base, quota: 0 }) > 0 && A.accuracy({ dist: 200, cover: true, sprint: true, quota: 0 }) >= 0.03);
  console.log('   acc table (q6): 6m', A.accuracy({ dist: 6, quota: 6 }).toFixed(2), '20m', A.accuracy({ dist: 20, quota: 6 }).toFixed(2), '40m', a40.toFixed(2));
});

// ---------------------------------------------------------------- group limit
ok('group limit: 1 shooter early, 2 later, released slots and stale claims free up', () => {
  assert.equal(A.maxFiring(0), 1); assert.equal(A.maxFiring(3), 2);
  const g = new A.AimGroup();
  assert.ok(g.claim('a', 0, 2)); assert.ok(g.claim('b', 0, 2)); assert.ok(!g.claim('c', 0, 2));
  assert.ok(g.claim('a', 0.1, 2), 're-claim by owner ok');
  g.release('a'); assert.ok(g.claim('c', 0.2, 2));
  assert.ok(!g.claim('d', 1, 2)); assert.ok(g.claim('d', 5, 2), 'stale claims (> 4 s) expire');
  const h = new A.AimGroup(); assert.ok(h.claim('x', 0, 1)); assert.ok(!h.claim('y', 0, 1));
});

// ---------------------------------------------------------------- chase
const load = async () => { for (const m of ['creatures_wave1', 'worlds2_creatures', 'skeletons', 'maps5_creatures', 'mirror_creatures']) { try { await import(`../../src/game/${m}.js`); } catch { /* browser-only import */ } } };
await load();

/** simulate the chaser (run asked = def speed) starting `gap` m behind a straight-running player for `secs` seconds; returns min gap */
function chase(def, type, { gap = 4, secs = 10, player = 8.2, stamina = null, dt = 0.02 }) {
  const cfg = T.chaseCfg(def, type); const ch = T.newChase();
  const ask = Math.max(def.run || 0, def.walk || 0);
  let g = gap, min = gap, sprint = stamina;
  for (let t = 0; t < secs; t += dt) {
    const sp = cfg ? T.chaseSpeed(ch, ask, dt, cfg, t) : ask;
    let ps = player;
    if (sprint != null) { if (sprint > 0) sprint -= 18 * dt; else ps = 5.0; }      // 100 stamina, drain 18/s, then walk
    g += (ps - sp) * dt; min = Math.min(min, g);
  }
  return min;
}
ok('every non-boss creature: a sprinting player on open ground is never caught within 10 s (gap 4 m)', () => {
  let checked = 0;
  for (const [type, def] of Object.entries(CREATURES)) {
    if (def.boss || def.hazard || type === 'sandkefal') continue;
    const min = chase(def, type, {});
    assert.ok(min > 0.5, `${type} (run ${def.run}) caught a sprinter: min gap ${min.toFixed(2)}`);
    checked++;
  }
  console.log('   checked', checked, 'creatures');
});
ok('with the real stamina (100, 18/s, then walking 5 m/s) an 8 m head start survives 10 s for the fastest', () => {
  for (const [type, def] of Object.entries(CREATURES)) {
    if (def.boss || def.hazard || type === 'sandkefal') continue;
    const min = chase(def, type, { gap: 8, stamina: 100 });
    assert.ok(min > 0.3, `${type} min gap ${min.toFixed(2)}`);
  }
});
ok('burst / fatigue maths: burst <= 9.5 for 2-3 s, then tired < walk speed, then sustained < 8.2, long-run average < sprint', () => {
  const def = { run: 13.5, walk: 1.3 }, cfg = T.chaseCfg(def, 'jester'); const ch = T.newChase();
  const sp = []; for (let t = 0; t < 30; t += 0.05) sp.push(T.chaseSpeed(ch, 13.5, 0.05, cfg, t));
  assert.ok(Math.max(...sp) <= 9.5 + 1e-9);
  const burstT = sp.filter((s) => s > T.TUNING.sustained + 0.01).length * 0.05;
  assert.ok(burstT >= 2 && burstT <= 3 * 3, `burst time ${burstT}`);
  assert.ok(sp.some((s) => s < 5.0), 'fatigue slower than walking');
  const avg = sp.reduce((a, b) => a + b, 0) / sp.length; assert.ok(avg < T.PLAYER_SPRINT - 1, `avg ${avg}`);
  assert.ok(T.TUNING.sustained < T.PLAYER_SPRINT && T.TUNING.burstMax <= 9.5);
  // slow creatures are untouched
  const slow = T.chaseCfg({ run: 5.4, walk: 2.2 }, 'scuttler'); assert.equal(T.chaseSpeed(T.newChase(), 5.4, 0.02, slow, 0), 5.4);
  // exempt
  assert.equal(T.chaseCfg({ run: 12, boss: true }, 'x'), null); assert.equal(T.chaseCfg(CREATURES.sandkefal, 'sandkefal'), null);
});
ok('recovery after standing still refills the burst; wide turns + door hesitation', () => {
  const cfg = T.chaseCfg({ run: 11, walk: 3 }, 'hound'); const ch = T.newChase();
  let t = 0; for (; t < 20; t += 0.05) T.chaseSpeed(ch, 11, 0.05, cfg, t);
  assert.ok(T.chaseSpeed(ch, 11, 0.05, cfg, t) <= T.TUNING.sustained + 1e-9 || ch.tired > 0);
  t += 3; assert.ok(T.chaseSpeed(ch, 11, 0.05, cfg, t) > T.TUNING.sustained, 'burst is back after 3 s of not chasing');
  const [tr, fs] = T.chaseTurn(cfg, 11, 8, 0.3); assert.ok(tr < 8 && fs < 0.3);
  assert.deepEqual(T.chaseTurn(cfg, 5, 8, 0.3), [8, 0.3]);
  const p0 = T.doorPause(cfg, 11, 0), p1 = T.doorPause(cfg, 11, 1); assert.ok(p0 >= 1 && p1 <= 2);
  assert.equal(T.doorPause(cfg, 2, 0.5), 0);
});
ok('tension curve', () => {
  assert.equal(T.tension(40), 0); assert.ok(T.tension(3) === 1 && T.tension(10) > T.tension(20) && T.tension(20) > 0);
  assert.ok(T.pulseInterval(1) < T.pulseInterval(0));
});
console.log(`\n${n} groups passed`);
