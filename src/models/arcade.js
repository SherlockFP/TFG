// ARCADE models (module `arcade`): the chess / dama table with 3D pieces and the CARNIVAL corner (can knockdown, shooting gallery, strength tester).
// No scene lights are added: Lambert / Basic materials only (the emissive strength-tester lamps are MeshBasic), so the constant light pool is untouched.
//   createGameTable()  -> { root, update(kind, posString), dispose() }        local: table top at y = 0.78, White sits on the +z side
//   createCarnival(labels) -> { root, booths, relabel(labels), dispose() }     local: booths open toward +z (players stand at +z), row centred on x = 0
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TOP_Y = 0.78, SQ = 0.1;
const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };

// ------------------------------------------------------------------------------------------------ table
let pieceGeo = null;
function pieces() {
  if (pieceGeo) return pieceGeo;
  const cyl = (r0, r1, h, y) => at(new THREE.CylinderGeometry(r0, r1, h, 8), 0, y + h / 2, 0);
  const ball = (r, y) => at(new THREE.SphereGeometry(r, 8, 6), 0, y, 0);
  const box = (w, h, d, y) => at(new THREE.BoxGeometry(w, h, d), 0, y + h / 2, 0);
  const base = () => cyl(0.036, 0.04, 0.012, 0);
  const M = (parts) => mergeGeometries(parts.map((g) => g.toNonIndexed()));
  pieceGeo = {
    p: M([base(), cyl(0.014, 0.022, 0.04, 0.012), ball(0.019, 0.062)]),
    r: M([base(), cyl(0.024, 0.028, 0.05, 0.012), box(0.054, 0.014, 0.054, 0.062)]),
    n: M([base(), cyl(0.02, 0.028, 0.03, 0.012), at(new THREE.ConeGeometry(0.024, 0.052, 6), 0.004, 0.068, 0).rotateZ(-0.35)]),
    b: M([base(), cyl(0.012, 0.026, 0.05, 0.012), at(new THREE.ConeGeometry(0.016, 0.034, 8), 0, 0.078, 0), ball(0.008, 0.102)]),
    q: M([base(), cyl(0.014, 0.03, 0.066, 0.012), ball(0.02, 0.09), at(new THREE.ConeGeometry(0.014, 0.024, 6), 0, 0.114, 0)]),
    k: M([base(), cyl(0.016, 0.03, 0.07, 0.012), box(0.012, 0.03, 0.012, 0.082), box(0.03, 0.01, 0.012, 0.094)]),
    man: M([cyl(0.04, 0.042, 0.022, 0)]),
    king: M([cyl(0.04, 0.042, 0.022, 0), cyl(0.04, 0.042, 0.022, 0.024), ball(0.014, 0.056)]),
  };
  return pieceGeo;
}
const LIGHT = mat(0xe9dcc0), DARK = mat(0x2a1d16);

function boardTexture(kind) {
  const c = canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#1b120b'; x.fillRect(0, 0, 256, 256);
  const s = 256 / 8;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const light = ((f + r) & 1) === 0;
    x.fillStyle = kind === 'draughts' ? ((f + r) & 1 ? '#d9c79a' : '#cbb887') : (light ? '#b58863' : '#f0d9b5');
    x.fillRect(f * s, r * s, s, s);
    if (kind === 'draughts') { x.strokeStyle = 'rgba(60,40,20,.55)'; x.lineWidth = 2; x.strokeRect(f * s + 1, r * s + 1, s - 2, s - 2); }
  }
  x.strokeStyle = '#3a2412'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 250);
  return tex(c);
}

