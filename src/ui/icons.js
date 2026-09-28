// icons.js — UI imagery.
//  1) Item thumbnails: every item model (createItemModel, or a mod/ext model registered in
//     window.__kefalMods.itemModels) is rendered ONCE into a 64x64 PNG by a shared offscreen
//     WebGLRenderer, outlined + drop-shadowed on a 2D canvas and cached as a data URL.
//     Rendering is queued and time-sliced (idle callbacks), so asking for an icon never stalls a frame:
//       iconURL(type)      -> cached data URL or '' (and queues the render)
//       iconImg(type, cls) -> <img data-icon=type>; its src is filled in as soon as the icon is ready
//       iconHTML(type, cls)-> same as a string for innerHTML builders
//       prewarmIcons(list) -> queue many at once (menu idle time)
//       typeFromName(name) -> item id for a display name (scan labels / sale lists only carry names)
//  2) Pixel-art UI glyphs (12x12 inline SVG, currentColor): glyph(name, cls)
import * as THREE from 'three';
import { createItemModel } from '../models/items.js';
import { ITEMS } from '../game/items.js';

// ------------------------------------------------------------------ tuning
export const ICON_SIZE = 64;          // output PNG size (CSS upscales it with pixelated filtering)
const ICON_PAD = 0.1;                 // empty margin around the model (fraction of the icon)
const SLICE_MS = 7;                   // max time spent rendering icons per idle slice
const OUTLINE_COLOR = 'rgba(10,5,2,0.95)';
const SHADOW_COLOR = 'rgba(0,0,0,0.42)';
const SHADOW_OFFSET = 2;              // px (bottom-right drop shadow)
const KEY_LIGHT = 2.3;                // directional key light (top-left-front)
const FILL_HEMI = 1.25;               // warm hemisphere fill
const RIM_LIGHT = 1.5;                // back rim light (amber)
const RIM_COLOR = 0xffa060;
const ELONGATED = 1.8;                // longest/second-longest ratio that counts as a "tool" (drawn diagonally)
// orientation of regular items: 3/4 view from slightly above
const VIEW_TILT = 0.42, VIEW_YAW = -0.62;
// orientation of long items (flashlight, shovel...): side view on a diagonal
const DIAG_TILT = 0.3, DIAG_ROLL = 0.62;
// orientation of flat items (height < FLAT_RATIO x the second-largest size): steeper top-down view
const FLAT_RATIO = 0.3, FLAT_TILT = 0.95;

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const BLANK_IMG = BLANK;

const cache = new Map();   // type -> dataURL ('' = failed, do not retry)
const queue = [];
const queued = new Set();
let R = null;              // lazily created renderer bundle
let scheduled = false;
let failed = false;        // WebGL unavailable -> icons disabled

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

function ensureRenderer() {
  if (R || failed) return R;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE; canvas.height = ICON_SIZE;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power', stencil: false });
    renderer.setPixelRatio(1);
    renderer.setSize(ICON_SIZE, ICON_SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    const hemi = new THREE.HemisphereLight(0xfff0dc, 0x3a2414, FILL_HEMI);
    const key = new THREE.DirectionalLight(0xfff4e6, KEY_LIGHT);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(RIM_COLOR, RIM_LIGHT);
    rim.position.set(3, 1.5, -4);
    scene.add(hemi, key, rim, key.target, rim.target);
    const wrap = new THREE.Group();
    scene.add(wrap);
    const post = document.createElement('canvas'); post.width = post.height = ICON_SIZE;
    const sil = document.createElement('canvas'); sil.width = sil.height = ICON_SIZE;
    const postCtx = post.getContext('2d');
    const silCtx = sil.getContext('2d');
    postCtx.imageSmoothingEnabled = false; silCtx.imageSmoothingEnabled = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); failed = true; R = null; });
    R = { renderer, canvas, scene, cam, wrap, post, postCtx, sil, silCtx };
  } catch (e) {
    console.warn('icon renderer unavailable', e);
    failed = true;
    R = null;
  }
  return R;
}

function modelFor(type) {
  const custom = window.__kefalMods?.itemModels?.get?.(type);
  if (custom) {
    try { const o = custom(window.KefalAPI?.THREE || THREE); if (o) return o; } catch (e) { console.warn('icon model (mod)', type, e); }
  }
  return createItemModel(type);
}

function disposeModel(obj) {
  obj.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
}

