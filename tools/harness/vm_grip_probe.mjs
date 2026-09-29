// Viewmodel grip probe: node tools/harness/vm_grip_probe.mjs <pitch,yaw,roll> [old]  -> pen / palm distance / NDC box per melee item
import * as THREE from 'three';
const { createItemModel } = await import('../../src/models/items.js');
const { WEAPON_MODELS } = await import('../../src/models/weapons_wave1.js');
const cw = await import('../../src/models/combat_wave2.js');
const { itemDef } = await import('../../src/game/items.js');
const AV = await import('../../src/models/avatar.js');
const GP = await import('../../src/game/fpbody_grip.js');
const [pitch, yaw, roll] = (process.argv[2] || '1.1,-0.1,0').split(',').map(Number);
if (process.argv[3] !== 'old') { Object.assign(AV.VM_REST.onehand, { p: [0.26, -0.42, 0.08], r: [-0.147, -0.089, 0.327], el: 1.017 }); }
for (const k of Object.keys(GP.GRIP_MELEE)) GP.GRIP_MELEE[k] = [pitch, yaw, roll];
GP.GRIP_MELEE_DEFAULT.splice(0, 3, pitch, yaw, roll);
const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420); cam.updateMatrixWorld(true);
const models = { ...WEAPON_MODELS, ...cw.COMBAT_MODELS };
const r = (v) => v.toArray().map((x) => +x.toFixed(2));
for (const id of ['pipe', 'machete', 'shovel', 'stopsign', 'sledge', 'bat', 'katana', 'crowbar', 'knife', 'longsword', 'spear', 'flashlight']) {
  let inner; try { inner = models[id] ? models[id](THREE) : createItemModel(id); } catch { continue; }
  const root = new THREE.Group(); root.add(inner);
  const bb = new THREE.Box3().setFromObject(inner); const c = bb.getCenter(new THREE.Vector3()); inner.position.sub(c); root.userData.gripOffset = c.clone();
  const g = GP.itemGeom(root); const def = itemDef(id) || { id, kind: 'weapon', hands: 1 };
  const f = GP.fitGrip(g, def.kind ? def : { id, kind: 'weapon', hands: 1 }, id);
  const palm = f.hand.clone().add(GP.PALM);
  const G = g.hasGrip ? g.origin.clone().applyQuaternion(f.quat).add(f.pos).add(f.hand) : null;
  console.log(id.padEnd(10), f.cls.padEnd(6), 'pen', f.pen.toFixed(3), 'palmD', f.palm.toFixed(3), 'gripOff', G ? G.distanceTo(palm).toFixed(3) : '-', 'ndc', r(f.box.min.clone().project(cam)).slice(0, 2), r(f.box.max.clone().project(cam)).slice(0, 2), 'zmin', f.box.min.z.toFixed(2));
}
