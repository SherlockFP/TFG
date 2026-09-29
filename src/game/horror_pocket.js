// HORROR module - POCKET builder: turns a tile-map spec (horror_maps.js) into geometry, colliders, a creature NavGrid, pooled lamps and the list of
// spots the host fills (zombies, loot, herbs, typewriter ...). A pocket lives far away from the moon (x >= 8000) on the facility floor plane so every
// system that treats "y < FACILITY_Y + 40" as indoors keeps working. Same geometry on every peer (built from the spec + the run seed).
import * as THREE from 'three';
import { GeoBuilder, levelMaterial } from '../world/geobuilder.js';
import { NavGrid } from '../world/nav.js';
import { createProp } from '../models/props.js';
import { RNG } from '../core/rng.js';
import { G } from '../physics/physics.js';
import { TILE, SOLID_PROPS } from './horror_maps.js';

export const POCKET_ORIGIN_X = 8000, POCKET_SLOT = 420;
const T = TILE;
const WALL_CH = new Set(['#', ' ', 'D']);
const FLOOR_CH = new Set('.,sFrXzwpahlLTBCP$'.split(''));

// floor / wall / ceiling texture + brightness per style and floor symbol
const STYLES = {
  outbreak: {
    '.': { f: 'tiles_white', w: 'tiles_dirty', c: 'ceiling_tiles', k: 0.78 }, ',': { f: 'carpet_red', w: 'wallpaper_damask', c: 'wood_dark', k: 0.74 },
    s: { f: 'wood_floor', w: 'wall_office', c: 'ceiling_tiles', k: 0.95 }, r: { f: 'metal_grate', w: 'tiles_dirty', c: 'ceiling_tiles', k: 0.8 }, X: { f: 'concrete_dark', w: 'concrete_dark', c: 'concrete_dark', k: 0.32 },
  },
  mansion: {
    '.': { f: 'wood_planks', w: 'wood_dark', c: 'wood_dark', k: 0.7 }, ',': { f: 'carpet_red', w: 'wood_dark', c: 'wood_dark', k: 0.72 },
    F: { f: 'marble', w: 'wood_dark', c: 'wood_dark', k: 0.8 }, X: { f: 'concrete_dark', w: 'concrete_dark', c: 'concrete_dark', k: 0.32 },
  },
  ballroom: {
    '.': { f: 'marble', w: 'wallpaper_damask', c: 'wood_planks', k: 0.85 }, ',': { f: 'carpet_red', w: 'wallpaper_damask', c: 'wood_planks', k: 0.8 }, X: { f: 'concrete_dark', w: 'concrete_dark', c: 'concrete_dark', k: 0.32 },
  },
  warehouse: {
    '.': { f: 'concrete', w: 'metal_plate', c: 'metal_dark', k: 0.7 }, X: { f: 'concrete_dark', w: 'concrete_dark', c: 'concrete_dark', k: 0.32 },
  },
};
const LAMP = { outbreak: { color: 0xffe8c0, intensity: 0.85, distance: 11, flicker: 0.22 }, mansion: { color: 0xffc98a, intensity: 1.0, distance: 13, flicker: 0.05 },
  ballroom: { color: 0xffd9a0, intensity: 1.05, distance: 15, flicker: 0.02 }, warehouse: { color: 0xd8e8ff, intensity: 0.8, distance: 12, flicker: 0.12 } };
const DRESS = {
  outbreak: { '.': ['hospital_bed', 'locker', 'desk', 'filing_cabinet', 'cardboard_boxes'], ',': ['armchair', 'table', 'bookcase', 'grandfather_clock'], s: ['bookcase', 'filing_cabinet'] },
  mansion: { '.': ['bookcase', 'armchair', 'table', 'cupboard', 'grandfather_clock', 'fireplace', 'bunkbed'], ',': ['armchair', 'grandfather_clock'], F: ['grandfather_clock', 'armchair'] },
  ballroom: { '.': ['table', 'armchair'], ',': [] }, warehouse: { '.': ['crate_wood', 'barrel', 'pallet', 'cardboard_boxes', 'crate_metal'] },
};
const styleOf = (spec, ch) => { const S = STYLES[spec.style]; const k = ch === 'z' || ch === 'w' || ch === 'p' || ch === 'a' || ch === 'h' || ch === 'l' || ch === 'L' || SOLID_PROPS.has(ch) ? '.' : ch; return S[k] || S['.']; };

