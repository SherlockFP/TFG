// STEALTH wave 4 - facility variety tests (pure node, no browser):
//   node tools/harness/stealth_maze.test.mjs [seeds=200]
//  1. every maze style is connected on many shapes (world/maze_styles.js)
//  2. over `seeds` seeds x themes x sizes the generated facility is SOLVABLE: with every locked door treated as a wall, all non-sealed cells
//     are reachable from the entrance, the exit (entrance + fire exits) is reachable, the shortcut door is an EXTRA edge (walling it off
//     disconnects nothing), its latch side is the deeper side, every hatch lands on a reachable nearer-the-entrance cell, dead ends exist
//  3. determinism (same seed -> same variety plan) and the off switches (opts.variety === false, __kefalVarietyOff)
import { generateLayout, buildFacility, INTERIOR_THEMES } from '../../src/world/facility.js';
import { facilityReach, isSealedRoom } from '../../src/world/interiors/facsys.js';
import { carveMaze, mazeConnected, MAZE_STYLES } from '../../src/world/maze_styles.js';
import { RNG } from '../../src/core/rng.js';

const SEEDS = Number(process.argv[2]) || 200;
const fails = [];
const stats = { layouts: 0, withVariety: 0, mazes: 0, styles: {}, liminal: { office: 0, pool: 0, halls: 0 }, deadEnds: 0, hatches: 0, shortcuts: 0, shortcutDiff: 0, unlockedByRule: 0 };
const t0 = Date.now();

// 1. maze carvers
for (const st of MAZE_STYLES) for (let s = 0; s < 150; s++) for (const [w, h] of [[2, 2], [3, 3], [4, 3], [4, 5], [5, 4], [6, 5], [7, 6], [1, 4], [5, 1], [8, 3]]) {
  const e = carveMaze(st, w, h, new RNG(s * 7919 + w * 131 + h));
  if (!mazeConnected(w, h, e)) fails.push(`maze ${st} ${w}x${h} seed ${s} not connected`);
}

// 2. layouts
const SIZES = [0.8, 1.0, 1.35, 1.8, 2.4];
for (const theme of INTERIOR_THEMES) for (const size of SIZES) for (let s = 0; s < SEEDS; s++) {
  const seed = (s * 2654435761 + 977 + Math.round(size * 1000)) >>> 0;
  const L = generateLayout(seed, theme, size);
  const tag = `${theme} size=${size} seed=${seed}`;
  const fail = (m) => fails.push(`${tag}: ${m}`);
  stats.layouts++;
  const reach = facilityReach(L);
  for (let i = 0; i < L.w * L.h; i++) {
    if (!L.cells[i] || reach[i]) continue;
    const ri = L.roomOf[i];
    if (ri >= 0 && isSealedRoom(L.rooms[ri])) continue;
    fail(`cell ${i % L.w},${(i / L.w) | 0} (${ri >= 0 ? L.rooms[ri].type : 'corridor'}) unreachable`); break;
  }
  if (!reach[L.idx(L.entrance.room.cx, L.entrance.room.cz)]) fail('entrance not reachable');
  for (const f of L.fireExits.slice(0, L.outdoorFires)) if (!reach[L.idx(f.cellX, f.cellZ)]) fail('fire exit not reachable');
  const V = L.variety;
  if (!V) { if (theme !== 'backrooms' && size >= 0.75) fail('variety missing on a regular facility'); continue; }
  stats.withVariety++;
  stats.mazes += V.mazes.length;
  for (const m of V.mazes) stats.styles[m.style] = (stats.styles[m.style] || 0) + 1;
  for (const l of V.liminal) stats.liminal[l.kind]++;
  stats.deadEnds += V.deadEnds.length; stats.hatches += V.hatches.length;
  for (const m of V.mazes) {
    const r = L.rooms[m.room];
    if (!r || !r.maze) fail('maze room flag missing');
    // every cell of the maze room reachable
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (!reach[L.idx(x, z)]) { fail(`maze cell ${x},${z} unreachable (${m.style})`); z = 1e9; break; }
  }
  for (const l of V.liminal) {
    const r = L.rooms[l.room];
    if (!r || r.lim !== l.kind) fail('liminal room flag missing');
    else if (!reach[L.idx(r.cx, r.cz)]) fail(`liminal ${l.kind} room unreachable`);
    else if (r.height > 4.5) fail('liminal ceiling too tall');
  }
  for (const h of V.hatches) {
    const dest = L.idx(h.to.x, h.to.z), src = L.idx(h.x, h.z);
    if (!reach[dest] || !reach[src]) fail('hatch end unreachable');
    if (!(L.distOf[dest] >= 3 && L.distOf[dest] < L.distOf[src])) fail('hatch does not land nearer the entrance');
    if (L.roomOf[dest] >= 0 && (L.rooms[L.roomOf[dest]].maze || L.rooms[L.roomOf[dest]].lim)) fail('hatch lands inside a maze / liminal room');
  }
  for (const d of V.deadEnds) if (!reach[L.idx(d.x, d.z)]) fail('dead end unreachable');
  if (V.shortcut) {
    stats.shortcuts++; stats.shortcutDiff += V.shortcut.diff;
    const inf = L.edgeInfo.get(V.shortcut.key);
    if (!inf || !inf.shortcut || !inf.locked || inf.type !== 'door') fail('shortcut door info missing');
    else {
      if (!L.open.has(V.shortcut.key)) fail('shortcut edge not open');
      if (!reach[inf.a] || !reach[inf.b]) fail('shortcut side unreachable without the shortcut (would be a bridge)');
      const deep = V.shortcut.latch === 'b' ? inf.b : inf.a, near = V.shortcut.latch === 'b' ? inf.a : inf.b;
      if (!(L.distOf[deep] >= L.distOf[near] + 8)) fail('latch is not on the deep side');
      if (L.doors.indexOf(inf) < 0) fail('shortcut door not in L.doors');
    }
  } else if (V.shortcut === undefined) fail('shortcut field missing');
  stats.unlockedByRule += L.unlockedByRule || 0;
}