export function createGameTable() {
  const root = new THREE.Group();
  root.name = 'arcade_table';
  const wood = mat(0x6a4a2a), dark = mat(0x3a2a1a);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), wood); top.position.y = TOP_Y - 0.03; root.add(top);
  for (const [x, z] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, TOP_Y - 0.06, 0.07), dark); l.position.set(x, (TOP_Y - 0.06) / 2, z); root.add(l); }
  for (const z of [-0.78, 0.78]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.46, 8), mat(0x7a2b2b)); st.position.set(0, 0.23, z); root.add(st); }
  const boardMat = new THREE.MeshLambertMaterial({ map: boardTexture('chess') });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(SQ * 8, SQ * 8), boardMat);
  board.rotation.x = -Math.PI / 2; board.position.y = TOP_Y + 0.002; root.add(board);
  const pcs = new THREE.Group(); pcs.position.y = TOP_Y + 0.003; root.add(pcs);
  let kind = 'chess', sig = '';
  const texCache = {};
  function update(k, pos) {
    const s = k + '|' + pos;
    if (s === sig) return;
    sig = s;
    if (k !== kind) { kind = k; board.material.map = texCache[k] || (texCache[k] = boardTexture(k)); board.material.needsUpdate = true; }
    pcs.clear();
    const G = pieces();
    const place = (m, f, r) => { m.position.set((f - 3.5) * SQ, 0, (3.5 - r) * SQ); pcs.add(m); return m; };
    if (k === 'draughts') {
      const [bs] = String(pos).split('|');
      for (let i = 0; i < 64 && i < bs.length; i++) {
        const ch = bs[i];
        if (ch === '.') continue;
        place(new THREE.Mesh(ch === 'W' || ch === 'B' ? G.king : G.man, ch.toLowerCase() === 'w' ? LIGHT : DARK), i & 7, i >> 3);
      }
    } else {
      const rows = String(pos).split(' ')[0].split('/');
      for (let i = 0; i < 8; i++) {
        let f = 0;
        for (const ch of rows[i] || '') {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const white = ch === ch.toUpperCase();
          const m = place(new THREE.Mesh(G[ch.toLowerCase()], white ? LIGHT : DARK), f, 7 - i);
          if (ch.toLowerCase() === 'n') m.rotation.y = white ? Math.PI : 0;   // knights look at the opponent
          f++;
        }
      }
    }
  }
  update('chess', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  return {
    root, update,
    dispose() {
      for (const t of Object.values(texCache)) t.dispose();
      board.material.map?.dispose(); board.material.dispose(); board.geometry.dispose();
      root.traverse((o) => { if (o.isMesh && o.geometry && o !== board && !Object.values(pieceGeo || {}).includes(o.geometry)) { o.geometry.dispose(); } });
      root.removeFromParent();
    },
  };
}
export const TABLE = { topY: TOP_Y, half: 0.5 };

// ------------------------------------------------------------------------------------------------ carnival
function stripeTexture(a, b) {
  const c = canvas(64, 16), x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i & 1 ? b : a; x.fillRect(i * 8, 0, 8, 16); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function signTexture(text, sub, bg, fg) {
  const c = canvas(256, 64), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 256, 64);
  x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(3, 3, 250, 58);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 34;
  x.font = `bold ${size}px VT323, monospace`;
  while (x.measureText(text).width > 232 && size > 14) { size -= 2; x.font = `bold ${size}px VT323, monospace`; }
  x.fillText(text, 128, sub ? 26 : 33);
  if (sub) { x.font = 'bold 20px VT323, monospace'; x.fillText(sub, 128, 48); }
  return tex(c);
}

export const BOOTH_X = { cans: -4.4, gallery: 0, strength: 4.4 };
export const GALLERY = { rows: [{ z: -4.4, y: 1.55, span: 1.35, speed: 1.15, r: 0.26, pts: 1 }, { z: -6.0, y: 1.95, span: 1.35, speed: 1.9, r: 0.15, pts: 3 }], roundSec: 25, decoyPenalty: 2, downSec: 1.4 };
export const CANS = { shelf: { x: 0, y: 1.22, z: -1.35 }, r: 0.09, h: 0.2 };
export const STRENGTH = { segs: 10, towerH: 2.7 };

