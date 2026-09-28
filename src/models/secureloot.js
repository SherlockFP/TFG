// SECURED LOOT models (module `secureloot`): procedural containers + the placed drill rig + item models for the breaching tools.
// Static bodies are merged into ONE vertex-coloured Lambert mesh per part group (few draw calls); moving parts (doors, lids, the glass,
// the drill bit) are separate meshes; every glow is emissive / additive (MeshBasicMaterial) - this file NEVER adds a light.
//
//   createContainerModel(kind, variant, { content })  -> { root, size:[w,h,d], top, setOpen(k), setWork(state), update(dt, t), dispose(), parts }
//        root origin = bottom centre (wall safe: the wall face), front = +Z. kind: case | safe | cage | lockbox | vault
//   createDrillRig({ height })                        -> { root, setState({ run, jam, p }), update(dt, cam), dispose() }   bit points to -Z
//   createBreachItemModel(id)                         -> Group for sl_glasscutter | sl_boltcutters | sl_hacktool | sl_drill | sl_torch | sl_note
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const L = (color, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
const B = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

/** Collects coloured primitives and merges them into one mesh. */
class Merge {
  constructor() { this.geos = []; }
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, scale ? _s.set(scale[0], scale[1], scale[2]) : _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    this.geos.push(g);
    return this;
  }
  box(w, h, d, color, pos, rot, scale) { return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot, scale); }
  cyl(rt, rb, h, color, pos, rot, seg = 8) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, rot); }
  tor(r, tube, color, pos, rot, seg = 6) { return this.add(new THREE.TorusGeometry(r, tube, 4, seg), color, pos, rot); }
  build() {
    if (!this.geos.length) return new THREE.Group();
    const geo = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    return new THREE.Mesh(geo, L(0xffffff, { vertexColors: true }));
  }
}
const mesh = (geo, mat, pos = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(pos[0], pos[1], pos[2]); return m; };
function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
  });
}

/** Small canvas screen (lockbox): draw(text, color). Nearest-filtered, Basic (emissive) material. */
function makeScreen(w = 128, h = 64) {
  if (typeof document === 'undefined') return { mat: B(0x102010), draw() {}, dispose() {} };
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  return {
    mat: new THREE.MeshBasicMaterial({ map: tex }),
    draw(text, color = '#ff4030', sub = '') {
      const key = text + color + sub;
      if (key === last) return;
      last = key;
      ctx.fillStyle = '#060a08'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.strokeRect(2, 2, w - 4, h - 4); ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px monospace'; ctx.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
      if (sub) { ctx.font = '13px monospace'; ctx.fillText(sub, w / 2, h * 0.75); }
      tex.needsUpdate = true;
    },
    dispose() { tex.dispose(); },
  };
}

// ---------------------------------------------------------------------------------------------- containers
const STEEL = 0x3b4148, STEEL2 = 0x565e68, DARK = 0x16181c, BRASS = 0xb99a3e, HAZ = 0xd8b020, RUST = 0x6a4a34;

