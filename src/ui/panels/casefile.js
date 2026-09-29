// Case file card (end-of-day cinematic + archive detail), case archive list, recovered lore logs list + the log
// reading overlay. Self-contained DOM + injected CSS. Used by game/casefile.js, game/lore.js and panels/contracts.js.
import { drawAlgoFace } from '../../game/algorithm.js';
import { FACTIONS, LINES, LORE_LOGS, CHAPTERS, pickLang } from '../../game/loredata.js';
import { getLang, t } from '../../core/i18n.js';
import { escapeHtml } from '../../core/util.js';

const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
/** other modules register a renderer for their own case kind: caseRenderers[kind] = (c, opts) => HTMLElement, caseTexts[kind] = (c) => string (terminal CASE <n>) */
export const caseRenderers = {}, caseTexts = {};
const L = (en, trs) => (tr() ? trs : t(en));   // RU: dictionary keyed by the English text
const STYLE_ID = 'tfg-lore-case-style';
const CSS = `
.lcase-cine{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(20,6,12,.55),rgba(0,0,0,.88));
 animation:lcIn .5s both;pointer-events:auto}
.lcase-cine.out{animation:lcOut .6s both}
@keyframes lcIn{from{opacity:0}to{opacity:1}} @keyframes lcOut{to{opacity:0;transform:scale(1.03)}}
.lcase{position:relative;width:min(760px,94vw);max-height:92vh;overflow:hidden;padding:22px 26px 18px;color:#2b2014;font-family:'Courier New',ui-monospace,monospace;
 background:linear-gradient(180deg,#efe4c9,#e2d3b0);box-shadow:0 18px 60px rgba(0,0,0,.8),inset 0 0 60px rgba(120,80,30,.25);transform:rotate(-.6deg);border-radius:2px}
.lcase::before{content:'';position:absolute;left:-1px;top:-18px;width:180px;height:30px;background:#d9c69c;border-radius:6px 6px 0 0;box-shadow:inset 0 -4px 6px rgba(0,0,0,.08)}
.lcase::after{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(80,50,20,.035) 0 1px,transparent 1px 4px),radial-gradient(circle at 80% 20%,rgba(160,110,50,.12),transparent 40%)}
.lcase.mini{transform:none;width:100%;max-height:none;box-shadow:inset 0 0 40px rgba(120,80,30,.2)}
.lc-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:2px solid #2b2014;padding-bottom:8px;margin-bottom:10px}
.lc-no{font-size:40px;font-weight:bold;letter-spacing:3px;line-height:1}
.lc-org{font-size:12px;letter-spacing:2px;opacity:.75;margin-top:4px}
.lc-meta{font-size:15px;margin-top:6px}
.lc-photo{flex:none;background:#fff;padding:5px 5px 16px;box-shadow:0 3px 10px rgba(0,0,0,.35);transform:rotate(3deg)}
.lc-photo canvas{display:block;width:128px;height:96px;image-rendering:pixelated}
.lc-photo div{font-size:10px;text-align:center;margin-top:3px;letter-spacing:1px}
.lc-rows{display:grid;grid-template-columns:1fr 1fr;gap:3px 22px}
.lc-row{display:flex;gap:6px;font-size:16px;line-height:1.35;opacity:0;animation:lcRow .3s both;animation-delay:calc(.6s + var(--i) * .26s)}
.lcase.mini .lc-row{animation:none;opacity:1}
.lc-row.wide{grid-column:1 / -1}
.lc-row b{white-space:nowrap}
.lc-row span{flex:1;border-bottom:1px dotted rgba(43,32,20,.45);min-width:10px;margin-bottom:5px}
.lc-row em{font-style:normal;text-align:right}
.lc-row.bad em{color:#9a1010}
@keyframes lcRow{from{opacity:0;transform:translateX(-6px)}to{opacity:1}}
.lc-words{margin:12px 0 6px;padding:10px 14px;background:rgba(43,32,20,.08);border-left:4px solid #9a1010;opacity:0;animation:lcRow .4s both;animation-delay:calc(.6s + var(--i) * .26s)}
.lcase.mini .lc-words{animation:none;opacity:1}
.lc-words small{display:block;font-size:12px;letter-spacing:2px;opacity:.7}
.lc-words q{display:block;font-size:26px;font-weight:bold;font-style:italic;line-height:1.15;margin-top:2px}
.lc-verdict{display:flex;gap:10px;align-items:center;margin-top:8px;font-size:16px;opacity:0;animation:lcRow .4s both;animation-delay:calc(.6s + var(--i) * .26s)}
.lcase.mini .lc-verdict{animation:none;opacity:1}
.lc-verdict b{letter-spacing:2px;font-size:12px;background:#2b2014;color:#efe4c9;padding:2px 6px}
.lc-stamp{position:absolute;right:26px;bottom:54px;padding:6px 14px;border:4px solid #b01818;color:#b01818;font:bold 30px/1 'Courier New',monospace;letter-spacing:3px;
 transform:rotate(-14deg) scale(2.2);opacity:0;mix-blend-mode:multiply;text-align:center;pointer-events:none}
.lc-stamp small{display:block;font-size:11px;letter-spacing:2px;margin-top:3px}
.stamped .lc-stamp,.lcase.mini .lc-stamp{transform:rotate(-14deg) scale(1);opacity:.85;transition:transform .18s cubic-bezier(.2,1.6,.4,1),opacity .1s}
.lc-hint{position:absolute;left:0;right:0;bottom:-30px;text-align:center;color:#d8c8a8;font-size:14px;letter-spacing:2px;opacity:.6}
.lclist{display:flex;flex-direction:column;gap:4px}
.lclist-row{display:grid;grid-template-columns:80px 70px 1fr 90px 90px;gap:8px;padding:5px 8px;border:1px solid rgba(255,138,61,.22);background:rgba(0,0,0,.3);cursor:pointer;font-size:19px}
.lclist-row:hover,.lclist-row:focus{border-color:var(--amber,#ff8a3d);outline:none}
.lclist-row .bad{color:#ff6b5a}
.llog{width:min(760px,94vw);max-height:88vh;overflow:auto;padding:18px 22px;background:linear-gradient(180deg,rgba(6,14,10,.97),rgba(3,8,6,.97));border:1px solid rgba(57,255,106,.45);
 box-shadow:0 0 40px rgba(57,255,106,.12),inset 0 0 60px rgba(57,255,106,.05);color:#b9ffcf;font-family:var(--font,monospace);position:relative}
.llog::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 1px,transparent 1px 3px)}
.llog-h{display:flex;justify-content:space-between;gap:12px;font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;color:#39ff6a;border-bottom:1px solid rgba(57,255,106,.3);padding-bottom:8px}
.llog-t{font-size:30px;color:#eaffef;margin:10px 0 2px}
.llog-a{font-size:18px;opacity:.7}
.llog-x{font-size:25px;line-height:1.3;margin:14px 0;min-height:120px;white-space:pre-wrap}
.llog-x i{font-style:normal;color:#39ff6a}
.llog-f{display:flex;justify-content:space-between;align-items:center;font-size:18px;opacity:.8}
.llog-tag{padding:0 8px;border:1px solid var(--fc,#39ff6a);color:var(--fc,#39ff6a)}
.llog-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}
.llog-card{padding:6px 8px;border:1px solid rgba(57,255,106,.25);background:rgba(0,0,0,.35);cursor:pointer;font-size:18px;color:#b9ffcf}
.llog-card.off{opacity:.35;cursor:default}
.lb-h{font-family:var(--font2,monospace);font-size:12px;letter-spacing:2px;color:var(--amber,#ff8a3d);margin:6px 0 8px}
.lb-d{font-size:19px;opacity:.8}
.llog-card:hover:not(.off),.llog-card:focus{border-color:#39ff6a;outline:none}
`;
export function ensureCaseStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

