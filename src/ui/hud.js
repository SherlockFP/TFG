// In-game HUD (helmet visor style): health figure, stamina, weight, clock, inventory, prompts,
// scan labels (with item icons), floating damage numbers, XP/level, coins, toasts, death/spectate
// overlays, run chips (daily event / favor / streak), outdoor compass, and the landing briefing card.
import { spreadLabels } from './compass_labels.js';
import * as THREE from 'three';
import { iconHTML, typeFromName } from './icons.js';
import { glyph } from './glyphs.js';   // [ui2]
import { el, escapeHtml, fmtClock, clamp } from '../core/util.js';
import { itemDef } from '../game/items.js';
import { affixShortName } from '../game/loot.js';
import { forgeName } from '../game/enhance.js';   // [forge]
import { durBarHTML, durClass } from './durability_style.js';   // [durability]
import { TIERS } from '../game/tiers.js';
import { ensureInventoryStyles } from './inventory_style.js';
import { xpForLevel, rankOf } from '../game/progression.js';
import { MOONS, WEATHER } from '../game/moons.js';
import * as DailyEvents from '../game/dailyEvents.js';
import { t, getLang, tf } from '../core/i18n.js';
import { LABEL as HL_LABEL } from '../game/headline_core.js';
import { walletRow } from '../game/wallet.js';   // [unify] one wallet row: credits + clout
import { INTERIOR_NAMES as REG_INTERIOR_NAMES } from '../world/interiors/index.js';

const BODY_SVG = `<svg viewBox="0 0 40 80" class="hud-body"><g fill="currentColor">
<circle cx="20" cy="9" r="7"/><rect x="11" y="18" width="18" height="26" rx="4"/>
<rect x="3" y="19" width="7" height="24" rx="3"/><rect x="30" y="19" width="7" height="24" rx="3"/>
<rect x="12" y="44" width="7" height="30" rx="3"/><rect x="21" y="44" width="7" height="30" rx="3"/></g></svg>`;

// ------------------------------------------------------------------ shared run helpers (also used by ui.js / objectives)
export const TIPS = [
  'Scan (right click) before you grab: the value is shown on every label.',
  'The ship leaves at midnight, with or without you.',
  'Carry bodies back to the ship: the fine is smaller.',
  'Sprinting and your voice make noise. Trolls hunt by sound.',
  'NPCs only move when nobody is looking at them.',
  'Look at the Lurker and it backs off. Turn away and it gets closer.',
  'Not every EXIT is real. Dark patterns lurk in the facility.',
  'Sell on the last day for the best buying rate at 0-Algorithm HQ.',
  'Clickbait Mine: click. Do not step off. Ask a friend for help.',
  'Deep rooms hold the best loot. The deeper you go, the more it pays.',
  'A walkie-talkie lets you talk across the whole map.',
  'Level up to earn skill points. Press K to spend them in the passive tree.',
  'Daily events change the rules: check the terminal before you land.',
  'Fragile scrap loses value when it hits the floor. Carry it gently.',
  'Firewall Turrets can be disabled from the terminal with their code.',
  'Soulbound gear from Phish Dayı at HQ comes back with you on every landing.',
  'AI Slop is calmed by music. A boombox is a lifesaver.',
  'Ping (P / middle mouse) to mark loot and danger for your crew.',
  'Hold B for the emote wheel. Z / X are quick emotes.',
  'Push-to-talk is V. Creatures can hear you, too.',
];
export function randomTip(prev) {
  let tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  if (tip === prev) tip = TIPS[(TIPS.indexOf(tip) + 1) % TIPS.length];
  return tip;
}

const INTERIOR_NAMES = { factory: 'Data Center', mansion: 'Haunted Homepage', mineshaft: 'Deep Web Mine', ...REG_INTERIOR_NAMES };   // + office/backrooms/serverfarm/sewer/hospital from the interiors registry
export function interiorName(moon) {
  if (!moon || moon.company) return '—';
  const id = moon.interior || 'factory';
  const n = moon.interiorName || INTERIOR_NAMES[id] || String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return t(n);
}

/** Today's daily event: the replicated one, or (clients) the same deterministic roll the host made. */
export function todaysEvent(run) {
  if (!run || !['landing', 'moon', 'takeoff'].includes(run.phase)) return null;
  if (MOONS[run.moon]?.company) return null;
  if (run.dailyEvent) return run.dailyEvent;
  if (run.hl) return null;   // [trim] headline.js decided this landing: no daily event today (the fallback roll below is only for runs from an older host)
  try { return DailyEvents.dailyEventFor?.(run.seed, run.day, run.moon) || null; } catch { return null; }
}

// English effect phrases produced by dailyEvents.eventEffects() -> i18n keys (longest first)
const FX_WORDS = ['scrap moves every', 'air drops every', 'golden caches', 'stamina regen', 'scrap count', 'outdoor loot', 'scan range', 'starts dark',
  'bot packs', 'lands at', 'max HP', 'battery', 'elites', 'danger', 'melee', 'speed', 'clock', 'scrap', 'jump', '/kill'];
