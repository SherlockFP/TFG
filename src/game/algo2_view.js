// algo2 rendering (docs/wave6/algo2.md): glitch exploit meshes (one flickering shader, no lights) and the ghost replay avatars (ONE shared translucent
// material, low detail: max 3 avatar clones, culled beyond 70 m, animation only inside 45 m).
import * as THREE from 'three';
import { createAvatar } from '../models/avatar.js';
import { sampleAt, ghostLoop, GHOST } from './algo2_core.js';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `varying vec2 vUv; uniform float uT; uniform vec3 uC; uniform float uK;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float step_t = floor(uT * 9.0);
  float band = floor(vUv.y * 16.0 + step_t);
  float tear = step(0.84, h(vec2(band, floor(uT * 4.0))));
  vec2 cell = floor(vUv * vec2(7.0, 16.0)) + step_t;
  float blk = h(cell);
  float scan = 0.72 + 0.28 * sin(vUv.y * 90.0 + uT * 34.0);
  float on = step(0.12, h(vec2(floor(uT * 13.0), 3.0)));
  float a = (0.28 + 0.5 * step(0.55, blk) + 0.35 * tear) * on * uK;
  vec3 col = uC * (0.55 + 0.9 * blk) * scan + vec3(0.6, 0.0, 0.5) * tear * 0.6;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
}`;

const GLITCH_COL = { wall: 0x33e6ff, dup: 0xffd23f, freeze: 0xff4fd8 };

