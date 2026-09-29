// TFG - procedural low-poly PSX props (facility, outdoor, ship interior, company HQ).
//
// API
//   PROP_IDS                    every supported id
//   createProp(id, opts = {})   -> THREE.Group      opts: { seed:number, variant:number, snow?:boolean }
//
// Conventions: meters, +Y up, the prop's front faces +Z, origin at bottom centre of the prop.
//   userData.mount: 'floor' (default) | 'wall' | 'ceiling' (placement hint only - origin is ALWAYS bottom centre)
//     wall    -> back face at z = -depth/2 (userData.mountPoint[2]); userData.suggestedY = typical height
//                of the prop's bottom above the floor (e.g. fuse_box 1.1, keypad 1.28, pipe_bundle 2.28).
//     ceiling -> lowest point at y=0, ceiling attachment at y = userData.mountPoint[1] (= hang height),
//                so place it at ceilingY - mountPoint[1].
//   Door props (door_single/door_mansion/blast_door/vault_door) are centred on the wall plane z=0.
//   Exceptions (documented): facility_entrance / fire_exit origin = doorway at floor level on the facade,
//     dock origin = deck surface (posts reach userData.postDepth below), stairs rise toward -Z from z=+2.5.
//   userData.colliders: [{ c:[x,y,z], s:[w,h,d] }] axis-aligned boxes in local space (static parts only;
//                        moving leaves carry their own box in anchor.userData.collider, in anchor space).
//   userData.lights:    [{ p:[x,y,z], color, intensity, distance, flicker?, blink? }]
//   userData.anchors:   named Object3Ds (hinges / sliding leaves / buttons / screens ...)
//   Screen anchors are Meshes with their OWN MeshBasicMaterial (engine may replace material.map).
// Materials: shared cached Lambert/Basic materials; static sub-geometries merged per material.

import * as THREE from 'three';
import { getMaterial, getBasicMaterial, getTexture, seededRandom, hashString } from '../render/textures.js';
import { ModelKit } from './items.js';
import { planStairs } from '../world/stairs.js';

const { Kit, G, xf, boxUV, scaleUV, swapUV, planarUV, anchor, PI, HP, TAU } = ModelKit;
const { box, cyl, cone, sph, hemi, tor, plane, circ } = G;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const DECAL = { decal: true };

// ================================================================================== helpers
const r3 = (v) => Math.round(v * 1000) / 1000;
function col(c, x, y, z, w, h, d) {
  c.colliders.push({ c: [r3(x), r3(y), r3(z)], s: [r3(Math.abs(w)), r3(Math.abs(h)), r3(Math.abs(d))] });
}
function colMM(c, x0, y0, z0, x1, y1, z1) {
  col(c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
}
function light(c, p, color, intensity, distance, extra) {
  c.lights.push({ p: p.map(r3), color, intensity, distance, ...(extra || {}) });
}
function anc(c, name, p, r, parent) {
  const o = anchor(parent || c.root, name, p, r);
  c.anchors[name] = o;
  return o;
}
function leafCollider(o, cx, cy, cz, w, h, d) { o.userData.collider = { c: [r3(cx), r3(cy), r3(cz)], s: [r3(w), r3(h), r3(d)] }; }
/** own (uncached) MeshBasicMaterial plane - for screens the engine re-textures */
function screenMesh(name, w, h, tex, color = 0xffffff) {
  const m = new THREE.MeshBasicMaterial({ color, map: getTexture(tex) });
  m.name = 'screen:' + name;
  const mesh = new THREE.Mesh(plane(w, h), m);
  mesh.name = name;
  mesh.userData.size = [w, h];
  return mesh;
}
function addBarrel(k, side, cap, p, r, radius = 0.3, height = 0.9) {
  k.add(side, cyl(radius, radius, height, 10, true), p, r);
  const top = xf(circ(radius, 10), [0, height / 2, 0], [-HP, 0, 0]);
  const bung = xf(cyl(0.04, 0.04, 0.02, 6), [radius * 0.5, height / 2 + 0.01, 0]);
  k.add(cap, top, p, r);
  k.add(cap, bung, p, r);
  if (r) k.add(cap, xf(circ(radius, 10), [0, -height / 2, 0], [HP, 0, 0]), p, r);
}
/** 26-tri fish for crates / stalls. Head toward +X in its own frame.
 *  rot = [roll about body axis, yaw, pitch] applied pitch -> roll -> yaw. */
function lowFish(k, skin, p, rot, len) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ'));
  k.add(skin, xf(sph(1, 5, 3), [len * 0.05, 0, 0], null, [len * 0.4, len * 0.12, len * 0.07]), p, q);
  k.add(skin, xf(cone(len * 0.12, len * 0.2, 3), [-len * 0.42, 0, 0], [0, 0, -HP], [1, 1, 0.25]), p, q);
}
function jitterGeo(g, seed, amt) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rr = seededRandom(hashString(`${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}:${seed}`));
    const f = 1 + (rr() - 0.5) * amt;
    pos.setXYZ(i, x * f + (rr() - 0.5) * amt * 0.3, y * f, z * f + (rr() - 0.5) * amt * 0.3);
  }
  g.computeVertexNormals();
  return g;
}
function rockGeo(seed, detail, bottom = -0.35) {
  const g = jitterGeo(G.ico(1, detail), seed, 0.38);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < bottom) pos.setY(i, bottom);
  g.computeVertexNormals();
  return g;
}
/** lattice tower legs + 4 alpha panels (half widths b0 at bottom, t0 at top) */
function latticeTower(k, legMat, latMat, H, b0, t0, legR = 0.07) {
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [x, z] of cs) k.limb(legMat, [x * b0, 0, z * b0], [x * t0, H, z * t0], legR, legR * 0.6, 4);
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = cs[i], [x1, z1] = cs[(i + 1) % 4];
    const g = G.quad([x0 * b0, 0, z0 * b0], [x1 * b0, 0, z1 * b0], [x1 * t0, H, z1 * t0], [x0 * t0, H, z0 * t0]);
    scaleUV(g, 1, Math.max(1, Math.round(H / (b0 + t0))));
    k.push(latMat, g);
  }
}

// =================================================================================== PROPS
const PROPS = Object.create(null);

