// node tools/harness/horror.test.mjs - HORROR module: trap state machine + pricing, set piece placement connectivity, chalk sync / limits, zombie balance,
// fake closet rules, pocket maps, translations. Pure logic only (no browser).
import fs from 'fs';
import { generateLayout } from '../../src/world/facility.js';
import * as C from '../../src/game/horror_core.js';
import * as MAPS from '../../src/game/horror_maps.js';
import { TR, RU, TIP, DEATH_TEXT } from '../../src/game/horror_text.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ================================================================================ 1. traps: table, pricing, state machine, damage
{
  for (const id of C.TRAP_IDS) {
    const T = C.TRAPS[id];
    ok(T.price >= 30 && T.price <= 120, `${id} price ${T.price} is a tactic, not free and not a bankruptcy`);
    ok(T.charges >= 2 && T.tele >= 0.5, `${id} has charges and a telegraph >= 0.5 s`);
    ok(T.dmgP < 100 || C.tickCount(id) > 1, `${id} does not one-shot a full-health player with a single hit`);
    ok(C.maxStrikeDamage(id) >= 100, `${id} can really hurt a creature`);
  }
  ok(C.trapPrice('laser', {}) === 90, 'base laser price');
  ok(C.trapPrice('crusher', { quotaIndex: 0, usesThisLanding: 0 }) === 45, 'base crusher price');
  const p0 = C.trapPrice('flame', { quotaIndex: 0, usesThisLanding: 0 }), p1 = C.trapPrice('flame', { quotaIndex: 0, usesThisLanding: 2 }), p2 = C.trapPrice('flame', { quotaIndex: 6, usesThisLanding: 0 });
  ok(p1 > p0 && p2 > p0, 'price rises with uses and sector');
  ok(C.trapPrice('flame', { quotaIndex: 99, usesThisLanding: 0 }) <= C.TRAPS.flame.price * C.TRAP_RULES.priceQuotaMax + 5, 'sector price scaling is capped');
  ok(C.trapPrice('nope') === Infinity, 'unknown trap has no price');
  ok(C.trapPrice('spikes', {}) % 5 === 0, 'prices are multiples of 5');
  // refunds: never more than the cap, never negative, killing a whole pack does not turn a profit
  let refunded = 0;
  for (let k = 0; k < 20; k++) refunded += C.killRefund('laser', 90, refunded);
  ok(refunded <= Math.floor(90 * C.TRAP_RULES.refundMax) && refunded > 0, `refund total ${refunded} <= 60% of the price`);
  ok(C.killRefund('laser', 90, 1000) === 0, 'no refund left');
  // state machine: idle -> armed -> tele -> strike -> cool -> armed ... -> spent
  const tr = C.newTrap('laser');
  ok(tr.s === 'idle', 'starts idle');
  ok(C.armTrap(tr, 0, 'p1').ok && tr.s === 'armed' && tr.charges === 2 && tr.by === 'p1', 'arm');
  ok(!C.armTrap(tr, 1, 'p2').ok, 'cannot arm twice');
  ok(C.stepTrap(tr, 1, false).length === 0 && tr.s === 'armed', 'armed waits for a creature');
  ok(C.stepTrap(tr, 2, true)[0] === 'tele' && tr.s === 'tele', 'creature triggers the telegraph');
  ok(C.stepTrap(tr, 2.5, true).length === 0, 'telegraph is not skipped');
  ok(C.stepTrap(tr, 2 + C.TRAPS.laser.tele + 0.01, true)[0] === 'strike' && tr.s === 'strike', 'strike after the telegraph');
  const t1 = 2 + C.TRAPS.laser.tele + 0.01;
  ok(C.stepTrap(tr, t1 + C.TRAPS.laser.strike + 0.01, false)[0] === 'end' && tr.s === 'cool' && tr.charges === 1, 'strike ends, one charge used');
  const t2 = t1 + C.TRAPS.laser.strike + 0.01;
  C.stepTrap(tr, t2 + C.TRAPS.laser.cd + 0.01, false);
  ok(tr.s === 'armed', 'back to armed while charges are left');
  // run the second charge, then it is spent
  let now = t2 + C.TRAPS.laser.cd + 0.02;
  C.stepTrap(tr, now, true); now += C.TRAPS.laser.tele + 0.01; C.stepTrap(tr, now, true); now += C.TRAPS.laser.strike + 0.01; C.stepTrap(tr, now, false); now += C.TRAPS.laser.cd + 0.01;
  const evs = C.stepTrap(tr, now, false);
  ok(tr.s === 'spent' && evs.includes('spent') && tr.charges === 0, 'spent after the last charge');
  ok(C.armTrap(tr, now, 'p1').ok && tr.arms === 2, 're-arm after spent (second paid use)');
  for (let a = 0; a < 5; a++) { tr.s = 'spent'; C.armTrap(tr, now, 'p1'); }
  ok(tr.arms === C.TRAP_RULES.maxArmsPerLanding, 'arming is limited per landing');
  // expiry: an armed trap nobody walks into powers down
  const ex = C.newTrap('spikes'); C.armTrap(ex, 0, 'p');
  ok(C.stepTrap(ex, C.TRAPS.spikes.armSec + 1, false)[0] === 'expire' && ex.s === 'idle', 'armed trap expires (money lost, not an auto-win)');
  // damage: bosses barely notice, hazards are immune, elites take less
  ok(C.trapDamageTo('crusher', { hp: 100, maxHp: 100 }) === 320, 'crusher damage');
  ok(C.trapDamageTo('crusher', { hp: 900, maxHp: 900, boss: true }) < 30, 'boss takes a sliver');
  ok(C.trapDamageTo('laser', { hp: 10, maxHp: 10, hazard: true }) === 0 && C.trapDamageTo('laser', { hp: null, maxHp: null }) === 0, 'hazards / invulnerable creatures ignored');
  ok(C.trapDamageTo('laser', { hp: 100, maxHp: 100, elite: true }) < C.trapDamageTo('laser', { hp: 100, maxHp: 100 }), 'elites take less');
  // laser sweep: monotonic 0 -> 1, hits everything the wall passes exactly once, misses what it has not reached
  let prev = 0, mono = true;
  for (let i = 1; i <= 40; i++) { const f = C.laserFrac(i / 40 * C.TRAPS.laser.strike); if (f < prev - 1e-9) mono = false; prev = f; }
  ok(mono && near(C.laserFrac(0), 0) && near(C.laserFrac(9), 1), 'laser sweep runs 0 -> 1');
  ok(C.sweepHit(0.2, 0.4, 0.3 * 8, 8) && !C.sweepHit(0.2, 0.4, 0.9 * 8, 8) && !C.sweepHit(0.5, 0.6, 0.1 * 8, 8), 'sweep hit test');
  const z = { cx: 10, cz: 20, axis: 'x', len: 8, wid: 3.7 };
  ok(C.zoneCoords(z, 10, 20).inside && near(C.zoneCoords(z, 6, 20).s, 0) && !C.zoneCoords(z, 15, 20).inside && !C.zoneCoords(z, 10, 22.5).inside, 'zone coordinates (axis x)');
  ok(near(C.zoneCoords({ ...z, axis: 'z' }, 10, 24).s, 8), 'zone coordinates (axis z)');
  // economics: every priced arming has to be a decision. The full-price cheapest trap should not be free money on the first landing (credits start at 60)
  ok(C.TRAPS.crusher.price <= 60 && C.TRAPS.laser.price > 60, 'the cheap trap is reachable on day 1, the big one is a real spend');
  say('traps: table, pricing, state machine, damage, refunds');
}

