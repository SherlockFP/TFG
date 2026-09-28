// Node test for the pure grenade rules (src/game/grenades_core.js): arc prediction + bounce physics, fuse / cook timings,
// effect radii table, smoke sight lines, flash exposure, rare drop tables.   Run: node tools/harness/grenades.test.mjs
import * as C from '../../src/game/grenades_core.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} +-${tol}`);

// ---- test world: floor at y = 0, wall at x = 12 (normal -x)
const ray = (ox, oy, oz, dx, dy, dz, len) => {
  let best = null;
  if (dy < -1e-9) { const t = -oy / dy; if (t >= 0 && t <= len) best = { distance: t, nx: 0, ny: 1, nz: 0 }; }
  if (dx > 1e-9) { const t = (12 - ox) / dx; if (t >= 0 && t <= len && (!best || t < best.distance)) best = { distance: t, nx: -1, ny: 0, nz: 0 }; }
  return best;
};

// ---- 1. arc prediction ---------------------------------------------------------------------------------------------
{
  const o = { x: 0, y: 1.5, z: 0 }, v = { x: 8, y: 6, z: 0 };
  const a = C.predictArc(o, v, ray, { maxT: 6, sample: 0.05, h: 1 / 120 });
  // analytic: 1.5 + 6t - (g/2)t^2 = BALL_R
  const g = C.GRAV, tHit = (6 + Math.sqrt(36 + 2 * g * (1.5 - C.BALL_R))) / g;
  near(a.firstImpact.t, tHit, 0.03, 'first impact time');
  near(a.firstImpact.x, 8 * tHit, 0.25, 'first impact distance');
  near(a.apex, 1.5 + 36 / (2 * g), 0.08, 'apex height');
  ok(a.bounces >= 1, 'bounces at least once');
  ok(a.rest, 'comes to rest within 6 s');
  ok(a.pts.length > 10 && a.pts[0][3] === 0, 'samples start unbounced');
  ok(a.pts.some((p) => p[3] >= 1), 'samples after the bounce are flagged');
  // the second arc is lower than the first (energy lost)
  const apexes = []; let prev = null, best = -1;
  for (const p of a.pts) { if (p[3] !== prev) { if (prev !== null) apexes.push(best); prev = p[3]; best = -1; } best = Math.max(best, p[1]); }
  apexes.push(best);
  ok(apexes.length >= 2 && apexes[1] < apexes[0] - 0.5, `bounce apex lower than throw apex (${apexes.map((x) => x.toFixed(2))})`);
  // determinism: same call, same numbers
  const b = C.predictArc(o, v, ray, { maxT: 6, sample: 0.05, h: 1 / 120 });
  ok(JSON.stringify(a.end) === JSON.stringify(b.end), 'prediction is deterministic');
}
{
  // frame-rate independence: the live sim sub-steps at 1/60, so 30 fps and 60 fps frames land in the same place
  const run = (dt) => { const p = C.makeBall({ x: 0, y: 1.6, z: 0 }, { x: 9, y: 4, z: 1 }, {}); for (let i = 0; i < Math.round(2.4 / dt); i++) C.advanceBall(p, dt, ray); return p; };
  const p60 = run(1 / 60), p30 = run(1 / 30);
  near(p60.x, p30.x, 1e-6, '30 vs 60 fps x'); near(p60.y, p30.y, 1e-6, '30 vs 60 fps y'); near(p60.z, p30.z, 1e-6, '30 vs 60 fps z');
  const p20 = run(0.02);
  near(p60.x, p20.x, 0.35, '50 fps stays close');
}
{
  // wall bounce reflects, roll ends at rest on the floor, sticky charge sticks to the wall
  const a = C.predictArc({ x: 6, y: 1.5, z: 0 }, { x: 14, y: 2, z: 0 }, ray, { maxT: 4 });
  ok(a.firstImpact && a.firstImpact.x > 11.5 && a.firstImpact.x < 12, 'wall impact position');
  const pMax = Math.max(...a.pts.map((p) => p[0]));
  ok(pMax < 12, 'ball never passes the wall');
  ok(a.pts[a.pts.length - 1][0] < 12 - 0.5, 'reflected ball comes back');
  const s = C.predictArc({ x: 6, y: 1.5, z: 0 }, { x: 14, y: 2, z: 0 }, ray, { maxT: 4, sticky: true });
  ok(s.stuck && !s.rest, 'sticky stuck');
  near(s.end.x, 12 - C.BALL_R, 0.1, 'sticky sits on the wall');
  const s2 = C.predictArc({ x: 0, y: 1.5, z: 0 }, { x: 3, y: 0, z: 0 }, ray, { maxT: 4, sticky: true });
  ok(s2.stuck && s2.end.y < 0.2, 'sticky sticks to the floor too');
  // rolling: a low, slow throw lands and rolls a few metres, never bounces high
  const r = C.predictArc({ x: 0, y: 0.5, z: 0 }, { x: 4, y: 0, z: 0 }, ray, { maxT: 8 });
  ok(r.rest && r.end.x > 2 && r.end.x < 9, `rolls then rests (x=${r.end.x.toFixed(2)})`);
  near(r.end.y, C.BALL_R, 0.03, 'rests on the floor');
}

