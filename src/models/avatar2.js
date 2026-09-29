// avatar2.js — [avatar2] "TFG Employee": the rounded, bean-like redesign of the player avatar (docs/MASTERPLAN.md §15).
// A hoodie-overall bean body, stubby legs, small round arms with light-grey gloves, and a rounded retro CRT helmet fused to
// the body: the pixel face lives on its screen (dark bezel), with a small antenna, headphone cups and a battery pack on the back.
// Same API / anchor names as the classic avatar (avatar.js createAvatar): update / setMouth / setExpression / setLook / setHat /
// parts.{head, torso, handR, handL, backpack, face, neck, hips, hatSlot} — plus parts.chest / parts.instr.
//
// How cosmetics fit: the rig handed to createLookController carries `attach` frames (scaled child pivots of the real
// skeleton pivots) so the old decoration coordinates (authored for the classic ~0.16 m torso / 0.17 m helmet) land on the
// new body. The animation only ever touches the real pivots, so fpbody / emotes / music keep working on parts.torso / neck.
// Squash & stretch lives on the `rig` pivot (feet origin): walk waddle, jump stretch, landing / crouch squash, breathing.
import * as THREE from 'three';
import {
  G, xf, merged, lam, lamI, basI, bas, tex, newTex, mk, pv, cached, Tinter,
  clamp, lerp, smooth, damp, rng, TAU, PI,
} from './modelkit.js';
import { OUTFIT_BY_ID, createLookController } from './cosmetics.js';
import { addTranslations } from '../core/i18n.js';
import { HATS, SUIT_COLORS, buildHat, drawFace, C } from './avatar.js';

addTranslations({ 'Character': 'Karakter', 'Classic avatar': 'Klasik avatar', 'Applies to new models after reload.': 'Yeni modellere yeniden yüklemeden sonra uygulanır.' });   // [avatar2]
export const A2 = {
  HIP_Y: 0.52, THIGH: 0.19, SHIN: 0.19, UARM: 0.17, FARM: 0.15,
  HEAD_SCALE: [1.8, 1.75, 1.65],
  GLOVE: '#c9ccd2', BOOT: '#b7bbc4', BELT: '#2b2f36', BEZEL: '#14171b',
};
const { HIP_Y, THIGH, SHIN, UARM, FARM } = A2;
const ANKLE_H = HIP_Y - THIGH - SHIN;              // ankle pivot height above the floor (standing)
const HAND_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));

// ------------------------------------------------------------------ geometry
/** rounded box / bean: a unit sphere pushed onto the |x|^n+|y|^n+|z|^n = 1 surface, then scaled. fn(x,y,z) may bend the unit shape. */
function sqGeo(key, hx, hy, hz, ws = 12, hs = 8, n = 4, fn = null) {
  return cached('a2sq|' + key, () => {
    const g = new THREE.SphereGeometry(1, ws, hs);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const q = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), 1 / n) || 1;
      x /= q; y /= q; z /= q;
      if (fn) { const o = fn(x, y, z); x = o[0]; y = o[1]; z = o[2]; }
      p.setXYZ(i, x * hx, y * hy, z * hz);
    }
    g.computeVertexNormals();
    return g;
  });
}
// the CRT tube narrows towards the back of the helmet
const crtTaper = (x, y, z) => { if (z >= 0) return [x, y, z]; const k = 1 - 0.26 * Math.pow(-z, 1.5); return [x * k, y * k, z]; };

const metalMat = () => lam(C.metal);
const packMat = () => lam('#3a3f48');

// ------------------------------------------------------------------ face screen extras
function drawNoSignal(ctx, seed) {
  const W = 64, H = 64;
  ctx.fillStyle = '#0a0c0f'; ctx.fillRect(0, 0, W, H);
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    const v = (50 + r() * 170) | 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect((r() * W) | 0, (r() * H) | 0, 2 + ((r() * 6) | 0), 1 + ((r() * 2) | 0));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(7, 21, 50, 22);
  ctx.save();
  ctx.translate(32, 0); ctx.scale(1 / 1.5, 1);        // the screen is 1.5x wider than tall: pre-squeeze the text
  ctx.fillStyle = '#ff6a55'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('NO', 0, 28); ctx.fillText('SIGNAL', 0, 38);
  ctx.restore();
}
/** dark bezel corners: the flat canvas reads as a rounded CRT screen */
function roundCorners(ctx, r = 11) {
  const W = 64, H = 64;
  ctx.fillStyle = A2.BEZEL;
  ctx.beginPath(); ctx.rect(0, 0, W, H);
  ctx.moveTo(r, 0); ctx.arcTo(W, 0, W, H, r); ctx.arcTo(W, H, 0, H, r); ctx.arcTo(0, H, 0, 0, r); ctx.arcTo(0, 0, W, 0, r); ctx.closePath();
  ctx.fill('evenodd');
}

