// Node test for roledays (src/game/roledays_core.js): assignment for 1-4 players, day/card eligibility, every enforcement predicate, i18n coverage.
//   node tools/harness/roledays.test.mjs
import * as K from '../../src/game/roledays_core.js';
import { I18N } from '../../src/game/roledays_i18n.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const P = (...spec) => spec.map(([id, role]) => ({ id, role: role || null }));

// --- day eligibility
const base = { quotaIndex: 2, difficulty: 'standard', company: false, lastDay: null, day: 5, roll: 0.1 };
ok(K.dayEligible(base), 'quota 2 standard roll<25% is a role day');
ok(!K.dayEligible({ ...base, quotaIndex: 1 }), 'no role day before quota 2');
ok(!K.dayEligible({ ...base, quotaIndex: 0 }), 'no role day in quota 0');
ok(!K.dayEligible({ ...base, difficulty: 'casual' }), 'never on Casual');
ok(!K.dayEligible({ ...base, difficulty: 'CASUAL' }), 'casual is case-insensitive');
ok(K.dayEligible({ ...base, difficulty: 'hard' }), 'hard ok');
ok(K.dayEligible({ ...base, difficulty: undefined }), 'unknown difficulty = standard, ok');
ok(!K.dayEligible({ ...base, company: true }), 'never on the Company moon');
ok(!K.dayEligible({ ...base, roll: 0.25 }) && !K.dayEligible({ ...base, roll: 0.9 }), 'roll >= 25% = normal day');
ok(!K.dayEligible({ ...base, lastDay: 4 }), 'never two days in a row');
ok(!K.dayEligible({ ...base, lastDay: 5 }), 'same day again = cooldown too');
ok(K.dayEligible({ ...base, lastDay: 3 }), 'one normal day between is fine');
{   // ~25% frequency over a long seeded run with the cooldown applied
  let x = 12345, last = null, n = 0; const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let d = 1; d <= 4000; d++) if (K.dayEligible({ ...base, day: d, lastDay: last, roll: rnd() })) { n++; ok(last == null || d - last >= 2, 'spacing'); last = d; }
  ok(n / 4000 > 0.15 && n / 4000 < 0.25, 'frequency ~20% with cooldown: ' + n / 4000);
}

// --- card eligibility by crew size
eq(K.cardsFor(1), ['pacifist', 'foggy', 'lightfoot'], '1 player = solo cards only');
eq(K.cardsFor(2), K.IDS, '2 players = everything');
eq(K.cardsFor(3), ['navigator', 'carrier', 'scout', 'mechanic', 'medic'], '3 players = team cards only');
eq(K.cardsFor(4), ['navigator', 'carrier', 'scout', 'mechanic', 'medic'], '4 players = team cards only');
eq(K.cardsFor(0), [], '0 players = none');
ok(K.IDS.length >= 6 && K.IDS.length <= 8, '6-8 cards');
{ let s = 1; const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let n = 1; n <= 4; n++) for (let i = 0; i < 40; i++) ok(K.cardsFor(n).includes(K.pickCard(n, rnd)), 'pickCard stays eligible n=' + n);
  ok(K.pickCard(2, rnd, 'medic') !== 'medic', 'pickCard avoids the last card');
  ok(K.pickCard(1, rnd, 'foggy') !== 'foggy', 'solo avoid works with 3 cards'); }

// --- assignment for 1-4 players
eq(K.assign('medic', P(['a', 'medic'], ['b', 'hauler']), 3), { card: 'medic', holder: 'a', all: false }, 'medic role holder wins');
eq(K.assign('mechanic', P(['a', 'medic'], ['b', 'technician'], ['c']), 3), { card: 'mechanic', holder: 'b', all: false }, 'technician gets mechanic');
eq(K.assign('navigator', P(['a', 'scout'], ['b', 'occultist']), 0), { card: 'navigator', holder: 'b', all: false }, 'pref order: occultist before scout');
eq(K.assign('navigator', P(['a', 'scout'], ['b']), 0), { card: 'navigator', holder: 'a', all: false }, 'fallback pref role: scout');
eq(K.assign('carrier', P(['a'], ['b']), 4), { card: 'carrier', holder: 'a', all: false }, 'round-robin (2 players, day 4)');
eq(K.assign('carrier', P(['a'], ['b']), 5), { card: 'carrier', holder: 'b', all: false }, 'round-robin (2 players, day 5)');
eq(K.assign('carrier', P(['c'], ['a'], ['b']), 3).holder, 'a', 'round-robin over the SORTED ids (3 players, day 3 -> idx 0)');
eq(K.assign('scout', P(['d'], ['c'], ['b'], ['a']), 6).holder, 'c', 'round-robin (4 players, day 6 -> idx 2)');
eq(K.assign('foggy', P(['a']), 1), { card: 'foggy', holder: null, all: true }, 'solo card applies to all (1 player)');
eq(K.assign('pacifist', P(['a'], ['b']), 1), { card: 'pacifist', holder: null, all: true }, 'solo card applies to all (2 players)');
eq(K.assign('medic', [], 1), null, 'no players = no assignment');
eq(K.assign('nope', P(['a']), 1), null, 'unknown card');
eq(K.assign('medic', P(['a']), -3).holder, 'a', 'negative day is safe');
for (let n = 1; n <= 4; n++) {   // every eligible card always yields exactly one holder among the crew
  const crew = P(...['a', 'b', 'c', 'd'].slice(0, n).map((id) => [id]));
  for (const id of K.cardsFor(n)) { const a = K.assign(id, crew, 7); ok(a && (a.all || crew.some((p) => p.id === a.holder)), `assign ${id} n=${n}`); }
}