// ---- 2. throw model ------------------------------------------------------------------------------------------------
{
  ok(C.throwPower(0) === C.THROW.basePower, 'tap power is the base power');
  ok(C.throwPower(C.THROW.chargeT) === 1 && C.throwPower(5) === 1, 'full power caps at chargeT');
  ok(C.throwPower(0.3) < C.throwPower(0.6), 'power grows with the hold');
  near(C.cookTime(0.5), 0, 1e-9, 'no cook before full power'); near(C.cookTime(1.5), 0.5, 1e-9, 'cook after full power'); near(C.cookTime(10), C.THROW.cookMax, 1e-9, 'cook capped');
  ok(C.throwSpeed(1) === C.THROW.maxSpeed && C.throwSpeed(0) === C.THROW.minSpeed, 'speed range');
  const fwd = { x: 0, y: 0, z: -1 };
  const range = (hold) => { const v = C.throwVelocity(fwd, C.throwPower(hold), { x: 0, z: 0 }); return -C.predictArc({ x: 0, y: 1.6, z: 0 }, { x: v.x, y: v.y, z: v.z }, (ox, oy, oz, dx, dy, dz, len) => { if (dy < -1e-9) { const t = -oy / dy; if (t >= 0 && t <= len) return { distance: t, nx: 0, ny: 1, nz: 0 }; } return null; }, { maxT: 0.05 }).end.z; };
  const landZ = (hold) => { const v = C.throwVelocity(fwd, C.throwPower(hold), { x: 0, z: 0 }); const t = (v.y + Math.sqrt(v.y * v.y + 2 * C.GRAV * 1.6)) / C.GRAV; return -v.z * t; };
  void range;
  ok(landZ(1) > 1.8 * landZ(0), `full throw goes much farther than a tap (${landZ(0).toFixed(1)} m vs ${landZ(1).toFixed(1)} m)`);
  ok(landZ(1) > 18 && landZ(1) < 35, `full-power range is sane (${landZ(1).toFixed(1)} m)`);
  const vi = C.throwVelocity(fwd, 1, { x: 6, z: 0 });
  ok(Math.hypot(vi.x, vi.y, vi.z) <= C.MAX_SPEED + 2 + 1e-9, 'inherited velocity is clamped');
}