// ================================================================================ 2. set piece placement (facility plan + pocket maps)
{
  const themes = ['factory', 'mansion', 'office', 'hospital', 'serverfarm', 'sewer', 'mineshaft', 'backrooms'];
  let nTraps = 0, nClosets = 0, nFake = 0, nOutbreak = 0, nMansion = 0, layouts = 0, crestOk = 0;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  for (const th of themes) for (let s = 1; s <= 14; s++) {
    const seed = s * 7919 + 13 + th.length * 101;
    const opts = s % 3 === 0 ? { labyrinth: 1, plan: 'wings', wings: 2 } : null;
    const L = generateLayout(seed, th, 0.8 + (s % 5) * 0.35, opts);
    const run = { day: 1 + (s % 4), quotaIndex: s % 3 };
    const plan = C.planFacility(L, run), plan2 = C.planFacility(L, run);
    layouts++;
    ok(JSON.stringify(plan) === JSON.stringify(plan2), `plan deterministic ${th}/${seed}`);
    if (th === 'backrooms' || th === 'mineshaft') { ok(!plan.traps.length && !plan.closets.length && !plan.fake, `${th} is left alone`); continue; }
    const reach = C.reachableCells(L);
    // traps
    const spots = [];
    for (const tp of plan.traps) {
      nTraps++;
      ok(C.TRAPS[tp.type] && tp.cells.length >= 1 && tp.cells.length >= C.TRAPS[tp.type].minLen, `${th}/${seed}: trap ${tp.type} run length ${tp.cells.length}`);
      for (const [x, z] of [...tp.cells, tp.panelCell]) {
        ok(L.cells[L.idx(x, z)] > 0 && reach[L.idx(x, z)], `${th}/${seed}: trap cell reachable`);
        ok((L.distOf?.[L.idx(x, z)] ?? 9) >= 3, `${th}/${seed}: trap not at the entrance`);
      }
      // straight, connected line along the axis; walls on both sides (a real hallway)
      const all = [tp.panelCell, ...tp.cells];
      for (let i = 0; i < all.length; i++) {
        const [x, z] = all[i];
        const sides = tp.axis === 'x' ? [1, 3] : [0, 2], along = tp.axis === 'x' ? [0, 2] : [1, 3];
        ok(sides.every((d) => !L.open.has(L.edgeKey(x, z, d))), `${th}/${seed}: hallway cell has closed sides`);
        ok(along.every((d) => L.open.has(L.edgeKey(x, z, d))), `${th}/${seed}: hallway cell is open along the axis`);
        ok(along.every((d) => !L.edgeInfo.has(L.edgeKey(x, z, d))), `${th}/${seed}: no doorway inside the trap`);
        if (i > 1) ok(Math.abs(all[i][0] - all[i - 1][0]) + Math.abs(all[i][1] - all[i - 1][1]) === 1 && (tp.axis === 'x' ? all[i][1] === all[i - 1][1] : all[i][0] === all[i - 1][0]), `${th}/${seed}: zone cells are a straight line`);
        if (i === 1) ok(tp.axis === 'x' ? all[1][1] === all[0][1] && all[1][0] > all[0][0] : all[1][0] === all[0][0] && all[1][1] > all[0][1], `${th}/${seed}: the panel is on the same hallway, upstream of the zone`);
      }
      spots.push(tp.cells[Math.floor(tp.cells.length / 2)]);
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) ok(Math.abs(spots[i][0] - spots[j][0]) + Math.abs(spots[i][1] - spots[j][1]) >= 7, `${th}/${seed}: traps are spread out`);
    // closets
    const rooms = new Set();
    for (const c of plan.closets) {
      nClosets++; if (c.kind === 'outbreak') nOutbreak++; if (c.kind === 'mansion') nMansion++;
      const { x, z, d } = c.cell;
      ok(!rooms.has(c.room), `${th}/${seed}: one closet per room`); rooms.add(c.room);
      ok(L.roomOf[L.idx(x, z)] === c.room && reach[L.idx(x, z)], `${th}/${seed}: closet cell is in its room and reachable`);
      ok(!L.open.has(L.edgeKey(x, z, d)) && !L.edgeInfo.has(L.edgeKey(x, z, d)), `${th}/${seed}: closet stands against a plain wall`);
      ok([0, 1, 2, 3].every((k) => !L.edgeInfo.has(L.edgeKey(x, z, k))), `${th}/${seed}: closet cell has no doorway`);
      // the closet footprint (1.7 x 1.4 against the wall) leaves >= 2.4 m of the 4 m cell free: the hall / room can never be sealed off
      ok(C.CELL - C.CLOSET.d >= 2.4, 'closet leaves the cell passable');
      const fr = C.closetFrame(L, c.cell);
      ok(Math.abs(Math.hypot(fr.fx, fr.fz) - 1) < 1e-9, 'closet facing is a unit vector');
      ok(Math.abs(fr.wallX - (L.ox + x * C.CELL + C.CELL / 2 + DX[d] * C.CELL / 2)) < 1e-6 && Math.abs(fr.wallZ - (L.oz + z * C.CELL + C.CELL / 2 + DZ[d] * C.CELL / 2)) < 1e-6, 'closet is on the wall line');
      ok(fr.x - fr.wallX === fr.fx * C.CLOSET.d / 2 || Math.abs((fr.x - fr.wallX) - fr.fx * C.CLOSET.d / 2) < 1e-9, 'closet centre is half a depth in front of the wall');
      ok(C.POCKET_KINDS.includes(c.kind), 'known pocket kind');
    }
    if (plan.closets.some((c) => c.kind === 'outbreak')) {
      ok(plan.crestRoom === -1 || (reach[L.idx(L.rooms[plan.crestRoom].cx, L.rooms[plan.crestRoom].cz)] && !rooms.has(plan.crestRoom)), `${th}/${seed}: crest lies in a reachable room that is not the closet room`);
      if (plan.crestRoom >= 0) crestOk++;
    }
    if (plan.fake) {
      nFake++;
      ok(run.day >= 2 || run.quotaIndex >= 1, 'no fake closet on day 1 of sector 1');
      ok(!rooms.has(plan.fake.room), 'fake closet does not share a room with a real one');
      const { x, z, d } = plan.fake.cell;
      ok(reach[L.idx(x, z)] && !L.open.has(L.edgeKey(x, z, d)) && (L.distOf?.[L.idx(x, z)] ?? 9) >= 3, 'fake closet placement');
    }
  }
  ok(nTraps > 60 && nClosets > 40, `enough content generated (${nTraps} traps, ${nClosets} closets over ${layouts} layouts)`);
  ok(nOutbreak > 3 && nMansion > 3 && nFake > 3 && crestOk > 2, `every set piece shows up (outbreak ${nOutbreak}, mansion ${nMansion}, fake ${nFake}, crest ${crestOk})`);
  // early game: no fake closet on day 1 / sector 1, ever
  for (let s = 1; s <= 40; s++) { const L = generateLayout(s * 313, 'factory', 1.6, null); ok(!C.planFacility(L, { day: 1, quotaIndex: 0 }).fake, 'no ambush on day 1'); }
  say(`placement: ${layouts} layouts, ${nTraps} traps, ${nClosets} closets (outbreak ${nOutbreak}, mansion ${nMansion}), ${nFake} fake, all reachable + deterministic`);
}
{
  // pocket maps
  for (const [id, spec] of Object.entries(MAPS.POCKET_SPECS)) {
    const a = MAPS.analyzeSpec(spec);
    ok(a.errs.length === 0, `${id} map: ${a.errs.join('; ')}`);
    ok(spec.map.length >= 20 && spec.map[0].length >= 30, `${id} is big (${spec.map[0].length * 2} x ${spec.map.length * 2} m)`);
    ok(MAPS.countChars(spec.map, 'X') === 1, `${id} has exactly one closet alcove`);
    ok(MAPS.countChars(spec.map, 'l') + MAPS.countChars(spec.map, 'C') >= 6, `${id} has loot`);
    // bigger on the inside: pocket floor area >> the 4 m x 4 m cell the closet stands in
    const floor = MAPS.tilesOf(spec.map, '.,sFrzwpahlLX').length * 4;
    ok(floor > 16 * 40, `${id} interior ${floor} m2 is far bigger than the closet outside`);
    // entry alcove is a dead-end pocket 1 tile deep with walls on the other three sides
    const e = spec.entry;
    ok(spec.map[e.z][e.x] === 'X' && spec.map[e.z - e.fz][e.x - e.fx] === '#' && spec.map[e.z + e.fx][e.x + e.fz] === '#' && spec.map[e.z - e.fx][e.x - e.fz] === '#', `${id} alcove is enclosed on three sides`);
  }
  const O = MAPS.POCKET_SPECS.outbreak;
  const zN = MAPS.countChars(O.map, 'z');
  ok(zN >= 8 && zN <= 10, `outbreak wing holds ${zN} shamblers`);
  ok(MAPS.countChars(O.map, 'p') === 1, 'exactly one sidearm spot');
  ok(MAPS.countChars(O.map, 'a') === 1, 'one rare ammo box spot');
  ok(MAPS.countChars(O.map, 'T') === 1 && MAPS.countChars(O.map, 'B') === 1 && MAPS.countChars(O.map, 's') >= 30, 'safe room: typewriter, item box, floor');
  ok(MAPS.countChars(O.map, 'h') >= 3, 'herb planters');
  ok(O.traps.length === 1 && O.traps[0].box[2] * 2 >= 6, 'the wing has its own crusher corridor');
  // the pistol is nearer the entry than the first shambler pack is dangerous: BFS distance entry -> pistol < entry -> lab
  const seen = MAPS.reachTiles(O.map, O.entry.x, O.entry.z);
  const pistol = MAPS.tilesOf(O.map, 'p')[0];
  ok(Math.abs(pistol.x - O.entry.x) + Math.abs(pistol.z - O.entry.z) <= 8, 'sidearm is close to the entrance');
  ok(seen.size > 150, 'a big connected wing');
  // the safe room is walled off from creature nav: its floor tiles are 's' (nav blocked), its doorway is the only link
  const sTiles = MAPS.tilesOf(O.map, 's');
  ok(sTiles.every((t) => t.x >= 1 && t.x <= 7 && t.z >= 2 && t.z <= 7), 'safe room floor region');
  const M = MAPS.POCKET_SPECS.mansion;
  ok(M.upper && M.stairs.length === 1 && Math.abs(M.stairs[0].rise - (M.H + M.slab)) < 1e-9, 'mansion has a staircase that climbs exactly one floor');
  ok(MAPS.countChars(M.map, 'D') >= 2 && MAPS.countChars(M.upper.join(''), 'D') >= 1, 'mansion hidden rooms (secret doors)');
  ok(MAPS.countChars(M.map, 'w') >= 3, 'mansion wardens');
  ok(MAPS.reachTiles(M.upper, M.landing.x, M.landing.z).size > 60, 'upper floor is a real floor');
  say('pocket maps: all specials reachable, bigger inside, sidearm near, safe room, stairs');
}

