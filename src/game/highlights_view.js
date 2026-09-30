// HIGHLIGHTS CLIP player (docs/wave8/highlights.md): a CRT "stream frame" over the game. It replays the recorded path top-down on a 2D canvas (grid + trails + creature dots),
// so it works when the map is unloaded in orbit (no scene, no physics, no lights). REC dot, climbing LIVE viewers, chat-style Algorithm captions. Skippable, never blocks.
import { t, tf } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';
import * as H from './highlights_core.js';
import { CAPS, INTRO, OUTRO } from './highlights_i18n.js';

export const CSS = `
.hc-crt{position:fixed;inset:0;z-index:60000;display:flex;align-items:center;justify-content:center;background:rgba(2,6,4,.82);font:13px/1.35 ui-monospace,Consolas,monospace;color:#9dffb4;animation:hcin .25s ease-out}
.hc-crt.out{opacity:0;transition:opacity .4s}
@keyframes hcin{from{opacity:0}to{opacity:1}}
.hc-frame{position:relative;width:min(92vw,780px);border:2px solid #2c4a36;border-radius:14px;background:#050b07;box-shadow:0 0 0 6px #10130f,0 0 40px rgba(60,255,120,.18);overflow:hidden}
.hc-top{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #1c3324;letter-spacing:.08em;text-transform:uppercase}
.hc-rec{display:inline-flex;align-items:center;gap:6px;color:#ff5a4a}.hc-rec i{width:10px;height:10px;border-radius:50%;background:#ff3b30;animation:hcblink 1s steps(2) infinite}
@keyframes hcblink{50%{opacity:.15}}
.hc-live{background:#ff3b30;color:#fff;padding:0 6px;border-radius:3px;font-weight:700}
.hc-title{flex:1;text-align:center;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hc-view{font-variant-numeric:tabular-nums}
.hc-cv{display:block;width:100%;aspect-ratio:16/9;background:#050b07}
.hc-chat{min-height:74px;padding:8px 12px;border-top:1px solid #1c3324;display:flex;flex-direction:column;justify-content:flex-end;gap:3px}
.hc-chat div{animation:hcin .3s ease-out}.hc-chat b{color:#ffd84a;margin-right:6px;letter-spacing:.06em}
.hc-foot{display:flex;align-items:center;justify-content:space-between;padding:6px 12px 9px;font-size:11px;opacity:.75}
.hc-skip{background:none;border:1px solid #2c4a36;color:#9dffb4;font:inherit;padding:2px 10px;border-radius:4px;cursor:pointer}
.hc-skip:hover{background:#12301d}
.hc-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);mix-blend-mode:multiply;animation:hcflick 4s linear infinite}
@keyframes hcflick{0%,100%{opacity:1}50%{opacity:.86}92%{opacity:1}94%{opacity:.7}}
@media (prefers-reduced-motion:reduce){.hc-scan,.hc-rec i{animation:none}}
.hc-offer{position:fixed;right:16px;bottom:92px;z-index:59000;background:#08110b;border:1px solid #2c4a36;border-left:4px solid #ff3b30;color:#9dffb4;font:13px/1.3 ui-monospace,Consolas,monospace;padding:9px 14px;border-radius:6px;cursor:pointer;animation:hcin .3s ease-out;max-width:260px}
.hc-offer small{display:block;opacity:.7;margin-top:2px}
.hc-sum{display:flex;align-items:center;gap:10px;margin-top:6px}
.hc-watch{background:#0d1c12;border:1px solid #2c4a36;border-left:4px solid #ff3b30;color:#9dffb4;font:inherit;font-weight:700;letter-spacing:.06em;padding:5px 12px;border-radius:4px;cursor:pointer}
.hc-watch:hover{background:#15301f}`;

