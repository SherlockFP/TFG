// SERVICE RECORD panel (J, or the button on the TAB character sheet): CODEX · MASTERY · REBIRTH · WEEKLY · CREW.
// Self-contained DOM + injected CSS in the dark CRT / amber look of style.css. Works in-game (game given) and
// from the main menu (game null: read-only codex/weekly, mastery + rebirth editable on the saved profile).
import { CREATURES } from '../../game/creatures.js';
import { ITEMS } from '../../game/items.js';
import { MOONS } from '../../game/moons.js';
import { DAILY_EVENTS, eventEffects } from '../../game/dailyEvents.js';
import {
  MASTERY, MASTERY_TIERS, masteryRank, masteryBlock, masterySpent, MASTERY_POINTS_TOTAL, REBIRTH_LEVEL, MAX_LEVEL,
  prestigeStars, prestigeBonus, rebirthPreview, canRebirth, STAR_BONUS_CAP, applyRebirth, STAR_REWARDS,
} from '../../game/progression.js';
import {
  codexCounts, bestiaryIds, scrapIds, MILESTONES, milestoneTarget, rewardLine, FIELD_NOTES, interiorName, ensureCodex,
} from '../../game/collection.js';
import { isoWeek, weeklySpec, weeklyMods, ensureWeeklyProfile } from '../../game/weekly.js';
import { crewLevelOf, ensureCrewProfile, publicCrew } from '../../game/crew.js';
import { EMOTES, LOCKED_EMOTES, isEmoteUnlocked } from '../../game/emotes.js';
import { iconImg } from '../icons.js';
import { glyphFromEmoji } from '../glyphs.js';   // [ui2]
import { getLang, addTranslations, t, t as _t, tf as _tf } from '../../core/i18n.js';
import { saveProfile } from '../../core/save.js';

const TR = {
  'SERVICE RECORD': 'HİZMET KAYDI', CODEX: 'KODEKS', MASTERY: 'USTALIK', REBIRTH: 'YENİDEN DOĞUŞ', WEEKLY: 'HAFTALIK', CREW: 'EKİP',
  Bestiary: 'Canavarlar', Scrap: 'Hurda', Moons: 'Aylar', Interiors: 'İç Mekanlar', Events: 'Olaylar', Milestones: 'Kilometre Taşları',
  Close: 'Kapat', 'Codex completion': 'Kodeks tamamlanma', kills: 'öldürme', 'Not yet encountered': 'Henüz karşılaşılmadı',
  found: 'bulundu', best: 'en iyi', visits: 'ziyaret', 'Skill points': 'Yetenek puanı', 'Rebirth now': 'Şimdi yeniden doğ',
  'Confirm rebirth?': 'Yeniden doğuş onaylansın mı?', 'Start Weekly Challenge': 'Haftalık Meydan Okumayı Başlat', 'Leaderboard': 'Liderlik Tablosu',
  'No runs yet this week.': 'Bu hafta henüz koşu yok.', Save: 'Kaydet', Members: 'Üyeler', Unlocked: 'Açık', Locked: 'Kilitli', Emotes: 'İfadeler',
};
addTranslations({ 'SERVICE RECORD [J]': 'HİZMET KAYDI [J]', 'Codex · Mastery · Rebirth · Weekly · Crew': 'Kodeks · Ustalık · Yeniden Doğuş · Haftalık · Ekip' });
const tr = () => { try { return getLang() === 'tr'; } catch { return false; } };
const L = (s) => (tr() ? TR[s] : null) || t(s);

const CREATURE_ICONS = {
  scuttler: '🪳', yoinker: '🦝', crawler: '🕷️', lurker: '👁️', mannequin: '🧍', sludge: '🟢', jester: '🎁', spider: '🕸️', leech: '🩸',
  screamer: '😱', mimic: '🎭', hound: '🐺', giant: '🗿', sandkefal: '🪱', turret: '🔫', mine: '💣', mimicdoor: '🚪', web: '🕸️', foreman: '🏗️',
};
const MOOD_COLOR = { good: '#7dff7d', bad: '#ff6b5a', mixed: '#ffd23f' };

