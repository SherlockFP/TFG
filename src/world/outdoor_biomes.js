// Biome set dressing for the generated-sector biomes (see BIOMES in game/moons.js, field `decor`):
//   datascape   neon wireframe grid draped over the terrain, dark monoliths with glowing bands, floating glitch cubes
//   servermarsh flood water sheet, half-sunken tilted server racks with blinking status lights, cables floating in the water
//   ashfield    burnt / fallen rack husks, smouldering fires with smoke plumes and scorch marks
//   crystal     glowing crystal clusters, a few huge spires lighting the valley, tiny shards everywhere
//
// Everything is instanced or merged (a handful of draw calls per biome), lights go through the light pool
// (emitters only, never new THREE lights), and placement uses its own RNG stream from the moon seed, so the
// layout (and the colliders) is identical on every peer. Purely visual animation may use Math.random.
//
// buildBiomeDecor(ctx) -> { scrapSpots:[{x,z}], update(dt, game), dispose() }
//   ctx = { seed, moon, biome, terrain, plan, group, addBox, avoid, emitters, sc }
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { createAnyProp } from './propfactory.js';
import { levelTexture } from './geobuilder.js';
import { getTexture, getBasicMaterial, makeCanvasTexture } from '../render/textures.js';

const TAU = Math.PI * 2;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

export function buildBiomeDecor(ctx) {
  const kind = ctx.biome?.decor;
  const B = BUILDERS[kind];
  if (!B) return null;
  const C = {
    ...ctx,
    R: new RNG(((ctx.seed | 0) ^ 0xb10e5 ^ (kind.length * 7919)) >>> 0),
    lim: 120 * (ctx.sc || 1),
    geos: [], mats: [], texs: [], objs: [], updaters: [], scrapSpots: [],
    t: 0,
  };
  C.h = (x, z) => ctx.terrain.heightAt(x, z);
  C.own = (o) => { if (o.geometry) C.geos.push(o.geometry); return o; };
  C.mat = (m) => { C.mats.push(m); return m; };
  C.add = (o) => { ctx.group.add(o); C.objs.push(o); return o; };
  // random free spot (not on the ship clearing / path / exits / ponds); null after tries
  C.spot = (margin = 2, tries = 14, test = null) => {
    for (let t = 0; t < tries; t++) {
      const x = C.R.float(-C.lim, C.lim), z = C.R.float(-C.lim, C.lim);
      if (ctx.avoid(x, z, margin)) continue;
      if (test && !test(x, z)) continue;
      return { x, z };
    }
    return null;
  };
  try {
    B(C);
  } catch (err) {
    disposeAll(C);
    throw err;
  }
  return {
    kind,
    scrapSpots: C.scrapSpots,
    update(dt, game) {
      C.t += dt;
      for (const u of C.updaters) u(dt, C.t, game);
    },
    dispose() { disposeAll(C); },
  };
}

function disposeAll(C) {
  for (const o of C.objs) o.removeFromParent();
  for (const g of C.geos) g.dispose();
  for (const m of C.mats) m.dispose();
  for (const t of C.texs) t.dispose();
  C.objs.length = 0; C.geos.length = 0; C.mats.length = 0; C.texs.length = 0; C.updaters.length = 0;
}

