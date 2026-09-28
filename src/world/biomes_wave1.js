// WAVE 1 planet biomes (worldx): LAVA, ICE, JUNGLE. Registered into BIOMES at import time and into the biome decor
// registry (outdoor_biomes.js registerDecor), so the endless sector generator (game/moongen.js) can pick them for
// deeper sectors and terrain.js builds them like any other biome.
//
//   lava    glowing lava rivers carved into the terrain (terrain.js carveLava; deadly, see game/worldx.js), obsidian
//           shards, ember rocks, smoke plumes, orange fog, embers (environment fx 'ash'), heat shimmer near the rivers
//   ice     snow, blue fog, flat frozen lakes (low friction, game/worldx.js), ice spikes, snow drifts, blizzard flakes
//           + gusts (fog / wind swell, game/worldx.js)
//   jungle  dense giant trees with vines, giant ferns, glowing mushrooms, humid green fog, drifting spores
//
// Visual randomness (particles) may use Math.random; placement uses the decor's seeded RNG only.
import * as THREE from 'three';
import { WAVE1_BIOME_IDS } from './biomes_wave1_data.js';   // biome definitions (data only; also read by game/moongen.js)
import { registerDecor, DECOR_HELPERS } from './outdoor_biomes.js';
import { getTexture, makeCanvasTexture } from '../render/textures.js';

const { instanced, emitter, softPuffTexture, TAU } = DECOR_HELPERS;
export { WAVE1_BIOME_IDS };

// ------------------------------------------------------------------ shared helpers
/** Camera-following particle box (falling flakes, embers, spores). Positions live in camera space and wrap around. */
function skyParticles(C, { n, box = 64, height = 26, size, color, opacity = 0.9, additive = false, wind = [0, 0], fall = 0, jitter = 0.4, colors = null }) {
  const P = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    P[i * 3] = (Math.random() - 0.5) * box; P[i * 3 + 1] = Math.random() * height; P[i * 3 + 2] = (Math.random() - 0.5) * box;
    c.set(colors ? colors[Math.floor(Math.random() * colors.length)] : color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    ph[i] = Math.random() * TAU;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = C.mat(new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, opacity, depthWrite: false, fog: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  const pts = C.add(C.own(new THREE.Points(g, m)));
  pts.frustumCulled = false;
  let lx = null, lz = null;
  C.updaters.push((dt, t, game) => {
    const cam = game?.camera?.position;
    if (!cam) return;
    pts.visible = cam.y > -100;   // not inside the facility
    if (!pts.visible) return;
    const gust = C.terrain.wx?.gust ?? 0;
    pts.position.set(cam.x, cam.y - height * 0.35, cam.z);
    const mx = lx === null ? 0 : cam.x - lx, mz = lz === null ? 0 : cam.z - lz;
    lx = cam.x; lz = cam.z;
    const half = box / 2, arr = g.attributes.position.array;
    const wx = wind[0] * (1 + gust * 2.4), wz = wind[1] * (1 + gust * 2.4);
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      arr[k] += (wx + Math.sin(t * 0.8 + ph[i]) * jitter) * dt - mx;
      arr[k + 1] += -fall * dt * (1 + gust * 0.6);
      arr[k + 2] += (wz + Math.cos(t * 0.7 + ph[i]) * jitter) * dt - mz;
      if (arr[k] > half) arr[k] -= box; else if (arr[k] < -half) arr[k] += box;
      if (arr[k + 2] > half) arr[k + 2] -= box; else if (arr[k + 2] < -half) arr[k + 2] += box;
      if (arr[k + 1] < 0) arr[k + 1] += height; else if (arr[k + 1] > height) arr[k + 1] -= height;
    }
    g.attributes.position.needsUpdate = true;
  });
  return pts;
}

function lavaTexture(C) {
  const tex = makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#b02a08'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 2 + Math.random() * 7;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const hot = Math.random();
      g.addColorStop(0, hot > 0.75 ? 'rgba(255,240,120,0.95)' : 'rgba(255,150,30,0.85)'); g.addColorStop(1, 'rgba(176,42,8,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,6,2,0.55)';
    for (let i = 0; i < 28; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 1 + Math.random() * 2);   // cooled crust flecks
  });
  if (tex) C.texs.push(tex);
  return tex;
}

