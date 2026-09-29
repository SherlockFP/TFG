// [eggs] node smoke test: installs the eggs module on a stub game (no browser, no physics) and drives the whole moon loop:
//   seeded plan -> models built -> prompts -> host handlers (duck / shrine / vending / stash / payphone) -> client effects -> profile -> statue head -> dispose.
//   node tools/harness/eggs_install.test.mjs
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const THREE = await import('three');
const { installEggs } = await import('../../src/game/eggs.js');
const C = await import('../../src/game/eggs_core.js');
const { ITEMS } = await import('../../src/game/items.js');
await import('../../src/game/food.js');   // registers the fd_* items the vending machine / stash pick from
const { MOONS } = await import('../../src/game/moons.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

const listeners = {};
const mods = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
  emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); },
  commands: new Map(),
};
const nets = {}, H = {}, sent = [];
const items = new Map();
const spawned = [];
const net = {
  connected: true, relayTypes: new Set(),
  on_(t, fn) { nets[t] = fn; }, handle(a, fn) { H[a] = fn; },
  broadcast(t, d) { sent.push([t, d]); if (t === 'it' && d.e === 'rm') items.delete(d.id); if (nets[t]) nets[t](d, 'me'); },
  sendTo(id, t, d) { sent.push([t, d]); if (nets[t]) nets[t](d, 'me'); },
  request(a, d) { if (H[a]) H[a]({ a, ...d }, 'me'); },
};
const active = new Set();
const anomaly = { DEFS: {}, has: (id) => active.has(id), buffs: { add: (id) => { active.add(id); return true; } } };
const toasts = [];
const player = { pos: new THREE.Vector3(0, 0, 0), indoor: false, dead: false, held: null, heldItem() { return this.held; } };
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, 0);
const profile = { id: 'me', name: 'T' };
const colliders = [];
const game = {
  mods, anomaly, net, selfId: 'me', isHost: true, remotes: new Map(), profile, player, camera, destroyed: false,
  run: { phase: 'moon', quotaIndex: 1 },
  ui: { toast: (s, k) => toasts.push([s, k]), systemMessage: (s) => toasts.push([s, 'chat']), hud: { bigText: (a, b) => toasts.push([a, b]) } },
  sfx() {},
  physics: { addStaticBox: (...a) => { const c = { a }; colliders.push(c); return c; }, removeCollider: (c) => { colliders.splice(colliders.indexOf(c), 1); } },
  items: {
    get: (id) => items.get(id), all: () => [...items.values()],
    hostSpawn(type, pos, opts = {}) { const id = 'i' + spawned.length; const it = { id, type, value: 20, holder: opts.holder || null }; items.set(id, it); spawned.push({ type, pos: pos.clone() }); return id; },
  },
  hostSpawnRandomScrap(pos) { spawned.push({ type: 'scrap', pos: pos.clone() }); },
  interactablesNow() { const out = []; mods.emit('interactables', out, game); return out; },
};
const moonId = Object.keys(MOONS)[0];
const terrain = { scale: 1, heightAt: () => 1, distToPath: () => 99, lakes: [] };
const world = { moonId, seed: 4242, company: null, outdoor: { terrain, avoid: () => false, group: new THREE.Group(), colliders: [] }, facility: { group: new THREE.Group(), scrapSpots: Array.from({ length: 24 }, (_, i) => ({ x: 200 + (i % 6) * 8, y: 0, z: 200 + Math.floor(i / 6) * 8, room: i, dist: i })) } };
game.world = world;

const api = installEggs(game);
ok(api && typeof api.dispose === 'function', 'module installs');
ok(['egg_bless1', 'egg_bless2', 'egg_bless3'].every((id) => anomaly.DEFS[id] && typeof anomaly.DEFS[id].stats === 'function'), 'buff defs injected');
mods.emit('netReady', net, game);
ok(typeof H.eggreq === 'function' && typeof H.eggsync === 'function' && typeof nets.eggst === 'function' && typeof nets.eggfx === 'function', 'net handlers bound');

// ---- plan + build over many seeds: never throws, models are built, deterministic
let built = 0, maps = 0;
for (let s = 1; s <= 40; s++) {
  world.seed = s * 1013; world.outdoor = { ...world.outdoor, group: new THREE.Group() }; world.facility = { ...world.facility, group: new THREE.Group() }; game.world = world;
  mods.emit('mapLoaded', world, game);
  const a = api.list(), plan = api.plan();
  ok(a.length === plan.length, 'every planned egg is built');
  built += a.length; maps++;
  mods.emit('mapLoaded', world, game);
  ok(JSON.stringify(api.plan()) === JSON.stringify(plan), 'reload = same plan');
}
ok(built > 0, `some maps have eggs (${built} over ${maps})`);

// ---- one map, every kind by hand
world.seed = 777; world.outdoor = { ...world.outdoor, group: new THREE.Group() }; game.world = world;
mods.emit('mapLoaded', world, game);
const spawnedEggs = {};
['graffiti', 'shrine', 'vending', 'diary', 'duck', 'statue', 'payphone', 'stash'].forEach((k, i) => { spawnedEggs[k] = api.debugSpawn(k, 10 + i * 5, 1, 10, 'outdoor', 0); });
ok(Object.values(spawnedEggs).every(Boolean), 'debugSpawn builds every kind');
ok(colliders.length >= 4, 'solid ones get static boxes');
const eggOf = (k) => api.list().find((e) => e.id === spawnedEggs[k]);
const prompt = (k) => {
  const e = eggOf(k); player.pos.set(e.x, e.y, e.z + 1.6);
  const it = game.interactablesNow().find((q) => Math.hypot(q.pos.x - e.x, q.pos.z - e.z) < 0.5);
  return it ? { label: typeof it.label === 'function' ? it.label() : it.label, action: it.action } : null;
};
for (const k of Object.keys(spawnedEggs)) ok(prompt(k)?.label, 'prompt for ' + k);
player.pos.set(500, 0, 500); ok(game.interactablesNow().length === 0, 'no prompts when far away');
player.indoor = true; { const e = eggOf('duck'); player.pos.set(e.x, e.y, e.z + 1); ok(game.interactablesNow().length === 0, 'outdoor eggs are hidden while indoors'); } player.indoor = false;

