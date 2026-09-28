// MIRROR DIMENSION render layer.
//  1) the post-process look (GLSL snippets spliced into core/engine.js POST_FS): horizontal screen flip, dark palette,
//     red-purple depth fog, thick bright outlines, ASCII glyph-block quantisation, overtime glitch. All uniform driven (uMir).
//  2) installMirrorFx(engine): eases the uniform in / out (engine.mirrorHook is called by Engine.render).
//  3) MirrorVisuals: cheap instanced renderers for crystals, bolts, orbiting shards, fire trails, burst rings and the fire aura.
import * as THREE from 'three';

// ------------------------------------------------------------------------------------------------ GLSL
/** uniform + glyph function; spliced right after `varying vec2 vUv;` */
export const MIRROR_FS_DECL = `
uniform vec4 uMir;   // x = dimension amount (flip at > 0.5), y = glitch 0..1 (overtime), z = spare, w = glyph cell width in low-res px
float mirGlyph(float lv, vec2 c) {
  if (lv < 0.5) return 0.0;
  float m;
  if (lv < 1.5) m = step(abs(c.x - 0.5), 0.2) * step(abs(c.y - 0.78), 0.12);
  else if (lv < 2.5) m = step(abs(c.x - 0.5), 0.2) * (step(abs(c.y - 0.3), 0.11) + step(abs(c.y - 0.72), 0.11));
  else if (lv < 3.5) m = max(step(abs(c.y - 0.5), 0.1) * step(abs(c.x - 0.5), 0.38), step(abs(c.x - 0.5), 0.13) * step(abs(c.y - 0.5), 0.36));
  else if (lv < 4.5) m = max(step(abs(c.x - 0.3), 0.11) + step(abs(c.x - 0.7), 0.11), step(abs(c.y - 0.3), 0.1) + step(abs(c.y - 0.7), 0.1)) * step(abs(c.x - 0.5), 0.44) * step(abs(c.y - 0.5), 0.44);
  else m = step(abs(c.x - 0.5), 0.44) * step(abs(c.y - 0.5), 0.46);
  return clamp(m, 0.0, 1.0);
}
`;
/** inside main(), right after `vec2 uv = vUv;` */
export const MIRROR_FS_UV = `
  if (uMir.x > 0.5) uv.x = 1.0 - uv.x;
  if (uMir.y > 0.0) {
    float mrow = floor(uv.y * 36.0);
    if (hash(vec2(mrow, floor(uTime * 9.0))) < uMir.y * 0.22) uv.x += (hash(vec2(mrow, 11.0)) - 0.5) * 0.09 * uMir.y;
  }
`;
/** inside main(), after the sRGB / saturation grade (col is display-referred here) */
export const MIRROR_FS_GRADE = `
  if (uMir.x > 0.001) {
    float mA = clamp(uMir.x, 0.0, 1.0);
    float lum0 = dot(col, vec3(0.299, 0.587, 0.114));
    float zc = 1.0 / max(invDepth(suv), 1e-5);
    // dark palette: black-violet -> plum -> silver, keeping a hint of the original hue
    vec3 ramp = mix(vec3(0.015, 0.0, 0.04), vec3(0.32, 0.05, 0.30), smoothstep(0.02, 0.5, lum0));
    ramp = mix(ramp, vec3(0.82, 0.78, 0.98), smoothstep(0.62, 1.0, lum0));
    vec3 dk = mix(ramp, col * vec3(0.75, 0.42, 0.95), 0.22);
    // red-purple depth fog (sky = far plane = fully fogged)
    float fogAmt = 1.0 - exp(-zc * 0.05);
    vec3 fogC = mix(vec3(0.34, 0.02, 0.14), vec3(0.17, 0.02, 0.30), 0.5 + 0.5 * sin(uTime * 0.35 + zc * 0.03));
    dk = mix(dk, fogC, clamp(fogAmt, 0.0, 0.94));
    // thick bright outlines everywhere (2 px depth laplacian, low threshold)
    {
      vec2 px2 = 2.0 / uRes;
      float c0 = invDepth(suv);
      float lap = abs(invDepth(suv + vec2(px2.x, 0.0)) + invDepth(suv - vec2(px2.x, 0.0)) + invDepth(suv + vec2(0.0, px2.y)) + invDepth(suv - vec2(0.0, px2.y)) - 4.0 * c0) / max(c0, 1e-5);
      float edge = smoothstep(0.045, 0.2, lap) * (1.0 - smoothstep(35.0, 100.0, zc));
      dk = mix(dk, vec3(0.78, 0.72, 1.0), clamp(edge, 0.0, 1.0) * 0.92);
    }
    // ASCII: one texture read per glyph cell, procedural glyph picked by cell luminance
    {
      vec2 cell = vec2(uMir.w, floor(uMir.w * 1.6 + 0.5));
      vec2 cid = floor(pix / cell);
      vec2 cuv = fract(pix / cell);
      float glt = uMir.y;
      vec2 cc = (cid + 0.5) * cell / uRes;
      if (glt > 0.0 && hash(vec2(cid.y, floor(uTime * 7.0))) < glt * 0.22) cc.x += (hash(vec2(cid.y, 5.0)) - 0.5) * 0.06 * glt;
      vec3 cs = texture2D(tColor, cc).rgb;
      float cl = sqrt(clamp(dot(cs, vec3(0.299, 0.587, 0.114)), 0.0, 1.0));
      cl = clamp(cl * 1.5 + (bayer4(cid) - 0.5) * 0.25, 0.0, 1.0);
      float lv = floor(cl * 5.0 + 0.5);
      if (glt > 0.0 && hash(cid + floor(uTime * 9.0)) < glt * 0.18) lv = floor(hash(cid + 7.0) * 6.0);
      float gm = mirGlyph(lv, cuv);
      vec3 gcol = mix(fogC * 2.2 + 0.06, vec3(0.9, 0.82, 1.0), cl);
      gcol = mix(gcol, normalize(cs + 0.05) * (0.5 + cl), 0.35);
      vec3 asc = mix(dk * 0.7, gcol, gm * 0.9);
      dk = mix(dk, asc, 0.65);
    }
    col = mix(col, dk, mA);
  }
`;

