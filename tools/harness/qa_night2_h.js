// QA night 2, run H (orbit only, ~1 min): day summary with the INCOME BY SOURCE block, checked for the count-up clamp (rows used to show "-3,422" at low fps).
//   bash run.sh h "/?autohost=local&code=T8&name=Tester"     (prepend qa_night2_lib.js)
await step('summary', async () => {
  const D = { moon: 'Estate of the Departed', company: false, collected: 312, shipValue: 312, deaths: [], fines: 30, allDead: false, kills: 2, day: 1, quota: 400, sold: 0, daysLeft: 2, leftValue: 40, credits: 480, players: [{ id: g.selfId, name: 'Tester', dead: false, collected: 312, loot: 312, kills: 2 }] };
  g.rewardviz.reward('job', 240); g.rewardviz.reward('till', 90);
  const extra = []; g.mods.emit('daySummary', D, extra, g);
  const st0 = window.setTimeout; window.setTimeout = (f, ms, ...a) => (ms === 13000 ? 0 : st0(f, ms, ...a));   // keep the report up while a slow software-GL screenshot is taken
  g.ui.renderDaySummary(D, g, extra, () => {}); window.setTimeout = st0;
  await sleep(4500); await frames(2);
  R.sumText = document.querySelector('.report')?.innerText?.replace(/\s+/g, ' ').slice(0, 800);
  console.log('QA: SUMTEXT ' + R.sumText);
  await window.__shot('n2_day_summary.jpg');
});
return R;
