// On-screen instrument panel for the `music` module: mini keyboard / chord grid / drum pads with the real note names,
// the songbook "follow along" strip and a one-line control hint. Purely presentational (music.js owns all state).
//
//   const p = createMusicPanel();          // hidden until show()
//   p.render(view)                          // view = { sig, name, kind, chips[], keys?, rows?, chords?, pads?, hint }; rebuilt only when view.sig changes
//   p.renderSong(song | null)               // { title, pos, total, acc, done, notes:[{name, key, state:'cur'|'next'|'done'}], hint }
//   p.press(code, cls?)                     // flash the key element carrying data-k="<KeyboardEvent.code>"
//   p.setShift(bool)                        // chord grid shows the SHIFT variants
import { t } from '../core/i18n.js';

const CSS = `
.mu-panel{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);width:min(780px,94vw);z-index:7;pointer-events:none;font-family:var(--font,monospace);color:#ffe9c9;
 background:linear-gradient(180deg,rgba(14,9,5,.86),rgba(8,5,3,.92));border:1px solid rgba(255,170,80,.45);box-shadow:0 0 22px rgba(255,140,50,.22),inset 0 0 18px rgba(0,0,0,.6);padding:8px 12px 9px;text-shadow:0 0 6px rgba(255,150,60,.35)}
.mu-panel.hidden{display:none}
.mu-head{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.mu-name{font-size:17px;letter-spacing:2px;text-transform:uppercase;margin-right:6px}
.mu-chip{font-size:12px;padding:1px 7px;border:1px solid rgba(255,190,110,.55);background:rgba(255,160,60,.1);letter-spacing:1px}
.mu-chip.warn{border-color:#ff5a4a;color:#ff9a8c;background:rgba(255,60,40,.14);animation:mupulse 1.1s ease-in-out infinite}
.mu-chip.jam{border-color:#7dff9a;color:#b8ffc9;background:rgba(80,255,140,.12)}
.mu-esc{margin-left:auto;font-size:12px;opacity:.6}
@keyframes mupulse{50%{opacity:.55}}
.mu-piano{position:relative;height:66px;display:flex;gap:2px}
.mu-wk{flex:1;background:#efe6d2;color:#2b2113;border:1px solid #6a5636;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:11px;line-height:1.15;padding-bottom:3px;text-shadow:none}
.mu-wk b{font-size:14px}
.mu-bk{position:absolute;top:0;width:6.2%;height:60%;background:#17120c;color:#ffd9a0;border:1px solid #000;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:10px;padding-bottom:2px;text-shadow:none;transform:translateX(-50%)}
.mu-bk b{font-size:12px}
.mu-wk.on,.mu-bk.on,.mu-c.on,.mu-pad.on,.mu-row .k.on{background:#ffb347;color:#1a0f04;box-shadow:0 0 12px #ff9a1f}
.mu-row{display:flex;gap:3px;margin-bottom:3px;justify-content:center}
.mu-row .k{min-width:40px;flex:0 1 54px;text-align:center;border:1px solid rgba(255,190,110,.5);background:rgba(255,160,60,.08);padding:3px 2px;font-size:11px;line-height:1.2}
.mu-row .k b{display:block;font-size:14px}
.mu-chords{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
.mu-c{border:1px solid rgba(255,190,110,.55);background:rgba(255,160,60,.08);text-align:center;padding:4px 2px}
.mu-c i{display:block;font-style:normal;font-size:11px;opacity:.7}
.mu-c b{display:block;font-size:19px}
.mu-c s{display:block;text-decoration:none;font-size:12px;opacity:.55}
.mu-panel.shift .mu-c s{opacity:1;color:#ffd06a}.mu-panel.shift .mu-c b{opacity:.5}
.mu-c.cur{border-color:#ffd06a;box-shadow:inset 0 0 10px rgba(255,190,90,.4)}
.mu-pads{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.mu-pad{border:2px solid var(--pc,#ffb347);background:rgba(255,160,60,.07);text-align:center;padding:7px 2px;font-size:12px}
.mu-pad b{display:block;font-size:17px}
.mu-song{margin-top:7px;border-top:1px dashed rgba(255,190,110,.35);padding-top:5px;font-size:12px}
.mu-song .top{display:flex;gap:10px;align-items:baseline;margin-bottom:3px}
.mu-song .ttl{font-size:14px;color:#ffd9a0}
.mu-song .acc{margin-left:auto;color:#b8ffc9}
.mu-notes{display:flex;gap:4px;min-height:36px;align-items:stretch}
.mu-notes .n{min-width:44px;text-align:center;border:1px solid rgba(255,190,110,.35);padding:2px 4px;opacity:.55}
.mu-notes .n b{display:block;font-size:14px}
.mu-notes .n i{display:block;font-style:normal;font-size:11px;color:#ffd06a}
.mu-notes .n.cur{opacity:1;border-color:#7dff9a;background:rgba(80,255,140,.16);box-shadow:0 0 10px rgba(80,255,140,.5);transform:translateY(-2px)}
.mu-notes .n.done{opacity:.25}
.mu-notes .n.bad{animation:mushake .18s}
@keyframes mushake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.mu-hint{margin-top:6px;font-size:11px;opacity:.72;line-height:1.35}
`;