// --- enforcement predicates
const nav = { card: 'navigator', holder: 'n', all: false };
ok(!K.canHoldWeapon(nav, 'n') && K.canHoldWeapon(nav, 'x'), 'navigator cannot hold weapons, others can');
ok(K.showCompass(nav, 'n') && !K.showCompass(nav, 'x'), 'only the navigator sees the compass');
ok(!K.canPickup(nav, 'n', { kind: 'weapon' }) && K.canPickup(nav, 'n', { kind: 'scrap' }) && K.canPickup(nav, 'x', { kind: 'weapon' }), 'navigator weapon pickup');
const car = { card: 'carrier', holder: 'c', all: false };
ok(!K.canSpeak(car, 'c') && K.canSpeak(car, 'x'), 'carrier cannot speak');
eq([K.visionFor(car, 'c'), K.visionFor(car, 'x')], ['night', null], 'carrier night vision only');
const sc = { card: 'scout', holder: 's', all: false };
ok(!K.canPickup(sc, 's', { kind: 'scrap' }) && !K.canPickup(sc, 's', { kind: 'big' }) && K.canPickup(sc, 's', { kind: 'tool' }) && K.canPickup(sc, 'x', { kind: 'scrap' }), 'scout scrap rule');
eq([K.speedMulFor(sc, 's'), K.speedMulFor(sc, 'x')], [1.25, 1], 'scout speed');
const mec = { card: 'mechanic', holder: 'm', all: false };
ok(K.canOpenDoor(mec, 'm') && !K.canOpenDoor(mec, 'x'), 'only the mechanic opens doors');
const med = { card: 'medic', holder: 'd', all: false };
eq([K.visionFor(med, 'd'), K.visionFor(med, 'x')], ['blind', null], 'medic half-blind only');
const pac = { card: 'pacifist', holder: null, all: true };
ok(!K.canHoldWeapon(pac, 'a') && !K.canHoldWeapon(pac, 'b') && K.speedMulFor(pac, 'a') === 1.12, 'pacifist: everyone, small speed');
const fog = { card: 'foggy', holder: null, all: true };
eq([K.visionFor(fog, 'a'), K.visionFor(fog, 'b'), K.speedMulFor(fog, 'a')], ['blind', 'blind', 1.12], 'foggy: everyone');
const lf = { card: 'lightfoot', holder: null, all: true };
ok(!K.canPickup(lf, 'a', { kind: 'scrap', hands: 2 }) && K.canPickup(lf, 'a', { kind: 'scrap', hands: 1 }) && K.canPickup(lf, 'a', { kind: 'tool', hands: 2 }) && K.speedMulFor(lf, 'a') === 1.25, 'lightfoot: heavy scrap only');
// no assignment / unknown = everything allowed
for (const a of [null, undefined, { card: 'zzz' }]) ok(K.canHoldWeapon(a, 'a') && K.canPickup(a, 'a', { kind: 'weapon' }) && K.canOpenDoor(a, 'a') && K.canSpeak(a, 'a') && K.showCompass(a, 'a') && K.speedMulFor(a, 'a') === 1 && K.visionFor(a, 'a') === null && K.payFor(a, 'a') === 0, 'no constraint = no limits');

// --- pay
eq([K.payFor(car, 'c'), K.payFor(car, 'x'), K.payFor(pac, 'a')], [70, 35, 40], 'pay: holder full, rest half, solo cards full');
for (const id of K.IDS) ok(K.CARDS[id].coins > 0, 'pays ' + id);

// --- i18n: every English key used by the cards + module strings has TR and RU
const keys = [];
for (const c of Object.values(K.CARDS)) keys.push(c.name, c.line, c.short);
keys.push('ROLE DAY', 'YOU', 'WHOLE CREW', 'Holder: {n}', 'Bonus: +{n} Clout if you finish the day', 'Role day done: +{n} Clout.', 'You cannot hold weapons today.', 'You cannot pick that up today.',
  'Only the Mechanic can do this today.', 'Only the Mechanic', 'You cannot speak today. Ping or emote.', 'Tomorrow, casting call: {@n}. {@l}', 'Role day: {@n}. {@l}', 'Constraint met. The feed adores you. Do not let it go to your head.');
for (const k of keys) ok(I18N.TR[k] && I18N.RU[k], 'TR+RU: ' + k);

if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
console.log('roledays.test OK');
