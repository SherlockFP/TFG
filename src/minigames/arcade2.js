/**
 * ARCADE 2 - the ship cabinet's extra four (docs/wave8/arcade2.md). One minigame, a canvas menu, four 30-90 s games:
 *   fish      FLAPPY FISH      one button (SPACE / click / UP), Company pipes, the Algorithm's "donations" flip gravity
 *   cable     CABLE RUNNER     snake: the cable grows as it eats plugs (arrows / WASD, click steers)
 *   stack     QUOTA STACK      falling scrap shapes (arrows/WASD, UP rotate, SPACE drop; mouse: move = column, click = rotate, click the bottom strip = drop)
 *   invaders  VIEWER INVADERS  shoot the hate-comments (A/D or arrows or mouse, SPACE / click fires)
 * createArcade2(opts) -> { el, update, destroy }
 *   opts.onScore(game, score, ms)  called once per finished play (the module sends it to the host)
 *   opts.board() -> { game: [{ n, s }] } today's crew leaders, opts.best() -> { game: score } my best today, opts.game preselects a game
 *   result: { success: true, cancelled: false, plays }
 * Canvas text is the shared bitmap font (Latin only), so the canvas shows numbers and short arcade words; sentences live in the DOM status / help lines (localised).
 * Every attempt is seeded from the calendar day, so the whole crew sees the same pipes / plugs / pieces / comments (a fair leaderboard).
 */
import { createMinigame, drawText, pxRect, bevel, createParticles, sparkBurst, floatText, mulberry32, clamp, C } from './common.js';
import { t, tf } from '../core/i18n.js';
import { GAMES, NAMES, TARGETS, dayKey } from '../game/arcade2_core.js';

const W = 200, H = 150;
const LIMIT = { fish: 75, cable: 60, stack: 90, invaders: 60 };
const INK = '#0a1210', PIPE = ['#5a2a12', '#8a4a22', '#b5652a', '#d98c4a'];

