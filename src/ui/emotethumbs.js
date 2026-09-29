// Emote wheel / studio thumbnails (wave 6): every emote's signature pose rendered ONCE to a small canvas (data URL) with the player's own avatar.
// One shared offscreen WebGL renderer + its own scene (own lights: never touches the game's light budget), a few thumbnails per frame, disposed when the queue is empty.
//   thumbFor(id, profile, cb)  -> cb(dataUrl|null) now (cached) or later;  clearThumbs() after a wardrobe change.
import * as THREE from 'three';
import { createAvatar } from '../models/avatar.js';
import { SUIT_COLORS } from '../models/avatar.js';
import { EMOTE_BY_ID, applyEmoteFx } from '../game/emotes.js';

const SIZE = 96;
const cache = new Map();            // 'suit|id' -> url | ''
const waiting = new Map();          // key -> [cb]
const queue = [];
let R = null, raf = 0, failed = false;

function setup(profile) {
  if (R) return R;
  const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.2); key.position.set(1.5, 2.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x66ffcc, 0.8); rim.position.set(-2, 1, -2); scene.add(rim);
  const suit = (SUIT_COLORS.find((s) => s.id === profile?.suit) || SUIT_COLORS[0]).color;
  const avatar = createAvatar({ suitColor: suit, hat: profile?.hat || 'none' });
  avatar.setLook?.(profile);
  scene.add(avatar.root);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  R = { renderer, scene, avatar, cam, canvas };
  return R;
}
function teardown() {
  if (!R) return;
  R.scene.remove(R.avatar.root); R.avatar.dispose?.();
  R.renderer.dispose(); R.renderer.forceContextLoss?.();
  R = null;
}
const box = new THREE.Box3(), sz = new THREE.Vector3(), ctr = new THREE.Vector3();
function render(id, profile) {
  const def = EMOTE_BY_ID[id]; if (!def) return '';
  const { renderer, scene, avatar, cam, canvas } = setup(profile);
  const root = avatar.root, t = def.thumbT ?? Math.min(1.2, (def.dur || 3) * 0.35);
  for (let i = 0; i < 6; i++) { root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); avatar.update(0.1, { speed: 0, grounded: true, emote: def.base, lookPitch: 0, time: i * 0.1 }); }
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  avatar.update(0.05, { speed: 0, grounded: true, emote: def.base, lookPitch: 0, time: 0.6 });
  applyEmoteFx(avatar, root, def, t);
  avatar.setExpression?.(def.face || 'normal');
  root.updateMatrixWorld(true);
  box.setFromObject(root); box.getSize(sz); box.getCenter(ctr);
  const half = Math.max(sz.x, sz.y, 1.0) * 0.56;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
  cam.position.set(ctr.x + 1.2, ctr.y + 0.55, ctr.z + 4); cam.lookAt(ctr);   // three-quarter view from the front
  renderer.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  avatar.setHitFlash?.(0); avatar.setExpression?.('normal');
  return url;
}
function pump() {
  raf = 0;
  if (!queue.length) { teardown(); return; }
  for (let n = 0; n < 3 && queue.length; n++) {
    const { key, id, profile } = queue.shift();
    let url = '';
    try { url = render(id, profile); } catch (e) { failed = true; url = ''; }
    cache.set(key, url);
    for (const cb of waiting.get(key) || []) cb(url || null);
    waiting.delete(key);
  }
  raf = requestAnimationFrame(pump);
}
/** cb(url|null): url is a PNG data URL of the emote's signature pose (null when WebGL is unavailable) */
export function thumbFor(id, profile, cb) {
  if (typeof document === 'undefined' || failed) { cb?.(null); return; }
  const key = (profile?.suit || '') + '|' + (profile?.hat || '') + '|' + id;
  if (cache.has(key)) { cb?.(cache.get(key) || null); return; }
  if (waiting.has(key)) { waiting.get(key).push(cb); return; }
  waiting.set(key, [cb]);
  queue.push({ key, id, profile });
  if (!raf) raf = requestAnimationFrame(pump);
}
export function clearThumbs() { cache.clear(); }
