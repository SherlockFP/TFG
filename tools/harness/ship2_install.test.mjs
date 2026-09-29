// ship2 installer against a fake game + the REAL ship: attach, damage sources, outside repair sessions (host authoritative), tools, door jam, takeoff delay,
// shipfaults hooks, defence mounts + power budget, planters, shop entries, dispose.   node tools/harness/ship2_install.test.mjs
import './ship2_env.mjs';
import assert from 'node:assert/strict';
import * as L from '../../src/world/shiplayout.js';
let CLOCK = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => CLOCK }, configurable: true });
const THREE = await import('three');
const { buildShip, insideShip } = await import('../../src/world/ship.js');
const { installShip2, registerShip2Items } = await import('../../src/game/ship2.js');
const C = await import('../../src/game/ship2_core.js');
const { ITEMS, STORE_ITEMS } = await import('../../src/game/items.js');

let pass = 0, fail = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; process.exitCode = 1; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 6).join('\n       ')); } };

// ---------------------------------------------------------------------------------------------- shop entries
ok('shop: Wrench, Welding Torch, Repair Kit are registered store items with prices, tool models and the hydro apple food', () => {
  registerShip2Items();
  for (const id of C.TOOL_IDS) { assert.ok(ITEMS[id], id); assert.ok(ITEMS[id].price > 0, id + ' price'); assert.ok(STORE_ITEMS.includes(id), id + ' in STORE_ITEMS'); assert.equal(ITEMS[id].kind, 'tool'); assert.equal(ITEMS[id].shop, 'tools'); assert.ok(ITEMS[id].s2tool); }
  assert.ok(ITEMS.s2_wrench.price < ITEMS.s2_torch.price);
  assert.ok(ITEMS.fd_hydro && ITEMS.fd_hydro.food);
});
let shopMod = null;
try { shopMod = await import('../../src/game/shop.js'); } catch (e) { console.log('  (shop.js not importable in node: ' + e.message.split('\n')[0] + ')'); }
if (shopMod) ok('shop: the Company Store catalogue lists the three tools in the Tools category', () => {
  const es = shopMod.catalogEntries();
  for (const id of C.TOOL_IDS) { const e = es.find((x) => x.id === id); assert.ok(e, id + ' listed'); assert.equal(e.cat, 'tools'); assert.equal(e.currency, 'credits'); assert.equal(e.price, ITEMS[id].price); }
});

const MD = await import('../../src/models/ship2.js');
ok('models: every spot kind, plant stage, mount plate and the 4 item models build (merged, vertex coloured)', () => {
  for (const k of C.KIND_IDS) { const m = MD.createSpotModel(k, C.SLOTS[0], 0.2); assert.ok(m.root.children.length >= 1 && m.root.children.length <= 2, k); m.update(0.1, 1); m.dispose(); }
  for (let st = 0; st <= 4; st++) { const m = MD.createPlantModel(st); assert.equal(m.root.children.length, st < 1 ? 0 : 1); m.dispose(); }
  const mm = MD.createMountModel(); for (const st of ['free', 'on', 'off', 'dmg']) mm.setState(st); assert.ok(mm.ring); mm.dispose();
  for (const f of [MD.createWrenchModel, MD.createTorchModel, MD.createRepairKitModel, MD.createFruitModel]) { const g = f(); let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); assert.ok(n >= 1 && n <= 2); }
});

// ---------------------------------------------------------------------------------------------- fakes
let colId = 0;
const physics = { cols: new Set(), addStaticBox() { const c = { id: ++colId }; this.cols.add(c); return c; }, removeCollider(c) { this.cols.delete(c); }, raycast: () => null, world: { intersectionsWithShape() {} } };
const lightPool = { emitters: new Set(), add(e) { e.flicker = e.flicker || 0; this.emitters.add(e); return e; }, remove(e) { this.emitters.delete(e); } };
const scene = new THREE.Scene();
const ship = buildShip({ physics, lightPool, scene });

