// avatar.js — player employee in a hazmat suit (third-person avatar + first-person view model).
// Faces +Z, origin at feet, height ≈ 1.8 m. All animation is procedural (pivot Groups).
//
// createAvatar({ suitColor, hat, visorColor, faceStyle:'normal'|'mimic', eyeColor })
//   update(dt, anim) notes:
//     lookPitch > 0 = looking UP (camera convention), clamped to ±0.8.
//     while climbing, pass the climb speed (m/s) in anim.speed — it drives the climb cycle.
//     optional anim.twitch / anim.twitchY: extra head roll / yaw (used by the mimic).
//   parts.handR / handL: attach frames; item forward = -Z, item up = +Y (in carry/holding pose
//     -Z points forward from the body). Extra parts: neck, hips, hatSlot.
//   extra methods: getHat(), setEyeColor(css).
// createViewModel(): anim.leftHand (bool) additionally shows the left arm (e.g. flashlight).
//
// WARDROBE (wave 1, src/models/cosmetics.js): setLook({ suit, hat, face, back }) applies an outfit ("suit" ids in
// OUTFITS: venom, hazmat, clown ...) or a plain colour suit, a hat, a face accessory and a back accessory. Undefined
// fields keep their current value. Outfits are appearance only. viewModel.setLook / setOutfit dress the first-person arms.
import * as THREE from 'three';
import {
  G, xf, merged, lam, lamI, basI, bas, tex, newTex, noiseFill, mk, pv, Tinter,
  clamp, lerp, smooth, damp, rng, TAU, PI,
} from './modelkit.js';
import { OUTFIT_BY_ID, OUTFITS, HATS_EXTRA, buildHatExtra, createLookController, outfitLook } from './cosmetics.js';
import { createAvatar2, A2 } from './avatar2.js';   // [avatar2] rounded "TFG Employee" (docs/wave2/avatar2.md); this file keeps the classic hazmat avatar

export const SUIT_COLORS = [
  { id: 'orange', name: 'Orange', color: '#d9642b' },
  { id: 'green', name: 'Green', color: '#4f8a3a' },
  { id: 'blue', name: 'Blue', color: '#2f5fb0' },
  { id: 'purple', name: 'Purple', color: '#6d3fa6' },
  { id: 'pink', name: 'Pink', color: '#e07aa8' },
  { id: 'black', name: 'Black', color: '#26262b' },
  { id: 'white', name: 'White', color: '#d8d6cf' },
  { id: 'yellow', name: 'Yellow', color: '#e2c02e' },
  { id: 'red', name: 'Red', color: '#b3262a' },
  { id: 'camo', name: 'Camo', color: '#5e6b3c' },
  { id: 'teal', name: 'Teal', color: '#2a8f8a' },
  { id: 'brown', name: 'Brown', color: '#7a5231' },
  { id: 'kefal', name: 'Kefal', color: '#8fa9bd' },
  { id: 'gold', name: 'Gold', color: '#c9a227' },   // achievement-only: TFG Legend reward (achievements.js), not sold
];

// wardrobe outfits share the suit id space (profile.suit): the entry gives them a swatch colour for old code paths
for (const o of OUTFITS) if (!SUIT_COLORS.some((x) => x.id === o.id)) SUIT_COLORS.push({ id: o.id, name: o.name, color: o.color, outfit: true, tier: o.tier });

export const HATS = [
  { id: 'none', name: 'None' },
  { id: 'cap', name: 'Cap' },
  { id: 'cone', name: 'Traffic Cone' },
  { id: 'bunny', name: 'Bunny Ears' },
  { id: 'kefal', name: 'Kefal' },
  { id: 'crown', name: 'Crown' },
  { id: 'tophat', name: 'Top Hat' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'propeller', name: 'Propeller Beanie' },
  { id: 'hardhat', name: 'Hard Hat' },
  { id: 'chef', name: 'Chef Hat' },
  { id: 'party', name: 'Party Hat' },
  { id: 'halo', name: 'Halo' },
  { id: 'horns', name: 'Horns' },
  { id: 'antenna', name: 'Antenna' },
  ...HATS_EXTRA.map((h) => ({ id: h.id, name: h.name })),
];

// ------------------------------------------------------------------ shared looks
export const C = {
  dark: '#2a2622', belt: '#3b3026', tank: '#d9a91e', metal: '#7d8184', visor: '#0d1318', eye: '#bff4ff',
};
export const suitTex = () => tex('suitFabric', 32, 32, (ctx, w, h, r) => {
  noiseFill(ctx, w, h, r, '#ffffff', 0.09, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 15, w, 1); ctx.fillRect(15, 0, 1, h); // seams
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 6; i++) ctx.fillRect((r() * w) | 0, (r() * h) | 0, 3, 2); // grime
});
const darkMat = () => lam(C.dark);
const beltMat = () => lam(C.belt);
const tankMat = () => lam(C.tank, { map: tex('tankStripe', 16, 16, (ctx, w, h, r) => { noiseFill(ctx, w, h, r, '#ffffff', 0.08); ctx.fillStyle = '#333'; ctx.fillRect(0, 3, w, 2); ctx.fillRect(0, 12, w, 1); }) });
const metalMat = () => lam(C.metal);

// ------------------------------------------------------------------ visor face
// The visor is a partial sphere; its UVs span ~1.5x wider than tall, so shapes are
// drawn horizontally squeezed by ASPECT to look round on the helmet.
const ASPECT = 1.5;
function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.3, rx / ASPECT), Math.max(0.3, ry), 0, 0, TAU); }

