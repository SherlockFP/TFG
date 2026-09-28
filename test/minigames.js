// KEFAL COMPANY — minigame test bench (served by Vite at /test/minigames.html)
import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import { MINIGAMES, drawArcadeAttract } from '../src/minigames/index.js';
import { mulberry32 } from '../src/minigames/common.js';

const $ = (id) => document.getElementById(id);
const uiLayer = $('ui-layer');
const logEl = $('log');

const FISH = [
  { id: 'fish_kefal', name: 'Kefal', difficulty: 0.2, rarity: 'common' },
  { id: 'fish_boot', name: 'Old Boot', difficulty: 0.05, rarity: 'common' },
  { id: 'fish_lufer', name: 'Lüfer', difficulty: 0.45, rarity: 'uncommon' },
  { id: 'fish_levrek', name: 'Levrek', difficulty: 0.55, rarity: 'rare' },
  { id: 'fish_eel', name: 'Electric Eel', difficulty: 0.75, rarity: 'epic' },
  { id: 'fish_golden', name: 'Golden Kefal', difficulty: 0.95, rarity: 'legendary' },
];
for (const [i, f] of FISH.entries()) {
  const o = document.createElement('option');
  o.value = String(i);
  o.textContent = `${f.name} (${f.rarity}, d=${f.difficulty})`;
  $('fish').appendChild(o);
}

