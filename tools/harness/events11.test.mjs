// [events11] node test: crisis roll (determinism, early-game guard), sector chain for the lockdown terminals, flood curve + basin, breaker order rules, text tables (EN/TR/RU),
// and the host flows of all four crises against a mock game (lockdown seal + hack chain + rescue, flood buoyancy, power puzzle + vault, viral x3 + targeting).
// Run: node tools/harness/events11.test.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RNG } from '../../src/core/rng.js';
import * as C from '../../src/game/events11_core.js';
import { TEXT } from '../../src/game/events11_text.js';
import { installEvents11 } from '../../src/game/events11.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ------------------------------------------------------------------ roll
const roll = (o) => C.rollCrisis({ runId: 'r1', day: 3, moon: 'hamsi', quotaIndex: 2, facility: true, ...o });
eq(roll({}), roll({}), 'the roll is deterministic');
let hits = 0; const seen = new Set();
for (let d = 1; d <= 3000; d++) { const r = roll({ day: d }); if (r) { hits++; seen.add(r.id); ok(r.at >= C.ROLL.at[0] && r.at <= C.ROLL.at[1], 'start time in range'); } }
ok(hits / 3000 > 0.28 && hits / 3000 < 0.4, `about a third of landings carry a crisis (${(hits / 3000).toFixed(2)})`);
eq([...seen].sort(), [...C.IDS].sort(), 'all four crises get rolled');
ok(Array.from({ length: 400 }, (_, d) => C.rollCrisis({ runId: 'q', day: 1, moon: 'hamsi', quotaIndex: 0 })).every((r) => r === null), 'never on the very first landing');
const nofac = new Set(); for (let d = 1; d <= 1500; d++) { const r = roll({ day: d, facility: false }); if (r) nofac.add(r.id); }
eq([...nofac], ['viral'], 'a moon without a facility only gets the viral moment');

// ------------------------------------------------------------------ synthetic facility: 8 x 4 cells, all open, two door walls (x 3|4 and x 5|6) -> three sectors
const W = 8, Hh = 4;
const L = { w: W, h: Hh, cell: 4, ox: -16, oz: -8, y: -300, cells: new Uint8Array(W * Hh).fill(1), open: new Set(), distOf: new Int16Array(W * Hh), idx: (x, z) => z * W + x };
for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) { const i = z * W + x; L.distOf[i] = x + 1; if (x + 1 < W) L.open.add(i << 1); if (z + 1 < Hh) L.open.add((i << 1) | 1); }
const doorKeys = []; for (let z = 0; z < Hh; z++) { doorKeys.push(L.idx(3, z) << 1, L.idx(5, z) << 1); }
const sec = C.sectors(L, new Set(doorKeys));
eq(sec.n, 3, 'two door walls make three sectors');
ok(sec.comp[L.idx(0, 0)] !== sec.comp[L.idx(7, 0)] && sec.adj.get(sec.comp[L.idx(0, 0)]).has(sec.comp[L.idx(4, 0)]), 'adjacency follows the doors');
const spots = []; for (let x = 0; x < W; x++) for (let z = 0; z < Hh; z++) spots.push({ x: L.ox + (x + 0.5) * 4, z: L.oz + (z + 0.5) * 4, y: -300, c: sec.comp[L.idx(x, z)] });
for (let s = 1; s <= 40; s++) {
  const rng = new RNG(s), start = sec.comp[L.idx(0, s % Hh)];
  const plan = C.planTerminals(sec, spots, [start], rng);
  eq(plan.length, 3, 'three terminals');
  eq(new Set(plan.map((p) => p.c)).size, 3, 'one per sector');
  // walk the chain: hack the terminal in the crew's sector, everything next to it opens, the next terminal must be inside the freed set
  let freed = new Set(C.freedBy(sec, start)); const left = plan.filter((p) => p.c !== start);
  let guard = 0; while (left.length && guard++ < 5) { const i = left.findIndex((p) => freed.has(p.c)); ok(i >= 0, 'the next terminal is reachable'); const p = left.splice(i, 1)[0]; for (const c of C.freedBy(sec, p.c)) freed.add(c); }
}

