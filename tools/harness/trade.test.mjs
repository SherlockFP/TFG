// Node test for player trading (no browser):  node tools/harness/trade.test.mjs
//  - trade_core: what can be traded, offer validation, the swap planner (bag spots / hotbar / repack / no room),
//    the TradeSession lock -> accept -> countdown state machine (reset on change, cancel paths), comparison
//  - trade_host with a mock game: full happy path (items + Clout debit handshake), death / disconnect / distance / phase /
//    vanished item / no room / refused Clout / debit timeout cancels (nothing moves, refunds), invariants (no dupes, no loss)
//  - iconatlas: every registered item resolves to a glyph shape (no blank icon), audit report shape
import * as C from '../../src/game/trade_core.js';
import { createTradeHost } from '../../src/game/trade_host.js';
import { glyphSpec, GLYPH_SHAPES, auditItems } from '../../src/ui/iconatlas.js';
import { ITEMS } from '../../src/game/items.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const E = (id, ty, inv = null, extra = {}) => ({ id, def: ITEMS[ty], inv, tier: 'common', value: 10, it: { id, type: ty, def: ITEMS[ty], ...extra }, ...extra });

// ------------------------------------------------------------------ what can be traded
ok(C.tradeBlock(E('a', 'duck')) === null && C.tradeBlock(E('a', 'pipe')) === null, 'plain scrap and weapons are tradable');
ok(C.tradeBlock(E('a', 'duck', null, { soulbound: 'pid' })), 'soulbound is blocked');
ok(C.tradeBlock(E('a', 'body')), 'bodies are blocked');
ok(C.tradeBlock(E('a', 'vase')), 'big physics items are blocked');
ok(C.tradeBlock(E('a', 'chainletter')), 'cursed items are blocked');
ok(C.tradeBlock({ id: 'x', def: null }) === 'Unknown item.', 'unknown item blocked');
ok(C.validateOffer([E('a', 'duck')], ['a']).ok, 'offer of a held item is valid');
ok(!C.validateOffer([E('a', 'duck')], ['zz']).ok, 'offer of an item the sender does not hold is rejected');
ok(!C.validateOffer([E('a', 'duck')], Array.from({ length: 10 }, (_, i) => 'i' + i)).ok, 'more than 9 items rejected');
ok(C.cleanIds(['a', 'a', 5, 'b']).length === 2, 'cleanIds dedupes and drops non-strings');

// ------------------------------------------------------------------ planner
const sideOf = (peer, entries, give, bx = 0, hs = 4) => ({ peer, entries, give, bx, hs });
{
  const A = [E('a1', 'duck', { k: 'bag', x: 0, y: 0 }), E('a2', 'pipe', null)];
  const B = [E('b1', 'ring', { k: 'bag', x: 0, y: 0 })];
  const p = C.planTrade([sideOf('A', A, ['a1', 'a2']), sideOf('B', B, ['b1'])]);
  ok(p.ok && p.transfers.length === 3, 'simple swap plans 3 transfers');
  ok(p.transfers.filter((x) => x.to === 'B').length === 2 && p.transfers.filter((x) => x.to === 'A').length === 1, 'items land with the right receiver');
  ok(p.transfers.every((x) => !x.inv || x.inv.k === 'bag'), 'received items go to the bag first');
  const dup = C.planTrade([sideOf('A', A, ['a1']), sideOf('B', A, ['a1'])]);
  ok(!dup.ok, 'the same item on both sides is rejected');
  ok(!C.planTrade([sideOf('A', A, ['nope']), sideOf('B', B, [])]).ok, 'offering an item the holder lacks fails the plan');
  ok(!C.planTrade([sideOf('A', [E('s', 'duck', null, { soulbound: 'x' })], ['s']), sideOf('B', B, [])]).ok, 'a soulbound item fails the plan');
}
{
  // receiver with a full 4x2 pocket grid and a full hotbar cannot take one more item
  const full = [];
  for (let i = 0; i < 8; i++) full.push(E('f' + i, 'duck', { k: 'bag', x: i % 4, y: Math.floor(i / 4) }));
  for (let i = 0; i < 4; i++) full.push(E('h' + i, 'duck', null));
  const A = [E('a1', 'ring', null)];
  const p = C.planTrade([sideOf('A', A, ['a1']), sideOf('B', full, [])]);
  ok(!p.ok && p.why === 'noroom' && p.who === 'B', 'no room -> plan fails naming the receiver');
  const p2 = C.planTrade([sideOf('A', A, ['a1']), sideOf('B', full, ['f0'])]);
  ok(p2.ok, 'giving one item back frees the room (simultaneous swap)');
  const hot = [E('h0', 'duck', null), E('h1', 'duck', null)];
  const p3 = C.planTrade([sideOf('A', [E('a1', 'ring', null)], ['a1']), sideOf('B', full.filter((e) => e.inv), [])]);
  ok(p3.ok && p3.transfers[0].inv === null, 'a full bag falls back to a free hotbar slot');
  void hot;
}
{
  // the equipped bag leaves: the rest of the bag repacks into the pockets, or the trade is refused
  const A = [E('bg', 'bag_fieldpack', { k: 'eq', s: 'bag' }), E('a1', 'duck', { k: 'bag', x: 5, y: 3 })];
  const B = [E('b1', 'ring', null)];
  const p = C.planTrade([sideOf('A', A, ['bg']), sideOf('B', B, ['b1'])]);
  ok(p.ok && p.repack.A.length === 1 && p.repack.A[0][1].x < 4, 'giving away the bag repacks the remaining items into the pockets');
  const many = [E('bg', 'bag_fieldpack', { k: 'eq', s: 'bag' })];
  for (let i = 0; i < 12; i++) many.push(E('m' + i, 'duck', { k: 'bag', x: i % 6, y: Math.floor(i / 6) }));
  ok(!C.planTrade([sideOf('A', many, ['bg']), sideOf('B', B, ['b1'])]).ok, 'a bag with too much inside cannot be given away');
}

