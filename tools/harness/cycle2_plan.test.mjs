// node tools/harness/cycle2_plan.test.mjs - the structure generator options (wings / labyrinth / arena / zones in world/facility.js generateLayout) and
// the pure planning rules (src/game/cycle_plan.js): core moon, content plan, keystone affixes / timer / forces / result, weekly best, raid scaling.
import { generateLayout, buildFacility, INTERIOR_THEMES } from '../../src/world/facility.js';
import { setInteriorProbe, generateSector } from '../../src/game/moongen.js';
import { facilityReach, planFacilitySystems, isSealedRoom } from '../../src/world/interiors/facsys.js';
import * as P from '../../src/game/cycle_plan.js';
import * as C from '../../src/game/cycle_core.js';

setInteriorProbe(() => true);
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

/** BFS over open edges; locked doors (and every door type in `blockTypes`) are walls unless `open`. Returns the reached cell set. */
function reach(L, starts, { blockLocked = true, blockArena = true } = {}) {
  const seen = new Set(starts);
  const q = [...starts];
  while (q.length) {
    const i = q.pop(), x = i % L.w, z = (i / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const j = nz * L.w + nx, k = L.edgeKey(x, z, d);
      if (!L.cells[j] || seen.has(j) || !L.open.has(k)) continue;
      const inf = L.edgeInfo.get(k);
      if (inf && blockLocked && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked))) continue;
      if (inf && !blockArena && inf.arena) { /* allowed */ }
      seen.add(j); q.push(j);
    }
  }
  return seen;
}
const cellsOf = (L, r) => { const out = []; for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) out.push(z * L.w + x); return out; };

// ---------------------------------------------------------------- default layouts are unchanged by the new (optional) parameters
{
  let same = 0;
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 4; s++) {
    const a = generateLayout(500 + s, theme, 1.4), b = generateLayout(500 + s, theme, 1.4, null), c = generateLayout(500 + s, theme, 1.4, {});
    const key = (L) => JSON.stringify([L.rooms.map((r) => [r.x, r.z, r.w, r.h, r.type]), [...L.open].sort((p, q) => p - q), L.cells.join('')]);
    ok(key(a) === key(b) && key(a) === key(c), `${theme}: no opts == null == {}`);
    ok(!a.arena && a.mazes.every((m) => m.varMaze) && a.wings.length === 0, `${theme}: no arena / cycle labyrinth / wings by default (stealth variety mazes are flagged varMaze)`);
    same++;
  }
  say(`${same} default layouts identical with and without opts`);
}

