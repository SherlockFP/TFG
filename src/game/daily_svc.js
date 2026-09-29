// DAILY service (wave 4): glue between the pure rules (daily_core.js) and the game / menu. One object per profile, usable in the main menu
// (game = null: rewards are applied straight to the saved profile) and in a session (game = Game: rewards go through Progress so the HUD
// shows XP feed, level-up fanfare and so on). Used by the panel (ui/panels/daily.js) and by the in-game module (daily.js).
import * as C from './daily_core.js';
import { ITEMS } from './items.js';
import { TIERS } from './tiers.js';
import { SLOTS, entriesFor, colourSuits, grant as grantCosmetic, owns as ownsCosmetic, ensureWardrobeProfile } from './cosmetics.js';
import { ensureMetaProfile } from './profile.js';
import { saveProfile } from '../core/save.js';
import { RNG } from '../core/rng.js';
import { t, tf } from '../core/i18n.js';

const SLOT_NAME = { suit: 'Suit', hat: 'Hat', face: 'Face', back: 'Back' };
const NOT_CRATE = new Set(['venom', 'none']);

/** Crate-eligible cosmetics: everything earnable / buyable except secret ones and the Symbiote. */
export function cosmeticCatalog() {
  const out = [];
  for (const e of colourSuits()) out.push(e);
  for (const s of SLOTS) for (const e of entriesFor(s)) out.push(e);
  return out.filter((e) => e && !e.secret && !NOT_CRATE.has(e.id));
}
/** Host side whitelist for delivered items: crafting components (no key items) and forge shards. */
export function deliverableId(id) {
  const d = ITEMS[id];
  return !!d && !d.keyItem && (id.startsWith('shard_') || id.startsWith('comp_') || C.crateItemIds().includes(id));
}
const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : id);

