// SIEGE HUD (wave 2): the big "SIEGE INCOMING" banner, the SIEGE panel (phase / wave / creatures + Ship Hull Integrity and
// door bars, hudDock('right')), the placement hint above the hotbar (hudDock('bottom')) and the motion-sensor readout.
import { hudDock } from './dock.js';
import { t } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';

const CSS = `
.sg-box{font-family:var(--font);min-width:236px;background:linear-gradient(180deg,rgba(26,8,4,.96),rgba(10,3,2,.93));border:1px solid rgba(255,90,58,.55);box-shadow:0 0 14px rgba(255,90,58,.22),inset 0 0 18px rgba(0,0,0,.6);padding:6px 9px 7px;color:var(--text);position:relative;overflow:hidden}
.sg-box::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);pointer-events:none}
.sg-box .sg-t{font-family:var(--cond);font-weight:bold;font-size:15px;letter-spacing:2px;color:#ff7a4a;display:flex;justify-content:space-between;gap:10px;text-transform:uppercase}
.sg-box .sg-t i{font-style:normal;color:#ffd0a0;font-size:13px;letter-spacing:1px}
.sg-box .sg-s{font-size:16px;margin-top:3px;letter-spacing:1px}
.sg-box .sg-b{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:15px}
.sg-box .sg-b span{width:44px;letter-spacing:1px;opacity:.85}
.sg-box .sg-b div{flex:1;height:7px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25)}
.sg-box .sg-b div div{height:100%;border:0}
.sg-box .sg-b b{width:38px;text-align:right;font-weight:normal}
.sg-box .sg-x{margin-top:4px;font-size:15px;color:#9ad8ff;letter-spacing:1px}
.sg-box.pulse{animation:sgPulse .8s steps(2) infinite}
@keyframes sgPulse{50%{border-color:rgba(255,220,120,.9)}}
.sg-place{font-family:var(--font);font-size:20px;letter-spacing:1px;padding:4px 14px;background:rgba(6,10,6,.78);border:1px solid rgba(64,255,112,.55);color:#9dffb2;text-shadow:0 0 8px rgba(64,255,112,.5)}
.sg-place.bad{border-color:rgba(255,58,42,.65);color:#ff9a8a;text-shadow:0 0 8px rgba(255,58,42,.5)}
.sg-banner{position:fixed;left:50%;top:15%;transform:translateX(-50%);z-index:45;pointer-events:none;text-align:center;font-family:var(--cond,var(--font));text-transform:uppercase;padding:10px 46px 12px;min-width:340px;max-width:92vw;
 background:linear-gradient(90deg,transparent,rgba(30,6,2,.86) 18%,rgba(30,6,2,.86) 82%,transparent);animation:sgIn .5s cubic-bezier(.2,1.4,.4,1) both}
.sg-banner.out{animation:sgOut .5s ease-in both}
.sg-banner .m{font-size:54px;line-height:1;letter-spacing:6px;font-weight:bold;color:#ff4a2a;text-shadow:0 0 22px #ff2a10,3px 3px 0 #3a0a04}
.sg-banner .s{font-size:22px;letter-spacing:3px;color:#ffd9b0;margin-top:6px}
.sg-banner.good .m{color:#7dff8a;text-shadow:0 0 22px #20ff50,3px 3px 0 #06300c}
.sg-banner.wave .m{color:#ffb040;text-shadow:0 0 22px #ff8a10,3px 3px 0 #3a1c04;font-size:42px}
.sg-banner.bad .m{font-size:36px}
.sg-banner.siege .m{animation:sgBlink .7s steps(2) infinite}
@keyframes sgIn{from{opacity:0;transform:translateX(-50%) scale(1.25)}to{opacity:1;transform:translateX(-50%)}}
@keyframes sgOut{to{opacity:0;transform:translateX(-50%) translateY(-14px)}}
@keyframes sgBlink{50%{opacity:.55}}
`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'sg-hud-css'; s.textContent = CSS; document.head.appendChild(s);
}
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hullCol = (v) => (v > 60 ? '#7dff8a' : v > 30 ? '#ffb040' : '#ff3a2a');