// ------------------------------------------------------------------ css
const STYLE_ID = 'tfg-record-style';
const CSS = `
.rec{width:min(1120px,95vw);max-height:90vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(14,9,4,.97),rgba(6,4,2,.97));
 border:1px solid var(--amber-dim,#a8531f);box-shadow:0 0 50px rgba(0,0,0,.85),inset 0 0 70px rgba(255,120,40,.06);padding:14px 20px;position:relative;overflow:hidden;font-family:var(--font,'VT323',monospace);color:var(--text,#ffd9b8)}
.rec::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}
.rec-head{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap;margin-bottom:8px}
.rec-title{font-family:var(--font2,monospace);font-size:20px;color:var(--amber,#ff8a3d);letter-spacing:3px;text-shadow:0 0 12px rgba(255,138,61,.45)}
.rec-sub{opacity:.75;font-size:19px}
.rec-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(255,138,61,.3);margin-bottom:10px;flex-wrap:wrap}
.rec-tab{font-family:var(--font2,monospace);font-size:11px;letter-spacing:2px;padding:8px 12px;cursor:pointer;color:var(--amber-dim,#a8531f);border:1px solid transparent;border-bottom:none;user-select:none}
.rec-tab:hover{color:var(--amber,#ff8a3d)}
.rec-tab.sel{color:#1a0d04;background:var(--amber,#ff8a3d);box-shadow:0 0 14px rgba(255,138,61,.5)}
.rec-body{overflow:auto;flex:1;min-height:0;padding-right:6px}
.rec-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0}
.rec-chip{border:1px solid rgba(255,138,61,.35);padding:0 8px;font-size:19px;cursor:pointer;user-select:none}
.rec-chip:hover{border-color:var(--amber,#ff8a3d)}
.rec-chip.sel{background:rgba(255,138,61,.2);border-color:var(--amber,#ff8a3d);color:#fff0dc}
.rec-bar{height:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,138,61,.25);position:relative;min-width:120px;flex:1}
.rec-bar>span{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#ff8a3d,#ffd23f);box-shadow:0 0 8px rgba(255,180,60,.6)}
.rec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}
.rec-card{display:flex;gap:10px;padding:6px 8px;border:1px solid rgba(255,138,61,.22);background:rgba(0,0,0,.3);min-height:58px}
.rec-card.on{border-color:rgba(255,200,90,.6);box-shadow:inset 0 0 16px rgba(255,190,80,.07)}
.rec-card.off{opacity:.5}
.rec-card.off .rec-ic{filter:grayscale(1) brightness(.35)}
.rec-ic{font-size:30px;min-width:44px;text-align:center;line-height:44px}
.rec-ic img{width:44px;height:44px;image-rendering:pixelated}
.rec-card.off .rec-ic img{filter:brightness(0) drop-shadow(0 0 1px rgba(255,138,61,.6))}
.rec-cb{flex:1;min-width:0}
.rec-n{font-size:21px;color:#fff0dc;line-height:1.05}
.rec-t{font-size:15px;opacity:.7;margin-left:6px}
.rec-d{font-size:16px;opacity:.82;line-height:1.1}
.rec-note{font-size:15px;color:#9dd6ff;opacity:.85;line-height:1.1;margin-top:2px}
.rec-good{color:#7dff7d}.rec-bad{color:#ff6b5a}.rec-gold{color:#ffd23f}
.rec-h{font-family:var(--font2,monospace);font-size:12px;letter-spacing:2px;color:var(--amber,#ff8a3d);margin:10px 0 6px}
.rec-cols{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.rec-tier{border:1px solid rgba(255,138,61,.25);padding:8px;background:rgba(0,0,0,.25)}
.rec-tier.locked{opacity:.55}
.rec-node{display:flex;gap:8px;align-items:center;padding:5px 4px;border-bottom:1px dashed rgba(255,138,61,.15)}
.rec-node:last-child{border-bottom:none}
.rec-pips{letter-spacing:2px;color:#ffd23f;font-size:16px}
.rec-btn{font-family:var(--font,monospace);font-size:20px;color:var(--amber,#ff8a3d);background:rgba(255,138,61,.08);border:1px solid var(--amber-dim,#a8531f);padding:1px 10px;cursor:pointer}
.rec-btn:hover{background:var(--amber,#ff8a3d);color:#150a02}
.rec-btn.dis{opacity:.35;pointer-events:none}
.rec-btn.big{font-size:28px;padding:4px 22px}
.rec-btn.danger{color:#ff6b5a;border-color:#8a2a22}
.rec-btn.danger:hover{background:#ff6b5a;color:#150a02}
.rec-stars{font-size:46px;letter-spacing:4px;color:#ffd23f;text-shadow:0 0 18px rgba(255,210,63,.7),2px 2px 0 #3a1805;line-height:1.1;word-break:break-all}
.rec-stars .dim{color:#4a3514;text-shadow:none}
.rec-table{width:100%;border-collapse:collapse;font-size:19px}
.rec-table th{font-family:var(--font2,monospace);font-size:10px;letter-spacing:1px;color:var(--amber,#ff8a3d);text-align:left;padding:4px;border-bottom:1px solid rgba(255,138,61,.35)}
.rec-table td{padding:3px 4px;border-bottom:1px solid rgba(255,138,61,.1)}
.rec-table tr.me td{color:#ffe9a8;background:rgba(255,210,63,.07)}
.rec-mod{border-left:3px solid #ffd23f;padding:2px 10px;margin:4px 0;background:rgba(0,0,0,.25)}
.rec-in{font-family:var(--font,monospace);font-size:21px;background:rgba(0,0,0,.4);color:#ffe9d0;border:1px solid var(--amber-dim,#a8531f);padding:1px 8px}
.rec-foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;flex-wrap:wrap}
@media (max-width:760px){.rec-cols{grid-template-columns:1fr}}
`;
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  document.head.appendChild(s);
}
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
}
const fmt = (v) => String(Math.round(v || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function bar(frac) { const b = mk('div', 'rec-bar'); const s = mk('span'); s.style.width = Math.max(0, Math.min(100, frac * 100)) + '%'; b.appendChild(s); return b; }
function btn(label, fn, cls = '') {
  const b = mk('button', 'rec-btn ' + cls, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); fn?.(e); });
  return b;
}
function card(on, icon, name, tag, lines) {
  const c = mk('div', 'rec-card ' + (on ? 'on' : 'off'));
  const ic = mk('div', 'rec-ic');
  if (icon instanceof HTMLElement) ic.appendChild(icon); else ic.innerHTML = glyphFromEmoji(icon || '?');   // [ui2] vector pictograms instead of emoji
  const body = mk('div', 'rec-cb');
  const n = mk('div', 'rec-n', name);
  if (tag) n.appendChild(mk('span', 'rec-t', tag));
  body.appendChild(n);
  for (const [cls, t] of lines) if (t) body.appendChild(mk('div', cls, t));
  c.append(ic, body);
  return c;
}

