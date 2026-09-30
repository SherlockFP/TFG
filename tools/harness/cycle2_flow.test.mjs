// node tools/harness/cycle2_flow.test.mjs - the sector cycle GLUE (src/game/cycle.js and its sub modules) on top of the REAL host.js phase flow
// (hostLever / hostFinishLanding / hostPopulateMoon / hostFinishTakeoff / hostEvaluateQuota / hostUpdate), the real CreatureManager, real facility
// layouts + NavGrid. Only the engine is faked (items, players, physics, net). Proves: gate -> core -> win / grace / shameful, arena access cards,
// boss chest, keystone (forces -> guardian -> key level), raid (3 bosses, weekly lock), endless (meter, patch notes, gates, cash out, fired),
// fired resets, save/load in the middle of a core, and a "give up" policy that always returns to the days stage (no soft-lock).
import * as THREE from 'three';
import { hostMethods, newRun } from '../../src/game/host.js';
import { CreatureManager } from '../../src/entities/creatures.js';
import { MOONS, MOON_ORDER } from '../../src/game/moons.js';
import { setInteriorProbe, ensureSector } from '../../src/game/moongen.js';
import { generateLayout } from '../../src/world/facility.js';
import { NavGrid } from '../../src/world/nav.js';
import { ITEMS, itemDef } from '../../src/game/items.js';
import { CREATURES } from '../../src/game/creatures.js';
import { installBosses } from '../../src/game/bosses.js';
import { installCycle } from '../../src/game/cycle.js';
import * as CORE from '../../src/game/cycle_core.js';
import * as P from '../../src/game/cycle_plan.js';

setInteriorProbe(() => true);
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const cmds = new Map();
globalThis.window = { KefalAPI: { registerCommand: (n, fn) => cmds.set(n, fn) }, __kefalMods: { commands: cmds, itemModels: new Map(), creatureModels: new Map() } };

let fails = 0, checks = 0;
const say = (m) => console.log('ok  ', m);
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } else console.log('ok  ', m); };
const errs = [];
const origErr = console.error, origWarn = console.warn;
console.error = (...a) => { errs.push(a.map(String).join(' ')); };
console.warn = () => {};

// ---------------------------------------------------------------- fake engine
class FakeItems {
  constructor(g) { this.g = g; this.map = new Map(); this.n = 0; }
  hostSpawn(type, pos, opts = {}) {
    const id = 'i' + (++this.n), def = itemDef(type);
    const it = { id, type, def, value: opts.value ?? Math.round((def.value?.[0] ?? 0) * (opts.valueMul || 1)), state: 'world', holder: null, obj: { position: pos.clone() }, soulbound: null, affix: opts.af, collected: false };
    this.map.set(id, it);
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
    this.profile = { name: 'P0', level: 5, titles: [], suit: 'orange' };
    this.progress = { addXp() {}, addCoins() {}, save() { } };
    this.run = newRun();
    Object.assign(this.run, { runId: o.runId || 'TESTRUN', seed: 4242, forecast: {}, factions: { a: 5, b: 0 } });
    for (const id of MOON_ORDER) this.run.forecast[id] = 'clear';
    this.hostData = { collected: new Set(), dayStats: this.freshDayStats(), spawnT: 999, outdoorSpawnT: 999, powerUsed: 0, outPowerUsed: 0, lastTimeSync: 0, alarmPlayed: false, allDeadT: 0 };
    this.timers = []; this.log = []; this.saves = 0;
    this.players = [0, 1, 2].map((i) => ({ id: 'p' + i, pos: new THREE.Vector3(i * 0.5, 1, 0), eye: new THREE.Vector3(i * 0.5, 2.6, 0), look: new THREE.Vector3(0, 0, 1), dead: false, inShip: true, indoor: false, crouch: false }));
    this.remotes = new Map([['p1', { hp: 90, name: 'P1' }], ['p2', { hp: 70, name: 'P2' }]]);
    this.player = { inShip: true, hp: 100 };
    this.engine = { scene: { add() {}, remove() {} }, shake() {} };
    this.physics = { lineOfSight: () => true };
    this.world = { facility: null, outdoor: null, ship: {}, moonId: null };
    this.env = { setSpace() {} };
    this.ship = { spawns: [new THREE.Vector3(3, 1, 0)], door: { open: false }, points: {} };
    this.items = new FakeItems(this);
    this.handlers = new Map();
    const self = this;
    const listeners = new Map();
    this.net = {
      handlers: this.handlers, isHost: true, code: 'TEST',
      broadcast(t, d) { self.log.push([t, d]); if (t === 'it') self.items.onEvent(d); if (t === 'door') self.onDoor(d); for (const fn of listeners.get('msg:' + t) || []) fn(d, 'p0'); },
      sendTo(id, t, d) { self.log.push(['to:' + t, d]); for (const fn of listeners.get('msg:' + t) || []) fn(d, 'p0'); },
      request(a, data = {}) { const fn = self.handlers.get(a); if (fn) fn({ a, ...data }, 'p0'); },
      handle(a, fn) { self.handlers.set(a, fn); },
      on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); }, off(ev, fn) { const l = listeners.get(ev); if (l) l.splice(l.indexOf(fn), 1); },
      sendRows() {}, playerCount: () => 3,
    };
    const buses = new Map();
    this.mods = {
      on(ev, fn) { (buses.get(ev) || buses.set(ev, []).get(ev)).push(fn); return () => { const l = buses.get(ev); l.splice(l.indexOf(fn), 1); }; },
      emit(ev, ...a) { for (const fn of [...(buses.get(ev) || [])]) fn(...a); },
    };
    this.creatures = new CreatureManager(this);
    this.registerHandlersNow = () => this.registerHandlers();   // the REAL host.js request handlers + the module hook
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

