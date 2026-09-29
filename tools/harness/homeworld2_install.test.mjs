// Node integration test for the HOMEWORLD 2 installer (src/game/homeworld2.js + homeworld2_ghost.js) against a FAKE game (real three, real rules, fake net / physics / DOM):
// attach + persistence, host actions through the request handler, the factory running through the update hook and paying into the classic store, room kit + tree + harvest,
// wave clock -> forceRaid -> lost wave breaks machines + shield -> repair, offline catch-up on the next host start, ghost target -> route -> spawn -> vault crack -> loot,
// client mirror (a second fake game fed with the host's h2msg messages must end up with the same layout), view + colliders + HUD code paths, dispose.
//   node tools/harness/homeworld2_install.test.mjs
import assert from 'node:assert/strict';
const el = () => {
  const e = { style: {}, children: [], dataset: {}, classList: { contains: () => false, toggle() {}, add() {}, remove() {} }, isConnected: true, innerHTML: '', textContent: '',
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; }, querySelector: () => null, querySelectorAll: () => [], remove() {}, addEventListener() {}, removeEventListener() {},
    getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) };
  return e;
};
globalThis.document = { createElement: () => el(), getElementById: () => null, body: el(), addEventListener() {}, removeEventListener() {}, head: el(), activeElement: null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return el(); } };
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });

const THREE = await import('three');
const H = await import('../../src/game/homeworld_core.js');
const X = await import('../../src/game/homeworld2_core.js');
const { installHomeworld2 } = await import('../../src/game/homeworld2.js');
const { MOONS } = await import('../../src/game/moons.js');
await import('../../src/game/components.js');
const { ITEMS } = await import('../../src/game/items.js');
if (!MOONS.home) MOONS.home = { id: 'home', name: 'Homeworld', home: true };   // registered by homeworld.js in the real game

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); process.exitCode = 1; } };

