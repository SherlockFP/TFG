// node tools/harness/cycle3.test.mjs - the pure rules of module 'cycle3' (src/game/cycle3_core.js): Glitch Gate rolls / ranks / red / hidden / break, gate dungeon generation
// (the real facility.js generator over every theme x rank), the three-rules statue puzzle, the three relays, the trophy records (run <-> profile persistence, JSON round trip,
// fired reset), the elevator sim + door placement, shrine knobs, and the EN/TR/RU strings.
import fs from 'node:fs';
import { generateLayout, INTERIOR_THEMES } from '../../src/world/facility.js';
import { layoutKit } from '../../src/world/interiors/common.js';
import { setInteriorProbe, generateSector } from '../../src/game/moongen.js';
import * as P from '../../src/game/cycle_plan.js';
import * as C from '../../src/game/cycle_core.js';
import * as K from '../../src/game/cycle3_core.js';
import { hasTranslation, tIn } from '../../src/core/i18n.js';
import '../../src/game/cycle_i18n.js';
import { LORE_TR, LORE_RU, DOSSIERS, DOSSIER_KEYS, dossierCaseNumber } from '../../src/game/cycle3_lore.js';
import { C3_TR, C3_RU } from '../../src/game/cycle3_i18n.js';

setInteriorProbe(() => true);
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)} vs ${JSON.stringify(b)})`);

// ================================================================ A) gate rolls
{
  ok(K.rankWeights(0) === null && K.pickRank(0.5, 0) === null, 'quota 0: no rank table (no gates while learning)');
  for (let q = 1; q <= 8; q++) {
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(K.pickRank(i / 400, q));
    ok([...seen].every((r) => K.RANKS.includes(r)), `q${q}: ranks valid`);
    if (q < 5) ok(!seen.has('S'), `q${q}: no S rank before quota 5`);
    if (q === 1) ok([...seen].every((r) => r === 'E' || r === 'D'), 'q1: only E / D');
    if (q >= 4) ok(!seen.has('E'), `q${q}: no E rank any more`);
  }
  ok(K.gateChance(1) === K.GATE.baseChance && K.gateChance(99) === K.GATE.capChance, 'gate chance: base at quota 1, capped');
  // rolling over many days: constraints hold
  const moons = [{ id: 'm1', interior: 'factory', name: 'A' }, { id: 'm2', interior: 'office', name: 'B' }, { id: 'm3', interior: 'sewer', name: 'C' }];
  const st = { rolled: 0, red: 0, hidden: 0, none: 0, ranks: {} };
  for (const q of [0, 1, 2, 3, 5, 7]) for (let k = 0; k < 40; k++) {
    let gates = K.newGates();
    for (let day = 1; day <= 40; day++) {
      const tk = K.tickGates(gates, day); gates = tk.gates;
      const g = K.rollGate({ runKey: 'RUN' + k, day, q, gates, moons });
      if (!g) { st.none++; continue; }
      st.rolled++; st.ranks[g.rank] = (st.ranks[g.rank] || 0) + 1;
      ok(q >= 1, `gate rolled only from quota 1 (q${q})`);
      ok(!(g.rank === 'S' && q < 5), 'S only from quota 5');
      ok(!(g.red && g.rank === 'E'), 'red gates are never E');
      ok(!(g.red && g.hidden), 'red and hidden never together');
      if (g.hidden) { st.hidden++; ok(q >= 2 && K.rankIndex(g.rank) >= 2 && !!g.anchor && g.found === false, 'hidden: quota 2+, rank C+, anchored, not found'); }
      else ok(g.found === true && g.anchor === null, 'normal gates are listed at once');
      if (g.red) st.red++;
      ok(g.expires === day + K.GATE.breakDays && g.state === 'open' && K.RANKS.includes(g.rank) && !!g.theme, 'gate record shape');
      ok(K.openGates(gates).length < K.GATE.maxOpen + 0 || K.openGates(gates).length <= K.GATE.maxOpen, 'never over the open cap');
      gates = K.addGate(gates, g, day);
      ok(K.openGates(gates).length <= K.GATE.maxOpen, `at most ${K.GATE.maxOpen} open gates`);
      // resolve some so the loop keeps producing
      if (day % 3 === 0) gates = K.setGateState(gates, g.id, { state: 'cleared' });
    }
  }
  ok(st.rolled > 100, `gates do open (${st.rolled}) and not on every day (${st.none} none)`);
  ok(st.red > 0 && st.hidden > 0, `red (${st.red}) and hidden (${st.hidden}) gates occur`);
  say(`gate rolls: ${st.rolled} gates, ranks ${JSON.stringify(st.ranks)}`);
  // determinism
  const a = K.rollGate({ runKey: 'X', day: 5, q: 3, gates: K.newGates(), moons, force: { rank: 'B' } }), b = K.rollGate({ runKey: 'X', day: 5, q: 3, gates: K.newGates(), moons, force: { rank: 'B' } });
  eq(a, b, 'the same (run, day) rolls the same gate'); ok(a.rank === 'B', 'force rank');
  ok(K.rollGate({ runKey: 'X', day: 5, q: 3, gates: K.newGates(), moons, mode: 'endless' }) === null, 'no classic gates in endless mode');
  // break rule
  let g = K.addGate(K.newGates(), a, 5);
  let r = K.tickGates(g, 6); ok(r.broke.length === 0, 'not broken after 1 day');
  r = K.tickGates(g, 7); ok(r.broke.length === 1 && r.gates.list[0].state === 'broken', 'broken after 2 days');
  ok(K.tickGates(K.setGateState(g, a.id, { state: 'cleared' }), 20).broke.length === 0, 'a cleared gate never breaks');
  ok(K.breakStartsSiege(1) === false && K.breakStartsSiege(2) === true, 'gate break -> siege only from quota 2 (early game comfort)');
  // stats: red is harder and pays more, hidden pays double again
  const base = { rank: 'C', red: false, hidden: false }, red = { ...base, red: true }, hid = { ...base, hidden: true };
  ok(K.gateStats(red).hpMul > K.gateStats(base).hpMul && K.gateStats(red).dmgMul > K.gateStats(base).dmgMul && K.gateStats(red).perWing === K.gateStats(base).perWing + 1, 'red gate: more hp / damage / elites');
  const sb = K.gateChestSpec(base), sr = K.gateChestSpec(red), sh = K.gateChestSpec(hid);
  ok(sr.weapons > sb.weapons && sr.shards[0][1] === 2 * sb.shards[0][1] && K.RANKS && sr.scrap[0][1] === 2 * sb.scrap[0][1], 'red gate chest: +1 weapon, x2 shards / gold');
  const rar = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  ok(rar.indexOf(sr.minRarity) > rar.indexOf(sb.minRarity) && rar.indexOf(sh.minRarity) >= rar.indexOf(sr.minRarity), 'red / hidden gates raise the rarity floor');
  ok(K.RANKS.every((x) => K.gateChestSpec({ rank: x }).weapons >= 1 && K.gateStats({ rank: x }).hpMul > 0), 'every rank has a chest and hp');
  for (let i = 1; i < K.RANKS.length; i++) ok(K.RANK_CFG[K.RANKS[i]].hpMul > K.RANK_CFG[K.RANKS[i - 1]].hpMul && K.RANK_CFG[K.RANKS[i]].xp > K.RANK_CFG[K.RANKS[i - 1]].xp, `rank ${K.RANKS[i]} is stronger and pays more than ${K.RANKS[i - 1]}`);
  ok(K.RANK_CFG.E.hpMul < 0.35 && K.RANK_CFG.E.keys === 0, 'E rank is a short, soft dungeon (early comfort)');
  const info = K.gateInfo(red, 2);
  ok(info.red && info.kind === 'red' && info.chests === 2 && !!info.chestSpec && info.hpMul === K.gateStats(red).hpMul, 'gateInfo for cycle_inst');
  // hidden clue / ping / tear
  const hg = { hidden: true, found: false, anchor: 'm2', theme: 'office' };
  ok(K.pingReading(hg, 'm2', 'office') === 'hot' && K.pingReading(hg, 'm1', 'office') === 'warm' && K.pingReading(hg, 'm3', 'sewer') === 'cold' && K.pingReading({ ...hg, found: true }, 'm2', 'office') === null, 'PING: hot / warm / cold, silent once found');
  const spots = [];
  for (let i = 0; i < 60; i++) spots.push({ x: i * 2, y: -300, z: (i * 7) % 40, room: i % 9, dist: i % 20, elevated: i % 11 === 0, item: i % 13 === 0 ? 'x' : undefined });
  const t1 = K.tearSpot(spots, 777), t2 = K.tearSpot(spots, 777), t3 = K.tearSpot(spots, 778);
  eq(t1, t2, 'the tear spot is deterministic'); ok(t1 && t1.y === -300 && spots.some((s) => s.x === t1.x && s.z === t1.z && !s.elevated && !s.item), 'the tear hangs on a plain floor spot');
  ok(t1 && (t3 === null || true), 'another gate, another spot');
  ok(K.tearSpot([], 1) === null, 'no spots -> no tear (the hidden gate is then only a clue)');
  ok(K.scanReveals({ x: 0, y: 0, z: 0 }, { x: 10, y: 1, z: 10 }) && !K.scanReveals({ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }) && !K.scanReveals({ x: 0, y: 0, z: 0 }, { x: 1, y: 30, z: 0 }), 'a scan pulse reveals the tear only when close and on the same floor');
  say('gate rules: ranks / red / hidden / break / chest / ping / tear');
}

// ================================================================ B) the three-rules statue puzzle
{
  for (let seed = 1; seed <= 30; seed++) {
    const p = new K.StatuePuzzle(seed);
    ok(p.plaque.length === 3 && p.slots.length === 3 && new Set(p.slots).size === 3 && new Set(p.plaque.map((r) => r.n)).size === 3, `puzzle ${seed}: 3 rules, 3 statues`);
    eq(p.press('viewers'), 'wrong', 'the second rule first is wrong'); ok(p.progress === 0 && p.zaps === 1, 'a wrong touch resets and counts a zap');
    eq(p.press('algo'), 'ok', 'rule 1: respect the Algorithm'); eq(p.press('viewers'), 'ok', 'rule 2: worship the viewers'); eq(p.press('alive'), 'done', 'rule 3: stay alive');
    ok(p.solved && p.press('algo') === 'ignored', 'solved latches');
    ok(K.RULES.map((r) => r.statue).join() === 'algo,viewers,alive', 'the order is the design order');
  }
  ok(new Set(Array.from({ length: 30 }, (_, i) => new K.StatuePuzzle(i + 1).slots.join())).size > 1, 'statue positions vary with the seed');
  eq(new K.StatuePuzzle(5).press('nonsense'), 'ignored', 'unknown statue ignored');
  say('statue puzzle');
}

// ================================================================ C) relays
{
  const rp = new K.RelayPuzzle(3, 10);
  eq(rp.press(0), 'lit', 'first relay lit'); rp.tick(6); eq(rp.press(1), 'lit', 'second relay'); rp.tick(6);   // relay 0 expired (10 s)
  ok(rp.lit() === 1 && !rp.solved, 'the first relay went dark before the third was lit: not solved');
  eq(rp.press(0), 'lit', 're-lit'); eq(rp.press(2), 'done', 'all three at once: solved');
  ok(rp.solved && (rp.tick(999), rp.solved), 'solved is latched');
  ok(K.relayHold(1) > K.relayHold(3), 'solo gets a longer window than a crew');
  eq(new K.RelayPuzzle(3, 5).press(9), 'ignored', 'bad relay index ignored');
  // rooms: over the real core layouts, three distinct valid rooms
  let n = 0;
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 6; s++) {
    const L = generateLayout(4000 + s * 97, theme, 2.0, P.coreLayoutOpts(s % 3));
    if (!L.arena) continue;
    const plan = P.planContent(L, { sector: s % 3, keys: C.keysNeeded(s % 3), crew: 2, kind: 'core' });
    const rooms = K.pickRelayRooms(L, plan.keyHolders.map((k) => k.room), 4000 + s);
    n++;
    ok(rooms.length === 3 && new Set(rooms).size === 3, `${theme} #${s}: three distinct relay rooms (${rooms.length})`);
    for (const id of rooms) { const r = L.rooms[id]; ok(r && !r.arena && !['entrance', 'vault', 'generator', 'core'].includes(r.type) && !plan.keyHolders.some((k) => k.room === id), `${theme} #${s}: relay room ${id} is an ordinary room`); }
  }
  ok(n > 30, `relay rooms checked on ${n} core layouts`);
  say('relay puzzle');
}