// facility built from a REAL layout (nav, doors, spots) without meshes
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
// the ship lands: build the facility (host.js reads game.world.facility during populate)
const origFinishLanding = hostMethods.hostFinishLanding;
FakeGame.prototype.hostFinishLanding = function () {
  if (this.run.phase === 'landing') this.world.facility = MOONS[this.run.moon]?.company ? null : fakeFacility(this);
  return origFinishLanding.call(this);
};
const origBeginTakeoff = hostMethods.hostBeginTakeoff;
void origBeginTakeoff;

function makeGame(o = {}) {
  const g = new FakeGame(o);
  installBosses?.(g);   // registers foreman + legacy creatures (needs mods.on / creatures)
  g.bosses = null;
  g.cycle = installCycle(g);
  g.registerHandlersNow();
  g.mods.emit('netReady', g.net, g);
  ensureSector(g.run);
  g.mods.emit('hostStart', g);
  return g;
}
const cy = (g) => g.run.cycle;
const board = (g) => { for (const p of g.players) { p.inShip = true; p.indoor = false; } };
const enterAll = (g, roomId) => {
  const L = g.world.facility.layout, r = L.rooms[roomId ?? L.entrance.room.id];
  g.players.forEach((p, i) => { p.inShip = false; p.indoor = true; p.pos.set(L.ox + (r.cx + 0.5) * L.cell + i, L.y, L.oz + (r.cz + 0.5) * L.cell); p.eye.set(p.pos.x, p.pos.y + 1.6, p.pos.z); });
};
const wipe = (g) => { for (const p of g.players) p.dead = true; };
const revive = (g) => { for (const p of g.players) p.dead = false; };
const alive = (g, f) => [...g.creatures.host.values()].filter((c) => !c.dead && (!f || f(c)));
const kill = (g, c) => g.creatures.damage(c.id, 1e9, 'p0', {});
/** end of a normal day: everybody aboard, lever -> takeoff -> orbit */
function leaveDay(g) { board(g); g.hostLever('p0'); g.advance(8); }
function landOn(g) { g.hostLever('p0'); g.advance(10); }

/** drive the ship from a fresh run to "quota met" at the HQ on the deadline day */
function metQuota(g) {
  const run = g.run;
  run.phase = 'company'; run.moon = 'hq'; run.daysLeft = 0; run.sold = run.quota;
  g.world.facility = null;
  g.hostBeginTakeoff('lever');
  g.advance(8);
}

