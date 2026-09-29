// DAILY juice (wave 4): crate reveal (shake -> lid -> spinning reel -> tier glow), level-up fanfare, celebration flash.
// Pure DOM + CSS + a little rAF; every effect cleans itself up. Sounds go through the `sfx(name, vol, pitch)` callback the caller gives
// (existing procedural sfx only). reduceMotion collapses the crate to a simple fade-in and the fanfares to a single pill.
import { el } from '../core/util.js';
import { t } from '../core/i18n.js';
import { TIERS, TIER_ORDER } from '../game/tiers.js';

const STYLE_ID = 'tfg-daily-fx-style';
const CSS = `
.dy-rv{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(6,4,2,.9),rgba(0,0,0,.97));color:#ffe9cf;font-family:var(--font,'VT323',monospace);pointer-events:auto;animation:dyrvIn .3s ease-out both;user-select:none}
.dy-rv.out{animation:dyrvOut .35s ease-in both}
@keyframes dyrvIn{from{opacity:0}to{opacity:1}}
@keyframes dyrvOut{to{opacity:0}}
.dy-rays{position:absolute;left:50%;top:50%;width:170vmax;height:170vmax;margin:-85vmax 0 0 -85vmax;opacity:0;pointer-events:none;
 background:repeating-conic-gradient(from 0deg,var(--tc,#ffb04a) 0 5deg,transparent 5deg 15deg);-webkit-mask-image:radial-gradient(circle,#000 0,transparent 32%);mask-image:radial-gradient(circle,#000 0,transparent 32%);animation:dySpin 22s linear infinite}
.dy-rv.win .dy-rays{opacity:.5;transition:opacity .8s}
@keyframes dySpin{to{transform:rotate(360deg)}}
.dy-stage{position:relative;width:min(900px,94vw);min-height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.dy-crate{position:relative;width:170px;height:130px;margin-top:20px;transition:transform .5s,opacity .5s}
.dy-crate .cb{position:absolute;left:0;right:0;bottom:0;height:88px;background:linear-gradient(180deg,#5a3a1c,#3a2410);border:3px solid var(--tc,#ffb04a);box-shadow:0 0 28px var(--tcg,rgba(255,176,74,.45)),inset 0 0 18px rgba(0,0,0,.6)}
.dy-crate .cb::before{content:'';position:absolute;left:46%;top:-3px;bottom:-3px;width:10%;background:var(--tc,#ffb04a);opacity:.85}
.dy-crate .cl{position:absolute;left:-6px;right:-6px;bottom:84px;height:34px;background:linear-gradient(180deg,#6b4522,#4a2e14);border:3px solid var(--tc,#ffb04a);transform-origin:left bottom;transition:transform .45s cubic-bezier(.2,1.6,.4,1)}
.dy-crate.shake{animation:dyShake .12s linear 8}
.dy-crate.open .cl{transform:rotate(-58deg) translateY(-6px)}
.dy-crate.open .cb{box-shadow:0 0 60px var(--tc,#ffb04a),inset 0 -30px 40px var(--tc,#ffb04a)}
.dy-crate.gone{transform:translateY(-30px) scale(.55);opacity:0}
@keyframes dyShake{0%{transform:translate(0,0) rotate(0)}25%{transform:translate(-4px,1px) rotate(-2deg)}50%{transform:translate(3px,-2px) rotate(2deg)}75%{transform:translate(-2px,2px) rotate(-1deg)}100%{transform:translate(0,0)}}
.dy-name{font-family:var(--font2,monospace);font-size:15px;letter-spacing:3px;color:var(--tc,#ffb04a);text-shadow:0 0 12px var(--tcg,rgba(255,176,74,.5))}
.dy-reel{position:relative;width:100%;height:158px;overflow:hidden;border-top:2px solid rgba(255,190,120,.4);border-bottom:2px solid rgba(255,190,120,.4);background:rgba(0,0,0,.5);opacity:0;transition:opacity .4s}
.dy-reel.on{opacity:1}
.dy-reel::before,.dy-reel::after{content:'';position:absolute;top:0;bottom:0;width:22%;z-index:2;pointer-events:none}
.dy-reel::before{left:0;background:linear-gradient(90deg,#000,transparent)}
.dy-reel::after{right:0;background:linear-gradient(270deg,#000,transparent)}
.dy-strip{position:absolute;left:0;top:12px;display:flex;gap:10px;will-change:transform}
.dy-card{--c:#9aa39a;flex:0 0 130px;height:134px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:6px;
 background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.4)),#100a06;border:2px solid var(--c);box-shadow:inset 0 -26px 26px -20px var(--c)}
.dy-card .ct{font-size:22px;line-height:1.05;color:#fff2de;word-break:break-word}
.dy-card .cs{font-size:15px;opacity:.7;margin-top:4px}
.dy-card.win{animation:dyWin .9s ease-out both;z-index:3}
@keyframes dyWin{0%{transform:scale(1)}40%{transform:scale(1.16);box-shadow:0 0 50px var(--c),inset 0 -26px 26px -12px var(--c)}100%{transform:scale(1.1);box-shadow:0 0 34px var(--c),inset 0 -26px 26px -12px var(--c)}}
.dy-mark{position:absolute;left:50%;top:0;bottom:0;width:3px;margin-left:-1px;background:#ffd23f;box-shadow:0 0 12px #ffd23f;z-index:4;opacity:.9}
.dy-res{display:flex;flex-direction:column;align-items:center;gap:6px;opacity:0;transform:translateY(14px);transition:opacity .5s,transform .5s;text-align:center;min-height:130px}
.dy-res.on{opacity:1;transform:none}
.dy-res .k{font-family:var(--font2,monospace);font-size:13px;letter-spacing:4px;color:var(--tc)}
.dy-res .big{font-size:46px;line-height:1.05;color:#fff;text-shadow:0 0 22px var(--tc),3px 3px 0 #000;max-width:92vw}
.dy-res .sub{font-size:24px;color:var(--tc)}
.dy-res .btn{margin-top:8px}
.dy-hint{font-size:16px;opacity:.55;letter-spacing:1px}
.dy-p{position:absolute;left:50%;top:50%;width:8px;height:8px;background:var(--tc);pointer-events:none;animation:dyP .95s ease-out both;z-index:5}
@keyframes dyP{from{transform:translate(0,0) rotate(0);opacity:1}to{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}
.dy-flash{position:fixed;inset:0;z-index:96;pointer-events:none;background:radial-gradient(circle,var(--tc,#fff) 0,transparent 70%);animation:dyFlash .7s ease-out both}
@keyframes dyFlash{0%{opacity:.85}100%{opacity:0}}
.dy-rv.reduce .dy-crate,.dy-rv.reduce .dy-reel{display:none}
/* level-up */
.dy-lv{position:fixed;left:0;right:0;top:24%;height:0;z-index:40;pointer-events:none;display:flex;justify-content:center}
.dy-ring{position:absolute;top:-70px;width:140px;height:140px;border-radius:50%;border:3px solid var(--tc,#ffd23f);box-shadow:0 0 30px var(--tc,#ffd23f),inset 0 0 20px var(--tc,#ffd23f);opacity:0;animation:dyRing 1.6s ease-out both}
.dy-ring.r2{animation-delay:.18s}
@keyframes dyRing{0%{transform:scale(.2);opacity:.95}100%{transform:scale(5.2);opacity:0}}
.dy-pill{position:absolute;top:96px;padding:5px 18px;border:2px solid var(--tc,#ffd23f);background:rgba(20,12,3,.9);color:#fff2c4;font-size:26px;letter-spacing:1px;text-shadow:0 0 8px var(--tc,#ffd23f);box-shadow:0 0 22px var(--tcg,rgba(255,210,63,.45));animation:dyPill 3.2s both;white-space:nowrap}
.dy-pill b{color:var(--tc,#ffd23f);font-family:var(--font2,monospace);font-size:15px;letter-spacing:3px;margin-right:10px;animation:dyBlink .5s steps(2) 6}
@keyframes dyPill{0%{opacity:0;transform:translateY(-12px) scale(.9)}12%{opacity:1;transform:none}82%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
@keyframes dyBlink{50%{opacity:.25}}
.dy-conf{position:fixed;top:-12px;width:9px;height:14px;z-index:41;pointer-events:none;animation:dyConf linear both}
@keyframes dyConf{to{transform:translate(var(--dx),108vh) rotate(var(--r))}}
.dy-edge{position:fixed;inset:0;z-index:39;pointer-events:none;box-shadow:inset 0 0 90px 10px var(--tc,#ffd23f);opacity:0;animation:dyEdge 1.8s ease-out both}
@keyframes dyEdge{0%{opacity:0}18%{opacity:.6}100%{opacity:0}}
.reduce-motion .dy-ring,.reduce-motion .dy-conf,.reduce-motion .dy-edge{display:none}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
}
const tierGlow = (hex) => { const h = hex.replace('#', ''); const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},.55)`; };
const rnd = (a, b) => a + Math.random() * (b - a);
const KIND_COLOR = { supply: '#ffb04a', cosmetic: '#b35cff', weekly: '#3d8bff', season: '#ff9a1f', quota: '#ffd23f' };

