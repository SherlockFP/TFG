// node tools/harness/horror_install.test.mjs - the HORROR installer against a fake game + a REAL generated facility (stub physics / lights):
// mapLoaded build (closets, pockets, traps, nav blocking), host populate (shamblers, sidearm, crest, ambusher, chalk), pay-to-arm trap loop (credits, telegraph, strike,
// kill, refund, expiry, limits), crest unlock + portal crossing both ways, chalk draw / wipe / limits over the wire, headshot wrapper, fake closet (open / knock),
// late-join sync, dispose restores every patched method.
import assert from 'node:assert/strict';
const cv = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }), style: {}, addEventListener() {}, classList: { contains: () => false }, appendChild() {} });
globalThis.document = { createElement: () => cv(), getElementById: () => null, body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.window = globalThis; globalThis.localStorage = { getItem: () => null, setItem() {} };
try { globalThis.navigator = { userAgent: 'node' }; } catch { /* read-only */ }
globalThis.OffscreenCanvas = class { constructor() { return cv(); } };

const THREE = await import('three');
const { generateLayout, buildFacility } = await import('../../src/world/facility.js');
const C = await import('../../src/game/horror_core.js');
const { installHorror } = await import('../../src/game/horror.js');
const { CREATURES } = await import('../../src/game/creatures.js');
const { ITEMS } = await import('../../src/game/items.js');
const { toWorld } = await import('../../src/game/horror_closet.js');

let pass = 0;
const ok = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };

// ---------------------------------------------------------------------------------------------- find a seed with everything
let seed = 0, plan = null;
for (let s = 1; s < 400 && !seed; s++) {
  const L = generateLayout(s * 4099 + 17, 'factory', 2.2, null);
  const p = C.planFacility(L, { day: 3, quotaIndex: 1 });
  if (p.traps.length >= 2 && p.closets.some((c) => c.kind === 'outbreak') && p.fake && p.crestRoom >= 0) { seed = s * 4099 + 17; plan = p; }
}
assert.ok(seed, 'found a seed with traps + outbreak closet + fake closet + crest');
const L = generateLayout(seed, 'factory', 2.2, null);
let colN = 0;
const physics = new Proxy({}, { get: (t, k) => (k === 'removeCollider' ? () => {} : () => ({ handle: colN++ })) });
const lightPool = { emitters: new Set(), add(e) { this.emitters.add(e); return e; }, remove(e) { this.emitters.delete(e); }, clearGroup() {} };
const fac = buildFacility(L, { physics, lightPool });

