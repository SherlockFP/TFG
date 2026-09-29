// gpusweep.js - wave 5 zfixperf: frees GPU geometries / textures of everything a map put in the scene once the map is gone.
// Why: dozens of modules build meshes with per-instance geometries (creature models, item models, instanced props, set
// pieces ...) and remove them from the scene on takeoff without disposing them; three keeps the GPU buffers until
// geometry.dispose() (renderer.info.memory.geometries climbed 139 -> 730 over 6 landings, docs/wave4/checkup.md).
// How: while a map is loaded (game.world.moonId) the scene is scanned every SCAN_S seconds and every geometry / texture
// seen is remembered; SETTLE_S after the map is unloaded, everything remembered that is no longer reachable from the scene
// is disposed. dispose() only frees the GPU copy: three re-uploads on the next render, so a cached / shared resource that
// is still used later merely costs one re-upload. Render-target and video textures are never touched.

const SCAN_S = 1.5, SETTLE_S = 2.5;
const TEX_KEYS = ['map', 'emissiveMap', 'alphaMap', 'lightMap', 'aoMap', 'normalMap', 'bumpMap', 'specularMap', 'envMap', 'roughnessMap', 'metalnessMap', 'displacementMap'];

/** add every geometry / texture used by a mesh under `root` to the sets */
export function collectResources(root, geos, texs) {
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
    if (mats) for (const m of mats) for (const k of TEX_KEYS) { const t = m?.[k]; if (t && t.isTexture) texs.add(t); }
  });
}

const keepTex = (t) => t.isRenderTargetTexture || t.isVideoTexture || t.isCubeTexture || t.userData?.keep || t.isCompressedTexture;

/** dispose what `known` remembers and `root` no longer uses. Returns { geos, texs } counts. */
export function sweepRemoved(known, root) {
  const cg = new Set(), ct = new Set();
  collectResources(root, cg, ct);
  let g = 0, t = 0;
  for (const geo of known.geos) if (!cg.has(geo) && !geo.userData?.shared) { geo.dispose(); g++; }
  for (const tex of known.texs) if (!ct.has(tex) && !keepTex(tex)) { tex.dispose(); t++; }
  known.geos.clear(); known.texs.clear();
  return { geos: g, texs: t };
}

export function installGpuSweep(game) {
  const mods = game.mods;
  const known = { geos: new Set(), texs: new Set() };
  const offs = [];
  let acc = SCAN_S, settle = -1, loaded = false, last = { geos: 0, texs: 0 }, sweeps = 0;
  const scene = () => game.engine?.scene;
  const on = (ev, fn) => { const off = mods.on(ev, fn); if (typeof off === 'function') offs.push(off); };
  on('update', (dt, g) => {
    if (g !== game || !scene()) return;
    const inMap = !!game.world?.moonId;
    if (inMap) {
      loaded = true; settle = -1;
      acc += dt;
      if (acc >= SCAN_S) { acc = 0; collectResources(scene(), known.geos, known.texs); }
    } else if (loaded) {
      loaded = false;
      settle = SETTLE_S;
    } else if (settle >= 0) {
      settle -= dt;
      if (settle < 0) { last = sweepRemoved(known, scene()); sweeps++; acc = SCAN_S; }
    }
  });
  return {
    sweepNow() { last = sweepRemoved(known, scene()); sweeps++; return last; },
    stats: () => ({ remembered: known.geos.size, texs: known.texs.size, last, sweeps }),
    dispose() { for (const off of offs) { try { off(); } catch { /* ignore */ } } offs.length = 0; known.geos.clear(); known.texs.clear(); },
  };
}
