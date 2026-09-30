// Wave 8 creature art: distinct models for the three Creature Director monsters that used to be a re-skinned Data Hoarder / Parasocial /
// Customer Support. Each wraps the base model (all its walk / attack / hurt / dead poses stay) and adds a silhouette part plus an unlit
// emissive tell that reads in the dark (no THREE lights).  Registered in the mod model registry by game/creature_read.js.
//   cd_dimmer   dusky Hoarder with an anglerfish LURE (bulb on a bent stalk) and dead bulbs along its back; the lure dims / flares with its hunger.
//   cd_follower ashen, stretched Parasocial without the phone: long hair curtain, huge cold-white stare that flares while it advances.
//   cd_auditor  gold-cast Support with a top hat and a glowing gold monocle that flares on 'audit' / 'attack'.
import * as THREE from 'three';
import { G, xf, merged, lam, basI, mk, pv, cloneMat, clamp, PI } from './modelkit.js';
import { createCreatureModel } from './creatures.js';

/** replace the base model's lambert materials with per-instance recoloured clones (owned -> disposed with the wrapper) */
function recolor(root, own, fn) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const one = !Array.isArray(o.material);
    const out = (one ? [o.material] : o.material).map((m) => {
      if (!m || !m.isMeshLambertMaterial || m.transparent || m.userData.noTint) return m;
      const c = cloneMat(m); fn(c.color); own.push(c); return c;
    });
    o.material = one ? out[0] : out;
  });
}

function wrap(id, baseId, opts, build) {
  const base = createCreatureModel(baseId, opts);
  const root = new THREE.Group(); root.name = 'creature_' + id;
  const scaler = pv(root, null, null, 'variant_scaler');
  scaler.add(base.root);
  const own = [], glow = [];
  const ex = build({ base, scaler, own, glow, opts }) || {};
  return {
    id, root,
    parts: { ...base.parts, ...(ex.parts || {}), eyes: [...(base.parts.eyes || []), ...glow], tell: glow },
    height: (base.height || 1.5) * (ex.heightMul || 1), radius: base.radius || 0.4,
    update(dt, a) { base.update(dt, a); ex.update?.(dt, a, base); },
    setElite(b) { base.setElite(b); },
    isElite: () => base.isElite(),
    setTint(color, strong) { base.setTint(color, strong); },   // extras live under base.root: its Tinter covers them
    setHitFlash(v) { base.setHitFlash(v); },
    dispose() { base.dispose(); for (const x of own) x.dispose?.(); own.length = 0; glow.length = 0; },
  };
}
const own$ = (S, m) => { S.own.push(m); return m; };
const lit$ = (S, color) => own$(S, cloneMat(lam(color)));
const glow$ = (S, color) => { const m = own$(S, basI(color, { fog: false })); m.userData.baseColor = new THREE.Color(color); m.userData.tell = true; S.glow.push(m); return m; };
const stateGlow = (m, k) => { m.color.copy(m.userData.baseColor).multiplyScalar(clamp(k, 0.05, 1.4)); };

// ------------------------------------------------------------------------------------------------ THE DIMMER
export function createDimmerModel(opts = {}) {
  return wrap('cd_dimmer', 'yoinker', opts, (S) => {
    const { base } = S;
    recolor(base.root, S.own, (c) => c.multiply(new THREE.Color(0.5, 0.44, 0.62)));   // dusky violet-grey instead of Hoarder yellow
    const head = base.parts.head, trunk = head.parent;
    const stalkM = lit$(S, '#1c1a22'), glassM = lit$(S, '#3a3844'), bulbM = glow$(S, '#ffc36a');
    // anglerfish lure: two bent stalk segments + a bulb, then a dim cage ring
    mk(head, merged('dm_stalk', () => [xf(G.cyl(0.006, 0.01, 0.28, 4), [0, 0.26, 0.07], [0.35, 0, 0]), xf(G.cyl(0.005, 0.006, 0.2, 4), [0, 0.42, 0.21], [1.2, 0, 0])]), stalkM);
    const bulb = mk(head, G.sph(0.055, 8, 6), bulbM, [0, 0.44, 0.31]);
    mk(head, G.tor(0.07, 0.006, 3, 8), stalkM, [0, 0.44, 0.31], [0, PI / 2, 0]);
    // dead bulbs along the back (the light it already ate)
    mk(trunk, merged('dm_spikes', () => [[0.13, 0.38, -0.38], [-0.13, 0.32, -0.4], [0, 0.55, -0.3], [0.05, 0.14, -0.44]].flatMap(([x, y, z]) => [xf(G.cone(0.03, 0.14, 4), [x, y, z - 0.05], [-1.2, 0, 0]), xf(G.sph(0.045, 6, 5), [x, y, z - 0.13])])), glassM);
    return {
      update(dt, a) {
        const st = a.state;
        const hunger = st === 'feed' ? 1 : st === 'run' || st === 'attack' ? 0.75 : st === 'walk' ? 0.45 : st === 'flee' ? 0.12 : st === 'dead' ? 0 : 0.3;
        const k = hunger + Math.sin((a.time || 0) * (st === 'feed' ? 12 : 4)) * 0.12 * (hunger > 0.2 ? 1 : 0);
        stateGlow(bulbM, k);
        bulb.scale.setScalar(0.85 + clamp(k, 0, 1.2) * 0.35);
      },
    };
  });
}

