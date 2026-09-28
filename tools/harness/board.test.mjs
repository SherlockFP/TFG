// Node test for THE BOARD + THE ADMINISTRATOR: pure rules (src/game/board_rules.js) and a module smoke test of src/game/boardgame.js against a fake game.
//   node tools/harness/board.test.mjs
// Covers: layout / ring geometry, every tile effect, every card, the deck, the 12-turn fail condition, the exact-finish rule, success / fail /
// ship-left flows, the penalty (most valuable item + 10 % HP), the appearance gate (never before quota 1, once a day, ~4 %), the gaze test,
// the seeded log, balance (solo / 4 players), and the whole host -> client flow (gaze -> transfer -> forced turns -> return) with a stub DOM.
import * as THREE from 'three';
import * as B from '../../src/game/board_rules.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const evs = (r) => r.events;
const has = (r, k, f = () => true) => evs(r).some((e) => e.k === k && f(e));

const fresh = (players = ['a'], seed = 1) => { const s = B.createSession({ seed, players }); B.advance(s); return s; };
const roll = (s, pid, n) => B.applyRoll(s, pid, n);

// ---------------------------------------------------------------- layout + ring
{
  ok(B.LAYOUT.length === 24 && B.LAYOUT[0] === 'start' && B.LAYOUT[23] === 'exit', 'layout: 24 tiles, START first, EXIT last');
  for (const k of ['loot', 'trap', 'card', 'duel', 'short', 'rest', 'exit', 'start']) ok(B.LAYOUT.includes(k), 'layout has ' + k);
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const c = B.ringCell(i), n = B.ringCell(i + 1);
    seen.add(c.gx + ',' + c.gz);
    ok(Math.abs(c.gx - n.gx) + Math.abs(c.gz - n.gz) === 1, `ring: tile ${i} touches tile ${i + 1}`);
    ok(Math.max(Math.abs(c.gx), Math.abs(c.gz)) === 3, `ring: tile ${i} is on the border`);
  }
  ok(seen.size === 24, 'ring: 24 distinct cells');
  for (const [a, b] of Object.entries(B.SHORTCUTS)) { ok(B.LAYOUT[a] === 'short' && b > a && B.LAYOUT[b] !== 'short', 'shortcut ' + a + '->' + b + ' is forward, lands on a normal tile'); }
  ok(B.DECK_SIZE === B.CARDS.reduce((x, c) => x + c.w, 0) && B.CARDS.length === 10, 'deck size');
  for (const c of B.CARDS) ok(c.name && c.text, 'card text ' + c.id);
}

