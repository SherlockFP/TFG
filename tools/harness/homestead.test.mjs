// Node test for KEFAL HOMESTEAD (wave 8 tycoon; src/game/homestead_core.js + homestead.js + world/homestead_view.js + homestead_i18n.js). ONE file: pure rules, the installer against a FAKE game, the view under node three.
//   node tools/harness/homestead.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const el = () => {
  const e = { style: {}, children: [], dataset: {}, classList: { contains: () => false, toggle() {}, add() {}, remove() {} }, isConnected: true, innerHTML: '', textContent: '', width: 0, height: 0,
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, querySelector: () => null, querySelectorAll: () => [], remove() {}, addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : () => {} }) };
  return e;
};
globalThis.document = { createElement: () => el(), getElementById: () => null, body: el(), addEventListener() {}, removeEventListener() {}, head: el(), activeElement: null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return el(); } };
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });

const THREE = await import('three');
const C = await import('../../src/game/homestead_core.js');
const D = await import('../../src/world/homeworld_decor_plan.js');
const HC = await import('../../src/game/homeworld_core.js');
const RC = await import('../../src/game/resto_core.js');
const V = await import('../../src/world/homestead_view.js');
const RV = await import('../../src/world/resto_view.js');
const { TR, RU } = await import('../../src/game/homestead_i18n.js');
const { installHomestead } = await import('../../src/game/homestead.js');
const { HOST_ONLY } = await import('../../src/net/session.js');
const { MOONS } = await import('../../src/game/moons.js');
if (!MOONS.home) MOONS.home = { id: 'home', name: 'Homeworld', home: true };   // registered by homeworld.js in the real game

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); } };
const lcg = (seed = 1) => { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
const full = () => { const s = C.blank(), w = { cr: 1e6 }; for (const p of C.PIECES) assert.ok(C.tryBuy(s, w, p.id, 'Ada').ok, p.id); return s; };
const gap = (px, pz, b) => Math.hypot(Math.max(Math.abs(px - b.x) - b.hx, 0), Math.max(Math.abs(pz - b.z) - b.hz, 0));

// ---------------------------------------------------------------------------------------------- 1. plot
ok('plot: inside the plateau, outside the build square and lanes, clear of ship / resto / every solid decor piece (10 seeds), raiders never spawn inside', () => {
  const P = C.PLOT;
  assert.ok(P.x0 >= -(58 - 1.6) && P.x1 <= 58 - 1.6 && P.z1 <= 58 - 1.6, 'plateau margin');
  assert.ok(P.z0 >= D.BUILD_HALF + 3, 'outside the build square');
  assert.ok(Math.min(Math.abs(P.x0), Math.abs(P.x1)) >= D.LANE + 1, 'off the south lane');
  assert.ok(!D.overlapsBox({ x: (P.x0 + P.x1) / 2, z: (P.z0 + P.z1) / 2, hx: (P.x1 - P.x0) / 2, hz: (P.z1 - P.z0) / 2 }, D.SHIP_BOX));
  assert.ok(P.x1 < RC.PLOT.x0 - 3 && P.x0 > -RC.PLOT.x1 - 100, 'far from the diner plot');
  assert.ok(Math.hypot(P.x1 - RC.SHUTTLE.x, P.z0 - RC.SHUTTLE.z) > RC.SHUTTLE.r + 20, 'far from the resto shuttle');
  const near = Math.hypot(P.x1, P.z0);
  assert.ok(near >= HC.RAID.spawnR + 0.4, `nearest corner ${near} vs spawn ring ${HC.RAID.spawnR}`);
  for (let seed = 1; seed <= 10; seed++) for (const it of D.planHomeDecor(seed * 7919, 58)) {
    if (!it.solid) continue;
    const m = it.kind === 'memorial' ? 2.5 : 0.3;
    const clash = it.x + it.hx > P.x0 - m && it.x - it.hx < P.x1 + m && it.z + it.hz > P.z0 - m && it.z - it.hz < P.z1 + m;
    assert.ok(!clash, `${it.kind} @${it.x},${it.z} overlaps the plot (seed ${seed})`);
  }
});

// ---------------------------------------------------------------------------------------------- 2. catalogue
ok('catalogue: unique ids, earlier reqs, pads + colliders inside the plot, pads >= 1.85 m apart and >= 0.4 m from every collider, totals 1530 / 1690, buyable in order', () => {
  const seen = new Set();
  for (const p of C.PIECES) {
    assert.ok(!seen.has(p.id), 'dup ' + p.id);
    if (p.req) assert.ok(seen.has(p.req), `${p.id} requires a later piece ${p.req}`);
    assert.ok(C.inPlot(p.at[0], p.at[1]) && C.inPlot(C.padOf(p)[0], C.padOf(p)[1], 0.9 - 0.3), `${p.id} outside the plot`);
    seen.add(p.id);
  }
  const pads = C.ALL_PADS();
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) assert.ok(Math.hypot(pads[i].x - pads[j].x, pads[i].z - pads[j].z) >= 1.85, `pads ${pads[i].id}/${pads[j].id} overlap`);
  const cols = C.collidersOf(null);
  for (const b of cols) assert.ok(b.x - b.hx >= C.PLOT.x0 && b.x + b.hx <= C.PLOT.x1 && b.z - b.hz >= C.PLOT.z0 && b.z + b.hz <= C.PLOT.z1, 'collider outside the plot');
  for (const pd of [...pads, { id: 'collect', x: C.COLLECTOR.x, z: C.COLLECTOR.z }]) for (const b of cols) assert.ok(gap(pd.x, pd.z, b) >= 0.4, `pad ${pd.id} touches a collider`);
  assert.equal(C.lineTotal(), 1530); assert.equal(C.lodgeTotal(), 1690);
  assert.ok(C.PIECES.find((p) => p.id === 'gate3').cap === 50);
  const s = full(); assert.equal(s.b.length, C.PIECES.length);
});

