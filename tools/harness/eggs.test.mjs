// [eggs] node test: seeded placement, profile persistence / repair, meta-secret chain, knock / lamp / poster / phone rules, text tables.
// Run: node tools/harness/eggs.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/eggs_core.js';
import { TEXT } from '../../src/game/eggs_text.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ---- placement: deterministic, valid, rare, sane
const outdoor = (rng) => { const x = rng.float(-100, 100), z = rng.float(-100, 100); return Math.abs(x) < 8 && Math.abs(z) < 8 ? null : { x, y: 2, z }; };
const facility = Array.from({ length: 30 }, (_, i) => ({ x: (i % 6) * 9, y: 0, z: Math.floor(i / 6) * 9, room: i, dist: i, sealed: i % 7 === 0 }));
const plan = (seed, moonId = 'hamsi', extra = {}) => C.planEggs({ seed, moonId, tier: 1, outdoor, facility, ...extra });
eq(plan(1234), plan(1234), 'same seed -> same plan (every peer agrees)');
ok(JSON.stringify(plan(1234)) !== JSON.stringify(plan(1235)) || JSON.stringify(plan(1234)) !== JSON.stringify(plan(99)), 'different seeds differ');
let total = 0, withAny = 0, ducks = 0, maxN = 0; const seen = new Set();
const N = 600;
for (let s = 1; s <= N; s++) {
  const p = plan(s * 7919);
  total += p.length; if (p.length) withAny++; maxN = Math.max(maxN, p.length);
  const kinds = p.filter((e) => e.kind !== 'duck').map((e) => e.kind);
  eq(new Set(kinds).size, kinds.length, 'no duplicate kind per map');
  for (const e of p) {
    seen.add(e.kind); if (e.kind === 'duck') ducks++;
    ok(e.kind === 'duck' || C.KINDS[e.kind].where.includes(e.where), `kind ${e.kind} allowed ${e.where}`);
    ok(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z) && Number.isFinite(e.yaw), 'finite coords');
  }
  const ids = p.map((e) => e.id); eq(new Set(ids).size, ids.length, 'unique ids');
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) ok(Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z) > 5, 'eggs are spread out');
}
ok(total / N > 0.6 && total / N < 3.2, `average eggs per map is "rare" (${(total / N).toFixed(2)})`);
ok(withAny / N < 0.95 && withAny / N > 0.4, `not every map has an egg (${(withAny / N).toFixed(2)})`);
ok(maxN <= 7, 'bounded count');
ok(ducks / N > 0.15 && ducks / N < 0.6, `ducks about 1 in 3 maps (${(ducks / N).toFixed(2)})`);
for (const k of Object.keys(C.KINDS)) ok(seen.has(k), 'kind appears: ' + k);
ok(seen.has('duck'), 'duck appears');
eq(C.planEggs({ seed: 5, moonId: 'x', tier: 1, outdoor: null, facility: null }), [], 'no surface, no facility -> nothing');
eq(C.planEggs({ seed: 5, moonId: 'x', tier: 1, outdoor: () => null, facility: [] }), [], 'sampler that always fails is fine');
// facility-only / outdoor-only maps only ever use their own kinds
for (let s = 1; s <= 200; s++) {
  for (const e of C.planEggs({ seed: s, moonId: 'a', tier: 2, outdoor: null, facility })) ok(e.where === 'facility', 'facility only');
  for (const e of C.planEggs({ seed: s, moonId: 'a', tier: 2, outdoor, facility: null })) ok(e.where === 'outdoor' && e.kind !== 'vending', 'outdoor only, vending machines stay indoors');
}
ok(C.graffitiVariant(10) === C.graffitiVariant(10) && C.graffitiVariant(10) < 8 && C.diaryVariant(10) < 6, 'variant stable + in range');

// ---- profile persistence (JSON round trip = localStorage) + repair
const P = { name: 'T' };
const e0 = C.ensureEggs(P);
eq(e0.found, {}); eq(e0.n, { mug: 0, duck: 0, call: 0 }); eq(C.foundCount(P), 0);
ok(C.discover(P, 'cassette') && !C.discover(P, 'cassette'), 'discover once');
ok(!C.discover(P, 'nonsense'), 'unknown ids rejected');
eq(C.bump(P, 'duck', 2), 2); eq(C.bump(P, 'nope'), 0);
C.setFlag(P, 'panel'); ok(C.flag(P, 'panel'), 'flag');
const P2 = JSON.parse(JSON.stringify(P));
eq(C.ensureEggs(P2), C.ensureEggs(P), 'survives a JSON round trip');
ok(C.has(P2, 'cassette') && C.foundCount(P2) === 1 && C.ensureEggs(P2).n.duck === 2, 'values kept');
for (const bad of [{}, { eggs: 5 }, { eggs: 'lol' }, { eggs: [] }, { eggs: { found: 7, n: { mug: 'a', duck: -5 }, flags: { '!!': 1, ok_1: 1 } } }, { eggs: { found: { cassette: 1, evil: 1 }, n: { mug: 1e99 } } }]) {
  const r = C.ensureEggs(bad);
  ok(r && typeof r.found === 'object' && Object.values(r.n).every((v) => Number.isInteger(v) && v >= 0), 'garbage repaired: ' + JSON.stringify(bad));
  ok(!('evil' in r.found) && !('!!' in r.flags), 'unknown keys dropped');
}
eq(C.ensureEggs(null), null, 'null profile is safe'); eq(C.discover(null, 'mug'), false);
ok(C.TOTAL_EGGS === 10 + 8 + 1 && C.ALL_EGGS.includes(C.META_ID), 'catalog size');

