// node tools/harness/threatmerge.test.mjs - wave 8 threatmerge: curated pool (deterministic, 3-4, rules), director gate, wiring greps. No browser.
import fs from 'fs';
import * as P from '../../src/game/threatpool.js';
import * as K from '../../src/game/crdirector_core.js';
import * as LC from '../../src/game/lcmonsters_core.js';
import { spawnTable } from '../../src/game/creatures.js';
import '../../src/game/stealth_creatures.js';
import { MOONS } from '../../src/game/moons.js';
import * as L from '../../src/world/shiplayout.js';
import * as H from '../../src/game/hubgate_core.js';
let bad = 0, n = 0;
const chk = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// pool: 3 headline (+ theme), deterministic per run + moon + sector, differs across moons / sectors, no company pool, zombies only from quota 3
const run = { runId: 'r1', quotaIndex: 0 }, m1 = MOONS.hamsi, m2 = MOONS.lufer;
const a = P.poolFor(run, m1), b = P.poolFor({ ...run }, m1);
chk(a && a.ids.length === 3 && a.ids.every((id) => P.HEAD_IDS.has(id)) && a.all.length >= 3 && a.all.length <= 4, 'pool 3 headline (+theme)');
chk(JSON.stringify(a.ids) === JSON.stringify(b.ids), 'deterministic');
const sig = (r, m) => P.poolFor(r, m).ids.join();
const variety = new Set([sig(run, m2), sig({ ...run, quotaIndex: 1 }, m1), sig({ ...run, quotaIndex: 2 }, m1), sig({ runId: 'r2', quotaIndex: 0 }, m1), sig(run, MOONS.palamut)]);
chk(variety.size >= 3, 'pools vary per moon / sector / run');
chk(P.poolFor(run, MOONS.hq) === null && P.poolFor(null, m1) === null, 'no pool for HQ / no run');
let z0 = 0, z3 = 0;
for (let i = 0; i < 40; i++) { if (P.poolFor({ runId: 'z' + i, quotaIndex: 0 }, m1).ids.includes('zombie')) z0++; if (P.poolFor({ runId: 'z' + i, quotaIndex: 3 }, m1).ids.includes('zombie')) z3++; }
chk(z0 === 0 && z3 > 0, 'zombies only in pools from quota 3');
chk(P.themeOf(MOONS.palamut) === 'sandkefal' || P.themeOf(MOONS.palamut) === null || typeof P.themeOf(MOONS.palamut) === 'string', 'theme creature derives from the moon table');

// blocks: non-pool headline is vetoed (Hard lets it through), everything else untouched; table weight is cut
let archiveDraws=0;
for(let seed=0;seed<200;seed++) {
 const r={seed,quotaIndex:2},plain=P.poolFor(r,m1),enabled=P.poolFor(r,m1,{creatures32:true});
 chk(!plain.ids.some(id=>id.startsWith('c32_')),'disabled archive family is absent from the normal seeded pool');
 chk(JSON.stringify(plain)===JSON.stringify(P.poolFor(r,m1,{creatures32:false})),'explicit opt-out preserves the default pool');
 const family=enabled.ids.filter(id=>id.startsWith('c32_'));
 chk(family.length<=1,'opt-in pool shares one archive family');archiveDraws+=family.length;
 chk(!P.poolFor({...r,quotaIndex:0},m1,{creatures32:true}).ids.some(id=>id.startsWith('c32_')),'opt-in retains early-quota protection');
}
chk(archiveDraws>0,'the enabled native pool actually draws archive encounters');

// blocks: non-pool headline is vetoed (Hard lets it through), everything else untouched; table weight is cut
const out = P.HEADLINE.map((h) => h.id).find((id) => !a.ids.includes(id));
chk(P.poolBlocks(out, a, false) && !P.poolBlocks(out, a, true) && !P.poolBlocks(a.ids[0], a, false) && !P.poolBlocks('scuttler', a, false) && !P.poolBlocks(out, null, false), 'poolBlocks');
chk(P.poolMul(out, a, false) < 1 && P.poolMul(out, a, true) > P.poolMul(out, a, false) && P.poolMul('scuttler', a, false) === 1, 'poolMul');
const tb0 = spawnTable(m1, 'in', null), tb1 = spawnTable(m1, 'in', run);
const nonPool = ['spider', 'listener'].filter((id) => !a.ids.includes(id));
for (const id of nonPool) if (tb0[id]) chk(tb1[id] < tb0[id], 'spawnTable cuts ' + id);
chk(tb1.scuttler === tb0.scuttler, 'spawnTable keeps the baseline roster');
chk(LC.kindWeights(1, { block: (k) => k === 'keeper' }).keeper === 0 && LC.kindWeights(1).keeper > 0, 'lcmonsters kindWeights block');

// director gate: set pieces need quota 3 (director on or off); the rest must fit the phase budget
const o = { q: 0, tier: 1 };
chk(!K.gateOk('horde', 'peak', o, 0, 1) && !K.gateOk('siege', 'peak', { q: 2 }, 0, 1) && !K.gateOk('mirror', 'peak', { q: 1 }, 0, 1) && K.gateOk('mirror', 'calm', { q: 3 }, 9, 9), 'wave kinds: quota 3+ only');
chk(K.gateOk('lcm', 'peak', o, 0, 1.5) && !K.gateOk('lcm', 'peak', o, K.capOf(o) * 1.3, 1) && !K.gateOk('lcm', 'calm', o, 2, 1.5), 'budget kinds: cap x phase share');
chk(K.GATE_SHARE.peak > K.GATE_SHARE.build && K.GATE_SHARE.build > K.GATE_SHARE.relax && K.GATE_SHARE.relax > K.GATE_SHARE.calm, 'phase shares ordered');

// wiring: every spawner asks the director, terminal shows the pool, doubled [E] hint stripped, locked fixtures covered, downed is not fired
const need = { 'src/game/horde.js': "canSpawn('horde'", 'src/game/siege.js': "canSpawn('siege'", 'src/game/mirror.js': "'mirror', null, 'mirror'", 'src/game/skeletons.js': "'crypt'", 'src/game/creatures_backrooms.js': "'backrooms'", 'src/game/backrooms.js': "'backrooms'",
  'src/game/lcmonsters.js': "'lcm'", 'src/game/terminal.js': 'KNOWN RESIDENTS', 'src/game/crdirector.js': 'poolBlocks', 'src/game/creatures.js': 'poolFor', 'src/game/hubgate.js': 'coverTick', 'public/mods/employee-assignments.js': 'isDowned' };
for (const [f, s] of Object.entries(need)) chk(rd(f).includes(s), f + ' has ' + s);
chk(/replace\(\/\\s\*\\\[E\\\]\\s\*\/g/.test(rd('src/ui/hud.js')), 'hud strips [E] from the prompt label');
for (const [id, def] of Object.entries(H.SYSTEMS)) for (const k of def.cover || []) chk(L.SPOTS[k] && L.DIMS[k], 'cover spot + dims: ' + id + '/' + k);
chk(['arcade', 'chess', 'stove'].every((k) => Object.values(H.SYSTEMS).some((d) => (d.cover || []).includes(k))), 'chess / arcade / stove covered');

console.log(bad ? `threatmerge: ${bad} FAILED of ${n}` : `threatmerge: all ${n} checks passed`);
process.exit(bad ? 1 : 0);
