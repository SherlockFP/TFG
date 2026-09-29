// node tools/harness/zones_host.test.mjs
// Wave 5 ZONES: mock-game host flows: cores, clear timer, plant hold, build / sell / upgrade, day tick (income cap + upkeep), quota-2 vote, auto-resolve, live defence win + loss.
import * as THREE from 'three';
import { setInteriorProbe } from '../../src/game/moongen.js';
import { MOONS } from '../../src/game/moons.js';
import { INTERIOR_THEMES } from '../../src/world/facility.js';
import { Terrain, planMoon } from '../../src/world/terrain.js';
import * as Z from '../../src/game/zones_core.js';
import { installZones } from '../../src/game/zones.js';

setInteriorProbe((id) => INTERIOR_THEMES.includes(id));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

const handlers = new Map(), sent = [], later = [], listeners = {}, cmds = new Map();
const mods = { on: (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; }, emit: (ev, ...a) => (listeners[ev] || []).forEach((f) => f(...a)), commands: cmds, api: { registerCommand: (n, fn) => cmds.set(n, fn) } };
const moon = MOONS.hamsi, seed = 4711, plan = planMoon(seed, moon), ter = new Terrain(seed, moon, plan);
const run = { phase: 'moon', moon: 'hamsi', seed, day: 2, daysLeft: 3, quota: 130, quotaIndex: 0, sold: 0, credits: 400, runId: 'RUNM', forecast: {}, time: 600, upgrades: {} };
const bcast = [];
const net = { isHost: true, hostId: 'me', selfId: 'me', broadcast: (t, d) => { sent.push([t, d]); }, sendTo: (to, t, d) => { sent.push([t, d, to]); }, request: (a, d) => handlers.get(a)?.({ a, ...d }, 'me'), on() {}, off() {} };
const me = { id: 'me', pos: new THREE.Vector3(0, 0, 0), dead: false, inShip: false, zone: 'out' };
const placed = [], destroyed = [];
let cid = 0;
const game = {
  isHost: true, selfId: 'me', mods, net, run, config: {}, scene: new THREE.Scene(), time: 0, profile: {}, player: { indoor: false, dead: false, pos: me.pos }, remotes: new Map(),
  world: { terrain: ter, outdoor: {}, facility: null }, items: { hostSpawn: () => 'i' },
  creatures: {
    host: new Map(), views: new Map(), speedMul: (c, s) => s, attack() {}, kill(c) { c.dead = true; this.host.delete(c.id); },
    hostSpawn(type, pos) { const c = { id: 'c' + ++cid, type, pos: pos.clone(), dead: false, def: { dmg: 9, siege: true }, maxHp: 50, state: 'run', data: {}, setState(s) { this.state = s; }, cooldown: 0, age: 5, t: 1, level: 1, dmg: 5, yaw: 0, stunT: 0, slowT: 0 }; this.host.set(c.id, c); return c; },
  },
  deployables: { debugPlace: (ty, x, z) => { const d = { id: 'd' + placed.length, def: { supply: ['x', 1], hx: 0.5, hz: 0.5 }, res: 9, pos: { x, z } }; placed.push([ty, d]); return d; }, destroy: (id) => destroyed.push(id), nearest: () => null, get: () => null, damage() {} },
  broadcastRun(k) { bcast.push(k); }, applyRunState() {}, hostFinishTakeoff() { this.run.phase = 'orbit'; this.run.day += 1; }, hostSave() {},
  later: (fn, ms) => { later.push([fn, ms]); return later.length; }, aiPlayers: () => [me], aiPlayerById: (id) => (id === 'me' ? me : null),
  ui: { toast() {}, hud: { bigText() {} } }, sfx() {}, lore: null,
};
const api = installZones(game);
ok(api, 'installZones returns an api');
mods.emit('registerHandlers', (a, fn) => handlers.set(a, fn), game);
ok(handlers.has('znreq') && cmds.has('zones'), 'znreq handler + ZONES command registered');
mods.emit('hostStart', game);
api.hostComputeCores();
const spec = api.zoneSpec('hamsi'), cores = api.cores();
ok(cores.length === spec.n, `all ${spec.n} cores placed on the landing terrain`);
const tick = (sec, dt = 0.25) => { for (let i = 0; i < sec / dt; i++) mods.emit('update', dt, game); };
const denies = () => sent.filter((s) => s[0] === 'znx' && s[1].k === 'deny').map((s) => s[1].why);
const A = cores.find((c) => c.id === 'A'), B = cores.find((c) => c.id === 'B');
const req = (d) => handlers.get('znreq')(d, 'me');
// too early: the relay is still scanning
me.pos.set(A.x + 2, A.y, A.z); tick(5);
sent.length = 0; req({ op: 'plant', z: 'A' });
ok(denies().some((d) => /scanning|clear/i.test(d)), 'plant refused before the area was clear for 20 s: ' + denies());
tick(22);
sent.length = 0; req({ op: 'plant', z: 'A' });
ok(!denies().length, 'plant accepted after 20 s clear');
tick(2); ok(!api.state().m.hamsi, 'not owned mid-plant (4 s hold)');
const c0 = run.credits;
tick(4);
const stA = api.state().m.hamsi?.A;
ok(stA?.s === 'own' && run.credits < c0, 'zone A owned + beacon paid: ' + JSON.stringify(stA) + ' credits ' + c0 + ' -> ' + run.credits);
ok(bcast.some((k) => k.includes('zn')), 'run.zn broadcast');
// a hostile near B blocks the timer and the planting
me.pos.set(B.x + 2, B.y, B.z);
game.creatures.hostSpawn('sg_swarmer', new THREE.Vector3(B.x + 8, B.y, B.z));
tick(30);
sent.length = 0; req({ op: 'plant', z: 'B' });
ok(denies().length > 0, 'hostile near the core blocks planting: ' + denies());
for (const c of [...game.creatures.host.values()]) game.creatures.kill(c);
// build / sell / upgrade
me.pos.set(A.x + 3, A.y, A.z);
const cr = run.credits;
req({ op: 'build', z: 'A', def: 'turret1' });
ok(api.state().m.hamsi.A.d.turret1 === 1 && run.credits === cr - Z.DEFS.turret1.cost && placed.some((p) => p[0] === 'turret1'), 'build turret: state + credits + deployable placed');
sent.length = 0; req({ op: 'build', z: 'A', def: 'turret3' });
ok(denies().length === 1 && !api.state().m.hamsi.A.d.turret3, 'locked defence refused');
me.pos.set(A.x + 60, A.y, A.z);
req({ op: 'build', z: 'A', def: 'barr_wood' });
ok(!api.state().m.hamsi.A.d.barr_wood, 'cannot build outside the zone');
me.pos.set(A.x + 3, A.y, A.z);
req({ op: 'sell', z: 'A', def: 'turret1' });
ok(!api.state().m.hamsi.A.d.turret1 && run.credits === cr - Z.DEFS.turret1.cost + Math.floor(Z.DEFS.turret1.cost / 2), 'sell refunds half');
run.credits += 1000;
req({ op: 'build', z: 'A', def: 'turret1' }); req({ op: 'build', z: 'A', def: 'turret1' });
ok(api.state().m.hamsi.A.d.turret1 === 2, 'two turrets');
req({ op: 'up', m: 'hamsi', z: 'A' });
ok(api.state().m.hamsi.A.up === 1, 'zone upgrade');
// day tick: income capped, upkeep paid, no attack in quota 1
run.phase = 'takeoff'; const cBefore = run.credits;
game.hostFinishTakeoff();   // the module wraps it: the day tick runs by itself when the day advanced
const rep = api.state().rep;
ok(rep && rep.n === 1 && rep.income > 0 && rep.income <= Z.dailyCap(130) && rep.upkeep === 12, 'day tick: income within cap + upkeep paid ' + JSON.stringify(rep));
ok(run.credits === cBefore + rep.income - rep.upkeep, 'credits = before + income - upkeep');
ok(api.state().pend.length === 0, 'no counter-attack in quota 1');
// quota 2: the Algorithm votes; the crew is elsewhere -> auto-resolve next day
run.quotaIndex = 1; run.day += 1; api.dayTick();
ok(api.state().pend.length === 1 && api.state().pend[0].z === 'A', 'quota 2: attack vote on the only owned zone');
ok(sent.some((s) => s[0] === 'znx' && s[1].k === 'algo' && s[1].kind === 'vote'), 'Algorithm intercom vote line broadcast');
run.day += 1; api.dayTick();
const after = api.state().m.hamsi.A;
ok(after.s === 'own' || after.s === 'inf', 'auto-resolve settled: ' + after.s);
// live defence at dusk: crew on the moon, pending attack on A
after.s = 'own'; api.state().pend = [{ m: 'hamsi', z: 'A', d: run.day }];
run.phase = 'moon'; run.time = Z.ZN.dusk + 1; me.pos.set(A.x + 3, A.y, A.z); api.hostComputeCores(); tick(1);
ok(api.live() && api.live().z === 'A', 'live defence starts at dusk when the crew is on the moon');
let guard = 0, spawnedMax = 0;
while (api.live() && guard++ < 2400) { tick(0.5, 0.5); spawnedMax = Math.max(spawnedMax, game.creatures.host.size); for (const c of [...game.creatures.host.values()]) game.creatures.kill(c); }
ok(!api.live() && spawnedMax > 0, `live defence ran 2 waves and ended (${guard} steps, max ${spawnedMax} raiders)`);
ok(api.state().m.hamsi.A.s === 'own' && api.state().pend.length === 0 && api.state().stat.held >= 1, 'crew killed every raider: zone held + bonus');
// a lost live defence infects the zone
api.state().pend = [{ m: 'hamsi', z: 'A', d: run.day }]; run.time = Z.ZN.dusk + 1; tick(1);
ok(api.live(), 'second live defence started');
let g2 = 0; while (api.live() && g2++ < 2400) { api.live().hp = 0; tick(0.5, 0.5); }
ok(api.state().m.hamsi.A.s === 'inf', 'core destroyed: zone infected');
run.phase = 'orbit'; const b4 = run.credits; api.dayTick();
ok(run.credits - b4 <= 0, 'infected zone pays no income: ' + (run.credits - b4));
const snap = api.snapshot();
ok(snap.moons.some((m) => m.id === 'hamsi' && m.zones.length === spec.n), 'panel snapshot lists the moon + zones');
api.dispose();
say('mock-game host flows: cores, clear timer, plant hold, build/sell/upgrade, day tick, quota-2 vote, auto-resolve, live defence win + loss, snapshot');
console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
