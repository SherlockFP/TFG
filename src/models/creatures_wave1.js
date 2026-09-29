// creatures_wave1.js — procedural models for the wave-1 horde creatures and items (docs/wave1/horde.md).
//   Zombie Account swarm: ONE shared SwarmRenderer draws every body with InstancedMeshes (7 draw calls for up to
//     48 bodies); each CreatureView gets an empty "shell" model that only records its pose for the renderer.
//   Hit Squad (enforcer / gunner / leader) and the Doppel: player avatars (avatar.js) + gear.
//   Collector, Janitor, Collector's Nest, Janitor's Bin: modelkit meshes.
//   Items: Instant Camera, Squad Pistol, Pistol Magazine.
// Model contract (CreatureView): { root, parts, height, radius, update(dt, anim), setElite, setTint, setHitFlash, dispose }.
import * as THREE from 'three';
import {
  G, xf, merged, lam, bas, basI, tex, noiseFill, mk, pv, Tinter, clamp, lerp, damp, keys, rng, TAU, PI, HAS_DOM,
} from './modelkit.js';
import { createAvatar } from './avatar.js';

// faction order is part of the net format: the hit-squad creature seed encodes the faction as seed % 4
export const FACTIONS = [
  { id: 'algorithm', name: 'The Algorithm', short: 'Algorithm', color: '#ff3040' },
  { id: 'archive', name: 'The Archive', short: 'Archive', color: '#35e6ff' },
  { id: 'bureau', name: 'Moderation Bureau', short: 'Bureau', color: '#dfe8ff', accent: '#3a6cff' },
  { id: 'darkweb', name: 'Dark Web', short: 'Dark Web', color: '#3dff6a' },
];
export const factionIndex = (id) => Math.max(0, FACTIONS.findIndex((f) => f.id === id));

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _tm = new THREE.Matrix4(), _hm = new THREE.Matrix4(), _fm = new THREE.Matrix4();
const FLASH_COL = new THREE.Color(3, 0.6, 0.5);
const noop = () => {};

// =====================================================================================================
// ZOMBIE ACCOUNT swarm (instanced)
// =====================================================================================================
const SWARM_CAP = 72;   // > MAX_SWARM (40): other spawners (dice, sieges, dev tools) may exceed it; the nearest bodies are kept when it is hit
const HOODIES = ['#4a4e57', '#5b4747', '#45524a', '#534e69', '#66625a', '#3f4a5c'];

function swarmFaceAtlas() {
  // 4 frames (2x2): default profile silhouette, RGB-split glitch, static "404", screaming red X-eyes
  return tex('zombotFaces', 128, 128, (c, w, h, r) => {
    const frame = (fx, fy, draw) => { c.save(); c.translate(fx * 64, fy * 64); c.beginPath(); c.rect(0, 0, 64, 64); c.clip(); draw(); c.restore(); };
    const silhouette = (col, bg) => {
      c.fillStyle = bg; c.fillRect(0, 0, 64, 64);
      c.fillStyle = col; c.beginPath(); c.arc(32, 25, 11, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(32, 60, 22, 18, 0, 0, TAU); c.fill();
    };
    frame(0, 0, () => { silhouette('#9aa0a8', '#d6dadf'); c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < 64; y += 3) c.fillRect(0, y, 64, 1); });
    frame(1, 0, () => {
      silhouette('#8a9098', '#c8ccd2');
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,0,90,0.55)'; c.beginPath(); c.arc(28, 25, 11, 0, TAU); c.fill();
      c.fillStyle = 'rgba(0,255,220,0.55)'; c.beginPath(); c.arc(36, 26, 11, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 7; i++) { const y = (r() * 64) | 0; c.drawImage(c.canvas, 0, y, 64, 3, (r() - 0.5) * 18, y, 64, 3); }
    });
    frame(0, 1, () => {
      for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) { const v = (r() * 200 + 30) | 0; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, y, 2, 2); }
      c.fillStyle = '#101010'; c.fillRect(8, 22, 48, 20);
      c.fillStyle = '#ff3a3a'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText('404', 32, 39);
    });
    frame(1, 1, () => {
      c.fillStyle = '#2a0406'; c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#ff2a2a'; c.lineWidth = 4;
      for (const ex of [20, 44]) { c.beginPath(); c.moveTo(ex - 6, 16); c.lineTo(ex + 6, 28); c.moveTo(ex + 6, 16); c.lineTo(ex - 6, 28); c.stroke(); }
      c.fillStyle = '#000'; c.beginPath(); c.ellipse(32, 46, 14, 11, 0, 0, TAU); c.fill();
      c.fillStyle = '#ff2a2a'; for (let i = 0; i < 6; i++) c.fillRect(20 + i * 4, 37, 2, 4);
    });
  }, false);
}

function faceGeo(frame) {
  const g = new THREE.PlaneGeometry(0.28, 0.22);
  const u0 = (frame % 2) * 0.5, v0 = frame < 2 ? 0.5 : 0;   // canvas y is flipped in UV space
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  return g;
}