export function createSiegeHud(game) {
  ensureCss();
  const dock = hudDock('right', 'siege', 15);
  const place = hudDock('bottom', 'sgplace', 40);
  let sensor = null, lastHtml = '', seen = { id: 0, phase: '', t: 0, at: 0 }, uiT = 0, bannerEl = null, bannerT = null;

  function timeLeft(s) {
    if (!s) return 0;
    if (s.id !== seen.id || s.phase !== seen.phase || s.t !== seen.t) seen = { id: s.id, phase: s.phase, t: s.t, at: performance.now() };
    return Math.max(0, s.t - (performance.now() - seen.at) / 1000);
  }
  function render(s) {
    let html = '';
    if (s) {
      const hull = Math.round(s.hull), door = Math.round((s.doorHp / Math.max(1, s.doorMax)) * 100);
      const ph = s.phase === 'prep' ? `${t('PREP')} ${mmss(timeLeft(s))}` : s.phase === 'wave' ? `${t('WAVE')} ${s.wave}/${s.waves}` : s.phase === 'lull' ? `${t('LULL')} ${mmss(timeLeft(s))}` : s.result === 'held' ? t('SIEGE HELD') : t('SIEGE BREACHED');
      const alive = s.phase === 'wave' || s.phase === 'lull' ? ` · ${t('ALIVE')} ${s.alive}` : '';
      html += `<div class="sg-box${s.phase === 'prep' ? ' pulse' : ''}"><div class="sg-t"><b>${t('SIEGE')}</b><i>${escapeHtml(ph + alive)}</i></div>`
        + `<div class="sg-b"><span>${t('HULL')}</span><div><div style="width:${hull}%;background:${hullCol(hull)}"></div></div><b style="color:${hullCol(hull)}">${hull}</b></div>`
        + `<div class="sg-b"><span>${t('DOOR')}</span><div><div style="width:${door}%;background:${s.doorBroken ? '#ff3a2a' : '#9ad8ff'}"></div></div><b>${s.doorBroken ? '!' : door + '%'}</b></div>`
        + (sensor ? `<div class="sg-x">${escapeHtml(sensor)}</div>` : '') + '</div>';
    } else if (sensor) html = `<div class="sg-box"><div class="sg-x">${escapeHtml(sensor)}</div></div>`;
    if (html !== lastHtml) { lastHtml = html; dock.innerHTML = html; }
  }
  return {
    timeLeft,
    setPlace(text, ok) {
      if (!text) { if (place.firstChild) place.innerHTML = ''; return; }
      const cls = ok === false ? 'sg-place bad' : 'sg-place';
      const html = `<div class="${cls}">${escapeHtml(text)}</div>`;
      if (place.innerHTML !== html) place.innerHTML = html;
    },
    setSensor(text) { sensor = text; },
    banner(main, sub, kind = 'wave') {
      if (typeof document === 'undefined') return;
      clearTimeout(bannerT); bannerEl?.remove();
      const el = document.createElement('div');
      el.className = `sg-banner ${kind}`;
      el.innerHTML = `<div class="m">${escapeHtml(main || '')}</div>${sub ? `<div class="s">${escapeHtml(sub)}</div>` : ''}`;
      (game.ui?.root || document.body).appendChild(el);
      bannerEl = el;
      bannerT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 520); }, kind === 'siege' ? 6500 : 4200);
    },
    update(dt, s) { uiT -= dt; if (uiT > 0) return; uiT = 0.2; render(s); },
    reset() { seen = { id: 0, phase: '', t: 0, at: 0 }; lastHtml = ''; dock.innerHTML = ''; place.innerHTML = ''; bannerEl?.remove(); bannerEl = null; },
    dispose() { clearTimeout(bannerT); bannerEl?.remove(); dock.remove(); place.remove(); },
  };
}
