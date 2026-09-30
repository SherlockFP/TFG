// node tools/harness/econ9.test.mjs - wave 9 economy re-anchor (docs/wave9/econ9.md): quota 300-350, overtime /10, one quota source, sell window, loaner, shop sinks.
import fs from 'fs';
import { BALANCE, nextQuota, quotaState } from '../../src/game/progression.js';
import { sellWindow } from '../../src/game/firstrun_core.js';
import { SHIP_UPGRADES, ITEMS } from '../../src/game/items.js';
import { tIn } from '../../src/core/i18n.js';
import '../../src/game/algoctx_i18n.js';

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// quota curve
ok(BALANCE.quotaBase >= 300 && BALANCE.quotaBase <= 350, 'quotaBase 300-350');
ok(nextQuota(0, 0) === BALANCE.quotaBase, 'first quota = base');
let prev = nextQuota(0, 0), inc = true;
for (let q = 1; q < 12; q++) { const n = nextQuota(prev, q, () => 0.5); if (n <= prev) inc = false; prev = n; }
ok(inc, 'quota grows every step');
ok(BALANCE.overtimeDiv === 10 && /BALANCE\.overtimeDiv/.test(rd('src/game/host.js')), 'overtime = surplus / 10 in the host');

// one quota source + day target
const q = quotaState({ quota: 330, sold: 30, daysLeft: 3 });
ok(q.need === 300 && q.perDay === 100 && q.text === '▮30/▮330' && !q.met, 'quotaState need / perDay / text');
ok(quotaState({ quota: 330, sold: 30, daysLeft: 3 }, 120).perDay === 60, 'scrap aboard from earlier days lowers today\'s target');
ok(quotaState({ quota: 330, sold: 30, daysLeft: 1 }, 999).perDay === 0 && quotaState({ quota: 100, sold: 100, daysLeft: 0 }).met, 'covered quota -> 0; met');
for (const f of [   /* hud.js top-bar quota is hidden since algoslot — Tab card + report + goal carry it */ 'src/ui/ui.js', 'src/game/hudcalm.js', 'src/game/objectives.js']) ok(/quotaState\(/.test(rd(f)), f + ' reads quotaState');

// first sale never on day 1; HQ row / loot card say deadline pays 100 %
ok(!sellWindow({ daysLeft: 3 }) && !sellWindow({ daysLeft: 2 }) && sellWindow({ daysLeft: 1 }) && sellWindow({ daysLeft: 0 }) && !sellWindow(null), 'sellWindow: only from the last landing day');
ok(/FR\.sellWindow\(game\.run\)/.test(rd('src/game/onboard.js')), 'wantSell uses the window');
ok(/hq_dl/.test(rd('src/game/routeboard.js')) && /Deadline day pays 100 %/.test(rd('public/mods/ship-loot-tracker.js')), 'HQ row + loot card text');
ok(tIn('Deadline day pays 100 %', 'tr') !== 'Deadline day pays 100 %' && tIn('Deadline day pays 100 %', 'ru') !== 'Deadline day pays 100 %', 'loot card text has TR + RU');

// loaner: every landing until quota 1 (no firstDay gate)
const ln = rd('src/game/loaner.js');
ok(!/firstDay\(\)/.test(ln.split('const wanted')[1].split('\n')[0]) && /stage\(\) !== 'free'/.test(ln), 'loaner lasts until quota 1');

// credits sinks: mid/late purchases exist
ok(SHIP_UPGRADES.teleporter.price >= 800 && ITEMS.jetpack.price >= 1000 && ITEMS.bag_hauler.price >= 600, 'late-game prices worth saving for');

if (fails.length) { console.error('econ9 FAIL:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('econ9: all checks passed');
