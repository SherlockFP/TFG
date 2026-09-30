// TFG - ART PASS item models (wave 8): the placeholder primitives (harvest axe / pickaxe, mining steel pickaxe / drill, titanium pick,
// electronic bypasser, Signal Jammer, night-vision goggles + spare cell, survival potion + sickle, forge shards, deployable kit case,
// Voyage black box / relic / meteorite) rebuilt as "company-issued equipment": worn yellow / grey plastic, hazard stripes, stencilled
// label plates, one small emissive status LED. Kit-merged (one mesh per material), no THREE lights, deterministic (no Math.random).
//
// createArtModel(id, arg?) -> THREE.Group | null.   ART_IDS lists every fixed id; parametric families are reached through the
// helpers below (createPotionModel / createShardModel / createBackupModel / createKitCase / createRelicModel).
// Conventions = models/items.js: metres, +Y up; TOOLS have the origin at the grip and point along -Z (userData.tip).
import * as THREE from 'three';
import { ModelKit } from './items.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';

const { Kit, G, anchor, PI, HP, TAU } = ModelKit;
const { box, cyl, cone, sph, lathe, tor, plane, oct, ico, circ } = G;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (c) => getBasicMaterial(null, c);

// palette: company yellow, worn grey, rubber, steel
const YEL = 0xd8a820, YEL_D = 0xb08418, GREY = 0x6c7078, GREY_D = 0x33363c, RUBBER = 0x1c1c1e, STEEL = 0xa4aab0, ORANGE = 0xd8641c;
const hazard = () => L('hazard_stripes');
const stencil = () => L('label_kefal');

/** extruded 2D profile: pts are [forward, up] pairs (forward = -Z), thickness along X. */
function prism(k, mat, pts, thick, pos) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateY(HP);                    // shape x -> world -Z, shape y -> world Y, depth -> world X
  return k.add(mat, g, pos);
}

// --------------------------------------------------------------------------------------------------------- hand tools
/** fibreglass haft with rubber grip, ribs and a stencil band; origin at the grip, head end toward -Z */
function haft(k, len, main = YEL, grip = RUBBER) {
  const fg = L('plastic', main);
  k.limb(fg, [0, 0, 0.14], [0, 0, -len], 0.02, 0.016, 6);
  k.limb(L('rubber', grip), [0, 0, 0.15], [0, 0, -0.08], 0.024, 0.024, 6);
  for (let i = 0; i < 4; i++) k.add(L('rubber', grip), cyl(0.026, 0.026, 0.008, 6), [0, 0, 0.11 - i * 0.05], [HP, 0, 0]);
  k.add(L('rubber', grip), cyl(0.028, 0.026, 0.02, 6), [0, 0, 0.155], [HP, 0, 0]);          // butt cap
  k.add(hazard(), cyl(0.0205, 0.0205, 0.06, 6, true), [0, 0, -0.16], [HP, 0, 0], null, 0.16);
  k.add(stencil(), plane(0.05, 0.025), [0.0205, 0.0, -0.3], [0, HP, 0]);                   // stencilled maker plate
  k.add(L('metal', STEEL), cyl(0.022, 0.022, 0.03, 6), [0, 0, -len + 0.03], [HP, 0, 0]);   // ferrule under the head
}
function axe(k, root) {
  haft(k, 0.64);
  const red = L('paint', 0xa82a20), st = L('metal', STEEL);
  k.add(red, box(0.05, 0.1, 0.07), [0, 0, -0.62]);                                          // eye block
  prism(k, red, [[0.585, 0.05], [0.68, 0.05], [0.68, -0.03], [0.73, -0.165], [0.54, -0.165], [0.585, -0.03]], 0.024);
  k.add(st, box(0.014, 0.012, 0.19), [0, -0.165, -0.635]);                                  // ground bit
  k.add(L('metal_dark', 0x60646a), box(0.058, 0.03, 0.045), [0, 0.055, -0.62]);             // poll cap
  for (const sx of [-1, 1]) k.add(st, cyl(0.007, 0.007, 0.006, 5), [sx * 0.026, 0.0, -0.66], [0, 0, HP]);   // rivets
  root.userData.tip = anchor(root, 'tip', [0, -0.165, -0.635]);
}
function pickHead(k, root, o) {
  const st = L('metal', o.head), cap = L('metal_dark', 0x2a2c30);
  k.add(st, box(o.eye, 0.1, 0.075), [0, 0, -0.63]);
  // curved double point in the YZ plane (tips bend back toward the wearer)
  for (const sy of [1, -1]) {
    const a = [0, sy * 0.05, -0.63], b = [0, sy * 0.115, -0.62], c = [0, sy * 0.175, -0.59], d = [0, sy * 0.21, -0.555];
    k.limb(st, a, b, o.r, o.r * 0.78, 4); k.limb(st, b, c, o.r * 0.78, o.r * 0.5, 4); k.limb(cap, c, d, o.r * 0.5, 0.004, 4);
  }
  if (o.collar) for (const dz of [-0.6, -0.66]) k.add(L('paint', ORANGE), box(o.eye + 0.014, 0.11, 0.014), [0, 0, dz]);
  if (o.bolts) for (const sy of [-1, 1]) k.add(L('metal_dark', 0x3a3d42), cyl(0.008, 0.008, o.eye + 0.02, 5), [0, sy * 0.032, -0.63], [0, 0, HP]);
  k.beam(L('rubber', RUBBER), [0, 0, -0.66], [0, 0, -0.69], 0.03);
  const t = anchor(root, 'tip', [0, -0.21, -0.555]); root.userData.tip = t;
}
function pickaxe(k, root) { haft(k, 0.66); pickHead(k, root, { head: 0x8a9096, eye: 0.042, r: 0.02 }); }
function pickaxeSteel(k, root) { haft(k, 0.7, ORANGE); pickHead(k, root, { head: 0xd2dade, eye: 0.05, r: 0.026, collar: true, bolts: true }); }