// ------------------------------------------------------------------ shared helpers
/** InstancedMesh from a list of { x, y, z, rx, ry, rz, sx, sy, sz, color? } */
function instanced(C, geo, mat, list, { owned = true, colors = false } = {}) {
  if (!list.length) return null;
  const inst = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((p, i) => {
    _q.setFromEuler(_e.set(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ'));
    _s.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
    _m4.compose(_p.set(p.x, p.y, p.z), _q, _s);
    if (p.local) _m4.multiply(p.local);
    inst.setMatrixAt(i, _m4);
    if (colors) inst.setColorAt(i, new THREE.Color(p.color ?? 0xffffff));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  if (owned) C.geos.push(geo);
  return C.add(inst);
}

/** Instanced copy of a procedural prop (every mesh of the prototype -> one InstancedMesh), full rotation. */
function instancedProp(C, id, list, tint = null) {
  if (!list.length) return;
  let proto;
  try { proto = createAnyProp(id, { seed: 7, variant: 0 }); } catch (e) { console.warn('decor prop', id, e); return; }
  proto.updateMatrixWorld(true);
  const tc = tint != null ? new THREE.Color(tint) : null;
  proto.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let mat = mesh.material;
    if (tc) mat = Array.isArray(mat) ? mat.map((m) => C.mat(tintClone(m, tc))) : C.mat(tintClone(mat, tc));
    instanced(C, mesh.geometry, mat, list.map((p) => ({ ...p, local: mesh.matrixWorld })), { owned: false });
  });
  proto.traverse((m) => { if (m.isMesh) C.geos.push(m.geometry); });   // prototype geometry is ours (not cached by props.js)
}
function tintClone(m, tc) { const c = m.clone(); c.color?.multiply(tc); return c; }

/** Merge non-indexed geometries (position + normal only). */
function mergeSimple(list) {
  let n = 0;
  const parts = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  for (const g of list) g.dispose();
  for (const g of parts) if (!list.includes(g)) g.dispose();
  return out;
}

/** Terrain-conforming disc (scorch marks). */
function groundDisc(C, cx, cz, radius, mat, lift = 0.06) {
  const segs = 12, rings = 2, pos = [], idx = [];
  const push = (x, z) => pos.push(x, C.h(x, z) + lift, z);
  push(cx, cz);
  for (let r = 1; r <= rings; r++) {
    const rr = (radius * r) / rings;
    for (let s = 0; s < segs; s++) { const a = (s / segs) * TAU; push(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr); }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let s = 0; s < segs; s++) { const s1 = (s + 1) % segs; idx.push(1 + s, 1 + s1, 1 + segs + s1, 1 + s, 1 + segs + s1, 1 + segs + s); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return C.add(C.own(new THREE.Mesh(g, mat)));
}

function emitter(C, x, y, z, color, intensity, distance, flicker = 0) {
  const e = { pos: new THREE.Vector3(x, y, z), color, intensity, distance, flicker, group: 'outdoor' };
  C.emitters.push(e);
  return e;
}

function softPuffTexture(C) {
  const tex = makeCanvasTexture(32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  if (tex) { tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; C.texs.push(tex); }
  return tex;
}

// ------------------------------------------------------------------ datascape
function buildDatascape(C) {
  const { R, biome: b, terrain, addBox, sc } = C;
  // 1. neon grid draped over the whole map (one LineSegments draw call)
  const lim = terrain.half - 4, spacing = 10, st = 2.5, lift = 0.16;
  const pts = [];
  for (let g = -Math.floor(lim / spacing) * spacing; g <= lim; g += spacing) {
    for (let t = -lim; t < lim - 0.01; t += st) {
      const t2 = Math.min(lim, t + st);
      pts.push(g, C.h(g, t) + lift, t, g, C.h(g, t2) + lift, t2);
      pts.push(t, C.h(t, g) + lift, g, t2, C.h(t2, g) + lift, g);
    }
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const gridMat = C.mat(new THREE.LineBasicMaterial({ color: b.grid ?? 0x2af4ff, transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
  const grid = C.add(C.own(new THREE.LineSegments(gg, gridMat)));
  grid.frustumCulled = false;
  const gridBase = new THREE.Color(b.grid ?? 0x2af4ff), gridAlt = new THREE.Color(0xff2ad8);
  let glitchT = 0, nextGlitch = 4;
  C.updaters.push((dt, t) => {
    nextGlitch -= dt;
    if (nextGlitch <= 0) { nextGlitch = 3 + Math.random() * 7; glitchT = 0.14 + Math.random() * 0.12; }
    glitchT = Math.max(0, glitchT - dt);
    gridMat.opacity = glitchT > 0 ? 0.9 : 0.42 + 0.14 * Math.sin(t * 1.3);
    gridMat.color.copy(glitchT > 0 ? gridAlt : gridBase);
  });

  // 2. monoliths with glowing bands (grounded ones collide)
  const NEON = [0x2af4ff, 0xff2ad8, 0xfff04a, 0x7a5cff];
  const monos = [], bands = [];
  const nMono = Math.round(70 * sc * sc);
  for (let i = 0; i < nMono; i++) {
    const p = C.spot(3);
    if (!p) continue;
    const giant = R.chance(0.08);
    const w = R.float(1.2, 2.6) * (giant ? 1.8 : 1), d = w * R.float(0.55, 1), hgt = giant ? R.float(16, 24) : R.float(3, 12);
    const ry = R.float(0, TAU);
    const float = !giant && R.chance(0.14);
    const y0 = C.h(p.x, p.z) - 0.3 + (float ? R.float(1.5, 4) : 0);
    const m = { x: p.x, y: y0, z: p.z, ry, sx: w, sy: float ? hgt * 0.4 : hgt, sz: d, float };
    monos.push(m);
    const col = NEON[R.int(0, NEON.length - 1)];
    const nb = R.int(1, 3);
    for (let k = 0; k < nb; k++) {
      const f = R.float(0.25, 0.95);
      bands.push({ x: p.x, y: y0 + m.sy * f, z: p.z, ry, sx: w * 1.05, sy: 0.12, sz: d * 1.05, color: col });
    }
    if (!float) addBox(p.x, y0 + hgt / 2, p.z, w, hgt, d, ry);
  }
  const monoGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const monoMat = C.mat(new THREE.MeshLambertMaterial({ map: levelTexture('metal_dark'), color: 0x363c5a }));
  instanced(C, monoGeo, monoMat, monos);
  const bandMat = C.mat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  instanced(C, new THREE.BoxGeometry(1, 1, 1), bandMat, bands, { colors: true });
  // light from the tallest grounded monoliths
  monos.filter((m) => !m.float).sort((a, z) => z.sy - a.sy).slice(0, Math.round(6 * sc)).forEach((m, i) => {
    emitter(C, m.x, m.y + m.sy + 1.2, m.z, NEON[i % 2], 1.3, 18, 0.08);
  });
  for (const m of monos.filter((q) => !q.float).slice(0, 2)) C.scrapSpots.push({ x: m.x + Math.cos(m.ry) * (m.sx / 2 + 1.4), z: m.z - Math.sin(m.ry) * (m.sx / 2 + 1.4) });

  // 3. floating glitch cubes (visual only, bob + spin, occasional teleport glitch)
  const cubes = [];
  const nCube = Math.round(70 * sc);
  for (let i = 0; i < nCube; i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (Math.hypot(x, z) < 20) continue;
    cubes.push({ x, y: C.h(x, z) + R.float(2.5, 15), z, s: R.float(0.35, 1.6), ry: R.float(0, TAU), rx: R.float(0, TAU), ph: R.float(0, TAU), color: NEON[R.int(0, NEON.length - 1)] });
  }
  const cubeMat = C.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  const cubeMesh = instanced(C, new THREE.BoxGeometry(1, 1, 1), cubeMat, cubes, { colors: true });
  if (cubeMesh) {
    cubeMesh.frustumCulled = false;
    C.updaters.push((dt, t, game) => {
      const cam = game?.camera?.position;
      if (cam && cam.y < -100) return;   // inside the facility: nothing to animate
      for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i];
        if (Math.random() < 0.0008) { c.x += (Math.random() - 0.5) * 6; c.z += (Math.random() - 0.5) * 6; }   // glitch hop
        _q.setFromEuler(_e.set(c.rx + t * 0.4, c.ry + t * 0.6, 0));
        _s.setScalar(c.s * (1 + 0.08 * Math.sin(t * 3 + c.ph)));
        _m4.compose(_p.set(c.x, c.y + Math.sin(t * 0.8 + c.ph) * 0.6, c.z), _q, _s);
        cubeMesh.setMatrixAt(i, _m4);
      }
      cubeMesh.instanceMatrix.needsUpdate = true;
    });
  }
}

// ------------------------------------------------------------------ flooded server marsh
function buildServerMarsh(C) {
  const { R, biome: b, terrain, addBox, sc } = C;
  const flood = b.flood ?? -2;
  // 1. water sheet over the whole map (valleys are wade-deep, see Terrain.rawHeight)
  const size = terrain.half * 2;
  const wtex0 = getTexture('water');
  let wtex = null;
  if (wtex0) { wtex = wtex0.clone(); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(size / 9, size / 9); wtex.needsUpdate = true; C.texs.push(wtex); }
  const wmat = C.mat(new THREE.MeshLambertMaterial({ map: wtex, color: b.waterColor ?? 0x4a6a60, transparent: true, opacity: 0.74, depthWrite: false }));
  const water = C.add(C.own(new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), wmat)));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, flood, 0);
  water.renderOrder = 2;
  if (wtex) C.updaters.push((dt) => { wtex.offset.x = (wtex.offset.x + dt * 0.006) % 1; wtex.offset.y = (wtex.offset.y + dt * 0.004) % 1; });

  // 2. half-sunken server racks (prefer the flooded low ground), tilted
  const racks = [];
  const nRack = Math.round(46 * sc * sc);
  for (let i = 0; i < nRack; i++) {
    const p = C.spot(2, 16, (x, z) => C.h(x, z) < flood + 0.5 || R.chance(0.15));
    if (!p) continue;
    const ry = R.float(0, TAU), y = C.h(p.x, p.z) - R.float(0.2, 0.7);
    racks.push({ x: p.x, y, z: p.z, ry, rx: R.float(-0.28, 0.28), rz: R.float(-0.28, 0.28), s: R.float(0.95, 1.2) });
    addBox(p.x, y + 1.0, p.z, 0.7, 2.0, 1.05, ry);
  }
  instancedProp(C, 'server_rack_prop', racks, 0xa4b0a4);
  // blinking status lights on some racks
  const LED = [0x40ff80, 0xff3030, 0xffb030];
  racks.slice(0, Math.round(9 * sc)).forEach((r, i) => emitter(C, r.x, r.y + 2.3, r.z, LED[i % 3], 0.8, 6.5, 0.55));
  // 3. cables floating between nearby racks
  const cables = [];
  for (let i = 0; i < racks.length && cables.length < 26 * sc; i++) {
    const a = racks[i], bb = racks[(i + 1 + R.int(0, 3)) % racks.length];
    const dx = bb.x - a.x, dz = bb.z - a.z, len = Math.hypot(dx, dz);
    if (len < 3 || len > 16) continue;
    const ya = Math.max(C.h(a.x, a.z), flood) + 0.04, yb = Math.max(C.h(bb.x, bb.z), flood) + 0.04;
    const dir = new THREE.Vector3(dx, yb - ya, dz);
    const L = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, dir);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    cables.push({ x: (a.x + bb.x) / 2, y: (ya + yb) / 2, z: (a.z + bb.z) / 2, rx: e.x, ry: e.y, rz: e.z, sx: 1, sy: L, sz: 1 });
  }
  instanced(C, new THREE.CylinderGeometry(0.07, 0.07, 1, 5), C.mat(new THREE.MeshLambertMaterial({ color: 0x1c1e1c })), cables);
  for (const r of racks.filter((q) => C.h(q.x, q.z) > flood).slice(0, 2)) C.scrapSpots.push({ x: r.x + Math.sin(r.ry) * 1.6, z: r.z + Math.cos(r.ry) * 1.6 });
}

// ------------------------------------------------------------------ burnt data center (ash field)
function buildAshfield(C) {
  const { R, addBox, sc } = C;
  // 1. burnt rack husks (some fallen over)
  const husks = [];
  const nHusk = Math.round(34 * sc * sc);
  for (let i = 0; i < nHusk; i++) {
    const p = C.spot(2);
    if (!p) continue;
    const fallen = R.chance(0.35), ry = R.float(0, TAU), y = C.h(p.x, p.z) - 0.1;
    husks.push({ x: p.x, y: y + (fallen ? 0.32 : 0), z: p.z, ry, rx: fallen ? 0 : R.float(-0.12, 0.12), rz: fallen ? Math.PI / 2 * R.sign() : R.float(-0.12, 0.12), s: R.float(0.9, 1.25) });
    if (fallen) addBox(p.x, y + 0.35, p.z, 2.0, 0.7, 1.05, ry);
    else addBox(p.x, y + 1.0, p.z, 0.7, 2.0, 1.05, ry);
  }
  instancedProp(C, 'server_rack_prop', husks, 0x2e2826);
  // 2. smouldering fires with scorch marks and smoke
  const scorch = C.mat(new THREE.MeshLambertMaterial({ color: 0x151210, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const fireMat = getBasicMaterial('fire', 0xffffff);
  const puff = softPuffTexture(C);
  const smokeMat = puff ? C.mat(new THREE.SpriteMaterial({ map: puff, color: 0x3a3430, transparent: true, opacity: 0.42, depthWrite: false, fog: true })) : null;
  const fires = [];
  const nFire = Math.round(7 * sc);
  for (let i = 0; i < nFire; i++) {
    const p = C.spot(4);
    if (!p) continue;
    const gy = C.h(p.x, p.z);
    groundDisc(C, p.x, p.z, R.float(2.2, 3.4), scorch);
    const fg = new THREE.Group();
    fg.position.set(p.x, gy, p.z);
    const size = R.float(0.9, 1.6);
    for (let k = 0; k < 2; k++) {
      const pl = C.own(new THREE.Mesh(new THREE.PlaneGeometry(size * 0.8, size), fireMat));
      pl.position.y = size / 2; pl.rotation.y = k * Math.PI / 2;
      fg.add(pl);
    }
    C.add(fg);
    const e = emitter(C, p.x, gy + 1.0, p.z, 0xff7a30, 1.4, 13, 0.2);
    const smoke = [];
    if (smokeMat) {
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Sprite(smokeMat);
        sp.position.set(p.x, gy + 1 + k * 2.2, p.z);
        C.add(sp);
        smoke.push({ sp, ph: k / 5 });
      }
    }
    fires.push({ fg, e, base: 1.4, ph: R.float(0, TAU), x: p.x, z: p.z, gy, smoke });
    if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: p.x + 3.8, z: p.z + 0.6 });
  }
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    for (const f of fires) {
      if (cam && (cam.x - f.x) ** 2 + (cam.z - f.z) ** 2 > 140 * 140) continue;
      const n = Math.sin((t + f.ph) * 9.1) * 0.5 + Math.sin((t + f.ph) * 15.7) * 0.3;
      f.fg.scale.set(1 + n * 0.1, 0.9 + n * 0.14, 1 + n * 0.1);
      f.fg.rotation.y += dt * 0.6;
      f.e.intensity = f.base * (0.8 + 0.2 * n);
      for (const s of f.smoke) {
        const k = ((t * 0.08 + s.ph) % 1);
        s.sp.position.set(f.x + Math.sin(k * 5 + f.ph) * 1.2 * k, f.gy + 1.2 + k * 12, f.z + k * 2.5);
        const sc2 = 1.5 + k * 5;
        s.sp.scale.set(sc2, sc2, 1);
      }
    }
  });
}

