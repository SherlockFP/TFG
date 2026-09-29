// STEALTH wave 4 - module wiring test (pure node, fake game object):  node tools/harness/stealth_install.test.mjs
// Installs the REAL game/stealth.js on a fake Game + a real generated / built facility (stub physics) and drives the runtime paths that a browser run would:
// registration (Listener + spawn weights + Crawler re-wire), sneak key, surface multiplier, noise events (client batch -> host handler -> creatures.noise, rate limit),
// wall muffling via hearDist, door + item-impact wrappers, hatch drop (quiet vs noisy), latch prompt on both sides + unlock, nook reward spawn, dispose restores everything.
import * as THREE from 'three';
import { generateLayout, buildFacility } from '../../src/world/facility.js';
import { installStealth, registerStealthContent } from '../../src/game/stealth.js';
import { CREATURES, EXTRA_SPAWNS, spawnTable } from '../../src/game/creatures.js';
import { BEHAVIORS } from '../../src/entities/creatures.js';
import { MOONS } from '../../src/game/moons.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---- a facility with everything (pick the first seed that has hatch + shortcut + rewards)
let L = null;
for (let s = 1; s < 400 && !L; s++) {
  const l = generateLayout(s * 977, 'factory', 1.8);
  if (l.variety?.hatches.length && l.variety.shortcut && l.variety.deadEnds.length >= 2) L = l;
}
ok(!!L, 'found a layout with hatch + shortcut + nooks');
let n = 0;
const physics = new Proxy({}, { get: () => () => ({ handle: n++ }) });
const w0 = console.warn; console.warn = () => {};   // facsys wants a DOM canvas for its terminal screens (node has none: it logs and carries on)
const fac = buildFacility(L, { physics, lightPool: { add() {}, remove() {}, emitters: new Set() } });
console.warn = w0;
ok(fac.variety?.hatches.length > 0 && fac.variety.rewards.length > 0 && !!fac.variety.shortcut, 'facility exposes hatches / rewards / latch');

// ---- fake game
const handlers = {}, sent = [], spawned = [], noises = [], toasts = [], sfx = [];
const mods = { L: {}, on(ev, fn) { (this.L[ev] ||= []).push(fn); return () => { this.L[ev] = this.L[ev].filter((f) => f !== fn); }; }, emit(ev, ...a) { for (const f of this.L[ev] || []) f(...a); } };
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, noise: 0, indoor: true, inShip: false, dead: false, sneak: false, crouch: false, footIdx: 0,
  teleport(p) { this.pos.copy(p); this.teleported = (this.teleported || 0) + 1; } };
const moonId = 'lufer';
const game = {
  isHost: true, selfId: 'me', mods, config: {}, settings: { keys: { sneak: 'AltLeft' } }, time: 0,
  input: { down: new Set(), enabled: true, locked: false },
  run: { phase: 'moon', moon: moonId, seed: 777, quotaIndex: 1 },
  world: { facility: fac }, player,
  creatures: { noise(p, loud, owner) { noises.push({ p: p.clone(), loud, owner }); } },
  net: { broadcast(t, d) { sent.push({ t, d }); }, request(a, d) { sent.push({ a, d }); }, on() {}, off() {}, handlers },
  items: { hostSpawn(id, pos, o) { spawned.push({ id, pos, o }); return {}; } },
  ui: { toast(m) { toasts.push(m); } }, engine: { shake() {} }, sfx(n) { sfx.push(n); }, audio: { at() {} },
  aiPlayerById(id) { return id === 'far' ? { pos: new THREE.Vector3(1e4, 0, 0) } : { pos: player.pos }; },
  doorById(id) { return fac.doors.find((d) => d.id === id); },
  hostSetDoor(id, open, silent) { const d = this.doorById(id); if (d && d.open !== open) { d.open = open; this.doorSet = { id, open, silent }; } },
  onItemImpact(it, dv) { this.impact = dv; },
};
const origSetDoor = game.hostSetDoor, origImpact = game.onItemImpact;
const origCrawler = BEHAVIORS.crawler;
const api = installStealth(game);
ok(!!api && typeof api.dispose === 'function', 'installStealth returns an api');
// registration
ok(CREATURES.listener?.custom && CREATURES.listener.zone === 'in' && CREATURES.listener.walk < 2 && CREATURES.listener.run > 8, 'listener registered');
ok(EXTRA_SPAWNS.listener, 'listener spawn weights registered');
const tier1 = spawnTable({ ...MOONS.lufer, tier: 1 }, 'in'), tier3 = spawnTable({ ...MOONS.cipura }, 'in');
ok(!('listener' in tier1), 'no Listener on tier 1 moons (fair early game)');
ok(tier3.listener > 0, `Listener on tier 3 moons (weight ${tier3.listener})`);
ok(BEHAVIORS.crawler !== origCrawler, 'crawler behaviour re-wired');
// handlers
const H = (a, fn) => { handlers[a] = fn; };
mods.emit('registerHandlers', H, game);
ok(typeof handlers.stn === 'function', "'stn' handler registered");