function drill(k, root) {
  const yel = L('plastic', YEL), dk = L('plastic', GREY_D), mt = L('metal', STEEL);
  k.add(yel, box(0.075, 0.085, 0.24), [0, 0.03, -0.09]);                                    // motor housing
  k.add(yel, box(0.045, 0.12, 0.05), [0, -0.05, 0.02], [0.12, 0, 0]);                       // pistol grip (origin = grip)
  k.add(L('rubber', RUBBER), box(0.05, 0.08, 0.055), [0, -0.06, 0.022], [0.12, 0, 0]);      // rubber overmould
  k.add(dk, box(0.062, 0.045, 0.1), [0, -0.135, 0.03]);                                     // battery pack
  k.add(hazard(), box(0.064, 0.012, 0.1), [0, -0.12, 0.03], null, null, 0.1);
  k.add(dk, box(0.014, 0.03, 0.02), [0, -0.005, -0.018]);                                   // trigger
  k.add(dk, box(0.03, 0.04, 0.05), [0, 0.03, 0.05]);                                        // rear vent cap
  for (let i = 0; i < 3; i++) k.add(L(null, 0x101012), box(0.078, 0.005, 0.03), [0, 0.03 + (i - 1) * 0.016, -0.02]);   // vent slats
  k.add(mt, cyl(0.03, 0.026, 0.06, 8), [0, 0.03, -0.24], [HP, 0, 0]);                       // gearbox nose
  k.add(dk, cyl(0.022, 0.022, 0.05, 8), [0, 0.03, -0.295], [HP, 0, 0]);                     // chuck
  k.add(mt, cyl(0.008, 0.008, 0.17, 6), [0, 0.03, -0.4], [HP, 0, 0]);                       // bit shank
  for (let i = 0; i < 4; i++) k.add(mt, tor(0.0095, 0.0025, 3, 6), [0, 0.03, -0.35 - i * 0.03], [0, 0, 0]);   // flutes
  k.add(mt, cone(0.009, 0.04, 6), [0, 0.03, -0.505], [-HP, 0, 0]);
  k.add(stencil(), plane(0.055, 0.028), [0.0385, 0.035, -0.09], [0, HP, 0]);
  k.add(stencil(), plane(0.055, 0.028), [-0.0385, 0.035, -0.09], [0, -HP, 0]);
  k.add(B(0x40ff70), box(0.012, 0.006, 0.012), [0, 0.0745, -0.16]);                         // status LED
  k.add(B(0xff8a20), box(0.008, 0.006, 0.008), [0.02, 0.0745, -0.16]);
  const t = anchor(root, 'tip', [0, 0.03, -0.525]); root.userData.tip = t;
}