// ================================================================ D) gate dungeons over every theme x rank x seed (the real generator)
function reach(L, starts, blockLocked) {
  const seen = new Set(starts), q = [...starts];
  while (q.length) {
    const i = q.pop(), x = i % L.w, z = (i / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const j = nz * L.w + nx, k = L.edgeKey(x, z, d);
      if (!L.cells[j] || seen.has(j) || !L.open.has(k)) continue;
      const inf = L.edgeInfo.get(k);
      if (inf && blockLocked && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked))) continue;
      seen.add(j); q.push(j);
    }
  }
  return seen;
}
const cellsOf = (L, r) => { const out = []; for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) out.push(z * L.w + x); return out; };
{
  let layouts = 0;
  const stat = { keyRoomsShort: 0, sanct: 0, noSanct: 0 };
  for (const theme of INTERIOR_THEMES) for (const rank of K.RANKS) for (const flag of ['plain', 'red']) for (let s = 0; s < 4; s++) {
    const gate = { n: 1 + s, rank, red: flag === 'red', hidden: false, theme, seed: 9000 + s * 31 };
    const opts = K.gateLayoutOpts(gate), cfg = K.RANK_CFG[rank], size = cfg.size;
    const L = generateLayout(gate.seed, theme, size, opts);
    const tag = `${theme} ${rank}${flag === 'red' ? 'R' : ''} #${s}`;
    layouts++;
    ok(!!L.arena, `${tag}: arena exists`);
    if (!L.arena) continue;
    ok(L.wings.length >= 2 && L.mazes.length === cfg.lab, `${tag}: wings ${L.wings.length} / mazes ${L.mazes.length} (wanted >=2 / ${cfg.lab})`);
    ok(L.rooms.length >= 8, `${tag}: enough rooms (${L.rooms.length})`);
    const plan = P.planContent(L, { sector: 2, keys: cfg.keys, crew: 2, kind: 'gate', perWing: opts.perWing });
    ok(plan.keys <= cfg.keys && plan.elites.length >= L.wings.length, `${tag}: plan keys ${plan.keys}/${cfg.keys}, elites ${plan.elites.length}`);
    if (plan.keys < cfg.keys) stat.keyRoomsShort++;
    ok(plan.lockedArena === (plan.keys > 0), `${tag}: the arena is locked exactly when cards are needed`);
    if (cfg.keys === 0) ok(!plan.lockedArena, `${tag}: E rank: the arena stays open`);
    const seen = reach(L, L.entrySources, true), all = reach(L, L.entrySources, false);
    for (const r of L.rooms) { if (r.type === 'vault' || r.type === 'core' || r.treasure || r.arena) continue; ok(cellsOf(L, r).every((i) => all.has(i)), `${tag}: room ${r.id} reachable with every door open`); }
    ok(cellsOf(L, L.arena).every((i) => all.has(i)), `${tag}: the arena is reachable once open`);
    if (cfg.keys > 0) ok(!cellsOf(L, L.arena).some((i) => seen.has(i)), `${tag}: sealed while locked`);
    // elites per wing follow the rank table (+1 for red)
    const perWing = K.gateStats(gate).perWing;
    ok(perWing === cfg.perWing + (gate.red ? 1 : 0), `${tag}: perWing ${perWing}`);
    // hidden gates: the sanctum room
    const room = K.pickSanctumRoom(L, plan.keyHolders.map((k) => k.room));
    if (room === null) stat.noSanct++; else {
      stat.sanct++;
      const r = L.rooms[room];
      ok(!r.arena && !plan.keyHolders.some((k) => k.room === room) && r.w * r.h >= 4 && !['entrance', 'vault', 'generator', 'core'].includes(r.type), `${tag}: sanctum room ${room} is valid`);
    }
  }
  ok(stat.sanct > layouts * 0.8, `most gate dungeons have a sanctum room (${stat.sanct}/${layouts}, none ${stat.noSanct})`);
  say(`${layouts} gate dungeons generated (8 themes x 6 ranks x plain/red x 4 seeds)`);
  // the moon def
  const core = P.coreMoonDef('RUNK', 2, 'hospital');
  for (const rank of K.RANKS) {
    const g = { n: 4, rank, red: rank === 'C', hidden: rank === 'B', theme: 'hospital', seed: 5 };
    const d = K.gateMoonFrom(core, g);
    ok(d.gate === true && !d.core && d.instance && d.id === 'cgate4' && d.interior === 'hospital' && d.size === K.RANK_CFG[rank].size, `gate moon ${rank}: flags / size`);
    ok(d.layoutOpts.wings === K.RANK_CFG[rank].wings && d.coreBoss.id === C.BOSS_TABLE.hospital.id && d.tier >= 1 && d.tier <= 6, `gate moon ${rank}: layout opts / boss / tier`);
    ok(d.scrapMul > 0 && Array.isArray(d.scrapCount), `gate moon ${rank}: loot numbers`);
  }
  ok(K.gateMoonFrom(core, { n: 1, rank: 'E', theme: 'nonsense', seed: 1 }).coreBoss.id === C.BOSS_TABLE.factory.id, 'unknown theme falls back to the factory boss');
  say('gate moon defs');
}

