// Audition page for the procedural sound library (served by Vite at /test/sfx.html).
import { SFX, renderSfx, listSfx } from '../src/audio/sfxlib.js';

const CATS = ['ui', 'player', 'ship', 'facility', 'outdoor', 'creature', 'item', 'minigame', 'company', 'music'];
const $ = id => document.getElementById(id);
const statusEl = $('status'), masterEl = $('master'), useVolEl = $('useVol');

let ctx = null, masterGain = null;
const cache = new Map();          // name -> { res, buffer, ms }
const active = new Map();         // name -> Set of { src, gain }

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = +masterEl.value;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function toBuffer(res) {
  const ac = audio();
  const { sampleRate, channels } = res;
  const b = ac.createBuffer(channels.length, channels[0].length, sampleRate);
  channels.forEach((ch, i) => b.copyToChannel(ch, i));
  return b;
}

function getRendered(name) {
  let e = cache.get(name);
  if (!e) {
    const t0 = performance.now();
    const res = renderSfx(name, audio().sampleRate);
    const ms = performance.now() - t0;
    e = { res, buffer: toBuffer(res), ms };
    cache.set(name, e);
    const el = document.querySelector(`[data-name="${name}"] .rt`);
    if (el) el.textContent = `${ms.toFixed(0)}ms`;
  }
  return e;
}

function stop(name) {
  const set = active.get(name);
  if (!set) return;
  for (const v of set) { try { v.src.stop(); } catch { /* already stopped */ } }
  active.delete(name);
  markPlaying(name, false);
}
function stopAll() { for (const n of [...active.keys()]) stop(n); }

function markPlaying(name, on) {
  const el = document.querySelector(`[data-name="${name}"]`);
  if (!el) return;
  el.classList.toggle('playing', on);
  const lb = el.querySelector('.loopbtn');
  if (lb) lb.classList.toggle('on', on && !!lb.dataset.looping);
}

function play(name, loop = false) {
  const ac = audio();
  let e;
  try { e = getRendered(name); }
  catch (err) {
    console.error(err);
    document.querySelector(`[data-name="${name}"]`)?.classList.add('err');
    statusEl.textContent = `${name}: ${err.message}`;
    return;
  }
  if (loop) stop(name);
  const src = ac.createBufferSource();
  src.buffer = e.buffer; src.loop = loop;
  const gain = ac.createGain();
  gain.gain.value = useVolEl.checked ? SFX[name].vol : 1;
  src.connect(gain).connect(masterGain);
  src.start();
  const voice = { src, gain };
  if (!active.has(name)) active.set(name, new Set());
  active.get(name).add(voice);
  markPlaying(name, true);
  src.onended = () => {
    const set = active.get(name);
    if (set) { set.delete(voice); if (!set.size) { active.delete(name); markPlaying(name, false); } }
  };
  const m = SFX[name];
  statusEl.textContent = `${name} · ${m.dur.toFixed(2)}s · ${e.res.channels.length}ch · render ${e.ms.toFixed(1)}ms${loop ? ' · looping' : ''}`;
  drawWave(e.res, name);
}

function drawWave(res, name) {
  const cv = $('wave'), dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  const chs = res.channels, lane = h / chs.length;
  chs.forEach((x, c) => {
    const mid = lane * c + lane / 2, step = x.length / w;
    g.strokeStyle = c ? '#4fb3a6' : '#e0a526';
    g.beginPath();
    for (let px = 0; px < w; px++) {
      let lo = 1, hi = -1;
      const s0 = Math.floor(px * step), s1 = Math.min(x.length, Math.floor((px + 1) * step) + 1);
      for (let i = s0; i < s1; i++) { const v = x[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.moveTo(px + 0.5, mid - hi * lane / 2); g.lineTo(px + 0.5, mid - lo * lane / 2);
    }
    g.stroke();
  });
  g.fillStyle = '#7d8a73'; g.font = `${11 * dpr}px monospace`;
  g.fillText(name, 6 * dpr, 13 * dpr);
}

function build() {
  const list = $('list');
  const names = listSfx();
  for (const cat of CATS) {
    const inCat = names.filter(n => SFX[n].cat === cat);
    if (!inCat.length) continue;
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${cat} <span class="meta">(${inCat.length})</span></h2>`;
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const n of inCat) {
      const m = SFX[n];
      const item = document.createElement('div');
      item.className = 'snd'; item.dataset.name = n;
      const pb = document.createElement('button');
      pb.className = 'play';
      pb.innerHTML = `${n}<span class="meta">${m.dur.toFixed(2)}s · vol ${m.vol}${m.loop ? ' · <span class="tag">loop</span>' : ''} <span class="rt"></span></span>`;
      pb.title = m.loop ? 'click: play once · loop button: toggle looping' : 'click to play';
      pb.onclick = () => play(n, false);
      item.appendChild(pb);
      if (m.loop) {
        const lb = document.createElement('button');
        lb.className = 'loopbtn'; lb.textContent = 'LOOP';
        lb.onclick = () => {
          if (lb.dataset.looping) { delete lb.dataset.looping; stop(n); }
          else { lb.dataset.looping = '1'; play(n, true); markPlaying(n, true); }
        };
        item.appendChild(lb);
      }
      grid.appendChild(item);
    }
    sec.appendChild(grid);
    list.appendChild(sec);
  }
  // sounds with an unknown category (shouldn't happen) go last
  const other = names.filter(n => !CATS.includes(SFX[n].cat));
  if (other.length) console.warn('uncategorized sounds', other);
  statusEl.textContent = `${names.length} sounds · click to render + play`;
}

async function renderAll() {
  audio();
  const names = listSfx();
  let total = 0, i = 0;
  for (const n of names) {
    if (!cache.has(n)) {
      try { getRendered(n); total += cache.get(n).ms; }
      catch (e) { console.error(n, e); document.querySelector(`[data-name="${n}"]`)?.classList.add('err'); }
    }
    if (++i % 4 === 0) { statusEl.textContent = `rendering ${i}/${names.length}…`; await new Promise(r => setTimeout(r)); }
  }
  statusEl.textContent = `rendered ${names.length} sounds · ${(total / 1000).toFixed(2)} s total render time`;
}

$('renderAll').onclick = renderAll;
$('stopAll').onclick = () => { stopAll(); document.querySelectorAll('.loopbtn').forEach(b => { delete b.dataset.looping; b.classList.remove('on'); }); };
masterEl.oninput = () => { if (masterGain) masterGain.gain.value = +masterEl.value; };
$('filter').oninput = e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.snd').forEach(el => { el.style.display = !q || el.dataset.name.includes(q) ? '' : 'none'; });
  document.querySelectorAll('section').forEach(s => { s.style.display = [...s.querySelectorAll('.snd')].some(el => el.style.display !== 'none') ? '' : 'none'; });
};
window.addEventListener('keydown', e => { if (e.key === 'Escape') $('stopAll').click(); });
build();
