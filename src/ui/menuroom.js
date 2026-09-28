// The main menu's "Content Review Cell 07": you sit strapped in a moderation chair facing the big CRT (the menu). Alternate A / D to
// file an appeal and break the straps, stand up and walk the cell in first person: a one-way mirror with a delayed copy of you,
// walls of CRT feeds, a filing cabinet of lore, an ENGAGE-O-MAT vending machine, a ticket printer, a ringing phone, a locked door
// that opens for the right lullaby, a rainy window, an old terminal (LOST_ACCOUNT.EXE, DEAD FEED arcade) and a dusty piano behind the
// chair. Everything is procedural three.js. Installed by CRTMenu (src/ui/crtmenu.js) via `new MenuRoom(menu, deps)`.
import * as THREE from 'three';
import './menuroom.css';
import { t, getLang } from '../core/i18n.js';
import { L, pick, NOTES, SLIPS, PHONE_LINES, PHONE_IDLE, VEND, POSTERS, SECRET_INFO } from './menulore.js';
import { TerminalUI } from './menuterminal.js';
import { PianoSynth, TuneMatcher, buildPiano, buildStool, KEYMAP, KEY_LABELS, midiOf, noteName, isBlack } from './menupiano.js';

// ------------------------------------------------------------------------------------------------ layout constants
export const SEAT = { x: 0.75, z: 2.75 };
const SEAT_DROP = -0.30;          // eye height below the old cinematic camera while seated
const EYE_STAND = 1.68;
const RADIUS = 0.28;
const DOOR = { x0: -3.1, x1: -2.1, z: 4.6 };
const PIANO_POS = { x: 1.25, z: 4.27 };
const PIANO_EYE = { x: 1.25, y: 1.27, z: 3.31, yaw: Math.PI, pitch: -0.42 };
const PIANO_EXIT = { x: 1.85, z: 3.1 };
const PLAYER_START_FWD = 0.62;    // how far the standing player steps out of the chair
const bx = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
export const STATIC_COLLIDERS = [
  bx(-5, -4.5, -3.7, 5.1), bx(4.5, 5, -3.7, 5.1), bx(-5, 5, -3.7, -3.2),            // left / right / back wall
  bx(-5, DOOR.x0, 4.6, 5.1), bx(DOOR.x1, 5, 4.6, 5.1),                              // front wall (door gap in between)
  bx(-3.4, DOOR.x0, 5.1, 6.3), bx(DOOR.x1, -1.8, 5.1, 6.3), bx(-3.4, -1.8, 6.0, 6.3), // alcove behind the door
  bx(-1.9, 2.2, -0.35, 0.75),                                                        // table
  bx(-3.0, 3.6, -1.75, -0.7),                                                        // monitor shelving
  bx(-3.9, -3.3, -3.2, -2.55),                                                       // filing cabinet
  bx(3.1, 3.9, -3.2, -2.5),                                                          // server rack
  bx(0.46, 2.04, 3.7, 4.6), bx(1.05, 1.45, 3.16, 3.56),                              // piano + stool
  bx(0.45, 1.05, 2.45, 3.05),                                                        // the chair
  bx(3.65, 4.5, 2.85, 3.85), bx(3.85, 4.5, 1.15, 1.85), bx(3.7, 4.5, -0.5, 0.5),      // vending, printer, TV cart
  bx(4.0, 4.5, -2.9, -0.9), bx(-4.5, -3.6, 2.3, 3.9),                                 // CRT stack, terminal desk
];
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (x) => { x = clampN(x, 0, 1); return x * x * (3 - 2 * x); };
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const lerpA = (a, b, k) => a + wrapA(b - a) * k;

/** Push the circle (p.x,p.z,r) out of every box (mutates p). Pure, unit-tested in node. */
export function resolveCircle(p, r, boxes) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = clampN(p.x, b.x0, b.x1), cz = clampN(p.z, b.z0, b.z1);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else {   // centre is inside the box: leave through the nearest face
        const l = p.x - b.x0, rr = b.x1 - p.x, f = p.z - b.z0, bk = b.z1 - p.z, m = Math.min(l, rr, f, bk);
        if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === f) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
  }
  return p;
}

const SUIT = { orange: 0xd9642b, green: 0x4f8a3a, blue: 0x2f5fb0, purple: 0x6d3fa6, pink: 0xe07aa8, black: 0x26262b, white: 0xd8d6cf, yellow: 0xe2c02e, red: 0xb3262a, camo: 0x5e6b3c, teal: 0x2a8f8a, brown: 0x7a5231, kefal: 0x8fa9bd, gold: 0xc9a227 };
const TAPE = [
  L('ONBOARDING_v7.mpg', 'ONBOARDING_v7.mpg'), L('Welcome to the team!', 'Ekibe hoş geldin!'), L('You are now a Creator.', 'Artık bir İçerik Üreticisisin.'),
  L('Smile. Your first upload matters.', 'Gülümse. İlk yüklemen önemli.'), L('...', '...'), L('Why are you not smiling?', 'Neden gülümsemiyorsun?'),
  L('Someone is behind you.', 'Arkanda biri var.'), L('It is you. It is always you.', 'Sensin. Hep sensin.'),
];

let bootedOnce = false;
const elm = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const lam = (c, extra) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const bas = (c, extra) => new THREE.MeshBasicMaterial({ color: c, ...extra });