// ---------------------------------------------------------------------------------------------- 3. tryBuy + sanitize
ok('tryBuy: refuses broke / missing req / double buy, never negative wallet; 75 % rebuy only after a reclaim; sanitize survives garbage', () => {
  const s = C.blank(), w = { cr: 39 };
  assert.ok(C.tryBuy(s, w, 'claim').ok);
  assert.equal(C.tryBuy(s, w, 'drop1').ok, false); assert.equal(w.cr, 39);
  assert.equal(C.tryBuy(s, w, 'belt').ok, false, 'req missing');
  assert.equal(C.tryBuy(s, w, 'nope').ok, false);
  w.cr = 40; assert.ok(C.tryBuy(s, w, 'drop1', 'Bo').ok); assert.equal(w.cr, 0);
  assert.equal(C.tryBuy(s, w, 'drop1').why, 'owned'); assert.ok(w.cr >= 0);
  assert.equal(s.who.drop1, 'Bo'); assert.equal(s.by.Bo, 40);
  const f = full(); f.rb = 0; const w2 = { cr: 5000 }; assert.ok(C.reclaim(f, w2).ok);
  assert.equal(C.priceOf(f, C.PIECE.drop1), 30); assert.equal(C.priceOf(f, C.PIECE.found), 120, 'lodge keeps its price');
  for (const g of [null, undefined, 5, 'x', [], { b: 'x' }, { b: ['belt', 'zzz', 'belt', 5, 'gate3'], rb: 99, pile: NaN, g: { n: -5, day: 'q', run: {} }, who: { belt: '<b>x</b>', zzz: 'y' }, by: { a: 'NaN', b: 3 }, cl: 7 }]) {
    const c = C.sanitize(g);
    assert.ok(c.rb >= 0 && c.rb <= 3 && Number.isFinite(c.pile) && c.pile >= 0 && Number.isFinite(c.g.n) && c.g.n >= 0 && Number.isInteger(c.g.day));
    for (const id of c.b) assert.ok(C.PIECE[id] && (!C.PIECE[id].req || c.b.includes(C.PIECE[id].req)), 'chain kept: ' + id);
  }
  assert.deepEqual(C.sanitize({ b: ['belt', 'gate1'] }).b, [], 'pieces without their requirement are dropped');
  assert.ok(!('zzz' in C.sanitize({ b: ['claim'], who: { zzz: 'y' } }).who));
});