// ------------------------------------------------------------------ shared drawing
function backdrop(ctx, tm, tint = '#0c1a1e') {
  pxRect(ctx, 0, 0, W, H, tint);
  for (let y = 0; y < H; y += 3) pxRect(ctx, 0, y, W, 1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = 'rgba(57,255,106,0.05)';
  for (let i = 0; i < 6; i++) ctx.fillRect(Math.round((i * 47 + tm * 6) % W), 0, 1, H);
}
const banner = (ctx, text, y, col) => { pxRect(ctx, 0, y - 3, W, 11, 'rgba(0,0,0,0.75)'); drawText(ctx, text, W / 2, y, { align: 'center', color: col, shadow: '#000' }); };

// ------------------------------------------------------------------ 1. FLAPPY FISH
function makeFish(E) {
  const rng = E.rng, FX = 46, PW = 16, GAP = 44, SPACING = 76;
  let y = H / 2, vy = 0, gdir = 1, score = 0, over = false, tm = 0, cause = '';
  let nextFlip = 7 + rng() * 4, warn = 0, flipped = false, lastGap = H / 2;
  const pipes = [];
  const addPipe = (x) => {
    const lo = 16 + GAP / 2 + 4, hi = H - 16 - GAP / 2 - 4;
    lastGap = clamp(lastGap + (rng() - 0.5) * 84, lo, hi);
    pipes.push({ x, gy: lastGap, done: false });
  };
  for (let x = W + 30; x < W + 30 + SPACING * 3; x += SPACING) addPipe(x);
  const flap = () => { if (!over) { vy = -118 * gdir; E.sfx('arcade2_flap'); } };
  return {
    key: (code, down) => { if (down && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) { flap(); return true; } return false; },
    press: flap, move() {},
    get score() { return score; }, get over() { return over; }, get cause() { return cause; },
    info: () => (flipped ? t('DONATION! Gravity is upside down.') : t('Dodge the Company pipes.')),
    update(dt) {
      tm += dt;
      const sp = Math.min(84, 50 + score * 0.9);
      vy = clamp(vy + 330 * gdir * dt, -190, 190); y += vy * dt;
      // the Algorithm's donation: a 1 s warning, then gravity flips (and flips back 5 s later)
      nextFlip -= dt;
      if (warn === 0 && nextFlip <= 0) { warn = 1; E.sfx('arcade2_tick'); }
      if (warn > 0) { warn -= dt; if (warn <= 0) { warn = 0; gdir = -gdir; flipped = gdir < 0; vy = 0; nextFlip = flipped ? 5 : 8 + rng() * 5; E.mg.flash('#ff5a4a', 0.25); E.mg.glitch(0.2); } }
      for (const p of pipes) {
        p.x -= sp * dt;
        if (!p.done && p.x + PW < FX - 4) { p.done = true; score++; E.sfx('arcade2_pass'); floatText(E.parts, '+1', FX + 10, y - 8, C.amber); }
        if (FX + 4 > p.x && FX - 4 < p.x + PW && (y - 3 < p.gy - GAP / 2 || y + 3 > p.gy + GAP / 2)) { over = true; cause = 'pipe'; }
      }
      while (pipes.length && pipes[0].x < -PW - 4) pipes.shift();
      if (pipes[pipes.length - 1].x < W + 10) addPipe(pipes[pipes.length - 1].x + SPACING);
      if (y < 13 || y > H - 13) { over = true; cause = 'wall'; }
    },
    draw(ctx) {
      backdrop(ctx, tm, '#0a1c26');
      for (let i = 0; i < 5; i++) { const bx = ((i * 53 - tm * 8) % (W + 40) + W + 40) % (W + 40) - 20, bh = 24 + (i * 17) % 30; pxRect(ctx, bx, H - 12 - bh, 22, bh, '#0d2a33'); }   // Company towers far away
      for (const p of pipes) {
        const top = p.gy - GAP / 2, bot = p.gy + GAP / 2, x = Math.round(p.x);
        for (const [y0, y1, cap] of [[13, top, top - 6], [bot, H - 13, bot]]) {
          pxRect(ctx, x + 1, y0, PW - 2, y1 - y0, PIPE[1]); pxRect(ctx, x + 1, y0, 3, y1 - y0, PIPE[2]); pxRect(ctx, x + PW - 5, y0, 4, y1 - y0, PIPE[0]);
          pxRect(ctx, x - 2, cap, PW + 4, 6, PIPE[2]); pxRect(ctx, x - 2, cap, PW + 4, 1, PIPE[3]); pxRect(ctx, x - 2, cap + 5, PW + 4, 1, PIPE[0]);
          for (let r = y0 + 8; r < y1 - 4; r += 14) pxRect(ctx, x + 6, r, 2, 2, PIPE[3]);
        }
      }
      pxRect(ctx, 0, 0, W, 13, '#1a1410'); pxRect(ctx, 0, H - 13, W, 13, '#1a1410'); pxRect(ctx, 0, 12, W, 1, '#5a3a1a'); pxRect(ctx, 0, H - 13, W, 1, '#5a3a1a');
      // the fish (pixel), tilted by drawing a shifted tail
      const fy = Math.round(y), tail = vy * gdir > 30 ? 2 : vy * gdir < -30 ? -2 : 0;
      pxRect(ctx, FX - 6, fy - 3, 12, 7, '#d98c4a'); pxRect(ctx, FX - 6, fy + 1, 12, 3, '#f2d6a6'); pxRect(ctx, FX - 10, fy - 2 + tail, 4, 5, '#b5652a'); pxRect(ctx, FX + 2, fy - 2, 2, 2, '#fff'); pxRect(ctx, FX + 3, fy - 2, 1, 1, '#000');
      drawText(ctx, flipped ? 'UP' : 'DN', FX, fy + (flipped ? -12 : 10), { align: 'center', color: flipped ? C.red : C.dim || '#5a666c' });
      drawText(ctx, String(score), W / 2, 3, { align: 'center', scale: 1, color: C.amber, shadow: '#000' });
      if (warn > 0) banner(ctx, `DONATION ${Math.ceil(warn)}`, 68, Math.floor(tm * 8) % 2 ? C.red : C.amber);
    },
  };
}

// ------------------------------------------------------------------ 2. CABLE RUNNER (snake)
function makeCable(E) {
  const rng = E.rng, CS = 8, COLS = 25, ROWS = 17, X0 = 0, Y0 = 14;
  let body = [{ x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }], dir = { x: 1, y: 0 }, queue = [], acc = 0, score = 0, over = false, grow = 0, tm = 0, plug = null, gold = null, goldT = 0;
  const free = () => { for (let i = 0; i < 60; i++) { const c = { x: 1 + Math.floor(rng() * (COLS - 2)), y: 1 + Math.floor(rng() * (ROWS - 2)) }; if (!body.some((b) => b.x === c.x && b.y === c.y)) return c; } return { x: 12, y: 8 }; };
  plug = free();
  const turn = (dx, dy) => { const last = queue.length ? queue[queue.length - 1] : dir; if (last.x === -dx && last.y === -dy) return; if (last.x === dx && last.y === dy) return; if (queue.length < 2) queue.push({ x: dx, y: dy }); };
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  return {
    key: (code, down) => { const k = KEYS[code]; if (k && down) { turn(k[0], k[1]); return true; } return false; },
    press(x, y) {   // click steers toward the click on the axis across the current heading
      const h = body[0], hx = X0 + h.x * CS + 4, hy = Y0 + h.y * CS + 4, last = queue.length ? queue[queue.length - 1] : dir;
      if (last.x !== 0) turn(0, y < hy ? -1 : 1); else turn(x < hx ? -1 : 1, 0);
    },
    move() {},
    get score() { return score; }, get over() { return over; }, get cause() { return ''; },
    info: () => t('Eat plugs. Gold plugs are worth 3 and vanish.'),
    update(dt) {
      tm += dt; acc += dt;
      if (gold) { goldT -= dt; if (goldT <= 0) gold = null; } else if (rng() < dt * 0.09) { gold = free(); goldT = 6; }
      const step = Math.max(0.065, 0.13 - body.length * 0.0018);
      while (acc >= step && !over) {
        acc -= step;
        if (queue.length) dir = queue.shift();
        const h = { x: body[0].x + dir.x, y: body[0].y + dir.y };
        if (h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= ROWS || body.some((b, i) => i < body.length - (grow > 0 ? 0 : 1) && b.x === h.x && b.y === h.y)) { over = true; E.mg.shake(4); break; }
        body.unshift(h);
        if (grow > 0) grow--; else body.pop();
        if (h.x === plug.x && h.y === plug.y) { score++; grow += 1; plug = free(); E.sfx('arcade2_pass'); sparkBurst(E.parts, X0 + h.x * CS + 4, Y0 + h.y * CS + 4, 6, ['#39ff6a', '#ffffff'], 40); }
        else if (gold && h.x === gold.x && h.y === gold.y) { score += 3; grow += 2; floatText(E.parts, '+3', X0 + h.x * CS + 4, Y0 + h.y * CS, C.amber); gold = null; E.sfx('arcade2_pass'); }
      }
    },
    draw(ctx) {
      backdrop(ctx, tm, '#06120c');
      drawText(ctx, `PLUGS ${score}`, 4, 4, { color: C.green }); drawText(ctx, `LEN ${body.length}`, W - 4, 4, { align: 'right', color: C.amberDim });
      pxRect(ctx, X0 - 1, Y0 - 1, COLS * CS + 2, ROWS * CS + 2, '#16813a'); pxRect(ctx, X0, Y0, COLS * CS, ROWS * CS, '#020805');
      for (let gx = 0; gx < COLS; gx += 2) for (let gy = 0; gy < ROWS; gy += 2) pxRect(ctx, X0 + gx * CS + 3, Y0 + gy * CS + 3, 1, 1, '#0a2e16');
      const cell = (c, col, inset = 1) => pxRect(ctx, X0 + c.x * CS + inset, Y0 + c.y * CS + inset, CS - inset * 2, CS - inset * 2, col);
      cell(plug, C.cyan, 1); pxRect(ctx, X0 + plug.x * CS + 3, Y0 + plug.y * CS + 3, 2, 2, '#fff');
      if (gold) { cell(gold, Math.floor(tm * 6) % 2 ? C.amber : '#fff3a0', 0); }
      body.forEach((b, i) => cell(b, i === 0 ? '#eafff0' : (i % 2 ? C.green : C.greenMid), i === 0 ? 0 : 1));
    },
  };
}

// ------------------------------------------------------------------ 3. QUOTA STACK (tetris with scrap)
const SHAPES = { I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]] };
const SCRAP = { I: '#8fa3ad', O: '#d9b23a', T: '#b5652a', S: '#5aa86a', Z: '#c0443a', J: '#4a7ac8', L: '#c07acb' };
const KINDS = Object.keys(SHAPES);
function makeStack(E) {
  const rng = E.rng, COLS = 10, ROWS = 18, CS = 7, X0 = 24, Y0 = 12;
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let bag = [], cur = null, next = null, score = 0, lines = 0, over = false, acc = 0, tm = 0, moveAcc = 0, tx = -1;
  const draw7 = () => { if (!bag.length) { bag = KINDS.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); };
  const cells = (p) => p.c.map(([x, y]) => [p.x + x, p.y + y]);
  const fits = (p) => cells(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !grid[y][x]));
  const spawn = () => { const k = next || draw7(); next = draw7(); cur = { k, c: SHAPES[k].map((c) => c.slice()), x: 3, y: -1, n: k === 'I' ? 4 : k === 'O' ? 4 : 3 }; if (!fits(cur)) over = true; };
  const rot = (p) => ({ ...p, c: p.k === 'O' ? p.c : p.c.map(([x, y]) => [p.n - 1 - y, x]) });
  const tryMove = (dx, dy) => { const p = { ...cur, x: cur.x + dx, y: cur.y + dy }; if (fits(p)) { cur = p; return true; } return false; };
  const tryRot = () => { const r = rot(cur); for (const k of [0, -1, 1, -2, 2]) { const p = { ...r, x: r.x + k }; if (fits(p)) { cur = p; E.sfx('arcade2_tick'); return; } } };
  function lock() {
    for (const [x, y] of cells(cur)) { if (y < 0) { over = true; return; } grid[y][x] = cur.k; }
    let n = 0;
    for (let y = ROWS - 1; y >= 0; y--) if (grid[y].every(Boolean)) { grid.splice(y, 1); grid.unshift(Array(COLS).fill(null)); n++; y++; }
    score += 1 + [0, 8, 20, 40, 70][n]; lines += n;
    if (n) { E.sfx('arcade2_pass'); E.mg.flash('#39ff6a', 0.18); floatText(E.parts, `+${[0, 8, 20, 40, 70][n]}`, X0 + COLS * CS / 2, Y0 + 30, C.amber); }
    spawn();
  }
  const drop = () => { if (!tryMove(0, 1)) lock(); };
  const hard = () => { let g = 0; while (tryMove(0, 1)) g++; lock(); acc = 0; return g; };
  spawn();
  const block = (ctx, x, y, col) => { pxRect(ctx, x, y, CS, CS, col); pxRect(ctx, x, y, CS, 1, 'rgba(255,255,255,0.35)'); pxRect(ctx, x, y + CS - 1, CS, 1, 'rgba(0,0,0,0.45)'); pxRect(ctx, x + CS - 1, y, 1, CS, 'rgba(0,0,0,0.3)'); };
  return {
    key(code, down) {
      if (!down) return false;
      if (code === 'ArrowLeft' || code === 'KeyA') tryMove(-1, 0);
      else if (code === 'ArrowRight' || code === 'KeyD') tryMove(1, 0);
      else if (code === 'ArrowDown' || code === 'KeyS') { drop(); acc = 0; }
      else if (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyX') tryRot();
      else if (code === 'Space') hard();
      else return false;
      return true;
    },
    press(x, y) { if (y > H - 20) hard(); else tryRot(); },
    move(x) { tx = Math.floor((x - X0) / CS); },
    get score() { return score; }, get over() { return over; }, get cause() { return ''; },
    info: () => tf('Quota: {n} lines. Stack the scrap, clear the rows.', { n: 10 }),
    update(dt) {
      tm += dt;
      if (tx >= 0 && cur) { moveAcc += dt; if (moveAcc > 0.07) { moveAcc = 0; const mid = cur.x + 1; if (tx < mid) tryMove(-1, 0); else if (tx > mid + 0) tryMove(1, 0); } }
      acc += dt;
      const iv = Math.max(0.12, 0.85 - lines * 0.045);
      if (acc >= iv) { acc = 0; drop(); }
    },
    draw(ctx) {
      backdrop(ctx, tm, '#0a1014');
      pxRect(ctx, X0 - 2, Y0 - 2, COLS * CS + 4, ROWS * CS + 4, '#5a3a1a'); pxRect(ctx, X0, Y0, COLS * CS, ROWS * CS, '#050a0c');
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x]) block(ctx, X0 + x * CS, Y0 + y * CS, SCRAP[grid[y][x]]);
      if (cur) {
        const gh = { ...cur }; while (fits({ ...gh, y: gh.y + 1 })) gh.y++;
        for (const [x, y] of cells(gh)) if (y >= 0) pxRect(ctx, X0 + x * CS + 1, Y0 + y * CS + 1, CS - 2, CS - 2, 'rgba(255,255,255,0.10)');
        for (const [x, y] of cells(cur)) if (y >= 0) block(ctx, X0 + x * CS, Y0 + y * CS, SCRAP[cur.k]);
      }
      const px = X0 + COLS * CS + 14;
      drawText(ctx, 'SCORE', px, 14, { color: C.amberDim }); drawText(ctx, String(score), px, 22, { color: C.amber, scale: 2 });
      drawText(ctx, 'LINES', px, 44, { color: C.greenDim }); drawText(ctx, `${lines}`, px, 52, { color: C.green });
      drawText(ctx, 'NEXT', px, 68, { color: C.greenDim });
      if (next) for (const [x, y] of SHAPES[next]) block(ctx, px + x * CS, 78 + y * CS, SCRAP[next]);
      pxRect(ctx, px, 108, 60, 5, '#0a2e16'); pxRect(ctx, px, 108, Math.min(60, lines * 6), 5, C.green); drawText(ctx, 'QUOTA 10', px, 116, { color: lines >= 10 ? C.amber : C.greenDim });
    },
  };
}

