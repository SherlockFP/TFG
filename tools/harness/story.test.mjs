// node tools/harness/story.test.mjs
// Wave 6 STORY: allegiance maths, unlock thresholds, act progression, ending conditions, job offers / judging, trend seed (ISO week).
import * as S from '../../src/game/story_core.js';
import { RNG } from '../../src/core/rng.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const near = (a, b, e = 0.06) => Math.abs(a - b) <= e;

// ---------------------------------------------------------------- allegiance maths
ok(S.applyShift(0, 10) === 10 && S.applyShift(0, -10) === -10, 'from 0 the shift is applied in full');
ok(near(S.applyShift(50, 10), 50 + 10 * (1 - 0.4 * 0.5)), 'pushing away from 0 is scaled: ' + S.applyShift(50, 10));
ok(S.applyShift(50, -10) === 40, 'moving back toward 0 is not scaled');
ok(S.applyShift(-50, -10) === -50 - 8 && S.applyShift(-50, 10) === -40, 'symmetric on the Company side');
ok(S.applyShift(95, 100) <= 100 && S.applyShift(-95, -100) >= -100, 'clamped to +-100');
ok(S.applyShift(NaN, 5) === 5 && S.applyShift(500, 0) === 100, 'garbage repaired');
ok(S.shiftToward(0, 'company', 8) === -8 && S.shiftToward(0, 'algorithm', 8) === 8 && near(S.shiftToward(20, 'company', -5), 24.6), 'shiftToward signs');
ok(S.loyalty(-60, 'company') === 60 && S.loyalty(-60, 'algorithm') === 0 && S.loyalty(30, 'algorithm') === 30, 'loyalty()');
{ let a = 0; for (let i = 0; i < 200; i++) a = S.shiftToward(a, 'algorithm', 8); ok(a > 90 && a <= 100, 'the meter saturates near +100: ' + a); }
{ let a = 0; const steps = []; for (let i = 0; i < 6; i++) { const n = S.shiftToward(a, 'algorithm', 10); steps.push(+(n - a).toFixed(1)); a = n; } ok(steps.every((v, i) => i === 0 || v < steps[i - 1]), 'each step is smaller than the last: ' + steps); }
ok(S.tierOf(-80).tier === 3 && S.tierOf(-80).patron === 'company' && S.tierOf(30).tier === 1 && S.tierOf(0).patron === null && S.tierOf(49.9).tier === 1 && S.tierOf(50).tier === 2, 'tierOf');
ok(S.toneOf(-15) === 'corp' && S.toneOf(15) === 'feed' && S.toneOf(14.9) === 'neutral' && S.toneOf(-14.9) === 'neutral', 'tone bands');
ok(S.shopRep(-40, 'Company loyalty') === 40 && S.shopRep(40, 'Company loyalty') === 0 && S.shopRep(40, 'Algorithm favour') === 40 && S.shopRep(1, 'The Archive') === undefined, 'shop pseudo-factions');

