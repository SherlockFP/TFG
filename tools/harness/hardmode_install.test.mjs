// Installs the hardmode module on a stub game (no browser) and drives its host rules: config sync, door lock warning, stranded crew,
// quota growth hook, creature door / light tricks, food spoilage, death notice, dispose.   node tools/harness/hardmode_install.test.mjs
globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { installHardmode } = await import('../../src/game/hardmode.js');
const D = await import('../../src/game/difficulty.js');
const { ITEMS } = await import('../../src/game/items.js');
await import('../../src/game/survival.js');   // registers the dish items

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('FAIL', m); } };

const listeners = {};
const mods = {
  on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); }; },
  emit(ev, ...a) { for (const f of [...(listeners[ev] || [])]) f(...a); },
};
const sent = [], nets = {};
const net = {
  connected: true, hostId: 'me',
  on(t, fn) { nets[t] = fn; return () => { delete nets[t]; }; }, off(t) { delete nets[t]; },
  send(t, d) { sent.push(['send', t, d]); },
  broadcast(t, d) { sent.push([t, d]); if (nets['msg:' + t]) nets['msg:' + t](d, 'me'); },
};
const sys = () => sent.filter((s) => s[0] === 'sys').map((s) => s[1].k);
const clearSent = () => { sent.length = 0; };

const doors = [
  { id: 'd1', kind: 'door', open: true, locked: false, pos: new THREE.Vector3(10, 1, 0) },
  { id: 'd2', kind: 'door', open: true, locked: false, pos: new THREE.Vector3(40, 1, 0) },
  { id: 'b1', kind: 'blast', open: false, locked: false, pos: new THREE.Vector3(20, 1, 0) },
];
const creatures = new Map();
const mkC = (id, type, x, z) => { const c = { id, type, dead: false, pos: new THREE.Vector3(x, 1, z) }; creatures.set(id, c); return c; };
const items = new Map();
let idc = 0;
const mkDish = (type = 'sv_d_stew_plain', value = 60) => { const id = 'it' + ++idc; const it = { id, type, def: ITEMS[type], value, holder: null, obj: { position: new THREE.Vector3() } }; items.set(id, it); return it; };
const laters = [];
const player = { dead: false, hp: 100, yaw: 0, pos: new THREE.Vector3(0, 0, 0), teleport(p, y) { this.pos.copy(p); this.tp = (this.tp || 0) + 1; this.yaw = y; } };
const toasts = [], said = [];
let spawnedShip = 0;
const game = {
  mods, net, selfId: 'me', isHost: true, opts: { host: true, difficulty: 'standard' }, settings: {},
  config: { dayLengthSec: 720 },
  run: { phase: 'moon', moon: 'hamsi', day: 4, time: 480, quotaIndex: 3, powerOn: true, quota: 500, credits: 100 },
  hostData: { moonT: 100 },
  world: { facility: { doors } },
  creatures: { host: creatures },
  items: { all: () => items.values() },
  director: { debug: () => ({ blackout: false }) },
  lore: { say: (s) => said.push(s) },
  ui: { toast: (...a) => toasts.push(a) },
  stats: { maxHp: 100 },
  player,
  aiPlayers: () => [{ id: 'me', dead: false, pos: new THREE.Vector3(8, 1, 0), inShip: false }],
  doorById: (id) => doors.find((d) => d.id === id),
  hostSetDoor(id, open) { const d = doors.find((x) => x.id === id); if (d && d.open !== open) { d.open = open; this.doorLog.push([id, open]); } },
  doorLog: [],
  hostSetPower(on) { this.run.powerOn = on; this.powerLog.push(on); if (!on) for (const d of doors) if (d.kind === 'blast' && !d.open) d.open = true; },
  powerLog: [],
  hostOnPlayerDied() { this.died = (this.died || 0) + 1; return 'orig'; },
  playerName: () => 'Alex',
  spawnInShip() { spawnedShip++; },
  later(fn) { laters.push(fn); },
};
const runLaters = () => { while (laters.length) laters.shift()(); };

// -------------------------------------------------------------- install + config sync
const cfg = { dayLengthSec: 720 };
const api = installHardmode(game);
ok(api && typeof api.dispose === 'function' && api.mode() === 'standard', 'install returns an api; default mode standard');
mods.emit('configure', cfg, game);
ok(cfg.difficulty === 'standard', "'configure' writes the lobby difficulty into the config (goes out in the welcome)");
game.opts.difficulty = 'hard';
mods.emit('configure', cfg, game);
ok(cfg.difficulty === 'hard', 'host screen choice is used');
game.config.difficulty = 'hard';
mods.emit('update', 0.016, game);
ok(D.getMode() === 'hard' && D.getQuota() === 3, 'every frame: mode + quota index reach difficulty.js');
game.config.difficulty = 'standard';
mods.emit('update', 0.016, game);
ok(D.getMode() === 'standard', 'a client picks the host mode from the welcome config');
ok(typeof game.hmGrowth === 'function' && typeof game.hmStrand === 'function', 'hooks for host.js installed');
mods.emit('netReady', net, game);

