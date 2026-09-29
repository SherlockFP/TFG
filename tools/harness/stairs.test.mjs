// node tools/harness/stairs.test.mjs - wave 5 "stairs": every stair builder goes through src/world/stairs.js.
// For every stair a builder produces (several seeds): slope <= controller max slope, no step > stepHeight at entry / exit,
// top platform reachable, and a KINEMATIC WALK SIMULATION with the real Rapier character controller (same settings as
// physics.js createController) up the ramp collider - walking, sprinting and pressing sideways into the walls.
import { Physics, initPhysics, G, groups } from '../../src/physics/physics.js';
import { RNG } from '../../src/core/rng.js';
import { planStairs, checkStairs, rampQuat, rampWorld, rot2, LIMITS, DESIGN_MAX_SLOPE_DEG, ladderStep, makeLadder } from '../../src/world/stairs.js';
import { FrameGeo, Solids as W2Solids } from '../../src/world/worlds2_solids.js';
import { buildBlock } from '../../src/world/worlds2_soviet.js';
import { crawler } from '../../src/world/worlds2_twinsun.js';
import { Solids as LmSolids, buildTower, buildRuin } from '../../src/world/landmarks.js';

await initPhysics();
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error('FAIL', m); } };
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------------------------------------ capture plans from the real builders
const plans = [];   // { src, plan }
const captured = (src, fn) => { const arr = []; globalThis.__TFG_STAIR_LOG = arr; try { fn(); } finally { globalThis.__TFG_STAIR_LOG = null; } for (const p of arr) plans.push({ src, plan: p }); return arr.length; };
const stubOut = () => new Proxy({ terrain: { heightAt: () => 2, slopeAt: () => 0 } }, { get: (t, k) => (k in t ? t[k] : (t[k] = [])) });
const mkB = (seed) => { const calls = []; return { calls, B: { gb: new FrameGeo(), addBox: (...a) => { calls.push(a); return null; }, R: new RNG(seed), boxes: 0, emitters: [], extra: [], group: null } }; };
const rampCalls = (calls) => calls.filter((a) => a[6] && typeof a[6] === 'object').length;

for (const seed of [11, 222, 3333]) {
  // Soviet blocks: 2-4 storeys, 1-3 sections
  for (const [nSec, nF] of [[1, 3], [2, 4], [3, 3]]) {
    const { B, calls } = mkB(seed); const S = new W2Solids(B);
    const site = { x: 100, z: -40, rot: (seed % 4) * Math.PI / 2 + 0.3, y0: 5, yLo: 4.4, nSec, nF };
    const n = captured('soviet', () => { try { buildBlock(S, site, new RNG(seed ^ nSec), stubOut()); } catch (e) { console.error('soviet build', e); fails++; } });
    ok(n === nSec * nF, `soviet ${nSec}x${nF}: ${n} flights (expected ${nSec * nF})`);
    ok(rampCalls(calls) === n, `soviet: one ramp collider per flight (${rampCalls(calls)} vs ${n})`);
  }
  // Landmarks: towers (3-5 flights) and ruins (2-3 storeys)
  for (const fl of [3, 4, 5]) {
    const { B, calls } = mkB(seed); const S = new LmSolids(B);
    const n = captured('tower', () => { try { buildTower(S, { flights: fl, y0: 2, yLo: 1.2, x: 50, z: 20, rot: seed * 0.37, style: fl % 2 ? 'radio' : 'watch', idx: 0 }, new RNG(seed), stubOut(), 1, 0); } catch (e) { console.error('tower build', e); fails++; } });
    ok(n === fl && rampCalls(calls) === fl, `tower ${fl}: ${n} flights, ${rampCalls(calls)} ramps`);
  }
  for (const fl of [2, 3]) {
    const { B, calls } = mkB(seed); const S = new LmSolids(B);
    const n = captured('ruin', () => { try { buildRuin(S, { floors: fl, y0: 2, yLo: 1.2, x: -30, z: 70, rot: seed * 0.11, idx: 1 }, new RNG(seed), stubOut(), 1, 0); } catch (e) { console.error('ruin build', e); fails++; } });
    ok(n >= fl && rampCalls(calls) === n, `ruin ${fl}: ${n} flights, ${rampCalls(calls)} ramps`);
  }
  // Twin-sun sand crawler rear ramp
  {
    const { B, calls } = mkB(seed); const S = new W2Solids(B);
    const n = captured('crawler', () => { try { crawler({ R: new RNG(seed) }, S, new RNG(seed), { x: 10, z: 10, y0: 3, yLo: 2.4 }, seed * 0.5, stubOut()); } catch (e) { console.error('crawler build', e); fails++; } });
    ok(n === 1 && rampCalls(calls) === 1, `crawler: ${n} ramps`);
  }
}

