/**
 * FISHING — cast, wait, hook, reel (Stardew-style catch bar).
 *
 * createFishing(opts) -> { el, update, destroy }
 *   opts.fish: { id, name, difficulty: 0..1, rarity: common|uncommon|rare|epic|legendary }
 *   result: { success, cancelled, fishId, fishName, rarity, reason? }
 */
import {
  createMinigame,
  makeCanvas,
  drawText,
  drawTextOutlined,
  textWidth,
  drawSprite,
  spriteFromRows,
  spriteFromGrid,
  makeFishSprite,
  tintSprite,
  FISH_PAL,
  RARITY_COLORS,
  createParticles,
  floatText,
  sparkBurst,
  bezierPoints,
  pxEllipse,
  bevel,
  clamp,
  clamp01,
  lerp,
  mod,
  ihash,
  fxRand,
  rrange,
  rint,
  rpick,
  hsl,
  mixColor,
  TAU,
} from './common.js';

const W = 192;
const H = 144;
const HORIZON = 44;
const BAR = { x: 158, y: 9, w: 14, h: 122 };
const METER = { x: 176, y: 9, w: 7, h: 122 };
const ROD_BASE = { x: 14, y: 152 };
const ROD_TIP0 = { x: 72, y: 56 };

const HELP_CAST = '[HOLD SPACE] charge   [RELEASE] cast   [ESC] quit';
const HELP_WAIT = '[SPACE] hook it when the bobber dives   [ESC] quit';
const HELP_REEL = '[HOLD SPACE / MOUSE] raise   [RELEASE] drop   [ESC] quit';

const BOBBER = spriteFromRows(
  ['..y..', '..k..', '.krk.', 'krrrk', 'kwwwk', '.kwk.', '..k..'],
  { k: '#1a0a0a', r: '#ff3030', w: '#f4f4f4', y: '#ffe066' },
);
const BOBBER_WATERLINE = 4;

const BOOT = spriteFromRows(
  [
    '..kkkkk.....',
    '..knnnk.....',
    '..knlnk.....',
    '..knnnk.....',
    '..knnnk.....',
    '..knnnkkkk..',
    '.knnnnnnnnk.',
    'knnnnnnnnnnk',
    'kNNNNNNNNNNk',
    'kkkkkkkkkkkk',
  ],
  { k: '#140a04', n: '#6b4424', N: '#3b2412', l: '#c8a070' },
);

function makeEelSprite() {
  const w = 30;
  const h = 11;
  const kind = new Uint8Array(w * h);
  for (let x = 1; x < w - 1; x++) {
    const yc = 5 + Math.sin(x * 0.42) * 2.2;
    const th = x < 4 ? 0.8 : x > w - 5 ? 1.4 : 1.6;
    for (let y = 1; y < h - 1; y++) if (Math.abs(y + 0.5 - yc - 0.5) <= th) kind[y * w + x] = 1;
  }
  const px = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (kind[y * w + x]) {
        const up = y > 0 && kind[(y - 1) * w + x];
        px[y * w + x] = up ? '#7f9c52' : '#3d5a28';
      } else {
        const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && kind[yy * w + xx];
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) px[y * w + x] = '#0a1406';
      }
    }
  }
  // eye near the head (right side)
  for (let y = 0; y < h; y++) {
    if (kind[y * w + (w - 4)]) {
      px[y * w + (w - 4)] = '#ffe066';
      break;
    }
  }
  return spriteFromGrid(w, h, px);
}

function paletteFor(fish) {
  const id = fish.id.toLowerCase();
  if (id.includes('golden') || id.includes('gold')) return { pal: FISH_PAL.golden, hair: true };
  if (id.includes('kefal') || id.includes('mullet')) return { pal: FISH_PAL.kefal, hair: true };
  if (id.includes('lufer') || id.includes('blue')) return { pal: FISH_PAL.lufer, hair: false };
  if (id.includes('levrek') || id.includes('bass')) return { pal: FISH_PAL.levrek, hair: false };
  if (fish.rarity === 'epic') return { pal: FISH_PAL.ghost, hair: false };
  if (fish.rarity === 'legendary') return { pal: FISH_PAL.golden, hair: true };
  const pick = ihash(ihash(fish.id.length * 131) + fish.id.charCodeAt(0)) % 3;
  return { pal: [FISH_PAL.kefal, FISH_PAL.lufer, FISH_PAL.levrek][pick], hair: pick === 0 };
}

function catchArt(fish) {
  const id = fish.id.toLowerCase();
  if (id.includes('boot')) return { spr: BOOT, scale: 3 };
  if (id.includes('eel')) return { spr: makeEelSprite(), scale: 3 };
  const { pal, hair } = paletteFor(fish);
  return { spr: makeFishSprite(28, 17, pal, { hair }), scale: 2 };
}

function iconArt(fish) {
  const id = fish.id.toLowerCase();
  if (id.includes('boot')) return BOOT;
  const { pal, hair } = paletteFor(fish);
  return makeFishSprite(11, 7, pal, { hair });
}

function normFish(f) {
  const src = f && typeof f === 'object' ? f : {};
  const d = Number(src.difficulty);
  return {
    id: String(src.id || 'fish_kefal'),
    name: String(src.name || 'Kefal'),
    difficulty: Number.isFinite(d) ? clamp01(d) : null,
    rarity: RARITY_COLORS[src.rarity] ? src.rarity : 'common',
  };
}