let lastTab = 'codex';
let lastSub = 'bestiary';

/**
 * Build the panel. opts: { game, profile, tab, onClose }. Returns the root element (put it in ui.openPanel()).
 */
export function createServiceRecord({ game = null, profile = game?.profile, tab, onClose } = {}) {
  ensureStyle();
  const p = profile;
  ensureCodex(p); ensureWeeklyProfile(p); ensureCrewProfile(p);
  if (tab) lastTab = tab;
  const root = mk('div', 'rec');
  // typing in the panel's own inputs must not trigger game keys; everything else (arrows / Enter / Esc / PageUp-Down)
  // reaches the UI navigator (ui.js) so the panel is keyboard + gamepad navigable like every other CRT panel
  root.addEventListener('keydown', (e) => { const tg = e.target?.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') e.stopPropagation(); });
  const sfx = (n = 'ui_click', v = 0.5) => { try { (game?.audio || window.kefal?.audio)?.ui?.(n, v); } catch { /* ignore */ } };
  const save = () => { if (game?.progress) game.progress.save(); else saveProfile(p); };

  const render = () => {
    root.replaceChildren();
    const k = codexCounts(p);
    const head = mk('div', 'rec-head');
    head.append(mk('div', 'rec-title', L('SERVICE RECORD')),
      mk('div', 'rec-sub', `${p.name} · Lv.${p.level}${prestigeStars(p) ? ' · ★' + prestigeStars(p) : ''} · ◈${fmt(p.coins)} · ${L('Codex completion')} ${k.pct}%`));
    root.appendChild(head);
    const tabs = mk('div', 'rec-tabs');
    for (const [id, label] of [['codex', 'CODEX'], ['mastery', 'MASTERY'], ['rebirth', 'REBIRTH'], ['weekly', 'WEEKLY'], ['crew', 'CREW']]) {
      const t = mk('div', 'rec-tab' + (lastTab === id ? ' sel' : ''), L(label) + (id === 'rebirth' && canRebirth(p) ? ' !' : '') + (id === 'mastery' && p.skillPoints > 0 ? ` (${p.skillPoints})` : ''));
      t.tabIndex = 0;
      t.dataset.nav = 'rec:' + id;
      t.addEventListener('click', (e) => { e.stopPropagation(); lastTab = id; sfx(); const f = root.contains(document.activeElement); render(); if (f) root.querySelector(`[data-nav="rec:${id}"]`)?.focus({ preventScroll: true }); });
      tabs.appendChild(t);
    }
    root.appendChild(tabs);
    const body = mk('div', 'rec-body');
    root.appendChild(body);
    try {
      if (lastTab === 'codex') renderCodex(body, k);
      else if (lastTab === 'mastery') renderMastery(body);
      else if (lastTab === 'rebirth') renderRebirth(body);
      else if (lastTab === 'weekly') renderWeekly(body);
      else renderCrew(body);
    } catch (e) { console.warn('[record]', e); body.appendChild(mk('div', 'rec-bad', 'Error: ' + e.message)); }
    const foot = mk('div', 'rec-foot');
    foot.append(mk('div', 'rec-d', '[J] / [ESC]'), btn(L('Close'), () => { sfx(); onClose?.(); }));
    root.appendChild(foot);
  };

  // ---------------------------------------------------------------- CODEX
  function renderCodex(body, k) {
    const top = mk('div', 'rec-row');
    top.append(mk('span', 'rec-gold', `${k.pct}%`), bar(k.pct / 100));
    body.appendChild(top);
    const subs = mk('div', 'rec-row');
    const subList = [['bestiary', `${L('Bestiary')} ${k.seen}/${k.seenTotal}`], ['scrap', `${L('Scrap')} ${k.scrapFound}/${k.scrapTotal}`], ['moons', `${L('Moons')} ${k.moons}`],
      ['interiors', `${L('Interiors')} ${k.interiors}/${k.interiorTotal}`], ['events', `${L('Events')} ${k.events}/${k.eventTotal}`], ['emotes', L('Emotes')],
      ['milestones', `${L('Milestones')} ${MILESTONES.filter((m) => p.codex.claimed[m.id]).length}/${MILESTONES.length}`]];
    for (const [id, label] of subList) {
      const c = mk('span', 'rec-chip' + (lastSub === id ? ' sel' : ''), label);
      c.addEventListener('click', (e) => { e.stopPropagation(); lastSub = id; sfx(); render(); });
      subs.appendChild(c);
    }
    body.appendChild(subs);
    const grid = mk('div', 'rec-grid');
    body.appendChild(grid);
    if (lastSub === 'bestiary') {
      const ids = bestiaryIds().sort((a, b) => (CREATURES[a].hazard ? 1 : 0) - (CREATURES[b].hazard ? 1 : 0));
      for (const id of ids) {
        const d = CREATURES[id], e = p.bestiary[id];
        const on = !!e?.seen;
        grid.appendChild(card(on, CREATURE_ICONS[id] || (d.boss ? '👹' : '👾'), on ? d.name : '???', d.hazard ? _t('HAZARD') : (d.boss ? _t('BOSS') : (on ? `${e.kills || 0} ${L('kills')}` : '')), on
          ? [['rec-d', _t(d.lore || '')], ['rec-note', FIELD_NOTES[id] ? '▸ ' + _t(FIELD_NOTES[id]) : '']]
          : [['rec-d', L('Not yet encountered')]]));
      }
    } else if (lastSub === 'scrap') {
      const ids = scrapIds().sort((a, b) => (ITEMS[a].name || a).localeCompare(ITEMS[b].name || b));
      for (const id of ids) {
        const e = p.codex.scrap[id];
        const on = (e?.n || 0) > 0;
        let ic = '📦';
        try { ic = iconImg(id); } catch { /* icons unavailable */ }
        grid.appendChild(card(on, ic, on ? ITEMS[id].name : '???', on ? `x${e.n}` : '', on ? [['rec-d', `${L('best')}: ▮${fmt(e.best)}`]] : [['rec-d', ITEMS[id].kind === 'big' ? _t('Large valuable') : ITEMS[id].kind === 'fish' ? _t('Catch of the day') : '']]));
      }
    } else if (lastSub === 'moons') {
      const ids = Object.keys(p.codex.moons).sort((a, b) => (p.codex.moons[b].n || 0) - (p.codex.moons[a].n || 0));
      if (!ids.length) grid.appendChild(mk('div', 'rec-d', _t('Land somewhere first.')));
      for (const id of ids) {
        const e = p.codex.moons[id], m = MOONS[id];
        grid.appendChild(card(true, m?.company ? '🏢' : '🪐', e.name || m?.name || id, m ? (m.company ? 'HQ' : 'T' + (m.tier ?? '?')) : 'GENERATED', [['rec-d', `${e.n || 0} ${L('visits')}${e.biome ? ' · ' + e.biome : ''}`], ['rec-note', m?.desc || '']]));
      }
      const base = Object.keys(MOONS).filter((id) => !p.codex.moons[id]);
      for (const id of base) grid.appendChild(card(false, '🪐', '???', MOONS[id].company ? 'HQ' : 'T' + MOONS[id].tier, [['rec-d', 'Uncharted']]));
    } else if (lastSub === 'interiors') {
      const ids = new Set(['factory', 'mansion', 'mineshaft', ...Object.keys(p.codex.interiors)]);
      for (const id of ids) {
        const e = p.codex.interiors[id];
        grid.appendChild(card(!!e, '🏚️', e ? interiorName(id) : '???', e ? `x${e.n}` : '', [['rec-d', e ? _tf('First explored {d}', { d: e.at ? new Date(e.at).toISOString().slice(0, 10) : _t('long ago') }) : _t('Unexplored interior')]]));
      }
    } else if (lastSub === 'events') {
      for (const ev of DAILY_EVENTS) {
        const n = p.codex.events[ev.id] || 0;
        const nm = (tr() ? ev.tr?.[0] : null) || t(ev.name), ds = (tr() ? ev.tr?.[1] : null) || t(ev.desc);
        const c = card(n > 0, n > 0 ? '📅' : '❔', n > 0 ? nm : '???', n > 0 ? `x${n}` : '', n > 0 ? [['rec-d', ds], ['rec-note', eventEffects(ev).join(' · ')]] : [['rec-d', 'Not yet experienced']]);
        if (n > 0) c.style.borderLeft = `3px solid ${MOOD_COLOR[ev.mood] || '#ffd23f'}`;
        grid.appendChild(c);
      }
    } else if (lastSub === 'emotes') {
      for (const e of EMOTES.filter((x) => LOCKED_EMOTES.includes(x.id))) {
        const on = isEmoteUnlocked(p, e.id);
        grid.appendChild(card(on, e.icon, e.name, on ? L('Unlocked') : L('Locked'), [['rec-d', on ? _t('Hold B to use it.') : _tf('Unlock: {x}', { x: e.lock })]]));
      }
    } else {
      for (const m of MILESTONES) {
        const got = !!p.codex.claimed[m.id];
        const target = milestoneTarget(m, k);
        const have = Math.min(m.get(k), target);
        const c = card(got, got ? '🏆' : '🔒', m.name, m.cat.toUpperCase(), [['rec-d', `${fmt(have)} / ${fmt(target)}`], ['rec-note', rewardLine(m.reward)]]);
        if (!got) c.querySelector('.rec-cb').appendChild(bar(target ? have / target : 0));
        grid.appendChild(c);
      }
    }
  }

  // ---------------------------------------------------------------- MASTERY
  function renderMastery(body) {
    body.appendChild(mk('div', 'rec-d', `${L('Skill points')}: ${p.skillPoints} · Mastery ${masterySpent(p)}/${MASTERY_POINTS_TOTAL} · Mastery is permanent (kept through Rebirth). Base skills live on the TAB sheet.`));
    const cols = mk('div', 'rec-cols');
    for (const t of MASTERY_TIERS) {
      const below = masterySpent(p, t.tier);
      const open = ((p.level || 1) >= t.minLevel || prestigeStars(p) > 0) && below >= t.need;
      const col = mk('div', 'rec-tier' + (open ? '' : ' locked'));
      col.appendChild(mk('div', 'rec-h', `${t.name} · ${_tf('Lv.{n}', { n: t.minLevel })}${t.need ? ' · ' + _tf('{n} pts below', { n: t.need }) : ''}`));
      for (const [id, m] of Object.entries(MASTERY)) {
        if (m.tier !== t.tier) continue;
        const r = masteryRank(p, id);
        const block = masteryBlock(p, id);
        const node = mk('div', 'rec-node');
        const info = mk('div', 'rec-cb');
        const nm = mk('div', 'rec-n', `${m.icon} ${(tr() ? m.tr : null) || _t(m.name)}`);
        info.append(nm, mk('div', 'rec-pips', '■'.repeat(r) + '□'.repeat(m.max - r)), mk('div', 'rec-d', (tr() ? m.trDesc : null) || _t(m.desc)));
        const plus = btn(block ? (block === 'MAX' ? 'MAX' : '+') : '+', () => {
          let ok = false;
          if (game?.progress) ok = game.progress.allocateMastery(id);
          else if (!masteryBlock(p, id)) { p.mastery[id] = r + 1; p.skillPoints -= 1; ok = true; save(); }
          sfx(ok ? 'ui_confirm' : 'ui_error', 0.5);
          render();
        }, block ? 'dis' : '');
        if (block && block !== 'MAX') plus.title = block;
        node.append(info, plus);
        if (block && block !== 'MAX' && block !== 'no points') node.appendChild(mk('div', 'rec-t', block));
        col.appendChild(node);
      }
      cols.appendChild(col);
    }
    body.appendChild(cols);
  }

  // ---------------------------------------------------------------- REBIRTH
  function renderRebirth(body) {
    const s = prestigeStars(p);
    const stars = mk('div', 'rec-stars');
    const shown = Math.max(5, Math.min(20, s + 1));
    for (let i = 0; i < shown; i++) { const sp = mk('span', i < s ? '' : 'dim', '★'); stars.appendChild(sp); }
    body.appendChild(stars);
    const cur = prestigeBonus(s), next = prestigeBonus(s + 1);
    body.appendChild(mk('div', 'rec-d', `Current: +${Math.round(cur.xpPct * 100)}% XP · +${Math.round(cur.coinPct * 100)}% Followers · +${cur.maxHp} max HP · +${Math.round(cur.staminaPct * 100)}% stamina`));
    if (s < STAR_BONUS_CAP) body.appendChild(mk('div', 'rec-good', `Next star: +${Math.round(next.xpPct * 100)}% XP · +${Math.round(next.coinPct * 100)}% Followers · +${next.maxHp} max HP`));
    body.appendChild(mk('div', 'rec-h', _t('STAR REWARDS')));
    const grid = mk('div', 'rec-grid');
    for (const r of STAR_REWARDS) grid.appendChild(card(s >= r.stars, '★', `★${r.stars}`, s >= r.stars ? L('Unlocked') : '', [['rec-d', rewardLine(r)]]));
    body.appendChild(grid);
    body.appendChild(mk('div', 'rec-h', L('REBIRTH')));
    const pv = rebirthPreview(p);
    body.appendChild(mk('div', 'rec-d', `Requires Lv.${REBIRTH_LEVEL} (you: Lv.${p.level}/${MAX_LEVEL}). You go back to level 1; base skills reset (${pv.spent} spent → ${pv.keep} refunded + ${pv.extra} bonus points; unspent points kept). KEPT: Mastery, gear, Followers, cosmetics, titles, achievements, Codex.`));
    let armed = false;
    const b = btn(L('Rebirth now') + ` → ★${pv.stars}`, () => {
      if (!canRebirth(p)) return;
      if (!armed) { armed = true; b.textContent = L('Confirm rebirth?') + ` (${pv.points} pts)`; b.classList.add('danger'); sfx('ui_hover', 0.6); setTimeout(() => { if (armed && b.isConnected) { armed = false; b.textContent = L('Rebirth now') + ` → ★${pv.stars}`; b.classList.remove('danger'); } }, 4000); return; }
      armed = false;
      if (game?.meta?.rebirth) game.meta.rebirth();
      else if (applyRebirth(p)) saveProfile(p);
      render();
    }, 'big' + (canRebirth(p) ? '' : ' dis'));
    body.appendChild(mk('div', 'rec-row')).appendChild(b);
    if (p.prestige?.history?.length) body.appendChild(mk('div', 'rec-note', 'History: ' + p.prestige.history.slice(-6).map((h, i) => `★${p.prestige.history.length - Math.min(6, p.prestige.history.length) + i + 1} @Lv.${h.level} ${new Date(h.at).toISOString().slice(0, 10)}`).join(' · ')));
  }

  // ---------------------------------------------------------------- WEEKLY
  function renderWeekly(body) {
    const wk = isoWeek();
    const run = game?.run;
    const active = run?.weekly;
    const spec = active ? { key: active.key, mods: active.mods, featured: active.featured } : weeklySpec(wk.key);
    const left = Math.max(0, wk.endsAt - Date.now());
    body.appendChild(mk('div', 'rec-h', _tf('WEEK {k} · resets in {d}d {h}h', { k: spec.key, d: Math.floor(left / 86400000), h: Math.floor((left % 86400000) / 3600000) })));
    for (const m of weeklyMods(spec.mods)) {
      const r = mk('div', 'rec-mod');
      r.style.borderLeftColor = MOOD_COLOR[m.mood] || '#ffd23f';
      r.append(mk('div', 'rec-n', m.name), mk('div', 'rec-d', m.desc));
      body.appendChild(r);
    }
    if (spec.featured) body.appendChild(mk('div', 'rec-gold', `Featured moon: ${MOONS[spec.featured]?.name || spec.featured} (+25% scrap)`));
    body.appendChild(mk('div', 'rec-d', _t('Every crew gets the SAME facility for the same day + moon this week. Score = scrap sold before you get deplatformed.')));
    if (active) body.appendChild(mk('div', 'rec-good', _tf('THIS RUN IS THE WEEKLY CHALLENGE · score ▮{s} · quotas {q}', { s: fmt(active.score), q: active.quotas || 0 }) + (active.fin ? ' · ' + _t('FINAL') : '')));
    else if (game?.meta?.weekly) {
      const why = game.meta.weekly.startBlock();
      const row = mk('div', 'rec-row');
      row.appendChild(btn(L('Start Weekly Challenge'), () => { game.meta.weekly.requestStart(); sfx('ui_confirm', 0.6); setTimeout(render, 300); }, why ? 'dis' : ''));
      if (why) row.appendChild(mk('span', 'rec-d', why));
      body.appendChild(row);
    } else body.appendChild(mk('div', 'rec-d', _t('Host a game and type WEEKLY START in the ship terminal (fresh run only).')));
    body.appendChild(mk('div', 'rec-h', L('Leaderboard') + ` · ${spec.key}`));
    const list = p.weekly.boards[spec.key] || [];
    if (!list.length) body.appendChild(mk('div', 'rec-d', L('No runs yet this week.')));
    else {
      const t = mk('table', 'rec-table');
      const hr = mk('tr');
      for (const h of ['#', 'CREW', 'PLAYERS', 'SCORE', 'QUOTAS', 'DAYS']) hr.appendChild(mk('th', '', h));
      t.appendChild(hr);
      list.forEach((e, i) => {
        const tr_ = mk('tr', e.names.includes(p.name) ? 'me' : '');
        for (const v of [i + 1, e.crew || '-', e.names.join(', '), '▮' + fmt(e.score) + (e.fin ? '' : ' …'), e.quotas, e.days]) tr_.appendChild(mk('td', '', v));
        t.appendChild(tr_);
      });
      body.appendChild(t);
    }
    const best = p.weekly.best[spec.key] || 0;
    body.appendChild(mk('div', 'rec-note', `Personal best this week: ▮${fmt(best)} · weekly runs finished: ${p.weekly.runs || 0}`));
  }

  // ---------------------------------------------------------------- CREW
  function renderCrew(body) {
    const shared = game?.run?.crew;
    const own = publicCrew(p.crew);
    const c = shared || own;
    const isOwner = !game || !game.net || game.isHost;
    body.appendChild(mk('div', 'rec-stars')).textContent = `[${c.tag}]`;
    body.appendChild(mk('div', 'rec-n', c.name));
    const lv = crewLevelOf(c.xp);
    const row = mk('div', 'rec-row');
    row.append(mk('span', 'rec-gold', _tf('Crew Lv.{n}', { n: lv.level })), bar(lv.need ? lv.into / lv.need : 1), mk('span', 'rec-d', `${fmt(lv.into)}/${fmt(lv.need)}`));
    body.appendChild(row);
    body.appendChild(mk('div', 'rec-d', `Perk: every member earns +${Math.min(25, lv.level > 1 ? lv.level : 0)}% XP in this crew's sessions. Crew XP: days survived, scrap sold, quotas met (host sessions). Crew Lv.5 unlocks the "Rally the Crew" emote for members.`));
    if (shared && !isOwner) body.appendChild(mk('div', 'rec-note', `You are playing in the host's crew. Your own crew: [${own.tag}] ${own.name} (Lv.${own.level}) - it shows when you host.`));
    if (isOwner) {
      body.appendChild(mk('div', 'rec-h', _t('RENAME')));
      const nameIn = mk('input', 'rec-in'); nameIn.value = p.crew.name; nameIn.maxLength = 24;
      const tagIn = mk('input', 'rec-in'); tagIn.value = p.crew.tag; tagIn.maxLength = 4; tagIn.style.width = '80px';
      for (const i of [nameIn, tagIn]) i.addEventListener('keydown', (e) => e.stopPropagation());
      const msg = mk('span', 'rec-d', '');
      const r2 = mk('div', 'rec-row');
      r2.append(nameIn, tagIn, btn(L('Save'), () => {
        let why = '';
        if (game?.meta?.crew) why = game.meta.crew.rename(nameIn.value, tagIn.value);
        else { const n = nameIn.value.trim(); if (n.length >= 3) { p.crew.name = n.slice(0, 24); p.crew.tag = tagIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || p.crew.tag; ensureCrewProfile(p); saveProfile(p); } else why = 'Crew name: 3-24 characters.'; }
        msg.textContent = why || 'Saved.'; msg.className = why ? 'rec-bad' : 'rec-good';
        sfx(why ? 'ui_error' : 'ui_confirm', 0.5);
        if (!why) setTimeout(render, 500);
      }), msg);
      body.appendChild(r2);
      body.appendChild(mk('div', 'rec-h', _tf('{m} ({n}) · days {d} · quotas {q}', { m: L('Members'), n: Object.keys(p.crew.members).length, d: p.crew.days || 0, q: p.crew.quotas || 0 })));
      const grid = mk('div', 'rec-grid');
      const mem = Object.values(p.crew.members).sort((a, b) => (b.days || 0) - (a.days || 0)).slice(0, 24);
      if (!mem.length) grid.appendChild(mk('div', 'rec-d', _t('Survive a day with your crew to fill the roster.')));
      for (const m of mem) grid.appendChild(card(true, '👤', m.name || '?', `${m.days || 0}d`, [['rec-d', m.last ? 'last seen ' + new Date(m.last).toISOString().slice(0, 10) : '']]));
      body.appendChild(grid);
    }
  }

  render();
  return { el: root, refresh: render };
}