// ------------------------------------------------------------------ LAVA
function buildLava(C) {
  const { R, terrain, sc } = C;
  const Ly = terrain.lava.y, size = terrain.half * 2;
  // 1. lava sheet over the whole map: the carved channels are the only place it shows above the ground
  const tex = lavaTexture(C);
  if (tex) tex.repeat.set(size / 14, size / 14);
  const mat = C.mat(new THREE.MeshBasicMaterial({ map: tex, color: 0xffb060, fog: true }));
  const sheet = C.add(C.own(new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat)));
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(0, Ly, 0);
  const hot = new THREE.Color(0xffc070), cool = new THREE.Color(0xff8a40), tmp = new THREE.Color();
  C.updaters.push((dt, t) => {
    if (tex) { tex.offset.x = (tex.offset.x + dt * 0.012) % 1; tex.offset.y = (tex.offset.y - dt * 0.007) % 1; }
    mat.color.copy(tmp.copy(cool).lerp(hot, 0.5 + 0.5 * Math.sin(t * 1.6)));
  });
  // 2. river-side lights + smoke plumes at points that are really lava (scan the grid in a fixed order, pick with the seeded RNG)
  const pts = [];
  for (let z = -C.lim; z <= C.lim; z += 8) for (let x = -C.lim; x <= C.lim; x += 8) if (terrain.lavaDepthAt(x, z) > 0.7) pts.push({ x, z });
  R.shuffle(pts);
  const lamps = [];
  for (const p of pts) {
    if (lamps.length >= Math.round(9 * sc)) break;
    if (lamps.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 26)) lamps.push(p);
  }
  for (const p of lamps) emitter(C, p.x, Ly + 1.4, p.z, 0xff6a20, 1.7, 24, 0.2);
  const puff = softPuffTexture(C);
  if (puff) {
    const smokeMat = C.mat(new THREE.SpriteMaterial({ map: puff, color: 0x3a2a24, transparent: true, opacity: 0.4, depthWrite: false, fog: true }));
    const plumes = lamps.slice(0, Math.round(5 * sc)).map((p) => {
      const list = [];
      for (let k = 0; k < 5; k++) { const sp = new THREE.Sprite(smokeMat); C.add(sp); list.push({ sp, ph: k / 5 }); }
      return { p, list };
    });
    C.updaters.push((dt, t, game) => {
      const cam = game?.camera?.position;
      for (const pl of plumes) {
        if (cam && (cam.x - pl.p.x) ** 2 + (cam.z - pl.p.z) ** 2 > 150 * 150) continue;
        for (const s of pl.list) {
          const k = (t * 0.07 + s.ph) % 1;
          s.sp.position.set(pl.p.x + Math.sin(k * 5 + s.ph * 9) * 1.4 * k, Ly + 1 + k * 14, pl.p.z + k * 3);
          const q = 2 + k * 6;
          s.sp.scale.set(q, q, 1);
        }
      }
    });
  }
  // 3. obsidian shards (instanced, big ones collide) and glowing ember stones near the banks
  const bank = (x, z) => { const d = terrain.lavaDepthAt(x, z); return d < -0.3 && d > -4.5; };
  const shard = new THREE.OctahedronGeometry(1, 0).scale(0.55, 1.6, 0.55).translate(0, 1.3, 0);
  const shards = [];
  for (let i = 0; i < Math.round(80 * sc * sc); i++) {
    const p = C.spot(3, 20, (x, z) => bank(x, z) || R.chance(0.15));
    if (!p) continue;
    const s = R.float(0.7, 2.4), ry = R.float(0, TAU), y = C.h(p.x, p.z) - 0.3;
    shards.push({ x: p.x, y, z: p.z, ry, rx: R.float(-0.25, 0.25), rz: R.float(-0.25, 0.25), s });
    if (s > 1.4) C.addBox(p.x, y + s, p.z, 0.9 * s, 2.2 * s, 0.9 * s, ry);
  }
  instanced(C, shard, C.mat(new THREE.MeshLambertMaterial({ color: 0x241a30, emissive: 0x2a0c10, flatShading: true })), shards);
  const ember = new THREE.DodecahedronGeometry(0.35, 0);
  const embers = [];
  for (let i = 0; i < Math.round(90 * sc * sc); i++) {
    const p = C.spot(2, 14, (x, z) => bank(x, z));
    if (!p) continue;
    embers.push({ x: p.x, y: C.h(p.x, p.z) + 0.05, z: p.z, ry: R.float(0, TAU), rx: R.float(0, TAU), s: R.float(0.5, 1.5) });
  }
  const emberMesh = instanced(C, ember, C.mat(new THREE.MeshBasicMaterial({ color: 0xff7a24 })), embers);
  if (emberMesh) C.updaters.push((dt, t) => { emberMesh.material.color.setHSL(0.05 + 0.015 * Math.sin(t * 2.3), 1, 0.5 + 0.08 * Math.sin(t * 4.1)); });
  for (const s of shards.slice(0, 2)) C.scrapSpots.push({ x: s.x + 2.2, z: s.z });
  // 4. rising sparks around the whole basin
  skyParticles(C, { n: 260, size: 0.16, colors: [0xff8a30, 0xffc060, 0xff5a20], opacity: 0.9, additive: true, wind: [0.6, 0.2], fall: -1.1, jitter: 0.5 });
}