// Horror mansion (horror_pocket + horror_maps spec) - buildPocket needs three + canvas textures; fall back to the spec numbers if it cannot run in node
{
  const { MANSION } = await import('../../src/game/horror_maps.js');
  const { buildPocket } = await import('../../src/game/horror_pocket.js');
  const boxes = [];
  const physics = { addStaticBox: (...a) => { boxes.push(a); return { handle: boxes.length }; } };
  let built = false;
  const n = captured('mansion', () => { try { buildPocket(MANSION, { physics, lightPool: { register() {}, add() {} }, ox: 8000, oz: 0, y: 0, seed: 5 }); built = true; } catch (e) { log('note: buildPocket not runnable in node (' + String(e.message).slice(0, 60) + ') - planning from the spec'); } });
  if (!built && n === 0) {
    const T = 2;
    captured('mansion(spec)', () => { for (const s of MANSION.stairs) planStairs({ x: 8000 + s.x * T + s.w * T / 2, z: (s.z + s.len) * T, y: 0, dir: 'z-', width: s.w * T, rise: s.rise, run: s.len * T, n: Math.round(s.len * T / 0.5), tag: 'mansion' }); });
  } else ok(boxes.some((a) => a[6] && typeof a[6] === 'object'), 'mansion: a ramp collider was created');
}

// stairs_metal prop (facility catwalks): the collider list must hold ONE ramp with a quaternion
{
  let propOk = false;
  try {
    const { createProp } = await import('../../src/models/props.js');
    let o = null;
    const n = captured('stairs_metal', () => { o = createProp('stairs_metal', { seed: 1 }); });
    const cols = o.userData.colliders || [];
    const ramps = cols.filter((c) => c.q);
    propOk = n === 1 && ramps.length === 1 && o.userData.stairs && o.userData.stairs.rise === 3;
    ok(propOk, `stairs_metal prop: 1 ramp collider (${ramps.length}), stairs info ${JSON.stringify(o.userData.stairs)}`);
    ok(cols.length <= 15, `stairs_metal colliders ${cols.length} <= old 15`);
  } catch (e) { log('note: props.js not loadable in node:', String(e.message).slice(0, 80)); captured('stairs_metal(spec)', () => planStairs({ x: 0, z: 2.5, y: 0, dir: 'z-', width: 2, rise: 3, run: 5, n: 15, landing: 0 })); }
}

log(`captured ${plans.length} stair flights:`, Object.entries(plans.reduce((m, p) => (m[p.src] = (m[p.src] || 0) + 1, m), {})).map(([k, v]) => k + '=' + v).join(' '));
ok(plans.length > 40, 'enough stairs captured');

// ------------------------------------------------------------------------------------------------ static checks
for (const { src, plan } of plans) {
  const errs = checkStairs(plan);
  ok(errs.length === 0, `${src} ${plan.tag}: ${errs.join('; ')}`);
  ok(plan.slopeDeg <= LIMITS.maxSlopeDeg && plan.slopeDeg <= DESIGN_MAX_SLOPE_DEG, `${src}: slope ${plan.slopeDeg.toFixed(1)}`);
  // entry / exit: no lip above stepHeight (ramp surface starts at the floor height and ends at the top height)
  ok(plan.ramp.cy < plan.y + plan.rise + 0.01, `${src}: ramp centre below top`);
  const first = plan.steps[0], last = plan.steps[plan.steps.length - 1];
  ok(first.top - plan.y <= LIMITS.stepHeight && Math.abs(last.top - (plan.y + plan.rise)) < 1e-6, `${src}: first riser / last step top`);
  for (let i = 1; i < plan.steps.length; i++) ok(plan.steps[i].top - plan.steps[i - 1].top <= LIMITS.stepHeight, `${src}: visual riser ${i}`);
  // collider count no higher than the stepped version had (one box per step)
  ok(plan.boxes.length + 1 <= plan.n + 2, `${src}: ${plan.boxes.length + 1} colliders for ${plan.n} steps`);
}
const maxSlope = Math.max(...plans.map((p) => p.plan.slopeDeg));
log('max slope over all stairs: ' + maxSlope.toFixed(1) + ' deg (controller climbs ' + LIMITS.maxSlopeDeg + ')');

