// Node test for the pure rules of THE ALGORITHM'S REVOLVER (src/game/roulette.js): live-chamber odds, the pot ladder, pass / cash / forced rules,
// turn order, reset after five empty chambers, and the seeded table plans (never before quota 1, ~half of the shrine spawns).
//   node tools/harness/roulette.test.mjs
import {
  RR, newTable, spinCylinder, sitAt, standUp, seatOf, turnId, nextSeat, passCheck, cashCheck, pullCheck, doPass, doCash, doPull, publicState, cleanState,
  potReward, POT_TIER, POT_LABEL, claimsShrine, planShipTable, SHIP_TABLE,
} from '../../src/game/roulette.js';
import { POWERUPS } from '../../src/game/powerups.js';
import { ITEMS } from '../../src/game/items.js';
import { tierOfItem, tierIndex } from '../../src/game/tiers.js';
import { seatPos, seatYaw } from '../../src/models/roulette.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
let s = 987654321; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

// ---- odds: one live round in six, uniformly placed; a solo player dies on pull k with 1/6 each, survives all five with 1/6 (the sixth chamber is the bullet)
{
  const N = 60000, byChamber = [0, 0, 0, 0, 0, 0], dieAt = [0, 0, 0, 0, 0, 0, 0], pot5 = { n: 0 };
  for (let i = 0; i < N; i++) {
    const tb = newTable(rnd);
    byChamber[tb.live]++;
    sitAt(tb, 'a');
    let pulls = 0, r;
    do { r = doPull(tb, 'a', rnd); pulls++; } while (r.res === 'empty' && !r.reset);
    if (r.res === 'live') dieAt[pulls]++; else pot5.n++;
  }
  for (let c = 0; c < 6; c++) ok(Math.abs(byChamber[c] / N - 1 / 6) < 0.012, `live chamber ${c} is uniform (${(byChamber[c] / N).toFixed(3)})`);
  for (let k = 1; k <= 5; k++) ok(Math.abs(dieAt[k] / N - 1 / 6) < 0.012, `solo: dies on pull ${k} with ~1/6 (${(dieAt[k] / N).toFixed(3)})`);
  ok(dieAt[6] === 0, 'a sixth pull is never fired');
  ok(Math.abs(pot5.n / N - 1 / 6) < 0.012, `solo: reaches the fifth empty chamber (reset) with ~1/6 (${(pot5.n / N).toFixed(3)})`);
  // conditional odds: the risk climbs 1/6 -> 1/2 -> (the sixth is certain and never fired)
  const cond = [1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2];
  let alive = N;
  for (let k = 1; k <= 5; k++) { ok(Math.abs(dieAt[k] / alive - cond[k - 1]) < 0.02, `conditional risk on pull ${k} is ~1/${7 - k}`); alive -= dieAt[k]; }
}

// ---- live chamber can be forced / never public
{
  const tb = newTable(() => 0.5);
  ok(tb.live === 3, 'rnd 0.5 -> chamber 3');
  ok(!('live' in publicState(tb)), 'the live chamber never leaves the host');
  spinCylinder(tb, () => 0.99); ok(tb.live === 5 && tb.fired === 0, 'respin');
}