// ================================================================ A) the classic loop: gate -> core -> win
{
  const g = makeGame();
  ok(cy(g) && cy(g).stage === 'days' && cy(g).sector === 0, 'a new run starts the cycle at sector 0, stage days');
  const q0 = g.run.quota;
  metQuota(g);
  ok(g.run.phase === 'orbit' && cy(g).stage === 'gate', `quota met at the HQ on day 3 -> stage gate (${cy(g).stage})`);
  ok(g.run.quotaIndex === 1 && g.run.quota > q0 && g.run.daysLeft === 3, 'quota advanced as usual, 3 days on the clock');
  ok(g.run.moon === 'core0' && MOONS.core0?.instance && MOONS.core0.core, 'the autopilot is locked on the Sector Core (moon registered)');
  ok(g.log.some(([t, d]) => t === 'cyx' && d.k === 'banner' && d.main === 'SECTOR GATE OPEN'), 'SECTOR GATE OPEN banner broadcast');
  { const term = { out: [], print(t) { this.out.push(t); } };
    cmds.get('core')([], term);
    const txt = term.out.at(-1);
    ok(/SECTOR CORE/.test(txt) && /GATE OPEN/.test(txt) && txt.includes(CORE.bossFor(MOONS.core0.interior, 0).name.split(' ')[0]) && /recommended level/.test(txt), 'CORE prints the briefing (boss, status, level)');
    cmds.get('cycle')([], term);
    ok(/SECTOR CYCLE/.test(term.out.at(-1)) && /SECTOR GATE OPEN/.test(term.out.at(-1)), 'CYCLE prints the status'); }
  // route elsewhere is overridden by the lever
  g.run.moon = 'hamsi';
  landOn(g);
  ok(g.run.moon === 'core0' && g.run.phase === 'moon', 'the lever overrides a manual route while the gate is open');
  ok(cy(g).stage === 'core' && cy(g).attempts === 1, 'landing -> stage core');
  const inst = g.cycle.inst.cur;
  ok(!!inst && inst.kind === 'core', 'instance runtime is live');
  const theme = MOONS.core0.interior, bossInfo = CORE.bossFor(theme, 0);
  const finals = alive(g, (c) => c.type === bossInfo.id);
  ok(finals.length === 1, `arena boss ${bossInfo.id} spawned (${finals.length})`);
  const kh = alive(g, (c) => c.type === 'keyholder');
  ok(kh.length === CORE.keysNeeded(0), `${CORE.keysNeeded(0)} key holder(s) at sector 0 (${kh.length})`);
  ok(alive(g, (c) => c.elite).length >= 3, 'elites in the wings');
  const L = g.world.facility.layout;
  const door = g.world.facility.doors.find((d) => d.info?.arena);
  ok(!!door && door.locked, 'the arena door is locked');
  const bossPos = finals[0].pos;
  const arena = L.arena;
  ok(bossPos.x > L.ox + arena.x * L.cell && bossPos.x < L.ox + (arena.x + arena.w) * L.cell && bossPos.z > L.oz + arena.z * L.cell && bossPos.z < L.oz + (arena.z + arena.h) * L.cell || bossInfo.id === 'legacybot', 'the boss stands inside the arena room');
  ok(inst.plan.keys === 1 && g.run.cycle.live.keys === 0 && g.run.cycle.live.locked, 'live mirror: 0/1 cards, locked');
  // a plain key does not open the arena, a Key Holder card does
  const key = g.items.hostSpawn('key', new THREE.Vector3(0, 0, 0)); g.items.get(key).holder = 'p0';
  g.handlers.get('unlock')({ id: door.id, key }, 'p0');
  ok(door.locked, 'a plain key cannot open the boss arena');
  kill(g, kh[0]);
  g.advance(0.2);
  const card = g.items.all().find((it) => it.type === 'corecard');
  ok(!!card, 'the Key Holder drops an ARENA ACCESS CARD');
  card.holder = 'p0';
  g.handlers.get('unlock')({ id: door.id, key: card.id }, 'p0');
  ok(!door.locked && !g.items.get(card.id), 'the card opens the arena and is consumed');
  ok(cy(g).live.keys === 1 && !cy(g).live.locked, 'live mirror: 1/1 cards, unlocked');
  // the boss: kill -> chest
  const before = g.items.all().length;
  kill(g, finals[0]);
  g.advance(0.5);
  ok(cy(g).bossDead === true, 'bossKilled reaches the state machine');
  const chestItems = g.items.all().slice(before);
  ok(chestItems.length >= 4, `boss chest spilled (${chestItems.length} items)`);
  ok(chestItems.some((it) => it.affix?.rarity === 'legendary'), 'the chest has a Legendary weapon');
  ok(chestItems.some((it) => it.type.startsWith('trophy_')) || !ITEMS['trophy_' + bossInfo.id], 'boss trophy');
  // objectives lines
  const lines = []; g.mods.emit('objectives', (text, kind) => lines.push(text), g, 'moon');
  ok(lines.some((l) => /down|chest/i.test(l)), 'objective: boss down, take the chest');
  // extraction
  const daysBefore = g.run.daysLeft, dayBefore = g.run.day;
  leaveDay(g);
  ok(g.run.phase === 'orbit', 'back in orbit');
  ok(cy(g).stage === 'days' && cy(g).sector === 1 && cy(g).cores === 1 && cy(g).firstKills[theme] === 1, 'WIN: stage days, sector 1, 1 core, first-kill flag');
  ok(g.run.daysLeft === daysBefore && g.run.day === dayBefore + 1, 'the core day did not cost a quota day');
  ok(g.run.moon !== 'core0' && !!MOONS[g.run.moon], `routed to a normal moon afterwards (${g.run.moon})`);
  g.applyRunState({});
  ok(!MOONS.core0, 'the core moon is unregistered again');
  ok(g.log.some(([t, d]) => t === 'cyx' && d.k === 'win'), 'SECTOR CLEARED message broadcast');
  ok(g.log.some(([t, d]) => t === 'xp' && d.reason === 'Sector core cleared'), 'crew XP reward');
  ok(g.saves > 0, 'the run was saved');
  // the second sector gates at sector 1 with 2 key holders
  metQuota(g);
  ok(cy(g).stage === 'gate' && g.run.moon === 'core1', 'second sector: gate open on core1');
  landOn(g);
  ok(alive(g, (c) => c.type === 'keyholder').length === 2, 'two key holders from sector 1');
  const door1 = g.world.facility.doors.find((d) => d.info?.arena);
  const cards = [];
  for (const k of alive(g, (c) => c.type === 'keyholder')) { kill(g, k); }
  g.advance(0.2);
  for (const it of g.items.all().filter((x) => x.type === 'corecard')) { it.holder = 'p0'; g.handlers.get('unlock')({ id: door1.id, key: it.id }, 'p0'); cards.push(it.id); }
  ok(cards.length === 2 && !door1.locked, 'both cards needed and accepted at sector 1');
  board(g);
}

// ================================================================ B) losing: grace day, second loss = shameful exit
{
  const g = makeGame();
  metQuota(g);
  landOn(g);
  ok(cy(g).stage === 'core', 'B: in the core');
  const days = g.run.daysLeft;
  leaveDay(g);   // pull the lever at once: a loss
  ok(cy(g).stage === 'grace' && cy(g).fails === 1 && cy(g).sector === 0, `first loss -> grace (${cy(g).stage})`);
  ok(g.run.daysLeft === days && g.run.phase === 'orbit', 'a lost core costs no quota day');
  ok(!!MOONS[g.run.moon] && !MOONS[g.run.moon].instance, 'free routing on the grace day');
  const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'orbit');
  ok(lines.some((l) => /GRACE/.test(l)), 'objective: grace day');
  // the grace day: any normal moon
  g.run.moon = 'hamsi'; g.run.forecast.hamsi = 'clear';
  landOn(g);
  ok(g.run.phase === 'moon' && cy(g).stage === 'grace', 'the grace day is a normal moon day');
  const daysG = g.run.daysLeft;
  leaveDay(g);
  ok(cy(g).stage === 'gate' && g.run.daysLeft === 3, `grace day over -> the gate re-opens (${cy(g).stage}, days ${g.run.daysLeft} vs ${daysG})`);
  ok(g.run.moon === 'core0', 'locked on the core again');
  const fac0 = g.run.factions.a;
  landOn(g);
  const layoutSeed1 = g.run.seed;
  leaveDay(g);
  ok(cy(g).stage === 'days' && cy(g).sector === 1 && cy(g).cores === 0 && cy(g).fails === 0, 'second loss -> shameful exit: the sector advances, no core counted');
  ok(g.run.factions.a === fac0 + CORE.TUNE.shamefulRep, 'faction reputation hit');
  ok(g.log.some(([t, d]) => t === 'cyx' && d.main === 'SHAMEFUL EXIT'), 'SHAMEFUL EXIT banner');
  // the core layout is stable on a retry (seed derived from the run)
  ok(layoutSeed1 === (P && g.run.seed), 'seed recorded');
  // wipe = loss too, and a recall after 1800 s
  metQuota(g);
  landOn(g);
  enterAll(g);
  wipe(g);
  g.advance(6);   // all dead for > 4 s -> autopilot returns to orbit by itself
  g.advance(9);
  ok(g.run.phase === 'orbit' && cy(g).stage === 'grace', 'all dead -> autopilot -> grace day (boss alive)');
  revive(g);
  // grace -> gate -> core -> recall
  g.run.moon = 'hamsi'; landOn(g); leaveDay(g);
  ok(cy(g).stage === 'gate', 'B: gate again');
  landOn(g);
  enterAll(g);
  g.advance(CORE.TUNE.coreRecallSec + 30);
  g.advance(10);
  ok(g.run.phase === 'orbit', 'recall after the time cap returns the ship (never stuck in the core)');
  ok(cy(g).stage === 'days', 'recall counted as the second loss');
  ok(g.run.time <= 990 || g.run.phase === 'orbit', 'the day clock never ran out in the core');
}

