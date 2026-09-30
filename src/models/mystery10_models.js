// THE FIRST UPLOAD (wave 10, module 'mystery10') - procedural models. Never a THREE light: everything that glows is a self-lit material.
//   createFragmentModel()  the pickup: a 3.5" floppy floating over a faint cyan light shaft (readable from far away, unlike amber loot)
//   createRoomModel()      "the room that should not exist": one yellow-wallpaper cell on an outdoor field, a school desk, a CRT playing 14 s of a cat
//   MYST_HATS              the wardrobe hat builder(s) merged by cosm5_models.js (First Guest Party Hat)
// Node-safe: no DOM access at import time (canvases are created lazily and skipped when there is no document).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, xf, lam, mk, TAU } from './modelkit.js';

const LAM = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
/** part(geometry, hex, [x,y,z], [rx,ry,rz], [sx,sy,sz]) -> non-indexed coloured geometry */
const part = (g, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
  const gg = g.index ? g.toNonIndexed() : g.clone();
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  gg.applyMatrix4(_m.compose(new THREE.Vector3(p[0], p[1], p[2]), _q, new THREE.Vector3(s[0], s[1], s[2])));
  gg.deleteAttribute('uv');
  _c.set(color);
  const n = gg.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return gg;
};
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CY = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
const merge = (parts) => { if (!parts.length) return null; const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); return g; };
const hasDom = () => typeof document !== 'undefined';

// ------------------------------------------------------------------ shared glow texture (one canvas for every pickup)
let glowTex = null;
function glowTexture() {
  if (glowTex || !hasDom()) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(150,225,255,0.85)'); r.addColorStop(0.35, 'rgba(90,170,255,0.28)'); r.addColorStop(1, 'rgba(60,120,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// ================================================================================================================= the pickup
/** -> { root, anchor (world offset for the prompt), tick(dt, time, ctx {cam}), dispose() } */
export function createFragmentModel() {
  const root = new THREE.Group(); root.name = 'myst_fragment';
  const disk = new THREE.Group(); disk.position.y = 0.42; root.add(disk);
  const lit = merge([
    part(B(0.16, 0.16, 0.014), '#1d2a55'),                                // shell
    part(B(0.09, 0.055, 0.016), '#a9b3c2', [0.01, 0.055, 0]),             // metal shutter
    part(B(0.012, 0.03, 0.018), '#4a5468', [0.03, 0.055, 0]),
    part(B(0.11, 0.075, 0.016), '#0f1730', [0, -0.045, 0]),               // lower shell shade
  ]);
  const glow = merge([
    part(B(0.11, 0.06, 0.018), '#d9f3ff', [0, -0.04, 0]),                 // label
    part(B(0.11, 0.008, 0.019), '#ff5a48', [0, -0.03, 0]),                // label stripe
    part(B(0.02, 0.02, 0.018), '#7fe3ff', [-0.06, 0.065, 0]),             // write-protect notch, lit
  ]);
  const body = new THREE.Mesh(lit, LAM), face = new THREE.Mesh(glow, GLOW);
  disk.add(body, face);
  // the shaft + the halo: additive, tiny, cyan (loot is amber, this is not loot)
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0x66c8ff, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.26, 2.1, 10, 1, true), shaftMat); shaft.position.y = 1.05; root.add(shaft);
  let halo = null, haloMat = null;
  const tex = glowTexture();
  if (tex) {
    haloMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    halo = new THREE.Sprite(haloMat); halo.scale.set(0.85, 0.85, 1); halo.position.y = 0.42; root.add(halo);
  }
  let gl = 0, glUntil = 0;
  return {
    root, anchor: 0.45,
    tick(dt, time) {
      disk.rotation.y = time * 0.9;
      disk.rotation.z = Math.sin(time * 0.7) * 0.18;
      disk.position.y = 0.42 + Math.sin(time * 1.6) * 0.05;
      if (halo) halo.position.y = disk.position.y;
      // rare corruption glitch: the disk jumps sideways for a few frames and the shaft stutters
      if (time > gl) { glUntil = time + 0.09; gl = time + 3 + ((Math.sin(time * 12.9898) * 43758.5453) % 1 + 1) % 1 * 5; }
      const g = time < glUntil;
      disk.position.x = g ? Math.sin(time * 90) * 0.04 : 0;
      shaftMat.opacity = g ? 0.02 : 0.1 + Math.sin(time * 2.3) * 0.025;
      if (haloMat) haloMat.opacity = g ? 0.35 : 0.75 + Math.sin(time * 3.1) * 0.15;
    },
    dispose() { lit?.dispose(); glow?.dispose(); shaft.geometry.dispose(); shaftMat.dispose(); haloMat?.dispose(); },
  };
}

// ================================================================================================================= the room