// ------------------------------------------------------------------------------------------------ engine hook
/** Eases the dimension look in / out. set(true) flips the screen (amount passes 0.5 after ~0.15 s). glitch 0..1 = overtime. */
export function installMirrorFx(engine) {
  const st = { target: 0, amount: 0, glitch: 0, glitchTarget: 0 };
  // the dimension look is its own shader program: if it ever fails to compile the engine keeps the normal post pass (no flip, no ascii)
  const dbg = engine.renderer?.debug, prevErr = dbg?.onShaderError;
  if (dbg) {
    dbg.onShaderError = (gl, program, vs, fs) => {
      try { if (gl.getShaderSource(fs)?.includes('mirGlyph')) { engine.mirrorBroken = true; console.warn('[mirror] dimension post shader failed to compile: look disabled'); } } catch { /* best effort */ }
      prevErr?.(gl, program, vs, fs);
    };
  }
  engine.mirrorHook = (u, dt) => {
    st.amount += (st.target - st.amount) * Math.min(1, dt * 6);
    if (Math.abs(st.target - st.amount) < 0.004) st.amount = st.target;
    st.glitch += (st.glitchTarget - st.glitch) * Math.min(1, dt * 3);
    u.uMir.value.set(st.amount, st.glitch, 0, 5);
    if (st.amount > 0.5) u.uHurtDir.value.x = -u.uHurtDir.value.x;   // the picture is mirrored, so is the damage direction
  };
  return {
    set(on, glitch = 0) { st.target = on ? 1 : 0; st.glitchTarget = on ? glitch : 0; },
    snap(on) { st.target = st.amount = on ? 1 : 0; },
    get amount() { return st.amount; },
    get broken() { return !!engine.mirrorBroken; },
    dispose() { engine.mirrorHook = null; if (dbg) dbg.onShaderError = prevErr; try { engine.postMat.uniforms.uMir.value.set(0, 0, 0, 5); } catch { /* engine gone */ } },
  };
}

// ------------------------------------------------------------------------------------------------ instanced visuals
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();
const additive = (color = 0xffffff) => new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

function inst(geo, mat, cap, colors = true) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.frustumCulled = false; m.count = 0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
  m.renderOrder = 4;
  return m;
}

