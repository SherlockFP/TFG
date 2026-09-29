// Node smoke test for the SHIPYARD installer (src/game/shipyard.js) against a fake game + the REAL ship (world/ship.js):
// attach -> run.sy -> modules build (hardpoint doorways open, colliders / emitters registered), host actions (install / upgrade / parts / paint / sell / revive / heal /
// analyze / guestbook), hooks (route fee, threat spike, hangar kit, sell bonus, part drops), persistence across a fired run, late join sync, dispose.
//   node tools/harness/shipyard_install.test.mjs
import assert from 'node:assert/strict';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {}, classList: { contains: () => false }, appendChild() {} });
const dom = () => ({ createElement: () => cv(), getElementById: () => null, body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null });
globalThis.document = dom();
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };
let CLOCK = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => CLOCK }, configurable: true });

const THREE = await import('three');
const { buildShip, SHIP_EXTRA, insideShip } = await import('../../src/world/ship.js');
const { installShipyard } = await import('../../src/game/shipyard.js');
const Y = await import('../../src/game/shipyard_core.js');
const { ITEMS } = await import('../../src/game/items.js');
const { SOCKETS } = await import('../../src/world/hardpoints.js');
const { HULL } = await import('../../src/game/siege_core.js');
const { CRUISER } = await import('../../src/entities/cruiser.js');

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };

// ---------------------------------------------------------------------------------------------- fakes
let colId = 0;
const physics = { cols: new Set(), addStaticBox() { const c = { id: ++colId }; this.cols.add(c); return c; }, removeCollider(c) { this.cols.delete(c); }, world: { intersectionsWithShape() {} } };
const lightPool = { emitters: new Set(), add(e) { this.emitters.add(e); return e; }, remove(e) { this.emitters.delete(e); } };
const scene = new THREE.Scene();
const ship = buildShip({ physics, lightPool, scene });

function makeGame({ isHost = true, profile = null } = {}) {
  const handlers = new Map(), listeners = new Map(), sent = [], bcasts = [];
  const mods = {
    _on: new Map(), commands: new Map(), itemModels: new Map(), api: { registerCommand(n, fn, h) { mods.commands.set(n, { fn, help: h }); } },
    on(ev, fn) { (this._on.get(ev) || this._on.set(ev, []).get(ev)).push(fn); return () => { const a = this._on.get(ev); a.splice(a.indexOf(fn), 1); }; },
    emit(ev, ...args) { for (const fn of [...(this._on.get(ev) || [])]) fn(...args); },
  };
  const net = {
    hostId: 'H', bcasts, sent, handlers: listeners,
    request(op, d) { const h = handlers.get(op); if (h) h(d, game.selfId); },
    broadcast(type, d) { bcasts.push([type, d]); for (const fn of listeners.get('msg:' + type) || []) fn(d, 'H'); },
    sendTo(id, type, d) { sent.push([id, type, d]); if (id === game.selfId) for (const fn of listeners.get('msg:' + type) || []) fn(d, 'H'); },
    send() {}, on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const a = listeners.get(ev); if (a) a.splice(a.indexOf(fn), 1); },
  };
  const items = new Map(); let iid = 0;
  const player = { pos: new THREE.Vector3(0, 0.05, 0), dead: false, hp: 50, maxHp: 100, stamina: 10, maxStamina: 100, teleport(p) { this.pos.copy(p); }, heldItem: () => null };
  const spawned = [];
  const game = {
    isHost, selfId: 'H', destroyed: false, time: 0, mods, net, ship, physics, lights: lightPool, scene, remotes: new Map(),
    profile: profile || { name: 'Host', bestiary: { lurker: { seen: 1, kills: 4 } }, blueprints: {} }, progress: { saves: 0, save() { this.saves++; } },
    run: { phase: 'orbit', credits: 5000, day: 3, moon: 'hamsi', quota: 300, sold: 0 }, hostData: { dayStats: { deaths: [] } },
    ui: { toasts: [], toast(s) { this.toasts.push(s); }, panelOpen: null, openPanel() {}, hud: {} }, audio: { play() {} }, engine: {}, player, anomaly: null, balance: { model: { spikes: [], addSpike(v) { this.spikes.push(v); } } },
    items: {
      all: () => items.values(), get: (id) => items.get(id), inShipItems: () => [...items.values()].filter((it) => it.state === 'world' && insideShip(it.obj.position)),
      hostSpawn(type, pos, o = {}) { const id = 'i' + ++iid; const it = { id, type, def: ITEMS[type] || { kind: 'scrap' }, holder: o.holder || null, state: 'world', obj: { position: pos.clone() }, value: 10, label: o.label }; items.set(id, it); spawned.push(type); return id; },
    },
    aiPlayers: () => [{ id: 'H', pos: player.pos, dead: player.dead }, ...[...game.remotes.values()].map((r) => ({ id: r.id, pos: r.pos, dead: r.dead }))],
    playerName: (id) => (id === 'H' ? 'Host' : game.remotes.get(id)?.name || id),
    later(fn) { fn(); return 0; }, broadcastRun(keys) { net.bcasts.push(['gs', keys]); }, respawn() { player.dead = false; }, hostSell(from) { game._soldRate = game.run.favor || 1; },
    creatures: { host: new Map(), damage(id, dmg) { const c = game.creatures.host.get(id); if (c) c.hp -= dmg; } },
    hostOnCreatureKilled() {}, crafting: {},
    _items: items, _spawned: spawned, _handlers: handlers,
  };
  const oldOn = mods.on.bind(mods);
  mods.on = (ev, fn) => (ev === 'registerHandlers' ? (fn((op, h) => handlers.set(op, h), game), () => {}) : oldOn(ev, fn));
  return game;
}
const tick = (game, n = 1, dt = 0.4) => { for (let i = 0; i < n; i++) { game.time += dt; game.mods.emit('update', dt, game); } };
const p = (game, name) => game.mods._on.get(name);

