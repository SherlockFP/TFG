// Outdoor OUTPOSTS: small hand-built points of interest on each moon (abandoned camp, crashed cargo
// drop, concrete bunker, radio station, wrecked lander on desert/snow/crystal moons, crashed uplink dish,
// abandoned stream van, fenced server cage). Big generated moons (moon.mapScale > 1) get one more. Every outpost gives the
// host 2-4 scrap spots and may hold one LOCKED SUPPLY CRATE (key / lockpick minigame / a loud pry with
// a melee weapon) whose loot the host spawns: risk vs reward outside the facility, especially at night.
// By day only part of the spots hold scrap (outdoor creatures only roam after 17:00); at 18:00 (or from
// the start in an eclipse) the host tops up the empty spots with more valuable scrap, and crates opened
// at night drop an extra item worth more.
//
// World side (all peers, deterministic from the moon seed):
//   buildOutposts(ctx) -> Outposts
//     ctx = { seed, moon, plan, terrain (heightAt), group, physics, lightPool, rng, addBox, placeProp, avoid }
//     .scrapSpots [{x,y,z,kind,outpost}]   .crates [{id,x,y,z,rotY,...}]   .interactables [{type:'crate',...}]
//     .sites [{kind,name,x,y,z,rot,radius,crate,spots}]
//     .update(dt, game)             lid animation, campfire flicker, net install + late-join crate sync
//     .addInteractables(game, add)  crate prompts for actions.interactablesNow
//     .scanLabels(eye, labels)      optional RMB-scan labels
//     .blocks(x, z, margin)         lets later outdoor placement stay clear of the outposts
//     .dispose(physics)
// Host side:
//   hostPopulateOutposts(game, outposts, { table, valueMul })   day scrap at the outpost spots (+ a spare key);
//                                  the night top-up runs from outposts.update() on the host
//   installOutpostNet(game)        crate request handlers + state message (idempotent per session)
//
// Layout, scrap spots, crate ids and colliders never depend on which optional GLB models finished
// loading (only visuals do), and the outposts use their own RNG stream, so every peer agrees on them.
// Static colliders go through ctx.addBox (owned by the terrain's collider list, cleared on takeoff/unload).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { createAnyProp } from './propfactory.js';
import { hasExt, extSize } from './extmodels.js';
import { getMaterial, getBasicMaterial } from '../render/textures.js';
import { ModelKit } from '../models/items.js';
import { ITEMS, SCRAP_TABLE } from '../game/items.js';
import { MOONS } from '../game/moons.js';

const { Kit, G, xf } = ModelKit;
const TAU = Math.PI * 2, HP = Math.PI / 2;
const M = (t, c = 0xffffff, o) => getMaterial(t, c, o);
const MB = (t, c = 0xffffff, o) => getBasicMaterial(t, c, o);

// optional GLB props used for visuals (add to EXT_PRELOAD; primitives are used when missing)
export const OUTPOST_EXT_MODELS = ['ks_campfire_pit', 'ks_tent_canvas', 'kk_lander_a', 'ks_tree_log'];

// radius: layout footprint; core: must be free of trees/rocks/props; maxDrop: max terrain height
// difference over the core; crate: chance of a locked supply crate; value: scrap value multiplier
export const OUTPOST_KINDS = {
  camp: { name: 'Abandoned Camp', radius: 7.5, core: 6.2, maxDrop: 2.6, crate: 0.25, value: 0.85, faceShip: false },
  cargo: { name: 'Cargo Drop', radius: 8.5, core: 5.2, maxDrop: 3.0, crate: 0.5, value: 1.0, faceShip: false },
  bunker: { name: 'Old Bunker', radius: 7, core: 5.2, maxDrop: 2.2, crate: 0.5, value: 1.1, faceShip: true },
  radio: { name: 'Radio Station', radius: 8.5, core: 6.6, maxDrop: 2.4, crate: 0.3, value: 0.95, faceShip: true },
  lander: { name: 'Wrecked Lander', radius: 9, core: 5.4, maxDrop: 3.0, crate: 0.4, value: 1.25, faceShip: false },
  dish: { name: 'Crashed Uplink', radius: 9, core: 6.6, maxDrop: 3.0, crate: 0.45, value: 1.15, faceShip: false },
  van: { name: 'Stream Van', radius: 7.5, core: 5.6, maxDrop: 2.2, crate: 0.35, value: 1.0, faceShip: false },
  cage: { name: 'Server Cage', radius: 7.5, core: 6.2, maxDrop: 2.0, crate: 0.55, value: 1.2, faceShip: true },
};

// economy: by day the outposts add roughly 15-20% of the moon's indoor scrap value (scrap + crates),
// about 30-35% for crews that stay out after dark. The spot fill chance is budgeted against the moon's
// indoor scrap count, so moons with more / richer outposts do not pay out more.
const DAY_SHARE = 0.16;              // outposts should be a meaningful alternate route, not decoration
const NIGHT_SHARE = 0.12;            // staying outside after dark adds a second risk/reward spike
const DAY_FILL_MIN = 0.20, DAY_FILL_MAX = 0.78, NIGHT_FILL_MAX = 0.9;
const NIGHT_MIN = 18 * 60;           // run.time (minutes) from which outposts count as "night"
const NIGHT_VALUE = 1.25;            // night top-up scrap and night crate loot value multiplier
const CRATE_VALUE = 1.0;             // crate scrap on top of the moon valueMul
const FORCE_CRATE_TIER = 3;          // from this moon tier on every moon has at least one crate
const WEATHER_BONUS = { stormy: 1.2, eclipsed: 1.3, foggy: 1.1, rainy: 1.05 };   // same as host.hostPopulateMoon
const isNight = (run) => !!run && (run.weather === 'eclipsed' || (run.time ?? 480) >= NIGHT_MIN);

const REQ_OPEN = 'opCrate';        // client -> host: { id, s, key | pick | pry }
const REQ_SYNC = 'opCrateSync';    // client -> host: { s }  (late joiners)
const MSG_STATE = 'opCrateState';  // host -> all: { s, id, by } | { s, list }

const CRATE = { W: 1.1, H: 0.62, D: 0.72, LID: 0.14 };
const LED_LOCKED = 0xff2a20, LED_OPEN = 0x40ff70;
const LANDER_SPAN = 5.4;   // horizontal size of the wrecked lander (primitive hull + legs, GLB scaled to it)

// supply crate loot
const SUPPLY_SCRAP = [['goldbar', 2], ['ring', 1], ['perfume', 3], ['figurine', 4], ['trophy', 3], ['register', 1], ['magnify', 3],
  ['phone', 3], ['teeth', 3], ['airhorn', 3], ['canned', 5], ['flask', 3], ['robot', 2], ['mug', 3]];
const SUPPLY_TOOLS = [['flashlight', 5], ['proflash', 3], ['medkit', 5], ['stungrenade', 4], ['glowstick', 5], ['lockpick', 3],
  ['adrenaline', 3], ['walkie', 3], ['shells', 2], ['spraypaint', 1], ['boombox', 1], ['shovel', 2], ['machete', 1]];

function rot2(x, z, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; }
function easeOutBack(t) { const s = 1.70158, u = t - 1; return 1 + u * u * ((s + 1) * u + s); }
function weightedPick(list, rnd) {
  if (!list.length) return null;
  let tot = 0;
  for (const e of list) tot += e[1];
  let r = rnd() * tot;
  for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
  return list[list.length - 1][0];
}

// ============================================================================ per-outpost builder
// Local frame: origin at the site centre on the ground, rotation.y = rot (three.js convention).
class Site {
  constructor(B, kind, index, x, z, rot) {
    this.B = B; this.kind = kind; this.index = index;
    this.info = OUTPOST_KINDS[kind]; this.name = this.info.name; this.radius = this.info.radius;
    this.x = x; this.z = z; this.rot = rot;
    this.y = B.terrain.heightAt(x, z);
    this.c = Math.cos(rot); this.s = Math.sin(rot);
    this.root = new THREE.Group();
    this.root.name = 'outpost-' + kind;
    this.root.position.set(x, this.y, z);
    this.root.rotation.y = rot;
    this.kit = new Kit();
    this.spots = [];
    this.crate = null;
  }
  wx(lx, lz) { return this.x + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.z - lx * this.s + lz * this.c; }
  gy(lx, lz) { return this.B.terrain.heightAt(this.wx(lx, lz), this.wz(lx, lz)) - this.y; }   // local ground height
  clear(lx, lz, r, scale = 0.35) { return this.B.clearAt(this.wx(lx, lz), this.wz(lx, lz), r, scale); }
  clearSpot(lx, lz, margin) { return this.B.clearOfFootprints(this.wx(lx, lz), this.wz(lx, lz), margin); }

