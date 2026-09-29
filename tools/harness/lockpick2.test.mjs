// [lockpick2] node test: tier mapping, window maths per skill level, XP curve, break rules, timers, algorithm shuffle, drill / bypasser, co-op speed-up + host book.
// Run: node tools/harness/lockpick2.test.mjs
import assert from 'node:assert/strict';
import * as L from '../../src/game/lockpick2_core.js';
import { RNG } from '../../src/core/rng.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const near = (a, b, e, m) => { assert.ok(Math.abs(a - b) <= e, `${m}: ${a} vs ${b}`); n++; };

// ---- tier mapping (chests / cages / doors)
eq(L.TIER_IDS.map((t) => L.TIERS[t].pins), [1, 2, 3, 4, 4], 'pins 1-2-3-4-4');
ok(L.TIERS.vault.timer > 0 && L.TIERS.algorithm.timer > 0 && !L.TIERS.security.timer, 'vault + algorithm have timers');
ok(L.TIERS.algorithm.shuffle > 0 && !L.TIERS.vault.shuffle, 'only the algorithm lock shuffles');
eq(['wood', 'iron', 'gold', 'void'].map((c) => L.CHEST_TIER[c]), ['simple', 'standard', 'security', 'vault'], 'chest tiers');
eq([0.45, 0.62, 0.8, 1.0].map((d) => L.tierOfDifficulty(d)), ['standard', 'security', 'vault', 'algorithm'], 'chest difficulty (+pry) -> tier');
eq([0, 1, 2, 3, 4, 5, 6, 7, 9].map(L.tierForCage), ['simple', 'simple', 'standard', 'standard', 'security', 'security', 'vault', 'algorithm', 'algorithm'], 'cage tier by quota');
eq([0, 1, 1.5, 2, 4].map(L.tierForDoor), ['simple', 'simple', 'simple', 'standard', 'standard'], 'doors: simple on tier-1 moons (early game easy)');
eq(L.tierOfDifficulty(undefined), 'standard', 'unknown difficulty -> standard');
for (let i = 1; i < 5; i++) ok(L.TIERS[L.TIER_IDS[i]].win <= L.TIERS[L.TIER_IDS[i - 1]].win && L.TIERS[L.TIER_IDS[i]].speed >= L.TIERS[L.TIER_IDS[i - 1]].speed, 'harder = narrower + faster');

// ---- XP curve
eq([1, 2, 3, 4, 5, 10].map(L.xpForLevel), [0, 12, 39, 78, 127, 503], 'xp thresholds');
eq([0, 11, 12, 38, 39, 502, 503, 99999].map(L.levelOfXp), [1, 1, 2, 2, 3, 9, 10, 10], 'level of xp (cap 10)');
ok(L.xpForLevel(2) <= L.TIERS.simple.xp * 2, 'level 2 after two Simple locks (early game feels fast)');
const prof = {};
let r = L.awardXp(prof, 'simple', 'lockpick'); ok(r.gained === 8 && r.level === 1 && !r.levelUp, 'first simple lock: 8 xp');
r = L.awardXp(prof, 'simple', 'lockpick'); ok(r.level === 2 && r.levelUp && prof.lockpick2.opened === 2, 'second one levels up, counter kept in profile.lockpick2');
ok(L.xpGain('vault', 'sl_drill') < L.xpGain('vault', 'lockpick') && L.xpGain('vault', 'lp2_bypass') < L.xpGain('vault', 'lockpick'), 'drill / bypasser teach less');
eq(L.ensureSkill({ lockpick2: { xp: -5, opened: 'x' } }), { xp: 0, opened: 0 }, 'corrupt save repaired');

// ---- perks + window maths per level
const P = (l) => L.perksAt(l);
eq([1, 2, 3, 5, 7, 10].map((l) => [P(l).autoSeat, P(l).silent, P(l).oneClick]), [[0, false, false], [0, false, false], [1, false, false], [1, true, false], [1, true, true], [1, true, true]], 'perk order: window > auto-seat > silent > one-click');
let prev = 0;
for (let l = 1; l <= 10; l++) { const w = L.windowWidth('security', l); ok(w > prev, 'window widens every level'); prev = w; }
near(L.windowWidth('simple', 1), 0.30, 1e-9, 'simple L1 window');
near(L.windowWidth('simple', 10), 0.30 * 1.45, 1e-9, 'simple L10 window x1.45');
ok(L.windowWidth('algorithm', 1) < L.windowWidth('simple', 1), 'harder lock, smaller window');
ok(L.windowWidth('simple', 10, 'lp2_bypass', 2) <= 0.62, 'window capped');
ok(L.windowWidth('vault', 1, 'lp2_titanium') > L.windowWidth('vault', 1, 'lockpick'), 'titanium wider');
near(L.windowWidth('security', 1, 'lockpick', 1), L.windowWidth('security', 1) * 1.15, 1e-9, 'helper +15 % window');
eq([1, 3, 4, 8, 9].map((l) => L.maxWrong('simple', l)), [4, 4, 4, 5, 6], 'wrong-click allowance grows slowly with level');
eq([L.maxWrong('security', 1, 'lockpick'), L.maxWrong('security', 1, 'lp2_titanium')], [3, 4], 'titanium forgives one more');