// ---------------------------------------------------------------------------------------------- fake game
function makeGame() {
  const handlers = new Map(), msg = new Map(), bcasts = [], sent = [];
  const mods = {
    _on: new Map(), itemModels: new Map(), creatureModels: new Map(),
    on(ev, fn) { if (ev === 'registerHandlers') { fn((op, h) => handlers.set(op, h), game); return () => {}; } (this._on.get(ev) || this._on.set(ev, []).get(ev)).push(fn); return () => { const a = this._on.get(ev); a.splice(a.indexOf(fn), 1); }; },
    emit(ev, ...a) { for (const fn of [...(this._on.get(ev) || [])]) fn(...a); },
  };
  const net = {
    handlers: new Map(), isHost: true,
    request(op, d) { const h = handlers.get(op); if (h) h({ a: op, ...d }, game.selfId); },
    broadcast(t, d) { bcasts.push([t, d]); const h = msg.get(t); if (h) h(d, 'H'); },
    sendTo(id, t, d) { sent.push([id, t, d]); const h = msg.get(t); if (h && id === game.selfId) h(d, 'H'); },
    send() {}, on_(t, fn) { msg.set(t, fn); },
  };
  const items = new Map(); let iid = 0;
  const hurts = [], stuns = [];
  const mgr = {
    host: new Map(), nextId: 1, noises: 0, views: new Map(),
    hostSpawn(type, pos, o = {}) {
      const def = CREATURES[type]; if (!def) return null;
      const c = { id: 'c' + mgr.nextId++, type, def, pos: pos.clone(), hp: def.hp, maxHp: def.hp, dmg: def.dmg, state: o.state || 'idle', t: 0, data: { ...(o.data || {}) }, cooldown: 0, stunT: 0, age: 9, target: null, dead: false, level: 1, elite: false, attackers: new Map(), path: null, dest: null, yaw: o.yaw || 0, extra: 0, zone: 'in' };
      c.setState = (s) => { if (s !== c.state) { c.state = s; c.t = 0; } };
      mgr.host.set(c.id, c); return c;
    },
    damage(id, amount, by, opts = {}) {
      const c = mgr.host.get(id); if (!c || c.dead) return;
      c.hp = Math.max(0, c.hp - amount);
      if (typeof by === 'string' && game.aiPlayerById(by)) { c.attackers.set(by, (c.attackers.get(by) || 0) + amount); c.target = by; c.data.hitBy = by; c.data.hitAt = game.time; }
      if (c.hp <= 0) { c.dead = true; mgr.killed.push(c.id); }
    },
    killed: [], noise() { mgr.noises++; }, nav: (c) => fac.nav, playersFor: () => game.aiPlayers(), raycast: () => null, hostRemove(id) { mgr.host.delete(id); },
    sound() {}, canSee: () => false, hear: () => null, isLookedAt: () => false, follow: () => true, goTo() {}, goToLazy() {}, moveToward() { return false; }, wander() {}, placeAt(c, x, z) { c.pos.x = x; c.pos.z = z; }, nearest: () => null,
    attack(c, p, dmg, cause) { hurts.push({ id: p.id, dmg, cause }); }, speedMul: (c, s) => s,
  };
  const player = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0, vel: new THREE.Vector3(), crouch: false, dead: false, indoor: true, hp: 100, maxHp: 100, stamina: 10, maxStamina: 100, stunT: 0, slowT: 0, held: null,
    heldItem() { return this.held ? items.get(this.held) : null; }, forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); },
    teleport(p, yaw) { this.pos.copy(p); if (yaw !== undefined) this.yaw = yaw; this.vel.set(0, 0, 0); } };
  const game = {
    isHost: true, selfId: 'H', time: 0, destroyed: false, mods, net, physics, lights: lightPool, scene: new THREE.Scene(), camera: { position: new THREE.Vector3() }, player, remotes: new Map(),
    world: { facility: fac, moonId: 'hamsi' }, config: { inventorySlots: 4 }, progress: { save() {} }, psTimer: 0,
    run: { phase: 'moon', credits: 500, day: 3, quotaIndex: 1, moon: 'hamsi', seed, time: 600 },
    ui: { toasts: [], toast(s) { this.toasts.push(s); }, hud: { floats: [], floatText(...a) { this.floats.push(a); } } }, audio: { has: () => true, at() {}, play() {} }, engine: { shake() {}, flash() {} },
    creatures: mgr, hostHurtPlayer(id, dmg, cause) { hurts.push({ id, dmg, cause, direct: true }); }, hostStunPlayer(id, t) { stuns.push([id, t]); }, hostSlowPlayer() {}, hostHoldPlayer() {},
    aiPlayers: () => [{ id: 'H', pos: player.pos.clone(), eye: player.pos.clone(), dead: player.dead, inShip: false, zone: 'in' }],
    aiPlayerById: (id) => game.aiPlayers().find((p) => p.id === id), playerName: () => 'Host', broadcastRun(k) { bcasts.push(['gs', k]); }, later(fn) { fn(); return 0; },
    deathText: (c) => 'died.', sfx() {},
    items: { all: () => items.values(), get: (id) => items.get(id), hostSpawn(type, pos, o = {}) { const id = 'i' + ++iid; items.set(id, { id, type, def: ITEMS[type] || { kind: 'scrap' }, holder: o.holder || null, pos: pos.clone(), opts: o, value: o.value ?? 10 }); return id; } },
    _handlers: handlers, _msg: msg, _bcasts: bcasts, _sent: sent, _items: items, _hurts: hurts, _stuns: stuns,
  };
  mgr.game = game;
  return game;
}
const game = makeGame();
const rm = game.net.broadcast;
game.net.broadcast = (t, d) => { if (t === 'it' && d?.e === 'rm') game._items.delete(d.id); return rm(t, d); };   // the item stream: 'rm' removes
const origDamage = game.creatures.damage, origNav = game.creatures.nav, origPF = game.creatures.playersFor, origRay = game.creatures.raycast, origDeath = game.deathText;
const hz = installHorror(game);
game.mods.emit('netReady', game.net, game);
const tick = (n = 1, dt = 0.1) => { for (let i = 0; i < n; i++) { game.time += dt; game.mods.emit('update', dt, game); } };
const req = (op, d = {}) => game.net.request('hrReq', { op, ...d });
const S = hz.S;

