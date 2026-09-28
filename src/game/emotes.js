// Emotes (R.E.P.O. / TooManyEmotes style): hold B for a radial wheel (mouse picks, release plays),
// 16 emotes, a third-person camera while emoting so you can see yourself, facial expressions.
// Networking: the emote id travels in the player state ('ps.e'); ids not built into the avatar are
// sent as 'x:<id>' and layered on top of a base pose by applyEmoteFx() on every client.
import * as THREE from 'three';
import { createAvatar } from '../models/avatar.js';
import { suitColor } from '../entities/remote.js';
import { G } from '../physics/physics.js';
import { t } from '../core/i18n.js';

const clamp01 = (t) => Math.min(1, Math.max(0, t));
function pitchAbout(root, th, h) {
  root.rotation.order = 'YXZ';
  root.rotation.x = th;
  const s = Math.sin(th), c = Math.cos(th), ry = root.rotation.y;
  root.position.x += Math.sin(ry) * (-h * s);
  root.position.z += Math.cos(ry) * (-h * s);
  root.position.y += h * (1 - c);
}

// base: pose the avatar supports natively ('dance'|'wave'|'point'|'sit'|null), face: expression
export const EMOTES = [
  { id: 'dance', name: 'Dance', icon: '🕺', base: 'dance', dur: 8, face: 'happy' },
  { id: 'wave', name: 'Wave', icon: '👋', base: 'wave', dur: 2.5, face: 'happy' },
  { id: 'point', name: 'Point', icon: '👉', base: 'point', dur: 2.5 },
  { id: 'laugh', name: 'Laugh', icon: '😂', base: null, dur: 3, face: 'happy', fx(a, root, t) { if (a.parts?.torso) a.parts.torso.rotation.x += 0.12 + Math.abs(Math.sin(t * 18)) * 0.12; if (a.parts?.neck) a.parts.neck.rotation.x -= 0.25 + Math.sin(t * 18) * 0.1; } },
  { id: 'rage', name: 'Rage', icon: '😡', base: null, dur: 3, face: 'angry', fx(a, root, t) { root.position.x += Math.sin(t * 60) * 0.02; if (a.parts?.torso) a.parts.torso.rotation.x += 0.25; if (a.parts?.neck) a.parts.neck.rotation.z += Math.sin(t * 30) * 0.15; } },
  { id: 'scared', name: 'Scared', icon: '😱', base: 'sit', dur: 4, face: 'scared', fx(a, root, t) { root.position.x += Math.sin(t * 45) * 0.015; } },
  { id: 'cheer', name: 'Cheer', icon: '🎉', base: 'wave', dur: 3, face: 'happy', fx(a, root, t) { root.position.y += Math.abs(Math.sin(t * 8)) * 0.35; } },
  { id: 'spin', name: 'Spin', icon: '🌀', base: 'dance', dur: 5, face: 'happy', fx(a, root, t) { root.rotation.y += t * 7; } },
  { id: 'headbang', name: 'Headbang', icon: '🤘', base: null, dur: 6, face: 'angry', fx(a, root, t) { if (a.parts?.neck) a.parts.neck.rotation.x += Math.sin(t * 15) * 0.5; if (a.parts?.torso) a.parts.torso.rotation.x += 0.15 + Math.sin(t * 15) * 0.12; } },
  { id: 'bow', name: 'Bow', icon: '🙇', base: null, dur: 2.6, fx(a, root, t, dur) { const k = clamp01(t * 3) * clamp01((dur - t) * 3); if (a.parts?.torso) a.parts.torso.rotation.x += 0.95 * k; if (a.parts?.neck) a.parts.neck.rotation.x += 0.3 * k; } },
  { id: 'flip', name: 'Backflip', icon: '🤸', base: null, dur: 2.6, face: 'happy', fx(a, root, t) { const ph = (t % 1.3) / 1.3; const k = Math.min(1, ph / 0.8); pitchAbout(root, -k * Math.PI * 2, 0.9); root.position.y += Math.sin(k * Math.PI) * 0.9; } },
  { id: 'playdead', name: 'Play Dead', icon: '💀', base: null, dur: 30, face: 'dead', fx(a, root, t) { const k = clamp01(t * 2.5); pitchAbout(root, -Math.PI / 2 * k, 0.25); root.position.y += 0.18 * k; } },
  { id: 'hop', name: 'Bunny Hop', icon: '🐰', base: 'wave', dur: 5, face: 'happy', fx(a, root, t) { root.position.y += Math.abs(Math.sin(t * 7)) * 0.4; } },
  { id: 'shrug', name: 'Shrug', icon: '🤷', base: null, dur: 2.2, fx(a, root, t) { const k = Math.sin(Math.min(1, t / 2.2) * Math.PI); if (a.parts?.torso) a.parts.torso.rotation.z += Math.sin(t * 4) * 0.08 * k; if (a.parts?.neck) a.parts.neck.rotation.z += 0.3 * k; } },
  { id: 'sit', name: 'Sit', icon: '🪑', base: 'sit', dur: 30 },
  { id: 'party', name: 'Party', icon: '🥳', base: 'dance', dur: 12, face: 'happy', music: 'boombox_3', fx(a, root, t) { root.rotation.y += Math.sin(t * 2) * 0.6; root.position.y += Math.abs(Math.sin(t * 6)) * 0.08; } },
  // --- unlockable (meta layer rewards: Codex milestones, Rebirth, crew level). `lock` = how to unlock (shown in the Codex).
  { id: 'salute', name: 'Salute', icon: '🫡', base: 'wave', dur: 2.6, lock: 'Codex: 10 bestiary entries', fx(a, root, t) { if (a.parts?.torso) a.parts.torso.rotation.x -= 0.08; if (a.parts?.neck) a.parts.neck.rotation.x -= 0.12; root.position.y += Math.min(1, t * 6) * 0.02; } },
  { id: 'flex', name: 'Flex', icon: '💪', base: 'wave', dur: 3.2, face: 'happy', lock: 'Codex: kill 8 creature types', fx(a, root, t) { if (a.parts?.torso) { a.parts.torso.rotation.z += Math.sin(t * 5) * 0.18; a.parts.torso.rotation.x -= 0.1; } root.position.y += Math.abs(Math.sin(t * 5)) * 0.05; } },
  { id: 'facepalm', name: 'Facepalm', icon: '🤦', base: 'point', dur: 2.8, lock: 'Codex: experience 10 daily events', fx(a, root, t) { const k = clamp01(t * 3); if (a.parts?.neck) a.parts.neck.rotation.x += 0.55 * k + Math.sin(t * 3) * 0.05; if (a.parts?.torso) a.parts.torso.rotation.x += 0.22 * k; } },
  { id: 'moonwalk', name: 'Moonwalk', icon: '🌙', base: 'dance', dur: 6, face: 'happy', lock: 'Codex: visit 15 moons', fx(a, root, t) { const ry = root.rotation.y; const d = Math.sin(t * 1.6) * 0.9; root.position.x += Math.sin(ry) * d; root.position.z += Math.cos(ry) * d; } },
  { id: 'rally', name: 'Rally the Crew', icon: '📣', base: 'wave', dur: 3.5, face: 'angry', lock: 'Play in a crew of level 5+', fx(a, root, t) { root.position.y += Math.abs(Math.sin(t * 9)) * 0.22; if (a.parts?.neck) a.parts.neck.rotation.x -= 0.2; } },
  { id: 'ascend', name: 'Ascend', icon: '🌟', base: 'dance', dur: 6, face: 'happy', lock: 'Rebirth once', fx(a, root, t) { root.position.y += Math.min(1, t / 2) * 0.55 + Math.sin(t * 2.4) * 0.06; root.rotation.y += t * 3.2; } },
];
/** Emotes that start locked (unlocked into profile.emotes by the meta layer). */
export const LOCKED_EMOTES = EMOTES.filter((e) => e.lock).map((e) => e.id);
export function isEmoteUnlocked(profile, id) {
  const e = EMOTES.find((x) => x.id === id);
  if (!e) return false;
  return !e.lock || (Array.isArray(profile?.emotes) && profile.emotes.includes(id));
}
/** Unlock an emote on the profile (true when it was newly unlocked). Does not save. */
export function unlockEmote(profile, id) {
  if (!profile || !LOCKED_EMOTES.includes(id)) return false;
  if (!Array.isArray(profile.emotes)) profile.emotes = [];
  if (profile.emotes.includes(id)) return false;
  profile.emotes.push(id);
  return true;
}
export const EMOTE_BY_ID = Object.fromEntries(EMOTES.map((e) => [e.id, e]));
const NATIVE = new Set(['dance', 'wave', 'point', 'sit']);

