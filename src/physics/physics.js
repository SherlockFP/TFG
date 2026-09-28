// Rapier wrapper: static level colliders, dynamic items, kinematic characters, raycasts.
import RAPIER from '@dimforge/rapier3d-compat';

export const G = {
  STATIC: 0x0001,
  PLAYER: 0x0002,
  ITEM: 0x0004,
  CREATURE: 0x0008,
  REMOTE: 0x0010,
  TRIGGER: 0x0020,
  DOOR: 0x0040,
  BIG: 0x0080,
};
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

let inited = false;
export async function initPhysics() {
  if (inited) return;
  await RAPIER.init();
  inited = true;
}
export { RAPIER };

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -19.6, z: 0 });
    this.world.timestep = 1 / 60;
    this.info = new Map();     // collider handle -> { kind, ref, tag }
    this.acc = 0;
    this.eventQueue = null;
  }

  tag(collider, data) { this.info.set(collider.handle, data); return collider; }
  infoOf(collider) { return collider ? this.info.get(collider.handle) : null; }

  addStaticBox(x, y, z, hx, hy, hz, rotY = 0, member = G.STATIC, data = null) {
    const desc = RAPIER.ColliderDesc.cuboid(Math.max(0.01, hx), Math.max(0.01, hy), Math.max(0.01, hz))
      .setTranslation(x, y, z)
      .setCollisionGroups(groups(member, 0xffff))
      .setFriction(0.8);
    if (rotY) {
      const s = Math.sin(rotY / 2), c = Math.cos(rotY / 2);
      desc.setRotation({ x: 0, y: s, z: 0, w: c });
    }
    const col = this.world.createCollider(desc);
    this.tag(col, data || { kind: member === G.DOOR ? 'door' : 'static' });
    return col;
  }

  addStaticTrimesh(vertices, indices, data = null) {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setCollisionGroups(groups(G.STATIC, 0xffff))
      .setFriction(0.9);
    const col = this.world.createCollider(desc);
    this.tag(col, data || { kind: 'static' });
    return col;
  }

  addSensorBox(x, y, z, hx, hy, hz, data) {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setSensor(true)
      .setCollisionGroups(groups(G.TRIGGER, 0));
    const col = this.world.createCollider(desc);
    this.tag(col, data);
    return col;
  }

  removeCollider(col) {
    if (!col) return;
    this.info.delete(col.handle);
    try { this.world.removeCollider(col, true); } catch { /* already removed */ }
  }
  removeBody(body) {
    if (!body) return;
    try {
      const n = body.numColliders();
      for (let i = 0; i < n; i++) this.info.delete(body.collider(i).handle);
      this.world.removeRigidBody(body);
    } catch { /* ignore */ }
  }

  // Dynamic item body (cuboid approximating the item's bounding box)
  createItemBody(pos, quat, half, mass = 1, big = false, data = null) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(quat ? { x: quat.x, y: quat.y, z: quat.z, w: quat.w } : { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(0.15).setAngularDamping(0.6)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bd);
    const member = big ? G.BIG : G.ITEM;
    const filter = G.STATIC | G.DOOR | G.ITEM | G.BIG | (big ? G.PLAYER | G.CREATURE | G.REMOTE : 0);
    const cd = RAPIER.ColliderDesc.cuboid(Math.max(0.04, half.x), Math.max(0.04, half.y), Math.max(0.04, half.z))
      .setMass(Math.max(0.2, mass))
      .setFriction(0.9).setRestitution(0.15)
      .setCollisionGroups(groups(member, filter));
    const col = this.world.createCollider(cd, body);
    this.tag(col, data || { kind: 'item' });
    return { body, col };
  }

  // Kinematic capsule (remote players, creatures, local player)
  createKinematicCapsule(pos, halfHeight, radius, member, filter, data) {
    const bd = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z);
    const body = this.world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(groups(member, filter));
    const col = this.world.createCollider(cd, body);
    this.tag(col, data || { kind: 'kinematic' });
    return { body, col };
  }

  createController(offset = 0.02) {
    const c = this.world.createCharacterController(offset);
    c.setUp({ x: 0, y: 1, z: 0 });
    // A large autostep makes tiny prop/decal collision lips feel like invisible
    // walls. Keep it generous enough for thresholds, but not for furniture.
    c.enableAutostep(0.42, 0.16, false);
    c.enableSnapToGround(0.4);
    c.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    c.setSlideEnabled(true);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(80);
    return c;
  }

  step(dt, onStep) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= this.world.timestep && n < 4) {
      onStep?.(this.world.timestep);
      if (this._preSteps) for (const fn of this._preSteps) { try { fn(this.world.timestep); } catch (e) { console.warn('preStep', e); } }
      this.world.step();
      this.acc -= this.world.timestep;
      n++;
    }
    if (n === 4) this.acc = 0;
  }

  // filterMask: which groups the ray can hit
  raycast(origin, dir, maxDist, filterMask = 0xffff, excludeCollider = null, excludeBody = null) {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, groups(0xffff, filterMask), excludeCollider || undefined, excludeBody || undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      distance: t,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      normal: hit.normal,
      collider: hit.collider,
      info: this.infoOf(hit.collider),
    };
  }

  lineOfSight(a, b, filterMask = G.STATIC | G.DOOR) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    const hit = this.raycast(a, { x: dx / d, y: dy / d, z: dz / d }, d - 0.05, filterMask);
    return !hit;
  }

  // All colliders overlapping a sphere
  overlapSphere(center, radius, filterMask, cb) {
    const shape = new RAPIER.Ball(radius);
    this.world.intersectionsWithShape({ x: center.x, y: center.y, z: center.z }, { x: 0, y: 0, z: 0, w: 1 }, shape,
      (col) => { cb(col, this.infoOf(col)); return true; }, undefined, groups(0xffff, filterMask));
  }

  // ---------------------------------------------------------------- additive: fixed-step hooks + vehicles
  // Functions called once per fixed physics sub-step, right before world.step() (vehicle controllers).
  addPreStep(fn) { (this._preSteps = this._preSteps || new Set()).add(fn); return () => this.removePreStep(fn); }
  removePreStep(fn) { this._preSteps?.delete(fn); }

  // Compound rigid body for a vehicle chassis. parts: [{ half:[hx,hy,hz], pos:[x,y,z], density, friction }]
  // member/filter: collision groups (the Uplink Van uses STATIC membership so the character controller,
  // items and wheel rays treat it as solid ground, and filters out players/creatures, which it hits logically).
  createVehicleBody(pos, quat, parts, { member = G.STATIC, filter = G.STATIC | G.DOOR | G.ITEM | G.BIG, data = null, linDamp = 0.05, angDamp = 0.6 } = {}) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(quat ? { x: quat.x, y: quat.y, z: quat.z, w: quat.w } : { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(linDamp).setAngularDamping(angDamp)
      .setCcdEnabled(true)
      .setCanSleep(true);
    const body = this.world.createRigidBody(bd);
    const colliders = [];
    for (const p of parts) {
      const cd = RAPIER.ColliderDesc.cuboid(Math.max(0.02, p.half[0]), Math.max(0.02, p.half[1]), Math.max(0.02, p.half[2]))
        .setTranslation(p.pos[0], p.pos[1], p.pos[2])
        .setDensity(p.density ?? 50)
        .setFriction(p.friction ?? 0.6).setRestitution(0.05)
        .setCollisionGroups(groups(member, filter));
      const col = this.world.createCollider(cd, body);
      this.tag(col, data || { kind: 'vehicle' });
      colliders.push(col);
    }
    return { body, colliders };
  }

  // Rapier ray-cast vehicle controller (forward axis = chassis -Z / +Z via index 2, up = +Y).
  createVehicleController(body) {
    const vc = this.world.createVehicleController(body);
    try { vc.indexUpAxis = 1; } catch { /* older API */ }
    try { vc.setIndexForwardAxis = 2; } catch { /* older API */ }
    return vc;
  }
  removeVehicleController(vc) {
    if (!vc) return;
    try { this.world.removeVehicleController(vc); } catch { /* ignore */ }
  }

  dispose() {
    try { this.world.free(); } catch { /* ignore */ }
    this.info.clear();
  }
}
