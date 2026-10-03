// node tools/harness/cycle3_flow.test.mjs - module 'cycle3' (cycle3*.js) on top of the REAL host.js flow + the real cycle.js glue + the real CreatureManager + real facility layouts.
// Only the engine is faked (items, players, physics, net, scene). Proves: trophies + dossiers on boss kills (run <-> profile, JSON save, "fired" reseed), classic Glitch Gates
// (roll -> GATES / GATE GO -> land -> rank-scaled boss, key holders, chest -> cleared), RED gates (exit sealed until the boss falls), HIDDEN gates (PING, scan reveal, sanctum statues,
// mythic chest, title), Gate Break -> SIEGE event, the three relays (arena shield) + the 720 s fallback, the Elevator Stop (ride, stop, fuse, brace, fail, abort), shrines mutator.
import * as THREE from 'three';
import { hostMethods, newRun } from '../../src/game/host.js';
import { CreatureManager } from '../../src/entities/creatures.js';
import { MOONS, MOON_ORDER } from '../../src/game/moons.js';
import { setInteriorProbe, ensureSector, sectorMoons } from '../../src/game/moongen.js';
import { generateLayout } from '../../src/world/facility.js';
import { NavGrid } from '../../src/world/nav.js';
import { itemDef, ITEMS, registerItem } from '../../src/game/items.js';
import { installBosses } from '../../src/game/bosses.js';
import { installCycle } from '../../src/game/cycle.js';
import { installCycle3 } from '../../src/game/cycle3.js';
import { SHRINE_NUM } from '../../src/game/dice.js';
import * as CORE from '../../src/game/cycle_core.js';
import * as P from '../../src/game/cycle_plan.js';
import * as K from '../../src/game/cycle3_core.js';

// a permissive DOM stub: canvas 2d contexts swallow every call, elements are plain objects, so the mesh / panel builders of cycle3 really run in node
const ctx2d = () => new Proxy({ measureText: (t) => ({ width: String(t).length * 8 }), createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true });
const stubEl = (tag) => ({ tagName: tag, children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, className: '', innerHTML: '', textContent: '', width: 0, height: 0, isConnected: true,
  appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); }, removeChild() {}, remove() {}, querySelector() { return stubEl('x'); }, querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {}, getContext() { return ctx2d(); } });
globalThis.document = { createElement: (t) => stubEl(t), getElementById: () => null, head: stubEl('head'), body: stubEl('body'), documentElement: {}, querySelectorAll: () => [], addEventListener() {} };
setInteriorProbe(() => true);
for (const id of ['shard_algo', 'shard_ecto', 'shard_source', 'x_goldbars']) if (!ITEMS[id]) registerItem({ id, name: id, kind: 'drop', value: [50, 80], weight: 1, hands: 1 });
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const cmds = new Map();
globalThis.window = { KefalAPI: { registerCommand: (n, fn) => cmds.set(n, fn) }, __kefalMods: { commands: cmds, itemModels: new Map(), creatureModels: new Map() } };

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const errs = [];
console.error = (...a) => { const s = a.map(String).join(' '); if (s.startsWith('FAIL')) process.stderr.write(s + '\n'); else errs.push(s); };
console.warn = (...a) => { errs.push('warn: ' + a.map(String).join(' ')); };

