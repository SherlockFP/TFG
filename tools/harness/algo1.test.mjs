// Node test for algo1 (src/game/algo1_core.js): behaviour tracker maths, counter-change selection + caps + quota-0 guard, vote tally / tie / debt rules,
// debt half-strength maths, viewer model.   node tools/harness/algo1.test.mjs
import * as K from '../../src/game/algo1_core.js';
import { MUTATORS } from '../../src/game/cycle_core.js';
import { I18N } from '../../src/game/algo1_i18n.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const near = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: got ${a} want ${b}`);

// --- tracker
eq([K.sideOf(-20), K.sideOf(-7.1), K.sideOf(0), K.sideOf(7), K.sideOf(7.1)], ['L', 'L', 'C', 'C', 'R'], 'sideOf');
{
  const p = K.newProfile();
  for (let i = 0; i < 100; i++) K.track(p, { side: i < 70 ? 'L' : 'C', moving: i % 2 === 0, sprint: i % 4 === 0, dt: 0.5 });
  near(p.routes.L, 35, 'L time'); near(p.routes.C, 15, 'C time'); near(p.moveT, 25, 'moveT'); near(p.sprintT, 12.5, 'sprintT');
  near(K.sprintRatio(p), 0.5, 'sprint ratio');
  eq(K.favouriteRoute(p), { side: 'L', share: 0.7 }, 'fav route');
  K.track(p, { side: null, moving: true, sprint: true, dt: 99 });   // dt clamped, no side
  near(p.moveT, 27, 'dt clamp');
  eq(K.favouriteRoute(K.newProfile()), null, 'no data no route');
  const q = K.newProfile(); q.routes = { L: 20, C: 20, R: 20 };
  eq(K.favouriteRoute(q), null, 'even split = no route (share < 0.5)');
  const s = K.newProfile(); s.routes = { L: 10, C: 5, R: 5 };
  eq(K.favouriteRoute(s), null, 'below min time');
  K.recordDeath(p, 'crawler', 'L'); K.recordDeath(p, 'crawler', 'L'); K.recordDeath(p, 'fall', 'C');
  eq(K.topCause(p), { cause: 'crawler', n: 2 }, 'top cause');
  eq(K.topCause(K.newProfile()), null, 'no cause');
}

// --- counter selection
const allOk = (t) => ({ crawler: 2, lurker: 3, spider: 2, scuttler: 0.5, listener: 1.5 }[t] ?? null);
const opts = (q, x = {}) => ({ quotaIndex: q, spawnable: allOk, hasListener: true, routeType: 'spider', ...x });
const prof = (f) => { const p = K.newProfile(); f(p); return p; };
const routeP = prof((p) => { p.routes = { L: 80, C: 10, R: 10 }; p.moveT = 100; p.sprintT = 10; });
eq(K.chooseCounter(routeP, opts(1)), { kind: 'route', side: 'L', type: 'spider', share: 0.8 }, 'route counter');
eq(K.chooseCounter(routeP, opts(0)), null, 'quota 0 guard (route)');
eq(K.chooseCounter(K.newProfile(), opts(2)), null, 'empty profile');
const sprintP = prof((p) => { p.moveT = 100; p.sprintT = 60; p.routes = { L: 30, C: 30, R: 30 }; });
eq(K.chooseCounter(sprintP, opts(1)).kind, 'sprint', 'sprint-heavy -> noise hunter');
eq(K.chooseCounter(sprintP, opts(1, { hasListener: false })), null, 'no listener registered -> nothing');
const causeP = prof((p) => { K.recordDeath(p, 'crawler', 'L'); K.recordDeath(p, 'crawler', 'R'); p.routes = { L: 90, C: 0, R: 0 }; p.moveT = 100; p.sprintT = 90; });
eq(K.chooseCounter(causeP, opts(3)), { kind: 'cause', type: 'crawler', n: 2 }, 'cause beats sprint and route');
const lurkP = prof((p) => { K.recordDeath(p, 'lurker', 'L'); K.recordDeath(p, 'lurker', 'L'); });
eq(K.chooseCounter(lurkP, opts(3)), null, 'power cap: lurker (3) is never added');
const heavyP = prof((p) => { for (let i = 0; i < 3; i++) K.recordDeath(p, 'lurker', 'L'); });
eq(K.chooseCounter(heavyP, opts(3)).kind, 'mercy', '3 deaths = struggling -> mercy');
const mercyP = prof((p) => { p.near = 3; p.routes = { L: 90, C: 0, R: 0 }; });
eq(K.chooseCounter(mercyP, opts(1)), { kind: 'mercy', dangerMul: 0.9 }, 'near-death mercy');
eq(K.chooseCounter(mercyP, opts(0)), null, 'quota 0 guard (mercy)');
ok(K.chooseCounter(routeP, opts(1, { routeType: 'lurker' })) === null, 'route type over the cap is refused');
ok(K.T.extraPowerCap <= 2 && K.T.mercyDanger >= 0.85, 'caps stay small');