// ---- 3. fuse timings + beeps ---------------------------------------------------------------------------------------
{
  const F = { stun: 2.2, flash: 1.6, smoke: 1.2, decoy: 1.0, sticky: 2.5, cryo: 1.5, molotov: 1.4, emp: 1.5, gravity: 1.8, blackout: 1.6, confetti: 1.5, glitch: 2.0, cluster: 1.6, mini: 1.1 };
  for (const [k, f] of Object.entries(F)) near(C.KINDS[k].fuse, f, 1e-9, `${k} fuse`);
  near(C.fuseAfterCook('flash', 0), 1.6, 1e-9, 'no cook = full fuse');
  near(C.fuseAfterCook('flash', 1), 0.6, 1e-9, 'cooking 1 s shortens the fuse by 1 s');
  near(C.fuseAfterCook('flash', 1.5), C.THROW.minFuse, 1e-9, 'fuse never below the minimum');
  near(C.fuseAfterCook('sticky', 1.5), 2.5, 1e-9, 'sticky charge keeps its 2.5 s post-stick fuse');
  ok(C.beepInterval(1.6, 1.6) > C.beepInterval(0.8, 1.6) && C.beepInterval(0.8, 1.6) > C.beepInterval(0.05, 1.6), 'beeps speed up');
  near(C.beepInterval(1.6, 1.6), 0.6, 1e-9, 'first beep interval'); near(C.beepInterval(0, 1.6), 0.075, 1e-9, 'last beep interval');
}

// ---- 4. effect table -----------------------------------------------------------------------------------------------
{
  const R = { stun: 12, flash: 14, smoke: 5.5, sticky: 4.2, cryo: 5, molotov: 3.2, emp: 10, gravity: 9, blackout: 16, confetti: 9, glitch: 8, mini: 3.4 };
  for (const [k, r] of Object.entries(R)) near(C.EFFECT_RADII[k], r, 1e-9, `${k} radius`);
  ok(Object.keys(C.EFFECT_RADII).length === Object.keys(R).length, 'no undocumented radius');
  const K = C.KINDS;
  near(K.smoke.dur, 20, 0, 'smoke lasts 20 s'); near(K.decoy.dur, 10, 0, 'decoy lasts 10 s'); near(K.gravity.dur, 4, 0, 'gravity well lasts 4 s'); near(K.blackout.dur, 20, 0, 'blackout lasts 20 s');
  near(K.glitch.freeze, 6, 0, 'glitch freezes 6 s'); near(K.confetti.dance, 2, 0, 'confetti dance 2 s'); ok(K.cluster.mini === 5, 'cluster splits into 5');
  ok(K.flash.stunMin === 3 && K.flash.stunMax === 4, 'flashbang stuns 3-4 s');
  ok(K.sticky.sticky && K.sticky.dmg >= 100, 'sticky charge sticks and hits hard');
  for (const k of C.RARE_KINDS) ok(!K.rare || (K[k].price === undefined && K[k].item && K[k].rare), `${k} is rare, unsold and has an item`);
  ok(C.RARE_KINDS.length === 5 && ['gravity', 'blackout', 'confetti', 'glitch', 'cluster'].every((k) => C.RARE_KINDS.includes(k)), 'five rare bombs');
  ok(K.glitch.tier === 'mythic', 'glitch bomb is mythic');
  for (const k of ['flash', 'smoke', 'decoy']) ok(K[k].price > 0 && K[k].stack >= 2, `${k} is sold in stacks`);
  ok(C.STORE_KINDS.every((k) => !K[k].rare), 'store never sells rare bombs');
  ok(C.kindOfItem('stungrenade') === 'stun' && C.kindOfItem('craft_cryo') === 'cryo' && C.kindOfItem('craft_decoy') === 'decoy' && C.kindOfItem('bomb_glitch') === 'glitch' && C.kindOfItem('medkit') === null, 'item -> kind map');
}

