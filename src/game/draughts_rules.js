// DAMA - TURKISH DRAUGHTS rules (pure, no DOM / three / game access; node-tested by tools/harness/arcade.test.mjs). Used by module `arcade`.
// 8x8 board, all 64 squares are playable. Index = rank * 8 + file, rank 0 = White's home side (White moves toward rank 7, Black toward rank 0).
// Start: 16 men per side on the 2nd and 3rd rank. Pieces: 'w' / 'b' men, 'W' / 'B' kings (dama), '' empty.
//   Man:  moves ONE square forward or sideways (orthogonal, never backward); captures by jumping an adjacent enemy forward or sideways.
//   King: moves ANY distance orthogonally (flying); captures by jumping one enemy anywhere along a line and landing on ANY empty square behind it.
//   Captures are MANDATORY and the MAJORITY rule applies (you must play the sequence that captures the most pieces). Captured pieces are removed
//   only after the whole sequence, they still block the path and cannot be jumped twice. A man that reaches the last rank keeps capturing as a man if it
//   can, and is crowned when the move ends. A side that cannot move (or has no pieces) loses. Draws: king vs king, or a long stretch without a capture / man move.
// State: { b:[64], turn:'w'|'b', np: plies since the last capture or man move }. Move: { f, path:[landing squares], caps:[captured squares] }.

export const other = (c) => (c === 'w' ? 'b' : 'w');
export const sqName = (i) => 'abcdefgh'[i & 7] + ((i >> 3) + 1);
const isMine = (p, c) => !!p && p.toLowerCase() === c;
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];   // [df, dr]
export const NP_DRAW = 60;

export function initial() {
  const b = new Array(64).fill('');
  for (let f = 0; f < 8; f++) { b[8 + f] = 'w'; b[16 + f] = 'w'; b[40 + f] = 'b'; b[48 + f] = 'b'; }
  return { b, turn: 'w', np: 0 };
}
export function fromRows(rows, turn = 'w') {   // test helper: rows from rank 8 (top) down to rank 1, chars . w W b B
  const b = new Array(64).fill('');
  for (let i = 0; i < 8; i++) for (let f = 0; f < 8; f++) { const ch = rows[i][f]; b[(7 - i) * 8 + f] = ch === '.' || ch === ' ' ? '' : ch; }
  return { b, turn, np: 0 };
}
export const ser = (s) => s.b.map((p) => p || '.').join('') + '|' + s.turn + '|' + s.np;
export function parse(str) {
  const [bs, turn, np] = String(str).split('|');
  if (!bs || bs.length !== 64) throw new Error('bad dama pos');
  return { b: [...bs].map((c) => (c === '.' ? '' : c)), turn: turn === 'b' ? 'b' : 'w', np: parseInt(np, 10) || 0 };
}
export const posKey = (s) => ser(s).split('|').slice(0, 2).join('|');

const step = (sq, df, dr) => { const f = (sq & 7) + df, r = (sq >> 3) + dr; return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f; };
const lastRank = (c) => (c === 'w' ? 7 : 0);

function captureSeqs(s, from) {
  const p = s.b[from], me = s.turn, king = p === p.toUpperCase();
  const b = s.b.slice();
  b[from] = '';                                   // the moving piece has left its square
  const out = [], caps = new Set(), path = [], capList = [];
  const fwd = me === 'w' ? 1 : -1;
  const dirs = king ? DIRS : [[0, fwd], [1, 0], [-1, 0]];
  const dfs = (pos) => {
    let any = false;
    for (const [df, dr] of dirs) {
      if (king) {
        let q = step(pos, df, dr);
        while (q >= 0 && !b[q]) q = step(q, df, dr);
        if (q < 0 || !isMine(b[q], other(me)) || caps.has(q)) continue;
        let l = step(q, df, dr);
        while (l >= 0 && !b[l]) {
          any = true; caps.add(q); path.push(l); capList.push(q);
          dfs(l);
          caps.delete(q); path.pop(); capList.pop();
          l = step(l, df, dr);
        }
      } else {
        const q = step(pos, df, dr);
        if (q < 0 || !isMine(b[q], other(me)) || caps.has(q)) continue;
        const l = step(q, df, dr);
        if (l < 0 || b[l]) continue;
        any = true; caps.add(q); path.push(l); capList.push(q);
        dfs(l);
        caps.delete(q); path.pop(); capList.pop();
      }
    }
    if (!any && path.length) out.push({ f: from, path: path.slice(), caps: capList.slice() });
  };
  dfs(from);
  return out;
}