  col(lx, ly, lz, sx, sy, sz, lrot = 0) {
    this.B.addCol(this.wx(lx, lz), this.y + ly, this.wz(lx, lz), sx, sy, sz, this.rot + lrot);
  }
  box(mat, lx, ly, lz, sx, sy, sz, o = {}) {
    this.kit.add(mat, G.box(sx, sy, sz), [lx, ly, lz], [o.rx || 0, o.ry || 0, o.rz || 0], null, o.uv ?? 1);
    if (o.col !== false) this.col(lx, ly, lz, sx, sy, sz, o.ry || 0);
  }
  vis(mat, geo, p, r, s, uv) { this.kit.add(mat, geo, p, r, s, uv); }
  // add geometry in a sub-frame (position + yaw) of the site: local transform first, then the frame
  sub(px, py, pz, yaw) {
    return { add: (mat, geo, p, r, s, uv) => { xf(geo, p, r, s); this.kit.add(mat, geo, [px, py, pz], [0, yaw, 0], null, uv); } };
  }
  light(lx, ly, lz, color, intensity, distance, flicker = 0) {
    const e = { pos: new THREE.Vector3(this.wx(lx, lz), this.y + ly, this.wz(lx, lz)), color, intensity, distance, flicker, group: 'outdoor' };
    this.B.emitters.push(e);   // added to the light pool by buildOutposts once every outpost built fine
    return e;
  }
  spot(lx, lz, ly) {
    const y = ly ?? this.gy(lx, lz);
    const s = { x: this.wx(lx, lz), y: this.y + y, z: this.wz(lx, lz), kind: this.kind, outpost: this.index };
    this.spots.push(s);
    return s;
  }
  // choose n of the candidate spots [[lx, lz, ly?], ...]. The item (spawned 0.5 m above the spot) must not
  // start inside one of the outposts' own colliders; ground-level candidates (no ly) must also lie outside
  // the footprints of the trees/rocks/props that were on the moon before the outposts (only the core is
  // guaranteed clear); a smaller margin tops the list up to 2 spots when the comfortable one leaves too few.
  pickSpots(cands, n) {
    const strict = [], loose = [];
    for (const c of cands) {
      const ly = c[2] ?? this.gy(c[0], c[1]);
      if (!this.B.freeOfOwnCols(this.wx(c[0], c[1]), this.y + ly + 0.5, this.wz(c[0], c[1]), 0.3)) continue;
      if (c[2] !== undefined || this.clearSpot(c[0], c[1], 0.6)) strict.push(c);
      else if (this.clearSpot(c[0], c[1], 0.25)) loose.push(c);
    }
    const R = this.B.R;
    const list = R.shuffle(strict).concat(R.shuffle(loose));
    const k = Math.min(list.length, Math.max(Math.min(n, strict.length), Math.min(2, n)));
    for (const c of list.slice(0, k)) this.spot(c[0], c[1], c[2]);
  }
  // Procedural prop (auto colliders) or 'ext:<id>' GLB (visual only, recentred to bottom centre).
  // Returns null for ext models that are not loaded - callers then build primitives.
  prop(id, lx, lz, lrot = 0, o = {}) {
    const ext = id.startsWith('ext:');
    if (ext && !hasExt(id.slice(4))) return null;
    let obj;
    try { obj = createAnyProp(id, { seed: o.seed ?? 1, variant: o.variant, scale: o.scale }); } catch (e) { console.warn('outpost prop', id, e); return null; }
    if (!obj) return null;
    if (ext) {
      // extInstance bounds are scaled; move the model so its bottom centre sits on the origin
      const c0 = obj.userData.colliders?.[0];
      const inner = obj.userData.inner;
      if (c0 && inner) {
        const s = inner.scale.x, p0 = inner.position;
        inner.position.set(s * p0.x - c0.c[0], s * p0.y - (c0.c[1] - c0.s[1] / 2), s * p0.z - c0.c[2]);
      }
      obj.traverse((m) => { m.userData.opShared = true; });   // cached GLB geometry: never ours to dispose
    }
    const ly = (o.y ?? this.gy(lx, lz)) + (o.dy || 0);
    obj.position.set(lx, ly, lz);
    if (o.rx || o.rz) obj.rotation.order = 'YXZ';
    obj.rotation.set(o.rx || 0, lrot, o.rz || 0);
    this.root.add(obj);
    if (!ext && o.cols !== false) {
      for (const c of obj.userData.colliders || []) {
        const [rx, rz] = rot2(c.c[0], c.c[2], lrot);
        this.col(lx + rx, ly + c.c[1], lz + rz, c.s[0], c.s[1], c.s[2], lrot);
      }
    }
    if (!ext && o.lights !== false) {
      for (const l of obj.userData.lights || []) {
        const [rx, rz] = rot2(l.p[0], l.p[2], lrot);
        this.light(lx + rx, ly + l.p[1], lz + rz, l.color, l.intensity ?? 1, (l.distance ?? 9) * 1.3, l.flicker ? 0.3 : 0);
      }
    }
    return obj;
  }
  // terrain-conforming disc (scorch marks, ash)
  disc(cx, cz, radius, rings, segs, lift, mat) {
    const pos = [], uv = [], idx = [];
    const push = (x, z) => { pos.push(x, this.gy(x, z) + lift, z); uv.push(x * 0.5, z * 0.5); };
    push(cx, cz);
    for (let r = 1; r <= rings; r++) {
      const rr = (radius * r) / rings;
      for (let s = 0; s < segs; s++) { const a = (s / segs) * TAU; push(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr); }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let r = 1; r < rings; r++) {
      const b0 = 1 + (r - 1) * segs, b1 = 1 + r * segs;
      for (let s = 0; s < segs; s++) { const s1 = (s + 1) % segs; idx.push(b0 + s, b0 + s1, b1 + s1, b0 + s, b1 + s1, b1 + s); }
    }
    return this.mesh(pos, uv, idx, mat);
  }
  // terrain-following cloth (parachute canopy)
  drape(cx, cz, w, l, yaw, bump, mat) {
    const nx = 6, nz = 5, pos = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / nz;
        const [ox, oz] = rot2((u - 0.5) * w, (v - 0.5) * l, yaw);
        const x = cx + ox, z = cz + oz;
        const edge = Math.min(u, 1 - u, v, 1 - v) * 2;
        pos.push(x, this.gy(x, z) + 0.06 + bump * edge * (0.6 + 0.4 * Math.sin(i * 1.9 + j * 2.7)), z);
        uv.push(u * 2, v * 2);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    return this.mesh(pos, uv, idx, mat);
  }
  mesh(pos, uv, idx, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    this.root.add(m);
    return m;
  }
  // animated flame (crossed alpha quads); emitter = { dy, color, intensity, distance } or null
  flame(lx, ly, lz, size, emitter) {
    const g = new THREE.Group();
    g.position.set(lx, ly, lz);
    this.root.add(g);
    const k = new Kit();
    const mat = MB('fire', 0xffffff);
    k.add(mat, G.plane(size * 0.8, size), [0, size / 2, 0]);
    k.add(mat, G.plane(size * 0.8, size), [0, size / 2, 0], [0, HP, 0]);
    k.add(MB('fire', 0xffe8a0), G.plane(size * 0.45, size * 0.6), [0, size * 0.3, 0], [0, HP / 2, 0]);
    k.into(g);
    const e = emitter ? this.light(lx, ly + emitter.dy, lz, emitter.color, emitter.intensity, emitter.distance, 0) : null;
    this.B.fires.push({ flame: g, emitter: e, base: e ? e.intensity : 0, x: this.wx(lx, lz), z: this.wz(lx, lz), phase: this.index * 1.7 + this.B.fires.length * 2.3 });
    return g;
  }
  // locked supply crate: static body + hinged lid + padlock + status LED; front faces local +Z (lrot)
  supplyCrate(lx, lz, lrot, ly, difficulty, openAngle = 1.9) {
    const y0 = ly ?? Math.min(this.gy(lx, lz), this.gy(lx + 0.45, lz), this.gy(lx - 0.45, lz), this.gy(lx, lz + 0.35), this.gy(lx, lz - 0.35)) - 0.02;
    const g = new THREE.Group();
    g.position.set(lx, y0, lz);
    g.rotation.y = lrot;
    this.root.add(g);
    const bodyH = CRATE.H - CRATE.LID;
    const olive = M('crate_metal', 0x7d8a60), dark = M('metal_dark');
    const k = new Kit();
    k.add(olive, G.box(CRATE.W, bodyH, CRATE.D), [0, bodyH / 2, 0], null, null, 0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(dark, G.box(0.07, bodyH + 0.01, 0.07), [sx * (CRATE.W / 2 - 0.02), bodyH / 2, sz * (CRATE.D / 2 - 0.02)]);
    k.add(M('hazard_stripes', 0xffffff, { decal: true }), G.plane(CRATE.W * 0.86, 0.09), [0, bodyH * 0.28, CRATE.D / 2 + 0.003]);
    k.add(MB(null, 0x1a1a18), G.plane(0.3, 0.12), [-0.3, bodyH * 0.62, CRATE.D / 2 + 0.003]);
    for (const sx of [-1, 1]) k.add(dark, G.box(0.04, 0.05, 0.24), [sx * (CRATE.W / 2 + 0.02), bodyH * 0.62, 0]);
    k.into(g);
    const lid = new THREE.Group();
    lid.position.set(0, bodyH, -CRATE.D / 2);
    g.add(lid);
    const lk = new Kit();
    lk.add(olive, G.box(CRATE.W + 0.03, CRATE.LID, CRATE.D + 0.03), [0, CRATE.LID / 2, CRATE.D / 2], null, null, 0.8);
    lk.add(dark, G.box(CRATE.W + 0.05, 0.035, 0.06), [0, CRATE.LID * 0.45, CRATE.D + 0.02]);
    lk.into(lid);
    const lock = new THREE.Group();
    lock.position.set(0, bodyH - 0.04, CRATE.D / 2 + 0.035);
    g.add(lock);
    const kk = new Kit();
    kk.add(M('gold', 0xc8a040), G.box(0.12, 0.13, 0.05), [0, -0.05, 0]);
    kk.add(M('metal', 0xb0b0b0), G.tor(0.04, 0.012, 4, 8, Math.PI), [0, 0.015, 0]);
    kk.into(lock);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), MB(null, LED_LOCKED));
    led.position.set(0.36, bodyH * 0.62, CRATE.D / 2 + 0.01);
    g.add(led);
    this.col(lx, y0 + CRATE.H / 2, lz, CRATE.W, CRATE.H, CRATE.D, lrot);
    const [fx, fz] = rot2(0, CRATE.D / 2 + 0.06, lrot);
    const cr = {
      id: 'oc' + this.index, outpost: this.index, kind: this.kind,
      x: this.wx(lx, lz), y: this.y + y0, z: this.wz(lx, lz), rotY: this.rot + lrot,
      difficulty, openAngle, opened: false, claimed: false, anim: false, t: 0, lid, lock, led,
      pos: new THREE.Vector3(this.wx(lx + fx, lz + fz), this.y + y0 + CRATE.H * 0.8, this.wz(lx + fx, lz + fz)),
    };
    this.crate = cr;
    return cr;
  }
  finish() {
    this.kit.into(this.root);
    this.B.group.add(this.root);
    this.root.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.opShared) this.B.geos.add(o.geometry); });
    this.B.roots.push(this.root);
  }
}

// Walk-in hut on a concrete foundation (floor raised above the highest ground under it, so terrain never
// pokes through), door opening on the +Z wall, steps down to the ground in front of the door.
function buildHut(S, o) {
  const { cx, cz, inW, inD, T, H, dw, dh, dx = 0, wall, floor, roof, found, uv = 2, roofT = 0.25, roofTilt = 0 } = o;
  const oW = inW + 2 * T, oD = inD + 2 * T;
  let gMax = -1e9, gMin = 1e9;
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const g = S.gy(cx - oW / 2 - 0.2 + ((oW + 0.4) * i) / 6, cz - oD / 2 - 0.2 + ((oD + 0.4) * j) / 6);
      if (g > gMax) gMax = g;
      if (g < gMin) gMin = g;
    }
  }
  const fy = gMax + 0.12;
  const depth = fy - gMin + 0.7;
  S.box(found, cx, fy - depth / 2, cz, oW + 0.1, depth, oD + 0.1, { uv });
  if (floor) S.vis(floor, G.plane(inW, inD), [cx, fy + 0.004, cz], [-HP, 0, 0], null, uv);
  const zb = cz - inD / 2 - T / 2, zf = cz + inD / 2 + T / 2;
  S.box(wall, cx, fy + H / 2, zb, oW, H, T, { uv });
  S.box(wall, cx - inW / 2 - T / 2, fy + H / 2, cz, T, H, inD, { uv });
  S.box(wall, cx + inW / 2 + T / 2, fy + H / 2, cz, T, H, inD, { uv });
  const x0 = cx - oW / 2, x1 = cx + oW / 2, d0 = cx + dx - dw / 2, d1 = cx + dx + dw / 2;
  if (d0 - x0 > 0.01) S.box(wall, (x0 + d0) / 2, fy + H / 2, zf, d0 - x0, H, T, { uv });
  if (x1 - d1 > 0.01) S.box(wall, (d1 + x1) / 2, fy + H / 2, zf, x1 - d1, H, T, { uv });
  S.box(wall, cx + dx, fy + dh + (H - dh) / 2, zf, dw, H - dh, T, { uv });
  // roof: visual may tilt a little, the collider stays flat
  S.kit.add(roof, G.box(oW + 0.3, roofT, oD + 0.3), [cx, fy + H + roofT / 2, cz], [roofTilt, 0, 0], null, uv);
  S.col(cx, fy + H + roofT / 2, cz, oW + 0.3, roofT, oD + 0.3);
  // door frame trim
  const trim = M('metal_dark');
  for (const sx of [-1, 1]) S.box(trim, cx + dx + sx * (dw / 2 + 0.03), fy + dh / 2, zf + T / 2 + 0.02, 0.06, dh, 0.05, { col: false });
  S.box(trim, cx + dx, fy + dh + 0.03, zf + T / 2 + 0.02, dw + 0.12, 0.06, 0.05, { col: false });
  // steps: fixed rise (autostep 0.45), stop once the ground reaches the step
  const frontZ = cz + oD / 2, doorX = cx + dx, SW = dw + 0.4, RISE = 0.28, DEPTH = 0.42;
  let steps = 0;
  for (let k = 1; k <= 12; k++) {
    const top = fy - k * RISE;
    const z0 = frontZ + (k - 1) * DEPTH, z1 = z0 + DEPTH;
    const gs = [S.gy(doorX, z0), S.gy(doorX, z1), S.gy(doorX - SW / 2, z0), S.gy(doorX + SW / 2, z0), S.gy(doorX - SW / 2, z1), S.gy(doorX + SW / 2, z1)];
    if (Math.max(...gs) >= top) break;
    const bottom = Math.min(...gs) - 0.3;
    S.box(found, doorX, (top + bottom) / 2, (z0 + z1) / 2, SW, top - bottom, DEPTH, { uv: 1 });
    steps++;
  }
  return { fy, frontZ, doorX, steps };
}

