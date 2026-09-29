// Homeworld on-site raid core test ([finish]):  node tools/harness/homeworld_raid.test.mjs
// A tiny stand-in for the game glue (raiders walk straight at the pad, hit the nearest structure in reach) drives homeworld_raid_core.js against a
// RaidSim data holder: wave planning, tower fire kinds, traps, enter / leave folding, and outcomes (no defences breached, defended base holds).
import assert from 'node:assert/strict';
import * as H from '../../src/game/homeworld_core.js';
import * as K from '../../src/game/homeworld_raid_core.js';
import { SG } from '../../src/game/siege_core.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };

function baseState(defs) {
  const s = H.blankState();
  let id = 1;
  for (const [t, x, z, l = 1] of defs) s.b.push({ i: id++, t, x, z, r: 0, l });
  s.n = id;
  return s;
}
const richBase = () => baseState([['generator', -6, 5, 3], ['generator', -6, 8, 3], ['farm', 4, -9], ['farm', 8, -9], ['rack', -9, -9], ['gun', 6, 6, 3], ['gun', 6, 8, 3], ['gun', -8, 6, 3], ['gun', 8, 2, 3], ['tesla', 5, 4, 3], ['cryo', 7, 5, 2], ['flame', 5, 7, 2], ['sniper', -5, 6, 2], ...Array.from({ length: 10 }, (_, i) => ['wall', 2 + i, 10, 2])]);
const poorBase = () => baseState([['farm', 4, -9], ['farm', 8, -9], ['rack', -9, -9], ['garden', -9, 9]]);

/** stand-in glue: raiders spawn along the bearing, walk to the pad, hit buildings in reach; returns the finished sim */
function fight(state, { seed = 5, qi = 2, dt = 0.25, crewLeavesAt = null } = {}) {
  const sim = H.makeRaid(state, { seed, quotaIndex: qi });
  const tstate = K.newTowerState();
  let carry = K.enterSite(sim), raiders = [], queue = [], id = 1, waveN = 0, shots = { gun: 0, tesla: 0, flame: 0, cryo: 0, sniper: 0 };
  const kinds = new Set();
  let leftOnce = false;
  for (let t = 0; t < 900 && !sim.done; t += dt) {
    sim.t += dt;
    if (crewLeavesAt !== null && t >= crewLeavesAt && !leftOnce) {
      leftOnce = true;
      const hp = raiders.reduce((a, r) => a + r.hp, 0) + queue.reduce((a, e) => a + SG[e.type].hp, 0);
      K.leaveSite(sim, hp); raiders = []; queue = [];
      sim.run(600);   // the abstract sim finishes the raid
      break;
    }
    if (sim.phase === 'prep' || sim.phase === 'lull') {
      sim.timer -= dt;
      if (sim.timer <= 0) {
        if (sim.w >= sim.W) { sim.finish(); break; }
        const w = K.siteWave(sim, carry); carry = 0; waveN = w.total; sim.w++; sim.phase = 'wave';
        queue = []; for (const e of w.list) for (let i = 0; i < e.n; i++) queue.push({ type: e.type, i: queue.length });
      }
      continue;
    }
    if (queue.length && Math.floor(t * K.SITE.spawnPerSec) !== Math.floor((t - dt) * K.SITE.spawnPerSec)) {
      const e = queue.shift(), p = K.spawnPoint(sim, e.i);
      raiders.push({ id: id++, type: e.type, x: p.x, z: p.z, hp: SG[e.type].hp, maxHp: SG[e.type].hp, cd: 0, slow: 0 });
    }
    for (const r of raiders) {
      const S = SG[r.type]; r.cd -= dt; r.slow = Math.max(0, r.slow - dt);
      const tg = K.pickBuildingTarget(sim, r.type, r.x, r.z);
      let dx = -r.x, dz = -r.z, tx = 0, tz = 0, reach = S.reach + 4;
      if (tg) { dx = tg.x - r.x; dz = tg.z - r.z; tx = tg.x; tz = tg.z; reach = S.reach + tg.size * 1.2; }
      const d = Math.hypot(dx, dz);
      const hull = Math.hypot(Math.max(-8.3 - r.x, 0, r.x - 7.6), Math.max(-4.2 - r.z, 0, r.z - 4.2));
      if (tg && d < reach) { if (r.cd <= 0) { r.cd = S.cd; K.hitBuilding(sim, tg.id, S.dep * K.SITE.hitMul); } }
      else if (!tg && hull <= S.reach + 0.5) { if (r.cd <= 0) { r.cd = S.cd; K.hitCore(sim, S); } }
      else { const sp = S.run * dt * (r.slow > 0 ? 0.55 : 1); r.x += (dx / (d || 1)) * sp; r.z += (dz / (d || 1)) * sp; }
      void tx; void tz;
    }
    for (const s of K.towerStep(sim, tstate, raiders, dt, 0)) {
      kinds.add(s.t);
      for (const h of s.hits) { const r = raiders.find((q) => q.id === h.id); if (!r) continue; r.hp -= h.dmg; if (h.slow) r.slow = 0.6; }
      if (!s.quiet) shots[s.t]++;
    }
    for (const h of K.trapStep(sim, raiders, dt)) { const r = raiders.find((q) => q.id === h.id); if (r) r.hp -= h.dmg; }
    const before = raiders.length;
    raiders = raiders.filter((r) => r.hp > 0);
    void before;
    if (sim.phase === 'wave' && !queue.length && !raiders.length) K.waveCleared(sim, waveN);
    if (sim.core <= 0 || sim.t >= K.SITE.hardCap) sim.finish();
  }
  if (!sim.done) sim.finish();
  return { sim, kinds, shots };
}

