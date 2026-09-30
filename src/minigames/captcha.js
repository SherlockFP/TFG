/**
 * CAPTCHA - "PROVE YOU ARE HUMAN": pick the 3 tiles of the asked kind out of 9 pixel tiles before the timer (5 s) runs out.
 *
 * createCaptcha(opts) -> { el, update, destroy }
 *   opts.seed   int: the round (creatures11_core.captchaRound(seed), same on the host that validates the picks)
 *   opts.limit  seconds (default 5)
 *   result: { success, cancelled, timeout, picks: [tile indices] }
 * Keys [1]-[9] (numpad layout: 7 8 9 on top) or a click toggle a tile; the third pick verifies at once, [ENTER] verifies early, [ESC] refuses.
 * Registered as MINIGAMES.captcha by src/game/creatures11.js (same way tasks.js registers swipe).
 */
import { createMinigame, drawText, bevel, pxRect, pxCircle, C, digitFromEvent, isConfirmKey, tmg } from './common.js';
import { fillGaps } from '../i18n/fill.js';
import { captchaRound, TUNE } from '../game/creatures11_core.js';

fillGaps([
  ['CAPTCHA', 'CAPTCHA', 'КАПЧА'], ['IDENTITY CHECK', 'KIMLIK KONTROLU', 'ПРОВЕРКА ЛИЧНОСТИ'],
  ['[1-9] / [CLICK] pick 3   [ENTER] verify   [ESC] refuse', '[1-9] / [TIK] 3 tane sec   [ENTER] onayla   [ESC] reddet', '[1-9] / [КЛИК] выбери 3   [ENTER] проверить   [ESC] отказаться'],
  ['PROVE YOU ARE HUMAN', 'INSAN OLDUGUNU KANITLA', 'ДОКАЖИ, ЧТО ТЫ ЧЕЛОВЕК'], ['SELECT ALL SCRAP', 'TUM HURDALARI SEC', 'ВЫБЕРИ ВЕСЬ ХЛАМ'],
  ['SELECT ALL TRAFFIC LIGHTS', 'TUM TRAFIK ISIKLARINI SEC', 'ВЫБЕРИ ВСЕ СВЕТОФОРЫ'], ['VERIFIED', 'DOGRULANDI', 'ПРОВЕРЕНО'], ['ROBOT', 'ROBOT', 'РОБОТ'],
  ['TIME', 'SURE', 'ВРЕМЯ'], ['HUMAN ENOUGH', 'YETERINCE INSAN', 'ДОСТАТОЧНО ЧЕЛОВЕК'], ['NOT HUMAN', 'INSAN DEGIL', 'НЕ ЧЕЛОВЕК'],
]);

const W = 160, H = 112;
const TW = 44, TH = 22, GAP = 4, X0 = 10, Y0 = 20;
const tx = (i) => X0 + (i % 3) * (TW + GAP), ty = (i) => Y0 + Math.floor(i / 3) * (TH + GAP);

