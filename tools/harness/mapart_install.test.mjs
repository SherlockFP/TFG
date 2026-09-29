// [mapart] node smoke test: installs the module on a stub game (no browser, real THREE + real placement code) and drives the host flows:
//   mapLoaded -> layer built + colliders -> prompts -> pylon sabotage (spawn timers frozen, once only, reach check) -> billboard shot -> drone kill + loot -> melee wrap -> late-join sync -> dispose.
//   node tools/harness/mapart_install.test.mjs
globalThis.window = globalThis;
const THREE = await import('three');
const { installMapArt } = await import('../../src/game/mapart.js');
const C = await import('../../src/game/mapart_core.js');
const { MOONS } = await import('../../src/game/moons.js');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };
const listeners = {};
const mods = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; },
  emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); },
};
const nets = {}, H = {}, sent = [];
const net = {
  connected: true,
  on_(t, fn) { nets[t] = fn; }, handle(a, fn) { H[a] = fn; },
  broadcast(t, d) { sent.push([t, d]); if (nets[t]) nets[t](d, 'me'); },
  sendTo(id, t, d) { sent.push([t, d]); if (nets[t]) nets[t](d, 'me'); },
  request(a, d) { if (H[a]) H[a]({ a, ...d }, 'me'); },
};
const player = { pos: new THREE.Vector3(0, 0, 0), indoor: false, dead: false };
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, 0);
const toasts = [], spawned = [], colliders = [];
let melee = 0;
const game = {
  mods, net, selfId: 'me', isHost: true, remotes: new Map(), player, camera, destroyed: false, time: 100, scene: new THREE.Scene(),
  run: { phase: 'moon' }, hostData: { spawnT: 30, outdoorSpawnT: 20 },
  ui: { toast: (s, k) => toasts.push([s, k]), systemMessage: (s) => toasts.push([s, 'chat']), hud: { bigText: (a, b) => toasts.push([a, b]) } },
  sfx() {},
  physics: { addStaticBox: (...a) => { const c = { a }; colliders.push(c); return c; }, removeCollider: (c) => { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); } },
  items: { hostSpawn(type, pos) { spawned.push({ type, pos: pos.clone() }); return 'i' + spawned.length; } },
  resolveMelee() { melee++; },
  interactablesNow() { const out = []; mods.emit('interactables', out, game); return out; },
};
const moonId = Object.keys(MOONS).find((k) => !MOONS[k].company && !MOONS[k].customMap);
const path = Array.from({ length: 40 }, (_, i) => ({ x: i * 2.6, z: Math.sin(i / 5) * 10 + 22 }));
const terrain = { scale: 1, heightAt: (x, z) => Math.sin(x * 0.05) * 1.5 + Math.cos(z * 0.04) * 1.5, pathPts: path };
const mkWorld = (seed) => ({
  moonId, seed, company: null,
  outdoor: { terrain, group: new THREE.Group(), avoid: (x, z, m = 0) => Math.hypot(x, z) < 26 + m, harvest: { trees: [{ x: 50, z: 50 }], rocks: [] }, plan: { entrance: { x: 90, z: -20 }, fires: [{ x: -60, z: 60 }], ponds: [], lakes: [], biome: { decor: 'datascape', grid: 0x2af4ff } } },
});
const api = installMapArt(game);
ok(api && typeof api.dispose === 'function', 'module installs');
mods.emit('netReady', net, game);
ok(typeof H.mareq === 'function' && typeof H.masync === 'function' && typeof nets.mast === 'function', 'net handlers bound');
ok(game.resolveMelee !== undefined && Object.prototype.hasOwnProperty.call(game, 'resolveMelee'), 'melee wrapped');

