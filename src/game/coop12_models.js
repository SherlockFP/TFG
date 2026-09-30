// COOP 12 models (wave 12): the four GIANT loot props, the heavy-door lever panel and the BUDDY tag. Lambert bodies + MeshBasic (fog:false) tells:
// every giant carries one glowing part that survives darkness and the PSX pass (LED columns, CRT screen, price strip, halo). No lights.
import * as THREE from 'three';

const L = (c, extra) => new THREE.MeshLambertMaterial({ color: c, ...(extra || {}) });
const B = (c) => new THREE.MeshBasicMaterial({ color: c, fog: false });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function part(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
const HP = Math.PI / 2;

/** Tier-4 rack: a tall black slab, two rows of LED columns (green / blue / amber), carry bars on both sides, hazard band */
function rackModel() {
  const g = new THREE.Group();
  const fr = L(0x2a2d34), pn = L(0x15161a), bz = L(0x353941);
  part(g, box(0.66, 1.3, 0.72), pn, 0, 0.65, 0);
  for (const x of [-0.32, 0.32]) for (const z of [-0.35, 0.35]) part(g, box(0.05, 1.32, 0.05), fr, x, 0.66, z);
  part(g, box(0.7, 0.06, 0.76), fr, 0, 1.31, 0); part(g, box(0.7, 0.08, 0.76), fr, 0, 0.04, 0);
  const led = [B(0x59e88a), B(0x4aa8ff), B(0xffb640)];
  for (let i = 0; i < 9; i++) {
    const y = 0.16 + i * 0.13;
    part(g, box(0.58, 0.1, 0.03), bz, 0, y, 0.365);
    for (let v = 0; v < 4; v++) part(g, box(0.07, 0.05, 0.01), pn, -0.2 + v * 0.075, y, 0.384);
    part(g, box(0.035, 0.035, 0.012), led[i % 3], 0.17, y + 0.02, 0.386); part(g, box(0.035, 0.035, 0.012), led[(i + 1) % 3], 0.23, y + 0.02, 0.386);
  }
  for (const s of [-1, 1]) {   // carry bars (the "lift here" silhouette)
    part(g, box(0.05, 0.05, 0.4), L(0xd8b820), s * 0.4, 0.75, 0);
    part(g, box(0.05, 0.14, 0.05), fr, s * 0.37, 0.75, 0.17); part(g, box(0.05, 0.14, 0.05), fr, s * 0.37, 0.75, -0.17);
  }
  part(g, box(0.5, 0.04, 0.01), B(0xffb640), 0, 1.25, 0.372);   // top light bar
  return g;
}

/** arcade cabinet: purple body with the classic slanted profile, glowing screen + marquee, joystick, red buttons */
function arcadeModel() {
  const g = new THREE.Group();
  const body = L(0x3a1f66), dk = L(0x14101f), trim = L(0x6a3aa8);
  part(g, box(0.72, 0.62, 0.78), body, 0, 0.31, 0.02);                 // base
  part(g, box(0.72, 0.62, 0.5), body, 0, 0.93, -0.13);                 // upper back
  part(g, box(0.72, 0.16, 0.5), body, 0, 1.3, -0.13);                  // marquee housing
  part(g, box(0.74, 0.05, 0.8), dk, 0, 0.03, 0.02);
  part(g, box(0.7, 0.3, 0.02), B(0xff3ab0), 0, 1.3, 0.12);            // marquee (emissive tell)
  part(g, box(0.5, 0.05, 0.01), B(0xffe27a), 0, 1.3, 0.125);
  part(g, box(0.5, 0.42, 0.02), B(0x66ffcc), 0, 0.98, 0.135, -0.18, 0, 0);   // CRT screen, tilted back
  part(g, box(0.56, 0.5, 0.04), dk, 0, 0.98, 0.12, -0.18, 0, 0);
  part(g, box(0.72, 0.08, 0.34), trim, 0, 0.66, 0.27, 0.22, 0, 0);    // control panel
  part(g, box(0.03, 0.14, 0.03), L(0xdddddd), -0.14, 0.76, 0.3); part(g, new THREE.SphereGeometry(0.045, 6, 5), B(0xff2a2a), -0.14, 0.85, 0.3);   // stick + ball
  for (let i = 0; i < 3; i++) part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8), B(i === 1 ? 0xffe23a : 0xff5a2a), 0.05 + i * 0.09, 0.72, 0.31, 0.22, 0, 0);
  for (const s of [-1, 1]) part(g, box(0.02, 1.2, 0.5), B(0x00e5ff), s * 0.365, 0.8, -0.12);   // side-art neon stripes
  part(g, box(0.4, 0.04, 0.02), dk, 0, 0.3, 0.41);                     // coin door
  part(g, box(0.05, 0.05, 0.01), B(0xffe23a), 0, 0.3, 0.425);
  return g;
}