function renderIcon(type) {
  const r = ensureRenderer();
  if (!r) return '';
  let obj = null;
  try { obj = modelFor(type); } catch (e) { console.warn('icon model', type, e); }
  if (!obj) return '';
  const { wrap, cam, renderer } = r;
  wrap.position.set(0, 0, 0);
  wrap.rotation.set(0, 0, 0);
  wrap.add(obj);
  wrap.updateMatrixWorld(true);
  _box.setFromObject(obj);
  if (_box.isEmpty()) { wrap.remove(obj); disposeModel(obj); return ''; }
  _box.getSize(_v);
  const dims = [_v.x, _v.y, _v.z];
  const sorted = [...dims].sort((a, b) => b - a);
  const longAxis = dims.indexOf(sorted[0]);
  const elongated = sorted[0] > ELONGATED * Math.max(1e-4, sorted[1]);
  if (elongated && longAxis === 2) wrap.rotation.set(DIAG_TILT, -Math.PI / 2, DIAG_ROLL, 'XZY');
  else if (elongated && longAxis === 0) wrap.rotation.set(DIAG_TILT, -0.25, DIAG_ROLL, 'XZY');
  else if (dims[1] < FLAT_RATIO * sorted[1]) wrap.rotation.set(FLAT_TILT, VIEW_YAW, 0, 'XYZ');   // floppies, letters, coins, boards: look from above
  else wrap.rotation.set(VIEW_TILT, VIEW_YAW, 0, 'XYZ');
  wrap.updateMatrixWorld(true);
  _box.setFromObject(wrap);
  _box.getCenter(_c);
  _box.getSize(_v);
  wrap.position.set(-_c.x, -_c.y, -_c.z);
  wrap.updateMatrixWorld(true);
  const half = Math.max(_v.x, _v.y, 1e-3) / 2 / (1 - ICON_PAD * 2);
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
  cam.position.set(0, 0, _v.z / 2 + 5);
  cam.near = 0.01; cam.far = _v.z + 12;
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  renderer.render(r.scene, cam);
  // 2D post: silhouette -> drop shadow + 1px outline, then the render on top
  const S = ICON_SIZE;
  const { silCtx, postCtx, sil, post, canvas } = r;
  silCtx.globalCompositeOperation = 'source-over';
  silCtx.clearRect(0, 0, S, S);
  silCtx.drawImage(canvas, 0, 0);
  silCtx.globalCompositeOperation = 'source-in';
  silCtx.fillStyle = OUTLINE_COLOR;
  silCtx.fillRect(0, 0, S, S);
  postCtx.clearRect(0, 0, S, S);
  postCtx.globalAlpha = 1;
  postCtx.globalCompositeOperation = 'source-over';
  // shadow
  postCtx.save();
  postCtx.globalAlpha = 0.9;
  postCtx.drawImage(sil, SHADOW_OFFSET, SHADOW_OFFSET);
  postCtx.globalCompositeOperation = 'source-in';
  postCtx.fillStyle = SHADOW_COLOR;
  postCtx.fillRect(0, 0, S, S);
  postCtx.restore();
  // outline (4-neighbour)
  postCtx.drawImage(sil, -1, 0); postCtx.drawImage(sil, 1, 0);
  postCtx.drawImage(sil, 0, -1); postCtx.drawImage(sil, 0, 1);
  postCtx.drawImage(canvas, 0, 0);
  let url = '';
  try { url = post.toDataURL('image/png'); } catch (e) { url = ''; }
  wrap.remove(obj);
  disposeModel(obj);
  return url;
}

function notify(type, url) {
  const list = document.querySelectorAll('img[data-icon]');
  for (const img of list) {
    if (img.dataset.icon !== type) continue;
    img.src = url;
    img.classList.add('ok');
  }
}

function pump() {
  scheduled = false;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < SLICE_MS) {
    const type = queue.shift();
    queued.delete(type);
    if (cache.has(type)) continue;
    let url = '';
    try { url = renderIcon(type); } catch (e) { console.warn('icon render', type, e); url = ''; }
    cache.set(type, url);
    if (url) notify(type, url);
  }
  if (queue.length) schedule();
}

function schedule() {
  if (scheduled || failed) return;
  scheduled = true;
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(pump, { timeout: 150 });
  else setTimeout(pump, 30);
}

function enqueue(type, front = false) {
  if (!type || cache.has(type) || queued.has(type) || failed) return;
  queued.add(type);
  if (front) queue.unshift(type); else queue.push(type);
  schedule();
}

/** Cached data URL of an item icon, or '' (the icon is then queued; <img data-icon> elements update themselves). */
export function iconURL(type) {
  if (!type) return '';
  const u = cache.get(type);
  if (u !== undefined) return u;
  enqueue(type, true);
  return '';
}

