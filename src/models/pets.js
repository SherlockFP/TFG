// PET models (procedural, cute-but-PSX): createPetModel(species, stage, { shiny, skin, pal }) -> { root, height, parts, update(dt, st), setCarry(on), dispose() }.
// Nine species (cat dog fox bear = quadrupeds, crow owl parrot = birds, bee swarm, tamagotchi-bot), 3 evolution stages each (bigger + glowing tech
// gear at stage 3, e.g. the "Server Hound"), shiny palette swap + sparkle, cosmetic skins (collars, hats, seasonal). Geometry / materials come from
// the shared modelkit caches (never disposed per pet). The model faces +Z; animation is procedural: st = { anim, speed, carry, mood }.
// anim: 'idle' | 'walk' | 'run' | 'sit' | 'attack' | 'ko' | 'happy' | 'sleep'.
import * as THREE from 'three';
import { G, lam, bas, HAS_DOM, damp, clamp } from './modelkit.js';
import { SPECIES, palOf, skinDef, stageForLevel } from '../game/pets_core.js';

const STAGE_SCALE = [0.66, 0.88, 1.06];
const GLOBAL = 1.55;
const PI = Math.PI;

function mk(geo, mat, x = 0, y = 0, z = 0, parent = null, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  if (parent) parent.add(m);
  return m;
}
function grp(x = 0, y = 0, z = 0, parent = null) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
const DARK = () => lam('#1a1418');
const EYE = () => bas('#0a0608');
const WHITE = () => lam('#f4f0e8');

// ---------------------------------------------------------------------------------------------------- quadrupeds
const QUAD = {
  cat: { bl: 0.46, bh: 0.24, bw: 0.22, lh: 0.17, lw: 0.06, hs: 0.2, sn: 0.05, ears: 'tri', tail: 'long' },
  dog: { bl: 0.6, bh: 0.28, bw: 0.26, lh: 0.24, lw: 0.08, hs: 0.24, sn: 0.14, ears: 'flop', tail: 'up' },
  fox: { bl: 0.55, bh: 0.24, bw: 0.22, lh: 0.22, lw: 0.06, hs: 0.21, sn: 0.16, ears: 'tall', tail: 'bushy' },
  bear: { bl: 0.7, bh: 0.42, bw: 0.42, lh: 0.26, lw: 0.14, hs: 0.3, sn: 0.1, ears: 'round', tail: 'stub' },
};

function buildQuad(sp, stage, pal) {
  const q = QUAD[sp], [main, sub, acc] = pal;
  const M = lam(main), S = lam(sub), A = lam(acc);
  const root = new THREE.Group();
  const P = { legs: [], extras: [], glow: [] };
  const bodyY = q.lh + q.bh / 2;
  const body = grp(0, bodyY, 0, root);
  mk(G.box(q.bw, q.bh, q.bl), M, 0, 0, 0, body);
  mk(G.box(q.bw * 0.86, q.bh * 0.45, q.bl * 0.7), S, 0, -q.bh * 0.32, 0.02, body);            // belly
  if (sp === 'cat' || sp === 'fox') for (const z of [-0.12, 0.02]) mk(G.box(q.bw * 1.02, 0.03, 0.05), sp === 'cat' ? A : lam('#2a1a12'), 0, q.bh * 0.3, z, body);   // stripes / saddle
  // legs (pivot at the hip, hang down)
  const hipZ = q.bl * 0.36, hipX = q.bw * 0.32;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = grp(sx * hipX, q.lh, sz * hipZ, root);
    mk(G.boxY(q.lw, q.lh * 0.82, q.lw), M, 0, 0, 0, leg);
    mk(G.boxY(q.lw * 1.15, q.lh * 0.22, q.lw * 1.4), S, 0, -q.lh * 0.82, q.lw * 0.15, leg);   // paw
    P.legs.push(leg);
  }
  // head
  const hs = q.hs;
  const neck = grp(0, q.lh + q.bh * 0.78, q.bl / 2 - 0.02, root);
  const head = grp(0, hs * 0.12, hs * 0.32, neck);
  mk(G.box(hs, hs * 0.9, hs), M, 0, 0, 0, head);
  mk(G.box(hs * 0.52, hs * 0.38, q.sn + 0.02), S, 0, -hs * 0.16, hs * 0.5 + q.sn / 2, head);   // snout
  mk(G.box(hs * 0.2, hs * 0.14, 0.03), DARK(), 0, -hs * 0.02, hs * 0.5 + q.sn + 0.02, head);   // nose
  for (const sx of [-1, 1]) mk(G.box(hs * 0.14, hs * 0.16, 0.03), EYE(), sx * hs * 0.26, hs * 0.1, hs * 0.5 + 0.005, head);
  const ears = [];
  const earAt = (sx, geo, y, z, rz = 0, rx = 0, mat = M) => { const e = mk(geo, mat, sx * hs * 0.32, y, z, head, rx, 0, rz * sx); ears.push(e); return e; };
  if (q.ears === 'tri') for (const sx of [-1, 1]) { earAt(sx, G.cone(hs * 0.2, hs * 0.38, 4), hs * 0.62, -hs * 0.05); }
  if (q.ears === 'flop') for (const sx of [-1, 1]) { earAt(sx, G.boxY(hs * 0.16, hs * 0.5, hs * 0.22), hs * 0.42, -hs * 0.05, 0.35); }
  if (q.ears === 'tall') for (const sx of [-1, 1]) { earAt(sx, G.cone(hs * 0.2, hs * 0.55, 4), hs * 0.72, -hs * 0.04); mk(G.cone(hs * 0.1, hs * 0.3, 4), DARK(), sx * hs * 0.32, hs * 0.66, -hs * 0.02, head); }
  if (q.ears === 'round') for (const sx of [-1, 1]) { earAt(sx, G.sph(hs * 0.2, 6, 5), hs * 0.5, -hs * 0.08); }
  // tail
  const tail = grp(0, q.lh + q.bh * 0.72, -q.bl / 2, root);
  if (q.tail === 'long') { mk(G.segZ(0.3, 0.035, 0.03, 4), M, 0, 0.02, -0.02, tail, 0.9); mk(G.box(0.05, 0.05, 0.06), A, 0, 0.24, -0.2, tail); }
  if (q.tail === 'up') { mk(G.segZ(0.26, 0.05, 0.03, 4), M, 0, 0.06, -0.02, tail, 0.7); }
  if (q.tail === 'bushy') { mk(G.sph(0.11, 6, 5), M, 0, 0.02, -0.2, tail).scale.set(0.9, 0.9, 2.3); mk(G.sph(0.08, 6, 4), S, 0, 0.02, -0.4, tail); }
  if (q.tail === 'stub') mk(G.sph(0.07, 5, 4), M, 0, 0.0, -0.04, tail);
  Object.assign(P, { body, head, neck, tail, ears, bodyY, q, hs, hipZ });
  // ---- stage extras
  if (stage >= 2) {   // chest gem: the evolution cue
    const gem = mk(G.oct(0.05), bas(acc), 0, -q.bh * 0.1, q.bl / 2 + 0.03, body); gem.userData.spin = 1.5; P.glow.push(gem);
  }
  if (stage >= 3) addStage3Quad(sp, P, root, body, head, tail, pal, q);
  P.tailBase = tail.rotation.clone();
  return { root, P, hatY: hs * 0.5, hatZ: 0, headGrp: head, collarAt: { g: neck, y: -hs * 0.05, z: hs * 0.02, r: hs * 0.62 }, height: q.lh + q.bh + hs * 1.3, fly: false };
}

