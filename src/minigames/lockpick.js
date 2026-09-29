/**
 * LOCKPICK — press at the right moment while the pick sweeps around the dial.
 *
 * createLockpick(opts) -> { el, update, destroy }
 *   opts.picks: number of picks (default 3)
 *   result: { success, cancelled, picksLeft }
 */
import {
  createMinigame,
  makeCanvas,
  drawText,
  drawTextOutlined,
  bevel,
  createParticles,
  sparkBurst,
  floatText,
  clamp,
  clamp01,
  lerp,
  ihash,
  fxRand,
  angleDiff,
  easeOutBack,
  pxLine,
  TAU,
} from './common.js';
import { t, tf, t as _t } from '../core/i18n.js';

const W = 160;
const H = 120;
const CX = 80;
const CY = 66;
const R = 40;
const ARC_R0 = 33;
const ARC_R1 = 39;
const DIAL = 96;

function buildDoor() {
  const { canvas, ctx } = makeCanvas(W, H);
  // wooden door
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const plank = Math.floor(x / 20);
      const grain = Math.sin(y * 0.35 + plank * 3 + Math.sin(x * 0.4) * 0.8);
      const h = ihash(x * 131 + y * 7);
      let c = grain > 0.6 ? '#3a2412' : grain < -0.7 ? '#23150a' : '#2e1c0e';
      if (x % 20 === 0) c = '#140b05';
      if (h % 37 === 0) c = '#1a1007';
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // backplate
  bevel(ctx, CX - 50, CY - 48, 100, 100, '#262c30', '#4d5860', '#0b0e10');
  bevel(ctx, CX - 48, CY - 46, 96, 96, '#1e2327', '#11151a', '#353d43', true);
  for (const [x, y] of [[CX - 46, CY - 44], [CX + 44, CY - 44], [CX - 46, CY + 46], [CX + 44, CY + 46]]) {
    ctx.fillStyle = '#8a969c';
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#0a0d0f';
    ctx.fillRect(x, y + 1, 2, 1);
  }
  return canvas;
}

