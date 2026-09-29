// HOMEWORLD outdoor map (module 'homeworld'): a small barren rock plateau with a landing pad at the origin (the ship lands there like on any
// moon), a BUILD console and a clear 30 x 30 cell build grid around the pad. Returns an object shaped like world/terrain.js buildMoonOutdoor()
// so every system that reads world.outdoor / world.terrain keeps working (no facility, no scatter: nothing spawns here).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.js';
import { levelTexture } from './geobuilder.js';
import { G } from '../physics/physics.js';
import { CELL, GRID_MIN, GRID_MAX, PAD_CLEAR } from '../game/homeworld_core.js';
import { createConsoleModel } from '../models/homeworld.js';
import { buildHomeDecor } from './homeworld_decor.js';   // [home3] Off-Grid Claim look

export const HOME_Y = -1.25;       // ground height (same as the flat ship zone of every moon)
export const HOME_HALF = 58;       // walkable half extent (m)
export const PAD_R = 14.5;
export const CONSOLE_POS = new THREE.Vector3(2.6, HOME_Y, 10.5);   // outside the ship door (x 2.6, +z side)

// [h2] FLICKER FIX. Two causes of the "ground textures come and go" report, both in the flat, huge, coplanar geometry of this map:
//  1. the global PSX vertex snap (engine.js patchPSX) snaps the CLIP-space xy of every vertex to a 200 x 150 grid. A 132 m ground quad, the pad fan and the
//     rings each have only a few far-away vertices, so every one of them wobbled by a whole pixel at a different phase per frame: the interpolated
//     depth of the ground and of the pad (3 cm apart) then crossed each other = z-fighting that changes with the camera position.
//     -> every flat layer here opts out of the snap (PSX_NOSNAP define, same trick as environment.js / crtmenu.js).
//  2. the layers were only 3 cm apart (24 bit depth at 0.05 / 420 m gives ~1 cm of resolution at 30 m, ~10 cm at 100 m).
//     -> layers are stacked 6 cm apart AND get a per-layer polygonOffset (ground pushed back, pad / rings / grid pulled forward).
export const LAYER = { ground: 0, pad: 0.06, ring: 0.12, lamp: 0.16, grid: 0.20, decal: 0.24 };
export function flatLayer(mat, layer = 0) {
  mat.defines = { ...(mat.defines || {}), PSX_NOSNAP: '' };
  const off = layer === 0 ? 1 : -layer * 8;   // ground: +1 (behind); everything stacked on it: -1 .. -N (in front)
  mat.polygonOffset = true; mat.polygonOffsetFactor = off; mat.polygonOffsetUnits = off;
  return mat;
}
const tinted = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };

function makeTerrain(HALF = HOME_HALF) {
  return {
    seed: 0, scale: 1, half: HALF + 8, step: 2, playHalf: HALF - 3, flood: null, lakes: [], plan: { ponds: [], fires: [], lakes: [], entrance: { x: 0, z: -60 }, scale: 1 },
    biome: null, noise2: { noise: () => 0 }, reach: null, lava: null,
    heightAt: () => HOME_Y, distToPath: () => 99, blocked: () => false, onIce: () => false, footSurface: () => 'concrete',
  };
}

