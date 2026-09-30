// node tools/sim/tr_pass.test.mjs : Turkish pass guard (wave 9). Player-facing text must use toLocaleUpperCase(getLang()) so TR "i" -> "İ".
// Ratchet: raw .toUpperCase() counts per file in src/ui + src/game may only go DOWN. A line that is genuinely an id/key/code may carry "// upper-ok".
import fs from 'fs';
import { setLang, getLang } from '../../src/core/i18n.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
// remaining raw calls are ids / codes / translation keys / pixel-font canvases / host-broadcast text (audited, wave 9 trpass)
const BASE = {"ui/facilityhud.js":1,"ui/hud.js":1,"ui/iconatlas.js":1,"ui/menuterminal.js":4,"ui/panels/arcade.js":2,"ui/panels/casefile.js":1,"ui/panels/crafting.js":1,"ui/panels/record.js":1,"ui/panels/shipyard.js":1,"ui/ui.js":5,"game/achievements.js":2,"game/actions.js":2,"game/algo2_view.js":1,"game/casefile.js":1,"game/chess3d_map.js":1,"game/chess_rules.js":3,"game/collection.js":2,"game/contracts.js":1,"game/crafting.js":1,"game/creature_tiers.js":2,"game/creatures_backrooms.js":1,"game/crew.js":2,"game/draughts_rules.js":3,"game/facilitysys.js":3,"game/factions.js":2,"game/food_data.js":2,"game/game.js":1,"game/guide.js":6,"game/harvest.js":1,"game/horde.js":2,"game/identify.js":2,"game/inventory.js":1,"game/magic.js":4,"game/pings.js":2,"game/prestige.js":1,"game/rpg.js":1,"game/screens.js":1,"game/shipyard.js":2,"game/shipyard_core.js":1,"game/shop.js":1,"game/siege.js":2,"game/story.js":1,"game/terminal.js":5,"game/voyage.js":3};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]));

// 1. locale-aware upper-casing works in this runtime and follows the language setting
ok('iş'.toLocaleUpperCase('tr') === 'İŞ', 'runtime lacks tr ICU casing');
setLang('tr'); ok(getLang() === 'tr' && 'kilit'.toLocaleUpperCase(getLang()) === 'KİLİT', 'setLang(tr) upper');
setLang('en'); ok('kilit'.toLocaleUpperCase(getLang()) === 'KILIT', 'setLang(en) upper');

// 2. ratchet on raw toUpperCase()
const files = [...walk('src/ui'), ...walk('src/game')].filter((f) => f.endsWith('.js'));
for (const f of files) {
  const n = fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('.toUpperCase()') && !l.includes('upper-ok'))
    .reduce((a, l) => a + l.split('.toUpperCase()').length - 1, 0);
  const allowed = BASE[f.replace('src/', '')] || 0;
  ok(n <= allowed, `${f}: ${n} raw .toUpperCase() (allowed ${allowed}) - use .toLocaleUpperCase(getLang()) for player-facing text, or tag the line // upper-ok`);
}

// 3. html lang: inline early script in index.html + setLang keeps it in sync at runtime
const html = fs.readFileSync('index.html', 'utf8');
ok(/documentElement\.lang\s*=/.test(html), 'index.html has no early <html lang> script');
ok(/documentElement\.lang\s*=\s*lang/.test(fs.readFileSync('src/core/i18n.js', 'utf8')), 'setLang must set document.documentElement.lang');

console.log(fails ? `FAILED ${fails}` : 'tr_pass: all ok');
process.exit(fails ? 1 : 0);
