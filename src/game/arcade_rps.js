// ROCK - PAPER - SCISSORS (module `arcade`, pure host rules; node-tested by tools/harness/arcade.test.mjs). No DOM / three / game access.
// Best of 3 between two crewmates. Commit-reveal: a pick travels ONLY to the host (`arreq` rps pk); the host tells both players just "X has picked" (no value)
// and reveals both picks in a single `rpsv` event once both are in (or the pick timer ran out: the missing pick is random). Nobody can react to the other pick.
// A draw replays the round (max 7 rounds, then the leader wins, or a draw). Optional wager in Clout (personal currency): the winner is paid by the host
// (capped per day), the loser's client deducts exactly what the host paid. Wagers never touch the shared ship credits.
// Host events are plain objects { to: [pids] | 'all', msg } collected in mgr.out and drained by game/arcade.js (which turns them into `ar` net messages).
export const RPS = {
  WINS: 2, MAX_ROUNDS: 7, PICK_SEC: 8, INTRO_SEC: 1.6, RESULT_SEC: 3.8, CHALLENGE_SEC: 20,
  RANGE_START: 8, RANGE_KEEP: 26, WAGER_MAX: 25, DAILY_WIN_CAP: 60, COOLDOWN: 4,
};
export const MOVES = ['rock', 'paper', 'scissors'];
/** 1 = a wins, -1 = b wins, 0 = draw (moves are indexes into MOVES) */
export const beats = (a, b) => (a === b ? 0 : (a + 2) % 3 === b ? 1 : -1);

