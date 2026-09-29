// daily module (wave 4) node test: login streak / grace / reset across dates, seeded challenge equality, clock tamper guard,
// crates, season track, stash delivery rules.   Run: node tools/harness/daily.test.mjs
import assert from 'node:assert/strict';
import * as D from '../../src/game/daily_core.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();   // local wall clock
const prof = (id = 'p1') => ({ id, level: 5, coins: 0, titles: [], cosmetics: { suits: [], hats: [] } });

// ---- dates
eq(D.dateKey(at(2026, 9, 29, 23)), '2026-09-29');
eq(D.addDays('2026-02-28', 1), '2026-03-01'); eq(D.addDays('2024-02-28', 2), '2024-03-01'); eq(D.addDays('2026-01-01', -1), '2025-12-31');
eq(D.dayNum('2026-03-02') - D.dayNum('2026-03-01'), 1);
eq(D.weekKey('2026-01-01'), '2026-W01'); eq(D.weekKey('2024-12-30'), '2025-W01'); eq(D.weekKey('2021-01-03'), '2020-W53'); eq(D.weekKey('2026-09-28'), '2026-W40');
eq(D.weekKey('2026-09-27'), '2026-W39');
eq(D.weekStart('2026-09-30'), '2026-09-28');
eq(D.daysLeftInWeek('2026-09-28'), 7); eq(D.daysLeftInWeek('2026-10-04'), 1); eq(D.daysLeftInMonth('2026-09-29'), 2);