function buildSafe(mount, root, rig) {
  // mount 'wall': body flush with the wall (z 0 = wall face), centre height 1.25; 'floor': freestanding, centred on the origin
  const W = mount === 'wall' ? 0.62 : 0.82, H = mount === 'wall' ? 0.68 : 0.92, D = mount === 'wall' ? 0.42 : 0.7;
  const y0 = mount === 'wall' ? 1.25 - H / 2 : 0.05;
  const zc = mount === 'wall' ? D / 2 : 0, zf = zc + D / 2;   // body centre z, front face z
  const S = new Merge();
  S.box(W, H, D, STEEL, [0, y0 + H / 2, zc]);
  S.box(W + 0.04, 0.05, D + 0.03, STEEL2, [0, y0 + H + 0.01, zc]);
  S.box(W - 0.06, H - 0.06, 0.01, DARK, [0, y0 + H / 2, zf + 0.003]);   // dark cavity behind the door
  if (mount === 'floor') for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.1, 0.06, 0.1, DARK, [sx * (W / 2 - 0.08), 0.02, sz * (D / 2 - 0.1)]);
  if (mount === 'wall') S.box(W + 0.1, H + 0.1, 0.03, DARK, [0, y0 + H / 2, 0.015]);   // frame against the wall
  root.add(S.build());
  // door on a left hinge
  const dw = W - 0.08, dh = H - 0.08;
  const pivot = new THREE.Group(); pivot.position.set(-dw / 2, y0 + H / 2, zf + 0.015); root.add(pivot);
  const D2 = new Merge();
  D2.box(dw, dh, 0.06, STEEL2, [dw / 2, 0, 0]);
  D2.box(dw - 0.1, dh - 0.1, 0.02, STEEL, [dw / 2, 0, 0.035]);
  D2.cyl(0.075, 0.075, 0.04, DARK, [dw * 0.62, 0.04, 0.05], [Math.PI / 2, 0, 0], 12);
  D2.cyl(0.04, 0.04, 0.05, BRASS, [dw * 0.62, 0.04, 0.06], [Math.PI / 2, 0, 0], 8);
  D2.box(0.05, 0.16, 0.05, BRASS, [dw * 0.62 + 0.13, -0.08, 0.06]);   // handle
  for (const sx of [0.05, dw - 0.05]) for (const sy of [-dh / 2 + 0.05, dh / 2 - 0.05]) D2.cyl(0.018, 0.018, 0.03, DARK, [sx, sy, 0.05], [Math.PI / 2, 0, 0], 5);
  D2.box(0.12, 0.18, 0.02, DARK, [dw * 0.25, 0.1, 0.05]);   // keypad plate
  pivot.add(D2.build());
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), B(0xff2a2a));
  led.position.set(dw * 0.25 + 0.02, 0.17, 0.065); pivot.add(led);
  for (let i = 0; i < 6; i++) { const k = mesh(new THREE.BoxGeometry(0.025, 0.02, 0.012), B(0x405060), [dw * 0.25 - 0.035 + (i % 3) * 0.035, 0.11 - Math.floor(i / 3) * 0.04, 0.062]); pivot.add(k); }
  rig.door = pivot; rig.led = led;
  rig.size = [W, y0 + H, D + 0.1]; rig.anchor = new THREE.Vector3(0, y0 + H * 0.5, zf + 0.15);
  rig.front = zf + 0.08; rig.doorY = y0 + H / 2;
  rig.col = { cy: y0 + H / 2, cz: zc, hx: W / 2, hy: H / 2, hz: D / 2 };
  rig.open = (k) => { pivot.rotation.y = -k * 1.95; led.material.color.setHex(k > 0.5 ? 0x30ff70 : 0xff2a2a); };
}

