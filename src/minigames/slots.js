/**
 * GACHA MACHINE — 3-reel slot machine.
 *
 * createSlots(opts) -> { el, update, destroy }
 *   opts.balance: number            current coins (display only — the game is the authority)
 *   opts.bets: number[]             default [10, 25, 50, 100, 250]
 *   opts.onSpin(bet, win) -> newBalance   called once per spin when the lever is pulled
 *                                          (may also return a Promise<number>)
 *   Stays open until ESC. result: { success: true, cancelled: false, net, spins, balance }
 */
import {
  createMinigame,
  makeCanvas,
  drawText,
  drawTextOutlined,
  textWidth,
  drawSprite,
  spriteFromRows,
  padSprite,
  tintSprite,
  makeFishSprite,
  FISH_PAL,
  createParticles,
  floatText,
  bevel,
  mulberry32,
  shuffle,
  clamp,
  clamp01,
  lerp,
  mod,
  fxRand,
  hsl,
  mixColor,
  easeOutCubic,
} from './common.js';

const W = 192;
const H = 144;

// ───────────────────────────────────────────── symbols ──
export const SYMBOLS = ['cherry', 'kefal', 'bell', 'anchor', 'seven', 'skull', 'golden'];
const WEIGHTS = { cherry: 5, kefal: 5, bell: 3, anchor: 3, seven: 2, skull: 2, golden: 1 };

/** Paytable (multipliers of the bet). 'three' = 3 of a kind, 'count' = exactly n on the line. Best single rule pays. */
export const PAYTABLE = [
  { kind: 'three', sym: 'golden', mult: 100, label: 'JACKPOT' },
  { kind: 'three', sym: 'seven', mult: 25 },
  { kind: 'three', sym: 'bell', mult: 10 },
  { kind: 'three', sym: 'anchor', mult: 8 },
  { kind: 'three', sym: 'kefal', mult: 5 },
  { kind: 'three', sym: 'cherry', mult: 3 },
  { kind: 'three', sym: 'skull', mult: 0, label: 'THE ALGORITHM WINS' },
  { kind: 'count', sym: 'golden', n: 2, mult: 10 },
  { kind: 'count', sym: 'seven', n: 2, mult: 3 },
  { kind: 'count', sym: 'golden', n: 1, mult: 2 },
  { kind: 'count', sym: 'cherry', n: 2, mult: 1.5 },
  { kind: 'count', sym: 'kefal', n: 2, mult: 1, label: 'MONEY BACK' },
];

export function evaluateSpin(line) {
  if (line[0] === line[1] && line[1] === line[2]) {
    const rule = PAYTABLE.find((p) => p.kind === 'three' && p.sym === line[0]);
    if (rule) {
      const kind = rule.sym === 'golden' ? 'jackpot' : rule.sym === 'skull' ? 'company' : 'three';
      return { mult: rule.mult, rule, kind, cells: [true, true, true] };
    }
  }
  let best = null;
  for (const r of PAYTABLE) {
    if (r.kind !== 'count') continue;
    const n = line.filter((s) => s === r.sym).length;
    if (n === r.n && (!best || r.mult > best.mult)) best = r;
  }
  if (best) return { mult: best.mult, rule: best, kind: best.mult > 1 ? 'win' : 'push', cells: line.map((s) => s === best.sym) };
  return { mult: 0, rule: null, kind: 'lose', cells: [false, false, false] };
}

function buildStrips() {
  const r = mulberry32(0x4b3fa1);
  const strips = [];
  for (let i = 0; i < 3; i++) {
    const s = [];
    for (const sym of SYMBOLS) for (let k = 0; k < WEIGHTS[sym]; k++) s.push(sym);
    shuffle(r, s);
    strips.push(s);
  }
  return strips;
}
const STRIPS = buildStrips();
const L = STRIPS[0].length;

const P_CHERRY = { k: '#140606', r: '#e8303a', R: '#8e1420', w: '#ffffff', g: '#5fe36a', G: '#1f7a2c' };
const P_BELL = { k: '#1a1004', y: '#ffd23f', Y: '#b87a0e', w: '#fff8d0' };
const P_SEVEN = { k: '#140404', r: '#ff2a3a', R: '#8e1420', p: '#ff9aa8' };
const P_ANCHOR = { k: '#06101a', s: '#9fc4dc', S: '#3c6a8a' };
const P_SKULL = { k: '#0a0808', w: '#e8e2cc', m: '#9a948a' };