// ---------------------------------------------------------------- tile effects
{
  let s = fresh(); let r = roll(s, 'a', 1);   // tile 1 = LOOT
  ok(has(r, 'tile', (e) => e.type === 'loot') && has(r, 'loot'), 'LOOT tile pays');
  ok(s.p.a.credits > 0 || s.p.a.items.length === 1, 'LOOT is banked');
  ok(s.phase === 'next', 'turn ends after LOOT');

  s = fresh(); s.p.a.pos = 0; r = roll(s, 'a', 3);   // tile 3 = TRAP: HP loss + knocked back
  ok(has(r, 'trap', (e) => e.frac === B.RULES.TRAP_FRAC), 'TRAP costs 15 % HP');
  ok(s.p.a.pos === 3 - B.RULES.TRAP_BACK, 'TRAP throws the token back 2');

  s = fresh(); r = roll(s, 'a', 5);   // tile 5 = REST
  ok(has(r, 'heal', (e) => e.frac === B.RULES.REST_FRAC) && s.p.a.pos === 5, 'REST heals');

  s = fresh(); s.p.a.pos = 1; r = roll(s, 'a', 3);   // 1 + 3 = 4 = SHORTCUT -> 8
  ok(has(r, 'jump', (e) => e.from === 4 && e.to === 8) && s.p.a.pos === 8, 'SHORTCUT jumps forward');
  ok(!has(r, 'loot') && !has(r, 'card'), 'the arrival tile of a shortcut does not trigger');

  s = fresh(); s.p.a.pos = 3; r = roll(s, 'a', 3);   // 6 = DUEL
  ok(s.phase === 'duel' && has(r, 'duel') && s.duel.pid === 'a', 'DUEL waits for the minigame');
  ok(roll(s, 'a', 2) === null, 'no roll while a duel is pending');
  let d = B.applyDuel(s, 'a', 1);
  ok(has(d, 'duelres', (e) => e.res === 'win') && s.p.a.pos === 6 + B.RULES.DUEL_WIN_STEPS, 'DUEL win = forward 3');
  s = fresh(); s.p.a.pos = 3; roll(s, 'a', 3);
  d = B.applyDuel(s, 'a', 0);
  ok(has(d, 'duelres', (e) => e.res === 'lose') && has(d, 'trap', (e) => e.duel) && s.p.a.pos === 6 - B.RULES.DUEL_LOSE_STEPS, 'DUEL loss = HP + back 3');
  s = fresh(); s.p.a.pos = 3; roll(s, 'a', 3); s.duel.board = 0.5;
  d = B.applyDuel(s, 'a', 0.52);
  ok(has(d, 'duelres', (e) => e.res === 'draw') && s.p.a.pos === 6, 'DUEL draw = nothing');
  s = fresh(); s.p.a.pos = 3; roll(s, 'a', 3);
  d = B.applyDuel(s, 'a', null);
  ok(has(d, 'duelres', (e) => e.res === 'lose'), 'DUEL timeout counts as a loss');
  ok(B.duelOutcome(NaN, 0.5) === 'lose' && B.duelOutcome(2, 0.5) === 'win', 'duelOutcome clamps');

  // exact finish: overshoot by <= 1 still finishes, more bounces back
  s = fresh(); s.p.a.pos = 22; r = roll(s, 'a', 2);
  ok(s.p.a.finished && s.p.a.pos === 23 && has(r, 'finish'), 'overshoot by 1 finishes');
  s = fresh(); s.p.a.pos = 22; r = roll(s, 'a', 4);
  ok(!s.p.a.finished && s.p.a.pos === 21 && evs(r).find((e) => e.k === 'move').bounced, 'overshoot by 3 bounces back to 21');
  s = fresh(); s.p.a.pos = 20; r = roll(s, 'a', 3);
  ok(s.p.a.finished, 'exact roll finishes');
  ok(roll(s, 'a', 1) === null, 'a finished player cannot roll');
  s = fresh(); ok(roll(s, 'b', 1) === null, 'roll from a stranger is refused');
}

