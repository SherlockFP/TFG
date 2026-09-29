// ARTDIR main menu: replaces CRTMenu.drawMenu (the big CRT in the Cell 07 room) when html.tfg-artdir is on. Canvas 2D only, drawn at the
// existing ~15 fps by crtmenu.update(); no extra canvases. Layout (640x480): header (seal + animated wordmark + the Algorithm's eye that
// follows the cursor), three entry groups with a plate-style selection, hint line, "Company memo" ticker, key hints.
// Screen changes trigger a scanline wipe (skipped with reduceMotion). Colours: docs/wave6/artdir.md.
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { glyphPath } from './glyphs.js';
import { WM_LETTERS, COL, drawWordmark, drawSeal, drawEye } from './logo.js';
import './artdir_i18n.js';

const F = (px) => `700 ${px}px "TFG Plate", "TFG Plate Cyr", "Arial Narrow", Impact, sans-serif`;
const V = (px) => `${px}px "TFG Credit", VT323, "TFG Cyr VT", monospace`;
const COL_LEFT = new Set(['continue', 'host', 'quick', 'browser', 'daily']);
const MODE_GLYPH = { host: 'van', browser: 'web', daily: 'calendar', profile: 'user', hub: 'building', character: 'mask', mods: 'gear', settings: 'gear', howto: 'help' };
export const MEMOS = [
  'MEMO 07-A: YOUR ENGAGEMENT IS MONITORED FOR YOUR OWN SAFETY.',
  'MEMO 12: QUOTA IS NOT A SUGGESTION. NEITHER IS THE ALGORITHM.',
  'MEMO 19: EMPLOYEE OF THE MONTH HAS BEEN REASSIGNED TO THE MOON. PERMANENTLY.',
  'MEMO 23: THE CELL IS NOT A JAIL. IT IS A REVIEW ENVIRONMENT.',
  'MEMO 31: PLEASE STOP FEEDING THE SHIP CAT. THE SHIP HAS NO CAT.',
  'MEMO 44: HAZARD PAY HAS BEEN REPLACED BY HAZARD TAPE.',
  'MEMO 58: LOST EQUIPMENT WILL BE DEDUCTED FROM YOUR NEXT LIFE.',
  'MEMO 66: SMILE. THE VIEWERS CAN SEE YOU.',
];
export const HINTS = { continue: 'RESUME YOUR LAST SAVE', host: 'START A CREW SESSION', browser: 'FIND A CREW ONLINE', daily: 'REWARDS AND CHALLENGES', profile: 'YOUR SERVICE RECORD',
  hub: 'MEET THE OTHER STAFF', character: 'CHANGE YOUR FACE', mods: 'EXTRA CONTENT PACKS', settings: 'AUDIO, VIDEO, CONTROLS', howto: 'ORIENTATION MANUAL' };

const _v = new THREE.Vector3();
let wmPath = null;

function state(menu) {
  if (menu._ad) return menu._ad;
  const ad = menu._ad = { ptr: null, look: { x: 0, y: 0 }, wipeAt: -9, lastKey: '', plateW: 0, lastT: 0, blinkAt: 3, glitchAt: 2.2, glitchUntil: 0, memo: 0 };
  ad.onMove = (e) => { const r = menu.engine.canvas.getBoundingClientRect(); ad.ptr = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; };
  window.addEventListener('pointermove', ad.onMove, { passive: true });
  ad.dispose = () => window.removeEventListener('pointermove', ad.onMove);
  try { document.fonts?.load('700 20px "TFG Plate"'); document.fonts?.load('700 20px "TFG Plate Cyr"', 'Я'); } catch { /* fonts are optional */ }
  return ad;
}

/** canvas point -> look vector of an eye placed there, from the pointer position projected on the same screen (or a slow wander) */
function lookAt(menu, ad, px, py, W, H, time) {
  let tx, ty;
  if (ad.ptr && menu.main?.screen) {
    const s = menu.main.screen;
    _v.set((px / W - 0.5) * menu.main.w, (0.5 - py / H) * menu.main.h, 0); s.localToWorld(_v); _v.project(menu.engine.camera);
    tx = ad.ptr.x - _v.x; ty = ad.ptr.y - _v.y;
    const l = Math.hypot(tx, ty) || 1, k = Math.min(1, l / 0.35) / l; tx *= k; ty *= k;
  } else { tx = Math.sin(time * 0.7) * 0.8; ty = Math.sin(time * 1.3) * 0.4; }
  ad.look.x += (tx - ad.look.x) * 0.35; ad.look.y += (ty - ad.look.y) * 0.35;
  return ad.look;
}

