// maps5 module test (fake game):  node tools/harness/maps5_install.test.mjs
// installMaps5 on a fake Game: registration, landing population, prize alarms, the stack shift director + client apply, the ladder wrapper, zone fog,
// and the two creature AIs (Hedge Warden follows the maze corridors only; Cryo Sleeper thaws / hunts / chills / returns).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBiomeDecor } from '../../src/world/outdoor_biomes.js';
import { installMaps5 } from '../../src/game/maps5.js';
import { BIOMES, MOONS } from '../../src/game/moons.js';
import { CREATURES } from '../../src/game/creatures.js';
import { ITEMS } from '../../src/game/items.js';
import { tIn } from '../../src/core/i18n.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const hf = (x, z) => Math.sin(x * 0.02) * 1.6 + Math.cos(z * 0.017) * 1.2 + Math.sin((x + z) * 0.05) * 0.5;

function decorFor(kind, seed) {
  const boxes = [], reserved = [], group = new THREE.Group();
  const terrain = { heightAt: hf, scale: 1.1, half: 176, playHalf: 143, pathPts: [{ x: 0, z: 0 }, { x: 60, z: 20 }, { x: 90, z: 60 }, { x: 100, z: 100 }] };
  const avoid = (x, z, m = 0) => Math.hypot(x, z) < 26 + m || reserved.some((r) => Math.hypot(x - r.x, z - r.z) < r.radius + m);
  const decor = buildBiomeDecor({ seed, moon: kind === 'm5estate' ? MOONS.m5est : MOONS.m5cold, biome: BIOMES[kind], terrain, plan: {}, group, addBox: (x, y, z, sx, sy, sz, rot) => { const c = { x, y, z, sx, sy, sz, rot: rot || 0, enabled: true, setEnabled(v) { c.enabled = v; } }; boxes.push(c); return c; }, avoid, emitters: [], sc: 1.1, reserve: (x, z, radius) => reserved.push({ x, z, radius }) });
  return { decor, boxes, terrain };
}

function fakeGame(kind, seed, moonId) {
  const handlers = new Map(), netH = new Map(), netReq = new Map();
  const D = decorFor(kind, seed);
  const player = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, vel: new THREE.Vector3(), dead: false, inShip: false, indoor: false, frozen: false, grounded: true, minVelY: -9, fallStartY: 3, airT: 2, calls: [], update(dt, input) { this.calls.push({ dt, vy: this.vel.y }); } };
  const sent = [], spawned = [], hostSpawns = [], slows = [], bigTexts = [], toasts = [], amb = [];
  const items = new Map();
  const g = {
    isHost: true, selfId: 'me',
    mods: { on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); return () => handlers.get(ev).splice(handlers.get(ev).indexOf(fn), 1); }, emit(ev, ...a) { for (const fn of handlers.get(ev) || []) fn(...a); } },
    run: { phase: 'moon', moon: moonId, seed: 4242, day: 1, quotaIndex: 0, time: 600 },
    world: { outdoor: { decor: D.decor, terrain: D.terrain }, facility: null, terrain: D.terrain },
    player, lights: { hemi: { intensity: 1 }, sun: { intensity: 1 } },
    engine: { scene: { fog: { density: 0.02, color: new THREE.Color(0x889999) }, background: new THREE.Color(0x889999) } },
    audio: { has: () => true, play() {}, at() {}, setAmbience(l, name, v) { amb.push([l, name, v]); } },
    ui: { hud: { bigText: (a, b) => bigTexts.push([a, b]) }, toast: (m) => toasts.push(m) },
    net: {
      on_: (type, fn) => netH.set(type, fn), handle: (a, fn) => netReq.set(a, fn), request: (a, d) => netReq.get(a)?.(d, 'me'),
      broadcast: (type, d) => { sent.push([type, d]); netH.get(type)?.(d); }, sendTo: (to, type, d) => sent.push(['to:' + to, type, d]),
    },
    items: { hostSpawn(id, pos, o) { const iid = 'i' + spawned.length; spawned.push({ id: iid, type: id, pos: pos.clone(), o }); items.set(iid, { id: iid, type: id, state: 'world', holder: null, obj: { position: pos.clone() } }); return iid; }, get: (id) => items.get(id), all: () => items.values() },
    creatures: { host: new Map(), hostSpawn(type, pos, o) { const c = { id: 'c' + hostSpawns.length, type, pos: pos.clone(), opts: o, data: { ...(o.data || {}) }, dead: false }; hostSpawns.push(c); g.creatures.host.set(c.id, c); return c; }, noise() {}, playersFor: () => [] },
    aiPlayers: () => [{ id: 'me', pos: player.pos, dead: false, inShip: false, zone: 'out', crouch: false, eye: player.pos }],
    hostSlowPlayer: (id, t) => slows.push([id, t]),
    later: (fn, ms) => setTimeout(fn, ms),
  };
  g.player = player;
  return { g, handlers, sent, spawned, hostSpawns, slows, bigTexts, toasts, amb, items, D, netH, netReq, player };
}