function buildCage(variant, root, rig) {
  if (variant === 'locker') {
    const W = 0.72, H = 1.85, D = 0.52;
    const S = new Merge();
    S.box(W, H, D, 0x4d5a5e, [0, H / 2 + 0.03, 0]);
    S.box(W + 0.03, 0.05, D + 0.03, DARK, [0, H + 0.05, 0]);
    S.box(W + 0.03, 0.05, D + 0.03, DARK, [0, 0.03, 0]);
    S.box(W - 0.1, H - 0.14, 0.01, DARK, [0, H / 2 + 0.03, D / 2 + 0.003]);
    root.add(S.build());
    const pivot = new THREE.Group(); pivot.position.set(-W / 2 + 0.03, H / 2 + 0.03, D / 2 + 0.02); root.add(pivot);
    const Dm = new Merge();
    const dw = W - 0.08;
    Dm.box(dw, H - 0.1, 0.04, 0x60706f, [dw / 2, 0, 0]);
    for (let i = 0; i < 6; i++) Dm.box(dw - 0.2, 0.025, 0.02, DARK, [dw / 2, H * 0.3 - i * 0.055, 0.03]);   // vents
    Dm.box(0.05, 0.12, 0.05, STEEL2, [dw - 0.08, -0.05, 0.05]);
    pivot.add(Dm.build());
    rig.door = pivot; rig.size = [W, H + 0.1, D]; rig.front = D / 2 + 0.05;
    rig.chainAt = new THREE.Vector3(0, H * 0.5, D / 2 + 0.08);
    rig.anchor = new THREE.Vector3(0, H * 0.55, D / 2 + 0.2);
    rig.doorOpen = (k) => { pivot.rotation.y = -k * 1.9; };
    return { chainY: H * 0.5 + 0.03, chainZ: D / 2 + 0.06, w: W };
  }
  const W = 1.3, H = 1.7, D = 0.8;
  const S = new Merge();
  S.box(W + 0.1, 0.1, D + 0.1, RUST, [0, 0.05, 0]);   // pallet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.07, H, 0.07, STEEL, [sx * (W / 2 - 0.035), H / 2 + 0.1, sz * (D / 2 - 0.035)]);
  for (const y of [0.12, H * 0.5, H + 0.08]) { S.box(W, 0.05, 0.05, STEEL, [0, y + 0.03, D / 2 - 0.03]); S.box(W, 0.05, 0.05, STEEL, [0, y + 0.03, -D / 2 + 0.03]); for (const sx of [-1, 1]) S.box(0.05, 0.05, D, STEEL, [sx * (W / 2 - 0.03), y + 0.03, 0]); }
  S.box(W - 0.1, H, 0.03, DARK, [0, H / 2 + 0.1, -D / 2 + 0.06]);   // back plate
  for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) S.box(0.02, H - 0.1, 0.02, STEEL2, [sx * (W / 2 - 0.03), H / 2 + 0.1, -D / 2 + 0.2 + i * (D - 0.35) / 9]);
  // shelves + crates inside (the visible promise of loot)
  S.box(W - 0.2, 0.04, D - 0.2, RUST, [0, H * 0.5 + 0.1, 0]);
  S.box(0.4, 0.28, 0.32, 0x6a5238, [-0.3, 0.28, -0.05]); S.box(0.3, 0.2, 0.3, 0x3e4a44, [0.28, 0.24, 0.02]);
  S.box(0.36, 0.22, 0.3, 0x4a3a52, [0.1, H * 0.5 + 0.24, 0.0]); S.box(0.2, 0.16, 0.22, 0x6a5238, [-0.35, H * 0.5 + 0.22, 0.05]);
  root.add(S.build());
  // front bars = the door (hinged on the right)
  const pivot = new THREE.Group(); pivot.position.set(W / 2 - 0.04, 0, D / 2 - 0.03); root.add(pivot);
  const Dm = new Merge();
  const dw = W - 0.1;
  Dm.box(dw, 0.05, 0.04, STEEL, [-dw / 2, 0.15, 0]); Dm.box(dw, 0.05, 0.04, STEEL, [-dw / 2, H + 0.1, 0]);
  for (let i = 0; i <= 9; i++) Dm.box(0.025, H - 0.02, 0.025, STEEL2, [-0.03 - i * (dw - 0.06) / 9, H / 2 + 0.12, 0]);
  Dm.box(dw, 0.03, 0.03, STEEL2, [-dw / 2, H * 0.5 + 0.1, 0]);
  pivot.add(Dm.build());
  rig.door = pivot; rig.size = [W + 0.1, H + 0.12, D + 0.1]; rig.front = D / 2 + 0.05;
  rig.anchor = new THREE.Vector3(0, H * 0.55, D / 2 + 0.25);
  rig.doorOpen = (k) => { pivot.rotation.y = k * 1.75; };
  return { chainY: H * 0.5 + 0.1, chainZ: D / 2 + 0.03, w: W, cageDoor: true };
}

function buildChain(root, rig, at) {
  // wrapped chain links + padlock over the door (hidden once opened)
  const g = new THREE.Group();
  const C = new Merge();
  const n = 7, span = at.w * 0.62;
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + (i / (n - 1)) * span, up = i % 2 === 0;
    C.tor(0.045, 0.012, 0x9aa0a8, [x, at.chainY + (up ? 0.02 : -0.02), at.chainZ], [up ? 0 : Math.PI / 2, 0, 0], 7);
  }
  C.tor(0.05, 0.014, 0x9aa0a8, [-span / 2 - 0.04, at.chainY - 0.08, at.chainZ - 0.02], [0, Math.PI / 2, 0], 7);
  C.tor(0.05, 0.014, 0x9aa0a8, [span / 2 + 0.04, at.chainY - 0.08, at.chainZ - 0.02], [0, Math.PI / 2, 0], 7);
  C.box(0.1, 0.12, 0.05, 0xe0b020, [0, at.chainY - 0.1, at.chainZ + 0.02]);
  C.tor(0.035, 0.011, 0xd8d8e0, [0, at.chainY - 0.03, at.chainZ + 0.02], [0, 0, 0], 8);
  g.add(C.build());
  root.add(g);
  rig.chain = g;
}

