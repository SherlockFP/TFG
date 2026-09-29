// node tools/harness/rewardviz.test.mjs - wave 8 rewardviz: ledger, rows, map bonus, chips, pop threshold, lever fee, TR/RU strings (no browser)
import fs from 'fs';
import { t, setLang } from '../../src/core/i18n.js';
import * as C from '../../src/game/rewardviz_core.js';
import '../../src/game/rewardviz.js';
let bad = 0;
const chk = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

const L = C.freshLedger();
chk(C.note(L, 'job', 140) && C.note(L, 'ore', 12.4) && !C.note(L, 'nope', 5) && !C.note(L, 'job', -3) && !C.note(L, 'job', NaN) && L.job === 140 && L.ore === 12, 'ledger');
chk(C.shouldPop(100) && !C.shouldPop(99) && C.shouldPop(250.4), 'pop threshold');
chk(C.mapBonus(1190, 19) === 190 && C.mapBonus(0, 19) === 0 && C.mapBonus(500, 0) === 0, 'map bonus = share of the value that the affix added');
chk(C.valueChip(19) === '+19 % VALUE' && C.curseChip(1.6) === 'CURSED ×1.6', 'chips');
const rows = C.rowsOf({ ...C.freshLedger(), job: 140, crate: 1, till: 210, fee: 25 }, { collected: 1190, fines: 60 }, 19);
const keys = rows.map((r) => r[0]).join();
chk(keys === 'scrap,job,crate,map,till,fine,fee', 'rows only where something happened: ' + keys);
chk(rows.find((r) => r[0] === 'fine')[3] === '-' && rows.find((r) => r[0] === 'job')[3] === '+', 'costs are marked');
const job = (o) => ({ sl: 'm', st: 0, p: 0, n: 5, pd: 0, ...o });
chk(C.leverFee([job()], 900) === 25 && C.leverFee([job()], 10) === 10 && C.leverFee([job()], 0) === 0, 'lever fee is capped by credits');
chk(C.leverFee([job({ p: 1 })], 900) === 0 && C.leverFee([job({ st: 1, p: 5 })], 900) === 0 && C.leverFee([job({ sl: 's' })], 900) === 0 && C.leverFee([job({ pd: 1 })], 900) === 0 && C.leverFee(null, 900) === 0, 'no warning once started / done / side / paid');

const src = fs.readFileSync(new URL('../../src/game/rewardviz.js', import.meta.url), 'utf8');
const keysT = new Set([...src.matchAll(/\b(?:t|tf)\('([^']+)'/g)].map((m) => m[1]));
for (const k of Object.values({ a: 'Scrap', b: 'Job pay', c: 'Job crate', d: 'Pocket loot', e: 'MAP BONUS', f: 'Diner', g: 'Ore mined', h: 'Clout', i: 'Casualty fine', j: 'Job fee', k: 'Viewer tax' })) keysT.add(k);
keysT.add('CURSED ×{n}');
for (const lang of ['tr', 'ru']) { setLang(lang); for (const k of keysT) if (t(k) === k && k !== 'Clout') chk(false, `${lang} missing: ${k}`); }
setLang('en');
console.log(bad ? `rewardviz.test: ${bad} FAIL` : 'rewardviz.test: OK');
process.exit(bad ? 1 : 0);
