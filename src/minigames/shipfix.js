/**
 * SHIP FIX minigames (wave 2, gameplay2): three small repair games used by the pre-flight faults (game/shipfaults.js).
 *   createValve(opts)  drag around the wheel (or A/D, arrows) to close a leaking valve before time runs out
 *   createNeedle(opts) hold SPACE / mouse to cool the reactor: keep the needle inside the green zone
 *   createCode(opts)   type the reboot code (opts.len digits; opts.show = code to flash for a few seconds, solo assist)
 * Same contract as every minigame: create(opts) -> { el, update, destroy }; result { success, cancelled, ... }.
 * Registered as MINIGAMES.g2valve / g2needle / g2code by game/gameplay2.js (importing this file does not touch the DOM).
 */
import { createMinigame, drawText, bevel, pxRect, clamp, lerp, C, createParticles, sparkBurst, digitFromEvent } from './common.js';

const W = 160, H = 100;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ valve
export function createValve(rawOpts) {
  const mg = createMinigame(rawOpts, { kind: 'g2valve', title: 'FUEL VALVE', tag: 'SHIP REPAIR', help: 'DRAG around the wheel clockwise  (or hold [D] / [RIGHT])   [ESC] quit', width: W, height: H });
  const { ctx, opts } = mg;
  const D = opts.difficulty, sfx = opts.sfx;
  const parts = createParticles(90);
  const NEED = lerp(2.2, 3.4, D), LIMIT = lerp(16, 12, D), LEAK = lerp(0.1, 0.2, D);
  let turns = 0, angle = 0, drag = false, last = 0, t = 0, phase = 'play', hint = 0;
  const cx = 80, cy = 54, R = 30;
  const ang = (x, y) => Math.atan2(y - cy, x - cx);
  mg.setStatus('TURN THE VALVE', '');
  mg.onPointerDown = (x, y) => { drag = true; last = ang(x, y); };
  mg.onPointerUp = () => { drag = false; };
  mg.onPointerMove = (x, y) => {
    if (!drag || phase !== 'play') return;
    const a = ang(x, y);
    let d = a - last; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    last = a;
    if (Math.hypot(x - cx, y - cy) > 8) add(d);
  };
  function add(d) {   // radians: clockwise on screen = positive
    angle += d; turns = Math.max(0, turns + d / TAU);
    if (d > 0.02 && Math.random() < 0.3) sfx('safe_click');
  }
  mg.onKeyDown = (e) => {
    if (phase !== 'play') return false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { add(e.repeat ? 0.11 : 0.34); return true; }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { add(-0.16); return true; }
    return false;
  };
  mg.onFrame = (dt) => {
    t += dt; hint += dt;
    if (phase === 'play') {
      turns = Math.max(0, turns - LEAK * dt);           // the pressure keeps pushing the valve open
      if (turns >= NEED) { phase = 'win'; mg.setStatus('LEAK SEALED', 'good'); sfx('lockpick_success'); sparkBurst(parts, cx, cy, 24, ['#7dff9a', '#fff'], 70); mg.finishAfter({ success: true, cancelled: false, turns }, 1.0, 0.3); }
      else if (t > LIMIT) { phase = 'fail'; mg.setStatus('TOO SLOW', 'bad'); mg.shake(4); mg.finishAfter({ success: false, cancelled: false }, 1.0, 0.3); }
      else mg.setStatus(`SEAL ${Math.round(turns / NEED * 100)}%   ${Math.max(0, Math.ceil(LIMIT - t))}s`, turns / NEED > 0.6 ? 'good' : '');
    }
    parts.update(dt);
    pxRect(ctx, 0, 0, W, H, '#0a0e10');
    for (let i = 0; i < H; i += 4) pxRect(ctx, 0, i, W, 1, 'rgba(255,255,255,0.03)');
    // pipe + leaking joint
    bevel(ctx, 4, 84, W - 8, 10, '#5a3a1a', '#8a5a2a', '#221208');
    if (phase !== 'win') for (let i = 0; i < 5; i++) pxRect(ctx, 128 + ((t * 40 + i * 9) % 26), 70 + ((i * 7 + t * 60) % 12), 2, 2, 'rgba(230,240,255,0.7)');
    // wheel
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.strokeStyle = '#d33'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke(); ctx.rotate(Math.PI / 3); }
    ctx.restore();
    pxRect(ctx, cx - 4, cy - 4, 8, 8, '#888');
    // progress
    bevel(ctx, 10, 8, 140, 8, '#0c1216', '#1b262d', '#020304', true);
    pxRect(ctx, 11, 9, Math.round(138 * clamp(turns / NEED, 0, 1)), 6, turns / NEED > 0.6 ? '#39ff6a' : '#ffb000');
    if (hint < 6 && phase === 'play') drawText(ctx, '>> TURN CLOCKWISE >>', W / 2, 91, { align: 'center', color: C.amber });
    parts.draw(ctx);
  };
  return mg.api;
}