// ---------------------------------------------------------------------------------------------- tests
const game = makeGame();
const sy = installShipyard(game);
ok('installs, registers items + SHIPYARD command + part models', () => {
  assert.ok(sy); assert.ok(game.mods.commands.has('shipyard'));
  for (const k of Y.PART_KEYS) { assert.ok(ITEMS[Y.PARTS[k].id], k); assert.ok(game.mods.itemModels.has(Y.PARTS[k].id)); }
  assert.equal(typeof game.crafting.timeMul, 'function');
});
ok('hostStart attaches the profile state into run.sy', () => { game.mods.emit('hostStart', game); assert.ok(game.run.sy); assert.equal(game.profile.shipyard, game.run.sy); tick(game, 2); });
ok('frame console is built (a permanent obstacle for panel placement)', () => { assert.ok(ship.group.getObjectByName('shipyard_frame_console')); assert.ok(sy.built); });
ok('all hardpoint seals are shut without modules', () => { for (const hp of Object.values(ship.hardpoints)) { assert.equal(hp.open, false); assert.ok(hp.collider); } assert.equal(SHIP_EXTRA.length, 0); });

const at = (x, y, z) => game.player.pos.set(x, y, z);
const act = (op, d = {}) => { CLOCK += 100000; game.net.bcasts.length = 0; game.ui.toasts.length = 0; game._handlers.get('syact')({ op, ...d }, 'H'); tick(game, 1, 0.4); };
const lastErr = () => game.ui.toasts[game.ui.toasts.length - 1] || '';

