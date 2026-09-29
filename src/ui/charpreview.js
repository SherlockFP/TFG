// Live 3D character preview for the CHARACTER sheet (main menu + in-game TAB / pause).
// Own tiny WebGLRenderer (never touches the game renderer / light pools), rendered at a PSX-ish low
// resolution and upscaled pixelated inside a CRT frame. Shows the chosen suit colour, hat, name + title,
// idles (breathing / look drift / blinking) and previews any unlocked emote. Drag (or LB/RB when the
// canvas has focus: arrows) to turn the model. One shared instance: the canvas moves between panels and
// its render loop stops by itself while the canvas is not in the document.
import * as THREE from 'three';
import { createAvatar, SUIT_COLORS } from '../models/avatar.js';
import { baseTitleOf } from '../game/achievements.js';
import { EMOTES, EMOTE_BY_ID, applyEmoteFx, isEmoteUnlocked } from '../game/emotes.js';
import { skinClock } from '../render/weaponskins.js';   // [cosm5] weapon-skin preview time
import { el } from '../core/util.js';
import { t } from '../core/i18n.js';

const RW = 132, RH = 176;          // internal render size (upscaled x2, pixelated)
let shared = null;

export function getCharPreview() {
  if (!shared) shared = new CharPreview();
  return shared;
}
/** The preview if it was ever created (no WebGL context is made just to ask). */
export function peekCharPreview() { return shared; }

export class CharPreview {
  constructor() {
    this.el = el('div', { class: 'char-preview' });
    this.stage = el('div', { class: 'cpv-stage', tabindex: 0, title: t('Drag to rotate') });
    this.canvas = el('canvas', { class: 'cpv-canvas', width: RW, height: RH });
    this.tag = el('div', { class: 'cpv-tag' }, el('div', { class: 'cpv-name' }), el('div', { class: 'cpv-title' }));
    this.emoteLbl = el('div', { class: 'cpv-emote' });
    this.stage.append(this.canvas, this.tag, this.emoteLbl, el('div', { class: 'cpv-scan' }), el('div', { class: 'cpv-corner' }, t('CAM-01 · LIVE')));
    this.controls = el('div', { class: 'cpv-controls' });
    this.el.append(this.stage, this.controls);
    this.ok = false;
    this.yaw = 0.5; this.autoSpin = true; this.spinHold = 0;
    this.emote = null; this.emoteT = 0; this.walk = false;
    this.opts = { suit: '#d9642b', hat: 'none', name: '', title: '', reduceMotion: false };
    this.last = 0;
    this.raf = 0;
    try { this.init(); } catch (e) { console.warn('[charpreview] WebGL unavailable', e); this.el.classList.add('no-gl'); }
    this.bindDrag();
  }