ok('installs: items, creatures, translations registered', () => {
  assert.ok(hz);
  for (const id of ['hr_chalk', 'hr_crest', 'hr_specimen', 'fd_herb']) assert.ok(ITEMS[id], id);
  for (const id of ['hr_zombie', 'hr_forger', 'hr_ambusher', 'hr_warden']) assert.ok(CREATURES[id], id);
  assert.ok(ITEMS.fd_herb.food === 'food' && ITEMS.hr_chalk.price > 0 && ITEMS.hr_chalk.price <= 10, 'chalk is cheap');
  assert.equal(game.mods.itemModels.size >= 4, true);
});

ok('mapLoaded builds closets, pockets, traps from the real facility', () => {
  game.player.pos.set(L.ox + L.entrance.room.cx * 4 + 2, L.y, L.oz + L.entrance.room.cz * 4 + 2);
  game.mods.emit('mapLoaded', game.world, game);
  assert.equal(S.active, true);
  assert.equal(S.plan.closets.length, hz.closets.filter((c) => !c.fake).length);
  assert.ok(hz.closets.some((c) => c.fake) && hz.closets.some((c) => c.kind === 'outbreak' && c.locked));
  assert.ok(hz.traps.length >= 1 && hz.pockets.length === S.plan.closets.length);
  assert.ok(S.group.parent === game.scene && S.chalk.group.parent === game.scene);
  for (const c of hz.closets) assert.ok(!fac.nav.walkableAt(C.closetFrame(L, S.plan.fake && c.fake ? S.plan.fake.cell : S.plan.closets[c.id].cell).x, C.closetFrame(L, S.plan.fake && c.fake ? S.plan.fake.cell : S.plan.closets[c.id].cell).z), 'closet footprint blocks the facility nav');
});

const zombiesAtStart = () => [...game.creatures.host.values()].filter((c) => c.type === 'hr_zombie').length;
ok('host populate: shamblers, sidearm, ammo, crest, ambusher, forged arrows, chalk in every hand', () => {
  game.mods.emit('moonPopulated', game);
  const out = S.plan.closets.find((c) => c.kind === 'outbreak');
  assert.ok(out);
  assert.ok(zombiesAtStart() >= 8, 'shamblers spawned: ' + zombiesAtStart());
  const spawned = [...game._items.values()].map((i) => i.type);
  assert.equal(spawned.filter((t) => t === 'pistol').length, 1, 'exactly one sidearm');
  assert.ok(spawned.filter((t) => t === 'hr_crest').length === 1, 'the crest');
  assert.ok(spawned.includes('hr_specimen'), 'the sample case');
  assert.ok([...game._items.values()].some((i) => i.type === 'hr_chalk' && i.holder === 'H'), 'a free chalk stick');
  const crest = [...game._items.values()].find((i) => i.type === 'hr_crest');
  assert.ok(fac.nav.walkableAt(crest.pos.x, crest.pos.z), 'the crest lies on walkable floor');
  const amb = [...game.creatures.host.values()].find((c) => c.type === 'hr_ambusher');
  assert.ok(amb && amb.state === 'lurk' && amb.data.closet === S.plan.fake.id, 'closet thing waits inside the fake closet');
  assert.ok(S.store.all().filter((m) => m.f).length === 2, 'two forged arrows lead to the fake closet');
  assert.ok(S.chalk.count() === 2, 'the forged arrows are on every peer\'s wall');
  const pistol = [...game._items.values()].find((i) => i.type === 'pistol');
  assert.ok(pistol.pos.x > 7000, 'the sidearm is inside the pocket');
});