// --------------------------------------------------------------------------------------------------------- lock tools
function pickHandle(k, body, accent) {
  k.add(L('plastic', body), box(0.05, 0.026, 0.1));
  k.add(L('rubber', RUBBER), box(0.052, 0.018, 0.05), [0, 0, 0.02]);
  for (let i = 0; i < 4; i++) k.add(L('metal_dark', 0x202226), box(0.054, 0.004, 0.006), [0, 0.008, 0.01 + i * 0.012]);   // knurl
  k.add(L('paint', accent), box(0.052, 0.006, 0.016), [0, 0.011, -0.038]);
}
function titaniumPick(k, root) {
  const ti = L('metal', 0x9aa6b6, { emissive: 0x0c1018 });
  pickHandle(k, 0x40444c, 0x5aa0ff);
  for (const [x, r, l] of [[-0.014, -0.06, 0.07], [0, 0, 0.085], [0.014, 0.06, 0.075]]) {   // fanned picks
    k.add(ti, box(0.0035, 0.0035, l), [x + Math.sin(r) * l * 0.4, 0, -0.05 - l / 2], [0, r, 0]);
    k.add(ti, box(0.0035, 0.014, 0.0035), [x + Math.sin(r) * l, 0.006, -0.05 - l], [0, r, 0]);   // hook tip
  }
  k.add(ti, box(0.005, 0.005, 0.05), [-0.026, -0.008, -0.06]);                                // tension wrench
  k.add(ti, box(0.02, 0.005, 0.005), [-0.036, -0.008, -0.085]);
  k.add(B(0xffb020), box(0.008, 0.005, 0.008), [0.018, 0.0145, -0.005]);                      // amber LED
  k.add(stencil(), plane(0.028, 0.014), [0, 0.0135, 0.03], [-HP, 0, 0]);
  const t = anchor(root, 'tip', [0, 0.006, -0.135]); root.userData.tip = t;
}
function bypasser(k, root) {
  const dk = L('plastic', GREY_D), yel = L('plastic', YEL_D);
  k.add(dk, box(0.066, 0.03, 0.12));
  k.add(yel, box(0.068, 0.012, 0.03), [0, -0.009, 0.045]);
  k.add(L(null, 0x0a1a10), box(0.04, 0.003, 0.03), [0, 0.0165, -0.02]);
  k.add(B(0x40ff70), box(0.034, 0.003, 0.008), [0, 0.0185, -0.028]);                          // display line
  k.add(B(0x208a40), box(0.02, 0.003, 0.006), [-0.007, 0.0185, -0.016]);
  for (let i = 0; i < 6; i++) k.add(L('keypad', 0xc8c8c8), box(0.011, 0.005, 0.011), [-0.014 + (i % 3) * 0.014, 0.0165, 0.02 + Math.floor(i / 3) * 0.014]);
  k.add(L('metal', STEEL), cyl(0.004, 0.004, 0.07, 5), [0.026, 0.03, 0.03]);                  // stub antenna
  k.add(B(0xff2a20), sph(0.005, 5, 4), [0.026, 0.066, 0.03]);
  // clip leads
  for (const [x, c] of [[-0.016, 0xc02020], [0.016, 0x181818]]) {
    k.limb(L('rubber', c), [x, 0, -0.06], [x * 1.6, -0.006, -0.11], 0.003, 0.003, 4);
    k.add(L('metal', STEEL), box(0.008, 0.006, 0.022), [x * 1.6, -0.006, -0.125]);
    k.add(L('metal', STEEL), box(0.01, 0.003, 0.012), [x * 1.6, 0.0, -0.132]);
  }
  k.add(B(0xff3030), box(0.007, 0.004, 0.007), [0.026, 0.0165, -0.045]);
  const t = anchor(root, 'tip', [0, -0.006, -0.14]); root.userData.tip = t;
}