// --- vote
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let q = 0; q < 3; q++) for (let n = 0; n < 40; n++) {
  const c = K.drawCards(rnd, q, 'double');
  ok(c.length === 3 && new Set(c).size === 3, 'three distinct cards');
  ok(!c.includes('double'), 'yesterday debt not re-offered');
  if (q === 0) ok(c.every((id) => K.RULES[id].safe), 'quota 0 = safe cards only');
}
eq(K.tally(new Map([['a', 0], ['b', 1], ['c', 1]]), 3, () => 0.1), { counts: [1, 2, 0], win: 1, tie: false, none: false }, 'clear winner');
{
  const r = K.tally({ a: 0, b: 1 }, 3, () => 0.99);
  ok(r.tie && !r.none && [0, 1].includes(r.win), 'tie flagged, winner among leaders');
  eq(K.tally({ a: 0, b: 1 }, 3, () => 0).win, 0, 'tie rnd low'); eq(K.tally({ a: 0, b: 1 }, 3, () => 0.99).win, 1, 'tie rnd high');
  const n = K.tally({}, 3, () => 0.5);
  ok(n.none && !n.tie && n.win >= 0 && n.win < 3, 'no votes: none, Algorithm picks');
  eq(K.tally({ a: 9, b: -1, c: 1.5 }, 3, () => 0.5).none, true, 'invalid votes ignored');
  eq(K.tally({ a: 1, b: 1, c: 1, d: 0 }, 3).counts, [1, 3, 0], 'counts 4 players');
}
eq(K.pickDebt([3, 2, 0], 0, () => 0), 1, 'debt = runner-up');
eq(K.pickDebt([1, 1, 1], 1, () => 0.99), 2, 'debt tie by rnd');
eq(K.pickDebt([1], 0), null, 'single card no debt');

// --- debt half strength
{
  const full = K.combine([{ id: 'double', k: 1 }]);
  near(full.valueMul, 1.8, 'full value'); near(full.dayLenMul, 0.7, 'full day');
  const half = K.combine([{ id: 'double', k: 0.5 }]);
  near(half.valueMul, 1.4, 'half value'); near(half.dayLenMul, 0.85, 'half day');
  ok(K.combine([{ id: 'lights', k: 1 }]).blackout === true, 'blackout full');
  ok(K.combine([{ id: 'lights', k: 0.5 }]).blackout === false, 'blackout skipped at half strength');
  near(K.combine([{ id: 'double', k: 1 }, { id: 'traffic', k: 0.5 }]).valueMul, +(1.8 * 1.125).toFixed(4), 'winner + debt stack');
  eq(K.combine([]).valueMul, 1, 'no rules');
  ok(K.combine([{ id: 'nope' }]).dangerMul === 1, 'unknown id ignored');
  // rule fx are all known knobs and reuse the same numbers as the endless mutators where they overlap
  const knobs = new Set(['dangerMul', 'valueMul', 'dayLenMul', 'speedMul', 'jumpMul', 'staminaRegen', 'blackout']);
  for (const [id, r] of Object.entries(K.RULES)) ok(Object.keys(r.fx).every((k) => knobs.has(k)), `rule ${id} uses real knobs`);
  near(K.RULES.lowgrav.fx.jumpMul, MUTATORS.lowgrav.fx.jumpMul, 'lowgrav matches mutator');
  near(K.RULES.tired.fx.staminaRegen, MUTATORS.tired.fx.staminaRegen, 'tired matches mutator');
}

// --- viewers
{
  const v = K.newViewers();
  const d = K.addViewers(v, 'escape');
  ok(d >= 25 && v.n === K.VIEW.base + d, 'escape adds viewers');
  ok(K.addViewers(v, 'nope') === 0, 'unknown kind ignored');
  const hi = v.n; K.decayViewers(v, 10);
  ok(v.n < hi && v.n >= K.VIEW.base, 'decays toward base, never below');
  K.decayViewers(v, 1e6); near(v.n, K.VIEW.base, 'settles at base');
  eq([K.fmtViewers(120), K.fmtViewers(1500), K.fmtViewers(23000)], ['120', '1.5K', '23K'], 'format');
}

// --- i18n: every rule name / desc and every line has TR + RU
{
  const keys = [...Object.values(K.RULES).flatMap((r) => [r.name, r.desc]), 'MORNING RULES', 'Vote with 1 / 2 / 3', 'votes',
    'You love the left corridor. I put something there.', 'You love the right wing. I put something there.', 'You never leave the middle. Predictable. I put something there.',
    'You sprint everywhere. Cardio is content. I added something that listens.', 'Deaths to the {@c}: {n}. It received a small raise.',
    'Your numbers are tragic. The feed goes easy on you today. Do not get used to it.', 'The people have spoken: {@r}.', 'A tie. Adorable. I choose: {@r}.',
    'Nobody voted. Fine. I choose: {@r}.', '{@d} goes on your tab: half strength tomorrow.', 'Tab: {@r} (half strength)'];
  for (const k of keys) { ok(I18N.TR[k], 'TR missing: ' + k); ok(I18N.RU[k], 'RU missing: ' + k); }
}

console.log(fails ? `algo1 test: ${fails} FAILED` : 'algo1 test: PASS');
process.exit(fails ? 1 : 0);