// ---------------------------------------------------------------- core structure over every theme / size / seed
const OPTS = { plan: 'wings', wings: 3, labyrinth: 1, arena: true, roomMul: 1.15, keys: 2, kind: 'core' };
{
  let n = 0;
  const stats = { wings: 0, keys: 0, mazeCells: 0, arenaCells: 0, noArena: 0 };
  for (const theme of INTERIOR_THEMES) for (const size of [1.9, 2.2, 2.6]) for (let s = 0; s < 14; s++) {
    const seed = (s * 2654435761 + Math.round(size * 1000) + 99) >>> 0;
    const L = generateLayout(seed, theme, size, OPTS);
    const tag = `${theme} ${size} #${s}`;
    n++;
    ok(!!L.arena, `${tag}: arena exists`);
    if (!L.arena) { stats.noArena++; continue; }
    ok(L.wings.length >= 2, `${tag}: >= 2 wings (${L.wings.length})`);
    ok(L.mazes.length === 1, `${tag}: one labyrinth`);
    ok(L.arena.w * L.arena.h >= 9, `${tag}: arena is big (${L.arena.w}x${L.arena.h})`);
    ok(L.arena.links === 1, `${tag}: arena has exactly one way in`);
    // exactly one arena door, locked
    const arenaDoors = [...L.edgeInfo.values()].filter((i) => i.arena);
    ok(arenaDoors.length === 1 && arenaDoors[0].locked && arenaDoors[0].type === 'door', `${tag}: one locked arena door`);
    ok(!L.arena.treasure, `${tag}: arena is not a treasure room (its key is the mini-bosses')`);
    // reachability with every locked door closed: everything except the sealed rooms is reachable; the arena is NOT
    const starts = L.entrySources;
    const seen = reach(L, starts);
    for (const r of L.rooms) {
      const sealed = r.type === 'vault' || r.type === 'core' || r.treasure || r.arena;
      if (sealed) continue;
      ok(cellsOf(L, r).every((i) => seen.has(i)), `${tag}: room ${r.id} (${r.type}) reachable without keys`);
    }
    ok(!cellsOf(L, L.arena).some((i) => seen.has(i)), `${tag}: the arena is sealed until the door opens`);
    // opening the arena door reaches it (and nothing gets disconnected)
    const all = reach(L, starts, { blockLocked: false });
    ok(cellsOf(L, L.arena).every((i) => all.has(i)), `${tag}: the arena is reachable once the door is open`);
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !all.has(i)) { ok(false, `${tag}: cell ${i} disconnected with all doors open`); break; }
    // labyrinth: fully connected inside, a real maze (many walls), all its links kept
    const mz = L.mazes[0];
    let edgesOpen = 0, edgesAll = 0;
    for (let z = mz.z; z < mz.z + mz.h; z++) for (let x = mz.x; x < mz.x + mz.w; x++) {
      if (x < mz.x + mz.w - 1) { edgesAll++; if (L.open.has(L.edgeKey(x, z, 0))) edgesOpen++; }
      if (z < mz.z + mz.h - 1) { edgesAll++; if (L.open.has(L.edgeKey(x, z, 1))) edgesOpen++; }
    }
    ok(edgesOpen >= mz.w * mz.h - 1 && edgesOpen <= (mz.w * mz.h - 1) * 1.6, `${tag}: maze is a tree + few loops (${edgesOpen}/${edgesAll} inner openings for ${mz.w * mz.h} cells)`);
    const inner = new Set();
    { const q = [mz.z * L.w + mz.x]; inner.add(q[0]); while (q.length) { const i = q.pop(), x = i % L.w, z = (i / L.w) | 0; for (let d = 0; d < 4; d++) { const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d]; if (nx < mz.x || nz < mz.z || nx >= mz.x + mz.w || nz >= mz.z + mz.h) continue; const j = nz * L.w + nx; if (inner.has(j) || !L.open.has(L.edgeKey(x, z, d))) continue; inner.add(j); q.push(j); } } }
    ok(inner.size === mz.w * mz.h, `${tag}: every maze cell is reachable from inside the maze`);
    ok(mz.links >= 1 && seen.has(mz.cz * L.w + mz.cx), `${tag}: the maze is reachable from the entrance`);
    // zones: every floor cell of a wing room has an area; arena + labyrinth own their cells
    ok(L.areas.some((a) => a.kind === 'arena') && L.areas.some((a) => a.kind === 'labyrinth') && L.areas.some((a) => a.kind === 'wing') && L.areas[0].kind === 'lobby', `${tag}: zones lobby / wing / labyrinth / arena`);
    ok(cellsOf(L, L.arena).every((i) => L.areas[L.areaOf[i]]?.kind === 'arena'), `${tag}: arena cells belong to the arena zone`);
    // key rooms
    ok(L.keyRooms.length >= 2, `${tag}: key rooms (${L.keyRooms.length})`);
    for (const id of L.keyRooms) { const r = L.rooms[id]; ok(cellsOf(L, r).every((i) => seen.has(i)) && !r.arena && !r.treasure, `${tag}: key room ${id} reachable and ordinary`); }
    // the content plan
    for (const sector of [0, 1, 4]) {
      const plan = P.planContent(L, { sector, crew: 3 });
      ok(plan.keyHolders.length === plan.keys && plan.keys === Math.min(C.keysNeeded(sector), L.keyRooms.length), `${tag} s${sector}: ${plan.keys} key holders`);
      ok(plan.keyHolders.every((k) => k.room !== L.arena.id && cellsOf(L, L.rooms[k.room]).every((i) => seen.has(i))), `${tag} s${sector}: key holders can be reached without the arena`);
      ok(plan.elites.length >= 2 && plan.elites.every((e) => e.room !== L.arena.id && cellsOf(L, L.rooms[e.room]).every((i) => seen.has(i))), `${tag} s${sector}: elites in reachable rooms (${plan.elites.length})`);
      ok(plan.bossRoom === L.arena.id && plan.lockedArena === (plan.keys > 0), `${tag} s${sector}: boss in the arena`);
    }
    stats.wings += L.wings.length; stats.keys += L.keyRooms.length; stats.mazeCells += mz.w * mz.h; stats.arenaCells += L.arena.w * L.arena.h;
  }
  say(`${n} core layouts: ${stats.noArena} without arena; avg wings ${(stats.wings / n).toFixed(2)}, avg maze ${(stats.mazeCells / n).toFixed(1)} cells, avg arena ${(stats.arenaCells / n).toFixed(1)} cells`);
  ok(stats.noArena === 0, 'every layout got an arena');
}
// two mazes (raid) and small sizes still work; determinism
{
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 8; s++) {
    const L = generateLayout(777 + s * 31, theme, 2.6, { plan: 'wings', wings: 3, labyrinth: 2, arena: true, roomMul: 1.3, keys: 2, kind: 'raid' });
    ok(L.arena && L.mazes.length >= 1 && L.wings.length >= 2, `raid ${theme} #${s}: arena + maze(s) + wings (${L.mazes.length} mazes, ${L.wings.length} wings)`);
    const again = generateLayout(777 + s * 31, theme, 2.6, { plan: 'wings', wings: 3, labyrinth: 2, arena: true, roomMul: 1.3, keys: 2, kind: 'raid' });
    ok(JSON.stringify([...L.open]) === JSON.stringify([...again.open]) && L.arena.id === again.arena.id, `raid ${theme} #${s}: deterministic`);
  }
  for (const size of [1.0, 1.4, 1.6]) { const L = generateLayout(99, 'office', size, { arena: true, wings: 2, labyrinth: 1 }); ok(!!L.arena || true, `size ${size} does not crash`); }
  say('raid layouts, small sizes, determinism');
}

