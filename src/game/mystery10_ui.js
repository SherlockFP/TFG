// THE FIRST UPLOAD (wave 10) - DOM: the archive reader, the codex index, terminal text, the ending scene. No net, no game state.
// Look: a cold "tape index" (theme tokens --t-info on --t-void) so it reads as a different drawer than the amber lore logs: file rows, redaction bars,
// a strip of 12 pips. No emoji. Everything typed in the reader is escaped.
import { escapeHtml } from '../core/util.js';
import * as C from './mystery10_core.js';
import { x, xf } from './mystery10_text.js';
import { drawCatFrame } from '../models/mystery10_models.js';

const CSS = `
.mys{width:min(760px,94vw);max-height:88vh;display:flex;flex-direction:column;position:relative;overflow:hidden;padding:14px 20px 12px;
 background:var(--t-void,#060403);border:1px solid var(--t-info,#7fc4ff);box-shadow:var(--t-shadow,0 22px 54px rgba(0,0,0,.72)),inset 0 0 60px rgba(90,170,255,.07);
 font-family:var(--font,'VT323',monospace);color:#cfe6ff}
.mys::before{content:'';position:absolute;inset:0;pointer-events:none;background:var(--t-scan,repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px))}
.mys-h{display:flex;justify-content:space-between;gap:12px;font-family:var(--font2,monospace);font-size:12px;letter-spacing:.14em;color:var(--t-info,#7fc4ff);border-bottom:1px solid rgba(127,196,255,.3);padding-bottom:6px}
.mys-k{display:flex;align-items:center;gap:10px;margin:10px 0 2px;font-size:13px;letter-spacing:.12em;color:#8fb4d8}
.mys-k b{padding:1px 8px;color:#06121c;background:var(--t-info,#7fc4ff);font-weight:normal;letter-spacing:.14em}
.mys-t{font-size:22px;color:#e6f3ff;margin:4px 0 8px;letter-spacing:.04em}
.mys-x{white-space:pre-wrap;font-size:20px;line-height:1.28;min-height:170px;overflow:auto;padding:10px 12px;background:rgba(127,196,255,.045);border-left:3px solid var(--t-info,#7fc4ff);color:#dcefff}
.mys-x i{font-style:normal;animation:mysBlink 1s steps(2) infinite}
.mys-s{margin-top:8px;font-size:17px;color:#8fb4d8;letter-spacing:.03em}
.mys-s.off{color:#41546a;letter-spacing:.06em}
.mys-f{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap}
.mys-pips{display:flex;gap:4px}
.mys-pips span{width:14px;height:14px;border:1px solid rgba(127,196,255,.5);background:transparent;cursor:default}
.mys-pips span.on{background:var(--t-info,#7fc4ff);cursor:pointer}
.mys-pips span.cur{outline:2px solid #fff;outline-offset:1px}
.mys-btns{display:flex;gap:6px}
.mys-m{margin-top:6px;font-size:13px;letter-spacing:.1em;color:#5f7f9e}
.mys-idx{display:flex;flex-direction:column;gap:3px;margin-top:8px}
.mys-row{display:grid;grid-template-columns:34px 116px 1fr auto;gap:10px;align-items:baseline;padding:5px 8px;border:1px solid rgba(127,196,255,.22);background:rgba(127,196,255,.04);font-size:19px;cursor:pointer;color:#cfe6ff}
.mys-row:hover,.mys-row:focus{border-color:var(--t-info,#7fc4ff);outline:none;background:rgba(127,196,255,.1)}
.mys-row.off{cursor:default;color:#41546a;border-style:dashed}
.mys-row.off:hover{background:rgba(127,196,255,.04);border-color:rgba(127,196,255,.22)}
.mys-row .n{font-family:var(--font2,monospace);font-size:12px;letter-spacing:.1em;color:var(--t-info,#7fc4ff)}
.mys-row .k{font-family:var(--font2,monospace);font-size:11px;letter-spacing:.12em;color:#8fb4d8}
.mys-row .d{font-size:13px;color:#5f7f9e}
.mys-top{display:flex;align-items:center;gap:12px}
.mys-bar{flex:1;height:8px;border:1px solid rgba(127,196,255,.45);position:relative}
.mys-bar i{position:absolute;inset:0 auto 0 0;background:var(--t-info,#7fc4ff)}
.mys-note{margin-top:8px;font-size:17px;color:#8fb4d8}
.mys-end{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;color:#dcefff;font-family:var(--font2,monospace);opacity:0;transition:opacity 1.6s}
.mys-end.on{opacity:1}.mys-end.out{opacity:0;transition:opacity 2.4s}
.mys-end .up{font-size:13px;letter-spacing:.3em;color:var(--t-info,#7fc4ff);margin-bottom:12px;min-height:16px}
.mys-end canvas{width:min(384px,80vw);aspect-ratio:4/3;image-rendering:pixelated;border:2px solid #1d2a55;box-shadow:0 0 40px rgba(90,170,255,.25);opacity:0;transition:opacity 1s}
.mys-end canvas.on{opacity:1}
.mys-end .ln{margin-top:22px;max-width:min(620px,86vw);min-height:110px;text-align:center;font-family:var(--font,'VT323',monospace);font-size:clamp(18px,2.2vw,26px);line-height:1.25;display:flex;flex-direction:column;gap:8px}
.mys-end .ln div{animation:mysIn 1s both}
.mys-end .tt{margin-top:14px;font-size:clamp(26px,4.5vw,54px);letter-spacing:.24em;color:#fff;text-shadow:0 0 22px var(--t-info,#7fc4ff);opacity:0;transition:opacity 2s}
.mys-end .tt.on{opacity:1}
.mys-end .sk{position:absolute;right:16px;bottom:12px;font-size:11px;letter-spacing:.14em;color:#3d5570}
.tl.myst{color:var(--t-info,#7fc4ff)}
.terminal.mys-glitch .term-screen{animation:mysJit .14s steps(2) 9}
@keyframes mysJit{0%{transform:none}25%{transform:translate(-5px,1px) skewX(2deg);filter:hue-rotate(70deg) contrast(1.4)}50%{transform:translate(4px,-2px)}75%{transform:translate(-2px,0) skewX(-3deg);filter:hue-rotate(-50deg)}100%{transform:none}}
@keyframes mysIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes mysBlink{50%{opacity:0}}`;

