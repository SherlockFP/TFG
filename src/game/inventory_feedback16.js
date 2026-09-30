// Local guidance only: locations come from confirmed host item events, never change custody.
import { attentionHot } from '../ui/hud_attention.js';
import { addTranslations, t, tf } from '../core/i18n.js';
import { actionLabel } from '../core/gamepad_core.js';
import { isSellable } from './items.js';
import { insideShip } from '../world/ship.js';
import { wrapMethod } from './dailyEvents.js';
const EN = {
  feed: '[{key}] inventory → right-click to hotbar · [{drop}] drops selected item',
  bag: '{name} → bag. [{key}] inventory; right-click to move to hotbar. [{drop}] drops your selected item.',
  hot: '{name} → hotbar {slot}. Select [{key}] before dropping.',
  drop: 'Salvage is still in your bag. [{key}] inventory; right-click to hotbar, select its slot, then drop.',
};
export function createInventoryFeedback16(game) {
  addTranslations({ [EN.feed]: '[{key}] envanter → sağ tık ile hızlı erişime · [{drop}] seçili eşyayı bırakır', [EN.bag]: '{name} → çanta. [{key}] envanter; sağ tık ile hızlı erişime taşı. [{drop}] seçili eşyayı bırakır.', [EN.hot]: '{name} → hızlı erişim {slot}. Bırakmadan önce [{key}] ile seç.', [EN.drop]: 'Hurda hâlâ çantanda. [{key}] envanter; sağ tık ile hızlı erişime taşı, yuvasını seç ve bırak.' }, 'tr');
  addTranslations({ [EN.feed]: '[{key}] инвентарь → правой кнопкой на панель · [{drop}] бросает выбранный предмет', [EN.bag]: '{name} → рюкзак. [{key}] инвентарь; правой кнопкой перенесите на панель. [{drop}] бросает выбранный предмет.', [EN.hot]: '{name} → ячейка {slot}. Перед броском выберите [{key}].', [EN.drop]: 'Лом остался в рюкзаке. [{key}] инвентарь; правой кнопкой на панель, выберите ячейку и бросьте.' }, 'ru');
  const seen = new Map(); let lastDrop = -Infinity;
  const key = (action, fallback) => actionLabel(action, game.settings?.keys, game.input?.usingPad, game.input?.padKind) || fallback;
  const show = (text) => game.ui?.toast?.(text, 'info');
  const salvage = it => it.type !== 'body' && !it.soulbound && it.value > 0 && isSellable(it.def);
  const location = it => {
    if (it.inv?.k === 'bag') return t('Stashed in bag');
    if (it.inv?.k === 'eq') return t('Equipped');
    const slot = game.player.slots.indexOf(it.id) + 1;
    return slot > 0 ? `${t('Hotbar')} ${slot}` : t('Carrying');
  };
  function confirmed(it) {
    if (!salvage(it) || it.holder !== game.selfId) return null;
    const loc = it.inv?.k || `hot${game.player.slots.indexOf(it.id)}`;
    if (seen.get(it.id) === loc) return false;
    seen.set(it.id, loc); if (seen.size > 32) seen.delete(seen.keys().next().value);
    // Safe pickups explain themselves immediately in the existing feed; threat pickups defer through the normal info queue.
    if (it.inv?.k === 'bag' && attentionHot(game)) show(tf(EN.bag, { name: t(it.def.name), key: key('inventory', 'I'), drop: key('drop', 'G') }));
    else if (!it.inv) { const n = game.player.slots.indexOf(it.id) + 1; if (n > 0 && game.player.heldItem?.()?.id !== it.id) show(tf(EN.hot, { name: t(it.def.name), slot: n, key: key(`hotbar${n}`, String(n)) })); }
    return true;
  }
  const feedHint = it => salvage(it) && it.holder === game.selfId && it.inv?.k === 'bag' && !attentionHot(game) ? tf(EN.feed, { key:key('inventory','I'),drop:key('drop','G') }) : '';
  const restore = wrapMethod(game, 'dropHeld', original => function (...args) {
    const held = game.player.heldItem?.();
    const result = original.apply(this, args);
    const now = Date.now();
    if (now - lastDrop > 6000 && (!held || !salvage(held)) && (insideShip(game.player.pos) || game.run?.phase === 'company') && [...(game.items?.all?.() || [])].some(it => it.holder === game.selfId && it.inv?.k === 'bag' && salvage(it))) {
      lastDrop = now; show(tf(EN.drop, { key: key('inventory', 'I') }));
    }
    return result;
  });
  return { location, feedHint, confirmed, released(id) { seen.delete(id); }, changed() { for (const it of game.items?.all?.() || []) if (seen.has(it.id)) confirmed(it); }, dispose() { restore(); seen.clear(); } };
}