function header(menu, ad, ctx, W, time, reduce, small) {
  const seal = small ? 40 : 56;
  drawSeal(ctx, 20 + seal / 2, 20 + seal / 2, seal, COL.amber);
  const gl = !reduce && time < ad.glitchUntil;
  const wh = small ? 30 : 46, wx = 20 + seal + 18, wy = small ? 22 : 18;
  drawWordmark(ctx, wx, wy, wh, { ghost: gl, jitter: gl ? Math.random() * 4 : 0 });
  const ww = wh * 114 / 40;
  // light sweep clipped to the letters
  if (!reduce) {
    if (!wmPath) { wmPath = new Path2D(); for (const l of WM_LETTERS) wmPath.addPath(new Path2D(l.d), new DOMMatrix().translate(l.x, 0)); }
    ctx.save(); ctx.translate(wx, wy); ctx.scale(wh / 40, wh / 40); ctx.clip(wmPath);
    const sx = ((time * 0.45) % 2.4 - 0.5) * 114; ctx.fillStyle = 'rgba(255,246,220,0.55)'; ctx.fillRect(sx, -4, 14, 50); ctx.restore();
  }
  // hazard tape + product name
  ctx.save(); ctx.beginPath(); ctx.rect(wx, wy + wh + 5, ww, 6); ctx.clip();
  ctx.fillStyle = '#17110a'; ctx.fillRect(wx, wy + wh + 5, ww, 6); ctx.fillStyle = COL.hazard;
  for (let x = -12; x < ww + 12; x += 12) { ctx.beginPath(); ctx.moveTo(wx + x, wy + wh + 11); ctx.lineTo(wx + x + 6, wy + wh + 11); ctx.lineTo(wx + x + 12, wy + wh + 5); ctx.lineTo(wx + x + 6, wy + wh + 5); ctx.fill(); }
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = F(small ? 12 : 14); ctx.fillStyle = COL.mag;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  ctx.fillText('TOTALLY FUCKED GAME', wx, wy + wh + 15);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  // the Algorithm's eye, right side
  const ex = small ? Math.round(W * 0.7) : W - 70, ey = 44, ew = small ? 52 : 64;
  const lk = lookAt(menu, ad, ex, ey, W, 480, time);
  if (time > ad.blinkAt) { ad.blinkAt = time + 2.5 + Math.random() * 4; ad.blinkUntil = time + 0.16; }
  const open = !reduce && time < (ad.blinkUntil || 0) ? 0.1 : 1;
  drawEye(ctx, ex, ey, ew, lk.x, lk.y, { col: '#e9dcc4', pupil: COL.mag, open, ghost: gl });
  ctx.textAlign = 'center'; ctx.font = F(12); ctx.fillStyle = COL.mag;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('THE ALGORITHM', ex, ey + ew / 2 + 6);
  const dot = reduce || Math.floor(time * 1.6) % 2 === 0;
  ctx.fillStyle = dot ? '#ff3d3d' : '#5a1a1a'; ctx.fillRect(ex - 22, ey + ew / 2 + 24, 7, 7);
  ctx.fillStyle = '#e9dcc4'; ctx.textAlign = 'left'; ctx.fillText('LIVE', ex - 11, ey + ew / 2 + 22);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  // divider
  ctx.fillStyle = 'rgba(255,138,61,0.35)'; for (let x = 34; x < W - 34; x += 9) ctx.fillRect(x, small ? 100 : 108, 5, 1);
}

function ticker(ad, ctx, W, H, time, reduce) {
  const y = 398, h = 30;
  ctx.fillStyle = 'rgba(125,255,125,0.07)'; ctx.fillRect(34, y, W - 68, h);
  ctx.fillStyle = COL.amber; ctx.fillRect(34, y, 76, h);
  ctx.font = F(17); ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = COL.ink;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText(t('MEMO'), 72, y + h / 2 + 1);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.save(); ctx.beginPath(); ctx.rect(114, y, W - 68 - 82, h); ctx.clip();
  ctx.font = V(24); ctx.fillStyle = COL.term; ctx.textAlign = 'left';
  if (reduce) { const i = Math.floor(time / 6) % MEMOS.length; ctx.fillText(t(MEMOS[i]), 120, y + h / 2 + 1); }
  else {
    const sep = '     ///     ', all = MEMOS.map((m) => t(m)).join(sep) + sep;
    const w = ctx.measureText(all).width, x = -((time * 44) % w);
    ctx.fillText(all, 120 + x, y + h / 2 + 1); ctx.fillText(all, 120 + x + w, y + h / 2 + 1);
  }
  ctx.restore();
}