function buildCase(root, rig, content) {
  const S = new Merge();
  S.box(0.92, 0.94, 0.92, 0x2c3036, [0, 0.47, 0]);
  S.box(0.98, 0.06, 0.98, BRASS, [0, 0.97, 0]);
  S.box(0.98, 0.05, 0.98, BRASS, [0, 0.025, 0]);
  S.box(0.3, 0.1, 0.02, BRASS, [0, 0.4, 0.46]);   // plaque
  S.box(0.5, 0.05, 0.5, 0x6a1420, [0, 1.025, 0]);   // velvet cushion
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.035, 0.6, 0.035, BRASS, [sx * 0.43, 1.3, sz * 0.43]);
  S.box(0.94, 0.05, 0.94, BRASS, [0, 1.62, 0]);
  root.add(S.build());
  // the glass (transparent, no depth write)
  const glass = mesh(new THREE.BoxGeometry(0.84, 0.56, 0.84), new THREE.MeshLambertMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.24, depthWrite: false }), [0, 1.3, 0]);
  glass.renderOrder = 2;
  root.add(glass);
  const rim = mesh(new THREE.BoxGeometry(0.85, 0.02, 0.85), B(0xd8f4ff, { transparent: true, opacity: 0.35, depthWrite: false }), [0, 1.585, 0]);
  root.add(rim);
  const led = mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), B(0xff2020), [0.32, 0.72, 0.465]);
  root.add(led);
  // shards left after smashing / cutting
  const shardMat = new THREE.MeshLambertMaterial({ color: 0xb8e4ff, transparent: true, opacity: 0.55, depthWrite: false });
  const shards = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.16, 0.012, 0.11);
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(geo, shardMat); s.position.set(-0.3 + (i * 0.37) % 0.6, 1.06 + (i % 3) * 0.012, -0.28 + (i * 0.53) % 0.56); s.rotation.set(0.12 * (i % 3 - 1), i * 1.3, 0.15 * (i % 2 - 0.5)); shards.add(s); }
  shards.visible = false;
  root.add(shards);
  let holder = null;
  if (content) {
    holder = new THREE.Group();
    const bb = new THREE.Box3().setFromObject(content), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const k = Math.min(1.4, 0.42 / Math.max(0.05, sz.x, sz.y, sz.z));
    content.position.sub(c);
    holder.add(content);
    holder.scale.setScalar(k);
    holder.position.set(0, 1.06 + (sz.y * k) / 2 + 0.02, 0);
    root.add(holder);
  }
  rig.glass = glass; rig.shards = shards; rig.holder = holder; rig.led = led;
  rig.size = [0.98, 1.65, 0.98]; rig.anchor = new THREE.Vector3(0, 1.3, 0.55); rig.front = 0.5;
  rig.open = (k) => { glass.visible = rim.visible = k < 0.5; shards.visible = k >= 0.5; if (holder) holder.visible = k < 0.5; led.material.color.setHex(k >= 0.5 ? 0x303030 : 0xff2020); };
}

function buildLockbox(root, rig) {
  const S = new Merge();
  S.box(0.9, 0.36, 0.64, STEEL, [0, 0.18, 0]);
  S.box(0.94, 0.06, 0.68, DARK, [0, 0.02, 0]);
  for (const sx of [-1, 1]) S.box(0.06, 0.4, 0.66, STEEL2, [sx * 0.42, 0.2, 0]);
  for (let i = 0; i < 5; i++) S.box(0.09, 0.02, 0.005, HAZ, [-0.3 + i * 0.15, 0.06, 0.322], [0, 0, 0.6]);
  S.box(0.28, 0.16, 0.02, DARK, [0.22, 0.2, 0.33]);   // keypad plate
  S.cyl(0.012, 0.012, 0.5, 0x222226, [0.4, 0.62, -0.2], [0, 0, 0], 5);   // antenna
  S.cyl(0.035, 0.035, 0.03, 0x222226, [0.4, 0.38, -0.2], [0, 0, 0], 6);
  root.add(S.build());
  // hinged lid (back hinge)
  const pivot = new THREE.Group(); pivot.position.set(0, 0.36, -0.32); root.add(pivot);
  const Lm = new Merge();
  Lm.box(0.9, 0.1, 0.64, STEEL2, [0, 0.05, 0.32]);
  Lm.box(0.5, 0.02, 0.4, DARK, [0, 0.11, 0.32]);
  pivot.add(Lm.build());
  // screen + LEDs (emissive only)
  const scr = makeScreen();
  const screen = mesh(new THREE.PlaneGeometry(0.36, 0.18), scr.mat, [-0.17, 0.2, 0.331]);
  root.add(screen);
  const leds = [];
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), B(0xff2a2a), [0.12 + i * 0.07, 0.29, 0.335]); root.add(l); leds.push(l); }
  for (let i = 0; i < 12; i++) root.add(mesh(new THREE.BoxGeometry(0.035, 0.025, 0.008), B(0x506070), [0.14 + (i % 3) * 0.075, 0.24 - Math.floor(i / 3) * 0.04 - 0.015, 0.338]));
  // dangling cables
  const cab = new Merge();
  cab.cyl(0.012, 0.012, 0.5, 0x2a50a0, [0.34, 0.1, 0.5], [Math.PI / 2, 0, 0.3], 4);
  cab.cyl(0.012, 0.012, 0.4, 0xa02a2a, [0.38, 0.05, 0.5], [Math.PI / 2, 0, -0.2], 4);
  root.add(cab.build());
  rig.lid = pivot; rig.screen = scr; rig.leds = leds;
  rig.size = [0.94, 0.5, 0.68]; rig.anchor = new THREE.Vector3(0, 0.3, 0.45); rig.front = 0.36;
  scr.draw('LOCKED', '#ff4030', 'ENCRYPTED');
  rig.open = (k) => { pivot.rotation.x = -k * 1.5; scr.draw(k > 0.5 ? 'OPEN' : 'LOCKED', k > 0.5 ? '#40ff80' : '#ff4030', k > 0.5 ? 'ACCESS GRANTED' : 'ENCRYPTED'); for (const l of leds) l.material.color.setHex(k > 0.5 ? 0x30ff70 : 0xff2a2a); };
}

