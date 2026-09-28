// MIRROR DIMENSION DOM UI: countdown timer, Reflection Meter + dimension level bars, upgrade chips, dash cooldown, the big
// level-up cards (1/2/3 or click), cracked-reflection respawn timer, SHATTERED / LOST splash and the glass-crack overlay.
import { t } from '../core/i18n.js';

const CSS = `
.mr-root{position:fixed;inset:0;pointer-events:none;z-index:24;font-family:var(--font1,monospace);color:#e6dcff;display:none}
.mr-root.on{display:block}
.mr-timer{position:absolute;left:50%;top:14px;transform:translateX(-50%);text-align:center;text-shadow:2px 2px 0 #000}
.mr-clock{font-family:var(--font2,monospace);font-size:46px;letter-spacing:4px;color:#e6dcff;text-shadow:0 0 14px #8a4fff,2px 2px 0 #000}
.mr-lab{font-size:15px;letter-spacing:3px;color:#b9a6ff}
.mr-timer.warn .mr-clock{color:#ff9aa8;text-shadow:0 0 16px #ff2a5a,2px 2px 0 #000;animation:mrPulse .5s steps(2) infinite}
.mr-timer.ot .mr-clock{color:#ff3050;text-shadow:0 0 20px #ff2a5a,3px 0 #20ffe0,-3px 0 #ff00c8;animation:mrGlitch .12s steps(2) infinite}
.mr-timer.ot .mr-lab{color:#ff5a6a}
@keyframes mrPulse{50%{opacity:.55}}
@keyframes mrGlitch{0%{transform:translateX(0)}50%{transform:translateX(3px) skewX(-6deg)}}
.mr-meter{position:absolute;left:50%;top:92px;transform:translateX(-50%);width:min(360px,60vw);text-align:center;font-size:14px;letter-spacing:2px}
.mr-bar{height:9px;background:#140a26;border:1px solid #6a4fb8;margin-top:3px;position:relative}
.mr-bar i{display:block;height:100%;background:linear-gradient(90deg,#7a3cff,#ff4fd0);width:0}
.mr-bar.xp{height:5px;border-color:#3a2a68;margin-top:5px}.mr-bar.xp i{background:#5affc0}
.mr-chips{position:absolute;left:14px;top:46vh;display:flex;flex-direction:column;gap:4px}
.mr-chip{font-size:14px;background:rgba(10,4,24,.78);border:1px solid #6a4fb8;padding:2px 8px;text-shadow:1px 1px 0 #000}
.mr-chip b{margin-right:6px}
.mr-dash{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);font-size:14px;letter-spacing:2px;color:#e0e0ff;display:none}
.mr-dash .mr-bar{width:110px;margin:3px auto 0}
.mr-cards{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:22px;background:rgba(6,0,16,.62);pointer-events:auto;flex-wrap:wrap;padding:16px}
.mr-cards.on{display:flex}
.mr-cards h2{flex-basis:100%;text-align:center;margin:0 0 6px;font-family:var(--font2,monospace);font-size:30px;letter-spacing:6px;color:#fff;text-shadow:0 0 16px #8a4fff,2px 2px 0 #000}
.mr-card{width:min(230px,28vw);min-width:170px;min-height:290px;background:linear-gradient(180deg,#1a0d34,#0a0418);border:3px solid var(--c,#8a4fff);box-shadow:0 0 22px var(--c,#8a4fff),inset 0 0 26px rgba(138,79,255,.25);
  padding:14px 12px;text-align:center;cursor:pointer;transition:transform .12s;display:flex;flex-direction:column;align-items:center;gap:10px}
.mr-card:hover,.mr-card.sel{transform:translateY(-8px) scale(1.04)}
.mr-key{font-family:var(--font2,monospace);font-size:34px;color:#fff;text-shadow:0 0 10px var(--c,#8a4fff)}
.mr-glyph{font-family:var(--font2,monospace);font-size:38px;color:var(--c,#fff);border:2px solid var(--c,#fff);padding:10px 12px;letter-spacing:2px;text-shadow:0 0 12px var(--c,#fff)}
.mr-nm{font-size:22px;color:#fff;letter-spacing:1px}.mr-ds{font-size:16px;color:#cbbcf5;line-height:1.25}.mr-lv{font-size:14px;color:#9a86e0;letter-spacing:2px;margin-top:auto}
.mr-cards .mr-hint{flex-basis:100%;text-align:center;font-size:15px;color:#b9a6ff;letter-spacing:2px}
.mr-cracked{position:absolute;left:50%;top:32%;transform:translate(-50%,-50%);text-align:center;display:none;text-shadow:2px 2px 0 #000}
.mr-cracked b{display:block;font-family:var(--font2,monospace);font-size:34px;letter-spacing:5px;color:#ff9aa8;text-shadow:0 0 14px #ff2a5a,2px 2px 0 #000}
.mr-cracked span{font-size:20px;letter-spacing:2px;color:#e6dcff}
.mr-splash{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:#000;pointer-events:auto}
.mr-splash.on{display:flex;animation:mrShatter .35s steps(3)}
.mr-splash b{font-family:var(--font2,monospace);font-size:clamp(46px,11vw,120px);letter-spacing:10px;color:#fff;text-shadow:6px 0 #ff2a5a,-6px 0 #20ffe0,0 0 40px #8a4fff;animation:mrGlitch .1s steps(2) infinite}
.mr-splash span{font-size:22px;letter-spacing:4px;color:#b9a6ff;margin-top:12px}
@keyframes mrShatter{0%{filter:invert(1)}100%{filter:invert(0)}}
.mr-crack{position:absolute;inset:0;opacity:0;transition:opacity .3s}
.mr-crack svg{width:100%;height:100%}
`;

