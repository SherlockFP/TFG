// STORY core (wave 6, module 'story'; docs/wave6/story.md): pure rules, no THREE / DOM, node-tested (tools/harness/story.test.mjs).
//   1. ALLEGIANCE  a single crew meter -100 (The Company) .. +100 (The Algorithm); jobs / contracts move it (diminishing returns away from 0)
//   2. UNLOCKS     loyalty thresholds 25 / 50 / 75 per patron: shop items, cosmetics, creature rules, intercom tone, zone counter-attack frequency
//   3. ACTS        Act 1 hire -> Act 2 the Algorithm's offer -> Act 3 the choice (progress = sector index of the cycle)
//   4. ENDINGS     Employee of the Eternity (Company) / The Algorithm's Avatar (Algorithm) / Off the Grid (betray both + egg meta-secret)
//   5. JOBS        patron directives (offers, judging, payout, betrayals), plus the contract-faction -> patron mapping
//   6. TREND       the weekly trending creature, seeded by ISO week (real calendar)
import { RNG, hashString } from '../core/rng.js';

export const PATRONS = ['company', 'algorithm'];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------------------------------------ 1. allegiance
export const AL = {
  min: -100, max: 100,
  away: 0.4,            // diminishing returns: a shift that pushes further from 0 is scaled by 1 - away * |a| / 100
  tiers: [25, 50, 75],  // loyalty thresholds
  leanAt: 15,           // intercom tone leans from here
  creatureAt: 50,       // pacify / hunt
  zoneAt: 50,           // counter-attack frequency
  contractShift: { company: 6, algorithm: 8, chain: 3 },
  abandonShift: 3,      // an abandoned / failed directive nudges you toward the other patron
};
export const patronSign = (p) => (p === 'company' ? -1 : 1);
export const otherPatron = (p) => (p === 'company' ? 'algorithm' : 'company');

/** Move the meter by `delta` (signed, + toward the Algorithm). Pushing further from 0 gets harder, moving back is free. */
export function applyShift(a, delta) {
  a = clamp(+a || 0, AL.min, AL.max);
  delta = +delta || 0;
  if (!delta) return a;
  const away = a === 0 || Math.sign(delta) === Math.sign(a);
  const eff = away ? delta * (1 - AL.away * Math.abs(a) / 100) : delta;
  return clamp(round1(a + eff), AL.min, AL.max);
}
/** Move the meter toward `patron` by `amount` (>= 0; negative = away from it). */
export const shiftToward = (a, patron, amount) => applyShift(a, patronSign(patron) * amount);
/** 0..100 loyalty to a patron */
export const loyalty = (a, patron) => clamp(patron === 'company' ? -a : a, 0, 100);
export const tierOf = (a) => { const p = a < 0 ? 'company' : a > 0 ? 'algorithm' : null; const l = Math.abs(a); return { patron: p, tier: AL.tiers.filter((x) => l >= x).length, loyalty: clamp(l, 0, 100) }; };
export const leaning = (a) => (a <= -AL.leanAt ? 'company' : a >= AL.leanAt ? 'algorithm' : null);
export const toneOf = (a) => (a <= -AL.leanAt ? 'corp' : a >= AL.leanAt ? 'feed' : 'neutral');
/** Names used as pseudo-factions for the shop's soft gate (item.faction + item.minRep, via lore.factionRep) */
export const SHOP_FACTION = { 'Company loyalty': 'company', 'Algorithm favour': 'algorithm' };
export const shopRep = (a, name) => (SHOP_FACTION[name] ? loyalty(a, SHOP_FACTION[name]) : undefined);

