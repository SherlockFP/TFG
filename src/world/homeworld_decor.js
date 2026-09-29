// HOMEWORLD "OFF-GRID CLAIM" (wave 6, home3; docs/wave6/home3.md): the LOOK of the crew's outpost on a dead Company mining rock that the Algorithm keeps trying to
// "stream". Built once by world/homeworld_map.js (one call). Everything is merged / instanced (about 30 draw calls), unlit or vertex-coloured, NO scene lights
// (one pooled emitter for the kitchen fire). Skyline (fogless, hazy-tinted): half-buried Company mascot robot, hijacked broadcast tower with a blinking LIVE eye, a
// Company-logo moon, aurora-like data curtains, strata mesas + a spiral strip-mine road. Outpost (planned in homeworld_decor_plan.js, kept off the build grid):
// scrap fence + lamp strings, container huts with graffiti, antenna array, camp kitchen, memorial wall (names from the case files), trophy totems, laundry line,
// painted crew emblem on the pad. Living: 3 Algorithm drones that turn to watch the crew, wind-blown debris, a faint hum bed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/rng.js';
import { QUALITY } from '../render/quality.js';   // [perf2]
import { t, addTranslations } from '../core/i18n.js';
import { planHomeDecor, EMBLEM } from './homeworld_decor_plan.js';

const TR = {
  'THE ALGORITHM\nIS WATCHING.\nSO WHAT.': 'ALGORITMA\nİZLİYOR.\nNE YANİ.', 'NOT LIVE': 'CANLI DEĞİL', 'SMILE FOR\nTHE CAMERA.\n(NO)': 'KAMERAYA\nGÜLÜMSE.\n(HAYIR)', 'OFF-GRID\nCLAIM 7': 'ŞEBEKE DIŞI\nPARSEL 7',
  "RATIO'D\nBY A ROCK": 'BİR TAŞA\nYENİLDİM', 'THIS FENCE\nHAS NO VIEWERS': 'BU ÇİTİN\nİZLEYİCİSİ YOK', "DON'T FEED\nTHE FEED": "FEED'İ\nBESLEME", "MOM, I'M\nNOT TRENDING": 'ANNE,\nGÜNDEMDE DEĞİLİM',
  'PROPERTY OF\nTHE COMPANY': 'ŞİRKET\nMALIDIR', 'NOT ANYMORE.': 'ARTIK DEĞİL.', 'NO CAMERAS\nIN THE KITCHEN': 'MUTFAKTA\nKAMERA YASAK', 'JAMMER.\nDO NOT LICK.': 'BOZUCU.\nYALAMA.',
  'IN MEMORY OF THE CREW': 'EKİBİN ANISINA', 'gone off-grid. still on the record.': 'şebeke dışına çıktılar. kayıtlarda hâlâ varlar.', 'NOBODY YET.': 'HENÜZ KİMSE YOK.', 'keep it that way.': 'böyle kalsın.', day: 'gün',
  'OFF-GRID CLAIM': 'ŞEBEKE DIŞI PARSEL', 'WE LOVE OUR EMPLOYEES': 'ÇALIŞANLARIMIZI SEVİYORUZ', '*terms apply': '*şartlar geçerlidir', 'THE COMPANY': 'ŞİRKET', LIVE: 'CANLI',
};
const RU = {
  'THE ALGORITHM\nIS WATCHING.\nSO WHAT.': 'АЛГОРИТМ\nСМОТРИТ.\nИ ЧТО.', 'NOT LIVE': 'НЕ В ЭФИРЕ', 'SMILE FOR\nTHE CAMERA.\n(NO)': 'УЛЫБНИСЬ\nКАМЕРЕ.\n(НЕТ)', 'OFF-GRID\nCLAIM 7': 'АВТОНОМНЫЙ\nУЧАСТОК 7',
  "RATIO'D\nBY A ROCK": 'ОТРАТИРОВАН\nКАМНЕМ', 'THIS FENCE\nHAS NO VIEWERS': 'У ЭТОГО ЗАБОРА\nНЕТ ЗРИТЕЛЕЙ', "DON'T FEED\nTHE FEED": 'НЕ КОРМИ\nЛЕНТУ', "MOM, I'M\nNOT TRENDING": 'МАМ, Я\nНЕ В ТРЕНДАХ',
  'PROPERTY OF\nTHE COMPANY': 'СОБСТВЕННОСТЬ\nКОМПАНИИ', 'NOT ANYMORE.': 'УЖЕ НЕТ.', 'NO CAMERAS\nIN THE KITCHEN': 'НА КУХНЕ\nКАМЕР НЕТ', 'JAMMER.\nDO NOT LICK.': 'ГЛУШИЛКА.\nНЕ ЛИЗАТЬ.',
  'IN MEMORY OF THE CREW': 'ПАМЯТИ ЭКИПАЖА', 'gone off-grid. still on the record.': 'ушли из сети. в отчётах остались.', 'NOBODY YET.': 'ПОКА НИКОГО.', 'keep it that way.': 'так и держать.', day: 'день',
  'OFF-GRID CLAIM': 'АВТОНОМНЫЙ УЧАСТОК', 'WE LOVE OUR EMPLOYEES': 'МЫ ЛЮБИМ СОТРУДНИКОВ', '*terms apply': '*применяются условия', 'THE COMPANY': 'КОМПАНИЯ', LIVE: 'ЭФИР',
};
addTranslations(TR, 'tr'); addTranslations(RU, 'ru');

// ---------------------------------------------------------------------------------------------- geometry helpers (one merged mesh per material)
const UB = new THREE.BoxGeometry(1, 1, 1), UC = new THREE.CylinderGeometry(1, 1, 1, 8, 1), UK = new THREE.ConeGeometry(1, 1, 6), US = new THREE.IcosahedronGeometry(1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
const flat = (g) => (g.index ? g.toNonIndexed() : g.clone());
function tint(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
/** push a transformed, tinted copy of a unit geometry into `list` */
function P(list, geo, pos, scl, hex, rot = [0, 0, 0]) {
  const g = flat(geo); g.applyMatrix4(_m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scl[0], scl[1], scl[2])));
  g.deleteAttribute('uv'); list.push(tint(g, hex)); return g;
}
/** thin box from a to b (cables, guy wires, lattice bars) */
function seg(list, a, b, th, hex) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length(); if (len < 1e-3) return;
  const g = flat(UB); g.applyMatrix4(_m.compose(_p.copy(a).add(b).multiplyScalar(0.5), _q.setFromUnitVectors(_z, d.normalize()), _s.set(th, th, len)));
  g.deleteAttribute('uv'); list.push(tint(g, hex));
}
/** sagging cable between two points, returns the polyline */
function sag(a, b, drop, n = 6) { const out = []; for (let i = 0; i <= n; i++) { const k = i / n; out.push(new THREE.Vector3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * drop, a.z + (b.z - a.z) * k)); } return out; }
function cable(list, a, b, drop, th, hex, n = 6) { const pts = sag(a, b, drop, n); for (let i = 0; i < n; i++) seg(list, pts[i], pts[i + 1], th, hex); return pts; }
const merge = (list) => { if (!list.length) return null; for (const g of list) if (g.attributes.uv) g.deleteAttribute('uv'); return mergeGeometries(list, false); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------- canvas textures (low-res, nearest: PSX)
const HAS_DOM = typeof document !== 'undefined';
function canvasTex(w, h, draw, opts = {}) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false;
  if (opts.repeat) tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}
