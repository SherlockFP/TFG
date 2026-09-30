// QA night 2, run B: interiors at gamma 1.0 with NO torch (metro, influencer), solo bulky carry, highlight clip -> takeoff -> day summary (income by source) -> CRT replay.
//   bash run.sh b "/?autohost=local&code=T2&name=Tester"     (prepend qa_night2_lib.js)
await step('metro', async () => {
  const i = await land('levrek', false); R.landMetro = i;
  const rooms = fac().layout.rooms; R.metroRooms = rooms.map((r) => r.type).slice(0, 14);
  const st = rooms.filter((r) => /platform|station/.test(r.type))[0];
  if (st) await toRoom((r) => r === st, 0.02); else await toRoom((r) => r.type !== 'entrance');
  await frames(12);
  await shot('n2_dim_metro.jpg');
});
await step('carry_solo', async () => {
  const p = g.player;
  for (const ty of ['cy_vending', 'cy_rack', 'cy_statue']) {
    let id; try { id = g.items.hostSpawn(ty, p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); } catch (e) { R['carryErr_' + ty] = String(e).slice(0, 80); continue; }
    await frames(3, false); const sl = p.slots.indexOf(null); if (sl < 0) continue; p.slots[sl] = id; p.slot = sl; g.refreshHeldVisuals?.(); await frames(4);
    R.carry = { ty, carryMul: p.carryMul, carryTurn: p.carryTurn, held: g.items.get(id)?.type }; break;
  }
  await frames(6); await shot('n2_carry_solo.jpg');
  const id = p.slots[p.slot]; if (id != null) { try { g.dropItem?.(g.items.get(id)); } catch (e) { R.dropErr = String(e).slice(0, 80); } }
});
await step('takeoff1', takeoff);
await step('estate', async () => {
  const i = await land('m5est', false); R.landEstate = i;
  const s = await toRoom((r) => r.type !== 'entrance'); R.estateRoom = s && s.type; await frames(12);
  await shot('n2_dim_influencer.jpg');
});
await step('clip_record', async () => {
  const f = fac(), L = f.layout, s = roomSpot((r) => r.type !== 'entrance'); if (!s) return 'no room';
  R.hl0 = !!g.highlights;
  for (let i = 0; i < 44; i++) { const a = i / 6; look(s.x + Math.cos(a) * 1.5, s.y + 0.02, s.z + Math.sin(a) * 1.5, a); kefal.tick(10, 1 / 30, false); if (i % 4 === 3) await sleep(4); }
  g.feedcams2.record('down', g.selfId, 0, '');
  for (let i = 0; i < 20; i++) { const a = 8 + i / 6; look(s.x + Math.cos(a) * 1.5, s.y + 0.02, s.z + Math.sin(a) * 1.5, a); kefal.tick(10, 1 / 30, false); if (i % 4 === 3) await sleep(4); }
  R.pend = g.highlights.state.pend.length; R.clips = g.highlights.state.clips.length; R.evs = g.highlights.state.evs.length; R.clock = +g.highlights.state.clock.toFixed(1);
});
await step('takeoff2', async () => { const r = await takeoff(); await frames(6, false); R.view = g.highlights.state.view.length; R.clipSummary = g.highlights.state.view[0]?.clip?.s; return r; });
await step('summary', async () => {
  g.rewardviz.reward('job', 240); g.rewardviz.reward('till', 90);
  g.ui.showDaySummary({ moon: 'Estate of the Departed', company: false, collected: 312, shipValue: 312, deaths: [], fines: 30, allDead: false, kills: 2, day: 1, quota: 400, sold: 0, daysLeft: 2, leftValue: 40, credits: 480, players: [{ id: g.selfId, name: 'Tester', dead: false, collected: 312 }] }, g);
  await sleep(4200); await frames(6);
  R.sumText = document.querySelector('.report')?.innerText?.replace(/\s+/g, ' ').slice(0, 900);
  R.hasWatch = !!document.querySelector('.hc-watch'); R.hasRv = !!document.querySelector('.rv-sum');
  const rp = document.querySelector('.report'); if (rp) { const r = rp.getBoundingClientRect(); R.reportRect = [r.left, r.top, r.width, r.height].map(Math.round); R.reportScroll = [rp.scrollHeight, rp.clientHeight]; }
  await shot('n2_day_summary.jpg', true);
  const sc = document.querySelector('.report .cp-body, .report'); if (sc) { sc.scrollTop = 99999; document.querySelectorAll('.report *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20) e.scrollTop = 99999; }); }
  await frames(3); await shot('n2_day_summary_b.jpg', true);
});
await step('crt', async () => {
  const ok = g.highlights.watch(); R.watch = ok; await sleep(3800); await frames(4, false); await sleep(500);
  R.crtText = document.querySelector('.hc-crt')?.innerText?.replace(/\s+/g, ' ').slice(0, 400);
  await shot('n2_highlight_crt.jpg', true);
});
R.errs = 'see LOGS';
return R;