// ------------------------------------------------------------------------------------------------ needle
export function createNeedle(rawOpts) {
  const mg = createMinigame(rawOpts, { kind: 'g2needle', title: 'COOLANT', tag: 'SHIP REPAIR', help: 'HOLD [SPACE] / mouse to cool - release to let it heat   [ESC] quit', width: W, height: H });
  const { ctx, opts } = mg;
  const D = opts.difficulty, sfx = opts.sfx;
  const parts = createParticles(60);
  const NEED = lerp(5, 7.5, D), LIMIT = 32, HALF = lerp(0.13, 0.085, D);
  let heat = 0.72, zone = 0.5, prog = 0, over = 0, t = 0, cool = false, phase = 'play', seed = Math.random() * 100;
  mg.onKeyDown = (e) => { if (e.code === 'Space' || e.code === 'KeyE') { cool = true; return true; } return false; };
  mg.onKeyUp = (e) => { if (e.code === 'Space' || e.code === 'KeyE') { cool = false; return true; } return false; };
  mg.onPointerDown = () => { cool = true; };
  mg.onPointerUp = () => { cool = false; };
  mg.onBlur = () => { cool = false; };
  mg.onFrame = (dt) => {
    t += dt;
    if (phase === 'play') {
      const wob = Math.sin(t * 2.3 + seed) * 0.05 + Math.sin(t * 5.1 + seed * 2) * 0.03;
      heat += ((lerp(0.2, 0.34, D) + wob) * (cool ? -0.2 : 1) - (cool ? lerp(0.5, 0.62, D) : 0)) * dt;
      heat = clamp(heat, 0, 1.05);
      zone = 0.5 + Math.sin(t * 0.35 + seed) * 0.16;
      const inZone = Math.abs(heat - zone) <= HALF;
      prog = clamp(prog + (inZone ? dt : -dt * 0.6), 0, NEED);
      over = heat >= 1 ? over + dt : Math.max(0, over - dt);
      if (prog >= NEED) { phase = 'win'; mg.setStatus('COOLANT STABLE', 'good'); sfx('lockpick_success'); sparkBurst(parts, 80, 50, 22, ['#7dff9a', '#fff'], 60); mg.finishAfter({ success: true, cancelled: false }, 1.0, 0.3); }
      else if (over > 1.3 || t > LIMIT) { phase = 'fail'; mg.setStatus(over > 1.3 ? 'MELTDOWN' : 'TIME OUT', 'bad'); mg.shake(5); mg.glitch(0.3); sfx('lockpick_click'); mg.finishAfter({ success: false, cancelled: false }, 1.1, 0.3); }
      else mg.setStatus(inZone ? 'STABLE  ' + Math.round(prog / NEED * 100) + '%' : heat > zone ? 'TOO HOT - COOL IT' : 'TOO COLD', inZone ? 'good' : 'bad');
    }
    parts.update(dt);
    pxRect(ctx, 0, 0, W, H, '#0a0e10');
    for (let i = 0; i < H; i += 4) pxRect(ctx, 0, i, W, 1, 'rgba(255,255,255,0.03)');
    // gauge arc (heat 0..1 = left..right)
    const gx = 80, gy = 78, gr = 50;
    ctx.lineWidth = 8; ctx.strokeStyle = '#26343c'; ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI, TAU); ctx.stroke();
    ctx.strokeStyle = '#1f7a3a'; ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI * (1 + zone - HALF), Math.PI * (1 + zone + HALF)); ctx.stroke();
    ctx.strokeStyle = '#a02020'; ctx.beginPath(); ctx.arc(gx, gy, gr, Math.PI * 1.9, TAU); ctx.stroke();
    const a = Math.PI * (1 + clamp(heat, 0, 1.03));
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * (gr - 4), gy + Math.sin(a) * (gr - 4)); ctx.stroke();
    pxRect(ctx, gx - 3, gy - 3, 6, 6, '#ccc');
    // progress
    bevel(ctx, 10, 8, 140, 8, '#0c1216', '#1b262d', '#020304', true);
    pxRect(ctx, 11, 9, Math.round(138 * prog / NEED), 6, '#39ff6a');
    drawText(ctx, cool ? 'COOLING' : 'HEATING', W / 2, 88, { align: 'center', color: cool ? C.cyan : C.red });
    parts.draw(ctx);
  };
  return mg.api;
}

