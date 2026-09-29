// [profile] PROFILE panel (CRT style): nickname + avatar. Opened from the CRT main menu (PROFILE), the CHARACTER
// sheet ("Edit profile") and in-game from the same sheet. Two avatar modes: a 16x16 PIXEL EDITOR (16 colours,
// pencil / fill / eraser / mirror, TFG screen-face templates) and a 3D SNAPSHOT of your current character
// (64x64 PNG, capped at ~6 KB). Frames unlock by level / achievement. Saved to the profile, synced to the crew
// (game/profilesync.js: helloData.av + the 'pf' message) and shown on the menu card, lobby browser, TAB list,
// chat, day summary and above remote name tags.
import * as THREE from 'three';
import { el, clamp } from '../../core/util.js';
import { glyphEl } from '../glyphs.js';
import { t, tf, addTranslations } from '../../core/i18n.js';
import { saveProfile } from '../../core/save.js';
import { validateName, NAME_REASONS, NAME_MAX } from '../../core/profilename.js';
import { createAvatar, SUIT_COLORS } from '../../models/avatar.js';
import { syncProfile } from '../../game/profilesync.js';
import {
  PAL, AV_N, TEMPLATES, FRAMES, frameUnlocked, frameNeedText, frameName, decodePx, encodePx, defaultPx, floodFill, lineCells,
  sanitizeAvatar, avatarCanvas, drawAvatar, drawPixelGrid, capPng, thumbOfCanvas, blankPx,
} from '../avatarpic.js';

const STYLE_ID = 'tfg-profile-style';
const CSS = `
.profile{width:min(900px,95vw);max-height:92vh}
.profile .cp-body{display:flex;gap:22px;overflow:auto;padding:12px 18px 14px}
.pf-left{width:290px;flex-shrink:0;display:flex;flex-direction:column;gap:9px}
.pf-right{flex:1;min-width:0;display:flex;flex-direction:column;gap:9px}
.pf-card{display:flex;gap:12px;align-items:center;border:1px solid var(--ph-line);background:rgba(0,0,0,.35);padding:10px}
.pf-card .pf-nm{font-family:var(--cond);font-weight:bold;font-size:26px;line-height:1.05;word-break:break-all}
.pf-card .pf-lv{font-size:18px;opacity:.85}
.pf-msg{min-height:22px;font-size:17px}
.pf-msg.bad{color:#ff8a7a}.pf-msg.good{color:#8dff9a}
.pf-name{display:flex;gap:6px}.pf-name input{flex:1;min-width:0}
.pf-frames,.pf-pal,.pf-tools,.pf-tpl,.pf-angle{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.pf-fr{padding:2px 8px;border:1px solid var(--ph-line);cursor:pointer;font-size:17px;user-select:none}
.pf-fr.sel{background:rgba(255,138,61,.25);box-shadow:0 0 8px #ff8a3d inset}.pf-fr.locked{opacity:.45}
.pf-sw{width:24px;height:24px;border:2px solid rgba(255,255,255,.25);cursor:pointer}
.pf-sw.sel{border-color:#fff;box-shadow:0 0 6px #fff}
.pf-grid{width:256px;height:256px;image-rendering:pixelated;border:2px solid var(--ph-line);cursor:crosshair;touch-action:none;background:#000;align-self:flex-start}
.pf-edit{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.pf-snap{width:192px;height:192px;image-rendering:pixelated;border:2px solid var(--ph-line);background:#000}
.pf-note{font-size:16px;opacity:.75}
.pf-lbl{font-family:var(--cond);font-weight:bold;letter-spacing:1px;text-transform:uppercase;font-size:16px;color:var(--ph-dim)}
@media (max-width:760px){.profile .cp-body{flex-direction:column}.pf-left{width:auto}}
`;
const injectStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
};

/** Names a new nickname must not duplicate: the current crew and the hosts in the lobby browser. */
export function namesInUse(app) {
  const out = [];
  for (const r of app.game?.remotes?.values?.() || []) out.push(r.name);
  for (const l of app.lobbyDir?.list?.() || []) out.push(l.host);
  return out.filter(Boolean);
}

/** Validate + apply a new nickname. -> { ok, name } | { ok: false, reason }. Saves, syncs the crew and the lobby announce. */
export function applyProfileName(app, raw) {
  const p = app.profile;
  const v = validateName(raw, { taken: namesInUse(app), own: p.name });
  if (!v.ok) return v;
  if (v.name !== p.name) {
    p.name = v.name;
    saveProfile(p);
    syncProfile(app.game);
  }
  return v;
}