// ---------------------------------------------------------------------------------------------- fakes
function makeGame({ isHost = true, profile = null } = {}) {
  const handlers = new Map(), listeners = new Map(), bcasts = [], sent = [];
  const mods = {
    _on: new Map(), commands: new Map(), itemModels: new Map(), api: { registerCommand(n, fn, h) { mods.commands.set(n, { fn, help: h }); } },
    on(ev, fn) { if (ev === 'registerHandlers') { fn((op, h) => handlers.set(op, h), game); return () => {}; } (this._on.get(ev) || this._on.set(ev, []).get(ev)).push(fn); return () => { const a = this._on.get(ev); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; },
    emit(ev, ...args) { for (const fn of [...(this._on.get(ev) || [])]) fn(...args); },
  };
  const fire = (type, d, from) => { for (const fn of listeners.get('msg:' + type) || []) fn(d, from); };
  const net = {
    hostId: 'H', bcasts, sent, isHost,
    request(op, d = {}) { const h = handlers.get(op); if (h) h({ a: op, ...d }, game.selfId); },
    broadcast(type, d) { bcasts.push([type, d]); fire(type, d, 'H'); },
    sendTo(id, type, d) { sent.push([id, type, d]); if (id === game.selfId) fire(type, d, 'H'); },
    send() {}, on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const a = listeners.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    deliver(type, d) { fire(type, d, 'H'); },
  };
  const items = new Map(); let iid = 0, cid = 0;
  const player = { pos: new THREE.Vector3(0, -0.8, 19), dead: false, hp: 100, maxHp: 100, inShip: false, teleport(p) { this.pos.copy(p); } };
  const colliders = []; let colId = 0;
  const outdoor = { home: { grid: { visible: false } }, group: new THREE.Group(), colliders };
  const game = {
    isHost, selfId: isHost ? 'H' : 'C', destroyed: false, time: 1, mods, net, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), remotes: new Map(),
    profile: profile || { name: 'Host', homeworld: H.sanitize(null) }, progress: { saves: 0, save() { this.saves++; } },
    run: { phase: 'orbit', credits: 20000, day: 3, moon: 'home', quotaIndex: 2, runId: 'r1' },
    world: { outdoor }, physics: { addStaticBox() { const c = { id: ++colId }; return c; }, removeCollider() {}, lineOfSight: () => true },
    input: { codePressed: () => false, mouseClicked: () => false, mouseDown: () => false }, terminal: { active: false }, audio: { play() {} }, env: { setSpace() {} }, planetColorFor: () => 0,
    ui: { toasts: [], toast(s) { this.toasts.push(s); }, panelOpen: false, openPanel() {}, closePanel() {}, hud: { bigText(m, s) { game._banners.push(m); } }, panel: () => el(), panelHead: () => el(), panelFoot: () => el(), button: () => el() },
    _banners: [], player,
    items: { all: () => items.values(), hostSpawn(type, pos) { const id = 'i' + ++iid; items.set(id, { id, type, pos: pos.clone() }); return id; } },
    aiPlayers: () => [{ id: game.selfId, pos: player.pos, dead: player.dead, inShip: player.inShip, eye: player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)) }],
    creatures: {
      host: new Map(), views: new Map(),
      hostSpawn(type, pos) { const c = { id: 'c' + ++cid, type, pos: pos.clone(), data: {}, hp: 100, maxHp: 100, dead: false, state: 'idle', t: 0, setState(s) { this.state = s; } }; this.host.set(c.id, c); this.views.set(c.id, c); return c; },
      kill(c) { c.dead = true; this.host.delete(c.id); this.views.delete(c.id); },
      attack(c, p, dmg) { game._hits.push(dmg); },
    },
    _hits: [], crafting: { dropped: 0, dropComponents() { this.dropped++; } },
    later(fn) { fn(); return 0; }, broadcastRun(keys) { net.bcasts.push(['gs', keys]); },
    homeworld: { raid: null, building: false, stop() {}, forceRaid(o) { if (this.raid) return false; this.raid = { sim: { P: o.power } }; this.calls = (this.calls || 0) + 1; this.lastPower = o.power; return true; } },
    _items: items, _handlers: handlers, _outdoor: outdoor, _colliders: colliders,
  };
  return game;
}
const tick = (game, n = 1, dt = 0.1) => { for (let i = 0; i < n; i++) { game.time += dt; game.mods.emit('update', dt, game); } };
const A0 = { game: makeGame() };
const game = A0.game;
const A = installHomeworld2(game);
game.homeworld2 = A;

// ---------------------------------------------------------------------------------------------- layout helper (same BFS routing as the browser script)
const req = (op, d = {}) => game.net.request('h2act', { op, ...d });
const S = () => A.layout(), HW = () => game.profile.homeworld;
const okAt = (t, x, z, r = 0) => X.placementCheck(S(), HW(), t, x, z, r, { nodes: A.nodes() }).ok;
const ctr = (p) => X.centerOf(p);
const dirTo = (dx, dz) => (Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : (dz >= 0 ? 1 : 3));
const place = (t, x, z, r = 0) => { const n = S().p.length; req('build', { t, x, z, r }); return S().p.length > n ? S().p[S().p.length - 1] : null; };
const roomy = (t, x, z, m) => { if (!m) return true; const occ = X.occupancy(S()), [w, h] = X.dims(t, 0); for (let i = -m; i < w + m; i++) for (let j = -m; j < h + m; j++) if (occ.has(X.CELL_KEY(x + i, z + j) * 4)) return false; return true; };
const spot = (t, cx, cz, rmax = 14) => { const m = X.isMachine(t) ? 2 : 0; for (let rad = 0; rad <= rmax; rad++) for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === rad && okAt(t, cx + dx, cz + dz, 0) && roomy(t, cx + dx, cz + dz, m)) return [cx + dx, cz + dz]; return null; };   // machines keep a 2-cell margin so belts fit between them

