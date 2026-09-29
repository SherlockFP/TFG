// ARCADE core (module `arcade`): pure, node-tested table + booth rules. No DOM / three / game access.
//  - Board tables (chess / dama): seats, AI seats, move validation, results, repetition. The host owns a Table per site, clients only render snapshots.
//  - Carnival booths: entry fee, payout tables, per-player daily prize cap, session bookkeeping (client plays the booth locally, the host validates + pays).
import * as CH from './chess_rules.js';
import * as DA from './draughts_rules.js';

// ------------------------------------------------------------------------------------------------ game adapters
export const GAMES = {
  chess: {
    init: () => CH.initial(),
    ser: (s) => CH.toFen(s),
    parse: (str) => CH.parseFen(str),
    posKey: (s) => CH.posKey(s),
    status: (s) => { const r = CH.status(s); return { moves: r.moves, check: r.check, over: r.over, winner: r.over === 'mate' ? CH.other(s.turn) : r.over ? 'd' : null }; },
    find: (s, cm, moves) => CH.findMove(s, cm, moves),
    apply: (s, m) => CH.make(s, m),
    notate: (s, m, moves) => CH.notate(s, m, moves),
    ai: (s, level) => CH.aiMove(s, level),
    last: (m) => [m.f, m.t],
    client: (m) => CH.toClient(m),
  },
  draughts: {
    init: () => DA.initial(),
    ser: (s) => DA.ser(s),
    parse: (str) => DA.parse(str),
    posKey: (s) => DA.posKey(s),
    status: (s) => { const r = DA.status(s); return { moves: r.moves, check: false, over: r.over, winner: r.over === 'nomoves' ? DA.other(r.loser) : r.over ? 'd' : null }; },
    find: (s, cm, moves) => DA.findMove(s, cm, moves),
    apply: (s, m) => DA.make(s, m),
    notate: (s, m) => DA.notate(s, m),
    ai: (s, level) => DA.aiMove(s, level),
    last: (m) => [m.f, m.path[m.path.length - 1]],
    client: (m) => DA.toClient(m),
  },
};
export const KINDS = Object.keys(GAMES);
export const LOG_KEEP = 40;
export const REP_DRAW = 3;

// ------------------------------------------------------------------------------------------------ tables
export function newTable(id, kind = 'chess') {
  const g = GAMES[kind] || GAMES.chess;
  const st = g.init();
  return { id, kind: GAMES[kind] ? kind : 'chess', st, seats: { w: null, b: null }, ai: { w: 0, b: 0 }, ply: 0, over: null, last: null, log: [], reps: { [g.posKey(st)]: 1 }, ver: 0 };
}
const bump = (t) => { t.ver++; return t; };
export const seatOf = (t, pid) => (t.seats.w === pid ? 'w' : t.seats.b === pid ? 'b' : null);
export const humans = (t) => [t.seats.w, t.seats.b].filter(Boolean);
export const inProgress = (t) => t.ply > 0 && !t.over;
const other = (c) => (c === 'w' ? 'b' : 'w');