// ------------------------------------------------------------------ ICE
function iceLakeTexture(C) {
  const tex = makeCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#a8d4f0'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.25})`; ctx.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 14, 1 + Math.random() * 2); }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); let x = Math.random() * w, y = Math.random() * h; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 26; y += (Math.random() - 0.5) * 26; ctx.lineTo(x, y); } ctx.stroke(); }
  });
  if (tex) C.texs.push(tex);
  return tex;
}

function buildIce(C) {
  const { R, terrain, plan, sc, addBox } = C;
  // 1. frozen lakes: flat translucent ice over the flattened terrain (the ground below is the collider; friction is handled by worldx)
  const itex = iceLakeTexture(C);
  const imat = C.mat(new THREE.MeshLambertMaterial({ map: itex, color: 0xd8f0ff, emissive: 0x16304a, transparent: true, opacity: 0.86, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  for (const l of plan.lakes || []) {
    const disc = C.add(C.own(new THREE.Mesh(new THREE.CircleGeometry(l.r * 0.98, 28), imat)));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(l.x, l.y + 0.06, l.z);
    if (itex) itex.repeat.set(4, 4);
    // a few snow-dusted rocks and a lone stranded crate on the shore
    C.scrapSpots.push({ x: l.x + l.r * 0.5, z: l.z - l.r * 0.4 });
  }
  // 2. ice spikes (translucent, glowing faintly) + snow drifts
  const spikeGeo = new THREE.ConeGeometry(0.6, 1, 5).translate(0, 0.5, 0);
  const spikes = [];
  for (let i = 0; i < Math.round(70 * sc * sc); i++) {
    const p = C.spot(3, 14, (x, z) => !terrain.onIce(x, z));
    if (!p) continue;
    const h = R.float(1.6, 7.5), w = R.float(0.7, 1.7), y = C.h(p.x, p.z) - 0.2, ry = R.float(0, TAU);
    spikes.push({ x: p.x, y, z: p.z, ry, rx: R.float(-0.18, 0.18), rz: R.float(-0.18, 0.18), sx: w, sy: h, sz: w });
    if (h > 3) addBox(p.x, y + h * 0.35, p.z, w * 0.9, h * 0.7, w * 0.9, ry);
  }
  instanced(C, spikeGeo, C.mat(new THREE.MeshLambertMaterial({ color: 0xa8dcff, emissive: 0x1a4a78, flatShading: true, transparent: true, opacity: 0.88 })), spikes);
  const drift = new THREE.SphereGeometry(1, 7, 4).scale(1, 0.32, 1);
  const drifts = [];
  for (let i = 0; i < Math.round(110 * sc * sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (C.avoid(x, z, -4) || terrain.onIce(x, z)) continue;
    drifts.push({ x, y: C.h(x, z) - 0.05, z, ry: R.float(0, TAU), sx: R.float(1.5, 4.5), sy: R.float(0.8, 1.6), sz: R.float(1.2, 3.2) });
  }
  instanced(C, drift, C.mat(new THREE.MeshLambertMaterial({ color: 0xeaf4ff })), drifts);
  // 3. blizzard: dense flakes + slow gust cycle (worldx swells fog / wind with terrain.wx.gust)
  skyParticles(C, { n: 900, size: 0.13, color: 0xffffff, opacity: 0.85, wind: [2.2, 0.8], fall: 2.2, jitter: 0.5 });
  const gustMul = C.moon?.blizzard ? 1.6 : 1;
  C.terrain.wx = C.terrain.wx || {};
  C.updaters.push((dt, t) => {
    const g = Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.07 + 1.3));
    C.terrain.wx.gust = Math.min(1, g * 1.6 * gustMul);
  });
}

// ------------------------------------------------------------------ JUNGLE
function giantTreeGeos(R) {
  // trunk with root flares (bark) + canopy of leaf discs (leaves): two merged geometries per height variant
  const out = [];
  for (const H of [15, 20, 26]) {
    const trunk = [new THREE.CylinderGeometry(0.75, 1.15, H, 7).translate(0, H / 2, 0)];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + R.float(-0.3, 0.3);
      trunk.push(new THREE.CylinderGeometry(0.15, 0.55, 3.2, 4).rotateZ(0.6).rotateY(a).translate(Math.cos(a) * 0.9, 1.4, -Math.sin(a) * 0.9));
    }
    const canopy = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU, d = k === 0 ? 0 : R.float(2.6, 4.2), r = R.float(3.4, 5.4);
      canopy.push(new THREE.CircleGeometry(r, 7).rotateX(-Math.PI / 2 + R.float(-0.18, 0.18)).translate(Math.cos(a) * d, H + R.float(-1.4, 0.6), Math.sin(a) * d));
    }
    out.push({ H, trunk: mergeIndexed(trunk), canopy: mergeIndexed(canopy) });
  }
  return out;
}
function mergeIndexed(list) {
  let n = 0;
  const parts = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0, u = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); uv.set(g.attributes.uv.array, u); o += g.attributes.position.array.length; u += g.attributes.uv.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeVertexNormals();
  for (const g of list) g.dispose();
  for (const g of parts) if (!list.includes(g)) g.dispose();
  return out;
}