// ------------------------------------------------------------------ state machine
{
  const s = new C.TradeSession('t1', 'A', 'B', 0);
  ok(s.state === 'pending' && !s.editable, 'starts pending');
  ok(!s.respond('A', true, 1), 'only the target can answer');
  ok(s.respond('B', true, 1) && s.state === 'open', 'accepting opens the trade');
  ok(s.setOffer('A', ['x', 'y'], 5, 2, 1) === true && s.offer.A.items.length === 2, 'offer set');
  ok(s.setOffer('A', ['y', 'x'], 5, 2, 2) === 'same', 'same offer (any order) changes nothing');
  ok(!s.accept('A', 3), 'cannot accept before both lock');
  s.setLock('A', true, 3);
  ok(!s.accept('A', 3) && s.canAccept() === false, 'one lock is not enough');
  s.setLock('B', true, 3);
  ok(s.canAccept() && s.accept('A', 4) && s.state === 'open', 'both locked: first accept waits');
  s.setOffer('B', ['z'], 0, 4.5);
  ok(!s.locked.A && !s.locked.B && !s.accepted.A, 'ANY offer change resets every lock and accept');
  s.setLock('A', true, 5); s.setLock('B', true, 5); s.accept('A', 6); s.accept('B', 6);
  ok(s.state === 'countdown' && Math.abs(s.countdownEnd - 9) < 1e-9, 'both accepted -> 3 s countdown');
  ok(s.tick(7) === null && s.tick(9.01) === 'execute', 'tick reports execute when the countdown is over');
  s.setOffer('A', ['x'], 5, 7);
  ok(s.state === 'open' && !s.accepted.B, 'a change during the countdown aborts it');
  s.setLock('A', true, 8); s.setLock('B', true, 8); s.accept('A', 8); s.setLock('A', false, 8.5);
  ok(!s.accepted.A && !s.locked.B, 'unlocking resets the other side too');
  ok(s.cancel('cancelled', 'B') && s.state === 'cancelled' && !s.cancel('x'), 'cancel works once');
  ok(!s.setOffer('A', [], 0, 9) && !s.setLock('A', true, 9), 'no edits after cancel');
  const p2 = new C.TradeSession('t2', 'A', 'B', 0);
  ok(p2.tick(9) === null && p2.tick(10.1) === 'expired' && p2.state === 'cancelled' && p2.result.why === 'expired', 'unanswered request expires after 10 s');
  const p3 = new C.TradeSession('t3', 'A', 'B', 0); p3.respond('B', false, 1);
  ok(p3.state === 'cancelled' && p3.result.why === 'declined', 'declining cancels');
  const snap = s.snapshot(0);
  ok(snap.tid === 't1' && snap.p.A && snap.p.B && Array.isArray(snap.p.A.i), 'snapshot has both sides');
}
{
  const gear = (id, ty, tier, plus = 0) => ({ id, def: ITEMS[ty], tier, plus, value: 0 });
  const r = C.compareItems(gear('n', 'arm_kevlar', 'legendary'), gear('o', 'arm_hoodie', 'common'));
  const armor = r.find((x) => x.key === 'armor');
  ok(armor && armor.delta > 0 && armor.better === 'up', 'kevlar (legendary) beats a hoodie on damage reduction');
  const w = C.compareItems(gear('n', 'machete', 'common', 5), gear('o', 'pipe', 'common'));
  ok(w.find((x) => x.key === 'dmg').better === 'up' && w.find((x) => x.key === 'cd').better === 'up', 'machete +5 is stronger and faster than a pipe (lower cooldown = better)');
  const mine = [E('w1', 'pipe', null), E('w2', 'machete', null), E('ar', 'arm_riot', { k: 'eq', s: 'armor' })];
  ok(C.comparableFor({ id: 'z', def: ITEMS.arm_kevlar }, mine)?.id === 'ar', 'armour is compared with the worn armour');
  ok(C.comparableFor({ id: 'z', def: ITEMS.shovel }, mine)?.id === 'w2', 'a weapon is compared with your best weapon');
}