// 3. determinism + switches
for (const theme of ['factory', 'office', 'sewer']) {
  const a = generateLayout(4242, theme, 1.4), b = generateLayout(4242, theme, 1.4);
  if (JSON.stringify(a.variety) !== JSON.stringify(b.variety)) fails.push(`${theme}: variety not deterministic`);
  const off = generateLayout(4242, theme, 1.4, { variety: false });
  if (off.variety !== null || off.rooms.some((r) => r.lim || r.varMaze)) fails.push(`${theme}: opts.variety=false still produced variety`);
  globalThis.__kefalVarietyOff = true;
  const off2 = generateLayout(4242, theme, 1.4);
  globalThis.__kefalVarietyOff = false;
  if (JSON.stringify([...off.open].sort()) !== JSON.stringify([...off2.open].sort())) fails.push(`${theme}: the two off switches disagree`);
  // cycle cores keep their own structure
  const core = generateLayout(4242, theme, 1.4, { plan: 'wings', wings: 2, labyrinth: 1, arena: true });
  if (core.variety) fails.push(`${theme}: cycle core got the variety pass`);
}

// 4. build smoke (stub physics + lights): the variety dressing builds without warnings and exposes hatches / rewards / pools / latch
{
  let n = 0;
  const physics = new Proxy({}, { get: () => () => ({ handle: n++ }) });
  const lightPool = { add() {}, remove() {}, emitters: new Set() };
  const warns = [];
  const w0 = console.warn;
  console.warn = (...a) => { if (String(a[0]).startsWith('variety') || String(a[0]).startsWith('prop')) warns.push(a.map(String).join(' ')); };
  const built = { layouts: 0, hatches: 0, rewards: 0, pools: 0, latch: 0, office: 0 };
  for (const theme of ['factory', 'mansion', 'office', 'hospital', 'sewer', 'serverfarm']) for (let s = 0; s < 8; s++) {
    const L = generateLayout(2000 + s * 7919, theme, 1.6);
    const fac = buildFacility(L, { physics, lightPool });
    built.layouts++;
    if (!fac.variety) { fails.push(`${theme}: variety planned but not built`); continue; }
    built.hatches += fac.variety.hatches.length; built.rewards += fac.variety.rewards.length; built.pools += fac.variety.pools.length; built.latch += fac.variety.shortcut ? 1 : 0;
    built.office += fac.variety.rooms.filter((r) => r.kind === 'office').length;
    if (fac.variety.hatches.length !== L.variety.hatches.length) fails.push(`${theme}: hatch count differs`);
    for (const h of fac.variety.hatches) if (![h.x, h.z, h.to.x, h.to.z].every(Number.isFinite)) fails.push(`${theme}: bad hatch`);
    for (const sp of fac.scrapSpots) if (sp.type === 'nook' && !fac.nav.walkableAt(sp.x, sp.z)) fails.push(`${theme}: nook spot in a wall`);
    fac.dispose(physics);
  }
  console.warn = w0;
  if (warns.length) fails.push('build warnings: ' + warns.slice(0, 3).join(' | '));
  if (built.rewards < 10 || built.hatches < 2 || built.office < 3) fails.push('too little variety dressing built: ' + JSON.stringify(built));
  stats.build = built;
}

console.log(JSON.stringify({ ...stats, avgShortcutDiff: stats.shortcuts ? +(stats.shortcutDiff / stats.shortcuts).toFixed(1) : 0, ms: Date.now() - t0 }));
if (fails.length) { console.log(`FAIL ${fails.length}`); for (const f of fails.slice(0, 30)) console.log('  ' + f); process.exit(1); }
console.log(`PASS: ${stats.layouts} facilities (${INTERIOR_THEMES.length} themes x ${SIZES.length} sizes x ${SEEDS} seeds) + ${MAZE_STYLES.length} maze styles`);