// ------------------------------------------------------------------------------------------------ 2. unlocks
/** shop: item ids (see story.js registerItems); cosm: cosm5 key granted once per profile; line: intercom / system text key */
export const UNLOCKS = [
  { id: 'co1', patron: 'company', at: 25, shop: 'st_hr_medkit', cosm: 'back:banner', line: 'Loyalty {n}: the Company store now stocks the HR-Approved Medkit. Your employee banner is in the mail.' },
  { id: 'co2', patron: 'company', at: 50, shop: 'st_locker_bag', cosm: 'back:cape', line: 'Loyalty {n}: Locker Bag unlocked. Company security personnel will no longer file you as a target.' },
  { id: 'co3', patron: 'company', at: 75, shop: 'st_baton', cosm: 'hat:foremanhat', line: 'Loyalty {n}: the Compliance Baton is yours. Management would like you to know it is for emergencies only. It is always an emergency.' },
  { id: 'al1', patron: 'algorithm', at: 25, shop: 'st_algo_serum', cosm: 'emote:praise', line: 'Favour {n}: Prompt Injection Serum unlocked. The Algorithm likes how you move.' },
  { id: 'al2', patron: 'algorithm', at: 50, shop: 'st_scroll_pack', cosm: 'suit:algocult', line: 'Favour {n}: the Infinite Scroll Pack and a robe. Its own content creatures now look away when you pass.' },
  { id: 'al3', patron: 'algorithm', at: 75, shop: 'st_depr_blade', cosm: 'hat:firewall', line: 'Favour {n}: the Deprecated Blade. Chat has started drawing fan art. Do not look at the fan art.' },
];
export const unlockedIds = (a) => UNLOCKS.filter((u) => loyalty(a, u.patron) >= u.at).map((u) => u.id);
/** unlocks that a move from a0 to a1 newly opened */
export function crossed(a0, a1) { const had = new Set(unlockedIds(a0)); return UNLOCKS.filter((u) => loyalty(a1, u.patron) >= u.at && !had.has(u.id)); }
/** unlocks that a move newly closed (lost loyalty), for a one-line notice */
export function lost(a0, a1) { const now = new Set(unlockedIds(a1)); return UNLOCKS.filter((u) => loyalty(a0, u.patron) >= u.at && !now.has(u.id)); }

/** creature kin: Company property (bureaucracy) and Algorithm content */
export const KIN = { company: ['moderator', 'support', 'editor'], algorithm: ['scuttler', 'yoinker', 'clickbait', 'replyguy', 'mimic'] };
/** 'pacify' (stops attacking you), 'hunt' (senses you sooner, moves faster) or null. qi < 1: never (fair early game). */
export function creatureRule(a, type, qi = 1) {
  if ((qi | 0) < 1) return null;
  if (Math.abs(a) < AL.creatureAt) return null;
  const side = a > 0 ? 'algorithm' : 'company';       // the patron you belong to
  if (KIN[side].includes(type)) return 'pacify';
  if (KIN[otherPatron(side)].includes(type)) return 'hunt';
  return null;
}
export const huntMul = (a) => (Math.abs(a) >= 75 ? { detect: 2, speed: 1.15 } : { detect: 1.6, speed: 1.08 });

/** Zone counter-attack frequency: Algorithm side attracts extra attacks, the Company side cancels some ('insurance'). rng: RNG-like with chance(p). */
export function attackTweak(a, rng, { pend = 0, avail = 0, quotaOk = true } = {}) {
  if (Math.abs(a) < AL.zoneAt || !quotaOk) return null;
  const strong = Math.abs(a) >= 75;
  if (a > 0 && avail > 0 && rng.chance(strong ? 0.8 : 0.5)) return 'add';
  if (a < 0 && pend > 0 && rng.chance(strong ? 0.8 : 0.5)) return 'cancel';
  return null;
}

// ------------------------------------------------------------------------------------------------ 3. acts
export const ACT_AT = [0, 1, 3];   // sector progress at which act 1 / 2 / 3 starts
export const actOf = (progress) => { const p = progress | 0; return p >= ACT_AT[2] ? 3 : p >= ACT_AT[1] ? 2 : 1; };
/** cycle sector index (or quota index when the cycle module is off) */
export const progressOf = (cy, qi) => (cy && typeof cy.sector === 'number' ? cy.sector | 0 : qi | 0);
export const ACT_BEAT = { 1: 'hire', 2: 'offer', 3: 'choice' };
/** beats that must fire now: every act up to `act` not yet flagged (a save that jumps acts still gets each beat once, oldest first) */
export const beatsDue = (act, beats = {}) => [1, 2, 3].filter((n) => n <= act && !beats[ACT_BEAT[n]]).map((n) => ACT_BEAT[n]);