// ---- 5. smoke / dark zones / flash ---------------------------------------------------------------------------------
{
  const cloud = [{ x: 5, y: 1.2, z: 0, r: 5 }];
  ok(C.smokeBlocks({ x: 0, y: 1.5, z: 0 }, { x: 10, y: 1.5, z: 0 }, cloud), 'sight line through the cloud is blocked');
  ok(!C.smokeBlocks({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.5, z: 8 }, cloud), 'sight line beside the cloud is free');
  ok(!C.smokeBlocks({ x: 4, y: 1.5, z: 0 }, { x: 5.5, y: 1.5, z: 0 }, cloud), 'very close targets are always seen');
  ok(C.smokeBlocks({ x: 0, y: 1.5, z: 4.9 }, { x: 10, y: 1.5, z: 4.9 }, cloud), 'deep graze blocks');
  ok(!C.smokeBlocks({ x: 0, y: 1.5, z: 4.99 }, { x: 10, y: 1.5, z: 4.99 }, cloud), 'shallow graze does not');
  ok(!C.smokeBlocks({ x: 0, y: 1.5, z: 0 }, { x: 10, y: 1.5, z: 0 }, []), 'no clouds, no block');
  near(C.smokeRadius(5.5, 0, 20), 0, 1e-9, 'cloud starts empty'); near(C.smokeRadius(5.5, 1.5, 20), 5.5, 1e-9, 'cloud is full after 1.5 s');
  ok(C.smokeRadius(5.5, 19.9, 20) < 5.5 * 0.4, 'cloud thins out at the end');
  ok(C.inZone({ x: 0, y: 0, z: 0 }, [{ x: 1, y: 0, z: 0, r: 2 }]) && !C.inZone({ x: 9, y: 0, z: 0 }, [{ x: 1, y: 0, z: 0, r: 2 }]), 'zone membership');
  const near1 = C.flashExposure(2, 1, true), away = C.flashExposure(2, -1, true), far = C.flashExposure(12, 1, true);
  ok(near1.amt > 0.9 && near1.dur > 4, `looking at it up close whites you out (${JSON.stringify(near1)})`);
  ok(away.amt > 0 && away.amt < near1.amt * 0.5, 'looking away helps');
  ok(far.amt < near1.amt && far.amt > 0, 'distance helps');
  ok(C.flashExposure(2, 1, false).amt === 0 && C.flashExposure(20, 1, true).amt === 0, 'no line of sight or out of range = unharmed');
  ok(C.pullSpeed(1, 9) > C.pullSpeed(8, 9) && C.pullSpeed(0, 9) <= 6.5, 'gravity well pulls harder near the core');
}

// ---- 6. rare drop tables -------------------------------------------------------------------------------------------
{
  let s = 12345;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const sample = (src, n = 20000) => { const c = {}; let hit = 0; for (let i = 0; i < n; i++) { const k = C.rollRareDrop(src, rnd); if (k) { hit++; c[k] = (c[k] || 0) + 1; } } return { hit: hit / n, c }; };
  ok(C.rollRareDrop('chest:wood', rnd) === null && C.rollRareDrop('nope', rnd) === null, 'wood chests and unknown sources never drop');
  const wood = sample('chest:wood', 2000); ok(wood.hit === 0, 'wood chest 0 %');
  const void_ = sample('chest:void'); near(void_.hit, 0.8, 0.02, 'void chest drop chance');
  const gold = sample('chest:gold'); near(gold.hit, 0.4, 0.02, 'gold chest drop chance');
  const iron = sample('chest:iron'); ok(!iron.c.glitch && !iron.c.gravity && !iron.c.cluster, 'iron chests never give the big ones');
  ok((void_.c.glitch || 0) / (void_.hit * 20000) > 0.1 && (void_.c.glitch || 0) / (void_.hit * 20000) < 0.2, 'glitch share in void chests ~15 %');
  const boss = sample('boss'); near(boss.hit, 1, 0, 'bosses always drop one');
  const world = sample('world'); ok(!world.c.glitch, 'world spawns never give the mythic bomb');
  const mythic = sample('tier:mythic'); ok((mythic.c.glitch || 0) > (mythic.c.cluster || 0), 'mythic creatures favour the glitch bomb');
  for (const src of Object.keys(C.RARE_SOURCES)) for (const k of Object.keys(C.RARE_SOURCES[src].table)) ok(C.RARE_KINDS.includes(k), `${src} only drops rare kinds (${k})`);
}

console.log(`grenades core: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