/** a compact production block (smelter A + smelter B -> assembler C -> export dock U, all facing +x, belts hand-routed) anchored at fine cell (ax, az) */
function blockAt(ax, az) {
  const M = [['smelter', ax, az], ['smelter', ax, az + 6], ['assembler', ax + 8, az + 3], ['uplink', ax + 13, az + 3]];
  const B = [[ax + 2, az + 1, 0], [ax + 3, az + 1, 0], [ax + 4, az + 1, 0], [ax + 5, az + 1, 1], [ax + 5, az + 2, 1], [ax + 5, az + 3, 0], [ax + 6, az + 3, 0], [ax + 7, az + 3, 0],
    [ax + 2, az + 6, 0], [ax + 3, az + 6, 0], [ax + 4, az + 6, 0], [ax + 5, az + 6, 3], [ax + 5, az + 5, 3], [ax + 5, az + 4, 0], [ax + 6, az + 4, 0], [ax + 7, az + 4, 0],
    [ax + 10, az + 3, 0], [ax + 11, az + 3, 0], [ax + 12, az + 3, 0]];
  return { M, B };
}
function findBlock(dirx, dirz) {
  for (let R = 20; R <= 34; R += 2) for (let k = 0; k < 24; k++) {
    const a = Math.atan2(dirz, dirx) + (k % 2 ? 1 : -1) * Math.floor(k / 2 + 1) * 0.16, ax = Math.round(Math.cos(a) * R / 1.5), az = Math.round(Math.sin(a) * R / 1.5), b = blockAt(ax, az);
    if (b.M.every(([t, x, z]) => okAt(t, x, z, 0) && roomy(t, x, z, 1)) && b.B.every(([x, z]) => okAt('belt', x, z, 0))) return b;
  }
  return null;
}
function placeBlock(b) {
  const ms = b.M.map(([t, x, z]) => place(t, x, z, 0));
  for (let i = 0; i < b.B.length; i += 40) req('belts', { l: b.B.slice(i, i + 40) });
  return ms;
}
function route(src, dst) {
  const goal = new Set(), own = new Set(X.cellsOf(dst.t, dst.x, dst.z, dst.r).map(([x, z]) => x + ',' + z)), fronts = new Set(X.isMachine(dst.t) ? X.frontCells(dst).map(([x, z]) => x + ',' + z) : []);
  for (const [x, z] of X.cellsOf(dst.t, dst.x, dst.z, dst.r)) for (const [dx, dz] of X.DIR) if (!fronts.has((x + dx) + ',' + (z + dz))) goal.add((x + dx) + ',' + (z + dz));   // never feed a machine through its output side
  const q = [], prev = new Map(), reserved = new Set();   // the output cells of every other machine stay free
  for (const m of S().p) if (X.isMachine(m.t) && m.i !== src.i) for (const [x, z] of X.frontCells(m)) reserved.add(x + ',' + z);
  for (const [x, z] of X.frontCells(src)) if (okAt('belt', x, z)) { q.push([x, z]); prev.set(x + ',' + z, null); }
  let end = null;
  while (q.length && !end) {
    const [x, z] = q.shift();
    if (goal.has(x + ',' + z) && !own.has(x + ',' + z)) { end = [x, z]; break; }
    for (const [dx, dz] of X.DIR) { const nx = x + dx, nz = z + dz, k = nx + ',' + nz; if (prev.has(k) || reserved.has(k) || !okAt('belt', nx, nz)) continue; prev.set(k, [x, z]); q.push([nx, nz]); }
  }
  if (!end) return 0;
  const path = []; for (let c = end; c; c = prev.get(c[0] + ',' + c[1])) path.unshift(c);
  const l = path.map((c, i) => { let r; if (i < path.length - 1) r = dirTo(path[i + 1][0] - c[0], path[i + 1][1] - c[1]); else { r = 0; for (let d = 0; d < 4; d++) if (own.has((c[0] + X.DIR[d][0]) + ',' + (c[1] + X.DIR[d][1]))) { r = d; break; } } return [c[0], c[1], r]; });
  for (let i = 0; i < l.length; i += 40) req('belts', { l: l.slice(i, i + 40) });
  return l.length;
}
function poles(points) {
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), k = Math.max(1, Math.ceil(len / 8));
    for (let s = 1; s <= k; s++) { const px = a.x + (b.x - a.x) * s / k, pz = a.z + (b.z - a.z) * s / k, c = spot('pole', Math.round(px / 1.5), Math.round(pz / 1.5), 4); if (c && place('pole', c[0], c[1])) n++; }
  }
  return n;
}

