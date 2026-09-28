// Offline (node, no browser) check of the held-item placement for every procedural item model.
//   node tools/harness/fpbody_offline.mjs [--verbose]
// BEFORE = the shipped refreshHeldVisuals placement, AFTER = src/game/fpbody_grip.js fitGrip. Reports, per item, penetration into
// the first-person forearm / upper-arm capsules, vertices behind the near plane, camera-frustum visibility of the bounding box,
// the distance from the palm to the nearest vertex (is it really in the hand?) and, for two-handed items, both hands.
import * as THREE from 'three';
const { createItemModel, ITEM_MODEL_IDS } = await import('../../src/models/items.js');
const { itemDef } = await import('../../src/game/items.js');
const { VM_ARM, vmArmIK, vmArmFK } = await import('../../src/models/avatar.js');
const { restArm, itemGeom, fitGrip, penetration, PALM, ikPose } = await import('../../src/game/fpbody_grip.js');
const verbose = process.argv.includes('--verbose');
const f = (v) => (+v).toFixed(2);

const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 420); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
const cam90 = new THREE.PerspectiveCamera(90, 16 / 9, 0.05, 420); cam90.updateMatrixWorld(true); cam90.updateProjectionMatrix();

function makeItem(id) {   // ItemManager.makeVisual
  const inner = createItemModel(id);
  const root = new THREE.Group(); root.add(inner);
  const bb = new THREE.Box3().setFromObject(inner); const c = bb.getCenter(new THREE.Vector3());
  inner.position.sub(c); root.userData.gripOffset = c.clone();
  return root;
}
function capsFor(fk) { return [{ a: fk.elbow, b: fk.wrist, r: VM_ARM.rFore }, { a: fk.base, b: fk.elbow, r: VM_ARM.rUpper }]; }

function measure(geom, q, pos, hand, caps, twoHands) {
  const pen = penetration(geom.pts, q, pos, hand, caps);
  const p = new THREE.Vector3(), box = new THREE.Box3();
  let behind = 0, n = 0, palmD = 9, lD = 9;
  const palm = hand.clone().add(PALM);
  for (let i = 0; i < geom.pts.length; i += 3) {
    p.set(geom.pts[i], geom.pts[i + 1], geom.pts[i + 2]).applyQuaternion(q).add(pos).add(hand);
    n++; if (p.z > -0.08) behind++;
    box.expandByPoint(p); palmD = Math.min(palmD, p.distanceTo(palm));
  }
  const boxD = (pt) => box.distanceToPoint(pt);
  const ctr = box.getCenter(new THREE.Vector3());
  const ndc = ctr.clone().project(cam), ndc90 = ctr.clone().project(cam90);
  // fraction of the box corners inside the frustum
  let inside = 0;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const c = new THREE.Vector3(x, y, z); const nd = c.clone().project(cam);
    if (z < -0.05 && Math.abs(nd.x) <= 1 && Math.abs(nd.y) <= 1) inside++;
  }
  return { pen, behind: behind / n, palmD: boxD(palm), boxD, palmV: palmD, inView: Math.abs(ndc.x) < 0.98 && Math.abs(ndc.y) < 0.98 && ndc.z < 1, inView90: Math.abs(ndc90.x) < 0.98 && Math.abs(ndc90.y) < 0.98, corners: inside, box };
}

const rows = [], bad = { before: 0, after: 0 };
const agg = { before: { pen: 0, behind: 0, off: 0 }, after: { pen: 0, behind: 0, off: 0 } };
for (const id of ITEM_MODEL_IDS) {
  const def = itemDef(id) || {};
  const root = makeItem(id);
  // ---- BEFORE (shipped)
  const g = root.userData.gripOffset;
  const two0 = (def.hands === 2 && !def.ranged && def.kind !== 'weapon') || def.kind === 'big' || id === 'body';
  const q0 = new THREE.Quaternion(), pos0 = new THREE.Vector3();
  if (two0) pos0.set(0, -0.28, -0.75);
  else {
    if (def.kind === 'weapon' && !def.ranged) q0.setFromEuler(new THREE.Euler(0.45, 0.35, 0.3));
    pos0.copy(g).applyQuaternion(q0).multiplyScalar(-1);
  }
  const stance0 = def.hands === 2 || def.kind === 'big' || id === 'body' ? 'twohand' : 'onehand';
  const H0 = restArm(stance0, 1);
  const geom = itemGeom(root);
  const capsB = [...capsFor(H0), ...(stance0 === 'twohand' ? capsFor(restArm('twohand', -1)) : [])];
  const mb = measure(geom, q0, pos0, H0.hand, capsB);
  const offB = !mb.inView;
  // ---- AFTER
  const fit = fitGrip(geom, def, id);
  let capsA;
  if (fit.cls === 'carry' || fit.cls === 'body') capsA = [...capsFor(ikPose(1, fit.grip.R)), ...capsFor(ikPose(-1, fit.grip.L))];
  else if (fit.cls === 'long2h') capsA = [...capsFor(restArm('twohand', 1)), ...capsFor(ikPose(-1, fit.grip.L))];
  else capsA = capsFor(restArm('onehand', 1));
  const ma = measure(geom, fit.quat, fit.pos, fit.hand, capsA);
  // two-handed: is the LEFT hand on the item?
  let leftD = null;
  if (fit.grip.L) {
    leftD = ma.boxD(fit.grip.L);
  }
  const badB = mb.pen > 0.005 || mb.behind > 0.02 || offB;
  const okHands = ma.palmD < 0.07;
  const badA = ma.pen > 0.005 || ma.behind > 0 || !ma.inView || !okHands || (leftD !== null && leftD > 0.07);
  if (badB) bad.before++; if (badA) bad.after++;
  agg.before.pen += mb.pen > 0.005; agg.before.behind += mb.behind > 0.02; agg.before.off += offB;
  agg.after.pen += ma.pen > 0.005; agg.after.behind += ma.behind > 0; agg.after.off += !ma.inView;
  rows.push({ id, cls: fit.cls, line: `${id.padEnd(13)} ${fit.cls.padEnd(6)} BEFORE pen=${f(mb.pen)} behind=${(100 * mb.behind).toFixed(0)}% palm=${f(mb.palmD)} ${offB ? 'OFFSCREEN' : ''} | AFTER pen=${f(ma.pen)} behind=${(100 * ma.behind).toFixed(0)}% palm=${f(ma.palmD)}${leftD !== null ? ' leftHand=' + f(leftD) : ''} corners=${ma.corners}/8 fov90=${ma.inView90} ${badA ? '<== BAD' : ''}` });
}
if (verbose) console.log(rows.map((r) => r.line).join('\n'));
else console.log(rows.filter((r) => r.line.includes('BAD')).map((r) => r.line).join('\n'));
const byCls = {}; for (const r of rows) byCls[r.cls] = (byCls[r.cls] || 0) + 1;
console.log('classes', JSON.stringify(byCls));
console.log(`items ${ITEM_MODEL_IDS.length}: BEFORE bad=${bad.before} (pen ${agg.before.pen}, behind camera ${agg.before.behind}, off screen ${agg.before.off})  AFTER bad=${bad.after} (pen ${agg.after.pen}, behind camera ${agg.after.behind}, off screen ${agg.after.off})`);
