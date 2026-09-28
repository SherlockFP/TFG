// Player TRADING - the host-authoritative half (no DOM / three.js: node-tested with a mock game in tools/harness/trade.test.mjs).
//
// createTradeHost(game, { now }) -> { request, respond, offer, lock, accept, cancelBy, ack, tick, onLeave, onPhase, sessionOf, dispose }
// Wired by game/trade.js:  request -> 'trreq'  respond -> 'tracc'  offer -> 'troff'  lock -> 'trlock'  accept -> 'trok'
//                          cancelBy -> 'trcx'  ack -> 'trca'   (client -> host requests, all handled through net.handle)
//   host -> the two players:  trs {tid, a, b, st, v, cd, p:{peer:{i, c, l, k, q}}}  (state snapshot after every change)
//                             trm {k:'req'|'sent'|'open'|'cancel'|'done'|'err', ...}   (notices)
//                             trc {tid, n}   (Clout debit request to the giver's client)
//
// TRUST MODEL: items are host state, so the swap is exact: the host re-validates that every offered item is still held by its
// offerer (and tradable), plans the whole move (planTrade: bag spots, hotbar, repacking when a bag leaves), and only then
// broadcasts all 'held' events in ONE synchronous pass - a disconnect / death / sale before that point cancels the trade with
// nothing moved. Clout lives in each player's own profile (client side, like every reward): the host asks the giver's client to
// debit it ('trc' -> 'trca'), and only after every debit is confirmed does it move the items and pay the receiver through the
// regular reward path ('xp' with coin, reason 'Trade: ...' which profile.js exempts from the Clout multiplier). If a debit is
// refused / times out, confirmed debits are refunded and the trade is cancelled. A cheating client can already mint its own
// Clout (the profile is local); trading does not widen that: it can only hurt the player who lies.
import { TradeSession, RULES, validateOffer, planTrade, cleanIds, cleanClout } from './trade_core.js';

