// gpusweep.js - wave 5 zfixperf: frees GPU geometries / textures of everything a map put in the scene once the map is gone.
// Why: dozens of modules build meshes with per-instance geometries (creature models, item models, instanced props, set
// pieces ...) and remove them from the scene on takeoff without disposing them; three keeps the GPU buffers until
// geometry.dispose() (renderer.info.memory.geometries climbed 139 -> 730 over 6 landings, docs/wave4/checkup.md).
// How: while a map is loaded (game.world.moonId) the scene is scanned every SCAN_S seconds and every geometry / texture
// seen is remembered; SETTLE_S after the map is unloaded, everything remembered that is no longer reachable from the scene
// is disposed. dispose() only frees the GPU copy: three re-uploads on the next render, so a cached / shared resource that
// is still used later merely costs one re-upload. Render-target and video textures are never touched.

import * as THREE from 'three';

const SCAN_S = 5, SETTLE_S = 2.5;   // [perf3] was 1.5: each scan traverses the whole scene (up to ~90 ms on a landed moon = a periodic hitch); the onBeforeRender hook already remembers everything that is drawn
const SCAN_NODES = 128, SCAN_MS = 1.5; // bounded work per update, without reducing scene content
const TEX_KEYS = ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'normalMap', 'bumpMap', 'specularMap', 'envMap', 'roughnessMap', 'metalnessMap', 'displacementMap'];

function collectMaterial(m, texs) {
  for (const k of TEX_KEYS) { const t = m?.[k]; if (t?.isTexture) texs.add(t); }
}
function collectObject(o, geos, texs) {
  if (o.geometry) geos.add(o.geometry);
  if (!o.material) return;
  if (Array.isArray(o.material)) for (const m of o.material) collectMaterial(m, texs);
  else collectMaterial(o.material, texs);
}

/** add every geometry / texture used by a mesh under `root` to the sets */
export function collectResources(root, geos, texs) {
  root.traverse((o) => collectObject(o, geos, texs));
}

const keepTex = (t) => t.isRenderTargetTexture || t.isVideoTexture || t.isCubeTexture || t.userData?.keep || t.isCompressedTexture;

/** dispose what `known` remembers and `root` no longer uses. Returns { geos, texs } counts. */
export function sweepRemoved(known, root) {
  const cg = new Set(), ct = new Set();
  collectResources(root, cg, ct);
  let g = 0, t = 0;
  for (const geo of known.geos) if (!cg.has(geo) && !geo.userData?.shared) { geo.dispose(); g++; }
  for (const tex of known.texs) if (!ct.has(tex) && !keepTex(tex)) { tex.dispose(); t++; }
  known.geos.clear(); known.texs.clear(); known.epoch = (known.epoch || 0) + 1;
  return { geos: g, texs: t };
}

/** Object3D.prototype.onBeforeRender fires for every object three actually draws: remembering the drawn geometry / material textures there catches
 *  resources that live shorter than one SCAN_S scan (a creature killed 1 s after it spawned, a thrown item) - the periodic scan alone missed those. */
function installDrawHook(known, active, keepDrawn) {
  const proto = THREE.Object3D.prototype, prev = proto.onBeforeRender;
  const seenMat = new WeakMap();
  const hook = function (renderer, scene, camera, geometry, material, group) {
    if (active() && geometry) {
      known.geos.add(geometry);
      keepDrawn?.(geometry, material);
      if (material && seenMat.get(material) !== (known.epoch || 0)) {
        seenMat.set(material, known.epoch || 0);
        for (const k of TEX_KEYS) { const t = material[k]; if (t && t.isTexture) known.texs.add(t); }
      }
    }
    if (prev) prev.call(this, renderer, scene, camera, geometry, material, group);
  };
  proto.onBeforeRender = hook;
  return () => { if (proto.onBeforeRender === hook) proto.onBeforeRender = prev; };
}