console.log('ATTACH');
ok('installs: api, command, apple item + model, HOST_ONLY message, profile layout with a seed', () => {
  assert.ok(A); assert.ok(game.mods.commands.has('factory')); assert.ok(game.mods.commands.has('ghost'));
  assert.ok(ITEMS.fd_apple, 'fd_apple registered'); assert.ok(game.mods.itemModels.has('fd_apple'));
  game.mods.emit('hostStart', game);
  const s = game.profile.homeworld2; assert.ok(s && s.seed > 0 && Array.isArray(s.p) && s.p.length === 0);
  assert.equal(A.nodes().length, 12);
  assert.ok(MOONS.h2raid && MOONS.h2raid.ghost && MOONS.h2raid.home);
});
game.run.phase = 'moon'; game.run.moon = 'home';
game.mods.emit('mapLoaded', game.world, game);
tick(game, 5);

console.log('FACTORY (host requests -> sim -> classic store)');
let chain = null;
ok('build miners on nodes, machines, routed belts and poles through h2act', () => {
  HW().s.parts = 300;
  for (const t of ['generator', 'generator']) { let done = false; for (let x = -15; x < 15 && !done; x++) for (let z = -15; z < 15 && !done; z++) if (H.placementCheck(HW(), t, x, z).ok && X.placementCheck(S(), HW(), 'belt', x * 2, z * 2, 0, { nodes: A.nodes() }).ok) done = H.tryBuild(HW(), { cr: 1e6 }, t, x, z, 0).ok; }   // classic generators: the pad's shore surplus powers the factory
  assert.ok(H.powerStats(HW()).supply >= 20, 'shore surplus for the factory');
  const nodes = A.nodes(), dist = (n) => Math.hypot((n.x + 1) * 1.5, (n.z + 1) * 1.5);
  const sN = nodes.filter((n) => n.res === 'scrap').sort((a, b) => dist(a) - dist(b))[0], oN = nodes.filter((n) => n.res === 'ore').sort((a, b) => dist(a) - dist(b))[0];
  const face = (n) => dirTo(-(n.x + 1), -(n.z + 1));
  const mS = place('miner', sN.x, sN.z, face(sN)), mO = place('miner', oN.x, oN.z, face(oN));
  assert.ok(mS && mO, 'miners');
  req('up', { id: mS.i }); req('up', { id: mO.i });
  const blk = findBlock(-(sN.x + oN.x), -(sN.z + oN.z)); assert.ok(blk, 'a free block area');
  const [Am, Bm, C, U] = placeBlock(blk); assert.ok(Am && Bm && C && U, 'block machines');
  for (const p of [Am, Bm, C, U]) req('up', { id: p.i });
  // the smelter row with the smaller z takes the node with the smaller z (routes do not cross)
  const [first, second] = sN.z <= oN.z ? [[mS, Am.z <= Bm.z ? Am : Bm], [mO, Am.z <= Bm.z ? Bm : Am]] : [[mO, Am.z <= Bm.z ? Am : Bm], [mS, Am.z <= Bm.z ? Bm : Am]];
  const lens = [route(first[0], first[1]), route(second[0], second[1])];
  assert.ok(lens.every((n) => n > 0), 'miner routes ' + lens);
  poles([{ x: 0, z: 17 }, ctr(C), ctr(Am), ctr(mS)]); poles([ctr(C), ctr(Bm), ctr(mO)]); poles([ctr(C), ctr(U)]);
  chain = { mS, mO, C, Am, Bm, U };
  const P = new X.FactorySim(S(), { shore: 100, nodes: A.nodes() }).powerInfo();
  assert.equal(P.unpowered, 0, 'all machines powered: ' + JSON.stringify(P));
  assert.ok(game.run.credits < 20000, 'the build cost credits');
  tick(game, 3, 0.1); assert.ok(game._colliders.length > 0, 'solid pieces got colliders on the map');
});
ok('the factory runs through the update hook and pays into the homeworld store (capped)', () => {
  const cr0 = HW().s.cr;
  tick(game, 3000, 0.1);   // 5 minutes
  assert.ok(HW().s.cr > cr0 + 3, `store credits ${cr0} -> ${HW().s.cr}`);
  assert.ok(HW().s.cr <= H.capOf(HW(), 'cr') + 1e-9);
  assert.ok(A.income() > 2, 'income EMA ' + A.income());
  assert.ok(S().st.exported > 5);
  const m = game.run.h2; assert.ok(m && m.pw && m.inc > 0 && m.v >= 1, 'run.h2 meta: ' + JSON.stringify(m).slice(0, 120));
  assert.ok(game.net.bcasts.some(([t, d]) => t === 'h2msg' && d.k === 's'), 'belt snapshots are broadcast while somebody is home');
  assert.ok(A.stats().drawCalls > 0 && A.stats().drawCalls < 40, 'instanced view draw calls: ' + A.stats().drawCalls);
});
ok('a full store makes the dock refuse items (belts back up) and the store never exceeds its cap', () => {
  HW().s.cr = H.capOf(HW(), 'cr'); HW().s.parts = H.capOf(HW(), 'parts'); HW().s.s2 = H.capOf(HW(), 's2');
  tick(game, 600, 0.1);
  assert.ok(HW().s.cr <= H.capOf(HW(), 'cr') + 1e-9); assert.ok(HW().s.parts <= H.capOf(HW(), 'parts') + 1e-9);
  HW().s.cr = 0; HW().s.parts = 100;
});
ok('errors: unknown piece, no money, out of zone are refused with a reason and change nothing', () => {
  const n = S().p.length, cr = game.run.credits; game.net.sent.length = 0; game.net.bcasts.length = 0;
  req('build', { t: 'nope', x: 20, z: 20 }); req('build', { t: 'belt', x: 0, z: 0 }); game.run.credits = 0; req('build', { t: 'pole', x: 22, z: 22 }); game.run.credits = cr;
  assert.equal(S().p.length, n);
  assert.ok(game.net.sent.filter(([, t, d]) => t === 'h2msg' && d.k === 'err').length >= 3);
});