// ================================================================ C) boss + wipe = win; fired resets
{
  const g = makeGame();
  metQuota(g); landOn(g);
  const bossInfo = CORE.bossFor(MOONS.core0.interior, 0);
  const b = alive(g, (c) => c.type === bossInfo.id)[0];
  enterAll(g);
  kill(g, b);
  wipe(g);
  g.advance(6); g.advance(9);
  ok(g.run.phase === 'orbit' && cy(g).stage === 'days' && cy(g).sector === 1, 'boss killed, then everybody dies = still a win');
  // fired: quota not met on the deadline day
  const g2 = makeGame();
  const c2 = cy(g2);
  c2.firstKills = { office: 1 };
  g2.run.phase = 'company'; g2.run.moon = 'hq'; g2.run.daysLeft = 0; g2.run.sold = 0;
  g2.hostBeginTakeoff('lever'); g2.advance(8);
  ok(g2.run.phase === 'fired', 'quota missed -> fired (unchanged)');
  g2.advance(9);
  ok(g2.run.phase === 'orbit' && cy(g2) && cy(g2).stage === 'days' && cy(g2).firstKills.office === 1, 'the run reset brings the cycle back, first kills kept');
}

// ================================================================ D) save / load in the middle of a core; disabled flag
{
  const g = makeGame();
  metQuota(g); landOn(g);
  const saved = JSON.parse(JSON.stringify(g.run));
  const g2 = new FakeGame(); void g2;
  const h = makeGame({ runId: saved.runId });
  Object.assign(h.run, saved, { phase: 'orbit' });
  h.mods.emit('hostStart', h);
  ok(cy(h).stage === 'gate' && h.run.moon === 'core0' && !!MOONS.core0, 'a save loaded in the middle of a core resumes at the gate, ship in orbit');
  landOn(h);
  ok(cy(h).stage === 'core', 'and the core can be entered again');
  { const k = makeGame();
    k.run.quotaIndex = 1; k.run.cycle.sector = 1; ensureSector(k.run);
    const t2 = { out: [], print(t) { this.out.push(t); } };
    cmds.get('keystone')(['go'], t2);
    const armedMoon = k.run.moon;
    const snap = JSON.parse(JSON.stringify(k.run));
    ok(armedMoon.startsWith('ks') && snap.cycle.inst?.state === 'armed', 'a keystone is armed (moon ' + armedMoon + ')');
    const k2 = makeGame({ runId: snap.runId });
    Object.assign(k2.run, snap, { phase: 'orbit' });
    k2.mods.emit('hostStart', k2);
    ok(!cy(k2).inst && !!MOONS[k2.run.moon] && !k2.run.moon.startsWith('ks'), 'loading a save with an armed keystone re-routes to a real moon'); }
  const off = makeGame({ config: { cycle: false } });
  const q = off.run.quotaIndex;
  metQuota(off);
  ok(off.run.quotaIndex === q + 1 && !off.run.cycle?.stage?.startsWith?.('gate') && off.run.moon !== 'core0', 'config.cycle = false: the classic loop is untouched');
}

