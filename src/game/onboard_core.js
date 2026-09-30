// ONBOARD core (wave 5, MASTERPLAN 25.1 "Hiring Day" + 23.1 staged unlocks). PURE rules, no THREE / DOM, node-tested (tools/harness/onboard.test.mjs).
//   flow      a linear list of steps completed by ACCUMULATING FACTS (an event sets a fact, the current step is the first one whose need() is still
//             false), so events may arrive early / out of order and the machine never gets stuck.
//   skip      shouldRun(ctx): returning players, veterans, friend lobbies, loaded saves, dev auto-host, settings switch.
//   unlocks   runtime feature access is immediate; pure staged rules remain for legacy schedule compatibility.
// State lives in profile.onboard (flow) and profile.unlocks (schedule); both survive save / load (plain JSON).

export const V = 1;
/** scrap value the first landing asks for (the Hiring Day objective) */
export const GOAL = 50;

// ------------------------------------------------------------------------------------------------ flow
/** id, stage (where the player is), need(f) = has the step been satisfied by the facts */
export const STEPS = [
  { id: 'wake', stage: 'wing', need: (f) => !!f.announced },
  { id: 'walk', stage: 'wing', need: (f) => (f.dist || 0) >= WALK_DIST },
  { id: 'crouch', stage: 'wing', need: (f) => !!f.crouched },
  { id: 'sprint', stage: 'wing', need: (f) => !!f.sprinted },
  { id: 'locker', stage: 'wing', need: (f) => !!f.locker },
  { id: 'flash', stage: 'wing', need: (f) => !!f.flash },
  { id: 'loot', stage: 'wing', need: (f) => !!f.loot },
  { id: 'blackout', stage: 'wing', need: (f) => !!f.blackout },
  { id: 'lock', stage: 'wing', need: (f) => !!f.lock },
  { id: 'hangar', stage: 'wing', need: (f) => !!f.boarded },
  { id: 'terminal', stage: 'ship', need: (f) => !!f.terminal },
  { id: 'lever', stage: 'ship', need: (f) => !!f.lever },
  { id: 'door', stage: 'field', need: (f) => !!f.door },
  { id: 'field', stage: 'field', need: (f) => !!f.returned },
  { id: 'return', stage: 'return', need: (f) => !!f.summary },
];
export const STEP_IDS = STEPS.map((s) => s.id);
export const WALK_DIST = 10;   // m walked before the "walk" step counts
export const SPRINT_FAILS_FREE = 3;   // the shutter is held open for you after this many misses

export function newFlow() {
  return { v: V, s: 'run', f: { dist: 0, lockTries: 0, shutterFails: 0, side: 0, sideN: 0, collected: 0, deaths: 0 }, startedAt: 0 };
}
/** repair anything loaded from a save (garbage in -> a usable flow) */
export function ensureFlow(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== V) return null;
  if (!['run', 'done', 'skip'].includes(o.s)) return null;
  const n = newFlow();
  n.s = o.s; n.why = typeof o.why === 'string' ? o.why : undefined; n.startedAt = Number.isFinite(o.startedAt) ? o.startedAt : 0; n.finishedAt = Number.isFinite(o.finishedAt) ? o.finishedAt : undefined;
  if (o.f && typeof o.f === 'object') for (const k of Object.keys(o.f)) if (Number.isFinite(o.f[k]) || typeof o.f[k] === 'boolean') n.f[k] = o.f[k];
  return n;
}
/** index of the first unsatisfied step (STEPS.length when everything is done) */
export function stepIndex(flow) {
  for (let i = 0; i < STEPS.length; i++) if (!STEPS[i].need(flow.f)) return i;
  return STEPS.length;
}
export const currentStep = (flow) => STEPS[stepIndex(flow)] || null;
export const stageOf = (flow) => (flow.s !== 'run' ? 'done' : currentStep(flow)?.stage || 'done');
export const isRunning = (flow) => !!flow && flow.s === 'run';
export function progress(flow) { return { done: stepIndex(flow), total: STEPS.length, id: currentStep(flow)?.id || null }; }