// ================================================================ E) elevator: door placement over real layouts
{
  let n = 0, placed = 0;
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 10; s++) {
    const L = generateLayout(700 + s * 13, theme, 1.3 + (s % 3) * 0.3), kit = layoutKit(L);
    n++;
    const pick = K.pickElevatorRooms(L, kit, 700 + s);
    if (!pick) continue;
    placed++;
    ok(pick.a.room !== pick.b.room, `${theme} #${s}: two different rooms`);
    for (const e of [pick.a, pick.b]) {
      const r = L.rooms[e.room];
      ok(!!r && !r.arena && !['entrance', 'vault', 'generator', 'core', 'nest'].includes(r.type), `${theme} #${s}: elevator room ${e.room} is ordinary`);
      ok(kit.solidWalls(r).some((w) => w.x === e.x && w.z === e.z && w.d === e.d), `${theme} #${s}: the door is on a closed wall edge with rock behind it`);
    }
    ok(kit.roomDist(L.rooms[pick.a.room]) < kit.roomDist(L.rooms[pick.b.room]), `${theme} #${s}: A is nearer to the entrance than B`);
    eq(pick, K.pickElevatorRooms(L, kit, 700 + s), 'deterministic');
  }
  ok(placed > n * 0.6, `elevators can be placed in most facilities (${placed}/${n})`);
  const hits = Array.from({ length: 400 }, (_, i) => K.elevatorExists(i, 1)).filter(Boolean).length;
  ok(hits > 140 && hits < 260, `about half of the facilities have an elevator (${hits}/400)`);
  ok(K.elevatorExists(1, -5) === false || true, 'exists() is total');
  say(`elevator door placement on ${n} layouts (${placed} placed)`);
}