function log(msg, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${msg}`;
  logEl.prepend(line);
  while (logEl.childElementCount > 200) logEl.lastChild.remove();
}
$('clear').onclick = () => (logEl.textContent = '');
$('diff').oninput = () => ($('diffv').textContent = Number($('diff').value).toFixed(2));

// ───────────────────────── tiny WebAudio beeper so the bench isn't silent ──
let ac = null;
let master = null;
const loops = {};
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f0, f1, dur, type = 'square', vol = 0.07, delay = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
function noise(dur, vol = 0.1, hp = 1000, delay = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}
function loop(name, freq, lfoRate, lfoDepth, type, vol) {
  const a = audio();
  if (!a || loops[name]) return;
  const o = a.createOscillator();
  const lfo = a.createOscillator();
  const lg = a.createGain();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  lfo.frequency.value = lfoRate;
  lg.gain.value = lfoDepth;
  lfo.connect(lg).connect(o.frequency);
  g.gain.value = vol;
  o.connect(g).connect(master);
  o.start();
  lfo.start();
  loops[name] = { o, lfo, g };
}
function stopLoop(name) {
  const l = loops[name];
  if (!l) return;
  l.g.gain.setTargetAtTime(0, ac.currentTime, 0.03);
  l.o.stop(ac.currentTime + 0.2);
  l.lfo.stop(ac.currentTime + 0.2);
  delete loops[name];
}
const RECIPES = {
  ui_click: () => tone(1300, 900, 0.03, 'square', 0.04),
  ui_confirm: () => (tone(660, 660, 0.06), tone(990, 990, 0.09, 'square', 0.07, 0.07)),
  ui_error: () => tone(190, 110, 0.22, 'sawtooth', 0.07),
  fish_cast: () => tone(300, 1300, 0.25, 'triangle', 0.08),
  fish_splash: () => noise(0.3, 0.12, 700),
  fish_bite: () => (tone(880, 880, 0.05), tone(1320, 1320, 0.08, 'square', 0.08, 0.06)),
  fish_caught: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.07, i * 0.08)),
  slot_spin: () => tone(200, 800, 0.35, 'sawtooth', 0.05),
  slot_stop: () => tone(150, 90, 0.07, 'square', 0.09),
  slot_win: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, f, 0.09, 'square', 0.07, i * 0.07)),
  slot_jackpot: () => {
    for (let i = 0; i < 14; i++) {
      const f = 523 * Math.pow(2, (i % 7) / 7 + Math.floor(i / 7) * 0.5);
      tone(f, f, 0.08, 'square', 0.07, i * 0.07);
    }
  },
  slot_lose: () => tone(400, 140, 0.35, 'triangle', 0.08),
  keypad_beep_1: () => tone(700, 700, 0.12, 'sine', 0.1),
  keypad_beep_2: () => tone(880, 880, 0.12, 'sine', 0.1),
  keypad_beep_3: () => tone(1046, 1046, 0.12, 'sine', 0.1),
  safe_click: () => noise(0.05, 0.25, 1800),
  wire_connect: () => (tone(1400, 1400, 0.04, 'square', 0.06), noise(0.06, 0.08, 3000)),
  spark: () => noise(0.18, 0.16, 3000),
  arcade_jump: () => tone(320, 640, 0.09, 'square', 0.05),
  arcade_score: () => (tone(988, 988, 0.05, 'square', 0.05), tone(1319, 1319, 0.08, 'square', 0.05, 0.05)),
  arcade_die: () => tone(500, 50, 0.5, 'sawtooth', 0.08),
  lockpick_click: () => (noise(0.03, 0.2, 4000), tone(2100, 1800, 0.03, 'square', 0.04)),
  lockpick_success: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.08, 'square', 0.06, i * 0.06)),
  coins: () => {
    for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 600, 2400, 0.05, 'square', 0.035, i * 0.05);
  },
  reel_loop: () => loop('reel_loop', 70, 18, 30, 'square', 0.03),
  alarm_loop: () => loop('alarm_loop', 750, 2.5, 180, 'square', 0.04),
};
function sfx(name) {
  if ($('logsfx').checked) log(`sfx ${name}`, 'sfx');
  if (!$('sound').checked) {
    if (name.startsWith('stop:')) stopLoop(name.slice(5));
    return;
  }
  if (name.startsWith('stop:')) return stopLoop(name.slice(5));
  const r = RECIPES[name];
  if (r) r();
}

// ───────────────────────── launcher ──
let active = null;
let activeName = '';
let coins = 500;

function launch(name) {
  if (active) {
    active.destroy();
    active = null;
  }
  audio();
  const seed = $('randseed').checked ? Math.floor(Math.random() * 1e9) : Number($('seed').value) || 1;
  if ($('randseed').checked) $('seed').value = String(seed);
  const difficulty = Number($('diff').value);
  coins = Number($('balance').value) || 0;
  let inst = null;
  const opts = {
    container: uiLayer,
    difficulty,
    rng: mulberry32(seed),
    sfx,
    onDone(result) {
      log(`${name} -> ${JSON.stringify(result)}`, 'res');
      if (name === 'arcade' && typeof result.highScore === 'number') $('hi').value = String(result.highScore);
      // the game destroys the overlay after onDone
      setTimeout(() => {
        if (inst) inst.destroy();
        if (active === inst) active = null;
      }, 0);
    },
  };
  if (name === 'fishing') opts.fish = FISH[Number($('fish').value) || 0];
  if (name === 'arcade') opts.highScore = Number($('hi').value) || 0;
  if (name === 'slots') {
    opts.balance = coins;
    opts.bets = [10, 25, 50, 100, 250];
    opts.onSpin = (bet, win) => {
      coins = coins - bet + win;
      $('balance').value = String(coins);
      log(`slots onSpin(bet=${bet}, win=${win}) -> ${coins}`);
      return coins;
    };
  }
  log(`launch ${name} (difficulty ${difficulty.toFixed(2)}, seed ${seed})`);
  inst = MINIGAMES[name](opts);
  active = inst;
  activeName = name;
}

const games = $('games');
Object.keys(MINIGAMES).forEach((name, i) => {
  const b = document.createElement('button');
  b.textContent = `${i + 1}. ${name}`;
  b.onclick = () => launch(name);
  games.appendChild(b);
});
window.addEventListener('keydown', (e) => {
  if (active || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const n = Number(e.key);
  const names = Object.keys(MINIGAMES);
  if (n >= 1 && n <= names.length) launch(names[n - 1]);
});

// ───────────────────────── main loop ──
const attract = $('attract').getContext('2d');
let last = performance.now();
let attractAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (active) active.update(dt);
  attractAcc += dt;
  if (attractAcc >= 0.1) {
    attractAcc = 0;
    drawArcadeAttract(attract, 128, 96, now / 1000, Number($('hi').value) || 0);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

log('ready. click a minigame (or press 1-6). ESC closes a minigame.');
window.__mg = () => ({ active, activeName });