// ---- login: 8 consecutive days, day 7 gives the cosmetic crate, the cycle wraps
{
  const p = prof();
  const got = [];
  for (let i = 0; i < 8; i++) { const r = D.claimLogin(p, at(2026, 9, 1 + i)); ok(r.ok, 'claim ' + i); got.push(r); }
  eq(got.map((r) => r.day), [1, 2, 3, 4, 5, 6, 7, 1]);
  eq(got.map((r) => r.streak), [1, 2, 3, 4, 5, 6, 7, 8]);
  ok(got[6].reward.crate?.kind === 'cosmetic', 'day 7 crate');
  ok(got.slice(0, 6).every((r) => !r.reward.crate), 'no crate before day 7');
  ok(got[3].reward.items.some(([id]) => id.startsWith('shard_')), 'a forge shard on day 4');
  ok(got[7].reward.coin > got[0].reward.coin, 'second cycle pays a little more');
  eq(p.daily.login.best, 8); eq(p.daily.login.total, 8);
}
// ---- same date can never be claimed twice; clock rewinds do not help
{
  const p = prof();
  ok(D.claimLogin(p, at(2026, 9, 10, 8)).ok);
  ok(!D.claimLogin(p, at(2026, 9, 10, 20)).ok, 'same day later');
  ok(!D.claimLogin(p, at(2026, 9, 10, 8)).ok, 'same day again');
  eq(D.loginStatus(p, at(2026, 9, 10, 9)).canClaim, false);
  ok(D.loginStatus(p, at(2026, 9, 10, 9)).hoursToNext > 3);
  // rewind a day: still nothing (and the streak is untouched)
  ok(!D.claimLogin(p, at(2026, 9, 9)).ok, 'yesterday');
  ok(!D.claimLogin(p, at(2026, 8, 1)).ok, 'a month ago');
  eq(p.daily.login.streak, 1); eq(p.daily.login.total, 1);
  ok(p.daily.tamper >= 1, 'a rewind of more than 3 h is counted');
  // rewind, then the real day arrives: next day is claimable normally and continues the streak
  const r = D.claimLogin(p, at(2026, 9, 11));
  ok(r.ok && r.streak === 2, 'streak continues after the clock came back');
  // small rewind (NTP) is tolerated and not counted
  const t0 = D.resolveNow(p, at(2026, 9, 11, 12)).now;
  const before = p.daily.tamper;
  D.resolveNow(p, t0 - 60 * 1000);
  eq(p.daily.tamper, before);
}
// ---- one-day grace: missing exactly one day keeps the streak once, then it must be re-earned
{
  const p = prof();
  D.claimLogin(p, at(2026, 9, 1)); D.claimLogin(p, at(2026, 9, 2)); D.claimLogin(p, at(2026, 9, 3));       // streak 3
  const st = D.loginStatus(p, at(2026, 9, 5));                                                            // skipped the 4th
  eq(st.lapse, 'grace'); eq(st.streakAfter, 4); ok(st.grace);
  const r = D.claimLogin(p, at(2026, 9, 5));
  ok(r.ok && r.lapse === 'grace' && r.streak === 4 && r.day === 4, 'grace keeps the streak');
  eq(p.daily.login.grace, false);
  // a second single-day gap right after: no grace left -> gentle reset to day 1
  const st2 = D.loginStatus(p, at(2026, 9, 7));
  eq(st2.lapse, 'reset'); eq(st2.streakAfter, 1); ok(st2.comeback, 'comeback bonus after a 4 streak');
  const r2 = D.claimLogin(p, at(2026, 9, 7));
  ok(r2.ok && r2.streak === 1 && r2.day === 1 && r2.comeback, 'reset to day 1');
  ok(r2.reward.coin === Math.round(D.LOGIN_REWARDS[0].coin * D.COMEBACK_MUL), 'comeback coins');
  eq(p.daily.login.best, 4, 'best streak is kept');
  ok(p.daily.login.grace, 'a clean restart refills the grace');
}
// ---- grace regenerates after 3 on-time days
{
  const p = prof();
  for (let i = 0; i < 3; i++) D.claimLogin(p, at(2026, 9, 1 + i));
  D.claimLogin(p, at(2026, 9, 5));                    // grace used
  eq(p.daily.login.grace, false);
  D.claimLogin(p, at(2026, 9, 6)); D.claimLogin(p, at(2026, 9, 7));
  eq(p.daily.login.grace, false, 'not yet after 2');
  D.claimLogin(p, at(2026, 9, 8));
  eq(p.daily.login.grace, true, 'back after 3 on-time claims');
}
// ---- long absence: reset, best kept, never negative
{
  const p = prof();
  for (let i = 0; i < 5; i++) D.claimLogin(p, at(2026, 9, 1 + i));
  const r = D.claimLogin(p, at(2026, 12, 25));
  ok(r.ok && r.streak === 1 && r.lapse === 'reset');
  eq(p.daily.login.best, 5);
}
// ---- calendar view states
{
  const p = prof();
  D.claimLogin(p, at(2026, 9, 1)); D.claimLogin(p, at(2026, 9, 2));
  const a = D.loginStatus(p, at(2026, 9, 2, 20));
  eq(a.calendar.map((c) => c.state), ['claimed', 'claimed', 'locked', 'locked', 'locked', 'locked', 'locked']);
  const b = D.loginStatus(p, at(2026, 9, 3));
  eq(b.calendar.map((c) => c.state), ['claimed', 'claimed', 'ready', 'locked', 'locked', 'locked', 'locked']);
}
// ---- forward hopping only borrows from the future (cannot claim the real days after a rewind)
{
  const p = prof();
  D.claimLogin(p, at(2026, 9, 1));
  const hop = D.claimLogin(p, at(2026, 9, 20));            // clock set 19 days ahead
  ok(hop.ok && hop.streak === 1, 'a hop resets the streak (gap > grace)');
  ok(!D.claimLogin(p, at(2026, 9, 2)).ok, 'back to the real date: nothing');
  ok(!D.claimLogin(p, at(2026, 9, 3)).ok, 'the real days stay locked until the calendar catches up');
  ok(D.claimLogin(p, at(2026, 9, 21)).ok);
}
// ---- hostile profile data does not crash
{
  const p = { id: 'x', daily: { login: { last: 'nope', streak: -5, best: 'a' }, q: 5, w: null, crates: [null, 1, { id: 'a', kind: 'supply' }], stash: 3, season: 'x' } };
  const d = D.ensureDaily(p);
  eq(d.login.last, ''); eq(d.login.streak, 0); eq(d.crates.length, 1); eq(typeof d.stash, 'object');
  ok(D.claimLogin(p, at(2026, 9, 1)).ok);
  D.ensureQuests(p, at(2026, 9, 1)); D.seasonInfo(p, at(2026, 9, 1));
}

