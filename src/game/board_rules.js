// THE BOARD (pure rules): the tabletop survival game The Administrator sends people to. No three.js, no DOM, no game object:
// the host runs `createSession / rollDie / applyRoll / applyDuel / advance`, every peer replays the returned EVENTS for presentation.
// Node-tested by tools/harness/board.test.mjs. See docs/wave2/boardgame.md.
//
// A session is a ring of 24 tiles (0 = START, 23 = EXIT). Every unfinished player takes one turn per ROUND; the team must have
// everyone on EXIT before round 12 is over. Exact finish: a roll that would overshoot EXIT bounces back by the excess.
// Every random decision comes from ONE seeded, logged BoardRng (die, deck shuffle, loot, duel parameters), so a session is
// replayable from `seed` + the sequence of player actions.
import { RNG } from '../core/rng.js';
import { tierIndex, tierOfItem } from './tiers.js';

export const RULES = Object.freeze({
  TURNS: 12, LEN: 24, EXIT: 23, DIE: 6, OVERSHOOT_FREE: 1,   // a roll that overshoots EXIT by <= 2 still finishes; more bounces back
  TRAP_BACK: 2, HP_KEEP: 0.10,                 // fail: HP is cut to 10 % of the maximum ("TERMS ENFORCED")
  TRAP_FRAC: 0.15, REST_FRAC: 0.10, MEND_FRAC: 0.15, TOLL_FRAC: 0.12, DUEL_LOSE_FRAC: 0.10,
  DUEL_WIN_STEPS: 3, DUEL_LOSE_STEPS: 3,
  GAZE_SEC: 2, GAZE_RANGE: 20, GAZE_RADIUS: 0.55, GROUP_RANGE: 10,
  APPEAR_CHANCE: 0.04, MIN_QUOTA: 1,
  TURN_TIMEOUT_MS: 30000, DUEL_TIMEOUT_MS: 14000,
});

export const TILE = Object.freeze({ START: 'start', LOOT: 'loot', TRAP: 'trap', CARD: 'card', DUEL: 'duel', SHORT: 'short', REST: 'rest', EXIT: 'exit' });
const { START, LOOT, TRAP, CARD, DUEL, SHORT, REST, EXIT } = TILE;
export const LAYOUT = Object.freeze([
  START, LOOT, CARD, TRAP, SHORT, REST, DUEL,      // 0..6   south side, west -> east (6 = SE corner)
  LOOT, CARD, TRAP, LOOT, CARD, DUEL,              // 7..12  east side, south -> north (12 = NE corner)
  TRAP, SHORT, LOOT, CARD, REST, DUEL,             // 13..18 north side, east -> west (18 = NW corner)
  TRAP, CARD, LOOT, TRAP, EXIT,                    // 19..23 west side, north -> south (23 = EXIT, next to START)
]);
/** SHORTCUT tiles: landing here jumps forward (the arrival tile does not trigger). */
export const SHORTCUTS = Object.freeze({ 4: 8, 14: 17 });
export const tileType = (i) => LAYOUT[i] || START;

/** grid cell (-3..3) of ring tile i: the board is a 7x7 square ring, START on the south-west corner. */
export function ringCell(i) {
  i = ((i % 24) + 24) % 24;
  if (i <= 6) return { gx: -3 + i, gz: 3 };
  if (i <= 12) return { gx: 3, gz: 3 - (i - 6) };
  if (i <= 18) return { gx: 3 - (i - 12), gz: -3 };
  return { gx: -3, gz: -3 + (i - 18) };
}

