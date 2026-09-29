// The crew ship: always at the world origin. Interior (terminal, lever, monitors, door, storage,
// arcade, bunks) + exterior hull, floodlight, steps. Colliders are static; the door has a toggled collider.
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { createProp } from '../models/props.js';
import { G } from '../physics/physics.js';
import { boxOccupied } from './doorsafe.js';
import { CORE_GAPS } from './hardpoints.js';

export const SHIP = {
  x0: -7, x1: 7, z0: -3.5, z1: 3.5, h: 3.4,
  door: { x: 2.6, width: 2.2, height: 2.6 },     // door on +z wall
};

/** extra "aboard" volumes {x0,x1,z0,z1,y0,y1}: installed shipyard rooms, the roof deck, the lift (game/shipyard.js keeps this list in sync) */
export const SHIP_EXTRA = [];

export function insideShip(p, margin = 0) {
  if (p.x > SHIP.x0 - margin && p.x < SHIP.x1 + margin && p.z > SHIP.z0 - margin && p.z < SHIP.z1 + margin && p.y > -0.8 && p.y < SHIP.h + 0.5) return true;
  for (let i = 0; i < SHIP_EXTRA.length; i++) {
    const v = SHIP_EXTRA[i];
    if (p.x > v.x0 - margin && p.x < v.x1 + margin && p.z > v.z0 - margin && p.z < v.z1 + margin && p.y > v.y0 && p.y < v.y1) return true;
  }
  return false;
}

/** Vertical wall along one axis with doorway gaps. ax 'z': wall at x=fixed running z a0->a1; ax 'x': wall at z=fixed running x a0->a1.
 * gaps: [{c, w, h}] (centre, width, height). ySill: when y0 < 0 the gap gets a sill from y0 up to 0. */