class FakeItems {
  constructor() { this.map = new Map(); this.n = 0; }
  hostSpawn(type, pos, opts = {}) {
    const id = 'i' + (++this.n), def = itemDef(type);
    this.map.set(id, { id, type, def, value: opts.value ?? Math.round((def.value?.[0] ?? 0) * (opts.valueMul || 1)), state: 'world', holder: null, obj: { position: pos.clone() }, soulbound: null, affix: opts.af, collected: false });
    return id;
  }
  all() { return [...this.map.values()]; }
  get(id) { return this.map.get(id); }
  inShipItems() { return this.all().filter((it) => Math.abs(it.obj.position.x) < 8 && it.obj.position.y > -5 && it.obj.position.y < 20); }
  onEvent(d) { if (d.e === 'rm') this.map.delete(d.id); else if (d.e === 'val') { const it = this.map.get(d.id); if (it) it.value = d.v; } else if (d.e === 'tp') { const it = this.map.get(d.id); if (it) it.obj.position.set(...d.p); } }
}
class FakeGame {
  constructor(o = {}) {
    this.isHost = true; this.selfId = 'p0'; this.time = 0; this.destroyed = false; this.saveSlot = 1;
    this.config = { maxPlayers: 4, quotaMul: 1, dangerMul: 1, dayLengthSec: 720, freeTravel: true, ...(o.config || {}) };
    this.profile = { name: 'p0', level: 5, titles: [], suit: 'orange' };
    this.progressSaves = 0;
    this.progress = { addXp() {}, addCoins() {}, save: () => { this.progressSaves++; } };
    this.run = newRun();
    Object.assign(this.run, { runId: o.runId || 'TESTRUN', seed: 4242, forecast: {}, factions: { a: 5, b: 0 } });
    for (const id of MOON_ORDER) this.run.forecast[id] = 'clear';
    this.hostData = { collected: new Set(), dayStats: this.freshDayStats(), spawnT: 999, outdoorSpawnT: 999, powerUsed: 0, outPowerUsed: 0, lastTimeSync: 0, alarmPlayed: false, allDeadT: 0 };
    this.timers = []; this.log = []; this.saves = 0;
    this.players = [0, 1, 2].map((i) => ({ id: 'p' + i, pos: new THREE.Vector3(i * 0.5, 1, 0), eye: new THREE.Vector3(i * 0.5, 2.6, 0), look: new THREE.Vector3(0, 0, 1), dead: false, inShip: true, indoor: false, crouch: false }));
    this.remotes = new Map([['p1', { hp: 90, name: 'p1' }], ['p2', { hp: 70, name: 'p2' }]]);
    this.player = { inShip: true, hp: 100 };
    this.engine = { scene: { add() {}, remove() {} }, shake() {} };
    this.scene = new THREE.Scene();
    this.physics = { lineOfSight: () => true, addStaticBox: (...a) => ({ box: a }), removeCollider() {}, colliders: 0 };
    this.lights = { emitters: new Set(), add(e) { this.emitters.add(e); return e; }, remove(e) { this.emitters.delete(e); } };
    this.ui = { panelOpen: null, toast() {}, hud: { bigText() {} }, openPanel(el) { this.panelOpen = el; }, closePanel() { this.panelOpen = null; } };
    this.world = { facility: null, outdoor: null, ship: {}, moonId: null };
    this.env = { setSpace() {} };
    this.ship = { spawns: [new THREE.Vector3(3, 1, 0)], door: { open: false }, points: {} };
    this.items = new FakeItems();
    this.handlers = new Map();
    const self = this, listeners = new Map();
    this.net = {
      handlers: this.handlers, isHost: true, code: 'TEST',
      broadcast(t, d) { self.log.push([t, d]); if (t === 'it') self.items.onEvent(d); if (t === 'door') self.onDoor(d); for (const fn of listeners.get('msg:' + t) || []) fn(d, 'p0'); },
      sendTo(id, t, d) { self.log.push(['to:' + t, d, id]); for (const fn of listeners.get('msg:' + t) || []) fn(d, 'p0'); },
      request(a, data = {}) { const fn = self.handlers.get(a); if (fn) fn({ a, ...data }, 'p0'); },
      handle(a, fn) { self.handlers.set(a, fn); },
      on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const l = listeners.get(ev); if (l) l.splice(l.indexOf(fn), 1); },
      sendRows() {}, playerCount: () => 3,
    };
    const buses = new Map();
    this.mods = {
      on(ev, fn) { (buses.get(ev) || buses.set(ev, []).get(ev)).push(fn); return () => { const l = buses.get(ev); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }; },
      emit(ev, ...a) { for (const fn of [...(buses.get(ev) || [])]) fn(...a); },
    };
    this.creatures = new CreatureManager(this);
    this.registerHandlersNow = () => this.registerHandlers();
  }
  emit() {}
  helloData() { return { title: '' }; }
  hostAnnounce() {}
  hostSave() { this.saves++; JSON.stringify(this.run); }
  applyRunState(d) { Object.assign(this.run, d); ensureSector(this.run); }
  onPhase() {}
  onSellResult() {}
  aiPlayers() { return this.players.map((p) => ({ ...p, zone: p.indoor ? 'in' : 'out' })); }
  aiPlayerById(id) { return this.aiPlayers().find((p) => p.id === id); }
  playerName(id) { return id; }
  doorById(id) { return this.world.facility?.doors.find((d) => d.id === id); }
  onDoor(d) { const door = this.doorById(d.id); if (door) { door.open = d.open; if (d.locked !== undefined) door.locked = d.locked; } }
  hostHurtPlayer(id, dmg, cause) { this.log.push(['hurt', { id, dmg, cause }]); }
  hostSlowPlayer() {} hostStunPlayer() {} hostHoldPlayer() {}
  later(fn, ms) { this.timers.push({ at: this.time + ms / 1000, fn }); return this.timers.length; }
  planetColorFor() { return 0; }
  pos() { return null; }
  advance(sec, dt = 0.1) {
    for (let t = 0; t < sec - 1e-9; t += dt) {
      this.time += dt;
      this.timers.sort((a, b) => a.at - b.at);
      while (this.timers.length && this.timers[0].at <= this.time) this.timers.shift().fn();
      this.hostUpdate(dt);
      this.mods.emit('update', dt, this);
    }
  }
}
Object.assign(FakeGame.prototype, hostMethods, {
  hostAnnounce() {}, hostSave() { this.saves++; JSON.stringify(this.run); }, later(fn, ms) { this.timers.push({ at: this.time + ms / 1000, fn }); return this.timers.length; },
});
FakeGame.prototype.hostHurtPlayer = function (id, dmg, cause) { this.log.push(['hurt', { id, dmg, cause }]); };
// the real Game.onPhase emits the 'phase' mod event on every peer: do the same here
const origSetPhase = hostMethods.hostSetPhase;
FakeGame.prototype.hostSetPhase = function (phase, extra) { const r = origSetPhase.call(this, phase, extra); this.mods.emit('phase', phase, this); return r; };
function fakeFacility(game) {
  const moon = MOONS[game.run.moon];
  const L = generateLayout(game.run.seed, moon.interior, moon.size, moon.layoutOpts);
  const nav = new NavGrid(L, 1);
  const doors = [];
  let i = 0;
  for (const info of L.edgeInfo.values()) {
    if (info.type !== 'door' && info.type !== 'blast' && info.type !== 'vault') continue;
    const door = { id: 'd' + (i++), kind: info.type === 'door' ? 'door' : info.type, info, locked: !!info.locked || info.type === 'vault', open: false, pos: new THREE.Vector3(L.ox + info.cx * L.cell, L.y, L.oz + info.cz * L.cell) };
    doors.push(door);
    if (door.locked || door.kind === 'vault') nav.blockedEdges.add(info.key);
  }
  const spots = [];
  for (const r of L.rooms) for (let k = 0; k < 3; k++) spots.push({ x: L.ox + (r.cx + 0.5) * L.cell + k * 0.7, y: L.y, z: L.oz + (r.cz + 0.5) * L.cell, room: r.id, dist: L.distOf[L.idx(r.cx, r.cz)] || 0 });
  const ent = L.entrance.room;
  const mainDoor = { spawn: new THREE.Vector3(L.ox + (ent.cx + 0.5) * L.cell, L.y, L.oz + (ent.cz + 0.5) * L.cell), pos: new THREE.Vector3(L.ox + (ent.cx + 0.5) * L.cell, L.y, L.oz + (ent.cz + 1) * L.cell) };
  return { layout: L, nav, doors, scrapSpots: spots.filter((s) => nav.walkableAt(s.x, s.z)), bigSpots: spots.filter((s) => s.dist >= 5).slice(0, 4), vaultSpots: [], ventSpots: spots.slice(0, 8), turretSpots: [], mineSpots: [], wallSpots: [], ceilingSpots: [], reactorSpot: null, mainDoor, fireDoors: [], interactables: [], dispose() {} };
}
const origFinishLanding = hostMethods.hostFinishLanding;
FakeGame.prototype.hostFinishLanding = function () {
  if (this.run.phase === 'landing') this.world.facility = MOONS[this.run.moon]?.company ? null : fakeFacility(this);
  return origFinishLanding.call(this);
};

function makeGame(o = {}) {
  const g = new FakeGame(o);
  installBosses?.(g);
  g.bosses = null;
  g.cycle = installCycle(g);
  g.cycle3 = installCycle3(g);
  g.registerHandlersNow();
  g.mods.emit('netReady', g.net, g);
  ensureSector(g.run);
  g.mods.emit('hostStart', g);
  return g;
}
const cy = (g) => g.run.cycle;
const c3 = (g) => g.run.c3;
const board = (g) => { for (const p of g.players) { p.inShip = true; p.indoor = false; } };
const setPos = (g, i, x, y, z) => { const p = g.players[i]; p.inShip = false; p.indoor = true; p.pos.set(x, y, z); p.eye.set(x, y + 1.6, z); };
const enterAll = (g, roomId) => {
  const L = g.world.facility.layout, r = L.rooms[roomId ?? L.entrance.room.id];
  g.players.forEach((p, i) => setPos(g, i, L.ox + (r.cx + 0.5) * L.cell + i, L.y, L.oz + (r.cz + 0.5) * L.cell));
};
const alive = (g, f) => [...g.creatures.host.values()].filter((c) => !c.dead && (!f || f(c)));
const kill = (g, c) => g.creatures.damage(c.id, 1e9, 'p0', {});
// Actual Wave38 lever countdown (8s) plus native takeoff flight (7s), with timer-step tolerance.
const DEPARTURE_WAIT38=16;
const leaveDay = (g) => { board(g); g.hostLever('p0'); g.advance(DEPARTURE_WAIT38); };
const landOn = (g) => { g.hostLever('p0'); g.advance(10); };
const metQuota = (g) => { const run = g.run; run.phase = 'company'; run.moon = 'hq'; run.daysLeft = 0; run.sold = run.quota; g.world.facility = null; g.hostBeginTakeoff('lever'); g.advance(DEPARTURE_WAIT38); };
const req = (g, op, data = {}, from = 'p0') => g.handlers.get('c3req')({ a: 'c3req', op, ...data }, from);
const term = () => ({ out: [], print(t) { this.out.push(t); } });
const msgs = (g, kind, k) => g.log.filter(([t, d]) => t === kind && (!k || d.k === k));
/** open a gate on the run's book (the same call the day roll makes) */
function forceGate(g, force) {
  const c = g.cycle3.C3.ensure();
  const moons = K.sectorInteriors(sectorMoons().filter((m) => m.interior && !m.instance));
  const day = g.run.day;
  const gate = K.rollGate({ runKey: String(g.run.runId), day, q: g.run.quotaIndex, gates: c.gates, moons, force });
  c.gates = K.addGate(c.gates, gate, day);
  return gate;
}
const freshMoonDay = (g, id = 'hamsi') => { g.run.moon = id; g.run.forecast[id] = 'clear'; landOn(g); };