// ------------------------------------------------------------------ flood
ok(C.floodLevel(0) === 0 && C.floodLevel(C.FLOOD.warn) < 0.06, 'dry at first');
let prev = -1; for (let e = C.FLOOD.warn; e <= C.FLOOD.warn + C.FLOOD.rise; e += 1) { const v = C.floodLevel(e); ok(v >= prev, 'rising'); prev = v; }
ok(Math.abs(C.floodLevel(C.FLOOD.warn + C.FLOOD.rise + 5) - C.FLOOD.max) < 1e-9, 'holds at the maximum');
ok(C.floodLevel(C.floodTotal()) === 0 && C.floodLevel(C.floodTotal() + 9) === 0, 'drained at the end');
ok(!C.submerged(1.62, 1.0) && C.submerged(1.62, 1.75) && C.submerged(0.95, 1.2) && !C.submerged(1.62, 0.2), 'head under water only when the surface passes the eye');
ok(C.FLOOD.max > 1.62, 'a standing head goes under at full level (you must climb)');
const basin = C.pickBasin(L, [L.idx(7, 1)], new Set());
ok(basin.length >= 10 && basin.every((c) => L.distOf[c] > 2), 'basin: enough cells, none next to the entrance');
const edges = C.basinEdges(L, basin); ok(edges.length > 0 && edges.every((e) => basin.includes(e.a) && !basin.includes(e.b)), 'curtains only where water meets a dry open cell');
ok(C.buoyVel(0.1, 1) > 0 && C.buoyVel(2.5, 1) < 0 && Math.abs(C.buoyVel(1.06, 1)) < 0.2, 'loot rises, settles at the surface');

// ------------------------------------------------------------------ power
for (let s = 1; s <= 50; s++) {
  const r = new RNG(s), p = C.planPanels(r);
  eq([...p.ld].sort(), [1, 2, 3], 'loads are a permutation');
  const loads = p.ord.map((i) => p.ld[i]);
  eq(loads, p.dir > 0 ? [1, 2, 3] : [3, 2, 1], 'the order is lowest-first or highest-first');
  eq([C.flip(p.ord, 0, p.ord[0]), C.flip(p.ord, 1, p.ord[1]), C.flip(p.ord, 2, p.ord[2])], ['ok', 'ok', 'solved'], 'the right order solves');
  eq(C.flip(p.ord, 0, p.ord[1]), 'surge', 'the wrong panel surges');
  const sp = C.spreadSpots(Array.from({ length: 30 }, (_, i) => ({ x: (i % 6) * 9, z: Math.floor(i / 6) * 9 })), new RNG(s));
  ok(sp.length === 3 && new Set(sp).size === 3, 'three distinct panel sites');
}
ok(C.lampLook(3).flicker === 0 && C.lampLook(0).flicker > C.lampLook(2).flicker && C.lampLook(1, true).flicker === 1, 'lamps calm down with every correct breaker, a surge flares them');
ok(C.payout('power', 2, 1).credits > C.payout('power', 2, 0).credits && C.payout('flood').credits === 0, 'payouts');
ok(C.viralValue(100) === 300 && C.pickTrending(['b', 'a', 'c'], 'k') === C.pickTrending(['c', 'a', 'b'], 'k'), 'x3 and a stable trending pick');

// ------------------------------------------------------------------ text tables
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
for (const [id, v] of Object.entries(TEXT)) {
  ok(v.length === 3 && v.every((s) => typeof s === 'string' && s.length > 0), `${id}: EN + TR + RU present`);
  ok(vars(v[0]) === vars(v[1]) && vars(v[0]) === vars(v[2]), `${id}: placeholders match`);
}