export const CARDS = Object.freeze([
  { id: 'fwd2', w: 2, name: 'Tailwind', text: 'Move forward 2 spaces.' },
  { id: 'back3', w: 4, name: 'Rewind', text: 'Move back 3 spaces.' },
  { id: 'skip', w: 3, name: 'Paperwork', text: 'Lose your next turn.' },
  { id: 'double', w: 2, name: 'Loaded Dice', text: 'Roll again.' },
  { id: 'swap', w: 2, name: 'Reassignment', text: 'Swap places with the crewmate farthest from you.' },
  { id: 'steal', w: 2, name: 'Sticky Fingers', text: 'Steal loot from a crewmate.' },
  { id: 'toll', w: 2, name: 'The Toll', text: 'Pay the toll: a piece of loot, or 12% of your health.' },
  { id: 'gift', w: 2, name: 'Team Spirit', text: 'Whoever is furthest behind moves forward 3.' },
  { id: 'boon', w: 1, name: 'Petty Cash', text: 'Find some credits.' },
  { id: 'mend', w: 1, name: 'First Aid', text: 'Recover 15% health.' },
]);
export const CARD_BY_ID = Object.freeze(Object.fromEntries(CARDS.map((c) => [c.id, c])));
export const DECK_SIZE = CARDS.reduce((a, c) => a + c.w, 0);

export const LOOT_ITEMS = Object.freeze(['goldbar', 'ring', 'trophy', 'painting', 'perfume', 'figurine', 'magnify']);
export const REWARD_ITEMS = Object.freeze(['goldbar', 'ring', 'trophy', 'painting']);
export const REWARD_SHARDS = Object.freeze([['shard_circuit', 3], ['shard_crystal', 2], ['shard_ecto', 1]]);
export const DUEL_KINDS = Object.freeze(['timing', 'reaction']);

// ------------------------------------------------------------------------------------------------ seeded, logged RNG
export class BoardRng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.r = new RNG(this.seed || 1);
    this.log = [];                 // [tag, value] for every draw (host debugging / replay proof)
    this.forced = Object.create(null);   // tests: tag -> queue of forced values ('die', 'duelBoard', 'card')
  }
  force(tag, values) { this.forced[tag] = Array.isArray(values) ? values.slice() : [values]; }
  _forced(tag) { const q = this.forced[tag]; return q && q.length ? q.shift() : undefined; }
  next(tag = '') { const v = this.r.next(); this.log.push([tag, +v.toFixed(6)]); return v; }
  int(a, b, tag = '') {
    const f = this._forced(tag);
    const v = f !== undefined ? f : Math.floor(a + (b - a + 1) * this.r.next());
    this.log.push([tag, v]);
    return v;
  }
  float(a, b, tag = '') { const f = this._forced(tag); const v = f !== undefined ? f : a + (b - a) * this.r.next(); this.log.push([tag, +Number(v).toFixed(4)]); return v; }
  pick(arr, tag = '') { return arr[this.int(0, arr.length - 1, tag)]; }
  shuffle(arr, tag = 'shuf') { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.r.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } this.log.push([tag, arr.length]); return arr; }
}

// ------------------------------------------------------------------------------------------------ session state
export function createSession({ seed, players, turns = RULES.TURNS, quota = 0, itemPool = LOOT_ITEMS } = {}) {
  const rng = new BoardRng(seed ?? 1);
  const order = [...new Set(players || [])];
  const s = {
    seed: rng.seed, rng, turns, quota: Math.max(0, quota | 0), itemPool: [...itemPool],
    order, round: 1, idx: -1, cur: null, phase: 'idle',   // 'idle' | 'roll' | 'duel' | 'next' | 'over'
    status: 'playing', why: '', duel: null, deck: [], discard: [], forcedCards: [], turnsPlayed: 0, rolls: 0,
    p: {},
  };
  for (const id of order) s.p[id] = { pos: 0, finished: false, finishRound: 0, skip: 0, extra: false, extraUsed: false, credits: 0, items: [], hpLost: 0, gone: false };
  s.deck = buildDeck(rng);
  return s;
}
export function buildDeck(rng) { const d = []; for (const c of CARDS) for (let i = 0; i < c.w; i++) d.push(c.id); return rng.shuffle(d, 'deck'); }
export function drawCard(s) {
  if (s.forcedCards.length) return s.forcedCards.shift();
  if (!s.deck.length) { s.deck = s.discard.length ? s.rng.shuffle(s.discard.splice(0), 'reshuffle') : buildDeck(s.rng); }
  const id = s.deck.pop();
  s.discard.push(id);
  return id;
}
export const activeIds = (s) => s.order.filter((id) => !s.p[id].gone);
export const unfinishedIds = (s) => activeIds(s).filter((id) => !s.p[id].finished);
export const allFinished = (s) => { const a = activeIds(s); return a.length > 0 && a.every((id) => s.p[id].finished); };
export const rollDie = (s) => s.rng.int(1, RULES.DIE, 'die');

