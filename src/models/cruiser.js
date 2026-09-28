// UPLINK VAN — procedural PSX low-poly model of the crew's buyable 4-seat utility van (the TFG take on
// Lethal Company's Company Cruiser): cab with see-through glass, open cargo bed with a bench, roof satellite
// uplink dish, bull bar, spinning / steering wheels, a steering wheel that turns, head / brake / reverse
// lights (emissive lenses + additive glow sprites — NOT real lights; the entity requests one pooled spot
// light for the beams), a dashboard screen (speed + status) and a flashing roof beacon for the horn.
//
// Local frame: +Y up, forward = -Z (same as the camera), origin = rigid-body centre. With the default
// suspension the body rests ~0.76 m above the ground.
//
// createCruiserModel() -> { root, update(dt, st), setLights(on), setBrake(on), setReverse(on),
//                           setDash(speedKmh, text), setBeacon(on), dispose() }
// Safe to import in Node (canvas textures are only made when `document` exists).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HAS_DOM = typeof document !== 'undefined';

// ---------------------------------------------------------------- layout shared with the entity (src/entities/cruiser.js)
export const VAN = {
  halfW: 1.05, halfL: 2.45,
  restHeight: 0.76,                               // body centre above flat ground at rest
  wheelR: 0.42, wheelW: 0.3, wheelY: -0.1, suspRest: 0.35,
  wheels: [
    { x: -1.0, z: -1.6, front: true },
    { x: 1.0, z: -1.6, front: true },
    { x: -1.0, z: 1.6, front: false },
    { x: 1.0, z: 1.6, front: false },
  ],
  // eye: first-person camera; hip: where the (crouched) avatar feet go for remote viewers; exit: side step-out spot
  seats: [
    { name: 'Driver', eye: [-0.46, 1.16, -0.86], feet: [-0.46, -0.1, -0.78], exit: [-2.05, 0, -0.95], driver: true },
    { name: 'Passenger', eye: [0.46, 1.16, -0.86], feet: [0.46, -0.1, -0.78], exit: [2.05, 0, -0.95] },
    { name: 'Bed seat L', eye: [-0.48, 1.3, 0.22], feet: [-0.48, 0.05, 0.3], exit: [-2.05, 0, 0.35] },
    { name: 'Bed seat R', eye: [0.48, 1.3, 0.22], feet: [0.48, 0.05, 0.3], exit: [2.05, 0, 0.35] },
  ],
  // door handles / interaction points per seat (local)
  doors: [[-1.12, 0.75, -0.95], [1.12, 0.75, -0.95], [-1.1, 0.95, 0.3], [1.1, 0.95, 0.3]],
  bed: { x0: -0.93, x1: 0.93, y0: 0.3, y1: 1.7, z0: -0.4, z1: 2.34 },  // cargo zone incl. the bench top (items here ride along)
  tailgate: [0, 0.8, 2.75],
  // compound collider (half extents, centre, density) — the heavy lower frame keeps the centre of mass low
  colliders: [
    { half: [1.05, 0.3, 2.45], pos: [0, 0, 0], density: 120 },
    { half: [1.02, 0.6, 0.6], pos: [0, 0.9, -1.05], density: 18 },
    { half: [1.0, 0.21, 0.42], pos: [0, 0.51, -2.03], density: 30 },
    { half: [0.06, 0.3, 1.43], pos: [-0.99, 0.6, 1.0], density: 20 },
    { half: [0.06, 0.3, 1.43], pos: [0.99, 0.6, 1.0], density: 20 },
    { half: [1.05, 0.3, 0.06], pos: [0, 0.6, 2.39], density: 20 },
    { half: [0.92, 0.18, 0.41], pos: [0, 0.5, 0.0], density: 20 },     // bed bench
  ],
  headlights: [[-0.72, 0.47, -2.47], [0.72, 0.47, -2.47]],
  taillights: [[-0.9, 0.52, 2.47], [0.9, 0.52, 2.47]],
  exhaust: [-0.7, -0.3, 2.5],
};