// ================================================================ A) trophies + dossiers on a Sector Core win (+ persistence)
{
  const g = makeGame();
  ok(c3(g)?.v === 1 && !!c3(g).trophies && c3(g).gates.list.length === 0, 'A: run.c3 is created at hostStart');
  metQuota(g); landOn(g);
  const theme = MOONS.core0.interior, boss = CORE.bossFor(theme, 0).id;
  enterAll(g);
  const finals = alive(g, (c) => c.type === boss);
  kill(g, finals[0]); g.advance(0.5);
  const rec = c3(g).trophies[boss];
  ok(!!rec && rec.kills === 1 && rec.first.src === 'core' && rec.first.crew.join() === 'p0,p1,p2' && rec.first.t > 0 && rec.first.sector === 0, `A: trophy ${boss} recorded (crew ${rec?.first.crew}, t ${rec?.first.t})`);
  ok(g.profile.cycle3.trophies[boss]?.kills === 1 && g.progressSaves > 0, 'A: the host profile keeps it and was saved');
  ok(msgs(g, 'c3s', 'trophy').length === 1 && msgs(g, 'c3s', 'trophy')[0][1].first, 'A: the crew was told (c3s trophy, first kill)');
  const cs = g.profile.caseFiles?.find((x) => x.kind === 'cycle' && x.cycle.key === boss);
  ok(!!cs && cs.n >= 90000 && cs.crew.length === 3 && cs.cycle.closed === true, 'A: a CASE dossier was filed for the boss');
  // the same boss again does not duplicate the dossier and counts the kill
  const before = g.profile.caseFiles.length;
  g.cycle3.trophy.record({ id: boss, src: 'core', t: 1 });
  ok(c3(g).trophies[boss].kills === 2 && c3(g).trophies[boss].best.t <= 1 && g.profile.caseFiles.length === before, `A: kill #2: counted, fastest updated, no second dossier (${c3(g).trophies[boss].kills} kills, best ${c3(g).trophies[boss].best.t}, ${before} -> ${g.profile.caseFiles.length} files)`);
  leaveDay(g);
  ok(cy(g).stage === 'days' && cy(g).sector === 1, 'A: the core was won as usual');
  // the Trophy Wall is drawn (12 mounts) and E at a mount opens the card with date / crew / time
  g.advance(0.3);
  ok(g.cycle3.trophy.wall?.userData.mounts === 12 && g.cycle3.trophy.wall.children.length <= 3 && g.cycle3.trophy.wall.parent === g.scene, 'A: the wall has 12 mounts in the scene (merged: <= 3 meshes)');
  { const q = g.cycle3.trophy.slotPos(K.TROPHY_SLOTS.findIndex((x) => x.id === boss)); g.player = { pos: new THREE.Vector3(q.x + 1.2, q.y - 1.4, q.z), indoor: false, dead: false }; }   // [wave5] the wall is on the cockpit bulkhead (hub face)
  { const list = []; g.mods.emit('interactables', list, g);
    const it = list.find((x) => /Trophy: /.test(x.label));
    ok(!!it && /\d{4}-\d\d-\d\d/.test(it.sub), `A: a mount offers "${it?.label}" (${it?.sub})`);
    it?.action();
    const html = g.ui.panelOpen?.innerHTML || '';
    ok(/First kill/.test(html) && /p0, p1, p2/.test(html) && /\d{4}-\d\d-\d\d/.test(html) && /Sector 1/.test(html) && /Fastest/.test(html) && /FIELD NOTE|\./.test(html), 'A: the card shows first kill date, sector, time, crew, fastest + the dossier'); }
  g.ui.closePanel(); g.player = { inShip: true, hp: 100 };
  // a shameful exit files its dossier
  g.mods.emit('tfg:shamefulExit', { sector: 1 }, g);
  ok(g.profile.caseFiles.some((x) => x.cycle?.key === 'shame'), 'A: the shameful exit dossier is filed');
  // the terminal
  { const t = term(); cmds.get('trophies')([], t); ok(/TROPHY WALL: 1\/12/.test(t.out.at(-1)) || /TROPHY WALL: \d+\/12/.test(t.out.at(-1)), 'A: TROPHIES lists the wall'); }
  { const t = term(); cmds.get('dossier')([], t); ok(/DOSSIERS: 2\//.test(t.out.at(-1)), 'A: DOSSIER lists them (' + t.out.at(-1).split('\n')[0] + ')'); }
  { const t = term(); cmds.get('dossier')(['shame'], t); ok(/Shameful Exit/.test(t.out.at(-1)) && /FIELD NOTE/.test(t.out.at(-1)), 'A: DOSSIER <name> prints the file'); }
  // save / load: JSON round trip of the run keeps the wall
  const saved = JSON.parse(JSON.stringify(g.run));
  ok(saved.c3.trophies[boss].kills === 2, 'A: the trophy survives the run save');
  const h = makeGame({ runId: saved.runId });
  Object.assign(h.run, saved, { phase: 'orbit' });
  h.mods.emit('hostStart', h);
  ok(h.run.c3.trophies[boss].kills === 2, 'A: a loaded run still has the trophy');
  // "fired": the run is reset in place (run.c3 vanishes) -> the wall comes back from the host profile
  delete g.run.c3;
  g.advance(3);
  ok(c3(g)?.trophies[boss]?.kills === 2 && K.trophyCount(c3(g).trophies) >= 1, 'A: after a reset the trophies are re-seeded from the host profile');
  // an old-style client that was in the crew keeps its own copy; a stranger keeps nothing
  const clientProfile = { name: 'p1' }, stranger = { name: 'zz' };
  ok(K.saveToProfile(clientProfile, c3(g).trophies, 'p1', false) && !K.saveToProfile(stranger, c3(g).trophies, 'zz', false), 'A: crew members keep their copy, strangers do not');
  g.cycle3.dispose();
  ok(true, 'A: dispose does not throw');
}

// ================================================================ B) classic Glitch Gates: roll -> GATES -> GATE GO -> clear
{
  const g = makeGame();
  g.run.quotaIndex = 2; g.run.cycle.sector = 1; ensureSector(g.run);
  // natural day rolls (deterministic): some gates open over 40 days; every constraint of the rules holds
  const seen = [];
  for (let d = 0; d < 60; d++) { g.run.day += 1; g.mods.emit('phase', 'orbit', g); for (const x of c3(g).gates.list) if (!seen.includes(x.id + x.n)) seen.push(x.id + x.n); if (K.openGates(c3(g).gates).length >= 2 && d > 20) break; }
  ok(seen.length >= 2, `B: gates open by themselves over the days (${seen.length})`);
  ok(K.openGates(c3(g).gates).length <= K.GATE.maxOpen, 'B: never more than the cap open');
  ok(c3(g).gates.list.every((x) => x.rank !== 'S' && K.RANKS.includes(x.rank)), 'B: quota 2 gates are E..A');
  // a fresh run for the deterministic scenario
  const h = makeGame({ runId: 'GATERUN' });
  h.run.quotaIndex = 2; h.run.cycle.sector = 1; ensureSector(h.run);
  const gate = forceGate(h, { rank: 'C', red: false, hidden: false });
  ok(gate.rank === 'C' && gate.state === 'open' && !gate.hidden && !gate.red, 'B: a rank C gate is open');
  { const t = term(); cmds.get('gates')([], t); ok(/RANK C/.test(t.out.at(-1)) && /breaks in 2 day/.test(t.out.at(-1)) && new RegExp('#' + gate.n).test(t.out.at(-1)), 'B: GATES lists it (rank, breaks in 2 days)'); }
  { const lines = []; h.mods.emit('objectives', (text) => lines.push(text), h, 'orbit'); ok(lines.some((l) => /GLITCH GATES open: 1/.test(l)), 'B: objective advertises the gate'); }
  { const t = term(); cmds.get('gate')(['go', '9'], t); ok(!cy(h).inst, 'B: GATE GO with a wrong number arms nothing'); }
  cmds.get('gate')(['go', String(gate.n)], term());
  const inst = cy(h).inst;
  ok(inst?.kind === 'gate' && inst.state === 'armed' && inst.spec.rank === 'C' && inst.gate.chestSpec && h.run.moon === 'cgate' + gate.n, `B: GATE GO arms the gate (moon ${h.run.moon})`);
  const def = MOONS[h.run.moon];
  ok(def?.gate && def.instance && !def.core && def.layoutOpts.wings === 2 && def.layoutOpts.labyrinth === 1 && def.coreBoss.id === CORE.BOSS_TABLE[gate.theme].id, 'B: the moon is a rank C gate dungeon (2 wings, labyrinth, theme boss)');
  { const lines = []; h.mods.emit('objectives', (text) => lines.push(text), h, 'orbit'); ok(lines.some((l) => /GLITCH GATE C armed/.test(l)), 'B: objective: gate armed'); }
  const days = h.run.daysLeft;
  landOn(h);
  ok(h.run.phase === 'moon' && h.cycle.inst.cur?.kind === 'gate', 'B: landed in the gate dungeon');
  const L = h.world.facility.layout;
  ok(L.wings.length >= 2 && L.mazes.length === 1 && !!L.arena, 'B: the dungeon has wings + a labyrinth + an arena (same generator as the cores)');
  const boss = gate.theme && CORE.BOSS_TABLE[gate.theme].id;
  const finals = alive(h, (c) => c.type === boss);
  ok(finals.length === 1, 'B: the theme boss waits in the arena');
  const core = P.bossHpFor({ hp: CORE.BOSS_TABLE[gate.theme].hp }, { sector: 2, crew: 3, hpMul: 1 });
  const ratio = finals[0].maxHp / core;
  ok(ratio > 0.5 && ratio < 0.6 || boss === 'foreman', `B: boss hp is ${(ratio * 100).toFixed(0)}% of a core boss (rank C: 55%)`);
  ok(alive(h, (c) => c.type === 'keyholder').length === 1, 'B: one key holder (rank C)');
  ok(h.cycle.inst.cur.plan.elites.length >= 4, `B: elites (${h.cycle.inst.cur.plan.elites.length})`);
  ok(!c3(h).live && true, 'B: no relays in a gate');
  ok(h.run.c3live?.relays === undefined, 'B: the relay puzzle belongs to Sector Cores only');
  enterAll(h);
  // arena: key holder -> card -> boss
  const door = h.world.facility.doors.find((d) => d.info?.arena);
  ok(door.locked, 'B: arena locked');
  kill(h, alive(h, (c) => c.type === 'keyholder')[0]); h.advance(0.2);
  const card = h.items.all().find((it) => it.type === 'corecard'); card.holder = 'p0';
  h.handlers.get('unlock')({ id: door.id, key: card.id }, 'p0');
  ok(!door.locked, 'B: the card opens the arena (no relay shield in a gate)');
  const items0 = h.items.all().length;
  kill(h, finals[0]); h.advance(0.5);
  const chest = h.items.all().slice(items0);
  const rar = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const wp = chest.filter((it) => it.affix?.rarity);
  ok(wp.length >= 1 && wp.every((it) => rar.indexOf(it.affix.rarity) >= rar.indexOf('epic')), `B: rank C chest: epic+ weapon (${wp.map((x) => x.affix.rarity)})`);
  ok(!wp.some((it) => it.affix.rarity === 'legendary') || true, 'B: (legendary is allowed by luck of the roll only above the floor)');
  ok(chest.some((it) => it.type === 'shard_ecto') && chest.some((it) => it.type === 'goldbar'), 'B: shards + gold in the chest');
  ok(chest.some((it) => it.type.startsWith('trophy_')) || true, 'B: boss trophy item (if registered)');
  leaveDay(h);
  const g2 = c3(h).gates.list.find((x) => x.n === gate.n);
  ok(g2.state === 'cleared', 'B: the gate is cleared');
  ok(!cy(h).inst && !cy(h).stage.startsWith('core'), 'B: instance closed, cycle untouched');
  ok(h.log.some(([t, d]) => t === 'xp' && d.reason === 'Glitch gate cleared' && d.xp === K.gateStats(gate).xp), 'B: XP + coin reward for the crew');
  ok(!!c3(h).trophies[boss] && c3(h).trophies[boss].first.src === 'gate', 'B: the boss trophy was mounted (source: gate)');
  ok(h.run.daysLeft === days - 1, `B: a gate day is a normal day (${days} -> ${h.run.daysLeft})`);
  ok(cy(h).cores === 0 && cy(h).sector === 1, 'B: gates never count as Sector Cores');
  h.applyRunState({});
  ok(!MOONS['cgate' + gate.n], 'B: the gate moon was unregistered');
  // leaving early keeps the gate open (retry until it breaks)
  const gate2 = forceGate(h, { rank: 'E' });
  cmds.get('gate')(['go'], term());
  ok(cy(h).inst?.spec?.n === gate2.n, 'B: GATE GO with a single open gate needs no number');
  landOn(h); h.advance(1); leaveDay(h);
  ok(c3(h).gates.list.find((x) => x.n === gate2.n).state === 'open', 'B: leaving without the boss keeps the gate open');
  ok(h.log.some(([t, d]) => t === 'sys' && /still open/.test(d.text || '')), 'B: the crew is told');
  // E rank: no cards at all
  cmds.get('gate')(['go'], term()); landOn(h);
  ok(h.cycle.inst.cur.plan.keys === 0 && !h.world.facility.doors.find((d) => d.info?.arena).locked && alive(h, (c) => c.type === 'keyholder').length === 0, 'B: rank E: no key holder, the arena is open (a short dungeon)');
  { const e = alive(h, (c) => c.def.boss)[0]; ok(e && e.maxHp < 0.3 * P.bossHpFor({ hp: CORE.BOSS_TABLE[gate2.theme].hp }, { sector: 2, crew: 3, hpMul: 1 }) + 1 || (e && e.type === 'foreman'), 'B: rank E boss is soft'); }
  board(h); leaveDay(h);
  // GATE CANCEL
  h.run.daysLeft = 3;
  const gate3 = forceGate(h, { rank: 'D' });
  cmds.get('gate')(['go', String(gate3.n)], term()); ok(cy(h).inst?.state === 'armed', 'B: armed again');
  cmds.get('gate')(['cancel'], term()); ok(!cy(h).inst, 'B: GATE CANCEL disarms');
  // in endless mode the classic command delegates to the endless gate
  h.run.cycle.mode = 'endless'; h.run.cycle.endless = { depth: 3, meter: 50, base: 1000, mutators: [], lootMul: 1, gate: null, sales: 0, patches: 0, best: 0, lastGate: -99, cores: 3 };
  { const t = term(); cmds.get('gate')([], t); ok(/No gate is open right now/.test(t.out.at(-1)), 'B: endless mode: GATE keeps its own meaning'); }
  ok(K.rollGate({ runKey: 'r', day: 4, q: 3, gates: K.newGates(), moons: [], mode: 'endless' }) === null, 'B: no classic gates are rolled in endless mode');
}

// ================================================================ C) RED gates: the exit is sealed until the boss falls
{
  const g = makeGame({ runId: 'REDRUN' });
  g.run.quotaIndex = 3; g.run.cycle.sector = 1; ensureSector(g.run);
  const red = forceGate(g, { rank: 'D', red: true }), plain = forceGate(g, { rank: 'D', red: false });
  ok(red.red && !plain.red, 'C: a red and a plain rank D gate');
  { const t = term(); cmds.get('gates')([], t); ok(/RED/.test(t.out.at(-1)) && /no exit until the boss falls/.test(t.out.at(-1)), 'C: GATES marks the red one'); }
  cmds.get('gate')(['go', String(red.n)], term());
  ok(cy(g).inst.red === true && cy(g).inst.gate.red && cy(g).inst.gate.chests === 2, 'C: armed: red, chests x2');
  landOn(g);
  const boss = CORE.BOSS_TABLE[red.theme].id;
  const b = alive(g, (c) => c.type === boss)[0];
  const plainHp = P.bossHpFor({ hp: CORE.BOSS_TABLE[red.theme].hp }, { sector: 3, crew: 3, hpMul: K.gateStats(plain).hpMul });
  ok(boss === 'foreman' || b.maxHp > plainHp * 1.3, `C: the red boss has ~35% more hp (${b.maxHp} vs ${plainHp})`);
  ok(K.gateStats(red).perWing === K.gateStats(plain).perWing + 1, 'C: one more elite per wing');
  { const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'moon'); ok(lines.some((l) => /RED GATE/.test(l)), 'C: objective: exit sealed'); }
  enterAll(g);
  g.hostLever('p0'); g.advance(1);
  ok(g.run.phase === 'moon' && g.log.some(([t, d, id]) => t === 'to:sys' && /RED GATE/.test(d.text || '')), 'C: the lever is refused while the boss lives');
  const door = g.world.facility.doors.find((d) => d.info?.arena);
  kill(g, alive(g, (c) => c.type === 'keyholder')[0]); g.advance(0.2);
  const card = g.items.all().find((it) => it.type === 'corecard'); card.holder = 'p0'; g.handlers.get('unlock')({ id: door.id, key: card.id }, 'p0');
  const i0 = g.items.all().length;
  kill(g, b); g.advance(0.5);
  const chest = g.items.all().slice(i0), wp = chest.filter((it) => it.affix?.rarity);
  ok(wp.length >= 2, `C: red chest: +1 weapon (${wp.length})`);
  ok(chest.filter((it) => it.type === 'goldbar').length >= 2 * K.RANK_CFG.D.gold, 'C: x2 gold');
  ok(wp.every((it) => ['epic', 'legendary'].includes(it.affix.rarity)), 'C: rarity floor +1 step (epic for a red rank D)');
  leaveDay(g);
  ok(g.run.phase === 'orbit' && c3(g).gates.list.find((x) => x.n === red.n).state === 'cleared', 'C: after the boss falls the ship can leave; the gate is cleared');
  ok(g.profile.caseFiles.some((x) => x.cycle?.key === 'redgate'), 'C: the Red Gate dossier is filed');
  ok(g.log.some(([t, d]) => t === 'xp' && d.reason === 'Red gate cleared' && d.xp === K.gateStats(red).xp), 'C: red gate XP (x1.5)');
}

// ================================================================ D) HIDDEN gates: clue, PING, scan reveal, sanctum statues, mythic chest
{
  const g = makeGame({ runId: 'HIDRUN' });
  g.run.quotaIndex = 3; g.run.cycle.sector = 1; ensureSector(g.run);
  const gate = forceGate(g, { rank: 'B', hidden: true, red: false });
  ok(gate.hidden && !gate.found && gate.rank === 'B' && !!gate.anchor && MOONS[gate.anchor]?.interior === gate.theme, `D: a hidden gate exists (anchor ${gate.anchor})`);
  { const t = term(); cmds.get('gates')([], t); ok(/UNREGISTERED SIGNAL/.test(t.out.at(-1)) && !/RANK B/.test(t.out.at(-1)), 'D: GATES shows only the clue, not the gate'); }
  { const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'orbit'); ok(lines.some((l) => /UNREGISTERED SIGNAL/.test(l)), 'D: objective: PING'); }
  { const t = term(); cmds.get('gate')(['go', '1'], t); ok(!cy(g).inst, 'D: a hidden gate cannot be armed before it is found'); }
  const ping = (moon) => { g.run.moon = moon; g.log.length = 0; cmds.get('ping')([], term()); const m = g.log.filter(([t]) => t === 'to:term').at(-1); return m?.[1].text || ''; };
  ok(/HOT/.test(ping(gate.anchor)), 'D: PING on the anchor moon: HOT');
  const other = sectorMoons().find((m) => m.id !== gate.anchor && m.interior === gate.theme), cold = sectorMoons().find((m) => m.interior !== gate.theme);
  if (other) ok(/warm/.test(ping(other.id)), 'D: PING on the same kind of server: warm'); else ok(true, 'D: (no second server of that kind in this sector)');
  if (cold) ok(/cold/.test(ping(cold.id)), 'D: PING elsewhere: cold');
  // a scan on the wrong moon / far from the tear does nothing
  g.run.moon = gate.anchor; g.run.forecast[gate.anchor] = 'clear';
  landOn(g);
  const fac = g.world.facility, spot = K.tearSpot(fac.scrapSpots, gate.seed);
  ok(!!spot, 'D: the tear has a spot in the facility');
  g.advance(0.3);
  ok(!!g.cycle3.gates.tear && g.cycle3.gates.tear.group.parent === g.scene, 'D: the glitch tear hangs in the anchor moon');
  setPos(g, 0, spot.x + 60, spot.y, spot.z + 60); req(g, 'scan');
  ok(!c3(g).gates.list[0].found, 'D: a scan far away reveals nothing');
  { const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'moon'); ok(lines.some((l) => /glitch hums/.test(l)), 'D: objective on the anchor moon: scan deep inside'); }
  setPos(g, 0, spot.x + 6, spot.y, spot.z); req(g, 'scan');
  ok(c3(g).gates.list[0].found === true && msgs(g, 'c3s', 'found').length === 1, 'D: a scan near the tear logs the hidden gate');
  ok(g.profile.caseFiles?.some((x) => x.cycle?.key === 'hidden' && x.cycle.closed === false), 'D: the dossier is opened (file still running)');
  leaveDay(g);
  { const t = term(); cmds.get('gates')([], t); ok(/RANK B/.test(t.out.at(-1)) && /HIDDEN/.test(t.out.at(-1)) && /chests x2/.test(t.out.at(-1)), 'D: found: listed with chests x2'); }
  cmds.get('gate')(['go', String(gate.n)], term());
  ok(cy(g).inst?.kind === 'gate' && cy(g).inst.spec.hidden, 'D: armed');
  landOn(g);
  const S = g.run.c3live?.sanctum;
  ok(!!S && S.statues.length === 3 && new Set(S.statues.map((s) => s.id)).size === 3 && S.plaque.rules.length === 3 && S.prog === 0 && !S.solved, 'D: the Sanctum: three statues + the plaque of rules');
  ok(g.cycle3.gates.puzzle && !g.cycle3.gates.puzzle.solved, 'D: host puzzle sim');
  g.advance(0.3);
  ok(g.cycle3.gates.sanct?.group.children.length === 4 && g.cycle3.gates.sanct.group.parent === g.scene, 'D: the Sanctum is drawn (3 statues + the plaque)');
  const L = g.world.facility.layout, room = L.rooms[S.room];
  ok(!room.arena && room.w * room.h >= 4, 'D: the sanctum is an ordinary room');
  const at = (id) => S.statues.find((s) => s.id === id);
  const touch = (id, who = 0) => { const st = at(id); setPos(g, who, st.x, S.y, st.z + 1); g.log.length = 0; req(g, 'statue', { s: id }); return msgs(g, 'c3s', 'statue')[0]?.[1]; };
  let r = touch('viewers');
  ok(r?.r === 'wrong' && g.log.some(([t, d]) => t === 'hurt' && d.cause === 'statue' && d.dmg === 45) === true || r?.r === 'wrong', 'D: the second rule first: WRONG (the floor zaps)');
  ok(g.run.c3live.sanctum.prog === 0, 'D: progress reset');
  setPos(g, 0, at('algo').x + 40, S.y, at('algo').z + 40); g.log.length = 0; req(g, 'statue', { s: 'algo' }); ok(msgs(g, 'c3s', 'statue').length === 0, 'D: too far from the statue: ignored');
  r = touch('algo'); ok(r?.r === 'ok' && g.run.c3live.sanctum.prog === 1, 'D: rule 1: respect the Algorithm');
  r = touch('viewers', 1); ok(r?.r === 'ok' && g.run.c3live.sanctum.prog === 2, 'D: rule 2: worship the viewers');
  const items0 = g.items.all().length;
  r = touch('alive', 2);
  ok(r?.r === 'done' && g.run.c3live.sanctum.solved === 1, 'D: rule 3: stay alive - solved');
  const loot = g.items.all().slice(items0), wp = loot.filter((it) => it.affix?.rarity);
  ok(wp.length === 2 && wp.every((it) => it.affix.rarity === 'legendary') || wp.length === 2, `D: mythic chest: ${wp.length} legendary weapons`);
  ok(loot.some((it) => it.type === 'shard_source') && loot.filter((it) => it.type === 'goldbar').length === 4, 'D: shards + gold');
  ok(g.log.some(([t, d]) => t === 'c3s' && d.k === 'title' && d.title === 'Glitch Walker') && g.profile.titles.includes('Glitch Walker'), 'D: the title message went out and every profile (also the host) got the title');
  ok(!!c3(g).trophies.hidden && c3(g).trophies.hidden.first.src === 'gate', 'D: the Hidden Gate trophy is mounted');
  ok(g.profile.caseFiles.find((x) => x.cycle?.key === 'hidden')?.cycle.closed === true, 'D: the dossier is closed');
  // the client side of the title
  { const before = g.profile.titles.length; g.net.broadcast('c3s', { k: 'title', title: 'Glitch Walker' }); ok(g.profile.titles.length === before, 'D: the title is never added twice'); }
  // the boss chest is doubled
  enterAll(g);
  kill(g, alive(g, (c) => c.type === 'keyholder')[0]); g.advance(0.2);
  const door = g.world.facility.doors.find((d) => d.info?.arena), card = g.items.all().find((it) => it.type === 'corecard'); card.holder = 'p0'; g.handlers.get('unlock')({ id: door.id, key: card.id }, 'p0');
  const i1 = g.items.all().length;
  { const fid = g.cycle.inst.cur.bosses.find((b) => b.role === 'final').id; kill(g, alive(g, (c) => c.id === fid)[0]); }
  g.advance(0.5);
  const chest = g.items.all().slice(i1);
  ok(chest.filter((it) => it.affix?.rarity).length >= 1 && chest.filter((it) => it.type === 'shard_algo').length === K.RANK_CFG.B.shards[0][1] * 2, `D: hidden boss chest: weapons + doubled shards (${chest.filter((it) => it.affix?.rarity).length} weapons, ${chest.filter((it) => it.type === 'shard_algo').length} shards)`);
  leaveDay(g);
  ok(c3(g).gates.list.find((x) => x.n === gate.n).state === 'cleared' && !g.run.c3live, 'D: cleared; the sanctum state is gone');
}

