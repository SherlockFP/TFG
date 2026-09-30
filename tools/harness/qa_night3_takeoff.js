// QA night 3: ONE real-time takeoff from the current expedition moon (lever -> checklist -> faults.fixAll() -> lever). Run it in a tab that has just landed (prepend qa_night2_lib.js + a landing step); it OOM-killed the tab in N3 run D.
await step('full_takeoff', async () => {
  g.downed?.S.book.e.clear(); g.spawnInShip(); g.player.inShip = true; g.player.frozen = false; await frames(4, false);
  const t0 = performance.now(), seen = []; let blocked = 0, fixed = false, shotDone = false;
  g.hostLever(g.selfId);
  while (g.run.phase !== 'orbit' && performance.now() - t0 < 60000) {
    if (!seen.length || seen[seen.length - 1] !== g.run.phase) seen.push(g.run.phase + '@' + Math.round(performance.now() - t0));
    const fl = g.gameplay2?.parts?.faults; const act = fl?.state?.act ?? fl?.F?.act;
    if (g.run.phase === 'moon' && (performance.now() - t0) > 1500 && !fixed) { try { fl.fixAll(); fixed = true; R.faultsFixed = true; } catch (e) { R.fixErr = String(e).slice(0, 80); } g.hostLever(g.selfId); blocked++; }
    if (g.run.phase === 'takeoff' && !shotDone && (performance.now() - t0) > 3000) { shotDone = true; kefal.tick(2, 1 / 30, true); flush(); await sleep(300); await window.__shot('n3_takeoff.jpg'); }
    kefal.tick(1, 1 / 30, false); await sleep(40);
  }
  R.takeoff = { phase: g.run.phase, ms: Math.round(performance.now() - t0), seen, fixed, blocked };
  if (g.run.phase !== 'orbit') { for (let i = 0; i < 20 && g.run.phase !== 'orbit'; i++) { g.hostFinishTakeoff(); await frames(6, false); await sleep(300); } R.takeoff.forced = g.run.phase; }
  await frames(6); R.orbitPos = g.player.pos.toArray().map((v) => +v.toFixed(1));
});

R.errs = 'see LOGS'; return R;
