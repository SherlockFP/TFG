/**
 * VAULT KEYPAD — Simon-says memory.
 *
 * createSafe(opts) -> { el, update, destroy }
 *   result: { success, cancelled, rounds (completed rounds), reason? ('wrong' | 'timeout') }
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
  clamp01,
  lerp,
  mod,
  ihash,
  fxRand,
  rint,
  mixColor,
  easeOutCubic,
  easeInCubic,
  digitFromEvent,
  TAU,
} from './common.js';

const W = 192;
const H = 144;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const KX = 16;
const KY = 53;
const KW = 20;
const KH = 17;
const KG = 3;
const LCD = { x: 14, y: 15, w: 70, h: 21 };
const TIMER = { x: 14, y: 39, w: 70, h: 3 };
const DOOR = { cx: 145, cy: 76, r: 41 };
const DOOR_SIZE = 92;
const ROUNDS = 3;

function keyRect(i) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return { x: KX + col * (KW + KG), y: KY + row * (KH + KG), w: KW, h: KH };
}

// ───────────────────────────────────────────── static art ──
function buildWall() {
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#151b1f';
  ctx.fillRect(0, 0, W, H);
  // brushed noise
  for (let i = 0; i < 900; i++) {
    const h = ihash(i * 7 + 1);
    ctx.fillStyle = h % 2 ? '#191f24' : '#12171b';
    ctx.fillRect(h % W, (h >>> 8) % H, 2 + ((h >>> 3) % 4), 1);
  }
  // panel seams + rivets
  for (let x = 95; x < W; x += 32) {
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(x, 0, 1, H);
    ctx.fillStyle = '#232b31';
    ctx.fillRect(x + 1, 0, 1, H);
    for (let y = 6; y < H; y += 16) {
      ctx.fillStyle = '#39444c';
      ctx.fillRect(x - 3, y, 2, 2);
      ctx.fillStyle = '#0a0d10';
      ctx.fillRect(x - 2, y + 1, 1, 1);
    }
  }
  // hazard stripes at the bottom
  for (let y = 136; y < H; y++) {
    for (let x = 92; x < W; x++) {
      ctx.fillStyle = mod(x + y, 10) < 5 ? '#d8a200' : '#141414';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(92, 135, W - 92, 1);
  // door jamb
  const { cx, cy } = DOOR;
  for (let y = -47; y <= 47; y++) {
    for (let x = -47; x <= 47; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > 41.5 && d <= 46.5) {
        const lit = (-x - y) / (d || 1);
        ctx.fillStyle = d > 45.5 ? '#050607' : lit > 0.5 ? '#4a555c' : lit > -0.3 ? '#2b3338' : '#1a2024';
        ctx.fillRect(cx + x, cy + y, 1, 1);
      } else if (d <= 41.5) {
        ctx.fillStyle = '#030404';
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
  // plate
  bevel(ctx, cx - 22, 18, 44, 11, '#8a7a4a', '#c8b47a', '#3a3018');
  drawText(ctx, 'VAULT 07', cx, 21, { align: 'center', color: '#2a220e' });
  drawText(ctx, 'SECURE STORAGE', cx, 126, { align: 'center', color: '#5a6a72' });
  // keypad housing
  bevel(ctx, 8, 5, 82, 134, '#2a3236', '#4d5a61', '#0b0f11');
  bevel(ctx, 10, 7, 78, 130, '#20272b', '#141a1d', '#3a454b', true);
  drawText(ctx, 'PASSW0RD-3000', 49, 9, { align: 'center', color: '#6d7d85' });
  // screws
  for (const [x, y] of [[11, 7], [85, 7], [11, 134], [85, 134]]) {
    ctx.fillStyle = '#5a666c';
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#101416';
    ctx.fillRect(x, y + 1, 2, 1);
  }
  return canvas;
}

function buildDoorFace() {
  const { canvas, ctx } = makeCanvas(DOOR_SIZE, DOOR_SIZE);
  const c = DOOR_SIZE / 2;
  const STEEL = ['#2e373d', '#3b464d', '#4a565e', '#5c6a72', '#717f88', '#8a98a0'];
  for (let y = 0; y < DOOR_SIZE; y++) {
    for (let x = 0; x < DOOR_SIZE; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > DOOR.r) continue;
      const lit = (-dx - dy) / (d || 1);
      let v = 0.5 + lit * 0.28 * (d / DOOR.r) + Math.sin(d * 1.3) * 0.05;
      if (Math.abs(d - 34) < 0.8 || Math.abs(d - 23) < 0.8) v -= 0.35;
      if (Math.abs(d - 35) < 0.6 || Math.abs(d - 24) < 0.6) v += 0.2;
      if (d > DOOR.r - 1.2) v -= 0.3;
      const idx = Math.max(0, Math.min(STEEL.length - 1, Math.floor(v * STEEL.length)));
      ctx.fillStyle = STEEL[idx];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // rivets ring
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const x = Math.round(c + Math.cos(a) * 29);
    const y = Math.round(c + Math.sin(a) * 29);
    ctx.fillStyle = '#a8b4ba';
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = '#1a2024';
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  // kefal emblem
  ctx.fillStyle = '#2a3238';
  ctx.fillRect(c - 7, c + 14, 11, 4);
  ctx.fillRect(c + 4, c + 13, 3, 6);
  ctx.fillStyle = '#9aa6ac';
  ctx.fillRect(c - 3, c + 15, 1, 1);
  return canvas;
}

// ───────────────────────────────────────────── the game ──
export function createSafe(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'safe',
    title: 'VAULT KEYPAD',
    tag: 'SECURITY',
    help: '[0-9] / [CLICK] enter code   [ESC] quit',
    width: W,
    height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng;
  const sfx = opts.sfx;
  const D = opts.difficulty;

  const wall = buildWall();
  const doorFace = buildDoorFace();
  const door = makeCanvas(DOOR_SIZE, DOOR_SIZE);
  const parts = createParticles(200);

  // sequence: Simon-style, each round extends the previous one
  const L0 = Math.round(4 + D);
  const L1 = Math.round(6 + 2 * D);
  const lens = [L0, Math.round((L0 + L1) / 2), L1];
  const seq = [];
  for (let i = 0; i < L1; i++) {
    let d = rint(rng, 0, 9);
    if (i > 0 && d === seq[i - 1] && rng() < 0.6) d = (d + 1 + rint(rng, 0, 8)) % 10; // fewer boring repeats
    seq.push(d);
  }
  const ON = lerp(0.55, 0.28, D);
  const GAP = lerp(0.2, 0.1, D);

  let phase = 'intro';
  let phaseT = 0;
  let t = 0;
  let round = 0;
  let roundsDone = 0;
  let input = [];
  let shown = -1;
  let timeLeft = 0;
  let timeMax = 1;
  let hoverKey = -1;
  let alarmOn = false;
  let expectedKey = -1;
  let wheelA = 0;
  let boltOut = 1; // 1 = locked
  let doorOpen = 0;
  let lastTick = 0;
  let lcdFlash = 0;
  const keyLight = new Array(12).fill(0);
  const keyColor = new Array(12).fill('#ffb000');
  const keyPress = new Array(12).fill(0);

  const keyIndex = (label) => KEYS.indexOf(label);
  const beep = (d) => sfx(`keypad_beep_${(d % 3) + 1}`);

  function setPhase(p) {
    phase = p;
    phaseT = 0;
  }

  mg.setStatus('ROUND 1/3');

  function lightKey(i, color, amount = 1) {
    keyLight[i] = amount;
    keyColor[i] = color;
  }

  function pressKey(i) {
    if (i < 0 || phase === 'granted' || phase === 'denied') return;
    keyPress[i] = 0.12;
    const label = KEYS[i];
    if (phase !== 'input') {
      lightKey(i, '#5a6a72', 0.6);
      sfx('ui_click');
      lcdFlash = 0.25;
      return;
    }
    if (label === '*' || label === '#') {
      lightKey(i, '#5a6a72', 0.7);
      sfx('ui_click');
      return;
    }
    const d = Number(label);
    beep(d);
    const expected = seq[input.length];
    if (d !== expected) {
      lightKey(i, '#ff3030', 1);
      fail('wrong', expected);
      return;
    }
    lightKey(i, '#39ff6a', 1);
    input.push(d);
    const r = keyRect(i);
    sparkBurst(parts, r.x + r.w / 2, r.y + r.h / 2, 5, ['#39ff6a', '#b6ffc8'], 30);
    if (input.length >= lens[round]) roundOk();
  }

  function roundOk() {
    roundsDone++;
    setPhase('roundok');
    sfx('ui_confirm');
    mg.flash('#39ff6a', 0.2);
    floatText(parts, 'OK!', LCD.x + LCD.w / 2, LCD.y + 26, '#39ff6a');
    if (roundsDone >= ROUNDS) {
      granted();
    } else {
      mg.setStatus(`ROUND ${roundsDone + 1}/3`, 'good');
    }
  }

  function granted() {
    setPhase('granted');
    mg.setStatus('ACCESS GRANTED', 'good');
    mg.setHelp('[SPACE] continue');
    mg.finishAfter({ success: true, cancelled: false, rounds: ROUNDS }, 2.6, 0.9);
  }

  function fail(reason, expected) {
    setPhase('denied');
    expectedKey = expected === undefined ? -1 : keyIndex(String(expected));
    sfx('ui_error');
    sfx('alarm_loop');
    alarmOn = true;
    mg.shake(7);
    mg.flash('#ff0000', 0.5);
    mg.glitch(0.3);
    mg.setStatus(reason === 'timeout' ? 'TIME OUT - ALARM!' : 'ACCESS DENIED', 'bad');
    mg.setHelp('[SPACE] continue');
    mg.finishAfter({ success: false, cancelled: false, rounds: roundsDone, reason }, 2.4, 0.7);
  }

  // ───────────── input
  mg.onKeyDown = (e) => {
    const d = digitFromEvent(e);
    if (d !== null) {
      if (!e.repeat) pressKey(keyIndex(d));
      return true;
    }
    if (e.key === '*' || e.code === 'NumpadMultiply') {
      if (!e.repeat) pressKey(9);
      return true;
    }
    if (e.key === '#') {
      if (!e.repeat) pressKey(11);
      return true;
    }
    return false;
  };

  function keyAt(x, y) {
    for (let i = 0; i < 12; i++) {
      const r = keyRect(i);
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
    }
    return -1;
  }
  mg.onPointerMove = (x, y) => {
    hoverKey = keyAt(x, y);
    mg.setCursor(hoverKey >= 0 ? 'pointer' : 'default');
  };
  mg.onPointerDown = (x, y) => pressKey(keyAt(x, y));
  mg.onDestroy = () => {
    if (alarmOn) sfx('stop:alarm_loop');
  };

  // ───────────── frame
  mg.onFrame = (dt) => {
    t += dt;
    phaseT += dt;
    lcdFlash = Math.max(0, lcdFlash - dt);
    for (let i = 0; i < 12; i++) {
      keyLight[i] = Math.max(0, keyLight[i] - dt * 3.2);
      keyPress[i] = Math.max(0, keyPress[i] - dt);
    }

    if (phase === 'intro') {
      if (phaseT > (round === 0 ? 1.0 : 0.6)) {
        setPhase('show');
        shown = -1;
        mg.setStatus(`ROUND ${round + 1}/3 - WATCH`, 'warn');
      }
    } else if (phase === 'show') {
      const step = ON + GAP;
      const k = Math.floor(phaseT / step);
      const len = lens[round];
      if (k < len && k !== shown) {
        shown = k;
        const i = keyIndex(String(seq[k]));
        lightKey(i, '#ffb000', 1.25);
        keyPress[i] = ON * 0.6;
        beep(seq[k]);
      }
      if (phaseT >= len * step + 0.15) {
        setPhase('input');
        input = [];
        timeMax = lens[round] * lerp(1.25, 0.75, D) + 2;
        timeLeft = timeMax;
        lastTick = Math.ceil(timeLeft);
        mg.setStatus(`ROUND ${round + 1}/3 - ENTER CODE`);
      }
    } else if (phase === 'input') {
      timeLeft -= dt;
      const sec = Math.ceil(timeLeft);
      if (timeLeft < 3 && sec !== lastTick && sec >= 0) {
        lastTick = sec;
        sfx('ui_click');
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        fail('timeout', seq[input.length]);
      }
    } else if (phase === 'roundok') {
      if (phaseT > 0.85) {
        round++;
        setPhase('intro');
      }
    } else if (phase === 'granted') {
      const T = phaseT;
      wheelA = easeOutCubic(clamp01(T / 1.0)) * TAU * 1.5;
      const prevBolt = boltOut;
      boltOut = 1 - clamp01((T - 0.3) / 0.45);
      for (const th of [0.95, 0.7, 0.45]) {
        if (prevBolt > th && boltOut <= th) {
          sfx('safe_click');
          mg.shake(2);
        }
      }
      const prevOpen = doorOpen;
      doorOpen = easeInCubic(clamp01((T - 1.05) / 0.55));
      if (prevOpen === 0 && doorOpen > 0) {
        sfx('coins');
        mg.flash('#ffd23f', 0.25);
      }
      if (doorOpen > 0.3 && Math.random() < dt * 20) {
        parts.spawn({
          x: DOOR.cx + fxRand(-24, 30),
          y: DOOR.cy + fxRand(-24, 24),
          vy: -fxRand(5, 20),
          life: 0.6,
          color: Math.random() < 0.5 ? '#ffffff' : '#ffe066',
        });
      }
    } else if (phase === 'denied') {
      if (expectedKey >= 0 && Math.floor(phaseT * 6) % 2 === 0) lightKey(expectedKey, '#39ff6a', 0.9);
    }

    parts.update(dt);
    render();
  };

  // ───────────── render
  function drawLCD() {
    const { x, y, w, h } = LCD;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    const bgc = phase === 'denied' ? (Math.floor(t * 6) % 2 ? '#3a0606' : '#200303') : phase === 'granted' ? '#06331a' : '#0b2a14';
    ctx.fillStyle = bgc;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = y + 1; yy < y + h; yy += 2) ctx.fillRect(x, yy, w, 1);
    const cx = x + w / 2;
    if (phase === 'intro') {
      drawText(ctx, `ROUND ${round + 1}`, cx, y + 6, { scale: 2, align: 'center', color: '#39ff6a' });
    } else if (phase === 'show') {
      drawText(ctx, 'WATCH', cx, y + 3, { scale: 2, align: 'center', color: '#ffb000' });
      const len = lens[round];
      const dw = len * 5 - 2;
      for (let i = 0; i < len; i++) {
        ctx.fillStyle = i <= shown ? '#ffb000' : '#3a4a2a';
        ctx.fillRect(Math.round(cx - dw / 2 + i * 5), y + 16, 3, 2);
      }
    } else if (phase === 'input' || phase === 'roundok') {
      const len = lens[round];
      const s = len > 8 ? 1 : 2;
      const adv = 4 * s;
      const tw = len * adv - s;
      let sx = Math.round(cx - tw / 2);
      for (let i = 0; i < len; i++) {
        if (i < input.length) {
          drawText(ctx, String(input[i]), sx + i * adv, y + 6, { scale: s, color: phase === 'roundok' ? '#b6ffc8' : '#39ff6a' });
        } else if (i === input.length && t % 0.6 < 0.35) {
          ctx.fillStyle = '#39ff6a';
          ctx.fillRect(sx + i * adv, y + 6 + 5 * s - s, 3 * s, s);
        } else {
          ctx.fillStyle = '#1c5a2a';
          ctx.fillRect(sx + i * adv, y + 6 + 5 * s - s, 3 * s, s);
        }
      }
    } else if (phase === 'granted') {
      drawText(ctx, 'OPEN', cx, y + 3, { scale: 2, align: 'center', color: '#b6ffc8' });
      drawText(ctx, 'ACCESS GRANTED', cx, y + 15, { align: 'center', color: '#39ff6a' });
    } else if (phase === 'denied') {
      drawText(ctx, 'DENIED', cx, y + 3, { scale: 2, align: 'center', color: '#ff4040' });
      drawText(ctx, 'ALARM TRIGGERED', cx, y + 15, { align: 'center', color: '#ff8080' });
    }
    if (lcdFlash > 0) {
      // 'not now' feedback: amber frame flash
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(x - 1, y - 1, w + 2, 1);
      ctx.fillRect(x - 1, y + h, w + 2, 1);
      ctx.fillRect(x - 1, y - 1, 1, h + 2);
      ctx.fillRect(x + w, y - 1, 1, h + 2);
    }
  }

  function drawTimer() {
    const { x, y, w, h } = TIMER;
    ctx.fillStyle = '#050807';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    let k = 1;
    if (phase === 'input') k = timeLeft / timeMax;
    else if (phase === 'denied') k = 0;
    const fw = Math.round(w * clamp01(k));
    const col = k < 0.25 ? (Math.floor(t * 8) % 2 ? '#ff3030' : '#801010') : k < 0.5 ? '#ffb000' : '#39ff6a';
    ctx.fillStyle = phase === 'input' ? col : '#1c5a2a';
    ctx.fillRect(x, y, fw, h);
  }

  function drawLEDs() {
    drawText(ctx, 'RND', 16, 45, { color: '#6d7d85' });
    for (let i = 0; i < ROUNDS; i++) {
      const x = 32 + i * 12;
      const y = 45;
      let col = '#1a2a1e';
      if (i < roundsDone) col = '#39ff6a';
      else if (i === round && phase !== 'denied' && phase !== 'granted' && Math.floor(t * 3) % 2) col = '#ffb000';
      if (phase === 'denied') col = Math.floor(t * 6) % 2 ? '#ff3030' : '#3a0a0a';
      ctx.fillStyle = '#000';
      ctx.fillRect(x - 1, y - 1, 9, 6);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 7, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, 3, 1);
    }
  }

  function drawKeys() {
    for (let i = 0; i < 12; i++) {
      const r = keyRect(i);
      const lit = Math.min(1, keyLight[i]);
      const down = keyPress[i] > 0 ? 1 : 0;
      const hover = hoverKey === i && phase === 'input';
      ctx.fillStyle = '#05080a';
      ctx.fillRect(r.x, r.y + 1, r.w, r.h);
      if (lit > 0.05) {
        ctx.globalAlpha = lit * 0.35;
        ctx.fillStyle = keyColor[i];
        ctx.fillRect(r.x - 2, r.y - 2 + down, r.w + 4, r.h + 4);
        ctx.globalAlpha = 1;
      }
      const base = lit > 0.05 ? mixColor(hover ? '#3d4a52' : '#2d363c', keyColor[i], lit) : hover ? '#3d4a52' : '#2d363c';
      bevel(ctx, r.x, r.y + down, r.w, r.h - 1, base, mixColor(base, '#ffffff', 0.25), mixColor(base, '#000000', 0.5));
      const lab = KEYS[i];
      const tc = lit > 0.5 ? '#0a0a0a' : '#c8d6d0';
      drawText(ctx, lab, r.x + r.w / 2, r.y + 3 + down, { scale: 2, align: 'center', color: tc });
    }
  }

  function drawDoor() {
    const dc = door.ctx;
    dc.clearRect(0, 0, DOOR_SIZE, DOOR_SIZE);
    dc.drawImage(doorFace, 0, 0);
    const c = DOOR_SIZE / 2;
    // bolts (drawn under the face edge when retracted)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const r0 = lerp(26, 35, boltOut);
      const r1 = r0 + 7;
      for (let rr = r0; rr <= r1; rr += 0.5) {
        const x = Math.round(c + Math.cos(a) * rr);
        const y = Math.round(c + Math.sin(a) * rr);
        dc.fillStyle = rr > r1 - 1 ? '#c8d2d6' : '#8a969c';
        dc.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    // wheel
    dc.fillStyle = '#1a2024';
    for (let k = 0; k < 3; k++) {
      const a = wheelA + (k / 3) * TAU;
      const ex = c + Math.cos(a) * 17;
      const ey = c + Math.sin(a) * 17;
      const bx = c - Math.cos(a) * 17;
      const by = c - Math.sin(a) * 17;
      const n = 30;
      for (let s = 0; s <= n; s++) {
        const x = Math.round(lerp(bx, ex, s / n));
        const y = Math.round(lerp(by, ey, s / n));
        dc.fillStyle = '#1a2024';
        dc.fillRect(x - 1, y - 1, 3, 3);
        dc.fillStyle = '#a8b4ba';
        dc.fillRect(x, y - 1, 1, 1);
      }
      for (const [x, y] of [[ex, ey], [bx, by]]) {
        dc.fillStyle = '#101416';
        dc.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
        dc.fillStyle = '#d0d8dc';
        dc.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        dc.fillStyle = '#ffffff';
        dc.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
      }
    }
    // hub
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const d = x * x + y * y;
        if (d > 36) continue;
        dc.fillStyle = d > 25 ? '#1a2024' : x + y < -2 ? '#c8d2d6' : '#7a868c';
        dc.fillRect(c + x, c + y, 1, 1);
      }
    }
    // status LED on the door
    dc.fillStyle = phase === 'denied' ? (Math.floor(t * 8) % 2 ? '#ff2020' : '#400000') : phase === 'granted' ? '#39ff6a' : '#ffb000';
    dc.fillRect(c - 1, c - 30, 3, 2);

    // interior (visible as the door swings open)
    const { cx, cy } = DOOR;
    if (doorOpen > 0) {
      ctx.fillStyle = '#0a0803';
      for (let y = -40; y <= 40; y++) {
        const hw = Math.floor(Math.sqrt(1640 - y * y));
        ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
      }
      // shelves of gold + a golden kefal idol
      for (let s = 0; s < 3; s++) {
        const sy = cy - 18 + s * 16;
        ctx.fillStyle = '#3a2a14';
        ctx.fillRect(cx - 28, sy + 6, 56, 2);
        for (let b = 0; b < 5; b++) {
          const bx = cx - 26 + b * 11 + (s % 2) * 3;
          ctx.fillStyle = '#7a5208';
          ctx.fillRect(bx, sy, 9, 6);
          ctx.fillStyle = '#ffd23f';
          ctx.fillRect(bx + 1, sy, 7, 4);
          ctx.fillStyle = '#fff3b0';
          ctx.fillRect(bx + 1, sy, 3, 1);
        }
      }
      if (Math.floor(t * 5) % 3 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + 10, cy - 16, 1, 3);
        ctx.fillRect(cx + 9, cy - 15, 3, 1);
      }
    }
    const factor = 1 - doorOpen * 0.86;
    const dw = Math.max(2, Math.round(DOOR_SIZE * factor));
    const hingeX = cx - DOOR_SIZE / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(door.canvas, 0, 0, DOOR_SIZE, DOOR_SIZE, hingeX, cy - DOOR_SIZE / 2, dw, DOOR_SIZE);
    if (doorOpen > 0) {
      // door edge thickness
      ctx.fillStyle = '#20272b';
      ctx.fillRect(hingeX + dw, cy - 34, 3, 68);
    }
    // hinges
    ctx.fillStyle = '#3a454b';
    ctx.fillRect(hingeX - 2, cy - 22, 5, 9);
    ctx.fillRect(hingeX - 2, cy + 13, 5, 9);
    ctx.fillStyle = '#6d7d85';
    ctx.fillRect(hingeX - 2, cy - 22, 5, 1);
    ctx.fillRect(hingeX - 2, cy + 13, 5, 1);
  }

  function drawBeacon() {
    const bx = 184;
    const by = 8;
    const alarm = phase === 'denied';
    const col = alarm ? '#ff2020' : phase === 'granted' ? '#39ff6a' : '#8a6a10';
    if (alarm) {
      // rotating beam sweeping the room
      const a = t * 7;
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ff2020';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a) * 260, by + Math.sin(a) * 260);
      ctx.lineTo(bx + Math.cos(a + 0.35) * 260, by + Math.sin(a + 0.35) * 260);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#20272b';
    ctx.fillRect(bx - 4, by + 3, 9, 3);
    ctx.fillStyle = col;
    ctx.fillRect(bx - 3, by - 2, 7, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(bx - 2, by - 2, 2, 1);
  }

  function render() {
    ctx.drawImage(wall, 0, 0);
    drawDoor();
    drawLCD();
    drawTimer();
    drawLEDs();
    drawKeys();
    drawBeacon();
    parts.draw(ctx);
    if (phase === 'show' && phaseT < 0.5 && round === 0) {
      drawTextOutlined(ctx, 'MEMORIZE!', DOOR.cx, 6, { align: 'center', color: '#ffb000' });
    }
    if (phase === 'denied') {
      ctx.fillStyle = `rgba(255,0,0,${0.1 + Math.max(0, Math.sin(t * 9)) * 0.14})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (phase === 'granted' && doorOpen > 0.6) {
      drawTextOutlined(ctx, 'KA-CHING!', DOOR.cx, 6, { align: 'center', color: '#ffe066' });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }

  return mg.api;
}
