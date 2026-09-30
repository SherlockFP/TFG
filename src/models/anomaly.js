// ANOMALY models (procedural, no assets): Loot Box Shrine + numbered d20, the Cursed Die (d6 item), holographic power-up
// pickups, Decon Shower booth, static haze volume, remote-player aura, and the small item models (Signal Counter, Antivirus
// Shot, Faraday Suit). Everything is emissive / unlit so it never touches the light pool. Safe to import in node (no DOM at import).
import * as THREE from 'three';
import { SPOTS } from '../world/shiplayout.js';
import { t } from '../core/i18n.js';

const HAS_DOM = typeof document !== 'undefined';
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const AD = THREE.AdditiveBlending;

function canvasTex(w, h, draw) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const bas = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, ...o });
const glow = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: AD, depthWrite: false, fog: false, ...o });
function add(parent, geo, mat, p = [0, 0, 0], r = null, s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  if (s) m.scale.set(s[0], s[1], s[2]);
  parent.add(m);
  return m;
}
export function disposeTree(root) {
  root?.traverse?.((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { if (!m.userData?.shared) { m.map?.dispose?.(); m.dispose?.(); } }
  });
  root?.removeFromParent?.();
}

// ============================================================================================ Cursed Die (d6)
/** BoxGeometry material order: +x, -x, +y, -y, +z, -z. Opposite faces sum to 7. */
export const DIE_FACES = [
  { n: [1, 0, 0], v: 1 }, { n: [-1, 0, 0], v: 6 }, { n: [0, 1, 0], v: 2 }, { n: [0, -1, 0], v: 5 }, { n: [0, 0, 1], v: 3 }, { n: [0, 0, -1], v: 4 },
];
/** Which face points up for a quaternion {x,y,z,w}. Returns { v: 1..6, up: 0..1 (1 = flat on a face, < 0.9 = cocked) }. Pure. */
export function dieFaceUp(q) {
  const { x, y, z, w } = q;
  let best = { v: 1, up: -2 };
  for (const f of DIE_FACES) {
    const [nx, ny, nz] = f.n;
    const up = 2 * (x * y + z * w) * nx + (1 - 2 * (x * x + z * z)) * ny + 2 * (y * z - x * w) * nz;
    if (up > best.up) best = { v: f.v, up };
  }
  return best;
}
const PIPS = { 1: [[0.5, 0.5]], 2: [[0.25, 0.25], [0.75, 0.75]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]] };
let dieMats = null;
function dieMaterials() {
  if (dieMats) return dieMats;
  dieMats = DIE_FACES.map((f) => {
    const tex = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = '#1a0612'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7a1d4f'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = '#ff4fd0';
      for (const [px, py] of PIPS[f.v]) { c.beginPath(); c.arc(px * w, py * h, f.v === 1 ? 9 : 6, 0, TAU); c.fill(); }
    });
    const m = tex ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshBasicMaterial({ color: 0x40102a });
    m.userData.shared = true;
    return m;
  });
  return dieMats;
}
export function createDieModel() {
  const g = new THREE.BoxGeometry(0.17, 0.17, 0.17);
  g.userData.shared = false;
  const root = new THREE.Group();
  root.add(new THREE.Mesh(g, dieMaterials()));
  root.userData.tip = null;
  return root;
}