// ---------------------------------------------------------------- unlock thresholds
ok(S.unlockedIds(0).length === 0 && S.unlockedIds(24.9).length === 0, 'nothing below 25');
ok(S.unlockedIds(25).join() === 'al1' && S.unlockedIds(-25).join() === 'co1', 'tier 1 at exactly 25');
ok(S.unlockedIds(-75).join() === 'co1,co2,co3' && S.unlockedIds(100).join() === 'al1,al2,al3', 'tiers stack');
ok(S.crossed(20, 30).map((u) => u.id).join() === 'al1' && S.crossed(30, 80).map((u) => u.id).join() === 'al2,al3' && S.crossed(80, 30).length === 0, 'crossed(): only newly opened');
ok(S.lost(80, 30).map((u) => u.id).join() === 'al2,al3' && S.lost(30, 80).length === 0, 'lost(): only newly closed');
ok(S.UNLOCKS.every((u) => u.shop && u.cosm && u.line && S.AL.tiers.includes(u.at)), 'every unlock has a shop item, a cosmetic and a line');
ok(new Set(S.UNLOCKS.map((u) => u.shop)).size === S.UNLOCKS.length && new Set(S.UNLOCKS.map((u) => u.cosm)).size === S.UNLOCKS.length, 'unlock rewards are distinct');
// creatures
ok(S.creatureRule(60, 'scuttler', 1) === 'pacify' && S.creatureRule(60, 'moderator', 1) === 'hunt' && S.creatureRule(60, 'hound', 1) === null, 'algorithm side: content pacified, company kin hunts');
ok(S.creatureRule(-60, 'moderator', 1) === 'pacify' && S.creatureRule(-60, 'clickbait', 1) === 'hunt', 'company side mirrored');
ok(S.creatureRule(49, 'scuttler', 3) === null && S.creatureRule(90, 'scuttler', 0) === null, 'below 50 or before quota 2: no rule (fair early game)');
ok(S.huntMul(60).detect < S.huntMul(80).detect && S.huntMul(-80).speed === S.huntMul(80).speed, 'hunt strength grows at 75');
// zone counter-attack
{ const yes = { chance: () => true }, no = { chance: () => false };
  ok(S.attackTweak(60, yes, { pend: 1, avail: 2 }) === 'add' && S.attackTweak(60, no, { pend: 1, avail: 2 }) === null, 'algorithm side adds attacks');
  ok(S.attackTweak(-60, yes, { pend: 1, avail: 2 }) === 'cancel' && S.attackTweak(-60, yes, { pend: 0, avail: 2 }) === null, 'company side cancels an existing attack only');
  ok(S.attackTweak(40, yes, { pend: 1, avail: 2 }) === null && S.attackTweak(60, yes, { pend: 1, avail: 0 }) === null && S.attackTweak(60, yes, { pend: 1, avail: 2, quotaOk: false }) === null, 'no effect below 50 / with nothing to add / before the attack quota');
  let n = 0; const r = new RNG(5); for (let i = 0; i < 1000; i++) if (S.attackTweak(80, r, { pend: 1, avail: 2 }) === 'add') n++;
  ok(n > 740 && n < 860, 'strong tier adds ~80 % of the time: ' + n); }

// ---------------------------------------------------------------- acts
ok(S.actOf(0) === 1 && S.actOf(1) === 2 && S.actOf(2) === 2 && S.actOf(3) === 3 && S.actOf(9) === 3, 'act by sector progress');
ok(S.progressOf({ sector: 2 }, 7) === 2 && S.progressOf(null, 4) === 4 && S.progressOf({}, 1) === 1, 'progress falls back to the quota index');
ok(S.beatsDue(1, {}).join() === 'hire' && S.beatsDue(2, { hire: 1 }).join() === 'offer' && S.beatsDue(3, {}).join() === 'hire,offer,choice' && S.beatsDue(3, { hire: 1, offer: 1, choice: 1 }).length === 0, 'beats fire once, oldest first');
{ const s = S.emptyState('r1');
  ok(s.a === 0 && s.act === 1 && s.done.company === 0, 'fresh state');
  ok(S.ensureState(s, 'r1') === s && S.ensureState(s, 'r2') !== s && S.ensureState(s, 'r2').k === 'r2', 'state is per run');
  ok(S.ensureState({ v: 1, k: 'x', a: 'zz', done: null }, 'x').a === 0 && S.ensureState(JSON.parse(JSON.stringify(s)), 'r1').stat.jobs === 0, 'repair + json round trip');
  const m = S.moveState(s, -30);
  ok(m.a1 === -30 && m.opened.map((u) => u.id).join() === 'co1' && s.stat.valley === -30, 'moveState reports what it opened'); }

