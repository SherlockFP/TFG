// wave4 checkup step 2: the core loop. Terminal route -> land 56K-Dialup -> ship door from outside -> walk -> enter
// facility -> pick up scrap -> exit -> carry to the ship -> take off -> route HQ -> sell on the counter -> quota day.
const out = { seq: [] };
const note = (k, v) => { out.seq.push([k, v]); };
const term = g.terminal;
const termCmd = async (c) => { term.open?.(); term.submit ? term.submit(c) : term.exec(c); await tick(4); await sleep(30); await tick(4); const txt = (term.lines || []).slice(-4).map((l) => (typeof l === 'string' ? l : l.text || JSON.stringify(l)).slice(0, 120)); return txt; };
g.run.credits = Math.max(g.run.credits, 3000);
note('moons', await termCmd('moons'));
note('route', await termCmd('route dialup'));
note('confirm', await termCmd('confirm'));
note('routedMoon', g.run.moon);
term.close?.(); await tick(2);
out.orbitStats = stats();
out.land = await land('hamsi');
out.landedStats = stats();
out.nanLanded = nanScan('landed');
// ship door from outside (owner: "looks closed from outside when open")
const Z1 = (await import('/src/world/ship.js')).SHIP;
g.net.request('shipdoor', { open: true }); await tick(40);
out.door = { open: g.ship.door.open, t: r1(g.ship.door.t), leafX: r1(g.ship.door.leaf.position.x), doorX: Z1.door.x, z1: Z1.z1 };
g.player.inShip = false;
const gy = (x, z) => (g.world.terrain?.heightAt?.(x, z) ?? 0);
g.player.teleport(V(Z1.door.x, gy(Z1.door.x, Z1.z1 + 7) + 0.2, Z1.z1 + 7), 0); g.player.pitch = 0.05; await tick(10, true);
await shot('ck_loop_door_outside_open');
g.net.request('shipdoor', { open: false }); await tick(40, true);
await shot('ck_loop_door_outside_closed');
g.net.request('shipdoor', { open: true }); await tick(40);
// walk outside with the real input path
const a = g.player.pos.clone();
kefal.input.down.add('KeyW'); for (let i = 0; i < 6; i++) { kefal.tick(10, 1 / 30, false); await sleep(2); } kefal.input.down.delete('KeyW');
out.walk2s = r1(Math.hypot(g.player.pos.x - a.x, g.player.pos.z - a.z));
// facility main entrance
const me = g.world.outdoor?.mainExit;
out.mainExit = me && me.spawn.toArray().map(r1);
g.useExit(0, true); await tick(20, true);
out.inside = { indoor: g.player.indoor, pos: g.player.pos.toArray().map(r1) };
out.facilityStats = stats();
await shot('ck_loop_facility_inside');
// pick up scrap
const F = g.world.facility;
const s = F.scrapSpots.filter((q) => !q.elevated)[1] || F.scrapSpots[0];
g.player.teleport(V(s.x, s.y + 0.2, s.z)); await tick(10);
const ids = ['duck', 'canned', 'bolt'].map((ty, i) => g.items.hostSpawn(ty, V(s.x + 0.4 * (i - 1), s.y + 0.5, s.z + 0.4), { valueMul: 1 }));
await tick(8);
for (const id of ids) { const it = g.items.get(id); if (it) g.pickup(it); await tick(3); }
out.hotbar = g.player.slots.map((id) => g.items.get(id)?.type || null);
out.hudInv = document.querySelector('.hud-inv')?.innerText?.replace(/\s+/g, ' ').slice(0, 80);
await shot('ck_loop_holding');
out.nanFacility = nanScan('facility');
// back out and into the ship, drop items there
g.useExit(0, false); await tick(10);
g.player.teleport(V(0, 1, 0)); g.player.inShip = true; await tick(10);
for (let k = 0; k < 4; k++) { for (let sl = 0; sl < g.player.slots.length; sl++) if (g.player.slots[sl]) { g.player.slot = sl; g.dropHeld?.() ?? g.net.request('drop', { id: g.player.slots[sl] }); await tick(3); } }
await tick(10);
out.shipItems = g.items.inShipItems().map((i) => i.type);
out.takeoff = await takeoff();
await sleep(300); await tick(10);
out.summaryVisible = [...document.querySelectorAll('#ui *')].filter((e) => /summary|report|rp-/i.test(e.className) && !isHidden(e)).map(desc).slice(0, 4);
await shot('ck_loop_day_summary');
g.ui.clearCinematics?.(); g.ui.closePanel?.(); await tick(4);
// HQ: route + sell + quota
note('routeHQ', await termCmd('route hq')); note('confirm2', await termCmd('confirm')); term.close?.();
const quota0 = { quota: g.run.quota, sold: g.run.sold, credits: g.run.credits, daysLeft: g.run.daysLeft };
out.hq = await land('hq');
out.hqStats = stats();
const zone = g.world.company?.interactables?.find((i) => i.type === 'sellzone');
out.zone = zone && zone.pos.toArray().map(r1);
if (zone) {
  for (const it of [...g.items.inShipItems()]) { g.net.request('drop', { id: it.id }); }
  const sid = [];
  for (let i = 0; i < 4; i++) sid.push(g.items.hostSpawn(i % 2 ? 'goldbar' : 'tv', V(zone.pos.x + (i - 1.5) * 0.3, zone.pos.y + 0.6, zone.pos.z), { valueMul: 1 }));
  await tick(20);
  g.player.inShip = false; g.player.teleport(V(zone.pos.x, zone.pos.y + 0.3, zone.pos.z + 2.5), 0); await tick(6);
  g.net.request('bell'); await tick(4); await sleep(2900); await tick(10, true);
  await shot('ck_loop_sold');
}
// forge only exists at HQ
g.forge?.open?.(); await tick(3, true);
out.forgePanel = panelInfo(); await shot('ck_orbit_forge_hq'); g.ui.closePanel?.(); await tick(2);
out.sold = { ...quota0, after: { quota: g.run.quota, sold: g.run.sold, credits: g.run.credits } };
// quota day: last day at HQ -> take off -> evaluate
g.run.daysLeft = 0;
g.run.sold = Math.max(g.run.sold, g.run.quota + 10);
out.quotaTakeoff = await takeoff();
await sleep(400); await tick(10, true);
await shot('ck_loop_quota');
out.afterQuota = { phase: g.run.phase, quota: g.run.quota, quotaIndex: g.run.quotaIndex, daysLeft: g.run.daysLeft, credits: g.run.credits, cycle: g.run.cycle && { stage: g.run.cycle.stage, sector: g.run.cycle.sector, mode: g.run.cycle.mode } };
out.nanEnd = nanScan('end');
out.errs = newErrs();
return out;