// ---------------------------------------------------------------------------------------------- 4. accrual fuzz
ok('accrual: 10k random sequences keep g.n <= cap and pile <= 2 cap; a new run id never refreshes the cap or Clout; no belt = no rate', () => {
  const noBelt = C.blank(); noBelt.b = ['claim', 'drop1'];
  assert.equal(C.capOf(noBelt), 0); assert.equal(C.tick(noBelt, 5, 'r', 1), 0);
  const rnd = lcg(42);
  for (let n = 0; n < 10000; n++) {
    const s = C.blank(); s.b = C.PIECES.slice(0, 2 + Math.floor(rnd() * 8)).map((p) => p.id); s.b.unshift('claim'); s.b = [...new Set(s.b)];
    let run = 'r0', day = 1, w = { cr: 0 };
    for (let k = 0; k < 12; k++) {
      const op = rnd(), cap = C.capOf(s);
      if (op < 0.4) C.tick(s, rnd() * 9, run, day);
      else if (op < 0.55) { day += 1; C.tick(s, 0, run, day); }
      else if (op < 0.65) { day = Math.max(0, day - 1 - Math.floor(rnd() * 3)); C.tick(s, 1, run, day); }
      else if (op < 0.8) { const n0 = s.g.n, c0 = s.cl; run = 'r' + Math.floor(rnd() * 5); C.advance(s, run, day); if (s.g.run === run && n0 <= cap) { assert.ok(s.g.n === n0 && s.cl === c0, 'run id must not refresh'); } }
      else C.collect(s, w, rnd() < 0.5);
      assert.ok(s.g.n <= cap + 1e-6 && s.pile <= cap * 2 + 1e-6 && s.pile >= 0 && Number.isFinite(s.pile), `bounds ${s.g.n} ${s.pile} cap ${cap}`);
    }
  }
  const s = full(); for (let i = 0; i < 400; i++) C.tick(s, 1, 'r', 1);
  assert.ok(Math.abs(s.g.n - 50) < 1e-9 && Math.abs(s.pile - 50) < 1e-9, 'one day of cap in ~3 minutes, then it stops');
  C.tick(s, 1, 'r', 2); assert.ok(s.g.n < 1, 'a new game day refreshes the cap');
});

// ---------------------------------------------------------------------------------------------- 5. collect + 6. reclaim
ok('collect: pays exactly floor(pile); Clout once per game day; the auto sweep pays no Clout; empty pile is a no-op', () => {
  const s = full(), w = { cr: 0 }; s.cl = 1;
  assert.equal(C.collect(s, w).ok, false);
  s.pile = 12.7; const r = C.collect(s, w);
  assert.ok(r.ok && r.n === 12 && w.cr === 12 && Math.abs(s.pile - 0.7) < 1e-9 && r.clout === C.cloutOf(s) && r.clout <= 6);
  s.pile = 5; assert.equal(C.collect(s, w).clout, 0, 'second collect: no Clout');
  C.advance(s, 'r', 1); C.advance(s, 'r', 2); assert.equal(s.cl, 1); s.pile = 9;
  assert.equal(C.collect(s, w, true).clout, 0, 'sweeper pays no Clout'); assert.equal(s.cl, 1);
  s.pile = 3; assert.ok(C.collect(s, w).clout > 0);
});
ok('reclaim: needs roof + gate3, costs 1200 / 1800 / 2400, keeps the lodge, resets the line, stars <= 3, caps unchanged', () => {
  const s = C.blank(), w = { cr: 1e6 }; s.b = ['claim'];
  assert.equal(C.reclaim(s, w).ok, false);
  const f = full(); const cap0 = C.capOf(f); f.pile = 30;
  const costs = [];
  for (let i = 0; i < 4; i++) {
    const before = w.cr, r = C.reclaim(f, w); if (!r.ok) break; costs.push(r.cost);
    assert.ok(f.b.includes('roof') && f.b.includes('bunk') && f.b.includes('claim') && !f.b.includes('gate3') && f.pile === 0);
    assert.ok(w.cr >= before - r.cost);
    for (const id of C.LINE_IDS) assert.ok(C.tryBuy(f, w, id).ok, 'rebuy ' + id);
    assert.equal(C.capOf(f), cap0, 'caps unchanged');
  }
  assert.deepEqual(costs, [1200, 1800, 2400]); assert.equal(f.rb, 3); assert.equal(C.reclaim(f, w).ok, false);
  assert.ok(C.beltSpeedMul(3) > 1.3 && C.beltSpeedMul(3) < 1.4);
});

