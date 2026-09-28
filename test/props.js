// KEFAL COMPANY - visual test bench for procedural props, items and textures.
// Served by the game's Vite dev server at /test/props.html
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TEXTURE_NAMES, getTexture, isAlphaTexture } from '../src/render/textures.js';
import { ITEM_MODEL_IDS, createItemModel } from '../src/models/items.js';
import { PROP_IDS, createProp } from '../src/models/props.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 1000);
camera.position.set(8, 6, 14);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;

const hemi = new THREE.HemisphereLight(0xdde4ff, 0x3a3024, 1.4);
const sun = new THREE.DirectionalLight(0xfff0e0, 1.8);
sun.position.set(6, 12, 8);
scene.add(hemi, sun);
const grid = new THREE.GridHelper(400, 400, 0x4a4a58, 0x2a2a33);
grid.position.y = -0.002;
scene.add(grid);

const world = new THREE.Group();
scene.add(world);

/** @type {{id:string, obj:THREE.Object3D, tris:number, draws:number, label?:THREE.Sprite, box:THREE.Box3}[]} */
let entries = [];
let selected = null;
const helpers = { col: [], anc: [], lights: [], labels: [] };
const animated = []; // { o, base, rot }

// ------------------------------------------------------------------------------ utils
function countTris(obj) {
  let tris = 0, draws = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    draws++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return { tris, draws };
}
function makeLabel(text, sub) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,10,14,0.75)';
  x.fillRect(0, 0, 256, 64);
  x.font = 'bold 22px monospace';
  x.fillStyle = '#f0d070';
  x.textAlign = 'center';
  x.fillText(text, 128, 28);
  if (sub) { x.font = '16px monospace'; x.fillStyle = '#b8b8c0'; x.fillText(sub, 128, 52); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}
function boxLines(c, s, color) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(s[0], s[1], s[2]));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
  l.position.set(c[0], c[1], c[2]);
  l.renderOrder = 5;
  return l;
}
function dot(color, r = 0.05) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  m.renderOrder = 6;
  return m;
}
function anchorList(ud) {
  const out = [];
  for (const [name, v] of Object.entries(ud.anchors || {})) (Array.isArray(v) ? v : [v]).forEach((o) => out.push([name, o]));
  return out;
}

function decorate(entry) {
  const { obj } = entry;
  const ud = obj.userData;
  for (const cl of ud.colliders || []) { const l = boxLines(cl.c, cl.s, 0xff4040); obj.add(l); helpers.col.push(l); }
  for (const [name, a] of anchorList(ud)) {
    const ax = new THREE.AxesHelper(0.35);
    ax.material.depthTest = false; ax.renderOrder = 6;
    a.add(ax); helpers.anc.push(ax);
    if (a.userData.collider) { const cc = a.userData.collider; const l = boxLines(cc.c, cc.s, 0x4090ff); a.add(l); helpers.col.push(l); }
    if (!a.isMesh) animated.push({ o: a, name, base: a.position.clone(), rot: a.rotation.clone() });
  }
  if (ud.blink) animated.push({ o: ud.blink, name: 'blink' });
  for (const L of ud.lights || []) {
    const d = dot(0xffe040, 0.06); d.position.set(...L.p); obj.add(d); helpers.anc.push(d);
    const pl = new THREE.PointLight(L.color, L.intensity * 4, L.distance, 1);
    pl.position.set(...L.p); pl.visible = false; obj.add(pl); helpers.lights.push(pl);
    if (L.blink || L.flicker) animated.push({ o: pl, name: L.blink ? 'blinkLight' : 'flicker', base: L.intensity * 4 });
  }
  if (ud.tip) { const d = dot(0x00ffff, 0.012); ud.tip.add(d); helpers.anc.push(d); }
  if (ud.lightAnchor && ud.light) {
    const L = ud.light;
    let lt;
    if (L.type === 'spot') {
      lt = new THREE.SpotLight(L.color, L.intensity * 4, L.distance, L.angle || 0.5, 0.4, 1);
      const tgt = new THREE.Object3D(); tgt.position.set(0, 0, -1); ud.lightAnchor.add(tgt); lt.target = tgt;
    } else lt = new THREE.PointLight(L.color, L.intensity * 4, L.distance, 1);
    lt.visible = false; ud.lightAnchor.add(lt); helpers.lights.push(lt);
  }
}

