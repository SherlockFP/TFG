// node tools/harness/hud6.test.mjs - wave 8 hud6 unit checks (no browser): the Standard HUD keeps 6 always-on areas, one currency, and the
// held torch neither blows out the viewmodel nor draws a grey slab.
import fs from 'fs';
import { walletRow } from '../../src/game/wallet.js';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const calm = rd('src/game/hudcalm.js'), hud = rd('src/ui/hud.js'), act = rd('src/game/actions.js'), lp = rd('src/render/lightpool.js'), bal = rd('src/game/balance.js');

// contextual rules (Standard): threat above CALM only, ability bar on cooldown only, mana when spent, weight > 30 lb, assignment on change
chk(/threat: \{ c: '\.tfg-threat\.up' \}/.test(calm) && /toggle\('up', S\.lvShown >= 1\)/.test(bal), 'threat only above CALM');
chk(/roleskills: \{ fn: 'cd' \}/.test(calm) && /mana: \{ fn: 'mana' \}/.test(calm), 'ability bar + mana are cooldown-driven');
chk(/HEAVY_LB = 30/.test(calm) && /sel: '\.hud-weight', fn: 'weight'/.test(calm), 'weight only above 30 lb');
chk(/sel: '\.tfg-asg'/.test(calm) && /sel: '\.hud-tr'[^\n]*strip: 1/.test(calm), 'assignment + level/coins block are contextual');
// one currency: credits on the HUD, clout only when it changes / in Full / on the Tab card
chk(/walletRow\(this\.creditsVal \|\| 0, c\)\.split\(' · '\)\[0\]/.test(hud) && /cloutUntil/.test(hud), 'HUD coins = credits only unless clout just changed');
chk(/walletRowOf\(game\)/.test(calm), 'Tab card shows both currencies');
const both = walletRow(60, 12);
chk(both.split(' · ').length === 2 && !/◈/.test(both.split(' · ')[0]) && /◈ 12/.test(both), 'walletRow split = credits | clout');
// torch: lamp starts ahead of the hand, own beam volume off, remote beams faint + distance faded
const ahead = Number(/const FLASH_AHEAD = ([\d.]+)/.exec(act)?.[1]);
chk(ahead >= 0.5 && ahead <= 0.9 && /-FLASH_AHEAD/.test(act), 'torch spot origin ahead of the viewmodel: ' + ahead);
chk(/opacity = r\.priority < 1 \? 0 : 0\.032 \* dCam/.test(lp), 'own torch has no cone volume; remote beams <= 0.032, fading with distance');
chk(/depthWrite: false/.test(lp) && /AdditiveBlending/.test(lp), 'beam stays additive, depthWrite off');
if (bad) { console.log(`hud6 FAIL (${bad})`); process.exit(1); }
console.log('hud6 OK');