// ------------------------------------------------------------------ 4. VIEWER INVADERS
const HATE = ['L', 'MID', 'BOT', 'NPC', 'COPE', 'RATIO', 'BAD', 'UNSUB', 'FAKE', 'CRINGE'];
function makeInvaders(E) {
  const rng = E.rng, ROWS = 3, COLS = 6, CW = 30, RH = 14;
  let px = W / 2, keys = { l: false, r: false }, mouseX = -1, fire = false, cd = 0, lives = 3, inv = 0, score = 0, over = false, tm = 0, wave = 1, shotT = 1.4, edge = 1;
  const shots = [], bolts = [];
  let foes = [], gx = 12, gy = 16;
  const spawnWave = () => { foes = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) foes.push({ r, c, w: HATE[Math.floor(rng() * HATE.length)], alive: true }); gx = 12; gy = 16; edge = 1; };
  spawnWave();
  const shoot = () => { if (cd > 0 || over) return; cd = 0.3; shots.push({ x: px, y: H - 20 }); E.sfx('arcade2_flap'); };
  return {
    key(code, down) {
      if (code === 'ArrowLeft' || code === 'KeyA') keys.l = down; else if (code === 'ArrowRight' || code === 'KeyD') keys.r = down;
      else if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') { fire = down; if (down) shoot(); } else return false;
      return true;
    },
    press() { fire = true; shoot(); }, release() { fire = false; }, move(x) { mouseX = x; },
    get score() { return score; }, get over() { return over; }, get cause() { return ''; },
    info: () => t('Shoot the hate-comments before they reach the stream.'),
    update(dt) {
      tm += dt; cd -= dt; inv -= dt;
      if (keys.l || keys.r) { px += ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) * 100 * dt; mouseX = -1; } else if (mouseX >= 0) px += clamp(mouseX - px, -110 * dt, 110 * dt);
      px = clamp(px, 8, W - 8);
      if (fire) shoot();
      const alive = foes.filter((f) => f.alive), sp = 14 + wave * 4 + (COLS * ROWS - alive.length) * 0.9;
      gx += edge * sp * dt;
      const minC = Math.min(...alive.map((f) => f.c)), maxC = Math.max(...alive.map((f) => f.c));
      if (alive.length && ((edge > 0 && gx + maxC * CW + 26 > W - 2) || (edge < 0 && gx + minC * CW < 2))) { edge = -edge; gy += 7; gx += edge * 2; }
      for (const s of shots) s.y -= 150 * dt;
      for (const b of bolts) b.y += (48 + wave * 4) * dt;
      for (const s of shots) for (const f of alive) {
        if (f.alive && s.y > 0 && Math.abs(s.x - (gx + f.c * CW + 13)) < 13 && Math.abs(s.y - (gy + f.r * RH + 4)) < 6) {
          f.alive = false; s.y = -9; const pts = 3 + (ROWS - 1 - f.r); score += pts; E.sfx('arcade2_pass'); sparkBurst(E.parts, gx + f.c * CW + 13, gy + f.r * RH + 4, 8, ['#ff5a4a', '#ffb000', '#fff'], 45); floatText(E.parts, `+${pts}`, gx + f.c * CW + 13, gy + f.r * RH - 4, C.amber, { life: 0.6 });
        }
      }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].y < -8) shots.splice(i, 1);
      shotT -= dt;
      if (shotT <= 0 && alive.length) { shotT = Math.max(0.35, 1.2 - wave * 0.12) * (0.6 + rng() * 0.8); const f = alive[Math.floor(rng() * alive.length)]; bolts.push({ x: gx + f.c * CW + 13, y: gy + f.r * RH + 8 }); }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        if (b.y > H - 16 && Math.abs(b.x - px) < 8 && inv <= 0) { lives--; inv = 1.4; bolts.splice(i, 1); E.mg.shake(4); E.mg.flash('#ff3b3b', 0.3); if (lives <= 0) over = true; }
        else if (b.y > H) bolts.splice(i, 1);
      }
      if (!alive.length) { wave++; score += 10; floatText(E.parts, 'WAVE', W / 2, 60, C.cyan); spawnWave(); bolts.length = 0; }
      else if (gy + (Math.max(...alive.map((f) => f.r)) + 1) * RH > H - 24) { over = true; }
    },
    draw(ctx) {
      backdrop(ctx, tm, '#0c0a14');
      drawText(ctx, `SCORE ${score}`, 4, 3, { color: C.amber }); drawText(ctx, `WAVE ${wave}`, W / 2, 3, { align: 'center', color: C.cyan });
      for (let i = 0; i < lives; i++) pxRect(ctx, W - 8 - i * 8, 3, 6, 4, C.green);
      for (const f of foes) if (f.alive) {
        const x = Math.round(gx + f.c * CW), y = Math.round(gy + f.r * RH), col = ['#7a2a3a', '#7a4a2a', '#5a2a6a'][f.r];
        pxRect(ctx, x, y, 26, 9, col); pxRect(ctx, x, y, 26, 1, 'rgba(255,255,255,0.3)'); drawText(ctx, f.w, x + 13, y + 2, { align: 'center', color: '#ffd0d0' });
      }
      for (const s of shots) pxRect(ctx, s.x - 1, s.y, 2, 5, C.green);
      for (const b of bolts) { pxRect(ctx, b.x - 1, b.y, 2, 5, C.red); pxRect(ctx, b.x - 1, b.y + 6, 2, 1, C.red); }
      pxRect(ctx, 0, H - 14, W, 1, '#16813a');
      if (inv <= 0 || Math.floor(tm * 14) % 2) { pxRect(ctx, px - 7, H - 12, 14, 5, C.green); pxRect(ctx, px - 2, H - 16, 4, 5, C.greenMid); pxRect(ctx, px - 1, H - 18, 2, 2, '#eafff0'); }
    },
  };
}

