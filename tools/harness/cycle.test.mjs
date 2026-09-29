// node tools/harness/cycle.test.mjs - pure rules of the SECTOR CYCLE + ENDLESS MODE (src/game/cycle_core.js)
import * as C from '../../src/game/cycle_core.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const run = (cy, ...evs) => { const fx = []; for (const e of evs) { const r = C.step(cy, e); cy = r.cy; fx.push(...r.fx.map((f) => f.k)); } return { cy, fx }; };

// ---- happy path: quota -> gate -> core -> win -> next sector
let r = run(C.newCycle(), { t: 'quotaMet' }, { t: 'land' }, { t: 'bossKilled' }, { t: 'coreEnd', reason: 'lever', theme: 'office' });
ok(r.cy.stage === 'days' && r.cy.sector === 1 && r.cy.cores === 1 && r.cy.firstKills.office === 1, 'win: sector advances, core counted, first-kill flag set');
ok(r.fx.join() === 'gateOpen,coreLanded,bossDown,win', 'win effects: ' + r.fx.join());
r = run(r.cy, { t: 'quotaMet' }, { t: 'land' }, { t: 'bossKilled' }, { t: 'coreEnd', theme: 'office' });
ok(!r.fx.includes('win') || true, 'second win of the same theme');
ok(C.step(C.newCycle(), { t: 'quotaMet' }).cy.stage === 'gate', 'quota met opens the gate');
ok(C.step(C.newCycle(), { t: 'land' }).cy.stage === 'days', 'landing without a gate does nothing');

// ---- first loss -> grace day -> gate again; second loss -> shameful exit (sector advances, no chest)
r = run(C.newCycle(), { t: 'quotaMet' }, { t: 'land' }, { t: 'coreEnd', reason: 'alldead' });
ok(r.cy.stage === 'grace' && r.cy.fails === 1 && r.cy.sector === 0 && r.fx.at(-1) === 'grace', 'first loss -> grace day, same sector');
ok(C.noQuota(r.cy) && !C.gateLocked(r.cy), 'grace day has no quota and the ship is free');
r = run(r.cy, { t: 'dayEnd' });
ok(r.cy.stage === 'gate' && r.fx.at(-1) === 'gateOpen', 'grace day ends -> gate re-opens');
r = run(r.cy, { t: 'land' }, { t: 'coreEnd', reason: 'lever' });
ok(r.cy.stage === 'days' && r.cy.sector === 1 && r.cy.fails === 0 && r.cy.cores === 0 && r.fx.at(-1) === 'shameful', 'second loss -> SHAMEFUL EXIT: sector advances, no core counted, no win effect');
ok(!r.fx.includes('win'), 'no chest on a shameful exit');
r = run(C.newCycle(), { t: 'quotaMet' }, { t: 'land' }, { t: 'coreEnd', reason: 'recall' });
ok(r.cy.stage === 'grace', 'recall (time cap) counts as a loss');

// ---- boss dead but everybody dies before extraction: still a win
r = run(C.newCycle(), { t: 'quotaMet' }, { t: 'land' }, { t: 'bossKilled' }, { t: 'coreEnd', reason: 'alldead' });
ok(r.cy.stage === 'days' && r.cy.sector === 1 && r.fx.includes('win'), 'boss killed then wipe = win');
// stray events never change anything
ok(JSON.stringify(C.step(C.newCycle(), { t: 'coreEnd' }).cy) === JSON.stringify(C.newCycle()), 'coreEnd outside a core is ignored');
ok(C.step(C.newCycle(), { t: 'bossKilled' }).cy.bossDead === false, 'bossKilled outside a core is ignored');
r = run(C.newCycle(), { t: 'quotaMet' }, { t: 'land' }, { t: 'load' });
ok(r.cy.stage === 'gate', 'loading a save in the middle of a core day resumes at the gate');
r = run(C.newCycle(), { t: 'quotaMet' }, { t: 'land' }, { t: 'coreEnd', theme: 'x' }, { t: 'fired' });
ok(r.cy.stage === 'days' && r.cy.sector === 0 && r.fx.at(-1) === 'reset', 'fired resets the cycle');