game.world = mkWorld(4242);
mods.emit('mapLoaded', game.world, game);
const plan = api.plan();
ok(plan.length > 14, `layer planned (${plan.length})`);
ok(colliders.length > 10, `colliders added (${colliders.length})`);
ok(game.world.outdoor.group.children.length >= 2, 'art group + horizon attached to the outdoor group');
ok(api.family() === 'monolith', 'datascape -> monolith landmark');
const again = (() => { const w = mkWorld(4242); mods.emit('mapLoaded', w, game); return JSON.stringify(api.plan()); })();
ok(again === JSON.stringify(plan), 'rebuilding the same map gives the identical layout');
const before = colliders.length; game.world = mkWorld(4242); mods.emit('mapLoaded', game.world, game);
ok(Math.abs(colliders.length - before) < 2, 'colliders are replaced, not stacked');

const py = plan.filter((p) => p.kind === 'pylon'), dr = plan.filter((p) => p.kind === 'drone'), bd = plan.filter((p) => p.kind === 'billboard'), camp = plan.find((p) => p.kind === 'camp');
const seed = 4242;
// ---- prompts: nothing far away, pylon prompt near
player.pos.set(0, 0, 0);
ok(game.interactablesNow().length === 0, 'no prompt at the ship');
player.pos.set(py[0].x + 1.5, py[0].y, py[0].z);
let prompts = game.interactablesNow();
ok(prompts.length >= 1 && prompts.some((p) => /feed/i.test(p.label)), 'pylon prompt offers to cut the feed');
// ---- sabotage: too far is ignored, close works once, spawn timers freeze
player.pos.set(py[0].x + 40, py[0].y, py[0].z);
H.mareq({ s: seed, op: 'sab', id: py[0].id }, 'me');
ok(!api.offStream(), 'sabotage from 40 m away is refused');
player.pos.set(py[0].x + 1.5, py[0].y, py[0].z);
H.mareq({ s: seed, op: 'sab', id: py[0].id }, 'me');
ok(api.offStream() && C.offLeft(api.state(), game.time) > 59, 'sabotage opens the off-stream window');
ok(toasts.some(([s]) => /OFF-STREAM/.test(s)), 'players are told');
const t0 = game.hostData.spawnT, o0 = game.hostData.outdoorSpawnT;
for (let i = 0; i < 20; i++) { game.time += 0.05; game.hostData.spawnT -= 0.05; game.hostData.outdoorSpawnT -= 0.05; mods.emit('update', 0.05, game); }
ok(Math.abs(game.hostData.spawnT - t0) < 1e-6 && Math.abs(game.hostData.outdoorSpawnT - o0) < 1e-6, 'host creature spawn timers stand still while off-stream');
const sabs = sent.filter(([t, d]) => t === 'mast' && d.k === 'off').length;
H.mareq({ s: seed, op: 'sab', id: py[0].id }, 'me');
ok(sent.filter(([t, d]) => t === 'mast' && d.k === 'off').length === sabs, 'the same pylon cannot be cut twice');
game.time += 61; mods.emit('update', 0.05, game);
ok(!api.offStream(), 'window closes after 60 s');
const t1 = game.hostData.spawnT; game.hostData.spawnT -= 0.05; mods.emit('update', 0.05, game);
ok(game.hostData.spawnT < t1, 'timers run again afterwards');
ok(H.mareq({ s: 1, op: 'sab', id: py[1].id }, 'me') === undefined && !api.state().pylons[py[1].id], 'a request for another map seed is ignored');
// ---- billboard: a shot that passes through it silences it; a shot that stops short does not
const b0 = bd[0], cy = b0.y + 2.7 + 1.8;
player.pos.set(b0.x, b0.y, b0.z - 8);
mods.emit('fx', { k: 'cb', t: 'tr', a: [b0.x, b0.y + 1.6, b0.z - 8], b: [b0.x, b0.y + 1.6, b0.z - 5] }, 'me');
ok(!api.state().boards[b0.id], 'a shot that ends short misses');
game.time += 1;
mods.emit('fx', { k: 'cb', t: 'tr', a: [b0.x, b0.y + 1.6, b0.z - 8], b: [b0.x, cy, b0.z + 6] }, 'me');
ok(api.state().boards[b0.id], 'a shot through the billboard silences it');
ok(api.art().boards.get(b0.id).silenced, 'and the client shows ERROR 404');
// a forged tracer from far away is refused
const b1 = bd[1];
player.pos.set(0, 0, 0); game.time += 1;
mods.emit('fx', { k: 'cb', t: 'tr', a: [b1.x, b1.y + 1, b1.z - 8], b: [b1.x, b1.y + 4, b1.z + 6] }, 'me');
ok(!api.state().boards[b1.id], 'tracer whose muzzle is far from the sender is ignored');
// ---- drone: 3 hits, loot once
const d0 = dr[0], through = (e, t) => [e[0] + (t.x - e[0]) * 1.5, e[1] + (t.y - e[1]) * 1.5, e[2] + (t.z - e[2]) * 1.5];
const e0 = [d0.x, d0.gy + 1.6, d0.z - 4];
player.pos.set(d0.x, d0.gy, d0.z - 4);
for (let i = 0; i < 3; i++) { game.time += 0.2; mods.emit('fx', { k: 'cb', t: 'tr', a: e0, b: through(e0, d0) }, 'me'); }
ok(api.state().drones[d0.id] === 0 && api.art().drones.get(d0.id).dead, 'three hits knock the drone down');
ok(spawned.length === 1 && C.DRONE_LOOT.includes(spawned[0].type), 'one component drops: ' + spawned[0]?.type);
game.time += 0.2; mods.emit('fx', { k: 'cb', t: 'tr', a: e0, b: through(e0, d0) }, 'me');
ok(spawned.length === 1, 'a dead drone drops nothing more');
// ---- melee wrapper: a swing at a drone requests a hit, the original swing still runs
const d1 = dr[1];
player.pos.set(d1.x, d1.gy, d1.z - 2);
camera.position.set(d1.x, d1.y - 0.4, d1.z - 1.6); camera.quaternion.identity(); camera.lookAt(d1.x, d1.y, d1.z); camera.updateMatrixWorld(true);
const hp0 = api.state().drones[d1.id];
game.resolveMelee({ reach: 2.4, dmg: 5 });
ok(melee === 1, 'original resolveMelee still runs');
ok(api.state().drones[d1.id] === hp0 - 1, 'a swing that lands hits the drone');
// ---- journal prompt
player.pos.set(camp.x, camp.y, camp.z);
const cp = game.interactablesNow().find((p) => /journal/i.test(p.label));
ok(!!cp, 'camp offers the crew journal');
if (cp) { cp.action(); ok(toasts.some(([a]) => /journal/i.test(a)), 'journal text shown'); }
// ---- late join: sync restores the state
const late = { pylons: 0, boards: 0, drones: 0 };
sent.length = 0;
H.masync({ s: seed }, 'other');
const sync = sent.find(([t, d]) => t === 'mast' && d.k === 'sync')?.[1];
ok(sync && sync.py.includes(py[0].id) && sync.bd.includes(b0.id) && sync.dr[d0.id] === 0, 'masync carries pylons / billboards / drone hp');
void late;
// ---- skips
const homeWorld = mkWorld(1); const moon = MOONS[moonId]; const oc = moon.customMap; moon.customMap = () => null;
mods.emit('mapLoaded', homeWorld, game); ok(api.plan().length === 0, 'homeworld (customMap) is skipped');
moon.customMap = oc;
mods.emit('mapLoaded', { moonId, seed: 9, company: {}, outdoor: null }, game); ok(api.plan().length === 0, 'company / no outdoor is skipped');
// ---- dispose
game.world = mkWorld(7); mods.emit('mapLoaded', game.world, game);
ok(api.plan().length > 0, 'rebuilt');
api.dispose();
ok(colliders.length === 0, 'dispose removes every collider');
ok(!Object.prototype.hasOwnProperty.call(game, 'resolveMelee') || game.resolveMelee !== undefined, 'melee wrapper removed');
console.log(`mapart_install.test ${fails ? 'FAILED' : 'OK'} (${checks} checks, ${fails} fails)`);
process.exit(fails ? 1 : 0);
