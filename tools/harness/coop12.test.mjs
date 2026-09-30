// COOP 12 tests (pure node, wave 12, docs/wave12/coop12.md): node tools/harness/coop12.test.mjs
//  1. rules: sync / lift speed, fall damage + floor, heavy door state machine, buddy bond hysteresis, high-five pairing
//  2. module smoke (fake game): bond forms + broadcasts, downed revive multiplier, door hold / warn / slam, giant fall, high-five host flow
//  3. items + strings: giant defs, loot tables, TR + RU for every new key
import * as C from '../../src/game/coop12_core.js';
import { installCoop12 } from '../../src/game/coop12.js';
import { KEYS } from '../../src/game/coop12_text.js';
import { ITEMS, SCRAP_TABLE } from '../../src/game/items.js';
import { tIn } from '../../src/core/i18n.js';
import { MOONS } from '../../src/game/moons.js';
const MOON = Object.keys(MOONS).find((k) => !MOONS[k].company && !MOONS[k].home);

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// 1. rules
ok(C.syncOf({ x: 2, z: 0 }, { x: 2, z: 0 }) > 0.95 && C.syncOf({ x: 0, z: 0 }, { x: 0.1, z: 0 }) === 1, 'same way, same speed = full sync; both still = calm');
ok(C.syncOf({ x: 2, z: 0 }, { x: -2, z: 0 }) < 0.05 && C.syncOf({ x: 2, z: 0 }, { x: 0, z: 2 }) < 0.6, 'opposite / crossing = low sync');
ok(C.syncOf({ x: 3, z: 0 }, { x: 0, z: 0 }) < 0.4 && C.syncOf({ x: 2, z: 0 }, { x: 1, z: 0 }) < C.syncOf({ x: 2, z: 0 }, { x: 2, z: 0 }), 'one pulls, one stands = drag; speed mismatch costs sync');
ok(C.syncOf({ x: 2, z: 0 }, { x: 0, z: 2 }, true) > C.syncOf({ x: 2, z: 0 }, { x: 0, z: 2 }, false), 'buddies read each other');
ok(C.liftSpeed(1) <= 0.95 && C.liftSpeed(0) >= 0.3 && C.liftSpeed(0.5) > C.liftSpeed(0.2) && C.LIFT.soloSpeed < C.liftSpeed(0), 'lift speed: pair always beats a solo drag, never above 1');
ok(C.syncWord(0.9) === 'SYNC' && C.syncWord(0.5) === 'DRIFT' && C.syncWord(0.1) === 'FIGHTING IT', 'sync words');
{ const st = {}; C.velStep(st, 0, 0, 0.1); C.velStep(st, 0.3, 0, 0.1); ok(st.x > 0 && st.x <= 3, 'velocity sample'); C.velStep(st, 90, 0, 0.1); ok(st.x <= 3, 'teleport ignored'); }
ok(C.fallPct(0.5) === 0 && C.fallPct(1) > 0 && C.fallPct(3) > C.fallPct(1) && C.fallPct(50) <= C.FALL.max, 'fall damage grows with height, capped');
ok(C.lossOf(500, 500, 0.5) === 250 && C.lossOf(500, 190, 0.5) === 15 && C.lossOf(500, 175, 0.5) === 0, 'loss never below 35 % of the base');
{
  const st = {}; let h = 0;
  C.fallStep(st, 3, 0.1, false);                                  // first sample: no damage
  for (const y of [2.6, 1.8, 0.9, 0.35, 0.35, 0.35, 0.35]) h = Math.max(h, C.fallStep(st, y, 0.1, false));
  ok(h > 2.5 && h < 2.8, 'fall height measured on landing: ' + h);
  const st2 = {}; C.fallStep(st2, 9, 0.1, true); C.fallStep(st2, 0.3, 0.1, false); let h2 = 0; for (let i = 0; i < 4; i++) h2 = Math.max(h2, C.fallStep(st2, 0.3, 0.1, false));
  ok(h2 === 0, 'picked up high, put down low: no phantom fall');
}
const door = { id: 'd1', pos: { x: 10, y: 0, z: 10 }, info: { dir: 1 } };
ok(C.leverPoints(door).length === 2 && Math.abs(C.leverPoints(door)[0].x - 11.65) < 1e-6, 'lever spots along the wall');
ok(C.holdOk(door, { x: 11.6, y: 0, z: 11 }) && !C.holdOk(door, { x: 10, y: 0, z: 10 }) && !C.holdOk(door, { x: 10.2, y: 0, z: 10.3 }) && !C.holdOk(door, { x: 20, y: 0, z: 10 }), 'lever hold: near a lever, never from the doorway, not far away');
{
  const st = {}; let now = 0; const step = (o) => C.doorStep(st, { open: true, held: false, busy: false, enabled: true, now, ...o });
  ok(step() === null, 'fresh door: grace');
  now = 5; ok(step() === null, 'still grace');
  now = 9.5; ok(step({ held: true }) === null, 'held keeps it open');
  now = 9.7; ok(step() === 'warn', 'nobody holds: warn first (telegraph)');
  now = 10.0; ok(step() === null, 'warn only once');
  now = 10.75; ok(step({ busy: true }) === null, 'someone in the doorway: never slam');
  now = 11.0; ok(step() === 'warn', 'busy restarted the timer (a new telegraph starts)');
  now = 12.2; ok(step() === 'close', 'slam after the telegraph');
  const st2 = {}; ok(C.doorStep(st2, { open: false, held: true, busy: false, enabled: true, now: 1 }) === 'open', 'lever opens a closed door');
  ok(C.doorStep({}, { open: false, held: false, busy: false, enabled: false, now: 1 }) === 'open', 'lone player: a closed unlocked door opens itself');
  ok(C.doorStep({}, { open: true, held: false, busy: false, enabled: false, now: 100 }) === null, 'lone player: never slammed');
}
{
  const b = new C.BondBook(), P = (ax, bx) => [{ id: 'a', x: ax, y: 0, z: 0 }, { id: 'b', x: bx, y: 0, z: 0 }];
  let formed = 0; for (let i = 0; i < 70; i++) formed += b.step(0.5, P(0, 5)).formed.length;   // 35 s together
  ok(formed === 1 && b.bonded('a', 'b') && b.buddyOf('a') === 'b', 'bond forms after ~30 s within 8 m');
  let lost = 0; for (let i = 0; i < 60; i++) lost += b.step(0.5, P(0, 30)).lost.length;   // 30 s apart
  ok(lost === 0 && b.bonded('a', 'b'), 'splitting up for a while keeps the bond');
  for (let i = 0; i < 100; i++) lost += b.step(0.5, P(0, 30)).lost.length;
  ok(lost === 1 && !b.bonded('a', 'b'), 'a long split lets it decay');
  const b2 = new C.BondBook(); for (let i = 0; i < 70; i++) b2.step(0.5, P(0, 5));
  for (let i = 0; i < 200; i++) b2.step(0.5, [{ id: 'a', x: 0, y: 0, z: 0, frozen: true }, { id: 'b', x: 30, y: 0, z: 0 }]);
  ok(b2.bonded('a', 'b'), 'a downed buddy freezes the bond (revive benefit stays)');
  const b3 = new C.BondBook(); const tri = (bx, cx) => [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: bx, y: 0, z: 0 }, { id: 'c', x: cx, y: 0, z: 0 }];
  for (let i = 0; i < 100; i++) b3.step(0.5, tri(3, 4));
  ok(b3.pairs().length === 1, 'one buddy each: three players never make two overlapping bonds');
  ok(C.reviveMul(true) < 1 && C.reviveMul(false) === 1, 'revive multiplier');
}
{
  const hf = new C.HighFiveBook(), info = { dist: 1.5, faceA: true, faceB: true };
  ok(hf.offer('a', 'b', 0) === 'hand' && hf.offer('a', 'b', 0.2) === null, 'first offer announces the hand');
  ok(!hf.match('a', 'b', 0.3, info), 'one hand alone is not a high-five');
  hf.offer('b', 'a', 0.3);
  ok(!hf.match('a', 'b', 0.3, { ...info, faceB: false }) && !hf.match('a', 'b', 0.3, { ...info, dist: 4 }), 'both must face each other and be close');
  ok(hf.match('a', 'b', 0.35, info), 'both hands out, facing, close: high five');
  hf.offer('a', 'b', 1); hf.offer('b', 'a', 1);
  ok(!hf.match('a', 'b', 1.1, info), 'pair cooldown');
  ok(C.facing(0, { x: 0, z: 0 }, { x: 0, z: -3 }) && !C.facing(0, { x: 0, z: 0 }, { x: 0, z: 3 }), 'camera yaw 0 faces -z');
}