function resetGame(t) {
  const g = GAMES[t.kind];
  t.st = g.init(); t.ply = 0; t.over = null; t.last = null; t.log = []; t.reps = { [g.posKey(t.st)]: 1 };
}
/** wipe a table completely (seats, AI, game) */
export function resetTable(t) { t.seats = { w: null, b: null }; t.ai = { w: 0, b: 0 }; resetGame(t); return bump(t); }
export function sit(t, pid, color) {
  if (color !== 'w' && color !== 'b') return { ok: false, err: 'Pick a side.' };
  if (t.seats[color] === pid) return { ok: true };
  if (t.seats[color] || (t.ai[color] && inProgress(t))) return { ok: false, err: 'That seat is taken.' };
  const cur = seatOf(t, pid);
  if (cur && inProgress(t)) return { ok: false, err: 'You are already playing.' };
  if (cur) t.seats[cur] = null;
  t.ai[color] = 0;                                  // a human takes over an idle AI seat
  t.seats[color] = pid;
  bump(t);
  return { ok: true };
}
/** stand up; when no human is left the table resets (a game nobody watches is dropped) */
export function stand(t, pid) {
  const c = seatOf(t, pid);
  if (!c) return { ok: false };
  t.seats[c] = null;
  if (!humans(t).length) { t.ai = { w: 0, b: 0 }; resetGame(t); }
  bump(t);
  return { ok: true };
}
export function setAI(t, pid, color, level) {
  if (color !== 'w' && color !== 'b') return { ok: false, err: 'Pick a side.' };
  level = level | 0;
  if (level < 0 || level > 2) return { ok: false, err: 'Bad level.' };
  if (!seatOf(t, pid)) return { ok: false, err: 'Sit down first.' };
  if (t.seats[color]) return { ok: false, err: 'That seat is taken.' };
  if (t.ai[color] === level) return { ok: true };
  t.ai[color] = level;
  bump(t);
  return { ok: true };
}
export function setKind(t, pid, kind) {
  if (!GAMES[kind]) return { ok: false, err: 'Unknown game.' };
  if (!seatOf(t, pid)) return { ok: false, err: 'Sit down first.' };
  if (inProgress(t)) return { ok: false, err: 'Finish or resign the current game first.' };
  if (t.kind === kind) return { ok: true };
  t.kind = kind; resetGame(t);
  return bump(t) && { ok: true };
}
/** new game: allowed when nothing has been played yet or the game is over (colours swap after a finished game) */
export function newGame(t, pid) {
  if (!seatOf(t, pid)) return { ok: false, err: 'Sit down first.' };
  if (inProgress(t)) return { ok: false, err: 'Finish or resign the current game first.' };
  if (t.over) { [t.seats.w, t.seats.b] = [t.seats.b, t.seats.w]; [t.ai.w, t.ai.b] = [t.ai.b, t.ai.w]; }
  resetGame(t);
  return bump(t) && { ok: true };
}
export function resign(t, pid) {
  const c = seatOf(t, pid);
  if (!c || !inProgress(t)) return { ok: false, err: 'Nothing to resign.' };
  t.over = { winner: other(c), reason: 'resign' };
  return bump(t) && { ok: true };
}
function finish(t, res) {
  const g = GAMES[t.kind];
  let over = res.over ? { winner: res.winner, reason: res.over } : null;
  if (!over && (t.reps[g.posKey(t.st)] || 0) >= REP_DRAW) over = { winner: 'd', reason: 'repetition' };
  t.over = over;
}
function play(t, m) {
  const g = GAMES[t.kind];
  const moves = g.status(t.st).moves;
  const note = g.notate(t.st, m, moves);
  const mover = t.st.turn;
  t.st = g.apply(t.st, m);
  t.ply++;
  t.last = g.last(m);
  t.log.push(`${Math.ceil(t.ply / 2)}${mover === 'w' ? '.' : '...'} ${note}`);
  if (t.log.length > LOG_KEEP) t.log.shift();
  const k = g.posKey(t.st);
  t.reps[k] = (t.reps[k] || 0) + 1;
  finish(t, g.status(t.st));
  bump(t);
  return note;
}
/** a seated human plays a client move */
export function move(t, pid, cm) {
  if (t.over) return { ok: false, err: 'The game is over.' };
  const g = GAMES[t.kind], c = seatOf(t, pid);
  if (!c) return { ok: false, err: 'You are not seated.' };
  if (t.st.turn !== c) return { ok: false, err: 'Not your turn.' };
  const m = g.find(t.st, cm, g.status(t.st).moves);
  if (!m) return { ok: false, err: 'Illegal move.' };
  return { ok: true, note: play(t, m) };
}
/** does the side to move belong to the AI? */
export const aiToMove = (t) => !t.over && t.ai[t.st.turn] > 0 && !t.seats[t.st.turn];
export function aiStep(t) {
  if (!aiToMove(t)) return { ok: false };
  const g = GAMES[t.kind], m = g.ai(t.st, t.ai[t.st.turn]);
  if (!m) return { ok: false };
  return { ok: true, note: play(t, m) };
}
export function snapshot(t) {
  const g = GAMES[t.kind];
  return { id: t.id, kind: t.kind, pos: g.ser(t.st), seats: { ...t.seats }, ai: { ...t.ai }, ply: t.ply, over: t.over ? { ...t.over } : null, last: t.last ? t.last.slice() : null, log: t.log.slice(), ver: t.ver };
}
/** client side: decode a snapshot into { st, moves, check } for rendering + move picking */
export function decode(snap) {
  const g = GAMES[snap.kind] || GAMES.chess;
  const st = g.parse(snap.pos), r = g.status(st);
  return { st, moves: snap.over ? [] : r.moves, check: !!r.check };
}