let SPR = null;
function sprites() {
  if (SPR) return SPR;
  const s = {
    cherry: spriteFromRows(
      [
        '................',
        '.........GG.....',
        '........GgG.....',
        '.......G.G......',
        '......G...G.....',
        '.....G....G.....',
        '....G......G....',
        '..kkkk....kkkk..',
        '.krrrrk..krrrrk.',
        'krwrrrrkkrwrrrrk',
        'krwrrrrkkrwrrrrk',
        'krrrrrRkkrrrrrRk',
        'krrrrRRkkrrrrRRk',
        '.kRRRRk..kRRRRk.',
        '..kkkk....kkkk..',
        '................',
      ],
      P_CHERRY,
    ),
    bell: spriteFromRows(
      [
        '.......kk.......',
        '......kYYk......',
        '.....kyyyYk.....',
        '....kyywyyYk....',
        '....kywyyyYk....',
        '...kyywyyyyYk...',
        '...kywyyyyyYk...',
        '...kywyyyyyYk...',
        '..kyywyyyyyyYk..',
        '..kyyyyyyyyyYk..',
        '.kyyyyyyyyyyyYk.',
        '.kYYYYYYYYYYYYk.',
        '..kkkkkkkkkkkk..',
        '......kYYk......',
        '.......kk.......',
        '................',
      ],
      P_BELL,
    ),
    seven: spriteFromRows(
      [
        '................',
        '.kkkkkkkkkkkkkk.',
        '.krppppppppppRk.',
        '.krrrrrrrrrrrRk.',
        '.kkkkkkkkkrrrRk.',
        '........krrrRk..',
        '.......krrrRk...',
        '......krrrRk....',
        '......krrRk.....',
        '.....krrrRk.....',
        '.....krrRk......',
        '....krrrRk......',
        '....krrRk.......',
        '....krrRk.......',
        '....kkkkk.......',
        '................',
      ],
      P_SEVEN,
    ),
    anchor: spriteFromRows(
      [
        '......kkkk......',
        '.....kskksk.....',
        '.....kskksk.....',
        '......kssk......',
        '..kkkkksSkkkkk..',
        '..ksssssSSSSSk..',
        '..kkkkksSkkkkk..',
        '......ksSk......',
        '......ksSk......',
        '......ksSk......',
        '.k....ksSk....k.',
        'kSk...ksSk...kSk',
        'ksSk..ksSk..kSsk',
        '.ksSkkksSkkkSsk.',
        '..kssSSSSSSssk..',
        '...kkkkkkkkkk...',
      ],
      P_ANCHOR,
    ),
    skull: spriteFromRows(
      [
        '................',
        '.....kkkkkk.....',
        '...kkwwwwwwkk...',
        '..kwwwwwwwwwwk..',
        '.kwwwwwwwwwwwwk.',
        '.kwwkkkwwkkkwwk.',
        '.kwkkkkwwkkkkwk.',
        '.kwkkkkwwkkkkwk.',
        '.kwwkkwwwwkkwwk.',
        '..kwwwwkkwwwwk..',
        '...kwwwkkwwwk...',
        '...kmwwwwwwmk...',
        '....kwkwkwkwk...',
        '....kwkwkwkwk...',
        '.....kkkkkkk....',
        '................',
      ],
      P_SKULL,
    ),
    kefal: padSprite(makeFishSprite(16, 11, FISH_PAL.kefal, { hair: true }), 16, 16),
    golden: padSprite(makeFishSprite(16, 11, FISH_PAL.golden, { hair: true }), 16, 16),
  };
  s.white = {};
  for (const k of SYMBOLS) s.white[k] = tintSprite(s[k], '#ffffff');
  s.coin = spriteFromRows(['.kkkk.', 'kyyyYk', 'kywyYk', 'kyyyYk', 'kYYYYk', '.kkkk.'], { k: '#3a2400', y: '#ffd23f', Y: '#c98a12', w: '#fff8d0' });
  SPR = s;
  return s;
}

// ───────────────────────────────────────────── layout ──
const REEL_X = [16, 56, 96];
const REEL_W = 36;
const WIN_Y0 = 22;
const WIN_Y1 = 98;
const REEL_CY = 60;
const SYM = 34;
const LEVER = { x: 172, pivot: 62, top: 30, bottom: 94 };
const BOX = {
  bal: { x: 8, y: 104, w: 62, h: 24 },
  bet: { x: 74, y: 104, w: 48, h: 24 },
  win: { x: 126, y: 104, w: 58, h: 24 },
};
const BET_DOWN = { x: 74, y: 104, w: 14, h: 24 };
const BET_UP = { x: 108, y: 104, w: 14, h: 24 };
const LEVER_HIT = { x: 140, y: 20, w: 50, h: 82 };
const TITLE_HIT = { x: 20, y: 0, w: 152, h: 20 };
const REELS_HIT = { x: 14, y: WIN_Y0, w: 122, h: WIN_Y1 - WIN_Y0 };
const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const LOSE_QUIPS = ['NO LUCK', 'THE ALGORITHM THANKS YOU', 'TRY AGAIN, INTERN', 'HOUSE ALWAYS WINS', 'DEDUCTED FROM SALARY', 'THE ALGORITHM SAYS NO'];
const TICKER =
  '*** GACHA MACHINE *** 3x GOLDEN PHISH PAYS 100x - JACKPOT! *** 3x SEVEN 25x *** 3x BELL 10x *** 3x ANCHOR 8x *** 3x PHISH 5x *** 3x CHERRY 3x *** ANY GOLDEN PHISH 2x *** PRESS [P] OR CLICK THE SIGN FOR THE PAYTABLE *** GAMBLING IS A VALID RETIREMENT PLAN *** 3 SKULLS: THE ALGORITHM WINS ***   ';