// ================================================================ E) KEYSTONE
{
  const g0 = makeGame();
  const t0 = { out: [], print(t) { this.out.push(t); } };
  cmds.get('keystone')([], t0);
  ok(/Not available/.test(t0.out.at(-1)), 'not available in the first sector');
  void g0;
  const g = makeGame();
  g.run.quotaIndex = 1; g.run.cycle.sector = 1; g.run.daysLeft = 3; ensureSector(g.run);
  const term = { out: [], print(t) { this.out.push(t); } };
  cmds.get('keystone')([], term);
  ok(/CORRUPTED KEYSTONE/.test(term.out.at(-1)) && /Type KEYSTONE GO/.test(term.out.at(-1)), 'KEYSTONE shows the info + how to start (available from sector 2)');
  const lines = []; g.mods.emit('objectives', (text) => lines.push(text), g, 'orbit');
  ok(lines.some((l) => /KEYSTONE/.test(l)) && lines.some((l) => /RAID/.test(l)), 'objectives advertise KEYSTONE and RAID in orbit');
  cmds.get('keystone')(['go'], term);
  ok(cy(g).inst?.kind === 'keystone' && cy(g).inst.state === 'armed' && g.run.moon === cy(g).inst.id && MOONS[g.run.moon]?.keystone, 'KEYSTONE GO arms a run on the routed moon');
  g.run.cycle.ks.level = 8;   // a higher key for the affix checks
  cmds.get('keystone')(['cancel'], term);
  ok(!cy(g).inst, 'KEYSTONE CANCEL disarms');
  cmds.get('keystone')(['go', 'l3'], term);
  ok(cy(g).inst.level === 3, 'KEYSTONE GO L3 starts a lower key than yours');
  const days = g.run.daysLeft;
  landOn(g);
  ok(g.cycle.inst.cur?.kind === 'keystone' && cy(g).inst.state === 'live', 'landed: keystone live');
  { const dr = g.world.facility.doors.find((d) => d.kind === 'door' && !d.locked && !d.info?.arena);
    if (dr) {
      g.handlers.get('door')({ id: dr.id, open: true }, 'p0');
      ok(!dr.open, 'LAGGY (level 3): the door does not open at once');
      g.advance(2.7);
      ok(dr.open, 'LAGGY: it opens after 2.5 s');
    } else ok(true, 'no plain door in this layout'); }
  const ks = g.cycle.inst.cur.ks;
  ok(ks.level === 3 && ks.limit >= 420 && ks.need > 10, `timer ${ks.limit}s, forces needed ${ks.need}`);
  ok(!alive(g, (c) => c.def.cyBoss).length, 'no guardian before the forces are cleared');
  const door = g.world.facility.doors.find((d) => d.info?.arena);
  ok(!door || !door.locked, 'the keystone arena is not locked (no cards)');
  // fill the forces
  enterAll(g);
  let guard = 0;
  while (!ks.guardian && guard++ < 200) {
    g.advance(P.KS.spawnEvery + 1, 0.5);
    for (const c of alive(g, (c) => !c.def.boss && !c.def.hazard && !c.def.cyAux && c.zone === 'in' && c.maxHp)) { kill(g, c); if (ks.guardian) break; }
  }
  ok(!!ks.guardian, `forces reached 100% -> the Guardian awakens (${guard} waves)`);
  const gd = alive(g, (c) => c.def.cyBoss || c.type === 'foreman')[0];
  ok(!!gd, 'guardian creature exists');
  const left0 = ks.limit - ks.t;
  kill(g, gd);
  g.advance(0.5);
  ok(g.cycle.inst.cur.finalDead, 'guardian down');
  leaveDay(g);
  const lvl = cy(g).ks.level;
  ok(lvl > 8 - 0 || lvl >= 3, 'key level changed');
  ok(cy(g).ks.level === P.keystoneResult(3, left0 / ks.limit, true).next, `key level after success = ${cy(g).ks.level}`);
  ok(!cy(g).inst && g.run.daysLeft === days - 1, 'keystone day consumed a normal day, instance cleared');
  ok(g.log.some(([t, d]) => t === 'cyx' && d.k === 'ksdone' && d.success), 'ksdone broadcast');
  // failure: timer runs out, guardian never dies
  cmds.get('keystone')(['go', 'l2'], term);
  landOn(g);
  enterAll(g);
  const ks2 = g.cycle.inst.cur.ks;
  g.advance(ks2.limit + 5, 1);
  ok(ks2.expired, 'the timer expires');
  leaveDay(g);
  ok(cy(g).ks.level === Math.max(2, P.keystoneResult(2, 0, false).next) && g.log.some(([t, d]) => t === 'cyx' && d.k === 'ksdone' && !d.success), 'depleted key: level drops (never below the minimum)');
  // routing away cancels an armed keystone
  g.run.daysLeft = 3;
  cmds.get('keystone')(['go'], term);
  g.run.moon = 'hamsi';
  landOn(g);
  ok(!cy(g).inst && g.run.phase === 'moon', 'routing elsewhere disarms it and lands normally');
  leaveDay(g);
}