// ------------------------------------------------------------------ host with a mock game
function mockGame() {
  const g = { isHost: true, selfId: 'A', time: 0, run: { phase: 'moon' }, sent: [], coins: { A: 1000, B: 1000 }, xp: [], later() {} };
  g.items = new Map();
  const itemsApi = { all: () => [...g.items.values()], get: (id) => g.items.get(id) };
  g.itemsApi = itemsApi;
  g.pos = { A: 0, B: 2 }; g.dead = {};
  const P = (x) => ({ x, distanceTo(o) { return Math.abs(o.x - this.x); } });
  g.aiPlayerById = (id) => (g.pos[id] === undefined ? null : { id, pos: P(g.pos[id]), dead: !!g.dead[id] });
  const apply = (t, d) => {
    if (t === 'it' && d.e === 'held') { const it = g.items.get(d.id); it.holder = d.h; it.inv = d.iv || null; }
    if (t === 'it' && d.e === 'inv') for (const [id, iv] of d.mv) { const it = g.items.get(id); if (it && it.holder === d.h) it.inv = iv || null; }
    if (t === 'xp') { g.xp.push(d); g.coins[d.to] += d.coin || 0; }
  };
  g.net = {
    players: new Map([['A', {}], ['B', {}]]),
    sendTo(peer, t, d) { g.sent.push({ peer, t, d }); },
    broadcast(t, d) { g.sent.push({ peer: '*', t, d }); apply(t, d); },
  };
  g.playerName = (id) => id;
  g.give = (id, ty, holder, inv = null, extra = {}) => { const it = { id, type: ty, def: ITEMS[ty], holder, inv, tier: null, value: 20, plus: 0, on: false, soulbound: null, rarity() { return this.tier || 'common'; }, ...extra }; g.items.set(id, it); return it; };
  g.items.all = itemsApi.all; g.items.get = (id) => Map.prototype.get.call(g.items, id);
  g.msgs = (peer, k) => g.sent.filter((m) => m.t === 'trm' && (!peer || m.peer === peer) && (!k || m.d.k === k));
  return g;
}
function setup(customize) {
  const g = mockGame();
  let now = 0;
  const host = createTradeHost(g, { now: () => now });
  g.give('a1', 'pipe', 'A', null); g.give('a2', 'duck', 'A', { k: 'bag', x: 0, y: 0 }); g.give('a3', 'arm_riot', 'A', { k: 'eq', s: 'armor' });
  g.give('b1', 'ring', 'B', { k: 'bag', x: 0, y: 0 }); g.give('b2', 'machete', 'B', null);
  customize?.(g);
  return { g, host, adv: (s) => { now += s; host.tick(s); }, at: () => now, setNow: (v) => { now = v; } };
}
const meta = { bx: 0, hs: 4 };
function openTrade(T) {
  T.host.request('A', { to: 'B', ...meta });
  const req = T.g.msgs('B', 'req')[0];
  T.host.respond('B', { tid: req.d.tid, ok: true, ...meta });
  return req.d.tid;
}
const holders = (g) => Object.fromEntries([...g.items.values()].map((i) => [i.id, i.holder]));
const lockBoth = (T, tid) => { T.host.lock('A', { tid, on: true, ...meta }); T.host.lock('B', { tid, on: true, ...meta }); };
const acceptBoth = (T, tid) => { T.host.accept('A', { tid, ...meta }); T.host.accept('B', { tid, ...meta }); };
const countItems = (g) => g.items.size;