// network id <-> emote
export function emoteNetId(e) { return NATIVE.has(e.id) ? e.id : 'x:' + e.id; }
export function emoteFromNet(s) { if (!s) return null; return EMOTE_BY_ID[s.startsWith('x:') ? s.slice(2) : s] || null; }

// Apply an emote on an avatar after avatar.update() has posed it (root already positioned/rotated).
export function applyEmoteFx(avatar, root, def, t) {
  if (!def) return;
  root.rotation.x = 0; root.rotation.z = 0;
  try { def.fx?.(avatar, root, t, def.dur); } catch { /* fallback avatar */ }
}

export class EmoteSystem {
  constructor(game) {
    this.game = game;
    this.current = null;      // emote def
    this.t = 0;
    this.wheelOpen = false;
    this.wheelAng = 0; this.wheelMag = 0; this.hover = -1;
    this.camYaw = 0; this.camPitch = 0.25; this.camDist = 3.1;
    this.buildWheel();
    this.avatar = null;
    this.music = null;
  }

  // the wheel lists only unlocked emotes; rebuilt when the unlocked set changes (checked when the wheel opens)
  buildWheel() {
    const list = EMOTES.filter((e) => isEmoteUnlocked(this.game.profile, e.id));
    const key = list.map((e) => e.id).join(',');
    if (this.wheel && this.wheelKey === key) return;
    this.wheelKey = key;
    this.list = list;
    const el = this.wheel || document.createElement('div');
    el.className = 'emote-wheel hidden';
    const n = list.length;
    const r = n > 18 ? 43 : 40;
    el.innerHTML = `<div class="ew-ring"></div><div class="ew-center"><div class="ew-name">EMOTES</div><div class="ew-hint">move mouse · release B</div></div>` +
      list.map((e, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return `<div class="ew-item" data-i="${i}" style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%"><span class="ew-ico">${e.icon}</span><span class="ew-lbl">${e.name}</span></div>`;
      }).join('');
    if (!this.wheel) document.getElementById('ui').appendChild(el);
    this.wheel = el;
    this.items = [...el.querySelectorAll('.ew-item')];
    this.nameEl = el.querySelector('.ew-name');
  }

