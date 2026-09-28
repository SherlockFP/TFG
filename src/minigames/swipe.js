/**
 * SWIPE CARD — stop the sweeping marker inside the green window, three times in a row of luck.
 *
 * createSwipe(opts) -> { el, update, destroy }
 *   opts.difficulty 0..1 (window size + sweep speed)
 *   result: { success, cancelled, hits, triesLeft }
 * Registered as MINIGAMES.swipe by src/game/tasks.js (Among-Us-style crew tasks).
 */
import { createMinigame, drawText, bevel, pxRect, clamp, lerp, C, createParticles, sparkBurst } from './common.js';

const W = 160, H = 100;
const NEED = 3, TRIES = 5;
const BX = 14, BW = W - 28, BY = 50, BH = 14;

export function createSwipe(rawOpts) {
  const mg = createMinigame(rawOpts, {
    kind: 'swipe', title: 'SWIPE CARD', tag: 'ACCESS TERMINAL',
    help: '[SPACE] / [CLICK] swipe when the marker is in the green   [ESC] quit', width: W, height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng, sfx = opts.sfx, D = opts.difficulty;
  const parts = createParticles(120);
  let hits = 0, tries = TRIES, x = 0.05, dir = 1, speed = 1, zoneC = 0.5, zoneHW = 0.1, phase = 'play', phaseT = 0, t = 0, flash = 0, lastX = 0;

  function newZone() {
    zoneHW = lerp(0.15, 0.075, D) * (1 - hits * 0.14);
    zoneC = 0.18 + rng() * 0.64;
    speed = lerp(0.85, 1.5, D) * (1 + hits * 0.22);
  }
  newZone();
  mg.setStatus(`SWIPES 0/${NEED}`, '');

  function press() {
    if (phase !== 'play') return;
    lastX = x;
    if (Math.abs(x - zoneC) <= zoneHW) {
      hits++; flash = 1; sfx('safe_click');
      sparkBurst(parts, BX + BW * x, BY + BH / 2, 12, ['#7dff9a', '#ffffff', '#c9ffd8'], 60);
      if (hits >= NEED) {
        phase = 'win'; phaseT = 0; sfx('lockpick_success'); mg.setStatus('ACCESS GRANTED', 'good');
        mg.finishAfter({ success: true, cancelled: false, hits, triesLeft: tries }, 1.1, 0.35);
      } else {
        phase = 'ok'; phaseT = 0; mg.setStatus(`SWIPES ${hits}/${NEED}`, 'good');
      }
    } else {
      tries--; flash = -1; sfx('lockpick_click'); mg.shake(4); mg.glitch(0.18);
      if (tries <= 0) {
        phase = 'fail'; phaseT = 0; mg.setStatus('CARD REJECTED', 'bad');
        mg.finishAfter({ success: false, cancelled: false, hits, triesLeft: 0 }, 1.2, 0.35);
      } else { phase = 'bad'; phaseT = 0; mg.setStatus(`TRIES ${tries}`, 'bad'); }
    }
  }
  mg.onKeyDown = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') { if (!e.repeat) press(); return true; }
    return false;
  };
  mg.onPointerDown = () => press();

  mg.onFrame = (dt) => {
    t += dt; phaseT += dt;
    flash *= Math.max(0, 1 - dt * 4);
    if (phase === 'play') {
      x += dir * speed * dt;
      if (x > 1) { x = 1; dir = -1; } else if (x < 0) { x = 0; dir = 1; }
    } else if ((phase === 'ok' || phase === 'bad') && phaseT > 0.5) { phase = 'play'; if (lastX >= 0) newZone(); }
    parts.update(dt);
    // ---- draw
    pxRect(ctx, 0, 0, W, H, '#0a1014');
    for (let i = 0; i < H; i += 4) pxRect(ctx, 0, i, W, 1, 'rgba(255,255,255,0.03)');
    bevel(ctx, 8, 14, W - 16, 78, '#161f25', '#2b3a44', '#05080a');
    // reader slot
    bevel(ctx, 20, 22, W - 40, 16, '#0c1216', '#1b262d', '#020304', true);
    pxRect(ctx, 24, 28, W - 48, 3, flash > 0.15 ? '#7dff9a' : flash < -0.15 ? '#ff5a4a' : '#26343c');
    // the card sliding in the slot follows the marker
    const cx = BX + BW * x;
    pxRect(ctx, Math.round(cx) - 10, 18, 20, 12, '#c9d2d8'); pxRect(ctx, Math.round(cx) - 10, 22, 20, 3, '#ffb000'); pxRect(ctx, Math.round(cx) - 8, 26, 6, 3, '#6a7a84');
    // bar + green window
    bevel(ctx, BX - 2, BY - 2, BW + 4, BH + 4, '#0c1216', '#1b262d', '#020304', true);
    pxRect(ctx, BX, BY, BW, BH, '#101a20');
    const z0 = Math.round(BX + BW * (zoneC - zoneHW)), z1 = Math.round(BX + BW * (zoneC + zoneHW));
    pxRect(ctx, z0, BY, Math.max(2, z1 - z0), BH, '#1f7a3a'); pxRect(ctx, z0, BY, Math.max(2, z1 - z0), 2, '#7dff9a');
    pxRect(ctx, Math.round(cx) - 1, BY - 4, 3, BH + 8, phase === 'bad' || phase === 'fail' ? '#ff5a4a' : '#ffffff');
    // pips
    for (let i = 0; i < NEED; i++) pxRect(ctx, 50 + i * 20, 74, 14, 8, i < hits ? '#7dff9a' : '#26343c');
    drawText(ctx, `TRIES ${tries}`, W - 12, 76, { align: 'right', color: C.dim || '#5a666c' });
    drawText(ctx, phase === 'win' ? 'ACCESS GRANTED' : phase === 'fail' ? 'CARD REJECTED' : 'SWIPE TO AUTHENTICATE', W / 2, 88, { align: 'center', color: phase === 'fail' ? '#ff5a4a' : '#7dff9a' });
    parts.draw(ctx);
  };
  void clamp;
  return mg.api;
}
