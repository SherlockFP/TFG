// META LAYER installer + REBIRTH (prestige) actions.
//
// installMeta(game) wires the whole "never-ending" layer onto a Game and returns one handle (game.meta):
//   events     daily-event runtime (dailyEvents.js: stat layer + host effects)
//   collection CODEX tracking + milestones (collection.js)
//   weekly     weekly challenge seed / mutators / lobby leaderboard (weekly.js)
//   crew       crew identity + crew XP (crew.js)
//   open(tab) / toggle(tab)   SERVICE RECORD panel (ui/panels/record.js), also on the J key
//   rebirth()  Rebirth with star rewards + banner
// Terminal commands (instance wrap of game.terminal.exec, listed under HELP): CODEX, EVENTS, WEEKLY [START],
// REBIRTH [CONFIRM], MASTERY, CREWNAME <name>, CREWTAG <tag>, RECORD.
import { ensureMetaProfile } from './profile.js';
import {
  STAR_REWARDS, prestigeStars, canRebirth, rebirthPreview, REBIRTH_LEVEL, MAX_LEVEL, MASTERY, masteryRank, masteryBlock,
} from './progression.js';
import { installCollection, rewardLine, codexCounts } from './collection.js';
import { installWeekly, isoWeek, weeklySpec, weeklyMods } from './weekly.js';
import { installCrew, publicCrew } from './crew.js';
import { installDailyEvents, DAILY_EVENTS, eventEffects, wrapMethod } from './dailyEvents.js';
import { unlockEmote } from './emotes.js';
import { MOONS } from './moons.js';
import { createServiceRecord } from '../ui/panels/record.js';
import { t, tf, t as _t } from '../core/i18n.js';

export const RECORD_KEY = 'KeyJ';

/** Grant every STAR_REWARDS entry the profile has reached but not claimed yet (idempotent). */
export function grantStarRewards(game, announce = true) {
  const p = game.profile;
  const pr = p.prestige || (p.prestige = { stars: 0, history: [] });
  if (!pr.claimed || typeof pr.claimed !== 'object') pr.claimed = {};
  const stars = prestigeStars(p);
  let any = false;
  for (const r of STAR_REWARDS) {
    if (stars < r.stars || pr.claimed[r.stars]) continue;
    pr.claimed[r.stars] = Date.now();
    any = true;
    const ach = game.achievements;
    if (ach?.grant) ach.grant({ coin: r.coin || 0, title: r.title, cosmetic: r.cosmetic, fallbackCoin: 300 });
    else if (r.coin) game.progress?.addCoins(r.coin, 'Rebirth');
    if (r.emote) unlockEmote(p, r.emote);
    if (announce) {
      const item = { tier: 'kefal', icon: '★', kicker: `REBIRTH REWARD · ★${r.stars}`, name: r.title || `${r.stars} stars`, desc: 'Permanent. Check J → REBIRTH.', reward: rewardLine(r) };
      if (ach?.banner) ach.banner(item); else game.ui?.toast?.(`★${r.stars}: ${item.reward}`, 'good');
    }
  }
  if (any) game.progress?.save();
  return any;
}