// --------------------------------------------------------------------------------------------------------- feed-cams: Signal Jammer
function jammer(k, root) {
  const dk = L('plastic', GREY_D), gr = L('plastic', GREY), yel = L('plastic', YEL);
  k.add(dk, box(0.11, 0.07, 0.2), [0, 0, -0.02]);                                            // body brick
  k.add(gr, box(0.114, 0.02, 0.204), [0, 0.03, -0.02]);
  k.add(hazard(), box(0.112, 0.022, 0.05), [0, -0.012, 0.05], null, null, 0.1);              // hazard band round the grip end
  k.add(yel, box(0.116, 0.024, 0.03), [0, -0.03, -0.075]);
  k.add(L('rubber', RUBBER), box(0.05, 0.05, 0.11), [0, -0.055, 0.03]);                       // grip
  k.add(L(null, 0x0c0d0e), box(0.09, 0.05, 0.012), [0, 0.0, -0.126]);                        // emitter grille
  for (let i = 0; i < 5; i++) k.add(L('metal', 0x50545a), box(0.09, 0.004, 0.006), [0, -0.02 + i * 0.01, -0.131]);
  for (const [x, tilt] of [[-0.04, 0.2], [0, 0], [0.04, -0.2]]) {                            // three antennas fanning forward-up
    const h = 0.1 + (x === 0 ? 0.04 : 0);
    k.add(L('rubber', RUBBER), cyl(0.011, 0.011, 0.03, 6), [x, 0.058, -0.06]);
    k.limb(L('metal', 0xc0c4c8), [x, 0.07, -0.06], [x + tilt * 0.6, 0.07 + h * 0.85, -0.06 - 0.05 - tilt * 0.0], 0.005, 0.0035, 5);
    k.add(B(0xff2a20), sph(0.007, 5, 4), [x + tilt * 0.6, 0.07 + h * 0.85 + 0.005, -0.11]);
  }
  k.add(stencil(), plane(0.07, 0.035), [0.0562, 0.0, -0.02], [0, HP, 0]);
  k.add(stencil(), plane(0.07, 0.035), [-0.0562, 0.0, -0.02], [0, -HP, 0]);
  for (let i = 0; i < 3; i++) k.add(B(i === 0 ? 0x40ff70 : i === 1 ? 0xffb020 : 0xff3030), box(0.012, 0.006, 0.012), [-0.03 + i * 0.03, 0.0405, 0.06]);   // LED bar
  k.add(L('metal_dark', 0x2a2c30), box(0.03, 0.012, 0.03), [0.035, 0.0405, 0.0]);            // power switch
  const t = anchor(root, 'tip', [0, 0.05, -0.13]); root.userData.tip = t;
}

// --------------------------------------------------------------------------------------------------------- night vision gear
function goggles(k, root, mk) {
  const body = mk === 2 ? 0x25292e : 0x5e6234, trim = mk === 2 ? YEL : 0x2c2e20, lens = mk === 2 ? 0x7dffa8 : 0x4dd06e;
  const pl = L('plastic', body), dk = L('plastic', 0x16171a), rb = L('rubber', RUBBER);
  k.add(pl, box(0.1, 0.06, 0.07), [0, 0.006, -0.01]);                                        // bridge housing
  k.add(L('plastic', trim), box(0.102, 0.012, 0.04), [0, 0.038, -0.01]);
  for (const sx of [-1, 1]) {
    k.add(pl, cyl(0.031, 0.031, 0.09, 8), [sx * 0.05, 0, -0.07], [HP, 0, 0]);               // tubes
    k.add(dk, cyl(0.036, 0.031, 0.02, 8), [sx * 0.05, 0, -0.12], [HP, 0, 0]);              // objective bells
    k.add(B(lens), circ(0.026, 8), [sx * 0.05, 0, -0.1305], [0, PI, 0]);               // glowing lens
    k.add(L('metal', STEEL), tor(0.032, 0.0035, 3, 8), [sx * 0.05, 0, -0.112], [0, 0, 0]);  // focus ring
    k.add(rb, cyl(0.026, 0.03, 0.03, 8), [sx * 0.05, 0, 0.038], [HP, 0, 0]);                // eye cups
  }
  k.add(L('plastic', trim), cyl(0.017, 0.017, 0.03, 6), [0, 0.064, 0.0]);                    // battery cap
  k.add(L('metal', STEEL), cyl(0.009, 0.009, 0.006, 6), [0, 0.081, 0.0]);
  k.add(dk, box(0.05, 0.05, 0.02), [0, 0.0, 0.05]);                                          // rear mount plate
  // head-strap: side straps + rear band
  for (const sx of [-1, 1]) k.add(rb, box(0.008, 0.016, 0.13), [sx * 0.098, 0.005, 0.085]);
  k.add(rb, box(0.196, 0.016, 0.008), [0, 0.005, 0.15]);
  k.add(B(mk === 2 ? 0xff5030 : 0x40ff70), box(0.008, 0.006, 0.008), [0, 0.043, -0.045]);   // status LED
  if (mk === 2) {
    k.add(dk, box(0.03, 0.02, 0.022), [0, -0.012, -0.056]);                                    // IR illuminator
    k.add(B(0x901818), box(0.022, 0.012, 0.004), [0, -0.012, -0.0685]);
    k.add(L('metal', STEEL), box(0.11, 0.004, 0.004), [0, 0.0355, -0.048]);
  }
  k.add(stencil(), plane(0.036, 0.018), [0, 0.0, -0.0463], [0, PI, 0]);
}
function cell(k, root) {
  const yel = L('paint', YEL), dk = L('plastic', GREY_D), st = L('metal', STEEL);
  k.add(yel, cyl(0.03, 0.03, 0.1, 10), [0, 0.06, 0]);                                       // canister
  k.add(hazard(), cyl(0.0305, 0.0305, 0.026, 10, true), [0, 0.03, 0], null, null, 0.12);    // hazard ring
  k.add(dk, cyl(0.032, 0.032, 0.016, 10), [0, 0.008, 0]);                                   // base cap
  k.add(dk, cyl(0.031, 0.031, 0.018, 10), [0, 0.119, 0]);
  k.add(st, cyl(0.011, 0.011, 0.016, 8), [0, 0.136, 0]);                                    // positive terminal
  k.add(st, cyl(0.02, 0.02, 0.004, 10), [0, 0.129, 0]);
  k.add(L(null, 0x101214), box(0.03, 0.05, 0.004), [0, 0.078, 0.0305]);                     // charge readout plate
  for (let i = 0; i < 3; i++) k.add(B(i < 2 ? 0x40ff70 : 0x2a6a3a), box(0.02, 0.008, 0.003), [0, 0.062 + i * 0.014, 0.0332]);
  k.add(stencil(), plane(0.032, 0.016), [0, 0.078, -0.0305], [0, PI, 0]);
  return { center: false };
}

