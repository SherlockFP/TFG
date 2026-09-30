// GUIDE core (wave 4, module 'guide'): PURE logic, no DOM / three / game imports (node-testable, tools/harness/guide.test.mjs).
//   - profile state   profile.guide = { v, used:{id:ts}, shown:{id:{n,t,i}}, tut:{s,done,prog,said}, seeded }
//   - usage           markUsed / isUsed (hidden variants share the used flag of their `alias` feature)
//   - tip selection   selectTip(): respects cooldown, muted, per-feature repeat gap + max repeats, context flags, the used flags
//   - tutorial        tutInit / tutEvent / tutCurrent / tutProgress / resetTutorial (steps complete from events, in any order)
//   - lookup          findFeature(query) for GUIDE <name>, suggestCommand() for "did you mean"
import { FEATURES, TUT_STEPS, CMD_ALIAS, pick, fmt } from './guide_data.js';

export const COOLDOWN_S = 150;          // seconds between two advisor tips (a little jitter is added by the caller)
export const RELAX_GAP_S = 45;          // urgent (prio >= 9) tips may skip the cooldown after this many seconds
export const START_GRACE_S = 90;        // no tip in the first seconds of a session
export const REPEAT_GAP_MS = 25 * 60 * 1000;   // the same tip never twice within 25 minutes
export const MAX_SHOWN = 3;
export const MAX_PER_SESSION = 14;     // soft cap of advisor tips per play session (urgent ones are exempt)             // a tip is shown at most this many times per profile
export const STATE_V = 1;

const BY_ID = new Map(FEATURES.map((f) => [f.id, f]));
export const featureById = (id) => BY_ID.get(id) || null;
/** the feature whose used-flag a (possibly hidden variant) feature shares */
export const canon = (f) => (f && f.alias ? f.alias : f?.id);
export const visibleFeatures = () => FEATURES.filter((f) => !f.hidden);

/** cmd word -> feature id, and event id -> feature ids (built once) */
export const CMD_MAP = new Map();
export const EVT_MAP = new Map();
export const PANEL_MAP = new Map();
export const KEY_MAP = new Map();
for (const f of FEATURES) {
  const id = canon(f);
  for (const c of f.cmds || []) if (!CMD_MAP.has(c)) CMD_MAP.set(c, id);
  for (const k of f.keys || []) if (!KEY_MAP.has(k)) KEY_MAP.set(k, id);
  if (f.evt && !EVT_MAP.has(f.evt)) EVT_MAP.set(f.evt, id);
  if (f.panel && !PANEL_MAP.has(f.panel)) PANEL_MAP.set(f.panel, id);
}

// ------------------------------------------------------------------ profile state
export function ensureState(p) {
  if (!p || typeof p !== 'object') return null;
  let g = p.guide;
  if (!g || typeof g !== 'object' || Array.isArray(g)) g = p.guide = {};
  g.v = STATE_V;
  if (!g.used || typeof g.used !== 'object') g.used = {};
  if (!g.shown || typeof g.shown !== 'object') g.shown = {};
  if (!g.tut || typeof g.tut !== 'object') g.tut = {};
  if (!g.tut.done || typeof g.tut.done !== 'object') g.tut.done = {};
  if (!g.tut.prog || typeof g.tut.prog !== 'object') g.tut.prog = {};
  if (!g.tut.said || typeof g.tut.said !== 'object') g.tut.said = {};
  return g;
}
export const isUsed = (g, id) => !!g.used[canon(BY_ID.get(id)) || id];
/** returns true when this is the first time the feature was used */
export function markUsed(g, id, now = Date.now()) {
  const f = BY_ID.get(id);
  const key = f ? canon(f) : id;
  if (g.used[key]) return false;
  g.used[key] = now;
  return true;
}
export const usedCount = (g) => visibleFeatures().filter((f) => g.used[f.id]).length;

// ------------------------------------------------------------------ tip selection
/** `needs`: a module name, 'cmd:<word>' or an array of them (any one is enough); opts.has(name) answers for the live game */
export function needsOk(f, opts = {}) {
  if (!f.needs) return true;
  const list = Array.isArray(f.needs) ? f.needs : [f.needs];
  return list.some((n) => (opts.has ? !!opts.has(n) : false));
}
function featureOk(f, g, flags, opts) {
  if (!needsOk(f, opts)) return false;
  if (f.minLevel && (opts.level || 1) < f.minLevel) return false;
  if (g.used[canon(f)]) return false;
  for (const w of f.when || []) if (!flags.has(w)) return false;
  return true;
}
/** score used for both tip picking and the GUIDE list order (higher = more relevant right now) */
export function scoreFeature(f, g, flags) {
  const ctx = (f.when || []).length;
  const sh = g.shown[f.id];
  return f.prio + (ctx ? 3 + ctx : 0) - (sh ? sh.n * 2 : 0);
}
/**
 * Pick the tip to show now, or null.
 * g      guide state (ensureState)          flags  Set of context flag names
 * sess   { t: session seconds, lastTipT: session second of the last tip (-Infinity at start), muted: bool, tutorial: bool, count: tips shown this session }
 * opts   { rng: () => 0..1, now: epoch ms, cooldown: s, has: (moduleName) => bool, level }
 */