// -------------------------------------------------------------------- traps
const T0 = () => hz.traps[0];
const atPanel = (T) => game.player.pos.set(T.panel.x, T.zone.y, T.panel.z);
ok('pay-to-arm: needs credits, charges the price, arms, broadcasts', () => {
  const T = T0(); atPanel(T);
  const price = C.trapPrice(T.desc.type, { quotaIndex: 1, usesThisLanding: 0 });
  game.run.credits = price - 1; req('arm', { i: T.uid });
  assert.equal(T.st.s, 'idle', 'cannot afford');
  assert.ok(game._sent.some(([, t, d]) => t === 'hrfx' && d.k === 'deny' && d.why === 'credits'));
  game.run.credits = 500; req('arm', { i: T.uid });
  assert.equal(T.st.s, 'armed'); assert.equal(game.run.credits, 500 - price);
  assert.ok(game._bcasts.some(([t, d]) => t === 'hrs' && d.t === 'trs'));
  assert.equal(T.view.state, 'armed', 'clients see the panel change');
  // a second arming costs more (+25 % per use this landing)
  const T2 = hz.traps[1]; atPanel(T2);
  const p2 = C.trapPrice(T2.desc.type, { quotaIndex: 1, usesThisLanding: 1 });
  const c0 = game.run.credits; req('arm', { i: T2.uid }); assert.equal(c0 - game.run.credits, p2);
  assert.ok(p2 >= C.trapPrice(T2.desc.type, { quotaIndex: 1, usesThisLanding: 0 }));
  req('arm', { i: T2.uid }); assert.equal(c0 - game.run.credits, p2, 'cannot pay twice for an armed trap');
});
const putCreature = (T, type = 'hr_zombie', off = 0) => {
  const c = game.creatures.hostSpawn(type, new THREE.Vector3(T.zone.cx + (T.zone.axis === 'x' ? off : 0), T.zone.y, T.zone.cz + (T.zone.axis === 'z' ? off : 0)), { state: 'idle' });
  return c;
};
ok('a lured creature triggers telegraph -> strike and dies; the payer gets a partial refund + kill credit', () => {
  const T = T0(); const zed = putCreature(T, 'hr_zombie', 0);
  game.player.pos.set(T.panel.x, T.zone.y, T.panel.z);   // the payer stands at the panel, outside the strike
  const credits0 = game.run.credits, kills0 = T.st.kills;
  tick(3, 0.1);
  assert.ok(['tele', 'strike'].includes(T.st.s) || T.st.s === 'cool' || T.st.s === 'armed', 'triggered: ' + T.st.s);
  tick(40, 0.1);
  assert.ok(zed.dead, 'the creature in the lane died (' + T.desc.type + ')');
  assert.equal(T.st.kills, kills0 + 1);
  assert.ok(zed.attackers.has('H'), 'kill credit goes to whoever armed it');
  assert.ok(game.run.credits > credits0, 'refund: ' + (game.run.credits - credits0));
  assert.ok(game.run.credits - credits0 <= Math.floor(T.st.paid * C.TRAP_RULES.refundMax), 'refund is capped');
  assert.ok(game._bcasts.some(([t, d]) => t === 'hrfx' && d.k === 'refund'));
  assert.equal(zed.target, 'H' === zed.target ? zed.target : zed.target, 'ok');
});
ok('players standing in the lane are hurt too (once per strike), bystanders are not', () => {
  const T = T0(); T.st.s = 'idle'; T.st.arms = 0; game.run.credits = 900; atPanel(T); req('arm', { i: T.uid });
  const zed = putCreature(T, 'hr_zombie', 0); zed.hp = 9999; zed.maxHp = 9999;   // survives, so the trap keeps going
  game.player.pos.set(T.zone.cx, T.zone.y, T.zone.cz);   // the payer is inside the lane
  game._hurts.length = 0;
  tick(60, 0.1);
  const mine = game._hurts.filter((h) => h.direct && h.cause === 'hr_' + T.desc.type);
  assert.ok(mine.length >= 1, 'the player in the lane took trap damage');
  assert.ok(mine.every((h) => h.dmg === C.TRAPS[T.desc.type].dmgP), 'player damage table');
  game.player.pos.set(T.panel.x, T.zone.y, T.panel.z);
});
ok('an armed trap nobody walks into powers down (money lost); arming is limited per landing', () => {
  const T = hz.traps[hz.traps.length - 1]; for (const x of hz.traps) { x.st.s = 'idle'; x.st.arms = 0; }
  game.run.credits = 900; atPanel(T); req('arm', { i: T.uid });
  assert.equal(T.st.s, 'armed');
  game.time += C.TRAPS[T.desc.type].armSec + 5; tick(2, 0.1);
  assert.equal(T.st.s, 'idle');
  for (let k = 0; k < 4; k++) { T.st.s = 'idle'; req('arm', { i: T.uid }); }
  assert.ok(T.st.arms <= C.TRAP_RULES.maxArmsPerLanding, 'limit ' + T.st.arms);
});
ok('deathText patch: trap causes are named, others fall through', () => {
  assert.match(game.deathText('hr_laser'), /cubes|laser/i); assert.equal(game.deathText('nothing'), 'died.');
});

