// skeletons.js (models) - procedural PSX models for the DELETED USERS family (docs/wave2/skeletons.md):
//   Bone Walker  ragged skeleton with a lanyard badge; collapses into a heap and (once) reassembles ('collapsed' / 'rise' states)
//   Bone Archer  hunched, CD bandolier; visible wind-up ('draw': arm back, held shard / CD glows) -> whip ('throw')
//   Bone Knight  great helm, kite shield on the left arm (jolts on a block, flung aside when staggered), rusty sword
//   Bone Swarm   tiny skull-headed hand crawling on its fingertips
// Model contract (CreatureView): { root, parts, height, radius, update(dt, anim), setElite, setTint, setHitFlash, dispose, tierRig }.
// `tierRig(spec)` is the bespoke tier-gear hook read by src/render/tierlooks.js: it swaps the bone colour per tier and returns the bones the
// gear is attached to (so armour / shield / cape follow the animation). Rusty helmet -> iron armour + shield -> purple rune bones -> gold
// armour + cape -> red glitch crown, all through the same shared gear builders every other creature uses.
import * as THREE from 'three';
import { G, xf, merged, lam, bas, basI, tex, noiseFill, mk, pv, Tinter, clamp, lerp, smooth, rng, TAU, PI } from './modelkit.js';
import { plateMat, rustMat, trimMat, glowMat } from '../render/tierlooks.js';
import { TUNING } from '../game/skeleton_data.js';

const HALF = (r) => G.sph(r, 8, 4, 0, TAU, 0, PI / 2);
const BONE = '#d8d2bd';
const boneTex = () => tex('skBone', 32, 32, (c, w, h, r) => {
  noiseFill(c, w, h, r, '#ffffff', 0.15, 2);
  c.fillStyle = 'rgba(80,60,30,0.2)';
  for (let i = 0; i < 16; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 1 + ((r() * 3) | 0), 1);
});
const cdTex = () => tex('skCD', 32, 32, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, h);
  ['#ff5ad0', '#5affe0', '#fff45a', '#5a8cff', '#ff5ad0'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#20222a'; c.beginPath(); c.arc(w / 2, h / 2, 4, 0, TAU); c.fill();
}, false);

const tierBones = new Map();
const TIER_BONE_EMISSIVE = { uncommon: '#000000', rare: '#000000', epic: '#2a1050', legendary: '#3a2a00', mythic: '#4a0510' };
/** shared per-tier bone material (greenish / bluish / violet glow / gold-white / charred red) */
function tierBone(tier, spec) {
  let m = tierBones.get(tier);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: spec.bone, emissive: TIER_BONE_EMISSIVE[tier] || '#000000', map: boneTex(), flatShading: true });
    tierBones.set(tier, m);
  }
  return m;
}