ok('buy a module with credits: doorway opens, aboard volume, hull box grows, run.sy persists', () => {
  at(0, 0.05, 0);
  act('install', { id: 'cargo', sock: 'R1', via: 'credits' });
  assert.equal(game.run.credits, 5000 - 220);
  assert.equal(Y.tierOf(game.profile.shipyard, 'cargo'), 1);
  assert.equal(ship.hardpoints.R1.open, true); assert.equal(ship.hardpoints.R1.collider, null); assert.ok(SHIP_EXTRA.length >= 1);
  assert.ok(insideShip(new THREE.Vector3(10, 1, 0))); assert.ok(!insideShip(new THREE.Vector3(30, 1, 0)));
  assert.ok(HULL.x1 > 12); assert.ok(game.progress.saves >= 1);
  assert.ok(sy.socketBuilt('cargo')); assert.ok(lightPool.emitters.size >= 1);
});
ok('opening the doorway removed the wall seal only, not the walls', () => { assert.equal(ship.hardpoints.N1.open, false); assert.ok(ship.hardpoints.N1.collider); });
ok('refuses while the ship is landed', () => { game.run.phase = 'moon'; act('install', { id: 'lab', sock: 'N1', via: 'credits' }); assert.match(lastErr(), /orbit/); game.run.phase = 'orbit'; });
ok('parts need the Frame Console; deposit + build from parts', () => {
  at(0, 0.05, 0); act('deposit'); assert.match(lastErr(), /Frame Console|Hold ship parts/);
  const c = game.ship.group.getObjectByName('shipyard_frame_console'); assert.ok(c);
  at(-4.9, 0.05, 2.5);
  for (const k of Y.PART_KEYS) for (let i = 0; i < 6; i++) game.items.hostSpawn(Y.PARTS[k].id, new THREE.Vector3(), { holder: 'H' });
  act('deposit'); assert.equal(game.profile.shipyard.parts.plate, 6);
  act('install', { id: 'medbay', sock: 'N1', via: 'parts' });
  assert.equal(Y.tierOf(game.profile.shipyard, 'medbay'), 1); assert.equal(game.run.credits, 5000 - 220);
  assert.equal(ship.hardpoints.N1.open, true);
});
ok('chained module needs its parent; roof modules build lift + deck', () => {
  at(0, 0.05, 0);
  act('install', { id: 'lounge', sock: 'N3', via: 'credits' }); assert.equal(Y.tierOf(game.profile.shipyard, 'lounge'), 1);
  act('install', { id: 'obs', sock: 'DECK', via: 'credits' }); act('install', { id: 'turret', sock: 'TURRET', via: 'credits' });
  tick(game, 3);
  assert.ok(sy.socketBuilt('obs')); assert.ok(sy.socketBuilt('turret')); assert.ok(ship.group.getObjectByName('shipyard_lift'));
  assert.ok(insideShip(new THREE.Vector3(0, 4.5, 0))); assert.ok(!insideShip(new THREE.Vector3(0, 10, 0)));
  act('sell', { id: 'medbay' }); assert.match(lastErr(), /behind/);
});
ok('route fee: +5% per module even on free travel, HQ untouched', () => {
  const n = Y.count(game.profile.shipyard);
  const moon = { id: 'x', cost: 200 };
  assert.equal(sy.routeFee(moon, false), Math.round(200 * (1 + 0.05 * n * (1 - Y.effects(game.profile.shipyard).weightCut))));
  assert.ok(sy.routeFee(moon, true) > 0);
  assert.equal(sy.routeFee({ company: true, cost: 0 }, true), 0);
});
ok('phase moon: threat spike for a heavy hull', () => { game.balance.model.spikes.length = 0; game.mods.emit('phase', 'moon', game); assert.ok(game.balance.model.spikes[0] >= 2); });
ok('hangar kit spawns on landing', () => {
  at(0, 0.05, 0);
  act('install', { id: 'hangar', sock: 'R2', via: 'credits' }); tick(game, 3);
  game._spawned.length = 0; game.mods.emit('phase', 'moon', game);
  assert.ok(game._spawned.includes('glowstick'));
});
ok('sell bonus wraps hostSell at HQ', () => { game.profile.shipyard.m.R1.t = 3; game.run.sy = game.profile.shipyard; tick(game, 2); game.run.phase = 'company'; game.hostSell('H'); assert.ok(Math.abs(game._soldRate - 1.09) < 1e-9); assert.equal(game.run.favor, undefined); game.run.phase = 'orbit'; });
ok('paint + name plate cost credits and persist', () => {
  at(0, 0.05, 0); const before = game.run.credits;
  act('paint', { c1: 'sea', c2: 'bone', pat: 'checker', theme: 'rust', name: 'Big Chungus' });
  assert.equal(game.profile.shipyard.name, 'BIG CHUNGUS'); assert.equal(game.run.credits, before - 40); tick(game, 3);
  assert.ok(ship.group.getObjectByName('shipyard_paint'));
});
ok('revive pad: a body on the pad + credits brings a dead crewmate back (death fine removed)', () => {
  game.remotes.set('P2', { id: 'P2', name: 'Kefal', pos: new THREE.Vector3(3, 1, 3), dead: true });
  game.hostData.dayStats.deaths.push({ id: 'P2', name: 'Kefal', cause: 'x' });
  const pad = sy.socketBuilt('medbay').b.points.pad;
  game.items.hostSpawn('body', new THREE.Vector3(pad.x, pad.y + 0.4, pad.z), { label: 'Kefal' });
  const cr = game.run.credits; at(pad.x, pad.y, pad.z);
  act('revive');
  assert.equal(game.run.credits, cr - Y.effects(game.profile.shipyard).reviveCost);
  assert.equal(game.hostData.dayStats.deaths.length, 0); assert.ok(game.net.sent.some((s) => s[0] === 'P2' && s[2].k === 'revive'));
});
ok('revive without a body / broke is refused', () => { const pad = sy.socketBuilt('medbay').b.points.pad; at(pad.x, pad.y, pad.z); act('revive'); assert.match(lastErr(), /body/); });
ok('treatment bed heals with a cooldown', () => {
  const bed = sy.socketBuilt('medbay').b.points.bed; at(bed.x, bed.y, bed.z);
  game.player.hp = 20; act('heal'); assert.ok(game.player.hp > 20); const hp = game.player.hp; CLOCK -= 99000; act('heal'); assert.match(lastErr(), /Wait/); assert.equal(game.player.hp, hp);
});
ok('lab analyzer eats a strange item and returns components', () => {
  at(0, 0.05, 0); act('install', { id: 'lab', sock: 'N4', via: 'credits' }); assert.match(lastErr() || '', /./);
  act('install', { id: 'workshop', sock: 'N2', via: 'credits' }); act('install', { id: 'lab', sock: 'N4', via: 'credits' });
  assert.equal(Y.tierOf(game.profile.shipyard, 'lab'), 1);
  const an = sy.socketBuilt('lab').b.points.analyzer; at(an.x, an.y, an.z);
  const id = game.items.hostSpawn('strange_blackbox', new THREE.Vector3(), { holder: 'H' }); game._spawned.length = 0;
  act('analyze', { id, bps: [] });
  assert.ok(game._spawned.length >= 1); assert.equal(game._items.get(id)._syUsed, true);
});
ok('trophy guestbook: once per game day, xp from the bestiary', () => {
  at(0, 0.05, 0); act('sell', { id: 'lounge' }); act('install', { id: 'trophy', sock: 'N3', via: 'credits' });
  assert.equal(Y.tierOf(game.profile.shipyard, 'trophy'), 1); tick(game, 2);
  const bk = sy.socketBuilt('trophy').b.points.book; at(bk.x, bk.y, bk.z);
  game.net.bcasts.length = 0; act('guest');
  const xp = game.net.bcasts.find((b) => b[0] === 'xp'); assert.ok(xp && xp[1].xp > 0, 'first signature pays');
  act('guest'); assert.match(lastErr(), /already/);
  game.run.day += 1; act('guest'); assert.ok(game.net.bcasts.some((b) => b[0] === 'xp'));
});
ok('terminal command routes to requests', () => {
  const out = []; const term = { print: (x) => out.push(x), close() {} };
  game.mods.commands.get('shipyard').fn(['list'], term); assert.match(out.join('\n'), /SHIPYARD/);
  CLOCK += 100000; game.mods.commands.get('shipyard').fn(['upgrade', 'turret'], term); tick(game, 1);
  assert.equal(Y.tierOf(game.profile.shipyard, 'turret'), 2);
  game.mods.commands.get('shipyard').fn(['buy', 'nothing'], term); assert.ok(out.some((x) => /Unknown module/.test(x)));
});
ok('turret shoots creatures in range (host)', () => {
  game.run.phase = 'moon';
  game.creatures.host.set('c1', { id: 'c1', pos: new THREE.Vector3(10, 4, 12), dead: false, hp: 100, maxHp: 100, def: { height: 1.6 }, state: 'walk' });
  tick(game, 8, 0.25);
  assert.ok(game.creatures.host.get('c1').hp < 100);
  game.run.phase = 'orbit';
});
ok('chest / boss / siege / extraction drop ship parts (host)', () => {
  game._spawned.length = 0;
  for (let i = 0; i < 200; i++) game.mods.emit('tfg:chestOpened', { tier: 'gold', pos: [1, 1, 1] });
  assert.ok(game._spawned.some((x) => x.startsWith('sy_')));
  game._spawned.length = 0; game.hostOnCreatureKilled({ def: { boss: true }, pos: new THREE.Vector3() }, 'H'); assert.equal(game._spawned.filter((x) => x.startsWith('sy_')).length, Y.REWARD_PARTS.boss);
  game._spawned.length = 0; game.mods.emit('tfg:siegeState', { phase: 'done', result: 'held' }); assert.equal(game._spawned.length, Y.REWARD_PARTS.siege);
  game._spawned.length = 0; game.mods.emit('tfg:extraction', { phase: 'end', success: true }); assert.equal(game._spawned.length, Y.REWARD_PARTS.extraction);
});
ok('a fired run clears run.sy; the orbit phase re-attaches the profile ship', () => {
  const s = game.profile.shipyard; delete game.run.sy; game.mods.emit('phase', 'orbit', game);
  assert.equal(game.run.sy, game.profile.shipyard); assert.deepEqual(game.run.sy, s); assert.ok(Y.count(s) >= 4);
});
ok('late join: a client with only run.sy renders the same ship', () => {
  const shipB = buildShip({ physics: { ...physics, cols: new Set() }, lightPool: { emitters: new Set(), add: (e) => e, remove() {} }, scene: new THREE.Scene() });
  const g2 = makeGame({ isHost: false }); g2.ship = shipB; g2.physics = { addStaticBox: () => ({}), removeCollider() {} }; g2.lights = { add: (e) => e, remove() {} }; g2.selfId = 'C';
  const c = installShipyard(g2);
  g2.run = { phase: 'orbit', credits: 1, sy: JSON.parse(JSON.stringify(game.run.sy)) };
  tick(g2, 3);
  assert.equal(Y.count(c.state()), Y.count(game.run.sy)); assert.ok(shipB.hardpoints.R1.open); assert.ok(c.socketBuilt('cargo'));
  c.dispose(); assert.equal(shipB.hardpoints.R1.open, false);
});
// ---- [shipdeck] Upper Deck: host-authoritative purchase through syact, the mirrored state drives the deck module on every peer
const { installShipdeck } = await import('../../src/game/shipdeck.js');
game.shipyard = sy; const sd = installShipdeck(game); game.shipdeck = sd;
ok('deck: bought through syact (deckup / deckroom), the hatch opens, deck meshes + colliders appear, rooms need Mk II, all state is in profile.shipyard.deck', () => {
  game.run.credits = 9000; const D0 = physics.cols.size; at(0, 0.05, 0);
  assert.equal(ship.deckHatch.open, false); assert.equal(sd.tier(), 0);
  const cr0 = game.run.credits;
  act('deckup', { via: 'credits' }); tick(game, 2);
  assert.equal(game.run.credits, cr0 - 450); assert.equal(game.profile.shipyard.deck.t, 1); assert.equal(sd.tier(), 1);
  assert.equal(ship.deckHatch.open, true); assert.equal(ship.deckHatch.collider, null); assert.ok(ship.group.getObjectByName('ship_upper_deck'));
  assert.ok(physics.cols.size >= D0 + 20, 'deck colliders ' + (physics.cols.size - D0));
  act('deckroom', { slot: 0, room: 'bunk' }); assert.match(lastErr(), /slot|built/i);
  act('deckup', { via: 'credits' }); act('deckup', { via: 'credits' }); tick(game, 2);
  assert.equal(sd.tier(), 3);
  act('deckroom', { slot: 3, room: 'lounge' }); act('deckroom', { slot: 0, room: 'turret' }); tick(game, 2);
  assert.deepEqual(game.profile.shipyard.deck.rooms, ['turret', null, null, 'lounge']); assert.deepEqual(sd.rooms(), ['turret', null, null, 'lounge']);
  assert.ok(ship.group.getObjectByName('deck_glass') && ship.group.getObjectByName('deck_glow'), 'dome glass + emissive');
  let n = 0; ship.group.getObjectByName('ship_upper_deck').traverse((o) => { if (o.isMesh) n++; }); assert.ok(n <= 8, 'deck draw calls ' + n);
  const before = physics.cols.size; act('deckroom', { slot: 3, room: null }); assert.deepEqual(game.profile.shipyard.deck.rooms, ['turret', null, null, null]); assert.ok(physics.cols.size < before);
  assert.equal(Y.effects(game.profile.shipyard).deck, 3);
});
ok('deck: refused while the ship is landed, and at the max tier', () => {
  game.run.phase = 'moon'; act('deckroom', { slot: 1, room: 'store' }); assert.match(lastErr(), /orbit/); game.run.phase = 'orbit';
  const cr = game.run.credits; act('deckup', { via: 'credits' }); assert.match(lastErr(), /Mk III/); assert.equal(game.run.credits, cr);
});
ok('deck: a late joiner (fresh module on a fresh ship, only run.sy) builds the same deck', () => {
  const shipC = buildShip({ physics, lightPool, scene: new THREE.Scene() });
  const gC = { ...game, ship: shipC, isHost: false, selfId: 'C', profile: {}, run: { ...game.run, sy: JSON.parse(JSON.stringify(game.profile.shipyard)) }, shipyard: { state: () => Y.sanitize(game.run.sy) } };
  const c = installShipdeck(gC); tick(gC, 2);
  assert.equal(c.tier(), 3); assert.equal(shipC.deckHatch.open, true); assert.ok(shipC.group.getObjectByName('ship_upper_deck')); c.dispose(); assert.equal(shipC.deckHatch.open, false);
});
ok('dispose restores the shared globals', () => {
  sd.dispose(); assert.equal(ship.deckHatch.open, false);
  sy.dispose();
  assert.equal(SHIP_EXTRA.length, 0); assert.equal(HULL.x1, 7.6); assert.equal(CRUISER.dockRadius, 38);
  for (const hp of Object.values(ship.hardpoints)) assert.equal(hp.open, false);
  assert.equal(physics.cols.size > 0, true);
});
console.log(`\n${pass} passed${process.exitCode ? ', with FAILURES' : ''}`);
void SOCKETS; void p;