function buildJungle(C) {
  const { R, terrain, sc, addBox } = C;
  const barkMat = C.mat(new THREE.MeshLambertMaterial({ map: getTexture('bark'), color: 0x8a7a66 }));
  const leafMat = C.mat(new THREE.MeshLambertMaterial({ map: getTexture('leaves'), color: 0x6fbf50, alphaTest: 0.5, side: THREE.DoubleSide }));
  // 1. giant trees with canopies (trunks collide)
  const geos = giantTreeGeos(R);
  const lists = geos.map(() => []);
  for (let i = 0; i < Math.round(130 * sc * sc); i++) {
    const p = C.spot(4, 16);
    if (!p) continue;
    const v = R.int(0, geos.length - 1), s = R.float(0.85, 1.3), ry = R.float(0, TAU), y = C.h(p.x, p.z) - 0.4;
    lists[v].push({ x: p.x, y, z: p.z, ry, s });
    addBox(p.x, y + 4, p.z, 1.6 * s, 8, 1.6 * s, ry);
    if (i < 3) C.scrapSpots.push({ x: p.x + 2.2 * s, z: p.z + 1.0 });
  }
  geos.forEach((g, v) => {
    if (!lists[v].length) { g.trunk.dispose(); g.canopy.dispose(); return; }
    instanced(C, g.trunk, barkMat, lists[v]);
    instanced(C, g.canopy, leafMat, lists[v]);
  });
  // 2. hanging vines under the canopies (thin, instanced)
  const vineGeo = new THREE.CylinderGeometry(0.05, 0.03, 1, 4).translate(0, -0.5, 0);
  const vines = [];
  for (const list of lists) for (const t of list) for (let k = 0; k < 3; k++) {
    const a = R.float(0, TAU), d = R.float(1.5, 4.5), len = R.float(5, 12);
    vines.push({ x: t.x + Math.cos(a) * d, y: C.h(t.x, t.z) + 14 * t.s + R.float(-2, 0), z: t.z + Math.sin(a) * d, sy: len, sx: 1, sz: 1 });
  }
  instanced(C, vineGeo, C.mat(new THREE.MeshLambertMaterial({ color: 0x3c6a2c })), vines);
  // 3. giant ferns (fans of curved leaves) and tall grass
  const fern = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    fern.push(new THREE.PlaneGeometry(1.3, 3.2, 1, 3).translate(0, 1.6, 0).rotateX(-0.75).rotateY(a));
  }
  const fernGeo = mergeIndexed(fern);
  const ferns = [];
  for (let i = 0; i < Math.round(480 * sc * sc); i++) {
    const x = R.float(-C.lim, C.lim), z = R.float(-C.lim, C.lim);
    if (C.avoid(x, z, -6)) continue;
    ferns.push({ x, y: C.h(x, z) - 0.05, z, ry: R.float(0, TAU), s: R.float(0.8, 2.4) });
  }
  instanced(C, fernGeo, leafMat, ferns);
  // 4. glowing mushrooms (a few light the undergrowth)
  const stem = new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6).translate(0, 0.8, 0);
  const cap = new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 1.6, 0);
  const shrooms = [];
  for (let i = 0; i < Math.round(48 * sc * sc); i++) {
    const p = C.spot(2, 12);
    if (!p) continue;
    shrooms.push({ x: p.x, y: C.h(p.x, p.z) - 0.1, z: p.z, ry: R.float(0, TAU), s: R.float(0.8, 2.4), color: R.chance(0.5) ? 0x9a48e0 : 0x30d8b0 });
  }
  instanced(C, stem, C.mat(new THREE.MeshLambertMaterial({ color: 0xd8d0b8 })), shrooms);
  const capMesh = instanced(C, cap, C.mat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x303030, side: THREE.DoubleSide })), shrooms, { colors: true });
  void capMesh;
  shrooms.slice(0, Math.round(5 * sc)).forEach((m) => emitter(C, m.x, m.y + 2.2 * m.s, m.z, m.color, 1.0, 12, 0.1));
  for (const m of shrooms.filter((q) => q.s > 1.6)) addBox(m.x, m.y + 0.6 * m.s, m.z, 0.5 * m.s, 1.2 * m.s, 0.5 * m.s, 0);
  // 5. humid spore drift
  skyParticles(C, { n: 380, size: 0.11, colors: [0xc8f0a0, 0xa0e0c0, 0xf0f0b0], opacity: 0.6, additive: true, wind: [0.3, 0.2], fall: 0.05, jitter: 0.5 });
}

registerDecor('lava', buildLava);
registerDecor('ice', buildIce);
registerDecor('jungle', buildJungle);