await ok('install: registers creatures, items, translations; exposes generators', () => {
  const F = fakeGame('m5estate', 5, 'm5est');
  const api = installMaps5(F.g);
  assert.ok(api && api.generators.planHedge && api.generators.planStacks && api.generators.planArchive);
  for (const id of ['m5warden', 'm5sleeper']) assert.ok(CREATURES[id]?.behavior && CREATURES[id].noSpawn && CREATURES[id].zone === 'out', id);
  for (const id of ['m5_heart', 'm5_ledger', 'm5_cryocore', 'm5_shears', 'm5_frostfilm']) assert.ok(ITEMS[id]?.value?.length === 2, id);
  assert.equal(tIn('tr', 'Hedge Warden'), 'Çit Bekçisi');
  assert.equal(tIn('ru', 'Cryo Core'), 'Крио-ядро');
  assert.ok(CREATURES.m5warden.hp <= 300 && CREATURES.m5sleeper.dmg <= 30, 'balanced for tier 2 / 3');
  api.dispose();
});

await ok('Estate 9 landing: prizes + warden in the statue spot, loot spots, no sleepers', () => {
  const F = fakeGame('m5estate', 5, 'm5est');
  const api = installMaps5(F.g);
  F.g.mods.emit('mapLoaded', F.g.world, F.g);
  F.g.mods.emit('moonPopulated', F.g);
  const types = F.spawned.map((s) => s.type);
  assert.ok(types.includes('m5_heart') && types.includes('m5_ledger'), 'both prizes spawn');
  assert.equal(F.hostSpawns.filter((c) => c.type === 'm5warden').length, 1);
  assert.equal(F.hostSpawns.filter((c) => c.type === 'm5sleeper').length, 0);
  const w = F.hostSpawns[0], h = F.D.decor.info.hedge;
  assert.ok(Math.hypot(w.pos.x - h.wardenSpot.x, w.pos.z - h.wardenSpot.z) < 0.01);
  assert.ok(F.spawned.length >= 4 && F.spawned.length <= 20, 'prizes + about 60 % of the spots: ' + F.spawned.length);
  // lifting the heart wakes the warden (alarm flag), once
  const heart = F.spawned.find((s) => s.type === 'm5_heart');
  F.items.get(heart.id).holder = 'me';
  F.g.mods.emit('update', 0.6, F.g);
  assert.equal(w.data.alarm, true);
  api.dispose();
});

await ok('Cold Storage landing: cores, two sleepers per cave at open pods, stack director starts', () => {
  const F = fakeGame('m5cold', 9, 'm5cold');
  const api = installMaps5(F.g);
  F.g.mods.emit('mapLoaded', F.g.world, F.g);
  F.g.mods.emit('moonPopulated', F.g);
  const info = F.D.decor.info;
  assert.equal(F.spawned.filter((s) => s.type === 'm5_cryocore').length, info.prizes.length);
  assert.equal(F.hostSpawns.filter((c) => c.type === 'm5sleeper').length, info.caves.length * 2);
  for (const c of F.hostSpawns) assert.equal(c.opts.state, 'dormant');
  assert.ok(api.state.host && api.state.host.step === 0);
  api.dispose();
});