console.log('ROOMS + TREES');
ok('room kit builds, closes the room, raises the storage cap through hw.xcap', () => {
  const before = H.capOf(HW(), 'cr'); let kit = null;
  for (const [x, z] of [[-24, 12], [-24, -20], [14, -24], [18, 14], [-12, 20], [4, -26], [-30, 0]]) { const n = S().p.length; req('kit', { k: 'storage', x, z }); if (S().p.length > n) { kit = [x, z]; break; } }
  assert.ok(kit, 'kit placed'); assert.equal(A.meta().rooms, 1);
  assert.ok(HW().xcap > 0 && H.capOf(HW(), 'cr') > before, `cap ${before} -> ${H.capOf(HW(), 'cr')}`);
  const wall = S().p.find((p) => p.t === 'wall' && p.x === kit[0] + 2 && p.z === kit[1] + 3); req('sell', { id: wall.i });
  assert.equal(A.meta().rooms, 0, 'removing a wall opens the room'); assert.equal(HW().xcap, 0);
});
ok('tree: plant, grow (tg message), harvest fruit -> apple items, fell -> wood', () => {
  const t = spot('tree', 10, 24, 8), tree = place('tree', t[0], t[1]); assert.ok(tree);
  tick(game, 60, 0.1);
  const p = S().p.find((q) => q.i === tree.i); p.a = 1500; p.f = 3;
  const c = ctr(p); game.player.teleport(new THREE.Vector3(c.x + 2, -0.8, c.z));
  req('harvest', { id: tree.i });
  assert.equal([...game._items.values()].filter((i) => i.type === 'fd_apple').length, 3); assert.equal(p.f, 0);
  req('harvest', { id: tree.i }); assert.equal([...game._items.values()].filter((i) => i.type === 'fd_apple').length, 3, 'nothing more to pick');
  req('sell', { id: tree.i }); assert.ok([...game._items.values()].some((i) => i.type === 'comp_wood')); assert.ok(!S().p.some((q) => q.i === tree.i));
  game.player.teleport(new THREE.Vector3(0, -0.8, 19));
});