export function createView(game) {
  const uT = { value: 0 };
  const mats = {};
  for (const k of Object.keys(GLITCH_COL)) {
    mats[k] = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT, uC: { value: new THREE.Color(GLITCH_COL[k]) }, uK: { value: 1 } } });
  }
  const geo = {
    wall: new THREE.BoxGeometry(1.7, 2.4, 0.14),
    shelf: new THREE.BoxGeometry(1.1, 1.7, 0.5),
    crate: new THREE.BoxGeometry(0.28, 0.2, 0.28),
    pixel: new THREE.OctahedronGeometry(0.26),
  };
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.34, depthWrite: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6, 1, true);
  const gemGeo = new THREE.OctahedronGeometry(0.16);
  const glitches = new Map();   // id -> { obj, type, flash }
  let glGroup = null;
  const ghosts = [];            // { root, av, track, len, t, anchor, marker, label, gem }
  let time = 0;

  function addGlitchMesh(g) {
    const grp = new THREE.Group();
    grp.position.set(g.x, g.y, g.z);
    if (g.type === 'wall') {
      const m = new THREE.Mesh(geo.wall, mats.wall); m.position.y = 1.2; grp.add(m);
      grp.rotation.y = ((g.x * 7 + g.z * 13) % 4) * (Math.PI / 2);
    } else if (g.type === 'dup') {
      const m = new THREE.Mesh(geo.shelf, mats.dup); m.position.y = 0.85; grp.add(m);
      for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(geo.crate, mats.dup); c.position.set(-0.3 + i * 0.3, 1.8, 0); grp.add(c); }
      grp.rotation.y = ((g.x * 5 + g.z * 11) % 4) * (Math.PI / 2);
    } else {
      const m = new THREE.Mesh(geo.pixel, mats.freeze); m.position.y = 1.2; m.userData.spin = true; grp.add(m);
    }
    glGroup.add(grp);
    glitches.set(g.id, { obj: grp, type: g.type });
    if (g.to) {   // the far side of a wall hop: same look
      const b = new THREE.Group(); b.position.set(g.to.x, g.to.y, g.to.z);
      const m = new THREE.Mesh(geo.wall, mats.wall); m.position.y = 1.2; b.add(m);
      b.rotation.y = ((g.to.x * 3 + g.to.z * 17) % 4) * (Math.PI / 2);
      glGroup.add(b); glitches.set(g.id + '_to', { obj: b, type: 'wall' });
    }
  }
  return {
    /** build the glitch meshes into `parent` (the facility group) */
    setGlitches(parent, list) {
      this.clearGlitches();
      if (!parent || !list?.length) return;
      glGroup = new THREE.Group(); glGroup.name = 'algo2_glitches';
      parent.add(glGroup);
      for (const g of list) addGlitchMesh(g);
    },
    hideGlitch(id) { for (const k of [id, id + '_to']) { const e = glitches.get(k); if (e) e.obj.visible = false; } },
    clearGlitches() { if (glGroup) { glGroup.removeFromParent(); glGroup = null; } glitches.clear(); },
    /** list: [{ a:[x,y,z], name, day, loot, track: unpacked relative samples }] */
    setGhosts(list) {
      this.clearGhosts();
      for (const g of list || []) {
        if (!g.track?.length) continue;
        let av = null;
        try { av = createAvatar({ suitColor: '#a9d6ff', hat: 'none' }); } catch (e) { console.warn('[algo2] ghost avatar', e); }
        const root = new THREE.Group(); root.name = 'algo2_ghost';
        if (av) { av.root.traverse((o) => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; o.receiveShadow = false; } }); root.add(av.root); }
        // beam + gem = the dropped-loot marker (gold when the dead player was carrying scrap)
        const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 1.6; root.add(beam);
        const gem = new THREE.Mesh(gemGeo, beamMat); gem.position.y = 3.4; root.add(gem);
        const label = makeLabel(g.label || '');
        label.position.y = 2.45; root.add(label);
        root.position.set(g.a[0], g.a[1], g.a[2]);
        game.engine.scene.add(root);
        ghosts.push({ root, av, avRoot: av?.root, track: g.track, len: (g.track.length - 1) / GHOST.hz, t: Math.random() * 2, anchor: g.a, gem, loot: g.loot | 0, beam });
      }
    },
    clearGhosts() {
      for (const g of ghosts) { g.root.removeFromParent(); g.root.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } }); }
      ghosts.length = 0;
    },
    ghostCount: () => ghosts.length,
    ghostAnchors: () => ghosts.map((g) => g.anchor),
    update(dt, camPos) {
      time += dt; uT.value = time;
      for (const e of glitches.values()) if (e.type === 'freeze') e.obj.children[0].rotation.y += dt * 1.6;
      for (const g of ghosts) {
        const dx = camPos.x - g.anchor[0], dz = camPos.z - g.anchor[2];
        const d2 = dx * dx + dz * dz;
        g.root.visible = d2 < 70 * 70;
        if (!g.root.visible) continue;
        g.gem.rotation.y += dt * 1.5; g.gem.position.y = 3.4 + Math.sin(time * 2 + g.anchor[0]) * 0.12;
        if (!g.avRoot) continue;
        g.t += dt;
        const lp = ghostLoop(g.t, g.len);
        g.avRoot.visible = !lp.holding || ((time * 9) % 1) < 0.5 * lp.alpha;
        if (d2 > 45 * 45) continue;
        const s = sampleAt(g.track, lp.u);
        if (!s) continue;
        // the ghost's own feet are the replay; the marker stays on the anchor (where it died)
        g.avRoot.position.set(s.x, s.y, s.z);
        g.avRoot.rotation.y = s.yaw + Math.PI;
        try { g.av.update(dt, { speed: Math.min(s.speed, 9), crouch: false, sprint: s.speed > 5.5, grounded: true, carry2h: false, holding: false, dead: false, emote: null, swing: 0, lookPitch: 0, climbing: false, time }); } catch { /* ghost anim is optional */ }
      }
    },
    dispose() {
      this.clearGlitches(); this.clearGhosts();
      for (const m of Object.values(mats)) m.dispose();
      for (const g of Object.values(geo)) g.dispose();
      ghostMat.dispose(); beamMat.dispose(); beamGeo.dispose(); gemGeo.dispose();
    },
  };
}

function makeLabel(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 40;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,14,20,.6)'; x.fillRect(0, 0, 256, 40);
  x.font = '700 22px "Barlow Condensed","Arial Narrow",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#bfe4ff';
  x.fillText(String(text).toUpperCase().slice(0, 26), 128, 21);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.9, 0.3, 1);
  return sp;
}