let cssDone = false;
export function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (cssDone && document.getElementById('tfg-myst-style')) return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'tfg-myst-style'; s.textContent = CSS; document.head.appendChild(s);
}
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** brief screen-shake / hue-shift on the open ship terminal */
export function jitterTerminal(el) {
  ensureStyle();
  if (!el) return;
  el.classList.add('mys-glitch');
  setTimeout(() => el.classList.remove('mys-glitch'), 1400);
}

/** the fragment as plain text lines (terminal + reader share it): { head, kind, at, body, sealed: {text, open}|null } */
export function fragText(f, count) {
  const hasSeal = !!f.sealAt;
  return { head: x(f.id + '.h'), kind: x('k.' + f.kind), at: f.at, body: x(f.id + '.b'), sealed: hasSeal ? { open: C.sealedOpen(f, count), text: x(f.id + '.s'), at: f.sealAt } : null };
}

/** terminal: list (no arg) or one fragment. -> string */
export function terminalText(p, arg) {
  const n = C.count(p);
  const idx = parseInt(arg, 10);
  if (arg && !(idx >= 1 && idx <= C.TOTAL)) return x('term.bad');
  if (idx >= 1) {
    const f = C.FRAGMENTS[idx - 1];
    if (!C.has(p, f.id)) return x('term.bad');
    const v = fragText(f, n);
    return [xf('term.head', { a: n, b: C.TOTAL }), `#${String(idx).padStart(2, '0')} ${v.kind} / ${v.at}`, v.head, '', v.body, v.sealed ? '\n' + (v.sealed.open ? v.sealed.text : x('ui.sealed')) : ''].join('\n');
  }
  const rows = C.FRAGMENTS.map((f, i) => (C.has(p, f.id) ? `${String(i + 1).padStart(2, '0')}. ${x('k.' + f.kind).padEnd(12)} ${f.at}` : `${String(i + 1).padStart(2, '0')}. ????????????????`));
  return [xf('term.head', { a: n, b: C.TOTAL }), '', ...rows, '', x('ui.hint')].join('\n');
}