// ------------------------------------------------------------------ mock game: host flows
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const log = []; const noises = [];
const handlers = new Map(), fxOn = new Map();
const doors = [];
const doorByKey = new Map();
let did = 0;
const mockKeys = [...doorKeys]; for (let z = 0; z < Hh; z++) mockKeys.push(L.idx(1, z) << 1);   // a third wall: four sectors, three terminals
for (const k of mockKeys) { const d = { id: 'd' + did++, kind: 'door', info: { key: k }, locked: false, open: true, pos: V(0, -300, 0), rotY: 0, width: 1.35 }; doors.push(d); doorByKey.set(k, d); }
const rooms = [{ id: 0, x: 0, z: 0, w: 8, h: 4, cx: 3, cz: 2, type: 'office' }];
const vaultDoor = { id: 'vault1', kind: 'vault', info: { key: -1 }, locked: true, open: false, pos: V(20, -300, 0) };
doors.push(vaultDoor);
const fac = {
  layout: { ...L, rooms, entrance: { room: rooms[0] } }, doors, doorByKey, group: new THREE.Group(), zones: [], emitters: [{ group: 'facility', intensity: 1, flicker: 0 }],
  nav: { walkableAt: () => true }, scrapSpots: spots.map((s) => ({ x: s.x, y: s.y, z: s.z, room: 0 })),
  cellAt: (x, z) => { const gx = Math.floor((x - L.ox) / 4), gz = Math.floor((z - L.oz) / 4); return gx < 0 || gz < 0 || gx >= W || gz >= Hh ? -1 : L.idx(gx, gz); },
};
const players = [
  { id: 'me', pos: V(-14, -300, -6), dead: false, inShip: false, zone: 'in', eye: V(0, 0, 0) },
  { id: 'bob', pos: V(-10, -300, 2), dead: false, inShip: false, zone: 'in', eye: V(0, 0, 0) },
];
const hooks = {};
const mods = {
  on(ev, fn) { (hooks[ev] ||= []).push(fn); return () => { hooks[ev] = hooks[ev].filter((f) => f !== fn); }; },
  emit(ev, ...a) { for (const f of hooks[ev] || []) f(...a); },
  api: { playSound: () => null, registerSound() {} }, soundGens: new Map(),
};
const items = new Map();
const spawned = [];
const game = {
  mods, isHost: true, selfId: 'me', time: 0,
  run: { runId: 'run1', day: 3, moon: 'hamsi', quotaIndex: 2, phase: 'moon', credits: 0 },
  world: { moonId: 'hamsi', facility: fac },
  net: {
    broadcast(type, d) {
      log.push([type, d]);
      if (type === 'door') { const dr = doors.find((q) => q.id === d.id); if (dr) { dr.open = d.open; if (d.locked !== undefined) dr.locked = d.locked; } }
      if (type === 'it' && d.e === 'val') { const it = items.get(d.id); if (it) it.value = d.v; }
      for (const f of fxOn.get(type) || []) f(d, 'me');
    },
    on_(type, fn) { (fxOn.get(type) || fxOn.set(type, []).get(type)).push(fn); },
    handle(type, fn) { handlers.set(type, fn); },
    request(type, d) { handlers.get(type)?.(d, 'me'); },
    sendTo() {},
  },
  broadcastRun() {}, aiPlayers: () => players, doorById: (id) => doors.find((d) => d.id === id),
  hostSetDoor(id, open) { const d = doors.find((q) => q.id === id); if (d && d.open !== open) this.net.broadcast('door', { id, open, locked: d.locked }); },
  creatures: { noise: (p, l) => noises.push([p, l]), speedMul: (c, s) => s, playersFor: () => players.filter((p) => !p.dead) },
  items: { all: () => items.values(), inShipItems: () => [...items.values()].filter((i) => i.inShip), hostSpawn: (t, p, o) => spawned.push([t, p, o]) },
  player: { pos: players[0].pos, indoor: true, dead: false, eye: 1.62 }, remotes: new Map(), playerName: (id) => id,
  physics: { addStaticBox: () => ({}), removeCollider() {} }, ui: { toast() {}, hud: { bigText() {} } }, sfx() {}, scene: new THREE.Scene(), camera: { position: V(0, 0, 0) },
  input: { isDown: () => false }, audio: { at() {} }, engine: { shake() {} },
  doorInteraction: (door) => ({ label: 'orig ' + door.id }),
};
delete globalThis.document;   // the module skips its DOM bits (overlays, dock bar); the models only need a canvas: a stub after install
const api = installEvents11(game);
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };
ok(api && typeof api.debug.trigger === 'function', 'module installed');
const tick = (s = 1, dt = 0.5) => { for (let t = 0; t < s; t += dt) { game.time += dt; mods.emit('update', dt, game); } };
const armed = () => { game.run.ev11 = { key: 'run1|3|hamsi', plan: { id: null, at: 0, done: 1 }, live: null }; };
armed();