// ------------------------------------------------------------------------------------------------ code
export function createCode(rawOpts) {
  const len = clamp(rawOpts.len | 0 || 5, 3, 8);
  const mg = createMinigame(rawOpts, { kind: 'g2code', title: 'NAV REBOOT', tag: 'SHIP REPAIR', help: 'Type the code from the NAV DISPLAY, [ENTER] to send  [BACKSPACE] delete  [ESC] quit', width: W, height: H });
  const { ctx, opts } = mg;
  const sfx = opts.sfx;
  const show = opts.show ? String(opts.show) : null;
  let text = '', t = 0, phase = 'play';
  mg.setStatus(show ? 'MEMORISE THE CODE' : 'ASK YOUR CREW FOR THE CODE', '');
  const submit = () => {
    if (text.length < len || phase !== 'play') return;
    phase = 'sent'; sfx('safe_click'); mg.setStatus('SENDING...', 'good');
    mg.finishAfter({ success: true, cancelled: false, text }, 0.5, 0.2);
  };
  mg.onKeyDown = (e) => {
    if (phase !== 'play') return false;
    const dgt = digitFromEvent(e);
    if (dgt !== null) { if (text.length < len) { text += dgt; sfx('safe_click'); } return true; }
    if (e.code === 'Backspace') { text = text.slice(0, -1); return true; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { submit(); return true; }
    return false;
  };
  mg.onFrame = (dt) => {
    t += dt;
    pxRect(ctx, 0, 0, W, H, '#060c10');
    for (let i = 0; i < H; i += 4) pxRect(ctx, 0, i, W, 1, 'rgba(255,255,255,0.03)');
    drawText(ctx, 'NAV COMPUTER OFFLINE', W / 2, 12, { align: 'center', color: C.red });
    if (show && t < 3.5) drawText(ctx, show.split('').join(' '), W / 2, 30, { align: 'center', color: C.amber, scale: 2 });
    else drawText(ctx, show ? 'CODE HIDDEN' : 'CODE: ON THE NAV DISPLAY', W / 2, 32, { align: 'center', color: C.greenDim });
    const bw = 16, gap = 4, x0 = Math.round(W / 2 - (len * (bw + gap) - gap) / 2);
    for (let i = 0; i < len; i++) {
      bevel(ctx, x0 + i * (bw + gap), 52, bw, 22, '#0c1216', '#1b262d', '#020304', true);
      const ch = text[i];
      if (ch) drawText(ctx, ch, x0 + i * (bw + gap) + bw / 2, 58, { align: 'center', color: C.green, scale: 2 });
      else if (i === text.length && Math.sin(t * 8) > 0) pxRect(ctx, x0 + i * (bw + gap) + 3, 68, bw - 6, 2, C.green);
    }
    drawText(ctx, text.length >= len ? 'PRESS [ENTER]' : `${text.length}/${len}`, W / 2, 84, { align: 'center', color: text.length >= len ? C.amber : C.greenDim });
  };
  void sparkBurst;
  return mg.api;
}
