// OUTLIFE (wave 10, module 'outlife10'; docs/wave10/outlife10.md): life for the outdoors of every regular moon (game.outlife10).
// Layout = outlife10_core.planOutlife (seeded per moon + seed, identical on every peer), meshes = outlife10_art.js (instanced / merged, ~13 draw calls, no lights).
// Built as landing JOBS (game.landQ) once mapart + soul have placed their own props, so the descent stays smooth; disposed with the map.
// Local presentation only: no net messages, no host state. Colliders: big boulders only (<= 12, kept 18 m from the walk so they never depend on soul's beats).
import * as THREE from 'three';
import { MOONS } from './moons.js';
import { G } from '../physics/physics.js';
import { synth, sin, ex, nz } from './combat_kit.js';
import { QUALITY } from '../render/quality.js';
import * as C from './outlife10_core.js';
import * as A from './outlife10_art.js';

const TAU = Math.PI * 2;
const SOUNDS = {
  ol_static: (sr) => { let y = 0; return synth(sr, 1.5, (tt) => { y = y * 0.55 + nz() * 0.45; return (y * (0.6 + 0.4 * Math.sin(tt * 26)) * 0.5 + sin(60, tt) * 0.16 + sin(3150, tt) * 0.02 + (Math.random() < 0.0016 ? nz() * 1.4 : 0)) * Math.min(1, tt * 30) * Math.min(1, (1.5 - tt) * 12); }); },
  ol_creak: (sr) => synth(sr, 0.95, (tt) => Math.sin(TAU * (520 * tt + 190 * tt * tt)) * ex(tt, 2.4) * (0.6 + 0.4 * sin(29, tt)) + nz() * 0.05 * ex(tt, 5)),
  ol_hum: (sr) => synth(sr, 1.6, (tt) => (sin(60, tt) + 0.5 * sin(120, tt) + 0.22 * sin(181, tt)) * (0.72 + 0.28 * sin(3.3, tt)) * Math.min(1, tt * 18) * Math.min(1, (1.6 - tt) * 8)),
  ol_moan: (sr) => { let y = 0; return synth(sr, 2.6, (tt) => { y = y * 0.93 + nz() * 0.07; return (Math.sin(TAU * 168 * tt + 2.2 * Math.sin(TAU * 0.9 * tt)) * 0.5 + y * 2.2) * Math.sin(Math.PI * tt / 2.6) ** 2; }); },
  ol_rattle: (sr) => synth(sr, 0.7, (tt) => { let v = 0; for (const [at, a] of [[0, 1], [0.11, 0.7], [0.19, 0.5], [0.42, 0.8], [0.5, 0.4]]) if (tt >= at) v += (nz() * 0.5 + sin(150 + at * 90, tt - at)) * ex(tt - at, 46) * a; return v; }),
};
/** per POI kind: sound, repeat period [min, max] s, audible range m, volume */
const AMB = { tires: ['ol_moan', 9, 16, 20, 0.34], crates: ['ol_rattle', 7, 13, 17, 0.5], monitors: ['ol_static', 2.4, 3.2, 16, 0.5], chairs: ['ol_creak', 6, 12, 19, 0.42], cables: ['ol_hum', 1.35, 1.5, 14, 0.42] };

/** ambient particle fields: ONE Points object per moon. glow = fireflies / embers / wisps (night only when additive) */
const FX = {
  meadow: { size: 0.1, add: true, motes: [0xfff0c0, 0xf4ffd0], glows: [0xd8ff70, 0xf0ff90], glow: 0.3, vel: (r) => [0.25 + r() * 0.3, (r() - 0.4) * 0.12, (r() - 0.5) * 0.3], wob: 0.5 },
  spore: { size: 0.12, add: true, motes: [0xc8e8b0, 0xa0d0c0], glows: [0x9aff8a, 0xc8ff70], glow: 0.35, vel: (r) => [(r() - 0.5) * 0.3, (r() - 0.3) * 0.12, (r() - 0.5) * 0.3], wob: 0.7 },
  snow: { size: 0.09, add: false, motes: [0xffffff, 0xe6f2ff], glows: [], glow: 0, vel: (r) => [0.5 + r() * 0.8, -(0.9 + r() * 0.8), (r() - 0.5) * 0.5], wob: 0.9 },
  dust: { size: 0.13, add: false, motes: [0xe8c090, 0xd8b080], glows: [], glow: 0, vel: (r) => [2.6 + r() * 1.8, (r() - 0.5) * 0.25, 0.6 + r() * 0.7], wob: 0.3 },
  wisp: { size: 0.13, add: true, motes: [0xc0c8e0, 0xa8b0d0], glows: [0xb890ff, 0x9aa8ff], glow: 0.12, vel: (r) => [(r() - 0.5) * 0.45, (r() - 0.4) * 0.15, (r() - 0.5) * 0.45], wob: 0.8 },
  ember: { size: 0.12, add: false, motes: [0x8a8480, 0x6a6460, 0x9a948c], glows: [0xff5a3c, 0xff8a3c], glow: 0.2, vel: (r) => [(r() - 0.5) * 0.5, -(0.35 + r() * 0.5), (r() - 0.5) * 0.5], wob: 0.5, embersRise: true },
};
const FX_BOX = 56, FX_H = 16;