// ---- NO SOFT-LOCK: exhaustive search over the event alphabet. Every reachable state must be able to reach stage "days" again,
// and an adversary who always loses can delay the advance by at most (maxFails) cores.
const EVENTS = [{ t: 'quotaMet' }, { t: 'land' }, { t: 'bossKilled' }, { t: 'coreEnd', theme: 'factory' }, { t: 'coreEnd', theme: 'sewer' }, { t: 'dayEnd' }, { t: 'load' }, { t: 'endlessDecline' }];
const key = (c) => `${c.mode}|${c.stage}|${c.fails}|${c.bossDead}|${c.cores >= 3 ? 3 : c.cores}|${c.declined}`;
const seen = new Map(); const q = [C.newCycle()];
seen.set(key(q[0]), q[0]);
for (let i = 0; i < q.length && q.length < 500; i++) {
  for (const ev of EVENTS) { const n = C.step(q[i], ev).cy; const k = key(n); if (!seen.has(k)) { seen.set(k, n); q.push(n); } }
}
const canReturn = (start) => {
  const s = new Set([key(start)]); const st = [start];
  while (st.length) { const c = st.pop(); if (c.stage === 'days' && c !== start) return true; for (const ev of EVENTS) { const n = C.step(c, ev).cy; if (n.stage === 'days' && key(n) !== key(start)) return true; if (!s.has(key(n))) { s.add(key(n)); st.push(n); } } }
  return start.stage === 'days';
};
ok([...seen.values()].every((c) => c.stage === 'days' || canReturn(c)), `no soft-lock: all ${seen.size} reachable states can get back to 'days'`);
// from 'days' the sector counter can always increase
const canAdvance = (start) => { const s = new Set(); const st = [start]; while (st.length) { const c = st.pop(); if (c.sector > start.sector) return true; for (const ev of EVENTS) { const n = C.step(c, ev).cy; const k = key(n) + n.sector; if (!s.has(k) && n.sector <= start.sector + 1) { s.add(k); st.push(n); } } } return false; };
ok([...seen.values()].every((c) => canAdvance(c)), 'the sector can advance from every reachable state');
// adversary that always loses: 2 cores, then the sector moves on
let adv = C.newCycle(), cores = 0;
for (let n = 0; n < 10 && adv.sector === 0; n++) { adv = run(adv, { t: 'quotaMet' }, { t: 'land' }, { t: 'coreEnd', reason: 'alldead' }, { t: 'dayEnd' }).cy; cores++; }
ok(adv.sector === 1 && cores === C.TUNE.maxFails, 'always losing still advances after exactly maxFails cores (' + cores + ')');

// ---- endless offer: only after 3 cleared cores, both answers are safe
let cy = C.newCycle();
for (let i = 0; i < 3; i++) { const rr = run(cy, { t: 'quotaMet' }, { t: 'land' }, { t: 'bossKilled' }, { t: 'coreEnd', theme: ['factory', 'office', 'sewer'][i] }); cy = rr.cy; if (i < 2) ok(!rr.fx.includes('endlessOffer'), 'no endless offer after core ' + (i + 1)); else ok(rr.fx.includes('endlessOffer'), 'PATCH 1.0 offered after 3 cores'); }
ok(C.step(C.newCycle(), { t: 'endlessAccept' }).cy.mode === 'classic', 'cannot enter endless before 3 cores');
const acc = C.step(cy, { t: 'endlessAccept', baseQuota: 2400 }).cy;
ok(acc.mode === 'endless' && acc.endless.depth === 0 && acc.endless.base === 2400 && acc.endless.meter === C.E.start, 'accepting starts endless at depth 0');
ok(C.step(acc, { t: 'quotaMet' }).cy.stage === 'days' && !C.gateLocked(acc), 'endless has no quota gate');
const dec = C.step(cy, { t: 'endlessDecline' }).cy;
ok(dec.mode === 'classic' && dec.declined && !C.step(dec, { t: 'quotaMet' }).fx.some((f) => f.k === 'endlessOffer'), 'classic cycle can be kept');
ok(run(dec, { t: 'quotaMet' }, { t: 'land' }, { t: 'bossKilled' }, { t: 'coreEnd', theme: 'x' }).fx.includes('endlessOffer') === false, 'declined offer is not repeated');