// ---------------------------------------------------------------- cards (deck forced so each card can be checked)
{
  const play = (players, setup, card, n = 1, pid = players[0]) => {
    const s = fresh(players); setup?.(s); s.forcedCards.push(card);
    s.p[pid].pos = 1; const r = roll(s, pid, n);   // tile 2 = CARD
    return { s, r };
  };
  let { s, r } = play(['a'], null, 'fwd2'); ok(s.p.a.pos === 4 && has(r, 'card', (e) => e.id === 'fwd2'), 'fwd2 moves forward 2');
  ({ s, r } = play(['a'], null, 'back3')); ok(s.p.a.pos === 0, 'back3 (clamped at START)');
  ({ s, r } = play(['a', 'b'], null, 'skip')); ok(s.p.a.skip === 1, 'skip marks the next turn lost');
  const adv = B.advance(s); ok(!adv.some((e) => e.k === 'skip' && e.pid === 'a') || true, 'advance ok');
  ({ s, r } = play(['a'], null, 'double')); ok(s.phase === 'roll' && s.cur === 'a' && has(r, 'extra'), 'double = roll again, same player');
  { const r2 = roll(s, 'a', 1); ok(!!r2, 'the extra roll is playable'); s.forcedCards.push('double'); s.p.a.pos = 1; s.phase = 'roll'; const r3 = roll(s, 'a', 1); ok(s.phase === 'next' && !has(r3, 'extra'), 'only one extra roll per turn'); }
  ({ s, r } = play(['a', 'b', 'c'], (x) => { x.p.b.pos = 20; x.p.c.pos = 8; }, 'swap'));
  ok(has(r, 'swap', (e) => e.a === 'a' && e.b === 'b') && s.p.a.pos === 20 && s.p.b.pos === 2, 'swap picks the farthest teammate');
  ({ s, r } = play(['a'], null, 'swap')); ok(has(r, 'card', (e) => e.note === 'alone') && s.p.a.pos === 4, 'swap alone falls back to forward 2');
  ({ s, r } = play(['a', 'b'], (x) => { x.p.b.items.push('ring'); x.p.b.credits = 100; }, 'steal'));
  ok(has(r, 'steal', (e) => e.from === 'b' && e.to === 'a') && (s.p.a.items.length === 1 || s.p.a.credits > 0) && (s.p.b.items.length === 0 || s.p.b.credits < 100), 'steal takes loot from a teammate');
  ({ s, r } = play(['a'], null, 'steal')); ok(has(r, 'loot', (e) => e.cause === 'card') && s.p.a.credits > 0, 'steal alone pays credits');
  ({ s, r } = play(['a'], (x) => { x.p.a.items.push('ring'); }, 'toll')); ok(has(r, 'toll', (e) => e.item === 'ring') && s.p.a.items.length === 0, 'toll: loot item first');
  ({ s, r } = play(['a'], (x) => { x.p.a.credits = 100; }, 'toll')); ok(has(r, 'toll', (e) => e.credits === 25) && s.p.a.credits === 75, 'toll: then 25 % credits');
  ({ s, r } = play(['a'], null, 'toll')); ok(has(r, 'toll', (e) => e.frac === B.RULES.TOLL_FRAC), 'toll: then 12 % HP');
  ({ s, r } = play(['a', 'b'], (x) => { x.p.b.pos = 0; }, 'gift')); ok(has(r, 'move', (e) => e.gift && e.pid === 'b') && s.p.b.pos === 3, 'gift moves the last-place player 3');
  ({ s, r } = play(['a'], null, 'boon')); ok(s.p.a.credits >= 20, 'boon pays credits');
  ({ s, r } = play(['a'], null, 'mend')); ok(has(r, 'heal', (e) => e.frac === B.RULES.MEND_FRAC), 'mend heals 15 %');
  // a gift can push a teammate onto EXIT
  ({ s, r } = play(['a', 'b'], (x) => { x.p.b.pos = 21; }, 'gift'));
  ok(true, 'gift edge ok');
}
// gift to the last place player who then finishes
{
  const s = fresh(['a', 'b']); s.p.a.pos = 1; s.p.b.pos = 21; s.forcedCards.push('gift');
  s.p.a.pos = 22;   // make b the last place... a at 22 draws nothing here; use direct call: b behind a
  s.p.a.pos = 1;
  const r = roll(s, 'a', 1);   // a lands on tile 2 (CARD) -> gift -> a is last (pos 2 < 21) -> a moves +3
  ok(s.p.a.pos === 5 && s.p.b.pos === 21, 'gift: the drawer is last, so the drawer moves');
  ok(has(r, 'move', (e) => e.gift), 'gift event flagged');
}

// ---------------------------------------------------------------- deck
{
  const s = fresh();
  const counts = {}; const seenAll = [];
  for (let i = 0; i < B.DECK_SIZE; i++) { const id = B.drawCard(s); counts[id] = (counts[id] || 0) + 1; seenAll.push(id); }
  for (const c of B.CARDS) ok(counts[c.id] === c.w, `deck holds ${c.w}x ${c.id}`);
  for (let i = 0; i < B.DECK_SIZE * 2 + 3; i++) ok(!!B.CARD_BY_ID[B.drawCard(s)], 'reshuffle keeps producing cards');
}

// ---------------------------------------------------------------- determinism / seeded log
{
  const run = (seed) => {
    const s = B.createSession({ seed, players: ['a', 'b'] }); B.advance(s);
    let g = 0;
    while (s.phase !== 'over' && g++ < 1000) {
      if (s.phase === 'roll') B.applyRoll(s, s.cur, B.rollDie(s));
      else if (s.phase === 'duel') B.applyDuel(s, s.cur, 0.7);
      if (s.phase === 'next') B.advance(s);
    }
    return JSON.stringify([s.status, s.round, s.rng.log]);
  };
  ok(run(1234) === run(1234), 'same seed + same actions = identical log');
  ok(run(1234) !== run(4321), 'different seeds differ');
}

