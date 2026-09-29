// LIMINAL (module 'liminal', installLiminal): the found-footage look of the Backrooms + the Liminal Polaroid photos.
//
//   * VHS overlay while the local camera is inside the Backrooms (the noclip pocket, or a 'backrooms' facility):
//     a canvas of scanlines / tracking noise / a rolling band + a DOM caption (blinking REC, PLAY, tape counter,
//     battery, a camcorder date stamp and the current level name). Cosmetic and local only, no network traffic.
//     prefers-reduced-motion: no jitter, no roll band, slower noise.
//   * showPhoto(seed): a polaroid card that "develops" (dark -> picture) painted by src/render/liminal_photo.js
//     (lobby, pool, garage, school, party). Used by the br_polaroid item (backrooms.js calls game.liminal.showPhoto).
// Soft interface: game.liminal = { showPhoto(seed), vhsActive, setVhs(force|null), paintPhoto(canvas, seed, opts), dispose }.
// backrooms.js keeps its own simple VhsOverlay only when this module is not installed.
import { t, addTranslations } from '../core/i18n.js';
import { hashString } from '../core/rng.js';
import { paintLiminalPhoto, photoStamp, sceneOf } from '../render/liminal_photo.js';

const CAPTIONS = ['level 0 - day ?', 'who took this', 'it was already here', "don't go back in", 'this is my house now', 'the hum stopped once', 'found it in my pocket', 'exit was here yesterday', '=)', 'nobody lives here', 'the water was warm'];
const TR = {
  'level 0 - day ?': 'seviye 0 - gün ?', 'who took this': 'bunu kim çekti', 'it was already here': 'zaten buradaydı', "don't go back in": 'geri girme',
  'this is my house now': 'burası artık benim evim', 'the hum stopped once': 'uğultu bir kez durdu', 'found it in my pocket': 'cebimde buldum',
  'exit was here yesterday': 'çıkış dün buradaydı', 'nobody lives here': 'burada kimse yaşamıyor', 'the water was warm': 'su ılıktı',
  'PLAY': 'OYNAT', 'LEVEL': 'SEVİYE', 'SP': 'SP',
};
const RU = {
  'level 0 - day ?': 'уровень 0 - день ?', 'who took this': 'кто это снял', 'it was already here': 'оно уже было здесь', "don't go back in": 'не возвращайся',
  'this is my house now': 'теперь это мой дом', 'the hum stopped once': 'гул один раз стих', 'found it in my pocket': 'нашёл в кармане',
  'exit was here yesterday': 'вчера выход был здесь', 'nobody lives here': 'здесь никто не живёт', 'the water was warm': 'вода была тёплая',
  'PLAY': 'ВОСПР.', 'LEVEL': 'УРОВЕНЬ', 'SP': 'SP',
};
const LEVEL_NAMES = { l0: 'LEVEL 0', l1: 'LEVEL 1', l2: 'LEVEL 2', pool: 'LEVEL 37', fun: 'LEVEL FUN', run: 'LEVEL !', manila: 'MANILA' };
const uiRoot = () => document.getElementById('ui') || document.body;
const pad2 = (n) => String(n).padStart(2, '0');
const reduced = () => { try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Found-footage overlay: 3 stacked layers (noise canvas, CSS scanlines/vignette, caption) - the caption is updated at ~4 Hz. */
class Vhs {
  constructor() {
    const el = document.createElement('div');
    el.className = 'liminal-vhs';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9;display:none;overflow:hidden';
    this.cv = document.createElement('canvas');
    this.cv.width = 240; this.cv.height = 135;
    this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;opacity:0.5;mix-blend-mode:screen';
    const lines = document.createElement('div');
    lines.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.17) 0 1px,rgba(0,0,0,0) 1px 3px),radial-gradient(ellipse at center,rgba(0,0,0,0) 54%,rgba(40,30,0,0.42) 100%)';
    this.cap = document.createElement('div');
    this.cap.style.cssText = 'position:absolute;inset:0;font:700 clamp(12px,1.7vw,20px)/1.25 "Courier New",monospace;color:#f4f4f4;text-shadow:2px 2px 0 rgba(0,0,0,0.65);letter-spacing:2px';
    el.append(this.cv, lines, this.cap);
    uiRoot().appendChild(el);
    this.el = el; this.g = this.cv.getContext('2d');
    this.t = 0; this.capT = 0; this.noiseT = 0; this.glitch = 0; this.band = 0;
    this.motion = !reduced();
  }
  show(on) { this.el.style.display = on ? 'block' : 'none'; }
  update(dt, info) {
    if (this.el.style.display === 'none') return;
    this.t += dt; this.noiseT -= dt; this.capT -= dt;
    if (this.noiseT <= 0) { this.noiseT = this.motion ? 1 / 14 : 1 / 4; this.paintNoise(info); }
    if (this.capT <= 0) { this.capT = 0.25; this.paintCaption(info); }
  }
  paintNoise(info) {
    const g = this.g, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H);
    // sparse grain
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,235,${Math.random() * 0.16})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1); }
    if (!this.motion) return;
    // rolling tracking band with torn lines
    this.band = (this.band + 0.0035 + (info.moving ? 0.002 : 0)) % 1.15;
    const by = (this.band - 0.08) * H;
    g.fillStyle = 'rgba(255,250,220,0.08)'; g.fillRect(0, by, W, H * 0.07);
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`; g.fillRect(Math.random() * 20, by + Math.random() * H * 0.07, W * (0.3 + Math.random() * 0.7), 1); }
    // now and then a short glitch burst: shifted colour slices
    if (this.glitch > 0) this.glitch -= 1;
    else if (Math.random() < (info.tense ? 0.05 : 0.008)) this.glitch = 4 + Math.floor(Math.random() * 6);
    if (this.glitch > 0) {
      for (let i = 0; i < 6; i++) {
        const y = Math.random() * H, h = 1 + Math.random() * 7, x = (Math.random() - 0.5) * 30;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,40,200,0.22)' : 'rgba(40,255,240,0.22)';
        g.fillRect(x, y, W, h);
      }
    }
  }
  paintCaption(info) {
    const blink = Math.floor(this.t * 1.4) % 2 === 0;
    const s = Math.max(0, Math.floor(info.rec));
    const tc = `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
    const bat = info.bat;
    const cells = '▮'.repeat(bat) + '▯'.repeat(3 - bat);
    this.cap.innerHTML =
      `<div class="lv-rec" style="position:absolute;left:3%;top:4%"><span style="color:#ff3030;opacity:${blink ? 1 : 0}">●</span> REC</div>`
      + `<div class="lv-bat" style="position:absolute;right:3%;top:4%;text-align:right">${cells} <span style="opacity:0.85">${info.batLabel}</span></div>`
      + `<div class="lv-play" style="position:absolute;left:3%;bottom:5%;opacity:0.92">▶ ${t('PLAY')} ${tc}<br><span style="font-size:0.72em;opacity:0.8">${t('SP')} · ${info.level} · CH 03</span></div>`
      + `<div class="lv-stamp" style="position:absolute;right:3%;bottom:5%;text-align:right;color:#ffa030;opacity:0.9">${info.stamp}</div>`;
  }
  dispose() { this.el.remove(); }
}