function buildVault(root, rig) {
  const W = 1.4, H = 0.72, D = 1.0;
  const S = new Merge();
  S.box(W, H, D, 0x323840, [0, H / 2 + 0.06, 0]);
  S.box(W + 0.08, 0.06, D + 0.08, DARK, [0, 0.03, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.12, H + 0.02, 0.12, 0x20242a, [sx * (W / 2 - 0.02), H / 2 + 0.06, sz * (D / 2 - 0.02)]);
  for (let i = 0; i < 7; i++) S.box(0.13, 0.4, 0.008, i % 2 ? HAZ : DARK, [-0.5 + i * 0.17, 0.32, D / 2 + 0.005], [0, 0, 0.55]);
  S.box(0.36, 0.3, 0.05, 0x4a5058, [0, 0.42, D / 2 + 0.03]);   // lock plate
  for (const sx of [-1, 1]) for (const sy of [0.3, 0.55]) S.cyl(0.03, 0.03, 0.03, DARK, [sx * 0.5, sy, D / 2 + 0.02], [Math.PI / 2, 0, 0], 6);
  root.add(S.build());
  const pivot = new THREE.Group(); pivot.position.set(0, H + 0.06, -D / 2); root.add(pivot);
  const Lm = new Merge();
  Lm.box(W + 0.04, 0.16, D + 0.04, 0x3c434c, [0, 0.08, D / 2]);
  for (const sx of [-1, 1]) Lm.box(0.1, 0.19, D + 0.06, 0x20242a, [sx * (W / 2 - 0.04), 0.09, D / 2]);
  for (let i = 0; i < 6; i++) Lm.cyl(0.028, 0.028, 0.03, DARK, [-0.55 + i * 0.22, 0.17, D * 0.86], [0, 0, 0], 6);
  pivot.add(Lm.build());
  // the weld seam: an emissive strip that flares while the torch works (opacity driven by setWork)
  const seam = mesh(new THREE.BoxGeometry(W - 0.1, 0.022, 0.03), B(0xff7a20, { transparent: true, opacity: 0.55, depthWrite: false }), [0, H + 0.062, D / 2 + 0.005]);
  root.add(seam);
  const lamp = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), B(0xffb020), [0, 0.5, D / 2 + 0.065]);
  root.add(lamp);
  const inner = mesh(new THREE.PlaneGeometry(W - 0.3, D - 0.3), B(0xffd870, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), [0, H + 0.055, 0]);
  inner.rotation.x = -Math.PI / 2; inner.visible = false;
  root.add(inner);
  rig.lid = pivot; rig.seam = seam; rig.lamp = lamp; rig.inner = inner;
  rig.size = [W + 0.08, H + 0.25, D + 0.08]; rig.anchor = new THREE.Vector3(0, 0.55, D / 2 + 0.3); rig.front = D / 2 + 0.05;
  rig.open = (k) => { pivot.rotation.x = -k * 1.75; inner.visible = k > 0.5; lamp.material.color.setHex(k > 0.5 ? 0x30ff70 : 0xffb020); seam.material.opacity = k > 0.5 ? 0 : 0.55; };
}

