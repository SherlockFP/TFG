// Node test for src/game/feel_core.js: hitstop scaling table, sound recipe coverage for every weapon class, death anim state machine.
// Run: node tools/harness/feel.test.mjs
import fs from 'node:fs';
import * as C from '../../src/game/feel_core.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };

// ---- hitstop table: 40-90 ms, monotonic in damage, heavy/crit/backstab add
const table = [0, 5, 9, 22, 40, 90, 400].map((d) => C.hitstopSec(d));
ok(table.every((v) => v >= 0.04 && v <= 0.09), 'hitstop within 40-90 ms: ' + table);
ok(table.every((v, i) => i === 0 || v >= table[i - 1]), 'hitstop monotonic in damage');
ok(C.hitstopSec(0) === 0.04 && C.hitstopSec(1e6, { heavy: true, crit: true, backstab: true }) === 0.09, 'hitstop clamps');
ok(C.hitstopSec(22, { heavy: true }) > C.hitstopSec(22) && C.hitstopSec(22, { crit: true }) > C.hitstopSec(22) && C.hitstopSec(22, { backstab: true }) > C.hitstopSec(22), 'modifiers add');
ok(C.hitstopSec(NaN) === 0.04 && C.hitstopSec(-5) === 0.04, 'hitstop garbage input');
ok(C.hitstopTimeScale(0.05) === C.HITSTOP_SCALE && C.hitstopTimeScale(0) === 1, 'time scale only while running');
ok(C.meleeKick('hammer').shake > C.meleeKick('dagger').shake && C.meleeKick('axe', { heavy: true }).shake > C.meleeKick('axe').shake, 'kick scales with weapon weight / heavy');

// ---- sound recipe coverage: every melee class in combat.js and every fireSnd in the weapon files has a recipe
const R = C.buildRecipes();
const combat = fs.readFileSync('src/game/combat.js', 'utf8');
const clsBlock = combat.slice(combat.indexOf('export const CLASSES = {'), combat.indexOf('const CLASS_OF_ID'));
const classes = [...clsBlock.matchAll(/^  (\w+): \{ L:/gm)].map((m) => m[1]);
ok(classes.length >= 7, 'found melee classes in combat.js: ' + classes);
for (const c of classes) {
  ok(C.MELEE_CLASSES.includes(c), 'melee class listed: ' + c);
  ok(R[C.swingName(c)], 'swing recipe: ' + c);
  for (const s of C.SURFACES) ok(R[C.impactName(c, s)], `impact recipe ${c}/${s}`);
}
let guns = 0;
for (const f of ['weapons', 'combat_weapons', 'worlds2_weapons']) {
  const src = fs.readFileSync(`src/game/${f}.js`, 'utf8');
  for (const m of src.matchAll(/fireSnd: '(\w+)'/g)) { guns++; ok(C.gunClassOf(m[1]), `fireSnd ${m[1]} has a gun class`); }
}
ok(C.gunClassOf('cb_rocket') === 'launcher' && C.gunClassOf('cb_gl') === 'launcher', 'launcher sounds mapped');
ok(guns >= 6, 'found fireSnd entries: ' + guns);
for (const c of C.GUN_CLASSES) { ok(R[C.shotName(c)], 'shot recipe ' + c); ok(C.GUN_FX[c], 'gun fx ' + c); ok(C.TAIL_SIZES.includes(C.GUN_FX[c].tail), 'tail size ' + c); }
for (const s of C.TAIL_SIZES) for (const i of [true, false]) ok(R[C.tailName(i, s)], `tail ${i} ${s}`);
ok(new Set(Object.values(C.GUN_SOUNDS)).size === C.GUN_CLASSES.length, 'every gun class is used by some sound');
// every recipe renders finite, non-silent, bounded audio (8 kHz keeps the test fast)
let bad = 0, n = 0;
for (const [name, fn] of Object.entries(R)) {
  const b = fn(8000); n++;
  let peak = 0, fin = true; for (const v of b) { if (!Number.isFinite(v)) fin = false; peak = Math.max(peak, Math.abs(v)); }
  if (!fin || peak < 0.5 || peak > 1 || b.length < 20) { bad++; console.log('bad recipe', name, peak, b.length); }
}
ok(bad === 0, `all ${n} recipes render`);
const a1 = R.fl_shot_rifle(8000), a2 = R.fl_shot_rifle(8000);
ok(a1.every((v, i) => v === a2[i]), 'recipes are deterministic');
ok(R.fl_tail_in_m(8000).length < R.fl_tail_out_m(8000).length, 'outdoor tail rings longer than indoor');

// ---- death animation state machine
const D = C.DEATH;
ok(C.deathPhase(0) === 'fall' && C.deathPhase(D.fall + 0.01) === 'bounce' && C.deathPhase(D.fall + D.bounce + 0.01) === 'rest'
  && C.deathPhase(D.dissolveAt + 0.1) === 'dissolve' && C.deathPhase(D.dissolveAt + D.dissolveDur + 0.1) === 'gone', 'phase boundaries');
let last = -1, mono = true, cont = true, prev = C.deathPose(0, 3);
for (let t = 0; t < 12; t += 0.01) {
  const p = C.deathPose(t, 3), i = C.DEATH_PHASES.indexOf(p.phase);
  if (i < last) mono = false; last = i;
  if (Math.abs(p.pitch - prev.pitch) > 0.12 || Math.abs(p.roll - prev.roll) > 0.12 || Math.abs(p.scale - prev.scale) > 0.05) cont = false;
  prev = p;
}
ok(mono, 'phases only move forward'); ok(cont, 'pose is continuous');
const end = C.deathPose(D.fall - 0.001, 0);
ok(Math.abs(Math.abs(end.pitch) - D.target) < 0.02, 'fall ends at the topple angle');
ok(C.deathPose(0, 0).pitch === 0 && C.deathPose(0, 0).scale === 1, 'starts upright at full size');
const bounce = C.deathPose(D.fall + D.bounce * 0.3, 0);
ok(bounce.hop > 0 && Math.abs(bounce.pitch) < D.target, 'bounce hops and rebounds slightly');
const rest = C.deathPose(5, 2);
ok(Math.abs(rest.roll) === D.target && rest.pitch === 0 && rest.scale === 1 && rest.sink === 0, 'rest holds the pose (side topple)');
ok(C.deathPose(20, 1).done && C.deathPose(20, 1).scale < 0.01 && !C.deathPose(5, 1).done, 'dissolves then done');
ok(new Set([0, 1, 2, 3].map((s) => `${C.deathPose(5, s).pitch}/${C.deathPose(5, s).roll}`)).size === 4, 'seed picks four different topple directions');
ok(C.deathPhase(D.fall * 1.2, 3) === 'fall' && C.deathPhase(D.fall * 1.2, 1) === 'bounce', 'big bodies fall slower');

// ---- low HP heartbeat
ok(C.lowHpLevel(100, 100) === 0 && C.lowHpLevel(0, 100) === 0 && C.lowHpLevel(35, 100) === 0 && C.lowHpLevel(1, 100) > 0.9, 'low hp level');
ok(C.beatInterval(1) < C.beatInterval(0) && C.beatInterval(0) <= 0.95, 'heart speeds up');

console.log(`feel: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