// ------------------------------------------------------------------------------------------------ THE FOLLOWER
export function createFollowerModel(opts = {}) {
  return wrap('cd_follower', 'stalker', opts, (S) => {
    const { base } = S;
    S.scaler.scale.set(0.9, 1.14, 0.9);                                         // gaunt and stretched
    recolor(base.root, S.own, (c) => { const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; if (l > 0.05) c.setRGB(Math.min(1, l * 1.15 + 0.08), Math.min(1, l * 1.15 + 0.08), Math.min(1, l * 1.2 + 0.1)); });
    const phone = base.root.getObjectByName('phone'); if (phone) phone.visible = false;   // it does not film you, it just looks
    const eyeM = base.parts.eyes?.[0];
    if (eyeM) {                                                                  // huge cold-white stare instead of the near-black pinpricks
      eyeM.color.set('#f4f8ff'); eyeM.userData.baseColor?.set('#f4f8ff'); eyeM.userData.tell = true; S.glow.push(eyeM);
      base.root.traverse((o) => { if (o.isMesh && o.material === eyeM) o.scale.multiplyScalar(1.9); });
    }
    const hairM = lit$(S, '#0a090c');
    mk(base.parts.head, merged('fl_hair', () => [-0.1, -0.05, 0, 0.05, 0.1].map((x, i) => xf(G.box(0.03, 1.0 - Math.abs(x) * 1.5, 0.02), [x, -0.42, -0.1 - Math.abs(x) * 0.2], [0.05, 0, x * 0.4]))), hairM);
    return { heightMul: 1.1, update(dt, a) { if (eyeM) eyeM.color.copy(eyeM.userData.baseColor).multiplyScalar(a.state === 'chase' ? 1.25 : a.state === 'dead' ? 0.1 : 0.85); } };
  });
}

// ------------------------------------------------------------------------------------------------ THE AUDITOR
export function createAuditorModel(opts = {}) {
  return wrap('cd_auditor', 'support', opts, (S) => {
    const { base } = S;
    recolor(base.root, S.own, (c) => c.multiply(new THREE.Color(1, 0.88, 0.55)));   // brass-cast suit
    const head = base.parts.head;
    const hatM = lit$(S, '#141418'), bandM = lit$(S, '#8a6a12'), monoM = glow$(S, '#ffd54a');
    mk(head, merged('au_hat', () => [xf(G.cyl(0.19, 0.19, 0.02, 12), [0, 0.245, 0]), xf(G.cyl(0.105, 0.115, 0.2, 10), [0, 0.35, 0])]), hatM);
    mk(head, G.cyl(0.118, 0.118, 0.04, 10), bandM, [0, 0.275, 0]);
    const mono = mk(head, G.tor(0.045, 0.009, 3, 10), monoM, [-0.055, 0.14, 0.112]);
    mk(head, G.cyl(0.003, 0.003, 0.2, 3), monoM, [-0.09, 0.03, 0.112]);              // the chain
    return {
      heightMul: 1.1,
      update(dt, a) {
        const st = a.state;
        const k = st === 'audit' || st === 'attack' || st === 'seize' ? 1.3 : st === 'run' ? 0.8 : st === 'dead' ? 0.05 : 0.5;
        stateGlow(monoM, k + Math.sin((a.time || 0) * 3) * 0.08);
        mono.scale.setScalar(k > 1 ? 1.25 : 1);
      },
    };
  });
}

export const VARIANT_MODELS = { cd_dimmer: createDimmerModel, cd_follower: createFollowerModel, cd_auditor: createAuditorModel };