{
  const T = setup();
  const tid = openTrade(T);
  ok(T.g.msgs('A', 'sent').length === 1 && T.g.msgs('B', 'req').length === 1 && T.g.msgs(null, 'open').length === 2, 'request -> popup for B, waiting notice for A, both get "open"');
  ok(T.g.sent.some((m) => m.t === 'trs' && m.d.st === 'open'), 'snapshot sent when the trade opens');
  T.host.offer('A', { tid, items: ['a1', 'a2', 'a3'], clout: 100, q: 1, ...meta });
  T.host.offer('B', { tid, items: ['b1', 'b2'], clout: 40, q: 1, ...meta });
  ok(T.host.sessionOf('A').offer.A.items.length === 3 && T.host.sessionOf('B').offer.B.clout === 40, 'offers recorded');
  T.host.accept('A', { tid, ...meta });
  ok(!T.host.sessionOf('A').accepted.A, 'accept before both locked is refused');
  lockBoth(T, tid);
  T.host.offer('B', { tid, items: ['b1', 'b2'], clout: 45, q: 2, ...meta });
  ok(!T.host.sessionOf('A').locked.A && !T.host.sessionOf('A').locked.B, 'changing an offer resets both locks');
  lockBoth(T, tid); acceptBoth(T, tid);
  ok(T.host.sessionOf('A').state === 'countdown', 'both accepted -> countdown');
  T.adv(1.5);
  ok(holders(T.g).a1 === 'A' && T.g.sent.filter((m) => m.t === 'trc').length === 0, 'nothing moves during the countdown');
  T.adv(1.6);
  const debits = T.g.sent.filter((m) => m.t === 'trc');
  ok(debits.length === 2 && debits.find((m) => m.peer === 'A').d.n === 100 && debits.find((m) => m.peer === 'B').d.n === 45, 'after the countdown the host asks both givers to debit their Clout');
  ok(holders(T.g).a1 === 'A', 'items still untouched while the debits are pending');
  T.host.ack('A', { tid, ok: true });
  ok(holders(T.g).a1 === 'A', 'still waiting for the second debit');
  T.host.ack('B', { tid, ok: true });
  const h = holders(T.g);
  ok(h.a1 === 'B' && h.a2 === 'B' && h.a3 === 'B' && h.b1 === 'A' && h.b2 === 'A', 'swap executed: every offered item changed hands');
  ok(countItems(T.g) === 5 && new Set(Object.keys(h)).size === 5, 'no item duplicated or lost');
  const credit = T.g.xp.map((x) => `${x.to}:${x.coin}:${x.reason}`).sort();
  ok(credit.length === 2 && credit[0] === 'A:45:Trade: Clout' && credit[1] === 'B:100:Trade: Clout', 'Clout is paid through the reward path with the flat "Trade" reason');
  const done = T.g.msgs('A', 'done')[0];
  ok(done && done.d.gave.length === 3 && done.d.got.length === 2 && done.d.cg === 100 && done.d.cr === 45, 'TRADE COMPLETE summary carries both lists + Clout');
  ok(!T.host.sessionOf('A') && !T.host.sessionOf('B'), 'session cleaned up');
  ok(T.g.items.get('a3').inv === null || T.g.items.get('a3').inv.k === 'bag', 'the received armour lands in the bag / hotbar, never auto-equipped');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 0, q: 1, ...meta }); T.host.offer('B', { tid, items: ['b2'], clout: 0, q: 1, ...meta });
  lockBoth(T, tid); acceptBoth(T, tid);
  T.g.dead.B = true; T.adv(0.3);
  ok(!T.host.sessionOf('A') && T.g.msgs('A', 'cancel')[0].d.why === 'died' && holders(T.g).a1 === 'A' && holders(T.g).b2 === 'B', 'a death cancels the trade, nothing moves');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 0, q: 1, ...meta });
  T.g.net.players.delete('B'); T.host.onLeave('B');
  ok(!T.host.sessionOf('A') && T.g.msgs('A', 'cancel')[0].d.why === 'left', 'a disconnect cancels the trade');
}
{
  const T = setup(); const tid = openTrade(T);
  T.g.pos.B = 9; T.adv(0.3);
  ok(T.g.msgs('A', 'cancel')[0]?.d.why === 'far', 'walking more than 6.5 m apart cancels');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.onPhase();
  ok(T.g.msgs('A', 'cancel')[0]?.d.why === 'phase', 'a phase change cancels');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 0, q: 1, ...meta }); T.host.offer('B', { tid, items: ['b2'], clout: 0, q: 1, ...meta });
  lockBoth(T, tid);
  T.g.items.delete('a1'); T.adv(0.3);   // sold / dropped after locking
  const s = T.host.sessionOf('A');
  ok(s && s.offer.A.items.length === 0 && !s.locked.A && !s.locked.B, 'an offered item that vanishes is removed and the locks reset');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['b1'], clout: 0, q: 1, ...meta });
  ok(T.host.sessionOf('A').offer.A.items.length === 0 && T.g.sent.some((m) => m.t === 'trm' && m.d.k === 'err'), 'offering somebody else\'s item is refused');
  T.host.offer('A', { tid, items: ['a1', 'a1', 'a1'], clout: 0, q: 2, ...meta });
  ok(T.host.sessionOf('A').offer.A.items.length === 1, 'duplicate ids collapse');
}
{
  const T = setup((g) => { for (let i = 0; i < 8; i++) g.give('f' + i, 'duck', 'B', { k: 'bag', x: i % 4, y: Math.floor(i / 4) }); for (let i = 0; i < 2; i++) g.give('h' + i, 'duck', 'B', null); });
  const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1', 'a2'], clout: 0, q: 1, ...meta });   // B has 10/8 cells... bag full, 2 hotbar of 4 used + b2 -> 3
  T.host.offer('B', { tid, items: [], clout: 0, q: 1, ...meta });
  lockBoth(T, tid); acceptBoth(T, tid);
  T.adv(3.2);
  const cancelled = T.g.msgs('A', 'cancel')[0];
  const done = T.g.msgs('A', 'done')[0];
  ok(!!(cancelled || done), 'trade with a nearly-full receiver resolves (cancel or done)');
  if (cancelled) ok(cancelled.d.why === 'noroom' && holders(T.g).a1 === 'A', 'no room: cancelled, nothing moved');
  else ok(holders(T.g).a1 === 'B' && T.g.items.get('a1').inv === null, 'no room in the bag but hotbar free: items went to the hotbar');
}
{
  const T = setup((g) => { for (let i = 0; i < 8; i++) g.give('f' + i, 'duck', 'B', { k: 'bag', x: i % 4, y: Math.floor(i / 4) }); for (let i = 0; i < 4; i++) g.give('h' + i, 'duck', 'B', null); });
  const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 0, q: 1, ...meta });
  lockBoth(T, tid); acceptBoth(T, tid); T.adv(3.2);
  ok(T.g.msgs('A', 'cancel')[0]?.d.why === 'noroom' && holders(T.g).a1 === 'A' && !T.g.sent.some((m) => m.t === 'it' && m.d.e === 'held'), 'full bag + full hotbar: cancelled with NOTHING moved');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 50, q: 1, ...meta }); T.host.offer('B', { tid, items: ['b2'], clout: 70, q: 1, ...meta });
  lockBoth(T, tid); acceptBoth(T, tid); T.adv(3.2);
  T.host.ack('A', { tid, ok: true });
  T.host.ack('B', { tid, ok: false });
  ok(T.g.msgs('A', 'cancel')[0]?.d.why === 'noclout' && T.g.msgs('A', 'cancel')[0].d.by === 'B', 'a refused Clout debit cancels the trade');
  ok(holders(T.g).a1 === 'A' && holders(T.g).b2 === 'B', 'no item moved');
  ok(T.g.xp.length === 1 && T.g.xp[0].to === 'A' && T.g.xp[0].coin === 50, 'the confirmed debit is refunded');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 50, q: 1, ...meta });
  lockBoth(T, tid); acceptBoth(T, tid); T.adv(3.2);
  T.adv(3.5); T.adv(0.3);
  ok(T.g.msgs('A', 'cancel')[0]?.d.why === 'noclout' && holders(T.g).a1 === 'A', 'a debit that never gets confirmed times out and cancels');
}
{
  const T = setup(); const tid = openTrade(T);
  T.host.offer('A', { tid, items: ['a1'], clout: 0, q: 1, ...meta });
  T.host.cancelBy('B', { tid });
  ok(T.g.msgs('A', 'cancel')[0]?.d.why === 'cancelled' && T.g.msgs('A', 'cancel')[0].d.by === 'B', 'ESC / cancel by either side ends the trade');
}
{
  const T = setup();
  T.host.request('A', { to: 'B', ...meta });
  T.setNow(5); T.host.tick(0.3);
  ok(T.host.sessionOf('A')?.state === 'pending', 'a pending request survives 5 s');
  T.setNow(10.4); T.host.tick(0.3);
  ok(!T.host.sessionOf('A') && T.g.msgs('B', 'cancel')[0]?.d.why === 'expired', 'an unanswered request expires after 10 s');
  T.setNow(20);
  T.host.request('A', { to: 'B', ...meta });
  const tid = T.g.msgs('B', 'req').pop().d.tid;
  T.host.respond('B', { tid, ok: false, ...meta });
  ok(!T.host.sessionOf('A') && T.g.msgs('A', 'cancel').pop().d.why === 'declined', 'declining ends the request');
}
{
  const T = setup(); T.g.pos.B = 12;
  T.host.request('A', { to: 'B', ...meta });
  ok(!T.host.sessionOf('A') && T.g.msgs('A', 'err').length === 1, 'a request from too far away is refused');
  const T2 = setup(); T2.g.run.phase = 'landing';
  T2.host.request('A', { to: 'B', ...meta });
  ok(!T2.host.sessionOf('A'), 'no trading while the ship is landing / taking off');
  const T3 = setup(); T3.g.dead.B = true;
  T3.host.request('A', { to: 'B', ...meta });
  ok(!T3.host.sessionOf('A'), 'no trading with the dead');
  const T4 = setup(); openTrade(T4); T4.setNow(5);
  T4.g.players = null; T4.host.request('A', { to: 'B', ...meta });
  ok(T4.g.msgs('A', 'err').length === 1, 'a second request while trading is refused');
}