// ---- seeded challenges: everybody gets the same set for the same date
{
  const a = D.dailySet('2026-09-29'), b = D.dailySet('2026-09-29');
  eq(a, b); eq(a.length, 3);
  const p1 = prof('alice'), p2 = prof('bob');
  D.ensureQuests(p1, at(2026, 9, 29, 3)); D.ensureQuests(p2, at(2026, 9, 29, 22));
  eq(p1.daily.q.list.map((q) => q.id), p2.daily.q.list.map((q) => q.id), 'two players, same date, same daily set');
  eq(p1.daily.w.list.map((q) => q.id), p2.daily.w.list.map((q) => q.id), 'same weekly set');
  eq(D.weeklySet('2026-W40'), D.weeklySet('2026-W40'));
  // the weekly set is shared across the whole ISO week, the daily set varies
  const p3 = prof('carol'); D.ensureQuests(p3, at(2026, 9, 28)); const w1 = p3.daily.w.list.map((q) => q.id);
  D.ensureQuests(p3, at(2026, 10, 4)); eq(p3.daily.w.list.map((q) => q.id), w1, 'week stays');
  D.ensureQuests(p3, at(2026, 10, 5)); ok(p3.daily.w.week === '2026-W41', 'new week rolls');
  // variety across the year
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(D.dailySet(D.addDays('2026-01-01', i)).join(','));
  ok(seen.size > 25, 'daily sets vary (' + seen.size + ')');
  // each set = one easy, one mid, one hard with different counters
  for (let i = 0; i < 120; i++) {
    const s = D.dailySet(D.addDays('2026-01-01', i)).map((id) => D.questTemplate(id));
    eq(s.map((q) => q.diff), ['easy', 'mid', 'hard']);
    ok(new Set(s.map((q) => q.ev + (q.filter || ''))).size >= 2, 'not three of the same');
    const w = D.weeklySet(D.weekKey(D.addDays('2026-01-01', i * 3))).map((id) => D.questTemplate(id));
    ok(w.every((q) => q.diff === 'week') && new Set(w.map((q) => q.id)).size === 3);
  }
  ok(Object.keys(D.DAILY_POOL).every((k) => D.DAILY_POOL[k].length >= 5));
}
// ---- progress, filters, claiming, all-3 crate, reroll
{
  const p = prof();
  const key = '2026-09-29', now = at(2026, 9, 29);
  D.ensureQuests(p, now);
  // force a known set for the test
  p.daily.q.list = ['d_scrap800', 'd_melee5', 'd_anomaly1'].map((id) => ({ id, prog: 0, claimed: false }));
  p.daily.w.list = ['w_scrap5000', 'w_day5', 'w_boss1'].map((id) => ({ id, prog: 0, claimed: false }));
  eq(D.track(p, 'kill', 1, { melee: false }, now), [], 'a gun kill does not count for melee');
  eq(p.daily.q.list[1].prog, 0);
  D.track(p, 'kill', 4, { melee: true }, now);
  const done = D.track(p, 'kill', 3, { melee: true }, now);
  eq(done.map((x) => x.id), ['d_melee5']); eq(p.daily.q.list[1].prog, 5, 'clamped to the target');
  ok(D.track(p, 'kill', 1, { melee: true }, now).length === 0, 'no double completion');
  D.track(p, 'scrap', 500, {}, now); D.track(p, 'scrap', 400, {}, now);
  eq(p.daily.q.list[0].prog, 800); eq(p.daily.w.list[0].prog, 900, 'weekly counts too');
  D.track(p, 'kill', 1, { boss: true, melee: true }, now); eq(p.daily.w.list[2].prog, 1);
  // claim
  ok(!D.claimQuest(p, 'day', 2, 5, now).ok, 'unfinished');
  const c1 = D.claimQuest(p, 'day', 0, 5, now);
  ok(c1.ok && c1.reward.coin === D.QUEST_REWARD.mid.coin && c1.reward.xp === Math.round(D.QUEST_REWARD.mid.xp * D.xpScale(5)));
  ok(!D.claimQuest(p, 'day', 0, 5, now).ok, 'claimed once');
  D.claimQuest(p, 'day', 1, 5, now);
  D.track(p, 'anomaly', 1, {}, now);
  const c3 = D.claimQuest(p, 'day', 2, 5, now);
  ok(c3.ok && c3.reward.crate?.kind === 'supply' && c3.allDone, 'all three dailies -> a supply crate');
  // reroll: an unfinished, not yet rerolled daily only, once per day (fresh set)
  const q = prof('rr'); D.ensureQuests(q, now);
  const before = q.daily.q.list.map((x) => x.id);
  const r = D.rerollDaily(q, 1, now);
  ok(r.ok && !before.includes(r.id) && q.daily.q.list[1].id === r.id, 'rerolled');
  eq(D.questTemplate(r.id).diff, 'mid', 'same difficulty');
  ok(!D.rerollDaily(q, 0, now).ok && D.rerollDaily(q, 0, now).reason === 'used', 'once per day');
  // the reroll is deterministic for the date and resets the next day
  const q2 = prof('rr2'); D.ensureQuests(q2, now); eq(D.rerollDaily(q2, 1, now).id, r.id, 'deterministic reroll');
  D.ensureQuests(q, at(2026, 9, 30)); eq(q.daily.q.rerolled, false);
  // a finished challenge can not be rerolled
  const q3 = prof('rr3'); D.ensureQuests(q3, now); q3.daily.q.list[0].prog = D.questTemplate(q3.daily.q.list[0].id).n;
  eq(D.rerollDaily(q3, 0, now).reason, 'done');
  // yesterday's unfinished progress does not carry over
  const q4 = prof('rr4'); D.ensureQuests(q4, now); D.track(q4, 'scrap', 100, {}, now);
  D.ensureQuests(q4, at(2026, 9, 30)); ok(q4.daily.q.list.every((x) => x.prog === 0));
}
// ---- first win of the day + once-per-day caps follow the (guarded) date
{
  const p = prof();
  ok(D.firstWinToday(p, at(2026, 9, 1, 10)));
  ok(!D.firstWinToday(p, at(2026, 9, 1, 23)), 'second extraction the same day');
  ok(!D.firstWinToday(p, at(2026, 8, 1)), 'rewinding the clock gives no new first win');
  ok(D.firstWinToday(p, at(2026, 9, 2, 1)), 'next day');
  ok(D.capOnce(p, 'quota', at(2026, 9, 2)) && !D.capOnce(p, 'quota', at(2026, 9, 2, 22)) && D.capOnce(p, 'quota', at(2026, 9, 3)));
}

