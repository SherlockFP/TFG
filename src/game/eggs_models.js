// EGGS models (wave 4): cheap procedural props for the moon / facility secrets. Every model = one merged vertex-coloured Lambert mesh
// (+ at most one merged self-lit mesh for "emissive" parts) - never a THREE light. Shared materials, geometry disposed with the model.
//   createEggModel(kind, { text, variant, seed }) -> { root, col: {hx,hy,hz}|null, tick(dt, time, ctx)|null, dispose() }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.js';

const LAM = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffb040 });       // shrine candles (colour flickers once a frame per shrine)
const BLINK = new THREE.MeshBasicMaterial({ color: 0xff5a2a });       // payphone ring light
export const shared = { LAM, GLOW, FLAME, BLINK };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
/** part(geometry, hexColor, [x,y,z], [rx,ry,rz], [sx,sy,sz]) */
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
const SP = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const CO = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n);
const merge = (parts) => { const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); return g; };

// ---------------------------------------------------------------------------------------------------------------- canvases
const wrap = (g, text, maxW) => {
  const words = String(text).split(' '), lines = []; let cur = '';
  for (const w of words) { const t2 = cur ? cur + ' ' + w : w; if (g.measureText(t2).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t2; }
  if (cur) lines.push(cur);
  return lines;
};
function graffitiTexture(text, seed) {
  const rng = new RNG(seed >>> 0);
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return null;
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#5d5c57'; g.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 90; i++) { const v = 70 + rng.int(0, 40); g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(rng.int(0, 250), rng.int(0, 156), rng.int(2, 10), rng.int(1, 3)); }
  const col = rng.pick(['#ff8a3d', '#ff5aa0', '#7dff7d', '#7fd0ff']);
  g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.textAlign = 'center'; g.font = 'bold 21px monospace';
  const lines = wrap(g, text, 226);
  lines.forEach((ln, i) => { const y = 40 + i * 26 - (lines.length - 1) * 10; g.strokeText(ln, 128, y); g.fillText(ln, 128, y); });
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const x0 = rng.int(20, 236), y0 = 44 + lines.length * 20; g.strokeStyle = col; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + rng.float(-1, 1), y0 + rng.int(8, 46)); g.stroke(); g.globalAlpha = 1; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  return tex;
}

// ---------------------------------------------------------------------------------------------------------------- builders
function finish(kind, lit, glow, extra = {}) {
  const root = new THREE.Group(); root.name = 'egg_' + kind;
  const geos = [];
  if (lit) { const m = new THREE.Mesh(lit, LAM); root.add(m); geos.push(lit); }
  if (glow) { const m = new THREE.Mesh(glow, GLOW); root.add(m); geos.push(glow); }
  return { root, col: extra.col || null, tick: extra.tick || null, geos, extraDispose: extra.dispose || null };
}