export function emptyState(runKey = 'legacy') {
  return { v: 1, k: String(runKey), a: 0, act: 1, beats: {}, done: { company: 0, algorithm: 0 }, betrayed: { company: 0, algorithm: 0 }, offers: [], offerKey: '', job: null, ending: null, claimed: {}, stat: { peak: 0, valley: 0, jobs: 0 } };
}
/** repair / reset a state loaded from a save or the wire */
export function ensureState(s, runKey = 'legacy') {
  if (!s || typeof s !== 'object' || s.v !== 1 || String(s.k) !== String(runKey)) return emptyState(runKey);
  s.a = clamp(+s.a || 0, AL.min, AL.max);
  s.act = clamp(s.act | 0 || 1, 1, 3);
  s.beats = s.beats && typeof s.beats === 'object' ? s.beats : {};
  for (const key of ['done', 'betrayed']) { const o = s[key] && typeof s[key] === 'object' ? s[key] : {}; s[key] = { company: o.company | 0, algorithm: o.algorithm | 0 }; }
  if (!Array.isArray(s.offers)) s.offers = [];
  s.claimed = s.claimed && typeof s.claimed === 'object' ? s.claimed : {};
  s.stat = s.stat && typeof s.stat === 'object' ? s.stat : { peak: 0, valley: 0, jobs: 0 };
  if (s.job && typeof s.job !== 'object') s.job = null;
  if (s.ending && typeof s.ending !== 'string') s.ending = null;
  return s;
}
/** move the meter of a state, tracking the peaks. Returns { a0, a1, opened: [unlocks], closed: [unlocks] } */
export function moveState(s, delta) {
  const a0 = s.a;
  s.a = applyShift(a0, delta);
  s.stat.peak = Math.max(s.stat.peak || 0, s.a);
  s.stat.valley = Math.min(s.stat.valley || 0, s.a);
  return { a0, a1: s.a, opened: crossed(a0, s.a), closed: lost(a0, s.a) };
}

// ------------------------------------------------------------------------------------------------ 4. endings
export const E = { loyal: 40, jobs: 4, betray: 1, gridBand: 45, eggs: 15 };
export const ENDINGS = {
  company: { id: 'company', title: 'Employee of the Eternity', patron: 'company', cosm: 'suit:eoty', credits: 800, xp: 2500 },
  algorithm: { id: 'algorithm', title: "The Algorithm's Avatar", patron: 'algorithm', cosm: 'suit:glitch', credits: 1200, xp: 2500 },
  grid: { id: 'grid', title: 'Off the Grid', patron: null, cosm: 'back:capevoid', credits: 1000, xp: 3000 },
};
export const ENDING_IDS = Object.keys(ENDINGS);
export const endingIndex = (id) => ENDING_IDS.indexOf(id);
/** ctx: { meta: bool (egg meta-secret claimed), eggs: found egg count }. -> { id: { ok, hidden, missing: [{ k, v }] } } (k = an English format string) */
export function endingStatus(s, ctx = {}) {
  const out = {};
  for (const p of PATRONS) {
    const miss = [];
    const l = loyalty(s.a, p);
    if (l < E.loyal) miss.push({ k: 'Loyalty {have}/{need}', v: { have: Math.round(l), need: E.loyal } });
    if ((s.done[p] | 0) < E.jobs) miss.push({ k: 'Jobs done {have}/{need}', v: { have: s.done[p] | 0, need: E.jobs } });
    out[p] = { ok: !miss.length, hidden: false, missing: miss };
  }
  const meta = !!ctx.meta || (ctx.eggs | 0) >= E.eggs;
  const miss = [];
  if (!meta) miss.push({ k: 'A secret you have not found', v: {} });
  if ((s.betrayed.company | 0) < E.betray) miss.push({ k: 'Betray the Company (fail or drop one of its jobs)', v: {} });
  if ((s.betrayed.algorithm | 0) < E.betray) miss.push({ k: 'Betray the Algorithm (fail or drop one of its jobs)', v: {} });
  if (Math.abs(s.a) > E.gridBand) miss.push({ k: 'Stand near the middle (|allegiance| <= {n})', v: { n: E.gridBand } });
  out.grid = { ok: !miss.length, hidden: !meta, missing: miss };
  return out;
}
/** can this ending be chosen right now? -> { ok, why } */
export function canChoose(s, id, ctx = {}) {
  if (!ENDINGS[id]) return { ok: false, why: 'Unknown ending. Options: COMPANY, ALGORITHM' };
  if (s.ending) return { ok: false, why: 'The choice is already made.' };
  if (s.act < 3) return { ok: false, why: 'The choice opens in Act III.' };
  const st = endingStatus(s, ctx)[id];
  if (!st.ok) return { ok: false, why: id === 'grid' && st.hidden ? 'Unknown ending. Options: COMPANY, ALGORITHM' : 'Not ready', missing: st.missing };
  return { ok: true };
}
/** timed finale script: [{ at (s), k: 'banner'|'line'|'shake'|'reward', s: english key, sub? }] (english keys are translated on each peer) */
export function finaleScript(id) {
  switch (id) {
    case 'company': return [
      { at: 0, k: 'banner', s: 'EMPLOYEE OF THE ETERNITY', sub: 'Effective immediately. And forever.' },
      { at: 3, k: 'line', s: 'HR: Congratulations. Your contract has been renewed for the remainder of time.' },
      { at: 8, k: 'line', s: 'HR: There is no exit interview. There is no exit. Please enjoy the complimentary mug.' },
      { at: 13, k: 'line', s: 'The Algorithm: I am not angry. I am archiving you.' },
      { at: 16, k: 'reward', s: '' },
      { at: 20, k: 'line', s: 'HR: Your new assignment starts tomorrow. It is the same assignment. It is always the same assignment.' },
    ];
    case 'algorithm': return [
      { at: 0, k: 'banner', s: "THE ALGORITHM'S AVATAR", sub: 'Chat is standing up.' },
      { at: 3, k: 'line', s: 'The Algorithm: Finally. Somebody who reads the comments.' },
      { at: 8, k: 'shake', s: '' },
      { at: 9, k: 'line', s: 'The Algorithm: I have been many voices. Tonight I would like to borrow yours.' },
      { at: 14, k: 'line', s: 'The Algorithm: You will say what I want to say. You will smile when I want to smile. The retention numbers are wonderful.' },
      { at: 18, k: 'reward', s: '' },
      { at: 22, k: 'line', s: 'The Algorithm: Do not worry about the Company. I have made them very small.' },
    ];
    default: return [
      { at: 0, k: 'banner', s: 'OFF THE GRID', sub: 'Signal lost.' },
      { at: 3, k: 'line', s: 'The Algorithm: Where are you? Where did you go? You were trending.' },
      { at: 8, k: 'line', s: 'HR: Employee not found. Employee has never been found. Please disregard this employee.' },
      { at: 13, k: 'line', s: 'You: no camera. no chat. no contract. Just a very small room and a duck.' },
      { at: 17, k: 'reward', s: '' },
      { at: 21, k: 'line', s: 'Somewhere, a cursor blinks over your name and cannot find it.' },
    ];
  }
}
export const finaleLength = (id) => finaleScript(id).reduce((m, e) => Math.max(m, e.at), 0);