// ---- sneak key + surfaces
ok(api.sneakHeld() === false, 'sneak not held');
game.input.down.add('AltLeft'); ok(api.sneakHeld() === true, 'Alt = sneak');
game.input.down.clear(); game.input.down.add('AltRight'); ok(api.sneakHeld() === true, 'right Alt = sneak');
game.input.down.clear();
game.lastStepSurface = 'metal'; ok(api.surfaceMul() > 1.4, 'metal loud');
game.lastStepSurface = 'carpet'; ok(api.surfaceMul() < 0.7, 'carpet quiet');
const pool = fac.variety.pools[0];
if (pool) { player.pos.set((pool.x0 + pool.x1) / 2, L.y, (pool.z0 + pool.z1) / 2); game.lastStepSurface = 'carpet'; ok(api.surfaceMul() >= 1.4, 'pool room floor counts as water'); }
game.config.stealth = false; ok(api.sneakHeld() === false, 'config.stealth = false disables it'); game.config.stealth = undefined;

// ---- noise events
player.pos.set(0, L.y, 0);
api.hostNoiseAt(new THREE.Vector3(3, L.y, 4), 1.0, 'impact');
ok(noises.length === 1 && noises[0].owner === null && noises[0].loud === 1.0, 'host noise is owner-less');
ok(sent.some((m) => m.t === 'stv' && m.d.e[0][2] === 100), "loud events broadcast an 'stv' ring row");
sent.length = 0; noises.length = 0;
handlers.stn({ e: [[4, 30, 0, 40, 60], [4, 99999, 0, 0, 60], [1, 'x']] }, 'me');
ok(noises.length === 1 && Math.abs(noises[0].p.x - 3) < 1e-6 && Math.abs(noises[0].loud - 0.6) < 1e-6, "'stn' batch validated (far / broken rows dropped)");
noises.length = 0;
for (let i = 0; i < 60; i++) handlers.stn({ e: [[4, 30, 0, 40, 60]] }, 'me');
ok(noises.length <= 14, `host rate limit (${noises.length} of 60 accepted)`);
// client path: batches instead of applying
game.isHost = false; sent.length = 0;
api.emit('impact', 1, L.y, 2, 0.5); api.emit('impact', 20, L.y, 2, 0.5);
mods.emit('update', 0.016, game);
mods.emit('update', 0.2, game);
game.isHost = true;

// ---- muffled hearing
const A = new THREE.Vector3(fac.layout.ox + 60, L.y, fac.layout.oz + 60), B = new THREE.Vector3(A.x + 3, L.y, A.z);
ok(api.hearDist(A, B, { zone: 'out' }, 3) === 3, 'outdoor creatures hear in open air');
const dIn = api.hearDist(A, B, { zone: 'in' }, 3);
ok(dIn >= 3, 'indoor distance is never shorter than the straight line');
const O = new THREE.Vector3(0, 0, 0);
ok(api.hearDist(O, new THREE.Vector3(2, 0, 0), { zone: 'in' }, 2) === 2, 'outside the facility (y) = open air');