/** kind: case | safe | cage | lockbox | vault ; variant: wall | floor (safe), cage | locker (cage) ; opts.content = item model shown in the case */
export function createContainerModel(kind, variant, opts = {}) {
  const root = new THREE.Group();
  root.name = 'sl_' + kind;
  const rig = { size: [1, 1, 1], anchor: new THREE.Vector3(0, 1, 0.6) };
  let chainInfo = null;
  if (kind === 'case') buildCase(root, rig, opts.content || null);
  else if (kind === 'safe') buildSafe(variant === 'wall' ? 'wall' : 'floor', root, rig);
  else if (kind === 'cage') { chainInfo = buildCage(variant === 'locker' ? 'locker' : 'cage', root, rig); buildChain(root, rig, chainInfo); }
  else if (kind === 'lockbox') buildLockbox(root, rig);
  else if (kind === 'vault') buildVault(root, rig);
  const st = { open: 0, target: 0, work: 0, t: 0, spark: 0 };
  const api = {
    root, size: rig.size, anchor: rig.anchor, rig, kind, variant,
    /** open amount 0..1 (animated by update(); setOpen(1, true) jumps) */
    setOpen(k, instant = false) { st.target = k; if (instant) { st.open = k; apply(); } },
    /** working state: 0 none .. 1 (torch seam flares, led blinks) */
    setWork(v) { st.work = v; },
    get opened() { return st.open >= 0.999; },
    update(dt, t = 0) {
      st.t = t;
      if (st.open !== st.target) { st.open += Math.sign(st.target - st.open) * Math.min(Math.abs(st.target - st.open), dt / 0.7); apply(); }
      if (rig.seam && st.target < 0.5) rig.seam.material.opacity = 0.35 + st.work * (0.5 + 0.25 * Math.sin(t * 40)) + 0.1 * Math.sin(t * 2);
      if (rig.lamp && st.target < 0.5) rig.lamp.material.color.setHex(st.work > 0 ? (Math.sin(t * 20) > 0 ? 0xffe060 : 0xff6010) : 0xffb020);
      if (rig.led && st.target < 0.5) rig.led.material.color.setHex(st.work > 0 ? (Math.sin(t * 16) > 0 ? 0xffb020 : 0x201000) : (kind === 'case' ? (Math.sin(t * 2.2) > 0.4 ? 0xff2020 : 0x501010) : 0xff2a2a));
      if (rig.screen && st.target < 0.5) rig.screen.draw(st.work > 0 ? 'HACKING' : 'LOCKED', st.work > 0 ? '#ffc040' : '#ff4030', st.work > 0 ? '...' : 'ENCRYPTED');
      if (rig.holder && st.target < 0.5) { rig.holder.rotation.y = t * 0.8; rig.holder.position.y += Math.sin(t * 2) * 0.0004; }
    },
    dispose() { root.removeFromParent(); disposeTree(root); rig.screen?.dispose?.(); },
  };
  function apply() {
    const k = st.open;
    if (rig.open) rig.open(k);
    if (rig.door && rig.doorOpen) rig.doorOpen(k);
    if (kind === 'cage') { if (rig.chain) rig.chain.visible = k < 0.05; }
  }
  apply();
  return api;
}

