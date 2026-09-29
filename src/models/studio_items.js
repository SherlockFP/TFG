// REPOMAPS item models (wave 8): tiny data-driven low-poly models for the fragile loot of the four themed interiors (game/repomaps_core.js ITEM_DEFS).
// A model is a list of parts [shape, color, dims, pos, rot?, glow?]: b = box(w,h,d), c = cylinder(rTop, rBottom, h), s = sphere(r), k = cone(r,h).
// glow parts are unlit (MeshBasic), everything else Lambert. The item entity recentres the model on its bounding box, so origins do not matter.
import * as THREE from 'three';

const GOLD = 0xe6be55, DARK = 0x2a2c34, GLASS = 0xbfe6f4, ICE = 0x9ad4f0, WOOD = 0x6a4428, PAPER = 0xe8e2cc, PINK = 0xff5cc8;

export const STUDIO_MODELS = {
  st_ringgold: [['c', GOLD, [0.02, 0.02, 0.5], [0, 0.25, 0]], ['b', DARK, [0.16, 0.03, 0.16], [0, 0, 0]], ['b', 0xfff2e0, [0.34, 0.05, 0.05], [0, 0.5, 0], [0, 0, 0], 1], ['b', 0xfff2e0, [0.05, 0.34, 0.05], [0.17, 0.4, 0], [0, 0, 0], 1], ['b', 0xfff2e0, [0.05, 0.34, 0.05], [-0.17, 0.4, 0], [0, 0, 0], 1]],
  st_diamondbtn: [['b', GOLD, [0.34, 0.3, 0.03], [0, 0.15, 0]], ['b', 0xbff4ff, [0.2, 0.2, 0.04], [0, 0.15, 0.01], [0, 0, 0.785]], ['b', 0x2a2c34, [0.36, 0.03, 0.05], [0, 0, 0]]],
  st_champagne: [['c', 0x2a5a2a, [0.06, 0.09, 0.32], [0, 0.16, 0]], ['c', 0x2a5a2a, [0.025, 0.05, 0.14], [0, 0.4, 0]], ['c', GOLD, [0.03, 0.03, 0.05], [0, 0.49, 0]], ['b', PINK, [0.14, 0.12, 0.005], [0, 0.15, 0.09], [0, 0, 0], 1]],
  st_goldtoilet: [['b', GOLD, [0.5, 0.42, 0.7], [0, 0.21, 0]], ['b', GOLD, [0.55, 0.5, 0.2], [0, 0.67, -0.25]], ['c', 0xfff0a0, [0.24, 0.22, 0.06], [0, 0.45, 0.06]], ['b', GOLD, [0.56, 0.05, 0.6], [0, 0.44, 0.05]], ['b', PINK, [0.3, 0.06, 0.02], [0, 0.66, -0.14], [0, 0, 0], 1]],
  st_globe: [['c', WOOD, [0.12, 0.16, 0.04], [0, 0.02, 0]], ['c', GOLD, [0.015, 0.015, 0.26], [0, 0.17, 0]], ['s', 0x3a72b8, [0.18], [0, 0.3, 0]]],
  st_beebtrophy: [['b', WOOD, [0.2, 0.06, 0.2], [0, 0.03, 0]], ['c', GOLD, [0.03, 0.03, 0.14], [0, 0.13, 0]], ['c', GOLD, [0.11, 0.05, 0.14], [0, 0.27, 0]], ['s', GOLD, [0.05], [0, 0.38, 0]]],
  st_inkwell: [['c', DARK, [0.09, 0.11, 0.1], [0, 0.05, 0]], ['c', 0x1a1a5a, [0.07, 0.07, 0.02], [0, 0.11, 0]], ['b', 0xf0f0e0, [0.02, 0.24, 0.02], [0.05, 0.2, 0], [0, 0, -0.3]]],
  st_microscope: [['b', DARK, [0.2, 0.03, 0.26], [0, 0.015, 0]], ['c', DARK, [0.035, 0.035, 0.34], [0, 0.2, -0.06], [-0.25, 0, 0]], ['c', 0xd8d8dc, [0.03, 0.03, 0.14], [0, 0.32, 0.02], [0.4, 0, 0]], ['b', DARK, [0.14, 0.02, 0.12], [0, 0.1, 0.04]]],
  st_skeleton: [['b', 0xf2eedc, [0.26, 0.4, 0.14], [0, 1.0, 0]], ['s', 0xf2eedc, [0.13], [0, 1.4, 0]], ['b', 0xf2eedc, [0.06, 0.6, 0.06], [-0.2, 1.0, 0]], ['b', 0xf2eedc, [0.06, 0.6, 0.06], [0.2, 1.0, 0]], ['b', 0xf2eedc, [0.08, 0.7, 0.08], [-0.09, 0.4, 0]], ['b', 0xf2eedc, [0.08, 0.7, 0.08], [0.09, 0.4, 0]], ['c', DARK, [0.02, 0.02, 1.5], [0, 0.75, -0.14]], ['b', DARK, [0.4, 0.04, 0.34], [0, 0.02, -0.08]]],
  st_frozendrive: [['b', 0x3a4450, [0.16, 0.05, 0.11], [0, 0.03, 0]], ['b', ICE, [0.2, 0.09, 0.15], [0, 0.05, 0], [0, 0, 0], 1], ['b', 0xdff4ff, [0.22, 0.03, 0.17], [0, 0.11, 0]]],
  st_cryovial: [['c', GLASS, [0.05, 0.05, 0.22], [0, 0.11, 0]], ['c', 0x5ad8ff, [0.04, 0.04, 0.14], [0, 0.09, 0], [0, 0, 0], 1], ['c', DARK, [0.055, 0.055, 0.04], [0, 0.24, 0]], ['s', 0xdff4ff, [0.05], [0, -0.01, 0]]],
  st_icebrick: [['b', 0x30363e, [0.34, 0.07, 0.2], [0, 0.035, 0]], ['b', ICE, [0.4, 0.2, 0.26], [0, 0.15, 0], [0, 0, 0], 1], ['b', 0xdff4ff, [0.2, 0.06, 0.1], [-0.05, 0.28, 0.02]]],
  st_coldstack: [['b', 0x56626e, [0.56, 1.0, 0.7], [0, 0.5, 0]], ['b', 0xdcecf4, [0.6, 0.14, 0.74], [0, 1.05, 0]], ['b', ICE, [0.34, 0.5, 0.04], [0, 0.55, 0.36], [0, 0, 0], 1], ['b', 0xdcecf4, [0.6, 0.2, 0.74], [0, 0.1, 0]]],
  st_canvas: [['b', GOLD, [0.5, 0.4, 0.05], [0, 0.2, 0]], ['b', 0x16161a, [0.42, 0.32, 0.03], [0, 0.2, 0.02]], ['b', 0xd8203c, [0.2, 0.05, 0.02], [0.08, 0.14, 0.04], [0, 0, 0], 1], ['b', 0x6a6a76, [0.3, 0.03, 0.02], [-0.03, 0.26, 0.04]]],
  st_bust: [['b', 0xe4e0d8, [0.3, 0.1, 0.24], [0, 0.05, 0]], ['b', 0xe4e0d8, [0.24, 0.26, 0.16], [0, 0.23, 0]], ['s', 0xe4e0d8, [0.11], [0, 0.46, 0]], ['b', 0xd8203c, [0.3, 0.04, 0.03], [0, 0.46, 0.1], [0, 0, 0.2], 1]],
  st_framedpost: [['b', 0x1a1a1e, [0.42, 0.3, 0.05], [0, 0.15, 0]], ['b', 0xe8eef8, [0.34, 0.22, 0.03], [0, 0.15, 0.02]], ['b', 0x6a6a76, [0.26, 0.02, 0.02], [0, 0.2, 0.04]], ['b', 0x6a6a76, [0.2, 0.02, 0.02], [-0.03, 0.15, 0.04]], ['b', 0xd8203c, [0.12, 0.03, 0.02], [0.05, 0.09, 0.045], [0, 0, 0], 1]],
  st_megameme: [['b', 0x2a2c34, [0.6, 0.12, 0.6], [0, 0.06, 0]], ['b', 0xffd84a, [0.44, 0.44, 0.44], [0, 0.4, 0]], ['s', 0x111111, [0.05], [-0.1, 0.46, 0.23]], ['s', 0x111111, [0.05], [0.1, 0.46, 0.23]], ['b', 0x111111, [0.24, 0.04, 0.02], [0, 0.28, 0.23]], ['b', 0xd8203c, [0.3, 0.05, 0.03], [0, 0.72, 0], [0, 0, 0], 1]],
};

const _mats = new Map();
function mat(color, glow) {
  const key = (glow ? 'b' : 'l') + color;
  let m = _mats.get(key);
  if (!m) { m = glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }); _mats.set(key, m); }
  return m;
}
const geo = (shape, d) => (shape === 'b' ? new THREE.BoxGeometry(d[0], d[1], d[2]) : shape === 'c' ? new THREE.CylinderGeometry(d[0], d[1], d[2], 8) : shape === 's' ? new THREE.SphereGeometry(d[0], 8, 6) : new THREE.ConeGeometry(d[0], d[1], 7));

export function createStudioItem(id) {
  const g = new THREE.Group();
  g.name = 'item_' + id;
  for (const [shape, color, dims, pos, rot, glow] of STUDIO_MODELS[id] || []) {
    const m = new THREE.Mesh(geo(shape, dims), mat(color, !!glow));
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    g.add(m);
  }
  return g;
}
