// Node test of the pure MIRROR DIMENSION logic:  node tools/harness/mirror.test.mjs   (prints PASS or throws)
import assert from 'node:assert/strict';
import { RNG } from '../../src/core/rng.js';
import * as U from '../../src/game/mirror_upgrades.js';
import * as W from '../../src/game/mirror_waves.js';

const R = (seed) => { const r = new RNG(seed); return () => r.next(); };

// ---- upgrade pool
assert.deepEqual(U.UPGRADE_IDS.sort(), ['aura', 'bolt', 'dash', 'dmg', 'lifesteal', 'magnet', 'shards', 'speed']);
for (const u of Object.values(U.UPGRADES)) { assert.ok(u.max >= 3 && u.w > 0); assert.ok(!/[{}]/.test(U.describe(u.id, 2)) && U.describe(u.id, 2).length > 8); }

// ---- rolls: 3 distinct, never maxed, deterministic per seed, weighted
for (let s = 1; s <= 200; s++) {
  const owned = { dmg: 5, dash: 3 };
  const c = U.rollChoices(R(s), owned, 3);
  assert.equal(c.length, 3); assert.equal(new Set(c).size, 3);
  assert.ok(!c.includes('dmg') && !c.includes('dash'));
}
assert.deepEqual(U.rollChoices(R(7), {}, 3), U.rollChoices(R(7), {}, 3));
const allMaxed = Object.fromEntries(U.UPGRADE_IDS.map((id) => [id, U.UPGRADES[id].max]));
assert.deepEqual(U.rollChoices(R(1), allMaxed, 3), []);
assert.equal(U.rollChoices(R(2), { ...allMaxed, dmg: 0, speed: 0 }, 3).length, 2);   // fewer than n available
const seen = {}; for (let s = 1; s <= 600; s++) for (const id of U.rollChoices(R(s), {}, 3)) seen[id] = (seen[id] || 0) + 1;
assert.equal(Object.keys(seen).length, 8);                                      // every upgrade can appear
assert.ok(seen.dmg > seen.lifesteal);                                           // weights matter

// ---- apply + derive
let o = {};
for (let i = 0; i < 9; i++) o = U.applyChoice(o, 'dmg');
assert.equal(o.dmg, 5);                                                         // clamped to max
assert.deepEqual(U.applyChoice({ a: 1 }, 'nope'), { a: 1 });
const d0 = U.derive({});
assert.equal(d0.bolts, 1); assert.equal(d0.shards, 0); assert.equal(d0.aura, null); assert.equal(d0.dash, null); assert.equal(d0.magnet, 3);
const d1 = U.derive({ dmg: 2, bolt: 2, shards: 1, aura: 1, dash: 2, magnet: 1, lifesteal: 2, speed: 3 });
assert.ok(Math.abs(d1.dmgMul - 1.24) < 1e-9); assert.equal(d1.bolts, 3); assert.equal(d1.shards, 2); assert.equal(d1.aura.r, 2.8);
assert.equal(d1.magnet, 5); assert.ok(Math.abs(d1.lifesteal - 0.08) < 1e-9); assert.ok(Math.abs(d1.speedMul - 1.21) < 1e-9);
assert.ok(d1.dash.cd < 5.4 && d1.dash.dist > 6); assert.ok(d1.boltCd < d0.boltCd);

// ---- dimension level
assert.ok(U.xpToNext(1) < U.xpToNext(2) && U.xpToNext(9) > U.xpToNext(5));
const st = U.newProgress();
assert.equal(U.addXp(st, 5), 0);
assert.equal(U.addXp(st, U.xpToNext(1)), 1); assert.equal(st.level, 2);
assert.equal(U.addXp(st, U.xpToNext(2) + U.xpToNext(3)), 2); assert.equal(st.level, 4);
assert.equal(U.addXp(st, 1e6), U.MAX_LEVEL - 4); assert.equal(st.level, U.MAX_LEVEL); assert.equal(U.addXp(st, 999), 0);

