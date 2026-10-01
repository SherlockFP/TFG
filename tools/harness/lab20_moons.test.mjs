import assert from 'node:assert/strict';
import './ship2_env.mjs';
import { MOONS, MOON_ORDER, BIOMES } from '../../src/game/moons.js';
import { isInteriorTheme } from '../../src/world/interiors/index.js';
const before = structuredClone(MOONS);
const { LAB20_MOONS } = await import('../../src/game/lab20_moons.js');
for (const [id, def] of Object.entries(before)) assert.deepEqual(MOONS[id], def, 'existing save destination unchanged');
for (const def of LAB20_MOONS) {
  assert.equal(MOONS[def.id], def);
  assert.equal(MOON_ORDER.filter(id => id === def.id).length, 1);
  assert.ok(isInteriorTheme(def.interior));
  assert.ok(BIOMES[def.biome]);
  assert.ok(def.size >= 1.1);
  assert.ok(def.power <= 5 && def.scrapMul <= 1.15);
}
assert.equal(MOONS.archive20.cost, 0);
assert.equal(MOONS.foundry20.cost, 95);
console.log('lab20 destination registration and existing moon preservation PASS');
