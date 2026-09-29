// [fpbody] Held-item grip fitting for the first-person view model (pure maths, no game imports: unit-checked in node,
// see tools/harness/fpbody_offline.mjs).
//
// Why: refreshHeldVisuals used to place every item with the model ORIGIN at the hand pivot (and with the tool grip offset
// applied with the wrong sign), so small scrap sat inside the wrist / forearm, melee weapons and rods ended up behind the
// camera, two-handed items floated 0.7 m from the hands and the left hand never touched anything. fitGrip() derives the
// placement from each model's own vertices:
//   * items are classified (scrap / tool / melee / long two-hander / two-hand carry / body) from def + bounding box;
//   * the grip point is the authored origin for tools (models.items.js convention: origin = grip, -Z = pointing axis) or a
//     bounding-box point (lower, rear part of the item) for centred scrap;
//   * the grip point goes to the palm; then a small solver pushes the item out of the forearm / upper-arm capsules of the
//     first-person rig (VM_ARM), so nothing ever sits inside the arm;
//   * two-handed carries put BOTH hands on the item (arm IK targets, avatar.js vmArmIK), long guns/hammers put the left
//     hand on the fore-end.
// Frames: "hand frame" = camera-aligned axes with the origin at the right hand pivot (the view model counter-rotates the
// hand so this holds at rest). Camera space: -Z forward, +X right, +Y up.
import * as THREE from 'three';
import { VM_REST, VM_ARM, vmArmFK, vmArmIK } from '../models/avatar.js';

export const PALM = new THREE.Vector3(0, 0, 0.03);   // palm centre relative to the hand pivot (the glove spans z -0.03 .. +0.09)
const MARGIN = 0.006;
const REAR = 0.05;    // deep items: the grip point sits this far in front of the rear face (keeps the rear out of the wrist)

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _ab = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const restCache = {};
/** Forward kinematics of an arm at rest ('onehand' | 'twohand') for side +1 (right) / -1 (left), camera space. */
export function restArm(kind, side = 1) {
  const key = kind + side;
  if (!restCache[key]) {
    const r = VM_REST[kind];
    restCache[key] = vmArmFK(r.p[0] * side, r.p[1], r.p[2], r.r[0], r.r[1] * side, r.r[2] * side, r.el, {});
  }
  return restCache[key];
}

/** Sampled model vertices (root-local) + exact bounding box of an item root created by ItemManager.makeVisual. */
export function itemGeom(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const meshes = [];
  let total = 0;
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position && !o.isSprite) { meshes.push(o); total += o.geometry.attributes.position.count; } });
  const stride = Math.max(1, Math.floor(total / 320));
  const pts = [], box = new THREE.Box3();
  let n = 0;
  for (const o of meshes) {
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      box.expandByPoint(_v);
      if (n++ % stride === 0) pts.push(_v.x, _v.y, _v.z);
    }
  }
  if (box.isEmpty()) { box.set(V(-0.1, -0.1, -0.1), V(0.1, 0.1, 0.1)); }
  const c = box.getCenter(V()), size = box.getSize(V());
  // the 8 box corners keep the extremes of the sampled cloud honest
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(x, y, z);
  const gripOff = root.userData?.gripOffset;   // ItemManager: bbox centre relative to the authored origin
  // authored origin in root-local space is -gripOffset (the inner model was shifted by -c)
  const origin = gripOff ? V(-gripOff.x, -gripOff.y, -gripOff.z) : V();
  return { pts: new Float32Array(pts), box, size, center: c, origin, hasGrip: !!gripOff && gripOff.length() > 0.02 };
}

/** Radial distance from p to the axis a-b, or -1 when p is beyond either flat end (the sleeves are open tubes with flat ends). */
function tubeDist(p, a, b, out) {
  _ab.subVectors(b, a);
  const t = _c.subVectors(p, a).dot(_ab) / Math.max(1e-9, _ab.lengthSq());
  if (t < 0 || t > 1) return -1;
  out.copy(a).addScaledVector(_ab, t);
  return p.distanceTo(out);
}

/** Tubes (camera space) of one arm: forearm up to the cuff, upper arm. */
function armCaps(fk) { return [{ a: fk.elbow, b: fk.wrist, r: VM_ARM.rFore + MARGIN }, { a: fk.base, b: fk.elbow, r: VM_ARM.rUpper + MARGIN }]; }