// Venom symbiote face: white angular eye patches + a wide toothy grin on a black visor
function drawVenomFace(ctx, s) {
  const W = 64, H = 64;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#10122a'); g.addColorStop(0.45, '#04050c'); g.addColorStop(1, '#000000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(150,170,255,0.10)';
  ctx.beginPath(); ctx.moveTo(6, 3); ctx.lineTo(22, 3); ctx.lineTo(12, 18); ctx.lineTo(5, 18); ctx.fill();
  const expr = s.expr, m = s.mouth;
  ctx.save();
  ctx.fillStyle = '#f6f8ff'; ctx.strokeStyle = '#f6f8ff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 4;
  const P = (side, dx, y) => [32 + side * dx, y];
  for (const side of [-1, 1]) {
    if (expr === 'dead') {
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(...P(side, 8, 17)); ctx.lineTo(...P(side, 24, 34)); ctx.moveTo(...P(side, 24, 17)); ctx.lineTo(...P(side, 8, 34)); ctx.stroke();
      continue;
    }
    if (s.blink) { ctx.fillRect(Math.min(P(side, 6, 0)[0], P(side, 24, 0)[0]), 27, 18, 2); continue; }
    const k = expr === 'scared' ? 1.14 : 1, sq = expr === 'happy' ? 0.62 : 1, cy = 27;
    const Y = (y) => cy + (y - cy) * sq * k;
    ctx.beginPath();
    let pt = P(side, 5, Y(26)); ctx.moveTo(pt[0], pt[1]);
    pt = P(side, 15, Y(19)); ctx.lineTo(pt[0], pt[1]);
    pt = P(side, 26, Y(14)); ctx.lineTo(pt[0], pt[1]);
    pt = P(side, 22 + (k - 1) * 4, Y(28)); ctx.lineTo(pt[0], pt[1]);
    pt = P(side, 9, Y(36)); ctx.lineTo(pt[0], pt[1]);
    ctx.closePath(); ctx.fill();
  }
  // the grin
  ctx.shadowBlur = 2;
  const t = (x) => (x - 32) / 27, top = (x) => 42 + 5 * (1 - t(x) * t(x)) + (expr === 'angry' ? -1 : 0);
  const gap = (x) => (2.6 + 9 * m) * Math.sqrt(Math.max(0, 1 - t(x) * t(x)));
  ctx.lineWidth = 1.1;
  ctx.beginPath(); for (let x = 5; x <= 59; x += 2) { const y = top(x); if (x === 5) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  ctx.beginPath(); for (let x = 5; x <= 59; x += 2) { const y = top(x) + gap(x); if (x === 5) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  const tl = 3.6 + m * 2.5;
  for (let x = 8; x <= 56; x += 5.4) { const y = top(x), l = tl * (1 - 0.35 * Math.abs(t(x))); ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.lineTo(x, y + l); ctx.fill(); }
  for (let x = 10.7; x <= 54; x += 5.4) { const y = top(x) + gap(x), l = (tl - 0.4) * (1 - 0.35 * Math.abs(t(x))); ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.lineTo(x, y - l); ctx.fill(); }
  if (m > 0.4) { ctx.shadowBlur = 0; ctx.fillStyle = '#c23a5a'; const y = top(32) + gap(32); ctx.beginPath(); ctx.moveTo(28, y - 2); ctx.lineTo(36, y - 2); ctx.lineTo(35, y + 4 + m * 6); ctx.lineTo(29, y + 4 + m * 6); ctx.fill(); }
  ctx.restore();
}

// LED face accessory: the visor becomes a pixel display (5x6 eyes on a 3 px pitch, bar mouth)
const LED_EYE = {
  normal: ['.###.', '#####', '#####', '#####', '#####', '.###.'],
  blink: ['.....', '.....', '.....', '#####', '.....', '.....'],
  happy: ['.....', '.###.', '#...#', '.....', '.....', '.....'],
  dead: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  scared: ['.###.', '#...#', '#...#', '#...#', '.###.', '.....'],
  angry: ['#....', '##...', '#####', '.###.', '.###.', '.....'],
};
function drawLedFace(ctx, s) {
  const W = 64, H = 64;
  ctx.fillStyle = '#03070a'; ctx.fillRect(0, 0, W, H);
  const on = '#42ff8f', off = 'rgba(66,255,143,0.07)';
  const cell = (gx, gy, lit) => { ctx.fillStyle = lit ? on : off; ctx.fillRect(3 + gx * 3, 6 + gy * 3, 2, 2); };
  for (let gy = 0; gy < 17; gy++) for (let gx = 0; gx < 20; gx++) cell(gx, gy, false);
  ctx.shadowColor = on; ctx.shadowBlur = 3;
  const key = s.expr === 'dead' ? 'dead' : s.blink ? 'blink' : LED_EYE[s.expr] ? s.expr : 'normal';
  for (const [side, x0] of [[-1, 3], [1, 12]]) {
    const bm = LED_EYE[key];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      const cc = key === 'angry' && side > 0 ? 4 - c : c;
      if (bm[r][cc] === '#') cell(x0 + c, 2 + r, true);
    }
  }
  const m = s.mouth;
  if (s.expr === 'happy' || (m < 0.06 && s.expr !== 'dead' && s.expr !== 'angry')) {
    if (s.expr === 'happy') { for (const [x, y] of [[4, 11], [5, 12], [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13], [13, 12], [14, 11]]) cell(x, y, true); }
    else for (let x = 6; x <= 13; x++) cell(x, 12, true);
  } else if (m < 0.06) { for (let x = 6; x <= 13; x++) cell(x, 12, true); }
  else {
    const rows = 1 + Math.round(m * 3);
    for (let x = 6; x <= 13; x++) { cell(x, 11, true); cell(x, 11 + rows, true); }
    for (let r = 1; r < rows; r++) { cell(6, 11 + r, true); cell(13, 11 + r, true); }
  }
  ctx.shadowBlur = 0;
}

export function drawFace(ctx, s) {
  const W = 64, H = 64;
  if (s.style !== 'mimic') {
    if (s.led) { drawLedFace(ctx, s); return; }
    if (s.style === 'venom') { drawVenomFace(ctx, s); return; }
  }
  // visor background + reflection
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.visor);
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(20, 4); ctx.lineTo(10, 24); ctx.lineTo(4, 24); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(22, 5, 4, 2);

  const eye = s.eye, ex = 11, ey = 26;
  ctx.save();
  if (s.style === 'mimic') {
    // cracked dark mask with two tiny white pupils
    ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(170,170,160,0.55)'; ctx.lineWidth = 1;
    const r = rng(7);
    for (let c = 0; c < 5; c++) {
      ctx.beginPath();
      let x = 32 + (r() - 0.5) * 20, y = 10 + r() * 40;
      ctx.moveTo(x, y);
      for (let i = 0; i < 5; i++) { x += (r() - 0.5) * 16; y += (r() - 0.5) * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.shadowColor = eye; ctx.shadowBlur = 4; ctx.fillStyle = eye;
    const j = s.twitch || 0;
    ctx.fillRect(32 - ex + j, ey + s.pupil[1], 2, 2);
    ctx.fillRect(32 + ex - 1 - j, ey + s.pupil[1] + 1, 2, 2);
    ctx.shadowBlur = 0;
    // mouth: a dark crack that splits open with volume
    const m = s.mouth;
    ctx.fillStyle = '#000'; ctx.strokeStyle = 'rgba(150,20,20,0.9)';
    ctx.beginPath(); ctx.moveTo(22, 46); ctx.lineTo(28, 45 - m * 4); ctx.lineTo(36, 47 - m * 5); ctx.lineTo(42, 45);
    ctx.lineTo(36, 47 + m * 7); ctx.lineTo(28, 46 + m * 6); ctx.closePath(); ctx.fill(); if (m > 0.1) ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.shadowColor = eye; ctx.shadowBlur = 5;
  ctx.fillStyle = eye; ctx.strokeStyle = eye;
  const expr = s.expr;
  const px = s.pupil[0], py = s.pupil[1];
  for (const side of [-1, 1]) {
    const x = 32 + side * ex;
    if (expr === 'dead') {
      ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x - 3, ey - 5); ctx.lineTo(x + 3, ey + 5); ctx.moveTo(x + 3, ey - 5); ctx.lineTo(x - 3, ey + 5); ctx.stroke();
      continue;
    }
    if (s.blink) { ctx.fillRect(x - 4, ey, 8 / ASPECT * 1.2, 1.5); continue; }
    if (expr === 'happy') {
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(x, ey + 3, 5 / ASPECT, 6, 0, PI * 1.05, PI * 1.95); ctx.stroke();
      continue;
    }
    const big = expr === 'scared' ? 1.25 : 1;
    ell(ctx, x, ey, 6.5 * big, 8 * big); ctx.fill();
    ctx.shadowBlur = 0;
    // pupils
    ctx.fillStyle = '#0b1a22';
    const pr = expr === 'scared' ? 1.3 : 2.4;
    ell(ctx, x + px * 1.2 - side * 0.4, ey + 1 + py * 1.5, pr * 1.3, pr * 1.5); ctx.fill();
    if (expr === 'angry') {
      ctx.fillStyle = s.visor; ctx.beginPath();
      if (side < 0) { ctx.moveTo(x - 6, ey - 10); ctx.lineTo(x + 6, ey - 10); ctx.lineTo(x + 6, ey - 1); }
      else { ctx.moveTo(x + 6, ey - 10); ctx.lineTo(x - 6, ey - 10); ctx.lineTo(x - 6, ey - 1); }
      ctx.fill();
    }
    ctx.fillStyle = eye; ctx.shadowBlur = 5;
  }
  // mouth
  const m = s.mouth, my = 46;
  ctx.shadowBlur = 4;
  if (expr === 'dead') {
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(26, my); for (let i = 1; i <= 6; i++) ctx.lineTo(26 + i * 2, my + (i % 2 ? 1.5 : -1)); ctx.stroke();
  } else if (m < 0.06) {
    if (expr === 'happy') { ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(32, my - 3, 6 / ASPECT, 4, 0, PI * 0.1, PI * 0.9); ctx.stroke(); }
    else if (expr === 'scared') { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(27, my); ctx.lineTo(29, my - 1.5); ctx.lineTo(32, my); ctx.lineTo(35, my - 1.5); ctx.lineTo(37, my); ctx.stroke(); }
    else if (expr === 'angry') ctx.fillRect(27, my + 1, 10, 1.5);
    else ctx.fillRect(28.5, my, 7, 1.5);
  } else {
    const rx = 5 + m * 3.5, ry = 1 + m * 9.5;
    ctx.lineWidth = 1.5;
    ell(ctx, 32, my + ry * 0.35, rx * ASPECT * 0.9, ry);
    ctx.fillStyle = '#04070a'; ctx.fill(); ctx.stroke();
    if (m > 0.45) { ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(191,244,255,0.35)'; ell(ctx, 32, my + ry * 0.9, rx * ASPECT * 0.5, ry * 0.25); ctx.fill(); }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ hats
// Hat slot origin = top of the helmet dome. Each hat returns a Group (shared geometry/materials).
export function buildHat(id) {
  const g = new THREE.Group();
  g.name = 'hat_' + id;
  const add = (key, mat, parts) => mk(g, merged('hat_' + id + '_' + key, parts), mat);
  const dome = (r) => G.sph(r, 8, 3, 0, TAU, 0, PI / 2);
  switch (id) {
    case 'cap':
      add('a', lam('#b8302a'), () => [xf(dome(0.172), [0, -0.05, 0], [0, 0, 0], [1, 0.62, 1]), xf(G.box(0.2, 0.014, 0.15), [0, -0.035, 0.19], [-0.15, 0, 0])]);
      add('b', lam('#eeeeee'), () => [xf(G.box(0.03, 0.03, 0.03), [0, 0.056, 0])]);
      break;
    case 'cone':
      add('a', lam('#ff6a13'), () => [xf(G.cone(0.1, 0.34, 8), [0, 0.17, 0]), xf(G.box(0.27, 0.035, 0.27), [0, 0, 0])]);
      add('b', lam('#f0f0e8'), () => [xf(G.cyl(0.066, 0.078, 0.06, 8, true), [0, 0.13, 0])]);
      break;
    case 'bunny':
      add('a', lam('#f2efe8'), () => [xf(G.cap(0.035, 0.2, 2, 5), [0.07, 0.12, 0], [0, 0, -0.25], [1, 1, 0.55]), xf(G.cap(0.035, 0.2, 2, 5), [-0.07, 0.1, 0], [0.3, 0, 0.35], [1, 1, 0.55])]);
      add('b', lam('#f09bb3'), () => [xf(G.box(0.03, 0.18, 0.01), [0.07, 0.12, 0.012], [0, 0, -0.25]), xf(G.box(0.03, 0.18, 0.01), [-0.075, 0.1, 0.025], [0.3, 0, 0.35])]);
      break;
    case 'kefal': {
      // a grey mullet lying on its side across the helmet, head to the right
      add('a', lam('#9fb3c2'), () => [
        xf(G.sph(0.1, 8, 5), [0, 0.03, 0], [0, 0, 0], [2.1, 0.42, 0.75]),
        xf(G.cone(0.08, 0.14, 4), [-0.26, 0.03, 0], [0, 0, PI / 2], [1, 1, 0.25]),
        xf(G.cone(0.05, 0.1, 4), [0.02, 0.05, -0.08], [-PI / 2 - 0.3, 0, 0], [1.4, 1, 0.2]),
      ]);
      add('b', lam('#dfe7ea'), () => [xf(G.sph(0.08, 6, 3, 0, TAU, 0, PI / 2), [0.04, 0.05, 0], [0, 0, 0], [2.3, 0.28, 0.6])]);
      add('c', bas('#111111'), () => [xf(G.box(0.025, 0.012, 0.025), [0.15, 0.075, 0.01])]);
      add('d', bas('#e8e0c0'), () => [xf(G.box(0.04, 0.008, 0.04), [0.15, 0.07, 0.01])]);
      break;
    }
    case 'crown':
      add('a', lam('#e8b43a', { emissive: '#3a2600' }), () => {
        const a = [xf(G.cyl(0.12, 0.11, 0.08, 8, true), [0, 0.02, 0])];
        for (let i = 0; i < 5; i++) { const t = (i / 5) * TAU; a.push(xf(G.cone(0.03, 0.08, 4), [Math.sin(t) * 0.11, 0.1, Math.cos(t) * 0.11])); }
        return a;
      });
      add('b', bas('#d0213a'), () => [0, 1, 2, 3, 4].map((i) => { const t = (i / 5) * TAU + 0.6; return xf(G.box(0.025, 0.025, 0.025), [Math.sin(t) * 0.12, 0.02, Math.cos(t) * 0.12], [0, t, PI / 4]); }));
      break;
    case 'tophat':
      add('a', lam('#1b1b1f'), () => [xf(G.cyl(0.11, 0.115, 0.24, 10), [0, 0.12, 0]), xf(G.cyl(0.2, 0.2, 0.015, 10), [0, 0.005, 0])]);
      add('b', lam('#9a1c24'), () => [xf(G.cyl(0.118, 0.12, 0.04, 10, true), [0, 0.04, 0])]);
      break;
    case 'headphones':
      add('a', lam('#2a2d33'), () => [xf(G.tor(0.18, 0.015, 3, 10, PI), [0, -0.13, 0]), xf(G.cyl(0.07, 0.07, 0.06, 8), [0.18, -0.15, 0], [0, 0, PI / 2]), xf(G.cyl(0.07, 0.07, 0.06, 8), [-0.18, -0.15, 0], [0, 0, PI / 2])]);
      add('b', lam('#e04a3a'), () => [xf(G.cyl(0.045, 0.045, 0.065, 6), [0.19, -0.15, 0], [0, 0, PI / 2]), xf(G.cyl(0.045, 0.045, 0.065, 6), [-0.19, -0.15, 0], [0, 0, PI / 2])]);
      break;
    case 'propeller': {
      add('a', lam('#d23c3c'), () => [xf(G.sph(0.172, 2, 3, 0, PI / 2, 0, PI / 2), [0, -0.05, 0], [0, 0, 0], [1, 0.6, 1]), xf(G.sph(0.172, 2, 3, PI, PI / 2, 0, PI / 2), [0, -0.05, 0], [0, 0, 0], [1, 0.6, 1])]);
      add('b', lam('#2f6fd0'), () => [xf(G.sph(0.172, 2, 3, PI / 2, PI / 2, 0, PI / 2), [0, -0.05, 0], [0, 0, 0], [1, 0.6, 1]), xf(G.sph(0.172, 2, 3, PI * 1.5, PI / 2, 0, PI / 2), [0, -0.05, 0], [0, 0, 0], [1, 0.6, 1]), xf(G.cyl(0.01, 0.01, 0.07, 4), [0, 0.08, 0])]);
      const spin = pv(g, [0, 0.115, 0]);
      mk(spin, merged('hat_prop_blades', () => [xf(G.box(0.34, 0.008, 0.045), [0, 0, 0], [0.25, 0, 0]), xf(G.box(0.045, 0.008, 0.34), [0, 0, 0], [0, 0, -0.25])]), lam('#f0d020'));
      g.userData.spin = spin;
      break;
    }
    case 'hardhat':
      add('a', lam('#f2c418'), () => [xf(G.sph(0.18, 8, 3, 0, TAU, 0, PI / 2), [0, -0.06, 0], [0, 0, 0], [1, 0.7, 1.05]), xf(G.cyl(0.22, 0.22, 0.014, 10), [0, -0.055, 0.02]), xf(G.box(0.035, 0.05, 0.3), [0, 0.06, 0])]);
      break;
    case 'chef':
      add('a', lam('#f4f2ec'), () => [xf(G.cyl(0.13, 0.12, 0.12, 8), [0, 0.03, 0]), xf(G.sph(0.16, 8, 5), [0, 0.13, 0], [0, 0, 0], [1, 0.6, 1]), xf(G.sph(0.08, 6, 4), [0.08, 0.17, 0.03]), xf(G.sph(0.08, 6, 4), [-0.07, 0.17, -0.04])]);
      break;
    case 'party':
      add('a', lam('#8f3fd0', { map: tex('partyStripe', 16, 16, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f5d33a'; for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 4, w, 2); }) }), () => [xf(G.cone(0.08, 0.26, 8), [0.02, 0.12, 0], [0, 0, -0.15])]);
      add('b', lam('#ff5fa0'), () => [xf(G.ico(0.035, 0), [0.04, 0.26, 0])]);
      break;
    case 'halo':
      add('a', bas('#fff2a0'), () => [xf(G.tor(0.13, 0.014, 3, 12), [0, 0.1, 0], [PI / 2, 0, 0])]);
      g.userData.bob = true;
      break;
    case 'horns':
      add('a', lam('#7a1414'), () => [xf(G.cone(0.04, 0.16, 5), [0.1, 0.02, 0.03], [0.2, 0, -0.6]), xf(G.cone(0.04, 0.16, 5), [-0.1, 0.02, 0.03], [0.2, 0, 0.6])]);
      break;
    case 'antenna':
      add('a', metalMat(), () => [xf(G.cyl(0.006, 0.01, 0.2, 4), [0.05, 0.08, -0.03], [0, 0, -0.15]), xf(G.cyl(0.03, 0.03, 0.02, 6), [0.03, -0.01, -0.03])]);
      add('b', bas('#ff3030'), () => [xf(G.ico(0.025, 0), [0.08, 0.19, -0.03])]);
      break;
    default:
      return buildHatExtra(id);
  }
  return g;
}

// ------------------------------------------------------------------ avatar
const HIP_Y = 0.93, THIGH = 0.44, SHIN = 0.40, UARM = 0.30, FARM = 0.27;
const VISOR_PHI = PI * 0.6;
// hand attach frame: -Z along the forearm (away from elbow), +Y = forearm's +Z side (up when arm raised forward)
const HAND_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));

function buildLeg(parent, side, suitMat, bootMat = darkMat()) {
  const hip = pv(parent, [side * 0.11, 0, 0]);
  mk(hip, G.segY(THIGH, 0.095, 0.082, 5), suitMat);
  const knee = pv(hip, [0, -THIGH, 0]);
  mk(knee, merged('av_shin', () => [xf(G.segY(SHIN, 0.082, 0.07, 5)), xf(G.box(0.12, 0.08, 0.05), [0, -0.03, 0.06])]), suitMat);
  const ankle = pv(knee, [0, -SHIN, 0]);
  mk(ankle, merged('av_boot', () => [xf(G.box(0.14, 0.11, 0.25), [0, -0.035, 0.035]), xf(G.box(0.13, 0.06, 0.13), [0, 0.02, 0])]), bootMat);
  return { hip, knee, ankle };
}
function buildArm(parent, side, suitMat, gloveMat = darkMat()) {
  const sh = pv(parent, [side * 0.3, 0.44, 0]);
  mk(sh, merged('av_uarm', () => [xf(G.segY(UARM, 0.078, 0.066, 5)), xf(G.sph(0.098, 5, 3), [0, -0.02, 0])]), suitMat);
  const el = pv(sh, [0, -UARM, 0]);
  mk(el, G.segY(FARM, 0.068, 0.058, 5), suitMat);
  mk(el, merged('av_glove', () => [xf(G.box(0.1, 0.13, 0.09), [0, -FARM - 0.05, 0.005]), xf(G.cyl(0.072, 0.072, 0.045, 5, true), [0, -FARM + 0.01, 0]), xf(G.box(0.035, 0.07, 0.05), [0.045, -FARM - 0.03, 0.04], [0, 0, 0.3])]), gloveMat);
  const hand = new THREE.Object3D();
  hand.name = side > 0 ? 'handL' : 'handR';
  hand.position.set(0, -FARM - 0.08, 0.01);
  hand.quaternion.copy(HAND_Q);
  el.add(hand);
  return { sh, el, hand };
}

// [avatar2] style switch: settings.classicAvatar (ui.js / main.js call setClassicAvatar). Creature models that decorate the old
// hazmat body (mimic: faceStyle 'mimic', hit squad: visorColor) always stay classic. opts.classic overrides.
let CLASSIC = false;
export function setClassicAvatar(b) { CLASSIC = !!b; }
export function isClassicAvatar() { return CLASSIC; }
export function createAvatar(opts = {}) {
  const classic = opts.classic ?? (CLASSIC || opts.faceStyle === 'mimic' || opts.visorColor !== undefined);
  if (!classic) { try { return createAvatar2(opts); } catch (e) { console.warn('[avatar2] falling back to the classic avatar', e); } }
  return createAvatarClassic(opts);
}
/**
 * createAvatarClassic(opts) — see file header. Extra (non-spec) options:
 *   faceStyle: 'normal' | 'mimic', eyeColor: css color of the visor face glow.
 */
export function createAvatarClassic({ suitColor = '#d9642b', hat = 'none', visorColor, faceStyle = 'normal', eyeColor } = {}) {
  const root = new THREE.Group();
  root.name = 'avatar';
  const baseMap = suitTex();
  const suitMat = lamI(suitColor, { map: baseMap });
  const gloveMat = lamI(C.dark), bootMat = lamI(C.dark), beltMatI = lamI(C.belt);   // per instance: outfits recolour them
  const rnd = rng((Math.random() * 1e9) | 0);

  const rig = pv(root, null, null, 'rig');
  const body = pv(rig, [0, HIP_Y, 0], null, 'hips');
  mk(body, merged('av_pelvis', () => [xf(G.box(0.36, 0.2, 0.27), [0, 0.02, 0]), xf(G.box(0.2, 0.12, 0.05), [0, -0.02, 0.13])]), suitMat);
  const legL = buildLeg(body, 1, suitMat, bootMat), legR = buildLeg(body, -1, suitMat, bootMat);

  const spine = pv(body, [0, 0.07, 0], null, 'torso');
  mk(spine, merged('av_torso', () => [
    xf(G.cyl(0.25, 0.22, 0.5, 8, true), [0, 0.25, 0], [0, PI / 8, 0], [1, 1, 0.66]),
    xf(G.cyl(0.19, 0.25, 0.07, 8), [0, 0.535, 0], [0, PI / 8, 0], [1, 1, 0.66]),
    xf(G.box(0.11, 0.1, 0.03), [0.1, 0.32, 0.165]),
  ]), suitMat);
  const beltMesh = mk(spine, merged('av_belt', () => [
    xf(G.cyl(0.236, 0.236, 0.07, 8, true), [0, 0.03, 0], [0, PI / 8, 0], [1, 1, 0.7]),
    xf(G.box(0.09, 0.09, 0.06), [0.15, 0.0, 0.16]), xf(G.box(0.09, 0.09, 0.06), [-0.15, 0.0, 0.16]),
    xf(G.box(0.05, 0.4, 0.02), [0.11, 0.3, 0.166]), xf(G.box(0.05, 0.4, 0.02), [-0.11, 0.3, 0.166]),
    xf(G.box(0.05, 0.025, 0.34), [0.11, 0.52, 0]), xf(G.box(0.05, 0.025, 0.34), [-0.11, 0.52, 0]),
  ]), beltMatI);
  const regulatorMesh = mk(spine, merged('av_regulator', () => [xf(G.box(0.1, 0.07, 0.05), [0, 0.2, 0.175]), xf(G.cyl(0.15, 0.16, 0.07, 8, true), [0, 0.55, 0])]), metalMat());

  const backpack = pv(spine, [0, 0.28, -0.2], null, 'backpack');
  const backpackGear = pv(backpack, null, null, 'backpackGear');   // stock frame + tank (wardrobe outfits may hide it)
  mk(backpackGear, merged('av_frame', () => [xf(G.box(0.34, 0.46, 0.05)), xf(G.box(0.3, 0.05, 0.14), [0, -0.21, -0.06])]), darkMat());
  mk(backpackGear, merged('av_tank', () => [
    xf(G.cyl(0.105, 0.105, 0.4, 7, true), [0, 0, -0.105]),
    xf(G.sph(0.105, 7, 2, 0, TAU, 0, PI / 2), [0, 0.2, -0.105]),
    xf(G.sph(0.105, 7, 2, 0, TAU, 0, PI / 2), [0, -0.2, -0.105], [PI, 0, 0]),
  ]), tankMat());
  mk(backpackGear, merged('av_valve', () => [xf(G.cyl(0.03, 0.03, 0.07, 6), [0, 0.32, -0.105]), xf(G.box(0.09, 0.02, 0.02), [0, 0.35, -0.105])]), metalMat());

  const armL = buildArm(spine, 1, suitMat, gloveMat), armR = buildArm(spine, -1, suitMat, gloveMat);

  const neck = pv(spine, [0, 0.5, 0], null, 'neck');
  const head = pv(neck, null, null, 'head');
  const headMesh = mk(head, G.sph(0.165, 9, 7), suitMat, [0, 0.135, 0]);
  const helmetBitsMesh = mk(head, merged('av_helmetbits', () => [
    xf(G.box(0.03, 0.08, 0.08), [0.163, 0.13, 0]), xf(G.box(0.03, 0.08, 0.08), [-0.163, 0.13, 0]),
    xf(G.box(0.05, 0.05, 0.08), [0.15, 0.24, 0.05]),
  ]), metalMat());
  const helmetLightMesh = mk(head, G.box(0.035, 0.035, 0.01), bas('#fff1b8'), [0.15, 0.24, 0.092]);

  // visor face (per-instance canvas)
  const faceT = newTex(64, 64);
  const visorBase = visorColor || C.visor;
  const visorMat = faceT ? basI('#ffffff', { map: faceT.tex }) : basI(visorBase);
  const face = mk(head, G.sph(0.172, 8, 4, PI / 2 - VISOR_PHI / 2, VISOR_PHI, PI * 0.28, PI * 0.4), visorMat, [0, 0.135, 0]);
  face.name = 'visor';
  const fs = { mouth: 0, expr: 'normal', blink: false, pupil: [0, 0], eye: eyeColor || C.eye, visor: visorBase, style: faceStyle, twitch: 0, led: false };
  let drawnMouth = -1, faceDirty = true, extraExpr = null;
  const redraw = () => {
    faceDirty = false; drawnMouth = fs.mouth;
    if (!faceT) return;
    const saved = fs.expr;
    if (extraExpr) fs.expr = extraExpr;
    drawFace(faceT.ctx, fs);
    fs.expr = saved;
    faceT.tex.needsUpdate = true;
  };

  const hatSlot = pv(head, [0, 0.295, 0], null, 'hatSlot');
  let hatObj = null, hatId = 'none';
  const tinter = new Tinter(root);
  let look = null;                       // wardrobe controller (outfit / face / back attachments), created below
  function setHat(id) {
    if (hatObj) hatSlot.remove(hatObj);
    hatId = HATS.some((h) => h.id === id) ? id : 'none';
    hatObj = buildHat(hatId);
    hatSlot.add(hatObj);
    look?.onHat(hatId);
    tinter.refresh();
  }
  setHat(hat);
  look = createLookController({
    root, body, spine, neck, head, hatSlot, legL, legR, armL, armR, backpack, backpackGear, suitMat, gloveMat, bootMat, beltMat: beltMatI, baseMap,
    gear: { belt: beltMesh, regulator: regulatorMesh, helmetbits: helmetBitsMesh, helmetLight: helmetLightMesh, headMesh, face },
    fs, redraw, tinterRefresh: () => tinter.refresh(), getHat: () => hatId,
  });
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
    // the ship mirror keeps the local avatar on its own render layer: new attachments must join it
    if (changed && root.layers.mask !== 1) { const m = root.layers.mask; root.traverse((o) => { o.layers.mask = m; }); }
  }

  // ---- animation state
  const W = { crouch: 0, sprint: 0, air: 0, carry: 0, hold: 0, climb: 0, sit: 0, dance: 0, wave: 0, point: 0 };
  let phase = 0, climbPh = 0, deadT = 0, mouthTarget = 0, mouthSm = 0, localTime = 0;
  let blinkT = 2 + rnd() * 3, blinking = false, pupilT = 1;
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

    // gait: phase advances with distance travelled so feet don't slide
    const stride = lerp(lerp(1.5, 2.4, W.sprint), 1.05, W.crouch);
    phase = (phase + (speed * dt / stride) * TAU) % TAU;
    if (a.climbing) climbPh = (climbPh + speed * dt * 5) % TAU;
    const amp = clamp(speed / 2.2, 0, 1) * (1 - W.air) * (1 - W.climb) * (1 - W.sit) * alive;
    const s = Math.sin(phase), c = Math.cos(phase);
    const ct = 1.03 * W.crouch;
    const legA = lerp(0.5, 0.8, W.sprint) * amp * (1 - W.crouch * 0.35);
    const kneeA = lerp(0.9, 1.4, W.sprint) * amp;
    let hipL = -s * legA - ct, hipR = s * legA - ct;
    let kneeL = 2 * ct + kneeA * Math.max(0, c) + 0.04, kneeR = 2 * ct + kneeA * Math.max(0, -c) + 0.04;
    let bodyY = HIP_Y * Math.cos(ct) - 0.035 * amp * Math.abs(s) + 0.02 * amp;
    let bodyX = 0, bodyZ = 0;
    let spX = 0.35 * W.crouch + 0.32 * W.sprint * clamp(speed / 3, 0, 1) - 0.15 * pitch + Math.sin(time * 1.7) * 0.012;
    let spY = s * 0.12 * amp, spZ = 0;
    const armA = lerp(0.55, 1.0, W.sprint) * amp;
    let shLx = s * armA, shRx = -s * armA, shLz = 0.1, shRz = -0.1;
    let elL = -0.25 - W.sprint * 1.1 - W.crouch * 0.3, elR = elL;
    shLx -= W.crouch * 0.3; shRx -= W.crouch * 0.3;

    // airborne
    hipL = lerp(hipL, -0.75, W.air); kneeL = lerp(kneeL, 1.25, W.air);
    hipR = lerp(hipR, 0.25, W.air); kneeR = lerp(kneeR, 0.55, W.air);
    shLx = lerp(shLx, -0.6, W.air); shRx = lerp(shRx, -0.5, W.air);
    shLz = lerp(shLz, 0.55, W.air); shRz = lerp(shRz, -0.55, W.air);
    spX -= 0.1 * W.air;
    // climbing (facing the ladder)
    if (W.climb > 0.001) {
      const cs = Math.sin(climbPh), k = W.climb;
      hipL = lerp(hipL, -0.8 - cs * 0.45, k); kneeL = lerp(kneeL, 1.2 + cs * 0.35, k);
      hipR = lerp(hipR, -0.8 + cs * 0.45, k); kneeR = lerp(kneeR, 1.2 - cs * 0.35, k);
      shLx = lerp(shLx, -2.6 + cs * 0.35, k); shRx = lerp(shRx, -2.6 - cs * 0.35, k);
      elL = lerp(elL, -0.6 - cs * 0.3, k); elR = lerp(elR, -0.6 + cs * 0.3, k);
      shLz = lerp(shLz, -0.1, k); shRz = lerp(shRz, 0.1, k);
      bodyY = lerp(bodyY, HIP_Y - 0.1, k); bodyZ = lerp(bodyZ, -0.08, k); spX = lerp(spX, 0.1, k);
    }
    // two-handed carry / holding
    shLx = lerp(shLx, -1.2 - pitch * 0.3 + s * 0.05 * amp, W.carry); shRx = lerp(shRx, -1.2 - pitch * 0.3 - s * 0.05 * amp, W.carry);
    shLz = lerp(shLz, -0.2, W.carry); shRz = lerp(shRz, 0.2, W.carry);
    elL = lerp(elL, -0.45, W.carry); elR = lerp(elR, -0.45, W.carry);
    shRx = lerp(shRx, -0.35 - pitch * 0.6 - s * 0.08 * amp, W.hold); elR = lerp(elR, -1.15, W.hold); shRz = lerp(shRz, 0.05, W.hold);
    // emotes
    if (W.sit > 0.001) {
      const k = W.sit;
      hipL = lerp(hipL, -1.5, k); hipR = lerp(hipR, -1.45, k); kneeL = lerp(kneeL, 0.25, k); kneeR = lerp(kneeR, 0.35, k);
      bodyY = lerp(bodyY, 0.19, k); spX = lerp(spX, -0.18 + Math.sin(time * 1.5) * 0.02, k);
      shLx = lerp(shLx, 0.5, k); shRx = lerp(shRx, 0.5, k); shLz = lerp(shLz, 0.3, k); shRz = lerp(shRz, -0.3, k);
      elL = lerp(elL, -0.1, k); elR = lerp(elR, -0.1, k);
    }
    if (W.dance > 0.001) {
      const k = W.dance, b = Math.abs(Math.sin(time * 6)), d = Math.sin(time * 6);
      hipL = lerp(hipL, -0.25 - b * 0.35, k); hipR = lerp(hipR, -0.25 - (1 - b) * 0.35, k);
      kneeL = lerp(kneeL, 0.5 + b * 0.7, k); kneeR = lerp(kneeR, 0.5 + (1 - b) * 0.7, k);
      bodyY = lerp(bodyY, HIP_Y - 0.06 - 0.06 * Math.max(b, 1 - b), k); bodyX = lerp(bodyX, d * 0.05, k);
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
    // melee swing (right arm): 0 rest → 0.3 raised back → 1 follow-through
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
    // dead: fall on the back (propped on the tank), limbs splayed
    if (deadT > 0) {
      const k = smooth(deadT);
      hipL = lerp(hipL, 0.05, k); hipR = lerp(hipR, -0.15, k); kneeL = lerp(kneeL, 0.15, k); kneeR = lerp(kneeR, 0.45, k);
      shLx = lerp(shLx, -2.3, k); shRx = lerp(shRx, -1.9, k); shLz = lerp(shLz, 1.0, k); shRz = lerp(shRz, -1.2, k);
      elL = lerp(elL, -0.5, k); elR = lerp(elR, -0.2, k);
      spX = lerp(spX, -0.1, k); spY = lerp(spY, 0.1, k); spZ = lerp(spZ, 0, k);
      bodyY = lerp(bodyY, HIP_Y, k); bodyX = lerp(bodyX, 0, k); bodyZ = lerp(bodyZ, 0, k);
    }
    rig.rotation.x = -1.35 * fall;
    rig.rotation.z = 0.12 * fall;
    rig.position.set(0, 0.15 * fall, 0.75 * fall);

    // apply
    body.position.set(bodyX, bodyY, bodyZ);
    legL.hip.rotation.set(hipL, 0, 0.04 + 0.12 * deadT); legR.hip.rotation.set(hipR, 0, -0.04 - 0.1 * deadT);
    legL.knee.rotation.x = kneeL; legR.knee.rotation.x = kneeR;
    const flat = (1 - W.sit) * alive * (1 - W.air * 0.6);
    legL.ankle.rotation.x = -(hipL + kneeL) * flat + 0.5 * deadT; legR.ankle.rotation.x = -(hipR + kneeR) * flat + 0.6 * deadT;
    spine.rotation.set(spX, spY, spZ);
    armL.sh.rotation.set(shLx, 0, shLz); armR.sh.rotation.set(shRx, 0, shRz);
    armL.el.rotation.x = elL; armR.el.rotation.x = elR;

    // head: look pitch (compensating spine lean), talk nod/bounce, idle drift
    mouthSm = damp(mouthSm, mouthTarget, 18, dt);
    const talk = mouthSm * (0.07 + 0.05 * Math.sin(time * 17));
    neck.rotation.set(
      -pitch * 0.75 - spX * 0.7 - talk + Math.sin(time * 1.3) * 0.02 * alive - deadT * 0.35,
      Math.sin(time * 0.5) * 0.04 * alive * (1 - amp) + deadT * 0.8,
      W.dance * Math.sin(time * 6 + 1) * 0.2 + deadT * 0.2);
    head.position.y = mouthSm * 0.014 * (1 + Math.sin(time * 23));
    head.rotation.z = a.twitch || 0;
    head.rotation.y = a.twitchY || 0;

    // hat extras
    if (hatObj && hatObj.userData.spin) hatObj.userData.spin.rotation.y += dt * (9 + speed * 5);
    if (hatObj && hatObj.userData.bob) hatObj.position.y = Math.sin(time * 2) * 0.012;

    // face
    blinkT -= dt;
    if (blinkT <= 0) {
      blinking = !blinking;
      blinkT = blinking ? 0.12 : 1.4 + rnd() * 4.5;
      if (!blinking && rnd() < 0.2) blinkT = 0.18; // occasional double blink
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
    if (fs.style === 'mimic') {
      const t2 = Math.sin(time * 13) > 0.97 ? 1 : 0;
      if (t2 !== fs.twitch) { fs.twitch = t2; faceDirty = true; }
    }
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
    if (v !== fs.expr) { fs.expr = v; redraw(); }
  }
  redraw();
  update(0, {});

  return {
    root,
    parts: { head, torso: spine, handR: armR.hand, handL: armL.hand, backpack, face, neck, hips: body, hatSlot },
    height: 1.8,
    radius: 0.35,
    update,
    setMouth,
    setExpression,
    setSuitColor(hex) { if (!OUTFIT_BY_ID[curSuit]) suitMat.color.set(hex); },   // an outfit owns the colour
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
      visorMat.dispose();
      if (faceT) faceT.tex.dispose();
    },
  };
}

// ------------------------------------------------------------------ first-person view model
// Attach root to the camera (camera looks down -Z). Arms come up from the bottom corners.
//
// update(dt, a) — a: { holding:'none'|'onehand'|'twohand', swing 0..1 (action timeline), charging 0..1,
//   moveBob, sprint, lookDelta {x,y} (radians this frame), time, leftHand,
//   item (held item type id), weapon (bool, def.kind === 'weapon'), ranged (bool),
//   player (LocalPlayer: bobPhase, landDip, vel, grounded, crouch, stamina/maxStamina, hp/maxHp), reduceMotion }
// Each weapon type has its own wind-up → strike → recover arc (WEAPON_ARCS), melee strikes leave a
// motion trail, ranged weapons kick back (WEAPON_RECOIL). impact(kind) adds a hit recoil ('flesh'|'metal'|'wall').
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _eu = new THREE.Euler();
const _X = new THREE.Vector3(1, 0, 0), _Z = new THREE.Vector3(0, 0, 1);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), IKO = {};   // [fpbody] IKO: IK scratch
export const VM_REST = {
  //            base pos (x mirrored per side)   sh rot x, y (mirrored), z (mirrored), elbow
  onehand: { p: [0.24, -0.34, 0.06], r: [0.2, 0.1, 0.0], el: 0.18 },
  twohand: { p: [0.25, -0.33, 0.04], r: [0.22, 0.3, -0.25], el: 0.3 },
  none: { p: [0.24, -0.34, 0.06], r: [0.2, 0.1, 0.0], el: 0.18 },
};

// Pose deltas from the rest pose: x/y/z shoulder rotation, e elbow, px/py/pz arm position,
// roll = wrist roll around the item axis, wr = wrist pitch (blade snaps forward).
// w = end of wind-up, s = end of the strike (both as fractions of the swing timeline; the hit
// resolves ~0.14 s after the click, which is where every wind-up ends).
const P_KEYS = ['x', 'y', 'z', 'e', 'px', 'py', 'pz', 'roll', 'wr'];
// [fpbody] first-person arm IK. The rig: shoulder (base) -> upper arm 0.3 along -Z -> elbow (rotates about X, + raises the forearm)
// -> forearm 0.34 to the hand pivot. vmArmIK puts the hand pivot on a camera-space target (item grip fitting, see
// game/fpbody_grip.js); vmArmFK is the forward kinematics of the same rig (used by the offline checks).
const VM_L1 = 0.3, VM_L2 = 0.34;
export const VM_ARM = { L1: VM_L1, L2: VM_L2, cuff: 0.2525, rFore: 0.078, rUpper: 0.088 };
const _iT = new THREE.Vector3(), _iU = new THREE.Vector3(), _iH = new THREE.Vector3(), _iYp = new THREE.Vector3();
const _iB1 = new THREE.Vector3(), _iA1 = new THREE.Vector3(1, 0, 0), _iA2 = new THREE.Vector3(), _iA3 = new THREE.Vector3();
const _iMa = new THREE.Matrix4(), _iMb = new THREE.Matrix4(), _iEul = new THREE.Euler(), _iQa = new THREE.Quaternion(), _iQb = new THREE.Quaternion();
export function vmArmIK(bx, by, bz, tx, ty, tz, side = 1, out = {}) {
  let ox = bx, oy = by, oz = bz;
  _iT.set(tx - bx, ty - by, tz - bz);
  let d = _iT.length();
  if (d > 0.625) {   // out of reach: slide the (off-screen) shoulder towards the target
    const k = Math.min(d - 0.625, 0.25) / d;
    ox += _iT.x * k; oy += _iT.y * k; oz += _iT.z * k;
    _iT.set(tx - ox, ty - oy, tz - oz); d = _iT.length();
  }
  _iT.multiplyScalar(1 / Math.max(d, 1e-6));                       // b3 = shoulder -> target
  d = clamp(d, 0.08, 0.635);                                       // still too far: the hand stops short
  const th = Math.acos(clamp((d * d - VM_L1 * VM_L1 - VM_L2 * VM_L2) / (2 * VM_L1 * VM_L2), -1, 1));
  _iH.set(0, VM_L2 * Math.sin(th), -(VM_L1 + VM_L2 * Math.cos(th))).normalize();   // hand direction in the shoulder frame
  // local frame (x axis, +Y side of the bend plane, hand direction) -> camera frame (side vector, "up", target direction)
  _iA2.set(0, 1, 0).addScaledVector(_iH, -_iH.y).normalize();
  _iA3.copy(_iH);
  const detA = -_iA2.z * _iA3.y + _iA2.y * _iA3.z;   // (x cross yp) . h
  _iU.set(-0.35 * side, 1, 0).addScaledVector(_iT, -(-0.35 * side * _iT.x + _iT.y));   // elbow goes down / slightly outward
  if (_iU.lengthSq() < 1e-6) _iU.set(0, 0, 1);
  _iU.normalize();
  _iB1.copy(_iU).cross(_iT).multiplyScalar(detA >= 0 ? 1 : -1);
  _iMa.makeBasis(_iA1, _iA2, _iA3);
  _iMb.makeBasis(_iB1, _iU, _iT);
  _iMb.multiply(_iMa.transpose());                                  // R maps the local frame onto the camera frame
  _iEul.setFromRotationMatrix(_iMb, 'XYZ');
  out.x = _iEul.x; out.y = _iEul.y; out.z = _iEul.z; out.e = th;
  out.px = ox; out.py = oy; out.pz = oz; out.reach = d;
  return out;
}
export function vmArmFK(px, py, pz, x, y, z, e, out = {}) {
  _iQa.setFromEuler(_iEul.set(x, y, z, 'XYZ'));
  _iQb.setFromAxisAngle(_X, e).premultiply(_iQa);
  out.elbow = (out.elbow || new THREE.Vector3()).set(0, 0, -VM_L1).applyQuaternion(_iQa).add(_iH.set(px, py, pz));
  out.hand = (out.hand || new THREE.Vector3()).set(0, 0, -VM_L2).applyQuaternion(_iQb).add(out.elbow);
  out.wrist = (out.wrist || new THREE.Vector3()).set(0, 0, -VM_ARM.cuff).applyQuaternion(_iQb).add(out.elbow);
  out.base = (out.base || new THREE.Vector3()).set(px, py, pz);
  return out;
}

export const WEAPON_ARCS = {
  // empty hands: a short jab
  fist: { w: 0.26, s: 0.5, trail: 0, W: { x: 0.25, e: 0.95, pz: 0.12, py: 0.02, px: 0.03 }, S: { x: 0.18, y: 0.28, e: -0.25, pz: -0.3, px: -0.1, py: 0.03 } },
  // any non-weapon item: overhead bonk (the original arc)
  bonk: { w: 0.3, s: 0.62, trail: 0.4, W: { x: 1.75, z: -0.6, y: -0.15, py: 0.14, pz: 0.08, e: 0.5 }, S: { x: -1.0, z: 0.35, y: 0.62, py: -0.06, pz: -0.12, px: -0.08, e: -0.1 } },
  // quick diagonal club
  pipe: { w: 0.28, s: 0.55, trail: 0.9, W: { x: 1.5, y: -0.45, z: -0.7, e: 0.7, py: 0.12, px: 0.06, pz: 0.1, roll: 0.4, wr: -0.35 }, S: { x: -0.9, y: 0.75, z: 0.45, e: -0.15, py: -0.08, px: -0.14, pz: -0.14, roll: -0.5, wr: 0.45 } },
  // flat horizontal slash, right to left, big wrist roll
  machete: { w: 0.25, s: 0.5, trail: 1, W: { x: 0.55, y: -0.95, z: -1.1, e: 0.9, px: 0.1, py: 0.08, pz: 0.1, roll: 1.1, wr: -0.3 }, S: { x: 0.3, y: 1.25, z: 0.2, e: -0.1, px: -0.2, py: -0.02, pz: -0.16, roll: -0.9, wr: 0.35 } },
  // heavy overhead chop
  shovel: { w: 0.32, s: 0.62, trail: 0.85, W: { x: 2.0, y: -0.1, z: -0.4, e: 0.8, py: 0.18, pz: 0.14, roll: 0.2, wr: -0.5 }, S: { x: -1.15, y: 0.35, z: 0.2, e: -0.2, py: -0.12, pz: -0.18, px: -0.04, wr: 0.6 } },
  // wide sweeping swing with the sign face leading
  stopsign: { w: 0.34, s: 0.66, trail: 1, W: { x: 0.9, y: -1.1, z: -0.9, e: 0.6, px: 0.12, py: 0.1, pz: 0.12, roll: 0.8, wr: -0.25 }, S: { x: 0.1, y: 1.4, z: 0.35, e: 0.0, px: -0.22, py: -0.06, pz: -0.14, roll: -0.6, wr: 0.3 } },
  // two-handed overhead slam — both arms follow
  sledge: { w: 0.36, s: 0.64, trail: 1, both: 0.85, W: { x: 2.3, z: -0.2, e: 1.0, py: 0.24, pz: 0.2, wr: -0.6 }, S: { x: -1.3, y: 0.25, z: 0.1, e: -0.3, py: -0.22, pz: -0.2, wr: 0.7 } },
};
// Ranged kick: pose delta at the peak, how long it takes to settle, how much it rattles.
export const WEAPON_RECOIL = {
  shotgun: { dur: 0.42, jitter: 0.004, K: { x: 0.62, e: 0.35, pz: 0.17, py: 0.06, roll: 0.18, wr: -0.35 } },
  harpoon: { dur: 0.4, jitter: 0.002, K: { x: 0.38, e: 0.2, pz: 0.13, py: 0.03, wr: -0.2 } },
  taser: { dur: 0.3, jitter: 0.012, K: { x: 0.16, pz: 0.05, py: 0.01, roll: 0.06 } },
  generic: { dur: 0.3, jitter: 0.004, K: { x: 0.25, pz: 0.08, py: 0.02 } },
};
function arcFor(item, weapon) {
  if (!item) return WEAPON_ARCS.fist;
  if (WEAPON_ARCS[item]) return WEAPON_ARCS[item];
  return weapon ? WEAPON_ARCS.pipe : WEAPON_ARCS.bonk;
}
const easeOut3 = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
/** Sample a swing arc at timeline s (0..1). `pre` (0..1) = how far the wind-up already is (charged swings). */
export function sampleArc(arc, s, out, pre = 0) {
  for (const k of P_KEYS) out[k] = 0;
  if (s <= 0 || s >= 1) return out;
  const W = arc.W, S = arc.S;
  if (s < arc.w) {
    const k = Math.max(pre, smooth(s / arc.w));
    for (const key of P_KEYS) out[key] = (W[key] || 0) * k;
  } else if (s < arc.s) {
    const k = easeOut3((s - arc.w) / (arc.s - arc.w));
    for (const key of P_KEYS) out[key] = lerp(W[key] || 0, S[key] || 0, k);
  } else {
    const k = smooth((s - arc.s) / (1 - arc.s));
    for (const key of P_KEYS) out[key] = (S[key] || 0) * (1 - k);
  }
  return out;
}

const TRAIL_N = 14;
function makeTrail() {
  const pos = new Float32Array(TRAIL_N * 2 * 3);
  const col = new Float32Array(TRAIL_N * 2 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;
  // ring buffer of samples (root-local space)
  const S = Array.from({ length: TRAIL_N }, () => ({ b: new THREE.Vector3(), t: new THREE.Vector3(), age: 9 }));
  let head = 0, live = false;
  return {
    mesh,
    push(base, tip) { head = (head + 1) % TRAIL_N; const s = S[head]; s.b.copy(base); s.t.copy(tip); s.age = 0; live = true; },
    update(dt, strength, color) {
      if (!live) return;
      let n = 0, any = false;
      for (let k = 0; k < TRAIL_N; k++) {
        const s = S[(head - k + TRAIL_N) % TRAIL_N];
        s.age += dt;
        const a = Math.max(0, 1 - s.age / 0.16) * strength * (1 - k / TRAIL_N);
        if (a <= 0.002 && k > 0) break;
        if (a > 0.002) any = true;
        const i = n * 2;
        pos[i * 3] = s.b.x; pos[i * 3 + 1] = s.b.y; pos[i * 3 + 2] = s.b.z;
        pos[i * 3 + 3] = s.t.x; pos[i * 3 + 4] = s.t.y; pos[i * 3 + 5] = s.t.z;
        col[i * 4] = color.r; col[i * 4 + 1] = color.g; col[i * 4 + 2] = color.b; col[i * 4 + 3] = a * 0.15;
        col[i * 4 + 4] = color.r; col[i * 4 + 5] = color.g; col[i * 4 + 6] = color.b; col[i * 4 + 7] = a * 0.55;
        n++;
      }
      live = any;
      mesh.visible = any && n > 1;
      geo.setDrawRange(0, Math.max(0, n - 1) * 6);
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    clear() { for (const s of S) s.age = 9; live = false; mesh.visible = false; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

export function createViewModel({ suitColor = '#d9642b' } = {}) {
  const root = new THREE.Group();
  root.name = 'viewmodel';
  const baseMap = suitTex();
  const sleeveMat = lamI(suitColor, { map: baseMap });
  const round = !CLASSIC;                     // [avatar2] round mitten gloves in light grey (the classic model keeps the dark boxy ones)
  const gloveBase = round ? A2.GLOVE : C.dark;
  const vmGloveMat = lamI(gloveBase);
  const sway = pv(root, null, null, 'sway');

  const mkArm = (side) => { // side +1 = right (screen right, +X), -1 = left
    const base = pv(sway);
    const sh = pv(base);
    mk(sh, merged('vm_upper', () => [xf(G.segZ(0.3, 0.088, 0.076, 7), [0, 0, 0], [0, PI, 0])]), sleeveMat);
    const el = pv(sh, [0, 0, -0.3]);
    mk(el, merged('vm_fore', () => [
      xf(G.segZ(0.24, 0.074, 0.064, 7), [0, 0, 0], [0, PI, 0]),
      xf(G.cyl(0.078, 0.078, 0.035, 7), [0, 0, -0.235], [PI / 2, 0, 0]),
    ]), sleeveMat);
    mk(el, round ? merged('vm_gloveR' + side, () => [
      xf(G.sph(0.062, 8, 6), [0, 0, -0.325], [0, 0, 0], [1.12, 0.95, 1.3]),
      xf(G.sph(0.03, 5, 4), [-side * 0.06, 0.008, -0.3]),
      xf(G.cyl(0.084, 0.084, 0.04, 8, true), [0, 0, -0.262], [PI / 2, 0, 0]),
    ]) : merged('vm_glove' + side, () => [
      xf(G.box(0.095, 0.075, 0.12), [0, 0, -0.31]),
      xf(G.box(0.04, 0.035, 0.08), [-side * 0.055, 0.01, -0.3], [0, side * 0.4, 0]),
      xf(G.box(0.085, 0.04, 0.05), [0, -0.035, -0.37], [0.5, 0, 0]),
    ]), vmGloveMat);
    const hand = new THREE.Object3D();
    hand.name = side > 0 ? 'handR' : 'handL';
    hand.position.set(0, 0.0, -0.34);
    el.add(hand);
    return { side, base, sh, el, hand, show: side > 0 ? 1 : 0, cur: { x: 0.2, y: 0.1, z: 0, el: 0.18, px: 0.24, py: -0.34, pz: 0.06, roll: 0, wr: 0 } };
  };
  let vmOutfit = false;
  const R = mkArm(1), L = mkArm(-1);
  L.base.visible = false;
  const trail = makeTrail();
  root.add(trail.mesh);
  const trailColor = new THREE.Color(0xdff0ff);

  // spring-driven mouse sway (lags behind the look, overshoots a touch, settles)
  const sw = { x: 0, y: 0, vx: 0, vy: 0 };
  let localTime = 0, sprintW = 0, twoW = 0, crouchW = 0, airW = 0;
  // action state
  let prevSwing = 0, lastCharge = 0, swingPre = 0, swingItem = null, swingWeapon = false;
  let recoilT = 0, recoil = WEAPON_RECOIL.generic;
  let impactT = 0, impactKind = 'flesh', impactAmt = 1;
  const D = {}, Dc = {};
  for (const k of P_KEYS) { D[k] = 0; Dc[k] = 0; }

  function computeAction(dt, a) {
    const s = clamp(a.swing || 0, 0, 1);
    const ranged = !!a.ranged;
    // a new action starts when the timeline appears or restarts
    if (s > 0 && (prevSwing === 0 || s < prevSwing - 0.02)) {
      swingItem = a.item || null; swingWeapon = !!a.weapon;
      swingPre = clamp(lastCharge / 0.8, 0, 1); lastCharge = 0;
      if (ranged) { recoil = WEAPON_RECOIL[a.item] || WEAPON_RECOIL.generic; recoilT = 1; }
      else trail.clear();
    }
    prevSwing = s;
    // remember a charge briefly: the release frame already has charging = 0
    if ((a.charging || 0) > 0) lastCharge = a.charging; else lastCharge = Math.max(0, lastCharge - dt * 4);
    for (const k of P_KEYS) D[k] = 0;
    // melee arc (or a bonk) — ranged guns never swing, they kick
    const arc = arcFor(swingItem, swingWeapon);
    if (s > 0 && !ranged) sampleArc(arc, s, D, swingPre);
    // charging: hold the wind-up pose of this weapon, trembling near full power
    const ch = clamp(a.charging || 0, 0, 1);
    if (ch > 0 && !ranged) {
      const W = arcFor(a.item, a.weapon).W, k = smooth(ch) * 0.9;
      for (const key of P_KEYS) D[key] += (W[key] || 0) * k;
      const tr = ch > 0.75 ? Math.sin(localTime * 55) * 0.012 * (ch - 0.75) * 4 : 0;
      D.py += tr; D.px += tr;
    }
    // ranged recoil: instant kick, springy settle
    if (recoilT > 0) {
      recoilT = Math.max(0, recoilT - dt / recoil.dur);
      const u = 1 - recoilT, k = u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 2) * (1 + Math.sin(u * 14) * 0.15);
      for (const key of P_KEYS) D[key] += (recoil.K[key] || 0) * k;
      const j = recoil.jitter * recoilT;
      D.px += (Math.random() - 0.5) * j; D.py += (Math.random() - 0.5) * j;
    }
    // melee impact: the weapon bounces back off what it hit
    if (impactT > 0) {
      impactT = Math.max(0, impactT - dt / 0.26);
      const k = Math.sin(Math.min(1, (1 - impactT) / 0.25) * PI * 0.5) * impactT * impactAmt;
      D.x += 0.4 * k; D.e += 0.28 * k; D.pz += 0.08 * k; D.py += 0.03 * k; D.wr -= 0.3 * k;
      if (impactKind !== 'flesh') { const v = Math.sin(localTime * 72) * 0.018 * impactT * impactAmt; D.px += v; D.py += v * 0.6; D.roll += v * 4; }
    }
    // melee trail sampling window: from late wind-up to just after the strike
    const inStrike = s > 0 && !ranged && s > arc.w - 0.04 && s < arc.s + 0.12;
    return { inStrike, trailK: arc.trail || 0 };
  }

  function poseArm(A, dt, a, time, isRight, P) {
    const holding = a.holding || 'none';
    const tw = twoW;
    const one = VM_REST.onehand, two = VM_REST.twohand;
    const sd = A.side;
    const rm = a.reduceMotion ? 0.35 : 1;
    // rest pose (blend one-hand ↔ two-hand)
    let px = lerp(one.p[0], two.p[0], tw) * sd, py = lerp(one.p[1], two.p[1], tw), pz = lerp(one.p[2], two.p[2], tw);
    let rx = lerp(one.r[0], two.r[0], tw), ry = lerp(one.r[1], two.r[1], tw) * sd, rz = lerp(one.r[2], two.r[2], tw) * sd, re = lerp(one.el, two.el, tw);
    // [fpbody] item-fit IK: a.grip.R / a.grip.L = hand pivot target in camera space (from game/fpbody_grip.js) replaces this arm's rest pose
    const gk = a.grip ? (isRight ? a.grip.R : a.grip.L) : null;
    if (gk && (isRight ? holding !== 'none' : holding === 'twohand' || a.leftHand)) {
      vmArmIK(px, py, pz, gk.x, gk.y, gk.z, sd, IKO);
      px = IKO.px; py = IKO.py; pz = IKO.pz; rx = IKO.x; ry = IKO.y; rz = IKO.z; re = IKO.e;
    }
    let x = rx, y = ry, z = rz, e = re, roll = 0, wr = 0;
    // walk bob synced to the footfalls (bobPhase: multiples of PI = a foot lands)
    const m = clamp(a.moveBob || 0, 0, 1) * rm;
    const ph = P.phase;
    px += Math.sin(ph + (isRight ? 0 : 0.5)) * 0.012 * m;
    py += Math.cos(ph * 2) * 0.007 * m - 0.004 * m;
    x += Math.sin(ph) * 0.05 * sprintW * sd * rm;       // arms pump while sprinting
    // sprint: weapon lowered and tucked across the body
    const armed = holding !== 'none';
    py -= 0.05 * sprintW;
    x -= (armed ? 0.3 : 0.4) * sprintW; y += (armed ? 0.45 : 0.15) * sprintW * sd; z += (armed ? 0.3 : 0) * sprintW * sd;
    px -= (armed ? 0.05 : 0) * sprintW * sd;
    // crouch: arms drawn in a little; airborne: arms float up while falling, dip on the take-off
    py += 0.018 * crouchW; pz -= 0.02 * crouchW;
    py += P.air * rm; x += P.air * 1.2 * rm;
    // landing: arms keep travelling down after the body stops
    py -= P.land * 0.45 * rm; x -= P.land * 0.6 * rm;
    // idle breathing (faster and deeper when winded)
    py += Math.sin(P.breath) * P.breathAmp; x += Math.sin(P.breath) * P.breathAmp * 1.5;
    // actions
    const both = P.both;
    const k = isRight ? 1 : both;
    if (k > 0) {
      x += D.x * k; y += D.y * k; z += D.z * k; e += D.e * k;
      px += D.px * k; py += D.py * k; pz += D.pz * k;
      if (isRight) { roll += D.roll; wr += D.wr; }
    }
    // visibility (slide in/out from below)
    const wantShow = isRight ? (holding !== 'none' || (a.swing || 0) > 0 || (a.charging || 0) > 0) : (holding === 'twohand' || !!a.leftHand);
    A.show = damp(A.show, wantShow ? 1 : 0, 12, dt);
    py -= (1 - A.show) * 0.4;
    x -= (1 - A.show) * 0.5;
    A.base.visible = A.show > 0.02;
    // smoothing (hides snaps when an action resets); fast enough to keep the strike snappy
    const c = A.cur, r = 30;
    c.x = damp(c.x, x, r, dt); c.y = damp(c.y, y, r, dt); c.z = damp(c.z, z, r, dt); c.el = damp(c.el, e, r, dt);
    c.px = damp(c.px, px, r, dt); c.py = damp(c.py, py, r, dt); c.pz = damp(c.pz, pz, r, dt);
    c.roll = damp(c.roll, roll, r, dt); c.wr = damp(c.wr, wr, r, dt);
    A.base.position.set(c.px, c.py, c.pz);
    A.sh.rotation.set(c.x, c.y, c.z);
    A.el.rotation.x = c.el;
    // hand frame counter-rotation so items point straight down -Z in the rest pose, then wrist roll/snap
    _eu.set(rx, ry, rz); _qa.setFromEuler(_eu); _qb.setFromAxisAngle(_X, re);
    A.hand.quaternion.copy(_qa.multiply(_qb)).invert();
    if (c.roll || c.wr) {
      _qb.setFromAxisAngle(_X, c.wr); _qc.setFromAxisAngle(_Z, c.roll);
      A.hand.quaternion.multiply(_qb).multiply(_qc);
    }
  }

  // tip of the held item (items expose userData.tip), in root-local space
  function sampleTrail(A) {
    let tipObj = null;
    for (const ch of A.hand.children) if (ch.visible && ch.userData?.tip) { tipObj = ch.userData.tip; break; }
    root.updateMatrixWorld(true);
    if (tipObj) tipObj.getWorldPosition(_v2);
    else _v2.set(0, 0, -0.45).applyMatrix4(A.hand.matrixWorld);
    A.hand.getWorldPosition(_v1);
    root.worldToLocal(_v1); root.worldToLocal(_v2);
    _v1.lerp(_v2, 0.42);
    trail.push(_v1, _v2);
  }

  const P = { phase: 0, air: 0, land: 0, breath: 0, breathAmp: 0.004, both: 0 };
  function update(dt, a = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    localTime += dt;
    const time = a.time ?? localTime;
    const pl = a.player || null;
    const rm = a.reduceMotion ? 0.35 : 1;
    sprintW = damp(sprintW, a.sprint ? 1 : 0, 8, dt);
    twoW = damp(twoW, a.holding === 'twohand' ? 1 : 0, 10, dt);
    crouchW = damp(crouchW, pl?.crouch ? 1 : 0, 10, dt);
    // mouse sway: angular velocity drives a damped spring
    const ld = a.lookDelta || { x: 0, y: 0 };
    const idt = 1 / Math.max(dt, 1 / 240);
    const tx = clamp(-(ld.x || 0) * idt * 0.011, -0.07, 0.07) * rm, ty = clamp((ld.y || 0) * idt * 0.009, -0.055, 0.055) * rm;
    sw.vx += ((tx - sw.x) * 140 - sw.vx * 17) * dt; sw.x += sw.vx * dt;
    sw.vy += ((ty - sw.y) * 140 - sw.vy * 17) * dt; sw.y += sw.vy * dt;
    sway.position.set(sw.x, sw.y, 0);
    sway.rotation.set(-sw.y * 0.9, sw.x * 0.9, sw.x * 0.7);
    // shared pose inputs
    P.phase = pl?.bobPhase ?? time * lerp(7.5, 11.5, sprintW);
    const vy = pl?.vel?.y || 0;
    airW = damp(airW, pl && !pl.grounded ? clamp(-vy * 0.005, -0.025, 0.04) : 0, 10, dt);
    P.air = airW;
    P.land = clamp(pl?.landDip || 0, 0, 0.3);
    const stam = pl ? clamp(pl.stamina / Math.max(1, pl.maxStamina || 100), 0, 1) : 1;
    P.breath += dt * lerp(3.6, 1.6, stam);
    P.breathAmp = lerp(0.012, 0.004, stam) * rm;
    const arcNow = arcFor(a.item, a.weapon);
    P.both = a.holding === 'twohand' ? (arcNow.both ?? 0.35) : 0;
    const act = computeAction(dt, a);
    poseArm(R, dt, a, time, true, P);
    poseArm(L, dt, a, time, false, P);
    if (act.inStrike && act.trailK > 0 && root.visible) sampleTrail(R);
    trail.update(dt, act.trailK, trailColor);
  }
  // settle instantly into the rest pose
  for (let i = 0; i < 30; i++) update(0.1, {});

  return {
    root,
    handR: R.hand,
    handL: L.hand,
    /** swing trail colour (THREE.Color, mutated in place: plasma blade tier colours, game/worlds2_weapons.js) */
    trailColor,
    update,
    /** Melee hit feedback: kind 'flesh' | 'metal' | 'wall', strength ~1. */
    impact(kind = 'flesh', strength = 1) { impactKind = kind; impactAmt = clamp(strength, 0.3, 1.6); impactT = 1; },
    /** Manual recoil (e.g. mods): uses WEAPON_RECOIL[type]. */
    kick(type = 'generic') { recoil = WEAPON_RECOIL[type] || WEAPON_RECOIL.generic; recoilT = 1; },
    setSuitColor(hex) { if (!vmOutfit) sleeveMat.color.set(hex); },
    /** wardrobe: dress the first-person sleeves / gloves like the outfit (colour + fabric only) */
    setLook(l) {
      if (!l || l.suit === undefined) return;
      const def = OUTFIT_BY_ID[l.suit];
      vmOutfit = !!def;
      if (def) {
        const b = outfitLook(def.id);
        sleeveMat.map = b.map || baseMap; sleeveMat.color.set(b.tint || def.color);
        sleeveMat.emissive.set(b.emissive || '#000000'); vmGloveMat.color.set(b.glove || gloveBase);
      } else {
        sleeveMat.map = baseMap; sleeveMat.emissive.set('#000000'); vmGloveMat.color.set(gloveBase);
        const c = SUIT_COLORS.find((x) => x.id === l.suit)?.color; if (c) sleeveMat.color.set(c);
      }
    },
    setVisible(b) { root.visible = !!b; if (!b) trail.clear(); },
    dispose() { sleeveMat.dispose(); vmGloveMat.dispose(); trail.dispose(); },
  };
}