const BUILD = {
  graffiti({ text, seed }) {
    const lit = merge([part(B(1.8, 1.2, 0.08), 0x6b6a64, [0, 0.66, 0], [-0.1, 0, 0]), part(B(0.35, 0.3, 0.3), 0x55534d, [-0.6, 0.15, 0.32]), part(B(0.35, 0.3, 0.3), 0x55534d, [0.6, 0.15, 0.32]), part(B(1.9, 0.06, 0.4), 0x4a4944, [0, 0.03, 0.15])]);
    const o = finish('graffiti', lit, null);
    const tex = graffitiTexture(text, seed);
    if (tex) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.06), new THREE.MeshBasicMaterial({ map: tex }));
      face.position.set(0, 0.66, 0.048); face.rotation.x = -0.1; o.root.add(face);
      o.geos.push(face.geometry); o.mats = [face.material]; o.texs = [tex];
    }
    return o;
  },
  shrine() {
    const lit = merge([
      part(B(0.62, 0.5, 0.62), 0x55524c, [0, 0.25, 0]), part(B(0.74, 0.08, 0.74), 0x6a675f, [0, 0.54, 0]),
      part(CY(0.2, 0.15, 0.09, 10), 0xc9a227, [0, 0.62, 0]),
      part(CY(0.03, 0.03, 0.13, 6), 0xeeeeee, [-0.28, 0.65, -0.28]), part(CY(0.03, 0.03, 0.13, 6), 0xeeeeee, [0.28, 0.65, -0.28]), part(CY(0.03, 0.03, 0.13, 6), 0xeeeeee, [0, 0.65, 0.3]),
      part(B(0.16, 0.12, 0.1), 0xd9a72a, [0, 0.76, 0]), part(B(0.05, 0.12, 0.05), 0xd9a72a, [-0.05, 0.86, 0]),   // the little "like" fist + thumb
    ]);
    const glow = merge([part(B(0.08, 0.03, 0.02), 0xfff2a0, [0, 0.82, 0.055])]);
    const o = finish('shrine', lit, glow, { col: { hx: 0.4, hy: 0.4, hz: 0.4, y: 0.4 } });
    return o;   // flames + flicker are added right below (own mesh on the FLAME material)
  },
  vending() {
    const lit = merge([part(B(0.95, 1.9, 0.85), 0x2a4a55, [0, 0.95, 0]), part(B(0.86, 0.06, 0.04), 0x14282f, [0, 0.3, 0.44]), part(B(0.3, 0.2, 0.06), 0x0a1418, [0, 0.16, 0.42])]);
    const cols = [0xff5a5a, 0x7dff7d, 0xffd23f, 0x7fd0ff, 0xff8a3d, 0xff5aa0];
    const shelf = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) shelf.push(part(B(0.12, 0.2, 0.06), cols[(r * 3 + c) % cols.length], [-0.24 + c * 0.16, 1.55 - r * 0.26, 0.4]));
    shelf.push(part(B(0.74, 0.12, 0.04), 0xffb03a, [0, 1.8, 0.44]), part(B(0.82, 1.2, 0.02), 0x2a5a58, [0, 1.13, 0.432]));
    return finish('vending', lit, merge(shelf), { col: { hx: 0.5, hy: 0.95, hz: 0.45, y: 0.95 } });
  },
  diary() {
    const lit = merge([
      part(B(0.4, 0.2, 0.62), 0x8a5a34, [0, 0.12, 0], [0, 0, 0]), part(SP(0.13, 8, 6), 0x8c7a6a, [0, 0.13, -0.42]), part(SP(0.145, 8, 5), 0x3a3f46, [0, 0.16, -0.43], [0, 0, 0], [1, 0.8, 1]),
      part(B(0.12, 0.12, 0.5), 0x8a5a34, [-0.27, 0.1, -0.05], [0, 0.25, 0]), part(B(0.12, 0.12, 0.5), 0x8a5a34, [0.27, 0.1, 0.12], [0, -0.35, 0]),
      part(B(0.16, 0.14, 0.62), 0x5a4a3a, [-0.12, 0.09, 0.6], [0, 0.1, 0]), part(B(0.16, 0.14, 0.62), 0x5a4a3a, [0.14, 0.09, 0.62], [0, -0.05, 0]),
      part(B(0.3, 0.22, 0.14), 0x4a4238, [0, 0.14, 0.12]), part(B(0.17, 0.035, 0.23), 0x3a5a7a, [0.45, 0.02, -0.1], [0, 0.4, 0]),   // backpack + the diary
    ]);
    const glow = merge([part(B(0.12, 0.012, 0.17), 0xe8e2c8, [0.45, 0.045, -0.1], [0, 0.4, 0])]);
    return finish('diary', lit, glow);
  },
  duck() {
    const lit = merge([part(SP(0.12, 10, 8), 0xf2c81e, [0, 0.11, 0], [0, 0, 0], [1.15, 0.85, 1]), part(SP(0.075, 8, 6), 0xf2c81e, [0, 0.24, 0.09]), part(B(0.075, 0.022, 0.05), 0xf07a1a, [0, 0.235, 0.17]), part(B(0.05, 0.05, 0.03), 0xf2c81e, [0, 0.14, -0.13])]);
    const glow = merge([part(B(0.02, 0.02, 0.01), 0x101010, [-0.03, 0.265, 0.155]), part(B(0.02, 0.02, 0.01), 0x101010, [0.03, 0.265, 0.155])]);
    const o = finish('duck', lit, glow, { tick: (dt, time, m) => { m.root.children[0].position.y = Math.sin(time * 2 + m.phase) * 0.012; } });
    return o;
  },
  statue() {
    const stone = 0x8f9aa0;
    const lit = merge([
      part(B(0.2, 0.85, 0.22), stone, [-0.12, 0.42, 0]), part(B(0.2, 0.85, 0.22), stone, [0.12, 0.42, 0.06], [0.12, 0, 0]),
      part(B(0.5, 0.62, 0.28), 0xa46a3a, [0, 1.15, 0]), part(B(0.13, 0.55, 0.13), stone, [-0.33, 1.15, 0.05], [0.2, 0, 0]),
      part(B(0.13, 0.45, 0.13), stone, [0.3, 1.5, 0.12], [-1.7, 0, 0]),   // one hand raised over the eyes
      part(B(0.22, 0.24, 0.02), 0xd9d4c4, [0.12, 1.15, 0.15]),          // name tag
    ]);
    const o = finish('statue', lit, null, { col: { hx: 0.32, hy: 0.9, hz: 0.28, y: 0.9 } });
    const head = new THREE.Group(); head.position.set(0, 1.62, 0.02);
    const hg = merge([part(SP(0.16, 8, 6), stone, [0, 0, 0], [0, 0, 0], [1, 1.05, 1]), part(B(0.2, 0.06, 0.02), 0x101418, [0, 0.02, 0.15])]);
    const hgl = merge([part(B(0.12, 0.02, 0.01), 0xff3a2a, [0, 0.02, 0.162])]);
    head.add(new THREE.Mesh(hg, LAM), new THREE.Mesh(hgl, GLOW)); o.geos.push(hg, hgl);
    o.root.add(head); o.head = head; o.headYaw = 0;
    return o;
  },
  payphone() {
    const lit = merge([
      part(B(0.95, 2.1, 0.08), 0x2f5a3a, [0, 1.05, -0.4]), part(B(1.05, 0.08, 0.95), 0x244a2e, [0, 2.14, 0]),
      part(B(0.06, 2.1, 0.9), 0x2f5a3a, [-0.5, 1.05, 0]), part(B(0.06, 2.1, 0.9), 0x2f5a3a, [0.5, 1.05, 0]),
      part(B(0.34, 0.5, 0.14), 0x2a2a2e, [0, 1.25, -0.32]), part(B(0.06, 0.2, 0.06), 0x111114, [-0.13, 1.28, -0.22], [0, 0, 0.2]),
    ]);
    const glow = merge([part(B(0.7, 0.06, 0.3), 0x9ff5ff, [0, 2.06, -0.2]), part(B(0.2, 0.14, 0.01), 0x48ff8a, [0.03, 1.38, -0.245]), part(B(0.16, 0.14, 0.01), 0x9ff5ff, [0, 0.9, -0.34])]);
    return finish('payphone', lit, glow, { col: { hx: 0.55, hy: 1.05, hz: 0.5, y: 1.05 } });
  },
  stash() {
    const lit = merge([
      part(CY(0.22, 0.22, 0.75, 10), 0x3a4a2a, [0, 0.24, 0], [0, 0, Math.PI / 2]), part(B(0.06, 0.4, 0.12), 0x1e2618, [-0.2, 0.28, 0]), part(B(0.06, 0.4, 0.12), 0x1e2618, [0.2, 0.28, 0]),
      part(B(0.5, 0.36, 0.4), 0x6b5030, [0.6, 0.18, 0.15], [0, 0.3, 0]), part(B(0.9, 0.03, 0.8), 0x2a4a5a, [0.1, 0.015, 0.05], [0, 0.2, 0]),
    ]);
    const glow = merge([part(B(0.05, 0.05, 0.01), 0xff5a3a, [0, 0.35, 0.21])]);
    return finish('stash', lit, glow);
  },
};