// ------------------------------------------------------------------------------- facility
PROPS.shelf_metal = (k, c) => {
  const W = 1.8, H = 2.0, D = 0.5, r = c.rng;
  const post = L('metal', 0x8a9098), sh = L('metal_plate', 0xb0b4b0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(post, box(0.04, H, 0.04), [x * (W / 2 - 0.02), H / 2, z * (D / 2 - 0.02)]);
  const levels = [0.08, 0.68, 1.28, 1.88];
  for (const y of levels) k.add(sh, box(W, 0.03, D), [0, y, 0], null, null, 0.8);
  k.beam(post, [-W / 2 + 0.04, 0.1, -D / 2 + 0.01], [W / 2 - 0.04, 1.86, -D / 2 + 0.01], 0.02, 0.01);
  k.beam(post, [W / 2 - 0.04, 0.1, -D / 2 + 0.01], [-W / 2 + 0.04, 1.86, -D / 2 + 0.01], 0.02, 0.01);
  const cb = L('cardboard'), cm = L('crate_metal');
  for (let i = 0; i < 4; i++) {
    let x = -W / 2 + 0.06;
    const maxH = i === 3 ? 0.35 : 0.5;
    while (x < W / 2 - 0.3) {
      const w = 0.25 + r() * 0.25, h = 0.18 + r() * (maxH - 0.18), d = 0.25 + r() * 0.2;
      if (r() < 0.7 && x + w < W / 2 - 0.04) k.add(r() < 0.85 ? cb : cm, box(w, h, d), [x + w / 2, levels[i] + 0.015 + h / 2, (r() - 0.5) * 0.05], [0, (r() - 0.5) * 0.2, 0]);
      x += w + 0.05 + r() * 0.2;
    }
  }
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2);
};
PROPS.crate_wood = (k, c) => {
  const s = [[1, 1, 1], [0.7, 0.7, 0.7], [1.2, 0.8, 0.8]][c.pick(3)];
  k.add(L('crate_wood'), box(s[0], s[1], s[2]), [0, s[1] / 2, 0]);
  col(c, 0, s[1] / 2, 0, s[0], s[1], s[2]);
};
PROPS.crate_metal = (k, c) => {
  const s = [[1.2, 0.9, 0.8], [0.7, 0.6, 0.6]][c.pick(2)];
  k.add(L('crate_metal'), box(s[0], s[1] - 0.06, s[2]), [0, (s[1] - 0.06) / 2, 0]);
  k.add(L('metal_dark'), box(s[0] + 0.04, 0.06, s[2] + 0.04), [0, s[1] - 0.03, 0], null, null, 1);
  for (const sx of [-1, 1]) k.add(L('metal_dark'), box(0.04, 0.05, 0.2), [sx * (s[0] / 2 + 0.02), s[1] * 0.6, 0]);
  col(c, 0, s[1] / 2, 0, s[0] + 0.04, s[1], s[2] + 0.04);
};
const BARREL_TINTS = [0x4a6a9a, 0x9a3a30, 0x5a7a44, 0xb09a40, 0x8a8a86];
PROPS.barrel = (k, c) => {
  const t = BARREL_TINTS[c.pick(BARREL_TINTS.length)];
  addBarrel(k, L('barrel', t), L('metal', t), [0, 0.45, 0]);
  col(c, 0, 0.45, 0, 0.6, 0.9, 0.6);
};
PROPS.barrel_toxic = (k, c) => {
  addBarrel(k, L('barrel_toxic'), L('metal', 0xa0b040), [0, 0.45, 0]);
  k.add(B(null, 0x70e030), circ(0.16, 7), [-0.05, 0.906, 0.04], [-HP, 0, 0]);
  col(c, 0, 0.45, 0, 0.6, 0.9, 0.6);
};
PROPS.pipe_bundle = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const len = 4, dk = L('metal_dark');
  const pipes = [[0.09, 2.45, 0.14, 0x7a8a7a], [0.06, 2.72, 0.11, 0x9a4a3a], [0.11, 2.98, 0.17, 0xb09a50]];
  for (const [r, y, z, t] of pipes) {
    k.add(L('pipes', t), scaleUV(cyl(r, r, len, 8, true), 1, len), [0, y, z], [0, 0, HP]);
    for (const x of [-1.3, 1.3]) k.add(dk, cyl(r + 0.03, r + 0.03, 0.06, 8), [x, y, z], [0, 0, HP]);
  }
  for (const x of [-1.8, -0.6, 0.6, 1.8]) {
    k.add(dk, box(0.05, 0.75, 0.03), [x, 2.72, 0.015]);
    for (const [r, y, z] of pipes) k.add(dk, box(0.04, 0.03, z), [x, y - r - 0.015, z / 2]);
  }
  colMM(c, -len / 2, 2.33, 0, len / 2, 3.12, 0.3);
};
PROPS.desk = (k, c) => {
  const W = 1.4, H = 0.76, D = 0.7;
  const top = L('wood_dark', 0xb09070), mt = L('paint', 0x8a8a78), fr = L('paint', 0x9a9a88), dk = L('metal_dark');
  k.add(top, box(W, 0.04, D), [0, H - 0.02, 0], null, null, 1);
  k.add(mt, box(0.42, H - 0.04, D - 0.04), [-W / 2 + 0.23, (H - 0.04) / 2, 0], null, null, 1);
  for (let i = 0; i < 3; i++) {
    const y = 0.13 + i * 0.22;
    k.add(fr, box(0.38, 0.19, 0.02), [-W / 2 + 0.23, y, D / 2 - 0.01]);
    k.add(dk, box(0.1, 0.015, 0.02), [-W / 2 + 0.23, y + 0.05, D / 2 + 0.005]);
  }
  k.add(mt, box(0.03, H - 0.04, D - 0.04), [W / 2 - 0.03, (H - 0.04) / 2, 0]);
  k.add(mt, box(W - 0.5, 0.4, 0.02), [0.2, H - 0.26, -D / 2 + 0.04]);
  k.add(L('plastic', 0xe8e4d8), box(0.22, 0.02, 0.3), [0.25, H + 0.01, 0.05], [0, 0.2, 0]);
  k.add(L('plastic', 0xd8c890), box(0.24, 0.012, 0.32), [0.28, H + 0.026, 0.02], [0, -0.1, 0]);
  k.item('mug', [-0.35, H + 0.048, -0.15]);
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2);
};
PROPS.office_chair = (k, c) => {
  const bk = L('plastic', 0x2a2a2c), fab = L('fabric', 0x3a4048);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    k.add(bk, box(0.3, 0.04, 0.05), [Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15], [0, -a, 0]);
    k.add(bk, sph(0.03, 5, 3), [Math.cos(a) * 0.28, 0.03, Math.sin(a) * 0.28]);
  }
  k.add(L('metal', 0x909090), cyl(0.025, 0.025, 0.32, 6), [0, 0.25, 0]);
  k.add(fab, box(0.48, 0.08, 0.46), [0, 0.46, 0]);
  k.add(fab, box(0.44, 0.52, 0.07), [0, 0.8, -0.21], [-0.12, 0, 0]);
  k.add(bk, box(0.06, 0.25, 0.04), [0, 0.6, -0.24]);
  for (const sx of [-1, 1]) {
    k.add(bk, box(0.04, 0.2, 0.04), [sx * 0.24, 0.57, 0.02]);
    k.add(bk, box(0.06, 0.03, 0.26), [sx * 0.24, 0.68, 0.02]);
  }
  colMM(c, -0.3, 0, -0.3, 0.3, 1.06, 0.3);
};
PROPS.filing_cabinet = (k, c) => {
  const body = L('paint', 0x7a8474), front = L('paint', 0x8a9484), dk = L('metal_dark'), lab = L('plastic', 0xe0dccc);
  k.add(body, box(0.46, 1.32, 0.62), [0, 0.66, 0], null, null, 1);
  const open = Math.floor(c.rng() * 5);
  for (let i = 0; i < 4; i++) {
    const y = 0.18 + i * 0.32, dz = i === open ? 0.12 : 0;
    k.add(front, box(0.42, 0.29, 0.02), [0, y, 0.32 + dz]);
    k.add(dk, box(0.12, 0.02, 0.03), [0, y + 0.06, 0.335 + dz]);
    k.add(lab, box(0.08, 0.035, 0.006), [0, y + 0.1, 0.333 + dz]);
    if (dz) k.add(front, box(0.4, 0.2, dz), [0, y, 0.31 + dz / 2]);
  }
  colMM(c, -0.23, 0, -0.31, 0.23, 1.32, 0.33);
};
PROPS.locker = (k, c) => {
  const W = 0.6, H = 1.9, D = 0.5, t = 0.02;
  const tint = [0x5a6a7a, 0x6a7a5a, 0x7a6050][c.pick(3)];
  const m = L('paint', tint), inn = L('metal_dark');
  k.add(m, box(W, H, t), [0, H / 2, -D / 2 + t / 2]);
  k.add(m, box(t, H, D), [-W / 2 + t / 2, H / 2, 0]);
  k.add(m, box(t, H, D), [W / 2 - t / 2, H / 2, 0]);
  k.add(m, box(W, t, D), [0, H - t / 2, 0]);
  k.add(m, box(W, 0.08, D), [0, 0.04, 0]);
  k.add(inn, box(W - 2 * t, 0.02, D - t), [0, 1.55, 0]);
  k.add(inn, plane(W - 2 * t, H - 0.1), [0, H / 2, -D / 2 + t + 0.003]);
  k.add(inn, box(0.02, 0.06, 0.08), [0, 1.45, -D / 2 + 0.06]);
  const hinge = anc(c, 'door', [-W / 2, 0, D / 2]);
  hinge.userData.axis = 'y';
  hinge.userData.openAngle = -1.9;
  leafCollider(hinge, W / 2, H / 2, 0.01, W, H, 0.02);
  const dk = new Kit();
  dk.add(m, box(W - 0.005, H - 0.02, 0.02), [W / 2, H / 2, 0.01]);
  dk.add(L('vent', tint, DECAL), plane(0.36, 0.16), [W / 2, 1.65, 0.022]);
  dk.add(L('vent', tint, DECAL), plane(0.36, 0.16), [W / 2, 0.28, 0.022]);
  dk.add(inn, box(0.03, 0.12, 0.03), [W - 0.07, 1.0, 0.03]);
  dk.add(L('plastic', 0xe0dccc), box(0.1, 0.04, 0.004), [W / 2, 1.42, 0.022]);
  dk.into(hinge);
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2 + 0.02);
};
PROPS.vending_machine = (k, c) => {
  k.add(L('paint', 0x9a2a26), box(1.0, 1.9, 0.8), [0, 0.95, 0], null, null, 1);
  k.add(B('vending_front', 0xd8d8d8, DECAL), plane(0.92, 1.84), [0, 0.95, 0.402]);
  k.add(L('metal_dark'), box(1.02, 0.06, 0.82), [0, 0.03, 0]);
  colMM(c, -0.51, 0, -0.41, 0.51, 1.9, 0.41);
  light(c, [0, 1.2, 0.7], 0xd0e0ff, 0.6, 4);
};
PROPS.ceiling_lamp = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  const m = L('paint', 0x3a4a3a, { double: true }), mt = L('metal_dark'), ch = L('chain', 0x909090);
  k.add(mt, cyl(0.06, 0.06, 0.03, 8), [0, -0.015, 0]);
  k.add(ch, scaleUV(plane(0.04, 0.45), 1, 2), [0, -0.255, 0]);
  k.add(ch, scaleUV(plane(0.04, 0.45), 1, 2), [0, -0.255, 0], [0, HP, 0]);
  k.add(mt, cyl(0.05, 0.05, 0.05, 8), [0, -0.47, 0]);
  k.add(m, cyl(0.05, 0.28, 0.22, 10, true), [0, -0.59, 0]);
  k.add(B(null, 0xfff0c0), sph(0.055, 6, 4), [0, -0.63, 0]);
  light(c, [0, -0.8, 0], 0xffe0b0, 1.2, 10);
  colMM(c, -0.28, -0.72, -0.28, 0.28, -0.45, 0.28);
};
PROPS.wall_lamp = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const y = 2.2, mt = L('metal_dark');
  k.add(mt, box(0.14, 0.2, 0.03), [0, y, 0.015]);
  k.add(mt, box(0.04, 0.04, 0.1), [0, y, 0.07]);
  k.add(mt, cyl(0.035, 0.05, 0.04, 8), [0, y, 0.14], [HP, 0, 0]);
  k.add(B(null, 0xffe8b0), sph(0.05, 6, 5), [0, y, 0.2]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + PI / 4;
    k.limb(mt, [Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, 0.16], [Math.cos(a) * 0.065, y + Math.sin(a) * 0.065, 0.26], 0.005, 0.005, 3);
  }
  k.add(mt, tor(0.065, 0.006, 3, 8), [0, y, 0.26]);
  light(c, [0, y, 0.4], 0xffd8a0, 0.9, 7);
  colMM(c, -0.08, y - 0.1, 0, 0.08, y + 0.1, 0.27);
};
PROPS.fluorescent = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  k.add(L('paint', 0xc8c8c0), box(1.3, 0.06, 0.26), [0, -0.03, 0]);
  for (const z of [-0.06, 0.06]) k.add(B(null, 0xe8fff4), cyl(0.016, 0.016, 1.2, 6), [0, -0.078, z], [0, 0, HP]);
  for (const x of [-0.62, 0.62]) k.add(L('plastic', 0xd0d0c8), box(0.03, 0.05, 0.22), [x, -0.07, 0]);
  light(c, [0, -0.3, 0], 0xd8f0ff, 1.0, 9);
  colMM(c, -0.65, -0.1, -0.13, 0.65, 0, 0.13);
};
PROPS.generator = (k, c) => {
  const dk = L('metal_dark'), body = L('paint', 0xa89028), rust = L('metal_rust');
  k.add(dk, box(2.0, 0.12, 1.0), [0, 0.06, 0], null, null, 1);
  k.add(body, box(1.8, 1.1, 0.9), [0, 0.67, 0], null, null, 1);
  k.add(L('vent', 0xb0b0b0, DECAL), plane(0.7, 0.8), [0.902, 0.67, 0], [0, HP, 0]);
  k.add(L('vent', 0xb0b0b0, DECAL), plane(0.5, 0.35), [-0.3, 0.8, 0.452]);
  k.add(L('hazard_stripes', 0xffffff, DECAL), scaleUV(plane(1.98, 0.1), 4, 0.2), [0, 0.06, 0.502]);
  k.add(dk, box(0.5, 0.4, 0.08), [0.5, 0.8, 0.49]);
  for (const x of [0.38, 0.62]) k.add(L('gauge', 0xffffff, DECAL), circ(0.075, 8), [x, 0.88, 0.532]);
  k.add(B(null, 0x40ff40), box(0.04, 0.04, 0.02), [0.38, 0.68, 0.535]);
  k.add(B(null, 0xff3020), box(0.04, 0.04, 0.02), [0.62, 0.68, 0.535]);
  k.add(rust, cyl(0.06, 0.06, 0.6, 8), [-0.6, 1.5, -0.25]);
  k.add(rust, cyl(0.12, 0.12, 0.3, 8), [-0.6, 1.36, -0.25]);
  k.add(dk, cyl(0.07, 0.07, 0.06, 6), [0.3, 1.25, -0.2]);
  colMM(c, -1.0, 0, -0.5, 1.0, 1.22, 0.53);
  col(c, -0.6, 1.5, -0.25, 0.26, 0.6, 0.26);
};
PROPS.server_rack_prop = (k, c) => {
  k.add(L('metal_dark'), box(0.6, 2.0, 1.0), [0, 1.0, 0], null, null, 1);
  k.add(L('server_front', 0xffffff, DECAL), plane(0.56, 1.94), [0, 1.0, 0.502]);
  for (const sx of [-1, 1]) k.add(L('metal', 0xa0a0a0), box(0.02, 0.4, 0.03), [sx * 0.31, 1.2, 0.49]);
  const leds = new THREE.Group();
  leds.name = 'leds';
  const lk = new Kit();
  for (let i = 0; i < 14; i++) lk.add(B(null, i % 4 ? 0x50ff70 : 0xffb030), box(0.022, 0.012, 0.006), [-0.2 + (i % 3) * 0.03, 0.15 + i * 0.13, 0.506]);
  lk.into(leds);
  c.root.add(leds);
  c.extra.blink = leds;
  colMM(c, -0.32, 0, -0.5, 0.32, 2.0, 0.51);
};
PROPS.boiler = (k, c) => {
  const tank = L('metal_rust', 0xb0a898), dk = L('metal_dark'), pipe = L('pipes', 0x8a7a6a);
  k.add(tank, cyl(0.8, 0.8, 2.2, 12), [0, 1.4, 0], null, null, 1.2);
  k.add(tank, hemi(0.8, 12, 3), [0, 2.5, 0], null, [1, 0.45, 1], 1.2);
  for (const y of [0.7, 2.1]) k.add(dk, cyl(0.83, 0.83, 0.08, 12, true), [0, y, 0]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; k.add(dk, box(0.12, 0.35, 0.12), [Math.cos(a) * 0.55, 0.175, Math.sin(a) * 0.55]); }
  k.add(dk, box(0.5, 0.4, 0.1), [0, 0.6, 0.78]);
  k.add(B(null, 0xff7020), box(0.3, 0.05, 0.02), [0, 0.55, 0.835]);
  for (const x of [-0.25, 0.25]) {
    k.add(dk, cyl(0.03, 0.03, 0.12, 6), [x, 1.7, 0.84], [HP, 0, 0]);
    k.add(dk, cyl(0.1, 0.1, 0.04, 8), [x, 1.7, 0.9], [HP, 0, 0]);
    k.add(L('gauge', 0xffffff, DECAL), circ(0.085, 8), [x, 1.7, 0.922]);
  }
  k.limb(pipe, [0.3, 2.5, 0.1], [0.3, 3.5, 0.1], 0.1, 0.1, 8);
  k.limb(pipe, [0.3, 3.5, 0.1], [0.3, 3.5, -1.3], 0.1, 0.1, 8);
  k.add(pipe, sph(0.11, 6, 4), [0.3, 3.5, 0.1]);
  k.limb(pipe, [-0.75, 1.2, 0], [-1.5, 1.2, 0], 0.08, 0.08, 8);
  k.limb(pipe, [-1.5, 1.2, 0], [-1.5, 0, 0], 0.08, 0.08, 8);
  k.add(pipe, sph(0.09, 6, 4), [-1.5, 1.2, 0]);
  k.add(L('paint', 0xa02020), tor(0.14, 0.015, 3, 10), [-1.15, 1.2, 0], [0, HP, 0]);
  colMM(c, -0.83, 0, -0.83, 0.83, 2.9, 0.9);
  col(c, -1.15, 1.2, 0, 0.75, 0.2, 0.2);
  col(c, -1.5, 0.6, 0, 0.2, 1.3, 0.2);
};
PROPS.toilet = (k, c) => {
  const p = L('plastic', 0xe0ded4), mt = L('metal', 0xc0c0c0);
  k.add(p, cyl(0.12, 0.15, 0.3, 8), [0, 0.15, 0.05], null, [1, 1, 1.2]);
  k.add(p, cyl(0.21, 0.15, 0.12, 8), [0, 0.36, 0.08], null, [0.9, 1, 1.2]);
  k.add(L('water', 0x7a9a98), circ(0.15, 8), [0, 0.41, 0.08], [-HP, 0, 0], [0.9, 1.2, 1]);
  k.add(p, tor(0.16, 0.035, 3, 8), [0, 0.435, 0.08], [HP, 0, 0], [0.9, 1.2, 0.5]);
  k.add(p, box(0.36, 0.44, 0.03), [0, 0.66, -0.12], [-0.15, 0, 0]);
  k.add(p, box(0.42, 0.36, 0.18), [0, 0.62, -0.2]);
  k.add(p, box(0.44, 0.03, 0.2), [0, 0.815, -0.2]);
  k.add(mt, box(0.06, 0.015, 0.02), [0.15, 0.74, -0.105]);
  colMM(c, -0.22, 0, -0.3, 0.22, 0.83, 0.34);
};
PROPS.sink = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const p = L('plastic', 0xe0ded4), mt = L('metal', 0xc0c0c0), y = 0.84;
  k.add(p, box(0.56, 0.04, 0.44), [0, y - 0.16, 0.24]);
  k.add(p, box(0.56, 0.16, 0.04), [0, y - 0.08, 0.44]);
  k.add(p, box(0.56, 0.16, 0.04), [0, y - 0.08, 0.04]);
  k.add(p, box(0.04, 0.16, 0.36), [-0.26, y - 0.08, 0.24]);
  k.add(p, box(0.04, 0.16, 0.36), [0.26, y - 0.08, 0.24]);
  k.add(L(null, 0x202020), cyl(0.025, 0.025, 0.005, 6), [0, y - 0.137, 0.24]);
  k.add(p, cyl(0.08, 0.1, y - 0.18, 8), [0, (y - 0.18) / 2, 0.2]);
  k.add(mt, cyl(0.02, 0.02, 0.12, 6), [0, y + 0.04, 0.09]);
  k.add(mt, box(0.03, 0.03, 0.12), [0, y + 0.1, 0.14]);
  for (const sx of [-1, 1]) k.add(mt, cyl(0.02, 0.02, 0.03, 6), [sx * 0.09, y + 0.02, 0.09]);
  k.add(L('metal_dark'), box(0.54, 0.64, 0.02), [0, 1.5, 0.01]);
  k.add(L('glass', 0x6a7a80, DECAL), plane(0.5, 0.6), [0, 1.5, 0.022]);
  colMM(c, -0.28, 0, 0, 0.28, y, 0.46);
};
PROPS.water_cooler = (k, c) => {
  const body = L('plastic', 0xd8d8d0), jug = L('glass', 0x70a0ff, { opacity: 0.65 });
  k.add(body, box(0.32, 1.0, 0.32), [0, 0.5, 0]);
  k.add(jug, cyl(0.14, 0.14, 0.34, 8), [0, 1.23, 0]);
  k.add(jug, cyl(0.14, 0.05, 0.06, 8), [0, 1.03, 0]);
  k.add(L(null, 0x202428), plane(0.24, 0.2), [0, 0.72, 0.162]);
  k.add(L('plastic', 0xc03020), box(0.03, 0.04, 0.04), [-0.06, 0.8, 0.17]);
  k.add(L('plastic', 0x2040c0), box(0.03, 0.04, 0.04), [0.06, 0.8, 0.17]);
  k.add(L('metal_dark'), box(0.2, 0.02, 0.08), [0, 0.63, 0.18]);
  colMM(c, -0.17, 0, -0.17, 0.17, 1.4, 0.2);
};
PROPS.hospital_bed = (k, c) => {
  const mt = L('metal', 0xb0b4b4), pnt = L('paint', 0xc8ccc4);
  k.add(mt, box(0.9, 0.08, 2.0), [0, 0.5, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.add(mt, box(0.04, 0.44, 0.04), [x * 0.42, 0.26, z * 0.95]);
    k.add(L('rubber'), cyl(0.04, 0.04, 0.03, 6), [x * 0.42, 0.04, z * 0.95], [0, 0, HP]);
  }
  k.add(L('mattress'), box(0.86, 0.14, 1.9), [0, 0.61, 0.02], null, null, 0.5);
  k.add(L('plastic', 0xe8e8e0), box(0.6, 0.1, 0.3), [0, 0.73, -0.75]);
  k.add(pnt, box(0.9, 0.6, 0.04), [0, 0.8, -1.0]);
  k.add(pnt, box(0.9, 0.35, 0.04), [0, 0.68, 1.0]);
  for (const sx of [-1, 1]) k.add(mt, box(0.03, 0.18, 1.0), [sx * 0.46, 0.76, -0.2]);
  k.add(L('blood_splat', 0xffffff, DECAL), plane(0.55, 0.55), [0.1, 0.684, 0.25], [-HP, 0, 0.7]);
  k.add(mt, cyl(0.012, 0.012, 1.8, 5), [0.6, 0.9, -0.85]);
  k.add(mt, box(0.3, 0.02, 0.3), [0.6, 0.01, -0.85]);
  k.add(L('glass', 0xd0e0c0, { opacity: 0.7 }), box(0.12, 0.2, 0.04), [0.6, 1.66, -0.85]);
  colMM(c, -0.47, 0, -1.02, 0.47, 0.75, 1.02);
  col(c, 0.6, 0.9, -0.85, 0.12, 1.8, 0.12);
};
PROPS.table = (k, c) => {
  const W = 1.6, D = 0.9, H = 0.76, wd = L('wood_dark', 0xb08a68), r = c.rng;
  k.add(wd, box(W, 0.05, D), [0, H - 0.025, 0], null, null, 1);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(wd, box(0.06, H - 0.05, 0.06), [x * (W / 2 - 0.06), (H - 0.05) / 2, z * (D / 2 - 0.06)]);
  for (const z of [-1, 1]) k.add(wd, box(W - 0.14, 0.1, 0.03), [0, H - 0.1, z * (D / 2 - 0.06)]);
  for (const x of [-1, 1]) k.add(wd, box(0.03, 0.1, D - 0.14), [x * (W / 2 - 0.06), H - 0.1, 0]);
  const it = ['mug', 'canned', 'pickles', 'skull', 'mug'][Math.floor(r() * 5)];
  const sz = createItemSizeCache(it);
  k.item(it, [(r() - 0.5) * W * 0.6, H + sz[1] / 2, (r() - 0.5) * D * 0.5], [0, r() * TAU, 0]);
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2);
};
PROPS.bookcase = (k, c) => {
  const W = 1.2, H = 2.1, D = 0.4, t = 0.04, wd = L('wood_dark'), books = L('books'), r = c.rng;
  for (const sx of [-1, 1]) k.add(wd, box(t, H, D), [sx * (W / 2 - t / 2), H / 2, 0]);
  k.add(wd, box(W, t, D), [0, H - t / 2, 0]);
  k.add(wd, box(W, 0.08, D), [0, 0.04, 0]);
  k.add(wd, box(W, H, 0.02), [0, H / 2, -D / 2 + 0.01]);
  const bottoms = [0.08, 0.595, 1.095, 1.595];
  for (let i = 1; i < 4; i++) k.add(wd, box(W - 2 * t, 0.03, D - 0.02), [0, bottoms[i] - 0.015, 0]);
  for (const b of bottoms) {
    const full = r() > 0.25, w = full ? W - 2 * t - 0.02 : (W - 2 * t) * (0.4 + r() * 0.3);
    const x = full ? 0 : -W / 2 + t + w / 2 + (r() < 0.5 ? 0 : W - 2 * t - w);
    const g = scaleUV(box(w, 0.4, 0.26), w / 1.1, 0.5);
    k.add(books, g, [x, b + 0.2, 0.0]);
    if (!full && r() < 0.5) {
      const it = r() < 0.5 ? 'skull' : 'lamp';
      const sz = createItemSizeCache(it);
      if (sz[1] < 0.48) k.item(it, [x > 0 ? -0.3 : 0.3, b + sz[1] / 2, 0.02]);
    }
  }
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2);
};
PROPS.armchair = (k, c) => {
  const f = L('fabric', [0x6a2a2a, 0x2a4a3a, 0x5a4a3a][c.pick(3)]), wd = L('wood_dark');
  k.add(f, box(0.8, 0.22, 0.75), [0, 0.24, 0.02]);
  k.add(f, box(0.56, 0.12, 0.62), [0, 0.41, 0.06]);
  k.add(f, box(0.8, 0.72, 0.18), [0, 0.66, -0.3], [-0.1, 0, 0]);
  for (const sx of [-1, 1]) k.add(f, box(0.14, 0.34, 0.72), [sx * 0.33, 0.5, 0.03]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(wd, box(0.05, 0.13, 0.05), [x * 0.35, 0.065, z * 0.33]);
  colMM(c, -0.4, 0, -0.42, 0.4, 1.0, 0.4);
};
PROPS.grandfather_clock = (k, c) => {
  const wd = L('wood_dark', 0x9a7050), gold = L('gold', 0xc8a060);
  k.add(wd, box(0.55, 0.45, 0.36), [0, 0.225, 0]);
  k.add(wd, box(0.45, 1.1, 0.3), [0, 1.0, 0]);
  k.add(wd, box(0.55, 0.5, 0.36), [0, 1.8, 0]);
  k.add(wd, box(0.6, 0.05, 0.4), [0, 2.075, 0]);
  k.add(wd, box(0.3, 0.12, 0.3), [0, 2.16, 0]);
  k.add(gold, sph(0.04, 5, 3), [0, 2.26, 0]);
  k.add(L('clock_face', 0xffffff, DECAL), circ(0.2, 12), [0, 1.8, 0.182]);
  // window frame + pendulum behind glass
  k.add(wd, box(0.45, 0.12, 0.03), [0, 1.49, 0.165]);
  k.add(wd, box(0.45, 0.12, 0.03), [0, 0.51, 0.165]);
  for (const sx of [-1, 1]) k.add(wd, box(0.09, 0.86, 0.03), [sx * 0.18, 1.0, 0.165]);
  k.add(L('glass', 0x607078, { opacity: 0.35 }), plane(0.27, 0.86), [0, 1.0, 0.176]);
  const pend = anc(c, 'pendulum', [0, 1.45, 0.158]);
  pend.userData.axis = 'z';
  pend.userData.swing = 0.25;
  const pk = new Kit();
  pk.add(gold, box(0.012, 0.7, 0.006), [0, -0.35, 0]);
  pk.add(gold, cyl(0.07, 0.07, 0.012, 10), [0, -0.72, 0], [HP, 0, 0]);
  pk.into(pend);
  colMM(c, -0.28, 0, -0.18, 0.28, 2.3, 0.2);
};
PROPS.fireplace = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const br = L('brick'), mb = L('marble', 0xd8d0c8), soot = L('concrete_dark', 0x505050);
  for (const sx of [-1, 1]) k.add(br, box(0.4, 1.15, 0.55), [sx * 0.7, 0.575, 0.275], null, null, 1);
  k.add(br, box(1.0, 0.35, 0.55), [0, 0.975, 0.275], null, null, 1);
  k.add(soot, box(1.0, 0.8, 0.05), [0, 0.4, 0.025], null, null, 1);
  k.add(soot, box(1.0, 0.04, 0.5), [0, 0.02, 0.3], null, null, 1);
  k.add(mb, box(1.9, 0.08, 0.66), [0, 1.19, 0.31], null, null, 1);
  k.add(mb, box(1.9, 0.05, 0.4), [0, 0.025, 0.75], null, null, 1);
  const bark = L('bark');
  k.add(bark, cyl(0.07, 0.07, 0.6, 6), [0, 0.1, 0.3], [0, 0.2, HP]);
  k.add(bark, cyl(0.06, 0.06, 0.55, 6), [0.05, 0.19, 0.28], [0, -0.35, HP]);
  const emb = B(null, 0xff5010);
  for (let i = 0; i < 4; i++) k.add(emb, box(0.08, 0.03, 0.06), [-0.3 + i * 0.2, 0.05, 0.35 + (i % 2) * 0.08]);
  const fire = B('fire', 0xffffff);
  k.add(fire, plane(0.6, 0.5), [0, 0.3, 0.3]);
  k.add(fire, plane(0.45, 0.45), [0, 0.28, 0.3], [0, HP, 0]);
  k.item('painting', [0, 1.75, 0.03], null, 0.9);
  light(c, [0, 0.5, 0.7], 0xff7030, 0.6, 5, { flicker: true });
  colMM(c, -0.95, 0, 0, 0.95, 1.23, 0.64);
};
PROPS.chandelier = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  const g = L('gold', 0xb08a48), ch = L('chain', 0xc0a060), wax = L('plastic', 0xf0ead8), flame = B(null, 0xffd070), cry = B(null, 0xd8f0ff);
  k.add(ch, scaleUV(plane(0.05, 0.6), 1, 2.5), [0, -0.3, 0]);
  k.add(ch, scaleUV(plane(0.05, 0.6), 1, 2.5), [0, -0.3, 0], [0, HP, 0]);
  k.add(g, cyl(0.03, 0.05, 0.3, 6), [0, -0.75, 0]);
  k.add(g, sph(0.08, 6, 4), [0, -0.92, 0]);
  k.add(g, tor(0.45, 0.018, 3, 12), [0, -0.9, 0], [HP, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45;
    k.beam(g, [0, -0.92, 0], [x, -0.9, z], 0.02);
    k.add(wax, cyl(0.02, 0.02, 0.1, 5), [x, -0.84, z]);
    k.add(flame, cone(0.015, 0.04, 4), [x, -0.77, z]);
    const a2 = a + PI / 6;
    k.add(cry, G.oct(0.022), [Math.cos(a2) * 0.3, -1.0, Math.sin(a2) * 0.3], null, [1, 1.6, 1]);
  }
  light(c, [0, -1.0, 0], 0xffd8a0, 1.0, 9, { flicker: true });
};
PROPS.vent_cover = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const W = 0.8, H = 0.6, y0 = 0.1, t = 0.05, fr = L('metal', 0x8a8e8a);
  k.add(fr, box(W, t, 0.04), [0, y0 + H - t / 2, 0.02]);
  k.add(fr, box(W, t, 0.04), [0, y0 + t / 2, 0.02]);
  for (const sx of [-1, 1]) k.add(fr, box(t, H - 2 * t, 0.04), [sx * (W / 2 - t / 2), y0 + H / 2, 0.02]);
  k.add(B(null, 0x040404), plane(W - 2 * t, H - 2 * t), [0, y0 + H / 2, 0.004]);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(L('metal_dark'), box(0.02, 0.02, 0.01), [sx * (W / 2 - t / 2), y0 + H / 2 + sy * (H / 2 - t / 2), 0.044]);
  const gr = anc(c, 'grate', [0, y0 + t, 0.03]);
  gr.userData.axis = 'x';
  gr.userData.openAngle = HP;
  leafCollider(gr, 0, (H - 2 * t) / 2, 0, W - 2 * t, H - 2 * t, 0.015);
  const gk = new Kit();
  gk.add(L('vent', 0xa0a4a0), box(W - 2 * t - 0.01, H - 2 * t - 0.01, 0.015), [0, (H - 2 * t) / 2, 0]);
  gk.into(gr);
};
PROPS.fuse_box = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const W = 0.5, H = 0.6, D = 0.15, y0 = 1.1, m = L('paint', 0x6a7a6a);
  k.add(m, box(W, H, 0.02), [0, y0 + H / 2, 0.01]);
  for (const sx of [-1, 1]) k.add(m, box(0.02, H, D), [sx * (W / 2 - 0.01), y0 + H / 2, D / 2]);
  for (const sy of [0, 1]) k.add(m, box(W, 0.02, D), [0, y0 + 0.01 + sy * (H - 0.02), D / 2]);
  k.add(L('fuse_panel', 0xffffff, DECAL), plane(W - 0.06, H - 0.06), [0, y0 + H / 2, 0.022]);
  k.add(L('metal_dark'), cyl(0.025, 0.025, 1.0, 6), [0.15, y0 + H + 0.5, 0.05]);
  const hinge = anc(c, 'panel', [-W / 2, y0, D]);
  hinge.userData.axis = 'y';
  hinge.userData.openAngle = -1.9;
  leafCollider(hinge, W / 2, H / 2, 0.01, W, H, 0.02);
  const dk = new Kit();
  dk.add(m, box(W, H, 0.02), [W / 2, H / 2, 0.01]);
  dk.add(L('sign_danger', 0xffffff, DECAL), plane(0.18, 0.18), [W / 2, H * 0.62, 0.022]);
  dk.add(L('metal_dark'), box(0.03, 0.1, 0.03), [W - 0.05, H / 2, 0.03]);
  dk.into(hinge);
  colMM(c, -W / 2, y0, 0, W / 2, y0 + H, D + 0.02);
};
PROPS.vault_door = (k, c) => {
  c.mount = 'wall';
  const S = 2.6, SH = 2.8, R = 1.1, cy = 1.2, depth = 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-S / 2, 0); shape.lineTo(S / 2, 0); shape.lineTo(S / 2, SH); shape.lineTo(-S / 2, SH); shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, cy, R, 0, TAU, true);
  shape.holes.push(hole);
  k.add(L('metal_plate', 0x9a9c98), new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }), [0, 0, -depth / 2], null, null, 1);
  const dk = L('metal_dark'), steel = L('metal', 0xb8bab4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + PI / 8;
    k.add(dk, cyl(0.05, 0.05, 0.04, 6), [Math.cos(a) * 1.22, cy + Math.sin(a) * 1.22, 0.27], [HP, 0, 0]);
  }
  for (const sy of [-1, 1]) k.add(dk, cyl(0.07, 0.07, 0.3, 8), [-1.2, cy + sy * 0.6, 0.4]);
  const hinge = anc(c, 'hinge', [-1.2, cy, 0.4]);
  hinge.userData.axis = 'y';
  hinge.userData.openAngle = -1.7;
  leafCollider(hinge, 1.2, 0, 0, 2.3, 2.3, 0.3);
  const lk = new Kit();
  lk.add(L('metal_plate', 0xb0b2ae), cyl(1.15, 1.15, 0.3, 16), [1.2, 0, 0], [HP, 0, 0], null, 0.8);
  lk.add(dk, tor(0.95, 0.035, 3, 16), [1.2, 0, 0.155]);
  lk.add(dk, cyl(0.14, 0.14, 0.1, 8), [1.2, 0, 0.2], [HP, 0, 0]);
  for (const sy of [-1, 1]) lk.add(dk, box(0.3, 0.14, 0.08), [0.12, sy * 0.6, 0]);
  lk.add(steel, cyl(0.1, 0.1, 0.06, 10), [1.75, 0.45, 0.18], [HP, 0, 0]);
  lk.into(hinge);
  const wheel = anc(c, 'wheel', [1.2, 0, 0.27], null, hinge);
  wheel.userData.axis = 'z';
  const wk = new Kit();
  wk.add(steel, tor(0.35, 0.03, 4, 12));
  for (let i = 0; i < 3; i++) wk.add(steel, box(0.7, 0.04, 0.03), [0, 0, 0], [0, 0, (i / 3) * PI]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; wk.add(dk, sph(0.04, 5, 3), [Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0]); }
  wk.into(wheel);
  colMM(c, -1.3, 0, -0.25, -1.1, SH, 0.25);
  colMM(c, 1.1, 0, -0.25, 1.3, SH, 0.25);
  colMM(c, -1.1, 2.3, -0.25, 1.1, SH, 0.25);
  colMM(c, -1.1, 0, -0.25, 1.1, 0.1, 0.25);
  for (const sx of [-1, 1]) {
    colMM(c, Math.min(sx * 1.1, sx * 0.7), 1.95, -0.25, Math.max(sx * 1.1, sx * 0.7), 2.3, 0.25);
    colMM(c, Math.min(sx * 1.1, sx * 0.7), 0.1, -0.25, Math.max(sx * 1.1, sx * 0.7), 0.45, 0.25);
  }
};
PROPS.keypad = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const y = 1.4;
  k.add(L('metal_dark'), box(0.16, 0.24, 0.04), [0, y, 0.02]);
  k.add(L('keypad', 0xffffff, DECAL), plane(0.14, 0.21), [0, y - 0.005, 0.0415]);
  k.add(B(null, 0xff2020), box(0.012, 0.012, 0.006), [0.06, y + 0.105, 0.042]);
  const s = screenMesh('screen', 0.114, 0.035, 'screen_off', 0x60ff80);
  s.position.set(0, y + 0.069, 0.046);
  c.root.add(s);
  c.anchors.screen = s;
};
PROPS.blast_door = (k, c) => {
  c.mount = 'wall';
  const OW = 3.2, OH = 3.4, FD = 0.6, post = 0.5, head = 0.45;
  const fr = L('metal_plate', 0x8a8c88), hz = L('hazard_stripes', 0xffffff, DECAL), dk = L('metal_dark');
  for (const sx of [-1, 1]) {
    const x = sx * (OW / 2 + post / 2);
    k.add(fr, box(post, OH + head, FD), [x, (OH + head) / 2, 0], null, null, 1);
    k.add(hz, scaleUV(plane(0.22, OH), 0.5, 7), [x, OH / 2, FD / 2 + 0.004]);
    k.add(hz, scaleUV(plane(0.22, OH), 0.5, 7), [x, OH / 2, -FD / 2 - 0.004], [0, PI, 0]);
    k.add(B(null, 0xff3020), box(0.14, 0.14, 0.08), [sx * 1.3, OH + head / 2, FD / 2 + 0.04]);
  }
  k.add(fr, box(OW + 2 * post, head, FD), [0, OH + head / 2, 0], null, null, 1);
  k.add(hz, scaleUV(plane(OW - 0.8, 0.2), 6, 0.4), [0, OH + head / 2, FD / 2 + 0.004]);
  k.add(dk, box(OW, 0.03, FD), [0, 0.015, 0], null, null, 1);
  for (const [name, sx] of [['leafL', -1], ['leafR', 1]]) {
    const a = anc(c, name, [(sx * OW) / 4, 0, 0]);
    a.userData.axis = 'x';
    a.userData.openOffset = [sx * (OW / 2 - 0.1), 0, 0];
    leafCollider(a, 0, OH / 2, 0, OW / 2, OH, 0.2);
    const lk = new Kit();
    lk.add(L('blast_door'), box(OW / 2, OH, 0.2), [0, OH / 2, 0]);
    lk.add(dk, box(0.06, OH, 0.22), [-sx * (OW / 4 - 0.03), OH / 2, 0]);
    lk.into(a);
  }
  colMM(c, -OW / 2 - post, 0, -FD / 2, -OW / 2, OH + head, FD / 2);
  colMM(c, OW / 2, 0, -FD / 2, OW / 2 + post, OH + head, FD / 2);
  colMM(c, -OW / 2, OH, -FD / 2, OW / 2, OH + head, FD / 2);
};
function simpleDoor(k, c, o) {
  c.mount = 'wall';
  const W = 1.2, H = 2.3, D = 0.2, jt = 0.1;
  for (const sx of [-1, 1]) k.add(o.frame, box(jt, H + jt, D), [sx * (W / 2 + jt / 2), (H + jt) / 2, 0], null, null, 1);
  k.add(o.frame, box(W + 2 * jt, jt, D), [0, H + jt / 2, 0], null, null, 1);
  if (o.trim) {
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) k.add(o.trim, box(0.08, H + 0.14, 0.03), [sx * (W / 2 + 0.1), (H + 0.14) / 2, sz * (D / 2 + 0.015)]);
      k.add(o.trim, box(W + 0.36, 0.1, 0.03), [0, H + 0.15, sz * (D / 2 + 0.015)]);
    }
  }
  const hinge = anc(c, 'hinge', [-W / 2, 0, 0]);
  hinge.userData.axis = 'y';
  hinge.userData.openAngle = 1.6;
  leafCollider(hinge, W / 2, H / 2, 0, W, H, 0.05);
  const lk = new Kit();
  lk.add(o.leaf, box(W - 0.01, H - 0.01, 0.05), [W / 2, H / 2, 0]);
  if (o.panels) {
    for (const sz of [-1, 1]) for (const [px, py, pw, ph] of [[0.3, 0.55, 0.4, 0.7], [0.82, 0.55, 0.4, 0.7], [0.3, 1.55, 0.4, 0.95], [0.82, 1.55, 0.4, 0.95]]) {
      lk.add(o.panels, box(pw, ph, 0.015), [px, py, sz * 0.03]);
    }
  }
  for (const sz of [-1, 1]) {
    if (o.knob) lk.add(o.knob, sph(0.035, 6, 4), [W - 0.12, 1.0, sz * 0.06]);
    else {
      lk.add(o.handle, box(0.14, 0.022, 0.03), [W - 0.16, 1.0, sz * 0.05]);
      lk.add(o.handle, cyl(0.03, 0.03, 0.012, 6), [W - 0.1, 1.0, sz * 0.03], [HP, 0, 0]);
    }
  }
  lk.into(hinge);
  colMM(c, -W / 2 - jt, 0, -D / 2, -W / 2, H + jt, D / 2);
  colMM(c, W / 2, 0, -D / 2, W / 2 + jt, H + jt, D / 2);
  colMM(c, -W / 2, H, -D / 2, W / 2, H + jt, D / 2);
}
PROPS.door_single = (k, c) => simpleDoor(k, c, { frame: L('metal', 0x7a8078), leaf: L('door_metal'), handle: L('metal', 0xb0b0b0) });
PROPS.door_mansion = (k, c) => simpleDoor(k, c, {
  frame: L('wood_dark', 0xc09060), trim: L('wood_dark', 0xa07850), leaf: L('wood_floor', 0xc89068),
  panels: L('wood_floor', 0xa87450), knob: L('gold', 0xd0a848),
});
PROPS.cardboard_boxes = (k, c) => {
  const cb = L('cardboard'), r = c.rng;
  const n = 2 + Math.floor(r() * 2);
  const bottoms = [];
  for (let i = 0; i < n; i++) {
    const s = [0.45 + r() * 0.15, 0.35 + r() * 0.2, 0.4 + r() * 0.2];
    const x = (i - (n - 1) / 2) * 0.58, z = (r() - 0.5) * 0.15;
    k.add(cb, box(s[0], s[1], s[2]), [x, s[1] / 2, z], [0, (r() - 0.5) * 0.2, 0]);
    col(c, x, s[1] / 2, z, s[0], s[1], s[2]);
    bottoms.push([x, s[1], z]);
  }
  for (let i = 0; i < n; i++) {
    if (r() > 0.6) continue;
    const b = bottoms[i];
    const s = [0.32 + r() * 0.1, 0.25 + r() * 0.15, 0.32 + r() * 0.1];
    k.add(cb, box(s[0], s[1], s[2]), [b[0], b[1] + s[1] / 2, b[2]], [0, (r() - 0.5) * 0.4, 0]);
    col(c, b[0], b[1] + s[1] / 2, b[2], s[0], s[1], s[2]);
  }
};
PROPS.pallet = (k, c) => {
  const w = L('wood_planks', 0xc8b090);
  for (let i = 0; i < 5; i++) k.add(w, box(1.2, 0.022, 0.1), [0, 0.133, -0.45 + i * 0.225]);
  for (const z of [-0.45, 0, 0.45]) k.add(w, box(1.2, 0.1, 0.1), [0, 0.072, z]);
  for (const x of [-0.55, 0, 0.55]) k.add(w, box(0.1, 0.022, 1.0), [x, 0.011, 0]);
  col(c, 0, 0.072, 0, 1.2, 0.144, 1.0);
};
PROPS.traffic_cone = (k, c) => {
  const o = L('plastic', 0xe06020), w = L('plastic', 0xf0f0e8);
  k.add(L('plastic', 0x202020), box(0.36, 0.03, 0.36), [0, 0.015, 0]);
  k.add(o, cyl(0.03, 0.14, 0.62, 8), [0, 0.34, 0]);
  const rad = (y) => 0.14 - ((y - 0.03) / 0.62) * 0.11;
  for (const y of [0.3, 0.46]) k.add(w, cyl(rad(y + 0.035) + 0.006, rad(y - 0.035) + 0.006, 0.07, 8, true), [0, y, 0]);
  col(c, 0, 0.33, 0, 0.36, 0.66, 0.36);
};
PROPS.bench = (k, c) => {
  const wd = L('wood_planks', 0xb08a60), mt = L('metal_dark');
  for (const z of [-0.07, 0.05, 0.17]) k.add(wd, box(1.6, 0.04, 0.1), [0, 0.45, z]);
  for (const y of [0.62, 0.78]) k.add(wd, box(1.6, 0.1, 0.03), [0, y, -0.15 - (y - 0.62) * 0.2], [-0.2, 0, 0]);
  for (const x of [-0.65, 0.65]) {
    k.add(mt, box(0.05, 0.43, 0.05), [x, 0.215, 0.17]);
    k.beam(mt, [x, 0, -0.1], [x, 0.86, -0.19], 0.05);
    k.add(mt, box(0.05, 0.04, 0.4), [x, 0.41, 0.04]);
  }
  col(c, 0, 0.235, 0.04, 1.6, 0.47, 0.42);
  col(c, 0, 0.66, -0.16, 1.6, 0.4, 0.1);
};
PROPS.catwalk_railing = (k, c) => {
  const m = L('paint', 0xb09030);
  for (let i = 0; i <= 4; i++) k.add(m, box(0.05, 1.1, 0.05), [-2 + i, 0.55, 0]);
  k.add(m, box(4.05, 0.05, 0.06), [0, 1.08, 0]);
  k.add(m, box(4.0, 0.035, 0.035), [0, 0.58, 0]);
  k.add(L('hazard_stripes'), box(4.0, 0.12, 0.015), [0, 0.07, 0], null, null, 0.5);
  col(c, 0, 0.55, 0, 4.05, 1.1, 0.08);
};
PROPS.stairs_metal = (k, c) => {
  const N = 15, rise = 3 / N, run = 5 / N, W = 2.0, z0 = 2.5;
  const tread = L('ship_floor', 0xc0c0c0), fr = L('metal_dark', 0x808080), rail = L('paint', 0xb09030);
  for (let i = 0; i < N; i++) {
    const top = (i + 1) * rise, zc = z0 - (i + 0.5) * run;
    k.add(tread, box(W - 0.1, 0.04, run + 0.01), [0, top - 0.02, zc], null, null, 1);
  }
  // colliders: ONE inclined ramp (+ skirt boxes under it) instead of 15 stepped boxes (world/stairs.js: steps stalled against the rail colliders)
  const sp = planStairs({ x: 0, z: z0, y: 0, dir: 'z-', width: W, rise: N * rise, run: N * run, n: N, landing: 0, tag: 'stairs_metal' });
  for (const b of sp.boxes) col(c, b.cx, b.cy, b.cz, b.sx, b.sy, b.sz);
  c.colliders.push({ c: [sp.ramp.cx, sp.ramp.cy, sp.ramp.cz], s: [sp.ramp.sx, sp.ramp.sy, sp.ramp.sz], q: [sp.ramp.q.x, sp.ramp.q.y, sp.ramp.q.z, sp.ramp.q.w].map((v) => Math.round(v * 1e6) / 1e6), ramp: true });
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.03);
    k.beam(fr, [x, 0.02, z0], [x, 3.0 - 0.1, z0 - 5 + 0.1], 0.06, 0.3);
    for (const i of [0, 5, 10, 14]) {
      const top = (i + 1) * rise, zc = z0 - (i + 0.5) * run;
      k.add(rail, box(0.04, 0.95, 0.04), [x, top + 0.475, zc]);
    }
    k.beam(rail, [x, rise + 0.95, z0 - 0.5 * run], [x, N * rise + 0.95, z0 - (N - 0.5) * run], 0.05);
    k.beam(rail, [x, rise + 0.5, z0 - 0.5 * run], [x, N * rise + 0.5, z0 - (N - 0.5) * run], 0.03);
  }
  c.extra.topHeight = 3;
  c.extra.stairs = { rise: 3, run: 5, w: W, stepRun: run, zTop: z0 - 5, cx: 0 };   // measured by world/setpieces.js (the collider is an inclined ramp now)
};
PROPS.cobweb = (k) => {
  k.add(L('cobweb'), plane(1.4, 1.4), [0, 0.7, 0]);
};
PROPS.pipe_vertical = (k, c) => {
  const t = [0x7a8a7a, 0x9a4a3a, 0xb09a50][c.pick(3)];
  const m = L('pipes', t), fl = L('metal_dark');
  k.add(m, scaleUV(cyl(0.12, 0.12, 4, 8, true), 1, 4), [0, 2, 0]);
  for (const y of [0.04, 2.0, 3.96]) k.add(fl, cyl(0.17, 0.17, 0.08, 8), [0, y, 0]);
  k.add(fl, cyl(0.03, 0.03, 0.2, 6), [0, 1.2, 0.2], [HP, 0, 0]);
  k.add(L('paint', 0xa02020), tor(0.14, 0.015, 3, 10), [0, 1.2, 0.3]);
  k.add(L('paint', 0xa02020), box(0.28, 0.02, 0.02), [0, 1.2, 0.3]);
  k.add(fl, box(0.1, 0.1, 0.08), [0, 1.6, 0.15]);
  k.add(L('gauge', 0xffffff, DECAL), circ(0.06, 8), [0, 1.6, 0.192]);
  col(c, 0, 2, 0, 0.34, 4, 0.34);
};
PROPS.hanging_chains = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  const ch = L('chain', 0xa0a0a0), mt = L('metal_rust'), r = c.rng;
  for (let i = 0; i < 4; i++) {
    const len = i === 0 ? 2.09 : 1.0 + r() * 1.09, x = (r() - 0.5) * 1.2, z = (r() - 0.5) * 1.2, ry = r() * PI;
    k.add(ch, scaleUV(plane(0.1, len), 1, len / 0.32), [x, -len / 2, z], [0, ry, 0]);
    k.add(ch, scaleUV(plane(0.1, len), 1, len / 0.32), [x, -len / 2, z], [0, ry + HP, 0]);
    k.add(mt, tor(0.05, 0.01, 3, 6, PI * 1.3), [x, -len - 0.05, z], [0, ry, PI * 0.85]);
  }
};
PROPS.mop_bucket = (k, c) => {
  const y = L('plastic', 0xd8b020, { double: true }), g = L('plastic', 0x505050);
  k.add(y, cyl(0.22, 0.19, 0.3, 8, true), [0, 0.2, 0], null, [1.2, 1, 1]);
  k.add(L('water', 0x8a8a60), circ(0.2, 8), [0, 0.3, 0], [-HP, 0, 0], [1.2, 1, 1]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(g, sph(0.03, 5, 3), [x * 0.2, 0.03, z * 0.14]);
  k.add(g, box(0.2, 0.12, 0.22), [0.14, 0.42, 0]);
  k.beam(g, [0.14, 0.48, 0], [0.3, 0.9, 0], 0.025);
  k.limb(L('wood_planks', 0xc0a070), [-0.08, 0.2, 0.04], [-0.28, 1.35, -0.12], 0.015, 0.015, 5);
  k.add(L('fabric', 0x9a9a8a), box(0.14, 0.18, 0.14), [-0.07, 0.18, 0.04]);
  col(c, 0, 0.225, 0, 0.55, 0.45, 0.45);
};
PROPS.wet_floor_sign = (k, c) => {
  const s = L('wet_floor');
  k.add(s, box(0.3, 0.62, 0.012), [0, 0.3, 0.095], [-0.3, 0, 0]);
  k.add(s, box(0.3, 0.62, 0.012), [0, 0.3, -0.095], [0.3, 0, 0]);
  k.add(L('plastic', 0xd8b020), box(0.3, 0.03, 0.05), [0, 0.6, 0]);
  col(c, 0, 0.3, 0, 0.3, 0.6, 0.4);
};

// -------------------------------------------------------------------------------- outdoor
PROPS.pine_tree = (k, c) => {
  const r = c.rng, v = c.pick(3);
  const h = v === 2 ? 6 + r() * 2.5 : 6 + r() * 6;
  const Rk = [0.26, 0.19, 0.34][v], layers = [5, 6, 4][v];
  const tint = c.opts.snow ? 0xc0d0c8 : [0xffffff, 0xe0ecd8, 0xf0f0dc][Math.floor(r() * 3)];
  const leaf = L('pine_leaves', tint);
  const s = h / 9;
  k.add(L('bark'), scaleUV(cyl(0.12 * s, 0.25 * s, h * 0.92, 6), 2, h / 2), [0, h * 0.46, 0]);
  const baseY = h * (v === 1 ? 0.22 : 0.15);
  const step = (h - baseY) / (layers + 0.8);
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const R = h * Rk * (1 - t * 0.75) * (0.9 + r() * 0.2);
    const lh = step * 1.8;
    const g = scaleUV(cyl(R * 0.1, R, lh, 8, true), Math.max(2, Math.round(R * 1.5)), 1);
    k.add(leaf, g, [(r() - 0.5) * 0.15, baseY + step * i + lh / 2, (r() - 0.5) * 0.15], [(r() - 0.5) * 0.1, r() * TAU, (r() - 0.5) * 0.1]);
  }
  const w = 0.5 * s + 0.1;
  col(c, 0, h * 0.45, 0, w, h * 0.9, w);
  c.extra.height = r3(h);
};
PROPS.dead_tree = (k, c) => {
  const r = c.rng, h = 4.5 + r() * 3, bark = L('bark', 0x9a9088);
  const pts = [[0, 0, 0]];
  for (let i = 1; i <= 3; i++) pts.push([pts[i - 1][0] + (r() - 0.5) * 0.4, ((h * i) / 3) * 0.78, pts[i - 1][2] + (r() - 0.5) * 0.4]);
  for (let i = 0; i < 3; i++) k.limb(bark, pts[i], pts[i + 1], 0.25 * (1 - i * 0.28), 0.25 * (1 - (i + 1) * 0.28), 6);
  const nb = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const t = 0.35 + r() * 0.6, f = t * 3, seg = Math.min(2, Math.floor(f)), fr = f - seg;
    const a = pts[seg], b = pts[seg + 1];
    const base = [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr];
    const ang = r() * TAU, up = 0.4 + r() * 0.9, len = 1.0 + r() * 1.8 * (1 - t * 0.5);
    const d = new THREE.Vector3(Math.cos(ang), up, Math.sin(ang)).normalize();
    const end = [base[0] + d.x * len, base[1] + d.y * len, base[2] + d.z * len];
    k.limb(bark, base, end, 0.08 * (1.2 - t), 0.015, 5);
    if (r() < 0.6) {
      const mid = [base[0] + d.x * len * 0.55, base[1] + d.y * len * 0.55, base[2] + d.z * len * 0.55];
      const a2 = ang + (r() < 0.5 ? 0.9 : -0.9);
      const d2 = new THREE.Vector3(Math.cos(a2), up + 0.4, Math.sin(a2)).normalize();
      k.limb(bark, mid, [mid[0] + d2.x * len * 0.5, mid[1] + d2.y * len * 0.5, mid[2] + d2.z * len * 0.5], 0.03, 0.008, 4);
    }
  }
  col(c, pts[1][0] * 0.5, h * 0.35, pts[1][2] * 0.5, 0.5, h * 0.7, 0.5);
  c.extra.height = r3(h);
};
function rockProp(k, c, detail, smin, srange) {
  const r = c.rng;
  const sx = smin + r() * srange, sy = (smin + r() * srange) * 0.75, sz = smin + r() * srange;
  const g = rockGeo(c.seed * 31 + c.variant, detail);
  k.add(L('rock', 0xffffff, { flat: true }), g, [0, 0.35 * sy - 0.08 * sy, 0], null, [sx, sy, sz], 1.5);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const top = bb.max.y;
  col(c, cx, top / 2, cz, (bb.max.x - bb.min.x) * 0.85, top, (bb.max.z - bb.min.z) * 0.85);
}
PROPS.rock_big = (k, c) => rockProp(k, c, 1, 1.1, 1.0);
PROPS.rock_small = (k, c) => rockProp(k, c, 0, 0.22, 0.3);
PROPS.bush = (k, c) => {
  const r = c.rng, lv = L('leaves', [0xffffff, 0xd8e8c0, 0xc8d0a0][c.pick(3)]);
  const s = 0.8 + r() * 0.6;
  k.add(L('grass', 0x506a38, { flat: true }), G.ico(0.35 * s, 0), [0, 0.3 * s, 0], null, [1.2, 0.8, 1.2]);
  for (let i = 0; i < 3; i++) k.add(lv, plane(1.3 * s, 1.1 * s), [(r() - 0.5) * 0.2, 0.52 * s, (r() - 0.5) * 0.2], [0, (i / 3) * PI + r() * 0.3, 0]);
  k.add(lv, plane(1.1 * s, 1.1 * s), [0, 0.8 * s, 0], [-HP, 0, r()]);
};
PROPS.grass_clump = (k, c) => {
  const r = c.rng, tint = [0xffffff, 0xd8c890, 0xe0e8f0][c.pick(3)];
  const m = L('grass_blades', tint), s = 0.7 + r() * 0.6;
  for (let i = 0; i < 3; i++) k.add(m, plane(0.8 * s, 0.4 * s), [0, 0.2 * s, 0], [0, (i / 3) * PI + r() * 0.4, 0]);
};
PROPS.fence_segment = (k, c) => {
  const mt = L('metal', 0x8a8e8a);
  for (const x of [-1.5, 1.5]) k.add(mt, cyl(0.04, 0.04, 2.2, 6), [x, 1.1, 0]);
  k.add(mt, cyl(0.025, 0.025, 3.0, 6), [0, 1.95, 0], [0, 0, HP]);
  k.add(L('chainlink'), scaleUV(plane(3.0, 1.9), 12, 7.6), [0, 1.0, 0]);
  if (c.pick(2) === 0) {
    for (const x of [-1.5, 1.5]) k.beam(mt, [x, 2.15, 0], [x, 2.5, 0.25], 0.03);
    for (let i = 0; i < 3; i++) { const t = (i + 1) / 3.5; k.add(L('metal_dark'), box(3.0, 0.01, 0.01), [0, 2.15 + 0.35 * t, 0.25 * t]); }
  }
  col(c, 0, 1.25, 0, 3.08, 2.5, 0.1);
};
PROPS.shipping_container = (k, c) => {
  const cols = [0x8a2a20, 0x2a4a7a, 0x3a6a3a, 0xb07a20, 0x6a6a64];
  const tint = cols[c.pick(cols.length)];
  const W = 2.44, H = 2.59, Dl = 6.06, t = 0.06;
  const m = L('container', tint), fr = L('paint', tint), inside = L('container', 0x5a5a56);
  k.add(m, box(t, H, Dl), [-W / 2 + t / 2, H / 2, 0], null, null, 1);
  k.add(m, box(t, H, Dl), [W / 2 - t / 2, H / 2, 0], null, null, 1);
  k.add(m, box(W, t, Dl), [0, H - t / 2, 0], null, null, 1);
  k.add(m, box(W, H, t), [0, H / 2, -Dl / 2 + t / 2], null, null, 1);
  k.add(L('wood_planks', 0x8a7a60), box(W - 2 * t, 0.15, Dl - t), [0, 0.075, t / 2], null, null, 1);
  k.add(inside, plane(Dl - 0.1, H - 0.3), [-W / 2 + t + 0.002, H / 2, 0], [0, HP, 0]);
  k.add(inside, plane(Dl - 0.1, H - 0.3), [W / 2 - t - 0.002, H / 2, 0], [0, -HP, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(fr, box(0.16, H, 0.16), [x * (W / 2 - 0.08), H / 2, z * (Dl / 2 - 0.08)]);
  for (const x of [-1, 1]) for (const y of [0.08, H - 0.08]) k.add(fr, box(0.16, 0.16, Dl - 0.32), [x * (W / 2 - 0.08), y, 0]);
  k.add(fr, box(W - 0.32, 0.22, 0.16), [0, H - 0.11, Dl / 2 - 0.08]);
  k.add(fr, box(W - 0.32, 0.2, 0.16), [0, 0.1, Dl / 2 - 0.08]);
  const leafW = (W - 0.32) / 2, leafH = H - 0.42;
  for (const [name, sx] of [['doorL', -1], ['doorR', 1]]) {
    const h = anc(c, name, [sx * (W / 2 - 0.16), 0.2, Dl / 2]);
    h.userData.axis = 'y';
    h.userData.openAngle = sx < 0 ? -2.6 : 2.6;
    leafCollider(h, -sx * leafW / 2, leafH / 2, 0.025, leafW, leafH, 0.05);
    const lk = new Kit();
    lk.add(m, box(leafW - 0.01, leafH, 0.05), [-sx * leafW / 2, leafH / 2, 0.025], null, null, 1);
    for (const bx of [0.3, 0.8]) {
      lk.add(L('metal_dark'), cyl(0.02, 0.02, leafH + 0.1, 5), [-sx * bx, leafH / 2, 0.08]);
      lk.add(L('metal_dark'), box(0.03, 0.2, 0.03), [-sx * (bx + 0.05), 0.9, 0.1]);
    }
    lk.into(h);
  }
  anc(c, 'door', [0, 0.15, Dl / 2 + 0.05]);
  colMM(c, -W / 2, 0, -Dl / 2, -W / 2 + 0.16, H, Dl / 2);
  colMM(c, W / 2 - 0.16, 0, -Dl / 2, W / 2, H, Dl / 2);
  colMM(c, -W / 2, H - 0.22, -Dl / 2, W / 2, H, Dl / 2);
  colMM(c, -W / 2, 0, -Dl / 2, W / 2, H, -Dl / 2 + t);
  colMM(c, -W / 2, 0, -Dl / 2, W / 2, 0.15, Dl / 2);
};
PROPS.ruined_wall = (k, c) => {
  const r = c.rng, m = L(c.pick(2) ? 'concrete_stained' : 'brick'), T = 0.35, n = 8, cw = 0.5;
  let hPrev = 1.5 + r() * 1.5;
  for (let i = 0; i < n; i++) {
    const hgt = Math.max(0.3, Math.min(3.2, hPrev + (r() - 0.5) * 1.4));
    hPrev = hgt;
    if (r() < 0.12 && i > 0 && i < n - 1) continue;
    const x = -2 + cw / 2 + i * cw;
    k.add(m, box(cw, hgt, T), [x, hgt / 2, 0], null, null, 1);
    col(c, x, hgt / 2, 0, cw, hgt, T);
    if (r() < 0.6) { const ch = 0.1 + r() * 0.25; k.add(m, box(cw * 0.5, ch, T * 0.9), [x + (r() - 0.5) * 0.2, hgt + ch / 2 - 0.03, 0], [0, 0, (r() - 0.5) * 0.6], null, 1); }
  }
  for (let i = 0; i < 6; i++) {
    const s = 0.12 + r() * 0.2;
    k.add(m, box(s, s * 0.6, s), [(r() - 0.5) * 3.8, s * 0.25, (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.4)], [r(), r() * TAU, r() * 0.5], null, 1);
  }
};
PROPS.lamp_post = (k, c) => {
  const mt = L('metal_dark', 0x707470);
  k.add(L('concrete'), cyl(0.2, 0.25, 0.3, 8), [0, 0.15, 0]);
  k.add(mt, cyl(0.05, 0.07, 4.5, 6), [0, 2.55, 0]);
  k.beam(mt, [0, 4.6, 0], [0, 4.75, 1.0], 0.06);
  k.add(mt, box(0.26, 0.12, 0.46), [0, 4.72, 1.1]);
  k.add(B(null, 0xffe0a0), plane(0.2, 0.36), [0, 4.658, 1.1], [HP, 0, 0]);
  light(c, [0, 4.4, 1.1], 0xffd8a0, 1.5, 16);
  col(c, 0, 2.4, 0, 0.3, 4.8, 0.3);
};
PROPS.facility_entrance = (k, c) => {
  const cw = L('concrete_stained'), cd = L('concrete_dark'), hz = L('hazard_stripes'), dk = L('metal_dark'), rust = L('metal_rust');
  const DX = 1.8, DY0 = 0.3, DY1 = 4.0, RZ = -0.6;
  // bunker block with a recessed doorway
  k.add(cw, box(6 - DX, 8, 6), [-(DX + (6 - DX) / 2), 4, -3], null, null, 2);
  k.add(cw, box(6 - DX, 8, 6), [DX + (6 - DX) / 2, 4, -3], null, null, 2);
  k.add(cw, box(2 * DX, 8 - DY1, 6), [0, (DY1 + 8) / 2, -3], null, null, 2);
  k.add(cd, box(2 * DX, DY1, 6 + RZ), [0, DY1 / 2, (-6 + RZ) / 2], null, null, 2);
  k.add(cd, box(2 * DX, DY0, -RZ), [0, DY0 / 2, RZ / 2], null, null, 2);
  k.add(cw, box(12.3, 0.3, 0.4), [0, 8.15, -0.1], null, null, 2);
  // hazard frame around doorway
  for (const sx of [-1, 1]) k.add(hz, box(0.1, DY1 - DY0, -RZ), [sx * (DX - 0.05), (DY0 + DY1) / 2, RZ / 2], null, null, 0.5);
  k.add(hz, box(2 * DX, 0.1, -RZ), [0, DY1 - 0.05, RZ / 2], null, null, 0.5);
  // double doors (hinged leaves)
  const leafW = DX - 0.1, leafH = DY1 - DY0 - 0.1;
  for (const [name, sx] of [['doorL', -1], ['doorR', 1]]) {
    const h = anc(c, name, [sx * (DX - 0.1), DY0, RZ + 0.05]);
    h.userData.axis = 'y';
    h.userData.openAngle = sx < 0 ? -1.4 : 1.4;
    leafCollider(h, -sx * leafW / 2, leafH / 2, 0, leafW, leafH, 0.08);
    const lk = new Kit();
    lk.add(L('door_metal'), box(leafW - 0.01, leafH, 0.08), [-sx * leafW / 2, leafH / 2, 0]);
    lk.add(L('metal', 0xb0b0b0), box(leafW * 0.6, 0.06, 0.06), [-sx * leafW / 2, 1.1, 0.07]);
    lk.into(h);
  }
  anc(c, 'door', [0, DY0, RZ + 0.1]);
  k.add(B(null, 0x030303, DECAL), plane(2 * DX, DY1 - DY0), [0, (DY0 + DY1) / 2, RZ + 0.003]);
  // canopy + struts
  k.add(cd, box(5.0, 0.25, 1.8), [0, 4.6, 0.9], null, null, 2);
  for (const sx of [-1, 1]) k.beam(rust, [sx * 2.3, 3.6, 0.02], [sx * 2.3, 4.47, 1.6], 0.12);
  // company sign
  k.add(dk, box(4.6, 2.4, 0.12), [0, 6.2, 0.06]);
  k.add(B('sign_company', 0xb8b8b8, DECAL), plane(4.4, 2.2), [0, 6.2, 0.124]);
  // caged lamps
  const bulb = B(null, 0xffe0a0);
  for (const sx of [-1, 1]) {
    const x = sx * 2.9, y = 3.9;
    k.add(dk, box(0.22, 0.32, 0.06), [x, y, 0.03]);
    k.add(dk, box(0.06, 0.06, 0.14), [x, y, 0.1]);
    k.add(bulb, sph(0.08, 6, 4), [x, y, 0.22]);
    k.add(dk, box(0.02, 0.26, 0.02), [x, y, 0.32]);
    k.add(dk, box(0.26, 0.02, 0.02), [x, y, 0.32]);
    k.add(dk, tor(0.12, 0.012, 3, 8), [x, y, 0.2]);
    light(c, [x, y - 0.1, 0.6], 0xffe0a0, 1.2, 12);
  }
  // steps / landing
  k.add(cw, box(7.0, DY0, 2.2), [0, DY0 / 2, 1.1], null, null, 2);
  k.add(cw, box(7.0, DY0 / 2, 0.5), [0, DY0 / 4, 2.45], null, null, 2);
  // facade details
  k.add(L('pipes', 0x7a8a7a), scaleUV(cyl(0.12, 0.12, 8.2, 8, true), 1, 8), [-5.2, 4.1, 0.2]);
  k.add(L('pipes', 0x9a4a3a), scaleUV(cyl(0.08, 0.08, 3.6, 8, true), 1, 4), [-4.0, 7.3, 0.14], [0, 0, HP]);
  for (const y of [1.5, 4.0, 6.5]) k.add(dk, box(0.3, 0.06, 0.25), [-5.2, y, 0.12]);
  k.add(L('vent', 0x9a9a9a), box(1.2, 0.8, 0.2), [4.3, 6.4, 0.1]);
  k.add(B(null, 0x080808), plane(1.0, 0.3), [-3.4, 5.5, 0.006]);
  k.add(L('sign_danger', 0xffffff, DECAL), plane(0.6, 0.6), [-2.6, 1.9, 0.006]);
  k.add(L('graffiti', 0xffffff, DECAL), plane(3.0, 1.5), [4.2, 2.2, 0.008]);
  // colliders
  colMM(c, -6, 0, -6, -DX, 8, 0);
  colMM(c, DX, 0, -6, 6, 8, 0);
  colMM(c, -DX, DY1, -6, DX, 8, 0);
  colMM(c, -DX, 0, -6, DX, DY1, RZ);
  colMM(c, -DX, 0, RZ, DX, DY0, 0);
  colMM(c, -3.5, 0, 0, 3.5, DY0, 2.2);
  colMM(c, -3.5, 0, 2.2, 3.5, DY0 / 2, 2.7);
  colMM(c, -2.5, 4.475, 0, 2.5, 4.725, 1.8);
  col(c, -5.2, 4.1, 0.2, 0.3, 8.2, 0.3);
};
PROPS.fire_exit = (k, c) => {
  const cw = L('concrete_stained'), dk = L('metal_dark');
  k.add(cw, box(3, 3.2, 2.5), [0, 1.6, -1.25], null, null, 1.5);
  k.add(cw, box(3.2, 0.2, 2.7), [0, 3.3, -1.25], null, null, 1.5);
  k.add(dk, box(1.3, 2.35, 0.08), [0, 1.175, 0.04]);
  const hinge = anc(c, 'hinge', [-0.55, 0.02, 0.1]);
  hinge.userData.axis = 'y';
  hinge.userData.openAngle = -1.5;
  leafCollider(hinge, 0.55, 1.1, 0, 1.1, 2.2, 0.05);
  const lk = new Kit();
  lk.add(L('door_metal', 0xd0c8c0), box(1.1, 2.2, 0.05), [0.55, 1.1, 0]);
  lk.add(L('metal', 0xb0b0b0), box(0.7, 0.05, 0.05), [0.55, 1.05, 0.05]);
  lk.into(hinge);
  anc(c, 'door', [0, 0, 0.15]);
  k.add(B('sign_exit', 0xffffff, DECAL), plane(0.5, 0.25), [0, 2.5, 0.006]);
  k.add(dk, box(0.16, 0.2, 0.05), [0, 2.85, 0.025]);
  k.add(B(null, 0xff2020), sph(0.07, 6, 4), [0, 2.85, 0.14]);
  k.add(dk, tor(0.1, 0.01, 3, 8), [0, 2.85, 0.14]);
  k.add(L('vent', 0x9a9a9a), box(0.6, 0.4, 0.1), [1.51, 2.4, -1.2], [0, HP, 0]);
  light(c, [0, 2.8, 0.5], 0xff2020, 0.8, 6);
  colMM(c, -1.6, 0, -2.6, 1.6, 3.4, 0.08);
};
PROPS.pond = (k, c) => {
  const r = c.rng, N = 14, R = 3.6 + r() * 0.8;
  const radii = [];
  for (let i = 0; i < N; i++) radii.push(R * (0.78 + r() * 0.35));
  const ang = (i) => (i / N) * TAU;
  // water surface (fan)
  const wp = [0, 0, 0], wi = [];
  for (let i = 0; i < N; i++) wp.push(Math.cos(ang(i)) * radii[i], 0, Math.sin(ang(i)) * radii[i]);
  for (let i = 0; i < N; i++) wi.push(0, 1 + ((i + 1) % N), 1 + i);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setIndex(wi);
  wg.computeVertexNormals();
  boxUV(wg, 2);
  k.add(L('water', 0xa0b8b0), wg, [0, 0.06, 0]);
  // muddy rim ring
  const rp = [], ri = [];
  for (let i = 0; i < N; i++) {
    const a = ang(i), ca = Math.cos(a), sa = Math.sin(a);
    rp.push(ca * radii[i] * 0.97, 0.05, sa * radii[i] * 0.97, ca * radii[i] * 1.3, 0.0, sa * radii[i] * 1.3);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = ((i + 1) % N) * 2;
    ri.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setIndex(ri);
  rg.computeVertexNormals();
  boxUV(rg, 2);
  k.add(L('mud'), rg, [0, 0.01, 0]);
  // reeds, lilies, rocks
  const reed = L('reeds');
  for (let i = 0; i < N; i++) {
    if (r() > 0.6) continue;
    const a = ang(i) + (r() - 0.5) * 0.2, rr = radii[i] * (0.95 + r() * 0.2), h = 1.0 + r() * 0.7, ry = r() * PI;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    k.add(reed, plane(1.0, h), [x, h / 2, z], [0, ry, 0]);
    k.add(reed, plane(1.0, h), [x, h / 2, z], [0, ry + HP, 0]);
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU, d = r() * R * 0.55;
    k.add(L(null, 0x3a6a2a), circ(0.22 + r() * 0.1, 6), [Math.cos(a) * d, 0.07, Math.sin(a) * d], [-HP, 0, 0]);
  }
  const stone = L('rock', 0xffffff, { flat: true });
  for (let i = 0; i < 3; i++) {
    const j = Math.floor(r() * N), a = ang(j), rr = radii[j] * 1.15;
    k.add(stone, rockGeo(c.seed * 7 + i, 0), [Math.cos(a) * rr, 0.08, Math.sin(a) * rr], null, [0.35, 0.25, 0.3]);
  }
  anc(c, 'center', [0, 0.06, 0]);
  c.extra.waterLevel = 0.06;
  c.extra.radius = r3(R);
  c.extra.shore = radii.map((rad, i) => [r3(Math.cos(ang(i)) * rad), r3(Math.sin(ang(i)) * rad)]);
};
PROPS.dock = (k, c) => {
  const Lg = 10, W = 2, deck = 0, depth = 3.3, wd = L('wood_planks', 0xa89070), post = L('wood_dark', 0x8a7050);
  k.add(wd, box(W, 0.08, Lg), [0, deck - 0.04, 0], null, null, 1);
  for (const sx of [-1, 1]) k.add(post, box(0.12, 0.2, Lg), [sx * 0.8, deck - 0.18, 0]);
  for (let i = 0; i < 5; i++) {
    const z = -Lg / 2 + 0.3 + (i * (Lg - 0.6)) / 4;
    for (const sx of [-1, 1]) {
      k.add(post, cyl(0.1, 0.1, depth + 0.35, 6), [sx * 0.95, deck + (0.35 - depth) / 2, z]);
      col(c, sx * 0.95, deck + 0.175, z, 0.2, 0.35, 0.2);
    }
    k.add(post, box(W, 0.12, 0.12), [0, deck - 0.2, z]);
  }
  for (const sx of [-1, 1]) k.add(post, box(0.05, 1.6, 0.05), [sx * 0.25, deck - 0.85, -Lg / 2 - 0.05]);
  for (let i = 0; i < 5; i++) k.add(post, box(0.5, 0.04, 0.04), [0, deck - 0.2 - i * 0.3, -Lg / 2 - 0.05]);
  k.add(L('fabric', 0xb0a078), tor(0.15, 0.03, 3, 8), [0.6, deck + 0.03, -4.0], [HP, 0, 0]);
  anc(c, 'end', [0, deck, -Lg / 2]);
  col(c, 0, deck - 0.05, 0, W, 0.1, Lg);
  c.extra.deckHeight = deck;
  c.extra.postDepth = depth;
};
PROPS.radio_tower = (k, c) => {
  const H = 20, leg = L('metal_rust', 0xa0a0a0), lat = L('lattice', 0xc8b8a8), dk = L('metal_dark');
  latticeTower(k, leg, lat, H, 1.3, 0.35);
  k.add(dk, box(1.2, 0.08, 1.2), [0, H - 2, 0]);
  k.add(leg, cyl(0.04, 0.06, 4, 5), [0, H + 2, 0]);
  const red = B(null, 0xff2020);
  k.add(red, sph(0.15, 6, 4), [0, H + 4.1, 0]);
  k.add(red, sph(0.1, 5, 3), [0.8, H / 2, 0.8]);
  k.add(L('paint', 0xd0d0cc, { double: true }), cyl(0.5, 0.3, 0.2, 8, true), [0.55, H - 4, 0.55], [HP, PI / 4, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.add(L('concrete'), box(0.6, 0.3, 0.6), [x * 1.3, 0.15, z * 1.3]);
    col(c, x * 1.22, 2, z * 1.22, 0.5, 4, 0.5);
  }
  k.add(L('paint', 0x8a8e88), box(1.6, 2.0, 1.2), [3.0, 1.0, 0], null, null, 1);
  k.add(L('vent', 0x9a9a9a, DECAL), plane(0.6, 0.4), [3.0, 1.4, 0.602]);
  k.add(L('door_metal'), plane(0.7, 1.6), [3.801, 0.8, 0], [0, HP, 0]);
  colMM(c, 2.2, 0, -0.6, 3.8, 2.0, 0.6);
  light(c, [0, H + 4.1, 0], 0xff2020, 1.5, 25, { blink: 1.0 });
};
PROPS.car_wreck = (k, c) => {
  const tint = [0x7a5a44, 0x5a6a70, 0x6a4a3a, 0x707060][c.pick(4)], r = c.rng;
  const body = L('metal_rust', tint, { flat: true }), dk = L('metal_dark'), glass = L('glass', 0x303a40, { flat: true }), tire = L('rubber');
  k.add(body, box(1.7, 0.55, 4.2), [0, 0.6, 0], null, null, 1.2);
  k.add(glass, cyl(0.95, 1.1, 0.5, 4).rotateY(PI / 4), [0, 1.125, -0.25], null, [1, 1, 1.45]);
  k.add(body, box(1.36, 0.06, 1.95), [0, 1.4, -0.25]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.beam(body, [sx * 0.76, 0.875, -0.25 + sz * 1.12], [sx * 0.66, 1.38, -0.25 + sz * 0.96], 0.07);
  k.add(body, box(1.6, 0.1, 1.1), [0, 0.9, 1.5], [0.12, 0, 0.05]);
  for (const sz of [-1, 1]) k.add(dk, box(1.75, 0.15, 0.12), [0, 0.4, sz * 2.12]);
  for (const sx of [-1, 1]) k.add(L('glass', 0xc8c8a0), box(0.25, 0.12, 0.02), [sx * 0.6, 0.7, 2.101]);
  const flat = Math.floor(r() * 4);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    const f = i === flat;
    k.add(tire, cyl(0.33, 0.33, 0.22, 8), [sx * 0.8, f ? 0.26 : 0.33, sz * 1.35], [0, 0, HP], f ? [0.8, 1, 1] : null);
  });
  col(c, 0, 0.7, 0, 1.8, 1.42, 4.3);
};
PROPS.oil_drum_stack = (k, c) => {
  const t0 = BARREL_TINTS[c.pick(BARREL_TINTS.length)], t1 = BARREL_TINTS[(c.pick(BARREL_TINTS.length) + 2) % BARREL_TINTS.length];
  const s0 = L('barrel', t0), s1 = L('barrel', t1), c0 = L('metal', t0), c1 = L('metal', t1);
  [-0.62, 0, 0.62].forEach((x, i) => addBarrel(k, i % 2 ? s1 : s0, i % 2 ? c1 : c0, [x, 0.45, 0], null));
  [-0.31, 0.31].forEach((x, i) => addBarrel(k, i ? s0 : s1, i ? c0 : c1, [x, 1.35, 0], null));
  addBarrel(k, s1, c1, [1.55, 0.3, 0.35], [0, 0.3, HP]);
  colMM(c, -0.93, 0, -0.31, 0.93, 0.9, 0.31);
  colMM(c, -0.62, 0.9, -0.31, 0.62, 1.8, 0.31);
  col(c, 1.55, 0.3, 0.35, 0.95, 0.6, 0.6);
};
PROPS.landing_pad = (k, c) => {
  const S = 16, hz = L('hazard_stripes', 0xffffff), paint = L('paint', 0xd8b020);
  k.add(L('metal_plate', 0xa0a4a0), box(S, 0.2, S), [0, 0.1, 0], null, null, 2);
  for (const sz of [-1, 1]) k.add(hz, box(S, 0.02, 0.6), [0, 0.206, sz * (S / 2 - 0.3)], null, null, 0.8);
  for (const sx of [-1, 1]) k.add(hz, box(0.6, 0.02, S - 1.2), [sx * (S / 2 - 0.3), 0.206, 0], null, null, 0.8);
  k.add(paint, box(0.6, 0.02, 4), [-1.0, 0.206, 0], null, null, 1);
  k.add(paint, box(0.6, 0.02, 2.6), [0.25, 0.206, -0.95], [0, -0.75, 0], null, 1);
  k.add(paint, box(0.6, 0.02, 2.6), [0.25, 0.206, 0.95], [0, 0.75, 0], null, 1);
  const amber = B(null, 0xffb030);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(amber, box(0.25, 0.1, 0.25), [x * (S / 2 - 0.6), 0.25, z * (S / 2 - 0.6)]);
  col(c, 0, 0.1, 0, S, 0.2, S);
};
PROPS.power_pylon = (k, c) => {
  const H = 18, leg = L('metal', 0x8a8e8a), lat = L('lattice', 0xb0b0a8), ins = L('glass', 0x5a7a68, { flat: true }), wire = L('metal_dark', 0x404040);
  latticeTower(k, leg, lat, H, 2.0, 0.6, 0.09);
  k.add(lat, box(9, 0.8, 0.8), [0, 13, 0], null, null, 0.8);
  k.add(lat, box(6.5, 0.8, 0.8), [0, 16, 0], null, null, 0.8);
  k.add(lat, cyl(0.1, 0.6, 2.5, 4).rotateY(PI / 4), [0, H + 1.25, 0]);
  for (const [x, y] of [[-4.3, 13], [4.3, 13], [-3.1, 16], [3.1, 16]]) {
    k.add(ins, cyl(0.1, 0.1, 0.7, 6), [x, y - 0.75, 0]);
    k.add(wire, box(0.03, 0.03, 14), [x, y - 1.1, 0]);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.add(L('concrete'), box(0.8, 0.4, 0.8), [x * 2.0, 0.2, z * 2.0]);
    col(c, x * 1.9, 2, z * 1.9, 0.6, 4, 0.6);
  }
};

// -------------------------------------------------------------------------- ship interior
PROPS.terminal = (k, c) => {
  const desk = L('paint', 0x5a6258), top = L('metal_plate', 0x8a8e88), pl = L('plastic', 0xb8b4a0);
  const W = 1.4, D = 0.7, H = 0.78, mz = -0.08;
  k.add(top, box(W, 0.05, D), [0, H - 0.025, 0], null, null, 1);
  for (const sx of [-1, 1]) k.add(desk, box(0.05, H - 0.05, D - 0.05), [sx * (W / 2 - 0.03), (H - 0.05) / 2, 0], null, null, 1);
  k.add(desk, box(W - 0.1, 0.5, 0.03), [0, H - 0.3, -D / 2 + 0.04]);
  k.add(pl, box(0.56, 0.46, 0.4), [0, H + 0.26, mz]);
  k.add(pl, box(0.42, 0.36, 0.22), [0, H + 0.25, mz - 0.3]);
  k.add(pl, box(0.3, 0.03, 0.25), [0, H + 0.015, mz]);
  const scr = screenMesh('screen', 0.5, 0.38, 'screen_terminal');
  scr.position.set(0, H + 0.26, mz + 0.203);
  c.root.add(scr);
  c.anchors.screen = scr;
  k.add(pl, box(0.46, 0.03, 0.16), [0, H + 0.015, 0.2]);
  k.add(L('keyboard', 0xffffff, DECAL), plane(0.44, 0.13), [0, H + 0.0315, 0.2], [-HP, 0, 0]);
  k.item('mug', [0.5, H + 0.048, 0.1]);
  k.add(L('plastic', 0xe8e4d8), box(0.25, 0.01, 0.32), [-0.45, H + 0.005, 0.05], [0, -0.2, 0]);
  anc(c, 'stand', [0, 0, 0.8]);
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2);
  colMM(c, -0.28, H, mz - 0.41, 0.28, H + 0.49, mz + 0.2);
};
PROPS.monitor_bank = (k, c) => {
  const pl = L('plastic', 0x9a968a), br = L('metal_dark'), body = L('paint', 0x5a6258);
  k.add(body, box(1.7, 0.85, 0.5), [0, 0.425, 0], null, null, 1);
  k.add(L('metal_plate', 0x8a8e88), box(1.76, 0.04, 0.56), [0, 0.87, 0], null, null, 1);
  k.add(L('hazard_stripes', 0xffffff, DECAL), scaleUV(plane(1.7, 0.08), 3.4, 0.16), [0, 0.06, 0.252]);
  for (const sx of [-1, 1]) k.add(br, box(0.06, 0.45, 0.06), [sx * 0.75, 1.115, -0.2]);
  k.add(br, box(1.66, 0.06, 0.08), [0, 1.3, -0.2]);
  [[-0.3, 0.9, 0.18], [0, 0.9, 0.18], [0.3, 0.9, 0.18]].forEach(([x, y, z], i) => k.add(B(null, [0xff3020, 0x40ff60, 0xffc030][i]), box(0.04, 0.02, 0.04), [x, y, z]));
  const y = 1.52;
  const screens = [];
  [-0.55, 0, 0.55].forEach((x, i) => {
    const ry = [0.28, 0, -0.28][i], sn = Math.sin(ry), cs = Math.cos(ry);
    k.add(pl, box(0.48, 0.38, 0.36), [x, y, 0], [0, ry, 0]);
    k.add(pl, box(0.34, 0.28, 0.16), [x - sn * 0.24, y, -cs * 0.24], [0, ry, 0]);
    const s = screenMesh('screen' + i, 0.4, 0.3, i === 1 ? 'screen_off' : 'noise_static');
    s.position.set(x + sn * 0.183, y, cs * 0.183);
    s.rotation.y = ry;
    c.root.add(s);
    screens.push(s);
  });
  c.anchors.screens = screens;
  c.anchors.screen = screens[1];
  colMM(c, -0.88, 0, -0.35, 0.88, 1.72, 0.28);
};
PROPS.lever = (k, c) => {
  const body = L('paint', 0x5a6258), dk = L('metal_dark');
  k.add(body, box(0.45, 0.95, 0.4), [0, 0.475, 0], null, null, 1);
  k.add(L('hazard_stripes', 0xffffff, DECAL), scaleUV(plane(0.45, 0.2), 1, 0.45), [0, 0.12, 0.202]);
  k.add(body, box(0.5, 0.06, 0.45), [0, 0.98, 0]);
  k.add(dk, box(0.08, 0.04, 0.3), [0, 1.03, 0]);
  k.add(dk, cyl(0.06, 0.06, 0.2, 8), [0, 1.05, 0], [0, 0, HP]);
  const h = anc(c, 'handle', [0, 1.05, 0]);
  h.rotation.x = 0.55;
  h.userData.axis = 'x';
  h.userData.restAngle = 0.55;
  h.userData.activeAngle = -0.55;
  const lk = new Kit();
  lk.add(L('metal', 0xb0b0b0), box(0.04, 0.55, 0.04), [0, 0.3, 0]);
  lk.add(L('rubber', 0x202020), cyl(0.028, 0.028, 0.12, 6), [0, 0.5, 0]);
  lk.add(L('rubber', 0xb02020), sph(0.06, 8, 6), [0, 0.6, 0]);
  lk.into(h);
  colMM(c, -0.25, 0, -0.225, 0.25, 1.01, 0.225);
};
PROPS.bunkbed = (k, c) => {
  const fr = L('paint', 0x6a7068), mat = L('mattress'), bl = L('fabric', 0x5a6040), pil = L('plastic', 0xe0ddd0);
  const W = 0.95, Lg = 2.0;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.add(fr, box(0.05, 1.8, 0.05), [x * (W / 2 - 0.025), 0.9, z * (Lg / 2 - 0.025)]);
    col(c, x * (W / 2 - 0.025), 0.9, z * (Lg / 2 - 0.025), 0.05, 1.8, 0.05);
  }
  for (const y of [0.35, 1.3]) {
    k.add(fr, box(W, 0.06, Lg), [0, y, 0]);
    k.add(mat, box(W - 0.08, 0.14, Lg - 0.08), [0, y + 0.1, 0], null, null, 0.5);
    k.add(pil, box(0.55, 0.1, 0.3), [0, y + 0.22, -Lg / 2 + 0.25]);
    k.add(bl, box(W - 0.06, 0.03, Lg * 0.55), [0, y + 0.185, Lg * 0.2]);
  }
  k.add(fr, box(0.03, 0.15, Lg * 0.7), [W / 2 - 0.015, 1.5, -0.2]);
  for (const sx of [-1, 1]) k.add(fr, box(0.04, 1.5, 0.04), [sx * 0.2, 0.75, Lg / 2 + 0.04]);
  for (let i = 0; i < 4; i++) k.add(fr, box(0.4, 0.03, 0.03), [0, 0.45 + i * 0.3, Lg / 2 + 0.04]);
  colMM(c, -W / 2, 0, -Lg / 2, W / 2, 0.55, Lg / 2);
  colMM(c, -W / 2, 1.27, -Lg / 2, W / 2, 1.5, Lg / 2);
};
PROPS.cupboard = (k, c) => {
  const W = 1.2, H = 2.0, D = 0.6, t = 0.03, m = L('paint', 0x7a8078), inn = L('metal_dark');
  k.add(m, box(W, H, t), [0, H / 2, -D / 2 + t / 2]);
  for (const sx of [-1, 1]) k.add(m, box(t, H, D), [sx * (W / 2 - t / 2), H / 2, 0]);
  k.add(m, box(W, t, D), [0, H - t / 2, 0]);
  k.add(m, box(W, 0.06, D), [0, 0.03, 0]);
  for (const y of [0.7, 1.35]) k.add(inn, box(W - 2 * t, 0.02, D - t), [0, y, 0]);
  k.add(inn, plane(W - 2 * t, H - 0.1), [0, H / 2, -D / 2 + t + 0.003]);
  k.add(L('cardboard'), box(0.4, 0.3, 0.35), [-0.25, 0.86, -0.05]);
  k.add(L('crate_metal'), box(0.35, 0.25, 0.35), [0.3, 1.485, -0.05]);
  for (const [name, sx] of [['doorL', -1], ['doorR', 1]]) {
    const h = anc(c, name, [sx * W / 2, 0, D / 2]);
    h.userData.axis = 'y';
    h.userData.openAngle = sx < 0 ? -1.9 : 1.9;
    leafCollider(h, -sx * W / 4, H / 2, 0.0125, W / 2, H, 0.025);
    const lk = new Kit();
    lk.add(m, box(W / 2 - 0.005, H - 0.02, 0.025), [-sx * W / 4, H / 2, 0.0125]);
    lk.add(L('vent', 0x7a8078, DECAL), plane(0.3, 0.14), [-sx * W / 4, 1.75, 0.027]);
    lk.add(inn, box(0.03, 0.14, 0.03), [-sx * (W / 2 - 0.06), 1.0, 0.035]);
    lk.into(h);
  }
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2 + 0.025);
};
PROPS.arcade_cabinet = (k, c) => {
  const body = L('plastic', 0x2a1a3a), W = 0.7, D = 0.8;
  for (const sx of [-1, 1]) k.add(L('arcade_art'), box(0.04, 1.85, D), [sx * (W / 2 - 0.02), 0.925, 0]);
  k.add(body, box(W - 0.08, 0.9, 0.7), [0, 0.45, -0.02]);
  k.add(body, box(W - 0.08, 0.08, 0.3), [0, 0.98, 0.25], [0.25, 0, 0]);
  k.add(body, box(W - 0.08, 0.6, 0.5), [0, 1.35, -0.1]);
  k.add(body, box(W - 0.08, 0.2, 0.4), [0, 1.75, -0.05]);
  k.add(body, box(W, 0.04, D), [0, 1.87, 0]);
  k.add(B('arcade_marquee'), plane(W - 0.08, 0.16), [0, 1.75, 0.152]);
  const s = screenMesh('screen', 0.5, 0.4, 'screen_arcade');
  s.position.set(0, 1.36, 0.157);
  s.rotation.x = -0.15;
  c.root.add(s);
  c.anchors.screen = s;
  k.add(L('metal', 0x909090), cyl(0.01, 0.01, 0.08, 4), [-0.12, 1.07, 0.27]);
  k.add(L('plastic', 0xc02020), sph(0.025, 6, 4), [-0.12, 1.11, 0.27]);
  [0xff4040, 0x40c0ff, 0xffd040].forEach((col_, i) => k.add(B(null, col_), cyl(0.02, 0.02, 0.02, 6), [0.02 + i * 0.07, 1.035, 0.27], [0.25, 0, 0]));
  k.add(L('metal_dark'), plane(0.2, 0.25), [0, 0.5, 0.332]);
  for (const sx of [-1, 1]) k.add(B(null, 0xff8020), box(0.03, 0.05, 0.01), [sx * 0.04, 0.55, 0.336]);
  colMM(c, -W / 2, 0, -D / 2, W / 2, 1.9, D / 2);
};
PROPS.charging_station = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const y = 1.3;
  k.add(L('paint', 0x3a4a5a), box(0.4, 0.55, 0.16), [0, y, 0.08]);
  k.add(L('charge_panel', 0xffffff, DECAL), plane(0.33, 0.5), [0, y, 0.162]);
  k.add(B(null, 0x80ff80), box(0.05, 0.05, 0.03), [0.13, y + 0.29, 0.1]);
  k.limb(L('rubber'), [0.15, y - 0.27, 0.08], [0.17, y - 0.5, 0.06], 0.015, 0.015, 4);
  k.add(L('metal_dark'), box(0.05, 0.06, 0.05), [0.17, y - 0.52, 0.06]);
  anc(c, 'slot', [0, y - 0.12, 0.2]);
  light(c, [0, y + 0.3, 0.3], 0x80ff80, 0.4, 3);
  colMM(c, -0.2, y - 0.275, 0, 0.2, y + 0.275, 0.17);
};
PROPS.door_panel = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const y = 1.3;
  k.add(L('metal_dark'), box(0.3, 0.5, 0.06), [0, y, 0.03]);
  k.add(L('hazard_stripes', 0xffffff, DECAL), scaleUV(plane(0.3, 0.04), 0.6, 0.08), [0, y + 0.23, 0.062]);
  const defs = [['open', y + 0.07, 0x30c050, 0x0a3a14, 'label_open', 0.1], ['close', y - 0.13, 0xc03028, 0x3a0a08, 'label_close', -0.1]];
  for (const [name, yy, colr, em, lab, ly] of defs) {
    k.add(L('metal', 0x909090), cyl(0.07, 0.07, 0.02, 10), [0, yy, 0.07], [HP, 0, 0]);
    const a = anc(c, name, [0, yy, 0.08]);
    a.userData.pressDepth = 0.015;
    a.userData.pressAxis = 'z';
    const bk = new Kit();
    bk.add(L('plastic', colr, { emissive: em }), cyl(0.055, 0.055, 0.03, 10), [0, 0, 0.015], [HP, 0, 0]);
    bk.into(a);
    k.add(L(lab, 0xffffff, DECAL), plane(0.15, 0.05), [0, yy + ly, 0.062]);
  }
};
PROPS.ship_light = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  k.add(L('metal_dark'), box(0.6, 0.08, 0.6), [0, -0.04, 0]);
  k.add(B(null, 0xfff4d8), plane(0.5, 0.5), [0, -0.082, 0], [HP, 0, 0]);
  for (const a of [PI / 4, -PI / 4]) k.add(L('metal', 0x909090), box(0.68, 0.02, 0.03), [0, -0.092, 0], [0, a, 0]);
  light(c, [0, -0.4, 0], 0xfff0d0, 1.2, 10);
  colMM(c, -0.3, -0.1, -0.3, 0.3, 0, 0.3);
};
PROPS.suit_rack = (k, c) => {
  const fr = L('metal', 0x8a8e8a), r = c.rng;
  for (const sx of [-1, 1]) {
    k.add(fr, box(0.04, 1.95, 0.04), [sx * 0.8, 0.975, 0]);
    k.add(fr, box(0.06, 0.04, 0.5), [sx * 0.8, 0.02, 0]);
  }
  k.add(fr, cyl(0.015, 0.015, 1.6, 6), [0, 1.85, 0], [0, 0, HP]);
  k.add(fr, box(1.7, 0.03, 0.4), [0, 1.965, 0]);
  const helm = L('plastic', 0xd8d4c8), visor = L(null, 0x202830);
  for (const x of [-0.4, 0.4]) {
    k.add(helm, sph(0.14, 8, 6), [x, 2.12, 0], null, [1, 1.05, 1.1]);
    k.add(visor, box(0.18, 0.1, 0.02), [x, 2.12, 0.15]);
  }
  const suitCols = [0xf08a38, 0xf08a38, 0xe07830, 0x8a9a60];
  for (let i = 0; i < 4; i++) {
    const m = L('fabric', suitCols[(i + Math.floor(r() * 4)) % 4]), x = -0.6 + i * 0.4, ry = HP * 0.8 + (r() - 0.5) * 0.3;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (lx, y, lz) => [x + lx * cs + lz * sn, y, -lx * sn + lz * cs];
    k.add(fr, box(0.02, 0.1, 0.02), [x, 1.8, 0]);
    k.add(fr, box(0.36, 0.02, 0.02), P(0, 1.75, 0), [0, ry, 0]);
    k.add(m, box(0.4, 0.58, 0.2), P(0, 1.45, 0), [0, ry, 0]);
    for (const sx of [-1, 1]) {
      k.add(m, box(0.1, 0.55, 0.13), P(sx * 0.25, 1.44, 0), [0, ry, 0]);
      k.add(m, box(0.16, 0.72, 0.16), P(sx * 0.1, 0.8, 0), [0, ry, 0]);
    }
  }
  colMM(c, -0.85, 0, -0.3, 0.85, 2.27, 0.3);
};
PROPS.coffee_machine = (k, c) => {
  const b = L('plastic', 0x2a2a2c), m = L('metal', 0xb0b0b0), cab = L('paint', 0x6a6a60), y0 = 0.94;
  k.add(cab, box(0.7, 0.9, 0.5), [0, 0.45, 0], null, null, 1);
  k.add(L('wood_dark', 0xb09070), box(0.74, 0.04, 0.54), [0, 0.92, 0], null, null, 1);
  for (const sx of [-1, 1]) {
    k.add(cab, box(0.32, 0.8, 0.02), [sx * 0.17, 0.45, 0.255]);
    k.add(L('metal_dark'), box(0.02, 0.1, 0.02), [sx * 0.03, 0.6, 0.27]);
  }
  k.add(b, box(0.3, 0.08, 0.3), [-0.1, y0 + 0.04, 0]);
  k.add(b, box(0.3, 0.42, 0.12), [-0.1, y0 + 0.25, -0.09]);
  k.add(b, box(0.3, 0.1, 0.3), [-0.1, y0 + 0.41, 0]);
  k.add(L('glass', 0x6090a0, { opacity: 0.6 }), box(0.26, 0.12, 0.1), [-0.1, y0 + 0.52, -0.08]);
  k.add(L('glass', 0x302018, { opacity: 0.85 }), cyl(0.07, 0.065, 0.14, 8), [-0.1, y0 + 0.15, 0.04]);
  k.add(b, box(0.03, 0.08, 0.03), [-0.01, y0 + 0.16, 0.04]);
  k.add(m, box(0.16, 0.02, 0.1), [-0.1, y0 + 0.35, 0.05]);
  k.add(B(null, 0xff3020), box(0.02, 0.02, 0.01), [-0.15, y0 + 0.43, 0.152]);
  k.add(B(null, 0x40ff40), box(0.02, 0.02, 0.01), [-0.05, y0 + 0.43, 0.152]);
  k.item('mug', [0.2, y0 + 0.048, 0.08]);
  colMM(c, -0.37, 0, -0.27, 0.37, y0 + 0.58, 0.27);
};
PROPS.quota_screen = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const y = 2.0;
  k.add(L('metal_dark'), box(0.3, 0.3, 0.04), [0, y, 0.02]);
  k.add(L('plastic', 0x2a2a2c), box(1.2, 0.72, 0.08), [0, y, 0.08]);
  const s = screenMesh('screen', 1.1, 0.62, 'screen_quota');
  s.position.set(0, y, 0.122);
  c.root.add(s);
  c.anchors.screen = s;
  colMM(c, -0.6, y - 0.36, 0, 0.6, y + 0.36, 0.12);
};