const BOOL_EVENTS = {
  announced: 'announced', crouched: 'crouched', sprinted: 'sprinted', locker: 'locker', flash: 'flash', loot: 'loot', blackout: 'blackout',
  boarded: 'boarded', terminal: 'terminal', lever: 'lever', door: 'door', returned: 'returned', summary: 'summary',
};
/**
 * Feed one event. Returns { done: [step ids completed by this event], step: the new current step id | null, finished: bool }.
 * Events: the names in BOOL_EVENTS, 'moved' {d, x}, 'lock' {tries}, 'shutterFail', 'collected' {n}, 'death'.
 */
export function note(flow, ev, data = {}) {
  const out = { done: [], step: null, finished: false };
  if (!flow || flow.s !== 'run') return out;
  const before = stepIndex(flow);
  const f = flow.f;
  if (BOOL_EVENTS[ev]) f[BOOL_EVENTS[ev]] = true;
  else if (ev === 'moved') {
    f.dist = Math.min(1e5, (f.dist || 0) + Math.max(0, Math.min(3, data.d || 0)));
    if (Number.isFinite(data.x) && (data.d || 0) > 0) { f.sideN = (f.sideN || 0) + 1; f.side = (f.side || 0) + (data.x - (f.side || 0)) / f.sideN; }   // running mean of the lateral offset in the corridor
  } else if (ev === 'lock') { f.lockTries = Math.max(f.lockTries || 0, data.tries | 0); f.lock = true; }
  else if (ev === 'lockTry') f.lockTries = (f.lockTries || 0) + 1;
  else if (ev === 'shutterFail') f.shutterFails = (f.shutterFails || 0) + 1;
  else if (ev === 'collected') f.collected = Math.max(f.collected || 0, data.n | 0);
  else if (ev === 'death') f.deaths = (f.deaths || 0) + 1;
  const after = stepIndex(flow);
  for (let i = before; i < after; i++) out.done.push(STEPS[i].id);
  out.step = STEPS[after]?.id || null;
  if (after >= STEPS.length) { flow.s = 'done'; flow.finishedAt = Date.now(); out.finished = true; }
  return out;
}
/** jump ahead: mark every fact up to (not including) step `id` as true (an interrupted wing, a skipped ship intro) */
export function forceTo(flow, id) {
  const k = STEP_IDS.indexOf(id);
  if (k < 0 || !flow || flow.s !== 'run') return false;
  const F = { wake: 'announced', crouch: 'crouched', sprint: 'sprinted', locker: 'locker', flash: 'flash', loot: 'loot', blackout: 'blackout', lock: 'lock', hangar: 'boarded', terminal: 'terminal', lever: 'lever', door: 'door', field: 'returned', return: 'summary' };
  for (let i = 0; i < k; i++) {
    const s = STEP_IDS[i];
    if (s === 'walk') flow.f.dist = Math.max(flow.f.dist || 0, WALK_DIST);
    else if (F[s]) flow.f[F[s]] = true;
  }
  return true;
}
export function skipFlow(flow, why = 'skip') { if (flow && flow.s === 'run') { flow.s = 'skip'; flow.why = why; flow.finishedAt = Date.now(); return true; } return false; }

// ------------------------------------------------------------------------------------------------ who gets Hiring Day
/** the same "already played" test the guide uses (stats that only a played day produces; `runs` is left out: quitting Hiring Day must not skip it next time) */
export function isVeteran(p) {
  const st = (p && p.stats) || {};
  return (st.days || 0) > 0 || (st.quotasMet || 0) > 0 || (p?.level || 1) >= 4 || (st.scrapCollected || 0) > 0 || (st.sold || 0) > 0;
}
/** Message/hazard pacing is separate from access. A first-shift pickup or sale is not an experienced player. */
export function pacingMode(p, run) {
  const st=p?.stats||{};
  const firstShift=run && !run.quick && (run.day|0)<=1 && (run.quotaIndex|0)<=0;
  const established=(st.days||0)>0 || (st.quotasMet||0)>0 || (p?.level||1)>=4;
  return isVeteran(p) && (!firstShift || established) ? 'all' : 'staged';
}
/**
 * ctx = { profile, settings, isHost, hasRunData, phase, quotaIndex, day, devAuto, forced, crew }
 * -> { run: bool, why: string, mark: 'skip' | null }  (mark = write the skip flag into the profile so a later game does not ask again)
 */