/** Short effect strings for a daily event ("scrap +25%", "danger +22%"...), translated. */
export function eventEffects(ev) {
  if (!ev) return [];
  let list = null;
  try { list = DailyEvents.eventEffects?.(ev) || null; } catch { list = null; }
  if (!list) {
    const pct = (m) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
    list = [];
    if (ev.valueMul && Math.abs(ev.valueMul - 1) > 0.001) list.push(`${t('scrap')} ${pct(ev.valueMul)}`);
    if (ev.dangerMul && Math.abs(ev.dangerMul - 1) > 0.001) list.push(`${t('danger')} ${pct(ev.dangerMul)}`);
    if (ev.outdoorMul && Math.abs(ev.outdoorMul - 1) > 0.001) list.push(`${t('outdoor loot')} ${pct(ev.outdoorMul)}`);
    if (ev.blackout) list.push(t('starts dark'));
  }
  return list.map((x) => { let o = String(x); for (const w of FX_WORDS) if (o.includes(w)) o = o.replace(w, t(w)); return o; });
}
/** Display name / description of an event in the current language (events carry tr: [name, desc]). */
export function eventName(ev) { return (getLang() === 'tr' && !ev?.weekly && ev?.tr?.[0]) || t(ev?.name || ''); }
export function eventDesc(ev) { return (getLang() === 'tr' && !ev?.weekly && ev?.tr?.[1]) || t(ev?.desc || ''); }
/** 'good' | 'bad' | 'mixed' (older events without a mood: judged by danger / blackout). */
export function eventMood(ev) {
  if (!ev) return 'mixed';
  if (ev.mood) return ev.mood;
  return (ev.dangerMul || 1) > 1.1 || ev.blackout ? 'bad' : (ev.valueMul || 1) > 1 ? 'good' : 'mixed';
}

const DANGER_NAMES = ['NONE', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'LETHAL'];
/** 0 (HQ) .. 5 danger pips for a moon today. */
export function dangerOf(moon, run, ev) {
  if (!moon || moon.company) return 0;
  const w = { eclipsed: 1, stormy: 0.5, foggy: 0.25 }[run?.weather] || 0;
  const s = (moon.tier || 1) + w + ((ev?.dangerMul || 1) - 1) * 4 + (run?.quotaIndex || 0) * 0.2;
  return clamp(Math.round(s), 1, 5);
}
export function dangerName(n) { return t(DANGER_NAMES[clamp(n | 0, 0, 5)]); }

function weatherInfo(id) {
  const w = WEATHER[id] || WEATHER.clear;
  return { name: t(w?.name || String(id || 'Clear')), color: w?.color || '#9fd49f' };
}

const TAU = Math.PI * 2;
const wrapPI = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// [i18n8] XP-feed reasons arrive as English keys ("Scrap sold") or "<label> <name>" ("Crafted Sword"): translate both shapes on the receiving client
const XP_PREFIX = /^(Crafted|Dismantled|Analysis:|Blueprint required:|Contract:|Task:|Ship fault:) (.+)$/;
function xpReason(reason) {
  const m = XP_PREFIX.exec(reason);
  return m ? tf(m[1] + ' {name}', { name: t(m[2]) }) : t(reason);
}