// ============================================================================ outpost types
function buildCamp(S, R, B, hasCrate) {
  const n = R.int(2, 3);
  const a0 = R.float(0, TAU);
  const tints = [0x6f7a4c, 0x8a5a3a, 0x4d5d6e, 0x9a8a5a, 0x7a3a34];
  const tents = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * TAU) / n + R.float(-0.25, 0.25);
    const d = R.float(3.9, 4.5);
    const tint = tints[R.int(0, tints.length - 1)];
    const px = Math.sin(a) * d, pz = Math.cos(a) * d;
    buildTent(S, px, pz, a + Math.PI, tint);   // door (+Z) faces the fire
    tents.push({ a, d });
  }
  // campfire (burning: somebody was here not long ago...)
  const fy = S.gy(0, 0);
  S.disc(0, 0, 1.5, 2, 10, 0.04, M('dirt', 0x2e2a26, { decal: true }));
  if (!S.prop('ext:ks_campfire_pit', 0, 0, 0, { y: fy - 0.02, scale: 1.9 })) {
    const stone = M('rock', 0x8a8680, { flat: true }), bark = M('bark', 0x9a8060);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      S.vis(stone, G.ico(0.17, 0), [Math.sin(a) * 0.62, fy + 0.06, Math.cos(a) * 0.62], [a, a * 2, 0], [1.2, 0.7, 1]);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      S.kit.limb(bark, [Math.sin(a) * 0.5, fy + 0.04, Math.cos(a) * 0.5], [Math.sin(a) * 0.06, fy + 0.5, Math.cos(a) * 0.06], 0.07, 0.05, 5);
    }
  }
  const ember = MB(null, 0xff6a20);
  for (let i = 0; i < 5; i++) { const a = i * 2.4; S.vis(ember, G.box(0.08, 0.04, 0.08), [Math.sin(a) * 0.25, fy + 0.04, Math.cos(a) * 0.25], [0, a, 0]); }
  S.flame(0, fy + 0.1, 0, 1.05, { dy: 0.8, color: 0xff8a3a, intensity: 1.5, distance: 14 });
  // gaps between tents: log benches, one may hold the supply crate
  const crateGap = hasCrate ? 1 % n : -1;
  const gaps = [];
  for (let k = 0; k < n; k++) gaps.push(a0 + ((k + 0.5) * TAU) / n);
  gaps.forEach((ga, k) => {
    if (k === crateGap) return;
    const px = Math.sin(ga) * 2.2, pz = Math.cos(ga) * 2.2, yaw = ga + HP, gy = S.gy(px, pz);
    if (!S.prop('ext:ks_tree_log', px, pz, yaw, { y: gy - 0.08, scale: 0.75 })) {
      S.sub(px, gy + 0.17, pz, yaw).add(M('bark', 0x8a7050), G.cyl(0.2, 0.22, 1.8, 7), null, [HP, 0, 0]);
    }
    S.col(px, gy + 0.2, pz, 0.42, 0.4, 1.8, yaw);
  });
  if (hasCrate) {
    const ga = gaps[crateGap];
    S.supplyCrate(Math.sin(ga) * 3.3, Math.cos(ga) * 3.3, ga + Math.PI, undefined, crateDifficulty(R, B));
  }
  // supplies left behind the tents
  const nBox = R.int(1, 2);
  const placed = [];
  for (let i = 0; i < nBox; i++) {
    const t = tents[i % tents.length];
    const a = t.a + R.sign() * R.float(0.45, 0.6), d = R.float(5.4, 6.1), seed = R.int(0, 9999), yaw = R.float(0, TAU);
    const id = i === 0 ? 'crate_wood' : 'barrel';
    const px = Math.sin(a) * d, pz = Math.cos(a) * d;
    if (!S.clear(px, pz, 0.9)) continue;
    S.prop(id, px, pz, yaw, { seed });
    placed.push([px, pz]);
  }
  // scrap: in front of each tent door, by the fire
  const cands = tents.map((t) => { const d = t.d - 2.0; return [Math.sin(t.a) * d, Math.cos(t.a) * d]; });
  gaps.forEach((ga, k) => { if (k !== crateGap) cands.push([Math.sin(ga + 0.5) * 1.35, Math.cos(ga + 0.5) * 1.35]); });
  S.pickSpots(cands, R.int(2, 3));
}

function buildTent(S, px, pz, yaw, tint) {
  const W = 2.3, H = 1.65, L = 2.5;
  const gy = S.gy(px, pz) - 0.03;
  if (!S.prop('ext:ks_tent_canvas', px, pz, yaw, { y: gy, scale: 1.75 })) {
    const cloth = M('fabric', tint, { double: true }), pole = M('metal_dark');
    const f = S.sub(px, gy, pz, yaw);
    f.add(cloth, G.quad([-W / 2, 0, -L / 2], [-W / 2, 0, L / 2], [0, H, L / 2], [0, H, -L / 2]));
    f.add(cloth, G.quad([W / 2, 0, L / 2], [W / 2, 0, -L / 2], [0, H, -L / 2], [0, H, L / 2]));
    f.add(cloth, G.tri([-W / 2, 0, -L / 2], [W / 2, 0, -L / 2], [0, H, -L / 2]));
    f.add(cloth, G.tri([-W / 2, 0, L / 2], [-W * 0.16, 0, L / 2 + 0.4], [0, H, L / 2]));   // open door flaps
    f.add(cloth, G.tri([W * 0.16, 0, L / 2 + 0.4], [W / 2, 0, L / 2], [0, H, L / 2]));
    f.add(M('fabric', 0x3a3a34), G.plane(W - 0.25, L - 0.1), [0, 0.04, 0], [-HP, 0, 0]);
    f.add(pole, G.cyl(0.025, 0.025, L + 0.3, 5), [0, H, 0], [HP, 0, 0]);
    for (const z of [-L / 2, L / 2]) f.add(pole, G.cyl(0.025, 0.025, H, 5), [0, H / 2, z]);
  }
  S.col(px, gy + 0.62, pz, W * 0.85, 1.25, L, yaw);
}

function buildCargo(S, R, B, hasCrate) {
  const tiltX = -R.float(0.24, 0.34), roll = R.float(-0.07, 0.07), seed = R.int(0, 9999);
  const openL = R.float(0.55, 0.95), openR = R.float(0.2, 0.9);
  const g0 = S.gy(0, 0);
  const base = g0 - 0.35;
  S.disc(0, 0, 5.4, 3, 12, 0.05, M('dirt', 0x4a3b2e, { decal: true }));
  // the container came down nose first (-Z buried), the door end sticks up
  const cont = S.prop('shipping_container', 0, 0, 0, { y: base, rx: tiltX, rz: roll, cols: false, seed });
  const an = cont?.userData.anchors;
  if (an?.doorL) an.doorL.rotation.y = (an.doorL.userData.openAngle ?? -2.6) * openL;
  if (an?.doorR) an.doorR.rotation.y = (an.doorR.userData.openAngle ?? 2.6) * openR;
  // stepped colliders following the tilt (rapier boxes here only yaw)
  const Hc = 2.59, Lh = 3.03, W = 2.44, sn = Math.sin(tiltX), cs = Math.cos(tiltX);
  const zMin = Hc * sn - Lh * cs, zMax = Lh * cs;
  const topMax = Hc * cs - Lh * sn;
  const topAt = (zp) => Math.min(topMax, Hc * cs - (sn * (zp - Hc * sn)) / cs);
  for (let i = 0; i < 4; i++) {
    const za = zMin + ((zMax - zMin) * i) / 4, zb = zMin + ((zMax - zMin) * (i + 1)) / 4;
    const top = base + topAt(zb);
    const bottom = Math.min(S.gy(-W / 2, za), S.gy(W / 2, za), S.gy(-W / 2, zb), S.gy(W / 2, zb)) - 0.4;
    S.col(0, (top + bottom) / 2, (za + zb) / 2, W, top - bottom, zb - za);
  }
  const placed = [];
  // supply crate right below the doors (it is a supply drop after all)
  const cx = R.float(-1.4, 1.4), cz = zMax + R.float(1.9, 2.6), crot = R.float(-0.4, 0.4);
  if (hasCrate) {
    S.supplyCrate(cx, cz, crot, undefined, crateDifficulty(R, B));
    placed.push([cx, cz]);
  }
  // spilled cargo
  const types = ['crate_wood', 'cardboard_boxes', 'crate_metal', 'barrel', 'crate_wood'];
  const nb = R.int(4, 6);
  for (let i = 0; i < nb; i++) {
    const id = types[R.int(0, types.length - 1)];
    const px = R.float(-3.3, 3.3), pz = zMax + R.float(0.9, 4.8), yaw = R.float(0, TAU), pseed = R.int(0, 9999);
    if (placed.some((p) => Math.hypot(p[0] - px, p[1] - pz) < 1.5)) continue;
    if (!S.clear(px, pz, 1.0)) continue;
    S.prop(id, px, pz, yaw, { seed: pseed });
    placed.push([px, pz]);
  }
  // parachute canopy dragged behind the buried nose + lines
  const pcx = R.float(-1.2, 1.2), pcz = zMin - R.float(3.2, 4.0), pyaw = R.float(-0.4, 0.4);
  S.drape(pcx, pcz, 5.6, 4.6, pyaw, 0.4, M('awning', 0xffffff, { double: true }));
  const noseY = base + topAt(zMin + 0.4), line = M('rubber', 0xd0c8b0);
  for (const [ox, oz] of [[-2.5, 2.0], [2.5, 2.0], [-1.1, 2.3], [1.1, 2.3]]) {
    const [rx, rz] = rot2(ox, oz, pyaw);
    const x = pcx + rx, z = pcz + rz;
    S.kit.limb(line, [x, S.gy(x, z) + 0.12, z], [ox * 0.3, noseY, zMin + 0.5], 0.015, 0.015, 3);
  }
  // emergency flare
  const fx = R.float(-2.6, 2.6), fz = zMax + R.float(1.2, 3.2), fg = S.gy(fx, fz);
  S.vis(MB(null, 0xff3020), G.cyl(0.03, 0.03, 0.32, 5), [fx, fg + 0.08, fz], [0, 0, 1.2]);
  S.vis(MB(null, 0xffd0b0), G.sph(0.05, 5, 4), [fx + 0.14, fg + 0.14, fz]);
  S.light(fx, fg + 0.45, fz, 0xff3a24, 1.0, 9, 0.55);
  // scrap
  const cands = [[-1.3, zMax + 1.0], [1.3, zMax + 1.2], [0.2, zMax + 3.4], [-2.3, 0.4], [2.4, -1.0], [-2.1, zMin + 0.9], [2.8, zMax + 2.2]]
    .filter((c) => placed.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) > 1.0));
  S.pickSpots(cands, R.int(2, 4));
}

