// Offline (node + Rapier wasm) measurement of the terrain-snag fix: a character controller with the game's exact settings walks
// straight over a rough heightfield trimesh (3.2 m cells like src/world/terrain.js), with and without the trimesh
// FIX_INTERNAL_EDGES flag.  node tools/harness/fpbody_terrain_offline.mjs
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const f = (v) => (+v).toFixed(3);

function heights(N, step, rough) {
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const H = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = (i - N / 2) * step, z = (j - N / 2) * step;
    H[j * (N + 1) + i] = 3.2 * Math.sin(x * 0.045) * Math.cos(z * 0.038) + 1.1 * Math.sin(x * 0.19 + z * 0.11) + 0.5 * Math.sin(z * 0.37 - x * 0.21) + (rnd() - 0.5) * rough;
  }
  return H;
}

function run(flags, rough, dirAngle, speed = 5, seconds = 12) {
  const world = new RAPIER.World({ x: 0, y: -19.6, z: 0 }); world.timestep = 1 / 60;
  const N = 100, step = 3.2, W = N + 1;
  const H = heights(N, step, rough);
  const verts = new Float32Array(W * W * 3);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const k = (j * W + i) * 3; verts[k] = (i - N / 2) * step; verts[k + 1] = H[j * W + i]; verts[k + 2] = (j - N / 2) * step; }
  const idx = new Uint32Array(N * N * 6); let o = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * W + i, b = a + 1, c = (j + 1) * W + i + 1, d = (j + 1) * W + i; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = a; idx[o++] = d; idx[o++] = c; }
  const desc = flags === null ? RAPIER.ColliderDesc.trimesh(verts, idx) : RAPIER.ColliderDesc.trimesh(verts, idx, flags);
  desc.setFriction(0.9);
  world.createCollider(desc);
  const ctrl = world.createCharacterController(0.02);
  ctrl.setUp({ x: 0, y: 1, z: 0 }); ctrl.enableAutostep(0.42, 0.16, false); ctrl.enableSnapToGround(0.4);
  ctrl.setMaxSlopeClimbAngle(50 * Math.PI / 180); ctrl.setMinSlopeSlideAngle(60 * Math.PI / 180); ctrl.setSlideEnabled(true); ctrl.setCharacterMass(80);
  const HALF = 0.56, R = 0.34;
  const x0 = -60 * Math.cos(dirAngle) - 20, z0 = -60 * Math.sin(dirAngle) + 10;
  const y0 = 12;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x0, y0, z0));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(HALF, R), body);
  let vy = 0, grounded = false, t = { x: x0, y: y0, z: z0 };
  const dx = Math.cos(dirAngle) * speed / 60, dz = Math.sin(dirAngle) * speed / 60;
  const trace = [];
  for (let fr = 0; fr < seconds * 60; fr++) {
    vy = grounded ? -1 : Math.max(vy - 19.6 / 60, -45);
    ctrl.computeColliderMovement(col, { x: dx, y: vy / 60, z: dz });
    const m = ctrl.computedMovement(); grounded = ctrl.computedGrounded();
    t = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    body.setTranslation(t, true); body.setNextKinematicTranslation(t);
    world.step();
    if (fr > 90) trace.push({ hx: m.x, hz: m.z, y: t.y, g: grounded });   // after the initial drop
  }
  world.free();
  // metrics: horizontal speed along the heading (the controller may slide off the line, so use the magnitude), vertical second difference
  const sp = trace.map((q) => Math.hypot(q.hx, q.hz) * 60);
  const mean = sp.reduce((a, b) => a + b, 0) / sp.length;
  const std = Math.sqrt(sp.reduce((a, b) => a + (b - mean) ** 2, 0) / sp.length);
  const snag = sp.filter((v) => v < 0.7 * speed).length;
  let jerk = 0, jmax = 0, ungr = 0;
  for (let i = 2; i < trace.length; i++) { const d2 = Math.abs(trace[i].y - 2 * trace[i - 1].y + trace[i - 2].y); jerk += d2; jmax = Math.max(jmax, d2); }
  for (const q of trace) if (!q.g) ungr++;
  return { mean, std, min: Math.min(...sp), snag, jerkAvg: jerk / trace.length, jerkMax: jmax, ungrounded: ungr, n: trace.length };
}

const variants = [['none (shipped)', null], ['FIX_INTERNAL_EDGES', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES], ['FIX_INTERNAL_EDGES_TWO_SIDED', RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED]];
for (const rough of [0.0, 0.5]) {
  console.log(`--- terrain roughness ${rough} m (per-vertex noise), 8 headings x 12 s at 5 m/s`);
  for (const [name, flags] of variants) {
    const agg = { mean: 0, std: 0, min: 9, snag: 0, jerkAvg: 0, jerkMax: 0, ungrounded: 0, n: 0 };
    for (let h = 0; h < 8; h++) {
      const r = run(flags, rough, h * Math.PI / 4 + 0.13);
      agg.mean += r.mean / 8; agg.std += r.std / 8; agg.min = Math.min(agg.min, r.min); agg.snag += r.snag; agg.jerkAvg += r.jerkAvg / 8; agg.jerkMax = Math.max(agg.jerkMax, r.jerkMax); agg.ungrounded += r.ungrounded; agg.n += r.n;
    }
    console.log(name.padEnd(30), 'speed mean', f(agg.mean), 'std', f(agg.std), 'min', f(agg.min), '| frames <70% speed', agg.snag, '/', agg.n, '| y 2nd-diff avg', f(agg.jerkAvg), 'max', f(agg.jerkMax), '| ungrounded frames', agg.ungrounded);
  }
}