/** presentation time (ms) of one event: the host waits this long before the next turn / result; clients play them in order */
export function eventMs(ev) {
  switch (ev.k) {
    case 'roll': return 2600;
    case 'move': return 360 * Math.max(1, ev.path ? ev.path.length : 1) + 300;
    case 'jump': return 1200;
    case 'tile': return 500;
    case 'loot': case 'trap': case 'heal': case 'steal': case 'toll': case 'swap': case 'skip': return 1800;
    case 'card': return 3600;
    case 'extra': return 1200;
    case 'finish': return 2400;
    case 'round': return 1500;
    case 'duelres': return 2400;
    default: return 0;   // 'duel' waits for the player, 'end' is handled by the host
  }
}
export const eventsMs = (evs) => evs.reduce((a, e) => a + eventMs(e), 0);

const pathBetween = (from, to) => { const out = []; const st = to > from ? 1 : -1; for (let i = from + st; st > 0 ? i <= to : i >= to; i += st) out.push(i); return out; };

// ------------------------------------------------------------------------------------------------ turn flow
/** Pick the next player who can roll (handles skips, finished players, round counter, win / fail). Returns events. */
export function advance(s) {
  const evs = [];
  if (s.phase === 'over') return evs;
  for (let guard = 0; guard < 500; guard++) {
    if (allFinished(s)) { s.phase = 'over'; s.status = 'success'; break; }
    const ids = s.order;
    if (!activeIds(s).length) { s.phase = 'over'; s.status = 'fail'; s.why = s.why || 'abort'; break; }
    s.idx++;
    if (s.idx >= ids.length) {
      s.idx = 0; s.round++;
      if (s.round > s.turns) { s.round = s.turns; s.phase = 'over'; s.status = 'fail'; s.why = s.why || 'turns'; break; }
      evs.push({ k: 'round', n: s.round });
    }
    const id = ids[s.idx], q = s.p[id];
    if (q.gone || q.finished) continue;
    if (q.skip > 0) { q.skip--; evs.push({ k: 'skip', pid: id }); continue; }
    s.cur = id; s.phase = 'roll'; q.extraUsed = false; s.turnsPlayed++;
    break;
  }
  s.evLog = (s.evLog || []).concat(evs);
  return evs;
}
/** Force the session to end (ship left, everyone gone). Unfinished players are the failed ones. */
export function forceEnd(s, status, why) { s.phase = 'over'; s.status = status; s.why = why || ''; }
/** A participant left the game / died: they no longer count. */
export function removePlayer(s, pid) {
  const q = s.p[pid];
  if (!q || q.gone) return;
  q.gone = true;
  if (s.cur === pid && s.phase !== 'over') { s.phase = 'next'; s.duel = null; }
}

function finish(s, pid, evs) {
  const q = s.p[pid];
  if (q.finished) return;
  q.pos = RULES.EXIT; q.finished = true; q.finishRound = s.round;
  evs.push({ k: 'finish', pid });
}
/** move a player without tile effects (cards, duel, gifts); lands on EXIT = finished */
function slide(s, pid, to, evs, extra = {}) {
  const q = s.p[pid];
  to = Math.max(0, Math.min(RULES.EXIT, to));
  if (to === q.pos) return;
  evs.push({ k: 'move', pid, from: q.pos, to, path: pathBetween(q.pos, to), ...extra });
  q.pos = to;
  if (to === RULES.EXIT) finish(s, pid, evs);
}

