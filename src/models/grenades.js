// TFG wave 2 - GRENADES: procedural models. GRENADE_MODELS are the inventory / in-hand item models (same conventions as
// combat_wave2.js: meters, +Y up), createBallMesh(kind) is the cheap unlit projectile that flies, sticks and beeps.
import * as THREE from 'three';
import { ModelKit } from './items.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const { Kit, G } = ModelKit;
const HP = Math.PI / 2;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const { box, cyl, cone, sph, tor } = G;

function done(k, root) {
  k.into(root);
  root.userData.kind = 'consumable';
  return root;
}
const lever = (k, y = 0.035) => k.add(L('metal', 0xc0c0c0), box(0.012, 0.07, 0.005), [0, y, 0.034], [-0.15, 0, 0]);
const pin = (k, y = 0.07) => k.add(L('metal', 0xd8d8d8), tor(0.012, 0.0022, 3, 8), [0.024, y, 0], [0, HP, 0]);

function flashbang() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal', 0xb8bec6), cyl(0.03, 0.03, 0.11, 10));
  k.add(L('paint', 0xf2f2f2), cyl(0.0315, 0.0315, 0.02, 10), [0, 0.02, 0]);
  k.add(L('paint', 0x1c1c22), cyl(0.026, 0.03, 0.016, 10), [0, -0.055, 0]);
  k.add(L('metal', 0x8a9098), cyl(0.014, 0.018, 0.024, 8), [0, 0.065, 0]);
  lever(k); pin(k);
  return done(k, root);
}
function smokegrenade() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('paint', 0x55684a), cyl(0.032, 0.032, 0.13, 10));
  k.add(L('paint', 0xd8c23a), cyl(0.0335, 0.0335, 0.014, 10), [0, 0.03, 0]);
  k.add(L('paint', 0x8a949a), cyl(0.03, 0.033, 0.02, 10), [0, 0.075, 0]);
  for (let i = 0; i < 4; i++) k.add(L('metal_dark', 0x2a2e32), box(0.012, 0.012, 0.012), [Math.cos(i * HP) * 0.028, -0.06, Math.sin(i * HP) * 0.028]);
  k.add(L('metal', 0x8a9098), cyl(0.012, 0.016, 0.022, 8), [0, 0.096, 0]);
  lever(k, 0.05); pin(k, 0.098);
  return done(k, root);
}
function decoybeacon() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('plastic', 0x1c6e66), box(0.07, 0.085, 0.05));
  k.add(L('plastic', 0x0e2a2a), box(0.072, 0.02, 0.052), [0, -0.04, 0]);
  k.add(L('metal', 0xc0c0c0), cyl(0.003, 0.003, 0.09, 4), [0.022, 0.085, 0]);
  k.add(B(null, 0x40ffe0), sph(0.008, 6, 4), [0.022, 0.13, 0]);
  k.add(B(null, 0xff3a2a), sph(0.007, 5, 4), [-0.02, 0.05, 0.026]);
  k.add(B(null, 0x40ffe0), box(0.03, 0.01, 0.004), [0.005, 0.0, 0.026]);
  return done(k, root);
}
function stickycharge() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('paint', 0x8a6a3a), box(0.1, 0.05, 0.06));
  k.add(L('rubber', 0xe8701c), box(0.102, 0.008, 0.062), [0, -0.028, 0]);
  k.add(L('metal_dark', 0x2a2e32), box(0.03, 0.02, 0.03), [0.02, 0.035, 0]);
  k.add(B(null, 0xff2a20), sph(0.008, 6, 4), [-0.03, 0.03, 0.031]);
  k.add(L('paint', 0xf0d040), box(0.014, 0.06, 0.004), [-0.02, 0.0, 0.031]);
  k.add(L('paint', 0x2a6ee8), box(0.006, 0.05, 0.005), [0.0, 0.0, 0.031], [0, 0, 0.4]);
  return done(k, root);
}
function bombGravity() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal_dark', 0x3a2a66), sph(0.05, 10, 8));
  k.add(B(null, 0xa06cff), tor(0.062, 0.006, 5, 16), [0, 0, 0], [HP, 0, 0]);
  k.add(B(null, 0x66e0ff), tor(0.056, 0.004, 4, 14), [0, 0, 0], [0.5, 0, 0.9]);
  k.add(B(null, 0xffffff), sph(0.012, 6, 4));
  return done(k, root);
}
function bombBlackout() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('rubber', 0x121216), sph(0.052, 10, 8));
  k.add(L('gold', 0xe8c020), tor(0.052, 0.008, 4, 14), [0, 0, 0], [HP, 0, 0]);
  k.add(L('metal', 0x8a9098), cyl(0.012, 0.016, 0.02, 8), [0, 0.056, 0]);
  k.add(B(null, 0xffc040), sph(0.007, 5, 4), [0, 0.072, 0]);
  return done(k, root);
}
function bombConfetti() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('paint', 0xff5ac8), cone(0.04, 0.12, 10), [0, -0.01, 0]);
  k.add(L('paint', 0xffe040), tor(0.028, 0.004, 3, 10), [0, 0.0, 0], [HP, 0, 0]);
  k.add(L('paint', 0x40e0ff), tor(0.019, 0.004, 3, 10), [0, 0.03, 0], [HP, 0, 0]);
  k.add(L('paint', 0xf2f2f2), cyl(0.008, 0.008, 0.02, 6), [0, 0.06, 0]);
  const cols = [0xff5a5a, 0x5aff8a, 0x5a8aff, 0xffe040];
  for (let i = 0; i < 6; i++) k.add(B(null, cols[i % 4]), box(0.012, 0.004, 0.02), [Math.cos(i) * 0.03, 0.075 + (i % 3) * 0.012, Math.sin(i) * 0.03], [i, i * 0.7, 0]);
  return done(k, root);
}
function bombGlitch() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('metal_dark', 0x1a1a22), box(0.07, 0.07, 0.07), [0, 0, 0], [0.4, 0.6, 0.2]);
  k.add(B(null, 0x00ffd0), box(0.074, 0.02, 0.074), [0, 0.012, 0], [0.4, 0.6, 0.2]);
  k.add(B(null, 0xff2bd6), box(0.074, 0.014, 0.074), [0, -0.018, 0], [0.4, 0.6, 0.2]);
  k.add(B(null, 0xffffff), box(0.02, 0.02, 0.02), [0.05, 0.05, 0.0], [0.2, 0.2, 0.2]);
  return done(k, root);
}
function bombCluster() {
  const k = new Kit(), root = new THREE.Group();
  k.add(L('paint', 0x6a2a20), sph(0.05, 10, 8));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add(L('paint', 0xd0402a), sph(0.022, 6, 5), [Math.cos(a) * 0.055, 0.0, Math.sin(a) * 0.055]);
    k.add(B(null, 0xffc040), sph(0.006, 4, 3), [Math.cos(a) * 0.072, 0.012, Math.sin(a) * 0.072]);
  }
  k.add(L('metal', 0x8a9098), cyl(0.012, 0.016, 0.02, 8), [0, 0.056, 0]);
  return done(k, root);
}

