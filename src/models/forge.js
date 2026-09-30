// Procedural models for the HQ FORGE: THE MONETIZER (enhancement machine), the Ascension Altar, the Shard Exchange kiosk,
// plus small item models for the six shards and the Backup Drive. Plain three.js meshes (Lambert bodies, Basic "emissive"
// parts) - no lights are ever added; glow is emissive / additive only. game/forge.js animates the userData handles.
import * as THREE from 'three';
import { SHARD_DEFS } from '../game/enhance.js';
import { createArtModel, createShardModel } from './artpass.js';   // [artpass]

const L = (c) => new THREE.MeshLambertMaterial({ color: c });
const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (rt, rb, h, mat, seg = 10, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; };

/** Canvas screen: draw(rows, t) with rows = [{ text, color?, big? }]. */
export function makeScreen(title = 'THE MONETIZER', w = 256, h = 128, accent = '#ff8a3d') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (rows = [], t = 0, flash = 0) => {
    const x = c.getContext('2d');
    x.fillStyle = flash > 0 ? `rgb(${Math.round(40 + flash * 120)},${Math.round(20 + flash * 40)},6)` : '#080502';
    x.fillRect(0, 0, w, h);
    x.textAlign = 'center'; x.fillStyle = accent; x.font = 'bold 20px monospace'; x.fillText(title, w / 2, 24);
    x.fillStyle = accent; x.globalAlpha = 0.5; x.fillRect(12, 32, w - 24, 2); x.globalAlpha = 1;
    x.textAlign = 'left';
    rows.slice(0, 5).forEach((r, i) => { x.font = (r.big ? 'bold 22px' : '15px') + ' monospace'; x.fillStyle = r.color || '#ffb070'; x.fillText(String(r.text).slice(0, 24), 14, 56 + i * 20); });
    x.fillStyle = 'rgba(255,138,61,.45)'; x.fillRect(0, (t * 46) % h, w, 2);
    tex.needsUpdate = true;
  };
  draw();
  return { tex, draw, canvas: c };
}

function signTexture(text, color = '#ff8a3d') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = '#100804'; x.fillRect(0, 0, 256, 48);
  x.fillStyle = color; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 26);
  x.strokeStyle = color; x.globalAlpha = 0.7; x.strokeRect(3, 3, 250, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** THE MONETIZER. Front faces +z. userData: body (shaken), screen, lamps[], cradle (local Vector3), glow (cradle strip material). */
export function createMonetizer() {
  const root = new THREE.Group(); root.name = 'monetizer';
  const body = new THREE.Group(); root.add(body);
  const dark = L(0x23262b), metal = L(0x3a3d44), trim = L(0xc8581c), hazard = L(0xd8b020);
  body.add(box(2.5, 0.3, 1.6, metal, 0, 0.15, 0));
  body.add(box(2.2, 2.3, 1.3, dark, 0, 1.45, 0));
  body.add(box(2.28, 0.1, 1.38, hazard, 0, 0.36, 0));
  body.add(box(2.28, 0.12, 1.38, trim, 0, 2.62, 0));
  // sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.38), B(0xffffff, { map: signTexture('THE MONETIZER') }));
  sign.position.set(0, 2.92, 0.5); body.add(box(2.2, 0.5, 0.5, metal, 0, 2.92, 0), sign);
  // screen
  const scr = makeScreen('THE MONETIZER');
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), B(0xffffff, { map: scr.tex }));
  screen.position.set(0, 2.1, 0.661); body.add(box(1.5, 0.85, 0.08, metal, 0, 2.1, 0.62), screen);
  // weapon cradle: dark window with a glowing slot and a pedestal
  body.add(box(1.5, 0.75, 0.06, L(0x0a0c10), 0, 1.15, 0.66));
  const glowMat = B(0xff8a3d);
  const slot = box(1.3, 0.07, 0.07, glowMat, 0, 1.58, 0.69); body.add(slot);
  body.add(box(0.7, 0.05, 0.4, metal, 0, 0.86, 0.85));
  for (const sx of [-1, 1]) body.add(box(0.05, 0.16, 0.05, glowMat, 0.28 * sx, 0.96, 0.9));
  // lamps, button, hopper, pipes
  const lamps = [];
  for (let i = 0; i < 5; i++) { const m = B(0x552200); const s = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), m); s.position.set(-0.8 + i * 0.4, 2.47, 0.68); body.add(s); lamps.push(m); }
  const btn = cyl(0.13, 0.13, 0.08, B(0xff2a1a), 10, 0.85, 0.7, 0.7); btn.rotation.x = Math.PI / 2; body.add(btn);
  body.add(box(0.5, 0.35, 0.35, metal, -0.85, 0.7, 0.8));
  for (const sx of [-1.15, 1.15]) body.add(cyl(0.07, 0.07, 2.2, L(0x666a70), 8, sx, 1.45, -0.3));
  body.add(box(0.5, 0.4, 0.02, L(0x140a04), 0.85, 1.15, 0.7));
  root.userData = { body, screen: scr, lamps, glow: glowMat, cradle: new THREE.Vector3(0, 1.05, 0.95), lampBase: 0x552200 };
  root.userData.colliders = [[0, 1.3, 0, 1.25, 1.3, 0.8]];
  return root;
}