/** Store an avatar (null = generated default) and tell the crew. */
export function applyProfileAvatar(app, av) {
  const p = app.profile;
  p.avatar = av ? sanitizeAvatar(av) : null;
  saveProfile(p);
  syncProfile(app.game);
}

// ---------------------------------------------------------------- 3D snapshot
/** Render the profile's character as a 128 px head-and-shoulders portrait, downscaled to 64x64 on `bg`. Never throws. */
export function capturePortrait(profile, bg = '#20242c', yaw = 0.25) {
  const out = document.createElement('canvas'); out.width = out.height = 64;
  const g = out.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 64, 64);
  const RW = 128;
  let r = null, avatar = null;
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = RW;
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    r.setPixelRatio(1); r.setSize(RW, RW, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(new THREE.Color(bg), 1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe2c4, 0x2a2018, 1.3));
    const key = new THREE.DirectionalLight(0xffc896, 2.4); key.position.set(1.4, 2.2, 2.4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb8ff, 1.4); rim.position.set(-2, 1.6, -2); scene.add(rim);
    const suit = (SUIT_COLORS.find((s) => s.id === profile.suit) || SUIT_COLORS[0]).color;
    avatar = createAvatar({ suitColor: suit, hat: profile.hat || 'none' });
    avatar.setLook?.(profile);
    avatar.root.rotation.y = yaw;
    scene.add(avatar.root);
    for (let i = 0; i < 2; i++) avatar.update(0.016, { time: 0, speed: 0, grounded: true, emote: null, lookPitch: 0 });
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    cam.position.set(0, 1.56, 1.9); cam.lookAt(0, 1.5, 0);
    r.render(scene, cam);
    g.imageSmoothingEnabled = true;
    g.drawImage(canvas, 0, 0, 64, 64);
  } catch (e) {
    console.warn('[profile] snapshot render failed, using a flat bust', e);
    const suit = (SUIT_COLORS.find((s) => s.id === profile.suit) || SUIT_COLORS[0]).color;
    g.fillStyle = suit; g.fillRect(12, 40, 40, 24);
    g.fillStyle = '#f2c9a0'; g.fillRect(22, 14, 20, 24);
    g.fillStyle = '#0b0b0d'; g.fillRect(26, 22, 4, 4); g.fillRect(34, 22, 4, 4);
  } finally {
    try { avatar?.dispose?.(); r?.dispose(); r?.forceContextLoss?.(); } catch { /* ignore */ }
  }
  return out;
}