// frame conversion: rampWorld agrees with rotating the local surface midpoint
{
  const plan = planStairs({ x: 3, z: -2, y: 1, dir: 'x-', width: 1.4, rise: 3, run: 3.2, n: 10 });
  for (const rot of [0, 0.7, 2.1, -1.3]) {
    const fr = { x: 40, z: 25, rot }, r = rampWorld(plan, fr);
    const rotv = (q, v) => { const cx = q.y * v[2] - q.z * v[1], cy = q.z * v[0] - q.x * v[2], cz = q.x * v[1] - q.y * v[0]; const dx = q.y * cz - q.z * cy, dy = q.z * cx - q.x * cz, dz = q.x * cy - q.y * cx; return [v[0] + 2 * (q.w * cx + dx), v[1] + 2 * (q.w * cy + dy), v[2] + 2 * (q.w * cz + dz)]; };
    const n = rotv(r.q, [0, 1, 0]), surf = [r.x + n[0] * plan.th / 2, r.y + n[1] * plan.th / 2, r.z + n[2] * plan.th / 2];
    const [lx, lz] = [plan.x + plan.dir[0] * plan.run / 2, plan.z + plan.dir[1] * plan.run / 2], [wx, wz] = rot2(lx, lz, rot);
    ok(Math.hypot(surf[0] - (fr.x + wx), surf[2] - (fr.z + wz)) < 0.01 && Math.abs(surf[1] - (plan.y + plan.rise / 2)) < 0.01, `rampWorld surface midpoint rot=${rot}`);
    const up = rotv(r.q, [0, 0, 1]), [ddx, ddz] = rot2(plan.dir[0], plan.dir[1], rot);
    ok(Math.abs(up[0] * ddz - up[2] * ddx) < 1e-6 && up[1] > 0.4 && up[0] * ddx + up[2] * ddz > 0, `rampWorld climbs along the rotated direction rot=${rot}`);
  }
}

// ------------------------------------------------------------------------------------------------ kinematic walk simulation (real Rapier controller)
const RAD = LIMITS.radius, HALF = 0.56;
/** canonical frame: flight starts at along = 0 (z), climbs +z, lateral = x. Returns { top reached, along, feetY, t } */
function simulate(plan, { speed, lat, stepped = false, walls = true, jumpHold = false }) {
  const ph = new Physics(), w = plan.width, y0 = plan.y, y1 = plan.y + plan.rise;
  ph.addStaticBox(0, y0 - 0.5, -4, 12, 0.5, 4);                       // floor in front (top at y0)
  ph.addStaticBox(0, y1 - 0.5, plan.run + 4, 12, 0.5, 4);             // top platform (top at y1)
  if (walls) for (const s of [-1, 1]) ph.addStaticBox(s * (w / 2 + 0.3), (y0 + y1) / 2 + 1, plan.run / 2, 0.3, (y1 - y0) / 2 + 3, plan.run / 2 + 6);
  if (stepped) {
    for (let i = 0; i < plan.n; i++) { const top = y0 + plan.riser * (i + 1); ph.addStaticBox(0, (top + y0) / 2 - 0.0, plan.tread * (i + 0.5), w / 2, (top - y0) / 2, plan.tread / 2); }
  } else {
    // the plan's colliders converted to the canonical frame
    const [dx, dz] = plan.dir, axisX = dx !== 0;
    for (const b of plan.boxes) {
      const along = (b.cx - plan.x) * dx + (b.cz - plan.z) * dz, len = axisX ? b.sx : b.sz;
      ph.addStaticBox(0, b.cy, along, w / 2, b.sy / 2, len / 2);
    }
    const r = plan.ramp, along = (r.cx - plan.x) * dx + (r.cz - plan.z) * dz;
    ph.addStaticBox(0, r.cy, along, r.sx / 2, r.sy / 2, r.sz / 2, rampQuat(0, 1, r.pitch));
  }
  const start = { x: 0, y: y0 + HALF + RAD + 0.02, z: -1.6 };
  const { body, col } = ph.createKinematicCapsule(start, HALF, RAD, G.PLAYER, G.STATIC | G.DOOR, { kind: 'p' });
  const ctrl = ph.createController(0.02);
  ph.world.step();
  let pos = { ...start }, vel = { x: 0, y: 0, z: 0 }, grounded = false, t = 0, reached = -1;
  const dt = 1 / 60;
  for (; t < 14; t += dt) {
    vel.z += (speed - vel.z) * Math.min(1, 20 * dt);
    vel.x += (lat * speed - vel.x) * Math.min(1, 20 * dt);
    if (!grounded || vel.y > 0) vel.y -= 19.6 * dt; else vel.y = -1.0;
    const d = { x: vel.x * dt, y: (grounded && vel.y <= 0) ? 0 : vel.y * dt, z: vel.z * dt };
    ctrl.computeColliderMovement(col, d, undefined, groups(G.PLAYER, G.STATIC | G.DOOR));
    const mv = ctrl.computedMovement(); grounded = ctrl.computedGrounded();
    pos = { x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z };
    body.setNextKinematicTranslation(pos); body.setTranslation(pos, true); ph.world.step();
    if (Math.abs(mv.x) < Math.abs(vel.x) * dt * 0.3) vel.x = mv.x / dt;
    if (Math.abs(mv.z) < Math.abs(vel.z) * dt * 0.3) vel.z = mv.z / dt;
    const feet = pos.y - HALF - RAD;
    if (reached < 0 && feet >= y1 - 0.08 && pos.z >= plan.run + 0.3) { reached = t; break; }
  }
  return { reached: reached >= 0, t: reached, along: pos.z, feetY: pos.y - HALF - RAD };
}

