// Forged weapon glow (client side, every peer): the same item object is used in the world, in the first-person view model
// and in a remote player's hand, so ONE per-item effect covers all three.
//   +3  faint tier-coloured shell        +5  brighter aura + sparks
//   +7  animated glitch camo (material swap to a shared shader)      +9  full rainbow camo + spark trail + hum
// Cheap by design: one additive ellipsoid per glowing item, two shared shader programs, pooled particles. NO lights.
import * as THREE from 'three';
import { glowLevel } from '../game/enhance.js';
import { TIERS } from '../game/tiers.js';

const VS = `
varying vec3 vP; varying vec3 vN;
void main() { vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uStr; uniform float uRain;
varying vec3 vP; varying vec3 vN;
float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
vec3 hue(float x) { return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec3 q = vP * 30.0;
  float band = floor(q.y + q.x * 0.7 + uTime * 3.0);
  float g = step(0.8 - uStr * 0.25, h(band + floor(uTime * 9.0)));
  float w = 0.5 + 0.5 * sin((q.x + q.z) * 0.9 + uTime * 4.0 + q.y * 0.4);
  vec3 col = mix(uA, uB, w);
  col = mix(col, hue(fract(q.y * 0.05 + q.x * 0.03 + uTime * 0.35)) , uRain * (0.55 + 0.45 * w));
  col = mix(col, vec3(1.0), g * 0.85);
  float rim = pow(1.0 - abs(vN.z), 2.0);
  col += rim * uB * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`;

const SHELL_OPACITY = [0, 0.1, 0.17, 0.2, 0.26];
const _p = new THREE.Vector3();

export function installWeaponGlow(game) {
  const uTime = { value: 0 };
  const camoMats = new Map();       // "level:tier" -> ShaderMaterial (shared uTime)
  const active = new Map();         // item id -> fx
  const shellGeo = new THREE.SphereGeometry(0.5, 10, 8);
  let scanT = 0, time = 0, disposed = false;

  const tierOf = (it) => (it.rarity ? it.rarity() : 'common');
  const colorOf = (tier) => new THREE.Color((TIERS[tier] || TIERS.common).color);
  const camoFor = (level, tier) => {
    const k = level + ':' + tier;
    let m = camoMats.get(k);
    if (!m) {
      const a = colorOf(tier), b = a.clone().lerp(new THREE.Color(0xffffff), 0.55);
      m = new THREE.ShaderMaterial({ uniforms: { uTime, uA: { value: a }, uB: { value: b }, uStr: { value: level >= 4 ? 1 : 0.4 }, uRain: { value: level >= 4 ? 0.85 : 0 } }, vertexShader: VS, fragmentShader: FS });
      camoMats.set(k, m);
    }
    return m;
  };
  const shellFor = (tier) => new THREE.MeshBasicMaterial({ color: colorOf(tier), transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });

  function restoreMeshes(fx) {
    for (const e of fx.meshes) if (e.mesh.material === e.camo) e.mesh.material = e.orig;
    fx.meshes.length = 0;
  }
  function detach(id, fx) {
    restoreMeshes(fx);
    if (fx.shell) { fx.shell.removeFromParent(); fx.shell.material.dispose(); }
    active.delete(id);
  }
  function attach(it, level, tier) {
    const fx = { level, tier, plus: it.plus, meshes: [], shell: null, sparkT: Math.random() * 0.3, trailT: 0, humT: 0, last: null };
    const inner = it.obj?.userData?.inner;
    if (!inner) return null;
    // faint / aura shell
    const size = it.obj.userData.size || new THREE.Vector3(0.2, 0.2, 0.2);
    fx.shell = new THREE.Mesh(shellGeo, shellFor(tier));
    fx.shell.scale.set(Math.max(0.12, size.x * 1.25), Math.max(0.12, size.y * 1.25), Math.max(0.12, size.z * 1.25));
    fx.shell.renderOrder = 3;
    it.obj.add(fx.shell);
    // camo (+7 / +9): swap every mesh material for the shared shader
    if (level >= 3) {
      const camo = camoFor(level, tier);
      inner.traverse((o) => { if (o.isMesh && o !== fx.shell) { fx.meshes.push({ mesh: o, orig: o.material, camo }); o.material = camo; } });
    }
    active.set(it.id, fx);
    return fx;
  }

  function sync(it) {
    const level = glowLevel(it.plus || 0);
    const cur = active.get(it.id);
    if (!level) { if (cur) detach(it.id, cur); return; }
    const tier = tierOf(it);
    if (cur && cur.level === level && cur.tier === tier && cur.shell?.parent === it.obj) return;
    if (cur) detach(it.id, cur);
    attach(it, level, tier);
  }

  const api = {
    update(dt) {
      if (disposed) return;
      time += dt; uTime.value = time;
      scanT -= dt;
      const items = game.items;
      if (!items) return;
      if (scanT <= 0) {
        scanT = 0.3;
        for (const it of items.all()) if (it.plus >= 3 || active.has(it.id)) sync(it);
        for (const [id, fx] of active) if (!items.get(id)) detach(id, fx);
      }
      const cam = game.camera?.position;
      for (const [id, fx] of active) {
        const it = items.get(id);
        if (!it || !fx.shell) continue;
        const vis = it.obj.visible && !!it.obj.parent;
        fx.shell.visible = vis;
        if (!vis) { fx.last = null; continue; }
        fx.shell.material.opacity = (SHELL_OPACITY[fx.level] || 0.1) * (0.75 + 0.25 * Math.sin(time * (2.5 + fx.level) + it.obj.id));
        if (!game.particles || fx.level < 2) continue;
        it.obj.getWorldPosition(_p);
        if (cam && _p.distanceToSquared(cam) > 900) { fx.last = null; continue; }
        const col = (TIERS[fx.tier] || TIERS.common).hex;
        fx.sparkT -= dt;
        if (fx.sparkT <= 0) {
          fx.sparkT = fx.level >= 4 ? 0.12 : 0.3 + Math.random() * 0.2;
          game.particles.burst(_p, { count: fx.level >= 3 ? 2 : 1, color: fx.level >= 4 ? [0xff4dd8, 0x4dffea, 0xfff04d, col] : [col, 0xffffff], speed: 0.7, up: 1.3, life: 0.5, size: 0.045, gravity: -0.4, drag: 2 });
        }
        if (fx.level >= 4) {
          // trail: only while the weapon actually moves (swing / sprint / carried around)
          if (fx.last) {
            const moved = _p.distanceTo(fx.last) / Math.max(dt, 1e-3);
            fx.trailT -= dt;
            if (moved > 1.2 && fx.trailT <= 0) { fx.trailT = 0.035; game.particles.burst(_p, { count: 2, color: [0xff4dd8, 0x4dffea, 0xfff04d], speed: 0.15, up: 0.1, life: 0.45, size: 0.06, gravity: 0, drag: 4 }); }
          }
          fx.last = (fx.last || new THREE.Vector3()).copy(_p);
          // hum: the local player's own +9 weapon shimmers now and then
          if (it.holder === game.selfId) { fx.humT -= dt; if (fx.humT <= 0) { fx.humT = 3.6; game.audio?.play?.('spark', { volume: 0.12, pitch: 0.6 + Math.random() * 0.15, bus: 'sfx' }); } }
        }
      }
    },
    active: () => active.size,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [id, fx] of [...active]) detach(id, fx);
      shellGeo.dispose();
      for (const m of camoMats.values()) m.dispose();
    },
  };
  return api;
}