const PHASES_OK = new Set(['orbit', 'moon', 'company']);
const now0 = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function createTradeHost(game, opts = {}) {
  const clock = opts.now || now0;
  const sessions = new Map();     // tid -> TradeSession
  const byPeer = new Map();       // peer -> live session
  const lastReq = new Map();      // peer -> time of the last request (spam guard)
  let seq = 0, accT = 0, disposed = false;

  const net = () => game.net;
  const send = (peer, t, d) => { if (peer && net()) net().sendTo(peer, t, d); };
  const both = (s, t, d) => { send(s.a, t, d); send(s.b, t, d); };
  const err = (peer, msg) => send(peer, 'trm', { k: 'err', msg });
  const sessionOf = (peer) => byPeer.get(peer) || null;
  const present = (peer) => !!net()?.players?.has(peer);
  const info = (peer) => game.aiPlayerById?.(peer) || null;
  const dist = (a, b) => { const A = info(a)?.pos, B = info(b)?.pos; return A && B ? A.distanceTo(B) : Infinity; };

  /** everything `peer` holds, as inventory_core entries */
  function entriesOf(peer) {
    const out = [];
    for (const it of game.items.all()) if (it.holder === peer) out.push({ id: it.id, def: it.def, inv: it.inv || null, tier: it.rarity ? it.rarity() : (it.tier || 'common'), it, value: it.value || 0 });
    return out;
  }
  const pushState = (s) => both(s, 'trs', s.snapshot(clock()));

  function end(s) {
    sessions.delete(s.id);
    if (byPeer.get(s.a) === s) byPeer.delete(s.a);
    if (byPeer.get(s.b) === s) byPeer.delete(s.b);
  }
  function refund(s) {
    if (!s.debit) return;
    for (const [p, st] of Object.entries(s.debit)) if (st === 'ok') net().broadcast('xp', { to: p, xp: 0, coin: s.offer[p].clout, reason: 'Trade: Clout refund' });
    s.debit = null;
  }
  function cancel(s, why, by = null) {
    if (!s || !s.live) return false;
    refund(s);
    s.cancel(why, by);
    both(s, 'trm', { k: 'cancel', tid: s.id, why, by });
    end(s);
    return true;
  }

  // ------------------------------------------------------------------ requests
  function request(from, d) {
    if (disposed || !d || typeof d.to !== 'string') return;
    const to = d.to, t = clock();
    if (t - (lastReq.get(from) || -9) < 1.5) { err(from, 'Slow down.'); return; }
    lastReq.set(from, t);
    if (to === from || !present(from) || !present(to)) { err(from, 'Nobody there to trade with.'); return; }
    if (!PHASES_OK.has(game.run?.phase)) { err(from, 'Not now.'); return; }
    if (sessionOf(from) || sessionOf(to)) { err(from, sessionOf(from) ? 'You are already trading.' : 'They are busy trading.'); return; }
    if (info(from)?.dead || info(to)?.dead) { err(from, 'Not while someone is dead.'); return; }
    if (dist(from, to) > RULES.startDist) { err(from, 'They are too far away.'); return; }
    const s = new TradeSession('t' + (++seq), from, to, t);
    s.setMeta(from, d);
    sessions.set(s.id, s); byPeer.set(from, s); byPeer.set(to, s);
    send(to, 'trm', { k: 'req', tid: s.id, from, ttl: RULES.requestTtl });
    send(from, 'trm', { k: 'sent', tid: s.id, to, ttl: RULES.requestTtl });
  }
  function respond(from, d) {
    const s = sessionOf(from);
    if (!s || !d || d.tid !== s.id || s.state !== 'pending' || from !== s.b) return;
    s.setMeta(from, d);
    if (!present(s.a) || info(s.a)?.dead || info(s.b)?.dead || dist(s.a, s.b) > RULES.startDist + 1) { cancel(s, d.ok ? 'far' : 'declined', from); return; }
    if (!s.respond(from, !!d.ok, clock())) return;
    if (s.state === 'cancelled') { both(s, 'trm', { k: 'cancel', tid: s.id, why: 'declined', by: from }); end(s); return; }
    both(s, 'trm', { k: 'open', tid: s.id, a: s.a, b: s.b });
    pushState(s);
  }

  // ------------------------------------------------------------------ editing
  function mineOf(from, d) {
    const s = sessionOf(from);
    if (!s || !d || d.tid !== s.id || !s.editable) return null;
    s.setMeta(from, d);
    return s;
  }
  function offer(from, d) {
    const s = mineOf(from, d);
    if (!s) return;
    const entries = entriesOf(from);
    let ids = cleanIds(d.items);
    if (ids.length > RULES.maxItems) { err(from, 'Too many items.'); ids = ids.slice(0, RULES.maxItems); }
    const ok = [];
    for (const id of ids) {
      const v = validateOffer(entries, [id]);
      if (v.ok) ok.push(id); else err(from, v.why);
    }
    s.setOffer(from, ok, cleanClout(d.clout), clock(), d.q);
    pushState(s);
  }
  function lock(from, d) {
    const s = mineOf(from, d);
    if (!s) return;
    if (d.on && !validateOffer(entriesOf(from), s.offer[from].items).ok) { pruneVanished(s); pushState(s); return; }
    s.setLock(from, !!d.on, clock());
    pushState(s);
  }
  function accept(from, d) {
    const s = mineOf(from, d);
    if (!s) return;
    if (!s.accept(from, clock())) { err(from, 'Both sides must lock their offers first.'); pushState(s); return; }
    pushState(s);
  }
  function cancelBy(from, d) {
    const s = sessionOf(from);
    if (!s || (d?.tid && d.tid !== s.id)) return;
    cancel(s, s.state === 'pending' && from === s.b ? 'declined' : 'cancelled', from);
  }

  /** drop offered items that left their offerer (sold, dropped, stolen, died): resets locks; returns true when changed */
  function pruneVanished(s) {
    let changed = false;
    for (const p of [s.a, s.b]) {
      const held = new Map(entriesOf(p).map((e) => [e.id, e]));
      changed = s.prune(p, (id) => { const e = held.get(id); return !!e && validateOffer([e], [id]).ok; }) || changed;
    }
    return changed;
  }

  // ------------------------------------------------------------------ execution
  function computePlan(s) {
    const side = (p) => ({ peer: p, entries: entriesOf(p), give: s.offer[p].items, bx: s.meta[p].bx, hs: s.meta[p].hs });
    return planTrade([side(s.a), side(s.b)]);
  }
  function execute(s) {
    if (s.state !== 'countdown') return;
    pruneVanished(s);
    if (s.state !== 'countdown') { pushState(s); return; }   // an offered item vanished: back to editing
    const plan = computePlan(s);
    if (!plan.ok) { cancel(s, plan.why, plan.who); return; }
    s.state = 'exec';
    s.debit = {};
    s.debitDeadline = clock() + RULES.debitTtl;
    for (const p of [s.a, s.b]) if (s.offer[p].clout > 0) s.debit[p] = 'wait';
    for (const p of Object.keys(s.debit)) send(p, 'trc', { tid: s.id, n: s.offer[p].clout });
    finishIfReady(s);
  }
  function ack(from, d) {
    const s = sessionOf(from);
    if (!s || s.state !== 'exec' || !d || d.tid !== s.id || !s.debit || s.debit[from] !== 'wait') return;
    if (!d.ok) { cancel(s, 'noclout', from); return; }
    s.debit[from] = 'ok';
    finishIfReady(s);
  }
  function finishIfReady(s) {
    if (s.state !== 'exec' || !s.debit || Object.values(s.debit).some((v) => v !== 'ok')) return;
    const plan = computePlan(s);   // re-plan: the debit round trip is a window in which somebody could have dropped / sold something
    if (!plan.ok) { cancel(s, plan.why, plan.who); return; }
    apply(s, plan);
  }
  const brief = (it) => ({ id: it.id, ty: it.type, tr: it.tier || undefined, pl: it.plus || undefined, v: it.value || undefined });
  function apply(s, plan) {
    const n = net();
    const gave = { [s.a]: [], [s.b]: [] }, got = { [s.a]: [], [s.b]: [] };
    for (const tr of plan.transfers) {
      const it = game.items.get(tr.id);
      if (!it) continue;
      if (it.on) { it.on = false; n.broadcast('itst', { id: it.id, on: false }); }
      it.lastHolder = tr.to;
      gave[tr.from].push(brief(it)); got[tr.to].push(brief(it));
      n.broadcast('it', { e: 'held', id: it.id, h: tr.to, iv: tr.inv || undefined });
    }
    for (const [peer, mv] of Object.entries(plan.repack || {})) if (mv.length) n.broadcast('it', { e: 'inv', h: peer, mv });
    for (const p of [s.a, s.b]) {
      const c = s.offer[s.other(p)].clout;
      if (c > 0) n.broadcast('xp', { to: p, xp: 0, coin: c, reason: 'Trade: Clout' });
    }
    s.state = 'done'; s.debit = null; s.ver++;
    for (const p of [s.a, s.b]) send(p, 'trm', { k: 'done', tid: s.id, with: s.other(p), gave: gave[p], got: got[p], cg: s.offer[p].clout, cr: s.offer[s.other(p)].clout });
    end(s);
    opts.onDone?.(s, { gave, got });
  }

  // ------------------------------------------------------------------ housekeeping
  function tick(dt) {
    if (disposed || !sessions.size) return;
    accT += dt;
    if (accT < 0.2) return;
    accT = 0;
    const t = clock();
    for (const s of [...sessions.values()]) {
      if (!s.live) { end(s); continue; }
      let bad = null;
      for (const p of [s.a, s.b]) {
        if (!present(p)) { bad = ['left', p]; break; }
        if (info(p)?.dead) { bad = ['died', p]; break; }
      }
      if (!bad && s.state !== 'pending' && dist(s.a, s.b) > RULES.keepDist) bad = ['far', null];
      if (bad) { cancel(s, bad[0], bad[1]); continue; }
      if (s.state === 'exec') {
        if (t > s.debitDeadline) { const who = Object.keys(s.debit || {}).find((p) => s.debit[p] === 'wait'); cancel(s, 'noclout', who || null); }
        continue;
      }
      if (s.editable && pruneVanished(s)) pushState(s);
      const r = s.tick(t);
      if (r === 'expired') { both(s, 'trm', { k: 'cancel', tid: s.id, why: s.result?.why || 'expired', by: null }); end(s); }
      else if (r === 'execute') execute(s);
    }
  }
  function onLeave(peer) { const s = sessionOf(peer); if (s) cancel(s, 'left', peer); }
  function onPhase() { for (const s of [...sessions.values()]) cancel(s, 'phase'); }
  function dispose() { disposed = true; for (const s of [...sessions.values()]) cancel(s, 'error'); sessions.clear(); byPeer.clear(); }

  return { sessions, request, respond, offer, lock, accept, cancelBy, ack, tick, onLeave, onPhase, sessionOf, dispose, computePlan };
}