// lockdown ---------------------------------------------------------------------------------------
eq(api.debug.trigger('lockdown'), 'started lockdown', 'lockdown starts');
let ev = game.run.ev11.live;
eq(ev.terms.length, 3, 'three terminals'); ok(ev.sealed.length === mockKeys.length && doors.filter((d) => d.kind === 'door').every((d) => d.locked && !d.open), 'every ordinary door is sealed (closed + locked)');
tick(1);
const sealedDoor = doors[0];
eq(game.doorInteraction(sealedDoor).label, 'SEALED', 'a sealed door explains itself (no key / lockpick prompt)');
eq(game.doorInteraction(vaultDoor).label, 'orig vault1', 'other doors keep their own prompt');
ok(game.creatures.speedMul({ def: {} }, 4) === 4 * C.LOCK.speed && game.creatures.speedMul({ def: { boss: true } }, 4) === 4, 'creatures run faster, bosses do not');
const t0 = ev.terms[0];
players[0].pos.set(t0.x + 1, -300, t0.z);
handlers.get('ev11req')({ op: 'hd', i: 0, k: game.run.ev11.key }, 'me');
ok(!ev.terms[0].done, 'no hack without holding');
handlers.get('ev11req')({ op: 'hb', i: 0, k: game.run.ev11.key }, 'me');
ok(ev.terms[0].w === 1, 'a hold starts: terminal working'); tick(1); ok(noises.length > 0, 'creatures hear the hack');
tick(C.LOCK.hold + 0.5);
handlers.get('ev11req')({ op: 'hd', i: 0, k: game.run.ev11.key }, 'me');
ok(ev.terms[0].done === 1 && ev.free.length > 0 && ev.free.length < ev.sealed.length, 'terminal 1 frees its own sector and its neighbours, not everything');
ok(doors.filter((d) => d.kind === 'door' && d.locked).length > 0, 'the far doors stay sealed');
for (const i of [1, 2]) { players[0].pos.set(ev.terms[i].x, -300, ev.terms[i].z); handlers.get('ev11req')({ op: 'hb', i, k: game.run.ev11.key }, 'me'); tick(C.LOCK.hold + 0.5); handlers.get('ev11req')({ op: 'hd', i, k: game.run.ev11.key }, 'me'); }
ok(!game.run.ev11.live && game.run.ev11.last.ok && game.run.credits > 0, 'all three hacked: lifted, credits paid');
ok(doors.filter((d) => d.kind === 'door').every((d) => !d.locked && d.open), 'every door is open again');
eq(game.doorInteraction(sealedDoor).label, 'orig d0', 'the prompt is back to normal');
// rescue: nobody hacks, the crew stands in a sector without a terminal
armed(); noises.length = 0;
eq(api.debug.trigger('lockdown'), 'started lockdown', 'lockdown again'); ev = game.run.ev11.live;
players[0].pos.set(ev.terms.find((t) => true).x, -300, ev.terms[0].z);
const stuckSector = [0, 1, 2, 3].find((c) => !ev.terms.some((t) => t.c === c));
ok(stuckSector !== undefined, 'four sectors, three terminals');
if (stuckSector !== undefined) {
  const sec4 = C.sectors(L, new Set(mockKeys)), cell = spots.find((s) => sec4.comp[fac.cellAt(s.x, s.z)] === stuckSector);
  players[0].pos.set(cell.x, -300, cell.z); players[1].pos.set(cell.x, -300, cell.z);
  tick(C.LOCK.rescueAfter + 12, 1);
  ok(game.run.ev11.live.free.length > 0, 'a sector without a terminal is released by maintenance after a while');
}
api.debug.end(false);
ok(!game.run.ev11.live && doors.filter((d) => d.kind === 'door').every((d) => !d.locked), 'ending a lockdown always unseals');