// ---- ideal time: Simple ~1.5 s when played well
const it = L.idealTime('simple', 1);
ok(it >= 1.0 && it <= 1.6, `simple lock ~1.5 s at level 1 (got ${it.toFixed(2)})`);
ok(L.idealTime('simple', 7) < it && L.idealTime('simple', 7) < 1, 'one-click perk: under a second');
const times = L.TIER_IDS.map((t) => L.idealTime(t, 1)); for (let i = 1; i < 5; i++) ok(times[i] > times[i - 1], 'higher tier takes longer');
ok(L.idealTime('security', 5) < L.idealTime('security', 1), 'skill speeds it up (auto-seat)');
ok(L.idealTime('vault', 1, 'sl_drill') < 3 && L.idealTime('vault', 1, 'sl_drill') < L.idealTime('vault', 1, 'lockpick'), 'drill is the fastest');
ok(L.idealTime('standard', 1, 'lockpick', 1) < L.idealTime('standard', 1), 'co-op speed-up (standard)');
ok(L.idealTime('vault', 1, 'lockpick', 2) < L.idealTime('vault', 1, 'lockpick', 1) && L.idealTime('vault', 1, 'lockpick', 1) < L.idealTime('vault', 1), 'each helper is faster');
eq([L.pinsToPlay('security', 1, 0), L.pinsToPlay('security', 3, 0), L.pinsToPlay('security', 3, 2), L.pinsToPlay('simple', 10, 2), L.pinsToPlay('vault', 3, 2)], [3, 2, 1, 1, 1], 'pins left to click (never 0)');

// ---- noise
ok(L.pinNoise('lockpick', 1) > 0 && L.pinNoise('lockpick', 4) > 0, 'picking is quiet but audible before level 5');
eq([L.pinNoise('lockpick', 5), L.pinNoise('lp2_titanium', 6)], [0, 0], 'silent picking perk (level 5)');
ok(L.burstNoise('lp2_bypass') >= 1 && L.pinNoise('lp2_bypass', 10) === 0, 'bypasser burst is loud and the perk does not hide it');
ok(L.burstNoise('sl_drill') > L.burstNoise('lp2_bypass') && L.burstNoise('sl_drill') >= 2.5, 'drill is the loudest (big event -> Listener comes)');
ok(L.isPickType('lockpick') && L.isPickType('sl_drill') && !L.isPickType('crowbar') && !L.CAGE_PICKS.includes('sl_drill'), 'pick types');