function burst(host, color, count) {
  for (let i = 0; i < count; i++) {
    const p = el('i', { class: 'dy-p' });
    const a = Math.random() * Math.PI * 2, d = rnd(90, 320);
    p.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${rnd(-540, 540)}deg;--tc:${color};animation-delay:${Math.random() * 0.12}s;width:${rnd(5, 11)}px;height:${rnd(5, 11)}px`;
    host.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
}

/** Sound for a landed reward by tier. */
function landSfx(sfx, tier) {
  const i = TIER_ORDER.indexOf(tier);
  if (i <= 0) sfx('coins', 0.6);
  else if (i === 1) { sfx('item_pickup', 0.6); sfx('ui_buy', 0.5); }
  else if (i === 2) sfx('slot_win', 0.7);
  else if (i === 3) { sfx('level_up_jingle', 0.7); sfx('slot_win', 0.4); }
  else { sfx('slot_jackpot', 0.75); sfx('level_up_jingle', 0.6); }
}

/**
 * Play the crate opening. opts: { root, crate: { kind, tier?, seed }, name, cards (filler reel cards), view ({ title, sub, tier, color, kicker }),
 *   sfx(name, vol, pitch), reduce, onDone }. The reward is already applied by the caller; this is only the show.
 * Returns { skip(), close() }.
 */
export function playCrateReveal(opts) {
  ensureStyle();
  const { root = document.body, view, cards = [], sfx = () => {}, reduce = false, onDone } = opts;
  const kindColor = opts.color || KIND_COLOR[opts.crate?.kind] || '#ffb04a';
  const tc = view.color || TIERS[view.tier]?.color || '#ffb04a';
  const rv = el('div', { class: 'dy-rv' + (reduce ? ' reduce' : '') });
  rv.style.setProperty('--tc', kindColor); rv.style.setProperty('--tcg', tierGlow(kindColor));
  const rays = el('div', { class: 'dy-rays' });
  const stage = el('div', { class: 'dy-stage' });
  const name = el('div', { class: 'dy-name' }, (opts.name || '').toUpperCase());
  const crate = el('div', { class: 'dy-crate' }, el('div', { class: 'cb' }), el('div', { class: 'cl' }));
  const WIN_AT = Math.max(20, cards.length - 6);
  const all = cards.slice(0, WIN_AT).concat([{ tier: view.tier, title: view.title, sub: view.sub, win: true }], cards.slice(WIN_AT + 1, WIN_AT + 8));
  while (all.length < WIN_AT + 8) all.push(cards[all.length % Math.max(1, cards.length)] || { tier: 'common', title: '?', sub: '' });
  const strip = el('div', { class: 'dy-strip' }, ...all.map((c) => {
    const col = TIERS[c.tier]?.color || '#9aa39a';
    const n = el('div', { class: 'dy-card' }, el('div', { class: 'ct' }, c.title || ''), el('div', { class: 'cs' }, c.sub || ''));
    n.style.setProperty('--c', c.win ? tc : col);
    return n;
  }));
  const reel = el('div', { class: 'dy-reel' }, strip, el('div', { class: 'dy-mark' }));
  const res = el('div', { class: 'dy-res' },
    el('div', { class: 'k' }, view.kicker || ''),
    el('div', { class: 'big' }, view.title),
    el('div', { class: 'sub' }, view.sub || ''));
  res.style.setProperty('--tc', tc);
  const done = el('button', { class: 'btn primary big', type: 'button' }, t('COLLECT'));
  res.appendChild(done);
  const hint = el('div', { class: 'dy-hint' }, t('Click or press Space to skip'));
  stage.append(name, crate, reel, res, hint);
  rv.append(rays, stage);
  root.appendChild(rv);

  let finished = false, closed = false, raf = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const close = () => {
    if (closed) return; closed = true;
    cancelAnimationFrame(raf); for (const id of timers) clearTimeout(id);
    window.removeEventListener('keydown', onKey, true);
    rv.classList.add('out');
    setTimeout(() => { rv.remove(); onDone?.(); }, 330);
  };
  const land = () => {
    if (finished) return; finished = true;
    cancelAnimationFrame(raf);
    rv.style.setProperty('--tc', tc); rv.style.setProperty('--tcg', tierGlow(tc));
    rv.classList.add('win');
    strip.children[WIN_AT]?.classList.add('win');
    hint.textContent = '';
    if (!reduce) { burst(stage, tc, 14 + TIER_ORDER.indexOf(view.tier) * 10); if (TIER_ORDER.indexOf(view.tier) >= 3) { const f = el('div', { class: 'dy-flash' }); f.style.setProperty('--tc', tc); rv.appendChild(f); setTimeout(() => f.remove(), 800); } }
    landSfx(sfx, view.tier);
    later(() => { res.classList.add('on'); done.focus?.({ preventScroll: true }); }, reduce ? 0 : 450);
  };
  const onKey = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (!finished) skip(); else close();
  };
  const STEP = 140, CW = 130;
  let endX = 0;
  const layoutEnd = () => {
    crate.classList.add('gone'); reel.classList.add('on');
    const W = reel.clientWidth || 800;
    endX = WIN_AT * STEP + CW / 2 + rnd(-0.28, 0.28) * CW - W / 2;
    return W;
  };
  const skip = () => { if (finished) return; if (!endX) layoutEnd(); strip.style.transform = `translateX(${-endX}px)`; land(); };
  window.addEventListener('keydown', onKey, true);
  rv.addEventListener('pointerdown', (e) => { if (e.target === done) return; if (!finished) skip(); });
  done.addEventListener('click', (e) => { e.stopPropagation(); close(); });

  if (reduce) { crate.remove(); reel.remove(); hint.remove(); land(); return { skip, close }; }

  // ---- timeline
  sfx('ui_confirm', 0.6);
  crate.classList.add('shake');
  later(() => { crate.classList.remove('shake'); crate.classList.add('open'); sfx('vault_open', 0.6); burst(stage, kindColor, 12); }, 1000);
  later(() => {
    if (finished) return;
    const W = layoutEnd();
    const step = STEP;
    const DUR = 4800, t0 = performance.now();
    let lastIdx = -1;
    const ease = (u) => 1 - Math.pow(1 - u, 4);
    const frame = (now) => {
      if (finished || closed) return;
      const u = Math.min(1, (now - t0) / DUR);
      const x = endX * ease(u);
      strip.style.transform = `translateX(${-x}px)`;
      const idx = Math.floor((x + W / 2) / step);
      if (idx !== lastIdx) { lastIdx = idx; sfx('ui_hover', 0.22, 0.85 + 0.55 * (1 - u)); }
      if (u < 1) raf = requestAnimationFrame(frame); else later(land, 250);
    };
    raf = requestAnimationFrame(frame);
  }, 1500);
  return { skip, close };
}

/** Level-up fanfare: rings + edge glow + a "NEW!" pill (the HUD already prints the big LEVEL UP text; this sits under it). */
export function levelUpFanfare({ root = document.body, level, lines = [], color = '#ffd23f', sfx = () => {}, reduce = false }) {
  ensureStyle();
  const host = el('div', { class: 'dy-lv' });
  host.style.setProperty('--tc', color); host.style.setProperty('--tcg', tierGlow(color));
  if (!reduce) host.append(el('div', { class: 'dy-ring' }), el('div', { class: 'dy-ring r2' }));
  const pillsText = lines.length ? lines : [];
  pillsText.slice(0, 2).forEach((txt, i) => {
    const p = el('div', { class: 'dy-pill' }, el('b', {}, t('NEW!')), txt);
    p.style.top = (96 + i * 46) + 'px'; p.style.animationDelay = (0.25 + i * 0.35) + 's';
    host.appendChild(p);
  });
  root.appendChild(host);
  if (!reduce) {
    const edge = el('div', { class: 'dy-edge' }); edge.style.setProperty('--tc', color); root.appendChild(edge);
    setTimeout(() => edge.remove(), 1900);
    confetti(root, [color, '#fff2c4', '#ff8a3d'], 26, 2.4);
  }
  sfx('level_up_jingle', 0.55);
  setTimeout(() => host.remove(), 4200);
  void level;
}

/** Falling confetti pieces (DOM). */
export function confetti(root, colors, count = 40, dur = 2.6) {
  ensureStyle();
  for (let i = 0; i < count; i++) {
    const c = el('i', { class: 'dy-conf' });
    c.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};--dx:${(Math.random() - 0.5) * 220}px;--r:${rnd(-720, 720)}deg;animation-duration:${dur + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.6}s`;
    root.appendChild(c);
    setTimeout(() => c.remove(), (dur + 2.4) * 1000);
  }
}

/** Gold celebration (quota crate): edge glow + confetti + one big pill. */
export function celebrate({ root = document.body, text, sub = '', color = '#ffd23f', sfx = () => {}, reduce = false }) {
  ensureStyle();
  const host = el('div', { class: 'dy-lv' });
  host.style.setProperty('--tc', color); host.style.setProperty('--tcg', tierGlow(color));
  const p = el('div', { class: 'dy-pill' }, el('b', {}, sub || t('NEW!')), text);
  p.style.top = '40px';
  host.appendChild(p);
  root.appendChild(host);
  if (!reduce) {
    const edge = el('div', { class: 'dy-edge' }); edge.style.setProperty('--tc', color); root.appendChild(edge);
    setTimeout(() => edge.remove(), 1900);
    confetti(root, [color, '#ffffff', '#ff5a8a', '#3dd6ff'], 46, 2.8);
  }
  sfx('quota_jingle', 0.5);
  setTimeout(() => host.remove(), 4200);
}