export function installGpuSweep(game) {
  const mods = game.mods;
  const known = { geos: new Set(), texs: new Set(), epoch: 0 };
  const scanStack = [];
  let scanVisits = 0, scanMaxMs = 0;
  let cleanup = null, cleanupWorkMax = 0, cleanupMaxMs = 0;
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  function scanSlice() {
    const start = clock();
    let n = 0;
    while (scanStack.length && n < SCAN_NODES && clock() - start < SCAN_MS) {
      const frame = scanStack[scanStack.length - 1], o = frame.node;
      if (frame.child < 0) { collectObject(o, known.geos, known.texs); frame.child = 0; n++; }
      else if (frame.child < o.children.length) scanStack.push({ node: o.children[frame.child++], child: -1 });
      else scanStack.pop();
    }
    scanVisits += n; scanMaxMs = Math.max(scanMaxMs, clock() - start);
  }
  // The orbit sweep used to traverse the remaining scene and dispose every removed
  // resource in one update. Budget both operations, including iteration of wide
  // parents. A fresh map cancels the sweep without forgetting remembered resources.
  function cleanupSlice() {
    const job = cleanup;
    if (!job) return;
    const start = clock();
    let work = 0;
    while (cleanup === job && work < SCAN_NODES && clock() - start < SCAN_MS) {
      if (job.stage === 'collect') {
        const frame = job.stack[job.stack.length - 1];
        if (!frame) { job.stage = 'geos'; job.iter = known.geos.values(); continue; }
        work++;
        if (frame.child < 0) { collectObject(frame.node, job.geos, job.texs); frame.child = 0; }
        else if (frame.child < frame.node.children.length) job.stack.push({ node: frame.node.children[frame.child++], child: -1 });
        else job.stack.pop();
      } else {
        const next = job.iter.next();
        if (next.done) {
          if (job.stage === 'geos') { job.stage = 'texs'; job.iter = known.texs.values(); continue; }
          last = job.freed; sweeps++; known.geos.clear(); known.texs.clear();
          known.epoch = (known.epoch || 0) + 1; acc = SCAN_S; cleanup = null;
          break;
        }
        work++;
        const resource = next.value;
        if (job.stage === 'geos') {
          if (!job.geos.has(resource) && !resource.userData?.shared) { resource.dispose(); known.geos.delete(resource); job.freed.geos++; }
        } else if (!job.texs.has(resource) && !keepTex(resource)) { resource.dispose(); known.texs.delete(resource); job.freed.texs++; }
      }
    }
    cleanupWorkMax = Math.max(cleanupWorkMax, work);
    cleanupMaxMs = Math.max(cleanupMaxMs, clock() - start);
  }
  const offs = [];
  let acc = SCAN_S, settle = -1, loaded = false, last = { geos: 0, texs: 0 }, sweeps = 0;
  const unhook = installDrawHook(known, () => loaded || settle >= 0 || !!cleanup, (geometry, material) => {
    if (!cleanup) return;
    // Resources drawn while the orbit scene is changing are also live, even if
    // their object was attached after the collector passed its parent.
    cleanup.geos.add(geometry);
    if (material) collectMaterial(material, cleanup.texs);
  });
  const scene = () => game.engine?.scene;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  on('update', (dt, g) => {
    if (g !== game || !scene()) return;
    const inMap = !!game.world?.moonId;
    if (inMap) {
      cleanup = null;
      loaded = true; settle = -1;
      acc += dt;
      if (acc >= SCAN_S && !scanStack.length) { acc = 0; scanStack.push({ node: scene(), child: -1 }); }
      scanSlice();
    } else if (loaded) {
      loaded = false;
      scanStack.length = 0;
      settle = SETTLE_S;
    } else if (settle >= 0) {
      settle -= dt;
      if (settle < 0) cleanup = { stage: 'collect', stack: [{ node: scene(), child: -1 }], geos: new Set(), texs: new Set(), iter: null, freed: { geos: 0, texs: 0 } };
    }
    cleanupSlice();
  });
  return {
    sweepNow() { cleanup = null; last = sweepRemoved(known, scene()); sweeps++; return last; },
    stats: () => ({ remembered: known.geos.size, texs: known.texs.size, last, sweeps, scanVisits, scanPending: scanStack.length, scanMaxMs, cleanupPending: !!cleanup, cleanupStage: cleanup?.stage || null, cleanupWorkMax, cleanupMaxMs }),
    dispose() { cleanup = null; scanStack.length = 0; unhook(); for (const off of offs) { try { off(); } catch { /* ignore */ } } offs.length = 0; known.geos.clear(); known.texs.clear(); },
  };
}