/** labels: { cans: [title, sub], gallery: [...], strength: [...] } (already translated) */
export function createCarnival(labels = {}) {
  const root = new THREE.Group();
  root.name = 'carnival';
  const geos = [], mats = [], texs = [];
  const G = (g) => { geos.push(g); return g; };
  const M = (m) => { mats.push(m); return m; };
  const mesh = (g, m, x, y, z, parent = root) => { const o = new THREE.Mesh(G(g), M(m)); o.position.set(x, y, z); parent.add(o); return o; };
  const woodM = mat(0x7b5a34), paintR = mat(0xb32a2a), paintW = mat(0xeee6d6), darkM = mat(0x25202c);
  const signs = {};
  const colliders = [];   // static box specs (local): { x, y, z, hx, hy, hz }

  function frame(cx, w, depth, stripeA, stripeB, key) {
    const g = new THREE.Group(); g.position.x = cx; root.add(g);
    // counter
    mesh(new THREE.BoxGeometry(w, 1.0, 0.5), woodM, 0, 0.5, 0, g);
    mesh(new THREE.BoxGeometry(w + 0.1, 0.06, 0.62), paintW, 0, 1.03, 0.02, g);
    colliders.push({ x: cx, y: 0.5, z: 0, hx: w / 2, hy: 0.5, hz: 0.25 });
    // posts + awning
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6), woodM, sx * (w / 2 - 0.05), 1.35, 0.15, g);
    const st = stripeTexture(stripeA, stripeB); texs.push(st); st.repeat.set(w * 1.2, 1);
    const aw = mesh(new THREE.BoxGeometry(w + 0.3, 0.08, depth + 0.6), new THREE.MeshLambertMaterial({ map: st }), 0, 2.75, -depth / 2 + 0.3, g);
    aw.rotation.x = 0.12;
    const fr = mesh(new THREE.BoxGeometry(w + 0.3, 0.32, 0.06), new THREE.MeshLambertMaterial({ map: st }), 0, 2.55, 0.62, g);
    fr.rotation.x = -0.05;
    // sign
    const sg = mesh(new THREE.PlaneGeometry(w * 0.86, w * 0.86 / 4), basic(0xffffff), 0, 3.05, 0.5, g);
    signs[key] = sg;
    // side + back walls
    mesh(new THREE.BoxGeometry(0.08, 2.4, depth), woodM, -w / 2 + 0.04, 1.2, -depth / 2, g);
    mesh(new THREE.BoxGeometry(0.08, 2.4, depth), woodM, w / 2 - 0.04, 1.2, -depth / 2, g);
    colliders.push({ x: cx - w / 2 + 0.04, y: 1.2, z: -depth / 2, hx: 0.05, hy: 1.2, hz: depth / 2 }, { x: cx + w / 2 - 0.04, y: 1.2, z: -depth / 2, hx: 0.05, hy: 1.2, hz: depth / 2 });
    return g;
  }

  // ---- CAN KNOCKDOWN
  const cansG = frame(BOOTH_X.cans, 3.4, 1.8, '#c4302b', '#f4ecd8', 'cans');
  mesh(new THREE.BoxGeometry(3.3, 2.4, 0.08), paintR, 0, 1.2, -1.75, cansG);
  mesh(new THREE.BoxGeometry(1.2, 0.08, 0.5), woodM, CANS.shelf.x, CANS.shelf.y - 0.04, CANS.shelf.z, cansG);
  const canGeo = G(new THREE.CylinderGeometry(CANS.r, CANS.r, CANS.h, 10));
  const canMats = [M(mat(0xd83a3a)), M(mat(0xf2f2ea)), M(mat(0x3a7ad8))];
  const cans = [];
  const pyr = [[-0.2, 0], [0, 0], [0.2, 0], [-0.1, 1], [0.1, 1], [0, 2]];
  pyr.forEach(([px, row], i) => {
    const m = new THREE.Mesh(canGeo, canMats[i % 3]);
    const home = new THREE.Vector3(CANS.shelf.x + px, CANS.shelf.y + CANS.h / 2 + row * CANS.h, CANS.shelf.z);
    m.position.copy(home); cansG.add(m);
    cans.push({ mesh: m, home, vel: new THREE.Vector3(), spin: new THREE.Vector3(), out: false });
  });
  const ballGeo = G(new THREE.SphereGeometry(0.11, 10, 8)), ballMat = M(mat(0xf2d64a));
  const ballMesh = new THREE.Mesh(ballGeo, ballMat); ballMesh.visible = false; root.add(ballMesh);
  const ballRack = [0, 1, 2].map((i) => mesh(new THREE.SphereGeometry(0.11, 8, 6), ballMat, -0.5 + i * 0.25, 1.17, 0.02, cansG));

  // ---- SHOOTING GALLERY
  const galG = frame(BOOTH_X.gallery, 3.4, 1.8, '#2a6fd0', '#f4ecd8', 'gallery');
  mesh(new THREE.BoxGeometry(3.4, 2.6, 0.1), darkM, 0, 1.3, -7.0, galG);
  const wallSide = (sx) => mesh(new THREE.BoxGeometry(0.1, 2.4, 5.3), woodM, sx * 1.7, 1.2, -4.35, galG);
  wallSide(-1); wallSide(1);
  colliders.push({ x: BOOTH_X.gallery - 1.7, y: 1.2, z: -4.35, hx: 0.06, hy: 1.2, hz: 2.65 }, { x: BOOTH_X.gallery + 1.7, y: 1.2, z: -4.35, hx: 0.06, hy: 1.2, hz: 2.65 }, { x: BOOTH_X.gallery, y: 1.3, z: -7.0, hx: 1.7, hy: 1.3, hz: 0.06 });
  mesh(new THREE.BoxGeometry(3.3, 0.04, 5.4), M(mat(0x2b3a2a)), 0, 0.02, -4.3, galG);   // dark turf strip (visual)
  const targets = [];
  const dGeo = { big: G(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 14)), small: G(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12)), decoy: G(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 12)) };
  const tMat = { big: M(mat(0xf2c230)), small: M(mat(0xe0453a)), decoy: M(mat(0x3f8ee0)) };
  const rimM = M(mat(0xffffff));
  GALLERY.rows.forEach((row, ri) => {
    const kinds = ri === 0 ? ['big', 'big', 'decoy'] : ['small', 'small', 'decoy'];
    kinds.forEach((kd, i) => {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(dGeo[kd], tMat[kd]); disc.rotation.x = Math.PI / 2; g.add(disc);
      const ring = new THREE.Mesh(G(new THREE.TorusGeometry(kd === 'small' ? 0.085 : 0.14, 0.012, 4, 14)), rimM); ring.position.z = 0.03; g.add(ring);
      galG.add(g);
      targets.push({ g, kind: kd, row: ri, r: dGeo[kd].parameters.radiusTop, phase: (i / kinds.length) * Math.PI * 2 + ri, down: 0, z: row.z, y: row.y, decoy: kd === 'decoy' });
    });
  });
  // toy gun on the counter
  const gun = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.06, 0.09, 0.28), M(mat(0x3a3a48)), 0, 0, 0, gun); mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), M(mat(0xd85a2a)), 0, -0.09, 0.08, gun);
  gun.position.set(0.7, 1.09, 0.05); gun.rotation.y = 0.3; galG.add(gun);

  // ---- STRENGTH TESTER
  const strG = frame(BOOTH_X.strength, 3.4, 1.8, '#3aa050', '#f4ecd8', 'strength');
  mesh(new THREE.BoxGeometry(3.3, 2.4, 0.08), M(mat(0x2c2a44)), 0, 1.2, -1.75, strG);
  const tower = new THREE.Group(); tower.position.set(0, 0, -1.2); strG.add(tower);
  mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), M(mat(0x55505f)), 0, 1.06, 0, tower);
  const railH = STRENGTH.towerH - 1.2;
  mesh(new THREE.BoxGeometry(0.16, railH, 0.16), M(mat(0x33303c)), 0, 1.12 + railH / 2, 0, tower);
  const segs = [];
  for (let i = 0; i < STRENGTH.segs; i++) {
    const c = i < 5 ? 0x3ad06a : i < 8 ? 0xf2c230 : 0xe0453a;
    const dim = new THREE.Color(c).multiplyScalar(0.18);
    const sm = new THREE.MeshBasicMaterial({ color: dim }); mats.push(sm);
    const y = 1.3 + (i / (STRENGTH.segs - 1)) * (railH - 0.35);
    const seg = mesh(new THREE.BoxGeometry(0.28, 0.09, 0.05), sm, 0, y, 0.1, tower);
    segs.push({ mesh: seg, on: new THREE.Color(c), off: dim, y });
  }
  const puck = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), M(mat(0xd0d0d8)), 0, 1.2, 0.14, tower);
  const bell = mesh(new THREE.SphereGeometry(0.16, 10, 8), basic(0xf2c230), 0, 1.12 + railH + 0.12, 0, tower);
  bell.scale.y = 0.8;
  const mallet = new THREE.Group(); mallet.position.set(-0.75, 1.09, 0.02); strG.add(mallet);
  const mHandle = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), M(mat(0x8a5a2a)), 0, 0, 0.22, mallet);
  mHandle.name = 'handle';
  mesh(new THREE.BoxGeometry(0.22, 0.2, 0.14), M(mat(0xb0b0b8)), 0, 0, 0.56, mallet);
  mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), M(mat(0x55505f)), 0.35, 1.09, 0.02, strG);   // anvil pad

  function relabel(l) {
    const spec = { cans: ['#7a1a1a', '#ffe9c0'], gallery: ['#12306a', '#e8f0ff'], strength: ['#164a26', '#eaffee'] };
    for (const k of Object.keys(signs)) {
      const [title, sub] = l?.[k] || [k.toUpperCase(), ''];
      const m = signs[k].material;
      const old = m.map;
      m.map = signTexture(title, sub, spec[k][0], spec[k][1]); m.needsUpdate = true;
      old?.dispose();
      if (!texs.includes(m.map)) texs.push(m.map);
    }
  }
  relabel(labels);

  return {
    root, colliders,
    booths: { cans: { cans, ballMesh, ballRack, group: cansG }, gallery: { targets, gun, group: galG }, strength: { segs, puck, bell, mallet, group: strG } },
    relabel,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const k of Object.keys(signs)) { signs[k].material.map?.dispose(); signs[k].material.dispose(); signs[k].geometry.dispose(); }
      for (const t of texs) t.dispose();
      root.removeFromParent();
    },
  };
}