// ───────────────────────────────────────────── static scenery ──
function buildBackground() {
  const { canvas, ctx } = makeCanvas(W, H);
  const SKY = ['#060818', '#080b1f', '#0b0e26', '#10122d', '#151633', '#1c1a39', '#251e3e', '#302342', '#3b2946'];
  for (let i = 0; i < SKY.length; i++) {
    const y0 = Math.floor((i * HORIZON) / SKY.length);
    const y1 = Math.floor(((i + 1) * HORIZON) / SKY.length);
    ctx.fillStyle = SKY[i];
    ctx.fillRect(0, y0, W, y1 - y0 + 1);
    if (i) {
      ctx.fillStyle = SKY[i - 1];
      for (let x = i & 1; x < W; x += 2) ctx.fillRect(x, y0, 1, 1);
    }
  }
  // stars
  for (let i = 0; i < 70; i++) {
    const h = ihash(i * 97 + 11);
    const x = h % W;
    const y = (h >>> 9) % (HORIZON - 12);
    ctx.fillStyle = (h >>> 3) % 5 === 0 ? '#ffffff' : '#8a8fb8';
    ctx.fillRect(x, y, 1, 1);
  }
  // moon
  const mx = 34;
  const my = 13;
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = x * x + y * y;
      if (d <= 36) {
        ctx.fillStyle = d > 26 ? '#cfc58a' : (x + y) % 5 === 0 && d < 16 ? '#d8cf98' : '#f2ecc0';
        ctx.fillRect(mx + x, my + y, 1, 1);
      }
    }
  }
  ctx.fillStyle = '#cfc58a';
  ctx.fillRect(mx - 2, my - 1, 2, 2);
  ctx.fillRect(mx + 2, my + 2, 1, 1);
  // far shore with pines
  for (let x = 0; x < W; x++) {
    const base = HORIZON - 3 - Math.round(Math.sin(x * 0.05) * 1.5 + Math.sin(x * 0.13 + 2) * 1);
    ctx.fillStyle = '#081212';
    ctx.fillRect(x, base, 1, HORIZON - base + 1);
  }
  for (let i = 0; i < 34; i++) {
    const h = ihash(i * 53 + 7);
    const px = (i * 6 + (h % 5)) % W;
    const ph = 5 + (h >>> 5) % 9;
    const base = HORIZON - 3;
    for (let y = 0; y < ph; y++) {
      const half = Math.floor((y / ph) * 3.2);
      ctx.fillStyle = '#081212';
      ctx.fillRect(px - half, base - ph + y, half * 2 + 1, 1);
    }
  }
  // the facility on the far shore
  ctx.fillStyle = '#0a1616';
  ctx.fillRect(120, HORIZON - 12, 18, 10);
  ctx.fillRect(126, HORIZON - 20, 3, 8);
  ctx.fillRect(132, HORIZON - 15, 4, 4);
  ctx.fillStyle = '#e8c860';
  ctx.fillRect(123, HORIZON - 9, 1, 1);
  ctx.fillRect(130, HORIZON - 9, 1, 1);
  // water
  const WATER = ['#1d3e52', '#1a394c', '#163346', '#132d3f', '#102738', '#0d2231', '#0b1d2a', '#091824', '#07131d', '#050f17'];
  const wh = H - HORIZON;
  for (let i = 0; i < WATER.length; i++) {
    const y0 = HORIZON + Math.floor((i * wh) / WATER.length);
    const y1 = HORIZON + Math.floor(((i + 1) * wh) / WATER.length);
    ctx.fillStyle = WATER[i];
    ctx.fillRect(0, y0, W, y1 - y0 + 1);
    if (i) {
      ctx.fillStyle = WATER[i - 1];
      for (let x = i & 1; x < W; x += 2) ctx.fillRect(x, y0, 1, 1);
    }
  }
  ctx.fillStyle = '#4a5a78';
  ctx.fillRect(0, HORIZON, W, 1);
  // dock (bottom-left)
  for (let y = 124; y < H; y++) {
    const x1 = Math.round(lerp(34, 58, (y - 124) / (H - 124)));
    const plank = Math.floor((y - 124) / 4);
    ctx.fillStyle = (y - 124) % 4 === 3 ? '#1a0f08' : plank % 2 ? '#5a3a20' : '#4d311b';
    ctx.fillRect(0, y, x1, 1);
    ctx.fillStyle = '#20140a';
    ctx.fillRect(x1, y, 1, 1);
  }
  ctx.fillStyle = '#2a1a0e';
  ctx.fillRect(30, 118, 4, 8);
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(30, 117, 4, 1);
  // tackle box on the dock
  bevel(ctx, 6, 128, 14, 8, '#7a2020', '#b84040', '#3a0c0c');
  ctx.fillStyle = '#d0b060';
  ctx.fillRect(12, 131, 2, 2);
  return canvas;
}