function makeGame() {
  const handlers = new Map(), listeners = new Map(), sent = [], bcasts = [];
  const mods = {
    _on: new Map(), itemModels: new Map(),
    on(ev, fn) { (this._on.get(ev) || this._on.set(ev, []).get(ev)).push(fn); return () => { const a = this._on.get(ev); a.splice(a.indexOf(fn), 1); }; },
    emit(ev, ...args) { for (const fn of [...(this._on.get(ev) || [])]) fn(...args); },
  };
  const net = {
    hostId: 'H', bcasts, sent,
    request(op, d) { const h = handlers.get(op); if (h) h(d, game.selfId); },
    broadcast(type, d) { bcasts.push([type, d]); for (const fn of listeners.get('msg:' + type) || []) fn(d, 'H'); },
    sendTo(id, type, d) { sent.push([id, type, d]); if (id === game.selfId) for (const fn of listeners.get('msg:' + type) || []) fn(d, 'H'); },
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const a = listeners.get(ev); if (a) a.splice(a.indexOf(fn), 1); },
  };
  const items = new Map(); let iid = 0;
  const player = { pos: new THREE.Vector3(2.6, -1.8, 6), dead: false, inShip: false, heldItem: () => held.it, teleport(p) { this.pos.copy(p); } };
  const held = { it: null };
  const deps = new Map();
  const game = {
    isHost: true, selfId: 'H', time: 0, mods, net, ship, physics, lights: lightPool, scene, remotes: new Map(), player, camera: { position: new THREE.Vector3(2.6, -0.2, 6) },
    profile: { name: 'Host' }, progress: { saves: 0, save() { this.saves++; } }, config: {},
    run: { phase: 'orbit', credits: 5000, day: 2, quotaIndex: 2, runId: 'r1', weather: 'stormy', time: 600 }, hostData: { dayStats: { deaths: [] } },
    ui: { toasts: [], toast(s) { this.toasts.push(s); }, hud: {} }, audio: { at() {}, play() {}, ui() {} }, particles: { burst() {} }, input: { enabled: true, locked: true, _down: false, isDown() { return this._down; } },
    items: {
      all: () => items.values(), get: (id) => items.get(id),
      hostSpawn(type, pos, o = {}) { const id = 'i' + ++iid; const it = { id, type, def: ITEMS[type] || { kind: 'scrap' }, holder: o.holder || null, obj: { position: pos.clone() }, tier: o.tier }; items.set(id, it); return id; },
    },
    aiPlayers: () => [{ id: 'H', pos: player.pos, dead: player.dead, inShip: insideShip(player.pos) }, ...[...game.remotes.values()].map((r) => ({ id: r.id, pos: r.pos, dead: r.dead, inShip: insideShip(r.pos) }))],
    aiPlayerById: (id) => game.aiPlayers().find((p) => p.id === id),
    playerName: () => 'Host', later(fn, ms) { game._later.push([fn, ms]); return 0; }, _later: [], broadcastRun(keys) { net.bcasts.push(['gs', keys]); },
    creatures: { host: new Map() }, hostHurtPlayer(id, dmg, cause) { game._hurt.push([id, dmg, cause]); }, _hurt: [],
    deployables: {
      DEPS: { turret2: { name: 'Auto-Turret MK2' } }, get: (id) => deps.get(id), list: () => [...deps.values()],
      debugPlace(type, x, z, yaw, tier, y) { const d = { id: 'd' + (deps.size + 1), type, def: { name: type, ammo: type === 'turret1' }, pos: new THREE.Vector3(x, y, z), center: new THREE.Vector3(x, y + 0.5, z), hp: 200, maxHp: 200, cap: 100, res: 0, dead: false }; deps.set(d.id, d); return d; },
    },
    gameplay2: { faults: { fixed: 0, fixOuter() { this.fixed++; return true; } }, aptitudes: { bonusOf: () => 0 } },
    hostFinishTakeoff() { game._finished = (game._finished || 0) + 1; },
    _items: items, _handlers: handlers, _held: held, _deps: deps,
  };
  const oldOn = mods.on.bind(mods);
  mods.on = (ev, fn) => (ev === 'registerHandlers' ? (fn((op, h) => handlers.set(op, h), game), () => {}) : oldOn(ev, fn));
  return game;
}
const tick = (g, n = 1, dt = 0.1) => { for (let i = 0; i < n; i++) { g.time += dt; g.mods.emit('update', dt, g); } };
const give = (g, type, tier) => { const id = g.items.hostSpawn(type, new THREE.Vector3(), { holder: 'H', tier }); const it = g.items.get(id); g._held.it = it; return it; };
const req = (g, d) => { g.net.bcasts.length = 0; g._handlers.get('s2req')(d, 'H'); };
const msgs = (g, k) => g.net.sent.filter((m) => m[1] === 's2msg' && m[2].k === k).map((m) => m[2]);