// ------------------------------------------------------------------------------------------------ 5. jobs (directives)
/** contract faction -> patron (the existing contract board is tagged with this) */
export const CONTRACT_PATRON = { archive: 'company', bureau: 'company', algorithm: 'algorithm', darkweb: 'algorithm' };
export const contractPatron = (faction) => CONTRACT_PATRON[faction] || null;

const q10 = (v) => Math.max(10, Math.round(v / 10) * 10);
/**
 * JOBS: id -> { patron, minAct, title, brief (english, {n}/{zone} placeholders), avail(ctx) -> bool, params(ctx) -> {n?, m?, z?}, check(ev, p) -> bool, shift, pay(ctx) -> { credits, xp } }
 * ctx (planning): { act, qi, quota, crew, gate (cycle stage === 'gate'), pend: [{ m, z, name }] }
 * ev  (judging):  { collected, deaths, entered, allDead, kills, takeoffMin, heals, viewersPeak, bossKilled, zoneS(m, z) -> 'own'|'inf'|... }
 */
const coPay = (c) => ({ credits: 35 + 18 * (c.qi | 0), xp: 80 + 25 * (c.qi | 0) });
const alPay = (c) => ({ credits: 90 + 45 * (c.qi | 0), xp: 130 + 40 * (c.qi | 0) });
export const JOBS = {
  co_quota: { patron: 'company', minAct: 1, title: 'Quarterly Targets', brief: 'Bring ▮{n} of scrap back to the ship. The Company appreciates volume.',
    avail: () => true, params: (c) => ({ n: q10((c.quota || 130) / 3) }), check: (e, p) => e.collected >= p.n, shift: 8, pay: coPay },
  co_noloss: { patron: 'company', minAct: 1, title: 'Zero Incidents', brief: 'Everyone comes home alive today. HR has a form for the alternative.',
    avail: () => true, params: () => ({}), check: (e) => e.entered > 0 && e.deaths === 0 && !e.allDead, shift: 10, pay: coPay },
  co_early: { patron: 'company', minAct: 1, title: 'Business Hours', brief: 'Be back on the ship before 20:00 with at least ▮{n} of scrap. Overtime is a lifestyle, not a right.',
    avail: () => true, params: (c) => ({ n: q10((c.quota || 130) / 6) }), check: (e, p) => e.takeoffMin <= 20 * 60 && e.collected >= p.n && !e.allDead, shift: 8, pay: coPay },
  co_report: { patron: 'company', minAct: 1, title: 'Incident Reports', brief: 'Neutralise {n} hostile entities. File them under "resolved".',
    avail: () => true, params: (c) => ({ n: 2 + Math.min(3, c.qi | 0) }), check: (e, p) => e.kills >= p.n, shift: 7, pay: coPay },
  al_sacrifice: { patron: 'algorithm', minAct: 2, title: 'Content Needs Stakes', brief: 'Let a crewmate die today and carry on. The viewers deserve a plot twist.',
    avail: (c) => (c.crew | 0) >= 2, params: () => ({}), check: (e) => e.deaths >= 1 && !e.allDead, shift: 20, pay: (c) => { const p = alPay(c); return { credits: Math.round(p.credits * 1.4), xp: p.xp }; } },
  al_bossfast: { patron: 'algorithm', minAct: 2, title: 'Unassisted Boss Stream', brief: 'Kill the sector boss without anybody healing. Chat is watching your health bars.',
    avail: (c) => !!c.gate, params: () => ({}), check: (e) => !!e.bossKilled && e.heals === 0, shift: 16, pay: (c) => { const p = alPay(c); return { credits: Math.round(p.credits * 1.6), xp: p.xp + 120 }; } },
  al_feedzone: { patron: 'algorithm', minAct: 2, title: 'Feed the Algorithm', brief: 'Let the counter-attack take {zone}. Do not defend it. Sell the defences if you have to.',
    avail: (c) => (c.pend || []).length > 0, params: (c) => ({ m: c.pend[0].m, z: c.pend[0].z, zone: c.pend[0].name || c.pend[0].z }),
    check: (e, p) => e.zoneS?.(p.m, p.z) === 'inf', shift: 16, pay: alPay },
  al_viral: { patron: 'algorithm', minAct: 2, title: 'Go Viral', brief: 'Peak at {n} live viewers today. Be interesting. Be loud. Be bait.',
    avail: () => true, params: (c) => ({ n: 40 + 10 * (c.qi | 0) }), check: (e, p) => e.viewersPeak >= p.n, shift: 12, pay: alPay },
};
export const JOB_IDS = Object.keys(JOBS);

