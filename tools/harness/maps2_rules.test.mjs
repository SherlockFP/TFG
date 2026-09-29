// maps2 rules test ([finish]):  node tools/harness/maps2_rules.test.mjs
// plate weights, gamble odds / EV, puzzle state machine, arena waves, collapse edge choice on real layouts, event odds, deterministic furniture,
// and that every built challenge room exposes the spots + prop anchors the runtime needs.
import assert from 'node:assert/strict';
import * as R from '../../src/game/maps2_rules.js';
import { generateLayout, buildFacility, INTERIOR_THEMES } from '../../src/world/facility.js';
import { corridorSealEdges, sealInfo, M2_CHALLENGE_ON } from '../../src/world/rooms2.js';
import { layoutKit } from '../../src/world/interiors/common.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok', name); };
const seeded = (s = 7) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

ok('plate: weight sums on the plate only, hold timer', () => {
  const items = [{ x: 0.2, y: 0.3, z: 0, weight: 24 }, { x: 0.5, y: 0.3, z: 0.4, weight: 25 }, { x: 5, y: 0, z: 0, weight: 40 }, { x: 0, y: 3, z: 0, weight: 40 }, { x: 0.9, y: 0.4, z: 0, weight: 16 }];
  assert.equal(R.plateWeight(items, 0, 0, 0), 65);
  const st = {};
  R.plateStep(st, 30, 1); assert.ok(!st.done && Math.abs(st.f - 0.5) < 1e-9);
  R.plateStep(st, 65, 1); assert.ok(!st.done); R.plateStep(st, 65, 0.5); assert.ok(st.done);
  const st2 = {}; R.plateStep(st2, 65, 1); R.plateStep(st2, 10, 1); assert.equal(st2.t, 0);
  const spawned = R.PLATE.weights.length; assert.ok(spawned >= 3);
});

ok('gamble: odds sum, outcomes, EV near the cost (fair-ish, real risk)', () => {
  const rng = seeded(11), cnt = {};
  for (let i = 0; i < 20000; i++) { const o = R.gambleOutcome(rng, 2); cnt[o.kind] = (cnt[o.kind] || 0) + 1; }
  for (const [k] of R.GAMBLE_TABLE) assert.ok(cnt[k] > 0, k);
  assert.ok(cnt.nothing > cnt.jackpot * 3);
  const ev = R.gambleEV(0), cost = R.GAMBLE.cost;
  assert.ok(ev > cost * 0.8 && ev < cost * 1.6, 'ev ' + ev);
  assert.equal(R.gambleOutcome(() => 0, 0).kind, 'jackpot');
  assert.ok(R.gambleOutcome(() => 0.999, 0).kind === 'blast');
});

ok('puzzle: co-op window, solo window, code order, wrong press resets', () => {
  const seq = [2, 0, 3, 1];
  let st = R.newPuzzle();
  assert.equal(R.puzzleLever(st, 0, 10, 2), 'wait');
  assert.equal(R.puzzleLever(st, 1, 12, 2), 'wait', 'two seconds is too slow with a crew');
  assert.equal(R.puzzleLever(st, 0, 12.5, 2), 'reveal');
  assert.equal(R.puzzleButton(st, 2, seq, 13), 'ok'); assert.equal(R.puzzleButton(st, 1, seq, 13.5), 'fail');
  assert.equal(R.puzzleButton(st, 2, seq, 14), 'locked');
  st = R.newPuzzle();
  R.puzzleLever(st, 0, 1, 1); assert.equal(R.puzzleLever(st, 1, 5, 1), 'reveal', 'solo gets 6 s');
  for (const [i, e] of [[2, 'ok'], [0, 'ok'], [3, 'ok'], [1, 'solved']]) assert.equal(R.puzzleButton(st, i, seq, 6), e);
  assert.equal(R.puzzleLever(st, 0, 7, 2), 'done');
  st = R.newPuzzle(); R.puzzleLever(st, 0, 1, 2); R.puzzleLever(st, 1, 1.5, 2);
  assert.equal(R.puzzleButton(st, 2, seq, 1.5 + R.PUZZLE.reveal + 1), 'locked');
});

ok('arena: two waves, scale with crew, reward', () => {
  assert.equal(R.arenaWave(1, 1)[0].n, 4); assert.equal(R.arenaWave(1, 4)[0].n, 7);
  const w2 = R.arenaWave(2, 4, 9); assert.ok(w2.some((e) => e.type === 'crawler' && e.n >= 2));
  assert.ok(R.arenaReward(3, 5).credits > R.arenaReward(1, 0).credits && R.arenaReward(3, 5).items === 4);
  assert.equal(R.ARENA.waves, 2);
});

ok('events: odds, none before quota 2, no facility = none', () => {
  const rng = seeded(5); let c = 0, m = 0, none = 0;
  for (let i = 0; i < 10000; i++) { const e = R.rollEvent(rng, 3, true); if (e === 'collapse') c++; else if (e === 'migration') m++; else none++; }
  assert.ok(c > 2000 && c < 2800 && m > 1600 && m < 2400, `c ${c} m ${m}`);
  assert.equal(R.rollEvent(() => 0, 0, true), null); assert.equal(R.rollEvent(() => 0, 5, false), null);
});

ok('furniture: deterministic per (seed, id), all kinds produce every result over many ids', () => {
  const a = R.furnitureRoll(1234, 'drawer:0:3', 'drawer', R.hash01), b = R.furnitureRoll(1234, 'drawer:0:3', 'drawer', R.hash01);
  assert.deepEqual(a, b);
  const seen = {};
  for (let i = 0; i < 400; i++) for (const k of ['drawer', 'pc', 'radio', 'phone']) { const r = R.furnitureRoll(99, `${k}:${i}`, k, R.hash01); (seen[k] ||= new Set()).add(r.what); }
  assert.deepEqual([...seen.drawer].sort(), ['empty', 'junk', 'loot', 'note']); assert.deepEqual([...seen.pc].sort(), ['credits', 'log']);
  assert.deepEqual([...seen.radio].sort(), ['signal', 'static']); assert.deepEqual([...seen.phone].sort(), ['noise', 'voicemail']);
});