// ---- pot ladder: level 1..5 by tier, real power-ups / items only
{
  ok(POT_TIER.slice(1).join() === 'common,uncommon,epic,legendary,mythic', 'five ladder tiers');
  ok(POT_LABEL.length === 6, 'five labels');
  for (let n = 0; n < 400; n++) {
    for (let lvl = 1; lvl <= 5; lvl++) {
      const r = potReward(lvl, rnd, 2);
      ok(r.pus.every(([id, dur]) => POWERUPS[id] && dur >= 0 && (POWERUPS[id].dur === 0 ? dur === 0 : dur >= POWERUPS[id].dur)), `level ${lvl}: only existing power-ups with scaled durations`);
      ok(new Set(r.pus.map((p) => p[0])).size === r.pus.length, `level ${lvl}: no duplicate power-ups`);
      if (lvl === 1) ok(r.pus.length === 1 && ['p_premium', 'p_adfree', 'p_oc', 'p_xp'].includes(r.pus[0][0]) && !r.item && r.pus[0][1] === POWERUPS[r.pus[0][0]].dur, 'level 1: one common power-up at base duration');
      if (lvl === 2) ok(r.pus.length === 1 && !r.item && r.pus[0][1] >= (POWERUPS[r.pus[0][0]].dur ? Math.round(POWERUPS[r.pus[0][0]].dur * 1.5) : 0), 'level 2: one uncommon+ power-up, 1.5x duration');
      if (lvl === 3) ok((r.item && tierIndex(r.item.tier) >= tierIndex('rare') && ITEMS[r.item.type]) || r.pus.length === 2, 'level 3: a rare+ item or two power-ups');
      if (lvl === 4) ok(r.pus.length === 3 && r.pus.some((p) => p[0] === 'p_cloud') && r.coins >= 120 + 80, 'level 4: three power-ups incl. Cloud Save + shards');
      if (lvl === 5) ok(r.pus.length === 3 && r.item && (tierIndex(r.item.tier) >= tierIndex('legendary')) && ITEMS[r.item.type] && r.coins >= 300 && r.heal === 100, 'level 5: mythic item + huge power');
    }
  }
  const t3 = new Set(); for (let n = 0; n < 200; n++) { const r = potReward(3, rnd, 0); t3.add(r.item ? 'item' : 'pus'); } ok(t3.size === 2, 'level 3 rolls both an item and a power-up pair sometimes');
  ok(potReward(1, rnd).coins === 0 && potReward(4, rnd, 0).coins > 0, 'shards only from level 3+');
  ok(potReward(9, rnd).level === 5 && potReward(0, rnd).level === 1, 'levels are clamped');
  void tierOfItem;
}

// ---- seating / turn order
{
  const tb = newTable(() => 0.99);
  ok(sitAt(tb, 'a', 2) === 2 && tb.turn === 2 && turnId(tb) === 'a', 'first sitter holds the gun');
  ok(sitAt(tb, 'b', 2) !== 2 && seatOf(tb, 'b') >= 0, 'an occupied preferred seat falls back to a free one');
  ok(sitAt(tb, 'a') === -1, 'cannot sit twice');
  sitAt(tb, 'c'); sitAt(tb, 'd');
  ok(sitAt(tb, 'e') === -1 && tb.seats.every(Boolean), 'the fifth player is refused (4 seats)');
  const order = []; let cur = tb.turn; for (let i = 0; i < 4; i++) { order.push(tb.seats[cur]); cur = nextSeat(tb, cur); }
  ok(new Set(order).size === 4, 'turn order visits all four seats');
  const who = turnId(tb);
  const r = standUp(tb, who);
  ok(r && r.seat >= 0 && turnId(tb) && turnId(tb) !== who, 'standing up hands the gun on');
}

// ---- pass rules
{
  const tb = newTable(() => 0.99);   // live = 5, so no pull ever kills in this block until the reset
  sitAt(tb, 'a', 0);
  ok(!passCheck(tb, 'a').ok && passCheck(tb, 'a').why === 'solo', 'solo: no pass, and the reason says why');
  sitAt(tb, 'b', 1);
  ok(!passCheck(tb, 'b').ok && passCheck(tb, 'b').why === 'notturn', 'cannot pass out of turn');
  ok(passCheck(tb, 'a').ok, 'two players: the holder may pass');
  ok(doPass(tb, 'a') === 'b' && turnId(tb) === 'b' && tb.forced, 'the pass hands the gun to the next player, forced');
  ok(!passCheck(tb, 'b').ok && passCheck(tb, 'b').why === 'forced', 'a forced player cannot pass it back');
  ok(!cashCheck(tb, 'b').ok, 'a forced player cannot cash out');
  ok(pullCheck(tb, 'b').ok, 'a forced player can pull');
  doPull(tb, 'b', rnd);
  ok(!tb.forced && turnId(tb) === 'a', 'after the forced pull the gun moves on and the force is gone');
  ok(!passCheck(tb, 'a').ok && passCheck(tb, 'a').why === 'used', 'exactly ONE pass per player per table session');
  doPull(tb, 'a', rnd);   // b again
  ok(passCheck(tb, 'b').ok, 'b still has their one pass');
  // standing up and coming back does not refund the pass
  standUp(tb, 'a'); sitAt(tb, 'a');
  ok(tb.passUsed.a === 1, 'the pass is per table session, not per seat');
}

