// node tools/harness/wave2_siege_core.mjs  - pure checks for src/game/siege_core.js (flow field, scaling, waves, rewards)
import { FlowField, siegePower, waveCount, planWave, waveReward, heldReward, bossHp, distToHull, inBox, TUNE } from '../../src/game/siege_core.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
const ff = new FlowField(130, 2); ff.compute();
const out = { x: 0, z: 0 };
// walk from a far point to the ship along the field
const walk = (x, z) => { let steps = 0; while (steps++ < 400 && ff.dirAt(x, z, out)) { x += out.x * 1.0; z += out.z * 1.0; } return { x, z, steps }; };
const w0 = walk(90, 40);
ok(distToHull(w0.x, w0.z) < 4.2, 'reaches the hull ring (' + JSON.stringify(w0) + ')');
// a partial wall of barricades across the approach: the field routes around it
const wall = []; for (let k = -6; k <= 6; k++) wall.push({ x: 30, z: k * 2.2, hx: 1.1, hz: 0.22, yaw: Math.PI / 2, cost: 25 });
ff.setBlockers(wall); ff.compute();
const around = walk(90, 0);
ok(distToHull(around.x, around.z) < 4.5, 'routes around a partial wall');
// a wall across the whole map: still reachable (chews through the cheapest barricade), cost is visible
const full = []; for (let k = -70; k <= 70; k++) full.push({ x: 30, z: k * 2.2, hx: 1.1, hz: 0.22, yaw: Math.PI / 2, cost: 25 });
ff.setBlockers(full); ff.compute();
ok(ff.penAt(30, 0) >= 25, 'barricade cells carry cost');
ok(ff.distAt(31, 0) < Infinity, 'still reachable through a full wall');
ff.setBlockers([]); ff.compute();
ok(ff.penAt(30, 0) === 0, 'nav restored after blockers are removed');
ok(inBox(1, 0, { x: 0, z: 0, hx: 1.1, hz: 0.2, yaw: 0 }) && !inBox(0, 1, { x: 0, z: 0, hx: 1.1, hz: 0.2, yaw: 0 }), 'inBox');
ok(inBox(0, 1, { x: 0, z: 0, hx: 1.1, hz: 0.2, yaw: Math.PI / 2 }), 'inBox rotated');
const rows = [];
for (const [qi, crew, th] of [[1, 1, 10], [1, 2, 30], [2, 3, 50], [4, 4, 60], [8, 4, 80], [12, 4, 100]]) {
  const p = siegePower({ quotaIndex: qi, crew, threat: th, reason: 'extraction' });
  const W = waveCount(p.power, 'extraction');
  const waves = []; for (let w = 1; w <= W; w++) waves.push(planWave(w, W, p.power));
  rows.push({ qi, crew, th, P: +p.power.toFixed(2), W, waves: waves.map((x) => `${x.swarm}s/${x.tank}t/${x.runner}r/${x.boss}b`).join(' '), reward1: waveReward(1, W, qi, crew).credits, held: heldReward(qi, crew, 80).credits, bossHp: bossHp(crew, qi) });
}
console.table(rows);
ok(waveCount(1, 'debug', 100) === 3, 'short time => 3 waves');
ok(TUNE.minQuotaIndex === 1, 'tune');
console.log(fail ? `FAILED ${fail}` : 'PASS');
process.exit(fail ? 1 : 0);
