// wave7 perf2: renderer.info for orbit + landed (outdoor spot + ship deck) at Medium / Low, each level re-lands the moon so the decor thinning applies.
// Body of an async fn for headless.mjs. Run with --url '/?autohost=local&code=T1&name=Tester&nomerge=1' for the "ship prop merge off" baseline.
const g = kefal.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), V = (x, y, z) => new THREE.Vector3(x, y, z);
const out = { q: {}, errs: [] };
addEventListener('error', (e) => out.errs.push(String(e.message).slice(0, 200)));
const ticks = async (n, dt = 1 / 30) => { for (let i = 0; i < n; i += 10) { kefal.tick(Math.min(10, n - i), dt, false); await sleep(3); } };
const snap = () => { kefal.tick(2, 1 / 30, true); const s = kefal.engine.sceneStats; return { calls: s.calls, tris: s.tris, geos: kefal.engine.renderer.info.memory.geometries }; };
const setQ = (l) => { kefal.settings.quality = l; kefal.applySettings(); };
const meshCount = (root) => { let m = 0; root.traverse((o) => { if (o.isMesh && o.visible) m++; }); return m; };
const takeoff = async () => { g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.(); await ticks(60); };
out.shipMeshes = meshCount(g.ship.group);
out.shipMerged = g.ship.group.userData.shipMerged ?? 0;
out.phase0 = g.run.phase;
if (g.run.phase !== 'orbit') await takeoff();
g.player.teleport(V(0, 1, 0)); g.player.inShip = true;
for (const l of ['medium', 'low']) { setQ(l); await ticks(3); out.q['orbit_' + l] = snap(); }
if (!globalThis.__skipLand) {
  for (const l of ['medium', 'low']) {
    setQ(l);
    g.ui.closePanel?.(); g.run.daysLeft = 3; g.run.moon = 'hamsi'; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding?.(); await ticks(120);
    out.q['phase_' + l] = g.run.phase + '/' + g.world.moonId;
    g.player.inShip = false; g.player.teleport(V(2, (g.world.terrain?.heightAt?.(2, 16) ?? 0) + 0.3, 16), 0); await ticks(12, 0.25);
    out.q['outdoor_' + l] = snap(); out.q['outdoor_' + l].culled = g._cull?.hiddenCount?.();
    g.player.teleport(V(0, 1, 0)); g.player.inShip = true; await ticks(12, 0.25);
    const hid = [g.world.outdoor?.group, g.world.facility?.group].filter(Boolean); const was = hid.map((x) => x.visible); hid.forEach((x) => { x.visible = false; });
    out.q['shipOnly_' + l] = snap();
    hid.forEach((x, i) => { x.visible = was[i]; });
    await takeoff();
    out.q['phaseAfter_' + l] = g.run.phase;
  }
}
setQ('medium');
return out;