// ================================================================================ 3. chalk: encoding, limits, sync, forger
{
  const m = { id: 7, o: 3, k: 0, x: 12.3456, y: -299.9, z: -4.021, n: 2, r: 37, f: 0, v: 2 };
  const enc = C.encodeMark(m), dec = C.decodeMark(enc);
  ok(enc.length === 10 && enc.every(Number.isInteger), 'encoded mark = 10 integers');
  ok(dec && near(dec.x, 12.35, 1e-9) && near(dec.z, -4.0, 1e-9) && dec.n === 2 && dec.r === 5 && dec.f === 0 && dec.v === 2 && dec.o === 3, 'decode roundtrip (quantised to 5 cm, roll mod 32)');
  ok(C.decodeMark([1, 2, 3]) === null && C.decodeMark(null) === null && C.decodeMark(new Array(10).fill(NaN)) === null, 'garbage does not decode');
  ok(JSON.stringify(C.encodeMark(C.decodeMark(enc))) === JSON.stringify(enc), 'encode is stable');
  const st = new C.ChalkStore();
  const ids = [];
  for (let i = 0; i < 30; i++) { const r = st.add({ o: 0, k: i % 2, x: i, y: 0, z: 0, n: 2, r: 0, f: 0, v: 0 }, 1); ids.push(r.mark.id); }
  ok(st.count(1) === C.CHALK.perPlayer, `per-player limit ${C.CHALK.perPlayer} (oldest evicted)`);
  ok(!st.marks.has(ids[0]) && st.marks.has(ids[29]) && st.marks.size === 24, 'oldest mark of that player went first');
  for (let o = 2; o <= 9; o++) for (let i = 0; i < 24; i++) st.add({ o: 0, k: 0, x: i, y: 0, z: o, n: 2, r: 0, f: 0, v: 0 }, o);
  ok(st.marks.size <= C.CHALK.total, `total cap ${C.CHALK.total} holds (${st.marks.size})`);
  const before = st.count(9);
  for (let i = 0; i < 40; i++) st.add({ o: 0, k: 0, x: 0, y: 0, z: 100 + i, n: 2, r: 0, f: 1, v: 1 }, 0);
  ok(st.fakes.length === C.CHALK.fakeCap, 'fake marks are capped separately');
  ok(st.all().filter((x) => x.f).length === C.CHALK.fakeCap && st.all().filter((x) => x.f).every((x) => x.o === 255), 'fakes carry the fake owner');
  ok(st.count(9) >= before - C.CHALK.total, 'fakes are capped by their own limit');
  // packet size: a full sync stays far below the 12 KB packet cap
  const full = JSON.stringify({ all: st.encodeAll() });
  ok(full.length < 9000, `full chalk sync is ${full.length} bytes (< 9 KB, under the 12 KB packet cap)`);
  // host validation
  const pos = { x: 0, y: -300, z: 0 };
  ok(C.validateDraw({ k: 0, p: [1, -299, 1], n: 2, r: 4 }, pos) !== null, 'a nearby mark is accepted');
  ok(C.validateDraw({ k: 0, p: [30, -299, 1], n: 2, r: 4 }, pos) === null, 'a far mark is rejected');
  ok(C.validateDraw({ k: 0, p: [1, 'x', 1], n: 2, r: 4 }, pos) === null && C.validateDraw(null, pos) === null && C.validateDraw({ p: [1, 2] }, pos) === null, 'malformed requests are rejected');
  const q = C.validateDraw({ k: 99, p: [1, -299, 1], n: 77, r: -3 }, pos);
  ok(q.k <= 1 && q.n <= 5 && q.r >= 0 && q.r < 32, 'out-of-range fields are clamped');
  // basis maths: orthonormal, roll turns the arrow, rollFor inverts markBasis
  for (let n = 0; n < 6; n++) for (const r of [0, 5, 16, 31]) {
    const B = C.markBasis(n, r);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    ok(near(dot(B.dir, B.normal), 0, 1e-9) && near(dot(B.right, B.normal), 0, 1e-9) && near(dot(B.right, B.dir), 0, 1e-9) && near(dot(B.dir, B.dir), 1, 1e-9), `basis orthonormal n${n} r${r}`);
    ok(C.rollFor(n, B.dir) === r, `rollFor inverts the basis (n${n} r${r})`);
  }
  ok(C.normalIndex(0, 1, 0) === 2 && C.normalIndex(0, -1, 0) === 3 && C.normalIndex(-1, 0.1, 0) === 1 && C.normalIndex(0.1, 0, 1) === 4, 'normal quantisation');
  // the forger: erases real arrows, forges fake ones that differ (variant 1 = extra tick) and never touches fakes or X marks
  const fs2 = new C.ChalkStore();
  ok(C.forgerMove(fs2, Math.random) === null, 'nothing to forge on an empty wall');
  fs2.add({ o: 0, k: 1, x: 1, y: 0, z: 1, n: 2, r: 0, f: 0, v: 0 }, 1);
  ok(C.forgerMove(fs2, Math.random) === null, 'X marks are left alone');
  const a = fs2.add({ o: 0, k: 0, x: 5, y: 0, z: 5, n: 2, r: 8, f: 0, v: 0 }, 1).mark;
  let sawErase = false, sawForge = false;
  for (let i = 0; i < 40; i++) {
    const mv = C.forgerMove(fs2, () => i / 40);
    ok(mv && mv.erase === a.id, 'the forger targets the real arrow');
    if (mv.forge) { sawForge = true; ok(mv.forge.f === 1 && mv.forge.v === 1 && mv.forge.r !== a.r && mv.forge.x === a.x, 'fake arrow: same spot, turned, flagged fake with the extra tick'); } else sawErase = true;
  }
  ok(sawErase && sawForge, 'both moves happen (erase only / erase + redraw)');
  const rs = new C.ChalkStore(); rs.add({ o: 0, k: 0, x: 0, y: 0, z: 0, n: 2, r: 0, f: 0, v: 0 }, 1); rs.add({ o: 0, k: 0, x: 0, y: 0, z: 1, n: 2, r: 0, f: 1, v: 1 }, 0);
  ok(C.forgerMove(rs, () => 0.9).erase === rs.all().find((x) => !x.f).id, 'only real arrows are candidates');
  // fakes never evict reals
  const ev = new C.ChalkStore(); for (let i = 0; i < 24; i++) ev.add({ o: 0, k: 0, x: i, y: 0, z: 0, n: 2, r: 0, f: 0, v: 0 }, 1);
  for (let i = 0; i < 30; i++) ev.add({ o: 0, k: 0, x: 0, y: 0, z: i, n: 2, r: 0, f: 1, v: 1 }, 0);
  ok(ev.count(1) === 24, 'forged marks never evict the crew\'s marks');
  ok(ev.nearest(3, 0, 0, 0.5, false)?.x === 3 && ev.nearest(0, 0, 25, 0.5, true)?.f === 1, 'nearest lookup respects fake-ness');
  say('chalk: encode / decode, limits (24 per player, 160 total), fake cap, validation, basis maths, forger rules, packet size');
}