// ------------------------------------------------------------------------------------------------ shared geometry
const GEO = {};
function geos() {
  if (GEO.ready) return GEO;
  GEO.ready = true;
  GEO.thigh = G.segY(0.44, 0.034, 0.026, 5);
  GEO.shin = merged('sk_shin', () => [xf(G.segY(0.42, 0.026, 0.02, 5)), xf(G.box(0.075, 0.035, 0.17), [0, -0.43, 0.045]), xf(G.sph(0.03, 5, 4))]);
  GEO.pelvis = merged('sk_pelvis', () => [xf(G.box(0.27, 0.07, 0.12), [0, 0.02, 0]), xf(G.box(0.08, 0.1, 0.1), [0.12, 0.06, 0], [0, 0, -0.4]), xf(G.box(0.08, 0.1, 0.1), [-0.12, 0.06, 0], [0, 0, 0.4]), xf(G.sph(0.035, 5, 4), [0.1, -0.02, 0]), xf(G.sph(0.035, 5, 4), [-0.1, -0.02, 0])]);
  GEO.ribs = merged('sk_ribs', () => {
    const L = [];
    for (let i = 0; i < 5; i++) {
      const y = 0.1 + i * 0.065, r = 0.085 + (i < 3 ? i * 0.012 : (4 - i) * 0.014 + 0.02);
      L.push(xf(G.tor(r, 0.0085, 3, 8, PI * 1.4), [0, y, 0], [PI / 2, 0, -PI * 0.2], [1, 0.8, 1]));
    }
    L.push(xf(G.box(0.028, 0.3, 0.02), [0, 0.26, 0.075]), xf(G.box(0.03, 0.5, 0.03), [0, 0.26, -0.06]), xf(G.box(0.34, 0.025, 0.03), [0, 0.44, 0]));
    L.push(xf(G.box(0.09, 0.11, 0.015), [0.1, 0.36, -0.06]), xf(G.box(0.09, 0.11, 0.015), [-0.1, 0.36, -0.06]), xf(G.box(0.035, 0.08, 0.035), [0, 0.5, 0]));
    return L;
  });
  GEO.skull = merged('sk_skull', () => [xf(G.sph(0.1, 8, 6), [0, 0.09, 0], [0, 0, 0], [0.95, 1.02, 1.08]), xf(G.box(0.16, 0.03, 0.05), [0, 0.09, 0.085]), xf(G.box(0.15, 0.03, 0.05), [0, 0.02, 0.08]), xf(G.box(0.1, 0.025, 0.05), [0, -0.01, 0.075])]);
  GEO.sockets = merged('sk_sockets', () => [xf(G.circle(0.03, 8), [0.04, 0.075, 0.1]), xf(G.circle(0.03, 8), [-0.04, 0.075, 0.1]), xf(G.box(0.02, 0.03, 0.01), [0, 0.03, 0.105])]);
  GEO.eyes = merged('sk_eyes', () => [xf(G.sph(0.014, 4, 3), [0.04, 0.075, 0.094]), xf(G.sph(0.014, 4, 3), [-0.04, 0.075, 0.094])]);
  GEO.jaw = merged('sk_jaw', () => [xf(G.box(0.11, 0.028, 0.085), [0, -0.035, 0.05]), xf(G.box(0.09, 0.02, 0.05), [0, -0.012, 0.075])]);
  GEO.upper = G.segY(0.3, 0.022, 0.018, 5);
  GEO.fore = merged('sk_fore', () => [xf(G.segY(0.29, 0.018, 0.014, 5)), xf(G.box(0.05, 0.06, 0.02), [0, -0.32, 0]), xf(G.box(0.008, 0.06, 0.008), [0.018, -0.375, 0]), xf(G.box(0.008, 0.06, 0.008), [0, -0.375, 0.012]), xf(G.box(0.008, 0.06, 0.008), [-0.018, -0.375, 0])]);
  GEO.badge = merged('sk_badge', () => [xf(G.box(0.07, 0.095, 0.008), [0, 0, 0]), xf(G.box(0.006, 0.12, 0.004), [0.02, 0.09, -0.01], [0, 0, 0.5]), xf(G.box(0.006, 0.12, 0.004), [-0.02, 0.09, -0.01], [0, 0, -0.5])]);
  GEO.bando = merged('sk_bando', () => [xf(G.tor(0.135, 0.008, 3, 10), [0, 0.26, 0], [0.2, 0, 0.6], [1, 1.2, 1])]);
  GEO.cds = merged('sk_cds', () => [-0.06, 0, 0.06].map((x, i) => xf(G.cyl(0.04, 0.04, 0.006, 10), [x * 0.85 + 0.02, 0.3 - i * 0.05, 0.1 - Math.abs(x) * 0.25], [PI / 2, 0, 0.3])));
  GEO.helm = merged('sk_helm', () => [xf(G.cyl(0.115, 0.12, 0.2, 8), [0, 0.09, 0]), xf(G.cyl(0.115, 0.115, 0.02, 8), [0, 0.2, 0]), xf(G.box(0.04, 0.03, 0.03), [0, 0.02, 0.1])]);
  GEO.visor = merged('sk_visor', () => [xf(G.box(0.12, 0.022, 0.012), [0, 0.11, 0.118]), xf(G.box(0.02, 0.09, 0.012), [0, 0.06, 0.118])]);
  GEO.chest = merged('sk_chest', () => [xf(G.box(0.3, 0.27, 0.05), [0, 0.28, 0.078]), xf(G.box(0.26, 0.1, 0.05), [0, 0.1, 0.07]), xf(G.box(0.3, 0.27, 0.03), [0, 0.28, -0.085])]);
  GEO.pauld = merged('sk_pauld', () => [xf(HALF(0.095), [0, 0.02, 0], [0, 0, 0], [1, 0.8, 1.1])]);
  GEO.shield = merged('sk_shield', () => [xf(G.box(0.36, 0.34, 0.03), [0, 0.15, 0]), xf(G.box(0.25, 0.25, 0.03), [0, -0.13, 0], [0, 0, PI / 4])]);
  GEO.shieldRim = merged('sk_shieldRim', () => [xf(G.box(0.38, 0.03, 0.045), [0, 0.32, 0]), xf(G.box(0.03, 0.34, 0.045), [0.18, 0.15, 0]), xf(G.box(0.03, 0.34, 0.045), [-0.18, 0.15, 0]), xf(G.box(0.045, 0.24, 0.045), [0.09, -0.21, 0], [0, 0, 0.78]), xf(G.box(0.045, 0.24, 0.045), [-0.09, -0.21, 0], [0, 0, -0.78]), xf(G.sph(0.05, 6, 4), [0, 0.08, 0.03])]);
  GEO.shieldX = merged('sk_shieldX', () => [xf(G.box(0.03, 0.2, 0.01), [0, 0.1, 0.02], [0, 0, 0.7]), xf(G.box(0.03, 0.2, 0.01), [0, 0.1, 0.02], [0, 0, -0.7])]);
  GEO.blade = merged('sk_blade', () => [xf(G.box(0.045, 0.56, 0.012), [0, 0.32, 0]), xf(G.box(0.15, 0.025, 0.03), [0, 0.05, 0]), xf(G.box(0.025, 0.1, 0.025), [0, -0.02, 0])]);
  GEO.shard = merged('sk_shard', () => [xf(G.cone(0.02, 0.2, 4), [0, 0.02, 0], [PI / 2, 0, 0])]);
  GEO.cd = merged('sk_cd', () => [xf(G.cyl(0.065, 0.065, 0.008, 12), [0, 0, 0], [0, 0, PI / 2])]);
  // swarm hand
  GEO.palm = merged('sk_palm', () => [xf(G.box(0.09, 0.03, 0.1), [0, 0, 0]), xf(G.box(0.05, 0.03, 0.06), [0, 0, -0.08]), xf(G.sph(0.055, 7, 5), [0, 0.07, -0.005], [0, 0, 0], [1, 0.95, 1.05]), xf(G.box(0.06, 0.02, 0.03), [0, 0.03, 0.04])]);
  GEO.palmSockets = merged('sk_palmSock', () => [xf(G.circle(0.016, 6), [0.022, 0.08, 0.05]), xf(G.circle(0.016, 6), [-0.022, 0.08, 0.05])]);
  GEO.fingersA = merged('sk_fingA', () => [0, 2, 4].flatMap(fingerGeo));
  GEO.fingersB = merged('sk_fingB', () => [1, 3].flatMap(fingerGeo));
  return GEO;
}
/** one finger of the crawling hand (two segments), splayed at [-1.5..1.5] rad around the palm; returns 2 geometries */
function fingerGeo(i) {
  const a = [-1.5, -0.75, 0, 0.75, 1.5][i];
  const seg1 = xf(G.segZ(0.075, 0.008, 0.006, 4), [0, 0, 0], [0.75, 0, 0]);
  const seg2 = xf(G.segZ(0.055, 0.006, 0.004, 4), [0, -0.051, 0.055], [0.1, 0, 0]);
  return [seg1, seg2].map((g) => xf(g, [Math.sin(a) * 0.045, 0, Math.cos(a) * 0.05], [0, a, 0]));
}

