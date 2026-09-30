// node tools/harness/hubgate.test.mjs - wave 8 hubgate: the unlock ladder metadata, locked-system gating, Hub door fixture, QUICK SHIFT rules + install smoke. No browser.
import fs from 'fs';
import { setLang, t } from '../../src/core/i18n.js';
import * as K from '../../src/game/onboard_core.js';
import * as H from '../../src/game/hubgate_core.js';
import { TEXT as OB } from '../../src/game/onboard_text.js';
import * as L from '../../src/world/shiplayout.js';
let bad = 0, n = 0;
const chk = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ladder: every id has a system entry, a name and a gift line in EN + TR + RU; ladder order = quota order
chk(K.UNLOCKS.map((u) => (u.sale ? 0 : u.q ?? 99)).join() === '0,0,1,1,2,2,2,3,3,4,4,99', 'ladder: sale,sale,1,1,2,2,2,3,3,4,4,boss');
for (const id of K.UNLOCK_IDS) {
  chk(H.SYSTEMS[id], 'SYSTEMS has ' + id);
  for (const k of ['u.' + id, 'gift.' + id]) chk(OB[k] && OB[k].length === 3 && OB[k].every((s) => s && s.length > 1), 'text EN/TR/RU ' + k);
  chk(K.requirementText(id), 'requirement ' + id);
}
// terminal words: each maps to a real ladder id
for (const [c, id] of Object.entries(H.HUB_CMDS)) chk(K.UNLOCK_IDS.includes(id), 'cmd ' + c + ' -> ' + id);
chk(H.HUB_CMDS.pets === 'pets' && H.HUB_CMDS.tree === 'tree' && H.HUB_CMDS.arcade === 'arcade' && H.HUB_CMDS.zones === 'zones' && H.HUB_CMDS.signals === 'voyage' && H.HUB_CMDS.home === 'homeworld', 'command map');
// docks and hotkey actions named here really exist in the code base
const all = fs.readdirSync(new URL('../../src/game/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => rd('src/game/' + f)).join('\n');
for (const d of H.hiddenDocks(K.UNLOCK_IDS)) chk(new RegExp(`hudDock\\('(?:left|right|bottom)', '${d}'`).test(all), 'dock exists: ' + d);
const keys = rd('src/core/a11y_core.js');
for (const def of Object.values(H.SYSTEMS)) for (const k of def.keys || []) chk(new RegExp(`${k}: 'Key|${k}: 'F2`).test(keys), 'key action exists: ' + k);
chk(/deny\?\.\('tree'\)/.test(rd('src/game/rpg.js')) && /deny\?\.\('season'\)/.test(rd('src/game/daily.js')) && /locked\?\.\('zones'\)/.test(rd('src/game/zones.js')) && /hubgate\?\.shopLock/.test(rd('src/game/shop.js')) && /deny\?\.\('pets'\)/.test(rd('src/game/pets.js')), 'one guard line per system');
// ship fixtures: zones come from shiplayout, only when locked; the Hub door is a fixture with a standing spot
const lk = ['arcade', 'pets', 'farming'];
chk(H.zoneOwner(L.SPOTS.arcade.x, L.SPOTS.arcade.z, lk) === 'arcade' && H.zoneOwner(L.SPOTS.incubator.x, L.SPOTS.incubator.z - 0.5, lk) === 'pets' && H.zoneOwner(L.SPOTS.stove.x, L.SPOTS.stove.z, lk) === 'farming', 'locked fixtures are found');
chk(H.zoneOwner(L.SPOTS.arcade.x, L.SPOTS.arcade.z, []) === null && H.zoneOwner(L.SPOTS.terminal.x, L.SPOTS.terminal.z, K.UNLOCK_IDS) === null && H.zoneOwner(L.SPOTS.kiosk.x, L.SPOTS.kiosk.z, K.UNLOCK_IDS) === null && H.zoneOwner(L.SPOTS.coffee.x, L.SPOTS.coffee.z, K.UNLOCK_IDS) === null && H.zoneOwner(L.SPOTS.tp.x, L.SPOTS.tp.z, K.UNLOCK_IDS) === null, 'unlocked / neighbouring fixtures are untouched');
chk(L.SPOTS.hubDoor && L.fixtureBoxes().some((b) => b.id === 'hubDoor') && L.ACCESS.some((a) => a.id === 'hubDoor'), 'Hub door lives in shiplayout (box + access spot)');
// host ladder -> joiner
const hub = H.hubOf({ mode: 'staged', q: 2, boss: false }, { q: 3 });
chk(hub.q === 3 && H.hubOpen('homeworld', hub) && H.hubOpen('forge', hub) && !H.hubOpen('voyage', hub) && H.hubOpen('voyage', hub, true) && H.hubOpen('forge', { mode: 'all', q: 0 }) && H.sameHub(hub, { ...hub }), 'run.hub rules a joiner');
chk(H.openIds({ mode: 'staged', q: 0 }).length === 0 && H.openIds({ mode: 'staged', q: 0, sale: true }).join() === 'shop,tree' && H.openIds({ mode: 'staged', q: 1 }).join() === 'shop,tree,arcade,pets', 'open ids: first sale = store + tree, quota 1 adds arcade + pets');
// quick shift
const f = H.quickFields('ABC123:0', () => 2);
chk(H.QUICK.moons.includes(f.moon) && f.daysLeft === 1 && f.quotaIndex === 0 && f.quick && f.quota === H.QUICK.quotaByTier[2], 'quick run fields');
chk(H.quickMoon('K:1') === H.quickMoon('K:1') && new Set(Array.from({ length: 40 }, (_, i) => H.quickMoon('s' + i))).size >= 3, 'moon pick is seeded and varies');
chk(H.quickFields('Z:1', () => 1, 'hamsi').moon !== 'hamsi', 'play again picks another moon');
chk(H.QUICK.dayLengthSec === 900 && H.QUICK.quotaByTier[1] < 130, '15 minute day, quota below the campaign first quota');
const res = H.quickResult({ collected: 100, leftValue: 20, players: [{ dead: false }, { dead: true }] }, { quota: 90 });
chk(res.ok && res.pct === 111 && res.alive === 1 && res.crew === 2, 'quick result: met');
chk(!H.quickResult({ collected: 50, players: [] }, { quota: 90 }).ok && !H.quickResult({ collected: 500, allDead: true, players: [] }, { quota: 90 }).ok, 'quick result: short / wipe');
chk(H.quickReward(res).xp > H.quickReward({ ok: false }).xp, 'meeting the quota pays more');
chk(K.progressOf({ quotaIndex: 4, quick: { v: 1 }, cycle: { sector: 2 } }).q === 0 && !K.progressOf({ quick: { v: 1 }, cycle: { sector: 2 } }).boss, 'the ladder does not advance in quick shift');
chk(K.shouldRun({ profile: {}, isHost: true, quick: true }).why === 'quick', 'no Hiring Day in quick shift');
// menu + slots
chk(/id: 'quick'/.test(rd('src/ui/crtmenu.js')) && /'quick'/.test(rd('src/ui/artdir_menu.js')) && /quick: true/.test(rd('src/ui/crtmenu.js')), 'main menu has the QUICK SHIFT entry');
chk(/useModule\('hubgate', installHubgate\)/.test(rd('src/game/game.js')), 'game.js slot');
// i18n + install smoke (the module imports host.js / moons.js: skipped with a note when that chain needs a browser)
let M = null;
try { M = await import('../../src/game/hubgate.js'); } catch (e) { console.log('NOTE: hubgate.js import needs a browser here:', e.message.split('\n')[0]); }
if (M) {
  for (const [k, v] of Object.entries(M.HG_TEXT)) chk(v.length === 3 && v.every((s) => s && s.length > 1), 'text rows ' + k);
  setLang('tr'); chk(t('QUICK SHIFT') === 'HIZLI VARDİYA', 'TR menu label'); setLang('ru'); chk(t('QUICK SHIFT') === 'БЫСТРАЯ СМЕНА', 'RU menu label'); setLang('en');
  const mods = { on: () => () => {} };
  const saved = [];
  const game = { mods, isHost: true, run: { quick: { v: 1, n: 0 } }, hostSave() { saved.push(1); return 'saved'; }, interactablesNow() { return []; }, settings: {}, onboard: { locked: (id) => id === 'shop', unlocks: () => ({ mode: 'staged', q: 0, boss: false }) } };
  const api = M.installHubgate(game);
  chk(game.hostSave() === undefined && saved.length === 0, 'quick shift: hostSave is skipped');
  delete game.run.quick; chk(game.hostSave() === 'saved' && saved.length === 1, 'campaign: hostSave runs');
  chk(api.shopLock({ tier: 'rare' }) && !api.shopLock({ tier: 'common' }) && !api.shopLock({ tier: 'uncommon' }), 'store: rare+ locked before quota 1');
  chk(api.remoteHub() === null, 'host has no remote ladder');
  game.isHost = false; game.run.hub = hub; chk(api.remoteHub() === hub, 'joiner reads the host ladder');
  api.dispose();
}
console.log(bad ? `hubgate FAILED ${bad}/${n}` : `hubgate: all ${n} checks passed`);
process.exit(bad ? 1 : 0);
