// QA night 3, run C (fresh tab, ONE landing only: a 2nd/3rd landing in the same software-GL tab crashed the renderer): tarp lid (after the fix), held melee viewmodel projection, expedition landings (barge dock view, dune checkpoint beam, roof), one full takeoff
// from the last expedition moon (faults fixed with faults.fixAll()), landQ warm report for an expedition landing.   (prepend qa_night2_lib.js)
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 2500));
const mem = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6);
await step('tarps', async () => {
  const sg = g.ship.group, tarps = []; sg.traverse((o) => { if (o.userData?.hgTarp) tarps.push(o); });
  R.tarps = tarps.length; const w = new THREE.Vector3(); tarps[0].getWorldPosition(w); const c = new THREE.Vector3(); sg.getWorldPosition(c);
  const dx = c.x - w.x, dz = c.z - w.z, dl = Math.hypot(dx, dz) || 1, px = w.x + (dx / dl) * 3.2, pz = w.z + (dz / dl) * 3.2;
  look(px, g.player.pos.y, pz, yaw2(px, pz, w.x, w.z), 0.05); await frames(6); await shot('n3_tarps.jpg');
});
await step('melee_proj', async () => {
  const p = g.player, cam = g.camera, res = {};
  p.slots.fill(null); let i = 0;
  look(-0.8, 0, 1.3, 1.2, 0);
  for (const id of ['shovel', 'pipe', 'x_pickaxe', 'flashlight']) {
    const iid = g.items.hostSpawn(id, p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false);
    p.slots[i] = iid; p.slot = i; g.refreshHeldVisuals?.(); await frames(20, false); kefal.tick(2, 1 / 30, true); flush();
    const root = g.viewModel?.root, hand = g.viewModel?.handR || g._hand; let n = 0; const meshes = []; hand?.traverse?.((o) => { if (o.isMesh) { n++; meshes.push(o); } });
    const box = new THREE.Box3(); for (const m of meshes) box.expandByObject(m);
    cam.updateMatrixWorld(true); const pts = []; if (!box.isEmpty()) for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z).project(cam));
    res[id] = { meshes: n, held: g.items.get(iid)?.type, ndcY: pts.length ? [Math.min(...pts.map((v) => v.y)), Math.max(...pts.map((v) => v.y))].map((v) => +v.toFixed(2)) : null, ndcX: pts.length ? [Math.min(...pts.map((v) => v.x)), Math.max(...pts.map((v) => v.x))].map((v) => +v.toFixed(2)) : null };
    i++;
    if (id === 'x_pickaxe' || id === 'shovel') await shot('n3_hold_' + id + '.jpg');
  }
  p.slots.fill(null); g.refreshHeldVisuals?.(); R.melee = res;
});
dump('melee');
async function takeoffFix() { try { g.gameplay2.parts.faults.fixAll(); } catch (e) { R.fixErr = String(e).slice(0, 80); } return takeoff(); }
const gyAt = (x, z) => g.world.outdoor?.terrain?.heightAt?.(x, z) ?? 0;
async function warm(tag) { R['warm_' + tag] = g.landQ.last.filter((e) => /^warm/.test(e.name)).map((e) => e.name + ':' + Math.round(e.ms)).slice(0, 14); const pi = g.perfInfo(); R['perf_' + tag] = { programs: pi.programs, geo: pi.geometries, tex: pi.textures, warmMs: pi.warm.ms, built: pi.warm.built, prog: [pi.warm.programsBefore, pi.warm.programsAfter] }; R['landTop_' + tag] = g.landQ.report().slice(0, 5).map((e) => e.name + ':' + Math.round(e.ms)); }
await step('barge', async () => {
  const info = await land('ex_barge', false); R.landBarge = info; await warm('barge');
  const E = g.expeditions, S = E.state, P = S.P; g.player.inShip = false;
  const dock = P.tanks.find((q) => q.dock) || P.tanks[0]; R.dock = [dock.x, dock.y, dock.z].map((v) => +v.toFixed(1)); R.hull = [P.cx, P.cz];
  look(0, dock.y + 0.1, 12.5, yaw2(0, 12.5, P.cx, P.cz), 0.03); await frames(30); R.mem = mem();
  R.needBar = document.querySelector('[class*="ex-bar"]')?.innerText?.replace(/\s+/g, ' ').slice(0, 100);
  await shot('n3_barge.jpg');
});
R.errs = 'see LOGS'; return R;
