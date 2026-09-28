// Company HQ "moon": industrial pier around the landed ship. Sell counter (+ The Algorithm's tentacles),
// black market stall (Phish Dayı), casino corner (slot machines), bounty board, fishing dock.
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from './geobuilder.js';
import { createAnyProp as createProp } from './propfactory.js';
import { getTexture } from '../render/textures.js';
import { G } from '../physics/physics.js';

export function buildCompany({ physics, lightPool }) {
  const group = new THREE.Group();
  group.name = 'company';
  const colliders = [];
  const emitters = [];
  const interactables = [];
  const gb = new GeoBuilder();
  const box = (x, y, z, sx, sy, sz, rotY = 0) => { const c = physics.addStaticBox(x, y, z, sx / 2, sy / 2, sz / 2, rotY); colliders.push(c); return c; };
  const PY = -1.25; // pier floor height

  // pier slab (big concrete platform)
  gb.box('concrete', 0, PY - 1, 4, 90, 2, 90, 0.25);
  box(0, PY - 1, 4, 90, 2, 90);
  // edge walls to keep people from falling (low curbs) except at the dock
  for (const [x, z, sx, sz] of [[0, -41, 90, 0.6], [-45, 4, 0.6, 90], [45, 4, 0.6, 90]]) { gb.box('hazard_stripes', x, PY + 0.4, z, sx, 0.8, sz, 0.5); box(x, PY + 0.4, z, sx, 0.8, sz); }
  // south edge curb with a gap for the dock
  gb.box('hazard_stripes', -24, PY + 0.4, 45, 42, 0.8, 0.6, 0.5); box(-24, PY + 0.4, 45, 42, 0.8, 0.6);
  gb.box('hazard_stripes', 30, PY + 0.4, 45, 30, 0.8, 0.6, 0.5); box(30, PY + 0.4, 45, 30, 0.8, 0.6);

  // Company building (north): big hall open towards the ship
  const bx = 0, bz = -29, bw = 34, bd = 18, bh = 11;
  const wallT = 'concrete_dark';
  gb.vrect(wallT, bx - bw / 2, bz - bd / 2, bx + bw / 2, bz - bd / 2, PY, PY + bh, 0.25);        // back wall faces +z (dir +x -> normal +z)
  gb.vrect(wallT, bx - bw / 2, bz + bd / 2, bx - bw / 2, bz - bd / 2, PY, PY + bh, 0.25);        // left wall faces +x
  gb.vrect(wallT, bx + bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, PY, PY + bh, 0.25);        // right wall faces -x
  gb.hrect('metal_dark', bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, PY + bh, false, 0.25);
  // exterior of building
  gb.vrect('metal_rust', bx + bw / 2 + 0.3, bz - bd / 2 - 0.3, bx - bw / 2 - 0.3, bz - bd / 2 - 0.3, PY, PY + bh + 1, 0.2);
  gb.vrect('metal_rust', bx - bw / 2 - 0.3, bz - bd / 2 - 0.3, bx - bw / 2 - 0.3, bz + bd / 2, PY, PY + bh + 1, 0.2);
  gb.vrect('metal_rust', bx + bw / 2 + 0.3, bz + bd / 2, bx + bw / 2 + 0.3, bz - bd / 2 - 0.3, PY, PY + bh + 1, 0.2);
  gb.hrect('metal_dark', bx - bw / 2 - 0.3, bz - bd / 2 - 0.3, bx + bw / 2 + 0.3, bz + bd / 2, PY + bh + 1, true, 0.2);
  // front fascia above the opening
  gb.vrect('metal_rust', bx - bw / 2 - 0.3, bz + bd / 2, bx + bw / 2 + 0.3, bz + bd / 2, PY + bh - 3, PY + bh + 1, 0.2);
  gb.vrect('metal_rust', bx + bw / 2, bz + bd / 2 - 0.05, bx - bw / 2, bz + bd / 2 - 0.05, PY + bh - 3, PY + bh, 0.2);
  box(bx, PY + bh / 2, bz - bd / 2 - 0.2, bw + 1, bh, 0.5);
  box(bx - bw / 2 - 0.2, PY + bh / 2, bz, 0.5, bh, bd);
  box(bx + bw / 2 + 0.2, PY + bh / 2, bz, 0.5, bh, bd);
  box(bx, PY + bh + 0.5, bz, bw + 1, 1, bd + 0.5);

  const levelMesh = gb.build((k) => levelMaterial(k));
  group.add(levelMesh);

  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), new THREE.MeshLambertMaterial({ map: getTexture('water'), color: 0x3a5260 }));
  sea.material.map = sea.material.map?.clone() || null;
  if (sea.material.map) { sea.material.map.repeat.set(120, 120); sea.material.map.needsUpdate = true; }
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = PY - 3.2;
  group.add(sea);

  const put = (id, x, y, z, rotY = 0, opts = {}) => {
    let o = null;
    try { o = createProp(id, { seed: 5, ...opts }); } catch (e) { console.warn('company prop', id, e); return null; }
    o.position.set(x, y, z); o.rotation.y = rotY;
    group.add(o); o.updateMatrixWorld(true);
    for (const c of o.userData.colliders || []) {
      const cp = new THREE.Vector3(...c.c).applyMatrix4(o.matrixWorld);
      box(cp.x, cp.y, cp.z, c.s[0], c.s[1], c.s[2], rotY);
    }
    for (const l of o.userData.lights || []) {
      const p = new THREE.Vector3(...l.p).applyMatrix4(o.matrixWorld);
      emitters.push(lightPool.add({ pos: p, color: l.color, intensity: l.intensity ?? 1, distance: (l.distance ?? 9) * 1.2, group: 'company' }));
    }
    return o;
  };

  // sell counter at the back of the hall
  const counter = put('sell_counter', 0, PY, bz - bd / 2 + 2.2, 0);
  const dz = counter?.userData.anchors?.dropZone;
  const dropZone = dz ? dz.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, PY + 1.1, bz - bd / 2 + 2.2);
  const bell = put('desk_bell', 2.2, dropZone.y - (PY) + PY, dropZone.z + 0.2, 0);
  if (bell) bell.position.y = dropZone.y - 0.02;
  interactables.push({ type: 'bell', pos: new THREE.Vector3(2.2, dropZone.y + 0.1, dropZone.z + 0.2) });
  interactables.push({ type: 'sellzone', pos: dropZone.clone(), size: new THREE.Vector3(5, 1.5, 1.6) });
  put('company_sign', 0, PY + bh - 2.2, bz + bd / 2 - 0.1, 0);
  put('company_sign', 0, PY + 2.8, bz - bd / 2 + 0.2, 0);

  // market stall (right side inside the hall)
  const stall = put('vendor_stall', 11, PY, bz + 2, -Math.PI / 2);
  const npcAnchor = stall?.userData.anchors?.npc;
  const npcPos = npcAnchor ? npcAnchor.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(12, PY, bz + 2);
  interactables.push({ type: 'market', pos: new THREE.Vector3(npcPos.x - 1.5, PY + 1.4, npcPos.z) });

  // casino corner (left side) - three slot machines
  const slots = [];
  for (let k = 0; k < 3; k++) {
    const o = put('slot_machine', -14.5, PY, bz - 4 + k * 2.2, Math.PI / 2);
    slots.push(o);
    interactables.push({ type: 'slots', pos: new THREE.Vector3(-13.6, PY + 1.3, bz - 4 + k * 2.2), obj: o });
  }
  emitters.push(lightPool.add({ pos: new THREE.Vector3(-13, PY + 3.5, bz - 2), color: 0xff4fd8, intensity: 1.2, distance: 9, group: 'company' }));

  // bounty board near the entrance
  const board = put('quest_board', -8, PY, bz + bd / 2 - 1.5, 0);
  interactables.push({ type: 'bounties', pos: new THREE.Vector3(-8, PY + 1.6, bz + bd / 2 - 1.1), obj: board });

  // hall lights
  for (const x of [-10, 0, 10]) emitters.push(lightPool.add({ pos: new THREE.Vector3(x, PY + bh - 1.5, bz), color: 0xffe3b0, intensity: 2.0, distance: 20, group: 'company' }));
  emitters.push(lightPool.add({ pos: new THREE.Vector3(0, PY + 3.2, bz - bd / 2 + 4), color: 0xffd9a0, intensity: 1.6, distance: 10, group: 'company' }));

  // fishing dock (south edge)
  const dock = put('dock', -3, PY, 47, Math.PI);
  const dockEnd = dock?.userData.anchors?.end;
  const fishPos = dockEnd ? dockEnd.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(-3, PY, 55);
  // dock collider fallback (walkable planks)
  box(-3, PY - 0.15, 51, 3, 0.3, 10);
  interactables.push({ type: 'pond', pos: fishPos.clone(), r: 6, sea: true });

  // harbor dressing
  put('crane', 30, PY, 30, -Math.PI / 2);
  put('shipping_container', 34, PY, 0, 0.1, { variant: 1 });
  put('shipping_container', 34, PY + 2.6, 0.5, -0.05, { variant: 2 });
  put('shipping_container', -34, PY, 20, Math.PI / 2, { variant: 0 });
  put('fish_crates', 20, PY, 12, 0.4);
  put('fish_crates', -20, PY, 30, -0.3);
  put('oil_drum_stack', 25, PY, 38, 0);
  for (const [x, z] of [[-25, 5], [25, 5], [-25, 32], [25, 32], [0, 38]]) put('lamp_post', x, PY, z, 0);
  put('radio_tower', -38, PY, -20, 0);

  return {
    group, colliders, emitters, interactables, dropZone, npcPos, fishPos, slots, board, counter,
    groundY: PY,
    dispose(physicsRef) {
      for (const c of colliders) physicsRef.removeCollider(c);
      for (const e of emitters) lightPool.remove(e);
      group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      group.removeFromParent();
    },
  };
}