// power ------------------------------------------------------------------------------------------
armed();
eq(api.debug.trigger('power'), 'started power', 'power starts'); ev = game.run.ev11.live;
eq(ev.rt, 'vault', 'the vault is the prize'); ok(ev.pan.length === 3 && ev.ord.length === 3, 'three panels');
tick(6); ok(noises.length > 0, 'live panels call creatures');
const wrong = ev.ord[1], first = ev.ord[0];
players[0].pos.set(ev.pan[wrong].x, -300, ev.pan[wrong].z);
handlers.get('ev11req')({ op: 'flip', i: wrong, k: game.run.ev11.key }, 'me');
ok(ev.sg === 1 && ev.n === 0 && ev.pan.every((p) => !p.up), 'wrong order: surge + reset');
const before = noises.length;
players[0].pos.set(ev.pan[first].x, -300, ev.pan[first].z);
handlers.get('ev11req')({ op: 'flip', i: first, k: game.run.ev11.key }, 'me');
ok(ev.n === 1 && ev.pan[first].up === 1, 'right first flip holds'); ok(noises.length === before, 'no noise on a good flip');
for (const i of [ev.ord[1], ev.ord[2]]) { players[0].pos.set(ev.pan[i].x, -300, ev.pan[i].z); handlers.get('ev11req')({ op: 'flip', i, k: game.run.ev11.key }, 'me'); }
ok(!game.run.ev11.live && !vaultDoor.locked && vaultDoor.open && game.run.ev11.last.ok, 'solved: the vault door is unlocked and open');
// far away: the host refuses the flip
armed(); api.debug.trigger('power'); ev = game.run.ev11.live; players[0].pos.set(0, -300, 0); players[0].pos.x = 900;
handlers.get('ev11req')({ op: 'flip', i: ev.ord[0], k: game.run.ev11.key }, 'me'); ok(ev.n === 0, 'a flip from across the map is ignored');
api.debug.end(false);

// flood ------------------------------------------------------------------------------------------
armed();
eq(api.debug.trigger('flood'), 'started flood', 'flood starts'); ev = game.run.ev11.live;
ok(ev.cells.length >= 8 && spawned.length >= 1, 'a basin + floating debris');
players[0].pos.set(-14, -300, -6);
const floaty = { state: 'world', obj: { position: V(L.ox + (ev.cells[0] % W + 0.5) * 4, -300 + 0.1, L.oz + (((ev.cells[0] / W) | 0) + 0.5) * 4) }, def: { kind: 'scrap' }, holder: null, isSimulatedHere: () => true, body: { v: { x: 0, y: 0, z: 0 }, linvel() { return this.v; }, setLinvel(v) { this.v = v; } } };
items.set('f1', floaty);
api.debug.seek(60); tick(1);
ok(floaty.body.v.y > 0.3, 'loot in the water is pushed up');
api.debug.seek(C.floodTotal() - 1); tick(2);
ok(!game.run.ev11.live && game.run.ev11.last.id === 'flood' && game.run.ev11.last.ok, 'the flood ends by itself');
ok(fac.zones.length === 0, 'wading zones are removed');

// viral ------------------------------------------------------------------------------------------
armed(); players[0].dead = false;
eq(api.debug.trigger('viral'), 'started viral', 'viral starts'); ev = game.run.ev11.live;
ok(['me', 'bob'].includes(ev.who), 'somebody is picked');
eq(game.creatures.playersFor({}).length, 2, 'not active during the reveal');
tick(C.VIRAL.reveal + 1); ok(game.run.ev11.live.act === 1, 'the trend starts after the reveal');
eq(game.creatures.playersFor({}).map((p) => p.id), [ev.who], 'every creature sees only the trending player');
const loot = { id: 'a', state: 'world', lastHolder: ev.who, inShip: true, value: 100, def: { kind: 'scrap' }, type: 'x' };
const other = { id: 'b', state: 'world', lastHolder: ev.who === 'me' ? 'bob' : 'me', inShip: true, value: 100, def: { kind: 'scrap' }, type: 'x' };
items.set('a', loot); items.set('b', other);
tick(1);
ok(loot.value === 300 && other.value === 100, 'what the trending player secures is worth x3, others stay');
tick(1); ok(loot.value === 300, 'only once');
const tp = players.find((p) => p.id === ev.who); tp.dead = true; tick(1);
ok(!game.run.ev11.live && !game.run.ev11.last.ok, 'the trend ends early when the player dies');
tp.dead = false;
armed(); api.debug.trigger('viral'); tick(C.VIRAL.reveal + C.VIRAL.dur + 2, 1);
ok(!game.run.ev11.live && game.run.ev11.last.ok, 'a full minute survived pays out');
eq(game.creatures.playersFor({}).length, 2, 'targeting is back to normal');

// client side: every crisis starts and stops its visuals without throwing (models, water mesh, straps)
for (const id of ['lockdown', 'flood', 'power', 'viral']) {
  armed(); api.debug.trigger(id); tick(2);
  api.debug.end(false); tick(1);
}
ok(true, 'client visuals built and disposed for all four');
api.dispose();
ok(game.creatures.playersFor({}).length === 2 && game.doorInteraction(sealedDoor).label.startsWith('orig'), 'dispose restores the wrapped methods');
console.log(`events11: ${n} checks passed`);
