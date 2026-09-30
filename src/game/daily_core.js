// DAILY / retention core (wave 4, module 'daily'; docs/wave4/daily.md). PURE rules, no DOM / three.js / game imports, node-tested.
//   1. 7-day login calendar with a one-day grace and a gentle reset       (loginStatus / claimLogin)
//   2. daily (3) + weekly (3) challenges seeded by the date, one reroll   (dailySet / weeklySet / track / claimQuest / rerollDaily)
//   3. earned crates: deterministic reveal roll, duplicate protection     (grantCrate / rollCrate / openCrate)
//   4. free 30-tier season track (monthly) with cosmetic crates + titles  (seasonInfo / seasonAdd / claimSeasonTier)
//   5. first win of the day bonus flag                                   (firstWinToday)
// State lives in profile.daily (localStorage profile); nothing here talks to the network. Rewards are personal account rewards.
// Clock tamper guard: `hw` is a high-water mark of the wall clock. The effective time never goes backwards, a date key can only be claimed
// once (login.last is the newest claimed key, quests / first-win / rerolls are keyed by the date), and a forward hop only "borrows" from the
// future (the mark stays ahead, so the real days that follow are unclaimable until the calendar catches up).
import { RNG, hashString } from '../core/rng.js';
import { TIER_ORDER, rollTier } from './tiers.js';

export const DAY_MS = 86400000;
export const BACK_TOLERANCE_MS = 3 * 3600 * 1000;   // a backwards jump larger than this is counted as tampering (informational)
export const CALENDAR_DAYS = 7;
export const SEASON_TIERS = 30;
const KEEP_CLAIM_KEYS = 12;

const n0 = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const pad2 = (v) => String(v).padStart(2, '0');

