// Node test: the Backrooms modules are translated to TR and RU, and the entity registry is sane (no browser).
//   node tools/harness/br_i18n.test.mjs
import fs from 'node:fs';
import { hasTranslation } from '../../src/core/i18n.js';
import { BR_RU, installBrRussian } from '../../src/game/br_i18n_ru.js';
import { registerBackroomsCreatures, BR_TYPES, DEFS, struggleNeed } from '../../src/game/creatures_backrooms.js';
import { CREATURES, EXTRA_SPAWNS } from '../../src/game/creatures.js';
import { ITEMS } from '../../src/game/items.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

// every t()/tf() literal in the modules has an entry in the RU table (the TR tables sit next to the code)
const lits = (src) => { const out = new Set(); for (const m of src.matchAll(/\bt[f]?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) out.add(m[2].replace(/\\'/g, "'")); return out; };
for (const f of ['src/game/backrooms.js', 'src/game/creatures_backrooms.js']) {
  const src = read(f);
  const trBlock = (src.match(/const TR = \{([\s\S]*?)\n\};/) || [])[1] || '';
  for (const s of lits(src)) {
    ok(s in BR_RU, `${f}: RU missing for "${s}"`);
    if (f.endsWith('backrooms.js')) ok(trBlock.includes(s.includes("'") ? s : `'${s}'`) || trBlock.includes(`"${s}"`) || trBlock.includes(s), `${f}: TR missing for "${s}"`);
  }
}
// liminal.js carries its own tables
{
  const src = read('src/game/liminal.js');
  for (const s of lits(src)) ok(src.includes(`'${s}':`) || src.includes(`"${s}":`), `liminal.js: no table entry for "${s}"`);
  for (const k of ['level 0 - day ?', 'who took this', 'the water was warm']) ok(src.includes(`'${k}':`) && src.split(`'${k}':`).length === 3, `liminal.js: TR + RU for "${k}"`);
}

// entities: registered, gated to backrooms, drops registered, texts in tr + ru
registerBackroomsCreatures();
installBrRussian();
for (const id of BR_TYPES) {
  ok(!!CREATURES[id], 'creature registered ' + id);
  ok(CREATURES[id].noSpawn === true, 'noSpawn outside a backrooms facility: ' + id);
  ok(!!EXTRA_SPAWNS[id], 'spawn weights ' + id);
  const drop = DEFS[id].drop?.[0];
  ok(!drop || ITEMS[drop], 'drop item exists: ' + drop);
  ok(hasTranslation('tr', DEFS[id].lore) && hasTranslation('tr', DEFS[id].deathText), 'TR lore/death ' + id);
}
ok(hasTranslation('ru', DEFS.br_smiler.lore) && hasTranslation('ru', DEFS.br_partygoer.deathText) && hasTranslation('ru', 'Smiler'), 'RU entity texts');
ok(hasTranslation('ru', 'MASH [{k}] TO BREAK FREE') && hasTranslation('ru', 'LEVEL 0 - THE LOBBY'), 'RU HUD + level captions');
ok(struggleNeed(1) === 7 && struggleNeed(99) === 14, 'struggle mash count clamps 7..14');
console.log(fails ? `${fails} FAILED` : 'br_i18n: all ok');
process.exit(fails ? 1 : 0);