/** Deepest penetration (m, > 0 = inside an arm) of the item cloud transformed by (q, pos + hand) into the capsules. */
export function penetration(pts, q, pos, hand, caps, dirOut) {
  let worst = 0;
  const p = V(), cp = V();
  for (let i = 0; i < pts.length; i += 3) {
    p.set(pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(q).add(pos).add(hand);
    for (const cap of caps) {
      const d = tubeDist(p, cap.a, cap.b, cp);
      const pen = d < 0 ? 0 : cap.r - d;
      if (pen > worst) { worst = pen; if (dirOut) { dirOut.subVectors(p, cp); if (d < 1e-4) dirOut.set(0, 1, 0); else dirOut.multiplyScalar(1 / d); } }
    }
  }
  return worst;
}

function rotBox(pts, q) {
  const b = new THREE.Box3(), p = V();
  for (let i = 0; i < pts.length; i += 3) b.expandByPoint(p.set(pts[i], pts[i + 1], pts[i + 2]).applyQuaternion(q));
  return b;
}

/** Push the item out of the arms (radial pushes, at most `iters` rounds). Returns the remaining penetration. */
function clearOfArms(pts, q, pos, hand, caps, iters = 60) {
  const dir = V();
  let pen = penetration(pts, q, pos, hand, caps, dir);
  for (let i = 0; i < iters && pen > 0.0015; i++) {
    dir.z = Math.min(dir.z, 0.25);              // never shove the item back towards the camera
    dir.normalize();
    pos.addScaledVector(dir, pen + 0.002);
    pen = penetration(pts, q, pos, hand, caps, dir);
  }
  return Math.max(0, pen);
}

// [ux] per-weapon grip rotations (Euler XYZ, rad; model -Z = blade / head direction): pitch tips the weapon up-forward, a little yaw
// points it across the view, NO roll (the old shared roll of 0.3 made blades and bats sit crooked). Unknown melee -> GRIP_MELEE_DEFAULT.
export const GRIP_MELEE_DEFAULT = [0.95, -0.14, 0];
// [vm] the hand now rests lower-right, so weapons stand up more (pitch) and lean slightly OUTWARD (negative yaw = tip to the right);
// the old positive yaw leaned every blade across the screen centre.
export const GRIP_MELEE = {
  knife: [0.62, -0.1, 0], twindaggers: [0.62, -0.1, 0], machete: [0.9, -0.14, 0], katana: [0.98, -0.14, 0], longsword: [0.95, -0.12, 0],
  bat: [1.02, -0.14, 0], nailbat: [1.02, -0.14, 0], pipe: [0.98, -0.14, 0], crowbar: [0.98, -0.14, 0], shovel: [1.0, -0.12, 0], stopsign: [0.8, -0.1, 0],
  spear: [0.62, -0.06, 0], waraxe: [0.98, -0.12, 0], greatsword: [0.76, 0.2, 0], warhammer: [0.76, 0.2, 0], sledge: [0.76, 0.2, 0],   // two-handers keep the two-hand stance (unchanged)
};
const meleeQuat = (id) => { const g = GRIP_MELEE[id] || GRIP_MELEE_DEFAULT; return qFromEuler(g[0], g[1], g[2]); };

const qFromEuler = (x, y, z, out = new THREE.Quaternion()) => out.setFromEuler(_e.set(x, y, z));

/** Classify an item: 'body' | 'carry' (two-hand, in front) | 'long2h' (gun / hammer, left hand on the fore-end) | 'melee' | 'tool' | 'scrap'. */
export function classify(def, geom, id) {
  const s = geom.size;
  if (def?.kind === 'body' || id === 'body') return 'body';
  const two = def?.hands === 2 || def?.kind === 'big' || def?.hands === 0;
  if (two && (def?.kind === 'weapon' || def?.ranged)) return 'long2h';
  if (two) return 'carry';
  if (def?.kind === 'weapon' && !def?.ranged) return 'melee';
  if (def?.kind === 'tool' || def?.kind === 'weapon' || (def?.kind === 'consumable' && geom.hasGrip) || geom.hasGrip) return 'tool';
  return 'scrap';
}

/**
 * Fit a held item. Returns { cls, pos (hand frame), quat, grip: { R?, L? } (camera-space hand targets for the arm IK),
 * pen, palm (nearest vertex to the palm, m), box (camera-space AABB) }.
 */
export function fitGrip(geom, def, id = '') {
  const cls = classify(def, geom, id);
  const s = geom.size;
  const q = new THREE.Quaternion();
  const twoStance = cls === 'body' || cls === 'carry' || cls === 'long2h';
  const R1 = restArm(twoStance ? 'twohand' : 'onehand', 1);
  const L1 = restArm('twohand', -1);
  const hand = R1.hand.clone();
  const grip = {};
  const pos = V();
  let G;   // grip point in root-local space (before rotation)

  // ---- orientation
  const longAxis = s.z >= s.x && s.z >= s.y ? 'z' : (s.y >= s.x ? 'y' : 'x');
  const auto = new THREE.Quaternion();          // bring the long axis of unknown (downloaded) tools/weapons onto -Z (tip forward)
  if ((cls === 'melee' || cls === 'long2h' || (cls === 'tool' && Math.max(s.x, s.y, s.z) > 0.5)) && !geom.hasGrip) {
    if (longAxis === 'y' && s.y > 1.5 * s.z) auto.setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
    else if (longAxis === 'x' && s.x > 1.5 * s.z) auto.setFromAxisAngle(V(0, 1, 0), Math.PI / 2);
  }
  if (cls === 'melee') q.copy(meleeQuat(id)).multiply(auto);   // [ux]
  else if (cls === 'long2h') q.copy(def?.ranged ? qFromEuler(0.04, 0.16, 0) : meleeQuat(id)).multiply(auto);
  else if (cls === 'body') q.setFromAxisAngle(V(0, 1, 0), Math.PI / 2);
  else if (cls === 'carry') {
    const tilt = -Math.min(0.5, Math.max(0, (s.y - 0.3) * 0.75));   // tall things lean away so they do not blot out the view
    q.setFromAxisAngle(V(1, 0, 0), tilt);
  } else if (cls === 'scrap' && s.x > 0.34 && s.x > 1.5 * s.z) q.setFromAxisAngle(V(0, 1, 0), Math.PI / 2);   // long flat things (fish, keyboard) point forward
  const rb = rotBox(geom.pts, q);
  const rs = rb.getSize(V()), rc = rb.getCenter(V());

  if (cls === 'carry' || cls === 'body') {
    // both hands on the item: hands at its sides (or behind its rear face when it is wider than the hand span)
    const yh = cls === 'body' ? -0.36 : -0.3, zh = -0.56;
    const wide = rs.x / 2 + 0.025 > 0.27;
    const hw = Math.min(0.27, Math.max(0.14, rs.x / 2 + 0.025));
    const bottom = yh - 0.06 - Math.max(0, rs.y - 0.5) * 0.35;
    const cy = bottom + rs.y / 2;
    const cz = wide ? zh - rs.z / 2 - 0.035 : zh - rs.z / 2 + Math.min(0.04, rs.z * 0.4);
    grip.R = V(hw, yh, zh); grip.L = V(-hw, yh, zh);
    hand.copy(grip.R);
    // item centre (rotated box centre) at (0, cy, cz) in camera space
    pos.set(0 - rc.x, cy - rc.y, cz - rc.z).sub(hand);
    G = null;
  } else {
    if (geom.hasGrip && !(cls === 'scrap')) {
      G = geom.origin.clone();                               // tools: origin = grip
      // melee: choke up towards the butt so at most a few cm stick out below the fist (a long butt used to hit the sleeve and the
      // arm solver then shoved the whole weapon out of the hand)
      if (cls === 'melee') { const butt = geom.box.max.z - G.z; if (butt > 0.035) G.z += butt - 0.035; }
    } else if (cls === 'long2h' || cls === 'melee') {
      G = V(rc.x, rc.y, rb.max.z - 0.18 * rs.z);             // unknown model: grip near the back end
      G.applyQuaternion(q.clone().invert());
    } else {
      const fy = rs.y > 0.2 ? 0.28 : 0.5;
      G = V(rc.x, rb.min.y + fy * rs.y, rb.max.z - Math.min(0.5 * rs.z, REAR));   // scrap: palm under the lower part, close to the rear face
      G.applyQuaternion(q.clone().invert());
    }
    const Gr = G.clone().applyQuaternion(q);
    pos.copy(PALM).sub(Gr);
  }

  // ---- keep the item out of the arms
  let caps = armCaps(R1);
  let pen = 0;
  if (cls === 'carry' || cls === 'body') {
    const armR = ikPose(1, grip.R), armL = ikPose(-1, grip.L);
    caps = [...armCaps(armR), ...armCaps(armL)];
    pen = clearOfArms(geom.pts, q, pos, hand, caps);
  } else {
    if (cls === 'long2h') caps = [...armCaps(R1), ...armCaps(L1)];
    pen = clearOfArms(geom.pts, q, pos, hand, caps);
  }

  // ---- left hand on the fore-end of guns / hammers
  if (cls === 'long2h') {
    const g0 = hand.clone().add(pos).add(G.clone().applyQuaternion(q));      // grip point, camera space
    const along = Math.min(0.24, 0.34 * s.z);
    const fore = V(0, 0, -along).applyQuaternion(q);
    grip.L = g0.add(fore).add(V(0, -0.035, 0));
  }

  // ---- diagnostics (camera space)
  const cam = new THREE.Box3(), p = V(), palm = hand.clone().add(PALM);
  let palmD = 9;
  const qq = q;
  for (let i = 0; i < geom.pts.length; i += 3) {
    p.set(geom.pts[i], geom.pts[i + 1], geom.pts[i + 2]).applyQuaternion(qq).add(pos).add(hand);
    cam.expandByPoint(p); palmD = Math.min(palmD, p.distanceTo(palm));
  }
  return { cls, pos, quat: q, grip, pen, palm: palmD, box: cam, hand };
}

// arm pose reaching a camera-space target (same IK the view model runs); returns FK { base, elbow, wrist, hand }
const _ik = {};
function ikPose(side, t) {
  const r = restArm('twohand', side);
  vmArmIK(r.base.x, r.base.y, r.base.z, t.x, t.y, t.z, side, _ik);
  return vmArmFK(_ik.px, _ik.py, _ik.pz, _ik.x, _ik.y, _ik.z, _ik.e, {});
}
export { ikPose };

// ------------------------------------------------------------------------------------------------------------ first-person body
// The local avatar, seen through its own camera (CS2 style: legs, feet and a bit of chest when you look down).
export const FP = {
  back: 0.14,        // the body stands this far behind the camera (m, along the view yaw)
  torsoY: 0.72,      // spine y scale while standing (keeps the collar well below the eye)
  torsoYCrouch: 0.3,
  near: 0.09,        // minimum camera -> body-surface distance we accept (camera near plane is 0.05)
};
const armRoot = (hand, torso) => { let o = hand; while (o && o.parent && o.parent !== torso) o = o.parent; return o && o.parent === torso ? o : null; };
/** Hide what the camera must not see (head/neck/hat/face, backpack, both arms: the view model owns the hands) and shorten the torso. Call after avatar.update(). */
export function poseFpBody(av, crouchW = 0) {
  const P = av.parts;
  if (P.neck) P.neck.visible = false; else if (P.head) P.head.visible = false;
  if (P.backpack) P.backpack.visible = false;
  for (const h of [P.handL, P.handR]) { const a = h && armRoot(h, P.torso); if (a) a.visible = false; }
  if (P.torso) {
    P.torso.scale.y = FP.torsoY + (FP.torsoYCrouch - FP.torsoY) * crouchW;
    P.torso.rotation.x = Math.max(-0.08, Math.min(0.08, P.torso.rotation.x));   // no lean into the lens (the avatar leans forward while crouching / sprinting)
    P.torso.rotation.y = 0; P.torso.rotation.z = 0;
  }
}

// ------------------------------------------------------------------------------------------------------------ frame-time smoothing
/**
 * Low-pass for the per-frame dt. rAF timestamps jitter by a couple of ms, which used to be applied 1:1 to the camera displacement and
 * to the number of fixed physics steps per frame (0 / 1 / 2 alternating). A linear filter with unit gain keeps the sum of time intact;
 * real hitches (raw dt far from the average) pass through untouched, three odd frames in a row re-seed the filter (new frame rate).
 */
export function makeDtSmoother() {
  const sm = { v: 0, init: false, miss: 0 };
  return (raw) => {
    if (!(raw > 0)) return raw;
    if (!sm.init) { sm.init = true; sm.v = raw > 0.05 ? 1 / 60 : raw; return raw; }
    if (raw > sm.v * 2.2 + 0.004 || raw < sm.v * 0.4 - 0.002 || raw > 0.06) {
      if (++sm.miss >= 3) { sm.v = Math.min(raw, 0.05); sm.miss = 0; }
      return raw;
    }
    sm.miss = 0;
    sm.v += (raw - sm.v) * 0.3;
    return sm.v;
  };
}