// ------------------------------------------------------------------------------------------------ the skeleton rig
function buildSkeleton(kind, opts = {}) {
  const g = geos();
  const R = rng((opts.seed || 1) * 7 + 3);
  const root = new THREE.Group();
  const body = pv(root, null, null, 'scaler');
  const sc = pv(body, null, null, 'skscale');
  sc.scale.setScalar(kind === 'knight' ? 1.1 : kind === 'archer' ? 0.97 : 1);
  const bone = lam(BONE, { map: boneTex() });
  const bones = [];
  const B = (parent, geo, p, r, s) => { const m = mk(parent, geo, bone, p, r, s); bones.push(m); return m; };
  const iron = lam('#4d4038'), ironD = lam('#2c2622');
  const hips = pv(sc, [0, 0.9, 0]);
  B(hips, g.pelvis);
  const legs = [1, -1].map((s) => { const thigh = pv(hips, [s * 0.1, -0.02, 0]); B(thigh, g.thigh); const knee = pv(thigh, [0, -0.44, 0]); B(knee, g.shin); return { thigh, knee, s }; });
  const spine = pv(hips, [0, 0.06, 0]);
  B(spine, g.ribs);
  const skull = pv(spine, [0, 0.56, 0.01], null, 'head');
  B(skull, g.skull);
  mk(skull, g.sockets, bas('#0a0a0a'));
  const eyeM = basI('#7fe8ff'); eyeM.userData.noTint = true;
  mk(skull, g.eyes, eyeM);
  const jaw = pv(skull, [0, -0.02, 0]);
  B(jaw, g.jaw);
  const arms = [1, -1].map((s) => { const sh = pv(spine, [s * 0.19, 0.44, 0]); B(sh, g.upper); const el = pv(sh, [0, -0.3, 0]); B(el, g.fore); return { sh, el, s }; });
  const [aL, aR] = arms;   // +x = the creature's left hand (it faces +z), -x = its right hand (weapon / projectile)
  const X = { kind, hold: null, shardM: null, cdM: null, shield: null, shieldFace: null, shieldRim: null, shieldGlow: null, helm: null, chest: null, pauld: [], sword: null };
  if (kind === 'walker') {
    mk(spine, g.badge, lam('#e6e3d6'), [-0.07, 0.27, 0.085], [0, 0, 0.15]);
  } else if (kind === 'archer') {
    spine.rotation.x = 0.22;
    mk(spine, g.bando, lam('#5a4630'));
    mk(spine, g.cds, lam('#ffffff', { map: cdTex() }));
    X.hold = pv(aR.el, [0, -0.33, 0.03]);
    X.useCD = ((opts.seed || 1) % 2) === 1;
    X.shardM = mk(X.hold, g.shard, basI('#f2efe0')); X.shardM.visible = false;
    X.cdM = mk(X.hold, g.cd, basI('#ffffff', { map: cdTex() })); X.cdM.visible = false;
    X.shardM.name = 'held'; X.cdM.name = 'held';
    X.projM = X.useCD ? X.cdM : X.shardM;
  } else if (kind === 'knight') {
    X.helm = mk(skull, g.helm, iron); mk(skull, g.visor, bas('#050505'));
    X.chest = mk(spine, g.chest, iron);
    for (const a of arms) { const p = mk(a.sh, g.pauld, iron, [a.s * 0.02, 0.03, 0]); X.pauld.push(p); }
    X.shield = pv(spine, [0.27, 0.2, 0.17], [0, -0.15, 0]);
    X.shieldFace = mk(X.shield, g.shield, iron);
    X.shieldRim = mk(X.shield, g.shieldRim, ironD);
    mk(X.shield, g.shieldX, bas('#ff3040'), [0, 0, 0.005]);
    X.shieldGlow = mk(X.shield, g.shieldX, glowMat('epic'), [0, 0.08, 0.03], [0, 0, 0], 1.3); X.shieldGlow.visible = false;
    X.sword = pv(aR.el, [0, -0.33, 0.02], [PI / 2, 0, 0]);
    mk(X.sword, g.blade, lam('#8a8d92'));
  }
  const S = { ph: R() * TAU, blockT: 0, eyeBase: '#7fe8ff', level: 0, jitter: R() * 10 };
  let eyeCol = '';
  const setEye = (c) => { if (c !== eyeCol) { eyeCol = c; eyeM.color.set(c); } };
  const tinter = new Tinter(root);

  // ---- pose
  function pose(dt, a) {
    const st = a.state, t = a.t, time = a.time;
    const walking = st === 'walk' || st === 'flee', running = st === 'run';
    const moving = walking || running;
    const sp = moving ? Math.max(a.speed || 0, running ? 2.4 : 1.1) : 0;
    if (moving) S.ph = (S.ph + dt * (3 + sp * 1.7)) % TAU;
    const s = Math.sin(S.ph), mv = moving ? 1 : 0, rn = running ? 1 : 0;
    let k = 0;
    if (st === 'dead') k = smooth(t / 0.55);
    else if (st === 'collapsed') k = smooth(t / 0.4);
    else if (st === 'rise') k = 1 - smooth(t / TUNING.riseTime);
    const up = 1 - k;
    const lean = kind === 'archer' ? 0.22 : kind === 'knight' ? 0.06 : 0.08;
    // legs
    legs[0].thigh.rotation.x = up * (s * (0.6 + rn * 0.25) * mv) + k * -1.25;
    legs[1].thigh.rotation.x = up * (-s * (0.6 + rn * 0.25) * mv) + k * -0.95;
    legs[0].knee.rotation.x = up * mv * (0.3 + 0.6 * Math.max(0, Math.sin(S.ph + 1.2)) * (1 + rn * 0.3)) + k * 2.35;
    legs[1].knee.rotation.x = up * mv * (0.3 + 0.6 * Math.max(0, Math.sin(S.ph + 1.2 + PI)) * (1 + rn * 0.3)) + k * 2.0;
    hips.position.y = lerp(0.9 + Math.abs(s) * 0.025 * mv - (st === 'stunned' ? 0.06 : 0), 0.15, k);
    hips.rotation.z = up * Math.sin(time * 1.3 + S.jitter) * (moving ? 0.05 : 0.02) + up * s * 0.05 * mv;
    // rattle (bones shake: constant while moving, strong while reassembling)
    const rattle = (st === 'rise' ? 0.05 * k : 0) + (moving ? 0.008 : 0.003) + (st === 'stunned' ? 0.03 : 0);
    const rj = Math.sin(time * 47 + S.jitter) * rattle;
    // spine + head + jaw
    let spx = lean + rn * 0.12 + rj;
    let head = Math.sin(time * 0.9 + S.jitter) * 0.12, headX = 0;
    let jw = (moving ? 0.12 + 0.1 * Math.abs(Math.sin(time * 14 + S.jitter)) : 0.04 + 0.03 * Math.sin(time * 2)) + (st === 'attack' ? 0.4 : 0);
    // arms: [shoulder x, shoulder z, elbow x] for each side
    let lsx = up * (mv ? -s * 0.5 : Math.sin(time * 1.5 + S.jitter) * 0.05) - 0.1, lsz = 0.08, lex = up * (mv ? -0.3 - rn * 0.9 : -0.25);
    let rsx = up * (mv ? s * 0.5 : Math.sin(time * 1.5 + 2 + S.jitter) * 0.05) - 0.1, rsz = -0.08, rex = up * (mv ? -0.3 - rn * 0.9 : -0.25);
    if (st === 'attack' && (kind === 'walker' || kind === 'knight')) {
      const w = kind === 'knight' ? 0.55 : 0.42;
      if (t < w) { const p = smooth(t / w); rsx = lerp(rsx, -2.5, p); rex = lerp(rex, -0.4, p); if (kind === 'walker') { lsx = lerp(lsx, -2.3, p); lex = lerp(lex, -0.4, p); } spx = lean - 0.18 * p; }
      else if (t < w + 0.18) { const q = (t - w) / 0.18; rsx = lerp(-2.5, -0.3, q); rex = -0.5; if (kind === 'walker') { lsx = lerp(-2.3, -0.3, q); lex = -0.5; } spx = lerp(lean - 0.18, lean + 0.45, q); }
      else { const q = smooth((t - w - 0.18) / 0.25); rsx = lerp(-0.3, rsx, q); spx = lerp(lean + 0.45, spx, q); }
    } else if (st === 'attack' && kind === 'archer') {   // melee flail when cornered
      rsx = -1.6 - Math.sin(t * 20) * 0.5; rex = -0.6; lsx = -1.2 + Math.sin(t * 20) * 0.4;
    }
    if (kind === 'archer') {
      const drawing = st === 'draw', throwing = st === 'throw';
      if (drawing) {
        const p = smooth(clamp(t / 0.9, 0, 1));
        rsx = lerp(rsx, -2.4, p); rsz = -0.15; rex = lerp(rex, 1.6, p); lsx = lerp(lsx, -1.4, p); lex = -0.2; spx = lean - 0.35 * p; head = 0;
        X.hold.visible = true; X.projM.visible = true;
        const glow = clamp(t / 0.9, 0, 1);
        X.projM.scale.setScalar(1 + glow * 0.45 + Math.sin(time * 30) * 0.05 * glow);
        X.projM.material.color.setRGB(1, 1 - glow * 0.7, 1 - glow * 0.8);
        setEye(glow > 0.6 && Math.sin(time * 26) > 0 ? '#ff5030' : S.eyeBase);
      } else if (throwing) {
        const q = clamp(t / 0.14, 0, 1);
        rsx = lerp(-2.4, -0.4, q); rex = lerp(1.6, -0.4, q); lsx = lerp(-1.4, -0.3, q); spx = lerp(lean - 0.35, lean + 0.4, q);
        X.hold.visible = q < 0.55; X.projM.visible = q < 0.55;
        setEye(S.eyeBase);
      } else if (X.hold.visible) { X.hold.visible = false; X.projM.visible = false; X.projM.scale.setScalar(1); X.projM.material.color.setRGB(1, 1, 1); }
    }
    if (kind === 'knight') {
      // shield arm guards in front; jolts on a block; flung aside (arm out, body rocked back) while staggered
      lsx = up * (mv ? -0.6 + s * 0.06 : -0.55) - 0.05; lsz = 0.05; lex = up * -1.5;
      S.blockT = Math.max(0, S.blockT - dt);
      const stag = st === 'stunned' ? smooth(clamp(t / 0.15, 0, 1)) : 0;
      const blk = S.blockT > 0 ? Math.sin((S.blockT / 0.28) * PI) : 0;
      lsx = lerp(lsx, 0.3, stag); lsz = lerp(lsz, 1.1, stag); lex = lerp(lex, -0.2, stag);
      spx = lerp(spx, -0.32, stag) - blk * 0.1; head = lerp(head, 0.5 * Math.sin(time * 9), stag);
      X.shield.position.set(lerp(0.27, 0.42, stag), lerp(0.2, 0.05, stag), 0.17 - blk * 0.05 - stag * 0.05);
      X.shield.rotation.set(-blk * 0.2, lerp(-0.15, -1.1, stag), stag * 0.5);
    }
    if (st === 'stunned') {
      body.rotation.z = Math.sin(time * 35) * 0.05; head = Math.sin(time * 22) * 0.4; headX = -0.3;
      if (kind !== 'knight') { lsx = -1.0 + Math.sin(time * 20) * 0.5; rsx = -0.8 + Math.sin(time * 18) * 0.5; }
    } else body.rotation.z = 0;
    // collapse / pile pose
    spine.rotation.x = lerp(spx, 1.3, k);
    skull.position.set((st === 'dead' ? 0.3 * k : 0), lerp(0.56, 0.36, k), 0.01);
    skull.rotation.set(headX * up + k * -0.9, up * head, (st === 'dead' ? 1.2 : 0.35) * k);
    jaw.rotation.x = up * jw + k * (st === 'dead' ? 0.6 : 0.2);
    arms[0].sh.rotation.set(lerp(lsx, -0.6, k), lerp(lsz, 1.0, k), 0); arms[0].el.rotation.x = lerp(lex, -0.4, k);
    arms[1].sh.rotation.set(lerp(rsx, -0.9, k), lerp(rsz, -1.0, k), 0); arms[1].el.rotation.x = lerp(rex, -0.3, k);
    body.position.y = 0;
    // eyes: dim idle, red when angry; the collapsed Walker blinks faster and faster (hit the skull now!)
    if (kind !== 'archer' || (st !== 'draw' && st !== 'throw')) {
      if (st === 'collapsed') setEye(Math.sin(t * (5 + t * 5)) > 0 ? '#ff4030' : '#ffe9a0');
      else if (st === 'dead') setEye('#1a1a1a');
      else setEye(st === 'attack' || st === 'run' ? '#ff5030' : S.eyeBase);
    }
  }
  const model = {
    root, parts: { head: skull, eyes: [eyeM], jaw }, height: kind === 'knight' ? 1.95 : kind === 'archer' ? 1.7 : 1.75, radius: kind === 'knight' ? 0.42 : 0.36,
    update(dt, a = {}) { pose(clamp(dt || 0, 0, 0.1), { state: a.state || 'idle', t: a.t || 0, time: a.time || 0, speed: a.speed ?? 0 }); },
    setElite(b) { body.scale.setScalar(b ? 1.12 : 1); if (b) tinter.setBase('#2c0606'); else if (tinter.active) tinter.setBase('#000000'); },
    setTint(c, strong) { tinter.setBase(new THREE.Color(c).multiplyScalar(strong ? 0.26 : 0.13)); S.eyeBase = c; },
    setHitFlash(v) { tinter.setFlash(v); },
    onBlock() { S.blockT = 0.28; },
    dispose() { tinter.dispose(); eyeM.dispose(); if (X.projM) X.projM.material.dispose(); },
    // bespoke tier gear: bones per tier + the bones the shared gear builders attach to
    tierRig(spec) {
      if (spec.level >= 1) { const m = tierBone(spec.id || TIER_OF_LEVEL[spec.level], spec); for (const b of bones) b.material = m; }
      if (spec.level >= 3 && spec.glow) S.eyeBase = spec.glow;
      if (kind === 'knight') {
        const lv = spec.level;
        X.helm.material = lv >= 2 ? plateMat(TIER_OF_LEVEL[lv]) : lv === 1 ? rustMat() : iron;
        X.shieldFace.material = lv >= 2 ? plateMat(TIER_OF_LEVEL[lv]) : lv === 1 ? rustMat() : iron;
        X.shieldRim.material = lv >= 4 ? trimMat(TIER_OF_LEVEL[lv]) : ironD;
        X.shieldGlow.material = glowMat(TIER_OF_LEVEL[lv] === 'mythic' ? 'mythic' : lv >= 4 ? 'legendary' : 'epic');
        X.shieldGlow.visible = lv >= 3;
        X.chest.visible = lv < 2; for (const p of X.pauld) p.visible = lv < 2;
      }
      tinter.refresh();
      const torso = { parent: spine, frame: { style: 'humanoid', cx: 0, cy: 0.26, cz: 0, w: 0.34, h: 0.36, d: 0.19, H: 1.75 } };
      const headF = { parent: skull, frame: { cx: 0, cy: 0.09, cz: 0.01, w: 0.2, h: 0.2, d: 0.22 } };
      return {
        torso, head: headF, crown: headF, noEyes: true, rusty: true, crownOnly: kind === 'knight',
        skipShield: kind === 'knight',
        shield: kind === 'knight' ? null : { parent: aL.el, pos: [0.06, -0.15, 0], rot: [0, PI / 2, 0], r: 0.15 },
        cape: torso, capeTilt: 0.16,
      };
    },
  };
  return model;
}
const TIER_OF_LEVEL = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// ------------------------------------------------------------------------------------------------ Bone Swarm: a crawling skull hand
function buildHand(opts = {}) {
  const g = geos();
  const R = rng((opts.seed || 1) * 11 + 5);
  const root = new THREE.Group();
  const body = pv(root, null, null, 'scaler');
  const hand = pv(body, [0, 0.055, 0]);
  const bone = lam(BONE, { map: boneTex() });
  const bones = [];
  const B = (parent, geo) => { const m = mk(parent, geo, bone); bones.push(m); return m; };
  B(hand, g.palm);
  mk(hand, g.palmSockets, bas('#0a0a0a'));
  const fa = pv(hand, [0, 0, 0]); B(fa, g.fingersA);
  const fb = pv(hand, [0, 0, 0]); B(fb, g.fingersB);
  const skull = hand;   // the tiny skull is part of the palm mesh: helmets sit on the hand
  const S = { ph: R() * TAU };
  const tinter = new Tinter(root);
  function pose(dt, a) {
    const st = a.state, t = a.t, time = a.time;
    const moving = st === 'walk' || st === 'run';
    if (moving) S.ph = (S.ph + dt * (10 + (st === 'run' ? 8 : 0))) % TAU;
    const s = Math.sin(S.ph);
    const dead = st === 'dead' ? smooth(t / 0.3) : 0;
    fa.rotation.x = moving ? s * 0.45 : Math.sin(time * 7 + S.ph) * 0.06 + dead * 0.9;
    fb.rotation.x = moving ? -s * 0.45 : Math.sin(time * 7 + 2) * 0.06 + dead * 0.9;
    hand.position.y = 0.055 + (moving ? Math.abs(s) * 0.014 : 0) + (st === 'attack' ? Math.sin(clamp(t / 0.32, 0, 1) * PI) * 0.22 : 0);
    hand.rotation.set(st === 'attack' ? -0.5 : 0, moving ? Math.sin(S.ph * 0.5) * 0.15 : 0, dead * PI + (st === 'stunned' ? Math.sin(time * 30) * 0.15 : 0) + (moving ? s * 0.06 : 0));
    hand.position.y += dead * 0.02;
  }
  const model = {
    root, parts: { head: skull, eyes: [] }, height: 0.32, radius: 0.2,
    update(dt, a = {}) { pose(clamp(dt || 0, 0, 0.1), { state: a.state || 'idle', t: a.t || 0, time: a.time || 0, speed: a.speed ?? 0 }); },
    setElite(b) { body.scale.setScalar(b ? 1.2 : 1); if (b) tinter.setBase('#2c0606'); },
    setTint(c, strong) { tinter.setBase(new THREE.Color(c).multiplyScalar(strong ? 0.26 : 0.13)); },
    setHitFlash(v) { tinter.setFlash(v); },
    dispose() { tinter.dispose(); },
    tierRig(spec) {
      if (spec.level >= 1) { const m = tierBone(TIER_OF_LEVEL[spec.level], spec); for (const b of bones) b.material = m; }
      tinter.refresh();
      const torso = { parent: hand, frame: { style: 'beast', cx: 0, cy: 0.02, cz: 0, w: 0.16, h: 0.06, d: 0.14, H: 0.3 } };
      const headF = { parent: hand, frame: { cx: 0, cy: 0.07, cz: -0.005, w: 0.11, h: 0.11, d: 0.12 } };
      return { torso, head: headF, crown: headF, noEyes: true, rusty: true, shield: null, cape: torso, capeTilt: 1.3 };
    },
  };
  return model;
}