export function installOutlife10(game) {
  const mods = game.mods;
  if (!mods) return null;
  C.registerOutlifeText();
  const offs = [];
  let disposed = false, map = null, pending = null, jobId = 0;
  const shown = new Set();
  const S = { time: 0, colT: 0, fogT: 0, toastT: -99, amb: new Map() };
  if (mods.soundGens) for (const [n, fn] of Object.entries(SOUNDS)) if (!mods.soundGens.has(n)) mods.soundGens.set(n, fn);
  const snd = (name, pos, vol) => { try { mods.ensureSound?.(name); game.audio?.at?.(name, pos, vol, { refDistance: 5, maxDistance: 28 }); } catch { /* audio optional */ } };
  const rnd = Math.random;

  // ------------------------------------------------------------------ teardown
  function clear() {
    jobId++;   // queued build jobs of the old map become no-ops
    if (map) {
      for (const c of map.cols) { try { game.physics.removeCollider(c); } catch { /* gone with the world */ } }
      for (const o of map.objs) {
        o.removeFromParent();
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { if (o.name !== 'ol-rocks') m.map?.dispose?.(); m.dispose?.(); }   // the rock texture is the shared cached one
      }
      map.group.removeFromParent();
    }
    map = null; pending = null; shown.clear(); S.amb.clear();
  }

  function onMapLoaded(world) {
    clear();
    const out = world?.outdoor, moon = MOONS[world?.moonId];
    if (disposed || !out || !moon || world.company || moon.customMap || moon.home || out.expedition) return;
    if (!out.plan || !out.terrain?.heightAt || !out.group) return;
    pending = { world, out, moon, ticks: 0 };   // wait for mapart + soul (they place their props on the first update) so we can keep off them
  }

  // ------------------------------------------------------------------ build (one landing job per step)
  function startBuild(pd) {
    const { world, out, moon } = pd;
    const my = ++jobId;
    const terrain = out.terrain, plan = out.plan, b = plan.biome || {};
    const B = { key: `${world.moonId}|${world.seed}`, out, plan: null, group: new THREE.Group(), objs: [], cols: [], pois: [], fogPools: [], t: 0, glowMat: null, sky: null, beacons: null, fogMesh: null, pts: null, fx: null, fogTint: null };
    B.group.name = 'outlife10';
    const alive = () => !disposed && my === jobId && game.world?.outdoor === out;
    const add = (o) => { if (!o) return; B.objs.push(o); B.group.add(o); };
    const steps = [
      ['plan', () => {
        const hard = [], soft = [];
        for (const t of (out.harvest?.trees || [])) hard.push({ x: t.x, z: t.z, r: 1.5 * (t.scale || 1) + 0.5 });
        for (const t of (out.harvest?.rocks || [])) hard.push({ x: t.x, z: t.z, r: 1.7 * (t.scale || 1) + 0.6 });
        for (const s of out.outposts?.sites || []) hard.push({ x: s.x, z: s.z, r: (s.radius || 8) + 3 });
        for (const s of out.outdoorScrapSpots || []) hard.push({ x: s.x, z: s.z, r: 2.6 });
        for (const s of out.decor?.scrapSpots || []) hard.push({ x: s.x, z: s.z, r: 2.6 });
        for (const f of plan.flats || []) hard.push({ x: f.x, z: f.z, r: (f.r || 8) + 4 });
        try { for (const sp of game.mapart?.plan?.() || []) if (Number.isFinite(sp.x)) hard.push({ x: sp.x, z: sp.z, r: (sp.r || 2) + 1.5 }); } catch { /* mapart optional */ }
        try { for (const sp of game.soul?.plan?.() || []) if (Number.isFinite(sp.x)) soft.push({ x: sp.x, z: sp.z, r: (sp.r || 2) + 1.5 }); } catch { /* soul optional */ }
        B.plan = C.planOutlife({
          seed: world.seed | 0, moonId: world.moonId, biomeId: moon.biome, decor: b.decor, sc: terrain.scale || 1, half: terrain.half, plan, pathPts: terrain.pathPts,
          heightAt: (x, z) => terrain.heightAt(x, z), distToPath: (x, z) => terrain.distToPath(x, z), avoid: out.avoid || null, solidAt: out.solidAt || null,
          lavaDepthAt: terrain.lava ? (x, z) => terrain.lavaDepthAt(x, z) : null, floodY: b.flood ?? null, obstacles: hard, soft,
        });
        B.pois = B.plan.pois;
        out.group.add(B.group);
        map = B;
      }],
      ['rocks', () => {
        const m = A.rocksMesh(B.plan.rocks);
        add(m);
        for (const r of B.plan.rocks) if (r.col) {
          const c = A.rockCollider(r);
          try { B.cols.push(game.physics.addStaticBox(c.x, c.y, c.z, c.hx, c.hy, c.hz, c.ry, G.STATIC, { kind: 'prop' })); } catch (e) { console.warn('[outlife10] collider', e); }
        }
      }],
      ['tufts', () => { for (const m of A.tuftMeshes(B.plan.tufts, B.plan.profile)) add(m); }],
      ['wood', () => { for (const m of A.woodMeshes(B.plan.snags, B.plan.stumps)) add(m); }],
      ['pois', () => {
        for (const m of A.poiMeshes(B.plan.pois, (x, z) => terrain.heightAt(x, z), world.seed | 0)) { add(m); if (m.name === 'ol-poi-glow') B.glowMat = m.material; }
      }],
      ['fog', () => {
        B.fogPools = B.plan.fog;
        const m = A.fogMesh(B.fogPools);
        if (m) { m.material.opacity = Math.min(0.6, B.plan.profile.fogA * 0.55); B.fogTint = new THREE.Color(B.plan.profile.fogC); B.fogMesh = m; add(m); }
      }],
      ['fx', () => { if (B.plan.fx) B.fx = makeFx(B.plan.fx, world.seed | 0); if (B.fx) add(B.fx.pts); }],
      ['sky', () => {
        const R2 = Math.min(175 * (terrain.scale || 1) + 85, (QUALITY.far || 420) - 14);
        const spec = C.skylineSpecs(B.plan.family, world.seed | 0, terrain.scale || 1, R2);
        for (const m of A.skylineMeshes(spec)) { add(m); if (m.isPoints) B.beacons = m; else B.sky = m; }
      }],
      ['done', () => { B.ready = true; try { game.landQ?.prewarm?.(); } catch { /* warm-up is best effort */ } }],
    ];
    const q = game.landQ;
    for (const [name, fn] of steps) {
      const job = () => { if (alive()) { try { fn(); } catch (e) { console.warn('[outlife10] ' + name, e); } } };
      if (q && q.enabled !== false) q.add('outlife:' + name, job); else job();
    }
  }

  // ------------------------------------------------------------------ pooled particle field
  function makeFx(def, seed) {
    const F = FX[def.kind];
    if (!F) return null;
    const cap = Math.max(60, QUALITY.particleCap || 600);
    const n = Math.max(40, Math.min(cap, Math.round(def.n * (QUALITY.particles || 1))));
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), base = new Float32Array(n * 3), vel = new Float32Array(n * 3), ph = new Float32Array(n), role = new Uint8Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * FX_BOX; pos[i * 3 + 1] = rnd() * FX_H; pos[i * 3 + 2] = (rnd() - 0.5) * FX_BOX;
      const glow = F.glows.length && rnd() < F.glow;
      role[i] = glow ? 1 : 0;
      c.set(glow ? F.glows[Math.floor(rnd() * F.glows.length)] : F.motes[Math.floor(rnd() * F.motes.length)]);
      base.set([c.r, c.g, c.b], i * 3); col.set([c.r, c.g, c.b], i * 3);
      ph[i] = rnd() * TAU;
      const v = F.vel(rnd);
      if (F.embersRise && glow) v[1] = 0.7 + rnd() * 0.9;   // embers rise, ash falls
      vel.set(v, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: F.size, vertexColors: true, transparent: true, opacity: F.add ? 0.8 : 0.9, depthWrite: false, fog: true, blending: F.add ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(g, mat);
    pts.name = 'ol-fx'; pts.frustumCulled = false;
    return { F, pts, pos, col, base, vel, ph, role, n, lastX: null, lastZ: null };
  }
  function updateFx(fx, dt, cam, night, doColor) {
    const { F, pos, col, base, vel, ph, role, n } = fx, half = FX_BOX / 2, t = S.time;
    fx.pts.position.set(cam.x, cam.y - FX_H * 0.35, cam.z);
    const mx = cam.x - (fx.lastX ?? cam.x), mz = cam.z - (fx.lastZ ?? cam.z);
    fx.lastX = cam.x; fx.lastZ = cam.z;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      pos[k] += vel[k] * dt - mx; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt - mz;
      pos[k] += Math.sin(t * 0.7 + ph[i]) * dt * F.wob; pos[k + 2] += Math.cos(t * 0.6 + ph[i]) * dt * F.wob;
      if (pos[k] > half) pos[k] -= FX_BOX; else if (pos[k] < -half) pos[k] += FX_BOX;
      if (pos[k + 2] > half) pos[k + 2] -= FX_BOX; else if (pos[k + 2] < -half) pos[k + 2] += FX_BOX;
      if (pos[k + 1] > FX_H) pos[k + 1] -= FX_H; else if (pos[k + 1] < 0) pos[k + 1] += FX_H;
    }
    fx.pts.geometry.attributes.position.needsUpdate = true;
    if (!doColor) return;
    const day = 1 - night * 0.75;
    for (let i = 0; i < n; i++) {
      let f = 1;
      if (F.add) f = role[i] ? Math.max(0, (night - 0.25) / 0.75) * (0.35 + 0.65 * Math.max(0, Math.sin(t * 1.9 + ph[i] * 3.1)) ** 2) : day * 0.7;   // fireflies only at night, twinkling
      else if (role[i]) f = 0.55 + 0.45 * Math.max(0, Math.sin(t * 3 + ph[i] * 5));   // embers flicker
      col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f; col[i * 3 + 2] = base[i * 3 + 2] * f;
    }
    fx.pts.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ per frame
  const _tint = new THREE.Color();
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    S.time += dt;
    if (pending) {
      const pd = pending;
      if (game.world?.outdoor !== pd.out) { pending = null; return; }
      pd.ticks++;
      let soulReady = true;
      try { if (game.soul && !(game.soul.plan?.() || []).length) soulReady = pd.ticks >= 6; } catch { /* soul optional */ }
      if (soulReady && pd.ticks >= 2) { pending = null; startBuild(pd); }
      return;
    }
    if (!map) return;
    if (game.world?.outdoor !== map.out) { clear(); return; }
    const p = game.player;
    if (!p) return;
    map.group.visible = !p.indoor;
    if (p.indoor || !map.ready) return;
    const cam = game.camera?.position || p.pos, night = Math.min(1, Math.max(0, game.env?.night ?? 0)), fogCol = game.scene?.fog?.color;
    if (fogCol) {
      if (map.sky) map.sky.material.color.copy(fogCol).multiplyScalar(0.72);
      if (map.fogMesh) map.fogMesh.material.color.copy(fogCol).multiplyScalar(0.6).add(_tint.copy(map.fogTint).multiplyScalar(0.42 * (1 - night * 0.85)));
    }
    if (map.beacons) map.beacons.material.opacity = (S.time % 1.7) < 0.22 ? 1 : 0.1;
    if (map.glowMat) map.glowMat.color.setScalar(0.78 + 0.22 * Math.sin(S.time * 37) * Math.sin(S.time * 11.3));
    if (map.fogMesh && (S.fogT += dt) > 0.1) { A.driftFog(map.fogMesh, S.time); S.fogT = 0; }
    if (map.fx) { S.colT += dt; const doC = S.colT > 0.066; if (doC) S.colT = 0; updateFx(map.fx, dt, cam, night, doC); }
    // points of interest: a sound each, and one dark-humour line the first time you stand next to a kind
    const pp = p.pos;
    for (const poi of map.pois) {
      const dx = pp.x - poi.x, dz = pp.z - poi.z, d2 = dx * dx + dz * dz, a = AMB[poi.kind];
      if (!a || d2 > a[3] * a[3] || game.run?.phase !== 'moon') continue;
      let at = S.amb.get(poi.id);
      if (at == null) at = S.time + rnd() * 2;
      if (S.time >= at) { snd(a[0], new THREE.Vector3(poi.x, poi.y + 0.8, poi.z), a[4]); at = S.time + a[1] + rnd() * (a[2] - a[1]); }
      S.amb.set(poi.id, at);
      if (d2 < 49 && !shown.has(poi.kind) && S.time - S.toastT > 45 && !p.dead && (game.chasefx?.tension?.() ?? 0) < 0.04) {
        shown.add(poi.kind); S.toastT = S.time;
        try { game.ui?.toast?.(C.poiText(poi.kind), 'info'); } catch { /* ui optional */ }
      }
    }
  }));
  offs.push(mods.on('mapLoaded', (world, g) => { if (g === game) onMapLoaded(world); }));

  return {
    plan: () => map?.plan || null,
    family: () => map?.plan?.family || null,
    pois: () => map?.pois || [],
    /** kefal.game.outlife10.stats() */
    stats: () => (map ? { family: map.plan.family, rocks: map.plan.rocks.length, tufts: map.plan.tufts.length, snags: map.plan.snags.length, stumps: map.plan.stumps.length, pois: map.pois.length, fog: map.fogPools.length, colliders: map.cols.length, drawCalls: map.objs.length, particles: map.fx?.n || 0 } : null),
    onMapLoaded,
    dispose() {
      disposed = true;
      clear();
      for (const off of offs.splice(0)) { try { off?.(); } catch { /* ignore */ } }
    },
  };
}