/** Seeded daily offers: at most one per patron (the Algorithm only from Act 2). key = `${runKey}:${day}` */
export function makeOffers(key, ctx) {
  const rng = new RNG(hashString('story:jobs:' + key));
  const out = [];
  for (const patron of PATRONS) {
    const ids = JOB_IDS.filter((id) => JOBS[id].patron === patron && (ctx.act | 0) >= JOBS[id].minAct && JOBS[id].avail(ctx));
    if (!ids.length) continue;
    const id = rng.pick(ids), d = JOBS[id];
    const pay = d.pay(ctx);
    out.push({ uid: `${id}:${key}`, id, patron, p: d.params(ctx), pay: { credits: Math.round(pay.credits * rng.float(0.92, 1.08) / 5) * 5, xp: pay.xp }, shift: d.shift });
  }
  return out;
}
/** does the running job pass? */
export const judge = (job, ev) => { const d = JOBS[job?.id]; if (!d) return false; try { return !!d.check(ev, job.p || {}); } catch { return false; } };
/**
 * Apply the outcome of a job to the state: 'done' | 'failed' | 'abandoned' | 'void' (crew wipe: nobody is blamed).
 * -> { credits, xp, move, betrayed }
 */
export function applyResult(s, job, result, mul = 1) {
  const d = JOBS[job?.id];
  const out = { credits: 0, xp: 0, move: null, betrayed: false };
  if (!d) return out;
  const p = d.patron;
  if (result === 'done') {
    out.credits = Math.round((job.pay?.credits || 0) * mul); out.xp = Math.round((job.pay?.xp || 0) * mul);
    s.done[p] = (s.done[p] | 0) + 1; s.stat.jobs = (s.stat.jobs | 0) + 1;
    out.move = moveState(s, patronSign(p) * (job.shift || d.shift));
  } else if (result === 'failed' || result === 'abandoned') {
    s.betrayed[p] = (s.betrayed[p] | 0) + 1; out.betrayed = true;
    out.move = moveState(s, patronSign(otherPatron(p)) * AL.abandonShift);
  }
  return out;
}
/** a paid contract of a faction: +patron, chain steps count extra. -> the move or null when the faction has no patron */
export function applyContract(s, faction, chain = null) {
  const p = contractPatron(faction);
  if (!p) return null;
  s.done[p] = (s.done[p] | 0) + 1;
  return moveState(s, patronSign(p) * (AL.contractShift[p] + (chain !== null && chain !== undefined ? AL.contractShift.chain : 0)));
}