export const createBoneWalkerModel = (o = {}) => buildSkeleton('walker', o);
export const createBoneArcherModel = (o = {}) => buildSkeleton('archer', o);
export const createBoneKnightModel = (o = {}) => buildSkeleton('knight', o);
export const createBoneSwarmModel = (o = {}) => buildHand(o);

// ------------------------------------------------------------------------------------------------ projectile visuals (client)
/** small meshes for the Archer's projectiles: type 0 = bone shard, 1 = old CD. Shared geometry / materials, one Mesh per projectile. */
let projGeo = null, projMat = null;
export function createProjectileMesh(type) {
  if (!projGeo) {
    projGeo = [merged('sk_pj_shard', () => [xf(G.cone(0.03, 0.26, 4), [0, 0, 0], [PI / 2, 0, 0])]), merged('sk_pj_cd', () => [xf(G.cyl(0.1, 0.1, 0.012, 12), [0, 0, 0], [PI / 2, 0, 0])])];
    projMat = [new THREE.MeshBasicMaterial({ color: '#f6f2e2' }), new THREE.MeshBasicMaterial({ color: '#ffffff', map: cdTex() })];
    for (const m of projMat) m.userData.noTint = true;
  }
  const m = new THREE.Mesh(projGeo[type ? 1 : 0], projMat[type ? 1 : 0]);
  m.userData.tierGear = true;
  return m;
}
export function disposeSkeletonShared() {
  // geometry / materials are cached module-wide and reused across games: nothing per game to free
}

// ------------------------------------------------------------------------------------------------ registry
export function registerSkeletonModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.creatureModels) return false;
  const set = (id, fn) => { if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, fn); };
  set('skel_walker', (_T, o) => createBoneWalkerModel(o || {}));
  set('skel_archer', (_T, o) => createBoneArcherModel(o || {}));
  set('skel_knight', (_T, o) => createBoneKnightModel(o || {}));
  set('skel_swarm', (_T, o) => createBoneSwarmModel(o || {}));
  return true;
}
void tex;