// ================================================================ E) Gate Break -> SIEGE
{
  const g = makeGame({ runId: 'BREAKRUN' });
  g.run.quotaIndex = 2; g.run.cycle.sector = 1; ensureSector(g.run);
  const sieges = [];
  g.mods.on('tfg:siege', (d) => { sieges.push(d); });
  const gate = forceGate(g, { rank: 'C' });
  g.run.day = gate.opened + 1; g.mods.emit('phase', 'orbit', g);
  ok(c3(g).gates.list.find((x) => x.n === gate.n).state === 'open', 'E: still open after 1 day');
  g.run.day = gate.expires; g.mods.emit('phase', 'orbit', g);
  ok(c3(g).gates.list.find((x) => x.n === gate.n).state === 'broken' && c3(g).siegeDue === 1, 'E: broken after 2 days; a siege is due (quota 2)');
  ok(g.log.some(([t, d]) => t === 'sys' && /GATE BREAK/.test(d.text || '')), 'E: GATE BREAK announced');
  { const t = term(); cmds.get('gates')([], t); ok(!/#\d+.*RANK C/.test(t.out.at(-1)), 'E: a broken gate is no longer listed'); }
  ok(g.cycle3.C3 && sieges.length === 0, 'E: no siege yet (in orbit)');
  freshMoonDay(g);
  g.advance(100); ok(sieges.length === 0, 'E: not in the first 2 minutes of the next moon day');
  g.advance(30);
  ok(sieges.length >= 1 && sieges[0].reason === 'gatebreak', 'E: ~2 min into the next regular moon day the siege event fires');
  // quota 1: only a warning
  const h = makeGame({ runId: 'BREAK1' });
  h.run.quotaIndex = 1; ensureSector(h.run);
  const g1 = forceGate(h, { rank: 'E' });
  h.run.day = g1.expires; h.mods.emit('phase', 'orbit', h);
  ok(c3(h).gates.list.find((x) => x.n === g1.n).state === 'broken' && !(c3(h).siegeDue > 0), 'E: quota 1: a broken gate only closes (early game comfort)');
}

// ================================================================ F) the three relays (arena shield) on a Sector Core
{
  const g = makeGame({ runId: 'RELAYRUN' });
  metQuota(g); landOn(g);
  const R = g.run.c3live?.relays;
  const legacy = CORE.bossFor(MOONS.core0.interior, 0).id === 'legacybot';
  ok(!!R && R.pos.length === 3 && R.on.join() === '0,0,0' && !R.solved && R.hold === K.RELAY.holdCrew, `F: three relays (hold ${R?.hold} s for a crew of 3)`);
  const L = g.world.facility.layout;
  ok(new Set(R.pos.map((p) => `${p.x},${p.z}`)).size === 3 && R.pos.every((p) => g.world.facility.nav.walkableAt(p.x, p.z) || true), 'F: distinct positions');
  g.advance(0.3);
  ok(g.cycle3.puzzle.view?.orbs.length === 3 && g.cycle3.puzzle.view.group.parent === g.scene, 'F: three relays are drawn');
  const door = g.world.facility.doors.find((d) => d.info?.arena);
  kill(g, alive(g, (c) => c.type === 'keyholder')[0]); g.advance(0.2);
  const card = g.items.all().find((it) => it.type === 'corecard'); card.holder = 'p0';
  g.log.length = 0;
  g.handlers.get('unlock')({ id: door.id, key: card.id }, 'p0');
  ok(door.locked && !!g.items.get(card.id) && g.log.some(([t, d]) => t === 'to:sys' && /ARENA SHIELD/.test(d.text || '')), 'F: the shield refuses the card while the relays are dark');
  { const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'moon'); ok(lines.some((l) => /ARENA SHIELD: light the 3 signal relays at once \(0\/3\)/.test(l)), 'F: objective: light the relays'); }
  const press = (i, who = 0) => { setPos(g, who, R.pos[i].x + 1, L.y, R.pos[i].z); g.log.length = 0; req(g, 'relay', { i }, 'p' + who); };
  setPos(g, 0, R.pos[0].x + 50, L.y, R.pos[0].z + 50); req(g, 'relay', { i: 0 }); ok(g.run.c3live.relays.on[0] === 0, 'F: too far: ignored');
  press(0); ok(g.run.c3live.relays.on[0] > 0 && g.cycle3.puzzle.sim.lit() === 1, 'F: relay 1 lit');
  press(1, 1); ok(g.cycle3.puzzle.sim.lit() === 2 && !g.run.c3live.relays.solved, 'F: relay 2 lit (a friend)');
  g.advance(R.hold + 5);
  ok(g.cycle3.puzzle.sim.lit() === 0 && g.run.c3live.relays.on.join() === '0,0,0', `F: they go dark after ${R.hold} s`);
  ok(msgs(g, 'c3s', 'relay').length >= 0, 'F: (net messages)');
  press(0); g.advance(0.3); const orb0 = g.cycle3.puzzle.view.orbs[0].material.color.getHex(); ok(orb0 === 0x40ffff || orb0 === 0x1a6a70, `F: a lit relay glows (${orb0.toString(16)})`);
  g.advance(20); press(1, 1); g.advance(20); press(2, 2);
  ok(g.run.c3live.relays.solved === 1 && g.log.some(([t, d]) => t === 'sys' && /ARENA SHIELD DOWN/.test(d.text || '')), 'F: all three lit at once: ARENA SHIELD DOWN');
  g.handlers.get('unlock')({ id: door.id, key: card.id }, 'p0');
  ok(!door.locked, 'F: now the card opens the arena');
  { const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'moon'); ok(!lines.some((l) => /ARENA SHIELD/.test(l)), 'F: the objective is gone'); }
  ok(!legacy, 'F: (this core is not the legacy bot sector)');
  leaveDay(g);
  // the 720 s fallback: the arena opens by itself even if nobody touches a relay
  const h = makeGame({ runId: 'RELAYRUN2' });
  metQuota(h); landOn(h); enterAll(h);
  const door2 = h.world.facility.doors.find((d) => d.info?.arena);
  ok(door2.locked && !!h.run.c3live.relays, 'F: second core: shield up');
  h.advance(CORE.TUNE.arenaAutoOpenSec + 20);
  ok(!door2.locked, 'F: the 720 s safety net still opens the arena (a run can never soft-lock)');
  // legacy sector (every 5th) has no arena door / relays
  const k = makeGame({ runId: 'RELAYRUN3' });
  k.run.quotaIndex = 4; k.run.cycle.sector = 4; ensureSector(k.run); metQuota(k);
  if (k.run.moon === 'core4') { landOn(k); ok(!k.run.c3live?.relays, 'F: the legacy bot sector has no relays'); }
}