await ok('stack shifts: nobody near -> frozen; near -> warn at 24 s, go at 30 s, then every 45 s; the client applies absolute steps', () => {
  const F = fakeGame('m5cold', 9, 'm5cold');
  const api = installMaps5(F.g);
  F.g.mods.emit('mapLoaded', F.g.world, F.g);
  F.g.mods.emit('moonPopulated', F.g);
  const st = F.D.decor.info.stacks;
  F.player.pos.set(st.frame.x + 200, 0, st.frame.z);   // far away
  for (let t = 0; t < 100; t++) F.g.mods.emit('update', 1, F.g);
  assert.equal(F.sent.filter((s) => s[0] === 'm5sw').length, 0, 'no shifts while nobody is around');
  F.player.pos.set(st.frame.x + 3, st.y0, st.frame.z + 3);
  const before = st.targetsAt(0).join('');
  for (let t = 0; t < 25; t++) F.g.mods.emit('update', 1, F.g);
  assert.deepEqual(F.sent.filter((s) => s[0] === 'm5sw').map((s) => s[1].k), ['warn'], 'warn 6 s before the first shift');
  assert.ok(st.walls.some((w) => w.warn), 'walls flash amber');
  assert.ok(F.bigTexts.length >= 1, 'HUD banner');
  for (let t = 0; t < 6; t++) F.g.mods.emit('update', 1, F.g);
  const ks = F.sent.filter((s) => s[0] === 'm5sw').map((s) => s[1].k + s[1].n);
  assert.deepEqual(ks, ['warn1', 'go1']);
  assert.equal(st.k, 1);
  for (let t = 0; t < 200; t++) st.step(1 / 30, null);
  assert.notEqual(st.walls.map((w) => w.ext).join(''), before, 'walls moved');
  st.walls.forEach((w, i) => assert.equal(w.ext, st.targetsAt(1)[i]));
  for (let t = 0; t < 46; t++) F.g.mods.emit('update', 1, F.g);
  assert.equal(F.sent.filter((s) => s[0] === 'm5sw' && s[1].k === 'go').length, 2, 'second shift after 45 s');
  // a late joiner is synced to the absolute step, instantly
  F.netReq.get('m5sync')({}, 'peer2');
  const set = F.sent.find((s) => s[0] === 'to:peer2');
  assert.deepEqual(set[2], { k: 'set', n: 2 });
  F.netH.get('m5sw')({ k: 'set', n: 3 });
  st.walls.forEach((w, i) => assert.equal(w.ext, st.targetsAt(3)[i]));
  // garbage is ignored
  F.netH.get('m5sw')({ k: 'boom', n: 'x' }); F.netH.get('m5sw')(null);
  // taking the Cold Core starts an immediate reshuffle warning
  const core = F.spawned.find((s) => s.type === 'm5_cryocore' && F.D.decor.info.prizes.find((p) => p.zone === 'stacks' && Math.abs(p.x - s.pos.x) < 0.1));
  F.items.get(core.id).holder = 'me';
  const sent0 = F.sent.length;
  for (let t = 0; t < 2; t++) F.g.mods.emit('update', 0.6, F.g);
  assert.ok(F.sent.slice(sent0).some((s) => s[0] === 'm5sw' && s[1].k === 'warn'), 'reshuffle warning after the core moved');
  api.dispose();
});

await ok('ladder: facing + forward climbs (vel.y cancels gravity), holds without input, descends with back, releases outside the volume', () => {
  const F = fakeGame('m5estate', 5, 'm5est');
  const api = installMaps5(F.g);
  F.g.mods.emit('mapLoaded', F.g.world, F.g);
  const L = F.D.decor.info.archive.ladder, p = F.player;
  const keys = new Set(), input = { isDown: (k) => keys.has(k) };
  const yawToward = (dx, dz) => Math.atan2(-dx, -dz);   // yaw whose forward (-sin, -cos) points along (dx, dz)
  p.pos.set(L.x - L.face.x * 0.3, L.y0, L.z - L.face.z * 0.3);
  p.yaw = yawToward(L.face.x, L.face.z);
  keys.add('forward');
  p.update(1 / 60, input);
  assert.ok(api.state.climb, 'latched');
  assert.ok(p.calls.at(-1).vy > 3.4, 'climb speed set before the original update runs');
  keys.clear();
  p.update(1 / 60, input);
  assert.ok(Math.abs(p.calls.at(-1).vy - 19.6 / 60) < 1e-6, 'holds position');
  keys.add('back');
  p.update(1 / 60, input);
  assert.ok(p.calls.at(-1).vy < -3.0, 'goes down');
  assert.equal(p.minVelY, 0, 'no fall damage while on the ladder');
  // walking past the ladder without facing it never climbs
  api.state.climb = false;
  p.yaw = yawToward(-L.face.x, -L.face.z);
  keys.clear(); keys.add('forward');
  p.update(1 / 60, input);
  assert.ok(!api.state.climb, 'not facing = no climb');
  // outside the volume releases
  api.state.climb = true;
  p.pos.set(L.x + 5, L.y0, L.z);
  p.update(1 / 60, input);
  assert.ok(!api.state.climb);
  api.dispose();
  assert.ok(!Object.prototype.hasOwnProperty.call(p, 'update') || p.update !== undefined);
});