// -------------------------------------------------------------- lock warning
{
  const r = game.run;
  r.time = 24 * 60 - 200 * (16 * 60 / 720);   // 200 s left
  mods.emit('update', 0.1, game);
  ok(sys().length === 0, '200 s before midnight: no warning yet');
  r.time = 24 * 60 - 1;
  mods.emit('update', 0.1, game);
  ok(sys().length === 0, 'midnight has no automatic lock warning');
  r.departure38 = { seconds: 8 };
  mods.emit('update', 0.1, game);
  ok(sys().filter((k) => k.startsWith('SHIP DOOR LOCKS')).length === 1, 'one warning when crew starts eight-second departure');
  ok(sent.some((s) => s[0] === 'hms' && s[1].k === 'lock' && s[1].s === 8), 'countdown message carries actual boarding seconds');
  mods.emit('update', 0.1, game);
  ok(sys().length === 1, 'not repeated every frame');
  r.departure38.seconds = 4;
  mods.emit('update', 0.1, game);
  ok(sys().length === 2, 'four-second boarding reminder');
  r.departure38.seconds = 1;
  mods.emit('update', 0.1, game);
  ok(sys().length === 3, 'one-second boarding reminder');
  delete r.departure38;
  mods.emit('update', 0.1, game);
  clearSent();
  r.departure38={seconds:8};
  // casual: nothing
  game.config.difficulty = 'casual'; mods.emit('update', 0.1, game);
  game.run.time = 24 * 60 - 60 * (16 * 60 / 720);
  mods.emit('update', 0.1, game);
  ok(sys().length === 0, 'casual: no lock warning');
  delete r.departure38; game.config.difficulty = 'standard'; game.run.time = 480; mods.emit('update', 0.1, game);
  // early quota: nothing
  r.departure38={seconds:8};
  game.run.quotaIndex = 1; game.run.time = 24 * 60 - 60 * (16 * 60 / 720);
  mods.emit('update', 0.1, game);
  ok(sys().length === 0, 'quota 1: no lock warning in any mode');
  game.run.quotaIndex = 3; game.run.time = 480; delete game.run.departure38;
}

// -------------------------------------------------------------- stranded crew (host.js hook)
{
  clearSent();
  const late = [{ id: 'me' }];
  const set = game.hmStrand(late);
  ok(set instanceof Set && set.has('me'), 'standard: late crew are stranded (a Set of ids), not killed');
  ok(sent.some((s) => s[0] === 'hms' && s[1].k === 'strand' && s[1].ids[0] === 'me' && s[1].f === 0.5), 'stranded ids + hp fraction broadcast');
  ok(game.hmStrand([]) === null, 'nobody late -> null');
  game.config.difficulty = 'casual'; mods.emit('update', 0.1, game);
  ok(game.hmStrand(late) === null, 'casual: null -> host.js keeps the old kill rule');
  game.config.difficulty = 'standard'; game.run.quotaIndex = 2; mods.emit('update', 0.1, game);
  ok(game.hmStrand(late) === null, 'quota 2: old rule in every mode');
  game.run.quotaIndex = 3; game.run.moon = 'hq'; mods.emit('update', 0.1, game);
  game.run.moon = 'hamsi'; mods.emit('update', 0.1, game);
}

// -------------------------------------------------------------- stranded crew (client): freeze while the ground unloads, hurt at dawn
{
  player.pos.set(30, 5, 30); player.hp = 100; player.tp = 0; spawnedShip = 0;
  game.run.phase = 'takeoff';
  mods.emit('update', 0.1, game);
  ok(api.state.frozen && api.state.frozen.pos.y === 5, 'outside at takeoff: position remembered');
  player.pos.y = 2;   // ground gone, falling
  mods.emit('update', 0.1, game);
  ok(player.tp === 1 && player.pos.y === 5, 'hovers instead of falling into the void');
  net.broadcast('hms', { k: 'strand', ids: ['me'], f: 0.5 });
  game.run.phase = 'orbit';
  mods.emit('phase', 'orbit', game);
  ok(spawnedShip === 1 && player.hp === 50, 'next morning: back in the ship at 50% HP');
  ok(toasts.length === 1, 'toast tells the player why');
  player.hp = 20; api.state.strandMe = { f: 0.5 }; mods.emit('phase', 'orbit', game);
  ok(player.hp === 20, 'never heals a player who was already below the fraction');
  player.hp = 100;
  // aboard players are untouched
  game.run.phase = 'takeoff'; player.pos.set(0, 0.2, 0); api.state.frozen = null;
  mods.emit('update', 0.1, game);
  ok(!api.state.frozen, 'a player inside the ship is not frozen');
  game.run.phase = 'orbit'; mods.emit('phase', 'orbit', game);
  ok(spawnedShip === 2 && player.hp === 100, 'aboard: no hurt, no teleport (spawnedShip stays at the previous 2)');
  game.run.phase = 'moon';
}

