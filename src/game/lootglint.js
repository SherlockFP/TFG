// TFG - HORROR-SAFE LOOT GLINT (wave 8, docs/wave8/heroprops.md). Replaces the tall rarity pillars (inventory.js tier beams, loot.js affix beams):
// a pillar read through walls and turned a dark corridor into an ARPG map. Now a rare+ item lying in the world gets
//   * a small camera-facing four-point star ON the item that flashes for ~0.5 s every few seconds (rarity = colour, rarer = faster / bigger),
//   * a faint floor ring, only within RING_RANGE (6 m) and only with a clear line of sight.
// Both are unlit basic materials (depthTest ON, so a wall also hides them) - no THREE light is ever added. Deterministic (phase = hash of the item id).
import * as THREE from 'three';
import { G } from '../physics/physics.js';

export const RING_RANGE = 6, STAR_RANGE = 18, FLASH_LEN = 0.5;
/** flash period (s) and star size (m) by rarity key */
export const GLINT = Object.freeze({
  uncommon: { period: 6.5, size: 0.1 }, rare: { period: 5, size: 0.12 }, epic: { period: 4, size: 0.14 }, legendary: { period: 3.2, size: 0.17 }, mythic: { period: 2.6, size: 0.2 },
});
const hash01 = (s) => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
/** 0..1 flash envelope: a sine pop lasting FLASH_LEN at the start of every period, offset per item */
export function glintFlash(time, phase, period) {
  const p = period > 0 ? period : 4, k = (((time + phase * p) % p) + p) % p / FLASH_LEN;
  return k >= 1 ? 0 : Math.sin(Math.PI * k);
}
/** what shows for an item at `dist` metres with (or without) a clear line to the camera */
export function glintVisibility(dist, los) { return { star: !!los && dist <= STAR_RANGE, ring: !!los && dist <= RING_RANGE }; }

/** the store: add(id, hex, rarityKey) -> entry; update(dt) follows the items; size / has / remove / clear / dispose */
export function createGlints(game) {
  const map = new Map(), mats = new Map();
  let starGeo = null, ringGeo = null, time = 0, scan = 0, disposed = false;
  const res = () => {
    if (starGeo) return;
    const s = new THREE.Shape(), R = 1, r = 0.22;                       // four-point star
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r : R; (i ? s.lineTo : s.moveTo).call(s, Math.sin(a) * q, Math.cos(a) * q); }
    starGeo = new THREE.ShapeGeometry(s); ringGeo = new THREE.RingGeometry(0.2, 0.3, 20).rotateX(-Math.PI / 2);
    starGeo.userData.shared = true; ringGeo.userData.shared = true;
  };
  const matFor = (hex) => {
    let m = mats.get(hex);
    if (!m) {
      const mk = (o) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: o });
      m = { star: mk(0.95), ring: mk(0.13) }; mats.set(hex, m);
    }
    return m;
  };
  const losTo = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.6 || !game.physics?.raycast) return true;
    try { return !game.physics.raycast(from, { x: dx / L, y: dy / L, z: dz / L }, L - 0.3, G.STATIC | G.DOOR); } catch { return true; }
  };
  const drop = (id, e) => { e.group.removeFromParent(); map.delete(id); };
  const api = {
    get size() { return map.size; },
    has: (id) => map.has(id),
    /** rarityKey picks period + size; hex = the rarity colour */
    add(id, hex, rarityKey) {
      if (disposed || map.has(id)) return map.get(id) || null;
      res();
      const cfg = GLINT[rarityKey] || GLINT.rare, m = matFor(hex);
      const star = new THREE.Mesh(starGeo, m.star), ring = new THREE.Mesh(ringGeo, m.ring), group = new THREE.Group();
      star.scale.setScalar(0.0001); star.visible = ring.visible = false; star.renderOrder = ring.renderOrder = 2; ring.position.y = 0.02;
      group.add(star, ring); game.scene.add(group);
      const e = { group, star, ring, cfg, phase: hash01(id), los: false, dist: 99 };
      map.set(id, e); return e;
    },
    remove(id) { const e = map.get(id); if (e) drop(id, e); },
    clear() { for (const [id, e] of [...map]) drop(id, e); },
    update(dt) {
      if (disposed) return;
      time += dt; scan -= dt;
      const cam = game.camera, I = game.items, doScan = scan <= 0;
      if (doScan) scan = 0.4;
      for (const [id, e] of [...map]) {
        const it = I?.get(id);
        if (!it || it.state !== 'world' || it.obj.parent !== game.scene) { drop(id, e); continue; }
        const h = it.size?.y || 0.3;
        e.group.position.copy(it.obj.position); e.group.position.y -= h * 0.5;
        if (!cam) continue;
        if (doScan) {
          e.dist = e.group.position.distanceTo(cam.position);
          const top = { x: it.obj.position.x, y: it.obj.position.y + h * 0.5 + 0.08, z: it.obj.position.z };
          e.los = e.dist <= STAR_RANGE && losTo(cam.position, top);
        }
        const v = glintVisibility(e.dist, e.los);
        e.ring.visible = v.ring;
        const f = v.star ? glintFlash(time, e.phase, e.cfg.period) : 0;
        e.star.visible = f > 0.01;
        if (e.star.visible) {
          e.star.position.set(0, h + 0.08, 0);
          e.star.quaternion.copy(cam.quaternion);
          e.star.scale.setScalar(e.cfg.size * f * (0.7 + Math.min(1, e.dist / 12) * 0.9));   // a touch bigger far away so it still reads
        }
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      api.clear(); starGeo?.dispose(); ringGeo?.dispose();
      for (const m of mats.values()) { m.star.dispose(); m.ring.dispose(); }
      mats.clear();
    },
  };
  return api;
}