// 2. module smoke
{
  const handlers = new Map(), H = new Map(), sent = [], dmg = [], doorCalls = [];
  const mods = { on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); return () => {}; }, emit(ev, ...a) { for (const f of handlers.get(ev) || []) f(...a); } };
  const items = new Map();
  const vdoor = { id: 'v1', kind: 'vault', locked: false, open: true, t: 1, pos: { x: 10, y: 0, z: 10 }, info: { dir: 1 } };
  const remote = (x, z, yaw = 0) => ({ pos: { x, y: 0, z }, yaw, dead: false });
  const game = {
    mods, isHost: true, selfId: 'h', time: 0, run: { phase: 'moon', moon: MOON },
    net: { broadcast: (k, d) => sent.push([k, d]), request: (k, d) => H.get(k)?.(d, game._from || 'h'), on_() {}, on() {}, off() {}, sendTo() {} },
    items: { get: (id) => items.get(id), all: () => items.values() },
    world: { facility: { doors: [vdoor] } },
    hostSetDoor: (id, open) => { doorCalls.push([id, open]); vdoor.open = open; },
    hostDamageItem: (id, n) => { dmg.push([id, n]); items.get(id).value -= n; },
    player: { pos: { x: 0, y: 0, z: 0 }, yaw: Math.PI, dead: false, stamina: 50, maxStamina: 100, heldItem: () => null },
    remotes: new Map([['a', remote(1.5, 0, 0)]]), playerName: (id) => id, ui: { toast() {} }, audio: {}, engine: {}, downed: { isDowned: () => false },
  };
  const api = installCoop12(game);
  mods.emit('registerHandlers', (k, fn) => H.set(k, fn), game);
  const fxs = (k) => sent.filter(([m, d]) => m === 'c12fx' && d.k === k).map(([, d]) => d);
  const tick = (n, dt = 0.5) => { for (let i = 0; i < n; i++) mods.emit('update', dt, game); };
  // bond: h at 0, a at 1.5
  tick(70);
  ok(fxs('bond').length >= 1 && fxs('bond').at(-1).l.length === 1, 'bond formed and broadcast');
  ok(api.bondMul('h', 'a') < 1 && api.bondMul('h', 'zz') === 1 && api.isBuddy('h', 'a'), 'downed hook: reviver multiplier only for the buddy');
  // heavy door: h at the lever, a far from the doorway but near the door (enabled = 2 living crew within 30 m)
  game.player.pos = { x: 11.6, y: 0, z: 11.2 }; game.remotes.get('a').pos = { x: 6, y: 0, z: 12 };
  H.get('c12q')({ op: 'door', id: 'v1', on: 1 }, 'h');
  ok(api.state.doors.get('v1')?.held.has('h'), 'lever hold registered');
  vdoor.open = false; tick(1, 0.12);
  ok(doorCalls.some(([, o]) => o === true), 'holding the lever opens a closed door');
  const n0 = fxs('slam').length; game.remotes.get('a').pos = { x: 6, y: 0, z: 12 };
  for (let i = 0; i < 100; i++) { game.remotes.get('a').pos = { x: 6, y: 0, z: 12 }; mods.emit('update', 0.12, game); }
  ok(fxs('warn').length >= 1 && fxs('slam').length === n0 + 1 && vdoor.open === false, 'lever released: warn, then slam (' + fxs('warn').length + '/' + (fxs('slam').length - n0) + ')');
  // a partner walks away: the door is not enforced for lone players
  game.remotes.get('a').pos = { x: 100, y: 0, z: 100 }; tick(3, 0.12);
  ok(vdoor.open === true, 'partner out of range: the door opens itself, nobody is locked out');
  // giant fall
  const it = { id: 'g1', holder: null, state: 'world', def: ITEMS.cg_like, value: 600, baseValue: 600, lastHolder: 'h', obj: { position: { x: 0, y: 3, z: 0 } } };
  items.set('g1', it);
  it.holder = 'h'; it.state = 'held'; tick(1, 0.12);
  it.holder = null; it.state = 'world';
  for (const y of [3, 2.6, 1.8, 0.9, 0.4, 0.4, 0.4, 0.4]) { it.obj.position.y = y; tick(1, 0.12); }
  ok(dmg.length === 1 && dmg[0][1] > 0 && it.value >= 210 && fxs('smash').length === 1, 'dropped from ~3 m: value lost within the floor, smash fx');
  // high five
  game.remotes.get('a').pos = { x: 0, y: 0, z: -1.5 }; game.remotes.get('a').yaw = Math.PI;   // a faces +z toward h; h yaw pi faces +z... place h looking at a
  game.player.pos = { x: 0, y: 0, z: 0 }; game.player.yaw = 0;   // h faces -z, a is at -1.5 z; a yaw pi faces +z
  game._from = 'h'; game.net.request('c12q', { op: 'hf', to: 'a', on: 1 });
  game._from = 'a'; game.net.request('c12q', { op: 'hf', to: 'h', on: 1 });
  ok(fxs('hand').length >= 1 && fxs('hf').length === 1, 'high-five host flow: hands announced, pair matched');
  game._from = 'h'; game.net.request('c12q', { op: 'hf', to: 'a', on: 1 }); game._from = 'a'; game.net.request('c12q', { op: 'hf', to: 'h', on: 1 });
  ok(fxs('hf').length === 1, 'high-five cooldown');
  api.dispose();
}

// 3. items + strings
for (const d of C.GIANT_DEFS) {
  ok(ITEMS[d.id]?.hands === 2 && ITEMS[d.id].giant && ITEMS[d.id].bulky && ITEMS[d.id].fragile > 0 && ITEMS[d.id].value[0] >= 300, d.id + ' registered (2 hands, giant, bulky, valuable)');
  ok(tIn('tr', d.name) !== d.name && tIn('ru', d.name) !== d.name, 'name TR/RU ' + d.id); ok(tIn('tr', d.tip) !== d.tip && tIn('ru', d.tip) !== d.tip, 'tip TR/RU ' + d.id);
}
for (const [th, rows] of Object.entries(C.GIANT_LOOT)) for (const [id] of rows) ok(SCRAP_TABLE[th]?.some((e) => e[0] === id), `loot ${id} in ${th}`);
for (const k of KEYS) { ok(tIn('tr', k) !== k, 'missing TR: ' + k.slice(0, 40)); ok(tIn('ru', k) !== k, 'missing RU: ' + k.slice(0, 40)); }

console.log(`coop12: ${fails.length ? 'FAIL' : 'ok'}`);
for (const f of fails) console.log('  x ' + f);
process.exit(fails.length ? 1 : 0);
