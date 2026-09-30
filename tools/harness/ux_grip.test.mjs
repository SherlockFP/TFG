// [ux] node check: every melee weapon model gets a grip rotation that keeps it in view, out of the arms and near the palm.
//   node tools/harness/ux_grip.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { createItemModel } from '../../src/models/items.js';
import { itemDef } from '../../src/game/items.js';
const { WEAPON_MODELS } = await import('../../src/models/weapons_wave1.js');
const cw = await import('../../src/models/combat_wave2.js');
const { itemGeom, fitGrip } = await import('../../src/game/fpbody_grip.js');
const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420); cam.updateMatrixWorld(true);
const models = { ...WEAPON_MODELS, ...cw.COMBAT_MODELS };
let bad = 0;
for (const id of ['bat', 'nailbat', 'crowbar', 'katana', 'knife', 'longsword', 'greatsword', 'spear', 'waraxe', 'warhammer', 'twindaggers']) {
  const mk = models[id]; if (!mk) { console.log('no model', id); continue; }
  const inner = mk(THREE); const root = new THREE.Group(); root.add(inner);
  const bb = new THREE.Box3().setFromObject(inner); const c = bb.getCenter(new THREE.Vector3()); inner.position.sub(c); root.userData.gripOffset = c.clone();
  const f = fitGrip(itemGeom(root), { id, kind: 'weapon', hands: ['greatsword', 'warhammer'].includes(id) ? 2 : 1 }, id);
  const b = f.box; let ins = 0;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const n = new THREE.Vector3(x, y, z).project(cam); if (z < -0.05 && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) ins++; }
  const ok = f.pen < 0.01 && f.palm < 0.25 && ins >= 3;
  if (!ok) bad++;
  console.log(ok ? 'ok ' : 'BAD', id, f.cls, 'pen', f.pen.toFixed(3), 'palm', f.palm.toFixed(3), 'corners', ins + '/8');
}
// Utility regressions: centred horns need their bell forward and bulb/canister in
// the glove; torch lenses keep their original forward axis. Use real item models.
for (const id of ['airhorn', 'clownhorn', 'flashlight', 'proflash', 'adblock']) {
  const inner = createItemModel(id), root = new THREE.Group(); root.add(inner);
  const center = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
  inner.position.sub(center); root.userData.gripOffset = center.clone();
  const fit = fitGrip(itemGeom(root), itemDef(id), id);
  assert.equal(fit.cls, 'tool');
  assert(fit.pen < 0.002, id + ' clips the sleeve');
  assert(fit.palm < (id === 'airhorn' ? 0.075 : 0.035), id + ' floats away from the glove'); // airhorn cylinder vertices sit at its end caps
  assert(fit.box.max.z < -0.08, id + ' crosses the camera near plane');
  const axis = new THREE.Vector3(0, 0, id.endsWith('horn') ? 1 : -1).applyQuaternion(fit.quat);
  assert(axis.z < -0.99, id + ' points toward the player');
}
console.log('ok utility grips: forward horns, lens clearance and bottle grip');
process.exit(bad ? 1 : 0);
