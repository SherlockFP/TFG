// HORROR module - the CLOSET: a small wardrobe / cupboard / quarantine door standing against a facility wall. Walking into it (door open) teleports you into
// a pocket that is far bigger than the room outside. Also used for the FAKE closet (Alien-style ambush) which shares the geometry but breathes.
// Local frame: origin on the floor at the wall (back of the closet), +z = out of the closet through the door, x across. World transform = translate + rotY(atan2(fx, fz)).
import * as THREE from 'three';
import { G } from '../physics/physics.js';
import { CLOSET } from './horror_core.js';

export const CLOSET_STYLES = {
  plain: { body: 0x6b5a48, door: 0x7a6650, trim: 0x3a2f24, knob: 0xb8a070, label: null },
  mansion: { body: 0x2c1c12, door: 0x3a2618, trim: 0x1a100a, knob: 0xc8a850, label: null },
  quarantine: { body: 0x4a5058, door: 0x5c636c, trim: 0xd6b520, knob: 0xc02a2a, label: 'crest' },
  cabinet: { body: 0x6b6b60, door: 0x7c7c70, trim: 0x3a3a34, knob: 0xa0a0a0, label: null },
};
const dark = () => new THREE.MeshLambertMaterial({ color: 0x0a0807, flatShading: true });

/** world-space AABB for a local box (centre + size) of a closet at (ox, oy, oz) facing (fx, fz), axis aligned */
export function worldBox(ox, oz, fx, fz, lcx, lcz, lsx, lsz) {
  return { x: ox + lcx * fz + lcz * fx, z: oz - lcx * fx + lcz * fz, sx: Math.abs(fz) * lsx + Math.abs(fx) * lsz, sz: Math.abs(fx) * lsx + Math.abs(fz) * lsz };
}
/** local (lx, lz) -> world */
export function toWorld(fr, lx, lz) { return { x: fr.wallX + lx * fr.fz + lz * fr.fx, z: fr.wallZ - lx * fr.fx + lz * fr.fz }; }
/** world -> local (lx across, lz along the facing) */
export function toLocal(fr, x, z) { const dx = x - fr.wallX, dz = z - fr.wallZ; return { lx: dx * fr.fz - dz * fr.fx, lz: dx * fr.fx + dz * fr.fz }; }

const rot = (x, z, th) => { const c = Math.cos(th), s = Math.sin(th); return [x * c + z * s, -x * s + z * c]; };
/**
 * Portal maths. Walking into closet A (moving against its facing, past the trigger plane 0.7 m from the wall) puts you at the door plane of closet B, moving along B's
 * facing, with the same lateral offset (clamped), height above the floor, velocity and view direction - rotated by the difference of the two facings.
 * A / B = { wallX, wallZ, fx, fz, y }, DB = depth of B (wall -> door plane). Returns { x, y, z, th (yaw delta), vel: (vx, vz) => [vx', vz'] }.
 */
export function portalMap(A, B, DB, pos) {
  const CA = toWorld(A, 0, 0.7), CB = toWorld(B, 0, DB);
  const th = Math.atan2(B.fx, B.fz) - Math.atan2(-A.fx, -A.fz);
  const [rx, rz] = rot(pos.x - CA.x, pos.z - CA.z, th);
  let x = CB.x + B.fx * 0.05 + rx, z = CB.z + B.fz * 0.05 + rz;
  const lb = toLocal(B, x, z), lim = 0.72, cl = Math.max(-lim, Math.min(lim, lb.lx));
  x -= B.fz * (lb.lx - cl); z -= -B.fx * (lb.lx - cl);
  return { x, z, y: B.y + (pos.y - A.y), th, vel: (vx, vz) => rot(vx, vz, th) };
}

/**
 * frame = { wallX, wallZ, fx, fz, y }. opts = { style, physics, wide }.
 * returns { group, frame, door: { pivot, open (0..1 target), t }, colliders, doorCollider, setOpen(bool), update(dt, time), dispose(), breathe }
 */