  init() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
    r.setPixelRatio(1);
    r.setSize(RW, RH, false);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0605, 4.5, 9);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, RW / RH, 0.1, 30);
    this.camera.position.set(0, 1.1, 4.8);
    this.camera.lookAt(0, 1.0, 0);
    scene.add(new THREE.HemisphereLight(0xffe2c4, 0x1a1210, 1.1));
    const key = new THREE.DirectionalLight(0xffc896, 2.2); key.position.set(1.6, 2.6, 2.2); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb8ff, 1.6); rim.position.set(-2.2, 1.8, -2.4); scene.add(rim);
    // floor pad: dark disc + glowing ring (reads as the "turntable" in the scanner booth)
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20), new THREE.MeshLambertMaterial({ color: 0x1c1410 }));
    pad.rotation.x = -Math.PI / 2; scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 20), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);
    this.ring = ring;
    // soft shadow blob under the feet
    const sc = document.createElement('canvas'); sc.width = sc.height = 32;
    const g = sc.getContext('2d'); const gr = g.createRadialGradient(16, 16, 2, 16, 16, 16); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.004; scene.add(shadow);
    this.holder = new THREE.Group(); scene.add(this.holder);
    this.avatar = createAvatar({ suitColor: this.opts.suit, hat: this.opts.hat });
    this.holder.add(this.avatar.root);
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; }, false);
    this.canvas.addEventListener('webglcontextrestored', () => { this.ok = true; this.kick(); }, false);
    this.ok = true;
  }

  /** [cosm5] show a prop (e.g. a skinned weapon) on the turntable instead of the avatar; null brings the avatar back */
  setProp(obj) {
    if (this.prop) { this.holder?.remove(this.prop); this.prop = null; }
    if (obj && this.holder) { this.prop = obj; this.holder.add(obj); }
    if (this.avatar) this.avatar.root.visible = !this.prop;
    this.kick();
  }

  bindDrag() {
    let drag = null;
    this.stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: this.yaw }; this.stage.setPointerCapture?.(e.pointerId); this.autoSpin = false; });
    this.stage.addEventListener('pointermove', (e) => { if (!drag) return; this.yaw = drag.yaw + (e.clientX - drag.x) * 0.018; });
    const up = () => { if (!drag) return; drag = null; this.spinHold = 2.5; };
    this.stage.addEventListener('pointerup', up);
    this.stage.addEventListener('pointercancel', up);
    this.stage.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      this.nudge(e.key === 'ArrowLeft' ? -1 : 1);
    });
  }
  nudge(dir) { this.autoSpin = false; this.spinHold = 3; this.yaw += dir * 0.35; }

  /** { suit: css colour, hat: id, name, title, reduceMotion } */
  set(o = {}) {
    const prev = this.opts;
    this.opts = { ...prev, ...o };
    if (this.avatar) {
      if (o.suit && o.suit !== prev.suit) this.avatar.setSuitColor(o.suit);
      if (o.hat !== undefined && o.hat !== this.avatar.getHat()) this.avatar.setHat(o.hat);
    }
    this.tag.firstChild.textContent = this.opts.name || '';
    this.tag.lastChild.textContent = this.opts.title ? `« ${this.opts.title} »` : '';
    this.tag.lastChild.classList.toggle('hidden', !this.opts.title);
    this.kick();
  }

  /** Emote ids the profile can play (for the picker), 'idle' and 'walk' first. */
  static modes(profile) {
    return ['idle', 'walk', ...EMOTES.filter((e) => isEmoteUnlocked(profile, e.id)).map((e) => e.id)];
  }
  static modeLabel(id) {
    if (id === 'idle') return t('Idle');
    if (id === 'walk') return t('Walk');
    const d = EMOTE_BY_ID[id];
    return d ? `${d.icon} ${t(d.name)}` : id;
  }
  play(id) {
    this.mode = id || 'idle';
    this.walk = id === 'walk';
    this.emote = EMOTE_BY_ID[id] || null;
    this.emoteT = 0;
    this.avatar?.setExpression?.(this.emote?.face || 'normal');
    this.emoteLbl.textContent = CharPreview.modeLabel(this.mode);
    this.emoteLbl.classList.remove('pop'); void this.emoteLbl.offsetWidth; this.emoteLbl.classList.add('pop');
    this.kick();
  }

  // (re)start the loop; it stops by itself once the canvas leaves the document
  kick() {
    if (!this.ok || this.raf) return;
    this.last = performance.now();
    const loop = (now) => {
      this.raf = 0;
      if (!this.canvas.isConnected || !this.ok) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt, now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Follow a profile: suit / hat / name / title are re-read twice a second (title changes, renames...). */
  follow(profile) { this.profile = profile || null; this.syncT = 0; this.sync(); }
  sync() {
    const p = this.profile;
    if (!p) return;
    this.avatar?.setLook?.(p);   // wardrobe outfit / face / back (suit id may be an outfit)
    const suit = (SUIT_COLORS.find((s) => s.id === p.suit) || SUIT_COLORS[0]).color;
    const title = baseTitleOf(p);
    const o = this.opts;
    if (o.suit !== suit || o.hat !== (p.hat || 'none') || o.name !== p.name || o.title !== title) this.set({ suit, hat: p.hat || 'none', name: p.name, title });
  }

  step(dt, time) {
    const rm = !!this.opts.reduceMotion;
    this.syncT = (this.syncT || 0) - dt;
    if (this.syncT <= 0) { this.syncT = 0.5; this.sync(); }
    if (this.spinHold > 0) { this.spinHold -= dt; if (this.spinHold <= 0) this.autoSpin = true; }
    if (this.autoSpin && !rm) this.yaw += dt * 0.55;
    const root = this.avatar.root;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    this.holder.rotation.y = this.yaw;
    if (this.prop) skinClock.value = time;   // [cosm5]
    const def = this.emote;
    if (def) {
      this.emoteT += dt;
      // loop the emote (short ones replay after a beat, long / endless ones just keep going)
      const len = Math.min(def.dur || 3, 8) + 0.8;
      if (this.emoteT > len) this.emoteT = 0;
    }
    const playing = def && this.emoteT <= Math.min(def.dur || 3, 8);
    this.avatar.update(dt, {
      time, speed: this.walk ? 1.4 : 0, grounded: true, emote: playing ? def.base : null,
      lookPitch: playing ? 0 : Math.sin(time * 0.7) * 0.12,
    });
    if (playing) applyEmoteFx(this.avatar, root, def, this.emoteT);
    if (this.ring) this.ring.material.opacity = 0.55 + Math.sin(time * 3) * 0.15;
    this.renderer.render(this.scene, this.camera);
  }
}