/** double-wide vending machine: blue body, two lit glass fronts with product rows, amber SNAX strip, dispensing tray */
function vendingModel() {
  const g = new THREE.Group();
  const body = L(0x1c5aa8), dk = L(0x101418), st = L(0x8a8f98);
  part(g, box(1.02, 1.22, 0.56), body, 0, 0.61, 0);
  part(g, box(1.06, 0.14, 0.6), dk, 0, 1.24, 0); part(g, box(1.06, 0.07, 0.6), dk, 0, 0.035, 0);
  part(g, box(0.86, 0.09, 0.02), B(0xffb640), 0, 1.24, 0.31);        // SNAX strip (emissive tell)
  const prod = [B(0xe4c020), B(0x3a8ad0), B(0xe8e4dc), B(0xd04a3a)];
  for (const cx of [-0.26, 0.26]) {
    part(g, box(0.44, 0.9, 0.02), dk, cx, 0.7, 0.28);
    for (let r = 0; r < 5; r++) {
      const y = 0.36 + r * 0.16;
      part(g, box(0.4, 0.012, 0.05), st, cx, y - 0.05, 0.3);
      for (let i = 0; i < 4; i++) part(g, box(0.06, 0.09, 0.03), prod[(i + r) % 4], cx - 0.14 + i * 0.09, y, 0.3);
    }
  }
  part(g, box(0.1, 0.5, 0.02), L(0x2b2f36), 0.46, 0.75, 0.285);       // keypad column
  part(g, box(0.05, 0.05, 0.01), B(0xff3020), 0.46, 0.55, 0.3);       // coin-return lamp
  part(g, box(0.5, 0.14, 0.04), dk, 0, 0.17, 0.29);                    // tray
  for (const s of [-1, 1]) part(g, box(0.05, 0.05, 0.36), L(0xd8b820), s * 0.53, 0.8, 0);   // carry bars
  return g;
}

/** The Golden Like: a gold thumbs-up on a dark plinth with an emissive halo ring behind it */
function likeModel() {
  const g = new THREE.Group();
  const gold = L(0xffc02a, { emissive: 0x3a2400 }), plinth = L(0x1a1a20), band = L(0xb07a10);
  part(g, box(0.7, 0.16, 0.5), plinth, 0, 0.08, 0);
  part(g, box(0.62, 0.05, 0.42), band, 0, 0.185, 0);
  part(g, box(0.34, 0.36, 0.24), gold, -0.05, 0.4, 0);                  // cuff
  part(g, box(0.36, 0.4, 0.26), gold, 0.2, 0.55, 0);                    // fist
  part(g, box(0.12, 0.36, 0.2), gold, 0.32, 0.9, 0, 0, 0, -0.18);       // thumb
  part(g, box(0.15, 0.1, 0.2), gold, 0.33, 1.1, 0, 0, 0, -0.18);       // thumb tip
  for (let i = 0; i < 4; i++) part(g, box(0.05, 0.08, 0.27), L(0xe0a020), 0.38, 0.4 + i * 0.09, 0);   // finger grooves
  const halo = part(g, new THREE.TorusGeometry(0.58, 0.022, 5, 20), B(0xffe27a), 0.12, 0.72, -0.16);   // halo (tell)
  halo.userData.halo = true;
  for (const [x, y] of [[-0.3, 1.0], [0.6, 1.15], [0.55, 0.3]]) part(g, box(0.05, 0.05, 0.01), B(0xffffff), x, y, 0.16, 0, 0, Math.PI / 4);   // glints
  return g;
}

export const GIANT_MODELS = { cg_rack: rackModel, cg_arcade: arcadeModel, cg_vending: vendingModel, cg_like: likeModel };

/** lever panel for a heavy door: dark plate + a big lamp (colour set by the module: red closed / green held / amber-red flashing warning) */
export function makeLever() {
  const g = new THREE.Group();
  const plate = part(g, box(0.34, 0.5, 0.08), L(0x1c1d22), 0, 0, 0);
  part(g, box(0.3, 0.06, 0.09), new THREE.MeshBasicMaterial({ color: 0xffc21a, fog: false }), 0, -0.2, 0);   // hazard bar
  const arm = part(g, box(0.05, 0.22, 0.05), L(0x8a8f98), 0, 0.02, 0.07);
  part(g, new THREE.SphereGeometry(0.05, 6, 5), L(0xc02020), 0, 0.14, 0.07);   // grip knob
  const lamp = part(g, box(0.16, 0.1, 0.03), B(0xff3a2a), 0, 0.19, 0.045);
  g.userData = { lamp, arm, plate };
  return g;
}

/** the "BUDDY" tag over your buddy's head: two linked rings + the word, drawn once on a canvas */
export function makeBuddySprite() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 128; c.height = 40;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = 'rgba(12,12,8,.78)'; x.fillRect(0, 0, 128, 40);
  x.strokeStyle = '#ffcf4a'; x.lineWidth = 2; x.strokeRect(1, 1, 126, 38);
  x.lineWidth = 3; x.beginPath(); x.arc(20, 20, 8, 0, 7); x.stroke(); x.beginPath(); x.arc(31, 20, 8, 0, 7); x.stroke();
  x.fillStyle = '#ffe9a8'; x.font = '700 20px Arial Narrow, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('BUDDY', 47, 21);
  const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  sp.scale.set(0.8, 0.25, 1); sp.renderOrder = 999; sp.visible = false;
  return sp;
}
