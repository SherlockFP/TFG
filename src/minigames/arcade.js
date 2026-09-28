/**
 * FLAPPY PHISH — flappy-style arcade cabinet game.
 *
 * createArcade(opts) -> { el, update, destroy }
 *   opts.highScore: number (optional)
 *   result: { success, cancelled, score (best this session), lastScore, highScore, games }
 *
 * drawArcadeAttract(ctx, w, h, t, highScore?) — stateless attract-mode screen for the 3D cabinet.
 */
import {
  createMinigame,
  drawText,
  drawTextOutlined,
  drawSprite,
  drawSpriteRot,
  makeFishSprite,
  tintSprite,
  FISH_PAL,
  createParticles,
  floatText,
  sparkBurst,
  clamp,
  lerp,
  mod,
  ihash,
  fxRand,
  hsl,
} from './common.js';
import { t, tf, t as _t } from '../core/i18n.js';

const W = 160;
const H = 120;
const SURF = 7;
const FLOOR = 108;
const PW = 18;
const CAP = 6;

let SPR = null;
function sprites() {
  if (!SPR) {
    const f = (tail) => makeFishSprite(14, 9, FISH_PAL.kefal, { tail });
    const fish = [f(-1), f(0), f(1)];
    SPR = { fish, fishWhite: tintSprite(fish[1], '#ffffff') };
  }
  return SPR;
}

// ───────────────────────────────────────────── shared scenery (game + attract) ──
const WATER = ['#0e4b5b', '#0c4251', '#0a3947', '#09313e', '#082a35', '#07232d', '#061d26', '#05171f', '#041219'];
const RUST = ['#2a1305', '#5c2c0d', '#8a4518', '#b5652a', '#d98c4a', '#b5652a', '#8a4518', '#6a3310', '#4a220a'];