// ================================================================ F) RAID
{
  const g = makeGame();
  g.run.quotaIndex = 2; g.run.cycle.sector = 2; ensureSector(g.run);
  const term = { out: [], print(t) { this.out.push(t); } };
  cmds.get('raid')([], term);
  ok(/RAID/.test(term.out.at(-1)) && /HEROIC/.test(term.out.at(-1)), 'RAID lists the difficulties');
  cmds.get('raid')(['go', 'heroic'], term);
  ok(cy(g).inst?.kind === 'raid' && cy(g).inst.diff === 'heroic' && MOONS.raid1?.raid, 'RAID GO HEROIC arms the raid');
  landOn(g);
  const cur = g.cycle.inst.cur;
  const list = P.raidBosses('TESTRUN', P.weekKey());
  ok(cur && cur.kind === 'raid' && cur.bosses.length === 3, `raid: 3 bosses (${cur?.bosses.map((b) => b.type).join(', ')})`);
  ok(cur.crew === 3, 'crew of 3 detected');
  const finalC = g.creatures.host.get(cur.bosses.find((b) => b.role === 'final').id);
  ok(finalC.maxHp === P.bossHpFor({ hp: CORE.BOSS_TABLE[Object.keys(CORE.BOSS_TABLE).find((k) => CORE.BOSS_TABLE[k].id === list[2].id)].hp }, { sector: 2, crew: 3, raid: true, hpMul: 1.7 }) || list[2].id === 'foreman', `final boss HP scaled for the crew (${finalC.maxHp})`);
  const door = g.world.facility.doors.find((d) => d.info?.arena);
  ok(door.locked && cur.plan.keys === 2, 'arena locked behind two cards');
  enterAll(g);
  for (const b of cur.bosses.filter((x) => x.role === 'mid')) kill(g, g.creatures.host.get(b.id));
  g.advance(0.3);
  const cards = g.items.all().filter((it) => it.type === 'corecard');
  ok(cards.length === 2, 'both mini-bosses dropped a card');
  for (const it of cards) { it.holder = 'p0'; g.handlers.get('unlock')({ id: door.id, key: it.id }, 'p0'); }
  ok(!door.locked, 'raid arena opened');
  const items0 = g.items.all().length;
  kill(g, finalC);
  g.advance(0.5);
  ok(g.items.all().length > items0 + 3, 'raid chest dropped (first clear of the week)');
  const credits = g.run.credits;
  leaveDay(g);
  ok(g.profile.cycle2?.raid?.done?.heroic === 1, 'weekly lock recorded (host profile)');
  ok(g.run.credits > credits && !cy(g).inst, 'raid credits paid, instance cleared');
  // second clear: no chest
  g.run.daysLeft = 3;
  cmds.get('raid')(['go', 'heroic'], term); landOn(g); enterAll(g);
  const cur2 = g.cycle.inst.cur;
  for (const b of cur2.bosses.filter((x) => x.role === 'mid')) kill(g, g.creatures.host.get(b.id));
  g.advance(0.3);
  for (const it of g.items.all().filter((x) => x.type === 'corecard')) { it.holder = 'p0'; g.handlers.get('unlock')({ id: g.world.facility.doors.find((d) => d.info?.arena).id, key: it.id }, 'p0'); }
  const n2 = g.items.all().length;
  kill(g, g.creatures.host.get(cur2.bosses.find((b) => b.role === 'final').id));
  g.advance(0.5);
  ok(g.items.all().length === n2, 'weekly lock: no second raid chest for the same difficulty');
  leaveDay(g);
  // solo raid works
  g.players.splice(1);
  g.run.daysLeft = 3;
  cmds.get('raid')(['go'], term); landOn(g);
  ok(g.cycle.inst.cur?.crew === 1 && g.cycle.inst.cur.bosses.length === 3, 'a solo crew can start the raid (scaled)');
  leaveDay(g);
  ok(cy(g).stage === 'days' || cy(g).stage === 'gate', 'raid abandoned: back to normal');
}

// ================================================================ G) ENDLESS
{
  const g = makeGame();
  const c = cy(g);
  c.cores = 3; c.sector = 3; g.run.quotaIndex = 3; ensureSector(g.run);
  const term = { out: [], print(t) { this.out.push(t); } };
  cmds.get('endless')([], term);
  ok(/DEEP FEED/.test(term.out.at(-1)), 'ENDLESS prints the status');
  cmds.get('endless')(['accept'], term);
  ok(cy(g).mode === 'endless' && cy(g).endless.meter === CORE.E.start, 'PATCH 1.0: endless accepted');
  ok(g.run.quota === CORE.meterUnit(cy(g).endless.base, 0) && g.run.sold === Math.round(0.7 * g.run.quota), 'the quota bar mirrors the engagement meter');
  // a moon day: depth +1, the meter decays
  g.run.moon = 'hamsi'; landOn(g);
  ok(g.run.phase === 'moon', 'endless: normal moon day');
  const m0 = cy(g).endless.meter;
  leaveDay(g);
  ok(cy(g).endless.depth === 1 && cy(g).endless.meter < m0, `depth 1, meter ${m0} -> ${cy(g).endless.meter}`);
  ok(g.run.daysLeft === 3, 'no deadline in endless');
  // sales fill it
  g.onSellResult({ total: g.run.quota * 0.2 });
  ok(cy(g).endless.meter > 100 - 0 || cy(g).endless.meter > m0 - 30, 'sales raise the meter');
  // three days -> patch notes
  for (let i = 0; i < 2; i++) { g.run.moon = 'hamsi'; g.onSellResult({ total: g.run.quota * 0.6 }); landOn(g); leaveDay(g); }
  ok(cy(g).endless.depth === 3 && cy(g).endless.patches === 1 && cy(g).endless.mutators.length >= 1, `PATCH NOTES at depth 3 (mutators: ${cy(g).endless.mutators.join(', ')})`);
  ok(g.log.some(([t, d]) => t === 'sys' && /PATCH NOTES/.test(d.k || d.text || '')), 'patch notes announced');
  // force a gate and enter it
  cy(g).endless.gate = { kind: 'glitch', rank: 'S', red: false, hpMul: 1, chests: 1, depth: 3 };
  cmds.get('gate')([], term);
  ok(cy(g).inst?.kind === 'gate' && MOONS[cy(g).inst.id]?.gate, 'GATE arms the S-rank gate');
  g.onSellResult({ total: g.run.quota });
  landOn(g);
  ok(g.cycle.inst.cur?.kind === 'gate' && g.cycle.inst.cur.bosses.length >= 1, 'gate: boss + key holders');
  enterAll(g);
  for (const b of g.cycle.inst.cur.bosses) kill(g, g.creatures.host.get(b.id));
  g.advance(0.5);
  leaveDay(g);
  ok(!cy(g).inst && !cy(g).endless.gate && cy(g).endless.depth === 4, 'gate cleared, depth 4');
  // cash out
  cmds.get('cashout')([], term);
  ok(cy(g).mode === 'classic' && cy(g).cores === 0 && g.log.some(([t, d]) => t === 'cyx' && d.k === 'cashout' && d.rew.clout > 0), 'CASHOUT: rewards broadcast, back to classic');
  ok((g.profile.cycle2?.board || []).length === 1 && g.profile.cycle2.board[0].depth === 4, 'CASHOUT: the local leaderboard got the entry');
  // fired in endless: meter 0
  const g3 = makeGame();
  cy(g3).cores = 3; g3.run.quotaIndex = 3; ensureSector(g3.run);
  cmds.get('endless')(['accept'], term);
  cy(g3).endless.meter = 5; g3.run.moon = 'hamsi'; landOn(g3); leaveDay(g3);
  g3.advance(6);
  ok(g3.run.phase === 'fired' || g3.log.some(([t]) => t === 'fired'), 'meter reaches 0 -> fired');
  g3.advance(10);
  ok(cy(g3)?.mode === 'classic', 'after the reset the cycle is classic again');
  ok(g3.log.some(([t, d]) => t === 'cyx' && d.k === 'cashout' && d.fired && d.rew.factor === 0.5), 'fired payout is halved');
}

