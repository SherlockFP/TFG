/**
 * HACK — break three firewall layers: a cursor sweeps each bar, press at the right moment while it is inside the green window.
 * Windows shrink and the sweep speeds up per layer. Two misses and the lockbox raises the alarm.
 *
 * createHack(opts) -> { el, update, destroy }
 *   opts.tries: misses allowed + 1 (default 2), opts.difficulty 0..1
 *   result: { success, cancelled, tries (left), reason? ('misses') }
 * Registered into MINIGAMES at runtime by src/game/secureloot.js (MINIGAMES.hack).
 */
import { createMinigame, createParticles, sparkBurst, floatText, drawText, drawTextOutlined, clamp, clamp01, lerp, fxRand } from './common.js';
import { t as _t, tf } from '../core/i18n.js';

const W = 160, H = 110;
const LAYERS = 3;
const BAR = { x: 16, w: 128, h: 9 };
const ROW_Y = [30, 52, 74];

export function createHack(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'hack', title: 'HACK', tag: 'LOCKBOX', width: W, height: H,
    help: '[SPACE] / [CLICK] inject when the cursor is in the green   [ESC] quit',
  });
  const { ctx, opts } = mg;
  const rng = opts.rng || Math.random, sfx = opts.sfx || (() => {});
  const D = clamp(Number(opts.difficulty ?? 0.4), 0, 1);
  const parts = createParticles(160);
  let tries = clamp(Math.round(Number(opts.tries) || 2), 1, 5);
  let layer = 0, t = 0, phase = 'play', phaseT = 0;
  let pos = rng(), dir = 1;
  let speed = lerp(0.85, 1.35, D);
  let hw = lerp(0.14, 0.075, D);
  let zone = 0.3 + rng() * 0.4;
  const done = new Array(LAYERS).fill(false);
  const missFlash = [0, 0, 0];

  function newZone() { zone = 0.15 + rng() * 0.7; dir = rng() < 0.5 ? 1 : -1; }
  mg.setStatus(tf('LAYER {n}/{max}', { n: 1, max: LAYERS }));

  function attempt() {
    if (phase !== 'play') return;
    const px = BAR.x + pos * BAR.w, py = ROW_Y[layer] + BAR.h / 2;
    if (Math.abs(pos - zone) <= hw + 0.01) {
      done[layer] = true;
      sfx('lockpick_click');
      mg.flash('#39ff6a', 0.2); mg.shake(1.5);
      sparkBurst(parts, px, py, 10, ['#ffffff', '#b6ffc8', '#39ff6a'], 50);
      floatText(parts, 'BREACHED', px, py - 8, '#b6ffc8', { life: 0.7 });
      layer++;
      if (layer >= LAYERS) { phase = 'win'; phaseT = 0; sfx('lockpick_success'); mg.setStatus(_t('ACCESS GRANTED'), 'good'); mg.finishAfter({ success: true, cancelled: false, tries }, 1.4, 0.45); return; }
      speed *= lerp(1.16, 1.28, D); hw = Math.max(0.05, hw * 0.84); newZone();
      mg.setStatus(tf('LAYER {n}/{max}', { n: layer + 1, max: LAYERS }), 'good');
    } else {
      tries--;
      missFlash[layer] = 0.5;
      sfx('ui_error'); mg.shake(5); mg.flash('#ff2020', 0.3); mg.glitch(0.12);
      floatText(parts, Math.abs(pos - zone) < hw + 0.08 ? 'SO CLOSE!' : 'DENIED', px, py - 8, '#ff4040', { life: 0.7 });
      if (tries <= 0) { phase = 'fail'; phaseT = 0; mg.setStatus(_t('ALARM TRIGGERED'), 'bad'); mg.shake(8); mg.finishAfter({ success: false, cancelled: false, tries: 0, reason: 'misses' }, 1.6, 0.45); }
      else mg.setStatus(tf('DENIED - {n} TRY LEFT', { n: tries }), 'warn');
    }
  }
  mg.onKeyDown = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') { if (!e.repeat) attempt(); return true; } return false; };
  mg.onPointerDown = () => attempt();

  mg.onFrame = (dt) => {
    t += dt; phaseT += dt;
    if (phase === 'play') {
      pos += dir * speed * dt;
      if (pos > 1) { pos = 1; dir = -1; } else if (pos < 0) { pos = 0; dir = 1; }
    }
    for (let i = 0; i < LAYERS; i++) if (missFlash[i] > 0) missFlash[i] = Math.max(0, missFlash[i] - dt);
    parts.update(dt);
    render();
  };

  function render() {
    ctx.fillStyle = '#04100a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0b2418';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    // falling glyph rain (cosmetic)
    ctx.fillStyle = '#123a24';
    for (let i = 0; i < 18; i++) { const x = (i * 9 + 3) % W, y = ((t * (14 + (i % 5) * 6) + i * 23) % (H + 10)) - 5; ctx.fillRect(x, y, 2, 3); }
    drawText(ctx, 'TARGET: LOCKBOX', 6, 6, { color: '#39ff6a' });
    drawText(ctx, `TRIES ${tries}`, W - 6, 6, { align: 'right', color: tries > 1 ? '#8adf9a' : '#ff5040' });
    for (let i = 0; i < LAYERS; i++) {
      const y = ROW_Y[i], active = i === layer && phase === 'play';
      drawText(ctx, `FIREWALL ${i + 1}`, BAR.x, y - 8, { color: done[i] ? '#39ff6a' : active ? '#d8ffe0' : '#3a6a4a' });
      ctx.fillStyle = '#020806'; ctx.fillRect(BAR.x - 1, y - 1, BAR.w + 2, BAR.h + 2);
      ctx.fillStyle = missFlash[i] > 0 ? '#401010' : '#0d1f16'; ctx.fillRect(BAR.x, y, BAR.w, BAR.h);
      if (done[i]) { ctx.fillStyle = '#1f7a3a'; ctx.fillRect(BAR.x, y, BAR.w, BAR.h); drawText(ctx, 'BREACHED', BAR.x + BAR.w / 2, y + 1, { align: 'center', color: '#d8ffe0' }); continue; }
      if (i > layer) { drawText(ctx, 'LOCKED', BAR.x + BAR.w / 2, y + 1, { align: 'center', color: '#2a5a3a' }); continue; }
      const zx = BAR.x + (zone - hw) * BAR.w, zw = hw * 2 * BAR.w;
      ctx.fillStyle = Math.floor(t * 8) % 2 ? '#39ff6a' : '#22c24c'; ctx.fillRect(Math.round(zx), y, Math.max(3, Math.round(zw)), BAR.h);
      const cx = Math.round(BAR.x + pos * BAR.w);
      const inside = Math.abs(pos - zone) <= hw + 0.01;
      ctx.fillStyle = inside ? '#ffffff' : '#ffd060'; ctx.fillRect(cx - 1, y - 3, 3, BAR.h + 6);
    }
    if (phase === 'win') drawTextOutlined(ctx, 'ACCESS GRANTED', W / 2, 92, { scale: 1, align: 'center', color: '#39ff6a' });
    else if (phase === 'fail') { ctx.fillStyle = `rgba(255,0,0,${0.12 + Math.max(0, Math.sin(t * 9)) * 0.1})`; ctx.fillRect(0, 0, W, H); drawTextOutlined(ctx, 'ALARM TRIGGERED', W / 2, 92, { align: 'center', color: Math.floor(t * 6) % 2 ? '#ff4040' : '#ffb000' }); }
    else if (t < 2 && Math.floor(t * 3) % 2) drawTextOutlined(ctx, 'HIT THE GREEN!', W / 2, 96, { align: 'center', color: '#ffffff' });
    parts.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }
  void clamp01; void fxRand;
  return mg.api;
}
