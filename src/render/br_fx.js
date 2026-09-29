// BACKROOMS FX (module 'backrooms'): the glitch wall patch, the noclip tear/fall overlay, the found-footage (VHS)
// overlay, procedural sounds and the Liminal Polaroid fallback photo. Everything here is local/cosmetic
// (Math.random is fine); world state lives in src/game/backrooms.js.
import * as THREE from 'three';

// ------------------------------------------------------------------ procedural sounds (KefalAPI.registerSound)
const TAU = Math.PI * 2;
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

export function registerBrSounds(api) {
  if (!api?.registerSound) return;
  // digital tear: gated bit-crushed noise, stutter repeats and a falling carrier
  api.registerSound('br_tear', (sr) => {
    const n = Math.floor(sr * 1.15), out = new Float32Array(n), r = lcg(77);
    let hold = 0, held = 0, gate = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = i / n;
      if (i % Math.floor(sr * 0.028) === 0) gate = r() < 0.72 ? 1 : 0.15;
      if (hold-- <= 0) { held = r() * 2 - 1; hold = 2 + Math.floor(r() * 26 * (1 - k)); }
      const carrier = Math.sin(TAU * (900 - 700 * k) * t) * 0.35 + Math.sign(Math.sin(TAU * (140 + 60 * Math.sin(t * 31)) * t)) * 0.18;
      const env = Math.min(1, t * 30) * (1 - k * 0.55);
      out[i] = Math.max(-1, Math.min(1, (held * 0.7 + carrier) * gate * env * 0.8));
    }
    // stutter: copy a few 40 ms slices forward
    const sl = Math.floor(sr * 0.04);
    for (let s = 0; s < 5; s++) { const from = Math.floor(n * (0.15 + s * 0.12)), to = from + sl; for (let j = 0; j < sl && to + j < n; j++) out[to + j] = out[from + j] * 0.9; }
    return out;
  });
  // falling: rising wind rush
  api.registerSound('br_fall', (sr) => {
    const n = Math.floor(sr * 2.2), out = new Float32Array(n), r = lcg(1234);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n, t = i / sr;
      const cut = 0.02 + 0.2 * k;
      const w = r() * 2 - 1;
      lp += (w - lp) * cut; lp2 += (lp - lp2) * cut;
      const tone = Math.sin(TAU * (220 - 120 * k) * t) * 0.06 * k;
      const env = Math.min(1, k * 3) * (k > 0.9 ? (1 - k) * 10 : 1);
      out[i] = (lp2 * 3.2 + tone) * env * 0.8;
    }
    return out;
  });
  // the Level 0 hum: 120 Hz ballast buzz + harmonics (integer cycles in 2 s -> seamless loop)
  api.registerSound('br_hum', (sr) => {
    const n = Math.floor(sr * 2), out = new Float32Array(n), r = lcg(9);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const buzz = Math.sin(TAU * 120 * t) * 0.34 + Math.sin(TAU * 240 * t) * 0.2 + Math.sin(TAU * 360 * t) * 0.12 + Math.sin(TAU * 600 * t) * 0.05 + Math.sin(TAU * 60 * t) * 0.18;
      lp += ((r() * 2 - 1) - lp) * 0.3;
      const saw = ((t * 120) % 1) * 2 - 1;
      out[i] = (buzz + saw * 0.06 + lp * 0.05) * 0.55;
    }
    return out;
  });
  // the glitch wall: beating low drone with crackle (loop)
  api.registerSound('br_glitch_hum', (sr) => {
    const n = Math.floor(sr * 2), out = new Float32Array(n), r = lcg(4242);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const drone = Math.sin(TAU * 55 * t) * 0.4 + Math.sin(TAU * 82.5 * t) * 0.25 + Math.sin(TAU * 110.5 * t) * 0.18 * Math.sin(TAU * 0.5 * t);
      const crackle = r() < 0.004 ? (r() * 2 - 1) * 0.9 : 0;
      out[i] = (drone + crackle) * 0.5;
    }
    return out;
  });
  // EXIT: heavy latch clunk + a relieved major chord
  api.registerSound('br_exit', (sr) => {
    const n = Math.floor(sr * 1.6), out = new Float32Array(n), r = lcg(55);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const clunk = t < 0.12 ? (r() * 2 - 1) * Math.exp(-t * 45) * 0.9 + Math.sin(TAU * 70 * t) * Math.exp(-t * 20) * 0.8 : 0;
      const ch = t > 0.18 ? (Math.sin(TAU * 523.25 * t) + Math.sin(TAU * 659.25 * t) * 0.8 + Math.sin(TAU * 783.99 * t) * 0.6) * 0.12 * Math.exp(-(t - 0.18) * 2.2) * Math.min(1, (t - 0.18) * 20) : 0;
      out[i] = clunk + ch;
    }
    return out;
  });
}

