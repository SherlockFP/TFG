// Personal progression runtime: XP / levels / skill points / mastery / rebirth / coins / bounties / bestiary / stats.
import { saveProfile } from '../core/save.js';
import {
  xpForLevel, MAX_LEVEL, REBIRTH_LEVEL, rankOf, dailyBounties, SKILL_CAP, SKILLS, MASTERY, masteryBlock, masteryRank,
  applyRebirth, canRebirth, metaMultipliers, prestigeStars, migrateXpCurve,
} from './progression.js';
import { ROLES, NODE, TREE_VERSION, nodeCost, pruneState } from './passivetree.js';
import { CREATURES } from './creatures.js';
import { t, tf } from '../core/i18n.js';

// Rewards that are already "final" numbers: never multiplied by stars / mastery / events / crew.
const FLAT_REASONS = /^(Achievement|Daily|Season|Codex|Weekly|Rebirth|Bounty|Trade)/i;   // [trade] traded Clout is never multiplied
const CREW_XP_CAP = 25;       // crew level N gives +N% XP, capped

/**
 * Passive-tree state of a profile (profile.rpg, see passivetree.js). Idempotent. On the FIRST call for an old save the
 * six legacy base skills are refunded into skill points (r.migrated remembers the amount so the game can announce it) -
 * the tree now sells the same effects. Unknown / disconnected nodes (tree edits between versions) are refunded too.
 */
export function ensureRpgProfile(p) {
  if (!p) return p;
  const r = p.rpg && typeof p.rpg === 'object' && !Array.isArray(p.rpg) ? p.rpg : (p.rpg = {});
  if (!p.skills || typeof p.skills !== 'object' || Array.isArray(p.skills)) p.skills = {};
  if (typeof p.skillPoints !== 'number' || !isFinite(p.skillPoints)) p.skillPoints = 0;
  if (!r.v) {
    let refund = 0;
    for (const k of Object.keys(p.skills)) { refund += Math.max(0, Math.floor(Number(p.skills[k]) || 0)); p.skills[k] = 0; }
    for (const k of Object.keys(SKILLS)) if (p.skills[k] === undefined) p.skills[k] = 0;
    p.skillPoints += refund;
    r.v = TREE_VERSION;
    if (refund > 0) r.migrated = { skills: refund, at: Date.now(), shown: false };
  }
  if (!ROLES[r.role]) r.role = null;
  if (!Array.isArray(r.nodes)) r.nodes = [];
  if (!r.kit || typeof r.kit !== 'object' || Array.isArray(r.kit)) r.kit = {};
  const removed = pruneState(r);
  for (const id of removed) p.skillPoints += NODE[id] ? nodeCost(NODE[id]) : 1;
  return p;
}

/** Normalise the fields the meta layer adds to a profile (idempotent; old saves get defaults). */
export function ensureMetaProfile(p) {
  if (!p) return p;
  migrateXpCurve(p);   // before the meta fields exist (they mark round-3 saves); no-op when save.js already did it
  if (!p.prestige || typeof p.prestige !== 'object') p.prestige = { stars: 0, history: [], peak: 0 };
  if (!Array.isArray(p.prestige.history)) p.prestige.history = [];
  if (typeof p.prestige.stars !== 'number' || !isFinite(p.prestige.stars)) p.prestige.stars = 0;
  if (!p.mastery || typeof p.mastery !== 'object') p.mastery = {};
  if (!Array.isArray(p.emotes)) p.emotes = [];
  if (!p.skills || typeof p.skills !== 'object') p.skills = {};
  if (typeof p.skillPoints !== 'number' || !isFinite(p.skillPoints)) p.skillPoints = 0;
  if (typeof p.level !== 'number' || !isFinite(p.level) || p.level < 1) p.level = 1;
  if (typeof p.xp !== 'number' || !isFinite(p.xp) || p.xp < 0) p.xp = 0;
  p.level = Math.min(MAX_LEVEL, Math.floor(p.level));
  // safety net only: migrateXpCurve already scaled banked XP below the requirement, so nothing re-levels on load
  while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level += 1; p.skillPoints += 1; }
  if (p.level >= MAX_LEVEL) p.xp = Math.min(p.xp, xpForLevel(MAX_LEVEL));
  ensureRpgProfile(p);
  return p;
}