/** The die rolled `n` for the current player. Returns { events, ms } or null when it is not that player's roll. */
export function applyRoll(s, pid, n) {
  if (s.phase !== 'roll' || s.cur !== pid || !s.p[pid] || s.p[pid].finished) return null;
  n = Math.max(1, Math.min(RULES.DIE, n | 0));
  const q = s.p[pid], evs = [{ k: 'roll', pid, n }];
  s.rolls++;
  const from = q.pos;
  let to = from + n, bounced = false;
  if (to > RULES.EXIT) { const ex = to - RULES.EXIT; if (ex <= RULES.OVERSHOOT_FREE) to = RULES.EXIT; else { to = RULES.EXIT - (ex - RULES.OVERSHOOT_FREE); bounced = true; } }
  const path = [];
  if (!bounced) path.push(...pathBetween(from, to));
  else { path.push(...pathBetween(from, RULES.EXIT), ...pathBetween(RULES.EXIT, to)); }
  evs.push({ k: 'move', pid, from, to, path, bounced });
  q.pos = to;
  land(s, pid, evs);
  return { events: evs, ms: eventsMs(evs) };
}

function land(s, pid, evs) {
  const q = s.p[pid];
  if (q.pos === RULES.EXIT) { finish(s, pid, evs); return settle(s, pid, evs); }
  const type = tileType(q.pos);
  evs.push({ k: 'tile', pid, at: q.pos, type });
  switch (type) {
    case SHORT: {
      const to = SHORTCUTS[q.pos];
      if (to != null) { evs.push({ k: 'jump', pid, from: q.pos, to, up: to > q.pos }); q.pos = to; }
      break;
    }
    case LOOT: lootFor(s, pid, evs); break;
    case TRAP: q.hpLost += RULES.TRAP_FRAC; evs.push({ k: 'trap', pid, frac: RULES.TRAP_FRAC }); if (q.pos > 0) slide(s, pid, q.pos - RULES.TRAP_BACK, evs, { back: true }); break;
    case REST: evs.push({ k: 'heal', pid, frac: RULES.REST_FRAC }); break;
    case CARD: { const id = drawCard(s); evs.push({ k: 'card', pid, id }); applyCard(s, pid, id, evs); break; }
    case DUEL: {
      const kind = s.rng.pick(DUEL_KINDS, 'duelKind');
      const dseed = s.rng.int(1, 1e9, 'duelSeed');
      const board = s.rng.float(0.4, 0.8, 'duelBoard');
      s.duel = { pid, kind, dseed, board };
      s.phase = 'duel';
      evs.push({ k: 'duel', pid, kind, dseed });
      return;
    }
    default: break;
  }
  settle(s, pid, evs);
}

function settle(s, pid, evs) {
  const q = s.p[pid];
  if (q.extra && !q.finished) { q.extra = false; s.phase = 'roll'; evs.push({ k: 'extra', pid }); return; }
  q.extra = false;
  s.phase = 'next';
}

function lootFor(s, pid, evs, cause = 'tile') {
  const q = s.p[pid];
  if (s.rng.next('loot') < 0.6) {
    const n = Math.round(s.rng.int(25, 70, 'lootN') * (1 + 0.08 * s.quota));
    q.credits += n; evs.push({ k: 'loot', pid, credits: n, cause });
  } else {
    const id = s.rng.pick(s.itemPool, 'lootItem');
    q.items.push(id); evs.push({ k: 'loot', pid, item: id, cause });
  }
}

