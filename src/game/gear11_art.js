// gear11_art (wave 11): PSX low-poly models (held item models + the world props), procedural sounds and the glow-trail
// instanced mesh for the five new gadgets. No scene lights anywhere: every glow is an unlit / emissive material.
import * as THREE from 'three';
import { ModelKit } from '../models/items.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';
import { synth, sin, ex, nz } from './combat_kit.js';
import { TRAIL, TRAIL_COLORS, ZIP } from './gear11_core.js';

const { Kit, G } = ModelKit;
const HP = Math.PI / 2;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const { box, cyl, cone, sph } = G;

function done(k, root, kind = 'tool') { k.into(root); root.userData.kind = kind; return root; }

// ================================================================================================== held item models (meters, +Y up)
function decoyspeaker() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal_dark', 0x2c2f36), box(0.11, 0.15, 0.08));
  k.add(L('paint', 0xd9482f), box(0.112, 0.02, 0.082), [0, 0.07, 0]);
  k.add(B('paint', 0x101014), cyl(0.038, 0.038, 0.012, 10), [0, 0.01, 0.042], [HP, 0, 0]);
  k.add(L('metal', 0x9aa0a8), cone(0.03, 0.02, 8), [0, 0.01, 0.052], [HP, 0, 0]);
  k.add(B('paint', 0x101014), cyl(0.014, 0.014, 0.01, 8), [0, -0.045, 0.042], [HP, 0, 0]);
  k.add(L('metal', 0xc0c0c0), cyl(0.004, 0.004, 0.11, 4), [0.035, 0.13, 0]);
  k.add(B('paint', 0x40ffb0), sph(0.008, 5, 4), [0.035, 0.187, 0]);
  k.add(L('metal', 0x8a9098), box(0.05, 0.012, 0.03), [0, 0.081, 0]);
  return done(k, root, 'consumable');
}
function doorjammer() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal', 0xb0a06a), box(0.13, 0.05, 0.09));
  k.add(L('metal_dark', 0x33363c), box(0.14, 0.015, 0.05), [0, 0.032, 0.02]);
  k.add(L('metal_dark', 0x33363c), box(0.03, 0.09, 0.09), [-0.075, -0.02, 0]);
  k.add(L('metal_dark', 0x33363c), box(0.03, 0.09, 0.09), [0.075, -0.02, 0]);
  k.add(B('paint', 0xff3a2a), box(0.02, 0.012, 0.02), [0.02, 0.03, -0.02]);
  k.add(L('paint', 0x222226), box(0.05, 0.006, 0.03), [-0.02, 0.029, -0.02]);
  return done(k, root);
}
function scoutdrone() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal_dark', 0x2a2d33), box(0.13, 0.045, 0.16));
  k.add(L('paint', 0xe8e8e8), box(0.135, 0.012, 0.06), [0, 0.028, -0.02]);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    k.beam(L('metal', 0x8a9098), [0, 0, 0], [sx * 0.11, 0.01, sz * 0.11], 0.018);
    k.add(B('paint', 0x14161a), cyl(0.06, 0.06, 0.004, 10), [sx * 0.11, 0.028, sz * 0.11]);
  }
  k.add(B('paint', 0x0a0a0e), cyl(0.022, 0.022, 0.02, 8), [0, -0.005, 0.085], [HP, 0, 0]);
  k.add(B('paint', 0x40e0ff), sph(0.011, 5, 4), [0, -0.005, 0.098]);
  k.add(B('paint', 0xff3030), sph(0.009, 5, 4), [0.03, 0.03, -0.07]);
  return done(k, root);
}
function glowspray() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('paint', 0x1f2a24), cyl(0.032, 0.032, 0.14, 10));
  k.add(B('paint', 0x4dffb4), cyl(0.0335, 0.0335, 0.03, 10), [0, 0.01, 0]);
  k.add(L('metal', 0xc8ccd0), cyl(0.02, 0.032, 0.02, 10), [0, 0.08, 0]);
  k.add(L('metal', 0xc8ccd0), cyl(0.008, 0.008, 0.02, 6), [0, 0.1, 0]);
  k.add(L('paint', 0x111318), box(0.02, 0.012, 0.03), [0, 0.11, 0.015]);
  k.add(B('paint', 0x4dffb4), box(0.05, 0.012, 0.004), [0, -0.03, 0.0335]);
  return done(k, root, 'consumable');
}
function ziplinekit() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal_dark', 0x2b2f36), box(0.06, 0.09, 0.2), [0, 0, 0]);
  k.add(L('metal', 0xa8aeb6), cyl(0.024, 0.024, 0.16, 8), [0, 0.02, -0.16], [HP, 0, 0]);
  k.add(L('paint', 0xf0a020), cyl(0.05, 0.05, 0.05, 10), [0, -0.005, 0.06], [0, 0, HP]);
  k.add(B('paint', 0xff8a30), cyl(0.052, 0.052, 0.008, 10), [0.03, -0.005, 0.06], [0, 0, HP]);
  k.add(L('metal_dark', 0x3a3e46), box(0.04, 0.09, 0.05), [0, -0.085, 0.05], [0.25, 0, 0]);
  k.add(L('metal', 0xc0c0c0), cone(0.03, 0.05, 6), [0, 0.02, -0.26], [-HP, 0, 0]);
  return done(k, root);
}
export const ITEM_MODELS = { decoyspeaker, doorjammer, scoutdrone, glowspray, ziplinekit };

