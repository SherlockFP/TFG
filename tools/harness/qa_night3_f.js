// QA night 3, run F (fresh tab, ONE landing): Rooftop Blackout City from a rooftop + landQ warm report.   (prepend qa_night2_lib.js)
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 2500));
const gyAt = (x, z) => g.world.outdoor?.terrain?.heightAt?.(x, z) ?? 0;
async function warm(tag) { R['warm_' + tag] = g.landQ.last.filter((e) => /^warm/.test(e.name)).map((e) => e.name + ':' + Math.round(e.ms)).slice(0, 14); const pi = g.perfInfo(); R['perf_' + tag] = { programs: pi.programs, geo: pi.geometries, tex: pi.textures, warmMs: pi.warm.ms, built: pi.warm.built, prog: [pi.warm.programsBefore, pi.warm.programsAfter] }; R['landTop_' + tag] = g.landQ.report().slice(0, 5).map((e) => e.name + ':' + Math.round(e.ms)); }
await step('roof', async () => {
  const info = await land('ex_roof', false); R.landRoof = info; const S = g.expeditions.state, P = S.P; g.player.inShip = false;
  const bb = P.bbs[0], c = P.spawnCell; R.cell = [c.x, c.y, c.z].map((v) => +v.toFixed(1)); R.bb = [bb.x, bb.y, bb.z].map((v) => +v.toFixed(1));
  const dx = bb.x - c.x, dz = bb.z - c.z, dl = Math.hypot(dx, dz) || 1, fx = bb.x - (dx / dl) * 9, fz = bb.z - (dz / dl) * 9;
  look(fx, Math.max(gyAt(fx, fz), c.y) + 0.1, fz, yaw2(fx, fz, bb.x, bb.z), 0.18); await frames(30); await shot('n3_roof.jpg');
});
dump('roof');
R.errs = 'see LOGS'; return R;
