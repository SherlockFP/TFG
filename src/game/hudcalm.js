// HUDCALM (wave 8 "declutter", docs/wave8/declutter.md). Installed with `this.useModule('hudcalm', installHudCalm)`.
// The in-run HUD had grown to ~20 always-on widgets. Density (Settings > HUD, `settings.hudDensity`, html[data-hud]):
//   full      everything stays on screen, exactly like before (only the layout manager in ui/docklayout.js still de-collides it)
//   standard  (default) SIX always-on areas [hud6]: health/stamina, hotbar, compass + clock, the ONE objective line, threat/noise (only above CALM / when loud),
//             crosshair + interact prompt. ONE currency (credits) on the HUD. Weight only above 30 lb, ability bar only on cooldown, mana only when spent. Every other widget is
//             CONTEXTUAL: it shows when its content changes, fades after FLASH_S seconds, and is always reachable with HOLD TAB
//   minimal   same, 1 objective line, shorter flashes, and the widgets marked `min:'hide'` only exist in the Tab card
// Contextual = the widget's own module is untouched; this file only toggles class `.hc-off` on its dock item / HUD block.
import { t, tf } from '../core/i18n.js';
import { escapeHtml } from '../core/util.js';
import { MOONS } from './moons.js';
import { hudDensityOf } from '../ui/hudcalm_ui.js';
import { walletRowOf } from './wallet.js';
import { followerCard } from './followers.js';

const FLASH_S = { standard: 6, minimal: 3 };
// dock item id -> rule.  f: shown for FLASH_S s after each change of its text (digits ignored, so ticking timers do not re-trigger)
// c: CSS selector inside the item that must match for it to be visible (hunger only when hungry...); min:'hide' = Tab card only in Minimal
const DOCK_RULES = {
  daily: { f: 1, min: 'hide' }, a2feed: { f: 1, min: 'hide' }, 'tfg-inv-feed': { f: 1 }, buffs: { f: 1 }, static: { f: 1 },
  'social-phone': { f: 1, min: 'hide' }, story: { f: 1, min: 'hide' }, roledays: { f: 1, min: 'hide' }, rdmap: { f: 1, min: 'hide' },
  's2-hull': { f: 1 }, facility: { f: 1 }, w2clock: { f: 1, min: 'hide' }, roleskills: { fn: 'cd' }, mana: { fn: 'mana' }, h2: { f: 1, min: 'hide' },
  h2g: { f: 1, min: 'hide' }, contract: { f: 1, min: 'hide' },
  survival: { c: '.svh.low, .svh.cold' },
  stealth: { fn: 'noise' },
  threat: { c: '.tfg-threat.up' },   // [hud6] Standard + Minimal: THREAT only above CALM
};
// plain HUD blocks (selector inside .hud). digits:1 = numbers count as change (coins, quota)
const HUD_RULES = [
  { sel: '.hud-tr', f: 1, digits: 1, strip: 1, min: 'hide' },   // strip: the transient "· ◈ clout" tail is not a change (the clout flash itself keeps the block up)
  { sel: '.hud-chips', f: 1, min: 'hide' },
  { sel: '.hud-quota', f: 1, digits: 1, phases: ['orbit', 'company'] },
  { sel: '.hud-weight', fn: 'weight' },                       // [hud6] only when heavy (> 30 lb)
  { sel: '.tfg-asg', f: 1, digits: 1 },                      // [hud6] the ASSIGNMENT card: on change + on Tab
];
const HEAVY_LB = 30;