// ------------------------------------------------------------------ icons: never blank
{
  const bad = [];
  for (const [id, d] of Object.entries(ITEMS)) { const g = glyphSpec(d); if (!GLYPH_SHAPES.includes(g.shape) || !g.color || !g.tag) bad.push(id); }
  ok(bad.length === 0, `every registered item (${Object.keys(ITEMS).length}) has a glyph spec (shape, tier colour, tag)`);
  const shapes = new Set(Object.values(ITEMS).map((d) => glyphSpec(d).shape));
  ok(shapes.size >= 8, `glyphs vary by kind (${shapes.size} shapes across the base items)`);
  ok(glyphSpec({ id: 'x', kind: 'weapon', ranged: true }).shape === 'gun' && glyphSpec({ id: 'skillbook_x', kind: 'skillbook' }).shape === 'book' && glyphSpec({ id: 'shard_scrap', kind: 'component' }).shape === 'shard', 'ranged / skillbook / shard kinds map to their pictograms');
  ok(glyphSpec({ id: 'kit_turret', kind: 'tool' }).shape === 'kit' && glyphSpec({ id: 'acoustic_guitar', kind: 'scrap' }).shape === 'note', 'deployable kits and instruments get their own glyphs');
  const rep = auditItems({ a: { id: 'a', kind: 'tool', name: 'A' }, b: { id: 'b', kind: 'scrap', name: 'B' }, c: { id: 'c', kind: 'scrap', name: 'C' } },
    { model: (id) => (id === 'b' ? null : 'mod'), icon: (id) => (id === 'a' ? 'model' : id === 'b' ? 'glyph' : 'blank') });
  ok(rep.total === 3 && rep.noModel.length === 1 && rep.noModel[0].id === 'b' && rep.glyph.length === 1 && rep.blank.length === 1 && rep.model === 1 && rep.byKind.scrap.noModel === 1, 'auditItems reports items without a model / with glyph or blank icons');
}

if (fails) { console.error(fails + ' failed'); process.exit(1); } else console.log('all trade tests passed');
