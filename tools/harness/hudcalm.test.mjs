// node tools/harness/hudcalm.test.mjs - wave 8 declutter unit checks (no browser): density parsing, TR/RU coverage of every string the calm HUD
// prints, rules only name docks that exist, the fake chat is opt-in, Tab is the "Full status" key.
import fs from 'fs';
import { t, setLang } from '../../src/core/i18n.js';
import { hudDensityOf, HUD_DENSITIES } from '../../src/ui/hudcalm_ui.js';
import { ACTION_NAMES, DEFAULT_KEYS } from '../../src/core/a11y_core.js';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

chk(hudDensityOf({}) === 'standard' && hudDensityOf({ hudDensity: 'nope' }) === 'standard', 'default density is standard');
chk(HUD_DENSITIES.join() === 'minimal,standard,full' && hudDensityOf({ hudDensity: 'minimal' }) === 'minimal', 'densities');

const src = rd('src/game/hudcalm.js') + rd('src/ui/hudcalm_ui.js');
const keys = new Set([...src.matchAll(/\b(?:t|tf)\('([^']+)'/g)].map((m) => m[1]));
for (const k of ['Minimal (fewest)', 'Standard (recommended)', 'Full (everything)']) keys.add(k);
for (const lang of ['tr', 'ru']) {
  setLang(lang);
  for (const k of keys) if (t(k) === k && k.length > 3) chk(false, `${lang} missing: ${k}`);
}
setLang('en');

// every dock id named in the rules is really created by some module
const all = [...fs.readdirSync(new URL('../../src/game/', import.meta.url)).map((f) => 'src/game/' + f), ...fs.readdirSync(new URL('../../src/ui/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => 'src/ui/' + f), ...fs.readdirSync(new URL('../../src/ui/panels/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => 'src/ui/panels/' + f)]
  .filter((f) => f.endsWith('.js')).map((f) => rd(f)).join('\n');
const rules = src.match(/const DOCK_RULES = \{([\s\S]*?)\n\};/)[1];
for (const id of [...rules.matchAll(/(?:^|[\s,{])'?([a-z0-9][\w-]*)'?:\s*\{/g)].map((m) => m[1])) chk(new RegExp(`hudDock\\('(?:left|right|bottom)', '${id}'`).test(all), 'unknown dock id in rules: ' + id);

chk(/a2Feed === true/.test(rd('src/game/algo2.js')), 'fake chat is opt-in');
chk(DEFAULT_KEYS.menu === 'Tab' && ACTION_NAMES.menu === 'Full status (hold)', 'Tab = Full status');
chk(/dataset\.hud =/.test(rd('src/ui/ui.js')), 'ui.js applies data-hud');
console.log(bad ? `hudcalm FAIL (${bad})` : `hudcalm OK (${keys.size} strings)`);
process.exit(bad ? 1 : 0);