// ================================================================================ 4. creature balance
{
  const Z = C.HR_DEFS.hr_zombie, PLAYER_WALK = 5.0, PLAYER_CROUCH = 2.6;
  ok(Z.hp <= 50, `zombie is fragile (${Z.hp} hp)`);
  ok(Z.run < PLAYER_CROUCH && Z.walk < Z.run, `zombie is slower than a crouching player (run ${Z.run})`);
  ok(Z.dmg <= 15 && Z.pack[0] >= 3, 'weak hitter that comes in groups');
  ok(C.HEADSHOT_MUL >= 2, 'headshots are worth more than double');
  const PISTOL = 17, BAT = 22, KNIFE = 9;
  ok(C.SHOTS_TO_KILL(Z.hp, PISTOL) === 3 && C.SHOTS_TO_KILL(Z.hp, PISTOL, C.HEADSHOT_MUL) === 2, 'pistol: 3 body shots or 2 headshots');
  ok(C.SHOTS_TO_KILL(Z.hp, BAT) === 2 && C.SHOTS_TO_KILL(Z.hp, KNIFE) === 5, 'bat 2 hits, knife 5');
  const wing = MAPS.countChars(MAPS.POCKET_SPECS.outbreak.map, 'z');
  const magDamage = C.SIDEARM.rounds * PISTOL * C.HEADSHOT_MUL;
  ok(wing * Z.hp > magDamage, `one magazine (${C.SIDEARM.rounds} rounds, all headshots = ${Math.round(magDamage)} dmg) cannot clear ${wing} shamblers (${wing * Z.hp} hp): kill the ones in your way, then run`);
  const withBox = (C.SIDEARM.rounds + C.SIDEARM.boxRounds) * PISTOL;
  ok(withBox < wing * Z.hp, 'even the rare ammo box does not clear the wing with body shots');
  ok(C.SIDEARM.rounds === 8 && C.SIDEARM.boxRounds <= 8, 'little ammo: 8 loaded + a small rare box');
  ok(C.ZOMBIE.breakHit * Z.hp <= PISTOL && C.ZOMBIE.breakHit * Z.hp <= KNIFE * 1.0 + 0.5, 'any real hit shoves a grabbing zombie off');
  ok(C.ZOMBIE.grabSec * (C.ZOMBIE.grabDmg / C.ZOMBIE.grabTick) + Z.dmg < 30, `a full grab costs ${Math.round(C.ZOMBIE.grabSec / C.ZOMBIE.grabTick * C.ZOMBIE.grabDmg + Z.dmg)} hp at most (survivable)`);
  const AM = C.HR_DEFS.hr_ambusher, FG = C.HR_DEFS.hr_forger, WD = C.HR_DEFS.hr_warden;
  ok(FG.hp <= 80 && FG.dmg <= 25, 'the Forger is a saboteur, not a killer');
  ok(AM.run < 6.5 && AM.hp >= 120, 'the Closet Thing can be outrun but not trivially killed');
  ok(WD.run <= 5.5 && WD.dmg <= 30, 'wardens are fair melee guards');
  for (const [id, d] of Object.entries(C.HR_DEFS)) ok(d.noSpawn && d.noHunt && d.zone === 'in' && d.name && d.lore && d.deathText, `${id} is a hand-placed indoor creature with lore + death text`);
  say('creature balance: shambler ' + Z.hp + ' hp, slower than crouching, wing needs more than one magazine');
}

