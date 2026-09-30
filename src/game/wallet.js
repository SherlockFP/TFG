// WALLET (wave 5 "unify", wave 9 "followers"): the game has ONE currency and ONE score.
//   Credits    ▮  the crew's money (run.credits): sold scrap, quota, store, zone fortify, trap arming. Shared, lives with the run.
//   Followers  ◈  your channel's size (profile.coins, the old Clout field: same save key, values kept). It only GROWS and is NEVER spent:
//                 what Clout used to buy is now a MILESTONE UNLOCK at a follower count (unlockAt / claimable / nextMilestone below).
// Everything else that used to look like money is a MATERIAL (crafting input, never a price): components (comp_*), forge shards (shard_*), the homeworld stash
// (parts / meals / s1-s4). Season XP and level XP are PROGRESS, not money. Pure (no DOM / game access), node-tested by tools/harness/wallet.test.mjs.
import { t, addTranslations } from '../core/i18n.js';

export const CURRENCIES = {
  credits: { icon: '▮', name: 'Credits', scope: 'crew' },
  clout: { icon: '◈', name: 'Followers', scope: 'personal', spendable: false },   // id stays 'clout' (save / store keys); it is FOLLOWERS to the player
};
addTranslations({ Materials: 'Malzemeler', 'Materials: crafting only, not money': 'Malzeme: sadece üretim için, para değil' }, 'tr');
addTranslations({ Materials: 'Материалы', 'Materials: crafting only, not money': 'Материал: только для крафта, не деньги' }, 'ru');
export const CURRENCY_IDS = Object.keys(CURRENCIES);
/** what used to read like money but is not: shown under "Materials" (or as progress) and never as a price */
export const MATERIAL_KINDS = { components: 'Components', shards: 'Shards', stash: 'Stash', meals: 'Meals' };
export const PROGRESS_KINDS = ['xp', 'seasonXp', 'level'];

/** 'credits' | 'clout' | 'material' | 'progress' | null for a resource key (homeworld store keys, run / profile keys or an item id) */
export function classify(key) {
  const k = String(key || '');
  if (k === 'credits' || k === 'cr') return 'credits';
  if (k === 'clout' || k === 'coins') return 'clout';
  if (PROGRESS_KINDS.includes(k)) return 'progress';
  if (/^comp_/.test(k) || /^shard_/.test(k) || k === 'parts' || k === 'meals' || /^s[1-4]$/.test(k)) return 'material';
  return null;
}
/** the material family of a key: 'components' | 'shards' | 'stash' | 'meals' | null */
export function materialKind(key) {
  const k = String(key || '');
  if (/^comp_/.test(k)) return 'components';
  if (/^shard_/.test(k) || /^s[1-4]$/.test(k)) return 'shards';
  if (k === 'parts') return 'stash';
  if (k === 'meals') return 'meals';
  return null;
}
const fmt = (v) => String(Math.max(0, Math.floor(Number(v) || 0)));
/** the ONE wallet row: "▮ 60 · ◈ 12" (HUD + panels). Plain text; icons are the two currency glyphs only. */
export const walletRow = (credits, clout) => `${CURRENCIES.credits.icon} ${fmt(credits)} · ${CURRENCIES.clout.icon} ${fmt(clout)}`;
/** the same row from a game object (run.credits + profile.coins); safe on partial objects */
export const walletOf = (game) => ({ credits: Math.max(0, Math.floor(Number(game?.run?.credits) || 0)), clout: Math.max(0, Math.floor(Number(game?.profile?.coins ?? game?.progress?.p?.coins) || 0)) });
export const walletRowOf = (game) => { const w = walletOf(game); return walletRow(w.credits, w.clout); };
/** "Materials" summary line from counts { components, shards, stash, meals } (zero families are left out); '' when there is nothing */
export function materialsRow(counts) {
  const out = [];
  for (const [k, label] of Object.entries(MATERIAL_KINDS)) { const n = Math.floor(Number(counts?.[k]) || 0); if (n > 0) out.push(`${t(label)} ${n}`); }
  return out.length ? `${t('Materials')}: ${out.join(' · ')}` : '';
}
/** count materials by family from a flat list of item type ids (an inventory) and/or a homeworld store { parts, meals, s1..s4 } */
export function countMaterials(itemTypes = [], store = null) {
  const c = { components: 0, shards: 0, stash: 0, meals: 0 };
  for (const ty of itemTypes) { const k = materialKind(ty); if (k) c[k]++; }
  if (store) { c.stash += Math.floor(store.parts || 0); c.meals += Math.floor(store.meals || 0); for (const k of ['s1', 's2', 's3', 's4']) c.shards += Math.floor(store[k] || 0); }
  return c;
}

/** [trim] is Clout a wallet the player can SPEND yet? Credits are the only money of the first hour: a fresh staged profile meets Clout prices (Company Store,
 *  terminal store list, Black Market) at the same unlock as the store's rare stock (hubgate 'shop', quota 1). Veterans / unlock-everything / no onboard: always. */
export const cloutOpenOf = (game) => { try { return !game?.onboard?.locked?.('shop'); } catch { return true; } };

// ---------------------------------------------------------------- [followers] milestone unlocks (pure; nothing here ever subtracts)
/** followers needed for something that used to cost `price` Clout: the balance is never spent, so the threshold is a multiple of the old price */
export const FOLLOWER_MULT = 2;
export const unlockAt = (price) => Math.max(0, Math.round((Number(price) || 0) * FOLLOWER_MULT));
/** the followers of a game / profile-like object (profile.coins is the persisted follower count) */
export const followersOf = (game) => Math.max(0, Math.floor(Number(game?.profile?.coins ?? game?.progress?.p?.coins ?? game?.coins) || 0));
/** true when `followers` reaches the unlock of something that used to cost `price` Clout */
export const claimable = (followers, price) => (Number(followers) || 0) >= unlockAt(price);
/** the general ladder shown on the Tab card when no specific unlock is closer */
export const FOLLOWER_LADDER = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
/** next milestone above `followers`: { at, prev, pct (0-1 progress from prev to at), name? }. `extra` = [{ at, name }] specific unlocks (cosmetics...). null when past the ladder. */
export function nextMilestone(followers, extra = []) {
  const f = Math.max(0, Number(followers) || 0);
  const pool = [...FOLLOWER_LADDER.map((at) => ({ at })), ...extra.filter((x) => x && x.at > 0)].filter((x) => x.at > f).sort((a, b) => a.at - b.at);
  const nx = pool[0];
  if (!nx) return null;
  const prev = Math.max(0, ...[0, ...FOLLOWER_LADDER, ...extra.map((x) => x?.at || 0)].filter((a) => a <= f));
  return { ...nx, prev, pct: Math.max(0, Math.min(1, (f - prev) / Math.max(1, nx.at - prev))) };
}
addTranslations({ 'Unlocks at {n} followers': '{n} takipçide açılır', 'Followers': 'Takipçi', 'followers': 'takipçi', 'Claim': 'Al', 'Next milestone': 'Sonraki eşik', '{n} / {m} followers': '{n} / {m} takipçi' }, 'tr');
addTranslations({ 'Unlocks at {n} followers': 'Откроется при {n} подписчиках', 'Followers': 'Подписчики', 'followers': 'подписчики', 'Claim': 'Забрать', 'Next milestone': 'Следующая веха', '{n} / {m} followers': '{n} / {m} подписчиков' }, 'ru');