/** the 14 seconds: a kitchen, a cake with a lit candle, a cat. u = seconds into the loop. Draws on a 64x48 2D context. */
export function drawCatFrame(cg, t) {
    const u = t % 14;
    cg.fillStyle = '#26382e'; cg.fillRect(0, 0, 64, 48);                                       // kitchen wall
    cg.fillStyle = '#4b6b58'; cg.fillRect(0, 0, 64, 6);
    cg.fillStyle = '#8a6a44'; cg.fillRect(0, 34, 64, 14);                                      // table
    cg.fillStyle = '#e9e2cf'; cg.fillRect(4, 26, 12, 8); cg.fillStyle = '#ff9ec2'; cg.fillRect(4, 26, 12, 3);   // cake
    cg.fillStyle = '#fff2b0'; cg.fillRect(9 + (u | 0) % 2, 22, 1, 4);
    const cx = 34 + Math.sin(u * 0.9) * 2, look = u > 12.2;                                     // the cat
    cg.fillStyle = '#d9a25b'; cg.fillRect(cx - 7, 20, 14, 14); cg.fillRect(cx - 7, 15, 3, 5); cg.fillRect(cx + 4, 15, 3, 5); cg.fillRect(cx - 6, 17, 12, 5);
    cg.fillStyle = '#1a1a1a';
    if (look && u > 13.1 && u < 13.8) { cg.fillRect(cx - 4, 20, 3, 1); cg.fillRect(cx + 1, 20, 3, 1); }   // the slow blink
    else { cg.fillRect(cx - 4, 19, 2, 2); cg.fillRect(cx + 2, 19, 2, 2); }
    cg.fillStyle = '#b6803f'; cg.fillRect(cx + 6, 27, 6, 2 + ((u * 3) | 0) % 2);              // the tail: the thing
    cg.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < 48; y += 2) cg.fillRect(0, y, 64, 1);
    cg.fillStyle = '#9fe8ff'; cg.font = '6px monospace'; cg.fillText('0:' + String(u | 0).padStart(2, '0') + ' / 0:14', 30, 46);
}
export const ROOM = { w: 5.0, d: 5.0, h: 2.7, door: 1.15, doorH: 2.05, t: 0.16 };

/**
 * Local layout, +z is the front (the doorway). -> { root, boxes: [{x,y,z,hx,hy,hz}] (local, y = centre above the floor), desk: [x,y,z] local, tick(dt,time,ctx{near}), dispose() }
 * The floor sits at y = 0 of root; walls go 0.8 m below it so a bumpy field never shows a gap.
 */
