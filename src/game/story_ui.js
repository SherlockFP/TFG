// STORY UI (wave 6): the allegiance dock chip (hudDock), the finale overlay, the ending case-file card. DOM only, no THREE.
import { hudDock } from '../ui/dock.js';
import { caseRenderers, caseTexts, ensureCaseStyle } from '../ui/panels/casefile.js';
import { escapeHtml } from '../core/util.js';
import { t, tf } from '../core/i18n.js';

export const COL = { company: '#5fa8ff', algorithm: '#ff3d9a' };
const CSS = `.st-dock{min-width:210px;max-width:290px;padding:6px 10px 7px;background:rgba(6,10,16,.86);border:1px solid #4a5568;border-right:4px solid var(--sc,#888);color:#e8e0d0;font:15px var(--font2,monospace);text-align:right}
.st-dock .k{font-size:10px;letter-spacing:2px;color:var(--sc,#aaa)}
.st-dock .bar{position:relative;height:8px;margin:5px 0 2px;background:linear-gradient(90deg,#5fa8ff55,#ffffff14 50%,#ff3d9a55)}
.st-dock .bar b{position:absolute;top:-3px;bottom:-3px;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 6px var(--sc,#fff)}
.st-dock .bar i{position:absolute;top:0;bottom:0;width:1px;background:#0008}
.st-dock .l{display:flex;justify-content:space-between;font-size:10px;letter-spacing:1px;opacity:.85}
.st-dock .j{margin-top:4px;font-size:14px;line-height:1.1;color:#ffe7b0}
.st-dock .tr{margin-top:4px;font-size:12px;letter-spacing:1px;color:#9adfff}
.st-fin{position:fixed;left:0;right:0;top:0;bottom:0;z-index:40;pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,.35),rgba(0,0,0,.82));color:#f2ead8;font-family:var(--font2,monospace);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity 1.2s}
.st-fin.out{opacity:0}
.st-fin .tt{font-size:clamp(28px,5vw,64px);letter-spacing:6px;text-transform:uppercase;text-align:center;padding:0 24px;text-shadow:0 0 18px var(--sc,#fff)}
.st-fin .ss{margin-top:6px;font-size:clamp(14px,2vw,22px);letter-spacing:3px;opacity:.75;text-align:center}
.st-fin .lg{margin-top:34px;max-width:720px;width:86vw;display:flex;flex-direction:column;gap:9px;font-size:clamp(14px,1.7vw,20px);line-height:1.25}
.st-fin .lg div{padding-left:10px;border-left:3px solid var(--sc,#888);animation:stIn .9s both}
@keyframes stIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
.lcase .st-title{font-size:26px;font-weight:bold;letter-spacing:2px;margin:2px 0 0}
.lcase .st-body{margin:12px 0 4px;padding:8px 12px;background:rgba(43,32,20,.08);border-left:4px solid var(--sc,#9a1010);font-size:17px;line-height:1.3}`;

let cssDone = false;
export function ensureStyle() {
  if (typeof document === 'undefined') return;
  ensureCaseStyle();
  if (cssDone && document.getElementById('tfg-story-style')) return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'tfg-story-style'; s.textContent = CSS; document.head.appendChild(s);
}
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** The dock chip. update({ a, act, jobLine, trendLine, show }) -> html diff only. */
export function createDock() {
  let box = null, last = '';
  return {
    update(v) {
      if (typeof document === 'undefined') return;
      if (!v?.show) { if (box) { box.remove(); box = null; last = ''; } return; }
      if (!box?.isConnected) { ensureStyle(); box = hudDock('right', 'story', 31); last = ''; }
      const col = v.a < -1 ? COL.company : v.a > 1 ? COL.algorithm : '#aaa';
      const pos = Math.max(0, Math.min(100, (v.a + 100) / 2));
      const html = `<div class="st-dock" style="--sc:${col}"><div class="k">${escapeHtml(v.head)}</div><div class="bar"><i style="left:50%"></i><b style="left:${pos}%"></b></div>`
        + `<div class="l"><span>${escapeHtml(v.l)}</span><span>${v.a > 0 ? '+' : ''}${Math.round(v.a)}</span><span>${escapeHtml(v.r)}</span></div>`
        + (v.jobLine ? `<div class="j">${escapeHtml(v.jobLine)}</div>` : '') + (v.trendLine ? `<div class="tr">${escapeHtml(v.trendLine)}</div>` : '') + '</div>';
      if (html !== last) { box.innerHTML = html; last = html; }
    },
    dispose() { box?.remove(); box = null; },
  };
}

