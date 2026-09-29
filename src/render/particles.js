// Pooled PSX-style particles (square, unfiltered points): blood, sparks, dust, confetti.
// One THREE.Points with a fixed capacity; burst() writes into a ring buffer, update() integrates.
// Custom shader, so the global PSX vertex-snap patch is not applied (points would jitter badly).
import * as THREE from 'three';
import { QUALITY } from './quality.js';   // [perf2]

const CAP = 600;

const VS = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (220.0 / max(0.1, -mv.z));
}`;
const FS = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.01) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}`;

export const PRESETS = {
  blood: { count: 14, color: [0x8a0d0d, 0xb31a12, 0x5a0606], speed: 3.2, up: 1.6, life: 0.7, size: 0.07, gravity: 11, drag: 1.5 },
  sparks: { count: 12, color: [0xffd27a, 0xffa030, 0xfff2c0], speed: 5.5, up: 1.2, life: 0.35, size: 0.045, gravity: 6, drag: 2.5, additive: true },
  goo: { count: 12, color: [0x3a8a2a, 0x5aba3a, 0x2a5a1a], speed: 2.6, up: 1.8, life: 0.8, size: 0.08, gravity: 10, drag: 1.2 },
  dust: { count: 10, color: [0x8a7a66, 0x6a5e50, 0xa89880], speed: 1.2, up: 0.8, life: 0.9, size: 0.12, gravity: -0.4, drag: 3 },
  death: { count: 40, color: [0x8a0d0d, 0xb31a12, 0x2a0000, 0xffd27a], speed: 4.2, up: 3, life: 1.1, size: 0.09, gravity: 9, drag: 1.2 },
  glitch: { count: 26, color: [0x00ffd0, 0xff2bd6, 0xffffff], speed: 3, up: 2, life: 0.8, size: 0.08, gravity: 0, drag: 2 },
  // game feel: scan label glints, landing puffs, splashes, snow
  scanglint: { count: 7, color: [0x9fd4ff, 0xdff4ff, 0x5ab8ff], speed: 1.1, up: 0.9, life: 0.55, size: 0.05, gravity: -0.6, drag: 2.5 },
  landpuff: { count: 12, color: [0x8a7a66, 0x6a5e50, 0x9a8c78], speed: 2.2, up: 0.25, life: 0.6, size: 0.1, gravity: -0.2, drag: 4 },
  splash: { count: 14, color: [0x6a8a9a, 0x9ab8c8, 0x3a5a6a], speed: 1.8, up: 2.4, life: 0.55, size: 0.05, gravity: 10, drag: 1.2 },
  snowpuff: { count: 12, color: [0xe8eef4, 0xffffff, 0xc8d4e0], speed: 1.6, up: 0.8, life: 0.8, size: 0.07, gravity: 1.5, drag: 3 },
};

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(CAP * 3);
    this.vel = new Float32Array(CAP * 3);
    this.col = new Float32Array(CAP * 3);
    this.size = new Float32Array(CAP);
    this.alpha = new Float32Array(CAP);
    this.life = new Float32Array(CAP);
    this.maxLife = new Float32Array(CAP);
    this.grav = new Float32Array(CAP);
    this.drag = new Float32Array(CAP);
    this.head = 0;
    this.alive = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /** burst(pos, preset | opts, dir?) — dir biases the spray (e.g. away from the attacker). */
  burst(pos, preset = 'blood', dir = null, mul = 1) {
    const o = typeof preset === 'string' ? PRESETS[preset] || PRESETS.blood : preset;
    const n = Math.max(1, Math.round((o.count || 10) * mul * QUALITY.particles));   // [perf2]
    const cap = Math.min(CAP, QUALITY.particleCap);
    for (let k = 0; k < n; k++) {
      const i = this.head % cap; this.head = (i + 1) % cap;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = (o.speed || 3) * (0.35 + Math.random() * 0.8);
      let vx = Math.cos(a) * s * sp, vy = Math.abs(u) * sp * 0.5 + (o.up || 0) * Math.random(), vz = Math.sin(a) * s * sp;
      if (dir) { vx += dir.x * sp * 0.9; vy += dir.y * sp * 0.5; vz += dir.z * sp * 0.9; }
      this.pos[i * 3] = pos.x; this.pos[i * 3 + 1] = pos.y; this.pos[i * 3 + 2] = pos.z;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const cols = Array.isArray(o.color) ? o.color : [o.color || 0xffffff];
      this._c.set(cols[(Math.random() * cols.length) | 0]).convertSRGBToLinear();
      this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
      this.size[i] = (o.size || 0.07) * (0.6 + Math.random() * 0.8);
      this.maxLife[i] = this.life[i] = (o.life || 0.7) * (0.6 + Math.random() * 0.7);
      this.grav[i] = o.gravity ?? 9;
      this.drag[i] = o.drag ?? 1.5;
      this.alpha[i] = 1;
    }
    this.alive = Math.min(CAP, this.alive + n);
  }

  update(dt) {
    if (this.alive <= 0) return;
    let any = 0;
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      any++;
      this.life[i] -= dt;
      const f = Math.max(0, 1 - this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= f; this.vel[j + 2] *= f;
      this.vel[j + 1] = this.vel[j + 1] * f - this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.alpha[i] = k > 0.3 ? 1 : k / 0.3;
    }
    this.alive = any;
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.aAlpha.needsUpdate = true; a.aColor.needsUpdate = true; a.aSize.needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geo.dispose(); this.mat.dispose();
  }
}

