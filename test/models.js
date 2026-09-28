// Model viewer for src/models (served by Vite at /test/models.html)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCreatureModel, CREATURE_MODEL_IDS } from '../src/models/creatures.js';
import { createAvatar, createViewModel, SUIT_COLORS, HATS } from '../src/models/avatar.js';
import { countTris } from '../src/models/modelkit.js';

// ------------------------------------------------------------------ state tables
const COMMON = ['idle', 'walk', 'run', 'attack', 'hurt', 'stunned', 'dead'];
const EXTRA = {
  yoinker: ['fly'], lurker: ['sneak', 'flee', 'angry'], mannequin: ['frozen'], sludge: ['calm'],
  spider: ['web'], leech: ['ceiling', 'fall', 'latched'], screamer: ['scream'], hound: ['sniff', 'howl', 'lunge'], giant: ['grab', 'eat'],
};
const OWN = {
  jester: ['box', 'box_walk', 'winding', 'popped', 'run', 'attack', 'hurt', 'stunned', 'dead'],
  sandkefal: ['hidden', 'rumble', 'emerge', 'dead'],
  turret: ['idle', 'alert', 'fire', 'off'],
  mine: ['armed', 'triggered', 'off'],
  kefaldayi: ['idle', 'walk', 'talk'],
  company: ['hidden', 'idle', 'grab'],
  mimic: ['idle', 'walk', 'run', 'attack', 'hurt', 'stunned', 'dead'],
};
const statesFor = (id) => OWN[id] || [...COMMON, ...(EXTRA[id] || [])];
const PROG = { winding: 5, emerge: 7, grab: 3.5 }; // auto-progress loop durations (s)
const NAMES = { jester: 'jester (music box)', company: 'the company', kefaldayi: 'kefaldayi (merchant)', sandkefal: 'sand kefal' };

// ------------------------------------------------------------------ renderer / scene
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BG = new THREE.Color('#0b0c10');
scene.background = BG;
const fog = new THREE.FogExp2('#0b0c10', 0.045);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 500);
camera.position.set(0, 7, 17);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, -4);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight('#b8c4d8', '#2a2418', 1.3);
const sun = new THREE.DirectionalLight('#fff0d8', 1.5);
sun.position.set(6, 12, 8);
scene.add(hemi, sun);
const torch = new THREE.SpotLight('#fff2d0', 60, 40, 0.42, 0.55, 1.4);
torch.position.set(0.3, -0.2, 0);
torch.target.position.set(0, 0, -1);
camera.add(torch, torch.target);
torch.visible = false;

const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: '#1d1b17' }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(300, 300, '#2c2a24', '#24221d');
grid.position.y = 0.002;
scene.add(grid);

// ------------------------------------------------------------------ models
const entries = [];
const labelsEl = document.body;
function addEntry(id, kind, obj, pos) {
  obj.root.position.set(pos[0], pos[1], pos[2]);
  scene.add(obj.root);
  const e = { id, kind, obj, base: pos.slice(), state: kind === 'creature' ? statesFor(id)[0] : 'idle', t: 0, speed: null, progress: 0, autoProg: true, elite: false, flash: 0, tris: countTris(obj.root) };
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.onclick = () => select(e);
  labelsEl.appendChild(lbl);
  e.lbl = lbl;
  entries.push(e);
  return e;
}
const GRID_IDS = ['avatar', 'scuttler', 'yoinker', 'crawler', 'lurker', 'mannequin', 'sludge', 'jester', 'spider', 'leech', 'screamer', 'mimic', 'hound', 'turret', 'mine', 'kefaldayi'];
let avatarEntry = null;
const avatar = createAvatar({ suitColor: '#d9642b', hat: 'none' });
GRID_IDS.forEach((id, i) => {
  const pos = [((i % 6) - 2.5) * 3.6, 0, -Math.floor(i / 6) * 4.2];
  if (id === 'avatar') avatarEntry = addEntry('avatar', 'avatar', avatar, pos);
  else addEntry(id, 'creature', createCreatureModel(id, { seed: i * 17 + 3, suitColor: '#3a6fc0' }), pos);
});
addEntry('giant', 'creature', createCreatureModel('giant', { seed: 5 }), [0, 0, -24]);
addEntry('sandkefal', 'creature', createCreatureModel('sandkefal', { seed: 9 }), [48, 0, -8]);
addEntry('company', 'creature', createCreatureModel('company', { seed: 2 }), [-17, 1.1, -2]);
// counter for The Company (origin = counter opening)
const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 1.1, 0.8), new THREE.MeshLambertMaterial({ color: '#3b3129' }));
counter.position.set(-17, 0.55, -2 + 0.9);
scene.add(counter);
// dummy head for the leech 'latched' preview
const leechE = entries.find((e) => e.id === 'leech');
const dummyHead = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshLambertMaterial({ color: '#777' }));
dummyHead.visible = false;
scene.add(dummyHead);