export function createRoomModel() {
  const R = ROOM, hw = R.w / 2, hd = R.d / 2, T = R.t;
  const root = new THREE.Group(); root.name = 'myst_room';
  const lit = [], glow = [], boxes = [];
  const wall = (cx, cz, sx, sz, y0 = -0.8, y1 = R.h) => { lit.push(part(B(sx, y1 - y0, sz), '#c9b862', [cx, (y0 + y1) / 2, cz])); boxes.push({ x: cx, y: (y0 + y1) / 2, z: cz, hx: sx / 2, hy: (y1 - y0) / 2, hz: sz / 2 }); };
  const sideW = (R.w - R.door) / 2;
  wall(0, -hd + T / 2, R.w, T);                                             // back
  wall(-hw + T / 2, 0, T, R.d); wall(hw - T / 2, 0, T, R.d);                // sides
  wall(-hw + sideW / 2, hd - T / 2, sideW, T); wall(hw - sideW / 2, hd - T / 2, sideW, T);   // front, either side of the door
  const lintel = R.h - R.doorH;
  lit.push(part(B(R.door, lintel, T), '#c9b862', [0, R.doorH + lintel / 2, hd - T / 2]));
  boxes.push({ x: 0, y: R.doorH + lintel / 2, z: hd - T / 2, hx: R.door / 2, hy: lintel / 2, hz: T / 2 });
  lit.push(part(B(R.w, 0.1, R.d), '#b5a25a', [0, 0.01, 0]));                // floor (carpet the colour of old mustard)
  lit.push(part(B(R.w, 0.12, R.d), '#e4dcb0', [0, R.h + 0.06, 0]));         // ceiling
  boxes.push({ x: 0, y: R.h + 0.06, z: 0, hx: hw, hy: 0.06, hz: hd });
  lit.push(part(B(R.w - 2 * T, 0.14, 0.03), '#7d6f36', [0, 0.12, -hd + T + 0.015]));
  lit.push(part(B(0.03, 0.14, R.d - 2 * T), '#7d6f36', [-hw + T + 0.015, 0.12, 0]), part(B(0.03, 0.14, R.d - 2 * T), '#7d6f36', [hw - T - 0.015, 0.12, 0]));
  // the fluorescent panel: lit, and it hums
  glow.push(part(B(1.6, 0.05, 0.42), '#fffbd2', [0, R.h - 0.03, 0.2]));
  // the desk (a school desk: tiny, wrong, the only thing in the room) with a CRT, a cake and a chair
  const dx = 0, dz = -1.25;
  boxes.push({ x: dx, y: 0.4, z: dz, hx: 0.52, hy: 0.4, hz: 0.31 });
  lit.push(part(B(1.05, 0.05, 0.62), '#8a5f36', [dx, 0.74, dz]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lit.push(part(B(0.05, 0.72, 0.05), '#3b3128', [dx + sx * 0.47, 0.38, dz + sz * 0.26]));
  lit.push(part(B(0.62, 0.5, 0.5), '#cfc7a4', [dx - 0.18, 1.02, dz - 0.02]));           // CRT body
  lit.push(part(B(0.5, 0.04, 0.4), '#bdb490', [dx - 0.18, 0.79, dz - 0.02]));
  lit.push(part(B(0.42, 0.22, 0.05), '#cfc7a4', [dx - 0.18, 1.02, dz + 0.27]));
  lit.push(part(CY(0.13, 0.15, 0.06, 10), '#f4eee0', [dx + 0.32, 0.8, dz + 0.05]));    // cake
  lit.push(part(CY(0.10, 0.10, 0.05, 10), '#ff9ec2', [dx + 0.32, 0.855, dz + 0.05]));
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; lit.push(part(CY(0.007, 0.007, 0.06, 4), i === 0 ? '#fff2b0' : '#7fd0ff', [dx + 0.32 + Math.cos(a) * 0.075, 0.915, dz + 0.05 + Math.sin(a) * 0.075])); }
  lit.push(part(B(0.4, 0.04, 0.4), '#8a5f36', [dx + 0.05, 0.46, dz + 0.95]));         // chair, pushed back, one leg short
  lit.push(part(B(0.4, 0.4, 0.04), '#8a5f36', [dx + 0.05, 0.68, dz + 1.13]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lit.push(part(B(0.04, sz < 0 && sx > 0 ? 0.36 : 0.44, 0.04), '#3b3128', [dx + 0.05 + sx * 0.17, 0.22, dz + 0.95 + sz * 0.17]));
  // a sign outside the door, reads OPEN from far away (self-lit)
  glow.push(part(B(0.5, 0.16, 0.04), '#9fe8ff', [0, R.h + 0.3, hd + 0.03]));
  lit.push(part(B(0.56, 0.22, 0.03), '#1d2a55', [0, R.h + 0.3, hd + 0.005]));
  const litMesh = new THREE.Mesh(merge(lit), LAM), glowMesh = new THREE.Mesh(merge(glow), GLOW);
  root.add(litMesh, glowMesh);
  // candle flame + the CRT screen (canvas texture, 14 s loop, drawn at 5 fps only while the player is near)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 4), flameMat); flame.position.set(dx + 0.32 + 0.075, 0.965, dz + 0.05); root.add(flame);
  let cv = null, cg = null, tex = null;
  if (hasDom()) {
    cv = document.createElement('canvas'); cv.width = 64; cv.height = 48; cg = cv.getContext('2d');
    tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  }
  const scrMat = tex ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: 0x8fd4ff });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), scrMat); scr.position.set(dx - 0.18, 1.04, dz + 0.235 + 0.035); root.add(scr);
  let last = -1;
  const drawCat = (t) => { if (!cg) return; drawCatFrame(cg, t); tex.needsUpdate = true; };
  drawCat(0);
  return {
    root, boxes, desk: [dx, 0.95, dz + 0.3], door: [0, 0, hd],
    tick(dt, time, ctx) {
      flameMat.color.setHex(Math.sin(time * 17) > -0.3 ? 0xffc860 : 0xff8f40);
      flame.scale.y = 0.85 + Math.sin(time * 9) * 0.2;
      if (ctx?.near && time - last > 0.2) { last = time; drawCat(time); }
    },
    dispose() { litMesh.geometry.dispose(); glowMesh.geometry.dispose(); flame.geometry.dispose(); flameMat.dispose(); scr.geometry.dispose(); scrMat.dispose(); tex?.dispose(); },
  };
}

// ================================================================================================================= the wardrobe hat
const flat = (c) => lam(c);
const inst = (color, o = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...o }); m.userData.noTint = true; return m; };
const clock = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
export const MYST_HATS = {
  firstview(g, add) {
    // a lopsided paper party hat, a strip of tape, a polka of stars, one candle whose flame never goes out
    add('a', flat('#ff8fb8'), () => [xf(G.cone(0.14, 0.34, 9), [0.01, 0.17, 0], [0, 0, -0.06]), xf(G.cyl(0.145, 0.15, 0.025, 9), [0, 0.005, 0])]);
    add('b', flat('#fff4d6'), () => [xf(G.box(0.05, 0.11, 0.008), [0.03, 0.12, 0.118], [0.2, 0, -0.1]), xf(G.sph(0.018, 5, 4), [-0.06, 0.1, 0.09]), xf(G.sph(0.018, 5, 4), [0.07, 0.19, -0.05]), xf(G.sph(0.018, 5, 4), [-0.02, 0.22, -0.06])]);
    add('c', flat('#7fd0ff'), () => [xf(G.cyl(0.012, 0.012, 0.07, 4), [0.0, 0.365, 0], [0, 0, -0.06])]);
    const fm = inst('#ffc860');
    const f = mk(g, G.cone(0.018, 0.055, 5), fm, [-0.02, 0.44, 0]);
    f.onBeforeRender = () => { const t = clock(); fm.color.setHex(Math.sin(t * 15) > -0.3 ? 0xffc860 : 0xff8f40); f.scale.y = 0.9 + Math.sin(t * 8) * 0.18; };
  },
};
