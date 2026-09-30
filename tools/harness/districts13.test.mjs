// [labyrinths] node checks for the new labyrinth interiors (metro / greenhouse) + hero rooms + moon mapping:
//   every cell reachable from the entrance (locked doors closed), a fire exit exists, tunnel / alcoves exist, ALL vine plugs closed at once keep the
//   level connected, nav path entrance -> fire exit after the real build, hero rooms appear on the older themes, pure train rules.
//   node tools/harness/labyrinths.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent("export async function load(u, c, n) { if (u.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true }; return n(u, c); }"));   // ui modules import .css
globalThis.window = globalThis;
const realWarn = console.log;
console.warn = console.error = () => {};
globalThis.addEventListener = globalThis.removeEventListener = () => {};
const cv = () => ({ width: 0, height: 0, style: {}, querySelector: () => cv(), querySelectorAll: () => [], children: [], insertBefore() {}, appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, getContext: () => new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} }) : (k === 'getImageData' || k === 'createImageData') ? () => ({ data: new Uint8ClampedArray(1 << 22), width: 64, height: 64 }) : () => {}, set: () => true }) });
globalThis.document = { createElement: () => cv(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} }, addEventListener() {}, head: { appendChild() {} }, activeElement: null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { generateLayout, buildFacility, THEMES } = await import('../../src/world/facility.js');
const { MOONS } = await import('../../src/game/moons.js');
const K = await import('../../src/game/districts13_core.js');
const { dressDistrictReturn } = await import('../../src/world/districts13.js');
const { routeQ } = await import('../../src/game/routeboard_core.js');
await import('../../src/world/worlds2_data.js');   // registers the fixed moons (Panelka = tower)
let BOXES = null;
const mkPhysics = () => ({ addStaticBox(x, y, z, hx, hy, hz, rot) { const b = { x, y, z, hx, hy, hz, rot }; BOXES?.push(b); return b; }, removeCollider() {} });
const { checkStairs } = await import('../../src/world/stairs.js');
const lightPool = { add(e) { return e; }, remove() {} };
let fails = 0;
const bad = (m) => { fails++; realWarn('FAIL', m); };
const okc = (c, m) => { if (!c) bad(m); };


for (const theme of K.THEMES13) for (const seed of [1234, 987, 40417, 777]) {
  const layout = generateLayout(seed, theme, 0.95);
  const facility = buildFacility(layout, { physics: mkPhysics(), lightPool });
  okc(facility.lab?.stations.length === 3, `${theme}/${seed}: three stations`);
  const marks = dressDistrictReturn(facility);
  okc(marks.count > 0 && marks.count <= 72, `${theme}/${seed}: bounded return markers`);
  for (const s of facility.lab.stations) {
    const cell = facility.cellAt(s.x, s.z);
    okc(marks.distance[cell] >= 0, `${theme}/${seed}: station connected to entrance`);
    const start = facility.mainDoor.spawn;
    okc(facility.nav.findPath(start.x, start.z, s.x, s.z, 60000), `${theme}/${seed}: station navigable`);
  }
  facility.dispose(mkPhysics());
}
okc(routeQ(MOONS.echo13) === 1 && routeQ(MOONS.ember13) === 2, 'real route unlocks');
okc(K.advanceStation('echoregistry', [0,0,0], 2) === null, 'archive rejects out of order');
let values = [0,0,0], result;
for (const i of [0,1,2]) { result = K.advanceStation('echoregistry', values, i); values = result.values; }
okc(result.completed === 3 && K.advanceStation('echoregistry', values, 2) === null, 'archive cannot reward twice');
values = [0,0,0];
for (const i of [2,0,1]) for (let j=0;j<4;j++) { result = K.advanceStation('embercache', values, i); values = result.values; }
okc(result.completed === 3 && K.advanceStation('embercache', values, 0) === null, 'foundry independently solvable, cannot reward twice');

// Exercise the real network request path: distance/death/zone/token checks and one-shot credit awards.
const { installDistricts13 } = await import('../../src/game/districts13.js');
const listeners = new Map(), handlers = {}, messages = [];
const player = { id: 'host', pos: { x: 0, y: -300, z: 0 }, zone: 'in', dead: false };
const game = {
  selfId: 'host', isHost: true, time: 0, run: { phase: 'moon', moon: 'echo13', seed: 4, day: 1, credits: 0 },
  world: { facility: { lab: { id: 'echoregistry', stations: [0,1,2].map(i => ({ i, x: i, y: -298.7, z: 0 })) } } },
  aiPlayers: () => [player], broadcastRun() {},
  mods: { on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); } },
  net: { on() {}, off() {}, broadcast(name, payload) { messages.push([name, payload]); } },
};
const api = installDistricts13(game);
listeners.get('registerHandlers')((name, fn) => { handlers[name] = fn; }, game);
listeners.get('mapLoaded')(game.world, game);
const token = 'echo13:4:1', act = i => { game.time++; handlers.d13req({ token, i }, 'host'); };
player.pos.x = 99; act(0); okc(api.state().n === 0, 'host rejects distant requests');
player.pos.x = 0; player.dead = true; act(0); okc(api.state().n === 0, 'host rejects dead requests');
player.dead = false; player.zone = 'out'; act(0); okc(api.state().n === 0, 'host rejects outside requests');
player.zone = 'in'; handlers.d13req({ token: 'old', i: 0 }, 'host'); okc(api.state().n === 0, 'host rejects stale-map requests');
act(2); okc(api.state().n === 0 && game.run.credits === 0, 'wrong packet never pays or resets');
for (const i of [0,1,2,0,1,2]) act(i);
okc(api.state().done && game.run.credits === 105, 'host pays only three stations and final bonus once');
listeners.get('phase')('orbit', game); okc(game.run.district13 === null, 'orbit clears map-specific progress');
game.run.phase = 'moon'; game.run.moon = 'ember13'; game.world.facility.lab.id = 'embercache';
listeners.get('mapLoaded')(game.world, game);
game.player = { indoor: true, dead: false, pos: { x: 0, y: -300, z: 0 } };
let controls = []; listeners.get('interactables')(controls, game);
okc(controls.length === 6, 'local player without zone gets two cooling controls per station');
game.player.indoor = false; controls = []; listeners.get('interactables')(controls, game);
okc(controls.length === 0, 'outside local player gets no indoor controls');
const coolingAct = (i, op) => { game.time++; handlers.d13req({ token: 'ember13:4:1', i, op }, 'host'); };
const target0 = K.coolingTarget(4, 0, 0);
while (api.state().dials[0] === target0) coolingAct(0, 'dial');
coolingAct(0, 'seal'); okc(api.state().values[0] === 0, 'wrong pressure choice preserves cooling progress');
for (const i of [2,0,1]) for (let step=0;step<4;step++) {
  while (api.state().dials[i] !== K.coolingTarget(4, i, step)) coolingAct(i, 'dial');
  coolingAct(i, 'seal');
}
okc(api.state().done && game.run.credits === 210, 'dial choice calibration completes each station and pays once');
api.dispose(); okc(listeners.size === 0, 'lifecycle listeners disposed');

realWarn(`districts13: ${fails ? 'FAIL' : 'PASS'} (${fails} failures)`);
process.exitCode = fails ? 1 : 0;
