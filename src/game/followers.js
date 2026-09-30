// FOLLOWERS (wave 9): the channel's size. profile.coins (the old Clout field, same save key) only GROWS and is never spent; the things Clout used to buy are
// MILESTONE UNLOCKS at unlockAt(price) followers (wallet.js). This module = the pure "what is next" helpers + the strings of the follower screens.
// LIVE viewers (algo2, per day) are a separate number: viewers today -> followers gained (day report, rewardviz).
import { addTranslations } from '../core/i18n.js';
import { MARKET } from './progression.js';
import { ITEMS } from './items.js';
import { unlockAt, nextMilestone } from './wallet.js';

/** every unowned follower unlock the profile is waiting for: [{ at, name }] (Black Market gear / armor / perks). */
export function followerUnlocks(profile) {
  const p = profile || {}, owned = new Set(p.owned || []), out = [];
  const add = (id, price, name) => { if (id && price > 0 && !owned.has(id)) out.push({ at: unlockAt(price), name: name || ITEMS[id]?.name || id }); };
  for (const w of MARKET.weapons) add(w.id, w.coin);
  for (const a of [...MARKET.armor, ...MARKET.perks]) add(a.id, a.coin, a.name);
  return out;
}
/** { followers, next: { at, prev, pct, name? } | null } for the Tab card / record: the closest specific unlock, else the generic ladder */
export function followerCard(profile) {
  const followers = Math.max(0, Math.floor(Number(profile?.coins) || 0));
  return { followers, next: nextMilestone(followers, followerUnlocks(profile)) };
}

addTranslations({
  'CONFIRM?': 'ONAY?', Adopt: 'Sahiplen', '+{n} followers': '+{n} takipçi',
  'Next milestone: {name} at {n} followers': 'Sonraki eşik: {name} ({n} takipçide)', 'Next milestone: {n} followers': 'Sonraki eşik: {n} takipçi',
  'Viewers today: {v} -> +{n} followers': 'Bugünkü izleyici: {v} -> +{n} takipçi', 'Channel: {n} followers': 'Kanal: {n} takipçi',
  'FOLLOWERS': 'TAKİPÇİ', 'Followers only grow. Milestones unlock gear and cosmetics.': 'Takipçi sayın yalnızca artar. Eşikleri geçtikçe ekipman ve kozmetik açılır.',
}, 'tr');
addTranslations({
  'CONFIRM?': 'ПОДТВЕРДИТЬ?', Adopt: 'Взять', '+{n} followers': '+{n} подписчиков',
  'Next milestone: {name} at {n} followers': 'Следующая веха: {name}, {n} подписчиков', 'Next milestone: {n} followers': 'Следующая веха: {n} подписчиков',
  'Viewers today: {v} -> +{n} followers': 'Зрителей сегодня: {v} -> +{n} подписчиков', 'Channel: {n} followers': 'Канал: {n} подписчиков',
  'FOLLOWERS': 'ПОДПИСЧИКИ', 'Followers only grow. Milestones unlock gear and cosmetics.': 'Подписчики только растут. Вехи открывают снаряжение и косметику.',
}, 'ru');
