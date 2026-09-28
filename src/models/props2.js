// MAPS2 props (wave 2): procedural low-poly props for the story / challenge / liminal rooms and the interactable
// facility furniture (drawer cabinets, PCs, radios, phones, light switches). Ids are used as 'm2:<id>' through
// world/propfactory.js (createAnyProp), so ctx.placeProp('m2:party_table', ...) works and the static parts merge
// with the rest of the facility (few draw calls). Same conventions as models/props.js: meters, +Y up, front = +Z,
// origin = bottom centre, userData.colliders / lights / anchors. Anchors whose meshes the runtime recolours or
// rotates carry their OWN material and userData.noMerge (they stay separate draw calls, a handful per facility).
import * as THREE from 'three';
import { getMaterial, getBasicMaterial, makeCanvasTexture, seededRandom, hashString } from '../render/textures.js';
import { ModelKit } from './items.js';

const { Kit, G, xf, anchor, PI, HP } = ModelKit;
const { box, cyl, cone, sph, tor, plane } = G;
const L = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const B = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);
const r3 = (v) => Math.round(v * 1000) / 1000;
const col = (c, x, y, z, w, h, d) => c.colliders.push({ c: [r3(x), r3(y), r3(z)], s: [r3(w), r3(h), r3(d)] });
const light = (c, p, color, intensity, distance, extra) => c.lights.push({ p: p.map(r3), color, intensity, distance, ...(extra || {}) });

/** footprints [w, d] (metres, in the prop's local frame) used by the room planner for clearance checks */
export const SIZE2 = {
  party_table: [2.4, 1.1], chair: [0.5, 0.5], balloons: [0.6, 0.6], gift: [0.5, 0.5], crib: [0.8, 1.4], dresser: [1.0, 0.55], rocker: [0.7, 0.9],
  stream_desk: [1.8, 0.9], candles: [0.5, 0.5], barricade: [2.6, 1.1], bedroll: [0.8, 2.0], tally: [1.2, 0.5], float_chair: [0.6, 0.6],
  drawer_cab: [0.6, 0.6], pc: [1.3, 0.7], radio: [0.6, 0.55], phone: [0.6, 0.5], plate: [2.0, 2.0], fate_lever: [0.9, 0.9], lever_pylon: [0.6, 0.6],
  color_panel: [1.4, 0.2], arena_console: [1.3, 0.7], pedestal: [1.1, 1.1], bones: [0.9, 0.9], slot_row: [3.2, 1.0],
};