// ---------------------------------------------------------------- endings
{ const s = S.emptyState('e'); s.act = 3;
  let st = S.endingStatus(s, {});
  ok(!st.company.ok && !st.algorithm.ok && !st.grid.ok && st.grid.hidden, 'nothing available at 0 / 0 and the secret ending is hidden');
  ok(S.canChoose(s, 'company', {}).ok === false && S.canChoose(s, 'nope', {}).ok === false, 'cannot choose without loyalty');
  s.a = -55; s.done.company = 4; st = S.endingStatus(s, {});
  ok(st.company.ok && !st.algorithm.ok, 'company ending: loyalty 40 + 4 jobs');
  s.done.company = 3; ok(!S.endingStatus(s, {}).company.ok, '3 jobs are not enough');
  s.done.company = 4; s.a = -39; ok(!S.endingStatus(s, {}).company.ok, 'loyalty 39 is not enough');
  s.a = 60; s.done.algorithm = 5; ok(S.endingStatus(s, {}).algorithm.ok && S.canChoose(s, 'algorithm', {}).ok, 'algorithm ending');
  s.act = 2; ok(S.canChoose(s, 'algorithm', {}).why === 'The choice opens in Act III.', 'not before Act III');
  s.act = 3; s.ending = 'company'; ok(!S.canChoose(s, 'algorithm', {}).ok, 'only one ending per run'); s.ending = null;
  // off the grid
  const g = S.emptyState('g'); g.act = 3; g.a = 10;
  ok(!S.endingStatus(g, {}).grid.ok, 'grid needs betrayals + a secret');
  g.betrayed.company = 1; g.betrayed.algorithm = 1;
  ok(!S.endingStatus(g, {}).grid.ok && S.endingStatus(g, {}).grid.missing.length === 1 && S.endingStatus(g, {}).grid.hidden, 'grid still needs the secret (egg meta)');
  ok(S.endingStatus(g, { meta: true }).grid.ok && !S.endingStatus(g, { meta: true }).grid.hidden, 'grid: meta-secret + both betrayals + middle');
  ok(S.endingStatus(g, { eggs: 15 }).grid.ok && !S.endingStatus(g, { eggs: 14 }).grid.ok, 'grid: 15 eggs also count');
  g.a = 46; ok(!S.endingStatus(g, { meta: true }).grid.ok, 'grid: too far from the middle');
  g.a = -45; ok(S.endingStatus(g, { meta: true }).grid.ok, 'grid: |a| = 45 is fine');
  g.a = 0; g.betrayed.algorithm = 0; ok(!S.endingStatus(g, { meta: true }).grid.ok, 'grid: must betray BOTH');
  ok(S.canChoose(g, 'grid', {}).why === 'Unknown ending. Options: COMPANY, ALGORITHM', 'the hidden ending does not reveal itself'); }
ok(S.ENDING_IDS.length === 3 && S.ENDINGS.company.title === 'Employee of the Eternity' && S.ENDINGS.algorithm.title === "The Algorithm's Avatar" && S.ENDINGS.grid.title === 'Off the Grid', 'three endings with the required titles');
for (const id of S.ENDING_IDS) {
  const sc = S.finaleScript(id);
  ok(sc[0].k === 'banner' && sc.filter((e) => e.k === 'reward').length === 1 && sc.every((e, i) => i === 0 || e.at >= sc[i - 1].at), 'finale ' + id + ': banner first, one reward, ordered');
  ok(S.finaleLength(id) >= 15 && S.finaleLength(id) <= 30, 'finale length ' + id);
}