// ============================================================================================ d20 (shrine)
let d20Cache = null;
function d20Data() {
  if (d20Cache) return d20Cache;
  let base = new THREE.IcosahedronGeometry(1, 0);
  if (base.index) base = base.toNonIndexed();
  const pos = base.attributes.position;
  const faces = pos.count / 3;
  const normals = [];
  for (let i = 0; i < faces; i++) {
    const n = new THREE.Vector3();
    for (let k = 0; k < 3; k++) n.add(new THREE.Vector3().fromBufferAttribute(pos, i * 3 + k));
    normals.push(n.normalize());
  }
  const nums = new Array(faces).fill(0);
  let next = 1;
  for (let i = 0; i < faces; i++) {
    if (nums[i]) continue;
    let j = -1;
    for (let k = i + 1; k < faces; k++) if (!nums[k] && normals[i].dot(normals[k]) < -0.99) { j = k; break; }
    nums[i] = next; if (j >= 0) nums[j] = 21 - next; next++;
  }
  const uv = new Float32Array(pos.count * 2);
  const cols = 5, rows = 4;
  for (let i = 0; i < faces; i++) {
    const cx = i % cols, cy = Math.floor(i / cols);
    const tri = [[0.5, 0.95], [0.04, 0.12], [0.96, 0.12]];
    for (let k = 0; k < 3; k++) { uv[(i * 3 + k) * 2] = (cx + tri[k][0]) / cols; uv[(i * 3 + k) * 2 + 1] = 1 - (cy + 1 - tri[k][1]) / rows; }
  }
  base.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const atlas = canvasTex(640, 512, (c, w, h) => {
    c.fillStyle = '#12061f'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < faces; i++) {
      const x0 = (i % cols) * 128, y0 = Math.floor(i / cols) * 128;
      c.fillStyle = nums[i] === 20 ? '#ffd35a' : nums[i] === 1 ? '#ff3a3a' : '#7dfff0';
      c.font = 'bold 46px monospace';
      c.fillText(String(nums[i]), x0 + 64, y0 + 58);
      if (nums[i] === 6 || nums[i] === 9) c.fillRect(x0 + 52, y0 + 84, 24, 4);
    }
  });
  d20Cache = { geo: base, normals, nums, atlas };
  return d20Cache;
}
/** The numbered icosahedron. `faceQuat(n, dir)` = quaternion that turns the face showing n toward direction dir. */
export function createD20(radius = 0.34) {
  const d = d20Data();
  const geo = d.geo.clone();
  const mat = d.atlas ? new THREE.MeshBasicMaterial({ map: d.atlas, fog: false }) : new THREE.MeshBasicMaterial({ color: 0x40e0d0, fog: false });
  mat.userData.shared = false;
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff4fd0, fog: false }));
  mesh.add(edges);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 0), glow(0xff4fd0, { opacity: 0.16, side: THREE.BackSide }));
  mesh.add(halo);
  const root = new THREE.Group();
  root.add(mesh);
  root.scale.setScalar(radius);
  const faceIndexOf = (n) => d.nums.findIndex((v) => v === n);
  return {
    root, mesh, halo, radius, nums: d.nums,
    faceQuat(n, dir, yaw = 0) {
      const i = faceIndexOf(n);
      const q = new THREE.Quaternion().setFromUnitVectors(d.normals[Math.max(0, i)], dir.clone().normalize());
      if (yaw) q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir.clone().normalize(), yaw));
      return q;
    },
    dispose() { geo.dispose(); mat.dispose(); edges.geometry.dispose(); edges.material.dispose(); halo.geometry.dispose(); halo.material.dispose(); root.removeFromParent(); },
  };
}