  ensureAvatar() {
    if (this.avatar) return this.avatar;
    const p = this.game.profile;
    this.avatar = createAvatar({ suitColor: suitColor(p.suit), hat: p.hat });
    this.avatar.root.visible = false;
    this.game.scene.add(this.avatar.root);
    this.avatarSuit = p.suit; this.avatarHat = p.hat;
    return this.avatar;
  }

  play(def) {
    const g = this.game;
    if (!def || g.player.dead) return;
    this.current = def; this.t = 0;
    g.emote = emoteNetId(def);
    g.emoteT = g.time + def.dur;
    this.camYaw = g.player.yaw + Math.PI; this.camPitch = 0.22;
    this.music?.stop(0.3); this.music = null;
    if (def.music) this.music = g.audio.play(def.music, { follow: this.ensureAvatar().root, loop: true, volume: 0.5, refDistance: 3, maxDistance: 35 });
    g.audio.ui('ui_confirm', 0.35);
  }
  stop() {
    if (!this.current) return;
    this.current = null;
    this.game.emote = null;
    this.music?.stop(0.4); this.music = null;
    if (this.avatar) this.avatar.root.visible = false;
  }

  update(dt, input) {
    const g = this.game;
    const p = g.player;
    // wheel (hold B)
    const holding = input.enabled && input.locked && input.codeDown('KeyB') && !p.dead;
    if (holding && !this.wheelOpen) { this.buildWheel(); this.wheelOpen = true; this.wheel.classList.remove('hidden'); this.wheelX = 0; this.wheelY = 0; this.hover = -1; g.audio.ui('ui_hover', 0.4); }
    if (this.wheelOpen) {
      this.wheelX += input.mouseDX; this.wheelY += input.mouseDY;
      input.mouseDX = 0; input.mouseDY = 0;               // freeze look while choosing
      const mag = Math.hypot(this.wheelX, this.wheelY);
      if (mag > 25) {
        const a = Math.atan2(this.wheelY, this.wheelX) + Math.PI / 2;
        const L = this.list.length;
        const i = ((Math.round((a / (Math.PI * 2)) * L) % L) + L) % L;
        if (i !== this.hover) { this.hover = i; g.audio.ui('ui_hover', 0.25); this.items.forEach((el, k) => el.classList.toggle('sel', k === i)); this.nameEl.textContent = this.list[i].name; }
        if (mag > 160) { this.wheelX *= 160 / mag; this.wheelY *= 160 / mag; }
      }
      if (!holding) {
        this.wheelOpen = false;
        this.wheel.classList.add('hidden');
        this.items.forEach((el) => el.classList.remove('sel'));
        this.nameEl.textContent = t('EMOTES');
        if (this.hover >= 0 && this.list[this.hover]) this.play(this.list[this.hover]);
      }
    }
    // quick emotes (Z / X)
    if (input.pressed('emote1')) this.play(EMOTE_BY_ID.dance);
    if (input.pressed('emote2')) this.play(EMOTE_BY_ID.point);

    // end conditions
    if (this.current) {
      this.t += dt;
      const moved = p.hSpeed > 0.6 || !p.grounded || input.mouseClicked(0);
      if (moved || this.t > this.current.dur || p.dead || g.minigame || g.terminal.active) this.stop();
    }
    if (!this.current) { if (g.emote && !g.emote.startsWith?.('x:') && g.emoteT < g.time) g.emote = null; return; }

    // third-person camera + local avatar
    const av = this.ensureAvatar();
    if (this.avatarSuit !== g.profile.suit) { av.setSuitColor(suitColor(g.profile.suit)); this.avatarSuit = g.profile.suit; }
    if (this.avatarHat !== g.profile.hat) { av.setHat(g.profile.hat); this.avatarHat = g.profile.hat; }
    av.root.visible = true;
    av.root.position.copy(p.pos);
    av.root.rotation.set(0, p.yaw + Math.PI, 0);
    av.update(dt, { speed: 0, crouch: false, sprint: false, grounded: true, carry2h: false, holding: false, dead: false, emote: this.current.base, swing: 0, lookPitch: 0, climbing: false, time: g.time });
    applyEmoteFx(av, av.root, this.current, this.t);
    av.setMouth(g.voice.localLevel || 0);
    av.setExpression?.(this.current.face || 'normal');
    // orbit with the mouse
    const { dx, dy } = input.consumeMouse();
    this.camYaw -= dx; this.camPitch = Math.max(-0.2, Math.min(1.1, this.camPitch + dy));
  }

  // called after the player update (which positions the first-person camera)
  applyCamera() {
    if (!this.current) return;
    const g = this.game, p = g.player;
    const head = new THREE.Vector3(p.pos.x, p.pos.y + 1.45, p.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const hit = g.physics.raycast(head, dir, this.camDist, G.STATIC | G.DOOR);
    const d = hit ? Math.max(0.4, hit.distance - 0.25) : this.camDist;
    g.camera.position.copy(head).addScaledVector(dir, d);
    g.camera.lookAt(head);
    this.thirdPerson = true;
  }

  get active() { return !!this.current; }

  dispose() {
    this.stop();
    this.wheel?.remove();
    this.avatar?.root.removeFromParent();
    this.avatar?.dispose?.();
  }
}