/** <img> element for an item type (fills in when the icon is ready). */
export function iconImg(type, cls = 'ico') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.draggable = false;
  if (type) img.dataset.icon = type;
  const u = iconURL(type);
  img.src = u || BLANK;
  if (u) img.classList.add('ok');
  return img;
}

/** Same as iconImg() but as an HTML string. */
export function iconHTML(type, cls = 'ico') {
  const u = iconURL(type);
  const safe = String(type || '').replace(/[^a-zA-Z0-9_:\-]/g, '');
  return `<img class="${cls}${u ? ' ok' : ''}" data-icon="${safe}" src="${u || BLANK}" alt="" draggable="false">`;
}

/** Queue icons for many item types (defaults to every registered item). */
export function prewarmIcons(types) {
  const list = types || Object.keys(ITEMS);
  for (const t of list) enqueue(t);
}

let nameMap = null, nameMapSize = -1;
/** Item id for a display name ("Big Bolt" -> "bolt"), or null. */
export function typeFromName(name) {
  if (!name) return null;
  const n = Object.keys(ITEMS).length;
  if (!nameMap || n !== nameMapSize) {
    nameMap = new Map();
    for (const [id, d] of Object.entries(ITEMS)) if (d?.name && !nameMap.has(d.name)) nameMap.set(d.name, id);
    nameMapSize = n;
  }
  return nameMap.get(name) || null;
}

export function disposeIcons() {
  if (!R) return;
  try { R.renderer.dispose(); R.renderer.forceContextLoss(); } catch { /* ignore */ }
  R = null;
}