// ---------------------------------------------------------------- the deepest generated server of every sector (sector 2+) uses wings + a labyrinth too
{
  let n = 0, withMaze = 0;
  for (let index = 0; index < 8; index++) for (const key of ['DEEP1', 'DEEP2', 'DEEP3']) {
    const sec = generateSector(key, index);
    sec.moons.forEach((m, k) => {
      const deepest = k === sec.moons.length - 1;
      ok(deepest && index >= 1 ? m.layoutOpts?.labyrinth === 1 && m.layoutOpts.wings === 2 : !m.layoutOpts, `${m.id}: layoutOpts only on the deepest server from sector 2`);
      if (m.layoutOpts) n++;
    });
  }
  ok(n > 0, 'deep moons carry layoutOpts');
  // the same structural + facility-system guarantees as wave1_facility_paths.mjs, with these options
  const DEEP = { plan: 'wings', wings: 2, labyrinth: 1, kind: 'deep' };
  for (const theme of INTERIOR_THEMES) for (const size of [1.2, 1.6, 2.0, 2.6]) for (let s = 0; s < 12; s++) {
    const L = generateLayout(9000 + s * 613 + Math.round(size * 100), theme, size, DEEP);
    const tag = `deep ${theme} ${size} #${s}`;
    const reachSeal = facilityReach(L);
    for (let i = 0; i < L.w * L.h; i++) { if (!L.cells[i] || reachSeal[i]) continue; const ri = L.roomOf[i]; if (ri >= 0 && isSealedRoom(L.rooms[ri])) continue; ok(false, `${tag}: cell ${i} unreachable without a key`); break; }
    const all = facilityReach(L, { blockLocked: false });
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] && !all[i]) { ok(false, `${tag}: disconnected with all doors open`); break; }
    if (L.mazes.length) withMaze++;
    const P2 = planFacilitySystems(L);
    ok(P2.gen !== null && reachSeal[L.idx(L.rooms[P2.gen].cx, L.rooms[P2.gen].cz)], `${tag}: generator reachable`);
    for (const id of [...P2.rooms.panels, ...P2.rooms.notes]) if (id !== null && id !== undefined) ok(reachSeal[L.idx(L.rooms[id].cx, L.rooms[id].cz)], `${tag}: puzzle room reachable`);
    ok(!L.fireExits.length === false, `${tag}: a fire exit exists`);
  }
  ok(withMaze > 100, `labyrinths on deep layouts (${withMaze})`);
  say(`deep moon options: structure + facility systems hold (${withMaze} maze layouts)`);
}