function stampFor(c) {
  if (c.allDead) return [L('SERIES FINALE', 'SEZON FİNALİ'), L('all crew lost', 'tüm ekip kayıp')];
  if (c.abandoned?.length) return [L('BETRAYAL', 'İHANET'), L('certified content', 'onaylı içerik')];
  if (c.deaths?.length) return [L('APPROVED', 'ONAYLANDI'), L('content monetized', 'içerik paraya çevrildi')];
  if ((c.value || 0) < 60) return [L('DEMONETIZED', 'PARASIZ'), L('insufficient drama', 'yetersiz drama')];
  return [L('RENEWED', 'YENİLENDİ'), L('for another episode', 'bir bölüm daha')];
}
function verdictOf(c) {
  const pair = LINES[c?.verdict?.key]?.[c?.verdict?.i];
  return pair ? pickLang(pair, tr()).replace(/\{name\}/g, c.verdict.v?.name || '???') : '';
}

/** The case file card. opts: { game, cinematic } */
export function renderCaseCard(c, opts = {}) {
  ensureCaseStyle();
  const ext = c?.kind && caseRenderers[c.kind];
  if (ext) return ext(c, opts);
  const card = mk('div', 'lcase' + (opts.cinematic ? '' : ' mini'));
  const top = mk('div', 'lc-top');
  const left = mk('div', '', `<div class="lc-no">CASE #${escapeHtml(c.n)}</div><div class="lc-org">${L('THE ALGORITHM · CONTENT REVIEW DIVISION · CLASSIFIED', 'ALGORİTMA · İÇERİK İNCELEME BİRİMİ · GİZLİ')}</div>`
    + `<div class="lc-meta">${escapeHtml(c.moon || '')}${c.interior ? ' · ' + escapeHtml(c.interior) : ''} · ${L('DAY', 'GÜN')} ${escapeHtml(c.day)} · ${new Date(c.at || Date.now()).toLocaleDateString()}</div>`);
  const photo = mk('div', 'lc-photo');
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
  photo.append(cv, mk('div', '', L('REVIEWER', 'İNCELEYEN')));
  top.append(left, photo);
  card.appendChild(top);
  const ctx = cv.getContext('2d');
  let t = 0;
  drawAlgoFace(ctx, 64, 48, 0, { mood: c.mood, glitch: 0.3, talk: 0.2 });
  if (opts.cinematic) {
    const iv = setInterval(() => { if (!cv.isConnected) { clearInterval(iv); return; } t += 0.08; drawAlgoFace(ctx, 64, 48, t, { mood: c.mood, glitch: 0.3, talk: 0.4 }); }, 80);
  }
  const rows = [];
  const row = (label, value, extra = '') => rows.push(`<div class="lc-row ${extra}" style="--i:${rows.length}"><b>${escapeHtml(label)}</b><span></span><em>${value}</em></div>`);
  row(L('Entered', 'Giren'), escapeHtml(c.entered));
  row(L('Returned', 'Dönen'), escapeHtml(c.returned), c.returned < c.entered ? 'bad' : '');
  row(L('Value extracted', 'Çıkarılan değer'), '▮' + escapeHtml(c.value));
  row(L('Creatures deleted', 'Silinen varlık'), escapeHtml(c.kills || 0));
  row(L('Artifacts', 'Eserler'), escapeHtml(c.artifacts?.length || 0));
  row(L('Facility events', 'Tesis olayları'), escapeHtml(c.events?.length ? c.events.slice(0, 3).join(', ') : L('none', 'yok')));
  row('MVP', escapeHtml(c.mvp ? `${c.mvp.name} (▮${c.mvp.loot})` : '—'));
  row(L('Most valuable item', 'En değerli eşya'), escapeHtml(c.top ? `${c.top.name} (▮${c.top.value})` : '—'));
  if (c.deaths?.length) row(L('Cause of death', 'Ölüm nedeni'), escapeHtml(c.deaths.map((d) => `${d.name} ${tr() ? 'öldü' : d.causeText}`).join(' · ')), 'bad wide');
  if (c.abandoned?.length) row(L('Crewmate abandoned', 'Terk edilen'), escapeHtml(c.abandoned.join(', ')), 'bad');
  if (c.contract) row(L('Contract', 'Sözleşme'), escapeHtml(`${pickLang(c.contract.title, tr())} [${FACTIONS[c.contract.f]?.short || ''}] ${String(c.contract.result).toUpperCase()}`), c.contract.result === 'failed' ? 'bad' : '');
  if (c.secret) row(L('Secret objective', 'Gizli görev'), escapeHtml(pickLang(c.secret.name, tr()) + ' ✔'));
  card.appendChild(mk('div', 'lc-rows', rows.join('')));
  let i = rows.length;
  if (c.lastWords) {
    card.appendChild(mk('div', 'lc-words', `<small>${L('LAST WORDS', 'SON SÖZLER')} - ${escapeHtml(c.lastWords.name)}</small><q>${escapeHtml(c.lastWords.text || L('[no transmission]', '[yayın yok]'))}</q>`));
    card.lastChild.style.setProperty('--i', i++);
  }
  const v = verdictOf(c);
  if (v) { const e = mk('div', 'lc-verdict', `<b>${L('VERDICT', 'KARAR')}</b><span>“${escapeHtml(v)}”</span>`); e.style.setProperty('--i', i++); card.appendChild(e); }
  const [s1, s2] = stampFor(c);
  card.appendChild(mk('div', 'lc-stamp', `${escapeHtml(s1)}<small>${escapeHtml(s2)}</small>`));
  if (opts.cinematic) card.appendChild(mk('div', 'lc-hint', L('click to file the case', 'dosyalamak için tıkla')));
  return card;
}