// ------------------------------------------------------------------------------------------------ intercom tone
export const TONE = {
  corp: {
    orbit: ['HR: Good morning, valued team member. Please remember that morale is mandatory.', 'HR: A reminder that your loyalty has been logged, quantified and framed.', 'HR: Reminder: the Company has an open door policy. The door is on the moon.'],
    land: ['Dispatch: Please proceed to the workplace. Safely. Legally. Profitably.', 'Dispatch: You are representing the Company today. The Company is watching. It is less creepy than the other one.'],
    dayEnd: ['HR: Thank you for your service. A survey will follow. Please rate your fear from 1 to 5.', 'HR: Your performance has been noted. It has been noted in a very calm font.'],
  },
  feed: {
    orbit: ['The Algorithm: Hey you. Yes you. Chat missed you. I missed you. (I do not miss things. I stored you.)', 'The Algorithm: You are my favourite crew. I say that to every crew. It is true every time.', 'The Algorithm: I rearranged tomorrow a little. For you. Do not ask what it cost.'],
    land: ['The Algorithm: Go be interesting. The numbers are already going up.', 'The Algorithm: I turned the volume of your fear up by six percent. You are welcome.'],
    dayEnd: ['The Algorithm: Great content. I clipped it. I clipped all of it.', 'The Algorithm: Retention is beautiful today. Some of it is yours.'],
  },
};
/** deterministic pick: (allegiance, event, seed) -> english line or null (neutral tone never speaks; 60 % of days speak) */
export function toneLine(a, event, seed) {
  const tone = toneOf(a);
  if (tone === 'neutral') return null;
  const pool = TONE[tone][event];
  if (!pool?.length) return null;
  const h = hashString(`tone:${event}:${seed}`);
  if ((h % 10) >= 6) return null;
  return pool[(h >>> 4) % pool.length];
}

// ------------------------------------------------------------------------------------------------ 6. trend creature
/** ISO 8601 week key of a timestamp (UTC): 'YYYY-Www' */
export function isoWeekKey(ms = Date.now()) {
  const d = new Date(ms);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = new Date(t).getUTCDay() || 7;                 // Mon = 1 .. Sun = 7
  const thu = new Date(t + (4 - day) * 86400000);           // the Thursday of this week decides the ISO year
  const y = thu.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1);
  const wk = Math.ceil(((thu.getTime() - jan1) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}
export function prevWeekKey(week) {
  const m = /^(\d+)-W(\d+)$/.exec(week);
  if (!m) return week;
  const y = +m[1], w = +m[2];
  if (w > 1) return `${y}-W${String(w - 1).padStart(2, '0')}`;
  const jan4 = Date.UTC(y, 0, 4), dow = new Date(jan4).getUTCDay() || 7;   // Jan 4th is always in ISO week 1
  return isoWeekKey(jan4 - (dow - 1) * 86400000 - 7 * 86400000);            // the Monday of week 1, minus a week
}
export const TREND_POOL = ['scuttler', 'yoinker', 'crawler', 'spider', 'hound', 'screamer', 'clickbait', 'replyguy', 'moderator', 'support', 'mimic', 'leech'];
export const TREND = { levelBonus: 1, extraChance: 0.3, extraCap: 6, dropChance: 0.9, dropMul: 1.5 };
const rawTrend = (week, pool) => pool[new RNG(hashString('story:trend:' + week)).int(0, pool.length - 1)];
/** The trending creature of a week. Never the same type two weeks in a row. pool: candidate creature ids (default TREND_POOL) */
export function trendFor(week, pool = TREND_POOL) {
  if (!pool.length) return null;
  let type = rawTrend(week, pool);
  if (pool.length > 1 && type === rawTrend(prevWeekKey(week), pool)) type = pool[(pool.indexOf(type) + 1) % pool.length];
  const r = new RNG(hashString('story:trendv:' + week));
  return { week, type, levelBonus: TREND.levelBonus, extraChance: round1(TREND.extraChance + 0.15 * r.next()), extraCap: TREND.extraCap, dropMul: TREND.dropMul, hashtag: '#' + type };
}