// ---------------------------------------------------------------------------------------------- 7. install (fake game)
function makeGame({ isHost = true, profile = null } = {}) {
  const handlers = new Map(), listeners = new Map(), bcasts = [], sent = [];
  const mods = {
    _on: new Map(),
    on(ev, fn) { if (ev === 'registerHandlers') { fn((op, h) => handlers.set(op, h), game); return () => {}; } (this._on.get(ev) || this._on.set(ev, []).get(ev)).push(fn); return () => { const a = this._on.get(ev); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; },
    emit(ev, ...args) { for (const fn of [...(this._on.get(ev) || [])]) fn(...args); },
  };
  const fire = (type, d, from) => { for (const fn of listeners.get('msg:' + type) || []) fn(d, from); };
  const net = {
    hostId: 'H', bcasts, sent, isHost,
    request(op, d = {}) { const h = handlers.get(op); if (h) h({ a: op, ...d }, game.selfId); },
    broadcast(type, d) { bcasts.push([type, d]); fire(type, d, 'H'); },
    sendTo(id, type, d) { sent.push([id, type, d]); if (id === game.selfId) fire(type, d, 'H'); },
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const a = listeners.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
  };
  const player = { pos: new THREE.Vector3(0, -0.8, 19), dead: false };
  const cols = []; let colId = 0;
  const game = {
    isHost, selfId: isHost ? 'H' : 'C', time: 1, mods, net, scene: new THREE.Scene(), remotes: new Map(),
    profile: profile || { name: 'Host', homestead: null }, progress: { saves: 0, save() { this.saves++; } }, playerName: (id) => ({ H: 'Host', B: 'Bee' }[id] || id),
    run: { phase: 'moon', credits: 5000, day: 3, moon: 'home', runId: 'r1' },
    world: { outdoor: { home: { grid: {} } } }, onboard: { lock: false, locked() { return this.lock; }, deny() { return this.lock; } },
    physics: { addStaticBox() { const c = { id: ++colId }; cols.push(c); return c; }, removeCollider(c) { const i = cols.indexOf(c); if (i >= 0) cols.splice(i, 1); } },
    audio: { play() {} }, particles: { burst() {} },
    ui: { toasts: [], toast(s) { this.toasts.push(s); }, panelOpen: false, openPanel() {}, closePanel() {}, hud: { bigText(m) { game._banners.push(m); }, floatText() {} } },
    _banners: [], player, aiPlayers: () => [{ id: game.selfId }], homeworld: { raid: null },
    broadcastRun(keys) { net.bcasts.push(['gs', keys]); },
    _handlers: handlers, _listeners: listeners, _cols: cols,
  };
  return game;
}
const tickG = (g, n = 1, dt = 0.1) => { for (let i = 0; i < n; i++) { g.time += dt; g.mods.emit('update', dt, g); } };
const stand = (g, from, at) => { const [x, z] = Array.isArray(at) ? at : [at.x, at.z]; const p = from === g.selfId ? g.player.pos : (g.remotes.get(from) || g.remotes.set(from, { pos: new THREE.Vector3() }).get(from)).pos; p.set(x, -0.8, z); };
const req = (g, from, d) => { g.time += 0.2; g._handlers.get('hsreq')(d, from); };
const errs = (g) => g.net.sent.filter((s) => s[1] === 'hsmsg' && s[2].k === 'err').map((s) => s[2].why).concat(g.net.bcasts.filter((b) => b[0] === 'hsmsg' && b[1].k === 'err').map((b) => b[1].why));

ok('install: registers hsreq, HOST_ONLY, no `homestead(` method in game.js; rejects non-host / off-HOME / raid / locked / far / rate-limited; a double buy commits once', () => {
  assert.ok(HOST_ONLY.has('hsx') && HOST_ONLY.has('hsmsg'));
  assert.ok(!/^\s+homestead\s*\(/m.test(fs.readFileSync(new URL('../../src/game/game.js', import.meta.url), 'utf8')), 'module name must not collide with a Game method');
  const g = makeGame(); const api = installHomestead(g); g.homestead = api;
  assert.ok(g._handlers.has('hsreq'));
  g.mods.emit('hostStart', g); const S = () => g.profile.homestead; assert.ok(S() && g.run.hs === S());
  stand(g, 'H', C.CLAIM_PAD);
  // rejections leave the state alone
  g.run.phase = 'orbit'; req(g, 'H', { op: 'buy', id: 'claim' }); assert.ok(!S().b.length && errs(g).includes('You must be on the homeworld.'));
  g.run.phase = 'moon'; g.homeworld.raid = {}; req(g, 'H', { op: 'buy', id: 'claim' }); assert.ok(!S().b.length && errs(g).includes('Not during a raid.')); g.homeworld.raid = null;
  g.onboard.lock = true; req(g, 'H', { op: 'buy', id: 'claim' }); assert.ok(!S().b.length && errs(g).includes('Locked.')); g.onboard.lock = false;
  stand(g, 'H', [C.CLAIM_PAD[0] + 5, C.CLAIM_PAD[1]]); req(g, 'H', { op: 'buy', id: 'claim' }); assert.ok(!S().b.length && errs(g).includes('Stand on the glowing pad.'));
  const cli = makeGame({ isHost: false }); installHomestead(cli); stand(cli, 'C', C.CLAIM_PAD); cli._handlers.get('hsreq')({ op: 'buy', id: 'claim' }, 'C'); assert.ok(!(cli.profile.homestead?.b || []).length, 'non-host ignores requests');
  stand(g, 'H', C.CLAIM_PAD); g.time += 1; g._handlers.get('hsreq')({ op: 'buy', id: 'claim' }, 'H'); assert.ok(S().b.includes('claim'));
  const n0 = g.run.credits; g._handlers.get('hsreq')({ op: 'buy', id: 'drop1' }, 'H'); assert.equal(S().b.includes('drop1'), false, 'rate limited (0.08 s per peer) and off its pad');
  // two players on one pad: bought once, second is a silent 'owned'
  stand(g, 'H', C.padOf(C.PIECE.drop1)); stand(g, 'B', C.padOf(C.PIECE.drop1));
  req(g, 'H', { op: 'buy', id: 'drop1' }); req(g, 'B', { op: 'buy', id: 'drop1' });
  assert.equal(S().b.filter((x) => x === 'drop1').length, 1); assert.equal(g.run.credits, n0 - 40);
  assert.ok(errs(g).includes('owned') && g.net.bcasts.filter((b) => b[0] === 'hsmsg' && b[1].k === 'built' && b[1].id === 'drop1').length === 1);
  assert.ok(g.net.bcasts.some((b) => b[0] === 'gs' && b[1].includes('hs')), 'commit broadcasts run.hs');
  // production + collect + view path through the update hook
  S().b = ['claim', 'drop1', 'belt']; g.run.hs = S(); tickG(g, 1800, 0.1);
  assert.ok(S().pile > 10 && S().g.n <= 16 + 1e-6, 'belt pays into the pile, capped at 16 / day');
  assert.ok(g.net.bcasts.some((b) => b[0] === 'hsx' && b[1].c === 16), 'hsx snapshot on HOME');
  assert.ok(api.view && api.view.counts.cubes <= 48 && g._cols.length >= 1, 'view + colliders built');
  stand(g, 'H', C.COLLECTOR); const cr = g.run.credits; req(g, 'H', { op: 'collect' }); assert.ok(g.run.credits > cr && S().pile < 1);
  stand(g, 'H', [0, 0]); req(g, 'H', { op: 'collect' });
  api.dispose(); const leaks = [...g._listeners.values()].reduce((a, l) => a + l.length, 0) + [...g.mods._on.values()].reduce((a, l) => a + l.length, 0);
  assert.equal(leaks, 0, 'no listener leaks'); assert.equal(g._cols.length, 0, 'colliders freed');
});
ok('install: hostMigrated adopts run.hs and never touches the new host profile; sweeper arm pays without Clout', () => {
  const g = makeGame(); const api = installHomestead(g);
  const mine = C.sanitize(null), crew = C.sanitize({ b: ['claim', 'drop1', 'belt', 'gate1', 'drop2', 'auto'], pile: 20, cl: 1, g: { run: 'r1', day: 3, n: 5 } });
  g.profile.homestead = mine; g.run.hs = crew; g.mods.emit('hostMigrated', g, { self: true });
  stand(g, 'H', C.padOf(C.PIECE.gate2)); req(g, 'H', { op: 'buy', id: 'gate2' });
  assert.ok(g.run.hs.b.includes('gate2') && !mine.b.length, 'plot lives in run.hs, profile untouched');
  const cr = g.run.credits; tickG(g, 320, 0.1);   // > 30 s on HOME: the arm sweeps
  assert.ok(g.run.credits > cr && g.run.hs.cl === 1, 'auto sweep pays credits, keeps the day Clout');
  api.dispose();
});

// ---------------------------------------------------------------------------------------------- 8. view
ok('view: builds under node three; cubes <= 48, pile <= 24, zero lights; dispose frees every geometry and non-shared material', () => {
  const geos = new Set(), mats = new Set();
  const dg = THREE.BufferGeometry.prototype.dispose, dm = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function () { geos.add(this); return dg.call(this); }; THREE.Material.prototype.dispose = function () { mats.add(this); return dm.call(this); };
  try {
    const view = V.createHomesteadView(), scene = new THREE.Scene(); scene.add(view.root);
    view.sync(C.blank()); view.update(0.1, 0, { pp: new THREE.Vector3(-30, 0, 51), cr: 100 });
    assert.ok(view.pads.has('claim'), 'claim pad shows first');
    const s = full(); s.rb = 3; s.who = { drop1: 'Ada', roof: 'Bo', found: 'Cy', gate1: 'Di', gate2: 'Ed', gate3: 'Flo', belt: 'Gus', bunk: 'Hal' };
    const added = view.sync(s); assert.ok(added.length >= 14);
    view.setSnap({ p: 40, g: 10, c: 50, r: 0.27, cl: 1, rb: 3 });
    for (let i = 0; i < 1200; i++) view.update(0.05, i * 0.05, { pp: new THREE.Vector3(-33, 0, 52), cr: 5000 });
    assert.ok(view.counts.cubes > 0 && view.counts.cubes <= V.MAX_CUBES, 'cubes ' + view.counts.cubes);
    assert.ok(view.counts.pile > 0 && view.counts.pile <= V.MAX_PILE, 'pile ' + view.counts.pile);
    let lights = 0, draw = 0; view.root.traverse((o) => { if (o.isLight || /Light$/.test(o.type)) lights++; if (o.isMesh || o.isSprite) draw++; });
    assert.equal(lights, 0); assert.ok(draw < 90, 'draw calls ' + draw);
    const own = new Set(); view.root.traverse((o) => { if (o.geometry && !o.isSprite) own.add(o.geometry); });   // sprites share three's internal quad
    const ownMats = new Set(); view.root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m !== RV.LIT && m !== RV.EMIT) ownMats.add(m); });
    view.dispose();
    for (const gm of own) assert.ok(geos.has(gm), 'geometry not disposed');
    for (const m of ownMats) assert.ok(mats.has(m), 'material not disposed');
    assert.equal(view.root.parent, null);
  } finally { THREE.BufferGeometry.prototype.dispose = dg; THREE.Material.prototype.dispose = dm; }
});