function drawBackdrop(ctx, w, h, t, scroll, floorY) {
  const n = WATER.length;
  for (let i = 0; i < n; i++) {
    const y0 = Math.floor((i * floorY) / n);
    const y1 = Math.floor(((i + 1) * floorY) / n);
    ctx.fillStyle = WATER[i];
    ctx.fillRect(0, y0, w, y1 - y0 + 1);
    if (i > 0) {
      ctx.fillStyle = WATER[i - 1];
      for (let x = i & 1; x < w; x += 2) ctx.fillRect(x, y0, 1, 1);
    }
  }
  // god rays
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#c8ffff';
  const span = w + 90;
  for (let i = 0; i < 4; i++) {
    const x = mod(i * 67 - scroll * 0.08 + Math.sin(t * 0.4 + i * 2) * 6, span) - 45;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 9 + i * 2, 0);
    ctx.lineTo(x + 36 + i * 3, floorY);
    ctx.lineTo(x + 18, floorY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // far rocks (0.18x)
  const k = floorY / 108;
  ctx.fillStyle = '#062733';
  for (let x = 0; x < w; x += 2) {
    const wx = x + scroll * 0.18;
    const hg = (15 + Math.sin(wx * 0.045) * 6 + Math.sin(wx * 0.11 + 1.3) * 3 + Math.sin(wx * 0.021 + 2) * 5) * k;
    ctx.fillRect(x, Math.round(floorY - hg), 2, Math.ceil(hg));
  }
  // kelp (0.45x)
  const ks = scroll * 0.45;
  const sp = 23;
  const first = Math.floor(ks / sp) - 1;
  for (let i = first; i < first + Math.ceil(w / sp) + 3; i++) {
    const hs = ihash(i * 7 + 3);
    if (hs % 3 === 0) continue;
    const bx = i * sp - ks + (hs % 9);
    const height = (16 + ((hs >>> 4) % 36)) * k;
    for (let y = 0; y < height; y += 2) {
      const sway = Math.sin(t * 1.6 + i + y * 0.12) * (y / height) * 3;
      const x = Math.round(bx + sway);
      ctx.fillStyle = (y >> 1) % 3 === 0 ? '#1d7250' : '#12573e';
      ctx.fillRect(x, Math.round(floorY - y - 2), 2, 2);
      if ((y >> 1) % 4 === 2) ctx.fillRect(x + (i & 1 ? 2 : -2), Math.round(floorY - y - 2), 2, 1);
    }
  }
}

function drawFloor(ctx, w, h, scroll, floorY) {
  ctx.fillStyle = '#3b3423';
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = '#5e5236';
  ctx.fillRect(0, floorY, w, 1);
  const depth = Math.max(1, h - floorY - 3);
  for (let x = 0; x < w; x++) {
    const wx = Math.floor(x + scroll);
    const hh = ihash(wx);
    if (hh % 5 === 0) {
      ctx.fillStyle = (hh >>> 8) % 2 ? '#29231a' : '#6f6140';
      ctx.fillRect(x, floorY + 2 + ((hh >>> 10) % depth), 1, 1);
    }
    if (hh % 19 === 0) {
      ctx.fillStyle = '#5e5236';
      ctx.fillRect(x, floorY - 1, 3, 1);
    }
    if (hh % 97 === 0) {
      // tiny shell
      ctx.fillStyle = '#d9c7a0';
      ctx.fillRect(x, floorY + 1, 2, 1);
    }
  }
}

function drawSurface(ctx, w, t, surf) {
  for (let x = 0; x < w; x++) {
    const y = Math.round(surf - 2 + Math.sin(x * 0.22 + t * 3) * 1.1 + Math.sin(x * 0.07 - t * 1.3) * 0.8);
    ctx.fillStyle = '#1b6a7a';
    ctx.fillRect(x, 0, 1, Math.max(0, y));
    ctx.fillStyle = (x + Math.floor(t * 8)) % 11 === 0 ? '#ffffff' : '#8ff0f5';
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawPipeBody(ctx, x, y0, y1, pw, seed) {
  if (y1 <= y0) return;
  x = Math.round(x);
  y0 = Math.round(y0);
  y1 = Math.round(y1);
  for (let i = 0; i < pw; i++) {
    ctx.fillStyle = RUST[Math.floor((i / pw) * RUST.length)];
    ctx.fillRect(x + i, y0, 1, y1 - y0);
  }
  ctx.fillStyle = '#3a1a07';
  for (let y = y0 + 4; y < y1; y += 11) ctx.fillRect(x, y, pw, 1);
  const n = Math.floor((y1 - y0) / 5);
  for (let k = 0; k < n; k++) {
    const hh = ihash(seed * 31 + k);
    ctx.fillStyle = hh % 3 === 0 ? '#e3a060' : hh % 3 === 1 ? '#2a1204' : '#7b3a12';
    ctx.fillRect(x + (hh % pw), y0 + ((hh >>> 5) % (y1 - y0)), 1 + ((hh >>> 9) % 2), 1);
  }
  ctx.fillStyle = '#140802';
  ctx.fillRect(x - 1, y0, 1, y1 - y0);
  ctx.fillRect(x + pw, y0, 1, y1 - y0);
}

function drawPipeCap(ctx, x, y, pw, capH, mossDown, seed, t) {
  x = Math.round(x) - 2;
  y = Math.round(y);
  const cw = pw + 4;
  for (let i = 0; i < cw; i++) {
    ctx.fillStyle = RUST[Math.floor((i / cw) * RUST.length)];
    ctx.fillRect(x + i, y, 1, capH);
  }
  ctx.fillStyle = '#140802';
  ctx.fillRect(x - 1, y, 1, capH);
  ctx.fillRect(x + cw, y, 1, capH);
  ctx.fillRect(x, y - 1, cw, 1);
  ctx.fillRect(x, y + capH, cw, 1);
  ctx.fillStyle = '#f2b67a';
  ctx.fillRect(x + 2, y + 2, 1, 1);
  ctx.fillRect(x + cw - 3, y + 2, 1, 1);
  ctx.fillRect(x + Math.floor(cw / 2), y + 2, 1, 1);
  // moss / slime
  ctx.fillStyle = '#3f9a4a';
  for (let i = 0; i < cw; i += 3) {
    const hh = ihash(seed * 13 + i);
    if (hh % 3) continue;
    const len = 1 + (hh >>> 3) % 4 + (mossDown ? Math.round(Math.sin(t * 2 + i) * 0.6) : 0);
    if (mossDown) ctx.fillRect(x + i, y + capH, 1, len);
    else ctx.fillRect(x + i, y - len, 1, len);
  }
}

function drawNet(ctx, x, bottom, pw, t, seed) {
  x = Math.round(x);
  bottom = Math.round(bottom);
  // ropes
  ctx.fillStyle = '#6b5a38';
  ctx.fillRect(x, 0, 1, bottom);
  ctx.fillRect(x + pw - 1, 0, 1, bottom);
  // mesh
  ctx.fillStyle = '#c8b787';
  for (let y = 0; y < bottom; y++) {
    const sway = Math.round(Math.sin(t * 2 + y * 0.12 + seed) * (y / Math.max(1, bottom)) * 1.5);
    for (let i = 1; i < pw - 1; i++) {
      if ((i + y) % 4 === 0 || mod(i - y, 4) === 0) ctx.fillRect(x + i + sway, y, 1, 1);
    }
  }
  // lead line + floats
  ctx.fillStyle = '#2b2418';
  ctx.fillRect(x - 1, bottom - 1, pw + 2, 2);
  for (let i = 0; i < pw; i += 6) {
    ctx.fillStyle = (i / 6) % 2 ? '#f0f0f0' : '#e03a2a';
    ctx.fillRect(x + i, bottom, 3, 3);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + i, bottom + 3, 3, 1);
  }
  // trapped boot (company recycling program)
  if (seed % 3 === 0 && bottom > 26) {
    const by = bottom - 12;
    ctx.fillStyle = '#4a2c14';
    ctx.fillRect(x + 6, by, 3, 5);
    ctx.fillRect(x + 6, by + 5, 6, 3);
    ctx.fillStyle = '#1b0f06';
    ctx.fillRect(x + 6, by + 8, 6, 1);
  }
}

function drawObstacle(ctx, o, floorY, t) {
  const top = Math.round(o.c - o.gap / 2);
  const bot = Math.round(o.c + o.gap / 2);
  if (o.style === 'net') {
    drawNet(ctx, o.x, top, PW, t, o.seed);
  } else {
    drawPipeBody(ctx, o.x, 0, top - CAP, PW, o.seed);
    drawPipeCap(ctx, o.x, top - CAP, PW, CAP, true, o.seed, t);
  }
  drawPipeBody(ctx, o.x, bot + CAP, floorY + 1, PW, o.seed + 77);
  drawPipeCap(ctx, o.x, bot, PW, CAP, false, o.seed + 5, t);
}

function drawBubble(ctx, p) {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (p.size >= 3) {
    ctx.fillStyle = '#a8f0f5';
    ctx.fillRect(x, y - 1, 1, 1);
    ctx.fillRect(x - 1, y, 1, 1);
    ctx.fillRect(x + 1, y, 1, 1);
    ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 1, 1);
  } else if (p.size === 2) {
    ctx.fillStyle = '#8fdde6';
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, 1, 1);
  } else {
    ctx.fillStyle = '#8fdde6';
    ctx.fillRect(x, y, 1, 1);
  }
}