class TileNav extends NavGrid {}
function edgeKeyFor(W) {
  return (x, z, dir) => { if (dir === 2) { x -= 1; dir = 0; } else if (dir === 3) { z -= 1; dir = 1; } return ((z * W + x) << 1) | dir; };
}

/**
 * spec = POCKET_SPECS[...]; o = { physics, lightPool, ox, oz, y, seed }
 */
export function buildPocket(spec, o) {
  const { physics, lightPool } = o;
  const rows = spec.map, Wt = rows[0].length, Ht = rows.length;
  const ox = o.ox, oz = o.oz, Y = o.y;
  const rng = new RNG(((o.seed | 0) ^ 0x7e57c4) >>> 0);
  const group = new THREE.Group();
  group.name = 'hr_pocket_' + spec.id;
  const colliders = [], emitters = [], anims = [], disposables = [];
  const gb = new GeoBuilder();
  const wxT = (tx) => ox + tx * T, wzT = (tz) => oz + tz * T;
  const chAt = (r, x, z) => r[z]?.[x] ?? '#';
  const upper = spec.upper || null;
  const slab = spec.slab ?? 0.2;
  const yUp = Y + spec.H + slab;                    // top of the upper floor
  const heightOf = (ch) => (ch === 'F' ? spec.tallH : spec.H);
  const addBox = (cx, cy, cz, sx, sy, sz, member = G.STATIC, data) => { const c = physics.addStaticBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, 0, member, data); colliders.push(c); return c; };
  const grey = (k) => [k, k, k];

  // ---------------- geometry: floors, ceilings, walls
  const isFloor = (r, x, z) => FLOOR_CH.has(chAt(r, x, z));
  const wallFace = (key, tx, tz, d, y0, y1, k) => {
    const X0 = wxT(tx), X1 = wxT(tx + 1), Z0 = wzT(tz), Z1 = wzT(tz + 1);
    if (d === 0) gb.vrect(key, X1, Z0, X1, Z1, y0, y1, 0.5, grey(k), Z0);
    else if (d === 2) gb.vrect(key, X0, Z1, X0, Z0, y0, y1, 0.5, grey(k), Z0);
    else if (d === 1) gb.vrect(key, X1, Z1, X0, Z1, y0, y1, 0.5, grey(k), X0);
    else gb.vrect(key, X0, Z0, X1, Z0, y0, y1, 0.5, grey(k), X0);
  };
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
  function buildFloorTiles(r, y0, isUpper) {
    for (let tz = 0; tz < Ht; tz++) for (let tx = 0; tx < Wt; tx++) {
      const ch = chAt(r, tx, tz);
      if (!FLOOR_CH.has(ch)) continue;
      const st = styleOf(spec, ch);
      const top = y0 + (isUpper ? spec.H : heightOf(ch));
      const shade = st.k * (0.94 + ((tx * 7 + tz * 13) % 5) * 0.03);
      gb.hrect('f:' + st.f, wxT(tx), wzT(tz), wxT(tx + 1), wzT(tz + 1), y0, true, 0.5, grey(shade));
      if (isUpper) gb.hrect('c:' + st.c, wxT(tx), wzT(tz), wxT(tx + 1), wzT(tz + 1), y0 - 0.01, false, 0.5, grey(st.k * 0.8));   // underside of the balcony / upper floor
      gb.hrect('c:' + st.c, wxT(tx), wzT(tz), wxT(tx + 1), wzT(tz + 1), top, false, 0.5, grey(st.k * 0.9));
      for (let d = 0; d < 4; d++) {
        const nx = tx + DX[d], nz = tz + DZ[d], nch = chAt(r, nx, nz);
        if (FLOOR_CH.has(nch)) {
          const nTop = y0 + (isUpper ? spec.H : heightOf(nch));
          if (nTop < top - 0.01) wallFace('w:' + st.w, tx, tz, d, nTop, top, st.k);
        } else if (isUpper && nch === ' ') {
          // railing along the balcony edge: three thin bars + a rail (visual), collider below
          railing(tx, tz, d, y0);
        } else wallFace('w:' + st.w, tx, tz, d, y0, top, st.k * (ch === 'X' ? 1 : 0.95));
      }
    }
  }
  function railing(tx, tz, d, y0) {
    const cx = wxT(tx) + T / 2 + DX[d] * (T / 2 - 0.05), cz = wzT(tz) + T / 2 + DZ[d] * (T / 2 - 0.05);
    const alongX = d === 1 || d === 3;
    const sx = alongX ? T : 0.08, sz = alongX ? 0.08 : T;
    gb.box('w:wood_dark', cx, y0 + 1.0, cz, sx, 0.08, sz, 0.5, grey(0.6));
    gb.box('w:wood_dark', cx, y0 + 0.5, cz, alongX ? T : 0.06, 0.05, alongX ? 0.06 : T, 0.5, grey(0.55));
    for (let k = -1; k <= 1; k += 1) gb.box('w:wood_dark', cx + (alongX ? k * 0.7 : 0), y0 + 0.5, cz + (alongX ? 0 : k * 0.7), 0.07, 1.0, 0.07, 0.5, grey(0.55));
    addBox(cx, y0 + 0.55, cz, sx + 0.02, 1.1, sz + 0.02);
  }
  buildFloorTiles(rows, Y, false);
  if (upper) buildFloorTiles(upper, yUp, true);
  // stairs (visual + colliders): rise over `len` tiles
  const stairMeshes = [];
  for (const s of spec.stairs || []) {
    const steps = Math.round(s.len * T / 0.5), rise = s.rise / steps, run = 0.5;
    // 'n' only: climbs towards -z from the bottom edge (z + len) * T
    for (let i = 0; i < steps; i++) {
      const zc = wzT(s.z + s.len) - (i + 0.5) * run, xc = wxT(s.x) + (s.w * T) / 2, hy = rise * (i + 1);
      gb.box('f:wood_planks', xc, Y + hy / 2, zc, s.w * T, hy, run, 0.5, grey(0.62));
      addBox(xc, Y + hy / 2, zc, s.w * T, hy, run);
    }
    stairMeshes.push(s);
  }
  // shells: ground walls / ceilings / upper slab colliders (row-merged AABBs)
  const totalH = (upper ? spec.H + slab + spec.H : Math.max(spec.H, spec.tallH)) + 0.4;
  const runs = (r, pred, fn) => {
    for (let tz = 0; tz < Ht; tz++) {
      let x0 = -1;
      for (let tx = 0; tx <= Wt; tx++) {
        const on = tx < Wt && pred(tx, tz);
        if (on && x0 < 0) x0 = tx;
        if (!on && x0 >= 0) { fn(x0, tx, tz); x0 = -1; }
      }
    }
    void r;
  };
  // floor slab under every floor tile
  runs(rows, (x, z) => FLOOR_CH.has(chAt(rows, x, z)), (a, b, z) => addBox((wxT(a) + wxT(b)) / 2, Y - 0.5, wzT(z) + T / 2, (b - a) * T + 0.2, 1.0, T + 0.02));
  // ceilings (ground): consecutive tiles with the same height / same 'floor above' merge into one box
  runs(rows, (x, z) => FLOOR_CH.has(chAt(rows, x, z)), (a, b, z) => {
    let s0 = a;
    const key = (x) => { const ch = chAt(rows, x, z); return heightOf(ch) + (upper && FLOOR_CH.has(chAt(upper, x, z)) ? 'u' : ''); };
    for (let x = a + 1; x <= b; x++) {
      if (x < b && key(x) === key(s0)) continue;
      const ch = chAt(rows, s0, z); const under = upper && FLOOR_CH.has(chAt(upper, s0, z)); const top = Y + heightOf(ch);
      addBox((wxT(s0) + wxT(x)) / 2, top + (under ? slab / 2 : 0.15), wzT(z) + T / 2, (x - s0) * T, under ? slab + 0.3 : 0.3, T + 0.02);
      s0 = x;
    }
  });
  // walls: every non-floor tile that touches a floor tile (8-neighbourhood) gets a full-height box
  const touches = (r, x, z) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && FLOOR_CH.has(chAt(r, x + dx, z + dz))) return true; return false; };
  runs(rows, (x, z) => !FLOOR_CH.has(chAt(rows, x, z)) && chAt(rows, x, z) !== 'D' && touches(rows, x, z), (a, b, z) => addBox((wxT(a) + wxT(b)) / 2, Y + totalH / 2 - 0.5, wzT(z) + T / 2, (b - a) * T, totalH + 1, T));
  if (upper) {
    runs(upper, (x, z) => FLOOR_CH.has(chAt(upper, x, z)), (a, b, z) => addBox((wxT(a) + wxT(b)) / 2, yUp - 0.15, wzT(z) + T / 2, (b - a) * T, 0.3, T + 0.02));
    runs(upper, (x, z) => chAt(upper, x, z) === '#' && touches(upper, x, z), (a, b, z) => addBox((wxT(a) + wxT(b)) / 2, yUp + spec.H / 2, wzT(z) + T / 2, (b - a) * T, spec.H, T));
    runs(upper, (x, z) => FLOOR_CH.has(chAt(upper, x, z)), (a, b, z) => addBox((wxT(a) + wxT(b)) / 2, yUp + spec.H + 0.15, wzT(z) + T / 2, (b - a) * T, 0.3, T + 0.02));
  }
  const levelMesh = gb.build((key) => levelMaterial(key.split(':')[1], { vertexColors: true }));
  group.add(levelMesh);

  // ---------------- props by symbol
  const spots = { zombie: [], warden: [], loot: [], pistol: [], ammo: [], herb: [], typewriter: null, box: null, secret: [], chest: [], lamp: [] };
  const mat = (c, o2 = {}) => { const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: o2.em ?? 0 }); disposables.push(m); return m; };
  const bgeo = (sx, sy, sz) => { const g = new THREE.BoxGeometry(sx, sy, sz); disposables.push(g); return g; };
  const mbox = (parent, m, sx, sy, sz, x, y, z) => { const me = new THREE.Mesh(bgeo(sx, sy, sz), m); me.position.set(x, y, z); parent.add(me); return me; };
  const placeProp = (id, x, y, z, rotY, visualOnly = true) => {
    let obj;
    try { obj = createProp(id, { seed: rng.int(0, 99999), variant: rng.int(0, 3) }); } catch { return null; }
    obj.position.set(x, y, z); obj.rotation.y = rotY; group.add(obj); obj.updateMatrixWorld(true);
    if (!visualOnly) {
      const q = Math.round(rotY / (Math.PI / 2)) & 3;
      for (const c of obj.userData.colliders || []) {
        let [cx, cy, cz] = c.c; let [sx, sy, sz] = c.s;
        for (let k = 0; k < q; k++) { const t2 = cx; cx = cz; cz = -t2; const u = sx; sx = sz; sz = u; }
        addBox(x + cx, y + cy, z + cz, sx, sy, sz);
      }
    }
    return obj;
  };
  const lampCfg = LAMP[spec.style];
  const addLamp = (x, y, z, big = false) => {
    const e = { pos: new THREE.Vector3(x, y, z), color: lampCfg.color, intensity: lampCfg.intensity * (big ? 1.15 : 1), distance: lampCfg.distance * (big ? 1.25 : 1), flicker: lampCfg.flicker * (rng.chance(0.4) ? 1 : 0), group: 'facility' };
    lightPool.add(e); emitters.push(e);
    const fix = mbox(group, mat(0xffe9b0, { em: 0xffcc66 }), big ? 0.9 : 0.5, 0.08, big ? 0.9 : 0.5, x, y + 0.2, z);
    fix.material = new THREE.MeshBasicMaterial({ color: 0xfff2c8 }); disposables.push(fix.material);
    spots.lamp.push({ x, y, z });
  };
  const decor = (tx, tz, ch) => {
    const cx = wxT(tx) + T / 2, cz = wzT(tz) + T / 2, base = Y;
    const H0 = heightOf(chAt(rows, tx, tz));
    switch (ch) {
      case 'z': spots.zombie.push({ x: cx, y: base, z: cz, tx, tz }); break;
      case 'w': spots.warden.push({ x: cx, y: base, z: cz, tx, tz }); break;
      case 'p':   // the sidearm lies on a reception desk
        mbox(group, mat(0x5a4632), 1.5, 0.75, 0.8, cx, base + 0.375, cz); addBox(cx, base + 0.375, cz, 1.5, 0.75, 0.8);
        spots.pistol.push({ x: cx, y: base + 0.95, z: cz, tx, tz }); break;
      case 'a': spots.ammo.push({ x: cx, y: base + 0.15, z: cz, tx, tz }); break;
      case 'h': {
        mbox(group, mat(0x6a4a30), 0.34, 0.26, 0.34, cx, base + 0.13, cz);
        const leaves = new THREE.Group(); group.add(leaves);
        for (let i = 0; i < 6; i++) { const lf = mbox(leaves, mat(i % 2 ? 0x3aa84a : 0x50c25c, { em: 0x0a2a0e }), 0.36, 0.02, 0.14, cx, base + 0.34 + i * 0.03, cz); lf.rotation.y = i * 1.05; lf.rotation.z = 0.5; }
        spots.herb.push({ x: cx, y: base + 0.5, z: cz, tx, tz, id: spots.herb.length, leaves }); break; }
      case 'l': spots.loot.push({ x: cx, y: base + 0.2, z: cz, tx, tz, big: false }); break;
      case 'L': addLamp(cx, base + H0 - 0.5, cz, chAt(rows, tx, tz) === 'F' || spec.style === 'ballroom'); break;
      case 'T': {
        mbox(group, mat(0x3a2a1c), 1.5, 0.78, 0.9, cx, base + 0.39, cz); addBox(cx, base + 0.39, cz, 1.5, 0.78, 0.9);
        const tw = new THREE.Group(); tw.position.set(cx, base + 0.78, cz); group.add(tw);
        mbox(tw, mat(0x22262a), 0.46, 0.16, 0.34, 0, 0.08, 0); mbox(tw, mat(0x9aa0a8), 0.4, 0.04, 0.26, 0, 0.18, 0.02);
        mbox(tw, mat(0xf0ead8), 0.28, 0.2, 0.01, 0, 0.3, -0.12);
        spots.typewriter = { x: cx, y: base + 1.0, z: cz, tx, tz }; break; }
      case 'B': {
        const bx = mbox(group, mat(0x5a3a1c), 1.1, 0.7, 0.7, cx, base + 0.35, cz); void bx; addBox(cx, base + 0.35, cz, 1.1, 0.7, 0.7);
        mbox(group, mat(0x2a2a2a), 1.14, 0.06, 0.74, cx, base + 0.72, cz); mbox(group, mat(0xc02a2a), 0.4, 0.1, 0.02, cx, base + 0.5, cz + 0.36);
        spots.box = { x: cx, y: base + 0.8, z: cz, tx, tz }; break; }
      case 'C': {
        mbox(group, mat(0x6a4020), 1.05, 0.55, 0.65, cx, base + 0.275, cz); mbox(group, mat(0xc8a030), 1.08, 0.1, 0.68, cx, base + 0.6, cz); mbox(group, mat(0xc8a030), 0.12, 0.2, 0.03, cx, base + 0.4, cz + 0.34);
        addBox(cx, base + 0.4, cz, 1.05, 0.8, 0.65); spots.chest.push({ x: cx, y: base + 0.75, z: cz, tx, tz }); break; }
      case 'P': {
        const tall = heightOf(chAt(rows, tx, tz));
        gb0.box('w:wood_dark', cx, base + tall / 2, cz, 0.85, tall, 0.85, 0.5, grey(0.62));
        addBox(cx, base + tall / 2, cz, 0.85, tall, 0.85); break; }
      case '$': {
        gb0.box('w:crate_wood', cx, base + 1.3, cz, 1.05, 2.6, T - 0.05, 0.5, grey(0.7));
        addBox(cx, base + 1.3, cz, 1.05, 2.6, T - 0.05); break; }
      default: break;
    }
  };
  // extra geometry for pillars / shelves is merged into a second builder so it shares the level materials
  const gb0 = new GeoBuilder();
  for (let tz = 0; tz < Ht; tz++) for (let tx = 0; tx < Wt; tx++) {
    const ch = rows[tz][tx];
    if ('zwpahlLTBCP$'.includes(ch)) decor(tx, tz, ch);
    if (ch === 'D') {
      const cx = wxT(tx) + T / 2, cz = wzT(tz) + T / 2;
      // the secret door: a bookcase standing in the wall gap (slightly ajar). Collider removed when opened.
      const orient = FLOOR_CH.has(chAt(rows, tx, tz + 1)) || FLOOR_CH.has(chAt(rows, tx, tz - 1)) ? 0 : Math.PI / 2;
      const bc = new THREE.Group(); bc.position.set(cx, Y, cz); bc.rotation.y = orient; group.add(bc);
      mbox(bc, mat(0x3a2414), 1.9, 2.5, 0.5, 0, 1.25, 0);
      for (let s = 0; s < 4; s++) mbox(bc, mat(0x1a100a), 1.8, 0.05, 0.42, 0, 0.5 + s * 0.6, 0.02);
      for (let s = 0; s < 9; s++) mbox(bc, mat([0x8a2a2a, 0x2a4a7a, 0x3a6a3a, 0x8a7a2a][s % 4]), 0.16, 0.34, 0.3, -0.75 + s * 0.19, 0.72 + (s % 3) * 0.6, 0.02);
      const col = addBox(cx, Y + 1.3, cz, orient ? 0.6 : T, 2.6, orient ? T : 0.6);
      spots.secret.push({ i: spots.secret.length, x: cx, y: Y + 1.3, z: cz, tx, tz, obj: bc, col, orient, open: false });
    }
    if (upper) {
      const uch = upper[tz][tx];
      if ('lLC'.includes(uch)) {
        const cx = wxT(tx) + T / 2, cz = wzT(tz) + T / 2;
        if (uch === 'l') spots.loot.push({ x: cx, y: yUp + 0.2, z: cz, tx, tz, big: false, upper: true });
        else if (uch === 'L') addLamp(cx, yUp + spec.H - 0.5, cz, chAt(upper, tx, tz) === 'F');
        else { mbox(group, mat(0x6a4020), 1.05, 0.55, 0.65, cx, yUp + 0.275, cz); mbox(group, mat(0xc8a030), 1.08, 0.1, 0.68, cx, yUp + 0.6, cz); addBox(cx, yUp + 0.4, cz, 1.05, 0.8, 0.65); spots.chest.push({ x: cx, y: yUp + 0.75, z: cz, tx, tz, upper: true }); }
      }
      if (uch === 'D') {
        const cx = wxT(tx) + T / 2, cz = wzT(tz) + T / 2;
        const orient = FLOOR_CH.has(chAt(upper, tx, tz + 1)) || FLOOR_CH.has(chAt(upper, tx, tz - 1)) ? 0 : Math.PI / 2;
        const bc = new THREE.Group(); bc.position.set(cx, yUp, cz); bc.rotation.y = orient; group.add(bc);
        mbox(bc, mat(0x3a2414), 1.9, 2.5, 0.5, 0, 1.25, 0);
        for (let s = 0; s < 4; s++) mbox(bc, mat(0x1a100a), 1.8, 0.05, 0.42, 0, 0.5 + s * 0.6, 0.02);
        const col = addBox(cx, yUp + 1.3, cz, orient ? 0.6 : T, 2.6, orient ? T : 0.6);
        spots.secret.push({ i: spots.secret.length, x: cx, y: yUp + 1.3, z: cz, tx, tz, obj: bc, col, orient, open: false, upper: true });
      }
    }
  }
  // chest tiles are also loot spots (bigger rewards)
  for (const c of spots.chest) spots.loot.push({ x: c.x, y: c.y, z: c.z, tx: c.tx, tz: c.tz, big: true, upper: c.upper });
  group.add(gb0.build((key) => levelMaterial(key.split(':')[1], { vertexColors: true })));
  // ---------------- dressing: props against walls (visual only, seeded)
  const dress = DRESS[spec.style] || {};
  const dressFloor = (r, y0, isUpper) => {
    for (let tz = 0; tz < Ht; tz++) for (let tx = 0; tx < Wt; tx++) {
      const ch = chAt(r, tx, tz);
      if (!'.,sF'.includes(ch) || (!isUpper && 'rX'.includes(ch))) continue;
      const list = dress[ch]; if (!list || !list.length) continue;
      // only tiles that touch exactly one wall side and are not next to a doorway-ish opening
      let side = -1, walls = 0;
      for (let d = 0; d < 4; d++) if (!FLOOR_CH.has(chAt(r, tx + DX[d], tz + DZ[d]))) { side = d; walls++; }
      if (walls !== 1 || !rng.chance(0.16)) continue;
      const cx = wxT(tx) + T / 2 + DX[side] * 0.55, cz = wzT(tz) + T / 2 + DZ[side] * 0.55;
      const rot = side === 3 ? 0 : side === 1 ? Math.PI : side === 0 ? -Math.PI / 2 : Math.PI / 2;
      placeProp(rng.pick(list), cx, y0, cz, rot, true);
    }
  };
  dressFloor(rows, Y, false);
  if (upper) dressFloor(upper, yUp, true);
  // grand chandelier + fireplace glow for the mansion foyer; blood pools for the outbreak wing
  if (spec.style === 'mansion') { const ch = placeProp('chandelier', wxT(20), Y + spec.tallH - 0.1, wzT(15), 0); void ch; }
  if (spec.style === 'outbreak') {
    const bl = new GeoBuilder();
    for (let i = 0; i < 18; i++) {
      const tx = rng.int(1, Wt - 2), tz = rng.int(1, Ht - 2), ch = rows[tz][tx];
      if (!'.,'.includes(ch)) continue;
      const cx = wxT(tx) + rng.float(0.3, 1.7), cz = wzT(tz) + rng.float(0.3, 1.7), r = rng.float(0.35, 0.9);
      bl.hrect('f:blood_splat', cx - r, cz - r, cx + r, cz + r, Y + 0.012 + i * 0.0005, true, 1 / (r * 2), grey(0.9));
    }
    const bm = bl.build((key) => levelMaterial(key.split(':')[1], { vertexColors: true, transparent: true }));
    bm.traverse((m2) => { if (m2.material) { m2.material = m2.material.clone(); m2.material.transparent = true; m2.material.depthWrite = false; m2.material.polygonOffset = true; m2.material.polygonOffsetFactor = -2; disposables.push(m2.material); } });
    group.add(bm);
  }
  // ---------------- nav (creatures): 2 m tiles, closed edges around walls / props / the alcove / the safe room
  const cells = new Uint8Array(Wt * Ht);
  const walkable = (ch) => '.,FrzwalL'.includes(ch);   // (planters, desks, chests ... block the creature nav)
  for (let tz = 0; tz < Ht; tz++) for (let tx = 0; tx < Wt; tx++) if (walkable(rows[tz][tx])) cells[tz * Wt + tx] = 1;
  for (const s of spec.stairs || []) for (let i = 0; i < s.len; i++) for (let k = 0; k < s.w; k++) cells[(s.z + i) * Wt + s.x + k] = 0;
  if (spec.safe) { const [sx, sz, sw, sh] = spec.safe; for (let tz = sz; tz < sz + sh; tz++) for (let tx = sx; tx < sx + sw; tx++) cells[tz * Wt + tx] = 0; }
  const ek = edgeKeyFor(Wt);
  const open = new Set();
  for (let tz = 0; tz < Ht; tz++) for (let tx = 0; tx < Wt; tx++) {
    if (!cells[tz * Wt + tx]) continue;
    if (tx + 1 < Wt && cells[tz * Wt + tx + 1]) open.add(ek(tx, tz, 0));
    if (tz + 1 < Ht && cells[(tz + 1) * Wt + tx]) open.add(ek(tx, tz, 1));
  }
  const navLayout = { cell: T, w: Wt, h: Ht, ox, oz, y: Y, cells, edgeKey: ek, open, edgeInfo: new Map(), idx: (x, z) => z * Wt + x };
  const nav = new TileNav(navLayout, 1);
  // ---------------- runtime
  const box3 = new THREE.Box3(new THREE.Vector3(ox - 4, Y - 8, oz - 4), new THREE.Vector3(ox + Wt * T + 4, Y + 30, oz + Ht * T + 4));
  const pocket = {
    spec, group, ox, oz, y: Y, W: Wt, H: Ht, nav, spots, upperY: yUp,
    contains(p) { return p.x >= box3.min.x && p.x <= box3.max.x && p.z >= box3.min.z && p.z <= box3.max.z && p.y >= box3.min.y && p.y <= box3.max.y; },
    tile(tx, tz, upperFloor = false) { return { x: wxT(tx) + T / 2, y: upperFloor ? yUp : Y, z: wzT(tz) + T / 2 }; },
    /** closet frame on the pocket side: door plane centre, facing into the pocket, alcove depth */
    entry() {
      const e = spec.entry, c = { x: wxT(e.x) + T / 2, z: wzT(e.z) + T / 2 };
      const wallX = c.x - e.fx * (T / 2), wallZ = c.z - e.fz * (T / 2);   // back of the alcove
      return { wallX, wallZ, fx: e.fx, fz: e.fz, y: Y, depth: T, doorX: c.x + e.fx * (T / 2), doorZ: c.z + e.fz * (T / 2), width: T };
    },
    setSecretOpen(i, v) {
      const s = spots.secret[i]; if (!s || s.open === v) return;
      s.open = v;
      if (v && s.col) { physics.removeCollider(s.col); const k = colliders.indexOf(s.col); if (k >= 0) colliders.splice(k, 1); s.col = null; }
      s.anim = v ? 1 : 0; s.at = 0;
    },
    update(dt) {
      for (const s of spots.secret) if (s.anim) { s.at = Math.min(1, (s.at || 0) + dt * 1.2); const e = s.at * s.at * (3 - 2 * s.at); const dx = s.orient ? 0 : 1.6 * e, dz = s.orient ? 1.6 * e : 0; s.obj.position.set(s.x + dx, s.obj.position.y, s.z + dz); if (s.at >= 1) s.anim = 0; }
      for (const a of anims) a(dt);
    },
    dispose() {
      for (const c of colliders) physics.removeCollider(c);
      colliders.length = 0;
      for (const e of emitters) lightPool.remove(e);
      emitters.length = 0;
      group.traverse((m2) => { if (m2.geometry && !m2.geometry.userData?.shared) m2.geometry.dispose(); });
      for (const d of disposables) d.dispose?.();
      group.removeFromParent();
    },
  };
  return pocket;
}
export const pocketOrigin = (index) => ({ ox: POCKET_ORIGIN_X + index * POCKET_SLOT, oz: 0 });