export function installLiminal(game) {
  addTranslations(TR);
  addTranslations(RU, 'ru');
  const offs = [];
  const on = (ev, fn) => { const off = game.mods?.on?.(ev, fn); if (typeof off === 'function') offs.push(off); };
  const S = { vhs: null, active: false, force: null, since: 0, stamp: '', stampKey: '', walkT: 0, cardTimer: null, card: null, lastPos: null };

  // where does the footage run: inside the pocket, or anywhere in a backrooms facility (the local camera decides)
  function wantVhs() {
    if (S.force !== null) return S.force;
    const p = game.player;
    if (!p || p.dead) return false;
    const cam = game.camera?.position;
    if (!cam) return false;
    try {
      const pk = game.backrooms?.pocket;
      if (pk && pk.contains(cam)) return true;
      const fac = game.world?.facility;
      return !!(fac && fac.layout?.theme === 'backrooms' && p.indoor && fac.contains?.(cam));
    } catch { return false; }
  }
  const levelName = () => {
    try {
      const pk = game.backrooms?.pocket;
      if (pk && pk.contains(game.camera.position)) return 'LEVEL 0';
      const id = game.brlevels?.current;
      return LEVEL_NAMES[typeof id === 'object' ? id?.id : id] || 'LEVEL 0';
    } catch { return 'LEVEL 0'; }
  };
  function stampNow() {
    const day = game.run?.day | 0, seed = game.run?.seed | 0;
    const key = `${seed}|${day}`;
    if (key !== S.stampKey) { S.stampKey = key; S.stamp = photoStamp(hashString('vhs|' + key)); }
    return S.stamp;
  }

  on('update', (dt) => {
    try {
      const want = wantVhs();
      if (want !== S.active) {
        S.active = want;
        if (want) { S.since = game.time; S.vhs = S.vhs || new Vhs(); }
        S.vhs?.show(want);
      }
      if (!S.active || !S.vhs) return;
      const p = game.player;
      const moving = !!(p?.vel && Math.hypot(p.vel.x, p.vel.z) > 1);
      const rec = game.time - S.since;
      // the battery drains slowly and cosmetically
      const bat = rec < 300 ? 3 : rec < 700 ? 2 : 1;
      const tense = !!(game.backrooms?.state?.hunt);
      S.vhs.update(dt, { rec, bat, batLabel: bat === 1 && Math.floor(rec) % 2 ? '' : 'BATT', level: levelName(), stamp: stampNow(), moving, tense });
    } catch (e) { if (!S.err) { S.err = true; console.warn('liminal', e); } }
  });

  // ---- polaroid card
  function closeCard() {
    clearTimeout(S.cardTimer); S.cardTimer = null;
    const c = S.card; S.card = null;
    if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 600); }
  }
  function showPhoto(seed) {
    seed = (seed >>> 0) || 1;
    closeCard();
    const card = document.createElement('div');
    card.className = 'br-polaroid';
    card.style.cssText = 'position:fixed;left:50%;top:46%;transform:translate(-50%,-50%) rotate(-3deg) scale(0.92);background:#f3efe4;padding:14px 14px 48px;box-shadow:0 18px 50px rgba(0,0,0,0.6);z-index:45;pointer-events:none;transition:opacity .5s, transform .7s;opacity:0';
    const cv = document.createElement('canvas'); cv.width = 280; cv.height = 220;
    cv.style.cssText = 'display:block;width:280px;height:220px;image-rendering:pixelated';
    const cap = document.createElement('div');
    cap.textContent = t(CAPTIONS[(seed >>> 3) % CAPTIONS.length]);
    cap.style.cssText = 'position:absolute;left:0;right:0;bottom:11px;text-align:center;font:italic 20px "Comic Sans MS","Segoe Print",cursive;color:#2a2a3a';
    card.append(cv, cap);
    uiRoot().appendChild(card);
    S.card = card;
    // develop: repaint a few times, dark wash -> picture (the same seed, so the same photo every time)
    const steps = reduced() ? [1] : [0.05, 0.3, 0.6, 0.85, 1];
    let i = 0;
    const paint = () => {
      if (S.card !== card) return;
      try { paintLiminalPhoto(cv, seed, { develop: steps[i] }); } catch (e) { console.warn('liminal photo', e); }
      i++;
      if (i < steps.length) setTimeout(paint, 650);
    };
    paint();
    requestAnimationFrame(() => { card.style.opacity = '1'; card.style.transform = 'translate(-50%,-50%) rotate(-2deg) scale(1)'; });
    S.cardTimer = setTimeout(closeCard, 7000);
    game.mods?.emit?.('tfg:photo', { seed, scene: sceneOf(seed) });
    return card;
  }

  function dispose() {
    for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } }
    S.vhs?.dispose(); S.vhs = null;
    clearTimeout(S.cardTimer);
    S.card?.remove(); S.card = null;
    if (game.liminal === api) delete game.liminal;
  }
  const api = {
    showPhoto,
    get vhs() { return S.vhs; },
    get vhsActive() { return S.active; },
    /** force the footage overlay on / off (null = automatic) - debug and harness hook */
    setVhs(v) { S.force = v === null || v === undefined ? null : !!v; },
    paintPhoto: paintLiminalPhoto,
    dispose,
  };
  return api;
}