function scanlines(ctx, w, h, a = 0.16) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  for (let y = 1; y < h; y += 2) ctx.fillRect(0, y, w, 1);
}

// ───────────────────────────────────────────── attract mode (3D cabinet screen) ──
/**
 * Animated attract screen. Stateless: everything derives from `t` (seconds).
 * Designed for ~128x96 but scales to any size.
 */
export function drawArcadeAttract(ctx, w, h, t, highScore) {
  if (!ctx) return;
  w = Math.max(32, w | 0);
  h = Math.max(24, h | 0);
  t = Number(t) || 0;
  const S = sprites();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const floorY = Math.round(h * 0.9);
  const surf = Math.max(4, Math.round(h * 0.06));
  const speed = 34;
  const scroll = t * speed;
  drawBackdrop(ctx, w, h, t, scroll, floorY);

  // pipes placed so the demo fish always threads the gaps
  const fishX = Math.round(w * 0.3);
  const amp = h * 0.17;
  const mid = h * 0.5;
  const pathY = (tt) => mid + Math.sin(tt * 1.7) * amp + Math.sin(tt * 3.1) * amp * 0.2;
  const spacing = Math.max(48, Math.round(w * 0.55));
  const gap = Math.round(h * 0.4);
  const k0 = Math.floor((scroll - w - PW) / spacing) - 1;
  const k1 = Math.ceil(scroll / spacing) + 1;
  for (let kk = k0; kk <= k1; kk++) {
    const X = kk * spacing + w;
    const sx = X - scroll;
    const tPass = (X + PW / 2 - fishX) / speed;
    const c = clamp(pathY(tPass), surf + gap / 2 + 4, floorY - gap / 2 - 4);
    drawObstacle(ctx, { x: sx, c, gap, style: ihash(kk + 99) % 3 === 0 ? 'net' : 'pipe', seed: kk & 1023 }, floorY, t);
  }
  drawFloor(ctx, w, h, scroll, floorY);
  drawSurface(ctx, w, t, surf);

  // bubbles (stateless)
  for (let i = 0; i < 12; i++) {
    const hh = ihash(i * 17 + 5);
    const period = 3 + (hh % 5);
    const ph = mod(t / period + (hh % 100) / 100, 1);
    const bx = ((hh >>> 6) % w) + Math.sin(t * 2 + i) * 2;
    const by = floorY - ph * (floorY - surf);
    drawBubble(ctx, { x: bx, y: by, size: 1 + (hh % 3) });
  }

  // demo fish
  const fy = pathY(t);
  const vy = (pathY(t + 0.05) - fy) / 0.05;
  const frame = mod(Math.floor(t * 8), 4);
  drawSpriteRot(ctx, S.fish[frame === 3 ? 1 : frame], fishX, fy, clamp(vy / 160, -0.5, 0.7));

  // title
  const ts = w >= 110 ? 2 : 1;
  const tw = 5 * 4 * ts;
  ctx.fillStyle = 'rgba(0,10,8,0.55)';
  ctx.fillRect(Math.round(w / 2 - tw / 2 - 4), Math.round(h * 0.08), tw + 8, 13 * ts + 4);
  const titleCol = (i) => (Math.floor(t * 4 + i * 0.5) % 6 === 0 ? '#ffffff' : i % 2 ? '#ffb000' : '#ffcc40');
  drawText(ctx, 'FLAPPY', w / 2, h * 0.08 + 2, { scale: ts, align: 'center', shadow: '#5a2a00', charColor: titleCol, wave: { amp: 1, t, speed: 5 } });
  drawText(ctx, 'JUMP', w / 2, h * 0.08 + 2 + 7 * ts, { scale: ts, align: 'center', shadow: '#063a14', color: '#39ff6a', wave: { amp: 1, t: t + 1, speed: 5 } });

  // blinking prompt
  const blink = mod(t, 1) < 0.62;
  const alt = mod(t, 8) < 4;
  const py = floorY - 9;
  if (blink) {
    const msg = alt ? 'PRESS E' : 'INSERT COIN';
    drawTextOutlined(ctx, msg, w / 2, py, { color: alt ? '#ffffff' : '#ffb000', align: 'center' });
  }
  if (highScore !== undefined && highScore !== null) {
    drawTextOutlined(ctx, `HI ${Math.max(0, highScore | 0)}`, w - 3, surf + 2, { color: '#39ff6a', align: 'right' });
  }
  scanlines(ctx, w, h, 0.16);
  ctx.restore();
}