// ───────────────────────────────────────────── the game ──
export function createFishing(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'fishing',
    title: 'FISHING',
    tag: 'ANGLER.EXE',
    help: HELP_CAST,
    width: W,
    height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng;
  const sfx = opts.sfx;
  const fish = normFish(opts.fish);
  const D = fish.difficulty === null ? opts.difficulty : clamp01((opts.difficulty + fish.difficulty) / 2);
  const rarityCol = RARITY_COLORS[fish.rarity];

  const bg = buildBackground();
  const parts = createParticles(320);
  const ripples = [];
  const icon = iconArt(fish);
  const shadowSpr = tintSprite(makeFishSprite(12, 7, FISH_PAL.kefal, { hair: false }), '#03101a');
  let art = null;

  // tuning
  const BITE_WINDOW = lerp(0.85, 0.45, D);
  const ZONE_H = Math.round(lerp(46, 26, D));
  const ZONE_UP = 440;
  const ZONE_G = 320;
  const FILL = lerp(0.22, 0.2, D);
  const DRAIN = lerp(0.13, 0.2, D);
  const STYLE = fish.rarity === 'legendary' ? 'dart' : rpick(rng, D > 0.6 ? ['mixed', 'dart', 'sinker', 'floater'] : ['mixed', 'smooth', 'sinker', 'floater']);

  let phase = 'aim';
  let phaseT = 0;
  let t = 0;
  let holding = false;
  let power = 0;
  let powerDir = 1;
  let perfect = false;
  let reelOn = false;
  let reelAngle = 0;

  const bob = { x: ROD_TIP0.x + 2, y: ROD_TIP0.y + 16, tx: 0, ty: 0, sx: 0, sy: 0, dip: 0, sub: 0 };
  let flightDur = 0.7;
  let waitTime = 3;
  let nibbles = [];
  let spookT = 0;

  const zone = { y: BAR.h - ZONE_H, v: 0 };
  const fishPos = { y: BAR.h * 0.45, v: 0, target: BAR.h * 0.45, t: 0.6 };
  let progress = 0.3;
  let inZone = false;
  let thrash = { x: 0, y: 0 };
  let thrashRip = 0;
  let lostReason = '';

  function setPhase(p) {
    phase = p;
    phaseT = 0;
  }

  function setReel(on) {
    if (on === reelOn) return;
    reelOn = on;
    sfx(on ? 'reel_loop' : 'stop:reel_loop');
  }

  function ripple(x, y, r0 = 1, speed = 12, life = 1.2, color = '#9fd0e0') {
    ripples.push({ x, y, r: r0, speed, life, max: life, color });
    if (ripples.length > 24) ripples.shift();
  }

  function splash(x, y, n = 10, force = 1) {
    parts.burst(n, () => ({
      x: x + fxRand(-2, 2),
      y,
      vx: fxRand(-28, 28) * force,
      vy: -fxRand(30, 70) * force,
      g: 220,
      life: fxRand(0.4, 0.8),
      size: fxRand() < 0.3 ? 2 : 1,
      color: fxRand() < 0.5 ? '#e8fbff' : '#8fd0e8',
      onUpdate(p) {
        if (p.vy > 0 && p.y > y + 1) p.life = 0;
      },
    }));
  }

  mg.setStatus('CAST YOUR LINE');

  // ───────────── input
  function press() {
    holding = true;
    if (phase === 'aim') {
      setPhase('charge');
      power = 0;
      powerDir = 1;
      sfx('ui_click');
    } else if (phase === 'wait' || phase === 'flying') {
      if (phase === 'wait' && spookT <= 0) {
        // too early — the fish gets spooked
        waitTime += 1.2;
        spookT = 0.6;
        bob.dip = 1;
        ripple(bob.x, bob.y, 2, 16, 0.8);
        floatText(parts, 'TOO EARLY!', bob.x, bob.y - 12, '#ffb000');
        sfx('ui_error');
      }
    } else if (phase === 'bite') {
      hook();
    } else if (phase === 'reel') {
      setReel(true);
    }
  }

  function release() {
    holding = false;
    if (phase === 'charge') cast();
    else if (phase === 'reel') setReel(false);
  }

  mg.onKeyDown = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!e.repeat) press();
      return true;
    }
    return false;
  };
  mg.onKeyUp = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      release();
      return true;
    }
    return false;
  };
  mg.onPointerDown = () => press();
  mg.onPointerUp = () => release();
  mg.onBlur = () => release();
  mg.onFinish = () => setReel(false);
  mg.onDestroy = () => setReel(false);

  // ───────────── phase transitions
  function cast() {
    perfect = power > 0.9;
    const p = power;
    bob.sx = rodTip().x;
    bob.sy = rodTip().y;
    bob.tx = Math.round(lerp(88, 142, p) + fxRand(-3, 3));
    bob.ty = Math.round(lerp(114, 62, p));
    flightDur = 0.55 + 0.35 * p;
    setPhase('flying');
    sfx('fish_cast');
    mg.setHelp(HELP_WAIT);
    mg.setStatus('...', 'dim');
    if (perfect) {
      floatText(parts, 'PERFECT CAST!', 80, 40, '#ffb000', { life: 1.2 });
      mg.flash('#ffb000', 0.18);
    }
  }

  function land() {
    bob.x = bob.tx;
    bob.y = bob.ty;
    setPhase('wait');
    sfx('fish_splash');
    splash(bob.x, bob.y, 12);
    ripple(bob.x, bob.y, 1, 14, 1.4);
    ripple(bob.x, bob.y, 1, 8, 1.1);
    // 2..7 s, a great cast shaves a little off the long end
    waitTime = 2 + rng() * 5 * (1 - 0.3 * power);
    nibbles = [];
    const n = rint(rng, 0, 2);
    for (let i = 0; i < n; i++) {
      const nt = rrange(rng, 0.8, Math.max(0.9, waitTime - 0.6));
      nibbles.push(nt);
    }
    mg.setStatus('WAITING...', 'dim');
  }

  function bite() {
    setPhase('bite');
    sfx('fish_bite');
    mg.shake(4);
    mg.setStatus('!!! BITE !!!', 'bad');
    splash(bob.x, bob.y, 14, 1.2);
    ripple(bob.x, bob.y, 2, 20, 1.2, '#ffffff');
    ripple(bob.x, bob.y, 1, 12, 1.0);
  }

  function hook() {
    setPhase('hooked');
    sfx('ui_confirm');
    mg.flash('#ffb000', 0.3);
    mg.shake(3);
    mg.setHelp(HELP_REEL);
    mg.setStatus(`HOOKED! ${fish.rarity.toUpperCase()}`, 'warn');
    splash(bob.x, bob.y, 16, 1.4);
  }

  function startReel() {
    setPhase('reel');
    zone.y = BAR.h - ZONE_H;
    zone.v = 0;
    fishPos.y = BAR.h * 0.45;
    fishPos.v = 0;
    fishPos.target = BAR.h * 0.4;
    fishPos.t = 0.5;
    progress = 0.3;
    if (holding) setReel(true);
  }

  function lose(reason) {
    lostReason = reason;
    setReel(false);
    setPhase('lost');
    sfx('ui_error');
    mg.flash('#ff2020', 0.35);
    mg.shake(6);
    mg.glitch(0.2);
    mg.setStatus(reason === 'escaped' ? 'IT GOT AWAY...' : 'LINE SNAPPED!', 'bad');
    splash(bob.x, bob.y, 10);
    mg.finishAfter({ success: false, cancelled: false, fishId: fish.id, fishName: fish.name, rarity: fish.rarity, reason }, 1.9);
  }

  function caught() {
    setReel(false);
    setPhase('caught');
    art = catchArt(fish);
    sfx('fish_caught');
    mg.flash('#ffffff', 0.55);
    mg.shake(fish.rarity === 'legendary' ? 9 : 4);
    if (fish.rarity === 'legendary' || fish.rarity === 'epic') mg.glitch(0.25);
    mg.setStatus(`CAUGHT: ${fish.name.toUpperCase()}`, 'good');
    splash(bob.x, bob.y, 22, 1.6);
    const cols = fish.rarity === 'common' ? ['#ffffff', '#d6e2e0'] : ['#ffffff', rarityCol, '#ffe066'];
    sparkBurst(parts, 78, 60, fish.rarity === 'legendary' ? 50 : 26, cols, 90);
    mg.finishAfter({ success: true, cancelled: false, fishId: fish.id, fishName: fish.name, rarity: fish.rarity }, 2.8, 0.6);
  }

  // ───────────── helpers
  function rodTip() {
    let bend = 0;
    let dx = 0;
    let dy = 0;
    if (phase === 'charge') {
      dx = -power * 10;
      dy = power * 4;
    } else if (phase === 'reel' || phase === 'hooked') {
      const tx = thrash.x - ROD_TIP0.x;
      const ty = thrash.y - ROD_TIP0.y;
      const len = Math.hypot(tx, ty) || 1;
      bend = phase === 'hooked' ? 9 : 5 + (inZone ? 2 : 7) + Math.abs(fishPos.v) * 0.02;
      dx = (tx / len) * bend;
      dy = (ty / len) * bend;
    } else if (phase === 'bite') {
      dx = 3;
      dy = 5 + Math.sin(t * 40) * 1.5;
    }
    return { x: ROD_TIP0.x + dx, y: ROD_TIP0.y + dy };
  }

  function retargetFish() {
    const range = BAR.h * lerp(0.28, 0.7, D);
    let tgt = fishPos.y + (rng() * 2 - 1) * range;
    if (STYLE === 'sinker') tgt += BAR.h * 0.14;
    if (STYLE === 'floater') tgt -= BAR.h * 0.14;
    fishPos.target = clamp(tgt, 5, BAR.h - 5);
    fishPos.t = rrange(rng, lerp(0.9, 0.45, D), lerp(1.9, 1.1, D)) * (STYLE === 'smooth' ? 1.4 : 1);
    const dartChance = STYLE === 'dart' ? lerp(0.35, 0.6, D) : lerp(0.04, 0.28, D);
    if (rng() < dartChance) {
      fishPos.v += Math.sign(fishPos.target - fishPos.y || 1) * lerp(70, 160, D);
      mg.shake(1.5);
      splash(thrash.x, thrash.y, 6, 0.8);
    }
  }

  // ───────────── frame
  mg.onFrame = (dt) => {
    t += dt;
    phaseT += dt;
    spookT = Math.max(0, spookT - dt);
    bob.dip = Math.max(0, bob.dip - dt * 4);

    if (phase === 'charge') {
      power += powerDir * dt * 1.25;
      if (power >= 1) {
        power = 1;
        powerDir = -1;
      } else if (power <= 0) {
        power = 0;
        powerDir = 1;
      }
      mg.setStatus(`POWER ${Math.round(power * 100)}%`, power > 0.9 ? 'warn' : undefined);
    } else if (phase === 'flying') {
      const u = clamp01(phaseT / flightDur);
      bob.x = lerp(bob.sx, bob.tx, u);
      bob.y = lerp(bob.sy, bob.ty, u) - Math.sin(u * Math.PI) * (26 + 22 * power);
      if (u >= 1) land();
    } else if (phase === 'wait') {
      for (let i = nibbles.length - 1; i >= 0; i--) {
        if (phaseT >= nibbles[i]) {
          nibbles.splice(i, 1);
          bob.dip = 1;
          ripple(bob.x, bob.y, 1, 10, 0.8);
        }
      }
      if (mod(phaseT, 1.3) < dt) ripple(bob.x, bob.y, 2, 6, 1.1, '#5f8ea8');
      if (phaseT >= waitTime) bite();
    } else if (phase === 'bite') {
      if (phaseT > BITE_WINDOW) lose('escaped');
    } else if (phase === 'hooked') {
      thrash.x = bob.x;
      thrash.y = bob.y;
      if (phaseT > 0.45) startReel();
    } else if (phase === 'reel') {
      updateReel(dt);
    }

    if (reelOn) reelAngle += dt * 22;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.life -= dt;
      r.r += r.speed * dt;
      if (r.life <= 0) ripples.splice(i, 1);
    }
    parts.update(dt);
    render();
  };

  function updateReel(dt) {
    // player's catch zone
    zone.v += (holding ? -ZONE_UP : ZONE_G) * dt;
    zone.v = clamp(zone.v, -175, 200);
    zone.y += zone.v * dt;
    const maxY = BAR.h - ZONE_H;
    if (zone.y > maxY) {
      zone.y = maxY;
      zone.v = zone.v > 60 ? -zone.v * 0.32 : 0;
    }
    if (zone.y < 0) {
      zone.y = 0;
      zone.v = Math.max(0, zone.v);
    }
    // the fish
    fishPos.t -= dt;
    if (fishPos.t <= 0) retargetFish();
    const stiff = STYLE === 'smooth' ? lerp(8, 16, D) : lerp(11, 21, D);
    const damp = lerp(4.6, 3.3, D);
    fishPos.v += ((fishPos.target - fishPos.y) * stiff - fishPos.v * damp) * dt;
    fishPos.y += fishPos.v * dt + (Math.random() * 2 - 1) * lerp(0.2, 1.4, D);
    if (fishPos.y < 4) {
      fishPos.y = 4;
      fishPos.v = Math.abs(fishPos.v) * 0.3;
    }
    if (fishPos.y > BAR.h - 4) {
      fishPos.y = BAR.h - 4;
      fishPos.v = -Math.abs(fishPos.v) * 0.3;
    }
    const was = inZone;
    inZone = fishPos.y >= zone.y - 1 && fishPos.y <= zone.y + ZONE_H + 1;
    if (inZone && !was) sfx('ui_click');
    progress += (inZone ? FILL : -DRAIN) * dt;
    // thrash point on the water
    const n = fishPos.y / BAR.h;
    thrash.x = bob.x + Math.sin(t * 1.7) * 9 + (n - 0.5) * 22;
    thrash.y = bob.y + Math.sin(t * 2.3) * 2;
    thrashRip -= dt;
    if (thrashRip <= 0) {
      thrashRip = 0.35;
      ripple(thrash.x, thrash.y, 1, 10, 0.6);
    }
    if (Math.random() < dt * (2 + Math.abs(fishPos.v) * 0.05)) {
      splash(thrash.x, thrash.y, 3 + ((Math.abs(fishPos.v) * 0.04) | 0), 0.6);
      ripple(thrash.x, thrash.y, 1, 12, 0.7);
    }
    if (progress >= 1) {
      progress = 1;
      caught();
    } else if (progress <= 0) {
      progress = 0;
      lose('snapped');
    }
  }

  // ───────────── render
  function drawShimmer() {
    for (let i = 0; i < 46; i++) {
      const h = ihash(i * 41 + 3);
      const depth = ((h >>> 4) % 100) / 100;
      const y = Math.round(HORIZON + 3 + depth * depth * (H - HORIZON - 6));
      const len = 2 + Math.round(depth * 8);
      const x = Math.round(mod((h % W) + t * (4 + depth * 10) * (h & 1 ? 1 : -1), W + 20) - 10);
      const a = (Math.sin(t * 2 + i) + 1) / 2;
      ctx.fillStyle = a > 0.55 ? '#3e7896' : '#2a5570';
      ctx.fillRect(x, y, len, 1);
    }
    // moon reflection
    for (let y = HORIZON + 2; y < 118; y += 2) {
      const hh = ihash(y * 7 + Math.floor(t * 3 + y * 0.05));
      if (hh % 3 === 0) continue;
      const w = 1 + Math.round((y - HORIZON) * 0.07) + (hh % 3);
      const x = 34 + Math.round(Math.sin(t * 1.5 + y * 0.3) * 2 + ((hh >>> 4) % 5) - 2) - (w >> 1);
      ctx.globalAlpha = 0.35 + ((hh >>> 8) % 5) * 0.12;
      ctx.fillStyle = (hh >>> 3) % 3 ? '#d8d0a0' : '#8a8860';
      ctx.fillRect(x, y, Math.max(1, w), 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawRod(tip) {
    const ctrl = { x: lerp(ROD_BASE.x, ROD_TIP0.x, 0.55) - 2, y: lerp(ROD_BASE.y, ROD_TIP0.y, 0.55) - 4 };
    const pts = bezierPoints(ROD_BASE.x, ROD_BASE.y, ctrl.x, ctrl.y, tip.x, tip.y, 1);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      const u = i / n;
      const rx = Math.round(x);
      const ry = Math.round(y);
      if (u < 0.27) {
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(rx - 1, ry - 1, 3, 3);
        ctx.fillStyle = '#b88a58';
        ctx.fillRect(rx - 1, ry - 1, 1, 1);
      } else {
        ctx.fillStyle = '#1e140a';
        ctx.fillRect(rx, ry, 2, 2);
        ctx.fillStyle = u > 0.9 ? '#e8e0d0' : '#9a6a3a';
        ctx.fillRect(rx, ry, 1, 1);
      }
    }
    // reel
    const [qx, qy] = pts[Math.floor(n * 0.2)];
    const rx = Math.round(qx) + 3;
    const ry = Math.round(qy) - 1;
    ctx.fillStyle = '#20262a';
    ctx.fillRect(rx - 3, ry - 3, 7, 7);
    ctx.fillStyle = '#9aa4ac';
    ctx.fillRect(rx - 2, ry - 2, 5, 5);
    ctx.fillStyle = '#20262a';
    const hx = Math.round(Math.cos(reelAngle) * 2);
    const hy = Math.round(Math.sin(reelAngle) * 2);
    ctx.fillRect(rx + hx, ry + hy, 1, 1);
    ctx.fillRect(rx, ry, 1, 1);
    ctx.fillStyle = '#e8c060';
    ctx.fillRect(rx + hx * 2, ry + hy * 2, 1, 1);
  }

  function drawLine(tip, ex, ey, slack) {
    const cx = (tip.x + ex) / 2;
    const cy = Math.max(tip.y, ey) + slack;
    const pts = bezierPoints(tip.x, tip.y, cx, cy, ex, ey, 1.4);
    ctx.fillStyle = '#cfe8e0';
    ctx.globalAlpha = 0.85;
    for (const [x, y] of pts) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.globalAlpha = 1;
  }

  function drawBobber(x, y, sub) {
    const sx = Math.round(x) - 2;
    const sy = Math.round(y) - BOBBER_WATERLINE + Math.round(sub);
    const water = Math.round(y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, water + 1);
    ctx.clip();
    drawSprite(ctx, BOBBER, sx, sy);
    ctx.restore();
    // refracted underwater part
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, water + 1, W, H);
    ctx.clip();
    drawSprite(ctx, BOBBER, sx, sy + 1, { alpha: 0.3 });
    ctx.restore();
    // glow stick tip
    if (sub < 5) {
      ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.1;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(sx + 1, sy - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  function drawRipples() {
    for (const r of ripples) {
      const a = clamp01(r.life / r.max);
      ctx.globalAlpha = a * 0.9;
      pxEllipse(ctx, r.x, r.y, r.r, Math.max(1, r.r * 0.32), r.color);
    }
    ctx.globalAlpha = 1;
  }

  function drawPowerMeter() {
    bevel(ctx, BAR.x - 2, BAR.y - 2, BAR.w + 4, BAR.h + 4, '#0b1410', '#3a5a44', '#020604');
    ctx.fillStyle = '#04100a';
    ctx.fillRect(BAR.x, BAR.y, BAR.w, BAR.h);
    const fh = Math.round(power * BAR.h);
    for (let y = 0; y < fh; y++) {
      const v = y / BAR.h;
      ctx.fillStyle = v > 0.9 ? (Math.floor(t * 12) % 2 ? '#ffffff' : '#ffb000') : v > 0.6 ? '#ffb000' : v > 0.3 ? '#9dff4a' : '#39ff6a';
      ctx.fillRect(BAR.x + 1, BAR.y + BAR.h - 1 - y, BAR.w - 2, 1);
    }
    // perfect marker
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(BAR.x - 3, BAR.y + Math.round(BAR.h * 0.1), 2, 1);
    ctx.fillRect(BAR.x + BAR.w + 1, BAR.y + Math.round(BAR.h * 0.1), 2, 1);
    for (let i = 1; i < 10; i++) {
      ctx.fillStyle = '#1c3a26';
      ctx.fillRect(BAR.x, BAR.y + Math.round((BAR.h * i) / 10), 3, 1);
    }
    drawText(ctx, 'PWR', BAR.x + BAR.w / 2, BAR.y + BAR.h + 4, { align: 'center', color: '#39ff6a' });
  }

  function drawReelBar() {
    const shakeX = inZone ? 0 : Math.round(Math.sin(t * 60) * (Math.abs(fishPos.v) > 60 ? 1 : 0));
    const bx = BAR.x + shakeX;
    bevel(ctx, bx - 2, BAR.y - 2, BAR.w + 4, BAR.h + 4, '#0b1410', '#3a5a44', '#020604');
    // water column
    for (let y = 0; y < BAR.h; y++) {
      ctx.fillStyle = mixColor('#0d3348', '#04111a', y / BAR.h);
      ctx.fillRect(bx, BAR.y + y, BAR.w, 1);
    }
    for (let i = 0; i < 6; i++) {
      const h = ihash(i * 19 + 1);
      const by = BAR.y + BAR.h - mod(t * (10 + (h % 12)) + (h % BAR.h), BAR.h);
      ctx.fillStyle = '#3a7a9a';
      ctx.fillRect(bx + 2 + (h % (BAR.w - 4)), Math.round(by), 1, 1);
    }
    // catch zone
    const zy = Math.round(BAR.y + zone.y);
    const pulse = inZone ? (Math.sin(t * 16) + 1) / 2 : 0;
    ctx.globalAlpha = inZone ? 0.55 + pulse * 0.2 : 0.38;
    ctx.fillStyle = inZone ? '#39ff6a' : '#1c9a42';
    ctx.fillRect(bx + 1, zy, BAR.w - 2, ZONE_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = inZone ? '#d8ffe0' : '#39ff6a';
    ctx.fillRect(bx + 1, zy, BAR.w - 2, 1);
    ctx.fillRect(bx + 1, zy + ZONE_H - 1, BAR.w - 2, 1);
    ctx.fillRect(bx + 1, zy, 1, ZONE_H);
    ctx.fillRect(bx + BAR.w - 2, zy, 1, ZONE_H);
    // fish icon
    const fy = Math.round(BAR.y + fishPos.y);
    const flip = fishPos.v < 0 ? false : true;
    const iy = fy - Math.floor(icon.h / 2);
    drawSprite(ctx, icon, bx + Math.round((BAR.w - icon.w) / 2), iy, { flipX: flip });
    // rarity brackets
    ctx.fillStyle = inZone ? rarityCol : Math.floor(t * 8) % 2 ? '#ff4040' : rarityCol;
    ctx.fillRect(bx - 4, fy - 2, 1, 5);
    ctx.fillRect(bx - 4, fy - 2, 2, 1);
    ctx.fillRect(bx - 4, fy + 2, 2, 1);
    // progress meter
    bevel(ctx, METER.x - 1, METER.y - 1, METER.w + 2, METER.h + 2, '#050b08', '#3a5a44', '#020604', true);
    const ph = Math.round(progress * (METER.h - 2));
    const low = progress < 0.22;
    const mcol = low ? (Math.floor(t * 10) % 2 ? '#ff3030' : '#801010') : progress < 0.6 ? '#ffb000' : '#39ff6a';
    ctx.fillStyle = mcol;
    ctx.fillRect(METER.x + 1, METER.y + METER.h - 1 - ph, METER.w - 2, ph);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(METER.x + 1, METER.y + METER.h - 1 - ph, 1, ph);
    for (let i = 1; i < 4; i++) {
      ctx.fillStyle = '#020604';
      ctx.fillRect(METER.x, METER.y + Math.round((METER.h * i) / 4), METER.w, 1);
    }
    // reel wheel under the bar
    const wx = BAR.x + BAR.w / 2;
    const wy = BAR.y + BAR.h + 7;
    ctx.fillStyle = '#1a2420';
    ctx.fillRect(Math.round(wx) - 4, wy - 4, 9, 9);
    ctx.fillStyle = '#7a8a90';
    ctx.fillRect(Math.round(wx) - 3, wy - 3, 7, 7);
    ctx.fillStyle = '#e8c060';
    ctx.fillRect(Math.round(wx + Math.cos(reelAngle) * 2.5), Math.round(wy + Math.sin(reelAngle) * 2.5), 1, 1);
    ctx.fillStyle = '#1a2420';
    ctx.fillRect(Math.round(wx), wy, 1, 1);
  }

  function drawThrash() {
    const x = Math.round(thrash.x);
    const y = Math.round(thrash.y);
    // dark body just under the surface + a fin slicing the water
    drawSprite(ctx, shadowSpr, x - 6, y + 1, { alpha: 0.55, flipX: fishPos.v > 0 });
    const fin = Math.floor(t * 10) % 2;
    ctx.fillStyle = '#0a1a24';
    ctx.fillRect(x - 1, y - 2 - fin, 2, 2 + fin);
    ctx.fillStyle = '#e8fbff';
    const fx = Math.floor(t * 14) % 3;
    ctx.fillRect(x - 4 + fx, y, 2, 1);
    ctx.fillRect(x + 3 - fx, y, 2, 1);
  }

  function drawShadowFish() {
    const k = clamp01(phaseT / Math.max(0.1, waitTime));
    const rad = lerp(34, 5, k * k) + (spookT > 0 ? 25 * spookT : 0);
    const a = t * lerp(0.6, 1.4, k);
    const x = bob.x + Math.cos(a) * rad;
    const y = bob.y + 6 + Math.sin(a) * rad * 0.3;
    const flip = Math.sin(a) > 0;
    drawSprite(ctx, shadowSpr, x - 6, y - 3, { alpha: 0.5, flipX: flip });
  }

  function drawCard() {
    const u = clamp01(phaseT / 0.35);
    const cw = 118;
    const chh = 86;
    const cx = 18;
    const cy = Math.round(lerp(H, 22, 1 - Math.pow(1 - u, 3)));
    // rays for rare+
    if (fish.rarity !== 'common' && fish.rarity !== 'uncommon') {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = rarityCol;
      const ox = cx + cw / 2;
      const oy = cy + 44;
      for (let i = 0; i < 12; i++) {
        const a0 = t * 0.8 + (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a0) * 140, oy + Math.sin(a0) * 140);
        ctx.lineTo(ox + Math.cos(a0 + 0.2) * 140, oy + Math.sin(a0 + 0.2) * 140);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    const border = fish.rarity === 'legendary' ? hsl(t * 240, 100, 60) : rarityCol;
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - 2, cy - 2, cw + 4, chh + 4);
    ctx.fillStyle = border;
    ctx.fillRect(cx - 1, cy - 1, cw + 2, chh + 2);
    ctx.fillStyle = '#06120a';
    ctx.fillRect(cx, cy, cw, chh);
    ctx.fillStyle = '#0b2014';
    for (let y = cy + 1; y < cy + chh; y += 2) ctx.fillRect(cx, y, cw, 1);
    drawText(ctx, 'CAUGHT!', cx + cw / 2, cy + 5, {
      scale: 2,
      align: 'center',
      shadow: '#003010',
      color: '#39ff6a',
      wave: { amp: 1, t, speed: 8 },
    });
    if (art) {
      const bobY = Math.round(Math.sin(t * 3) * 2);
      const sw = art.spr.w * art.scale;
      const sh = art.spr.h * art.scale;
      drawSprite(ctx, art.spr, cx + (cw - sw) / 2, cy + 44 - sh / 2 + bobY, { scale: art.scale });
    }
    const name = fish.name.toUpperCase();
    const ns = textWidth(name, 2) <= cw - 6 ? 2 : 1;
    drawTextOutlined(ctx, name, cx + cw / 2, cy + chh - (ns === 2 ? 23 : 19), { scale: ns, align: 'center', color: rarityCol });
    const tag = `[${fish.rarity.toUpperCase()}]`;
    drawText(ctx, tag, cx + cw / 2, cy + chh - 9, {
      align: 'center',
      color: rarityCol,
      charColor: fish.rarity === 'legendary' ? (i) => hsl(t * 300 + i * 30, 100, 62) : null,
    });
    // twinkles
    if (Math.random() < 0.3 && fish.rarity !== 'common') {
      parts.spawn({ x: cx + fxRand(4, cw - 4), y: cy + fxRand(20, 64), life: 0.4, size: 1, color: '#ffffff' });
    }
  }

  function render() {
    ctx.drawImage(bg, 0, 0);
    // blinking antenna light on the far facility
    if (mod(t, 1.6) < 0.2) {
      ctx.fillStyle = '#ff3030';
      ctx.fillRect(127, HORIZON - 21, 1, 1);
    }
    drawShimmer();
    drawRipples();

    const tip = rodTip();
    const inWater = phase !== 'aim' && phase !== 'charge' && phase !== 'flying';

    if (phase === 'wait') drawShadowFish();

    // line + bobber
    if (phase === 'aim' || phase === 'charge') {
      const sway = Math.sin(t * 2.2) * 2;
      const bx = tip.x + 2 + sway;
      const by = tip.y + 16;
      drawLine(tip, bx, by - 4, 0);
      drawSprite(ctx, BOBBER, bx - 2, by - 4);
    } else if (phase === 'flying') {
      drawLine(tip, bob.x, bob.y - 3, 4);
      drawSprite(ctx, BOBBER, bob.x - 2, bob.y - 4);
    } else if (phase === 'wait') {
      const bobY = Math.sin(t * 3) * 0.8 + bob.dip * 2;
      drawLine(tip, bob.x, bob.y - 3, 10);
      drawBobber(bob.x, bob.y, bobY);
    } else if (phase === 'bite') {
      const jerk = Math.sin(t * 50) * 1.2;
      drawLine(tip, bob.x + jerk, bob.y, 3);
      drawBobber(bob.x + jerk, bob.y, Math.sin(t * 30) > 0 ? 4 : 3);
      const hop = Math.abs(Math.sin(t * 14)) * 4;
      const blink = Math.floor(t * 12) % 2;
      drawTextOutlined(ctx, '!', bob.x, bob.y - 18 - hop, { scale: 3, align: 'center', color: blink ? '#ffb000' : '#ffffff' });
      // countdown ring
      const left = 1 - clamp01(phaseT / BITE_WINDOW);
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(Math.round(bob.x - 8), Math.round(bob.y + 6), Math.round(16 * left), 1);
    } else if (phase === 'hooked' || phase === 'reel') {
      drawThrash();
      drawLine(tip, thrash.x, thrash.y, 0);
      if (phase === 'hooked') {
        const s = 1 + Math.floor(clamp01(1 - phaseT / 0.3) * 2);
        drawTextOutlined(ctx, 'HOOKED!', 78, 34, { scale: s + 1, align: 'center', color: '#ffb000' });
      }
    } else if (phase === 'lost') {
      // snapped line drifts
      const drift = phaseT * 8;
      drawLine(tip, tip.x + 8, tip.y + 20 + drift, 2);
      if (lostReason === 'escaped') drawBobber(bob.x + drift, bob.y, Math.sin(t * 3));
    }
    drawRod(tip);

    if (phase === 'aim' || phase === 'charge') drawPowerMeter();
    if (phase === 'reel' || phase === 'hooked') drawReelBar();

    parts.draw(ctx);

    // prompts
    if (phase === 'aim' && t % 1 < 0.7) drawTextOutlined(ctx, 'HOLD SPACE TO CAST', 92, 128, { align: 'center', color: '#ffffff' });
    if (phase === 'charge') drawTextOutlined(ctx, 'RELEASE TO CAST!', 92, 128, { align: 'center', color: power > 0.9 ? '#ffb000' : '#ffffff' });
    if (phase === 'wait') {
      const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
      drawTextOutlined(ctx, `WAITING${dots}`, 80, 128, { align: 'center', color: '#8fb8c8' });
    }
    if (phase === 'bite') drawTextOutlined(ctx, 'SPACE! NOW!', 80, 128, { scale: 1, align: 'center', color: Math.floor(t * 10) % 2 ? '#ffffff' : '#ffb000' });
    if (phase === 'reel') {
      drawTextOutlined(ctx, inZone ? 'REELING...' : 'KEEP IT IN THE ZONE!', 80, 128, { align: 'center', color: inZone ? '#39ff6a' : '#ffb000' });
    }
    if (phase === 'lost') {
      const msg = lostReason === 'escaped' ? 'IT GOT AWAY...' : 'THE LINE SNAPPED!';
      drawTextOutlined(ctx, msg, 80, 58, { scale: 2, align: 'center', color: '#ff4040' });
      drawTextOutlined(ctx, 'THE PHISH MOCKS YOU', 80, 76, { align: 'center', color: '#8fb8c8' });
    }
    if (phase === 'caught') drawCard();

    // subtle scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    if (inWater && phase === 'reel' && !inZone && progress < 0.22) {
      ctx.fillStyle = `rgba(255,0,0,${0.06 + Math.sin(t * 12) * 0.04})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return mg.api;
}
