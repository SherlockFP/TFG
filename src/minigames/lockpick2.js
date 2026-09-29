/**
 * LOCKPICK 2 (wave 5, MASTERPLAN 25.3) - one timing click per pin: a marker sweeps a bar, click while it is inside the green window.
 * All rules live in src/game/lockpick2_core.js (LockState); this file is only the view + input.
 *
 * createLockpick2(opts) -> { el, update, destroy }
 *   opts.tier ('simple'..'algorithm'), opts.level (skill), opts.tool (item id), opts.helpers () => n (live co-op count),
 *   opts.onNoise(loud) (called per seated pin / start burst), opts.onEvent(name) (co-op / HUD hooks)
 *   result: { success, cancelled, broken, timedOut, tier, tool, wrong }
 */
import { createMinigame, drawText, drawTextOutlined, createParticles, sparkBurst, floatText, clamp, clamp01, fxRand, easeOutBack } from './common.js';
import { t, tf } from '../core/i18n.js';
import * as L from '../game/lockpick2_core.js';

const W = 160, H = 120;
const BX = 14, BW = 132, BY = 62, BH = 12;      // the bar
const TIER_COL = { simple: '#7dd87d', standard: '#63c7d8', security: '#e8c34a', vault: '#ff9a3c', algorithm: '#ff4fd8' };

