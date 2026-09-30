// SWARM11 wave 11 - client visuals of the ecology module (every peer, driven by the host's 'swfx' messages; docs/wave11/swarm11.md).
//   blood stains   one pooled InstancedMesh (32 quads, blood_splat texture) where crewmates were hurt: the AutoMod cleans them
//   aim beams      a thin red beam + target ring from an AutoMod to what it is about to delete (the telegraph of a cleanup)
//   speech tags    a short floating tag over a creature ('LIVE!', 'FLAGGED')
//   toasts         one line per notable event, only for players close by
import * as THREE from 'three';
import { t, tf } from '../core/i18n.js';
import { getTexture } from '../render/textures.js';

const CAP = 32, BEAMS = 3, TAGS = 4;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(-Math.PI / 2, 0, 0);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export function installSw11Fx(g) {
  const scene = g.scene || g.engine?.scene;
  let disposed = false;
  const blood = new Map(), free = [];
  for (let i = CAP - 1; i >= 0; i--) free.push(i);
  let mesh = null;
  const ensureMesh = () => {
    if (mesh || !scene) return mesh;
    const mat = new THREE.MeshBasicMaterial({ map: getTexture('blood_splat'), color: 0xb0b0b0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, CAP);
    mesh.frustumCulled = false; mesh.renderOrder = 1;
    for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, HIDE);
    scene.add(mesh);
    return mesh;
  };
  function setBlood(id, x, y, z, s) {
    if (!ensureMesh()) return;
    let b = blood.get(id);
    if (!b) { const i = free.pop(); if (i === undefined) return; b = { i, rot: (id * 2.399) % (Math.PI * 2) }; blood.set(id, b); }
    _q.setFromEuler(_e); _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), b.rot));
    _s.set(s, s, 1); _p.set(x, y + 0.025, z);
    mesh.setMatrixAt(b.i, _m.compose(_p, _q, _s)); mesh.instanceMatrix.needsUpdate = true;
  }
  function rmBlood(id) {
    const b = blood.get(id); if (!b || !mesh) return;
    mesh.setMatrixAt(b.i, HIDE); mesh.instanceMatrix.needsUpdate = true; free.push(b.i); blood.delete(id);
  }

  // ---- aim beams (one per AutoMod, pooled)
  const beams = new Map();   // creature id -> { bar, ring, p: Vector3, until }
  const pool = [];
  const mkBeam = () => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.6, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; bar.frustumCulled = ring.frustumCulled = false; bar.visible = ring.visible = false; scene.add(bar); scene.add(ring);
    return { bar, ring, p: new THREE.Vector3(), until: 0 };
  };
  function aim(d) {
    if (!scene || !Array.isArray(d.p)) return;
    let b = beams.get(d.id);
    if (!b) { b = pool.pop() || (pool.length + beams.size < BEAMS ? mkBeam() : null); if (!b) return; beams.set(d.id, b); }
    b.p.set(+d.p[0] || 0, +d.p[1] || 0, +d.p[2] || 0); b.until = (g.time || 0) + 2.2; b.kind = d.kind;
  }
  const hs = { v: new THREE.Vector3(), w: new THREE.Vector3() };
  function updateBeams() {
    for (const [id, b] of beams) {
      const v = g.creatures?.views?.get(id), now = g.time || 0;
      if (!v || v.state === 'dead' || (v.state !== 'scan' && v.state !== 'sweep') || now > b.until) { b.bar.visible = b.ring.visible = false; beams.delete(id); pool.push(b); continue; }
      hs.v.set(v.pos.x, v.pos.y + 1.45, v.pos.z); hs.w.copy(b.p);
      const len = hs.v.distanceTo(hs.w);
      b.bar.position.copy(hs.v).lerp(hs.w, 0.5); b.bar.scale.z = Math.max(0.05, len); b.bar.lookAt(hs.w); b.bar.visible = true;
      b.ring.position.set(b.p.x, b.p.y + 0.05, b.p.z); b.ring.scale.setScalar(v.state === 'sweep' ? 1 + 0.3 * Math.sin(now * 14) : 1.2); b.ring.visible = true;
      b.bar.material.opacity = v.state === 'sweep' ? 0.85 : 0.5 + 0.2 * Math.sin(now * 9);
    }
  }

  // ---- speech tags
  const tags = [];
  function tag(id, text) {
    const v = g.creatures?.views?.get(id);
    if (!v || !scene || typeof document === 'undefined') return;
    if (tags.length >= TAGS) { const o = tags.shift(); scene.remove(o.s); o.s.material.map?.dispose(); o.s.material.dispose(); }
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 40;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(8,10,14,0.82)'; x.fillRect(0, 4, 192, 32); x.fillStyle = '#ff4a3a'; x.fillRect(0, 4, 4, 32);
    x.font = '24px VT323, monospace'; x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.fillText(String(text).slice(0, 22), 100, 28);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthTest: false })); s.scale.set(1.5, 0.31, 1); s.renderOrder = 6;
    scene.add(s); tags.push({ s, v, t: 0 });
  }
  function updateTags(dt) {
    for (let i = tags.length - 1; i >= 0; i--) {
      const o = tags[i]; o.t += dt;
      if (o.t > 2.2 || !o.v) { scene.remove(o.s); o.s.material.map?.dispose(); o.s.material.dispose(); tags.splice(i, 1); continue; }
      o.s.position.set(o.v.pos.x, o.v.pos.y + (o.v.height || 1.6) + 0.5 + o.t * 0.15, o.v.pos.z); o.s.material.opacity = Math.min(1, (2.2 - o.t) * 2);
    }
  }

  const near = (p, r) => { const q = g.player?.pos; return !!q && !!p && Math.hypot(q.x - p[0], q.z - p[2]) < r && Math.abs(q.y - p[1]) < 8; };
  const toast = (s, kind = 'info') => { try { g.ui?.toast?.(s, kind); } catch { /* HUD not ready */ } };
  function handle(d) {
    if (disposed || !d) return;
    switch (d.k) {
      case 'blood': if (Array.isArray(d.p)) setBlood(d.id | 0, +d.p[0], +d.p[1], +d.p[2], Math.max(0.4, Math.min(2.6, +d.s || 1))); break;
      case 'brm': rmBlood(d.id | 0); break;
      case 'sync': for (const b of d.blood || []) setBlood(b[0], b[1], b[2], b[3], b[4]); break;
      case 'aim': aim(d); break;
      case 'say': tag(d.id, t(String(d.s || '').slice(0, 24))); break;
      case 'del': {
        if (Array.isArray(d.p)) g.particles?.burst(_p.set(+d.p[0], +d.p[1] + 0.5, +d.p[2]), 'dust', null, 1.4);
        const mine = d.o && d.o === g.selfId;
        if (d.kind === 'body' && near(d.p, 60)) toast(t('AutoMod deleted a body. It is gone for good.'), 'bad');
        else if (d.kind === 'item' && (mine || near(d.p, 30))) toast(tf('AutoMod deleted: {name}', { name: t(d.n || 'item') }), mine ? 'bad' : 'info');
        else if (d.kind === 'chalk' && near(d.p, 30)) toast(t('AutoMod wiped a chalk mark.'), 'info');
        break;
      }
      case 'pulse': break;   // the ripples are drawn by the model itself
      case 'ring': { const v = g.creatures?.views?.get(d.id); if (v && near([v.pos.x, v.pos.y, v.pos.z], 45)) toast(t('The ring light shattered. It will not stream again.'), 'good'); break; }
      case 'live': { if (d.p && near(d.p, 70)) toast(t('A Streamer went LIVE. Every calm creature within 30 m is coming to watch.'), 'bad'); break; }
      case 'raid': { if (near(d.p, 45)) toast(d.n > 0 ? tf('The nest is smashed: {n} bonus scrap. The swarm is awake.', { n: d.n }) : t('The nest is smashed. The swarm is awake.'), 'good'); break; }
      default: break;
    }
  }
  function reset() {
    for (const id of [...blood.keys()]) rmBlood(id);
    for (const b of beams.values()) { b.bar.visible = b.ring.visible = false; pool.push(b); }
    beams.clear();
    for (const o of tags.splice(0)) { scene?.remove(o.s); o.s.material.map?.dispose(); o.s.material.dispose(); }
  }
  function update(dt) { if (disposed) return; updateBeams(); updateTags(dt); }
  function dispose() {
    if (disposed) return; disposed = true;
    reset();
    if (mesh) { scene?.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
    for (const b of [...pool, ...beams.values()]) { scene?.remove(b.bar); scene?.remove(b.ring); b.bar.geometry.dispose(); b.bar.material.dispose(); b.ring.geometry.dispose(); b.ring.material.dispose(); }
    pool.length = 0; beams.clear();
  }
  return { handle, update, reset, dispose, count: () => blood.size, get mesh() { return mesh; } };
}