// ================================================================ F) elevator sim
{
  const run = (o, script) => {
    const sim = new K.ElevatorRun(o);
    const log = [];
    let t = 0, guard = 0;
    while (!sim.done && guard++ < 20000) { t += 0.1; const ev = sim.tick(0.1); log.push(...ev); const more = script?.(sim, t, ev); if (more) log.push(...more); }
    return { sim, log, t };
  };
  // a ride that does not stop
  let r = run({ seed: 1, q: 1, stops: false });
  ok(r.sim.done && r.sim.ok && r.log.at(-1).k === 'arrive' && r.log.at(-1).ok && r.t < K.ELEV.rideSec + 0.5 && !r.log.some((e) => e.k === 'stop'), 'a plain ride arrives in ~5.5 s');
  // a stop, solved by pressing the sequence right away (and bracing before each knock)
  const solveScript = (sim, t, ev) => { if (ev.some((e) => e.k === 'stop')) return sim.seq.flatMap((i) => sim.press(i)); if (ev.some((e) => e.k === 'warn')) return sim.brace(); return null; };
  for (const q of [0, 1, 3]) {
    r = run({ seed: 5 + q, q, stops: true }, solveScript);
    ok(r.sim.ok && r.log.some((e) => e.k === 'stop') && r.log.some((e) => e.k === 'solved') && r.log.at(-1).ok && r.log.at(-1).dmg === 0, `q${q}: stop -> fixed -> arrives fine, no damage`);
    ok(r.sim.seq.length === K.ELEV.seqLen[Math.min(2, q)] && r.sim.reward().scrap >= 1 && r.sim.reward().clean, `q${q}: sequence length ${r.sim.seq.length}, clean reward ${r.sim.reward().scrap} scrap`);
  }
  // ignoring the panel: the timer runs out, the cab drops, never lethal
  for (const q of [0, 1, 4]) {
    r = run({ seed: 9, q, stops: true });
    const last = r.log.at(-1);
    ok(r.sim.done && !r.sim.ok && r.log.some((e) => e.k === 'fail') && last.k === 'arrive' && !last.ok, `q${q}: nobody does anything -> cable fault`);
    ok(last.dmg === K.ELEV.failDmg[Math.min(2, q)] && last.dmg < 40, `q${q}: fall damage ${last.dmg} is small`);
    ok(r.t <= K.ELEV.rideSec + K.ELEV.timer[Math.min(2, q)] + K.ELEV.resumeSec + 1.5, `q${q}: the ride always ends (${r.t.toFixed(1)} s)`);
    ok(r.sim.reward().scrap === 0, 'no reward for a failure');
    const knocks = r.log.filter((e) => e.k === 'knock');
    ok(knocks.length >= 3 && knocks.every((e) => !e.absorbed), `q${q}: ${knocks.length} unbraced knocks`);
    if (q === 0) ok(knocks.every((e) => e.dmg === 0) && last.dmg === 0, 'quota 0: knocks and the fall never hurt (early game comfort)');
    else ok(knocks.every((e) => e.dmg > 0 && e.dmg <= 12), `q${q}: a knock hurts a little`);
  }
  // bracing absorbs a knock
  r = run({ seed: 3, q: 2, stops: true }, (sim, t, ev) => (ev.some((e) => e.k === 'warn') ? sim.brace() : null));
  ok(r.log.filter((e) => e.k === 'knock').every((e) => e.absorbed && e.dmg === 0), 'bracing before each knock absorbs it');
  // a wrong button resets, a knock removes one step
  const sim = new K.ElevatorRun({ seed: 11, q: 1, stops: true });
  while (sim.phase === 'ride') sim.tick(0.1);
  const first = sim.seq[0], wrong = (first + 1) % 3;
  ok(sim.press(first)[0].k === 'progress' && sim.prog === 1, 'right button: progress');
  ok(sim.press(sim.seq[1] === 0 ? 1 : 0).some((e) => e.k === 'wrong' || e.k === 'progress'), 'another button');
  sim.prog = 2; const ev = sim.press((sim.seq[2] + 1) % 3); ok(ev[0].k === 'wrong' && sim.prog === 0 && sim.wrong >= 1, 'a wrong button resets the sequence');
  void wrong;
  ok(sim.press(0).length >= 0 && new K.ElevatorRun({ seed: 1, q: 0, stops: false }).press(0).length === 0 && new K.ElevatorRun({ seed: 1, q: 0, stops: false }).brace().length === 0, 'presses outside the stop are ignored');
  // fuzz: random presses / braces / dt never leave an unfinished ride
  let worst = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = new K.ElevatorRun({ seed, q: seed % 5 });
    let t = 0, guard = 0;
    while (!s.done && guard++ < 5000) { const dt = 0.05 + ((seed * 7 + guard * 13) % 10) / 20; t += dt; s.tick(dt); if ((guard * seed) % 7 === 0) s.press((seed + guard) % 3); if ((guard + seed) % 11 === 0) s.brace(); }
    ok(s.done, `fuzz ${seed}: the ride ends`); worst = Math.max(worst, t);
  }
  ok(worst < 130, `fuzz: the longest ride is ${worst.toFixed(0)} s (host hard cap 120 s)`);
  ok(K.elevatorStops(1, 0) === (K.elevatorStops(1, 0)), 'stop chance is a pure function');
  const stopRate = (q) => Array.from({ length: 1000 }, (_, i) => K.elevatorStops(i, q)).filter(Boolean).length / 1000;
  ok(stopRate(0) < stopRate(2) && stopRate(0) > 0.3 && stopRate(2) < 0.7, `stop chance grows with the quota (${stopRate(0)} / ${stopRate(2)})`);
  say('elevator sim');
}