// ------------------------------------------------------------------ the glitch patch on a facility wall
const PATCH_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PATCH_FRAG = `
uniform float uTime; uniform float uOpen; uniform float uFade;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h(vec2(i, 0.0)), h(vec2(i + 1.0, 0.0)), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec2 uv = vUv;
  float t = uTime;
  // horizontal tearing: bands of the patch slide sideways
  float band = floor(uv.y * 38.0 + floor(t * 9.0) * 3.0);
  float slide = (h(vec2(band, floor(t * 12.0))) - 0.5) * 0.14 * (0.6 + uOpen);
  uv.x += slide * step(0.55, h(vec2(band * 1.7, floor(t * 7.0))));
  // jagged vertical rift
  float w = 0.13 + 0.09 * n1(uv.y * 9.0 + t * 1.3) + 0.05 * n1(uv.y * 31.0 - t * 4.0) + 0.1 * uOpen;
  float d = abs(uv.x - 0.5) / w;
  float edgeFade = smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.86, uv.y);
  // inside: the Backrooms peeking through (yellow wallpaper stripes, flat light)
  vec3 inside = vec3(0.86, 0.74, 0.34) * (0.86 + 0.14 * step(0.5, fract(uv.x * 26.0))) * (0.9 + 0.1 * sin(uv.y * 400.0 + t * 20.0));
  // static + chromatic fringe around it
  float st = h(floor(vUv * vec2(90.0, 140.0)) + floor(t * 24.0));
  vec3 fringe = vec3(st) * mix(vec3(1.0, 0.25, 0.9), vec3(0.2, 1.0, 0.95), step(0.5, h(vec2(band, 3.0 + floor(t * 5.0)))));
  vec3 col = d < 1.0 ? inside : fringe;
  float a = d < 1.0 ? 1.0 : smoothstep(2.3, 1.0, d) * (0.35 + 0.65 * st);
  // flicker the whole thing now and then
  float fl = step(0.93, h(vec2(floor(t * 14.0), 9.0)));
  a *= edgeFade * (1.0 - 0.7 * fl) * uFade;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}`;

export class GlitchPatch {
  constructor(scene, pos, normal, lightPool) {
    this.scene = scene;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 1 } },
      vertexShader: PATCH_VERT, fragmentShader: PATCH_FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.35), this.mat);
    this.mesh.position.copy(pos).addScaledVector(normal, 0.03);
    this.mesh.position.y += 1.2;
    this.mesh.rotation.y = Math.atan2(normal.x, normal.z);
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = true;
    this.mesh.name = 'br_glitch_patch';
    scene.add(this.mesh);
    this.lightPool = lightPool;
    this.emitter = lightPool ? lightPool.add({ pos: this.mesh.position.clone().addScaledVector(normal, 0.5), color: 0xffd96a, intensity: 0.55, distance: 5, flicker: 0.6, group: 'br_glitch' }) : null;
    this.fade = 1;
  }
  update(dt, { open = false, sealed = false } = {}) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uOpen.value += ((open ? 1 : 0) - this.mat.uniforms.uOpen.value) * Math.min(1, dt * 2);
    this.fade += ((sealed ? 0 : 1) - this.fade) * Math.min(1, dt * 1.5);
    this.mat.uniforms.uFade.value = this.fade;
    this.mesh.visible = this.fade > 0.01;
    if (this.emitter) { this.emitter.enabled = this.fade > 0.05; this.emitter.intensity = 0.55 * this.fade * (open ? 1.5 : 1); }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); this.mat.dispose();
    if (this.emitter) this.lightPool?.remove(this.emitter);
  }
}