// ---- Reflection Meter thresholds
assert.deepEqual([0, 1, 2, 3, 4].map(U.meterThreshold), [60, 135, 220, 315, 420]);
assert.equal(U.meterState(0).k, 0); assert.equal(U.meterState(59).k, 0); assert.equal(U.meterState(60).k, 1); assert.equal(U.meterState(219).k, 2);
assert.ok(Math.abs(U.meterState(30).frac - 0.5) < 1e-9);
assert.deepEqual(U.crossed(50, 70), [0]); assert.deepEqual(U.crossed(0, 240), [0, 1, 2]); assert.deepEqual(U.crossed(61, 100), []);
assert.equal(U.meterReward(0).chest, 'iron'); assert.equal(U.meterReward(2).chest, 'gold'); assert.equal(U.meterReward(5).chest, 'void');
assert.ok(U.meterReward(3).luck > U.meterReward(0).luck && U.meterReward(99).luck <= 0.8 && U.meterReward(0).powerup);
assert.equal(U.bumpTier('rare', () => 0.99, 0.5), 'rare'); assert.equal(U.bumpTier('rare', () => 0.1, 0.5), 'epic'); assert.equal(U.bumpTier('legendary', () => 0, 1), 'legendary');
assert.equal(U.bumpTier('common', () => 0, 0), 'common');

// ---- countdown / overtime escalation
assert.equal(W.MIRROR.LIMIT_S, 180); assert.equal(W.fmtClock(W.timeLeft(0)), '3:00'); assert.equal(W.fmtClock(W.timeLeft(179.2)), '0:01');
assert.equal(W.timeLeft(500), 0);
assert.deepEqual([0, 100, 150, 179.9, 180, 180.1].map(W.timerPhase), ['normal', 'normal', 'warn', 'warn', 'warn', 'overtime']);
assert.deepEqual([0, 180, 180.5, 199.9, 200, 219, 220, 260, 400].map(W.overtimeLevel), [0, 0, 1, 1, 2, 2, 3, 5, 12]);
assert.equal(W.glitchLevel(100), 0); assert.ok(W.glitchLevel(190) < W.glitchLevel(230) && W.glitchLevel(999) === 1);
// waves escalate hard with overtime (every 20 s) and slowly with time inside
const steps = [0, 1, 2, 3, 4, 5].map((ot) => ({ ot, iv: W.spawnInterval(4, ot), g: W.groupSize(4, ot), lv: W.creatureLevel(2, 4, ot), cap: W.activeCap(4, ot) }));
for (let i = 1; i < steps.length; i++) { assert.ok(steps[i].iv <= steps[i - 1].iv); assert.ok(steps[i].g >= steps[i - 1].g); assert.ok(steps[i].lv >= steps[i - 1].lv); assert.ok(steps[i].cap >= steps[i - 1].cap); }
assert.ok(steps[1].lv > steps[0].lv + 1 && steps[3].g > steps[0].g);
assert.ok(W.spawnInterval(99, 99) >= 0.9); assert.ok(W.groupSize(99, 99, 9) <= 7); assert.equal(W.groupSize(0, 0, 0.1), 1);
assert.ok(W.creatureLevel(9, 99, 99) <= 14);
// hard cap 50
for (const [r, ot, p] of [[0, 0, 1], [3, 0, 2], [10, 4, 4], [50, 50, 4]]) assert.ok(W.activeCap(r, ot, p) <= 50);
assert.equal(W.activeCap(50, 50, 4), 50); assert.ok(W.activeCap(0, 0, 1) >= 10 && W.activeCap(3, 0, 1) > W.activeCap(0, 0, 1));
// waves grow with time inside
assert.ok(W.groupSize(W.roundIndex(200), 0) > W.groupSize(W.roundIndex(0), 0)); assert.equal(W.roundIndex(0), 0); assert.equal(W.roundIndex(38), 1); assert.equal(W.roundIndex(115), 3);
// roster unlocks: fodder + ghosts first, fiends from round 1, copies from round 2
let w0 = W.typeWeights(0, 0), w2 = W.typeWeights(2, 0);
assert.ok(w0.zombot > 0 && w0.mr_ghost > 0 && w0.mr_fiend === 0 && w0.mr_copy === 0); assert.ok(W.typeWeights(1, 0).mr_fiend > 0 && w2.mr_copy > 0);
const types = new Set(); for (let s = 1; s <= 300; s++) types.add(W.pickType(R(s), 4, 0)); assert.equal(types.size, 4);
for (let s = 1; s <= 200; s++) assert.notEqual(W.pickType(R(s), 6, 1, { noCopy: true }), 'mr_copy');
assert.equal(W.eliteChance(0), 0); assert.equal(W.eliteChance(1), 0); assert.ok(W.eliteChance(3) > 0 && W.eliteChance(40) <= 0.5);
assert.ok(W.killValue('mr_copy') > W.killValue('mr_ghost') && W.killValue('mr_ghost', true) > W.killValue('mr_ghost') && W.killValue('nonsense') === 5);