/** Case archive list; onOpen(case) shows the detail. */
export function renderCaseList(body, list, onOpen) {
  ensureCaseStyle();
  if (!list?.length) { body.appendChild(mk('div', 'lb-d', L('No case files yet. Survive a day (or do not).', 'Henüz dava yok. Bir gün hayatta kal (ya da kalma).'))); return; }
  const wrap = mk('div', 'lclist');
  for (const c of list) {
    const r = mk('div', 'lclist-row', `<b>#${escapeHtml(c.n)}</b><span>${L('DAY', 'GÜN')} ${escapeHtml(c.day)}</span><span>${escapeHtml(c.moon || '')}</span>`
      + `<span>▮${escapeHtml(c.value)}</span><span class="${c.deaths?.length ? 'bad' : ''}">${escapeHtml(c.returned)}/${escapeHtml(c.entered)}${c.allDead ? ' WIPE' : ''}</span>`);
    r.tabIndex = 0;
    r.addEventListener('click', (e) => { e.stopPropagation(); onOpen(c); });
    wrap.appendChild(r);
  }
  body.appendChild(wrap);
}

/** Recovered lore logs grid (read ones clickable). */
export function renderLogList(body, readMap, onRead) {
  ensureCaseStyle();
  const n = LORE_LOGS.filter((l) => readMap?.[l.id]).length;
  body.appendChild(mk('div', 'lb-h', `${L('RECOVERED LOGS', 'KURTARILAN KAYITLAR')} ${n}/${LORE_LOGS.length}`));
  const grid = mk('div', 'llog-list');
  LORE_LOGS.forEach((l, i) => {
    const on = !!readMap?.[l.id];
    const f = l.faction && FACTIONS[l.faction];
    const e = mk('div', 'llog-card' + (on ? '' : ' off'), on ? `<b>${String(i + 1).padStart(2, '0')}</b> ${escapeHtml(l.title)}<br><span style="opacity:.7">${escapeHtml(l.author)}${f ? ` · <span style="color:${f.color}">${escapeHtml(f.short)}</span>` : ''} · CH${l.ch}</span>` : `<b>${String(i + 1).padStart(2, '0')}</b> ???<br><span style="opacity:.6">${L('not recovered', 'bulunmadı')} · CH${l.ch}</span>`);
    if (on) { e.tabIndex = 0; e.addEventListener('click', (ev) => { ev.stopPropagation(); onRead(l); }); }
    grid.appendChild(e);
  });
  body.appendChild(grid);
}