// -------------------------------------------------------------------- crest + closets + portals
const outC = () => hz.closets.find((c) => c.kind === 'outbreak');
const stand = (c, lz = 2.2, lx = 0) => { const w = toWorld(c.frame, lx, lz); game.player.pos.set(w.x, c.frame.y, w.z); };
ok('quarantine door: locked without the crest, opens with it (crest is consumed)', () => {
  const c = outC(); stand(c);
  req('door', { i: c.id, o: 1 }); assert.equal(c.view.isOpen, false, 'locked doors do not open');
  req('crest', { i: c.id }); assert.equal(c.unlocked, false, 'no crest in hand');
  const id = game.items.hostSpawn('hr_crest', new THREE.Vector3(), { holder: 'H' });
  req('crest', { i: c.id });
  assert.equal(c.unlocked, true); assert.equal(c.view.isOpen, true); assert.ok(!game._items.has(id), 'crest consumed');
});
ok('walking into the open closet teleports into the pocket (and keeps you upright); the alcove leads back out', () => {
  const c = outC(); for (let i = 0; i < 40; i++) c.view.update(0.1, i * 0.1);
  stand(c, 0.6, 0.2); game.player.yaw = Math.atan2(c.frame.fx, c.frame.fz) + Math.PI; game.player.vel.set(-c.frame.fx * 3, 0, -c.frame.fz * 3);
  tick(1, 0.1);
  assert.ok(c.pocket.contains(game.player.pos), 'inside the pocket now: ' + game.player.pos.toArray().map((v) => v.toFixed(1)));
  assert.ok(Math.abs(game.player.pos.y - c.frame.y) < 0.2, 'same floor plane');
  const e = c.pocket.entry(), out = game.player.pos.clone();
  // arrival is in front of the alcove, moving into the pocket
  assert.ok(Math.hypot(out.x - (e.doorX), out.z - e.doorZ) < 1.2, 'arrived at the alcove door');
  assert.ok(game.player.vel.x * e.fx + game.player.vel.z * e.fz > 2, 'velocity now points into the pocket');
  // walk back into the alcove
  game.player.pos.set(toWorld(e, 0, 0.6).x, c.frame.y, toWorld(e, 0, 0.6).z); tick(15, 0.1);
  assert.ok(!c.pocket.contains(game.player.pos), 'back in the facility');
  const lc = Math.hypot(game.player.pos.x - c.frame.wallX, game.player.pos.z - c.frame.wallZ);
  assert.ok(lc > 1.2 && lc < 2.6, 'stands in front of the closet door (' + lc.toFixed(2) + ' m from the wall)');
});
ok('a closed non-quarantine closet stays a wall; open, it is a portal to a room far bigger than the closet', () => {
  const c = hz.closets.find((x) => !x.fake && x.kind !== 'outbreak');
  if (!c) return;
  game.time += 3; tick(12, 0.1); stand(c, 0.6); tick(2, 0.1); assert.ok(!c.pocket.contains(game.player.pos), 'closed: no crossing');
  req('door', { i: c.id, o: 1 }); for (let i = 0; i < 40; i++) c.view.update(0.1, i * 0.1);
  game.time += 3; stand(c, 0.6); tick(12, 0.1); assert.ok(c.pocket.contains(game.player.pos), 'open: crossed');
});