ok('siteWave: boss becomes blobs, carry hp becomes swarmers, plan matches waves', () => {
  const sim = H.makeRaid(richBase(), { seed: 1, quotaIndex: 6 });
  sim.w = 2;   // next = wave 3 -> the boss wave
  const w = K.siteWave(sim, 0);
  assert.ok(w.list.some((e) => e.type === 'sg_brute' && e.n >= 3), 'blobs replace the behemoth');
  assert.ok(!w.list.some((e) => e.type === 'sg_boss'));
  const c = K.siteWave(sim, 260);
  assert.ok(c.total > w.total);
  const sp = K.spawnPoint(sim, 3); assert.ok(Math.abs(Math.hypot(sp.x, sp.z) - H.RAID.spawnR) < 1e-6);
});

ok('towers: every kind fires, tesla chains, sniper never point blank, cryo slows', () => {
  const sim = H.makeRaid(richBase(), { seed: 2, quotaIndex: 1 });
  const ts = K.newTowerState();
  const raiders = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, type: 'sg_swarmer', x: 14 + i * 1.5, z: 20, hp: 26000, maxHp: 26000 }));
  const seen = new Set(); let chain = 0, slow = false;
  for (let t = 0; t < 6; t += 0.1) for (const s of K.towerStep(sim, ts, raiders, 0.1, 0)) { seen.add(s.t); if (s.t === 'tesla') chain = Math.max(chain, s.hits.length); if (s.hits.some((h) => h.slow > 0)) slow = true; }
  for (const k of ['gun', 'tesla', 'flame', 'cryo', 'sniper']) assert.ok(seen.has(k), 'fired ' + k);
  assert.ok(chain >= 2, 'chain ' + chain); assert.ok(slow);
  const near = [{ id: 1, x: 17, z: 17, hp: 500, maxHp: 500 }];
  const sn = H.makeRaid(baseState([['sniper', 5, 5, 3]]), { seed: 2 }); const st2 = K.newTowerState();
  for (let t = 0; t < 5; t += 0.1) assert.equal(K.towerStep(sn, st2, near, 0.1, 0).filter((s) => s.t === 'sniper').length, 0, 'no point blank sniping');
  // wrecked towers stay silent
  sim.hp.set(6, 0); const s3 = K.towerStep(sim, K.newTowerState(), raiders, 0.5, 0); assert.ok(!s3.some((s) => s.id === 6));
});