function buildDial() {
  const { canvas, ctx } = makeCanvas(DIAL, DIAL);
  const c = DIAL / 2;
  const BRASS = ['#4a300a', '#6e4a12', '#94681c', '#b8862a', '#d8a840', '#f0cc68', '#fff0a8'];
  for (let y = 0; y < DIAL; y++) {
    for (let x = 0; x < DIAL; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R + 4) continue;
      if (d > R) {
        const lit = (-dx - dy) / d;
        ctx.fillStyle = d > R + 3 ? '#050505' : lit > 0.3 ? '#4a4f54' : '#1e2226';
        ctx.fillRect(x, y, 1, 1);
        continue;
      }
      const lit = (-dx - dy) / (d || 1);
      let v = 0.5 + lit * 0.3 * (d / R) - (d / R) * 0.08;
      if (Math.abs(d - 31) < 0.8) v -= 0.4;
      if (Math.abs(d - 32) < 0.6) v += 0.18;
      if (d < 9) v = 0.62 + lit * 0.2;
      const idx = clamp(Math.floor(v * BRASS.length), 0, BRASS.length - 1);
      ctx.fillStyle = BRASS[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // tick marks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const len = i % 3 === 0 ? 6 : 3;
    for (let r = R - 1 - len; r < R - 1; r += 0.5) {
      ctx.fillStyle = '#2a1a04';
      ctx.fillRect(Math.round(c + Math.sin(a) * r), Math.round(c - Math.cos(a) * r), 1, 1);
    }
  }
  // keyhole
  ctx.fillStyle = '#050302';
  for (let y = -3; y <= 3; y++) {
    const w = Math.floor(Math.sqrt(9 - y * y + 2));
    ctx.fillRect(c - w, c - 3 + y, w * 2, 1);
  }
  ctx.fillRect(c - 1, c, 2, 8);
  ctx.fillRect(c - 2, c + 4, 4, 4);
  // maker's mark
  drawText(ctx, 'TFG', c, c + 14, { align: 'center', color: '#6e4a12' });
  return canvas;
}

export function createLockpick(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'lockpick',
    title: 'LOCKPICK',
    tag: 'B&E TOOLKIT',
    help: '[SPACE] / [CLICK] set pin when the pick is in the green   [ESC] quit',
    width: W,
    height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng;
  const sfx = opts.sfx;
  const D = opts.difficulty;
  const PINS = clamp(Math.round(Number(opts.pinCount) || 3), 1, 4);   // lockpick tiers: Simple 1 pin .. Vault/Algorithm 3

  const door = buildDoor();
  const dial = buildDial();
  const parts = createParticles(240);

  const MAX_PICKS = clamp(Math.round(Number(opts.picks) || 3), 1, 9);
  const GRACE = 0.035;
  let picks = MAX_PICKS;
  let hits = 0;
  let angle = rng() * TAU;
  let dir = rng() < 0.5 ? 1 : -1;
  let speed = lerp(1.7, 2.7, D) * (Number(opts.speedMul) || 1);   // tier tempo: easy locks sweep slower, hard ones faster
  let arcHW = lerp(0.46, 0.17, D) * (Number(opts.arcMul) || 1);   // skill level / helpers widen the window
  let arcC = 0;
  let arcPx = [];
  let phase = 'play';
  let phaseT = 0;
  let t = 0;
  let broken = 0;
  let inside = false;
  let arcPop = 0;
  const pinH = new Array(PINS).fill(0);

  function newArc() {
    const off = 1.75 + rng() * (TAU - 3.5);
    arcC = angle + off;
    arcPx = [];
    const seen = new Set();
    for (let r = ARC_R0; r <= ARC_R1; r += 0.5) {
      const step = 0.45 / r;
      for (let a = -arcHW; a <= arcHW + 1e-6; a += step) {
        const x = Math.round(CX + Math.sin(arcC + a) * r);
        const y = Math.round(CY - Math.cos(arcC + a) * r);
        const key = x * 1000 + y;
        if (seen.has(key)) continue;
        seen.add(key);
        const edge = Math.abs(a) > arcHW - step * 1.5 || r <= ARC_R0 || r >= ARC_R1 - 0.5;
        arcPx.push([x, y, edge]);
      }
    }
    arcPop = 1;
  }
  newArc();

  const isInside = () => Math.abs(angleDiff(angle, arcC)) <= arcHW + GRACE;
  const tip = (len = 39) => ({ x: CX + Math.sin(angle) * len, y: CY - Math.cos(angle) * len });

  mg.setStatus(tf('PIN 1/{PINS}', { PINS }));

  function attempt() {
    if (phase !== 'play' || broken > 0) return;
    const p = tip();
    if (isInside()) {
      hits++;
      pinH[hits - 1] = 0.01;
      sfx('lockpick_click');
      mg.flash('#39ff6a', 0.2);
      mg.shake(2);
      sparkBurst(parts, p.x, p.y, 12, ['#ffffff', '#b6ffc8', '#39ff6a'], 55);
      floatText(parts, 'CLICK!', p.x, p.y - 6, '#b6ffc8', { life: 0.7 });
      if (hits >= PINS) {
        win();
        return;
      }
      speed *= lerp(1.18, 1.3, D);
      dir = -dir;
      arcHW = Math.max(0.09, arcHW * 0.86);
      newArc();
      mg.setStatus(tf('PIN {n}/{PINS}', { n: hits + 1, PINS }), 'good');
    } else {
      picks--;
      broken = 0.55;
      const miss = Math.abs(angleDiff(angle, arcC)) - arcHW;
      sfx('ui_error');
      mg.shake(6);
      mg.flash('#ff2020', 0.35);
      mg.glitch(0.12);
      // shards of the broken pick
      for (let k = 0; k < 10; k++) {
        const r = fxRand(8, 38);
        parts.spawn({
          x: CX + Math.sin(angle) * r,
          y: CY - Math.cos(angle) * r,
          vx: fxRand(-50, 50),
          vy: fxRand(-60, 10),
          g: 240,
          life: fxRand(0.5, 0.9),
          size: fxRand() < 0.4 ? 2 : 1,
          color: fxRand() < 0.5 ? '#c8d2d6' : '#6d7a80',
          floor: H - 4,
          bounce: 0.3,
        });
      }
      floatText(parts, miss < 0.14 ? 'SO CLOSE!' : 'SNAP!', CX, CY - 12, '#ff4040', { life: 0.8 });
      if (picks <= 0) fail();
      else mg.setStatus(tf('PICK BROKE - {picks} LEFT', { picks }), 'warn');
    }
  }

  function win() {
    phase = 'win';
    phaseT = 0;
    sfx('lockpick_success');
    mg.setStatus(_t('UNLOCKED'), 'good');
    mg.finishAfter({ success: true, cancelled: false, picksLeft: picks }, 1.7, 0.5);
  }

  function fail() {
    phase = 'fail';
    phaseT = 0;
    mg.setStatus(_t('OUT OF PICKS'), 'bad');
    mg.shake(8);
    mg.finishAfter({ success: false, cancelled: false, picksLeft: 0 }, 1.8, 0.5);
  }

  mg.onKeyDown = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE') {
      if (!e.repeat) attempt();
      return true;
    }
    return false;
  };
  mg.onPointerDown = () => attempt();

  mg.onFrame = (dt) => {
    t += dt;
    phaseT += dt;
    arcPop = Math.max(0, arcPop - dt * 3);
    if (phase === 'play') {
      if (broken > 0) broken = Math.max(0, broken - dt);
      else angle += dir * speed * dt;
      const was = inside;
      inside = broken <= 0 && isInside();
      if (inside && !was) sfx('ui_click');
    }
    for (let i = 0; i < PINS; i++) if (pinH[i] > 0) pinH[i] = Math.min(1, pinH[i] + dt * 6);
    parts.update(dt);
    render();
  };

  function drawPins() {
    for (let i = 0; i < PINS; i++) {
      const x = CX + Math.round((i - (PINS - 1) / 2) * 20);
      ctx.fillStyle = '#050505';
      ctx.fillRect(x - 4, 2, 9, 17);
      ctx.fillStyle = '#15191c';
      ctx.fillRect(x - 3, 3, 7, 15);
      const set = pinH[i] > 0;
      const jiggle = !set && i === hits && inside ? Math.round(Math.sin(t * 60)) : 0;
      const lift = set ? Math.round(easeOutBack(pinH[i]) * 6) : 0;
      // spring
      ctx.fillStyle = '#6d7a80';
      const springTop = 3;
      const springBot = 9 - lift + jiggle;
      for (let y = springTop; y < springBot; y++) ctx.fillRect(x - 1 + (y % 2 ? 1 : -1), y, 2, 1);
      // pin
      const py = 9 - lift + jiggle;
      ctx.fillStyle = set ? '#39ff6a' : '#d8a840';
      ctx.fillRect(x - 2, py, 5, 8);
      ctx.fillStyle = set ? '#d8ffe0' : '#fff0a8';
      ctx.fillRect(x - 2, py, 1, 8);
      ctx.fillStyle = set ? '#10602a' : '#6e4a12';
      ctx.fillRect(x - 2, py + 7, 5, 1);
      if (set && pinH[i] < 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 5, 2, 1, 1);
        ctx.fillRect(x + 5, 2, 1, 1);
      }
    }
    // shear line
    ctx.fillStyle = '#39ff6a';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(CX - 26, 9, 52, 1);
    ctx.globalAlpha = 1;
  }

  function drawPicks() {
    drawText(ctx, 'PICKS', 4, 92, { color: '#8a969c' });
    for (let i = 0; i < MAX_PICKS; i++) {
      const y = 100 + i * 5;
      if (y > H - 4) break;
      if (i < picks) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(4, y - 1, 16, 3);
        ctx.fillStyle = '#c8d2d6';
        ctx.fillRect(5, y, 12, 1);
        ctx.fillRect(17, y - 1, 1, 1);
        ctx.fillStyle = '#6a3a1a';
        ctx.fillRect(5, y, 4, 1);
      } else {
        ctx.fillStyle = '#5a2020';
        ctx.fillRect(5, y, 5, 1);
        ctx.fillRect(12, y + 1, 5, 1);
      }
    }
  }

  function drawNeedle() {
    const insert = broken > 0 ? 0 : 1;
    if (!insert) return;
    const p = tip();
    const back = { x: CX - Math.sin(angle) * 14, y: CY + Math.cos(angle) * 14 };
    // handle
    pxLine(ctx, CX, CY, back.x, back.y, '#101416', 3);
    pxLine(ctx, CX, CY, back.x, back.y, '#6a3a1a', 1);
    // shaft
    pxLine(ctx, CX, CY, p.x, p.y, '#0a0a0a', 2);
    pxLine(ctx, CX, CY, p.x, p.y, inside ? '#e8fff0' : '#c8d2d6', 1);
    // hook tip
    const tp = { x: Math.round(p.x), y: Math.round(p.y) };
    ctx.fillStyle = inside ? '#39ff6a' : '#ffffff';
    ctx.fillRect(tp.x - 1, tp.y - 1, 3, 3);
    if (inside) {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(tp.x - 3, tp.y - 3, 7, 7);
      ctx.globalAlpha = 1;
    }
  }

  function drawWrench() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(CX - 1, CY + 5, 4, 24);
    ctx.fillRect(CX - 1, CY + 26, 30, 4);
    ctx.fillStyle = '#7a868c';
    ctx.fillRect(CX, CY + 6, 2, 22);
    ctx.fillRect(CX, CY + 27, 28, 2);
    ctx.fillStyle = '#c8d2d6';
    ctx.fillRect(CX, CY + 6, 1, 22);
  }

  function render() {
    ctx.drawImage(door, 0, 0);
    // dial (turns when unlocked)
    const rot = phase === 'win' ? easeOutBack(clamp01(phaseT / 0.5)) * (Math.PI / 2) : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(CX, CY);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(dial, -DIAL / 2, -DIAL / 2);
    ctx.restore();

    if (phase === 'play') {
      // sweet spot
      const pulse = (Math.sin(t * 10) + 1) / 2;
      const grow = arcPop > 0 ? 1 : 0;
      for (const [x, y, edge] of arcPx) {
        ctx.fillStyle = inside ? (edge ? '#ffffff' : '#9dffb8') : edge ? '#b6ffc8' : pulse > 0.5 ? '#39ff6a' : '#22c24c';
        ctx.fillRect(x - grow, y - grow, 1 + grow, 1 + grow);
      }
      drawNeedle();
    }
    drawWrench();
    drawPins();
    drawPicks();
    drawText(ctx, `PIN ${Math.min(hits + 1, PINS)}/${PINS}`, W - 4, 104, { align: 'right', color: '#8a969c' });
    drawText(ctx, `SPD ${Math.round(speed * 10)}`, W - 4, 112, { align: 'right', color: '#5a666c' });
    parts.draw(ctx);

    if (phase === 'win') {
      // door bolt slides back
      const k = clamp01((phaseT - 0.35) / 0.3);
      const bx = Math.round(lerp(W - 18, W + 2, k));
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(bx - 1, CY - 5, 20, 10);
      ctx.fillStyle = '#9aa6ac';
      ctx.fillRect(bx, CY - 4, 18, 8);
      ctx.fillStyle = '#d8e0e4';
      ctx.fillRect(bx, CY - 4, 18, 1);
      if (phaseT > 0.3) {
        const s = phaseT < 0.45 ? 3 : 2;
        drawTextOutlined(ctx, 'UNLOCKED', CX, 26 - s * 2, { scale: s, align: 'center', color: '#39ff6a' });
      }
    } else if (phase === 'fail') {
      ctx.fillStyle = `rgba(255,0,0,${0.12 + Math.max(0, Math.sin(t * 9)) * 0.1})`;
      ctx.fillRect(0, 0, W, H);
      drawTextOutlined(ctx, 'OUT OF PICKS', CX, 30, { scale: 2, align: 'center', color: Math.floor(t * 6) % 2 ? '#ff4040' : '#ffb000' });
      drawTextOutlined(ctx, 'THE DOOR WINS', CX, 44, { align: 'center', color: '#c8d2d6' });
    }
    if (phase === 'play' && t < 2 && Math.floor(t * 3) % 2) {
      drawTextOutlined(ctx, 'HIT THE GREEN!', CX, 24, { align: 'center', color: '#ffffff' });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }

  return mg.api;
}
