// QA night 2, run C: the 3 expedition moons (barge / dune / roof): landing view of the ship + an objective view, need bar, no page errors.
//   bash run.sh c "/?autohost=local&code=T3&name=Tester"     (prepend qa_night2_lib.js)
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 3500));
// ---------------- part 0 (orbit, no landing = cheap): day summary with the income-by-source block + the highlight CRT replay (bisected: the first version killed the renderer, 6.5 GB)
const mem = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6);
const lg = (m) => console.log('QA: ' + m + ' heapMB=' + mem());
setInterval(() => console.log('QA: heartbeat heapMB=' + mem()), 5000);
await step('summary_crt', async () => {
  const D = { moon: 'Estate of the Departed', company: false, collected: 312, shipValue: 312, deaths: [], fines: 30, allDead: false, kills: 2, day: 1, quota: 400, sold: 0, daysLeft: 2, leftValue: 40, credits: 480, players: [{ id: g.selfId, name: 'Tester', dead: false, collected: 312, loot: 312, kills: 2 }] };
  lg('reward'); g.rewardviz.reward('job', 240); g.rewardviz.reward('till', 90); await sleep(300); lg('reward done');
  g.ui.renderDaySummary(D, g, [], () => {}); await sleep(1500); lg('plain report in DOM');
  kefal.tick(2, 1 / 30, true); lg('rendered a frame'); await sleep(2500);
  await window.__shot('n2_day_summary_plain.jpg'); lg('plain shot');
  document.querySelectorAll('.report').forEach((x) => x.remove());
  const extra = []; g.mods.emit('daySummary', D, extra, g); lg('emitted lens=' + JSON.stringify(extra.map((x) => x.length)));
  g.ui.renderDaySummary(D, g, extra, () => {}); await sleep(3500); lg('full report in DOM');
  kefal.tick(2, 1 / 30, true); lg('rendered full');
  R.sumText = document.querySelector('.report')?.innerText?.replace(/\s+/g, ' ').slice(0, 900);
  R.hasRv = !!document.querySelector('.rv-sum'); const rp = document.querySelector('.report'); if (rp) { const r = rp.getBoundingClientRect(); R.reportRect = [r.left, r.top, r.width, r.height].map(Math.round); R.reportScroll = [rp.scrollHeight, rp.clientHeight]; }
  dump('summary');
  await window.__shot('n2_day_summary.jpg'); lg('full shot');
  document.querySelectorAll('.report, .report *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = 99999; });
  await sleep(500); await window.__shot('n2_day_summary_b.jpg');
  document.querySelectorAll('.report').forEach((x) => x.remove());
  // highlight CRT from a synthetic clip (no landing needed)
  const HC = await import('/src/game/highlights_core.js'), F2C = await import('/src/game/feedcams2_core.js');
  const ring = new HC.Ring();
  for (let i = 0; i < 120; i++) {
    ring.begin(i / 10); const a = i / 14;
    ring.setPlayer('me', 20 + Math.cos(a) * 6, 10 + Math.sin(a) * 6, a + 1.57); ring.setPlayer('p2', 22 + Math.cos(a + 2) * 4, 8 + Math.sin(a + 2) * 4, a);
    ring.setCreature('c1', 30 - i * 0.12, 16 - i * 0.05); ring.setCreature('c2', 8 + i * 0.05, 4 + i * 0.09);
  }
  lg('ring built');
  const clip = HC.buildClip(ring, 8.0, F2C.hlMake('down', 'Tester', 0, ''), 'me', (id) => (id === 'me' ? 'Tester' : 'Crewmate'), [[8.0, 'down']]);
  R.clipOk = !!clip; if (!clip) return 'no clip'; lg('clip built bytes=' + HC.clipBytes(clip));
  g.highlights.state.view = [{ clip, tracks: HC.unpackClip(clip) }]; g.highlights.state.idx = 0; lg('tracks unpacked');
  R.watch = g.highlights.watch(); lg('watch() called'); await sleep(3800);
  R.crtText = document.querySelector('.hc-crt')?.innerText?.replace(/\s+/g, ' ').slice(0, 400); lg('crt running');
  await window.__shot('n2_highlight_crt.jpg'); lg('crt shot');
  try { document.querySelector('.hc-crt')?.remove(); g.highlights.state.playing?.stop?.(); } catch { /* ignore */ }
});
// ---------------- part 1 (fresh profile): normal facility walk with the loaner torch (one goal line), Tab card, toast vs Algorithm ticker, eye tells
await step('land_hamsi', () => land('hamsi', false));
await step('loaner', async () => {
  await frames(10, false);
  const it = [...g.items.items.values()].find((i) => /loaner/i.test(i.label || '')) || [...g.items.items.values()].find((i) => i.type === 'flashlight');
  R.loaner = it ? { id: it.id, label: it.label, battery: it.battery } : null;
  if (it) { g.pickup(it); await frames(3, false); const p = g.player, sl = p.slots.indexOf(it.id); if (sl >= 0) { p.slot = sl; g.refreshHeldVisuals?.(); } }
  return R.loaner;
});
await step('toast_vs_ticker', async () => {
  g.player.inShip = false; const gy0 = g.world.outdoor?.terrain?.heightAt?.(0, 12) ?? 0;
  look(0, gy0 + 0.6, 12, yaw2(0, 12, 0, 0), 0.05); await frames(6, false);
  try { g.lore.say('Camera lock. You have three seconds before the stream goes live. Break line of sight.', { pri: true }); } catch (e) { R.sayErr = String(e).slice(0, 80); }
  g.ui.toast('Middle-click or P to PING things for your crew.', 'info'); await frames(8);
  const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
  R.algoRect = q('.algo-sub'); R.toastRect = q('.hud-toasts .toast') || q('.hud-toasts'); R.toastMt = document.querySelector('.hud-toasts')?.style.marginTop;
  await sleep(600); await shot('n2_toast_vs_ticker.jpg'); dump('toast');
});
await step('interior_torch_hud', async () => {
  const s = await toRoom((r) => r.type !== 'entrance'); if (!s) return 'no room';
  const p = g.player, it = g.items.get(p.slots[p.slot]); R.holding = it && it.type; if (it && !it.on) g.useHeldPress();
  await frames(6); R.torchOn = !!it?.on;
  g.settings.hudDensity = 'standard'; g.hudcalm?.pass?.(); await sleep(6500); await frames(4, false); g.hudcalm?.pass?.(); await frames(4);
  R.regionsStd = regions(); R.goalsStd = goalLines(); R.overlapsStd = overlaps(); dump('hud');
  await shot('n2_hud_walk_torch.jpg');
  g.hudcalm?.showTab?.(true); await frames(5); await shot('n2_tab_card.jpg'); g.hudcalm?.showTab?.(false); await frames(2, false);
  dump('tab');
});
await step('eyes', async () => {
  const it = g.items.get(g.player.slots[g.player.slot]); if (it?.on) g.useHeldPress(); await frames(4, false);
  for (const ty of ['hound', 'stalker', 'mannequin', 'crawler']) { console.log('QA: spawn ' + ty); R['sp_' + ty] = eyeSpawn([ty]); await frames(4, false); }
  R.frozen = freezeCreatures(['hound', 'stalker', 'mannequin', 'crawler']); console.log('QA: frozen ' + JSON.stringify(R.frozen)); await frames(14);
  await shot('n2_eyes_dark.jpg');
  for (const c of [...g.creatures.host.values()]) { try { c.hp = 0; c.dead = true; g.creatures.host.delete(c.id); } catch { /* ignore */ } }
});
await step('takeoff_h', takeoff);
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