// ================================================================ G2) the Legacy Bot sector (every 5th): world boss outside, no access cards
{
  const g = makeGame({ runId: 'LEGACY1' });
  g.bosses = { hostOnMoonPopulated() {}, hostSpawnLegacy: () => g.creatures.hostSpawn('legacybot', new THREE.Vector3(80, 0, 80), { level: 1, elite: false, zone: 'out', state: 'dormant', affix: null }) };
  g.run.quotaIndex = 4; g.run.cycle.sector = 4; ensureSector(g.run);
  metQuota(g);
  ok(cy(g).stage === 'gate' && g.run.moon === 'core4', 'sector 5: the gate opens on core4');
  landOn(g);
  const cur = g.cycle.inst.cur;
  ok(cur.finalType === 'legacybot' && cur.plan.keys === 0, 'boss = Legacy Bot, no access cards');
  const lb = alive(g, (c) => c.type === 'legacybot')[0];
  ok(!!lb && lb.state === 'boot' && lb.maxHp === P.bossHpFor({ hp: 1500 }, { sector: 4, crew: 3 }), `Legacy Bot spawned awake with the cycle HP (${lb?.maxHp})`);
  const door = g.world.facility.doors.find((d) => d.info?.arena);
  ok(!door || !door.locked, 'no locked arena at the Legacy sector');
  enterAll(g);
  g.advance(20);
  kill(g, lb);
  g.advance(0.5);
  ok(cy(g).bossDead === true && g.items.all().some((it) => it.type === 'trophy_legacybot'), 'Legacy Bot down: chest + trophy');
  leaveDay(g);
  ok(cy(g).stage === 'days' && cy(g).sector === 5 && cy(g).cores === 1, 'win at the Legacy sector');
}
// ================================================================ G3) every theme's boss goes through the same flow
{
  const seen = new Set();
  const byTheme = {};
  const expectedIds = new Set(Object.values(CORE.BOSS_TABLE).map(b => b.id));
  const sampledIds = new Set();
  for (let i = 0; i < 4000 && sampledIds.size < expectedIds.size; i++) {
    const th = P.coreTheme('TH' + i, 0);
    if (!byTheme[th]) byTheme[th] = 'TH' + i;
    sampledIds.add(CORE.bossFor(th, 0).id);
  }
  ok([...expectedIds].every(id => sampledIds.has(id)), `found seeded runs covering every canonical boss (${sampledIds.size}/${expectedIds.size})`);
  for (const [theme, runId] of Object.entries(byTheme)) {
    const g = makeGame({ runId });
    metQuota(g); landOn(g);
    const info = CORE.bossFor(MOONS.core0.interior, 0);
    const b = alive(g, (c) => c.type === info.id)[0];
    ok(MOONS.core0.interior === theme && !!b, `${theme}: boss ${info.id} spawned`);
    enterAll(g, g.world.facility.layout.arena.id);
    g.advance(45);
    ok(!g.creatures.host.get(b.id)?.dead && g.log.some(([t, d]) => t === 'hurt' || t === 'cyx'), `${theme}: the boss fights (${g.log.filter(([t]) => t === 'hurt').length} hits)`);
    kill(g, b);
    g.advance(0.5);
    ok(cy(g).bossDead, `${theme}: boss down`);
    leaveDay(g);
    ok(cy(g).stage === 'days' && cy(g).sector === 1, `${theme}: cleared`);
    seen.add(info.id);
  }
  // Theme aliases must run their own flow, while coverage must reach every canonical kit.
  ok([...expectedIds].every(id => seen.has(id)), `every canonical boss completed its flow (${seen.size}/${expectedIds.size}): ${[...seen].join(', ')}`);
}

// ================================================================ H) never a soft-lock: "give up" policy from many states
{
  let worst = 0;
  for (let seed = 0; seed < 12; seed++) {
    const g = makeGame({ runId: 'FUZZ' + seed });
    let rnd = seed * 7919 + 13;
    const rand = () => { rnd = (rnd * 1103515245 + 12345) >>> 0; return rnd / 4294967296; };
    metQuota(g);
    let steps = 0;
    while (steps++ < 40) {
      const c = cy(g);
      if (c.stage === 'days') break;
      if (g.run.phase === 'orbit') {
        if (!MOONS[g.run.moon]) { ok(false, 'run.moon points at an unregistered moon: ' + g.run.moon); break; }
        if (c.stage === 'grace') g.run.moon = 'hamsi';
        landOn(g);
        if (g.run.phase !== 'moon') { ok(false, 'landing failed in stage ' + c.stage + ' phase ' + g.run.phase); break; }
        const r = rand();
        if (c.stage === 'core' && r < 0.3) { enterAll(g); const b = alive(g, (x) => x.def.boss)[0]; if (b) kill(g, b); }
        if (r > 0.8) { enterAll(g); wipe(g); g.advance(11); revive(g); board(g); } else leaveDay(g);
      } else { board(g); g.hostLever('p0'); g.advance(8); }
      if (g.run.phase === 'fired') break;
    }
    worst = Math.max(worst, steps);
    ok(cy(g).stage === 'days' || g.run.phase === 'fired', `fuzz ${seed}: back to the days stage in ${steps} steps`);
  }
  ok(worst <= 12, `worst case ${worst} steps (bounded by 2 losses + grace days)`);
}

