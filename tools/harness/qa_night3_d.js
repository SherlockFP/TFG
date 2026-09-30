// QA night 3, run D (fresh tab, ONE landing): dune checkpoint beam + landQ warm report.  The real-time takeoff step (qa_night3_takeoff.js) OOM-killed the tab (7.7 GB) on software GL.   (prepend qa_night2_lib.js)
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 2500));
const gyAt = (x, z) => g.world.outdoor?.terrain?.heightAt?.(x, z) ?? 0;
async function warm(tag) { R['warm_' + tag] = g.landQ.last.filter((e) => /^warm/.test(e.name)).map((e) => e.name + ':' + Math.round(e.ms)).slice(0, 14); const pi = g.perfInfo(); R['perf_' + tag] = { programs: pi.programs, geo: pi.geometries, tex: pi.textures, warmMs: pi.warm.ms, built: pi.warm.built, prog: [pi.warm.programsBefore, pi.warm.programsAfter] }; R['landTop_' + tag] = g.landQ.report().slice(0, 5).map((e) => e.name + ':' + Math.round(e.ms)); }
await step('dune', async () => {
  const info = await land('ex_dune', false); R.landDune = info; await warm('dune'); const S = g.expeditions.state, P = S.P; g.player.inShip = false;
  const c1 = P.route[1]; R.c1 = [c1.x, c1.z].map((v) => Math.round(v)); R.c1d = Math.round(Math.hypot(c1.x, c1.z));
  look(0, gyAt(0, 12) + 0.1, 12, yaw2(0, 12, c1.x, c1.z), 0.12); await frames(30);
  await shot('n3_dune.jpg');
});
dump('dune');
R.errs = 'see LOGS'; return R;
