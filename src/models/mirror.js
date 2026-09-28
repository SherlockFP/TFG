// MIRROR DIMENSION models: the ornate portal mirror (black + silver frame, rippling dark surface shader), the three dimension
// creatures (ghost, flame fiend, mirror copy) and the faint silhouette shown for players in the other dimension.
// Everything is cheap on purpose: shared geometry + shared materials (no per-creature clones), one mesh per body part.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** clone `geo`, bake a transform + a flat vertex colour into it */
function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  g.applyMatrix4(_m4.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2])));
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const merged = (list) => { const g = mergeGeometries(list, false); for (const x of list) x.dispose(); return g; };

const cache = { geo: new Map(), mat: new Map() };
const geo = (k, make) => { let g = cache.geo.get(k); if (!g) { g = make(); cache.geo.set(k, g); } return g; };
const mat = (k, make) => { let m = cache.mat.get(k); if (!m) { m = make(); cache.mat.set(k, m); } return m; };
/** free the shared geometry / materials (game teardown) */
export function disposeMirrorModels() { for (const g of cache.geo.values()) g.dispose(); for (const m of cache.mat.values()) m.dispose(); cache.geo.clear(); cache.mat.clear(); }

const noop = () => {};
function shell(root, height, radius, extra = {}) {
  return { root, parts: {}, height, radius, update: noop, setElite: noop, setHitFlash: noop, setTint: noop, dispose: noop, ...extra };
}
const TAU = Math.PI * 2;
const seedRand = (seed) => { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ================================================================================================ portal
export const PORTAL = { W: 2.9, H: 4.5, openW: 2.2, openH: 3.5 };

const SURF_VS = `
varying vec2 vUv; uniform float uT;
void main() {
  vUv = uv; vec3 p = position;
  p.z += sin(p.y * 3.0 + uT * 1.6) * 0.02 + sin(p.x * 4.0 - uT * 1.1) * 0.015;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const SURF_FS = `
precision highp float;
varying vec2 vUv; uniform float uT; uniform float uPulse;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p * vec2(0.8, 0.5));
  float rip = sin(r * 22.0 - uT * 2.4) * 0.5 + 0.5;
  float rip2 = sin(p.x * 3.0 + p.y * 5.0 + uT * 0.9) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.015, 0.0, 0.04), vec3(0.09, 0.0, 0.17), rip * 0.6 + rip2 * 0.4);
  float g = pow(h(floor(vUv * vec2(24.0, 40.0)) + floor(uT * 3.0)), 18.0);
  c += vec3(0.6, 0.55, 0.9) * g * 0.8;
  float e = smoothstep(0.7, 1.0, max(abs(p.x), abs(p.y)));
  c += vec3(0.35, 0.05, 0.4) * e * (0.5 + 0.3 * sin(uT * 2.0));
  c += vec3(0.5, 0.1, 0.6) * uPulse * rip * 0.6;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Portal mirror. Origin = bottom centre of the base, the surface faces +Z. update(t, pulse 0..1) animates the surface. */
export function createPortalMirror() {
  const root = new THREE.Group();
  root.name = 'mirror-portal';
  const BLACK = 0x0e0e14, DARK = 0x1a1a24, SILVER = 0xc4c8d8, BRIGHT = 0xeef0ff;
  const oct = new THREE.OctahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 1, 4);
  const L = [];
  for (const s of [-1, 1]) {
    L.push(part(box(0.36, 4.0, 0.55), BLACK, [s * 1.28, 2.25, 0]));                      // posts
    L.push(part(box(0.08, 3.5, 0.6), SILVER, [s * 1.09, 2.2, 0]));                       // inner silver trim
    L.push(part(box(0.5, 0.22, 0.7), DARK, [s * 1.28, 0.36, 0]));                        // post feet
    L.push(part(box(0.1, 3.8, 0.4), DARK, [s * 1.46, 2.25, 0]));                         // outer rib
    L.push(part(oct, BRIGHT, [s * 1.28, 4.5, 0], [0, 0.4, 0], [0.2, 0.28, 0.2]));        // finials
    for (let i = 0; i < 6; i++) L.push(part(oct, SILVER, [s * 1.28, 0.95 + i * 0.55, 0.3], [0, 0, 0], [0.09, 0.14, 0.05]));   // studs
    for (let i = 0; i < 3; i++) L.push(part(cone, SILVER, [s * (1.42 + i * 0.06), 3.7 + i * 0.28, 0], [0, 0.78, s * -0.3], [0.09, 0.32, 0.09]));   // thorns
  }
  L.push(part(box(3.0, 0.42, 0.55), BLACK, [0, 4.25, 0]));                                // lintel
  L.push(part(box(2.3, 0.08, 0.6), SILVER, [0, 4.0, 0]));
  L.push(part(box(3.3, 0.24, 0.95), DARK, [0, 0.12, 0]));                                 // base slab
  L.push(part(box(3.4, 0.05, 1.0), SILVER, [0, 0.26, 0]));
  L.push(part(box(0.5, 0.5, 0.6), BLACK, [0, 4.6, 0], [0, 0, Math.PI / 4]));              // crown diamond
  L.push(part(cone, BRIGHT, [0, 5.0, 0], [0, 0.78, 0], [0.16, 0.8, 0.16]));
  for (const s of [-1, 1]) L.push(part(cone, SILVER, [s * 0.7, 4.75, 0], [0, 0.78, 0], [0.11, 0.5, 0.11]));
  L.push(part(oct, SILVER, [0, 4.25, 0.3], [0, 0, 0], [0.16, 0.22, 0.08]));
  const frameGeo = merged(L);
  const frameMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x16102a });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  root.add(frame);
  const sg = new THREE.PlaneGeometry(PORTAL.openW, PORTAL.openH, 16, 24);
  const sm = new THREE.ShaderMaterial({ vertexShader: SURF_VS, fragmentShader: SURF_FS, uniforms: { uT: { value: 0 }, uPulse: { value: 0 } } });
  const surface = new THREE.Mesh(sg, sm);
  surface.position.set(0, 0.26 + PORTAL.openH / 2 + 0.1, 0);
  surface.frustumCulled = false;
  root.add(surface);
  return {
    root, surface, size: PORTAL,
    // static collider boxes (local space: x, y, z, hx, hy, hz) so the frame is solid; the opening between the posts stays walkable
    colliderBoxes: [[-1.32, 2.2, 0, 0.3, 2.2, 0.35], [1.32, 2.2, 0, 0.3, 2.2, 0.35], [0, 0.12, 0, 1.65, 0.14, 0.48]],
    update(t, pulse = 0) { sm.uniforms.uT.value = t; sm.uniforms.uPulse.value = pulse; },
    dispose() { frameGeo.dispose(); frameMat.dispose(); sg.dispose(); sm.dispose(); oct.dispose(); cone.dispose(); root.removeFromParent(); },
  };
}