// shrine: flame cones as their own mesh so the flicker only touches one shared material
BUILD.shrine = ((orig) => () => {
  const o = orig();
  const fg = merge([0, 1, 2].map((i) => { const p = [[-0.28, 0.77, -0.28], [0.28, 0.77, -0.28], [0, 0.77, 0.3]][i]; const g = CO(0.028, 0.08, 5).toNonIndexed(); g.translate(p[0], p[1], p[2]); g.deleteAttribute('uv'); return g; }));
  o.root.add(new THREE.Mesh(fg, FLAME)); o.geos.push(fg);
  o.tick = (dt, time, m) => { const k = 0.75 + 0.25 * Math.sin(time * 9 + m.phase) * Math.sin(time * 5.3 + m.phase * 2); FLAME.color.setRGB(1, 0.62 * k + 0.2, 0.2 * k); };
  return o;
})(BUILD.shrine);

const _tmp = new THREE.Vector3();
/** the frozen employee: looks at nothing while you look at it, turns its head to you while you do not (no damage, ever) */
function statueTick(dt, time, m, ctx) {
  const cam = ctx?.cam; if (!cam || !m.head) return;
  const rp = m.root.position;
  _tmp.set(rp.x - cam.x, 0, rp.z - cam.z);
  const d = _tmp.length();
  if (d > 40 || d < 0.01) return;
  const fwd = ctx.fwd;
  const seen = (fwd.x * _tmp.x + fwd.z * _tmp.z) / d > 0.62;        // roughly inside the view cone
  if (seen) return;                                                   // frozen while watched
  const world = Math.atan2(cam.x - rp.x, cam.z - rp.z) - m.root.rotation.y;   // yaw that faces the viewer, in root space
  let dy = world - m.headYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  m.headYaw += Math.max(-1, Math.min(1, dy)) * Math.min(1, dt * 1.6);
  m.headYaw = Math.max(-1.9, Math.min(1.9, m.headYaw));
  m.head.rotation.y = m.headYaw;
}

/** create a model. Returns { root, col, tick, dispose, ... } (root is positioned / rotated by the caller) */
export function createEggModel(kind, opts = {}) {
  const b = BUILD[kind];
  if (!b) return null;
  const o = b(opts);
  o.kind = kind; o.phase = ((opts.seed | 0) % 628) / 100;
  if (kind === 'statue') o.tick = statueTick;
  o.dispose = () => {
    o.root.removeFromParent();
    for (const g of o.geos) g.dispose();
    for (const m of o.mats || []) m.dispose();
    for (const t of o.texs || []) t.dispose();
  };
  return o;
}