// test items to check hand attach orientation (forward = -Z, red tip at the front)
function makeTestItem() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.55), new THREE.MeshLambertMaterial({ color: '#9aa0a8' }));
  shaft.position.z = -0.2;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: '#ff3020' }));
  tip.position.z = -0.48;
  const up = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: '#30ff40' }));
  up.position.set(0, 0.06, -0.05);
  g.add(shaft, tip, up);
  return g;
}
const avItem = makeTestItem();
avatar.parts.handR.add(avItem);

// first-person view model inset
const vmCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.01, 200);
vmCam.position.set(0, 1.6, 30);
scene.add(vmCam);
const vm = createViewModel({ suitColor: '#d9642b' });
vmCam.add(vm.root);
const vmItem = makeTestItem();
vm.handR.add(vmItem);

// ------------------------------------------------------------------ UI helpers
const panel = document.getElementById('panel');
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
}
const h2 = (t) => panel.append(el('h2', { textContent: t }));
const row = (...kids) => { const r = el('div', { className: 'row' }, kids); panel.append(r); return r; };
function btn(text, fn, cls = '') { return el('button', { textContent: text, className: cls, onclick: fn }); }
function check(text, val, fn) { const i = el('input', { type: 'checkbox', checked: val, onchange: () => fn(i.checked) }); return el('label', {}, [i, text]); }
function slider(text, min, max, step, val, fn) {
  const out = el('span', { textContent: (+val).toFixed(2) });
  const i = el('input', { type: 'range', min, max, step, value: val, oninput: () => { out.textContent = (+i.value).toFixed(2); fn(+i.value); } });
  return el('label', {}, [text, i, out]);
}
function select(e) {
  sel = e;
  for (const x of entries) x.lbl.classList.toggle('sel', x === e);
  const r = e.obj.radius || 0.5, h = e.obj.height || 1;
  controls.target.set(e.base[0], e.base[1] + Math.min(h, 10) * 0.5, e.base[2]);
  const d = Math.max(3.5, Math.max(h, r * 2) * 1.8);
  camera.position.set(e.base[0] + d * 0.55, e.base[1] + Math.min(h, 10) * 0.6 + d * 0.25, e.base[2] + d);
  if (e.id === 'sandkefal') { controls.target.set(e.base[0], 6, e.base[2]); camera.position.set(e.base[0] + 34, 12, e.base[2] + 10); }
  buildSelPanel();
}
let sel = null;

// ------------------------------------------------------------------ panel
h2('View');
row(check('PSX 320px', false, (v) => { document.body.classList.toggle('psx', v); psx = v; resize(); }),
  check('dark + flashlight', false, (v) => { hemi.intensity = v ? 0.06 : 1.3; sun.intensity = v ? 0 : 1.5; torch.visible = v; }),
  check('fog', false, (v) => { scene.fog = v ? fog : null; }));
row(check('labels', true, (v) => { showLabels = v; }), check('test items', true, (v) => { avItem.visible = vmItem.visible = v; }), check('pause', false, (v) => { paused = v; }));
const focusSel = el('select', { onchange: () => select(entries[+focusSel.value]) }, entries.map((e, i) => el('option', { value: i, textContent: NAMES[e.id] || e.id })));
row('focus:', focusSel);
let psx = false, showLabels = true, paused = false;

h2('All creatures');
row(...COMMON.map((s) => btn(s, () => { for (const e of entries) if (e.kind === 'creature' && statesFor(e.id).includes(s)) { e.state = s; e.t = 0; } buildSelPanel(); })));
row(check('elite (all)', false, (v) => { for (const e of entries) if (e.kind === 'creature') { e.elite = v; e.obj.setElite(v); } }),
  btn('hit flash (all)', () => { for (const e of entries) e.flash = 1; }));