export class MirrorVisuals {
  constructor(scene) {
    this.scene = scene;
    this.geos = [new THREE.OctahedronGeometry(0.16, 0).scale(1, 1.6, 1), new THREE.BoxGeometry(0.07, 0.07, 0.55), new THREE.OctahedronGeometry(0.2, 0).scale(0.45, 1.6, 0.25),
      new THREE.CircleGeometry(0.85, 10).rotateX(-Math.PI / 2), new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2), new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2)];
    this.mats = [additive(), additive(), additive(), additive(), additive(), additive(0xff7a1a)];
    this.cry = inst(this.geos[0], this.mats[0], 160);
    this.bolt = inst(this.geos[1], this.mats[1], 40);
    this.shard = inst(this.geos[2], this.mats[2], 10);
    this.fire = inst(this.geos[3], this.mats[3], 56);
    this.ring = inst(this.geos[4], this.mats[4], 12);
    this.auraFill = new THREE.Mesh(this.geos[5], this.mats[5]);
    this.auraFill.visible = false; this.auraFill.renderOrder = 3; this.auraFill.frustumCulled = false;
    this.mats[5].opacity = 0.16;
    this.all = [this.cry, this.bolt, this.shard, this.fire, this.ring, this.auraFill];
    for (const o of this.all) scene.add(o);
  }
  /** arr items: { x, y, z, gold?, t } */
  drawCrystals(arr, time) {
    let n = 0;
    for (const c of arr) {
      if (n >= 160) break;
      _q.setFromEuler(_e.set(0, time * 2 + c.t, 0));
      _m.compose(_p.set(c.x, c.y + 0.35 + Math.sin(time * 3 + c.t) * 0.08, c.z), _q, _s.setScalar(c.gold ? 1.5 : 1));
      this.cry.setMatrixAt(n, _m); this.cry.setColorAt(n, c.gold ? _c.set(1.0, 0.82, 0.3) : _c.set(0.35, 1.0, 0.95));
      n++;
    }
    this.cry.count = n; this.cry.instanceMatrix.needsUpdate = true; if (this.cry.instanceColor) this.cry.instanceColor.needsUpdate = true;
  }
  /** items: { x, y, z, dx, dy, dz } */
  drawBolts(arr) {
    let n = 0;
    for (const b of arr) {
      if (n >= 40) break;
      _q.setFromUnitVectors(Z, _d.set(b.dx, b.dy, b.dz).normalize());
      _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(1, 1, 1));
      this.bolt.setMatrixAt(n, _m); this.bolt.setColorAt(n, _c.set(1, 0.85, 0.35));
      n++;
    }
    this.bolt.count = n; this.bolt.instanceMatrix.needsUpdate = true; if (this.bolt.instanceColor) this.bolt.instanceColor.needsUpdate = true;
  }
  /** items: { x, y, z, a } */
  drawShards(arr) {
    let n = 0;
    for (const s of arr) {
      if (n >= 10) break;
      _q.setFromEuler(_e.set(0.3, s.a * 2 + 1.2, 0.5));
      _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(1, 1, 1));
      this.shard.setMatrixAt(n, _m); this.shard.setColorAt(n, _c.set(0.82, 0.74, 1.0));
      n++;
    }
    this.shard.count = n; this.shard.instanceMatrix.needsUpdate = true; if (this.shard.instanceColor) this.shard.instanceColor.needsUpdate = true;
  }
  /** items: { x, y, z, f } f = remaining life fraction 0..1 */
  drawFire(arr, time) {
    let n = 0;
    for (const f of arr) {
      if (n >= 56) break;
      const k = Math.min(1, f.f * 2.2), fl = 0.85 + 0.15 * Math.sin(time * 12 + f.x * 3.1);
      _m.compose(_p.set(f.x, f.y + 0.05, f.z), _q.identity(), _s.set(fl, 1, fl));
      this.fire.setMatrixAt(n, _m); this.fire.setColorAt(n, _c.set(1.0, 0.36 + 0.3 * f.f, 0.06).multiplyScalar(k * 0.9));
      n++;
    }
    this.fire.count = n; this.fire.instanceMatrix.needsUpdate = true; if (this.fire.instanceColor) this.fire.instanceColor.needsUpdate = true;
  }
  /** items: { x, y, z, r, f (life fraction), color } */
  drawRings(arr) {
    let n = 0;
    for (const r of arr) {
      if (n >= 12) break;
      const rad = r.r * (1 - r.f * r.f);
      _m.compose(_p.set(r.x, r.y + 0.08, r.z), _q.identity(), _s.set(Math.max(0.05, rad), 1, Math.max(0.05, rad)));
      this.ring.setMatrixAt(n, _m); this.ring.setColorAt(n, _c.set(r.color || 0xff8a2a).multiplyScalar(Math.min(1, r.f * 1.6)));
      n++;
    }
    this.ring.count = n; this.ring.instanceMatrix.needsUpdate = true; if (this.ring.instanceColor) this.ring.instanceColor.needsUpdate = true;
  }
  setAura(x, y, z, r) {
    const a = this.auraFill;
    a.visible = r > 0;
    if (r > 0) { a.position.set(x, y + 0.07, z); a.scale.set(r, 1, r); }
  }
  clear() { for (const m of [this.cry, this.bolt, this.shard, this.fire, this.ring]) m.count = 0; this.auraFill.visible = false; }
  dispose() {
    for (const o of this.all) { o.removeFromParent(); o.dispose?.(); }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
