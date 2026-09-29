// wave4 checkup step 3: the special moons. worlds2 Soviet + twin-sun, Backrooms Level 0 moon + noclip pocket, mirror
// dimension, homeworld (+ panel), Sector Core (via debug: cycle stage 'gate'). Each: land, tick, NaN scan, draw calls, shots.
const out = { moons: [] };
const { MOONS } = await import('/src/game/moons.js');
out.moonIds = Object.keys(MOONS);
g.run.credits = Math.max(g.run.credits, 5000);
if (g.run.phase !== 'orbit') await takeoff();
g.run.daysLeft = 3;
const visit = async (id, extra) => {
  const r = { id, exists: !!MOONS[id] };
  if (!r.exists) { out.moons.push(r); return r; }
  const e0 = errs.length;
  try {
    const t0 = performance.now();
    r.land = await land(id);
    r.ms = Math.round(performance.now() - t0);
    const ex = g.world.outdoor?.mainExit;
    r.outStats = stats();
    // look at the ship from 16 m out, then the facility
    g.player.inShip = false;
    const gy = (x, z) => (g.world.terrain?.heightAt?.(x, z) ?? 0);
    g.player.teleport(V(2, gy(2, 16) + 0.3, 16), 0); await tick(6, true);
    await shot('ck_w_' + id + '_out');
    if (extra) r.extra = await extra(r);
    if (ex && g.world.facility) { g.useExit(0, true); await tick(12, true); r.inStats = stats(); r.indoor = g.player.indoor; await shot('ck_w_' + id + '_in'); g.useExit(0, false); await tick(4); }
    kefal.tick(90, 1 / 10, false); await sleep(5);   // 9 s of sim
    r.nan = nanScan(id);
    r.creatures = g.creatures.host.size;
    r.takeoff = await takeoff();
  } catch (e) { r.THROW = String(e.stack || e).slice(0, 500); try { await takeoff(); } catch { /* */ } }
  r.errs = [...new Set(errs.slice(e0))].slice(0, 8);
  g.ui.clearCinematics?.(); g.ui.closePanel?.(); g.run.daysLeft = 3;
  out.moons.push(r);
  return r;
};
await visit('w2sov', async () => ({ w2: g.worlds2 && Object.keys(g.worlds2).slice(0, 12), raid: g.run.w2?.raid ?? null }));
await visit('w2sun');
await visit('br_level0', async () => {
  const R = {};
  try { g.backrooms.enter('debug'); for (let i = 0; i < 10; i++) { kefal.tick(10, 1 / 30, false); await sleep(20); } R.inPocket = g.backrooms.inPocket?.(); R.pos = g.player.pos.toArray().map(r1); R.stats = stats(); await shot('ck_w_backrooms_pocket'); g.backrooms.exit?.(); await tick(20); R.after = g.backrooms.inPocket?.(); } catch (e) { R.THROW = String(e).slice(0, 300); }
  return R;
});
await visit('lufer', async () => {
  const R = {};
  try {
    const p = g.mirror.forcePortal(10, 20); await tick(10);
    R.portal = !!p;
    g.player.teleport(V(10, (g.world.terrain?.heightAt?.(10, 23) ?? 0) + 0.3, 23), 0); await tick(4, true);
    await shot('ck_w_mirror_portal');
    g.mirror.enter(); for (let i = 0; i < 10; i++) { kefal.tick(10, 1 / 30, false); await sleep(20); }
    R.inside = g.mirror.inside; R.pos = g.player.pos.toArray().map(r1); R.stats = stats();
    await shot('ck_w_mirror_inside');
    g.mirror.exit(); for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(20); }
    R.after = g.mirror.inside;
  } catch (e) { R.THROW = String(e).slice(0, 300); }
  return R;
});
if (MOONS.home) await visit('home', async () => {
  const R = {};
  g.homeworld.open(); await tick(3, true); R.panel = panelInfo(); await shot('ck_w_home_panel'); g.ui.closePanel?.(); await tick(2);
  return R;
});
// Sector Core (debug)
try {
  const c = g.run.cycle;
  out.cycle0 = c && { mode: c.mode, stage: c.stage, sector: c.sector };
  if (c) { c.stage = 'gate'; g.cycle.registerMoons(); const cid = g.cycle.plan.coreId(c.sector); out.coreId = cid; await visit(cid, async () => ({ boss: [...g.creatures.host.values()].filter((x) => x.boss || /boss|balancer|manager|hydra/i.test(x.type)).map((x) => x.type), stage: g.run.cycle.stage })); }
} catch (e) { out.coreTHROW = String(e.stack || e).slice(0, 400); }
out.errs = newErrs();
return out;