function addStage3Quad(sp, P, root, body, head, tail, pal, q) {
  const cy = bas('#20ffe0'), mg = bas('#ff2bd6'), red = bas('#ff3a3a'), metal = lam('#4a4e5a'), dark = lam('#1c1e26');
  const hs = q.hs;
  const led = (x, y, z, c, parent) => { const l = mk(G.box(0.03, 0.03, 0.03), c, x, y, z, parent); P.glow.push(l); return l; };
  if (sp === 'dog') {   // Server Hound: rack plate on the back + LED strips + antenna + visor
    mk(G.box(q.bw * 0.95, 0.09, q.bl * 0.6), dark, 0, q.bh / 2 + 0.05, -0.02, body);
    for (let i = 0; i < 4; i++) { led(-0.08, q.bh / 2 + 0.105, -0.16 + i * 0.1, i % 2 ? cy : lam('#3aff5a'), body); led(0.08, q.bh / 2 + 0.105, -0.16 + i * 0.1, i % 2 ? mg : cy, body); }
    mk(G.cyl(0.008, 0.008, 0.28, 4), metal, -0.1, q.bh / 2 + 0.2, -0.2, body); led(-0.1, q.bh / 2 + 0.35, -0.2, red, body);
    const visor = mk(G.box(hs * 1.02, hs * 0.2, 0.04), cy, 0, hs * 0.1, hs * 0.51, head); P.glow.push(visor);
  } else if (sp === 'cat') {   // Glitch Cat: neon visor + tail LED + floating shards
    const visor = mk(G.box(hs * 1.02, hs * 0.22, 0.04), mg, 0, hs * 0.1, hs * 0.51, head); P.glow.push(visor);
    led(0, 0.26, -0.22, cy, tail);
    for (let i = 0; i < 3; i++) { const s = mk(G.box(0.06, 0.06, 0.02), i % 2 ? cy : mg, 0, 0, 0, root); s.userData.orbit = { r: 0.32, a: (i * 2 * PI) / 3, y: q.lh + q.bh + 0.35 }; P.extras.push(s); P.glow.push(s); }
  } else if (sp === 'fox') {   // Kitsune Router: 3 tails, glowing tips, router antennas on the ears
    for (const sx of [-1, 1]) { const t = grp(0, q.lh + q.bh * 0.72, -q.bl / 2, root); t.rotation.y = sx * 0.55; mk(G.sph(0.1, 6, 5), lam(pal[0]), 0, 0.03, -0.2, t).scale.set(0.9, 0.9, 2.3); led(0, 0.03, -0.42, cy, t); P.extras.push(t); t.userData.tail = sx; }
    led(0, 0.03, -0.42, cy, tail);
    for (const sx of [-1, 1]) { mk(G.cyl(0.006, 0.006, 0.2, 4), metal, sx * hs * 0.34, hs * 1.05, -0.04, head); led(sx * hs * 0.34, hs * 1.17, -0.04, sx < 0 ? cy : mg, head); }
  } else if (sp === 'bear') {   // Mainframe Bear: shoulder plates, server backpack, hard hat lamp
    for (const sx of [-1, 1]) mk(G.box(0.12, 0.05, 0.22), metal, sx * (q.bw / 2 + 0.02), q.bh / 2 + 0.02, 0.2, body, 0, 0, sx * 0.3);
    mk(G.box(q.bw * 0.8, 0.22, 0.2), dark, 0, q.bh / 2 + 0.13, -0.12, body);
    for (let i = 0; i < 3; i++) { led(-0.08 + i * 0.08, q.bh / 2 + 0.16, -0.22, i === 1 ? red : cy, body); }
    mk(G.sph(hs * 0.55, 7, 4, 0, PI * 2, 0, PI / 2), lam('#f2c318'), 0, hs * 0.42, 0, head);
    const lamp = mk(G.box(0.06, 0.05, 0.04), bas('#fff6c0'), 0, hs * 0.5, hs * 0.5, head); P.glow.push(lamp);
  }
}