// ================================================================================================== world props
const M = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const MB = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...o });

/** the flying drone other players see: body, 4 spinning rotors, lens, blinking LED. userData: { rotors, led, dispose } */
export function buildDroneMesh(scale = 1) {
  const g = new THREE.Group(), geos = [], mats = [];
  const part = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); geos.push(geo); g.add(m); return m; };
  const dark = M(0x2a2d33), white = M(0xe8e8e8), arm = M(0x8a9098), rotorM = MB(0x14161a, { transparent: true, opacity: 0.55 }), lens = MB(0x40e0ff), led = MB(0xff3030);
  mats.push(dark, white, arm, rotorM, lens, led);
  part(new THREE.BoxGeometry(0.34, 0.11, 0.42), dark);
  part(new THREE.BoxGeometry(0.35, 0.03, 0.16), white, 0, 0.07, -0.05);
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const a = part(new THREE.BoxGeometry(0.05, 0.04, 0.05), arm, sx * 0.27, 0.02, sz * 0.27);
    a.scale.set(1, 1, 1);
    rotors.push(part(new THREE.BoxGeometry(0.34, 0.012, 0.05), rotorM, sx * 0.27, 0.075, sz * 0.27));
  }
  part(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), MB(0x0a0a0e), 0, -0.01, 0.23).rotation.x = HP;
  part(new THREE.SphereGeometry(0.03, 6, 4), lens, 0, -0.01, 0.26);
  const l = part(new THREE.SphereGeometry(0.03, 6, 4), led, 0.09, 0.08, -0.17);
  g.scale.setScalar(scale);
  g.userData = { rotors, led: l, ledMat: led, dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); } };
  return g;
}

/** the jammer stuck on a door: chunky clamp + a pulsing LED. userData: { led, ledMat, dispose } */
export function buildJammerMesh() {
  const g = new THREE.Group(), geos = [], mats = [];
  const part = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); geos.push(geo); g.add(m); return m; };
  const body = M(0xb0a06a), dark = M(0x33363c), led = MB(0xff3a2a);
  mats.push(body, dark, led);
  part(new THREE.BoxGeometry(0.32, 0.2, 0.34), body);
  part(new THREE.BoxGeometry(0.36, 0.05, 0.12), dark, 0, 0.09, 0);
  part(new THREE.BoxGeometry(0.06, 0.22, 0.38), dark, 0.19, 0, 0);
  part(new THREE.BoxGeometry(0.06, 0.22, 0.38), dark, -0.19, 0, 0);
  const l = part(new THREE.SphereGeometry(0.035, 6, 4), led, 0, 0.13, 0.17);
  part(new THREE.SphereGeometry(0.035, 6, 4), led, 0, 0.13, -0.17);
  g.userData = { led: l, ledMat: led, dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); } };
  return g;
}