const CSS = `
html:not([data-hud="full"]) .hc-off{animation:hcOut .6s ease-in forwards;overflow:hidden;pointer-events:none}
.hc-in{animation:hcIn .3s ease-out}
@keyframes hcOut{0%{opacity:1;max-height:700px}90%{opacity:0;max-height:700px}100%{opacity:0;max-height:0;margin:0;padding:0}}
@keyframes hcIn{from{opacity:0}to{opacity:1}}
html[data-hud="minimal"] .hud-weight{display:none}
html[data-hud="standard"] .tfg-noise .nz-head,html[data-hud="standard"] .tfg-noise .nz-foot,html[data-hud="minimal"] .tfg-noise .nz-head,html[data-hud="minimal"] .tfg-noise .nz-foot{display:none}
html:not([data-hud="full"]) .tfg-noise .nz-bar{height:4px;margin-top:-2px}
html:not([data-hud="full"]) .tfg-threat .tt-foot{display:none}
.hc-tab{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:17;width:min(900px,92vw);max-height:78vh;overflow:hidden;pointer-events:none;
  display:none;grid-template-columns:1fr 1fr;gap:14px 26px;padding:16px 20px 12px;background:rgba(10,7,4,.9);border:1px solid var(--t-line-hi,#6b4a2a);
  border-top:4px solid var(--amber,#ffb15a);color:var(--text,#f2d8b0);font-family:var(--font,'VT323',monospace);font-size:20px;line-height:1.15;box-shadow:6px 6px 0 rgba(0,0,0,.55)}
.hc-tab.on{display:grid}
.hc-tab h4{margin:0 0 6px;font:700 15px/1 var(--font2,'VT323',monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--amber,#ffb15a)}
.hc-tab .hc-head{grid-column:1/-1;display:flex;justify-content:space-between;font-family:var(--font2,'VT323',monospace);font-weight:700;font-size:16px;letter-spacing:.12em;text-transform:uppercase;color:#fff3e6}
.hc-tab .hc-head i{font-style:normal;color:var(--amber-dim,#a8722f);font-size:14px}
.hc-tab .hc-o{margin-bottom:3px}.hc-tab .hc-o.warn{color:#ff6a5a}.hc-tab .hc-o.main{color:#fff}.hc-tab .hc-o.hint{opacity:.65}.hc-tab .hc-o.done{color:var(--good,#7dff9a);opacity:.8}
.hc-tab .hc-r{display:flex;justify-content:space-between;gap:12px}.hc-tab .hc-r b{font-weight:400;color:#fff3e6}
.hc-tab .hc-cell{margin-bottom:8px;max-width:340px}.hc-tab .hc-cell .hud-dock-item{display:block}
.hc-tab .hc-cell svg{width:1.1em;height:1.1em;vertical-align:-.15em}   /* [hud6] copied dock glyphs lost their sizing rule (a giant bolt in the card) */
.hc-tab .fh-s{display:flex;align-items:center;gap:6px;line-height:1.3}.hc-tab .fh-s .dim{color:#8a7a6a}.hc-tab .fh-s b{font-weight:400}.hc-tab .fh-t{display:flex;gap:10px;align-items:baseline}.hc-tab .fh-t i{font-style:normal;color:var(--amber-dim,#a8722f)}   /* [qa2] copied facility rows lost their flex + gap (POWERLOW, STATUSDATA CORE) */
:root.hc-tab-on .objectives,:root.hc-tab-on .hud-tl{opacity:0}   /* [qa2] the left goal text bled through the card */
.hc-tab .hc-dead{opacity:.55}
.hc-tab .hc-none{opacity:.55}
@media (max-height:760px){.hc-tab{font-size:18px;gap:10px 22px;padding:12px 16px 8px}}
@media (max-width:760px){.hc-tab{grid-template-columns:1fr}}
`;