// ---------------------------------------------------------------------------------------------------- birds (crow / owl / parrot)
const BIRD = {
  crow: { bs: 0.16, hs: 0.11, beak: 0.13, tail: 0.24, wing: 0.3, leg: 0.16, crest: false },
  owl: { bs: 0.2, hs: 0.16, beak: 0.05, tail: 0.14, wing: 0.26, leg: 0.1, crest: true },
  parrot: { bs: 0.15, hs: 0.11, beak: 0.09, tail: 0.34, wing: 0.28, leg: 0.12, crest: false },
};
function buildBird(sp, stage, pal) {
  const b = BIRD[sp], [main, sub, acc] = pal;
  const M = lam(main), S = lam(sub), A = lam(acc);
  const root = new THREE.Group();
  const P = { legs: [], extras: [], glow: [], wings: [] };
  const by = b.leg + b.bs * 0.9;
  const body = grp(0, by, 0, root);
  mk(G.sph(b.bs, 8, 6), M, 0, 0, 0, body).scale.set(0.95, 1.0, 1.25);
  mk(G.sph(b.bs * 0.7, 7, 5), S, 0, -b.bs * 0.25, b.bs * 0.35, body);   // breast
  const head = grp(0, b.bs * 0.85, b.bs * 0.55, body);
  mk(G.sph(b.hs, 8, 6), sp === 'owl' ? M : M, 0, 0, 0, head);
  if (sp === 'owl') {   // face disc + big eyes
    mk(G.cyl(b.hs * 0.95, b.hs * 0.95, 0.02, 10), S, 0, 0, b.hs * 0.78, head, PI / 2);
    for (const sx of [-1, 1]) { mk(G.cyl(b.hs * 0.34, b.hs * 0.34, 0.02, 8), A, sx * b.hs * 0.42, 0.01, b.hs * 0.84, head, PI / 2); mk(G.cyl(b.hs * 0.16, b.hs * 0.16, 0.02, 6), EYE(), sx * b.hs * 0.42, 0.01, b.hs * 0.86, head, PI / 2); }
  } else for (const sx of [-1, 1]) mk(G.box(b.hs * 0.2, b.hs * 0.24, 0.03), sp === 'parrot' ? WHITE() : bas('#0a0608'), sx * b.hs * 0.5, b.hs * 0.18, b.hs * 0.62, head);
  const beakM = sp === 'crow' ? lam('#2a2a30') : sp === 'parrot' ? lam('#f2f0e0') : lam('#e8b02a');
  mk(G.cone(b.hs * 0.42, b.beak * 1.6, 4), beakM, 0, -b.hs * 0.12, b.hs + b.beak * 0.35, head, PI / 2);
  if (sp === 'parrot') mk(G.box(b.hs * 0.55, b.hs * 0.34, b.beak * 0.9), A, 0, b.hs * 0.42, b.hs * 0.2, head);   // crest tuft
  if (b.crest) for (const sx of [-1, 1]) mk(G.cone(b.hs * 0.2, b.hs * 0.55, 4), M, sx * b.hs * 0.6, b.hs * 0.95, 0, head, 0, 0, -sx * 0.25);
  // wings (pivot at the shoulder)
  for (const sx of [-1, 1]) {
    const w = grp(sx * b.bs * 0.85, b.bs * 0.25, 0, body);
    const wm = sp === 'parrot' ? (sx < 0 ? A : lam('#2a7aff')) : M;
    mk(G.box(0.03, b.bs * 0.5, b.wing), wm, sx * 0.02, -b.bs * 0.1, -b.wing * 0.15, w);
    if (sp !== 'crow') mk(G.box(0.032, b.bs * 0.22, b.wing * 0.9), sp === 'parrot' ? A : S, sx * 0.024, -b.bs * 0.3, -b.wing * 0.18, w);
    P.wings.push(w);
  }
  const tail = grp(0, b.bs * 0.05, -b.bs * 1.1, body);
  mk(G.box(b.bs * 0.5, 0.03, b.tail), sp === 'parrot' ? lam('#2a7aff') : M, 0, 0, -b.tail / 2, tail, -0.25);
  if (sp === 'parrot') mk(G.box(b.bs * 0.25, 0.03, b.tail * 0.9), A, 0, 0.01, -b.tail * 0.5, tail, -0.25);
  // legs
  for (const sx of [-1, 1]) {
    const leg = grp(sx * b.bs * 0.35, b.leg, 0.02, root);
    mk(G.boxY(0.022, b.leg, 0.022), lam('#c89030'), 0, 0, 0, leg);
    mk(G.box(0.07, 0.02, 0.09), lam('#c89030'), 0, -b.leg, 0.03, leg);
    P.legs.push(leg);
  }
  Object.assign(P, { body, head, tail, by, b });
  if (stage >= 2) { const gem = mk(G.oct(0.04), bas(acc), 0, -b.bs * 0.05, b.bs * 1.05, body); gem.userData.spin = 1.5; P.glow.push(gem); }
  if (stage >= 3) {
    const cy = bas('#20ffe0'), red = bas('#ff3a3a'), metal = lam('#4a4e5a');
    if (sp === 'crow') {   // Data Raven: red eyes, LED wing strips, antenna crest
      for (const w of P.wings) { const s = mk(G.box(0.036, 0.02, b.wing * 0.8), cy, 0, -b.bs * 0.32, -b.wing * 0.15, w); P.glow.push(s); }
      for (const sx of [-1, 1]) P.glow.push(mk(G.box(0.03, 0.03, 0.03), red, sx * b.hs * 0.5, b.hs * 0.18, b.hs * 0.66, head));
      mk(G.cyl(0.006, 0.006, 0.16, 4), metal, 0, b.hs * 1.1, -0.02, head); P.glow.push(mk(G.box(0.03, 0.03, 0.03), red, 0, b.hs * 1.45, -0.02, head));
    } else if (sp === 'owl') {   // Archive Owl: glowing monocle + antennae
      P.glow.push(mk(G.tor(b.hs * 0.36, 0.012, 4, 12), cy, b.hs * 0.42, 0.01, b.hs * 0.9, head));
      for (const sx of [-1, 1]) { mk(G.cyl(0.006, 0.006, 0.18, 4), metal, sx * b.hs * 0.7, b.hs * 1.3, 0, head); P.glow.push(mk(G.box(0.03, 0.03, 0.03), cy, sx * b.hs * 0.7, b.hs * 1.6, 0, head)); }
    } else {   // Voice Assistant: headset + speaker grille
      P.glow.push(mk(G.tor(b.hs * 0.95, 0.014, 4, 12, PI), cy, 0, b.hs * 0.1, 0, head, 0, 0, 0));
      for (const sx of [-1, 1]) mk(G.box(0.03, 0.06, 0.05), metal, sx * b.hs * 0.98, 0, 0, head);
      mk(G.cyl(0.005, 0.005, 0.1, 4), metal, b.hs * 0.98, -b.hs * 0.2, b.hs * 0.3, head, PI / 2.4); P.glow.push(mk(G.box(0.025, 0.025, 0.025), red, b.hs * 0.98, -b.hs * 0.3, b.hs * 0.62, head));
      mk(G.box(b.bs * 0.7, b.bs * 0.5, 0.03), lam('#1c1e26'), 0, -b.bs * 0.1, b.bs * 1.08, body);
      for (let i = 0; i < 3; i++) P.glow.push(mk(G.box(b.bs * 0.5, 0.012, 0.02), cy, 0, -b.bs * 0.22 + i * 0.045, b.bs * 1.1, body));
    }
  }
  return { root, P, hatY: b.hs * 0.95, hatZ: 0, headGrp: head, collarAt: { g: body, y: b.bs * 0.62, z: b.bs * 0.45, r: b.hs * 0.85 }, height: by + b.bs + b.hs * 1.4, fly: true };
}

