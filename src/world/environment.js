// Sky dome, fog, sun/hemisphere lighting by time of day, weather (rain, storm lightning, fog, eclipse),
// space backdrop for orbit (stars + planet).
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { QUALITY } from '../render/quality.js';
const _white = new THREE.Color(0xffffff);   // [perf2]

function skyDome() {
  const geo = new THREE.SphereGeometry(380, 16, 10);
  const col = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) col.push(1, 1, 1);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  mat.defines = { PSX_NOSNAP: '' };
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function starField(n = 1400) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
    const r = 340;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(t); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(t);
    const c = 0.6 + Math.random() * 0.4;
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c * (0.9 + Math.random() * 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}

// Ambient biome particles (generated-sector biomes, BIOMES[..].fx). Visual only: Math.random is fine here.
//   glitch  neon pixels that hover and jump around      ash     grey flakes falling + orange embers rising
//   spores  slow drifting marsh motes                   sparkle crystal glints that twinkle
const BIOME_FX = {
  glitch: { n: 420, size: 0.22, colors: [0x2af4ff, 0xff2ad8, 0xfff04a], opacity: 0.9, additive: true },
  ash: { n: 900, size: 0.13, colors: [0x8a8480, 0x6a6460, 0x9a948c, 0xff7a30], opacity: 0.85, additive: false },
  spores: { n: 500, size: 0.12, colors: [0xc8e8b0, 0xa0d0c0], opacity: 0.55, additive: true },
  sparkle: { n: 500, size: 0.16, colors: [0xe0c8ff, 0x9ae8ff, 0xffb0e8], opacity: 1, additive: true },
};
const FX_BOX = 64, FX_H = 26;

