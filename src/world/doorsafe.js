// Door safety: "is somebody standing where this door's collider would appear?"  A static collider that is created
// inside a kinematic character capsule leaves the player stuck in the wall, so doors must wait (or push) instead.
// Used by the ship door (world/ship.js) and the facility doors (Game.updateDoors). Local queries only: every peer
// owns the collider of its own copy of the door and only its own capsule collides with it (remote avatars are
// checked too, so the leaf never slams through someone's body).
import { RAPIER, G, groups } from '../physics/physics.js';

const ID_ROT = { x: 0, y: 0, z: 0, w: 1 };

/** Player capsules (local + remote avatars, optionally more groups) overlapping an axis-aligned box. */
export function boxOccupied(physics, cx, cy, cz, hx, hy, hz, mask = G.PLAYER | G.REMOTE, cb = null) {
  let hit = false;
  try {
    physics.world.intersectionsWithShape({ x: cx, y: cy, z: cz }, ID_ROT, new RAPIER.Cuboid(Math.max(0.01, hx), Math.max(0.01, hy), Math.max(0.01, hz)),
      (col) => { hit = true; if (cb) return cb(col) !== false; return false; }, undefined, groups(0xffff, mask));
  } catch { /* physics not ready */ }
  return hit;
}

/** Facility door collider args [x, y, z, w, h, d] (Game.updateDoors) -> is somebody in the way of it closing? */
export function doorwayBusy(physics, colArgs, margin = 0.12) {
  const [x, y, z, w, h, d] = colArgs;
  return boxOccupied(physics, x, y, z, w / 2 + margin, h / 2 + margin, d / 2 + margin);
}