/** scanline wipe over a fresh screen: content is revealed top -> bottom under a bright bar */
function wipe(ad, ctx, W, H, time) {
  const k = (time - ad.wipeAt) / 0.5;
  if (k < 0 || k >= 1) return;
  const y = k * H;
  ctx.fillStyle = '#050403'; ctx.fillRect(0, y, W, H - y);
  ctx.fillStyle = 'rgba(255,138,61,0.16)'; for (let yy = y; yy < H; yy += 4) ctx.fillRect(0, yy, W, 1);
  ctx.fillStyle = COL.cyan; ctx.fillRect(0, y - 1, W, 1); ctx.fillStyle = '#fff3e0'; ctx.fillRect(0, y, W, 2); ctx.fillStyle = COL.mag; ctx.fillRect(0, y + 2, W, 1);
}

export function drawArtMenu(menu, c, time) {
  const { ctx, canvas } = c, W = canvas.width, H = canvas.height;
  const ad = state(menu);
  const reduce = !!menu.app.settings?.reduceMotion;
  const dt = Math.min(0.2, Math.max(0, time - ad.lastT)); ad.lastT = time;
  const key = menu.mode + '|' + (menu.modeLabel || '');
  if (key !== ad.lastKey) { ad.lastKey = key; ad.wipeAt = reduce ? -9 : time; }
  if (time > ad.glitchAt) { ad.glitchAt = time + 3 + Math.random() * 5; ad.glitchUntil = time + 0.14; }
  ctx.fillStyle = '#070504'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,138,61,0.035)'; for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 32) ctx.fillRect(0, y, W, 1);
  ctx.textBaseline = 'middle';
  if (menu.mode !== 'title') {
    header(menu, ad, ctx, W, time, reduce, true);
    const scr = menu.app.ui?.currentScreen, gn = MODE_GLYPH[scr];
    const cx = Math.round(W * 0.32);   // the DOM panel covers the right side: keep the content on the visible left part
    // stamped mode label plate + big pictogram
    const label = String(menu.modeLabel || '').toUpperCase(); ctx.font = F(50); const fs0 = Math.min(50, Math.floor(50 * 230 / Math.max(1, ctx.measureText(label).width))); ctx.font = F(fs0); const lw = ctx.measureText(label).width;
    const px = cx - (lw + 36) / 2, py = 190;
    ctx.fillStyle = COL.amber; ctx.fillRect(px, py, lw + 36, 64); ctx.fillStyle = COL.ink; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillText(label, cx + 1, py + 33);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = '#17110a'; ctx.fillRect(px, py + 64, lw + 36, 7);
    ctx.fillStyle = COL.hazard; for (let x = 0; x < lw + 36; x += 12) { ctx.beginPath(); ctx.moveTo(px + x, py + 71); ctx.lineTo(px + x + 6, py + 71); ctx.lineTo(px + x + 12, py + 64); ctx.lineTo(px + x + 6, py + 64); ctx.fill(); }
    if (gn && typeof Path2D !== 'undefined') {
      ctx.save(); ctx.translate(cx - 40, 282); ctx.scale(3.3, 3.3); ctx.strokeStyle = '#e9dcc4'; ctx.lineWidth = 1.5; ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.globalAlpha = 0.85;
      ctx.stroke(new Path2D(glyphPath(gn))); ctx.restore();
    }
    ctx.font = V(28); ctx.fillStyle = '#8f8a80'; ctx.textAlign = 'center';
    ctx.fillText((menu.app.ui?.padActive ? '[B] ' : '[ESC] ') + t('BACK'), cx, 384);
    const k = (time * 0.35) % 1, bx = cx - W * 0.22, bw = W * 0.44;
    ctx.fillStyle = 'rgba(255,138,61,0.2)'; ctx.fillRect(bx, 410, bw, 3);
    ctx.fillStyle = COL.amber; ctx.fillRect(bx + bw * k, 410, bw * 0.08 * (1 - k), 3);
    wipe(ad, ctx, W, H, time);
    return;
  }
  header(menu, ad, ctx, W, time, reduce, false);
  // two columns: PLAY (large) and OFFICE (smaller). Picking is by rect (x and y), keyboard order is the list order
  const items = menu.items, n = items.length;
  const COLS = [{ x: 34, w: 286, h: 54, fs: 37, label: 'PLAY' }, { x: 346, w: 262, h: 39, fs: 27, label: 'OFFICE' }];
  const colOf = (it) => (COL_LEFT.has(it.id) ? 0 : 1);
  menu.itemRects = [];
  const y0 = 140, yc = [y0, y0];
  ctx.font = F(19); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  for (let ci = 0; ci < 2; ci++) {
    const C = COLS[ci], ly = 124;
    ctx.fillStyle = COL.term; ctx.fillText(t(C.label), C.x + 4, ly);
    const lw = ctx.measureText(t(C.label)).width + 14;
    ctx.fillStyle = 'rgba(125,255,125,0.35)'; for (let x = C.x + lw + 6; x < C.x + C.w; x += 7) ctx.fillRect(x, ly, 4, 1);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  let selY = 0, selCol = 0;
  for (let i = 0; i < n; i++) {
    const ci = colOf(items[i]), C = COLS[ci], y = yc[ci], rh = C.h, cy = y + rh / 2, on = i === menu.sel;
    ctx.font = F(C.fs); ctx.textAlign = 'left';
    const label = String(items[i].label).toUpperCase(), lw = ctx.measureText(label).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    const lx = C.x + 44;
    if (on) {
      const target = Math.min(C.w, lw + 64); ad.plateW = reduce ? target : ad.plateW + (target - ad.plateW) * Math.min(1, dt * 16 + 0.25);
      if (Math.abs(ad.plateW - target) < 1) ad.plateW = target;
      ctx.fillStyle = COL.amber; ctx.fillRect(C.x, y + 2, ad.plateW, rh - 4);
      ctx.fillStyle = COL.hazard; ctx.fillRect(C.x, y + 2, 6, rh - 4);
      ctx.fillStyle = COL.ink; ctx.fillText(label, lx, cy + 1);
      selY = cy; selCol = ci;
    } else {
      ctx.fillStyle = ci === 0 ? '#efe4cc' : '#b9af9a'; ctx.fillText(label, lx, cy + 1);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.font = V(ci === 0 ? 20 : 17); ctx.fillStyle = on ? COL.ink : 'rgba(125,255,125,0.55)'; ctx.textAlign = 'left';
    ctx.fillText(String(i + 1).padStart(2, '0'), C.x + 12, cy + 1);
    if (items[i].id === 'daily' && menu.dailyBadge && Math.floor(time * 2) % 3 !== 0) {
      ctx.font = F(20); ctx.fillStyle = on ? COL.ink : '#ffd23f'; ctx.fillText(t('NEW!'), lx + lw + 12, cy - 6);
    }
    menu.itemRects.push({ x0: C.x / W, x1: (C.x + C.w) / W, y0: (y + 1) / H, y1: (y + rh - 1) / H });
    yc[ci] += rh;
  }
  void selY; void selCol;
  // hint of the selected entry
  const id = items[menu.sel]?.id;
  ctx.font = V(23); ctx.textAlign = 'left'; ctx.fillStyle = COL.term;
  if (id) ctx.fillText('> ' + t(HINTS[id] || ''), 38, 380);
  ticker(ad, ctx, W, H, time, reduce);
  ctx.font = V(17); ctx.textAlign = 'left'; ctx.fillStyle = '#7d786c';
  ctx.fillText(menu.app.ui?.padActive ? '[D-PAD] ' + t('SELECT') + '   [A] ' + t('CONFIRM') : '[W/S] ' + t('SELECT') + '   [ENTER] ' + t('CONFIRM'), 38, 446);
  ctx.textAlign = 'right'; ctx.fillText('TFG OS // CELL 07', W - 38, 446);
  wipe(ad, ctx, W, H, time);
}

export function disposeArtMenu(menu) { menu._ad?.dispose?.(); menu._ad = null; }