// ---- meta-secret chain
const M = {};
ok(!C.metaReady(M), 'nothing done');
eq(C.claimMeta(M).missing, ['tape', 'code', 'diary', 'statue', 'ducks'], 'all steps missing at first');
C.discover(M, 'cassette'); C.discover(M, 'crt'); C.discover(M, 'diary'); C.discover(M, 'statue');
eq(C.claimMeta(M).missing, ['ducks'], 'ducks missing'); ok(!C.has(M, C.META_ID) && !M.title, 'nothing granted early');
C.bump(M, 'duck', 2); ok(!C.metaReady(M), 'two ducks are not enough');
C.bump(M, 'duck'); ok(C.metaReady(M), 'three ducks complete the chain');
const r1 = C.claimMeta(M);
ok(r1.ok && r1.isNew && C.has(M, C.META_ID) && M.eggs.meta === 1, 'claimed');
ok(M.titles.includes(C.META_TITLE) && M.title === C.META_TITLE && M.cosmetics.hats.includes(C.META_HAT), 'title + hat granted');
const r2 = C.claimMeta(M);
ok(r2.ok && !r2.isNew && M.titles.filter((t) => t === C.META_TITLE).length === 1 && M.cosmetics.hats.filter((h) => h === C.META_HAT).length === 1, 'idempotent');
const T = { title: 'Rookie', cosmetics: { suits: ['orange'], hats: ['none'] }, titles: ['Rookie'], eggs: { found: { cassette: 1, crt: 1, diary: 1, statue: 1 }, n: { duck: 3 } } };
C.claimMeta(T); ok(T.title === 'Rookie', 'an equipped title is never replaced'); ok(T.titles.length === 2, 'but the new title is owned');

// ---- knock / lamp / poster / phone / mug rules
const knock = (gaps) => { const k = new C.KnockMatcher(); let t = 10, hit = false; for (const g of gaps) { t += g; hit = k.push(t) || hit; } return hit; };
ok(knock([0, 0.3, 0.3, 1.0, 0.3]), 'knock rhythm tap-tap-tap ... tap-tap matches');
ok(!knock([0, 0.3, 0.3, 0.3, 0.3, 0.3]), 'five even knocks do not');
ok(!knock([0, 0.3, 0.3, 2.5, 0.3, 0.3]), 'a pause over 1.6 s restarts the pattern');
ok(knock([0, 0.3, 0.3, 0.3, 0.3, 0.3, 1.0, 0.3]), 'leading spam then the rhythm still matches');
const LB = new C.ClickBurst();
ok(!LB.push(0) && !LB.push(0.5) && !LB.push(1) && !LB.push(1.5) && LB.push(2), 'lamp x5 in 4 s');
const LB2 = new C.ClickBurst(); let l2 = false; for (let i = 0; i < 8; i++) l2 = LB2.push(i * 2) || l2; ok(!l2, 'slow toggling never triggers');
eq([0, 4.9, 5, 24.9, 25].map(C.posterFrame), [0, 0, 1, 4, 0], 'poster frames rotate every 5 s over 5 frames');
ok(C.posterFrame(15) === C.POSTER_SECRET, 'the WANTED frame exists on the cycle');
eq([9, 10, 25, 50, 51].map(C.mugMilestone), [0, 10, 25, 50, 0], 'mug milestones');
ok(!C.phoneSpecial(0, () => 0) && !C.phoneSpecial(1, () => 0) && C.phoneSpecial(2, () => 0.9), 'phone: the third call is special');
ok(C.phoneSpecial(5, () => 0.1) && !C.phoneSpecial(5, () => 0.5), 'phone: later calls 1 in 8');
eq(C.PIANO_TUNE.pcs.length, 8, 'piano tune');

// ---- shrine tiers / vending
eq([0, 29, 30, 89, 90, 500].map((v) => C.shrineTier(v).id), ['egg_bless1', 'egg_bless1', 'egg_bless2', 'egg_bless2', 'egg_bless3', 'egg_bless3'], 'offering value -> blessing tier');
ok(C.SHRINE_TIERS.every((s) => s.sec <= 300 && s.speed <= 0.2 && s.armor <= 0.1), 'blessings are short and small');
eq(C.vendingItem(4, ['a', 'b', 'c']), C.vendingItem(4, ['a', 'b', 'c']), 'vending item is seeded'); eq(C.vendingItem(4, []), null);

// ---- text table: every row has EN + TR + RU, placeholders survive
const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
for (const [id, v] of Object.entries(TEXT)) {
  ok(Array.isArray(v) && v.length === 3 && v.every((s) => typeof s === 'string' && s.length), 'row ' + id);
  ok(ph(v[0]) === ph(v[1]) && ph(v[0]) === ph(v[2]), 'placeholders match in ' + id);
}
for (const id of C.ALL_EGGS) ok(TEXT['n.' + id], 'egg name: ' + id);
for (let i = 0; i < 8; i++) ok(TEXT['g.' + i], 'graffiti ' + i);
for (let i = 0; i < 6; i++) ok(TEXT['d.' + i], 'diary ' + i);
console.log('eggs.test OK (' + n + ' checks)');