// ================================================================================ 5. fake closet rules
{
  const o = C.fakeOutcome('open', 1.2);
  ok(o.lethal && o.lunge < 0.4, 'opened by hand from right in front: lethal, almost no time');
  ok(!C.fakeOutcome('open', 4).lethal, 'opening from far away is never lethal');
  const h = C.fakeOutcome('hook', 3.2);
  ok(!h.lethal && h.lunge >= 0.8, 'hooked open from range: telegraphed and out of the lunge');
  ok(C.fakeOutcome('hook', 1.5).lethal, 'a hook does not save you if you stand right there');
  const k = C.fakeOutcome('knock', 1.0);
  ok(!k.lethal && k.answers && k.lunge >= 1.0, 'knocking first: it answers, then bursts out non-lethally');
  ok(C.fakeOutcome('nope', 1) === null, 'unknown mode');
  ok(C.openerMode({ crouch: true, longTool: true }) === 'knock' && C.openerMode({ crouch: false, longTool: true }) === 'hook' && C.openerMode({}) === 'open', 'opener modes');
  ok(C.FAKE.hookReach > C.FAKE.lungeReach + 1 && C.FAKE.minDay >= 2, 'long tools out-reach the lunge; not before day 2');
  say('fake closet: open = lethal, hook / knock = counterplay');
}