// ---------------------------------------------------------------------------------------------- dates (local calendar)
/** Local calendar date of a timestamp as 'YYYY-MM-DD'. */
export function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Day number of a 'YYYY-MM-DD' key (UTC based, so differences are exact whole days regardless of DST). */
export function dayNum(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}
export function keyOfDayNum(dn) { const d = new Date(dn * DAY_MS); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
export const addDays = (key, n) => keyOfDayNum(dayNum(key) + n);
/** ISO-8601 week key of a date key: 'YYYY-Www' (Monday based). */
export function weekKey(key) {
  const dn = dayNum(key);
  const dow = (((dn + 3) % 7) + 7) % 7;             // 1970-01-01 was a Thursday: (dn + 3) % 7 = 0 for Monday
  const thursday = dn - dow + 3;
  const yr = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Math.round(Date.UTC(yr, 0, 1) / DAY_MS);
  const wk = 1 + Math.floor((thursday - jan1) / 7);
  return `${yr}-W${pad2(wk)}`;
}
/** Monday date key of the ISO week that contains a date key. */
export function weekStart(key) { const dn = dayNum(key); return keyOfDayNum(dn - ((((dn + 3) % 7) + 7) % 7)); }
/** Season key = calendar month ('YYYY-MM'). */
export const seasonKey = (key) => String(key).slice(0, 7);
/** Whole days left in the ISO week / month INCLUDING today (for "resets in N days" labels). */
export const daysLeftInWeek = (key) => 7 - ((((dayNum(key) + 3) % 7) + 7) % 7);
export function daysLeftInMonth(key) {
  const y = +String(key).slice(0, 4), m = +String(key).slice(5, 7), d = +String(key).slice(8, 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
}

// ---------------------------------------------------------------------------------------------- profile state
export function ensureDaily(p) {
  if (!p) return null;
  const d = isObj(p.daily) ? p.daily : (p.daily = {});
  d.v = 1;
  if (typeof d.hw !== 'number' || !isFinite(d.hw)) d.hw = 0;
  d.tamper = n0(d.tamper);
  if (!isObj(d.login)) d.login = {};
  const l = d.login;
  if (typeof l.last !== 'string' || !isFinite(dayNum(l.last))) l.last = '';
  l.streak = Math.max(0, Math.floor(n0(l.streak)));
  l.best = Math.max(l.streak, Math.floor(n0(l.best)));
  l.total = Math.max(0, Math.floor(n0(l.total)));
  if (typeof l.grace !== 'boolean') l.grace = true;
  l.graceRun = Math.max(0, Math.floor(n0(l.graceRun)));
  if (!Array.isArray(l.keys)) l.keys = [];
  l.keys = l.keys.filter((k) => typeof k === 'string').slice(-KEEP_CLAIM_KEYS);
  if (!isObj(d.q)) d.q = {};
  if (!Array.isArray(d.q.list)) d.q.list = [];
  if (!isObj(d.w)) d.w = {};
  if (!Array.isArray(d.w.list)) d.w.list = [];
  if (typeof d.firstWin !== 'string') d.firstWin = '';
  if (!Array.isArray(d.crates)) d.crates = [];
  d.crates = d.crates.filter((c) => isObj(c) && typeof c.id === 'string' && typeof c.kind === 'string').slice(0, 60);
  d.crateSeq = Math.max(0, Math.floor(n0(d.crateSeq)));
  if (!isObj(d.stash)) d.stash = {};
  if (!isObj(d.season)) d.season = {};
  if (typeof d.season.key !== 'string') d.season.key = '';
  d.season.xp = Math.max(0, Math.floor(n0(d.season.xp)));
  if (!Array.isArray(d.season.claimed)) d.season.claimed = [];
  if (!isObj(d.caps)) d.caps = {};
  if (!Array.isArray(d.newKeys)) d.newKeys = [];
  d.newKeys = d.newKeys.filter((k) => typeof k === 'string').slice(-40);
  if (!isObj(d.stats)) d.stats = {};
  return d;
}

/**
 * The effective "now" (ms): the wall clock, but never earlier than the high-water mark of what this profile has already seen.
 * Advances the mark. Returns { now, tampered }.
 */
export function resolveNow(p, wallMs = Date.now()) {
  const d = ensureDaily(p);
  let now = Number.isFinite(wallMs) ? wallMs : Date.now();
  let tampered = false;
  if (now < d.hw) {
    if (d.hw - now > BACK_TOLERANCE_MS) { tampered = true; d.tamper += 1; }
    now = d.hw;
  } else d.hw = now;
  return { now, tampered };
}
export const todayKey = (p, wallMs) => dateKey(resolveNow(p, wallMs).now);

// ---------------------------------------------------------------------------------------------- 1. login calendar
/** Reward of calendar day 1..7. `cycle` = completed weeks (adds up to +50 % coins). items = [id, n] pairs delivered to the ship stash. */
export const LOGIN_REWARDS = [
  { day: 1, coin: 50, items: [['comp_cable', 2]] },
  { day: 2, coin: 60, xp: 150, items: [['comp_scrapmetal', 3], ['comp_battery', 1]] },
  { day: 3, coin: 80, items: [['comp_circuit', 2]] },
  { day: 4, coin: 100, xp: 300, items: [['shard_scrap', 2]] },
  { day: 5, coin: 120, items: [['comp_fuse', 2], ['comp_sensor', 1]] },
  { day: 6, coin: 150, xp: 500, items: [['shard_circuit', 1]] },
  { day: 7, coin: 250, items: [['shard_crystal', 1]], crate: { kind: 'cosmetic' } },
];
export const COMEBACK_MUL = 1.5;   // day-1 coins after a reset that ended a streak of 3+
export function loginReward(day, cycle = 0, comeback = false) {
  const b = LOGIN_REWARDS[Math.max(0, Math.min(6, day - 1))];
  const mul = 1 + Math.min(5, Math.max(0, cycle)) * 0.1 + (comeback && day === 1 ? COMEBACK_MUL - 1 : 0);
  return { ...b, coin: Math.round(b.coin * mul), items: b.items.map((x) => [...x]), crate: b.crate ? { ...b.crate } : undefined, sxp: 60 };
}
const gapOf = (last, today) => (last ? dayNum(today) - dayNum(last) : Infinity);

/** What the calendar looks like right now (does not mutate except the clock high-water mark). */
export function loginStatus(p, wallMs = Date.now()) {
  const d = ensureDaily(p), l = d.login;
  const { now, tampered } = resolveNow(p, wallMs);
  const today = dateKey(now);
  const gap = gapOf(l.last, today);
  const claimedToday = l.last !== '' && (gap <= 0 || l.keys.includes(today));
  let lapse = 'none', streakAfter = 1, comeback = false;
  if (!claimedToday) {
    if (gap === Infinity) streakAfter = 1;
    else if (gap === 1) streakAfter = l.streak + 1;
    else if (gap === 2 && l.grace) { streakAfter = l.streak + 1; lapse = 'grace'; }
    else { streakAfter = 1; lapse = 'reset'; comeback = l.streak >= 3; }
  }
  const shownStreak = claimedToday ? l.streak : streakAfter;
  const dayInCycle = ((Math.max(1, shownStreak) - 1) % CALENDAR_DAYS) + 1;
  const cycle = Math.floor((Math.max(1, shownStreak) - 1) / CALENDAR_DAYS);
  const cal = [];
  for (let day = 1; day <= CALENDAR_DAYS; day++) {
    const state = claimedToday ? (day <= dayInCycle ? 'claimed' : 'locked') : (day < dayInCycle ? 'claimed' : day === dayInCycle ? 'ready' : 'locked');
    cal.push({ day, state, reward: loginReward(day, cycle, comeback && day === 1) });
  }
  return { today, canClaim: !claimedToday, claimedToday, streak: l.streak, streakAfter, day: dayInCycle, cycle, lapse, comeback, grace: l.grace, best: l.best, total: l.total, calendar: cal, tampered, hoursToNext: claimedToday ? hoursUntilNextDay(now) : 0 };
}
function hoursUntilNextDay(now) {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return Math.max(0, (next - now) / 3600000);
}

/** Claim today's login reward. Mutates the profile; the caller applies { coin, xp, items, crate } through applyReward(). */
export function claimLogin(p, wallMs = Date.now()) {
  const d = ensureDaily(p), l = d.login;
  const st = loginStatus(p, wallMs);
  if (!st.canClaim) return { ok: false, reason: 'claimed' };
  if (st.lapse === 'grace') { l.grace = false; l.graceRun = 0; }
  else if (st.lapse === 'none') { l.graceRun += 1; if (!l.grace && l.graceRun >= 3) { l.grace = true; l.graceRun = 0; } }
  else { l.graceRun = 0; }
  if (st.lapse === 'reset') l.grace = true;   // a clean restart also refills the grace
  l.streak = st.streakAfter;
  l.best = Math.max(l.best, l.streak);
  l.total += 1;
  l.last = st.today;
  l.keys.push(st.today);
  l.keys = l.keys.slice(-KEEP_CLAIM_KEYS);
  const day = ((l.streak - 1) % CALENDAR_DAYS) + 1, cycle = Math.floor((l.streak - 1) / CALENDAR_DAYS);
  const reward = loginReward(day, cycle, st.comeback && day === 1);
  markNew(d, 'login');
  return { ok: true, day, cycle, streak: l.streak, lapse: st.lapse, comeback: st.comeback, reward, today: st.today };
}

// ---------------------------------------------------------------------------------------------- 2. challenges
// ev = counter fed by daily.js: scrap (value secured), sell (value sold), kill (n, filter melee / boss), day (a day survived), anomaly (a day survived
// after reaching the GLITCHING stage), quota, core (core extracted), minigame, chest, fish.
const T = (id, ev, n, diff, extra = {}) => ({ id, ev, n, diff, ...extra });
export const DAILY_POOL = {
  easy: [
    T('d_scrap400', 'scrap', 400, 'easy', { text: 'Secure {n} scrap value' }),
    T('d_kill4', 'kill', 4, 'easy', { text: 'Kill {n} creatures' }),
    T('d_day1', 'day', 1, 'easy', { text: 'Survive {n} day on a moon' }),
    T('d_sell300', 'sell', 300, 'easy', { text: 'Sell {n} scrap value' }),
    T('d_chest1', 'chest', 1, 'easy', { text: 'Open {n} chest' }),
    T('d_fish3', 'fish', 3, 'easy', { text: 'Catch {n} phish' }),
  ],
  mid: [
    T('d_scrap800', 'scrap', 800, 'mid', { text: 'Extract {n} scrap value' }),
    T('d_melee5', 'kill', 5, 'mid', { filter: 'melee', text: 'Kill {n} creatures with melee' }),
    T('d_anomaly1', 'anomaly', 1, 'mid', { text: 'Survive an anomaly (reach GLITCHING and live through the day)' }),
    T('d_kill10', 'kill', 10, 'mid', { text: 'Kill {n} creatures' }),
    T('d_mini2', 'minigame', 2, 'mid', { text: 'Finish {n} facility minigames (vault / fuse)' }),
    T('d_sell900', 'sell', 900, 'mid', { text: 'Sell {n} scrap value' }),
  ],
  hard: [
    T('d_scrap1500', 'scrap', 1500, 'hard', { text: 'Extract {n} scrap value' }),
    T('d_melee10', 'kill', 10, 'hard', { filter: 'melee', text: 'Kill {n} creatures with melee' }),
    T('d_kill20', 'kill', 20, 'hard', { text: 'Kill {n} creatures' }),
    T('d_chest3', 'chest', 3, 'hard', { text: 'Open {n} chests' }),
    T('d_day2', 'day', 2, 'hard', { text: 'Survive {n} days on the moons' }),
    T('d_sell2000', 'sell', 2000, 'hard', { text: 'Sell {n} scrap value' }),
  ],
};
export const WEEKLY_POOL = {
  vol: [
    T('w_scrap5000', 'scrap', 5000, 'week', { text: 'Extract {n} scrap value' }),
    T('w_kill50', 'kill', 50, 'week', { text: 'Kill {n} creatures' }),
    T('w_melee30', 'kill', 30, 'week', { filter: 'melee', text: 'Kill {n} creatures with melee' }),
    T('w_sell6000', 'sell', 6000, 'week', { text: 'Sell {n} scrap value' }),
  ],
  surv: [
    T('w_day5', 'day', 5, 'week', { text: 'Survive {n} days on the moons' }),
    T('w_anomaly3', 'anomaly', 3, 'week', { text: 'Survive {n} anomalies (reach GLITCHING and live through the day)' }),
    T('w_quota1', 'quota', 1, 'week', { text: 'Meet the quota with your crew' }),
  ],
  spec: [
    T('w_boss1', 'kill', 1, 'week', { filter: 'boss', text: 'Defeat a boss' }),
    T('w_core1', 'core', 1, 'week', { text: 'Extract a facility core' }),
    T('w_chest8', 'chest', 8, 'week', { text: 'Open {n} chests' }),
    T('w_mini5', 'minigame', 5, 'week', { text: 'Finish {n} facility minigames (vault / fuse)' }),
  ],
};
const ALL_TPL = {};
for (const g of [DAILY_POOL, WEEKLY_POOL]) for (const list of Object.values(g)) for (const q of list) ALL_TPL[q.id] = q;
export const questTemplate = (id) => ALL_TPL[id] || null;

/** Base rewards per difficulty. XP is scaled by the player's level at grant time (xpScale). sxp = season xp. */
export const QUEST_REWARD = {
  easy: { coin: 30, xp: 100, sxp: 100 },
  mid: { coin: 60, xp: 200, sxp: 160 },
  hard: { coin: 100, xp: 350, sxp: 260 },
  week: { coin: 250, xp: 900, sxp: 550, items: [['shard_circuit', 1], ['comp_crystal', 1]] },
};
export const xpScale = (level) => 1 + Math.min(50, Math.max(1, level | 0)) / 20;

const pick = (rng, arr, avoid = new Set()) => {
  const ok = arr.filter((q) => !avoid.has(q.ev));
  const src = ok.length ? ok : arr;
  return src[rng.int(0, src.length - 1)];
};
const inst = (tpl) => ({ id: tpl.id, prog: 0, claimed: false });

/** The 3 daily challenges of a date key (same for everybody). */
export function dailySet(key) {
  const rng = new RNG(hashString('tfg-daily:' + key));
  const used = new Set(), out = [];
  for (const diff of ['easy', 'mid', 'hard']) { const q = pick(rng, DAILY_POOL[diff], used); used.add(q.ev + (q.filter || '')); out.push(q.id); }
  return out;
}
/** The 3 weekly challenges of an ISO week key. */
export function weeklySet(wkey) {
  const rng = new RNG(hashString('tfg-weekly-q:' + wkey));
  return ['vol', 'surv', 'spec'].map((g) => pick(rng, WEEKLY_POOL[g]).id);
}
/** The replacement for daily slot `slot` after a reroll (deterministic, never one of the currently listed challenges). */
export function rerollPick(key, slot, currentIds) {
  const diff = ['easy', 'mid', 'hard'][slot] || 'mid';
  const rng = new RNG(hashString(`tfg-daily-reroll:${key}:${slot}`));
  const pool = DAILY_POOL[diff].filter((q) => !currentIds.includes(q.id));
  return (pool.length ? pool[rng.int(0, pool.length - 1)] : DAILY_POOL[diff][0]).id;
}

/** Make sure the daily + weekly lists match the (effective) date. Returns the profile daily state. */
export function ensureQuests(p, wallMs = Date.now()) {
  const d = ensureDaily(p);
  const key = todayKey(p, wallMs), wk = weekKey(key);
  if (d.q.day !== key || d.q.list.length !== 3) {
    d.q = { day: key, rerolled: false, list: dailySet(key).map((id) => inst(ALL_TPL[id])) };
    if (d.q.list.some((x) => !x)) d.q.list = [];
  }
  if (d.w.week !== wk || d.w.list.length !== 3) {
    d.w = { week: wk, crate: false, list: weeklySet(wk).map((id) => inst(ALL_TPL[id])) };
  }
  for (const list of [d.q.list, d.w.list]) for (const q of list) { q.prog = Math.max(0, n0(q.prog)); q.claimed = !!q.claimed; }
  return d;
}
export const questDone = (q) => !!q && n0(q.prog) >= (ALL_TPL[q.id]?.n || Infinity);

/** Reroll one unfinished daily (once per date). Returns { ok, id } or { ok:false, reason }. */
export function rerollDaily(p, slot, wallMs = Date.now()) {
  const d = ensureQuests(p, wallMs);
  const q = d.q.list[slot];
  if (!q) return { ok: false, reason: 'slot' };
  if (d.q.rerolled) return { ok: false, reason: 'used' };
  if (questDone(q) || q.claimed) return { ok: false, reason: 'done' };
  const id = rerollPick(d.q.day, slot, d.q.list.map((x) => x.id));
  d.q.list[slot] = inst(ALL_TPL[id]);
  d.q.rerolled = true;
  return { ok: true, id, slot };
}

/**
 * Feed one game event. data = { melee, boss } for kills. Returns the challenges completed by this event ([{ scope, index, id }]).
 * Progress is per local player; it is clamped to the target.
 */
export function track(p, ev, n = 1, data = {}, wallMs = Date.now()) {
  const d = ensureQuests(p, wallMs);
  const done = [];
  n = Math.max(0, n0(n));
  if (!n) return done;
  const bump = (list, scope) => list.forEach((q, index) => {
    const tpl = ALL_TPL[q.id];
    if (!tpl || tpl.ev !== ev || q.claimed) return;
    if (tpl.filter === 'melee' && !data.melee) return;
    if (tpl.filter === 'boss' && !data.boss) return;
    const before = n0(q.prog);
    if (before >= tpl.n) return;
    q.prog = Math.min(tpl.n, before + n);
    if (q.prog >= tpl.n) { done.push({ scope, index, id: q.id }); markNew(d, scope === 'day' ? 'quests' : 'weekly'); }
  });
  bump(d.q.list, 'day');
  bump(d.w.list, 'week');
  return done;
}

/** Claim a finished challenge. scope 'day' | 'week'. Returns { ok, reward } (reward: coin, xp (already level scaled), sxp, items, crate). */
export function claimQuest(p, scope, index, level = 1, wallMs = Date.now()) {
  const d = ensureQuests(p, wallMs);
  const list = scope === 'week' ? d.w.list : d.q.list;
  const q = list[index];
  const tpl = q && ALL_TPL[q.id];
  if (!q || !tpl) return { ok: false, reason: 'slot' };
  if (q.claimed) return { ok: false, reason: 'claimed' };
  if (!questDone(q)) return { ok: false, reason: 'unfinished' };
  q.claimed = true;
  const b = QUEST_REWARD[tpl.diff];
  const reward = { coin: b.coin, xp: Math.round(b.xp * xpScale(level)), sxp: b.sxp, items: (b.items || []).map((x) => [...x]) };
  const extra = [];
  if (scope === 'day' && list.every((x) => x.claimed) && d.caps.allDaily !== d.q.day) { d.caps.allDaily = d.q.day; extra.push({ kind: 'supply' }); }
  if (scope === 'week' && list.every((x) => x.claimed) && !d.w.crate) { d.w.crate = true; extra.push({ kind: 'weekly' }); }
  if (extra.length) reward.crate = extra[0];
  d.stats.questsDone = n0(d.stats.questsDone) + 1;
  return { ok: true, reward, scope, index, id: q.id, allDone: !!extra.length };
}

// ---------------------------------------------------------------------------------------------- first win / quota crate caps
/** First successful extraction of the local date? Marks it and returns true once per date. */
export function firstWinToday(p, wallMs = Date.now()) {
  const d = ensureDaily(p);
  const key = todayKey(p, wallMs);
  if (d.firstWin === key) return false;
  d.firstWin = key;
  return true;
}
export const firstWinAvailable = (p, wallMs = Date.now()) => ensureDaily(p).firstWin !== todayKey(p, wallMs);
/** Once-per-date gate for small perks (quota crate). */
export function capOnce(p, name, wallMs = Date.now()) {
  const d = ensureDaily(p);
  const key = todayKey(p, wallMs);
  if (d.caps[name] === key) return false;
  d.caps[name] = key;
  return true;
}

// ---------------------------------------------------------------------------------------------- 3. crates
export const CRATES = {
  supply: { name: 'Supply Crate', minTier: 'common', maxTier: 'epic', luck: 0, cosmeticP: 0.22, tag: 'Parts, Followers and the odd cosmetic' },
  cosmetic: { name: 'Cosmetic Crate', minTier: 'uncommon', maxTier: 'legendary', luck: 0.25, cosmeticP: 1, tag: 'One cosmetic, guaranteed' },
  weekly: { name: 'Weekly Crate', minTier: 'rare', maxTier: 'legendary', luck: 0.3, cosmeticP: 1, tag: 'A rare-or-better cosmetic' },
  season: { name: 'Season Crate', minTier: 'common', maxTier: 'legendary', luck: 0, cosmeticP: 1, tag: 'A cosmetic of the tier shown' },
  quota: { name: 'Quota Crate', minTier: 'common', maxTier: 'epic', luck: 0.1, cosmeticP: 0.35, tag: 'The Algorithm is pleased. For now.' },
};
export const crateDef = (kind) => CRATES[kind] || CRATES.supply;
const CRATE_ITEMS = {
  common: [['comp_scrapmetal', 4], ['comp_wood', 3], ['comp_cable', 3], ['comp_cloth', 4], ['comp_battery', 2], ['shard_scrap', 3]],
  uncommon: [['comp_fuse', 3], ['comp_circuit', 2], ['comp_sensor', 2], ['comp_coolant', 2], ['comp_chem', 2], ['shard_circuit', 2]],
  rare: [['shard_crystal', 2], ['comp_crystal', 2], ['shard_circuit', 3]],
  epic: [['shard_ecto', 1], ['comp_ecto', 2], ['shard_crystal', 3]],
  legendary: [['shard_algo', 1]],
  mythic: [['shard_algo', 2]],
};
const CRATE_COIN = { common: [40, 80], uncommon: [90, 150], rare: [180, 300], epic: [400, 600], legendary: [800, 1200], mythic: [1500, 2000] };
export const crateItemIds = () => [...new Set(Object.values(CRATE_ITEMS).flat().map((x) => x[0]))];

/** Add an unopened crate to the profile (unique seed per crate). Returns the crate. */
export function grantCrate(p, kind, src = '', extra = {}) {
  const d = ensureDaily(p);
  const seq = ++d.crateSeq;
  const crate = { id: 'c' + seq.toString(36) + hashString(`${p.id || 'p'}:${kind}:${src}:${seq}`).toString(36), kind: CRATES[kind] ? kind : 'supply', src, seed: hashString(`${p.id || 'p'}|${kind}|${src}|${seq}`), at: Date.now(), ...extra };
  d.crates.push(crate);
  markNew(d, 'crates');
  return crate;
}

/**
 * Decide the contents of a crate. Pure and deterministic from (crate.seed, ownership): opening twice / reloading gives the same reward.
 * ctx = { catalog: [{ key:'slot:id', slot, id, name, tier }], owns(slot,id) -> bool }.
 * Returns { kind: 'cosmetic'|'items'|'coin', tier, ... } (cosmetic: key, slot, id, name, dupe -> coin instead).
 */
export function rollCrate(crate, ctx = {}) {
  const def = crateDef(crate.kind);
  const rng = new RNG(crate.seed >>> 0);
  const fixed = crate.tier && TIER_ORDER.includes(crate.tier) ? crate.tier : null;
  const tier = fixed || rollTier(rng, { luck: def.luck, minTier: def.minTier, maxTier: def.maxTier });
  const cosmetic = rng.next() < def.cosmeticP;
  const coinFor = (tr) => { const [a, b] = CRATE_COIN[tr] || CRATE_COIN.common; return rng.int(a, b); };
  if (cosmetic && ctx.catalog?.length) {
    const owns = ctx.owns || (() => false);
    const free = ctx.catalog.filter((c) => !owns(c.slot, c.id));
    const ti = TIER_ORDER.indexOf(tier);
    // nearest tier that still has something unowned: the rolled tier, then lower, then higher
    const order = [ti]; for (let k = 1; k < TIER_ORDER.length; k++) { if (ti - k >= 0) order.push(ti - k); if (ti + k < TIER_ORDER.length) order.push(ti + k); }
    for (const idx of order) {
      const pool = free.filter((c) => c.tier === TIER_ORDER[idx]);
      if (pool.length) { const c = pool[rng.int(0, pool.length - 1)]; return { kind: 'cosmetic', tier: TIER_ORDER[idx], key: c.key || `${c.slot}:${c.id}`, slot: c.slot, id: c.id, name: c.name || c.id }; }
    }
    return { kind: 'coin', tier, coin: Math.round(coinFor(tier) * 1.5), dupe: true };
  }
  if (rng.next() < 0.55) {
    const list = CRATE_ITEMS[tier] || CRATE_ITEMS.common;
    const [id, cnt] = list[rng.int(0, list.length - 1)];
    return { kind: 'items', tier, items: [[id, cnt]] };
  }
  return { kind: 'coin', tier, coin: coinFor(tier) };
}

/** Remove a crate from the profile and return its roll ({ ok, crate, result }); the caller applies it with applyCrateResult(). */
export function openCrate(p, crateId, ctx) {
  const d = ensureDaily(p);
  const i = d.crates.findIndex((c) => c.id === crateId);
  if (i < 0) return { ok: false, reason: 'missing' };
  const crate = d.crates[i];
  const result = rollCrate(crate, ctx);
  d.crates.splice(i, 1);
  d.stats.cratesOpened = n0(d.stats.cratesOpened) + 1;
  return { ok: true, crate, result };
}

// ---------------------------------------------------------------------------------------------- reward application
/**
 * Apply a reward object { coin, xp, sxp, items, crate, title, cosmetic } to the profile through hooks:
 *   hooks.addCoins(n, why), hooks.addXp(n, why), hooks.grantCosmetic(slot, id) -> bool (default: false)
 * Items go to the ship stash (delivered by daily.js), crates to the crate list, sxp to the season track.
 * Returns a summary of what was granted.
 */
export function applyReward(p, r, hooks = {}, why = 'Daily', wallMs = Date.now()) {
  const d = ensureDaily(p);
  const out = { coin: 0, xp: 0, sxp: 0, items: [], crate: null, title: null, cosmetic: null };
  if (!r) return out;
  if (r.coin > 0) { out.coin = Math.round(r.coin); hooks.addCoins?.(out.coin, why); }
  if (r.xp > 0) { out.xp = Math.round(r.xp); hooks.addXp?.(out.xp, why); }
  if (r.items?.length) for (const [id, cnt] of r.items) { if (cnt > 0) { d.stash[id] = Math.min(999, n0(d.stash[id]) + cnt); out.items.push([id, cnt]); } }
  if (r.items?.length) markNew(d, 'stash');
  if (r.crate) out.crate = grantCrate(p, r.crate.kind, why, r.crate.tier ? { tier: r.crate.tier } : {});
  if (r.title) { if (!Array.isArray(p.titles)) p.titles = []; if (!p.titles.includes(r.title)) p.titles.push(r.title); out.title = r.title; }
  if (r.cosmetic && hooks.grantCosmetic?.(r.cosmetic.slot, r.cosmetic.id)) { out.cosmetic = r.cosmetic; markNew(d, r.cosmetic.key || `${r.cosmetic.slot}:${r.cosmetic.id}`); }
  if (r.sxp > 0) out.sxp = seasonAdd(p, r.sxp, wallMs).added;
  return out;
}
/** Apply a crate roll (cosmetic -> wardrobe, items -> stash, coin). */
export function applyCrateResult(p, res, hooks = {}, wallMs = Date.now()) {
  if (res.kind === 'cosmetic') return applyReward(p, { cosmetic: { slot: res.slot, id: res.id, key: res.key } }, hooks, 'Daily crate', wallMs);
  if (res.kind === 'items') return applyReward(p, { items: res.items }, hooks, 'Daily crate', wallMs);
  return applyReward(p, { coin: res.coin }, hooks, 'Daily crate', wallMs);
}

// ---------------------------------------------------------------------------------------------- stash (items waiting to be delivered to the ship)
export function stashList(p) {
  const d = ensureDaily(p);
  return Object.entries(d.stash).filter(([, n]) => n > 0).map(([id, n]) => [id, Math.floor(n)]);
}
/** Take at most `max` pieces (per id `perId`) for one delivery. Returns the pairs; the stash is only reduced by settleStash(). */
export function planDelivery(p, allowed = () => true, perId = 12, max = 30) {
  const out = [];
  let total = 0;
  for (const [id, n] of stashList(p)) {
    if (!allowed(id)) continue;
    const k = Math.min(n, perId, max - total);
    if (k > 0) { out.push([id, k]); total += k; }
    if (total >= max) break;
  }
  return out;
}
export function settleStash(p, delivered) {
  const d = ensureDaily(p);
  for (const [id, n] of delivered || []) { d.stash[id] = Math.max(0, n0(d.stash[id]) - n); if (!d.stash[id]) delete d.stash[id]; }
}
/** Host side validation of a delivery request. Whitelist of ids + caps; returns the clean list. */
export function sanitizeDelivery(items, isAllowedId, perId = 12, max = 30) {
  const out = [];
  let total = 0;
  if (!Array.isArray(items)) return out;
  for (const e of items.slice(0, 16)) {
    if (!Array.isArray(e)) continue;
    const id = String(e[0]), k = Math.floor(Number(e[1]));
    if (!isAllowedId(id) || !(k > 0)) continue;
    const kk = Math.min(k, perId, max - total);
    if (kk > 0) { out.push([id, kk]); total += kk; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- 4. season track
export const SEASON_NEED = (tier) => 300 + 15 * (tier - 1);   // season xp to go from tier-1 to tier
export const SEASON_TOTAL = (() => { let s = 0; for (let i = 1; i <= SEASON_TIERS; i++) s += SEASON_NEED(i); return s; })();
export const SEASON_TITLES = { 10: 'Clocked In', 20: 'Overtime Legend', 30: 'Employee of the Season' };
/** Reward of a season tier 1..30. Cosmetic crates carry a fixed tier (season crate). */
export function seasonReward(tier) {
  const r = { tier, coin: 40 + 10 * tier, items: [] };
  if (tier % 5 === 0) r.coin = 150 + 25 * tier;
  if (tier % 2 === 1) r.items.push(tier < 11 ? ['comp_circuit', 2] : tier < 21 ? ['comp_sensor', 3] : ['comp_crystal', 2]);
  if (tier % 4 === 0) r.items.push([tier < 13 ? 'shard_scrap' : tier < 25 ? 'shard_circuit' : 'shard_crystal', tier < 13 ? 3 : 2]);
  if (tier === 3) r.crate = { kind: 'season', tier: 'common' };
  if (tier === 6) r.crate = { kind: 'season', tier: 'uncommon' };
  if (tier === 12) r.crate = { kind: 'season', tier: 'rare' };
  if (tier === 18) r.crate = { kind: 'season', tier: 'rare' };
  if (tier === 24) r.crate = { kind: 'season', tier: 'epic' };
  if (tier === 30) r.crate = { kind: 'season', tier: 'legendary' };
  if (tier === 15) r.crate = { kind: 'supply' };
  if (SEASON_TITLES[tier]) r.title = SEASON_TITLES[tier];
  return r;
}
/** Roll the season over when the month changed: earned-but-unclaimed tiers are auto-collected (returns them), the track restarts. */
export function ensureSeason(p, wallMs = Date.now()) {
  const d = ensureDaily(p);
  const key = seasonKey(todayKey(p, wallMs));
  const s = d.season;
  let pending = null;
  if (s.key && s.key !== key) {
    const tiers = seasonTiersDone(s.xp).filter((t) => !s.claimed.includes(t));
    if (tiers.length) pending = { key: s.key, tiers };
    d.season = { key, xp: 0, claimed: [] };
  } else if (!s.key) s.key = key;
  return { season: d.season, rolled: pending };
}
export function seasonTiersDone(xp) {
  let left = Math.max(0, xp), t = 0;
  while (t < SEASON_TIERS && left >= SEASON_NEED(t + 1)) { left -= SEASON_NEED(t + 1); t++; }
  return Array.from({ length: t }, (_, i) => i + 1);
}
export function seasonInfo(p, wallMs = Date.now()) {
  const { season } = ensureSeason(p, wallMs);
  const done = seasonTiersDone(season.xp);
  const tier = done.length;
  let spent = 0; for (let i = 1; i <= tier; i++) spent += SEASON_NEED(i);
  const need = tier >= SEASON_TIERS ? 0 : SEASON_NEED(tier + 1);
  const claimable = done.filter((t) => !season.claimed.includes(t));
  return { key: season.key, xp: season.xp, tier, into: tier >= SEASON_TIERS ? 0 : season.xp - spent, need, maxed: tier >= SEASON_TIERS, claimed: [...season.claimed], claimable, daysLeft: daysLeftInMonth(todayKey(p, wallMs)) };
}
/** Add season xp (cap per call so a bug cannot vault the track). Returns { added, newTiers }. */
export function seasonAdd(p, xp, wallMs = Date.now()) {
  const d = ensureDaily(p);
  ensureSeason(p, wallMs);
  const before = seasonTiersDone(d.season.xp).length;
  const add = Math.max(0, Math.min(2000, Math.floor(n0(xp))));
  if (!add) return { added: 0, newTiers: [] };
  d.season.xp += add;
  const after = seasonTiersDone(d.season.xp).length;
  const newTiers = [];
  for (let t = before + 1; t <= after; t++) newTiers.push(t);
  if (newTiers.length) markNew(d, 'season');
  return { added: add, newTiers };
}
/** Claim one tier. Returns { ok, reward } (apply with applyReward). */
export function claimSeasonTier(p, tier, wallMs = Date.now()) {
  const d = ensureDaily(p);
  const info = seasonInfo(p, wallMs);
  if (!(tier >= 1 && tier <= SEASON_TIERS)) return { ok: false, reason: 'tier' };
  if (d.season.claimed.includes(tier)) return { ok: false, reason: 'claimed' };
  if (tier > info.tier) return { ok: false, reason: 'locked' };
  d.season.claimed.push(tier);
  return { ok: true, reward: seasonReward(tier), tier };
}

// ---------------------------------------------------------------------------------------------- NEW! badges
export function markNew(d, key) { if (!d.newKeys.includes(key)) d.newKeys.push(key); if (d.newKeys.length > 40) d.newKeys.shift(); }
export const isNew = (p, key) => ensureDaily(p).newKeys.includes(key);
export function clearNew(p, key) { const d = ensureDaily(p); d.newKeys = d.newKeys.filter((k) => k !== key); }

/** Things waiting for the player (main menu / HUD badge): { login, quests, weekly, crates, season, stash, total }. */
export function attention(p, wallMs = Date.now()) {
  const d = ensureQuests(p, wallMs);
  const login = loginStatus(p, wallMs).canClaim;
  const ready = (list) => list.filter((q) => questDone(q) && !q.claimed).length;
  const info = seasonInfo(p, wallMs);
  const a = { login, quests: ready(d.q.list), weekly: ready(d.w.list), crates: d.crates.length, season: info.claimable.length, stash: stashList(p).length };
  a.total = (login ? 1 : 0) + a.quests + a.weekly + a.crates + a.season;
  return a;
}