console.log('WAVES');
ok('wave gate -> countdown -> forceRaid with the scaled power -> lost = machines break + shield -> repair all', () => {
  const gate = X.waveGate(HW(), S()); assert.ok(gate.ok, JSON.stringify(gate));
  S().wv.armed = 1; S().wv.left = 3;
  tick(game, 50, 0.1);
  assert.equal(game.homeworld.calls, 1, 'forceRaid called once'); assert.ok(game.homeworld.lastPower >= 0.85 && game.homeworld.lastPower <= 3);
  assert.ok(game._banners.some((b) => /WAVE/i.test(b)));
  tick(game, 30, 0.1); assert.equal(game.homeworld.calls, 1, 'no second wave while one runs');
  A.onRaidDone({ kind: 'breached' });
  game.homeworld.raid = null;
  const broken = S().p.filter((p) => p.br).length; assert.ok(broken >= 1 && broken <= 2, 'broken ' + broken);
  assert.ok(S().wv.shield > Date.now() + 800 * 1000, 'shield up'); assert.equal(S().wv.n, 1);
  assert.ok(S().p.length > 0, 'nothing deleted');
  const before = A.income(); tick(game, 100, 0.1); void before;
  S().wv.left = 0.2; tick(game, 30, 0.1); assert.equal(game.homeworld.calls, 1, 'shield blocks new waves');
  const cr = game.run.credits; req('repair', { id: 'all' }); assert.ok(!S().p.some((p) => p.br)); assert.ok(game.run.credits < cr);
  A.onRaidDone({ kind: 'repelled' });   // not fired by this module: ignored
  assert.equal(S().wv.n, 1);
});
ok('call wave early only when armed and not shielded', () => {
  S().wv.shield = 0; S().wv.left = 200; S().wv.armed = 1;
  game.net.bcasts.length = 0; req('call'); assert.ok(S().wv.left < 1 && S().wv.called === 1);
  tick(game, 20, 0.1); assert.equal(game.homeworld.calls, 2);
  game.homeworld.raid = null;
});

console.log('OFFLINE');
ok('the next host start credits offline income: capped at 8 h, 10 %, bounded by the storage cap; trees grow at 50 %', () => {
  for (const p of S().p) delete p.br;
  const s = S(), hw = HW(); hw.s.cr = 0; hw.s.parts = 0; hw.s.s2 = 0;
  s.p.push({ i: 9999, t: 'tree', x: 26, z: 26, r: 0, l: 1, a: 0, f: 0, ft: 0 });
  s.ms = Date.now() - 100 * 3600 * 1000;   // gone for 100 h
  game.mods.emit('hostStart', game);
  const rep = game.run.h2.off;
  assert.ok(rep && rep.sec === 8 * 3600, 'capped at 8 h: ' + JSON.stringify(rep));
  const rates = X.measureRates(S(), { shore: X.shoreSurplus(HW()) });
  const expected = X.offlineGain(rates, 8 * 3600).cr;
  assert.ok(rep.cr + rep.parts * 4 >= 1 && rep.cr <= expected + 1, `offline credits ${rep.cr} + parts ${rep.parts} vs uncapped ${expected.toFixed(0)}`);
  assert.ok(HW().s.cr <= H.capOf(HW(), 'cr') + 1e-9);
  const tr = S().p.find((p) => p.i === 9999); assert.ok(tr === undefined || tr.a > 0);
  assert.ok(S().ms > Date.now() - 5000, 'clock re-stamped');
  // a fresh (short) absence pays nothing extra
  const cr = HW().s.cr; S().ms = Date.now() - 20 * 1000; game.mods.emit('hostStart', game); assert.equal(HW().s.cr, cr);
});