export function installMeta(game) {
  const p = ensureMetaProfile(game.profile);
  const st = { disposed: false, started: false };
  const offs = [];
  const restores = [];
  const safe = (label, fn) => { try { return fn(); } catch (e) { console.warn('[meta]', label, e); return null; } };

  const events = safe('events', () => installDailyEvents(game));
  const collection = safe('collection', () => installCollection(game));
  const weekly = safe('weekly', () => installWeekly(game));
  const crew = safe('crew', () => installCrew(game));

  // ---------------------------------------------------------------- panel + J key
  let panelEl = null;
  function open(tab) {
    const ui = game.ui;
    if (!ui?.openPanel || typeof document === 'undefined') return null;
    const rec = createServiceRecord({ game, profile: p, tab, onClose: () => ui.closePanel() });
    panelEl = rec.el;
    ui.openPanel(rec.el);
    game.audio?.ui?.('ui_click', 0.5);
    return rec;
  }
  function toggle(tab) {
    const ui = game.ui;
    if (panelEl && ui?.panelOpen === panelEl) { ui.closePanel(); panelEl = null; return; }
    open(tab);
  }
  const onKey = (e) => {
    if (e.code !== RECORD_KEY || e.repeat || st.disposed || game.destroyed || !game.run) return;
    if (game.input?.isTyping?.() || game.minigame || game.terminal?.active || game.ui?.chatOpen) return;
    const ui = game.ui;
    if (ui?.panelOpen && ui.panelOpen !== panelEl) return;           // another panel (pause, market, TAB) owns the screen
    e.preventDefault();
    toggle();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- rebirth
  function rebirth() {
    if (!canRebirth(p)) return null;
    const res = game.progress?.rebirth();
    if (!res) return null;
    const s = prestigeStars(p);
    game.achievements?.banner?.({ tier: 'kefal', icon: '🌟', kicker: 'REBIRTH', name: `★${s} — Welcome back, Lv.1`, desc: 'Permanent bonuses applied. Mastery, gear and Clout were kept.', reward: `${p.skillPoints} skill points ready` });
    grantStarRewards(game);
    game.net?.broadcast?.('chat', { text: `★ ${p.name} has been REBORN (★${s})!`, n: 'TFG' });
    game.engine?.flash?.(0xffe08a, 0.6);
    game.engine?.shake?.(0.4);
    return res;
  }

  // ---------------------------------------------------------------- terminal commands
  const HELP = [
    '', 'SERVICE RECORD:',
    '>CODEX        collection log summary (full view: J)',
    '>EVENTS       today\'s daily event + every event',
    '>WEEKLY       weekly challenge (>WEEKLY START on a fresh run)',
    '>REBIRTH      prestige status (>REBIRTH CONFIRM)',
    '>MASTERY      mastery tree ranks',
    '>CREWNAME <n> / >CREWTAG <t>  rename your crew (host)',
    '>RECORD       open the Service Record',
  ];
  function termExec(t, cmd) {
    const [w0, ...rest] = String(cmd).trim().split(/\s+/);
    const w = (w0 || '').toLowerCase();
    const arg = rest.join(' ');
    const run = game.run || {};
    if (w === 'events' && game.mods?.commands?.has?.('events')) return false;   // optional brutal-events mod owns EVENTS when enabled (EVENT still lists daily events)
    switch (w) {
      case 'codex': {
        const k = codexCounts(p);
        t.print([
          `CODEX ${k.pct}% COMPLETE`,
          `  Bestiary   ${k.seen}/${k.seenTotal}  (killed ${k.killedTypes}/${k.creatureTotal} types)`,
          `  Scrap      ${k.scrapFound}/${k.scrapTotal}  (best find ▮${k.best})`,
          `  Moons      ${k.moons} visited (${k.baseVisited}/${k.baseMoonTotal} charted sector moons)`,
          `  Interiors  ${k.interiors}/${k.interiorTotal}`,
          `  Events     ${k.events}/${k.eventTotal}`,
          'Press J (outside the terminal) for entries, lore and milestones.',
        ].join('\n'));
        return true;
      }
      case 'events': case 'event': {
        const out = [];
        const ev = run.dailyEvent;
        if (ev) out.push(`LAST ROLL: ${ev.name}`, `  ${ev.desc}`, `  ${eventEffects(ev).join(' · ')}`, '');
        out.push('Events roll on every landing (moon + day + seed). Seen: ' + DAILY_EVENTS.filter((e) => p.codex?.events?.[e.id]).length + '/' + DAILY_EVENTS.length);
        for (const e of DAILY_EVENTS) out.push(`${p.codex?.events?.[e.id] ? '*' : ' '} ${e.name.padEnd(20)} ${eventEffects(e).slice(0, 3).join(', ')}`);
        t.print(out.join('\n'));
        return true;
      }
      case 'weekly': {
        if (!weekly) { t.print(_t('Weekly challenge unavailable.'), 'err'); return true; }
        if (/^start/i.test(arg)) {
          const why = weekly.startBlock();
          if (why) t.print(why, 'err');
          else { weekly.requestStart(); t.print(_t('Weekly Challenge requested...')); }
          return true;
        }
        const w = run.weekly;
        const spec = w ? { key: w.key, mods: w.mods, featured: w.featured } : weeklySpec(isoWeek().key);
        const out = [`WEEKLY CHALLENGE ${spec.key}${w ? '  [ACTIVE ON THIS RUN]' : ''}`];
        for (const m of weeklyMods(spec.mods)) out.push(`  + ${m.name}: ${m.desc}`);
        if (spec.featured) out.push(`  Featured moon: ${MOONS[spec.featured]?.name || spec.featured} (+25% scrap)`);
        if (w) out.push(`  Score ▮${w.score || 0} · quotas ${w.quotas || 0}`);
        else out.push('  >WEEKLY START (host, fresh run) to play it. Same seed for everyone this week.');
        const board = weekly.board(spec.key).slice(0, 5);
        out.push('', 'LEADERBOARD:');
        if (!board.length) out.push('  (empty)');
        board.forEach((e, i) => out.push(`  ${i + 1}. ▮${String(e.score).padEnd(7)} ${e.crew || '-'} (${e.names.join(', ')}) Q${e.quotas}`));
        t.print(out.join('\n'));
        return true;
      }
      case 'rebirth': case 'prestige': {
        if (/^confirm/i.test(arg)) {
          if (!canRebirth(p)) { t.print(tf('Rebirth needs level {REBIRTH_LEVEL}. You are Lv.{level}.', { REBIRTH_LEVEL, level: p.level }), 'err'); return true; }
          const r = rebirth();
          t.print(r ? tf('REBORN. ★{prestigeStars}. {skillPoints} skill points ready.', { prestigeStars: prestigeStars(p), skillPoints: p.skillPoints }) : _t('Rebirth failed.'));
          return true;
        }
        const pv = rebirthPreview(p);
        t.print([
          `STARS: ${'★'.repeat(prestigeStars(p)) || '-'}  (Lv.${p.level}/${MAX_LEVEL})`,
          canRebirth(p) ? `Rebirth ready: → ★${pv.stars}, ${pv.points} skill points after reset. Type REBIRTH CONFIRM.` : `Rebirth unlocks at Lv.${REBIRTH_LEVEL}.`,
        ].join('\n'));
        return true;
      }
      case 'mastery': {
        const out = [`MASTERY (skill points: ${p.skillPoints})`];
        for (const [id, m] of Object.entries(MASTERY)) {
          const r = masteryRank(p, id), b = masteryBlock(p, id);
          out.push(`  T${m.tier} ${m.name.padEnd(14)} ${'■'.repeat(r)}${'□'.repeat(m.max - r)}  ${m.desc}${b && b !== 'no points' && b !== 'MAX' ? '  [' + b + ']' : ''}`);
        }
        out.push('Spend points in the Service Record (J → MASTERY).');
        t.print(out.join('\n'));
        return true;
      }
      case 'crewname': case 'crewtag': {
        if (!crew) { t.print(_t('Crew unavailable.'), 'err'); return true; }
        if (!arg) { const c = publicCrew(crew.crew); t.print(tf('Your crew: [{tag}] {name} · Lv.{level}. Usage: {n} <{n2}>', { tag: c.tag, name: c.name, level: c.level, n: w.toUpperCase(), n2: w === 'crewname' ? 'name' : 'TAG' })); return true; }
        const why = w === 'crewname' ? crew.rename(arg) : crew.rename(undefined, arg);
        t.print(why || tf('Crew updated: [{tag}] {name}', { tag: crew.crew.tag, name: crew.crew.name }), why ? 'err' : '');
        return true;
      }
      case 'record': {
        t.close?.();
        setTimeout(() => open(), 50);
        return true;
      }
      default: return false;
    }
  }
  if (game.terminal) {
    restores.push(wrapMethod(game.terminal, 'exec', (orig) => function (cmd, ...a) {
      if (!st.disposed) {
        const w0 = String(cmd || '').trim().split(/\s+/)[0]?.toLowerCase();
        // pending CONFIRM/DENY for a store/route prompt always goes to the terminal itself
        if (!(this.pending && /^(c|y|n|d|confirm|deny|yes|no)$/.test(w0))) {
          try { if (termExec(this, cmd)) { this.pending = null; return; } } catch (e) { console.warn('[meta] terminal', e); }
        }
      }
      const r = orig.call(this, cmd, ...a);
      if (!st.disposed && /^(help|\?)$/i.test(String(cmd || '').trim())) this.print(HELP.join('\n'));
      return r;
    }));
  }

  // ---------------------------------------------------------------- session start: old stars get their rewards
  if (game.mods?.on) {
    offs.push(game.mods.on('update', (dt, g) => {
      if ((g && g !== game) || st.disposed || st.started || !game.run) return;
      st.started = true;
      grantStarRewards(game, true);
    }));
  }

  function dispose() {
    if (st.disposed) return;
    st.disposed = true;
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
    for (const o of offs) { try { o?.(); } catch { /* ignore */ } }
    for (const r of restores) { try { r(); } catch { /* ignore */ } }
    for (const m of [crew, weekly, collection, events]) { try { m?.dispose(); } catch (e) { console.warn('[meta] dispose', e); } }
    if (panelEl && game.ui?.panelOpen === panelEl) game.ui.closePanel(true);
    panelEl = null;
  }

  return { events, collection, weekly, crew, open, toggle, rebirth, dispose, get profile() { return p; } };
}