// --------------------------------------------------------------------------------------------------------- survival
/** hex string / number -> int */
const hexOf = (c) => (typeof c === 'number' ? c : new THREE.Color(c).getHex());
function potion(k, root, colour) {
  const col = hexOf(colour);
  k.add(L('glass', 0xdfe9ee, { opacity: 0.5 }), lathe([[0, 0], [0.05, 0.004], [0.058, 0.03], [0.058, 0.08], [0.04, 0.115], [0.021, 0.135], [0.021, 0.17], [0.026, 0.176], [0.026, 0.19], [0, 0.19]], 8));
  k.add(B(col), lathe([[0, 0.006], [0.044, 0.008], [0.052, 0.03], [0.052, 0.07], [0.04, 0.094], [0.0, 0.094]], 8));   // liquid (emissive)
  k.add(L('wood_dark', 0x8a5a2a), cyl(0.022, 0.018, 0.03, 6), [0, 0.2, 0]);                  // cork
  k.add(L('paint', 0xe6dcc0), cyl(0.0595, 0.0595, 0.034, 8, true), [0, 0.05, 0]);            // paper label band
  k.add(L('paint', col), box(0.03, 0.018, 0.004), [0, 0.05, 0.0605]);                        // colour tag
  k.add(hazard(), cyl(0.0225, 0.0225, 0.012, 8, true), [0, 0.175, 0], null, null, 0.05);     // hazard seal
  return { center: false };
}
function sickle(k, root) {
  const st = L('metal', 0xc9ced4);
  k.limb(L('plastic', YEL), [0, 0, 0.1], [0, 0, -0.16], 0.016, 0.014, 6);
  k.limb(L('rubber', RUBBER), [0, 0, 0.11], [0, 0, -0.04], 0.02, 0.02, 6);
  const cz = -0.16, cy = 0.1, R = 0.1, N = 9;
  let prev = [0, cy - R, cz];
  for (let i = 1; i <= N; i++) {                                                            // crescent blade, bending up and back
    const a = (i / N) * PI * 1.15, p = [0, cy - R * Math.cos(a), cz - R * Math.sin(a)];
    k.limb(st, prev, p, 0.011 * (1 - (i - 1) / N) + 0.003, 0.011 * (1 - i / N) + 0.003, 4);
    prev = p;
  }
  k.add(L('metal_dark', 0x40444a), cyl(0.02, 0.02, 0.02, 6), [0, 0, -0.16], [HP, 0, 0]);   // ferrule
  const t = anchor(root, 'tip', prev); root.userData.tip = t;
}