// ------------------------------------------------------------------ scan wave (LC-style)
// A translucent expanding sphere with travelling scanlines (mesh) + a bright shell swept over every
// surface (engine post pass, engine.setScan). reveal(labels) staggers the HUD scan labels so each
// one pops in when the wave reaches it, with a rising blip and a little glint.
const SCAN_VS = `
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SCAN_FS = `
uniform float uA;
uniform float uTime;
uniform vec3 uCol;
uniform vec3 uCam;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 v = normalize(vWorld - uCam);
  float rim = 1.0 - abs(dot(v, vN));
  float band = smoothstep(0.86, 1.0, fract(vWorld.y * 1.6 - uTime * 2.2));
  float fine = smoothstep(0.7, 1.0, fract(vWorld.y * 9.0)) * 0.35;
  float a = uA * (0.05 + 0.34 * band + 0.06 * fine + 0.45 * pow(rim, 3.0));
  if (a < 0.004) discard;
  gl_FragColor = vec4(uCol * (0.6 + band), a);
}`;

export class ScanFx {
  constructor(game) {
    this.game = game;
    this.geo = new THREE.SphereGeometry(1, 36, 18);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SCAN_VS, fragmentShader: SCAN_FS, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0x5ab8ff) }, uCam: { value: new THREE.Vector3() } },
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.origin = new THREE.Vector3();
    this.t = 0; this.dur = 1; this.range = 20; this.active = false;
    this.pending = [];   // label glints waiting for the wave
  }

  /** Wave radius after t seconds (fast start, eases out at the scan range). */
  radiusAt(t) { const u = Math.min(1, t / this.dur); return this.range * (1 - (1 - u) * (1 - u)); }
  /** Seconds until the wave reaches distance d. */
  delayFor(d) { const f = Math.min(1, Math.max(0, d / this.range)); return (1 - Math.sqrt(1 - f)) * this.dur; }

  start(origin, range = 20) {
    this.origin.copy(origin);
    this.range = Math.max(6, range || 20);
    this.dur = Math.min(1.35, Math.max(0.7, this.range / 24));
    this.t = 0; this.active = true;
    this.pending.length = 0;
    this.mesh.position.copy(this.origin);
    this.mesh.visible = true;
  }

  /** Sort labels near → far, give each a pop-in delay (l.delay, s) and schedule blips + glints. */
  reveal(labels) {
    if (!labels?.length) return labels;
    for (const l of labels) l._d = l.pos ? l.pos.distanceTo(this.origin) : 0;
    labels.sort((a, b) => a._d - b._d);
    const audio = this.game.audio;
    labels.forEach((l, i) => {
      l.delay = Math.min(this.dur, this.delayFor(Math.min(l._d, this.range))) + i * 0.012;
      if (i < 10 && audio?.has?.('scan_blip')) audio.play('scan_blip', { volume: 0.22 - i * 0.012, bus: 'ui', delay: l.delay, pitch: 0.9 + Math.min(i, 8) * 0.05 });
      if (i < 24 && l.pos) this.pending.push({ t: l.delay, pos: l.pos.clone() });
      delete l._d;
    });
    return labels;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const u = this.t / this.dur;
    const r = this.radiusAt(this.t);
    const alpha = u < 0.75 ? 1 : Math.max(0, 1 - (u - 0.75) / 0.45);
    const eng = this.game.engine;
    eng.setScan(this.origin, r, alpha * 0.9);
    this.mesh.scale.setScalar(Math.max(0.3, r));
    this.mat.uniforms.uA.value = alpha * 0.55 * (1 - Math.min(1, u) * 0.4);
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uCam.value.copy(eng.camera.position);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (this.t >= p.t) { this.game.particles?.burst(p.pos, 'scanglint'); this.pending.splice(i, 1); }
    }
    if (alpha <= 0) { this.active = false; this.mesh.visible = false; eng.setScan(null, 0, 0); this.pending.length = 0; }
  }

  dispose() {
    this.game.engine?.setScan?.(null, 0, 0);
    this.mesh.removeFromParent();
    this.geo.dispose(); this.mat.dispose();
  }
}