export class MenuRoom {
  constructor(menu, deps) {
    this.menu = menu; this.deps = deps; this.app = menu.app; this.engine = menu.engine; this.scene = menu.scene;
    this.cam = this.engine.camera;
    this.origFov = this.cam.fov; this.origOrder = this.cam.rotation.order;
    this.t = 0; this.errs = 0; this.disposed = false;
    this.state = 'seated'; this.stateT = 0;
    this.unstrapped = false; this.progress = 0; this.lastSide = 0; this.sinceStruggle = 9; this.idle = 0; this.hint = false; this.struggleCount = 0;
    this.rig = { x: SEAT.x, y: 1.3, z: SEAT.z, yaw: 0, pitch: 0, roll: 0 };
    this.snap = { ...this.rig };
    this.free = { x: SEAT.x, z: 2.15, yaw: 0, pitch: 0, bob: 0, step: 0 };
    this.cin = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.seatYaw = Math.atan2(0.9, 3.65);
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this.mouse = { x: 0, y: 0 };
    this.colliders = STATIC_COLLIDERS.slice();
    this.doorBox = bx(DOOR.x0, DOOR.x1, 4.6, 5.1);
    this.colliders.push(this.doorBox);
    this.doorAngle = 0; this.doorOpenWanted = false;
    this.hist = []; this.histAcc = 0;
    this.standMix = 0; this.lampOn = true; this.lampBurst = 0;
    this.modal = null; this.toastT = 0; this.needClick = false; this.unlockIntentional = false;
    this.octave = 4; this.held = new Map(); this.noteCount = 0; this.lastNotes = [];
    this.vendBought = new Set(); this.noteIdx = 0; this.notesRead = new Set(); this.slipCount = 0; this.slipAnim = 0;
    this.phone = { next: 28 + Math.random() * 20, ringing: 0, rings: 0, next2: 0, anim: 0 };
    this.tape = { active: 0 };
    this.screensAcc = 0; this.rainAcc = 0; this.feedAcc = 0; this.feedIdx = 0;
    this.propScreens = []; this.interactables = []; this.target = null;
    this.matcher = new TuneMatcher();
    this.synth = new PianoSynth(this.app.audio);

    const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('[menuroom] ' + name + ' failed', e); } };
    try { this.buildShell(); } catch (e) { console.warn('[menuroom] shell failed', e); this.menu.buildBasicWalls?.(); }
    safe('booth', () => this.buildBooth());
    safe('window', () => this.buildWindow());
    safe('door', () => this.buildDoor());
    safe('chair', () => this.buildChair());
    safe('arms', () => this.buildArms());
    safe('piano', () => this.buildPianoSet());
    safe('feeds', () => this.buildFeeds());
    safe('props', () => this.buildProps());
    safe('posters', () => this.buildPosters());
    safe('copy', () => this.buildCopy());
    safe('interactables', () => this.buildInteractables());
    this.buildUI();
    this.terminal = new TerminalUI({
      audio: this.app.audio, profile: this.app.profile,
      secrets: () => this.secrets(), unlock: (id) => this.unlock(id), name: () => this.app.profile?.name || 'Employee',
      score: (k) => this.secrets().scores?.[k] || 0,
      setScore: (k, n) => { const s = this.secrets(); s.scores = { ...(s.scores || {}), [k]: n }; this.save(); },
      onClose: () => { this.uiShow(this.ui.cross, this.state === 'free'); if (this.state === 'free') this.relock(); },
    });
    this.bindEvents();
  }

  // ------------------------------------------------------------------------------------------------ helpers
  secrets() { const p = this.app.profile; if (!p.menuSecrets || typeof p.menuSecrets !== 'object') p.menuSecrets = {}; return p.menuSecrets; }
  save() { try { this.deps.saveProfile?.(this.app.profile); } catch { /* ignore */ } }
  unlock(id) {
    const s = this.secrets();
    if (s[id]) return false;
    s[id] = true; this.save();
    this.app.audio?.ui?.('ui_levelup', 0.6);
    const info = SECRET_INFO[id];
    if (!this.terminal?.active) this.toast('★ ' + t('SECRET UNLOCKED') + ': ' + pick(info?.name || id), 4.5, 'gold');
    if (id === 'lullaby' || id === 'approved') this.doorOpenWanted = true;
    return true;
  }
  badges() { const s = this.secrets(); return Object.keys(SECRET_INFO).filter((k) => s[k]).map((k) => SECRET_INFO[k].glyph).join(' '); }
  isVerified() { return !!this.secrets().verified; }
  doorUnlocked() { const s = this.secrets(); return !!(s.approved || s.lullaby); }
  sfx(name, vol = 0.6) { this.app.audio?.play?.(name, { volume: vol, bus: 'sfx' }); }
  menuActive() { return this.state === 'seated' && !this.boot?.active && !this.terminal?.active && !this.modal; }
  quad(w, h, mat) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * h / 3);
    return new THREE.Mesh(g, mat);
  }
  box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); (parent || this.scene).add(m); return m;
  }
  canvasTex(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    return { c, x: c.getContext('2d'), tex };
  }

  // ------------------------------------------------------------------------------------------------ building the cell
  buildShell() {
    const mat = this.deps.levelMaterial('concrete_stained');
    const wall = (kind, fixed, a0, a1, y0, y1) => {
      if (a1 - a0 < 0.001 || y1 - y0 < 0.001) return;
      const m = this.quad(a1 - a0, y1 - y0, mat), ac = (a0 + a1) / 2, yc = (y0 + y1) / 2;
      if (kind === 'L') { m.position.set(fixed, yc, ac); m.rotation.y = Math.PI / 2; }
      else if (kind === 'R') { m.position.set(fixed, yc, ac); m.rotation.y = -Math.PI / 2; }
      else if (kind === 'B') m.position.set(ac, yc, fixed);
      else { m.position.set(ac, yc, fixed); m.rotation.y = Math.PI; }
      this.scene.add(m);
    };
    // left wall has two holes: the one-way mirror (z -2.9..-1.0) and the rainy window (z -0.3..1.5)
    wall('L', -4.5, -3.2, -2.9, 0, 4); wall('L', -4.5, -2.9, -1.0, 0, 0.9); wall('L', -4.5, -2.9, -1.0, 2.3, 4);
    wall('L', -4.5, -1.0, -0.3, 0, 4); wall('L', -4.5, -0.3, 1.5, 0, 1.2); wall('L', -4.5, -0.3, 1.5, 2.7, 4); wall('L', -4.5, 1.5, 4.6, 0, 4);
    wall('R', 4.5, -3.2, 4.6, 0, 4); wall('B', -3.2, -4.5, 4.5, 0, 4);
    wall('F', 4.6, -4.5, DOOR.x0, 0, 4); wall('F', 4.6, DOOR.x1, 4.5, 0, 4); wall('F', 4.6, DOOR.x0, DOOR.x1, 2.2, 4);
  }

  buildBooth() {
    // observation booth behind the one-way mirror (left wall): dark room with a glowing back panel so the copy shows as a silhouette
    const room = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.0, 2.9), bas(0x070b0f, { side: THREE.BackSide }));
    room.position.set(-6.3, 1.5, -1.95); this.scene.add(room);
    this.boothPanelMat = bas(0x2a3a48);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), this.boothPanelMat);
    panel.position.set(-8.08, 1.55, -1.95); panel.rotation.y = Math.PI / 2; this.scene.add(panel);
    this.glassMat = bas(0x0b1418, { transparent: true, opacity: 0.88, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.4), this.glassMat);
    glass.position.set(-4.49, 1.6, -1.95); glass.rotation.y = Math.PI / 2; this.scene.add(glass);
    const frame = lam(0x141312);
    this.box(0.08, 0.08, 2.0, frame, -4.47, 0.9, -1.95); this.box(0.08, 0.08, 2.0, frame, -4.47, 2.3, -1.95);
    this.box(0.08, 1.48, 0.08, frame, -4.47, 1.6, -2.9); this.box(0.08, 1.48, 0.08, frame, -4.47, 1.6, -1.0);
    this.box(0.2, 0.05, 2.0, lam(0x1c1a18), -4.42, 0.88, -1.95);   // sill
    this.boothLit = 0;
  }

  buildWindow() {
    const cv = this.canvasTex(96, 72); this.rain = cv; this.rainDrops = [];
    for (let i = 0; i < 46; i++) this.rainDrops.push({ x: Math.random() * 96, y: Math.random() * 72, s: 60 + Math.random() * 70 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.5), new THREE.MeshBasicMaterial({ map: cv.tex }));
    m.position.set(-4.62, 1.95, 0.6); m.rotation.y = Math.PI / 2; this.scene.add(m);
    const frame = lam(0x171513);
    this.box(0.1, 0.07, 1.95, frame, -4.46, 1.2, 0.6); this.box(0.1, 0.07, 1.95, frame, -4.46, 2.7, 0.6);
    this.box(0.1, 1.5, 0.07, frame, -4.46, 1.95, -0.3); this.box(0.1, 1.5, 0.07, frame, -4.46, 1.95, 1.5); this.box(0.1, 1.5, 0.05, frame, -4.46, 1.95, 0.6);
    this.box(0.1, 0.05, 1.8, frame, -4.46, 1.95, 0.6);
    this.drawRain(0);
  }

  buildDoor() {
    const frame = lam(0x1c1b19), steel = lam(0x555a5c);
    this.box(0.12, 2.3, 0.12, frame, DOOR.x0 - 0.06, 1.15, 4.53); this.box(0.12, 2.3, 0.12, frame, DOOR.x1 + 0.06, 1.15, 4.53);
    this.box(1.24, 0.12, 0.12, frame, (DOOR.x0 + DOOR.x1) / 2, 2.26, 4.53);
    // hinge pivot on the left jamb; the leaf swings inward-out (toward +z) when the appeal is approved
    this.doorPivot = new THREE.Group(); this.doorPivot.position.set(DOOR.x0, 0, 4.55); this.scene.add(this.doorPivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), steel); leaf.position.set(0.5, 1.1, 0); this.doorPivot.add(leaf);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.09), lam(0xb0a070)); handle.position.set(0.86, 1.05, -0.04); this.doorPivot.add(handle);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.065), lam(0x8a2a1c)); stripe.position.set(0.5, 1.9, 0); this.doorPivot.add(stripe);
    // sign + red light above the door
    const cv = this.canvasTex(256, 64); this.doorSign = cv;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: cv.tex }));
    sign.position.set((DOOR.x0 + DOOR.x1) / 2, 2.62, 4.585); sign.rotation.y = Math.PI; this.scene.add(sign);
    this.doorLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bas(0xff2a14)); this.doorLamp.position.set((DOOR.x0 + DOOR.x1) / 2, 2.42, 4.55); this.scene.add(this.doorLamp);
    this.drawDoorSign();
    // alcove behind the door: dark void with one glowing plaque
    const dark = lam(0x0d0d0f);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), dark); back.position.set(-2.6, 1.15, 6.0); back.rotation.y = Math.PI; this.scene.add(back);
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), dark); lw.position.set(DOOR.x0, 1.15, 5.3); lw.rotation.y = Math.PI / 2; this.scene.add(lw);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.3), dark); rw.position.set(DOOR.x1, 1.15, 5.3); rw.rotation.y = -Math.PI / 2; this.scene.add(rw);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), dark); ceil.position.set(-2.6, 2.3, 5.3); ceil.rotation.x = Math.PI / 2; this.scene.add(ceil);
    const pc = this.canvasTex(128, 64);
    pc.x.fillStyle = '#031a0c'; pc.x.fillRect(0, 0, 128, 64); pc.x.fillStyle = '#48ff8a'; pc.x.font = 'bold 15px monospace'; pc.x.textAlign = 'center';
    pc.x.fillText('APPEAL', 64, 26); pc.x.fillText('APPROVED', 64, 46); pc.tex.needsUpdate = true;
    this.plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: pc.tex })); this.plaque.position.set(-2.6, 1.3, 5.97); this.plaque.rotation.y = Math.PI; this.scene.add(this.plaque);
  }
  drawDoorSign() {
    const { x, c, tex } = this.doorSign;
    const ok = this.doorUnlocked();
    x.fillStyle = '#0a0304'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = ok ? '#48ff8a' : '#ff3a2a'; x.font = 'bold 20px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (ok) { x.fillText('APPEAL APPROVED', 128, 32); } else { x.font = 'bold 16px monospace'; x.fillText('CONTENT MODERATION', 128, 20); x.fillText('IN PROGRESS', 128, 44); }
    tex.needsUpdate = true;
  }

  buildChair() {
    const g = new THREE.Group(); g.position.set(SEAT.x, 0, SEAT.z); g.rotation.y = this.seatYaw; this.scene.add(g);
    const dark = lam(0x1c1c1e), steel = lam(0x4a4e52), pad = lam(0x3a2a24);
    this.box(0.52, 0.09, 0.52, pad, 0, 0.5, 0, g);
    this.box(0.5, 0.62, 0.08, pad, 0, 0.86, 0.26, g);
    for (const sx of [-0.3, 0.3]) { this.box(0.07, 0.05, 0.46, steel, sx, 0.72, 0.02, g); this.box(0.05, 0.22, 0.05, steel, sx, 0.6, 0.2, g); }
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), steel); col.position.y = 0.25; g.add(col);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.05, 8), dark); base.position.y = 0.04; g.add(base);
    // moderation restraints (straps over the armrests + chest); they stay in the room, cut, once you break free
    this.chairStraps = [];
    const strapMat = lam(0x101010), led = bas(0xff2a14);
    for (const sx of [-0.3, 0.3]) {
      const s = new THREE.Group(); s.position.set(sx, 0.77, -0.08);
      s.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.12), strapMat));
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), led); l.position.set(0, 0.03, 0); s.add(l);
      g.add(s); this.chairStraps.push({ g: s, led: l, vy: 0, spin: 0 });
    }
    const chest = new THREE.Group(); chest.position.set(0, 0.95, 0.19); chest.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.04), strapMat)); g.add(chest);
    this.chairStraps.push({ g: chest, led: null, vy: 0, spin: 0 });
    this.chair = g;
  }

  buildArms() {
    // first-person forearms strapped to the armrests (children of the camera, only visible while seated)
    const suit = SUIT[this.app.profile?.suit] ?? 0xd9642b;
    const arms = new THREE.Group();
    this.armStraps = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(sx * 0.28, -0.205, -0.42); a.rotation.set(0.10, -sx * 0.30, sx * 0.05);
      a.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.44), lam(suit)));
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.1), lam(0xc99a78)); hand.position.set(0, 0, -0.26); a.add(hand);
      const strap = new THREE.Group(); strap.position.set(0, 0.005, -0.06);
      strap.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.11), lam(0x0d0d0d)));
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.025), bas(0xff2a14)); l.position.set(0, 0.03, 0); strap.add(l);
      a.add(strap); arms.add(a); this.armStraps.push({ g: strap, led: l, arm: a, sx });
    }
    this.arms = arms; this.cam.add(arms);
  }

  buildPianoSet() {
    this.piano = buildPiano();
    this.piano.group.position.set(PIANO_POS.x, 0, PIANO_POS.z); this.piano.group.rotation.y = Math.PI; this.scene.add(this.piano.group);
    const stool = buildStool(); stool.position.set(PIANO_POS.x, 0, PIANO_POS.z - 0.91); this.scene.add(stool); this.stool = stool;
  }

  // small CRT wall: four shared "feed" canvases on a few dozen cheap monitors
  buildFeeds() {
    const { CRT_VS, CRT_FS } = this.deps;
    this.feeds = ['corridor', 'static', 'cell', 'ship'].map((kind, i) => {
      const cv = this.canvasTex(128, 96);
      const mat = new THREE.ShaderMaterial({ vertexShader: CRT_VS, fragmentShader: CRT_FS, uniforms: { map: { value: cv.tex }, time: { value: 0 }, power: { value: 1 }, tint: { value: new THREE.Vector3(...(kind === 'ship' ? [0.8, 0.95, 1.1] : kind === 'corridor' ? [0.8, 1.05, 0.85] : [1, 1, 1])) } } });
      mat.defines = { PSX_NOSNAP: '' };
      return { kind, cv, mat, phase: i * 1.7 };
    });
    const shellMat = lam(0x24221f), geo = new THREE.BoxGeometry(0.42, 0.44, 0.5), sg = new THREE.PlaneGeometry(0.4, 0.32);
    let n = 0;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 5; r++) {
        const z = -2.65 + c * 0.5, y = 0.42 + r * 0.5;
        const shell = new THREE.Mesh(geo, shellMat); shell.position.set(4.29, y, z); this.scene.add(shell);
        const scr = new THREE.Mesh(sg, this.feeds[(c * 2 + r * 3 + (r % 2)) % 4].mat); scr.position.set(4.075, y + 0.02, z); scr.rotation.y = -Math.PI / 2; this.scene.add(scr);
        n++;
      }
    }
    this.feedCount = n;
  }

  buildProps() {
    const { makeCRT, createAnyProp } = this.deps;
    const put = (id, x, y, z, ry) => { try { const o = createAnyProp(id, { seed: 5 }); o.position.set(x, y, z); o.rotation.y = ry; this.scene.add(o); return o; } catch (e) { console.warn('[menuroom] prop ' + id, e); return null; } };
    put('vending_machine', 4.05, 0, 3.35, -Math.PI / 2);
    // ticket printer on a stand (right wall)
    const stand = lam(0x2b2d30), body = lam(0xc9c2b0);
    this.box(0.5, 0.9, 0.6, stand, 4.2, 0.45, 1.5); this.box(0.42, 0.22, 0.34, body, 4.15, 1.01, 1.5);
    this.box(0.04, 0.03, 0.22, bas(0x101010), 4.0, 1.06, 1.5);
    this.slip = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.34), bas(0xf2efe2)); this.slip.rotation.x = -Math.PI / 2; this.slip.rotation.z = Math.PI / 2; this.slip.position.set(3.85, 1.09, 1.5); this.slip.visible = false; this.scene.add(this.slip);
    // VHS cart with a small TV
    this.box(0.7, 0.7, 0.9, stand, 4.15, 0.35, 0); this.box(0.36, 0.08, 0.26, lam(0x111214), 4.0, 0.74, 0.0);
    this.tv = makeCRT({ w: 0.42, h: 0.32, depth: 0.4, canvasW: 160, canvasH: 120, tint: [0.9, 1, 1.1] });
    this.tv.group.position.set(4.0, 1.02, 0); this.tv.group.rotation.y = -Math.PI / 2; this.scene.add(this.tv.group);
    this.tv.draw = (c, tt) => this.drawTV(c, tt); this.propScreens.push(this.tv);
    // second computer on a desk (left wall)
    this.box(0.7, 0.74, 1.5, lam(0x3a342c), -4.15, 0.37, 3.1); this.box(0.16, 0.02, 0.42, lam(0xb8b09c), -3.85, 0.75, 3.1);
    this.term = makeCRT({ w: 0.42, h: 0.32, depth: 0.45, canvasW: 200, canvasH: 150, tint: [0.75, 1.1, 0.8], body: 0xb9b19a });
    this.term.group.position.set(-4.0, 1.0, 3.1); this.term.group.rotation.y = Math.PI / 2; this.scene.add(this.term.group);
    this.term.draw = (c, tt) => this.drawTerm(c, tt); this.propScreens.push(this.term);
    // desk lamp + phone on the table
    const lamp = new THREE.Group(); lamp.position.set(1.65, 0.81, -0.12); this.scene.add(lamp);
    lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 8), lam(0x222222)));
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), lam(0x222222)); arm.position.y = 0.22; arm.rotation.z = 0.35; lamp.add(arm);
    this.lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 8, 1, true), bas(0xffd08a, { side: THREE.DoubleSide })); this.lampShade.position.set(-0.07, 0.42, 0); this.lampShade.rotation.z = 0.5; lamp.add(this.lampShade);
    this.lampLight = new THREE.PointLight(0xffc880, 2.2, 5, 1.7); this.lampLight.position.set(1.5, 1.28, 0.05); this.scene.add(this.lampLight);
    // a dim cold fluorescent over the front half of the cell (piano, door, vending) so it is worth walking there; flickers now and then
    this.frontLight = new THREE.PointLight(0xaec4ff, 1.5, 9, 1.3); this.frontLight.position.set(0.2, 3.5, 3.4); this.scene.add(this.frontLight);
    const ph = new THREE.Group(); ph.position.set(1.95, 0.81, 0.5); ph.rotation.y = -0.4; this.scene.add(ph);
    ph.add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.22), lam(0x5a1f18)));
    this.handset = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.2), lam(0x6b261d)); this.handset.position.set(0, 0.06, 0); ph.add(this.handset);
    this.phoneObj = ph;
    // the old junk that was already here
    put('filing_cabinet', -3.6, 0, -2.85, 0); put('server_rack_prop', 3.5, 0, -2.85, -0.2);
  }

  buildPosters() {
    const spots = [
      [4.485, 1.85, 0.0, -Math.PI / 2, 0], [4.485, 1.85, 1.5, -Math.PI / 2, 1], [-1.1, 1.65, 4.585, Math.PI, 2],
      [2.95, 1.65, 4.585, Math.PI, 3], [-3.6, 1.95, -3.185, 0, 4],
    ];
    for (const [x, y, z, ry, i] of spots) {
      const p = POSTERS[i], cv = this.canvasTex(96, 128);
      cv.x.fillStyle = p.bg; cv.x.fillRect(0, 0, 96, 128);
      cv.x.strokeStyle = p.fg; cv.x.lineWidth = 2; cv.x.strokeRect(4, 4, 88, 120);
      cv.x.fillStyle = p.fg; cv.x.textAlign = 'center'; cv.x.font = 'bold 15px monospace';
      p.lines.forEach((ln, k) => cv.x.fillText(ln, 48, 28 + k * 19 + (4 - p.lines.length) * 7));
      cv.x.font = '8px monospace'; cv.x.fillText(p.sub, 48, 116);
      cv.x.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 14; k++) cv.x.fillRect(Math.random() * 96, Math.random() * 128, 2 + Math.random() * 12, 1);
      cv.tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.75), new THREE.MeshLambertMaterial({ map: cv.tex, emissive: 0x222222, emissiveMap: cv.tex }));
      m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m);
    }
  }

  buildCopy() {
    // the Algorithm's copy of you: a dark figure in the booth that mimics you with a delay
    const suit = SUIT[this.app.profile?.suit] ?? 0xd9642b;
    this.copyMats = [];
    const dk = (c) => { const m = bas(new THREE.Color(c).multiplyScalar(0.16)); m._base = new THREE.Color(c); this.copyMats.push(m); return m; };
    const root = new THREE.Group(); root.position.set(-5.6, 0, -1.95);
    const hip = new THREE.Group(); hip.position.y = 0.85; root.add(hip);
    const mkBox = (w, h, d, mat, x, y, z, par) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); par.add(m); return m; };
    mkBox(0.42, 0.58, 0.22, dk(suit), 0, 0.3, 0, hip);
    const head = new THREE.Group(); head.position.y = 0.74; hip.add(head);
    mkBox(0.24, 0.26, 0.24, dk(0xc99a78), 0, 0, 0, head);
    for (const sx of [-0.06, 0.06]) mkBox(0.035, 0.025, 0.02, bas(0xff2a14), sx, 0.02, 0.122, head);
    const arm = (sx) => { const g = new THREE.Group(); g.position.set(sx * 0.27, 0.55, 0); mkBox(0.1, 0.52, 0.1, dk(suit), 0, -0.26, 0, g); hip.add(g); return g; };
    const leg = (sx) => { const g = new THREE.Group(); g.position.set(sx * 0.11, 0, 0); mkBox(0.15, 0.85, 0.15, dk(0x26262b), 0, -0.42, 0, g); hip.add(g); return g; };
    this.copy = { root, hip, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1), sit: 0, yaw: Math.PI / 2, stareT: 0, stareNext: 26 + Math.random() * 10, knockT: -1, swing: 0, frozen: null, chairBox: null };
    const seat = this.box(0.5, 0.06, 0.5, lam(0x1c1c1e), -5.6, 0.45, -1.95); seat.visible = false; this.copy.chairBox = seat;
    this.scene.add(root);
  }

  buildInteractables() {
    const I = (id, x, y, z, reach, label, act, extra = {}) => this.interactables.push({ id, x, y, z, reach, label, act, cone: extra.cone ?? 0.8, enabled: extra.enabled });
    I('chair', SEAT.x, 0.9, SEAT.z, 1.7, () => '[E] SIT BACK DOWN (return to menu)', () => this.startSit(), { cone: 0.7 });
    I('crt', -1.05, 1.42, 0.55, 3.2, () => '[E] USE THE MONITOR (return to menu)', () => this.startSit(), { cone: 0.93 });
    I('piano', PIANO_POS.x, 0.9, 3.95, 2.1, () => '[E] PLAY THE PIANO', () => this.enterPiano(), { cone: 0.75 });
    I('terminal', -4.0, 1.0, 3.1, 1.9, () => '[E] USE THE TERMINAL', () => this.openTerminal(), { cone: 0.8 });
    I('cabinet', -3.6, 0.9, -2.85, 1.8, () => '[E] OPEN THE FILING CABINET', () => this.openNotes());
    I('vending', 4.0, 1.0, 3.35, 1.9, () => '[E] ENGAGE-O-MAT', () => this.openVend());
    I('printer', 4.1, 1.0, 1.5, 1.7, () => '[E] TAKE THE REVIEW SLIP', () => this.printSlip());
    I('phone', 1.95, 0.9, 0.5, 1.8, () => (this.phone.ringing ? '[E] ANSWER THE PHONE' : '[E] PICK UP THE PHONE'), () => this.answerPhone());
    I('mirror', -4.5, 1.6, -1.95, 2.3, () => '[E] KNOCK ON THE GLASS', () => this.knock(), { cone: 0.75 });
    I('door', -2.6, 1.1, 4.6, 2.0, () => '[E] TRY THE DOOR', () => this.tryDoor(), { enabled: () => !(this.doorAngle > 1.2) });
    I('plaque', -2.6, 1.3, 5.9, 2.2, () => '[E] READ THE PLAQUE', () => this.readPlaque(), { enabled: () => this.doorAngle > 1.2, cone: 0.7 });
    I('lamp', 1.6, 1.0, -0.12, 2.0, () => '[E] TOGGLE THE LAMP', () => { this.lampOn = !this.lampOn; this.sfx('flashlight_click', 0.5); });
    I('tv', 4.0, 1.0, 0, 1.9, () => '[E] PLAY THE TAPE', () => this.playTape());
  }

  // ------------------------------------------------------------------------------------------------ DOM
  buildUI() {
    const root = elm('div', 'cell-ui'); this.ui = { root };
    this.ui.cross = elm('div', 'cell-cross hidden'); this.ui.prompt = elm('div', 'cell-prompt hidden'); this.ui.toast = elm('div', 'cell-toast hidden');
    this.ui.resume = elm('div', 'cell-resume hidden', escapeHtml(t('CLICK TO RESUME')));
    this.ui.appeal = elm('div', 'cell-appeal hidden', '<div class="ca-title"></div><div class="ca-sub"></div><div class="ca-bar"><i></i></div><div class="ca-keys"><b>A</b><b>D</b></div><div class="ca-pct"></div>');
    this.ui.modal = elm('div', 'cell-modal hidden', '<div class="cm-card"><div class="cm-title"></div><div class="cm-body"></div><div class="cm-foot"></div></div>');
    this.ui.pianoHud = elm('div', 'cell-piano hidden');
    this.ui.boot = elm('div', 'cell-boot hidden');
    this.ui.roam = elm('div', 'cell-roamhint hidden');
    root.append(this.ui.cross, this.ui.prompt, this.ui.toast, this.ui.resume, this.ui.appeal, this.ui.modal, this.ui.pianoHud, this.ui.roam, this.ui.boot);
    document.body.appendChild(root);
    // piano legend: white keys row + black keys overlay
    const whites = [0, 2, 4, 5, 7, 9, 11, 12], blacks = { 1: 0.5, 3: 1.5, 6: 3.5, 8: 4.5, 10: 5.5 };
    let html = '<div class="cp-keys">';
    for (const k of whites) html += `<div class="cp-w" data-k="${k}"><span>${KEY_LABELS[k]}</span></div>`;
    for (const [k, pos] of Object.entries(blacks)) html += `<div class="cp-b" data-k="${k}" style="left:calc(${pos + 1} * 12.5% - 1.6%)"><span>${KEY_LABELS[k]}</span></div>`;
    html += '</div><div class="cp-info"><b class="cp-oct"></b> <span class="cp-notes"></span></div><div class="cp-help"></div>';
    this.ui.pianoHud.innerHTML = html;
    this.ui.cpKeys = {}; for (const e of this.ui.pianoHud.querySelectorAll('[data-k]')) this.ui.cpKeys[e.dataset.k] = e;
    this.setBadgeVisibility();
  }
  setBadgeVisibility() { /* badges are drawn on the player-card CRT by crtmenu.js */ }
  uiShow(elm2, on) { if (elm2) elm2.classList.toggle('hidden', !on); }
  toast(text, sec = 4, cls = '') {
    const e = this.ui.toast; e.textContent = text; e.className = 'cell-toast ' + cls; this.toastT = sec;
  }
  openModal(title, body, foot, kind, extra) {
    this.modal = { kind, ...extra };
    const m = this.ui.modal; m.querySelector('.cm-title').textContent = title; m.querySelector('.cm-body').textContent = body; m.querySelector('.cm-foot').textContent = foot || '';
    m.classList.remove('hidden');
  }
  setModal(body, foot) { const m = this.ui.modal; if (body != null) m.querySelector('.cm-body').textContent = body; if (foot != null) m.querySelector('.cm-foot').textContent = foot; }
  closeModal() { this.modal = null; this.ui.modal.classList.add('hidden'); }

  // ------------------------------------------------------------------------------------------------ events
  bindEvents() {
    const cv = this.engine.canvas;
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keyUp(e);
    this.onMouse = (e) => { this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1; this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1; this.idle = 0; };
    this.onClick = () => {
      if (this.boot?.active) { this.skipBoot(); return; }
      if (this.state === 'free' && !this.modal && !this.terminal.active) { if (!this.app.input.locked) { this.relock(); this.needClick = false; } else this.interact(); }
      else if (this.modal && this.modal.kind !== 'vend') this.closeModal();
    };
    this.onLock = () => {
      if (this.disposed) return;
      if (document.pointerLockElement) { this.needClick = false; return; }
      if (this.unlockIntentional) { this.unlockIntentional = false; return; }
      if (this.terminal.active) return;
      if (this.modal) { this.closeModal(); this.needClick = true; return; }
      if (this.state === 'piano' || this.state === 'pianoIn') this.exitPiano();
      else if (this.state === 'free' || this.state === 'standing') this.startSit();
    };
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('pointermove', this.onMouse);
    cv.addEventListener('click', this.onClick);
    document.addEventListener('pointerlockchange', this.onLock);
    this.ui.boot.addEventListener('click', this.onClick);
    this.ui.modal.addEventListener('click', () => { if (this.modal && this.modal.kind !== 'vend') this.closeModal(); });
  }
  relock() { if (document.pointerLockElement) return; try { this.app.input.lock(); } catch { /* ignore */ } this.needClick = true; }
  unlockPointer() { if (document.pointerLockElement) { this.unlockIntentional = true; this.app.input.unlock(); } }

  keyDown(e) {
    if (this.disposed || this.terminal.active) return;
    if (this.boot?.active) { this.skipBoot(); return; }
    const code = e.code;
    const interact = code === (this.app.settings?.keys?.interact || 'KeyE') || code === 'KeyE';
    if (this.modal) { this.modalKey(e, interact); return; }
    switch (this.state) {
      case 'seated': {
        this.idle = 0;
        if (this.menu.mode !== 'title' || document.activeElement?.tagName === 'INPUT') return;
        if (this.unstrapped) { if (interact && !e.repeat) { this.standUp(); e.preventDefault(); } return; }
        if (e.repeat) return;
        if (code === 'KeyA' || code === 'ArrowLeft') this.struggleKey(-1);
        else if (code === 'KeyD' || code === 'ArrowRight') this.struggleKey(1);
        break;
      }
      case 'free':
        if (code === 'Escape') { this.startSit(); e.preventDefault(); }
        else if (interact && !e.repeat) { this.interact(); e.preventDefault(); }
        break;
      case 'piano': case 'pianoIn': this.pianoKey(e); break;
      case 'standing': if (code === 'Escape') { this.startSit(); e.preventDefault(); } break;
      default:
    }
  }
  keyUp(e) {
    if (this.disposed) return;
    if (this.state === 'piano' || this.state === 'pianoIn') this.pianoKeyUp(e);
  }
  modalKey(e, interact) {
    const m = this.modal;
    if (e.code === 'Escape') { this.closeModal(); e.preventDefault(); return; }
    if (m.kind === 'notes' && interact && !e.repeat) { this.noteIdx++; this.showNote(); e.preventDefault(); }
    else if (m.kind === 'vend' && /^Digit[1-6]$/.test(e.code)) { this.buy(+e.code.slice(5) - 1); e.preventDefault(); }
    else if (m.kind === 'vend' && /^Numpad[1-6]$/.test(e.code)) { this.buy(+e.code.slice(6) - 1); e.preventDefault(); }
    else if ((m.kind === 'slip' || m.kind === 'phone') && (interact || e.code === 'Enter' || e.code === 'Space') && !e.repeat) { this.closeModal(); e.preventDefault(); }
  }

  // ---- struggle / appeal
  struggleKey(side) {
    if (this.state !== 'seated' || this.unstrapped) return;
    this.idle = 0;
    const alt = side !== this.lastSide;
    this.progress = Math.min(1, this.progress + (alt ? 0.05 : 0.012));
    this.lastSide = side; this.sinceStruggle = 0; this.struggleCount++;
    this.app.audio?.play?.(alt ? 'cloth_rustle' : 'ui_click', { volume: alt ? 0.35 : 0.2, bus: 'sfx' });
    if (this.struggleCount % 5 === 0) this.sfx('hit_metal', 0.25);
  }
  startBreak() {
    this.state = 'breaking'; this.stateT = 0; this.snap = { ...this.rig }; this.unstrapped = true; this.progress = 1; this.hint = false;
    this.sfx('hit_metal', 0.9); this.sfx('spark', 0.5);
    setTimeout(() => { if (!this.disposed) this.sfx('hit_metal', 0.7); }, 200);
    setTimeout(() => { if (!this.disposed) { this.sfx('cloth_rustle', 0.6); this.sfx('door_creak', 0.25); } }, 480);
    this.engine.shake?.(0.5); this.engine.flash?.(0xffffff, 0.25);
    for (const s of this.chairStraps || []) { s.vy = 0.5 + Math.random(); s.spin = (Math.random() - 0.5) * 6; }
  }
  beginStanding() {
    this.state = 'standing'; this.stateT = 0; this.snap = { ...this.rig };
    this.uiShow(this.ui.appeal, false);
    this.toast(t('You are free. Stand up.'), 3.5, 'good');
    this.menu.engine.canvas.style.cursor = 'default';
    this.app.ui?.menuEl?.classList.add('cell-roam');
    this.relock();
  }
  standUp() {   // already unstrapped: get up without the struggle
    this.snap = { ...this.rig }; this.beginStanding();
  }
  startSit() {
    if (this.state === 'sitting' || this.state === 'seated') return;
    this.closeModal(); this.terminal?.active && this.terminal.close();
    this.snap = { ...this.rig };
    this.state = 'sitting'; this.stateT = 0;
    this.unlockPointer(); this.synth.releaseAll();
    this.sfx('cloth_rustle', 0.5);
  }
  finishSit() {
    this.state = 'seated'; this.stateT = 0; this.idle = 0; this.progress = 0;
    this.app.ui?.menuEl?.classList.remove('cell-roam');
    this.uiShow(this.ui.cross, false); this.uiShow(this.ui.prompt, false); this.uiShow(this.ui.roam, false);
    if (this.arms) this.arms.visible = false;
  }

  // ---- interactions
  interact() { if (this.target && this.state === 'free') { this.target.act(); } }
  openTerminal() { this.unlockPointer(); this.uiShow(this.ui.cross, false); this.uiShow(this.ui.prompt, false); this.terminal.open(); }
  openNotes() {
    this.openModal(t('CASE FILES'), '', t('[E] next   [ESC] close'), 'notes'); this.showNote();
  }
  showNote() {
    const n = NOTES[this.noteIdx % NOTES.length];
    this.notesRead.add(n.id);
    this.setModal(pick(n.title) + '\n\n' + pick(n.body), `${(this.noteIdx % NOTES.length) + 1}/${NOTES.length}   ${t('[E] next   [ESC] close')}`);
    this.sfx('item_pickup', 0.3);
    if (this.notesRead.size >= NOTES.length) this.unlock('notes');
  }
  openVend() { this.openModal(t('ENGAGE-O-MAT'), '', t('Pick a slot [1-6]   [ESC] close'), 'vend'); this.renderVend(''); this.sfx('ui_confirm', 0.3); }
  renderVend(msg) {
    const lines = VEND.map((v, i) => `[${i + 1}] ${pad(pick(v.label), 12)} ${this.vendBought.has(v.id) ? '✓' : (v.needs ? '?' : '')}`);
    this.setModal(lines.join('\n') + (msg ? '\n\n' + msg : '\n\n' + t('ENGAGE-O-MAT: buy all five to unlock VERIFIED')), null);
  }
  buy(i) {
    const v = VEND[i]; if (!v || !this.modal) return;
    if (v.needs && [...this.vendBought].filter((x) => x !== 'verified').length < v.needs) { this.sfx('ui_error', 0.4); this.renderVend(t('SOLD OUT')); return; }
    this.vendBought.add(v.id); this.sfx(v.needs ? 'register' : 'coins', 0.6);
    this.renderVend(pick(v.msg));
    if (v.id === 'verified') this.unlock('verified');
  }
  printSlip() {
    const n = 4100 + ((this.slipCount * 37 + (this.app.profile?.name?.length || 3) * 91) % 900);
    const text = pick(SLIPS[this.slipCount % SLIPS.length]).replace('{n}', String(n));
    this.slipCount++; this.slipAnim = 1.2; this.sfx('register', 0.5);
    this.openModal(t('NEW SLIP'), text, t('[ESC] close'), 'slip');
  }
  answerPhone() {
    const ph = this.phone;
    if (ph.ringing) {
      ph.ringing = 0; ph.next = 40 + Math.random() * 45;
      const n = (this.app.profile?.name || 'Employee').replace(/\D+/g, '') || String(100 + Math.floor(Math.random() * 800));
      const line = pick(PHONE_LINES[Math.floor(Math.random() * PHONE_LINES.length)]).replace('{n}', n.slice(0, 4));
      this.toast(t('THE ALGORITHM IS CALLING') + '\n"' + line + '"', 7.5, 'phone');
      this.sfx('walkie_on', 0.5);
    } else this.toast('"' + pick(PHONE_IDLE) + '"', 5, 'phone');
  }
  knock() {
    if (!this.copy || this.copy.knockT >= 0) return;
    this.sfx('hit_metal', 0.35);
    this.copy.knockT = 0;
  }
  tryDoor() {
    if (this.doorUnlocked()) { this.doorOpenWanted = true; this.toast(t('The door swings open. Behind it: nothing. That is the point. APPEAL APPROVED.'), 5, 'good'); return; }
    this.sfx('door_locked', 0.7); this.toast(t('The door is locked. CONTENT MODERATION IN PROGRESS.'), 3.5, 'bad');
  }
  readPlaque() {
    if (this.unlock('approved')) this.toast(t('APPEAL APPROVED') + '.  ' + pick(L('You may leave. You will not.', 'Gidebilirsin. Gitmeyeceksin.')), 5, 'good');
    else this.toast(pick(L('APPEAL STATUS: APPROVED. You may leave. You will not.', 'İTİRAZ DURUMU: ONAYLANDI. Gidebilirsin. Gitmeyeceksin.')), 4, 'good');
  }
  playTape() { this.tape.active = 14; this.tape.t = 0; this.sfx('walkie_static', 0.4); }

  // ---- piano
  enterPiano() {
    this.snap = { ...this.rig }; this.state = 'pianoIn'; this.stateT = 0;
    this.uiShow(this.ui.cross, false); this.uiShow(this.ui.prompt, false);
    this.ui.pianoHud.classList.remove('hidden');
    this.ui.pianoHud.querySelector('.cp-help').textContent = t('[A S D F G H J K] white keys   [W E T Y U] black keys   [Z/X] octave   [SPACE] sustain   [ESC] stand up');
    this.pianoLook = { yaw: 0, pitch: 0 }; this.updateOct();
    this.synth.ready();
  }
  exitPiano() {
    if (this.state !== 'piano' && this.state !== 'pianoIn') return;
    this.snap = { ...this.rig }; this.state = 'pianoOut'; this.stateT = 0;
    this.ui.pianoHud.classList.add('hidden');
    for (const [code, m] of this.held) { this.synth.noteOff(m); this.piano?.press(m, false); }
    this.held.clear(); this.synth.releaseAll();
  }
  updateOct() { const o = this.ui.pianoHud.querySelector('.cp-oct'); if (o) o.textContent = 'OCT ' + this.octave; }
  pianoKey(e) {
    const code = e.code;
    if (code === 'Escape') { this.exitPiano(); e.preventDefault(); return; }
    if (e.repeat) { if (code in KEYMAP || code === 'Space') e.preventDefault(); return; }
    if (code === 'KeyZ') { this.octave = Math.max(3, this.octave - 1); this.updateOct(); return; }
    if (code === 'KeyX') { this.octave = Math.min(5, this.octave + 1); this.updateOct(); return; }
    if (code === 'Space') { this.synth.setSustain(true); e.preventDefault(); return; }
    if (!(code in KEYMAP) || this.held.has(code)) return;
    e.preventDefault();
    const m = midiOf(code, this.octave);
    this.held.set(code, m);
    this.synth.noteOn(m);
    this.piano?.press(m, true);
    this.ui.cpKeys[KEYMAP[code]]?.classList.add('on');
    this.noteCount++;
    this.lastNotes.push(noteName(m).replace(/\d/, '')); if (this.lastNotes.length > 12) this.lastNotes.shift();
    this.ui.pianoHud.querySelector('.cp-notes').textContent = this.lastNotes.join(' ');
    if (this.copy) this.copy.swing = 1;
    this.pianoBob = 1;
    const tune = this.matcher.push(m, this.t);
    if (tune) this.onTune(tune.id);
    else if (this.noteCount > 12 && Math.random() < 0.025) this.toast(t('A wrong note. The mirror-copy tilts its head.'), 3.2, 'bad');
  }
  pianoKeyUp(e) {
    const code = e.code;
    if (code === 'Space') { this.synth.setSustain(false); return; }
    const m = this.held.get(code);
    if (m == null) return;
    this.held.delete(code);
    this.synth.noteOff(m); this.piano?.press(m, false);
    this.ui.cpKeys[KEYMAP[code]]?.classList.remove('on');
  }
  onTune(id) {
    if (id === 'lullaby') {
      if (this.unlock('lullaby')) this.toast(t('The piano files an appeal on your behalf. The door unlocks.'), 6, 'good');
      else this.toast(t('The piano files an appeal on your behalf. The door unlocks.'), 4, 'good');
      this.doorOpenWanted = true; this.sfx('door_creak', 0.4);
    } else if (id === 'cursed') {
      this.unlock('cursed'); this.lampBurst = 3; this.copy.stareT = 5; this.toast(t('The copy stops copying. It just stares.'), 5, 'bad'); this.sfx('lights_buzz', 0.3);
    } else if (id === 'elise') this.toast('♪ ' + pick(L('The copy applauds. It has no hands to applaud with.', 'Kopya alkışlıyor. Alkışlayacak eli yok.')), 4, '');
  }

  // ------------------------------------------------------------------------------------------------ frame
  frame(dt, cam) {
    if (this.disposed) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    try {
      this.startAudio();
      this.updateBoot(dt);
      this.readCinematic(cam);
      this.stepState(dt);
      this.applyCamera(cam, dt);
      this.animate(dt);
      this.updateUI(dt);
      this.terminal?.update(dt);
    } catch (e) { if (++this.errs < 6) console.error('[menuroom]', e); }
  }
  startAudio() {
    const a = this.app.audio;
    if (!this._rain && a?.ctx && !this.app.game) { this._rain = true; try { a.setAmbience('cellrain', 'rain', 0.1, 4); } catch { /* ignore */ } }
  }
  readCinematic(cam) {
    this._e.setFromQuaternion(cam.quaternion, 'YXZ');
    this.cin.x = cam.position.x; this.cin.y = cam.position.y + SEAT_DROP; this.cin.z = cam.position.z; this.cin.yaw = this._e.y; this.cin.pitch = this._e.x;
  }
  seatedRig(out) {
    const t = this.t, c = this.cin, sh = this.shakeAmp(), r = () => Math.random() - 0.5;
    const rm = this.app.settings?.reduceMotion ? 0.3 : 1;
    out.x = c.x + Math.sin(t * 0.7) * 0.004 + r() * sh;
    out.y = c.y + Math.sin(t * 1.25) * 0.006 * rm + r() * sh;
    out.z = c.z;
    out.yaw = c.yaw - this.mouse.x * 0.05 * rm + Math.sin(t * 0.31) * 0.006 + r() * sh * 2;
    out.pitch = c.pitch + this.mouse.y * 0.03 * rm + Math.sin(t * 1.25 + 0.6) * 0.004 * rm + r() * sh * 2;
    out.roll = Math.sin(t * 0.4) * 0.004 + r() * sh * 3 + this.lastSide * 0.03 * this.progress;
    return out;
  }
  shakeAmp() {
    if (this.app.settings?.reduceMotion) return 0;
    if (this.state === 'breaking') return 0.05 * Math.max(0, 1 - this.stateT / 1.0);
    if (this.state === 'seated' && !this.unstrapped && this.sinceStruggle < 0.35) return 0.004 + this.progress * 0.03;
    return 0;
  }
  lookInput(dt, o, maxPitch = 1.35) {
    const inp = this.app.input;
    const m = inp.consumeMouse();
    o.yaw -= m.dx; o.pitch = clampN(o.pitch - m.dy, -maxPitch, maxPitch);
    const k = 1.9 * dt;
    if (inp.codeDown('ArrowLeft')) o.yaw += k; if (inp.codeDown('ArrowRight')) o.yaw -= k;
    if (inp.codeDown('ArrowUp')) o.pitch = clampN(o.pitch + k, -maxPitch, maxPitch); if (inp.codeDown('ArrowDown')) o.pitch = clampN(o.pitch - k, -maxPitch, maxPitch);
  }
  stepState(dt) {
    const rig = this.rig;
    this.stateT += dt;
    switch (this.state) {
      case 'seated': {
        this.seatedRig(rig);
        this.sinceStruggle += dt;
        if (this.menu.mode === 'title') { this.idle += dt; this.seatedTime = (this.seatedTime || 0) + dt; this.hint = !this.unstrapped && this.progress <= 0.001 && (this.idle > 20 || this.seatedTime > 75); } else { this.idle = 0; this.hint = false; }
        if (!this.unstrapped && this.sinceStruggle > 0.5) this.progress = Math.max(0, this.progress - 0.09 * dt);
        if (!this.unstrapped && this.progress >= 1) this.startBreak();
        break;
      }
      case 'breaking': {
        const k = this.stateT;
        this.seatedRig(rig);
        rig.y -= Math.sin(Math.min(1, k / 0.5) * Math.PI) * 0.06;
        rig.pitch += Math.sin(Math.min(1, k / 0.6) * Math.PI) * 0.16;
        if (this.stateT > 1.05) this.beginStanding();
        break;
      }
      case 'standing': {
        const e = sstep(this.stateT / 1.5), s = this.snap;
        if (this.stateT > 0.7) this.lookInput(dt, s);
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        rig.x = s.x + fx * PLAYER_START_FWD * e; rig.z = s.z + fz * PLAYER_START_FWD * e;
        rig.y = s.y + (EYE_STAND - s.y) * e + (this.app.settings?.reduceMotion ? 0 : Math.sin(e * Math.PI) * 0.03);
        rig.yaw = s.yaw; rig.pitch = s.pitch + (0.02 - s.pitch) * e * 0.5; rig.roll = s.roll * (1 - e);
        if (this.stateT >= 1.5) { this.free.x = rig.x; this.free.z = rig.z; this.free.yaw = rig.yaw; this.free.pitch = rig.pitch; this.free.bob = 0; this.state = 'free'; this.stateT = 0; this.sfx('land_soft', 0.3); }
        break;
      }
      case 'free': this.stepFree(dt); break;
      case 'sitting': {
        const k = sstep(this.stateT / 1.3), s = this.snap, tgt = this.seatedRig({});
        rig.x = s.x + (tgt.x - s.x) * k; rig.y = s.y + (tgt.y - s.y) * k; rig.z = s.z + (tgt.z - s.z) * k;
        rig.yaw = lerpA(s.yaw, tgt.yaw, k); rig.pitch = s.pitch + (tgt.pitch - s.pitch) * k; rig.roll = s.roll * (1 - k);
        if (this.stateT >= 1.3) this.finishSit();
        break;
      }
      case 'pianoIn': case 'pianoOut': {
        const k = sstep(this.stateT / (this.state === 'pianoIn' ? 1.0 : 0.9)), s = this.snap;
        const g = this.state === 'pianoIn' ? PIANO_EYE : { x: PIANO_EXIT.x, y: EYE_STAND, z: PIANO_EXIT.z, yaw: this.state === 'pianoOut' ? this.free.yaw : 0, pitch: 0 };
        rig.x = s.x + (g.x - s.x) * k; rig.y = s.y + (g.y - s.y) * k; rig.z = s.z + (g.z - s.z) * k; rig.yaw = lerpA(s.yaw, g.yaw, k); rig.pitch = s.pitch + (g.pitch - s.pitch) * k; rig.roll = s.roll * (1 - k);
        if (this.state === 'pianoIn' && this.stateT >= 1.0) { this.state = 'piano'; this.stateT = 0; }
        else if (this.state === 'pianoOut' && this.stateT >= 0.9) {
          this.state = 'free'; this.stateT = 0; this.free.x = PIANO_EXIT.x; this.free.z = PIANO_EXIT.z; this.free.yaw = rig.yaw; this.free.pitch = 0; this.relock();
        }
        break;
      }
      case 'piano': {
        this.pianoLook = this.pianoLook || { yaw: 0, pitch: 0 };
        const m = this.app.input.consumeMouse();
        this.pianoLook.yaw = clampN(this.pianoLook.yaw - m.dx, -0.5, 0.5); this.pianoLook.pitch = clampN(this.pianoLook.pitch - m.dy, -0.3, 0.3);
        this.pianoBob = Math.max(0, (this.pianoBob || 0) - dt * 4);
        rig.x = PIANO_EYE.x + Math.sin(this.t * 0.9) * 0.004; rig.y = PIANO_EYE.y + Math.sin(this.t * 1.3) * 0.005 - this.pianoBob * 0.006; rig.z = PIANO_EYE.z;
        rig.yaw = PIANO_EYE.yaw + this.pianoLook.yaw; rig.pitch = PIANO_EYE.pitch + this.pianoLook.pitch; rig.roll = Math.sin(this.t * 0.5) * 0.004;
        break;
      }
      default:
    }
  }
  stepFree(dt) {
    const f = this.free, inp = this.app.input;
    const busy = this.modal || this.terminal.active;
    if (!busy) this.lookInput(dt, f);
    let mx = 0, mz = 0;
    if (!busy) {
      const fw = (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0), st = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
      if (fw || st) {
        const len = Math.hypot(fw, st), sp = (inp.isDown('sprint') ? 3.3 : 1.9) * dt;
        const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
        mx = ((fx * fw + rx * st) / len) * sp; mz = ((fz * fw + rz * st) / len) * sp;
      }
    }
    const before = { x: f.x, z: f.z };
    f.x += mx; f.z += mz;
    resolveCircle(f, RADIUS, this.colliders);
    const moved = Math.hypot(f.x - before.x, f.z - before.z);
    // head bob + footsteps (one step per half bob cycle)
    const hb = this.app.settings?.headBob !== false && !this.app.settings?.reduceMotion;
    const prev = Math.floor(f.bob / Math.PI);
    f.bob += moved * 4.4;
    if (moved > 0.0005 && Math.floor(f.bob / Math.PI) !== prev) {
      const a = this.app.audio;
      if (a?.ctx) a.play(a.variant ? a.variant('step_concrete') : 'step_concrete_1', { volume: 0.5, bus: 'sfx' });
    }
    const amp = Math.min(1, moved / (3.3 * Math.max(dt, 1e-4)) + 0.3) * (moved > 0.0005 ? 1 : 0);
    const rig = this.rig;
    rig.x = f.x + (hb ? Math.cos(f.bob) * 0.012 * amp : 0); rig.z = f.z;
    rig.y = EYE_STAND + (hb ? Math.abs(Math.sin(f.bob)) * 0.045 * amp : 0) - (hb ? 0.02 * amp : 0);
    rig.yaw = f.yaw; rig.pitch = f.pitch; rig.roll = hb ? Math.sin(f.bob) * 0.006 * amp : 0;
    if (!busy) this.scanTarget(rig);
  }
  scanTarget(rig) {
    const fx = -Math.sin(rig.yaw) * Math.cos(rig.pitch), fy = Math.sin(rig.pitch), fz = -Math.cos(rig.yaw) * Math.cos(rig.pitch);
    let best = null, bestScore = 1e9;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const dx = it.x - rig.x, dy = it.y - rig.y, dz = it.z - rig.z, d = Math.hypot(dx, dy, dz);
      if (d > it.reach || d < 1e-3) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / d;
      if (dot < it.cone) continue;
      const score = d * (2.2 - dot);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    this.target = best;
  }
  applyCamera(cam, dt) {
    const r = this.rig;
    cam.position.set(r.x, r.y, r.z);
    cam.rotation.order = 'YXZ'; cam.rotation.set(r.pitch, r.yaw, r.roll);
    const want = (this.state === 'seated' || this.state === 'sitting' || this.state === 'breaking') ? 0 : 1;
    const seatedLike = this.state === 'seated';
    this.standMix += (want - this.standMix) * Math.min(1, dt * 1.6);
    const fovT = seatedLike ? 58 : this.state === 'piano' ? 66 : 58 + 14 * this.standMix;
    if (this.state === 'seated' && this.standMix < 0.002) this.standMix = 0;
    if (Math.abs(cam.fov - fovT) > 0.02) { cam.fov += (fovT - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    // strapped forearms (seated / breaking only)
    const showArms = !this.unstrapped || this.state === 'breaking';
    if (this.arms) this.arms.visible = showArms && (this.state === 'seated' || this.state === 'breaking');
    if (this.arms?.visible) {
      const tens = this.state === 'breaking' ? 1 : this.progress, tw = this.sinceStruggle < 0.3 ? 1 : 0.2;
      for (const s of this.armStraps || []) {
        s.arm.position.x = s.sx * (0.28 + Math.sin(this.t * 30 + s.sx) * 0.012 * tens * tw);
        s.arm.position.y = -0.205 + Math.sin(this.t * 26 + s.sx * 2) * 0.008 * tens * tw;
        s.g.scale.z = 1 + tens * 0.35; s.led.visible = (this.t * (2 + tens * 10)) % 1 < 0.6;
      }
      if (this.state === 'breaking' && this.stateT > 0.2) for (const s of this.armStraps || []) s.g.visible = false;
    }
  }
  updateBoot(dt) {
    if (!this.bootChecked && this.app.booted) {
      this.bootChecked = true;
      const qs = new URLSearchParams(location.search);
      if (!bootedOnce && !qs.has('autohost') && !qs.has('autojoin') && !this.app.settings?.reduceMotion) this.startBoot();
      bootedOnce = true;
    }
    const b = this.boot;
    if (!b?.active) return;
    b.t += dt;
    const lines = Math.min(b.lines.length, Math.floor(b.t / 0.34) + 1);
    if (lines !== b.shown) { b.shown = lines; this.ui.boot.querySelector('.cb-lines').innerHTML = b.lines.slice(0, lines).map((l) => `<div>${escapeHtml(l)}</div>`).join('') + '<div class="cb-cur">█</div>'; if (lines > 1) this.app.audio?.ui?.('ui_hover', 0.12); }
    if (b.t > b.lines.length * 0.34 + 0.7 && !b.fading) { b.fading = true; this.ui.boot.classList.add('fade'); }
    if (b.t > b.lines.length * 0.34 + 1.3) this.skipBoot(true);
  }
  startBoot() {
    const name = this.app.profile?.name || 'EMPLOYEE';
    const lines = [t('TFG OS v4.1  (c) FEED CORP  ALL VIEWS RESERVED'), t('CONTENT REVIEW CELL 07 ........ ONLINE'), t('MEMORY CHECK ........ 640K OK (2,041 TB LOST)'),
      t('SUBJECT') + ': ' + String(name).toUpperCase(), t('FLAG: UNAUTHORIZED SURVIVAL'), t('MODERATION RESTRAINTS ........ ENGAGED'), t('SEATING SUBJECT ........')];
    this.boot = { active: true, t: 0, lines, shown: 0, fading: false };
    this.ui.boot.className = 'cell-boot';
    this.ui.boot.innerHTML = '<div class="cb-lines"></div><div class="cb-skip">' + escapeHtml(t('press any key to skip')) + '</div>';
  }
  skipBoot() {
    if (!this.boot?.active) return;
    this.boot.active = false; this.ui.boot.className = 'cell-boot hidden'; this.ui.boot.innerHTML = '';
    this.idle = 0;
  }

  // ------------------------------------------------------------------------------------------------ animation
  animate(dt) {
    const t = this.t;
    // door
    const want = this.doorOpenWanted && this.doorUnlocked() ? 1.75 : 0;
    if (this.doorPivot) {
      if (this.doorAngle < want) this.doorAngle = Math.min(want, this.doorAngle + dt * 1.2); else if (this.doorAngle > want) this.doorAngle = Math.max(want, this.doorAngle - dt * 1.2);
      this.doorPivot.rotation.y = this.doorAngle;
      if (this.doorBox) { const i = this.colliders.indexOf(this.doorBox); const open = this.doorAngle > 1.2; if (open && i >= 0) this.colliders.splice(i, 1); else if (!open && i < 0) this.colliders.push(this.doorBox); }
      if (this.doorLamp) this.doorLamp.material.color.setHex(this.doorUnlocked() ? 0x48ff8a : ((t * 1.6) % 1 < 0.5 ? 0xff2a14 : 0x4a0a05));
      if (this._doorDrawn !== this.doorUnlocked()) { this._doorDrawn = this.doorUnlocked(); this.drawDoorSign(); }
    }
    // lamp flicker
    if (this.lampLight) {
      this.lampBurst = Math.max(0, this.lampBurst - dt);
      let k = this.lampOn ? 1 : 0;
      if (this.lampOn) { if (Math.random() < 0.02 + (this.lampBurst > 0 ? 0.35 : 0)) k = 0.1 + Math.random() * 0.3; k *= 0.95 + Math.sin(t * 60) * 0.03; }
      this.lampLight.intensity = 2.2 * k; this.lampShade.material.color.setHex(this.lampOn ? (k < 0.5 ? 0x7a5a30 : 0xffd08a) : 0x3a3020);
    }
    if (this.frontLight) this.frontLight.intensity = 1.5 * (Math.random() < 0.012 ? 0.15 : 0.93 + Math.sin(t * 90) * 0.05);
    // piano keys
    this.piano?.update(dt);
    // phone
    const ph = this.phone;
    if (ph.ringing) {
      ph.ring2 = (ph.ring2 || 0) - dt;
      if (ph.ring2 <= 0) { ph.ring2 = 2.4; if (++ph.rings > 6) { ph.ringing = 0; ph.next = 30 + Math.random() * 40; } else this.app.audio?.play?.('phone_ring', { volume: 0.55, bus: 'sfx' }); }
      if (this.handset) { this.handset.rotation.z = Math.sin(t * 55) * 0.05; this.handset.position.y = 0.06 + Math.abs(Math.sin(t * 40)) * 0.006; }
    } else {
      if (this.handset) { this.handset.rotation.z = 0; this.handset.position.y = 0.06; }
      ph.next -= dt;
      if (ph.next <= 0 && !this.terminal.active && !this.modal) { ph.ringing = 1; ph.rings = 0; ph.ring2 = 0; }
    }
    // printer slip
    if (this.slip) {
      this.slipAnim = Math.max(0, this.slipAnim - dt);
      this.slip.visible = this.slipAnim > 0;
      const k = 1 - this.slipAnim / 1.2; this.slip.position.x = 4.05 - sstep(k * 1.6) * 0.32; this.slip.position.y = 1.09 - (k > 0.7 ? (k - 0.7) * 1.4 : 0);
    }
    // tape
    if (this.tape.active > 0) this.tape.active -= dt, this.tape.t += dt;
    // chair straps fall once cut
    if (this.chairStraps && this.unstrapped) for (const s of this.chairStraps) { if (s.g.position.y > 0.06) { s.vy -= 6 * dt; s.g.position.y = Math.max(0.05, s.g.position.y + s.vy * dt); s.g.rotation.z += s.spin * dt; } if (s.led) s.led.visible = false; }
    // booth light cycle + the copy
    this.updateCopy(dt);
    // redraw props/feeds/rain at low rates
    this.screensAcc += dt;
    if (this.screensAcc > 1 / 8) { this.screensAcc = 0; for (const s of this.propScreens) { s.draw(s, t); s.tex.needsUpdate = true; s.mat.uniforms.time.value = t; } }
    this.feedAcc += dt;
    if (this.feedAcc > 1 / 12 && this.feeds) { this.feedAcc = 0; const f = this.feeds[this.feedIdx++ % this.feeds.length]; this.drawFeed(f, t); f.cv.tex.needsUpdate = true; }
    if (this.feeds) for (const f of this.feeds) f.mat.uniforms.time.value = t + f.phase;
    this.rainAcc += dt;
    if (this.rainAcc > 1 / 12 && this.rain) { this.rainAcc = 0; this.drawRain(t); }
  }

  updateCopy(dt) {
    const c = this.copy; if (!c) return;
    const t = this.t, st = this.state;
    const seatedLike = st === 'seated' || st === 'breaking' || st === 'sitting' || st === 'piano' || st === 'pianoIn' || st === 'pianoOut';
    // record the player's pose, replay it 1.3 s later
    this.histAcc += dt;
    if (this.histAcc > 1 / 30) {
      this.histAcc = 0;
      this.hist.push({ t, x: this.rig.x, z: this.rig.z, yaw: this.rig.yaw, sit: seatedLike ? 1 : 0 });
      while (this.hist.length > 140) this.hist.shift();
    }
    let s = null;
    for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t - 1.3) { s = this.hist[i]; break; }
    if (!s) s = this.hist[0] || { x: SEAT.x, z: SEAT.z, yaw: this.seatYaw, sit: 1 };
    // occasionally the copy stops copying and just stares
    if (c.stareT > 0) c.stareT -= dt;
    else if (t > c.stareNext && (st === 'free' || st === 'seated')) {
      c.stareT = 4 + Math.random() * 3; c.stareNext = t + 30 + Math.random() * 30;
      if (st === 'free') this.toast(t2('The copy stops copying. It just stares.'), 3.5, 'bad');
    }
    let cx, cz, yaw, sit = s.sit, headYaw = 0;
    const px = this.rig.x, pz = this.rig.z;
    if (c.stareT > 0 && c.frozen) { cx = c.frozen.x; cz = c.frozen.z; sit = c.frozen.sit; }
    else { cx = -5.6 - clampN((s.z - SEAT.z) * 0.2, -0.5, 0.5); cz = -1.95 + clampN((s.x - SEAT.x) * 0.3, -0.8, 0.8); c.frozen = { x: cx, z: cz, sit }; }
    if (c.stareT > 0) yaw = Math.atan2(px - cx, pz - cz);
    else if (st === 'piano' || st === 'pianoIn') yaw = Math.atan2(PIANO_POS.x - cx, PIANO_POS.z - cz);
    else { yaw = Math.PI / 2; headYaw = clampN(-wrapA(s.yaw - this.seatYaw) * 0.6, -0.9, 0.9); }
    c.yaw = lerpA(c.yaw, yaw, Math.min(1, dt * 3));
    c.root.position.x += (cx - c.root.position.x) * Math.min(1, dt * 5); c.root.position.z += (cz - c.root.position.z) * Math.min(1, dt * 5);
    c.root.rotation.y = c.yaw;
    c.sit += (sit - c.sit) * Math.min(1, dt * 4);
    c.hip.position.y = 0.85 - c.sit * 0.4;
    c.legL.rotation.x = c.legR.rotation.x = -c.sit * 1.45;
    c.chairBox.visible = c.sit > 0.5;
    c.chairBox.position.x = c.root.position.x + (Math.cos(c.yaw) * -0.22); c.chairBox.position.z = c.root.position.z + (Math.sin(c.yaw) * 0.22);
    c.head.rotation.y = c.stareT > 0 ? 0 : headYaw;
    c.head.rotation.z = (st === 'free' && Math.sin(t * 0.7) > 0.98) ? 0.3 : 0;
    // arms: air-piano swing on notes, knock on the glass
    c.swing = Math.max(0, c.swing - dt * 1.6);
    let al = 0, ar = 0;
    if (c.swing > 0) { al = -1.2 + Math.sin(t * 20) * 0.5 * c.swing; ar = -1.2 + Math.cos(t * 20) * 0.5 * c.swing; }
    else if (c.stareT <= 0 && seatedLike) { al = ar = -0.2; }
    if (c.knockT >= 0) {
      c.knockT += dt;
      if (c.knockT > 1.2 && c.knockT < 2.7) { ar = -1.5 + Math.sin((c.knockT - 1.2) * 14) * 0.25; c.root.rotation.y = Math.PI / 2; }
      for (const kt of [1.3, 1.65, 2.0]) if (c.knockT >= kt && c.knockT - dt < kt) this.app.audio?.play?.('hit_metal', { volume: 0.4, bus: 'sfx' });
      if (c.knockT > 2.7) c.knockT = -1;
      if (c.knockT > 1.2 && !c._knockToast) { c._knockToast = true; this.toast(t2('The copy behind the glass knocks back. A second later.'), 3.5, 'bad'); }
      if (c.knockT < 0) c._knockToast = false;
    }
    c.armL.rotation.x += (al - c.armL.rotation.x) * Math.min(1, dt * 10); c.armR.rotation.x += (ar - c.armR.rotation.x) * Math.min(1, dt * 10);
    // booth light: dark most of the time; a silhouette shows for a few seconds now and then (always while it stares / knocks)
    const cyc = t % 42;
    const want = (c.stareT > 0 || c.knockT >= 0 || (t > 10 && cyc > 24 && cyc < 32)) ? 1 : 0;
    this.boothLit += (want - this.boothLit) * Math.min(1, dt * 2.5);
    const flick = want ? 0.85 + Math.random() * 0.15 : 1;
    if (this.boothPanelMat) this.boothPanelMat.color.setRGB((0.10 + 0.42 * this.boothLit) * flick, (0.14 + 0.5 * this.boothLit) * flick, (0.17 + 0.56 * this.boothLit) * flick);
    if (this.glassMat) this.glassMat.opacity = 0.9 - 0.62 * this.boothLit;
  }

  // ------------------------------------------------------------------------------------------------ canvas drawing
  drawRain(t) {
    const { x, c, tex } = this.rain;
    const W = c.width, H = c.height;
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#04060b'); g.addColorStop(1, '#101a2a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#070a10';
    for (let i = 0; i < 9; i++) { const bh = 14 + ((i * 37) % 22), bw = 9 + ((i * 13) % 9); x.fillRect(i * 11 - 2, H - bh - 6, bw, bh + 6); }
    x.fillStyle = '#ffd27a'; for (let i = 0; i < 26; i++) { if (((i * 7 + Math.floor(t * 0.3)) % 5) < 3) x.fillRect((i * 17) % W, H - 8 - ((i * 29) % 28), 1, 1); }
    x.fillStyle = '#ff5a3a'; if (Math.floor(t * 1.4) % 2) x.fillRect(80, 10, 2, 2);   // a far red beacon
    x.strokeStyle = 'rgba(150,180,220,0.45)'; x.lineWidth = 1; x.beginPath();
    for (const d of this.rainDrops) { d.y += d.s / 12; d.x -= d.s / 40; if (d.y > H) { d.y = -6; d.x = Math.random() * W + 8; } x.moveTo(d.x, d.y); x.lineTo(d.x + 1.2, d.y + 5); }
    x.stroke();
    if (t > 8 && (t % 26) < 0.16) { x.fillStyle = 'rgba(210,225,255,0.5)'; x.fillRect(0, 0, W, H); }
    tex.needsUpdate = true;
  }
  drawFeed(f, t) {
    const { x, c } = f.cv, W = c.width, H = c.height;
    if (f.kind === 'static') {
      x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) { const v = 60 + Math.random() * 190; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * W, Math.random() * H, 4 + Math.random() * 20, 1 + Math.random() * 3); }
      if (Math.floor(t * 1.2 + f.phase) % 4 === 0) { x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(0, H * 0.4, W, H * 0.2); x.fillStyle = '#ddd'; x.font = '14px monospace'; x.textAlign = 'center'; x.fillText('NO SIGNAL', W / 2, H / 2 + 5); }
    } else if (f.kind === 'corridor') {
      x.fillStyle = '#08100b'; x.fillRect(0, 0, W, H); x.strokeStyle = '#2a4a34'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(W * 0.4, H * 0.38); x.lineTo(W * 0.6, H * 0.38); x.lineTo(W, 0); x.moveTo(0, H); x.lineTo(W * 0.4, H * 0.66); x.lineTo(W * 0.6, H * 0.66); x.lineTo(W, H); x.stroke();
      const k = (t * 0.5) % 1; x.fillStyle = `rgba(160,255,190,${0.25 * (1 - k)})`; x.fillRect(W * (0.4 - 0.4 * k), H * (0.38 - 0.38 * k), W * (0.2 + 0.8 * k), H * (0.28 + 0.72 * k));
      if ((t + f.phase) % 11 > 8) { x.fillStyle = '#000'; x.fillRect(W * 0.47, H * 0.44, W * 0.06, H * 0.22); x.fillStyle = '#f33'; x.fillRect(W * 0.485, H * 0.47, 2, 2); x.fillRect(W * 0.505, H * 0.47, 2, 2); }
      x.fillStyle = '#cfe'; x.font = '10px monospace'; x.textAlign = 'left'; x.fillText('CAM 04 SUBLEVEL B', 4, 11);
    } else if (f.kind === 'cell') {
      x.fillStyle = '#050a08'; x.fillRect(0, 0, W, H); x.strokeStyle = '#2f7a4a'; x.strokeRect(6, 8, W - 12, H - 22);
      const mx = (wx) => 6 + ((wx + 4.5) / 9) * (W - 12), mz = (wz) => 8 + ((wz + 3.2) / 7.8) * (H - 22);
      x.fillStyle = '#1e3a2a'; x.fillRect(mx(-1.9), mz(-0.35), mx(2.2) - mx(-1.9), mz(0.75) - mz(-0.35)); x.fillRect(mx(0.46), mz(3.7), mx(2.04) - mx(0.46), mz(4.6) - mz(3.7));
      x.fillStyle = '#48ff8a'; if (Math.floor(t * 2) % 2) x.fillRect(mx(this.rig.x) - 2, mz(this.rig.z) - 2, 4, 4);
      x.fillStyle = '#ff5a3a'; x.fillRect(mx(-5.6) - 2, mz(-1.95) - 2, 3, 3);
      x.fillStyle = '#cfe'; x.font = '10px monospace'; x.textAlign = 'left'; x.fillText('CAM 07 CELL', 4, 11);
      x.fillStyle = '#f33'; if (Math.floor(t * 1.5) % 2) x.fillText('REC', W - 28, 11);
    } else {
      x.fillStyle = '#02040a'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#bcd'; for (let i = 0; i < 24; i++) x.fillRect((i * 53 + t * 3) % W, (i * 31) % H, 1, 1);
      const sx = ((t * 8) % (W + 60)) - 30; x.fillStyle = '#7a8a99'; x.fillRect(sx, H * 0.5, 34, 8); x.fillRect(sx + 6, H * 0.5 - 4, 12, 4); x.fillStyle = '#ff8a3d'; x.fillRect(sx - 3, H * 0.5 + 3, 3, 2);
      x.fillStyle = '#cfe'; x.font = '10px monospace'; x.textAlign = 'left'; x.fillText('ORBIT // SHIP', 4, 11);
    }
    const g2 = x; g2.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g2.fillRect(0, y, W, 1);
  }
  drawTV(c, t) {
    const { ctx: x, canvas } = c, W = canvas.width, H = canvas.height;
    if (this.tape.active > 0) {
      const k = this.tape.t;
      x.fillStyle = '#0c1014'; x.fillRect(0, 0, W, H);
      const line = TAPE[Math.min(TAPE.length - 1, Math.floor(k / 1.8))];
      x.fillStyle = '#dfe'; x.font = '15px monospace'; x.textAlign = 'center'; x.fillText(pick(line), W / 2, H / 2);
      x.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 6; i++) x.fillRect(0, (t * 60 + i * 27) % H, W, 2);
      if (Math.random() < 0.2) { const y = Math.random() * H; x.drawImage(canvas, 0, y, W, 6, (Math.random() - 0.5) * 20, y, W, 6); }
      x.fillStyle = '#f33'; x.font = '10px monospace'; x.textAlign = 'left'; x.fillText('PLAY >', 6, 12);
      if (k > 3 && k < 3.4) this.sfx('ui_error', 0.15);
    } else {
      x.fillStyle = '#1a3aa0'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#dfe'; x.font = '14px monospace'; x.textAlign = 'center'; x.fillText('AV 1', W / 2, H / 2 - 4); x.font = '10px monospace'; x.fillText('NO TAPE', W / 2, H / 2 + 12);
    }
  }
  drawTerm(c, t) {
    const { ctx: x, canvas } = c, W = canvas.width, H = canvas.height;
    x.fillStyle = '#031006'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#48ff8a'; x.font = '14px monospace'; x.textAlign = 'left';
    x.fillText('TFG OS v4.1', 8, 20); x.fillText('CONTENT REVIEW CELL 07', 8, 38); x.fillText('type HELP', 8, 56);
    x.fillText('A:\\CELL07> ' + (Math.floor(t * 2) % 2 ? '_' : ''), 8, H - 16);
  }

  // ------------------------------------------------------------------------------------------------ UI per frame
  updateUI(dt) {
    const ui = this.ui, st = this.state;
    const free = st === 'free' && !this.terminal.active && !this.modal;
    this.uiShow(ui.cross, free);
    // interaction prompt
    if (free && this.target) { ui.prompt.textContent = t(this.target.label()); ui.prompt.classList.remove('hidden'); } else ui.prompt.classList.add('hidden');
    this.uiShow(ui.resume, this.needClick && st === 'free' && !this.terminal.active);
    // seated hints: appeal form
    const seated = st === 'seated' && this.menu.mode === 'title' && !this.boot?.active;
    const showForm = (seated && !this.unstrapped && (this.progress > 0.001 || this.hint)) || st === 'breaking';
    this.uiShow(ui.appeal, showForm);
    if (showForm) {
      const a = ui.appeal;
      const pct = Math.round(this.progress * 100);
      a.querySelector('.ca-title').textContent = t('APPEAL FORM 27-B');
      a.querySelector('.ca-sub').textContent = st === 'breaking' ? t('APPEAL FILED. RESTRAINTS RELEASED.') : t('MODERATION RESTRAINTS: ENGAGED');
      const bar = a.querySelector('.ca-bar i'); bar.style.width = (this.progress * 100).toFixed(1) + '%';
      // the bar glitches: occasionally it jumps back / flashes
      a.classList.toggle('glitch', Math.random() < 0.06 && this.progress > 0.02);
      const p = a.querySelector('.ca-pct');
      if (this.progress > 0.001 || st === 'breaking') p.textContent = t('FILING APPEAL') + '  ' + (Math.random() < 0.04 ? '##' : pct) + '%';
      else p.innerHTML = escapeHtml(t('ALTERNATE [A] AND [D] TO FILE AN APPEAL')).replace(/\[A\]/g, '<b>A</b>').replace(/\[D\]/g, '<b>D</b>');
      a.classList.toggle('hint', this.progress <= 0.001 && st !== 'breaking');
      a.classList.toggle('flick', this.hint && this.progress <= 0.001 && (this.t * 6) % 1 < 0.3);
      const keys = a.querySelectorAll('.ca-keys b'); keys[0]?.classList.toggle('on', this.lastSide === -1 && this.progress > 0); keys[1]?.classList.toggle('on', this.lastSide === 1 && this.progress > 0);
    }
    // once free and back in the chair: a subtle "stand up" hint
    if (seated && this.unstrapped) { ui.roam.textContent = t('[E] STAND UP'); ui.roam.classList.remove('hidden'); } else ui.roam.classList.add('hidden');
    // toast
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) ui.toast.classList.add('hidden'); else ui.toast.classList.remove('hidden'); }
    // "ring ring" prompt
    if (this.phone.ringing && st === 'free' && !this.toastT) this.toast('☎ ' + t('THE ALGORITHM IS CALLING'), 0.5, 'phone');
  }

  // ------------------------------------------------------------------------------------------------ teardown
  dispose() {
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown, true); window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('pointermove', this.onMouse);
    this.engine.canvas.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerlockchange', this.onLock);
    if (document.pointerLockElement && (this.state === 'free' || this.state === 'piano' || this.state === 'standing')) { try { document.exitPointerLock(); } catch { /* ignore */ } }
    try { this.app.audio?.setAmbience?.('cellrain', null, 0, 0.5); } catch { /* ignore */ }
    this.synth?.dispose(); this.terminal?.dispose(); this.piano?.dispose?.();
    this.ui.root.remove();
    if (this.arms) this.cam.remove(this.arms);
    this.app.ui?.menuEl?.classList.remove('cell-roam');
    this.cam.rotation.order = this.origOrder; this.cam.rotation.set(0, 0, 0); this.cam.fov = this.origFov; this.cam.updateProjectionMatrix();
  }
}

const t2 = (s) => t(s);
const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
