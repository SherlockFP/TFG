// Ship "Mini-Skeld" decoration (wave 4, ship2): partitions with rounded door frames, floor tints + guide stripes, room signs, crates, planter pots,
// reactor, cockpit window frame, rounded nose. Everything static is merged (a handful of draw calls); colliders come from world/shiplayout.js.
// world/ship.js calls buildShipDeco() once; nothing here is animated except the reactor glow (a lightPool emitter, constant light count).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder, levelMaterial, levelTexture } from './geobuilder.js';
import { G } from '../physics/physics.js';
import * as L from './shiplayout.js';

const S = L.SHELL;
const C_BLUE = [0.2, 0.5, 0.95], C_ORANGE = [1.0, 0.52, 0.12], C_TEAL = [0.2, 0.75, 0.68], C_YELLOW = [0.95, 0.8, 0.12], C_WHITE = [0.92, 0.92, 0.88], C_DARK = [0.22, 0.24, 0.27];
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** merge THREE geometries with a per-part vertex colour into one BufferGeometry: parts = [{g, p:[x,y,z], r:[x,y,z], s:[x,y,z], c:[r,g,b]}] */
export function bakeParts(parts) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
  let list = [];
  for (const part of parts) {
    let g = part.g;
    const p = part.p || [0, 0, 0], r = part.r || [0, 0, 0], s = part.s || [1, 1, 1];
    m.compose(ps.set(p[0], p[1], p[2]), q.setFromEuler(e.set(r[0], r[1], r[2])), sc.set(s[0], s[1], s[2]));
    g.applyMatrix4(m);
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = part.c || [1, 1, 1];
    for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    list.push(g);
  }
  list = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}