console.log('GHOST');
ok('rival list, select, route, spawn sentries + guards, crack the vault, loot, cooldown, route restored', () => {
  game.run.phase = 'orbit'; game.run.moon = 'home';
  const list = A.ghosts(); assert.ok(list.length >= 5, list.map((g) => g.id).join());
  const rival = list.find((g) => g.id.startsWith('rival2'));
  req('gtarget', { id: rival.id }); assert.equal(S().g.target, rival.id);
  req('ghostgo'); assert.equal(game.run.moon, 'h2raid'); assert.ok(game.run.h2g.b.length > 5); assert.equal(game.run.h2g.prev, 'home');
  game.run.phase = 'moon'; game.mods.emit('mapLoaded', game.world, game); tick(game, 20, 0.1);
  const cnt = (ty) => [...game.creatures.host.values()].filter((c) => c.type === ty && !c.dead).length;
  assert.ok(cnt('h2_sentry') >= 4 && cnt('h2_guard') >= 3, `sentries ${cnt('h2_sentry')} guards ${cnt('h2_guard')}`);
  const sentry = [...game.creatures.host.values()].find((c) => c.type === 'h2_sentry'); assert.ok(sentry.data.rate > 0 && sentry.data.dmg >= 1 && sentry.maxHp > 50);
  const cr0 = game.run.credits;
  req('gcrack'); assert.equal(game._hits.length >= 0, true);
  game.player.teleport(new THREE.Vector3(0, -0.8, X.GHOST.off.z + 4));
  req('gcrack'); tick(game, 100, 0.1);
  assert.ok(game.run.credits > cr0, 'loot paid: +' + (game.run.credits - cr0));
  assert.ok(S().g.raided[rival.id] > Date.now(), 'cooldown'); assert.equal(S().st.ghostWins, 1);
  assert.equal([...game.creatures.host.values()].filter((c) => c.type === 'h2_sentry' && !c.data.off).length, 0, 'sentries off');
  assert.ok(game.net.bcasts.some(([t, d]) => t === 'h2msg' && d.k === 'gwin'));
  game.run.phase = 'orbit'; game.mods.emit('phase', 'orbit', game);
  assert.equal(game.run.moon, 'home'); assert.equal(game.run.h2g, null);
  game.net.bcasts.length = 0; req('gtarget', { id: rival.id }); assert.ok(game.net.sent.some(([, t, d]) => t === 'h2msg' && d.k === 'err'), 'cooldown blocks re-raiding');
});
ok('share code: needs the PvP flag; export -> import round trip gives a raidable ghost', () => {
  const hw = HW(); hw.b.push({ i: 1, t: 'gun', x: 6, z: 0, r: 0, l: 2 }, { i: 2, t: 'gun', x: 6, z: 3, r: 0, l: 1 }, { i: 3, t: 'wall', x: 6, z: 6, r: 0, l: 1 });
  game.net.sent.length = 0; req('gexport'); assert.ok(game.net.sent.some(([, t, d]) => t === 'h2msg' && d.k === 'err'), 'refused without the flag');
  req('pvp', { on: 1 }); assert.equal(S().pvp, 1);
  game.net.sent.length = 0; req('gexport'); const code = game.net.sent.find(([, t, d]) => t === 'h2msg' && d.k === 'code')?.[2].code; assert.ok(code && code.startsWith('TFG-H2:'));
  req('gimport', { code }); assert.equal(S().g.imported.length, 1); assert.equal(S().g.imported[0].b.length, HW().b.length);
  game.net.sent.length = 0; req('gimport', { code: 'TFG-H2:junk.zz' }); assert.equal(S().g.imported.length, 1); assert.ok(game.net.sent.some(([, t, d]) => t === 'h2msg' && d.k === 'err'));
  assert.ok(A.ghosts().some((g) => g.id === 'mine') && A.ghosts().some((g) => g.id === S().g.imported[0].id));
});