await ok('zones: fog thickens + hall goes dark inside, back to normal outside; ENTERING toast once', () => {
  const F = fakeGame('m5cold', 9, 'm5cold');
  const api = installMaps5(F.g);
  F.g.mods.emit('mapLoaded', F.g.world, F.g);
  const st = F.D.decor.info.stacks, sc = F.g.engine.scene;
  F.player.pos.set(st.core.x + 1, st.y0 + 0.9, st.core.z);
  let dens = 0, hemi = 0;
  for (let i = 0; i < 40; i++) { sc.fog.density = 0.02; F.g.lights.hemi.intensity = 1; F.g.mods.emit('update', 0.05, F.g); dens = sc.fog.density; hemi = F.g.lights.hemi.intensity; }
  assert.ok(dens > 0.02 * 3, 'fog x3.4: ' + dens);
  assert.ok(hemi < 0.4, 'darker inside: ' + hemi);
  assert.equal(F.toasts.filter((m) => m.includes('SERVER STACKS')).length, 1, 'one toast');
  assert.ok(F.amb.some((a) => a[0] === 'm5amb' && a[1] === 'ambience_serverfarm'), 'ambience layer');
  F.player.pos.set(st.frame.x + 150, 0, st.frame.z);
  for (let i = 0; i < 80; i++) { sc.fog.density = 0.02; F.g.lights.hemi.intensity = 1; F.g.mods.emit('update', 0.05, F.g); }
  assert.ok(Math.abs(sc.fog.density - 0.02) < 1e-9 && Math.abs(F.g.lights.hemi.intensity - 1) < 1e-9, 'restored outside');
  api.dispose();
});

// ------------------------------------------------------------------------------------------------ creature AI
function mover(F) {
  const M = {
    game: F.g,
    playersFor: () => F.g.aiPlayers(), hear: () => null, canSee: () => true, playerSpeed: () => 0, speedMul: (c, s) => s,
    attack: (c, p, dmg, cause) => { M.hits.push([p.id, dmg, cause]); }, hits: [],
    goTo(c, x, z) { c.path = [{ x, z }]; c.pathIdx = 0; c.dest = { x, z }; },
    follow(c, dt, speed) {
      if (!c.path || c.pathIdx >= c.path.length) return true;
      const wp = c.path[c.pathIdx], dx = wp.x - c.pos.x, dz = wp.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35) { c.pathIdx++; return c.pathIdx >= c.path.length; }
      const s = Math.min(d, speed * dt);
      c.pos.x += (dx / d) * s; c.pos.z += (dz / d) * s; c.yaw = Math.atan2(dx, dz);
      return false;
    },
    moveToward(c, target, dt, speed) { M.goTo(c, target.x, target.z); return M.follow(c, dt, speed); },
  };
  return M;
}
const mkCreature = (type, pos, data = {}) => ({ type, def: CREATURES[type], pos: pos.clone(), yaw: 0, data, state: 'idle', t: 0, cooldown: 0, dmg: CREATURES[type].dmg, hp: 200, maxHp: 200, path: null, pathIdx: 0, target: null, stunT: 0,
  setState(s) { if (this.state !== s) { this.state = s; this.t = 0; } } });
function stepC(c, M, dt, n) { for (let i = 0; i < n; i++) { c.t += dt; c.cooldown = Math.max(0, c.cooldown - dt); c.def.behavior(c, dt, M); } }

