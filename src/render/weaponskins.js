// Weapon skins (cosm5, wave 4): ten material / pattern overrides that work on ANY weapon model (procedural item meshes, the plasma
// blade, the blaster ...). No UVs needed: every skin is an object-space procedural pattern injected into the mesh's own material
// (onBeforeCompile on a clone), so the lit / unlit character of each part is kept and only its colour + emission change.
//   applySkin(root, 'lava') / clearSkin(root)      root = any Object3D (item `obj.userData.inner`, a preview model ...)
//   skinClock                                       shared { value } time uniform (seconds) - the owner ticks it
// Additive glow shells (plasma blade halo) are re-tinted to the skin's accent colour. Forge glow (weaponglow.js) has priority: the
// caller (cosm5.js) simply does not skin items whose forge level shows the camo shader.
// One program per skin id (customProgramCacheKey); clones are cached per (skin, source material) and never disposed while alive.
import * as THREE from 'three';

export const SKIN_IDS = ['camo', 'carbon', 'damascus', 'bubblegum', 'circuit', 'lava', 'frost', 'holo', 'bone', 'rusted'];
const PAT = Object.fromEntries(SKIN_IDS.map((id, i) => [id, i + 1]));
export const SKIN_ACCENT = { camo: 0x8a9a4a, carbon: 0x5a6a8a, damascus: 0xcfd6e0, bubblegum: 0xff6ac8, circuit: 0x2affb0, lava: 0xff6a10, frost: 0x7fd4ff, holo: 0xff88ff, bone: 0xe8dfc4, rusted: 0xc8641e };
export const skinClock = { value: 0 };

const GLSL = /* glsl */`
float c5h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float c5n(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(c5h(i), c5h(i + vec3(1.0, 0.0, 0.0)), f.x), mix(c5h(i + vec3(0.0, 1.0, 0.0)), c5h(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(c5h(i + vec3(0.0, 0.0, 1.0)), c5h(i + vec3(1.0, 0.0, 1.0)), f.x), mix(c5h(i + vec3(0.0, 1.0, 1.0)), c5h(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float c5f(vec3 p) { return c5n(p) * 0.6 + c5n(p * 2.3) * 0.3 + c5n(p * 5.1) * 0.1; }
vec3 c5skin(vec3 p, vec3 base) {
  float lum = dot(base, vec3(0.30, 0.59, 0.11));
  float k = 0.55 + 0.9 * lum;
  vec3 col = base;
  c5e = vec3(0.0);
  if (C5P == 1) {            // woodland camo
    float n = c5f(p * 13.0);
    col = mix(vec3(0.10, 0.13, 0.07), vec3(0.23, 0.29, 0.13), step(0.36, n));
    col = mix(col, vec3(0.42, 0.46, 0.24), step(0.5, n));
    col = mix(col, vec3(0.63, 0.58, 0.38), step(0.64, n));
  } else if (C5P == 2) {     // carbon twill weave + clear-coat glint
    vec3 q = p * 70.0;
    float w = mod(floor(q.x) + floor(q.y + q.z), 2.0);
    float tw = 0.5 + 0.5 * sin((q.x + q.y + q.z) * 3.14159);
    col = mix(vec3(0.04), vec3(0.11), w) + vec3(0.04) * tw * (1.0 - w);
    col += vec3(0.06) * pow(abs(sin((p.x + p.y * 0.7) * 9.0)), 12.0);
  } else if (C5P == 3) {     // damascus: warped folded bands
    float b = sin(p.z * 46.0 + p.y * 14.0 + c5f(p * 10.0) * 11.0);
    col = mix(vec3(0.20, 0.21, 0.23), vec3(0.62, 0.64, 0.68), smoothstep(-0.2, 0.2, b));
    col *= 0.85 + 0.3 * c5n(p * 60.0);
  } else if (C5P == 4) {     // bubblegum
    float n = c5f(p * 9.0);
    col = mix(vec3(1.0, 0.36, 0.72), vec3(1.0, 0.66, 0.88), smoothstep(0.35, 0.7, n));
    col = mix(col, vec3(1.0, 0.2, 0.55), step(0.78, c5n(p * 22.0)) * 0.7);
    c5e = vec3(0.10, 0.02, 0.06);
  } else if (C5P == 5) {     // live circuit board with pulsing traces
    vec3 q = p * 26.0; vec3 id = floor(q); vec3 f = fract(q);
    float hh = c5h(id);
    float trace = max(step(abs(f.x - 0.5), 0.08) * step(0.45, hh), step(abs(f.z - 0.5), 0.08) * step(hh, 0.55));
    float pad = step(length(f.xz - 0.5), 0.16) * step(0.8, c5h(id + 3.0));
    float pulse = 0.5 + 0.5 * sin(uC5T * 3.0 + hh * 6.283 + q.y * 0.5);
    col = vec3(0.03, 0.16, 0.09) + (trace + pad) * vec3(0.12, 0.5, 0.36);
    c5e = (trace + pad) * vec3(0.15, 1.0, 0.7) * (0.35 + 0.65 * pulse) * 0.9;
  } else if (C5P == 6) {     // magma: black rock, molten cracks
    float v = abs(c5n(p * 13.0 + vec3(0.0, 0.0, uC5T * 0.04)) - 0.5) * 2.0;
    float crack = 1.0 - smoothstep(0.0, 0.2, v);
    float pul = 0.75 + 0.25 * sin(uC5T * 2.2 + c5n(p * 8.0) * 6.0);
    vec3 rock = vec3(0.09, 0.05, 0.04) + 0.06 * c5n(p * 40.0);
    vec3 hot = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.8, 0.25), smoothstep(0.5, 1.0, crack * pul));
    col = mix(rock, hot, crack);
    c5e = hot * crack * pul * 1.1;
  } else if (C5P == 7) {     // frost crystals + sparkles
    float n = c5f(p * 20.0); float cr = c5n(p * 55.0);
    col = mix(vec3(0.42, 0.70, 0.92), vec3(0.85, 0.96, 1.0), smoothstep(0.3, 0.75, n));
    col = mix(col, vec3(0.2, 0.45, 0.8), step(0.83, cr) * 0.6);
    float sp = step(0.985, c5h(floor(p * 95.0) + floor(uC5T * 4.0)));
    c5e = vec3(0.6, 0.85, 1.0) * sp * 1.5 + vec3(0.02, 0.05, 0.08);
  } else if (C5P == 8) {     // holographic film
    float hh = fract(p.x * 3.4 + p.y * 2.6 + p.z * 3.0 + uC5T * 0.22);
    vec3 rain = clamp(abs(mod(hh * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    float sc = 0.8 + 0.2 * sin(p.y * 130.0 + uC5T * 5.0);
    col = mix(vec3(0.8), rain, 0.75) * sc;
    c5e = rain * 0.35;
  } else if (C5P == 9) {     // bone
    float n = c5f(p * 24.0);
    col = mix(vec3(0.72, 0.66, 0.52), vec3(0.93, 0.89, 0.76), smoothstep(0.3, 0.7, n));
    float cr = 1.0 - smoothstep(0.0, 0.05, abs(c5n(p * 34.0) - 0.5));
    col = mix(col, vec3(0.32, 0.26, 0.18), cr * 0.7);
    col *= 1.0 - 0.4 * step(0.9, c5n(p * 70.0));
  } else {                   // rusted
    float n = c5f(p * 17.0); float pit = step(0.86, c5n(p * 45.0));
    col = mix(vec3(0.42, 0.20, 0.09), vec3(0.72, 0.34, 0.12), smoothstep(0.3, 0.7, n));
    col = mix(col, vec3(0.42, 0.43, 0.44), step(0.74, c5f(p * 8.0 + 3.0)) * 0.85);
    col = mix(col, vec3(0.13, 0.07, 0.04), pit * 0.8);
  }
  return clamp(col * k, 0.0, 1.5);
}`;