// ------------------------------------------------------------------ full-screen overlays (DOM, pointer-events: none)
function uiRoot() { return document.getElementById('ui') || document.body; }

/** Noclip transition: tear (RGB-split static slices) -> fall (black, yellow streaks rushing up) -> land. */
export class NoclipOverlay {
  constructor() {
    this.c = document.createElement('canvas');
    this.c.className = 'br-noclip-overlay';
    this.c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;display:none;image-rendering:pixelated';
    this.c.width = 320; this.c.height = 180;
    this.g = this.c.getContext('2d');
    uiRoot().appendChild(this.c);
    this.streaks = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), l: 0.05 + Math.random() * 0.25, s: 0.6 + Math.random() * 1.6 }));
  }
  show(on) { this.c.style.display = on ? 'block' : 'none'; }
  /** stage: 'tear' (k 0..1 intensity) | 'fall' (t seconds) | 'land' (k 1..0) */
  draw(stage, k, t) {
    const g = this.g, W = this.c.width, H = this.c.height;
    g.clearRect(0, 0, W, H);
    if (stage === 'tear') {
      const n = Math.floor(6 + k * 40);
      for (let i = 0; i < n; i++) {
        const y = Math.random() * H, h = 1 + Math.random() * (3 + k * 14);
        const x = (Math.random() - 0.5) * 40 * k;
        const c = Math.random();
        g.fillStyle = c < 0.33 ? `rgba(255,40,200,${0.25 + k * 0.5})` : c < 0.66 ? `rgba(40,255,240,${0.25 + k * 0.5})` : `rgba(255,236,150,${0.2 + k * 0.5})`;
        g.fillRect(x, y, W, h);
        if (Math.random() < 0.4) { g.fillStyle = `rgba(0,0,0,${0.5 + k * 0.5})`; g.fillRect(0, y + h, W, 1 + Math.random() * 3 * k); }
      }
      // the rift opens down the middle
      if (k > 0.45) {
        const w = (k - 0.45) * W * 1.6;
        g.fillStyle = `rgba(0,0,0,${Math.min(1, (k - 0.45) * 2.5)})`;
        for (let y = 0; y < H; y += 3) { const j = (Math.random() - 0.5) * 18 * k; g.fillRect(W / 2 - w / 2 + j, y, w, 3); }
      }
    } else if (stage === 'fall') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      for (const s of this.streaks) {
        s.y -= s.s * 0.035 * (1 + t * 0.8);
        if (s.y + s.l < 0) { s.y = 1 + Math.random() * 0.3; s.x = Math.random(); }
        const a = 0.3 + 0.55 * Math.min(1, t);
        g.fillStyle = `rgba(255,226,130,${a})`;
        g.fillRect(s.x * W, s.y * H, 1 + (s.s > 1.6 ? 1 : 0), s.l * H);
      }
      // passing lit floors (rectangles of yellow flashing by)
      for (let k = 0; k < 2; k++) {
        const ph = (t * 2.3 + k * 0.5) % 1;
        const a = 0.2 * (1 - Math.abs(ph - 0.5) * 2);
        g.fillStyle = `rgba(236,206,96,${a})`;
        g.fillRect(0, (1 - ph) * H * 1.2 - 24, W, 22);
        g.fillStyle = `rgba(255,250,225,${a * 1.6})`;   // a row of troffers flashing past
        for (let x = 12; x < W; x += 46) g.fillRect(x, (1 - ph) * H * 1.2 - 20, 20, 3);
      }
    } else if (stage === 'land') {
      g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 8 * k; i++) { g.fillStyle = `rgba(255,236,150,${0.3 * k})`; g.fillRect(0, Math.random() * H, W, 1 + Math.random() * 2); }
    }
  }
  dispose() { this.c.remove(); }
}

