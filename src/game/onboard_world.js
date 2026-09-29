// ONBOARD world (wave 5, MASTERPLAN 25.1): the "Hiring Day" set - Cell 07, the orientation corridor and the hangar with the Mini-Skeld - built as
// COMPACT MERGED GEOMETRY (one vertex-coloured mesh with baked light pools, one self-lit mesh, a few dynamic parts) and static Rapier boxes.
// NO THREE lights are ever added (constant scene light count, docs/HANDOFF.md 4): the "lights" are baked into the vertex colours and the lamp panels are
// emissive; the blackout swaps the main material MeshBasic (lit) -> MeshLambert (dark, only the flashlight shows it) and dims the emissive mesh.
// The wing is built far away from the ship (ORIGIN) and disposed as soon as the player boards. Local coordinates: floor y = 0, the route runs towards -z.
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { x as tx } from './onboard_text.js';

export const ORIGIN = { x: 1600, y: 0, z: 0 };
export const CORR = { x0: -1.6, x1: 1.6, zStart: -7.0, zEnd: -58.0, h: 3.0 };
export const SHUTTER = { trigger: -21.0, z: -35.0 };   // the sprint challenge: cross the trigger line, the shutter drops 2.2 s later
export const START = { x: 0, z: -2.2, yaw: 0 };

const C = {
  wall: 0xb9c2b0, wain: 0x3f5a55, floor: 0x5b605d, ceil: 0x8e948c, dark: 0x2a2e30, metal: 0x6f777c, yellow: 0xe2b52f, black: 0x1b1c1e,
  wood: 0x7a5a3c, bed: 0x556b7a, locker: 0x7d8f96, crate: 0x8a6a3e, hull: 0xd7d2c4, orange: 0xd9642b, red: 0xc0392b, green: 0x39c46a,
};
const L_AMB = 0.42;

function makeMesher() { return { p: [], c: [], i: [], n: 0 }; }
function bake(m) {
  if (!m.n) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(m.c, 3));
  g.setIndex(m.i);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** build the whole set. deps = { game }. Returns the API used by onboard.js (all positions in WORLD coordinates unless noted). */
