// FIRST-RUN core (wave 8, docs/wave8/firstrun.md): PURE rules of the "first-run message budget". No THREE / DOM, node-tested (tools/harness/firstrun.test.mjs).
//   stage      where a brand-new player is: 'hiring' (Hiring Day flow running) -> 'first' (until the first sale) -> 'early' (until quota 1 is met) -> 'free'
//   allow      which kind of message / system may fire in which stage (mapmods card, wrong door, daily event, facility job, tips...)
//   algoOk     one Algorithm line per 45 s while the budget is active (priority lines - the teaching ones - always pass)
//   lease      one card / caption on screen at a time (a higher priority may take over)
//   only       ONE objective line at a time (+ at most one warning)
// Modules consult it through `game.onboard?.fr?.x()` (optional chaining), so a missing / disposed onboard module changes nothing.

export const STAGES = ['hiring', 'first', 'early', 'free'];
const RANK = { hiring: 0, first: 1, early: 2, free: 3 };
export const ALGO_GAP = 45;   // s between two non-priority Algorithm lines while the budget is active
export const CARD_LEASE = 6;  // default seconds a card / caption keeps the screen

/** what waits until a later stage (the minimum stage at which the kind is allowed) */
export const MIN_STAGE = {
  mapmods: 'free',      // sector-map affix card + numbers: quota 1 met
  dailyEvent: 'early',  // the daily modifier (card, chips, numbers): after the first sale
  facjobs: 'early',     // facility job + landing-card rows + lever fee: after the first sale
  tips: 'early',        // the advisor's "you have not tried X" tips (the tutorial lines are separate and always pass)
  extras: 'early',      // small extras: facility-size toast, ...
};

/**
 * ctx = { mode ('staged'|'all'|null), q (quotas met), unlockAll, quick, flow ('run'|'done'|'skip'|null), sold (first sale done) }
 * Only a fresh 'staged' profile that has not met quota 1 is ever in the budget; veterans / "unlock everything" / Quick Shift are 'free'.
 */
export function stageOf(ctx = {}) {
  if (ctx.unlockAll || ctx.quick) return 'free';
  if (ctx.flow === 'run') return 'hiring';   // a running Hiring Day is always budgeted (even a forced one on a veteran profile)
  if (ctx.mode !== 'staged' || (ctx.q | 0) >= 1) return 'free';
  return ctx.sold ? 'early' : 'first';
}
/** deterministic on every peer: the very first landing of a campaign run (plans that all peers rebuild must not depend on a profile) */
export const firstDay = (run) => !!run && !run.quick && (run.day | 0) <= 1 && (run.quotaIndex | 0) <= 0;

/** [econ9] the first-sale beat only appears once the Company pays well (>= 77 %: last landing day or the deadline); selling on day 1 pays 30-38 % */
export const sellWindow = (run) => !!run && (run.daysLeft | 0) <= 1;

/** is `kind` allowed at `stage` (day = run.day for the wrong door: nothing before day 2) */
export function allow(kind, stage, day = 1) {
  if (stage === 'free') return true;
  if (kind === 'wrongdoor') return (day | 0) >= 2 && RANK[stage] >= RANK.first;   // the door never shows while Hiring Day runs
  const min = MIN_STAGE[kind];
  return !min || RANK[stage] >= RANK[min];
}

/** Algorithm line gate: nowMs / lastMs in ms. Priority lines (the teaching ones) always pass. */
export function algoOk(stage, nowMs, lastMs, pri = false) {
  if (stage === 'free' || pri) return true;
  return !(lastMs > 0) || nowMs - lastMs >= ALGO_GAP * 1000;
}

/** card lease: st = { kind, until, pri }. Returns true (and takes the lease) when the screen is free or the new one outranks the holder. */
export function lease(st, kind, nowMs, secs = CARD_LEASE, pri = 1) {
  if (st.until > nowMs && st.kind !== kind && st.pri >= pri) return false;
  st.kind = kind; st.until = nowMs + secs * 1000; st.pri = pri;
  return true;
}

/** arrival card queue (every stage): reserves the next `secs` on the shared card timeline and returns how many ms to wait before showing (0 = free now).
 *  st = { until }. Cards of the landing (soul card, sector map, wave chip, captions) call it so they show one after another instead of stacking. */
export function slot(st, nowMs, secs = CARD_LEASE) { const at = Math.max(nowMs, st.until || 0); st.until = at + secs * 1000; return Math.round(at - nowMs); }
/** ms until the card timeline is free */
export const busyMs = (st, nowMs) => Math.max(0, (st.until || 0) - nowMs);

/**
 * ONE objective at a time. lines = [{ text, kind: 'main'|'sub'|'hint'|'warn'|'bounty', done, pin, first }] in their original order.
 * Keeps: the first `warn` (midnight, deadline) + one goal = the `first` line (facility entrance) or the first `main`, else the first non-hint line.
 */
export function only(lines) {
  if (!Array.isArray(lines) || lines.length <= 1) return lines || [];
  const out = [];
  const warn = lines.find((l) => l.kind === 'warn');
  if (warn) out.push(warn);
  const goal = lines.find((l) => l.first) || lines.find((l) => l.kind === 'main' && !l.done) || lines.find((l) => l.kind === 'main') || lines.find((l) => l.kind !== 'hint' && l.kind !== 'warn') || lines.find((l) => l.kind !== 'warn');
  if (goal && goal !== warn) out.push(goal);
  return out;
}