/** a deployed decoy speaker: box speaker on a tripod nub with a pulsing cone. userData: { cone, ledMat, dispose } */
export function buildSpeakerMesh() {
  const g = new THREE.Group(), geos = [], mats = [];
  const part = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); geos.push(geo); g.add(m); return m; };
  const dark = M(0x2c2f36), red = M(0xd9482f), coneM = MB(0x1a1a20), led = MB(0x40ffb0);
  mats.push(dark, red, coneM, led);
  part(new THREE.BoxGeometry(0.34, 0.46, 0.26), dark, 0, 0.25, 0);
  part(new THREE.BoxGeometry(0.35, 0.05, 0.27), red, 0, 0.5, 0);
  const cone = part(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10), coneM, 0, 0.2, 0.135); cone.rotation.x = HP;
  part(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8), coneM, 0, 0.38, 0.135).rotation.x = HP;
  part(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 4), M(0xc0c0c0), 0.12, 0.66, 0);
  part(new THREE.SphereGeometry(0.03, 6, 4), led, 0.12, 0.83, 0);
  g.userData = { cone, ledMat: led, dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); } };
  return g;
}

/** zipline start post: base plate + tall pole + rope clip + LED. Origin at the FLOOR under the rope end. */
export function buildZipPost(h = ZIP.postH) {
  const g = new THREE.Group(), geos = [], mats = [];
  const part = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); geos.push(geo); g.add(m); return m; };
  const steel = M(0x8a9098), dark = M(0x2b2f36), orange = MB(0xff8a30);
  mats.push(steel, dark, orange);
  part(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 8), dark, 0, 0.03, 0);
  part(new THREE.CylinderGeometry(0.035, 0.045, h, 6), steel, 0, h / 2, 0);
  part(new THREE.BoxGeometry(0.16, 0.08, 0.16), dark, 0, h, 0);
  part(new THREE.BoxGeometry(0.2, 0.03, 0.2), orange, 0, h + 0.06, 0);
  part(new THREE.BoxGeometry(0.03, 0.8, 0.03), orange, 0, 0.5, 0.06);
  g.userData = { dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); } };
  return g;
}
/** wall / ceiling bracket at the anchor end: plate + bolts + LED. Faces +Z; caller lookAt()s along the surface normal. */
export function buildZipBracket() {
  const g = new THREE.Group(), geos = [], mats = [];
  const part = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); geos.push(geo); g.add(m); return m; };
  const steel = M(0x8a9098), dark = M(0x2b2f36), orange = MB(0xff8a30);
  mats.push(steel, dark, orange);
  part(new THREE.BoxGeometry(0.34, 0.34, 0.05), dark, 0, 0, 0.025);
  part(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), steel, 0, 0, 0.11).rotation.x = HP;
  part(new THREE.BoxGeometry(0.1, 0.05, 0.05), orange, 0, 0.17, 0.05);
  g.userData = { dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); } };
  return g;
}
/** the rope: one thin box between two points + a glow stripe, unlit. */
export function buildZipRope(a, b) {
  const g = new THREE.Group(), geos = [], mats = [];
  const A = new THREE.Vector3(a.x, a.y, a.z), Bv = new THREE.Vector3(b.x, b.y, b.z), len = A.distanceTo(Bv);
  const geo = new THREE.BoxGeometry(0.03, 0.03, len), stripe = new THREE.BoxGeometry(0.036, 0.008, len);
  const m1 = MB(0x2a2018), m2 = MB(0xff8a30);
  geos.push(geo, stripe); mats.push(m1, m2);
  g.add(new THREE.Mesh(geo, m1)); const s = new THREE.Mesh(stripe, m2); s.position.y = 0.02; g.add(s);
  g.position.copy(A).lerp(Bv, 0.5); g.lookAt(Bv);
  g.userData = { stripe: m2, dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); } };
  return g;
}