// ------------------------------------------------------------------ crystal cache
function crystalGeo(R, shards) {
  const parts = [];
  for (let i = 0; i < shards; i++) {
    const g = new THREE.OctahedronGeometry(1, 0);
    const h = R.float(1.2, 2.6) * (i === 0 ? 1.3 : 1), w = R.float(0.22, 0.42);
    g.scale(w, h, w);
    g.rotateZ(R.float(-0.55, 0.55));
    g.rotateX(R.float(-0.55, 0.55));
    g.rotateY(R.float(0, TAU));
    g.translate(R.float(-0.45, 0.45), h * 0.55, R.float(-0.45, 0.45));
    parts.push(g);
  }
  return mergeSimple(parts);
}

function buildCrystal(C) {
  const { R, addBox, sc } = C;
  const COLORS = [0xb07aff, 0x6ae8ff, 0xff7ad8];
  const mats = COLORS.map((c) => C.mat(new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.42), flatShading: true })));
  const geos = [crystalGeo(R, 5), crystalGeo(R, 7)];
  const lists = COLORS.map(() => geos.map(() => []));
  const nCl = Math.round(110 * sc * sc);
  for (let i = 0; i < nCl; i++) {
    const p = C.spot(2);
    if (!p) continue;
    const s = R.float(0.6, 1.8), ry = R.float(0, TAU);
    const ci = R.int(0, 2), gi = R.int(0, 1);
    lists[ci][gi].push({ x: p.x, y: C.h(p.x, p.z) - 0.25, z: p.z, ry, s });
    if (s > 0.9) addBox(p.x, C.h(p.x, p.z) + 1.0 * s, p.z, 1.0 * s, 2.0 * s, 1.0 * s, ry);
  }
  // spires: huge lit landmarks (loot waits at their feet)
  const nSp = Math.round(5 * sc);
  for (let i = 0; i < nSp; i++) {
    const p = C.spot(10);
    if (!p) continue;
    const s = R.float(4, 7), ry = R.float(0, TAU), ci = i % 3, gy = C.h(p.x, p.z);
    lists[ci][1].push({ x: p.x, y: gy - 0.8, z: p.z, ry, s });
    addBox(p.x, gy + 1.2 * s, p.z, 1.3 * s, 2.4 * s, 1.3 * s, ry);
    emitter(C, p.x, gy + 3.5, p.z, COLORS[ci], 1.5, 24, 0.04);
    if (C.scrapSpots.length < 2) C.scrapSpots.push({ x: p.x + 1.1 * s + 1.8, z: p.z });
  }
  lists.forEach((byGeo, ci) => byGeo.forEach((list, gi) => instanced(C, geos[gi], mats[ci], list, { owned: false })));
  C.geos.push(...geos);
  // tiny shards scattered everywhere (no collision)
  const shardGeo = crystalGeo(R, 3);
  const shards = [];
  for (let i = 0; i < Math.round(220 * sc * sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (C.avoid(x, z, -6)) continue;
    shards.push({ x, y: C.h(x, z) - 0.05, z, ry: R.float(0, TAU), s: R.float(0.12, 0.3) });
  }
  instanced(C, shardGeo, C.mat(new THREE.MeshBasicMaterial({ color: 0xd8c0ff })), shards);
  // slow breathing glow
  C.updaters.push((dt, t) => {
    for (let i = 0; i < mats.length; i++) mats[i].emissiveIntensity = 0.85 + 0.3 * Math.sin(t * 0.9 + i * 2.1);
  });
}

const BUILDERS = { datascape: buildDatascape, servermarsh: buildServerMarsh, ashfield: buildAshfield, crystal: buildCrystal };
export const DECOR_KINDS = Object.keys(BUILDERS);