h2('Selected');
const selBox = el('div');
panel.append(selBox);
function buildSelPanel() {
  selBox.innerHTML = '';
  if (!sel) { selBox.append('click a label'); return; }
  const e = sel;
  selBox.append(el('div', { id: 'info', textContent: `${e.id}  tris=${e.tris}  h=${e.obj.height} r=${e.obj.radius}` }));
  if (e.kind === 'avatar') { selBox.append(el('div', { textContent: 'use the Avatar section below' })); return; }
  const r1 = el('div', { className: 'row' });
  for (const s of statesFor(e.id)) r1.append(btn(s, () => { e.state = s; e.t = 0; buildSelPanel(); }, e.state === s ? 'on' : ''));
  selBox.append(r1);
  const spd = slider('speed', 0, 8, 0.1, e.speed ?? 1.5, (v) => { e.speed = v; });
  selBox.append(el('div', { className: 'row' }, [check('default speed', e.speed == null, (v) => { e.speed = v ? null : 1.5; }), spd]));
  selBox.append(el('div', { className: 'row' }, [check('auto progress', e.autoProg, (v) => { e.autoProg = v; }), slider('progress', 0, 1, 0.01, e.progress, (v) => { e.progress = v; e.autoProg = false; })]));
  selBox.append(el('div', { className: 'row' }, [check('elite', e.elite, (v) => { e.elite = v; e.obj.setElite(v); }), btn('hit flash', () => { e.flash = 1; })]));
}

h2('Avatar');
const A = { speed: 0, sprint: false, crouch: false, grounded: true, carry2h: false, holding: true, dead: false, emote: null, climbing: false, lookPitch: 0, swingT: -1, mouth: 0, autoTalk: false };
const moveBtns = row();
const MOVES = { idle: { speed: 0 }, walk: { speed: 1.6 }, sprint: { speed: 5.5, sprint: true }, crouch: { speed: 0, crouch: true }, 'crouch-walk': { speed: 1.0, crouch: true }, airborne: { grounded: false, speed: 2 }, climb: { climbing: true, speed: 1 } };
let move = 'idle';
function drawMoves() {
  moveBtns.innerHTML = '';
  for (const k of Object.keys(MOVES)) moveBtns.append(btn(k, () => { move = k; drawMoves(); }, move === k ? 'on' : ''));
}
drawMoves();
row(check('holding', A.holding, (v) => { A.holding = v; }), check('carry2h', false, (v) => { A.carry2h = v; }), check('dead', false, (v) => { A.dead = v; }), btn('swing', () => { A.swingT = 0; }));
const emoteRow = row();
function drawEmotes() {
  emoteRow.innerHTML = '';
  for (const k of ['none', 'dance', 'wave', 'point', 'sit']) emoteRow.append(btn(k, () => { A.emote = k === 'none' ? null : k; drawEmotes(); }, (A.emote || 'none') === k ? 'on' : ''));
}
drawEmotes();
row(slider('look pitch', -0.8, 0.8, 0.01, 0, (v) => { A.lookPitch = v; }));
row(slider('mouth', 0, 1, 0.01, 0, (v) => { A.mouth = v; A.autoTalk = false; talkChk.querySelector('input').checked = false; }));
const talkChk = check('auto talk (fake voice)', false, (v) => { A.autoTalk = v; });
row(talkChk);
const exprSel = el('select', { onchange: () => avatar.setExpression(exprSel.value) }, ['normal', 'happy', 'scared', 'angry', 'dead'].map((x) => el('option', { value: x, textContent: x })));
const suitSel = el('select', { onchange: () => { const c = SUIT_COLORS.find((s) => s.id === suitSel.value).color; avatar.setSuitColor(c); vm.setSuitColor(c); } }, SUIT_COLORS.map((s) => el('option', { value: s.id, textContent: s.name })));
const hatSel = el('select', { onchange: () => { avatar.setHat(hatSel.value); avatarEntry.tris = countTris(avatar.root); if (sel === avatarEntry) buildSelPanel(); } }, HATS.map((h) => el('option', { value: h.id, textContent: h.name })));
row('expr', exprSel, 'suit', suitSel);
row('hat', hatSel, btn('hit flash', () => { avatarEntry.flash = 1; }));

h2('View model (inset)');
const V = { holding: 'onehand', leftHand: false, sprint: false, moveBob: 0, charging: 0, swingT: -1 };
const holdSel = el('select', { onchange: () => { V.holding = holdSel.value; } }, ['onehand', 'twohand', 'none'].map((x) => el('option', { value: x, textContent: x })));
row('holding', holdSel, check('left hand', false, (v) => { V.leftHand = v; }), check('sprint', false, (v) => { V.sprint = v; }));
row(slider('walk bob', 0, 1, 0.01, 0, (v) => { V.moveBob = v; }));
row(slider('charge', 0, 1, 0.01, 0, (v) => { V.charging = v; }), btn('swing', () => { V.swingT = 0; }));
panel.append(el('div', { id: 'info', textContent: 'test item: grey shaft, red tip = forward (-Z), green = up' }));

