// ARCADE2 core: pure, node-testable rules for the four ship-cabinet games (docs/wave8/arcade2.md). No DOM / three.js.
//   games        fish (Flappy Fish), cable (Cable Runner), stack (Quota Stack), invaders (Viewer Invaders)
//   leaderboard  per real UTC day, top 5 per game, host-authoritative (one row per player per game = their best that day)
//   prize        small Clout payout per play, HARD CAPPED per player per day (PRIZE_CAP), host counts it and the client re-checks its own profile
//   champion     beating TARGETS[game] once unlocks the "Arcade Champion" hat (profile.arcade2.champ, once ever)
export const GAMES = ['fish', 'cable', 'stack', 'invaders'];
export const NAMES = { fish: 'FLAPPY FISH', cable: 'CABLE RUNNER', stack: 'QUOTA STACK', invaders: 'VIEWER INVADERS' };
export const TARGETS = { fish: 25, cable: 30, stack: 60, invaders: 90 };     // beat it once (>=) for the cosmetic
export const MAX_SCORE = { fish: 80, cable: 90, stack: 400, invaders: 400 };   // plausibility ceiling per 30-90 s session (host rejects above)
export const MIN_PLAY_MS = 12000;      // host rejects a second submission from one player sooner than this
export const PRIZE_CAP = 40;           // Clout per player per real day, all games together
export const PRIZE_DIV = { fish: 1, cable: 1, stack: 4, invaders: 5 };   // score / div = Clout for that play (before the cap)
export const BOARD_SIZE = 5;
export const CHAMP_HAT = 'arcadecap';
export const dayKey = (now = Date.now()) => Math.floor(now / 86400000);
export const isGame = (g) => GAMES.includes(g);

const emptyBoards = () => ({ fish: [], cable: [], stack: [], invaders: [] });
export const newBoards = (day = dayKey()) => ({ day, b: emptyBoards(), paid: {}, last: {} });
/** roll to a new day when needed (mutates + returns s) */
export function rollDay(s, day = dayKey()) {
  if (s.day !== day) { s.day = day; s.b = emptyBoards(); s.paid = {}; s.last = {}; }
  return s;
}

/** Prize for one play given what the player already got today. Pure. */
export function prizeFor(game, score, paidToday = 0) {
  if (!isGame(game)) return 0;
  const raw = Math.floor(Math.max(0, score) / (PRIZE_DIV[game] || 1));
  return Math.max(0, Math.min(raw, PRIZE_CAP - Math.max(0, paidToday | 0)));
}

/**
 * Host: record one finished play.  d = { pid, name, game, score }.  Returns { ok, err?, best, rank, coins, champ, rows }.
 * `champHas` = whether the player already owns the champion hat (the client re-checks its own profile before granting).
 */
export function submit(s, d, now = Date.now(), champHas = false) {
  rollDay(s, dayKey(now));
  const game = d?.game, pid = String(d?.pid || '').slice(0, 40);
  if (!isGame(game) || !pid) return { ok: false, err: 'bad' };
  const sc = Math.floor(+d.score);
  if (!(sc >= 0) || sc > MAX_SCORE[game]) return { ok: false, err: 'range' };
  if (s.last[pid] && now - s.last[pid] < MIN_PLAY_MS) return { ok: false, err: 'rate' };
  s.last[pid] = now;
  const rows = s.b[game];
  let row = rows.find((r) => r.id === pid);
  let best = false;
  if (!row) { row = { id: pid, n: String(d.name || '?').slice(0, 16), s: 0 }; rows.push(row); }
  if (sc > row.s) { row.s = sc; row.n = String(d.name || row.n).slice(0, 16); best = true; }
  rows.sort((a, b) => b.s - a.s);
  if (rows.length > BOARD_SIZE * 2) rows.length = BOARD_SIZE * 2;
  const rank = rows.findIndex((r) => r.id === pid) + 1;
  const coins = prizeFor(game, sc, s.paid[pid] || 0);
  s.paid[pid] = (s.paid[pid] || 0) + coins;
  return { ok: true, best, rank, coins, champ: !champHas && sc >= TARGETS[game], rows: rows.slice(0, BOARD_SIZE).map((r) => ({ ...r })) };
}
/** wire form of the boards (small): { day, b:{game:[{id,n,s}]} } */
export const wire = (s) => ({ day: s.day, b: Object.fromEntries(GAMES.map((g) => [g, s.b[g].slice(0, BOARD_SIZE)])) });
/** client side: Clout still payable today according to the profile ledger (defence in depth: the host also caps) */
export function ledgerRoom(P, day = dayKey()) {
  const a = (P.arcade2 = P.arcade2 && typeof P.arcade2 === 'object' ? P.arcade2 : {});
  if (a.day !== day) { a.day = day; a.paid = 0; }
  return Math.max(0, PRIZE_CAP - (a.paid | 0));
}