// ---- crates
{
  const catalog = [];
  const tiers = D.crateItemIds().length ? ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] : [];
  for (const tr of tiers) for (let i = 0; i < 3; i++) catalog.push({ key: `hat:${tr}${i}`, slot: 'hat', id: tr + i, name: tr + i, tier: tr });
  const p = prof('cr');
  const c1 = D.grantCrate(p, 'cosmetic', 'login'), c2 = D.grantCrate(p, 'cosmetic', 'login');
  ok(c1.id !== c2.id && c1.seed !== c2.seed, 'unique crates');
  const ownsNone = { catalog, owns: () => false };
  eq(D.rollCrate(c1, ownsNone), D.rollCrate(c1, ownsNone), 'deterministic');
  const dist = {};
  for (let i = 0; i < 300; i++) { const c = D.grantCrate(p, 'cosmetic', 'x' + i); const r = D.rollCrate(c, ownsNone); ok(r.kind === 'cosmetic', 'guaranteed cosmetic'); dist[r.tier] = (dist[r.tier] || 0) + 1; ok(r.tier !== 'common', 'cosmetic crate min tier is uncommon'); }
  ok(dist.uncommon > dist.epic && dist.epic >= 1, 'tiers are weighted: ' + JSON.stringify(dist));
  // fixed season crate tier
  const sc = D.grantCrate(p, 'season', 'season', { tier: 'rare' });
  eq(D.rollCrate(sc, ownsNone).tier, 'rare');
  // owned entries are skipped; all owned -> coins (duplicate protection)
  const rc = D.rollCrate(sc, { catalog, owns: (s, id) => id === D.rollCrate(sc, ownsNone).id });
  ok(rc.kind === 'cosmetic' && rc.id !== D.rollCrate(sc, ownsNone).id, 'never a duplicate while unowned entries exist');
  const allOwned = D.rollCrate(sc, { catalog, owns: () => true });
  ok(allOwned.kind === 'coin' && allOwned.dupe && allOwned.coin > 0, 'duplicate -> coin');
  // supply crate: mix of items / coin / cosmetics, items are known ids
  const mix = { items: 0, coin: 0, cosmetic: 0 };
  const okIds = new Set(D.crateItemIds());
  for (let i = 0; i < 400; i++) { const r = D.rollCrate(D.grantCrate(p, 'supply', 's' + i), ownsNone); mix[r.kind]++; if (r.kind === 'items') ok(r.items.every(([id]) => okIds.has(id))); }
  ok(mix.items > 60 && mix.coin > 40 && mix.cosmetic > 20, 'supply mix ' + JSON.stringify(mix));
  // opening removes the crate exactly once and is applied through hooks
  const before = D.ensureDaily(p).crates.length;
  const o = D.openCrate(p, c1.id, ownsNone);
  ok(o.ok && D.ensureDaily(p).crates.length === before - 1);
  ok(!D.openCrate(p, c1.id, ownsNone).ok, 'second open of the same crate is refused');
  const granted = [];
  D.applyCrateResult(p, { kind: 'cosmetic', slot: 'hat', id: 'zzz', key: 'hat:zzz' }, { grantCosmetic: (s, i) => { granted.push(s + ':' + i); return true; } });
  eq(granted, ['hat:zzz']);
  D.applyCrateResult(p, { kind: 'items', items: [['shard_scrap', 3]] }, {});
  eq(p.daily.stash.shard_scrap, 3);
  let coins = 0; D.applyCrateResult(p, { kind: 'coin', coin: 77 }, { addCoins: (c) => { coins += c; } }); eq(coins, 77);
}