let cssDone = false;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMusicPanel() {
  if (!cssDone) {
    cssDone = true;
    const st = document.createElement('style');
    st.dataset.mu = '1';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.className = 'mu-panel hidden';
  el.innerHTML = '<div class="mu-head"></div><div class="mu-body"></div><div class="mu-song" style="display:none"></div><div class="mu-hint"></div>';
  (document.getElementById('ui') || document.body).appendChild(el);
  const head = el.querySelector('.mu-head'), body = el.querySelector('.mu-body'), songEl = el.querySelector('.mu-song'), hintEl = el.querySelector('.mu-hint');
  let sig = '', songSig = '';
  const timers = new Set();

  function pianoHTML(keys) {
    // keys: [{ code, label, note, black, white:index }]  (white keys in order, blacks placed on the boundary after white index `after`)
    const whites = keys.filter((k) => !k.black), n = whites.length;
    const w = whites.map((k) => `<div class="mu-wk" data-k="${k.code}"><b>${esc(k.note)}</b><span>${esc(k.label)}</span></div>`).join('');
    const b = keys.filter((k) => k.black).map((k) => `<div class="mu-bk" data-k="${k.code}" style="left:${(((k.after + 1) / n) * 100).toFixed(2)}%"><b>${esc(k.note)}</b><span>${esc(k.label)}</span></div>`).join('');
    return `<div class="mu-piano">${w}${b}</div>`;
  }
  const rowHTML = (row) => `<div class="mu-row">${row.map((k) => `<div class="k" data-k="${k.code}"><b>${esc(k.note)}</b>${esc(k.label)}</div>`).join('')}</div>`;

  function render(view, force = false) {
    if (!view || (view.sig === sig && !force)) return;
    sig = view.sig;
    head.innerHTML = `<span class="mu-name">${esc(t(view.name))}</span>` + (view.chips || []).map((c) => `<span class="mu-chip ${c.cls || ''}">${esc(t(c.text))}</span>`).join('') + `<span class="mu-esc">${esc(t('ESC / Backspace = stop'))}</span>`;
    if (view.kind === 'keys' && view.piano) body.innerHTML = pianoHTML(view.piano);
    else if (view.kind === 'keys') body.innerHTML = view.rows.map(rowHTML).join('');
    else if (view.kind === 'chord' && view.chords) body.innerHTML = `<div class="mu-chords">${view.chords.map((c, i) => `<div class="mu-c${c.cur ? ' cur' : ''}" data-k="${c.code}"><i>${i + 1}</i><b>${esc(c.name)}</b><s>${esc(c.alt)}</s></div>`).join('')}</div>`;
    else if (view.kind === 'chord' && view.piano) body.innerHTML = pianoHTML(view.piano);
    else if (view.kind === 'drums') body.innerHTML = `<div class="mu-pads">${view.pads.map((p) => `<div class="mu-pad" data-k="${p.code}" data-pad="${p.idx}" style="--pc:${p.color}"><b>${esc(t(p.name))}</b>${esc(p.label)}</div>`).join('')}</div>`;
    hintEl.textContent = t(view.hint || '');
  }

  function renderSong(s) {
    if (!s) { if (songEl.style.display !== 'none') songEl.style.display = 'none'; songSig = ''; return; }
    const key = `${s.title}|${s.pos}|${s.acc}|${s.done}|${s.notes.map((n) => n.name + n.state).join(',')}|${s.bad || 0}`;
    if (key === songSig) return;
    songSig = key;
    songEl.style.display = '';
    const top = `<div class="top"><span class="ttl">${esc(s.title)}</span><span>${s.pos}/${s.total}</span><span>${esc(t(s.hint || ''))}</span><span class="acc">${s.done ? esc(t('DONE')) + ' ' : ''}${s.acc == null ? '' : Math.round(s.acc * 100) + '%'}</span></div>`;
    songEl.innerHTML = top + `<div class="mu-notes">${s.notes.map((n) => `<div class="n ${n.state}${n.state === 'cur' && s.bad ? ' bad' : ''}"><b>${esc(n.name)}</b><i>${esc(n.key || '')}</i></div>`).join('')}</div>`;
  }

  function press(code, cls = 'on', ms = 150) {
    const nodes = el.querySelectorAll(`[data-k="${code}"]`);
    nodes.forEach((n) => n.classList.add(cls));
    const id = setTimeout(() => { timers.delete(id); nodes.forEach((n) => n.classList.remove(cls)); }, ms);
    timers.add(id);
  }
  function pressPad(idx) { const n = el.querySelector(`[data-pad="${idx}"]`); if (n) { n.classList.add('on'); const id = setTimeout(() => { timers.delete(id); n.classList.remove('on'); }, 120); timers.add(id); } }
  function setChordCurrent(code) { el.querySelectorAll('.mu-c').forEach((n) => n.classList.toggle('cur', n.dataset.k === code)); }

  return {
    el, render, renderSong, press, pressPad, setChordCurrent,
    setShift(v) { el.classList.toggle('shift', !!v); },
    show() { el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); sig = ''; songSig = ''; },
    get visible() { return !el.classList.contains('hidden'); },
    dispose() { for (const id of timers) clearTimeout(id); timers.clear(); el.remove(); },
  };
}
