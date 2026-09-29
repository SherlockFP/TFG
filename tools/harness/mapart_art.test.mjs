// [mapart] node test: the geometry code builds for every biome family without a DOM (textures are null in node), merged mesh count stays tiny,
// update() runs, dispose() is clean. Run: node tools/harness/mapart_art.test.mjs
import assert from 'node:assert/strict';
import * as C from '../../src/game/mapart_core.js';
import { buildArt } from '../../src/game/mapart_art.js';
import { buildHorizon } from '../../src/game/mapart_lm.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const h = (x, z) => Math.sin(x * 0.05) * 2 + Math.cos(z * 0.04) * 2;
const path = Array.from({ length: 40 }, (_, i) => ({ x: i * 2.5, z: Math.sin(i / 5) * 8 + 20 }));
const fams = new Set();
for (const decor of ['datascape', 'ice', 'lava', 'jungle', null]) for (const sc of [1, 1.5]) {
  const specs = C.planMapArt({ seed: 77, moonId: 'm', decor, biomeId: 'hills', sc, plan: { entrance: { x: 90, z: 0 }, fires: [], ponds: [], lakes: [] }, pathPts: path, heightAt: h, ok: () => false });
  ok(specs.length > 10, 'specs');
  const art = buildArt(specs, { h, seed: 77, accent: 0x2af4ff });
  let tris = 0, meshes = 0, inst = 0;
  art.group.traverse((o) => { if (o.isMesh) { meshes++; if (o.isInstancedMesh) inst++; tris += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); } });
  const drones = specs.filter((s) => s.kind === 'drone').length, pylons = specs.filter((s) => s.kind === 'pylon').length;
  ok(meshes <= 6 + drones * 2 + pylons + 2, `few draw calls (${meshes} meshes for ${specs.length} objects)`);
  ok(tris < 60000, `triangle budget (${tris | 0})`);
  ok(art.colliders.length > 5 && art.colliders.every((c) => [c.x, c.y, c.z, c.sx, c.sy, c.sz].every(Number.isFinite)), 'finite colliders');
  ok(art.pylons.size === pylons && art.drones.size === drones, 'interactive parts registered');
  art.update(0.016, 1, null, [{ x: 0, y: 0, z: 0 }]);
  art.setPylonOff([...art.pylons.keys()][0]); art.knockDrone([...art.drones.keys()][0]);
  art.update(0.5, 2, null, []);
  const lm = specs.find((s) => s.kind === 'landmark'); fams.add(lm.fam);
  const hz = buildHorizon(lm.fam, 77, sc);
  ok(hz.geometry.attributes.position.count > 300 && hz.geometry.attributes.position.count < 60000, 'horizon ring');
  art.dispose();
}
for (const f of C.FAMILIES) {   // every family builds
  const s = { id: 'lan0', kind: 'landmark', x: 60, y: 0, z: 10, yaw: 0.4, r: C.FAMILY_RADIUS[f], fam: f, seed: 5 };
  const art = buildArt([s], { h, seed: 5 });
  ok(art.colliders.length > 0, 'landmark colliders: ' + f);
  art.dispose();
}
ok(fams.size >= 4, 'several families exercised');
console.log(`mapart_art.test OK (${n} checks)`);
