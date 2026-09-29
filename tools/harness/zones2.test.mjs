// node tools/harness/zones2.test.mjs [layouts=90]
// Wave 6 ZONES v2 (pure rules, zones2_core.js): interior wing partition + reachability, trap placement / validation (horror planner), wall placement validation on real
// terrain, raider pathing around a barricade (siege FlowField aimed at the core), generated-sector archive persistence, income with miners under the daily cap.
import { setInteriorProbe } from '../../src/game/moongen.js';
import { INTERIOR_THEMES } from '../../src/world/facility.js';
import { interiorTests } from './zones2_interior.part.mjs';
import { outdoorTests } from './zones2_outdoor.part.mjs';

setInteriorProbe((id) => INTERIOR_THEMES.includes(id));
const NL = Number(process.argv[2]) || 90;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const say = (m) => console.log('ok  ', m);

interiorTests({ ok, say, NL });
outdoorTests({ ok, say });

console.log(`\n${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
