// Node test: chess captures + seats. Pawn diagonal capture, knight capture, en passant, mate-in-one, illegal (self-check) rejection, seat rules of the table state
// machine, and the 3D picker offering / executing a capture.   node tools/harness/chess_capture.test.mjs
import * as C from '../../src/game/chess_rules.js';
import * as A from '../../src/game/arcade_core.js';
import * as M from '../../src/game/chess3d_map.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, `${m}: got ${a}, want ${b}`);
const sq = C.sqIndex;
const mv = (s, from, to, p) => C.legalMoves(s).find((m) => m.f === sq(from) && m.t === sq(to) && (!p || m.p === p));
const play = (s, ...pairs) => { for (const [a, b, p] of pairs) { const m = mv(s, a, b, p); if (!m) throw new Error(`illegal ${a}${b}`); s = C.make(s, m); } return s; };

// pawn diagonal capture (e4 d5 exd5) and no diagonal move to an empty square
{
  const s0 = play(C.initial(), ['e2', 'e4'], ['d7', 'd5']);
  const m = mv(s0, 'e4', 'd5'); ok(m && m.cap, 'exd5 is legal and flagged as capture');
  ok(!mv(s0, 'e4', 'f5'), 'no diagonal pawn move to an empty square');
  const s = C.make(s0, m); eq(s.b[sq('d5')], 'P', 'white pawn on d5'); eq(s.b.filter((x) => x === 'p').length, 7, 'black pawn removed');
  eq(C.notate(s0, m), 'exd5', 'SAN exd5');
  const s2 = play(C.initial(), ['d2', 'd4'], ['e7', 'e5']);
  ok(mv(s2, 'd4', 'e5')?.cap, 'white dxe5');
  const s3 = play(s2, ['d4', 'e5']); ok(mv(s3, 'd7', 'd6') && !mv(s3, 'f7', 'e5'), 'no phantom captures');
}
// knight capture
{
  const s = play(C.initial(), ['g1', 'f3'], ['e7', 'e5'], ['f3', 'e5']);
  eq(s.b[sq('e5')], 'N', 'knight took e5'); eq(s.b.filter((x) => x === 'p').length, 7, 'e5 pawn gone');
}
// en passant (only immediately)
{
  let s = play(C.initial(), ['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']);
  const ep = mv(s, 'e5', 'd6'); ok(ep && ep.ep && ep.cap, 'en passant exd6 available');
  const t = C.make(s, ep); eq(t.b[sq('d5')], '', 'en passant removes the d5 pawn'); eq(t.b[sq('d6')], 'P', 'capturing pawn lands on d6');
  s = play(s, ['h2', 'h3'], ['h7', 'h6']); ok(!mv(s, 'e5', 'd6'), 'en passant expires after one move');
}
// promotion by capture (queen default)
{
  const s = C.parseFen('1n5k/P7/8/8/8/8/8/K7 w - - 0 1');
  const m = C.findMove(s, [sq('a7'), sq('b8')]); ok(m && m.p === 'q' && m.cap, 'axb8=Q auto-queens'); eq(C.make(s, m).b[sq('b8')], 'Q', 'queen on b8');
}
// mate in one
{
  const s = C.parseFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'), m = mv(s, 'a1', 'a8');
  eq(C.status(C.make(s, m)).over, 'mate', 'Ra8 is checkmate'); eq(C.notate(s, m), 'Ra8#', 'notated as mate');
  eq(C.legalMoves(s).filter((x) => C.status(C.make(s, x)).over === 'mate').length, 1, 'exactly one mating move');
}
// illegal: pinned piece / king into check / protected piece
{
  const s = C.parseFen('4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1');
  ok(!mv(s, 'e2', 'd3'), 'pinned bishop cannot leave the e-file');
  const t = A.newTable('x'); t.st = s; A.sit(t, 'p1', 'w'); A.sit(t, 'p2', 'b');
  eq(A.move(t, 'p1', [sq('e2'), sq('d3')]).ok, false, 'table rejects the move that exposes the king');
  ok(mv(C.parseFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'), 'e1', 'e2')?.cap, 'king captures the undefended rook');
  ok(!C.legalMoves(C.parseFen('4k3/8/8/8/8/8/3rr3/4K3 w - - 0 1')).some((m) => m.t === sq('e2')), 'king cannot capture a protected rook');
}
// seats: one player per seat, only your colour, only your turn
{
  const t = A.newTable('s');
  ok(A.sit(t, 'p1', 'w').ok, 'p1 sits white'); eq(A.sit(t, 'p2', 'w').ok, false, 'second player cannot take the same seat'); ok(A.sit(t, 'p2', 'b').ok, 'p2 sits black');
  eq(A.move(t, 'p2', [sq('e7'), sq('e5')]).ok, false, 'black cannot move on white\'s turn');
  eq(A.move(t, 'p3', [sq('e2'), sq('e4')]).ok, false, 'spectator cannot move');
  ok(A.move(t, 'p1', [sq('e2'), sq('e4')]).ok, 'white moves');
  eq(A.move(t, 'p1', [sq('d2'), sq('d4')]).ok, false, 'white cannot move twice');
  eq(A.move(t, 'p2', [sq('e4'), sq('e5')]).ok, false, 'black cannot move a white piece');
  ok(A.move(t, 'p2', [sq('d7'), sq('d5')]).ok, 'black moves'); ok(A.move(t, 'p1', [sq('e4'), sq('d5')]).ok, 'capture through the table');
  A.stand(t, 'p1'); ok(t.seats.w === null, 'stand frees the seat');
  // picker: seated white sees the capture in red and executes it
  const t2 = A.newTable('p'); A.sit(t2, 'a', 'w'); A.sit(t2, 'b', 'b');
  A.move(t2, 'a', [sq('e2'), sq('e4')]); A.move(t2, 'b', [sq('d7'), sq('d5')]);
  const snap = A.snapshot(t2), dec = A.decode(snap), P = M.createPicker();
  ok(P.click(snap, dec, 'w', sq('e4')).changed, 'pick e4'); const tg = P.targets(snap, dec, 'w');
  eq(tg.get(sq('d5')), 'cap', 'd5 is a capture target'); eq(tg.get(sq('e5')), '', 'e5 is a quiet target');
  const r = P.click(snap, dec, 'w', sq('d5')); eq(JSON.stringify(r.m), JSON.stringify([28, 35]), 'click on the capture yields the move');
  eq(P.targets(snap, dec, 'b').size, 0, 'black picker has no targets on white\'s turn');
  A.move(t2, 'a', r.m);
  const cap = M.capturedOf('chess', M.piecesOf('chess', A.snapshot(t2).pos)); eq(cap.b.join(''), 'p', 'captured black pawn listed'); eq(cap.w.length, 0, 'white lost nothing');
}
console.log(fails ? `${fails} FAILED` : 'chess_capture: all ok');
process.exit(fails ? 1 : 0);