// palette (sRGB hex, baked into vertex colors)
const C = {
  paint: 0xc8bf9f, paintDark: 0x9d9478, stripe: 0xd8642b, trim: 0x2a2c2e, metal: 0x7c8388, rust: 0x7a4a2a,
  tire: 0x1b1b1d, hub: 0x9aa0a6, seat: 0x4a3b30, dash: 0x232628, bed: 0x5d5a52, dish: 0xd9d6cc, plate: 0xe8e4d6,
  chrome: 0xb8bcc0, beacon: 0x6a4a10,
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// part: { g, c, p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz] } -> one merged vertex-colored geometry
function bake(parts) {
  let list = [];
  for (const part of parts) {
    const g = part.g;
    const p = part.p || [0, 0, 0], r = part.r || [0, 0, 0], s = part.s || [1, 1, 1];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    _c.setHex(part.c ?? 0xffffff);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    list.push(g);
  }
  list = list.map((g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; });
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!out) throw new Error('cruiser model: merge failed');
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

function canvasTex(bag, w, h, draw) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (!x) return null;
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = c; t.userData.ctx = x;
  bag.texs.push(t);
  return t;
}

let glowTex = null;
function getGlowTex() {
  if (glowTex || !HAS_DOM) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function createCruiserModel() {
  const bag = { geos: [], mats: [], texs: [] };
  const G = (g) => { bag.geos.push(g); return g; };
  const M = (m) => { bag.mats.push(m); return m; };
  const root = new THREE.Group();
  root.name = 'uplinkVan';
  const matVC = M(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const mesh = (geo, mat, parent = root) => { const o = new THREE.Mesh(geo, mat); parent.add(o); return o; };

  // ------------------------------------------------ body shell (one draw call)
  const W = VAN.halfW * 2;
  const parts = [
    // frame / lower body
    { g: box(W, 0.6, 4.9), c: C.paint },
    { g: box(W + 0.04, 0.14, 4.92), c: C.stripe, p: [0, 0.12, 0] },               // orange belt line
    { g: box(W + 0.02, 0.12, 4.94), c: C.trim, p: [0, -0.26, 0] },                // rocker
    // hood + grille
    { g: box(2.0, 0.42, 0.85), c: C.paint, p: [0, 0.51, -2.03] },
    { g: box(1.2, 0.3, 0.04), c: C.trim, p: [0, 0.45, -2.465] },                  // grille
    { g: box(0.14, 0.05, 0.9), c: C.paintDark, p: [0, 0.74, -2.03] },             // hood ridge
    // cab: roof, pillars, lower door panels, back wall (windows are separate glass)
    { g: box(2.04, 0.1, 1.25), c: C.paint, p: [0, 1.5, -1.02] },
    { g: box(0.08, 0.85, 0.08), c: C.paint, p: [-0.98, 1.05, -1.6], r: [-0.35, 0, 0] },   // A pillars (raked)
    { g: box(0.08, 0.85, 0.08), c: C.paint, p: [0.98, 1.05, -1.6], r: [-0.35, 0, 0] },
    { g: box(0.08, 1.2, 0.1), c: C.paint, p: [-0.98, 0.9, -0.45] },                // B pillars
    { g: box(0.08, 1.2, 0.1), c: C.paint, p: [0.98, 0.9, -0.45] },
    { g: box(0.06, 0.5, 1.12), c: C.paint, p: [-1.0, 0.55, -1.03] },               // doors (lower half)
    { g: box(0.06, 0.5, 1.12), c: C.paint, p: [1.0, 0.55, -1.03] },
    { g: box(0.02, 0.45, 0.02), c: C.trim, p: [-1.035, 0.55, -0.48] },             // door seams
    { g: box(0.02, 0.45, 0.02), c: C.trim, p: [1.035, 0.55, -0.48] },
    { g: box(0.08, 0.04, 0.2), c: C.chrome, p: [-1.05, 0.75, -0.62] },             // handles
    { g: box(0.08, 0.04, 0.2), c: C.chrome, p: [1.05, 0.75, -0.62] },
    { g: box(2.0, 0.5, 0.08), c: C.paint, p: [0, 0.55, -0.45] },                   // back wall lower
    { g: box(2.0, 0.18, 0.08), c: C.paint, p: [0, 1.4, -0.45] },                   // back wall header
    { g: box(0.5, 0.52, 0.08), c: C.paint, p: [-0.75, 1.05, -0.45] },              // back wall around rear window
    { g: box(0.5, 0.52, 0.08), c: C.paint, p: [0.75, 1.05, -0.45] },
    // side mirrors
    { g: box(0.05, 0.05, 0.25), c: C.trim, p: [-1.1, 0.95, -1.5], r: [0, 0.3, 0] },
    { g: box(0.08, 0.2, 0.14), c: C.trim, p: [-1.22, 0.98, -1.44] },
    { g: box(0.05, 0.05, 0.25), c: C.trim, p: [1.1, 0.95, -1.5], r: [0, -0.3, 0] },
    { g: box(0.08, 0.2, 0.14), c: C.trim, p: [1.22, 0.98, -1.44] },
    // interior: dashboard, seats, bench, floor
    { g: box(1.9, 0.26, 0.34), c: C.dash, p: [0, 0.8, -1.48] },
    { g: box(1.9, 0.06, 0.2), c: C.trim, p: [0, 0.95, -1.4] },
    { g: box(0.7, 0.14, 0.62), c: C.seat, p: [-0.46, 0.4, -0.8] },                 // driver cushion
    { g: box(0.7, 0.72, 0.14), c: C.seat, p: [-0.46, 0.8, -0.52], r: [0.12, 0, 0] },
    { g: box(0.7, 0.14, 0.62), c: C.seat, p: [0.46, 0.4, -0.8] },                  // passenger
    { g: box(0.7, 0.72, 0.14), c: C.seat, p: [0.46, 0.8, -0.52], r: [0.12, 0, 0] },
    { g: box(0.14, 0.4, 0.28), c: C.trim, p: [0, 0.5, -0.9] },                      // gear tunnel
    { g: box(0.05, 0.25, 0.05), c: C.metal, p: [0, 0.78, -0.95], r: [-0.3, 0, 0] }, // gear stick
    // cargo bed: floor (ribbed), side walls, tailgate, bench
    { g: box(1.9, 0.04, 2.84), c: C.bed, p: [0, 0.32, 0.98] },
    ...[-0.6, -0.2, 0.2, 0.6].map((x) => ({ g: box(0.06, 0.03, 2.8), c: C.metal, p: [x, 0.35, 0.98] })),
    { g: box(0.1, 0.6, 2.86), c: C.paint, p: [-0.99, 0.6, 1.0] },
    { g: box(0.1, 0.6, 2.86), c: C.paint, p: [0.99, 0.6, 1.0] },
    { g: box(0.14, 0.06, 2.9), c: C.trim, p: [-0.99, 0.92, 1.0] },                  // rails
    { g: box(0.14, 0.06, 2.9), c: C.trim, p: [0.99, 0.92, 1.0] },
    { g: box(2.1, 0.6, 0.1), c: C.paintDark, p: [0, 0.6, 2.4] },                   // tailgate
    { g: box(1.2, 0.1, 0.02), c: C.stripe, p: [0, 0.72, 2.455] },
    { g: box(1.84, 0.22, 0.8), c: C.metal, p: [0, 0.43, 0.0] },                    // bed bench base
    { g: box(1.84, 0.14, 0.62), c: C.seat, p: [0, 0.61, 0.1] },                    // bench cushion
    { g: box(1.84, 0.5, 0.1), c: C.seat, p: [0, 0.9, -0.33] },                     // bench back (against the cab)
    // bumpers + bull bar
    { g: box(2.16, 0.18, 0.16), c: C.trim, p: [0, -0.15, -2.52] },
    { g: box(2.16, 0.18, 0.16), c: C.trim, p: [0, -0.15, 2.52] },
    { g: cyl(0.04, 0.04, 0.95, 6), c: C.chrome, p: [-0.55, 0.3, -2.62] },
    { g: cyl(0.04, 0.04, 0.95, 6), c: C.chrome, p: [0.55, 0.3, -2.62] },
    { g: cyl(0.04, 0.04, 1.2, 6), c: C.chrome, p: [0, 0.74, -2.62], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.04, 0.04, 1.2, 6), c: C.chrome, p: [0, 0.2, -2.62], r: [0, 0, Math.PI / 2] },
    // wheel arches (dark flares)
    ...VAN.wheels.map((w) => ({ g: box(0.16, 0.12, 1.12), c: C.trim, p: [w.x * 1.06, 0.2, w.z] })),
    // mud flaps
    ...[-0.9, 0.9].map((x) => ({ g: box(0.3, 0.32, 0.03), c: C.tire, p: [x, -0.4, 2.2] })),
    // exhaust
    { g: cyl(0.06, 0.06, 0.4, 6), c: C.rust, p: VAN.exhaust, r: [Math.PI / 2, 0, 0] },
    // lamp housings
    ...VAN.headlights.map((h) => ({ g: box(0.36, 0.2, 0.06), c: C.trim, p: [h[0], h[1], h[2] + 0.03] })),
    ...VAN.taillights.map((h) => ({ g: box(0.18, 0.26, 0.05), c: C.trim, p: [h[0], h[1], h[2] - 0.02] })),
    // roof: rack + uplink dish + antenna + beacon base
    { g: box(1.7, 0.05, 0.05), c: C.metal, p: [0, 1.62, -1.55] },
    { g: box(1.7, 0.05, 0.05), c: C.metal, p: [0, 1.62, -0.5] },
    { g: box(0.05, 0.05, 1.1), c: C.metal, p: [-0.85, 1.62, -1.02] },
    { g: box(0.05, 0.05, 1.1), c: C.metal, p: [0.85, 1.62, -1.02] },
    ...[[-0.85, -1.55], [0.85, -1.55], [-0.85, -0.5], [0.85, -0.5]].map(([x, z]) => ({ g: box(0.05, 0.1, 0.05), c: C.metal, p: [x, 1.57, z] })),
    { g: cyl(0.05, 0.08, 0.25, 6), c: C.metal, p: [0.35, 1.72, -1.0] },            // dish mast
    { g: new THREE.SphereGeometry(0.42, 10, 4, 0, Math.PI * 2, 0, 0.9), c: C.dish, p: [0.35, 1.98, -0.92], r: [-1.05, 0.4, 0], s: [1, 0.55, 1] },
    { g: cyl(0.015, 0.015, 0.34, 4), c: C.metal, p: [0.35, 2.02, -1.07], r: [-1.05 + Math.PI / 2, 0.4, 0] },
    { g: box(0.06, 0.06, 0.06), c: C.trim, p: [0.37, 2.1, -1.2] },
    { g: cyl(0.012, 0.012, 1.3, 4), c: C.trim, p: [-0.9, 2.2, -0.52] },            // whip antenna
    { g: box(0.16, 0.06, 0.16), c: C.trim, p: [-0.45, 1.58, -1.3] },               // beacon base
  ];
  const shell = mesh(G(bake(parts)), matVC);
  shell.name = 'shell';

  // ------------------------------------------------ glass (see-through from the driver seat)
  const glassMat = M(new THREE.MeshBasicMaterial({ color: 0x9fc3cc, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  const glass = bake([
    { g: new THREE.PlaneGeometry(1.9, 0.78), c: 0xffffff, p: [0, 1.1, -1.72], r: [-0.35, 0, 0] },   // windshield
    { g: new THREE.PlaneGeometry(1.05, 0.52), c: 0xffffff, p: [-1.0, 1.08, -1.0], r: [0, Math.PI / 2, 0] },
    { g: new THREE.PlaneGeometry(1.05, 0.52), c: 0xffffff, p: [1.0, 1.08, -1.0], r: [0, Math.PI / 2, 0] },
    { g: new THREE.PlaneGeometry(1.0, 0.52), c: 0xffffff, p: [0, 1.05, -0.45] },                     // rear window
  ]);
  glass.deleteAttribute('color');
  const glassMesh = mesh(G(glass), glassMat);
  glassMesh.renderOrder = 2;

  // ------------------------------------------------ decals (canvas; browser only)
  const decalMat = (tex) => M(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.2 }));
  const logo = canvasTex(bag, 128, 32, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.font = 'bold 20px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#1e2124'; x.fillText('UPLINK', w / 2 - 8, h / 2 + 1);
    x.fillStyle = '#d8642b'; x.beginPath(); x.arc(w - 18, h / 2, 7, -0.9, 0.9); x.lineWidth = 3; x.strokeStyle = '#d8642b'; x.stroke();
    x.beginPath(); x.arc(w - 18, h / 2, 12, -0.8, 0.8); x.stroke();
  });
  if (logo) {
    const lg = G(new THREE.PlaneGeometry(0.9, 0.23));
    for (const sx of [-1, 1]) {
      const d = mesh(lg, decalMat(logo));
      d.position.set(sx * 1.037, 0.5, -1.02); d.rotation.y = sx * Math.PI / 2;
    }
    const lg2 = G(new THREE.PlaneGeometry(1.6, 0.4));
    for (const sx of [-1, 1]) {
      const d = mesh(lg2, decalMat(logo));
      d.position.set(sx * 1.052, 0.6, 1.0); d.rotation.y = sx * Math.PI / 2;
    }
  }
  const plateTex = canvasTex(bag, 64, 32, (x, w, h) => {
    x.fillStyle = '#e8e4d6'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#222'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
    x.font = 'bold 14px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#1b1b1d'; x.fillText('TFG-404', w / 2, h / 2 + 1);
  });
  if (plateTex) {
    const pl = mesh(G(new THREE.PlaneGeometry(0.44, 0.2)), M(new THREE.MeshLambertMaterial({ map: plateTex })));
    pl.position.set(0, 0.38, 2.456);
    const pf = mesh(G(new THREE.PlaneGeometry(0.44, 0.2)), M(new THREE.MeshLambertMaterial({ map: plateTex })));
    pf.position.set(0, -0.15, -2.605); pf.rotation.y = Math.PI;
  }

  // ------------------------------------------------ dashboard screen (speed / status)
  let dash = null;
  const dashTex = canvasTex(bag, 64, 32, (x, w, h) => { x.fillStyle = '#071008'; x.fillRect(0, 0, w, h); });
  if (dashTex) {
    const dm = mesh(G(new THREE.PlaneGeometry(0.34, 0.17)), M(new THREE.MeshBasicMaterial({ map: dashTex })));
    dm.position.set(-0.46, 0.99, -1.33); dm.rotation.x = -0.55;
    dash = { tex: dashTex, ctx: dashTex.userData.ctx, last: '' };
  }

  // ------------------------------------------------ steering wheel
  const steer = new THREE.Group();
  steer.position.set(-0.46, 1.0, -1.22);
  steer.rotation.x = -0.95;                              // tilted toward the driver
  root.add(steer);
  const steerParts = [
    { g: new THREE.TorusGeometry(0.17, 0.022, 4, 12), c: C.trim },
    { g: box(0.32, 0.03, 0.02), c: C.trim },
    { g: box(0.03, 0.17, 0.02), c: C.trim, p: [0, -0.085, 0] },
    { g: cyl(0.04, 0.04, 0.05, 8), c: C.stripe, r: [Math.PI / 2, 0, 0] },
  ];
  const steerWheel = mesh(G(bake(steerParts)), matVC, steer);
  const column = mesh(G(bake([{ g: cyl(0.025, 0.025, 0.35, 5), c: C.trim, p: [0, 0, -0.17], r: [Math.PI / 2, 0, 0] }])), matVC, steer);
  void column;

  // ------------------------------------------------ wheels (pivot = steer, spin = roll)
  const wheelGeo = G(bake([
    { g: cyl(VAN.wheelR, VAN.wheelR, VAN.wheelW, 10), c: C.tire, r: [0, 0, Math.PI / 2] },
    { g: cyl(VAN.wheelR * 0.55, VAN.wheelR * 0.55, VAN.wheelW + 0.02, 6), c: C.hub, r: [0, 0, Math.PI / 2] },
    { g: box(VAN.wheelW + 0.04, 0.08, VAN.wheelR * 1.05), c: C.trim },          // spoke bar (shows the spin)
    { g: box(VAN.wheelW + 0.04, VAN.wheelR * 1.05, 0.08), c: C.trim },
  ]));
  const wheels = VAN.wheels.map((w) => {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, VAN.wheelY - 0.22, w.z);
    root.add(pivot);
    const spin = mesh(wheelGeo, matVC, pivot);
    return { pivot, spin, front: w.front };
  });

  // ------------------------------------------------ lights: emissive lenses + glow sprites
  const headMat = M(new THREE.MeshBasicMaterial({ color: 0x5a5648 }));
  const tailMat = M(new THREE.MeshBasicMaterial({ color: 0x4a1010 }));
  const revMat = M(new THREE.MeshBasicMaterial({ color: 0x55585a }));
  const beaconMat = M(new THREE.MeshBasicMaterial({ color: C.beacon }));
  const lensG = G(new THREE.BoxGeometry(0.3, 0.14, 0.03));
  const tailG = G(new THREE.BoxGeometry(0.14, 0.12, 0.03));
  const revG = G(new THREE.BoxGeometry(0.14, 0.07, 0.03));
  for (const h of VAN.headlights) { const o = mesh(lensG, headMat); o.position.set(h[0], h[1], h[2] - 0.01); }
  for (const h of VAN.taillights) {
    const o = mesh(tailG, tailMat); o.position.set(h[0], h[1] + 0.05, h[2] + 0.01);
    const r = mesh(revG, revMat); r.position.set(h[0], h[1] - 0.08, h[2] + 0.01);
  }
  const beacon = mesh(G(cyl(0.07, 0.08, 0.12, 8)), beaconMat);
  beacon.position.set(-0.45, 1.67, -1.3);

  const glows = [];
  const gt = getGlowTex();
  const mkGlow = (pos, color, size) => {
    if (!gt) return null;
    const sm = M(new THREE.SpriteMaterial({ map: gt, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    const sp = new THREE.Sprite(sm);
    sp.position.set(pos[0], pos[1], pos[2]);
    sp.scale.setScalar(size);
    root.add(sp);
    glows.push(sp);
    return sp;
  };
  const headGlow = VAN.headlights.map((h) => mkGlow([h[0], h[1], h[2] - 0.08], 0xfff2cc, 0.9));
  const tailGlow = VAN.taillights.map((h) => mkGlow([h[0], h[1] + 0.05, h[2] + 0.06], 0xff2a1a, 0.45));
  const beaconGlow = mkGlow([-0.45, 1.72, -1.3], 0xffa020, 0.7);

  let lightsOn = false, brakeOn = false, revOn = false, beaconOn = false, beaconT = 0;
  const applyLamps = () => {
    headMat.color.setHex(lightsOn ? 0xfff6dc : 0x5a5648);
    tailMat.color.setHex(brakeOn ? 0xff2a1a : lightsOn ? 0xb01810 : 0x4a1010);
    revMat.color.setHex(revOn ? 0xf4f4f0 : 0x55585a);
    for (const g of headGlow) if (g) g.material.opacity = lightsOn ? 0.85 : 0;
    for (const g of tailGlow) if (g) g.material.opacity = brakeOn ? 0.95 : lightsOn ? 0.45 : 0;
  };
  applyLamps();

  const api = {
    root, wheels, steer, steerWheel,
    setLights(on) { if (on !== lightsOn) { lightsOn = on; applyLamps(); } },
    setBrake(on) { if (on !== brakeOn) { brakeOn = on; applyLamps(); } },
    setReverse(on) { if (on !== revOn) { revOn = on; applyLamps(); } },
    setBeacon(on) { beaconOn = on; },
    // st: { steer (rad), spin[4] (rad), susp[4] (m below the rest position, + = extended) }
    update(dt, st = {}) {
      const s = st.steer || 0;
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        if (w.front) w.pivot.rotation.y = s;
        w.spin.rotation.x = st.spin ? st.spin[i] : 0;
        if (st.susp) w.pivot.position.y = VAN.wheelY - st.susp[i];
      }
      steerWheel.rotation.z = -s * 3.2;
      beaconT += dt;
      const on = beaconOn && Math.sin(beaconT * 14) > 0;
      beaconMat.color.setHex(on ? 0xffb030 : C.beacon);
      if (beaconGlow) beaconGlow.material.opacity = on ? 0.9 : 0;
    },
    setDash(kmh, text) {
      if (!dash) return;
      const key = Math.round(kmh) + '|' + text;
      if (key === dash.last) return;
      dash.last = key;
      const x = dash.ctx;
      x.fillStyle = '#071008'; x.fillRect(0, 0, 64, 32);
      x.fillStyle = '#58ff8a'; x.font = 'bold 14px monospace'; x.textAlign = 'left'; x.textBaseline = 'top';
      x.fillText(String(Math.round(kmh)).padStart(3, ' '), 2, 2);
      x.font = '8px monospace'; x.fillText('KM/H', 36, 5);
      x.fillStyle = text === 'UPLINK OK' ? '#58ff8a' : '#ffb030';
      x.fillText(String(text || '').slice(0, 12), 2, 20);
      dash.tex.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      for (const g of bag.geos) g.dispose();
      for (const m of bag.mats) m.dispose();
      for (const t of bag.texs) t.dispose();
    },
  };
  return api;
}