function patch(mat, id) {
  const pat = PAT[id];
  const basic = !!mat.isMeshBasicMaterial;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uC5T = skinClock;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vC5;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvC5 = position;');
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform float uC5T;\nvarying vec3 vC5;\nvec3 c5e;\n#define C5P ${pat}\n${GLSL}`);
    fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = c5skin(vC5, diffuseColor.rgb);' + (basic ? '\n diffuseColor.rgb += c5e;' : ''));
    if (!basic) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += c5e;');
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'c5skin' + pat + (basic ? 'b' : 'l');
  mat.needsUpdate = true;
  mat.userData.c5skin = id;
  return mat;
}

const cache = new Map();   // "skin|uuid" -> material
function skinFor(id, orig) {
  const k = id + '|' + orig.uuid;
  let m = cache.get(k);
  if (m) return m;
  if (orig.transparent && orig.blending === THREE.AdditiveBlending) {    // halo shells: tint only
    m = new THREE.MeshBasicMaterial({ color: SKIN_ACCENT[id], transparent: true, opacity: orig.opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    m.userData.c5skin = id;
  } else if (orig.isMeshLambertMaterial || orig.isMeshBasicMaterial || orig.isMeshPhongMaterial || orig.isMeshStandardMaterial) {
    m = patch(orig.clone(), id);
    m.map = orig.map; m.vertexColors = false;
  } else return null;
  cache.set(k, m);
  return m;
}
const isOurs = (m) => !!m?.userData?.c5skin;

/** skin every mesh under root; returns the number of meshes touched. Safe to call again with another skin. */
export function applySkin(root, id) {
  if (!root || !PAT[id]) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.c5noskin) return;
    const cur = o.material;
    if (Array.isArray(cur)) return;
    const st = o.userData.c5 || (o.userData.c5 = { orig: cur });
    const src = isOurs(cur) ? st.orig : cur;
    if (!isOurs(cur)) st.orig = cur;
    const m = skinFor(id, src);
    if (m) { o.material = m; st.id = id; n++; }
  });
  return n;
}
/** restore the original materials (meshes whose material was swapped by something else meanwhile are left alone) */
export function clearSkin(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    const st = o.userData?.c5;
    if (!o.isMesh || !st) return;
    if (isOurs(o.material)) { o.material = st.orig; n++; }
    delete o.userData.c5;
  });
  return n;
}
/** skin id currently on the object (first skinned mesh) or null */
export function skinOf(root) {
  let id = null;
  root?.traverse?.((o) => { if (!id && o.isMesh && isOurs(o.material)) id = o.material.userData.c5skin; });
  return id;
}
export function disposeSkins() { for (const m of cache.values()) m.dispose(); cache.clear(); }
