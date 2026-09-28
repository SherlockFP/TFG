// Offline check of the first-person body (node, no browser): camera clearance (near-plane clipping) and legs-in-view for
// idle / walk / sprint / crouch / jump poses.  node tools/harness/fpbody_body_offline.mjs
import * as THREE from 'three';
const { createAvatar } = await import('../../src/models/avatar.js');
const { poseFpBody, FP } = await import('../../src/game/fpbody_grip.js');
const f = (v) => (+v).toFixed(3);

const av = createAvatar({ suitColor: '#d9642b', hat: 'none' });
const visible = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 100);

function frame(a, eye, pitch, back = FP.back) {
  av.root.position.set(0, 0, back);      // yaw 0: forward = -Z, body stands `back` behind the camera
  av.root.rotation.y = Math.PI;
  av.root.updateMatrixWorld(true);
  cam.position.set(0, eye, 0); cam.rotation.set(pitch, 0, 0, 'YXZ'); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const cw = cam.position;
  const proj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  let minD = 9, vis = 0, tot = 0, who = '';
  const v = new THREE.Vector3();
  av.root.traverse((o) => {
    if (!o.isMesh || !visible(o)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      { const dd = v.distanceTo(cw); if (dd < minD) { minD = dd; let n = o, path = []; while (n && n !== av.root) { path.push(n.name || n.type); n = n.parent; } who = path.join('<') + ' geo=' + (o.geometry.attributes.position.count) + ' y=' + v.y.toFixed(2) + ' z=' + v.z.toFixed(2); } }
      tot++;
      const c = v.clone().applyMatrix4(proj);   // clip -> ndc via w below
      const w = v.clone().applyMatrix4(cam.matrixWorldInverse); const cc = new THREE.Vector4(v.x, v.y, v.z, 1).applyMatrix4(proj);
      if (cc.w > 0.05 && Math.abs(cc.x / cc.w) <= 1 && Math.abs(cc.y / cc.w) <= 1) vis++;
    }
  });
  return { minD, visFrac: vis / Math.max(1, tot), tot, who };
}

const poses = [
  { name: 'stand idle', a: { speed: 0 }, eye: 1.62, frames: 30 },
  { name: 'walk 4.5', a: { speed: 4.5 }, eye: 1.62, frames: 120 },
  { name: 'sprint 8', a: { speed: 8, sprint: true }, eye: 1.62, frames: 120 },
  { name: 'crouch idle', a: { speed: 0, crouch: true }, eye: 0.95, frames: 60 },
  { name: 'crouch walk', a: { speed: 2.5, crouch: true }, eye: 0.95, frames: 120 },
  { name: 'airborne', a: { speed: 3, grounded: false }, eye: 1.62, frames: 60 },
];
let worst = 9;
for (const back of [0.0, 0.10, FP.back, 0.2]) {
  console.log('--- back offset', back);
  for (const P of poses) {
    let minD = 9, vis = 0, who = '';
    for (const dip of [0, 0.06]) {
      for (let i = 0; i < P.frames; i++) {
        av.update(1 / 60, { grounded: true, carry2h: false, holding: false, dead: false, emote: null, swing: 0, lookPitch: 0, climbing: false, time: i / 60, ...P.a });
        const crouchW = P.a.crouch ? 1 : 0;
        poseFpBody(av, crouchW);
        if (i > P.frames - 40 || dip) {
          const r = frame(P, P.eye - dip, i % 2 ? -1.0 : -1.35, back);
          if (r.minD < minD) { minD = r.minD; who = r.who; } vis = Math.max(vis, r.visFrac);
        }
      }
    }
    if (back === FP.back) worst = Math.min(worst, minD);
    console.log(P.name.padEnd(12), 'min camera->body', f(minD), minD < FP.near ? 'CLIPS' : 'ok', ' view', (100 * vis).toFixed(0) + '%', minD < FP.near ? who : '');
  }
}
console.log('worst at FP.back =', f(worst), '(near plane 0.05, want >=', FP.near, ')');