export const GRENADE_MODELS = {
  flashbang, smokegrenade, decoybeacon, stickycharge,
  bomb_gravity: bombGravity, bomb_blackout: bombBlackout, bomb_confetti: bombConfetti, bomb_glitch: bombGlitch, bomb_cluster: bombCluster,
};

// ------------------------------------------------------------------------------------------------ flying / stuck ball
// Unlit and cheap. userData.led blinks with the fuse beeps, userData.dispose frees the geometry.
export function createBallMesh(kind, color = 0x888888) {
  const g = new THREE.Group();
  const geos = [], mats = [];
  const part = (geo, col, o = {}) => {
    const m = new THREE.MeshBasicMaterial({ color: col, ...o });
    const me = new THREE.Mesh(geo, m);
    geos.push(geo); mats.push(m); g.add(me);
    return me;
  };
  let ledY = 0.09;
  switch (kind) {
    case 'flash': case 'stun':
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.15, 8), kind === 'flash' ? 0xc4cad2 : 0x4a5a44);
      part(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 8), kind === 'flash' ? 0xffffff : 0xe8c020).position.y = 0.03;
      break;
    case 'smoke':
      part(new THREE.CylinderGeometry(0.046, 0.046, 0.17, 8), 0x55684a);
      part(new THREE.CylinderGeometry(0.048, 0.048, 0.03, 8), 0xd8c23a).position.y = 0.04;
      ledY = 0.11; break;
    case 'decoy':
      part(new THREE.BoxGeometry(0.1, 0.12, 0.07), 0x1c6e66);
      part(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), 0xc0c0c0).position.set(0.03, 0.12, 0);
      ledY = 0.07; break;
    case 'sticky':
      part(new THREE.BoxGeometry(0.14, 0.07, 0.085), 0x8a6a3a);
      part(new THREE.BoxGeometry(0.142, 0.012, 0.087), 0xe8701c).position.y = -0.04;
      ledY = 0.05; break;
    case 'cryo':
      part(new THREE.SphereGeometry(0.06, 8, 6), 0x80c8e8);
      part(new THREE.TorusGeometry(0.06, 0.01, 4, 10), 0xffffff).rotation.x = HP;
      break;
    case 'molotov':
      part(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), 0x3a7a3a);
      part(new THREE.CylinderGeometry(0.014, 0.02, 0.06, 6), 0x3a7a3a).position.y = 0.1;
      part(new THREE.BoxGeometry(0.03, 0.05, 0.01), 0xe8d8b0).position.set(0, 0.14, 0);
      ledY = 0.16; break;
    case 'emp':
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), 0x2a5a8a);
      part(new THREE.TorusGeometry(0.05, 0.01, 4, 10), 0x50c8ff).rotation.x = HP;
      break;
    case 'gravity':
      part(new THREE.SphereGeometry(0.07, 8, 6), 0x3a2a66);
      part(new THREE.TorusGeometry(0.085, 0.01, 4, 14), 0xa06cff).rotation.x = HP;
      break;
    case 'blackout':
      part(new THREE.SphereGeometry(0.07, 8, 6), 0x121216);
      part(new THREE.TorusGeometry(0.07, 0.012, 4, 14), 0xe8c020).rotation.x = HP;
      break;
    case 'confetti':
      part(new THREE.ConeGeometry(0.06, 0.16, 8), 0xff5ac8);
      part(new THREE.TorusGeometry(0.04, 0.008, 3, 10), 0xffe040).rotation.x = HP;
      break;
    case 'glitch':
      part(new THREE.BoxGeometry(0.1, 0.1, 0.1), 0x1a1a22).rotation.set(0.4, 0.6, 0.2);
      part(new THREE.BoxGeometry(0.104, 0.03, 0.104), 0x00ffd0).rotation.set(0.4, 0.6, 0.2);
      break;
    case 'cluster':
      part(new THREE.SphereGeometry(0.075, 8, 6), 0x6a2a20);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(new THREE.SphereGeometry(0.03, 5, 4), 0xd0402a).position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08); }
      break;
    case 'mini':
      part(new THREE.SphereGeometry(0.045, 6, 5), 0xd0402a);
      ledY = 0.055; break;
    default:
      part(new THREE.SphereGeometry(0.06, 8, 6), color);
  }
  const led = part(new THREE.SphereGeometry(0.02, 6, 4), 0xff3020);
  led.position.y = ledY;
  g.userData.led = led;
  g.userData.dispose = () => { for (const geo of geos) geo.dispose(); for (const m of mats) m.dispose(); };
  return g;
}