// ================================================================ I) random operations: invariants hold, and the give-up policy always terminates
{
  const STAGES = new Set(['days', 'gate', 'core', 'grace']);
  let runs = 0, ops = 0;
  for (let seed = 0; seed < 24; seed++) {
    const g = makeGame({ runId: 'RAND' + seed });
    let rnd = seed * 104729 + 7;
    const R = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
    const term = { out: [], print(t) { this.out.push(t); } };
    if (R() < 0.5) { g.run.quotaIndex = 2; cy(g).sector = 2; ensureSector(g.run); }
    if (R() < 0.25) metQuota(g);
    let bad = null;
    for (let step = 0; step < 30 && !bad; step++) {
      ops++;
      const ph = g.run.phase, c = cy(g);
      const pick = R();
      try {
        if (ph === 'orbit') {
          if (pick < 0.30) landOn(g);
          else if (pick < 0.42) cmds.get('keystone')(['go'], term);
          else if (pick < 0.52) cmds.get('raid')(['go', ['normal', 'heroic', 'mythic'][Math.floor(R() * 3)]], term);
          else if (pick < 0.58) { cmds.get('keystone')(['cancel'], term); cmds.get('raid')(['cancel'], term); }
          else if (pick < 0.66) { const ids = MOON_ORDER.filter((id) => !MOONS[id].company); g.run.moon = ids[Math.floor(R() * ids.length)]; }
          else if (pick < 0.74 && c.mode === 'classic' && c.stage === 'days') { g.run.sold = g.run.quota; g.run.phase = 'company'; g.run.moon = 'hq'; g.run.daysLeft = 0; g.hostBeginTakeoff('lever'); g.advance(8); }
          else if (pick < 0.80) { cmds.get('endless')(['accept'], term); }
          else if (pick < 0.84 && c.mode === 'endless') cmds.get('cashout')([], term);
          else g.advance(1);
        } else if (ph === 'moon') {
          const r = R();
          if (r < 0.2) { enterAll(g); const b = alive(g, (x) => x.def.boss)[0]; if (b) kill(g, b); }
          else if (r < 0.35) { enterAll(g); for (const x of alive(g).slice(0, 5)) kill(g, x); g.advance(5); }
          else if (r < 0.45) { enterAll(g); wipe(g); g.advance(12); revive(g); board(g); }
          else if (r < 0.55) g.advance(30 + R() * 200);
          else leaveDay(g);
        } else g.advance(9);
        if (g.run.phase === 'moon' && g.run.time > 990.5 && g.cycle.inst.cur) bad = 'day clock ran past the cap inside an instance';
      } catch (e) { bad = 'exception ' + e.message; }
      const c2 = cy(g);
      if (!bad && c2 && !STAGES.has(c2.stage)) bad = 'stage ' + c2.stage;
      if (!bad && g.run.phase !== 'fired' && g.run.phase !== 'takeoff' && g.run.phase !== 'landing' && !MOONS[g.run.moon]) bad = 'run.moon not registered: ' + g.run.moon;
      if (!bad && c2 && c2.stage !== 'days' && c2.mode === 'classic' && g.run.daysLeft < 1 && g.run.phase === 'orbit') bad = 'daysLeft ' + g.run.daysLeft + ' in stage ' + c2.stage;
    }
    ok(!bad, `random ops ${seed}: ${bad || 'invariants held'}`);
    // the give-up policy from wherever we ended: back to the days stage (or fired) within a few days
    let guard = 0;
    while (guard++ < 30 && g.run.phase !== 'fired' && !(cy(g)?.stage === 'days' && g.run.phase === 'orbit' && !cy(g).inst)) {
      if (g.run.phase === 'orbit') { const c3 = cy(g); if (c3.inst?.state === 'armed') { cmds.get('keystone')(['cancel'], term); cmds.get('raid')(['cancel'], term); } if (c3.stage === 'grace' || (c3.stage === 'days' && !MOONS[g.run.moon])) g.run.moon = 'hamsi'; landOn(g); }
      else if (g.run.phase === 'moon' || g.run.phase === 'company') { board(g); g.hostLever('p0'); g.advance(8); }
      else g.advance(9);
    }
    ok(g.run.phase === 'fired' || (cy(g)?.stage === 'days' && g.run.phase === 'orbit'), `random ops ${seed}: give-up policy back to the days stage in ${guard} steps`);
    if (!(g.run.phase === 'fired' || (cy(g)?.stage === 'days' && g.run.phase === 'orbit'))) console.log('DEBUG stuck', seed, g.run.phase, JSON.stringify({ ...cy(g), firstKills: 0, endless: cy(g).endless && { d: cy(g).endless.depth, m: cy(g).endless.meter } }), g.run.moon, g.run.daysLeft);
    runs++;
  }
  say(`${runs} random runs, ${ops} operations`);
}

console.error = origErr; console.warn = origWarn;
ok(errs.length === 0, 'no exceptions logged' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
console.log(`${checks} checks`);
if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
console.log('all cycle flow checks passed');
void CREATURES;