export class SwarmRenderer {
  constructor() {
    this.recs = new Set();
    this.ready = false;
    this.scene = null;
    this.onDeath = null;     // (rec) => void   death burst hook (set by the horde module)
    this.lastT = -1;         // performance.now() of the last update: update() is called by the CreatureManager AND the horde module, once per frame wins
  }
  build() {
    const mk2 = (geo, mat, cap = SWARM_CAP, colors = false) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (colors) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      return m;
    };
    const hoodieTex = tex('zombotHoodie', 32, 32, (c, w, h, r) => {
      noiseFill(c, w, h, r, '#ffffff', 0.12, 2);
      c.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 9; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 3 + ((r() * 4) | 0), 2);   // tears / grime
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(15, 0, 2, h);   // zipper
    });
    this.geos = [
      merged('zb_torso', () => [xf(G.box(0.46, 0.56, 0.28), [0, 0.28, 0]), xf(G.box(0.3, 0.16, 0.2), [0, 0.6, -0.08]), xf(G.box(0.2, 0.14, 0.05), [0, 0.18, 0.15])]),
      merged('zb_head', () => [xf(G.box(0.36, 0.3, 0.24)), xf(G.box(0.06, 0.1, 0.06), [0.12, 0.2, -0.02]), xf(G.box(0.3, 0.05, 0.05), [0, -0.17, 0.05])]),
      new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0),
    ];
    this.faceGeos = [0, 1, 2, 3].map(faceGeo);
    this.mats = [
      new THREE.MeshLambertMaterial({ color: '#ffffff', map: hoodieTex, flatShading: true }),
      new THREE.MeshLambertMaterial({ color: '#2c2e33', flatShading: true }),
      new THREE.MeshLambertMaterial({ color: '#ffffff', map: hoodieTex, flatShading: true }),
      new THREE.MeshBasicMaterial({ color: '#ffffff', map: swarmFaceAtlas(), fog: true }),
    ];
    this.torso = mk2(this.geos[0], this.mats[0], SWARM_CAP, true);
    this.head = mk2(this.geos[1], this.mats[1], SWARM_CAP, true);
    this.limbs = mk2(this.geos[2], this.mats[2], SWARM_CAP * 4, true);
    this.faces = this.faceGeos.map((g) => mk2(g, this.mats[3]));
    this.all = [this.torso, this.head, this.limbs, ...this.faces];
    this.ready = true;
  }
  attach(scene) {
    if (!this.ready) this.build();
    if (this.scene === scene) return;
    for (const m of this.all) m.removeFromParent();
    this.scene = scene;
    if (scene) for (const m of this.all) scene.add(m);
  }
  createModel(opts = {}) {
    const R = rng((opts.seed || 1) * 7 + 3);
    const rec = {
      root: new THREE.Group(), state: 'idle', t: 0, speed: 0, time: 0, flash: 0, age: 0, elite: false,
      ph: R() * TAU, gait: R() * TAU, hunch: 0.25 + R() * 0.3, lean: (R() - 0.5) * 0.25, armL: R() * 0.5, armR: R() * 0.5,
      col: new THREE.Color(HOODIES[(R() * HOODIES.length) | 0]).multiplyScalar(0.8 + R() * 0.35),
      face: 0, faceT: 0.5 + R() * 3, deadFired: false, R, tint: null,
    };
    rec.root.name = 'zombot_shell';
    this.recs.add(rec);
    const self = this;
    return {
      root: rec.root, parts: { head: rec.root }, height: 1.55, radius: 0.38, rec,
      update(dt, a = {}) { rec.state = a.state || 'idle'; rec.t = a.t || 0; rec.speed = a.speed ?? 0; rec.time = a.time || 0; rec.age += dt || 0; },
      setElite(b) { rec.elite = !!b; }, setTint(c) { rec.tint = new THREE.Color(c); }, setHitFlash(v) { rec.flash = v || 0; },
      dispose() { self.recs.delete(rec); },
    };
  }
  /** dt: seconds; scene: the main game scene (CreatureManager passes it; fallback = the first record's parent); camPos: for the cap */
  update(dt, scene = null, camPos = null) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastT < 2) return;   // already advanced this frame
    this.lastT = now;
    if (!this.recs.size) { if (this.ready) for (const m of this.all) m.count = 0; return; }
    if (!scene) for (const r of this.recs) { if (r.root.parent) { scene = r.root.parent; break; } }
    if (scene) this.attach(scene);   // also (re)builds the meshes after a dispose()
    else if (!this.ready) return;
    if (this.scene && !this.torso.parent) this.scene.add(...this.all);   // something removed the meshes from the scene (map unload sweeps): put them back
    let n = 0, ln = 0;
    const fc = [0, 0, 0, 0];
    let list = this.recs;
    if (this.recs.size > SWARM_CAP && camPos) {   // over the cap: draw the closest bodies, never an arbitrary subset
      list = [...this.recs].sort((a, b) => a.root.position.distanceToSquared(camPos) - b.root.position.distanceToSquared(camPos));
    }
    for (const r of list) {
      if (!r.root.parent || !r.root.visible || n >= SWARM_CAP) continue;
      if (r.root.parent.isScene && r.root.parent !== this.scene) { this.recs.delete(r); continue; }   // leftover of an ended session
      const st = r.state;
      const dead = st === 'dead';
      if (dead && !r.deadFired) { r.deadFired = true; try { this.onDeath?.(r); } catch { /* cosmetic */ } }
      if (dead && r.t > 2.4) continue;
      if (dead && r.t > 1.5 && Math.sin(r.t * 40) > 0) continue;   // de-rez flicker
      const moving = st === 'walk' || st === 'run' || st === 'crawl';
      const sp = moving ? Math.max(0.6, Math.min(r.speed || 1.2, 3)) : 0;
      r.gait = (r.gait + sp * dt * 3.2) % TAU;
      const gs = Math.sin(r.gait), tm = r.time + r.ph;
      // rise from the ground on spawn, fall + sink on death
      const rise = r.age < 0.9 ? -1.3 * (1 - r.age / 0.9) ** 2 : 0;
      // 'getup' (after a stun) plays the fall backwards: lying face down -> pushes up -> shambling again
      const gu = st === 'getup' ? clamp(r.t / 0.9, 0, 1) : 1;
      const fall = dead ? clamp(r.t / 0.55, 0, 1) : (1 - gu * gu * (3 - 2 * gu));
      const crawl = st === 'crawl' ? 1 : 0;
      const grab = st === 'grab' ? keys(r.t, [[0, 0], [0.22, 0.5], [0.4, 1], [0.72, 1], [0.85, 0]]) : 0;
      const atk = st === 'attack' ? keys(r.t, [[0, 0], [0.3, -0.5], [0.42, 1], [0.7, 0.3], [1, 0]]) : 0;
      const bang = st === 'bang' ? Math.max(0, Math.sin(r.t * 9)) : 0;
      const stun = st === 'stunned' ? 1 : 0;
      // root
      _p.copy(r.root.position); _p.y += rise - fall * 0.25 - (dead ? Math.max(0, r.t - 1.2) * 0.5 : 0);
      if (grab) { _p.x += Math.sin(r.root.rotation.y) * 0.3 * grab; _p.z += Math.cos(r.root.rotation.y) * 0.3 * grab; }   // lunge at the victim
      _e.set(fall * 1.35, r.root.rotation.y + Math.sin(tm * 1.7) * 0.08 * (1 - fall), r.lean * (1 - fall) + stun * Math.sin(tm * 11) * 0.15);
      _q.setFromEuler(_e);
      const sc = r.root.scale.x * (r.elite ? 1.15 : 1);
      _m.compose(_p, _q, _s.set(sc, sc, sc));
      // colours: hoodie tint + hit flash
      _c.copy(r.col);
      if (r.tint) _c.lerp(r.tint, 0.45);
      if (r.flash > 0) _c.lerp(FLASH_COL, r.flash);
      if (dead) _c.multiplyScalar(1 - fall * 0.4);
      // legs (shamble; the left leg drags)
      const hipY = crawl ? 0.36 : 0.8;
      const legSwing = moving ? gs * 0.45 : 0;
      // crawl: legs trail behind (dead weight), arms do the work
      this.limb(ln++, _m, [0.11, hipY, 0], [crawl ? 1.25 + gs * 0.15 : -legSwing * 0.7 + fall * 0.2, 0, 0.04], [0.13, 0.82, 0.14], _c);
      this.limb(ln++, _m, [-0.11, hipY, 0], [crawl ? 1.4 - gs * 0.15 : legSwing + fall * 0.1, 0, -0.04], [0.13, 0.82, 0.14], _c);
      // torso: hunched forward, sways with the gait
      const hunch = crawl ? 1.3 + gs * 0.05 : r.hunch + atk * 0.35 + bang * 0.25 + grab * 0.45 + (st === 'run' ? 0.15 : 0);
      _m2.compose(_p.set(0, hipY, 0), _q.setFromEuler(_e.set(hunch, gs * 0.12, Math.sin(r.gait * 0.5) * 0.1)), _s.set(1, 1, 1));
      const torsoM = _tm.multiplyMatrices(_m, _m2);
      this.torso.setMatrixAt(n, torsoM); this.torso.setColorAt(n, _c);
      // arms: zombie reach, flail on attack / bang on doors
      const reach = crawl ? -1.65 : -1.25 - atk * 0.6 - bang * 0.9 - grab * 0.75 + (1 - gu) * 1.1;
      const cw = crawl ? gs * 0.7 : 0;   // crawl: arms haul alternately
      const clasp = grab * 0.55;         // grab: both arms sweep inward around the victim
      this.limb(ln++, torsoM, [0.28, 0.52, 0.02], [reach + cw + Math.sin(tm * 2.1) * 0.12 + r.armL * 0.3 + gs * 0.1 * (1 - crawl), 0, 0.18 - clasp], [0.1, 0.58, 0.1], _c);
      this.limb(ln++, torsoM, [-0.28, 0.52, 0.02], [reach - cw + Math.sin(tm * 1.9 + 1) * 0.12 + r.armR * 0.3 - gs * 0.1 * (1 - crawl), 0, -0.18 + clasp], [0.1, 0.58, 0.1], _c);
      // head: lolling, twitching
      const tw = Math.sin(tm * 13) > 0.94 ? 0.35 : 0;
      _m2.compose(_p.set(0, 0.74, 0.04), _q.setFromEuler(_e.set(-0.25 + Math.sin(tm * 0.9) * 0.15 - atk * 0.3 - crawl * 0.95 + grab * 0.5, Math.sin(tm * 0.7) * 0.3, Math.sin(tm * 1.1) * 0.25 + tw)), _s.set(1, 1, 1));
      const headM = _hm.multiplyMatrices(torsoM, _m2);
      this.head.setMatrixAt(n, headM); this.head.setColorAt(n, _c.set(r.flash > 0 ? 2.2 : 1, 1, 1));
      // face screen (glitching default avatar)
      r.faceT -= dt;
      if (r.faceT <= 0) { if (r.face === 0) { r.face = 1 + ((r.R() * 2) | 0); r.faceT = 0.08 + r.R() * 0.25; } else { r.face = 0; r.faceT = 0.8 + r.R() * 4; } }
      let f = st === 'attack' || st === 'bang' || st === 'grab' || st === 'crawl' ? 3 : r.face;
      if (dead) f = 2;
      _m2.compose(_p.set(0, 0, 0.123), _q.identity(), _s.set(1, 1, 1));
      const fm = this.faces[f];
      fm.setMatrixAt(fc[f]++, _fm.multiplyMatrices(headM, _m2));
      n++;
    }
    this.torso.count = n; this.head.count = n; this.limbs.count = ln;
    for (let i = 0; i < 4; i++) { this.faces[i].count = fc[i]; this.faces[i].instanceMatrix.needsUpdate = true; }
    for (const m of [this.torso, this.head, this.limbs]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  limb(i, parentM, pos, rot, size, col) {
    _m2.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(size[0], size[1], size[2]));
    this.limbs.setMatrixAt(i, _m2.premultiply(parentM));
    this.limbs.setColorAt(i, col);
  }
  get drawCalls() { return this.ready ? 3 + this.faces.filter((f) => f.count > 0).length : 0; }
  dispose() {
    if (!this.ready) return;
    for (const m of this.all) { m.removeFromParent(); m.dispose?.(); }
    this.geos[2].dispose();
    for (const g of this.faceGeos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.ready = false; this.scene = null; this.lastT = -1;
    // recs are kept: the next update() rebuilds the meshes for the bodies that still exist (leftovers of an ended session are pruned there)
  }
}
export const SWARM = new SwarmRenderer();