// ---------------------------------------------------------------------------------------------- 9. i18n
ok('i18n: every t()/tf() literal, piece name and host reply of the homestead files exists in TR and RU', () => {
  const src = ['src/game/homestead.js', 'src/ui/panels/homestead.js', 'src/world/homestead_view.js'].map((f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8')).join('\n');
  const keys = new Set();
  for (const m of src.matchAll(/\bt[f]?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) keys.add(m[2].replace(/\\'/g, "'"));
  for (const m of src.matchAll(/\berr\(from,\s*'([^']+)'/g)) if (m[1] !== 'owned') keys.add(m[1]);
  for (const p of C.PIECES) keys.add(p.name);
  for (const k of ['Unknown piece.', 'Build the previous piece first.', 'Not enough credits.', 'Needs the Polish Gate and the Roof.', 'Maximum stars.', 'Homestead']) keys.add(k);
  const miss = [...keys].filter((k) => !TR[k] || !RU[k]);
  assert.deepEqual(miss, []);
  assert.equal(TR['KEFAL HOMESTEAD'], 'KEFAL YURDU'); assert.equal(TR['Roof'], 'Çatı'); assert.ok(/Усадьба Кефаль/.test(RU['Kefal Homestead [E]']));
});

console.log(`\nhomestead: ${pass} ok, ${fail} failed`);