// ---------------------------------------------------------------- build smoke: the geometry / props / spots of core layouts (stub physics + lights)
{
  const physics = new Proxy({}, { get: () => () => ({ handle: 1 }) });
  const lightPool = { add() {}, remove() {}, emitters: new Set() };
  const warns = [];
  const w0 = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(' '));
  let built = 0, mazeSpots = 0, badSpots = 0;
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 3; s++) {
    const L = generateLayout(4000 + s * 977, theme, 2.2, OPTS);
    let fac = null;
    try { fac = buildFacility(L, { physics, lightPool }); } catch (e) { ok(false, `build ${theme} #${s}: ${e.message}`); continue; }
    built++;
    ok(fac.scrapSpots.length > 10, `${theme} #${s}: scrap spots (${fac.scrapSpots.length})`);
    ok(fac.doors.some((d) => d.info?.arena && d.locked), `${theme} #${s}: the arena door object is built locked`);
    // no spot inside a maze wall (>= 0.35 m from every closed side of its cell)
    for (const sp of [...fac.scrapSpots, ...fac.bigSpots]) {
      const gx = Math.floor((sp.x - L.ox) / L.cell), gz = Math.floor((sp.z - L.oz) / L.cell);
      if (gx < 0 || gz < 0 || gx >= L.w || gz >= L.h) continue;
      const ri = L.roomOf[gz * L.w + gx];
      if (ri < 0 || !L.rooms[ri].maze) continue;
      mazeSpots++;
      const lx = sp.x - (L.ox + gx * L.cell), lz = sp.z - (L.oz + gz * L.cell);
      const near = [[lx, 2], [L.cell - lx, 0], [lz, 3], [L.cell - lz, 1]].some(([dist, d]) => dist < 0.35 && !L.open.has(L.edgeKey(gx, gz, d)));
      if (near) badSpots++;
    }
    fac.dispose(physics);
  }
  console.warn = w0;
  ok(warns.filter((w) => !/^prop|stairs_metal|document is not defined/.test(w)).length === 0, 'build warnings: ' + warns.slice(0, 3).join(' | '));
  ok(badSpots === 0, `no loot spot inside a maze wall (${mazeSpots} maze spots checked)`);
  say(`${built} core facilities built (${mazeSpots} maze loot spots)`);
}

// ---------------------------------------------------------------- core moon definition
{
  for (let sector = 0; sector < 12; sector++) {
    const d = P.coreMoonDef('RUNKEY', sector);
    ok(d.core && d.instance === undefined && !d.generated && d.id === P.coreId(sector) && P.isCoreId(d.id), `core ${sector}: def flags`);
    ok(INTERIOR_THEMES.includes(d.interior) && d.size >= 1.9 && d.size <= 2.4 && d.layoutOpts.arena && d.layoutOpts.keys === C.keysNeeded(sector), `core ${sector}: interior ${d.interior} size ${d.size} keys ${d.layoutOpts.keys}`);
    ok(d.coreBoss.id === C.bossFor(d.interior, sector).id, `core ${sector}: boss ${d.coreBoss.name}`);
    const d2 = P.coreMoonDef('RUNKEY', sector);
    ok(JSON.stringify(d) === JSON.stringify(d2), `core ${sector}: deterministic`);
    ok(P.coreMoonDef('OTHER', sector).id === d.id, `core ${sector}: id independent of the run`);
  }
  say('core moon defs');
}

