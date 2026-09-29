// Renderer + PSX pipeline: low-res render target, vertex snapping (global shader chunk patch),
// depth-based outlines, Bayer dithering + color quantization, screen effects.
import * as THREE from 'three';
import { flashGate } from './a11y_core.js';   // [a11y]
import { MIRROR_FS_DECL, MIRROR_FS_UV, MIRROR_FS_GRADE } from '../render/mirrorfx.js';   // [mirror] dimension post look (docs/wave2/mirror.md)

let psxPatched = false;
export function patchPSX(jitterLevel = 1) {
  if (psxPatched) return;
  psxPatched = true;
  const grid = jitterLevel === 0 ? null : jitterLevel === 2 ? [120.0, 90.0] : [200.0, 150.0];
  if (!grid) return;
  const snippet = `
#ifndef PSX_NOSNAP
{
  vec4 psxP = gl_Position;
  if (psxP.w > 0.0) {
    vec2 psxGrid = vec2(${grid[0].toFixed(1)}, ${grid[1].toFixed(1)});
    psxP.xy = floor((psxP.xy / psxP.w) * psxGrid + 0.5) / psxGrid * psxP.w;
    gl_Position = psxP;
  }
}
#endif
`;
  THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex + snippet;
}

const POST_VS = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// [mirror] postFS(true) is the dimension variant (own program: a shader problem there can never break the normal game); postFS(false) is the untouched base
const postFS = (MIR) => `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uLevels;
uniform float uDither;
uniform float uOutline;
uniform float uTime;
uniform vec4 uFlash;
uniform float uFade;
uniform float uNoise;
uniform float uBlind;
uniform float uVignette;
uniform float uGamma;
uniform float uHurt;
uniform float uWarp;
uniform float uSat;
uniform float uBloom;
uniform vec3 uHurtDir;   // xy = screen direction of the last hit (x right, y up), z = strength
uniform float uLowHp;    // 0..1 low-health heartbeat effect
uniform float uBeat;     // 0..1 heartbeat pulse (decays)
uniform vec4 uScan;      // xyz = scan origin in view space, w = wave radius (m)
uniform float uScanA;    // scan wave strength
uniform vec3 uScanCol;
uniform vec2 uProj;      // tan(fov/2) * aspect, tan(fov/2)
varying vec2 vUv;
${MIR ? MIRROR_FS_DECL : ''}   // [mirror]

float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  int i = ip.x + ip.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
float invDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  float ndc = z * 2.0 - 1.0;
  float lin = (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
  return 1.0 / lin;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec2 uv = vUv;
${MIR ? MIRROR_FS_UV : ''}   // [mirror]
  if (uWarp > 0.0) {
    uv += vec2(sin(uv.y * 9.0 + uTime * 2.1), cos(uv.x * 7.0 + uTime * 1.6)) * 0.006 * uWarp;
  }
  vec2 pix = floor(uv * uRes) + 0.5;
  vec2 suv = pix / uRes;
  vec3 col = texture2D(tColor, suv).rgb;

  // low health: heartbeat-synced blur + double vision
  if (uLowHp > 0.0) {
    vec2 px = 1.0 / uRes;
    float rad = (1.0 + 2.5 * uBeat) * uLowHp;
    vec3 bl = texture2D(tColor, suv + vec2(px.x, 0.0) * rad).rgb + texture2D(tColor, suv - vec2(px.x, 0.0) * rad).rgb
            + texture2D(tColor, suv + vec2(0.0, px.y) * rad).rgb + texture2D(tColor, suv - vec2(0.0, px.y) * rad).rgb;
    vec3 ghost = texture2D(tColor, suv + vec2(px.x * (2.0 + 5.0 * uBeat) * uLowHp, 0.0)).rgb;
    col = mix(col, bl * 0.25, 0.55 * uLowHp);
    col = mix(col, ghost, 0.22 * uBeat * uLowHp);
  }

  if (uOutline > 0.0) {
    vec2 px = 1.0 / uRes;
    float c0 = invDepth(suv);
    float c1 = invDepth(suv + vec2(px.x, 0.0));
    float c2 = invDepth(suv - vec2(px.x, 0.0));
    float c3 = invDepth(suv + vec2(0.0, px.y));
    float c4 = invDepth(suv - vec2(0.0, px.y));
    float lap = abs(c1 + c2 + c3 + c4 - 4.0 * c0) / max(c0, 1e-5);
    float edge = smoothstep(0.12, 0.45, lap);
    float dist = 1.0 / max(c0, 1e-5);
    edge *= 1.0 - smoothstep(18.0, 55.0, dist);
    col *= 1.0 - edge * 0.8 * uOutline;
  }

  // cheap bloom: gather bright neighbours at 2 radii
  {
    vec2 px = 1.0 / uRes;
    vec3 bl = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 d = vec2(cos(a), sin(a));
      vec3 s1 = texture2D(tColor, suv + d * px * 2.5).rgb;
      vec3 s2 = texture2D(tColor, suv + d * px * 6.0).rgb;
      bl += max(s1 - 0.8, 0.0) * 0.6 + max(s2 - 0.8, 0.0) * 0.4;
    }
    col += bl * 0.12 * uBloom;
  }
  col = toSRGB(col) * uGamma;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat * (1.0 - 0.55 * uLowHp));
${MIR ? MIRROR_FS_GRADE : ''}   // [mirror]

  // scan wave: a bright shell sweeping over every surface, concentric scanlines inside it
  if (uScanA > 0.0) {
    float zr = texture2D(tDepth, suv).x;
    if (zr < 0.99999) {
      float lin = 1.0 / max(invDepth(suv), 1e-5);
      vec3 vp = vec3((suv * 2.0 - 1.0) * uProj * lin, -lin);
      float d = length(vp - uScan.xyz);
      float behind = uScan.w - d;
      float edge = exp(-abs(behind) * 7.0) * step(-0.35, behind);
      float tail = behind > 0.0 ? exp(-behind * 0.28) : 0.0;
      float lines = smoothstep(0.78, 1.0, fract(d * 1.25 - uTime * 0.6));
      float s = edge * 1.1 + tail * (0.07 + 0.3 * lines);
      col += uScanCol * s * uScanA;
    }
  }

  // color depth reduction with ordered dithering (in low-res pixel space)
  float b = bayer4(pix) - 0.5;
  col += b * uDither / uLevels;
  col = floor(col * uLevels + 0.5) / uLevels;

  // grain / static
  float n = hash(pix + fract(uTime * 7.13) * 91.7);
  col += (n - 0.5) * 0.035;
  if (uNoise > 0.0) col = mix(col, vec3(n), uNoise);

  // vignette / visor edge
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.85, 0.28, length(q * vec2(1.0, 1.25)));
  col *= mix(1.0, vig, uVignette);

  if (uHurt > 0.0) {
    float hv = smoothstep(0.25, 0.75, length(q * vec2(1.0, 1.3)));
    col = mix(col, vec3(0.55, 0.0, 0.0), hv * uHurt);
  }
  // directional damage: the screen edge facing the attacker bleeds red
  if (uHurtDir.z > 0.0) {
    vec2 qd = q * vec2(1.0, 1.3);
    float side = max(0.0, dot(normalize(qd + 1e-5), uHurtDir.xy));
    float hv = smoothstep(0.16, 0.7, length(qd)) * side * side;
    col = mix(col, vec3(0.62, 0.02, 0.0), clamp(hv * uHurtDir.z, 0.0, 0.9));
  }
  // heartbeat: the vignette pulses dark red with every beat
  if (uLowHp > 0.0) {
    float pv = smoothstep(0.2, 0.8, length(q * vec2(1.0, 1.25)));
    col = mix(col, vec3(0.18, 0.0, 0.0), pv * uLowHp * (0.35 + 0.45 * uBeat));
  }
  if (uBlind > 0.0) {
    float bl = smoothstep(0.05, 0.6, length(q)) ;
    col = mix(col, vec3(0.02, 0.01, 0.0), clamp(uBlind * (0.6 + bl), 0.0, 1.0));
  }
  col = mix(col, uFlash.rgb, uFlash.a);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
const POST_FS = postFS(false), POST_FS_MIRROR = postFS(true);   // [mirror]

export class Engine {
  constructor(container, settings) {
    this.settings = settings;
    patchPSX(settings.vertexJitter ?? 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.info.autoReset = true;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov || 72, 16 / 9, 0.05, 420);
    this.scene.add(this.camera);

    this.rt = null;
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VS,
      fragmentShader: POST_FS,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null },
        uRes: { value: new THREE.Vector2(320, 240) },
        uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
        uLevels: { value: 28.0 }, uDither: { value: settings.dither ? 1.0 : 0.0 },
        uOutline: { value: settings.outlines ? 1.0 : 0.0 },
        uTime: { value: 0 }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
        uFade: { value: 0 }, uNoise: { value: 0 }, uBlind: { value: 0 },
        uVignette: { value: 0.55 }, uGamma: { value: 1.08 }, uHurt: { value: 0 }, uWarp: { value: 0 },
        uSat: { value: 1.0 }, uBloom: { value: 1.0 },
        uHurtDir: { value: new THREE.Vector3(0, 1, 0) }, uLowHp: { value: 0 }, uBeat: { value: 0 },
        uScan: { value: new THREE.Vector4(0, 0, 0, 0) }, uScanA: { value: 0 }, uScanCol: { value: new THREE.Color(0.35, 0.72, 1.0) },
        uProj: { value: new THREE.Vector2(1, 1) },
        uMir: { value: new THREE.Vector4(0, 0, 0, 5) },   // [mirror]
      },
      depthTest: false, depthWrite: false,
    });
    this.postMatMirror = new THREE.ShaderMaterial({ vertexShader: POST_VS, fragmentShader: POST_FS_MIRROR, uniforms: this.postMat.uniforms, depthTest: false, depthWrite: false });   // [mirror] shares the uniforms
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    this.postQuad = quad;   // [mirror]
    quad.frustumCulled = false;
    this.postScene.add(quad);

    // transient screen effects (decay each frame)
    this.fx = { flash: 0, flashColor: new THREE.Color(1, 1, 1), hurt: 0, fade: 0, noise: 0, blind: 0, warp: 0, shake: 0,
      // game-feel extras (see hurtFrom / punch / setScan): directional hurt, low-HP heartbeat, camera punch
      hurtDir: new THREE.Vector2(0, 1), hurtDirA: 0, lowHp: 0, beat: 0, punch: new THREE.Vector3() };
    this.scan = { origin: new THREE.Vector3(), radius: 0, alpha: 0 };
    this._scanV = new THREE.Vector3();
    this.fadeTarget = 0;
    this.time = 0;
    this.onResize = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings() {
    const s = this.settings;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.postMat.uniforms.uDither.value = s.dither ? 1.0 : 0.0;
    this.postMat.uniforms.uOutline.value = s.outlines ? 1.0 : 0.0;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, true);
    const H = Math.max(160, Math.min(this.overrideH || this.settings.renderHeight || 360, h));
    const W = Math.round(H * (w / h));
    if (this.rt) { this.rt.dispose(); this.rt.depthTexture?.dispose(); }
    const depth = new THREE.DepthTexture(W, H);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, depthTexture: depth, generateMipmaps: false,
      type: THREE.HalfFloatType,
    });
    this.postMat.uniforms.tColor.value = this.rt.texture;
    this.postMat.uniforms.tDepth.value = depth;
    this.postMat.uniforms.uRes.value.set(W, H);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lowW = W; this.lowH = H;
    for (const f of this.onResize) f(w, h);
  }

  setRenderHeightOverride(h) { this.overrideH = h || null; this.resize(); }

  flash(color = 0xffffff, amount = 0.8) {
    const gate = flashGate(!!this.settings.reduceFlash, amount, this.time, this._lastFlash ?? -9);   // [a11y] reduce flashing lights
    if (!gate.ok) return;
    if (gate.amount > 0) this._lastFlash = this.time;
    this.fx.flashColor.set(color);
    this.fx.flash = Math.max(this.fx.flash, gate.amount);
  }
  hurt(amount = 0.6) { this.fx.hurt = Math.min(1, this.fx.hurt + amount); this.fx.shake = Math.max(this.fx.shake, amount * 0.6 * (this.settings.shakeScale ?? 1)); }
  shake(a) { this.fx.shake = Math.max(this.fx.shake, a * (this.settings.shakeScale ?? 1)); }   // [a11y] shake intensity slider
  /** Red wash on the screen edge facing a hit. angle: 0 = in front (top edge), +PI/2 = right, PI = behind. */
  hurtFrom(angle, amount = 0.6) {
    this.fx.hurtDir.set(Math.sin(angle), Math.cos(angle));
    this.fx.hurtDirA = Math.min(1, Math.max(this.fx.hurtDirA * 0.5, 0) + amount);
  }
  /** Camera punch impulse in radians (pitch up +, yaw left +, roll); the local player springs it back. */
  punch(pitch = 0, yaw = 0, roll = 0) {
    const k = this.settings.reduceMotion ? 0.35 : 1;
    this.fx.punch.x += pitch * k; this.fx.punch.y += yaw * k; this.fx.punch.z += roll * k;
  }
  /** Low-health heartbeat: level 0..1 each frame, beat() on every heart thump. */
  setLowHealth(level) { this.fx.lowHp = Math.max(0, Math.min(1, level)); }
  beat(a = 1) { this.fx.beat = Math.max(this.fx.beat, a); }
  /** Scan wave (screen-space shell over every surface). origin = world position, radius in m, alpha 0..1. */
  setScan(origin, radius, alpha, color) {
    if (origin) this.scan.origin.copy(origin);
    this.scan.radius = radius; this.scan.alpha = alpha;
    if (color !== undefined) this.postMat.uniforms.uScanCol.value.set(color);
  }

  render(dt) {
    this.time += dt;
    const u = this.postMat.uniforms;
    const fx = this.fx;
    fx.flash = Math.max(0, fx.flash - dt * 1.6);
    fx.hurt = Math.max(0, fx.hurt - dt * 0.9);
    fx.shake = Math.max(0, fx.shake - dt * 2.5);
    fx.fade += (this.fadeTarget - fx.fade) * Math.min(1, dt * 4);
    u.uTime.value = this.time;
    u.uFlash.value.set(fx.flashColor.r, fx.flashColor.g, fx.flashColor.b, Math.min(1, fx.flash));
    u.uHurt.value = Math.min(0.85, fx.hurt);
    u.uFade.value = fx.fade;
    u.uNoise.value = fx.noise;
    u.uBlind.value = fx.blind;
    u.uWarp.value = fx.warp * (this.settings.reduceMotion ? 0.4 : 1);
    u.uNear.value = this.camera.near; u.uFar.value = this.camera.far;
    fx.hurtDirA = Math.max(0, fx.hurtDirA - dt * 1.3);
    fx.beat = Math.max(0, fx.beat - dt * 3.2);
    u.uHurtDir.value.set(fx.hurtDir.x, fx.hurtDir.y, Math.min(0.9, fx.hurtDirA));
    u.uLowHp.value = fx.lowHp * (this.settings.reduceMotion ? 0.5 : 1);
    u.uBeat.value = fx.beat;
    this.mirrorHook?.(u, dt);   // [mirror] set by render/mirrorfx.js installMirrorFx
    this.postQuad.material = u.uMir.value.x > 0.001 && !this.mirrorBroken ? this.postMatMirror : this.postMat;   // [mirror]

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    const ri = this.renderer.info.render;
    this.sceneStats = { calls: ri.calls, tris: ri.triangles };
    // scan origin → view space (camera matrices are current right after the scene render)
    if (this.scan.alpha > 0.001) {
      const cam = this.camera;
      this._scanV.copy(this.scan.origin).applyMatrix4(cam.matrixWorldInverse);
      u.uScan.value.set(this._scanV.x, this._scanV.y, this._scanV.z, this.scan.radius);
      const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      u.uProj.value.set(th * cam.aspect, th);
      u.uScanA.value = this.scan.alpha;
    } else u.uScanA.value = 0;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
