// MENU EGGS (wave 4, module 'eggs'; docs/wave4/eggs.md): ten hidden props / secrets in the main-menu Content Review Cell (src/ui/menuroom.js).
// Installed by MenuRoom (`this.eggs = new MenuEggs(this)`); everything else hooks in through instance wrappers so menuroom.js stays small:
//   cassette (lore log)  CRT channel 7 (the knock rhythm)  drawer (sticky note hint)  coffee mug (sip counter)  hollow wall (knock pattern -> hatch opens)
//   rotating WANTED poster  the phone's private line  the Algorithm's tune on the piano  the duck behind the door  lamp Morse
// plus the final step of the META-SECRET "THE LAST APPEAL" (look inside the hatch once the moon eggs are found; eggs_core.js).
// Progress lives in profile.eggs (saved through deps.saveProfile). "Secrets x/N" shows subtly bottom-left while you walk around.
import * as THREE from 'three';
import './menueggs.css';
import { POSTERS } from './menulore.js';
import { TUNES, TuneMatcher } from './menupiano.js';
import { t } from '../core/i18n.js';
import { x, xf } from '../game/eggs_text.js';
import * as C from '../game/eggs_core.js';

const lam = (c, extra) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const bas = (c, extra) => new THREE.MeshBasicMaterial({ color: c, ...extra });
const codeText = () => { let s = '●'; for (const ch of C.KNOCK_PATTERN) s += (ch === 'L' ? '   ' : ' ') + '●'; return s; };