// ------------------------------------------------------------------------------------------------ booths
export const BOOTH_IDS = ['cans', 'gallery', 'strength'];
export const BOOTHS = {
  cans: { fee: 6, max: 6, minSec: 2, maxSec: 60, pay: [[6, 24], [5, 14], [4, 8], [3, 4]], xp: 4 },        // 6 cans, 3 balls
  gallery: { fee: 6, max: 40, minSec: 20, maxSec: 70, pay: [[20, 24], [15, 15], [10, 9], [6, 4]], xp: 5 },    // points in a 25 s round
  strength: { fee: 6, max: 100, minSec: 3, maxSec: 60, pay: [[99, 24], [90, 14], [70, 8], [40, 4]], xp: 4 },  // best of 3 swings, 0-100
};
export const DAILY_CAP = 80;         // prize credits one player can win per game day (fees are always paid)
export const PLAY_COOLDOWN = 3;      // seconds between two plays of the same player
export const SESSION_TIMEOUT = 100;  // a session nobody finishes expires (fee is not refunded)

export function payout(booth, score) {
  const b = BOOTHS[booth];
  if (!b) return 0;
  score = Math.max(0, Math.min(b.max, Math.floor(+score) || 0));
  for (const [need, pay] of b.pay) if (score >= need) return pay;
  return 0;
}

/** host bookkeeping: sessions + daily prize ledger. `now` is seconds (game.time), `day` the current game day. */
export function createBooths() {
  const sessions = new Map();   // pid -> { sid, booth, t0 }
  const ledger = new Map();     // pid -> { day, won, plays }
  const lastPlay = new Map();
  let sidN = 0;
  const led = (pid, day) => { let e = ledger.get(pid); if (!e || e.day !== day) { e = { day, won: 0, plays: 0 }; ledger.set(pid, e); } return e; };
  return {
    sessions, ledger,
    start(pid, booth, now, credits) {
      const b = BOOTHS[booth];
      if (!b) return { ok: false, err: 'Unknown booth.' };
      const cur = sessions.get(pid);
      if (cur && now - cur.t0 < SESSION_TIMEOUT) return { ok: false, err: 'You are already playing.' };
      if (now - (lastPlay.get(pid) ?? -99) < PLAY_COOLDOWN) return { ok: false, err: 'Wait a moment.' };
      if (credits < b.fee) return { ok: false, err: 'Not enough credits.' };
      const sid = ++sidN;
      sessions.set(pid, { sid, booth, t0: now });
      lastPlay.set(pid, now);
      return { ok: true, sid, fee: b.fee };
    },
    end(pid, sid, booth, score, now, day) {
      const s = sessions.get(pid);
      if (!s || s.sid !== sid || s.booth !== booth) return { ok: false, err: 'No such session.' };
      sessions.delete(pid);
      const b = BOOTHS[booth];
      if (now - s.t0 < b.minSec) return { ok: true, score: 0, pay: 0, capped: false, cheat: true };
      score = Math.max(0, Math.min(b.max, Math.floor(+score) || 0));
      const want = payout(booth, score), e = led(pid, day);
      const pay = Math.max(0, Math.min(want, DAILY_CAP - e.won));
      e.won += pay; e.plays++;
      return { ok: true, score, pay, capped: pay < want, won: e.won, xp: pay > 0 ? b.xp : 0 };
    },
    abort(pid) { sessions.delete(pid); },
    prizeLeft(pid, day) { return DAILY_CAP - led(pid, day).won; },
  };
}