// ================================================================================================ ghost
const GHOST_MAT = () => mat('ghost', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }));
function ghostModel(opts = {}) {
  const g = geo('ghost', () => merged([
    part(new THREE.ConeGeometry(0.42, 1.15, 7), 0xb9a6ff, [0, 0.62, 0], [Math.PI, 0, 0]),
    part(new THREE.IcosahedronGeometry(0.38, 0), 0xd8ccff, [0, 1.3, 0], [0, 0, 0], [1, 1.08, 1]),
    part(box(0.12, 0.16, 0.06), 0x05000c, [-0.15, 1.34, 0.34]), part(box(0.12, 0.16, 0.06), 0x05000c, [0.15, 1.34, 0.34]),
    part(box(0.16, 0.2, 0.06), 0x05000c, [0, 1.06, 0.34]),
    part(box(0.1, 0.5, 0.1), 0x9a86f0, [-0.5, 0.95, 0.1], [0, 0, 0.5]), part(box(0.1, 0.5, 0.1), 0x9a86f0, [0.5, 0.95, 0.1], [0, 0, -0.5]),
  ]));
  const body = new THREE.Mesh(g, GHOST_MAT());
  const root = new THREE.Group(); root.add(body);
  const R = seedRand((opts.seed || 1) * 31 + 7), ph = R() * TAU;
  return shell(root, 1.75, 0.45, {
    update(dt, a = {}) {
      const t = (a.time || 0) + ph, dead = a.state === 'dead';
      body.position.y = 0.35 + Math.sin(t * 2.1) * 0.12;
      body.rotation.z = Math.sin(t * 1.3) * 0.09; body.rotation.x = a.state === 'attack' ? -0.45 : 0.08;
      const k = dead ? Math.max(0, 1 - (a.t || 0) * 3) : 1;
      body.scale.set(k * (1 + Math.sin(t * 3) * 0.04), k, k * (a.state === 'attack' ? 1.35 : 1));
    },
    setElite(b) { root.scale.setScalar(b ? 1.25 : 1); },
  });
}