// ----------------------------------------------------------------------------- company HQ
PROPS.sell_counter = (k, c) => {
  const CW = 6.0, CH = 1.1, CD = 1.2;
  const body = L('metal_plate', 0x8a8c86), topm = L('metal', 0x9a9c98), wall = L('concrete_stained'), dk = L('metal_dark'), voidM = B(null, 0x030303);
  k.add(body, box(CW, CH - 0.06, CD), [0, (CH - 0.06) / 2, 0], null, null, 1);
  k.add(topm, box(CW + 0.2, 0.06, CD + 0.2), [0, CH - 0.03, 0], null, null, 1);
  k.add(L('hazard_stripes', 0xffffff, DECAL), scaleUV(plane(CW, 0.2), CW / 0.5, 0.4), [0, 0.1, CD / 2 + 0.004]);
  for (const sx of [-1, 1]) k.add(body, box(0.9, CH - 0.06, 1.0), [sx * 3.55, (CH - 0.06) / 2, -1.1], null, null, 1);
  const WZ = -1.8, WT = 0.4, WW = 8, WH = 5, OW = 3.5, OY0 = 1.1, OY1 = 3.1;
  for (const sx of [-1, 1]) k.add(wall, box((WW - OW) / 2, WH, WT), [sx * (OW / 2 + (WW - OW) / 4), WH / 2, WZ], null, null, 2);
  k.add(wall, box(OW, OY0, WT), [0, OY0 / 2, WZ], null, null, 2);
  k.add(wall, box(OW, WH - OY1, WT), [0, (OY1 + WH) / 2, WZ], null, null, 2);
  // the void behind the hatch (a short dark tunnel + something watching)
  k.add(voidM, box(OW, OY1 - OY0, 0.1), [0, (OY0 + OY1) / 2, WZ - 0.6]);
  for (const sx of [-1, 1]) k.add(voidM, box(0.05, OY1 - OY0, 0.5), [sx * (OW / 2 - 0.025), (OY0 + OY1) / 2, WZ - 0.4]);
  k.add(voidM, box(OW, 0.05, 0.5), [0, OY1 - 0.025, WZ - 0.4]);
  k.add(voidM, box(OW, 0.05, 0.5), [0, OY0 + 0.025, WZ - 0.4]);
  for (const sx of [-1, 1]) k.add(B(null, 0x701010), box(0.06, 0.03, 0.01), [sx * 0.25, 2.35, WZ - 0.54]);
  // roll-up shutter (hatch)
  const h = anc(c, 'hatch', [0, OY1, WZ + WT / 2 + 0.04]);
  h.userData.axis = 'y';
  h.userData.openOffset = [0, OY1 - OY0, 0];
  leafCollider(h, 0, -(OY1 - OY0) / 2, 0, OW, OY1 - OY0, 0.06);
  const hk = new Kit();
  const sg = xf(box(OW, OY1 - OY0, 0.06), [0, -(OY1 - OY0) / 2, 0]);
  swapUV(boxUV(sg, 1));
  hk.push(L('container', 0x9a9c98), sg);
  hk.add(dk, box(OW, 0.08, 0.08), [0, -(OY1 - OY0) + 0.04, 0.02]);
  hk.into(h);
  for (const sx of [-1, 1]) k.add(dk, box(0.08, OY1 - OY0 + 0.3, 0.1), [sx * (OW / 2 + 0.04), (OY0 + OY1) / 2 + 0.15, WZ + WT / 2 + 0.05]);
  k.add(dk, box(OW + 0.3, 0.35, 0.3), [0, OY1 + 0.17, WZ + WT / 2 + 0.15]);
  k.add(B('sign_company', 0xc8c8c8, DECAL), plane(2.6, 1.3), [0, 4.2, WZ + WT / 2 + 0.006]);
  for (const sx of [-1, 1]) k.add(B(null, 0xffa020), cyl(0.08, 0.1, 0.15, 6), [sx * (OW / 2 + 0.35), OY1 + 0.25, WZ + WT / 2 + 0.1]);
  const dz = anc(c, 'dropZone', [0, CH, 0]);
  dz.userData.size = [CW, 0.8, CD];
  light(c, [0, 3.2, 0.3], 0xffe0b0, 1.0, 10);
  colMM(c, -CW / 2 - 0.1, 0, -CD / 2 - 0.1, CW / 2 + 0.1, CH, CD / 2 + 0.1);
  for (const sx of [-1, 1]) colMM(c, Math.min(sx * 3.1, sx * 4.0), 0, -1.6, Math.max(sx * 3.1, sx * 4.0), CH - 0.06, -0.6);
  for (const sx of [-1, 1]) colMM(c, Math.min(sx * OW / 2, sx * WW / 2), 0, WZ - WT / 2, Math.max(sx * OW / 2, sx * WW / 2), WH, WZ + WT / 2);
  colMM(c, -OW / 2, 0, WZ - WT / 2, OW / 2, OY0, WZ + WT / 2);
  colMM(c, -OW / 2, OY1, WZ - WT / 2, OW / 2, WH, WZ + WT / 2);
  colMM(c, -OW / 2, OY0, WZ - 0.65, OW / 2, OY1, WZ - WT / 2);
};
PROPS.desk_bell = (k, c) => {
  k.add(L('plastic', 0x1a1a1a), cyl(0.045, 0.05, 0.015, 10), [0, 0.0075, 0]);
  k.add(L('gold', 0xd0b060), hemi(0.042, 10, 3), [0, 0.015, 0]);
  const b = anc(c, 'button', [0, 0.057, 0]);
  b.userData.pressDepth = 0.008;
  b.userData.pressAxis = 'y';
  const bk = new Kit();
  bk.add(L('gold', 0xd0b060), cyl(0.004, 0.004, 0.012, 5), [0, 0.006, 0]);
  bk.add(L('plastic', 0x1a1a1a), cyl(0.012, 0.012, 0.005, 8), [0, 0.0125, 0]);
  bk.into(b);
  colMM(c, -0.05, 0, -0.05, 0.05, 0.07, 0.05);
};
PROPS.slot_machine = (k, c) => {
  const red = L('paint', 0x9a2226), gold = L('gold', 0xd0a848), dk = L('metal_dark');
  k.add(red, box(0.7, 0.95, 0.6), [0, 0.475, 0], null, null, 1);
  k.add(gold, box(0.72, 0.04, 0.62), [0, 0.97, 0]);
  k.add(red, box(0.66, 0.8, 0.5), [0, 1.39, -0.03], null, null, 1);
  k.add(dk, box(0.56, 0.36, 0.02), [0, 1.36, 0.225]);
  const s = screenMesh('screen', 0.5, 0.3, 'slot_reels');
  s.position.set(0, 1.36, 0.237);
  c.root.add(s);
  c.anchors.screen = s;
  k.add(red, box(0.66, 0.34, 0.2), [0, 1.96, 0]);
  k.add(B('sign_company', 0xe0e0e0, DECAL), plane(0.6, 0.3), [0, 1.96, 0.102]);
  const bulb = B(null, 0xffe080);
  for (let i = 0; i < 8; i++) k.add(bulb, box(0.03, 0.03, 0.02), [-0.3 + (i * 0.6) / 7, 2.14, 0.08]);
  k.add(dk, box(0.4, 0.08, 0.14), [0, 0.35, 0.34]);
  [0xff4040, 0x40ff60, 0xffd040].forEach((cc, i) => k.add(B(null, cc), box(0.06, 0.02, 0.04), [-0.12 + i * 0.12, 1.0, 0.26]));
  k.add(dk, cyl(0.04, 0.04, 0.06, 6), [0.36, 1.15, 0], [0, 0, HP]);
  const lv = anc(c, 'lever', [0.39, 1.15, 0]);
  lv.userData.axis = 'x';
  lv.userData.restAngle = 0;
  lv.userData.pulledAngle = 1.0;
  const lk = new Kit();
  lk.add(L('metal', 0xc0c0c0), box(0.03, 0.45, 0.03), [0.02, 0.225, 0]);
  lk.add(L('rubber', 0xc02020), sph(0.05, 6, 4), [0.02, 0.47, 0]);
  lk.into(lv);
  light(c, [0, 1.6, 0.6], 0xffb050, 0.5, 4);
  colMM(c, -0.35, 0, -0.3, 0.35, 2.13, 0.3);
};
PROPS.vendor_stall = (k, c) => {
  const wd = L('wood_planks', 0xa08060), post = L('wood_dark', 0x8a6a48), aw = L('awning', 0xffffff, { double: true }), r = c.rng;
  const W = 3.0, D = 1.8;
  k.add(wd, box(W, 1.0, 0.5), [0, 0.5, 0.65], null, null, 1);
  k.add(post, box(W + 0.1, 0.05, 0.6), [0, 1.025, 0.65], null, null, 1);
  k.add(L('sign_market', 0xffffff, DECAL), plane(1.6, 0.4), [0, 0.66, 0.902]);
  for (const sx of [-1, 1]) k.add(wd, box(0.4, 1.0, 1.3), [sx * (W / 2 - 0.2), 0.5, -0.25], null, null, 1);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(post, box(0.1, 2.6, 0.1), [x * (W / 2 - 0.05), 1.3, z * (D / 2 - 0.05)]);
  k.add(aw, box(W + 0.4, 0.04, D + 0.5), [0, 2.55, 0.1], [0.25, 0, 0], null, 1);
  k.add(aw, box(W + 0.4, 0.25, 0.02), [0, 2.15, D / 2 + 0.38], null, null, 1);
  k.add(post, box(W - 0.2, 2.0, 0.04), [0, 1.0, -0.88], null, null, 1);
  for (const y of [1.2, 1.7]) k.add(post, box(W - 0.4, 0.04, 0.35), [0, y, -0.7]);
  const jar = L('pickle_jar');
  for (let i = 0; i < 5; i++) k.add(jar, cyl(0.06, 0.06, 0.15, 6), [-1.0 + i * 0.5, 1.295, -0.7]);
  const skinA = L('fish_skin', 0xb0b8b8), skinB = L('fish_skin', 0x80a8b0);
  for (let i = 0; i < 4; i++) k.add(i % 2 ? L('cardboard') : L('crate_wood'), box(0.28, 0.22, 0.26), [-0.9 + i * 0.6, 1.83, -0.7], [0, (r() - 0.5) * 0.3, 0]);
  for (const sx of [-1, 1]) {
    k.add(L('crate_wood'), box(0.6, 0.5, 0.5), [sx * 1.95, 0.25, 0.9]);
    for (let j = 0; j < 2; j++) lowFish(k, skinA, [sx * 1.95 + (j - 0.5) * 0.2, 0.53, 0.9], [0, r() * TAU, 0], 0.4);
    col(c, sx * 1.95, 0.25, 0.9, 0.6, 0.5, 0.5);
  }
  const hook = L('metal_dark');
  [-1.0, -0.4, 0.4, 1.0].forEach((x, i) => {
    k.add(hook, box(0.01, 0.3, 0.01), [x, 2.05, 0.8]);
    lowFish(k, i % 2 ? skinA : skinB, [x, 1.65, 0.8], [0, 0.3 * i, -HP], 0.5);
  });
  k.add(hook, box(0.14, 0.2, 0.14), [1.2, 2.0, 0.95]);
  k.add(B(null, 0xffc060), box(0.1, 0.14, 0.15), [1.2, 2.0, 0.95]);
  k.add(hook, box(0.02, 0.2, 0.02), [1.2, 2.2, 0.95]);
  anc(c, 'npc', [0, 0, -0.2]);
  light(c, [1.2, 1.95, 1.05], 0xffb060, 1.0, 8, { flicker: true });
  colMM(c, -W / 2, 0, 0.4, W / 2, 1.05, 0.9);
  for (const sx of [-1, 1]) colMM(c, Math.min(sx * (W / 2 - 0.4), sx * W / 2), 0, -0.9, Math.max(sx * (W / 2 - 0.4), sx * W / 2), 1.0, 0.4);
  colMM(c, -W / 2, 0, -0.9, W / 2, 2.0, -0.52);
};
PROPS.quest_board = (k, c) => {
  const wd = L('wood_dark', 0x9a7a58), pl = L('wood_planks', 0xa08060);
  for (const sx of [-1, 1]) k.add(wd, box(0.12, 2.5, 0.12), [sx * 1.1, 1.25, 0]);
  k.add(wd, box(2.3, 1.35, 0.06), [0, 1.55, 0]);
  k.add(wd, box(2.3, 0.08, 0.1), [0, 2.24, 0.02]);
  k.add(wd, box(2.3, 0.08, 0.1), [0, 0.86, 0.02]);
  const b = screenMesh('board', 2.1, 1.15, 'corkboard');
  b.position.set(0, 1.55, 0.032);
  c.root.add(b);
  c.anchors.board = b;
  for (const sz of [-1, 1]) k.add(pl, box(2.6, 0.04, 0.5), [0, 2.62, sz * 0.2], [-sz * 0.5, 0, 0], null, 1);
  colMM(c, -1.2, 0, -0.1, 1.2, 2.3, 0.1);
};
PROPS.company_sign = (k, c) => {
  const dk = L('metal_dark'), neon = B(null, 0xff3a30), leg = L('metal_rust', 0xa0a0a0);
  const legs = c.variant === 1, y0 = legs ? 4.2 : 0, FW = 5.0, FH = 2.5, cy = y0 + (FH + 0.3) / 2;
  k.add(dk, box(FW + 0.3, FH + 0.3, 0.3), [0, cy, 0], null, null, 1);
  k.add(B('sign_company', 0xffffff, DECAL), plane(FW, FH), [0, cy, 0.152]);
  k.add(neon, box(FW + 0.1, 0.06, 0.04), [0, cy + FH / 2 + 0.05, 0.17]);
  k.add(neon, box(FW + 0.1, 0.06, 0.04), [0, cy - FH / 2 - 0.05, 0.17]);
  for (const sx of [-1, 1]) k.add(neon, box(0.06, FH + 0.1, 0.04), [sx * (FW / 2 + 0.05), cy, 0.17]);
  if (legs) {
    for (const sx of [-1, 1]) {
      k.add(leg, box(0.3, y0, 0.3), [sx * 1.8, y0 / 2, 0], null, null, 1);
      k.add(L('concrete'), box(0.7, 0.3, 0.7), [sx * 1.8, 0.15, 0]);
      col(c, sx * 1.8, y0 / 2, 0, 0.7, y0, 0.7);
    }
    k.add(L('metal_grate'), box(FW + 0.3, 0.06, 0.6), [0, y0 - 0.05, 0.45], null, null, 1);
  }
  colMM(c, -(FW + 0.3) / 2, y0, -0.15, (FW + 0.3) / 2, y0 + FH + 0.3, 0.15);
  light(c, [0, cy, 2.2], 0xff5040, 1.5, 14);
};
PROPS.crane = (k, c) => {
  const y = L('paint', 0xc89020), dk = L('metal_dark'), lat = L('lattice', 0xe0b040), cable = L('metal_dark', 0x505050);
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
    k.add(y, box(0.6, 12, 0.6), [x, 6, z], null, null, 1);
    k.add(dk, box(1.0, 0.5, 1.2), [x, 0.25, z]);
    col(c, x, 6, z, 1.0, 12, 1.2);
  }
  for (const z of [-3, 3]) k.add(y, box(8.6, 0.8, 0.8), [0, 11.6, z], null, null, 1);
  for (const x of [-4, 4]) {
    k.add(y, box(0.8, 0.8, 6.6), [x, 11.6, 0], null, null, 1);
    k.beam(y, [x, 1, -3], [x, 10.8, 3], 0.25);
    k.beam(y, [x, 1, 3], [x, 10.8, -3], 0.25);
  }
  k.add(y, box(5, 3, 4.5), [0, 13.5, -0.5], null, null, 1);
  k.add(L('vent', 0x909090, DECAL), plane(1.5, 1), [2.502, 13.5, -1], [0, HP, 0]);
  k.add(y, box(1.6, 1.6, 1.6), [2.0, 12.6, 2.5], null, null, 1);
  k.add(L('glass', 0x40505a, DECAL), plane(1.3, 0.9), [2.0, 12.8, 3.302]);
  k.add(lat, box(1.4, 1.4, 24), [0, 14.2, 13], null, null, 1.4);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(y, box(0.15, 0.15, 24), [sx * 0.65, 14.2 + sy * 0.65, 13]);
  k.add(L('concrete'), box(3, 2, 2), [0, 14, -4.5], null, null, 1);
  k.limb(dk, [0, 15, 0], [0, 18, -1], 0.12, 0.1, 5);
  k.limb(cable, [0, 18, -1], [0, 14.9, 25], 0.03, 0.03, 4);
  k.limb(cable, [0, 18, -1], [0, 15, -4.5], 0.03, 0.03, 4);
  k.add(cable, box(0.04, 8, 0.04), [0, 10.1, 24.5]);
  k.add(y, box(0.5, 0.6, 0.4), [0, 5.8, 24.5]);
  k.add(dk, tor(0.25, 0.06, 3, 8, PI * 1.4), [0, 5.2, 24.5], [0, 0, -PI * 0.2]);
  k.add(B(null, 0xff2020), sph(0.15, 6, 4), [0, 18.2, -1]);
  colMM(c, -2.5, 12, -2.75, 2.5, 15, 1.75);
  light(c, [0, 18.2, -1], 0xff2020, 1.2, 20, { blink: 0.8 });
};
PROPS.fish_crates = (k, c) => {
  const wd = L('wood_planks', 0xb09878), ice = L('snow', 0xe0f0ff), r = c.rng;
  const skins = [L('fish_skin', 0xb0b8b8), L('fish_skin', 0x80a8b0), L('fish_skin', 0xd0d4d8)];
  for (const [x, y, z] of [[-0.45, 0, 0], [0.45, 0, 0.05], [0, 0.4, 0.02]]) {
    k.add(wd, box(0.8, 0.03, 0.55), [x, y + 0.015, z]);
    for (const sz of [-1, 1]) k.add(wd, box(0.8, 0.37, 0.03), [x, y + 0.2, z + sz * 0.26]);
    for (const sx of [-1, 1]) k.add(wd, box(0.03, 0.37, 0.49), [x + sx * 0.385, y + 0.2, z]);
    k.add(ice, box(0.74, 0.02, 0.49), [x, y + 0.3, z], null, null, 0.5);
    for (let j = 0; j < 4; j++) lowFish(k, skins[Math.floor(r() * 3)], [x + (r() - 0.5) * 0.35, y + 0.34, z + (r() - 0.5) * 0.25], [HP * 0.95, r() * TAU, 0], 0.35 + r() * 0.1);
    col(c, x, y + 0.2, z, 0.8, 0.4, 0.55);
  }
};