// ------------------------------------------------------------------ pixel glyphs (12x12)
const GLYPHS = {
  play: ['', '...#', '...##', '...###', '...####', '...#####', '...#####', '...####', '...###', '...##', '...#', ''],
  host: ['', '.#........#.', '#..#....#..#', '#.#......#.#', '#.#..##..#.#', '#.#..##..#.#', '#..#.##.#..#', '.#...##...#.', '.....##.....', '....####....', '...######...', ''],
  join: ['', '...##', '..####..##', '..####.####', '...##..####', '........##', '.######', '########.###', '########.###', '########.###', '', ''],
  character: ['', '....####', '...######', '..##....##', '..#.####.#', '..#.####.#', '...######', '....####', '..########', '.##########', '.##########', ''],
  mods: ['', '..########', '..#......#', '..#.####.#', '..#.####.#', '..#......#', '..########', '..########', '..#.#..#.#', '..#.#..#.#', '', ''],
  settings: ['', '.....##', '..#.####.#', '...######', '..###..###', '.###....###', '.###....###', '..###..###', '...######', '..#.####.#', '.....##', ''],
  howto: ['', '...######', '..##....##', '..##....##', '........##', '......###', '.....##', '.....##', '', '.....##', '.....##', ''],
  credits: ['', '.....##', '.....##', '....####', '############', '.##########', '..########', '...######', '...##..##', '..##....##', '..#......#', ''],
  back: ['', '....#', '...##', '..###', '.##########', '###########', '.##########', '..###', '...##', '....#', '', ''],
  coin: ['', '....####', '..##....##', '.#..####..#', '.#.#....#.#', '#..#.##.#..#', '#..#.##.#..#', '.#.#....#.#', '.#..####..#', '..##....##', '....####', ''],
  skull: ['', '...######', '..########', '.##########', '.##..##..##', '.##..##..##', '.##########', '..###..###', '...######', '...#.##.#', '...######', ''],
  lock: ['', '....####', '...#....#', '...#....#', '...#....#', '..########', '..########', '..###..###', '..###..###', '..########', '..########', ''],
  trophy: ['', '..########', '##.######.##', '#..######..#', '#..######..#', '.#.######.#', '...######', '....####', '.....##', '....####', '...######', ''],
  bolt: ['', '......###', '.....###', '....###', '...###', '..########', '......###', '.....###', '....###', '...##', '..#', ''],
  heart: ['', '..##....##', '.####..####', '############', '############', '############', '.##########', '..########', '...######', '....####', '.....##', ''],
  shield: ['', '.##########', '.##########', '.####..####', '.####..####', '.##......##', '.####..####', '..###..###', '...######', '....####', '.....##', ''],
  clock: ['', '....####', '..##....##', '.#....#...#', '.#....#...#', '#.....#....#', '#.....####.#', '.#........#', '.#........#', '..##....##', '....####', ''],
  scan: ['', '....####', '..##....##', '.#...##...#', '.#..#..#..#', '#..#.##.#..#', '#..#.##.#..#', '.#..#..#..#', '.#...##...#', '..##....##', '....####', ''],
  box: ['', '.##########', '.#........#', '.##########', '.#.#....#.#', '.#..#..#..#', '.#...##...#', '.#..#..#..#', '.#.#....#.#', '.##########', '', ''],
  check: ['', '', '..........##', '.........##', '........##', '##.....##', '.##...##', '..##.##', '...###', '....#', '', ''],
  cross: ['', '.##......##', '..##....##', '...##..##', '....####', '.....##', '....####', '...##..##', '..##....##', '.##......##', '', ''],
  warn: ['', '.....##', '....####', '....#..#', '...##..##', '...##..##', '..###..###', '..########', '.####..####', '.##########', '############', ''],
  mic: ['', '....####', '....####', '....####', '....####', '..#.####.#', '..#.####.#', '...#....#', '....####', '.....##', '...######', ''],
  speaker: ['', '.....#', '....##...#', '...###....#', '#####..#..#', '#####...#.#', '#####...#.#', '#####..#..#', '...###....#', '....##...#', '.....#', ''],
  keyboard: ['', '', '############', '#.#.#.#.#.##', '############', '##.#.#.#.#.#', '############', '#.########.#', '############', '', '', ''],
  eye: ['', '', '....####', '..##....##', '.#...##...#', '#...####...#', '#...####...#', '.#...##...#', '..##....##', '....####', '', ''],
  fish: ['', '', '....#####', '..########.#', '.##.#######', '###########', '.##########', '..########.#', '....#####', '', '', ''],
  globe: ['', '....####', '..##.##.##', '.#..#..#..#', '.##########', '#...#..#...#', '#...#..#...#', '.##########', '.#..#..#..#', '..##.##.##', '....####', ''],
  refresh: ['', '....####.#', '..##....##', '.#.....###', '.#', '#', '#..........#', '..........#', '..###.....#', '..##....##', '..#.####', ''],
  door: ['', '.######', '.#....#', '.#....#..#', '.#....#..##', '.#..#.######', '.#....#..##', '.#....#..#', '.#....#', '.######', '', ''],
  copy: ['', '.######', '.#....#', '.#..######', '.#..#....#', '.#..#....#', '.####....#', '....#....#', '....#....#', '....######', '', ''],
  target: ['', '.....##', '...######', '..##.##.##', '..#..##..#', '#####..#####', '#####..#####', '..#..##..#', '..##.##.##', '...######', '.....##', ''],
  sun: ['', '.#...##...#', '..#......#', '....####', '...######', '#.########.#', '#.########.#', '...######', '....####', '..#......#', '.#...##...#', ''],
  moon: ['', '....####', '..#####', '.#####', '.####', '#####', '#####', '.#####', '.######...#', '..#########', '....#####', ''],
  bag: ['', '....####', '...#....#', '...#....#', '.##########', '.##########', '.####..####', '.##########', '.##########', '.##########', '..########', ''],
  xp: ['', '.....##', '....####', '...######', '..###..###', '.###....###', '.....##', '....####', '...######', '..###..###', '.###....###', ''],
  fullscreen: ['', '.####..####', '.#........#', '.#........#', '.#........#', '', '', '.#........#', '.#........#', '.#........#', '.####..####', ''],
  weight: ['', '.....##', '....#..#', '..########', '..#......#', '.#........#', '.#........#', '#..........#', '#..........#', '############', '', ''],
  flag: ['', '.#', '.#######', '.########', '.#########', '.########', '.#######', '.#', '.#', '.#', '.#', ''],
  users: null, // alias -> join
};
GLYPHS.users = GLYPHS.join;

const glyphCache = new Map();
function glyphPath(rows) {
  let d = '';
  for (let y = 0; y < 12; y++) {
    const row = rows[y] || '';
    let x = 0;
    while (x < 12) {
      if (row[x] === '#') {
        let x1 = x;
        while (x1 < 12 && row[x1] === '#') x1++;
        d += `M${x} ${y}h${x1 - x}v1h${x - x1}z`;
        x = x1;
      } else x++;
    }
  }
  return d;
}
/** Inline SVG pixel glyph (inherits color). Unknown names return ''. */
export function glyph(name, cls = '') {
  const rows = GLYPHS[name];
  if (!rows) return '';
  let d = glyphCache.get(name);
  if (d === undefined) { d = glyphPath(rows); glyphCache.set(name, d); }
  return `<svg class="gly${cls ? ' ' + cls : ''}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}
export const GLYPH_NAMES = Object.keys(GLYPHS);
