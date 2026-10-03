// TFG wave 8 - CREATURE READABILITY (module `creatureRead`, docs/wave8/creatureart.md). Installed with this.useModule('creatureRead', installCreatureRead).
// Presentation only, no balance numbers. Two jobs for EVERY client creature view (entities/creatures.js calls dress() once + apply() per frame):
//   1. an emissive TELL that reads in the dark: glowing eyes (dark eye materials are lifted to the type's tell colour) or, for models without any,
//      a shared unlit pair of eye dots (MeshBasicMaterial, fog off - never a THREE light);
//   2. a generic pose layer on the root (transform only, on top of the model's own animation and under feel.deathPose):
//      walk / run bob + lean, an attack WIND-UP (lean back over the 0.4 s of balance_rules RULES.windup, then the strike snaps forward) and a hit FLINCH.
// The three Creature Director monsters get their own silhouettes (models/creature_variants.js), registered into the mod model registry here.
import * as THREE from 'three';
import { QUALITY } from '../render/quality.js';
import { RULES } from './balance_rules.js';
import { VARIANT_MODELS } from '../models/creature_variants.js';

export const READ = { bob: 0.035, lean: 0.06, windBack: 0.3, strike: 0.34, strikeT: 0.22, flinch: 0.24, amax: 0.5 };
/** states whose first RULES.windup seconds are the telegraph and which then strike; 'hold' states only lean back while they last */
export const STRIKE_STATES = new Set(['attack', 'lunge', 'stab', 'snip', 'slam', 'stomp', 'shove', 'kick', 'scratch', 'hug', 'charge', 'bite']);
export const HOLD_STATES = new Set(['windup', 'winding', 'aim', 'draw']);
/** no pose layer: fixtures, ceiling / buried / swarm bodies that own their transform */
export const NO_POSE = new Set(['turret', 'mine', 'web', 'mimicdoor', 'sandkefal', 'leech', 'hoardnest', 'janitorbin', 'zombot', 'skel_swarm', 'ticketswarm', 'spambomb', 'dunemaw', 'c32_dormant', 'c32_ram']);
/** no added tell: the disguise IS the threat (the tell is behavioural) or the body is a fixture / instanced swarm */
export const NO_TELL = new Set(['mimic', 'mr_copy', 'lm_lootmimic', 'lm_masked', 'mimicdoor', 'web', 'mine', 'turret', 'hoardnest', 'janitorbin', 'zombot', 'c32_dormant', 'c32_ram']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (u) => 1 - (1 - u) * (1 - u);
export const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;

// ------------------------------------------------------------------------------------------------ pure pose maths
/** lean (rad, negative = back) and crouch fraction for a striking / holding state t seconds in. {pitch:0, crouch:0} for any other state. */
export function windupPose(state, t) { return windupInto({ pitch: 0, crouch: 0, phase: 'none' }, state, t); }
/** [perf5] same maths writing into a caller-owned object (apply() runs per creature per frame: no per-call objects) */
function windupInto(o, state, t) {
  const strike = STRIKE_STATES.has(state);
  if (!strike && !HOLD_STATES.has(state)) { o.pitch = 0; o.crouch = 0; o.phase = 'none'; return o; }
  const w = RULES.windup || 0.4;
  if (t < w || !strike) { const u = easeOut(clamp(t / w, 0, 1)); o.pitch = -READ.windBack * u; o.crouch = 0.6 * u; o.phase = 'windup'; return o; }
  const k = clamp((t - w) / READ.strikeT, 0, 1);
  o.pitch = lerp(READ.strike, 0, k * k); o.crouch = 0; o.phase = k < 1 ? 'strike' : 'recover'; return o;
}
/** hit flinch: hitFlash is 1 on the hit and decays to 0 in 0.25 s */
export const flinchPitch = (hitFlash) => -READ.flinch * clamp(hitFlash, 0, 1);
/** walk bob: phase advances by distance. Returns {dy (fraction of height), pitch, roll}. */
export function bobPose(phase, speed) { return bobInto({ dy: 0, pitch: 0, roll: 0 }, phase, speed); }
function bobInto(o, phase, speed) {
  const k = clamp(speed / 3, 0, 1), sn = Math.sin(phase);
  o.dy = Math.abs(sn) * READ.bob * k; o.pitch = READ.lean * clamp(speed / 6, 0, 1); o.roll = sn * 0.035 * k; return o;
}
/** [firstsight] the staged stare (state 'stare', firstsight.js): over ~1 s a slow forward lean, a hunch and a head tilt; the added eye dots flare */
export const STARE = { lean: 0.12, crouch: 0.35, tilt: 0.16, flare: 0.9, t: 1.1 };
export function starePose(t) { return stareInto({ pitch: 0, crouch: 0, roll: 0, flare: 0 }, t); }
function stareInto(o, t) { const u = easeOut(clamp(t / STARE.t, 0, 1)); o.pitch = STARE.lean * u; o.crouch = STARE.crouch * u; o.roll = STARE.tilt * u; o.flare = STARE.flare * u; return o; }
const _wp = { pitch: 0, crouch: 0, phase: 'none' }, _bp = { dy: 0, pitch: 0, roll: 0 }, _sp = { pitch: 0, crouch: 0, roll: 0, flare: 0 };
/** big bodies lean less (a 8 m giant tipping 0.3 rad would sweep 2.4 m) */
export const sizeK = (height) => clamp(1.9 / Math.max(height || 1.5, 0.5), 0.2, 1.4);

// ------------------------------------------------------------------------------------------------ tell colours + attach
const PALETTE = ['#ff3a2a', '#ffb02e', '#4fe8ff', '#7dff3a', '#ff40c8', '#f4f4ff', '#ff7a1a', '#b070ff'];
const TELL_COL = {
  yoinker: '#ffb02e', mannequin: '#f4f4ff', hound: '#ff3a2a', giant: '#ff5a3a', moderator: '#ff3a2a', stalker: '#ff40c8', mine: '#ff3a2a', turret: '#ff3a2a',
  hr_zombie: '#ff5a3a', hr_forger: '#ffb02e', hr_ambusher: '#ff3a2a', hr_warden: '#4fe8ff', mr_ghost: '#4fe8ff', mr_fiend: '#b070ff', br_smiler: '#ffe040', br_hound: '#ff7a1a', br_partygoer: '#ff40c8',
  br_moth: '#fff0a0', listener: '#f4f4ff', skel_walker: '#7fe8ff', skel_swarm: '#7fe8ff', lm_keeper: '#ff7a1a',
};
export function tellColour(type) {
  if (TELL_COL[type]) return TELL_COL[type];
  let h = 7; for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
let tellGeo = null; const tellMats = new Map();
function tellMat(col) { let m = tellMats.get(col); if (!m) { m = new THREE.MeshBasicMaterial({ color: col, fog: false, toneMapped: false }); m.userData.tell = true; tellMats.set(col, m); } return m; }
function tellGeometry() {
  if (!tellGeo) {
    const a = new THREE.SphereGeometry(0.035, 6, 4).translate(-0.055, 0, 0), b = new THREE.SphereGeometry(0.035, 6, 4).translate(0.055, 0, 0);
    tellGeo = new THREE.BufferGeometry();
    const pa = a.attributes.position.array, pb = b.attributes.position.array, pos = new Float32Array(pa.length + pb.length);
    pos.set(pa, 0); pos.set(pb, pa.length);
    tellGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ia = a.index.array, ib = b.index.array, idx = new Uint16Array(ia.length + ib.length);
    idx.set(ia, 0); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + pa.length / 3;
    tellGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    tellGeo.computeBoundingSphere();
  }
  return tellGeo;
}
/** any small unlit bright mesh (a model that already draws its own glowing eyes / lamp) */
function hasBrightSmall(root) {
  let n = 0;
  root.traverse((o) => {
    const m = o.isMesh && o.material;
    if (!m || !m.isMeshBasicMaterial || m.transparent || Math.max(m.color.r, m.color.g, m.color.b) <= 0.6) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 0.3) n++;
  });
  return n > 0;
}
/** make sure the model has an emissive tell. -> 'eyes' | 'bright' | 'added' | 'exempt' | 'none'. Idempotent. */
export function ensureTell(model, type, def = {}) {
  if (!model?.root) return 'none';
  if (model.parts?.tell?.length) return model.parts.tellKind || 'eyes';
  if (NO_TELL.has(type) || def.hazard) return 'exempt';
  const col = tellColour(type), eyes = model.parts?.eyes || [];
  if (eyes.length) {
    for (const m of eyes) {
      const base = m.userData?.baseColor || m.color;
      if (lum(base) < 0.3) { m.userData.baseColor?.set(col); if (lum(m.color) < 0.3) m.color.set(col); }
      m.userData.tell = true;
    }
    model.parts.tell = eyes.slice(); model.parts.tellKind = 'eyes';
    return 'eyes';
  }
  model.parts = model.parts || {};
  if (hasBrightSmall(model.root)) { model.parts.tell = [{ bright: true }]; model.parts.tellKind = 'bright'; return 'bright'; }
  const h = model.height || def.height || 1.5, s = clamp(h / 1.7, 0.5, 2.5);
  let y = h * 0.86, z = (model.radius || 0.35) * 0.7;
  const head = model.parts.head;
  if (head?.isObject3D) { model.root.updateMatrixWorld(true); const v = model.root.worldToLocal(head.getWorldPosition(new THREE.Vector3())); if (Number.isFinite(v.y) && v.y > 0.2 * h) { y = v.y + 0.03 * s; z = Math.max(0.05, v.z) + 0.09 * s; } }
  const mesh = new THREE.Mesh(tellGeometry(), tellMat(col));
  mesh.name = 'tell'; mesh.position.set(0, y, z); mesh.scale.setScalar(s); mesh.renderOrder = 3; mesh.userData.tell = true;
  model.root.add(mesh);
  model.parts.tell = [mesh]; model.parts.tellKind = 'added';
  return 'added';
}

// ------------------------------------------------------------------------------------------------ per-view layer
/** once per view, after the model is built (and elite / tint applied) */
export function dress(view) {
  try {
    const kind = ensureTell(view.model, view.type, view.def);
    const st = view._rd = { ph: Math.random() * 6.28, px: view.pos.x, pz: view.pos.z, kind, tellMesh: kind === 'added' ? view.model.parts.tell[0] : null, base: 0 };
    if (!NO_POSE.has(view.type) && !view.def?.hazard) view.root.rotation.order = 'YXZ';   // pitch about the local X axis after the yaw (feel.deathPose uses the same order)
    return st;
  } catch (e) { console.warn('[creatureRead] dress', view?.type, e); return null; }
}
/** every frame, after model.update() and before feel.deathPose(); reads view.{pos,state,stateT,hitFlash,height,type,root,mgr} */
export function apply(view, dt) {
  const s = view._rd;
  if (!s || NO_POSE.has(view.type) || view.def?.hazard || view.def?.boss) return;
  const root = view.root;
  if (view.state === 'dead') return;                                  // feel.deathPose owns the corpse
  const cam = view.mgr?.game?.camera?.position;
  const far = QUALITY.lodFar && cam && view.pos.distanceToSquared(cam) > QUALITY.lodFar * QUALITY.lodFar;
  const mx = view.pos.x - s.px, mz = view.pos.z - s.pz, sp = Math.min(14, Math.sqrt(mx * mx + mz * mz) / Math.max(dt, 1e-4));
  s.px = view.pos.x; s.pz = view.pos.z;
  if (far) { root.rotation.x = 0; root.rotation.z = 0; return; }       // perf2 LOD: far bodies keep the model's own pose only
  const h = view.height || view.model?.height || 1.5, k = sizeK(h);
  const speed = view.state === 'stunned' || view.state === 'idle' ? 0 : sp;
  s.ph = (s.ph + speed * dt / (0.9 * Math.sqrt(Math.max(h, 0.6)) ) * 6.2832) % 6.2832;
  const b = bobInto(_bp, s.ph, speed), w = windupInto(_wp, view.state, view.stateT);
  const st = view.state === 'stare' ? stareInto(_sp, view.stateT) : null;
  const pitch = clamp((w.pitch + b.pitch + flinchPitch(view.hitFlash) + (st ? st.pitch : 0)) * k, -READ.amax, READ.amax);
  root.rotation.x = pitch;
  root.rotation.z = (b.roll + (st ? st.roll : 0)) * k;
  root.position.y += b.dy * h - (w.crouch + (st ? st.crouch : 0)) * 0.05 * h - clamp(view.hitFlash, 0, 1) * 0.02 * h;
  if (s.tellMesh) s.tellMesh.scale.setScalar(clamp(h / 1.7, 0.5, 2.5) * (1 + (w.phase === 'windup' ? 0.7 * clamp(view.stateT / (RULES.windup || 0.4), 0, 1) : 0) + (st ? st.flare : 0)));
}

export function installCreatureRead(game) {
  const mm = (typeof window !== 'undefined' ? window.__kefalMods : null) || game?.mods;
  if (mm?.creatureModels) for (const [id, fn] of Object.entries(VARIANT_MODELS)) if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, (T, o) => fn(o || {}));
  return { dress, apply, ensureTell, windupPose, bobPose, starePose, tellColour, dispose() {} };
}
