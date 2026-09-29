// Visuals of the Upper Deck (wave 5 shipdeck): stair housing + steps inside the hub, the hatch frame, the deck slab, rails (Mk I), the cabin with a
// glass band and lit rooms (Mk II), the glass observation dome + ribs + the extra mount ring (Mk III). Geometry numbers come from world/shiplayout.js
// (deckColliders / DECK_SLOTS / deckStairs) so what you see is what collides. Everything is merged: one textured mesh set (GeoBuilder), one lit
// vertex-coloured mesh, one unlit "emissive" mesh, one glass mesh. No lights are added (constant scene light count): the glow is unlit material.
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from '../world/geobuilder.js';
import { bakeParts } from '../world/shipdeco.js';
import * as L from '../world/shiplayout.js';

const C_DARK = [0.2, 0.22, 0.26], C_METAL = [0.55, 0.58, 0.62], C_YEL = [0.95, 0.78, 0.15], C_TEAL = [0.2, 0.75, 0.68], C_WHITE = [0.92, 0.92, 0.88];
const ROOM_GLOW = { bunk: [0.35, 0.55, 1.0], store: [1.0, 0.7, 0.2], turret: [0.25, 1.0, 0.5], lounge: [1.0, 0.45, 0.6] };
export const ROOM_GLOW_HEX = ROOM_GLOW;
const bx = (w, h, d, x, y, z, c) => ({ g: new THREE.BoxGeometry(w, h, d), p: [x, y, z], c });
/** box from world extents */
const wb = (x0, x1, y0, y1, z0, z1, c) => bx(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, c);