// ---------------------------------------------------------------------------------------------------- bee swarm
function buildBee(stage, pal) {
  const [main, sub, acc] = pal;
  const root = new THREE.Group();
  const P = { bees: [], glow: [], legs: [], extras: [] };
  const n = stage >= 3 ? 9 : stage === 2 ? 7 : 5;
  const beeGeo = () => {
    const b = new THREE.Group();
    mk(G.sph(0.06, 6, 4), lam(main), 0, 0, 0, b).scale.set(0.9, 0.85, 1.2);
    mk(G.box(0.1, 0.035, 0.03), lam(sub), 0, 0, -0.01, b);
    mk(G.box(0.1, 0.035, 0.03), lam(sub), 0, 0, 0.04, b);
    mk(G.sph(0.035, 5, 4), lam(sub), 0, 0.01, 0.075, b);
    const w1 = mk(G.box(0.1, 0.005, 0.06), bas(acc, { transparent: true, opacity: 0.7 }), -0.05, 0.05, -0.01, b);
    const w2 = mk(G.box(0.1, 0.005, 0.06), bas(acc, { transparent: true, opacity: 0.7 }), 0.05, 0.05, -0.01, b);
    b.userData.w = [w1, w2];
    return b;
  };
  for (let i = 0; i < n; i++) {
    const b = beeGeo();
    b.userData.o = { a: (i / n) * PI * 2, r: 0.28 + (i % 3) * 0.08, s: 1.4 + (i % 4) * 0.3, y: 0.5 + (i % 3) * 0.16, ph: i * 1.7 };
    if (i === 0 && stage >= 3) { b.scale.setScalar(1.7); mk(G.cyl(0.04, 0.05, 0.03, 5), bas('#ffd23f'), 0, 0.09, 0, b); for (let k = 0; k < 3; k++) mk(G.cone(0.014, 0.04, 4), bas('#ffd23f'), (k - 1) * 0.03, 0.12, 0, b); P.queen = b; }
    root.add(b); P.bees.push(b);
  }
  if (stage >= 2) { const ring = mk(G.tor(0.34, 0.01, 3, 6), bas(acc), 0, 0.45, 0, root, PI / 2); P.glow.push(ring); P.ring = ring; }
  return { root, P, hatY: 0.95, hatZ: 0, headGrp: null, collarAt: null, height: 1.0, fly: false, swarm: true };
}