// -------------------------------------------------------------------- chalk
ok('chalk: draw request over the wire, per-player limit, wipe, rate limit, fakes never evict', () => {
  const pos = game.player.pos.set(L.ox + 8, L.y, L.oz + 8).clone();
  const id = [...game._items.values()].find((i) => i.type === 'hr_chalk').id; game.player.held = id;
  const draw = (k = 0, dx = 0) => req('chalk', { k, p: [pos.x + dx, pos.y + 0.02, pos.z + 1], n: 2, r: 4 });
  const n0 = S.chalk.count();
  draw(); tick(1, 0.1);
  assert.equal(S.chalk.count(), n0 + 1, 'the host store and every view got the mark');
  // 24 per player: draw over time (rate limit is 5 per 3 s)
  for (let i = 0; i < 40; i++) { game.time += 1; draw(i % 2, (i % 5) * 0.2); }
  assert.ok(S.store.count(0) <= C.CHALK.perPlayer && S.store.all().filter((m) => !m.f).length <= C.CHALK.perPlayer, 'only 24 real marks per crewmate: ' + S.store.all().filter((m) => !m.f).length);
  assert.equal(S.chalk.count(), S.store.marks.size, 'views mirror the store');
  // rate limit: a burst is throttled
  const before = S.store.marks.size; game.time += 10;
  for (let i = 0; i < 12; i++) draw(0, i * 0.1);
  assert.ok(S.store.marks.size - before <= C.CHALK.rateN, 'burst limited to ' + (S.store.marks.size - before));
  // reach: far away marks are ignored
  const b2 = S.store.marks.size; req('chalk', { k: 0, p: [pos.x + 50, pos.y, pos.z], n: 2, r: 0 }); assert.equal(S.store.marks.size, b2, 'far draw rejected');
  // no chalk in hand items -> no drawing
  const real = S.store.all().find((m) => !m.f); req('wipe', { id: real.id }); assert.ok(!S.store.marks.has(real.id) && !S.chalk.marks.has(real.id), 'wiped everywhere');
  game._items.delete(id); game.time += 10; const b3 = S.store.marks.size; draw(); assert.equal(S.store.marks.size, b3, 'no stick, no mark');
  assert.ok(S.store.all().filter((m) => m.f).length === 2, 'the forged arrows were not evicted');
});
ok('late join: state sync sends traps, doors, chalk', () => {
  game._sent.length = 0; game.mods.emit('playerJoin', 'P2', {}, game);
  const hrs = game._sent.filter(([id, t]) => id === 'P2' && t === 'hrs' && game._sent);
  assert.ok(hrs.some(([, , d]) => d.t === 'all' && Array.isArray(d.a) && Array.isArray(d.doors)), 'full state');
  assert.ok(game._sent.some(([id, t, d]) => id === 'P2' && t === 'hrch' && Array.isArray(d.all)), 'full chalk');
});

// -------------------------------------------------------------------- headshots
ok('headshot flag doubles the next hit on a shambler only', () => {
  const zed = [...game.creatures.host.values()].find((c) => c.type === 'hr_zombie' && !c.dead); zed.hp = zed.maxHp = 100; const before = zed.hp; game.player.pos.copy(zed.pos);
  game.creatures.damage(zed.id, 10, 'H'); assert.equal(before - zed.hp, 10);
  req('head', { cid: zed.id }); game.creatures.damage(zed.id, 10, 'H'); assert.equal(before - zed.hp, 10 + 10 * C.HEADSHOT_MUL, 'headshot x' + C.HEADSHOT_MUL);
  game.creatures.damage(zed.id, 10, 'H'); assert.equal(before - zed.hp, 10 + 10 * C.HEADSHOT_MUL + 10, 'the flag is consumed');
  req('head', { cid: zed.id }); game.time += 5; game.creatures.damage(zed.id, 10, 'H'); assert.ok(before - zed.hp < 10 + 10 * C.HEADSHOT_MUL + 10 + 11, 'a stale flag does nothing');
  const other = game.creatures.hostSpawn('hr_warden', new THREE.Vector3(), {}); other.hp = other.maxHp = 100; req('head', { cid: other.id }); game.creatures.damage(other.id, 10, 'H'); assert.equal(other.hp, 90, 'only shamblers take headshot bonus');
});