// ---- stash delivery planning + host validation
{
  const p = prof();
  D.applyReward(p, { items: [['comp_cable', 40], ['shard_scrap', 5], ['weird', 3]] });
  const plan = D.planDelivery(p, (id) => id !== 'weird');
  ok(plan.reduce((a, [, k]) => a + k, 0) <= 30 && plan.every(([, k]) => k <= 12), 'caps per delivery');
  ok(!plan.some(([id]) => id === 'weird'), 'whitelist');
  D.settleStash(p, plan);
  ok(p.daily.stash.comp_cable === 28 && p.daily.stash.shard_scrap === undefined, 'settled only what was delivered');
  const clean = D.sanitizeDelivery([['comp_cable', 999], ['nope', 5], ['shard_scrap', -3], 'x', ['comp_fuse', 2.9]], (id) => id !== 'nope');
  eq(clean, [['comp_cable', 12], ['comp_fuse', 2]], 'host caps and drops bad entries');
  eq(D.sanitizeDelivery('nope', () => true), []);
}

// ---- season
{
  eq(D.SEASON_TIERS, 30);
  ok(D.SEASON_TOTAL > 12000 && D.SEASON_TOTAL < 20000, 'season total ' + D.SEASON_TOTAL);
  const p = prof('se'); const now = at(2026, 9, 5);
  const i0 = D.seasonInfo(p, now); eq(i0.key, '2026-09'); eq(i0.tier, 0); eq(i0.need, D.SEASON_NEED(1));
  const a = D.seasonAdd(p, D.SEASON_NEED(1) + 10, now);
  eq(a.newTiers, [1]); eq(D.seasonInfo(p, now).tier, 1); eq(D.seasonInfo(p, now).into, 10);
  ok(D.seasonAdd(p, 999999, now).added === 2000, 'per-call cap');
  ok(!D.claimSeasonTier(p, 30, now).ok, 'locked tier');
  const c = D.claimSeasonTier(p, 1, now); ok(c.ok && c.reward.coin > 0);
  ok(!D.claimSeasonTier(p, 1, now).ok, 'claim once');
  for (let i = 0; i < 20; i++) D.seasonAdd(p, 2000, now);
  const info = D.seasonInfo(p, now); ok(info.maxed && info.tier === 30, 'maxed');
  for (let t = 1; t <= 30; t++) { const r = D.seasonReward(t); ok(r.coin > 0); }
  eq(D.seasonReward(10).title, 'Clocked In'); eq(D.seasonReward(30).crate.tier, 'legendary'); ok(D.seasonReward(30).title.length <= 24);
  ok(Object.values(D.SEASON_TITLES).every((s) => s.length <= 24), 'titles fit the name tag');
  ok([3, 6, 12, 18, 24, 30].every((t) => D.seasonReward(t).crate?.kind === 'season'), 'cosmetic crates on the milestones');
  // rollover: earned-but-unclaimed tiers are handed back once, the new month starts at 0
  const nxt = at(2026, 10, 2);
  const roll = D.ensureSeason(p, nxt);
  ok(roll.rolled && roll.rolled.key === '2026-09' && roll.rolled.tiers.length === 29, 'unclaimed tiers survive the month change');
  eq(D.seasonInfo(p, nxt).xp, 0); eq(D.ensureSeason(p, nxt).rolled, null);
  // reward application: title + crate + items + xp via hooks
  const q = prof('ap'); const log = [];
  const out = D.applyReward(q, { coin: 10, xp: 20, sxp: 30, items: [['comp_fuse', 1]], crate: { kind: 'season', tier: 'epic' }, title: 'Clocked In' }, { addCoins: (c) => log.push('c' + c), addXp: (x) => log.push('x' + x) }, 'Season', now);
  eq(log, ['c10', 'x20']); ok(out.crate.tier === 'epic' && q.titles.includes('Clocked In') && out.sxp === 30);
}

// ---- badges / attention
{
  const p = prof('at'); const now = at(2026, 9, 6);
  eq(D.attention(p, now).login, true);
  D.claimLogin(p, now); eq(D.attention(p, now).login, false);
  ok(D.isNew(p, 'login')); D.clearNew(p, 'login'); ok(!D.isNew(p, 'login'));
  D.ensureQuests(p, now); p.daily.q.list[0].prog = D.questTemplate(p.daily.q.list[0].id).n;
  eq(D.attention(p, now).quests, 1);
  D.grantCrate(p, 'supply', 'x'); eq(D.attention(p, now).crates, 1);
  ok(D.attention(p, now).total >= 2);
}

console.log(`daily.test.mjs: ${n} assertions OK`);