/** The lore log reading overlay (typewriter). Returns the element (put it in ui.openPanel()). */
export function createLogReader(log, { index = 0, total = LORE_LOGS.length, found = 0, onClose, fresh = false } = {}) {
  ensureCaseStyle();
  const T = tr();
  const f = log.faction && FACTIONS[log.faction];
  const ch = CHAPTERS[(log.ch || 1) - 1];
  const el = mk('div', 'llog');
  el.innerHTML = `<div class="llog-h"><span>${fresh ? L('LOG RECOVERED', 'KAYIT KURTARILDI') : L('ARCHIVED LOG', 'ARŞİV KAYDI')} · ${String(index + 1).padStart(2, '0')}/${total}</span><span>CH${log.ch} · ${escapeHtml(pickLang(ch?.name, T))}</span></div>`
    + `<div class="llog-t">${escapeHtml(log.title)}</div><div class="llog-a">— ${escapeHtml(log.author)}</div><div class="llog-x"></div>`
    + `<div class="llog-f"><span>${f ? `<span class="llog-tag" style="--fc:${f.color}">${f.glyph} ${escapeHtml(f.name)}</span>` : `<span class="llog-tag">${L('UNAFFILIATED', 'BAĞIMSIZ')}</span>`} · ${L('recovered', 'bulunan')} ${found}/${total}</span></div>`;
  const btn = mk('button', 'btn', L('Close [ESC]', 'Kapat [ESC]'));
  btn.addEventListener('click', (e) => { e.stopPropagation(); onClose?.(); });
  el.querySelector('.llog-f').appendChild(btn);
  const x = el.querySelector('.llog-x');
  const text = pickLang(log.text, T);
  let n = 0;
  const step = () => {
    if (!x.isConnected && n > 0) return;
    n = Math.min(text.length, n + 3);
    x.innerHTML = escapeHtml(text.slice(0, n)) + (n < text.length ? '<i>▮</i>' : '');
    if (n < text.length) setTimeout(step, 22);
  };
  setTimeout(step, 120);
  el.addEventListener('click', () => { n = text.length - 3; });
  return el;
}