// ============================================================================================ Loot Box Shrine
export const SHRINE_SIZE = { w: 1.5, d: 1.5, h: 1.15 };
export function createShrine() {
  const group = new THREE.Group();
  group.name = 'loot_box_shrine';
  const stone = lam(0x2a1a3a), trim = lam(0xc8a23a), dark = lam(0x120a1c);
  add(group, new THREE.BoxGeometry(1.5, 0.22, 1.5), dark, [0, 0.11, 0]);
  add(group, new THREE.BoxGeometry(1.2, 0.8, 1.2), stone, [0, 0.62, 0]);
  add(group, new THREE.BoxGeometry(1.32, 0.07, 1.32), trim, [0, 1.06, 0]);
  add(group, new THREE.BoxGeometry(1.26, 0.06, 1.26), trim, [0, 0.24, 0]);
  const ring = add(group, new THREE.TorusGeometry(0.46, 0.035, 4, 24), glow(0xff4fd0, { opacity: 0.9 }), [0, 1.12, 0], [Math.PI / 2, 0, 0]);
  // corner posts with neon tubes
  const tubes = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(group, new THREE.BoxGeometry(0.1, 0.9, 0.1), trim, [sx * 0.63, 0.62, sz * 0.63]);
    tubes.push(add(group, new THREE.BoxGeometry(0.05, 0.86, 0.05), bas(0xff4fd0), [sx * 0.63, 0.62, sz * 0.63 + sz * 0.06]));
  }
  // slot machine window (front, +z)
  const reelCanvas = HAS_DOM ? document.createElement('canvas') : null;
  let reelTex = null;
  if (reelCanvas) { reelCanvas.width = 192; reelCanvas.height = 64; reelTex = new THREE.CanvasTexture(reelCanvas); reelTex.magFilter = THREE.NearestFilter; reelTex.colorSpace = THREE.SRGBColorSpace; }
  const win = add(group, new THREE.PlaneGeometry(0.95, 0.32), reelTex ? new THREE.MeshBasicMaterial({ map: reelTex, fog: false }) : bas(0x33ff99), [0, 0.68, 0.605]);
  add(group, new THREE.BoxGeometry(1.02, 0.4, 0.03), trim, [0, 0.68, 0.595]);
  const SYM = ['7', '$', '?', 'X', '*', '#'];
  let reelT = 0;
  const drawReels = (spin, t) => {
    if (!reelCanvas) return;
    const c = reelCanvas.getContext('2d');
    c.fillStyle = '#0a0410'; c.fillRect(0, 0, 192, 64);
    c.font = 'bold 44px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const k = spin ? Math.floor(t * (10 + i * 3) + i * 2) : 0;
      c.fillStyle = spin ? '#ffd35a' : '#7dfff0';
      c.fillText(spin ? SYM[k % SYM.length] : i === 1 ? '?' : '7', 32 + i * 64, 34);
    }
    c.strokeStyle = '#ff4fd0'; c.lineWidth = 2; c.strokeRect(1, 1, 190, 62);
    reelTex.needsUpdate = true;
  };
  drawReels(false, 0);
  // sign board on two poles (back)
  add(group, new THREE.BoxGeometry(0.08, 1.3, 0.08), dark, [-0.55, 1.65, -0.5]);
  add(group, new THREE.BoxGeometry(0.08, 1.3, 0.08), dark, [0.55, 1.65, -0.5]);
  const signTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#12061f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffd35a'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = '#ff4fd0'; c.font = 'bold 30px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t('LOOT BOX'), w / 2, 24);
    c.fillStyle = '#7dfff0'; c.font = 'bold 16px monospace'; c.fillText(t('THE HOUSE ALWAYS WINS'), w / 2, 47);
  });
  add(group, new THREE.PlaneGeometry(1.3, 0.34), signTex ? new THREE.MeshBasicMaterial({ map: signTex, fog: false, side: THREE.DoubleSide }) : bas(0xff4fd0), [0, 2.1, -0.5]);
  const d20 = createD20(0.3);
  const hover = new THREE.Vector3(0, 1.72, 0);
  d20.root.position.copy(hover);
  group.add(d20.root);
  const state = { spin: 1.4, rolling: false };
  return {
    group, d20, hover, tubes, ring, state,
    /** world position of the hovering die */
    dieWorld(out = new THREE.Vector3()) { return group.localToWorld(out.copy(hover)); },
    update(dt, t) {
      const rolling = state.rolling;
      ring.material.opacity = 0.6 + 0.35 * Math.sin(t * (rolling ? 14 : 2.2));
      const hue = (t * (rolling ? 1.2 : 0.15)) % 1;
      for (let i = 0; i < tubes.length; i++) tubes[i].material.color.setHSL((hue + i * 0.08) % 1, 1, rolling ? 0.62 : 0.5);
      reelT += dt;
      if (rolling || Math.floor(reelT * 2) % 7 === 0) drawReels(rolling, t);
      if (!rolling) {
        d20.root.position.y = hover.y + Math.sin(t * 1.6) * 0.04;
        d20.mesh.rotation.y += dt * state.spin;
        d20.mesh.rotation.x += dt * state.spin * 0.35;
      }
      d20.halo.material.opacity = 0.12 + 0.08 * Math.sin(t * 3);
    },
    dispose() { disposeTree(group); reelTex?.dispose(); signTex?.dispose(); d20.dispose(); },
  };
}