// ================================================================================ 6. translations: every t() / tf() / sys() key in the module has TR + RU
{
  const files = ['horror.js', 'horror_traps.js', 'horror_host.js', 'horror_core.js', 'horror_creatures.js', 'horror_closet.js', 'horror_pocket.js', 'horror_chalk.js'].map((f) => new URL('../../src/game/' + f, import.meta.url));
  const keys = new Set();
  const re = /\b(?:t|tf|sys)\(\s*'((?:[^'\\]|\\.)*)'/g;
  for (const f of files) { const s = fs.readFileSync(f, 'utf8'); let mm; while ((mm = re.exec(s))) keys.add(mm[1].replace(/\\u25AE/g, '▮').replace(/\\'/g, '\'')); }
  ok(keys.size > 30, `found ${keys.size} translatable strings`);
  for (const k of keys) { ok(k in TR, `TR missing: ${k}`); ok(k in RU, `RU missing: ${k}`); }
  for (const id of C.TRAP_IDS) for (const f of ['name', 'blurb']) { ok(C.TRAPS[id][f] in TR && C.TRAPS[id][f] in RU, `trap ${id} ${f} translated`); }
  for (const [id, d] of Object.entries(C.HR_DEFS)) for (const f of ['name', 'lore', 'deathText']) ok(d[f] in TR && d[f] in RU, `${id} ${f} translated`);
  for (const k of Object.values(TIP)) ok(k in TR && k in RU, 'item tip translated: ' + k.slice(0, 30));
  for (const k of Object.values(DEATH_TEXT)) ok(k in TR && k in RU, 'death text translated: ' + k.slice(0, 30));
  for (const s of ['OFFLINE', 'ARMED', 'WARNING', 'ACTIVE', 'RECHARGE', 'DEPLETED', 'Chalk', 'Wolf Crest', 'Sealed Sample Case', 'Green Herb']) ok(s in TR && s in RU, 'label translated: ' + s);
  // placeholders survive translation
  for (const [k, v] of Object.entries(TR)) { const a = (k.match(/\{@?\w+\}/g) || []).sort().join(), b = (v.match(/\{@?\w+\}/g) || []).sort().join(); ok(a === b, `TR placeholders match: ${k.slice(0, 40)}`); }
  for (const [k, v] of Object.entries(RU)) { const a = (k.match(/\{@?\w+\}/g) || []).sort().join(), b = (v.match(/\{@?\w+\}/g) || []).sort().join(); ok(a === b, `RU placeholders match: ${k.slice(0, 40)}`); }
  say(`i18n: ${keys.size} strings + data fields have TR + RU, placeholders intact`);
}

console.log(fails ? `\n${fails} FAILED of ${checks} checks` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