// ---------------------------------------------------------------------------------------------------- tamagotchi-bot
const FACES = new Map();
function faceTexture(kind) {
  if (!HAS_DOM) return null;
  let t = FACES.get(kind);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#b8e0a0'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#1c2a18';
  const px = (a, b, w = 1, h = 1) => x.fillRect(a, b, w, h);
  if (kind === 'ko') { px(3, 4, 1, 1); px(5, 4, 1, 1); px(4, 5, 1, 1); px(3, 6, 1, 1); px(5, 6, 1, 1); px(10, 4, 1, 1); px(12, 4, 1, 1); px(11, 5, 1, 1); px(10, 6, 1, 1); px(12, 6, 1, 1); px(5, 11, 6, 1); }
  else if (kind === 'angry') { px(3, 4, 3, 1); px(4, 5, 2, 2); px(10, 4, 3, 1); px(10, 5, 2, 2); px(5, 11, 6, 1); px(4, 12, 1, 1); px(11, 12, 1, 1); }
  else if (kind === 'sad') { px(4, 5, 2, 2); px(10, 5, 2, 2); px(5, 12, 6, 1); px(4, 11, 1, 1); px(11, 11, 1, 1); }
  else if (kind === 'sleep') { px(3, 6, 3, 1); px(10, 6, 3, 1); px(7, 11, 2, 1); }
  else { px(4, 4, 2, 3); px(10, 4, 2, 3); px(4, 10, 1, 1); px(11, 10, 1, 1); px(5, 11, 6, 1); }   // happy
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  FACES.set(kind, t);
  return t;
}
function buildBot(stage, pal) {
  const [main, sub, acc] = pal;
  const root = new THREE.Group();
  const P = { glow: [], legs: [], extras: [] };
  const lift = stage >= 3 ? 0.35 : 0;
  const body = grp(0, 0.34 + lift, 0, root);
  mk(G.sph(0.24, 9, 7), lam(main), 0, 0, 0, body).scale.set(1, 1.18, 0.92);
  mk(G.sph(0.24, 9, 7, 0, PI * 2, PI * 0.55, PI * 0.45), lam(sub), 0, -0.02, 0, body).scale.set(1.02, 1.18, 0.95);
  const faceMat = new THREE.MeshBasicMaterial({ color: '#b8e0a0', map: faceTexture('happy') });
  const screen = mk(G.box(0.26, 0.22, 0.02), faceMat, 0, 0.05, 0.21, body);
  mk(G.box(0.3, 0.26, 0.015), lam('#2a2e3a'), 0, 0.05, 0.2, body);
  for (const [x, c] of [[-0.07, '#ff5a8a'], [0, '#ffd23f'], [0.07, '#20ffe0']]) P.glow.push(mk(G.box(0.045, 0.03, 0.02), bas(c), x, -0.14, 0.215, body));
  mk(G.cyl(0.008, 0.008, 0.16, 4), lam('#7a7e8a'), 0.05, 0.36, 0, body); P.glow.push(mk(G.sph(0.03, 5, 4), bas(acc), 0.05, 0.46, 0, body));
  for (const sx of [-1, 1]) { const leg = grp(sx * 0.1, 0.12 + lift, 0, root); mk(G.boxY(0.08, 0.12, 0.12), lam(sub), 0, 0, 0.02, leg); P.legs.push(leg); }
  if (stage >= 2) for (const sx of [-1, 1]) { const arm = grp(sx * 0.25, 0.42 + lift, 0, root); mk(G.boxY(0.06, 0.2, 0.06), lam(main), 0, 0, 0, arm); mk(G.sph(0.04, 5, 4), lam(sub), 0, -0.2, 0, arm); P.extras.push(arm); arm.userData.arm = sx; }
  if (stage >= 3) {
    P.glow.push(mk(G.tor(0.3, 0.014, 3, 10), bas('#20ffe0'), 0, 0.12, 0, root, PI / 2));
    for (const [x, z, r] of [[-0.16, 0.05, 0.11], [0.12, -0.08, 0.13], [0, 0.14, 0.09]]) mk(G.sph(r, 6, 4), lam('#f4f8ff'), x, 0.06, z, root).scale.y = 0.6;
    P.glow.push(mk(G.tor(0.15, 0.012, 3, 10), bas('#ffd23f'), 0.05, 0.62 + lift, 0, root, PI / 2));
  }
  Object.assign(P, { body, faceMat, screen, lift });
  return { root, P, hatY: 0.27, hatZ: 0, headGrp: body, collarAt: null, height: 0.85 + lift, fly: false, bot: true };
}

