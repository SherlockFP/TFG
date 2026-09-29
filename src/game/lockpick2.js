// LOCKPICK 2 (wave 5, module 'lockpick2'; docs/wave5/lockpick2.md; MASTERPLAN 25.3): fast tiered lockpicking.
// Every legacy caller of the 'lockpick' minigame (doors, treasure chests, secureloot cages, tasks) keeps calling game.openMinigame('lockpick', {difficulty})
// - this module swaps the registry entry for the new timing-click game (MINIGAMES.lockpick -> wrapper around minigames/lockpick2.js) and
// derives the lock tier from the difficulty. Rules: lockpick2_core.js (node-tested). Per-profile skill: profile.lockpick2 = { xp, opened }.
// Noise: every seated pin / burst goes through game.stealth.emit (Listener, Crawler ...); the silent-picking perk (skill 5) removes the pick noise.
// Co-op (host authoritative, prefix 'lp'): the picker announces his lock ('lpReq' {op:'start'|'end'}), a second player in reach holds [E] on it
// ('lpReq' {op:'help', id}, renewed while held), the host broadcasts 'lpSt' {list:[{id,by,x,y,z,tier,h}]}; helpers hold pins + widen the window.
import * as THREE from 'three';
import { HOST_ONLY } from '../net/session.js';
import { MINIGAMES } from '../minigames/index.js';
import { createLockpick2 } from '../minigames/lockpick2.js';
import { ITEMS, registerItem } from './items.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { saveProfile } from '../core/save.js';
import { createItemModel } from '../models/items.js';
import { TR_LOCKPICK2, RU_LOCKPICK2 } from './lockpick2_i18n.js';
import * as L from './lockpick2_core.js';

addTranslations(TR_LOCKPICK2, 'tr');
addTranslations(RU_LOCKPICK2, 'ru');
HOST_ONLY.add('lpSt');