const seen = new Set();
let simN = 0, oldFails = 0, oldN = 0;
for (const { src, plan } of plans) {
  const key = [src, plan.width, plan.rise, plan.run, plan.n].join('|');
  if (seen.has(key)) continue; seen.add(key);
  for (const speed of [LIMITS.walk, LIMITS.sprint]) for (const lat of [0, 0.5, -0.5]) {
    const r = simulate(plan, { speed, lat });
    simN++;
    ok(r.reached, `walk-sim ${src}/${plan.tag} speed ${speed} lateral ${lat}: feetY ${r.feetY.toFixed(2)} along ${r.along.toFixed(2)} / top ${plan.rise.toFixed(2)}`);
    if (lat !== 0) { oldN++; const o = simulate(plan, { speed, lat, stepped: true }); if (!o.reached) oldFails++; }
  }
}
log(`walk simulations: ${simN} runs over ${seen.size} distinct flights, all reach the top platform`);
log(`for comparison the OLD stepped colliders failed ${oldFails}/${oldN} of the wall-hugging runs (autostep stalls)`);
ok(oldFails > 0, 'baseline: stepped colliders stall when pressing into the wall (documents the bug)');

// ------------------------------------------------------------------------------------------------ ladders
{
  const L = makeLadder({ x: 10, z: 5, y0: 0, top: 4.5, r: 0.6, face: { x: 0, z: -1 } });
  const face = (yaw) => ({ pos: { x: 10, y: 1, z: 5.2 }, yaw });
  let r = ladderStep(L, { climbing: false }, { ...face(0), up: true, down: false, grounded: false }, 3, 1 / 60);
  ok(r.inVol && r.climbing && Math.abs(r.vy - (3 + 19.6 / 60)) < 1e-6, 'ladder: facing + up grabs, net climb speed');
  r = ladderStep(L, { climbing: false }, { ...face(Math.PI), up: true, down: false, grounded: false }, 3, 1 / 60);
  ok(!r.climbing && r.vy === null, 'ladder: facing away does not grab');
  r = ladderStep(L, { climbing: true }, { pos: { x: 10, y: 0.1, z: 5 }, yaw: 0, up: false, down: true, grounded: true }, 3, 1 / 60);
  ok(!r.climbing, 'ladder: down at the foot lets go');
  r = ladderStep(L, { climbing: true }, { pos: { x: 14, y: 2, z: 5 }, yaw: 0, up: true, down: false, grounded: false }, 3, 1 / 60);
  ok(!r.inVol && !r.climbing && r.vy === null, 'ladder: outside the volume lets go');
  // integrate: climbing from the foot reaches the top in ~ (4.5 / 3) s
  let y = 0.05, st = { climbing: false }, tt = 0;
  for (; tt < 4; tt += 1 / 60) { const o = ladderStep(L, st, { pos: { x: 10, y, z: 5.2 }, yaw: 0, up: true, down: false, grounded: false }, 3, 1 / 60); st = { climbing: o.climbing }; if (!o.inVol) break; y += (o.vy - 19.6 / 60) / 60 * 1; }
  ok(y >= 4.4 && tt < 2.0, `ladder climb integrates to the top (y ${y.toFixed(2)} in ${tt.toFixed(2)} s)`);
}

log(fails ? `\n${fails} FAILED of ${checks} checks` : `\nall ${checks} checks passed`);
process.exit(fails ? 1 : 0);