export function createDailyService({ profile, game = null, ui = null, audio = null }) {
  const P = profile;
  const listeners = new Set();
  const svc = {
    profile: P, game,
    now: () => Date.now(),
    state: () => C.ensureDaily(P),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    changed() { for (const fn of [...listeners]) { try { fn(); } catch (e) { console.warn('[daily] listener', e); } } },
    save() { if (game?.progress?.save) game.progress.save(); else saveProfile(P); },
    toast(text, kind = 'info') { try { (game?.ui || ui)?.toast?.(text, kind); } catch { /* ui optional */ } },
    sfx(name, vol = 0.6, pitch = 1) { try { const a = game?.audio || audio; if (a?.has?.(name)) a.play(name, { volume: vol, bus: 'ui', pitch }); } catch { /* audio optional */ } },
    reduceMotion: () => !!(game?.settings?.reduceMotion ?? ui?.app?.settings?.reduceMotion),

    // ------------------------------------------------------------ hooks for applyReward
    hooks: {
      addCoins(n, why) { if (game?.progress?.addCoins) game.progress.addCoins(n, why); else P.coins = (P.coins || 0) + n; },
      addXp(n, why) {
        if (game?.progress?.addXp) game.progress.addXp(n, why);
        else { P.xp = (P.xp || 0) + n; ensureMetaProfile(P); }
      },
      grantCosmetic(slot, id) {
        ensureWardrobeProfile(P);
        const fresh = grantCosmetic(P, slot, id);
        if (fresh) { try { game?.cosmetics?.refresh?.(); } catch { /* ignore */ } }
        return fresh;
      },
    },

    // ------------------------------------------------------------ views
    login() { return C.loginStatus(P); },
    quests() { const d = C.ensureQuests(P); return { daily: d.q.list, weekly: d.w.list, rerolled: d.q.rerolled, day: d.q.day, week: d.w.week, weekDays: C.daysLeftInWeek(d.q.day) }; },
    season() { return C.seasonInfo(P); },
    crates() { return C.ensureDaily(P).crates.slice(); },
    stash() { return C.stashList(P); },
    attention() { return C.attention(P); },
    /** True when the menu / HUD should show a NEW! marker. */
    hasNew() { return C.attention(P).total > 0; },
    questText(q) {
      const tpl = C.questTemplate(q.id);
      return tpl ? tf(tpl.text, { n: tpl.n }) : q.id;
    },
    questTarget: (q) => C.questTemplate(q.id)?.n || 1,
    questReward(q, level = P.level) {
      const tpl = C.questTemplate(q.id);
      const b = tpl && C.QUEST_REWARD[tpl.diff];
      if (!b) return null;
      return { coin: b.coin, xp: Math.round(b.xp * C.xpScale(level)), sxp: b.sxp, items: b.items || [] };
    },
    itemName,
    itemsText(items) { return (items || []).map(([id, n]) => `${itemName(id)} x${n}`).join(', '); },

    // ------------------------------------------------------------ actions
    /** Season-tier rollover: collect earned but unclaimed tiers of the previous month (gentle, nothing is lost). */
    settleSeason() {
      const r = C.ensureSeason(P);
      if (!r.rolled) return null;
      let coin = 0, crates = 0;
      for (const tr of r.rolled.tiers) {
        const rw = C.seasonReward(tr);
        const out = C.applyReward(P, rw, svc.hooks, 'Season');
        coin += out.coin; if (out.crate) crates++;
      }
      svc.save();
      svc.toast(tf('Last season ended: {n} unclaimed tiers were collected for you (+{coin} Clout, {crates} crates).', { n: r.rolled.tiers.length, coin, crates }), 'good');
      svc.changed();
      return r.rolled;
    },
    claimLogin() {
      svc.settleSeason();
      const r = C.claimLogin(P);
      if (!r.ok) return r;
      const out = C.applyReward(P, r.reward, svc.hooks, 'Daily login');
      // keep the achievement counters (Loyal Employee / hat unlock rules) in step with the new calendar
      if (!P.login || typeof P.login !== 'object') P.login = { day: -1, streak: 0, best: 0, total: 0 };
      const d = C.ensureDaily(P).login;
      Object.assign(P.login, { day: Math.floor(Date.now() / 86400000), streak: d.streak, best: Math.max(P.login.best || 0, d.best), total: Math.max(P.login.total || 0, d.total) });
      svc.save();
      svc.sfx(r.reward.crate ? 'level_up_jingle' : 'ui_buy', 0.7);
      svc.changed();
      return { ...r, out };
    },
    claimQuest(scope, index) {
      const r = C.claimQuest(P, scope, index, P.level);
      if (!r.ok) return r;
      const out = C.applyReward(P, r.reward, svc.hooks, scope === 'week' ? 'Weekly challenge' : 'Daily challenge');
      svc.save(); svc.sfx('ui_buy', 0.6); svc.changed();
      return { ...r, out };
    },
    reroll(slot) {
      const r = C.rerollDaily(P, slot);
      if (r.ok) { svc.save(); svc.sfx('ui_confirm', 0.5); svc.changed(); }
      return r;
    },
    claimSeason(tier) {
      const r = C.claimSeasonTier(P, tier);
      if (!r.ok) return r;
      const out = C.applyReward(P, { ...r.reward, sxp: 0 }, svc.hooks, 'Season');
      svc.save(); svc.sfx('ui_buy', 0.6); svc.changed();
      return { ...r, out };
    },
    claimAllSeason() {
      const info = C.seasonInfo(P);
      const outs = [];
      for (const tr of info.claimable) { const r = svc.claimSeason(tr); if (r.ok) outs.push(r); }
      return outs;
    },
    /** Roll + apply a crate immediately (the reveal is only theatre). Returns { crate, result, out, describe }. */
    openCrate(id) {
      const o = C.openCrate(P, id, { catalog: cosmeticCatalog(), owns: (slot, cid) => ownsCosmetic(P, slot, cid) || (slot === 'hat' && cid === 'none') });
      if (!o.ok) return o;
      const out = C.applyCrateResult(P, o.result, svc.hooks);
      svc.save(); svc.changed();
      return { ...o, out, view: svc.describe(o.result), tier: o.result.tier };
    },
    /** Display data of a crate result. */
    describe(res) {
      const td = TIERS[res.tier] || TIERS.common;
      if (res.kind === 'cosmetic') return { title: t(res.name), sub: `${t(SLOT_NAME[res.slot] || res.slot)} · ${t(td.name)}`, tier: res.tier, color: td.color, isNew: true, kicker: t('NEW COSMETIC') };
      if (res.kind === 'items') return { title: res.items.map(([id, n]) => `${t(itemName(id))} x${n}`).join(', '), sub: `${t('Delivered to your ship')} · ${t(td.name)}`, tier: res.tier, color: td.color, kicker: t('PARTS') };
      return { title: `◈ ${res.coin} ${t('Clout')}`, sub: res.dupe ? t('Duplicate protection: you own everything, so it turned into Clout') : t(td.name), tier: res.tier, color: td.color, kicker: res.dupe ? t('DUPLICATE') : t('CLOUT') };
    },
    /** Filler cards for the reel: [{ tier, title, sub }] (seeded so a reveal looks the same on every replay). */
    reelCards(crate, count, winner) {
      const rng = new RNG((crate.seed ^ 0x5eed1e) >>> 0);
      const cat = cosmeticCatalog();
      const def = C.crateDef(crate.kind);
      const items = C.crateItemIds();
      const out = [];
      for (let i = 0; i < count; i++) {
        const r = rng.next();
        if (r < 0.5 && cat.length) { const e = cat[rng.int(0, cat.length - 1)]; out.push({ tier: e.tier || 'common', title: t(e.name), sub: t(SLOT_NAME[e.slot] || e.slot) }); }
        else if (r < 0.8 && items.length) { const id = items[rng.int(0, items.length - 1)]; const tiers = Object.keys(TIERS); out.push({ tier: tiers[Math.min(tiers.length - 1, rng.int(0, 3))], title: t(itemName(id)), sub: t('Parts') }); }
        else out.push({ tier: ['common', 'common', 'uncommon', 'rare'][rng.int(0, 3)], title: `◈ ${rng.int(3, 90) * 10}`, sub: t('Clout') });
      }
      void def; void winner;
      return out;
    },
    crateName: (kind) => t(C.crateDef(kind).name),
    crateTag: (kind) => t(C.crateDef(kind).tag),
    /** Tiers the crate can roll, for the tooltip. */
    crateRange(c) {
      if (c.tier) return t((TIERS[c.tier] || TIERS.common).name);
      const d = C.crateDef(c.kind);
      return `${t(TIERS[d.minTier].name)} - ${t(TIERS[d.maxTier].name)}`;
    },
  };
  return svc;
}