export function installLockpick2(game) {
  const mods = game.mods;
  if (!mods) return null;
  const offs = [];
  const book = new L.Coop();
  let sessions = [];                 // last 'lpSt' list (every peer)
  let mine = null;                   // id of my own session (picker)
  let helpId = null, helpSend = 0, sweepT = 0, disposed = false, lastNet = null;
  const now = () => performance.now() / 1000;
  const say = (s, kind = 'info') => { try { game.ui?.toast?.(s, kind); } catch { /* ui optional */ } };
  const posOf = (from) => (from === game.selfId ? game.player?.pos : game.remotes?.get(from)?.pos);

  // ---- content: items (+ models reuse the lockpick / hack tool look) ------------------------------------------------------
  for (const d of L.ITEM_DEFS) if (!ITEMS[d.id]) registerItem({ ...d });
  if (mods.itemModels) {
    if (!mods.itemModels.has(L.PICK.TITANIUM)) mods.itemModels.set(L.PICK.TITANIUM, () => createItemModel('lockpick'));
    if (!mods.itemModels.has(L.PICK.BYPASS)) mods.itemModels.set(L.PICK.BYPASS, () => { const f = mods.itemModels.get('sl_hacktool'); return f ? f() : null; });
  }

  // ---- skill -----------------------------------------------------------------------------------------------------------
  const skill = () => L.ensureSkill(game.profile);
  const level = () => L.levelOfXp(skill().xp);
  const PERK_TEXT = { [L.PERK_LEVEL.autoSeat]: 'Auto-seats 1 pin', [L.PERK_LEVEL.silent]: 'Silent picking (no noise)', [L.PERK_LEVEL.oneClick]: 'One-click Simple locks' };
  function award(tier, tool) {
    if (!game.profile) return;
    const r = L.awardXp(game.profile, tier, tool);
    try { saveProfile(game.profile); } catch { /* storage optional */ }
    say(tf('+{xp} Lockpicking XP', { xp: r.gained }), 'info');
    if (r.levelUp) say(tf('Lockpicking level {n}!', { n: r.level }) + (PERK_TEXT[r.level] ? ' ' + t(PERK_TEXT[r.level]) : ' ' + t('Wider timing window')), 'good');
    return r;
  }

  // ---- noise (client or host): through the stealth module, plain creature noise as the fallback -------------------------------
  function makeNoise(loud) {
    if (!(loud > 0)) return;
    const p = game.player?.pos;
    if (!p) return;
    try {
      if (game.stealth?.emit) game.stealth.emit('use', p.x, p.y + 0.5, p.z, loud);
      else if (game.isHost) game.creatures?.noise?.(new THREE.Vector3(p.x, p.y + 0.5, p.z), loud, null);
    } catch (e) { console.warn('[lockpick2] noise', e); }
  }

  // ---- the minigame wrapper ---------------------------------------------------------------------------------------------------
  const original = MINIGAMES.lockpick;
  MINIGAMES.lockpick2 = createLockpick2;
  function wrapped(o = {}) {
    const held = game.player?.heldItem?.();
    const tool = L.TOOLS[o.tool] ? o.tool : held && L.isPickType(held.type) ? held.type : L.PICK.BASIC;
    const tier = L.isTier(o.tier) ? o.tier : L.tierOfDifficulty(o.difficulty);
    const p = game.player?.pos;
    if (p && !o.noXp) game.net?.request?.('lpReq', { op: 'start', p: [p.x, p.y, p.z], tier });
    const done = o.onDone;
    const opts = {
      ...o, tier, tool, level: level(), helpers: () => sessions.find((s) => s.by === game.selfId)?.h || 0, onNoise: makeNoise,
      onDone: (res) => {
        game.net?.request?.('lpReq', { op: 'end' });
        if (res?.success && !o.noXp) award(tier, tool);
        try { done?.(res); } catch (e) { console.error(e); }
      },
    };
    return createLockpick2(opts);
  }
  MINIGAMES.lockpick = wrapped;

  // ---- co-op: host book + client prompt ---------------------------------------------------------------------------------------------
  function hostReq(d, from) {
    if (!game.isHost || disposed || !d) return;
    const pos = posOf(from);
    if (d.op === 'start') {
      if (!pos || !Array.isArray(d.p) || !d.p.every(Number.isFinite) || Math.hypot(d.p[0] - pos.x, d.p[2] - pos.z) > 3) return;
      book.start(from, d.p, d.tier, now());
    } else if (d.op === 'end') book.end(from);
    else if (d.op === 'help') { if (!pos || !book.help(from, String(d.id), [pos.x, pos.y, pos.z], now())) return; }
    else return;
    broadcast();
  }
  const broadcast = () => { if (game.isHost) game.net?.broadcast?.('lpSt', { list: book.list(now()) }); };
  function bindNet(net) {
    lastNet = net;
    net.on_('lpSt', (d) => { sessions = Array.isArray(d?.list) ? d.list.slice(0, 16) : []; mine = sessions.find((s) => s.by === game.selfId)?.id || null; });
    net.handle('lpReq', (d, from) => { try { hostReq(d, from); } catch (e) { console.warn('[lockpick2] req', e); } });
  }
  offs.push(mods.on('netReady', (net) => bindNet(net)));
  if (game.net && game.net !== lastNet) { try { bindNet(game.net); } catch { /* netReady binds it */ } }

  const V = new THREE.Vector3();
  offs.push(mods.on('interactables', (out, g) => {
    if (g !== game || disposed || game.minigame) return;
    const p = game.player;
    if (!p || p.dead) return;
    for (const s of sessions) {
      if (s.by === game.selfId || Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > L.COOP.REACH) continue;
      const holding = helpId === s.id;
      out.push({
        pos: V.set(s.x, s.y + 1, s.z).clone(), r: 1.6, reach: L.COOP.REACH,
        label: holding ? t('HOLDING THE PINS') : t('Hold the pins [hold E]'), sub: t('A teammate is picking - your help makes the lock faster'),
        action: () => { helpId = s.id; helpSend = 0; },
      });
    }
  }));
  offs.push(mods.on('update', (dt, g) => {
    if (g !== game || disposed) return;
    if (game.isHost) { sweepT += dt; if (sweepT >= 0.4) { sweepT = 0; if (book.sweep(now())) broadcast(); } }
    if (helpId) {
      const s = sessions.find((x) => x.id === helpId), p = game.player;
      if (!s || !p || p.dead || !game.input?.isDown?.('interact') || game.minigame) { helpId = null; return; }
      helpSend -= dt;
      if (helpSend <= 0) { helpSend = 0.45; game.net?.request?.('lpReq', { op: 'help', id: helpId }); }
    }
  }));

  const api = {
    level, skill, tierOf: L.tierOfDifficulty, core: L, award, sessions: () => sessions.slice(), mine: () => mine,
    /** debug / harness: open the game on a tier directly */
    open(tier = 'simple', tool, cb) { game.openMinigame('lockpick', { tier, tool, noXp: true }, cb || (() => {})); },
    dispose() {
      disposed = true;
      for (const off of offs) { try { off?.(); } catch { /* ignore */ } }
      if (MINIGAMES.lockpick === wrapped) MINIGAMES.lockpick = original;
      if (MINIGAMES.lockpick2 === createLockpick2) delete MINIGAMES.lockpick2;
    },
  };
  return api;
}
