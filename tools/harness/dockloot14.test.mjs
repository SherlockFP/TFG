import assert from 'node:assert/strict';
import { installChests } from '../../src/game/chests.js';
import { ShipScreens } from '../../src/game/screens.js';

// The dock is deliberately flat and does not implement expedition Terrain path generation.
const messages = [], previous = console.warn;
console.warn = (...args) => messages.push(args);
const system = installChests({}, {});
try {
  system.onMapLoaded({ moonId: '__relay13', seed: 1, outdoor: { terrain: { heightAt: () => -1.25, scale: 1 } } });
  assert.deepEqual(system.list(), [], 'no random expedition loot at the social dock');
  assert.deepEqual(messages, [], 'dock loading never calls the absent path API');
} finally { system.dispose(); console.warn = previous; }
console.log('dockloot14: social dock skips expedition chest generation without terrain warnings');

const boxes = [], exits = [];
const ctx = new Proxy({ fillRect: (...args) => boxes.push(args), strokeRect: (...args) => exits.push(args) }, { get: (obj, key) => obj[key] ?? (() => {}) });
const radar = { c: { width: 160, height: 120 }, ctx, t: {} };
const game = { selfId: 'host', terminal: {}, player: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 }, profile: { name: 'Crew' }, world: { outdoor: {} }, creatures: { views: new Map() }, items: { all: () => [] }, remotes: new Map() };
ShipScreens.prototype.drawRadar.call({ game, radar, crt() {} });
assert.equal(exits.length, 0, 'dock has no expedition exit marker');
assert.ok(boxes.some(([, , w, h]) => w === 14 && h === 8), 'radar retains its ship marker');
assert.equal(radar.t.needsUpdate, true);
game.world.outdoor.mainExit = { pos: { x: 12, z: 20 } };
ShipScreens.prototype.drawRadar.call({ game, radar, crt() {} });
assert.equal(exits.length, 1, 'ordinary moon radar still draws its exit');
console.log('dockloot14: actual radar renders dock and ordinary moon without a missing-exit crash');