const PAL = { bg: '#050b07', grid: 'rgba(80,200,120,.10)', sub: '#ffd84a', ply: '#7fd4ff', cre: '#ff5a4a', txt: '#9dffb4' };
const cap = (kind, seed) => H.pickCaption(CAPS[kind] || CAPS.live, seed);
const fmt = (n) => n.toLocaleString('en-US');

/**
 * play one clip. o = { clip, tracks, index, count, onDone, sfx }. Returns { stop() }; onDone fires once (end, skip or stop).
 */
export function playClip(o) {
  const { clip, tracks } = o, doc = document;
  const len = (clip.n - 1) / clip.hz, ev = clip.e, wall = H.clipWall(len, ev), seed = H.seedOf(clip);
  const root = doc.createElement('div');
  root.className = 'hc-crt';
  root.innerHTML = `<div class="hc-frame"><div class="hc-top"><span class="hc-rec"><i></i>${escapeHtml(t('REC'))}</span><span class="hc-live">${escapeHtml(t('LIVE'))}</span>`
    + `<span class="hc-title">${escapeHtml(t('HIGHLIGHT CLIP'))}${o.count > 1 ? ' · ' + escapeHtml(tf('Clip {n} of {m}', { n: o.index + 1, m: o.count })) : ''}</span>`
    + `<span class="hc-view">${escapeHtml(t('VIEWERS'))} <b class="hc-n">0</b></span></div><canvas class="hc-cv" width="640" height="360"></canvas>`
    + `<div class="hc-chat"></div><div class="hc-foot"><span>${escapeHtml(t('Recorded on air, edited by the Algorithm.'))}</span><button class="hc-skip" type="button">${escapeHtml(t('SKIP'))}</button></div><div class="hc-scan"></div></div>`;
  (doc.getElementById('ui') || doc.body).appendChild(root);
  const cv = root.querySelector('.hc-cv'), ctx = cv.getContext('2d'), chat = root.querySelector('.hc-chat'), nEl = root.querySelector('.hc-n');
  const W = cv.width, Hh = cv.height;

  // static camera: bounds of the subject path + the creatures + the other players, padded, min 30 m wide, matched to 16:9
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const grow = (p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); };
  for (const tr of [...tracks.P, ...tracks.C]) for (const p of tr.pts) grow(p);
  if (x0 > x1) { x0 = -15; x1 = 15; z0 = -8; z1 = 8; }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, aspect = W / Hh;
  let sx = Math.max(30, (x1 - x0) * 1.25), sz = Math.max(30 / aspect, (z1 - z0) * 1.25);
  if (sx / sz < aspect) sx = sz * aspect; else sz = sx / aspect;
  const k = W / sx, X = (x) => W / 2 + (x - cx) * k, Z = (z) => Hh / 2 + (z - cz) * k;

  const say = (s) => {
    const d = doc.createElement('div'); d.innerHTML = `<b>${escapeHtml(t('ALGORITHM'))}</b>`; d.appendChild(doc.createTextNode(s)); chat.appendChild(d);
    while (chat.children.length > 3) chat.firstChild.remove();
  };
  const lines = [[0.3, () => say(t(H.pickCaption(INTRO, seed)))], [Math.max(0.9, H.clipWall(ev, ev) - 0.3), () => say(tf(cap(clip.k, seed), { name: clip.s, v: clip.v }))],
    [Math.max(2.5, wall - 1.4), () => say(t(H.pickCaption(OUTRO, seed + 1)))]];
  let li = 0, t0 = performance.now(), raf = 0, done = false, ended = 0;
  o.sfx?.('ui_hover', 0.4);

  function draw(u, el) {
    ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, W, Hh);
    ctx.strokeStyle = PAL.grid; ctx.lineWidth = 1; ctx.beginPath();
    const g = 5, gx0 = Math.floor((cx - sx / 2) / g) * g, gz0 = Math.floor((cz - sz / 2) / g) * g;
    for (let x = gx0; x < cx + sx / 2; x += g) { ctx.moveTo(X(x), 0); ctx.lineTo(X(x), Hh); }
    for (let z = gz0; z < cz + sz / 2; z += g) { ctx.moveTo(0, Z(z)); ctx.lineTo(W, Z(z)); }
    ctx.stroke();
    const trail = (tr, col, upTo) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      const last = Math.min(tr.pts.length - 1, Math.floor(upTo * clip.hz - tr.i0));
      for (let i = 0; i <= last; i++) { const p = tr.pts[i]; i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1])); }
      ctx.stroke();
    };
    ctx.font = '12px ui-monospace,Consolas,monospace';
    for (const tr of tracks.C) {
      ctx.globalAlpha = 0.35; trail(tr, PAL.cre, u); ctx.globalAlpha = 1;
      const p = H.trackAt(tr, u, clip.hz); if (!p) continue;
      const r = 6 + 2 * Math.sin(el * 8);
      ctx.strokeStyle = PAL.cre; ctx.lineWidth = 1; ctx.strokeRect(X(p.x) - r, Z(p.z) - r, r * 2, r * 2);
      ctx.fillStyle = PAL.cre; ctx.fillRect(X(p.x) - 4, Z(p.z) - 4, 8, 8);
    }
    let subAt = null;
    for (const tr of tracks.P) {
      const col = tr.sub ? PAL.sub : PAL.ply;
      ctx.globalAlpha = tr.sub ? 0.85 : 0.45; trail(tr, col, u); ctx.globalAlpha = 1;
      const p = H.trackAt(tr, u, clip.hz); if (!p) continue;
      if (tr.sub) subAt = p;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), tr.sub ? 6 : 5, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(p.x), Z(p.z)); ctx.lineTo(X(p.x) - Math.sin(p.yaw) * 12, Z(p.z) - Math.cos(p.yaw) * 12); ctx.stroke();
      ctx.fillText(tr.label, X(p.x) + 9, Z(p.z) - 8);
    }
    const dt = u - ev;
    if (subAt && Math.abs(dt) < 0.9) {   // the beat: a ring on the subject + a white flash
      ctx.strokeStyle = PAL.sub; ctx.lineWidth = 3; ctx.globalAlpha = Math.max(0, 1 - Math.abs(dt) / 0.9);
      ctx.beginPath(); ctx.arc(X(subAt.x), Z(subAt.z), 10 + (dt + 0.9) * 26, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (dt > -0.05 && dt < 0.12) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(0, 0, W, Hh); }
    ctx.fillStyle = 'rgba(157,255,180,.25)'; ctx.fillRect(0, Hh - 4, W, 4);   // timeline
    ctx.fillStyle = PAL.txt; ctx.fillRect(0, Hh - 4, W * Math.min(1, u / Math.max(0.1, len)), 4);
    ctx.fillStyle = PAL.sub; ctx.fillRect(W * Math.min(1, ev / Math.max(0.1, len)) - 1, Hh - 8, 3, 8);
  }
  function frame(now) {
    if (done) return;
    const el = (now - t0) / 1000, u = Math.min(len, H.clipClock(el, len, ev));
    while (li < lines.length && el >= lines[li][0]) lines[li++][1]();
    nEl.textContent = fmt(H.viewersAt(clip, el / wall));
    draw(u, el);
    if (el >= wall + 1.4) return stop();
    raf = requestAnimationFrame(frame);
  }
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopPropagation(); stop(); } };
  function stop() {
    if (done) return; done = true;
    cancelAnimationFrame(raf); doc.removeEventListener('keydown', onKey, true);
    root.classList.add('out'); clearTimeout(ended); ended = setTimeout(() => root.remove(), 450);
    try { o.onDone?.(); } catch { /* caller gone */ }
  }
  doc.addEventListener('keydown', onKey, true);
  root.addEventListener('click', stop);
  raf = requestAnimationFrame((n) => { t0 = n; frame(n); });
  return { stop, el: root };
}
