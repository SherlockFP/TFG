const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 2500));
// QA night 3, run E (fresh tab, ONE landing): Estate (influencer theme) corridor, then the themed boss name card + lair of the same map.   (prepend qa_night2_lib.js)
await step('estate', async () => {
  R.landEstate = await land('m5est', false); g.player.inShip = false;
  const f = fac(), L = f.layout, W = L.w, H = L.h; let best = null;
  for (let z = 1; z < H - 1 && !best; z++) for (let x = 1; x < W - 6; x++) { let ok = true; for (let k = -1; k <= 6; k++) if (L.cells[z * W + x + k] < 1) ok = false; if (ok && L.cells[z * W + x] === 2 && L.cells[z * W + x + 3] === 2 && !L.cells[(z - 1) * W + x + 3] && !L.cells[(z + 1) * W + x + 3]) { best = { x, z }; break; } }
  R.corr = best; R.estateTheme = L.theme; if (!best) { await toRoom((r) => r.type !== 'entrance'); await shot('n3_influencer.jpg'); return 'no straight corridor, room shot'; }
  const wx = L.ox + (best.x + 0.5) * L.cell, wz = L.oz + (best.z + 0.5) * L.cell;
  look(wx, L.y + 0.02, wz, yaw2(wx, wz, wx + 10, wz), 0.0); await frames(12); await shot('n3_influencer.jpg');
});
dump('estate');
await step('boss', async () => {
  g.player.inShip = false;
  const CC = await import('/src/game/cycle_core.js'); const f = fac(), L = f.layout, bid = CC.bossFor(L.theme, 0).id; R.theme = L.theme; R.bossId = bid;
  g.run.cycle = g.run.cycle || {}; g.run.cycle.live = Object.assign(g.run.cycle.live || {}, { k: 'core', boss: bid });
  for (let i = 0; i < 30 && !g.bossDress?.group; i++) { kefal.tick(2, 1 / 30, false); await sleep(30); }
  const sp = g.bossDress?.group?.userData?.spot; R.spot = sp; if (!sp) return 'no lair group';
  const wk = (x, z) => { const n = f.nav.nearestWalkable(...f.nav.toGrid(x, z), 8); return n ? f.nav.toWorld(n[0], n[1]) : { x, z }; };
  const rm = L.rooms.find((r) => { const cx = L.ox + (r.x + r.w / 2) * L.cell, cz = L.oz + (r.z + r.h / 2) * L.cell; return Math.hypot(cx - sp[0], cz - sp[1]) < 1; }); R.room = rm && { w: rm.w, h: rm.h, type: rm.type };
  const hw = rm ? rm.w * L.cell / 2 : 8, hh = rm ? rm.h * L.cell / 2 : 8;
  const a = wk(sp[0] - hw + 2.0, sp[1] - hh + 2.0), c = wk(sp[0], sp[1]);
  look(a.x, L.y + 1.0, a.z, yaw2(a.x, a.z, c.x, c.z), -0.12); await frames(10);
  let c1 = null; try { c1 = g.cycle.bosses.spawnBoss(bid, new THREE.Vector3(c.x, L.y, c.z), { sector: 0, crew: 1, lair: { cx: c.x, cz: c.z, r: 9 } }); } catch (e) { R.spawnErr = String(e).slice(0, 120); }
  if (c1) c1.stunT = 99; await frames(10);
  g.cycle.bosses.ui.showCard(bid); await sleep(100);
  for (const cd of document.querySelectorAll('.cy-card')) { cd.style.animationPlayState = 'paused'; cd.style.animationDelay = '-1.3s'; }
  R.cardText = document.querySelector('.cy-card')?.innerText?.replace(/\s+/g, ' '); R.cardOp = getComputedStyle(document.querySelector('.cy-card')).opacity;
  kefal.tick(1, 1 / 30, true); flush(); await sleep(300); await window.__shot('n3_boss_card.jpg');
  for (const cd of document.querySelectorAll('.cy-card')) cd.classList.remove('on');
  if (c1) { c1.stunT = 99; c1.pos.set(c.x, L.y, c.z); }
  look(a.x, L.y + 1.4, a.z, yaw2(a.x, a.z, c.x, c.z), -0.18); await frames(10); await shot('n3_boss_lair.jpg');
});
dump('boss');
R.errs = 'see LOGS'; return R;