/** one furnished room in slot i (see shiplayout DECK_SLOTS: it hugs the north / south cabin wall, open towards the well) */
function roomParts(room, i, lit, glow) {
  const s = L.DECK_SLOTS[i], f = s.face, y = L.DECK.y, len = s.x1 - s.x0, dep = s.z1 - s.z0, back = f > 0 ? s.z0 : s.z1, g = ROOM_GLOW[room];
  // u along x from the slot start, v from the back wall towards the room
  const B = (u0, u1, v0, v1, h0, h1, c, out = lit) => { const za = back + f * v0, zb = back + f * v1; out.push(wb(s.x0 + u0, s.x0 + u1, y + h0, y + h1, Math.min(za, zb), Math.max(za, zb), c)); };
  B(0, len, 0, dep, 0, 0.02, [g[0] * 0.35, g[1] * 0.35, g[2] * 0.35]);                                  // rug in the room colour
  if (room === 'bunk') {
    B(0, len - 0.05, 0.02, dep - 0.02, 0.05, 0.3, [0.3, 0.32, 0.38]); B(0.05, len - 0.1, 0.06, dep - 0.06, 0.3, 0.45, [0.55, 0.65, 0.9]);
    B(0, len - 0.05, 0.02, dep - 0.02, 1.0, 1.12, [0.3, 0.32, 0.38]); B(0.05, len - 0.1, 0.06, dep - 0.06, 1.12, 1.27, [0.55, 0.65, 0.9]);
    for (const u of [0.02, len - 0.09]) for (const v of [0.03, dep - 0.09]) B(u, u + 0.06, v, v + 0.06, 0, 1.6, C_METAL);
    B(0.12, 0.4, 0.06, 0.3, 0.45, 0.56, C_WHITE); B(0.12, 0.4, 0.06, 0.3, 1.27, 1.38, C_WHITE);       // pillows
    B(len * 0.5 - 0.15, len * 0.5 + 0.15, 0.0, 0.05, 1.3, 1.45, g, glow);                                // night lamp on the back wall
  } else if (room === 'store') {
    B(0, len, 0, Math.min(0.42, dep), 0, 1.9, [0.36, 0.3, 0.24]);
    for (const h of [0.5, 0.95, 1.4]) B(0, len, 0, Math.min(0.46, dep), h, h + 0.04, C_METAL);
    const crate = [[0.1, 0.55, 0.0, [0.75, 0.55, 0.25]], [0.75, 1.2, 0.5, [0.65, 0.45, 0.2]], [1.3, 1.75, 0.0, [0.8, 0.62, 0.3]]];
    for (const [a, b, h0, c] of crate) B(a, Math.min(len - 0.05, b), 0.03, Math.min(0.4, dep - 0.02), h0 + 0.04, h0 + 0.42, c);
    B(0.1, 0.55, 0.03, Math.min(0.4, dep - 0.02), 1.0, 1.4, [0.7, 0.5, 0.22]);
    if (dep > 0.6) B(len - 0.7, len - 0.15, 0.5, dep - 0.05, 0, 0.5, [0.7, 0.52, 0.24]);                 // floor crate (S slots are deeper)
    B(0.1, len - 0.1, 0.0, 0.04, 1.86, 1.9, g, glow);
  } else if (room === 'turret') {
    B(0.08, len - 0.08, 0, 0.36, 0, 0.85, C_DARK); B(0.08, len - 0.08, 0.02, 0.4, 0.85, 0.9, [0.3, 0.32, 0.36]);
    const sc = [[0.15, 0.7, [0.25, 1.0, 0.5]], [0.78, 1.3, [1.0, 0.35, 0.3]], [1.38, Math.min(len - 0.15, 1.9), [0.3, 0.8, 1.0]]];
    for (const [a, b, c] of sc) { B(a, b, 0.06, 0.12, 0.95, 1.5, C_DARK); B(a + 0.03, b - 0.03, 0.12, 0.14, 0.98, 1.47, c, glow); }
    B(0.2, len - 0.2, 0.0, 0.04, 1.56, 1.85, [0.15, 0.35, 0.25], glow);                                  // wall map
    if (dep > 0.6) B(0.5, 0.9, 0.55, 0.95, 0, 0.5, C_DARK);                                              // chair (S slots)
  } else if (room === 'lounge') {
    B(0, len * 0.72, 0, dep, 0, 0.42, [0.62, 0.22, 0.28]); B(0, len * 0.72, 0, 0.2, 0.42, 0.9, [0.55, 0.18, 0.24]);
    B(0, 0.16, 0, dep, 0.42, 0.65, [0.5, 0.16, 0.22]); B(len * 0.72 - 0.16, len * 0.72, 0, dep, 0.42, 0.65, [0.5, 0.16, 0.22]);   // arm rests
    B(len * 0.78, len * 0.97, 0.05, Math.min(0.42, dep - 0.05), 0, 0.5, C_DARK); B(len * 0.8, len * 0.95, 0.07, Math.min(0.4, dep - 0.07), 0.5, 0.54, g, glow);
    B(len * 0.72 - 0.35, len * 0.72 - 0.2, 0.0, 0.05, 1.2, 1.5, g, glow);                                // warm wall lamp
  }
  B(0.15, len - 0.15, dep * 0.3, dep * 0.3 + 0.1, D_CEIL, D_CEIL + 0.04, g, glow);                        // ceiling strip in the room colour
}
const D_CEIL = L.DECK.h - 0.06;