function applyCard(s, pid, id, evs) {
  const q = s.p[pid];
  const mates = unfinishedIds(s).filter((o) => o !== pid);
  switch (id) {
    case 'fwd2': slide(s, pid, q.pos + 2, evs); break;
    case 'back3': slide(s, pid, q.pos - 3, evs, { back: true }); break;
    case 'skip': q.skip++; break;
    case 'double': if (!q.extraUsed) { q.extra = true; q.extraUsed = true; } break;
    case 'swap': {
      if (!mates.length) { evs.push({ k: 'card', pid, id, note: 'alone' }); slide(s, pid, q.pos + 2, evs); break; }
      let best = mates[0];
      for (const o of mates) if (Math.abs(s.p[o].pos - q.pos) > Math.abs(s.p[best].pos - q.pos)) best = o;
      const pa = q.pos, pb = s.p[best].pos;
      q.pos = pb; s.p[best].pos = pa;
      evs.push({ k: 'swap', a: pid, b: best, pa, pb });
      break;
    }
    case 'steal': {
      const rich = mates.filter((o) => s.p[o].items.length || s.p[o].credits > 0);
      if (!rich.length) { const n = 25 + (s.quota * 3); q.credits += n; evs.push({ k: 'loot', pid, credits: n, cause: 'card' }); break; }
      const from = s.rng.pick(rich, 'stealFrom'), f = s.p[from];
      if (f.items.length && (f.credits <= 0 || s.rng.next('stealKind') < 0.5)) {
        const item = f.items.splice(s.rng.int(0, f.items.length - 1, 'stealItem'), 1)[0];
        q.items.push(item); evs.push({ k: 'steal', from, to: pid, item });
      } else {
        const n = Math.max(1, Math.round(f.credits * 0.3));
        f.credits -= n; q.credits += n; evs.push({ k: 'steal', from, to: pid, credits: n });
      }
      break;
    }
    case 'toll': {
      if (q.items.length) { const item = q.items.splice(s.rng.int(0, q.items.length - 1, 'tollItem'), 1)[0]; evs.push({ k: 'toll', pid, item }); }
      else if (q.credits >= 20) { const n = Math.max(1, Math.round(q.credits * 0.25)); q.credits -= n; evs.push({ k: 'toll', pid, credits: n }); }
      else { q.hpLost += RULES.TOLL_FRAC; evs.push({ k: 'toll', pid, frac: RULES.TOLL_FRAC }); }
      break;
    }
    case 'gift': {
      const pool = unfinishedIds(s);
      let last = pool[0];
      for (const o of pool) if (s.p[o].pos < s.p[last].pos) last = o;
      slide(s, last, s.p[last].pos + 3, evs, { gift: true, by: pid });
      break;
    }
    case 'boon': { const n = 20 + Math.round(s.rng.int(0, 30, 'boon') * (1 + 0.08 * s.quota)); q.credits += n; evs.push({ k: 'loot', pid, credits: n, cause: 'card' }); break; }
    case 'mend': evs.push({ k: 'heal', pid, frac: RULES.MEND_FRAC }); break;
    default: break;
  }
}

/** duel result: > board + margin = win, < board - margin = lose, else draw */
export function duelOutcome(score, board) {
  score = Number.isFinite(+score) ? Math.max(0, Math.min(1, +score)) : 0;
  if (score > board + 0.05) return 'win';
  if (score < board - 0.05) return 'lose';
  return 'draw';
}
/** the current player finished the DUEL minigame (score 0..1, null = timed out). Returns { events, ms } or null. */
export function applyDuel(s, pid, score) {
  if (s.phase !== 'duel' || !s.duel || s.duel.pid !== pid) return null;
  const q = s.p[pid], d = s.duel, sc = score == null ? 0 : Math.max(0, Math.min(1, +score || 0));
  const res = duelOutcome(sc, d.board);
  const evs = [{ k: 'duelres', pid, res, score: +sc.toFixed(3), board: +d.board.toFixed(3) }];
  s.duel = null;
  if (res === 'win') slide(s, pid, q.pos + RULES.DUEL_WIN_STEPS, evs);
  else if (res === 'lose') { q.hpLost += RULES.DUEL_LOSE_FRAC; evs.push({ k: 'trap', pid, frac: RULES.DUEL_LOSE_FRAC, duel: true }); slide(s, pid, q.pos - RULES.DUEL_LOSE_STEPS, evs, { back: true }); }
  settle(s, pid, evs);
  return { events: evs, ms: eventsMs(evs) };
}

// ------------------------------------------------------------------------------------------------ outcome
export function rollReward(s, pid) {
  const r = s.rng.next('reward');
  if (r < 0.5) return { kind: 'item', id: s.rng.pick(REWARD_ITEMS, 'rewardItem'), tier: 'rare' };
  const [id, n] = s.rng.pick(REWARD_SHARDS, 'rewardShard');
  return { kind: 'shards', id, n };
}
/** Final verdict per player. success: everybody leaves with their banked loot + a reward card. fail (turns / ship): players who did NOT
 *  reach EXIT are "failed" (the Administrator takes their most valuable item + 90 % HP); finished players walk out with their loot. */
