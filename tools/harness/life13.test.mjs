import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Emitter } from '../../src/core/events.js';
import { installLife13 } from '../../src/game/life13.js';

// Company citizens must be removed before the world owner disappears during travel.
const mods = new Emitter();
const game = {
  mods, run: { phase: 'company', moon: 'hq', day: 1, seed: 12 }, isHost: true,
  world: { company: { group: new THREE.Group(), groundY: -1.25 } },
  physics: { raycast() { return null; } }, broadcastRun() {},
  unloadMap() { this.world.company = null; },
};
const api = installLife13(game);
mods.emit('mapLoaded', game.world, game);
assert.equal(api.actors.length, 5);
mods.emit('update', .1, game);
game.run.phase = 'orbit';
game.unloadMap();
assert.equal(api.actors.length, 0, 'no actor retains the disposed world');
mods.emit('update', .1, game);
api.dispose();
console.log('life13: actual company unload removes citizens before orbit update');