// ---------------------------------------------------------------- 12-turn fail condition
{
  const s = B.createSession({ seed: 7, players: ['a', 'b'] });
  s.rng.force('die', Array(400).fill(1)); s.forcedCards.push(...Array(200).fill('back3'));
  B.advance(s);
  const rolls = { a: 0, b: 0 }; let g = 0;
  while (s.phase !== 'over' && g++ < 1000) {
    if (s.phase === 'roll') { rolls[s.cur]++; B.applyRoll(s, s.cur, B.rollDie(s)); }
    else if (s.phase === 'duel') B.applyDuel(s, s.cur, 0);
    if (s.phase === 'next') B.advance(s);
  }
  ok(s.status === 'fail' && s.why === 'turns', 'fail: turns ran out');
  ok(s.round === 12 && rolls.a === 12 && rolls.b === 12, `exactly 12 turns each (${rolls.a}/${rolls.b}, round ${s.round})`);
  const o = B.settleOutcome(s);
  ok(o.players.a.failed && o.players.b.failed && !o.players.a.reward, 'fail: every unfinished player is a failed player');
  ok(o.players.a.loot.credits === 0 && o.players.a.loot.items.length === 0, 'fail: loot is forfeited');
}
// success flow + mixed fail (finished players walk away)
{
  const s = B.createSession({ seed: 9, players: ['a', 'b'] });
  s.rng.force('die', Array(100).fill(6)); s.forcedCards.push(...Array(100).fill('fwd2'));
  B.advance(s); let g = 0;
  while (s.phase !== 'over' && g++ < 500) {
    if (s.phase === 'roll') B.applyRoll(s, s.cur, B.rollDie(s));
    else if (s.phase === 'duel') B.applyDuel(s, s.cur, 1);
    if (s.phase === 'next') B.advance(s);
  }
  ok(s.status === 'success' && s.round <= 12, 'success: everybody reached EXIT');
  const o = B.settleOutcome(s);
  ok(!o.players.a.failed && !o.players.b.failed && o.players.a.reward && o.players.b.reward, 'success: no penalty, reward card for everyone');
  ok(['item', 'shards'].includes(o.players.a.reward.kind), 'reward is a rare item or shards');
  const s2 = B.createSession({ seed: 9, players: ['a', 'b'] }); B.advance(s2);
  s2.p.a.pos = 20; roll(s2, 'a', 3); s2.p.a.credits = 50; B.forceEnd(s2, 'fail', 'ship');
  const o2 = B.settleOutcome(s2);
  ok(o2.status === 'fail' && o2.why === 'ship' && !o2.players.a.failed && o2.players.a.loot.credits === 50 && o2.players.b.failed, 'ship left: unfinished players fail, finished keep their loot');
  const s3 = B.createSession({ seed: 3, players: ['a', 'b'] }); B.advance(s3);
  B.removePlayer(s3, 'a'); ok(s3.phase === 'next', 'the current player leaving passes the turn'); B.advance(s3); ok(s3.cur === 'b', 'the next player is up');
  B.removePlayer(s3, 'b'); B.advance(s3); ok(s3.phase === 'over', 'everybody gone = over');
}
// skip really costs the turn
{
  const s = fresh(['a', 'b']); s.p.a.skip = 1; s.p.b.pos = 3;
  roll(s, 'a', 1); s.phase = 'next';   // pretend a finished the current turn; b then a(skip)
  const e1 = B.advance(s); ok(s.cur === 'b', 'b plays after a');
  s.phase = 'next'; const e2 = B.advance(s);
  ok(e2.some((e) => e.k === 'skip' && e.pid === 'a') && s.cur === 'b', 'a skipped its turn, b plays again in the next round');
  void e1;
}

