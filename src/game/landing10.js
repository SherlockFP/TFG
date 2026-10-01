// LANDING10 (wave 10, docs/wave10/landing10.md). Installed with `this.useModule('landing10', installLanding10)`.
// The landing moment used to be a pile-up: case card + moon title + Algorithm line drawn on top of each other, 6-8 `sys` lines in the chat log and 2-3 toasts.
// Now ONE sequence (rules in landing10_core.js): 1) descent briefing card / moon title card (soul.js, skippable)  2) ONE compact CREW BRIEFING panel with every
// `sys` line of the landing merged (max 5 lines, dismisses itself; the rest stays readable in the chat log)  3) the normal HUD.
// Hooks (small, in existing files): ui.js systemMessage -> ui.landHook.capture, ui.js fullscreenOpen -> ui.landHook.hold (toasts / big text / Algorithm box wait),
// ui.js clearCinematics also removes the case card wrapper (.lcase-cine), docklayout TOP_BANNERS stacks .l10-brief.
// Net: none. Every peer runs its own sequencer off the same `sys` broadcasts and the run phase (host and clients identical).
import { routineAttentionBusy, toastUrgent } from '../ui/hud_attention.js';
import { t, tf, addTranslations } from '../core/i18n.js';
import { LandingSeq } from './landing10_core.js';

addTranslations({ 'CREW BRIEFING': 'EKİP BRİFİNGİ', '+{n} more in the chat log': '+{n} satır daha sohbet kaydında' }, 'tr');
addTranslations({ 'CREW BRIEFING': 'БРИФИНГ ЭКИПАЖА', '+{n} more in the chat log': 'ещё {n} в журнале чата' }, 'ru');

const CSS = `.l10-brief{position:fixed;left:50%;top:96px;transform:translate(-50%,-8px);width:min(560px,92vw);z-index:7;pointer-events:none;opacity:0;transition:opacity .45s,transform .45s;
 background:rgba(10,7,4,.88);border:1px solid var(--amber-dim,#8a5a20);border-left:4px solid var(--amber,#f2a230);padding:9px 14px 8px;font-family:var(--cond,'Barlow Condensed','Arial Narrow',sans-serif);color:#ece4cf;text-shadow:none}
.l10-brief.on{opacity:1;transform:translate(-50%,0)}
.l10-brief .k{display:flex;justify-content:space-between;font:11px/1.2 var(--font2,monospace);letter-spacing:2px;color:var(--amber,#f2a230);margin-bottom:5px}
.l10-brief ul{list-style:none;margin:0;padding:0}
.l10-brief li{position:relative;padding:1px 0 1px 15px;font-size:19px;line-height:1.14;color:#e6dccb;overflow-wrap:anywhere}
.l10-brief li::before{content:'';position:absolute;left:1px;top:.5em;width:6px;height:6px;background:var(--amber-dim,#8a5a20)}
.l10-brief li.warn::before{background:#ffb347}.l10-brief li.bad{color:#ffb0a0}.l10-brief li.bad::before{background:#ff4a3a}.l10-brief li.good::before{background:#7dffa0}
.l10-brief .m{margin-top:4px;font-size:14px;letter-spacing:.06em;color:#8a8474}
@media (max-width:640px){.l10-brief li{font-size:17px}}`;