// =====================================================================================================
// avatar based humanoids: HIT SQUAD + DOPPEL
// =====================================================================================================
function armPivots(av) {
  const hl = av.parts.handL, hr = av.parts.handR;
  return { shL: hl?.parent?.parent || null, shR: hr?.parent?.parent || null };
}

function knifeMesh() {
  const g = new THREE.Group();
  mk(g, merged('hs_knife_handle', () => [xf(G.box(0.035, 0.03, 0.12), [0, 0, 0.02]), xf(G.box(0.07, 0.015, 0.02), [0, 0, -0.045])]), lam('#1b1b1d'));
  mk(g, merged('hs_knife_blade', () => [xf(G.box(0.012, 0.035, 0.2), [0, 0.004, -0.15]), xf(G.cone(0.018, 0.05, 4), [0, 0.004, -0.27], [-PI / 2, 0, 0], [0.4, 1, 1])]), lam('#c8ccd2', { emissive: '#1a1a1a' }));
  return g;
}
function pistolMesh() {
  const g = new THREE.Group();
  mk(g, merged('hs_pistol', () => [
    xf(G.box(0.045, 0.05, 0.2), [0, 0.035, -0.06]),          // slide
    xf(G.box(0.04, 0.11, 0.05), [0, -0.03, 0.02], [0.25, 0, 0]), // grip
    xf(G.box(0.03, 0.03, 0.05), [0, -0.005, -0.02]),           // trigger guard
    xf(G.cyl(0.012, 0.012, 0.03, 6), [0, 0.035, -0.17], [PI / 2, 0, 0]),
  ]), lam('#232427'));
  const muzzle = pv(g, [0, 0.035, -0.19], null, 'muzzle');
  const flashM = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const flash = mk(muzzle, G.oct(0.07), flashM, [0, 0, -0.05], null, [0.7, 0.7, 1.6]);
  flash.visible = false;
  return { g, muzzle, flash, flashM };
}

/**
 * Hit Squad soldier. role: 'hs_enforcer' | 'hs_gunner' | 'hs_leader'. faction: index into FACTIONS.
 * States: idle, walk, patrol, run, aim (laser: set by the horde module via setLaser), fire, reload, windup, lunge,
 * recover, bark, stunned, flee, dead.
 */