// -------------------------------------------------------------- quota growth hook
{
  clearSent(); said.length = 0;
  game.run.quotaIndex = 4; mods.emit('update', 0.1, game);
  const m = game.hmGrowth(300, 500);   // +60% surplus
  ok(Math.abs(m - 1.15) < 1e-9, 'x1.15 for a +60% surplus: ' + m);
  ok(sent.some((s) => s[0] === 'hms' && s[1].k === 'say'), 'the Algorithm comments (broadcast say)');
  ok(game.hmGrowth(0, 500) === 1, 'exactly on quota: x1');
  game.run.quotaIndex = 3;
}

// -------------------------------------------------------------- creature tricks
{
  clearSent(); game.doorLog.length = 0;
  api.state.doorT = 0; api.state.lightT = 999; api.state.doorTold = false;
  mkC('c1', 'stalker', 12, 2);      // next to door d1 (10, 0); the player stands at (8, 0)
  mkC('c2', 'scuttler', 41, 1);     // not a door closer
  game.aiPlayers = () => [{ id: 'me', dead: false, pos: new THREE.Vector3(2, 1, 0), inShip: false }];
  mods.emit('update', 0.1, game);
  ok(game.doorLog.length === 1 && game.doorLog[0][0] === 'd1' && game.doorLog[0][1] === false, 'a stalker closes the open door next to it');
  ok(sys().includes('Something closed a door nearby.'), 'one hint per landing');
  api.state.doorT = 0; doors[0].open = true; game.doorLog.length = 0; clearSent();
  game.aiPlayers = () => [{ id: 'me', dead: false, pos: new THREE.Vector3(10, 1, 0.5), inShip: false }];
  mods.emit('update', 0.1, game);
  ok(game.doorLog.length === 0, 'never closes a door somebody stands in');
  game.aiPlayers = () => [{ id: 'me', dead: false, pos: new THREE.Vector3(2, 1, 0), inShip: false }];
  api.state.doorT = 0; creatures.delete('c1'); mods.emit('update', 0.1, game);
  ok(game.doorLog.length === 0, 'no door closer around -> nothing (a scuttler does not)');
  // lights
  mkC('c3', 'lurker', 6, 0);
  api.state.lightT = 0; api.state.doorT = 999;
  mods.emit('update', 0.1, game);
  ok(game.powerLog[0] === false && !game.run.powerOn && api.state.cut, 'a lurker cuts the lights');
  ok(sys().includes('The lights just went out. Something did that.'), 'and the crew is told');
  doors[2].open = false;   // pretend the blast door was reclosed... it was forced open by the cut
  for (let i = 0; i < 400 && !game.run.powerOn; i++) mods.emit('update', 0.1, game);
  ok(game.run.powerOn && game.powerLog.at(-1) === true, 'power comes back after 9-16 s');
  ok(!doors[2].open, 'secure doors are closed again');
  // early game / casual: nothing
  game.powerLog.length = 0; game.doorLog.length = 0; doors[0].open = true;
  api.state.doorT = 0; api.state.lightT = 0;
  game.config.difficulty = 'casual'; mods.emit('update', 0.1, game);
  ok(!game.powerLog.length && !game.doorLog.length, 'casual: no tricks');
  game.config.difficulty = 'standard'; game.run.quotaIndex = 2; api.state.doorT = 0; api.state.lightT = 0;
  mods.emit('update', 0.1, game);
  ok(!game.powerLog.length && !game.doorLog.length, 'quota 2: no tricks');
  game.run.quotaIndex = 3;
  // grace period after landing
  game.hostData.moonT = 5; api.state.doorT = 0; creatures.set('c1', { id: 'c1', type: 'stalker', dead: false, pos: new THREE.Vector3(12, 1, 2) });
  mods.emit('update', 0.1, game);
  ok(!game.doorLog.length, 'the first 25 s after landing are calm');
  game.hostData.moonT = 100;
  // director blackout running: no second cut
  game.director.debug = () => ({ blackout: true }); api.state.lightT = 0; api.state.doorT = 999; game.powerLog.length = 0;
  mods.emit('update', 0.1, game);
  ok(!game.powerLog.length, 'does not stack on a Director blackout');
  game.director.debug = () => ({ blackout: false });
}