/** Found-footage look while inside: scanlines, a slow tracking band, vignette and a warm grade. CSS only. */
export class VhsOverlay {
  constructor() {
    const el = document.createElement('div');
    el.className = 'br-vhs';
    // on <body> right under the #ui layer (z 10): over the 3D view, under the HUD text
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9;display:none';
    el.innerHTML = `
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.16) 0 1px,rgba(0,0,0,0) 1px 3px)"></div>
      <div class="br-vhs-band" style="position:absolute;left:0;right:0;height:9%;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,248,210,0.07) 40%,rgba(255,255,255,0.12) 50%,rgba(255,248,210,0.05) 60%,rgba(255,255,255,0));"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(40,30,0,0.38) 100%)"></div>
      <div class="br-vhs-rec" style="position:absolute;left:28px;bottom:26px;font:700 20px/1 'Courier New',monospace;color:#f2f2f2;text-shadow:2px 2px 0 rgba(0,0,0,0.6);letter-spacing:2px;opacity:0.85"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.band = el.querySelector('.br-vhs-band');
    this.rec = el.querySelector('.br-vhs-rec');
    this.t = 0;
  }
  show(on) { this.el.style.display = on ? 'block' : 'none'; }
  update(dt, recSeconds) {
    if (this.el.style.display === 'none') return;
    this.t += dt;
    const y = ((this.t * 0.07) % 1.2) - 0.1;
    this.band.style.top = (y * 100).toFixed(2) + '%';
    const s = Math.max(0, Math.floor(recSeconds));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor(s / 60) % 60).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
    const dot = Math.floor(this.t * 1.6) % 2 ? '<span style="color:#ff3030">●</span>' : '<span style="opacity:0">●</span>';
    this.rec.innerHTML = `${dot} PLAY ▶ ${hh}:${mm}:${ss}<br><span style="font-size:13px;opacity:0.8">SP · LEVEL 0 · CH 03</span>`;
  }
  dispose() { this.el.remove(); }
}

// ------------------------------------------------------------------ Liminal Polaroid fallback photo
/** Draws a small liminal "photo" (yellow room, troffers, a far doorway, sometimes a figure). Deterministic per seed. */
export function drawLiminalPhoto(canvas, seed) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let s = (seed >>> 0) || 7;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const vx = W * (0.35 + r() * 0.3), vy = H * (0.44 + r() * 0.08);
  // ceiling / floor / walls as a one-point perspective box
  const ceil = g.createLinearGradient(0, 0, 0, vy); ceil.addColorStop(0, '#e9e2bf'); ceil.addColorStop(1, '#b9ab6a');
  g.fillStyle = ceil; g.fillRect(0, 0, W, vy);
  const floor = g.createLinearGradient(0, vy, 0, H); floor.addColorStop(0, '#8f7a3a'); floor.addColorStop(1, '#6b5724');
  g.fillStyle = floor; g.fillRect(0, vy, W, H - vy);
  const wall = (x0, x1, shade) => {
    g.fillStyle = shade; g.beginPath(); g.moveTo(x0, 0); g.lineTo(vx + (x0 - vx) * 0.18, vy - (vy) * 0.18); g.lineTo(vx + (x0 - vx) * 0.18, vy + (H - vy) * 0.18); g.lineTo(x0, H); g.closePath(); g.fill();
    void x1;
  };
  wall(0, 0, '#cdb455'); wall(W, W, '#c2a94c');
  // back wall + doorway
  const bw = W * 0.18 * 1.0, bh = H * 0.18 * 1.0;
  g.fillStyle = '#d6bf62'; g.fillRect(vx - bw * 1.4, vy - bh * 0.9, bw * 2.8, bh * 1.9);
  g.fillStyle = '#6d5a22'; g.fillRect(vx - bw * 0.25 + (r() - 0.5) * bw, vy - bh * 0.5, bw * 0.45, bh * 1.35);
  // troffers receding
  for (let i = 0; i < 6; i++) {
    const k = 1 - i / 6.5, cx = vx + (W * 0.12) * k * (r() < 0.5 ? -1 : 1) * 0.3, cy = vy - vy * k * 0.9;
    g.fillStyle = `rgba(255,252,230,${0.95 - i * 0.1})`; g.fillRect(cx - 26 * k, cy - 5 * k, 52 * k, 10 * k);
  }
  // wallpaper stripes on the side walls
  g.strokeStyle = 'rgba(120,100,30,0.25)'; g.lineWidth = 1;
  for (let i = 1; i < 14; i++) { const x = (vx * i) / 14; g.beginPath(); g.moveTo(x, (x / vx) * vy * 0.18 + 0); g.lineTo(x, H - (x / vx) * (H - vy) * 0.18); g.stroke(); }
  // sometimes: a tall pale figure far away / a grin in the dark doorway
  const pick = r();
  if (pick < 0.4) { g.fillStyle = 'rgba(20,16,8,0.85)'; const fx = vx + (r() - 0.5) * bw * 1.8; g.fillRect(fx - 3, vy - bh * 0.55, 6, bh * 1.2); g.beginPath(); g.arc(fx, vy - bh * 0.62, 3.5, 0, Math.PI * 2); g.fill(); }
  else if (pick < 0.65) { g.fillStyle = '#fffbe0'; g.fillRect(vx - 7, vy - bh * 0.1, 3, 2); g.fillRect(vx + 4, vy - bh * 0.1, 3, 2); g.beginPath(); g.arc(vx, vy + bh * 0.05, 7, 0.1 * Math.PI, 0.9 * Math.PI); g.lineWidth = 2; g.strokeStyle = '#fffbe0'; g.stroke(); }
  // film grain + flash falloff
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.7; }
  g.putImageData(img, 0, 0);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(30,20,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

const CAPTIONS = ['level 0 - day ?', 'who took this', 'it was already here', "don't go back in", 'this is my house now', 'the hum stopped once', 'found it in my pocket', 'exit was here yesterday', '=)'];
/** Polaroid card (fallback for game.liminal.showPhoto). Closes after 6 s or on the next call. */
export function showPolaroidCard(seed, t = (s) => s) {
  document.querySelector('.br-polaroid')?.remove();
  const card = document.createElement('div');
  card.className = 'br-polaroid';
  card.style.cssText = 'position:fixed;left:50%;top:46%;transform:translate(-50%,-50%) rotate(-3deg);background:#f3efe4;padding:14px 14px 46px;box-shadow:0 18px 50px rgba(0,0,0,0.6);z-index:45;pointer-events:none;transition:opacity .5s, transform .5s;opacity:0';
  const c = document.createElement('canvas'); c.width = 280; c.height = 220;
  c.style.cssText = 'display:block;width:280px;height:220px;image-rendering:pixelated;filter:sepia(0.25) saturate(1.1)';
  drawLiminalPhoto(c, seed);
  const cap = document.createElement('div');
  cap.textContent = t(CAPTIONS[(seed >>> 3) % CAPTIONS.length]);
  cap.style.cssText = 'position:absolute;left:0;right:0;bottom:10px;text-align:center;font:italic 20px "Comic Sans MS","Segoe Print",cursive;color:#2a2a3a';
  card.appendChild(c); card.appendChild(cap);
  uiRoot().appendChild(card);
  requestAnimationFrame(() => { card.style.opacity = '1'; card.style.transform = 'translate(-50%,-50%) rotate(-2deg)'; });
  setTimeout(() => { card.style.opacity = '0'; setTimeout(() => card.remove(), 600); }, 6000);
  return card;
}

/** Screen-space marker (Level Key -> EXIT). Call update(camera) every frame; returns false when expired. */
export class WorldMarker {
  constructor(text, color = '#3dff85', life = 8) {
    this.el = document.createElement('div');
    this.el.style.cssText = `position:fixed;left:0;top:0;transform:translate(-50%,-100%);font:700 14px/1.2 monospace;color:${color};text-shadow:0 0 6px ${color},0 1px 0 #000;pointer-events:none;z-index:7;text-align:center;white-space:nowrap`;
    this.el.innerHTML = text;
    uiRoot().appendChild(this.el);
    this.life = life;
    this.v = new THREE.Vector3();
  }
  update(dt, camera, pos, label) {
    this.life -= dt;
    if (this.life <= 0) { this.dispose(); return false; }
    this.v.copy(pos).project(camera);
    const on = this.v.z < 1;
    const x = (this.v.x * 0.5 + 0.5) * innerWidth, y = (-this.v.y * 0.5 + 0.5) * innerHeight;
    const cx = Math.min(innerWidth - 40, Math.max(40, x)), cy = Math.min(innerHeight - 40, Math.max(40, y));
    this.el.style.left = (on ? cx : innerWidth - cx) + 'px';
    this.el.style.top = (on ? cy : innerHeight - cy) + 'px';
    if (label) this.el.innerHTML = label;
    this.el.style.opacity = String(Math.min(1, this.life));
    return true;
  }
  dispose() { this.el.remove(); }
}