export function installLanding10(game) {
  const seq = new LandingSeq();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const offs = [];
  const LAND = new Set(['landing', 'moon', 'company']);
  let el = null, st = null, hideT = 0, busyAt = -1, busyVal = false, disposed = false;

  const ui = () => game.ui;
  function ensure() {
    if (typeof document === 'undefined') return null;
    if (!st) { st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
    if (!el || !el.isConnected) {
      el = document.createElement('div'); el.className = 'l10-brief';
      (document.getElementById('ui') || document.body).appendChild(el);
    }
    return el;
  }
  function render(v) {
    const box = ensure();
    if (!box) return;
    box.textContent = '';
    const k = document.createElement('div'); k.className = 'k';
    const a = document.createElement('span'); a.textContent = t('CREW BRIEFING');
    const b = document.createElement('span'); b.textContent = `${t('Day')} ${game.run?.day ?? 1}`;
    k.append(a, b);
    const ul = document.createElement('ul');
    for (const l of v.lines) { const li = document.createElement('li'); li.className = l.kind || ''; li.textContent = l.text; ul.appendChild(li); }
    box.append(k, ul);
    if (v.dropped > 0) { const m = document.createElement('div'); m.className = 'm'; m.textContent = tf('+{n} more in the chat log', { n: v.dropped }); box.appendChild(m); }
  }
  function hide() {
    if (!el) return;
    el.classList.remove('on');
    clearTimeout(hideT);
    hideT = setTimeout(() => { el?.remove(); el = null; }, 600);
  }

  /** ui.systemMessage hook: true = merged into the briefing (the line goes to the chat history silently, no toast) */
  function capture(text, kind) {
    if (disposed || game.player?.dead || (routineAttentionBusy(game) && toastUrgent(kind))) return false;
    if (!seq.add(text, kind, now())) return false;
    const u = ui();
    try { u?.chatMessage?.(null, text, false, kind); u?.chatLog?.lastElementChild?.classList.add('old'); } catch { /* chat optional */ }   // nothing is lost: readable in the chat log
    return true;
  }
  const hold = () => !disposed && !routineAttentionBusy(game) && seq.holding();

  /** is another centre card up (or reserved)? the panel waits for the title card, a report or the case card */
  function centerBusy() {
    const t0 = now();
    if (t0 - busyAt < 250) return busyVal;
    busyAt = t0;
    let b = !!ui()?.cineActive;
    try { if (!b && typeof document !== 'undefined') b = !!document.querySelector('.sl-card.on, .lcase-cine, .report, .fired, .quotamet, .hud-brief:not(.hidden):not(.out), .hud-big:not(.hidden)'); } catch { /* ignore */ }
    try { if (!b && (game.onboard?.fr?.busy?.() || 0) > 0) b = true; } catch { /* ignore */ }
    return (busyVal = b);
  }

  const keyOf = (r) => `${r?.seed}|${r?.day}|${r?.moon}`;
  offs.push(game.mods.on('update', (dt, g) => {
    if (disposed || (g && g !== game)) return;
    const run = game.run, phase = run?.phase, n = now();
    if (phase === 'landing' && seq.key !== keyOf(run)) { if (seq.begin(keyOf(run), n)) { try { ui()?.clearCinematics?.(); } catch { /* ignore */ } } }
    else if (!LAND.has(phase) && seq.stage === 'done') { seq.stage = 'idle'; seq.key = null; }   // takeoff / orbit: the next landing starts fresh
    if (!seq.holding()) return;
    const ev = seq.tick(n, { phase, centerBusy: seq.stage === 'wait' ? centerBusy() : false, dead: !!game.player?.dead, danger: routineAttentionBusy(game) });
    if (!ev) return;
    if (ev.type === 'show') {
      render(ev);
      const box = ensure();
      if (box) requestAnimationFrame(() => box.classList.add('on'));
      try { game.onboard?.fr?.slot?.(ev.ms / 1000); } catch { /* later arrival cards queue behind the panel */ }
      try { game.sfx?.('ui_hover', 0.3); } catch { /* ignore */ }
    } else if (ev.type === 'pause') { el?.classList.remove('on'); if (el) el.style.visibility = 'hidden'; }
    else if (ev.type === 'resume') { render(ev); const box = ensure(); if (box) { box.style.visibility = ''; box.classList.add('on'); } }
    else if (ev.type === 'update') render(ev);
    else if (ev.type === 'hide') hide();
  }));
  // Enter / Escape dismisses the panel early (passive: never swallows the key, gameplay input is untouched)
  const onKey = (e) => { if (seq.stage === 'panel' && (e.code === 'Enter' || e.code === 'Escape')) { const ev = seq.skip(); if (ev) hide(); } };
  if (typeof window !== 'undefined') { window.addEventListener('keydown', onKey, true); offs.push(() => window.removeEventListener('keydown', onKey, true)); }

  const hook = { capture, hold };
  if (game.ui) game.ui.landHook = hook;
  offs.push(() => { if (game.ui?.landHook === hook) game.ui.landHook = null; });

  return {
    seq, capture, hold,
    /** console demo: kefal.game.landing10.demo() fires 8 landing sys lines through the real path */
    demo() {
      seq.begin('demo' + Date.now(), now(), true);
      for (const [m, k] of [['CREW TASKS assigned - finish yours for the team bonus.', 'info'], ['Seismic sensors: something heavy is pacing deep inside the facility...', 'info'], ['WEATHER: eclipse', 'warn'],
        ['Technician kit issued.', 'info'], ['PRE-FLIGHT CHECK: 2 faults block takeoff. Fix them all!', 'bad'], ['Takeoff blocked: 2 faults left.', 'warn'], ['CONTESTED ZONE: Faction squads patrol this moon.', 'warn'], ['Crew tasks: 0/5', 'info']]) game.ui?.systemMessage?.(m, k);
    },
    debug: () => ({ stage: seq.stage, key: seq.key, lines: seq.lines.length, view: seq.view(), busy: centerBusy() }),
    dispose() { disposed = true; for (const f of offs) { try { f(); } catch { /* ignore */ } } clearTimeout(hideT); el?.remove(); st?.remove(); },
  };
}