// ---- membership filter (host filters targets, CreatureView hidden for outsiders)
assert.equal(W.visibleTo(true, true), true); assert.equal(W.visibleTo(true, false), false); assert.equal(W.visibleTo(false, false), true); assert.equal(W.visibleTo(false, true), false);
assert.equal(W.canTarget(true, false), false); assert.equal(W.canTarget(true, true), true); assert.equal(W.canTarget(false, true), false);
assert.equal(W.showsAsSilhouette(true, false), true); assert.equal(W.showsAsSilhouette(true, true), false); assert.equal(W.showsAsSilhouette(false, false), false);

// ---- death rules: respawn eligibility, wipe (SHATTERED), rescue
const M = (...xs) => xs.map(([id, dead, respawnAt]) => ({ id, dead: !!dead, respawnAt }));
assert.equal(W.wiped([]), false); assert.equal(W.wiped(M(['a', 0])), false); assert.equal(W.wiped(M(['a', 1])), true); assert.equal(W.wiped(M(['a', 1], ['b', 0])), false); assert.equal(W.wiped(M(['a', 1], ['b', 1])), true);
assert.equal(W.respawnEligible(M(['a', 1], ['b', 0]), 'a'), true);         // a crewmate is alive
assert.equal(W.respawnEligible(M(['a', 1], ['b', 1]), 'a'), false);        // everyone dead -> no respawn (wipe)
assert.equal(W.respawnEligible(M(['a', 1]), 'a'), false);                  // alone and dead
assert.equal(W.respawnEligible(M(['a', 0], ['b', 0]), 'a'), false);        // alive players do not respawn
assert.equal(W.respawnEligible(M(['a', 1], ['b', 0]), 'zzz'), false);
assert.deepEqual(W.dueRespawns(M(['a', 1, 100], ['b', 0]), 99), []); assert.deepEqual(W.dueRespawns(M(['a', 1, 100], ['b', 0]), 100), ['a']);
assert.deepEqual(W.dueRespawns(M(['a', 1, 100], ['b', 1, 100]), 500), []);
assert.equal(W.MIRROR.RESPAWN_S, W.MIRROR.ROUND_S); assert.ok(W.MIRROR.RESPAWN_S >= 30 && W.MIRROR.RESPAWN_S <= 45);
assert.deepEqual(W.rescued(M(['a', 0], ['b', 1]), 'a'), ['b']);            // last living walks out -> cracked crewmate is pulled out alive
assert.deepEqual(W.rescued(M(['a', 0], ['b', 0]), 'a'), []); assert.deepEqual(W.rescued(M(['a', 1], ['b', 1]), 'a'), []); assert.deepEqual(W.rescued(M(['a', 0]), 'a'), []);

// ---- portal roll: ~25% of maps, none before sector 1, none at the company
assert.equal(W.hasPortal(0, { id: 'x' }, 0), false); assert.equal(W.hasPortal(1, { company: true }, 0), false); assert.equal(W.hasPortal(1, null, 0), false);
assert.equal(W.hasPortal(1, { id: 'x' }, 0.24), true); assert.equal(W.hasPortal(1, { id: 'x' }, 0.26), false);
let n = 0; const rr = new RNG(99); for (let i = 0; i < 4000; i++) if (W.hasPortal(3, { id: 'm' }, rr.next())) n++;
assert.ok(n > 850 && n < 1150, 'portal rate ' + n / 4000);

console.log('PASS mirror.test.mjs');
