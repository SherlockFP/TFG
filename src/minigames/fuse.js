/**
 * FUSE BOX — drag matching coloured wires across the box before the timer runs out.
 *
 * createFuse(opts) -> { el, update, destroy }
 *   result: { success, cancelled, timeLeft (seconds, 1 decimal), mistakes }
 */
import {
  createMinigame,
  makeCanvas,
  drawText,
  drawTextOutlined,
  spriteFromRows,
  drawSprite,
  bevel,
  bezierPoints,
  createParticles,
  sparkBurst,
  floatText,
  clamp,
  clamp01,
  lerp,
  mod,
  ihash,
  fxRand,
  shuffle,
  digitFromEvent,
} from './common.js';

const W = 192;
const H = 144;
const LX = 30; // left terminal x
const RX = 162; // right terminal x
const TOP = 40;
const BOTTOM = 130;
const HIT = 8;

const WIRES = [
  { name: 'RED', c: '#ff3b3b', d: '#7a1010', sym: ['..#..', '.###.', '#####', '.###.', '..#..'] },
  { name: 'BLUE', c: '#3f8cff', d: '#14307a', sym: ['.###.', '#...#', '#...#', '#...#', '.###.'] },
  { name: 'YELLOW', c: '#ffd23f', d: '#7a5e08', sym: ['..#..', '..#..', '.###.', '.###.', '#####'] },
  { name: 'GREEN', c: '#39ff6a', d: '#10602a', sym: ['#####', '#...#', '#...#', '#...#', '#####'] },
  { name: 'WHITE', c: '#e8eef0', d: '#5a6468', sym: ['..#..', '..#..', '#####', '..#..', '..#..'] },
  { name: 'PINK', c: '#ff5fd2', d: '#6a1654', sym: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'] },
];
const SYMS = WIRES.map((w) => spriteFromRows(w.sym, { '#': '#0a0a0a' }));

function buildBox() {
  const { canvas, ctx } = makeCanvas(W, H);
  // back plate
  ctx.fillStyle = '#1b2125';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) {
    const h = ihash(i * 13 + 5);
    ctx.fillStyle = h % 2 ? '#1f262a' : '#181d21';
    ctx.fillRect(h % W, (h >>> 8) % H, 1, 2 + ((h >>> 4) % 5));
  }
  // grime / scorch marks
  for (let i = 0; i < 5; i++) {
    const h = ihash(i * 71 + 9);
    const cx = 50 + (h % 90);
    const cy = 40 + ((h >>> 7) % 90);
    for (let k = 0; k < 40; k++) {
      const hh = ihash(h + k);
      const r = (hh % 7) + 1;
      const a = ((hh >>> 5) % 628) / 100;
      ctx.fillStyle = '#12161a';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), 1, 1);
    }
  }
  // frame
  bevel(ctx, 0, 0, W, H, 'rgba(0,0,0,0)', '#56636b', '#07090a');
  ctx.fillStyle = '#2d363c';
  ctx.fillRect(1, 1, W - 2, 2);
  ctx.fillRect(1, H - 3, W - 2, 2);
  ctx.fillRect(1, 1, 2, H - 2);
  ctx.fillRect(W - 3, 1, 2, H - 2);
  for (const [x, y] of [[4, 4], [W - 6, 4], [4, H - 6], [W - 6, H - 6]]) {
    ctx.fillStyle = '#7a8890';
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = '#0a0d0f';
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  // hazard header
  for (let y = 4; y < 13; y++) {
    for (let x = 4; x < W - 4; x++) {
      if (x > 52 && x < W - 52) continue;
      ctx.fillStyle = mod(x - y, 8) < 4 ? '#e0a800' : '#121212';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  bevel(ctx, 53, 4, W - 106, 9, '#d8d0b8', '#ffffff', '#6a6450');
  drawText(ctx, 'FUSE BOX 7B', W / 2, 6, { align: 'center', color: '#1a1a1a' });
  // insulator strips for terminals
  bevel(ctx, LX - 7, TOP - 9, 14, BOTTOM - TOP + 18, '#2a2820', '#46423a', '#0c0b08');
  bevel(ctx, RX - 7, TOP - 9, 14, BOTTOM - TOP + 18, '#2a2820', '#46423a', '#0c0b08');
  // warning sticker
  bevel(ctx, W / 2 - 22, H - 12, 44, 8, '#e0a800', '#ffe066', '#6a5000');
  drawText(ctx, '! 240V !', W / 2, H - 10, { align: 'center', color: '#1a1a1a' });
  return canvas;
}

export function createFuse(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'fuse',
    title: 'FUSE BOX',
    tag: 'MAINTENANCE',
    help: '[DRAG] wire to same color   [1-6] then [1-6] keys   [ESC] quit',
    width: W,
    height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng;
  const sfx = opts.sfx;
  const D = opts.difficulty;

  const box = buildBox();
  const parts = createParticles(360);

  const N = clamp(4 + Math.round(2 * D), 4, 6);
  const TIME = lerp(30, 15, D);
  const PENALTY = Math.round(lerp(2, 4, D));

  const colorIdx = shuffle(rng, [0, 1, 2, 3, 4, 5]).slice(0, N);
  let perm = [];
  for (let tries = 0; tries < 12; tries++) {
    perm = shuffle(rng, colorIdx.map((_, i) => i));
    const same = perm.filter((p, i) => p === i).length;
    if (same <= Math.floor(N / 3)) break;
  }
  const termY = (i) => Math.round(TOP + (i * (BOTTOM - TOP)) / (N - 1));
  const left = colorIdx.map((ci, i) => ({ ci, y: termY(i), hits: 0, conn: -1, wob: 0, wobV: 0, spark: 0 }));
  const right = perm.map((li, j) => ({ ci: colorIdx[li], y: termY(j), conn: -1, glow: 0 }));
  const dmgCount = D < 0.25 ? (rng() < 0.5 ? 1 : 0) : D < 0.7 ? 1 : 2;
  for (const i of shuffle(rng, left.map((_, i) => i)).slice(0, dmgCount)) left[i].hits = 2;

  let phase = 'play';
  let phaseT = 0;
  let t = 0;
  let timeLeft = TIME;
  let lastSec = Math.ceil(TIME);
  let mistakes = 0;
  let drag = null; // { from, x, y, px, py, mode: 'drag'|'held', sx, sy, moved }
  let retract = null; // { from, x, y, t }
  let keySel = -1;
  let hover = { side: null, i: -1 };
  let flicker = 0;

  const connectedCount = () => left.filter((l) => l.conn >= 0).length;
  const updateStatus = () => mg.setStatus(`${connectedCount()}/${N} WIRED`, connectedCount() === N ? 'good' : undefined);
  updateStatus();

  function leftAt(x, y) {
    for (let i = 0; i < N; i++) if (Math.abs(x - LX) <= HIT + 4 && Math.abs(y - left[i].y) <= HIT) return i;
    // allow grabbing the wire stub itself
    for (let i = 0; i < N; i++) if (x >= 4 && x < LX && Math.abs(y - left[i].y) <= 4) return i;
    return -1;
  }
  function rightAt(x, y) {
    for (let j = 0; j < N; j++) if (Math.abs(x - RX) <= HIT + 4 && Math.abs(y - right[j].y) <= HIT) return j;
    return -1;
  }

  function strip(i) {
    const l = left[i];
    l.hits--;
    sfx('ui_click');
    mg.shake(1.5);
    parts.burst(6, () => ({
      x: LX - 4,
      y: l.y,
      vx: fxRand(-20, 30),
      vy: -fxRand(10, 50),
      g: 200,
      life: fxRand(0.4, 0.8),
      color: fxRand() < 0.5 ? '#3a3a36' : WIRES[l.ci].c,
    }));
    if (l.hits <= 0) {
      floatText(parts, 'STRIPPED', LX + 14, l.y - 6, '#d08040', { life: 0.7 });
      sparkBurst(parts, LX, l.y, 5, ['#ffffff', '#ffe066'], 30);
    } else {
      floatText(parts, 'SNIP', LX + 10, l.y - 6, '#b0b8bc', { life: 0.5 });
    }
  }

  function startDrag(i, x, y, mode) {
    drag = { from: i, x, y, px: LX + 3, py: left[i].y, mode, sx: x, sy: y, moved: false };
    keySel = -1;
    sfx('ui_click');
  }

  function attempt(i, j) {
    const l = left[i];
    const r = right[j];
    if (r.conn >= 0) {
      sfx('ui_error');
      floatText(parts, 'TAKEN', RX - 10, r.y - 6, '#ffb000', { life: 0.6 });
      cancelDrag();
      return;
    }
    if (r.ci === l.ci) {
      l.conn = j;
      r.conn = i;
      l.wob = 7;
      l.wobV = 0;
      r.glow = 1;
      drag = null;
      keySel = -1;
      sfx('wire_connect');
      sparkBurst(parts, RX - 3, r.y, 10, ['#ffffff', '#9fdcff', WIRES[l.ci].c], 55);
      mg.flash('#39ff6a', 0.12);
      mg.shake(1.5);
      updateStatus();
      if (connectedCount() === N) win();
    } else {
      mistakes++;
      timeLeft = Math.max(0, timeLeft - PENALTY);
      sfx('spark');
      sfx('ui_error');
      sparkBurst(parts, RX - 3, r.y, 22, ['#ffffff', '#ffe066', '#ffb000', '#ff5020'], 95);
      sparkBurst(parts, LX + 3, l.y, 8, ['#ffffff', '#ffe066'], 50);
      mg.shake(6);
      mg.flash('#ff3000', 0.35);
      mg.glitch(0.15);
      floatText(parts, `-${PENALTY}S`, 128, 22, '#ff4040', { life: 1 });
      l.spark = 0.4;
      cancelDrag(true);
    }
  }

  function cancelDrag(snap = false) {
    if (drag) retract = { from: drag.from, x: drag.px, y: drag.py, t: snap ? 0.18 : 0.25, max: snap ? 0.18 : 0.25 };
    drag = null;
    keySel = -1;
  }

  function win() {
    phase = 'win';
    phaseT = 0;
    flicker = 0.7;
    sfx('ui_confirm');
    mg.setStatus('POWER RESTORED', 'good');
    mg.finishAfter({ success: true, cancelled: false, timeLeft: Math.round(timeLeft * 10) / 10, mistakes }, 1.9, 0.6);
  }

  function overload() {
    phase = 'fail';
    phaseT = 0;
    drag = null;
    sfx('spark');
    sfx('ui_error');
    mg.shake(10);
    mg.flash('#ff5000', 0.6);
    mg.glitch(0.45);
    mg.setStatus('OVERLOAD!', 'bad');
    for (const l of left) if (l.conn < 0) sparkBurst(parts, LX + 3, l.y, 16, ['#ffffff', '#ffe066', '#ff8020'], 90);
    for (const r of right) if (r.conn < 0) sparkBurst(parts, RX - 3, r.y, 16, ['#ffffff', '#ffe066', '#ff8020'], 90);
    mg.finishAfter({ success: false, cancelled: false, timeLeft: 0, mistakes }, 2.0, 0.6);
  }

  // ───────────── input
  mg.onPointerDown = (x, y) => {
    if (phase !== 'play') return;
    if (drag && drag.mode === 'held') {
      const j = rightAt(x, y);
      if (j >= 0) attempt(drag.from, j);
      else {
        const i = leftAt(x, y);
        cancelDrag();
        if (i >= 0 && i !== retract?.from && left[i].conn < 0 && left[i].hits <= 0) {
          retract = null;
          startDrag(i, x, y, 'drag');
        }
      }
      return;
    }
    const i = leftAt(x, y);
    if (i >= 0) {
      const l = left[i];
      if (l.conn >= 0) {
        sfx('ui_click');
        return;
      }
      if (l.hits > 0) {
        strip(i);
        return;
      }
      startDrag(i, x, y, 'drag');
      return;
    }
    if (keySel >= 0) {
      const j = rightAt(x, y);
      if (j >= 0) attempt(keySel, j);
    }
  };
  mg.onPointerMove = (x, y) => {
    if (drag) {
      drag.x = x;
      drag.y = y;
      if (Math.hypot(x - drag.sx, y - drag.sy) > 3) drag.moved = true;
    }
    const li = leftAt(x, y);
    const ri = rightAt(x, y);
    hover = li >= 0 ? { side: 'L', i: li } : ri >= 0 ? { side: 'R', i: ri } : { side: null, i: -1 };
    mg.setCursor(li >= 0 || ri >= 0 ? 'pointer' : 'crosshair');
  };
  mg.onPointerUp = (x, y) => {
    if (!drag || drag.mode !== 'drag' || phase !== 'play') return;
    const j = rightAt(x, y);
    if (j >= 0) attempt(drag.from, j);
    else if (!drag.moved) drag.mode = 'held';
    else cancelDrag();
  };
  mg.onKeyDown = (e) => {
    const d = digitFromEvent(e);
    if (d === null || phase !== 'play') return d !== null;
    if (e.repeat) return true;
    const n = Number(d) - 1;
    if (n < 0 || n >= N) return true;
    if (keySel < 0) {
      const l = left[n];
      if (l.conn >= 0) sfx('ui_click');
      else if (l.hits > 0) strip(n);
      else {
        if (drag) cancelDrag();
        keySel = n;
        sfx('ui_click');
      }
    } else {
      attempt(keySel, n);
    }
    return true;
  };

  // ───────────── frame
  mg.onFrame = (dt) => {
    t += dt;
    phaseT += dt;
    flicker = Math.max(0, flicker - dt);
    if (phase === 'play') {
      timeLeft -= dt;
      const sec = Math.ceil(timeLeft);
      if (timeLeft < 5 && sec !== lastSec && sec > 0) {
        lastSec = sec;
        sfx('ui_click');
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        overload();
      }
    }
    if (drag) {
      const k = 1 - Math.exp(-dt * 28);
      drag.px += (drag.x - drag.px) * k;
      drag.py += (drag.y - drag.py) * k;
    }
    if (retract) {
      retract.t -= dt;
      if (retract.t <= 0) retract = null;
    }
    for (const l of left) {
      // springy cable settle
      l.wobV += (-l.wob * 90 - l.wobV * 7) * dt;
      l.wob += l.wobV * dt;
      l.spark = Math.max(0, l.spark - dt);
      if (l.hits > 0 && Math.random() < dt * 1.6) {
        sparkBurst(parts, LX - 4, l.y, 3, ['#ffffff', '#ffe066'], 25);
      }
    }
    for (const r of right) r.glow = Math.max(0, r.glow - dt * 1.5);
    if (phase === 'fail' && Math.random() < dt * 14) {
      parts.spawn({
        x: fxRand(20, W - 20),
        y: fxRand(50, H - 10),
        vx: fxRand(-4, 4),
        vy: -fxRand(8, 20),
        life: fxRand(0.8, 1.6),
        size: 2,
        color: fxRand() < 0.5 ? '#3a3a3a' : '#555555',
      });
    }
    parts.update(dt);
    render();
  };

  // ───────────── render
  function cable(x0, y0, x1, y1, ci, sag, wobble = 0) {
    const w = WIRES[ci];
    const cx = (x0 + x1) / 2 + wobble;
    const cy = Math.max(y0, y1) + sag + wobble * 0.5;
    const pts = bezierPoints(x0, y0, cx, cy, x1, y1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const [x, y] of pts) ctx.fillRect(Math.round(x), Math.round(y) + 3, 3, 2);
    ctx.fillStyle = '#050505';
    for (const [x, y] of pts) ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    ctx.fillStyle = w.d;
    for (const [x, y] of pts) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    ctx.fillStyle = w.c;
    for (const [x, y] of pts) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 1);
  }

  function plug(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = '#b0b8bc';
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 2, y - 2, 1, 1);
    ctx.fillStyle = '#d08040';
    ctx.fillRect(x + 2, y - 1, 2, 2);
  }

  function screw(x, y, state) {
    // state: 'idle' | 'hover' | 'ok' | 'target' | 'bad'
    const ring = state === 'hover' ? '#ffffff' : state === 'target' ? '#ffe066' : state === 'bad' ? '#ff3030' : '#0a0a0a';
    ctx.fillStyle = ring;
    ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.fillStyle = '#8a6a2a';
    ctx.fillRect(x - 3, y - 3, 7, 7);
    ctx.fillStyle = '#d8b060';
    ctx.fillRect(x - 3, y - 3, 6, 1);
    ctx.fillRect(x - 3, y - 3, 1, 6);
    ctx.fillStyle = '#3a2808';
    ctx.fillRect(x - 2, y, 5, 1);
    ctx.fillRect(x, y - 2, 1, 5);
  }

  function sleeve(x, y, ci) {
    const w = WIRES[ci];
    ctx.fillStyle = '#050505';
    ctx.fillRect(x - 1, y - 5, 9, 11);
    ctx.fillStyle = w.c;
    ctx.fillRect(x, y - 4, 7, 9);
    ctx.fillStyle = w.d;
    ctx.fillRect(x, y + 4, 7, 1);
    drawSprite(ctx, SYMS[ci], x + 1, y - 2);
  }

  function drawLeftStub(i) {
    const l = left[i];
    const w = WIRES[l.ci];
    const y = l.y;
    const sel = keySel === i || (drag && drag.from === i);
    ctx.fillStyle = '#050505';
    ctx.fillRect(3, y - 2, LX - 6, 5);
    ctx.fillStyle = w.d;
    ctx.fillRect(3, y - 1, LX - 6, 3);
    ctx.fillStyle = w.c;
    ctx.fillRect(3, y - 1, LX - 6, 1);
    sleeve(6, y, l.ci);
    // frayed / damaged end
    if (l.hits > 0) {
      ctx.fillStyle = '#2a2a26';
      ctx.fillRect(15, y - 2, LX - 18 - (2 - l.hits) * 4, 5);
      ctx.fillStyle = '#4a4a44';
      ctx.fillRect(15, y - 2, LX - 18 - (2 - l.hits) * 4, 1);
      ctx.fillStyle = '#d08040';
      const strands = l.hits === 2 ? [[-1, -4], [0, 3], [1, -3], [2, 4]] : [[0, -3], [2, 3]];
      for (const [dx, dy] of strands) ctx.fillRect(LX - 5 + dx, y + dy, 1, 1);
      if (Math.floor(t * 4) % 2) drawText(ctx, 'CUT', LX - 13, y - 9, { color: '#ffb000' });
    } else {
      ctx.fillStyle = '#e09050';
      ctx.fillRect(LX - 5, y - 1, 2, 3);
    }
    let state = 'idle';
    if (l.conn >= 0) state = 'ok';
    else if (sel) state = 'target';
    else if (hover.side === 'L' && hover.i === i) state = 'hover';
    if (l.spark > 0 && Math.floor(t * 20) % 2) state = 'bad';
    screw(LX, y, state);
    drawText(ctx, String(i + 1), LX + 8, y - 2, { color: l.conn >= 0 ? '#39ff6a' : '#6d7d85' });
  }

  function drawRightStub(j) {
    const r = right[j];
    const w = WIRES[r.ci];
    const y = r.y;
    ctx.fillStyle = '#050505';
    ctx.fillRect(RX + 3, y - 2, W - RX - 6, 5);
    ctx.fillStyle = w.d;
    ctx.fillRect(RX + 3, y - 1, W - RX - 6, 3);
    ctx.fillStyle = w.c;
    ctx.fillRect(RX + 3, y - 1, W - RX - 6, 1);
    sleeve(W - 14, y, r.ci);
    let state = 'idle';
    const src = drag ? drag.from : keySel;
    if (r.conn >= 0) state = 'ok';
    else if (hover.side === 'R' && hover.i === j) state = src >= 0 ? 'target' : 'hover';
    screw(RX, y, state);
    if (r.glow > 0) {
      ctx.globalAlpha = r.glow * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(RX - 6, y - 6, 13, 13);
      ctx.globalAlpha = 1;
    }
    drawText(ctx, String(j + 1), RX - 11, y - 2, { color: r.conn >= 0 ? '#39ff6a' : '#6d7d85' });
    // status led
    ctx.fillStyle = r.conn >= 0 ? '#39ff6a' : '#300a0a';
    ctx.fillRect(RX - 1, y - 8, 3, 2);
  }

  function drawTimer() {
    const x = 8;
    const y = 16;
    const w = 150;
    const k = clamp01(timeLeft / TIME);
    ctx.fillStyle = '#050505';
    ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#10161a';
    ctx.fillRect(x, y, w, 4);
    const low = timeLeft < 5;
    const col = low ? (Math.floor(t * 8) % 2 ? '#ff3030' : '#801010') : k < 0.5 ? '#ffb000' : '#39ff6a';
    ctx.fillStyle = phase === 'win' ? '#39ff6a' : col;
    ctx.fillRect(x, y, Math.round(w * k), 4);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x, y, Math.round(w * k), 1);
    const txt = timeLeft.toFixed(1);
    drawTextOutlined(ctx, txt, W - 8, 16, { align: 'right', color: low && phase === 'play' ? '#ff4040' : '#ffffff' });
    // lamps
    const lw = N * 10 - 4;
    for (let i = 0; i < N; i++) {
      const lx = Math.round(W / 2 - lw / 2 + i * 10);
      const on = i < connectedCount() || (phase === 'win' && Math.floor(t * 10) % 2);
      ctx.fillStyle = '#050505';
      ctx.fillRect(lx - 1, 24, 8, 6);
      ctx.fillStyle = on ? '#39ff6a' : '#0f2a16';
      ctx.fillRect(lx, 25, 6, 4);
      if (on) {
        ctx.fillStyle = '#d8ffe0';
        ctx.fillRect(lx, 25, 2, 1);
      }
    }
  }

  function render() {
    ctx.drawImage(box, 0, 0);
    drawTimer();
    for (let j = 0; j < N; j++) drawRightStub(j);
    for (let i = 0; i < N; i++) drawLeftStub(i);
    // connected cables
    for (let i = 0; i < N; i++) {
      const l = left[i];
      if (l.conn < 0) continue;
      const r = right[l.conn];
      const sway = Math.sin(t * 1.3 + i * 1.7) * 0.8;
      const dist = Math.abs(r.y - l.y);
      cable(LX + 3, l.y, RX - 3, r.y, l.ci, 8 + dist * 0.12, l.wob + sway);
    }
    // cable being dragged / retracting
    if (drag) {
      const l = left[drag.from];
      const dist = Math.hypot(drag.px - LX, drag.py - l.y);
      cable(LX + 3, l.y, drag.px, drag.py, l.ci, 4 + dist * 0.15, (drag.x - drag.px) * 0.6);
      plug(drag.px, drag.py);
    } else if (retract) {
      const l = left[retract.from];
      const k = 1 - clamp01(retract.t / retract.max);
      const x = lerp(retract.x, LX + 6, k);
      const y = lerp(retract.y, l.y, k);
      cable(LX + 3, l.y, x, y, l.ci, 4, 0);
      plug(x, y);
    } else if (keySel >= 0) {
      const l = left[keySel];
      const bob = Math.sin(t * 8) * 2;
      cable(LX + 3, l.y, LX + 22, l.y + bob, l.ci, 3, 0);
      plug(LX + 22, l.y + bob);
      if (Math.floor(t * 3) % 2) drawTextOutlined(ctx, 'PICK 1-' + N, W / 2, 34, { align: 'center', color: '#ffb000' });
    }
    parts.draw(ctx);

    if (phase === 'win') {
      const on = flicker <= 0 || Math.floor(phaseT * 18) % 3 !== 0;
      if (on) {
        ctx.fillStyle = 'rgba(160,255,190,0.12)';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
      }
      const s = phaseT < 0.15 ? 3 : 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 70, W, 20);
      drawTextOutlined(ctx, 'POWER RESTORED', W / 2, 80 - (s * 5) / 2, { scale: s, align: 'center', color: '#39ff6a' });
    } else if (phase === 'fail') {
      ctx.fillStyle = `rgba(255,60,0,${0.12 + Math.max(0, Math.sin(t * 20)) * 0.12})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 70, W, 20);
      const jx = Math.round(fxRand(-1, 1));
      drawTextOutlined(ctx, 'OVERLOAD!', W / 2 + jx, 75, { scale: 2, align: 'center', color: Math.floor(t * 10) % 2 ? '#ff4040' : '#ffe066' });
    } else if (timeLeft < 5) {
      ctx.fillStyle = `rgba(255,0,0,${Math.max(0, Math.sin(t * 10)) * 0.07})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (phase === 'play' && t < 2.2 && !drag && keySel < 0 && Math.floor(t * 3) % 2) {
      drawTextOutlined(ctx, 'MATCH THE COLORS', W / 2, 34, { align: 'center', color: '#ffffff' });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }

  return mg.api;
}