await ok('Hedge Warden: statue -> wake (1.4 s) -> hunts along the maze corridors only -> winds up before cutting -> returns to its spot and freezes', () => {
  const F = fakeGame('m5estate', 5, 'm5est');
  installMaps5(F.g);
  const H = F.D.decor.info.hedge, P = 3.4;
  const M = mover(F);
  const home = H.wardenSpot;
  const w = mkCreature('m5warden', new THREE.Vector3(home.x, home.y, home.z), { home: { x: home.x, z: home.z }, homeYaw: 0 });
  F.player.pos.set(home.x + 12, home.y, home.z + 12);   // far: it stays a statue
  stepC(w, M, 0.1, 20);
  assert.equal(w.state, 'statue');
  // a player inside the maze walks up to the statue: 0.6 s inside 3.4 m wakes it
  const cell = (i) => { const c = { x: ((i % H.plan.cols) + 0.5) * P - (H.plan.cols * P) / 2, z: (((i / H.plan.cols) | 0) + 0.5) * P - (H.plan.rows * P) / 2 }; const cs = Math.cos(H.frame.rot), sn = Math.sin(H.frame.rot); return { x: H.frame.x + c.x * cs + c.z * sn, z: H.frame.z - c.x * sn + c.z * cs }; };
  const entrance = cell(H.plan.entrance.cell);
  F.player.pos.set(home.x + 1.5, home.y, home.z + 1.5);
  stepC(w, M, 0.1, 5);
  assert.equal(w.state, 'statue', 'not yet (0.5 s)');
  stepC(w, M, 0.1, 3);
  assert.equal(w.state, 'wake');
  { let el = 0; while (w.state === 'wake' && el < 3) { stepC(w, M, 0.05, 1); el += 0.05; } assert.ok(w.t <= 0.06 || el > 1.2, 'telegraph lasted ' + el); assert.ok(el >= 1.25 && el <= 1.5, 'wake telegraph is about 1.4 s: ' + el); }
  // send the player to the entrance cell, far along the corridors: the warden's path follows the BFS route (never a straight line through hedges)
  F.player.pos.set(entrance.x, home.y, entrance.z);
  const rect = { minD: 1e9 };
  const boxes = F.D.decor.info.hedge ? null : null; void boxes; void rect;
  let maxStep = 0, last = w.pos.clone();
  const cols = H.plan.cols;
  for (let i = 0; i < 1500 && w.state !== 'windup' && w.state !== 'attack'; i++) {
    stepC(w, M, 0.05, 1);
    maxStep = Math.max(maxStep, w.pos.distanceTo(last)); last = w.pos.clone();
    // the warden always stands inside a maze cell and its cell moves only to an OPEN neighbour
  }
  assert.ok(['windup', 'attack'].includes(w.state), 'reached the player: ' + w.state);
  assert.ok(maxStep <= 5.2 * 0.05 + 1e-6, 'speed cap 5.2 m/s (sprint 8.2 outruns it)');
  assert.ok(Math.hypot(w.pos.x - entrance.x, w.pos.z - entrance.z) < 2.3, 'stopped within reach');
  void cols;
  stepC(w, M, 0.05, 20);   // 0.7 s wind-up, then the cut
  assert.equal(M.hits.length, 1);
  assert.deepEqual([M.hits[0][1], M.hits[0][2]], [32, 'm5warden']);
  // the player leaves the maze: after 22 s the warden walks home and freezes again
  F.player.pos.set(home.x + 90, home.y, home.z + 90);
  stepC(w, M, 0.1, 230);
  stepC(w, M, 0.1, 400);
  assert.equal(w.state, 'statue', 'home again');
  assert.ok(Math.hypot(w.pos.x - home.x, w.pos.z - home.z) < 0.9);
});

await ok('Hedge Warden route stays inside the corridors (every waypoint is a cell centre, consecutive cells are linked)', () => {
  const F = fakeGame('m5estate', 77, 'm5est');
  installMaps5(F.g);
  const H = F.D.decor.info.hedge, pl = H.plan;
  for (const p of pl.pockets) {
    const cc = (i) => { const P = H.pitch, c = { x: ((i % pl.cols) + 0.5) * P - (pl.cols * P) / 2, z: (((i / pl.cols) | 0) + 0.5) * P - (pl.rows * P) / 2 }; const cs = Math.cos(H.frame.rot), sn = Math.sin(H.frame.rot); return [H.frame.x + c.x * cs + c.z * sn, H.frame.z - c.x * sn + c.z * cs]; };
    const route = H.route(cc(pl.entrance.cell), cc(p));
    assert.ok(route && route.length >= 2);
    let steps = 0;
    for (let k = 1; k < route.length; k++) { const d = Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]); assert.ok(Math.abs(d - H.pitch) < 1e-6, 'one cell per waypoint'); steps++; }
    assert.ok(steps === route.length - 1);
  }
});

