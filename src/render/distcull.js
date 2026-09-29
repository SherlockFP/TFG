// Distance culling of small props (wave 7 perf2). The frustum already drops what is behind you, but every prop between you and the fog wall is still one
// draw call per mesh. Fog (FogExp2) hides everything past ~150 m anyway, so direct children of the map groups that are small and far are switched off.
// Only objects THIS pass hid are switched back on; large things (terrain chunks, facility shells, instanced layers) are never touched.
// QUALITY.propFar = 0 disables the whole thing (High). update() only needs {children, visible, matrixWorld.elements, parent} so node tests feed fake objects.
import * as THREE from 'three';

const PASS_S = 0.25;          // re-evaluate 4x per second
const MAX_R = 24;             // bigger bounding spheres are structure, not props
const MEASURE_PER_PASS = 40;  // bounding boxes computed per pass (spread the cost)

const _box = new THREE.Box3();
/** conservative radius of an object around its own pivot (world space); -1 = empty / unmeasurable */
export function cullMeasure(o) {
  o.updateMatrixWorld(true);
  _box.setFromObject(o);
  if (_box.isEmpty()) return -1;
  const e = o.matrixWorld.elements;
  const dx = Math.max(Math.abs(_box.min.x - e[12]), Math.abs(_box.max.x - e[12])), dy = Math.max(Math.abs(_box.min.y - e[13]), Math.abs(_box.max.y - e[13])), dz = Math.max(Math.abs(_box.min.z - e[14]), Math.abs(_box.max.z - e[14]));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function makeDistCull() {
  const radius = new WeakMap();   // object -> bounding radius (or -1 = never cull)
  const hidden = new Set();
  let acc = 0, roots = [];
  return {
    hiddenCount: () => hidden.size,
    /** restore everything this pass hid */
    reset() { for (const o of hidden) o.visible = true; hidden.clear(); acc = 0; },
    /**
     * @param dt frame time  @param mapRoots Object3D[] whose direct children are candidates  @param cam {x,y,z}  @param far metres (0 = off)
     * @param measure (obj) => radius | -1   (three: Box3.setFromObject bounding sphere)
     */
    update(dt, mapRoots, cam, far, measure = cullMeasure) {
      if (!(far > 0)) { if (hidden.size) this.reset(); return 0; }
      acc += dt;
      if (acc < PASS_S) return 0;
      acc = 0;
      roots = mapRoots;
      let measured = 0, changed = 0;
      for (const o of [...hidden]) if (!o.parent) hidden.delete(o);   // unloaded maps
      for (const root of roots) {
        if (!root?.children) continue;
        for (const o of root.children) {
          if (o.isInstancedMesh || o.isLight || o.userData?.noCull) continue;
          let r = radius.get(o);
          if (r === undefined) {
            if (measured >= MEASURE_PER_PASS) continue;
            measured++;
            r = measure(o);
            if (!(r >= 0 && r <= MAX_R)) r = -1;
            radius.set(o, r);
          }
          if (r < 0) continue;
          const e = o.matrixWorld.elements;
          const dx = e[12] - cam.x, dy = e[13] - cam.y, dz = e[14] - cam.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
          if (d > far) { if (o.visible) { o.visible = false; hidden.add(o); changed++; } }
          else if (d < far - 8 && hidden.has(o)) { o.visible = true; hidden.delete(o); changed++; }   // 8 m hysteresis
        }
      }
      return changed;
    },
  };
}
