// QA night 2, run F: day summary with a highlight clip + CRT (frozen rAF clock) + the 3 expedition moons.  bash run.sh f "/?autohost=local&code=T6&name=Tester"  (prepend qa_night2_lib.js)
const mem = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6);
const lg = (m) => console.log('QA: ' + m + ' heapMB=' + mem());
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 3000));
// ---------------- day summary WITH a highlight clip (the config that crashed twice) + the CRT replay (time frozen at the beat so a slow screenshot still catches it)
await step('summary_hl', async () => {
  const HC = await import('/src/game/highlights_core.js'), F2C = await import('/src/game/feedcams2_core.js');
  const ring = new HC.Ring();
  for (let i = 0; i < 120; i++) { ring.begin(i / 10); const a = i / 14; ring.setPlayer('me', 20 + Math.cos(a) * 6, 10 + Math.sin(a) * 6, a + 1.57); ring.setPlayer('p2', 22 + Math.cos(a + 2) * 4, 8 + Math.sin(a + 2) * 4, a); ring.setCreature('c1', 30 - i * 0.12, 16 - i * 0.05); ring.setCreature('c2', 8 + i * 0.05, 4 + i * 0.09); }
  const clip = HC.buildClip(ring, 8.0, F2C.hlMake('down', 'Tester', 0, ''), 'me', (id) => (id === 'me' ? 'Tester' : 'Crewmate'), [[8.0, 'down']]);
  g.highlights.state.view = [{ clip, tracks: HC.unpackClip(clip) }]; g.highlights.state.idx = 0;
  g.rewardviz.reward('job', 240); g.rewardviz.reward('till', 90);
  lg('showDaySummary with clip');
  g.ui.showDaySummary({ moon: 'Estate of the Departed', company: false, collected: 312, shipValue: 312, deaths: [], fines: 30, allDead: false, kills: 2, day: 1, quota: 400, sold: 0, daysLeft: 2, leftValue: 40, credits: 480, players: [{ id: g.selfId, name: 'Tester', dead: false, collected: 312, loot: 312, kills: 2 }] }, g);
  await sleep(3200); lg('summary up'); kefal.tick(2, 1 / 30, true);
  R.sumText = document.querySelector('.report')?.innerText?.replace(/\s+/g, ' ').slice(0, 700); R.hasWatch = !!document.querySelector('.hc-watch'); R.hasRv = !!document.querySelector('.rv-sum');
  console.log('QA: SUMTEXT ' + R.sumText + ' watch=' + R.hasWatch);
  await window.__shot('n2_day_summary.jpg'); lg('summary shot');
  document.querySelectorAll('.report').forEach((x) => x.remove()); g.ui.clearCinematics?.();
  // CRT with frozen rAF clock
  const raf0 = window.requestAnimationFrame.bind(window); let base = null; window.__hlEl = 0;
  window.requestAnimationFrame = (f) => raf0((n) => { if (base === null) base = n; f(base + window.__hlEl); });
  R.watch = g.highlights.watch(); await sleep(1200); window.__hlEl = 6700; await sleep(1500);
  R.crtText = document.querySelector('.hc-crt')?.innerText?.replace(/\s+/g, ' ').slice(0, 300); console.log('QA: CRT ' + R.crtText);
  await window.__shot('n2_highlight_crt.jpg'); lg('crt shot');
  window.requestAnimationFrame = raf0; window.__hlEl = 99999; await sleep(1200); document.querySelector('.hc-crt')?.remove();
});

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