function buildBunker(S, R, B, hasCrate) {
  const IN = 6, T = 0.35, H = 2.7;
  const hut = buildHut(S, {
    cx: 0, cz: 0, inW: IN, inD: IN, T, H, dw: 1.4, dh: 2.2,
    wall: M('concrete', 0x9a9a92), floor: M('concrete_stained', 0xffffff, { decal: true }), roof: M('concrete_dark', 0x8a8a86),
    found: M('concrete_dark', 0x8a8a86), uv: 2, roofT: 0.35,
  });
  const f = hut.fy, face = IN / 2 + T + 0.006, dec = (t) => M(t, 0xffffff, { decal: true });
  // outside: hazard frame, warning sign, graffiti, roof vent + hatch
  for (const sx of [-1, 1]) S.vis(dec('hazard_stripes'), G.plane(0.22, 2.2), [sx * 0.86, f + 1.1, face]);
  S.vis(dec('sign_danger'), G.plane(0.7, 0.7), [1.9, f + 1.55, face]);
  S.vis(M('graffiti'), G.plane(2.6, 1.3), [face, f + 1.25, -0.4], [0, HP, 0]);
  S.box(M('metal_rust'), -1.8, f + H + 0.35 + 0.3, -1.6, 0.35, 0.6, 0.35, { col: false });
  S.box(M('metal_dark'), 1.4, f + H + 0.35 + 0.06, 1.2, 0.9, 0.12, 0.9, { col: false });
  // door light (flickers a little) + interior hanging bulb (flickers a lot)
  S.box(M('metal_dark'), 0, f + 2.2 + 0.3, face + 0.1, 0.3, 0.14, 0.22, { col: false });
  S.vis(MB(null, 0xffd890), G.plane(0.22, 0.16), [0, f + 2.2 + 0.22, face + 0.12], [HP, 0, 0]);
  S.light(0, f + 2.25, face + 0.6, 0xffc080, 0.7, 6.5, 0.12);
  S.vis(M('metal_dark'), G.cyl(0.012, 0.012, 0.45, 4), [0, f + H - 0.225, 0]);
  S.vis(M('paint', 0x3a4a3a, { double: true }), G.cyl(0.06, 0.26, 0.18, 8, true), [0, f + H - 0.52, 0]);
  S.vis(MB(null, 0xfff0c0), G.sph(0.07, 6, 4), [0, f + H - 0.6, 0]);
  S.light(0, f + H - 0.75, 0, 0xffd8a0, 1.1, 8.5, 0.45);
  // furniture
  S.prop('shelf_metal', -1.5, -2.72, 0, { y: f, seed: R.int(0, 9999) });
  const dk = M('metal_dark');
  S.box(dk, -2.45, f + 0.22, 0.35, 0.85, 0.06, 1.95, { col: false });                        // cot
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(dk, -2.45 + sx * 0.38, f + 0.1, 0.35 + sz * 0.92, 0.05, 0.2, 0.05, { col: false });
  S.box(M('mattress', 0xc8c0a8), -2.45, f + 0.32, 0.35, 0.8, 0.14, 1.85, { col: false });
  S.col(-2.45, f + 0.2, 0.35, 0.85, 0.4, 1.95);
  S.box(M('wood_planks', 0xb09070), 1.35, f + 0.76, -2.55, 1.2, 0.05, 0.7, { col: false });   // table
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(dk, 1.35 + sx * 0.54, f + 0.37, -2.55 + sz * 0.3, 0.05, 0.74, 0.05, { col: false });
  S.col(1.35, f + 0.39, -2.55, 1.2, 0.78, 0.7);
  S.prop('barrel', 2.45, 2.4, 0, { y: f, seed: R.int(0, 9999) });
  S.prop('crate_metal', -2.3, 2.35, 0, { y: f, seed: R.int(0, 9999) });
  S.vis(M('blood_splat'), G.plane(1.3, 1.3), [-1.2, f + 0.012, 0.9], [-HP, 0, 0.7]);
  S.vis(M('cobweb'), G.plane(1.0, 1.0), [2.7, f + H - 0.35, -2.7], [0, -Math.PI / 4, 0]);
  if (hasCrate) S.supplyCrate(2.58, 0.25, -HP, f, crateDifficulty(R, B), 1.55);
  // a torn-off door slab lying outside
  const dsx = R.float(-2.4, -1.4), dsz = IN / 2 + T + R.float(1.2, 2.2);
  S.box(M('door_metal'), dsx, S.gy(dsx, dsz) + 0.06, dsz, 1.2, 0.06, 2.1, { col: false, ry: R.float(-0.6, 0.6), rz: 0.05, uv: 1 });
  S.pickSpots([[-1.1, -2.1], [1.35, -2.55, f + 0.785], [0.2, -0.6], [-1.5, 1.6], [1.3, 1.5], [-0.9, 0.3]].map((c) => [c[0], c[1], c[2] ?? f]), R.int(2, 4));
}