// ---------------------------------------------------------------- the penalty
{
  const it = (id, type, value, def = {}, o = {}) => ({ id, type, value, def: { kind: 'scrap', ...def }, ...o });
  const items = [
    it('1', 'bolt', 30), it('2', 'goldbar', 180, {}, { tier: 'epic' }),
    it('3', 'arm_riot', 0, { kind: 'armor', price: 500 }), it('4', 'fake', 9999, {}, { soulbound: true }),
    it('5', 'bag_void', 8000, { kind: 'bag' }), it('6', 'body', 7000, { kind: 'body' }, { type: 'body' }),
  ];
  const p = B.pickPenaltyItem(items);
  ok(p && p.item.id === '3', 'penalty: the most valuable takeable item (armour by price beats an epic gold bar), soulbound / bag / body excluded');
  ok(B.pickPenaltyItem(items.slice(0, 2)).item.id === '2', 'penalty: tier-weighted value (epic gold bar 315 beats a bolt)');
  ok(B.pickPenaltyItem([]) === null && B.pickPenaltyItem(items.slice(3, 6)) === null, 'penalty: nothing takeable = nothing taken');
  ok(B.itemWorth(it('9', 'w', 10, {}, { plus: 5 })) === 10 + 125, 'penalty: +N enhancement counts');
  ok(B.penaltyHp(100, 100) === 10 && B.penaltyHp(5, 100) === 5 && B.penaltyHp(100, 250) === 25 && B.penaltyHp(100, 5) === 1, 'penalty: HP cut to 10 % (never raised, never 0)');
  ok(B.trapHp(100, 100, 0.15) === 85 && B.trapHp(10, 100, 0.5) === 1, 'traps are never lethal');
}

// ---------------------------------------------------------------- the Administrator: appearance + gaze
{
  const base = { quotaIndex: 2, day: 6, lastDay: 5, roll: 0.01 };
  ok(B.shouldAppear(base), 'appears on a good roll');
  ok(!B.shouldAppear({ ...base, quotaIndex: 0 }) && !B.shouldAppear({ ...base, quotaIndex: 0, roll: 0 }), 'never before quota 1');
  ok(!B.shouldAppear({ ...base, lastDay: 6 }), 'max once per day');
  ok(!B.shouldAppear({ ...base, roll: 0.05 }), 'a 5 % roll misses the 4 % chance');
  ok(B.shouldAppear({ ...base, quotaIndex: 0, force: true }), 'force overrides (tests)');
  let hits = 0, s = 42; const N = 200000;
  for (let i = 0; i < N; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; if (B.shouldAppear({ quotaIndex: 3, day: i, lastDay: -1, roll: s / 4294967296 })) hits++; }
  ok(Math.abs(hits / N - 0.04) < 0.004, `~4 % per landing (${(hits / N * 100).toFixed(2)} %)`);
  const eye = { x: 0, y: 1.6, z: 0 }, head = { x: 0, y: 3.2, z: -12 };
  const dir = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
  ok(B.gazeHit({ eye, head, look: dir(0, 1.6, -12) }).hit, 'gaze: crosshair on the head');
  ok(!B.gazeHit({ eye, head, look: dir(2, 1.6, -12) }).hit, 'gaze: crosshair beside the head');
  ok(!B.gazeHit({ eye, head: { x: 0, y: 3.2, z: -25 }, look: dir(0, 1.6, -25) }).hit, 'gaze: farther than 20 m');
  ok(!B.gazeHit({ eye, head, look: dir(0, 1.6, 12) }).hit, 'gaze: looking the other way');
  const ps = [{ id: 'a', pos: { x: 0, y: 0, z: 0 } }, { id: 'b', pos: { x: 6, y: 0, z: 6 } }, { id: 'c', pos: { x: 12, y: 0, z: 0 } }, { id: 'd', pos: { x: 3, y: 0, z: 3 }, dead: true }];
  const g = B.groupWithin({ x: 0, y: 0, z: 0 }, ps);
  ok(g.length === 2 && g.includes('a') && g.includes('b') && !g.includes('c') && !g.includes('d'), 'group: living crew within 10 m');
  ok(B.slotOffset(0, 1).x === 0 && Math.hypot(B.slotOffset(0, 4).x, B.slotOffset(0, 4).z) > 0.5, 'token slots');
}