// ---- cash out only after surviving a pull; pot paid; gun moves on
{
  const tb = newTable(() => 0.99);
  sitAt(tb, 'a', 0); sitAt(tb, 'b', 1);
  ok(!cashCheck(tb, 'a').ok && cashCheck(tb, 'a').why === 'nopot', 'no cash out before a survived pull');
  doPull(tb, 'a', rnd);            // a survives (pot 1), gun -> b
  doPull(tb, 'b', rnd);            // b survives (pot 1), gun -> a
  ok(tb.pots.a === 1 && tb.pots.b === 1, 'each survived pull adds one pot level');
  ok(cashCheck(tb, 'a').ok && !cashCheck(tb, 'b').ok, 'cash out only on your own turn');
  ok(doCash(tb, 'a') === 1 && seatOf(tb, 'a') === -1 && turnId(tb) === 'b', 'cash out pays the pot, leaves, the gun goes on');
  ok(!('a' in tb.pots), 'the cashed-out pot is gone from the table');
}

// ---- live round: the shooter dies, the others are paid, the table closes
{
  const tb = newTable(() => 0);    // live = chamber 0
  sitAt(tb, 'a', 0); sitAt(tb, 'b', 1); sitAt(tb, 'c', 2);
  tb.pots.b = 3; tb.pots.c = 0;
  const r = doPull(tb, 'a', rnd);
  ok(r.res === 'live' && r.chamber === 0, 'chamber 0 was live');
  ok(tb.closed && tb.dead === 'a' && tb.seats.every((x) => !x), 'the table closes and empties');
  ok(r.survivors.length === 2 && r.survivors.find((x) => x.id === 'b').pot === 3 && r.survivors.find((x) => x.id === 'c').pot === 0, 'survivors keep their pots to be paid out');
  ok(!pullCheck(tb, 'b').ok && sitAt(tb, 'b') === -1, 'a closed table takes nobody');
  ok(r.lost === 0, 'the dead shooter loses their (empty) pot');
  const tb2 = newTable(() => 3 / 6 + 0.01); sitAt(tb2, 'x'); doPull(tb2, 'x', rnd); doPull(tb2, 'x', rnd); doPull(tb2, 'x', rnd);
  ok(tb2.pots.x === 3, 'three survived pulls');
  const r2 = doPull(tb2, 'x', rnd);
  ok(r2.res === 'live' && r2.lost === 3, 'dying on the 4th pull loses the pot of 3');
}