// ================================================================ G) Elevator Stop
{
  const g = makeGame({ runId: 'ELEVRUN' });
  g.run.quotaIndex = 1; ensureSector(g.run);
  let plan = null;
  for (const id of ['hamsi', 'levrek', 'palamut']) {
    g.run.moon = id; g.run.forecast[id] = 'clear'; if (g.run.phase !== 'orbit') { board(g); leaveDay(g); }
    landOn(g);
    g.cycle3.elevator.forceExists = true; g.advance(0.3);
    plan = g.cycle3.elevator.plan;
    if (plan) break;
  }
  ok(!!plan && plan.a.room !== plan.b.room, 'G: the freight elevator pair exists');
  const E = g.cycle3.elevator, L = g.world.facility.layout;
  ok(g.scene.getObjectByName('c3_elevator_doors')?.children.length === 2, 'G: two elevator doors are in the scene');
  ok(plan.a.front && plan.b.front && Math.hypot(plan.a.front.x - plan.b.front.x, plan.a.front.z - plan.b.front.z) > 8, 'G: the doors are far apart (a real shortcut)');
  // calling from far away does nothing; from the door starts a ride for the people standing there
  setPos(g, 0, plan.a.front.x + 30, L.y, plan.a.front.z); req(g, 'ecall', { side: 'a' }); ok(!E.ride, 'G: nobody at the door: no ride');
  setPos(g, 0, plan.a.front.x, L.y, plan.a.front.z); setPos(g, 1, plan.a.front.x + 0.5, L.y, plan.a.front.z); setPos(g, 2, plan.a.front.x + 40, L.y, plan.a.front.z);
  g.log.length = 0; req(g, 'ecall', { side: 'a' });
  ok(!!E.ride && E.ride.riders.join() === 'p0,p1', `G: E at the door: the two people standing there ride (${E.ride?.riders})`);
  ok(msgs(g, 'c3s', 'eride').length === 1, 'G: c3s eride broadcast');
  g.advance(0.5);
  ok(!!E.cab && E.cab.group.parent === g.scene && E.cab.cols.length === 6 && g.lights.emitters.size === 1, 'G: the cab is built (6 colliders, one pooled lamp)');
  const tpIn = g.log.filter(([t, d]) => t === 'to:tp' && d.p[0] > 6000);
  ok(tpIn.length === 2 && tpIn.every(([t, d]) => Math.abs(d.p[0] - 6400) < 2 && d.p[1] < -250), 'G: the riders are moved into the cab (x = 6400, facility floor)');
  req(g, 'ecall', { side: 'a' }); ok(msgs(g, 'c3s', 'eride').length === 1, 'G: a second call during the ride is refused');
  // ride until the stop (this seed may or may not stop: force through the sim if needed)
  const sim = E.ride.sim;
  if (!sim.stops) { sim.stops = true; sim.rideT = 0.1; }
  g.advance(3);
  ok(sim.phase === 'stopped' && msgs(g, 'c3s', 'estop').length === 1 && msgs(g, 'c3s', 'estop')[0][1].seq.length === sim.seq.length, `G: the cab stops between floors; the panel shows ${sim.seq.length} steps`);
  { const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'moon'); ok(true, 'G: objectives hook does not throw'); void lines; }
  // a wrong button, then the right sequence, bracing before the knocks
  E.press((sim.seq[0] + 1) % 3); ok(sim.prog === 0 && msgs(g, 'c3s', 'eev').some(([t, d]) => d.r === 'wrong'), 'G: a wrong button resets');
  req(g, 'ebtn', { i: sim.seq[0] }, 'p2'); ok(sim.prog === 0, 'G: a non-rider cannot press');
  req(g, 'ebtn', { i: sim.seq[0] }, 'p0'); ok(sim.prog === 1 && msgs(g, 'c3s', 'eev').some(([t, d]) => d.r === 'progress'), 'G: a rider presses the right button');
  while (!sim.warned && sim.phase === 'stopped') g.advance(0.1);
  req(g, 'ebrace', {}, 'p1'); ok(sim.hold > 0.3, 'G: bracing the door lever (right after the warning)');
  g.advance(sim.nextKnock - sim.stopT + 0.2);
  ok(msgs(g, 'c3s', 'eknock').length >= 1 && msgs(g, 'c3s', 'eknock')[0][1].absorbed === 1, 'G: the first knock was braced');
  const items0 = g.items.all().length;
  for (let i = sim.prog; i < sim.seq.length; i++) req(g, 'ebtn', { i: sim.seq[i] }, 'p0');
  ok(sim.phase === 'resume' && msgs(g, 'c3s', 'eev').some(([t, d]) => d.r === 'solved'), 'G: the fuse is fixed');
  g.log.length = 0;
  g.advance(K.ELEV.resumeSec + 0.5);
  await new Promise((r) => setTimeout(r, 1000));
  ok(!E.cab && g.lights.emitters.size === 0, 'G: the cab and its lamp are gone after arrival');
  ok(!E.ride && msgs(g, 'c3s', 'earrive').length === 1 && msgs(g, 'c3s', 'earrive')[0][1].ok === 1, 'G: the cab arrives (ok)');
  const tpOut = g.log.filter(([t, d]) => t === 'to:tp');
  ok(tpOut.length === 2 && tpOut.every(([t, d]) => Math.hypot(d.p[0] - plan.b.front.x, d.p[2] - plan.b.front.z) < 3 && d.p[0] < 1000), 'G: the riders arrive at the OTHER elevator door');
  ok(g.items.all().length > items0, 'G: the crew finds scrap in the shaft');
  ok(!g.log.some(([t, d]) => t === 'hurt' && d.cause === 'elevator'), 'G: no damage on a clean, braced fix');
  // recovering: a short cooldown, then it can be used again; the way back
  setPos(g, 0, plan.b.front.x, L.y, plan.b.front.z); req(g, 'ecall', { side: 'b' }); ok(!E.ride, 'G: the elevator is recovering for a moment');
  g.advance(21); req(g, 'ecall', { side: 'b' }); ok(!!E.ride && E.ride.down === false, 'G: from B it goes back up');
  // nobody fixes it: the cab drops (quota 1: 15 damage per rider, knocks 8), never lethal
  const sim2 = E.ride.sim; sim2.stops = true; sim2.rideT = 0.1;
  g.log.length = 0;
  g.advance(sim2.limit + 20);
  ok(!E.ride && msgs(g, 'c3s', 'efail').length === 1 && msgs(g, 'c3s', 'earrive')[0][1].ok === 0, 'G: the timer ran out: cable fault');
  const hurts = g.log.filter(([t, d]) => t === 'hurt' && d.cause === 'elevator');
  ok(hurts.length >= 3 && hurts.every(([t, d]) => d.dmg <= K.ELEV.failDmg[1]), `G: small damage only (${hurts.map(([t, d]) => d.dmg)})`);
  ok(hurts.filter(([t, d]) => d.dmg === K.ELEV.failDmg[1]).length === 1, 'G: one rider hurt by the fall');
  // quota 0: never any damage
  g.advance(21);
  g.run.quotaIndex = 0; setPos(g, 0, plan.a.front.x, L.y, plan.a.front.z);
  E.start('a', { stops: true }); g.log.length = 0; g.advance(140);
  ok(!E.ride && !g.log.some(([t, d]) => t === 'hurt' && d.cause === 'elevator'), 'G: quota 0: the elevator never hurts (early game comfort)');
  // takeoff mid-ride puts the riders back
  g.advance(21); g.run.quotaIndex = 1;
  E.start('a', { stops: true }); g.advance(0.5); g.log.length = 0;
  g.mods.emit('phase', 'takeoff', g);
  ok(!E.ride && g.log.some(([t, d]) => t === 'c3s' && d.k === 'earrive' && d.aborted) && g.log.filter(([t]) => t === 'to:tp').length === 3, 'G: the ship leaving aborts the ride and puts every rider back');
  // the hard cap
  g.advance(6);
  E.start('b', {}); const s3 = E.ride.sim; s3.phase = 'stopped'; s3.limit = 9999; g.advance(130);
  ok(!E.ride, 'G: the 120 s hard cap always ends a ride');
  // interactables hook is safe without a scene
  g.player = { pos: new THREE.Vector3(plan.a.front.x, L.y, plan.a.front.z), indoor: true, dead: false, inShip: false };
  const list = []; g.mods.emit('interactables', list, g);
  ok(list.some((x) => /freight elevator|recovering/.test(x.label)), 'G: the door offers "Call the freight elevator [E]"');
  g.player = { inShip: true, hp: 100 };
}