// ------------------------------------------------------------ interior themes (src/world/interiors)
/** CRT monitor on a desk top (front toward +Z), screen texture tex */
function crt(k, x, y, z, rotY, tex, glow = 0xb8d8ff) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
  const off = (lx, ly, lz) => { const v = new THREE.Vector3(lx, ly, lz).applyQuaternion(q); return [x + v.x, y + v.y, z + v.z]; };
  const shell = L('plastic', 0xd4ceb8);
  k.add(shell, box(0.42, 0.36, 0.38), off(0, 0.24, -0.02), q);
  k.add(shell, box(0.3, 0.26, 0.14), off(0, 0.22, -0.26), q);
  k.add(shell, box(0.22, 0.04, 0.2), off(0, 0.02, 0), q);
  k.add(B(tex, glow, DECAL), plane(0.34, 0.27), off(0, 0.25, 0.172), q);
  k.add(L('keyboard', 0xd8d2bc), box(0.44, 0.03, 0.15), off(0, 0.015, 0.3), q);
}
PROPS.cubicle = (k, c) => {
  // 2.2 x 2.2 m workstation, open toward +Z: L-desk along the back, CRT, chair, pinned notes
  const S = 2.2, H = 1.35, T = 0.06, fab = L('cubicle_fabric'), trim = L('paint', 0x6a6e74), top = L('plastic', 0xc8c0a8);
  k.add(fab, box(S, H, T), [0, H / 2, -S / 2 + T / 2], null, null, 1);
  for (const sx of [-1, 1]) k.add(fab, box(T, H, S - 0.5), [sx * (S / 2 - T / 2), H / 2, -0.25], null, null, 1);
  k.add(trim, box(S, 0.04, T + 0.02), [0, H + 0.02, -S / 2 + T / 2]);
  for (const sx of [-1, 1]) k.add(trim, box(T + 0.02, 0.04, S - 0.5), [sx * (S / 2 - T / 2), H + 0.02, -0.25]);
  const dz = -S / 2 + T + 0.35;
  k.add(top, box(S - 2 * T, 0.04, 0.7), [0, 0.74, dz]);
  k.add(top, box(0.7, 0.04, 0.8), [-S / 2 + T + 0.35, 0.74, dz + 0.72]);
  k.add(trim, box(0.4, 0.7, 0.6), [S / 2 - T - 0.24, 0.36, dz]);
  const tex = c.pick(4) === 0 ? 'screen_noc' : c.pick(3) === 0 ? 'noise_static' : 'screen_off';
  crt(k, 0.2 - c.rng() * 0.3, 0.76, dz - 0.05, (c.rng() - 0.5) * 0.4, tex);
  k.add(L('corkboard', 0xffffff, DECAL), plane(0.7, 0.45), [-0.4, 1.08, -S / 2 + T + 0.004]);
  if (c.rng() < 0.6) k.item('mug', [0.7, 0.78, dz + 0.1]);
  // chair (pushed out at a random angle)
  const bk = L('plastic', 0x2a2a2c), cf = L('fabric', 0x3a4048), a = (c.rng() - 0.5) * 1.4, cz = dz + 0.95;
  k.add(bk, cyl(0.26, 0.26, 0.04, 8), [0.1, 0.06, cz]);
  k.add(L('metal', 0x909090), cyl(0.025, 0.025, 0.36, 6), [0.1, 0.26, cz]);
  k.add(cf, box(0.46, 0.08, 0.44), [0.1, 0.46, cz], [0, a, 0]);
  k.add(cf, box(0.42, 0.5, 0.07), [0.1 + Math.sin(a) * 0.21, 0.78, cz + Math.cos(a) * 0.21], [0.12, a, 0]);
  colMM(c, -S / 2, 0, -S / 2, S / 2, H, -S / 2 + T);
  colMM(c, -S / 2, 0, -S / 2, -S / 2 + T, H, S / 2 - 0.5);
  colMM(c, S / 2 - T, 0, -S / 2, S / 2, H, S / 2 - 0.5);
  colMM(c, -S / 2 + T, 0, -S / 2 + T, S / 2 - T, 0.76, dz + 0.35);
};
PROPS.desk_computer = (k, c) => {
  PROPS.desk(k, c);
  crt(k, -0.15, 0.76, -0.1, 0.15, c.pick(2) ? 'screen_noc' : 'screen_off');
};
PROPS.conference_table = (k, c) => {
  const W = 3.6, D = 1.3, H = 0.76, wd = L('wood_dark', 0x9a7a58), leg = L('metal_dark');
  k.add(wd, box(W, 0.06, D), [0, H - 0.03, 0], null, null, 1);
  for (const x of [-1.2, 1.2]) k.add(leg, box(0.12, H - 0.06, 0.7), [x, (H - 0.06) / 2, 0]);
  k.add(L(null, 0x202428), box(0.3, 0.05, 0.3), [0, H + 0.025, 0]);   // conference phone
  const bk = L('plastic', 0x2a2a2c), cf = L('fabric', 0x503a3a);
  for (let i = 0; i < 6; i++) {
    const x = -1.2 + (i % 3) * 1.2, sz = i < 3 ? 1 : -1, a = (c.rng() - 0.5) * 0.8 + (sz > 0 ? PI : 0);
    const cz = sz * (D / 2 + 0.35 + c.rng() * 0.25);
    k.add(bk, cyl(0.24, 0.24, 0.04, 8), [x, 0.06, cz]);
    k.add(cf, box(0.46, 0.08, 0.44), [x, 0.46, cz], [0, a, 0]);
    k.add(cf, box(0.42, 0.5, 0.07), [x - Math.sin(a) * 0.21, 0.78, cz - Math.cos(a) * 0.21], [-0.12, a, 0]);
  }
  if (c.rng() < 0.7) k.item('mug', [0.8, H + 0.02, 0.2]);
  colMM(c, -W / 2, 0, -D / 2, W / 2, H, D / 2);
};
PROPS.whiteboard = (k, c) => {
  // wall prop with its origin on the floor (board hangs 1.0 - 2.2 m); centred on its own depth
  c.mount = 'wall';
  const fr = L('metal', 0xb0b4b8);
  k.add(fr, box(2.0, 1.2, 0.03), [0, 1.6, -0.025]);
  k.add(L('whiteboard', 0xffffff, DECAL), plane(1.96, 1.16), [0, 1.6, -0.008]);
  k.add(fr, box(1.4, 0.03, 0.08), [0, 0.99, 0]);
  colMM(c, -1.0, 1.0, -0.04, 1.0, 2.2, 0.04);
};
PROPS.copier = (k, c) => {
  const body = L('plastic', 0xd8d4c8), dk = L('plastic', 0x505458);
  k.add(body, box(0.9, 0.9, 0.65), [0, 0.45, 0], null, null, 1);
  k.add(body, box(0.9, 0.12, 0.65), [0, 0.98, 0]);
  k.add(dk, box(0.86, 0.02, 0.6), [0, 1.05, 0]);
  k.add(dk, box(0.3, 0.08, 0.2), [0.28, 0.96, 0.33]);
  k.add(B(null, 0x40ff80), box(0.03, 0.02, 0.01), [0.2, 0.97, 0.435]);
  k.add(L('plastic', 0xf0eee6), box(0.35, 0.03, 0.28), [-0.6, 0.72, 0], [0, 0, -0.2]);
  k.add(body, box(0.4, 0.04, 0.4), [-0.58, 0.68, 0]);
  for (let i = 0; i < 3; i++) k.add(dk, box(0.86, 0.01, 0.02), [0, 0.2 + i * 0.2, 0.328]);
  colMM(c, -0.45, 0, -0.33, 0.45, 1.06, 0.33);
};
PROPS.elevator_door = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const st = L('metal', 0xa8acb0), fr = L('metal_dark', 0x6a6e72);
  k.add(fr, box(2.4, 2.9, 0.12), [0, 1.45, 0.06]);
  k.add(st, box(0.88, 2.4, 0.04), [-0.45, 1.2, 0.14], null, null, 1);
  k.add(st, box(0.88, 2.4, 0.04), [0.45, 1.2, 0.14], null, null, 1);
  k.add(L(null, 0x0a0a0a), box(0.02, 2.4, 0.045), [0, 1.2, 0.141]);
  k.add(L('elevator_panel', 0xffffff, DECAL), plane(0.22, 0.44), [1.02, 1.3, 0.121]);
  k.add(fr, box(1.0, 0.2, 0.06), [0, 2.7, 0.14]);
  k.add(B(null, c.pick(3) ? 0xff7a30 : 0x40ff80), box(0.5, 0.06, 0.01), [0, 2.7, 0.172]);
  light(c, [0, 2.75, 0.35], 0xffa060, 0.25, 3, { flicker: true });
  colMM(c, -1.2, 0, 0, 1.2, 2.9, 0.16);
};
PROPS.ceiling_panel = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  k.add(L('paint', 0xd8d4c0), box(1.24, 0.04, 0.64), [0, -0.02, 0]);
  k.add(B('ceiling_panel_lit', 0xfff4cc), plane(1.16, 0.56), [0, -0.041, 0], [HP, 0, 0]);
  light(c, [0, -0.35, 0], 0xfff0c0, 0.9, 8.5);
  colMM(c, -0.62, -0.05, -0.32, 0.62, 0, 0.32);
};
PROPS.crac_unit = (k, c) => {
  const body = L('paint', 0xc8ccd0), dk = L('metal_dark');
  k.add(body, box(1.8, 2.0, 0.9), [0, 1.0, 0], null, null, 1);
  k.add(L('vent', 0x9aa0a8, DECAL), plane(1.5, 0.9), [0, 1.35, 0.452]);
  k.add(L('vent', 0x9aa0a8, DECAL), plane(1.5, 0.5), [0, 0.4, 0.452]);
  k.add(dk, box(0.4, 0.22, 0.04), [0.55, 1.88, 0.46]);
  k.add(B('screen_noc', 0xffffff, DECAL), plane(0.34, 0.16), [0.55, 1.88, 0.482]);
  k.add(B(null, 0x40a0ff), box(0.06, 0.03, 0.01), [-0.6, 1.88, 0.457]);
  colMM(c, -0.9, 0, -0.45, 0.9, 2.0, 0.46);
  light(c, [0, 1.2, 0.8], 0x70b8ff, 0.35, 4);
};
PROPS.core_pillar = (k, c) => {
  // server farm landmark: a humming mainframe column with glowing seams
  const body = L('metal_dark', 0x3a4048), glow = B(null, 0x40d0ff), st = L('metal', 0x9aa4ae);
  k.add(body, box(1.6, 5.6, 1.6), [0, 2.8, 0], null, null, 1);
  for (const y of [0.9, 2.1, 3.3, 4.5]) {
    k.add(glow, box(1.64, 0.06, 1.64), [0, y, 0]);
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.add(L('server_front', 0xffffff, DECAL), plane(1.2, 0.9), [sx * 0.805, y + 0.5, sz * 0.805], [0, sx ? sx * HP : (sz > 0 ? 0 : PI), 0]);
  }
  k.add(st, box(2.2, 0.3, 2.2), [0, 0.15, 0]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.limb(L('rubber', 0x202020), [sx * 0.7, 5.6, sz * 0.7], [sx * 1.2, 7.5, sz * 1.2], 0.07, 0.07, 5);
  colMM(c, -1.1, 0, -1.1, 1.1, 5.6, 1.1);
  light(c, [0, 3, 1.4], 0x40d0ff, 1.1, 10);
};
PROPS.iv_stand = (k, c) => {
  const mt = L('metal', 0xc0c4c4);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k.add(mt, box(0.28, 0.02, 0.03), [Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13], [0, -a, 0]); }
  k.add(mt, cyl(0.012, 0.012, 1.9, 5), [0, 1.0, 0]);
  k.add(mt, box(0.4, 0.015, 0.015), [0, 1.9, 0]);
  k.add(L('glass', 0xd8e8d0, { opacity: 0.7 }), box(0.12, 0.2, 0.04), [0.12, 1.75, 0]);
  k.add(L('glass', 0xa02020, { opacity: 0.8 }), box(0.1, 0.16, 0.04), [-0.12, 1.76, 0]);
  colMM(c, -0.15, 0, -0.15, 0.15, 1.95, 0.15);
};
PROPS.curtain_divider = (k, c) => {
  const mt = L('metal', 0xb0b4b4), cur = L('curtain', 0xffffff, { double: true });
  k.add(mt, box(2.0, 0.03, 0.03), [0, 2.1, 0]);
  for (const x of [-0.98, 0.98]) { k.add(mt, cyl(0.015, 0.015, 2.1, 5), [x, 1.05, 0]); k.add(mt, box(0.4, 0.02, 0.04), [x, 0.01, 0]); }
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = -0.9 + (i + 0.5) * (1.8 / n);
    k.add(cur, plane(1.8 / n + 0.02, 1.7), [x, 1.2, (i & 1 ? 0.05 : -0.05)], [0, (i & 1 ? 0.35 : -0.35), 0]);
  }
  colMM(c, -1.0, 0, -0.1, 1.0, 2.1, 0.1);
};
PROPS.morgue_drawers = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const st = L('metal', 0xa8acb0);
  k.add(st, box(2.0, 2.1, 0.9), [0, 1.05, 0.45], null, null, 1);
  k.add(L('morgue_front', 0xffffff, DECAL), plane(1.96, 2.0), [0, 1.05, 0.902]);
  // one door hanging open on some units: a dark slot and a toe tag
  if (c.pick(3) === 0) {
    k.add(B(null, 0x050505), plane(0.8, 0.5), [-0.5, 0.75, 0.905]);
    k.add(L('fabric', 0xd8dcd8), box(0.5, 0.18, 0.06), [-0.5, 0.7, 0.88]);
    k.add(L('plastic', 0xe8dca0), box(0.06, 0.1, 0.01), [-0.35, 0.62, 0.915]);
  }
  colMM(c, -1.0, 0, 0, 1.0, 2.1, 0.92);
};
PROPS.operating_table = (k, c) => {
  const mt = L('metal', 0xb8bcbc), pad = L('rubber', 0x2a4a48);
  k.add(mt, cyl(0.12, 0.2, 0.7, 8), [0, 0.35, 0]);
  k.add(mt, box(0.7, 0.08, 2.0), [0, 0.74, 0]);
  k.add(pad, box(0.64, 0.06, 1.94), [0, 0.81, 0]);
  k.add(L('blood_splat', 0xffffff, DECAL), plane(0.6, 0.6), [0.05, 0.842, 0.2], [-HP, 0, 1.1]);
  // instrument tray
  k.add(mt, cyl(0.012, 0.012, 1.0, 5), [0.75, 0.5, -0.6]);
  k.add(mt, box(0.5, 0.02, 0.35), [0.75, 1.0, -0.6]);
  for (let i = 0; i < 4; i++) k.add(L('metal', 0xe0e0e0), box(0.02, 0.01, 0.18), [0.6 + i * 0.09, 1.015, -0.6]);
  colMM(c, -0.36, 0, -1.0, 0.36, 0.84, 1.0);
};
PROPS.surgical_lamp = (k, c) => {
  c.mount = 'ceiling';
  c.recenter = true;
  const mt = L('paint', 0xd8dcdc), dk = L('metal_dark');
  k.add(dk, cyl(0.08, 0.08, 0.05, 8), [0, -0.025, 0]);
  k.limb(mt, [0, -0.05, 0], [0, -0.8, 0], 0.03, 0.03, 5);
  k.limb(mt, [0, -0.8, 0], [0.5, -1.0, 0], 0.03, 0.03, 5);
  k.add(mt, cyl(0.45, 0.3, 0.14, 12, true), [0.5, -1.12, 0]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k.add(B(null, 0xf4fbff), sph(0.07, 6, 4), [0.5 + Math.cos(a) * 0.2, -1.18, Math.sin(a) * 0.2]); }
  k.add(B(null, 0xf4fbff), sph(0.08, 6, 4), [0.5, -1.18, 0]);
  light(c, [0.5, -1.5, 0], 0xf0faff, 1.6, 9);
  colMM(c, 0.05, -1.2, -0.45, 0.95, -1.05, 0.45);
};
PROPS.wheelchair = (k, c) => {
  const mt = L('metal', 0xb0b4b4), fb = L('fabric', 0x303838);
  for (const sx of [-1, 1]) {
    k.add(L('rubber'), tor(0.28, 0.025, 4, 12), [sx * 0.3, 0.3, -0.05], [0, HP, 0]);
    k.add(L('rubber'), cyl(0.06, 0.06, 0.03, 6), [sx * 0.22, 0.06, 0.35], [0, 0, HP]);
    k.add(mt, box(0.02, 0.5, 0.02), [sx * 0.24, 0.72, -0.2]);
    k.add(mt, box(0.02, 0.02, 0.5), [sx * 0.24, 0.62, 0.05]);
  }
  k.add(fb, box(0.46, 0.05, 0.42), [0, 0.5, 0.05]);
  k.add(fb, box(0.46, 0.42, 0.04), [0, 0.76, -0.19], [-0.1, 0, 0]);
  colMM(c, -0.34, 0, -0.34, 0.34, 0.95, 0.42);
};
PROPS.reception_desk = (k, c) => {
  const body = L('paint', 0x8a9a92), top = L('plastic', 0xd8d4c4);
  k.add(body, box(2.6, 1.05, 0.5), [0, 0.525, 0.25], null, null, 1);
  for (const sx of [-1, 1]) k.add(body, box(0.5, 1.05, 1.1), [sx * 1.3, 0.525, -0.3], null, null, 1);
  k.add(top, box(2.8, 0.05, 0.6), [0, 1.08, 0.3]);
  k.add(top, box(3.2, 0.04, 0.6), [0, 0.76, -0.25]);
  crt(k, 0.4, 0.78, -0.3, PI + 0.2, 'screen_noc');
  k.add(L('paint', 0xa02020), box(0.1, 0.08, 0.1), [-0.6, 1.14, 0.3]);
  colMM(c, -1.55, 0, 0, 1.55, 1.1, 0.55);
  colMM(c, -1.55, 0, -0.85, -1.05, 1.05, 0);
  colMM(c, 1.05, 0, -0.85, 1.55, 1.05, 0);
};
PROPS.sewer_outlet = (k, c) => {
  c.mount = 'wall';
  c.recenter = true;
  const conc = L('concrete_dark', 0x8a9080), rust = L('metal_rust');
  k.add(conc, cyl(0.62, 0.62, 0.4, 12, true), [0, 0.8, 0.2], [HP, 0, 0]);
  k.add(conc, tor(0.62, 0.08, 4, 12), [0, 0.8, 0.4]);
  k.add(B(null, 0x040604), circ(0.56, 12), [0, 0.8, 0.06]);
  for (let i = -3; i <= 3; i++) k.add(rust, box(0.03, 1.1, 0.03), [i * 0.15, 0.8, 0.36]);
  k.add(L('sludge', 0x6a9a50, DECAL), plane(0.5, 0.9), [0, 0.3, 0.42], [-0.5, 0, 0]);
  colMM(c, -0.7, 0.1, 0, 0.7, 1.5, 0.45);
};
PROPS.pump_machine = (k, c) => {
  const body = L('paint', 0x3a6a4a), dk = L('metal_dark'), pipe = L('pipes', 0x7a6a5a);
  k.add(dk, box(1.6, 0.15, 1.0), [0, 0.075, 0]);
  k.add(body, cyl(0.45, 0.45, 1.0, 10), [-0.2, 0.7, 0], [0, 0, HP]);
  k.add(body, box(0.5, 0.7, 0.6), [0.55, 0.5, 0]);
  k.limb(pipe, [-0.2, 1.1, 0], [-0.2, 2.6, 0], 0.14, 0.14, 8);
  k.limb(pipe, [-0.7, 0.7, 0], [-1.2, 0.7, 0], 0.14, 0.14, 8);
  k.add(L('paint', 0xb02020), tor(0.2, 0.025, 3, 10), [-0.2, 1.7, 0.2]);
  k.add(L('gauge', 0xffffff, DECAL), circ(0.08, 8), [0.55, 0.7, 0.302]);
  colMM(c, -0.8, 0, -0.5, 0.8, 1.2, 0.5);
  col(c, -0.2, 1.85, 0, 0.3, 1.5, 0.3);
};
PROPS.planter = (k, c) => {
  const pot = L('plastic', 0x6a5a48), leaf = L('leaves', c.pick(2) ? 0x6a7a40 : 0x8a7a40, { alphaTest: 0.5, double: true });
  k.add(pot, cyl(0.25, 0.2, 0.45, 8), [0, 0.225, 0]);
  k.add(L('dirt'), circ(0.23, 8), [0, 0.44, 0], [-HP, 0, 0]);
  k.limb(L('bark'), [0, 0.44, 0], [0.05, 1.3, 0.02], 0.03, 0.02, 5);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k.add(leaf, plane(0.5, 0.5), [Math.cos(a) * 0.15, 1.2 + c.rng() * 0.3, Math.sin(a) * 0.15], [0.4, a, 0]); }
  colMM(c, -0.25, 0, -0.25, 0.25, 0.45, 0.25);
};

