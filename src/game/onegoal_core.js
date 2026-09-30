// ONE GOAL core (wave 8 night, docs/wave8/onegoal.md): PURE rules, no DOM / THREE, node-tested (tools/harness/onegoal.test.mjs).
// Every objective source (objectives.compute, Hiring Day, guide tutorial, facjobs, expeditions, story / patron, contracts, horde / siege / zones
// waves, the ASSIGNMENT mod ...) still adds its lines to the tracker. This file decides which ONE of them the Standard HUD shows
// (+ at most one warning). Priority follows the core verb: survive / escape > get the loot out > job > everything else.
// The rest lives on the hold-Tab FULL STATUS card (hudcalm reads objectives.full).

/** category rank (lower = more important) */
export const TIER = Object.freeze({ survive: 0, escape: 0, loot: 1, job: 2, teach: 3, other: 4 });

/** source (the module that registered the 'objectives' listener, tagged in game.useModule) -> category of its non-warning lines */
export const SRC_CAT = Object.freeze({
  core: 'loot', onboard: 'loot', onegoal: 'escape',
  backrooms: 'escape', worlds3: 'escape',
  horde: 'survive', siege: 'survive', zones: 'survive',
  facjobs: 'job', expeditions: 'job', story: 'job', voyage: 'job', lore: 'job', cycle: 'job', cycle3: 'job', facilitysys: 'job',
  ship2: 'job', fun: 'job', gameplay2: 'job',
  guide: 'teach',
  maps5: 'other', bounty: 'other', mod: 'other',
});

/** the category of one tracker line { text, kind, done, first, lead, cat, src } */
export function catOf(l) {
  if (!l) return 'other';
  if (l.kind === 'warn') return 'survive';                 // midnight, dead, deadline, waves, purge: always the warning slot
  if (l.cat && TIER[l.cat] !== undefined) return l.cat;    // explicit tag from the source
  if (l.kind === 'hint' || l.kind === 'bounty') return 'other';
  if (l.first) return 'loot';                              // [firstrun] the entrance / Hiring Day goal
  return SRC_CAT[l.src] || 'other';
}

/** sort key: category, done lines after every open job, main before sub, `lead` / `first` lines first inside their category */
export function rankOf(l) {
  const tier = TIER[catOf(l)];
  const base = l.done ? Math.max(tier, TIER.job) + 0.5 : tier;
  const inner = (l.lead || l.first ? 0 : 0.1) + (l.kind === 'main' ? 0 : l.kind === 'sub' ? 0.02 : 0.04);
  return base + inner;
}

/** the whole tracker in priority order (Tab card / Full density). Stable for equal ranks. */
export function sortAll(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((l, i) => [l, i, rankOf(l)]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map((x) => x[0]);
}

/**
 * The Standard HUD: ONE goal line (+ at most one warning, shown first). max = 1 (Minimal) keeps only the first of the two.
 * The goal is the best non-warning line; a hint only when nothing else exists.
 */
export function resolve(lines, max = 2) {
  const all = sortAll(lines);
  if (!all.length) return [];
  const warn = all.find((l) => l.kind === 'warn');
  const goal = all.find((l) => l.kind !== 'warn' && l.kind !== 'hint' && l.kind !== 'bounty') || all.find((l) => l.kind !== 'warn');
  const out = [];
  if (warn) out.push(warn);
  if (goal) out.push(goal);
  return out.slice(0, Math.max(1, max));
}

// ------------------------------------------------------------------------------------------ message pacing for every profile
// The firstrun budget (firstrun_core.js: 1 Algorithm line / 45 s, one card at a time) now also covers veterans; on top of it the
// Algorithm is silent while the director is at a peak or the player is chased. `chatty` (Settings > Chatty Algorithm) = the old flood.
export const ALGO_GAP = 45;
export const CHASE_QUIET = 0.35;   // director.chaseLevel() above this = a chase

/** calm = { chaseLevel 0..1, peak bool }. Priority lines (teaching) pass the gap but not a chase; deaths are handled by the caller. */
export function algoOk(o) {
  const { nowMs = 0, lastMs = 0, pri = false, chatty = false, chase = 0, peak = false } = o || {};
  if (chatty) return true;
  if (!pri && (peak || chase > CHASE_QUIET)) return false;
  if (pri) return true;
  return !(lastMs > 0) || nowMs - lastMs >= ALGO_GAP * 1000;
}

// ------------------------------------------------------------------------------------------ Algorithm ticker classes (wave 8 trim, docs/wave8/trim.md)
// EVERY voice (algo1 / algo2 / lore / story / soul PA / crdirector captions / feedcams tips / guide) ends in algorithm.show. It ranks them:
// teaching > danger > flavour. Teaching (d.pri) passes the 45 s gap; danger (d.cls = 'danger': stream / director warnings) has its own 8 s gap and is
// NOT muted by a chase or a peak (it is the reason for it); flavour is the paced, chase-quiet commentary above. A higher class cuts a flavour line short.
export const CLS = Object.freeze({ teach: 0, danger: 1, flavour: 2 });
export const DANGER_GAP = 8;
const rk = (x) => CLS[x && x.cls] ?? 2;
export function classOf(d) { return d && CLS[d.cls] !== undefined ? d.cls : d && d.pri ? 'teach' : 'flavour'; }
/** danger gate: lastMs of the previous danger line (ms), chatty = off switch */
export function dangerOk(nowMs, lastMs, chatty = false) { return chatty || !(lastMs > 0) || nowMs - lastMs >= DANGER_GAP * 1000; }
/** queue insert: ranked (stable), at most `max` kept: the OLDEST line of the lowest class is dropped. Returns a new array. */
export function enqueue(q, item, max = 3) {
  const out = [...q, item].map((x, i) => [x, i]).sort((a, b) => rk(a[0]) - rk(b[0]) || a[1] - b[1]).map((x) => x[0]);
  while (out.length > max) {
    const worst = Math.max(...out.map(rk));
    out.splice(out.findIndex((x) => rk(x) === worst), 1);
  }
  return out;
}
/** words of a line, digits folded to '#', punctuation dropped (same text in a different number / case = the same line) */
export function lineWords(text) { return String(text || '').toLowerCase().replace(/\d+/g, '#').split(/[^\p{L}#]+/u).filter(Boolean); }
/** is `text` (near-)identical to one of the `seen` word lists (Jaccard >= 0.8)? */
export function nearDup(text, seen) {
  const a = new Set(lineWords(text)); if (!a.size) return false;
  for (const o of seen || []) {
    const b = new Set(o);
    let inter = 0; for (const x of a) if (b.has(x)) inter++;
    const uni = a.size + b.size - inter;
    if (uni && inter / uni >= 0.8) return true;
  }
  return false;
}
