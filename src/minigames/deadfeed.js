/**
 * DEAD FEED — tiny top-down twin-stick shooter (arcade cabinet for the main-menu terminal).
 * Waves of spam bots try to "engage" you. WASD move, arrow keys or mouse aim + shoot (hold), ESC quit.
 *
 * createDeadFeed(opts) -> { el, update, destroy }   (same contract as every minigame in ./index.js)
 *   opts.highScore: number (optional)
 *   result: { success, cancelled, score, wave, highScore }
 */
import {
  createMinigame, drawText, drawTextOutlined, createParticles, sparkBurst, floatText, clamp, fxRand, hsl,
} from './common.js';

const W = 200;
const H = 150;
const PAD = 8;

const PICKS = {
  S: { color: '#3fa9ff', label: 'SPREAD', time: 10 },
  R: { color: '#ffb000', label: 'RAPID', time: 10 },
  B: { color: '#ff3b3b', label: 'DELETE ALL' },
  L: { color: '#39ff6a', label: '1UP' },
};

export function createDeadFeed(rawOpts = {}) {
  const mg = createMinigame(rawOpts, {
    kind: 'deadfeed',
    title: 'DEAD FEED',
    tag: 'ARCADE',
    help: '[WASD] move   [ARROWS] / [MOUSE] shoot   [ESC] quit',
    width: W,
    height: H,
  });
  const { ctx } = mg;
  const parts = createParticles(200);
  const keys = new Set();
  let highScore = Math.max(0, Math.floor(Number(rawOpts.highScore) || 0));
  let best = 0;
  let games = 0;

  let mode = 'ready'; // ready | play | over
  let t = 0;
  let modeT = 0;
  let p; let bullets; let foes; let picks; let score; let wave; let toSpawn; let spawnT; let banner; let shake;

  function reset() {
    p = { x: W / 2, y: H / 2, inv: 0, lives: 3, fire: 0, spread: 0, rapid: 0, face: 0 };
    bullets = []; foes = []; picks = [];
    score = 0; wave = 0; toSpawn = 0; spawnT = 0; banner = 0; shake = 0;
  }
  reset();

  function nextWave() {
    wave++;
    banner = 1.6;
    toSpawn = 5 + wave * 3;
    spawnT = 0.5;
    if (wave % 5 === 0) foes.push(mkFoe('boss', edgePoint()));
  }
  function edgePoint() {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: -4, y: fxRand(0, H) };
    if (side === 1) return { x: W + 4, y: fxRand(0, H) };
    if (side === 2) return { x: fxRand(0, W), y: -4 };
    return { x: fxRand(0, W), y: H + 4 };
  }
  function mkFoe(kind, at) {
    const k = {
      bot: { hp: 1, sp: 20 + wave * 1.6, r: 3, score: 10, color: '#ff4a4a' },
      troll: { hp: 1, sp: 42 + wave, r: 3, score: 25, color: '#c44dff' },
      popup: { hp: 4, sp: 13 + wave * 0.5, r: 5, score: 60, color: '#ffe066' },
      boss: { hp: 26 + wave * 3, sp: 11, r: 10, score: 500, color: '#ff8a3d' },
    }[kind];
    return { kind, x: at.x, y: at.y, ...k, maxHp: k.hp, hit: 0, phase: Math.random() * 6, spawn: 0 };
  }
  function pickKind() {
    const r = Math.random();
    if (wave >= 4 && r < 0.12) return 'popup';
    if (wave >= 3 && r < 0.32) return 'troll';
    return 'bot';
  }

  function startRun() {
    reset(); mode = 'play'; modeT = 0; games++;
    nextWave();
  }
  function endRun() {
    mode = 'over'; modeT = 0;
    best = Math.max(best, score);
    if (score > highScore) highScore = score;
    mg.sfx('arcade_die');
    mg.setStatus(`HI ${highScore}`, 'dim');
  }
  mg.setStatus(`HI ${highScore}`, 'dim');

  function shoot(ax, ay) {
    const n = p.spread > 0 ? 3 : 1;
    const base = Math.atan2(ay, ax);
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i - 1) * 0.22) + fxRand(-0.03, 0.03);
      bullets.push({ x: p.x + Math.cos(a) * 4, y: p.y + Math.sin(a) * 4, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, life: 1.1 });
    }
    p.fire = p.rapid > 0 ? 0.075 : 0.16;
    p.face = base;
    mg.sfx('arcade_jump');
  }

  function killFoe(f, i) {
    foes.splice(i, 1);
    score += f.score;
    sparkBurst(parts, f.x, f.y, f.kind === 'boss' ? 30 : 8, [f.color, '#fff'], f.kind === 'boss' ? 110 : 60);
    floatText(parts, `+${f.score}`, f.x, f.y - 4, '#ffe066');
    mg.sfx('arcade_score');
    if (f.kind === 'boss') { shake = 3; mg.flash('#ff8a3d', 0.4); }
    if (Math.random() < (f.kind === 'boss' ? 1 : 0.11)) {
      const keysP = Object.keys(PICKS);
      picks.push({ x: f.x, y: f.y, k: keysP[Math.floor(Math.random() * keysP.length)], life: 9 });
    }
  }
  function deleteAll() {
    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      if (f.kind === 'boss') { f.hp -= 12; f.hit = 0.2; if (f.hp <= 0) killFoe(f, i); } else killFoe(f, i);
    }
    toSpawn = Math.max(0, toSpawn - 4);
    mg.flash('#ffffff', 0.7); shake = 2.5;
  }

  mg.onKeyDown = (e) => {
    const c = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) { keys.add(c); return true; }
    if ((c === 'Space' || c === 'Enter') && !e.repeat) {
      if (mode === 'ready' || mode === 'over') { if (mode === 'ready' || modeT > 0.5) startRun(); }
      return true;
    }
    return false;
  };
  mg.onKeyUp = (e) => { keys.delete(e.code); return false; };
  mg.onBlur = () => keys.clear();
  mg.onPointerDown = () => { if (mode === 'ready' || (mode === 'over' && modeT > 0.5)) startRun(); };
  mg.onEscape = () => {
    if (mode === 'play') endRun();
    if (games > 0) mg.finish({ success: best > 0, cancelled: false, score: best, wave, highScore, games });
    else mg.finish({ success: false, cancelled: true, score: 0, wave: 0, highScore, games: 0 });
  };

  mg.onFrame = (dt) => {
    t += dt; modeT += dt;
    parts.update(dt);
    shake = Math.max(0, shake - dt * 8);
    if (mode === 'play') step(dt);
    draw();
    if (shake > 0.1) mg.shake(shake);
  };

  function step(dt) {
    banner = Math.max(0, banner - dt);
    p.inv = Math.max(0, p.inv - dt); p.spread = Math.max(0, p.spread - dt); p.rapid = Math.max(0, p.rapid - dt);
    p.fire = Math.max(0, p.fire - dt);
    let mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let my = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    p.x = clamp(p.x + mx * 55 * dt, PAD, W - PAD);
    p.y = clamp(p.y + my * 55 * dt, PAD + 6, H - PAD);
    // aim: arrow keys win over the mouse
    let ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    let ay = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    let want = !!(ax || ay);
    if (!want && mg.pointer.down && mg.pointer.inside) { ax = mg.pointer.x - p.x; ay = mg.pointer.y - p.y; want = true; }
    if (want && p.fire <= 0) shoot(ax, ay);

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -4 || b.x > W + 4 || b.y < -4 || b.y > H + 4) { bullets.splice(i, 1); continue; }
      let used = false;
      for (let j = foes.length - 1; j >= 0; j--) {
        const f = foes[j];
        if (Math.abs(f.x - b.x) < f.r + 1 && Math.abs(f.y - b.y) < f.r + 1) {
          f.hp--; f.hit = 0.1; used = true;
          if (f.hp <= 0) killFoe(f, j);
          break;
        }
      }
      if (used) bullets.splice(i, 1);
    }

    if (toSpawn > 0) {
      spawnT -= dt;
      if (spawnT <= 0) { foes.push(mkFoe(pickKind(), edgePoint())); toSpawn--; spawnT = Math.max(0.18, 0.7 - wave * 0.04); }
    }
    for (const f of foes) {
      f.hit = Math.max(0, f.hit - dt); f.phase += dt;
      const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
      const wob = f.kind === 'troll' ? Math.sin(f.phase * 5) * 0.6 : 0;
      f.x += (dx / d + -dy / d * wob) * f.sp * dt; f.y += (dy / d + dx / d * wob) * f.sp * dt;
      if (f.kind === 'boss') { f.spawn -= dt; if (f.spawn <= 0) { f.spawn = 2.2; foes.push(mkFoe('bot', { x: f.x, y: f.y })); } }
      if (p.inv <= 0 && d < f.r + 3) {
        p.lives--; p.inv = 1.6; shake = 2; mg.flash('#ff3b3b', 0.5); mg.sfx('arcade_die');
        sparkBurst(parts, p.x, p.y, 14, ['#ff8a3d', '#fff'], 70);
        if (p.lives <= 0) { endRun(); return; }
      }
    }
    for (let i = picks.length - 1; i >= 0; i--) {
      const k = picks[i]; k.life -= dt;
      if (k.life <= 0) { picks.splice(i, 1); continue; }
      if (Math.hypot(k.x - p.x, k.y - p.y) < 7) {
        picks.splice(i, 1);
        if (k.k === 'S') p.spread = PICKS.S.time; else if (k.k === 'R') p.rapid = PICKS.R.time;
        else if (k.k === 'L') p.lives = Math.min(5, p.lives + 1); else deleteAll();
        floatText(parts, PICKS[k.k].label, p.x, p.y - 8, PICKS[k.k].color);
        mg.sfx('arcade_score');
      }
    }
    if (toSpawn <= 0 && foes.length === 0) nextWave();
    mg.setStatus(`SCORE ${score}  HI ${Math.max(highScore, score)}`, 'dim');
  }

  function draw() {
    ctx.fillStyle = '#050b08'; ctx.fillRect(0, 0, W, H);
    // grid floor (a "feed" scrolling slowly)
    ctx.fillStyle = '#0b1a12';
    const off = Math.floor(t * 6) % 16;
    for (let x = -16; x < W + 16; x += 16) ctx.fillRect(x + off, 0, 1, H);
    for (let y = -16; y < H + 16; y += 16) ctx.fillRect(0, y + off, W, 1);
    ctx.fillStyle = '#16813a'; ctx.fillRect(PAD - 2, PAD + 4, W - 2 * PAD + 4, 1); ctx.fillRect(PAD - 2, H - PAD + 2, W - 2 * PAD + 4, 1);

    for (const k of picks) {
      ctx.fillStyle = PICKS[k.k].color;
      if (k.life > 2 || Math.floor(t * 8) % 2) { ctx.fillRect(Math.round(k.x - 3), Math.round(k.y - 3), 7, 7); drawText(ctx, k.k, Math.round(k.x - 1), Math.round(k.y - 2), { color: '#000' }); }
    }
    for (const f of foes) {
      const x = Math.round(f.x), y = Math.round(f.y), r = f.r;
      ctx.fillStyle = f.hit > 0 ? '#ffffff' : f.color;
      if (f.kind === 'bot') { ctx.fillRect(x - 2, y - 2, 5, 5); ctx.fillStyle = '#200'; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); }
      else if (f.kind === 'troll') { ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7); }
      else if (f.kind === 'popup') { ctx.fillRect(x - r, y - r, r * 2 + 1, r * 2 + 1); ctx.fillStyle = '#000'; ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 1, 2); ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + r - 3, y - r + 1, 2, 2); }
      else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 2, 8, 4); ctx.fillStyle = '#000'; ctx.fillRect(x - 1 + Math.round(Math.cos(t * 3) * 2), y - 1, 2, 2);
        ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x - r, y - r - 4, Math.round((r * 2 + 1) * f.hp / f.maxHp), 1);
      }
    }
    ctx.fillStyle = '#ffe066';
    for (const b of bullets) ctx.fillRect(Math.round(b.x - 1), Math.round(b.y - 1), 2, 2);
    if (mode !== 'over' && (p.inv <= 0 || Math.floor(t * 14) % 2)) {
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = p.spread > 0 ? '#3fa9ff' : '#ff8a3d'; ctx.fillRect(x - 3, y - 3, 7, 7);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2 + Math.round(Math.cos(p.face) * 1.5), y - 2 + Math.round(Math.sin(p.face) * 1.5), 3, 2);
    }
    parts.draw(ctx);

    // HUD
    drawTextOutlined(ctx, `SCORE ${score}`, 4, 3, { color: '#39ff6a' });
    drawTextOutlined(ctx, `WAVE ${wave}`, W / 2, 3, { align: 'center', color: '#8fdde6' });
    for (let i = 0; i < p.lives; i++) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(W - 8 - i * 7, 3, 5, 5); }
    if (p.rapid > 0 || p.spread > 0) drawText(ctx, (p.rapid > 0 ? 'RAPID ' : '') + (p.spread > 0 ? 'SPREAD' : ''), 4, H - 8, { color: '#ffb000' });
    if (mode === 'play' && banner > 0) {
      drawTextOutlined(ctx, wave % 5 === 0 ? `WAVE ${wave} - THE INFLUENCER` : `WAVE ${wave}`, W / 2, 56, { align: 'center', scale: 2, color: hsl(t * 200, 100, 65) });
    }
    if (mode === 'ready') {
      drawTextOutlined(ctx, 'DEAD FEED', W / 2, 34, { align: 'center', scale: 3, color: '#ff8a3d' });
      drawTextOutlined(ctx, 'THE SPAM BOTS WANT YOUR ATTENTION', W / 2, 62, { align: 'center', color: '#8fdde6' });
      drawTextOutlined(ctx, 'DO NOT GIVE IT TO THEM', W / 2, 71, { align: 'center', color: '#8fdde6' });
      if (t % 1 < 0.65) drawTextOutlined(ctx, '[SPACE] START', W / 2, 96, { align: 'center', color: '#ffb000' });
      drawTextOutlined(ctx, '[WASD] MOVE  [ARROWS/MOUSE] SHOOT', W / 2, 112, { align: 'center', color: '#39ff6a' });
    } else if (mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 30, W, 80);
      drawTextOutlined(ctx, 'DEPLATFORMED', W / 2, 38, { align: 'center', scale: 2, color: '#ff3b3b' });
      drawTextOutlined(ctx, `SCORE ${score}   WAVE ${wave}`, W / 2, 60, { align: 'center', color: '#eafff0' });
      drawTextOutlined(ctx, `HI ${highScore}`, W / 2, 70, { align: 'center', color: '#39ff6a' });
      if (score >= highScore && score > 0) drawText(ctx, 'NEW HIGH SCORE!', W / 2, 82, { align: 'center', shadow: '#000', charColor: (i) => hsl(t * 360 + i * 25, 100, 60) });
      if (modeT > 0.5 && t % 1 < 0.65) drawTextOutlined(ctx, '[SPACE] RETRY   [ESC] QUIT', W / 2, 96, { align: 'center', color: '#ffb000' });
    }
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  }

  return mg.api;
}