function unknownProp(k, c) {
  k.add(L('unknown'), box(1, 1, 1), [0, 0.5, 0]);
  col(c, 0, 0.5, 0, 1, 1, 1);
}

// item size lookup (used to rest items on surfaces)
const _itemSize = new Map();
function createItemSizeCache(id) {
  if (!_itemSize.has(id)) {
    const k = new Kit();
    k.item(id);
    const g = new THREE.Group();
    k.into(g);
    const bb = new THREE.Box3().setFromObject(g);
    const s = bb.getSize(new THREE.Vector3());
    _itemSize.set(id, [s.x, s.y, s.z]);
    g.traverse((o) => o.geometry && o.geometry.dispose());
  }
  return _itemSize.get(id);
}

export const PROP_IDS = Object.freeze([
  // facility
  'shelf_metal', 'crate_wood', 'crate_metal', 'barrel', 'barrel_toxic', 'pipe_bundle', 'desk', 'office_chair',
  'filing_cabinet', 'locker', 'vending_machine', 'ceiling_lamp', 'wall_lamp', 'fluorescent', 'generator',
  'server_rack_prop', 'boiler', 'toilet', 'sink', 'water_cooler', 'hospital_bed', 'table', 'bookcase', 'armchair',
  'grandfather_clock', 'fireplace', 'chandelier', 'vent_cover', 'fuse_box', 'vault_door', 'keypad', 'blast_door',
  'door_single', 'door_mansion', 'cardboard_boxes', 'pallet', 'traffic_cone', 'bench', 'catwalk_railing',
  'stairs_metal', 'cobweb', 'pipe_vertical', 'hanging_chains', 'mop_bucket', 'wet_floor_sign',
  // outdoor
  'pine_tree', 'dead_tree', 'rock_big', 'rock_small', 'bush', 'grass_clump', 'fence_segment', 'shipping_container',
  'ruined_wall', 'lamp_post', 'facility_entrance', 'fire_exit', 'pond', 'dock', 'radio_tower', 'car_wreck',
  'oil_drum_stack', 'landing_pad', 'power_pylon',
  // ship interior
  'terminal', 'monitor_bank', 'lever', 'bunkbed', 'cupboard', 'arcade_cabinet', 'charging_station', 'door_panel',
  'ship_light', 'suit_rack', 'coffee_machine', 'quota_screen',
  // company HQ
  'sell_counter', 'desk_bell', 'slot_machine', 'vendor_stall', 'quest_board', 'company_sign', 'crane', 'fish_crates',
  // interior themes (office / backrooms / serverfarm / sewer / hospital - src/world/interiors)
  'cubicle', 'desk_computer', 'conference_table', 'whiteboard', 'copier', 'elevator_door', 'ceiling_panel', 'crac_unit',
  'core_pillar', 'iv_stand', 'curtain_divider', 'morgue_drawers', 'operating_table', 'surgical_lamp', 'wheelchair',
  'reception_desk', 'sewer_outlet', 'pump_machine', 'planter',
]);