/** floating ping marker (a spinning octahedron, drawn through walls). kind 'c' creature (red) / 'i' item (gold) */
export function buildPingMesh(kind) {
  const geo = new THREE.OctahedronGeometry(kind === 'c' ? 0.26 : 0.16, 0);
  const mat = new THREE.MeshBasicMaterial({ color: kind === 'c' ? 0xff3a3a : 0xffd23f, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false, fog: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 999; m.frustumCulled = false;
  m.userData.dispose = () => { geo.dispose(); mat.dispose(); };
  return m;
}

// ================================================================================================== glow trail (ONE instanced mesh, flat chevrons)
export function buildTrailMesh() {
  const geo = new THREE.BufferGeometry();
  // chevron lying on the floor, pointing +Z: two arms of a V
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.2, -0.16, 0, -0.14, 0, 0, 0.06,
    0, 0, 0.2, 0, 0, 0.06, 0.16, 0, -0.14,
  ], 3));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.InstancedMesh(geo, mat, TRAIL.max);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(TRAIL_COLORS[0]));
  mesh.userData.dispose = () => { geo.dispose(); mat.dispose(); mesh.dispose?.(); };
  return mesh;
}

// ================================================================================================== procedural sounds
export const SOUNDS = {
  g11_beep: (sr) => synth(sr, 0.09, (t) => sin(1900, t) * ex(t, 22)),
  g11_beep_end: (sr) => synth(sr, 0.9, (t) => {
    let s = 0;
    for (let i = 0; i < 4; i++) { const t0 = i * 0.2; if (t >= t0 && t < t0 + 0.16) s += (Math.sin(6.2832 * (i % 2 ? 1500 : 2100) * t) > 0 ? 1 : -1) * 0.7; }
    return s * 0.7 + nz() * 0.05;
  }),
  g11_jam: (sr) => synth(sr, 0.4, (t) => sin(80 * ex(t, 3) + 40, t) * ex(t, 9) + nz() * ex(t, 40) * 0.6 + sin(2400, t) * ex(t - 0.16, 40) * (t > 0.16 ? 1 : 0) * 0.4),
  g11_spray: (sr) => synth(sr, 0.7, (t) => nz() * 0.5 * Math.min(1, t * 30) * ex(t, 3.5) + sin(4200 + nz() * 200, t) * 0.05 * ex(t, 5)),
  g11_zipshot: (sr) => synth(sr, 0.6, (t) => sin(150 * ex(t, 5) + 50, t) * ex(t, 12) + nz() * ex(t, 9) * 0.35 + sin(900 - 500 * t, t) * ex(t, 6) * 0.35),
  g11_ziprun: (sr) => synth(sr, 0.4, (t) => (sin(310 + 40 * Math.sin(t * 22), t) * 0.3 + nz() * 0.25) * Math.min(1, t * 20) * Math.min(1, (0.4 - t) * 20)),
  g11_zipclick: (sr) => synth(sr, 0.15, (t) => nz() * ex(t, 60) * 0.7 + sin(700, t) * ex(t, 40) * 0.5),
  g11_drone_on: (sr) => synth(sr, 0.5, (t) => sin(220 + 900 * t * t / 0.5, t) * Math.min(1, t * 14) * ex(t, 2) + nz() * 0.05),
  g11_drone_off: (sr) => synth(sr, 0.45, (t) => sin(900 - 700 * t / 0.45, t) * ex(t, 3.5) + nz() * ex(t, 12) * 0.15),
  g11_drone_hum: (sr) => synth(sr, 0.5, (t) => (sin(190, t) + sin(196, t) * 0.8) * (0.6 + 0.4 * sin(58, t)) * 0.4 * Math.min(1, t * 25) * Math.min(1, (0.5 - t) * 25) + nz() * 0.03),
  g11_scan: (sr) => synth(sr, 0.9, (t) => sin(1250 + 180 * ex(t, 6), t) * ex(t, 7) * 0.8 + (t > 0.22 ? sin(1250, t) * ex(t - 0.22, 9) * 0.35 : 0)),
  g11_static: (sr) => synth(sr, 0.55, (t) => nz() * ex(t, 4) * (Math.sin(t * 190) > -0.3 ? 1 : 0.2) + sin(120, t) * ex(t, 6) * 0.4),
  g11_speaker_on: (sr) => synth(sr, 0.35, (t) => sin(500 + 1200 * t, t) * ex(t, 7) * 0.6 + nz() * ex(t, 30) * 0.3),
};
