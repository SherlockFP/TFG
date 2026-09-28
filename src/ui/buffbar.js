// ANOMALY HUD: the left-dock STATIC meter (only while > 0, or while a Signal Counter is held / a Decon channel runs) and the
// buff / debuff bar (icon tile + name + timer, green = good, red = bad, gold = power-up). Plain DOM, injected CSS.
import { hudDock } from './dock.js';
import { t } from '../core/i18n.js';

const CSS = `
.anb-st{--c:#5dffd0;width:190px;padding:5px 9px 7px;background:rgba(4,10,12,.62);border-left:3px solid var(--c);font-family:var(--cond,'Arial Narrow',sans-serif);text-transform:uppercase;letter-spacing:1.5px;pointer-events:none;transition:border-color .25s}
.anb-st.off{display:none}
.anb-st .h{display:flex;justify-content:space-between;align-items:baseline;line-height:1}
.anb-st .h span{font-size:12px;color:rgba(190,255,240,.6)}
.anb-st .h b{font-size:18px;color:var(--c);text-shadow:0 0 8px var(--c)}
.anb-st .bar{position:relative;height:7px;margin-top:4px;background:rgba(255,255,255,.08);overflow:hidden}
.anb-st .bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--c);box-shadow:0 0 8px var(--c)}
.anb-st .bar s{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.8)}
.anb-st .f{display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:rgba(190,255,240,.55);line-height:1}
.anb-st .x{margin-top:3px;font-size:12px;color:var(--c);line-height:1.1;min-height:0}
.anb-st.warn .bar i{animation:anbT .5s steps(2) infinite}
.anb-st.warn{animation:anbS .16s steps(2) infinite}
@keyframes anbT{50%{filter:brightness(2.2)}}@keyframes anbS{50%{transform:translate(1px,0)}}
.anb-bf{display:flex;flex-direction:column;gap:4px;pointer-events:none}
.anb-b{display:flex;align-items:center;gap:7px;width:190px;padding:3px 6px 3px 3px;background:rgba(6,6,10,.58);border-left:3px solid var(--c);position:relative;overflow:hidden}
.anb-b .ic{width:30px;height:30px;flex:none;display:flex;align-items:center;justify-content:center;border:1px solid var(--c);color:var(--c);font:bold 12px monospace;background:rgba(0,0,0,.4);text-shadow:0 0 6px var(--c)}
.anb-b .tx{flex:1;min-width:0;line-height:1.05}
.anb-b .tx b{display:block;font:15px var(--cond,'Arial Narrow',sans-serif);color:#f2f2f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.5px}
.anb-b .tx span{font:12px monospace;color:var(--c)}
.anb-b .bar{position:absolute;left:0;bottom:0;height:2px;background:var(--c);opacity:.8}
.anb-b.bad{background:rgba(20,4,6,.6)}
@media (prefers-reduced-motion:reduce){.anb-st.warn,.anb-st.warn .bar i{animation:none}}`;
let cssDone = false;

const fmt = (s) => (s === null ? t('TAKEOFF') : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`);

export function createBuffBar(game) {
  if (typeof document === 'undefined') return { setStatic() {}, setBuffs() {}, dispose() {} };
  if (!cssDone) { cssDone = true; const s = document.createElement('style'); s.id = 'tfg-anomaly-hud-css'; s.textContent = CSS; document.head.appendChild(s); }
  const stBox = hudDock('left', 'static', 5);
  const bfBox = hudDock('left', 'buffs', 10);
  const st = document.createElement('div');
  st.className = 'anb-st off';
  st.innerHTML = `<div class="h"><span></span><b></b></div><div class="bar"><i></i><s style="left:25%"></s><s style="left:50%"></s><s style="left:75%"></s></div><div class="f"><span class="v"></span><span class="e"></span></div><div class="x"></div>`;
  stBox.appendChild(st);
  const q = (s) => st.querySelector(s);
  const el = { lab: q('.h span'), name: q('.h b'), fill: q('.bar i'), v: q('.v'), e: q('.e'), x: q('.x') };
  el.lab.textContent = t('STATIC');
  const bf = document.createElement('div');
  bf.className = 'anb-bf';
  bfBox.appendChild(bf);
  let sig = '';
  const rows = new Map();

  const STAGE_COLOR = ['#6fdc8c', '#5dffd0', '#c58aff', '#ff4fd0', '#ff3a3a'];
  const STAGE_NAME = ['CLEAN', 'BUZZING', 'GLITCHING', 'CORRUPTED', 'DELETED'];

  return {
    setStatic(s) {
      const show = !!s && (s.exp > 0.5 || s.counter || s.decon > 0 || s.collapse > 0);
      st.classList.toggle('off', !show);
      if (!show) return;
      const c = STAGE_COLOR[s.stage] || STAGE_COLOR[0];
      st.style.setProperty('--c', c);
      st.classList.toggle('warn', s.exp >= 90);
      el.name.textContent = t(STAGE_NAME[s.stage] || 'CLEAN');
      el.fill.style.width = Math.min(100, s.exp).toFixed(1) + '%';
      el.v.textContent = Math.round(s.exp);
      el.e.textContent = (s.rate > 0.05 ? '▲ +' + s.rate.toFixed(1) + '/s' : s.exp > 0.5 ? '▼' : '') + (s.resist < 0.99 && s.resist > 0 ? ' · ' + t('resist') + ' ' + Math.round((1 - s.resist) * 100) + '%' : '') + (s.immune > 0 ? ' · ' + t('immune') + ' ' + Math.ceil(s.immune) + 's' : '');
      let x = '';
      if (s.collapse > 0) x = `${t('DELETION IN')} ${Math.ceil(s.collapse)}`;
      else if (s.decon > 0) x = `${t('DECONTAMINATING')} ${Math.round(s.decon * 100)}%`;
      else if (s.counter) x = `${t('SIGNAL')} ${(s.sense * 4).toFixed(2)} µSv/s`;
      el.x.textContent = x;
    },
    setBuffs(list) {
      const nsig = list.map((b) => b.id).join(',');
      if (nsig !== sig) {
        sig = nsig;
        bf.innerHTML = '';
        rows.clear();
        for (const b of list) {
          const d = document.createElement('div');
          d.className = 'anb-b ' + (b.good ? 'good' : 'bad') + (b.power ? ' power' : '');
          d.style.setProperty('--c', b.color);
          d.title = t(b.desc || '');
          d.innerHTML = `<div class="ic">${b.glyph}</div><div class="tx"><b>${t(b.name)}</b><span></span></div><i class="bar"></i>`;
          bf.appendChild(d);
          rows.set(b.id, { d, span: d.querySelector('span'), bar: d.querySelector('.bar') });
        }
      }
      for (const b of list) {
        const r = rows.get(b.id);
        if (!r) continue;
        r.span.textContent = fmt(b.left);
        r.bar.style.width = (b.frac == null ? 100 : Math.max(0, Math.min(100, b.frac * 100))) + '%';
        r.d.style.opacity = b.left !== null && b.left < 5 ? (Math.floor(game.time * 4) % 2 ? 0.55 : 1) : 1;
      }
    },
    dispose() { stBox.remove(); bfBox.remove(); },
  };
}