function buildCabinet() {
  const { canvas, ctx } = makeCanvas(W, H);
  // cabinet body
  for (let y = 0; y < H; y++) {
    ctx.fillStyle = mixColor('#4a0c18', '#1e0408', y / H);
    ctx.fillRect(0, y, W, 1);
  }
  // diamond pattern
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if ((x + y) % 12 === 0 || mod(x - y, 12) === 0) {
        ctx.fillStyle = 'rgba(255,180,60,0.06)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // reel window bezel (gold)
  bevel(ctx, 11, WIN_Y0 - 3, 128, WIN_Y1 - WIN_Y0 + 6, '#8a6a10', '#ffe066', '#3a2400');
  bevel(ctx, 13, WIN_Y0 - 1, 124, WIN_Y1 - WIN_Y0 + 2, '#050505', '#050505', '#050505');
  // lever housing
  bevel(ctx, 160, 54, 14, 18, '#6a6f74', '#c8d0d4', '#1a1c1e');
  ctx.fillStyle = '#1a1c1e';
  ctx.fillRect(166, 58, 3, 10);
  // info boxes
  for (const b of Object.values(BOX)) {
    bevel(ctx, b.x, b.y, b.w, b.h, '#8a6a10', '#ffe066', '#3a2400');
    ctx.fillStyle = '#020604';
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
  }
  // coin tray
  bevel(ctx, 70, 132, 52, 8, '#2a2a2a', '#6a6a6a', '#0a0a0a', true);
  return canvas;
}

function buildReelBg() {
  const h = WIN_Y1 - WIN_Y0;
  const { canvas, ctx } = makeCanvas(REEL_W, h);
  for (let y = 0; y < h; y++) {
    const v = Math.abs(y + WIN_Y0 - REEL_CY) / (h / 2);
    ctx.fillStyle = mixColor('#fbf3de', '#8a7a62', v * v);
    ctx.fillRect(0, y, REEL_W, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 1, h);
  ctx.fillRect(REEL_W - 1, 0, 1, h);
  return canvas;
}

function buildReelShade() {
  const h = WIN_Y1 - WIN_Y0;
  const { canvas, ctx } = makeCanvas(REEL_W, h);
  for (let y = 0; y < h; y++) {
    const v = Math.abs(y + WIN_Y0 - REEL_CY) / (h / 2);
    const a = clamp01((v - 0.45) * 1.5);
    if (a <= 0) continue;
    // dithered darkening
    for (let x = 0; x < REEL_W; x++) {
      if (a > 0.66 || (a > 0.33 ? (x + y) % 2 === 0 : (x + y) % 4 === 0)) {
        ctx.fillStyle = `rgba(20,8,4,${0.35 + a * 0.5})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

// ───────────────────────────────────────────── the machine ──
export function createSlots(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'slots',
    title: 'GACHA MACHINE',
    tag: 'LEISURE DEPT.',
    help: '[</>] bet   [SPACE] pull lever   [P] paytable   [ESC] cash out',
    width: W,
    height: H,
  });
  const { ctx, opts } = mg;
  const rng = opts.rng;
  const sfx = opts.sfx;
  const S = sprites();

  const cabinet = buildCabinet();
  const reelBg = buildReelBg();
  const reelShade = buildReelShade();
  const tickerStrip = makeCanvas(textWidth(TICKER) + 4, 5);
  drawText(tickerStrip.ctx, TICKER, 0, 0, { color: '#ffb000' });
  const parts = createParticles(420);

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  let bets = Array.isArray(opts.bets) ? opts.bets.map(Number).filter((b) => b > 0 && Number.isFinite(b)) : [];
  if (!bets.length) bets = [10, 25, 50, 100, 250];
  bets = [...new Set(bets)].sort((a, b) => a - b);

  let balance = isNum(Number(opts.balance)) ? Number(opts.balance) : 0; // last known balance from the game
  let shownBal = balance;
  let betIdx = 0;
  let net = 0;
  let spins = 0;
  let lastWin = 0;
  let shownWin = 0;

  let state = 'idle'; // idle | spinning | result
  let stateT = 0;
  let t = 0;
  let spinT = 0;
  let outcome = null; // { stops, line, res, win, bet, after }
  let lever = 0; // 0 rest .. 1 pulled
  let leverV = 0;
  let leverAnim = -1;
  let showPay = false;
  let banner = null; // { text, sub, color, t, kind }
  let hover = null;
  let tickerX = 0;
  let pendingBalance = null;

  const reels = [0, 1, 2].map((i) => ({
    pos: Math.floor(fxRand(0, L)),
    state: 'idle',
    v: 0,
    from: 0,
    to: 0,
    t: 0,
    dur: 0.42,
    stopAt: 0,
    stop: 0,
  }));

  const bet = () => bets[betIdx];
  const affordable = () => bets.filter((b) => b <= balance);

  function fixBet() {
    if (bet() <= balance) return false;
    let k = -1;
    for (let i = 0; i < bets.length; i++) if (bets[i] <= balance) k = i;
    if (k >= 0 && k !== betIdx) {
      betIdx = k;
      return true;
    }
    return false;
  }
  fixBet();

  function updateStatus() {
    const s = net >= 0 ? `+${net}` : `${net}`;
    mg.setStatus(`NET ${s}`, net > 0 ? 'good' : net < 0 ? 'warn' : 'dim');
  }
  updateStatus();

  function say(text, color = '#ffffff', sub = '', kind = 'info', dur = 1.8) {
    banner = { text, color, sub, t: 0, dur, kind };
  }

  function changeBet(d) {
    if (state === 'spinning') return;
    const ni = clamp(betIdx + d, 0, bets.length - 1);
    if (ni === betIdx) {
      sfx('ui_error');
      return;
    }
    if (d > 0 && bets[ni] > balance) {
      sfx('ui_error');
      say('NOT ENOUGH COINS', '#ff4040');
      mg.shake(2);
      return;
    }
    betIdx = ni;
    sfx('ui_click');
  }

  function nextAligned(p, stopIdx) {
    let n = Math.ceil(p);
    n += mod(stopIdx - n, L);
    return n;
  }

  function spin() {
    if (showPay) {
      showPay = false;
      sfx('ui_click');
      return;
    }
    if (state === 'spinning') {
      slam();
      return;
    }
    fixBet();
    const b = bet();
    if (b > balance) {
      sfx('ui_error');
      mg.shake(3);
      say(affordable().length ? 'NOT ENOUGH COINS' : 'OUT OF COINS', '#ff4040', 'GO SCAVENGE, INTERN');
      return;
    }
    const stops = [0, 1, 2].map(() => Math.min(L - 1, Math.floor(rng() * L)));
    const line = stops.map((s, i) => STRIPS[i][s]);
    const res = evaluateSpin(line);
    const win = Math.floor(b * res.mult);
    let ret;
    try {
      ret = typeof opts.onSpin === 'function' ? opts.onSpin(b, win) : undefined;
    } catch (err) {
      console.error('[slots] onSpin threw', err);
      sfx('ui_error');
      say('TRANSACTION DECLINED', '#ff4040');
      return;
    }
    if (ret === false) {
      sfx('ui_error');
      say('TRANSACTION DECLINED', '#ff4040');
      return;
    }
    const expected = balance - b + win;
    let after = expected;
    if (isNum(ret)) after = ret;
    else if (ret && typeof ret.then === 'function') {
      pendingBalance = ret;
      ret.then(
        (v) => {
          if (pendingBalance !== ret) return;
          pendingBalance = null;
          if (isNum(v)) {
            if (outcome && outcome.after === expected) outcome.after = v;
            if (state !== 'spinning') balance = v;
          }
        },
        () => {
          pendingBalance = null;
        },
      );
    }
    spins++;
    net += win - b;
    outcome = { stops, line, res, win, bet: b, after };
    balance = Math.max(0, after - win); // show the bet leaving the machine now, the win lands later
    lastWin = 0;
    shownWin = 0;
    banner = null;
    state = 'spinning';
    stateT = 0;
    spinT = 0;
    leverAnim = 0;
    sfx('slot_spin');
    mg.shake(1.5);

    let extra = 0;
    const a = line[0];
    const bb = line[1];
    if ((a === bb && (a === 'seven' || a === 'golden' || a === 'bell')) || (a === 'golden' && bb === 'golden')) extra = 1.1;
    reels.forEach((r, i) => {
      r.state = 'spin';
      r.v = 0;
      r.stop = stops[i];
      r.stopAt = 0.8 + i * 0.42 + (i === 2 ? extra : 0);
      r.tease = i === 2 && extra > 0;
    });
  }

  function slam() {
    let k = 0;
    for (const r of reels) {
      if (r.state === 'spin') {
        r.stopAt = Math.min(r.stopAt, spinT + 0.05 + k * 0.1);
        k++;
      }
    }
  }

  function allStopped() {
    const { res, win, line } = outcome;
    state = 'result';
    stateT = 0;
    lastWin = win;
    balance = outcome.after;
    updateStatus();
    const k = res.kind;
    if (k === 'jackpot') {
      sfx('slot_jackpot');
      sfx('coins');
      mg.shake(10);
      mg.flash('#ffe066', 0.7);
      mg.glitch(0.4);
      say('JACKPOT!!!', '#ffe066', `+${win}`, 'jackpot', 4);
      coinFountain(80);
    } else if (k === 'company') {
      sfx('slot_lose');
      mg.shake(6);
      mg.flash('#ff0000', 0.45);
      mg.glitch(0.25);
      say('THE ALGORITHM WINS', '#ff4040', 'ALL YOUR DATA ARE OURS', 'company', 2.6);
    } else if (k === 'three' || k === 'win') {
      const big = res.mult >= 10;
      sfx('slot_win');
      sfx('coins');
      mg.shake(big ? 6 : 2.5);
      mg.flash(big ? '#ffe066' : '#39ff6a', big ? 0.45 : 0.25);
      const label =
        k === 'three'
          ? big
            ? 'BIG WIN!'
            : 'WINNER!'
          : res.rule.sym === 'golden'
            ? res.rule.n === 2
              ? 'DOUBLE GOLD!'
              : 'GOLDEN PHISH!'
            : res.rule.sym === 'seven'
              ? 'PAIR OF 7S!'
              : 'CHERRIES!';
      say(label, big ? '#ffe066' : '#39ff6a', `+${win}`, 'win', 2.2);
      coinFountain(Math.min(60, 6 + Math.round(res.mult * 3)));
    } else if (k === 'push') {
      sfx('ui_confirm');
      say('MONEY BACK', '#9fdcff', `+${win}`, 'push', 1.6);
      coinFountain(4);
    } else {
      sfx('slot_lose');
      const nearMiss = line[0] === line[1] || line[1] === line[2] || line[0] === line[2];
      say(nearMiss ? 'SO CLOSE!' : LOSE_QUIPS[Math.floor(Math.random() * LOSE_QUIPS.length)], '#c8b8a8', '', 'lose', 1.5);
    }
    if (fixBet()) floatText(parts, 'BET LOWERED', 98, 100, '#ffb000', { life: 1.2 });
  }

  function coinFountain(n) {
    parts.burst(n, (i) => ({
      x: 96 + fxRand(-14, 14),
      y: 132,
      vx: fxRand(-75, 75),
      vy: -fxRand(90, 200) - (i % 5) * 4,
      g: 270,
      life: fxRand(1.4, 2.4),
      floor: 139,
      bounce: 0.45,
      spin: fxRand(0, 6),
      draw(c, p) {
        p.spin += 0.35;
        const sw = Math.max(1, Math.round(6 * Math.abs(Math.cos(p.spin))));
        drawSprite(c, S.coin, p.x - sw / 2, p.y - 3, { sw });
      },
    }));
  }

  // ───────────── input
  mg.onKeyDown = (e) => {
    const c = e.code;
    if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
      if (!e.repeat) spin();
      return true;
    }
    if (c === 'ArrowLeft' || c === 'ArrowDown' || c === 'KeyA' || c === 'KeyS' || c === 'Minus' || c === 'NumpadSubtract') {
      if (!e.repeat || c.startsWith('Arrow')) changeBet(-1);
      return true;
    }
    if (c === 'ArrowRight' || c === 'ArrowUp' || c === 'KeyD' || c === 'KeyW' || c === 'Equal' || c === 'NumpadAdd') {
      if (!e.repeat || c.startsWith('Arrow')) changeBet(1);
      return true;
    }
    if (c === 'KeyP' || c === 'Tab') {
      if (!e.repeat) {
        showPay = !showPay;
        sfx('ui_click');
      }
      return true;
    }
    return false;
  };

  mg.onPointerMove = (x, y) => {
    hover = inRect(BET_DOWN, x, y) ? 'down' : inRect(BET_UP, x, y) ? 'up' : inRect(LEVER_HIT, x, y) ? 'lever' : inRect(TITLE_HIT, x, y) ? 'title' : inRect(REELS_HIT, x, y) ? 'reels' : null;
    mg.setCursor(hover && hover !== 'reels' ? 'pointer' : 'default');
  };
  mg.onPointerDown = (x, y) => {
    if (showPay) {
      showPay = false;
      sfx('ui_click');
      return;
    }
    if (inRect(BET_DOWN, x, y)) changeBet(-1);
    else if (inRect(BET_UP, x, y)) changeBet(1);
    else if (inRect(LEVER_HIT, x, y) || inRect(REELS_HIT, x, y)) spin();
    else if (inRect(TITLE_HIT, x, y)) {
      showPay = true;
      sfx('ui_click');
    }
  };

  mg.onEscape = () => {
    mg.finish({ success: true, cancelled: false, net, spins, balance: outcome ? outcome.after : balance });
  };

  // ───────────── frame
  mg.onFrame = (dt) => {
    t += dt;
    stateT += dt;
    tickerX += dt * 22;

    // lever spring
    if (leverAnim >= 0) {
      leverAnim += dt;
      lever = leverAnim < 0.12 ? easeOutCubic(leverAnim / 0.12) : 1 - easeOutCubic((leverAnim - 0.12) / 0.45);
      if (leverAnim > 0.57) {
        leverAnim = -1;
        lever = 0;
      }
    }

    if (state === 'spinning') {
      spinT += dt;
      let stopped = 0;
      reels.forEach((r, i) => {
        if (r.state === 'spin') {
          // quick wind-up kick, then full speed
          r.v = spinT < 0.1 ? -4 : Math.min(r.tease && spinT > r.stopAt - 1.1 ? 9 : 17, r.v + dt * 80);
          r.pos += r.v * dt;
          if (spinT >= r.stopAt) {
            r.state = 'stopping';
            r.from = r.pos;
            r.to = nextAligned(r.pos + 2.2, r.stop);
            r.t = 0;
            r.dur = 0.42;
          }
        } else if (r.state === 'stopping') {
          r.t += dt;
          const u = clamp01(r.t / r.dur);
          const over = 0.22;
          if (u < 0.75) r.pos = r.from + (r.to + over - r.from) * easeOutCubic(u / 0.75);
          else r.pos = r.to + over * (1 - easeOutCubic((u - 0.75) / 0.25));
          if (u >= 1) {
            r.pos = r.to;
            r.state = 'idle';
            sfx('slot_stop');
            mg.shake(1.2);
            parts.burst(4, () => ({
              x: REEL_X[i] + fxRand(2, REEL_W - 2),
              y: WIN_Y1 - 2,
              vx: fxRand(-10, 10),
              vy: -fxRand(5, 20),
              life: 0.4,
              color: '#ffe066',
            }));
          }
        }
        if (r.state === 'idle') stopped++;
      });
      if (stopped === 3) allStopped();
    }

    // counters
    const target = balance;
    const rate = Math.max(40, Math.abs(target - shownBal) * 3);
    shownBal = Math.abs(target - shownBal) < rate * dt ? target : shownBal + Math.sign(target - shownBal) * rate * dt;
    const wrate = Math.max(30, lastWin * 1.2);
    shownWin = Math.min(lastWin, shownWin + wrate * dt);

    if (banner) {
      banner.t += dt;
      if (banner.t > banner.dur) banner = null;
    }
    if (state === 'result' && outcome && outcome.res.kind === 'jackpot' && stateT < 3 && Math.random() < dt * 30) {
      parts.spawn({
        x: fxRand(10, W - 10),
        y: -4,
        vx: fxRand(-10, 10),
        vy: fxRand(20, 60),
        g: 120,
        life: 2,
        floor: 139,
        bounce: 0.3,
        spin: fxRand(0, 6),
        draw(c, p) {
          p.spin += 0.3;
          const sw = Math.max(1, Math.round(6 * Math.abs(Math.cos(p.spin))));
          drawSprite(c, S.coin, p.x - sw / 2, p.y - 3, { sw });
        },
      });
    }
    parts.update(dt);
    render();
  };

  // ───────────── render
  function drawBulbs() {
    const speed = state === 'spinning' ? 14 : state === 'result' && outcome && outcome.res.mult > 0 ? 22 : 5;
    const phase = Math.floor(t * speed);
    const jackpot = state === 'result' && outcome && outcome.res.kind === 'jackpot';
    const company = state === 'result' && outcome && outcome.res.kind === 'company';
    let i = 0;
    const bulb = (x, y) => {
      const on = jackpot ? (i + phase) % 2 === 0 : (i + phase) % 3 === 0;
      let col = on ? (i % 2 ? '#ffe066' : '#ff5a3a') : '#4a1a10';
      if (jackpot && on) col = hsl(i * 40 + t * 600, 100, 60);
      if (company) col = on ? '#ff2020' : '#300404';
      ctx.fillStyle = '#120404';
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
      if (on) {
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.globalAlpha = 1;
      }
      i++;
    };
    for (let x = 3; x < W - 2; x += 6) bulb(x, 2);
    for (let y = 8; y < H - 2; y += 6) bulb(W - 3, y);
    for (let x = W - 3; x > 2; x -= 6) bulb(x, H - 2);
    for (let y = H - 8; y > 2; y -= 6) bulb(2, y);
  }

  function drawTitle() {
    const flick = Math.random() < 0.03;
    drawText(ctx, 'GACHA MACHINE', W / 2, 6, {
      scale: 2,
      align: 'center',
      shadow: '#5a0a2a',
      charColor: (i) => {
        if (i === 3 && flick) return '#3a0a1a';
        if (state === 'result' && outcome && outcome.res.kind === 'jackpot') return hsl(t * 400 + i * 30, 100, 65);
        return i < 5 ? '#ff5fb0' : '#ffe066';
      },
    });
    if (hover === 'title') drawText(ctx, 'PAYTABLE', W / 2, 17, { align: 'center', color: '#ffffff' });
  }

  function drawReels() {
    const win = state === 'result' && outcome && outcome.res.mult > 0;
    const blink = Math.floor(stateT * 8) % 2 === 0;
    reels.forEach((r, i) => {
      const rx = REEL_X[i];
      ctx.drawImage(reelBg, rx, WIN_Y0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, WIN_Y0, REEL_W, WIN_Y1 - WIN_Y0);
      ctx.clip();
      const base = Math.floor(r.pos);
      const frac = r.pos - base;
      const fast = Math.abs(r.v) > 6 && r.state === 'spin';
      for (let k = -2; k <= 2; k++) {
        const sym = STRIPS[i][mod(base + k, L)];
        const y = Math.round(REEL_CY + (-k + frac) * SYM - 16);
        const center = k === 0 && frac === 0;
        let spr = S[sym];
        if (win && center && outcome.res.cells[i] && blink) spr = S.white[sym];
        if (fast) {
          drawSprite(ctx, spr, rx + 2, y - 6, { scale: 2, alpha: 0.25 });
          drawSprite(ctx, spr, rx + 2, y, { scale: 2, alpha: 0.6 });
        } else {
          drawSprite(ctx, spr, rx + 2, y, { scale: 2 });
        }
        if (sym === 'golden' && !fast && Math.floor(t * 6 + i) % 4 === 0) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx + 24, y + 8, 1, 3);
          ctx.fillRect(rx + 23, y + 9, 3, 1);
        }
      }
      if (fast) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let s = 0; s < 4; s++) ctx.fillRect(rx + 4 + s * 9, WIN_Y0, 1, WIN_Y1 - WIN_Y0);
      }
      ctx.restore();
      ctx.drawImage(reelShade, rx, WIN_Y0);
      // win frame
      if (win && outcome.res.cells[i]) {
        const col = blink ? '#ffe066' : '#ffffff';
        ctx.fillStyle = col;
        ctx.fillRect(rx, REEL_CY - 17, REEL_W, 1);
        ctx.fillRect(rx, REEL_CY + 16, REEL_W, 1);
        ctx.fillRect(rx, REEL_CY - 17, 1, 34);
        ctx.fillRect(rx + REEL_W - 1, REEL_CY - 17, 1, 34);
      }
      // tease: reel 3 pulses while it's slow-rolling
      if (r.tease && r.state !== 'idle' && state === 'spinning' && spinT > 1.2) {
        ctx.fillStyle = Math.floor(t * 10) % 2 ? '#ffb000' : '#ff3030';
        ctx.fillRect(rx - 1, WIN_Y0, 1, WIN_Y1 - WIN_Y0);
        ctx.fillRect(rx + REEL_W, WIN_Y0, 1, WIN_Y1 - WIN_Y0);
      }
    });
    // payline markers
    const plc = win && blink ? '#ffffff' : '#ff3a3a';
    for (const [x, d] of [[9, 1], [137, -1]]) {
      ctx.fillStyle = plc;
      for (let k = 0; k < 4; k++) ctx.fillRect(x + (d > 0 ? k : -k + 3) - (d > 0 ? 0 : 0), REEL_CY - 3 + k, 1, 7 - k * 2);
    }
    ctx.fillStyle = 'rgba(255,58,58,0.25)';
    ctx.fillRect(14, REEL_CY, 122, 1);
    // glass glare
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(14, WIN_Y0 + 2, 122, 6);
  }

  function drawLever() {
    const kx = LEVER.x;
    const ky = Math.round(lerp(LEVER.top, LEVER.bottom, lever));
    const py = LEVER.pivot;
    // stick
    const x0 = kx;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x0 - 2, Math.min(ky, py), 4, Math.abs(py - ky) + 1);
    ctx.fillStyle = '#b8c0c4';
    ctx.fillRect(x0 - 1, Math.min(ky, py), 2, Math.abs(py - ky) + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 - 1, Math.min(ky, py), 1, Math.abs(py - ky) + 1);
    // knob grows as it swings toward the viewer
    const r = 4 + Math.round(Math.sin(lever * Math.PI) * 2);
    const glow = hover === 'lever' && state !== 'spinning';
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
      ctx.fillStyle = '#300404';
      ctx.fillRect(kx - w - 1, ky + y, w * 2 + 3, 1);
    }
    for (let y = -r + 1; y <= r - 1; y++) {
      const w = Math.floor(Math.sqrt((r - 1) * (r - 1) - y * y + r * 0.6));
      ctx.fillStyle = y < -r / 3 ? (glow ? '#ff9a9a' : '#ff5a5a') : glow ? '#ff4040' : '#d81a1a';
      ctx.fillRect(kx - w, ky + y, w * 2 + 1, 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(kx - Math.max(1, r - 3), ky - r + 2, 2, 1);
    if (state === 'idle' && Math.floor(t * 2) % 2 && !banner) {
      drawTextOutlined(ctx, 'PULL', kx, LEVER.bottom + 2, { align: 'center', color: '#ffe066' });
    }
  }

  function drawBoxes() {
    const b1 = BOX.bal;
    drawText(ctx, 'COINS', b1.x + b1.w / 2, b1.y + 4, { align: 'center', color: '#ffb000' });
    const bal = Math.round(shownBal);
    const bs = String(bal).length > 7 ? 1 : 2;
    drawText(ctx, String(bal), b1.x + b1.w / 2, b1.y + (bs === 2 ? 11 : 13), { scale: bs, align: 'center', color: bal < bet() ? '#ff4040' : '#39ff6a' });

    const b2 = BOX.bet;
    drawText(ctx, 'BET', b2.x + b2.w / 2, b2.y + 4, { align: 'center', color: '#ffb000' });
    const bv = String(bet());
    const bsc = bv.length > 3 ? 1 : 2;
    drawText(ctx, bv, b2.x + b2.w / 2, b2.y + (bsc === 2 ? 11 : 13), { scale: bsc, align: 'center', color: '#ffffff' });
    const canDown = betIdx > 0 && state !== 'spinning';
    const canUp = betIdx < bets.length - 1 && bets[betIdx + 1] <= balance && state !== 'spinning';
    drawText(ctx, '<', b2.x + 5, b2.y + 11, { scale: 2, align: 'center', color: canDown ? (hover === 'down' ? '#ffffff' : '#ffb000') : '#3a2a10' });
    drawText(ctx, '>', b2.x + b2.w - 5, b2.y + 11, { scale: 2, align: 'center', color: canUp ? (hover === 'up' ? '#ffffff' : '#ffb000') : '#3a2a10' });

    const b3 = BOX.win;
    drawText(ctx, 'WIN', b3.x + b3.w / 2, b3.y + 4, { align: 'center', color: '#ffb000' });
    const wv = Math.floor(shownWin);
    const ws = String(wv).length > 6 ? 1 : 2;
    const hot = state === 'result' && lastWin > 0 && Math.floor(t * 8) % 2;
    drawText(ctx, String(wv), b3.x + b3.w / 2, b3.y + (ws === 2 ? 11 : 13), { scale: ws, align: 'center', color: hot ? '#ffffff' : lastWin > 0 ? '#ffe066' : '#5a4a20' });
  }

  function drawTicker() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(6, 131, 62, 9);
    ctx.rect(124, 131, 62, 9);
    ctx.clip();
    const tw = tickerStrip.canvas.width;
    const x0 = Math.round(186 - mod(tickerX, tw));
    ctx.drawImage(tickerStrip.canvas, x0, 133);
    ctx.drawImage(tickerStrip.canvas, x0 + tw, 133);
    ctx.restore();
  }

  function drawBanner() {
    if (!banner) return;
    const b = banner;
    const pop = b.t < 0.12 ? 1 : 0;
    if (b.kind === 'jackpot') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(14, 40, 122, 40);
      drawText(ctx, b.text, 75, 46 - pop, {
        scale: 3,
        align: 'center',
        shadow: '#000',
        charColor: (i) => hsl(t * 500 + i * 40, 100, 62),
        wave: { amp: 2, t, speed: 12 },
      });
      if (b.sub) drawTextOutlined(ctx, b.sub, 75, 68, { scale: 2, align: 'center', color: '#ffe066' });
      return;
    }
    const big = b.kind === 'company' || b.kind === 'win';
    const y = big ? 76 : 80;
    const hgt = big ? 20 : 14;
    ctx.fillStyle = b.kind === 'company' ? 'rgba(80,0,0,0.85)' : 'rgba(0,0,0,0.72)';
    ctx.fillRect(14, y, 122, hgt);
    const col = b.kind === 'company' && Math.floor(t * 6) % 2 ? '#ffe066' : b.color;
    drawTextOutlined(ctx, b.text, 75, y + 3 - pop, { scale: 1, align: 'center', color: col });
    if (b.sub) drawText(ctx, b.sub, 75, y + 11, { align: 'center', color: b.kind === 'company' ? '#ff9a9a' : '#ffe066' });
  }

  function drawPaytable() {
    ctx.fillStyle = '#070303';
    ctx.fillRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(4, 4, W - 8, 1);
    ctx.fillRect(4, H - 5, W - 8, 1);
    drawText(ctx, 'PAYTABLE', W / 2, 8, { scale: 2, align: 'center', color: '#ffe066', shadow: '#3a2400' });
    const threes = PAYTABLE.filter((p) => p.kind === 'three');
    let y = 22;
    for (const p of threes) {
      for (let k = 0; k < 3; k++) drawSprite(ctx, S[p.sym], 8 + k * 14, y - 2, { scale: 1 });
      const txt = p.mult > 0 ? `${p.mult}x` : 'THE CO.';
      drawText(ctx, txt, 60, y + 4, { color: p.sym === 'golden' ? '#ffe066' : p.mult > 0 ? '#39ff6a' : '#ff4040' });
      if (p.label && p.mult > 0) drawText(ctx, p.label, 60, y + 10, { color: '#ffb000' });
      y += 16;
    }
    y = 22;
    for (const p of PAYTABLE.filter((q) => q.kind === 'count')) {
      for (let k = 0; k < p.n; k++) drawSprite(ctx, S[p.sym], 102 + k * 14, y - 2, { scale: 1 });
      drawText(ctx, `${p.mult}x`, 140, y + 4, { color: '#39ff6a' });
      if (p.label) drawText(ctx, p.label, 140, y + 10, { color: '#9fdcff' });
      y += 16;
    }
    drawText(ctx, 'BEST RULE PAYS.', 102, 106, { color: '#c8b8a8' });
    drawText(ctx, '3 SKULLS: THE', 102, 115, { color: '#ff4040' });
    drawText(ctx, 'COMPANY WINS', 102, 121, { color: '#ff4040' });
    if (Math.floor(t * 2) % 2) drawText(ctx, '[P] CLOSE', W / 2, H - 11, { align: 'center', color: '#ffffff' });
  }

  function render() {
    ctx.drawImage(cabinet, 0, 0);
    drawTitle();
    drawReels();
    drawLever();
    drawBoxes();
    drawTicker();
    drawBanner();
    drawBulbs();
    parts.draw(ctx);
    if (state === 'result' && outcome && outcome.res.kind === 'company' && stateT < 1.2) {
      ctx.fillStyle = `rgba(255,0,0,${0.18 * (1 - stateT / 1.2)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (showPay) drawPaytable();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 1; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }

  return mg.api;
}
