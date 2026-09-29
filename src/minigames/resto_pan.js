/**
 * RESTO STATION - a 3-6 s timing minigame for the restaurant stove: the heat needle climbs, stop it in the green (COOKED) or the gold (PERFECT) band, past the red it burns.
 *
 * createRestoPan(opts) -> { el, update, destroy }   opts: { dur (s to full heat, 3..6), label, difficulty 0..1 }
 * result: { success, cancelled, p (stop position 0..1.3), q (0 burnt .. 3 perfect, same zones as the survival cooking meter) }
 * Registered as MINIGAMES.rs_pan by src/game/resto.js. The host re-checks the claimed quality against its own clock (resto_core.clampQuality).
 */
import { createMinigame, drawText, bevel, pxRect, clamp, C, createParticles, sparkBurst } from './common.js';

const W = 160, H = 100;
const BX = 14, BW = W - 28, BY = 52, BH = 14;
const Z = { cooked: 0.5, perfect: 0.72, burnt: 0.86 };   // keep in sync with resto_core.gradeCook / survival COOK_ZONES
const grade = (p) => (p < Z.cooked ? 1 : p < Z.perfect ? 2 : p < Z.burnt ? 3 : 0);

export function createRestoPan(rawOpts) {
  const mg = createMinigame(rawOpts, {
    kind: 'rs_pan', title: String(rawOpts?.label || 'COOK'), tag: 'RESTAURANT',
    help: '[SPACE] / [CLICK] take it off the heat in the gold   [ESC] cancel', width: W, height: H,
  });
  const { ctx, opts } = mg;
  const sfx = opts.sfx, dur = clamp(Number(rawOpts?.dur) || 4.5, 2.5, 7);
  const parts = createParticles(90);
  let p = 0, phase = 'play', t = 0, phaseT = 0, q = 1;
  mg.setStatus('HEAT', '');

  function stop() {
    if (phase !== 'play') return;
    q = grade(p); phase = 'done'; phaseT = 0;
    const good = q >= 2;
    sfx(good ? 'lockpick_success' : 'lockpick_click');
    sparkBurst(parts, BX + BW * Math.min(1, p), BY + BH / 2, q === 3 ? 22 : 10, q === 0 ? ['#ff6a3a', '#5a2a1a', '#222'] : q === 3 ? ['#ffe066', '#fff', '#ffb000'] : ['#7dff9a', '#fff'], 70);
    mg.setStatus(['BURNT', 'UNDERDONE', 'COOKED', 'PERFECT'][q], q >= 2 ? 'good' : 'bad');
    if (q === 0) mg.shake(5);
    mg.finishAfter({ success: q >= 2, cancelled: false, p: +p.toFixed(3), q }, 0.9, 0.3);
  }
  mg.onKeyDown = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') { if (!e.repeat) stop(); return true; } return false; };
  mg.onPointerDown = () => stop();

  mg.onFrame = (dt) => {
    t += dt; phaseT += dt;
    if (phase === 'play') {
      p += dt / dur;
      if (p >= 1.2) { p = 1.2; stop(); }
    }
    parts.update(dt);
    pxRect(ctx, 0, 0, W, H, '#100c0a');
    for (let i = 0; i < H; i += 4) pxRect(ctx, 0, i, W, 1, 'rgba(255,255,255,0.03)');
    bevel(ctx, 8, 12, W - 16, 80, '#1c1512', '#3a2c24', '#060403');
    // pan + flame flicker
    const fl = 3 + Math.round(Math.sin(t * 14) * 2) + Math.round(p * 6);
    pxRect(ctx, 66, 40 - fl, 28, fl, p > Z.burnt ? '#ff3a2a' : '#ffa030'); pxRect(ctx, 72, 40 - Math.round(fl * 0.6), 16, Math.round(fl * 0.6), '#ffe066');
    pxRect(ctx, 56, 40, 48, 5, '#4a4f58'); pxRect(ctx, 104, 41, 20, 3, '#30343a'); pxRect(ctx, 58, 40, 44, 1, '#8a90a0');
    // meter
    bevel(ctx, BX - 2, BY - 2, BW + 4, BH + 4, '#0c0a08', '#2a1f18', '#020202', true);
    pxRect(ctx, BX, BY, BW, BH, '#1a1410');
    const x = (v) => Math.round(BX + BW * v);
    pxRect(ctx, x(Z.cooked), BY, x(Z.perfect) - x(Z.cooked), BH, '#1f7a3a');
    pxRect(ctx, x(Z.perfect), BY, x(Z.burnt) - x(Z.perfect), BH, '#c8a020'); pxRect(ctx, x(Z.perfect), BY, x(Z.burnt) - x(Z.perfect), 2, '#ffe066');
    pxRect(ctx, x(Z.burnt), BY, BX + BW - x(Z.burnt), BH, '#7a1f1a');
    pxRect(ctx, BX, BY, x(Math.min(1, p)) - BX, 3, 'rgba(255,255,255,0.25)');
    pxRect(ctx, Math.round(BX + BW * Math.min(1, p)) - 1, BY - 5, 3, BH + 10, phase === 'done' && q === 0 ? '#ff5a4a' : '#ffffff');
    drawText(ctx, 'RAW', x(0.25), BY + BH + 4, { align: 'center', color: '#8a7a6a' });
    drawText(ctx, 'OK', x(0.61), BY + BH + 4, { align: 'center', color: '#7dff9a' });
    drawText(ctx, 'BEST', x(0.79), BY + BH + 4, { align: 'center', color: '#ffe066' });
    drawText(ctx, phase === 'done' ? ['BURNT', 'UNDERDONE', 'COOKED', 'PERFECT'][q] : 'STOP IT IN THE GOLD', W / 2, 88, { align: 'center', color: phase === 'done' ? (q >= 2 ? '#7dff9a' : '#ff5a4a') : (C.dim || '#a89a8a') });
    parts.draw(ctx);
  };
  return mg.api;
}
