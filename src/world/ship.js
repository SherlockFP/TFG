// The crew ship: always at the world origin. Interior (terminal, lever, monitors, door, storage,
// arcade, bunks) + exterior hull, floodlight, steps. Colliders are static; the door has a toggled collider.
import * as THREE from 'three';
import { GeoBuilder, levelMaterial, mergeStaticMeshes } from './geobuilder.js';
import { createProp } from '../models/props.js';
import { G } from '../physics/physics.js';
import { boxOccupied } from './doorsafe.js';
import { CORE_GAPS } from './hardpoints.js';
import { SPOTS, SPAWNS, LAMPS, WINDOWS_Z, PAD, MOD_SPOTS, WELL, withoutWell } from './shiplayout.js';
import { buildShipDeco, gridWall } from './shipdeco.js';

export const SHIP = {
  x0: -7, x1: 7, z0: -3.5, z1: 3.5, h: 3.4,
  door: { x: 2.6, width: 2.2, height: 2.6 },     // door on +z wall
};

/** extra "aboard" volumes {x0,x1,z0,z1,y0,y1}: installed shipyard rooms, the roof deck, the lift (game/shipyard.js keeps this list in sync) */
export const SHIP_EXTRA = [];

export function insideShip(p, margin = 0) {
  if (p.x > SHIP.x0 - margin && p.x < SHIP.x1 + margin && p.z > SHIP.z0 - margin && p.z < SHIP.z1 + margin && p.y > -0.8 && p.y < SHIP.h + 0.5) return true;
  // [ship2] the roof (defence mounts, reached by the roof ladder) counts as aboard: nobody is 'left behind' standing on the hull
  if (p.y >= SHIP.h + 0.3 && p.y < SHIP.h + 4.5 && p.x > SHIP.x0 - 0.25 && p.x < SHIP.x1 + 0.25 && p.z > SHIP.z0 - 0.25 && p.z < SHIP.z1 + 0.25) return true;
  for (let i = 0; i < SHIP_EXTRA.length; i++) {
    const v = SHIP_EXTRA[i];
    if (p.x > v.x0 - margin && p.x < v.x1 + margin && p.z > v.z0 - margin && p.z < v.z1 + margin && p.y > v.y0 && p.y < v.y1) return true;
  }
  return false;
}

/** Vertical wall along one axis with doorway gaps. ax 'z': wall at x=fixed running z a0->a1; ax 'x': wall at z=fixed running x a0->a1.
 * gaps: [{c, w, h}] (centre, width, height). ySill: when y0 < 0 the gap gets a sill from y0 up to 0. */
export function gapWall(gb, key, ax, fixed, a0, a1, y0, y1, uv, gaps, color) {
  // [wave5] built as a T-junction-free grid (shipdeco gridWall): the doorway hole runs from the floor (or y0 when the wall starts above it) to g.h;
  // a wall that starts below the floor (outer hull) keeps its sill piece under the hole
  gridWall(gb, key, ax, fixed, a0, a1, y0, y1, uv, gaps.map((g) => ({ s: g.c - g.w / 2, e: g.c + g.w / 2, y0: Math.max(0, y0), y1: g.h })), color);
}

/** The doorway itself (between the door leaf and the outer hull, incl. the first step): counts as aboard when the ship lifts off. */
export function inDoorway(p) {
  return Math.abs(p.x - SHIP.door.x) < SHIP.door.width / 2 + 0.2 && p.z >= SHIP.z1 - 0.05 && p.z < SHIP.z1 + 1.0 && p.y > -1.2 && p.y < SHIP.door.height + 0.5;
}

// Ship door leaf / collider tuning. The collider used to appear at t < 0.6 on the way down, while the leaf was still 60 % open
// (an invisible wall) and on top of whoever stood in the doorway. Now: hysteresis (on < 0.3, off > 0.45, like the facility
// doors) and a safety sensor: the leaf stops at HOLD_T while a capsule is in the doorway and closes when it is clear.
const COL_ON = 0.3, COL_OFF = 0.45, HOLD_T = 0.5, DOOR_SPEED = 1.6;