const FONT = "'Impact','Arial Narrow','Haettenschweiler',sans-serif";
function lines(x, text, cx, cy, maxW, size, lh = 1.05) {
  const ls = String(text).split('\n'); let s = size;
  x.font = `${s}px ${FONT}`; while (s > 8 && ls.some((l) => x.measureText(l).width > maxW)) { s -= 1; x.font = `${s}px ${FONT}`; }
  const y0 = cy - ((ls.length - 1) * s * lh) / 2; x.textAlign = 'center'; x.textBaseline = 'middle';
  ls.forEach((l, i) => x.fillText(l, cx, y0 + i * s * lh));
}
const GRAF = [
  ['THE ALGORITHM\nIS WATCHING.\nSO WHAT.', '#ff2ad8'], ['NOT LIVE', '#ffe040'], ['SMILE FOR\nTHE CAMERA.\n(NO)', '#2af4ff'], ['OFF-GRID\nCLAIM 7', '#ffffff'], ["RATIO'D\nBY A ROCK", '#7dff8a'],
  ['THIS FENCE\nHAS NO VIEWERS', '#ffb020'], ["DON'T FEED\nTHE FEED", '#ff5a3a'], ["MOM, I'M\nNOT TRENDING", '#d8b8ff'], ['PROPERTY OF\nTHE COMPANY', '#9aa0a8'], ['NOT ANYMORE.', '#ff2ad8'],
  ['NO CAMERAS\nIN THE KITCHEN', '#2af4ff'], ['JAMMER.\nDO NOT LICK.', '#ffe040'],
];
function grafAtlas() {
  return canvasTex(1024, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    GRAF.forEach(([txt, col], i) => {
      const cx = (i % 4) * 256 + 128, cy = Math.floor(i / 4) * 128 + 64;
      x.save(); x.translate(cx, cy); x.rotate(i === 8 ? 0 : ((i * 37) % 9 - 4) * 0.012); x.translate(-cx, -cy);
      x.fillStyle = col; x.shadowColor = col; x.shadowBlur = i === 8 ? 0 : 5;
      if (i === 8) { x.globalAlpha = 0.85; x.strokeStyle = col; x.lineWidth = 3; x.strokeRect(cx - 118, cy - 52, 236, 104); }
      lines(x, t(txt), cx, cy, 214, 40); x.restore();
      if (i === 1) { x.strokeStyle = '#ff2a2a'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx - 100, cy + 30); x.lineTo(cx + 100, cy - 30); x.stroke(); }   // slash through the eye motif: not live
    });
  });
}
function eyeShape(x, cx, cy, rw, rh, iris, pupil) {   // the Algorithm's eye: almond + iris + pupil
  x.fillStyle = '#0a0410'; x.beginPath(); x.moveTo(cx - rw, cy); x.quadraticCurveTo(cx, cy - rh * 1.6, cx + rw, cy); x.quadraticCurveTo(cx, cy + rh * 1.6, cx - rw, cy); x.fill();
  x.fillStyle = iris; x.beginPath(); x.arc(cx, cy, rh * 0.78, 0, 7); x.fill(); x.fillStyle = pupil; x.beginPath(); x.arc(cx, cy, rh * 0.36, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.fillRect(cx - rh * 0.3, cy - rh * 0.35, rh * 0.16, rh * 0.16);
}
function emblemTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#16181c'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill();
    x.strokeStyle = '#e8b820'; x.lineWidth = 10; x.setLineDash([26, 16]); x.beginPath(); x.arc(128, 128, 116, 0, 7); x.stroke(); x.setLineDash([]);
    x.strokeStyle = '#2af4ff'; x.lineWidth = 4; x.beginPath(); x.arc(128, 128, 96, 0, 7); x.stroke();
    eyeShape(x, 128, 112, 68, 30, '#ff2ad8', '#100016');
    x.strokeStyle = '#ffe040'; x.lineWidth = 16; x.lineCap = 'round'; x.beginPath(); x.moveTo(52, 190); x.lineTo(204, 40); x.stroke();   // off-grid slash
    x.fillStyle = '#f0e8d0'; lines(x, t('OFF-GRID CLAIM'), 128, 205, 170, 26);
  });
}
function memorialTex(names) {
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#25272c'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#8a8f96'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#e8b820'; for (let i = 0; i < 24; i++) if (i % 2 === 0) x.fillRect(12 + i * 20.4, 12, 10, 8);
    x.fillStyle = '#f0e8d0'; lines(x, t('IN MEMORY OF THE CREW'), w / 2, 46, 440, 34);
    x.fillStyle = '#7d8590'; x.font = `18px ${FONT}`; x.textAlign = 'center'; x.fillText(t('gone off-grid. still on the record.'), w / 2, 78);
    if (!names.length) { x.fillStyle = '#c8ccd2'; lines(x, t('NOBODY YET.'), w / 2, 150, 300, 40); x.fillStyle = '#7d8590'; x.font = `20px ${FONT}`; x.fillText(t('keep it that way.'), w / 2, 196); return; }
    names.slice(0, 8).forEach((n, i) => {
      const col = i % 2, row = Math.floor(i / 2), X = 34 + col * 236, Y = 118 + row * 32;
      x.textAlign = 'left'; x.fillStyle = '#e8e4d8'; x.font = `24px ${FONT}`; let s = n.name.toUpperCase().slice(0, 14); x.fillText(s, X, Y);
      x.textAlign = 'right'; x.fillStyle = '#ff5a4a'; x.font = `16px ${FONT}`; x.fillText(`${t('day')} ${n.day}`, X + 206, Y);
    });
  });
}
function faceTex() {   // the Company mascot: smiling screen face, one dead eye (X), one live camera
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#c8bda0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8b820'; for (let i = 0; i < 16; i++) x.fillRect(i * 32, 0, 16, 14), x.fillRect(i * 32 + 16, h - 14, 16, 14);
    x.fillStyle = '#16181c'; x.fillRect(24, 34, w - 48, h - 92);
    x.fillStyle = '#5a5a60'; x.fillRect(30, 40, w - 60, 3);
    x.strokeStyle = '#ff5a4a'; x.lineWidth = 16; x.lineCap = 'round'; x.beginPath(); x.moveTo(90, 66); x.lineTo(160, 126); x.moveTo(160, 66); x.lineTo(90, 126); x.stroke();   // dead eye
    x.fillStyle = '#100016'; x.beginPath(); x.arc(370, 96, 42, 0, 7); x.fill(); x.fillStyle = '#ff2ad8'; x.beginPath(); x.arc(370, 96, 30, 0, 7); x.fill(); x.fillStyle = '#100016'; x.beginPath(); x.arc(370, 96, 13, 0, 7); x.fill();   // live cam
    x.strokeStyle = '#e8e4d8'; x.lineWidth = 12; x.beginPath(); x.arc(256, 108, 92, 0.25, Math.PI - 0.25); x.stroke();   // the smile
    x.fillStyle = '#16181c'; x.fillRect(24, h - 52, w - 48, 34); x.fillStyle = '#ffe040'; lines(x, t('WE LOVE OUR EMPLOYEES'), w / 2, h - 36, 400, 24); x.fillStyle = '#8a8f96'; x.font = `13px ${FONT}`; x.textAlign = 'right'; x.fillText(t('*terms apply'), w - 28, h - 22);
    x.globalAlpha = 0.35; x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.moveTo(300, 20); x.lineTo(330, 100); x.lineTo(310, 140); x.lineTo(350, 230); x.stroke(); x.globalAlpha = 1;   // crack
  });
}
function towerEyeTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const gr = x.createRadialGradient(128, 118, 10, 128, 118, 124); gr.addColorStop(0, 'rgba(255,42,216,0.85)'); gr.addColorStop(0.6, 'rgba(120,10,110,0.55)'); gr.addColorStop(1, 'rgba(60,0,60,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#e8e4d8'; x.lineWidth = 8; x.beginPath(); x.arc(128, 118, 100, 0, 7); x.stroke();
    eyeShape(x, 128, 118, 84, 40, '#2af4ff', '#08040c');
    x.fillStyle = '#e02020'; x.fillRect(84, 208, 88, 32); x.fillStyle = '#fff'; lines(x, t('LIVE'), 128, 225, 76, 26);
  });
}
function moonTex() {
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#8c8898'; x.fillRect(0, 0, w, h);
    const r = new RNG(77); for (let i = 0; i < 90; i++) { const cx = r.float(0, w), cy = r.float(0, h), rr = r.float(4, 22); x.fillStyle = `rgba(60,55,75,${r.float(0.25, 0.6)})`; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill(); x.fillStyle = 'rgba(190,185,205,0.35)'; x.beginPath(); x.arc(cx - rr * 0.25, cy - rr * 0.25, rr * 0.7, 0, 7); x.fill(); }
    x.save(); x.translate(w / 2, h / 2); x.fillStyle = '#e07a1e'; x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; x.lineTo(Math.cos(a) * 66, Math.sin(a) * 66); } x.closePath(); x.fill();   // corporate hexagon
    x.fillStyle = '#16181c'; x.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; x.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); } x.closePath(); x.fill();
    x.fillStyle = '#e07a1e'; x.font = `64px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('C', 0, 4); x.restore();
    x.fillStyle = '#16181c'; lines(x, t('THE COMPANY'), w / 2, h / 2 + 88, 200, 18);
  });
}
function auroraTex() {
  return canvasTex(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h); const r = new RNG(5);
    for (let i = 0; i < 64; i++) {   // vertical data streaks with bright dashes travelling up them
      const cx = i * 4 + 2, a = r.float(0.25, 0.9), g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, `rgba(255,255,255,${a})`); g.addColorStop(0.8, `rgba(255,255,255,${a * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(cx - 1, 0, r.chance(0.3) ? 3 : 2, h);
      for (let k = 0; k < 3; k++) { x.fillStyle = 'rgba(255,255,255,0.95)'; x.fillRect(cx - 1, r.float(40, 220), 3, r.int(3, 9)); }
    }
  }, { repeat: true });
}
const glowTex = () => canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });

// strata colours by height: layered dead-mine rock, violet / rust / ochre
const STRATA = [0x5a4a5e, 0x6a4a44, 0x7a5c48, 0x4e4458, 0x8a6a4a, 0x5e5060];
function strata(g, y0 = 0, band = 6.5, dim = 1) {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const y = p.getY(i) + y0, k = Math.floor(y / band + Math.sin(p.getX(i) * 0.05 + p.getZ(i) * 0.04) * 0.6); c.setHex(STRATA[((k % STRATA.length) + STRATA.length) % STRATA.length]).multiplyScalar(dim); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}

// ---------------------------------------------------------------------------------------------- the builder
/** env: { HOME_Y, LAYER, flatLayer, HALF, add(x,y,z,hx,hy,hz) -> collider, lightPool, profile, dispose lists }. Returns { group, items, update(dt, game), dispose() }. */
export function buildHomeDecor(seed, env) {
  const { HOME_Y, LAYER, flatLayer, HALF, add, lightPool, profile } = env;
  const rng = new RNG(((seed | 0) ^ 0x0ff91d) >>> 0), plan = planHomeDecor(seed, HALF);
  const group = new THREE.Group(); group.name = 'homeDecor';
  const geos = [], mats = [], texs = [], emitters = [];
  const own = (m) => { mats.push(m); return m; };
  const meshOf = (list, mat, opts = {}) => { const g = merge(list); if (!g) return null; geos.push(g); const m = new THREE.Mesh(g, mat); Object.assign(m, opts); group.add(m); return m; };
  const Y = HOME_Y, FAR = -70, HAZE = new THREE.Color(0x4a3868);
  const hazy = (hex, k = 0.45) => new THREE.Color(hex).lerp(HAZE, k).getHex();
  const solid = [], glow = [], lampA = [], lampB = [], flame = [], candle = [], beacon = [], led = [];
  const onGround = (y = 0) => Y + y;

  // ================================================================= pad emblem + graffiti atlas + memorial data
  const tEmb = emblemTex(); if (tEmb) texs.push(tEmb);
  if (tEmb) {
    const g = new THREE.CircleGeometry(EMBLEM.r, 40); g.rotateX(-Math.PI / 2); geos.push(g);
    const m = own(flatLayer(new THREE.MeshBasicMaterial({ map: tEmb, transparent: true, color: 0xe0e0e0 }), LAYER.decal)); const mesh = new THREE.Mesh(g, m); mesh.position.set(EMBLEM.x, Y + LAYER.decal, EMBLEM.z); mesh.rotation.y = Math.PI; group.add(mesh);
  }
  const grafPlanes = [], atlas = grafAtlas(); if (atlas) texs.push(atlas);
  const graf = (slot, x, y, z, ry, w = 2.3) => {
    const g = new THREE.PlaneGeometry(w, w / 2), uv = g.attributes.uv, u0 = (slot % 4) / 4, v0 = 1 - (Math.floor(slot / 4) + 1) / 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v0 + uv.getY(i) / 4);
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1))); grafPlanes.push(g);
  };
  const cases = profile && Array.isArray(profile.caseFiles) ? profile.caseFiles : [], dead = [], seen = new Set();
  for (const c of cases) for (const d of c.deaths || []) { const k = String(d.name || '').trim(); if (k && !seen.has(k)) { seen.add(k); dead.push({ name: k, day: c.day || '?' }); } }

  // ================================================================= outpost pieces
  const cols = [0x8a4a2e, 0x2f6a6a, 0xb8892e, 0x6a6e78, 0xd8cdb0];
  const fenceCol = [0x8a4a2e, 0x4a7a72, 0xa88a3a, 0x70747e, 0xc8bea0];
  const posts = [];
  for (const it of plan) {
    if (it.kind === 'fence') {
      const h = it.h, w = it.along ? [3, h, 0.08] : [0.08, h, 3], c = fenceCol[it.tone];
      P(solid, UB, [it.x, onGround(h / 2), it.z], w, c, [0, 0, it.tilt]);
      P(solid, UB, [it.x, onGround(h + 0.05), it.z], it.along ? [3, 0.06, 0.06] : [0.06, 0.06, 3], 0x2a2a30);
      const px = it.along ? it.x - 1.5 : it.x, pz = it.along ? it.z : it.z - 1.5;
      P(solid, UB, [px, onGround((h + 0.5) / 2), pz], [0.16, h + 0.5, 0.16], 0x2a2a30);
      posts.push({ p: V3(px, onGround(2.35), pz), q: V3(it.along ? px + 3 : px, onGround(2.35), it.along ? pz : pz + 3), col: it.tone });
    }
  }
  // lamp strings along the fence (two alternating groups so they chase) + 3 salvaged posts near the kitchen
  const bulb = (list, p, hex) => P(list, UB, [p.x, p.y - 0.1, p.z], [0.15, 0.2, 0.15], hex);
  const BULB = [0xffc060, 0x2af4ff, 0xff4ad0, 0xffe080];
  posts.forEach((s, i) => { if (i % 2) return; const pts = cable(solid, s.p, s.q, 0.3, 0.03, 0x18181c, 4); pts.forEach((p, k) => { if (k > 0 && k < 4) bulb((k + i) % 2 ? lampA : lampB, p, BULB[(k + i) % 4]); }); });

  for (const it of plan) {
    if (!it.solid) continue;
    const cx = it.x, cz = it.z;
    if (it.kind === 'hut') {   // two stacked shipping containers
      const ry = it.rot * Math.PI / 2, L = 6.1, W = 2.44, H = 2.6, loc = (lx, ly, lz) => [cx + (it.rot ? lz : lx), onGround(ly), cz + (it.rot ? -lx : lz)], body = it.rot ? 0x4a7a72 : 0x8a4a2e, top = it.rot ? 0xa88a3a : 0x4a7a72;
      P(solid, UB, loc(0, H / 2, 0), [L, H, W], body, [0, ry, 0]); P(solid, UB, loc(0.7, H * 1.5 + 0.02, 0.15), [L * 0.7, H, W], top, [0, ry + 0.05, 0]);
      for (let k = -5; k <= 5; k++) for (const s of [-1, 1]) { P(solid, UB, loc(k * 0.5, H / 2, s * (W / 2 + 0.02)), [0.07, H - 0.12, 0.05], 0x2a2a30, [0, ry, 0]); }
      P(solid, UB, loc(L / 2 + 0.03, 1.2, 0), [0.06, 2.2, W - 0.3], 0x24262c, [0, ry, 0]); P(solid, UB, loc(L / 2 + 0.09, 1.2, 0), [0.05, 0.1, W - 0.5], 0xb8b8c0, [0, ry, 0]);
      P(glow, UB, loc(-1.4, 1.5, W / 2 + 0.05), [1.2, 0.75, 0.04], 0xffc060, [0, ry, 0]); P(solid, UB, loc(-1.4, 2.0, W / 2 + 0.4), [1.5, 0.05, 0.8], 0x3a6a8a, [0.5, ry, 0]);
      P(solid, UB, loc(-1.2, H * 2 + 0.25, 0), [0.9, 0.5, 0.7], 0xb8b8c0, [0, ry, 0]); P(solid, UC, loc(1.8, H * 2 + 0.5, -0.3), [0.12, 1.0, 0.12], 0x2a2a30, [0, ry, 0]);
      P(solid, UB, loc(L / 2 + 0.7, 0.4, -0.6), [0.9, 0.8, 0.9], 0x7a5a3a, [0, ry + 0.2, 0]); P(solid, UC, loc(L / 2 + 0.7, 0.5, 0.7), [0.4, 1.0, 0.4], 0x6a3a2e, [0, ry, 0]);
      if (it.rot === 0) { graf(8, ...loc(-1.2, 1.9, W / 2 + 0.04), 0, 2.2); graf(9, ...loc(1.1, 0.9, W / 2 + 0.04), 0, 1.8); graf(0, ...loc(1.2, 1.7, -W / 2 - 0.04), Math.PI, 2.6); }
      else { graf(3, ...loc(1.0, 1.6, W / 2 + 0.04), ry, 2.4); graf(1, ...loc(-1.4, 1.0, W / 2 + 0.04), ry, 1.9); graf(7, ...loc(0.3, 1.5, -W / 2 - 0.04), ry + Math.PI, 2.3); }
      add(cx, onGround(H), cz, it.hx - 0.1, H, it.hz - 0.1);
    } else if (it.kind === 'mast') {   // 16 m antenna mast + jammer dishes wrapped in foil
      const H = 16, legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], w = (h) => 0.95 - 0.5 * (h / H), N = 8;
      for (let i = 0; i < N; i++) {
        const h0 = (i / N) * H, h1 = ((i + 1) / N) * H;
        for (let k = 0; k < 4; k++) { const [sx, sz] = legs[k], [tx, tz] = legs[(k + 1) % 4]; seg(solid, V3(cx + sx * w(h0), onGround(h0), cz + sz * w(h0)), V3(cx + sx * w(h1), onGround(h1), cz + sz * w(h1)), 0.12, 0x6a6e78);
          seg(solid, V3(cx + sx * w(h1), onGround(h1), cz + sz * w(h1)), V3(cx + tx * w(h1), onGround(h1), cz + tz * w(h1)), 0.06, 0x4a4e58);
          seg(solid, V3(cx + sx * w(h0), onGround(h0), cz + sz * w(h0)), V3(cx + tx * w(h1), onGround(h1), cz + tz * w(h1)), 0.05, 0x4a4e58); }
      }
      P(solid, UB, [cx, onGround(H + 0.4), cz], [0.7, 0.5, 0.7], 0x2a2a30); P(solid, UC, [cx, onGround(H + 2), cz], [0.05, 3.2, 0.05], 0x8a8f96);
      P(beacon, UB, [cx, onGround(H + 3.7), cz], [0.35, 0.35, 0.35], 0xff3020); for (let k = 0; k < 4; k++) P(led, UB, [cx + (k - 1.5) * 0.25, onGround(1.6), cz + 1.2], [0.12, 0.12, 0.05], k % 2 ? 0x2af4ff : 0x7dff8a);
      const anchors = [[-4, 0], [0, -4], [-3, -3]];
      for (const [ax, az] of anchors) { seg(solid, V3(cx, onGround(H - 1), cz), V3(cx + ax, onGround(0.1), cz + az), 0.03, 0x18181c); P(solid, UB, [cx + ax, onGround(0.3), cz + az], [0.2, 0.6, 0.2], 0x2a2a30); }
      [[-3.3, 2.6, 0.9], [3.1, 3.0, -0.6], [-2.4, -2.8, 2.2], [1.6, -3.5, -1.2]].forEach(([dx, dz, tilt], i) => {
        const foil = i === 1, px = cx + Math.max(-3.4, Math.min(3.4, dx)), pz = cz + dz * 0.8;
        P(solid, UB, [px, onGround(0.8), pz], [0.16, 1.6, 0.16], 0x4a4e58);
        P(solid, UC, [px, onGround(1.9), pz], [0.13, 0.5, 0.13], 0x2a2a30, [0.9, dz > 0 ? 3.14 : 0, 0]);
        const dish = new THREE.CylinderGeometry(1.35, 0.2, 0.55, 10, 1, true); P(solid, dish, [px, onGround(1.9), pz], [1, 1, 1], foil ? 0xc0c8d4 : 0xd8d4c8, [-0.95 - tilt * 0.1, i * 1.3, 0]); dish.dispose();
      });
      graf(11, cx + 3.2, onGround(1.05), cz + 2.6 + 0.9, 0, 1.4);
      add(cx, onGround(2), cz, 0.9, 2, 0.9);
    } else if (it.kind === 'kitchen') {
      const ax = 3.1, az = 2.6;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(solid, UB, [cx + sx * ax, onGround(1.4), cz + sz * az], [0.14, 2.8, 0.14], 0x4a4e58);
      P(solid, UB, [cx, onGround(2.85), cz], [ax * 2 + 0.6, 0.06, az * 2 + 0.5], 0x3a6a8a, [0.1, 0, 0.03]); P(solid, UB, [cx + 1.2, onGround(2.9), cz - 0.6], [2.2, 0.05, 2.0], 0x8a4a2e, [0.1, 0, 0.03]);
      P(solid, UB, [cx - 1.1, onGround(0.85), cz + 0.2], [2.4, 0.1, 0.95], 0x8a6a44); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(solid, UB, [cx - 1.1 + sx * 1.0, onGround(0.4), cz + 0.2 + sz * 0.35], [0.1, 0.8, 0.1], 0x5a4030);
      P(solid, UC, [cx + 1.6, onGround(0.5), cz - 1.0], [0.5, 1.0, 0.5], 0x2a2a30); P(solid, UC, [cx + 1.6, onGround(1.15), cz - 1.0], [0.36, 0.3, 0.36], 0xb8b8c0);
      for (let k = 0; k < 3; k++) P(flame, UK, [cx + 1.6 + (k - 1) * 0.18, onGround(1.42), cz - 1.0], [0.16, 0.5, 0.16], k === 1 ? 0xffd040 : 0xff7a20);
      for (const [sx, sz] of [[-1.6, 1.4], [-0.4, 1.5], [-2.6, -0.6], [0.3, -0.9]]) P(solid, UC, [cx + sx, onGround(0.28), cz + sz], [0.32, 0.56, 0.32], 0x8a4a2e);
      P(solid, UB, [cx - 3.6 + 0.8, onGround(0.4), cz + 3.4], [1.1, 0.8, 0.65], 0xd8dcd8); P(solid, UB, [cx - 3.6 + 0.8, onGround(0.85), cz + 3.4], [1.16, 0.08, 0.7], 0x4a7a72);
      for (let k = 0; k < 3; k++) P(solid, UB, [cx + 3.9, onGround(0.3 + k * 0.6), cz + 3.3], [0.8, 0.55, 0.7], [0x7a5a3a, 0x8a6a44, 0x6a4a30][k], [0, k * 0.15, 0]);
      for (let k = 0; k < 4; k++) P(solid, UC, [cx - 2.2 + k * 0.8, onGround(2.5), cz - 1.6], [0.14, 0.03, 0.14], 0xb8b8c0, [1.3, 0, 0.3]);
      const s0 = V3(cx - ax, onGround(2.55), cz - az), s1 = V3(cx + ax, onGround(2.55), cz - az), s2 = V3(cx + ax, onGround(2.55), cz + az);
      for (const [a, b, off] of [[s0, s1, 0], [s1, s2, 1]]) cable(solid, a, b, 0.35, 0.03, 0x18181c, 6).forEach((p, k) => { if (k > 0 && k < 6) bulb((k + off) % 2 ? lampA : lampB, p, BULB[(k + off) % 4]); });
      graf(10, cx + ax + 0.05, onGround(1.55), cz - 1.6, -Math.PI / 2, 1.6);
      add(cx - 1.1, onGround(0.5), cz + 0.2, 1.3, 0.5, 0.55); add(cx + 1.6, onGround(0.7), cz - 1.0, 0.5, 0.7, 0.5);
      env.fire = { x: cx + 1.6, y: onGround(1.7), z: cz - 1.0 };
    } else if (it.kind === 'memorial') {
      const wz = cz + 1.3;
      P(solid, UB, [cx, onGround(0.15), cz], [7.2, 0.3, 4.2], 0x50545c); P(solid, UB, [cx, onGround(1.6), wz], [6.8, 2.6, 0.3], 0x3a3d44); P(solid, UB, [cx, onGround(3.0), wz], [7.0, 0.2, 0.5], 0xe8b820);
      for (const sx of [-1, 1]) P(solid, UB, [cx + sx * 3.5, onGround(1.4), wz], [0.25, 2.8, 0.45], 0x2a2a30);
      for (let k = 0; k < 6; k++) {   // rebar crosses with hard hats + candles + flowers
        const x = cx - 2.75 + k * 1.1, z = cz - 0.5 + (k % 2) * 0.25;
        P(solid, UB, [x, onGround(0.9), z], [0.06, 1.2, 0.06], 0x8a4a2e); P(solid, UB, [x, onGround(1.2), z], [0.55, 0.06, 0.06], 0x8a4a2e, [0, 0, (k - 2.5) * 0.04]);
        P(solid, US, [x, onGround(1.62), z], [0.22, 0.13, 0.22], k === 2 ? 0xff7a20 : 0xe8c020);
        P(candle, UC, [x + 0.35, onGround(0.42), z + 0.4], [0.05, 0.16, 0.05], 0xffc870); P(solid, UB, [x - 0.3, onGround(0.36), z + 0.45], [0.16, 0.12, 0.16], [0xff4ad0, 0x2af4ff, 0xffe040, 0xffffff][k % 4]);
      }
      add(cx, onGround(1.5), wz, 3.6, 1.5, 0.35);
      env.memorial = { x: cx, y: onGround(1.75), z: wz - 0.17, w: 6.4, h: 3.2 };
    } else if (it.kind === 'totem') {
      const hgt = rng.float(0.8, 1.3), ry = rng.float(0, 3);
      P(solid, UK, [cx, onGround(0.35), cz], [1.1, 0.7, 1.1], 0x5a5058);
      const stack = [0x8a4a2e, 0x4a7a72, 0x6a6e78, 0xa88a3a];
      for (let k = 0; k < 3; k++) P(solid, UC, [cx + rng.float(-0.06, 0.06), onGround(0.9 + k * 0.8 * hgt), cz], [0.5 - k * 0.05, 0.8 * hgt, 0.5 - k * 0.05], stack[(k + Math.floor(it.x)) % 4 | 0], [0, ry + k, 0]);
      const ty = onGround(0.9 + 3 * 0.8 * hgt + 0.35);
      P(solid, UB, [cx, ty, cz], [1.0, 0.75, 0.6], 0x2a2a30, [0, ry, 0]); P(glow, UB, [cx + Math.sin(ry) * 0.31, ty, cz + Math.cos(ry) * 0.31], [0.78, 0.52, 0.04], 0x2a7a3a, [0, ry, 0]);
      for (const s of [-1, 1]) { P(solid, UK, [cx + s * 0.62 * Math.cos(ry), ty + 0.55, cz - s * 0.62 * Math.sin(ry)], [0.16, 0.7, 0.16], 0xe8e0c8, [0, 0, -s * 0.45]); P(solid, UB, [cx + s * 0.7, onGround(1.6 + hgt * 0.4), cz + s * 0.3], [0.05, 0.9, 0.05], 0x4a4e58); P(solid, US, [cx + s * 0.7, onGround(1.05 + hgt * 0.4), cz + s * 0.3], [0.2, 0.2, 0.2], 0xe8e0c8); }
      add(cx, onGround(2), cz, 0.7, 2.2, 0.7);
    } else if (it.kind === 'laundry') {
      const z0 = cz - 6.2, z1 = cz + 6.2;
      for (const z of [z0, z1]) P(solid, UB, [cx, onGround(1.5), z], [0.14, 3.0, 0.14], 0x4a4e58);
      env.laundry = { pts: cable(solid, V3(cx, onGround(2.85), z0), V3(cx, onGround(2.85), z1), 0.35, 0.03, 0x18181c, 8), x: cx };
      add(cx, onGround(1.5), z0, 0.2, 1.5, 0.2); add(cx, onGround(1.5), z1, 0.2, 1.5, 0.2);
    } else if (it.kind === 'scrapheap') {
      for (let k = 0; k < 15; k++) {
        const dx = rng.float(-it.hx * 0.8, it.hx * 0.8), dz = rng.float(-it.hz * 0.8, it.hz * 0.8), sc = rng.float(0.4, 1.3), hh = Math.max(0, 1 - (Math.abs(dx) / it.hx + Math.abs(dz) / it.hz) * 0.55);
        const g = rng.pick ? rng.pick([UB, UC, UK]) : UB; P(solid, g, [cx + dx, onGround(sc * 0.4 + hh * 1.2), cz + dz], [sc, sc * rng.float(0.5, 1.3), sc * rng.float(0.6, 1.2)], rng.pick ? rng.pick([0x8a4a2e, 0x6a6e78, 0x4a7a72, 0x50545c, 0xa88a3a]) : 0x6a6e78, [rng.float(0, 1), rng.float(0, 3), rng.float(0, 1)]);
      }
      add(cx, onGround(1.0), cz, it.hx * 0.7, 1.0, it.hz * 0.7);
    }
  }
  // graffiti planes (one mesh, one atlas)
  if (grafPlanes.length && atlas) {
    const gm = own(flatLayer(new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false }), LAYER.decal));
    const gmesh = new THREE.Mesh(mergeGeometries(grafPlanes.map(flat), false), gm); geos.push(gmesh.geometry); group.add(gmesh); grafPlanes.forEach((g) => g.dispose());
  }
  // memorial plaque
  const memTex = memorialTex(dead);
  if (memTex && env.memorial) {
    texs.push(memTex); const M = env.memorial, g = new THREE.PlaneGeometry(M.w * 0.94, M.h * 0.94); geos.push(g);
    const mm = own(flatLayer(new THREE.MeshLambertMaterial({ map: memTex }), LAYER.decal)); const mesh = new THREE.Mesh(g, mm); mesh.position.set(M.x, M.y - 0.3, M.z); mesh.rotation.y = Math.PI; group.add(mesh);
  }

  // ================================================================= solid + glow + blink meshes
  const solidMat = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  meshOf(solid, solidMat);
  const glowMat = own(new THREE.MeshBasicMaterial({ vertexColors: true })); meshOf(glow, glowMat);
  const lampMatA = own(new THREE.MeshBasicMaterial({ vertexColors: true })), lampMatB = own(new THREE.MeshBasicMaterial({ vertexColors: true }));
  meshOf(lampA, lampMatA); meshOf(lampB, lampMatB);
  const flameMat = own(new THREE.MeshBasicMaterial({ vertexColors: true })), flameMesh = meshOf(flame, flameMat);
  const candleMat = own(new THREE.MeshBasicMaterial({ vertexColors: true })); meshOf(candle, candleMat);
  const beaconMat = own(new THREE.MeshBasicMaterial({ vertexColors: true })), ledMat = own(new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (env.fire && lightPool) { const em = { pos: new THREE.Vector3(env.fire.x, env.fire.y, env.fire.z), color: 0xff8a3a, intensity: 0.9, distance: 11, group: 'outdoor' }; emitters.push(em); lightPool.add(em); }

  // ================================================================= laundry cloth (instanced, swaying) + wind debris (instanced)
  let cloth = null, debris = null;
  const dummy = new THREE.Object3D(), clothN = 10, debrisN = 26, D = { x: new Float32Array(debrisN), y: new Float32Array(debrisN), z: new Float32Array(debrisN), sp: new Float32Array(debrisN), ph: new Float32Array(debrisN) };
  if (env.laundry) {
    const g = new THREE.PlaneGeometry(0.75, 1.0); g.rotateY(Math.PI / 2); g.translate(0, -0.5, 0); geos.push(g);
    const m = own(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })); cloth = new THREE.InstancedMesh(g, m, clothN); cloth.frustumCulled = false;
    const cc = [0xe8742a, 0xe8742a, 0xd8d0c0, 0x4a7a72, 0xe8742a, 0x2a2a30, 0xd8b840, 0xd8d0c0, 0xe8742a, 0x7a3a5a];
    for (let i = 0; i < clothN; i++) cloth.setColorAt(i, new THREE.Color(cc[i])); cloth.count = Math.max(4, Math.round(clothN * QUALITY.decor)); group.add(cloth);
  }
  {
    const g = new THREE.PlaneGeometry(0.3, 0.3); geos.push(g); const m = own(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })); debris = new THREE.InstancedMesh(g, m, debrisN); debris.frustumCulled = false;
    for (let i = 0; i < debrisN; i++) { D.x[i] = rng.float(-HALF + 4, HALF - 4); D.z[i] = rng.float(-HALF + 4, HALF - 4); D.y[i] = rng.float(0.3, 2.6); D.sp[i] = rng.float(0.6, 1.4); D.ph[i] = rng.float(0, 6.28); debris.setColorAt(i, new THREE.Color([0xd8d0c0, 0xc8ccd2, 0xe8b820, 0xff2ad8, 0x2af4ff][i % 5])); }
    debris.count = Math.max(4, Math.round(debrisN * QUALITY.decor));   // [perf2] graphics preset
    group.add(debris);
  }

  // ================================================================= drones: Algorithm cameras that turn to watch the crew
  const droneGeoL = []; P(droneGeoL, UB, [0, 0, 0], [0.9, 0.34, 0.9], 0x2a2a34); P(droneGeoL, UB, [0, 0.22, 0], [0.5, 0.14, 0.5], 0x50545c);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { P(droneGeoL, UB, [sx * 0.6, 0.02, sz * 0.6], [0.7, 0.05, 0.08], 0x3a3a44, [0, Math.atan2(sz, sx) * 0 + sx * sz * 0.78, 0]); P(droneGeoL, UC, [sx * 0.85, 0.12, sz * 0.85], [0.3, 0.02, 0.3], 0x18181c); }
  P(droneGeoL, UC, [0, 0, 0.5], [0.22, 0.26, 0.22], 0x18181c, [Math.PI / 2, 0, 0]); P(droneGeoL, UB, [0, 0.42, 0], [0.04, 0.4, 0.04], 0x8a8f96);
  const droneGeo = merge(droneGeoL); geos.push(droneGeo);
  const eyeG = new THREE.CircleGeometry(0.14, 10); geos.push(eyeG);
  const drones = [];
  for (let i = 0; i < 3; i++) {
    const gr = new THREE.Group(), body = new THREE.Mesh(droneGeo, solidMat), em = own(new THREE.MeshBasicMaterial({ color: 0x2af4ff })), eye = new THREE.Mesh(eyeG, em); eye.position.set(0, 0, 0.615);
    gr.add(body, eye); group.add(gr);
    drones.push({ g: gr, em, R: 26 + i * 10, sp: (i % 2 ? -1 : 1) * (0.035 + i * 0.006), a: rng.float(0, 6.28), h: 7 + i * 1.6, lock: 0 });
  }

  // ================================================================= skyline (fogless, hazy)
  const far = [], farGlow = [], sky = new THREE.Group(); group.add(sky);
  // far plain + plateau skirt + mesas (fogged: they fade into the violet haze)
  const plainG = new THREE.CircleGeometry(430, 40); plainG.rotateX(-Math.PI / 2); plainG.translate(0, FAR, 0); geos.push(plainG);
  { const pm = own(new THREE.MeshLambertMaterial({ color: 0x40344a })); group.add(new THREE.Mesh(plainG, pm)); }
  const mesa = [], S0 = HALF + 8;
  for (const [ax, az, nx, nz] of [[0, S0, 0, 1], [0, -S0, 0, -1], [S0, 0, 1, 0], [-S0, 0, -1, 0]]) {   // plateau skirt: dark strata cliff
    const g = new THREE.PlaneGeometry(S0 * 2, -FAR + Y, 1, 10); const a = Math.atan2(nx, nz); g.rotateY(a); g.translate(ax, (FAR + Y) / 2, az); mesa.push(strata(flat(g).translate(0, 0, 0), 0, 6.5, 0.7));
  }
  const mesaRng = new RNG(((seed | 0) ^ 0x3e5a) >>> 0), keepOut = [-0.39, 0.67];   // robot / tower azimuths (from -z, radians) stay clear
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + mesaRng.float(-0.12, 0.12), r = mesaRng.float(110, 250);
    const bx = Math.sin(ang) * r, bz = -Math.cos(ang) * r, ang2 = Math.atan2(bx, -bz);
    if (keepOut.some((k) => Math.abs(ang2 - k) < 0.34)) continue;
    const tiers = mesaRng.int(2, 4); let rad = mesaRng.float(24, 46), y = FAR; const topY = mesaRng.float(-8, 46);
    for (let k = 0; k < tiers; k++) {
      const hgt = (topY - FAR) / tiers, g = new THREE.CylinderGeometry(rad * 0.86, rad, hgt, mesaRng.int(6, 9), 3); g.translate(bx + mesaRng.float(-2, 2), y + hgt / 2, bz); mesa.push(strata(flat(g), 0, 6.5, 0.9)); y += hgt; rad *= mesaRng.float(0.62, 0.8);
    }
  }
  {   // the STRIP MINE: a big mesa with a spiral haul road, lamps and a crane (east, in view from the pad)
    const bx = 150, bz = -35, R0 = 48, R1 = 25, top = 30, hgt = top - FAR;
    const g = new THREE.CylinderGeometry(R1, R0, hgt, 18, 8); g.translate(bx, FAR + hgt / 2, bz); mesa.push(strata(flat(g), 0, 6.5, 1));
    const pos = [], col = [], n = 120, turns = 3.6;
    for (let i = 0; i <= n; i++) { const k = i / n, a = k * Math.PI * 2 * turns, r = R0 + (R1 - R0) * k + 0.6, yy = FAR + hgt * k + 0.35; for (const dr of [-2.2, 2.2]) { pos.push(bx + Math.cos(a) * (r + dr), yy - Math.abs(dr) * 0.02 + (dr > 0 ? 0.0 : 0), bz + Math.sin(a) * (r + dr)); col.push(0.78, 0.66, 0.42); } if (i % 6 === 3) P(farGlow, UB, [bx + Math.cos(a) * (r + 2.6), yy + 1.2, bz + Math.sin(a) * (r + 2.6)], [0.9, 0.9, 0.9], i % 12 === 3 ? 0xffc060 : 0xff8a3a); }
    const idx = []; for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); rg.setIndex(idx); rg.computeVertexNormals(); mesa.push(flat(rg));
    for (const [dx, dz] of [[-3, 0], [3, 0]]) P(mesa, UB, [bx + dx, top + 8, bz + dz], [0.8, 16, 0.8], 0xb8892e); P(mesa, UB, [bx, top + 15, bz], [24, 1.2, 1.2], 0xb8892e, [0, 0.5, 0]); P(mesa, UB, [bx + 11, top + 9, bz - 5], [0.25, 12, 0.25], 0x18181c);
    P(farGlow, UB, [bx, top + 17, bz], [1.6, 1.6, 1.6], 0xff3020);
  }
  { const mm = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); meshOf(mesa, mm); }

  // robot head + hand (half buried, faces the pad), fogless
  const ROB = { x: -78, z: -190 }, hz = (hex) => hazy(hex, 0.4);
  {
    const R = new THREE.Group(); R.position.set(ROB.x, 0, ROB.z); R.rotation.y = Math.atan2(-ROB.x, -ROB.z); sky.add(R);   // local +z looks at the pad
    const rb = [], tilt = [0.05, 0.18, 0.12];
    P(rb, UB, [0, FAR + 50, 0], [130, 100, 74], hz(0x5a5470), tilt); P(rb, UB, [-56, FAR + 100, 4], [34, 16, 40], hz(0x6a6480), [0, 0, 0.3]); P(rb, UB, [50, FAR + 96, -4], [30, 18, 40], hz(0x6a6480), [0, 0, -0.2]);
    P(rb, UB, [0, FAR + 106, 0], [28, 22, 26], hz(0x3a3648), tilt);
    P(rb, UB, [4, FAR + 148, 2], [64, 50, 54], hz(0xb0a48a), [0.08, 0, 0.18]);            // head
    P(rb, UB, [4, FAR + 178, 2], [56, 4, 46], hz(0xe8b820), [0.08, 0, 0.18]);            // hazard cap
    for (const s of [-1, 1]) P(rb, UC, [4 + s * 35, FAR + 146, 2], [9, 6, 9], hz(0x7a7488), [0, 0, Math.PI / 2 + 0.18]);   // ears
    P(rb, UC, [14, FAR + 200, 2], [0.7, 30, 0.7], hz(0x8a8f96)); P(farGlow, UB, [14, FAR + 216, 2], [2.4, 2.4, 2.4], 0xff3020);
    for (let k = 0; k < 5; k++) seg(rb, V3(-8 + k * 6, FAR + 100, 6), V3(-30 + k * 16, FAR + 6, 30 + (k % 2) * 8), 1.4, hz(0x18181c));   // torn neck cables
    for (const [dx, dz, len] of [[-18, 0, 30], [-8, 0, 36], [3, 0, 34], [14, 0, 26]]) P(rb, UB, [90 + dx * 0.5, FAR + 8, 46 + dz + len / 2], [7, 7, len], hz(0xb0a48a), [0, 0.2, 0]);   // fingers of the fallen hand
    P(rb, UB, [80, FAR + 9, 40], [34, 10, 26], hz(0xa09478), [0, 0.2, 0]);
    const g = merge(rb); geos.push(g); const rm = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false })); R.add(new THREE.Mesh(g, rm));
    const ft = faceTex(); if (ft) { texs.push(ft); const fg = new THREE.PlaneGeometry(52, 26); geos.push(fg); const fm = own(new THREE.MeshBasicMaterial({ map: ft, fog: false, color: 0xb8a8c8 })); const fm2 = new THREE.Mesh(fg, fm); fm2.position.set(4, FAR + 148, 2 + 27.2); fm2.rotation.set(0.08, 0, 0.18); R.add(fm2); env.robotFace = fm2; }
  }
  // broadcast tower with the LIVE eye
  const TW = { x: 118, z: -150 };
  {
    const T = new THREE.Group(); T.position.set(TW.x, 0, TW.z); sky.add(T);
    const tb = [], H = 130, base = 9, top = 2.6, N = 13, lean = 0.05, legs = [0, 1, 2].map((k) => (k / 3) * Math.PI * 2 + 0.5), w = (h) => base + (top - base) * (h / H);
    const at = (k, h) => V3(Math.cos(legs[k]) * w(h) + h * lean, FAR + h, Math.sin(legs[k]) * w(h));
    for (let i = 0; i < N; i++) {
      const h0 = (i / N) * H, h1 = ((i + 1) / N) * H;
      for (let k = 0; k < 3; k++) { seg(tb, at(k, h0), at(k, h1), 1.3, hz(0x7a3a3a)); seg(tb, at(k, h1), at((k + 1) % 3, h1), 0.7, hz(0x5a4a5a)); seg(tb, at(k, h0), at((k + 1) % 3, h1), 0.6, hz(0x5a4a5a)); }
    }
    P(tb, UC, [H * lean * 0.8, FAR + 88, 0], [9, 1.2, 9], hz(0x5a4a5a)); P(tb, UB, [H * lean, FAR + H + 4, 0], [3, 8, 3], hz(0x3a3648)); P(tb, UC, [H * lean, FAR + H + 12, 0], [0.4, 16, 0.4], hz(0x8a8f96));
    P(farGlow, UB, [H * lean, FAR + H + 21, 0], [2.6, 2.6, 2.6], 0xff3020);
    const g = merge(tb); geos.push(g); T.add(new THREE.Mesh(g, own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }))));
    const te = towerEyeTex(), gt = glowTex();
    if (te) {
      texs.push(te); const eg = new THREE.PlaneGeometry(34, 34); geos.push(eg);
      const em = own(new THREE.MeshBasicMaterial({ map: te, transparent: true, fog: false, depthWrite: false })); const eye = new THREE.Mesh(eg, em); eye.position.set(H * lean * 0.8 + 0, FAR + 100, 0); eye.rotation.y = Math.atan2(-TW.x, -TW.z); T.add(eye); env.towerEye = eye; env.towerEyeMat = em;
    }
  }
  // moon with the Company logo (top centre, so it is in the first view)
  {
    const mt = moonTex(); const mg = new THREE.SphereGeometry(44, 24, 14); geos.push(mg);
    const mm = own(new THREE.MeshLambertMaterial({ map: mt || null, color: mt ? 0xc8c0d8 : 0x8c8898, fog: false, emissive: 0x2a2440 })); const moon = new THREE.Mesh(mg, mm); if (mt) texs.push(mt);
    moon.position.set(36, 118, -262); moon.rotation.y = Math.atan2(-262, -36); sky.add(moon);   // the logo (u = .5, local +x) faces the pad
  }
  // aurora-like data curtains
  const aT = auroraTex();
  if (aT) {
    texs.push(aT); const curtains = [], PAL = [[1, 0.16, 0.85], [0.16, 0.95, 1], [0.5, 0.35, 1]];
    for (let c = 0; c < 3; c++) {
      const pos = [], uv = [], col = [], idx = [], n = 36, rr = 320 - c * 8, base = 58 + c * 26, a0 = -1.25 + c * 0.25, a1 = 1.45 - c * 0.15;
      for (let i = 0; i <= n; i++) {
        const k = i / n, a = a0 + (a1 - a0) * k, hh = 62 + 20 * Math.sin(k * 7 + c * 2), y0 = base + 16 * Math.sin(k * 4 + c);
        for (const v of [0, 1]) { pos.push(Math.sin(a) * rr, y0 + v * hh, -Math.cos(a) * rr); uv.push(k * 5, v); const f = v ? 0.35 : 1; col.push(PAL[c][0] * f, PAL[c][1] * f, PAL[c][2] * f); }
        if (i < n) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); curtains.push(g);
    }
    const g = mergeGeometries(curtains.map(flat), false); geos.push(g); curtains.forEach((c) => c.dispose());
    const am = own(new THREE.MeshBasicMaterial({ map: aT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.55 })); const aur = new THREE.Mesh(g, am); aur.renderOrder = 5; aur.frustumCulled = false; sky.add(aur); env.aurora = aT;
  }
  { const fm = own(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); meshOf(farGlow, fm); }
  meshOf(beacon, beaconMat); meshOf(led, ledMat);
  // static parts of the sky never move with the camera: bounding boxes are huge, keep them from being culled wrongly
  sky.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // ================================================================= update (per frame) + dispose
  let time = 0, blinkT = 0, audioT = 0, lastGame = null;
  const wind = new THREE.Vector3(1, 0, 0.35).normalize(), tgt = new THREE.Vector3(), qa = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  const humPos = new THREE.Vector3(TW.x * 0.3, 0, TW.z * 0.3);
  function update(dt, game) {
    time += dt; lastGame = game || lastGame;
    const gust = 1 + 0.7 * Math.sin(time * 0.31) * Math.sin(time * 0.83 + 1);
    lampMatA.color.setScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2.2))); lampMatB.color.setScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2.2 + Math.PI)));
    beaconMat.color.setScalar((Math.sin(time * 3.3) > 0.55) ? 1 : 0.12); ledMat.color.setScalar(0.5 + 0.5 * Math.sin(time * 7));
    candleMat.color.setScalar(0.75 + 0.25 * Math.sin(time * 9.7) * Math.sin(time * 4.1)); flameMat.color.setScalar(0.85 + 0.15 * Math.sin(time * 13));
    if (flameMesh) flameMesh.scale.set(1, 0.85 + 0.25 * Math.sin(time * 11) + 0.1 * Math.sin(time * 23), 1);
    if (emitters[0]) emitters[0].intensity = 0.8 + 0.2 * Math.sin(time * 9) * Math.sin(time * 5.3);
    if (env.aurora) { env.aurora.offset.x = time * 0.02; env.aurora.offset.y = Math.sin(time * 0.1) * 0.05; }
    if (env.towerEye) {   // the hijacked LIVE eye: pulses, blinks now and then
      blinkT -= dt; const lid = blinkT < 0 && blinkT > -0.16 ? 0.08 : 1; if (blinkT < -0.16) blinkT = 2.5 + Math.abs(Math.sin(time * 1.7)) * 4;
      env.towerEye.scale.y = lid; env.towerEyeMat.color.setScalar(0.8 + 0.2 * Math.sin(time * 3));
    }
    if (cloth && env.laundry) {
      const L = env.laundry; for (let i = 0; i < clothN; i++) {
        const p = L.pts[1 + Math.floor((i * (L.pts.length - 2)) / clothN)];
        dummy.position.set(p.x, p.y, p.z + ((i * 0.31) % 0.4) - 0.2); dummy.rotation.set(0, 0, 0.35 * gust * Math.sin(time * 1.9 + i * 1.3) + 0.25 * gust); dummy.scale.set(1, 0.85 + (i % 3) * 0.15, 1); dummy.updateMatrix(); cloth.setMatrixAt(i, dummy.matrix);
      }
      cloth.instanceMatrix.needsUpdate = true;
    }
    if (debris) {
      for (let i = 0; i < debrisN; i++) {
        const sp = (2.5 + 5.5 * D.sp[i]) * gust; D.x[i] += wind.x * sp * dt; D.z[i] += wind.z * sp * dt;
        if (D.x[i] > HALF - 3) { D.x[i] = -HALF + 3; D.z[i] = (rng.float(-1, 1)) * (HALF - 4); }
        if (D.z[i] > HALF - 3) D.z[i] = -HALF + 3;
        dummy.position.set(D.x[i], Y + D.y[i] + 0.5 * Math.sin(time * 1.6 + D.ph[i]), D.z[i]); dummy.rotation.set(time * 2.1 * D.sp[i] + D.ph[i], time * 1.3 + D.ph[i], time * 2.7 * D.sp[i]); dummy.scale.setScalar(0.7 + 0.6 * D.sp[i] * 0.5); dummy.updateMatrix(); debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
    }
    // drones: orbit over the base, turn to face the nearest crew member within 60 m (eye goes red while locked)
    const who = []; if (game?.player?.pos && !game.player.inShip) who.push(game.player.pos); if (game?.remotes) for (const r of game.remotes.values()) if (r?.pos && r.pos.y > -500) who.push(r.pos);
    const gy = group.position.y;
    for (const d of drones) {
      d.a += d.sp * dt; const px = Math.cos(d.a) * d.R, pz = Math.sin(d.a) * d.R, py = Y + d.h + Math.sin(time * 0.9 + d.R) * 0.35;
      d.g.position.set(px, py, pz);
      let best = null, bd = 60 * 60; for (const w of who) { const dd = (w.x - px) ** 2 + (w.z - pz) ** 2 + (w.y - py) ** 2; if (dd < bd) { bd = dd; best = w; } }
      if (best) tgt.set(best.x, best.y + 1.4 - gy, best.z); else tgt.set(px - Math.sin(d.a) * Math.sign(d.sp) * 10, py, pz + Math.cos(d.a) * Math.sign(d.sp) * 10);
      mtx.lookAt(tgt, d.g.position, d.g.up);   // (object convention: +z, where the lens is, points at the target) qa.setFromRotationMatrix(mtx); d.g.quaternion.slerp(qa, Math.min(1, dt * (best ? 3.5 : 1.2)));
      d.lock += ((best ? 1 : 0) - d.lock) * Math.min(1, dt * 4); d.em.color.setRGB(0.16 + 0.84 * d.lock, 0.95 - 0.85 * d.lock, 1 - 0.75 * d.lock).multiplyScalar(0.7 + 0.3 * Math.sin(time * 6 + d.R));
    }
    audioT -= dt;
    if (audioT <= 0 && game?.audio?.setAmbience) {   // faint hum of the hijacked tower + the drones; louder toward the outpost edge
      audioT = 1.5; try { const p = game.player?.pos; game.audio.setAmbience('hwhum', 'lights_buzz', p ? 0.05 + Math.min(0.08, humPos.distanceTo(p) < 90 ? 0.08 - humPos.distanceTo(p) * 0.0008 : 0) : 0.05, 3); } catch (e) { /* audio optional */ }
    }
  }
  function dispose(game = lastGame) {
    for (const em of emitters) lightPool?.remove(em);
    for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const tx of texs) tx.dispose();
    try { game?.audio?.setAmbience?.('hwhum', null, 0, 1); } catch (e) { /* ignore */ }
    group.removeFromParent();
  }
  return { group, items: plan, update, dispose, stats: () => ({ solid: solid.length, glow: glow.length, fence: plan.filter((p) => p.kind === 'fence').length, dead: dead.length }) };
}