await ok('Cryo Sleeper: dormant -> thaw (1.3 s) -> slow hunt -> wind-up -> chill hit -> gives up and freezes at its pod', () => {
  const F = fakeGame('m5cold', 9, 'm5cold');
  installMaps5(F.g);
  const M = mover(F);
  const pod = { x: 10, z: 10 };
  const c = mkCreature('m5sleeper', new THREE.Vector3(pod.x, 0, pod.z), { pod });
  F.player.pos.set(pod.x + 15, 0, pod.z);
  stepC(c, M, 0.1, 30);
  assert.equal(c.state, 'dormant');
  F.player.pos.set(pod.x + 3.5, 0, pod.z);
  stepC(c, M, 0.1, 2);
  assert.equal(c.state, 'thaw');
  { let el = 0; while (c.state === 'thaw' && el < 3) { stepC(c, M, 0.05, 1); el += 0.05; } assert.ok(el >= 1.15 && el <= 1.4, 'thaw telegraph is about 1.3 s: ' + el); }
  assert.equal(c.state, 'run');
  F.player.pos.set(pod.x + 12, 0, pod.z);
  let maxStep = 0, last = c.pos.clone();
  for (let i = 0; i < 400 && c.state !== 'windup'; i++) { stepC(c, M, 0.05, 1); maxStep = Math.max(maxStep, c.pos.distanceTo(last)); last = c.pos.clone(); }
  assert.equal(c.state, 'windup');
  assert.ok(maxStep <= 4.4 * 0.05 + 1e-6, 'slow: max 4.4 m/s');
  stepC(c, M, 0.05, 14);
  assert.deepEqual([M.hits[0]?.[1], M.hits[0]?.[2]], [26, 'm5sleeper']);
  assert.deepEqual(F.slows[0], ['me', 1.2], 'chill = 1.2 s slow');
  // out of leash: gives up, walks home, freezes, then is dormant again
  F.player.pos.set(pod.x + 60, 0, pod.z);
  stepC(c, M, 0.1, 400);
  assert.ok(['dormant', 'freeze'].includes(c.state), c.state);
});

await ok('i18n: every player-facing maps5 string has TR + RU (moons, biomes, creatures, items, scanner tips, HUD)', async () => {
  const { TR, RU } = await import('../../src/game/maps5_text.js');
  const { IDENT } = await import('../../src/game/identify.js');
  const need = new Set();
  for (const id of ['m5est', 'm5cold']) { const m = MOONS[id]; need.add(m.name); need.add(m.short); need.add(m.desc); need.add(BIOMES[m.biome].name); }
  for (const id of ['m5warden', 'm5sleeper']) { const c = CREATURES[id]; need.add(c.name); need.add(c.lore); need.add(c.deathText); need.add(IDENT[id][2]); }
  for (const id of ['m5_heart', 'm5_ledger', 'm5_cryocore', 'm5_shears', 'm5_frostfilm']) { need.add(ITEMS[id].name); need.add(ITEMS[id].tip); }
  for (const s of ['AISLES SHIFTING', 'Server racks are repositioning. Watch the amber strips.', 'ENTERING: HEDGE MAZE', 'ENTERING: PAPER ARCHIVE', 'ENTERING: SERVER STACKS', 'ENTERING: CRYO CAVE', 'Climb the ladder [E]', 'Face the ladder: hold [W] to climb, [S] to go down',
    'The hedge maze hides a prize in its centre. Something guards it.', 'Paper Archive: take the ladder up, cross the bridge, find the Master Ledger.', 'Server Stacks: the aisles shift every 45 s. Watch the amber strips.', 'Cryo cave: a Cryo Core waits in the chamber. The sleepers will wake.']) need.add(s);
  const miss = [];
  for (const s of need) { if (!TR[s]) miss.push('TR: ' + s.slice(0, 60)); if (!RU[s]) miss.push('RU: ' + s.slice(0, 60)); }
  assert.deepEqual(miss, []);
});

console.log(`\nmaps5 install tests: ${n} passed`);