// --------------------------------------------------------------------------------------------------------- forge shards
function shard(k, root, key, colour) {
  const col = hexOf(colour), pl = L('plastic', GREY_D), yel = L('paint', YEL);
  const base = () => { k.add(pl, cyl(0.05, 0.055, 0.016, 6), [0, 0.008, 0]); k.add(yel, cyl(0.051, 0.051, 0.006, 6), [0, 0.016, 0]); };   // evidence-tag pedestal
  switch (key) {
    case 'scrap':
      base();
      k.add(L('metal_rust', 0x9a9a98, { flat: true }), cyl(0.0, 0.045, 0.13, 5), [-0.02, 0.09, 0], [0, 0.3, 0.2]);
      k.add(L('metal', 0x8a908a, { flat: true }), cyl(0.0, 0.035, 0.09, 5), [0.035, 0.065, 0.02], [0.2, 0.9, -0.3]);
      k.add(L('metal_rust', 0xb08a60, { flat: true }), cyl(0.0, 0.03, 0.07, 5), [-0.035, 0.055, 0.03], [-0.3, 0.2, 0.5]);
      k.add(L('paint', ORANGE), box(0.05, 0.008, 0.03), [0.01, 0.024, 0.045], [0, 0.5, 0]);
      k.add(L('metal', STEEL), cyl(0.008, 0.008, 0.01, 5), [0.012, 0.03, 0.045]);
      break;
    case 'circuit':
      k.add(L('paint', 0x1d6a3a), box(0.2, 0.014, 0.14), [0, 0.007, 0]);
      k.add(L(null, 0x141414), box(0.07, 0.024, 0.07), [0.02, 0.026, 0]);
      for (let i = 0; i < 4; i++) k.add(L('metal', 0xd8c060), box(0.008, 0.006, 0.014), [-0.02 + i * 0.03, 0.019, 0.05]);
      for (let i = 0; i < 3; i++) k.add(L('paint', 0x2a4a90), cyl(0.011, 0.011, 0.022, 6), [-0.075 + i * 0.024, 0.025, -0.045]);
      k.add(B(col), box(0.15, 0.004, 0.008), [0, 0.016, 0.03]);
      k.add(B(col), box(0.008, 0.004, 0.06), [-0.075, 0.016, 0.0]);
      break;
    case 'crystal':
      base();
      for (const [x, z, h, r] of [[0, 0, 0.17, 0.035], [0.04, 0.02, 0.1, 0.024], [-0.035, 0.015, 0.12, 0.026]]) k.add(B(col), cyl(0.0, r, h, 5), [x, 0.02 + h / 2, z], [0, x * 20, x * 3]);
      k.add(L(null, 0x0a0c10), box(0.06, 0.004, 0.02), [0, 0.0175, 0.05]);
      break;
    case 'ecto':
      base();
      for (let i = 0; i < 3; i++) k.add(hazard(), tor(0.062, 0.006, 3, 10), [0, 0.1, 0], [i * PI / 3, i * PI / 3, 0], null, 0.06);   // containment rings
      k.add(B(col), ico(0.045, 0), [0, 0.1, 0]);
      for (const sx of [-1, 1]) k.add(L('metal', STEEL), cyl(0.005, 0.005, 0.08, 5), [sx * 0.06, 0.06, 0]);
      break;
    case 'algo':
      base();
      k.add(B(col), tor(0.07, 0.014, 4, 12), [0, 0.1, 0], [HP, 0, 0]);
      k.add(B(0xffffff), oct(0.04), [0, 0.1, 0]);
      for (let i = 0; i < 4; i++) k.add(L('metal', 0xd8b048), cone(0.01, 0.05, 4), [Math.cos(i * HP) * 0.08, 0.1, Math.sin(i * HP) * 0.08], [0, -i * HP, -HP]);
      break;
    default:                                                                                 // source: a cube in a cage
      base();
      k.add(B(col), box(0.07, 0.07, 0.07), [0, 0.1, 0], [0.5, 0.6, 0]);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) k.add(L('metal_dark', 0x2a2c30), box(0.018, 0.018, 0.018), [sx * 0.06, 0.1 + sy * 0.06, sz * 0.06]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(L('metal', STEEL), cyl(0.004, 0.004, 0.12, 4), [sx * 0.06, 0.1, sz * 0.06]);
  }
  return { center: false };
}
function backup(k, root) {
  const dk = L('plastic', GREY_D), rb = L('rubber', ORANGE);
  k.add(dk, box(0.09, 0.024, 0.15));
  k.add(rb, box(0.094, 0.028, 0.02), [0, 0, 0.065]);
  k.add(rb, box(0.094, 0.028, 0.02), [0, 0, -0.065]);
  k.add(hazard(), box(0.06, 0.004, 0.03), [0, 0.0125, 0.0], null, null, 0.06);
  k.add(L('metal', STEEL), box(0.035, 0.01, 0.028), [0, 0, -0.088]);                        // usb plug
  k.add(L(null, 0x101214), box(0.02, 0.006, 0.018), [0, 0, -0.094]);
  k.add(B(0xff8a3d), box(0.012, 0.005, 0.012), [0.03, 0.0135, 0.05]);
  return { center: false };
}