export function createSoldierModel(role, faction = 0, seed = 1) {
  const F = FACTIONS[faction % FACTIONS.length];
  const R = rng(seed * 13 + 5);
  const suit = role === 'hs_leader' ? '#1c2233' : role === 'hs_gunner' ? '#2e3629' : '#26292d';
  const av = createAvatar({ suitColor: suit, hat: 'none', eyeColor: F.color, visorColor: '#07080a' });
  const root = new THREE.Group();
  root.add(av.root);
  const P = av.parts;
  const band = bas(F.color);
  const dark = lam('#1d1f22'), olive = lam(role === 'hs_gunner' ? '#3d4632' : '#2a2d33');
  // helmet (leader: beret) + tactical vest + armband(s)
  if (role === 'hs_leader') {
    mk(P.head, G.sph(0.19, 8, 4, 0, TAU, 0, PI * 0.3), lam(F.accent || F.color, { emissive: '#101010' }), [0.02, 0.2, -0.02], [0.1, 0, -0.25], [1.05, 0.55, 1.05]);
    mk(P.torso, merged('hs_sash', () => [xf(G.box(0.07, 0.62, 0.02), [0, 0.28, 0.17], [0, 0, 0.7]), xf(G.box(0.07, 0.62, 0.02), [0, 0.28, -0.17], [0, 0, -0.7])]), band);
  } else {
    mk(P.head, G.sph(0.19, 8, 4, 0, TAU, 0, PI * 0.36), olive, [0, 0.16, -0.01]);
    mk(P.head, G.box(0.3, 0.035, 0.05), dark, [0, 0.215, 0.15]);
  }
  mk(P.torso, merged('hs_vest', () => [
    xf(G.box(0.4, 0.34, 0.08), [0, 0.28, 0.14]), xf(G.box(0.4, 0.34, 0.07), [0, 0.28, -0.14]),
    xf(G.box(0.08, 0.1, 0.06), [0.1, 0.18, 0.2]), xf(G.box(0.08, 0.1, 0.06), [-0.1, 0.18, 0.2]), xf(G.box(0.08, 0.1, 0.06), [0, 0.18, 0.2]),
  ]), dark);
  const { shL, shR } = armPivots(av);
  const cuff = G.cyl(0.09, 0.09, 0.07, 7, true);
  if (shL) mk(shL, cuff, band, [0, -0.1, 0]);
  if (shR && role === 'hs_leader') mk(shR, cuff, band, [0, -0.1, 0]);
  // weapon
  let muzzle = null, flash = null, flashM = null;
  if (role === 'hs_enforcer') { const k = knifeMesh(); P.handR?.add(k); }
  else { const pm = pistolMesh(); P.handR?.add(pm.g); muzzle = pm.muzzle; flash = pm.flash; flashM = pm.flashM; }
  // laser sight (world-oriented by the horde module): thin additive beam + dot
  const laserM = new THREE.MeshBasicMaterial({ color: F.id === 'darkweb' ? '#40ff60' : '#ff2418', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  laserM.userData.noTint = true;
  const laser = mk(root, G.boxZ(0.012, 0.012, 1), laserM);
  const dot = mk(root, G.sph(0.045, 6, 4), laserM);
  laser.visible = false; dot.visible = false;
  let lunge = 0, deadT = 0;
  const ph = R() * TAU;
  return {
    root, parts: { head: P.head, handR: P.handR, muzzle, laser, dot, avatar: av }, height: 1.8, radius: 0.36, faction: F, role,
    update(dt, a = {}) {
      const st = a.state || 'idle';
      const aiming = st === 'aim' || st === 'fire';
      lunge = st === 'lunge' ? Math.min(1, lunge + dt / 0.3) : 0;
      deadT = st === 'dead' ? deadT + dt : 0;
      let swing = 0;
      if (role === 'hs_enforcer') {
        if (st === 'windup') swing = Math.min(0.3, (a.t || 0) * 0.6);
        else if (st === 'lunge') swing = 0.3 + lunge * 0.7;
        else if (st === 'attack') swing = ((a.t || 0) % 0.6) / 0.6;
      }
      const speed = st === 'dead' || st === 'stunned' || st === 'aim' || st === 'windup' ? 0 : (a.speed ?? 0);
      av.update(dt, {
        speed: Math.min(speed, 7), sprint: st === 'run' || st === 'lunge' || st === 'flee', crouch: st === 'reload' || st === 'windup' || st === 'stunned',
        holding: !aiming && st !== 'dead', emote: aiming || (st === 'bark' && role === 'hs_leader') ? 'point' : null, swing,
        lookPitch: aiming ? 0.05 : Math.sin((a.time || 0) * 0.6 + ph) * 0.1, dead: st === 'dead', grounded: true, time: (a.time || 0) + ph,
        twitch: st === 'stunned' ? Math.sin((a.time || 0) * 17) * 0.3 : 0,
      });
      av.setMouth(st === 'bark' || st === 'windup' ? 0.4 + 0.4 * Math.abs(Math.sin((a.t || 0) * 18)) : 0);
      if (flash) { flash.visible = st === 'fire' && (a.t || 0) < 0.07; if (flash.visible) flash.rotation.z = Math.random() * TAU; }
      if (st !== 'aim') { laser.visible = false; dot.visible = false; }
      void deadT;
    },
    /** world-space laser from the muzzle to `to` (Vector3) or null to hide; pulse 0..1 = how close the shot is */
    setLaser(to, pulse = 0) {
      if (!to || !muzzle) { laser.visible = false; dot.visible = false; return; }
      root.updateMatrixWorld(true);
      const from = muzzle.getWorldPosition(new THREE.Vector3());
      const len = Math.max(0.05, from.distanceTo(to));
      laser.position.copy(root.worldToLocal(from.clone()));
      laser.visible = true; dot.visible = true;
      laser.lookAt(to);
      laser.scale.set(1 + pulse * 1.5, 1 + pulse * 1.5, len);
      dot.position.copy(root.worldToLocal(to.clone()));
      laserM.opacity = 0.45 + 0.45 * Math.abs(Math.sin(pulse * pulse * 40));
    },
    muzzleWorld(out = new THREE.Vector3()) { if (!muzzle) return null; root.updateMatrixWorld(true); return muzzle.getWorldPosition(out); },
    setElite() {}, setTint() {},
    setHitFlash(v) { av.setHitFlash(v); },
    dispose() { av.dispose(); laserM.dispose(); flashM?.dispose(); },
  };
}

/**
 * The Doppel: a perfect copy of a crewmate's avatar. The horde module applies the look (setLook) and the name tag
 * (setTag) from the replicated victim id; setRevealed(true) after a photograph: red outline shell + red eyes.
 */
export function createDoppelModel(opts = {}) {
  const root = new THREE.Group();
  const av = createAvatar({ suitColor: opts.suitColor || '#d9642b', hat: opts.hat || 'none' });
  root.add(av.root);
  const tagSlot = pv(root, [0, 2.15, 0], null, 'tagSlot');
  let tag = null, revealed = false, hulls = null, talkT = 0, twT = 0, twZ = 0;
  const hullM = new THREE.MeshBasicMaterial({ color: '#ff1a3a', side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  hullM.userData.noTint = true;
  const R = rng((opts.seed || 1) * 3 + 11);
  return {
    root, parts: { head: av.parts.head, handR: av.parts.handR, avatar: av, tagSlot }, height: 1.8, radius: 0.35,
    get tag() { return tag; },
    setLook(suitHex, hat) { if (suitHex) av.setSuitColor(suitHex); if (hat && av.getHat() !== hat) av.setHat(hat); },
    setTag(sprite) { if (tag) { tag.removeFromParent(); tag.material?.map?.dispose(); tag.material?.dispose(); } tag = sprite; if (sprite) tagSlot.add(sprite); },
    setRevealed(b) {
      if (revealed === !!b) return;
      revealed = !!b;
      av.setEyeColor(revealed ? '#ff2030' : '#bff4ff');
      if (revealed && !hulls) {
        hulls = [];
        const meshes = [];
        av.root.traverse((o) => { if (o.isMesh && o.name !== 'visor') meshes.push(o); });
        for (const o of meshes) { const h = new THREE.Mesh(o.geometry, hullM); h.scale.setScalar(1.09); h.renderOrder = 1; o.add(h); hulls.push(h); }
      }
      if (hulls) for (const h of hulls) h.visible = revealed;
    },
    talk(sec) { talkT = Math.max(talkT, sec); },
    update(dt, a = {}) {
      const st = a.state || 'idle';
      talkT = Math.max(0, talkT - dt);
      twT -= dt;
      if (twT <= 0) { twT = revealed ? 0.15 + R() * 0.4 : 3 + R() * 6; twZ = revealed || st === 'attack' ? (R() - 0.5) * 1.1 : 0; }
      twZ = damp(twZ, 0, 6, dt);
      const atk = st === 'attack';
      av.update(dt, {
        speed: st === 'dead' || st === 'stunned' ? 0 : Math.min(a.speed ?? 0, 7), sprint: st === 'run', crouch: st === 'stunned' || st === 'crouch',
        dead: st === 'dead', swing: atk ? Math.min(1, (a.t || 0) / 0.55) : 0, grounded: true, holding: false,
        lookPitch: st === 'idle' ? Math.sin((a.time || 0) * 0.5) * 0.2 : 0, time: a.time,
        twitch: twZ + (st === 'stunned' ? Math.sin((a.time || 0) * 23) * 0.35 : 0), twitchY: revealed ? Math.sin((a.time || 0) * 7) * 0.2 : 0,
      });
      av.setMouth(talkT > 0 ? 0.25 + 0.6 * Math.abs(Math.sin((a.time || 0) * 15 + Math.sin((a.time || 0) * 4))) : atk ? 0.9 : 0);
      if (hulls && revealed) hullM.opacity = 0.55 + 0.35 * Math.abs(Math.sin((a.time || 0) * 6));
      if (tag) tag.visible = st !== 'dead';
    },
    setElite() {}, setTint() {},
    setHitFlash(v) { av.setHitFlash(v); },
    dispose() { if (tag) { tag.material?.map?.dispose(); tag.material?.dispose(); } av.dispose(); hullM.dispose(); },
  };
}

// =====================================================================================================
// COLLECTOR — skittish pack-rat bot with webcam eyes and a sack of stolen cables
// =====================================================================================================
function simpleModel(root, body, height, radius, update, extra = {}) {
  const tinter = new Tinter(root);
  return {
    root, parts: extra.parts || { head: root }, height, radius,
    update(dt, a = {}) { update(clamp(dt || 0, 0, 0.1), { state: a.state || 'idle', t: a.t || 0, time: a.time || 0, speed: a.speed ?? 0 }); },
    setElite(b) { body.scale.setScalar(b ? 1.12 : 1); if (b) tinter.setBase('#2c0606'); },
    setTint(c, strong) { tinter.setBase(new THREE.Color(c).multiplyScalar(strong ? 0.26 : 0.13)); },
    setHitFlash(v) { tinter.setFlash(v); },
    dispose() { tinter.dispose(); extra.dispose?.(); },
  };
}

export function createCollectorModel(opts = {}) {
  const R = rng((opts.seed || 1) * 5 + 1);
  const root = new THREE.Group();
  const body = pv(root, null, null, 'scaler');
  const fur = lam('#6b5a4a', { map: tex('colFur', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#ffffff', 0.22, 2); }) });
  const dark = lam('#2a2622'), sack = lam('#7d6a4c', { map: tex('colSack', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#ffffff', 0.15, 2); c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 3; y < h; y += 7) c.fillRect(0, y, w, 1); }) });
  const cable = lam('#1c1c1c'), cableR = lam('#b3262a'), cableY = lam('#d9a91e');
  const hips = pv(body, [0, 0.42, 0]);
  const legs = [1, -1].map((s) => { const l = pv(hips, [s * 0.1, 0, 0]); mk(l, G.segY(0.42, 0.05, 0.035, 4), fur); mk(l, G.box(0.08, 0.04, 0.14), dark, [0, -0.42, 0.04]); return l; });
  const torso = pv(hips, [0, 0.02, 0], [0.5, 0, 0]);
  mk(torso, G.sph(0.22, 7, 5), fur, [0, 0.16, 0], null, [1, 1.15, 0.9]);
  // the sack of stolen stuff on its back
  mk(torso, G.sph(0.24, 7, 5), sack, [0, 0.2, -0.22], null, [1.1, 1, 0.9]);
  mk(torso, merged('col_cables', () => [xf(G.tor(0.12, 0.018, 4, 8), [0.08, 0.38, -0.2], [0.4, 0.3, 0]), xf(G.tor(0.1, 0.018, 4, 8), [-0.1, 0.36, -0.28], [1.2, 0, 0.3])]), cable);
  mk(torso, G.tor(0.09, 0.016, 4, 8), cableR, [0, 0.42, -0.14], [0.2, 1, 0]);
  mk(torso, G.box(0.06, 0.12, 0.04), cableY, [-0.16, 0.34, -0.3], [0.3, 0.2, 0.4]);
  const neck = pv(torso, [0, 0.38, 0.08]);
  const head = pv(neck, null, null, 'head');
  mk(head, G.sph(0.14, 7, 5), fur, [0, 0.06, 0.02], null, [1.15, 0.9, 1]);
  const eyeM = basI('#ffd23a');
  eyeM.userData.noTint = true;
  for (const s of [1, -1]) {
    mk(head, G.cyl(0.065, 0.065, 0.05, 8), dark, [s * 0.075, 0.09, 0.14], [PI / 2, 0, 0]);
    mk(head, G.circle(0.035, 8), eyeM, [s * 0.075, 0.09, 0.167]);
  }
  mk(head, G.segY(0.18, 0.008, 0.008, 3), cable, [0.05, 0.34, 0], [0, 0, -0.2]);
  const ledM = basI('#ff2a2a'); ledM.userData.noTint = true;
  mk(head, G.sph(0.022, 4, 3), ledM, [0.087, 0.34, 0]);
  const arms = [1, -1].map((s) => {
    const sh = pv(torso, [s * 0.2, 0.26, 0.06]);
    mk(sh, G.segY(0.34, 0.035, 0.028, 4), fur);
    const el = pv(sh, [0, -0.34, 0]);
    mk(el, G.segY(0.3, 0.028, 0.022, 4), fur);
    mk(el, merged('col_claw', () => [xf(G.box(0.02, 0.07, 0.02), [0.02, -0.33, 0.01]), xf(G.box(0.02, 0.07, 0.02), [-0.02, -0.33, 0.01]), xf(G.box(0.02, 0.06, 0.02), [0, -0.33, -0.02])]), dark);
    return { sh, el, s };
  });
  const carry = pv(root, [0, 1.12, 0.12], null, 'carry');
  const tailP = pv(hips, [0, 0.05, -0.15]);
  mk(tailP, G.segZ(0.4, 0.02, 0.01, 3), cable, null, [2.6, 0, 0]);
  let ph = R() * TAU;
  const model = simpleModel(root, body, 0.95, 0.4, (dt, a) => {
    const st = a.state;
    const fast = st === 'fly' || st === 'flee' || st === 'run';
    const moving = fast || st === 'walk' || st === 'patrol';
    const sp = moving ? Math.max(1, a.speed || (fast ? 5 : 2)) : 0;
    ph = (ph + sp * dt * 5) % TAU;
    const s = Math.sin(ph);
    const dead = st === 'dead' ? clamp(a.t / 0.5, 0, 1) : 0;
    legs[0].rotation.x = s * 0.7 * (moving ? 1 : 0); legs[1].rotation.x = -s * 0.7 * (moving ? 1 : 0);
    hips.position.y = 0.42 + Math.abs(s) * 0.05 * (moving ? 1 : 0) - dead * 0.3;
    const carrying = carry.children.length > 0;
    carry.children.forEach((o, i) => o.position.set(i % 2 ? 0.1 : -0.06, i * 0.16, 0));
    torso.rotation.set(0.5 + (fast ? 0.35 : 0) - (carrying ? 0.35 : 0), Math.sin(a.time * 3) * 0.08, s * 0.06);
    // skittish head: darts around, eyes blink
    const look = st === 'idle' ? Math.sin(a.time * 4.7) * 0.6 * (Math.sin(a.time * 1.3) > 0 ? 1 : -0.4) : Math.sin(a.time * 9) * 0.1;
    head.rotation.set(-0.5 + (fast ? -0.2 : 0) + (carrying ? 0.3 : 0), look, Math.sin(a.time * 2.3) * 0.1);
    eyeM.color.set(st === 'attack' ? '#ff3020' : st === 'flee' ? '#ffffff' : '#ffd23a');
    ledM.color.set(Math.sin(a.time * 6) > 0 ? '#ff2a2a' : '#300404');
    for (const A of arms) {
      if (carrying) { A.sh.rotation.set(-2.9, 0, A.s * 0.35); A.el.rotation.x = -0.6; }
      else if (st === 'attack') { A.sh.rotation.set(-1.6 - Math.sin(a.t * 20) * 0.5, 0, A.s * 0.2); A.el.rotation.x = -0.4; }
      else { A.sh.rotation.set(-0.5 + (moving ? -s * A.s * 0.5 : Math.sin(a.time * 2 + A.s) * 0.1), 0, A.s * 0.15); A.el.rotation.x = -0.9; }
    }
    tailP.rotation.y = Math.sin(a.time * 3) * 0.5;
    body.rotation.z = dead * 1.4;
    body.position.y = dead * -0.05;
    if (st === 'stunned') body.rotation.z = Math.sin(a.time * 30) * 0.08;
  }, { parts: { head, carry }, dispose() { eyeM.dispose(); ledM.dispose(); } });
  model.parts.carry = carry;
  return model;
}

// =====================================================================================================
// JANITOR — polite caretaker robot on a wheel with a mop and a basket for "lost" tools
// =====================================================================================================
function janitorFaceTex(mood) {
  return tex('janFace|' + mood, 32, 24, (c, w, h) => {
    c.fillStyle = mood === 'angry' ? '#2a0404' : '#041a12'; c.fillRect(0, 0, w, h);
    c.fillStyle = mood === 'angry' ? '#ff3030' : '#40ffa0';
    if (mood === 'angry') { c.fillRect(6, 6, 7, 2); c.fillRect(19, 6, 7, 2); c.fillRect(8, 8, 4, 4); c.fillRect(20, 8, 4, 4); c.fillRect(10, 17, 12, 2); }
    else if (mood === 'busy') { for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; c.globalAlpha = 0.25 + i / 10; c.fillRect(15 + Math.cos(a) * 7, 11 + Math.sin(a) * 7, 3, 3); } c.globalAlpha = 1; }
    else { c.fillRect(8, 7, 4, 5); c.fillRect(20, 7, 4, 5); c.fillRect(8, 16, 2, 2); c.fillRect(22, 16, 2, 2); c.fillRect(10, 18, 12, 2); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
  }, false);
}
export function createJanitorModel(opts = {}) {
  const R = rng((opts.seed || 1) * 9 + 4);
  const root = new THREE.Group();
  const body = pv(root, null, null, 'scaler');
  const shell = lam('#5f7f86', { map: tex('janShell', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#ffffff', 0.1, 2); c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, 22, w, 1); }) });
  const dark = lam('#26292c'), stripe = lam('#e2c02e', { map: tex('janStripe', 16, 16, (c, w, h) => { c.fillStyle = '#e2c02e'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1a1a'; for (let x = -16; x < 16; x += 6) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 3, 0); c.lineTo(x + 3 + h, h); c.lineTo(x + h, h); c.fill(); } }) });
  const wood = lam('#a8845a'), mopM = lam('#c8c4b4', { map: tex('janMop', 16, 16, (c, w, h, r) => { noiseFill(c, w, h, r, '#ffffff', 0.25, 1); }) });
  // base: wheel housing
  const base = pv(body, [0, 0.22, 0]);
  mk(base, G.cyl(0.26, 0.3, 0.26, 10), dark);
  const wheel = pv(base, [0, -0.1, 0]);
  mk(wheel, G.cyl(0.12, 0.12, 0.34, 8), lam('#111111'), null, [0, 0, PI / 2]);
  const torso = pv(body, [0, 0.36, 0]);
  mk(torso, merged('jan_torso', () => [xf(G.cyl(0.22, 0.27, 0.8, 10), [0, 0.4, 0]), xf(G.cyl(0.24, 0.22, 0.1, 10), [0, 0.84, 0])]), shell);
  mk(torso, G.cyl(0.275, 0.275, 0.1, 10, true), stripe, [0, 0.15, 0]);
  mk(torso, G.box(0.18, 0.12, 0.02), lam('#dcdcd0'), [0, 0.55, 0.245]);   // name badge
  // basket on its back (carry anchor for confiscated tools)
  mk(torso, merged('jan_basket', () => [xf(G.box(0.36, 0.04, 0.26), [0, 0.3, -0.36]), xf(G.box(0.36, 0.22, 0.02), [0, 0.4, -0.49]), xf(G.box(0.02, 0.22, 0.26), [0.18, 0.4, -0.36]), xf(G.box(0.02, 0.22, 0.26), [-0.18, 0.4, -0.36])]), dark);
  const carry = pv(torso, [0, 0.45, -0.36], null, 'carry');
  // head: monitor with a face
  const neck = pv(torso, [0, 0.9, 0]);
  const head = pv(neck, null, null, 'head');
  mk(head, merged('jan_head', () => [xf(G.box(0.36, 0.28, 0.24), [0, 0.18, 0]), xf(G.cyl(0.03, 0.03, 0.1, 5), [0, 0.02, 0])]), shell);
  const faceMat = new THREE.MeshBasicMaterial({ map: janitorFaceTex('calm'), color: '#ffffff' });
  faceMat.userData.noTint = true;
  mk(head, G.plane(0.3, 0.22), faceMat, [0, 0.18, 0.121]);
  const beacon = new THREE.MeshBasicMaterial({ color: '#ffb020' }); beacon.userData.noTint = true;
  mk(head, G.sph(0.04, 6, 4), beacon, [0, 0.36, 0]);
  // arms: right holds the mop, left free (shoves)
  const arms = [1, -1].map((s) => {
    const sh = pv(torso, [s * 0.29, 0.72, 0]);
    mk(sh, G.segY(0.32, 0.045, 0.04, 5), dark);
    const el = pv(sh, [0, -0.32, 0]);
    mk(el, G.segY(0.28, 0.04, 0.035, 5), shell);
    mk(el, G.box(0.08, 0.08, 0.08), dark, [0, -0.3, 0]);
    return { sh, el, s };
  });
  const mop = pv(arms[1].el, [0, -0.3, 0.02]);
  mk(mop, G.cyl(0.018, 0.018, 1.3, 5), wood, [0, -0.1, 0]);
  mk(mop, merged('jan_mophead', () => [xf(G.box(0.26, 0.08, 0.12), [0, -0.78, 0]), ...[-0.1, -0.05, 0, 0.05, 0.1].map((x) => xf(G.box(0.03, 0.14, 0.03), [x, -0.86, (x * 7) % 0.05]))]), mopM);
  let ph = R() * TAU, mood = 'calm';
  const setMood = (m) => { if (m !== mood) { mood = m; faceMat.map = janitorFaceTex(m); faceMat.needsUpdate = true; } };
  const model = simpleModel(root, body, 1.95, 0.42, (dt, a) => {
    const st = a.state;
    const hostile = st === 'run' || st === 'attack';
    const moving = st === 'patrol' || st === 'walk' || st === 'return' || st === 'run' || st === 'home';
    const sp = moving ? Math.max(0.8, a.speed || 1.5) : 0;
    ph = (ph + sp * dt * 4) % TAU;
    wheel.rotation.x += sp * dt / 0.12;
    const dead = st === 'dead' ? clamp(a.t / 0.7, 0, 1) : 0;
    setMood(hostile || st === 'shove' ? 'angry' : st === 'rest' || st === 'home' ? 'busy' : 'calm');
    beacon.color.set(hostile ? (Math.sin(a.time * 14) > 0 ? '#ff2020' : '#400000') : st === 'rest' ? (Math.sin(a.time * 5) > 0 ? '#ffb020' : '#402800') : '#ffb020');
    torso.rotation.set(Math.sin(ph * 2) * 0.03 + (st === 'rest' ? 0.12 : 0) + (hostile ? 0.1 : 0), st === 'rest' ? Math.sin(a.time * 3) * 0.3 : 0, 0);
    head.rotation.set(0, st === 'idle' ? Math.sin(a.time * 0.8) * 0.5 : 0, 0);
    const [L, Rr] = arms;   // L = +x (left), Rr = -x (right, mop)
    if (st === 'rest') { Rr.sh.rotation.set(-0.7, 0, -0.2 + Math.sin(a.time * 3) * 0.5); Rr.el.rotation.x = -0.3; mop.rotation.set(0.5, 0, Math.sin(a.time * 3) * 0.3); }
    else if (st === 'attack') { const k = keys(a.t, [[0, 0], [0.35, -1], [0.5, 1], [0.8, 0.2]]); Rr.sh.rotation.set(-1.4 - k * 1.3, 0, -0.1); Rr.el.rotation.x = -0.5; mop.rotation.set(0.2, 0, 0); }
    else { Rr.sh.rotation.set(-0.35 + Math.sin(ph) * 0.1, 0, -0.1); Rr.el.rotation.x = -0.6; mop.rotation.set(0.35, 0, 0); }
    if (st === 'shove') { L.sh.rotation.set(-1.5, 0, 0.1); L.el.rotation.x = -0.05; }
    else if (st === 'home') { L.sh.rotation.set(-2.6, 0, 0.3); L.el.rotation.x = -0.8; }
    else { L.sh.rotation.set(-0.2 - Math.sin(ph) * 0.12, 0, 0.12); L.el.rotation.x = -0.4; }
    carry.children.forEach((o, i) => o.position.set(((i % 3) - 1) * 0.1, 0.05 + Math.floor(i / 3) * 0.12, 0));
    body.rotation.x = -dead * 1.35 + (st === 'stunned' ? Math.sin(a.time * 28) * 0.06 : 0);
    body.position.z = -dead * 0.6;
  }, { parts: { head, carry }, dispose() { faceMat.dispose(); beacon.dispose(); } });
  return model;
}

// =====================================================================================================
// static props: COLLECTOR'S NEST, JANITOR'S BIN
// =====================================================================================================
export function createNestModel(opts = {}) {
  const R = rng((opts.seed || 1) * 17 + 9);
  const root = new THREE.Group();
  const card = lam('#9a7a50', { map: tex('nestCard', 32, 32, (c, w, h, r) => { noiseFill(c, w, h, r, '#ffffff', 0.12, 2); c.fillStyle = 'rgba(60,40,20,0.4)'; c.fillRect(0, 14, w, 3); }) });
  const paper = lam('#d8d4c8', { map: tex('nestPaper', 32, 32, (c, w, h, r) => { c.fillStyle = '#e4e0d4'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(40,40,60,0.5)'; for (let i = 0; i < 40; i++) c.fillRect((r() * w) | 0, (r() * h) | 0, 1 + ((r() * 5) | 0), 1); }) });
  const cable = lam('#1c1c1c');
  const shine = new THREE.MeshBasicMaterial({ color: '#ffe38a' });
  mk(root, merged('nest_pile', () => [xf(G.sph(0.7, 8, 4, 0, TAU, 0, PI / 2), [0, 0, 0], [0, 0, 0], [1.1, 0.42, 1]), xf(G.sph(0.4, 7, 4, 0, TAU, 0, PI / 2), [0.5, 0.05, 0.3], [0, 0, 0], [1, 0.5, 1])]), paper);
  for (let i = 0; i < 4; i++) mk(root, G.box(0.36, 0.26, 0.3), card, [(R() - 0.5) * 1.3, 0.1 + R() * 0.15, (R() - 0.5) * 1.1], [R() * 0.6, R() * TAU, R() * 0.4]);
  mk(root, merged('nest_cables', () => [0, 1, 2, 3].map((i) => xf(G.tor(0.25 + i * 0.08, 0.02, 4, 10), [(i - 1.5) * 0.2, 0.22 + i * 0.03, (i % 2) * 0.2], [PI / 2 + i * 0.3, 0, i]))), cable);
  for (let i = 0; i < 5; i++) mk(root, G.oct(0.05), shine, [(R() - 0.5) * 1.1, 0.3 + R() * 0.1, (R() - 0.5) * 1.0]);
  return { root, parts: { head: root }, height: 0.5, radius: 0.9, update() {}, setElite() {}, setTint() {}, setHitFlash() {}, dispose() { shine.dispose(); } };
}
export function createBinModel() {
  const root = new THREE.Group();
  const binM = lam('#3f5d78'), dark = lam('#1e1f22');
  mk(root, merged('bin_body', () => [xf(G.box(0.7, 0.8, 0.6), [0, 0.5, 0]), xf(G.box(0.74, 0.06, 0.64), [0, 0.92, 0])]), binM);
  mk(root, merged('bin_wheels', () => [xf(G.cyl(0.07, 0.07, 0.06, 6), [0.28, 0.07, 0.24], [0, 0, PI / 2]), xf(G.cyl(0.07, 0.07, 0.06, 6), [-0.28, 0.07, 0.24], [0, 0, PI / 2]), xf(G.box(0.62, 0.06, 0.06), [0, 0.12, -0.28])]), dark);
  mk(root, G.box(0.72, 0.05, 0.5), binM, [0, 1.05, -0.25], [-1.1, 0, 0]);   // open lid
  const label = tex('binLabel', 64, 16, (c, w, h) => { c.fillStyle = '#e8e4d0'; c.fillRect(0, 0, w, h); c.fillStyle = '#20242a'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText('LOST+FOUND', w / 2, 12); }, false);
  mk(root, G.plane(0.5, 0.13), lam('#ffffff', { map: label }), [0, 0.7, 0.305]);
  mk(root, G.cyl(0.18, 0.15, 0.3, 8), lam('#e2c02e'), [0.55, 0.15, 0.1]);   // mop bucket
  return { root, parts: { head: root }, height: 1.0, radius: 0.5, update() {}, setElite() {}, setTint() {}, setHitFlash() {}, dispose() {} };
}

// =====================================================================================================
// ITEMS
// =====================================================================================================
export function createInstaCamModel() {
  const g = new THREE.Group();
  mk(g, merged('cam_body', () => [xf(G.box(0.2, 0.15, 0.11)), xf(G.box(0.2, 0.03, 0.13), [0, -0.075, 0.01])]), lam('#e8e2d2'));
  mk(g, merged('cam_trim', () => [xf(G.box(0.205, 0.02, 0.115), [0, 0.03, 0]), xf(G.box(0.04, 0.03, 0.03), [-0.06, 0.09, -0.02])]), lam('#2a2a2e'));
  mk(g, G.cyl(0.045, 0.05, 0.05, 10), lam('#1a1a1c'), [0.02, -0.01, -0.075], [PI / 2, 0, 0]);
  mk(g, G.circle(0.03, 10), new THREE.MeshBasicMaterial({ color: '#3a5a8a' }), [0.02, -0.01, -0.101], [0, PI, 0]);
  mk(g, G.box(0.06, 0.035, 0.01), new THREE.MeshBasicMaterial({ color: '#fffbe8' }), [0.06, 0.045, -0.056]);
  mk(g, G.box(0.025, 0.012, 0.025), lam('#d0302a'), [0.07, 0.08, 0.02]);
  mk(g, G.box(0.14, 0.012, 0.02), lam('#f4f0e8'), [0, -0.085, -0.035]);   // photo slot
  g.userData.tip = 'LMB: take a photo. Photos show things as they really are.';
  return g;
}
export function createPistolItemModel() {
  const { g } = pistolMesh();
  g.rotation.set(0, PI, 0);
  const w = new THREE.Group(); w.add(g); return w;
}
export function createMagItemModel() {
  const g = new THREE.Group();
  mk(g, G.box(0.035, 0.12, 0.06), lam('#2a2b2e'), [0, 0, 0], [0.2, 0, 0]);
  mk(g, G.box(0.03, 0.02, 0.04), lam('#b8962e'), [0, 0.065, 0.005]);
  return g;
}

/** register every creature / item model factory with the mod model registry (idempotent) */
export function registerHordeModels() {
  const mm = typeof window !== 'undefined' ? window.__kefalMods : null;
  if (!mm?.creatureModels) return false;
  const set = (id, fn) => { if (!mm.creatureModels.has(id)) mm.creatureModels.set(id, fn); };
  set('zombot', (_T, o) => SWARM.createModel(o || {}));
  for (const role of ['hs_enforcer', 'hs_gunner', 'hs_leader']) set(role, (_T, o) => createSoldierModel(role, (o?.seed || 0) % 4, o?.seed || 1));
  set('doppel', (_T, o) => createDoppelModel(o || {}));
  set('collector', (_T, o) => createCollectorModel(o || {}));
  set('janitor', (_T, o) => createJanitorModel(o || {}));
  set('hoardnest', (_T, o) => createNestModel(o || {}));
  set('janitorbin', () => createBinModel());
  if (mm.itemModels) {
    if (!mm.itemModels.has('instacam')) mm.itemModels.set('instacam', () => createInstaCamModel());
    if (!mm.itemModels.has('hs_pistol')) mm.itemModels.set('hs_pistol', () => createPistolItemModel());
    if (!mm.itemModels.has('hs_mag')) mm.itemModels.set('hs_mag', () => createMagItemModel());
  }
  return true;
}
void HAS_DOM; void lerp; void noop;