// -------------------------------------------------------------- food spoilage
{
  clearSent(); game.run.day = 4; game.run.quotaIndex = 3;
  const dish = mkDish('sv_d_stew_plain', 60);
  api.stamp(dish.id);
  ok(api.spoilCheck() === 0, 'fresh dishes do not spoil');
  game.run.day = 6;
  ok(api.spoilCheck() === 0, 'after 2 days: still fine');
  const raw = mkDish('sv_d_soup_plain', 40);   // unstamped (saved / debug dish): its clock starts at the first check, day 6
  ok(api.spoilCheck() === 0, 'an unstamped dish gets its clock at the first check');
  game.run.day = 7;
  const n = api.spoilCheck();
  ok(n === 1, 'after 3 days the stamped dish spoils (the unstamped one is 1 day old): ' + n);
  const ev = sent.find((s) => s[0] === 'it' && s[1].e === 'val' && s[1].id === dish.id);
  ok(ev && ev[1].v === 24, 'heal value x0.4: 60 -> ' + ev?.[1].v);
  ok(sys().includes('Some food in the ship has spoiled.'), 'the crew is told');
  ok(api.spoilCheck() === 0, 'a dish spoils only once');
  game.run.day = 9;
  ok(api.spoilCheck() === 1 && raw, 'the unstamped dish spoils 3 days after it was first seen');
  // casual / early: never
  const d2 = mkDish(); api.stamp(d2.id); game.run.day = 30;
  game.config.difficulty = 'casual'; mods.emit('update', 0.1, game);
  ok(api.spoilCheck() === 0, 'casual: food never spoils');
  game.config.difficulty = 'standard'; game.run.quotaIndex = 2; mods.emit('update', 0.1, game);
  ok(api.spoilCheck() === 0, 'quota 2: food never spoils');
  game.run.quotaIndex = 3; mods.emit('update', 0.1, game);
  // gone items are forgotten
  items.delete(d2.id); api.spoilCheck();
  ok(!api.state.stamps.has(d2.id), 'stamps of removed items are pruned');
  // a non-dish never spoils
  const junk = { id: 'j1', type: 'flashlight', def: ITEMS.flashlight, value: 10, holder: null, obj: { position: new THREE.Vector3() } }; items.set('j1', junk);
  api.stamp('j1'); game.run.day = 99;
  ok(api.spoilCheck() >= 0 && !sent.some((s) => s[0] === 'it' && s[1].id === 'j1'), 'only dishes are touched');
}

// -------------------------------------------------------------- death notice (loot stays where it fell)
{
  clearSent();
  const loot = { id: 'l1', type: 'goldbar', def: ITEMS.goldbar, value: 120, holder: null, obj: { position: new THREE.Vector3(1, 0, 1) } };
  const far = { id: 'l2', type: 'goldbar', def: ITEMS.goldbar, value: 500, holder: null, obj: { position: new THREE.Vector3(50, 0, 1) } };
  items.set('l1', loot); items.set('l2', far);
  const r = game.hostOnPlayerDied('me', { cause: 'hound', pos: [0, 0, 0] });
  ok(r === 'orig' && game.died === 1, 'the original hostOnPlayerDied still runs and returns');
  runLaters();
  const msg = sent.find((s) => s[0] === 'sys' && s[1].k?.includes('dropped'));
  ok(msg && msg[1].v.v === 120 && msg[1].v.name === 'Alex', 'notice names the player and the nearby loot only');
  clearSent(); game.hostOnPlayerDied('me', { cause: 'left', pos: [0, 0, 0] }); runLaters();
  ok(!sys().length, "no notice for 'left behind'");
  game.config.difficulty = 'casual'; mods.emit('update', 0.1, game); game.hostOnPlayerDied('me', { cause: 'hound', pos: [0, 0, 0] }); runLaters();
  ok(!sys().length, 'casual: no notice');
  game.config.difficulty = 'standard'; mods.emit('update', 0.1, game);
}

// -------------------------------------------------------------- rules announcement at the first pressure landing
{
  clearSent(); game.run.quotaIndex = 3; mods.emit('phase', 'moon', game);
  ok(sys().includes('From quota 3 the {@d} rules apply: less loot, heavier hauls, spoiling food.'), 'one info line when the pressure rules start');
  clearSent(); mods.emit('phase', 'moon', game);
  ok(!sys().length, 'only once per quota');
}

// -------------------------------------------------------------- dispose
const origDied = game.hostOnPlayerDied;
api.dispose();
ok(!game.hmGrowth && !game.hmStrand, 'hooks removed on dispose');
ok(D.getMode() === 'standard' && D.getQuota() === 0, 'ambient difficulty reset');
ok(Object.keys(listeners).every((k) => !listeners[k].length), 'all mod listeners removed');
ok(game.hostOnPlayerDied !== undefined && origDied !== undefined, 'wrap restored');

console.log(fails ? `${fails} FAILED of ${checks}` : `all ${checks} hardmode install checks passed`);
process.exit(fails ? 1 : 0);
