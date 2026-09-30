// QA night 3, run B (?hiringday=1): stream end facing, tarp lid probe, glove outdoors in daylight, metro platform, vending-machine carry, themed boss card + lair (metro),
// influencer corridor.   (prepend qa_night2_lib.js)
const dump = (k) => console.log('QA: R ' + k + ' ' + JSON.stringify(R).slice(0, 2500));
await step('stream', async () => {
  for (let i = 0; i < 40 && !document.querySelector('.ob-st'); i++) { await frames(3, false); await sleep(100); }
  if (!document.querySelector('.ob-st')) return 'NO ob-st overlay';
  for (let i = 0; i < 48 && document.querySelector('.ob-st'); i++) kefal.tick(10, 1 / 30, false);
  await frames(6);
  R.yaw = +g.player.yaw.toFixed(2); R.pos = g.player.pos.toArray().map((v) => +v.toFixed(1)); R.hasUnlockText = /UNLOCKS AT/i.test(document.body.innerText);
  await shot('n3_stream_end.jpg');
});
await step('tarp_probe', async () => {
  const sg = g.ship.group, tarps = []; sg.traverse((o) => { if (o.userData?.hgTarp) tarps.push(o); });
  const out = [];
  for (const tg of tarps) {
    const tb = new THREE.Box3().setFromObject(tg), rec = { tarp: [tb.min.x, tb.min.y, tb.min.z, tb.max.x, tb.max.y, tb.max.z].map((v) => +v.toFixed(2)), above: [] };
    sg.traverse((o) => {
      if (!o.isMesh || !o.visible || o.parent === tg) return; let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) return;
      const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) return; const c = b.getCenter(new THREE.Vector3());
      if (c.x > tb.min.x - 0.1 && c.x < tb.max.x + 0.1 && c.z > tb.min.z - 0.1 && c.z < tb.max.z + 0.1 && b.max.y > tb.max.y - 0.05 && b.min.y < tb.max.y + 0.6) {
        const chain = []; for (let p = o; p && p !== sg; p = p.parent) chain.push((p.name || p.type) + '@' + p.position.toArray().map((v) => +v.toFixed(2)).join(',')); rec.above.push({ chain: chain.slice(0, 4), size: b.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)), min: +b.min.y.toFixed(2), col: o.material?.color?.getHexString?.() });
      }
    });
    out.push(rec);
  }
  R.tarpProbe = out; dump('probe');
  const w = new THREE.Vector3(); tarps[0].getWorldPosition(w); const c = new THREE.Vector3(); sg.getWorldPosition(c);
  const dx = c.x - w.x, dz = c.z - w.z, dl = Math.hypot(dx, dz) || 1, px = w.x + (dx / dl) * 3.2, pz = w.z + (dz / dl) * 3.2;
  look(px, g.player.pos.y, pz, yaw2(px, pz, w.x, w.z), 0.05); await frames(6); await shot('n3_tarps.jpg');
});
await step('land', () => land('levrek', false));
const out = g.world.outdoor, gy = (x, z) => out?.terrain?.heightAt?.(x, z) ?? 0;
await step('glove', async () => {
  g.player.inShip = false; look(0, gy(0, 14) + 0.1, 14, yaw2(0, 14, 0, 0) + 0.5, -0.2);
  g.settings.hudDensity = 'standard'; g.hudcalm?.pass?.(); await frames(6);
  const p = g.player, items = [['torch', 'flashlight'], ['shovel', 'shovel'], ['pipe', 'pipe'], ['scrap', 'bolt'], ['pickaxe', 'x_pickaxe']];
  p.slots.fill(null);
  let i = 0;
  for (const [nm, id] of items) {
    const iid = g.items.hostSpawn(id, p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false);
    p.slots[i] = iid; p.slot = i; g.refreshHeldVisuals?.(); const it = g.items.get(iid); if (nm === 'torch' && it && !it.on) g.useHeldPress();
    await frames(8); R['glove_' + nm] = it && it.type; await shot('n3_glove_' + nm + '.jpg'); i++;
  }
  p.slots.fill(null); g.refreshHeldVisuals?.();
});
await step('metro', async () => {
  g.player.inShip = false; const rooms = fac().layout.rooms; R.metroRooms = rooms.map((r) => r.type).slice(0, 14);
  const st = rooms.filter((r) => /platform|station/.test(r.type))[0];
  if (st) await toRoom((r) => r === st, 0.02); else await toRoom((r) => r.type !== 'entrance');
  await frames(12); await shot('n3_metro.jpg');
});
await step('carry', async () => {
  const p = g.player; const id = g.items.hostSpawn('cy_vending', p.pos.clone().setY(p.pos.y + 1), { holder: g.selfId }); await frames(3, false);
  p.slots[0] = id; p.slot = 0; g.refreshHeldVisuals?.(); await frames(10);
  R.carry = { carryMul: p.carryMul, held: g.items.get(id)?.type };
  await shot('n3_carry.jpg');
  try { g.dropItem?.(g.items.get(id)); } catch (e) { R.dropErr = String(e).slice(0, 80); } p.slots.fill(null); g.refreshHeldVisuals?.(); await frames(3, false);
});
await step('boss', async () => {
  const CC = await import('/src/game/cycle_core.js'); const f = fac(), L = f.layout, bid = CC.bossFor(L.theme, 0).id; R.theme = L.theme; R.bossId = bid; R.bossName = CC.BOSS_TABLE[L.theme]?.name;
  g.run.cycle = g.run.cycle || {}; g.run.cycle.live = Object.assign(g.run.cycle.live || {}, { k: 'core', boss: bid });
  for (let i = 0; i < 30 && !g.bossDress?.group; i++) { kefal.tick(2, 1 / 30, false); await sleep(30); }
  const sp = g.bossDress?.group?.userData?.spot; R.spot = sp; if (!sp) return 'no lair group';
  R.infoOf = g.bossDress.infoOf(bid);
  const wk = (x, z) => { const n = f.nav.nearestWalkable(...f.nav.toGrid(x, z), 8); return n ? f.nav.toWorld(n[0], n[1]) : { x, z }; };
  const rm = L.rooms.find((r) => { const cx = L.ox + (r.x + r.w / 2) * L.cell, cz = L.oz + (r.z + r.h / 2) * L.cell; return Math.hypot(cx - sp[0], cz - sp[1]) < 1; });
  R.room = rm && { w: rm.w, h: rm.h, type: rm.type };
  const a = wk(sp[0] - (rm ? rm.w * L.cell / 2 - 2.2 : 6), sp[1] - (rm ? rm.h * L.cell / 2 - 2.2 : 6)), c = wk(sp[0], sp[1]);
  look(a.x, L.y + 0.02, a.z, yaw2(a.x, a.z, c.x, c.z), 0.0); await frames(10);
  let c1 = null; try { c1 = g.cycle.bosses.spawnBoss(bid, new THREE.Vector3(c.x, L.y, c.z), { sector: 0, crew: 1, lair: { cx: c.x, cz: c.z, r: 9 } }); } catch (e) { R.spawnErr = String(e).slice(0, 120); }
  R.bossSpawned = !!c1; if (c1) { c1.stunT = 99; }
  await frames(10);
  g.cycle.bosses.ui.showCard(bid); await sleep(700); kefal.tick(1, 1 / 30, true); flush(); await sleep(300);
  R.cardText = document.querySelector('.cy-card')?.innerText?.replace(/\s+/g, ' ');
  await shot('n3_boss_card.jpg', false);
  await sleep(5000); for (const cd of document.querySelectorAll('.cy-card')) cd.classList.remove('on');
  if (c1) { c1.stunT = 99; c1.pos.set(c.x, L.y, c.z); }
  look(a.x, L.y + 0.02, a.z, yaw2(a.x, a.z, c.x, c.z), 0.0); await frames(10); await shot('n3_boss_lair.jpg');
  // a corner prop close up
  const b = wk(sp[0] + (rm ? rm.w * L.cell / 2 - 2.6 : 6), sp[1] + (rm ? rm.h * L.cell / 2 - 2.6 : 6));
  look(b.x, L.y + 0.02, b.z, yaw2(b.x, b.z, sp[0] + (rm ? rm.w * L.cell / 2 - 1.6 : 8), sp[1] + (rm ? rm.h * L.cell / 2 - 1.6 : 8)), 0.0); await frames(8); await shot('n3_boss_props.jpg');
  if (c1) { try { c1.hp = 0; c1.dead = true; g.creatures.host.delete(c1.id); } catch { /* ignore */ } }
  delete g.run.cycle.live.k; delete g.run.cycle.live.boss;
});
await step('takeoff1', takeoff);
await step('estate', async () => {
  R.landEstate = await land('m5est', false); g.player.inShip = false;
  const f = fac(), L = f.layout, W = L.w, H = L.h; let best = null;
  for (let z = 1; z < H - 1 && !best; z++) for (let x = 1; x < W - 6; x++) { let ok = true; for (let k = -1; k <= 6; k++) if (L.cells[z * W + x + k] < 1) ok = false; if (ok && L.cells[z * W + x] === 2 && L.cells[z * W + x + 3] === 2 && !L.cells[(z - 1) * W + x + 3] && !L.cells[(z + 1) * W + x + 3]) { best = { x, z }; break; } }
  R.corr = best; if (!best) { await toRoom((r) => r.type !== 'entrance'); await shot('n3_influencer.jpg'); return 'no straight corridor, room shot'; }
  const wx = L.ox + (best.x + 0.5) * L.cell, wz = L.oz + (best.z + 0.5) * L.cell;
  look(wx, L.y + 0.02, wz, yaw2(wx, wz, wx + 10, wz), 0.0); await frames(12); await shot('n3_influencer.jpg');
});
R.errs = 'see LOGS'; return R;