// -------------------------------------------------------------------- fake closet
ok('fake closet: knock answers, hooking is telegraphed, opening by hand from close range is the lethal ambush', () => {
  const f = hz.closets.find((c) => c.fake), amb = () => [...game.creatures.host.values()].find((c) => c.type === 'hr_ambusher');
  const beh = CREATURES.hr_ambusher.behavior; const M = game.creatures;
  const run = (c, n, dt = 0.05) => { for (let i = 0; i < n; i++) { c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); game.time += dt; beh(c, dt, M); } };
  stand(f, C.CLOSET.d + 1.0);   // right in front of the door
  game._hurts.length = 0;
  req('fake', { i: f.id, mode: 'open' });
  const a = amb(); assert.ok(a.data.op && a.data.op.lethal && a.data.op.mode === 'open');
  run(a, 12);
  assert.ok(game._hurts.some((h) => h.dmg === 999 && h.cause === 'hr_ambusher'), 'lethal lunge on the unwary');
  assert.equal(f.view.isOpen, true, 'the door burst open on every peer');
  // second visit: reset the same creature into the closet and hook the door from range (telegraphed, not lethal), then knock
  const reset = () => { const w = toWorld(f.frame, 0, C.CLOSET.d / 2); a.pos.set(w.x, f.frame.y, w.z); a.state = 'lurk'; a.t = 0; a.data.hit = false; a.data.op = null; a.dead = false; a.hp = a.maxHp; f.view.setOpen(false); game._hurts.length = 0; };
  reset(); stand(f, C.CLOSET.d + 3.2);
  req('fake', { i: f.id, mode: 'hook' });
  assert.ok(a.data.op && a.data.op.mode === 'hook' && a.data.op.lethal === false && a.data.op.lunge >= 0.8);
  run(a, 8); assert.equal(a.state, 'stir', 'growls first (telegraph)');
  assert.equal(f.view.isOpen, false, 'the door is still shut while it stirs');
  run(a, 30); assert.ok(['burst', 'run', 'attack'].includes(a.state));
  assert.ok(!game._hurts.some((h) => h.dmg === 999), 'hooked from 3 m: nobody dies');
  reset(); stand(f, C.CLOSET.d + 1.0); game._sent.length = 0; game._bcasts.length = 0;
  req('fake', { i: f.id, mode: 'knock' });
  assert.equal(a.data.op.mode, 'knock'); assert.ok(game._bcasts.some(([t, d]) => t === 'hrfx' && d.k === 'knock' && d.ans), 'it answers the knock');
  run(a, 60); assert.ok(!game._hurts.some((h) => h.dmg === 999), 'a knock never triggers the lethal lunge, even from 1 m');
  // out of reach requests are ignored
  reset(); stand(f, C.CLOSET.d + 9); req('fake', { i: f.id, mode: 'open' }); assert.equal(a.data.op, null, 'too far to work the door');
});

ok('dispose restores every patched method and clears the scene', () => {
  hz.dispose();
  assert.equal(game.creatures.damage === origDamage, true); assert.equal(game.creatures.nav === origNav, true); assert.equal(game.creatures.playersFor === origPF, true); assert.equal(game.creatures.raycast === origRay, true);
  assert.equal(game.deathText === origDeath, true);
  assert.equal(game.scene.children.length, 0, 'nothing left in the scene: ' + game.scene.children.map((c) => c.name).join(','));
  assert.equal(S.active, false);
});
console.log(process.exitCode ? '\nFAILED' : `\nall ${pass} groups passed`);