/** Ascension Altar: dais, glowing ring, pedestal and six floating shards (crystals[]) that spin and flare on ascension. */
export function createAltar() {
  const root = new THREE.Group(); root.name = 'altar';
  const stone = L(0x2c2a34), dark = L(0x18161e);
  root.add(cyl(1.3, 1.45, 0.28, stone, 10, 0, 0.14, 0));
  root.add(cyl(0.95, 1.05, 0.14, dark, 10, 0, 0.35, 0));
  const ringMat = B(0xb35cff, { transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 5, 24), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.45; root.add(ring);
  root.add(cyl(0.22, 0.32, 0.95, stone, 8, 0, 0.9, 0));
  root.add(cyl(0.36, 0.3, 0.1, dark, 8, 0, 1.4, 0));
  const crystals = [];
  SHARD_DEFS.forEach((s, i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.13 + (i % 2) * 0.03, 0), B(new THREE.Color(s.color)));
    m.userData.phase = i * (Math.PI / 3);
    root.add(m); crystals.push(m);
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), B(0xffffff, { transparent: true, opacity: 0.9 }));
  core.position.y = 1.75; root.add(core);
  // obelisk backdrop with a tier rune strip
  root.add(box(0.5, 2.6, 0.25, dark, 0, 1.3, -1.2));
  for (let i = 0; i < 6; i++) root.add(box(0.12, 0.12, 0.03, B(new THREE.Color(SHARD_DEFS[i].color)), 0, 0.6 + i * 0.32, -1.06));
  root.userData = { crystals, core, ring, ringMat, center: new THREE.Vector3(0, 1.55, 0), colliders: [[0, 0.7, 0, 1.2, 0.7, 1.2]] };
  return root;
}

/** Shard Exchange kiosk: screen, six tier tubes, output chute. */
export function createExchange() {
  const root = new THREE.Group(); root.name = 'shardexchange';
  const dark = L(0x22262b), metal = L(0x3a3d44), trim = L(0x2a8f6a);
  root.add(box(1.3, 0.25, 0.9, metal, 0, 0.125, 0));
  root.add(box(1.15, 1.95, 0.7, dark, 0, 1.15, 0));
  root.add(box(1.2, 0.1, 0.75, trim, 0, 2.17, 0));
  const scr = makeScreen('SHARD EXCHANGE', 256, 128, '#4ecbb0');
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.47), B(0xffffff, { map: scr.tex }));
  screen.position.set(0, 1.85, 0.361); root.add(screen);
  const tubes = [];
  SHARD_DEFS.forEach((s, i) => {
    const m = B(new THREE.Color(s.color)); const t = box(0.11, 0.5, 0.05, m, -0.46 + i * 0.184, 1.2, 0.37); root.add(t); tubes.push(m);
  });
  root.add(box(0.7, 0.28, 0.2, L(0x0a0c10), 0, 0.62, 0.4));
  root.add(box(0.75, 0.05, 0.3, metal, 0, 0.46, 0.45));
  root.userData = { screen: scr, tubes, out: new THREE.Vector3(0, 0.62, 0.62), colliders: [[0, 1.1, 0, 0.65, 1.1, 0.45]] };
  return root;
}

// ------------------------------------------------------------------------------------------------ item models
const glowBasic = (c) => B(new THREE.Color(c));
/** Small pickup models: shards (one per tier) and the Backup Drive. */
export function createForgeItemModel(id) {
  const def = SHARD_DEFS.find((s) => s.id === id);
  return def ? createShardModel(def.key, def.color) : createArtModel('forge_backup');
}
export const FORGE_ITEM_IDS = [...SHARD_DEFS.map((s) => s.id), 'forge_backup'];