/** t = deck tier 0..3, rooms = [slot0..slot3]; returns { group, dispose() } (empty group at tier 0) */
export function buildDeck(t, rooms = [], opts = {}) {
  const group = new THREE.Group(); group.name = 'ship_upper_deck';
  const disposables = [];
  if (t < 1) return { group, dispose() {} };
  const D = L.DECK, W = L.WELL, St = L.deckStairs(), gb = new GeoBuilder(), lit = [], glow = [], glass = [];
  const tint = opts.tint || [1, 0.95, 0.88];
  // ---- inside the hub: stair housing (the three walls), divider, steps, hatch frame
  const wall = (x0, x1, z0, z1, y0, y1) => gb.box('ship_wall', (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0.5, [0.86, 0.92, 0.9]);
  wall(W.x0 - 0.1, W.x1 + 0.1, W.z0 - 0.1, W.z0, 0, 3.4); wall(W.x0 - 0.1, W.x0, W.z0, W.z1, 0, 3.4); wall(W.x1, W.x1 + 0.1, W.z0, W.z1, 0, 3.4);
  wall(St.dividerX0, St.dividerX1, St.platform.z1, W.z1, 0, 3.4);
  for (const p of [St.a, St.b]) for (const s of p.steps) gb.box('metal_plate', s.cx, s.cy, s.cz, s.sx, s.sy, s.sz, 0.5, p === St.a ? [0.9, 0.95, 1] : [1, 0.94, 0.85]);
  gb.box('metal_plate', (W.x0 + W.x1) / 2, L.deckStairs().platform.y / 2, (W.z0 + St.platform.z1) / 2, W.x1 - W.x0, St.platform.y, St.platform.z1 - W.z0, 0.5, [0.85, 0.9, 0.95]);
  // hazard frame round the hatch at the ceiling + a floor arrow strip in front of the stair
  gb.box('hazard_stripes', (W.x0 + W.x1) / 2, 3.37, W.z1 + 0.06, W.x1 - W.x0, 0.06, 0.12, 0.6); gb.box('hazard_stripes', (W.x0 + W.x1) / 2, 3.37, W.z0 - 0.06, W.x1 - W.x0, 0.06, 0.12, 0.6);
  // yellow nosing lights along the divider (unlit, so the stair reads in the dark) and step-edge strips
  for (let k = 0; k < 6; k++) glow.push(bx(0.03, 0.06, 0.16, St.dividerX0 - 0.015, 0.9 + k * 0.5, W.z1 - 0.3 - k * 0.3, [1, 0.85, 0.2]));
  for (let k = 0; k < 5; k++) glow.push(bx(0.03, 0.06, 0.16, W.x1 - 0.015, 2.3 + k * 0.4, W.z1 - 0.3 - k * 0.3, [1, 0.85, 0.2]));
  // ---- deck slab (top y 4.0, the well stays open) + rails round the well
  for (const [x0, z0, x1, z1] of L.withoutWell(D.x0, D.z0, D.x1, D.z1)) gb.box('metal_plate', (x0 + x1) / 2, D.y - D.slab / 2, (z0 + z1) / 2, x1 - x0, D.slab, z1 - z0, 0.5, [0.75, 0.78, 0.82]);
  const rail = (x0, x1, z0, z1, c = C_YEL) => { lit.push(wb(x0, x1, D.y + D.rail - 0.06, D.y + D.rail, z0, z1, c)); const n = Math.max(1, Math.round(Math.max(x1 - x0, z1 - z0) / 1.2)); for (let k = 0; k <= n; k++) { const px = x0 + (x1 - x0) * k / n, pz = z0 + (z1 - z0) * k / n; lit.push(wb(px - 0.03, px + 0.03, D.y, D.y + D.rail, pz - 0.03, pz + 0.03, C_METAL)); } };
  rail(W.x0 - 0.04, W.x0 + 0.04, W.z0, W.z1); rail(W.x0, W.x1, W.z0 - 0.04, W.z0 + 0.04); rail(W.x1 - 0.04, W.x1 + 0.04, W.z0, W.z1); rail(W.x0, St.dividerX1, W.z1 - 0.04, W.z1 + 0.04);
  glow.push(wb(W.x0 + 0.02, W.x1 - 0.02, D.y + 0.005, D.y + 0.02, W.z1 + 0.06, W.z1 + 0.14, [1, 0.8, 0.15]));   // floor strip at the top of the stair
  if (t === 1) {
    // Mk I: bare deck - an open platform with edge rails, corner lamp posts and a mast beacon
    rail(D.x0, D.x1, D.z0, D.z0 + 0.08, C_METAL); rail(D.x0, D.x1, D.z1 - 0.08, D.z1, C_METAL); rail(D.x0, D.x0 + 0.08, D.z0, D.z1, C_METAL); rail(D.x1 - 0.08, D.x1, D.z0, D.z1, C_METAL);
    for (const [px, pz] of [[D.x0 + 0.15, D.z0 + 0.15], [D.x1 - 0.15, D.z0 + 0.15], [D.x0 + 0.15, D.z1 - 0.15], [D.x1 - 0.15, D.z1 - 0.15]]) { lit.push(wb(px - 0.04, px + 0.04, D.y, D.y + 1.7, pz - 0.04, pz + 0.04, C_DARK)); glow.push(wb(px - 0.09, px + 0.09, D.y + 1.7, D.y + 1.85, pz - 0.09, pz + 0.09, [0.4, 0.9, 1])); }
    lit.push(wb(D.x1 - 0.5, D.x1 - 0.44, D.y, D.y + 2.6, D.z0 + 0.4, D.z0 + 0.46, C_DARK)); glow.push(wb(D.x1 - 0.55, D.x1 - 0.39, D.y + 2.6, D.y + 2.75, D.z0 + 0.35, D.z0 + 0.51, [1, 0.2, 0.15]));
  } else {
    // Mk II: the cabin - solid lower wall, a glass band, mullions, roof (or the dome at Mk III), lit rooms
    const th = D.wall, y0 = D.y, yg0 = y0 + 1.0, yg1 = y0 + 2.2, y1 = y0 + D.h;
    const sk = (x0, x1, z0, z1, a, b) => gb.box('metal_plate', (x0 + x1) / 2, (a + b) / 2, (z0 + z1) / 2, x1 - x0, b - a, z1 - z0, 0.5, tint);
    for (const [x0, x1, z0, z1] of [[D.x0, D.x1, D.z0, D.z0 + th], [D.x0, D.x1, D.z1 - th, D.z1], [D.x0, D.x0 + th, D.z0, D.z1], [D.x1 - th, D.x1, D.z0, D.z1]]) {
      sk(x0, x1, z0, z1, y0, yg0); sk(x0, x1, z0, z1, yg1, y1);
      glass.push(wb(x0 + (x1 - x0 > th ? 0 : 0.02), x1 - (x1 - x0 > th ? 0 : 0.02), yg0, yg1, z0 + (z1 - z0 > th ? 0 : 0.02), z1 - (z1 - z0 > th ? 0 : 0.02), [0.55, 0.8, 0.9]));
    }
    for (let k = 0; k <= 6; k++) for (const z of [D.z0, D.z1 - th]) lit.push(wb(D.x0 + (D.x1 - D.x0 - th) * k / 6, D.x0 + (D.x1 - D.x0 - th) * k / 6 + th, yg0, yg1, z - 0.01, z + th + 0.01, C_WHITE));
    for (let k = 0; k <= 8; k++) for (const x of [D.x0, D.x1 - th]) lit.push(wb(x - 0.01, x + th + 0.01, yg0, yg1, D.z0 + (D.z1 - D.z0 - th) * k / 8, D.z0 + (D.z1 - D.z0 - th) * k / 8 + th, C_WHITE));
    glow.push(wb(D.x0 - 0.02, D.x1 + 0.02, yg1 + 0.02, yg1 + 0.07, D.z0 - 0.02, D.z0 + 0.0, [0.3, 0.9, 0.8]), wb(D.x0 - 0.02, D.x1 + 0.02, yg1 + 0.02, yg1 + 0.07, D.z1, D.z1 + 0.02, [0.3, 0.9, 0.8]));   // outside trim glow
    if (t === 2) gb.box('metal_plate', (D.x0 + D.x1) / 2, y1 + 0.075, (D.z0 + D.z1) / 2, D.x1 - D.x0, 0.15, D.z1 - D.z0, 0.5, [0.7, 0.72, 0.76]);
    // cabin ceiling lights (unlit strips) + the rooms
    for (const [x, z] of [[0.3, 0], [3.4, 0], [1.9, -2.2], [1.9, 2.2]]) glow.push(wb(x - 0.3, x + 0.3, y1 - 0.05, y1, z - 0.06, z + 0.06, [1, 0.96, 0.85]));
    for (let i = 0; i < L.deckSlots(t); i++) if (rooms[i]) roomParts(rooms[i], i, lit, glow);
    else { const s = L.DECK_SLOTS[i]; lit.push(wb(s.x0 + 0.1, s.x1 - 0.1, D.y, D.y + 0.02, s.z0 + 0.05, s.z1 - 0.05, [0.32, 0.34, 0.38])); glow.push(wb(s.x0 + 0.3, s.x1 - 0.3, D.y + 0.021, D.y + 0.03, (s.z0 + s.z1) / 2 - 0.04, (s.z0 + s.z1) / 2 + 0.04, [0.9, 0.7, 0.2])); }   // empty slot: a marked pad
  }
  if (t >= 3) {
    // Mk III: glass observation dome over the whole deck, ribs, a lit base ring, and the ring of the extra roof mount
    const cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2, hy = D.y + D.h, rx = (D.x1 - D.x0) / 2, rz = (D.z1 - D.z0) / 2, hh = 1.35;
    const dome = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(rx, hh, rz); dome.translate(cx, hy, cz);
    const pos = dome.attributes.position, col = new Float32Array(pos.count * 3).fill(0.6); for (let k = 0; k < pos.count; k++) { col[k * 3] = 0.55; col[k * 3 + 1] = 0.8; col[k * 3 + 2] = 0.95; }
    dome.setAttribute('color', new THREE.BufferAttribute(col, 3)); glass.push({ raw: dome });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4, rh = 1 / Math.sqrt((Math.cos(a) / rx) ** 2 + (Math.sin(a) / rz) ** 2);
      lit.push({ g: new THREE.TorusGeometry(1, 0.03, 5, 28, Math.PI), p: [cx, hy, cz], r: [0, -a, 0], s: [rh, hh, 1], c: C_WHITE });
    }
    lit.push({ g: new THREE.TorusGeometry(1, 0.06, 6, 40), p: [cx, hy + 0.05, cz], r: [Math.PI / 2, 0, 0], s: [rx, rz, 1], c: C_DARK });
    glow.push({ g: new THREE.TorusGeometry(1, 0.025, 4, 40), p: [cx, hy + 0.12, cz], r: [Math.PI / 2, 0, 0], s: [rx - 0.05, rz - 0.05, 1], c: [0.3, 0.9, 1] });
    glow.push({ g: new THREE.TorusGeometry(0.6, 0.03, 4, 24), p: [L.DECK_MOUNT.x, D.y + 0.02, L.DECK_MOUNT.z], r: [Math.PI / 2, 0, 0], c: [1, 0.7, 0.2] });   // extra turret slot marking (the mount plate itself is ship2's)
  }
  const mk = (arr, mat) => {
    const parts = arr.filter((p) => !p.raw), raws = arr.filter((p) => p.raw).map((p) => p.raw);
    if (!parts.length && !raws.length) return null;
    let geo = parts.length ? bakeParts(parts) : null;
    if (raws.length) { const gs = raws.map((g) => (g.index ? g.toNonIndexed() : g)); gs.forEach((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.normal && geo) { /* keep */ } }); geo = geo ? mergeTwo(geo, gs) : gs[0]; }
    const m = new THREE.Mesh(geo, mat); disposables.push(geo, mat); return m;
  };
  const tex = gb.build((key) => levelMaterial(key)); group.add(tex);
  const litM = mk(lit, new THREE.MeshLambertMaterial({ vertexColors: true })); if (litM) { litM.name = 'deck_lit'; group.add(litM); }
  const glowM = mk(glow, new THREE.MeshBasicMaterial({ vertexColors: true })); if (glowM) { glowM.name = 'deck_glow'; group.add(glowM); }
  const glassM = mk(glass, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })); if (glassM) { glassM.name = 'deck_glass'; glassM.renderOrder = 2; group.add(glassM); }
  return {
    group, meshes: () => group.children.length,
    dispose() { group.removeFromParent(); group.traverse((o) => { if (o.isMesh && (o.parent === group)) { /* textured meshes share level materials: geometry only */ o.geometry?.dispose?.(); } }); for (const d of disposables) d.dispose?.(); },
  };
}
function mergeTwo(a, list) {
  // append non-indexed raw geometries (with colour) to a baked one: plain concatenation of position / normal / color
  const all = [a, ...list].map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of all) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(n * 3); let o = 0;
    for (const g of all) { const at = g.attributes[name]; if (at) arr.set(at.array, o); o += g.attributes.position.count * 3; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