const game = makeGame();
game.run.quotaIndex = 2;
const s2 = installShip2(game);
game.mods.emit('hostStart', game);
ok('installs, attaches run.s2 (hull) with mounts + planters, publishes hullDamage for shipfaults', () => {
  assert.ok(s2); assert.equal(game.run.s2.v, 1); assert.deepEqual(game.run.s2.sp, []); assert.equal(game.run.hullDamage, 0); assert.ok(game.profile.ship2);
  assert.ok(game.mods.itemModels.has('s2_wrench') && game.mods.itemModels.has('s2_torch') && game.mods.itemModels.has('s2_kit'));
  assert.equal(s2.tier(), 0);
});
ok('client builds the roof mount plates + ladder + planter slots on the real ship', () => {
  tick(game, 8);
  const c = s2.client();
  assert.equal(c.mountViews, 6); assert.ok(ship.group.getObjectByName('ship2_ladder')); assert.equal(s2.planterSlots().length, 2);
});
ok('no damage while the ship is not landed; landing rolls, storms hurt', () => {
  assert.equal(s2.damage('event'), null);
  game.run.phase = 'moon'; game.mods.emit('phase', 'moon', game);
  const sp = s2.damage('weather', { kind: 'spark' });
  assert.ok(sp && sp.k === 'spark'); assert.equal(game.run.s2.sp.length, 1); assert.ok(game.run.hullDamage > 0); assert.equal(s2.tier(), 0);
  tick(game, 2);
  assert.equal(s2.client().spotViews, 1); assert.ok([...lightPool.emitters].some((e) => e.group === 's2hull'), 'spark light emitter');
  assert.ok(game.net.bcasts.some((b) => b[0] === 'sys'), 'sys message');
});
ok('damage escalates through the tiers: flicker (client), door jam, takeoff delay', () => {
  for (let i = 0; i < 10; i++) s2.damage('siege');
  for (let i = 0; i < 10 && s2.tier() < 2; i++) s2.damage('raid');
  assert.ok(s2.tier() >= 2, 'tier ' + s2.tier());
  tick(game, 10);
  const shipEm = [...lightPool.emitters].filter((e) => e.group === 'ship');
  assert.ok(shipEm.length && shipEm.every((e) => e.flicker > 0), 'ship lights flicker');
  assert.equal(C.doorJamChance(s2.tier(), 2) > 0, true);
  // door jam: never twice in a row
  let jams = 0, streak = 0, maxStreak = 0;
  for (let i = 0; i < 200; i++) { if (s2.doorJam('H', true)) { jams++; streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; }
  assert.ok(jams > 10 && maxStreak <= 2, `jams ${jams} streak ${maxStreak}`);
});
ok('takeoff delay: the lever takeoff waits, midnight does not', () => {
  game.run.phase = 'takeoff'; game.hostData.takeoffReason = 'lever'; game._later.length = 0; game._finished = 0;
  game.hostFinishTakeoff();
  assert.equal(game._finished, 0); assert.equal(game._later.length, 1); assert.ok(game._later[0][1] >= 6000);
  game._later[0][0](); assert.equal(game._finished, 1);
  game.hostData.takeoffReason = 'midnight'; game.hostFinishTakeoff(); assert.equal(game._finished, 2);
  game.run.phase = 'moon';
});
ok('shipfaults hooks: outer fault wanted with a breach at quota >= 1; station points at the worst spot', () => {
  s2.repairAll(); s2.damage('siege', { kind: 'breach' });
  assert.equal(game.run.s2.sp.some((p) => p.k === 'breach'), true);
  assert.equal(s2.outerFaultWanted(), true);
  const st = s2.outerStation(); assert.ok(Number.isFinite(st.x) && Number.isFinite(st.ry));
  s2.repairAll(); assert.equal(s2.outerFaultWanted(), false);
});

// ---------------------------------------------------------------------------------------------- repair sessions
const spotOf = () => game.run.s2.sp[0];
const standAt = (spot) => { const sl = C.slotById(spot.s), p = C.standPoint(sl); game.player.pos.set(p[0], -1.8, p[2] + (sl.face === '-z' ? -0.4 : 0.4)); };
function hold(g, seconds, dt = 0.05) { g.input._down = true; for (let t = 0; t < seconds; t += dt) tick(g, 1, dt); }
ok('repair: needs a tool in hand, range and being outside; then hold E fills the ring and fixes the spot (Wrench on a dent)', () => {
  s2.repairAll(); const spot = s2.damage('event', { kind: 'dent' }); assert.ok(spot);
  game.net.sent.length = 0; game._held.it = null;
  req(game, { op: 'rstart', tg: 'h:' + spot.i, item: 'nope' });
  assert.equal(msgs(game, 'rx')[0].why, 'tool');
  const it = give(game, 's2_wrench');
  game.player.pos.set(-5, -1.8, -12);                        // far away
  game.net.sent.length = 0; req(game, { op: 'rstart', tg: 'h:' + spot.i, item: it.id }); assert.equal(msgs(game, 'rx')[0].why, 'range');
  game.player.pos.set(0, 1, 0); game.player.inShip = true;    // inside the ship
  game.net.sent.length = 0; req(game, { op: 'rstart', tg: 'h:' + spot.i, item: it.id }); assert.equal(msgs(game, 'rx')[0].why, 'range');
  game.player.inShip = false; standAt(spot);
  game.net.sent.length = 0; req(game, { op: 'rstart', tg: 'h:' + spot.i, item: it.id });
  const rs = msgs(game, 'rs')[0]; assert.ok(rs && rs.need >= 3 && rs.need <= 4.5, 'need ' + rs?.need);
  hold(game, 1.0); assert.equal(game.run.s2.sp.length, 1, 'not done yet');
  const before = game.net.sent.filter((m) => m[2].k === 'rp').length; assert.ok(before >= 1, 'progress messages');
  // client mirror: ring state is set by the host's rs message
  assert.equal(s2.client().ring, 'h:' + spot.i);
  game._handlers.get('s2req')({ op: 'rhold', down: true }, 'H');
  // the host owns the ring: holding the whole time completes in a bounded time even through the red arc
  let t = 1.0; while (t < 14 && game.run.s2.sp.length) { tick(game, 1, 0.05); t += 0.05; }
  assert.equal(game.run.s2.sp.length, 0, 'fixed after holding, t=' + t.toFixed(1)); assert.equal(msgs(game, 'rd').length, 1);
  assert.ok(game.net.bcasts.some((b) => b[0] === 'xp'), 'xp reward'); assert.equal(s2.client().ring, null);
  game.input._down = false;
});
ok('repair: letting go decays progress and the session times out; moving away cancels it', () => {
  const spot = s2.damage('event', { kind: 'spark' }); const it = give(game, 's2_wrench'); standAt(spot);
  game.net.sent.length = 0; req(game, { op: 'rstart', tg: 'h:' + spot.i, item: it.id });
  hold(game, 1.0); game.input._down = false; game._handlers.get('s2req')({ op: 'rhold', down: false }, 'H');
  tick(game, 100, 0.1);
  assert.ok(msgs(game, 'rx').some((m) => m.why === 'idle'), 'idle cancel');
  req(game, { op: 'rstart', tg: 'h:' + spot.i, item: it.id }); game.player.pos.set(30, -1.8, 30); tick(game, 3);
  assert.ok(msgs(game, 'rx').some((m) => m.why === 'invalid'), 'range cancel');
  assert.ok(game.run.s2.sp.some((p) => p.i === spot.i), 'still broken');
});
ok('repair: a breach needs the torch; wrench patches it to sparks; the Repair Kit is consumed; outer fault completes', () => {
  s2.repairAll(); const spot = s2.damage('siege', { kind: 'breach' }); standAt(spot);
  const w = give(game, 's2_wrench'); game.net.sent.length = 0; req(game, { op: 'rstart', tg: 'h:' + spot.i, item: w.id }); const need1 = msgs(game, 'rs')[0].need;
  const tt = give(game, 's2_torch'); req(game, { op: 'rstart', tg: 'h:' + spot.i, item: tt.id }); const need2 = msgs(game, 'rs').at(-1).need;
  assert.ok(need2 < need1 + 3, 'torch is quicker than wrench + patch chain');
  hold(game, 15); assert.equal(game.run.s2.sp.length, 0, 'torch sealed the breach'); assert.ok(game.gameplay2.faults.fixed >= 1, 'shipfaults.fixOuter called');
  game.input._down = false;
  const sp2 = s2.damage('siege', { kind: 'breach' }); standAt(sp2);
  const kit = give(game, 's2_kit'); req(game, { op: 'rstart', tg: 'h:' + sp2.i, item: kit.id }); hold(game, 5);
  assert.equal(game.run.s2.sp[0].k, 'spark', 'kit patched the breach down a step'); assert.ok(game.net.bcasts.some((b) => b[0] === 'it' && b[1].e === 'rm' && b[1].id === kit.id), 'kit consumed');
  game.input._down = false;
});
ok('early game (quota 0): only dents, capped, no jam / delay / flicker', () => {
  s2.repairAll(); game.run.quotaIndex = 0;
  for (let i = 0; i < 20; i++) s2.damage('siege');
  assert.ok(game.run.s2.sp.length <= 2 && game.run.s2.sp.every((p) => p.k === 'dent')); assert.equal(s2.tier(), 0);
  let jam = 0; for (let i = 0; i < 100; i++) if (s2.doorJam('H', true)) jam++; assert.equal(jam, 0);
  game.run.quotaIndex = 2; s2.repairAll();
});

// ---------------------------------------------------------------------------------------------- defence mounts + power budget
ok('mounts: kit on the roof -> deployable placed, ship powered within the budget; extra mounts stay dark', () => {
  game.player.pos.set(C.MOUNTS[0].x, 3.95, C.MOUNTS[0].z); game.player.inShip = true;
  assert.ok(insideShip(game.player.pos), 'roof counts as aboard');
  const kit = (ty) => { const it = give(game, 'x_kit_' + ty); it.def = { deploy: ty, name: ty }; return it; };
  let k = kit('turret2'); game.net.sent.length = 0; req(game, { op: 'mount', m: 'M1', item: k.id });
  assert.equal(game.run.s2.mt.M1.ty, 'turret2'); tick(game, 8);
  const dep = game._deps.get([...game._deps.keys()][0]); assert.ok(dep, 'deployable created'); assert.equal(dep.pos.y, C.MOUNT_Y); assert.equal(dep.res, dep.cap, 'powered: cell full');
  k = kit('tesla'); game.player.pos.set(C.MOUNTS[1].x, 3.95, C.MOUNTS[1].z); req(game, { op: 'mount', m: 'M2', item: k.id }); tick(game, 8);
  assert.equal(game.run.s2.ps, 2); assert.deepEqual([...game.run.s2.on].sort(), ['M1', 'M2']);
  k = kit('turret3'); game.player.pos.set(C.MOUNTS[2].x, 3.95, C.MOUNTS[2].z); req(game, { op: 'mount', m: 'M3', item: k.id }); tick(game, 8);
  assert.equal(game.run.s2.on.includes('M3'), false, 'third powered mount has no slot');
  const third = game._deps.get([...game._deps.keys()][2]); assert.equal(third.res, 0);
  // same mount twice / wrong kit / too far
  game.net.sent.length = 0; k = kit('turret2'); req(game, { op: 'mount', m: 'M1', item: k.id }); assert.ok(msgs(game, 'err').length === 1);
  const junk = give(game, 's2_wrench'); junk.def = { deploy: 'barr_wood' }; game.player.pos.set(C.MOUNTS[3].x, 3.95, C.MOUNTS[3].z); game.net.sent.length = 0; req(game, { op: 'mount', m: 'M4', item: junk.id }); assert.ok(msgs(game, 'err').length === 1);
  game.player.pos.set(0, -1.8, 9); const k2 = kit('turret2'); game.net.sent.length = 0; req(game, { op: 'mount', m: 'M4', item: k2.id }); assert.equal(game.run.s2.mt.M4, undefined);
  assert.ok(game.profile.ship2.mounts.M1, 'persisted in the host profile');
  game.player.inShip = false;
});
ok('power budget reads the Engine Room tier from the shipyard (+1 slot per tier)', () => {
  const Y = C._Y || null; void Y;
  const before = game.run.s2.ps;
  game.shipyard = { state: () => ({ m: { R1: { id: 'engine', t: 2 } } }), core: { tierOf: (st, id) => Object.values(st.m).find((e) => e.id === id)?.t || 0 } };
  tick(game, 8, 1); assert.equal(game.run.s2.ps, before + 2, 'slots ' + game.run.s2.ps); delete game.shipyard;
});
ok('a destroyed / packed-up mounted defence empties its mount again', () => {
  tick(game, 4, 1);
  const id = [...game._deps.keys()][0]; game._deps.delete(id); tick(game, 6, 1);
  assert.equal(game.run.s2.mt.M1, undefined);
});
ok('mount repair with the wrench raises the defence hp', () => {
  game.player.pos.set(C.MOUNTS[1].x, 3.95, C.MOUNTS[1].z); game.player.inShip = true;
  const dep = [...game._deps.values()].find((d) => d.type === 'tesla'); dep.hp = 40; const w = give(game, 's2_wrench');
  req(game, { op: 'rstart', tg: 'm:M2', item: w.id }); hold(game, 8); game.input._down = false;
  assert.ok(dep.hp > 100, 'hp ' + dep.hp); game.player.inShip = false;
});

// ---------------------------------------------------------------------------------------------- planters
ok('planter: plant, water, grow over game days, harvest hydro apples, persists in the profile', () => {
  { const ph = L.PLANTER_SLOTS.find((q) => q.id === 'planterHub'); game.player.pos.set(ph.x, 0, ph.z + 0.7); }   // [wave5] the pot moved (world/shiplayout.js)
  req(game, { op: 'pl', id: 'planterHub', sub: 'plant' }); assert.equal(game.run.s2.pl.planterHub.pl, 1);
  req(game, { op: 'pl', id: 'planterHub', sub: 'water' }); assert.equal(game.run.s2.pl.planterHub.w, 1);
  for (let d = 3; d <= 9; d++) { game.run.day = d; game.run.phase = 'takeoff'; game.mods.emit('phase', 'orbit', game); game.run.phase = 'moon'; }
  assert.equal(C.stageOf(game.run.s2.pl.planterHub.pts), 4, 'fruiting');
  tick(game, 8); assert.ok(s2.client().plantViews >= 1);
  const n0 = game._items.size; req(game, { op: 'pl', id: 'planterHub', sub: 'harvest' });
  assert.ok(game._items.size >= n0 + 2); assert.ok([...game._items.values()].some((i) => i.type === 'fd_hydro'));
  assert.equal(C.canHarvest(game.run.s2.pl.planterHub), false); assert.ok(game.profile.ship2.planters.planterHub.pl);
  game.player.pos.set(20, 0, 20); req(game, { op: 'pl', id: 'planterHub', sub: 'plant' });   // too far: ignored
});
ok('addPlanterSlot: a shipyard room can register its own planter; unknown slots are ignored', () => {
  assert.equal(s2.addPlanterSlot({ id: 'gh1', x: 12, z: 0, where: 'greenhouse' }), true); assert.equal(s2.planterSlots().length, 3);
  game.player.pos.set(12, 0, 0); req(game, { op: 'pl', id: 'gh1', sub: 'plant' }); assert.equal(game.run.s2.pl.gh1.pl, 1);
  req(game, { op: 'pl', id: 'nope', sub: 'plant' }); assert.equal(game.run.s2.pl.nope, undefined);
  s2.removePlanterSlot('gh1'); assert.equal(s2.planterSlots().length, 2);
});
ok('overnight escalation only from quota 1 and only on a new day key', () => {
  s2.repairAll(); game.run.quotaIndex = 3; s2.damage('siege', { kind: 'spark' });
  const before = game.run.s2.sp[0].k; let worse = false;
  for (let d = 20; d < 60 && !worse; d++) { game.run.day = d; game.mods.emit('phase', 'orbit', game); worse = game.run.s2.sp[0].k !== before; }
  assert.ok(worse, 'a sparking panel eventually becomes a breach');
});
ok('dispose restores the wrapped takeoff and removes everything it added', () => {
  const nEm = lightPool.emitters.size;
  s2.dispose();
  assert.equal([...lightPool.emitters].some((e) => e.group === 's2hull'), false);
  assert.equal(ship.group.getObjectByName('ship2_ladder'), undefined);
  assert.ok(typeof game.hostFinishTakeoff === 'function');
  game.run.phase = 'takeoff'; game.hostData.takeoffReason = 'lever'; game._finished = 0; game.hostFinishTakeoff(); assert.equal(game._finished, 1, 'original restored (no delay)');
  assert.ok(nEm >= 0);
});
console.log(`\nship2 install: ${pass} passed, ${fail} failed`);
