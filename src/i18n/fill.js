// Gap-filling registration for data translations (wave 8 i18n8): rows are [English key, Turkish, Russian]. Only fills a language where the key
// has no entry yet, so a common word ("Loot", "Scout") never overrides the translation another module already made for it.
import { addTranslations, hasTranslation } from '../core/i18n.js';

export function fillGaps(rows) {
  if (globalThis.__fillLog) globalThis.__fillLog.push(...rows);   // node checks (placeholder parity) read this
  const tr = {}, ru = {};
  for (const [en, t, r] of rows) {
    if (t && !hasTranslation('tr', en)) tr[en] = t;
    if (r && !hasTranslation('ru', en)) ru[en] = r;
  }
  addTranslations(tr, 'tr');
  addTranslations(ru, 'ru');
}