export function createRpsHost({ rnd = Math.random, day = () => 0 } = {}) {
  const matches = new Map(), byPid = new Map(), won = new Map(), lastAsk = new Map();
  let idN = 0;
  const out = [];
  const emit = (to, msg) => out.push({ to, msg });
  const both = (m) => [m.a, m.b];
  const roleOf = (m, pid) => (m.a === pid ? 'a' : m.b === pid ? 'b' : null);
  const led = (pid) => { let e = won.get(pid); const d = day(); if (!e || e.day !== d) { e = { day: d, won: 0 }; won.set(pid, e); } return e; };

  function startRound(m, now) {
    m.round++; m.phase = 'pick'; m.picks = { a: null, b: null }; m.auto = { a: false, b: false };
    m.deadline = now + RPS.INTRO_SEC + RPS.PICK_SEC;
    emit(both(m), { k: 'rpsr', id: m.id, round: m.round, sc: { ...m.sc }, sec: RPS.PICK_SEC, intro: RPS.INTRO_SEC });
  }
  function resolve(m, now) {
    for (const r of ['a', 'b']) if (m.picks[r] === null) { m.picks[r] = Math.floor(rnd() * 3) % 3; m.auto[r] = true; }
    const w = beats(m.picks.a, m.picks.b);
    if (w > 0) m.sc.a++; else if (w < 0) m.sc.b++;
    m.phase = 'result'; m.nextAt = now + RPS.RESULT_SEC;
    let over = null;
    if (m.sc.a >= RPS.WINS) over = 'a'; else if (m.sc.b >= RPS.WINS) over = 'b';
    else if (m.round >= RPS.MAX_ROUNDS) over = m.sc.a > m.sc.b ? 'a' : m.sc.b > m.sc.a ? 'b' : 'd';
    m.over = over;
    emit('all', { k: 'rpsv', id: m.id, a: m.a, b: m.b, round: m.round, picks: [m.picks.a, m.picks.b], win: w > 0 ? 'a' : w < 0 ? 'b' : 'd', sc: { ...m.sc }, auto: { ...m.auto }, last: !!over });
  }
  function drop(m) { matches.delete(m.id); if (byPid.get(m.a) === m.id) byPid.delete(m.a); if (byPid.get(m.b) === m.id) byPid.delete(m.b); }
  function finish(m) {
    let pay = 0;
    const winner = m.over;
    if (winner === 'a' || winner === 'b') {
      const wp = winner === 'a' ? m.a : m.b, e = led(wp);
      pay = Math.max(0, Math.min(m.wager, RPS.DAILY_WIN_CAP - e.won));
      e.won += pay;
    }
    emit('all', { k: 'rpse', id: m.id, a: m.a, b: m.b, winner, sc: { ...m.sc }, wager: m.wager, pay });
    drop(m);
    return pay;
  }

  const api = {
    matches, byPid, out, won,
    matchOf: (pid) => matches.get(byPid.get(pid)) || null,
    drain() { return out.splice(0, out.length); },
    /** env: { ok: bool, err } a wiring-side check (alive, distance ...) evaluated by the caller before challenge() */
    challenge(now, from, to, wager) {
      if (!from || !to || from === to) return { ok: false, err: 'Pick a crewmate.' };
      wager = Math.floor(+wager) || 0;
      if (wager < 0 || wager > RPS.WAGER_MAX) return { ok: false, err: 'Wagers go up to {n} Clout.', vars: { n: RPS.WAGER_MAX } };
      if (byPid.has(from)) return { ok: false, err: 'You are already in a game.' };
      if (byPid.has(to)) return { ok: false, err: 'They are busy.' };
      if (now - (lastAsk.get(from) ?? -99) < RPS.COOLDOWN) return { ok: false, err: 'Wait a moment.' };
      lastAsk.set(from, now);
      const m = { id: ++idN, a: from, b: to, wager, state: 'pending', expires: now + RPS.CHALLENGE_SEC, sc: { a: 0, b: 0 }, round: 0, phase: 'ask', picks: { a: null, b: null }, auto: { a: false, b: false }, over: null };
      matches.set(m.id, m); byPid.set(from, m.id); byPid.set(to, m.id);
      emit(both(m), { k: 'rpsc', id: m.id, a: from, b: to, wager, sec: RPS.CHALLENGE_SEC });
      return { ok: true, id: m.id };
    },
    respond(now, pid, accept) {
      const m = api.matchOf(pid);
      if (!m || m.state !== 'pending' || m.b !== pid) return { ok: false, err: 'Nothing to answer.' };
      if (!accept) { emit(both(m), { k: 'rpsn', id: m.id, why: 'declined' }); drop(m); return { ok: true }; }
      m.state = 'live';
      startRound(m, now);
      return { ok: true };
    },
    pick(now, pid, mv) {
      const m = api.matchOf(pid);
      if (!m || m.state !== 'live' || m.phase !== 'pick') return { ok: false, err: 'Not now.' };
      mv = mv | 0;
      if (mv < 0 || mv > 2) return { ok: false, err: 'Bad pick.' };
      const r = roleOf(m, pid);
      if (m.picks[r] !== null) return { ok: false, err: 'Already picked.' };
      m.picks[r] = mv;
      emit(both(m), { k: 'rpsp', id: m.id, who: r });
      if (m.picks.a !== null && m.picks.b !== null) resolve(m, now);
      return { ok: true };
    },
    leave(now, pid, why = 'left') {
      const m = api.matchOf(pid);
      if (!m) return false;
      emit(both(m).filter((p) => p !== pid), { k: 'rpsn', id: m.id, why });
      emit([pid], { k: 'rpsn', id: m.id, why: 'you' });
      drop(m);
      return true;
    },
    tick(now) {
      for (const m of [...matches.values()]) {
        if (m.state === 'pending') { if (now >= m.expires) { emit(both(m), { k: 'rpsn', id: m.id, why: 'expired' }); drop(m); } continue; }
        if (m.phase === 'pick' && now >= m.deadline) resolve(m, now);
        else if (m.phase === 'result' && now >= m.nextAt) { if (m.over) finish(m); else startRound(m, now); }
      }
    },
  };
  return api;
}