// ---------------------------------------------------------------------------------------------------- skins (collars, hats, seasonal)
function addSkin(m, sp, skin, stage) {
  if (!skin) return;
  const S = skin.s && skin.s !== 'none' ? skin.s : null;
  let collar = skin.c && skin.c !== 'none' ? skin.c : null, hat = skin.h && skin.h !== 'none' ? skin.h : null;
  if (S === 'winter') { hat = hat || 'santa'; collar = collar || 'scarf'; }
  if (S === 'halloween') hat = hat || 'pumpkin';
  if (S === 'spring') hat = hat || 'flowers';
  if (S === 'summer') hat = hat || 'shades';
  const ca = m.collarAt;
  if (collar && ca) {
    const def = skinDef('c', collar);
    const col = collar === 'scarf' ? '#e03a3a' : def?.color || '#d33';
    const parent = ca.g;
    const ring = mk(G.tor(ca.r, collar === 'scarf' || collar === 'bandana' ? 0.035 : 0.02, 4, 10), collar === 'neon' ? bas(col) : lam(col), 0, ca.y, ca.z, parent, PI / 2);
    if (collar === 'bell') mk(G.sph(0.03, 5, 4), bas('#ffd23f'), 0, ca.y - 0.03, ca.z + ca.r, parent);
    if (collar === 'spike') for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; mk(G.cone(0.014, 0.04, 4), lam('#c0c4cc'), Math.cos(a) * ca.r, ca.y + 0.03, ca.z + Math.sin(a) * ca.r, parent); }
    if (collar === 'neon') m.P.glow.push(ring);
  }
  const hg = m.headGrp;
  if (hat && hg) {
    const y = m.hatY, s = m.swarm ? 1.6 : m.bot ? 1.9 : 1;
    const H = grp(0, y, m.hatZ, hg);
    H.scale.setScalar(s);
    const c = (col) => lam(col);
    if (hat === 'party') mk(G.cone(0.07, 0.17, 6), c('#ff5ad0'), 0, 0.08, 0, H);
    else if (hat === 'bow') { mk(G.box(0.05, 0.04, 0.03), c('#ff5a8a'), -0.045, 0.02, 0, H); mk(G.box(0.05, 0.04, 0.03), c('#ff5a8a'), 0.045, 0.02, 0, H); mk(G.box(0.025, 0.03, 0.035), c('#c02a5a'), 0, 0.02, 0, H); }
    else if (hat === 'cap') { mk(G.sph(0.09, 7, 4, 0, PI * 2, 0, PI / 2), c('#2a5aff'), 0, 0, 0, H); mk(G.box(0.1, 0.012, 0.07), c('#1a3aaa'), 0, 0.004, 0.09, H); }
    else if (hat === 'headphones') { mk(G.tor(0.1, 0.012, 4, 10, PI), c('#222'), 0, 0.01, 0, H); for (const sx of [-1, 1]) mk(G.box(0.03, 0.06, 0.06), c('#ff5a3a'), sx * 0.1, 0, 0, H); }
    else if (hat === 'helmet') mk(G.sph(0.1, 7, 4, 0, PI * 2, 0, PI / 2), c('#f2c318'), 0, 0, 0, H);
    else if (hat === 'tophat') { mk(G.cyl(0.075, 0.075, 0.13, 8), c('#141418'), 0, 0.075, 0, H); mk(G.cyl(0.12, 0.12, 0.014, 8), c('#141418'), 0, 0.005, 0, H); mk(G.cyl(0.078, 0.078, 0.03, 8), c('#8a1a1a'), 0, 0.03, 0, H); }
    else if (hat === 'halo') m.P.glow.push(mk(G.tor(0.08, 0.012, 4, 12), bas('#ffe680'), 0, 0.14, 0, H, PI / 2));
    else if (hat === 'crown') { mk(G.cyl(0.075, 0.075, 0.05, 6), bas('#ffd23f'), 0, 0.025, 0, H); for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; mk(G.cone(0.014, 0.05, 4), bas('#ffd23f'), Math.cos(a) * 0.06, 0.07, Math.sin(a) * 0.06, H); } }
    else if (hat === 'santa') { mk(G.cone(0.09, 0.2, 6), c('#d02a2a'), 0, 0.09, 0, H, 0.25); mk(G.sph(0.03, 5, 4), c('#ffffff'), 0, 0.19, -0.04, H); mk(G.cyl(0.095, 0.095, 0.03, 8), c('#ffffff'), 0, 0.005, 0, H); }
    else if (hat === 'pumpkin') { mk(G.sph(0.08, 7, 5), c('#ff8a1a'), 0, 0.06, 0, H).scale.set(1.2, 0.9, 1.2); mk(G.box(0.02, 0.04, 0.02), c('#2a8a2a'), 0, 0.14, 0, H); }
    else if (hat === 'flowers') for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; mk(G.sph(0.022, 4, 3), c(['#ff5a8a', '#ffd23f', '#fff', '#a06aff'][i % 4]), Math.cos(a) * 0.085, 0.01, Math.sin(a) * 0.085, H); }
    else if (hat === 'shades') mk(G.box(0.16, 0.035, 0.02), c('#101014'), 0, -0.03, 0.09, H);
  }
  void stage;
}