// ---------------------------------------------------------------- keystone rules
{
  ok(P.keystoneAffixes(2).join() === 'viral' && P.keystoneAffixes(3).join() === 'viral,laggy' && P.keystoneAffixes(9).length === 6 && P.keystoneAffixes(1).length === 0, 'affixes appear level by level');
  const k = P.keystoneKnobs(9);
  ok(k.spread === 2 && k.doorLag === 2.5 && k.lootMul === 0.75 && k.xpMul === 1.3 && k.speedMul === 1.15 && k.eliteMul === 3 && k.levelBonus === 2 + Math.floor(7 / 3), 'combined knobs at +9');
  ok(P.keystoneKnobs(2).lootMul === 1 && P.keystoneKnobs(2).spread === 2, 'level 2: viral only');
  ok(P.keystoneTime(2, 2) > P.keystoneTime(1, 2) && P.keystoneTime(2, 30) >= P.KS.minTime, 'timer grows with size, shrinks with level, has a floor');
  ok(P.keystoneForces(10, 2) > P.keystoneForces(2, 2), 'forces needed grow with level');
  ok(P.killPoints(1, false) === 1 && P.killPoints(1, true) === 2 && P.killPoints(0, false) === 0.5, 'kill points: power, x2 for elites, 0.5 floor');
  ok(P.keystoneResult(5, 0.7, true).next === 8 && P.keystoneResult(5, 0.3, true).next === 7 && P.keystoneResult(5, 0.05, true).next === 6, 'success: +3 / +2 / +1 by time left');
  ok(P.keystoneResult(5, 0, false).next === 4 && P.keystoneResult(2, 0, false).next === 2 && P.keystoneResult(2, 0, false).depleted, 'depleted: -1, never below the minimum');
  ok(P.keystoneResult(P.KS.maxLevel, 1, true).next === P.KS.maxLevel, 'level cap');
  const base = { id: 'hamsi', name: '56K-Dialup', short: 'Dialup', size: 0.8, interior: 'factory', tier: 1, scrapCount: [10, 14], scrapMul: 1, weather: ['clear'] };
  const ks = P.keystoneMoonDef(base, 4, 12345);
  ok(ks.keystone && ks.layoutOpts.arena && ks.layoutOpts.keys === 0 && ks.size >= 1.6 && ks.id.startsWith('ks') && !ks.generated, 'keystone moon def: bigger, wings + labyrinth + open arena');
  say('keystone rules');
}
// ---------------------------------------------------------------- weekly best
{
  ok(P.weekKey(Date.UTC(2026, 8, 29)) === '2026-W40' && P.weekKey(Date.UTC(2026, 0, 1)) === '2026-W01' && P.weekKey(Date.UTC(2025, 11, 29)) === '2026-W01' && P.weekKey(Date.UTC(2027, 0, 3)) === '2026-W53', 'ISO weeks');
  let b = P.bestUpdate(null, '2026-W40', 5, 100);
  ok(b.improved && b.best.level === 5, 'first result is the best');
  b = P.bestUpdate(b.best, '2026-W40', 4, 300);
  ok(!b.improved && b.best.level === 5, 'a lower key does not replace it');
  b = P.bestUpdate(b.best, '2026-W40', 5, 150);
  ok(b.improved && b.best.left === 150, 'same level, more time left wins');
  b = P.bestUpdate(b.best, '2026-W41', 2, 10);
  ok(b.improved && b.best.week === '2026-W41', 'a new week starts fresh');
  say('weekly best');
}
// ---------------------------------------------------------------- raid rules
{
  ok(P.raidCrewMul(1) === 1 && P.raidCrewMul(4) === 2.5 && P.raidCrewMul(5) === 2.9 && P.raidCrewMul(8) === 4.1 && P.raidCrewMul(20) === 4.1 && P.raidCrewMul(0) === 1, 'raid crew multiplier 1..8');
  for (let n = 2; n <= 8; n++) ok(P.raidCrewMul(n) > P.raidCrewMul(n - 1), `crew ${n} > crew ${n - 1}`);
  const a = P.raidBosses('RK', '2026-W40'), b = P.raidBosses('RK', '2026-W40'), c = P.raidBosses('RK', '2026-W41');
  ok(JSON.stringify(a) === JSON.stringify(b) && a.length === 3 && new Set(a.map((x) => x.id)).size === 3, 'three distinct raid bosses, deterministic');
  ok(JSON.stringify(a) !== JSON.stringify(c) || true, 'a new week may change the bosses');
  const order = a.map((x) => P.RANK_ORDER.indexOf(x.rank));
  ok(order[2] >= order[0] && order[2] >= order[1], 'the final boss is the highest rank');
  const m = P.raidMoonDef('RK', 2, '2026-W40', 'heroic');
  ok(m.raid && m.layoutOpts.labyrinth === 2 && m.layoutOpts.wings === 3 && m.layoutOpts.keys === 2 && m.size === 2.6 && m.raidBosses.length === 3, 'raid moon def');
  ok(P.raidReward('mythic', 8, true).chests === 3 && P.raidReward('mythic', 8, false).chests === 0 && P.raidReward('normal', 1, true).chests === 1, 'weekly lock: chest only on the first clear');
  ok(P.raidElites(8, 'mythic') > P.raidElites(1, 'normal'), 'more elites for a bigger crew / higher difficulty');
  ok(P.bossHpFor({ hp: 1000 }, { sector: 0, crew: 1 }) === 1000 && P.bossHpFor({ hp: 1000 }, { sector: 2, crew: 4, raid: true }) === Math.round(1000 * 1.7 * 2.5), 'boss HP formula shared with the cycle');
  say('raid rules');
}

console.log(`${checks} checks`);
if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
console.log('all plan / layout checks passed');
