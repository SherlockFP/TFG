// WALLET (wave 5, "unify"): the game has exactly TWO currencies.
//   Credits  ▮  the crew's money (run.credits): sold scrap, quota, store, zone fortify, trap arming. Shared, lives with the run.
//   Clout    ◈  your personal reputation money (profile.coins): cosmetics, forge extras, personal unlocks. Yours, kept between runs.
// Everything else that used to look like money is a MATERIAL (crafting input, never a price): components (comp_*), forge shards (shard_*), the homeworld stash
// (parts / meals / s1-s4). Season XP and level XP are PROGRESS, not money. Pure (no DOM / game access), node-tested by tools/harness/wallet.test.mjs.
import { t, addTranslations } from '../core/i18n.js';

export const CURRENCIES = {
  credits: { icon: '▮', name: 'Credits', scope: 'crew' },
  clout: { icon: '◈', name: 'Clout', scope: 'personal' },
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