export function shouldRun(ctx) {
  const p = ctx.profile || {};
  const o = ensureFlow(p.onboard);
  if (ctx.forced) return { run: true, why: 'forced', mark: null };
  if (ctx.settings && ctx.settings.skipHiringDay) return { run: false, why: 'setting', mark: null };
  if (o && o.s === 'done') return { run: false, why: 'done', mark: null };
  if (o && o.s === 'skip') return { run: false, why: 'flag', mark: null };
  if (ctx.quick) return { run: false, why: 'quick', mark: null };   // QUICK SHIFT (hubgate): straight to work, Hiring Day stays for the campaign
  if (ctx.devAuto) return { run: false, why: 'dev', mark: null };
  if (isVeteran(p)) return { run: false, why: 'veteran', mark: 'skip' };
  if (!ctx.isHost) return { run: false, why: 'joined', mark: 'skip' };
  if (ctx.hasRunData) return { run: false, why: 'save', mark: null };
  if ((ctx.phase && ctx.phase !== 'orbit') || (ctx.quotaIndex | 0) > 0 || (ctx.day | 0) > 1) return { run: false, why: 'late', mark: null };
  return { run: true, why: 'fresh', mark: null };
}

// ------------------------------------------------------------------------------------------------ the Algorithm's first remark
/** facts -> { id, vars }; the text table lives in onboard_text.js (rem.<id>) */
export function remarkFor(f) {
  const n = (v) => Math.max(0, v | 0);
  if (n(f.deaths) > 0) return { id: 'died', vars: { n: n(f.deaths) } };
  if (n(f.collected) < GOAL) return { id: 'short', vars: { n: n(f.collected), goal: GOAL } };
  if (n(f.lockTries) >= 3) return { id: 'lock', vars: { n: n(f.lockTries) } };
  if (n(f.shutterFails) >= 2) return { id: 'shutter', vars: { n: n(f.shutterFails) } };
  if (Math.abs(f.side || 0) >= 0.18) return { id: (f.side || 0) < 0 ? 'left' : 'right', vars: {} };
  return { id: 'clean', vars: { n: n(f.collected) } };
}

// ------------------------------------------------------------------------------------------------ staged unlocks (MASTERPLAN 23.1)
/** q = quotas the crew has met, boss = first sector boss killed.  Wave 8 (hubgate): the side systems open one by one behind the ship's Hub door
 *  (docs/wave8/hubgate.md). What each id switches off lives in hubgate_core.js (SYSTEMS). */
export const UNLOCKS = [
  { id: 'shop', sale: true }, { id: 'tree', sale: true },   // the first sale at the Company desk (about the end of day 1-3), not quota 1
  { id: 'arcade', q: 1 }, { id: 'pets', q: 1 },
  { id: 'homeworld', q: 2 }, { id: 'farming', q: 2 }, { id: 'restaurant', q: 2 },
  { id: 'forge', q: 3 }, { id: 'zones', q: 3 },
  { id: 'voyage', q: 4 }, { id: 'season', q: 4 },
  { id: 'gates', boss: true },
];
/** ONE wardrobe piece handed over with each unlock: an ordered candidate list [slot:id, ...] (cosmetics.js; entry() must know each). The first one the profile does
 *  not own yet is granted. Primary picks avoid pieces whose own earn rule fires around the same moment (plushie = quota 1, beanie = level 2, ...). */
