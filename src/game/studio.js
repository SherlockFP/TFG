// STUDIO (wave 8, docs/wave8/studio.md): authorship polish. Gives items that shipped without a description a one-line tip
// (inventory tooltip + store card) in EN / TR / RU. Only fills EMPTY tips, so anything a module wrote itself wins.
// Pure data pass: no network, no world, no per-frame work.
import { ITEMS } from './items.js';
import { addTranslations, localizeFields } from '../core/i18n.js';
import { ITEM_TIPS } from './studio_text.js';

let translated = false;
function registerText() {
  if (translated) return;
  translated = true;
  const tr = {}, ru = {};
  for (const [en, trText, ruText] of Object.values(ITEM_TIPS)) { tr[en] = trText; ru[en] = ruText; }
  addTranslations(tr, 'tr');
  addTranslations(ru, 'ru');
}

/** Fill missing item tips. Returns how many items got one. */
export function applyItemTips(items = ITEMS) {
  registerText();
  let n = 0;
  for (const [id, [en]] of Object.entries(ITEM_TIPS)) {
    const def = items[id];
    if (!def || def.tip || def.desc || def.blurb) continue;
    def.tip = en;
    localizeFields(def, ['tip']);
    n++;
  }
  return n;
}

export function installStudio(game) {
  const filled = applyItemTips();
  return { filled, dispose() {} };
}