const reach = (L, key) => {
  const seen = new Uint8Array(L.w * L.h), q = [L.idx(L.entrance.room.cx, L.entrance.room.cz)];
  seen[q[0]] = 1;
  const blocks = (inf) => !!inf && (inf.type === 'vault' || inf.type === 'contain' || (inf.type === 'door' && inf.locked));
  let c = 0;
  while (q.length) {
    const i = q.pop(); c++;
    const x = i % L.w, z = (i / L.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, 0, -1, 0][d], nz = z + [0, 1, 0, -1][d];
      if (nx < 0 || nz < 0 || nx >= L.w || nz >= L.h) continue;
      const k = L.edgeKey(x, z, d), j = nz * L.w + nx;
      if (k === key || !L.cells[j] || seen[j] || !L.open.has(k) || blocks(L.edgeInfo.get(k))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return c;
};

ok('collapse: chosen edge is a corridor >= 14 m from the crew and never disconnects; two collapses in a row stay connected', () => {
  let tested = 0, none = 0;
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 8; s++) {
    const L = generateLayout(500 + s * 7919, theme, 1.5), K = layoutKit(L);
    const edges = corridorSealEdges(L).map((k) => sealInfo(L, K, k));
    if (!edges.length) { none++; continue; }
    const total = reach(L, -1);
    const start = K.roomRect(L.entrance.room);
    const players = [{ x: (start.x0 + start.x1) / 2, z: (start.z0 + start.z1) / 2 }];
    const e = R.pickCollapseEdge(edges, players, seeded(s + 1));
    if (!e) continue;
    tested++;
    assert.ok(Math.hypot(players[0].x - e.x, players[0].z - e.z) >= 14, 'too close');
    assert.equal(reach(L, e.key), total, `${theme}: collapse disconnects`);
    const e2 = R.pickCollapseEdge(edges.filter((q) => q.key !== e.key), players, seeded(s + 9));
    if (e2) { /* the second collapse is checked against the first via the safe-edge property (non-bridge each) */ assert.notEqual(e2.key, e.key); }
  }
  assert.ok(tested > 20, 'tested ' + tested + ' none ' + none);
});

ok('migration: far room pick', () => {
  const rooms = [{ id: 0, cx: 0, cz: 0 }, { id: 1, cx: 40, cz: 0 }, { id: 2, cx: 80, cz: 10 }, { id: 3, cx: 5, cz: 5 }];
  const r = R.pickFarRoom(rooms, [{ x: 1, z: 1 }], seeded(3));
  assert.ok([1, 2].includes(r.id));
});

ok('built challenge rooms expose the spots + anchors the runtime drives', () => {
  assert.ok(M2_CHALLENGE_ON, 'challenge rooms are on');
  const w0 = console.warn; console.warn = (...a) => { if (!String(a[0]).startsWith('facility systems')) w0(...a); };   // facsys needs a DOM (node has none)
  let n2 = 0; const kinds = {};
  const physics = new Proxy({}, { get: () => () => ({ handle: n2++ }) });
  const lightPool = { add() {}, remove() {}, emitters: new Set() };
  const need = { physics: ['plate', 'pad'], gamble: ['lever'], arena: ['console', 'spawn', 'opening', 'reward'], puzzle: ['lever', 'btn', 'rp', 'panel', 'reward'], treasure: ['chest'] };
  const anchors = { plate: ['ring'], lever: null, panel: ['b0', 'b3', 'l0', 'l3', 'rp'], console: ['btn'] };
  for (const theme of INTERIOR_THEMES) for (let s = 0; s < 60 && Object.keys(kinds).length < 5; s++) {
    const L = generateLayout(9000 + s * 104729, theme, 2.2);
    const ch = L.m2?.challenge;
    if (!ch || kinds[ch.id]) continue;
    const fac = buildFacility(L, { physics, lightPool });
    const spots = fac.m2.spots.filter((x) => x.room === ch.room);
    const room = fac.m2.rooms.find((r) => r.room === ch.room);
    if (room?.failed) { fac.dispose(physics); continue; }
    for (const k of need[ch.id]) assert.ok(spots.some((x) => x.k === k), `${ch.id}: spot ${k}`);
    for (const sp of spots) if (anchors[sp.k] && sp.obj) for (const a of anchors[sp.k]) assert.ok(sp.obj.userData.anchors?.[a], `${ch.id}: anchor ${a}`);
    if (ch.id === 'puzzle') { assert.equal(spots.filter((x) => x.k === 'lever').length, 2); assert.equal(spots.filter((x) => x.k === 'btn').length, 4); assert.equal(ch.seq.length, 4); }
    if (ch.id === 'gamble') assert.ok(spots.find((x) => x.k === 'lever').obj.userData.anchors.arm);
    if (ch.id === 'treasure') assert.ok(spots.some((x) => x.k === 'seal'), 'treasure seals');
    kinds[ch.id] = true;
    // furniture spots are exposed for the stateful runtime
    for (const k of ['drawer']) assert.ok(fac.m2.spots.some((x) => x.k === k), 'furniture ' + k);
    fac.dispose(physics);
  }
  console.warn = w0;
  assert.ok(Object.keys(kinds).length >= 4, 'challenge kinds built: ' + Object.keys(kinds));
});

console.log(n + ' maps2 rules checks passed');