function crackSvg() {
  // deterministic jagged lines radiating from a few impact points
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const parts = [];
  for (const [cx, cy] of [[22, 30], [78, 66], [50, 88], [90, 14], [8, 78]]) {
    for (let i = 0; i < 7; i++) {
      let x = cx, y = cy, a = r() * Math.PI * 2, pts = `${x},${y}`;
      for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.9; const l = 4 + r() * 9; x += Math.cos(a) * l; y += Math.sin(a) * l; pts += ` ${x.toFixed(1)},${y.toFixed(1)}`; }
      parts.push(`<polyline points="${pts}" fill="none" stroke="#e8e4ff" stroke-width="${(0.15 + r() * 0.25).toFixed(2)}" stroke-opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`);
    }
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${parts.join('')}</svg>`;
}

export function createMirrorUI() {
  const style = document.createElement('style');
  style.id = 'mirror-style'; style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'mr-root';
  root.innerHTML = `
    <div class="mr-crack">${crackSvg()}</div>
    <div class="mr-timer"><div class="mr-lab" data-k="lab"></div><div class="mr-clock" data-k="clock">3:00</div></div>
    <div class="mr-meter"><div data-k="mlab"></div><div class="mr-bar"><i data-k="mbar"></i></div><div class="mr-bar xp"><i data-k="xbar"></i></div><div data-k="lvl" style="font-size:13px;margin-top:2px;color:#5affc0"></div></div>
    <div class="mr-chips" data-k="chips"></div>
    <div class="mr-dash" data-k="dash"><span data-k="dlab"></span><div class="mr-bar"><i data-k="dbar" style="background:#e0e0ff"></i></div></div>
    <div class="mr-cracked" data-k="cracked"><b></b><span></span></div>
    <div class="mr-cards" data-k="cards"></div>
    <div class="mr-splash" data-k="splash"><b></b><span></span></div>`;
  (document.getElementById('ui') || document.body).appendChild(root);
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  const el = { lab: q('lab'), clock: q('clock'), timer: root.querySelector('.mr-timer'), mlab: q('mlab'), mbar: q('mbar'), xbar: q('xbar'), lvl: q('lvl'), chips: q('chips'), dash: q('dash'), dlab: q('dlab'), dbar: q('dbar'),
    cracked: q('cracked'), cards: q('cards'), splash: q('splash'), crack: root.querySelector('.mr-crack') };
  let cardOnPick = null, cardSig = '';
  const api = {
    root,
    show(on) { root.classList.toggle('on', !!on); if (!on) { api.hideCards(); api.showCracked(null); api.hideSplash(); el.crack.style.opacity = '0'; } },
    /** phase: 'normal' | 'warn' | 'overtime' */
    setTimer(text, phase, ot = 0) {
      el.clock.textContent = text;
      el.timer.className = 'mr-timer' + (phase === 'warn' ? ' warn' : phase === 'overtime' ? ' ot' : '');
      el.lab.textContent = phase === 'overtime' ? `${t('OVERTIME')} +${ot}` : t('THE MIRROR CLOSES IN');
    },
    setMeter(m, level, xp, need) {
      el.mlab.textContent = `${t('REFLECTION')}  ${Math.round(m.v)} / ${m.next}   ${t('REWARDS')} ${m.k}`;
      el.mbar.style.width = Math.round(m.frac * 100) + '%';
      el.lvl.textContent = `${t('LEVEL')} ${level}${level >= 15 ? ' MAX' : `   ${xp}/${need} XP`}`;
      el.xbar.style.width = level >= 15 ? '100%' : Math.round(Math.min(1, xp / Math.max(1, need)) * 100) + '%';
    },
    setChips(list) {
      const sig = JSON.stringify(list.map((c) => [c.glyph, c.lvl]));
      if (sig === el.chips._sig) return;
      el.chips._sig = sig;
      el.chips.innerHTML = list.map((c) => `<div class="mr-chip" style="border-color:${c.color}"><b style="color:${c.color}">${c.glyph}</b>${t(c.name)} ${c.lvl > 1 ? 'x' + c.lvl : ''}</div>`).join('');
    },
    setDash(frac, key = 'N') {
      if (frac === null) { el.dash.style.display = 'none'; return; }
      el.dash.style.display = 'block';
      el.dlab.textContent = frac >= 1 ? `${t('DASH')} [${key}]` : t('DASH');
      el.dbar.style.width = Math.round(Math.min(1, frac) * 100) + '%';
    },
    /** choices: [{ id, name, desc, glyph, color, lvl }] ; onPick(index). Returns nothing; hideCards() closes. */
    showCards(choices, onPick, title) {
      const sig = choices.map((c) => c.id).join(',');
      cardOnPick = onPick;
      cardSig = sig;
      el.cards.innerHTML = `<h2>${t(title || 'LEVEL UP')}</h2>` + choices.map((c, i) => `<div class="mr-card" data-i="${i}" style="--c:${c.color}"><div class="mr-key">${i + 1}</div><div class="mr-glyph">${c.glyph}</div><div class="mr-nm">${t(c.name)}</div><div class="mr-ds">${c.desc}</div><div class="mr-lv">${c.lvl > 0 ? `${t('LEVEL')} ${c.lvl} > ${c.lvl + 1}` : t('NEW')}</div></div>`).join('') + `<div class="mr-hint">${t('Press 1 / 2 / 3 or click a card')}</div>`;
      for (const card of el.cards.querySelectorAll('.mr-card')) card.addEventListener('click', () => cardOnPick?.(Number(card.dataset.i)));
      el.cards.classList.add('on');
    },
    hideCards() { el.cards.classList.remove('on'); el.cards.innerHTML = ''; cardOnPick = null; cardSig = ''; },
    get cardsOpen() { return el.cards.classList.contains('on'); },
    get cardSig() { return cardSig; },
    showCracked(sec) {
      if (sec === null) { el.cracked.style.display = 'none'; return; }
      el.cracked.style.display = 'block';
      el.cracked.querySelector('b').textContent = t('CRACKED REFLECTION');
      el.cracked.querySelector('span').textContent = sec > 0 ? `${t('You respawn at the mirror in')} ${Math.ceil(sec)} s` : t('Waiting for a living crewmate...');
    },
    showSplash(title, sub) { el.splash.querySelector('b').textContent = title; el.splash.querySelector('span').textContent = sub || ''; el.splash.classList.add('on'); },
    hideSplash() { el.splash.classList.remove('on'); },
    setCrack(a) { el.crack.style.opacity = String(Math.max(0, Math.min(1, a))); },
    dispose() { root.remove(); style.remove(); },
  };
  return api;
}