// ============================================================================================ power-up hologram pickup
const glyphCache = new Map();
function glyphTex(glyph, color) {
  const key = glyph + color;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const t = canvasTex(64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = color; c.lineWidth = 4;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + TAU / 12; const x = 32 + Math.cos(a) * 27, y = 32 + Math.sin(a) * 27; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath(); c.stroke();
    c.fillStyle = color; c.font = `bold ${glyph.length > 2 ? 18 : 24}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(glyph, 32, 34);
  });
  if (t) t.userData = { shared: true };
  glyphCache.set(key, t);
  return t;
}
export function createHolo(glyph, colorHex) {
  const color = new THREE.Color(colorHex);
  const group = new THREE.Group();
  group.name = 'anomaly_powerup';
  const tex = glyphTex(glyph, colorHex);
  const ringM = glow(color, { opacity: 0.8 }), beamM = glow(color, { opacity: 0.16, side: THREE.DoubleSide });
  const base = add(group, new THREE.TorusGeometry(0.42, 0.03, 4, 20), ringM, [0, 0.06, 0], [Math.PI / 2, 0, 0]);
  add(group, new THREE.CylinderGeometry(0.34, 0.42, 1.5, 12, 1, true), beamM, [0, 0.8, 0]);
  const icon = new THREE.Group();
  icon.position.y = 1.35;
  const iconMat = tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: AD, depthWrite: false, fog: false, side: THREE.DoubleSide }) : glow(color, { opacity: 0.9 });
  iconMat.userData.shared = false;
  add(icon, new THREE.PlaneGeometry(0.62, 0.62), iconMat);
  add(icon, new THREE.CircleGeometry(0.5, 16), glow(color, { opacity: 0.12 }), [0, 0, -0.01]);
  group.add(icon);
  return {
    group,
    update(t, camPos) {
      icon.position.y = 1.35 + Math.sin(t * 2.2) * 0.09;
      if (camPos) icon.rotation.y = Math.atan2(camPos.x - group.position.x, camPos.z - group.position.z) + Math.sin(t * 3) * 0.12;
      base.rotation.z = t * 1.4;
      ringM.opacity = 0.55 + 0.3 * Math.sin(t * 4);
    },
    dispose() { disposeTree(group); },
  };
}

// ============================================================================================ Decon Shower
export const DECON = { x: SPOTS.decon.x, z: SPOTS.decon.z, w: 1.1, d: 1.1, h: 2.25 };
export function createDecon() {
  const group = new THREE.Group();
  group.name = 'decon_shower';
  const metal = lam(0x8a9298), dark = lam(0x2a2f33), glass = new THREE.MeshLambertMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.22, depthWrite: false });
  add(group, new THREE.BoxGeometry(DECON.w, 0.06, DECON.d), lam(0x55606a), [0, 0.03, 0]);
  for (let i = -2; i <= 2; i++) add(group, new THREE.BoxGeometry(0.9, 0.02, 0.05), dark, [0, 0.07, i * 0.19]);
  add(group, new THREE.BoxGeometry(DECON.w + 0.1, 0.1, DECON.d + 0.1), metal, [0, DECON.h, 0]);
  for (const sx of [-1, 1]) {
    add(group, new THREE.BoxGeometry(0.06, DECON.h, 0.06), metal, [sx * DECON.w / 2, DECON.h / 2, -DECON.d / 2]);
    add(group, new THREE.BoxGeometry(0.06, DECON.h, 0.06), metal, [sx * DECON.w / 2, DECON.h / 2, DECON.d / 2]);
    add(group, new THREE.BoxGeometry(0.03, DECON.h - 0.2, DECON.d - 0.1), glass, [sx * DECON.w / 2, DECON.h / 2, 0]);
  }
  add(group, new THREE.BoxGeometry(DECON.w, DECON.h, 0.05), lam(0x3a4a52), [0, DECON.h / 2, -DECON.d / 2 + 0.02]);
  add(group, new THREE.CylinderGeometry(0.22, 0.22, 0.07, 10), metal, [0, DECON.h - 0.15, 0]);
  add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), metal, [0, DECON.h - 0.05, -DECON.d / 2 + 0.2]);
  const stripe = add(group, new THREE.BoxGeometry(0.7, 0.09, 0.02), bas(0x33ffaa), [0, DECON.h - 0.3, DECON.d / 2 + 0.03]);
  const signTex = canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#04150f'; c.fillRect(0, 0, w, h); c.fillStyle = '#33ffaa'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t('DECON'), w / 2, h / 2 + 1); });
  const sign = add(group, new THREE.PlaneGeometry(0.62, 0.16), signTex ? new THREE.MeshBasicMaterial({ map: signTex, fog: false }) : bas(0x33ffaa), [0, DECON.h - 0.3, DECON.d / 2 + 0.045]);
  // spray: falling points inside the booth
  const N = 70;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.7; pos[i * 3 + 1] = Math.random() * DECON.h; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.7; vel[i] = 2 + Math.random() * 1.5; }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sm = new THREE.PointsMaterial({ color: 0xa8fff0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.9, blending: AD, depthWrite: false, fog: false });
  const spray = new THREE.Points(sg, sm);
  spray.visible = false; spray.frustumCulled = false;
  group.add(spray);
  const st = { on: false, t: 0 };
  return {
    group, spray, sign, stripe,
    setSpray(v) { st.on = !!v; spray.visible = !!v; },
    update(dt, t) {
      stripe.material.color.setHex(st.on ? 0x9fffe0 : (Math.floor(t * 1.5) % 2 ? 0x33ffaa : 0x1a9a70));
      if (!st.on) return;
      for (let i = 0; i < N; i++) {
        pos[i * 3 + 1] -= vel[i] * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = DECON.h - 0.2; pos[i * 3] = (Math.random() - 0.5) * 0.6; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6; }
      }
      sg.attributes.position.needsUpdate = true;
    },
    dispose() { disposeTree(group); signTex?.dispose(); },
  };
}

// ============================================================================================ static haze (hot zone)
export function createHaze(w, d, h, seed = 1) {
  const group = new THREE.Group();
  group.name = 'static_haze';
  const boxM = glow(0x4dffc8, { opacity: 0.05, side: THREE.BackSide });
  add(group, new THREE.BoxGeometry(w, h, d), boxM, [0, h / 2, 0]);
  const N = 110;
  const pos = new Float32Array(N * 3);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: 0x8dfff0, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.8, blending: AD, depthWrite: false, fog: false });
  const pts = new THREE.Points(sg, pm);
  pts.frustumCulled = false;
  group.add(pts);
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const scatter = (i) => { pos[i * 3] = (rnd() - 0.5) * (w - 0.3); pos[i * 3 + 1] = rnd() * (h - 0.2) + 0.1; pos[i * 3 + 2] = (rnd() - 0.5) * (d - 0.3); };
  for (let i = 0; i < N; i++) scatter(i);
  let acc = 0;
  return {
    group,
    update(dt, t, level = 1) {
      acc += dt;
      if (acc > 0.09) {
        acc = 0;
        for (let i = 0; i < N; i++) if (rnd() < 0.35) scatter(i);
        sg.attributes.position.needsUpdate = true;
      }
      boxM.opacity = (0.045 + 0.025 * Math.sin(t * 7.3) + (rnd() < 0.05 ? 0.06 : 0)) * level;
      pm.opacity = 0.55 + 0.4 * Math.sin(t * 13) * Math.sin(t * 5.1);
    },
    dispose() { disposeTree(group); },
  };
}

// ============================================================================================ remote aura (stage glow / beacon)
export function createAura() {
  const m = glow(0x4dffc8, { opacity: 0, side: THREE.BackSide });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), m);
  mesh.scale.set(0.8, 1.15, 0.8);
  mesh.position.y = 0.95;
  mesh.visible = false;
  const COL = [0x4dffc8, 0x4dffc8, 0x7dffb0, 0xff4fd0, 0xff2a2a];
  return {
    mesh,
    setState(stage, beacon, t) {
      const on = stage >= 2 || beacon;
      mesh.visible = on;
      if (!on) return;
      m.color.setHex(beacon ? 0xffd35a : COL[Math.min(4, stage)]);
      m.opacity = beacon ? 0.32 + 0.16 * Math.sin(t * 6) : 0.1 + 0.05 * stage + 0.04 * Math.sin(t * 11);
      const k = beacon ? 1.35 + 0.1 * Math.sin(t * 6) : 1;
      mesh.scale.set(0.8 * k, 1.15 * k, 0.8 * k);
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); m.dispose(); },
  };
}

// ============================================================================================ small item models
function counterModel() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.11, 0.17, 0.05), lam(0x3c4438), [0, 0, 0]);
  add(g, new THREE.BoxGeometry(0.08, 0.05, 0.01), bas(0x5dff9a), [0, 0.04, 0.03]);
  add(g, new THREE.BoxGeometry(0.06, 0.02, 0.01), bas(0xffb030), [0, -0.02, 0.03]);
  add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), lam(0x222222), [0.04, 0.14, 0]);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), lam(0x222222), [-0.02, -0.06, 0.03], [Math.PI / 2, 0, 0]);
  return g;
}
function antivirusModel() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0x66ffaa, transparent: true, opacity: 0.8 }), [0, 0, 0], [0, 0, Math.PI / 2]);
  add(g, new THREE.CylinderGeometry(0.006, 0.001, 0.08, 5), lam(0xdddddd), [0.12, 0, 0], [0, 0, -Math.PI / 2]);
  add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), lam(0x333333), [-0.11, 0, 0], [0, 0, Math.PI / 2]);
  add(g, new THREE.BoxGeometry(0.008, 0.06, 0.03), lam(0x333333), [-0.14, 0, 0]);
  add(g, new THREE.BoxGeometry(0.008, 0.05, 0.05), lam(0x333333), [0.07, 0, 0]);
  return g;
}
function faradayModel() {
  const g = new THREE.Group();
  const mesh = lam(0x8fa4b4), band = lam(0x1e2a34);
  add(g, new THREE.BoxGeometry(0.34, 0.42, 0.16), mesh, [0, 0, 0]);
  for (const sx of [-1, 1]) add(g, new THREE.CylinderGeometry(0.06, 0.05, 0.36, 7), mesh, [sx * 0.21, -0.02, 0], [0, 0, sx * 0.3]);
  add(g, new THREE.BoxGeometry(0.36, 0.05, 0.17), band, [0, 0.12, 0]);
  add(g, new THREE.BoxGeometry(0.36, 0.05, 0.17), band, [0, -0.1, 0]);
  add(g, new THREE.CylinderGeometry(0.09, 0.11, 0.06, 8), band, [0, 0.23, 0]);
  add(g, new THREE.BoxGeometry(0.05, 0.04, 0.01), bas(0x5dff9a), [0.08, 0.02, 0.085]);
  return g;
}
export const ANOMALY_ITEM_MODELS = { sigcounter: counterModel, antivirus: antivirusModel, arm_faraday: faradayModel, cursed_die: createDieModel };