// 16x16 pixel icons, drawn around (cx, cy)
const ICON = {
  cog(g, cx, cy) { pxCircle(g, cx, cy, 6, '#8d959c'); for (let a = 0; a < 8; a++) { const x = cx + Math.round(Math.cos(a * Math.PI / 4) * 7), y = cy + Math.round(Math.sin(a * Math.PI / 4) * 7); pxRect(g, x - 1, y - 1, 3, 3, '#b3bbc2'); } pxCircle(g, cx, cy, 2, '#1a1f24'); },
  can(g, cx, cy) { pxRect(g, cx - 4, cy - 6, 8, 12, '#a9adb0'); pxRect(g, cx - 4, cy - 6, 8, 2, '#dfe3e6'); pxRect(g, cx - 4, cy - 1, 8, 4, '#c23b2e'); pxRect(g, cx - 4, cy + 5, 8, 1, '#6c7176'); },
  pipe(g, cx, cy) { pxRect(g, cx - 7, cy + 1, 12, 4, '#7d6a58'); pxRect(g, cx + 2, cy - 6, 4, 11, '#7d6a58'); pxRect(g, cx - 8, cy, 2, 6, '#a48d76'); pxRect(g, cx + 1, cy - 7, 6, 2, '#a48d76'); },
  bolt(g, cx, cy) { pxRect(g, cx - 5, cy - 6, 10, 5, '#9aa0a6'); pxRect(g, cx - 5, cy - 6, 10, 1, '#d2d7db'); pxRect(g, cx - 2, cy - 1, 4, 8, '#767c82'); for (let k = 0; k < 3; k++) pxRect(g, cx - 2, cy + k * 2, 4, 1, '#4d5257'); },
  lightR: (g, cx, cy) => tlight(g, cx, cy, 0), lightY: (g, cx, cy) => tlight(g, cx, cy, 1), lightG: (g, cx, cy) => tlight(g, cx, cy, 2),
  smile(g, cx, cy) { pxCircle(g, cx, cy, 6, '#f2cf3b'); pxRect(g, cx - 3, cy - 2, 2, 2, '#2a2208'); pxRect(g, cx + 2, cy - 2, 2, 2, '#2a2208'); pxRect(g, cx - 3, cy + 2, 7, 1, '#2a2208'); pxRect(g, cx - 4, cy + 1, 1, 1, '#2a2208'); pxRect(g, cx + 4, cy + 1, 1, 1, '#2a2208'); },
  heart(g, cx, cy) { const c = '#e0446a'; pxRect(g, cx - 6, cy - 4, 5, 4, c); pxRect(g, cx + 1, cy - 4, 5, 4, c); pxRect(g, cx - 6, cy - 1, 12, 3, c); pxRect(g, cx - 4, cy + 2, 8, 2, c); pxRect(g, cx - 2, cy + 4, 4, 2, c); },
  cloud(g, cx, cy) { const c = '#d8e4f0'; pxCircle(g, cx - 3, cy, 3, c); pxCircle(g, cx + 2, cy - 2, 4, c); pxCircle(g, cx + 5, cy + 1, 3, c); pxRect(g, cx - 5, cy + 1, 11, 3, c); },
  bug(g, cx, cy) { pxCircle(g, cx, cy + 1, 4, '#4fb04a'); pxRect(g, cx - 2, cy - 5, 4, 2, '#2f7a2c'); for (const s of [-1, 1]) for (const k of [-3, 0, 3]) pxRect(g, cx + s * 6 - (s < 0 ? 1 : 0), cy + 1 + k, 2, 1, '#2f7a2c'); pxRect(g, cx - 1, cy, 2, 2, '#c8ffc0'); },
  star(g, cx, cy) { const c = '#f7d23c'; pxRect(g, cx - 1, cy - 7, 3, 14, c); pxRect(g, cx - 7, cy - 1, 15, 3, c); pxRect(g, cx - 4, cy - 4, 9, 9, c); pxRect(g, cx - 1, cy - 1, 3, 3, '#fff2a0'); },
  coin(g, cx, cy) { pxCircle(g, cx, cy, 6, '#d9a520'); pxCircle(g, cx, cy, 4, '#f2c744'); pxRect(g, cx - 1, cy - 3, 2, 7, '#8a6410'); pxRect(g, cx - 2, cy - 2, 4, 1, '#8a6410'); pxRect(g, cx - 2, cy + 1, 4, 1, '#8a6410'); },
  bus(g, cx, cy) { pxRect(g, cx - 8, cy - 5, 16, 9, '#e8b820'); for (let k = 0; k < 4; k++) pxRect(g, cx - 6 + k * 4, cy - 3, 3, 3, '#37506a'); pxRect(g, cx - 8, cy + 1, 16, 1, '#8c6a10'); pxCircle(g, cx - 4, cy + 5, 2, '#1a1a1a'); pxCircle(g, cx + 4, cy + 5, 2, '#1a1a1a'); },
  key(g, cx, cy) { pxCircle(g, cx - 4, cy, 4, '#d9a520'); pxCircle(g, cx - 4, cy, 1, '#101418'); pxRect(g, cx, cy - 1, 8, 2, '#d9a520'); pxRect(g, cx + 5, cy + 1, 2, 3, '#d9a520'); pxRect(g, cx + 2, cy + 1, 1, 2, '#d9a520'); },
};
function tlight(g, cx, cy, lit) {
  pxRect(g, cx - 4, cy - 8, 8, 16, '#20262c'); pxRect(g, cx - 4, cy - 8, 8, 1, '#3d464f');
  const cols = ['#ff4a3a', '#ffcf3a', '#5dff7a'];
  for (let k = 0; k < 3; k++) pxCircle(g, cx, cy - 5 + k * 5, 2, k === lit ? cols[k] : '#2e353c');
}
export const CAPTCHA_ICONS = Object.keys(ICON);

