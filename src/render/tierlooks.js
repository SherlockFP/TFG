// TIER LOOKS (wave 2, module `skeletons` / docs/wave2/skeletons.md): a generic, cheap "armour + colour per creature tier" layer.
// Applied on the CLIENT CreatureView whenever `view.tier` is set (creature_tiers.js calls attachTierLook / tierLooksUpdate), so it works
// for EVERY creature, including ones registered later. It only adds gear: the tier aura ring / nameplate / body tint of
// game/creature_tiers.js stay where they are (Epic+ body tint is still done there; Uncommon / Rare tint is done here).
//
//   Common     base look
//   Uncommon   subtle green tint + small scrap-metal plates
//   Rare       blue tint + iron plates (chest / back / shoulders) + small helmet (where a head part exists) + buckler
//   Epic       purple emissive runes + heavier armour (spikes, tassets, belt) + glowing eyes
//   Legendary  gold armour + gold trim + tattered cape + orange embers
//   Mythic     red / black glitch armour (animated scanline shader) + crown + halo + distortion particles
//
// Cost: gear = ONE merged mesh per material (plate / trim / glow) built from cached, quantised geometry (shared by every creature of the
// same size and tier), shared materials per tier, no lights (emissive / unlit only), no per-frame allocations.
// Sizing: from the model's own bounding box in ROOT-LOCAL space (localBounds), or from a bone rig the model supplies:
//   model.tierRig(spec) -> { torso:{parent,frame}, head:{parent,frame}|null, shield:{parent,pos,rot,r}|null, cape:{parent,frame,tilt}|null,
//                            crown:{parent,frame}|null, crownOnly (model already has a helmet), skipShield, rusty, noEyes }
//   (skeletons.js: bones follow the animation)
// Safe to import in Node (no DOM at import time): tools/harness/skeletons.test.mjs covers the spec + gear builders.
import * as THREE from 'three';
import { G, xf, merged, TAU, PI, clamp } from '../models/modelkit.js';
import { TIER_ORDER } from '../game/tiers.js';

// ------------------------------------------------------------------------------------------------ spec (pure data)
/** Every field is data; `level` grows with the tier. `gear` = which pieces exist (the test checks the escalation). */
export const TIER_LOOK_SPEC = {
  common: { level: 0, tint: null, plates: null, helmet: null, shield: null, eyes: false, runes: false, trim: false, cape: false, embers: false, glitch: false, crown: false, halo: false, distortion: false, armor: null, glow: null, bone: '#d8d2bd' },
  uncommon: { level: 1, tint: '#4ecb5a', plates: 'scrap', helmet: null, rustyHelm: true, shield: null, eyes: false, runes: false, trim: false, cape: false, embers: false, glitch: false, crown: false, halo: false, distortion: false, armor: '#7f8577', glow: null, bone: '#cfd8ae' },
  rare: { level: 2, tint: '#3d8bff', plates: 'iron', helmet: 'iron', shield: 'buckler', eyes: false, runes: false, trim: false, cape: false, embers: false, glitch: false, crown: false, halo: false, distortion: false, armor: '#98a4b3', glow: null, bone: '#bfcde0' },
  epic: { level: 3, tint: '#b35cff', plates: 'heavy', helmet: 'horned', shield: 'buckler', eyes: true, runes: true, trim: false, cape: false, embers: false, glitch: false, crown: false, halo: false, distortion: false, armor: '#463763', glow: '#c58cff', bone: '#8f78c8' },
  legendary: { level: 4, tint: '#ff9a1f', plates: 'gold', helmet: 'crested', shield: 'buckler', eyes: true, runes: false, trim: true, cape: true, embers: true, glitch: false, crown: false, halo: false, distortion: false, armor: '#c9962c', glow: '#ffb347', bone: '#e8d59a' },
  mythic: { level: 5, tint: '#ff3b6b', plates: 'glitch', helmet: 'crowned', shield: 'buckler', eyes: true, runes: true, trim: true, cape: true, embers: false, glitch: true, crown: true, halo: true, distortion: true, armor: '#1a0a10', glow: '#ff3355', bone: '#2a0d14' },
};
export const LOOK_TIERS = TIER_ORDER;
export const PLATE_STYLES = ['scrap', 'iron', 'heavy', 'gold', 'glitch'];
/** creature types that never get gear (no body of their own, or a shared instanced body) */
export const NO_LOOK = new Set(['zombot', 'mimicdoor', 'web', 'sandkefal', 'hoardnest', 'janitorbin']);