// ---------------------------------------------------------------------------------------------- drill rig
/** The placed Breaching Drill. Local -Z is the drilling direction. height = y of the bit axis. */
export function createDrillRig({ height = 1.0 } = {}) {
  const root = new THREE.Group();
  root.name = 'sl_drill_rig';
  const S = new Merge();
  S.box(0.62, 0.06, 0.5, HAZ, [0, 0.03, 0.05]);
  for (const sx of [-1, 1]) S.box(0.06, height + 0.12, 0.06, 0x33383e, [sx * 0.22, (height + 0.12) / 2, 0.22], [0.18, 0, 0]);
  S.box(0.5, 0.05, 0.05, 0x33383e, [0, 0.22, 0.02]);
  root.add(S.build());
  const head = new THREE.Group(); head.position.set(0, height, 0); root.add(head);
  const H = new Merge();
  H.box(0.34, 0.3, 0.5, 0xe0781c, [0, 0, 0.12]);
  H.box(0.3, 0.06, 0.4, 0x2a2e33, [0, 0.18, 0.12]);
  H.box(0.16, 0.14, 0.2, 0x2a2e33, [0, -0.02, 0.44]);   // battery
  H.box(0.06, 0.06, 0.24, 0x2a2e33, [0.2, 0.05, 0.3]);   // handle
  H.cyl(0.085, 0.085, 0.14, 0x60666e, [0, 0, -0.18], [Math.PI / 2, 0, 0], 10);   // chuck
  head.add(H.build());
  const bit = new THREE.Group(); bit.position.set(0, 0, -0.28); head.add(bit);
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.34, 8), L(0xb8bec8));
  bm.rotation.x = Math.PI / 2; bm.position.z = -0.12; bit.add(bm);
  const flute = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 4, 8), L(0x8a929c)); flute.position.z = -0.06; bit.add(flute);
  const lampMat = B(0x30ff70);
  const lamp = mesh(new THREE.SphereGeometry(0.04, 8, 6), lampMat, [0, 0.24, 0.02]); head.add(lamp);
  // progress bar (billboard)
  const bg = mesh(new THREE.PlaneGeometry(0.8, 0.09), B(0x101010, { transparent: true, opacity: 0.8, depthTest: false }), [0, height + 0.5, 0.1]);
  const fgGeo = new THREE.PlaneGeometry(1, 0.06); fgGeo.translate(0.5, 0, 0);
  const fg = mesh(fgGeo, B(0x40e070, { depthTest: false }), [-0.38, height + 0.5, 0.11]);
  bg.renderOrder = 8; fg.renderOrder = 9; bg.frustumCulled = fg.frustumCulled = false;
  root.add(bg, fg);
  const st = { run: false, jam: false, p: 0, t: 0, spin: 0 };
  return {
    root,
    setState(s) { Object.assign(st, s); },
    /** cam = camera (for the billboard bar) */
    update(dt, cam) {
      st.t += dt;
      st.spin += dt * (st.run && !st.jam ? 34 : 0);
      bit.rotation.z = st.spin;
      const shake = st.run && !st.jam ? 0.004 : st.jam ? 0.0015 * Math.sin(st.t * 40) : 0;
      head.position.x = (Math.random() - 0.5) * shake * 2; head.position.y = height + (Math.random() - 0.5) * shake * 2;
      bit.position.z = -0.28 - (st.run && !st.jam ? Math.min(0.16, st.p * 0.16) : 0);
      lampMat.color.setHex(st.jam ? (Math.sin(st.t * 14) > 0 ? 0xff2020 : 0x300000) : st.run ? 0x30ff70 : 0xffb020);
      const f = Math.max(0, Math.min(1, st.p));
      fg.scale.set(0.76 * f + 0.0001, 1, 1);
      fg.material.color.setHex(st.jam ? 0xff3a2a : f > 0.66 ? 0x40e070 : f > 0.33 ? 0xffc040 : 0xff8a3d);
      if (cam) { bg.quaternion.copy(cam.quaternion); fg.quaternion.copy(cam.quaternion); const dx = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(0.38); fg.position.set(bg.position.x - dx.x, bg.position.y - dx.y, bg.position.z - dx.z); }
    },
    dispose() { root.removeFromParent(); disposeTree(root); },
  };
}