// ---- LockState: clicks, wrong, break
const rng = (s) => new RNG(s);
const R = (s) => { const g = rng(s); return () => g.next(); };
function seek(st, want = true) {   // advance time until the marker is (not) in the window
  for (let i = 0; i < 4000 && st.inWindow() !== want; i++) st.tick(0.005);
  return st.inWindow() === want;
}
let st = new L.LockState({ tier: 'simple', level: 1, rng: () => 0.42 });
ok(seek(st, true), 'marker reaches the window'); r = st.click(); ok(r.hit && r.opened && st.opened && st.done, 'simple: one good click opens');
st = new L.LockState({ tier: 'simple', level: 7, rng: () => 0.9 }); r = st.click(); ok(r.hit && st.opened, 'one-click perk: opens at any timing');
st = new L.LockState({ tier: 'security', level: 1, rng: R(5) });
ok(seek(st) && st.click().hit && !st.done && st.remaining === 2, 'security: pin 1 of 3');
ok(seek(st) && st.click().hit && st.remaining === 1, 'pin 2');
ok(seek(st, false), 'find a miss'); r = st.click();
ok(!r.hit && r.dropped >= 0 && st.remaining === 2 && st.wrong === 1, 'wrong click drops ONLY the last seated pin');
ok(st.stack.length === 1 && st.seated.filter(Boolean).length === 1, 'the earlier pin stays');
st.tick(0.05); r = st.click(); ok(r.locked && st.wrong === 1, 'lock-out after a miss (no click spam)');
for (let i = 0; i < 20 && !st.done; i++) { st.tick(0.3); if (seek(st, false)) st.click(); }
ok(st.done && st.broken && !st.opened && st.wrong === st.maxWrong, 'too many wrong clicks break the pick');
st = new L.LockState({ tier: 'simple', level: 1, rng: R(9) }); seek(st, false); r = st.click(); ok(!r.hit && r.dropped === -1 && !st.done, 'a miss on the first pin drops nothing (early game forgiving)');
// auto-seat perk + co-op
st = new L.LockState({ tier: 'security', level: 3, rng: R(3) }); ok(st.remaining === 2 && st.held.filter(Boolean).length === 1, 'level 3: one pin auto-seated');
st = new L.LockState({ tier: 'standard', level: 3, helpers: 2, rng: R(3) }); ok(st.remaining === 1, 'never seats the last pin by itself (standard + perk + 2 helpers)');
st = new L.LockState({ tier: 'vault', level: 1, rng: R(3) }); const w0 = st.width; st.setHelpers(1);
ok(st.remaining === 3 && st.width > w0, 'a helper joining mid-lock holds a pin and widens the window');
st.setHelpers(2); ok(st.remaining === 2, 'second helper holds another'); st.setHelpers(0); ok(st.remaining === 2, 'held pins are not released by a wobbling connection');
st = new L.LockState({ tier: 'simple', level: 1, helpers: 2, rng: R(3) }); ok(st.remaining === 1 && st.width > L.windowWidth('simple', 1), 'simple lock: helpers only widen');
// simulated play time with a "good player" bot: co-op faster
function botTime(tier, level, tool, helpers, seed) {
  const s = new L.LockState({ tier, level, tool, helpers, rng: R(seed) }); let t = 0;
  while (!s.done && t < 60) { s.tick(0.01); t += 0.01; if (s.inWindow() && s.lockout <= 0 && t > 0.3) s.click(); }
  return { t, s };
}
let a = 0, b = 0; for (let k = 0; k < 40; k++) { a += botTime('security', 1, 'lockpick', 0, 100 + k).t; b += botTime('security', 1, 'lockpick', 1, 100 + k).t; }
ok(b < a, `co-op bot faster (${(b / 40).toFixed(2)} vs ${(a / 40).toFixed(2)} s)`);
let sm = 0; for (let k = 0; k < 40; k++) sm += botTime('simple', 1, 'lockpick', 0, 200 + k).t; ok(sm / 40 < 1.2, `simple, bot: ${(sm / 40).toFixed(2)} s`);
// timers
st = new L.LockState({ tier: 'vault', level: 1, rng: R(1) }); ok(st.timer === 11, 'vault timer');
for (let i = 0; i < 300 && !st.done; i++) st.tick(0.05);
ok(st.done && st.timedOut && !st.opened, 'vault times out');
st = new L.LockState({ tier: 'vault', level: 1, tool: 'lp2_bypass', rng: R(1) }); ok(st.timer === 0, 'bypasser skips the vault timer'); for (let i = 0; i < 400; i++) st.tick(0.05); ok(!st.done, 'no timeout with the bypasser');
// algorithm lock: order shuffles
st = new L.LockState({ tier: 'algorithm', level: 1, rng: R(11) }); const o0 = st.order.join();
let shuffles = 0; const orders = new Set([o0]); for (let i = 0; i < 200 && !st.done; i++) { const r2 = st.tick(0.1); if (r2.shuffled) { shuffles++; orders.add(st.order.join()); } if (st.timeLeft < 0.2) break; }
ok(shuffles >= 3 && orders.size > 1, `algorithm lock reshuffles the pin order (${shuffles} shuffles, ${orders.size} orders)`);
st = new L.LockState({ tier: 'algorithm', level: 1, rng: R(12) }); seek(st, false); st.click(); ok(st.order.length === 4 && new Set(st.order).size === 4, 'wrong click reshuffles (order stays a permutation)');
// drill autoplay
st = new L.LockState({ tier: 'vault', level: 1, tool: 'sl_drill', rng: R(2) }); const run = L.autoRun(st);
ok(run.events.length === 4 && run.total < 3, `drill opens a vault lock in ${run.total} s`);
ok(L.autoRun(new L.LockState({ tier: 'simple', tool: 'sl_drill' })).total < 1.2, 'drill: simple lock about a second');

// ---- co-op host book
const c = new L.Coop();
const s1 = c.start('A', [10, 0, 10], 'security', 0);
ok(s1 && c.list(0).length === 1, 'session started');
ok(!c.help('A', s1.id, [10, 0, 10], 0.1), 'cannot help your own lock');
ok(!c.help('B', s1.id, [30, 0, 10], 0.1), 'out of reach');
ok(c.help('B', s1.id, [11, 0, 11], 0.1) && c.list(0.2)[0].h === 1, 'B holds the pins');
ok(c.help('C', s1.id, [9, 0, 10], 0.2) && c.list(0.3)[0].h === 2, 'C too');
ok(!c.help('D', s1.id, [9, 0, 10], 0.3), 'max 2 helpers');
ok(c.help('B', s1.id, [11, 0, 11], 0.5), 'renew');
ok(c.sweep(1.6) && c.list(1.6)[0].h === 1, 'C expired (not renewed), B still there');
ok(c.sweep(3) && c.list(3)[0].h === 0, 'nobody holds pins any more');
ok(!c.help('B', 'nope', [10, 0, 10], 3), 'unknown session');
c.start('A', [50, 0, 50], 'simple', 4); ok(c.list(4).length === 1 && c.list(4)[0].tier === 'simple', 'a picker has ONE session');
ok(c.start('A', [0, 0, 0], 'bogus', 5) === null, 'bad tier refused');
c.end('A'); ok(c.list(5).length === 0, 'end');
ok(c.sweep(200) === false, 'nothing to sweep');
console.log(`lockpick2.test: ${n} checks OK`);