// ================================================================================================ flame fiend
function fiendModel(opts = {}) {
  const body = new THREE.Mesh(geo('fiend', () => merged([
    part(box(0.72, 0.9, 0.5), 0x2a1616, [0, 0.98, 0]), part(box(0.5, 0.46, 0.46), 0x1c0e0e, [0, 1.68, 0.02]),
    part(box(0.24, 0.62, 0.28), 0x241212, [-0.19, 0.31, 0]), part(box(0.24, 0.62, 0.28), 0x241212, [0.19, 0.31, 0]),
    part(box(0.2, 0.86, 0.24), 0x2e1a1a, [-0.5, 0.95, 0.1], [0.35, 0, 0.1]), part(box(0.2, 0.86, 0.24), 0x2e1a1a, [0.5, 0.95, 0.1], [0.35, 0, -0.1]),
    part(new THREE.ConeGeometry(0.09, 0.4, 4), 0x120808, [-0.17, 2.05, 0], [0, 0, 0.35]), part(new THREE.ConeGeometry(0.09, 0.4, 4), 0x120808, [0.17, 2.05, 0], [0, 0, -0.35]),
  ])), mat('fiend', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x2a0a02 })));
  const glow = new THREE.Mesh(geo('fiendGlow', () => merged([
    part(new THREE.ConeGeometry(0.42, 1.1, 6), 0xff7a1a, [0, 1.65, -0.32], [-0.25, 0, 0]),
    part(new THREE.ConeGeometry(0.26, 0.8, 5), 0xffd060, [0, 1.55, -0.3], [-0.25, 0, 0]),
    part(box(0.12, 0.08, 0.05), 0xffe080, [-0.12, 1.7, 0.27]), part(box(0.12, 0.08, 0.05), 0xffe080, [0.12, 1.7, 0.27]),
    part(box(0.5, 0.06, 0.05), 0xff6a10, [0, 1.15, 0.26]), part(box(0.06, 0.4, 0.05), 0xff6a10, [0, 0.95, 0.26]),
  ])), mat('fiendGlow', () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
  const root = new THREE.Group(); root.add(body, glow);
  const ph = seedRand((opts.seed || 1) * 17 + 3)() * TAU;
  return shell(root, 2.1, 0.48, {
    update(dt, a = {}) {
      const t = (a.time || 0) * 9 + ph, moving = a.state === 'run' || a.state === 'walk';
      body.rotation.z = moving ? Math.sin(t) * 0.07 : 0; body.position.y = moving ? Math.abs(Math.sin(t)) * 0.06 : 0;
      glow.rotation.z = body.rotation.z; glow.position.y = body.position.y;
      glow.scale.set(1, 1 + Math.sin(t * 1.7) * 0.12 + (a.state === 'attack' ? 0.3 : 0), 1);
      if (a.state === 'dead') { root.rotation.x = Math.min(1.5, (a.t || 0) * 3); glow.visible = (a.t || 0) < 0.4; }
    },
    setElite(b) { root.scale.setScalar(b ? 1.3 : 1); },
  });
}

// ================================================================================================ mirror copy (crew look-alike)
const COPY_SUITS = [0xd9642b, 0x3aa0ff, 0x4ecb5a, 0xb35cff, 0xff4f6a, 0xe8e8f0];
function copyModel(opts = {}) {
  const si = ((opts.seed || 1) >>> 0) % COPY_SUITS.length;
  const upperGeo = geo('copyUp' + si, () => merged([
    part(box(0.52, 0.72, 0.3), COPY_SUITS[si], [0, 1.08, 0]), part(box(0.56, 0.1, 0.32), 0xc9c6dc, [0, 0.74, 0]),
    part(box(0.36, 0.36, 0.32), 0xd4d2ea, [0, 1.66, 0]), part(box(0.3, 0.09, 0.05), 0x05000c, [0, 1.7, 0.17]),
  ]));
  const limb = (k, w, h, c) => geo(k, () => { const g = part(box(w, h, w), c, [0, -h / 2, 0]); return g; });
  const M = mat('copy', () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1a0c30 }));
  const up = new THREE.Mesh(upperGeo, M);
  const armG = limb('copyArm', 0.15, 0.66, 0x3a3450), legG = limb('copyLeg', 0.19, 0.78, 0x24202f);
  const aL = new THREE.Mesh(armG, M), aR = new THREE.Mesh(armG, M), lL = new THREE.Mesh(legG, M), lR = new THREE.Mesh(legG, M);
  aL.position.set(-0.36, 1.4, 0); aR.position.set(0.36, 1.4, 0); lL.position.set(-0.14, 0.78, 0); lR.position.set(0.14, 0.78, 0);
  const root = new THREE.Group(); root.add(up, aL, aR, lL, lR);
  const ph = seedRand((opts.seed || 1) * 13 + 5)() * TAU;
  return shell(root, 1.85, 0.36, {
    update(dt, a = {}) {
      const moving = a.state === 'run' || a.state === 'walk', t = (a.time || 0) * 10 + ph, s = moving ? Math.sin(t) * 0.7 : 0;
      lL.rotation.x = s; lR.rotation.x = -s; aL.rotation.x = -s * 0.8; aR.rotation.x = s * 0.8;
      if (a.state === 'attack') { aL.rotation.x = aR.rotation.x = -1.7 + Math.sin((a.t || 0) * 14) * 0.3; }
      if (a.state === 'dead') root.rotation.x = -Math.min(1.5, (a.t || 0) * 3);
    },
    setElite(b) { root.scale.setScalar(b ? 1.2 : 1); },
  });
}

export const MIRROR_CREATURE_MODELS = { mr_ghost: ghostModel, mr_fiend: fiendModel, mr_copy: copyModel };

// ================================================================================================ silhouette of a player in the other dimension
export function createSilhouette() {
  const g = geo('sil', () => merged([
    part(new THREE.CapsuleGeometry(0.3, 0.9, 3, 8), 0xffffff, [0, 0.85, 0]), part(new THREE.SphereGeometry(0.24, 8, 6), 0xffffff, [0, 1.62, 0]),
  ]));
  const m = mat('silhouette', () => new THREE.MeshBasicMaterial({ color: 0x9a7bff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 3;
  return mesh;
}