// --------------------------------------------------------------------------------------------------------- deployable kit case
/** the yellow hard case a deployable comes in (the mini model of the deployable sits on top, see models/deployables.js) */
function kitCase(k, root) {
  const yel = L('plastic', YEL), dk = L('plastic', GREY_D);
  k.add(yel, box(0.5, 0.14, 0.36), [0, 0.07, 0]);
  k.add(dk, box(0.51, 0.012, 0.37), [0, 0.07, 0]);                                           // lid seam
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(L('rubber', RUBBER), box(0.05, 0.16, 0.05), [sx * 0.235, 0.08, sz * 0.165]);   // corner bumpers
  for (const x of [-0.12, 0.12]) { k.add(L('metal', STEEL), box(0.06, 0.05, 0.014), [x, 0.07, 0.186]); k.add(L('metal_dark', 0x2a2c30), box(0.03, 0.02, 0.018), [x, 0.058, 0.19]); }   // latches
  k.add(dk, box(0.16, 0.03, 0.04), [0, 0.15, 0.13]);                                         // carry-handle base
  k.add(hazard(), box(0.5, 0.02, 0.06), [0, 0.148, -0.14], null, null, 0.14);
  k.add(stencil(), plane(0.12, 0.06), [0, 0.07, 0.1855]);
  k.add(B(0xff3030), box(0.02, 0.008, 0.02), [0.2, 0.1415, 0.14]);
  return { center: false };
}