// ---------------------------------------------------------------------------------------------- item models (held / world / inventory icon)
function glassCutter() {
  const M = new Merge();
  M.box(0.04, 0.04, 0.22, 0x8a1a1a, [0, 0, 0.06]);
  M.box(0.05, 0.05, 0.05, 0x2a2e33, [0, 0, -0.06]);
  M.box(0.012, 0.09, 0.03, 0x9aa0a8, [0, -0.045, -0.09]);
  M.cyl(0.032, 0.032, 0.008, 0xe8d888, [0, -0.09, -0.09], [0, 0, Math.PI / 2], 10);
  M.cyl(0.03, 0.03, 0.02, 0x1a1c20, [0, 0.03, -0.02], [Math.PI / 2, 0, 0], 8);
  const g = new THREE.Group(); g.add(M.build()); return g;
}
function boltCutters() {
  const M = new Merge();
  for (const s of [-1, 1]) {
    M.box(0.03, 0.03, 0.56, 0x2a2e33, [s * 0.05, 0, 0.14], [0, s * -0.09, 0]);
    M.box(0.034, 0.034, 0.2, 0xb02020, [s * 0.075, 0, 0.36], [0, s * -0.09, 0]);
    M.box(0.03, 0.035, 0.16, 0x9aa0a8, [s * 0.025, 0, -0.16], [0, s * 0.25, 0]);
    M.box(0.028, 0.05, 0.05, 0xd8dce4, [s * 0.006, 0, -0.245], [0, s * 0.25, 0]);
  }
  M.cyl(0.02, 0.02, 0.06, 0x6a7078, [0, 0, -0.08], [0, 0, 0], 8);
  const g = new THREE.Group(); g.add(M.build()); return g;
}
function hackTool() {
  const M = new Merge();
  M.box(0.1, 0.17, 0.03, 0x22262c, [0, 0, 0]);
  M.box(0.11, 0.02, 0.035, 0x0e1014, [0, -0.09, 0]);
  for (let i = 0; i < 6; i++) M.box(0.018, 0.014, 0.006, 0x60707c, [-0.03 + (i % 3) * 0.03, -0.045 - Math.floor(i / 3) * 0.024, 0.018]);
  M.cyl(0.006, 0.006, 0.12, 0x22262c, [0.04, 0.14, 0], [0, 0, 0], 4);
  M.box(0.02, 0.05, 0.012, 0x2a80ff, [-0.045, 0.06, 0.018]);
  const g = new THREE.Group(); g.add(M.build());
  g.add(mesh(new THREE.PlaneGeometry(0.075, 0.06), B(0x30ff70), [0, 0.035, 0.0165]));
  return g;
}
function drillItem() {
  const M = new Merge();
  M.box(0.26, 0.24, 0.46, 0xe0781c, [0, 0.02, 0.05]);
  M.box(0.22, 0.05, 0.36, 0x2a2e33, [0, 0.16, 0.05]);
  M.box(0.14, 0.14, 0.2, 0x2a2e33, [0, -0.02, 0.36]);
  M.box(0.05, 0.22, 0.06, 0x2a2e33, [0.15, -0.12, 0.12]);   // side grip
  M.box(0.24, 0.05, 0.05, 0x2a2e33, [0, 0.22, 0.05]);   // top bar
  M.cyl(0.07, 0.07, 0.12, 0x60666e, [0, 0.02, -0.24], [Math.PI / 2, 0, 0], 10);
  M.cyl(0.03, 0.02, 0.34, 0xb8bec8, [0, 0.02, -0.46], [Math.PI / 2, 0, 0], 8);
  const g = new THREE.Group(); g.add(M.build()); return g;
}
function torchItem() {
  const M = new Merge();
  M.cyl(0.07, 0.07, 0.34, 0xc03020, [0, 0, 0], [0, 0, 0], 10);
  M.cyl(0.075, 0.075, 0.04, 0x1e2024, [0, 0.13, 0], [0, 0, 0], 10);
  M.cyl(0.02, 0.02, 0.07, 0x9aa0a8, [0, 0.21, 0], [0, 0, 0], 6);
  M.tor(0.12, 0.012, 0x22262c, [0.09, 0.2, 0.08], [0.6, 0.4, 0], 8);
  M.cyl(0.018, 0.018, 0.24, 0x2a2e33, [0.15, 0.32, 0.16], [Math.PI / 2 - 0.3, 0.6, 0], 6);
  M.cyl(0.012, 0.03, 0.09, 0x6a7078, [0.235, 0.35, 0.235], [Math.PI / 2 - 0.3, 0.6, 0], 6);
  const g = new THREE.Group(); g.add(M.build());
  g.add(mesh(new THREE.SphereGeometry(0.018, 6, 5), B(0x70ccff), [0.262, 0.358, 0.262]));
  return g;
}
function noteItem() {
  const M = new Merge();
  M.box(0.12, 0.004, 0.16, 0xf0ead0, [0, 0, 0], [0, 0.2, 0]);
  for (let i = 0; i < 4; i++) M.box(0.08, 0.0045, 0.006, 0x3a3a48, [0, 0, -0.05 + i * 0.03], [0, 0.2, 0]);
  const g = new THREE.Group(); g.add(M.build()); return g;
}
export const BREACH_ITEM_MODELS = { sl_glasscutter: glassCutter, sl_boltcutters: boltCutters, sl_hacktool: hackTool, sl_drill: drillItem, sl_torch: torchItem, sl_note: noteItem };
export function createBreachItemModel(id) { const f = BREACH_ITEM_MODELS[id]; return f ? f() : new THREE.Group(); }
