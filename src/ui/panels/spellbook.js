// Magic UI: mana bar + spell slots (bottom HUD dock) and the hold-C spell wheel.
// Pure DOM + injected CSS; all state comes from the magic module (src/game/magic.js) passed in.
import { hudDock } from '../dock.js';
import { t } from '../../core/i18n.js';

// 12x12 pixel glyphs per spell ('#' = filled)
const GLYPHS = {
  push: ['............', '.##...##....', '..##...##...', '...##...##..', '....##...##.', '.....##...##', '.....##...##', '....##...##.', '...##...##..', '..##...##...', '.##...##....', '............'],
  pull: ['............', '....##...##.', '...##...##..', '..##...##...', '.##...##....', '##...##.....', '##...##.....', '.##...##....', '..##...##...', '...##...##..', '....##...##.', '............'],
  lumen: ['.....##.....', '.#...##...#.', '..#......#..', '....####....', '...######...', '##.######.##', '##.######.##', '...######...', '....####....', '..#......#..', '.#...##...#.', '.....##.....'],
  heal: ['............', '....####....', '....####....', '....####....', '.##########.', '.##########.', '.##########.', '.##########.', '....####....', '....####....', '....####....', '............'],
  blink: ['......###...', '.....###....', '....###.....', '...###......', '..########..', '.......###..', '......###...', '.....###....', '....###.....', '...##.......', '..#.........', '............'],
  shield: ['.##########.', '.##########.', '.##......##.', '.##.####.##.', '.##.####.##.', '.##.####.##.', '..##.##.##..', '..##.##.##..', '...##..##...', '....####....', '.....##.....', '............'],
  hush: ['............', '....#.......', '...##.......', '..###..#...#', '####....#.#.', '####.....#..', '####....#.#.', '..###..#...#', '...##.......', '....#.......', '............', '............'],
  fire: ['.....#......', '.....##.....', '....###.....', '....####.#..', '...#####.##.', '..##########', '.###.#######', '.###..######', '.####..####.', '..###...###.', '...#######..', '....#####...'],
};
const glyphCache = new Map();
/** wave 2: extra spell glyphs (12 rows of 12 chars, '#' = filled) */
export function registerGlyph(id, rows) { GLYPHS[id] = rows; glyphCache.delete(id); }
export function spellGlyph(id, cls = '') {
  const rows = GLYPHS[id];
  if (!rows) return '';
  let d = glyphCache.get(id);
  if (d === undefined) {
    d = '';
    for (let y = 0; y < 12; y++) {
      const row = rows[y] || '';
      let x = 0;
      while (x < 12) {
        if (row[x] === '#') { let x1 = x; while (x1 < 12 && row[x1] === '#') x1++; d += `M${x} ${y}h${x1 - x}v1h${x - x1}z`; x = x1; } else x++;
      }
    }
    glyphCache.set(id, d);
  }
  return `<svg class="mg-gly ${cls}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}

const CSS = `
.mg-dock{display:flex;flex-direction:column;align-items:center;gap:3px;font-family:var(--font,monospace);pointer-events:none;margin-bottom:14px}
.mg-heard{font-size:17px;color:#cfe6ff;text-shadow:0 0 6px #000,0 0 2px #000;opacity:0;transition:opacity .25s;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg-heard.on{opacity:.95}.mg-heard b{color:#fff;background:rgba(90,170,255,.35);padding:0 3px}
.mg-cast{font-family:var(--font2,monospace);font-size:12px;letter-spacing:2px;color:#fff;text-shadow:0 0 10px var(--mgc,#9fd4ff),0 0 2px #000;opacity:0;height:14px}
.mg-cast.pop{animation:mgpop .9s ease-out}
@keyframes mgpop{0%{opacity:0;transform:scale(1.8)}15%{opacity:1;transform:scale(1)}70%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
.mg-slots{display:flex;gap:4px}
.mg-slot{position:relative;width:30px;height:30px;border:1px solid rgba(120,180,255,.45);background:rgba(6,10,22,.72);color:var(--mgc,#9fd4ff);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 8px rgba(80,140,255,.15)}
.mg-slot .mg-gly{width:20px;height:20px;filter:drop-shadow(0 0 3px currentColor)}
.mg-slot .mg-cd{position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,.72) var(--cd,0%),transparent 0)}
.mg-slot .mg-k{position:absolute;right:1px;bottom:-3px;font-size:13px;color:#cfe6ff;text-shadow:0 0 3px #000}
.mg-slot.nomana{color:#56607a}.mg-slot.ready-flash{animation:mgready .5s ease-out}
.mg-slot.new{animation:mgnew 1.6s ease-out}
@keyframes mgready{0%{box-shadow:0 0 14px var(--mgc,#9fd4ff)}100%{box-shadow:inset 0 0 8px rgba(80,140,255,.15)}}
@keyframes mgnew{0%{transform:scale(2.2);box-shadow:0 0 30px #fff}100%{transform:scale(1)}}
.mg-bar{position:relative;width:236px;height:9px;border:1px solid rgba(120,180,255,.5);background:rgba(4,8,20,.75)}
.mg-bar .mg-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#2a5bff,#5ab8ff,#bfe4ff);box-shadow:0 0 8px rgba(90,170,255,.7);transition:width .1s linear}
.mg-bar .mg-sh{position:absolute;left:0;top:-4px;height:3px;background:#9fe8ff;box-shadow:0 0 6px #9fe8ff}
.mg-bar .mg-num{position:absolute;left:-46px;top:-6px;font-size:16px;color:#bfe4ff;text-shadow:0 0 4px #000;width:40px;text-align:right}
.mg-bar.low .mg-fill{animation:mglow .35s 2}
@keyframes mglow{50%{background:#ff4a4a}}
.mg-vig{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .4s}
.mg-vig.shield{box-shadow:inset 0 0 90px 20px rgba(80,170,255,.55)}
.mg-vig.hush{box-shadow:inset 0 0 120px 40px rgba(40,10,70,.7)}
.mg-vig.on{opacity:1}
.mg-wheel{position:fixed;left:50%;top:50%;width:440px;height:440px;margin:-220px 0 0 -220px;z-index:30;pointer-events:none;font-family:var(--font,monospace);color:#dff0ff}
.mg-wheel.hidden{display:none}
.mg-wheel::before{content:'';position:absolute;inset:40px;border-radius:50%;background:radial-gradient(circle,rgba(8,14,34,.88) 0 38%,rgba(8,14,34,.55) 62%,rgba(8,14,34,0) 71%);border:1px solid rgba(120,180,255,.25)}
.mg-wi{position:absolute;width:74px;height:74px;margin:-37px 0 0 -37px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(120,180,255,.35);background:rgba(6,10,24,.85);color:var(--mgc,#9fd4ff);transition:transform .08s}
.mg-wi .mg-gly{width:30px;height:30px;filter:drop-shadow(0 0 4px currentColor)}
.mg-wi .mg-wn{font-size:15px;color:#dff0ff;margin-top:1px}
.mg-wi .mg-wk{position:absolute;left:3px;top:0;font-size:14px;color:#8fb4e0}
.mg-wi.locked{color:#3a4458;border-style:dashed}.mg-wi.locked .mg-wn{color:#56607a}
.mg-wi.cool{opacity:.55}
.mg-wi.sel{transform:scale(1.18);border-color:#fff;box-shadow:0 0 18px var(--mgc,#9fd4ff)}
.mg-wc{position:absolute;left:50%;top:50%;width:190px;transform:translate(-50%,-50%);text-align:center}
.mg-wc .mg-t{font-family:var(--font2,monospace);font-size:13px;letter-spacing:2px;color:var(--mgc,#9fd4ff);text-shadow:0 0 10px var(--mgc,#9fd4ff)}
.mg-wc .mg-say{font-size:21px;color:#fff;margin:3px 0}
.mg-wc .mg-d{font-size:15px;line-height:1.05;opacity:.85}
.mg-wc .mg-s{font-size:14px;color:#8fb4e0;margin-top:4px}
.mg-hint{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);white-space:nowrap;font-size:15px;color:#8fb4e0;text-shadow:0 0 4px #000}
.mg-learn{position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);z-index:25;pointer-events:none;text-align:center;font-family:var(--font,monospace);animation:mglearn 4.2s ease-out forwards}
.mg-learn .mg-l1{font-family:var(--font2,monospace);font-size:15px;letter-spacing:4px;color:#bfe4ff;text-shadow:0 0 12px #5ab8ff}
.mg-learn .mg-l2{font-family:var(--font2,monospace);font-size:34px;letter-spacing:3px;color:var(--mgc,#fff);text-shadow:0 0 22px var(--mgc,#9fd4ff),3px 3px 0 #000;margin:8px 0}
.mg-learn .mg-l3{font-size:22px;color:#fff;text-shadow:0 0 6px #000}
.mg-learn .mg-gly{width:64px;height:64px;color:var(--mgc,#fff);filter:drop-shadow(0 0 12px currentColor)}
@keyframes mglearn{0%{opacity:0;transform:translate(-50%,-50%) scale(2.4)}10%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%)}}
`;

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('tfg-magic-style')) return;
  const s = document.createElement('style');
  s.id = 'tfg-magic-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const uiRoot = () => document.getElementById('ui') || document.body;

/** Mana bar + spell slots in the shared bottom dock. */
export class ManaDock {
  constructor(magic) {
    ensureCss();
    this.m = magic;
    this.box = hudDock('bottom', 'mana', 20);
    this.box.innerHTML = '<div class="mg-dock"><div class="mg-heard"></div><div class="mg-cast"></div><div class="mg-slots"></div><div class="mg-bar"><div class="mg-sh"></div><div class="mg-fill"></div><div class="mg-num"></div></div></div>';
    this.$ = {
      heard: this.box.querySelector('.mg-heard'), cast: this.box.querySelector('.mg-cast'), slots: this.box.querySelector('.mg-slots'),
      bar: this.box.querySelector('.mg-bar'), fill: this.box.querySelector('.mg-fill'), sh: this.box.querySelector('.mg-sh'), num: this.box.querySelector('.mg-num'),
    };
    this.vig = document.createElement('div');
    this.vig.className = 'mg-vig';
    uiRoot().appendChild(this.vig);
    this.slotEls = new Map();
    this.knownKey = '';
    this.acc = 0;
    this.heardT = 0;
  }
  rebuildSlots() {
    const m = this.m;
    const known = m.ORDER.filter((id) => m.knows(id));
    this.knownKey = known.join(',');
    this.$.slots.innerHTML = '';
    this.slotEls.clear();
    for (const id of known) {
      const sp = m.SPELLS[id];
      const e = document.createElement('div');
      e.className = 'mg-slot';
      e.style.setProperty('--mgc', hex(sp.color));
      e.innerHTML = spellGlyph(id) + '<div class="mg-cd"></div><div class="mg-k">' + (m.ORDER.indexOf(id) + 1) + '</div>';
      e.title = t(sp.name);
      this.$.slots.appendChild(e);
      this.slotEls.set(id, { el: e, cd: e.querySelector('.mg-cd'), ready: true });
    }
  }
  update(dt) {
    this.acc += dt;
    if (this.heardT > 0) { this.heardT -= dt; if (this.heardT <= 0) this.$.heard.classList.remove('on'); }
    if (this.acc < 1 / 15) return;
    this.acc = 0;
    const m = this.m;
    const key = m.ORDER.filter((id) => m.knows(id)).join(',');
    if (key !== this.knownKey) this.rebuildSlots();
    const max = m.maxMana;
    this.$.bar.style.display = m.bloodMagic ? 'none' : '';   // Blood Magic keystone: no mana bar
    this.$.fill.style.width = (100 * Math.max(0, m.mana) / Math.max(1, max)).toFixed(1) + '%';
    this.$.num.textContent = Math.floor(m.mana);
    this.$.sh.style.width = m.shieldHp > 0 ? Math.min(100, m.shieldHp / Math.max(1, m.shieldMax) * 100).toFixed(0) + '%' : '0%';
    for (const [id, s] of this.slotEls) {
      const f = m.cooldownFrac(id);
      s.cd.style.setProperty('--cd', (f * 100).toFixed(1) + '%');
      s.el.classList.toggle('nomana', m.bloodMagic ? false : m.mana < m.costOf(id));
      const ready = f <= 0;
      if (ready && !s.ready) { s.el.classList.remove('ready-flash'); void s.el.offsetWidth; s.el.classList.add('ready-flash'); }
      s.ready = ready;
    }
    this.vig.classList.toggle('shield', m.shieldHp > 0);
    this.vig.classList.toggle('hush', m.hushT > 0 && !(m.shieldHp > 0));
    this.vig.classList.toggle('on', m.shieldHp > 0 || m.hushT > 0);
  }
  showHeard(text, matched = []) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let h = esc(text.slice(-60));
    for (const w of matched) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<b>$1</b>');
    this.$.heard.innerHTML = '🎙 "' + h + '"';
    this.$.heard.classList.add('on');
    this.heardT = 2.6;
  }
  note(text) {
    this.$.heard.textContent = text;
    this.$.heard.classList.add('on');
    this.heardT = 1.6;
  }
  popCast(id, word) {
    const sp = this.m.SPELLS[id];
    this.$.cast.style.setProperty('--mgc', hex(sp.color));
    this.$.cast.textContent = '✦ ' + word + '!';
    this.$.cast.classList.remove('pop'); void this.$.cast.offsetWidth; this.$.cast.classList.add('pop');
  }
  lowMana() { this.$.bar.classList.remove('low'); void this.$.bar.offsetWidth; this.$.bar.classList.add('low'); }
  newSpell(id) {
    this.rebuildSlots();
    const s = this.slotEls.get(id);
    if (s) { s.el.classList.remove('new'); void s.el.offsetWidth; s.el.classList.add('new'); }
  }
  learnBanner(id, words) {
    const sp = this.m.SPELLS[id];
    const e = document.createElement('div');
    e.className = 'mg-learn';
    e.style.setProperty('--mgc', hex(sp.color));
    e.innerHTML = `${spellGlyph(id)}<div class="mg-l1">${t('NEW SPELL LEARNED')}</div><div class="mg-l2">${t(sp.name).toUpperCase()}</div><div class="mg-l3">${t('Say')} "${words}" · ${t('or type it in chat')} · [C]</div>`;
    uiRoot().appendChild(e);
    setTimeout(() => e.remove(), 4300);
  }
  dispose() { this.box.remove(); this.vig.remove(); document.querySelectorAll('.mg-learn').forEach((e) => e.remove()); }
}

/** Hold-C radial: 8 spells around the crosshair, mouse direction or 1-8 picks, release casts. */
export class SpellWheel {
  constructor(magic) {
    ensureCss();
    this.m = magic;
    this.el = document.createElement('div');
    this.el.className = 'mg-wheel hidden';
    uiRoot().appendChild(this.el);
    this.open = false; this.hover = -1; this.mx = 0; this.my = 0;
  }
  build() {
    const m = this.m, n = m.ORDER.length, r = 41;
    let h = '';
    m.ORDER.forEach((id, i) => {
      const sp = m.SPELLS[id];
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const known = m.knows(id);
      h += `<div class="mg-wi${known ? '' : ' locked'}" data-i="${i}" style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%;--mgc:${hex(sp.color)}"><span class="mg-wk">${i + 1}</span>${spellGlyph(id)}<span class="mg-wn">${known ? t(sp.name) : '???'}</span></div>`;
    });
    h += '<div class="mg-wc"></div><div class="mg-hint"></div>';
    this.el.innerHTML = h;
    this.items = [...this.el.querySelectorAll('.mg-wi')];
    this.center = this.el.querySelector('.mg-wc');
    this.hint = this.el.querySelector('.mg-hint');
  }
  show() {
    this.build();
    this.open = true; this.mx = 0; this.my = 0;
    this.el.classList.remove('hidden');
    this.hint.textContent = this.m.voiceStatusText();
    this.setHover(this.hover >= 0 ? this.hover : 0);
  }
  hide() { this.open = false; this.el.classList.add('hidden'); }
  move(dx, dy) {
    this.mx += dx; this.my += dy;
    const mag = Math.hypot(this.mx, this.my);
    if (mag > 25) {
      const L = this.m.ORDER.length;
      const a = Math.atan2(this.my, this.mx) + Math.PI / 2;
      this.setHover(((Math.round((a / (Math.PI * 2)) * L) % L) + L) % L);
      if (mag > 160) { this.mx *= 160 / mag; this.my *= 160 / mag; }
    }
  }
  setHover(i) {
    if (!this.items) return;
    if (i !== this.hover) this.m.game.audio?.ui?.('ui_hover', 0.25);
    this.hover = i;
    const m = this.m;
    this.items.forEach((e, k) => { e.classList.toggle('sel', k === i); e.classList.toggle('cool', m.knows(m.ORDER[k]) && m.cooldownFrac(m.ORDER[k]) > 0); });
    const id = m.ORDER[i];
    const sp = m.SPELLS[id];
    if (!sp) return;
    this.center.style.setProperty('--mgc', hex(sp.color));
    const known = m.knows(id);
    const cd = m.cooldownLeft(id);
    this.center.innerHTML = `<div class="mg-t">${known ? t(sp.name).toUpperCase() : '???'}</div>`
      + `<div class="mg-say">"${sp.say.en}" · "${sp.say.tr}"</div>`
      + `<div class="mg-d">${t(sp.desc)}</div>`
      + `<div class="mg-s">${known ? `${m.bloodMagic ? m.hpCost(id) + ' HP' : m.costOf(id) + ' ' + t('mana')} · ${m.cooldownOf(id).toFixed(0)}s${cd > 0 ? ' · ' + t('ready in') + ' ' + cd.toFixed(1) + 's' : ''}` : t('Learn it from a skillbook') + ` (${t(sp.tierName)})`}</div>`;
  }
  selected() { return this.hover >= 0 ? this.m.ORDER[this.hover] : null; }
  dispose() { this.el.remove(); }
}