// ---------------------------------------------------------------- jobs
ok(S.contractPatron('archive') === 'company' && S.contractPatron('bureau') === 'company' && S.contractPatron('algorithm') === 'algorithm' && S.contractPatron('darkweb') === 'algorithm' && S.contractPatron('x') === null, 'contract faction -> patron');
{ const c1 = { act: 1, qi: 0, quota: 130, crew: 2, gate: false, pend: [] }, c2 = { act: 2, qi: 2, quota: 400, crew: 3, gate: true, pend: [{ m: 'hamsi', z: 'B', name: 'Sector B' }] };
  const o1 = S.makeOffers('r:1', c1), o2 = S.makeOffers('r:1', c1);
  ok(JSON.stringify(o1) === JSON.stringify(o2), 'offers are deterministic');
  ok(o1.length === 1 && o1[0].patron === 'company', 'Act 1: only the Company offers a job: ' + o1.map((o) => o.id));
  const a2 = S.makeOffers('r:2', c2);
  ok(a2.length === 2 && a2[0].patron === 'company' && a2[1].patron === 'algorithm', 'Act 2: one job per patron');
  const seen = new Set(); for (let d = 0; d < 300; d++) for (const o of S.makeOffers('run:' + d, c2)) seen.add(o.id);
  ok(S.JOB_IDS.every((id) => seen.has(id)), 'every job appears with the right context: missing ' + S.JOB_IDS.filter((id) => !seen.has(id)));
  const solo = new Set(); for (let d = 0; d < 200; d++) for (const o of S.makeOffers('s:' + d, { ...c2, crew: 1, gate: false, pend: [] })) solo.add(o.id);
  ok(!solo.has('al_sacrifice') && !solo.has('al_bossfast') && !solo.has('al_feedzone'), 'solo / no gate / no pending attack: those jobs are not offered');
  const pays = S.makeOffers('p:1', c2); ok(pays[1].pay.credits > pays[0].pay.credits * 1.6, `the Algorithm pays far more: ${pays[0].pay.credits} vs ${pays[1].pay.credits}`);
  ok(pays[1].shift > pays[0].shift, 'and asks for more loyalty'); }
{ const ev = { collected: 200, deaths: 0, entered: 2, allDead: false, kills: 3, takeoffMin: 19 * 60, heals: 0, viewersPeak: 55, bossKilled: true, zoneS: (m, z) => (z === 'B' ? 'inf' : 'own') };
  const J = (id, p = {}) => ({ id, p });
  ok(S.judge(J('co_quota', { n: 130 }), ev) && !S.judge(J('co_quota', { n: 300 }), ev), 'co_quota');
  ok(S.judge(J('co_noloss'), ev) && !S.judge(J('co_noloss'), { ...ev, deaths: 1 }) && !S.judge(J('co_noloss'), { ...ev, entered: 0 }), 'co_noloss');
  ok(S.judge(J('co_early', { n: 60 }), ev) && !S.judge(J('co_early', { n: 60 }), { ...ev, takeoffMin: 21 * 60 }), 'co_early');
  ok(S.judge(J('co_report', { n: 3 }), ev) && !S.judge(J('co_report', { n: 4 }), ev), 'co_report');
  ok(S.judge(J('al_sacrifice'), { ...ev, deaths: 1 }) && !S.judge(J('al_sacrifice'), ev) && !S.judge(J('al_sacrifice'), { ...ev, deaths: 2, allDead: true }), 'al_sacrifice: a death but not a wipe');
  ok(S.judge(J('al_bossfast'), ev) && !S.judge(J('al_bossfast'), { ...ev, heals: 1 }) && !S.judge(J('al_bossfast'), { ...ev, bossKilled: false }), 'al_bossfast');
  ok(S.judge(J('al_feedzone', { m: 'hamsi', z: 'B' }), ev) && !S.judge(J('al_feedzone', { m: 'hamsi', z: 'A' }), ev), 'al_feedzone');
  ok(S.judge(J('al_viral', { n: 50 }), ev) && !S.judge(J('al_viral', { n: 60 }), ev), 'al_viral');
  ok(!S.judge(null, ev) && !S.judge(J('nope'), ev), 'unknown job never passes'); }
{ const s = S.emptyState('j'), job = { id: 'al_viral', p: { n: 40 }, pay: { credits: 100, xp: 50 }, shift: 12 };
  let r = S.applyResult(s, job, 'done');
  ok(r.credits === 100 && r.xp === 50 && s.a === 12 && s.done.algorithm === 1 && s.stat.jobs === 1 && !r.betrayed, 'done: pay + shift + counter');
  r = S.applyResult(s, job, 'done', 1.5); ok(r.credits === 150, 'payout multiplier (ending perk)');
  r = S.applyResult(s, job, 'failed'); ok(r.betrayed && s.betrayed.algorithm === 1 && r.credits === 0 && s.a < 12 + 12 * (1 - 0.4 * 0.12) - 1, 'failed: betrayal, nudged to the other side: ' + s.a);
  const before = s.a; S.applyResult(s, job, 'void'); ok(s.a === before && s.betrayed.algorithm === 1, 'void (wipe): nobody is blamed');
  S.applyResult(s, { id: 'co_quota', p: { n: 1 }, pay: { credits: 1, xp: 1 }, shift: 8 }, 'abandoned'); ok(s.betrayed.company === 1, 'abandoning a Company job betrays the Company'); }
{ const s = S.emptyState('c');
  const m = S.applyContract(s, 'archive'); ok(m && s.a === -6 && s.done.company === 1, 'Company contract: -6');
  S.applyContract(s, 'darkweb', 2); ok(s.a > -6 && s.done.algorithm === 1, 'Algorithm chain contract moves toward +');
  ok(S.applyContract(s, 'mystery') === null, 'unknown faction: no move'); }