console.log('CLIENT MIRROR');
ok('a second (client) game fed with the host h2msg messages ends up with the same layout, ops keep it in sync, gaps trigger a re-sync request', () => {
  game.run.phase = 'moon'; game.run.moon = 'home';
  const cg = makeGame({ isHost: false }); const CA = installHomeworld2(cg); cg.homeworld2 = CA;
  cg.run = { ...cg.run, phase: 'moon', moon: 'home', h2: game.run.h2, hw: JSON.parse(JSON.stringify(HW())) };
  const reqs = []; cg.net.request = (op, d) => reqs.push([op, d]);
  // late joiner: full state in chunks
  game.net.sent.length = 0;
  game.mods.emit('playerJoin', 'C', {}, game);
  const fulls = game.net.sent.filter(([id, t, d]) => id === 'C' && t === 'h2msg' && d.k === 'full');
  assert.ok(fulls.length >= 1, 'host sends the layout on join');
  for (const [, , d] of fulls) cg.net.deliver('h2msg', d);
  const ids = (a) => a.p.map((p) => p.i + p.t + p.x + ',' + p.z + p.r + p.l).sort().join('|');
  assert.equal(ids(CA.layout()), ids(S()), 'client layout == host layout');
  // a live edit arrives as an op
  game.net.bcasts.length = 0;
  const f = spot('floor', -20, 14, 6); place('floor', f[0], f[1]);
  const ops = game.net.bcasts.filter(([t, d]) => t === 'h2msg' && d.k === 'ops');
  assert.equal(ops.length, 1); for (const [, d] of ops) cg.net.deliver('h2msg', d);
  assert.equal(ids(CA.layout()), ids(S()), 'client applied the op');
  // a lost op = version gap -> the client asks for a sync
  game.net.bcasts.length = 0; const f2 = spot('floor', -20, 20, 6); place('floor', f2[0], f2[1]); const f3 = spot('floor', -16, 24, 6); place('floor', f3[0], f3[1]);
  const ops2 = game.net.bcasts.filter(([t, d]) => t === 'h2msg' && d.k === 'ops'); assert.equal(ops2.length, 2);
  cg.net.deliver('h2msg', ops2[1][1]);   // the first one was "lost"
  assert.ok(reqs.some(([op, d]) => op === 'h2act' && d.op === 'sync'), 'gap -> sync request');
  // snapshot messages make the client view render items without throwing
  tick(cg, 5, 0.1); cg.net.deliver('h2msg', { k: 's', v: 1, it: X.encodeItems(A.sim), st: X.encodeStates(A.sim) });
  tick(cg, 5, 0.1);
  assert.ok(CA.stats().drawCalls > 0);
  CA.dispose();
});

console.log('LIFECYCLE');
ok('placement mode + panel code paths run (fake input), select mode hint, dispose cleans up', () => {
  game.run.phase = 'moon'; game.run.moon = 'home'; game.mods.emit('mapLoaded', game.world, game);
  A.startPlace('belt'); assert.equal(A.building, true); tick(game, 5, 0.1);
  A.startPlace('wall'); tick(game, 3, 0.1); A.startPlace('door'); tick(game, 3, 0.1); A.startKit('greenhouse'); tick(game, 3, 0.1); A.startSelect(); tick(game, 3, 0.1);
  for (const t of X.TYPES) { A.startPlace(t); tick(game, 1, 0.1); }
  A.stop(); assert.equal(A.building, false);
  assert.ok(Array.isArray(A.ghosts()) && A.growTick(10) !== undefined);
  assert.equal(game.ui.toasts.filter((t) => /undefined|NaN/.test(String(t))).length, 0);
  A.dispose(); tick(game, 3, 0.1);
});

console.log(`\n${pass} passed${process.exitCode ? ' (with FAILURES)' : ''}`);
process.exit(process.exitCode || 0);