export class MenuEggs {
  constructor(room) {
    this.room = room; this.p = room.app.profile; this.disposed = false;
    C.ensureEggs(this.p);
    this.knock = new C.KnockMatcher(); this.lampBurst = new C.ClickBurst();
    this.channel = 1; this.hatch = { a: 0, want: 0 }; this.posterShown = -1; this.bannerT = 0; this.tapToastT = 0;
    this.stuff = [];
    const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('[menueggs] ' + name, e); } };
    safe('props', () => this.buildProps());
    safe('interactables', () => this.buildInteractables());
    safe('hooks', () => this.hook());
    safe('ui', () => this.buildUI());
    this.refreshHatch(true);
  }

  // ------------------------------------------------------------------------------------------------ persistence
  save() { try { this.room.deps.saveProfile?.(this.p); } catch { /* storage may be unavailable */ } }
  /** mark an egg found + subtle banner + counter; true when new */
  found(id) {
    if (!C.discover(this.p, id)) return false;
    this.save();
    this.room.app.audio?.ui?.('ui_levelup', 0.5);
    this.banner(xf('found', { name: x('n.' + id), a: C.foundCount(this.p), b: C.TOTAL_EGGS }));
    this.updateCounter();
    return true;
  }
  say(text, sec = 6, cls = '') { this.room.toast(text, sec, cls); }
  modal(title, body, foot) { this.room.openModal(title, body, foot || t('[ESC] close'), 'slip'); }

  // ------------------------------------------------------------------------------------------------ props
  buildProps() {
    const r = this.room, S = r.scene;
    const add = (o) => { S.add(o); this.stuff.push(o); return o; };
    const box = (w, h, d, mat, px, py, pz, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); (parent || S).add(m); if (!parent) this.stuff.push(m); return m; };
    // 1. cassette on the floor beside the server rack (back wall aisle)
    this.cassette = new THREE.Group(); this.cassette.position.set(2.5, 0.025, -3.02); this.cassette.rotation.y = 0.5; add(this.cassette);
    box(0.11, 0.022, 0.07, lam(0x1a1a1c), 0, 0, 0, this.cassette); box(0.06, 0.004, 0.03, bas(0xe8e2c8), 0, 0.013, 0, this.cassette);
    this.cassetteGlint = box(0.012, 0.006, 0.012, bas(0xff5a3a), 0.04, 0.016, 0.02, this.cassette);
    // 2. the small CRT on a cart against the back wall: channel 7 shows the knock rhythm
    box(0.5, 0.68, 0.46, lam(0x2b2d30), -0.6, 0.34, -2.9);
    if (r.deps.makeCRT) {
      const crt = r.deps.makeCRT({ w: 0.42, h: 0.32, depth: 0.4, canvasW: 160, canvasH: 120, tint: [0.8, 1.1, 0.85] });
      crt.group.position.set(-0.6, 0.98, -2.72); crt.group.rotation.y = 0; add(crt.group);
      crt.draw = (c, tt) => this.drawCRT(c, tt); r.propScreens.push(crt); this.crt = crt;
    }
    // 3. the drawer under the table's front edge
    this.drawer = box(0.7, 0.13, 0.035, lam(0x3a2c1e), 0.3, 0.66, 0.77);
    box(0.14, 0.02, 0.03, lam(0x9a9484), 0.3, 0.66, 0.795);
    // 4. the coffee mug on the table
    const mug = new THREE.Group(); mug.position.set(1.05, 0.81, 0.62); add(mug);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 10), lam(0xd9d4c4)); cup.position.y = 0.045; mug.add(cup);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 8, Math.PI), lam(0xd9d4c4)); hd.position.set(0.05, 0.045, 0); hd.rotation.z = -Math.PI / 2; mug.add(hd);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.038, 10), bas(0x2a1a10)); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.088; mug.add(coffee);
    this.mug = mug;
    // 5. the hollow wall: a slightly different patch of paint with a hatch behind it (back wall aisle)
    const H = new THREE.Group(); H.position.set(-2.5, 1.15, -3.19); add(H);
    box(0.7, 0.7, 0.03, lam(0x090a09), 0, 0, 0, H);   // recess
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), bas(0x0a2a14)); glow.position.set(0, 0, 0.017); H.add(glow);
    this.hatchGlow = glow; this.hatchCv = r.canvasTex(64, 64); glow.material = new THREE.MeshBasicMaterial({ map: this.hatchCv.tex });
    this.drawHatchInside();
    const leafPivot = new THREE.Group(); leafPivot.position.set(-0.32, 0, 0.03); H.add(leafPivot);
    const leaf = box(0.64, 0.64, 0.025, lam(0x565a52), 0.32, 0, 0, leafPivot); box(0.1, 0.02, 0.03, lam(0x9a9484), 0.5, 0, 0.02, leafPivot);
    this.hatchLeaf = leafPivot; leaf.material.color.offsetHSL(0, 0, 0.02);
    // 6. the rotating poster above the piano side of the front wall
    this.posterCv = r.canvasTex(96, 128);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.75), new THREE.MeshLambertMaterial({ map: this.posterCv.tex, emissive: 0x222222, emissiveMap: this.posterCv.tex }));
    pm.position.set(0.0, 1.65, 4.585); pm.rotation.y = Math.PI; add(pm);
    // 9. the rubber duck in the alcove behind the door
    const duck = new THREE.Group(); duck.position.set(-2.4, 0.06, 5.45); duck.rotation.y = 2.4; add(duck);
    const yel = lam(0xf2c81e, { emissive: 0x4a3a00 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), yel); body.scale.set(1.15, 0.85, 1); duck.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), yel); head.position.set(0, 0.09, 0.06); duck.add(head);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.035), lam(0xf07a1a, { emissive: 0x401a00 })); beak.position.set(0, 0.085, 0.115); duck.add(beak);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.004), bas(0xffffff)); badge.position.set(0.03, 0.03, 0.075); duck.add(badge);
    this.duck = duck;
    this.drawPoster(0);
  }

  drawCRT(c, t) {
    const { ctx: g, canvas } = c, W = canvas.width, H = canvas.height, ch = this.channel;
    g.fillStyle = '#04100a'; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.fillStyle = '#7dffb0'; g.font = 'bold 13px monospace';
    if (ch === 7) {
      const lines = x('crt.seven').replace('{code}', codeText()).split('\n');
      g.font = 'bold 12px monospace';
      lines.forEach((ln, i) => { g.fillStyle = i === 2 ? '#ffffff' : '#7dffb0'; g.font = i === 2 ? 'bold 20px monospace' : '11px monospace'; g.fillText(ln, W / 2, 22 + i * (i === 2 ? 28 : 20)); });
    } else {
      for (let i = 0; i < 80; i++) { const v = 50 + Math.random() * 160; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 12, 1 + Math.random() * 2); }
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, H * 0.38, W, H * 0.24);
      g.fillStyle = '#dfe'; g.font = 'bold 14px monospace'; g.fillText(x('crt.nosignal'), W / 2, H / 2 + 5);
    }
    if (ch !== 7) { g.textAlign = 'left'; g.fillStyle = '#7dffb0'; g.font = '11px monospace'; g.fillText(xf('crt.ch', { n: ch }), 6, 12); }
  }
  drawPoster(frame) {
    const { x: g, tex } = this.posterCv;
    const wanted = frame === C.POSTER_SECRET;
    const P = wanted ? { bg: '#d8c9a0', fg: '#2a1a10' } : POSTERS[frame % POSTERS.length];
    g.fillStyle = P.bg; g.fillRect(0, 0, 96, 128); g.strokeStyle = P.fg; g.lineWidth = 2; g.strokeRect(4, 4, 88, 120);
    g.fillStyle = P.fg; g.textAlign = 'center';
    if (wanted) {
      g.font = 'bold 19px monospace'; g.fillText(x('poster.head'), 48, 30);
      g.fillRect(24, 40, 48, 44); g.fillStyle = P.bg; g.fillRect(28, 44, 40, 36); g.fillStyle = P.fg; g.fillRect(40, 54, 6, 6); g.fillRect(52, 54, 6, 6); g.fillRect(42, 68, 14, 3);
      g.font = '8px monospace'; g.fillText('u/throwaway_janitor', 48, 100); g.fillText('REWARD: 1 MUG', 48, 112);
    } else {
      g.font = 'bold 15px monospace'; P.lines.forEach((ln, k) => g.fillText(ln, 48, 28 + k * 19 + (4 - P.lines.length) * 7));
      g.font = '8px monospace'; g.fillText(P.sub, 48, 116);
    }
    tex.needsUpdate = true; this.posterShown = frame;
  }
  drawHatchInside() {
    const { x: g, tex } = this.hatchCv, done = C.has(this.p, C.META_ID);
    g.fillStyle = '#04140a'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = done ? '#48ff8a' : '#1f6b3a';
    g.fillRect(14, 16, 8, 8); g.fillRect(42, 16, 8, 8); g.fillRect(14, 42, 36, 5); g.fillRect(10, 36, 5, 6); g.fillRect(49, 36, 5, 6);
    tex.needsUpdate = true;
  }
  refreshHatch(instant) {
    this.hatch.want = C.flag(this.p, 'panel') ? 1 : 0;
    if (instant) this.hatch.a = this.hatch.want;
    this.drawHatchInside();
  }

  // ------------------------------------------------------------------------------------------------ interactables
  buildInteractables() {
    const r = this.room;
    const I = (id, px, py, pz, reach, label, act, extra = {}) => r.interactables.push({ id, x: px, y: py, z: pz, reach, label, act, cone: extra.cone ?? 0.82, enabled: extra.enabled });
    I('egg_cassette', 2.5, 0.08, -3.02, 2.9, () => x('p.cassette'), () => this.useCassette(), { cone: 0.86 });
    I('egg_crt', -0.6, 0.98, -2.72, 2.8, () => x('p.crt'), () => this.useCRT());
    I('egg_drawer', 0.3, 0.66, 0.85, 1.9, () => x('p.drawer'), () => this.useDrawer(), { cone: 0.9 });
    I('egg_mug', 1.05, 0.86, 0.62, 1.8, () => x('p.mug'), () => this.useMug(), { cone: 0.93 });
    I('egg_wall', -2.5, 1.15, -3.15, 2.6, () => x('p.knock'), () => this.useWall(), { enabled: () => this.hatch.want < 0.5 });
    I('egg_panel', -2.5, 1.15, -3.15, 2.6, () => x('p.panel'), () => this.usePanel(), { enabled: () => this.hatch.want >= 0.5 });
    I('egg_poster', 0.0, 1.65, 4.55, 3.2, () => x('p.poster'), () => this.usePoster(), { cone: 0.88 });
    I('egg_duck', -2.4, 0.12, 5.45, 2.6, () => x('p.duck0'), () => this.useDuck(), { cone: 0.85, enabled: () => r.doorAngle > 1.2 });
  }
  useCassette() {
    this.room.sfx('walkie_static', 0.4);
    const first = this.found('cassette');
    this.modal(x('cassette.title'), (first ? x('cassette.take') + '\n\n' : '') + x('cassette.body'));
  }
  useCRT() {
    this.channel = this.channel % 8 + 1;
    this.room.sfx(this.channel === 7 ? 'walkie_on' : 'ui_hover', 0.35);
    if (this.crt) { this.crt.draw(this.crt, this.room.t); this.crt.tex.needsUpdate = true; }
    if (this.channel === 7) { const first = this.found('crt'); if (first) this.say(xf('crt.found', { code: codeText() }), 7, 'good'); }
  }
  useDrawer() {
    this.room.sfx('door_creak', 0.3);
    this.found('drawer');
    this.modal(x('drawer.title'), x('drawer.body'));
  }
  useMug() {
    const n = C.bump(this.p, 'mug'); this.save();
    this.room.sfx('cloth_rustle', 0.25);
    const ms = C.mugMilestone(n);
    this.say(ms ? x('mug.' + ms) : xf('mug.sip', { n }), ms ? 6 : 2.2, ms === C.MUG_UNLOCK ? 'gold' : '');
    if (n >= C.MUG_UNLOCK) this.found('mug');
  }
  useWall() {
    this.room.sfx('hit_metal', 0.25);
    this.say(x('knock.tap'), 0.5);
    if (this.knock.push(this.room.t)) {
      C.setFlag(this.p, 'panel', true); this.save(); this.found('knock'); this.refreshHatch(false);
      this.room.sfx('door_creak', 0.5);
      this.say(x('knock.ok'), 6, 'good');
    } else if (this.knock.gaps.length >= 4) this.say(x('knock.nope'), 2.5, 'bad');
  }
  usePanel() {
    const r = C.claimMeta(this.p);
    if (r.ok) {
      this.save(); this.drawHatchInside();
      if (r.isNew) {
        this.announceMeta();
        this.modal(x('n.lastappeal'), x('panel.done'));
        this.room.sfx('register', 0.6);
      } else this.modal(x('n.lastappeal'), x('panel.empty'));
      return;
    }
    const prog = C.metaProgress(this.p), duck = C.ensureEggs(this.p).n.duck;
    const lines = prog.filter((s) => !s.done).map((s) => '- ' + (s.id === 'ducks' ? xf('panel.step.ducks', { n: Math.min(duck, C.DUCKS_NEEDED), m: C.DUCKS_NEEDED }) : x('panel.step.' + s.id)));
    this.room.sfx('door_locked', 0.5);
    this.modal(x('n.lastappeal'), x('panel.locked') + '\n\n' + lines.join('\n'));
  }
  announceMeta() {
    this.banner(xf('found', { name: x('n.lastappeal'), a: C.foundCount(this.p), b: C.TOTAL_EGGS }));
    this.updateCounter();
    this.room.app.audio?.ui?.('ui_levelup', 0.8);
    setTimeout(() => { if (!this.disposed) this.say(xf('title.grant', { n: C.META_TITLE }), 6, 'gold'); }, 400);
  }
  usePoster() {
    const f = C.posterFrame(this.room.t);
    if (f === C.POSTER_SECRET) { this.found('poster'); this.say(x('poster.wanted'), 7, 'good'); }
    else this.say(x('poster.plain'), 3.5);
    this.room.sfx('cloth_rustle', 0.2);
  }
  useDuck() {
    this.room.sfx('walkie_on', 0.3); this.room.sfx('ui_click', 0.5);
    const first = this.found('duck0');
    if (first) { C.bump(this.p, 'duck'); this.save(); }
    this.say(x('duck0.body') + '\n' + xf('duck.count', { n: C.ensureEggs(this.p).n.duck }), 5.5, first ? 'gold' : '');
  }

  // ------------------------------------------------------------------------------------------------ wrappers around existing menu-room behaviour
  hook() {
    const r = this.room;
    // the Algorithm's tune on top of the existing lullaby / cursed / elise
    r.matcher = new TuneMatcher([...TUNES, C.PIANO_TUNE]);
    const onTune = r.onTune.bind(r);
    r.onTune = (id) => {
      if (id === C.PIANO_TUNE.id) {
        this.found('piano'); this.say(x('piano.algo'), 7, 'good'); r.lampBurst = 2; if (r.copy) r.copy.swing = 1;
      } else onTune(id);
    };
    // lamp Morse: five toggles in four seconds
    const lamp = r.interactables.find((i) => i.id === 'lamp');
    if (lamp) {
      const act = lamp.act;
      lamp.act = () => { act(); if (this.lampBurst.push(r.t)) { this.found('lamp'); r.lampOn = true; r.lampBurst = 4; this.say(x('lamp.morse'), 6, 'good'); } };
    }
    // the phone: the third answered call ever (then now and then) is the Algorithm's private line
    const answer = r.answerPhone.bind(r);
    r.answerPhone = () => {
      const ph = r.phone;
      if (ph.ringing) {
        const before = C.ensureEggs(this.p).n.call;
        C.bump(this.p, 'call'); this.save();
        if (C.phoneSpecial(before, Math.random)) {
          ph.ringing = 0; ph.next = 40 + Math.random() * 45;
          const nm = (this.p.name || 'Employee').replace(/\D+/g, '') || '404';
          this.say(x('phone.title') + '\n' + xf('phone.special', { n: nm.slice(0, 4) }), 11, 'phone');
          r.sfx('walkie_on', 0.5);
          this.found('phone');
          return;
        }
      }
      answer();
    };
    // per-frame hook (door alcove duck bob, hatch swing, poster rotation, counter visibility)
    const animate = r.animate.bind(r);
    r.animate = (dt) => { animate(dt); try { this.update(dt); } catch (e) { if (!this._warned) { this._warned = 1; console.warn('[menueggs]', e); } } };
  }

  // ------------------------------------------------------------------------------------------------ UI
  buildUI() {
    const root = this.room.ui.root;
    this.ui = document.createElement('div'); this.ui.className = 'cell-secrets hidden'; root.appendChild(this.ui);
    this.bannerEl = document.createElement('div'); this.bannerEl.className = 'cell-egg hidden'; root.appendChild(this.bannerEl);
    this.updateCounter();
  }
  updateCounter() { if (this.ui) this.ui.textContent = xf('secrets', { a: C.foundCount(this.p), b: C.TOTAL_EGGS }); }
  banner(text) { if (!this.bannerEl) return; this.bannerEl.textContent = '★ ' + text; this.bannerEl.classList.remove('hidden'); this.bannerT = 5; }

  update(dt) {
    const r = this.room, t = r.t;
    // hatch swing
    const h = this.hatch; h.a += (h.want - h.a) * Math.min(1, dt * 2.2);
    if (this.hatchLeaf) this.hatchLeaf.rotation.y = -h.a * 1.7;
    // poster frames (redrawn only when the frame changes)
    const f = C.posterFrame(t); if (f !== this.posterShown && this.posterCv) this.drawPoster(f);
    // cassette LED blink
    if (this.cassetteGlint) this.cassetteGlint.visible = (t * 1.3) % 1 < 0.5;
    // duck bob when the door is open
    if (this.duck) { this.duck.visible = r.doorAngle > 0.3; this.duck.position.y = 0.06 + Math.sin(t * 1.6) * 0.004; }
    // banner + counter (subtle: only while walking around)
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.add('hidden'); }
    const walking = r.state === 'free' && !r.modal && !r.terminal?.active;
    this.ui?.classList.toggle('hidden', !walking);
  }

  dispose() {
    this.disposed = true;
    this.ui?.remove(); this.bannerEl?.remove();
    for (const o of this.stuff) o.removeFromParent();
    this.stuff.length = 0;
  }
}
