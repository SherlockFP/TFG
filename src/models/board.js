// THE BOARD (model): a giant tabletop floating in a dark void. A 7x7 square ring of 24 tiles (START south-west, EXIT next to it), a huge die
// in the middle, the Administrator's high chair at the north edge, a scoreboard, chips and cards for scale. Local coordinates: table top
// at y = 0, centre at the origin, +z = south (the START side), the Administrator sits at -z. game/boardgame.js places the group in the realm.
// No scene lights are added (emissive / Basic materials + pooled emitters listed in `lights`).
import * as THREE from 'three';
import { LAYOUT, TILE, SHORTCUTS, ringCell, slotOffset } from '../game/board_rules.js';
import { t } from '../core/i18n.js';

export const BOARD = Object.freeze({ P: 3.4, TILE: 3.14, TOP: 0.1, DIE: 2.6, HALF_X: 20, HALF_Z: 18, SEAT: { x: 0, y: 0, z: -14.6 } });
const TILE_STYLE = {
  [TILE.START]: { bg: '#2e5a3a', fg: '#dfffe0', label: 'START' }, [TILE.LOOT]: { bg: '#8a6a12', fg: '#fff1b0', label: 'LOOT' },
  [TILE.TRAP]: { bg: '#7a1a1a', fg: '#ffd0c8', label: 'TRAP' }, [TILE.CARD]: { bg: '#4a2a7a', fg: '#e6d2ff', label: 'CARD' },
  [TILE.DUEL]: { bg: '#8a4310', fg: '#ffe0b8', get label() { return t('DUEL'); } }, [TILE.SHORT]: { bg: '#12626a', fg: '#c8fbff', get label() { return t('SHORTCUT'); } },
  [TILE.REST]: { bg: '#2a4f7a', fg: '#d4e8ff', get label() { return t('REST'); } }, [TILE.EXIT]: { bg: '#16a04a', fg: '#eaffee', label: 'EXIT' },
};
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function tileCanvas(i, type) {
  const st = TILE_STYLE[type], c = canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = st.bg; x.fillRect(0, 0, 128, 128);
  if (type === TILE.TRAP) { x.fillStyle = 'rgba(0,0,0,0.28)'; for (let k = -128; k < 128; k += 24) { x.beginPath(); x.moveTo(k, 128); x.lineTo(k + 12, 128); x.lineTo(k + 140, 0); x.lineTo(k + 128, 0); x.fill(); } }
  x.strokeStyle = st.fg; x.globalAlpha = 0.8; x.lineWidth = 4; x.strokeRect(6, 6, 116, 116); x.globalAlpha = 1;
  x.fillStyle = st.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 20px monospace'; x.fillText(st.label, 64, 30);
  x.font = 'bold 54px monospace';
  const glyph = { [TILE.START]: '>>', [TILE.LOOT]: '$', [TILE.TRAP]: '!', [TILE.CARD]: '?', [TILE.DUEL]: 'VS', [TILE.SHORT]: '^', [TILE.REST]: '+', [TILE.EXIT]: '[>]' }[type];
  x.fillText(glyph, 64, 74);
  if (type === TILE.SHORT) { x.font = 'bold 16px monospace'; x.fillText('-> ' + SHORTCUTS[i], 64, 104); }
  x.font = 'bold 15px monospace'; x.textAlign = 'left'; x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText(String(i), 11, 116);
  return c;
}

function feltCanvas() {
  const c = canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#0d2a20'; x.fillRect(0, 0, 128, 128);
  let s = 7; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'; x.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 2, 2); }
  return c;
}
function sealCanvas() {
  const c = canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#15121c'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#9aa3c0'; x.lineWidth = 3;
  for (const r of [120, 104, 60]) { x.beginPath(); x.arc(128, 128, r, 0, Math.PI * 2); x.stroke(); }
  x.fillStyle = '#9aa3c0'; x.textAlign = 'center'; x.font = 'bold 22px monospace'; x.fillText(t('THE  BOARD'), 128, 112);
  x.font = '14px monospace'; x.fillText(t('SIGN HERE ________'), 128, 146);
  x.fillText('turns are final', 128, 168);
  return c;
}
function pipCanvas(n) {
  const c = canvas(64, 64), x = c.getContext('2d');
  x.fillStyle = '#ecebe4'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#a8a69c'; x.lineWidth = 4; x.strokeRect(2, 2, 60, 60);
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[n];
  x.fillStyle = n === 1 ? '#c4202a' : '#16161a';
  for (const [px, py] of P) { x.beginPath(); x.arc(px * 64, py * 64, n === 1 ? 9 : 6.5, 0, Math.PI * 2); x.fill(); }
  return c;
}
// die face -> outward normal (opposite faces sum to 7): +y 1, -y 6, +z 2, -z 5, +x 3, -x 4. BoxGeometry material order: +x -x +y -y +z -z
const FACE_NORMAL = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
const FACE_ORDER = [3, 4, 1, 6, 2, 5];
const ease = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