export function gapWall(gb, key, ax, fixed, a0, a1, y0, y1, uv, gaps, color) {
  const dir = Math.sign(a1 - a0) || 1;
  const list = gaps.map((g) => ({ s: dir > 0 ? g.c - g.w / 2 : g.c + g.w / 2, e: dir > 0 ? g.c + g.w / 2 : g.c - g.w / 2, h: g.h })).sort((p, q) => (p.s - q.s) * dir);
  const seg = (p, q, ya, yb) => {
    if (Math.abs(q - p) < 1e-4 || yb - ya < 1e-4) return;
    if (ax === 'z') gb.vrect(key, fixed, p, fixed, q, ya, yb, uv, color, Math.abs(p - a0));
    else gb.vrect(key, p, fixed, q, fixed, ya, yb, uv, color, Math.abs(p - a0));
  };
  let cur = a0;
  for (const g of list) {
    seg(cur, g.s, y0, y1);
    if (y0 < 0) seg(g.s, g.e, y0, 0);
    seg(g.s, g.e, g.h, y1);
    cur = g.e;
  }
  seg(cur, a1, y0, y1);
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
  gb.hrect('ship_floor', S.x0, S.z0, S.x1, S.z1, 0, true, 0.5);
  gb.hrect('ship_ceiling', S.x0, S.z0, S.x1, S.z1, S.h, false, 0.5);
  // back wall (+x), faces -x; hardpoint doorway gap R1 (sealed by ship.hardpoints.R1 until a module is installed)
  const gapsX = [CORE_GAPS.R1], gapsZ = [CORE_GAPS.N1, CORE_GAPS.N2];
  gapWall(gb, 'ship_wall', 'z', S.x1, S.z0, S.z1, 0, S.h, 0.5, gapsX);
  // -z wall faces +z; hardpoint doorway gaps N1 / N2
  gapWall(gb, 'ship_wall', 'x', S.z0, S.x0, S.x1, 0, S.h, 0.5, gapsZ);
  // +z wall with door gap, faces -z
  const dL = S.door.x - S.door.width / 2, dR = S.door.x + S.door.width / 2;
  gb.vrect('ship_wall', S.x1, S.z1, dR, S.z1, 0, S.h, 0.5);
  gb.vrect('ship_wall', dL, S.z1, S.x0, S.z1, 0, S.h, 0.5);
  gb.vrect('ship_wall', dR, S.z1, dL, S.z1, S.door.height, S.h, 0.5);
  // front wall (-x) with window, faces +x
  const wz0 = -2.4, wz1 = 2.4, wy0 = 1.15, wy1 = 2.75;
  gb.vrect('ship_wall', S.x0, S.z1, S.x0, wz1, 0, S.h, 0.5);
  gb.vrect('ship_wall', S.x0, wz0, S.x0, S.z0, 0, S.h, 0.5);
  gb.vrect('ship_wall', S.x0, wz1, S.x0, wz0, 0, wy0, 0.5);
  gb.vrect('ship_wall', S.x0, wz1, S.x0, wz0, wy1, S.h, 0.5);
  // hazard strip along the floor edge near the door
  gb.hrect('hazard_stripes', dL, S.z1 - 0.35, dR, S.z1, 0.005, true, 0.8);

  // --- exterior hull (slightly larger box, faces outward) ---
  const E = 0.25, ex0 = S.x0 - E, ex1 = S.x1 + E, ez0 = S.z0 - E, ez1 = S.z1 + E, eh = S.h + 0.45;
  // [ux] the +z outer plate has a real door opening now (it used to be one solid plate, so the ship looked CLOSED from outside even with the door open)
  gb.vrect('metal_plate', ex0, ez1, dL, ez1, -0.6, eh, 0.35);          // +z outer, left of the door (faces +z) -> direction +x gives +z normal
  gb.vrect('metal_plate', dR, ez1, ex1, ez1, -0.6, eh, 0.35);          // right of the door
  gb.vrect('metal_plate', dL, ez1, dR, ez1, S.door.height, eh, 0.35);  // above the door
  gb.vrect('metal_plate', dL, ez1, dR, ez1, -0.6, 0, 0.35);            // below the sill
  gb.vrect('metal_dark', dL, ez1, dL, S.z1, 0, S.door.height, 0.5);    // jamb (faces +x): hull thickness between the inner wall and the outer plate
  gb.vrect('metal_dark', dR, S.z1, dR, ez1, 0, S.door.height, 0.5);    // jamb (faces -x)
  gb.hrect('metal_dark', dL, S.z1, dR, ez1, S.door.height, false, 0.5); // lintel underside
  gapWall(gb, 'metal_plate', 'x', ez0, ex1, ex0, -0.6, eh, 0.35, gapsZ);   // -z outer (hardpoint gaps N1 / N2)
  gapWall(gb, 'metal_plate', 'z', ex1, ez1, ez0, -0.6, eh, 0.35, gapsX);   // +x outer (hardpoint gap R1)
  gb.vrect('metal_plate', ex0, ez0, ex0, ez1, -0.6, eh, 0.35);         // -x outer (window cut handled by overlay glass)
  gb.hrect('metal_dark', ex0, ez0, ex1, ez1, eh, true, 0.35);          // roof
  gb.hrect('metal_dark', ex0, ez0, ex1, ez1, -0.6, false, 0.35);       // belly
  // nose (a low "chin" under the cockpit window so the view stays clear)
  gb.box('metal_plate', ex0 - 1.0, 0.2, 0, 2.0, 1.6, 5.6, 0.35);
  gb.box('hazard_stripes', ex0 - 1.95, 0.95, 0, 0.1, 0.1, 5.6, 0.6);
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
  gb.box('metal_dark', S.x1 - 2, eh + 0.9, -2, 0.08, 1.8, 0.08, 0.5);

  const mesh = gb.build((key) => levelMaterial(key, key === 'metal_grate' ? { side: THREE.DoubleSide, alphaTest: 0.5 } : {}));
  group.add(mesh);

  // exterior details: hull stripe, number decal, nav lights, roof rails, thruster bells
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xc8581c });
  for (const zz of [ez0 - 0.02, ez1 + 0.02]) {
    // [ux] the +z stripe stops at the door opening
    const segs = zz > 0 ? [[ex0, dL], [dR, ex1]] : [[ex0, ex1]];
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
      d.position.set(zz > 0 ? -3.8 : 3.8, 1.5, zz);
      d.rotation.y = zz > 0 ? 0 : Math.PI;
      group.add(d);
    }
  }
  const navR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  navR.position.set(ex0 + 0.3, eh + 0.1, ez0 - 0.1);
  const navG = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
  navG.position.set(ex0 + 0.3, eh + 0.1, ez1 + 0.1);
  const navW = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navW.position.set(S.x1 - 2, eh + 1.85, -2);
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

  // --- colliders ---
  box(0, -0.25, 0, S.x1 - S.x0 + 1, 0.5, S.z1 - S.z0 + 1);                      // floor
  box(0, S.h + 0.25, 0, S.x1 - S.x0 + 1, 0.5, S.z1 - S.z0 + 1);                 // ceiling
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

  // --- door leaf (sliding along +x) ---
  const leafMat = levelMaterial('door_metal');
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(S.door.width, S.door.height, 0.12), leafMat);
  leaf.position.set(S.door.x, S.door.height / 2, S.z1 + 0.02);
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
  const anchors = {};
  const put = (id, x, y, z, rotY, name) => {
    let o = null;
    try { o = createProp(id, { seed: 3 }); } catch (e) { console.warn('ship prop', id, e); return null; }
    o.position.set(x, y, z); o.rotation.y = rotY;
    group.add(o);
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
  put('terminal', S.x0 + 0.75, 0, 2.55, Math.PI / 2, 'terminal');
  put('monitor_bank', S.x0 + 0.55, 0, -2.45, Math.PI / 2, 'monitors');
  put('lever', S.x0 + 1.1, 0, 0.9, Math.PI / 2, 'lever');
  put('cupboard', S.x1 - 0.55, 0, -2.3, -Math.PI / 2, 'cupboard');
  put('bunkbed', S.x1 - 1.4, 0, 2.6, Math.PI, 'bunks');
  put('arcade_cabinet', 1.2, 0, S.z0 + 0.5, 0, 'arcade');
  put('charging_station', -2.6, 1.0, S.z0 + 0.12, 0, 'charger');
  put('suit_rack', S.x1 - 0.5, 0, 0.3, -Math.PI / 2, 'suits');
  put('coffee_machine', -1.0, 0, S.z0 + 0.4, 0, 'coffee');
  put('quota_screen', -3.6, 1.9, S.z0 + 0.06, 0, 'quota');
  put('door_panel', S.door.x + S.door.width / 2 + 0.55, 1.2, S.z1 - 0.06, Math.PI, 'doorPanel');
  put('ship_light', -4, S.h, 0, 0); put('ship_light', 0, S.h, 0, 0); put('ship_light', 4, S.h, 0, 0);
  // fix hanging lights to ceiling
  group.children.filter((c) => c.userData?.lights && c.position.y === S.h).forEach((c) => {
    const bb = new THREE.Box3().setFromObject(c); c.position.y = S.h - (bb.max.y - bb.min.y); c.updateMatrixWorld(true);
  });
  // re-anchor emitted light positions after the fix
  emitters.forEach((e) => { if (e.pos.y > S.h - 0.05) e.pos.y = S.h - 0.4; });
  if (!emitters.length) {
    for (const x of [-4, 0, 4]) emitters.push(lightPool.add({ pos: new THREE.Vector3(x, S.h - 0.4, 0), color: 0xffe2b8, intensity: 1, distance: 9, group: 'ship' }));
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
  const spawns = [
    new THREE.Vector3(-3, 0.05, 0), new THREE.Vector3(-1.5, 0.05, 1.2), new THREE.Vector3(0, 0.05, -1.0), new THREE.Vector3(1.5, 0.05, 1.0),
    new THREE.Vector3(3, 0.05, -1.2), new THREE.Vector3(-2.2, 0.05, -1.5), new THREE.Vector3(2.4, 0.05, 1.6), new THREE.Vector3(4, 0.05, 0.2),
  ];

  return {
    group, colliders, emitters, door, anchors, points, spawns, flood, hardpoints,
    doorOutside: new THREE.Vector3(S.door.x, -0.9, S.z1 + 2.2),
  };
}