// ------------------------------------------------------------------------------ builders
function clearWorld() {
  world.traverse((o) => {
    if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
    if (o.isLineSegments) { o.geometry.dispose(); o.material.dispose(); }
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
  world.clear();
  entries = [];
  animated.length = 0;
  for (const k of Object.keys(helpers)) helpers[k] = [];
  selected = null;
}

function layoutRow(objs, maxRow, gap) {
  let x = 0, z = 0, rowDepth = 0;
  for (const e of objs) {
    const b = new THREE.Box3().setFromObject(e.obj);
    const w = Math.max(0.2, b.max.x - b.min.x), d = Math.max(0.2, b.max.z - b.min.z);
    if (x > 0 && x + w > maxRow) { x = 0; z += rowDepth + gap; rowDepth = 0; }
    e.obj.position.x += x - b.min.x;
    e.obj.position.z += z - b.min.z;
    if (b.min.y < 0) e.obj.position.y -= b.min.y;
    x += w + gap;
    rowDepth = Math.max(rowDepth, d);
    e.obj.updateMatrixWorld(true);
    e.box = new THREE.Box3().setFromObject(e.obj);
  }
}

function build() {
  clearWorld();
  const mode = $('mode').value;
  const seed = Number($('seed').value) || 1;
  const vIn = Number($('variant').value);
  const variant = vIn >= 0 ? vIn : undefined;
  const t0 = performance.now();
  if (mode === 'props') {
    for (const id of PROP_IDS) {
      const obj = createProp(id, { seed, variant });
      if (obj.userData.mount === 'ceiling') {
        // show ceiling props hanging under a small mount plate
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: 0x555566 }));
        const mp = obj.userData.mountPoint || [0, 0, 0];
        plate.position.set(mp[0], mp[1] + 0.01, mp[2]);
        obj.add(plate);
      }
      world.add(obj);
      entries.push({ id, obj, ...countTris(obj) });
    }
    layoutRow(entries, 60, 2.0);
  } else if (mode === 'items') {
    for (const id of ITEM_MODEL_IDS) {
      const obj = createItemModel(id);
      world.add(obj);
      entries.push({ id, obj, ...countTris(obj) });
    }
    layoutRow(entries, 9, 0.5);
  } else {
    const COLS = 12;
    TEXTURE_NAMES.forEach((name, i) => {
      const tex = getTexture(name);
      const w = 1, h = tex ? tex.image.height / tex.image.width : 1;
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: isAlphaTexture(name) ? 0.5 : 0 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const g = new THREE.Group();
      g.add(m);
      m.position.y = h / 2 + 0.05;
      if (isAlphaTexture(name)) {
        const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x505060 }));
        back.position.set(0, h / 2 + 0.05, -0.01);
        g.add(back);
      }
      g.position.set((i % COLS) * 1.3, 0, Math.floor(i / COLS) * 2.2);
      world.add(g);
      entries.push({ id: name, obj: g, tris: 2, draws: 1, box: new THREE.Box3().setFromObject(g) });
    });
  }
  for (const e of entries) {
    if (mode !== 'textures') decorate(e);
    const b = e.box || new THREE.Box3().setFromObject(e.obj);
    const size = b.getSize(new THREE.Vector3());
    const lab = makeLabel(e.id, mode === 'textures' ? '' : `${e.tris} tris / ${e.draws} dc`);
    const s = THREE.MathUtils.clamp(Math.max(size.x, size.y) * 0.35, 0.35, 3);
    lab.scale.set(s, s / 4, 1);
    lab.position.set((b.min.x + b.max.x) / 2, b.max.y + s / 6 + 0.05, (b.min.z + b.max.z) / 2);
    world.add(lab);
    helpers.labels.push(lab);
    e.label = lab;
  }
  applyToggles();
  renderList();
  const all = new THREE.Box3().setFromObject(world);
  frameBox(all, 0.6);
  $('info').textContent = `${mode}: ${entries.length} built in ${(performance.now() - t0).toFixed(0)} ms\nclick an id to focus - double-click a model to focus it`;
}