export function installHudCalm(game) {
  if (typeof document === 'undefined') return { dispose() {} };
  const offs = [];
  const st = document.createElement('style'); st.id = 'tfg-hudcalm-css'; st.textContent = CSS; document.head.appendChild(st);
  const seen = new WeakMap();   // element -> { sig, until }
  const now = () => performance.now() / 1000;
  const dens = () => hudDensityOf(game.settings);
  let acc = 0, tabAcc = 0, tabOn = false;

  // ------------------------------------------------------------------ contextual show / fade
  function setOff(el, off) {
    const was = el.classList.contains('hc-off');
    if (off === was) return;
    el.classList.toggle('hc-off', off);
    if (!off) { el.classList.add('hc-in'); setTimeout(() => el.classList.remove('hc-in'), 350); }
  }
  const sigOf = (el, digits, strip) => {
    let tx = (el.textContent || '').trim();
    if (strip) tx = tx.replace(/\s*·\s*◈.*$/, '');
    const s = digits ? tx : tx.replace(/[\d:.,%]+/g, '');
    return s || (el.querySelector('canvas') ? 'canvas' : '');
  };
  function decide(el, rule, d, tnow) {
    if (d === 'full') return true;
    if (rule.min === 'hide' && d === 'minimal') return false;
    if (rule.c) return !!el.querySelector(rule.c);
    if (rule.minC && d === 'minimal') return !!el.querySelector(rule.minC);
    if (rule.fn === 'weight') return (parseFloat((el.textContent || '').replace(/[^\d.]/g, '')) || 0) >= HEAVY_LB;
    if (rule.fn === 'cd' || rule.fn === 'mana') {   // [hud6] ability bar: only while a skill is on cooldown; mana: only while spent / a spell cools down. Lingers FLASH_S after
      let on = [...el.querySelectorAll('.rs-c i, .mg-cd')].some((c) => parseFloat(c.style.getPropertyValue('--cd')) > 0);
      if (rule.fn === 'mana' && !on) { const f = el.querySelector('.mg-fill'); on = !!f && f.offsetParent !== null && parseFloat(f.style.width || '100') < 99; }
      let s = seen.get(el); if (!s) { s = { sig: '', until: 0 }; seen.set(el, s); }
      if (on) s.until = tnow + FLASH_S[d];
      return tnow < s.until;
    }
    if (rule.fn === 'noise') { const p = game.player; return !!p && (p.noise || 0) > (d === 'minimal' ? 0.6 : 0.35); }
    if (!rule.f) return true;
    let s = seen.get(el);
    const sig = sigOf(el, rule.digits, rule.strip);
    if (!s) { s = { sig: '', until: 0 }; seen.set(el, s); }
    if (sig !== s.sig) { s.sig = sig; if (sig) s.until = tnow + FLASH_S[d]; }
    return !!sig && tnow < s.until;
  }
  function pass() {
    const d = dens();
    if (document.documentElement.dataset.hud !== d) { document.documentElement.dataset.hud = d; try { game.ui?.hud?.setCoins?.(game.ui.hud.coinsVal ?? 0); } catch { /* hud not ready */ } }
    const tnow = now();
    for (const el of document.querySelectorAll('.hud-dock-item')) {
      const rule = DOCK_RULES[el.dataset.dockId];
      if (!rule) { if (el.classList.contains('hc-off')) setOff(el, false); continue; }
      setOff(el, !decide(el, rule, d, tnow));
    }
    const hud = game.ui?.hud, phase = game.run?.phase;
    if (hud?.el) for (const r of HUD_RULES) {
      const el = hud.el.querySelector(r.sel);
      if (!el) continue;
      const keep = r.phases?.includes(phase) || (r.strip && performance.now() < (hud.cloutUntil || 0));
      setOff(el, !(keep || decide(el, r, d, tnow)));
    }
  }

  // ------------------------------------------------------------------ hold Tab: full status
  const card = document.createElement('div');
  card.className = 'hc-tab';
  (document.getElementById('ui') || document.body).appendChild(card);
  const keyCode = () => game.input?.key?.('menu') || 'Tab';
  const canShow = () => !!game.run && !game.ui?.blocksInput?.() && !game.terminal?.active && !game.minigame && !game.ui?.hud?.el?.classList.contains('hidden') && !game.input?.isTyping?.();

  function render() {
    const run = game.run || {}, p = game.player, hud = game.ui?.hud?.el;
    const txt = (s) => hud?.querySelector(s)?.textContent?.trim() || '';
    const fc = followerCard(game.profile);
    const keyName = keyCode().replace(/^Key/, '').replace(/^Digit/, '');
    const moon = MOONS[run.moon]?.name || run.moon || '';
    const objs = (game.objectives?.full || []).map((o) => `<div class="hc-o ${o.kind}${o.done ? ' done' : ''}">${o.done ? '✔' : o.kind === 'warn' ? '!' : '◆'} ${escapeHtml(o.text)}</div>`).join('');
    const rows = [
      [tf('Day {n}', { n: run.day ?? 1 }), escapeHtml(moon)],
      [t('QUOTA'), `▮${run.sold || 0} / ▮${run.quota || 0}`],
      [t('Days left'), String(run.daysLeft ?? '')],
      [t('Clock'), txt('.clock-time')],
      [`${txt('.lvl')} ${txt('.rank')}`, walletRowOf(game)],   // [hud6] the Tab card is where the wallet (credits + followers) lives
      ...(fc.next ? [[t('Followers'), `◈ ${fc.followers}`], [t('Next milestone'), escapeHtml(`${fc.next.name ? t(fc.next.name) + ' · ' : ''}${fc.next.at}`)]] : [[t('Followers'), `◈ ${fc.followers}`]]),   // [followers] channel size + the closest unlock
      [t('Weight'), txt('.hud-weight')],
    ].filter((r) => r[1] || r[0].trim());
    const crew = [`<div class="hc-r"><span>${escapeHtml(game.playerName?.(game.selfId) || '')} (${t('you')})</span><b>${p ? Math.round(p.hp || 0) + '/' + Math.round(p.maxHp || 100) : ''}</b></div>`];
    for (const r of game.remotes?.values?.() || []) crew.push(`<div class="hc-r${r.dead ? ' hc-dead' : ''}"><span>${escapeHtml(r.name || '?')}</span><b>${r.dead ? t('dead') : ''}</b></div>`);
    const cells = [];
    for (const el of document.querySelectorAll('.hud-dock-item')) {
      const id = el.dataset.dockId;
      if (!DOCK_RULES[id] || !sigOf(el, 1) || el.querySelector('canvas') || el.querySelector('.off')) continue;
      cells.push(`<div class="hc-cell">${el.innerHTML}</div>`);
    }
    card.innerHTML = `<div class="hc-head"><span>${t('FULL STATUS')}</span><i>${escapeHtml(tf('hold {key} for the full status', { key: keyName }))}</i></div>
      <div><h4>${t('OBJECTIVES')}</h4>${objs || `<div class="hc-none">${t('Nothing else to report.')}</div>`}<h4 style="margin-top:12px">${t('CREW')}</h4>${crew.join('')}</div>
      <div><h4>${t('RUN')}</h4>${rows.map(([a, b]) => `<div class="hc-r"><span>${escapeHtml(a)}</span><b>${b}</b></div>`).join('')}
      <h4 style="margin-top:12px">${t('STATUS')}</h4>${cells.join('') || `<div class="hc-none">${t('Nothing else to report.')}</div>`}</div>`;
  }
  const showTab = (v) => { if (v === tabOn) return; tabOn = v; if (v) render(); card.classList.toggle('on', v); document.documentElement.classList.toggle('hc-tab-on', !!v); };
  const onDown = (e) => {
    if (e.code !== keyCode() || e.repeat) return;
    if (canShow()) { e.preventDefault(); showTab(true); }
  };
  const onUp = (e) => { if (e.code === keyCode()) showTab(false); };
  const onBlur = () => showTab(false);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  offs.push(game.mods.on('update', (dt, g) => {
    if (g && g !== game) return;
    acc += dt; tabAcc += dt;
    if (acc >= 0.3) { acc = 0; try { pass(); } catch (e) { console.warn('hudcalm', e); } }
    if (tabOn) { if (!canShow()) showTab(false); else if (tabAcc >= 0.4) { tabAcc = 0; render(); } }
  }));

  return {
    density: dens,
    showTab,
    /** for tests / harness: run the contextual pass now */
    pass,
    dispose() {
      for (const f of offs) { try { f(); } catch { /* ignore */ } }
      window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur);
      card.remove(); st.remove();
    },
  };
}