function buildRadio(S, R, B, hasCrate) {
  const tx = -4.8, tz = -2.2, tg = S.gy(tx, tz);
  S.prop('radio_tower', tx, tz, 0, { seed: R.int(0, 9999), lights: false, y: tg - 0.05 });
  const cx = 2.2, cz = 0.8, inW = 3.0, inD = 2.4, H = 2.35;
  const hut = buildHut(S, {
    cx, cz, inW, inD, T: 0.15, H, dw: 1.0, dh: 2.0, dx: -0.6,
    wall: M('container', 0x7c8a78), floor: M('wood_planks', 0x9a8a70, { decal: true }), roof: M('metal_rust', 0xb0a090),
    found: M('concrete_dark', 0x8a8a86), uv: 1.5, roofT: 0.12, roofTilt: 0.07,
  });
  const f = hut.fy, backZ = cz - inD / 2, dz = backZ + 0.32, dk = M('metal_dark');
  // radio desk
  S.box(M('wood_dark', 0xa08060), cx + 0.3, f + 0.745, dz, 1.8, 0.05, 0.6, { col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(dk, cx + 0.3 + sx * 0.84, f + 0.36, dz + sz * 0.25, 0.05, 0.72, 0.05, { col: false });
  S.col(cx + 0.3, f + 0.385, dz, 1.8, 0.77, 0.6);
  // radio set on the right half of the desk (left half stays free for scrap), mic in the middle
  S.box(M('metal_dark', 0x606860), cx + 0.45, f + 0.97, dz - 0.08, 0.7, 0.4, 0.36, { col: false });
  S.box(M('metal_dark', 0x505850), cx + 1.0, f + 0.88, dz - 0.1, 0.35, 0.22, 0.3, { col: false });
  for (const gx of [0.25, 0.43]) S.vis(M('gauge', 0xffffff, { decal: true }), G.circ(0.07, 8), [cx + gx, f + 1.04, dz + 0.102]);
  S.vis(MB('screen_terminal'), G.plane(0.22, 0.13), [cx + 0.63, f + 0.99, dz + 0.102]);
  S.kit.limb(dk, [cx + 0.02, f + 0.77, dz + 0.08], [cx + 0.0, f + 1.0, dz + 0.14], 0.012, 0.012, 4);
  S.vis(dk, G.sph(0.035, 5, 4), [cx + 0.0, f + 1.02, dz + 0.15]);
  S.vis(M('poster_missing', 0xffffff, { decal: true }), G.plane(0.45, 0.6), [cx - 0.9, f + 1.55, backZ + 0.004]);
  // lamp over the desk
  S.box(dk, cx + 0.3, f + 2.08, backZ + 0.08, 0.2, 0.08, 0.14, { col: false });
  S.vis(MB(null, 0xffe8b0), G.sph(0.06, 6, 4), [cx + 0.3, f + 2.0, backZ + 0.14]);
  S.light(cx + 0.3, f + 1.85, backZ + 0.55, 0xffe0b0, 0.9, 7, 0.3);
  // roof mast + antenna cable sagging over to the tower
  const mx = cx + 1.2, mz = cz - 0.8, mTop = f + 4.2;
  S.kit.limb(dk, [mx, f + H + 0.1, mz], [mx, mTop, mz], 0.03, 0.02, 4);
  const a = [tx + 0.3, tg + 11, tz + 0.3], b = [mx, mTop - 0.1, mz];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.3, (a[2] + b[2]) / 2];
  const cable = M('rubber', 0x202020);
  S.kit.limb(cable, a, mid, 0.015, 0.015, 3);
  S.kit.limb(cable, mid, b, 0.015, 0.015, 3);
  // generator + fuel outside
  S.prop('generator', cx + 3.0, cz - 0.2, HP, { seed: R.int(0, 9999) });
  S.prop('barrel', cx + 2.7, cz + 2.1, 0, { seed: R.int(0, 9999) });
  if (hasCrate) S.supplyCrate(cx + 0.8, cz + inD / 2 - 0.4, Math.PI, f, crateDifficulty(R, B), 1.5);
  // the spot in front of the door lies past the last step, never on one
  const doorZ = hut.frontZ + hut.steps * 0.42 + 0.9;
  S.pickSpots([[cx - 0.4, dz, f + 0.77], [cx - 1.0, cz + 0.3, f], [cx + 1.9, cz + 2.0], [tx + 1.8, tz + 1.8], [hut.doorX - 0.2, doorZ]], R.int(2, 3));
}

function buildLander(S, R, B, hasCrate) {
  const yaw = R.float(0, TAU), tx = R.float(-0.16, 0.16), tz = R.float(0.12, 0.22) * R.sign();
  const g0 = S.gy(0, 0);
  const snow = B.moon?.biome === 'snow';
  S.disc(0, 0, 6.8, 3, 14, 0.05, M('dirt', snow ? 0x3a3634 : 0x2e241c, { decal: true }));
  // the GLB (about 7 x 6 x 7 m) is scaled to the primitive wreck's ~5.4 m footprint, so the fixed hull
  // collider, the crate and the scrap spots fit either way (layout never depends on the model loading)
  const ls = extSize('kk_lander_a');
  const lscale = ls ? Math.min(1, LANDER_SPAN / Math.max(ls.x, ls.z, 0.1)) : 1;
  if (!S.prop('ext:kk_lander_a', 0, 0, yaw, { y: g0 - 0.5, rx: tx, rz: tz, scale: lscale })) landerPrims(S, g0, yaw, tx, tz);
  S.col(0, g0 + 1.0, 0, 3.6, 3.2, 3.6, yaw);   // fixed hull collider (same with or without the GLB)
  const [sx, sz] = rot2(1.7, 0.6, yaw);
  S.light(sx, g0 + 1.7, sz, 0x9fd8ff, 0.9, 7, 0.75);   // sparking breach
  // everything on the ground stays outside the legs (primitive feet reach ~4.3 m on the diagonals)
  const fa = R.float(0, TAU), fd = R.float(4.6, 5.4), ffx = Math.sin(fa) * fd, ffz = Math.cos(fa) * fd;
  S.vis(M('metal_rust', 0x806050), G.box(0.9, 0.12, 0.6), [ffx, S.gy(ffx, ffz) + 0.05, ffz], [0.1, fa, -0.08]);
  S.flame(ffx, S.gy(ffx, ffz) + 0.08, ffz, 0.55, null);
  // debris
  const nd = R.int(5, 7);
  for (let i = 0; i < nd; i++) {
    const a = R.float(0, TAU), d = R.float(3.2, 7.2), w = R.float(0.5, 1.5), l = R.float(0.4, 1.2);
    const rx = R.float(-0.5, 0.5), ry = R.float(0, TAU), rz = R.float(-0.5, 0.5), rust = R.chance(0.5);
    const px = Math.sin(a) * d, pz = Math.cos(a) * d;
    S.box(M(rust ? 'metal_rust' : 'metal_plate', 0xb0b0a8), px, S.gy(px, pz) + 0.08, pz, w, 0.05, l, { rx, ry, rz, col: false, uv: 1 });
  }
  const placed = [[ffx, ffz]];
  const ca = R.float(0, TAU);
  if (hasCrate) {
    const px = Math.sin(ca) * 4.5, pz = Math.cos(ca) * 4.5;
    S.supplyCrate(px, pz, ca, undefined, crateDifficulty(R, B));
    placed.push([px, pz]);
  }
  for (let i = 0; i < 2; i++) {
    const a = R.float(0, TAU), d = R.float(4.5, 6.5), id = R.chance(0.5) ? 'crate_metal' : 'barrel', seed = R.int(0, 9999), rot = R.float(0, TAU);
    const px = Math.sin(a) * d, pz = Math.cos(a) * d;
    if (placed.some((p) => Math.hypot(p[0] - px, p[1] - pz) < 1.5) || !S.clear(px, pz, 1.0)) continue;
    S.prop(id, px, pz, rot, { seed });
    placed.push([px, pz]);
  }
  const a1 = R.float(0, TAU), cands = [];
  for (let i = 0; i < 6; i++) {
    const a = a1 + (i * TAU) / 6 + R.float(-0.3, 0.3), d = R.float(4.4, 6.0);
    const px = Math.sin(a) * d, pz = Math.cos(a) * d;
    if (placed.every((p) => Math.hypot(p[0] - px, p[1] - pz) > 1.1)) cands.push([px, pz]);
  }
  S.pickSpots(cands, R.int(2, 4));
}

function landerPrims(S, g0, yaw, tx, tz) {
  const g = new THREE.Group();
  g.position.set(0, g0 - 0.55, 0);
  g.rotation.order = 'YXZ';
  g.rotation.set(tx, yaw, tz);
  S.root.add(g);
  const k = new Kit();
  const hull = M('metal_plate', 0xc4c6c0), dark = M('metal_dark'), rust = M('metal_rust', 0xb09080);
  k.add(hull, G.cyl(1.75, 1.95, 2.3, 8), [0, 1.25, 0], null, null, 1.5);
  k.add(dark, G.cyl(1.98, 1.98, 0.22, 8), [0, 0.4, 0]);
  k.add(hull, G.cyl(0.55, 1.75, 1.3, 8), [0, 3.05, 0], null, null, 1.5);
  k.add(MB(null, 0x1c2830), G.box(0.9, 0.34, 0.08), [0, 2.95, 1.28], [-0.72, 0, 0]);
  k.add(dark, G.cyl(0.5, 0.95, 0.9, 8, true), [0, -0.25, 0]);
  k.add(MB(null, 0x0c0a08), G.plane(0.9, 0.7), [1.93, 1.35, 0.35], [0, HP, 0.2]);
  [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => {
    const broken = i === 2;
    const a = [sx * 1.25, 0.8, sz * 1.25], b = broken ? [sx * 2.0, 0.35, sz * 2.0] : [sx * 2.75, -0.15, sz * 2.75];
    k.limb(rust, a, b, 0.1, 0.08, 6);
    if (!broken) k.add(dark, G.cyl(0.36, 0.4, 0.08, 6), [b[0], b[1] - 0.04, b[2]]);
  });
  k.add(dark, G.cyl(0.03, 0.03, 1.2, 4), [0.3, 4.2, -0.2]);
  k.into(g);
  const [bx, bz] = rot2(-3.2, -2.4, yaw);   // the snapped leg lies next to the wreck
  S.kit.limb(rust, [bx, S.gy(bx, bz) + 0.1, bz], [bx + 1.3, S.gy(bx + 1.3, bz + 0.4) + 0.12, bz + 0.4], 0.09, 0.08, 6);
}

function crateDifficulty(R, B) {
  const tier = B.moon?.tier || 1;
  return Math.max(0.2, Math.min(0.85, 0.3 + tier * 0.08 + R.float(-0.05, 0.1)));
}

// ---------------------------------------------------------------------------- crashed uplink dish
// A satellite dish ripped off its pedestal, lying on its rim; the feed horn still blinks. An equipment
// cabinet by the broken concrete pad hums on backup power.
function buildDish(S, R, B, hasCrate) {
  const g0 = S.gy(0, 0);
  S.disc(0, 0, 7.4, 3, 14, 0.05, M('dirt', 0x2c2824, { decal: true }));
  // broken concrete pad + pedestal stub (-X side)
  const px = -3.6, pz = -1.2;
  let pMax = -1e9, pMin = 1e9;
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6], [0, 0]]) { const g = S.gy(px + dx, pz + dz); pMax = Math.max(pMax, g); pMin = Math.min(pMin, g); }
  const padTop = pMax + 0.18, padD = padTop - pMin + 0.5;
  S.box(M('concrete_dark', 0x9a9a92), px, padTop - padD / 2, pz, 3.2, padD, 3.2, { uv: 1.5 });
  const stubH = 1.5, dk = M('metal_dark'), rust = M('metal_rust', 0xb09080);
  S.box(dk, px, padTop + stubH / 2, pz, 1.1, stubH, 1.1, { uv: 1 });
  for (let i = 0; i < 4; i++) S.vis(rust, G.box(0.55, 0.05, 0.3), [px + R.float(-0.4, 0.4), padTop + stubH + 0.05, pz + R.float(-0.4, 0.4)], [R.float(-0.7, 0.7), R.float(0, TAU), R.float(-0.7, 0.7)]);
  S.vis(M('hazard_stripes', 0xffffff, { decal: true }), G.plane(1.0, 0.18), [px, padTop + 0.35, pz + 0.556]);
  // the dish: a shallow bowl on its side, the low rim dug into the ground
  const dishR = R.float(2.9, 3.4), tilt = R.float(0.95, 1.2), yaw = R.float(-0.5, 0.5);
  const dx0 = 1.3, dz0 = 0.3;
  const gd = S.gy(dx0, dz0 + dishR * Math.cos(tilt));
  const cy = gd + dishR * Math.sin(tilt) - 0.35;
  const dg = new THREE.Group();
  dg.position.set(dx0, cy, dz0);
  dg.rotation.order = 'YXZ';
  dg.rotation.set(tilt, yaw, R.float(-0.12, 0.12));
  S.root.add(dg);
  const k = new Kit();
  const dishMat = M('metal_plate', 0xdadcd6, { double: true });
  k.add(dishMat, G.hemi(dishR, 16, 4), [0, 0, 0], [Math.PI, 0, 0], [1, 0.32, 1], 1.5);
  k.add(dk, G.tor(dishR, 0.07, 4, 20), [0, 0, 0], [HP, 0, 0]);
  const focal = [0, dishR * 0.95, 0];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    k.limb(dk, [Math.cos(a) * dishR * 0.82, -0.02, Math.sin(a) * dishR * 0.82], focal, 0.045, 0.035, 5);
  }
  k.add(dk, G.cyl(0.16, 0.26, 0.5, 8), [focal[0], focal[1] - 0.2, focal[2]]);
  k.add(MB(null, 0xff2a20), G.sph(0.09, 6, 4), [focal[0], focal[1] + 0.1, focal[2]]);
  // back mount (lattice stub torn off the pedestal)
  k.limb(rust, [0, -dishR * 0.32, 0], [0, -dishR * 0.32 - 0.9, 0.2], 0.2, 0.16, 6);
  k.into(dg);
  const fw = new THREE.Vector3(...focal).applyEuler(dg.rotation).add(dg.position);
  S.light(fw.x, fw.y + 0.2, fw.z, 0xff3a24, 0.9, 9, 0.7);
  // colliders: the bowl as a yawed slab through its centre, plus the low rim on the ground
  const depth = Math.max(1.2, dishR * Math.cos(tilt) * 1.6);
  S.col(dx0, cy, dz0 + 0.1, dishR * 1.8, dishR * 1.7, depth, yaw);
  // cable from the pedestal to the dish, debris
  const cable = M('rubber', 0x202020);
  S.kit.limb(cable, [px + 0.4, padTop + 0.6, pz + 0.5], [dx0 - 1.2, S.gy(dx0 - 1.2, dz0 - 1.4) + 0.08, dz0 - 1.4], 0.03, 0.03, 4);
  S.kit.limb(cable, [dx0 - 1.2, S.gy(dx0 - 1.2, dz0 - 1.4) + 0.08, dz0 - 1.4], [dx0, cy - 0.8, dz0 - 0.8], 0.03, 0.03, 4);
  const placed = [[px, pz], [dx0, dz0]];
  for (let i = 0; i < R.int(4, 6); i++) {
    const a = R.float(0, TAU), d = R.float(4.2, 7.0), w = R.float(0.4, 1.3), l = R.float(0.4, 1.0);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    S.box(M(R.chance(0.5) ? 'metal_plate' : 'metal_rust', 0xc8c8c0), x, S.gy(x, z) + 0.06, z, w, 0.05, l, { rx: R.float(-0.4, 0.4), ry: R.float(0, TAU), rz: R.float(-0.4, 0.4), col: false, uv: 1 });
  }
  // equipment cabinet on backup power
  const cx = px + 0.2, cz = pz + 2.7, cg = S.gy(cx, cz);
  S.box(M('metal_dark', 0x6a7068), cx, cg + 0.8, cz, 0.9, 1.6, 0.6, { uv: 1 });
  S.vis(M('server_front', 0xffffff, { decal: true }), G.plane(0.8, 1.4), [cx, cg + 0.82, cz + 0.305]);
  S.vis(MB(null, 0x60ff90), G.box(0.06, 0.06, 0.02), [cx + 0.3, cg + 1.45, cz + 0.31]);
  S.light(cx, cg + 1.3, cz + 0.8, 0x70ffa0, 0.55, 5, 0.5);
  placed.push([cx, cz]);
  if (hasCrate) {
    const x = cx + 1.6, z = cz + 0.6;
    S.supplyCrate(x, z, R.float(-0.4, 0.4), undefined, crateDifficulty(R, B));
    placed.push([x, z]);
  }
  const cands = [[cx - 1.2, cz + 0.4], [px + 2.2, pz - 1.4], [dx0 + dishR + 0.9, dz0 - 0.4], [dx0 - 0.3, dz0 + dishR + 1.4], [px - 0.6, pz + 0.2, padTop], [dx0 - dishR - 0.4, dz0 + 2.2]]
    .filter((c) => placed.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) > 1.0 || c[2] !== undefined));
  S.pickSpots(cands, R.int(2, 4));
}

