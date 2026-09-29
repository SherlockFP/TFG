// wave5 zfixperf: land/take off leak check. Tracks GPU-live geometries (dispose listeners) with the module that added
// their mesh, lands on several moons twice (pass A, pass B) and reports geometry counts + per-site growth A->B.
// Body of an async fn for tools/harness/headless.mjs (window.kefal.game exists).
const g = kefal.game, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), V = (x, y, z) => new THREE.Vector3(x, y, z);
const errs = []; addEventListener('error', (e) => errs.push(e.message));
if (!window.__zfHooked) {
  window.__zfHooked = true;
  window.__zfLive = new Set(); window.__zfSite = new WeakMap();
  const LV = window.__zfLive, ST = window.__zfSite;
  const bp = THREE.BufferGeometry.prototype, oa = bp.addEventListener;
  bp.addEventListener = function (type, fn) {
    if (type === 'dispose' && !LV.has(this)) { LV.add(this); oa.call(this, 'dispose', () => LV.delete(this)); }
    return oa.call(this, type, fn);
  };
  const site = () => { const st = (new Error().stack || '').split('\n'); for (const l of st.slice(2)) { const m = l.match(/(src\/[\w/.\-]+):(\d+)/); if (m && !/modelkit/.test(m[1])) return m[1] + ':' + m[2]; } return '?'; };
  const oadd = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...objs) {
    for (const o of objs) o?.traverse?.((m) => { if (m.geometry && !ST.has(m.geometry)) ST.set(m.geometry, site()); });
    return oadd.apply(this, objs);
  };
}
const L = window.__zfLive, S = window.__zfSite;
const info = () => kefal.engine.renderer.info;
const snapshot = () => {
  kefal.tick(1, 1 / 30, true);
  const reach = new Set(); kefal.engine.scene.traverse((o) => { if (o.geometry) reach.add(o.geometry); });
  const bySite = {};
  let un = 0;
  for (const geo of L) if (!reach.has(geo)) { un++; const s = S.get(geo) || ('untagged:' + geo.type + ':' + (geo.attributes?.position?.count ?? 0)); bySite[s] = (bySite[s] || 0) + 1; }
  return { geos: info().memory.geometries, tex: info().memory.textures, progs: info().programs?.length, unreachable: un, bySite };
};
const land = async (moon, ticks = 20) => {
  g.ui.closePanel?.(); g.run.daysLeft = 3; g.run.moon = moon; g.player.inShip = true; g.hostLever(g.selfId); g.hostFinishLanding?.();
  for (let i = 0; i < ticks; i++) { kefal.tick(10, 1 / 30, false); await sleep(6); }
};
const takeoff = async () => {
  g.player.teleport(V(0, 1, 0)); g.player.inShip = true; g.hostBeginTakeoff('lever'); g.hostFinishTakeoff?.();
  for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(6); }
};
const { MOONS } = await import('/src/game/moons.js');
if (g.run.phase !== 'orbit') await takeoff();
const plan = ['hamsi', 'levrek', 'lufer'].filter((m) => MOONS[m]);
const T0 = performance.now(), BUDGET = 200000;   // ms; returns partial results when exceeded
const out = { plan, base: null, passes: [], errs };
out.base = snapshot(); delete out.base.bySite;
const pass = async () => {
  const P = [];
  for (const id of plan) {
    if (performance.now() - T0 > BUDGET) { out.cut = true; break; }
    const r = { id, t: Math.round(performance.now() - T0) };
    try {
      await land(id);
      g.player.inShip = false;
      const gy = (x, z) => g.world.terrain?.heightAt?.(x, z) ?? 0;
      g.player.teleport(V(2, gy(2, 16) + 0.3, 16), 0); kefal.tick(4, 1 / 30, true);
      const s1 = snapshot(); r.landedGeos = s1.geos; r.calls = kefal.engine.sceneStats?.calls;
      if (id === 'lufer' && g.mirror) { try { g.mirror.forcePortal(10, 20); kefal.tick(10, 1 / 30, false); g.mirror.enter(); for (let i = 0; i < 8; i++) { kefal.tick(10, 1 / 30, false); await sleep(10); } kefal.tick(3, 1 / 30, true); r.mirrorGeos = info().memory.geometries; r.mirrorCalls = kefal.engine.sceneStats?.calls; g.mirror.exit(); kefal.tick(20, 1 / 30, false); } catch (e) { r.mirrorTHROW = String(e).slice(0, 200); } }
      if (g.world.facility && g.world.outdoor?.mainExit) { g.useExit(0, true); kefal.tick(12, 1 / 30, true); r.inCalls = kefal.engine.sceneStats?.calls; r.inGeos = info().memory.geometries; g.useExit(0, false); kefal.tick(4, 1 / 30, false); }
    } catch (e) { r.THROW = String(e.stack || e).slice(0, 300); }
    await takeoff();
    const s = snapshot(); r.afterTakeoff = s.geos; r.unreachable = s.unreachable; r.tex = s.tex; r.progs = s.progs; r.bySite = s.bySite;
    P.push(r);
  }
  return P;
};
out.passes.push(await pass());
out.passes.push(await pass());
const last = (P) => (P.length ? P[P.length - 1].bySite || {} : {});
const a = last(out.passes[0]), b = last(out.passes[1]);
out.growth = {};
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = (b[k] || 0) - (a[k] || 0); if (d) out.growth[k] = d; }
out.topLeakSitesB = Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, 25);
for (const P of out.passes) for (const r of P) delete r.bySite;
out.ms = Math.round(performance.now() - T0);
return out;
