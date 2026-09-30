import assert from 'node:assert/strict';
import { inPrintLane, quietStep, TUNE } from '../../src/game/threats13_core.js';
import { renderThreat13Sound } from '../../src/game/threats13_sfx.js';
import { poolFor, NEW_IDS, newCap } from '../../src/game/threatpool.js';
const o = { x: 0, y: 0, z: 0 };
assert(inPrintLane({ x: 0.2, y: 0, z: 8 }, o, 0));
assert(!inPrintLane({ x: 1, y: 0, z: 8 }, o, 0));
assert(!inPrintLane({ x: 0, y: 4, z: 8 }, o, 0));
assert(inPrintLane({ x: 8, y: 0, z: 0 }, o, Math.PI / 2));
assert(!inPrintLane({ x: 0, y: 0, z: -1 }, o, 0));
assert.equal(quietStep(0.4, { noise: 0.7 }, 0.2), 0);
assert(quietStep(0.4, { noise: 0, voice: 0 }, 0.2) >= TUNE.quietTime);
for (const q of [0, 1, 2, 3]) for (let seed = 0; seed < 250; seed++) {
  const pool = poolFor({ seed, quotaIndex: q }, { id: 'test', creatures: {} });
  assert(pool.ids.filter(id => NEW_IDS.has(id)).length <= newCap(q));
  if (q < 2) assert(!pool.ids.some(id => id.startsWith('c13_')));
}
for (const kind of ['c13_print_load', 'c13_print_fire', 'c13_checksum_scan', 'c13_checksum_clear']) {
  const a = renderThreat13Sound(kind, 16000);
  assert(a.length > 1000 && a.every(Number.isFinite));
  assert(Math.max(...a.map(Math.abs)) < 0.8);
}
console.log('threats13: lane escape, quiet cancellation, early rule caps and audio pass');

// Exercise the real horror director: a silent seeker is not a chase, its targeted scan is.
const THREE = await import('three');
const { installDirector } = await import('../../src/game/director.js');
const p = { id: 'crew', pos: new THREE.Vector3(0, -300, 0), dead: false, inShip: false };
const c = { type: 'c13_checksum', state: 'seek', pos: new THREE.Vector3(0, -300, 1), def: { hp: 85 }, data: { target: 'crew' } };
const g = { isHost: true, selfId: 'crew', run: { phase: 'moon', seed: 1, time: 480, moon: 'hamsi', day: 1 }, hostData: {}, world: { facility: { layout: { y: -300 }, mainDoor: { pos: new THREE.Vector3(10, -300, 0) } } }, creatures: { host: new Map([['checksum', c]]) }, player: { hp: 100, maxHp: 100 }, lights: { globalDim: 1 }, aiPlayers: () => [p], net: { on_: () => {}, sendTo: () => {} } };
const dir = installDirector(g);
dir.hostUpdate(0.6);
assert.equal(dir.debug().players[0].chase, 0);
c.state = 'scan'; dir.hostUpdate(1.1);
assert(dir.debug().players[0].chase > 0.9);
c.data.target = 'someone-else'; dir.hostUpdate(1.1);
assert.equal(dir.debug().players[0].chase, 0);
dir.dispose();
console.log('threats13: real director recognizes targeted machine telegraphs');