// full path to an ending in a plausible number of jobs
{ const s = S.emptyState('path'); let n = 0; while (!S.endingStatus(s, {}).algorithm.ok && n < 60) { S.applyResult(s, { id: 'al_viral', p: {}, pay: { credits: 1, xp: 1 }, shift: 12 }, 'done'); n++; }
  ok(n >= 4 && n <= 12, 'Algorithm ending needs a realistic number of jobs: ' + n + ' (a=' + s.a + ')'); }
{ const s = S.emptyState('path2'); let n = 0; while (!S.endingStatus(s, {}).company.ok && n < 60) { S.applyResult(s, { id: 'co_quota', p: {}, pay: { credits: 1, xp: 1 }, shift: 8 }, 'done'); n++; }
  ok(n >= 5 && n <= 12, 'Company ending needs a realistic number of jobs: ' + n + ' (a=' + s.a + ')'); }

// ---------------------------------------------------------------- tone
{ const a = S.toneLine(-30, 'orbit', 'x1'), b = S.toneLine(-30, 'orbit', 'x1');
  ok(a === b, 'tone line deterministic');
  ok(S.toneLine(0, 'orbit', 'x1') === null && S.toneLine(10, 'land', 'y') === null, 'neutral tone is silent');
  let corp = 0, feed = 0, other = 0; for (let i = 0; i < 400; i++) { const c = S.toneLine(-40, 'orbit', 'd' + i), f = S.toneLine(40, 'orbit', 'd' + i); if (c) { corp++; if (!S.TONE.corp.orbit.includes(c)) other++; } if (f) { feed++; if (!S.TONE.feed.orbit.includes(f)) other++; } }
  ok(other === 0 && corp > 200 && corp < 280 && feed > 200 && feed < 280, `about 60 % of days speak: ${corp} / ${feed}`); }

// ---------------------------------------------------------------- trend (ISO week)
ok(S.isoWeekKey(Date.UTC(2026, 8, 29)) === '2026-W40', 'ISO week of 2026-09-29: ' + S.isoWeekKey(Date.UTC(2026, 8, 29)));
ok(S.isoWeekKey(Date.UTC(2026, 0, 1)) === '2026-W01' && S.isoWeekKey(Date.UTC(2021, 0, 3)) === '2020-W53' && S.isoWeekKey(Date.UTC(2024, 11, 30)) === '2025-W01' && S.isoWeekKey(Date.UTC(2023, 0, 1)) === '2022-W52', 'ISO year boundaries');
ok(S.isoWeekKey(Date.UTC(2026, 8, 28, 0, 0, 0)) === S.isoWeekKey(Date.UTC(2026, 9, 4, 23, 59, 59)) && S.isoWeekKey(Date.UTC(2026, 9, 5)) !== S.isoWeekKey(Date.UTC(2026, 9, 4)), 'a week runs Monday 00:00 to Sunday 23:59 UTC');
ok(S.prevWeekKey('2026-W40') === '2026-W39' && S.prevWeekKey('2026-W01') === '2025-W52', 'prevWeekKey: ' + S.prevWeekKey('2026-W01'));
{ const a = S.trendFor('2026-W40'), b = S.trendFor('2026-W40');
  ok(JSON.stringify(a) === JSON.stringify(b) && S.TREND_POOL.includes(a.type), 'trend is deterministic and from the pool');
  const seen = new Set(); let repeats = 0, prev = null;
  for (let w = 1; w <= 52; w++) { const t = S.trendFor(`2026-W${String(w).padStart(2, '0')}`); seen.add(t.type); if (prev && prev === t.type) repeats++; prev = t.type; }
  ok(repeats === 0, 'never the same creature two weeks running');
  ok(seen.size >= 8, 'the year covers many creature types: ' + seen.size);
  ok(a.extraChance >= S.TREND.extraChance && a.extraChance <= S.TREND.extraChance + 0.15 + 1e-9 && a.levelBonus === 1 && a.dropMul > 1 && a.hashtag === '#' + a.type, 'trend numbers');
  ok(S.trendFor('2026-W40', ['only']).type === 'only' && S.trendFor('2026-W40', []) === null, 'single / empty pool'); }

console.log(`story core: ${checks - fails}/${checks} checks passed`);
if (fails) { console.error(fails + ' FAILED'); process.exit(1); }
