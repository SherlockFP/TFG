// CHESS rules (pure, no DOM / three / game access; node-tested by tools/harness/arcade.test.mjs). Used by module `arcade` (game/arcade.js).
// Board: array of 64 strings, index = rank * 8 + file, rank 0 = White's first rank (a1 = 0, h8 = 63). '' = empty, 'PNBRQK' white, 'pnbrqk' black.
// State: { b, turn: 'w'|'b', castle: bitmask (1 = K, 2 = Q, 4 = k, 8 = q), ep: square index or -1, half, full }.
// Move: { f, t, p?: 'q'|'r'|'b'|'n', ep?: 1, castle?: 'K'|'Q', cap?: 1 }. Full legal rules: castling, en passant, promotion (queen default), check,
// checkmate, stalemate, insufficient material, fifty-move rule (repetition is tracked by the table in arcade_core.js).

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
export const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
export const sqIndex = (s) => (s.charCodeAt(0) - 97) + (s.charCodeAt(1) - 49) * 8;
const isWhite = (p) => p >= 'A' && p <= 'Z';
const colorOf = (p) => (isWhite(p) ? 'w' : 'b');
export const other = (c) => (c === 'w' ? 'b' : 'w');

const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const BD = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const RD = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ------------------------------------------------------------------------------------------------ FEN
export function parseFen(fen) {
  const parts = String(fen).trim().split(/\s+/);
  const b = new Array(64).fill('');
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('bad fen');
  for (let i = 0; i < 8; i++) {
    const r = 7 - i;
    let f = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') f += +ch;
      else { if (f > 7) throw new Error('bad fen'); b[r * 8 + f++] = ch; }
    }
    if (f !== 8) throw new Error('bad fen');
  }
  let castle = 0;
  for (const ch of parts[2] || '-') castle |= ch === 'K' ? 1 : ch === 'Q' ? 2 : ch === 'k' ? 4 : ch === 'q' ? 8 : 0;
  const ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
  return { b, turn: parts[1] === 'b' ? 'b' : 'w', castle, ep, half: parseInt(parts[4], 10) || 0, full: parseInt(parts[5], 10) || 1 };
}
export function toFen(s) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.b[r * 8 + f];
      if (!p) e++; else { if (e) { row += e; e = 0; } row += p; }
    }
    if (e) row += e;
    rows.push(row);
  }
  const c = (s.castle & 1 ? 'K' : '') + (s.castle & 2 ? 'Q' : '') + (s.castle & 4 ? 'k' : '') + (s.castle & 8 ? 'q' : '');
  return `${rows.join('/')} ${s.turn} ${c || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
}
export const initial = () => parseFen(START_FEN);
/** position identity for repetition (placement + side + castling + ep) */
export const posKey = (s) => toFen(s).split(' ').slice(0, 4).join(' ');

// ------------------------------------------------------------------------------------------------ attacks
export function attacked(b, sq, by) {
  const f = sq & 7, r = sq >> 3, w = by === 'w';
  const pr = w ? r - 1 : r + 1;
  if (pr >= 0 && pr < 8) {
    const pp = w ? 'P' : 'p';
    if (f > 0 && b[pr * 8 + f - 1] === pp) return true;
    if (f < 7 && b[pr * 8 + f + 1] === pp) return true;
  }
  const N = w ? 'N' : 'n', K = w ? 'K' : 'k';
  for (const [df, dr] of KN) { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && b[nr * 8 + nf] === N) return true; }
  for (const [df, dr] of KG) { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && b[nr * 8 + nf] === K) return true; }
  const B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
  for (const [df, dr] of BD) {
    let nf = f + df, nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) { const p = b[nr * 8 + nf]; if (p) { if (p === B || p === Q) return true; break; } nf += df; nr += dr; }
  }
  for (const [df, dr] of RD) {
    let nf = f + df, nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) { const p = b[nr * 8 + nf]; if (p) { if (p === R || p === Q) return true; break; } nf += df; nr += dr; }
  }
  return false;
}
export function kingSq(b, c) { const k = c === 'w' ? 'K' : 'k'; for (let i = 0; i < 64; i++) if (b[i] === k) return i; return -1; }
export function inCheck(s, c = s.turn) { const k = kingSq(s.b, c); return k >= 0 && attacked(s.b, k, other(c)); }

// ------------------------------------------------------------------------------------------------ move generation
function pseudo(s) {
  const out = [], b = s.b, me = s.turn, w = me === 'w';
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || colorOf(p) !== me) continue;
    const f = i & 7, r = i >> 3, up = p.toLowerCase();
    if (up === 'p') {
      const dir = w ? 1 : -1, nr = r + dir, last = w ? 7 : 0;
      if (nr < 0 || nr > 7) continue;
      const push = (t, extra) => {
        if (nr === last) for (const pr of ['q', 'r', 'b', 'n']) out.push({ f: i, t, p: pr, ...extra });
        else out.push({ f: i, t, ...extra });
      };
      if (!b[nr * 8 + f]) {
        push(nr * 8 + f);
        if (r === (w ? 1 : 6) && !b[(r + 2 * dir) * 8 + f]) out.push({ f: i, t: (r + 2 * dir) * 8 + f });
      }
      for (const df of [-1, 1]) {
        const nf = f + df; if (nf < 0 || nf > 7) continue;
        const t = nr * 8 + nf, q = b[t];
        if (q && colorOf(q) !== me) push(t, { cap: 1 });
        else if (!q && t === s.ep) out.push({ f: i, t, ep: 1, cap: 1 });
      }
    } else if (up === 'n' || up === 'k') {
      for (const [df, dr] of up === 'n' ? KN : KG) {
        const nf = f + df, nr = r + dr;
        if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
        const t = nr * 8 + nf, q = b[t];
        if (!q) out.push({ f: i, t }); else if (colorOf(q) !== me) out.push({ f: i, t, cap: 1 });
      }
      if (up === 'k') {
        const home = w ? 4 : 60, opp = other(me);
        if (i === home && !attacked(b, home, opp)) {
          const kr = w ? 1 : 4, qr = w ? 2 : 8, R = w ? 'R' : 'r';
          if ((s.castle & kr) && b[home + 3] === R && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) out.push({ f: i, t: home + 2, castle: 'K' });
          if ((s.castle & qr) && b[home - 4] === R && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) out.push({ f: i, t: home - 2, castle: 'Q' });
        }
      }
    } else {
      const dirs = up === 'b' ? BD : up === 'r' ? RD : KG;
      for (const [df, dr] of dirs) {
        let nf = f + df, nr = r + dr;
        while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
          const t = nr * 8 + nf, q = b[t];
          if (!q) out.push({ f: i, t });
          else { if (colorOf(q) !== me) out.push({ f: i, t, cap: 1 }); break; }
          nf += df; nr += dr;
        }
      }
    }
  }
  return out;
}

/** Apply a move (must be pseudo-legal); returns a NEW state. */
export function make(s, m) {
  const b = s.b.slice(), p = b[m.f], w = s.turn === 'w';
  const captured = b[m.t];
  b[m.t] = m.p ? (w ? m.p.toUpperCase() : m.p) : p;
  b[m.f] = '';
  if (m.ep) b[w ? m.t - 8 : m.t + 8] = '';
  if (m.castle === 'K') { b[m.t - 1] = b[m.t + 1]; b[m.t + 1] = ''; }
  else if (m.castle === 'Q') { b[m.t + 1] = b[m.t - 2]; b[m.t - 2] = ''; }
  let castle = s.castle;
  if (p === 'K') castle &= ~3; else if (p === 'k') castle &= ~12;
  for (const sq of [m.f, m.t]) { if (sq === 0) castle &= ~2; else if (sq === 7) castle &= ~1; else if (sq === 56) castle &= ~8; else if (sq === 63) castle &= ~4; }
  const pawn = p === 'P' || p === 'p';
  const ep = pawn && Math.abs(m.t - m.f) === 16 ? (m.f + m.t) >> 1 : -1;
  return { b, turn: other(s.turn), castle, ep, half: pawn || captured || m.ep ? 0 : s.half + 1, full: s.full + (w ? 0 : 1) };
}

export function legalMoves(s) {
  const me = s.turn, opp = other(me), out = [];
  for (const m of pseudo(s)) {
    const ns = make(s, m);
    const k = kingSq(ns.b, me);
    if (k >= 0 && !attacked(ns.b, k, opp)) out.push(m);
  }
  return out;
}

export function perft(s, depth) {
  if (depth === 0) return 1;
  const mv = legalMoves(s);
  if (depth === 1) return mv.length;
  let n = 0;
  for (const m of mv) n += perft(make(s, m), depth - 1);
  return n;
}

// ------------------------------------------------------------------------------------------------ game status
export function insufficient(s) {
  const minors = [];
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const u = p.toLowerCase();
    if (u === 'k') continue;
    if (u === 'p' || u === 'r' || u === 'q') return false;
    minors.push({ u, c: colorOf(p), sq: ((i & 7) + (i >> 3)) & 1 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.u === 'b') && minors.every((m) => m.sq === minors[0].sq);
}
/** { moves, check, over: null | 'mate' | 'stalemate' | 'insufficient' | 'fifty' } (repetition is added by the table) */
export function status(s) {
  const moves = legalMoves(s), check = inCheck(s);
  let over = null;
  if (!moves.length) over = check ? 'mate' : 'stalemate';
  else if (insufficient(s)) over = 'insufficient';
  else if (s.half >= 100) over = 'fifty';
  return { moves, check, over };
}

// ------------------------------------------------------------------------------------------------ notation (SAN)
export function notate(s, m, moves = legalMoves(s)) {
  const p = s.b[m.f], u = p.toLowerCase();
  let txt;
  if (m.castle) txt = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else if (u === 'p') {
    txt = (m.cap ? FILES[m.f & 7] + 'x' : '') + sqName(m.t) + (m.p ? '=' + m.p.toUpperCase() : '');
  } else {
    let dis = '';
    const rivals = moves.filter((o) => o.f !== m.f && o.t === m.t && s.b[o.f] === p);
    if (rivals.length) {
      if (!rivals.some((o) => (o.f & 7) === (m.f & 7))) dis = FILES[m.f & 7];
      else if (!rivals.some((o) => (o.f >> 3) === (m.f >> 3))) dis = String((m.f >> 3) + 1);
      else dis = sqName(m.f);
    }
    txt = u.toUpperCase() + dis + (m.cap ? 'x' : '') + sqName(m.t);
  }
  const ns = make(s, m);
  if (inCheck(ns)) txt += legalMoves(ns).length ? '+' : '#';
  return txt;
}

/** find the legal move matching a client move [from, to, promo?] (promo defaults to queen when a promotion is needed) */
export function findMove(s, cm, moves = legalMoves(s)) {
  if (!Array.isArray(cm)) return null;
  const f = cm[0] | 0, t = cm[1] | 0, pr = typeof cm[2] === 'string' ? cm[2].toLowerCase() : 'q';
  const cand = moves.filter((m) => m.f === f && m.t === t);
  if (!cand.length) return null;
  if (!cand[0].p) return cand[0];
  return cand.find((m) => m.p === pr) || cand.find((m) => m.p === 'q') || null;
}
export const toClient = (m) => (m.p ? [m.f, m.t, m.p] : [m.f, m.t]);

// ------------------------------------------------------------------------------------------------ AI (1-ply / 2-ply with capture quiescence)
const VAL = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const CENTER = [0, 0, 1, 2, 2, 1, 0, 0];
function evalW(s) {
  let sc = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const u = p.toLowerCase(), w = isWhite(p), f = i & 7, r = i >> 3, rr = w ? r : 7 - r;
    let v = VAL[u];
    if (u === 'p') v += rr * 6 + (CENTER[f] > 1 && rr < 5 ? 6 : 0);
    else if (u === 'n' || u === 'b') v += (CENTER[f] + CENTER[r]) * 5 - (rr === 0 ? 8 : 0);
    else if (u === 'q') v += (CENTER[f] + CENTER[r]) * 1;
    else if (u === 'k') v += rr === 0 ? 8 : -rr * 4;
    sc += w ? v : -v;
  }
  return sc;
}
const evalStm = (s) => (s.turn === 'w' ? evalW(s) : -evalW(s));
const MATE = 100000;
function order(s, moves) {
  return moves.map((m) => {
    const v = m.cap ? 10 * VAL[(s.b[m.t] || 'p').toLowerCase()] - VAL[s.b[m.f].toLowerCase()] / 10 + 1000 : 0;
    return [v + (m.p === 'q' ? 800 : 0), m];
  }).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}
function quiesce(s, alpha, beta, qd) {
  const stand = evalStm(s);
  if (qd <= 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of order(s, legalMoves(s).filter((x) => x.cap || x.p === 'q'))) {
    const sc = -quiesce(make(s, m), -beta, -alpha, qd - 1);
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}
function search(s, depth, alpha, beta, ply) {
  const moves = legalMoves(s);
  if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
  if (depth === 0) return quiesce(s, alpha, beta, 2);
  let best = -Infinity;
  for (const m of order(s, moves)) {
    const sc = -search(make(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}
/** level 1 = greedy 1-ply with noise ("easy"), level 2 = 2-ply alpha-beta + capture quiescence. Returns a legal move or null. */
export function aiMove(s, level = 2, rnd = Math.random) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  const depth = level >= 2 ? 1 : 0, noise = level >= 2 ? 8 : 55;
  let best = null, bs = -Infinity;
  for (const m of order(s, moves)) {
    const sc = -search(make(s, m), depth, -MATE * 2, MATE * 2, 1) + (rnd() - 0.5) * 2 * noise;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