// ------------------------------------------------------------------------------ UI
function renderList() {
  const f = $('filter').value.trim().toLowerCase();
  const list = $('list');
  list.innerHTML = '';
  for (const e of entries) {
    const vis = !f || e.id.includes(f);
    e.obj.visible = vis;
    if (e.label) e.label.visible = vis && $('optLabels').checked;
    if (!vis) continue;
    const d = document.createElement('div');
    d.innerHTML = `${e.id}<span>${$('mode').value === 'textures' ? '' : e.tris}</span>`;
    if (e === selected) d.classList.add('sel');
    d.onclick = () => focus(e);
    list.appendChild(d);
  }
}
function frameBox(b, k = 1) {
  const c = b.getCenter(new THREE.Vector3());
  const r = Math.max(0.15, b.getSize(new THREE.Vector3()).length() * 0.5);
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(0.55, 0.45, 0.9).normalize().multiplyScalar(r * 2.2 * k + 0.2));
  camera.near = Math.max(0.005, r * 0.01);
  camera.far = Math.max(200, r * 20);
  camera.updateProjectionMatrix();
}
function focus(e) {
  selected = e;
  e.obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(e.obj);
  frameBox(b);
  renderList();
  const ud = e.obj.userData;
  const info = { id: e.id, tris: e.tris, drawCalls: e.draws };
  if (ud.size) info.size = ud.size;
  if (ud.kind) info.kind = ud.kind;
  if (ud.mount) info.mount = ud.mount;
  if (ud.colliders) info.colliders = ud.colliders.length;
  if (ud.anchors) info.anchors = Object.fromEntries(Object.entries(ud.anchors).map(([k, v]) => [k, Array.isArray(v) ? `[${v.length}]` : Object.keys(v.userData).join(',') || '-']));
  if (ud.lights) info.lights = ud.lights;
  if (ud.light) info.light = ud.light;
  for (const k of ['height', 'deckHeight', 'postDepth', 'waterLevel', 'radius', 'topHeight', 'mountPoint', 'suggestedY', 'hangHeight']) if (ud[k] != null) info[k] = ud[k];
  $('info').textContent = JSON.stringify(info, null, 1);
}
function applyToggles() {
  const on = (id) => $(id).checked;
  helpers.col.forEach((h) => (h.visible = on('optCol')));
  helpers.anc.forEach((h) => (h.visible = on('optAnc')));
  helpers.lights.forEach((h) => (h.visible = on('optLights')));
  helpers.labels.forEach((h) => (h.visible = on('optLabels')));
  const night = on('optNight');
  hemi.intensity = night ? 0.06 : 1.4;
  sun.intensity = night ? 0.0 : 1.8;
  scene.background = new THREE.Color(night ? 0x020203 : 0x24242c);
  scene.fog = night ? new THREE.FogExp2(0x020203, 0.03) : null;
  const wire = on('optWire');
  world.traverse((o) => { if (o.isMesh && !o.isSprite && o.material && 'wireframe' in o.material) o.material.wireframe = wire; });
  canvas.classList.toggle('psx', on('optPsx'));
  resize();
  if (!on('optAnim')) for (const a of animated) { if (a.base && a.o.position && a.base.isVector3) a.o.position.copy(a.base); if (a.rot) a.o.rotation.copy(a.rot); if (a.name === 'blink') a.o.visible = true; }
}
for (const id of ['optCol', 'optAnc', 'optLights', 'optNight', 'optPsx', 'optWire', 'optAnim', 'optLabels']) $(id).addEventListener('change', applyToggles);
$('mode').addEventListener('change', build);
$('seed').addEventListener('change', build);
$('variant').addEventListener('change', build);
$('filter').addEventListener('input', renderList);

const ray = new THREE.Raycaster();
canvas.addEventListener('dblclick', (ev) => {
  const r = canvas.getBoundingClientRect();
  const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(p, camera);
  const hit = ray.intersectObjects(world.children, true).find((h) => h.object.isMesh && !h.object.isSprite);
  if (!hit) return;
  let o = hit.object;
  while (o.parent && o.parent !== world) o = o.parent;
  const e = entries.find((en) => en.obj === o);
  if (e) focus(e);
});

// ------------------------------------------------------------------------------ loop
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio($('optPsx').checked ? 0.33 : Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let last = performance.now(), frames = 0, fps = 0, statT = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = (now - last) / 1000;
  last = now;
  frames++; statT += dt;
  controls.update();
  if ($('optAnim').checked) {
    const t = now / 1000, f = (Math.sin(t * 1.3) + 1) / 2;
    for (const a of animated) {
      const o = a.o, ud = o.userData || {};
      if (a.name === 'blink') { o.visible = Math.sin(t * 7) > -0.3; continue; }
      if (a.name === 'blinkLight') { o.intensity = Math.sin(t * Math.PI * 2) > 0 ? a.base : 0; continue; }
      if (a.name === 'flicker') { o.intensity = a.base * (0.75 + Math.random() * 0.35); continue; }
      const axis = ud.axis || 'y';
      if (ud.openAngle != null) o.rotation[axis] = a.rot[axis] + ud.openAngle * f;
      if (ud.openOffset) o.position.set(a.base.x + ud.openOffset[0] * f, a.base.y + ud.openOffset[1] * f, a.base.z + ud.openOffset[2] * f);
      if (ud.activeAngle != null) o.rotation.x = THREE.MathUtils.lerp(ud.restAngle ?? 0, ud.activeAngle, f);
      if (ud.pulledAngle != null) o.rotation.x = THREE.MathUtils.lerp(ud.restAngle ?? 0, ud.pulledAngle, f);
      if (ud.pressDepth) { const k = Math.sin(t * 5) > 0.6 ? ud.pressDepth : 0; if (ud.pressAxis === 'y') o.position.y = a.base.y - k; else o.position.z = a.base.z - k; }
      if (ud.swing) o.rotation.z = Math.sin(t * 2.2) * ud.swing;
      if (a.name === 'wheel') o.rotation.z = t;
    }
  }
  renderer.render(scene, camera);
  if (statT > 0.5) {
    fps = frames / statT; frames = 0; statT = 0;
    const inf = renderer.info.render;
    $('stats').textContent = `fps ${fps.toFixed(0)}\ndraw calls ${inf.calls}\ntriangles ${inf.triangles}\nmodels ${entries.length}`;
  }
}
resize();
build();
requestAnimationFrame(animate);