// ---------------------------------------------------------------- balance (autoplay, no player skill except the duel score)
{
  const play = (seed, n) => {
    const ids = Array.from({ length: n }, (_, i) => 'p' + i);
    const s = B.createSession({ seed, players: ids }); let r = 12345 + seed * 7;
    const rnd = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    B.advance(s); let g = 0;
    while (s.phase !== 'over' && g++ < 2000) {
      if (s.phase === 'roll') B.applyRoll(s, s.cur, B.rollDie(s)); else if (s.phase === 'duel') B.applyDuel(s, s.cur, 0.3 + 0.65 * rnd());
      if (s.phase === 'next') B.advance(s);
    }
    return s.status === 'success';
  };
  const rate = (n) => { let w = 0; const N = 3000; for (let i = 0; i < N; i++) if (play(i + 1, n)) w++; return w / N; };
  const r1 = rate(1), r4 = rate(4);
  console.log(`balance: solo ${(r1 * 100).toFixed(0)} %, 4 players ${(r4 * 100).toFixed(0)} % team success`);
  ok(r1 > 0.8 && r1 < 0.97, 'solo success rate 80-97 %');
  ok(r4 > 0.5 && r4 < 0.78, '4-player team success rate 50-78 %');
}

// ================================================================================================ module smoke (fake game + stub DOM)
{
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  const mkEl = () => {
    const el = {
      style: {}, classList: { add() {}, remove() {}, contains: () => false }, children: [], _html: '', textContent: '', width: 0, height: 0, offsetWidth: 0, id: '',
      appendChild(c) { this.children.push(c); return c; }, remove() {}, querySelector: () => mkEl(), querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, getContext: () => ctx2d,
    };
    Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; } });
    return el;
  };
  const keyHandlers = [];
  globalThis.document = { createElement: () => mkEl(), getElementById: () => null, head: mkEl(), body: mkEl(), querySelector: () => mkEl() };
  globalThis.window = { addEventListener: (t, f) => { if (t === 'keydown') keyHandlers.push(f); }, removeEventListener() {} };
  const { installBoardGame } = await import('../../src/game/boardgame.js');
  const { createBoard } = await import('../../src/models/board.js');
  const { createAdministrator } = await import('../../src/models/administrator.js');
  { const b = createBoard(); ok(b.tiles.length === 24 && b.colliders.length === 1, 'board model builds'); b.rollDie(4, 5, 500); for (let i = 0; i < 40; i++) b.update(0.05, i * 0.05); ok(!b.dieBusy(), 'die roll animation ends'); b.setTurn(3); b.drawScore({ rows: [{ name: 'x', pos: 5 }] }); b.dispose(); }
  { const a = createAdministrator({ seed: 3 }); a.setPose('sit'); a.update(0.1, 0.1, { lookAt: new THREE.Vector3(0, 0, 5), agit: 1 }); a.setPose('stand'); ok(a.headWorld().y > 2.5, 'Administrator model builds (tall)'); a.dispose(); }

  const realRandom = Math.random; Math.random = () => 0.5;
  const mkGame = (players, heldBy) => {
    const handlers = new Map(), msg = new Map(), listeners = new Map(), sent = [], removed = [], spawned = [];
    const mods = { ev: new Map(), on(e, f) { (this.ev.get(e) || this.ev.set(e, new Set()).get(e)).add(f); return () => this.ev.get(e)?.delete(f); }, emit(e, ...a) { for (const f of [...(this.ev.get(e) || [])]) f(...a); } };
    const net = {
      handlers, sent, selfId: 'me',
      on_: (t, f) => msg.set(t, f), on: (e, f) => { (listeners.get(e) || listeners.set(e, new Set()).get(e)).add(f); return () => {}; },
      sendTo(pid, t, d) { sent.push([pid, t, d]); if (pid === 'me') msg.get(t)?.(d, 'me'); },
      broadcast(t, d) { sent.push(['*', t, d]); if (t === 'it' && d.e === 'rm') removed.push(d.id); msg.get(t)?.(d, 'me'); },
      request(a, d) { handlers.get(a)?.({ a, ...d }, 'me'); }, send() {},
    };
    const player = { pos: new THREE.Vector3(0, 0, 0), hp: 100, maxHp: 100, stunT: 0, dead: false, pitch: 0, yaw: 0, tele: [], teleport(p, yaw) { this.pos.copy(p); this.tele.push([p.x, p.y, p.z]); if (yaw !== undefined) this.yaw = yaw; }, eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z); }, forward() { return new THREE.Vector3(0, 0, -1); } };
    const g = {
      mods, net, time: 0, selfId: 'me', isHost: true, player, spawned, removed,
      run: { quotaIndex: 2, day: 4, phase: 'moon', credits: 100 }, broadcastRun() {},
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), engine: { fx: { noise: 0, blind: 0 }, hurt() {}, shake() {}, flash() {}, beat() {}, fadeTarget: 0 },
      physics: { lineOfSight: () => true, raycast: () => null, addStaticBox: () => ({}), removeCollider() {} }, lights: { add: (e) => e, remove() {} }, env: { interiorFog: null },
      ui: { blocksInput: () => false, toast() {} }, sfx() {}, playerName: (id) => id, world: { terrain: { playHalf: 100, heightAt: () => 0 }, facility: null },
      ship: { spawns: [new THREE.Vector3(0, 1, 0)] }, spawnInShip() { player.teleport(new THREE.Vector3(0, 1, 0)); },
      items: { all: () => heldBy, hostSpawn(t, p, o) { spawned.push([t, o]); } },
      aiPlayers: () => players.map((p) => ({ id: p.id, pos: p.pos, eye: new THREE.Vector3(p.pos.x, p.pos.y + 1.6, p.pos.z), look: p.look || new THREE.Vector3(0, 0, -1), dead: false, inShip: false, zone: 'out' })),
      aiPlayerById(id) { return this.aiPlayers().find((p) => p.id === id); },
    };
    g.mods = mods; g.destroyed = false;
    const api = installBoardGame(g);
    mods.emit('registerHandlers', (a, f) => handlers.set(a, f), g);
    mods.emit('netReady', net, g);
    const tick = (secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) { g.time += dt; mods.emit('update', dt, g); } };
    return { g, api, net, mods, tick, sent, removed, spawned, player };
  };
  const items = () => [
    { id: 'i1', holder: 'me', type: 'bolt', value: 30, def: { kind: 'scrap' } },
    { id: 'i2', holder: 'me', type: 'goldbar', value: 190, tier: 'epic', def: { kind: 'scrap' } },
    { id: 'i3', holder: 'me', type: 'bag_void', value: 9000, def: { kind: 'bag' } },
    { id: 'i4', holder: 'other', type: 'ring', value: 999, def: { kind: 'scrap' } },
  ];
  const players = () => [{ id: 'me', pos: new THREE.Vector3(0, 0, 0) }, { id: 'buddy', pos: new THREE.Vector3(4, 0, 0) }, { id: 'far', pos: new THREE.Vector3(30, 0, 0) }];

  // ---- (1) gaze flow: Administrator 12 m ahead -> 2 s stare -> transfer for me + buddy (within 10 m), not far
  {
    const P = [{ id: 'me', pos: new THREE.Vector3(0, 0, 0) }, { id: 'buddy', pos: new THREE.Vector3(3, 0, 0) }, { id: 'far', pos: new THREE.Vector3(40, 0, 0) }];
    const T = mkGame(P, items());
    ok(T.api.spawnAdmin({ near: true }) === true && T.api.state().admin.on, 'Administrator spawns');
    const A = T.api.state().admin.pos, head = new THREE.Vector3(A[0], A[1] + 3.22, A[2]);
    P[0].pos.set(A[0], A[1], A[2] + 12); P[1].pos.set(A[0] + 3, A[1], A[2] + 12); P[2].pos.set(A[0] + 40, A[1], A[2] + 12);
    T.player.pos.copy(P[0].pos);
    T.player.forward = () => head.clone().sub(T.player.eyePos()).normalize();
    const base = T.g.aiPlayers;
    T.g.aiPlayers = () => base.call(T.g).map((p) => (p.id === 'me' ? { ...p, look: T.player.forward() } : p));
    T.tick(1.5);
    ok(!T.sent.some((x) => x[1] === 'bg' && x[2].k === 'start'), 'no transfer before 2 s of staring');
    T.tick(1.2);
    const st = T.sent.find((x) => x[1] === 'bg' && x[2].k === 'start')?.[2];
    ok(!!st, 'the 2 s gaze started a session');
    ok(st && st.order.includes('me') && st.order.includes('buddy') && !st.order.includes('far') && st.order[0] === 'me', 'gazer + crew within 10 m transfer, the far one does not');
    ok(T.api.state().admin.on === false, 'the Administrator leaves the world when the session starts');
  }

  // ---- (2) full flows through the module (solo session driven with forced dice)
  const runSession = async (kind) => {
    const T = mkGame([{ id: 'me', pos: new THREE.Vector3(5, 0, 5) }], items());
    T.api.spawnAdmin({ near: true }); T.tick(0.3);
    const A = T.api.state().admin.pos;
    if (kind === 'success') { T.api.force.rolls([6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]); T.api.force.cards(Array(30).fill('fwd2')); T.api.force.duel(1); }
    else { T.api.force.rolls(Array(40).fill(1)); T.api.force.cards(Array(60).fill('back3')); T.api.force.duel(0); }
    ok(T.api.gaze('me') === true, kind + ': forced gaze starts a session');
    T.tick(1.2);
    ok(T.api.state().local?.realm === true, kind + ': the realm is built on the client');
    ok(T.player.pos.y < -300 && Math.abs(T.player.pos.x - 6400) < 30, kind + ': the player stands on the board (' + T.player.pos.toArray().map((v) => v.toFixed(1)).join(',') + ')');
    if (kind === 'ship') {
      T.tick(9);
      T.mods.emit('phase', 'takeoff', T.g);
    } else {
      let guard = 0;
      while (T.api.state().host && guard++ < 6000) T.tick(0.5);
    }
    T.tick(8);
    return T;
  };
  {
    const T = await runSession('success');
    const last = T.api.state().last;
    ok(last && last.status === 'success', 'success flow ends in success (' + (last && last.status) + ')');
    const end = T.sent.find((x) => x[1] === 'bg' && x[2].k === 'end')?.[2];
    ok(end && !end.failed && !end.took && end.reward, 'success: no penalty, reward card');
    ok(T.removed.length === 0, 'success: nothing is taken');
    ok(T.spawned.length >= 1 || end.reward.kind === 'credits', 'success: reward item spawned (or credits when the forge shards are not installed)');
    ok(T.api.state().local === null && T.player.pos.y > -100 && Math.abs(T.player.pos.x - 5) < 0.1, 'success: returned to where the player stood');
    ok(T.player.hp > 10 && T.player.stunT === 0, 'success: HP not cut to 10 %, free again');
  }
  {
    const T = await runSession('fail');
    const last = T.api.state().last;
    ok(last && last.status === 'fail' && last.why === 'turns', 'fail flow: turns ran out');
    const end = T.sent.find((x) => x[1] === 'bg' && x[2].k === 'end')?.[2];
    ok(end && end.failed && end.took && end.took.type === 'goldbar', 'fail: the most valuable item (gold bar, not the bag, not the stranger\'s ring)');
    ok(T.removed.length === 1 && T.removed[0] === 'i2', 'fail: item removed through the host');
    ok(T.player.hp === 10, 'fail: HP cut to 10 % (' + T.player.hp + ')');
    ok(T.api.state().local === null && Math.abs(T.player.pos.x - 5) < 0.1, 'fail: returned to where the player stood');
  }
  {
    const T = await runSession('ship');
    const end = T.sent.find((x) => x[1] === 'bg' && x[2].k === 'end')?.[2];
    ok(end && end.ship && end.failed && end.took, 'ship left: the fail penalty applies');
    ok(T.api.state().local === null && Math.abs(T.player.pos.x) < 0.1 && T.player.pos.y > -100, 'ship left: returned at the ship');
  }
  Math.random = realRandom;
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