export function createBoard() {
  const root = new THREE.Group(); root.name = 'tfg-board';
  const geos = [], mats = [], texs = [];
  const M = (m) => { mats.push(m); return m; };
  const B = (color, o = {}) => M(new THREE.MeshBasicMaterial({ color, ...o }));
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { geos.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const T = (c) => { const t = tex(c); texs.push(t); return t; };

  // ---- table: felt top, wooden rim, legs into the fog
  const felt = T(feltCanvas()); felt.wrapS = felt.wrapT = THREE.RepeatWrapping; felt.repeat.set(10, 9);
  mesh(new THREE.BoxGeometry(BOARD.HALF_X * 2, 1.2, BOARD.HALF_Z * 2), [B(0x2a1a10), B(0x2a1a10), B(0xffffff, { map: felt }), B(0x120a06), B(0x2a1a10), B(0x2a1a10)], 0, -0.6, 0);
  const wood = B(0x3d2616);
  mesh(new THREE.BoxGeometry(BOARD.HALF_X * 2 + 3, 1.6, 1.5), wood, 0, -0.2, BOARD.HALF_Z + 0.5);
  mesh(new THREE.BoxGeometry(BOARD.HALF_X * 2 + 3, 1.6, 1.5), wood, 0, -0.2, -BOARD.HALF_Z - 0.5);
  mesh(new THREE.BoxGeometry(1.5, 1.6, BOARD.HALF_Z * 2), wood, BOARD.HALF_X + 0.5, -0.2, 0);
  mesh(new THREE.BoxGeometry(1.5, 1.6, BOARD.HALF_Z * 2), wood, -BOARD.HALF_X - 0.5, -0.2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(2, 40, 2), B(0x24160c), sx * (BOARD.HALF_X - 1), -21, sz * (BOARD.HALF_Z - 1));

  // ---- the ring
  const tiles = [];
  for (let i = 0; i < 24; i++) {
    const type = LAYOUT[i], { gx, gz } = ringCell(i);
    const top = T(tileCanvas(i, type));
    const side = B(0x14100c);
    const m = mesh(new THREE.BoxGeometry(BOARD.TILE, BOARD.TOP, BOARD.TILE), [side, side, B(0xffffff, { map: top }), side, side, side], gx * BOARD.P, BOARD.TOP / 2, gz * BOARD.P);
    tiles.push({ index: i, type, x: gx * BOARD.P, z: gz * BOARD.P, mesh: m, mat: m.material[2] });
  }
  // ---- centre arena + huge die
  const seal = T(sealCanvas());
  mesh(new THREE.CylinderGeometry(6.6, 6.9, 0.22, 32), [B(0x1c1826), B(0xffffff, { map: seal }), B(0x1c1826)], 0, 0.11, 0);
  const dieTop = 0.22;
  const faceMats = FACE_ORDER.map((n) => { const t = T(pipCanvas(n)); return B(0xffffff, { map: t }); });
  geos.push(new THREE.BoxGeometry(BOARD.DIE, BOARD.DIE, BOARD.DIE));
  const die = new THREE.Mesh(geos[geos.length - 1], faceMats); die.position.set(0, dieTop + BOARD.DIE / 2 + 1.6, 0); root.add(die);
  const shadowMat = B(0x000000, { transparent: true, opacity: 0.45, depthWrite: false });
  const shadow = mesh(new THREE.CircleGeometry(1.7, 16), shadowMat, 0, dieTop + 0.02, 0); shadow.rotation.x = -Math.PI / 2;
  const dieState = { value: 1, q: new THREE.Quaternion(), anim: null, idleT: 0, onBounce: null };
  const qFor = (v, yaw = 0) => {
    const n = new THREE.Vector3(...FACE_NORMAL[v]);
    const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
  };
  dieState.q.copy(qFor(1, 0.4)); die.quaternion.copy(dieState.q);

  // ---- turn marker + highlight ring
  const marker = mesh(new THREE.OctahedronGeometry(0.55), B(0xffe27a), 0, 6, 0); marker.scale.set(0.8, 1.3, 0.8); marker.visible = false;
  const hiMat = B(0xffe27a, { transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const hi = mesh(new THREE.RingGeometry(1.25, 1.55, 24), hiMat, 0, BOARD.TOP + 0.03, 0); hi.rotation.x = -Math.PI / 2; hi.visible = false;

  // ---- Administrator's high chair (north edge) + scoreboard sign
  const S = BOARD.SEAT, dark = B(0x17131d), dark2 = B(0x241d2c);
  mesh(new THREE.BoxGeometry(2.6, 0.3, 2.3), dark2, S.x, 0.9 - 0.15, S.z);                      // seat top at y = 0.9
  mesh(new THREE.BoxGeometry(2.6, 4.6, 0.35), dark, S.x, 3.0, S.z - 1.2);                        // tall back
  mesh(new THREE.BoxGeometry(0.35, 1.6, 0.35), dark, S.x - 1.2, 1.7, S.z - 1.2);                 // back posts
  mesh(new THREE.BoxGeometry(0.35, 1.6, 0.35), dark, S.x + 1.2, 1.7, S.z - 1.2);
  for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.4, 0.9, 2.2), dark, S.x + sx * 1.4, 1.1, S.z);   // arm rests
  mesh(new THREE.BoxGeometry(6, 0.14, 2.2), B(0x2b2620), S.x, 0.07, S.z + 2.3);                  // his blotter on the table
  const sbC = canvas(512, 256), sbX = sbC.getContext('2d'), sbT = T(sbC);
  const sb = mesh(new THREE.PlaneGeometry(9, 4.5), B(0xffffff, { map: sbT, side: THREE.DoubleSide }), -10.5, 5.6, -14.6); sb.rotation.y = 0.28;
  mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), dark, -13.8, 2.8, -14.6); mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), dark, -7.2, 2.8, -14.6);
  const drawScore = (o = {}) => {
    sbX.fillStyle = '#07070c'; sbX.fillRect(0, 0, 512, 256);
    sbX.strokeStyle = '#7f8ab0'; sbX.lineWidth = 4; sbX.strokeRect(4, 4, 504, 248);
    sbX.textAlign = 'left'; sbX.fillStyle = '#e8ecff'; sbX.font = 'bold 40px monospace';
    sbX.fillText(o.title || 'TURN 1 / 12', 18, 50);
    sbX.font = '22px monospace';
    (o.rows || []).slice(0, 4).forEach((r, i) => {
      const y = 92 + i * 38;
      sbX.fillStyle = r.color || '#bfc6e6'; sbX.fillText(String(r.name).slice(0, 12), 18, y);
      sbX.fillStyle = '#242838'; sbX.fillRect(190, y - 20, 300, 22);
      sbX.fillStyle = r.color || '#8fd0ff'; sbX.fillRect(190, y - 20, Math.round(300 * Math.min(1, r.pos / 23)), 22);
      sbX.fillStyle = '#ffffff'; sbX.fillText(r.done ? 'EXIT' : String(r.pos), 428, y);
    });
    sbT.needsUpdate = true;
  };
  drawScore();

  // ---- props for scale: chip stacks, giant cards, a mug
  const chip = [0xc4202a, 0x1a4fb0, 0xe8e2c8, 0x1e8a3e];
  [[-16.5, 14], [16.5, 14], [17, -13], [-17, 9.5]].forEach(([px, pz], k) => { for (let n = 0; n < 6 + k; n++) mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 14), B(chip[(k + (n % 2)) % 4]), px, 0.09 + n * 0.19, pz); });
  const cardMat = B(0xe9e6dc), cardBack = B(0x7a1420);
  for (const [px, pz, ry] of [[15, -15, 0.5], [-16.5, 3, -0.4]]) { const c = mesh(new THREE.BoxGeometry(3, 0.06, 4.4), [cardMat, cardMat, cardBack, cardMat, cardMat, cardMat], px, 0.1, pz); c.rotation.y = ry; }
  mesh(new THREE.CylinderGeometry(1.3, 1.1, 2.2, 14), B(0xd8d4c8), 6.5, 1.1, -15.5);
  mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 14), B(0x2a1a10), 6.5, 2.2, -15.5);

  // ---- drifting dust motes (Points; positions animated on the CPU)
  const N = 140, pos = new Float32Array(N * 3); let ds = 3;
  const dr = () => { ds = (Math.imul(ds, 1664525) + 1013904223) >>> 0; return ds / 4294967296; };
  const base = []; for (let i = 0; i < N; i++) { base.push([(dr() - 0.5) * 42, 1 + dr() * 15, (dr() - 0.5) * 38, dr() * 6.28]); }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geos.push(dGeo);
  const dust = new THREE.Points(dGeo, M(new THREE.PointsMaterial({ color: 0xa8b4d8, size: 0.14, transparent: true, opacity: 0.55, depthWrite: false })));
  dust.frustumCulled = false; root.add(dust);

  const tilePos = (i, out = new THREE.Vector3()) => { const t = tiles[((i % 24) + 24) % 24]; return out.set(t.x, BOARD.TOP, t.z); };
  const api = {
    root, tiles, die, dieTop,
    tilePos,
    /** where the k-th of n players stands on tile i (top surface) */
    tokenPos(i, k = 0, n = 1, out = new THREE.Vector3()) { tilePos(i, out); const o = slotOffset(k, n, 1.0); out.x += o.x; out.z += o.z; return out; },
    /** yaw that faces the table centre from tile i (game convention: forward = (-sin, -cos)) */
    yawToCenter(i) { const t = tiles[i]; return Math.atan2(t.x, t.z); },
    admin: { seat: new THREE.Vector3(S.x, 1.0 - 1.6, S.z), yaw: 0 },   // root of the sitting figure: hips (local y 1.6) 0.1 above the seat top (y 0.9)
    colliders: [[0, BOARD.TOP - 0.6, 0, BOARD.HALF_X + 1, 0.6, BOARD.HALF_Z + 1]],   // top face flush with the tiles (y = TOP)
    lights: [
      { x: 0, y: 11, z: 0, color: 0xffe2b0, intensity: 1.1, distance: 34 },
      { x: 0, y: 6.5, z: -12, color: 0x9db4ff, intensity: 0.9, distance: 24 },
      { x: -15, y: 5, z: 12, color: 0x6a8cff, intensity: 0.7, distance: 22 },
      { x: 15, y: 5, z: 12, color: 0xff8a6a, intensity: 0.7, distance: 22 },
    ],
    setTurn(i) { if (i == null) { marker.visible = false; hi.visible = false; return; } const t = tiles[i]; marker.visible = hi.visible = true; marker.position.set(t.x, 5.6, t.z); hi.position.set(t.x, BOARD.TOP + 0.03, t.z); },
    drawScore,
    /** roll animation (host already knows the value): three decaying bounces at the arena, ends exactly on `value` up */
    rollDie(value, seed = 1, ms = 1900) {
      let s = (seed >>> 0) || 1; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      dieState.anim = { t: 0, T: ms / 1000, value, qEnd: qFor(value, r() * Math.PI * 2), axis, spin: 9 + r() * 5, x0: (r() - 0.5) * 10, z0: (r() - 0.5) * 8 + 4, lastB: 0 };
      dieState.value = value;
    },
    dieBusy: () => !!dieState.anim,
    onBounce(fn) { dieState.onBounce = fn; },
    update(dt, time) {
      dieState.idleT += dt;
      const a = dieState.anim, rest = dieTop + BOARD.DIE / 2;
      if (a) {
        a.t += dt;
        const u = Math.min(1, a.t / a.T), e = ease(u);
        const ph = u * 3;                                    // three bounces
        const bounce = Math.abs(Math.sin(ph * Math.PI)) * Math.pow(1 - u, 1.6) * 9;
        const b = Math.floor(ph);
        if (b > a.lastB && b < 3) { a.lastB = b; dieState.onBounce?.(b); }
        die.position.set(a.x0 * (1 - e), rest + bounce, a.z0 * (1 - e));
        const spin = a.spin * (1 - e) * (1 - e);
        die.quaternion.copy(a.qEnd).multiply(new THREE.Quaternion().setFromAxisAngle(a.axis, spin));
        shadow.position.set(die.position.x, dieTop + 0.02, die.position.z);
        shadow.scale.setScalar(Math.max(0.5, 1.2 - bounce * 0.06));
        if (u >= 1) { die.quaternion.copy(a.qEnd); dieState.q.copy(a.qEnd); dieState.anim = null; dieState.onBounce?.(3); }
      } else {
        const idle = a === null && !dieState.hold;
        die.position.set(0, rest + 0.4 + Math.sin(dieState.idleT * 1.4) * 0.15, 0);
        if (idle) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(dieState.idleT * 0.4) * 0.15); die.quaternion.copy(q.multiply(dieState.q)); }
        shadow.position.set(0, dieTop + 0.02, 0); shadow.scale.setScalar(1.15);
      }
      if (marker.visible) { marker.rotation.y += dt * 1.6; marker.position.y = 5.6 + Math.sin(dieState.idleT * 3) * 0.35; hiMat.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(dieState.idleT * 5)); }
      // dust
      const t = dieState.idleT; const p = dGeo.attributes.position;
      for (let i = 0; i < N; i++) { const b0 = base[i]; p.setXYZ(i, b0[0] + Math.sin(t * 0.13 + b0[3]) * 1.5, b0[1] + Math.sin(t * 0.21 + b0[3] * 2) * 0.8, b0[2] + Math.cos(t * 0.11 + b0[3]) * 1.5); }
      p.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
  return api;
}
