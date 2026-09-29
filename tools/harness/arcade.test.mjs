// Node test for module `arcade`: chess rules (perft, mate / stalemate / castling / en passant / promotion), Turkish draughts (dama) capture rules,
// the table state machine (seats, turns, AI, results) and the carnival booth economy (fees, payouts, daily cap).
//   node tools/harness/arcade.test.mjs
import * as C from '../../src/game/chess_rules.js';
import * as D from '../../src/game/draughts_rules.js';
import * as A from '../../src/game/arcade_core.js';
import * as R from '../../src/game/arcade_rps.js';
import * as M from '../../src/game/chess3d_map.js';
import { createPieceSet } from '../../src/models/chess3d.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, `${m}: got ${a}, want ${b}`);
const fen = C.parseFen;
const play = (s, uci) => {   // 'e2e4' / 'e7e8q'
  const m = C.legalMoves(s).find((x) => C.sqName(x.f) + C.sqName(x.t) + (x.p || '') === uci || (!x.p && C.sqName(x.f) + C.sqName(x.t) === uci) || (x.p === 'q' && C.sqName(x.f) + C.sqName(x.t) === uci));
  if (!m) throw new Error('illegal ' + uci);
  return C.make(s, m);
};

// ---------------------------------------------------------------- chess: perft
{
  const s = C.initial();
  eq(C.perft(s, 1), 20, 'perft 1'); eq(C.perft(s, 2), 400, 'perft 2'); eq(C.perft(s, 3), 8902, 'perft 3 (start)');
  eq(C.perft(fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 2), 2039, 'kiwipete 2');
  eq(C.perft(fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 3), 97862, 'kiwipete 3 (castling, ep, pins)');
  eq(C.perft(fen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 4), 43238, 'position 3 (ep + checks)');
  eq(C.perft(fen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 3), 9467, 'position 4 (promotions)');
  eq(C.toFen(C.initial()), C.START_FEN, 'fen round trip');
}
// ---------------------------------------------------------------- chess: mate / stalemate
{
  let s = C.initial();
  for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) s = play(s, m);
  const st = C.status(s);
  eq(st.over, 'mate', 'fool\'s mate is checkmate'); ok(st.check && st.moves.length === 0, 'mate: in check, no moves');
  s = C.initial();
  for (const m of ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']) s = play(s, m);
  eq(C.status(s).over, 'mate', 'scholar\'s mate');
  eq(C.notate(fen('rnbqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'), C.legalMoves(fen('rnbqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4')).find((m) => C.sqName(m.f) === 'h5' && C.sqName(m.t) === 'f7')), 'Qxf7#', 'SAN mate suffix');
  const stale = fen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  eq(C.status(stale).over, 'stalemate', 'stalemate'); ok(!C.status(stale).check, 'stalemate is not check');
  eq(C.status(fen('8/8/8/4k3/8/8/8/K7 w - - 0 1')).over, 'insufficient', 'K vs K');
  eq(C.status(fen('8/8/8/4k3/8/8/8/KB6 w - - 0 1')).over, 'insufficient', 'K+B vs K');
  eq(C.status(fen('8/8/8/4k3/8/8/8/KR6 w - - 0 1')).over, null, 'K+R vs K is playable');
  eq(C.status(fen('8/8/8/4k3/8/8/8/KR6 w - - 100 80')).over, 'fifty', 'fifty-move rule');
}
// ---------------------------------------------------------------- chess: castling / en passant / promotion
{
  let s = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const mv = C.legalMoves(s);
  ok(mv.some((m) => m.castle === 'K') && mv.some((m) => m.castle === 'Q'), 'both castles available');
  const k = play(s, 'e1g1');
  eq(k.b[6], 'K', 'castle K: king on g1'); eq(k.b[5], 'R', 'castle K: rook on f1'); eq(k.b[7], '', 'castle K: h1 empty'); eq(k.castle & 3, 0, 'white loses rights');
  const q = play(s, 'e1c1');
  eq(q.b[2], 'K', 'castle Q: king c1'); eq(q.b[3], 'R', 'castle Q: rook d1'); eq(q.b[0], '', 'castle Q: a1 empty');
  // cannot castle through / out of / into check
  ok(!C.legalMoves(fen('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1')).some((m) => m.castle === 'K'), 'no castling through an attacked f1');
  ok(!C.legalMoves(fen('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1')).some((m) => m.castle), 'no castling out of check');
  ok(!C.legalMoves(fen('r3k2r/8/8/8/8/6r1/8/R3K2R w KQkq - 0 1')).some((m) => m.castle === 'K'), 'no castling into check');
  ok(!C.legalMoves(fen('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1')).some((m) => m.castle === 'K'), 'no castling without the right');
  ok(!C.legalMoves(fen('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1')).some((m) => m.castle === 'Q'), 'no castling through a piece');
  // rook moves lose the right
  eq(play(s, 'h1h5').castle & 1, 0, 'rook move drops K right');
  // en passant
  s = fen('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1');
  s = play(s, 'e2e4'); eq(s.ep, 20, 'ep square set after a double push');
  const ep = C.legalMoves(s).find((m) => m.ep);
  ok(!!ep && ep.t === 20, 'black may capture en passant');
  const after = C.make(s, ep);
  eq(after.b[28], '', 'ep: the pawn on e4 is gone'); eq(after.b[20], 'p', 'ep: capturer on e3');
  s = play(fen('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1'), 'e2e4'); s = play(s, 'e8d8');
  ok(!C.legalMoves(s).some((m) => m.ep), 'ep right expires after one move');
  // ep that would expose the king is illegal
  ok(!C.legalMoves(fen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1')).some((m) => m.ep), 'pinned en passant is illegal');
  // promotion
  s = fen('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  const promos = C.legalMoves(s).filter((m) => m.f === 48);
  eq(promos.length, 4, 'four promotion choices'); eq(promos.map((m) => m.p).sort().join(''), 'bnqr', 'q r b n');
  eq(C.make(s, C.findMove(s, [48, 56])).b[56], 'Q', 'default promotion is a queen');
  eq(C.make(s, C.findMove(s, [48, 56, 'n'])).b[56], 'N', 'underpromotion to a knight');
  eq(C.findMove(s, [48, 40]), null, 'illegal client move rejected');
  ok(C.status(C.make(s, C.findMove(s, [48, 56, 'r']))).check, 'promotion to a rook gives check');
}
// ---------------------------------------------------------------- chess: AI
{
  const s = fen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const m = C.aiMove(s, 2, () => 0.5);
  eq(C.notate(s, m), 'Ra8#', 'AI finds mate in one (2-ply)');
  const hang = fen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  eq(C.notate(hang, C.aiMove(hang, 1, () => 0.5)), 'Rxd5', 'AI (1-ply) grabs a free queen');
  let g = C.initial(), n = 0;
  while (n++ < 30 && !C.status(g).over) { const mm = C.aiMove(g, n % 2 ? 1 : 2); ok(!!mm && C.legalMoves(g).some((x) => x.f === mm.f && x.t === mm.t), 'AI move is legal'); g = C.make(g, mm); }
}

// ---------------------------------------------------------------- dama (Turkish draughts)
{
  const s0 = D.initial(), c0 = D.count(s0);
  eq(c0.w, 16, '16 white men'); eq(c0.b, 16, '16 black men');
  eq(s0.b[8], 'w', 'white on rank 2'); eq(s0.b[16], 'w', 'white on rank 3'); eq(s0.b[40], 'b', 'black on rank 6'); eq(s0.b[48], 'b', 'black on rank 7');
  const mv = D.legalMoves(s0);
  eq(mv.length, 8, 'opening: only the 8 front men can move (forward, none sideways)'); ok(mv.every((m) => (m.f >> 3) === 2 && !m.caps.length), 'opening moves are 3rd-rank men stepping forward');
  ok(D.legalMoves({ ...s0, turn: 'b' }).length === 8, 'black has 8 openings too');
  // men move sideways, not backwards, and never diagonally
  let s = D.fromRows(['........', '........', '........', '........', '...w....', '........', '........', '........'], 'w');
  s.b[63] = 'b';
  const dests = D.legalMoves(s).filter((m) => m.f === 27).map((m) => D.sqName(m.path[0])).sort().join(',');
  eq(dests, 'c4,d5,e4', 'man: forward + both sides only');
  // simple mandatory capture, forward and sideways
  s = D.fromRows(['........', '........', '........', '...b....', '...w....', '........', '........', '.......b'], 'w');
  let m = D.legalMoves(s);
  ok(m.length === 1 && m[0].caps.length === 1 && D.sqName(m[0].path[0]) === 'd6', 'forward capture is mandatory (only move)');
  s = D.fromRows(['........', '........', '........', '........', '..bw....', '........', '........', '.......b'], 'w');
  m = D.legalMoves(s);
  ok(m.length === 1 && m[0].caps.length === 1 && D.sqName(m[0].path[0]) === 'b4', 'sideways capture is mandatory');
  // men cannot capture backwards
  s = D.fromRows(['........', '........', '........', '........', '...w....', '...b....', '........', '.......b'], 'w');
  ok(D.legalMoves(s).every((x) => !x.caps.length), 'no backward capture for men');
  ok(D.legalMoves({ ...s, turn: 'b' }).every((x) => !x.caps.length), 'the black man cannot capture backwards either');
  // majority rule: the 2-capture line beats the 1-capture line
  s = D.fromRows(['........', '........', '........', '..b.....', '........', '..b.....', '.bw.....', '........'], 'w');
  s.b[63] = 'b';
  const first = D.legalMoves(s);
  ok(first.length === 1 && first[0].caps.length === 2, 'majority rule: must take the 2-chain, not the single sideways capture');
  // multi-jump with a turn (forward then sideways), captured pieces removed at the end
  s = D.fromRows(['........', '........', '........', '....b...', '...b....', '..b.....', '..w.....', '........'], 'w');
  s.b[63] = 'b';
  m = D.legalMoves(s);
  ok(m.length === 1 && m[0].caps.length === 3 && m[0].path.length === 3, 'chain: forward, sideways, forward = 3 captures');
  const done = D.make(s, m[0]);
  eq(D.count(done).b, 1, 'captured men removed after the sequence'); eq(D.count(done).w, 1, 'own man survives');
  // crowning: a man stepping onto the last rank becomes a king
  s = D.fromRows(['.b......', 'w.......', '........', '........', '........', '........', '........', '........'], 'w');
  m = D.legalMoves(s);
  const promo = m.find((x) => x.path[0] === 56);
  ok(!!promo, 'man can step onto the last rank');
  eq(D.make(s, promo).b[56], 'W', 'man is crowned on the last rank');
  // man reaching the last rank mid-capture continues sideways as a MAN (cannot capture backwards)
  s = D.fromRows(['..b.....', '........', '.b......', '........', '........', '........', '........', '........'], 'w');
  s.b[8 * 5 + 1] = 'w';   // b6 white man
  s.b[8 * 6 + 1] = 'b';   // b7 black man  -> jump to b8
  s.b[8 * 7 + 2] = 'b';   // c8 black man -> then sideways jump over c8? needs d8 empty: b8 -> d8
  m = D.legalMoves(s);
  const chain = m.find((x) => x.f === 41);
  ok(!!chain && chain.caps.length === 2 && chain.path.length === 2 && chain.path[0] === 57 && chain.path[1] === 59, 'man: last-rank arrival then sideways capture continues');
  eq(D.make(s, chain).b[59], 'W', '... and is crowned at the end of the move');
  // flying king: jumps over ONE enemy from a distance, lands on any empty square behind
  s = D.fromRows(['........', '........', '........', '........', '........', '........', '........', 'W..b...b'], 'w');
  m = D.legalMoves(s);
  ok(m.length === 3 && m.every((x) => x.f === 0 && x.caps.length === 1 && x.caps[0] === 3), 'king captures from a distance, may land on e1, f1, g1 (any empty square behind)');
  ok(m.map((x) => x.path[0]).sort((a, b) => a - b).join() === '4,5,6', 'landing squares e1 f1 g1');
  // king cannot jump two adjacent enemies
  s = D.fromRows(['........', '........', '........', '........', '........', '........', '........', 'W.bb...b'], 'w');
  ok(D.legalMoves(s).every((x) => !x.caps.length), 'king cannot jump two adjacent pieces');
  // king simple moves fly orthogonally
  s = D.fromRows(['.......b', '........', '........', '........', '...W....', '........', '........', '........'], 'w');
  eq(D.legalMoves(s).length, 7 + 7, 'king on d4: 14 orthogonal squares');   // 7 along the file, 7 along the rank
  // captured pieces block: cannot jump the same piece twice
  s = D.fromRows(['........', '........', '........', '........', '........', '........', '........', 'W.b.b...'], 'w');
  s.b[0] = 'W'; s.b[2] = 'b'; s.b[4] = 'b'; s.b[7 * 8 + 7] = 'b';
  m = D.legalMoves(s);
  ok(m.every((x) => x.caps.length === 2), 'king takes both spaced men in one sequence (majority)');
  // winner detection
  s = D.fromRows(['........', '........', '........', '........', '........', '........', '........', 'w.......'], 'b');
  eq(D.status(s).over, 'nomoves', 'no pieces / no moves loses'); eq(D.status(s).loser, 'b', 'the side to move loses');
  s = D.fromRows(['........', '........', '........', '....W...', '........', '........', '........', 'B.......'], 'w');
  eq(D.status(s).over, 'kings', 'king vs king is a draw');
  // client move lookup + serialisation
  const t0 = D.initial(), m0 = D.legalMoves(t0)[0];
  ok(D.findMove(t0, D.toClient(m0))?.f === m0.f, 'client move round-trip'); eq(D.findMove(t0, [16, 40]), null, 'illegal client move rejected');
  eq(D.ser(D.parse(D.ser(t0))), D.ser(t0), 'position string round-trip');
  // AI legality + plays a whole game without crashing
  let g = D.initial(), n = 0;
  while (n++ < 120 && !D.status(g).over) { const mm = D.aiMove(g, n % 2 ? 1 : 2); ok(!!mm && D.findMove(g, D.toClient(mm)) !== null, 'dama AI move legal'); g = D.make(g, mm); }
  const capt = D.fromRows(['........', '........', '........', '........', '........', '..b.....', '.w......', '........'], 'w');
  capt.b[8 * 5 + 1] = 'b'; capt.b[8 * 4 + 1] = 'w'; capt.b[8 * 5 + 2] = '';
  capt.b[8 * 7 + 7] = 'b';
  const aiC = D.aiMove(capt, 2, () => 0.5);
  ok(aiC.caps.length >= 1, 'AI plays the mandatory capture');
}

// ---------------------------------------------------------------- table state machine
{
  let t = A.newTable('x');
  ok(A.sit(t, 'p1', 'w').ok && !A.sit(t, 'p2', 'w').ok && A.sit(t, 'p2', 'b').ok, 'seats');
  ok(!A.move(t, 'p2', [12, 28]).ok, 'black cannot move first'); ok(!A.move(t, 'p3', [12, 28]).ok, 'spectators cannot move');
  ok(!A.move(t, 'p1', [12, 44]).ok, 'illegal move rejected'); ok(A.move(t, 'p1', [12, 28]).ok, 'e2e4'); eq(t.ply, 1, 'ply'); ok(!A.move(t, 'p1', [11, 27]).ok, 'not your turn');
  ok(!A.sit(t, 'p1', 'b').ok, 'cannot switch seat mid game'); ok(!A.setKind(t, 'p1', 'draughts').ok, 'no mode change mid game'); ok(!A.newGame(t, 'p1').ok, 'no restart mid game');
  const snap = A.snapshot(t), dec = A.decode(snap);
  eq(dec.st.turn, 'b', 'snapshot decodes'); ok(dec.moves.length === 20, 'client sees the legal moves'); eq(snap.log[0], '1. e4', 'log notation');
  // fool's mate through the table
  t = A.newTable('m'); A.sit(t, 'a', 'w'); A.sit(t, 'b', 'b');
  for (const [p, f, to] of [['a', 13, 21], ['b', 52, 36], ['a', 14, 30], ['b', 59, 31]]) ok(A.move(t, p, [f, to]).ok, 'fool\'s mate move');
  eq(t.over?.reason, 'mate', 'table detects mate'); eq(t.over?.winner, 'b', 'black wins'); ok(!A.move(t, 'a', [8, 16]).ok, 'no moves after the game');
  ok(A.newGame(t, 'a').ok && t.seats.w === 'b' && t.seats.b === 'a' && t.ply === 0, 'new game swaps colours');
  // resign, stand, mode toggle
  ok(A.move(t, 'b', [12, 28]).ok && A.resign(t, 'a').ok && t.over.winner === 'w' && t.over.reason === 'resign', 'resign');
  ok(A.newGame(t, 'a').ok && A.setKind(t, 'a', 'draughts').ok && t.kind === 'draughts', 'mode toggle to dama'); eq(A.decode(A.snapshot(t)).moves.length, 8, 'dama opening moves');
  A.stand(t, 'a'); A.stand(t, 'b'); ok(!A.inProgress(t) && t.ai.w === 0 && t.ply === 0, 'empty table resets');
  // AI opponent
  t = A.newTable('ai'); A.sit(t, 'h', 'w'); ok(A.setAI(t, 'h', 'b', 2).ok && !A.setAI(t, 'zz', 'b', 1).ok, 'AI seat only by a seated player');
  ok(!A.aiToMove(t), 'AI waits for white'); A.move(t, 'h', [12, 28]); ok(A.aiToMove(t), 'AI to move'); ok(A.aiStep(t).ok && t.ply === 2, 'AI answers'); ok(!A.aiToMove(t), 'AI done');
  ok(!A.sit(t, 'j', 'b').ok, 'cannot take the AI seat mid game');
  // threefold repetition draw
  t = A.newTable('r'); A.sit(t, 'a', 'w'); A.sit(t, 'b', 'b');
  const cyc = [['a', 6, 21], ['b', 62, 45], ['a', 21, 6], ['b', 45, 62]];
  for (let i = 0; i < 2; i++) for (const [p, f, to] of cyc) A.move(t, p, [f, to]);
  eq(t.over?.reason, 'repetition', 'threefold repetition'); eq(t.over?.winner, 'd', 'is a draw');
  // dama through the table incl. a multi-step client move
  t = A.newTable('d', 'draughts'); A.sit(t, 'a', 'w'); A.sit(t, 'b', 'b');
  ok(A.move(t, 'a', [20, 28]).ok, 'dama opening move (e3-e4)');
}

// ---------------------------------------------------------------- booth economy
{
  const B = A.createBooths();
  eq(A.payout('cans', 2), 0, 'cans: 2 = nothing'); eq(A.payout('cans', 3), 4, 'cans 3'); eq(A.payout('cans', 6), 24, 'cans 6');
  eq(A.payout('cans', 99), 24, 'score is clamped'); eq(A.payout('nope', 5), 0, 'unknown booth');
  for (const k of A.BOOTH_IDS) {
    const b = A.BOOTHS[k];
    ok(b.pay.every(([need, pay]) => pay >= b.fee * 0.6), k + ': lowest prize refunds most of the fee');
    ok(b.pay[b.pay.length - 1][1] < b.fee, k + ': the lowest prize is below the fee (mediocre play loses credits)');
    ok(b.pay[0][1] <= 4 * b.fee, k + ': jackpot <= 4x fee');
  }
  ok(!B.start('p', 'cans', 10, 3).ok, 'cannot afford the fee'); const st = B.start('p', 'cans', 10, 100);
  ok(st.ok && st.fee === 6, 'session starts'); ok(!B.start('p', 'gallery', 11, 100).ok, 'one session at a time');
  ok(!B.end('p', st.sid + 5, 'cans', 6, 20, 1).ok, 'wrong session id'); ok(!B.end('q', st.sid, 'cans', 6, 20, 1).ok, 'wrong player');
  let r = B.end('p', st.sid, 'cans', 6, 20, 1);
  ok(r.ok && r.pay === 24 && r.xp > 0, 'perfect cans pays 24'); ok(!B.end('p', st.sid, 'cans', 6, 21, 1).ok, 'a session pays once');
  const s2 = B.start('p', 'cans', 21, 100); ok(s2.ok, 'next play after the first ended'); B.abort('p');
  ok(!B.start('p', 'cans', 22, 100).ok, 'cooldown between plays');
  const s3 = B.start('p', 'cans', 30, 100); r = B.end('p', s3.sid, 'cans', 6, 30.5, 1); ok(r.cheat && r.pay === 0, 'instant results (faster than humanly possible) pay nothing');
  // daily cap
  let paid = 24, t0 = 40;
  for (let i = 0; i < 10; i++) { const s = B.start('p', 'cans', t0 += 10, 999); r = B.end('p', s.sid, 'cans', 6, t0 += 10, 1); paid += r.pay; }
  eq(paid, A.DAILY_CAP, 'daily prize cap is enforced (' + A.DAILY_CAP + ')'); ok(r.capped, 'result says the cap was hit');
  const sN = B.start('p', 'cans', t0 += 10, 999); r = B.end('p', sN.sid, 'cans', 6, t0 += 10, 2); eq(r.pay, 24, 'new day, new cap');
  const sq = B.start('q', 'cans', 5, 999); r = B.end('q', sq.sid, 'cans', 6, 20, 1); eq(r.pay, 24, 'caps are per player');
  const sx = B.start('z', 'strength', 5, 999); ok(B.end('z', sx.sid, 'gallery', 9, 90, 1).ok === false, 'booth mismatch rejected');
  // expected value sanity: an average-skill player loses credits (fee > average payout), only very good players profit
  const evAvg = (k, dist) => dist.reduce((a, [score, p]) => a + A.payout(k, score) * p, 0);
  ok(evAvg('cans', [[2, 0.3], [3, 0.3], [4, 0.25], [5, 0.1], [6, 0.05]]) < A.BOOTHS.cans.fee, 'cans: average player loses credits');
  ok(evAvg('strength', [[30, 0.25], [55, 0.3], [75, 0.3], [92, 0.13], [100, 0.02]]) < A.BOOTHS.strength.fee, 'strength: average player loses credits');
}

// ---------------------------------------------------------------- rock paper scissors (host rules, commit-reveal)
{
  ok(R.beats(0, 2) === 1 && R.beats(1, 0) === 1 && R.beats(2, 1) === 1, 'rock > scissors, paper > rock, scissors > paper');
  ok(R.beats(2, 0) === -1 && R.beats(0, 1) === -1 && R.beats(1, 2) === -1 && R.beats(1, 1) === 0, 'reverse + draws');
  let day = 1, rv = 0.1;
  const mk = () => R.createRpsHost({ rnd: () => rv, day: () => day });
  const kinds = (h) => h.drain().map((e) => e.msg.k);
  let h = mk(), now = 10;
  ok(!h.challenge(now, 'a', 'a', 0).ok, 'no self challenge'); ok(!h.challenge(now, 'a', 'b', 999).ok, 'wager cap');
  ok(h.challenge(now, 'a', 'b', 10).ok, 'challenge'); ok(!h.challenge(now + 5, 'c', 'b', 0).ok, 'busy target'); ok(!h.challenge(now + 5, 'a', 'c', 0).ok, 'busy challenger');
  eq(kinds(h).join(), 'rpsc', 'challenge event');
  ok(!h.respond(now, 'a', true).ok, 'only the target answers'); ok(h.respond(now, 'b', true).ok, 'accept');
  ok(h.drain().some((e) => e.msg.k === 'rpsr' && e.msg.round === 1), 'round 1 starts');
  // commit-reveal: a pick event carries no value, the reveal only comes with the second pick
  ok(h.pick(now, 'a', 0).ok, 'a picks rock'); let ev = h.drain();
  ok(ev.length === 1 && ev[0].msg.k === 'rpsp' && !('mv' in ev[0].msg) && !('picks' in ev[0].msg) && JSON.stringify(ev).indexOf('rock') < 0, 'pick event leaks nothing');
  ok(!h.pick(now, 'a', 1).ok, 'no second pick'); ok(h.drain().length === 0, 'no event for a refused pick');
  ok(h.pick(now, 'b', 2).ok, 'b picks scissors'); ev = h.drain();
  const rv1 = ev.find((e) => e.msg.k === 'rpsv');
  ok(rv1 && rv1.to === 'all' && rv1.msg.win === 'a' && rv1.msg.sc.a === 1 && rv1.msg.picks[0] === 0 && rv1.msg.picks[1] === 2, 'reveal: rock beats scissors, 1-0');
  ok(!h.pick(now, 'a', 1).ok, 'cannot pick during the result');
  h.tick(now + R.RPS.RESULT_SEC + 0.1); ok(h.drain().some((e) => e.msg.k === 'rpsr' && e.msg.round === 2), 'round 2 after the result pause');
  // draw replays, then a wins 2-0
  h.pick(now + 5, 'a', 1); h.pick(now + 5, 'b', 1); ev = h.drain(); ok(ev.find((e) => e.msg.k === 'rpsv').msg.win === 'd' && ev.find((e) => e.msg.k === 'rpsv').msg.sc.a === 1, 'draw does not score');
  h.tick(now + 20); h.drain();
  h.pick(now + 21, 'a', 1); h.pick(now + 21, 'b', 0); ev = h.drain();
  ok(ev.find((e) => e.msg.k === 'rpsv').msg.last === true, 'a reached 2 wins');
  h.tick(now + 30); ev = h.drain(); const end = ev.find((e) => e.msg.k === 'rpse');
  ok(end && end.msg.winner === 'a' && end.msg.pay === 10 && end.msg.wager === 10, 'match end pays the wager'); ok(h.matches.size === 0 && h.byPid.size === 0, 'match cleaned up');
  // timeout: missing pick is random, the round still resolves
  h = mk(); now = 100; h.challenge(now, 'a', 'b', 0); h.respond(now, 'b', true); h.drain();
  h.pick(now + 1, 'a', 0); h.drain(); h.tick(now + 1 + R.RPS.INTRO_SEC + R.RPS.PICK_SEC + 1); ev = h.drain();
  const tv = ev.find((e) => e.msg.k === 'rpsv'); ok(tv && tv.msg.auto.b === true && tv.msg.auto.a === false && tv.msg.picks[1] === 0, 'timeout picks randomly for the slow player');
  // decline / expire / leave
  h = mk(); h.challenge(0, 'a', 'b', 0); h.drain(); h.respond(1, 'b', false); ok(kinds(h).join() === 'rpsn' && h.matches.size === 0, 'decline frees both');
  h.challenge(10, 'a', 'b', 0); h.drain(); h.tick(10 + R.RPS.CHALLENGE_SEC + 1); ok(kinds(h).join() === 'rpsn' && h.byPid.size === 0, 'challenge expires');
  h.challenge(30, 'a', 'b', 5); h.respond(31, 'b', true); h.drain(); ok(h.leave(32, 'a'), 'leave aborts'); ev = h.drain(); ok(ev.every((e) => e.msg.k === 'rpsn') && h.matches.size === 0, 'no payout on abort');
  // max rounds: only draws -> draw, no payout
  h = mk(); h.challenge(0, 'a', 'b', 5); h.respond(0, 'b', true); h.drain(); let tt = 0;
  for (let i = 0; i < R.RPS.MAX_ROUNDS; i++) { h.pick(tt, 'a', 1); h.pick(tt, 'b', 1); tt += R.RPS.RESULT_SEC + 0.1; h.tick(tt); }
  ev = h.drain(); const dr = ev.find((e) => e.msg.k === 'rpse'); ok(dr && dr.msg.winner === 'd' && dr.msg.pay === 0, 'all draws -> a draw, nobody is paid');
  // daily win cap
  h = mk(); let paid = 0, tm = 0;
  for (let g = 0; g < 6; g++) {
    tm += 50; h.challenge(tm, 'a', 'b', 25); h.respond(tm, 'b', true); h.drain();
    for (let r = 0; r < 2; r++) { h.pick(tm, 'a', 0); h.pick(tm, 'b', 2); tm += R.RPS.RESULT_SEC + 0.1; h.tick(tm); }
    ev = h.drain(); paid += ev.find((e) => e.msg.k === 'rpse')?.msg.pay || 0;
  }
  eq(paid, R.RPS.DAILY_WIN_CAP, 'daily Clout win cap'); day = 2; tm += 50; h.challenge(tm, 'a', 'b', 25); h.respond(tm, 'b', true); h.drain();
  for (let r = 0; r < 2; r++) { h.pick(tm, 'a', 0); h.pick(tm, 'b', 2); tm += R.RPS.RESULT_SEC + 0.1; h.tick(tm); }
  eq(h.drain().find((e) => e.msg.k === 'rpse')?.msg.pay, 25, 'new day, new cap');
  // fairness sanity: the auto pick distribution covers all three moves
  const seen = new Set(); for (const x of [0, 0.4, 0.8]) { rv = x; const hh = mk(); hh.challenge(0, 'a', 'b', 0); hh.respond(0, 'b', true); hh.drain(); hh.tick(99); seen.add(hh.drain().find((e) => e.msg.k === 'rpsv').msg.picks[0]); }
  eq(seen.size, 3, 'random auto picks reach rock, paper and scissors');
}

// ---------------------------------------------------------------- chess3d: square <-> world mapping, instancing, pick -> move
{
  for (let sq = 0; sq < 64; sq++) { const l = M.sqToLocal(sq); eq(M.localToSq(l.x, l.z), sq, 'sq round trip ' + sq); }
  const a1 = M.sqToLocal(0), h8 = M.sqToLocal(63);
  ok(Math.abs(a1.x + 0.35) < 1e-9 && Math.abs(a1.z - 0.35) < 1e-9, 'a1 is near-left of White (x -0.35, z +0.35)'); ok(Math.abs(h8.x - 0.35) < 1e-9 && Math.abs(h8.z + 0.35) < 1e-9, 'h8 is far-right');
  eq(M.localToSq(0.6, 0), -1, 'off the board (x)'); eq(M.localToSq(0, -0.51), -1, 'off the board (z)');
  // a ray from the White camera pose through the e4 square centre picks e4
  const pose = M.viewPose('w'), e4 = M.sqToLocal(28), py = M.TOP_Y + 0.035;
  const dir = { x: e4.x - pose.eye.x, y: py - pose.eye.y, z: e4.z - pose.eye.z };
  eq(M.rayToSq(pose.eye, dir, py), 28, 'camera ray through e4 picks e4'); eq(M.rayToSq(pose.eye, { x: 0, y: 1, z: 0 }, py), -1, 'ray pointing up misses');
  ok(M.viewPose('b').eye.z < 0 && pose.eye.z > 0, 'black views from the -z side');

  // piece lists + instancing
  const st = A.newTable('t'), sn = A.snapshot(st), list = M.piecesOf(sn.kind, sn.pos);
  eq(list.length, 32, 'chess start: 32 pieces'); eq(list.find((p) => p.sq === 4).t, 'k', 'e1 king'); eq(list.find((p) => p.sq === 4).c, 'w', 'e1 is white'); eq(list.find((p) => p.sq === 60).t, 'k', 'e8 king');
  const cnt = M.instanceCounts(list);
  eq(Object.keys(cnt).length, 12, 'chess: 12 instanced meshes (6 types x 2 colours)'); eq(cnt.p_w, 8, '8 white pawns'); eq(cnt.n_b, 2, '2 black knights'); eq(cnt.q_w, 1, '1 white queen');
  const set = createPieceSet(); set.setPieces(list, {});
  let sst = set.stats(); eq(sst.instances, 32, 'piece set: 32 instances'); ok(sst.drawCalls <= 12, `piece draw calls <= 12 (got ${sst.drawCalls})`);
  set.setMarks({ last: [12, 28], check: -1, sel: 12, tgt: [[20, false], [28, true]] }); sst = set.stats(); ok(sst.drawCalls <= 15, `pieces + marks <= 15 draw calls (got ${sst.drawCalls})`);
  const dl = M.piecesOf('draughts', D.ser(D.initial()));
  eq(dl.length, 32, 'dama start: 32 men'); eq(Object.keys(M.instanceCounts(dl)).length, 2, 'dama: 2 instanced meshes');
  set.setMarks({ last: null, check: -1, sel: -1, tgt: [] }); set.setPieces(dl, {}); eq(set.stats().drawCalls, 2, 'dama: 2 piece draw calls');
  set.dispose();

  // move diff (animation source): pawn push, capture, castling, promotion
  const p1 = M.piecesOf('chess', C.START_FEN), p2 = M.piecesOf('chess', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  const mv = M.diffMoves(p1, p2); eq(mv.length, 1, 'e4: one moved piece'); ok(mv[0].from === 12 && mv[0].to === 28 && mv[0].t === 'p', 'e2 -> e4 pawn');
  const c1 = M.piecesOf('chess', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), c2 = M.piecesOf('chess', 'r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  const cm = M.diffMoves(c1, c2); eq(cm.length, 2, 'castling moves two pieces'); ok(cm.some((m) => m.t === 'k' && m.from === 4 && m.to === 6) && cm.some((m) => m.t === 'r' && m.from === 7 && m.to === 5), 'king e1-g1 + rook h1-f1');
  const x1 = M.piecesOf('chess', '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1'), x2 = M.piecesOf('chess', '4k3/8/8/3P4/8/8/8/4K3 b - - 0 1');
  const xm = M.diffMoves(x1, x2); eq(xm.length, 1, 'capture: only the mover animates'); ok(xm[0].from === 28 && xm[0].to === 35, 'exd5');
  const q1 = M.piecesOf('chess', '8/4P3/8/8/8/8/8/k6K w - - 0 1'), q2 = M.piecesOf('chess', '4Q3/8/8/8/8/8/8/k6K b - - 0 1');
  const qm = M.diffMoves(q1, q2); ok(qm.length === 1 && qm[0].to === 60 && qm[0].t === 'q', 'promotion animates the pawn to the queen');
  const kp = M.piecesOf('chess', '4k3/8/8/8/8/8/8/4K2r w - - 0 1');
  eq(M.checkSquare('chess', kp, 'w', true), 4, 'check ring goes under the checked king'); eq(M.checkSquare('chess', kp, 'w', false), -1, 'no ring without check'); eq(M.checkSquare('draughts', dl, 'w', true), -1, 'no ring in dama');

  // pick -> move translation through a real table (host snapshot + client decode)
  const tb = A.newTable('t'); A.sit(tb, 'p1', 'w'); A.sit(tb, 'p2', 'b');
  const view = () => { const snap = A.snapshot(tb); return { snap, dec: A.decode(snap) }; };
  let { snap, dec } = view(); const P = M.createPicker();
  ok(P.click(snap, dec, 'w', 12).changed && P.sel === 12, 'click e2 selects the pawn'); const tg = P.targets(snap, dec, 'w');
  ok(tg.has(20) && tg.has(28) && tg.size === 2, 'e2 pawn targets: e3 + e4');
  const res = P.click(snap, dec, 'w', 28); ok(Array.isArray(res.m) && res.m.join() === '12,28', 'e4 click emits [12, 28]'); eq(P.sel, -1, 'selection cleared after the move');
  ok(A.move(tb, 'p1', res.m).ok, 'host accepts the picked move'); ({ snap, dec } = view());
  ok(!P.canPick(snap, dec, 'w', 8), 'not my turn: nothing to pick'); ok(!P.click(snap, dec, 'w', 8).changed, 'not my turn: click ignored'); ok(!P.canPick(snap, dec, null, 52), 'spectator cannot pick');
  ok(P.click(snap, dec, 'b', 52).changed && P.targets(snap, dec, 'b').size === 2, 'black picks e7'); ok(P.click(snap, dec, 'b', 52).changed && P.sel === -1, 'second click on the same piece deselects');
  ok(P.click(snap, dec, 'b', 51).changed && P.sel === 51, 'select d7'); ok(P.click(snap, dec, 'b', 52).changed && P.sel === 52, 'clicking another own piece switches the selection');
  ok(P.click(snap, dec, 'b', 30).changed, 'empty non-target square clears the selection'); eq(P.sel, -1, 'selection cleared');
  // promotion needs the picker
  const pt = A.newTable('t'); pt.st = fen('8/4P2k/8/8/8/8/8/K7 w - - 0 1'); A.sit(pt, 'p1', 'w'); A.sit(pt, 'p2', 'b');
  {
    const sn2 = A.snapshot(pt), d2 = A.decode(sn2), Q = M.createPicker();
    Q.click(sn2, d2, 'w', 52); const r = Q.click(sn2, d2, 'w', 60); ok(r.promo && !r.m && Q.promo, 'reaching the last rank asks for a promotion piece');
    ok(!Q.canPick(sn2, d2, 'w', 52), 'picker locked while choosing'); const pm = Q.choosePromo('n'); ok(pm && pm.join() === '52,60,n', 'promotion choice emits [from, to, n]');
    ok(A.move(pt, 'p1', pm).ok, 'host accepts the promotion'); eq(Q.choosePromo('q'), null, 'no pending promotion after choosing');
  }
  // dama: multi-jump is built step by step
  const dt = A.newTable('d', 'draughts'); dt.st = D.fromRows(['........', '........', '...b....', '..b.....', '..w.....', '........', '........', '........'], 'w'); A.sit(dt, 'p1', 'w'); A.sit(dt, 'p2', 'b');
  {
    const sn3 = A.snapshot(dt), d3 = A.decode(sn3), Q = M.createPicker(), wsq = d3.moves[0].f;
    ok(Q.click(sn3, d3, 'w', wsq).changed, 'dama: select the capturing man');
    const tg3 = Q.targets(sn3, d3, 'w'); ok(tg3.size >= 1 && [...tg3.values()].every((v) => v === 'cap'), 'dama: only capture landings are offered (mandatory capture)');
    let m = null, guard = 0;
    while (!m && guard++ < 6) { const t2 = Q.targets(sn3, d3, 'w'); m = Q.click(sn3, d3, 'w', [...t2.keys()][0]).m || null; }
    ok(m && m.length >= 3 && m[0] === wsq, 'dama: the jump path is emitted as [from, ...landings]'); ok(A.move(dt, 'p1', m).ok, 'host accepts the picked dama path');
  }
}

if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('arcade: all tests passed');