// ---------------------------------------------------------------------------- abandoned stream van
// A streamer's van with its side door open, the LIVE light still on, a tripod and a folding chair
// outside. The cab faces local +Z.
function buildVan(S, R, B, hasCrate) {
  const W = 2.0, wheelR = 0.38;
  const gs = [S.gy(-0.9, -1.7), S.gy(0.9, -1.7), S.gy(-0.9, 1.7), S.gy(0.9, 1.7), S.gy(0, 0)];
  const gMax = Math.max(...gs), gMin = Math.min(...gs);
  const by = gMax + wheelR * 0.85;   // chassis bottom
  const paintC = R.pick([0xd8d4c8, 0x3a5a8a, 0x8a2a2a, 0x2c2c30, 0x6a7a3a]);
  const paint = M('paint', paintC), dk = M('metal_dark'), rubber = M('rubber', 0x1a1a1a);
  S.disc(0, 0, 4.6, 2, 12, 0.05, M('dirt', 0x3a3028, { decal: true }));
  // cargo box (z -2.4..1.0) + cab (z 1.0..2.5)
  S.box(paint, 0, by + 1.05, -0.7, W, 2.1, 3.4, { uv: 1 });
  S.box(paint, 0, by + 0.72, 1.75, W, 1.44, 1.5, { uv: 1 });
  S.box(dk, 0, by + 0.06, 0, W - 0.1, 0.12 + (gMax - gMin), 4.8, { col: false });
  // windshield / windows / lights / stripe
  S.vis(MB(null, 0x141c22), G.plane(W - 0.2, 0.62), [0, by + 1.08, 2.52], [-0.35, 0, 0]);
  for (const sx of [-1, 1]) S.vis(MB(null, 0x141c22), G.plane(1.0, 0.5), [sx * (W / 2 + 0.003), by + 1.1, 1.8], [0, sx * HP, 0]);
  for (const sx of [-1, 1]) S.vis(MB(null, 0xfff0b0), G.plane(0.3, 0.16), [sx * 0.66, by + 0.62, 2.505]);
  S.vis(MB(null, 0x401010), G.plane(W - 0.3, 0.12), [0, by + 0.35, -2.405], [0, Math.PI, 0]);
  const stripe = M('paint', paintC === 0xd8d4c8 ? 0xc02a2a : 0xe8e0d0);
  for (const sx of [-1, 1]) S.vis(stripe, G.plane(4.6, 0.16), [sx * (W / 2 + 0.004), by + 0.95, -0.05], [0, sx * HP, 0]);
  S.light(0, by + 0.65, 3.2, 0xffe6b0, 0.6, 9, 0.35);   // dying headlights
  // wheels (rear left one flat)
  [[-1, -1.6], [1, -1.6], [-1, 1.7], [1, 1.7]].forEach(([sx, wz], i) => {
    const flat = i === 0;
    S.vis(rubber, G.cyl(wheelR, wheelR, 0.26, 10), [sx * (W / 2 - 0.08), by + (flat ? -0.1 : 0.02), wz], [0, 0, HP], flat ? [0.75, 1, 1] : null);
  });
  // open side door (+X): dark opening, the slid door panel behind it, a monitor glow inside
  S.vis(MB(null, 0x0a0a0c), G.plane(1.2, 1.7), [W / 2 + 0.004, by + 1.0, -0.2], [0, HP, 0]);
  S.box(paint, W / 2 + 0.06, by + 1.0, -1.35, 0.06, 1.75, 1.2, { col: false });
  S.vis(MB('screen_terminal'), G.plane(0.5, 0.32), [W / 2 - 0.9, by + 1.25, -0.2], [0, HP, 0]);
  S.light(W / 2 + 0.4, by + 1.2, -0.2, 0x8ad0ff, 0.55, 5.5, 0.25);
  // roof: small uplink dish + LIVE light
  S.vis(M('metal_plate', 0xdadad6, { double: true }), G.hemi(0.45, 10, 3), [0, by + 2.3, -1.6], [Math.PI - 0.7, 0.4, 0], [1, 0.35, 1]);
  S.vis(dk, G.cyl(0.04, 0.04, 0.3, 5), [0, by + 2.2, -1.6]);
  S.vis(MB(null, 0xff2020), G.box(0.3, 0.14, 0.14), [0.5, by + 2.2, 0.6]);
  S.light(0.5, by + 2.45, 0.6, 0xff3030, 0.5, 5, 0.6);
  // outside: tripod camera + folding chair + a cooler
  const tx = W / 2 + 2.4, tz = 1.3, tg = S.gy(tx, tz);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; S.kit.limb(dk, [tx + Math.sin(a) * 0.45, tg, tz + Math.cos(a) * 0.45], [tx, tg + 1.35, tz], 0.02, 0.02, 4); }
  S.vis(dk, G.box(0.28, 0.2, 0.36), [tx, tg + 1.47, tz], [0, -0.9, 0]);
  S.vis(MB(null, 0xff2020), G.sph(0.03, 5, 4), [tx + 0.1, tg + 1.58, tz + 0.1]);
  const chx = W / 2 + 1.6, chz = -2.6, chg = S.gy(chx, chz), fab = M('fabric', 0x3a4a6a, { double: true });
  S.vis(fab, G.plane(0.5, 0.45), [chx, chg + 0.45, chz], [-HP, 0, 0]);
  S.vis(fab, G.plane(0.5, 0.5), [chx, chg + 0.72, chz - 0.25], [-0.2, 0, 0]);
  for (const sx of [-1, 1]) S.kit.limb(dk, [chx + sx * 0.24, chg, chz - 0.25], [chx + sx * 0.24, chg + 0.46, chz + 0.22], 0.015, 0.015, 3);
  S.box(M('plastic', 0x2a6ab0), -W / 2 - 1.1, S.gy(-W / 2 - 1.1, 0.6) + 0.22, 0.6, 0.6, 0.44, 0.4, { ry: R.float(-0.5, 0.5) });
  const placed = [[tx, tz], [chx, chz], [-W / 2 - 1.1, 0.6]];
  if (hasCrate) {
    const x = W / 2 + 1.5, z = -0.4;
    S.supplyCrate(x, z, HP + R.float(-0.3, 0.3), undefined, crateDifficulty(R, B));
    placed.push([x, z]);
  }
  const cands = [[W / 2 + 1.0, 0.9], [-W / 2 - 1.3, -1.4], [0.4, -3.4], [W / 2 + 3.3, -1.6], [-1.6, 3.4], [-W / 2 - 1.2, 2.2]]
    .filter((c) => placed.every((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) > 1.1));
  S.pickSpots(cands, R.int(2, 3));
}

// ---------------------------------------------------------------------------- fenced server cage
// A chain-link pen on a concrete slab with a few racks still humming, fed by a generator outside, lit by
// a floodlight. Gate on the local +Z side (faces the ship).
function buildCage(S, R, B, hasCrate) {
  const HALF = 3.5, FH = 2.4, T = 0.08;
  let gMax = -1e9, gMin = 1e9;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const g = S.gy(-HALF - 0.3 + (i * (2 * HALF + 0.6)) / 4, -HALF - 0.3 + (j * (2 * HALF + 0.6)) / 4);
    gMax = Math.max(gMax, g); gMin = Math.min(gMin, g);
  }
  const f = gMax + 0.12, depth = f - gMin + 0.6;
  S.box(M('concrete_dark', 0x8a8a86), 0, f - depth / 2, 0, 2 * HALF + 0.6, depth, 2 * HALF + 0.6, { uv: 2 });
  S.vis(M('concrete_stained', 0xffffff, { decal: true }), G.plane(2 * HALF, 2 * HALF), [0, f + 0.004, 0], [-HP, 0, 0]);
  const post = M('metal', 0x9a9e9a), link = M('chainlink', 0xc0c4c0);
  const panel = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rot = Math.atan2(x1 - x0, z1 - z0) - HP;
    S.vis(link, G.plane(len, FH), [cx, f + FH / 2, cz], [0, rot, 0]);
    S.col(cx, f + FH / 2, cz, len, FH, T, rot);
    S.kit.limb(post, [x0, f + FH, z0], [x1, f + FH, z1], 0.025, 0.025, 4);
  };
  const G2 = 0.85;   // half gate width
  panel(-HALF, -HALF, HALF, -HALF);
  panel(-HALF, -HALF, -HALF, HALF);
  panel(HALF, -HALF, HALF, HALF);
  panel(-HALF, HALF, -G2, HALF);
  panel(G2, HALF, HALF, HALF);
  for (const [x, z] of [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF], [-G2, HALF], [G2, HALF], [0, -HALF], [-HALF, 0], [HALF, 0]]) {
    S.vis(post, G.cyl(0.05, 0.05, FH + 0.1, 6), [x, f + (FH + 0.1) / 2, z]);
  }
  // gate leaf hanging open + warning sign
  S.vis(link, G.plane(1.6, FH - 0.2), [G2 + 0.55, f + FH / 2, HALF + 0.6], [0, -1.0, 0]);
  S.vis(M('sign_danger', 0xffffff, { decal: true }), G.plane(0.55, 0.55), [-G2 - 0.6, f + 1.5, HALF + 0.02]);
  // racks along the back fence, one toppled
  const nR = R.int(3, 4);
  for (let i = 0; i < nR; i++) {
    const x = -HALF + 0.9 + (i * (2 * HALF - 1.8)) / Math.max(1, nR - 1);
    if (i === nR - 1 && R.chance(0.5)) {
      S.prop('server_rack_prop', x - 0.2, -0.6, 0, { y: f + 0.32, rz: HP, cols: false, seed: R.int(0, 9999) });
      S.col(x - 1.2, f + 0.33, -0.6, 2.0, 0.66, 1.0);
    } else S.prop('server_rack_prop', x, -HALF + 0.75, 0, { y: f, seed: R.int(0, 9999) });
  }
  const leds = [0x40ff80, 0xffb030];
  S.light(-HALF + 0.9, f + 1.4, -HALF + 1.6, leds[R.int(0, 1)], 0.6, 5, 0.5);
  // generator outside the right fence + power cable over the fence top
  const gx = HALF + 1.6, gz = -1.4;
  S.prop('generator', gx, gz, HP, { seed: R.int(0, 9999) });
  const cable = M('rubber', 0x202020);
  S.kit.limb(cable, [gx - 0.3, S.gy(gx, gz) + 0.9, gz], [HALF, f + FH + 0.05, gz + 0.4], 0.03, 0.03, 4);
  S.kit.limb(cable, [HALF, f + FH + 0.05, gz + 0.4], [HALF - 1.2, f + 2.0, -HALF + 0.9], 0.03, 0.03, 4);
  // floodlight on a pole at the front-left corner
  const lx = -HALF - 0.5, lz = HALF + 0.5, lg = S.gy(lx, lz);
  S.vis(M('metal_dark'), G.cyl(0.06, 0.08, 4.2, 6), [lx, lg + 2.1, lz]);
  S.col(lx, lg + 2.1, lz, 0.16, 4.2, 0.16);
  S.vis(M('metal_dark'), G.box(0.5, 0.3, 0.3), [lx + 0.2, lg + 4.2, lz - 0.2], [0.4, -0.8, 0]);
  S.vis(MB(null, 0xf0f4ff), G.plane(0.4, 0.22), [lx + 0.3, lg + 4.12, lz - 0.08], [0.4 - HP * 0.4, -0.8, 0]);
  S.light(lx + 1.2, lg + 3.6, lz - 1.2, 0xe8f0ff, 1.1, 14, 0.06);
  if (hasCrate) S.supplyCrate(-HALF + 1.0, HALF - 1.2, 0.3, f, crateDifficulty(R, B), 1.6);
  const cands = [[1.2, 0.8, f], [-0.8, -0.4, f], [2.2, -1.6, f], [-2.2, 0.4, f], [0.3, -2.0, f], [gx + 0.2, gz + 1.6], [0.6, HALF + 1.8]];
  S.pickSpots(cands, R.int(2, 4));
}

const BUILDERS = { camp: buildCamp, cargo: buildCargo, bunker: buildBunker, radio: buildRadio, lander: buildLander, dish: buildDish, van: buildVan, cage: buildCage };