export function buildCloset(frame, { style = 'plain', physics = null, wide = false, fake = false } = {}) {
  const S = CLOSET_STYLES[style] || CLOSET_STYLES.plain;
  const W = wide ? CLOSET.w + 0.5 : CLOSET.w, D = CLOSET.d, Hh = CLOSET.h, T = 0.07;
  const group = new THREE.Group();
  group.name = 'hr_closet';
  group.position.set(frame.wallX, frame.y, frame.wallZ);
  group.rotation.y = Math.atan2(frame.fx, frame.fz);
  const geos = [], mats = [];
  const mat = (c, o = {}) => { const m = o.basic ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: o.em ?? 0 }); mats.push(m); return m; };
  const box = (parent, m, sx, sy, sz, x, y, z) => { const g = new THREE.BoxGeometry(sx, sy, sz); geos.push(g); const me = new THREE.Mesh(g, m); me.position.set(x, y, z); parent.add(me); return me; };
  const body = mat(S.body), trim = mat(S.trim), doorM = mat(S.door), knobM = mat(S.knob), inner = dark();
  mats.push(inner);
  // shell: two sides, top, plinth, dark back, dark floor inside
  box(group, body, T, Hh, D, -W / 2, Hh / 2, D / 2);
  box(group, body, T, Hh, D, W / 2, Hh / 2, D / 2);
  box(group, body, W + T * 2, 0.12, D, 0, Hh + 0.06, D / 2);
  box(group, trim, W + 0.16, 0.14, D + 0.06, 0, 0.07, D / 2);   // plinth
  box(group, trim, W + 0.16, 0.1, D + 0.06, 0, Hh + 0.16, D / 2);   // cornice
  box(group, inner, W, Hh, 0.05, 0, Hh / 2, 0.06);            // black back wall
  box(group, inner, W, 0.03, D, 0, 0.02, D / 2);                // black floor
  // door slab hinged on the left, swings outwards (towards +z / -x) so the doorway opens into the room
  const pivot = new THREE.Group();
  pivot.position.set(-W / 2 + 0.02, 0, D - 0.02);
  group.add(pivot);
  const dw = W - 0.04, dh = Hh - 0.12;
  box(pivot, doorM, dw, dh, 0.06, dw / 2, dh / 2 + 0.1, 0.03);
  box(pivot, trim, dw - 0.24, dh - 0.4, 0.02, dw / 2, dh / 2 + 0.1, 0.07);          // raised panel
  box(pivot, knobM, 0.07, 0.07, 0.08, dw - 0.14, 1.05, 0.1);                          // handle
  if (wide) { box(pivot, trim, 0.03, dh - 0.3, 0.03, dw / 2, dh / 2 + 0.1, 0.08); }
  if (S.label === 'crest') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14), mat(0x6a1a1a)); geos.push(disc.geometry);
    disc.rotation.x = Math.PI / 2; disc.position.set(dw / 2, 1.5, 0.1); pivot.add(disc);
    box(pivot, mat(0xd8c070), 0.05, 0.26, 0.03, dw / 2, 1.5, 0.12); box(pivot, mat(0xd8c070), 0.26, 0.05, 0.03, dw / 2, 1.5, 0.12);
    // hazard stripe across the door
    for (let i = 0; i < 6; i++) box(pivot, mat(i % 2 ? 0x1a1a1a : 0xd6b520), 0.14, 0.14, 0.03, 0.12 + i * 0.24, 0.55, 0.09);
  }
  const state = { open: 0, target: 0, t: 0 };
  // colliders (world space, via physics): shell + door slab (removed while open)
  const colliders = [];
  let doorCol = null;
  const ox = frame.wallX, oz = frame.wallZ, y = frame.y;
  const addBox = (lcx, lcz, lsx, lsz, ly0, ly1, member = G.STATIC, data = null) => {
    if (!physics) return null;
    const b = worldBox(ox, oz, frame.fx, frame.fz, lcx, lcz, lsx, lsz);
    return physics.addStaticBox(b.x, y + (ly0 + ly1) / 2, b.z, b.sx / 2, (ly1 - ly0) / 2, b.sz / 2, 0, member, data);
  };
  if (physics) {
    colliders.push(addBox(-W / 2, D / 2, T, D, 0, Hh + 0.2), addBox(W / 2, D / 2, T, D, 0, Hh + 0.2), addBox(0, D / 2, W, D, Hh, Hh + 0.3));
    doorCol = addBox(0, D - 0.02, W, 0.08, 0, Hh, G.DOOR, { kind: 'hrdoor' });
  }
  const setOpen = (v) => {
    state.target = v ? 1 : 0;
    if (doorCol && v) { physics.removeCollider(doorCol); doorCol = null; }
    else if (!doorCol && !v && physics) doorCol = addBox(0, D - 0.02, W, 0.08, 0, Hh, G.DOOR, { kind: 'hrdoor' });
  };
  // fake closet tells: the door breathes, cold mist seeps out under it
  let mist = null;
  if (fake) {
    mist = [];
    const mm = new THREE.MeshBasicMaterial({ color: 0xbfd8e8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    mats.push(mm);
    const pg = new THREE.PlaneGeometry(0.5, 0.32); geos.push(pg);
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(pg, mm.clone()); p.position.set(0, 0.1, D + 0.2); p.rotation.x = -Math.PI / 2; p.userData.k = i; group.add(p); mist.push(p); mats.push(p.material); }
  }
  const api = {
    group, frame, state, colliders, S, W, D, fake,
    get isOpen() { return state.target > 0.5; },
    setOpen,
    update(dt, time, breath = true) {
      state.open += Math.sign(state.target - state.open) * Math.min(Math.abs(state.target - state.open), dt * (fake && state.target ? 4.5 : 2.2));
      const e = state.open * state.open * (3 - 2 * state.open);
      pivot.rotation.y = -e * (fake ? 2.0 : 1.75);
      if (fake && !state.target) {
        // breathing: a slow 2-3 % swell of the door panel, out of phase with anything else in the room
        const b = Math.sin(time * 1.9) * 0.5 + 0.5;
        pivot.scale.z = 1 + b * 0.5; pivot.position.z = D - 0.02 + b * 0.012;
        pivot.rotation.y = -b * 0.012;
        if (mist) for (const p of mist) {
          const k = (time * 0.35 + p.userData.k / 3) % 1;
          p.position.set((p.userData.k - 1) * 0.3, 0.05 + k * 0.08, D + 0.08 + k * 0.5);
          p.material.opacity = Math.sin(k * Math.PI) * 0.16;
        }
      } else if (mist) for (const p of mist) p.material.opacity = 0;
    },
    dispose() {
      if (physics) { for (const c of colliders) if (c) physics.removeCollider(c); if (doorCol) physics.removeCollider(doorCol); }
      colliders.length = 0; doorCol = null;
      group.removeFromParent();
      for (const g of geos) g.dispose(); for (const m of mats) m.dispose();
    },
  };
  return api;
}