export class Environment {
  constructor(engine, lightPool, audio) {
    this.engine = engine; this.scene = engine.scene; this.lights = lightPool; this.audio = audio;
    this.sky = skyDome();
    this.scene.add(this.sky);
    this.stars = starField();
    this.scene.add(this.stars);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.02);
    this.scene.background = new THREE.Color(0x000000);
    this.mode = 'space';       // space | moon | company
    this.biome = null;
    this.weather = 'clear';
    this.timeMin = 8 * 60;
    this.indoor = false;
    this.planet = null;
    this.rain = null;
    this.lightningT = 5;
    this.lightningFlash = 0;
    this.sunDir = new THREE.Vector3();
    this.eclipse = false;
    this.landingT = 1;         // 0 = still in space, 1 = on ground (for sky blend during landing)
    this.fx = null;            // biome ambient particles (BIOME_FX)
    this.glitchT = 0; this.glitchNext = 5;
    this.setSpace();
  }

  setSkyColors(top, horizon, bottom) {
    const g = this.sky.geometry;
    const pos = g.attributes.position, col = g.attributes.color;
    const t = new THREE.Color(top), h = new THREE.Color(horizon), b = new THREE.Color(bottom);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 380;
      if (y > 0) c.copy(h).lerp(t, Math.pow(y, 0.6)); else c.copy(h).lerp(b, Math.min(1, -y * 3));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  setSpace(planetColor = 0x44664f) {
    this.mode = 'space';
    this.stars.visible = true;
    this.setSkyColors(0x000000, 0x020308, 0x000000);
    this.scene.fog.density = 0.0;
    this.scene.fog.color.set(0x000000);
    this.scene.background.set(0x000000);
    if (!this.planet) {
      const g = new THREE.SphereGeometry(160, 24, 16);
      this.planetMat = new THREE.MeshLambertMaterial({ color: planetColor, fog: false });
      this.planet = new THREE.Mesh(g, this.planetMat);
      this.planet.position.set(-60, -230, -40);
      this.scene.add(this.planet);
    }
    this.planetMat.color.set(planetColor);
    this.planet.visible = true;
    this.lights.sun.intensity = 1.4; this.lights.sun.color.set(0xfff4e0);
    this.lights.sun.position.set(80, 60, -40);
    this.lights.hemi.intensity = 0.15;
    this.lights.hemi.color.set(0x445566); this.lights.hemi.groundColor.set(0x111111);
    this.stopWeather();
  }

  setMoon(biome, weather, mode = 'moon') {
    this.mode = mode;
    this.biome = biome;
    this.fogCap = null;        // [pacing] max clear-weather fog density (game.js sets it from the ship->entrance distance)
    this.weather = weather;
    this.eclipse = weather === 'eclipsed';
    this.stars.visible = false;
    if (this.planet) this.planet.visible = false;
    this.startWeather(weather);
    this.startBiomeFx(biome?.fx);
  }

  startBiomeFx(kind) {
    this.stopBiomeFx();
    const def = BIOME_FX[kind];
    if (!def) return;
    const n = def.n;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), base = new Float32Array(n * 3), vel = new Float32Array(n * 3), ph = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * FX_BOX; pos[i * 3 + 1] = Math.random() * FX_H; pos[i * 3 + 2] = (Math.random() - 0.5) * FX_BOX;
      let ci = Math.floor(Math.random() * def.colors.length);
      if (kind === 'ash') ci = Math.random() < 0.16 ? 3 : Math.floor(Math.random() * 3);   // ~16% embers
      c.set(def.colors[ci]);
      base.set([c.r, c.g, c.b], i * 3); col.set([c.r, c.g, c.b], i * 3);
      ph[i] = Math.random() * Math.PI * 2;
      if (kind === 'ash') { const ember = ci === 3; vel.set([(Math.random() - 0.5) * 0.6, ember ? 0.9 + Math.random() * 1.2 : -(0.5 + Math.random() * 0.7), (Math.random() - 0.5) * 0.6], i * 3); }
      else if (kind === 'spores') vel.set([(Math.random() - 0.5) * 0.35, (Math.random() - 0.3) * 0.12, (Math.random() - 0.5) * 0.35], i * 3);
      else if (kind === 'glitch') vel.set([0, (Math.random() - 0.5) * 0.3, 0], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: def.size, vertexColors: true, transparent: true, opacity: def.opacity, depthWrite: false, fog: true,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.fx = { kind, pts, base, vel, ph, t: 0 };
  }
  stopBiomeFx() {
    if (!this.fx) return;
    this.scene.remove(this.fx.pts);
    this.fx.pts.geometry.dispose();
    this.fx.pts.material.dispose();
    this.fx = null;
  }
  updateBiomeFx(dt, camPos) {
    const F = this.fx;
    if (!F) return;
    F.pts.visible = !this.indoor && this.mode !== 'space';
    if (!F.pts.visible) return;
    F.t += dt;
    F.pts.position.set(camPos.x, camPos.y - FX_H * 0.35, camPos.z);
    const pa = F.pts.geometry.attributes.position, ca = F.pts.geometry.attributes.color;
    const P = pa.array, Cc = ca.array, V = F.vel, half = FX_BOX / 2;
    // particles live in camera-relative space: wrap them around the box as the camera moves
    const mx = camPos.x - (F.lastX ?? camPos.x), mz = camPos.z - (F.lastZ ?? camPos.z);
    F.lastX = camPos.x; F.lastZ = camPos.z;
    const n = F.ph.length;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      P[k] += V[k] * dt - mx; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt - mz;
      if (F.kind === 'ash' || F.kind === 'spores') { P[k] += Math.sin(F.t * 0.7 + F.ph[i]) * dt * 0.4; P[k + 2] += Math.cos(F.t * 0.6 + F.ph[i]) * dt * 0.4; }
      if (F.kind === 'glitch' && Math.random() < dt * 0.25) { P[k] += (Math.random() - 0.5) * 4; P[k + 1] += (Math.random() - 0.5) * 2; }
      if (P[k] > half) P[k] -= FX_BOX; else if (P[k] < -half) P[k] += FX_BOX;
      if (P[k + 2] > half) P[k + 2] -= FX_BOX; else if (P[k + 2] < -half) P[k + 2] += FX_BOX;
      if (P[k + 1] > FX_H) P[k + 1] -= FX_H; else if (P[k + 1] < 0) P[k + 1] += FX_H;
    }
    pa.needsUpdate = true;
    if (F.kind === 'sparkle' || F.kind === 'glitch') {
      const sp = F.kind === 'sparkle' ? 2.6 : 7;
      for (let i = 0; i < n; i++) {
        const tw = Math.max(0, Math.sin(F.t * sp + F.ph[i] * 3.1));
        const f = F.kind === 'sparkle' ? tw * tw * tw : (tw > 0.2 ? 1 : 0.15);
        Cc[i * 3] = F.base[i * 3] * f; Cc[i * 3 + 1] = F.base[i * 3 + 1] * f; Cc[i * 3 + 2] = F.base[i * 3 + 2] * f;
      }
      ca.needsUpdate = true;
    }
  }

  startWeather(w) {
    this.stopWeather();
    if (w === 'rainy' || w === 'stormy') {
      const n = 2200;
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60;
        pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.LineBasicMaterial({ color: 0x9fb0c0, transparent: true, opacity: 0.45, fog: true });
      this.rain = new THREE.LineSegments(g, m);
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
      this.audio?.setAmbience('weather', 'rain', w === 'stormy' ? 0.55 : 0.4);
    } else this.audio?.setAmbience('weather', null);
    if (w === 'stormy' || w === 'foggy' || w === 'clear' || w === 'eclipsed' || w === 'rainy') this.audio?.setAmbience('wind', 'wind', w === 'stormy' ? 0.5 : 0.25);
  }
  stopWeather() {
    this.stopBiomeFx();
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
    this.audio?.setAmbience('weather', null);
    this.audio?.setAmbience('wind', null);
  }

  // day progress 0..1 from 8:00 to 24:00
  update(dt, camPos, opts = {}) {
    const L = this.lights;
    if (this.rain) {
      this.rain.position.set(camPos.x, camPos.y - 8, camPos.z);
      const p = this.rain.geometry.attributes.position;
      const arr = p.array;
      const fall = dt * 22;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= fall; arr[i + 4] -= fall;
        if (arr[i + 1] < 0) { arr[i + 1] += 30; arr[i + 4] += 30; }
      }
      p.needsUpdate = true;
      this.rain.visible = !this.indoor;
    }
    if (this.mode === 'space') {
      if (this.planet) this.planet.rotation.y += dt * 0.01;
      return;
    }
    this.updateBiomeFx(dt, camPos);
    const b = this.biome || {};
    const t = clamp((this.timeMin - 8 * 60) / (16 * 60), 0, 1);  // 0 morning .. 1 midnight
    // sun path
    const sunAng = lerp(0.35, Math.PI - 0.05, clamp(t * 1.25, 0, 1));
    this.sunDir.set(Math.cos(sunAng) * 0.8, Math.sin(sunAng), 0.35).normalize();
    const dayF = clamp(Math.sin(sunAng) * 1.6, 0, 1) * (1 - clamp((t - 0.62) / 0.2, 0, 1)) * (1 - (b.minNight || 0));   // [expeditions] a moon that is always night (Rooftop Blackout City)
    const duskF = clamp(1 - Math.abs(t - 0.62) / 0.12, 0, 1);
    let night = 1 - dayF;
    if (this.eclipse) night = Math.max(night, 0.75);
    // [qa] soul palettes follow the clock: morning is mostly neutral daylight (45 % palette), the palette is strongest at dusk (t = 0.62), and the night never
    // goes fully black (darkness capped, night colour lifted) so e.g. 404 stays readable
    const pal = b.palBlend ? 1 : 0, pw = pal ? 0.45 + 0.55 * clamp(t / 0.62, 0, 1) : 1;
    const blendC = (c, neutral) => (pal ? new THREE.Color(neutral).lerp(new THREE.Color(c), pw) : new THREE.Color(c));
    if (pal && !this.eclipse) night = Math.min(night, 0.82);
    const skyC = blendC(b.sky ?? 0x6f8a99, 0x8fa4ae);
    const nightC = new THREE.Color(this.eclipse ? 0x1a0707 : (b.night ?? 0x05070c));
    if (pal && !this.eclipse) nightC.lerp(new THREE.Color(0x1a1620), 0.4);
    const duskC = new THREE.Color(b.dusk ?? 0x8a4a30);   // [soul] per-moon dusk colour
    const horizon = skyC.clone().lerp(duskC, duskF * (pal ? 0.75 : 0.6)).lerp(nightC, night);
    const top = horizon.clone().multiplyScalar(0.7);
    let fogC = blendC(b.fog ?? 0x7d8f95, 0x9aa8ac).lerp(duskC, duskF * 0.4).lerp(nightC, night * 0.95);
    let fogD = Math.min(b.fogDensity ?? 0.015, this.fogCap ?? 1) * (this.weather === 'foggy' ? 2.6 : this.weather === 'rainy' ? 1.4 : this.weather === 'stormy' ? 1.6 : 1);
    fogD *= 1 + night * 0.4;
    // corrupted biomes: short sky/fog glitch flashes (visual only)
    if (b.glitch && !this.indoor) {
      this.glitchNext -= dt;
      if (this.glitchNext <= 0) { this.glitchNext = 4 + Math.random() * 9; this.glitchT = 0.12 + Math.random() * 0.15; this.frameSky = 0; }
      if (this.glitchT > 0) {
        this.glitchT -= dt;
        const gc = new THREE.Color(Math.random() < 0.5 ? 0xff2ad8 : 0x2af4ff);
        horizon.lerp(gc, 0.55); fogC.lerp(gc, 0.35); fogD *= 0.6;
        if (this.glitchT <= 0) this.frameSky = 0;
      }
    }
    if (this.indoor) { const af = this.interiorFog; fogC = new THREE.Color(af?.fog ?? 0x000000); fogD = af?.density ?? 0.075; }
    // landing blend from space
    const lt = this.landingT;
    if (lt < 1) {
      horizon.lerp(new THREE.Color(0x020308), 1 - lt);
      top.lerp(new THREE.Color(0x000000), 1 - lt);
      fogD *= lt;
      this.stars.visible = lt < 0.7;
    }
    this.frameSky = this.frameSky || 0;
    if ((this.frameSky++ % 10) === 0) this.setSkyColors(top, horizon, fogC);
    this.scene.fog.color.copy(fogC);
    this.scene.fog.density = fogD * (this.indoor ? 1 : QUALITY.fogMul);   // [perf2]
    this.scene.background.copy(fogC);
    this.sky.visible = !this.indoor;
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);

    // lightning
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3);
    if (this.weather === 'stormy' && !this.indoor) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 6 + Math.random() * 14;
        this.lightningFlash = 1;
        opts.onLightning?.();
      }
    }
    const lf = this.lightningFlash;
    L.sun.position.copy(this.sunDir).multiplyScalar(100).add(camPos);
    L.sun.target.position.copy(camPos);
    const sunCol = blendC(b.sun ?? 0xfff1d6, 0xfff1d6).lerp(new THREE.Color(0xff8a50), duskF * 0.6);
    if (this.eclipse) sunCol.set(0xff4a3a);
    L.sun.color.copy(sunCol);
    const overcast = this.weather === 'clear' ? 1 : this.weather === 'foggy' ? 0.6 : 0.55;
    L.sun.intensity = this.indoor ? 0 : (dayF * 1.7 * overcast + night * 0.06 + lf * 3);
    L.hemi.intensity = this.indoor ? 0.02 : (Math.max(0.15 + dayF * 0.7 * overcast + lf * 1.5, pal ? 0.24 : 0)) * (this.eclipse ? 0.5 : 1);
    if (this.indoor) {   // [qa] readable-dim interiors: a low neutral baseline (tinted by the theme haze) so room shapes read without a torch; the fog still eats the far corners
      const af = this.interiorFog;
      L.hemi.color.set(af?.fog ?? 0x000000).lerp(_white, 0.62); L.hemi.groundColor.set(af?.fog ?? 0x000000).lerp(_white, 0.18);
      L.hemi.intensity = af?.hemi ?? 0.16; L.ambient.intensity = af?.ambient ?? 0.045;
    } else {
      L.hemi.color.copy(horizon).lerp(new THREE.Color(0xffffff), b.hemiW ?? 0.35);   // [soul] per-moon hemisphere tint
      L.hemi.groundColor.set(b.hemiG ?? 0x1c1712);
      L.ambient.intensity = 0.03;
    }
    this.night = night;
  }
}
