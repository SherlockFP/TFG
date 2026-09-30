// QA night 2, run G: the 3 expedition moons on a FRESH page (960x540 to halve the software-GL memory), nothing else.  bash run.sh g "/?autohost=local&code=T7&name=Tester"  (prepend qa_night2_lib.js)
try { await window.__view(960, 540); } catch { /* no resize */ }
await sleep(800);
const gyAt = (x, z) => g.world.outdoor?.terrain?.heightAt?.(x, z) ?? 0;
async function ex(id, tag, pickTarget) {
  const info = await land(id, false); R['land_' + tag] = info;
  const E = g.expeditions, S = E.state; R['kind_' + tag] = S.kind; R['objLines_' + tag] = (E.lines ? [] : []);
  g.player.inShip = false;
  // A: 12 m from the ship looking at it
  look(0, gyAt(0, 12) + 0.1, 12, yaw2(0, 12, 0, 0), 0.05); await frames(30);
  R['need_' + tag] = document.querySelector('[class*="ex-"]')?.innerText?.replace(/\s+/g, ' ').slice(0, 120);
  await shot(`n2_ex_${tag}_ship.jpg`);
  // B: the objective
  const tg = pickTarget(S.P); if (!tg) return 'no target';
  const dx = tg.x - tg.fx, dz = tg.z - tg.fz, dl = Math.hypot(dx, dz) || 1;
  look(tg.fx, tg.fy, tg.fz, yaw2(tg.fx, tg.fz, tg.x, tg.z), tg.pitch ?? 0.0); await frames(30);
  R['goals_' + tag] = [...document.querySelectorAll('.objectives *')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => e.textContent.trim().slice(0, 90));
  R['regions_' + tag] = regions();
  await shot(`n2_ex_${tag}_goal.jpg`);
  return { theme: info.theme, kind: S.kind };
}
await step('barge', async () => {
  const r = await ex('ex_barge', 'barge', (P) => {
    const c = P.cores[0]; const ang = Math.atan2(c.z, c.x), fx = c.x + Math.cos(ang) * 5.5, fz = c.z + Math.sin(ang) * 5.5;
    return { x: c.x, z: c.z, fx, fz, fy: Math.max(c.y, gyAt(fx, fz)) + 0.1, pitch: -0.05 };
  });
  R.oxy = g.expeditions.state.oxy ?? null; return r;
});
await step('takeoff_b', takeoff);
await step('dune', async () => ex('ex_dune', 'dune', (P) => {
  const a = P.route[1] || P.route[0], b = P.route[2] || P.route[1] || a; const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
  const fx = a.x - (dx / dl) * 7 + (dz / dl) * 3, fz = a.z - (dz / dl) * 7 - (dx / dl) * 3; return { x: a.x, z: a.z, fx, fz, fy: gyAt(fx, fz) + 0.1, pitch: 0.02 };
}));
await step('takeoff_d', takeoff);
await step('roof', async () => ex('ex_roof', 'roof', (P) => {
  const bb = P.bbs[0], c = P.spawnCell; const dx = bb.x - c.x, dz = bb.z - c.z, dl = Math.hypot(dx, dz) || 1;
  const fx = bb.x - (dx / dl) * 9, fz = bb.z - (dz / dl) * 9; return { x: bb.x, z: bb.z, fx, fz, fy: Math.max(gyAt(fx, fz), c.y) + 0.1, pitch: 0.18 };
}));
R.errs = 'see LOGS';
return R;