/** The reader overlay (goes into ui.openPanel()). opts: { id, profile, fresh, onClose, onGo(id) } */
export function createReader({ id, profile, fresh = false, onClose, onGo } = {}) {
  ensureStyle();
  const f = C.BY_ID[id], n = C.count(profile), v = fragText(f, n);
  const el = mk('div', 'mys');
  el.innerHTML = `<div class="mys-h"><span>${escapeHtml(x('ui.title'))}</span><span>${escapeHtml(fresh ? x('ui.recovered') : x('ui.archived'))} · ${escapeHtml(xf('ui.of', { a: String(C.numOf(id)).padStart(2, '0'), b: C.TOTAL }))}</span></div>`
    + `<div class="mys-k"><b>${escapeHtml(v.kind)}</b><span>${escapeHtml(v.at)}</span></div><div class="mys-t">${escapeHtml(v.head)}</div><div class="mys-x"></div>`
    + (v.sealed ? `<div class="mys-s ${v.sealed.open ? '' : 'off'}">${escapeHtml(v.sealed.open ? v.sealed.text : x('ui.sealed'))}</div>` : '')
    + `<div class="mys-f"><div class="mys-pips"></div><div class="mys-btns"></div></div><div class="mys-m">${escapeHtml(x('ui.mile'))}</div>`;
  const pips = el.querySelector('.mys-pips');
  C.FRAGMENTS.forEach((q) => {
    const on = C.has(profile, q.id);
    const s = mk('span', (on ? 'on' : '') + (q.id === id ? ' cur' : ''));
    if (on && q.id !== id && onGo) s.addEventListener('click', (e) => { e.stopPropagation(); onGo(q.id); });
    pips.appendChild(s);
  });
  const btn = mk('button', 'btn', escapeHtml(x('ui.close')));
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClose?.(); });
  el.querySelector('.mys-btns').appendChild(btn);
  const box = el.querySelector('.mys-x'), text = v.body;
  let k = 0, timer = 0;
  const step = () => {
    if (!box.isConnected && k > 0) return;
    k = Math.min(text.length, k + 3);
    box.innerHTML = escapeHtml(text.slice(0, k)) + (k < text.length ? '<i>▮</i>' : '');
    if (k < text.length) timer = setTimeout(step, 20);
  };
  timer = setTimeout(step, 120);
  el.addEventListener('click', () => { k = Math.max(k, text.length - 3); });
  el._stop = () => clearTimeout(timer);
  return el;
}

/** codex sub-tab: the twelve-row index. opts: { onOpen(id) } */
export function renderIndex(grid, profile, { onOpen } = {}) {
  ensureStyle();
  const n = C.count(profile);
  grid.appendChild(mk('div', 'mys-top', `<span>${escapeHtml(x('ui.title'))} ${n}/${C.TOTAL}</span><div class="mys-bar"><i style="width:${Math.round((n / C.TOTAL) * 100)}%"></i></div>`));
  grid.appendChild(mk('div', 'mys-note', escapeHtml(n ? x('ui.sub') : x('ui.empty'))));
  const list = mk('div', 'mys-idx');
  C.FRAGMENTS.forEach((f, i) => {
    const on = C.has(profile, f.id);
    const row = mk('div', 'mys-row' + (on ? '' : ' off'), `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="k">${escapeHtml(on ? x('k.' + f.kind) : '????')}</span><span>${escapeHtml(on ? x(f.id + '.h') : x('ui.lost'))}</span><span class="d">${on ? escapeHtml(f.at) : ''}</span>`);
    if (on) { row.tabIndex = 0; row.addEventListener('click', (e) => { e.stopPropagation(); onOpen?.(f.id); }); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOpen?.(f.id); }); }
    list.appendChild(row);
  });
  grid.appendChild(list);
  grid.appendChild(mk('div', 'mys-m', escapeHtml(x('ui.mile'))));
}