// ---- reset: five empty chambers, the sixth was the bullet; everyone is paid; new spin; passes are NOT refunded; capped rounds
{
  const tb = newTable(() => 0.99);   // live = 5
  sitAt(tb, 'a', 0); sitAt(tb, 'b', 1);
  doPass(tb, 'a'); doPull(tb, 'b', rnd);   // b forced, empty 1 (pot b 1), gun -> a
  const ids = ['a', 'b', 'a', 'b'];
  let last;
  for (let i = 0; i < 4; i++) { last = doPull(tb, turnId(tb), rnd); }
  ok(last.res === 'empty' && last.reset && tb.fired === 0 && tb.round === 2, 'the fifth empty chamber resets the table (new spin, round 2)');
  ok(last.paid.length === 2 && last.paid.reduce((n, p) => n + p.pot, 0) === 5, 'five pulls = five pot levels paid across the table');
  ok(tb.pots.a === 0 && tb.pots.b === 0 && seatOf(tb, 'a') >= 0 && seatOf(tb, 'b') >= 0, 'pots cleared, players stay seated');
  ok(tb.passUsed.a === 1, 'passes stay spent across a reset');
  void ids;
  // solo mythic: five survivals only when the bullet is the sixth chamber
  const solo = newTable(() => 0.99); sitAt(solo, 'z');
  let r; for (let i = 0; i < 5; i++) r = doPull(solo, 'z', rnd);
  ok(r.reset && r.paid[0].pot === 5, 'solo: the fifth survived pull pays the mythic pot (level 5)');
  // round cap
  const cap = newTable(() => 0.99); sitAt(cap, 'z');
  let closed = false;
  for (let round = 0; round < RR.maxRounds; round++) { for (let i = 0; i < 5; i++) { const q = doPull(cap, 'z', () => 0.99); if (q.closed) closed = true; } }
  ok(closed && cap.closed, `the table closes after ${RR.maxRounds} rounds`);
}

// ---- wire validation
{
  const c = cleanState({ seats: ['a', 5, null, 'b'], turn: 9, fired: -3, pots: { a: 99, b: 2 }, passUsed: { a: 1 }, forced: 1, round: 0, closed: 0, dead: 12 });
  ok(c.seats[0] === 'a' && c.seats[1] === null && c.turn === 3 && c.fired === 0 && c.pots.a === 5 && c.round === 1 && c.dead === null, 'cleanState clamps garbage');
  ok(cleanState(null).turn === -1, 'cleanState(null) is an idle table');
}

// ---- world plans: never before quota 1, ~half of the shrines, a ship table once per quota
{
  let n = 0; for (let seed = 1; seed <= 2000; seed++) if (claimsShrine(seed * 7919, 1)) n++;
  ok(n > 800 && n < 1200, `about half of the shrine spawns become tables (${n}/2000)`);
  ok(claimsShrine(12345, 1) === claimsShrine(12345, 1) && claimsShrine(12345, 3) === claimsShrine(12345, 5), 'claims are deterministic per seed');
  let early = 0; for (let seed = 1; seed <= 500; seed++) if (claimsShrine(seed, 0) || planShipTable(seed, 0)) early++;
  ok(early === 0, 'no tables before quota 1');
  let ship = 0; const qs = new Set();
  for (let seed = 1; seed <= 1000; seed++) { const p = planShipTable(seed * 31, 2); if (p) { ship++; qs.add(JSON.stringify(p)); } }
  ok(ship > 350 && ship < 550 && qs.size === 1, `the ship bonus table appears ~45% of the time in one fixed spot (${ship}/1000)`);
  const a = planShipTable(77, 1), b = planShipTable(77, 1);
  ok(JSON.stringify(a) === JSON.stringify(b), 'the ship plan is deterministic');
  ok(SHIP_TABLE.x > -7 && SHIP_TABLE.x < 7 && Math.abs(SHIP_TABLE.z) < 3.5, 'the ship table is inside the ship');
  // seats: four distinct spots around the table, each looking at the middle
  const spots = [0, 1, 2, 3].map((i) => seatPos(10, 0, 20, 0.7, i));
  ok(new Set(spots.map((p) => p.x.toFixed(2) + p.z.toFixed(2))).size === 4, 'four distinct seats');
  for (let i = 0; i < 4; i++) {
    const y = seatYaw(10, 20, 0.7, i), fx = -Math.sin(y), fz = -Math.cos(y);
    const dx = 10 - spots[i].x, dz = 20 - spots[i].z, l = Math.hypot(dx, dz);
    ok(Math.abs(fx - dx / l) < 1e-6 && Math.abs(fz - dz / l) < 1e-6, `seat ${i} faces the table`);
  }
}

console.log(fails ? `FAILED (${fails})` : 'PASS');
process.exit(fails ? 1 : 0);