export function buildHomeworldMap(seed, moon, { physics, lightPool, biome, profile }) {
  const HALF = moon?.plateauHalf || HOME_HALF, ghostMap = !!moon?.ghost;   // [h2] the ghost-raid arena is a bigger plateau (homeworld2_ghost.js)
  const group = new THREE.Group();
  group.name = 'homeworld';
  const colliders = [], emitters = [], ownMats = [], disposables = [];
  const rng = new RNG(((seed | 0) ^ 0x40e3) >>> 0);
  const terrain = makeTerrain(HALF); terrain.biome = biome;

  // ---- ground plateau (one plane, uv per metre) + pad
  const gg = new THREE.PlaneGeometry(HALF * 2 + 16, HALF * 2 + 16, 1, 1); gg.rotateX(-Math.PI / 2);
  const uv = gg.attributes.uv, pos = gg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.2, pos.getZ(i) * 0.2);
  const gm = flatLayer(new THREE.MeshLambertMaterial({ map: levelTexture('rock'), color: 0x9a8f86 }), 0); ownMats.push(gm);
  const ground = new THREE.Mesh(gg, gm); ground.position.y = HOME_Y; group.add(ground); disposables.push(gg);
  const pg = new THREE.CircleGeometry(PAD_R, 48); pg.rotateX(-Math.PI / 2);
  const puv = pg.attributes.uv, ppos = pg.attributes.position; for (let i = 0; i < puv.count; i++) puv.setXY(i, ppos.getX(i) * 0.25, ppos.getZ(i) * 0.25);
  const pm = flatLayer(new THREE.MeshLambertMaterial({ map: levelTexture('concrete_dark'), color: 0x8a8f96 }), LAYER.pad); ownMats.push(pm);
  const pad = new THREE.Mesh(pg, pm); pad.position.y = HOME_Y + LAYER.pad; group.add(pad); disposables.push(pg);
  // painted rings + landing lights (emissive, no scene lights)
  const glowMat = flatLayer(new THREE.MeshBasicMaterial({ vertexColors: true }), LAYER.ring); ownMats.push(glowMat);
  const glowGeos = [];
  const ringGeo = (r0, r1, hex) => { const g = new THREE.RingGeometry(r0, r1, 64); g.rotateX(-Math.PI / 2); g.translate(0, HOME_Y + LAYER.ring, 0); return tinted(ni(g), hex); };
  glowGeos.push(ringGeo(PAD_R - 0.5, PAD_R - 0.25, 0xffa030), ringGeo(PAD_R - 2.2, PAD_R - 2.05, 0x40e0ff));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, b = new THREE.BoxGeometry(0.5, 0.12, 0.5); b.translate(Math.cos(a) * (PAD_R - 1.2), HOME_Y + LAYER.lamp, Math.sin(a) * (PAD_R - 1.2));
    glowGeos.push(tinted(ni(b), i % 2 ? 0xff5030 : 0xffd23f));
  }
  const glow = new THREE.Mesh(mergeNonIndexed(glowGeos), glowMat); group.add(glow); disposables.push(glow.geometry);

  // ---- rim: a ring of rock spires + boulders beyond the walkable plateau (one merged mesh)
  const rocks = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rng.float(-0.05, 0.05), r = HALF + rng.float(4, 16), h = rng.float(6, 26), w = rng.float(3, 8);
    const g = new THREE.ConeGeometry(w, h, rng.int(4, 6)); g.rotateY(rng.float(0, 3)); g.translate(Math.cos(a) * r, HOME_Y + h / 2 - 1, Math.sin(a) * r);
    rocks.push(tinted(ni(g), rng.chance(0.3) ? 0x6a5f70 : 0x5a5058));
  }
  for (let i = 0; i < (ghostMap ? 90 : 40); i++) {   // scattered boulders inside the plateau, well outside the build grid
    const a = rng.float(0, Math.PI * 2), r = rng.float(50, HALF - 2), s = rng.float(0.8, 2.2);
    if (ghostMap && Math.abs(Math.cos(a) * r) < 52 && Math.sin(a) * r < -30) continue;   // [h2] keep the raided base's footprint clear
    const g = new THREE.DodecahedronGeometry(s, 0); g.translate(Math.cos(a) * r, HOME_Y + s * 0.5, Math.sin(a) * r);
    rocks.push(tinted(ni(g), 0x7a7068));
  }
  const rockMesh = new THREE.Mesh(mergeNonIndexed(rocks), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); ownMats.push(rockMesh.material);
  group.add(rockMesh); disposables.push(rockMesh.geometry);

  // ---- build grid overlay (LineSegments, shown while building): cell edges outside the pad
  const pts = [];
  const okCell = (x, z) => Math.hypot((x + 0.5) * CELL, (z + 0.5) * CELL) >= PAD_CLEAR;
  for (let x = GRID_MIN; x < GRID_MAX; x++) for (let z = GRID_MIN; z < GRID_MAX; z++) {
    if (!okCell(x, z)) continue;
    const x0 = x * CELL, z0 = z * CELL, x1 = x0 + CELL, z1 = z0 + CELL, y = HOME_Y + LAYER.grid;
    pts.push(x0, y, z0, x1, y, z0, x0, y, z0, x0, y, z1);
    if (x === GRID_MAX - 1 || !okCell(x + 1, z)) pts.push(x1, y, z0, x1, y, z1);
    if (z === GRID_MAX - 1 || !okCell(x, z + 1)) pts.push(x0, y, z1, x1, y, z1);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const gridMat = flatLayer(new THREE.LineBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.32, depthWrite: false }), LAYER.grid); ownMats.push(gridMat);
  const grid = new THREE.LineSegments(lg, gridMat); grid.visible = false; grid.frustumCulled = false; group.add(grid); disposables.push(lg);

  // ---- build console
  const consoleObj = createConsoleModel(); consoleObj.position.copy(CONSOLE_POS); consoleObj.rotation.y = Math.PI; group.add(consoleObj);
  const add = (x, y, z, hx, hy, hz, data) => { const c = physics.addStaticBox(x, y, z, hx, hy, hz, 0, G.STATIC, data || { kind: 'prop' }); colliders.push(c); return c; };
  add(0, HOME_Y - 1, 0, HALF + 8, 1, HALF + 8, { kind: 'terrain' });                    // ground slab (top face at HOME_Y)
  for (const [x, z, hx, hz] of [[HALF, 0, 1, HALF + 8], [-HALF, 0, 1, HALF + 8], [0, HALF, HALF + 8, 1], [0, -HALF, HALF + 8, 1]]) add(x, HOME_Y + 15, z, hx, 16, hz, { kind: 'wall' });   // invisible walls
  add(CONSOLE_POS.x, HOME_Y + 0.6, CONSOLE_POS.z, 0.8, 0.6, 0.55, { kind: 'prop' });

  // ---- pooled emitters (light pool, count never changes): pad corners + the console
  for (const [x, z, col, d] of [[PAD_R - 2, 0, 0xffa030, 14], [-(PAD_R - 2), 0, 0xffa030, 14], [0, -(PAD_R - 2), 0x40e0ff, 14], [CONSOLE_POS.x, CONSOLE_POS.z, 0xffb060, 9]]) {
    const em = { pos: new THREE.Vector3(x, HOME_Y + 2.4, z), color: col, intensity: 1.0, distance: d, group: 'outdoor' };
    emitters.push(em); lightPool.add(em);
  }

  // [home3] the Off-Grid Claim: skyline, outpost dressing, drones (world/homeworld_decor.js; footprints planned off the build grid). Not on the ghost-raid arena.
  const decor = ghostMap ? null : buildHomeDecor(seed, { HOME_Y, LAYER, flatLayer, HALF, add, lightPool, profile });
  if (decor) group.add(decor.group);

  const mainExit = { pos: CONSOLE_POS.clone().add(new THREE.Vector3(0, 1.4, 0)), spawn: CONSOLE_POS.clone().add(new THREE.Vector3(0, 0.05, 2)), yaw: 0 };
  let t = 0;
  return {
    group, colliders, emitters, terrain, plan: terrain.plan, interactables: [], ponds: [], mainExit, fireExits: [], outdoorScrapSpots: [], entranceObj: null,
    outposts: null, decor: null, landmarks: null, harvest: { trees: [], rocks: [] }, avoid: () => true, ownMats,
    home: { grid, consolePos: CONSOLE_POS, groundY: HOME_Y, padR: PAD_R },
    update(dt, game) { t += dt; glowMat.color.setScalar(0.85 + 0.15 * Math.sin(t * 2.2)); decor?.update(dt, game); },
    decor,
    dispose(physicsRef) {
      decor?.dispose();
      for (const c of colliders) physicsRef.removeCollider(c);
      for (const em of emitters) lightPool.remove(em);
      for (const g of disposables) g.dispose();
      for (const m of ownMats) m.dispose();
      group.removeFromParent();
    },
  };
}

const ni = (g) => (g.index ? g.toNonIndexed() : g);
function mergeNonIndexed(list) {
  for (const g of list) if (g.attributes.uv) g.deleteAttribute('uv');
  return mergeGeometries(list, false);
}