// ------------------------------------------------------------------ limbs
function buildLeg(parent, side, suitMat, bootMat) {
  const hip = pv(parent, [side * 0.15, 0, 0]);
  mk(hip, merged('a2_thigh', () => [xf(G.segY(THIGH + 0.02, 0.135, 0.116, 8), [0, 0.02, 0]), xf(G.sph(0.136, 8, 6), [0, 0.02, 0])]), suitMat);
  const knee = pv(hip, [0, -THIGH, 0]);
  mk(knee, G.segY(SHIN, 0.116, 0.105, 8), suitMat);
  const ankle = pv(knee, [0, -SHIN, 0]);
  mk(ankle, merged('a2_boot', () => [
    xf(sqGeo('boot', 0.135, 0.1, 0.19, 10, 7, 3), [0, -0.035, 0.05]),
    xf(G.cyl(0.118, 0.122, 0.05, 8, true), [0, 0.035, 0]),
  ]), bootMat);
  // cosmetics frames: the classic legs were 0.44 / 0.40 long and ~0.09 thick
  const hipF = pv(hip); hipF.scale.set(1.5, 0.43, 1.5);
  const kneeF = pv(knee); kneeF.scale.set(1.45, 0.475, 1.45);
  const ankleF = pv(ankle); ankleF.scale.set(1.25, 1, 1.15);
  return { hip, knee, ankle, frames: { hip: hipF, knee: kneeF, ankle: ankleF } };
}
function buildArm(parent, side, suitMat, gloveMat) {
  const sh = pv(parent, [side * 0.34, 0.3, 0]);
  mk(sh, merged('a2_uarm', () => [xf(G.segY(UARM, 0.095, 0.086, 8)), xf(G.sph(0.104, 8, 6))]), suitMat);
  const el = pv(sh, [0, -UARM, 0]);
  mk(el, merged('a2_farm', () => [xf(G.segY(FARM, 0.086, 0.078, 8)), xf(G.sph(0.087, 8, 6))]), suitMat);
  mk(el, merged('a2_glove' + side, () => [
    xf(G.cyl(0.092, 0.092, 0.04, 8, true), [0, -FARM + 0.01, 0]),
    xf(sqGeo('glove', 0.098, 0.09, 0.1, 9, 7, 2.6), [0, -FARM - 0.055, 0.005]),
    xf(G.sph(0.04, 5, 4), [-side * 0.088, -FARM - 0.035, 0.045]),
  ]), gloveMat);
  const hand = new THREE.Object3D();
  hand.name = side > 0 ? 'handL' : 'handR';
  hand.position.set(0, -FARM - 0.075, 0.01);
  hand.quaternion.copy(HAND_Q);
  el.add(hand);
  const shF = pv(sh); shF.scale.set(1.15, 0.57, 1.15);
  const elF = pv(el); elF.scale.set(1.2, 0.55, 1.2);
  return { sh, el, hand, frames: { sh: shF, el: elF, hand } };
}

/**
 * createAvatar2(opts) — same options as the classic createAvatar. Returns the same API object.
 */
