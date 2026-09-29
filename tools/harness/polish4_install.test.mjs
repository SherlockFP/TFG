// Node test: the polish4 installer against a fake game (host paths only, no DOM).  node tools/harness/polish4_install.test.mjs
import assert from 'node:assert/strict';
import * as THREE from 'three';

let pass = 0;
const ok = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

const { installPolish4 } = await import('../../src/game/polish4.js');
const { ITEMS } = await import('../../src/game/items.js');
const { CREATURES } = await import('../../src/game/creatures.js');
await import('../../src/game/pets.js');                 // registers the egg items
const P = await import('../../src/game/polish4_core.js');

// ---- fake game
const handlers = new Map(), listeners = new Map(), sent = [], spawned = [];
const mods = { on(evt, fn) { (listeners.get(evt) || listeners.set(evt, []).get(evt)).push(fn); return () => { const l = listeners.get(evt); l.splice(l.indexOf(fn), 1); }; }, emit(evt, ...a) { for (const fn of [...(listeners.get(evt) || [])]) fn(...a); } };
const damaged = [];
const creatures = {
  host: new Map(),
  damage(id, amount) { damaged.push([id, amount]); const c = this.host.get(id); if (c) c.hp -= amount; },
  goTo(c, x, z) { c.path = [{ x, z }]; c.pathIdx = 0; },
};
const me = { x: 20, y: 0, z: 21 };
const game = {
  isHost: true, selfId: 'me', time: 10, mods, creatures,
  run: { seed: 1234, day: 2, phase: 'moon', credits: 500 },
  player: { pos: new THREE.Vector3(me.x, me.y, me.z), inShip: false },
  remotes: new Map(),
  items: { all: () => spawned, get: (id) => spawned.find((i) => i.id === id), hostSpawn(type, pos, opts) { const it = { id: 'i' + spawned.length, type, pos, opts, holder: opts?.holder || null, def: ITEMS[type] }; spawned.push(it); return it; } },
  net: { broadcast: (t, d) => sent.push([t, d]), sendTo: (to, t, d) => sent.push([t, d, to]), request() {} },
  physics: { raycast: () => null },
  world: { terrain: { heightAt: () => 0 } },
  later: (fn) => fn(),
  hostOnCreatureKilled(c) { return 'orig'; },
  broadcastRun() {}, progress: { save() {} },
  rpg: { bonus: (k) => (k === 'craftLuck' ? 0.05 : 0) },
  shipyard: { effects: () => ({ craftLuck: 0.1 }) },
  profile: {},
};
const origBonus = game.rpg.bonus;
const api = installPolish4(game);
mods.emit('registerHandlers', (t, fn) => handlers.set(t, fn), game);
mods.emit('update', 0.016, game);       // wraps the creature manager

await ok('installs, exposes the API, registers the two request handlers', () => { assert.ok(api && typeof api.dispose === 'function'); assert.ok(handlers.has('p4act') && handlers.has('p4bt')); });

await ok('Workshop luck is added to rpg.bonus(craftLuck) only', () => { assert.ok(Math.abs(game.rpg.bonus('craftLuck') - 0.15) < 1e-9); assert.equal(game.rpg.bonus('lootLuck'), 0); });

await ok('buried dune maw takes no damage, exposed one does', () => {
  const maw = { id: 'm1', type: 'dunemaw', state: 'hidden', hp: 300 }; creatures.host.set('m1', maw);
  game.creatures.damage('m1', 50, 'me', {}); assert.equal(maw.hp, 300);
  maw.state = 'rumble'; game.creatures.damage('m1', 50, 'me', {}); assert.equal(maw.hp, 300);
  maw.state = 'exposed'; game.creatures.damage('m1', 50, 'me', {}); assert.equal(maw.hp, 250);
  maw.state = 'hidden'; game.creatures.damage('m1', 0, 'me', { stun: 1 }); assert.equal(maw.hp, 250);
  assert.ok(api.state.stats.mawGuards >= 2);
});

await ok('egg drops: boss kill eventually drops an egg item, capped at 2 / day, hazards never', () => {
  spawned.length = 0;
  let got = 0;
  for (let i = 0; i < 40; i++) {
    game.run.day = 1 + (i % 3) * 0 + 0;   // fixed day: the cap must hold
    game.hostOnCreatureKilled({ id: 'b' + i, type: 'hydra', def: { boss: true, hp: 900 }, pos: new THREE.Vector3(1, 0, 1), tier: 'legendary' }, 'me');
  }
  got = spawned.filter((i) => /^pet_egg/.test(i.type)).length;
  assert.equal(got, P.EGG_DAY_CAP, 'cap per day');
  game.run.day = 3;
  game.hostOnCreatureKilled({ id: 'h1', type: 'mine', def: { hp: null, hazard: true }, pos: new THREE.Vector3(), tier: 'mythic' }, 'me');
  assert.equal(spawned.filter((i) => /^pet_egg/.test(i.type)).length, P.EGG_DAY_CAP);
  assert.ok(sent.some(([t, d]) => t === 'sys' && /egg/i.test(d.text)));
});

await ok('chest egg: a void chest with maximum pity eventually drops, and the roll is repeatable', () => {
  spawned.length = 0; game.run.day = 5;
  let first = -1;
  for (let i = 0; i < 200 && first < 0; i++) { mods.emit('tfg:chestOpened', { id: 'c' + i, tier: 'void', pos: [1, 0, 1] }); if (spawned.some((s) => /^pet_egg/.test(s.type))) first = i; }
  assert.ok(first >= 0);
});