// ------------------------------------------------------------------ loop
let W = innerWidth, H = innerHeight;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(psx ? 320 / Math.max(320, W) : Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
select(entries[1]);

const clock = new THREE.Clock();
let time = 0, talkT = 0, talkV = 0, mouthSm = 0;
const mouseD = { x: 0, y: 0 };
addEventListener('pointermove', (ev) => { mouseD.x += ev.movementX || 0; mouseD.y += ev.movementY || 0; });
const v3 = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.1);
  if (paused) dt = 0;
  time += dt;
  controls.update();
  for (const e of entries) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 3.5);
    e.obj.setHitFlash(e.flash);
    if (e.kind !== 'creature') continue;
    if (e.autoProg && PROG[e.state]) e.progress = Math.min(1, (e.t % PROG[e.state]) / (PROG[e.state] * 0.85));
    e.obj.update(dt, { state: e.state, speed: e.speed, t: e.t, time, progress: e.progress });
  }
  // leech preview placement (the engine does this in game)
  if (leechE) {
    const st = leechE.state;
    leechE.obj.root.rotation.z = st === 'ceiling' ? Math.PI : 0;
    leechE.obj.root.position.y = st === 'ceiling' ? 2.6 : st === 'latched' ? 1.72 : st === 'fall' ? 1.2 + Math.sin(time * 3) * 0.6 : 0;
    dummyHead.visible = st === 'latched';
    dummyHead.position.set(leechE.base[0], 1.68, leechE.base[2]);
  }
  // avatar
  const m = MOVES[move];
  if (A.swingT >= 0) { A.swingT += dt / 0.5; if (A.swingT > 1) A.swingT = -1; }
  if (A.autoTalk) {
    talkT -= dt;
    if (talkT <= 0) { talkT = 0.06 + Math.random() * 0.12; talkV = Math.random() < 0.75 ? 0.2 + Math.random() * 0.8 : 0; }
    mouthSm += (talkV - mouthSm) * Math.min(1, dt * 18);
    avatar.setMouth(mouthSm);
  } else avatar.setMouth(A.mouth);
  avatar.update(dt, {
    speed: m.speed || 0, sprint: !!m.sprint, crouch: !!m.crouch, grounded: m.grounded !== false, climbing: !!m.climbing,
    carry2h: A.carry2h, holding: A.holding, dead: A.dead, emote: A.emote, swing: A.swingT >= 0 ? A.swingT : 0, lookPitch: A.lookPitch, time,
  });
  // view model
  if (V.swingT >= 0) { V.swingT += dt / 0.45; if (V.swingT > 1) V.swingT = -1; }
  vm.update(dt, { moveBob: V.moveBob, sprint: V.sprint, swing: V.swingT >= 0 ? V.swingT : 0, charging: V.charging, holding: V.holding, leftHand: V.leftHand, lookDelta: mouseD, time });
  mouseD.x = mouseD.y = 0;
  // labels
  for (const e of entries) {
    const r = e.obj.root;
    v3.set(r.position.x, r.position.y + Math.min(e.obj.height, 9) + 0.35, r.position.z).project(camera);
    const vis = showLabels && v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
    e.lbl.style.display = vis ? '' : 'none';
    if (vis) {
      e.lbl.style.left = ((v3.x + 1) / 2) * W + 'px';
      e.lbl.style.top = ((1 - v3.y) / 2) * H + 'px';
      const txt = `${NAMES[e.id] || e.id} <small>${e.state === 'idle' && e.kind === 'avatar' ? move : e.state} · ${e.tris}▲</small>`;
      if (e.lbl._t !== txt) { e.lbl.innerHTML = txt; e.lbl._t = txt; }
    }
  }
  // render main + view-model inset
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  renderer.clear();
  renderer.render(scene, camera);
  const iw = Math.min(360, W * 0.35), ih = iw * 0.75;
  vmCam.aspect = iw / ih;
  vmCam.updateProjectionMatrix();
  renderer.setScissorTest(true);
  renderer.setScissor(W - iw - 8, 8, iw, ih);
  renderer.setViewport(W - iw - 8, 8, iw, ih);
  renderer.clear();
  renderer.render(scene, vmCam);
  renderer.setScissorTest(false);
}
frame();
console.log('[models] creatures:', CREATURE_MODEL_IDS.join(', '));