// ============================================================================ placement
// Everything already on the moon (instanced trees/rocks/grass + standalone props) as
// [x, z, radius, footprint] (stride 4). radius is a fixed per-type value (site search, prop placement);
// footprint is the real horizontal extent of an instanced tree/rock (big rocks reach ~2.3 m), used for
// the scrap spots. Only positions and the procedural instanced geometry are read, never GLB bounds, so
// the result is identical on every peer whichever GLB models are loaded.
const PROP_R = 4.5, INST_R = 1.2;
const _corner = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function collectObstacles(group) {
  const pts = [];
  for (const ch of group.children) {
    if (ch.isInstancedMesh) {
      const g = ch.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox, a = ch.instanceMatrix.array;
      for (let i = 0; i < ch.count; i++) {
        const x = a[i * 16 + 12], z = a[i * 16 + 14];
        let fp = 0;
        if (bb && Number.isFinite(bb.min.x)) {
          _m4.fromArray(a, i * 16);
          for (let c = 0; c < 8; c++) {
            _corner.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyMatrix4(_m4);
            fp = Math.max(fp, Math.hypot(_corner.x - x, _corner.z - z));
          }
        }
        pts.push(x, z, INST_R, fp || INST_R);
      }
    } else if (ch.position.x !== 0 || ch.position.z !== 0) {
      pts.push(ch.position.x, ch.position.z, PROP_R, PROP_R * 0.8);
    }
  }
  return pts;
}

function groundDrop(terrain, x, z, r) {
  let lo = terrain.heightAt(x, z), hi = lo;
  for (const rr of [r * 0.5, r]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const h = terrain.heightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return hi - lo;
}

function chooseKinds(R, moon, sc = 1) {
  const tier = moon?.tier || 1;
  const n = Math.max(1, Math.min(4, 1 + (tier >= 2 ? 1 : 0) + (R.chance(0.55) ? 1 : 0) + (sc > 1.15 ? 1 : 0)));
  const pool = R.shuffle(['camp', 'cargo', 'bunker', 'radio', 'dish', 'van', 'cage']);
  const kinds = [];
  const b = moon?.biome;
  if (b === 'desert' || b === 'snow' || b === 'crystal') kinds.push('lander');
  // the internet-wreck biomes always show some of their own kind of ruin first
  const prefer = b === 'datascape' || b === 'servermarsh' ? 'cage' : b === 'ashfield' ? 'dish' : null;
  if (prefer) { pool.splice(pool.indexOf(prefer), 1); kinds.push(prefer); }
  while (kinds.length < n && pool.length) kinds.push(pool.shift());
  return kinds;
}

function findSite(B, info, slot, n, sites) {
  const R = B.R;
  const prefA = B.a0 + (slot * TAU) / n;
  for (let pass = 0; pass < 2; pass++) {
    const scale = pass === 0 ? 1 : 0.35;
    for (let t = 0; t < 70; t++) {
      const a = t < 35 ? prefA + R.float(-0.9, 0.9) : R.float(0, TAU);
      const d = R.float(50, 112) * B.sc;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      const lim = 114 * B.sc - info.radius;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
      if (B.avoid(x, z, info.radius + 4)) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + info.radius + 22)) continue;
      if (!B.clearAt(x, z, info.core, scale)) continue;
      if (groundDrop(B.terrain, x, z, info.core) > info.maxDrop) continue;
      return { x, z };
    }
  }
  return null;
}

// ============================================================================ public: build
export function buildOutposts(ctx) {
  const { seed, moon, terrain, group, physics, lightPool } = ctx;
  const R = new RNG(((seed | 0) ^ 0x0a7c05e) >>> 0);
  const ownCols = [];
  const obstacles = collectObstacles(group);
  // static colliders are queued while building and only created once every outpost built fine
  const colQueue = [];
  const addColNow = ctx.addBox || ((x, y, z, sx, sy, sz, rotY) => { const c = physics?.addStaticBox(x, y, z, sx / 2, sy / 2, sz / 2, rotY); if (c) ownCols.push(c); });
  const B = {
    R, moon, terrain, group, lightPool, emitters: [], fires: [], geos: new Set(), roots: [], ownCols,
    addCol: (x, y, z, sx, sy, sz, rotY) => { colQueue.push([x, y, z, sx, sy, sz, rotY]); },
    avoid: ctx.avoid || ((x, z, m = 0) => Math.hypot(x, z) < 30 + m),
    // true when no existing obstacle (radius scaled by `scale`) is within r of (x, z)
    clearAt(x, z, r, scale = 1) {
      for (let i = 0; i < obstacles.length; i += 4) {
        const dx = obstacles[i] - x, dz = obstacles[i + 1] - z, rr = r + obstacles[i + 2] * scale;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
      return true;
    },
    // true when a sphere (x, y, z, r) touches none of the outposts' own (queued) box colliders
    freeOfOwnCols(x, y, z, r) {
      for (const [cx, cy, cz, sx, sy, sz, rot] of colQueue) {
        const dx = x - cx, dz = z - cz, c = Math.cos(rot || 0), s = Math.sin(rot || 0);
        const qx = Math.max(Math.abs(dx * c - dz * s) - sx / 2, 0), qy = Math.max(Math.abs(y - cy) - sy / 2, 0), qz = Math.max(Math.abs(dx * s + dz * c) - sz / 2, 0);
        if (qx * qx + qy * qy + qz * qz < r * r) return false;
      }
      return true;
    },
    // true when (x, z) is at least r outside every obstacle's real footprint (scrap spots)
    clearOfFootprints(x, z, r) {
      for (let i = 0; i < obstacles.length; i += 4) {
        const dx = obstacles[i] - x, dz = obstacles[i + 1] - z, rr = r + obstacles[i + 3];
        if (dx * dx + dz * dz < rr * rr) return false;
      }
      return true;
    },
    a0: 0,
    sc: terrain?.scale || 1,   // generated big moons: bigger search ring
  };
  const kinds = chooseKinds(R, moon, B.sc);
  B.a0 = R.float(0, TAU);
  const places = [];
  kinds.forEach((kind, i) => {
    const info = OUTPOST_KINDS[kind];
    const p = findSite(B, info, i, kinds.length, places);
    if (p) places.push({ kind, x: p.x, z: p.z, radius: info.radius });
  });
  // crates: rolled per outpost; from FORCE_CRATE_TIER on at least one per moon
  const crateFlags = places.map((p) => R.chance(OUTPOST_KINDS[p.kind].crate));
  if (places.length && (moon?.tier || 1) >= FORCE_CRATE_TIER && !crateFlags.some(Boolean)) crateFlags[0] = true;
  const sites = [];
  try {
    places.forEach((p, i) => {
      const info = OUTPOST_KINDS[p.kind];
      const jitter = R.float(-0.6, 0.6), free = R.float(0, TAU);
      const rot = info.faceShip ? Math.atan2(-p.x, -p.z) + jitter : free;
      const S = new Site(B, p.kind, i, p.x, p.z, rot);
      sites.push(S);
      BUILDERS[p.kind](S, R, B, crateFlags[i]);
      S.finish();
    });
  } catch (err) {
    // a builder threw halfway: leave nothing behind (the caller catches, keeps no reference and would
    // never dispose us). No collider or light was created yet; drop the meshes built so far.
    for (const S of sites) {
      S.root.removeFromParent();
      S.root.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.opShared) B.geos.add(o.geometry); });
    }
    for (const g of B.geos) g.dispose();
    B.emitters.length = 0;
    throw err;
  }
  // colliders and lights only now, so a failed build can never leave invisible walls or stray lights.
  // ctx.addBox colliders live in the terrain's collider list (removed on unload with the terrain).
  for (const c of colQueue) addColNow(...c);
  for (const e of B.emitters) lightPool?.add(e);
  return new Outposts(seed, sites, B);
}

// ============================================================================ runtime object
class Outposts {
  constructor(seed, sites, B) {
    this.seed = seed;
    this.lightPool = B.lightPool;
    this.emitters = B.emitters;
    this.fires = B.fires;
    this.geos = B.geos;
    this.roots = B.roots;
    this.ownCols = B.ownCols;
    this.sites = sites.map((s) => ({ kind: s.kind, name: s.name, index: s.index, x: s.x, y: s.y, z: s.z, rot: s.rot, radius: s.radius, crate: s.crate, spots: s.spots }));
    this.scrapSpots = sites.flatMap((s) => s.spots);
    this.crates = sites.map((s) => s.crate).filter(Boolean);
    this.interactables = this.crates.map((c) => ({ type: 'crate', id: c.id, pos: c.pos, r: 0.8, crate: c }));
    this.t = 0;
    this.syncAsked = false;
    this.disposed = false;
    this.host = null;   // host only: { rng, table, valueMul, empty, pending, nightN, nightDone, nightT, announce } (hostPopulateOutposts)
  }

  crateById(id) { return this.crates.find((c) => c.id === id) || null; }
  blocks(x, z, m = 0) { return this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + m); }

  update(dt, game) {
    if (this.disposed) return;
    installOutpostNet(game);
    if (game && !game.isHost && !this.syncAsked && game.net?.connected && game.run?.phase === 'moon') {
      this.syncAsked = true;
      game.net.request(REQ_SYNC, { s: this.seed });
    }
    if (this.host && game?.isHost && game.run?.phase === 'moon') hostNightUpdate(game, this, dt);
    this.t += dt;
    const cam = game?.camera?.position;
    for (const f of this.fires) {
      if (cam && (cam.x - f.x) ** 2 + (cam.z - f.z) ** 2 > 8100) continue;
      const t = this.t + f.phase;
      const n = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 15.7 + 1.1) * 0.3 + Math.sin(t * 3.3) * 0.2;
      f.flame.scale.set(1 + n * 0.08, 0.9 + 0.12 * Math.sin(t * 11.3) + n * 0.1, 1 + n * 0.08);
      f.flame.rotation.y += dt * 0.7;
      if (f.emitter) f.emitter.intensity = f.base * (0.8 + 0.2 * n);
    }
    for (const cr of this.crates) {
      if (!cr.anim) continue;
      cr.t = Math.min(1, cr.t + dt / 0.7);
      cr.lid.rotation.x = -cr.openAngle * easeOutBack(cr.t);
      if (cr.t >= 1) cr.anim = false;
    }
  }

  // crate prompts (called from actions.interactablesNow while outdoors)
  addInteractables(game, add) {
    const p = game.player;
    if (!p || p.indoor || p.dead) return;
    let held;
    for (const cr of this.crates) {
      if (cr.opened || cr.claimed) continue;
      const dx = p.pos.x - cr.x, dz = p.pos.z - cr.z;
      if (dx * dx + dz * dz > 25) continue;
      if (held === undefined) held = p.heldItem?.() || null;
      const def = held ? ITEMS[held.type] : null;
      let label, sub = '', action;
      if (held?.type === 'key') {
        label = 'Unlock the supply crate with the key [E]';
        action = () => game.net.request(REQ_OPEN, { id: cr.id, s: this.seed, key: held.id });
      } else if (held?.type === 'lockpick') {
        label = 'Pick the supply crate lock [E]';
        action = () => this.startPick(game, cr, held, false);
      } else if (def && def.kind === 'weapon' && !def.ranged) {
        label = `Pry the crate open with the ${def.name} [E]`;
        sub = 'Loud!';
        action = () => this.startPick(game, cr, held, true);
      } else {
        label = 'Locked supply crate';
        sub = 'Needs a key, a lockpicker or a melee weapon';
        action = () => game.audio?.at?.('door_locked', cr.pos, 0.7);
      }
      add({ pos: cr.pos, r: 0.8, reach: 2.4, label, sub, action });
    }
  }

  startPick(game, cr, tool, pry) {
    const difficulty = Math.min(0.95, cr.difficulty + (pry ? 0.25 : 0));
    game.openMinigame('lockpick', { difficulty }, (res) => {
      if (res.success) game.net.request(REQ_OPEN, { id: cr.id, s: this.seed, [pry ? 'pry' : 'pick']: tool.id });
      if (res.cancelled) return;
      if (pry) {
        if (!res.success) {
          // a failed pry is loud for everyone (and for the creatures the host alerts)
          game.net.request('noise', { p: [cr.x, cr.y + 0.5, cr.z], loud: 1.6 });
          game.net.broadcast('fx', { k: 'snd', s: 'hit_metal', p: [cr.x, cr.y + 0.5, cr.z], v: 0.9, r: 5, m: 60 });
        }
        return;
      }
      tool.charges = Math.max(0, (tool.charges ?? 3) - 1);
      if (tool.charges <= 0) game.net.request('consume', { id: tool.id });
      else game.net.broadcast('itst', { id: tool.id, c: tool.charges });
    });
  }

  scanLabels(eye, labels) {
    for (const s of this.sites) {
      const dx = s.x - eye.x, dz = s.z - eye.z;
      if (dx * dx + dz * dz > 170 * 170) continue;
      const cr = s.crate;
      labels.push({ pos: new THREE.Vector3(s.x, s.y + 4.5, s.z), name: s.name, sub: cr && !cr.opened && !cr.claimed ? 'Locked supply crate' : '', color: '#ffcf6a' });
    }
  }

  applyState(d, game) {
    if (Array.isArray(d.list)) { for (const id of d.list) this.setOpened(id, false, game); return; }
    if (d.id) this.setOpened(d.id, true, game);
  }

  setOpened(id, animate, game) {
    const cr = this.crateById(id);
    if (!cr || cr.opened) return;
    cr.opened = true;
    cr.claimed = true;
    cr.led.material = MB(null, LED_OPEN);
    cr.lock.visible = false;
    if (animate) {
      cr.anim = true;
      cr.t = 0;
      game?.audio?.at?.('door_creak', cr.pos, 0.8, { occlude: true, refDistance: 2.5 });
    } else {
      cr.anim = false;
      cr.t = 1;
      cr.lid.rotation.x = -cr.openAngle;
    }
  }

  dispose(physics) {
    if (this.disposed) return;
    this.disposed = true;
    for (const e of this.emitters) this.lightPool?.remove(e);
    for (const c of this.ownCols) physics?.removeCollider(c);
    for (const g of this.geos) g.dispose();
    for (const r of this.roots) r.removeFromParent();
    this.emitters.length = 0; this.fires.length = 0; this.ownCols.length = 0; this.roots.length = 0;
    this.geos.clear();
    this.crates.length = 0; this.interactables.length = 0;
    this.host = null;
  }
}