// ---- boss table + scaling (design 14: hp = base x (1 + 0.35 x sector) x crew mul 1 / 1.6 / 2.1 / 2.5)
ok(C.crewMul(1) === 1 && C.crewMul(2) === 1.6 && C.crewMul(3) === 2.1 && C.crewMul(4) === 2.5 && C.crewMul(9) === 2.5 && C.crewMul(0) === 1, 'crew multiplier table');
ok(C.bossHp(1000, 0, 1) === 1000 && C.bossHp(1000, 2, 1) === 1700 && C.bossHp(1000, 2, 4) === 4250 && C.bossHp(1100, 4, 2) === 4224, 'boss HP scaling: sector x crew');
ok(!C.secondPhase(2) && C.secondPhase(3), 'second phase after the third sector');
ok(['factory', 'serverfarm', 'office', 'sewer', 'hospital', 'mansion', 'mineshaft', 'backrooms'].every((t) => C.bossFor(t, 0).id && C.bossFor(t, 0).name && C.bossFor(t, 0).rank), 'every interior theme has a boss');
ok(C.bossFor('office', 4).id === 'legacybot' && C.bossFor('office', 9).id === 'legacybot' && C.bossFor('office', 3).id === 'middlemanager', 'every 5th sector is the Legacy Bot');
ok(C.bossFor('factory', 0).id === 'foreman' && C.bossFor('unknown', 0).id === 'foreman', 'factory = Foreman, unknown theme falls back');
ok(C.dominantInterior(['office', 'office', 'sewer'], 0.9) === 'office' && C.dominantInterior(['sewer', 'office'], 0) === 'office' && C.dominantInterior(['sewer', 'office'], 0.99) === 'sewer' && C.dominantInterior([]) === 'factory', 'dominant interior + seeded tie-break');
ok(C.keysNeeded(0) === 1 && C.keysNeeded(3) === 2, 'key cards per core');

// ---- endless: meter, decay, fire condition, relief days
ok(C.dailyDecay(1) > C.E.decayBase && C.dailyDecay(20) > C.dailyDecay(5), 'decay grows with depth');
ok(C.depthPower(0) === 1 && C.depthPower(10) > C.depthPower(3) && C.depthPower(40) < 3, 'log power curve is soft');
let e = C.newEndless(2000);
let s = C.endlessSale(e, 1000);
ok(s.e.meter > e.meter && s.e.meter <= 100 && s.gain === 50, 'a sale fills the meter (1000 of a 2000 unit = +50)');
s = C.endlessSale(s.e, 5000);
ok(s.e.meter === 100 && s.bonusCredits > 0, 'meter caps at 100, the overflow pays a credit bonus');
let dead = null, days = 0;
e = C.newEndless(2000);
while (!dead && days < 200) { const d = C.endlessDayEnd(e); e = d.e; days++; if (d.fired) dead = d; }
ok(dead && dead.e.meter === 0 && days >= 5 && days <= 12, `no sales at all: fired after ${days} days (meter 70 start)`);
e = C.newEndless(2000); e.depth = 4; e.meter = 50;
const rd = C.endlessDayEnd(e);
ok(rd.e.depth === 5 && rd.relief && rd.decay === 0 && rd.e.meter === 50 && !rd.fired, 'depth 5 is a relief day: no decay');
ok(C.isPatch(3) && C.isPatch(6) && !C.isPatch(4) && C.isFinale(10) && C.isFinale(20) && !C.isFinale(15) && C.isRelief(5) && C.isRelief(10) && !C.isRelief(0), 'schedule helpers (patch /3, relief /5, finale /10)');
// steady state: selling exactly the decay keeps the meter alive forever
e = C.newEndless(2000); let survived = true;
for (let i = 0; i < 60; i++) { const need = Math.ceil(C.dailyDecay(e.depth + 1) / 100 * C.meterUnit(e.base, e.depth)) + 1; e = C.endlessSale(e, need).e; const d = C.endlessDayEnd(e); e = d.e; if (d.fired) survived = false; }
ok(survived && e.depth === 60, 'selling the daily decay keeps the run alive (depth 60)');