export const MAKERS = { fish: makeFish, cable: makeCable, stack: makeStack, invaders: makeInvaders };
const helpOf = (id) => ({
  fish: t('[SPACE] / [CLICK] flap   [ESC] menu'),
  cable: t('[ARROWS] / [WASD] steer   [CLICK] turn toward   [ESC] menu'),
  stack: t('[A][D] move  [W] rotate  [S] soft drop  [SPACE] drop   [ESC] menu'),
  invaders: t('[A][D] / mouse move   [SPACE] / [CLICK] fire   [ESC] menu'),
}[id]);
const descOf = (id) => ({
  fish: t('One button. The Algorithm may flip gravity.'),
  cable: t('Grow the cable, do not bite it.'),
  stack: t('Stack scrap shapes, make quota rows.'),
  invaders: t('Shoot the hate-comments.'),
}[id]);

export function createArcade2(rawOpts) {
  const mg = createMinigame(rawOpts, { kind: 'arcade2', title: t('SHIP ARCADE'), tag: 'ARCADE', help: t('[UP][DOWN] pick   [ENTER] play   [ESC] leave'), width: W, height: H });
  const { ctx, opts } = mg;
  const parts = createParticles(200), day = dayKey();
  const bests = { ...(opts.best?.() || {}) };
  let mode = 'menu', sel = Math.max(0, GAMES.indexOf(opts.game)), game = null, gid = '', tm = 0, playT = 0, plays = 0, endT = 0, last = { score: 0, best: false, hit: false }, cur = 0;
  const board = () => (typeof opts.board === 'function' ? opts.board() : {}) || {};

  function menuStatus() { mg.setStatus(descOf(GAMES[sel]), ''); mg.setHelp(t('[UP][DOWN] pick   [ENTER] play   [ESC] leave')); }
  function start(i) {
    gid = GAMES[i]; sel = i; cur = i;
    const rng = mulberry32((day * 2654435761 + i * 40503 + plays * 0) >>> 0);   // same seed for everyone, every attempt
    game = MAKERS[gid]({ rng, sfx: mg.sfx, parts, mg });
    mode = 'play'; playT = 0; parts.list.length = 0;
    mg.setHelp(helpOf(gid)); mg.setStatus(game.info(), '');
  }
  function finishPlay(why) {
    const score = game.score | 0;
    plays++;
    last = { score, best: score > (bests[gid] || 0), hit: score >= TARGETS[gid], why };
    if (last.best) bests[gid] = score;
    mode = 'over'; endT = 0;
    try { opts.onScore?.(gid, score, Math.round(playT * 1000)); } catch (e) { console.warn('arcade2 onScore', e); }
    mg.setStatus(last.hit ? t('TARGET BEATEN') : last.best ? t('NEW BEST') : t('GAME OVER'), last.best || last.hit ? 'good' : 'bad');
    mg.setHelp(t('[ENTER] again   [ESC] menu'));
    mg.sfx(last.best ? 'arcade2_pass' : 'arcade2_crash');
  }
  menuStatus();

  mg.onKeyDown = (e) => {
    if (mode === 'menu') {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + GAMES.length - 1) % GAMES.length; menuStatus(); return true; }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % GAMES.length; menuStatus(); return true; }
      if (/^Digit[1-4]$/.test(e.code)) { start(+e.code.slice(5) - 1); return true; }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { start(sel); return true; }
      return false;
    }
    if (mode === 'over') { if (endT > 0.7 && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) { start(cur); return true; } return false; }
    return game.key(e.code, true) === true;
  };
  mg.onKeyUp = (e) => (mode === 'play' ? game.key(e.code, false) === true : false);
  mg.onBlur = () => { if (mode === 'play') for (const c of ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space']) game.key(c, false); };
  mg.onEscape = () => {
    if (mode === 'play') { if (game && (game.score | 0) > 0) finishPlay('quit'); else { mode = 'menu'; game = null; menuStatus(); } return; }
    if (mode === 'over') { mode = 'menu'; game = null; menuStatus(); return; }
    mg.finish({ success: true, cancelled: false, plays });
  };
  const rowAt = (y) => Math.floor((y - 40) / 17);
  mg.onPointerMove = (x, y) => {
    if (mode === 'menu') { const r = rowAt(y); if (r >= 0 && r < GAMES.length && r !== sel) { sel = r; menuStatus(); } } else if (mode === 'play') game.move(x, y);
  };
  mg.onPointerDown = (x, y) => {
    if (mode === 'menu') { const r = rowAt(y); if (r >= 0 && r < GAMES.length) start(r); } else if (mode === 'over') { if (endT > 0.7) start(cur); } else game.press(x, y);
  };
  mg.onPointerUp = () => { if (mode === 'play') game.release?.(); };

  mg.onFrame = (dt) => {
    tm += dt; endT += dt;
    if (mode === 'play') {
      playT += dt; game.update(dt);
      const left = Math.max(0, LIMIT[gid] - playT);
      mg.setStatus(`${game.info()}  ${Math.ceil(left)}s`, '');
      if (game.over) { mg.shake(3); finishPlay(game.cause || 'over'); } else if (left <= 0) finishPlay('time');
    }
    parts.update(dt);
    if (mode === 'menu') {
      backdrop(ctx, tm);
      drawText(ctx, 'SHIP ARCADE', W / 2, 8, { align: 'center', scale: 2, color: C.green, shadow: '#04240f', wave: { t: tm, amp: 1, speed: 3 } });
      GAMES.forEach((id, i) => {
        const y = 40 + i * 17, on = i === sel;
        bevel(ctx, 14, y, W - 28, 15, on ? '#0d3a1a' : '#08140c', on ? '#39ff6a' : '#16813a', '#020805', !on);
        drawText(ctx, `${i + 1} ${NAMES[id]}`, 20, y + 5, { color: on ? C.white : C.green });
        drawText(ctx, `${bests[id] || 0}/${TARGETS[id]}`, W - 20, y + 5, { align: 'right', color: (bests[id] || 0) >= TARGETS[id] ? C.amber : C.greenDim });
      });
      const rows = (board()[GAMES[sel]] || []).slice(0, 3);
      drawText(ctx, `TODAY ${NAMES[GAMES[sel]]}`, 14, 112, { color: C.amberDim });
      if (!rows.length) drawText(ctx, '---', 14, 122, { color: C.greenDim });
      rows.forEach((r, i) => {
        const x = 14 + (i % 2) * 96, y = 122 + Math.floor(i / 2) * 9;
        drawText(ctx, `${i + 1} ${String(r.n || '?').toUpperCase().slice(0, 12)}`, x, y, { color: i === 0 ? C.amber : C.greenMid });
        drawText(ctx, String(r.s), x + 84, y, { align: 'right', color: C.green });
      });
    } else {
      game.draw(ctx);
      if (mode === 'over') {
        pxRect(ctx, 0, 0, W, H, 'rgba(0,0,0,0.55)');
        bevel(ctx, 30, 40, W - 60, 66, '#08140c', '#39ff6a', '#020805');
        drawText(ctx, last.why === 'time' ? 'TIME UP' : 'GAME OVER', W / 2, 48, { align: 'center', scale: 2, color: last.hit ? C.amber : C.red });
        drawText(ctx, String(last.score), W / 2, 68, { align: 'center', scale: 3, color: C.white, shadow: '#04240f' });
        drawText(ctx, last.hit ? 'TARGET BEATEN' : last.best ? 'NEW BEST' : `BEST ${bests[gid] || 0}`, W / 2, 92, { align: 'center', color: last.best || last.hit ? C.amber : C.greenMid });
      }
    }
    parts.draw(ctx);
    pxRect(ctx, 0, 0, W, 1, 'rgba(255,255,255,0.05)');
  };
  return mg.api;
}