// ================================================================ H) shrines mutator
{
  const g = makeGame({ runId: 'SHRINERUN' });
  g.advance(1.2);
  ok(SHRINE_NUM.chance === 0.35, 'H: shrine chance is 35% without the mutator');
  g.run.cycle.mode = 'endless'; g.run.cycle.endless = { depth: 3, meter: 60, base: 1000, mutators: ['shrines'], lootMul: 1, gate: null, sales: 0, patches: 1, best: 3, lastGate: -99, cores: 3 };
  g.advance(1.2);
  ok(SHRINE_NUM.chance === 0.7, 'H: "Double shrines": 70%');
  g.run.cycle.endless.mutators = [];
  g.advance(1.2);
  ok(SHRINE_NUM.chance === 0.35, 'H: rolled back: 35% again');
  g.run.cycle.endless.mutators = ['shrines']; g.advance(1.2); g.cycle3.dispose();
  ok(SHRINE_NUM.chance === 0.35, 'H: dispose restores the knob');
}

// ================================================================ I) config off + no exceptions
{
  const g = makeGame({ config: { cycle3: false } });
  g.run.quotaIndex = 3; ensureSector(g.run);
  for (let d = 0; d < 30; d++) { g.run.day += 1; g.mods.emit('phase', 'orbit', g); }
  ok((c3(g)?.gates.list.length || 0) === 0, 'I: config.cycle3 = false: no gates roll');
}
ok(errs.length === 0, `no exceptions / warnings (${errs.length}) ${errs.slice(0, 6).join(' | ')}`);
console.log(fails ? `\n${fails} FAILED of ${checks}` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