// ============================================================================ networking / host
const installedNets = new WeakSet();
const posOf = (game, from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);

// Idempotent per session: crate request handlers (used on the host) + crate state message (everyone).
export function installOutpostNet(game) {
  const net = game?.net;
  if (!net || installedNets.has(net)) return;
  installedNets.add(net);
  net.on_(MSG_STATE, (d) => {
    const op = game.world?.outdoor?.outposts;
    if (op && !op.disposed && d && d.s === op.seed) op.applyState(d, game);
  });
  net.handle(REQ_OPEN, (d, from) => hostOpenCrate(game, d, from));
  net.handle(REQ_SYNC, (d, from) => {
    if (!game.isHost) return;
    const op = game.world?.outdoor?.outposts;
    if (!op || op.disposed || d.s !== op.seed) return;
    const list = op.crates.filter((c) => c.claimed).map((c) => c.id);
    if (list.length) game.net.sendTo(from, MSG_STATE, { s: op.seed, list });
  });
}

function hostOpenCrate(game, d, from) {
  if (!game.isHost || game.run?.phase !== 'moon') return;
  const op = game.world?.outdoor?.outposts;
  if (!op || op.disposed || d.s !== op.seed) return;
  const cr = op.crateById(d.id);
  if (!cr || cr.claimed || cr.opened) return;
  const p = posOf(game, from);
  if (!p || Math.hypot(p.x - cr.x, p.z - cr.z) > 4.5 || Math.abs(p.y - cr.y) > 3) return;
  const heldBy = (id, ok) => { const it = id && game.items.get(id); return it && it.holder === from && ok(it) ? it : null; };
  let how;
  if (d.key) {
    const k = heldBy(d.key, (it) => it.type === 'key');
    if (!k) return;
    game.net.broadcast('it', { e: 'rm', id: k.id });
    how = 'key';
  } else if (d.pick) {
    if (!heldBy(d.pick, (it) => it.type === 'lockpick')) return;
    how = 'pick';
  } else if (d.pry) {
    if (!heldBy(d.pry, (it) => (it.def || ITEMS[it.type])?.kind === 'weapon' && !(it.def || ITEMS[it.type])?.ranged)) return;
    how = 'pry';
  } else return;
  cr.claimed = true;
  const run = game.run;
  const moon = MOONS[run.moon] || {};
  const tier = moon.tier || 1;
  const night = isNight(run);
  // same valueMul as the moon's other scrap (scrapMul, quota and weather), crate and night bonus on top
  const base = op.host?.valueMul ?? (moon.scrapMul || 1) * (1 + (run.quotaIndex || 0) * 0.06) * (WEATHER_BONUS[run.weather] || 1);
  const valueMul = base * CRATE_VALUE * (night ? NIGHT_VALUE : 1);
  const tools = SUPPLY_TOOLS.concat(tier >= 3 ? [['taser', 1]] : []).filter((e) => ITEMS[e[0]]);
  const scrap = SUPPLY_SCRAP.filter((e) => ITEMS[e[0]]);
  // by day one piece of scrap + one tool; at night a third item (scrap or tool) and the scrap is worth more
  const n = night ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const tool = tools.length > 0 && (i === 1 || (i === 2 && Math.random() < 0.5));
    const type = weightedPick(tool || !scrap.length ? tools : scrap, Math.random);
    if (!type) continue;
    const a = Math.random() * TAU;
    const pos = new THREE.Vector3(cr.x + Math.cos(a) * 0.2, cr.y + CRATE.H + 0.35 + i * 0.18, cr.z + Math.sin(a) * 0.2);
    game.items.hostSpawn(type, pos, { valueMul: tool ? 1 : valueMul, linvel: [Math.cos(a) * 1.3, 3 + Math.random(), Math.sin(a) * 1.3] });
  }
  if (how === 'pry') {
    game.creatures?.noise?.(new THREE.Vector3(cr.x, cr.y + 0.5, cr.z), 3.2);
    game.net.broadcast('fx', { k: 'snd', s: 'hit_metal', p: [cr.x, cr.y + 0.5, cr.z], v: 1, r: 6, m: 70 });
  }
  game.net.broadcast(MSG_STATE, { s: op.seed, id: cr.id, by: from });
  game.net.broadcast('xp', { to: from, xp: 35 + tier * 15 + (run.quotaIndex || 0) * 5, coin: 5 + tier * 3, reason: 'Supply crate opened' });
}

// Host: day scrap at the outpost spots (value = the moon valueMul x outpost kind x distance from the
// ship) and now and then a spare key. The spots left empty are remembered for the night top-up
// (hostNightUpdate, driven by outposts.update). Returns the number of scrap items spawned now.
export function hostPopulateOutposts(game, outposts, opts = {}) {
  if (!game?.isHost || !outposts || outposts.disposed) return 0;
  installOutpostNet(game);
  const run = game.run || {};
  const moon = MOONS[run.moon] || {};
  const rng = new RNG(((run.seed | 0) ^ 0x0a75c0de) >>> 0);
  const table = (opts.table || SCRAP_TABLE[moon.interior] || SCRAP_TABLE.factory)
    .map((e) => (Array.isArray(e) ? { id: e[0], w: e[1] } : e))
    .filter((e) => ITEMS[e.id] && e.id !== 'key');
  if (!table.length) return 0;
  const scrapMul = moon.scrapMul || 1;
  const valueMul = opts.valueMul ?? scrapMul * (1 + (run.quotaIndex || 0) * 0.06) * (WEATHER_BONUS[run.weather] || 1);
  // eclipse: creatures roam outside all day, so the "night" top-up comes at once (without the message)
  const H = { rng, table, valueMul, empty: [], pending: [], nightN: 0, nightDone: false, nightT: 0, announce: !isNight(run) };
  outposts.host = H;
  const sc = Array.isArray(moon.scrapCount) ? moon.scrapCount : [12, 16];
  const indoorN = (sc[0] + sc[1]) / 2 + (run.quotaIndex || 0) * 0.8;   // as hostPopulateMoon rolls it
  const fill = Math.max(DAY_FILL_MIN, Math.min(DAY_FILL_MAX, (DAY_SHARE * indoorN) / Math.max(1, outposts.scrapSpots.length)));
  H.nightN = NIGHT_SHARE * indoorN;
  let n = 0;
  for (const s of outposts.sites) {
    const kindMul = OUTPOST_KINDS[s.kind]?.value ?? 1;
    const far = 0.9 + 0.25 * Math.min(1, Math.hypot(s.x, s.z) / 120);
    for (const sp of s.spots) {
      const e = { sp, mul: kindMul * far };
      if (rng.chance(fill)) { spawnSpotScrap(game, H, e, 1); n++; } else H.empty.push(e);
    }
  }
  if (outposts.crates.length && outposts.scrapSpots.length && rng.chance(0.35)) {
    const sp = rng.pick(outposts.scrapSpots);
    game.items.hostSpawn('key', new THREE.Vector3(sp.x + 0.3, sp.y + 0.45, sp.z + 0.3));
  }
  return n;
}

function spawnSpotScrap(game, H, e, mul) {
  const type = H.rng.weighted(H.table).id;
  game.items.hostSpawn(type, new THREE.Vector3(e.sp.x, e.sp.y + 0.5, e.sp.z), { valueMul: H.valueMul * e.mul * mul });
}

// Host, every frame while on the moon: from 18:00 (at once in an eclipse) part of the empty spots get
// night scrap worth NIGHT_VALUE x more. Spots within NIGHT_NEAR m of a living player wait until nobody
// is looking, so nothing pops into existence in front of the crew.
const NIGHT_NEAR = 14;
function hostNightUpdate(game, op, dt) {
  const H = op.host;
  if (!H.nightDone) {
    if (!isNight(game.run)) return;
    H.nightDone = true;
    const fill = Math.min(NIGHT_FILL_MAX, H.nightN / Math.max(1, H.empty.length));
    H.pending = H.empty.filter(() => H.rng.chance(fill));
    H.empty = [];
    H.nightT = 0;
    if (H.pending.length && H.announce) {
      game.net.broadcast('sys', { text: 'Nightfall: fresh scrap at the outposts - and supply crates pay more after dark.', kind: 'info' });
    }
  }
  if (!H.pending.length) return;
  H.nightT -= dt;
  if (H.nightT > 0) return;
  H.nightT = 1.5;
  const eyes = [];
  if (game.player && !game.player.dead && game.player.pos) eyes.push(game.player.pos);
  if (game.remotes) for (const r of game.remotes.values()) if (r && !r.dead && r.pos) eyes.push(r.pos);
  const near2 = NIGHT_NEAR * NIGHT_NEAR;
  H.pending = H.pending.filter((e) => {
    if (eyes.some((p) => (p.x - e.sp.x) ** 2 + (p.z - e.sp.z) ** 2 < near2)) return true;
    spawnSpotScrap(game, H, e, NIGHT_VALUE);
    return false;
  });
}