// ───────────────────────────────────────────── the game ──
const QUIPS = [
  [0, 'SLEEPS WITH THE FISHES'],
  [1, 'SMALL FRY'],
  [5, 'DECENT MULLET'],
  [12, 'BUSINESS IN FRONT'],
  [25, 'PARTY IN THE BACK!'],
  [45, 'PHISH LORD'],
];

export function createArcade(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'arcade',
    title: 'FLAPPY PHISH',
    tag: 'ARCADE',
    help: '[SPACE] / [CLICK] swim   [ESC] quit',
    width: W,
    height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng;
  const sfx = opts.sfx;
  const D = opts.difficulty;
  const S = sprites();
  const parts = createParticles(260);

  let highScore = Math.max(0, Math.floor(Number(opts.highScore) || 0));
  let best = 0;
  let lastScore = 0;
  let games = 0;

  const GRAV = lerp(300, 330, D);
  const FLAP = -lerp(98, 104, D);
  const MAXV = 150;

  let mode = 'ready'; // ready | play | dying | over
  let modeT = 0;
  let t = 0;
  let fish;
  let pipes;
  let score;
  let scroll = 0;
  let spawnDist;
  let flapAnim = 0;
  let scorePop = 0;
  let newHigh = false;
  let hitFlash = 0;
  let speed = 0;

  const gapSize = () => Math.max(lerp(34, 28, D), lerp(50, 40, D) - score * 0.45);
  const baseSpeed = () => Math.min(lerp(50, 60, D) + score * 1.25, lerp(86, 100, D));

  function reset() {
    fish = { x: 42, y: 56, vy: 0, rot: 0, dead: false };
    pipes = [];
    score = 0;
    spawnDist = 40;
    newHigh = false;
    speed = baseSpeed();
  }
  reset();

  function spawnPipe() {
    const gap = gapSize();
    const minC = SURF + gap / 2 + 6;
    const maxC = FLOOR - gap / 2 - 6;
    const prev = pipes.length ? pipes[pipes.length - 1].c : (SURF + FLOOR) / 2;
    const maxJump = lerp(32, 48, D);
    const c = clamp(prev + (rng() * 2 - 1) * maxJump, minC, maxC);
    pipes.push({ x: W + 4, c, gap, scored: false, style: rng() < 0.33 ? 'net' : 'pipe', seed: Math.floor(rng() * 1e6) });
  }

  function bubble(x, y, size) {
    parts.spawn({
      x,
      y,
      vx: fxRand(-4, 4),
      vy: -fxRand(12, 28),
      life: fxRand(1.4, 3.2),
      size,
      fade: false,
      draw: drawBubble,
      onUpdate(p, dt) {
        p.x += Math.sin(p.age * 6 + p.y * 0.1) * dt * 5;
        if (p.y < SURF + 1) p.life = 0;
      },
    });
  }

  function flap() {
    fish.vy = FLAP;
    flapAnim = 0.28;
    sfx('arcade_jump');
    for (let i = 0; i < 3; i++) bubble(fish.x + 6, fish.y - 1, fxRand() < 0.4 ? 2 : 1);
    for (let i = 0; i < 2; i++) bubble(fish.x - 7, fish.y + fxRand(-2, 2), 1);
  }

  function endRun() {
    lastScore = score;
    best = Math.max(best, score);
    games++;
    if (score > highScore) {
      highScore = score;
      newHigh = true;
    }
  }

  function die() {
    if (mode !== 'play') return;
    mode = 'dying';
    modeT = 0;
    fish.dead = true;
    fish.vy = -40;
    hitFlash = 0.12;
    sfx('arcade_die');
    mg.shake(8);
    mg.flash('#ffffff', 0.55);
    mg.glitch(0.2);
    sparkBurst(parts, fish.x, fish.y, 16, ['#ffffff', '#ff5a3a', '#ffd23f'], 60);
    for (let i = 0; i < 8; i++) bubble(fish.x + fxRand(-4, 4), fish.y + fxRand(-3, 3), fxRand() < 0.5 ? 3 : 2);
    endRun();
    mg.setStatus(tf('SCORE {score}', { score }), 'bad');
  }

  function press() {
    if (mode === 'ready') {
      mode = 'play';
      modeT = 0;
      mg.setStatus(_t('SCORE 0'));
      flap();
    } else if (mode === 'play') {
      flap();
    } else if (mode === 'over' && modeT > 0.6) {
      sfx('coins');
      mg.flash('#39ff6a', 0.25);
      reset();
      mode = 'ready';
      modeT = 0;
      mg.setStatus(`HI ${highScore}`, 'dim');
    }
  }

  mg.setStatus(`HI ${highScore}`, 'dim');

  mg.onKeyDown = (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!e.repeat) press();
      return true;
    }
    return false;
  };
  mg.onPointerDown = () => press();

  mg.onEscape = () => {
    if (mode === 'play' && score > 0) endRun();
    if (games > 0) {
      mg.finish({ success: true, cancelled: false, score: best, lastScore, highScore, games });
    } else {
      mg.finish({ success: false, cancelled: true, score: 0, lastScore: 0, highScore, games: 0 });
    }
  };

  function collide() {
    const fx0 = fish.x - 5;
    const fx1 = fish.x + 5;
    const fy0 = fish.y - 3;
    const fy1 = fish.y + 3;
    for (const p of pipes) {
      if (fx1 <= p.x - 1 || fx0 >= p.x + PW + 1) continue;
      if (fy0 < p.c - p.gap / 2 || fy1 > p.c + p.gap / 2) return true;
    }
    return fy1 > FLOOR;
  }

  mg.onFrame = (dt) => {
    t += dt;
    modeT += dt;
    flapAnim = Math.max(0, flapAnim - dt);
    scorePop = Math.max(0, scorePop - dt);
    hitFlash = Math.max(0, hitFlash - dt);

    if (mode === 'ready') {
      fish.y = 56 + Math.sin(t * 3) * 3;
      fish.rot = Math.cos(t * 3) * -0.12;
      scroll += 18 * dt;
    } else if (mode === 'play') {
      speed = baseSpeed();
      scroll += speed * dt;
      fish.vy = Math.min(MAXV, fish.vy + GRAV * dt);
      fish.y += fish.vy * dt;
      if (fish.y < SURF + 4) {
        fish.y = SURF + 4;
        if (fish.vy < -20) {
          for (let i = 0; i < 4; i++) {
            parts.spawn({ x: fish.x + fxRand(-4, 6), y: SURF, vx: fxRand(-20, 20), vy: -fxRand(10, 40), g: 160, life: 0.5, color: '#bff8ff' });
          }
        }
        fish.vy = Math.max(fish.vy, 0);
      }
      const target = clamp(fish.vy / 150, -0.45, 1.05);
      fish.rot += (target - fish.rot) * Math.min(1, dt * 12);

      spawnDist -= speed * dt;
      if (spawnDist <= 0) {
        spawnPipe();
        spawnDist += lerp(80, 70, D) + PW;
      }
      for (const p of pipes) {
        p.x -= speed * dt;
        if (!p.scored && p.x + PW < fish.x - 4) {
          p.scored = true;
          score++;
          scorePop = 0.14;
          sfx('arcade_score');
          sparkBurst(parts, p.x + PW / 2, p.c, 8, ['#ffffff', '#ffd23f', '#39ff6a'], 40);
          mg.setStatus(tf('SCORE {score}', { score }));
          if (score % 10 === 0) {
            floatText(parts, 'SPEED UP!', W / 2, 40, '#ffb000', { life: 1.1 });
            mg.flash('#39ff6a', 0.18);
          }
        }
      }
      pipes = pipes.filter((p) => p.x > -PW - 8);
      if (collide()) die();
    } else if (mode === 'dying') {
      // dead fish float belly-up. very sad. very kefal.
      fish.vy += (-14 - fish.vy) * Math.min(1, dt * 2.5);
      fish.y = Math.max(SURF + 4, fish.y + fish.vy * dt);
      fish.rot += (Math.sin(t * 2.5) * 0.15 - fish.rot) * Math.min(1, dt * 5);
      if (modeT > 1.25) {
        mode = 'over';
        modeT = 0;
        mg.shake(3);
      }
    } else if (mode === 'over') {
      fish.y = Math.max(SURF + 4, fish.y - 6 * dt);
      fish.rot = Math.sin(t * 2.5) * 0.15;
    }

    if (Math.random() < dt * 5) bubble(fxRand(0, W), FLOOR - 1, fxRand() < 0.25 ? 3 : fxRand() < 0.5 ? 2 : 1);
    parts.update(dt);
    render();
  };

  function render() {
    drawBackdrop(ctx, W, H, t, scroll, FLOOR);
    for (const p of pipes) drawObstacle(ctx, p, FLOOR, t);
    drawFloor(ctx, W, H, scroll, FLOOR);
    drawSurface(ctx, W, t, SURF);
    parts.draw(ctx);

    // fish
    const fr = flapAnim > 0 ? [0, 1, 2, 1][Math.floor(t * 22) % 4] : [0, 1, 2, 1][Math.floor(t * 7) % 4];
    const spr = hitFlash > 0 ? S.fishWhite : S.fish[fish.dead ? 1 : fr];
    drawSpriteRot(ctx, spr, fish.x, fish.y, fish.rot, { flipY: fish.dead });
    if (fish.dead) {
      // X eye
      ctx.fillStyle = '#000';
      const ex = Math.round(fish.x + 4);
      const ey = Math.round(fish.y - 1);
      ctx.fillRect(ex - 1, ey - 1, 1, 1);
      ctx.fillRect(ex + 1, ey - 1, 1, 1);
      ctx.fillRect(ex, ey, 1, 1);
      ctx.fillRect(ex - 1, ey + 1, 1, 1);
      ctx.fillRect(ex + 1, ey + 1, 1, 1);
    }

    if (mode === 'play' || mode === 'dying') {
      drawTextOutlined(ctx, String(score), W / 2, 12, { scale: scorePop > 0 ? 3 : 2, align: 'center', color: '#ffffff' });
    }

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(0,8,6,0.45)';
      ctx.fillRect(28, 14, 104, 34);
      drawText(ctx, 'FLAPPY', W / 2, 18, {
        scale: 2,
        align: 'center',
        shadow: '#4a2200',
        charColor: (i) => (Math.floor(t * 5 + i) % 7 === 0 ? '#ffffff' : '#ffb000'),
        wave: { amp: 1, t, speed: 6 },
      });
      drawText(ctx, 'JUMP', W / 2, 32, { scale: 2, align: 'center', shadow: '#063a14', color: '#39ff6a', wave: { amp: 1, t: t + 0.8, speed: 6 } });
      if (t % 1 < 0.65) drawTextOutlined(ctx, 'PRESS SPACE', W / 2, 82, { align: 'center', color: '#ffffff' });
      drawTextOutlined(ctx, 'DODGE THE PIPES. AVOID NETS.', W / 2, 93, { align: 'center', color: '#8fdde6' });
      drawTextOutlined(ctx, `HI ${highScore}`, W - 4, 10, { align: 'right', color: '#39ff6a' });
    }

    if (mode === 'over') {
      const k = Math.min(1, modeT / 0.25);
      ctx.fillStyle = `rgba(0,0,0,${0.55 * k})`;
      ctx.fillRect(0, 0, W, H);
      const dropY = Math.round(lerp(-20, 16, Math.min(1, modeT / 0.3)));
      const gameOverCol = Math.floor(t * 3) % 2 ? '#ff4040' : '#ffb000';
      drawTextOutlined(ctx, 'GAME OVER', W / 2, dropY, { scale: 2, align: 'center', color: gameOverCol });
      if (modeT > 0.25) {
        drawTextOutlined(ctx, `SCORE ${lastScore}`, W / 2, 38, { align: 'center', color: '#ffffff' });
        drawTextOutlined(ctx, `HI ${highScore}`, W / 2, 46, { align: 'center', color: '#39ff6a' });
        let quip = QUIPS[0][1];
        for (const [min, q] of QUIPS) if (lastScore >= min) quip = q;
        drawTextOutlined(ctx, quip, W / 2, 57, { align: 'center', color: '#8fdde6' });
      }
      if (newHigh && modeT > 0.4) {
        drawText(ctx, 'NEW HIGH SCORE!', W / 2, 68, {
          align: 'center',
          shadow: '#000',
          charColor: (i) => hsl(t * 360 + i * 25, 100, 60),
          wave: { amp: 1, t, speed: 10 },
        });
      }
      if (modeT > 0.6 && t % 1 < 0.6) {
        drawTextOutlined(ctx, 'INSERT COIN', W / 2, 82, { scale: 1, align: 'center', color: '#ffb000' });
      }
      if (modeT > 0.6) drawTextOutlined(ctx, '[SPACE] RETRY   [ESC] QUIT', W / 2, 94, { align: 'center', color: '#39ff6a' });
    }
    scanlines(ctx, W, H, 0.1);
  }

  return mg.api;
}