/** Move a wall / ceiling prop so its origin is the bottom centre of its bounding box. */
function recenterBottom(root, c) {
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  if (bb.isEmpty()) return;
  const off = new THREE.Vector3(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  off.set(r3(off.x), r3(off.y), r3(off.z));
  for (const ch of root.children) ch.position.add(off);
  for (const cl of c.colliders) cl.c = [r3(cl.c[0] + off.x), r3(cl.c[1] + off.y), r3(cl.c[2] + off.z)];
  for (const l of c.lights) l.p = [r3(l.p[0] + off.x), r3(l.p[1] + off.y), r3(l.p[2] + off.z)];
  c.extra.mountPoint = [off.x, off.y, off.z];
  if (c.mount === 'wall') c.extra.suggestedY = r3(bb.min.y);
  if (c.mount === 'ceiling') c.extra.hangHeight = r3(off.y);
}

/** Build a prop. Unknown ids return a 1m '?' crate. */
export function createProp(id, opts = {}) {
  opts = opts || {};
  const seed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const variant = Number.isFinite(opts.variant) ? Math.max(0, Math.floor(opts.variant)) : 0;
  const root = new THREE.Group();
  root.name = 'prop_' + id;
  const rng = seededRandom(hashString(`${id}:${seed}:${variant}`));
  const c = {
    id, opts, seed, variant, rng, root,
    colliders: [], lights: [], anchors: {}, extra: {}, mount: 'floor',
    /** variant if given, else seeded pick */
    pick: (n) => (Number.isFinite(opts.variant) ? variant % n : Math.floor(rng() * n) % n),
  };
  const k = new Kit();
  (PROPS[id] || unknownProp)(k, c);
  k.into(root);
  if (c.recenter) recenterBottom(root, c);
  root.userData.propId = id;
  root.userData.mount = c.mount;
  root.userData.colliders = c.colliders;
  if (c.lights.length) root.userData.lights = c.lights;
  if (Object.keys(c.anchors).length) root.userData.anchors = c.anchors;
  Object.assign(root.userData, c.extra);
  root.updateMatrixWorld(true);
  return root;
}