const G = (...keys) => keys.map((k) => { const [slot, id] = k.split(':'); return { slot, id }; });
export const GIFTS = {
  shop: G('hat:hardhat', 'hat:cone', 'hat:beanie'), tree: G('hat:wizard', 'hat:propeller', 'hat:tophat'),
  arcade: G('face:shades', 'face:visor', 'face:led'), pets: G('back:plushfrog', 'back:balloons', 'back:lunchbox'),
  homeworld: G('suit:soviet', 'suit:construction'), farming: G('hat:cowboy', 'hat:bucket'), restaurant: G('hat:chef', 'face:moustache'),
  forge: G('hat:cablecoil', 'hat:headlamp'), zones: G('suit:tracksuit', 'suit:viking'),
  voyage: G('back:fieldradio', 'back:parachute', 'back:antenna'), season: G('suit:viking', 'suit:modarmor', 'suit:knight'),
  gates: G('face:visor', 'face:gasmask'),
};
export const giftsOf = (id) => GIFTS[id] || [];
export const giftOf = (id) => GIFTS[id]?.[0] || null;
export const UNLOCK_IDS = UNLOCKS.map((u) => u.id);

export function ensureUnlocks(p) {
  if (!p || typeof p !== 'object') return null;
  let u = p.unlocks;
  if (!u || typeof u !== 'object' || Array.isArray(u) || u.v !== V) u = p.unlocks = { v: V, mode: null, q: 0, boss: false, sale: false, given: {} };
  if (u.mode !== 'staged' && u.mode !== 'all') u.mode = null;
  if (!Number.isFinite(u.q)) u.q = 0;
  u.boss = !!u.boss;
  u.sale = !!u.sale;
  if (!u.given || typeof u.given !== 'object' || Array.isArray(u.given)) u.given = {};
  return u;
}
/** Runtime policy: fresh and saved staged profiles have all feature access; earned records remain intact. */
export function decideMode(p) {
  const u = ensureUnlocks(p);
  // Feature access is immediate; earned progress and existing gift records stay intact.
  u.mode = 'all';
  return u.mode;
}
/** pure progress of a run: quotas met + first boss */
export function progressOf(run, u) {
  const r = run || {};
  if (r.quick) return { q: 0, boss: false, sale: false };   // QUICK SHIFT (hubgate) never advances the ladder
  const cy = r.cycle || {};
  const boss = !!(cy.firstKills && Object.keys(cy.firstKills).length) || (cy.sector | 0) > 0 || (cy.cores | 0) > 0 || !!cy.bossDead;
  const q = Math.max(0, r.quotaIndex | 0);
  return { q, boss, sale: q > 0 || (r.sold | 0) > 0 };   // the first sale = credits sold at the Company desk (host.js run.sold)
}
/** fold the run's progress into the profile record (never decreases: a second run keeps what the first one earned) */
export function fold(u, prog) {
  let ch = false;
  if (prog.q > u.q) { u.q = prog.q; ch = true; }
  if (prog.boss && !u.boss) { u.boss = true; ch = true; }
  if (prog.sale && !u.sale) { u.sale = true; ch = true; }
  return ch;
}
export function isOpen(id, u, prog, unlockAll = false) {
  const def = UNLOCKS.find((x) => x.id === id);
  if (!def) return true;   // unknown ids are never locked
  if (unlockAll || !u || u.mode === 'all') return true;
  const q = Math.max(u.q | 0, prog?.q | 0), boss = !!(u.boss || prog?.boss);
  if (def.boss) return boss;
  if (def.sale) return q >= 1 || !!(u.sale || prog?.sale);
  return q >= (def.q | 0);
}
export const isLockedId = (id, u, prog, unlockAll) => !isOpen(id, u, prog, unlockAll);
/** systems that just opened and were not yet gifted (staged profiles only) */
export function pendingGifts(u, prog, unlockAll = false) {
  if (!u || u.mode !== 'staged' || unlockAll) return [];
  return UNLOCK_IDS.filter((id) => !u.given[id] && isOpen(id, u, prog, false));
}
export function markGiven(u, id, at = Date.now()) { if (u && UNLOCK_IDS.includes(id) && !u.given[id]) { u.given[id] = at; return true; } return false; }
/** what unlocks next (for the terminal / locked message): { id, need } sorted by requirement */
export function requirementText(id) {
  const def = UNLOCKS.find((x) => x.id === id);
  if (!def) return null;
  return def.boss ? { boss: true } : def.sale ? { sale: true } : { q: def.q };
}