export function buildWing(game) {
  const { physics, scene } = game;
  const O = new THREE.Vector3(ORIGIN.x, ORIGIN.y, ORIGIN.z);
  const group = new THREE.Group();
  group.position.copy(O);
  group.name = 'onboard-wing';
  const main = makeMesher(), emis = makeMesher();
  const lamps = [];          // baked light pools: { x, y, z, r, i } (local)
  const colliders = [];
  const disposables = [];    // geometries / materials / textures to free
  const dyn = [];            // per-frame callbacks
  const track = (o) => { disposables.push(o); return o; };
  const W = (x, y, z) => new THREE.Vector3(x + O.x, y + O.y, z + O.z);

  // ------------------------------------------------------------------------------------------ baking helpers
  const shade = (px, py, pz, nx, ny, nz) => {
    let v = L_AMB + (ny > 0.5 ? 0.07 : ny < -0.5 ? -0.1 : 0) + (Math.abs(nx) > 0.5 ? -0.04 : 0);
    for (const l of lamps) {
      const dx = l.x - px, dy = l.y - py, dz = l.z - pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= l.r) continue;
      const f = 1 - d / l.r;
      const cosA = d > 1e-4 ? Math.max(0, (nx * dx + ny * dy + nz * dz) / d) : 1;
      v += l.i * f * f * (0.3 + 0.7 * cosA);
    }
    return v;
  };
  const col = new THREE.Color();
  function grid(m, ox, oy, oz, ux, uy, uz, vx, vy, vz, nx, ny, nz, color, cell, lit, checker) {
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
    const nu = Math.max(1, Math.ceil(lu / cell)), nv = Math.max(1, Math.ceil(lv / cell));
    const base = m.n;
    col.set(color);
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const a = i / nu, b = j / nv;
        const px = ox + ux * a + vx * b, py = oy + uy * a + vy * b, pz = oz + uz * a + vz * b;
        m.p.push(px, py, pz);
        let k = lit ? shade(px, py, pz, nx, ny, nz) : 1;
        if (checker) k *= 1 + (((i + j) & 1) ? 0.05 : -0.03);
        m.c.push(Math.min(1.4, col.r * k), Math.min(1.4, col.g * k), Math.min(1.4, col.b * k));
        m.n++;
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      m.i.push(a, b, d, a, d, c);
    }
  }
  function box(m, x0, y0, z0, x1, y1, z1, color, o = {}) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, cell = o.cell || 1.5, lit = o.lit !== false, ck = !!o.checker;
    if (!o.noPX) grid(m, x1, y0, z0, 0, dy, 0, 0, 0, dz, 1, 0, 0, color, cell, lit, false);
    if (!o.noNX) grid(m, x0, y0, z0, 0, 0, dz, 0, dy, 0, -1, 0, 0, color, cell, lit, false);
    if (!o.noPY) grid(m, x0, y1, z0, 0, 0, dz, dx, 0, 0, 0, 1, 0, color, cell, lit, ck);
    if (!o.noNY) grid(m, x0, y0, z0, dx, 0, 0, 0, 0, dz, 0, -1, 0, color, cell, lit, false);
    if (!o.noPZ) grid(m, x0, y0, z1, dx, 0, 0, 0, dy, 0, 0, 0, 1, color, cell, lit, false);
    if (!o.noNZ) grid(m, x0, y0, z0, 0, dy, 0, dx, 0, 0, 0, 0, -1, color, cell, lit, false);
  }
  const addCollider = (x0, y0, z0, x1, y1, z1, data) => {
    const c = physics.addStaticBox((x0 + x1) / 2 + O.x, (y0 + y1) / 2 + O.y, (z0 + z1) / 2 + O.z, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, G.STATIC, data || { kind: 'static' });
    colliders.push(c);
    return c;
  };
  /** visible + solid */
  const solid = (x0, y0, z0, x1, y1, z1, color, o) => { box(main, x0, y0, z0, x1, y1, z1, color, o); addCollider(x0, y0, z0, x1, y1, z1); };
  const vis = (x0, y0, z0, x1, y1, z1, color, o) => box(main, x0, y0, z0, x1, y1, z1, color, o);
  const glow = (x0, y0, z0, x1, y1, z1, color, o) => box(emis, x0, y0, z0, x1, y1, z1, color, { lit: false, cell: 99, ...o });
  const lamp = (x, y, z, r = 6.5, i = 0.55, w = 1.3, d = 0.5) => {
    lamps.push({ x, y, z, r, i });
    glow(x - w / 2, y - 0.06, z - d / 2, x + w / 2, y, z + d / 2, 0xfff0c8);
  };

  // ------------------------------------------------------------------------------------------ lamps first (they are baked into everything after)
  lamp(0, 2.95, -4, 7, 0.5);
  for (const z of [-10, -17, -24, -31, -38, -45, -52]) lamp(0, 2.95, z, 6.5, 0.55);
  lamp(-4, 2.95, -40.5, 5, 0.5); lamp(4, 2.95, -40.5, 5, 0.5);
  for (const [x, z] of [[-8, -66], [8, -66], [-8, -86], [8, -86], [0, -76]]) lamp(x, 8.9, z, 13, 0.6, 3.5, 0.8);
  lamp(0, 2.95, -61, 7, 0.4);

  // ------------------------------------------------------------------------------------------ shells (floors, ceilings, walls)
  const T = 0.3;
  const floor = (x0, z0, x1, z1) => solid(x0, -0.4, z0, x1, 0, z1, C.floor, { checker: true, noNY: true, cell: 1.5 });
  const ceil = (x0, z0, x1, z1, y = 3.0) => solid(x0, y, z0, x1, y + T, z1, C.ceil, { noPY: true, cell: 2 });
  const wall = (x0, z0, x1, z1, y0 = 0, y1 = 3.3) => {
    solid(x0, y0, z0, x1, y1, z1, C.wall, { cell: 1.5 });
    if (y0 <= 0.01) {   // dark wainscot band on both faces
      const wx = x1 - x0 < z1 - z0;
      if (wx) { vis(x0 - 0.02, 0, z0, x0, 0.9, z1, C.wain, { noNX: true, noPX: true, noPY: false, cell: 1.5 }); vis(x1, 0, z0, x1 + 0.02, 0.9, z1, C.wain, { noNX: true, noPX: true, cell: 1.5 }); }
      else { vis(x0, 0, z0 - 0.02, x1, 0.9, z0, C.wain, { noNZ: true, noPZ: true, cell: 1.5 }); vis(x0, 0, z1, x1, 0.9, z1 + 0.02, C.wain, { noNZ: true, noPZ: true, cell: 1.5 }); }
    }
  };
  // Cell 07 (interior x -3..3, z -7..-1)
  floor(-3.3, -7.3, 3.3, -0.7); ceil(-3.3, -7.3, 3.3, -0.7);
  wall(-3.3, -1.0, 3.3, -0.7); wall(-3.3, -7.3, -3.0, -0.7); wall(3.0, -7.3, 3.3, -0.7);
  wall(-3.3, -7.3, -0.8, -7.0); wall(0.8, -7.3, 3.3, -7.0); wall(-0.8, -7.3, 0.8, -7.0, 2.5, 3.3);
  // corridor (interior x -1.6..1.6, z -7..-58) with alcoves on both sides at z -37..-44
  floor(-1.9, -58.3, 1.9, -7.3); ceil(-1.9, -58.3, 1.9, -7.3);
  wall(-1.9, -36.7, -1.6, -7.0); wall(-1.9, -58.0, -1.6, -44.3);
  wall(1.6, -36.7, 1.9, -7.0); wall(1.6, -58.0, 1.9, -44.3);
  for (const s of [-1, 1]) {   // alcoves (locker room left, break room right)
    const xa = s < 0 ? -6.3 : 1.9, xb = s < 0 ? -1.9 : 6.3;
    floor(xa, -44.3, xb, -36.7); ceil(xa, -44.3, xb, -36.7);
    wall(xa, -37.0, xb, -36.7); wall(xa, -44.3, xb, -44.0);
    wall(s < 0 ? -6.3 : 6.0, -44.3, s < 0 ? -6.0 : 6.3, -36.7);
  }
  // hangar (interior x -15..15, z -58.3..-100, height 9)
  const HH = 9;
  floor(-15.3, -100.3, 15.3, -58.3); ceil(-15.3, -100.3, 15.3, -58.3, HH);
  wall(-15.3, -100.3, -15.0, -58.0, 0, HH + T); wall(15.0, -100.3, 15.3, -58.0, 0, HH + T); wall(-15.3, -100.3, 15.3, -100.0, 0, HH + T);
  wall(-15.3, -58.3, -1.3, -58.0, 0, HH + T); wall(1.3, -58.3, 15.3, -58.0, 0, HH + T); wall(-1.3, -58.3, 1.3, -58.0, 2.7, HH + T);
  // door frames (dark trim around the three doorways)
  for (const z of [-7.15, -58.15]) { vis(-1.0, 0, z - 0.2, -0.8, 2.6, z + 0.2, C.dark); vis(0.8, 0, z - 0.2, 1.0, 2.6, z + 0.2, C.dark); }
  vis(-1.4, 0, -58.35, -1.3, 2.75, -57.95, C.dark); vis(1.3, 0, -58.35, 1.4, 2.75, -57.95, C.dark);

  // ------------------------------------------------------------------------------------------ Cell 07 dressing
  solid(-2.9, 0, -2.7, -1.2, 0.5, -1.05, C.bed); vis(-2.9, 0.5, -2.7, -1.2, 0.62, -1.05, 0x8a9aa6); vis(-2.85, 0.62, -1.5, -2.35, 0.74, -1.1, 0xd8d6cf);   // cot, mattress, pillow
  solid(1.6, 0, -3.3, 2.95, 0.82, -1.2, C.wood);                                                                                                   // desk
  solid(2.1, 0.82, -2.9, 2.85, 1.3, -2.3, C.dark);                                                                                                 // CRT
  vis(1.7, 0.82, -1.8, 1.95, 0.84, -1.55, 0xf2e58a);                                                                                              // sticky note
  vis(-2.9, 0.02, -6.4, 2.9, 0.06, -6.0, C.yellow, { cell: 3, lit: false });                                                                      // hazard line in front of the door
  for (let k = 0; k < 12; k++) vis(-2.9 + k * 0.5, 0.02, -6.4, -2.9 + k * 0.5 + 0.25, 0.07, -6.0, C.black, { cell: 3, lit: false });
  // ------------------------------------------------------------------------------------------ corridor dressing
  for (const z of [-9, -24, -32, -50]) { vis(-1.6, 2.6, z - 0.15, 1.6, 3.0, z + 0.15, C.metal, { noPY: true }); }                                   // ceiling ribs
  for (let z = -8; z > -57; z -= 3) { vis(-1.6, 0.9, z - 0.04, -1.55, 1.0, z + 0.04, C.yellow, { lit: false, cell: 3 }); vis(1.55, 0.9, z - 0.04, 1.6, 1.0, z + 0.04, C.yellow, { lit: false, cell: 3 }); }
  // low duct (the CROUCH obstacle): bottom at 1.3 m -> crouching (1.12 m) fits, standing (1.8 m) does not
  solid(-1.6, 1.3, -15.5, 1.6, 3.0, -13.0, C.metal);
  vis(-1.6, 1.3, -15.52, 1.6, 1.42, -12.98, C.yellow, { lit: false, cell: 3 });
  for (let k = 0; k < 8; k++) vis(-1.6 + k * 0.4, 1.3, -15.53, -1.6 + k * 0.4 + 0.2, 1.42, -12.97, C.black, { lit: false, cell: 3 });
  // sprint trigger line (yellow / black strip on the floor) + arrows
  vis(-1.6, 0.02, SHUTTER.trigger - 0.25, 1.6, 0.06, SHUTTER.trigger + 0.25, C.yellow, { cell: 3, lit: false });
  for (let k = 0; k < 8; k++) vis(-1.6 + k * 0.4, 0.02, SHUTTER.trigger - 0.25, -1.6 + k * 0.4 + 0.2, 0.07, SHUTTER.trigger + 0.25, C.black, { cell: 3, lit: false });
  for (const z of [-26, -29, -32]) { vis(-0.35, 0.02, z - 0.3, 0.35, 0.05, z + 0.3, C.yellow, { lit: false, cell: 3 }); }
  // locker room (left alcove): six lockers along the west wall; nr. 4 is "07" (dynamic door below)
  for (let k = 0; k < 6; k++) {
    const z0 = -43.0 + k * 0.85;
    solid(-6.0, 0, z0, -5.4, 2.0, z0 + 0.8, C.locker);
    if (k !== 3) { vis(-5.4, 0.05, z0 + 0.03, -5.37, 1.95, z0 + 0.77, 0x8d9ea5, { cell: 3 }); vis(-5.38, 1.5, z0 + 0.1, -5.36, 1.6, z0 + 0.7, C.dark, { cell: 3, lit: false }); }
  }
  solid(-4.4, 0, -42.6, -3.2, 0.45, -41.9, C.wood);   // bench
  // break room (right alcove): desk with a dead monitor, a chair, a plant
  solid(4.3, 0, -42.6, 5.9, 0.82, -38.4, C.wood);
  solid(5.3, 0.82, -41.8, 5.85, 1.2, -41.2, C.dark);
  solid(3.4, 0, -40.9, 3.95, 0.5, -40.3, C.dark); vis(3.35, 0.5, -41.0, 3.4, 1.0, -40.2, C.dark);
  solid(3.2, 0, -43.7, 3.7, 0.7, -43.2, 0x3f7a45);
  // filing cabinet (the lockpick tutorial) on the corridor's east wall
  solid(0.85, 0, -53.6, 1.6, 2.1, -50.6, 0x6a7078);
  for (let k = 0; k < 4; k++) vis(0.82, 0.12 + k * 0.5, -53.4, 0.85, 0.5 + k * 0.5, -50.8, 0x818891, { cell: 3 });
  for (let k = 0; k < 4; k++) glow(0.8, 0.3 + k * 0.5, -52.3, 0.85, 0.36 + k * 0.5, -51.9, 0x1d1d1d);
  // ------------------------------------------------------------------------------------------ hangar dressing
  for (const x of [-12, -6, 6, 12]) { solid(x - 0.5, 0, -62.5, x + 0.5, 6, -61.5, C.metal); vis(x - 0.6, 5.6, -63, x + 0.6, 6.2, -61, C.yellow, { lit: false }); }   // pillars near the door
  for (let k = 0; k < 6; k++) vis(-15, 6.5, -60 - k * 7, 15, 6.8, -60.3 - k * 7, C.dark, { noPY: true, cell: 4 });                                        // gantry beams
  // safety rectangle round the ship
  for (const [a, b, c2, d2] of [[-8, -72, 8, -71.6], [-8, -94, 8, -93.6], [-8, -94, -7.6, -72], [7.6, -94, 8, -72]]) vis(a, 0.02, b, c2, 0.05, d2, C.yellow, { cell: 4, lit: false });
  solid(-14.2, 0, -66, -12.4, 1.6, -63.6, C.crate); solid(-14.2, 1.6, -65.6, -12.8, 2.9, -64.0, 0x9a7a48); solid(12.4, 0, -78, 14.2, 1.4, -75.4, C.crate);
  solid(12.6, 0, -88, 14.2, 1.1, -86.4, 0x7d4a2a); solid(-14.2, 0, -84, -13, 1.2, -82.8, 0x6a3a2a); solid(-14.4, 0, -90, -12.6, 1.8, -87.6, C.crate);
  // ------------------------------------------------------------------------------------------ the Mini-Skeld (nose towards +z, boarding ramp under the nose)
  solid(-3.2, 1.0, -90.0, 3.2, 3.6, -74.0, C.hull);                                          // hull
  vis(-3.22, 2.0, -89.5, 3.22, 2.5, -74.5, C.orange, { cell: 4 });                           // stripe round the hull
  solid(-1.9, 2.2, -74.0, 1.9, 3.4, -71.6, C.hull);                                          // nose (the hatch is under it)
  glow(-1.5, 2.55, -71.55, 1.5, 3.2, -71.5, 0x7fe9ff);                                        // cockpit glass
  solid(-0.3, 3.6, -82, 0.3, 4.7, -77, C.orange);                                            // top fin
  solid(-3.2, 0, -89, -2.6, 1.0, -88, C.dark); solid(2.6, 0, -89, 3.2, 1.0, -88, C.dark); solid(-3.2, 0, -76, -2.6, 1.0, -75, C.dark); solid(2.6, 0, -76, 3.2, 1.0, -75, C.dark);   // landing legs
  glow(-2.4, 1.6, -90.06, -1.2, 2.6, -90.0, 0xff8a3d); glow(1.2, 1.6, -90.06, 2.4, 2.6, -90.0, 0xff8a3d);   // engine glow (rear)
  vis(-0.95, 1.0, -74.02, 0.95, 2.15, -74.0, 0x16181a, { lit: false });                        // open hatch
  glow(-0.9, 1.05, -74.0, 0.9, 2.1, -73.98, 0x6b4a1e);                                       // warm light inside the hatch
  for (let k = 0; k < 3; k++) solid(-1.0, 0, -72.9 - 0.5 * k, 1.0, 0.15 * (k + 1), -72.4 - 0.5 * k, 0x9aa2a6);   // ramp steps (climbing towards the hatch)

  vis(-4.1, 6.7, -70.05, -4.0, 9, -69.95, C.dark, { lit: false }); vis(4.0, 6.7, -70.05, 4.1, 9, -69.95, C.dark, { lit: false });   // the board hangs from the ceiling
  // ------------------------------------------------------------------------------------------ signs (canvas textures on planes, self-lit, no lights)
  const texPlane = (x, y, z, w, h, ry, cw, ch, draw) => {
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    draw(g, cw, ch);
    const tex = track(new THREE.CanvasTexture(cv)); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const mat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
    const geo = track(new THREE.PlaneGeometry(w, h));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    group.add(m);
    return { mesh: m, mat, tex, cv, g };
  };
  const FONT = "700 {s}px 'Bahnschrift','Arial Narrow',Arial,sans-serif";
  const setFont = (g, s) => { g.font = FONT.replace('{s}', s); };
  const wrap = (g, text, maxW) => { const words = String(text).split(' '); const out = []; let line = ''; for (const w of words) { const t2 = line ? line + ' ' + w : w; if (g.measureText(t2).width > maxW && line) { out.push(line); line = w; } else line = t2; } if (line) out.push(line); return out; };
  const plaque = (x, y, z, w, h, ry, text, o = {}) => texPlane(x, y, z, w, h, ry, o.cw || 256, o.ch || 64, (g, cw, ch) => {
    g.fillStyle = o.bg || '#e2b52f'; g.fillRect(0, 0, cw, ch);
    g.fillStyle = o.frame || '#1b1c1e'; g.fillRect(0, 0, cw, 4); g.fillRect(0, ch - 4, cw, 4);
    g.fillStyle = o.fg || '#1b1c1e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let s = o.size || 34; setFont(g, s);
    while (g.measureText(text).width > cw - 16 && s > 12) { s -= 2; setFont(g, s); }
    g.fillText(text, cw / 2, ch / 2 + 2);
  });
  // cell: door plaque above the doorway (inside), poster, CRT screen, sticky note
  plaque(0, 2.75, -6.98, 1.5, 0.4, 0, tx('sign.cell') + '  |  ' + tx('sign.cell2'), { size: 24, cw: 512, ch: 64 });
  texPlane(-2.98, 1.7, -4.2, 1.5, 1.05, Math.PI / 2, 384, 256, (g, cw, ch) => {
    g.fillStyle = '#20262b'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#ff2fd2'; g.lineWidth = 6; g.strokeRect(6, 6, cw - 12, ch - 12);
    g.fillStyle = '#ff2fd2'; g.textAlign = 'center'; g.textBaseline = 'middle'; setFont(g, 40);
    const ls = wrap(g, tx('sign.crt3'), cw - 50); ls.forEach((l, k) => g.fillText(l, cw / 2, ch / 2 - (ls.length - 1) * 22 + k * 44));
  });
  const crt = texPlane(2.09, 1.06, -2.6, 0.56, 0.36, -Math.PI / 2, 256, 128, (g, cw, ch) => {
    g.fillStyle = '#062a12'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#5dff8b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    setFont(g, 26); g.fillText(tx('sign.crt1'), cw / 2, 34); setFont(g, 18);
    const ls = wrap(g, tx('sign.crt2'), cw - 20); ls.forEach((l, k) => g.fillText(l, cw / 2, 72 + k * 22));
  });
  texPlane(1.83, 0.85, -1.68, 0.2, 0.2, -Math.PI / 2, 128, 128, (g, cw, ch) => { g.fillStyle = '#f2e58a'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#3a3320'; setFont(g, 15); g.textAlign = 'center'; wrap(g, tx('sign.note'), cw - 16).forEach((l, k) => g.fillText(l, cw / 2, 34 + k * 20)); }).mesh.rotation.set(-Math.PI / 2, 0, 0);
  // corridor signs
  plaque(-1.58, 1.9, -12.0, 1.2, 0.3, Math.PI / 2, tx('sign.crouch'), { size: 24, cw: 512, ch: 64 });
  plaque(-1.58, 1.9, -19.0, 1.4, 0.3, Math.PI / 2, tx('sign.sprint'), { size: 24, cw: 512, ch: 64 });
  plaque(-1.58, 1.9, -33.0, 1.0, 0.3, Math.PI / 2, tx('sign.locker'), { size: 28, cw: 384, ch: 64 });
  plaque(1.58, 1.9, -33.0, 1.0, 0.3, -Math.PI / 2, tx('sign.break'), { size: 28, cw: 384, ch: 64 });
  plaque(0, 2.86, -57.98, 1.5, 0.25, 0, tx('sign.hangar'), { size: 30, cw: 512, ch: 64 });
  plaque(-1.58, 1.9, -47.0, 1.0, 0.3, Math.PI / 2, tx('sign.hangar'), { size: 28, cw: 384, ch: 64 });
  // hangar: the big explanation board above the ship's hatch (3 columns: terminal / lever / door)
  texPlane(0, 5.6, -70.0, 8.4, 2.2, 0, 1536, 400, (g, cw, ch) => {
    g.fillStyle = '#12130d'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#e2b52f'; g.fillRect(0, 0, cw, 56);
    g.fillStyle = '#12130d'; g.textAlign = 'center'; g.textBaseline = 'middle'; setFont(g, 40); g.fillText(tx('sign.hangar_h'), cw / 2, 30);
    const colsW = cw / 3;
    [['sign.terminal', 'sign.terminal2'], ['sign.lever', 'sign.lever2'], ['sign.door', 'sign.door2']].forEach(([h, d], k) => {
      const cx = colsW * k + colsW / 2;
      g.fillStyle = '#39c46a'; setFont(g, 66); g.fillText(tx(h), cx, 132);
      g.fillStyle = '#e8e6d0'; setFont(g, 36);
      wrap(g, tx(d), colsW - 60).forEach((l, i) => g.fillText(l, cx, 214 + i * 46));
      if (k) { g.fillStyle = '#5a5730'; g.fillRect(colsW * k - 2, 80, 4, ch - 110); }
    });
  });

  // ------------------------------------------------------------------------------------------ dynamic parts: doors (slabs that slide up), locker 07 door, status lights
  const litMat = { red: track(new THREE.MeshBasicMaterial({ color: 0xff3b2f })), green: track(new THREE.MeshBasicMaterial({ color: 0x39ff6a })) };
  const doorMat = track(new THREE.MeshLambertMaterial({ color: 0x6d757a }));
  const stripeMat = track(new THREE.MeshBasicMaterial({ color: C.yellow }));
  const bulbGeo = track(new THREE.BoxGeometry(0.5, 0.12, 0.08));
  function makeDoor(x0, x1, z, h, thick, closedOpts = {}) {
    const w = x1 - x0;
    const geo = track(new THREE.BoxGeometry(w, h, thick));
    const mesh = new THREE.Mesh(geo, doorMat);
    mesh.position.set((x0 + x1) / 2, h / 2, z);
    const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(w * 0.9, 0.12, thick + 0.02)), stripeMat);
    stripe.position.set(0, h * 0.35, 0); mesh.add(stripe);
    group.add(mesh);
    const bulb = new THREE.Mesh(bulbGeo, litMat.red);
    bulb.position.set((x0 + x1) / 2, h + 0.22, z + (closedOpts.bulbSide || 0.14)); group.add(bulb);
    const d = { mesh, bulb, open: false, t: 0, h, x0, x1, z, thick, col: null, dur: closedOpts.dur || 0.9 };
    const addCol = () => { if (!d.col) d.col = addCollider(x0, 0, z - thick / 2, x1, h, z + thick / 2, { kind: 'static' }); };
    const dropCol = () => { if (d.col) { physics.removeCollider(d.col); const i = colliders.indexOf(d.col); if (i >= 0) colliders.splice(i, 1); d.col = null; } };
    d.set = (open, instant = false) => {
      d.open = !!open;
      bulb.material = open ? litMat.green : litMat.red;
      if (open) dropCol(); else addCol();
      if (instant) { d.t = open ? 1 : 0; mesh.position.y = h / 2 + d.t * h * 0.98; }
    };
    d.set(false, true);
    dyn.push((dt) => {
      const goal = d.open ? 1 : 0;
      if (d.t !== goal) { d.t = goal > d.t ? Math.min(goal, d.t + dt / d.dur) : Math.max(goal, d.t - dt / d.dur); mesh.position.y = h / 2 + d.t * h * 0.98; }
    });
    d.dispose = dropCol;
    return d;
  }
  const doors = {
    cell: makeDoor(-0.8, 0.8, -7.15, 2.5, 0.2),
    gate: makeDoor(-1.6, 1.6, -47.0, 3.0, 0.2),
    hangar: makeDoor(-1.3, 1.3, -58.15, 2.7, 0.2, { dur: 1.2 }),
    shutter: makeDoor(-1.6, 1.6, SHUTTER.z, 3.0, 0.3, { dur: 0.16 }),
  };
  doors.shutter.set(true, true);   // starts open (armed by the trigger line)
  // locker 07: a hinged door (pivot at the south edge of locker 4) that swings open
  const lockerPivot = new THREE.Group();
  lockerPivot.position.set(-5.4, 0, -43.0 + 3 * 0.85 + 0.8);
  const lockerDoor = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 1.9, 0.76)), track(new THREE.MeshLambertMaterial({ color: 0xa8b83a })));
  lockerDoor.position.set(0, 1.0, -0.4); lockerPivot.add(lockerDoor); group.add(lockerPivot);
  const lockerState = { open: false, t: 0 };
  dyn.push((dt) => { const g2 = lockerState.open ? 1 : 0; if (lockerState.t !== g2) { lockerState.t = g2 > lockerState.t ? Math.min(1, lockerState.t + dt * 1.6) : Math.max(0, lockerState.t - dt * 1.6); lockerPivot.rotation.y = lockerState.t * 1.75; } });
  const lockerNum = plaque(-5.37, 1.75, -43.0 + 3 * 0.85 + 0.4, 0.34, 0.16, Math.PI / 2, '07', { size: 30, cw: 96, ch: 48 });
  lockerNum.mesh.position.x = -5.33; lockerNum.mesh.parent === group && (lockerPivot.attach(lockerNum.mesh));

  // ------------------------------------------------------------------------------------------ the harmless Algorithm creature (blackout glimpse)
  const figure = new THREE.Group();
  {
    const fm = makeMesher(), em = makeMesher();
    box(fm, -0.22, 0.0, -0.12, -0.06, 0.95, 0.08, 0x08080b, { lit: false, cell: 9 });   // legs
    box(fm, 0.06, 0.0, -0.12, 0.22, 0.95, 0.08, 0x08080b, { lit: false, cell: 9 });
    box(fm, -0.28, 0.95, -0.14, 0.28, 1.6, 0.12, 0x0a0a0e, { lit: false, cell: 9 });      // torso
    box(fm, -0.16, 1.62, -0.14, 0.16, 1.98, 0.14, 0x0a0a0e, { lit: false, cell: 9 });     // head
    box(fm, -0.44, 0.55, -0.08, -0.30, 1.55, 0.06, 0x0a0a0e, { lit: false, cell: 9 });    // long arms
    box(fm, 0.30, 0.55, -0.08, 0.44, 1.55, 0.06, 0x0a0a0e, { lit: false, cell: 9 });
    box(em, -0.11, 1.78, 0.14, -0.03, 1.84, 0.16, 0xff2fd2, { lit: false, cell: 9 });      // magenta eyes
    box(em, 0.03, 1.78, 0.14, 0.11, 1.84, 0.16, 0xff2fd2, { lit: false, cell: 9 });
    const g1 = track(bake(fm)), g2 = track(bake(em));
    figure.add(new THREE.Mesh(g1, track(new THREE.MeshBasicMaterial({ vertexColors: true }))));
    figure.add(new THREE.Mesh(g2, track(new THREE.MeshBasicMaterial({ vertexColors: true }))));
  }
  figure.position.set(0, 0, -55.2); figure.visible = false;
  group.add(figure);

  // ------------------------------------------------------------------------------------------ bake + materials
  const mainGeo = track(bake(main)), emisGeo = track(bake(emis));
  const matLit = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const matDark = track(new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x3a3a3a }));
  const emisMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const mainMesh = new THREE.Mesh(mainGeo, matLit);
  const emisMesh = new THREE.Mesh(emisGeo, emisMat);
  mainMesh.frustumCulled = false; emisMesh.frustumCulled = false;   // one big mesh: skip the cull test
  group.add(mainMesh, emisMesh);
  scene.add(group);
  let lightK = 1;

  const stats = { verts: main.n + emis.n, tris: (main.i.length + emis.i.length) / 3, colliders: colliders.length, drawCalls: 2 + dyn.length };

  const api = {
    group, origin: O, stats, doors, figure,
    spawn: () => ({ pos: W(START.x, 0, START.z), yaw: START.yaw }),
    /** interaction points (world) */
    pts: {
      locker: W(-5.15, 1.2, -43.0 + 3 * 0.85 + 0.4),
      lockerDrop: W(-4.95, 1.1, -43.0 + 3 * 0.85 + 0.4),
      mug: W(5.1, 0.95, -40.4),
      cabinet: W(0.85, 1.25, -52.1),
      board: W(0, 1.3, -73.1),
    },
    /** local corridor coordinates of a world position */
    local: (p) => ({ x: p.x - O.x, y: p.y - O.y, z: p.z - O.z }),
    inCorridor: (p) => { const l = { x: p.x - O.x, z: p.z - O.z }; return l.x > CORR.x0 - 0.3 && l.x < CORR.x1 + 0.3 && l.z < CORR.zStart + 0.3 && l.z > CORR.zEnd - 0.3; },
    setLocker: (open) => { lockerState.open = !!open; },
    lockerOpen: () => lockerState.open,
    /** k 1 = lights on, 0 = blackout; anything between flickers (below .5 the dark material is used) */
    setLight(k) {
      lightK = k;
      mainMesh.material = k > 0.5 ? matLit : matDark;
      emisMat.color.setScalar(0.06 + 0.94 * Math.max(0, Math.min(1, k)));
    },
    light: () => lightK,
    showFigure(v, t = 0) { figure.visible = !!v; if (v) { figure.rotation.y = Math.sin(t * 2.1) * 0.06; figure.position.x = Math.sin(t * 0.9) * 0.03; } },
    update(dt) { for (const f of dyn) f(dt); },
    dispose() {
      for (const d of Object.values(doors)) d.dispose?.();
      for (const c of colliders) physics.removeCollider(c);
      colliders.length = 0;
      group.removeFromParent();
      group.traverse((o) => { o.geometry?.dispose?.(); });
      for (const d of disposables) { try { d.dispose?.(); } catch { /* ignore */ } }
    },
  };
  return api;
}
