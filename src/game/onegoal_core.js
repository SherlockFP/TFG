// ONE GOAL core (wave 8 night, docs/wave8/onegoal.md): PURE rules, no DOM / THREE, node-tested (tools/harness/onegoal.test.mjs).
// Every objective source (objectives.compute, Hiring Day, guide tutorial, facjobs, expeditions, story / patron, contracts, horde / siege / zones
// waves, the ASSIGNMENT mod ...) still adds its lines to the tracker. This file decides which ONE of them the Standard HUD shows
// (+ at most one warning). Priority follows the core verb: survive / escape > get the loot out > job > everything else.
// The rest lives on the hold-Tab FULL STATUS card (hudcalm reads objectives.full).

import { taxOf } from './feedcams_core.js';

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

// ------------------------------------------------------------------------------------------ context-true lines (wave 8 morning, docs/wave8/algoctx.md)
// Every queued Algorithm line carries a context (where it makes sense) and an expiry (seconds it may wait in the queue). A line whose context no
// longer matches (queued in orbit, the ship has landed) is dropped instead of being served late. Pure: the caller passes what the game knows.
export const QUEUE_TTL = 12;   // s a line may wait in the ticker queue (default)
/** the tags true right now: 'orbit' | 'moon' | 'company' (phase) + 'ship' | 'outdoor' | 'facility' | 'expedition' (place). `any` is always true. */
export function ctxTags(o) {
  const { phase = '', inShip = false, indoor = false, expedition = false } = o || {};
  const s = new Set(['any']);
  if (phase === 'orbit') { s.add('orbit'); s.add('ship'); }
  else if (phase === 'moon' || phase === 'company') {
    s.add(phase);
    if (inShip) s.add('ship'); else if (indoor) s.add('facility'); else { s.add('outdoor'); if (expedition) s.add('expedition'); }
  }
  return s;
}
/** ctx = undefined | 'any' | tag | [tags]: true when it matches one of `tags` */
export function ctxOk(ctx, tags) {
  if (ctx === undefined || ctx === null || ctx === 'any') return true;
  const l = Array.isArray(ctx) ? ctx : [ctx];
  if (!l.length || l.includes('any')) return true;
  return l.some((c) => tags && tags.has(c));
}
const KEY_CTX = {   // Algorithm LINES pools (loredata.js) that only make sense on a moon / in orbit
  brief_none: 'moon', brief_noise: 'moon', brief_light: 'moon', brief_greed: 'moon', brief_split: 'moon', brief_doors: 'moon', brief_coward: 'moon',
  first_scrap: 'moon', first_kill: 'moon', alone: 'moon', alarm: 'moon', midnight: 'moon', greed: 'moon', spell_spam: 'moon', extraction: 'moon',
  nudge_noise: 'moon', nudge_light: 'moon', nudge_split: 'moon', nudge_doors: 'moon', nudge_greed: 'moon', nudge_coward: 'moon', orbit_idle: 'orbit',
};
/** the context of a line: explicit d.ctx, else by pool key, else by wording ("HR:" = story beats in orbit; the terminal is in the ship) */
export function inferCtx(d) {
  if (!d) return 'any';
  if (d.ctx !== undefined && d.ctx !== null) return d.ctx;
  if (d.key && KEY_CTX[d.key]) return KEY_CTX[d.key];
  const tx = String(d.text || '');
  if (/^(HR|İK|Отдел кадров)\s?:/.test(tx)) return 'orbit';
  if (/\b(terminal|терминал\w*)/i.test(tx) || /\bterminal(de|i|in|e)?\b/i.test(tx)) return ['ship', 'orbit'];
  return 'any';
}
/** seconds a line may wait: explicit d.ttl, else QUEUE_TTL */
export const ttlOf = (d) => (d && Number.isFinite(d.ttl) && d.ttl > 0 ? d.ttl : QUEUE_TTL);
/** drop expired (item.exp <= now) and out-of-context items. Returns a new array. */
export function prune(q, now, tags) { return (q || []).filter((x) => !(x.exp > 0 && x.exp <= now) && ctxOk(x.ctx, tags)); }

// ------------------------------------------------------------------------------------------ one viewer count (algo1 owns it; overlay / tag read it)
/** 1470 -> "1,470" (no locale surprises); 10k+ -> "12K" */
export const fmtLive = (n) => { n = Math.max(0, Math.round(n || 0)); return n >= 10000 ? Math.round(n / 1000) + 'K' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

// ------------------------------------------------------------------------------------------ ONE Algorithm slot + LIVE strip (wave 9, docs/wave9/algoslot.md)
/** pool keys that are idle chatter, not a reaction to something that happened: dropped by the slot unless Settings > Chatty Algorithm is on */
export const CALM_KEYS = Object.freeze(['orbit_idle']);
export const calmDrop = (d, chatty = false) => !chatty && !!d && CALM_KEYS.includes(d.key);
/** the LIVE strip text: the ONE viewer number (algo1) in the ONE format */
export const liveText = (n) => '\u25CF LIVE ' + fmtLive(n);
/** "+300" pop next to the strip (only for a positive jump caused by an event) */
export const liveDeltaText = (d) => (d > 0 ? '+' + fmtLive(d) : '');
/** occasional one-line chat reaction: min gap between two (s) and the events that may trigger one */
export const REACT_GAP = 40;
export const REACT_KINDS = Object.freeze({ onair: 'tagged', death: 'downed', escape: 'escape', boss_hit: 'boss', dodge: 'dodge', closet: 'closet' });
/** kind = tfg:viewers reason, since = seconds since the last reaction (or Infinity), r01 = random 0..1. Returns a pool key or null */
export function reactKey(kind, since, r01) {
  const k = REACT_KINDS[kind];
  if (!k || !(since >= REACT_GAP) || r01 > 0.6) return null;
  return k;
}

// ------------------------------------------------------------------------------------------ greed line + tax preview (wave 9, docs/wave9/greed.md)
/** the carry line while on air: the values of the carried scrap -> { v: before tax, net: after the viewer tax } */
export function carryPreview(values) {
  let v = 0, net = 0;
  for (const x of values || []) { const a = Math.round(x) || 0; if (a <= 0) continue; v += a; net += taxOf(a).v; }
  return { v, net };
}
/** greed line: the day target is met (target <= 0 = covered by the scrap aboard) and there is still loot on the moon */
export const greedOn = (today, target, left) => (target <= 0 || today >= target) && left > 0;
/** the TAGGED goal only matters to someone holding scrap (an empty-handed tagged player pays nothing) */
export const taggedGoalOn = (tagged, carried) => !!tagged && carried > 0;