// ---------------------------------------------------------------------------------------------------- public
export function createPetModel(sp, stage = 1, opts = {}) {
  const def = SPECIES[sp];
  if (!def) throw new Error('unknown pet species ' + sp);
  stage = Math.max(1, Math.min(3, stage | 0 || 1));
  const pal = opts.pal || palOf({ sp, sh: opts.shiny ? 1 : 0, sk: opts.skin || {} });
  const m = def.kind === 'quad' ? buildQuad(sp, stage, pal) : def.kind === 'bird' ? buildBird(sp, stage, pal) : def.kind === 'swarm' ? buildBee(stage, pal) : buildBot(stage, pal);
  addSkin(m, sp, opts.skin, stage);
  const wrap = new THREE.Group();
  wrap.add(m.root);
  const sc = STAGE_SCALE[stage - 1] * def.size * GLOBAL;
  wrap.scale.setScalar(sc);
  let sparkle = null;
  if (opts.shiny) { sparkle = new THREE.Group(); wrap.add(sparkle); for (let i = 0; i < 4; i++) { const s = mk(G.oct(0.03), bas('#fff6b0'), 0, 0, 0, sparkle); s.userData.ph = i * 1.6; } }
  const carryMesh = mk(G.box(0.09, 0.09, 0.09), bas('#ffc84a'), 0, 0, 0, null);
  carryMesh.visible = false;
  if (m.headGrp && !m.swarm && !m.bot) { carryMesh.position.set(0, -0.06, (m.P.hs || m.P.b?.hs || 0.2) * 0.9 + (m.P.q?.sn || 0.08) + 0.04); m.headGrp.add(carryMesh); }
  else { carryMesh.position.set(0.15, 0.4, 0.22); m.root.add(carryMesh); }
  const P = m.P;
  const ch = { sit: 0, ko: 0, run: 0, atk: 0, hop: 0 };
  const R = { t: Math.random() * 10, phase: 0, atkT: 0, last: 'idle' };
  const tailBase = P.tail ? P.tail.rotation.clone() : null;

  function update(dt, st = {}) {
    dt = Math.min(dt, 0.1);
    R.t += dt;
    const anim = st.anim || 'idle', speed = st.speed || 0;
    const moving = anim === 'walk' || anim === 'run';
    const sitT = anim === 'sit' || anim === 'sleep' ? 1 : 0, koT = anim === 'ko' ? 1 : 0;
    ch.sit = damp(ch.sit, sitT, 9, dt); ch.ko = damp(ch.ko, koT, 8, dt);
    ch.run = damp(ch.run, anim === 'run' ? 1 : moving ? 0.5 : 0, 8, dt);
    if (anim === 'attack' && R.last !== 'attack') R.atkT = 0.42;
    R.last = anim;
    R.atkT = Math.max(0, R.atkT - dt);
    const atk = R.atkT > 0 ? Math.sin((1 - R.atkT / 0.42) * PI) : 0;
    const happy = anim === 'happy';
    R.phase += dt * (moving ? 5 + speed * 2.4 : 0);
    const ph = R.phase, t = R.t;
    let hop = happy ? Math.abs(Math.sin(t * 9)) * 0.12 : 0;

    if (m.swarm) {   // bee swarm: orbiting bees
      const tight = anim === 'attack' ? 0.5 : 1;
      for (const b of P.bees) {
        const o = b.userData.o;
        const a = o.a + t * o.s * (1 + ch.run * 0.6);
        const r = o.r * tight * (1 + 0.12 * Math.sin(t * 2 + o.ph));
        b.position.set(Math.cos(a) * r, o.y * (1 - ch.ko * 0.8) + Math.sin(t * 2.3 + o.ph) * 0.07 + atk * 0.12, Math.sin(a) * r + atk * 0.35);
        b.rotation.y = -a + PI / 2;
        const f = 0.6 + 0.4 * Math.sin(t * 60 + o.ph);
        b.userData.w[0].scale.y = f; b.userData.w[1].scale.y = f;
      }
      if (P.ring) P.ring.rotation.z = t * 1.5;
      m.root.position.y = hop;
    } else if (m.bot) {
      const bounce = moving ? Math.abs(Math.sin(ph * 0.9)) * 0.1 : 0;
      P.body.position.y = 0.34 + P.lift + bounce + hop + Math.sin(t * 2) * (P.lift ? 0.04 : 0.005) - ch.ko * 0.16;
      P.body.rotation.z = ch.ko * 1.4 + (moving ? Math.sin(ph * 0.9) * 0.06 : 0);
      P.body.rotation.x = atk * -0.3;
      P.body.scale.y = 1 - (moving ? (1 - Math.abs(Math.sin(ph * 0.9))) * 0.06 : 0) - ch.sit * 0.12;
      for (const l of P.legs) l.rotation.x = moving ? Math.sin(ph * 0.9) * 0.4 : 0;
      for (const a of P.extras) if (a.userData.arm) a.rotation.z = a.userData.arm * (0.2 + (happy ? Math.sin(t * 12) * 0.5 : atk * 0.9));
      const face = koT ? 'ko' : anim === 'sleep' ? 'sleep' : anim === 'attack' || R.atkT > 0 ? 'angry' : st.mood === 'restless' ? 'sad' : 'happy';
      if (P.faceMat && HAS_DOM && P.face !== face) { P.face = face; const tx = faceTexture(face); if (tx) { P.faceMat.map = tx; P.faceMat.needsUpdate = true; } }
    } else if (m.fly) {   // birds
      const air = ch.run > 0.9 || atk > 0 ? 1 : 0;
      P.air = damp(P.air || 0, air, 6, dt);
      const y = P.air * (0.45 + Math.sin(t * 6) * 0.05) + hop;
      m.root.position.y = y;
      P.body.rotation.x = -ch.sit * 0.3 + atk * 0.5 + P.air * -0.25;
      P.body.position.y = P.by - ch.sit * 0.04 + (moving && !P.air ? Math.abs(Math.sin(ph)) * 0.02 : 0);
      const flap = P.air > 0.3 ? Math.sin(t * 28) * 1.0 : happy ? Math.sin(t * 14) * 0.5 : anim === 'idle' ? Math.max(0, Math.sin(t * 0.7)) * 0.02 : 0;
      P.wings.forEach((w, i) => { const s = i === 0 ? -1 : 1; w.rotation.z = s * (0.25 + flap * 0.7) ; w.rotation.x = 0; });
      P.head.rotation.x = Math.sin(t * 1.3) * 0.05 + atk * 0.4 + (st.carry ? 0.2 : 0);
      P.head.rotation.y = anim === 'idle' ? Math.sin(t * 0.8) * 0.5 : 0;
      P.tail.rotation.x = Math.sin(t * 3) * 0.05 + P.air * 0.3;
      P.legs.forEach((l, i) => { l.rotation.x = P.air ? 0.9 : moving ? Math.sin(ph + i * PI) * 0.6 : 0; });
      m.root.rotation.z = ch.ko * 1.45;
    } else {   // quadrupeds
      const amp = 0.55 + ch.run * 0.35;
      const sw = [0, PI, PI, 0];   // FL FR BL BR diagonal gait
      P.legs.forEach((l, i) => {
        let rx = moving ? Math.sin(ph + sw[i]) * amp : 0;
        if (i >= 2) rx = rx * (1 - ch.sit) + (-1.25) * ch.sit;   // hind legs fold when sitting
        if (anim === 'attack' || atk > 0) rx += (i < 2 ? -1 : 0.6) * atk;
        l.rotation.x = rx;
      });
      P.body.rotation.x = -ch.sit * 0.55 + atk * 0.35;
      P.body.position.y = P.bodyY - ch.sit * 0.09 + (moving ? Math.abs(Math.sin(ph)) * 0.02 * (1 + ch.run) : 0) + Math.sin(t * 2) * 0.004 + hop;
      P.body.position.z = atk * 0.15;
      P.neck.rotation.x = (st.carry ? 0.25 : 0) + atk * 0.5 + ch.sit * 0.15;
      P.head.rotation.y = anim === 'idle' ? Math.sin(t * 0.7) * 0.3 : 0;
      m.root.rotation.z = ch.ko * 1.45;
      m.root.position.y = ch.ko * (P.q.bw * 0.5) + hop * 0.5;
      m.root.position.z = 0;
      if (P.tail) {
        const wag = happy ? 0.9 : anim === 'idle' ? 0.25 : moving ? 0.2 : 0.1;
        P.tail.rotation.y = Math.sin(t * (happy ? 16 : 5)) * wag;
        P.tail.rotation.x = tailBase.x + (sp === 'cat' ? Math.sin(t * 1.4) * 0.1 : 0) - ch.sit * 0.3;
      }
      for (const e of P.ears) e.rotation.x = -ch.ko * 0.3 + (moving ? -0.1 : 0);
      for (const x of P.extras) if (x.userData.tail) x.rotation.y = x.userData.tail * (0.55 + Math.sin(t * 3 + x.userData.tail) * 0.15);
    }
    for (const g of P.glow) { if (g.userData.spin) g.rotation.y += dt * g.userData.spin; }
    for (const x of P.extras) if (x.userData.orbit) { const o = x.userData.orbit; o.a += dt * 1.6; x.position.set(Math.cos(o.a) * o.r, o.y, Math.sin(o.a) * o.r); x.rotation.y += dt * 3; x.rotation.x += dt * 2; }
    if (sparkle) sparkle.children.forEach((s, i) => { const a = t * 1.8 + s.userData.ph; s.position.set(Math.cos(a) * 0.35, 0.35 + Math.sin(a * 1.3 + i) * 0.3, Math.sin(a) * 0.35); s.rotation.y += dt * 4; s.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 3 + i))); });
  }
  return {
    root: wrap, height: m.height * sc, radius: 0.35 * sc + 0.15, scale: sc, parts: P, fly: !!m.fly, stage,
    update,
    setCarry(on) { carryMesh.visible = !!on; },
    dispose() { wrap.removeFromParent(); },
  };
}

export const petStageFor = stageForLevel;
export { clamp as _clamp };
