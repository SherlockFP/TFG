// node tools/sim/studio.test.mjs : wave 8 studio pass (docs/wave8/studio.md): item tips (EN/TR/RU), style rules, default handles, id fallback
import { ITEMS } from '../../src/game/items.js';
import { ITEM_TIPS } from '../../src/game/studio_text.js';
import { applyItemTips } from '../../src/game/studio.js';
import { t, setLang } from '../../src/core/i18n.js';
import { TR_PARTS } from '../../src/i18n/tr.js';
import { defaultHandle } from '../../src/core/save.js';
import { cleanName } from '../../src/core/profilename.js';
import { humanizeId, fmtMoney } from '../../src/core/util.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

// ---- 1. tip table: every id is a real item, one short sentence or two, no exclamation marks, no em dash, all three languages
ok(Object.keys(ITEM_TIPS).length >= 60, 'at least 60 item tips (' + Object.keys(ITEM_TIPS).length + ')');
for (const [id, [en, tr, ru]] of Object.entries(ITEM_TIPS)) {
  ok(ITEMS[id], 'tip for unknown item ' + id);
  ok(en.length >= 12 && en.length <= 90, `${id}: EN length ${en.length}`);
  ok(![en, tr, ru].some((s) => /[!—]/.test(s)), `${id}: no "!" or em dash`);
  ok(tr && tr !== en && ru && /[Ѐ-ӿ]/.test(ru), `${id}: TR/RU present`);
}
// ---- 2. applying fills only empty tips and localises them
const n = applyItemTips();
ok(n >= 60, 'tips applied: ' + n);
ok(applyItemTips() === 0, 'second apply is a no-op');
for (const id of ['bolt', 'flashlight', 'fish_boot', 'cryptorig']) {
  setLang('en'); const en = ITEMS[id].tip;
  ok(en === ITEM_TIPS[id][0], id + ' EN tip');
  setLang('tr'); ok(ITEMS[id].tip === ITEM_TIPS[id][1], id + ' TR tip');
  setLang('ru'); ok(ITEMS[id].tip === ITEM_TIPS[id][2], id + ' RU tip');
}
setLang('en');
// a tip a module wrote itself must survive
ok(ITEMS.ladder.tip && !Object.prototype.hasOwnProperty.call(ITEM_TIPS, 'ladder'), 'existing tips untouched');

// ---- 3. style guide: dictionary keys carry no em dash and no leftover wording the glossary retired
const keys = TR_PARTS.flatMap((p) => Object.keys(p));
ok(!keys.some((k) => k.includes('—')), 'no em dash in TR keys: ' + keys.filter((k) => k.includes('—')).slice(0, 3).join(' | '));
ok(!keys.some((k) => /profit quota|day\(s\)|item\(s\)|player\(s\)/i.test(k)), 'retired wording in TR keys');
setLang('tr'); ok(t('QUOTA: ▮{sold} / ▮{quota}') === 'KOTA: ▮{sold} / ▮{quota}', 'TR quota line'); setLang('en');

// ---- 4. first-run handle: passes the nickname rules untouched
for (let i = 0; i < 300; i++) { const h = defaultHandle(); ok(cleanName(h) === h && h.length >= 2 && h.length <= 16, 'handle ' + h); }
// ---- 5. helpers
ok(humanizeId('fish_boot') === 'Fish Boot', 'humanizeId');
ok(!/[_]/.test(humanizeId('vy12_x')), 'humanizeId strips underscores');
ok(fmtMoney(12345) === '▮12,345', 'fmtMoney');

console.log(fails ? `studio: ${fails} FAILED` : 'studio: all checks passed');
process.exit(fails ? 1 : 0);