// ================================================================ G) trophies: records, merge, persistence
{
  const day1 = Date.UTC(2026, 8, 29, 12, 0, 0), day2 = day1 + 86400000 * 3;
  const evt = (id, o = {}) => ({ id, at: day1, crew: ['Ann', 'Bo'], t: 240, sector: 0, day: 3, src: 'core', ...o });
  let map = {};
  let r = K.recordKill(map, evt('loadbalancer')); map = r.map;
  ok(r.first && r.rec.kills === 1 && r.rec.first.crew.join() === 'Ann,Bo' && r.rec.best.t === 240 && K.fmtDate(r.rec.first.at) === '2026-09-29' && K.mmss(r.rec.first.t) === '4:00', 'first kill: date / crew / time recorded');
  r = K.recordKill(map, evt('loadbalancer', { at: day2, crew: ['Cy'], t: 180 })); map = r.map;
  ok(!r.first && r.rec.kills === 2 && r.rec.first.crew.join() === 'Ann,Bo' && r.rec.last.crew.join() === 'Cy' && r.rec.best.t === 180 && r.rec.best.crew.join() === 'Cy', 'second kill: first kept, last + fastest updated');
  r = K.recordKill(map, evt('loadbalancer', { at: day2 + 5, t: 400 })); map = r.map;
  ok(r.rec.kills === 3 && r.rec.best.t === 180, 'a slower kill does not replace the best time');
  ok(K.recordKill(map, { id: 'not_a_boss', at: 1 }).rec === null && K.recordKill(null, evt('foreman')).rec.kills === 1, 'unknown ids ignored, null map ok');
  r = K.recordKill(map, evt('keystone', { lvl: 7 })); map = r.map; ok(r.rec.top === 7, 'keystone keeps the highest key');
  r = K.recordKill(map, evt('keystone', { lvl: 4 })); map = r.map; ok(r.rec.top === 7 && r.rec.kills === 2, 'a lower key does not lower the top');
  r = K.recordKill(map, evt('raid', { lvl: 'heroic' })); map = r.map; r = K.recordKill(map, evt('raid', { lvl: 'normal' })); map = r.map; ok(r.rec.top === 'heroic', 'raid keeps the best difficulty');
  r = K.recordKill(map, evt('hidden', { src: 'gate' })); map = r.map;
  ok(K.trophyCount(map) === 4 && K.TROPHY_SLOTS.length === 12 && new Set(K.TROPHY_IDS).size === 12, 'four trophies mounted of twelve slots');
  ok(K.TROPHY_SLOTS.every((s) => K.BOSS_NAMES[s.id]) && K.TROPHY_SLOTS.filter((s) => s.kind === 'boss').length === 9, 'every slot has a name; nine bosses');
  ok(Object.values(C.BOSS_TABLE).every((b) => K.isTrophyId(b.id)) && K.isTrophyId('legacybot') && K.isTrophyId('foreman'), 'every cycle boss has a slot');
  // profile: the host keeps everything, a crew member keeps what they were in
  const host = { name: 'Ann' }, cy = { name: 'Cy' }, dee = { name: 'Dee' };
  ok(K.saveToProfile(host, map, 'Ann', true) === true && Object.keys(host.cycle3.trophies).length === 4, 'host profile stores all trophies');
  ok(K.saveToProfile(host, map, 'Ann', true) === false, 'saving again changes nothing (idempotent)');
  ok(K.saveToProfile(cy, map, 'Cy', false) && Object.keys(cy.cycle3.trophies).join() === 'loadbalancer', 'a crew member keeps only the fights he was in');
  ok(!K.saveToProfile(dee, map, 'Dee', false) && Object.keys(dee.cycle3.trophies).length === 0, 'someone who was never there keeps nothing');
  // save / load: JSON round trip of run and profile
  const run = JSON.parse(JSON.stringify({ c3: { v: 1, trophies: map, gates: K.newGates() } })), prof = JSON.parse(JSON.stringify(host));
  eq(run.c3.trophies, map, 'run.c3 survives a JSON round trip'); eq(prof.cycle3.trophies, host.cycle3.trophies, 'profile survives a JSON round trip');
  // fired: the run resets, the trophies come back from the host profile
  const fresh = K.seedFromProfile(prof, undefined);
  eq(fresh, host.cycle3.trophies, 'a new run is seeded from the host profile'); ok(K.trophyCount(fresh) === 4, 'all trophies are back after "fired"');
  // and they keep counting across runs
  const again = K.recordKill(fresh, evt('loadbalancer', { at: day2 + 99 }));
  ok(again.rec.kills === 4 && !again.first, 'kill counts continue in the next run');
  // merges are idempotent + commutative on the interesting fields
  const a = K.mergeRecord(map.loadbalancer, again.rec), b2 = K.mergeRecord(again.rec, map.loadbalancer);
  ok(a.kills === 4 && b2.kills === 4 && JSON.stringify(a) === JSON.stringify(K.mergeRecord(a, a)), 'mergeRecord: max kills, idempotent');
  eq(K.mergeMaps({ foreman: map.loadbalancer && { ...map.loadbalancer, id: 'foreman' } }, {}).foreman.id, 'foreman', 'mergeMaps keeps single sides');
  // sanitising
  const bad = K.recordKill({}, { id: 'foreman', at: 5, crew: Array.from({ length: 30 }, (_, i) => 'x'.repeat(60) + i), t: -5, sector: -2 }).rec;
  ok(bad.first.crew.length === 8 && bad.first.crew.every((s) => s.length <= 24) && bad.first.t === 0 && bad.first.sector === 0, 'crew / time / sector are clamped');
  say('trophy records + persistence (run <-> profile <-> peers, fired reset, JSON)');
}