function signAtlas(signs) {
  if (typeof document === 'undefined') return null;
  const cw = 256, ch = 80, cols = 2, rows = Math.ceil(signs.length / cols);
  const cv = document.createElement('canvas'); cv.width = cw * cols; cv.height = ch * rows;
  const x = cv.getContext('2d');
  if (!x) return null;
  signs.forEach((sg, i) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    x.fillStyle = '#15181c'; x.fillRect(ox, oy, cw, ch);
    x.fillStyle = sg.c;
    const r = 14; x.beginPath(); x.moveTo(ox + 6 + r, oy + 6); x.lineTo(ox + cw - 6 - r, oy + 6); x.quadraticCurveTo(ox + cw - 6, oy + 6, ox + cw - 6, oy + 6 + r); x.lineTo(ox + cw - 6, oy + ch - 6 - r); x.quadraticCurveTo(ox + cw - 6, oy + ch - 6, ox + cw - 6 - r, oy + ch - 6); x.lineTo(ox + 6 + r, oy + ch - 6); x.quadraticCurveTo(ox + 6, oy + ch - 6, ox + 6, oy + ch - 6 - r); x.lineTo(ox + 6, oy + 6 + r); x.quadraticCurveTo(ox + 6, oy + 6, ox + 6 + r, oy + 6); x.closePath(); x.fill();
    x.fillStyle = '#fff8e8'; x.font = `bold ${sg.fontSize || 38}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sg.text, ox + cw / 2, oy + ch / 2 + 2);
  });
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, cols, rows };
}

/** [wave5] wall with rectangular holes, built as a grid WITHOUT T-junctions: every column is split at every hole edge, so no vertex of one quad sits in the
 * middle of a neighbour's edge (with the PSX vertex snap those T-junctions opened into dotted see-through seams, e.g. above the cockpit window).
 * ax 'x': the wall runs along x at z = fixed; ax 'z': along z at x = fixed. a0 -> a1 = direction (vrect faces the left-hand normal of it).
 * holes: [{ s, e, y0, y1 }] in world units (s < e). */
export function gridWall(gb, key, ax, fixed, a0, a1, y0, y1, uv, holes, color) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const hs = holes.map((h) => ({ s: Math.max(lo, h.s), e: Math.min(hi, h.e), y0: Math.max(y0, h.y0), y1: Math.min(y1, h.y1) })).filter((h) => h.e - h.s > 1e-4 && h.y1 - h.y0 > 1e-4);
  const xs = [...new Set([lo, hi, ...hs.flatMap((h) => [h.s, h.e])].map((v) => +v.toFixed(5)))].sort((p, q) => p - q);
  const ys = [...new Set([y0, y1, ...hs.flatMap((h) => [h.y0, h.y1])].map((v) => +v.toFixed(5)))].sort((p, q) => p - q);
  const dir = a1 >= a0 ? 1 : -1;
  for (let i = 0; i + 1 < xs.length; i++) {
    const p = xs[i], q = xs[i + 1];
    for (let j = 0; j + 1 < ys.length; j++) {
      const ya = ys[j], yb = ys[j + 1], mx = (p + q) / 2, my = (ya + yb) / 2;
      if (hs.some((h) => mx > h.s && mx < h.e && my > h.y0 && my < h.y1)) continue;
      const [u, v] = dir > 0 ? [p, q] : [q, p];
      if (ax === 'z') gb.vrect(key, fixed, u, fixed, v, ya, yb, uv, color, Math.abs(u - a0));
      else gb.vrect(key, u, fixed, v, fixed, ya, yb, uv, color, Math.abs(u - a0));
    }
  }
}
/** shell wall with rectangular holes {x0, x1, y0, y1} along x at z (kept for callers; now a gridWall) */
export function holedWall(gb, key, z, a0, a1, y0, y1, uv, holes, color) {
  gridWall(gb, key, 'x', z, a0, a1, y0, y1, uv, holes.map((h) => ({ s: h.x0, e: h.x1, y0: h.y0, y1: h.y1 })), color);
}

export function buildShipDeco({ physics, lightPool, group, signs = L.SIGNS }) {
  const colliders = [], emitters = [], disposables = [];
  const box = (x, y, z, sx, sy, sz, member = G.STATIC, data) => { const c = physics.addStaticBox(x, y, z, sx / 2, sy / 2, sz / 2, 0, member, data); colliders.push(c); return c; };
  const obstacles = [];
  const obst = (x0, x1, z0, z1, y0, y1) => obstacles.push({ min: [x0, y0, z0], max: [x1, y1, z1] });

  // ---- partitions (walls are textured ship_wall tinted per room; the accent bands / posts sit on top)
  const gb = new GeoBuilder();
  const tintOf = (id) => (id.startsWith('cockpit') ? [0.82, 0.9, 1.0] : [1.0, 0.9, 0.78]);
  for (const p of L.PARTITIONS) {
    const sx = p.x1 - p.x0, sy = p.y1 - p.y0, sz = p.z1 - p.z0;
    gb.box('ship_wall', (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2, sx, sy, sz, 0.5, tintOf(p.id));
    if (p.y1 - p.y0 > 3.3 || p.id.endsWith('H')) { /* wall or header */ }
    box((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2, sx, sy, sz);
    obst(p.x0, p.x1, p.z0, p.z1, p.y0, p.y1);
  }
  // accent bands: a coloured strip under each header + a dado along the bottom of every partition side
  const band = (cx, cy, cz, sx, sy, sz, c) => gb.box('plain', cx, cy, cz, sx, sy, sz, 0.5, c);
  band(-4.0, 2.44, 0, 0.24, 0.12, 2.0, C_BLUE);                                   // cockpit hatch header band
  band(3.2, 2.44, (S.z0 + L.ENGINE_Z) / 2, 0.24, 0.12, L.ENGINE_Z - S.z0, C_ORANGE);   // engine arch band
  for (const s of [-1, 1]) {
    band(-4.0 + s * 0.09, 0.14, (S.z0 - 1.0) / 2, 0.03, 0.22, -1.0 - S.z0, C_BLUE);
    band(-4.0 + s * 0.09, 0.14, (1.0 + S.z1) / 2, 0.03, 0.22, S.z1 - 1.0, C_BLUE);
  }
  for (const s of [-1, 1]) band(5.1, 0.14, L.ENGINE_Z + s * 0.09, 3.8, 0.22, 0.03, C_ORANGE);
  // rounded door-frame posts + caps
  const parts = [];
  const cyl = (r, h, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);
  for (const p of L.POSTS) {
    parts.push({ g: cyl(0.12, 2.5), p: [p.x, 1.25, p.z], c: C_WHITE });
    parts.push({ g: new THREE.SphereGeometry(0.16, 12, 8), p: [p.x, 2.5, p.z], c: p.id === 'engineP' ? C_ORANGE : C_BLUE });
    parts.push({ g: cyl(0.15, 0.08), p: [p.x, 0.04, p.z], c: C_DARK });
    box(p.x, 1.25, p.z, 0.24, 2.5, 0.24);
    obst(p.x - 0.14, p.x + 0.14, p.z - 0.14, p.z + 0.14, 0, 2.6);
  }
  // cockpit window: rounded frame (four bars + corner balls)
  const wz0 = -2.4, wz1 = 2.4, wy0 = 1.15, wy1 = 2.75;
  for (const zz of [wz0, wz1]) parts.push({ g: cyl(0.07, wy1 - wy0), p: [S.x0 + 0.05, (wy0 + wy1) / 2, zz], c: C_WHITE });
  for (const yy of [wy0, wy1]) parts.push({ g: cyl(0.07, wz1 - wz0), p: [S.x0 + 0.05, yy, 0], r: [Math.PI / 2, 0, 0], c: C_WHITE });
  for (const zz of [wz0, wz1]) for (const yy of [wy0, wy1]) parts.push({ g: new THREE.SphereGeometry(0.1, 10, 8), p: [S.x0 + 0.05, yy, zz], c: C_BLUE });
  // +z clerestory windows: interior frames
  for (const w of L.WINDOWS_Z) {
    const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2, fz = S.z1 - 0.03;
    parts.push({ g: new THREE.BoxGeometry(w.x1 - w.x0 + 0.12, 0.07, 0.06), p: [cx, w.y0 - 0.02, fz], c: C_WHITE });
    parts.push({ g: new THREE.BoxGeometry(w.x1 - w.x0 + 0.12, 0.07, 0.06), p: [cx, w.y1 + 0.02, fz], c: C_WHITE });
    for (const xx of [w.x0 - 0.02, w.x1 + 0.02]) parts.push({ g: new THREE.BoxGeometry(0.07, w.y1 - w.y0 + 0.14, 0.06), p: [xx, cy, fz], c: C_WHITE });
    for (const [xx, yy] of [[w.x0 - 0.02, w.y0 - 0.02], [w.x1 + 0.02, w.y0 - 0.02], [w.x0 - 0.02, w.y1 + 0.02], [w.x1 + 0.02, w.y1 + 0.02]]) parts.push({ g: new THREE.SphereGeometry(0.06, 8, 6), p: [xx, yy, fz], c: C_TEAL });
    obst(w.x0 - 0.1, w.x1 + 0.1, S.z1 - 0.08, S.z1, w.y0 - 0.1, w.y1 + 0.1);
  }
  // ---- engine room: reactor core, pipes, wall panels
  const R = L.SPOTS.reactor;
  if (R) {
    parts.push({ g: cyl(0.5, 0.22, 16), p: [R.x, 0.11, R.z], c: C_DARK });
    parts.push({ g: cyl(0.4, 0.14, 16), p: [R.x, 2.5, R.z], c: C_DARK });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; parts.push({ g: cyl(0.045, 2.5, 6), p: [R.x + Math.cos(a) * 0.4, 1.25, R.z + Math.sin(a) * 0.4], c: C_WHITE }); }
    parts.push({ g: cyl(0.1, 0.9, 8), p: [R.x, 2.95, R.z], c: C_DARK });                      // feed pipe into the ceiling
    const wallZ = L.ENGINE_Z - 0.08;   // engine-room face of the bulkhead
    for (const yy of [1.0, 1.55]) parts.push({ g: cyl(0.05, 3.4, 8), p: [5.3, yy, wallZ - 0.07], r: [0, 0, Math.PI / 2], c: yy < 1.2 ? C_ORANGE : C_WHITE });   // pipes along the engine wall
    parts.push({ g: new THREE.BoxGeometry(0.9, 0.7, 0.06), p: [4.2, 1.9, wallZ - 0.03], c: C_DARK });   // wall junction box
    obst(R.x - 0.55, R.x + 0.55, R.z - 0.55, R.z + 0.55, 0, 2.7);
    box(R.x, 1.3, R.z, 1.0, 2.6, 1.0);
  }
  // ---- cargo crates + planter pots (static parts; ship2 grows the plants)
  const wood = hex(0x8a6a3c), band2 = C_YELLOW, pot = hex(0xb8682c), soil = hex(0x3a2a1c);
  for (const d of L.DECOR) {
    const y0 = d.y || 0;
    if (d.planter) {
      parts.push({ g: new THREE.CylinderGeometry(d.w * 0.5, d.w * 0.4, d.h, 12), p: [d.x, y0 + d.h / 2, d.z], c: pot });
      parts.push({ g: new THREE.CylinderGeometry(d.w * 0.44, d.w * 0.44, 0.04, 12), p: [d.x, y0 + d.h - 0.03, d.z], c: soil });
      parts.push({ g: new THREE.TorusGeometry(d.w * 0.5, 0.03, 6, 14), p: [d.x, y0 + d.h - 0.01, d.z], r: [Math.PI / 2, 0, 0], c: C_TEAL });
    } else {
      parts.push({ g: new THREE.BoxGeometry(d.w, d.h, d.d), p: [d.x, y0 + d.h / 2, d.z], c: wood });
      parts.push({ g: new THREE.BoxGeometry(d.w + 0.02, 0.06, d.d + 0.02), p: [d.x, y0 + d.h * 0.5, d.z], c: band2 });
      parts.push({ g: new THREE.BoxGeometry(d.w + 0.02, d.h + 0.02, 0.06), p: [d.x, y0 + d.h / 2, d.z], c: band2 });
    }
    if (!y0) box(d.x, d.h / 2, d.z, d.w, d.h, d.d);
    obst(d.x - d.w / 2, d.x + d.w / 2, d.z - d.d / 2, d.z + d.d / 2, y0, y0 + d.h + (d.planter ? 1.2 : 0));
  }
  const bakedGeo = bakeParts(parts);
  const bakedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bakedMesh = new THREE.Mesh(bakedGeo, bakedMat); bakedMesh.name = 'ship2_deco';
  group.add(bakedMesh);
  disposables.push(bakedGeo, bakedMat);
  // reactor core glow (emissive, unlit) + one pooled light
  if (R) {
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x66ffd8 }), coreGeo = new THREE.CylinderGeometry(0.26, 0.26, 1.8, 12);
    const core = new THREE.Mesh(coreGeo, coreMat); core.position.set(R.x, 1.3, R.z); core.name = 'reactorCore'; group.add(core);
    disposables.push(coreGeo, coreMat);
    emitters.push(lightPool.add({ pos: new THREE.Vector3(R.x - 0.2, 1.4, R.z + 0.5), color: 0x66ffd8, intensity: 0.7, distance: 5.5, group: 'ship' }));
    group.userData.reactorCore = core;
  }
  // ---- walls / trims mesh
  const plainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  disposables.push(plainMat);
  const wallMesh = gb.build((key) => (key === 'plain' ? plainMat : levelMaterial(key, { vertexColors: true })));
  wallMesh.name = 'ship2_partitions';
  group.add(wallMesh);

  // ---- floor (wave 5): the tinted room rects ARE the floor (world/ship.js no longer builds a second floor under them), guide stripes + the door
  // hazard strip sit 6 mm above it. All flat layers skip the PSX vertex snap and use polygon offsets (like homeworld_map.js flatLayer):
  // snapped coplanar quads with different vertices used to shimmer / z-fight at a distance.
  const flat = (mat, layer) => { mat.defines = { ...(mat.defines || {}), PSX_NOSNAP: '' }; const off = layer === 0 ? 1 : -layer * 8; mat.polygonOffset = true; mat.polygonOffsetFactor = off; mat.polygonOffsetUnits = off; return mat; };
  const gf = new GeoBuilder();
  for (const r of L.ROOM_TINTS) gf.hrect('ship_floor', r.x0, r.z0, r.x1, r.z1, 0, true, 0.5, r.c);
  for (const s of L.STRIPES) gf.hrect('stripe', s.x0, s.z0, s.x1, s.z1, 0.006, true, 1, s.c);
  const H = L.DOOR_HAZARD; gf.hrect('hazard', H.x0, H.z0, H.x1, H.z1, 0.006, true, 0.8);
  const decalMats = {
    ship_floor: flat(new THREE.MeshLambertMaterial({ map: levelTexture('ship_floor'), vertexColors: true }), 0),
    stripe: flat(new THREE.MeshBasicMaterial({ vertexColors: true }), 1),
    hazard: flat(new THREE.MeshLambertMaterial({ map: levelTexture('hazard_stripes') }), 1),
  };
  const floorMesh = gf.build((key) => decalMats[key]);
  floorMesh.name = 'ship2_floor';
  group.add(floorMesh);
  disposables.push(...Object.values(decalMats));

  // ---- room signs (one atlas, one mesh)
  const atlas = signAtlas(signs);
  if (atlas) {
    const pos = [], uv = [], idx = [];
    signs.forEach((sg, i) => {
      const hw = 0.45, hh = 0.16, nx = Math.sin(sg.ry), nz = Math.cos(sg.ry), ux = Math.cos(sg.ry), uz = -Math.sin(sg.ry);
      const cx = sg.x + nx * (sg.off ?? 0), cz = sg.z + nz * (sg.off ?? 0);
      const base = pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(cx + ux * hw * su, sg.y + hh * sv, cz + uz * hw * su);
      const c = i % atlas.cols, r = Math.floor(i / atlas.cols), u0 = c / atlas.cols, u1 = (c + 1) / atlas.cols, v1 = 1 - r / atlas.rows, v0 = 1 - (r + 1) / atlas.rows;
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'ship2_signs'; group.add(mesh);
    disposables.push(geo, mat, atlas.tex);
    for (const sg of signs) {
      const n = Math.abs(Math.sin(sg.ry)) > 0.5, cx = sg.x + Math.sin(sg.ry) * (sg.off ?? 0), cz = sg.z + Math.cos(sg.ry) * (sg.off ?? 0);
      obst(cx - (n ? 0.02 : 0.45), cx + (n ? 0.02 : 0.45), cz - (n ? 0.45 : 0.02), cz + (n ? 0.45 : 0.02), sg.y - 0.16, sg.y + 0.16);
    }
  }
  return {
    colliders, emitters, obstacles,
    dispose() { for (const d of disposables) { try { d.dispose?.(); } catch { /* ignore */ } } },
  };
}