// ---------- text plates (canvas textures, cached per text) ----------
const _plates = new Map();
/** unlit plate material with `lines` of monospace text (own material, named 'screen:' so it is never merged) */
export function textPlate(lines, { w = 256, h = 96, fg = '#ffd23a', bg = '#181008', border = '#ff5a2a', font = 13 } = {}) {
  const key = [lines.join('|'), w, h, fg, bg, border, font].join('#');
  let m = _plates.get(key);
  if (m) return m;
  const tex = makeCanvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = fg; ctx.font = `bold ${font}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (font + 5), w - 10));
  });
  m = new THREE.MeshBasicMaterial({ map: tex || null, color: 0xffffff });
  m.name = 'screen:m2plate';
  m.userData.m2plate = true;
  _plates.set(key, m);
  return m;
}
export function disposePlates() { for (const m of _plates.values()) { m.map?.dispose?.(); m.dispose(); } _plates.clear(); }

/** child mesh with its own unlit material (recoloured / animated by the runtime) */
function glowAnchor(c, name, p, geo, color) {
  const a = anchor(c.root, name, p);
  const m = new THREE.MeshBasicMaterial({ color });
  m.name = 'screen:m2glow';
  const mesh = new THREE.Mesh(geo, m);
  mesh.userData.noMerge = true;
  a.add(mesh);
  a.userData.noMerge = true;
  c.anchors[name] = a;
  return mesh;
}
/** temporary kit whose geometry is transformed as a group and pushed into `k` */
function grouped(k, pos, rot, build) {
  const k2 = new Kit();
  build(k2);
  for (const [mat, list] of k2.bins) for (const g of list) k.push(mat, xf(g, pos, rot));
}
function plateMesh(c, name, lines, w, h, p, rotY = 0, opts) {
  const a = anchor(c.root, name, p, [0, rotY, 0]);
  const mesh = new THREE.Mesh(plane(w, h), textPlate(lines, opts));
  mesh.userData.noMerge = true;
  a.add(mesh);
  a.userData.noMerge = true;
  c.anchors[name] = a;
  return mesh;
}

const P2 = Object.create(null);
const WOOD = () => L('wood_planks', 0x9a7248), DARK = () => L('wood_dark', 0x5a3c26), METAL = () => L('metal', 0x8a9098), GREY = () => L('metal_plate', 0xb0b4b0);
const dim = (h, f) => ((((h >> 16) & 255) * f) << 16) | ((((h >> 8) & 255) * f) << 8) | (((h & 255) * f) | 0);
const BALLOON = [0xe03050, 0x3080ff, 0xffd030, 0x40c060, 0xd060d0, 0xff8030];

// ------------------------------------------------------------------------------------------------ story: party
P2.party_table = (k, c) => {
  const cloth = L('fabric', 0xc02840), plate = L('porcelain', 0xf4f4f4), sponge = L(null, 0xe8c88a), ice = L(null, 0xf6d4e4), wax = L(null, 0xfff0d0);
  k.add(DARK(), box(2.1, 0.68, 0.85), [0, 0.34, 0]);
  k.add(cloth, box(2.3, 0.04, 1.0), [0, 0.7, 0]);
  k.add(cloth, box(2.3, 0.3, 0.02), [0, 0.55, 0.5]);
  k.add(cloth, box(2.3, 0.3, 0.02), [0, 0.55, -0.5]);
  for (const [x, z] of [[-0.8, 0.3], [0.8, 0.3], [-0.8, -0.3], [0.8, -0.3]]) {
    k.add(plate, cyl(0.13, 0.13, 0.02, 8), [x, 0.74, z]);
    k.add(L(null, BALLOON[c.pick(6)]), cone(0.07, 0.2, 6), [x + 0.02, 0.86, z]);      // party hat
  }
  k.add(sponge, cyl(0.25, 0.27, 0.13, 10), [0, 0.82, 0]);                               // the cake, half eaten
  k.add(ice, cyl(0.25, 0.25, 0.03, 10, false), [0, 0.9, 0], null, [1, 1, 1]);
  k.add(sponge, box(0.26, 0.13, 0.22), [0.13, 0.82, 0.12], [0, 0.3, 0]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; k.add(wax, cyl(0.011, 0.011, 0.09, 4), [Math.cos(a) * 0.15, 0.97, Math.sin(a) * 0.15]); k.add(B(null, 0xffd060), cone(0.012, 0.03, 4), [Math.cos(a) * 0.15, 1.04, Math.sin(a) * 0.15]); }
  light(c, [0, 1.15, 0], 0xffb060, 0.55, 6, { flicker: 0.3 });
  col(c, 0, 0.4, 0, 2.3, 0.8, 1.0);
};
P2.chair = (k, c) => {
  const w = c.opts.tone === 'dark' ? DARK() : WOOD();
  k.add(w, box(0.44, 0.05, 0.44), [0, 0.45, 0]);
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) k.add(w, box(0.04, 0.44, 0.04), [x, 0.22, z]);
  k.add(w, box(0.44, 0.48, 0.04), [0, 0.72, -0.2]);
  col(c, 0, 0.4, 0, 0.46, 0.8, 0.46);
};
P2.balloons = (k, c) => {
  const H = c.opts.h || 2.3, n = 5 + c.pick(3);
  for (let i = 0; i < n; i++) {
    const x = (c.rng() - 0.5) * 0.36, z = (c.rng() - 0.5) * 0.36, h = H - 0.15 + c.rng() * 0.3;
    k.add(L(null, 0xd8d8d8), cyl(0.004, 0.004, h, 3), [x * 0.4, h / 2, z * 0.4]);
    k.add(L(null, BALLOON[(c.pick(6) + i) % 6]), sph(0.15, 7, 5), [x, h + 0.13, z], null, [1, 1.25, 1]);
  }
};
P2.gift = (k, c) => {
  const cl = BALLOON[c.pick(6)], s = 0.28 + c.rng() * 0.2;
  k.add(L(null, cl), box(s, s * 0.8, s), [0, s * 0.4, 0]);
  k.add(L(null, 0xf0f0f0), box(s + 0.01, s * 0.8 + 0.01, 0.04), [0, s * 0.4, 0]);
  k.add(L(null, 0xf0f0f0), box(0.04, s * 0.8 + 0.01, s + 0.01), [0, s * 0.4, 0]);
  col(c, 0, s * 0.4, 0, s, s * 0.8, s);
};
// ------------------------------------------------------------------------------------------------ story: nursery
P2.crib = (k, c) => {
  const w = L('wood_planks', 0xe8d8b8);
  k.add(w, box(0.72, 0.05, 1.3), [0, 0.3, 0]);
  k.add(L('fabric', 0xa8d8e8), box(0.66, 0.1, 1.2), [0, 0.38, 0]);
  for (const x of [-0.34, 0.34]) for (let i = 0; i < 9; i++) k.add(w, box(0.02, 0.5, 0.02), [x, 0.6, -0.55 + i * 0.137]);
  for (const z of [-0.65, 0.65]) k.add(w, box(0.72, 0.5, 0.03), [0, 0.6, z]);
  for (const x of [-0.35, 0.35]) k.add(w, box(0.04, 0.06, 1.3), [x, 0.88, 0]);
  for (const [x, z] of [[-0.35, -0.65], [0.35, -0.65], [-0.35, 0.65], [0.35, 0.65]]) k.add(w, box(0.06, 0.95, 0.06), [x, 0.47, z]);
  k.add(L(null, 0xffd8e8), sph(0.09, 6, 4), [0.1, 0.5, -0.3]);                 // a forgotten plush
  col(c, 0, 0.5, 0, 0.8, 1.0, 1.4);
};
P2.dresser = (k, c) => {
  k.add(L('wood_planks', 0xd8c8a0), box(0.95, 0.85, 0.5), [0, 0.425, 0]);
  for (let i = 0; i < 3; i++) { k.add(L(null, 0xb8a880), box(0.86, 0.22, 0.02), [0, 0.2 + i * 0.26, 0.26]); k.add(L(null, 0x60503a), box(0.1, 0.02, 0.03), [0, 0.2 + i * 0.26, 0.28]); }
  col(c, 0, 0.43, 0, 0.98, 0.86, 0.52);
};
P2.music_box = (k, c) => {
  k.add(L('wood_dark', 0x7a4a30), box(0.24, 0.1, 0.17), [0, 0.05, 0]);
  k.add(L('wood_dark', 0x7a4a30), box(0.24, 0.03, 0.17), [0, 0.13, -0.02], [-0.5, 0, 0]);
  k.add(L(null, 0xf0c0d0), cone(0.03, 0.09, 5), [0, 0.15, 0.02]);               // the dancer
  k.add(B(null, 0xffd060), cyl(0.012, 0.012, 0.04, 4), [0.15, 0.06, 0], [0, 0, HP]);
};
P2.rocker = (k, c) => {
  const w = WOOD();
  k.add(w, box(0.5, 0.05, 0.5), [0, 0.42, 0]);
  k.add(w, box(0.5, 0.6, 0.04), [0, 0.75, -0.24], [-0.15, 0, 0]);
  for (const x of [-0.25, 0.25]) { k.add(w, tor(0.5, 0.02, 3, 12, 1.0), [x, 0.5, 0], [0, HP, -HP - 0.05 + 0.0]); k.add(w, box(0.04, 0.4, 0.04), [x, 0.22, 0.12]); k.add(w, box(0.04, 0.4, 0.04), [x, 0.22, -0.12]); }
  col(c, 0, 0.4, 0, 0.6, 0.8, 0.8);
};
P2.blocks = (k, c) => {
  for (let i = 0; i < 6; i++) k.add(L(null, BALLOON[i % 6]), box(0.1, 0.1, 0.1), [(c.rng() - 0.5) * 0.7, 0.05, (c.rng() - 0.5) * 0.7], [0, c.rng() * 3, 0]);
};
// ------------------------------------------------------------------------------------------------ story: streamer shrine
P2.stream_desk = (k, c) => {
  const dk = L('metal_dark', 0x2a2c34), crt = L(null, 0xc8c2b0);
  k.add(dk, box(1.7, 0.05, 0.8), [0, 0.75, 0]);
  for (const x of [-0.8, 0.8]) k.add(dk, box(0.06, 0.75, 0.7), [x, 0.375, 0]);
  for (const x of [-0.5, 0, 0.5]) {
    k.add(crt, box(0.42, 0.36, 0.32), [x, 0.96, -0.15], [0, x * -0.35, 0]);
    k.add(B('noise_static', 0xa0c8ff), plane(0.34, 0.26), [x + Math.sin(-x * 0.35) * 0.17, 0.97, -0.15 + Math.cos(x * 0.35) * 0.17], [0, x * -0.35, 0]);
  }
  k.add(L(null, 0x1a1a20), box(0.5, 0.02, 0.16), [0, 0.79, 0.22]);                 // keyboard
  k.add(B(null, 0xe8f4ff), tor(0.22, 0.015, 4, 14), [0.9, 1.25, 0.1], [0, HP * 0.3, 0]);   // ring light
  k.add(METAL(), cyl(0.012, 0.012, 0.5, 4), [0.9, 1.0, 0.1]);
  for (let i = 0; i < 6; i++) k.add(L(null, i % 2 ? 0x30c060 : 0xe03050), cyl(0.03, 0.03, 0.12, 6), [-0.78 + (i % 3) * 0.07, 0.83, 0.28 - Math.floor(i / 3) * 0.07]);   // energy cans
  // gaming chair
  k.add(L(null, 0xb01830), box(0.5, 0.08, 0.5), [0, 0.5, 0.75]);
  k.add(L(null, 0x1a1a20), box(0.5, 0.75, 0.1), [0, 0.95, 1.0], [-0.12, 0, 0]);
  k.add(METAL(), cyl(0.03, 0.03, 0.45, 5), [0, 0.25, 0.75]);
  light(c, [0.9, 1.25, 0.1], 0xd8ecff, 0.7, 7);
  light(c, [0, 1.0, 0.3], 0x80a8ff, 0.4, 5, { flicker: 0.15 });
  col(c, 0, 0.5, 0.05, 1.75, 1.0, 0.85);
  col(c, 0, 0.5, 0.8, 0.55, 1.0, 0.55);
};
P2.candles = (k, c) => {
  const wax = L(null, 0xf4ecd0);
  k.add(L('metal', 0x807060), cyl(0.2, 0.22, 0.03, 8), [0, 0.015, 0]);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + 0.4, h = 0.1 + c.rng() * 0.2;
    k.add(wax, cyl(0.02, 0.022, h, 5), [Math.cos(a) * 0.1, 0.03 + h / 2, Math.sin(a) * 0.1]);
    k.add(B(null, 0xffd060), cone(0.016, 0.05, 4), [Math.cos(a) * 0.1, 0.03 + h + 0.025, Math.sin(a) * 0.1]);
  }
  light(c, [0, 0.4, 0], c.opts.color ?? 0xffa050, 0.5, 6, { flicker: 0.4 });
};
// ------------------------------------------------------------------------------------------------ story: last stand / flooded
P2.barricade = (k, c) => {
  const w = WOOD(), m = METAL();
  grouped(k, [0, 0.55, 0], null, (q) => {
    q.add(w, box(1.6, 0.06, 0.8), [-0.4, 0.2, 0], [0.15, 0.1, 0.5]);
    q.add(w, box(1.4, 0.06, 0.7), [0.5, 0.35, 0.1], [-0.1, -0.3, 0.9]);
    q.add(m, box(0.55, 1.3, 0.5), [0.9, 0.1, 0.1], [0, 0.2, 0.15]);
    q.add(L('fabric', 0x6a6a58), box(1.2, 0.12, 0.7), [-0.5, 0.75, 0.05], [0.3, 0.2, 0.1]);
    q.add(w, box(0.9, 0.05, 0.5), [0.05, -0.1, 0.2], [0, 0.6, 0.0]);
  });
  k.add(L('crate_wood'), box(0.7, 0.7, 0.7), [-0.9, 0.35, 0.1], [0, 0.3, 0]);
  k.add(L('crate_metal'), box(0.6, 0.5, 0.6), [-0.85, 0.95, 0.0], [0, 0.5, 0]);
  col(c, 0, 0.55, 0, 2.5, 1.1, 0.9);
};
P2.bedroll = (k, c) => {
  k.add(L('fabric', 0x58604a), box(0.7, 0.12, 1.85), [0, 0.06, 0]);
  k.add(L('fabric', 0xd8d0c0), box(0.4, 0.1, 0.3), [0, 0.14, -0.7]);
};
P2.tally = (k, c) => {
  k.add(METAL(), box(0.05, 1.5, 0.05), [-0.55, 0.75, -0.1], [-0.15, 0, 0]);
  k.add(METAL(), box(0.05, 1.5, 0.05), [0.55, 0.75, -0.1], [-0.15, 0, 0]);
  k.add(L('whiteboard'), box(1.2, 0.8, 0.04), [0, 1.05, 0.02], [-0.12, 0, 0]);
  plateMesh(c, 'board', c.opts.lines || ['DAY 9', '||||  ||||  ||||'], 1.1, 0.7, [0, 1.05, 0.05], 0, { w: 128, h: 80, fg: '#c02020', bg: '#e8e8e0', border: '#909090', font: 12 }).rotation.x = -0.12;
  col(c, 0, 0.75, 0, 1.2, 1.5, 0.3);
};
P2.paper = (k, c) => {
  k.add(L(null, 0xf0e8cc), box(0.28, 0.006, 0.2), [0, 0.003, 0], [0, c.rng() * 1.2 - 0.6, 0]);
  k.add(L(null, 0x303030), box(0.2, 0.007, 0.012), [0, 0.004, -0.04], [0, 0.0, 0]);
  k.add(L(null, 0x303030), box(0.2, 0.007, 0.012), [0, 0.004, 0.0], [0, 0.0, 0]);
  light(c, [0, 0.25, 0], 0xffe8a0, 0.25, 2.2);
};
P2.float_chair = (k, c) => {
  grouped(k, [0, 0.05, 0], [0.35 + c.rng() * 0.3, c.rng() * 6, 0.2], (q) => {
    const w = L('wood_dark', 0x6a5238);
    q.add(w, box(0.44, 0.05, 0.44), [0, 0.2, 0]);
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) q.add(w, box(0.04, 0.2, 0.04), [x, 0.1, z]);
    q.add(w, box(0.44, 0.45, 0.04), [0, 0.45, -0.2]);
  });
};
P2.debris = (k, c) => {
  for (let i = 0; i < 7; i++) k.add(L(null, i % 3 ? 0xe8e4d4 : 0xc8b890), box(0.2, 0.01, 0.15), [(c.rng() - 0.5) * 1.6, 0.01, (c.rng() - 0.5) * 1.6], [0, c.rng() * 6, 0]);
  k.add(L(null, 0xe8e8e8), cyl(0.05, 0.04, 0.09, 6), [0.3, 0.04, 0.2]);
  k.add(L('barrel_toxic'), cyl(0.15, 0.15, 0.3, 7), [-0.5, 0.05, -0.3], [1.2, 0, 0.3]);
};
P2.bones = (k, c) => {
  const b = L(null, 0xe0d8c4);
  for (let i = 0; i < 7; i++) k.add(b, box(0.05, 0.04, 0.28 + c.rng() * 0.2), [(c.rng() - 0.5) * 0.6, 0.03, (c.rng() - 0.5) * 0.6], [0, c.rng() * 3, 0]);
  k.add(b, sph(0.1, 6, 5), [0.1, 0.09, 0.05]);
};
// ------------------------------------------------------------------------------------------------ wall dressing
P2.banner = (k, c) => {
  plateMesh(c, 'txt', c.opts.lines || ['HAPPY', 'BIRTHDAY'], c.opts.w || 2.0, c.opts.hh || 0.6, [0, 0.3, 0.02], 0, { w: 256, h: 80, fg: c.opts.fg || '#ffe040', bg: c.opts.bg || '#c02860', border: '#ffffff', font: c.opts.font || 20 });
  k.add(L(null, 0x303030), box(c.opts.w || 2.0, 0.03, 0.02), [0, 0.62, 0.0]);
};
P2.sign = (k, c) => {
  const w = c.opts.w || 1.5, h = c.opts.hh || 0.6;
  k.add(L('metal_dark', 0x303030), box(w + 0.1, h + 0.1, 0.05), [0, h / 2, 0]);
  plateMesh(c, 'txt', c.opts.lines || ['?'], w, h, [0, h / 2, 0.03], 0, { w: 256, h: Math.round(256 * h / w), fg: c.opts.fg || '#ffd23a', bg: c.opts.bg || '#181008', border: c.opts.border || '#ff5a2a', font: c.opts.font || 15 });
  if (c.opts.lamp !== false) light(c, [0, h / 2, 0.4], c.opts.lampColor ?? 0xffc060, 0.35, 4);
};
// ------------------------------------------------------------------------------------------------ interactable furniture
P2.drawer_cab = (k, c) => {
  const g = L('metal', c.opts.color ?? 0x7a8088);
  k.add(g, box(0.55, 1.25, 0.55), [0, 0.625, 0]);
  for (let i = 0; i < 4; i++) { k.add(L('metal_dark', 0x50565c), box(0.5, 0.26, 0.02), [0, 0.2 + i * 0.3, 0.28]); k.add(L(null, 0xc0c4c8), box(0.16, 0.025, 0.03), [0, 0.25 + i * 0.3, 0.3]); }
  col(c, 0, 0.63, 0, 0.58, 1.26, 0.58);
};
P2.pc = (k, c) => {
  k.add(L('wood_planks', 0xb0a088), box(1.25, 0.05, 0.62), [0, 0.72, 0]);
  for (const x of [-0.58, 0.58]) k.add(METAL(), box(0.05, 0.72, 0.56), [x, 0.36, 0]);
  k.add(L(null, 0xc8c2b0), box(0.42, 0.36, 0.38), [-0.05, 0.93, -0.08]);
  k.add(B('screen_terminal', 0xb0ffc0), plane(0.34, 0.26), [-0.05, 0.94, 0.115]);
  k.add(L(null, 0xc8c2b0), box(0.4, 0.03, 0.15), [-0.05, 0.76, 0.2]);
  k.add(L(null, 0xc8c2b0), box(0.2, 0.42, 0.42), [0.42, 0.98, -0.05]);
  light(c, [-0.05, 1.0, 0.5], 0x90ffb0, 0.3, 3.5);
  col(c, 0, 0.5, 0, 1.28, 1.0, 0.64);
};
P2.radio = (k, c) => {
  k.add(L('wood_planks', 0x8a6a48), box(0.5, 0.05, 0.42), [0, 0.5, 0]);
  for (const [x, z] of [[-0.22, -0.18], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]]) k.add(METAL(), box(0.04, 0.5, 0.04), [x, 0.25, z]);
  k.add(L(null, 0x4a5240), box(0.36, 0.2, 0.16), [0, 0.63, 0]);
  k.add(L(null, 0x202020), box(0.16, 0.13, 0.01), [-0.08, 0.63, 0.085]);
  k.add(B(null, 0xff8030), box(0.05, 0.05, 0.01), [0.1, 0.66, 0.085]);
  k.add(METAL(), cyl(0.005, 0.005, 0.5, 3), [0.15, 0.95, -0.05], [0.2, 0, -0.15]);
  col(c, 0, 0.3, 0, 0.52, 0.75, 0.45);
};
P2.phone = (k, c) => {
  k.add(L('wood_planks', 0x8a6a48), box(0.5, 0.04, 0.4), [0, 0.5, 0]);
  for (const [x, z] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]]) k.add(METAL(), box(0.04, 0.5, 0.04), [x, 0.25, z]);
  k.add(L(null, 0xd8d0b8), box(0.24, 0.07, 0.2), [0, 0.57, 0]);
  k.add(L(null, 0xd8d0b8), box(0.22, 0.04, 0.05), [0, 0.63, -0.04]);
  k.add(L(null, 0xd8d0b8), box(0.05, 0.05, 0.05), [-0.11, 0.61, -0.04]); k.add(L(null, 0xd8d0b8), box(0.05, 0.05, 0.05), [0.11, 0.61, -0.04]);
  k.add(L(null, 0x303030), cyl(0.05, 0.05, 0.01, 8), [0, 0.61, 0.05]);
  col(c, 0, 0.3, 0, 0.52, 0.65, 0.42);
};
P2.switch = (k, c) => {
  k.add(L(null, 0xd8d4c4), box(0.09, 0.14, 0.015), [0, 0.07, 0.0075]);
  k.add(L(null, 0x808078), box(0.025, 0.05, 0.02), [0, 0.07, 0.022]);
};
// ------------------------------------------------------------------------------------------------ challenge rooms
P2.plate = (k, c) => {
  k.add(L('metal_plate', 0x6a6e74), box(2.0, 0.06, 2.0), [0, 0.03, 0]);
  k.add(L('hazard_stripes'), box(2.1, 0.03, 0.12), [0, 0.02, 1.0]); k.add(L('hazard_stripes'), box(2.1, 0.03, 0.12), [0, 0.02, -1.0]);
  k.add(L('hazard_stripes'), box(0.12, 0.03, 2.1), [1.0, 0.02, 0]); k.add(L('hazard_stripes'), box(0.12, 0.03, 2.1), [-1.0, 0.02, 0]);
  glowAnchor(c, 'ring', [0, 0.07, 0], tor(0.7, 0.05, 3, 16).rotateX(HP), 0xff3020);
  light(c, [0, 0.6, 0], 0xff6040, 0.5, 6);
};
P2.fate_lever = (k, c) => {
  k.add(L('marble', 0x40384a), box(0.8, 1.0, 0.8), [0, 0.5, 0]);
  k.add(L('gold', 0xd8b030), box(0.86, 0.06, 0.86), [0, 1.03, 0]); k.add(L('gold', 0xd8b030), box(0.86, 0.06, 0.86), [0, 0.03, 0]);
  plateMesh(c, 'scr', c.opts.lines || ['FATE', 'PAY 40'], 0.6, 0.3, [0, 0.8, 0.41], 0, { w: 128, h: 64, fg: '#ff40ff', bg: '#100418', border: '#ffd030', font: 16 });
  const arm = anchor(c.root, 'arm', [0, 1.06, 0]);
  const m = L('metal', 0xc0c0c8);
  const stick = new THREE.Mesh(cyl(0.025, 0.025, 0.7, 5).translate(0, 0.35, 0), m); stick.userData.noMerge = true; arm.add(stick);
  const ball = new THREE.Mesh(sph(0.09, 7, 5).translate(0, 0.72, 0), L(null, 0xe02030)); ball.userData.noMerge = true; arm.add(ball);
  arm.userData.noMerge = true; c.anchors.arm = arm;
  light(c, [0, 1.6, 0.3], 0xff60ff, 0.6, 7, { flicker: 0.1 });
  col(c, 0, 0.55, 0, 0.9, 1.1, 0.9);
};
P2.lever_pylon = (k, c) => {
  k.add(L('metal_dark', 0x383c44), box(0.5, 1.0, 0.5), [0, 0.5, 0]);
  k.add(L('hazard_stripes'), box(0.52, 0.1, 0.52), [0, 0.95, 0]);
  const arm = anchor(c.root, 'arm', [0, 1.05, 0.0]);
  const stick = new THREE.Mesh(cyl(0.03, 0.03, 0.6, 5).translate(0, 0.3, 0), L('metal', 0xc0c0c8)); stick.userData.noMerge = true; arm.add(stick);
  const knob = new THREE.Mesh(sph(0.08, 6, 4).translate(0, 0.62, 0), L(null, 0xe0c020)); knob.userData.noMerge = true; arm.add(knob);
  arm.rotation.x = -0.7; arm.userData.noMerge = true; c.anchors.arm = arm;
  glowAnchor(c, 'lamp', [0, 1.5, 0], sph(0.1, 6, 5), 0xff3020);
  light(c, [0, 1.6, 0], 0xff6040, 0.5, 5);
  col(c, 0, 0.55, 0, 0.52, 1.1, 0.52);
};
P2.color_panel = (k, c) => {
  k.add(L('metal_dark', 0x30343c), box(1.3, 0.9, 0.1), [0, 0.45, -0.05]);
  const cols = [0xe02030, 0x30c050, 0x3060ff, 0xffd020];
  for (let i = 0; i < 4; i++) {
    glowAnchor(c, 'b' + i, [-0.45 + i * 0.3, 0.4, 0.02], box(0.2, 0.2, 0.05), dim(cols[i], 0.35));
    c.anchors['b' + i].userData.base = cols[i];
    glowAnchor(c, 'l' + i, [-0.45 + i * 0.3, 0.72, 0.02], sph(0.05, 5, 4), 0x202020);
  }
  glowAnchor(c, 'rp', [0.0, 0.16, 0.02], box(0.5, 0.08, 0.04), 0x888888);
  light(c, [0, 0.7, 0.5], 0xd0e0ff, 0.4, 4);
};
P2.arena_console = (k, c) => {
  k.add(L('metal_dark', 0x30343c), box(1.2, 0.95, 0.5), [0, 0.475, 0]);
  k.add(L('hazard_stripes'), box(1.24, 0.06, 0.54), [0, 0.97, 0]);
  plateMesh(c, 'scr', c.opts.lines || ['ARENA', 'PRESS TO START'], 0.9, 0.36, [0, 0.7, 0.26], 0, { w: 128, h: 52, fg: '#ff4030', bg: '#180808', border: '#ff4030', font: 14 });
  glowAnchor(c, 'btn', [0.0, 1.03, 0.05], cyl(0.14, 0.16, 0.06, 10), 0xff2020);
  light(c, [0, 1.3, 0.4], 0xff5030, 0.6, 6);
  col(c, 0, 0.5, 0, 1.25, 1.0, 0.55);
};
P2.pedestal = (k, c) => {
  k.add(L('marble', 0x6a6050), box(1.0, 0.55, 1.0), [0, 0.275, 0]);
  k.add(L('gold', 0xd8b030), box(1.1, 0.06, 1.1), [0, 0.58, 0]);
  col(c, 0, 0.3, 0, 1.1, 0.6, 1.1);
};

function unknown(k, c) { k.add(L('crate_wood'), box(0.5, 0.5, 0.5), [0, 0.25, 0]); col(c, 0, 0.25, 0, 0.5, 0.5, 0.5); }

export const PROP2_IDS = Object.freeze(Object.keys(P2));

export function createProp2(id, opts = {}) {
  opts = opts || {};
  const seed = Number.isFinite(opts.seed) ? opts.seed : 1;
  const root = new THREE.Group();
  root.name = 'prop_m2_' + id;
  const rng = seededRandom(hashString(`m2:${id}:${seed}`));
  const c = { id, opts, seed, rng, root, colliders: [], lights: [], anchors: {}, extra: {}, pick: (n) => Math.floor(rng() * n) % n };
  const k = new Kit();
  (P2[id] || unknown)(k, c);
  k.into(root);
  root.userData.propId = 'm2:' + id;
  root.userData.mount = 'floor';
  root.userData.colliders = c.colliders;
  if (c.lights.length) root.userData.lights = c.lights;
  if (Object.keys(c.anchors).length) root.userData.anchors = c.anchors;
  Object.assign(root.userData, c.extra);
  root.updateMatrixWorld(true);
  return root;
}

/** Rubble pile for a sealed passage (collapse / temporary shutter): a group of grey boxes, `w` wide, `h` high. */
export function createRubble(w, h, seed = 1, shutter = false) {
  const root = new THREE.Group();
  root.name = 'm2_rubble';
  const rng = seededRandom(seed >>> 0);
  const k = new Kit();
  if (shutter) {
    k.add(L('metal_plate', 0x707880), box(w, h, 0.22), [0, h / 2, 0]);
    for (let i = 0; i < 5; i++) k.add(L('hazard_stripes'), box(w, 0.12, 0.24), [0, 0.3 + i * (h - 0.4) / 4, 0]);
  } else {
    const mats = [L('concrete_dark', 0x808080), L('concrete_stained', 0x9a9a92), L('metal_rust', 0x8a6a50)];
    const n = Math.round(w * 6);
    for (let i = 0; i < n; i++) {
      const s = 0.3 + rng() * 0.7, x = (rng() - 0.5) * (w - 0.3), y = rng() * (h - s) * (0.3 + 0.7 * (1 - Math.abs(x) / w));
      k.add(mats[i % 3], box(s, s * (0.6 + rng() * 0.5), s), [x, y + s * 0.3, (rng() - 0.5) * 0.5], [rng() * 0.6, rng() * 3, rng() * 0.6]);
    }
    k.add(mats[0], box(w, h * 0.8, 0.5), [0, h * 0.4, 0]);
  }
  k.into(root);
  return root;
}