/** Finale overlay: title + a growing log of lines. Returns { banner(main, sub), line(text), end(delayMs) }. */
export function createFinale(color) {
  if (typeof document === 'undefined') return { banner() {}, line() {}, end() {}, remove() {} };
  ensureStyle();
  document.querySelectorAll('.st-fin').forEach((x) => x.remove());
  const el = mk('div', 'st-fin');
  el.style.setProperty('--sc', color || '#fff');
  const tt = mk('div', 'tt'), ss = mk('div', 'ss'), lg = mk('div', 'lg');
  el.append(tt, ss, lg);
  (document.getElementById('ui') || document.body).appendChild(el);
  let timer = 0;
  return {
    banner(main, sub) { tt.textContent = main; ss.textContent = sub || ''; },
    line(text) { const d = mk('div', '', escapeHtml(text)); lg.appendChild(d); while (lg.children.length > 4) lg.firstChild.remove(); },
    end(ms = 9000) { clearTimeout(timer); timer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 1400); }, ms); },
    remove() { clearTimeout(timer); el.remove(); },
  };
}

// ---------------------------------------------------------------- case file (kind 'story')
export const storyCaseTitle = (c) => t(c?.story?.title || 'Ending');
const fmtDate = (ms) => { try { return new Date(ms).toLocaleDateString(); } catch { return '-'; } };
export function registerCase() {
  caseRenderers.story = (c, opts = {}) => {
    ensureStyle();
    const y = c.story || {};
    const card = mk('div', 'lcase' + (opts.cinematic ? '' : ' mini'));
    card.style.setProperty('--sc', y.color || '#9a1010');
    card.appendChild(mk('div', 'lc-top', `<div><div class="lc-no">CASE #${escapeHtml(c.n)}</div><div class="lc-org">${escapeHtml(t('THE ALGORITHM · CONTENT REVIEW DIVISION · CLASSIFIED'))}</div>`
      + `<div class="st-title">${escapeHtml(storyCaseTitle(c))}</div><div class="lc-meta">${escapeHtml(t('FINAL DOSSIER'))} · ${escapeHtml(fmtDate(c.at))}</div></div>`));
    const rows = [];
    const row = (label, value) => rows.push(`<div class="lc-row" style="--i:${rows.length}"><b>${escapeHtml(label)}</b><span></span><em>${escapeHtml(value)}</em></div>`);
    row(t('Crew'), (c.crew || []).join(', ') || '-');
    row(t('Day'), String(c.day | 0));
    row(t('Allegiance'), `${y.a > 0 ? '+' : ''}${Math.round(y.a || 0)}`);
    row(t('Jobs done'), `${t('Company')} ${y.jc | 0} · ${t('Algorithm')} ${y.ja | 0}`);
    row(t('Betrayals'), `${t('Company')} ${y.bc | 0} · ${t('Algorithm')} ${y.ba | 0}`);
    card.appendChild(mk('div', 'lc-rows', rows.join('')));
    card.appendChild(mk('div', 'st-body', escapeHtml(t(y.text || ''))));
    card.appendChild(mk('div', 'lc-stamp', `${escapeHtml(t('ENDING'))}<small>${escapeHtml(t('the feed continues'))}</small>`));
    if (opts.cinematic) card.appendChild(mk('div', 'lc-hint', t('click to file the case')));
    return card;
  };
  caseTexts.story = (c) => {
    const y = c.story || {};
    return [`CASE #${c.n} — ${storyCaseTitle(c)}`, '', `${t('Crew')}: ${(c.crew || []).join(', ') || '-'}   ${t('Day')}: ${c.day | 0}`,
      tf('Allegiance {a}. Jobs done: Company {jc}, Algorithm {ja}. Betrayals: Company {bc}, Algorithm {ba}.', { a: Math.round(y.a || 0), jc: y.jc | 0, ja: y.ja | 0, bc: y.bc | 0, ba: y.ba | 0 }), '', t(y.text || '')].join('\n');
  };
}
export function unregisterCase() { if (caseRenderers.story) delete caseRenderers.story; if (caseTexts.story) delete caseTexts.story; }