export function selectTip(g, flags, sess, opts = {}) {
  if (sess.muted || sess.tutorial) return null;
  const rng = opts.rng || Math.random;
  const now = opts.now ?? Date.now();
  const cooldown = opts.cooldown ?? COOLDOWN_S;
  if (sess.t < (opts.grace ?? START_GRACE_S)) return null;
  const elapsed = sess.t - (sess.lastTipT ?? -Infinity);
  if (elapsed < RELAX_GAP_S) return null;
  const relaxed = elapsed < cooldown;          // inside the cooldown: only urgent tips may pass
  const cands = [];
  for (const f of FEATURES) {
    if (!f.tips?.length) continue;
    if (!featureOk(f, g, flags, opts)) continue;
    if (relaxed && f.prio < 9) continue;
    if ((sess.count || 0) >= MAX_PER_SESSION && f.prio < 9) continue;
    const sh = g.shown[f.id];
    if (sh && (sh.n >= MAX_SHOWN || now - sh.t < REPEAT_GAP_MS)) continue;
    cands.push({ f, score: scoreFeature(f, g, flags) + rng() * 1.5 });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  const f = cands[0].f;
  const sh = g.shown[f.id];
  const i = f.tips.length > 1 ? ((sh ? sh.i + 1 : Math.floor(rng() * f.tips.length)) % f.tips.length) : 0;
  return { id: f.id, canon: canon(f), i, feature: f, tip: f.tips[i] };
}
export function recordShown(g, id, i, now = Date.now()) {
  const sh = g.shown[id] || (g.shown[id] = { n: 0, t: 0, i: 0 });
  sh.n += 1; sh.t = now; sh.i = i;
}
/** things the player has not tried, most relevant first (for GUIDE / ALGO TIPS) */
export function untried(g, flags, opts = {}) {
  const out = [];
  for (const f of visibleFeatures()) {
    if (g.used[f.id]) continue;
    if (!needsOk(f, opts)) continue;
    // a feature is "relevant now" when one of its context-tips (own or hidden variants) has all its flags
    let rel = 0;
    for (const v of FEATURES) if ((v === f || v.alias === f.id) && (v.when || []).length && v.when.every((w) => flags.has(w))) rel = Math.max(rel, 1 + v.when.length);
    out.push({ f, rel, score: f.prio + rel * 3 - ((g.shown[f.id]?.n || 0) * 0.5) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// ------------------------------------------------------------------ lookup
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9а-яёçğıöşü]/g, '');
export function findFeature(query, lang = 'en') {
  const q = norm(query);
  if (!q) return null;
  const vis = visibleFeatures();
  const alias = CMD_ALIAS[String(query).toLowerCase().trim()];
  if (alias && BY_ID.get(alias)) return BY_ID.get(alias);
  const byId = vis.find((f) => f.id === q || norm(f.id) === q);
  if (byId) return byId;
  const byCmd = CMD_MAP.get(String(query).toLowerCase().trim());
  if (byCmd && BY_ID.get(byCmd) && !BY_ID.get(byCmd).hidden) return BY_ID.get(byCmd);
  const names = (f) => [pick(f.name, lang), pick(f.name, 'en'), f.key || ''].map(norm);
  const exact = vis.find((f) => names(f).includes(q));
  if (exact) return exact;
  return vis.find((f) => names(f).some((n) => n.startsWith(q))) || (q.length >= 3 ? vis.find((f) => names(f).some((n) => n.includes(q))) : null) || null;
}

// ------------------------------------------------------------------ "did you mean"
export function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export function suggestCommand(word, names) {
  const w = String(word || '').toLowerCase();
  if (w.length < 2) return null;
  let best = null, bd = 99;
  for (const n of names) {
    if (n === w) return n;
    let d = lev(w, n);
    if (n.startsWith(w) || w.startsWith(n)) d = Math.min(d, 1);
    if (d < bd) { bd = d; best = n; }
  }
  const lim = w.length <= 3 ? 1 : 2;
  return bd <= lim ? best : null;
}

// ------------------------------------------------------------------ panel classification (DOM-free: uses classList / querySelector only)
const PANEL_RULES = [
  ['tinv', 'inventory'], ['forge', 'forge'], ['shop', 'shop'], ['shipyard', 'shipyard'], ['hwp', 'homeworld'], ['trd', 'trade'], ['wd', 'wardrobe'],
  ['rl', 'roles'], ['lb', 'contracts'], ['rec', 'record'], ['crp', 'crafting'], ['drp', 'repair'],
];
const has = (el, sel) => { try { return !!(el.matches?.(sel) || el.querySelector?.(sel)); } catch { return false; } };
export function classifyPanel(el) {
  if (!el || !el.classList) return null;
  if (has(el, '.pt')) return has(el, '.pt-slot') ? 'pets' : 'tree';
  for (const [c, id] of PANEL_RULES) if (el.classList.contains(c) || (c !== 'shop' && c !== 'forge' && has(el, '.' + c))) return id;
  if (typeof el.className === 'string' && /daily|drw/i.test(el.className)) return 'daily';
  return null;
}

// ------------------------------------------------------------------ tutorial
export const TUT_TOTAL = TUT_STEPS.length;
const MOVE_DIST = 8;
export const MOVE_FREE = 40;   // [onegoal] walking this far proves you can move: the step no longer waits for a crouch forever ("TUTORIAL 1/7" stuck)
/**
 * First call for a profile decides whether the player gets the tutorial: veterans (they already played) are skipped silently.
 * s: 'run' | 'done' | 'skip'
 */
export function tutInit(g, veteran = false) {
  const T = g.tut;
  if (T.s) return T.s;
  T.s = veteran ? 'skip' : 'run';
  if (veteran) T.auto = 1;
  T.startedAt = Date.now();
  return T.s;
}
export const tutRunning = (g) => g.tut.s === 'run';
export const tutDoneCount = (g) => TUT_STEPS.filter((s) => g.tut.done[s.id]).length;
export function tutCurrent(g) {
  if (g.tut.s !== 'run') return null;
  return TUT_STEPS.find((s) => !g.tut.done[s.id]) || null;
}
/** 0..1 partial progress of a step (only 'move' has sub-goals) */
export function tutStepProgress(g, id) {
  if (g.tut.done[id]) return 1;
  if (id === 'move') { const p = g.tut.prog; return Math.min(1, ((Math.min(MOVE_DIST, p.dist || 0) / MOVE_DIST) + (p.sprint ? 1 : 0) + (p.crouch ? 1 : 0)) / 3); }
  return 0;
}
/**
 * Feed a gameplay event. ev: 'move' {d, sprint, crouch} | 'flash' | 'scrap' | 'inv' | 'scan' | 'ship' | 'sell'.
 * Returns { steps: [ids completed now], finished: bool }. Steps complete in any order; the tutorial finishes when all are done.
 */
export function tutEvent(g, ev, data = {}) {
  const T = g.tut;
  const out = { steps: [], finished: false };
  if (T.s !== 'run') return out;
  if (ev === 'move') {
    const p = T.prog;
    p.dist = Math.min(1e4, (p.dist || 0) + Math.max(0, Math.min(3, data.d || 0)));
    if (data.sprint) p.sprint = 1;
    if (data.crouch) p.crouch = 1;
  }
  for (const s of TUT_STEPS) {
    if (T.done[s.id] || !s.ev.includes(ev)) continue;
    if (s.id === 'move' && !((T.prog.dist || 0) >= MOVE_DIST && ((T.prog.sprint && T.prog.crouch) || (T.prog.dist || 0) >= MOVE_FREE))) continue;
    T.done[s.id] = Date.now();
    out.steps.push(s.id);
  }
  if (out.steps.length && tutDoneCount(g) >= TUT_TOTAL) { T.s = 'done'; T.finishedAt = Date.now(); out.finished = true; }
  return out;
}
/** [onegoal] credit steps another teacher already covered (Hiring Day teaches move / light / scrap). Returns tutEvent's shape. */
export function tutCredit(g, ids) {
  const T = g.tut, out = { steps: [], finished: false };
  if (T.s !== 'run') return out;
  for (const id of ids) if (!T.done[id] && TUT_STEPS.some((s) => s.id === id)) { T.done[id] = Date.now(); out.steps.push(id); }
  if (out.steps.length && tutDoneCount(g) >= TUT_TOTAL) { T.s = 'done'; T.finishedAt = Date.now(); out.finished = true; }
  return out;
}
export function tutSkip(g) { if (g.tut.s === 'run') { g.tut.s = 'skip'; g.tut.skippedAt = Date.now(); return true; } return false; }
/** restart from scratch (settings / TUTORIAL RESTART); advisor tip history stays */
export function resetTutorial(profile) {
  const g = ensureState(profile);
  if (!g) return null;
  g.tut = { s: 'run', done: {}, prog: {}, said: {}, startedAt: Date.now(), runs: (g.tut?.runs || 0) + 1 };
  return g;
}
/** the text of a step for the current situation (objective line) */
export function stepObjective(step, lang, cond = {}) {
  const vars = { price: 15, key: 'F', ...cond };
  if (step.objDock && cond.docked) return fmt(pick(step.objDock, lang), vars);
  if (step.obj2 && cond.hasFlashlight) return fmt(pick(step.obj2, lang), vars);
  if (step.objBag && cond.bagFlashlight) return fmt(pick(step.objBag, lang), vars);
  return fmt(pick(step.obj, lang), vars);
}

// ------------------------------------------------------------------ text helpers
export function tipText(feature, i, lang, vars = {}) { return fmt(pick(feature.tips[i] || feature.tips[0], lang), vars); }
export const firstSentence = (s, max = 118) => {
  const one = String(s).split('\n')[0];
  const m = /^(.+?[.!?])(\s|$)/.exec(one);
  let r = m ? m[1] : one;
  if (r.length > max) r = r.slice(0, max - 1).trimEnd() + '…';
  return r;
};