/**
 * The ending scene (milestone 12): black, UPLOADING #000001, the 14 seconds on a pixel CRT, five lines, the title. Skippable by click / Enter / Escape.
 * -> { skip(), remove(), done: Promise } ; opts.onTitle() runs when the title appears (the caller grants the title there)
 */
export function playEnding({ onTitle, sfx } = {}) {
  ensureStyle();
  let finish = () => {};
  const done = new Promise((r) => { finish = r; });
  if (typeof document === 'undefined') { onTitle?.(); finish(); return { skip() {}, remove() {}, done }; }
  document.querySelectorAll('.mys-end').forEach((q) => q.remove());
  const el = mk('div', 'mys-end');
  el.innerHTML = `<div class="up"></div><canvas width="64" height="48"></canvas><div class="ln"></div><div class="tt"></div><div class="sk">[ENTER]</div>`;
  document.body.appendChild(el);
  const up = el.querySelector('.up'), cv = el.querySelector('canvas'), ln = el.querySelector('.ln'), tt = el.querySelector('.tt');
  const g = cv.getContext('2d');
  const timers = [];
  let raf = 0, t0 = 0, playing = false, ended = false, titled = false;
  const at = (ms, fn) => timers.push(setTimeout(() => { if (!ended) fn(); }, ms));
  const line = (id) => { const d = mk('div', '', escapeHtml(x(id))); ln.appendChild(d); while (ln.children.length > 3) ln.firstChild.remove(); };
  const frame = (now) => {
    if (ended) return;
    if (playing) { const u = Math.min(13.99, (now - t0) / 1000); drawCatFrame(g, u); if (u >= 13.99) playing = false; }
    raf = requestAnimationFrame(frame);
  };
  const title = () => {
    if (titled) return; titled = true;
    tt.textContent = x('end.title'); tt.classList.add('on');
    try { onTitle?.(); } catch (e) { console.warn('[mystery10] title', e); }
  };
  const remove = () => {
    if (ended) return;
    ended = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey, true);
    title();
    el.classList.remove('on'); el.classList.add('out');
    setTimeout(() => { el.remove(); finish(); }, 2500);
  };
  let skipped = false;
  const skipTo = () => {
    if (ended) return;
    if (titled || skipped) { remove(); return; }
    skipped = true; timers.forEach(clearTimeout); timers.length = 0; playing = false;
    cv.classList.remove('on'); up.textContent = ''; ln.innerHTML = ''; line('end.l6'); title();
    timers.push(setTimeout(remove, 2600));
  };
  const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); skipTo(); } };
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('click', skipTo);
  requestAnimationFrame(() => el.classList.add('on'));
  raf = requestAnimationFrame(frame);
  const vid = 3000;                                            // ms: the video starts after the upload card
  at(900, () => { up.textContent = x('end.up'); sfx?.('term'); });
  at(vid, () => { cv.classList.add('on'); t0 = performance.now(); playing = true; up.textContent = x('end.up') + '  ...  100%'; });
  at(vid + 1200, () => line('end.l1'));
  at(vid + 12300, () => line('end.l2'));
  at(vid + 13300, () => line('end.l3'));
  at(vid + 15500, () => { cv.classList.remove('on'); up.textContent = ''; ln.innerHTML = ''; line('end.l4'); });
  at(vid + 18500, () => line('end.l5'));
  at(vid + 20500, () => { line('end.l6'); sfx?.('chime'); });
  at(vid + 23000, title);
  at(vid + 29500, remove);
  return { skip: skipTo, remove, done };
}
export { xf };