// ------------------------------------------------------------------------------------------------ materials (shared per tier)
const matCache = new Map();
function shared(key, make) {
  let m = matCache.get(key);
  if (!m) { m = make(); m.userData.noTint = true; m.userData.tierLook = true; matCache.set(key, m); }
  return m;
}
const lamM = (color, emissive = '#000000', o = {}) => new THREE.MeshLambertMaterial({ color, emissive, flatShading: true, ...o });
const basM = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

let glitch = null;
const GLITCH_VS = `
#include <fog_pars_vertex>
uniform float uTime;
varying vec3 vP;
void main() {
  vP = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float band = floor(position.y * 16.0 + uTime * 2.0);
  float j = step(0.9, fract(sin(band * 12.9898 + floor(uTime * 7.0)) * 43758.5453));
  mvPosition.x += j * 0.05;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const GLITCH_FS = `
#include <fog_pars_fragment>
uniform float uTime;
varying vec3 vP;
void main() {
  float sc = 0.5 + 0.5 * sin(vP.y * 70.0 - uTime * 12.0);
  float chk = mod(floor(vP.x * 22.0) + floor(vP.y * 22.0) + floor(uTime * 5.0), 2.0);
  float m = smoothstep(0.3, 0.8, sc * 0.65 + chk * 0.4);
  vec3 c = mix(vec3(0.04, 0.0, 0.02), vec3(0.95, 0.06, 0.13), m);
  float flick = step(0.965, fract(sin(floor(uTime * 18.0) * 91.7 + floor(vP.y * 9.0)) * 437.5));
  c += flick * vec3(0.0, 0.85, 0.85) * 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <fog_fragment>
}`;
/** the ONE animated scanline material of every Mythic piece (uTime is written once per frame by tierLooksUpdate) */
export function glitchMat() {
  if (!glitch) {
    glitch = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: GLITCH_VS, fragmentShader: GLITCH_FS, fog: true, side: THREE.DoubleSide,
    });
    glitch.userData.noTint = true; glitch.userData.tierLook = true;
  }
  return glitch;
}
const PLATE_COL = { uncommon: ['#7f8577', '#000000'], rare: ['#98a4b3', '#0b1626'], epic: ['#463763', '#1a0a33'], legendary: ['#c9962c', '#3d2600'] };
export function plateMat(tier) {
  if (tier === 'mythic') return glitchMat();
  const c = PLATE_COL[tier] || PLATE_COL.rare;
  return shared('plate|' + tier, () => lamM(c[0], c[1]));
}
const TRIM_COL = { epic: '#b78cff', legendary: '#ffd45a', mythic: '#ff2244' };
export const trimMat = (tier) => shared('trim|' + tier, () => basM(TRIM_COL[tier] || '#ffd45a'));
const GLOW_COL = { epic: '#c58cff', legendary: '#ffb347', mythic: '#ff3355' };
export const glowMat = (tier) => shared('glow|' + tier, () => basM(GLOW_COL[tier] || '#c58cff'));
export const rustMat = () => shared('rust', () => lamM('#8a5a36', '#100600'));
export const clothMat = (tier) => (tier === 'mythic' ? glitchMat() : shared('cloth|' + tier, () => lamM('#7a1622', '#1a0206', { side: THREE.DoubleSide })));
export const haloMat = () => shared('halo', () => basM('#ff2a44', { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));

// ------------------------------------------------------------------------------------------------ frames + quantising (geometry cache keys)
const Q = 0.025;
const qn = (v) => Math.round(v / Q);
/** round a frame to 2.5 cm so creatures of the same size share one cached merged geometry; returns { f, key } */
export function quantFrame(f) {
  const q = { ...f };
  let key = f.style || 'h';
  for (const k of ['cx', 'cy', 'cz', 'w', 'h', 'd']) { if (typeof f[k] === 'number') { const n = qn(f[k]); q[k] = n * Q; key += '|' + n; } }
  return { f: q, key };
}
/** torso frame from a root-local bounding box */
export function torsoFrameFromBounds(b) {
  const W = b.max.x - b.min.x, H = b.max.y - b.min.y, D = b.max.z - b.min.z;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  if (H >= 0.85 * Math.max(W, D)) {
    return { style: 'humanoid', cx, cy: b.min.y + H * 0.63, cz, w: Math.max(0.05, Math.min(0.27 * H, 0.8 * W)), h: 0.3 * H, d: Math.max(0.04, Math.min(0.16 * H, 0.7 * D)), H };
  }
  return { style: 'beast', cx, cy: b.min.y + H * 0.62, cz, w: Math.max(0.05, W * 0.55), h: Math.max(0.05, H * 0.5), d: Math.max(0.05, D * 0.5), H };
}
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _bb = new THREE.Box3();
/** bounding box of every mesh under `obj`, expressed in obj's own local frame (independent of position / yaw / scale) */
export function localBounds(obj, out = new THREE.Box3()) {
  out.makeEmpty();
  obj.updateWorldMatrix(true, true);
  _inv.copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || o.userData.tierGear || o.visible === false || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) return;
    _bb.copy(g.boundingBox).applyMatrix4(_rel.multiplyMatrices(_inv, o.matrixWorld));
    if (Number.isFinite(_bb.min.x + _bb.min.y + _bb.min.z + _bb.max.x + _bb.max.y + _bb.max.z)) out.union(_bb);   // a part animated to scale 0 (hidden) has no usable size
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ geometry
const mesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.userData.tierGear = true; if (name) m.name = name; return m; };
const HALF = (r) => G.sph(r, 8, 4, 0, TAU, 0, PI / 2);   // top hemisphere

/** plate / trim / glow geometry lists for a torso frame at a look level (1 scrap .. 5 glitch) */
function torsoGeos(level, T) {
  const P = [], R = [], L = [];
  const { cx, cy, cz, w, h, d } = T;
  const th = clamp(h * 0.09, 0.008, 0.4);
  const fz = cz + d * 0.5 + th * 0.35, bz = cz - d * 0.5 - th * 0.35;
  if (T.style !== 'beast') {
    if (level === 1) {   // scrap: mismatched patches, riveted on
      P.push(xf(G.box(w * 0.5, h * 0.42, th), [cx - w * 0.12, cy + h * 0.05, fz], [0, 0, 0.12]));
      P.push(xf(G.box(w * 0.28, h * 0.22, th), [cx + w * 0.2, cy - h * 0.16, fz], [0, 0, -0.2]));
      P.push(xf(G.box(w * 0.32, h * 0.16, th * 1.6), [cx + w * 0.52, cy + h * 0.5, cz], [0.2, 0, 0.35]));
      P.push(xf(G.box(w * 0.7, h * 0.5, th), [cx, cy, bz], [0, 0, -0.06]));
      for (const [rx, ry] of [[-0.3, 0.2], [-0.02, -0.14], [0.22, 0.05]]) P.push(xf(G.box(th * 0.9, th * 0.9, th * 0.9), [cx + w * rx, cy + h * ry, fz + th * 0.6]));
      return { P, R, L };
    }
    const heavy = level >= 3;
    const tk = heavy ? 1.5 : 1;
    P.push(xf(G.box(w * 1.02, h * 0.62, th * tk), [cx, cy + h * 0.08, fz]));                 // breastplate
    P.push(xf(G.box(w * 0.9, h * 0.22, th * tk), [cx, cy - h * 0.36, fz - th * 0.2], [-0.08, 0, 0]));   // faulds
    P.push(xf(G.box(th * 0.7, h * 0.6, th * 1.2), [cx, cy + h * 0.08, fz + th * 0.5]));      // ridge
    P.push(xf(G.box(w * 0.95, h * 0.6, th * tk), [cx, cy + h * 0.06, bz]));                  // back plate
    P.push(xf(G.tor(w * 0.2, th * 0.55, 4, 8), [cx, cy + h * 0.55, cz], [PI / 2, 0, 0]));   // gorget
    for (const s of [1, -1]) {
      P.push(xf(HALF(w * (heavy ? 0.27 : 0.22)), [cx + s * (w * 0.56), cy + h * 0.5, cz], [0, 0, -s * 0.35], [1, 0.75, 1.15]));   // pauldrons
      if (heavy) {
        P.push(xf(G.cone(w * 0.05, w * 0.24, 5), [cx + s * (w * 0.66), cy + h * 0.78, cz], [0, 0, -s * 0.5]));                    // spikes
        P.push(xf(G.box(w * 0.36, h * 0.28, th), [cx + s * w * 0.25, cy - h * 0.62, fz - th * 0.4], [-0.12, 0, s * 0.06]));        // tassets
      }
    }
    if (heavy) P.push(xf(G.box(w * 1.06, h * 0.1, d * 1.08), [cx, cy - h * 0.5, cz]));       // belt
    if (level >= 3 && level !== 4) {   // runes / cracks: thin glowing strokes on the plates
      const rz = fz + th * tk * 0.55, e = th * 0.32;
      L.push(xf(G.box(e, h * 0.5, e), [cx, cy + h * 0.08, rz]));
      for (const s of [1, -1]) L.push(xf(G.box(e, h * 0.26, e), [cx + s * w * 0.16, cy + h * 0.14, rz], [0, 0, s * 0.9]));
      L.push(xf(G.oct(th * 0.9), [cx, cy + h * 0.32, rz + th * 0.2], [0, 0, 0], [1, 1.4, 0.5]));
      for (const s of [1, -1]) L.push(xf(G.oct(th * 0.7), [cx + s * w * 0.56, cy + h * 0.6, cz + w * 0.15], [0, 0, 0], [1, 1, 0.6]));
      for (let i = 0; i < 3; i++) L.push(xf(G.box(e, h * 0.14, e), [cx + (i - 1) * w * 0.16, cy + h * (0.28 - i * 0.14), bz - th * 0.6], [0, 0, (i % 2 ? 1 : -1) * 0.6]));   // cracks on the back
    }
    if (level >= 4) {   // trim: rims around the plates (gold at Legendary, red at Mythic)
      const rm = th * 0.5;
      R.push(xf(G.box(w * 1.06, rm, th * tk * 1.4), [cx, cy + h * 0.39, fz]));
      R.push(xf(G.box(w * 1.06, rm, th * tk * 1.4), [cx, cy - h * 0.23, fz]));
      for (const s of [1, -1]) {
        R.push(xf(G.box(rm, h * 0.62, th * tk * 1.4), [cx + s * w * 0.51, cy + h * 0.08, fz]));
        R.push(xf(G.tor(w * (heavy ? 0.27 : 0.22), rm * 0.7, 4, 10), [cx + s * (w * 0.56), cy + h * 0.5, cz], [PI / 2, 0, -s * 0.35], [1, 1.15, 0.6]));
      }
      R.push(xf(G.box(w * 0.14, h * 0.1, th * 2), [cx, cy - h * 0.5, cz + d * 0.55 + th]));   // buckle
    }
    return { P, R, L };
  }
  // beast / wide bodies: plates go on the back
  const n = level === 1 ? 2 : 3;
  const top = cy + h * 0.5;
  for (let i = 0; i < n; i++) {
    const z = cz + d * (n === 2 ? (i - 0.5) * 0.6 : (i - 1) * 0.32);
    const wd = w * (level === 1 ? 0.5 : 0.75 - Math.abs(i - (n - 1) / 2) * 0.12);
    P.push(xf(G.box(wd, th * (level >= 3 ? 1.6 : 1.2), d * (n === 2 ? 0.34 : 0.26)), [cx, top, z], [(i - (n - 1) / 2) * 0.1, 0, level === 1 ? (i ? -0.15 : 0.12) : 0]));
  }
  if (level >= 2) for (const s of [1, -1]) P.push(xf(HALF(w * 0.14), [cx + s * w * 0.55, cy + h * 0.15, cz + d * 0.18], [0, 0, -s * 0.5], [1, 0.8, 1]));
  if (level >= 3) for (let i = 0; i < 4; i++) P.push(xf(G.cone(w * 0.045, w * 0.2, 4), [cx, top + th * 1.2, cz + d * (i - 1.5) * 0.22]));
  if (level >= 3 && level !== 4) for (let i = 0; i < 3; i++) L.push(xf(G.box(th * 0.35, th * 0.3, d * 0.2), [cx, top + th * 1.0, cz + d * (i - 1) * 0.3]));
  if (level >= 4) for (let i = 0; i < n; i++) R.push(xf(G.box(w * 0.78, th * 0.5, d * 0.04), [cx, top + th * 0.9, cz + d * (n === 2 ? (i - 0.5) * 0.6 : (i - 1) * 0.32) + d * 0.13]));
  return { P, R, L };
}

/** one Group of merged gear meshes (plate / trim / glow) for a torso frame, or null (Common) */
export function makeTorsoGear(tier, T) {
  const spec = TIER_LOOK_SPEC[tier];
  if (!spec || !spec.level) return null;
  const { f, key } = quantFrame(T);
  const grp = new THREE.Group(); grp.name = 'tierGear';
  const k = `tg|${tier}|${key}`;
  const geo = (part) => merged(`${k}|${part}`, () => torsoGeos(spec.level, f)[part]);
  grp.add(mesh(geo('P'), plateMat(tier), 'plates'));
  if (spec.trim) grp.add(mesh(geo('R'), trimMat(tier), 'trim'));
  if (spec.runes) grp.add(mesh(geo('L'), glowMat(tier), 'runes'));
  return grp;
}

/** helmet / horns / crest / crown for a head frame {cx,cy,cz,w,h,d} in the head part's local space.
 *  crownOnly: the model already wears a helmet (Bone Knight): only the horns / crest / crown are added on top of it. */
export function makeHeadGear(tier, Hf, { rusty = false, eyes = true, crownOnly = false } = {}) {
  const spec = TIER_LOOK_SPEC[tier];
  if (!spec || !spec.level) return null;
  const kind = spec.helmet || (rusty && spec.rustyHelm ? 'rusty' : null);
  const { f, key } = quantFrame({ ...Hf, style: 'head' });
  const k = `hg|${tier}|${kind}|${eyes ? 1 : 0}${crownOnly ? 'c' : ''}|${key}`;
  const { cx, cy, cz, w, h, d } = f;
  const r = Math.max(w, d) * 0.62;
  const grp = new THREE.Group(); grp.name = 'tierHead';
  const extras = kind === 'horned' || kind === 'crested' || kind === 'crowned';
  if (kind && (!crownOnly || extras)) {
    const plate = merged(`${k}|P`, () => {
      const P = [];
      if (!crownOnly) {
        const rr = kind === 'rusty' ? r * 0.95 : r;
        P.push(xf(HALF(rr), [cx, cy + h * 0.12, cz], [0, 0, 0], [1, kind === 'rusty' ? 0.8 : 0.95, 1.05]));
        P.push(xf(G.tor(rr * 0.98, rr * 0.07, 4, 10), [cx, cy + h * 0.12, cz], [PI / 2, 0, 0]));
        if (kind !== 'rusty') P.push(xf(G.box(w * 0.06, h * 0.42, d * 0.05), [cx, cy - h * 0.02, cz + d * 0.52]));
      }
      const top = crownOnly ? cy + h * 0.55 : cy + h * 0.12 + r * 0.95;
      if (kind === 'horned') for (const s of [1, -1]) P.push(xf(G.cone(w * 0.07, h * 0.5, 5), [cx + s * r * 0.9, cy + h * 0.32, cz], [0, 0, -s * 1.05]));
      if (kind === 'crested') P.push(xf(G.box(w * 0.06, h * 0.28, d * 0.7), [cx, top, cz]));
      if (kind === 'crowned') for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; P.push(xf(G.cone(w * 0.06, h * 0.5, 4), [cx + Math.cos(a) * r * 0.85, crownOnly ? cy + h * 0.6 : cy + h * 0.5 + r * 0.55, cz + Math.sin(a) * r * 0.85])); }
      return P;
    });
    grp.add(mesh(plate, kind === 'rusty' ? rustMat() : plateMat(tier), 'helmet'));
    if (!crownOnly && (kind === 'crested' || kind === 'crowned')) {
      const trim = merged(`${k}|R`, () => [xf(G.tor(r * 0.98, r * 0.07, 4, 10), [cx, cy + h * 0.12 + r * 0.2, cz], [PI / 2, 0, 0])]);
      grp.add(mesh(trim, trimMat(tier), 'helmTrim'));
    }
  }
  if (spec.eyes && eyes) {
    const glow = merged(`${k}|E`, () => [xf(G.box(w * 0.13, h * 0.08, 0.012), [cx - w * 0.22, cy, cz + d * 0.5 + 0.004]), xf(G.box(w * 0.13, h * 0.08, 0.012), [cx + w * 0.22, cy, cz + d * 0.5 + 0.004])]);
    grp.add(mesh(glow, glowMat(tier), 'eyes'));
  }
  return grp.children.length ? grp : null;
}

/** floating halo ring above a head frame (Mythic) */
export function makeHalo(Hf) {
  const { f, key } = quantFrame({ ...Hf, style: 'halo' });
  const geo = merged(`halo|${key}`, () => [xf(G.tor(Math.max(f.w, f.d) * 0.85, Math.max(f.w, f.d) * 0.055, 4, 16), [0, 0, 0], [PI / 2, 0, 0])]);
  const m = mesh(geo, haloMat(), 'halo');
  m.position.set(f.cx, f.cy + f.h * 1.05, f.cz);
  m.renderOrder = 3;
  return m;
}

/** round buckler for a mount {pos:[x,y,z], rot:[rx,ry,rz], r} in the parent's local space */
export function makeShield(tier, S) {
  const spec = TIER_LOOK_SPEC[tier];
  if (!spec || !spec.shield) return null;
  const r = Math.max(0.04, Math.round(S.r / Q) * Q);
  const k = `sh|${tier}|${Math.round(r * 100)}`;
  const grp = new THREE.Group(); grp.name = 'tierShield';
  const plate = merged(`${k}|P`, () => [xf(G.cyl(r, r * 0.92, r * 0.16, 10), [0, 0, 0], [PI / 2, 0, 0]), xf(G.sph(r * 0.3, 6, 4), [0, 0, r * 0.1])]);
  grp.add(mesh(plate, plateMat(tier), 'shield'));
  if (spec.trim) grp.add(mesh(merged(`${k}|R`, () => [xf(G.tor(r * 0.98, r * 0.06, 4, 12), [0, 0, r * 0.08])]), trimMat(tier), 'shieldRim'));
  if (spec.runes) grp.add(mesh(merged(`${k}|L`, () => [xf(G.box(r * 0.1, r * 1.1, r * 0.06), [0, 0, r * 0.12]), xf(G.box(r * 1.1, r * 0.1, r * 0.06), [0, 0, r * 0.12])]), glowMat(tier), 'shieldRunes'));
  grp.position.fromArray(S.pos); grp.rotation.set(S.rot[0], S.rot[1], S.rot[2]);
  return grp;
}

/** tattered cape / banner hanging from the shoulders: two swaying segments. Returns { group, p1, p2 } */
export function makeCape(tier, T, tilt = 0.12) {
  const spec = TIER_LOOK_SPEC[tier];
  if (!spec || !spec.cape) return null;
  const { f, key } = quantFrame(T);
  const L = (T.H || f.h * 3.3) * 0.5;
  const k = `cp|${tier}|${key}`;
  const back = f.cz - f.d * 0.5 - 0.02;
  const top = new THREE.Group(); top.name = 'tierCape';
  top.position.set(f.cx, f.cy + f.h * 0.5, back);
  const p1 = new THREE.Group(); p1.rotation.x = tilt; top.add(p1);
  const g1 = merged(`${k}|1`, () => [xf(G.boxY(f.w * 1.0, L * 0.55, 0.012))]);
  p1.add(mesh(g1, clothMat(tier), 'cape1'));
  const p2 = new THREE.Group(); p2.position.y = -L * 0.55; p1.add(p2);
  const g2 = merged(`${k}|2`, () => [xf(G.boxY(f.w * 0.3, L * 0.36, 0.012), [-f.w * 0.33, 0, 0]), xf(G.boxY(f.w * 0.3, L * 0.5, 0.012), [0, 0, 0]), xf(G.boxY(f.w * 0.3, L * 0.3, 0.012), [f.w * 0.33, 0, 0])]);
  p2.add(mesh(g2, clothMat(tier), 'cape2'));
  if (spec.trim) p1.add(mesh(merged(`${k}|R`, () => [xf(G.box(f.w * 1.02, 0.028, 0.02))]), trimMat(tier), 'capeTrim'));
  return { group: top, p1, p2, tilt };
}

/** every gear piece Uncommon..Mythic would add for a frame (used by the test: triangle budget per tier) */
export function buildAllGear(tier, T, Hf, S) {
  const out = { torso: makeTorsoGear(tier, T), head: Hf ? makeHeadGear(tier, Hf) : null, shield: S ? makeShield(tier, S) : null, cape: makeCape(tier, T), halo: TIER_LOOK_SPEC[tier].halo && Hf ? makeHalo(Hf) : null };
  return out;
}
export function gearTriangles(obj) {
  let n = 0;
  obj?.traverse?.((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return Math.round(n);
}

// ------------------------------------------------------------------------------------------------ client: attach + update
const LOOKS = new Set();
const EMBER = { count: 1, color: [0xffb040, 0xff7a1a, 0xffe08a], speed: 0.35, up: 1.0, life: 1.4, size: 0.045, gravity: -0.5, drag: 1.5 };
const _p = new THREE.Vector3(), _b = new THREE.Box3(), _hb = new THREE.Box3();
const FADERS = new Set(['screamer']);

/** head frame from a model part; null when the part is missing, is the whole model, or is implausibly large */
function headFrameOf(head, root, H) {
  if (!head || head === root || !head.isObject3D) return null;
  localBounds(head, _hb);
  if (_hb.isEmpty()) return null;
  const w = _hb.max.x - _hb.min.x, h = _hb.max.y - _hb.min.y, d = _hb.max.z - _hb.min.z;
  if (h > H * 0.5 || w > H * 0.6 || w < 0.02) return null;
  return { cx: (_hb.min.x + _hb.max.x) / 2, cy: (_hb.min.y + _hb.max.y) / 2, cz: (_hb.min.z + _hb.max.z) / 2, w, h, d };
}

/**
 * Give a tiered CreatureView its look (idempotent). Call once per view (creature_tiers.js does).
 * ctx: { particles } is read at update time via tierLooksUpdate.
 */
export function attachTierLook(v) {
  const spec = TIER_LOOK_SPEC[v?.tier];
  const model = v?.model, root = v?.root;
  if (!spec || !spec.level || !model || !root || v.tierLook) return null;
  if (NO_LOOK.has(v.type) || v.def?.hazard || v.def?.noTierLook) return null;
  // colour tint: Uncommon / Rare here; Epic+ is tinted by creature_tiers.js (aura colours stay there)
  if (spec.level < 3 && spec.tint && !v.affix && !v.variant?.tint) { try { model.setTint?.(spec.tint, false); } catch { /* cosmetic */ } }
  const rig = (() => { try { return model.tierRig?.(spec) || null; } catch (e) { console.warn('[tierlooks] rig', v.type, e); return null; } })();
  root.updateMatrixWorld(true);
  let torso, head = null, shield = null, capeAt = null, crownAt = null;
  if (rig) {
    torso = rig.torso; head = rig.head || null; shield = rig.shield || null; capeAt = rig.cape || rig.torso; crownAt = rig.crown || rig.head || null;
  } else {
    localBounds(root, _b);
    if (_b.isEmpty()) return null;
    const T = torsoFrameFromBounds(_b);
    torso = { parent: root, frame: T };
    const hf = headFrameOf(model.parts?.head, root, T.H);
    if (hf) { head = { parent: model.parts.head, frame: hf }; crownAt = head; }
    if (T.style === 'humanoid' && spec.shield) shield = { parent: root, pos: [T.cx - T.w * 0.66, T.cy - T.h * 0.1, T.cz + T.d * 0.55], rot: [0, 0.35, 0], r: T.H * 0.11 };
    capeAt = torso;
  }
  const look = { v, spec, objs: [], cape: null, halo: null, pT: 0, p2T: 0, px: v.pos.x, pz: v.pos.z, sp: 0, seed: (v.id ? String(v.id).length : 1) + v.pos.x, fade: FADERS.has(v.type) || v.affix === 'shadowbanned', tor: torso.frame };
  const add = (parent, o) => { if (!o) return; parent.add(o); look.objs.push(o); };
  add(torso.parent, makeTorsoGear(v.tier, torso.frame));
  if (head) add(head.parent, makeHeadGear(v.tier, head.frame, { rusty: !!rig?.rusty, eyes: !rig?.noEyes && !(model.parts?.eyes?.length), crownOnly: !!rig?.crownOnly }));
  if (shield && !rig?.skipShield) add(shield.parent, makeShield(v.tier, shield));
  if (spec.cape && capeAt) {
    const c = makeCape(v.tier, capeAt.frame, rig?.capeTilt ?? (capeAt.frame.style === 'beast' ? 1.25 : 0.12));
    if (c) { add(capeAt.parent, c.group); look.cape = c; }
  }
  if (spec.halo && crownAt) { const hl = makeHalo(crownAt.frame); crownAt.parent.add(hl); look.objs.push(hl); look.halo = hl; look.haloY = hl.position.y; }
  if (look.objs.length) { v.tierLook = look; LOOKS.add(look); }
  return look;
}

/** per frame: shared shader clock, cape sway, halo spin, embers / distortion particles. No allocations. */
export function tierLooksUpdate(dt, game) {
  const time = game?.time || 0;
  if (glitch) glitch.uniforms.uTime.value = time;
  if (!LOOKS.size) return;
  const cam = game?.camera?.position, parts = game?.particles;
  for (const L of LOOKS) {
    const v = L.v;
    if (!v.root?.parent || v.state === 'dead') { LOOKS.delete(L); continue; }
    if (L.fade) { const vis = !(v.alpha < 0.5); if (vis !== L.vis) { L.vis = vis; for (const o of L.objs) o.visible = vis; } }
    const dx = cam ? v.pos.x - cam.x : 0, dz = cam ? v.pos.z - cam.z : 0, d2 = dx * dx + dz * dz;
    if (d2 > 3600) continue;
    if (L.cape) {
      const s = dt > 0 ? Math.hypot(v.pos.x - L.px, v.pos.z - L.pz) / dt : 0;
      L.sp += (Math.min(8, s) - L.sp) * Math.min(1, dt * 4);
      L.px = v.pos.x; L.pz = v.pos.z;
      const t = time * 2 + L.seed;
      L.cape.p1.rotation.x = L.cape.tilt + L.sp * 0.045 + Math.sin(t) * 0.05;
      L.cape.p2.rotation.x = Math.sin(t * 1.4 + 1) * 0.12 + L.sp * 0.03;
      L.cape.p2.rotation.z = Math.sin(t * 0.8) * 0.06;
    }
    if (L.halo) { L.halo.rotation.y += dt * 1.8; L.halo.position.y = L.haloY + Math.sin(time * 2 + L.seed) * 0.03; }
    if (!parts || d2 > 676 || !v.root.visible) continue;
    if (L.spec.embers) {
      L.pT -= dt;
      if (L.pT <= 0) {
        L.pT = 0.16 + Math.random() * 0.12;
        _p.set(v.pos.x + (Math.random() - 0.5) * (v.radius || 0.5), v.pos.y + (v.height || 1.5) * (0.5 + Math.random() * 0.45), v.pos.z + (Math.random() - 0.5) * (v.radius || 0.5));
        parts.burst(_p, EMBER, null, 1);
      }
    }
    if (L.spec.distortion) {
      L.p2T -= dt;
      if (L.p2T <= 0) {
        L.p2T = 0.55 + Math.random() * 0.4;
        _p.set(v.pos.x + (Math.random() - 0.5) * (v.radius || 0.5) * 2, v.pos.y + (v.height || 1.5) * (0.2 + Math.random() * 0.8), v.pos.z + (Math.random() - 0.5) * (v.radius || 0.5) * 2);
        parts.burst(_p, 'glitch', null, 0.12);
      }
    }
  }
}
export const tierLookCount = () => LOOKS.size;
/** forget every running look (game teardown; gear meshes go with their view roots, geometry + materials are shared) */
export function clearTierLooks() { LOOKS.clear(); }