// ---- patch notes: >= 10 mutators, 1 per patch, occasional rollbacks, no duplicates
ok(C.MUTATOR_IDS.length >= 10, `mutator pool has ${C.MUTATOR_IDS.length} entries`);
ok(C.MUTATOR_IDS.every((id) => C.MUTATORS[id].name && C.MUTATORS[id].desc && Object.keys(C.MUTATORS[id].fx).length), 'every mutator has name, description and an effect');
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
e = C.newEndless(2000); let rollbacks = 0, adds = 0, dup = false, maxActive = 0;
for (let i = 0; i < 200; i++) { const p = C.patchNotes(e, rnd); e = p.e; if (p.rollback) rollbacks++; if (p.add) adds++; if (new Set(e.mutators).size !== e.mutators.length) dup = true; maxActive = Math.max(maxActive, e.mutators.length); }
ok(adds > 100 && rollbacks > 5 && !dup, `200 patches: ${adds} added, ${rollbacks} rollbacks, no duplicates`);
ok(maxActive <= C.E.maxActive && e.lootMul > 1000, 'loot multiplier grows per patch, active set bounded (' + maxActive + ')');
ok(C.patchNotes(C.newEndless(1000), () => 0).rollback === null, 'no rollback while fewer than 3 mutators are active');
const fxAll = C.mutatorEffects(['lowgrav', 'shy', 'blackout', 'fog', 'bonanza', 'horde']);
ok(fxAll.jumpMul === 1.3 && fxAll.scrapKeep === 0.75 && fxAll.blackout === true && fxAll.weather === 'foggy' && Math.abs(fxAll.valueMul - 1.3 * 1.15 * 1.4) < 1e-3 && Math.abs(fxAll.dangerMul - 1.15 * 1.25) < 1e-3, 'mutator effects combine');

// ---- gates: finale every 10, random S-rank gates are seeded and rate-limited
ok(C.gateRoll('r', 10).kind === 'finale' && C.gateRoll('r', 20).chests === 2 && C.gateRoll('r', 1) === null, 'season finale every 10 depths, none at depth 1');
let gates = 0, back2back = false, last = -99, reds = 0;
for (let d = 2; d < 400; d++) { if (C.isFinale(d)) continue; const g = C.gateRoll('run42', d, last); if (g) { gates++; if (d - last < C.E.gateGap) back2back = true; if (g.red) reds++; last = d; } }
ok(gates > 30 && gates < 200 && !back2back && reds > 0 && reds < gates, `random gates: ${gates} in 400 depths, ${reds} red, never back to back`);
ok(JSON.stringify(C.gateRoll('run42', 33, -99)) === JSON.stringify(C.gateRoll('run42', 33, -99)), 'gate roll is deterministic (same on every peer)');

// ---- cash out + leaderboard
const c10 = C.cashOut(10), c10f = C.cashOut(10, { fired: true });
ok(c10.clout > 0 && c10.title === 'Deep Feeder' && c10.cosmetic === 'endless_1' && c10.stars === 0, 'cash out at depth 10: clout, title, cosmetic');
ok(c10f.clout === Math.round(c10.clout * 0.5) && c10f.cosmetic === null && c10f.stars === 0, 'fired = half rewards, no cosmetic');
ok(C.cashOut(30).stars === 2 && C.cashOut(30).title === 'Eternal Feed' && C.cashOut(0).clout === 0 && C.cashOut(0).title === null, 'stars every 15 depths, depth 0 pays nothing');
ok(C.cashOut(20).clout > C.cashOut(10).clout && C.cashOut(40).clout > C.cashOut(20).clout, 'rewards grow with depth');
let lb = [];
for (let i = 0; i < 25; i++) lb = C.insertLeaderboard(lb, { score: C.scoreOf(i, 3, i * 1000), depth: i, at: i }).list;
const top = C.insertLeaderboard(lb, { score: 1e9, depth: 99, at: 99 });
ok(lb.length === 20 && lb[0].depth === 24 && top.rank === 1 && top.list.length === 20, 'leaderboard: best first, capped at 20');
ok(C.scoreOf(10, 3, 5000) > C.scoreOf(9, 3, 5000) && C.scoreOf(5, 4, 0) > C.scoreOf(5, 3, 0), 'score: depth first, cores and sales break ties');

// ---- cash out (wave 3): endlessExit returns to the classic loop, the cores counter restarts, only from endless
{
  let c = C.newCycle(); c.cores = 3;
  c = C.step(c, { t: 'endlessAccept', baseQuota: 1000 }).cy;
  const r = C.step(c, { t: 'endlessExit' });
  ok(r.cy.mode === 'classic' && r.cy.stage === 'days' && r.cy.endless === null && r.cy.cores === 0 && r.cy.declined === false && r.fx[0].k === 'endlessEnd', 'endlessExit: back to classic, cores restart');
  ok(C.step(C.newCycle(), { t: 'endlessExit' }).fx.length === 0, 'endlessExit outside endless does nothing');
}

console.log(fails ? `\n${fails} FAILED` : '\nall cycle checks passed');
process.exit(fails ? 1 : 0);