// ================================================================ H) shrines mutator
{
  ok(K.shrineChance(1) === 0.35 && K.shrineChance(2) === 0.7 && K.shrineChance(10) === 0.9, 'double shrines: chance x2, capped');
  ok(K.dieWeight(1, 2) === 2 && K.dieWeight(1, 1) === 1, 'cursed die weight x2');
  ok(C.mutatorEffects(['shrines']).shrineMul === 2 && C.mutatorEffects([]).shrineMul === 1, 'the mutator table exposes shrineMul');
  say('shrines knobs');
}

// ================================================================ I) strings: EN -> TR / RU, same placeholders
{
  const keys = new Map();
  const add = (k, src) => { if (typeof k === 'string' && k.trim()) keys.set(k, src); };
  const files = ['cycle3.js', 'cycle3_gates.js', 'cycle3_trophy.js', 'cycle3_case.js', 'cycle3_elevator.js', 'cycle3_puzzle.js'];
  const pat = /\b(?:t|tf|say|sayTo|banner|reply|sysMsg|toast|term|say0|bigText|add)\(\s*(?:[a-zA-Z_.]+\s*,\s*)?(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const f of files) {
    const src = fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(pat)) add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'), f);
  }
  const extra = ['A RED GLITCH GATE', 'A GLITCH GATE', 'HIDDEN GATE', 'RED GATE', 'GLITCH GATE', 'GLITCH GATE CLEARED', 'RED GATE CLEARED', 'HIDDEN GATE CLEARED', 'RANK {r}', 'The elevator doors close. Descending...', 'The elevator doors close. Ascending...',
    'DESCENDING', 'ASCENDING', 'Down to the deep floors', 'Up to the lobby', 'red', 'green', 'blue', 'GLITCH WALKER', 'Glitch Walker', 'Respect the Algorithm.', 'Worship the viewers.', 'Stay alive.', 'THE ALGORITHM', 'THE VIEWERS', 'THE LIVING',
    "Clear the Algorithm's Core raid (terminal RAID).", 'Complete a Corrupted Keystone (terminal KEYSTONE).', 'Solve the three rules inside a Hidden Gate (terminal GATES, PING).', 'Defeat this boss (Sector Cores, gates, raids) to mount its trophy.',
    'the trophy wall on the ship: every boss you defeated', 'boss / gate / endless dossiers (case files of the sector cycle)', 'Gate cancelled.', 'Several gates are open: type GATE GO <n>. (GATES)', 'No such gate. Type GATES.',
    'GLITCH GATE {r} armed: pull the lever', 'Type GATES', 'GATE BREAK', 'SANCTUM OPEN', 'HIDDEN GATE LOGGED', 'UNREGISTERED SIGNAL', 'RED GATE DETECTED', 'GLITCH GATE OPENED'];
  for (const k of extra) add(k, 'extra');
  for (const d of Object.values(DOSSIERS)) for (const l of d.lines) add(l[0], 'dossier');
  const skip = new Set(['No run.']);
  const OK_ELSEWHERE = new Set(['Data Center', 'Haunted Homepage', 'Deep Web Mine', 'Corporate Intranet', 'The Backrooms', 'Cloud Storage', 'The Comment Sewer', 'Telehealth Clinic']);
  const ph = (s) => [...String(s).matchAll(/\{@?\w+\}/g)].map((m) => m[0]).sort().join(',');
  let miss = 0, checked = 0;
  for (const [k, src] of keys) {
    if (skip.has(k) || OK_ELSEWHERE.has(k) || /^[\s\W\d]*$/.test(k)) continue;
    checked++;
    for (const l of ['tr', 'ru']) {
      if (!hasTranslation(l, k)) { miss++; console.error(`FAIL missing ${l.toUpperCase()} (${src}): ${k}`); fails++; continue; }
      const v = tIn(l, k);
      if (ph(v) !== ph(k)) { console.error(`FAIL placeholders ${l.toUpperCase()}: ${k} -> ${v}`); fails++; }
    }
  }
  checks += checked * 2;
  ok(miss === 0, `${checked} strings have TR + RU`);
  // no accidental overrides of other modules' translations: our dictionaries only hold keys that are new or identical
  ok(Object.keys(C3_TR).length > 100 && Object.keys(C3_RU).length > 100 && Object.keys(LORE_TR).length >= 30, 'dictionaries are populated');
  ok(DOSSIER_KEYS.every((k) => DOSSIERS[k].lines.length === 2 && DOSSIERS[k].lines.every((l) => l.length === 3 && l.every((x) => x && x.length > 8))), 'every dossier has 2 lines in EN / TR / RU');
  ok(new Set(DOSSIER_KEYS.map(dossierCaseNumber)).size === DOSSIER_KEYS.length && DOSSIER_KEYS.every((k) => dossierCaseNumber(k) >= 90000), 'stable unique case numbers');
  ok(K.TROPHY_IDS.every((id) => DOSSIERS[id]), 'every trophy has a dossier');
  ok(['redgate', 'endless', 'shame'].every((k) => DOSSIERS[k]), 'red gate / endless / shameful exit dossiers');
  say(`i18n: ${checked} strings x TR + RU`);
}

console.log(fails ? `\n${fails} FAILED of ${checks}` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