export function settleOutcome(s) {
  const out = { status: s.status, why: s.why, rounds: s.round, players: {} };
  for (const id of s.order) {
    const q = s.p[id];
    if (q.gone) continue;
    const loot = { credits: q.credits, items: q.items.slice() };
    if (s.status === 'success') out.players[id] = { failed: false, finished: true, loot, reward: rollReward(s, id) };
    else if (q.finished) out.players[id] = { failed: false, finished: true, loot, reward: null };
    else out.players[id] = { failed: true, finished: false, loot: { credits: 0, items: [] }, reward: null };
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the penalty
/** how much an item is worth to the Administrator: scrap value / price (tier-weighted) + enhancement level */
export function itemWorth(it) {
  const def = it?.def || {};
  let base = Number(it?.value) || 0;
  if (!(base > 0)) { const v = def.value; base = Array.isArray(v) ? (Number(v[0]) + Number(v[1])) / 2 : Number(v) || 0; }
  if (!(base > 0)) base = Number(def.price) || (Number(def.coin) ? Number(def.coin) * 0.5 : 0) || 0;
  const ti = tierIndex(tierOfItem(it, def));
  return Math.round(base * (1 + ti * 0.25) + (Number(it?.plus) || 0) * 25);
}
export function isTakeable(it) {
  if (!it || !it.id) return false;
  const kind = it.def?.kind;
  return !it.soulbound && it.type !== 'body' && kind !== 'body' && kind !== 'bag';
}
/** items = every item the player holds (hotbar + bag + equipment): [{ id, type, value, tier, plus, soulbound, def }]. Returns { item, worth } | null */
export function pickPenaltyItem(items) {
  let best = null;
  for (const it of items || []) {
    if (!isTakeable(it)) continue;
    const w = itemWorth(it), t = tierIndex(tierOfItem(it, it.def || {}));
    if (!best || w > best.worth || (w === best.worth && t > best.tier)) best = { item: it, worth: w, tier: t };
  }
  return best ? { item: best.item, worth: best.worth } : null;
}
/** HP after "TERMS ENFORCED": cut to 10 % of the maximum (never raised, never 0) */
export function penaltyHp(hp, maxHp) { return Math.max(1, Math.min(Math.round(hp), Math.ceil(maxHp * RULES.HP_KEEP))); }
/** HP after a trap / duel loss / toll: frac of the maximum, never lethal */
export function trapHp(hp, maxHp, frac) { return Math.max(1, Math.round(hp - maxHp * frac)); }

// ------------------------------------------------------------------------------------------------ the Administrator
/** appearance gate: never before quota 1, max once per day, ~4 % per landing */
export function shouldAppear({ quotaIndex = 0, day = 0, lastDay = -1, roll = 1, chance = RULES.APPEAR_CHANCE, force = false } = {}) {
  if (force) return true;
  if ((quotaIndex | 0) < RULES.MIN_QUOTA) return false;
  if (day === lastDay) return false;
  return roll < chance;
}
/** is the crosshair on the head? eye / look / head are {x,y,z}, look is a unit vector */
export function gazeHit({ eye, look, head, maxDist = RULES.GAZE_RANGE, radius = RULES.GAZE_RADIUS }) {
  const dx = head.x - eye.x, dy = head.y - eye.y, dz = head.z - eye.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > maxDist || d < 0.3) return { hit: false, dist: d };
  const dot = (dx * look.x + dy * look.y + dz * look.z) / d;
  return { hit: dot >= Math.cos(Math.atan(radius / d)) && dot > 0, dist: d };
}
/** the gazer and every other living player within `range` metres of them */
export function groupWithin(center, players, range = RULES.GROUP_RANGE) {
  return players.filter((p) => !p.dead && Math.hypot(p.pos.x - center.x, p.pos.y - center.y, p.pos.z - center.z) <= range).map((p) => p.id);
}
/** ring token layout: offsets (metres, x/z) of the k-th of n players standing on one tile */
export function slotOffset(k, n, pitch = 1.0) {
  if (n <= 1) return { x: 0, z: 0 };
  const a = (k / n) * Math.PI * 2 + Math.PI / 4;
  const r = pitch * (n === 2 ? 0.6 : 0.75);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}