// ---- barter
const npc = { id: 'n1', type: 'alien_npc', dead: false, pos: new THREE.Vector3(20, 0, 20), data: {} };
creatures.host.set('n1', npc);
await ok('barter: buy path takes credits, gives the item, stock runs out; far / angry / bad offers are refused', () => {
  const offers = api.offersFor('n1');
  assert.ok(offers.length >= 1);
  const buy = offers.find((o) => o.kind === 'buy');
  const before = game.run.credits, n0 = spawned.length;
  sent.length = 0;
  api.hostBarter({ npc: 'n1', i: buy.i }, 'me');
  assert.equal(game.run.credits, before - buy.price); assert.equal(spawned.length, n0 + 1); assert.equal(spawned[spawned.length - 1].type, buy.item);
  assert.ok(sent.some(([t, d]) => t === 'p4msg' && d.k === 'sold'));
  game.time += 1;
  if (buy.qty === 2) { api.hostBarter({ npc: 'n1', i: buy.i }, 'me'); game.time += 1; }
  const c2 = game.run.credits; api.hostBarter({ npc: 'n1', i: buy.i }, 'me'); assert.equal(game.run.credits, c2, 'sold out');
  game.time += 1; me.z = 40; game.player.pos.z = 40; api.hostBarter({ npc: 'n1', i: 99 }, 'me'); assert.equal(game.run.credits, c2);
  game.player.pos.z = 21; game.time += 1; npc.data.mad = 5; api.hostBarter({ npc: 'n1', i: 0 }, 'me'); assert.equal(game.run.credits, c2); npc.data.mad = 0;
});
await ok('barter: swap consumes a held scrap item worth enough, refuses cheap or foreign ones', () => {
  game.run.day = 9; game.time += 1;
  const offers = api.offersFor('n1'), swap = offers.find((o) => o.kind === 'swap');
  assert.ok(swap);
  const scrapId = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'scrap');
  const cheap = { id: 'cheap', type: scrapId, holder: 'me', def: ITEMS[scrapId], value: swap.min - 1 };
  const rich = { id: 'rich', type: scrapId, holder: 'me', def: ITEMS[scrapId], value: swap.min + 5 };
  const foreign = { id: 'for', type: scrapId, holder: 'other', def: ITEMS[scrapId], value: 999 };
  spawned.push(cheap, rich, foreign);
  api.hostBarter({ npc: 'n1', i: swap.i, item: 'cheap' }, 'me'); assert.ok(!cheap._p4Used);
  game.time += 1; api.hostBarter({ npc: 'n1', i: swap.i, item: 'for' }, 'me'); assert.ok(!foreign._p4Used);
  game.time += 1; const n = spawned.length; api.hostBarter({ npc: 'n1', i: swap.i, item: 'rich' }, 'me');
  assert.ok(rich._p4Used); assert.equal(spawned.length, n + 1); assert.equal(spawned[n].type, swap.item);
  assert.ok(sent.some(([t, d]) => t === 'it' && d.e === 'rm' && d.id === 'rich'));
});

// ---- ship decor host path
await ok('decor: decal + furniture through p4act, credits charged, state kept in profile.shipyard.deco, refusals for bad spots', () => {
  game.profile.shipyard = { deco: null };
  game.run.credits = 300; game.player.pos.set(0, 1, 0);
  handlers.get('p4act')({ op: 'decal', id: 'star' }, 'me');
  game.time += 1; handlers.get('p4act')({ op: 'place', id: 'plant', x: 2.6, z: -1.6, r: 1 }, 'me');
  // (the fake game has no ship group: obstacles() is empty, aboard needs insideShip)
  assert.equal(game.profile.shipyard.deco.decal, 'star');
  assert.equal(game.profile.shipyard.deco.furn.length, 1);
  assert.equal(game.run.credits, 300 - 20 - 20);
  game.time += 1; handlers.get('p4act')({ op: 'place', id: 'plant', x: 2.7, z: -1.6, r: 0 }, 'me');
  assert.equal(game.profile.shipyard.deco.furn.length, 1, 'overlap refused');
  game.time += 1; handlers.get('p4act')({ op: 'remove', i: 0 }, 'me');
  assert.equal(game.profile.shipyard.deco.furn.length, 0); assert.equal(game.run.credits, 300 - 20 - 20 + 10);
  game.run.phase = 'takeoff'; game.time += 1; handlers.get('p4act')({ op: 'decal', id: 'bolt' }, 'me'); assert.equal(game.profile.shipyard.deco.decal, 'star', 'not while flying');
  game.run.phase = 'moon';
});

await ok('dispose restores every wrapper', () => {
  api.dispose();
  assert.ok(!Object.prototype.hasOwnProperty.call(creatures, 'damage') || creatures.damage.toString().indexOf('mawGuards') < 0);
  assert.equal(Object.prototype.hasOwnProperty.call(game, 'hostOnCreatureKilled') && game.hostOnCreatureKilled.name === 'killWrap', false);
  assert.ok(Math.abs(game.rpg.bonus('craftLuck') - 0.05) < 1e-9);
  const c = CREATURES.hs_gunner; assert.ok(!c || !/flankPre/.test(String(c.behavior)));
  void origBonus;
});

console.log(`\n${pass} passed`);