// ---------------------------------------------------------------- the panel
export function profilePanel(ui, { inGame = false } = {}) {
  injectStyle();
  const app = ui.app, p = app.profile;
  const wrap = ui.panel('wide profile');

  // --- draft state
  let nameDraft = p.name;
  let frame = sanitizeAvatar(p.avatar)?.f || 'none';
  let custom = !!sanitizeAvatar(p.avatar);
  const saved = sanitizeAvatar(p.avatar);
  let mode = saved?.m === 's' ? 's' : 'p';
  let pix = decodePx(saved && saved.m === 'p' ? saved.px : defaultPx(p.name));
  let snap = saved && saved.m === 's' ? { png: saved.png, thumb: saved.px, bg: saved.bg || '#20242c' } : null;
  let snapBg = snap?.bg || PAL[3];
  let snapYaw = 0.25;
  let tool = 'pencil', colour = 5, mirror = false;
  let hist = [];
  let dirty = false;

  const compose = () => {
    if (!custom) return sanitizeAvatar({ m: 'p', f: 'none', px: defaultPx(nameDraft) });
    if (mode === 's' && snap) return sanitizeAvatar({ m: 's', f: frame, px: snap.thumb, png: snap.png, bg: snap.bg });
    return sanitizeAvatar({ m: 'p', f: frame, px: encodePx(pix) });
  };
  const markDirty = () => { custom = true; dirty = true; saveBtn.textContent = t('SAVE AVATAR') + ' *'; avMsg.textContent = t('unsaved changes'); avMsg.className = 'pf-msg bad'; refreshCard(); };

  // --- card (live preview of what the crew / the lobby list will see)
  const cardAv = avatarCanvas(compose(), 96);
  const cardName = el('div', { class: 'pf-nm' }, nameDraft);
  const cardLv = el('div', { class: 'pf-lv' }, tf('Lv.{level}', { level: p.level }));
  const refreshCard = () => { cardAv.repaint(compose()); cardName.textContent = nameDraft || p.name; };

  // --- nickname
  const nameIn = el('input', { value: p.name, maxlength: NAME_MAX, autocomplete: 'off', spellcheck: 'false', 'data-nav': 'pf:name' });
  const nameMsg = el('div', { class: 'pf-msg' });
  const check = () => {
    const v = validateName(nameIn.value, { taken: namesInUse(app), own: p.name });
    nameDraft = v.name || p.name;
    nameMsg.textContent = v.ok ? t('Looks good.') : t(NAME_REASONS[v.reason]);
    nameMsg.className = 'pf-msg ' + (v.ok ? 'good' : 'bad');
    refreshCard();
    return v;
  };
  const commitName = () => {
    const v = check();
    if (!v.ok) { ui.sfx('ui_hover', 0.3); return; }
    const r = applyProfileName(app, nameIn.value);
    if (r.ok) { nameIn.value = r.name; nameDraft = r.name; ui.toast(t('Name saved.'), 'good'); refreshCard(); }
  };
  nameIn.addEventListener('input', check);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } });

  // --- frames
  const framesBox = el('div', { class: 'pf-frames' });
  const drawFrames = () => {
    framesBox.innerHTML = '';
    for (const f of FRAMES) {
      const open = frameUnlocked(f.id, p);
      const need = f.need?.level ? tf('Unlocks at level {n}', { n: f.need.level }) : f.need?.ach ? tf('Unlocks with achievement: {a}', { a: frameNeedText(f.id).replace('Achievement: ', '') }) : '';
      const c = el('div', { class: 'pf-fr' + (frame === f.id ? ' sel' : '') + (open ? '' : ' locked'), tabindex: open ? 0 : -1, title: open ? '' : need }, open ? null : glyphEl('lock'), (open ? '' : ' ') + t(frameName(f.id)));
      c.addEventListener('click', () => { if (!open) { ui.toast(need, 'bad'); return; } frame = f.id; ui.sfx(); markDirty(); drawFrames(); });
      framesBox.appendChild(c);
    }
  };

  // --- tabs + bodies
  const body = el('div', { class: 'pf-body' });
  const tabs = el('div', { class: 'tabs' });
  const drawTabs = () => {
    tabs.innerHTML = '';
    for (const [id, label] of [['p', 'PIXEL EDITOR'], ['s', 'SNAPSHOT']]) {
      const b = ui.button(t(label), () => { if (mode === id) return; mode = id; drawTabs(); drawBody(); if (custom) markDirty(); else refreshCard(); ui.flick(wrap); }, mode === id ? 'tab sel' : 'tab');
      b.dataset.nav = 'pf:tab:' + id;
      tabs.appendChild(b);
    }
  };

  const drawBody = () => { body.innerHTML = ''; body.appendChild(mode === 'p' ? pixelBody() : snapBody()); };

  function pixelBody() {
    const grid = el('canvas', { class: 'pf-grid', width: 256, height: 256 });
    const gctx = grid.getContext('2d');
    const paintGrid = () => { gctx.imageSmoothingEnabled = false; drawPixelGrid(gctx, encodePx(pix), 0, 0, 256, true); };
    const cellOf = (e) => { const r = grid.getBoundingClientRect(); return [clamp(Math.floor((e.clientX - r.left) / r.width * AV_N), 0, AV_N - 1), clamp(Math.floor((e.clientY - r.top) / r.height * AV_N), 0, AV_N - 1)]; };
    const put = (x, y) => { const c = tool === 'eraser' ? 0 : colour; pix[y * AV_N + x] = c; if (mirror) pix[y * AV_N + (AV_N - 1 - x)] = c; };
    const push = () => { hist.push(encodePx(pix)); if (hist.length > 40) hist.shift(); };
    const changed = () => { mode = 'p'; paintGrid(); markDirty(); };
    let down = false, last = null;
    grid.addEventListener('pointerdown', (e) => {
      e.preventDefault(); grid.setPointerCapture?.(e.pointerId);
      const [x, y] = cellOf(e);
      push();
      if (tool === 'fill') { floodFill(pix, x, y, colour); if (mirror) floodFill(pix, AV_N - 1 - x, y, colour); } else { put(x, y); down = true; last = [x, y]; }
      changed();
    });
    grid.addEventListener('pointermove', (e) => {
      if (!down) return;
      const [x, y] = cellOf(e);
      if (last && last[0] === x && last[1] === y) return;
      for (const [cx, cy] of lineCells(last[0], last[1], x, y)) put(cx, cy);
      last = [x, y]; changed();
    });
    const up = () => { down = false; last = null; };
    grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);

    const pal = el('div', { class: 'pf-pal' });
    const drawPal = () => {
      pal.innerHTML = '';
      PAL.forEach((c, i) => {
        const sw = el('div', { class: 'pf-sw' + (colour === i && tool !== 'eraser' ? ' sel' : ''), style: { background: c }, tabindex: 0, title: '#' + i.toString(16) });
        sw.addEventListener('click', () => { colour = i; if (tool === 'eraser') tool = 'pencil'; drawPal(); drawTools(); });
        pal.appendChild(sw);
      });
    };
    const tools = el('div', { class: 'pf-tools' });
    const drawTools = () => {
      tools.innerHTML = '';
      for (const [id, label] of [['pencil', 'Pencil'], ['fill', 'Fill'], ['eraser', 'Eraser']]) tools.appendChild(ui.button(t(label), () => { tool = id; drawTools(); drawPal(); }, 'small tab' + (tool === id ? ' sel' : '')));
      tools.appendChild(ui.button(t('Mirror'), () => { mirror = !mirror; drawTools(); }, 'small tab' + (mirror ? ' sel' : '')));
      tools.appendChild(ui.button(t('Undo'), () => { const h = hist.pop(); if (h) { pix = decodePx(h); changed(); } }, 'small'));
      tools.appendChild(ui.button(t('Clear'), () => { push(); pix = decodePx(blankPx(0)); changed(); }, 'small'));
    };
    const tpl = el('div', { class: 'pf-tpl' });
    for (const T of TEMPLATES) tpl.appendChild(ui.button(t(T.name), () => { push(); pix = decodePx(T.px()); changed(); }, 'small'));
    paintGrid(); drawPal(); drawTools();
    return el('div', { class: 'pf-edit' }, grid,
      el('div', { class: 'pf-right', style: { minWidth: '200px' } }, el('div', { class: 'pf-lbl' }, t('Palette')), pal, el('div', { class: 'pf-lbl' }, t('Tools')), tools, el('div', { class: 'pf-lbl' }, t('Templates')), tpl));
  }

  function snapBody() {
    const prev = el('canvas', { class: 'pf-snap', width: 192, height: 192 });
    const info = el('div', { class: 'pf-note' });
    const paintPrev = () => {
      const g = prev.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = snapBg; g.fillRect(0, 0, 192, 192);
      if (snap) drawAvatar(g, { m: 's', f: 'none', px: snap.thumb, png: snap.png }, 0, 0, 192, { frame: false, onReady: paintPrev });
      info.textContent = snap ? `64x64 · ${(snap.png.length * 0.75 / 1024).toFixed(1)} KB` : t('No snapshot yet.');
    };
    const bgBox = el('div', { class: 'pf-pal' });
    const drawBg = () => {
      bgBox.innerHTML = '';
      PAL.forEach((c) => {
        const sw = el('div', { class: 'pf-sw' + (snapBg === c ? ' sel' : ''), style: { background: c }, tabindex: 0 });
        sw.addEventListener('click', () => { snapBg = c; drawBg(); paintPrev(); });
        bgBox.appendChild(sw);
      });
    };
    const angle = el('div', { class: 'pf-angle' });
    const drawAngle = () => {
      angle.innerHTML = '';
      for (const [label, y] of [['Left', -0.45], ['Front', 0], ['Right', 0.45]]) angle.appendChild(ui.button(t(label), () => { snapYaw = y; drawAngle(); }, 'small tab' + (snapYaw === y ? ' sel' : '')));
    };
    const take = ui.button(t('TAKE SNAPSHOT'), () => {
      const canvas = capturePortrait(p, snapBg, snapYaw);
      const png = capPng(canvas);
      if (!png) { ui.toast(t('Snapshot too heavy, try another background.'), 'bad'); return; }
      snap = { png, thumb: thumbOfCanvas(canvas), bg: snapBg };
      mode = 's'; markDirty(); paintPrev();
    }, 'primary');
    take.prepend(glyphEl('camera'), ' ');
    paintPrev(); drawBg(); drawAngle();
    return el('div', { class: 'pf-edit' }, prev,
      el('div', { class: 'pf-right', style: { minWidth: '200px' } },
        el('div', { class: 'pf-note' }, t('Renders your character (suit, hat, cosmetics) as a 64x64 portrait.')),
        el('div', { class: 'pf-lbl' }, t('Background')), bgBox, el('div', { class: 'pf-lbl' }, t('Angle')), angle, take, info));
  }

  // --- save / reset
  const avMsg = el('div', { class: 'pf-msg' });
  const saveBtn = ui.button(t('SAVE AVATAR'), () => {
    const av = compose();
    applyProfileAvatar(app, custom ? av : null);
    dirty = false; saveBtn.textContent = t('SAVE AVATAR'); avMsg.textContent = t('Avatar saved.'); avMsg.className = 'pf-msg good';
    ui.toast(t('Avatar saved.'), 'good');
  }, 'primary');
  const resetBtn = ui.button(t('RESET TO DEFAULT'), () => {
    custom = false; mode = 'p'; frame = 'none'; snap = null; pix = decodePx(defaultPx(p.name)); hist = [];
    applyProfileAvatar(app, null);
    dirty = false; saveBtn.textContent = t('SAVE AVATAR'); avMsg.textContent = ''; drawFrames(); drawTabs(); drawBody(); refreshCard();
  }, 'small');

  // --- assemble
  drawFrames(); drawTabs(); drawBody();
  const left = el('div', { class: 'pf-left' },
    el('div', { class: 'pf-card' }, cardAv, el('div', {}, cardName, cardLv)),
    el('div', { class: 'pf-lbl' }, t('Nickname')),
    el('div', { class: 'pf-name' }, nameIn, ui.button(t('APPLY NAME'), commitName, 'small primary')),
    nameMsg,
    el('div', { class: 'pf-note' }, t('Your name and picture are what the crew sees in lobbies, chat and name tags.')));
  const right = el('div', { class: 'pf-right' },
    el('div', { class: 'pf-lbl' }, t('AVATAR')), tabs, body,
    el('div', { class: 'pf-lbl' }, t('Frame')), framesBox,
    el('div', { class: 'menu-row' }, saveBtn, resetBtn), avMsg);
  wrap.append(ui.panelHead(t('PROFILE'), p.name),
    el('div', { class: 'cp-body' }, left, right),
    el('div', { class: 'menu-row', style: { padding: '0 18px 10px' } }, inGame ? ui.button(t('Close'), () => ui.closePanel(), 'back') : ui.backButton(() => ui.showMenu('title'))),
    ui.panelFoot());
  return wrap;
}