// local discoveries
for (const k of ['graffiti', 'diary', 'statue']) { prompt(k).action(); ok(C.has(profile, k), 'found ' + k); }
ok(JSON.parse(localStorage.getItem('kefal.profile.v1') || '{}').eggs?.found?.graffiti === 1, 'saved to localStorage');

// duck: host claims once, the user's counter goes up once
prompt('duck').action();
ok(profile.eggs.n.duck === 1 && C.has(profile, 'duck'), 'duck counted');
ok(eggOf('duck').gone && api.model(spawnedEggs.duck).root.visible === false, 'duck is gone for everybody');
prompt('duck').action(); ok(profile.eggs.n.duck === 1, 'a claimed duck cannot be counted twice');
// forged / far requests are ignored
{ const n0 = spawned.length; player.pos.set(0, 0, 0); H.eggreq({ op: 'use', id: spawnedEggs.vending, s: world.seed | 0 }, 'me'); ok(spawned.length === n0, 'request from far away ignored'); H.eggreq({ op: 'use', id: spawnedEggs.vending, s: 1 }, 'me'); ok(spawned.length === n0, 'wrong seed ignored'); }
// vending + stash: one item(s) once
{ let n0 = spawned.length; prompt('vending').action(); ok(spawned.length === n0 + 1 && ITEMS[spawned.at(-1).type], 'vending spawns one real item'); n0 = spawned.length; prompt('vending').action(); ok(spawned.length === n0, 'vending is one-shot'); ok(C.has(profile, 'vending'), 'found vending'); }
{ const n0 = spawned.length; prompt('stash').action(); ok(spawned.length >= n0 + 2 && C.has(profile, 'stash'), 'stash spawns tools + scrap'); const n1 = spawned.length; prompt('stash').action(); ok(spawned.length === n1, 'stash is one-shot'); }
// payphone: xp once per player
{ const n0 = sent.filter((m) => m[0] === 'xp').length; prompt('payphone').action(); prompt('payphone').action(); ok(sent.filter((m) => m[0] === 'xp').length === n0 + 1 && C.has(profile, 'payphone'), 'payphone pays once'); }
// shrine: needs a held scrap item; item consumed; buff granted; once per player
{
  prompt('shrine').action(); ok(!C.has(profile, 'shrine') && !active.size, 'empty-handed: nothing happens');
  const id = game.items.hostSpawn('brass', new THREE.Vector3(), { holder: 'me' }); player.held = items.get(id);
  ok(/Offer/.test(prompt('shrine').label), 'prompt offers the held item');
  prompt('shrine').action();
  ok(!items.get(id) && [...active].some((b) => b.startsWith('egg_bless')) && C.has(profile, 'shrine'), 'offering consumed, blessing active, egg found');
  const id2 = game.items.hostSpawn('brass', new THREE.Vector3(), { holder: 'me' }); player.held = items.get(id2);
  active.clear(); prompt('shrine').action(); ok(items.get(id2) && !active.size, 'second offering from the same player is refused');
}
// statue head: frozen while looked at, turns while not
{
  const m = api.model(spawnedEggs.statue), e = eggOf('statue'); ok(m && m.head, 'statue has a head');
  const look = (yaw) => { camera.position.set(e.x, 1.6, e.z - 6); camera.rotation.set(0, yaw, 0); camera.updateMatrixWorld(true); };
  look(Math.PI);   // looks toward +z = at the statue
  for (let i = 0; i < 60; i++) mods.emit('update', 1 / 30, game);
  const frozen = m.headYaw; ok(Math.abs(frozen) < 1e-6, 'frozen while watched');
  look(0);         // looks toward -z = away
  for (let i = 0; i < 120; i++) mods.emit('update', 1 / 30, game);
  ok(Math.abs(m.headYaw) > 1.0, 'turns its head when you look away (' + m.headYaw.toFixed(2) + ')');
  const h1 = m.headYaw; look(Math.PI); for (let i = 0; i < 30; i++) mods.emit('update', 1 / 30, game); ok(m.headYaw === h1, 'frozen again when watched');
}
// late join sync + map change clears
{ const list = api.list().filter((e) => e.gone).map((e) => e.id); ok(list.includes(spawnedEggs.duck) && list.includes(spawnedEggs.vending), 'gone flags kept for late joiners');
  H.eggsync({ s: world.seed | 0 }, 'me'); ok(sent.some((m) => m[0] === 'eggst' && Array.isArray(m[1].list)), 'eggsync answers with the list'); }
game.world = { ...world, outdoor: { ...world.outdoor } }; mods.emit('update', 0.1, game);
ok(api.list().length === 0, 'eggs are cleared when the map changes');
ok(!toasts.some(([s]) => typeof s === 'string' && /undefined|\[object/.test(s)), 'no undefined text in any toast');

api.dispose();
ok(!anomaly.DEFS.egg_bless1 && (listeners.update || []).length === 0 && (listeners.interactables || []).length === 0, 'dispose removes buffs + listeners');
console.log(fails ? `eggs_install.test: ${fails} FAILED of ${checks}` : `eggs_install.test OK (${checks} checks)`);
process.exit(fails ? 1 : 0);