export class Progress {
  constructor(game, profile) {
    this.game = game;
    this.p = ensureMetaProfile(profile);
    this.saveT = null;
  }
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => saveProfile(this.p), 250);
  }
  /** Multiplier for gameplay XP right now: stars + mastery, day event (on the moon), crew level. */
  xpMultiplier() {
    const g = this.game, run = g.run;
    let m = metaMultipliers(this.p).xp;
    if (run?.phase === 'moon' && run.dailyEvent?.xpMul) m *= run.dailyEvent.xpMul;
    const cl = Math.max(0, Math.min(CREW_XP_CAP, Math.floor(run?.crew?.level || 0)));
    if (cl > 1) m *= 1 + cl * 0.01;
    return m;
  }
  coinMultiplier() {
    const run = this.game.run;
    let m = metaMultipliers(this.p).coin;
    if (run?.phase === 'moon' && run.dailyEvent?.coinMul) m *= run.dailyEvent.coinMul;
    return m;
  }
  addXp(xp, reason) {
    if (!xp) return;
    const p = this.p;
    const g = this.game;
    xp = Math.round(xp * (g.xpMul || 1) * (FLAT_REASONS.test(String(reason || '')) ? 1 : this.xpMultiplier()));
    if (p.level >= MAX_LEVEL) {
      p.xp = Math.min(xpForLevel(MAX_LEVEL), p.xp + xp);
      g.ui.hud?.xpGain(xp, reason);
      this.save();
      return;
    }
    p.xp += xp;
    g.ui.hud?.xpGain(xp, reason);
    let leveled = false;
    const before = p.level;
    while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
      p.xp -= xpForLevel(p.level);
      p.level += 1;
      p.skillPoints += 1;
      leveled = true;
    }
    if (p.level >= MAX_LEVEL) p.xp = Math.min(p.xp, xpForLevel(MAX_LEVEL));
    if (leveled) {
      g.audio.ui('ui_levelup', 0.9);
      g.ui.hud?.levelUp(p.level, rankOf(p.level));
      g.refreshStats();
      g.net?.send('pinfo', g.helloData());
      g.mods?.emit('levelUp', p.level, g);
      if (before < REBIRTH_LEVEL && p.level >= REBIRTH_LEVEL) {
        setTimeout(() => g.ui?.toast?.(tf('REBIRTH available! Press J → REBIRTH for a permanent ★ (or keep climbing to {MAX_LEVEL}).', { MAX_LEVEL }), 'good'), 2500);
      }
    }
    this.save();
  }
  addCoins(c, reason) {
    if (!c) return;
    if (c > 0 && !FLAT_REASONS.test(String(reason || ''))) c = c * this.coinMultiplier();
    this.p.coins += Math.round(c);
    this.game.ui.hud?.setCoins(this.p.coins, Math.round(c));
    this.save();
  }
  spendCoins(c) {
    if (this.p.coins < c) return false;
    this.p.coins -= c;
    this.game.ui.hud?.setCoins(this.p.coins, -c);
    this.save();
    return true;
  }
  allocate(skill) {
    const p = this.p;
    // legacy base skills were replaced by the passive tree (K): refuse instead of silently re-spending into a dead system
    if (p.rpg?.v) { this.game.ui?.toast?.(t('Skills moved to the Passive Tree - press K.'), 'info'); return false; }
    if (p.skillPoints <= 0 || (p.skills[skill] || 0) >= SKILL_CAP) return false;
    p.skills[skill] = (p.skills[skill] || 0) + 1;
    p.skillPoints -= 1;
    this.game.refreshStats();
    this.save();
    return true;
  }
  /** Buy one rank of a mastery node (1 skill point). */
  allocateMastery(id) {
    const p = this.p;
    if (!MASTERY[id] || masteryBlock(p, id)) return false;
    p.mastery[id] = masteryRank(p, id) + 1;
    p.skillPoints -= 1;
    this.game.refreshStats();
    this.save();
    return true;
  }
  canRebirth() { return canRebirth(this.p); }
  /** Rebirth: level 1, +1 star, refunds; announces + resyncs the name tag. Returns the preview used or null. */
  rebirth() {
    const g = this.game;
    const res = applyRebirth(this.p);
    if (!res) return null;
    g.refreshStats();
    const p = g.player;
    if (p && !p.dead) { const s = g.stats; p.hp = Math.min(p.hp, s.maxHp); }
    try { g.net?.send('pinfo', g.helloData()); } catch { /* not in a session */ }
    g.mods?.emit('rebirth', prestigeStars(this.p), g);
    g.audio?.ui?.('ui_quota_met', 0.9);
    g.ui?.hud?.levelUp?.(1, `★${prestigeStars(this.p)} REBORN`);
    saveProfile(this.p);
    return res;
  }
  see(type, announce) {
    const b = this.p.bestiary;
    if (!b[type]) b[type] = { seen: false, kills: 0 };
    if (!b[type].seen) {
      b[type].seen = true;
      b[type].at = Date.now();
      if (announce && CREATURES[type]) this.game.ui.toast(tf('New Codex entry: {name} (J / terminal: BESTIARY)', { name: CREATURES[type].name }), 'info');
      this.save();
    }
  }
  kill(type) {
    this.see(type);
    this.p.bestiary[type].kills = (this.p.bestiary[type].kills || 0) + 1;
    this.p.stats.kills += 1;
    this.save();
  }
  onDeath() { this.p.stats.deaths += 1; this.save(); }
  fish(id) { this.p.stats.fish += 1; this.bountyEvent('fish', 'any', 1); this.save(); }
  arcade(score) {
    const s = this.p.stats;
    if (score > (s.bestArcade || 0)) { s.bestArcade = score; this.game.ui.toast(tf('New arcade high score: {score}', { score }), 'good'); }
    const day = Math.floor(Date.now() / 86400000);
    if (s.arcadeDay !== day) { s.arcadeDay = day; s.arcadeXp = 0; }
    const xp = Math.min(Math.round(score * 2), 100 - (s.arcadeXp || 0));
    if (xp > 0) { s.arcadeXp = (s.arcadeXp || 0) + xp; this.addXp(xp, 'Arcade'); }
    this.save();
  }

  // ---- bounties ----
  refreshBounties() {
    const p = this.p;
    const day = Math.floor(Date.now() / 86400000);
    if (p.bountyDay !== day || !p.bountyBoard) {
      p.bountyDay = day;
      p.bountyBoard = dailyBounties(day * 7919 + hashStr(p.id), p.level);
      // done-but-unclaimed bounties would vanish from the new board yet keep one of the 3 slots forever: pay them out now
      const carry = (p.bounties || []).filter((b) => b.done && !b.claimed);
      p.bounties = [];
      for (const b of carry) { b.claimed = true; this.addXp(b.xp || 0, 'Bounty complete'); this.addCoins(b.coin || 0, 'Bounty'); }
      this.save();
    }
    return p.bountyBoard;
  }
  accept(b) {
    const p = this.p;
    if (p.bounties.filter((x) => !x.done).length >= 3 || p.bounties.some((x) => x.id === b.id)) return false;
    p.bounties.push({ ...b, progress: 0 });
    b.accepted = true;
    this.save();
    return true;
  }
  claim(b) {
    if (!b.done || b.claimed) return false;
    b.claimed = true;
    this.addXp(b.xp, 'Bounty complete');
    this.addCoins(b.coin, 'Bounty');
    this.p.bounties = this.p.bounties.filter((x) => x !== b);
    this.game.audio.ui('ui_quota_met', 0.7);
    this.save();
    return true;
  }
  bountyEvent(type, target, n = 1) {
    let changed = false;
    for (const b of this.p.bounties || []) {
      if (b.done || b.type !== type) continue;
      if (b.target !== target && b.target !== 'any' && !(type === 'collect' || type === 'sell')) continue;
      b.progress = Math.min(b.n, b.progress + n);
      if (b.progress >= b.n) { b.done = true; this.game.ui.toast(t('Bounty complete! Claim it at the HQ board.'), 'good'); this.game.audio.ui('ui_confirm', 0.7); }
      changed = true;
    }
    if (changed) { this.save(); this.game.ui.hud?.refreshBounties?.(); }
  }
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