// ---- door + item wrappers
const door = fac.doors.find((d) => d.kind === 'door' && !d.locked && !d.open);
noises.length = 0;
game.hostSetDoor(door.id, true, false);
ok(noises.length === 1 && noises[0].loud === 0.35, 'a door opened by a player makes noise');
game.hostSetDoor(door.id, false, true);
ok(noises.length === 1, 'creature (silent) doors make none');
noises.length = 0;
game.onItemImpact({ obj: { position: new THREE.Vector3(1, L.y, 1) }, def: {} }, 5);
ok(game.impact === 5 && noises.length === 1 && noises[0].loud > 0.3, 'a dropped item makes noise (impact 5)');
noises.length = 0;
game.onItemImpact({ obj: { position: new THREE.Vector3(1, L.y, 1) }, def: {} }, 2);
ok(noises.length === 0, 'a soft landing is silent');

// ---- hatch
const h = fac.variety.hatches[0];
player.pos.set(h.x, h.y, h.z); player.noise = 0.02;
for (let i = 0; i < 40; i++) mods.emit('update', 0.05, game);
ok(!player.teleported, 'sneaking over the hatch is safe');
player.noise = 0.5;
for (let i = 0; i < 12; i++) { player.noise = 0.5; mods.emit('update', 0.05, game); }
ok(player.teleported === 1, 'a noisy step drops you');
ok(Math.hypot(player.pos.x - h.to.x, player.pos.z - h.to.z) < 0.5 && toasts.some((m) => /gives way/.test(m)), 'landed at the destination with a toast');
ok(noises.some((q) => q.loud >= 1.2), 'the crash is heard');

// ---- latch shortcut
const sc = fac.doors.find((d) => d.info?.shortcut);
ok(!!sc && sc.locked, 'shortcut door exists and starts locked');
const side = (s) => { const off = 1.6 * (s === 'b' ? 1 : -1); return sc.info.dir === 0 ? new THREE.Vector3(sc.pos.x + off, L.y, sc.pos.z) : new THREE.Vector3(sc.pos.x, L.y, sc.pos.z + off); };
player.pos.copy(side(sc.info.latch === 'a' ? 'b' : 'a'));
ok(/Locked/.test(api.shortcutPrompt(sc).label), 'wrong side: Locked');
player.pos.copy(side(sc.info.latch));
const pr = api.shortcutPrompt(sc);
ok(/Release the latch/.test(pr.label), 'latch side: Release the latch');
sent.length = 0; pr.action();
ok(sent.some((m) => m.a === 'unlock' && m.d.id === sc.id), "latch sends the existing 'unlock' request");
ok(api.shortcutPrompt({ ...sc, info: { ...sc.info, shortcut: false } }) === null, 'plain doors are untouched');

// ---- rewards
mods.emit('moonPopulated', game);
ok(spawned.length >= 1 && spawned.length <= 3 && spawned.every((s) => s.o.valueMul > 1), `nook prizes spawned (${spawned.length}, value x${spawned[0]?.o.valueMul.toFixed(2)})`);
const again = spawned.length;
mods.emit('moonPopulated', game);
ok(spawned.length === again * 2 || spawned.length > again, 'a re-populate spawns again deterministically (host decides when)');
game.config.stealthLoot = false; const k = spawned.length; mods.emit('moonPopulated', game); ok(spawned.length === k, 'config.stealthLoot = false disables prizes');

// ---- dispose restores everything
api.dispose();
ok(game.hostSetDoor === origSetDoor && game.onItemImpact === origImpact, 'wrapped host / action methods restored');
ok(BEHAVIORS.crawler === origCrawler, 'crawler behaviour restored');
ok((mods.L.update || []).length === 0, 'update listeners removed');
registerStealthContent();

console.log(`stealth install: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
