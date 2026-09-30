// Fixed-size light pools. Three.js recompiles shaders when the number of lights changes,
// so we keep a constant number of PointLights/SpotLights and assign them each frame to the
// most relevant emitters (nearest to camera). Emitters can flicker, be disabled (power off), etc.
import * as THREE from 'three';

const POINT_COUNT = 10;
const SPOT_COUNT = 4;

export class LightPool {
  constructor(scene) {
    this.scene = scene;
    this.emitters = new Set();
    this.points = [];
    for (let i = 0; i < POINT_COUNT; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      l.userData.cur = 0;
      scene.add(l);
      this.points.push(l);
    }
    this.spots = [];
    for (let i = 0; i < SPOT_COUNT; i++) {
      const s = new THREE.SpotLight(0xfff2d8, 0, 30, Math.PI / 7, 0.45, 1.4);
      scene.add(s); scene.add(s.target);
      this.spots.push(s);
    }
    this.spotRequests = [];
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x221a14, 0.4);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.02);
    scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.position.set(30, 60, 20);
    scene.add(this.sun); scene.add(this.sun.target);
    this.globalDim = 1;   // facility power (0 = off)
    // soft additive halos around the active point lights and a faint beam cone per spot light
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.55)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const haloTex = new THREE.CanvasTexture(c);
    this.halos = this.points.map(() => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: 0 }));
      sp.scale.setScalar(1.2);
      scene.add(sp);
      return sp;
    });
    const coneGeo = new THREE.ConeGeometry(1, 1, 16, 1, true);
    coneGeo.translate(0, -0.5, 0);
    coneGeo.rotateX(-Math.PI / 2);   // apex at origin, opening toward -Z... then we lookAt the target
    const cg = document.createElement('canvas'); cg.width = 4; cg.height = 64;
    const g2 = cg.getContext('2d');
    const lg = g2.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.15, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = lg; g2.fillRect(0, 0, 4, 64);
    const beamTex = new THREE.CanvasTexture(cg);
    this.beams = this.spots.map(() => {
      const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: 0xfff2d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this._tmp = new THREE.Vector3();
    this.time = 0;
  }

  // emitter: { pos: Vector3, color, intensity, distance, flicker: 0..1, group: 'facility'|'ship'|..., enabled }
  add(e) {
    e.enabled = e.enabled !== false;
    e.flicker = e.flicker || 0;
    e.phase = Math.random() * 100;
    e.group = e.group || 'misc';
    this.emitters.add(e);
    return e;
  }
  remove(e) { this.emitters.delete(e); }
  clearGroup(group) { for (const e of [...this.emitters]) if (e.group === group) this.emitters.delete(e); }

  // request a spot light for this frame (flashlights). priority: lower = more important
  requestSpot(req) { this.spotRequests.push(req); }

  groupFactor(e) {
    if (e.group === 'facility') return this.globalDim;
    return 1;
  }

  update(dt, camPos) {
    this.time += dt;
    const cands = [];
    for (const e of this.emitters) {
      if (!e.enabled) continue;
      const gf = this.groupFactor(e);
      if (gf <= 0.001) continue;
      const d2 = e.pos.distanceToSquared(camPos);
      const maxD = (e.distance || 10) + 22;
      if (d2 > maxD * maxD) continue;
      cands.push({ e, d2, gf });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.points.length; i++) {
      const l = this.points[i];
      const c = cands[i];
      if (!c) { l.intensity = 0; if (this.halos[i]) this.halos[i].material.opacity = 0; continue; }
      const e = c.e;
      l.position.copy(e.pos);
      l.color.set(e.color ?? 0xffe6c0);
      l.distance = e.distance || 10;
      let inten = (e.intensity ?? 1) * c.gf;
      if (e.flicker > 0) {
        const t = this.time + e.phase;
        const f = Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.3) * Math.sin(t * 2.1);
        if (f > 1 - e.flicker * 1.4) inten *= 0.08;
        else inten *= 0.85 + 0.15 * Math.sin(t * 40);
      }
      // fade by rank so swapping emitters near the end of the list doesn't pop hard
      const rankFade = i >= this.points.length - 2 ? 0.6 : 1;
      l.intensity = inten * 6 * rankFade;
      const h = this.halos[i];
      if (h) {
        h.position.copy(e.pos);
        h.material.color.copy(l.color);
        const k = Math.min(1, inten);
        h.material.opacity = 0.55 * k * (e.halo === false ? 0 : 1);
        h.scale.setScalar(0.7 + Math.min(2.2, (e.distance || 8) * 0.12));
      }
    }
    // spotlights
    this.spotRequests.sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1));
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const r = this.spotRequests[i];
      if (!r) { s.intensity = 0; if (this.beams[i]) this.beams[i].material.opacity = 0; continue; }
      s.position.copy(r.pos);
      s.target.position.copy(r.target);
      s.color.set(r.color ?? 0xfff2d8);
      s.angle = r.angle ?? Math.PI / 7;
      s.penumbra = r.penumbra ?? 0.45;
      s.distance = r.distance ?? 30;
      s.intensity = r.intensity ?? 40;
      const b = this.beams[i];
      if (b) {
        const len = Math.min(9, (s.distance || 20) * 0.35);
        const rad = Math.tan(s.angle) * len;
        b.position.copy(r.pos);
        b.lookAt(r.target);
        b.scale.set(rad, rad, len);
        b.material.color.copy(s.color);
        // [hud6] your own torch (priority < 1) has NO fake volume: you stand at the apex, so the cone reads as a grey slab across the view; the lit pool is the beam. Other people's torches keep a faint, distance-faded haze
        const dCam = r.priority < 1 ? 0 : Math.max(0, Math.min(1, 1.4 - r.pos.distanceTo(camPos || r.pos) / 30));
        b.material.opacity = r.priority < 1 ? 0 : 0.032 * dCam;
      }
    }
    this.spotRequests.length = 0;
  }
}