export function legalMoves(s) {
  const me = s.turn, caps = [];
  let best = 0;
  for (let i = 0; i < 64; i++) {
    if (!isMine(s.b[i], me)) continue;
    for (const m of captureSeqs(s, i)) {
      if (m.caps.length > best) { best = m.caps.length; caps.length = 0; }
      if (m.caps.length === best) caps.push(m);
    }
  }
  if (caps.length) return caps;
  const out = [], fwd = me === 'w' ? 1 : -1;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!isMine(p, me)) continue;
    if (p === p.toUpperCase()) {
      for (const [df, dr] of DIRS) { let q = step(i, df, dr); while (q >= 0 && !s.b[q]) { out.push({ f: i, path: [q], caps: [] }); q = step(q, df, dr); } }
    } else {
      for (const [df, dr] of [[0, fwd], [1, 0], [-1, 0]]) { const q = step(i, df, dr); if (q >= 0 && !s.b[q]) out.push({ f: i, path: [q], caps: [] }); }
    }
  }
  return out;
}

export function make(s, m) {
  const b = s.b.slice(), p = b[m.f], me = s.turn;
  b[m.f] = '';
  for (const c of m.caps) b[c] = '';
  const land = m.path[m.path.length - 1], man = p === p.toLowerCase();
  b[land] = man && (land >> 3) === lastRank(me) ? p.toUpperCase() : p;
  return { b, turn: other(me), np: m.caps.length || man ? 0 : s.np + 1 };
}

export function count(s) {
  const c = { w: 0, b: 0, wk: 0, bk: 0 };
  for (const p of s.b) if (p) { const k = p.toLowerCase(); c[k]++; if (p !== k) c[k + 'k']++; }
  return c;
}
/** { moves, over: null | 'nomoves' | 'kings' | 'noprogress', loser?: 'w'|'b' } (repetition is added by the table) */
export function status(s) {
  const moves = legalMoves(s), c = count(s);
  if (!moves.length) return { moves, over: 'nomoves', loser: s.turn };
  if (c.w === 1 && c.b === 1 && c.wk === 1 && c.bk === 1) return { moves, over: 'kings' };
  if (s.np >= NP_DRAW) return { moves, over: 'noprogress' };
  return { moves, over: null };
}

export function notate(s, m) {
  return sqName(m.f) + (m.caps.length ? m.path.map((q) => 'x' + sqName(q)).join('') : '-' + sqName(m.path[0]));
}
/** client move = [from, ...landing squares] ; the host finds the identical legal sequence */
export const toClient = (m) => [m.f, ...m.path];
export function findMove(s, cm, moves = legalMoves(s)) {
  if (!Array.isArray(cm) || cm.length < 2 || cm.length > 34) return null;
  return moves.find((m) => m.f === (cm[0] | 0) && m.path.length === cm.length - 1 && m.path.every((q, i) => q === (cm[i + 1] | 0))) || null;
}

// ------------------------------------------------------------------------------------------------ AI (alpha-beta; level 1 = 2 plies + noise, level 2 = 4 plies)
const MATE = 100000;
function evalStm(s) {
  let sc = 0;
  for (let i = 0; i < 64; i++) {
    const p = s.b[i];
    if (!p) continue;
    const w = p.toLowerCase() === 'w', king = p !== p.toLowerCase(), r = i >> 3, f = i & 7;
    const adv = w ? r : 7 - r;
    let v = king ? 330 : 100 + adv * 7 + (adv >= 5 ? 6 : 0);
    if (king) v += (f > 1 && f < 6 && r > 1 && r < 6 ? 6 : 0);
    sc += w ? v : -v;
  }
  return s.turn === 'w' ? sc : -sc;
}
function search(s, depth, alpha, beta, ply) {
  const moves = legalMoves(s);
  if (!moves.length) return -MATE + ply;
  if (depth === 0) return evalStm(s);
  moves.sort((a, b) => b.caps.length - a.caps.length);
  let best = -Infinity;
  for (const m of moves) {
    const sc = -search(make(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}
export function aiMove(s, level = 2, rnd = Math.random) {
  const moves = legalMoves(s);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const depth = level >= 2 ? 3 : 1, noise = level >= 2 ? 4 : 40;
  let best = null, bs = -Infinity;
  for (const m of moves) {
    const sc = -search(make(s, m), depth, -MATE * 2, MATE * 2, 1) + (rnd() - 0.5) * 2 * noise;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