export function createAvatar2({ suitColor = '#d9642b', hat = 'none', visorColor, faceStyle = 'normal', eyeColor } = {}) {
  const root = new THREE.Group();
  root.name = 'avatar';
  root.userData.avatarStyle = 'tfg2';
  const baseMap = tex('a2_grain', 8, 8, (ctx, w, h, r) => {          // faint grain only: flat colours, no seams across the round shapes
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 10; i++) ctx.fillRect((r() * w) | 0, (r() * h) | 0, 1, 1);
  });
  const suitMat = lamI(suitColor, { map: baseMap });
  const gloveMat = lamI(A2.GLOVE), bootMat = lamI(A2.BOOT), beltMatI = lamI(A2.BELT);
  const rnd = rng((Math.random() * 1e9) | 0);

  const rig = pv(root, null, null, 'rig');                 // squash & stretch + waddle (feet origin)
  const body = pv(rig, [0, HIP_Y, 0], null, 'hips');
  const legL = buildLeg(body, 1, suitMat, bootMat), legR = buildLeg(body, -1, suitMat, bootMat);

  const spine = pv(body, [0, 0.02, 0], null, 'torso');
  const chestFrame = pv(spine, null, null, 'chestFrame');   // cosmetics frame: the classic torso (0.25 x 0.16 x 0.55) x this scale = the bean
  chestFrame.scale.set(1.36, 1.08, 1.6);
  // hoodie-overall bean: rounded, slightly boxy blob
  mk(spine, sqGeo('bean', 0.33, 0.33, 0.25, 14, 10, 2.8), suitMat, [0, 0.27, 0]);
  const beltMesh = mk(spine, merged('a2_belt', () => [
    xf(G.cyl(0.305, 0.305, 0.05, 14, true), [0, 0.1, 0], [0, 0, 0], [1, 1, 0.875]),                 // waistband
    xf(G.box(0.2, 0.11, 0.04), [0, 0.15, 0.262]),                                                     // kangaroo pocket
    xf(G.box(0.08, 0.05, 0.02), [-0.13, 0.4, 0.232]),                                                 // TFG chest tag
  ]), beltMatI);
  const regulatorMesh = mk(spine, merged('a2_collar', () => [
    xf(G.cyl(0.2, 0.25, 0.07, 12, true), [0, 0.53, 0], [0, 0, 0], [1, 1, 0.8]),
  ]), metalMat());

  // battery pack on the back (back accessories attach to `backpack`)
  const backpack = pv(spine, [0, 0.28, -0.235], null, 'backpack');
  const backpackGear = pv(backpack, null, null, 'backpackGear');
  mk(backpackGear, merged('a2_pack', () => [
    xf(sqGeo('pack', 0.17, 0.21, 0.085, 10, 7, 3.2), [0, 0, -0.05]),
    xf(G.box(0.1, 0.03, 0.05), [0, 0.225, -0.05]),
  ]), packMat());
  mk(backpackGear, merged('a2_packbars', () => [-0.06, 0, 0.06].map((x) => xf(G.box(0.035, 0.11, 0.012), [x, 0.03, -0.138]))), bas('#5cff8a'));
  mk(backpackGear, merged('a2_packbar2', () => [xf(G.box(0.16, 0.02, 0.012), [0, -0.09, -0.138])]), bas('#ff9a3d'));

  const armL = buildArm(spine, 1, suitMat, gloveMat), armR = buildArm(spine, -1, suitMat, gloveMat);

  // ---- helmet (head) fused to the body
  const neck = pv(spine, [0, 0.52, 0], null, 'neck');
  const head = pv(neck, null, null, 'head');
  const hf = pv(head, null, null, 'headFrame');            // helmet frame: the classic head coordinates x HEAD_SCALE
  hf.scale.set(...A2.HEAD_SCALE);
  const headMesh = mk(hf, sqGeo('crt', 0.17, 0.165, 0.17, 14, 10, 4, crtTaper), suitMat, [0, 0.135, 0]);
  const faceGroup = pv(hf, null, null, 'screenGroup');
  mk(faceGroup, sqGeo('bezel', 0.16, 0.125, 0.04, 12, 7, 4), lam(A2.BEZEL), [0, 0.15, 0.165]);
  const faceT = newTex(64, 64);
  const visorBase = visorColor || C.visor;
  const faceMat = faceT ? basI('#ffffff', { map: faceT.tex }) : basI(visorBase);
  const screenGeo = cached('a2_screen', () => {
    const g = new THREE.PlaneGeometry(0.27, 0.18, 6, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i) / 0.135, ny = p.getY(i) / 0.09;
      p.setZ(i, 0.016 * (1 - nx * nx) * (1 - ny * ny * 0.8));
    }
    return g;
  });
  const face = mk(faceGroup, screenGeo, faceMat, [0, 0.15, 0.192]);
  face.name = 'visor';
  const helmetBitsMesh = mk(hf, merged('a2_ears', () => [
    xf(G.cyl(0.064, 0.064, 0.05, 8), [0.172, 0.1, -0.01], [0, 0, PI / 2]), xf(G.cyl(0.064, 0.064, 0.05, 8), [-0.172, 0.1, -0.01], [0, 0, PI / 2]),
    xf(G.cyl(0.036, 0.036, 0.055, 6), [0.19, 0.1, -0.01], [0, 0, PI / 2]), xf(G.cyl(0.036, 0.036, 0.055, 6), [-0.19, 0.1, -0.01], [0, 0, PI / 2]),
  ]), lam('#3a3f48'));
  const antenna = pv(hf, [0.1, 0.3, -0.04], [0, 0, -0.22], 'antenna');
  const antRod = mk(antenna, merged('a2_antrod', () => [xf(G.cyl(0.008, 0.013, 0.17, 5), [0, 0.085, 0]), xf(G.cyl(0.03, 0.036, 0.02, 6), [0, 0.006, 0])]), metalMat());
  const helmetLightMesh = mk(antenna, G.ico(0.024, 0), bas('#ff5a4a'), [0, 0.185, 0]);
  const faceFrame = pv(hf, [0, 0, 0.04], null, 'faceFrame');   // face accessories (classic visor sat at z 0.172)

  const fs = { mouth: 0, expr: 'normal', blink: false, pupil: [0, 0], eye: eyeColor || C.eye, visor: visorBase, style: faceStyle, twitch: 0, led: false };
  let drawnMouth = -1, faceDirty = true, extraExpr = null, noSig = false, staticT = 0, staticN = 1;
  const redraw = () => {
    faceDirty = false; drawnMouth = fs.mouth;
    if (!faceT) return;
    if (noSig) drawNoSignal(faceT.ctx, staticN++);
    else {
      const saved = fs.expr;
      if (extraExpr) fs.expr = extraExpr;
      drawFace(faceT.ctx, fs);
      fs.expr = saved;
    }
    roundCorners(faceT.ctx);
    faceT.tex.needsUpdate = true;
  };

  const hatSlot = pv(hf, [0, 0.295, 0], null, 'hatSlot');
  let hatObj = null, hatId = 'none';
  const tinter = new Tinter(root);
  let look = null;
  const refreshAntenna = () => { antRod.visible = hatId === 'none' && helmetLightMesh.visible; antenna.visible = antRod.visible; };
  function setHat(id) {
    if (hatObj) hatSlot.remove(hatObj);
    hatId = HATS.some((h) => h.id === id) ? id : 'none';
    hatObj = buildHat(hatId);
    hatSlot.add(hatObj);
    look?.onHat(hatId);
    refreshAntenna();
    tinter.refresh();
  }
  setHat(hat);
  look = createLookController({
    root, body, spine, neck, head: hf, hatSlot, legL, legR, armL, armR, backpack, backpackGear, suitMat, gloveMat, bootMat, beltMat: beltMatI, baseMap,
    gear: { belt: beltMesh, regulator: regulatorMesh, helmetbits: helmetBitsMesh, helmetLight: helmetLightMesh, headMesh, face: faceGroup },
    fs, redraw, tinterRefresh: () => tinter.refresh(), getHat: () => hatId,
    defaults: { glove: A2.GLOVE, boot: A2.BOOT, belt: A2.BELT },
    dims: { coat: [0.25, 0.27, 0.36, -0.15] },
    attach: {
      spine: chestFrame, head: hf, faceHead: faceFrame,
      legL: legL.frames, legR: legR.frames, armL: armL.frames, armR: armR.frames,
    },
  });
  refreshAntenna();
  let curSuit = null, curFace = 'none', curBack = 'none';
  /** Wardrobe: { suit (outfit id or colour-suit id), hat, face, back } — undefined fields stay as they are. */
  function setLook(l) {
    if (!l) return;
    let changed = false;
    if (l.suit !== undefined && l.suit !== curSuit) {
      curSuit = l.suit; changed = true;
      const def = OUTFIT_BY_ID[l.suit];
      if (def) look.setOutfit(def.id);
      else { look.setOutfit('none'); const c = SUIT_COLORS.find((x) => x.id === l.suit)?.color; if (c) suitMat.color.set(c); }
    }
    if (l.hat !== undefined && (l.hat || 'none') !== hatId) { setHat(l.hat || 'none'); changed = true; }
    if (l.face !== undefined && (l.face || 'none') !== curFace) { curFace = l.face || 'none'; look.setFace(curFace); changed = true; }
    if (l.back !== undefined && (l.back || 'none') !== curBack) { curBack = l.back || 'none'; look.setBack(curBack); changed = true; }
    refreshAntenna();
    if (changed && root.layers.mask !== 1) { const m = root.layers.mask; root.traverse((o) => { o.layers.mask = m; }); }   // ship mirror layer
  }

  // ---- animation state
  const W = { crouch: 0, sprint: 0, air: 0, carry: 0, hold: 0, climb: 0, sit: 0, dance: 0, wave: 0, point: 0 };
  let phase = 0, climbPh = 0, deadT = 0, mouthTarget = 0, mouthSm = 0, localTime = 0, landK = 0, wasAir = 0;
  let blinkT = 2 + rnd() * 3, blinking = false, pupilT = 1, flickT = 5 + rnd() * 6, flickOn = 0;
  const sw = (on) => (on ? 1 : 0);

  function update(dt, a = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    localTime += dt;
    const time = a.time ?? localTime;
    const speed = Math.max(0, a.speed || 0);
    const dead = !!a.dead;
    const em = dead ? null : a.emote || null;
    const tw = (key, on, rate = 10) => { W[key] = damp(W[key], sw(on), rate, dt); };
    tw('crouch', a.crouch && !dead && !em && !a.climbing);
    tw('sprint', a.sprint && speed > 0.5 && !a.crouch && !dead, 6);
    tw('air', a.grounded === false && !a.climbing && !dead, 8);
    tw('carry', a.carry2h && !dead && !a.climbing);
    tw('hold', a.holding && !a.carry2h && !dead && !a.climbing);
    tw('climb', a.climbing && !dead, 8);
    tw('sit', em === 'sit', 6); tw('dance', em === 'dance', 8); tw('wave', em === 'wave', 8); tw('point', em === 'point', 8);
    deadT = clamp(deadT + (dead ? dt / 0.6 : -dt / 0.4), 0, 1);
    const fall = deadT * deadT, alive = 1 - deadT;
    const pitch = clamp(a.lookPitch || 0, -0.8, 0.8);
    // landing squash impulse
    if (wasAir > 0.5 && W.air < 0.5) landK = 1;
    wasAir = W.air;
    landK = Math.max(0, landK - dt * 5);

    // gait: short quick steps; phase advances with distance so the little feet do not slide
    const stride = lerp(lerp(1.1, 1.8, W.sprint), 0.8, W.crouch);
    phase = (phase + (speed * dt / stride) * TAU) % TAU;
    if (a.climbing) climbPh = (climbPh + speed * dt * 5) % TAU;
    const amp = clamp(speed / 2.2, 0, 1) * (1 - W.air) * (1 - W.climb) * (1 - W.sit) * alive;
    const s = Math.sin(phase), c = Math.cos(phase);
    const ct = 1.03 * W.crouch;
    const legA = lerp(0.62, 0.9, W.sprint) * amp * (1 - W.crouch * 0.35);
    const kneeA = lerp(0.7, 1.15, W.sprint) * amp;
    let hipL = -s * legA - ct, hipR = s * legA - ct;
    let kneeL = 2 * ct + kneeA * Math.max(0, c) + 0.04, kneeR = 2 * ct + kneeA * Math.max(0, -c) + 0.04;
    let bodyY = ANKLE_H + (THIGH + SHIN) * Math.cos(ct) - 0.03 * amp * Math.abs(s) + 0.012 * amp;
    let bodyX = 0, bodyZ = 0;
    let spX = 0.3 * W.crouch + 0.3 * W.sprint * clamp(speed / 3, 0, 1) - 0.12 * pitch + Math.sin(time * 1.7) * 0.01;
    let spY = s * 0.1 * amp, spZ = 0;
    const armA = lerp(0.6, 1.0, W.sprint) * amp;
    let shLx = s * armA, shRx = -s * armA, shLz = 0.14, shRz = -0.14;
    let elL = -0.25 - W.sprint * 1.0 - W.crouch * 0.3, elR = elL;
    shLx -= W.crouch * 0.3; shRx -= W.crouch * 0.3;

    // airborne
    hipL = lerp(hipL, -0.75, W.air); kneeL = lerp(kneeL, 1.25, W.air);
    hipR = lerp(hipR, 0.25, W.air); kneeR = lerp(kneeR, 0.55, W.air);
    shLx = lerp(shLx, -0.6, W.air); shRx = lerp(shRx, -0.5, W.air);
    shLz = lerp(shLz, 0.6, W.air); shRz = lerp(shRz, -0.6, W.air);
    spX -= 0.1 * W.air;
    // climbing
    if (W.climb > 0.001) {
      const cs = Math.sin(climbPh), k = W.climb;
      hipL = lerp(hipL, -0.8 - cs * 0.45, k); kneeL = lerp(kneeL, 1.2 + cs * 0.35, k);
      hipR = lerp(hipR, -0.8 + cs * 0.45, k); kneeR = lerp(kneeR, 1.2 - cs * 0.35, k);
      shLx = lerp(shLx, -2.6 + cs * 0.35, k); shRx = lerp(shRx, -2.6 - cs * 0.35, k);
      elL = lerp(elL, -0.6 - cs * 0.3, k); elR = lerp(elR, -0.6 + cs * 0.3, k);
      shLz = lerp(shLz, -0.1, k); shRz = lerp(shRz, 0.1, k);
      bodyY = lerp(bodyY, bodyY - 0.06, k); bodyZ = lerp(bodyZ, -0.08, k); spX = lerp(spX, 0.1, k);
    }
    // two-handed carry (the bean is wide: the arms come in a lot to meet in front) / holding
    shLx = lerp(shLx, -1.15 - pitch * 0.3 + s * 0.05 * amp, W.carry); shRx = lerp(shRx, -1.15 - pitch * 0.3 - s * 0.05 * amp, W.carry);
    shLz = lerp(shLz, -0.62, W.carry); shRz = lerp(shRz, 0.62, W.carry);
    elL = lerp(elL, -0.45, W.carry); elR = lerp(elR, -0.45, W.carry);
    shRx = lerp(shRx, -0.35 - pitch * 0.6 - s * 0.08 * amp, W.hold); elR = lerp(elR, -1.15, W.hold); shRz = lerp(shRz, -0.05, W.hold);
    // emotes
    if (W.sit > 0.001) {
      const k = W.sit;
      hipL = lerp(hipL, -1.5, k); hipR = lerp(hipR, -1.45, k); kneeL = lerp(kneeL, 0.25, k); kneeR = lerp(kneeR, 0.35, k);
      bodyY = lerp(bodyY, 0.2, k); spX = lerp(spX, -0.15 + Math.sin(time * 1.5) * 0.02, k);
      shLx = lerp(shLx, 0.5, k); shRx = lerp(shRx, 0.5, k); shLz = lerp(shLz, 0.3, k); shRz = lerp(shRz, -0.3, k);
      elL = lerp(elL, -0.1, k); elR = lerp(elR, -0.1, k);
    }
    if (W.dance > 0.001) {
      const k = W.dance, b = Math.abs(Math.sin(time * 6)), d = Math.sin(time * 6);
      hipL = lerp(hipL, -0.25 - b * 0.35, k); hipR = lerp(hipR, -0.25 - (1 - b) * 0.35, k);
      kneeL = lerp(kneeL, 0.5 + b * 0.7, k); kneeR = lerp(kneeR, 0.5 + (1 - b) * 0.7, k);
      bodyY = lerp(bodyY, bodyY - 0.05 - 0.05 * Math.max(b, 1 - b), k); bodyX = lerp(bodyX, d * 0.05, k);
      spZ = lerp(spZ, d * 0.15, k); spY = lerp(spY, Math.sin(time * 3) * 0.3, k);
      shLx = lerp(shLx, -2.7 + d * 0.3, k); shRx = lerp(shRx, -2.7 - d * 0.3, k);
      shLz = lerp(shLz, 0.35 + 0.3 * d, k); shRz = lerp(shRz, -0.35 + 0.3 * d, k);
      elL = lerp(elL, -0.6, k); elR = lerp(elR, -0.6, k);
    }
    if (W.wave > 0.001) {
      const k = W.wave;
      shRx = lerp(shRx, -0.25, k); shRz = lerp(shRz, -2.45 - 0.35 * Math.sin(time * 10), k); elR = lerp(elR, -0.35, k);
      spZ = lerp(spZ, 0.06, k);
    }
    if (W.point > 0.001) {
      const k = W.point;
      shRx = lerp(shRx, -1.55 - pitch, k); shRz = lerp(shRz, 0.12, k); elR = lerp(elR, -0.05, k); spY = lerp(spY, -0.15, k);
    }
    // melee swing (right arm)
    const swg = clamp(a.swing || 0, 0, 1);
    if (swg > 0 && alive > 0.5) {
      let tx, te, tz, ty, k;
      if (swg <= 0.3) { k = smooth(swg / 0.3); tx = -3.05; te = -1.5; tz = -0.35; ty = -0.4; }
      else {
        const u = (swg - 0.3) / 0.7, e = 1 - (1 - u) * (1 - u);
        k = 1; tx = lerp(-3.05, -0.6, e); te = lerp(-1.5, -0.1, e); tz = lerp(-0.35, 0.3, e); ty = lerp(-0.4, 0.4, e);
        spX += Math.sin(PI * u) * 0.25;
      }
      const fade = swg > 0.9 ? 1 - ((swg - 0.9) / 0.1) * 0.5 : 1;
      shRx = lerp(shRx, tx, k * fade); elR = lerp(elR, te, k * fade); shRz = lerp(shRz, tz, k * fade); spY = lerp(spY, ty, k * fade);
    }
    // dead: topple onto the battery pack, limbs splayed
    if (deadT > 0) {
      const k = smooth(deadT);
      hipL = lerp(hipL, 0.05, k); hipR = lerp(hipR, -0.15, k); kneeL = lerp(kneeL, 0.15, k); kneeR = lerp(kneeR, 0.45, k);
      shLx = lerp(shLx, -2.3, k); shRx = lerp(shRx, -1.9, k); shLz = lerp(shLz, 1.0, k); shRz = lerp(shRz, -1.2, k);
      elL = lerp(elL, -0.5, k); elR = lerp(elR, -0.2, k);
      spX = lerp(spX, -0.1, k); spY = lerp(spY, 0.1, k); spZ = lerp(spZ, 0, k);
      bodyY = lerp(bodyY, HIP_Y, k); bodyX = lerp(bodyX, 0, k); bodyZ = lerp(bodyZ, 0, k);
    }
    // squash & stretch (feet stay planted): footfall squash, jump stretch, landing / crouch squash, breathing, waddle sway
    const foot = (0.5 - Math.abs(s)) * 2;                       // +1 body high (mid-swing), -1 both feet down
    let sy = 1 + 0.03 * amp * foot + 0.09 * W.air * alive - 0.11 * landK - 0.08 * W.crouch + 0.012 * Math.sin(time * 2.2) * (1 - amp);
    sy *= 1 - 0.1 * deadT;
    const sxz = 1 - (sy - 1) * 0.55;
    rig.scale.set(sxz, sy, sxz);
    rig.rotation.x = -1.35 * fall;
    rig.rotation.z = 0.12 * fall + Math.sin(phase) * 0.05 * amp;
    rig.position.set(0, 0.24 * fall, 0.75 * fall);

    // apply
    body.position.set(bodyX, bodyY, bodyZ);
    legL.hip.rotation.set(hipL, 0, 0.04 + 0.12 * deadT); legR.hip.rotation.set(hipR, 0, -0.04 - 0.1 * deadT);
    legL.knee.rotation.x = kneeL; legR.knee.rotation.x = kneeR;
    const flat = (1 - W.sit) * alive * (1 - W.air * 0.6);
    legL.ankle.rotation.x = -(hipL + kneeL) * flat + 0.5 * deadT; legR.ankle.rotation.x = -(hipR + kneeR) * flat + 0.6 * deadT;
    spine.rotation.set(spX, spY, spZ);
    armL.sh.rotation.set(shLx, 0, shLz); armR.sh.rotation.set(shRx, 0, shRz);
    armL.el.rotation.x = elL; armR.el.rotation.x = elR;

    // helmet: look pitch (compensating the spine lean), talk nod / bounce, idle drift, a little lag on the waddle
    mouthSm = damp(mouthSm, mouthTarget, 18, dt);
    const talk = mouthSm * (0.07 + 0.05 * Math.sin(time * 17));
    neck.rotation.set(
      -pitch * 0.6 - spX * 0.7 - talk + Math.sin(time * 1.3) * 0.02 * alive - deadT * 0.35,
      Math.sin(time * 0.5) * 0.04 * alive * (1 - amp) + deadT * 0.8,
      W.dance * Math.sin(time * 6 + 1) * 0.2 + deadT * 0.2 - Math.sin(phase) * 0.04 * amp);
    head.position.y = mouthSm * 0.014 * (1 + Math.sin(time * 23));
    head.rotation.z = a.twitch || 0;
    head.rotation.y = a.twitchY || 0;

    // hat extras
    if (hatObj && hatObj.userData.spin) hatObj.userData.spin.rotation.y += dt * (9 + speed * 5);
    if (hatObj && hatObj.userData.bob) hatObj.position.y = Math.sin(time * 2) * 0.012;
    antenna.rotation.z = -0.22 - Math.sin(phase * 2) * 0.06 * amp - 0.05 * Math.sin(time * 2.3);
    refreshAntenna();

    // screen: blink, wandering pupils, rare CRT flicker, NO SIGNAL when dead
    blinkT -= dt;
    if (blinkT <= 0) {
      blinking = !blinking;
      blinkT = blinking ? 0.12 : 1.4 + rnd() * 4.5;
      if (!blinking && rnd() < 0.2) blinkT = 0.18;
      faceDirty = true;
    }
    pupilT -= dt;
    if (pupilT <= 0) {
      pupilT = 0.8 + rnd() * 3;
      fs.pupil = rnd() < 0.45 ? [0, 0] : [(rnd() - 0.5) * 2, (rnd() - 0.5) * 1.2];
      faceDirty = true;
    }
    const bl = blinking && deadT < 0.5;
    if (bl !== fs.blink) { fs.blink = bl; faceDirty = true; }
    const effExpr = deadT > 0.5 ? 'dead' : null;
    if (effExpr !== extraExpr) { extraExpr = effExpr; faceDirty = true; }
    const ns = extraExpr === 'dead' || fs.expr === 'dead';
    if (ns !== noSig) { noSig = ns; faceDirty = true; }
    if (noSig) { staticT -= dt; if (staticT <= 0) { staticT = 0.09; faceDirty = true; } }
    if (fs.style === 'mimic') {
      const t2 = Math.sin(time * 13) > 0.97 ? 1 : 0;
      if (t2 !== fs.twitch) { fs.twitch = t2; faceDirty = true; }
    }
    flickT -= dt;
    if (flickT <= 0) { flickOn = flickOn > 0 ? 0 : 0.07; flickT = flickOn > 0 ? 0.07 : 5 + rnd() * 7; faceMat.color.setScalar(flickOn > 0 ? 0.4 : 1); }
    if (faceDirty) redraw();
    look?.update(dt, time, a, mouthSm);
  }

  function setMouth(v) {
    v = clamp(v || 0, 0, 1);
    mouthTarget = v;
    const m = v < 0.05 ? 0 : v;
    if (Math.abs(m - drawnMouth) > 0.04 || (m === 0 && drawnMouth !== 0)) { fs.mouth = m; redraw(); }
  }
  function setExpression(e) {
    const v = ['normal', 'happy', 'scared', 'dead', 'angry'].includes(e) ? e : 'normal';
    if (v !== fs.expr) { fs.expr = v; noSig = extraExpr === 'dead' || v === 'dead'; redraw(); }
  }
  redraw();
  update(0, {});

  const instr = pv(spine, [0, 0, 0.09], null, 'instr');       // instrument mount (music.js): the classic torso front was 0.09 m closer
  return {
    root,
    limbs: { shL: armL.sh, elL: armL.el, shR: armR.sh, elR: armR.el, hipL: legL.hip, kneeL: legL.knee, ankleL: legL.ankle, hipR: legR.hip, kneeR: legR.knee, ankleR: legR.ankle },   // [dance] pivots for keyframed dances
    parts: { head, torso: spine, handR: armR.hand, handL: armL.hand, backpack, face, neck, hips: body, hatSlot, chest: chestFrame, instr },
    height: 1.8,
    radius: 0.35,
    style: 'tfg2',
    update,
    setMouth,
    setExpression,
    setSuitColor(hex) { if (!OUTFIT_BY_ID[curSuit]) suitMat.color.set(hex); },
    setHat,
    getHat: () => hatId,
    setLook,
    getLook: () => ({ suit: curSuit, hat: hatId, face: curFace, back: curBack }),
    setEyeColor(hex) { fs.eye = hex; redraw(); },
    setHitFlash(v) { tinter.setFlash(v); },
    setVisible(b) { root.visible = !!b; },
    dispose() {
      if (hatObj) hatSlot.remove(hatObj);
      look.dispose();
      tinter.dispose();
      suitMat.dispose(); gloveMat.dispose(); bootMat.dispose(); beltMatI.dispose();
      faceMat.dispose();
      if (faceT) faceT.tex.dispose();
    },
  };
}