export function createLockpick2(rawOpts = {}) {
  const tier = L.isTier(rawOpts.tier) ? rawOpts.tier : L.tierOfDifficulty(rawOpts.difficulty);
  const tool = L.TOOLS[rawOpts.tool] ? rawOpts.tool : L.PICK.BASIC;
  const T = L.TIERS[tier], tl = L.toolOf(tool);
  const mg = createMinigame(rawOpts, {
    kind: 'lockpick', title: t('LOCKPICK'), tag: t('B&E TOOLKIT'),
    help: tl.auto ? t('Hold still: the drill does the work   [ESC] quit') : t('[SPACE] / [CLICK] when the marker is in the green   [ESC] quit'),
    width: W, height: H,
  });
  const { ctx, opts } = mg;
  const level = clamp(Math.round(Number(opts.level) || 1), 1, L.MAX_LEVEL);
  const helpersFn = typeof opts.helpers === 'function' ? opts.helpers : () => 0;
  const S = new L.LockState({ tier, level, tool, helpers: helpersFn(), rng: opts.rng || Math.random });
  const parts = createParticles(200);
  const col = TIER_COL[tier];
  const noise = (v) => { if (v > 0) { try { opts.onNoise?.(v); } catch (e) { /* glue optional */ } } };
  let phase = 'play', phaseT = 0, time = 0, missFlash = 0, glitchJit = 0, lastHelpers = S.helpers, auto = null, autoIdx = 0, shuffleFlash = 0;
  const pinH = new Array(S.pins).fill(0);
  const syncPins = () => { for (let i = 0; i < S.pins; i++) if (S.seated[i] && !pinH[i]) pinH[i] = 0.01; else if (!S.seated[i]) pinH[i] = 0; };
  syncPins();
  for (let i = 0; i < S.pins; i++) if (S.held[i]) pinH[i] = 1;

  const status = () => mg.setStatus(tf('{tier} LOCK - PIN {n}/{m}', { tier: t(T.name).toUpperCase(), n: Math.min(S.pins, S.seated.filter(Boolean).length + 1), m: S.pins }));
  status();
  if (tl.auto) { auto = L.autoRun(S); noise(L.burstNoise(tool)); }
  else if (tl.burst) noise(L.burstNoise(tool));

  function win() {
    phase = 'win'; phaseT = 0;
    mg.sfx('lockpick_success'); mg.setStatus(t('UNLOCKED'), 'good');
    mg.finishAfter({ success: true, cancelled: false, broken: false, tier, tool, wrong: S.wrong }, 1.0, 0.35);
  }
  function lose(why) {
    phase = 'fail'; phaseT = 0;
    mg.sfx('ui_error'); mg.shake(8); mg.flash('#ff2020', 0.4);
    mg.setStatus(why === 'break' ? t('PICK SNAPPED') : t('TIME UP'), 'bad');
    mg.finishAfter({ success: false, cancelled: false, broken: why === 'break', timedOut: why === 'timeout', tier, tool, wrong: S.wrong }, 1.2, 0.4);
  }
  const barX = (u) => BX + u * BW;

  function attempt() {
    if (phase !== 'play' || auto) return;
    const r = S.click();
    if (r.locked) return;
    const x = barX(S.pos);
    if (r.hit) {
      pinH[r.seated] = 0.01;
      mg.sfx('lockpick_click'); mg.flash('#39ff6a', 0.16); mg.shake(1.5);
      sparkBurst(parts, x, BY + BH / 2, 10, ['#ffffff', '#b6ffc8', '#39ff6a'], 55);
      noise(L.pinNoise(tool, level));
      if (r.opened) win(); else status();
    } else {
      missFlash = 0.25; mg.sfx('ui_error'); mg.shake(4); mg.flash('#ff2020', 0.22); if (tier === 'algorithm') mg.glitch(0.12);
      floatText(parts, r.broken ? t('SNAP!') : r.dropped >= 0 ? t('PIN DROPPED') : t('MISS'), x, BY - 8, '#ff5050', { life: 0.7 });
      if (r.dropped >= 0) pinH[r.dropped] = 0;
      noise(L.pinNoise(tool, level) * 0.5);
      if (r.broken) lose('break'); else status();
    }
  }
  mg.onKeyDown = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') { if (!e.repeat) attempt(); return true; }
    return false;
  };
  mg.onPointerDown = () => attempt();

  mg.onFrame = (dt) => {
    time += dt; phaseT += dt; missFlash = Math.max(0, missFlash - dt); shuffleFlash = Math.max(0, shuffleFlash - dt);
    if (phase === 'play') {
      if (auto) {
        S.t += dt;
        while (autoIdx < auto.events.length && S.t >= auto.events[autoIdx].at) {
          const e = auto.events[autoIdx++]; S.seated[e.pin] = true; pinH[e.pin] = 0.01;
          mg.sfx('lockpick_click'); mg.shake(3); noise(L.burstNoise(tool) * 0.55 * (tl.pulse ? 1 : 0)); status();
          sparkBurst(parts, BX + BW * (e.pin + 0.5) / S.pins, 22, 8, ['#fff', '#ffd23f', '#ff8a3d'], 60);
        }
        if (autoIdx >= auto.events.length && S.t >= auto.total) { S.finish(true); win(); }
      } else {
        const h = helpersFn();
        if (h !== lastHelpers) { S.setHelpers(h); if (h > lastHelpers) { floatText(parts, t('HELPER HOLDS A PIN'), W / 2, 40, '#9dffb8', { life: 1.1 }); mg.sfx('ui_click'); } lastHelpers = h; syncPins(); for (let i = 0; i < S.pins; i++) if (S.held[i]) pinH[i] = Math.max(pinH[i], 1); if (S.done) win(); else status(); }
        const r = S.tick(dt);
        if (r.shuffled) { shuffleFlash = 0.4; mg.glitch(0.15); mg.sfx('ui_click'); }
        if (r.timeout) lose('timeout');
      }
      if (tier === 'algorithm') glitchJit = Math.random() < 0.08 ? Math.round(fxRand(-2, 2)) : glitchJit * 0.8;
    }
    for (let i = 0; i < S.pins; i++) if (pinH[i] > 0) pinH[i] = Math.min(1, pinH[i] + dt * 6);
    parts.update(dt);
    render();
  };

  function drawPins() {
    const n = S.pins, gap = Math.min(26, (W - 30) / n), x0 = W / 2 - (gap * (n - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + i * gap) + (tier === 'algorithm' && Math.random() < 0.02 ? 1 : 0);
      const set = S.seated[i], held = S.held[i], isActive = i === S.active && !set && phase === 'play';
      ctx.fillStyle = '#050505'; ctx.fillRect(x - 5, 8, 11, 30);
      ctx.fillStyle = '#15191c'; ctx.fillRect(x - 4, 9, 9, 28);
      const lift = set ? Math.round(easeOutBack(pinH[i]) * 9) : 0;
      const py = 22 - lift;
      ctx.fillStyle = '#6d7a80'; for (let y = 10; y < py; y += 2) ctx.fillRect(x - 1 + ((y >> 1) % 2 ? 1 : -1), y, 2, 1);
      ctx.fillStyle = set ? (held ? '#63c7d8' : '#39ff6a') : isActive ? '#fff0a8' : '#d8a840';
      ctx.fillRect(x - 3, py, 7, 10);
      ctx.fillStyle = set ? '#10602a' : '#6e4a12'; ctx.fillRect(x - 3, py + 9, 7, 1);
      if (isActive && tier === 'algorithm') drawText(ctx, String(S.order.indexOf(i) + 1), x, 40, { align: 'center', color: '#ff4fd8' });
      else if (isActive && S.pins > 1) ctx.fillRect(x - 1, 40, 3, 2);
      if (held) drawText(ctx, 'H', x, 40, { align: 'center', color: '#63c7d8' });
    }
    ctx.fillStyle = '#39ff6a'; ctx.globalAlpha = 0.45; ctx.fillRect(Math.round(x0 - 12), 22, Math.round(gap * (n - 1) + 24), 1); ctx.globalAlpha = 1;
  }
  function drawBar() {
    const jit = glitchJit | 0;
    ctx.fillStyle = '#050505'; ctx.fillRect(BX - 2 + jit, BY - 2, BW + 4, BH + 4);
    ctx.fillStyle = '#1e2327'; ctx.fillRect(BX + jit, BY, BW, BH);
    for (let i = 0; i <= 10; i++) { ctx.fillStyle = '#2f373d'; ctx.fillRect(BX + Math.round((BW * i) / 10) + jit, BY + BH - 3, 1, 3); }
    if (S.active >= 0 || S.oneClick) {
      const half = (S.width * BW) / 2, cx = barX(S.center) + jit;
      const pulse = Math.sin(time * 10) > 0;
      ctx.fillStyle = S.oneClick ? '#9dffb8' : pulse ? '#39ff6a' : '#22c24c';
      if (S.oneClick) ctx.fillRect(BX, BY, BW, BH); else ctx.fillRect(Math.round(cx - half), BY, Math.max(2, Math.round(half * 2)), BH);
      ctx.fillStyle = '#b6ffc8'; if (!S.oneClick) { ctx.fillRect(Math.round(cx - half), BY, 1, BH); ctx.fillRect(Math.round(cx + half) - 1, BY, 1, BH); }
      if (tier === 'algorithm') { ctx.fillStyle = 'rgba(255,79,216,0.25)'; ctx.fillRect(Math.round(cx - half) - 2, BY - 1, Math.round(half * 2) + 4, BH + 2); }
    }
    if (!auto && phase === 'play') {
      const mx = Math.round(barX(S.pos)) + jit, inside = S.inWindow();
      ctx.fillStyle = inside ? '#ffffff' : '#c8d2d6'; ctx.fillRect(mx - 1, BY - 5, 3, BH + 10);
      ctx.fillStyle = inside ? '#39ff6a' : '#ffb000'; ctx.fillRect(mx - 3, BY - 7, 7, 3);
      if (inside) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 4, BY - 5, 9, BH + 10); ctx.globalAlpha = 1; }
    }
    if (auto) {
      const u = clamp01(S.t / auto.total);
      ctx.fillStyle = '#ff8a3d'; ctx.fillRect(BX, BY, Math.round(BW * u), BH);
      drawText(ctx, t('DRILLING'), W / 2, BY + 3, { align: 'center', color: '#fff' });
    }
  }
  function drawHud() {
    if (S.timer > 0 && phase === 'play') {
      const u = clamp01(S.timeLeft / S.timer);
      ctx.fillStyle = '#050505'; ctx.fillRect(BX - 1, 92, BW + 2, 8);
      ctx.fillStyle = u < 0.3 ? (Math.floor(time * 6) % 2 ? '#ff4040' : '#ffb000') : '#ff9a3c'; ctx.fillRect(BX, 93, Math.round(BW * u), 6);
      drawText(ctx, `${S.timeLeft.toFixed(1)}s`, W / 2, 102, { align: 'center', color: '#c8d2d6' });
    } else if (tl.skipTimer && T.timer > 0) drawText(ctx, t('TIMER BYPASSED'), BX, 94, { color: '#63c7d8' });
    // picks left (wrong-click allowance)
    drawText(ctx, t('PICK'), BX, 106, { color: '#8a969c' });
    for (let i = 0; i < S.maxWrong && i < 9; i++) {
      const ok = i >= S.wrong;
      ctx.fillStyle = ok ? '#c8d2d6' : '#5a2020'; ctx.fillRect(BX + 22 + i * 6, ok ? 106 : 107, 4, ok ? 5 : 3);
    }
    drawText(ctx, `${t(T.name).toUpperCase()}${S.helpers ? ' +' + S.helpers : ''}`, W - BX, 106, { align: 'right', color: col });
    drawText(ctx, `${t('SKILL')} ${level}`, W - BX, 112, { align: 'right', color: '#5a666c' });
    if (level >= L.PERK_LEVEL.silent && tl.quietable) drawText(ctx, t('SILENT'), BX, 112, { color: '#63c7d8' });
  }
  function render() {
    ctx.fillStyle = '#0d1114'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 6) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(0, y, W, 1); }
    ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, W, 2); ctx.globalAlpha = 1;
    drawPins(); drawBar(); drawHud();
    if (missFlash > 0) { ctx.fillStyle = `rgba(255,0,0,${missFlash * 0.5})`; ctx.fillRect(BX, BY - 8, BW, BH + 16); }
    if (shuffleFlash > 0) drawTextOutlined(ctx, t('PIN ORDER SHUFFLED'), W / 2, 50, { align: 'center', color: '#ff4fd8' });
    if (tier === 'algorithm') for (let i = 0; i < 3; i++) if (Math.random() < 0.3) { ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,79,216,0.35)' : 'rgba(99,199,216,0.3)'; ctx.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 1 + Math.floor(Math.random() * 10), 1); }
    parts.draw(ctx);
    if (phase === 'win') drawTextOutlined(ctx, t('UNLOCKED'), W / 2, 24 - (phaseT < 0.2 ? 2 : 0), { scale: phaseT < 0.2 ? 3 : 2, align: 'center', color: '#39ff6a' });
    else if (phase === 'fail') { ctx.fillStyle = `rgba(255,0,0,${0.12 + Math.max(0, Math.sin(time * 9)) * 0.1})`; ctx.fillRect(0, 0, W, H); drawTextOutlined(ctx, S.broken ? t('PICK SNAPPED') : t('TIME UP'), W / 2, 30, { scale: 2, align: 'center', color: '#ff4040' }); }
    if (phase === 'play' && time < 1.6 && Math.floor(time * 3) % 2 && !auto) drawTextOutlined(ctx, t('CLICK IN THE GREEN!'), W / 2, 46, { align: 'center', color: '#ffffff' });
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }
  return mg.api;
}