export class HUD {
  constructor(root) {
    this.root = root;
    ensureInventoryStyles();   // tier frames on the hotbar + the [I] bag tag (shared with the inventory panel)
    this.el = el('div', { class: 'hud hidden' });
    root.appendChild(this.el);
    this.el.innerHTML = `
      <div class="visor"></div>
      <div class="hud-tl">
        <div class="hud-health">${BODY_SVG}</div>
        <div class="hud-stam"><div class="hud-stam-fill"></div></div>
        <div class="hud-weight">0 lb</div>
        <div class="hud-chips"></div>
      </div>
      <div class="hud-clock hidden"><span class="clock-icon">${glyph('sun')}</span><span class="clock-time">8:00 AM</span></div>
      <div class="hud-compass hidden"><canvas width="440" height="46"></canvas></div>
      <div class="hud-tr">
        <div class="hud-level"><span class="lvl">Lv.1</span> <span class="rank">Intern</span></div>
        <div class="hud-xp"><div class="hud-xp-fill"></div></div>
        <div class="hud-coins">◈ 0</div>
      </div>
      <div class="hud-quota hidden"></div>
      <div class="hud-cross">·</div>
      <div class="hud-prompt"><div class="p-main"></div><div class="p-sub"></div></div>
      <div class="hud-inv"></div>
      <div class="hud-scan"></div>
      <div class="hud-float"></div>
      <div class="hud-toasts"></div>
      <div class="hud-big hidden"><div class="big-main"></div><div class="big-sub"></div></div>
      <div class="hud-dead hidden"><div class="dead-main">DECEASED</div><div class="dead-sub"></div><div class="dead-tip"></div><div class="dead-stamp ad-only"><b></b><span></span></div></div>
      <div class="hud-spec hidden"></div>
      <div class="hud-voice hidden">${glyph('mic')}</div>
      <div class="hud-dmgdir"></div>
      <div class="hud-xpfeed"></div>
      <div class="hud-scanring hidden"></div>
      <div class="hud-bounty"></div>
      <div class="hud-brief hidden"></div>
    `;
    const q = (s) => this.el.querySelector(s);
    this.$ = {
      health: q('.hud-health'), stam: q('.hud-stam-fill'), stamBox: q('.hud-stam'), weight: q('.hud-weight'),
      clock: q('.hud-clock'), clockTime: q('.clock-time'), clockIcon: q('.clock-icon'),
      lvl: q('.lvl'), rank: q('.rank'), xp: q('.hud-xp-fill'), coins: q('.hud-coins'), quota: q('.hud-quota'),
      prompt: q('.hud-prompt'), pMain: q('.p-main'), pSub: q('.p-sub'), inv: q('.hud-inv'), scan: q('.hud-scan'),
      float: q('.hud-float'), toasts: q('.hud-toasts'), big: q('.hud-big'), bigMain: q('.big-main'), bigSub: q('.big-sub'),
      dead: q('.hud-dead'), deadSub: q('.dead-sub'), deadTip: q('.dead-tip'), spec: q('.hud-spec'), voice: q('.hud-voice'), dmgdir: q('.hud-dmgdir'),
      xpfeed: q('.hud-xpfeed'), scanring: q('.hud-scanring'), cross: q('.hud-cross'), bounty: q('.hud-bounty'),
      chips: q('.hud-chips'), compass: q('.hud-compass'), brief: q('.hud-brief'),
    };
    this.cmpCanvas = this.$.compass.querySelector('canvas');
    this.cmpCtx = this.cmpCanvas.getContext('2d');
    this.scanLabels = [];
    this.floats = [];
    this.run = null;
    this.promptText = null;
    // While a full-screen report / cinematic is up (ui.fullscreenOpen), toasts and big banners wait here.
    this.gate = null;
    this.pendingToasts = [];
    this.pendingBig = null;
    this.nextFlush = 0;
    this.briefOn = false;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  setRun(run) { this.run = run; }
  pulse(what) { if (what === 'credits') { this.$.quota.classList.remove('pulse'); void this.$.quota.offsetWidth; this.$.quota.classList.add('pulse'); } }

  bigText(main, sub) {
    // the landing briefing card already shows the moon name + weather
    if (this.run?.phase === 'landing' && main && main === MOONS[this.run.moon]?.name) return;
    if (this.gate?.()) { this.pendingBig = [main, sub]; return; }
    this.$.bigMain.textContent = main; this.$.bigSub.textContent = sub || '';
    this.$.big.classList.remove('hidden');
    this.$.big.classList.remove('anim'); void this.$.big.offsetWidth; this.$.big.classList.add('anim');
    // while the banner is up, the side columns (objectives, event chips, assignment) step back so nothing overlaps it
    this.el.classList.add('big-on');
    clearTimeout(this.bigT);
    this.bigT = setTimeout(() => { this.$.big.classList.add('hidden'); this.el.classList.remove('big-on'); }, 5200);
  }

  // Right column stack: level / coins (hud-tr) -> mod widgets (assignment...) -> XP feed -> toasts.
  // Every piece is measured so a taller widget pushes the rest down instead of overlapping it.
  layoutRight() {
    const tr = this.el.querySelector('.hud-tr');
    if (!tr) return;
    let y = tr.getBoundingClientRect().bottom + 8;
    for (const w of this.el.querySelectorAll('.tfg-asg, [data-hud-right]')) {
      if (!w.getClientRects().length || !w.textContent.trim()) continue;
      const r = w.getBoundingClientRect();
      if (r.height > 0) y = Math.max(y, r.bottom + 8);
    }
    const setTop = (node, v) => { const px = Math.round(v) + 'px'; if (node.style.top !== px) node.style.top = px; };
    setTop(this.$.xpfeed, y);
    y += this.$.xpfeed.offsetHeight + (this.$.xpfeed.childElementCount ? 6 : 0);
    setTop(this.$.toasts, Math.max(y, 96));
    // the centre banner steps below an achievement / login banner (achievements.js .kach-banner-host) when both are up
    let bt = 0;
    for (const k of this.root.querySelectorAll?.('.kach-banner-host > *') || []) { if (k.getClientRects().length) bt = Math.max(bt, k.getBoundingClientRect().bottom + 12); }
    const want = bt > 0 ? Math.max(bt, window.innerHeight * 0.24) : 0;
    const cur = this.bigTopPx || 0;
    if (Math.abs(want - cur) > 2) { this.bigTopPx = want; this.$.big.style.top = want ? Math.round(want) + 'px' : ''; }
  }

  setPrompt(text, sub) {
    if (text === this.promptText && sub === this.promptSub) return;
    this.promptText = text; this.promptSub = sub;
    this.$.prompt.style.opacity = text ? 1 : 0;
    this.$.pMain.textContent = text ? String(text).replace(/\s*\[E\]\s*/g, ' ').trim() : '';   // [threatmerge] a11y.js prepends the key badge ('[E] ' via CSS): drop the '[E]' the label itself carries (was "[E] X [E]")
    this.$.pSub.textContent = sub || '';
  }

  setInventory(items, active) {
    this.invItems = items; this.invActive = active;
    const html = items.map((it, i) => {
      const d = it ? itemDef(it.type) : null;
      // tier frame: rolled / affix / def tiers and valued scrap; plain tools keep the neutral amber frame
      const tier = it && (it.tier || it.affix || d.tier || d.value) ? (it.rarity?.() || 'common') : null;
      const col = tier ? (TIERS[tier] || TIERS.common).color : '#cfc6b8';
      const nm = it ? it.label || (it.plus || it.oc?.length ? forgeName(affixShortName(d.name, it.affix), it.plus || 0, it.oc) : affixShortName(d.name, it.affix)) : '';   // [forge] +N name
      const bar = it && d.battery ? `<div class="inv-bat"><div style="width:${clamp((Number(it.battery) / d.battery) * 100 || 0, 0, 100)}%"></div></div>` : '';
      const extra = it && d.ammo !== undefined ? `<div class="inv-ammo">${Number(it.ammo) || 0}/${Number(d.ammo) || 0}</div>` : it && it.charges !== undefined && it.charges !== null && d.charges ? `<div class="inv-ammo">${Number(it.charges) || 0}</div>` : '';
      const tcls = tier && tier !== 'common' ? ` tier tier-${tier}` : '';
      return `<div class="inv-slot ${i === active ? 'active' : ''} ${it ? 'full' : ''}${tcls}${durClass(it)}"${tcls ? ` style="--tc:${col}"` : ''}><div class="inv-num">${i + 1}</div>${it ? iconHTML(it.type, 'inv-ico') + `<div class="inv-name" style="color:${col}">${escapeHtml(nm)}</div>` : ''}${bar}${durBarHTML(it)}${extra}${it?.on ? '<div class="inv-on">●</div>' : ''}</div>`;
    }).join('');
    this.$.inv.innerHTML = (this.bagTag || '') + html;
  }
  /** [I] inventory hint left of the hotbar: bag cells used / capacity (inventory.js). null hides it. */
  setBagTag(info) {
    const s = info ? `<div class="inv-bagtag${info.full ? ' full' : ''}"><kbd>I</kbd><span class="bt-l">${escapeHtml(info.label || 'BAG')}</span><span class="bt-n">${Number(info.used) || 0}/${Number(info.cap) || 0}</span></div>` : '';
    if (s === (this.bagTag || '')) return;
    this.bagTag = s;
    if (this.invItems) this.setInventory(this.invItems, this.invActive);
  }

  setCoins(c, delta) {
    this.coinsVal = c;
    // [hud6] ONE currency on the HUD: credits. Clout joins the row for ~6 s when it changes (and always in Full / on the Tab card).
    if (this.cloutSeen != null && c !== this.cloutSeen) { this.cloutUntil = performance.now() + 6000; clearTimeout(this.cloutT); this.cloutT = setTimeout(() => this.setCoins(this.coinsVal), 6100); }
    this.cloutSeen = c;
    const both = document.documentElement.dataset.hud === 'full' || performance.now() < (this.cloutUntil || 0);
    this.$.coins.textContent = both ? walletRow(this.creditsVal || 0, c) : walletRow(this.creditsVal || 0, c).split(' · ')[0];   // [unify] ▮ credits · ◈ clout
    if (delta) { this.$.coins.classList.remove('pulse'); void this.$.coins.offsetWidth; this.$.coins.classList.add('pulse'); }
  }

  xpGain(xp, reason) {
    if (!xp) return;
    const e = el('div', { class: 'xpline' }, tf('+{xp} XP', { xp }), reason ? el('span', {}, ' ' + xpReason(reason)) : null);
    this.$.xpfeed.appendChild(e);
    setTimeout(() => e.remove(), 2600);
    while (this.$.xpfeed.children.length > 5) this.$.xpfeed.firstChild.remove();
  }
  levelUp(level, rank) {
    this.bigText(t('LEVEL UP!') + ' ' + level, tf('{rank} · +1 {t} [K]', { rank, t: t('skill point') }));
    this.$.lvl.parentElement.classList.remove('pulse'); void this.$.lvl.offsetWidth; this.$.lvl.parentElement.classList.add('pulse');
  }

  toast(text, kind = 'info') {
    if (this.gate?.()) {
      // queue (no duplicates, bounded) until the report / cinematic is gone
      if (!this.pendingToasts.some((p) => p[0] === text)) this.pendingToasts.push([text, kind]);
      if (this.pendingToasts.length > 8) this.pendingToasts.shift();
      return;
    }
    this.showToast(text, kind);
  }
  showToast(text, kind = 'info') {
    const e = el('div', { class: 'toast ' + kind }, text);
    this.$.toasts.appendChild(e);
    setTimeout(() => e.classList.add('out'), 3800);
    setTimeout(() => e.remove(), 4400);
    while (this.$.toasts.children.length > 6) this.$.toasts.firstChild.remove();
  }
  flushPending() {
    if ((!this.pendingToasts.length && !this.pendingBig) || this.gate?.()) return;
    const now = performance.now();
    if (now < this.nextFlush) return;
    if (this.pendingBig) { const [m, s] = this.pendingBig; this.pendingBig = null; this.bigText(m, s); this.nextFlush = now + 700; return; }
    const [text, kind] = this.pendingToasts.shift();
    this.showToast(text, kind);
    this.nextFlush = now + 420;
  }

  setDead(dead, text, tip) {
    this.$.dead.classList.toggle('hidden', !dead);
    this.root?.classList?.toggle('is-dead', !!dead);
    this.$.deadSub.textContent = text || '';
    this.$.deadTip.textContent = tip ? '▸ ' + tip : '';
    const st = this.$.dead.querySelector('.dead-stamp');   // [artdir] "TERMINATED - reason" stamp (html.tfg-artdir only)
    if (st) { st.firstChild.textContent = t('TERMINATED'); st.lastChild.textContent = text || ''; }
    if (!dead) this.$.spec.classList.add('hidden');
  }
  setSpectate(text) {
    this.$.spec.classList.toggle('hidden', !text);
    this.$.spec.textContent = text || '';
  }

  scanPulse() {
    const r = this.$.scanring;
    r.classList.remove('hidden', 'anim'); void r.offsetWidth; r.classList.add('anim');
    clearTimeout(this.scanRingT);
    this.scanRingT = setTimeout(() => r.classList.add('hidden'), 900);
  }
  showScan(labels, total) {
    this.$.scan.innerHTML = '';
    this.scanLabels = labels.slice(0, 40).map((l, i) => {
      const type = l.type || typeFromName(l.name);
      const ico = type && itemDef(type).kind !== 'body' ? el('div', { class: 'sl-ico', html: iconHTML(type, 'sl-img') }) : null;
      const e = el('div', { class: 'scan-label' + (ico ? ' has-ico' : '') }, ico,
        el('div', { class: 'sl-text' }, el('div', { class: 'sl-name', style: { color: l.color } }, t(l.name)), l.sub ? el('div', { class: 'sl-sub' }, t(l.sub)) : null));   // t(): safety net for static scan labels (Ship, Main Entrance ...)
      e.style.animationDelay = (l.delay ?? i * 0.04) + 's';
      if (ico) ico.style.borderColor = l.color || '';
      this.$.scan.appendChild(e);
      return { ...l, el: e };
    });
    if (total > 0) {
      const tot = el('div', { class: 'scan-total' }, `${t('Total')}: ▮${total}`);
      this.$.scan.appendChild(tot);
      setTimeout(() => tot.remove(), 3000);
    }
    this.scanUntil = performance.now() + 3200 + Math.max(0, ...labels.map((l) => (l.delay || 0) * 1000));
  }

  floatText(pos, text, color = '#fff', big = false) {
    const e = el('div', { class: 'float-text' + (big ? ' big' : ''), style: { color } }, text);
    this.$.float.appendChild(e);
    this.floats.push({ pos: pos.clone(), el: e, t: 0, off: (Math.random() - 0.5) * 30 });
    if (this.floats.length > 30) { const f = this.floats.shift(); f.el.remove(); }
  }

  damageDirection(from, game) {
    const p = game.player;
    const ang = Math.atan2(from.x - p.pos.x, from.z - p.pos.z);
    const rel = ang - (p.yaw + Math.PI);
    const e = el('div', { class: 'dmg-arc' });
    e.style.transform = `rotate(${-rel}rad)`;
    this.$.dmgdir.appendChild(e);
    setTimeout(() => e.remove(), 1200);
  }

  project(pos, camera, W, H) {
    const v = pos.clone().project(camera);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }

  // ------------------------------------------------------------------ run chips (daily event / favor / streak)
  updateChips(game) {
    const run = this.run || {};
    const parts = [];
    const ev = todaysEvent(run);
    if (ev) {
      const fx = eventEffects(ev).slice(0, 3);
      parts.push(`<span class="chip-ev ${eventMood(ev)}"><b>${glyph('bolt')} ${escapeHtml(eventName(ev))}</b>${fx.length ? `<i>${escapeHtml(fx.join(' · '))}</i>` : ''}</span>`);
    }
    const favor = Number(run.favor);
    if (Number.isFinite(favor) && favor > 0 && Math.abs(favor - 1) > 0.004) parts.push(`<span class="chip-m ${favor >= 1 ? 'good' : 'bad'}">${t('FAVOR')} ×${favor.toFixed(2)}</span>`);
    const streak = Number(run.streak ?? run.quotaStreak ?? 0);
    if (Number.isFinite(streak) && streak >= 2) {
      const mul = Number(run.streakMul);
      parts.push(`<span class="chip-m good">${t('STREAK')} ${streak}${Number.isFinite(mul) && mul > 1 ? ` ×${mul.toFixed(2)}` : ''}</span>`);
    }
    const html = parts.join('');
    if (html !== this.lastChips) { this.$.chips.innerHTML = html; this.lastChips = html; }
    void game;
  }

  // ------------------------------------------------------------------ compass (outdoors on a moon)
  drawCompass(game) {
    const p = game.player;
    const ctx = this.cmpCtx, W = this.cmpCanvas.width, H = this.cmpCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const heading = -p.yaw;                 // bearing 0 = north (-Z), clockwise towards +X (east)
    const span = Math.PI * 0.9;             // visible arc across the tape
    const pxr = W / span;
    // tape background (fades at the ends)
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.18, 'rgba(0,0,0,0.42)'); grd.addColorStop(0.82, 'rgba(0,0,0,0.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, 22);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const LET = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let deg = 0; deg < 360; deg += 15) {
      const rel = wrapPI(deg * Math.PI / 180 - heading);
      if (Math.abs(rel) > span / 2) continue;
      const x = Math.round(W / 2 + rel * pxr);
      const fade = 1 - Math.pow(Math.abs(rel) / (span / 2), 3);
      const card = deg % 90 === 0;
      ctx.globalAlpha = fade;
      if (LET[deg]) {
        ctx.fillStyle = deg === 0 ? '#ff6a4a' : card ? '#ffd9b8' : '#c8a080';
        ctx.font = card ? '20px "TFG Credit", VT323, "TFG Cyr VT", monospace' : '16px "TFG Credit", VT323, "TFG Cyr VT", monospace';
        ctx.fillText(LET[deg], x, card ? 1 : 3);
      } else {
        ctx.fillStyle = 'rgba(255,190,140,0.7)';
        ctx.fillRect(x, 8, 1, 7);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 1, 0, 2, 4);
    // markers
    const out = game.world.outdoor;
    const marks = [{ x: 0, z: 0, label: t('SHIP'), col: '#9fd4ff', dist: true }];
    if (out?.mainExit) marks.push({ x: out.mainExit.pos.x, z: out.mainExit.pos.z, label: t('ENTRANCE'), col: '#9fffb0', dist: true });
    for (const f of out?.fireExits || []) marks.push({ x: f.pos.x, z: f.pos.z, label: t('EXIT'), col: 'rgba(160,255,176,0.55)', dist: false, small: true });
    ctx.font = '15px "TFG Credit", VT323, "TFG Cyr VT", monospace';
    const labels = [];
    for (const m of marks) {
      const dx = m.x - p.pos.x, dz = m.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) continue;
      const rel = wrapPI(Math.atan2(dx, -dz) - heading);
      const edge = Math.abs(rel) > span / 2 - 0.08;
      if (edge && m.small) continue;
      const x = Math.round(W / 2 + clamp(rel, -span / 2 + 0.08, span / 2 - 0.08) * pxr);
      ctx.fillStyle = m.col;
      ctx.beginPath();
      if (edge) { const s = Math.sign(rel); ctx.moveTo(x + s * 6, 30); ctx.lineTo(x - s * 3, 25); ctx.lineTo(x - s * 3, 35); }
      else { ctx.moveTo(x, 23); ctx.lineTo(x + 5, 30); ctx.lineTo(x, 37); ctx.lineTo(x - 5, 30); }
      ctx.closePath(); ctx.fill();
      if (m.small) continue;
      const txt = m.dist ? `${m.label} ${Math.round(d)}m` : m.label;
      const tw = ctx.measureText(txt).width;
      const tx = clamp(x + (edge ? -Math.sign(rel) * (tw / 2 + 10) : 0), tw / 2 + 2, W - tw / 2 - 2);
      labels.push({ txt, tw, tx, col: m.col });
    }
    // [ui3] two markers on (nearly) the same bearing used to print SHIP / ENTRANCE on top of each other: push the labels apart sideways
    if (document.documentElement.classList.contains('tfg-ui3') && labels.length > 1) spreadLabels(labels, W);
    for (const l of labels) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(l.txt, l.tx + 1, 32);
      ctx.fillStyle = l.col; ctx.fillText(l.txt, l.tx, 31);
    }
  }

  // ------------------------------------------------------------------ landing briefing
  buildBrief(game) {
    const run = this.run || {};
    const moon = MOONS[run.moon] || {};
    const ev = todaysEvent(run);
    const w = weatherInfo(run.weather);
    const danger = dangerOf(moon, run, ev);
    const pips = moon.company ? '' : Array.from({ length: 5 }, (_, i) => `<i class="${i < danger ? 'on' : ''}"></i>`).join('');
    const lootMul = (moon.scrapMul || 1) * (ev?.valueMul || 1);
    const rows = moon.company
      ? `<div><span>${t('SELL ZONE')}</span><b>${escapeHtml(t('Put scrap on the counter and ring the bell.'))}</b></div>
         <div><span>${t('WEATHER')}</span><b style="color:${w.color}">${escapeHtml(w.name)}</b></div>`
      : `<div><span>${t('INTERIOR')}</span><b>${escapeHtml(interiorName(moon))}</b></div>
         <div><span>${t('WEATHER')}</span><b style="color:${w.color}">${escapeHtml(w.name)}</b></div>
         <div><span>${t('DANGER')}</span><b class="br-danger d${danger}"><span class="br-pips">${pips}</span>${dangerName(danger)}</b></div>
         <div><span>${t('LOOT')}</span><b>×${lootMul.toFixed(2)}</b></div>`;
    const fx = eventEffects(ev);
    const hl = !ev && run.hl && run.hl.n ? run.hl : null;   // [trim] role day / trend / warp headline (the affix set and the daily event come through `ev`)
    const hlHtml = hl ? `<div class="br-event mixed"><div class="br-ek">${t(HL_LABEL[hl.k] || 'HEADLINE')}</div><div class="br-en">${glyph('bolt')} ${escapeHtml(t(hl.n))}</div><div class="br-ed">${escapeHtml(t(hl.d || ''))}</div></div>` : '';
    const evHtml = hlHtml || (ev ? `<div class="br-event ${eventMood(ev)}"><div class="br-ek">${t(run.hl?.k === 'mapmods' ? 'SECTOR MAP' : 'DAILY EVENT')}</div><div class="br-en">${glyph('bolt')} ${escapeHtml(eventName(ev))}</div>
      <div class="br-ed">${escapeHtml(eventDesc(ev))}</div>${fx.length ? `<div class="br-fx">${fx.map((x) => `<i>${escapeHtml(x)}</i>`).join('')}</div>` : ''}</div>` : '');
    this.briefTip = randomTip(this.briefTip);
    this.$.brief.innerHTML = `<div class="br-bar top"></div><div class="br-bar bot"><span class="br-tip"><b>${t('TIP')}</b> ${escapeHtml(t(this.briefTip))}</span></div>
      <div class="br-card">
        <div class="br-k"><span>${t('DESCENT BRIEFING')}</span><span>${t('Day')} ${run.day ?? 1}</span></div>
        <div class="br-moon">${escapeHtml(moon.name || run.moon || '?')}</div>
        ${moon.desc ? `<div class="br-desc">${escapeHtml(moon.desc)}</div>` : ''}
        <div class="br-grid">${rows}</div>
        ${evHtml}
        <div class="br-prog"><div class="br-pbar"><i></i></div><span class="br-pl">${t('DESCENT')} 0%</span></div>
      </div>`;
    this.briefFill = this.$.brief.querySelector('.br-pbar i');
    this.briefLabel = this.$.brief.querySelector('.br-pl');
    this.briefKey = `${run.moon}|${run.seed}|${ev?.id || ev?.name || ''}`;
    void game;
  }
  updateBrief(dt, game) {
    const run = this.run || {};
    const want = run.phase === 'landing' && !game.player.dead;
    const b = this.$.brief;
    if (want) {
      const key = `${run.moon}|${run.seed}`;
      if (!this.briefOn || !String(this.briefKey || '').startsWith(key + '|')) {
        this.buildBrief(game);
        this.briefOn = true;
        clearTimeout(this.briefHideT);
        b.classList.remove('hidden', 'out');
      }
      const k = clamp((game.stateTimer || 0) / 9, 0, 1);
      if (this.briefFill) this.briefFill.style.width = (k * 100).toFixed(1) + '%';
      const lbl = k >= 0.999 ? t('TOUCHDOWN') : `${t('DESCENT')} ${Math.floor(k * 100)}%`;
      if (this.briefLabel && this.briefLabel.textContent !== lbl) this.briefLabel.textContent = lbl;
    } else if (this.briefOn) {
      this.briefOn = false;
      b.classList.add('out');
      clearTimeout(this.briefHideT);
      this.briefHideT = setTimeout(() => { if (!this.briefOn) b.classList.add('hidden'); }, 700);
    }
  }

  update(dt, game) {
    const p = game.player;
    const run = this.run || {};
    const W = window.innerWidth, H = window.innerHeight;
    // phase changes (ui.js: a landing flushes any report / cinematic still on screen)
    if (run.phase !== this.lastPhase) { const prev = this.lastPhase; this.lastPhase = run.phase; if (prev !== undefined) { try { this.onPhase?.(run.phase, prev); } catch (e) { console.warn('[hud] onPhase', e); } } }
    this.flushPending();
    // health figure color
    const hpf = clamp(p.hp / Math.max(1, p.maxHp), 0, 1);
    const col = hpf > 0.7 ? '#ffd9b0' : hpf > 0.4 ? '#ffb347' : hpf > 0.2 ? '#ff6a2a' : '#ff2a2a';
    this.$.health.style.color = col;
    this.$.health.classList.toggle('crit', hpf < 0.25 && !p.dead);
    this.$.stam.style.width = (p.stamina / p.maxStamina * 100) + '%';
    this.$.stamBox.classList.toggle('exhausted', p.exhausted);
    this.$.stamBox.classList.toggle('low', p.stamina < p.maxStamina * 0.25 && !p.exhausted);   // [artdir]
    this.el.classList.toggle('hp-low', hpf < 0.3 && !p.dead);   // [artdir] red edge pulse
    this.$.weight.textContent = Math.round(p.carryWeight ? p.carryWeight() + (game.stats.carryRelief || 0) : 0) + ' lb';
    // clock
    const onMoon = (run.phase === 'moon' || run.phase === 'takeoff') && !p.indoor;
    this.$.clock.classList.toggle('hidden', !onMoon);
    if (onMoon) {
      this.$.clockTime.textContent = fmtClock(run.time || 480);
      const night = (run.time || 480) > 18.5 * 60;   // [ui2] vector sun / moon instead of text glyphs
      if (this._night !== night) { this._night = night; this.$.clockIcon.innerHTML = glyph(night ? 'moon' : 'sun'); }
      this.$.clock.classList.toggle('late', (run.time || 0) > 22 * 60);
    }
    // compass (outdoors on a moon, not inside the ship)
    const showCmp = run.phase === 'moon' && !p.indoor && !p.inShip && !p.dead && !!game.world.outdoor;
    this.$.compass.classList.toggle('hidden', !showCmp);
    if (showCmp) this.drawCompass(game);
    // level / xp
    const prof = game.profile;
    this.$.lvl.textContent = 'Lv.' + prof.level;
    this.$.rank.textContent = rankOf(prof.level) + (prof.skillPoints ? ` (+${prof.skillPoints})` : '');
    this.$.xp.style.width = (prof.xp / xpForLevel(prof.level) * 100) + '%';
    if (!this.coinsInit || (run.credits ?? 0) !== this.creditsVal) { this.coinsInit = true; this.creditsVal = run.credits ?? 0; this.setCoins(prof.coins); }
    // quota banner (in ship)
    const showQ = p.inShip && !p.dead && run.phase !== 'landing';
    this.$.quota.classList.toggle('hidden', !showQ);
    if (showQ) {
      const moon = MOONS[run.moon];
      let s = `${t('QUOTA')} ▮${run.sold ?? 0}/${run.quota ?? 0} · ${run.daysLeft ?? 3} ${t('DAYS LEFT')} · ${t('CREDITS')} ▮${run.credits ?? 0}`;
      if (run.phase === 'orbit') s += ` · ${t('ROUTE')}: ${moon?.name || '-'}`;
      if (run.phase === 'company') s += ` · ${t('BUYING AT')} ${Math.round((run.buyRate || 0) * 100)}%`;
      if (this.$.quota.textContent !== s) this.$.quota.textContent = s;
    }
    // right column stack (cheap: a few rect reads, 8x a second)
    this.stackT = (this.stackT || 0) - dt;
    if (this.stackT <= 0) { this.stackT = 0.12; this.layoutRight(); }
    // run chips + landing brief
    this.chipT = (this.chipT || 0) - dt;
    if (this.chipT <= 0) { this.chipT = 0.5; this.updateChips(game); }
    this.updateBrief(dt, game);
    // inventory battery refresh
    this.invT = (this.invT || 0) - dt;
    if (this.invT <= 0 && this.invItems) { this.invT = 0.5; this.setInventory(game.player.slots.map((id) => (id ? game.items.get(id) : null)), game.player.slot); }
    // voice indicator
    this.$.voice.classList.toggle('hidden', !game.voice.transmitting || game.voice.localLevel < 0.05);
    // crosshair
    this.$.cross.style.opacity = p.dead || game.minigame ? 0 : 1;
    // scan labels
    if (this.scanLabels.length) {
      if (performance.now() > this.scanUntil) { this.$.scan.innerHTML = ''; this.scanLabels = []; }
      else for (const l of this.scanLabels) {
        const s = this.project(l.pos, game.camera, W, H);
        if (!s) { l.el.style.display = 'none'; continue; }
        l.el.style.display = '';
        l.el.style.transform = `translate(${s[0]}px, ${s[1]}px)`;
      }
    }
    // floating numbers
    for (const f of [...this.floats]) {
      f.t += dt;
      const s = this.project(f.pos, game.camera, W, H);
      if (f.t > 1.3) { f.el.remove(); this.floats.splice(this.floats.indexOf(f), 1); continue; }
      if (!s) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      f.el.style.opacity = 1 - Math.max(0, f.t - 0.8) / 0.5;
      f.el.style.transform = `translate(${s[0] + f.off}px, ${s[1] - f.t * 40}px)`;
    }
    // bounty tracker
    this.bT = (this.bT || 0) - dt;
    if (this.bT <= 0) {
      this.bT = 1;
      const bs = prof.bounties || [];
      const html = bs.map((b) => `<div class="${b.done ? 'done' : ''}">${b.done ? '✔' : '◇'} ${escapeHtml(bountyShort(b))} ${b.done ? '' : `${Math.min(b.progress, b.n)}/${b.n}`}</div>`).join('');
      if (html !== this.lastBountyHtml) { this.$.bounty.innerHTML = html; this.lastBountyHtml = html; }
    }
  }
}

function bountyShort(b) {
  switch (b.type) {
    case 'kill': return tf('Kill {target}', { target: t(String(b.target)) });
    case 'collect': return t('Secure scrap');
    case 'fish': return t('Catch fish');
    case 'minigame': return b.target === 'safe' ? t('Crack vaults') : t('Fix fuse boxes');
    case 'survive': return t('Survive days');
    case 'sell': return t('Sell scrap');
    default: return b.type;
  }
}