// --------------------------------------------------------------------------------------------------------- Voyage
function blackbox(k, root) {
  const org = L('paint', 0xe8781c), wh = L('paint', 0xe8e4dc), dk = L('plastic', GREY_D);
  k.add(org, box(0.42, 0.22, 0.26), [0, 0.13, 0]);
  k.add(org, box(0.38, 0.02, 0.3), [0, 0.04, 0]);
  for (const x of [-0.11, 0.11]) k.add(wh, box(0.05, 0.222, 0.262), [x, 0.13, 0]);         // reflective bands
  for (const sx of [-1, 1]) { k.add(dk, box(0.08, 0.03, 0.14), [sx * 0.24, 0.03, 0]); k.add(L('metal', STEEL), cyl(0.014, 0.014, 0.034, 6), [sx * 0.25, 0.03, 0]); }   // mount flanges
  k.add(dk, cyl(0.03, 0.03, 0.14, 8), [0.15, 0.31, 0], [0, 0, HP]);                          // underwater locator beacon
  k.add(dk, box(0.05, 0.05, 0.08), [0.15, 0.27, 0]);
  k.add(L('metal', STEEL), cyl(0.031, 0.031, 0.02, 8), [0.09, 0.31, 0], [0, 0, HP]);
  k.add(hazard(), box(0.16, 0.012, 0.264), [-0.08, 0.243, 0], null, null, 0.1);
  k.add(L('paint', 0xe6dcc0), box(0.14, 0.05, 0.004), [0, 0.13, 0.132]);                    // label plate
  k.add(stencil(), plane(0.12, 0.06), [0, 0.13, 0.135]);
  k.add(B(0xff3020), box(0.03, 0.03, 0.03), [-0.14, 0.255, 0.06]);
  return { center: false };
}
function relic(k, root, colour = 0x40f0d0, big = 1) {
  const col = hexOf(colour), st = L('rock', 0x6a665c, { flat: true }), dk = L('metal_dark', 0x3a3a3e);
  k.add(st, cyl(0.16 * big, 0.2 * big, 0.08 * big, 6), [0, 0.04 * big, 0]);
  k.add(st, cyl(0.1 * big, 0.14 * big, 0.06 * big, 6), [0, 0.11 * big, 0], [0, 0.3, 0]);
  for (let i = 0; i < 6; i++) k.add(B(col), box(0.012 * big, 0.024 * big, 0.004), [Math.cos(i * TAU / 6 + 0.5) * 0.19 * big, 0.05 * big, Math.sin(i * TAU / 6 + 0.5) * 0.19 * big], [0, -(i * TAU / 6 + 0.5) + HP, 0]);   // glyph slots
  for (let i = 0; i < 3; i++) {                                                            // prongs holding the crystal
    const a = i * TAU / 3;
    k.limb(dk, [Math.cos(a) * 0.09 * big, 0.14 * big, Math.sin(a) * 0.09 * big], [Math.cos(a) * 0.045 * big, 0.27 * big, Math.sin(a) * 0.045 * big], 0.012 * big, 0.006 * big, 4);
  }
  k.add(B(col), oct(0.12 * big), [0, 0.3 * big, 0], [0, 0.6, 0], [0.8, 1.6, 0.8]);
  k.add(B(0xffffff), oct(0.045 * big), [0, 0.3 * big, 0], [0, 0.6, 0], [0.8, 1.6, 0.8]);
  return { center: false };
}
function meteorite(k, root) {
  const g = ico(0.24, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {                                                      // deterministic lumpy rock
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.86 + 0.28 * Math.abs(Math.sin(x * 37.1 + y * 19.7 + z * 53.3));
    p.setXYZ(i, x * n, y * n * 0.85, z * n);
  }
  g.computeVertexNormals();
  k.add(L('rock', 0x3a3430, { flat: true }), g, [0, 0.2, 0]);
  for (const [x, y, z, r] of [[0.16, 0.28, 0.1, 0.4], [-0.1, 0.32, 0.16, -0.5], [0.02, 0.15, 0.22, 0.9], [-0.18, 0.18, -0.06, 0.2]])
    k.add(B(0xff6a20), box(0.012, 0.09, 0.012), [x, y, z], [0.3, r, 0.6]);                 // glowing fracture veins
  k.add(B(0xffa040), ico(0.07, 0), [0.1, 0.32, 0.12]);
  return { center: false };
}

// --------------------------------------------------------------------------------------------------------- registry
const ART = {
  tool_axe: axe, tool_pickaxe: pickaxe, tool_pickaxe_steel: pickaxeSteel, tool_drill: drill,
  lp2_titanium: titaniumPick, lp2_bypass: bypasser, fc_jammer: jammer,
  nvg1: (k, r) => goggles(k, r, 1), nvg2: (k, r) => goggles(k, r, 2), nvcell: cell,
  sv_sickle: sickle, forge_backup: backup,
  vy_blackbox: blackbox, vy_relic: (k, r) => relic(k, r, 0x40f0d0, 1.3), vy_meteorite: meteorite,
};
export const ART_IDS = Object.freeze(Object.keys(ART));
const TOOL_IDS = new Set(['tool_axe', 'tool_pickaxe', 'tool_pickaxe_steel', 'tool_drill', 'lp2_titanium', 'lp2_bypass', 'fc_jammer', 'sv_sickle']);
const r3 = (v) => Math.round(v * 1000) / 1000;

function finish(root, k, id, tool) {
  k.into(root);
  root.updateMatrixWorld(true);
  const sz = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  root.userData.itemId = id; root.userData.kind = tool ? 'tool' : 'item'; root.userData.size = [r3(sz.x), r3(sz.y), r3(sz.z)];
  return root;
}
function build(id, fn, tool) {
  const root = new THREE.Group(); root.name = 'item_' + id;
  const k = new Kit();
  fn(k, root);
  return finish(root, k, id, tool);
}
/** Build an art-pass model by fixed id (null for ids this file does not own). */
export function createArtModel(id) { const fn = ART[id]; return fn ? build(id, fn, TOOL_IDS.has(id)) : null; }
/** survival potion bottle; colour = '#rrggbb' */
export const createPotionModel = (colour) => build('potion', (k, r) => potion(k, r, colour), false);
/** forge shard by tier key ('scrap' | 'circuit' | 'crystal' | 'ecto' | 'algo' | 'source') */
export const createShardModel = (key, colour) => build('shard_' + key, (k, r) => shard(k, r, key, colour), false);
/** yellow deployable case (origin on the floor, top at y = 0.14) */
export const createKitCase = () => build('kitcase', kitCase, false);
/** strange-find relic on a plinth; colour tints the crystal */
export const createRelicModel = (colour = 0x40f0d0, big = 1) => build('relic', (k, r) => relic(k, r, colour, big), false);