export function buildShip({ physics, lightPool, scene }) {
  const group = new THREE.Group();
  group.name = 'ship';
  const gb = new GeoBuilder();
  const S = SHIP;
  const colliders = [];
  const emitters = [];
  const box = (x, y, z, sx, sy, sz, member = G.STATIC, data) => {
    const c = physics.addStaticBox(x, y, z, sx / 2, sy / 2, sz / 2, 0, member, data);
    colliders.push(c); return c;
  };

  // --- interior surfaces ---
  // [wave5] the floor is built by shipdeco.js (per-room tinted, no second coplanar layer)
  for (const [x0, z0, x1, z1] of withoutWell(S.x0, S.z0, S.x1, S.z1)) gb.hrect('ship_ceiling', x0, z0, x1, z1, S.h, false, 0.5);   // [shipdeck] the ceiling has the stairwell hatch (closed by a lid until the Upper Deck is bought)
  // back wall (+x), faces -x; hardpoint doorway gap R1 (sealed by ship.hardpoints.R1 until a module is installed)
  const gapsX = [CORE_GAPS.R1], gapsZ = [CORE_GAPS.N1, CORE_GAPS.N2];
  gapWall(gb, 'ship_wall', 'z', S.x1, S.z0, S.z1, 0, S.h, 0.5, gapsX);
  // -z wall faces +z; hardpoint doorway gaps N1 / N2
  gapWall(gb, 'ship_wall', 'x', S.z0, S.x0, S.x1, 0, S.h, 0.5, gapsZ);
  // +z wall with door gap, faces -z
  const dL = S.door.x - S.door.width / 2, dR = S.door.x + S.door.width / 2;
  const winHoles = WINDOWS_Z.map((w) => ({ s: w.x0, e: w.x1, y0: w.y0, y1: w.y1 })), doorHole = { s: dL, e: dR, y0: 0, y1: S.door.height };
  gridWall(gb, 'ship_wall', 'x', S.z1, S.x1, S.x0, 0, S.h, 0.5, [doorHole, ...winHoles]);   // [ship2] clerestory windows (holes through both hull plates)
  // front wall (-x) with window, faces +x
  const wz0 = -2.4, wz1 = 2.4, wy0 = 1.15, wy1 = 2.75;
  gridWall(gb, 'ship_wall', 'z', S.x0, S.z1, S.z0, 0, S.h, 0.5, [{ s: wz0, e: wz1, y0: wy0, y1: wy1 }]);
  // (the hazard strip inside the door is drawn by shipdeco.js with the floor stripes: shiplayout DOOR_HAZARD)

  // --- exterior hull (slightly larger box, faces outward) ---
  const E = 0.25, ex0 = S.x0 - E, ex1 = S.x1 + E, ez0 = S.z0 - E, ez1 = S.z1 + E, eh = S.h + 0.45;
  // [ux] the +z outer plate has a real door opening now (it used to be one solid plate, so the ship looked CLOSED from outside even with the door open)
  gridWall(gb, 'metal_plate', 'x', ez1, ex0, ex1, -0.6, eh, 0.35, [doorHole, ...winHoles]);   // +z outer (faces +z): door opening + [ship2] window holes
  for (const w of WINDOWS_Z) {                                          // window tunnel through the hull skin
    gb.hrect('metal_dark', w.x0, S.z1, w.x1, ez1, w.y0, true, 0.5);
    gb.hrect('metal_dark', w.x0, S.z1, w.x1, ez1, w.y1, false, 0.5);
    gb.vrect('metal_dark', w.x0, ez1, w.x0, S.z1, w.y0, w.y1, 0.5);
    gb.vrect('metal_dark', w.x1, S.z1, w.x1, ez1, w.y0, w.y1, 0.5);
  }
  gb.vrect('metal_dark', dL, ez1, dL, S.z1, 0, S.door.height, 0.5);    // jamb (faces +x): hull thickness between the inner wall and the outer plate
  gb.vrect('metal_dark', dR, S.z1, dR, ez1, 0, S.door.height, 0.5);    // jamb (faces -x)
  gb.hrect('metal_dark', dL, S.z1, dR, ez1, S.door.height, false, 0.5); // lintel underside
  gapWall(gb, 'metal_plate', 'x', ez0, ex1, ex0, -0.6, eh, 0.35, gapsZ);   // -z outer (hardpoint gaps N1 / N2)
  gapWall(gb, 'metal_plate', 'z', ex1, ez1, ez0, -0.6, eh, 0.35, gapsX);   // +x outer (hardpoint gap R1)
  gb.vrect('metal_plate', ex0, ez0, ex0, ez1, -0.6, eh, 0.35);         // -x outer (window cut handled by overlay glass)
  for (const [x0, z0, x1, z1] of withoutWell(ex0, ez0, ex1, ez1)) gb.hrect('metal_dark', x0, z0, x1, z1, eh, true, 0.35);   // roof (with the hatch)
  { const W = WELL; for (const [a0, b0, a1, b1] of [[W.x0, W.z0, W.x1, W.z0], [W.x1, W.z1, W.x0, W.z1], [W.x0, W.z1, W.x0, W.z0], [W.x1, W.z0, W.x1, W.z1]]) gb.vrect('metal_dark', a0, b0, a1, b1, S.h, eh, 0.35); }   // hatch shaft walls (face inward)
  gb.hrect('metal_dark', ex0, ez0, ex1, ez1, -0.6, false, 0.35);       // belly
  // nose (a low "chin" under the cockpit window so the view stays clear)
  // [ship2] the nose is a rounded half-dome (built below); the old chin box only stays as its collider
  // thrusters
  for (const zz of [-2.2, 2.2]) gb.box('metal_dark', ex1 - 1.5, -1.0, zz, 2.2, 0.8, 1.4, 0.4);
  // landing legs
  for (const [lx, lz] of [[-5.5, -3.9], [-5.5, 3.9], [5.5, -3.9], [5.5, 3.9]]) {
    gb.box('metal_dark', lx, -1.0, lz, 0.35, 1.6, 0.35, 0.5);
    gb.box('metal_rust', lx, -1.75, lz, 1.0, 0.12, 1.0, 0.5);
  }
  // door frame outside + steps
  gb.box('hazard_stripes', S.door.x, S.door.height + 0.12, S.z1 + 0.28, S.door.width + 0.4, 0.24, 0.1, 0.6);
  const steps = [[0.0, S.z1 + 0.7], [-0.4, S.z1 + 1.1], [-0.8, S.z1 + 1.5]];
  for (const [sy, sz] of steps) {
    gb.box('metal_grate', S.door.x, sy - 0.1, sz, S.door.width + 0.4, 0.2, 0.5, 0.6);
    box(S.door.x, sy - 0.1, sz, S.door.width + 0.4, 0.2, 0.5);
  }
  // antenna + light on roof
  gb.box('metal_dark', S.x0 + 0.15, eh + 0.9, S.z0 + 0.1, 0.08, 1.8, 0.08, 0.5);   // [shipdeck] moved to the nose corner (the tail roof holds the mounts)

  const mesh = gb.build((key) => levelMaterial(key, key === 'metal_grate' ? { side: THREE.DoubleSide, alphaTest: 0.5 } : {}));
  group.add(mesh);

  // exterior details: hull stripe, number decal, nav lights, roof rails, thruster bells
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xc8581c });
  for (const zz of [ez0 - 0.02, ez1 + 0.02]) {
    // [ux] the +z stripe stops at the door opening
    let segs = zz > 0 ? [[ex0, dL], [dR, ex1]] : gapsZ.map((g) => [g.c - g.w / 2, g.c + g.w / 2]).sort((p, q) => p[0] - q[0]).reduce((acc, [a, b]) => { const [p, q] = acc.pop(); return [...acc, [p, a], [b, q]]; }, [[ex0, ex1]]);   // [wave5] -z: stops at the N1 / N2 doorways
    if (zz > 0) {   // [ship2] the stripe must not cross the clerestory windows
      for (const w of WINDOWS_Z) segs = segs.flatMap(([p, q]) => (w.x1 <= p || w.x0 >= q ? [[p, q]] : [[p, Math.max(p, w.x0)], [Math.min(q, w.x1), q]])).filter(([p, q]) => q - p > 0.05);
    }
    for (const [a, b] of segs) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 0.5), stripeMat);
      stripe.position.set((a + b) / 2, 2.6, zz);
      stripe.rotation.y = zz > 0 ? 0 : Math.PI;
      group.add(stripe);
    }
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 128, 48);
    x.font = 'bold 30px monospace'; x.fillStyle = '#e8e0cc'; x.fillText('KC-07', 8, 34);
    x.fillStyle = '#c8581c'; x.fillRect(100, 10, 22, 26); x.fillStyle = '#e8e0cc'; x.fillText('>', 102, 33);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const decalMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3 });
    for (const zz of [ez0 - 0.03, ez1 + 0.03]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), decalMat);
      d.position.set(zz > 0 ? -3.8 : 4.45, 1.5, zz);   // [wave5] -z: clear of the N2 doorway (x 1.65 .. 2.85)
      d.rotation.y = zz > 0 ? 0 : Math.PI;
      group.add(d);
    }
  }
  const navR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  navR.position.set(ex0 + 0.3, eh + 0.1, ez0 - 0.1);
  const navG = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
  navG.position.set(ex0 + 0.3, eh + 0.1, ez1 + 0.1);
  const navW = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navW.position.set(S.x0 + 0.15, eh + 1.85, S.z0 + 0.1);
  group.add(navR, navG, navW);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x3a3a38 });
  for (const zz of [ez0 + 0.1, ez1 - 0.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(ex1 - ex0 - 0.4, 0.06, 0.06), railMat);
    rail.position.set(0, eh + 0.9, zz); group.add(rail);
    for (let k = -6; k <= 6; k += 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), railMat); post.position.set(k, eh + 0.45, zz); group.add(post); }
  }
  const bellMat = new THREE.MeshLambertMaterial({ color: 0x2a2826 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
  for (const zz of [-2.2, 2.2]) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 0.9, 8, 1, true), bellMat);
    bell.material.side = THREE.DoubleSide;
    bell.position.set(ex1 - 1.5, -1.65, zz); group.add(bell);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), glowMat);
    glow.rotation.x = Math.PI / 2; glow.position.set(ex1 - 1.5, -1.62, zz); group.add(glow);
  }
  group.userData.navLights = [navR, navG, navW];

  // window glass
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(wz1 - wz0, wy1 - wy0), new THREE.MeshBasicMaterial({ color: 0x8ab4c8, transparent: true, opacity: 0.12, depthWrite: false }));
  glass.position.set(S.x0 - 0.02, (wy0 + wy1) / 2, 0);
  glass.rotation.y = Math.PI / 2;
  group.add(glass);
  // window frame bars
  const barMat = levelMaterial('metal_dark');
  for (const zz of [-0.8, 0.8]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, wy1 - wy0, 0.1), barMat);
    bar.position.set(S.x0, (wy0 + wy1) / 2, zz); group.add(bar);
  }
  // [ship2] clerestory glass in the +z wall + the rounded nose dome under the cockpit window
  const glassMat2 = glass.material.clone(); glassMat2.side = THREE.DoubleSide;
  for (const w of WINDOWS_Z) {
    const g2 = new THREE.Mesh(new THREE.PlaneGeometry(w.x1 - w.x0, w.y1 - w.y0), glassMat2);
    g2.position.set((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, S.z1 + 0.12); g2.rotation.y = Math.PI; group.add(g2);
  }
  {
    const ng = new THREE.SphereGeometry(1, 22, 12, -Math.PI / 2, Math.PI);
    const uvs = ng.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 4, uvs.getY(i) * 3);
    const nose = new THREE.Mesh(ng, levelMaterial('metal_plate'));
    nose.scale.set(1.8, 1.0, 2.7); nose.position.set(ex0, 0.1, 0); nose.name = 'ship2_nose'; group.add(nose);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 24), new THREE.MeshLambertMaterial({ color: 0xe07a1c }));   // orange band around the nose
    ring.rotation.y = Math.PI / 2; ring.position.set(ex0 - 0.9, 0.1, 0); ring.scale.set(2.34, 0.87, 1); group.add(ring);   // [wave5] sits ON the dome (its section at 0.9 m is 2.34 x 0.87); it used to float around it and show as a stray orange line under the cockpit window
  }

  // --- colliders ---
  box(0, -0.25, 0, S.x1 - S.x0 + 1, 0.5, S.z1 - S.z0 + 1);                      // floor
  for (const [x0, z0, x1, z1] of withoutWell(-7.5, -4, 7.5, 4)) box((x0 + x1) / 2, S.h + 0.25, (z0 + z1) / 2, x1 - x0, 0.5, z1 - z0);   // ceiling (+ roof) with the stairwell hatch
  // back (+x) and -z walls: split around the hardpoint gaps (lintel boxes stay above them)
  const colWall = (ax, fixed, thick, lo, hi, gaps) => {
    const put = (a, b, y0, y1) => { if (b - a < 1e-3 || y1 - y0 < 1e-3) return; ax === 'z' ? box(fixed, (y0 + y1) / 2, (a + b) / 2, thick, y1 - y0, b - a) : box((a + b) / 2, (y0 + y1) / 2, fixed, b - a, y1 - y0, thick); };
    let cur = lo;
    for (const g of [...gaps].sort((p, q) => p.c - q.c)) { put(cur, g.c - g.w / 2, 0, S.h); put(g.c - g.w / 2, g.c + g.w / 2, g.h, S.h); cur = g.c + g.w / 2; }
    put(cur, hi, 0, S.h);
  };
  colWall('z', S.x1 + 0.15, 0.3, -(S.z1 - S.z0 + 0.6) / 2, (S.z1 - S.z0 + 0.6) / 2, gapsX);      // back
  box(S.x0 - 0.15, S.h / 2, 0, 0.3, S.h, S.z1 - S.z0 + 0.6);                    // front (window: solid)
  colWall('x', S.z0 - 0.15, 0.3, -(S.x1 - S.x0 + 0.6) / 2, (S.x1 - S.x0 + 0.6) / 2, gapsZ);   // -z
  box((S.x1 + dR) / 2, S.h / 2, S.z1 + 0.15, S.x1 - dR, S.h, 0.3);             // +z right of door
  box((dL + S.x0) / 2, S.h / 2, S.z1 + 0.15, dL - S.x0, S.h, 0.3);             // +z left of door
  box(S.door.x, (S.h + S.door.height) / 2, S.z1 + 0.15, S.door.width, S.h - S.door.height, 0.3);
  box(ex0 - 1.0, 0.2, 0, 2.0, 1.6, 5.6);                                          // nose
  box(0, -0.9, 0, ex1 - ex0, 0.6, ez1 - ez0);                                     // belly

  // [shipdeck] the hatch lid: closes the stairwell (visual + collider) until the shipyard's Upper Deck is bought (game/shipdeck.js opens it)
  const deckHatch = (() => {
    const W = WELL, cx = (W.x0 + W.x1) / 2, cz = (W.z0 + W.z1) / 2, sx = W.x1 - W.x0, sz = W.z1 - W.z0;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, eh - S.h, sz), levelMaterial('metal_dark'));
    mesh.position.set(cx, (S.h + eh) / 2, cz); mesh.name = 'ship_deck_hatch'; group.add(mesh);
    const add = () => physics.addStaticBox(cx, S.h + 0.25, cz, sx / 2, 0.25, sz / 2, 0, G.STATIC);
    const h = { mesh, collider: add(), open: false, setOpen(v) {
      v = !!v; if (v === this.open) return; this.open = v; mesh.visible = !v;
      if (v) { if (this.collider) { physics.removeCollider(this.collider); this.collider = null; } } else if (!this.collider) this.collider = add();
    } };
    return h;
  })();

  // --- door leaf (sliding along +x) ---
  const leafMat = levelMaterial('door_metal');
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(S.door.width, S.door.height, 0.12), leafMat);
  // [wave5] the leaf lives INSIDE the hull skin (inner face 3 cm behind the inner wall plane): at z1 + 0.02 its inner face stuck 4 cm into the
  // cabin, so the open leaf showed through the cargo wall next to the door
  leaf.position.set(S.door.x, S.door.height / 2, S.z1 + 0.09);
  group.add(leaf);
  const DZ = S.z1 + 0.15;   // door collider centre z
  const addCollider = () => physics.addStaticBox(S.door.x, S.door.height / 2, DZ, S.door.width / 2, S.door.height / 2, 0.15, 0, G.DOOR, { kind: 'shipdoor' });
  // capsules touching the doorway: margin 0.1 around the collider; y range covers the steps below the sill
  const busy = (margin = 0.1, mask) => boxOccupied(physics, S.door.x, 0.9, DZ, S.door.width / 2 + margin, 1.8, 0.15 + margin, mask);
  const door = {
    leaf, open: false, t: 0, collider: null,
    blocked: false,                       // closing, but somebody stands in the doorway: the leaf waits
    setOpen(v, snap = false) { this.open = !!v; if (snap) { this.t = this.open ? 1 : 0; this.blocked = false; this.update(0); } },
    /** Interact prompt. phase = run.phase: the host seals the door while the ship flies. */
    label(phase) {
      if (phase === 'orbit' || phase === 'landing' || phase === 'takeoff' || phase === 'fired') return 'Ship door (sealed in flight)';
      if (!this.open && this.blocked) return 'Ship door (something is in the way)';
      return this.open ? 'Close ship door [E]' : 'Open ship door [E]';
    },
    update(dt) {
      const target = this.open ? 1 : 0;
      let t = this.t + Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * DOOR_SPEED);
      this.blocked = false;
      if (this.collider) {
        if (t > COL_OFF) { physics.removeCollider(this.collider); this.collider = null; }
        else if (dt > 0 && (this._pt = (this._pt || 0) + dt) > 0.3) { this._pt = 0; this.pushOut(); }   // (teleports / a peer that joined mid-close): never leave a capsule inside the closed door
      } else if (target < this.t || (target === 0 && t <= 0)) {
        // closing (or resting closed) with no collider yet. Below HOLD_T + a little the safety sensor runs EVERY frame, so
        // while somebody stands in the doorway the leaf rests at HOLD_T instead of creeping down and snapping back.
        if (t < HOLD_T + 0.06) {
          if (busy()) { t = Math.max(t, HOLD_T); this.blocked = true; }
          else if (t < COL_ON) this.collider = addCollider();
        }
      }
      this.t = t;
      leaf.position.x = S.door.x + t * (S.door.width + 0.1);
    },
    // Local capsule overlapping the closed door collider (deeper than the contact offset): move it to the nearer side.
    pushOut() {
      if (!this.collider) return;
      let fix = null;
      boxOccupied(physics, S.door.x, S.door.height / 2, DZ, S.door.width / 2 - 0.03, S.door.height / 2, 0.12, G.PLAYER, (col) => { fix = col; return false; });
      const body = fix?.parent?.();
      if (!body || body.isFixed?.()) return;
      const p = body.translation();
      const outside = p.z > DZ;
      const nz = outside ? S.z1 + 0.3 + 0.4 : S.z1 - 0.4;
      body.setTranslation({ x: p.x, y: p.y, z: nz }, true);
      body.setNextKinematicTranslation?.({ x: p.x, y: p.y, z: nz });
    },
  };
  door.update(0);

  // --- furniture (props) ---
  const anchors = {}, propRoots = [];
  const put = (id, x, y, z, rotY, name) => {
    let o = null;
    try { o = createProp(id, { seed: 3 }); } catch (e) { console.warn('ship prop', id, e); return null; }
    o.position.set(x, y, z); o.rotation.y = rotY;
    group.add(o); propRoots.push(o);
    o.updateMatrixWorld(true);
    for (const c of o.userData.colliders || []) {
      const cp = new THREE.Vector3(...c.c).applyMatrix4(o.matrixWorld);
      const q = Math.round(rotY / (Math.PI / 2)) & 1;
      box(cp.x, cp.y, cp.z, q ? c.s[2] : c.s[0], c.s[1], q ? c.s[0] : c.s[2]);
    }
    for (const l of o.userData.lights || []) {
      const p = new THREE.Vector3(...l.p).applyMatrix4(o.matrixWorld);
      emitters.push(lightPool.add({ pos: p, color: l.color, intensity: (l.intensity ?? 1) * 0.9, distance: l.distance ?? 8, group: 'ship' }));
    }
    if (name) anchors[name] = o;
    return o;
  };
  const sp = SPOTS;   // [ship2] every fixture position lives in world/shiplayout.js (overlap-checked in tools/harness/ship2_overlap.test.mjs)
  put('terminal', sp.terminal.x, 0, sp.terminal.z, sp.terminal.ry, 'terminal');
  put('monitor_bank', sp.monitors.x, 0, sp.monitors.z, sp.monitors.ry, 'monitors');
  put('lever', sp.lever.x, 0, sp.lever.z, sp.lever.ry, 'lever');
  put('cupboard', sp.cupboard.x, 0, sp.cupboard.z, sp.cupboard.ry, 'cupboard');
  put('bunkbed', sp.bunks.x, 0, sp.bunks.z, sp.bunks.ry, 'bunks');
  put('arcade_cabinet', sp.arcade.x, 0, sp.arcade.z, sp.arcade.ry, 'arcade');
  put('charging_station', sp.charger.x, sp.charger.y, sp.charger.z, sp.charger.ry, 'charger');
  put('suit_rack', sp.suits.x, 0, sp.suits.z, sp.suits.ry, 'suits');
  put('coffee_machine', sp.coffee.x, 0, sp.coffee.z, sp.coffee.ry, 'coffee');
  put('quota_screen', sp.quota.x, sp.quota.y, sp.quota.z, sp.quota.ry, 'quota');
  put('door_panel', sp.doorPanel.x, sp.doorPanel.y, sp.doorPanel.z, sp.doorPanel.ry, 'doorPanel');
  for (const [lx, lz] of LAMPS) put('ship_light', lx, S.h, lz, 0);
  // fix hanging lights to ceiling
  group.children.filter((c) => c.userData?.lights && c.position.y === S.h).forEach((c) => {
    const bb = new THREE.Box3().setFromObject(c); c.position.y = S.h - (bb.max.y - bb.min.y); c.updateMatrixWorld(true);
  });
  // re-anchor emitted light positions after the fix
  emitters.forEach((e) => { if (e.pos.y > S.h - 0.05) e.pos.y = S.h - 0.4; });
  if (!emitters.length) {
    for (const [x, z] of LAMPS) emitters.push(lightPool.add({ pos: new THREE.Vector3(x, S.h - 0.4, z), color: 0xffe2b8, intensity: 1, distance: 9, group: 'ship' }));
  }

  // [perf2] merge the static parts of the furniture into per-material meshes (draw calls). Interactables stay separate: every prop anchor
  // (screens, lever handle, doors, buttons ...) is flagged noMerge, so only fixed casings / frames / lamps are baked. Kill switch: __kefalNoShipMerge or ?nomerge.
  if (!globalThis.__kefalNoShipMerge && !(typeof location !== 'undefined' && /[?&]nomerge\b/.test(location.search || ''))) {
    try {
      for (const o of propRoots) for (const a of Object.values(o.userData.anchors || {})) for (const n of Array.isArray(a) ? a : [a]) if (n?.isObject3D) n.userData.noMerge = true;
      group.userData.shipMerged = mergeStaticMeshes(propRoots, group, 24, 2.5);
    } catch (e) { console.warn('ship prop merge', e); }
  }

  // floodlight on the roof (for night): emitter toggled by game
  const flood = lightPool.add({ pos: new THREE.Vector3(S.x1 - 1.5, eh + 1.2, S.z1 + 1.5), color: 0xfff0cc, intensity: 2.2, distance: 34, group: 'flood', enabled: false });
  emitters.push(flood);

  // --- hardpoint seals: plain wall blocks that fill the doorway gaps (core walls) until a shipyard module is installed there
  const hardpoints = {};
  const sealMat = levelMaterial('ship_wall'), openMat = new THREE.MeshBasicMaterial({ visible: false });   // (an opened seal stays a mesh in the group so panel-placement code still sees the doorway as occupied)
  for (const [id, g] of Object.entries(CORE_GAPS)) {
    const px = g.wall === '+x';
    const sx = px ? 0.25 : g.w + 0.01, sy = g.h, sz = px ? g.w + 0.01 : 0.25;
    const cx = px ? S.x1 + 0.125 : g.c, cz = px ? g.c : S.z0 - 0.125;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), sealMat);
    mesh.position.set(cx, sy / 2, cz);
    group.add(mesh);
    const hp = {
      id, gap: g, seal: mesh, collider: physics.addStaticBox(cx, sy / 2, cz, sx / 2, sy / 2, sz / 2, 0, G.STATIC), open: false,
      setOpen(v) {
        v = !!v;
        if (v === this.open) return;
        this.open = v; mesh.material = v ? openMat : sealMat;
        if (v) { if (this.collider) { physics.removeCollider(this.collider); this.collider = null; } }
        else if (!this.collider) this.collider = physics.addStaticBox(cx, sy / 2, cz, sx / 2, sy / 2, sz / 2, 0, G.STATIC);
      },
    };
    hardpoints[id] = hp;
  }

  // [ship2] partitions / floor tints / signs / crates / reactor (merged meshes); colliders + light emitters join the ship's own lists
  const deco = buildShipDeco({ physics, lightPool, group });
  colliders.push(...deco.colliders); emitters.push(...deco.emitters);

  scene.add(group);

  // interaction points (world positions)
  const ip = (obj, dy = 1.1, fwd = 0.35) => {
    if (!obj) return null;
    const p = obj.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(obj.rotation.y), 0, Math.cos(obj.rotation.y));
    return p.add(new THREE.Vector3(0, dy, 0)).addScaledVector(dir, fwd);
  };
  const points = {
    terminal: ip(anchors.terminal, 1.05, 0.2),
    lever: ip(anchors.lever, 1.0, 0.1),
    arcade: ip(anchors.arcade, 1.3, 0.3),
    doorOpen: anchors.doorPanel ? ip(anchors.doorPanel, 0.1, 0.05) : new THREE.Vector3(S.door.x + 1.7, 1.3, S.z1 - 0.1),
    cupboard: ip(anchors.cupboard, 1.0, 0.4),
    charger: ip(anchors.charger, 0.2, 0.2),
    suits: ip(anchors.suits, 1.2, 0.3),
    quota: ip(anchors.quota, 0.3, 0.1),
    coffee: ip(anchors.coffee, 1.0, 0.2),
    bunks: ip(anchors.bunks, 0.8, 0.5),
  };
  // spawn points inside
  const spawns = SPAWNS.map(([x, z]) => new THREE.Vector3(x, 0.05, z));   // [ship2] spawns[2] = teleporter pad (shiplayout PAD)

  return {
    group, colliders, emitters, door, anchors, points, spawns, flood, hardpoints, deckHatch,
    layout: { obstacles: deco.obstacles, spots: SPOTS, pad: PAD, mods: MOD_SPOTS }, deco,   // [ship2] obstacles = AABBs {min,max} of partitions / signs / crates for the fault-panel placer
    doorOutside: new THREE.Vector3(S.door.x, -0.9, S.z1 + 2.2),
  };
}
