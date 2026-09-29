// UNIFY wave 5: one maze library + one solvability checker. node tools/harness/mazegen.test.mjs [seeds=80]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as MG from '../../src/world/mazegen.js';
import * as M5 from '../../src/game/maps5_core.js';
import * as MS from '../../src/world/maze_styles.js';
import * as BP from '../../src/world/backrooms_plan.js';
import * as HM from '../../src/game/horror_maps.js';

const SEEDS = Number(process.argv[2]) || 80;
let n = 0, fails = 0;
const ok = (name, fn) => { n++; try { fn(); } catch (e) { fails++; console.log('FAIL', name, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); } };

ok('re-exports are the proven planners (same functions, nothing forked)', () => {
  for (const k of ['carveTree', 'bfs', 'wallLattice', 'planHedge', 'planStacks', 'planArchive', 'verifyStacks', 'archiveSolve', 'makeGrid', 'gridFromFlags', 'shortestPath', 'mazeRoute']) assert.equal(MG[k], M5[k], k);
  for (const k of ['carveMaze', 'mazeConnected', 'mazeDeadEnds', 'pickMazeStyle', 'MAZE_STYLES']) assert.equal(MG[k], MS[k], k);
  assert.equal(MG.generatePocket, BP.generatePocket); assert.equal(MG.POCKET_SPECS, HM.POCKET_SPECS); assert.equal(MG.analyzeSpec, HM.analyzeSpec);
  assert.deepEqual(MG.KINDS, ['tree', 'dfs', 'braid', 'prim', 'serpentine', 'spiral', 'ring', 'hedge', 'stacks', 'archive', 'pocket']);
});

const stats = {};
for (const kind of MG.KINDS) {
  const heavy = ['pocket', 'stacks', 'archive', 'hedge'].includes(kind);
  const count = heavy ? SEEDS : SEEDS * 4;
  ok(`${kind}: ${count} seeds all solvable`, () => {
    const shapes = heavy ? [{}] : [[2, 2], [3, 3], [4, 3], [5, 4], [6, 5], [8, 8], [1, 4], [7, 2]].map(([w, h]) => ({ w, h }));
    let bad = 0, cells = 0;
    for (let s = 1; s <= count; s++) {
      const o = shapes[s % shapes.length], p = MG.planMaze(kind, s * 7919 + 13, o), c = MG.checkSolvable(p);
      cells += c.total;
      if (!c.ok && ++bad < 4) console.log(`   ${kind} seed ${s * 7919 + 13} ${JSON.stringify(o)}: ${c.errors.join('; ')}`);
    }
    stats[kind] = cells;
    assert.equal(bad, 0, bad + ' unsolvable');
  });
}
ok('every horror ASCII pocket spec is solvable through the same checker', () => {
  for (const [id, spec] of Object.entries(MG.POCKET_SPECS)) { const c = MG.checkSolvable(MG.asciiMaze(spec)); assert.ok(c.ok, `${id}: ${c.errors.join('; ')}`); assert.ok(c.total > 100, id + ' has floor'); }
});
ok('deterministic: same kind + seed = same plan', () => {
  for (const kind of MG.KINDS) {
    const a = MG.planMaze(kind, 424242, { w: 6, h: 5 }), b = MG.planMaze(kind, 424242, { w: 6, h: 5 }), c = MG.planMaze(kind, 424243, { w: 6, h: 5 });
    assert.deepEqual(a.graph.adj, b.graph.adj, kind);
    if (kind !== 'ring' && kind !== 'spiral' && kind !== 'serpentine') assert.notDeepEqual(a.graph.adj, c.graph.adj, kind + ' differs by seed');
  }
});
ok('the checker really fails a broken maze (cut every edge of a cell, cut a bridge, break a hedge path)', () => {
  const t = MG.planMaze('tree', 5, { w: 5, h: 5 });
  assert.ok(MG.checkSolvable(t).ok);
  for (const j of t.graph.adj[12].slice()) t.graph.adj[j] = t.graph.adj[j].filter((x) => x !== 12);
  t.graph.adj[12] = [];
  const c = MG.checkSolvable(t); assert.ok(!c.ok && /unreachable/.test(c.errors.join()));
  const e = MG.planMaze('dfs', 9, { w: 4, h: 4 }); e.raw.length = 3; e.graph = MG.graphFromEdges(4, 4, e.raw);
  assert.ok(!MG.checkSolvable(e).ok, 'a truncated edge list disconnects');
  const h = MG.planMaze('hedge', 3); h.raw.solvable = false; assert.ok(!MG.checkSolvable(h).ok, "the planner's own flag is honoured");
  const a = MG.planMaze('archive', 3); a.raw.ladder = { ...a.raw.ladder, cell: -1 }; assert.ok(!MG.checkSolvable(a).ok, 'archive without a ladder is unsolvable');
  const spec = { ...MG.POCKET_SPECS.ballroom, map: MG.POCKET_SPECS.ballroom.map.map((r, z) => (z === 11 ? r.slice(0, 15) + '#' + r.slice(16) : r)) };
  spec.map = spec.map.map((r, z) => (z >= 1 && z <= 20 ? r.slice(0, 16) + '#' + r.slice(17) : r));   // a wall column splits the hall
  assert.ok(!MG.checkSolvable(MG.asciiMaze(spec)).ok, 'a split ASCII pocket is caught');
});
ok('distances / graph helpers agree with maps5 bfs', () => {
  const g = MG.makeGrid(6, 6); MG.carveTree(g, new (class { constructor() { this.s = 1; } next() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; } int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } pick(l) { return l[this.int(0, l.length - 1)]; } chance(p) { return this.next() < p; } })(), null, 0.2);
  const d1 = MG.bfs(g, 0), d2 = MG.distances(MG.graphFromGrid(g), 0);
  assert.deepEqual([...d1], [...d2]);
});
ok('callers point at the library (pure renames)', () => {
  const src = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
  for (const f of ['world/facility.js', 'world/facility_variety.js']) assert.ok(/from '\.\/mazegen\.js'/.test(src(f)), f);
  for (const f of ['world/maps5_estate.js', 'world/maps5_cold.js', 'world/maps5_stacks.js', 'world/maps5_hedge.js', 'world/maps5_archive.js']) assert.ok(/from '\.\/mazegen\.js'/.test(src(f)) && !/import [^;]*maps5_core/.test(src(f)), f);
});

console.log(`mazegen: ${n} groups, ${fails} failed, cells checked ${Object.entries(stats).map(([k, v]) => k + ':' + v).join(' ')}`);
if (fails) process.exit(1);