// ---------------------------------------------------------------- translations
addTranslations({
  'PROFILE': 'PROFİL', 'Nickname': 'Takma ad', 'APPLY NAME': 'ADI UYGULA', 'Name saved.': 'Ad kaydedildi.', 'Looks good.': 'Uygun.',
  'Name needs at least 2 characters.': 'Ad en az 2 karakter olmalı.', 'Name is too long (max 16 characters).': 'Ad çok uzun (en fazla 16 karakter).',
  'Use letters, digits, spaces and . _ - only.': 'Sadece harf, rakam, boşluk ve . _ - kullan.', 'That name is not allowed.': 'Bu ada izin verilmiyor.',
  'That name is reserved.': 'Bu ad ayrılmış.', 'Someone here already uses a name that looks like that.': 'Burada biri buna benzer bir ad kullanıyor.',
  'Your name and picture are what the crew sees in lobbies, chat and name tags.': 'Adın ve resmin lobilerde, sohbette ve isim etiketlerinde ekibe görünür.',
  'AVATAR': 'AVATAR', 'PIXEL EDITOR': 'PİKSEL EDİTÖR', 'SNAPSHOT': 'ANLIK GÖRÜNTÜ', 'Pencil': 'Kalem', 'Fill': 'Doldur', 'Eraser': 'Silgi', 'Mirror': 'Ayna', 'Undo': 'Geri al', 'Clear': 'Temizle',
  'Palette': 'Palet', 'Tools': 'Araçlar', 'Templates': 'Şablonlar', 'Smile': 'Gülen', 'Happy': 'Mutlu', 'Dead': 'Ölü', 'Angry': 'Kızgın', 'Glitch': 'Arıza',
  'Background': 'Arka plan', 'Angle': 'Açı', 'Front': 'Önden', 'Left': 'Sol', 'Right': 'Sağ', 'TAKE SNAPSHOT': 'FOTOĞRAF ÇEK', 'No snapshot yet.': 'Henüz görüntü yok.',
  'Renders your character (suit, hat, cosmetics) as a 64x64 portrait.': 'Karakterini (kıyafet, şapka, kozmetikler) 64x64 portre olarak çizer.',
  'Snapshot too heavy, try another background.': 'Görüntü çok ağır, başka bir arka plan dene.',
  'Frame': 'Çerçeve', 'None': 'Yok', 'Amber': 'Kehribar', 'Hazard': 'Tehlike', 'Silver': 'Gümüş', 'Gold': 'Altın', 'Blood': 'Kan', 'Void': 'Boşluk',
  'Unlocks at level {n}': 'Seviye {n} ile açılır', 'Unlocks with achievement: {a}': 'Başarım ile açılır: {a}',
  'SAVE AVATAR': 'AVATARI KAYDET', 'Avatar saved.': 'Avatar kaydedildi.', 'RESET TO DEFAULT': 'VARSAYILANA DÖN', 'unsaved changes': 'kaydedilmemiş değişiklikler',
  'Avatars above name tags': 'İsim etiketlerinin üstünde avatar', "small picture over crewmates' heads": 'ekip arkadaşlarının başının üstünde küçük resim',
  '[PROFILE] name / avatar': '[PROFİL] ad / avatar', 'Edit profile': 'Profili düzenle',
}, 'tr');
addTranslations({
  'PROFILE': 'ПРОФИЛЬ', 'Nickname': 'Никнейм', 'APPLY NAME': 'ПРИМЕНИТЬ', 'Name saved.': 'Имя сохранено.', 'Looks good.': 'Отлично.',
  'Name needs at least 2 characters.': 'Имя должно содержать минимум 2 символа.', 'Name is too long (max 16 characters).': 'Слишком длинное имя (максимум 16 символов).',
  'Use letters, digits, spaces and . _ - only.': 'Только буквы, цифры, пробелы и . _ -', 'That name is not allowed.': 'Это имя запрещено.',
  'That name is reserved.': 'Это имя зарезервировано.', 'Someone here already uses a name that looks like that.': 'Здесь уже есть похожее имя.',
  'Your name and picture are what the crew sees in lobbies, chat and name tags.': 'Имя и картинку видит экипаж в лобби, чате и над головой.',
  'AVATAR': 'АВАТАР', 'PIXEL EDITOR': 'ПИКСЕЛЬНЫЙ РЕДАКТОР', 'SNAPSHOT': 'СНИМОК', 'Pencil': 'Карандаш', 'Fill': 'Заливка', 'Eraser': 'Ластик', 'Mirror': 'Зеркало', 'Undo': 'Отмена', 'Clear': 'Очистить',
  'Palette': 'Палитра', 'Tools': 'Инструменты', 'Templates': 'Шаблоны', 'Smile': 'Улыбка', 'Happy': 'Радость', 'Dead': 'Мёртв', 'Angry': 'Злой', 'Glitch': 'Глюк',
  'Background': 'Фон', 'Angle': 'Ракурс', 'Front': 'Спереди', 'Left': 'Слева', 'Right': 'Справа', 'TAKE SNAPSHOT': 'СДЕЛАТЬ СНИМОК', 'No snapshot yet.': 'Снимка ещё нет.',
  'Renders your character (suit, hat, cosmetics) as a 64x64 portrait.': 'Рисует вашего персонажа (костюм, шапка, косметика) портретом 64x64.',
  'Snapshot too heavy, try another background.': 'Снимок слишком тяжёлый, попробуйте другой фон.',
  'Frame': 'Рамка', 'None': 'Нет', 'Amber': 'Янтарь', 'Hazard': 'Опасность', 'Silver': 'Серебро', 'Gold': 'Золото', 'Blood': 'Кровь', 'Void': 'Пустота',
  'Unlocks at level {n}': 'Откроется на уровне {n}', 'Unlocks with achievement: {a}': 'Откроется за достижение: {a}',
  'SAVE AVATAR': 'СОХРАНИТЬ АВАТАР', 'Avatar saved.': 'Аватар сохранён.', 'RESET TO DEFAULT': 'СБРОС', 'unsaved changes': 'есть несохранённые изменения',
  'Avatars above name tags': 'Аватары над никами', "small picture over crewmates' heads": 'маленькая картинка над головой напарников',
  '[PROFILE] name / avatar': '[ПРОФИЛЬ] имя / аватар', 'Edit profile': 'Изменить профиль',
}, 'ru');