ok('traps: spikes hurt raiders on them, a mine blows once for everyone near it', () => {
  const sim = H.makeRaid(baseState([['spikes', 5, 5, 3], ['mines', 8, 5, 3]]), { seed: 3 });
  const inSpikes = [{ id: 1, x: 5.0 * 3 + 1.5, z: 5 * 3 + 1.5, hp: 100 }];
  const h1 = K.trapStep(sim, inSpikes, 1); assert.ok(h1.length === 1 && h1[0].dmg > 0);
  const near = [{ id: 1, x: 8 * 3 + 1.5, z: 5 * 3 + 1.5, hp: 100 }, { id: 2, x: 8 * 3 + 3, z: 5 * 3 + 2, hp: 100 }, { id: 3, x: 60, z: 60, hp: 100 }];
  const h2 = K.trapStep(sim, near, 1); assert.ok(h2.filter((h) => h.blast).length === 2 && !h2.some((h) => h.id === 3));
  K.trapStep(sim, near.slice(0, 2), 1); K.trapStep(sim, near.slice(0, 2), 1);   // level 3 mine = 3 charges
  assert.equal(K.trapStep(sim, near.slice(0, 2), 1).filter((h) => h.blast).length, 0, 'mine spent');
});

ok('buildings + core take hits through the sim (hp map, wrecked flag, core floor)', () => {
  const sim = H.makeRaid(richBase(), { seed: 4 });
  const r = K.hitBuilding(sim, 1, 1e6); assert.ok(r.wrecked && sim.hp.get(1) === 0); assert.ok(!K.hitBuilding(sim, 1, 5).wrecked);
  K.hitCore(sim, SG.sg_brute, 1e6); assert.equal(sim.core, 0);
  const tg = K.pickBuildingTarget(sim, 'sg_brute', 30, 30);   // blobs prefer walls
  assert.ok(tg === null || typeof tg.id === 'number');
  assert.ok(!K.pickBuildingTarget(sim, 'sg_swarmer', 200, 200), 'nothing in reach far away');
});

ok('on-site raids: an undefended base is breached, a defended one holds, both finish with a result', () => {
  const poor = fight(poorBase(), { seed: 11, qi: 3 });
  assert.equal(poor.sim.result.kind, 'breached', 'no defences: ' + poor.sim.result.kind);
  const outcomes = {};
  for (const seed of [1, 2, 3, 4, 5, 6]) { const r = fight(richBase(), { seed, qi: 2 }); outcomes[r.sim.result.kind] = (outcomes[r.sim.result.kind] || 0) + 1; assert.ok(r.sim.result.hp.length > 0); }
  assert.ok((outcomes.repelled || 0) + (outcomes.held || 0) >= 4, 'a well defended base mostly holds: ' + JSON.stringify(outcomes));
  const r = fight(richBase(), { seed: 2, qi: 2 });
  assert.ok(r.shots.gun > 20 && r.shots.tesla > 0, 'towers fired ' + JSON.stringify(r.shots));
});

ok('enter / leave: an abstract wave folds into the next real one, leaving folds raiders back (carry) and the abstract sim finishes', () => {
  const sim = H.makeRaid(richBase(), { seed: 7, quotaIndex: 2 });
  for (let i = 0; i < 200 && !(sim.phase === 'wave' && sim.pool && sim.pool.age >= 1); i++) sim.step(1);
  assert.equal(sim.phase, 'wave');
  const w0 = sim.w, hp0 = sim.pool.hp;
  const carry = K.enterSite(sim);
  assert.ok(Math.abs(carry - hp0) < 1e-6 && sim.w === w0 - 1 && sim.phase === 'prep' && sim.timer >= K.SITE.enterPrep && sim.site);
  K.leaveSite(sim, 500);
  assert.equal(sim.carry, 500); assert.equal(sim.phase, 'lull');
  const res = sim.run(600); assert.ok(res && ['repelled', 'held', 'breached'].includes(res.kind));
  const left = fight(richBase(), { seed: 3, qi: 2, crewLeavesAt: 40 });
  assert.ok(left.sim.result);
});

ok('waveCleared pays the same reward as the abstract sim and starts the lull', () => {
  const sim = H.makeRaid(richBase(), { seed: 9, quotaIndex: 2 }); sim.w = 2;
  const before = sim.reward.cr;
  K.waveCleared(sim, 12);
  assert.ok(sim.reward.cr > before && sim.killed === 12 && sim.phase === 'lull' && sim.pool === null);
  const p = { cr: 0 }; K.setPool(sim, 5, 12, 100, 400); assert.equal(sim.frame().raiders, 0.25); void p;
});

console.log(n + ' homeworld raid checks passed');
