// node tools/harness/cycle2_i18n.test.mjs - every English UI string of the sector cycle has a TR and a RU translation with the same placeholders.
import fs from 'node:fs';
import { CYCLE_TR, CYCLE_RU } from '../../src/game/cycle_i18n.js';
import { KS_AFFIXES, RAID_DIFFS } from '../../src/game/cycle_plan.js';
import { MUTATORS } from '../../src/game/cycle_core.js';
import { BOSS_INFO } from '../../src/game/cycle_bosses.js';
import { CREATURES } from '../../src/game/creatures.js';
import { ITEMS } from '../../src/game/items.js';
import { registerInstanceItems } from '../../src/game/cycle_inst.js';

registerInstanceItems();
let fails = 0, checked = 0;
const keys = new Map();
const add = (k, src) => { if (typeof k === 'string' && k.trim()) keys.set(k, src); };
const files = ['cycle.js', 'cycle_console.js', 'cycle_inst.js', 'cycle_endless.js', 'cycle_bosses.js', 'cycle_bossfx.js'];
const pat = /\b(?:t|tf|say|banner|reply|sysMsg|toast)\(\s*(?:g\s*,\s*|M\.game\s*,\s*)?(['"`])((?:\\.|(?!\1).)*)\1/g;
for (const f of files) {
  const src = fs.readFileSync(new URL('../../src/game/' + f, import.meta.url), 'utf8');
  for (const m of src.matchAll(pat)) add(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'), f);
}
// literals that reach t() through variables / ternaries
const extra = ['SECTOR GATE OPEN', 'BOSS', 'LOBBY', 'WING A', 'WING B', 'WING C', 'LABYRINTH', 'BOSS ARENA', 'ENTERING: {a}', 'PATCH NOTES', 'ROLLBACK', 'LOOT IS WORTH MORE', 'SEASON FINALE', 'RED GATE DETECTED', 'S-RANK GLITCH GATE',
  'RED GATE (no exit until the boss falls)', 'RED GATE', 'S-RANK GATE', 'GATE', 'title', 'best', 'METER', 'DEPTH', 'decay', 'day', 'next day is a RELIEF day', 'Loot', 'creature power', 'sales', 'rank', 'ACTIVE MUTATORS:',
  'No mutators yet (PATCH NOTES every 3 depths).', 'PATCH 1.0 is available: type ENDLESS ACCEPT (or ENDLESS DECLINE to stay in the classic loop).', 'type GATE to enter (chest x{c}).', 'Keystone affix: {@n} - {@d}',
  'PATCH NOTES v1.{n}: + {@a} - {@d}', 'PATCH NOTES v1.{n}: - ROLLBACK {@r}', 'Loot is worth more.', 'DAYS (meet the quota)'];
for (const k of extra) add(k, 'extra');
for (const [id, a] of Object.entries(KS_AFFIXES)) { add(a.name, 'affix ' + id); add(a.desc, 'affix ' + id); }
for (const d of Object.values(RAID_DIFFS)) add(d.name, 'raid diff');
for (const m of Object.values(MUTATORS)) { add(m.name, 'mutator'); add(m.desc, 'mutator'); }
for (const b of Object.values(BOSS_INFO)) { add(b.title, 'boss title'); add(b.aux, 'boss aux'); add(b.vuln, 'boss vuln'); }
for (const [id, d] of Object.entries(CREATURES)) if (d.cyBoss || d.cyAux) { add(d.$name || d.name, 'creature ' + id); add(d.$lore || d.lore, 'creature ' + id); add(d.deathText, 'creature ' + id); }
for (const id of Object.keys(ITEMS)) if (id === 'corecard' || id.startsWith('trophy_')) { add(ITEMS[id].$name || ITEMS[id].name, 'item ' + id); add(ITEMS[id].$tip || ITEMS[id].tip, 'item ' + id); }
// the boss tips of the CORE briefing
const cons = fs.readFileSync(new URL('../../src/game/cycle_console.js', import.meta.url), 'utf8');
const tipsAt = cons.indexOf('const TIPS = {');
const tips = cons.slice(tipsAt, cons.indexOf('\n};', tipsAt));
for (const m of tips.matchAll(/:\s*'((?:\\.|[^'])*)'/g)) add(m[1].replace(/\\'/g, "'"), 'tip');
// already translated elsewhere in the game (interior names, common words)
const OK_ELSEWHERE = new Set(['Data Center', 'Haunted Homepage', 'Deep Web Mine', 'Corporate Intranet', 'The Backrooms', 'Cloud Storage', 'The Comment Sewer', 'Telehealth Clinic', 'Tier', 'BOSS DEFEATED', 'DEMONETIZED', 'NORMAL', 'best']);
const ph = (s) => [...String(s).matchAll(/\{@?\w+\}/g)].map((m) => m[0]).sort().join(',');
const SHORT_OK = new Set(['left', 'moon', 'depth', 'cores', 'fired', 'crew', 'damage', 'chests', 'wings', 'classic', 'title', 'best', 'day', 'decay', 'sales', 'rank', 'Loot']);
for (const [k, src] of keys) {
  if (k.length < 2 || /^[\W\d_]+$/.test(k) || /^[.#:\s]/.test(k)) continue;
  if (/^[a-z]+$/.test(k) && !SHORT_OK.has(k)) continue;          // css classes / event names
  if (k.startsWith('msg:') || /^[a-z]+:[a-z]/.test(k)) continue;
  if (/^(div|span|style|button|canvas)$/.test(k)) continue;
  for (const [lang, D] of [['tr', CYCLE_TR], ['ru', CYCLE_RU]]) {
    checked++;
    const v = D[k];
    if (v === undefined) { if (OK_ELSEWHERE.has(k)) continue; fails++; console.error(`MISSING ${lang}: ${JSON.stringify(k)}  (${src})`); continue; }
    if (ph(v) !== ph(k)) { fails++; console.error(`PLACEHOLDERS ${lang}: ${JSON.stringify(k)} -> ${JSON.stringify(v)}`); }
    if (!v.trim()) { fails++; console.error(`EMPTY ${lang}: ${k}`); }
  }
}
for (const [lang, D] of [['tr', CYCLE_TR], ['ru', CYCLE_RU]]) for (const [k, v] of Object.entries(D)) if (ph(v) !== ph(k)) { fails++; console.error(`PLACEHOLDERS ${lang}: ${JSON.stringify(k)}`); }
console.log(`${keys.size} English strings, ${checked} lookups, TR ${Object.keys(CYCLE_TR).length} / RU ${Object.keys(CYCLE_RU).length} entries`);
if (fails) { console.error(`${fails} problem(s)`); process.exit(1); }
console.log('all cycle strings translated (EN / TR / RU)');