export function createCaptcha(rawOpts) {
  const mg = createMinigame(rawOpts, {
    kind: 'captcha', title: 'CAPTCHA', tag: 'IDENTITY CHECK',
    help: '[1-9] / [CLICK] pick 3   [ENTER] verify   [ESC] refuse', width: W, height: H,
  });
  const { ctx, opts } = mg;
  const limit = +opts.limit > 0 ? +opts.limit : TUNE.cap.limit;
  const round = captchaRound((opts.seed | 0) || 1);
  const sel = new Set();
  let t = 0, phase = 'play', flash = 0;
  mg.setStatus(tmg('TIME') + ' ' + limit.toFixed(1), '');

  function verify() {
    if (phase !== 'play') return;
    const picks = [...sel].sort((a, b) => a - b);
    const ok = picks.length === 3 && picks.every((i) => round.tiles[i].ok);
    phase = ok ? 'win' : 'fail'; flash = 1;
    opts.sfx(ok ? 'lockpick_success' : 'lockpick_click');
    if (!ok) { mg.shake(5); mg.glitch(0.25); }
    mg.setStatus(tmg(ok ? 'HUMAN ENOUGH' : 'NOT HUMAN'), ok ? 'good' : 'bad');
    mg.finishAfter({ success: ok, cancelled: false, timeout: false, picks }, 0.5, 0.2);
  }
  function toggle(i) {
    if (phase !== 'play' || i < 0 || i > 8) return;
    if (sel.has(i)) sel.delete(i); else sel.add(i);
    opts.sfx('safe_click');
    if (sel.size >= 3) verify();
  }
  const NUMPAD = [6, 7, 8, 3, 4, 5, 0, 1, 2];   // digit 1..9 -> tile (7 8 9 on the top row like a numpad)
  mg.onKeyDown = (e) => {
    const dg = digitFromEvent(e);
    if (dg && dg !== '0') { if (!e.repeat) toggle(NUMPAD[+dg - 1]); return true; }
    if (isConfirmKey(e)) { if (!e.repeat) verify(); return true; }
    return false;
  };
  mg.onPointerDown = (x, y) => {
    for (let i = 0; i < 9; i++) if (x >= tx(i) && x < tx(i) + TW && y >= ty(i) && y < ty(i) + TH) { toggle(i); return; }
  };

  mg.onFrame = (dt) => {
    if (phase === 'play') {
      t += dt;
      const left = Math.max(0, limit - t);
      mg.setStatus(tmg('TIME') + ' ' + left.toFixed(1), left < 1.5 ? 'bad' : '');
      if (left <= 0) {
        phase = 'fail'; flash = 1; mg.shake(4); opts.sfx('lockpick_click'); mg.setStatus(tmg('NOT HUMAN'), 'bad');
        mg.finishAfter({ success: false, cancelled: false, timeout: true, picks: [...sel] }, 0.5, 0.2);
      }
    }
    flash *= Math.max(0, 1 - dt * 5);
    const frac = Math.max(0, 1 - t / limit);
    // ---- draw
    pxRect(ctx, 0, 0, W, H, '#0a0e14');
    for (let i = 0; i < H; i += 4) pxRect(ctx, 0, i, W, 1, 'rgba(255,255,255,0.03)');
    bevel(ctx, 2, 2, W - 4, H - 4, '#141b22', '#2b3a44', '#05080a');
    pxRect(ctx, 6, 5, W - 12, 11, '#1a5fd0');
    drawText(ctx, tmg(round.cat === 'scrap' ? 'SELECT ALL SCRAP' : 'SELECT ALL TRAFFIC LIGHTS'), W / 2, 8, { align: 'center', color: '#ffffff' });
    for (let i = 0; i < 9; i++) {
      const on = sel.has(i), x = tx(i), y = ty(i);
      const wrong = phase === 'fail' && on && !round.tiles[i].ok, right = phase === 'win' && on;
      bevel(ctx, x, y, TW, TH, on ? '#20406e' : '#1c252e', on ? '#5f9bff' : '#33434f', '#05080a', on);
      ICON[round.tiles[i].icon]?.(ctx, x + TW / 2, y + TH / 2);
      drawText(ctx, String([7, 8, 9, 4, 5, 6, 1, 2, 3][i]), x + 3, y + 2, { color: '#6f8394' });
      if (on) { pxRect(ctx, x + TW - 8, y + 2, 6, 6, wrong ? '#ff4a3a' : right ? '#5dff7a' : '#5f9bff'); pxRect(ctx, x + TW - 7, y + 3, 4, 4, '#0a0e14'); pxRect(ctx, x + TW - 6, y + 4, 2, 2, wrong ? '#ff4a3a' : right ? '#5dff7a' : '#5f9bff'); }
    }
    // the 5 s timer: a bar that drains, red below 30 %
    pxRect(ctx, X0, 100, 3 * TW + 2 * GAP, 5, '#05080a');
    pxRect(ctx, X0, 100, Math.round((3 * TW + 2 * GAP) * frac), 5, frac < 0.3 ? C.red : '#5f9bff');
    if (flash > 0.05) pxRect(ctx, 0, 0, W, H, phase === 'win' ? `rgba(93,255,122,${flash * 0.25})` : `rgba(255,74,58,${flash * 0.3})`);
    if (phase === 'win') drawText(ctx, tmg('VERIFIED'), W / 2, 92, { align: 'center', color: '#5dff7a' });
  };
  return mg.api;
}
